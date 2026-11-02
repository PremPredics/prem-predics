/* Optional feedback only: never participates in saving or card transactions. */
(() => {
  if (window.ppHaptics) return;
  let stopReveal = null;
  const vibrate = pattern => {
    try {
      if (typeof navigator.vibrate !== 'function') return false;
      if (pattern !== 0 && document.visibilityState === 'hidden') return false;
      return navigator.vibrate(pattern);
    } catch { return false; }
  };
  function stop() {
    if (stopReveal) stopReveal();
    else vibrate(0);
  }
  function reveal(element) {
    stopReveal?.();
    if (!element || typeof navigator.vibrate !== 'function' || document.hidden) return () => {};
    let timer, observer, stopped = false;
    const visible = () => element.isConnected && element.classList.contains('show') && !element.hidden && element.getAttribute('aria-hidden') !== 'true';
    const cleanup = () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      observer?.disconnect();
      if (stopReveal === cleanup) stopReveal = null;
      vibrate(0);
    };
    stopReveal = cleanup;
    const pulse = () => {
      if (!visible() || document.hidden) { cleanup(); return; }
      if (!vibrate([35, 85, 35])) cleanup();
    };
    // Repeat at 3s intervals, not a continuous three-second vibration.
    timer = setInterval(pulse, 3000);
    observer = new MutationObserver(() => { if (!visible()) cleanup(); });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'aria-hidden'] });
    if (!visible()) cleanup();
    return cleanup;
  }
  window.ppHaptics = Object.freeze({ success: () => vibrate([30, 60, 45]), reveal, stop });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
})();
