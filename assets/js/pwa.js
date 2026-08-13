(function () {
  const isOfflinePage = /(^|\/)offline\.html$/i.test(window.location.pathname);
  const installButtons = Array.from(document.querySelectorAll('[data-pwa-install]'));
  let deferredInstallPrompt = null;
  let installedThisSession = false;
  let instructionDialog = null;
  let previouslyFocusedElement = null;

  function isCapacitorNativeApp() {
    const platform = window.Capacitor?.getPlatform?.();
    return Boolean(
      window.__PREM_PREDICS_CAPACITOR_APP__
      || window.Capacitor?.isNativePlatform?.()
      || platform === 'android'
      || platform === 'ios'
    );
  }

  function isInstalled() {
    return installedThisSession
      || window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches
      || window.navigator.standalone === true
      || isCapacitorNativeApp();
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isFirefox() {
    return /firefox|fxios/i.test(navigator.userAgent);
  }

  function installInstructions() {
    if (isIos()) {
      return {
        title: 'Install Prem Predics on iPhone or iPad',
        message: 'Open Prem Predics in Safari, tap the Share button, choose Add to Home Screen, then tap Add.'
      };
    }

    if (isFirefox()) {
      return {
        title: 'Install Prem Predics',
        message: 'On Android, open the Firefox menu and choose Install. On desktop, open Prem Predics in Chrome or Edge and choose Install Prem Predics from the browser menu.'
      };
    }

    if (/android/i.test(navigator.userAgent)) {
      return {
        title: 'Install Prem Predics on Android',
        message: 'Open your browser menu (⋮), then choose Install app or Add to Home screen.'
      };
    }

    return {
      title: 'Install Prem Predics',
      message: 'Open your browser menu and choose Install Prem Predics or Install app. In Chrome or Edge, an install icon may also appear at the right of the address bar.'
    };
  }

  function ensureInstructionDialog() {
    if (instructionDialog) return instructionDialog;

    const overlay = document.createElement('div');
    overlay.className = 'pwa-install-dialog-backdrop';
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="pwa-install-dialog" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title" aria-describedby="pwa-install-message">
        <h2 id="pwa-install-title"></h2>
        <p id="pwa-install-message"></p>
        <button type="button" class="pwa-install-dialog-close" data-pwa-install-close>Got it</button>
      </section>
    `;

    const closeButton = overlay.querySelector('[data-pwa-install-close]');
    const close = () => {
      overlay.hidden = true;
      previouslyFocusedElement?.focus?.();
    };

    closeButton.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !overlay.hidden) close();
    });

    document.body.appendChild(overlay);
    instructionDialog = { overlay, closeButton };
    return instructionDialog;
  }

  function showInstallInstructions(customInstructions) {
    const instructions = customInstructions || installInstructions();
    const dialog = ensureInstructionDialog();
    dialog.overlay.querySelector('#pwa-install-title').textContent = instructions.title;
    dialog.overlay.querySelector('#pwa-install-message').textContent = instructions.message;
    previouslyFocusedElement = document.activeElement;
    dialog.overlay.hidden = false;
    dialog.closeButton.focus();
  }

  function refreshInstallButtons() {
    const hide = isInstalled();
    installButtons.forEach((button) => {
      button.hidden = hide;
      button.disabled = false;
      button.textContent = deferredInstallPrompt ? 'Install Prem Predics' : 'How to install Prem Predics';
      button.setAttribute('aria-label', button.textContent);
    });
  }

  async function requestInstall() {
    if (isInstalled()) {
      refreshInstallButtons();
      return;
    }

    if (!deferredInstallPrompt) {
      showInstallInstructions();
      return;
    }

    const prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;

    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === 'accepted') {
        installedThisSession = true;
        refreshInstallButtons();
      } else {
        refreshInstallButtons();
      }
    } catch (error) {
      console.warn('Prem Predics install prompt failed:', error);
      refreshInstallButtons();
      showInstallInstructions();
    }
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    refreshInstallButtons();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installedThisSession = true;
    refreshInstallButtons();
  });

  installButtons.forEach((button) => {
    button.addEventListener('click', requestInstall);
  });
  refreshInstallButtons();

  if (!navigator.onLine && !isOfflinePage) {
    window.location.replace('offline.html');
    return;
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    window.addEventListener('load', () => {
      if (isCapacitorNativeApp()) return;

      navigator.serviceWorker.register('service-worker.js', { scope: './' })
        .catch((error) => {
          console.warn('Prem Predics PWA registration failed:', error);
        });
    });
  }

  window.PremPredicsPWA = Object.freeze({
    isInstalled,
    showInstallInstructions
  });
})();
