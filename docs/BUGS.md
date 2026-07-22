# JOURNAL DE BUGS — Ultras Lutetia PWA

*Ce fichier recense les bugs identifiés et corrigés, avec la cause exacte et le fix appliqué. Objectif : éviter de redécouvrir les mêmes pièges dans une session future. Mis à jour à chaque nouveau bug traité.*

---

## 📍 État de session — reprise

*Mise à jour 21/06/2026, fin de session : chantier QR code membre (scan présence/retrait/remise) débogué et validé pour Sticks ; chantier HelloAsso Checkout (Déplacements) codé mais bloqué en attente d'accès réels — voir `TODO_HELLOASSO.md`.*

**QR code membre — état réel par contexte :**
- **Sticks** : ✅ testé de bout en bout en conditions réelles (scan → résolution membre → confirmation remise → décrémentation stock), 3 bugs trouvés et corrigés au passage (cf. #27, #28, #29 ci-dessous).
- **Déplacement** (présence bus) : codé, **jamais testé en conditions réelles** cette session — uniquement vérifié par lecture de code. À tester en priorité à la reprise (probable que d'autres bugs du même genre que Sticks y dorment, notamment toute jointure Supabase non vérifiée).
- **Matos** (retrait commande) : codé, **jamais testé en conditions réelles** cette session, même remarque que Déplacement.

**Action en attente côté Remi avant de continuer à tester** : aucune action SQL bloquante identifiée pour la suite (la migration QR code + present_at est déjà appliquée et vérifiée en base).

**Dette technique connue, non bloquante** :
- Le bouton "Cash" pour les Sticks en catégorie "Tous les membres" **sans lien HelloAsso renseigné** laisse un membre normal sans aucun moyen de l'acquérir lui-même (ni HelloAsso car pas de lien, ni Cash car réservé à la Cellule Sticks) — découvert en session, **pas encore corrigé**, 3 pistes de solution évoquées avec Remi mais aucune tranchée. À reprendre en priorité si ça bloque un cas réel.
- `getEvenements()`/jointures sur d'autres tables non vérifiées pour ce même type d'ambiguïté de clé étrangère que celle trouvée en #29 — seules `sticks_distribution` et `evaluations` ont été auditées (`evaluations` s'est révélée saine). Aucune autre table n'a été vérifiée systématiquement.

**Prochaine session suggérée** : tester Déplacement et Matos avec le scan QR (même méthode que Sticks : `console.log` direct des fonctions `UL.xxx` avant de chercher dans l'UI), puis trancher la question du bouton Cash Sticks sans lien HelloAsso, puis reprendre HelloAsso Checkout dès que les accès sandbox sont obtenus (cf. `TODO_HELLOASSO.md`).

---

## 📍 Historique — état de session précédent (20/06/2026)

**Module Boutique Sticks** : flux de création + validation cash terminé et fonctionnel (bugs #22-26 ci-dessous). Reste **non démarré** : audit du module Calendrier (4 fonctions manquantes déjà identifiées et corrigées en passant, cf. #23, mais le module lui-même n'a pas eu son audit complet comme Tifos/Boutique).

**Dette technique connue, non bloquante** :
- `modalDistribuer`/`doDistribuerStick()` ne sont plus accessibles depuis aucun bouton de l'UI (remplacés par le flux Cash dédié) — code mort, à supprimer si confirmé inutile à terme.
- `demanderStick()` (ancien flux d'auto-demande cash côté membre) n'a plus aucun appelant depuis le passage au flux "Cash validé par Admin uniquement" — code mort, et n'a pas été mise à jour pour la décrémentation de stock (cf. #26) puisque débranchée.
- Update à corriger côté SQL : sticks/produits créés **avant** le fix #25 ont potentiellement un `quota_par_membre` parasite en base (`update sticks_catalogue set quota_par_membre = null where quota_par_membre is not null;` + équivalent `produits`).

**Prochaine session suggérée** : audit complet du module Calendrier (sur le modèle Tifos/Boutique), puis vérifier si Matos a les mêmes trous de quota/stock que Sticks (déjà en bonne partie corrigé en cohérence cette session, mais jamais testé de bout en bout comme Sticks l'a été).

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



## 15. Accès Tifos restreint par statut (`valide_tifo`) + bug de déblocage checkbox charte

**Contexte** : ajout d'une restriction d'accès à la page Tifos — Sympathisant jamais, Draft seulement si validé manuellement par cellule Tifo/Bureau/Admin, Confirmé automatique. Nouvelle colonne `membres.valide_tifo` (boolean, défaut `false`), nouvelle fonction `peutVoirTifos(membre)` dans `app.js`, vérifiée à la fois dans `loadTifos()` (page dédiée) et dans le bloc "Prochains Tifos" de l'accueil (`loadAccueil()`) — un seul des deux avait été oublié au premier passage, attention à toujours chercher les deux points d'entrée d'un même contenu (accueil + page dédiée) avant de considérer une restriction d'accès comme complète.

**Effet de bord découvert pendant le test du gate charte (sans lien avec le code)** : en testant avec un compte `draft` jamais signé, la checkbox "Je certifie avoir lu..." semblait bloquée indéfiniment même après scroll. Le vrai diagnostic (`scrollHeight`/`clientHeight`/`scrollTop` vérifiés en Console) a montré que le mécanisme fonctionnait correctement — le test précédent avait simplement été fait avant d'avoir scrollé jusqu'au tout dernier pixel (seuil strict `scrollHeight - 20`). Pas un bug, mais le timing de calcul initial (`requestAnimationFrame` seul, juste après l'injection du HTML) a quand même été renforcé par précaution : un `setTimeout(recheck, 300)` et un écouteur `resize` ont été ajoutés dans `afficherCharteGate()`, au cas où une police web ou une image non encore chargée fausse `scrollHeight` au moment du tout premier calcul.

**Fichiers concernés** : `src/app.js` (`peutVoirTifos`, bloc Tifos de `loadAccueil`, robustesse `afficherCharteGate`/`checkCharteScroll`), `src/tifos.js` (`loadTifos` avec message différencié sympathisant/draft non-validé), `src/admin.js` + `index.html` (checkbox "Validé Tifo" dans la fiche membre), `docs/sql_migration_valide_tifo.sql`.

---

## 16. 404 sur tous les logos malgré un déploiement confirmé — espace parasite en tête de nom de fichier

**Symptôme** : tous les logos de clubs (`assets/logos/*.png`) renvoient 404 dans la Console malgré un dossier bien présent à la racine du repo, un déploiement GitHub Pages marqué succès (coche verte), et un chemin d'URL identique à celui utilisé dans le SQL d'insertion. Premier indice trompeur : ouvrir l'URL d'un logo manquant dans le navigateur semblait "rediriger vers l'app" plutôt que d'afficher une 404 classique — en réalité c'est `404.html` (prévu pour rattraper les liens magiques Supabase avec `#access_token`) qui redirige systématiquement toute 404 vers la racine, masquant ainsi la vraie nature de l'erreur.

**Cause réelle** : lors d'un renommage en masse des fichiers logos sur l'interface web GitHub (`angers.png` → `assets/logos/angers.png`), un espace s'est glissé en tête de chaque nouveau chemin (`assets/logos/ angers.png`, espace après le `/`). Invisible dans la colonne "Name" du Table Editor GitHub à l'œil nu, mais confirmé en cliquant sur le bouton "Raw" d'un fichier : l'URL générée contenait `%20angers.png` (espace encodé). Le message de commit généré automatiquement par GitHub (`"Rename angers.png to assets/logos/ angers.png"`) portait déjà la même trace, repérable a posteriori.

**Méthode de diagnostic qui a fonctionné** : DevTools → Console (liste des 404 avec chemins complets) → vérifier le déploiement GitHub Actions (succès, dossier présent) → cliquer "Raw" sur un fichier individuel pour voir l'URL réellement générée par GitHub. C'est cette dernière étape qui a révélé l'espace, invisible dans tous les affichages précédents (liste de fichiers, message de commit tronqué à l'écran).

**Point de vigilance pour la suite** : un renommage en masse de fichiers (scripté ou via une suite de clics) doit être vérifié au moins une fois via le bouton "Raw"/l'URL brute réelle, pas seulement via le nom affiché dans l'interface — la colonne "Name" de GitHub peut tronquer ou ne pas rendre visible un espace en début de chaîne.

**Fichiers concernés** : aucun fichier de code (problème purement côté contenu du repo — noms de fichiers dans `assets/logos/`). Documenté ici car le temps de diagnostic a été long et la cause est non-évidente.

---


- **Le cache du Service Worker est un suspect quasi systématique** quand un déploiement semble "ne rien changer" — vérifier via `document.getElementById(...)` en console avant de chercher un bug de logique JS.
- **Les logs `console.log` de debug temporaires sont efficaces** pour tracer un ordre d'exécution incertain (ex: race conditions entre événements SDK et DOM) — à retirer systématiquement une fois le bug confirmé corrigé.
- **Tester avec des liens/tokens fraîchement générés** quand le débogage implique plusieurs allers-retours — les tokens à courte durée de vie (reset password, confirmation email) expirent vite en situation de test prolongé.
- **Ne jamais ignorer `error` sur un `await sb.from(...)`** — `const { data } = await ...` sans déstructurer `error` masque un échec serveur derrière un simple résultat vide (`null || []`), ce qui ressemble à "pas de données" plutôt qu'à "la requête a échoué".
- **Vérifier le schéma réel de la table (Supabase → Table Editor) avant d'écrire un `.insert()`/`.update()`/`.select()`** plutôt que de supposer une colonne par analogie avec une autre table ou un nom "logique" (`cree_par`, `updated_at`) — la cause la plus fréquente des erreurs `42703`/`PGRST204` cette session.
- **Du code exporté dans `window.UL` mais jamais appelé côté front est invisible jusqu'à l'audit** — chercher systématiquement les usages réels (`grep` sur le nom de fonction dans tous les fichiers `src/*.js` + `index.html`) avant de faire confiance à la seule présence d'une fonction dans le fichier.
- **`JSON.stringify()` ne doit jamais être injecté brut dans un attribut HTML** (`onclick="...${JSON.stringify(x)}..."`) — toujours passer par `esc()` pour échapper les guillemets doubles produits par le JSON.
## 17. Confirmation d'inscription par email — passage du lien cliquable au code OTP (refonte majeure)

**Contexte** : plusieurs nouveaux membres (Ulcelluletifo, Nowena) restaient bloqués indéfiniment en "Waiting for verification" dans Supabase Auth, malgré avoir cliqué le lien de confirmation reçu par email. `resolve-pseudo` répondait ensuite `{"message":"Invalid credentials","code":"INVALID_CREDENTIALS"}` en HTTP 200 (donc `resp.ok` ne détectait pas l'échec), ce qui faisait remonter `email = undefined` jusqu'à `signInWithPassword`, lequel échouait avec un message totalement trompeur : `"No API key found in request"` — qui n'avait aucun rapport avec la vraie cause.

**Cause racine identifiée** : le SMTP custom Brevo (`smtp-relay.brevo.com`, configuré dans Supabase Auth Settings — **nécessaire, gardé tel quel** : l'envoi natif Supabase avait déjà échoué lors d'une session antérieure pour blocage IP) réécrit systématiquement tous les liens des emails transactionnels pour son tracking de clics, **sans option de désactivation pour ce canal** (confirmé par la documentation officielle Brevo et plusieurs fils de la communauté Brevo). Quand un scanner de sécurité côté destinataire (Microsoft Defender Safe Links, antivirus, etc.) pré-visite ce lien de tracking automatiquement, il consomme le token de confirmation à usage unique avant que le membre ne clique réellement — confirmé explicitement par la documentation officielle Supabase elle-même, qui décrit ce scénario exact et recommande de basculer vers une vérification par OTP (`verifyOtp`) plutôt que par lien cliquable.

**Fix structurel — passage à un code OTP à 8 chiffres** :
- Nouveau template Supabase "Confirm signup" : suppression du lien `<a href="...">`, remplacé par `{{ .Token }}` affiché en clair dans l'email (fichier de référence : `template_confirm_signup_otp.html`).
- Nouvel écran `otpForm` dans `index.html` (entre `inscriptionForm` et la fermeture de `loginPage`) : champ de saisie + bouton Confirmer + bouton "renvoyer le code".
- `app.js` : `showOtpForm(email)`, `doVerifyOtp()`, `doRenvoyerOtp()` ; `doInscription()` bascule désormais vers cet écran au lieu d'un simple toast "vérifie tes mails".
- `supabase-client.js` : nouvelles fonctions `verifierCodeInscription(email, code)` (utilise `sb.auth.verifyOtp({ email, token: code, type: 'email' })`, puis `signOut()` immédiat pour ne pas laisser de session "fantôme" avant validation Bureau) et `renvoyerCodeInscription(email)` (`sb.auth.resend({ type: 'signup', email })`).
- **Le workflow de validation Bureau (`statut`/`actif` dans l'admin "Demandes d'inscription") n'a pas changé** : la confirmation email reste une étape strictement antérieure et indépendante, purement technique.

**Deux pièges supplémentaires rencontrés en testant ce fix, tous deux résolus** :
1. **`type: 'signup'` est déprécié pour `verifyOtp()` avec un email** — la documentation officielle Supabase (toutes plateformes : JS, Python, Swift, Dart, Kotlin) le confirme explicitement : le type correct est `'email'`. Avec `'signup'`, l'erreur renvoyée était `"Token has expired or is invalid"` — un message trompeur qui ne distingue pas "type de vérification incorrect" de "code réellement expiré", ce qui a fait perdre un temps important à tester de fausses pistes (délai d'expiration, double-clic sur "renvoyer", cache navigateur). À noter : `resend()` (pour renvoyer un nouveau code) utilise lui un type `'signup'` toujours valide — ce sont deux paramètres `type` différents sur deux méthodes différentes, à ne pas confondre.
2. **Supabase génère un code à 8 chiffres par défaut pour l'OTP email signup, pas 6.** Le champ `<input maxlength="6">` (supposition non vérifiée, par analogie avec les OTP SMS/Google Auth habituels) tronquait silencieusement la saisie : un vrai code `39431896` devenait `394318` une fois saisi, ce qui ne pouvait évidemment jamais correspondre côté serveur — même message trompeur `"Token has expired or is invalid"` en retour, alors que la cause n'avait rien à voir avec une expiration. Repéré uniquement en comparant manuellement le code affiché dans l'email brut (8 caractères) avec celui affiché dans le champ de saisie de l'app (6 caractères, tronqué). Corrigé : `maxlength="8"`.

**Point de vigilance pour la suite** : si Supabase change un jour la longueur par défaut du code OTP (configurable côté Auth Providers), il faudra resynchroniser `maxlength` côté `index.html`. Le check JS `code.length < 6` dans `doVerifyOtp()` est volontairement laxiste (pas `< 8`) pour ne pas avoir à modifier le JS si la longueur change côté Supabase — seul `maxlength` dans le HTML borne réellement la saisie.

**Fichiers concernés** : `index.html` (écran `otpForm`), `src/app.js` (`showOtpForm`, `doVerifyOtp`, `doRenvoyerOtp`, `doInscription` modifiée), `src/supabase-client.js` (`verifierCodeInscription`, `renvoyerCodeInscription`), template Supabase "Confirm signup" (`{{ .Token }}`), `docs/sql_suppression_complete_3_comptes.sql` (nettoyage des comptes de test bloqués avant le fix), `docs/template_confirm_signup_otp.html`.

---

## 18. `doVerifyOtp()` validait encore `code.length < 6` — résidu de l'ancien `maxlength="6"`

**Symptôme** : aucun, en l'état actuel (un code à 8 chiffres passe largement le seuil `< 6`) — repéré par relecture de code lors d'une confirmation de flux, pas par un dysfonctionnement observé.

**Cause** : lors du fix du bug #17, `maxlength="6"` → `maxlength="8"` avait été corrigé côté `index.html`, mais le commentaire au-dessus du check JS dans `app.js` indiquait explicitement une intention différente : garder `code.length < 6` *volontairement* laxiste, pour ne pas avoir à retoucher le JS si Supabase changeait un jour la longueur par défaut du code (seul `maxlength` dans le HTML devait borner réellement la saisie). Cette intention n'avait pas été relue avant de "corriger" la valeur en session suivante.

**Décision prise cette session** : resserré à `code.length < 8` quand même, sur demande explicite de Remi, en connaissance de cause — le bénéfice (message d'erreur "Code requis" immédiat sur une saisie de 6-7 chiffres, plutôt que de laisser Supabase renvoyer une erreur moins claire) a été jugé supérieur à la flexibilité face à un changement hypothétique côté Supabase.

**Point de vigilance pour la suite** : si Supabase change un jour la longueur du code OTP, il faudra modifier **les deux** : `maxlength` dans `index.html` ET `code.length < 8` dans `doVerifyOtp()` (plus de séparation volontaire entre les deux comme c'était le cas avant cette session).

**Fichiers concernés** : `src/app.js` (`doVerifyOtp`).

---

## 19. `getProduits()` / `getSticks()` — détection Admin/Bureau/Membre Cellule via `membre.statut` au lieu de `roles_app[]`

**Symptôme** : aucun symptôme rapporté par un utilisateur — trouvé lors d'un audit de la hiérarchie à 6 niveaux demandé par Remi, en confrontant la matrice de droits théorique au code réel.

**Cause** : les deux fonctions comparaient `membre.statut` à `'admin'`, `'bureau'`, `'membre_cellule'` pour décider si le membre voit tout le catalogue Matos/Sticks sans restriction. Or `membre.statut` ne contient **jamais** ces valeurs — confirmé par le commentaire de `admin.js` ("Statut UL : seulement sympathisant/draft/confirme") et par l'absence totale de ces 3 chaînes ailleurs dans le code applicatif. Admin/Bureau/Membre Cellule sont détectés exclusivement via `roles_app[]` (`isAdmin()`/`isBureau()`/`isCellule()` dans `app.js`). Conséquence réelle : un Admin/Bureau/Membre Cellule qui n'a *que* son rôle dans `roles_app` (le cas normal — personne n'a en plus `statut: 'confirme'` par construction) était traité comme un Confirmé simple pour l'accès aux produits/sticks de niveau "section", au lieu de tout voir sans restriction.

**Fix** (`src/supabase-client.js`) : remplacement de `['admin','bureau','membre_cellule'].includes(statut)` par `isAdmin(membre) || isBureau(membre) || isCellule(membre)` dans les deux fonctions. `isCellule()` est volontairement inclus (pas seulement `isAdmin`/`isBureau`) car un Membre Cellule simple doit aussi voir tout le catalogue, par hiérarchie.

**Découverte connexe lors du même audit** : `getProduits()` était dupliquée **mot pour mot** deux fois dans le fichier — la seconde déclaration écrasait silencieusement la première en JS (pas d'erreur, juste du code mort). La première occurrence a été supprimée.

**Point de vigilance pour la suite** : avant d'écrire toute logique de droits qui distingue Admin/Bureau/Membre Cellule, ne jamais comparer `membre.statut` — toujours passer par `isAdmin()`/`isBureau()`/`isCellule()`. Et avant d'ajouter une fonction dans `supabase-client.js`, `grep` son nom dans le fichier entier : au moins une duplication exacte y vivait silencieusement.

**Fichiers concernés** : `src/supabase-client.js` (`getProduits`, `getSticks`).

---

## 20. `rattacherCellule()` / table `membres_cellules` — code mort jamais branché, avec écriture de statut invalide

**Symptôme** : aucun — fonction jamais appelée par aucun bouton de l'UI, trouvée lors du même audit de hiérarchie que le bug #19 (`grep` de `rattacherCellule` et `getCellules` dans tous les fichiers `src/*.js` + `index.html` : zéro résultat d'appel, seulement la déclaration et l'export).

**Cause** : `rattacherCellule(membreId, celluleId, role)` tentait d'écrire `membre.statut = 'membre_cellule'` via `updateStatutMembre()` — exactement le même défaut conceptuel que le bug #19 (une valeur que `membre.statut` ne gère jamais). Il s'agissait d'un système parallèle basé sur la table relationnelle `membres_cellules` (membre ↔ cellule ↔ rôle), probablement une première tentative de gérer l'appartenance multi-cellule, abandonnée en cours de route au profit du système plus simple `roles_app[]` (tableau de strings, qui permet déjà nativement à un membre d'appartenir à plusieurs cellules — chaque `hasCellule*()` dans `app.js` est un test indépendant, pas un `if/else` exclusif).

**Vérification effectuée avant suppression** : confirmé avec Remi que le besoin réel ("un membre peut être membre de plusieurs cellules, ex: Tifo + Matos, et doit voir les deux panneaux admin") fonctionne déjà nativement via `roles_app[]` — testé par lecture de `applyRights()` dans `app.js`, qui empile des `if` indépendants (pas de branche exclusive) pour chaque `adminSection*`.

**Fix** : suppression de `getCellules()` et `rattacherCellule()` dans `supabase-client.js`, retrait de leur export, et retrait des jointures `membres_cellules(...)` dans `getMembre()`/`getAllMembres()` (leur résultat n'était lu/affiché nulle part côté UI). La table `membres_cellules` existe toujours côté base Supabase — non supprimée, seulement débranchée du code.

**Point de vigilance pour la suite** : si un jour `membres_cellules` doit être réintroduite (ex: pour différencier un "responsable de cellule" d'un "membre simple" au sein d'une même cellule — un besoin que `roles_app[]` ne couvre pas, lui n'étant qu'un simple booléen par cellule), repartir d'un schéma neuf plutôt que de réutiliser les anciennes fonctions : elles contenaient le bug de `statut` invalide en plus d'être déconnectées de toute UI.

**Fichiers concernés** : `src/supabase-client.js` (`getCellules`, `rattacherCellule` supprimées ; `getMembre`, `getAllMembres` allégées).

---

## 21. Notation par cellule — emoji fixe `🖌️` au lieu de varier selon la catégorie

**Symptôme** : capture d'écran montrant des pinceaux 🖌️ pour la notation des Sympathisants et des Drafts dans le panneau Comité de passage, alors que `EVAL_EMOJI` (défini dans `profil.js`) prévoit 💙 pour `comite_sympa` et 🚀 pour `comite_draft`.

**Cause** : `renderCarteEvaluation(m, categorie)`, écrite pour être générique et partagée entre Tifo et Comité, utilisait `'🖌️'.repeat(n)` en dur au lieu de `EVAL_EMOJI[categorie].repeat(n)` — un oubli de branchement lors de l'écriture initiale (la constante `EVAL_EMOJI` existait déjà, mais n'avait pas été consultée par cette fonction).

**Fix** (`src/tifos.js`) : `const emoji = EVAL_EMOJI[categorie] || '🖌️';` au début de `renderCarteEvaluation()`, utilisé ensuite dans le rendu des 3 boutons. Le fallback `|| '🖌️'` couvre le seul appel sans correspondance dans `EVAL_EMOJI` (catégorie `'tifo'`, qui y est bien définie — donc le fallback n'est en réalité jamais activé en usage normal, gardé par prudence si une future catégorie est ajoutée sans être encore déclarée dans `EVAL_EMOJI`).

**Point de vigilance pour la suite** : toute fonction de rendu générique partagée entre plusieurs cellules doit être testée visuellement (capture d'écran) pour **chaque** catégorie qu'elle gère, pas seulement vérifiée par lecture de code — ce bug n'a pas été détecté par `validate.js` (pas d'erreur de syntaxe, juste un mauvais choix d'emoji), ni par une relecture initiale du code.

**Fichiers concernés** : `src/tifos.js` (`renderCarteEvaluation`).

---

## 22. Module Boutique — `createProduit` jamais écrite, code legacy dupliqué et mort

**Symptôme** : aucun symptôme rapporté par un utilisateur — trouvé lors de l'audit du module Boutique (suite logique après l'audit Tifos), en croisant chaque `UL.xxx` appelé par `boutique.js` contre l'export réel de `supabase-client.js`.

**Cause** : `doCreerProduit()` (bouton "+ Ajouter un article", Cellule Matos) appelait `UL.createProduit({...})`, qui n'existait nulle part — ni en définition, ni en export. Le formulaire entier (nom, prix, catégorie, photo, tailles, accès section, quota) était fonctionnel côté UI mais ne pouvait rien sauvegarder ; aurait planté avec `UL.createProduit is not a function` au premier clic en prod. Invisible pour `validate.js`, qui ne croise jamais les modules applicatifs avec `supabase-client.js`.

**Découverte connexe lors du même audit** : trois fonctions legacy mortes exportées mais jamais appelées par aucun module (`getSticksCatalogue`, `distribuerStick`, `validerCotisation` — remplacées respectivement par `getSticks`, `distribuerStickAdmin`, `validerCotisationCash`/`validerCotisationHelloAsso` sans que l'ancien code ait été supprimé), plus trois fonctions dupliquées mot pour mot deux fois dans le fichier (`passerCommande`, `getMesCommandes`, `getMaCotisation` — la seconde déclaration écrasait silencieusement la première en JS).

**Fix** (`src/supabase-client.js`) : ajout de `createProduit(produit)` (insert + select + gestion d'erreur, même pattern que `updateProduit`). Suppression du bloc legacy entier (~90 lignes : anciennes `passerCommande(items)`, `getMesCommandes`, `getSticksCatalogue`, `distribuerStick`, `getMaCotisation(saison)`, `validerCotisation`). Export `window.UL` dédupliqué (`getProduits` n'apparaît plus qu'une fois) et `createProduit` ajoutée.

**Point de vigilance pour la suite** : avant de considérer un module audité comme "fini", croiser systématiquement chaque `UL.xxx` appelé contre le bloc d'export `window.UL` (script Python rapide : extraire les noms des deux côtés, `set` diff) — c'est la seule méthode qui révèle ce type de trou, ni `validate.js` ni une relecture visuelle ne le détectent.

**Fichiers concernés** : `src/supabase-client.js` (`createProduit` ajoutée ; legacy Matos/Sticks/Cotisations supprimé).

---

## 23. Calendrier — `getEvenement(s)`/`saveEvenement`/`deleteEvenement` jamais écrites ; Tifos — `desinscrireMembreSession` jamais écrite

**Symptôme** : aucun symptôme rapporté — trouvé par le même croisement systématique `UL.xxx` appelé vs exporté, étendu à l'ensemble des modules après la correction du bug #22, par précaution.

**Cause** : `calendrier.js` (`loadCalendrier`, `ouvrirModifierEvenement`, `doSauvegarderEvenement`, `doSupprimerEvenement`) appelait `UL.getEvenements`, `UL.getEvenement`, `UL.saveEvenement`, `UL.deleteEvenement` — aucune des quatre n'existait, alors que le module Calendrier n'avait pas encore été audité (cohérent, pas une anomalie). `tifos.js` (`doDesinscrireAdmin`, bouton "✕" sur la liste des inscrits, action Cellule Tifo+) appelait `UL.desinscrireMembreSession(sessionId, membreId)` — absente, alors que `desinscrire(sessionId)` (auto-désinscription, sans `membreId`) existait déjà mais avec une signature différente (action sur soi-même, pas sur un autre membre). Ce dernier cas est plus surprenant : le module Tifos avait déjà été audité et validé avant cette découverte — signe qu'un audit "validé" peut quand même laisser passer un trou si le croisement export/appels n'a pas été fait de façon exhaustive sur 100% du fichier.

**Fix** (`src/supabase-client.js`) : `getEvenements()`, `getEvenement(id)`, `saveEvenement(data, id=null)` (id fourni → update, sinon insert avec `publie_par: currentUser.id`), `deleteEvenement(id)` ajoutées dans la section CALENDRIER, juste après `getCalendar` (qui lisait déjà la table `evenements` mais n'était elle-même appelée par aucun module — laissée en place, inoffensive). `desinscrireMembreSession(sessionId, membreId)` ajoutée juste après `desinscrire`, même requête avec `membreId` explicite au lieu de `currentUser.id`. Toutes les quatre ajoutées à l'export.

**Point de vigilance pour la suite** : un module marqué "audité et validé" mérite quand même le croisement export/appels en passe finale avant de le considérer clos — un audit fonctionnel (lecture du code, tests visuels) et un audit de cohérence d'API (chaque appel a-t-il sa définition) sont deux vérifications indépendantes, l'une ne couvre pas l'autre.

**Fichiers concernés** : `src/supabase-client.js` (`getEvenements`, `getEvenement`, `saveEvenement`, `deleteEvenement`, `desinscrireMembreSession` ajoutées).

---

## 24. Buckets Storage et colonnes manquantes côté Supabase — schéma réel jamais synchronisé avec le code écrit

**Contexte** : lors de la construction de la création de stick (nouvelle fonctionnalité — modale `modalCreerStick`, `doCreerStick()`, `createStick()`), une cascade de blocages a révélé que le code avait été écrit en se basant sur un schéma de base supposé, jamais vérifié à la source avant cette session.

**Cascade de symptômes rencontrés, dans l'ordre** :
1. `Erreur upload: Bucket not found` — le bucket Storage `sticks` n'existait pas (seul `matos` avait été créé). Fix : `insert into storage.buckets (id, name, public) values ('sticks', 'sticks', true)` + policies `select`/`insert`/`update` sur `storage.objects` pour ce bucket.
2. `Could not find the 'lot' column of 'sticks_catalogue'` — `lot` et `mode` (nouveaux champs du formulaire) n'existaient pas en base. Fix : `alter table ... add column if not exists`.
3. `Could not find the 'niveau_acces' column` — cette colonne, pourtant déjà lue par `getSticks()` avant cette session (donc supposée exister), n'existait en réalité pas non plus. Fix : `ALTER TABLE` exhaustif couvrant toutes les colonnes attendues (`nom, niveau_acces, section_id, prix, lot, stock, mode, lien_helloasso, statut, visuel_url, quota_par_membre, categorie, serie`), toutes en `add column if not exists` pour rester sans danger même si certaines existaient déjà.
4. `new row violates row-level security policy for table "sticks_catalogue"` — aucune policy `INSERT`/`UPDATE` n'existait sur `sticks_catalogue` (ni sur `produits`, son équivalent Matos — confirmé en testant : même erreur). Seule une policy `SELECT` ("lecture authentifiés") avait été créée. Fix : policies `INSERT`/`UPDATE` strictes basées sur `roles_app[]` (`membres.roles_app && array['admin_app','bureau_app','cellule_matos']` via `exists (select 1 from membres where membres.id = auth.uid() and ...)`), répliquées à l'identique sur les deux tables.
5. `Could not find the 'distribue_par' column of 'sticks_distribution'` — même cause que le point 3, sur une table différente (`sticks_distribution`), pour une fonction (`distribuerStickAdmin`) qui existait déjà avant cette session. Fix : `alter table sticks_distribution add column if not exists distribue_par uuid references membres(id)`.

**Cause racine commune aux 5 points** : aucun outil de ce projet (`validate.js`, audit manuel du code applicatif) ne vérifie le schéma réel de la base contre ce que le code JS suppose. Le seul moyen fiable de détecter ces trous est de tester réellement le flux de bout en bout (créer un objet via l'UI) — une relecture de code, même attentive, ne peut pas voir qu'une colonne référencée n'existe pas en base.

**Méthode qui a permis de résoudre rapidement sans itérer erreur par erreur** : avant de proposer un `ALTER TABLE`, lancer une requête `select column_name, data_type from information_schema.columns where table_name = 'X'` et comparer son résultat à la liste exhaustive des colonnes utilisées dans le code (`grep` du nom de table dans `supabase-client.js`) — évite de découvrir les colonnes manquantes une par une au fil des tests utilisateur.

**Point de vigilance pour la suite** : avant d'écrire toute nouvelle fonction `supabase-client.js` qui insère/met à jour une table existante, vérifier le schéma réel via `information_schema.columns` (ou Table Editor) plutôt que de supposer une colonne par cohérence avec le code JS déjà écrit ailleurs — le bug #7 avait déjà identifié ce risque, mais visiblement seulement pour les colonnes *ajoutées* par du nouveau code, pas pour les colonnes *déjà lues* par du code préexistant qui n'avait, en réalité, jamais été testé en conditions réelles d'écriture.

**Fichiers concernés** : aucun fichier de code (entièrement côté SQL/Dashboard Supabase — buckets Storage, `ALTER TABLE`, policies RLS sur `sticks_catalogue`, `produits`, `sticks_distribution`).

---

## 25. Quota par membre — valeur par défaut parasite en base, champ absent des deux formulaires de création

**Symptôme** : `Quota dépassé pour ce membre (max X)` au premier essai de validation cash sur un stick tout juste créé, alors qu'aucun quota n'avait été saisi nulle part.

**Cause** : `quota_par_membre` n'a jamais été un champ visible dans `modalCreerProduit` (Matos) ni dans `modalCreerStick` (Sticks) — ni avant cette session, ni dans la première version de la modale Sticks construite cette session. La colonne en base héritait donc systématiquement d'une valeur par défaut non-null (probablement `1`), jamais corrigée car jamais visible ni questionnée jusqu'à ce qu'un test réel de validation cash déclenche la vérification `if (stick?.quota_par_membre)`.

**Fix** : ajout du champ "Quota par membre (optionnel — vide = pas de limite)" dans les deux modales (`modalCreerProduit` et `modalCreerStick`), lu et envoyé par `doCreerProduit()`/`doCreerStick()` (`parseInt(...) || null` — vide ou non-numérique → `null`, jamais une valeur parasite). Ne corrige que les *futures* créations — un `update ... set quota_par_membre = null where quota_par_membre is not null` reste nécessaire côté SQL pour les lignes déjà créées avant ce fix.

**Point de vigilance pour la suite** : un champ lu par une fonction de vérification métier (ici, le contrôle de quota dans `distribuerStickAdmin`/`passerCommande`) doit toujours avoir un chemin de saisie correspondant dans le formulaire de création — sinon la valeur en base part d'un défaut arbitraire, invisible jusqu'au jour où la vérification se déclenche en conditions réelles. Vérifier l'aller-retour complet (formulaire → fonction de lecture → fonction de vérification) avant de considérer un champ "branché".

**Fichiers concernés** : `index.html` (`pQuota` dans `modalCreerProduit`, `stQuota` dans `modalCreerStick`), `src/boutique.js` (`doCreerProduit`, `doCreerStick`).

---

## 26. Stock jamais décrémenté automatiquement — comportement préexistant des deux côtés (Matos et Sticks), corrigé sur demande

**Contexte** (pas un bug de régression — comportement déjà présent dans tout le code antérieur à cette session, découvert en testant le flux Cash Sticks de bout en bout) : ni `passerCommande` (Matos) ni `distribuerStickAdmin`/`demanderStick` (Sticks) n'ont jamais mis à jour `produits.stock`/`sticks_catalogue.stock` à aucune étape de leur cycle de vie. Le stock était conçu comme un champ géré exclusivement à la main par l'admin (bouton 📦 "Stock", `modifierStock()` avec `prompt()`) — confirmé en lisant `passerCommande` (Matos, le module le plus ancien et déjà en usage), qui ne touche jamais à `produits.stock` malgré une vérification de quota dans la même fonction.

**Décision prise cette session** : décrémentation automatique demandée explicitement, avec une règle de timing précise validée avant codage — le stock baisse uniquement quand le paiement est **confirmé**, jamais à la simple création d'une demande :
- **Matos** : `updateCommandeStatut(id, statut)` décrémente le stock de chaque `commande_items` uniquement lors de la transition **vers** `'validee'` (jamais si déjà à ce statut ou au-delà, pour éviter une double décrémentation en cas de rappel/double-clic).
- **Sticks, mode cash/gratuit** : `distribuerStickAdmin` décrémente immédiatement à l'insertion — le paiement est par construction déjà confirmé (encaissé en présentiel via la modale de validation).
- **Sticks, mode HelloAsso** : la distribution est créée en `statut: 'en_attente'` sans toucher au stock ; la décrémentation n'a lieu que dans `validerPaiementStick`, au moment de la confirmation du paiement.
- Toutes les décrémentations utilisent `Math.max(0, stock - quantite)` pour ne jamais passer en négatif.

**Point de vigilance pour la suite** : ce changement ne couvre que les chemins de code identifiés cette session (`updateCommandeStatut`, `distribuerStickAdmin`, `validerPaiementStick`). `demanderStick` (ancien flux d'auto-demande cash côté membre, retiré de l'UI cette session — cf. changement de flux Cash vers validation Admin-only) n'a pas été mise à jour en cohérence, mais n'a plus aucun appelant donc le risque est nul tant qu'elle n'est pas réintroduite dans l'UI sans vérification préalable.

**Fichiers concernés** : `src/supabase-client.js` (`updateCommandeStatut`, `distribuerStickAdmin`, `validerPaiementStick`).

---

## 27. Nouveau fichier JS jamais ajouté à la liste `NETWORK_FIRST` du Service Worker — mise à jour invisible côté navigateur

**Symptôme** : `src/scan.js` ajouté au projet (nouveau composant scan QR membre), bouton correspondant visible dans l'UI, mais le clic ne déclenche absolument rien — aucune erreur visible, aucun effet.

**Cause réelle (découverte en deux temps)** :
1. `scan.js` n'avait pas été ajouté à la liste `NETWORK_FIRST` de `sw.js` — exactement le même piège déjà documenté et corrigé en v3 du Service Worker pour les autres modules (`app.js`, `boutique.js`, etc.), reproduit par oubli sur un fichier ajouté après coup. Pire : `index.html` lui-même était encore en cache-first (`ASSETS`), donc même la balise `<script src="src/scan.js">` ajoutée à `index.html` pouvait ne jamais être reçue par un navigateur ayant déjà une version en cache.
2. **Cause plus simple et antérieure, découverte ensuite** : le fichier `scan.js` n'avait en réalité jamais été placé dans `src/` sur le dépôt GitHub — créé au mauvais endroit (racine du dépôt), donc `<script src="src/scan.js">` pointait vers une ressource inexistante (404 silencieux, aucune erreur bloquante visible sans ouvrir l'onglet Network/Console). Cette cause suffisait seule à expliquer tout le symptôme ; la cause Service Worker (#1) était un vrai problème mais secondaire dans ce cas précis.

**Fix** :
- `sw.js` : ajout de `scan.js` à `NETWORK_FIRST`, déplacement de `/` et `/index.html` de `ASSETS` vers `NETWORK_FIRST` (pour qu'un nouveau fichier JS ajouté au projet soit toujours découvert, même sans modifier `sw.js` à chaque fois), `CACHE_NAME` bumpé `v5` → `v6` pour invalider tout cache existant.
- Déplacement du fichier au bon emplacement (`src/scan.js`).

**Méthode de diagnostic qui a fonctionné** : demander confirmation explicite, étape par étape, de l'emplacement réel du fichier sur GitHub plutôt que de supposer que "j'ai bien recollé X" signifie "au bon endroit avec le bon contenu" — une suite de questions fermées ("le bouton apparaît-il ?", "que vois-tu en ouvrant scan.js sur GitHub ?") a révélé la cause bien plus vite qu'une investigation côté code, qui était lui-même irréprochable.

**Fichiers concernés** : `sw.js`, emplacement de `src/scan.js`.

---

## 28. `arreterCameraScan()` — erreur synchrone de `html5-qrcode` non catchée bloque le bouton "Fermer"

**Symptôme** : dans la modale de scan QR, le bouton "Fermer" ne fait rien (aucune fermeture, aucune erreur visible dans l'UI).

**Cause** : `Html5Qrcode.stop()` lève une erreur **synchrone** (`Cannot stop, scanner is not running or paused`) quand on l'appelle sur une instance dont le scanner n'a jamais réellement démarré (cas réel : caméra indisponible, comme sur un PC de bureau sans webcam accessible — message "Caméra indisponible, utilise la saisie manuelle" déjà affiché par ailleurs). Le code appelait `.stop().catch(() => {})`, ce qui ne protège que contre un rejet de **promesse** — l'erreur synchrone, levée avant même la création de cette promesse, n'était jamais interceptée. Elle remontait donc telle quelle et interrompait toute la fonction appelante (`closeModalScan`), empêchant `closeModal('modalScan')` de s'exécuter.

**Fix** : `arreterCameraScan()` encapsule maintenant l'appel à `.stop()` dans un `try/catch` classique (pas seulement un `.catch()` sur la promesse retournée), pour intercepter aussi bien l'erreur synchrone que le rejet asynchrone.

**Méthode de diagnostic qui a fonctionné** : appeler directement la fonction suspecte (`closeModalScan()`) depuis la console du navigateur plutôt que de re-cliquer sur le bouton — l'erreur complète avec sa stack (`Uncaught Cannot stop, scanner is not running or paused`, pointant vers `html5-qrcode.min.js`) est apparue immédiatement, alors qu'un clic UI normal ne montre jamais la stack d'erreur sans ouvrir la console au bon moment.

**Fichiers concernés** : `src/scan.js`.

---

## 29. `getAllDistributions()` — jointure ambiguë vers `membres` (deux FK sur la même table), jamais détectée avant le premier appel réel

**Symptôme** : le scan QR membre, contexte Sticks, affiche systématiquement "Aucune remise en attente pour {nom}" alors que des distributions `en_attente` existent bel et bien en base pour ce membre (vérifié directement par requête SQL).

**Cause** : `sticks_distribution` a **deux** clés étrangères vers `membres` — `membre_id` (le destinataire) et `distribue_par` (qui a enregistré la distribution). La requête `select('*, membre:membres(...))` ne précisait pas laquelle utiliser ; PostgREST refuse une telle requête avec une erreur d'ambiguïté (statut HTTP 300, `Could not embed because more than one relationship was found...`) plutôt que de deviner. `getAllDistributions()` n'avait **aucune gestion d'erreur** (`const { data } = await ...` sans vérifier `error`), donc `data` valait `null`, et la fonction retournait silencieusement `[]` — masquant complètement l'erreur réelle. Bug **préexistant à cette session** : cette fonction n'avait jamais été appelée en conditions réelles avant que le scan QR ne soit la première fonctionnalité à s'y fier vraiment pour produire un résultat affiché à l'utilisateur.

**Fix** : précision explicite de la contrainte FK à utiliser avec la syntaxe `membre:membres!sticks_distribution_membre_id_fkey(...)`, et ajout de la gestion d'erreur manquante (`if (error) throw error`) pour qu'un futur problème similaire remonte visiblement au lieu de se traduire par un résultat vide trompeur.

**Vérification complémentaire effectuée** : recherche de toutes les tables ayant plus d'une FK vers `membres` (`information_schema`), une seule autre table concernée (`evaluations`, via `notee_par` et `membre_id`) — déjà correctement écrite partout où elle est jointe (`membres!evaluations_notee_par_fkey`), donc aucune autre correction nécessaire.

**Méthode de diagnostic qui a fonctionné** : isoler la requête en console, d'abord sans jointure (`select('*')` → fonctionne, 2 lignes) puis avec jointure (`select('*, membre:membres(...))` → `success:false`, statut 300) pour localiser précisément quelle partie de la requête posait problème, puis lire le message d'erreur PostgREST complet (`r.error.message`) qui nomme explicitement les deux contraintes FK en conflit et la syntaxe de résolution attendue.

**Fichiers concernés** : `src/supabase-client.js` (`getAllDistributions`).

---

## 30. Stick "Tous les membres" sans lien HelloAsso — aucun moyen d'achat pour un membre normal

**Symptôme** : un stick créé en catégorie "Tous les membres", sans lien HelloAsso renseigné dans le formulaire de création, est bien **visible** dans le catalogue pour n'importe quel membre (cohérent, `getSticks()` filtre correctement sur `niveau_acces`), mais reste **inachetable** : aucun bouton d'action n'apparaît pour un membre normal sur sa carte.

**Cause** : `renderSticks()` (boutique.js) n'affiche que deux boutons d'action — "HelloAsso" (visible uniquement si `s.lien_helloasso` est renseigné) et "Cash" (visible uniquement pour `hasCelluleSticks(m)`, donc jamais pour un membre normal). Un stick sans lien HelloAsso et niveau_acces="tous" retombe dans un angle mort : aucune des deux conditions n'est remplie pour un membre simple.

**Statut : non corrigé, en attente de décision produit.** Trois pistes évoquées avec Remi, aucune tranchée à la fin de cette session :
1. Réintroduire un flux d'auto-demande côté membre (proche de l'ancienne `demanderStick()`, retirée de l'UI lors d'une session antérieure) — le membre se signale, la Cellule confirme la remise/l'encaissement physiquement ensuite.
2. Rendre le lien HelloAsso obligatoire à la création d'un stick payant (comme prévu à l'origine, avant d'être rendu optionnel faute d'accès HelloAsso — cf. session du 20/06).
3. Rendre le bouton "Cash" visible pour tous les membres (pas seulement la Cellule Sticks) quand aucun lien HelloAsso n'existe — le membre se signale lui-même, la Cellule confirme ensuite (recoupe en partie avec le futur flux de confirmation par scan QR, cf. #29 et le chantier QR code membre).

**Lien avec le chantier QR code membre** : la piste 1 ou 3 ci-dessus s'articulerait naturellement avec le bouton manuel de filet de secours déjà ajouté (`doConfirmerDistributionManuelle`, accessible depuis "Historique distributions") et avec le scan lui-même — une fois la demande créée en `en_attente` par n'importe quel mécanisme, la confirmation finale (scan ou bouton manuel) fonctionne déjà correctement quel que soit qui a initié la demande.

**Fichiers concernés (si correction future)** : `src/boutique.js` (`renderSticks`), `src/supabase-client.js` (éventuel nouveau flux d'auto-demande).

---

## 31. Modal Matchs — bouton partagé jamais réactivé après un succès (modification et confirmation bloquées après le premier succès)

**Symptôme** (signalé par Remi le 05/07/2026) : cliquer sur ENREGISTRER (mode "Modifier le match") ou CONFIRMER (mode "Confirmer la date") ne faisait plus rien du tout — aucun toast, aucune erreur, même pas dans la console du navigateur. Le modal restait ouvert, figé.

**Cause** : `#modalMatchsSubmitBtn` est un seul et même bouton HTML, recyclé dynamiquement entre les 3 modes du modal `modalMatchs` (Ajouter / Modifier / Confirmer la date — cf. `ouvrirModifierMatch`/`ouvrirConfirmerDate`/`annulerConfirmerDate`, tous dans `src/admin.js`). Dans `doModifierMatch()` et `doConfirmerDateMatch()`, le bouton était mis en `disabled = true` avant l'appel réseau, mais réactivé (`disabled = false`) **uniquement dans le bloc `catch`** — jamais après un succès. `doAjouterMatch()`, elle, avait toujours utilisé un bloc `finally`, d'où l'absence de bug sur ce mode précis. Résultat : la toute première modification ou confirmation réussie laissait le bouton bloqué `disabled=true` pour de bon — et un bouton HTML `disabled` ne déclenche même pas l'événement `click` du navigateur, d'où le silence total (y compris console) au clic suivant, quel que soit le mode.

**Correction** : ajout d'un bloc `finally { if (btn) btn.disabled = false; }` dans les deux fonctions, qui réactive le bouton systématiquement (succès ou erreur) — le texte du bouton, lui, reste géré séparément (restauré uniquement en cas d'erreur dans `catch`, car un succès le fait déjà repasser dans un autre mode via `annulerConfirmerDate()`, qui fixe elle-même le nouveau texte).

**Effet de bord retiré au passage** : un écouteur `document.getElementById('modalMatchs')?.addEventListener('ul:show', loadMatchsList)` en fin de fichier ne servait à rien — l'événement personnalisé `ul:show` n'est déclenché nulle part dans le code (`showModal()` ne l'émet jamais). Le rechargement de la liste à l'ouverture est en réalité déjà géré explicitement par le bouton d'entrée (`index.html` : `onclick="showModal('modalMatchs');loadMatchsList()"`). Ligne morte supprimée.

**Fichiers concernés** : `src/admin.js` (`doModifierMatch`, `doConfirmerDateMatch`, suppression de l'écouteur mort).

---

## 32. `ouvrirConfirmerDate` — champs date/horaire/stade vidés au lieu d'être pré-remplis

**Symptôme** (signalé par Remi le 05/07/2026, juste après la correction du bug #31) : la modification d'un match fonctionnait de nouveau, mais passer un match en statut confirmé ne fonctionnait toujours pas.

**Cause** : `ouvrirConfirmerDate(matchId)` réinitialisait les champs `mDate`/`mHeure`/`mStade` à une chaîne vide au lieu de les pré-remplir avec les valeurs actuelles du match (contrairement à `ouvrirModifierMatch`, qui reçoit l'objet `match` complet et pré-remplit correctement tous les champs). Un admin cliquant directement sur "✅ Confirmer" sans ressaisir une date — en pensant confirmer celle déjà affichée dans la liste juste au-dessus — se heurtait au garde-fou `if (!date) return toast('Date requise', 'error')` de `doConfirmerDateMatch()` : la confirmation refusait silencieusement de partir tant que le champ Date restait vide, ce qui donnait l'impression que "confirmer ne marche pas".

**Correction** : `ouvrirConfirmerDate` retrouve désormais le match dans `allMatchsAdmin` (même cache déjà utilisé par `ouvrirModifierMatchParId`, peuplé par `loadMatchsList`) et pré-remplit les 3 champs avec ses valeurs actuelles — l'admin n'a plus qu'à ajuster ce qui a réellement changé (souvent rien pour la date, parfois seulement l'horaire ou le stade), au lieu de tout ressaisir. `mCompGroup` est aussi explicitement masqué dans cette fonction (il pouvait rester visible si un "Modifier" avait été ouvert juste avant).

**Fichiers concernés** : `src/admin.js` (`ouvrirConfirmerDate`).

---

## 33. Décrémentation du stock Matos jamais déclenchée pour un paiement HelloAsso

**Contexte** : trouvé le 05/07/2026 en modifiant `updateCommandeStatut()` (supabase-client.js) pour ajouter le bouton Cash admin sur Matos — pas un bug signalé par un test utilisateur, mais une relecture qui a révélé un trou resté invisible depuis la restructuration Matos/Sticks du même jour.

**Cause** : la décrémentation du stock se faisait dans `updateCommandeStatut()` (fonction JS, `supabase-client.js`), déclenchée à la transition `en_attente` → `disponible`/`precommande_validee`. Pour un paiement **Cash**, cette transition est bien déclenchée côté client (`confirmerPaiementCashCommande`, qui appelle `updateCommandeStatut`) — la décrémentation fonctionnait donc pour ce mode. Mais pour un paiement **HelloAsso**, cette même transition est déclenchée par l'Edge Function `helloasso-webhook` — du code Deno qui tourne côté serveur, entièrement séparé du bundle JS front, et qui ne peut évidemment pas appeler une fonction JS du navigateur. Le webhook écrivait directement le nouveau statut en base sans jamais passer par `updateCommandeStatut()` — la décrémentation ne se déclenchait donc **jamais** pour un achat Matos payé en HelloAsso.

**Pourquoi Sticks n'avait pas ce bug** : `validerPaiementStick()` (la fonction qui décrémente le stock des sticks) est appelée à la confirmation de remise (scan ou bouton manuel) — un moment qui est **toujours** côté client, quel que soit le mode de paiement d'origine. Matos, lui, décrémentait plus tôt dans le cycle (au paiement, pas à la remise), un moment qui n'est côté client que pour le Cash.

**Correction** : décrémentation déplacée sur la transition vers `'distribue'` (confirmation de retrait, scan ou bouton manuel — cf. `doConfirmerRetraitMatos`, scan.js) — unifié avec le comportement de Sticks, correct quel que soit le mode de paiement.

**Point de vigilance pour la suite** : toute logique métier qui doit se déclencher "au paiement confirmé" doit être vérifiée pour les DEUX chemins de confirmation (webhook serveur ET action admin cliente) dès qu'un module a un flux de paiement HelloAsso automatisé — une fonction JS seule ne peut jamais couvrir le chemin webhook.

**Fichiers concernés** : `src/supabase-client.js` (`updateCommandeStatut`).

---

- **Reproduire un bug exige parfois un état précis** (ex: un tifo où l'on n'est *pas encore* inscrit) — un test sur le mauvais état peut masquer le vrai bug derrière un comportement différent mais correct (ex: doublon d'inscription qui ressemble au bug recherché mais n'en est pas la cause).
- **Un renommage en masse de fichiers (GitHub web, script) peut introduire un caractère invisible (espace en tête) sans qu'aucun affichage standard ne le révèle** — si toutes les requêtes vers un dossier entier renvoient 404 alors que le déploiement est confirmé réussi et le chemin visuellement correct, vérifier l'URL "Raw" d'un seul fichier individuel avant de chercher plus loin.
- **Un fallback de Service Worker ou de routeur qui retombe sur la page d'accueil en cas d'échec réseau peut maquiller une vraie 404 en "redirection"** — si une ressource semble "rediriger vers l'app" au lieu d'afficher une erreur claire, soupçonner un `catch()`/fallback générique avant de chercher un bug applicatif.
- **Un message d'erreur générique ("Token has expired or is invalid", "No API key found in request") peut être renvoyé pour des causes complètement différentes de ce qu'il suggère littéralement** — avant d'investiguer la piste évidente (expiration, clé API), vérifier d'abord que les *paramètres envoyés* sont strictement corrects (type, longueur, casse) : un mismatch de paramètre produit souvent le même message générique qu'une vraie expiration/erreur d'auth, côté GoTrue/Supabase comme côté beaucoup d'API tierces.
- **Ne jamais coder en dur une contrainte de format (longueur de code, structure de token) par analogie avec un usage "habituel" sans la vérifier dans la documentation officielle ou directement dans la donnée réelle reçue** — l'hypothèse "OTP = 6 chiffres" (vraie pour SMS/Google Auth) a fait perdre du temps face à un OTP email Supabase qui en génère 8 par défaut ; comparer le contenu brut reçu (ex: email complet) avec ce que le champ de saisie accepte est le test le plus rapide pour détecter une troncature silencieuse.
- **Un champ de statut/enum avec un nombre limité de valeurs valides doit être vérifié à la source (commentaire de code, contrainte SQL, ou test direct) avant d'écrire une comparaison dessus** — deux bugs distincts cette session (#19, #20) venaient de la même confusion entre `membre.statut` (3 valeurs seulement) et les niveaux de droits réels gérés par `roles_app[]` (un tableau, pas un statut). Une recherche globale (`grep`) des valeurs supposées valides dans tout le code applicatif aurait révélé l'absence totale de `'admin'`/`'bureau'`/`'membre_cellule'` comme valeurs de `statut`, avant même d'écrire le correctif.
- **Du code non branché à l'UI (fonction exportée mais jamais appelée) peut survivre longtemps sans être détecté, et accumuler ses propres bugs en silence** — `rattacherCellule()` contenait un bug de statut invalide en plus d'être totalement déconnectée ; un simple `grep` du nom de fonction dans `src/*.js` + `index.html` suffit à vérifier si une fonction est réellement utilisée avant de lui faire confiance ou de la corriger en place.
- **Le schéma réel de la base (colonnes, buckets Storage, policies RLS) doit être vérifié par une requête `information_schema`/Table Editor avant d'écrire toute nouvelle fonction d'écriture** — une fonction de *lecture* préexistante qui semblait fonctionner (`getSticks()` lisant `niveau_acces`) ne prouve pas que la colonne existe réellement ; elle peut simplement n'avoir jamais été testée avec des données réelles. Le bug #24 a cumulé cinq variantes de ce même piège en une seule session.
- **Un champ utilisé par une logique de vérification métier doit avoir un chemin de saisie dans le formulaire correspondant, vérifié explicitement** — sinon la valeur en base part d'un défaut arbitraire qui ne se révèle que le jour où la vérification se déclenche réellement (bug #25 : quota jamais saisi, jamais à zéro, bloquant silencieusement le premier test venu).
- **Une table avec plusieurs clés étrangères vers la même table cible exige de préciser explicitement quelle contrainte utiliser dans toute jointure Supabase/PostgREST** (`table!nom_contrainte_fkey`) — sans ça, PostgREST refuse la requête avec un statut 300 plutôt que de deviner, et si la fonction appelante n'a pas de gestion d'erreur (`if (error) throw error`), le symptôme observé est un résultat vide trompeur, pas un message d'erreur explicite (bug #29). Avant d'écrire une jointure `table:autre_table(...)`, vérifier par une requête sur `information_schema` si la table cible a plus d'une FK vers la table source.
- **Ajouter un nouveau fichier JS au projet est une opération à deux endroits minimum, pas un** (`index.html` pour le `<script src>`, ET `sw.js` pour `NETWORK_FIRST`) — oublier le second produit un bug à retardement qui n'apparaît que sur un navigateur ayant déjà une version mise en cache, jamais sur le premier test en local/incognito (bug #27). Avant de considérer un nouveau fichier comme "déployé", vérifier les deux.
- **Quand un symptôme semble correspondre exactement à un bug déjà documenté et corrigé dans une session antérieure (ici : cache Service Worker, déjà vu en #4), commencer par vérifier les causes les plus simples et antérieures (le fichier existe-t-il au bon endroit ?) avant de réappliquer le correctif déjà connu** — la vraie cause du bug #27 était une erreur d'emplacement de fichier, pas (uniquement) une lacune du Service Worker ; corriger uniquement `sw.js` aurait laissé le symptôme intact.
- **Une erreur synchrone levée par une librairie tierce n'est jamais interceptée par un simple `.catch()` sur la valeur de retour** — seul un vrai rejet de Promise l'est. Si une fonction tierce peut échouer de façon synchrone selon l'état interne (`Html5Qrcode.stop()` si le scanner n'a jamais démarré, bug #28), l'appel doit être enveloppé dans un `try/catch` classique, le `.catch()` de la promesse ne suffisant qu'au cas où l'échec survient bien après le démarrage de l'opération asynchrone.
- **Un bouton `disabled` pendant un appel réseau doit être réactivé dans un bloc `finally`, jamais seulement dans le `catch`** — sinon le chemin de succès laisse le bouton bloqué. Ce risque est démultiplié quand un même élément DOM est recyclé entre plusieurs modes d'un même formulaire (ex: `modalMatchsSubmitBtn` partagé entre Ajouter/Modifier/Confirmer, bug #31) : un bouton HTML disabled ne déclenche même pas l'événement `click`, donc le symptôme est un silence total, sans la moindre erreur console — le signal le plus trompeur qui soit pour diagnostiquer.
- **Un formulaire réutilisé en mode "confirmer/valider une valeur existante" doit pré-remplir les champs avec les valeurs actuelles, jamais les vider** — sinon un garde-fou de validation légitime (`if (!champ) return`) se déclenche silencieusement dès que l'utilisateur ne ressaisit pas une valeur qu'il pensait déjà présente (bug #32). Avant d'écrire un mode "confirmation" qui réutilise un formulaire d'ajout, vérifier explicitement ce que chaque champ affiche à l'ouverture, pas seulement ce qu'il fait à la soumission.

- # Nouvelles entrées BUGS — session du 21/07/2026

*À fusionner dans `docs/BUGS.md` existant (numérotation à reprendre à la suite de la dernière entrée réelle du fichier — non fournie cette session, donc non renumérotée ici). Classées par ordre chronologique de découverte.*

---

### 🔴 CRITIQUE — Trigger d'inscription cassé, bloquait TOUTES les créations de compte
**Symptôme** : erreur `relation "public.commandes_preinscriptions" does not exist` au clic sur "Créer mon compte", pour n'importe quel nouvel utilisateur.
**Cause** : le trigger `rattacher_preinscriptions_membre()` (exécuté après chaque INSERT sur `membres`) référençait une table qui n'existe pas réellement — introduite par erreur lors d'une réécriture du trigger pour ajouter le recalcul de `cartage_depuis`. La conception réelle utilise `commandes.email_preinscription`, pas une table séparée.
**Fenêtre d'impact** : environ 19h07 → 19h34 le 20/07/2026.
**Détecté par** : Johnny UDE et Mounirou (Abdou Espérant), via capture d'écran de l'erreur.
**Corrigé** : réécriture du trigger avec la bonne référence (`email_preinscription`).
**Séquelles traitées** : 7 comptes `auth.users` orphelins (créés mais sans fiche `membres`) identifiés et récupérés ou supprimés selon le cas — voir synthèse de session pour le détail.
**Non couvert avant ce bug** : aucun moyen pour un membre de récupérer seul un code de confirmation perdu après avoir quitté l'app — corrigé en ajoutant un lien "Compte non confirmé ? Renvoyer le code" sur l'écran de connexion.

---

### 🟠 Quota boutique/déplacement comptait les commandes non payées
**Symptôme** : un membre ayant abandonné ou annulé un paiement (HelloAsso non finalisé, ou cash jamais collecté) ne pouvait plus repasser commande sur un article à quota limité.
**Signalé par** : Brahim Bennais, bloqué sur "Tour de Cou UL" (quota 1) après une tentative HelloAsso annulée.
**Cause** : les contrôles de quota (`passerCommande`/`distribuerProduitAdmin` côté front, `traiterMatos`/`traiterStick`/`traiterDeplacement` côté Edge Function `helloasso-create-checkout`) comptaient les commandes en statut `en_attente` (ou, pour les déplacements, absolument tous les statuts) au lieu de ne compter que les statuts réellement payés.
**Corrigé** : filtrage sur les statuts payés uniquement (`disponible`/`precommande_validee`/`distribue`/`prepare` pour Matos/Sticks ; `paye_ha`/`paye_cash` pour Déplacements). `traiterCartage` était déjà correct, non modifié. `helloasso-webhook` ne contient aucune logique de quota, non modifié.
**⚠️ Non vérifié en conditions réelles après déploiement** — pas de cas de test disponible.

---

### 🟠 Table `cartage_preinscriptions` sans policy RLS → export "Cartage non inscrits" toujours vide
**Symptôme** : le bouton "Cartage non inscrits" affichait systématiquement "tout le monde est déjà inscrit", alors qu'il restait 158 personnes en attente en base.
**Cause** : la table n'avait aucune policy de lecture pour le rôle `authenticated` (accès réservé à `service_role` par conception initiale) — une requête depuis l'app renvoyait donc silencieusement 0 ligne au lieu d'une erreur visible.
**Corrigé** : ajout d'une policy de lecture réservée Admin/Bureau (vérification du rôle via `roles_app`).

---

### 🟡 Widget Accueil "Prochaine session tifo" — régression du tri
**Symptôme** : les sessions tifo complètes réapparaissaient en premier sur le widget d'accueil, alors que la règle "non-complètes en premier" avait déjà été mise en place (et fonctionnait correctement sur la page Tifos elle-même).
**Cause** : en réécrivant `app.js` pour une fonctionnalité sans rapport (renvoi de code de confirmation), une version antérieure du fichier a été reprise par erreur, effaçant le tri sans que ce soit visible immédiatement.
**Corrigé** : tri réappliqué sur le widget concerné.

---

### 🟡 Texte "Liste Bus" Telegram — "PAYÉS (2/null)"
**Symptôme** : l'export texte Telegram d'un déplacement sans quota de places défini affichait littéralement "null" au lieu d'omettre la dénominateur.
**Signalé par** : Paul Coyette.
**Cause** : `getListeBusTelegram` interpolait `deplacement.places_max` sans vérifier sa présence.
**Corrigé** : le dénominateur n'apparaît plus quand `places_max` est vide (quota illimité).

---

### ⚪ Deux fautes de données ponctuelles (base, pas de code)
- Nom de famille mal orthographié "Roussrl" au lieu de "Roussel" (Bertrand Roussel) — corrigé sur signalement de Remi.
- Codes de réabonnement de Julien et Keissy Constantin inversés entre deux emails lors d'un import — corrigé sur clarification de Remi.
- Code de réabonnement de Da Costa Louka dupliqué avec celui d'Abel Stefani dans les données source de Remi — **non résolu**, laissé en l'état sur instruction explicite ("on laisse comme ça pour le moment").
