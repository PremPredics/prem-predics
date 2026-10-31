const CACHE_VERSION = 'prem-predics-pwa-v117';
const APP_CACHE = `${CACHE_VERSION}-app`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
  './assets/js/premium-navigation.js?v=20261031-nav2',
  './assets/css/premium-navigation.css?v=20261031-nav2',
  './assets/js/leaderboard.js?v=20261028-history',
  './assets/js/leaderboard-history.js?v=20261028',
  './assets/js/leaderboard-history-model.js?v=20261028',
  './assets/css/leaderboard-history.css?v=20261028',
  './assets/css/league-navigation.css?v=20261030-restore',
  './assets/css/league-return.css?v=20261027',
  './assets/js/league-return.js?v=20261027-release',
  './assets/js/league.js?v=20261030-restore',
  './assets/js/league-navigation.js?v=20261030-restore',
  './assets/js/notifications.js?v=20261027-no-home-bell',
  './assets/css/notifications.css?v=20261027-clear',
  './assets/js/seasonal-theme.js?v=20261027',
  './assets/css/seasonal-theme.css?v=20261027-orange',
  './assets/css/halloween-choice-panels.css?v=20261030-restore',
  './assets/js/admin-theme.js?v=20261027',
  './assets/js/prediction-kickoff.js',
  './assets/css/predictions-slick.css?v=20261018',
  './awards.html',
  './assets/css/awards.css?v=20261005-champion-final',
  './assets/js/awards.js?v=20261005-champion-final',
  './assets/js/awards-model.js?v=20261005-polish',
  './assets/js/gameweek-context.js?v=20260924-fast',
  './assets/js/deadline-countdown.js',
  './assets/js/page-loader.js?v=20260920-reliable',
  './assets/css/league-pages-polish.css?v=20260912-readable-names',
  './assets/js/card-title.js?v=20260909-centered',
  './assets/css/league-pages-polish.css?v=20260909-centered',
  './assets/css/league-pages-polish.css?v=20261030-restore',
  './',
  './index.html',
  './login.html',
  './reset-password.html',
  './leagues.html',
  './league.html',
  './prediction-hub.html',
  './predictions.html',
  './all-predictions.html',
  './correct-scores.html',
  './live-curses.html',
  './star-man-hub.html',
  './star-man.html',
  './all-star-men.html',
  './leaderboard.html',
  './statistics.html',
  './medals.html',
  './power-cards.html',
  './game-card.html',
  './how-to-play.html',
  './faq.html',
  './terms.html',
  './privacy.html',
  './cookies.html',
  './game-rules.html',
  './contact.html',
  './account-deletion.html',
  './global-admin.html',
  './offline.html',
  './manifest.webmanifest',
  './logo-left.png',
  './assets/icon.png',
  './assets/splash.png',
  './assets/css/legal-pages.css',
  './assets/css/pwa-install.css',
  './assets/css/password-reset.css',
  './assets/css/page-loader.css?v=20261030-restore',
  './assets/css/slick-pages.css?v=20260901-slick-v3',
  './assets/css/hub-return-button.css?v=20260901-v1',
  './assets/css/game-card-slick.css?v=20260920-history',
  './assets/css/leagues-slick.css?v=20260901-v1',
  './assets/css/correct-scores-slick.css?v=20260901-v1',
  './assets/js/all-predictions.js?v=20260924-fast',
  './assets/js/all-star-men.js?v=20260908-player-labels',
  './assets/js/capacitor-app.js',
  './assets/js/correct-scores.js?v=20260908-player-labels',
  './assets/js/countries.js',
  './assets/js/desktop-polish.js',
  './assets/js/desktop-prediction-final-polish.js',
  './assets/js/desktop-summary-polish.js',
  './assets/js/game-card.js?v=20260924-fast',
  './assets/js/game-card-awards.js?v=20260901-v3',
  './assets/js/gameweek-context.js',
  './assets/js/global-admin.js?v=20260828-player-pool',
  './assets/js/index-actions.js?v=20260924-fast',
  './assets/js/index-admin.js?v=20260828-startup-reliability',
  './assets/js/async-read.js',
  './assets/js/load-all-rows.js',
  './assets/js/player-stats-pool.js',
  './assets/js/session-user.js',
  './assets/js/leaderboard.js?v=20260903-tiebreak-v2',
  './assets/js/league-context.js',
  './assets/js/live-curses.js?v=20260901-vetoed-v1',
  './assets/js/live-curses-model.js?v=20260901-vetoed-v1',
  './assets/js/medal-progress.js',
  './assets/js/leagues.js',
  './assets/js/legal-footer.js',
  './assets/js/login.js?v=20260820-username-28',
  './assets/js/medals.js?v=20260831-football-loader-v1',
  './assets/js/page-loader.js?v=20260920-adaptive',
  './assets/js/prediction-hub.js',
  './assets/js/predictions.js?v=20261018-kickoff',
  './assets/js/profile.js?v=20260826-account-profile-cache',
  './assets/js/pwa.js',
  './assets/js/pwa.js?v=20261030-restore',
  './assets/js/pwa.js?v=20261027-home-centred',
  './assets/js/reset-password.js',
  './assets/js/site-auth.js?v=20260828-startup-reliability',
  './assets/js/star-man-hub.js',
  './assets/js/star-man.js?v=20260908-browse-75',
  './assets/js/statistics.js?v=20260831-slick-v1',
  './assets/js/supabase-client.js',
  './assets/js/ui-polish.js',
  './assets/js/wider-polish.js',
  './assets/pwa/apple-touch-icon.png',
  './assets/pwa/favicon-16.png',
  './assets/pwa/favicon-32.png',
  './assets/pwa/icon-192.png',
  './assets/pwa/icon-512.png',
  './assets/pwa/maskable-192.png',
  './assets/pwa/maskable-512.png'
];

const SAFE_STATIC_HOSTS = new Set([
  'cdn.jsdelivr.net'
]);

const OPTIONAL_STATIC_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
];

function isSupabaseOrApi(url) {
  return url.hostname.includes('supabase.co')
    || url.pathname.includes('/auth/v1/')
    || url.pathname.includes('/rest/v1/')
    || url.pathname.includes('/storage/v1/')
    || url.pathname.includes('/functions/v1/');
}

function isDocumentRequest(request) {
  return request.mode === 'navigate'
    || request.headers.get('accept')?.includes('text/html');
}

function isPasswordResetDocument(url) {
  return url.origin === self.location.origin
    && url.pathname.endsWith('/reset-password.html');
}

function isLocalAppAsset(url) {
  if (url.origin !== self.location.origin) {
    return false;
  }

  return /\.(?:css|js|html|webmanifest)$/i.test(url.pathname);
}

async function putInCache(cacheName, request, response) {
  if (!response || (!response.ok && response.type !== 'opaque')) {
    return;
  }

  const cache = await caches.open(cacheName);
  await cache.put(request, response);
}

async function networkFirstDocument(request) {
  try {
    const response = await fetch(request);
    await putInCache(RUNTIME_CACHE, request, response.clone());
    return response;
  } catch {
    return caches.match('./offline.html');
  }
}

async function sensitiveDocument(request) {
  try {
    return await fetch(request, { cache: 'no-store' });
  } catch {
    const cachedResetPage = await caches.match('./reset-password.html');
    return cachedResetPage || caches.match('./offline.html');
  }
}

async function networkFirst(request) {
  // All precached assets belong to this release: do not redownload
  // every module before each navigation (especially expensive on mobile).
  {
    const releaseCache = await caches.open(APP_CACHE);
    const releaseAsset = await releaseCache.match(request);
    if (releaseAsset) return releaseAsset;
  }
  try {
    // Local app assets can retain the same URL across a hotfix. Bypass the
    // browser HTTP cache so the service worker always checks the deployed file
    // before falling back to its offline cache.
    const response = await fetch(request, { cache: 'no-store' });
    await putInCache(RUNTIME_CACHE, request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match('./offline.html');
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetched = fetch(request)
    .then((response) => {
      putInCache(RUNTIME_CACHE, request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || fetched;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => Promise.all([
        cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' }))),
        cache.addAll(OPTIONAL_STATIC_ASSETS).catch(() => null)
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* safe generic fallback */ }
  event.waitUntil(self.registration.showNotification('Prem Predics', {
    body: typeof payload.body === 'string' ? payload.body.slice(0,250) : 'Open Prem Predics for your gameweek update.',
    icon: new URL('assets/pwa/icon-192.png',self.registration.scope).href,
    badge: new URL('assets/pwa/favicon-32.png',self.registration.scope).href,
    tag: typeof payload.tag === 'string' ? payload.tag : 'prem-predics-gameweek',
    renotify: false,
    data: {url: new URL('index.html',self.registration.scope).href},
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target=new URL('index.html',self.registration.scope).href;
  event.waitUntil((async () => {
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>client.url===target);
    if (existing) return existing.focus();
    return self.clients.openWindow(target);
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (isSupabaseOrApi(url)) {
    return;
  }

  if (url.origin !== self.location.origin && !SAFE_STATIC_HOSTS.has(url.hostname)) {
    return;
  }

  if (isDocumentRequest(request) && isPasswordResetDocument(url)) {
    event.respondWith(sensitiveDocument(request));
    return;
  }

  if (isDocumentRequest(request)) {
    event.respondWith(networkFirstDocument(request));
    return;
  }

  if (isLocalAppAsset(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
