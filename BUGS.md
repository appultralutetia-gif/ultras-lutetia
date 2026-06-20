# JOURNAL DE BUGS — Ultras Lutetia PWA

*Ce fichier recense les bugs identifiés et corrigés, avec la cause exacte et le fix appliqué. Objectif : éviter de redécouvrir les mêmes pièges dans une session future. Mis à jour à chaque nouveau bug traité.*

---

## 1. Login par pseudo Telegram échoue malgré un compte existant

**Symptôme** : `loginByTelegram('Remi VF', ...)` retourne "Pseudo Telegram introuvable" alors que le compte existe bien en base avec exactement ce pseudo.

**Cause** : `.eq('pseudo_telegram', pseudo)` dans `loginByTelegram()` et `getMembreByTelegram()` est une comparaison PostgreSQL **strictement sensible à la casse**. Toute variation de casse, d'espace multiple, ou d'espace insécable (souvent collé depuis Telegram) fait échouer le match.

**Fix** (`src/supabase-client.js`) :
- Ajout d'un helper `normalizePseudo()` : retire `@`, normalise les espaces (insécables/multiples → simple), trim.
- `.eq()` → `.ilike()` (insensible à la casse) pour `loginByTelegram()` et `getMembreByTelegram()`.
- `inscription()` normalise aussi le pseudo à l'écriture, pour éviter les doublons de casse à la création de compte.
- `.single()` → `.maybeSingle()` dans `getMembreByTelegram()` pour ne pas throw sur 0 résultat.

**Fichiers concernés** : `src/supabase-client.js`

---

## 2. Login bloqué par RLS — lecture anonyme impossible

**Symptôme** : après le fix #1, toujours "introuvable", mais cette fois la requête réseau retourne `200` avec un tableau vide `[]`.

**Cause** : Row Level Security (RLS) activé sur la table `membres`, avec une policy `SELECT` réservée au rôle `authenticated`. Au moment du login, le client est encore en rôle `anon` (pas encore connecté) — RLS bloque silencieusement la lecture avant même que `.ilike()` ne s'applique. Problème structurel : il faut lire `membres` pour se connecter, mais il faut être connecté pour lire `membres`.

**Fix** : création d'une Edge Function Supabase `resolve-pseudo` qui utilise `ctx.supabaseAdmin` (bypass RLS, côté serveur uniquement) pour résoudre `pseudo_telegram → email`, sans jamais exposer de clé privilégiée au client. Ne renvoie QUE l'email (jamais id/statut/rôles). `loginByTelegram()` appelle cette fonction au lieu de lire `membres` directement.

**Fichiers concernés** : `supabase/functions/resolve-pseudo/index.ts` (nouveau), `src/supabase-client.js`

---

## 3. Edge Function avec withSupabase — pièges de configuration

Plusieurs sous-bugs rencontrés en mettant en place `resolve-pseudo` avec le pattern moderne `withSupabase` de `@supabase/server` :

### 3a. `auth: ["publishable"]` au lieu de `auth: 'publishable'`
Le mode auth attend une **string**, pas un tableau à un élément. Avec un tableau, rejet 401 "Invalid credentials" avant même d'atteindre le code.

### 3b. Clé envoyée dans le mauvais header
`withSupabase` attend la clé API dans le header **`apikey`**, jamais dans `Authorization: Bearer ...` (ça c'est réservé au JWT de session utilisateur). Envoyer la clé en `Authorization` → 401 "Invalid credentials".

### 3c. `verify_jwt` (vérification JWT plateforme) non désactivé
Pour toute fonction utilisant `auth: 'publishable'`, `'secret'`, ou `'none'`, il faut désactiver "Verify JWT with legacy secret" dans les Settings de la fonction (Dashboard Supabase). Sinon rejet **avant même** `withSupabase`, avec `{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}`.

### 3d. Clé legacy JWT incompatible avec withSupabase
`withSupabase({auth:'publishable'})` ne reconnaît PAS l'ancien format de clé anon (JWT `eyJ...`). Il faut la clé moderne au format `sb_publishable_...` (Project Settings → API Keys → Publishable key). Les deux formats coexistent sur un même projet ; il faut utiliser le bon selon le contexte :
- `SUPABASE_ANON_KEY` (legacy JWT) → appels PostgREST classiques (`sb.from(...)`)
- `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`) → appels aux Edge Functions via `withSupabase`

**Fichiers concernés** : `supabase/functions/resolve-pseudo/index.ts`, `src/supabase-client.js` (deux constantes de clé séparées, à ne pas confondre)

---

## 4. Cache du Service Worker masque les déploiements

**Symptôme récurrent** : un fichier corrigé et pushé sur GitHub ne produit aucun changement visible côté utilisateur — l'app se comporte comme avec l'ancienne version.

**Cause** : `sw.js` sert `index.html` (et d'autres assets) en **cache-first**. Le navigateur ne revérifie jamais le réseau pour ces fichiers tant que `CACHE_NAME` ne change pas. Un simple hard refresh ne suffit pas toujours si le Service Worker actif est lui-même périmé — il faut parfois le désinscrire complètement (DevTools → Application → Service Workers → Unregister) pour forcer un rechargement 100% réseau.

**Fix appliqué une fois** : bump `CACHE_NAME` de `ul-v2` → `ul-v3` (force un cycle install/activate complet, purge l'ancien cache).

**⚠️ Point de vigilance permanent** : penser à bumper `CACHE_NAME` dans `sw.js` à chaque déploiement qui touche `index.html` ou un fichier en cache-first, sinon prévoir de désinscrire le SW manuellement pour tester. `supabase-client.js`, `app.js`, `styles.css`, `config.js` sont en `NETWORK_FIRST` (pas concernés) ; `index.html` et `manifest.webmanifest` sont en cache-first (`ASSETS`) — donc particulièrement sensibles à ce problème.

**Fichiers concernés** : `sw.js`

---

## 5. Page "mot de passe oublié" : modal de reset jamais affiché

Plusieurs sous-bugs en cascade pour cette fonctionnalité :

### 5a. Détection du hash d'URL non fiable
Lire `window.location.hash` manuellement pour détecter `type=recovery` est une course perdue : le SDK supabase-js parse et nettoie le hash automatiquement, souvent avant que le code applicatif n'ait la main.

**Fix** : écouter `sb.auth.onAuthStateChange()` et réagir à l'événement `PASSWORD_RECOVERY`, émis de façon fiable par le SDK peu importe le timing.

### 5b. Crash silencieux sur accès DOM trop précoce
Le listener `onAuthStateChange` est attaché dès l'exécution de `supabase-client.js`, qui peut tourner **avant** que le HTML du `<body>` soit entièrement parsé. Accéder directement à `document.getElementById('resetMdpNew').value = ''` plantait avec `TypeError: Cannot set properties of null`, qui interrompait silencieusement tout le callback (pas d'erreur visible pour l'utilisateur, juste un retour au comportement par défaut).

**Fix** : `appliquerAffichageResetMdp()` vérifie l'existence de chaque élément DOM avant d'agir, retourne `false` si pas prêt. Un flag `recoveryEnAttente` capture l'événement même s'il arrive trop tôt, et `DOMContentLoaded` rejoue l'affichage une fois le DOM garanti complet.

### 5c. Logique de timing fragile avec timer arbitraire
Une première version utilisait un `setTimeout` de 1500ms pour "laisser le temps" au SDK de traiter le hash, avec une double vérification du flag à deux endroits différents (`return` prématurés). Ça créait des trous de timing où le spinner de chargement restait affiché indéfiniment.

**Fix** : suppression du timer arbitraire. `await UL.initSession()` (qui appelle `sb.auth.getSession()`) attend déjà nativement que le SDK ait fini de traiter la session — pas besoin de deviner un délai. Un seul point de vérité (`recoveryEnAttente` + `appDejaInitialisee`), vérifié une seule fois après l'`await`.

### 5d. Lien de reset expiré pendant les tests
Plusieurs tests successifs avec attentes/refresh ont fait expirer le lien email en cours de route. Symptôme : hash final contient `#error=...has+expired` au lieu de `access_token`/`type=recovery` — aucune erreur JS, mais `PASSWORD_RECOVERY` n'est jamais émis, et l'utilisateur atterrit connecté normalement (session précédente toujours active en localStorage).

**Point de vigilance** : toujours tester avec un lien **fraîchement généré**, cliqué immédiatement, pour éliminer cette variable lors du diagnostic.

### 5e. Cache Service Worker (même cause que bug #4)
Une fois la logique JS corrigée, le modal ne s'affichait toujours pas car `index.html` servait une version en cache **sans** le modal `modalResetMdp` ni les champs associés — confirmé en testant `document.getElementById('resetMdpNew')` dans la console, qui retournait `null` malgré un fichier GitHub correct. Résolu en désinscrivant le Service Worker.

**Fichiers concernés** : `src/app.js`, `src/supabase-client.js`, `index.html`

---

## 6. Double vérification pseudo + email pour le reset de mot de passe

**Contexte** (pas un bug, une amélioration de sécurité) : initialement, le reset de mot de passe ne demandait que le pseudo Telegram (visible publiquement dans l'app) pour déclencher l'envoi d'un email — un tiers connaissant juste le pseudo d'un membre aurait pu spammer son compte d'emails de reset.

**Fix** : `resolve-pseudo` accepte un champ `email` optionnel. S'il est fourni (cas du reset), la fonction exige que pseudo ET email correspondent au même membre avant de renvoyer l'email — sinon réponse 404 générique. Si absent (cas du login normal), comportement inchangé. Le message de succès côté client est volontairement identique en cas de match ou non-match, pour ne rien révéler (anti-énumération de comptes).

**Fichiers concernés** : `supabase/functions/resolve-pseudo/index.ts`, `src/supabase-client.js`, `index.html` (champ email ajouté au modal), `src/app.js`

---

## Pièges génériques à garder en tête

- **Toujours vérifier le Network tab (status + body de réponse)** avant de supposer la cause d'un échec d'auth — un message client générique ("introuvable", "identifiants incorrects") peut masquer des causes très différentes (normalisation, RLS, format de clé, JWT, lien expiré...).
- **Le cache du Service Worker est un suspect quasi systématique** quand un déploiement semble "ne rien changer" — vérifier via `document.getElementById(...)` en console avant de chercher un bug de logique JS.
- **Les logs `console.log` de debug temporaires sont efficaces** pour tracer un ordre d'exécution incertain (ex: race conditions entre événements SDK et DOM) — à retirer systématiquement une fois le bug confirmé corrigé.
- **Tester avec des liens/tokens fraîchement générés** quand le débogage implique plusieurs allers-retours — les tokens à courte durée de vie (reset password, confirmation email) expirent vite en situation de test prolongé.
