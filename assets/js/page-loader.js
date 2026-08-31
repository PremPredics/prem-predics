let loader = null;
let progress = 4;
let progressTimer = null;
let safetyTimer = null;
let startedAt = 0;
let finishPromise = null;

function labelText() {
  return document.body?.dataset.pageLoaderTitle || 'Loading Page...';
}

function ensureLoader() {
  if (loader || !document.body?.classList.contains('pp-page-loading')) return loader;

  loader = document.createElement('div');
  loader.className = 'pp-page-loader';
  loader.dataset.pageLoader = 'true';
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');
  loader.innerHTML = `
    <section class="pp-page-loader-card">
      <strong class="pp-page-loader-title" data-page-loader-title></strong>
      <div class="pp-page-loader-course">
        <div class="pp-page-loader-track" role="progressbar" aria-label="Page loading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="4" data-page-loader-progress>
          <span class="pp-page-loader-fill"></span>
          <span class="pp-page-loader-ball" aria-hidden="true">&#9917;</span>
        </div>
        <span class="pp-page-loader-goal" aria-hidden="true"></span>
      </div>
      <span class="pp-page-loader-percent" data-page-loader-percent>4%</span>
    </section>`;
  loader.querySelector('[data-page-loader-title]').textContent = labelText();
  document.body.prepend(loader);
  return loader;
}

export function setPageLoaderProgress(value) {
  const element = ensureLoader();
  if (!element) return;
  progress = Math.max(progress, Math.min(100, Math.round(Number(value) || 0)));
  element.style.setProperty('--pp-progress', `${progress}%`);
  element.style.setProperty('--pp-ball-rotation', `${progress * 4}deg`);
  element.classList.toggle('is-near-goal', progress >= 74);
  element.querySelector('[data-page-loader-progress]')?.setAttribute('aria-valuenow', String(progress));
  const percent = element.querySelector('[data-page-loader-percent]');
  if (percent) percent.textContent = `${progress}%`;
  element.setAttribute('aria-label', `${labelText()} ${progress}%`);
}

export function startPageLoader() {
  if (!ensureLoader() || progressTimer) return;
  startedAt = performance.now();
  setPageLoaderProgress(8);
  progressTimer = window.setInterval(() => {
    if (progress < 44) setPageLoaderProgress(progress + 3);
    else if (progress < 72) setPageLoaderProgress(progress + 2);
    else if (progress < 92) setPageLoaderProgress(progress + 1);
  }, 180);
  safetyTimer = window.setTimeout(() => finishPageLoader(), 25000);
}

export function finishPageLoader() {
  if (finishPromise) return finishPromise;
  const element = ensureLoader();
  if (!element) {
    document.body?.classList.remove('pp-page-loading');
    return Promise.resolve();
  }

  finishPromise = (async () => {
    const minimumVisibleMs = 620;
    const elapsed = performance.now() - startedAt;
    if (elapsed < minimumVisibleMs) {
      await new Promise((resolve) => window.setTimeout(resolve, minimumVisibleMs - elapsed));
    }
    window.clearInterval(progressTimer);
    window.clearTimeout(safetyTimer);
    setPageLoaderProgress(100);
    element.classList.add('is-near-goal', 'is-scored');
    await new Promise((resolve) => window.setTimeout(resolve, 480));
    document.body?.classList.remove('pp-page-loading');
    element.classList.add('is-complete');
    await new Promise((resolve) => window.setTimeout(resolve, 320));
    element.hidden = true;
  })();

  return finishPromise;
}

startPageLoader();
