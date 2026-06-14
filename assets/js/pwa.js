(function () {
  const isOfflinePage = /(^|\/)offline\.html$/i.test(window.location.pathname);

  function isCapacitorNativeApp() {
    const platform = window.Capacitor?.getPlatform?.();
    return Boolean(
      window.__PREM_PREDICS_CAPACITOR_APP__
      || window.Capacitor?.isNativePlatform?.()
      || platform === 'android'
      || platform === 'ios'
    );
  }

  if (!navigator.onLine && !isOfflinePage) {
    window.location.replace('offline.html');
    return;
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    window.addEventListener('load', () => {
      if (isCapacitorNativeApp()) {
        return;
      }

      navigator.serviceWorker.register('service-worker.js').catch((error) => {
        console.warn('Prem Predics PWA registration failed:', error);
      });
    });
  }
})();
