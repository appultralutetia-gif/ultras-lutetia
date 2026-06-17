// ============================================================
// ULTRAS LUTETIA — Service Worker v2
// ============================================================

const CACHE_NAME = 'ul-v2';

// Fichiers JS/CSS : network-first (toujours la version la plus récente)
const NETWORK_FIRST = [
  '/ultras-lutetia/src/app.js',
  '/ultras-lutetia/src/supabase-client.js',
  '/ultras-lutetia/src/styles.css',
  '/ultras-lutetia/src/config.js',
];

// Fichiers statiques : cache-first
const ASSETS = [
  '/ultras-lutetia/',
  '/ultras-lutetia/index.html',
  '/ultras-lutetia/manifest.webmanifest',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('supabase.co')) return;

  const url = new URL(e.request.url);

  // Network-first pour les fichiers JS/CSS
  if (NETWORK_FIRST.some(p => url.pathname === p)) {
    e.respondWith(
      fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first pour le reste
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      }).catch(() => caches.match('/ultras-lutetia/index.html'));
    })
  );
});
