const CACHE_VERSION = 'prem-predics-pwa-v13';
const APP_CACHE = `${CACHE_VERSION}-app`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
  './',
  './index.html',
  './login.html',
  './leagues.html',
  './league.html',
  './prediction-hub.html',
  './predictions.html',
  './all-predictions.html',
  './correct-scores.html',
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
  './assets/js/all-predictions.js',
  './assets/js/all-star-men.js',
  './assets/js/capacitor-app.js',
  './assets/js/correct-scores.js',
  './assets/js/countries.js',
  './assets/js/desktop-polish.js',
  './assets/js/desktop-prediction-final-polish.js',
  './assets/js/desktop-summary-polish.js',
  './assets/js/game-card.js',
  './assets/js/gameweek-context.js',
  './assets/js/global-admin.js',
  './assets/js/index-actions.js',
  './assets/js/index-admin.js',
  './assets/js/leaderboard.js',
  './assets/js/league-context.js',
  './assets/js/league.js',
  './assets/js/leagues.js',
  './assets/js/legal-footer.js',
  './assets/js/login.js',
  './assets/js/medals.js',
  './assets/js/prediction-hub.js',
  './assets/js/predictions.js',
  './assets/js/profile.js',
  './assets/js/pwa.js',
  './assets/js/site-auth.js',
  './assets/js/star-man-hub.js',
  './assets/js/star-man.js',
  './assets/js/statistics.js',
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

async function networkFirst(request) {
  try {
    const response = await fetch(request);
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
        cache.addAll(APP_SHELL),
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
