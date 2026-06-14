(function () {
  const isOfflinePage = /(^|\/)offline\.html$/i.test(window.location.pathname);

  if (!navigator.onLine && !isOfflinePage) {
    window.location.replace('offline.html');
    return;
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch((error) => {
        console.warn('Prem Predics PWA registration failed:', error);
      });
    });
  }
})();
