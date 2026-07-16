/* ================================================================
   GON — Service Worker
   ================================================================ */

const CACHE_VERSION = 'gon-v3';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './i18n.js',
  './app.js',
  './campfire.js',
  './auth.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
];

/* ---- INSTALL ---- */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* ---- ACTIVATE: limpa caches antigos ---- */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(key) { return key !== CACHE_VERSION; })
          .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ---- FETCH ---- */
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  /* Ignora não-GET */
  if (event.request.method !== 'GET') return;

  /* Ignora TUDO que não seja do próprio domínio (github.io) —
     isso cobre Firebase, Google Auth, Spotify, YouTube, etc. */
  if (url.origin !== self.location.origin) return;

  /* index.html: sempre busca na rede primeiro */
  if (url.pathname === '/' ||
      url.pathname.endsWith('/gon/') ||
      url.pathname.endsWith('index.html')) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_VERSION).then(function(cache) {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(function() {
          return caches.match('./index.html');
        })
    );
    return;
  }

  /* Demais assets: Cache First com fallback de rede */
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        var clone = response.clone();
        caches.open(CACHE_VERSION).then(function(cache) {
          cache.put(event.request, clone);
        });
        return response;
      });
    })
  );
});
