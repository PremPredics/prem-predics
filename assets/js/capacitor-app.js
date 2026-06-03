function isCapacitorApp() {
  return Boolean(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.getPlatform?.() === 'android');
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
  document.documentElement.classList.add('capacitor-android');
  focusInputOnFirstTouch();
  bindAndroidBackButton();
}
