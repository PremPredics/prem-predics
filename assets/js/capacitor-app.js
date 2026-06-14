function isCapacitorApp() {
  return Boolean(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.getPlatform?.() === 'android');
}

async function unregisterServiceWorkersForNativeApp() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch (error) {
    console.warn('Prem Predics native app service worker cleanup failed:', error);
  }
}

function focusInputOnFirstTouch() {
  document.addEventListener('touchstart', (event) => {
    const control = event.target?.closest?.('input, textarea, select');
    if (!control || control.disabled || control.readOnly) {
      return;
    }

    if (document.activeElement !== control) {
      window.requestAnimationFrame(() => control.focus({ preventScroll: false }));
    }
  }, { passive: true });
}

async function bindAndroidBackButton() {
  const appPlugin = window.Capacitor?.Plugins?.App;
  if (!appPlugin?.addListener) {
    return;
  }

  await appPlugin.addListener('backButton', ({ canGoBack } = {}) => {
    if (canGoBack || window.history.length > 1) {
      window.history.back();
      return;
    }

    appPlugin.exitApp?.();
  });
}

if (isCapacitorApp()) {
  window.__PREM_PREDICS_CAPACITOR_APP__ = true;
  document.documentElement.classList.add('capacitor-android');
  unregisterServiceWorkersForNativeApp();
  focusInputOnFirstTouch();
  bindAndroidBackButton();
}
