(function () {
  function ensureStyle() {
    if (document.querySelector('[data-pwa-style]')) {
      return;
    }

    const style = document.createElement('style');
    style.dataset.pwaStyle = 'true';
    style.textContent = `
      .pwa-network-banner {
        position: fixed;
        left: max(14px, env(safe-area-inset-left));
        right: max(14px, env(safe-area-inset-right));
        bottom: max(14px, env(safe-area-inset-bottom));
        z-index: 7000;
        width: min(520px, calc(100vw - 28px));
        margin: 0 auto;
        padding: 14px;
        border-radius: 16px;
        color: #fff;
        background:
          radial-gradient(circle at top left, rgba(255,255,255,0.18), transparent 34%),
          linear-gradient(135deg, rgba(46, 16, 102, 0.98), rgba(18, 7, 46, 0.98));
        border: 2px solid rgba(216, 180, 254, 0.55);
        box-shadow: 0 18px 54px rgba(0,0,0,0.46), 0 0 28px rgba(139, 92, 246, 0.34);
        font-family: 'Segoe UI', Arial, sans-serif;
        text-align: center;
      }

      .pwa-network-banner {
        display: none;
        grid-template-columns: 1fr auto;
        gap: 10px;
        align-items: center;
        text-align: left;
      }

      .pwa-network-banner.show {
        display: grid;
      }

      .pwa-network-banner strong {
        color: #facc15;
        font-weight: 950;
        text-shadow:
          -1px -1px 0 rgba(0,0,0,0.86),
          1px -1px 0 rgba(0,0,0,0.86),
          -1px 1px 0 rgba(0,0,0,0.86),
          1px 1px 0 rgba(0,0,0,0.86);
      }

      .pwa-network-banner span {
        color: #ede9fe;
        line-height: 1.35;
      }

      .pwa-action {
        min-height: 42px;
        border: 0;
        border-radius: 10px;
        color: #fff;
        font: inherit;
        font-weight: 950;
        cursor: pointer;
        text-shadow:
          -1px -1px 0 rgba(0,0,0,0.82),
          1px -1px 0 rgba(0,0,0,0.82),
          -1px 1px 0 rgba(0,0,0,0.82),
          1px 1px 0 rgba(0,0,0,0.82);
      }

      .pwa-action.primary {
        background:
          radial-gradient(circle at 25% 15%, rgba(255,255,255,0.7), transparent 20%),
          linear-gradient(135deg, #06b6d4, #2563eb);
        border: 2px solid rgba(165, 243, 252, 0.78);
        box-shadow: 0 0 20px rgba(34, 211, 238, 0.38);
      }

      .pwa-action.secondary {
        background: linear-gradient(135deg, #5b21b6, #8b5cf6);
        border: 2px solid rgba(216, 180, 254, 0.68);
      }

      .pwa-network-banner .pwa-action {
        min-width: 84px;
      }

      @media (max-width: 430px) {
        .pwa-network-banner {
          grid-template-columns: 1fr;
          text-align: center;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createNetworkBanner() {
    ensureStyle();
    let banner = document.querySelector('[data-pwa-network-banner]');
    if (banner) {
      return banner;
    }

    banner = document.createElement('section');
    banner.className = 'pwa-network-banner';
    banner.dataset.pwaNetworkBanner = 'true';
    banner.setAttribute('role', 'status');
    banner.innerHTML = `
      <span><strong>Offline mode.</strong> Cached pages still open. Live league data will sync when your connection returns.</span>
      <button class="pwa-action primary" type="button" data-pwa-retry>Retry</button>
    `;
    banner.querySelector('[data-pwa-retry]')?.addEventListener('click', () => window.location.reload());
    document.body.appendChild(banner);
    return banner;
  }

  function updateNetworkBanner() {
    const banner = createNetworkBanner();
    banner.classList.toggle('show', !navigator.onLine);
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch((error) => {
        console.warn('Prem Predics PWA registration failed:', error);
      });
    });
  }

  window.addEventListener('online', updateNetworkBanner);
  window.addEventListener('offline', updateNetworkBanner);
  window.addEventListener('load', () => {
    updateNetworkBanner();
  });
})();
