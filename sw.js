// ============================================================
// ULTRAS LUTETIA — Service Worker v54
// ============================================================
// Historique complet des versions précédentes déplacé vers
// CHANGELOG.md.
//
// v54 (09/07/2026) : CACHE_NAME bumpé (v53 → v54) — "🔍 Vérifier un code
// réabonnement" ouvert au Comité de passage (demande Remi), pas
// seulement Bureau/Admin : bouton ajouté dans la section Comité de
// passage du hub Admin, en plus de Membres. La fonction Postgres
// admin_rechercher_code_reabonnement() revérifiée pour accepter le rôle
// cellule_comite en plus de admin_app/bureau_app (cf. migration_maj_role
// _recherche_code.sql). ⚠️ Nécessite d'exécuter cette migration (après
// migration_admin_recherche_code.sql) avant de déployer index.html.
//
// v53 (09/07/2026) : CACHE_NAME bumpé (v52 → v53) — nouvel outil Bureau/
// Admin "🔍 Vérifier un code réabonnement" (Membres → pageVerifCode) :
// recherche par nom/prénom/email/code dans codes_reabonnement, pour
// confirmer qu'une personne a bien un code sans attendre qu'elle se
// connecte elle-même sur "Mon (ré)abonnement". Passe par la fonction
// Postgres security definer admin_rechercher_code_reabonnement()
// (cf. migration_admin_recherche_code.sql) qui revérifie elle-même le
// rôle Bureau/Admin côté serveur — un appel par un membre non autorisé
// renvoie toujours un tableau vide, jamais une erreur qui confirmerait
// l'existence de la fonction. ⚠️ Nécessite d'exécuter
// migration_admin_recherche_code.sql (après migration_reabonnement_page
// .sql, qui doit déjà avoir été passé) avant de déployer les fichiers
// front.
//
// v52 (09/07/2026) : CACHE_NAME bumpé (v51 → v52) — retrait du bouton
// "J'ai terminé mon (ré)abonnement" sur la page Mon (ré)abonnement
// (demande Remi) : la page se limite maintenant à afficher le/les
// code(s) du membre, sans action de confirmation déclarative. Code mort
// retiré en conséquence : redeemCodeReabonnement (supabase-client.js,
// plus appelée nulle part) et doConfirmerReabonnement (profil.js). La
// fonction Postgres redeem_code_reabonnement() et les colonnes
// utilise/utilise_par/utilise_at restent en base (inoffensives, non
// utilisées) — pas de migration nécessaire pour ce changement, uniquement
// front.
//
// v51 (09/07/2026) : CACHE_NAME bumpé (v50 → v51) — refonte de la
// fonctionnalité "codes de réabonnement" (retour Remi : "je ne vois pas
// les codes") : ce n'est plus au membre de saisir son code — l'app le
// retrouve elle-même (via son email, fonction Postgres security definer
// get_mes_codes_reabonnement) et l'affiche sur une page dédiée "🎫 Mon
// (ré)abonnement", accessible depuis Profil, avec : le lien vers
// https://billetterie.parisfc.fr/fr/access/activation-code (site externe
// où le code sert réellement), le guide PDF fourni par le club
// (guide-code-activation.pdf, nouvel asset statique), et un bouton
// déclaratif "J'ai terminé" qui marque cotisation_a_jour = true (aucune
// vérification automatique possible, pas de connexion à la billetterie
// PFC depuis l'app). Cette page est masquable pour tous en une fois par
// le Bureau/Admin (nouveau bouton dans Membres → "Activer/désactiver
// Réabonnement", table à une ligne parametres_reabonnement) — utile en
// dehors de la période de campagne. ⚠️ Nécessite d'exécuter
// migration_reabonnement_page.sql (après migration_codes_reabonnement
// [_TEST].sql, qui doit déjà avoir été passé) avant de déployer les
// fichiers front.
//
// v50 (09/07/2026) : CACHE_NAME bumpé (v49 → v50) — 3 sujets (demande
// Remi) : (1) Correctif "Impossible de charger les annonces" sur
// Accueil : getAnnonces() précise désormais la contrainte FK exacte
// (membres!annonces_publie_par_fkey) au lieu d'un embed membres(...)
// implicite, même correctif que celui déjà appliqué à
// inscriptions_deplacement/commandes/sticks_distribution — erreur
// PGRST201 "relation ambiguë" si une 2e colonne référençant membres(id)
// existe sur annonces. (2) Demandes d'inscription en attente : valider
// une demande (Sympathisant/Draft/Confirmé) demande maintenant la
// section avant validation — nouvelle petite modale modalValiderDemande,
// section obligatoire, sinon le membre restait sans section jusqu'à une
// modification manuelle ultérieure. (3) Codes de réabonnement (Cartage
// 26-27) : nouveau champ "Code de réabonnement" dans Profil, visible
// uniquement si cotisation_a_jour = false — active le cartage d'un
// membre ayant déjà payé hors app (liste externe de 364 codes,
// cf. migration_codes_reabonnement.sql) sans passer par le flux HelloAsso
// in-app. Vérification (email correspondant, code non déjà utilisé)
// entièrement côté serveur via la fonction Postgres security definer
// redeem_code_reabonnement() — le membre n'a jamais un accès direct à la
// table codes_reabonnement (RLS activé, aucune policy publique, comme
// helloasso_tokens), qui contient les emails de tous les payeurs.
// ⚠️ Nécessite d'exécuter migration_codes_reabonnement.sql AVANT de
// déployer les fichiers front (sinon l'appel RPC échoue, fonction
// inexistante).
//
// v49 (09/07/2026) : CACHE_NAME bumpé (v48 → v49) — réorganisation du hub
// ⚙️ Administration (demande Remi) : (1) sections Calendrier et Charte
// fusionnées dans Membres (même garde isBureau) — un seul bloc avec
// Gérer les membres / Créer un événement / Publier une annonce / Gérer
// le calendrier / Gérer la charte / Gérer le cartage. (2) "Demandes
// d'inscription en attente" déplacé de Membres vers Comité de passage
// (public naturel de cette action). (3) Déplacements : bouton "Créer un
// déplacement" retiré du hub — redondant avec "+ Nouveau déplacement"
// déjà présent en haut de pageDeplacements. (4) Tifos : hub réduit à un
// seul bouton "Gérer les tifos" ; "+ Nouveau tifo" (déjà là), "Modifier
// une session" et "Évaluation membres" regroupés à l'intérieur de
// pageTifos elle-même, sous la même garde hasCelluleTifo. Aucun
// changement de logique métier, uniquement de placement des boutons.
//
// v48 (09/07/2026) : CACHE_NAME bumpé (v47 → v48) — Comité de passage
// (page Membres → onglet Comité) : ajout d'un bouton "✏️ Modifier" sur
// chaque membre non-protégé (Bureau/Admin restent hors de portée, comme
// pour le blocage), ouvrant le modal existant modalEditMembre en mode
// restreint ('comite') : Statut UL, Validé Tifo, Section et Rôles
// Fonctionnels modifiables, identité (prénom/nom/pseudo/email) masquée
// et jamais envoyée modifiée. Rôles Admin App / Bureau retirés de la
// liste dans ce mode — un membre éligible au Comité n'a de toute façon
// jamais l'un de ces deux rôles (sinon protégé), les proposer aurait
// permis au Comité de se créer lui-même un accès Admin/Bureau, jamais
// voulu. admin.js : logique d'ouverture/rôles factorisée dans
// _ouvrirModalEditMembre(m, mode), réutilisée par openEditMembre (page
// Membres, Bureau+, mode 'complet') et la nouvelle openEditMembreComite
// (mode 'comite'). index.html : classe .champ-identite-membre ajoutée
// aux 4 champs d'identité pour permettre leur masquage ciblé en JS.

const CACHE_NAME = 'ul-v54';

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
