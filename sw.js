// ============================================================
// ULTRAS LUTETIA — Service Worker v3
// ============================================================
//
// v3 : tous les modules JS de src/ passent en network-first (auparavant
// seuls app.js, supabase-client.js, styles.css, config.js l'étaient —
// calendrier.js, admin.js, tifos.js, deplacements.js, boutique.js,
// profil.js, testable.js restaient en cache-first, donc une mise à jour
// de ces fichiers pouvait ne jamais être reçue par un navigateur qui
// avait déjà installé une version antérieure du Service Worker).
//
// Le fallback de secours en cas d'échec réseau total (catch) ne sert
// plus index.html pour TOUTE ressource indifféremment (bug v2 : une
// image ou un .js manquant retombait sur index.html, ce qui produisait
// un comportement très trompeur en debug — ex: une image cassée donnait
// l'impression d'une "redirection vers l'app"). Il ne sert index.html
// que pour les requêtes de navigation (e.request.mode === 'navigate'),
// jamais pour des assets (images, JS, CSS).

const CACHE_NAME = 'ul-v5';

// Modules JS/CSS : network-first (toujours la version la plus récente,
// avec fallback cache uniquement si le réseau est indisponible).
const NETWORK_FIRST = [
  '/ultras-lutetia/src/app.js',
  '/ultras-lutetia/src/supabase-client.js',
  '/ultras-lutetia/src/styles.css',
  '/ultras-lutetia/src/config.js',
  '/ultras-lutetia/src/tifos.js',
  '/ultras-lutetia/src/deplacements.js',
  '/ultras-lutetia/src/boutique.js',
  '/ultras-lutetia/src/calendrier.js',
  '/ultras-lutetia/src/admin.js',
  '/ultras-lutetia/src/profil.js',
  '/ultras-lutetia/src/testable.js',
];

// Fichiers statiques : cache-first (changent rarement, et un bump de
// CACHE_NAME suffit à les invalider intégralement si besoin).
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

  // Network-first pour tous les modules JS/CSS
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

  // Cache-first pour le reste (HTML statique, manifest, images/logos…)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      }).catch(() => {
        // Fallback de secours uniquement pour une navigation de page
        // (l'utilisateur qui ouvre l'app hors-ligne) — jamais pour un
        // asset individuel (image, script…), pour ne pas masquer une
        // vraie 404/erreur réseau sous un faux comportement de
        // "redirection".
        if (e.request.mode === 'navigate') {
          return caches.match('/ultras-lutetia/index.html');
        }
        return Response.error();
      });
    })
  );
});
