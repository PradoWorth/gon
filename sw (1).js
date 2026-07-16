/* ================================================================
   GON — Service Worker
   ----------------------------------------------------------------
   Estratégia: Cache First para assets estáticos, Network First
   para o index.html (garante que atualizações cheguem ao usuário).

   Ao atualizar o projeto, incremente CACHE_VERSION para que o
   navegador descarte o cache antigo e baixe os arquivos novos.
   ================================================================ */

const CACHE_VERSION = 'gon-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/i18n.js',
  './js/app.js',
  './js/campfire.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
];

/* ---- INSTALL: faz cache de todos os assets na primeira visita ---- */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      /* Ativa imediatamente sem esperar a aba ser fechada */
      return self.skipWaiting();
    })
  );
});

/* ---- ACTIVATE: remove caches de versões antigas ---- */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(key) { return key !== CACHE_VERSION; })
          .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      /* Assume controle de todas as abas abertas imediatamente */
      return self.clients.claim();
    })
  );
});

/* ---- FETCH: decide entre cache e rede por tipo de recurso ---- */
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  /* Ignora requisições que não são GET */
  if (event.request.method !== 'GET') return;

  /* Ignora APIs externas (Anthropic, Spotify, YouTube, etc.) —
     essas nunca devem ser interceptadas pelo SW */
  var externalHosts = [
    'api.anthropic.com',
    'open.spotify.com',
    'www.googleapis.com',
    'accounts.google.com',
    'www.youtube.com',
    'pipedapi.kavin.rocks',
    'pipedapi.drgns.space',
    'pipedapi.adminforge.de',
    'api.piped.private.coffee',
    'invidious.nerdvpn.de',
    'inv.nadeko.net',
  ];
  if (externalHosts.indexOf(url.hostname) !== -1) return;

  /* index.html: Network First — garante que atualizações do site
     cheguem ao usuário; cai no cache se estiver offline */
  if (url.pathname === '/' || url.pathname.endsWith('index.html')) {
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

  /* Fontes do Google: Cache First — mudam raramente, ganho de
     performance grande em conexões lentas */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_VERSION).then(function(cache) {
            cache.put(event.request, clone);
          });
          return response;
        });
      })
    );
    return;
  }

  /* CSS e JS do próprio projeto: Cache First com fallback de rede */
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        /* Só cacheia respostas válidas */
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
