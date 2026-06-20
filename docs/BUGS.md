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

## 7. Colonnes inexistantes envoyées à Supabase (`cree_par`, `updated_at`, `etoiles`)

**Symptôme récurrent** : `Could not find the 'X' column of 'Y' in the schema cache` (PostgREST), ou côté Network un code Postgres `42703 — undefined_column`.

**Cause** : plusieurs fonctions de `src/supabase-client.js` envoyaient ou sélectionnaient des colonnes qui n'existent pas (ou plus) dans le schéma réel de la table, sans jamais avoir été vérifiées contre Supabase → Table Editor :
- `createSession` envoyait `cree_par` → absent de `sessions_tifo` (13 colonnes réelles : `id, nom, date, heure, lieu, type_session, statut, avec_pizza, capacite_max, lien_telegram, code_validation, description, created_at`).
- `validerPresence` et `savePizzaChoice` envoyaient `updated_at` → absent de `inscriptions_session` (colonnes réelles : `id, session_id, membre_id, statut, pizza, pinte, created_at`).
- `getSessionDetails` et `getDeplacement` sélectionnaient `etoiles` dans la jointure `membre:membres(...)` → colonne jamais créée en base (vestige d'un système de notation jamais finalisé, cf. bug #9).

**Fix** : retrait des champs fautifs des `.insert()`/`.update()`/`.select()` concernés. Pour `cree_par` sur `createDeplacement` (table `deplacements`), le même risque existe mais n'a pas été vérifié — **point de vigilance non résolu**, à tester avant mise en prod du module Déplacements.

**Méthode qui a permis de trouver le vrai message d'erreur** : DevTools → Network → cliquer la requête en échec → onglet **Response** (pas Headers) → le corps JSON contient le code Postgres exact (`42703`) et le nom de colonne fautif en clair. Le header `Proxy-Status: PostgREST; error=XXXXX` donne le code sans devoir ouvrir Response, utile pour un premier tri rapide.

**Fichiers concernés** : `src/supabase-client.js`

---

## 8. Bug de préfixe DOM entre Accueil et page Tifos (affichage "S'inscrire" figé après inscription réussie)

**Symptôme** : après inscription réussie (confirmée en base, visible dans Supabase), le bouton reste affiché "S'inscrire" au lieu de passer à "✅ Tu es inscrit(e)" — sur la page Accueil notamment.

**Cause réelle (différente de l'hypothèse initiale)** : `loadAccueil()` rend les cards tifos avec un préfixe d'id `'acc_'` (`renderTifoCard(s, 'acc_')` → id DOM `tifoActions_acc_<sessionId>`), pour permettre l'affichage simultané du même tifo sur Accueil et sur la page Tifos sans collision d'id. `doInscrire()` appelait `loadTifoActions(id, null)` **sans propager ce préfixe**, qui cherchait alors `tifoActions_<id>` (sans `acc_`) → élément introuvable → mise à jour silencieusement perdue, fallback `setTimeout` qui retente avec le même id erroné.

**Diagnostic** : le vrai blocage observé pendant le test (toast "Déjà Inscrit" au lieu du bug de préfixe) était en fait une tentative de ré-inscription sur un tifo déjà inscrit (409/23505) — il a fallu tester sur un tifo **non encore inscrit** pour révéler le vrai bug de préfixe via les logs `[UL DEBUG]` temporaires.

**Fix** : `await loadAccueil()` (régénère tout le HTML avec le bon préfixe à chaque fois, donc résout l'affichage même si `loadTifoActions(id, null)` échoue silencieusement sur la page Accueil) — et passage en `await` (était fire-and-forget avant, source potentielle de race condition).

**Fichiers concernés** : `src/tifos.js`

---

## 9. Refonte du système d'évaluation par cellule (`etoiles` → table `evaluations`)

**Contexte** (pas un bug isolé, une dette de conception découverte en creusant le bug #7) : le code legacy avait DEUX implémentations incompatibles et non-finalisées d'un système d'évaluation des membres :
- Un champ unique `membres.etoiles` (jamais créé en base), utilisé par `profil.js` et `setEtoilesMembre()`.
- Une paire `setEvaluation(membreId, celluleId, note, commentaire)` / `getEvaluations(membreId)` ciblant une table `evaluations` avec un schéma différent (`cellule_id`, `note_par`, `commentaire`, `updated_at`, upsert sur `membre_id,cellule_id`) — **jamais appelée nulle part dans le front**, donc invisible jusqu'à l'audit.

Aucune des deux ne correspondait à la vraie logique métier : 4 catégories d'évaluation indépendantes et co-existantes (Tifo manuel, Déplacement automatique, Comité Sympathisant, Comité Draft), chacune avec **historique complet** (qui a noté, quand).

**Fix** : nouvelle table `evaluations` (`membre_id, categorie, note, notee_par, created_at` — append-only, pas d'upsert), RLS alignées sur `roles_app[]` existant. Ancien code legacy (`setEvaluation`/`getEvaluations`, jamais utilisé) supprimé pour éviter toute confusion future. Nouvelles fonctions : `noterMembre`, `getEvaluationsMembre`, `getHistoriqueEvaluation`.

**Point de vigilance** : `getHistoriqueEvaluation` référence la contrainte `evaluations_notee_par_fkey` (nom par défaut Postgres pour une FK sur `notee_par`). Si Supabase génère un nom différent, cette fonction précise échouera — non bloquant tant qu'aucune UI d'historique n'existe encore.

**Reste à construire** (chantier volontairement reporté) : module "Comité de passage" (inexistant), onglets "Évaluation membres" dans Tifo et Déplacement (UI de saisie/consultation). Le bouton "⭐ Évaluation membres" existe déjà dans le menu admin Tifo mais pointe vers un placeholder (`ouvrirEvaluationMembresTifo()` → toast "bientôt disponible").

**Fichiers concernés** : nouveau SQL (table + RLS), nouvelle Edge Function `update-evaluation-deplacement`, `src/supabase-client.js`, `src/profil.js`, `index.html` (bouton placeholder)

---

## 10. Edge Function : import npm sans préfixe → échec de bundling

**Symptôme** : `Failed to deploy edge function: ... Relative import path "@supabase/server" not prefixed with / or ./ or ../`.

**Cause** : Deno (runtime des Edge Functions Supabase) refuse un spécificateur de module npm "nu" (`@supabase/server`). Il faut un préfixe explicite de registre : `jsr:@supabase/server@^1` (c'est le registre JSR, pas npm, qui héberge ce package côté Supabase).

**Fix** : alignement strict sur le pattern de `resolve-pseudo` (qui fonctionnait déjà en prod) :
```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
// ...
export default {
  fetch: withSupabase({ auth: 'publishable' }, async (req, ctx) => { ... }),
};
```
À noter : export `default { fetch: ... }`, pas `Deno.serve(...)` — les deux patterns existent dans l'écosystème Deno mais celui-ci est celui qui fonctionne avec la config Supabase actuelle. Utiliser `Response.json({...})` plutôt que `new Response(JSON.stringify({...}))` pour la cohérence avec le style existant.

**Fichiers concernés** : `supabase/functions/update-evaluation-deplacement/index.ts`

---

## 11. `JSON.stringify()` injecté brut dans un attribut `onclick` casse le HTML

**Symptôme** : un bouton censé déclencher une action JS s'affiche comme du texte brut illisible dans la page (ex: `TOAST('COPIÉ !','SUCCESS'))">` visible à l'écran), au lieu de fonctionner comme un bouton normal.

**Cause** : pattern `onclick="maFonction(${JSON.stringify(donnees)})"` — `JSON.stringify` produit systématiquement des guillemets doubles `"` autour de chaque string. Le tout est injecté dans un attribut HTML lui-même délimité par des guillemets doubles (`onclick="..."`). Le navigateur referme l'attribut au premier `"` rencontré dans les données, et traite tout le reste de la chaîne comme du HTML/texte brut affiché à l'écran plutôt que comme du JS exécutable. Bug latent dès qu'au moins une string est présente dans l'objet sérialisé — donc quasi systématique, pas un cas limite.

**Fix** : envelopper `JSON.stringify(...)` avec `esc(...)` (helper déjà existant dans `app.js`, qui convertit `"` → `&quot;`) avant injection dans l'attribut : `onclick="fn(${esc(JSON.stringify(donnees))})"`. Le navigateur décode l'entité HTML avant de passer la valeur au parseur JS, donc le JSON reste valide à l'exécution.

**Trois occurrences corrigées** dans `src/tifos.js` : bouton "Copier la liste" (commandes pizza), et deux boutons dans la vue admin "Inscrits" (liste Telegram, liste complète — ce dernier était probablement cassé depuis sa création, jamais testé jusqu'ici).

**Point de vigilance pour du nouveau code** : tout `onclick="...${JSON.stringify(x)}..."` doit systématiquement passer par `esc()`. Vérifié qu'aucun autre fichier (`admin.js`, `deplacements.js`, `boutique.js`, `calendrier.js`) ne reproduit ce pattern à ce jour.

**Fichiers concernés** : `src/tifos.js`

---

## 12. Champ "places" toujours affiché à 0 (compteur d'inscrits jamais calculé)

**Symptôme** : `renderTifoCard` affiche `0 / 10 places` même quand des membres sont inscrits — aucune erreur JS, juste un chiffre faux.

**Cause** : `getUpcomingSessions()` et `getPastSessions()` faisaient un simple `select('*')` sur `sessions_tifo`, sans jointure ni comptage. Le champ `s._nb_inscrits` lu par `renderTifoCard` n'était donc jamais présent dans l'objet retourné → `undefined || 0` → toujours `0`. (`getSessionsWithStats`, utilisée ailleurs pour le modal "Modifier une session", calculait déjà correctement un équivalent `nb_inscrits` via la même technique — la même logique n'avait simplement pas été reportée sur les deux fonctions de liste.)

**Fix** : ajout de `, inscriptions_session(statut)` au `.select()` des deux fonctions, puis `.map()` pour dériver `_nb_inscrits: s.inscriptions_session?.length || 0` — même pattern que `getSessionsWithStats`, déjà validé en prod.

**Fichiers concernés** : `src/supabase-client.js`

---

## Nettoyage de base de données avant lancement officiel

Phase Key Users en cours sur la base de prod actuelle. Avant le lancement officiel, script de nettoyage prêt (`docs/sql_nettoyage_avant_lancement.sql`) :
- **Conservé** : `membres` (comptes key users → comptes définitifs), `sections`, `cellules`, `membres_cellules`, `chartes`, `config_asso`, `matchs` (calendrier de saison réel, pas du test).
- **Vidé** : tifos + inscriptions, évaluations, déplacements + inscriptions, boutique (produits + commandes), sticks (catalogue + distributions), cotisations, signatures de charte, annonces, événements.
- **Flags dénormalisés à remettre à `false`** après vidage des tables liées : `membres.charte_signee` (+ `charte_signee_at`), `membres.cotisation_a_jour` — sinon incohérence entre le flag sur `membres` et l'absence de ligne dans `signatures_charte`/`cotisations`.

**Point de vigilance** : script `DELETE` ciblé (pas de `TRUNCATE` global), ordre respectant les FK (tables enfants avant tables parentes) pour éviter une erreur de contrainte. Prendre un backup avant exécution (Supabase → Database → Backups). Irréversible.

---

## 13. Charte bloquante — boucle infinie de signature (`signed_at` vs `created_at`) + doublons

**Symptôme** : après signature réussie (toast "Charte signée ✅" affiché), le gate bloquant se réaffiche en boucle au rechargement, comme si la signature n'avait jamais été enregistrée — alors qu'elle l'était bien en base.

**Cause** : `checkConformiteCharte()` lisait `signatures_charte` avec `.select('id, created_at')`. La vraie colonne de la table (qui existait déjà en base avant le script de création `sql_charte_validite.sql` — voir effet de bord ci-dessous) est `signed_at`, pas `created_at`. PostgREST renvoyait une erreur de colonne inexistante, mais le code ne déstructurait que `data` (toujours `null` dans ce cas), pas `error` — l'échec passait donc inaperçu et `conforme` restait `false` indéfiniment, peu importe le nombre de signatures réussies.

**Effet de bord découvert en creusant** : `CREATE TABLE IF NOT EXISTS signatures_charte` (dans `sql_charte_validite.sql`) n'a rien fait, car la table existait déjà avec un schéma différent (sans la contrainte `unique(membre_id, charte_id)` prévue). Résultat : chaque tentative de signature après l'échec silencieux ci-dessus a réinséré une nouvelle ligne au lieu d'être bloquée en doublon (4 lignes constatées pour un seul membre/charte).

**Fix** :
- `checkConformiteCharte()` et l'affichage de la date de signature (`profil.js`) utilisent désormais `signed_at`.
- `error` est maintenant déstructuré et levé (`throw error`) dans `checkConformiteCharte()` au lieu d'être ignoré.
- Script `docs/sql_cleanup_doublons_signatures.sql` : supprime les doublons (garde la signature la plus récente par `membre_id, charte_id` via `row_number()`), puis ajoute la contrainte unique manquante dans un bloc `DO` conditionnel (Postgres ne supporte pas `ADD CONSTRAINT IF NOT EXISTS` nativement).

**Point de vigilance pour la suite** : avant tout `CREATE TABLE IF NOT EXISTS` sur ce projet, vérifier dans Table Editor si la table existe déjà avec un schéma différent de celui supposé — `IF NOT EXISTS` rend l'opération silencieusement no-op sur une table existante, masquant tout écart de schéma jusqu'à ce qu'une requête échoue dessus.

**Fichiers concernés** : `src/supabase-client.js`, `src/profil.js`, `docs/sql_cleanup_doublons_signatures.sql`

---

## 14. Calendrier matchs — `statut_date`, `saisirScoreMatch` manquante, et calendrier officiel 2026-2027

**Contexte** : import du calendrier complet Ligue 1 2026/2027 du Paris FC (34 journées, domicile + extérieur) avec logos adverses, suite à la publication du calendrier officiel LFP le 10 juin 2026.

**Bug latent découvert (pas introduit par cette session)** : `calendrier.js` appelait déjà `UL.saisirScoreMatch(matchId, dom, ext)` (fonction `saisirScore()`), mais cette fonction n'existait pas dans `supabase-client.js` — aucun export ne la couvrait non plus dans `window.UL`. Le bouton "⚽ Saisir le score" aurait donc planté avec un `TypeError` au premier clic, en prod, sans qu'aucun test l'ait révélé jusqu'ici. Ajoutée dans cette session.

**Nouvelle fonctionnalité — statut de date** : la LFP publie des dates de journée fermes très en amont, mais l'horaire précis du coup d'envoi (et parfois la date elle-même, en cas de déplacement TV/sécurité) n'est annoncé que 2-3 semaines avant. Ajout d'une colonne `matchs.statut_date` (`a_confirmer` / `confirmee`, contrainte CHECK) :
- Tous les matchs insérés depuis le calendrier officiel démarrent en `a_confirmer`.
- Bureau+ confirme via le modal "Calendrier matchs" (admin) — bouton "✅ Confirmer" sur chaque match `a_confirmer`, qui bascule le formulaire d'ajout en mode "confirmation" (champs adversaire/type masqués, seuls date/horaire/stade restent éditables) plutôt que de dupliquer un modal HTML.
- Le bouton "Fermer" du modal appelle systématiquement `annulerConfirmerDate()` avant `closeModal()`, pour ne jamais laisser le formulaire collé en mode confirmation à la prochaine ouverture.

**Point de vigilance non couvert** : le clic *en dehors* du modal (`closeModalOutside`, partagé par tous les modals de l'app) ne déclenche pas ce reset — seul le bouton "Fermer" le fait. Risque mineur : un admin ouvre "Confirmer" sur le match A, clique en dehors sans valider, puis ouvre "+ Ajouter un match" depuis l'accueil → le formulaire pourrait rester en mode confirmation collé au match A. Pas corrigé volontairement pour éviter de complexifier `closeModalOutside()` globalement (utilisé par ~15 modals) pour un cas d'usage admin marginal — à surveiller si ça arrive réellement en usage réel.

**Fichiers concernés** : `src/supabase-client.js` (`saisirScoreMatch`, `confirmerDateMatch`, `rouvrirConfirmationMatch`), `src/admin.js` (gestion modal `modalMatchs` double-mode), `src/calendrier.js` (badge "⏳ Date à confirmer" + bouton confirmation sur les cards), `index.html` (modal `modalMatchs` enrichi), `docs/sql_migration_statut_date.sql`, `docs/sql_insertion_calendrier_complet_2026_2027.sql`.

---



- **Toujours vérifier le Network tab (status + body de réponse)** avant de supposer la cause d'un échec d'auth — un message client générique ("introuvable", "identifiants incorrects") peut masquer des causes très différentes (normalisation, RLS, format de clé, JWT, lien expiré...).
- **Le cache du Service Worker est un suspect quasi systématique** quand un déploiement semble "ne rien changer" — vérifier via `document.getElementById(...)` en console avant de chercher un bug de logique JS.
- **Les logs `console.log` de debug temporaires sont efficaces** pour tracer un ordre d'exécution incertain (ex: race conditions entre événements SDK et DOM) — à retirer systématiquement une fois le bug confirmé corrigé.
- **Tester avec des liens/tokens fraîchement générés** quand le débogage implique plusieurs allers-retours — les tokens à courte durée de vie (reset password, confirmation email) expirent vite en situation de test prolongé.
- **Ne jamais ignorer `error` sur un `await sb.from(...)`** — `const { data } = await ...` sans déstructurer `error` masque un échec serveur derrière un simple résultat vide (`null || []`), ce qui ressemble à "pas de données" plutôt qu'à "la requête a échoué".
- **Vérifier le schéma réel de la table (Supabase → Table Editor) avant d'écrire un `.insert()`/`.update()`/`.select()`** plutôt que de supposer une colonne par analogie avec une autre table ou un nom "logique" (`cree_par`, `updated_at`) — la cause la plus fréquente des erreurs `42703`/`PGRST204` cette session.
- **Du code exporté dans `window.UL` mais jamais appelé côté front est invisible jusqu'à l'audit** — chercher systématiquement les usages réels (`grep` sur le nom de fonction dans tous les fichiers `src/*.js` + `index.html`) avant de faire confiance à la seule présence d'une fonction dans le fichier.
- **`JSON.stringify()` ne doit jamais être injecté brut dans un attribut HTML** (`onclick="...${JSON.stringify(x)}..."`) — toujours passer par `esc()` pour échapper les guillemets doubles produits par le JSON.
- **Reproduire un bug exige parfois un état précis** (ex: un tifo où l'on n'est *pas encore* inscrit) — un test sur le mauvais état peut masquer le vrai bug derrière un comportement différent mais correct (ex: doublon d'inscription qui ressemble au bug recherché mais n'en est pas la cause).
