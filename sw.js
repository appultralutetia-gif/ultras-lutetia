// ============================================================
// ULTRAS LUTETIA — Service Worker v14
// ============================================================
//
// v14 (05/07/2026) : CACHE_NAME bumpé (v13 → v14) suite à (1) l'agrandissement
// du bandeau de navigation en bas (styles.css, --nav-h 64px → 80px, icônes et
// texte légèrement agrandis) ; (2) l'introduction des rôles "distributeur"
// (distributeur_depl / distributeur_matos / distributeur_sticks) — un
// distributeur n'a accès qu'au scan QR (présence/retrait/remise), pas à la
// création/édition réservée à la cellule correspondante (src/app.js,
// nouvelles fonctions hasDistributeurDepl/Matos/Sticks + boutons de scan
// reconditionnés dessus ; src/admin.js, 3 nouvelles entrées dans ROLES_DEFS
// pour assigner ces rôles depuis la fiche membre).
//
// v13 (27/06/2026) : ajout des écouteurs 'push' et 'notificationclick'
// (infrastructure notifications push — cf. supabase-client.js section
// NOTIFICATIONS PUSH, et l'Edge Function send-push-notification à déployer
// séparément, cf. GUIDE_NOTIFICATIONS_PUSH.md). CACHE_NAME bumpé (v12 → v13)
// par précaution comme à chaque mise à jour de ce fichier, même si ces
// deux écouteurs n'affectent pas la logique de cache existante.
//
// v12 (24/06/2026) : CACHE_NAME bumpé (v11 → v12) suite à l'exploitation
// de la colonne present_at (déjà existante, déjà mise à jour par le scan
// QR via confirmerPresenceDeplacement) côté affichage src/deplacements.js
// — jusqu'ici aucune carte ni liste ne lisait cette colonne : (1) badge
// "✅ Présent" / "⏳ Pas encore présent" ajouté à côté du badge "✅ Payé"
// sur la carte de liste (renderDeplCard), affiché seulement une fois le
// paiement confirmé ; (2) liste "Inscrits" (voirInscritsDepl, désormais
// scindée en renderListeInscritsDepl pour permettre le filtrage sans
// recharger) enrichie d'un badge présence par ligne et de 3 boutons filtre
// Tous / Présents / Absents — "Absents" ne porte que sur les inscrits
// payés (un non-payé n'a jamais pu être scanné présent, le scan bloque
// sans paiement confirmé sauf force=true côté admin). Fichier modifié :
// src/deplacements.js, déjà en NETWORK_FIRST.
//
// v11 (24/06/2026) : CACHE_NAME bumpé (v10 → v11) suite à l'ajout de la
// modification (édition complète) pour 4 modules qui n'en disposaient pas
// encore : Déplacements (nouveau modal modalModifierDepl, deux modals
// séparés comme pour les sessions tifo), Matchs (3e mode ajouté au modal
// modalMatchs à swap dynamique, aux côtés d'ajout et de confirmation de
// date), Matos (modal modalCreerProduit basculé en mode édition via swap
// titre/bouton, nouvelle fonction updateProduit déjà existante côté
// supabase-client.js réutilisée), Sticks (modal modalCreerStick basculé en
// mode édition, nouvelles fonctions updateStick/exportées). Bouton
// "Modifier" accessible à la fois depuis la carte de liste et la modal de
// détail pour Déplacements ; depuis la carte calendrier et l'admin pour
// Matchs ; depuis la carte catalogue pour Matos et Sticks. Fichiers
// modifiés : index.html, src/admin.js, src/boutique.js, src/calendrier.js,
// src/deplacements.js, src/supabase-client.js — tous déjà en NETWORK_FIRST.
//
// v10 (24/06/2026) : CACHE_NAME bumpé (v9 → v10) suite à la correction
// d'un bug PGRST201 dans src/supabase-client.js : getDeplacement() (la
// fonction singulier, utilisée par voirInscritsDepl/openDepl) faisait un
// embed implicite membre:membres(...) sur inscriptions_deplacement, table
// qui possède DEUX clés étrangères vers membres depuis l'ajout de la
// colonne valide_par le 24/06/2026 (membre_id et valide_par) — PostgREST
// ne pouvait plus deviner laquelle utiliser et renvoyait une erreur
// PGRST201 (relation ambiguë), absorbée silencieusement par le code
// existant (`inscrits || []`), si bien que la liste "Inscrits" d'un
// déplacement restait vide même quand des inscriptions existaient bel et
// bien en base (confirmé manuellement : un membre payé via HelloAsso en
// sandbox n'apparaissait pas dans sa propre liste d'inscrits). Corrigé en
// précisant explicitement la contrainte à suivre :
// membres!inscriptions_deplacement_membre_id_fkey(...) — syntaxe déjà
// utilisée correctement ailleurs dans le fichier pour des tables au même
// problème potentiel (evaluations, sticks_distribution), seul ce point
// précis avait été oublié au moment de l'ajout de valide_par.
//
// v9 (24/06/2026) : CACHE_NAME bumpé (v8 → v9) suite à une troisième vague
// de modifications : (1) bouton M'inscrire/statut paiement directement sur
// la carte de la liste Déplacements (plus besoin d'ouvrir la modal pour
// voir son statut) — nécessite que getDeplacements() (supabase-client.js)
// calcule désormais _inscrits et monInscrit pour chaque déplacement, ce
// qui corrige au passage un bug latent où la barre de places affichait
// toujours 0 ; (2) bouton "Voir le déplacement" sur la carte d'un match
// extérieur du calendrier, visible seulement si un déplacement existe pour
// ce match (calendrier.js, nouvelle map depParMatchId) ; (3) réorganisation
// de l'accueil (app.js, index.html) : Prochain match domicile → Prochain
// match extérieur → Prochain déplacement → Prochaine session tifo → Mes
// stats. Fichiers modifiés : index.html, src/app.js, src/calendrier.js,
// src/deplacements.js, src/supabase-client.js — tous déjà en NETWORK_FIRST.
//
// v8 (24/06/2026) : CACHE_NAME bumpé (v7 → v8) suite à une deuxième vague
// de modifications sur le même chantier que la v7 (formulaire Création
// déplacement) : correction du bug cree_par (colonne manquante, ajoutée
// en base), ajout du champ Lien Telegram du déplacement (affiché côté
// membre uniquement une fois le paiement confirmé), pré-remplissage de
// la Ville à partir du stade (table de correspondance stade→ville côté
// JS), et passage du Point de RDV en liste déroulante (Charléty / Porte
// de Versailles / Autre, avec champ libre si Autre). Modifications dans
// index.html et src/deplacements.js, tous deux déjà en NETWORK_FIRST.
//
// v7 (24/06/2026) : CACHE_NAME bumpé (v6 → v7) suite à la modification de
// index.html (nouveau modal Création déplacement : sélecteur Source
// match du calendrier / autre événement, dropdown matchs, suppression du
// champ Lien HelloAsso) et de src/deplacements.js (ouvrirCreerDepl,
// onChangeSourceDepl, onChangeMatchDepl, doCreerDepl mis à jour). index.html
// et deplacements.js étant tous les deux en NETWORK_FIRST depuis la v6,
// ce bump n'est pas strictement nécessaire pour qu'un navigateur les
// récupère — mais il invalide immédiatement le reste du cache (cache-first)
// par précaution, et donne un repère de version clair en cas de débogage.
//
// v6 (21/06/2026) : ajout de src/scan.js à NETWORK_FIRST (nouveau fichier,
// composant scan QR membre — oublié de la liste lors de son introduction,
// ce qui empêchait toute mise à jour de ce fichier d'être reçue par un
// navigateur ayant déjà installé une version antérieure du Service
// Worker — exactement le bug déjà documenté et corrigé en v3 pour les
// autres modules, reproduit par oubli sur un fichier ajouté après coup).
//
// index.html passe également en network-first (auparavant en cache-first
// via ASSETS) — c'est lui qui référence tous les <script src="...">,
// donc le laisser en cache-first pouvait empêcher un navigateur de
// jamais découvrir l'ajout d'un nouveau fichier JS (comme scan.js),
// même après que ce fichier ait été correctement ajouté à NETWORK_FIRST
// dans une future mise à jour — le bug se reproduirait alors silencieusement
// à chaque nouveau fichier ajouté au projet.
//
// CACHE_NAME bumpé (v5 → v6) pour invalider immédiatement l'ancien cache
// (notamment l'ancien index.html figé sans <script src="src/scan.js">,
// qui ne se serait jamais mis à jour seul même avec les correctifs
// ci-dessus, puisque l'ancien Service Worker lui-même devait être remplacé).
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

const CACHE_NAME = 'ul-v14';

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
    icon: '/ultras-lutetia/icons/icon-192.png',
    badge: '/ultras-lutetia/icons/icon-192.png',
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
