// ============================================================
// ULTRAS LUTETIA — Service Worker v46
// ============================================================
// Historique complet des versions précédentes déplacé vers
// CHANGELOG.md.
//
// v46 (08/07/2026) : CACHE_NAME bumpé (v45 → v46) — 2 optimisations
// trouvées en revue : (1) la pop-up de confirmation de paiement au
// retour de HelloAsso dépendait uniquement du localStorage pour
// retrouver quel article était concerné — pas garanti à 100% de survivre
// l'aller-retour cross-domaine sur tous les navigateurs (Safari iOS
// notamment). Le type + l'id sont désormais encodés directement dans
// l'URL de retour générée par l'Edge Function, bien plus fiable ; le
// localStorage reste un repli pour compatibilité. (2) La pop-up "articles
// disponibles" refaisait 2 requêtes réseau à CHAQUE ouverture de l'app,
// pour tout le monde — throttle ajouté à 10 minutes minimum entre deux
// vérifications. ⚠️ Nécessite de redéployer helloasso-create-checkout.
//
// v45 (08/07/2026) : CACHE_NAME bumpé (v44 → v45) — suppression de
// sInscrireDeplacements (code mort, ancienne inscription gratuite sans
// paiement, jamais appelée depuis l'intégration HelloAsso). Push et
// pop-up "articles disponibles" gardés tous les deux intentionnellement
// (redondance voulue par Remi).
//
// v44 (08/07/2026) : CACHE_NAME bumpé (v43 → v44) — gros lot de demandes
// Remi : (1) Notification push envoyée au membre dès qu'un admin marque
// sa précommande "reçue" (Matos + Sticks, individuel et en masse) — la
// notif la plus utile ("viens le récupérer"), absente jusqu'ici.
// (2) getAllCommandes() plafonné à 300 lignes (limit), comme Sticks déjà
// à 100 — évite que la page Gestion ralentisse avec la croissance du
// volume de commandes. (3) Les ~21 requêtes restantes sans vérification
// d'erreur dans supabase-client.js ont été auditées et corrigées (échecs
// désormais visibles au lieu de retourner [] en silence). (4) Nouvelle
// pop-up de confirmation du statut de paiement au retour de HelloAsso
// (annulé/erreur/payé/refusé) — l'Edge Function helloasso-create-checkout
// renvoie maintenant l'id de la ligne créée (commandeId/distribId/
// paiementId/inscriptionId) pour un suivi précis, pas une déduction par
// recency. (5) Nouvelle pop-up de rappel "articles disponibles" à
// l'ouverture de l'app (Matos + Sticks), pour les membres qui n'ont pas
// activé les notifications push ou les ont manquées — ne se répète
// jamais deux fois pour le même article (mémorisé en localStorage).
// ⚠️ Nécessite de redéployer l'Edge Function helloasso-create-checkout.
//
// v43 (08/07/2026) : CACHE_NAME bumpé (v42 → v43) — nouveau jeu de
// favicons fourni par Remi (crest Paris FC), remplace l'ancien
// manifest.webmanifest qui pointait vers icons/icon-192.png /
// icons/icon-512.png — fichiers qui n'ont jamais existé (erreur "Download
// error or resource isn't a valid image" déjà repérée dans la console
// pendant une session précédente). Corrigé au passage : l'icône/badge des
// notifications push pointait vers ce même chemin cassé — mis à jour
// vers le nouveau fichier valide.
//
// v42 (07/07/2026) : CACHE_NAME bumpé (v41 → v42) — 4 correctifs/
// harmonisations : (1) bouton "Annuler" ajouté côté Sticks (Commandes en
// cours), asymétrie avec Matos qui l'avait déjà. (2) Notification push
// envoyée au membre à la confirmation d'un paiement HelloAsso (Matos,
// Sticks, Cartage, Déplacements) — jusqu'ici le webhook ne notifiait
// jamais, il fallait rouvrir l'app pour savoir si le paiement avait
// abouti. (3) Note d'architecture ajoutée dans supabase-client.js
// documentant la divergence de modèles Matos/Sticks/Cartage, pour éviter
// que de futures fonctionnalités soient oubliées sur l'un des 3 comme
// c'est arrivé plusieurs fois aujourd'hui. (4) Historique du changelog
// déplacé vers CHANGELOG.md (ce fichier-ci ne contient plus que la
// version courante).

const CACHE_NAME = 'ul-v46';

// Modules JS/CSS + index.html : network-first (toujours la version la
// plus récente, avec fallback cache uniquement si le réseau est
// indisponible).
const NETWORK_FIRST = [
  '/ultras-lutetia/',
  '/ultras-lutetia/index.html',
  '/ultras-lutetia/src/app.js',
  '/ultras-lutetia/src/supabase-client.js',
  '/ultras-lutetia/src/styles.css',
  '/ultras-lutetia/src/config.js',
  '/ultras-lutetia/src/tifos.js',
  '/ultras-lutetia/src/deplacements.js',
  '/ultras-lutetia/src/scan.js',
  '/ultras-lutetia/src/boutique.js',
  '/ultras-lutetia/src/calendrier.js',
  '/ultras-lutetia/src/admin.js',
  '/ultras-lutetia/src/profil.js',
  '/ultras-lutetia/src/testable.js',
];

// Pré-cache à l'installation + fallback offline pour la navigation (cf.
// catch plus bas) — / et index.html sont désormais en network-first
// (cf. NETWORK_FIRST ci-dessus) pour la mise à jour normale ; ils restent
// listés ici uniquement pour qu'une version soit disponible en cache si
// jamais le réseau est indisponible au moment du premier chargement.
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

// ── Notifications push ──────────────────────────────────────
// Réception d'une notification envoyée par l'Edge Function
// send-push-notification (cf. supabase-client.js → envoyerNotificationPush).
// Le payload attendu est un JSON { titre, corps, url }. showNotification()
// est OBLIGATOIRE ici (userVisibleOnly:true côté abonnement, cf.
// activerNotificationsPush) — un push reçu sans notification visible
// affichée expose au risque que le navigateur désactive silencieusement
// les futurs push pour cette app.
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { /* payload non-JSON, ignoré */ }
  const titre = data.titre || 'Ultras Lutetia';
  const options = {
    body: data.corps || '',
    icon: '/ultras-lutetia/web-app-manifest-192x192.png',
    badge: '/ultras-lutetia/web-app-manifest-192x192.png',
    data: { url: data.url || '/ultras-lutetia/' },
  };
  e.waitUntil(self.registration.showNotification(titre, options));
});

// Clic sur la notification (depuis le centre de notifications du téléphone,
// app fermée ou en arrière-plan) : ouvre l'app sur l'URL fournie, ou
// réutilise un onglet déjà ouvert si un existe déjà plutôt que d'en
// ouvrir un nouveau.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/ultras-lutetia/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      const dejaOuvert = clientsArr.find(c => c.url.includes('/ultras-lutetia/'));
      if (dejaOuvert) return dejaOuvert.focus();
      return self.clients.openWindow(url);
    })
  );
});
