# Plan d'intégration HelloAsso — Ultras Lutetia PWA

*Préparé le 21/06/2026, en l'absence des accès HelloAsso. À valider/ajuster une fois les accès obtenus, mais conçu pour être actionnable directement à ce moment-là.*

Sources : documentation officielle `dev.helloasso.com` (consultée le 21/06/2026, pages "Introduction à l'API", "Obtenir une clé API", "S'authentifier", "Guide d'intégration", "Validation de vos paiements", "Etats des paiements", "Définir une URL de notification", "Vérifier l'authenticité", endpoint `POST /v5/organizations/{slug}/checkout-intents`).

---

## 1. État actuel du code (rappel)

Aucun appel API HelloAsso n'existe aujourd'hui dans `ultras-lutetia`. Partout (`boutique.js`, `calendrier.js`, `deplacements.js`, `supabase-client.js`), HelloAsso n'est qu'un **lien externe statique** saisi à la main par un admin (`lien_helloasso` en base), suivi d'une **validation manuelle** : un Admin/Bureau clique sur un bouton "Valider HelloAsso" après avoir vérifié à l'œil que le paiement est bien arrivé sur le compte HelloAsso de l'asso. Aucun webhook, aucun polling, aucune confirmation automatique.

Modules concernés et fonctions de validation manuelle existantes (toutes à terme remplaçables/complétées par de l'automatique) :

| Module | Fonction manuelle existante | Lien stocké en base |
|---|---|---|
| Déplacements | `validerPaiementHelloAsso(deplacementId, membreId)` | `deplacements.lien_helloasso` |
| Boutique (Matos) | — (pas encore de validation HA dédiée, mode `helloasso` existe sur la commande) | — |
| Sticks | `validerPaiementStick` (cf. session précédente) | `sticks_catalogue.lien_helloasso` |
| Cotisation → **Cartage** (renommage à faire) | `validerCotisationHelloAsso(membreId)` | `config_asso.cotisation_lien_helloasso` |
| Événements (Calendrier) | — (lien informatif uniquement, pas de flux de paiement suivi) | `evenements.lien_helloasso` |
| Dons | n'existe pas encore comme module | — |

---

## 2. Ce que propose réellement l'API HelloAsso

### 2.1 Deux niveaux d'intégration, à ne pas confondre

1. **Lien statique** (état actuel) — formulaire créé à la main dans le back-office HelloAsso, lien copié-collé dans l'app. Zéro code, zéro automatisation. Reste valable comme solution de repli partout où on ne veut pas investir dans l'intégration technique (ex. Dons, dans un premier temps).

2. **HelloAsso Checkout (API)** — l'app crée *dynamiquement* une intention de paiement adaptée au panier exact (montant, libellé, métadonnées internes), redirige le membre vers une page de paiement HelloAsso hébergée, puis récupère la confirmation par **webhook** (recommandé) ou **polling**. C'est ce niveau qu'il faut viser pour Déplacements, Matos, Sticks et Cartage (cotisation), où le montant varie selon ce que le membre commande.

### 2.2 Authentification (OAuth2 Client Credentials)

- À récupérer dans **Mon Compte → Intégrations et API** sur le compte association HelloAsso (pas besoin d'être "partenaire" pour ça) : un `client_id` + `client_secret`.
- Échange du token :
  ```
  POST https://api.helloasso.com/oauth2/token
  Content-Type: application/x-www-form-urlencoded

  grant_type=client_credentials&client_id=XXX&client_secret=YYY
  ```
  Réponse : `access_token` (validité **30 min**), `refresh_token` (validité **30 jours**), `token_type: bearer`, `expires_in`.
- Renouvellement : `grant_type=refresh_token&refresh_token=...` sur la même route. **Ne jamais redemander un token via client_id/secret à chaque appel** — limite de 20 access_tokens simultanés par clé API. Il faut donc un mécanisme de cache/refresh côté Edge Function (cf. §4).
- Environnement de test (sandbox) disponible séparément : `api.helloasso-sandbox.com` (mêmes routes, credentials différents). **Utile pour tester tout le flux avant le vrai lancement, sans toucher au compte réel.**

### 2.3 Création d'un Checkout (l'endpoint clé)

```
POST https://api.helloasso.com/v5/organizations/{organizationSlug}/checkout-intents
Authorization: Bearer {access_token}
Content-Type: application/json
```

Corps de la requête (`InitCheckoutBody`) :

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `totalAmount` | int (centimes) | ✅ | Montant total TTC. Doit = `initialAmount` + somme des `terms` |
| `initialAmount` | int (centimes) | ✅ | Montant de la 1ère échéance (= `totalAmount` si paiement comptant) |
| `itemName` | string (1–250 car.) | ✅ | Libellé affiché au membre et dans le back-office HA ("Déplacement Troyes", "Cotisation 2026-2027", "Stick collector"...) |
| `backUrl` | string (URL) | ✅ | URL si le membre annule et veut revenir sur l'app |
| `errorUrl` | string (URL) | ✅ | URL en cas d'erreur pendant le paiement |
| `returnUrl` | string (URL) | ✅ | URL après paiement (succès ou échec) — **affichage seulement, pas fiable pour valider, cf. §2.4** |
| `containsDonation` | bool | ✅ | Indique si (une partie de) la vente est un don |
| `terms` | array `{amount, date}` | optionnel | Échéances futures, si paiement en plusieurs fois |
| `payer` | objet | optionnel | Pré-remplissage : `firstName`, `lastName`, `email`, `dateOfBirth`, `address`, `city`, `zipCode`, `country` (code 3 lettres), `companyName` |
| `metadata` | JSON libre (max 20000 car.) | optionnel | **Le plus important pour nous** : on y met l'identifiant interne (ex. `{ "type": "deplacement", "deplacement_id": "...", "membre_id": "..." }`) — cet objet est renvoyé tel quel dans le webhook de confirmation |
| `paymentOptions.enableSepa` | bool | optionnel | Active le prélèvement SEPA pour ce checkout |

Réponse (`InitCheckoutResponse`) :
```json
{ "id": 12345, "redirectUrl": "https://www.helloasso.com/associations/.../checkout/..." }
```
→ On stocke `id` (le `checkoutIntentId`) côté Supabase, et on redirige le membre (ou on ouvre `redirectUrl` dans un nouvel onglet/webview) vers cette URL.

**Restriction importante (juin 2025)** : si l'association n'est pas *vérifiée* auprès de HelloAsso (conformité L561-5 du Code monétaire et financier), l'appel renvoie une erreur **409**. Il faudra vérifier le statut de vérification d'Ultras Lutetia dès l'obtention des accès — sinon rediriger vers `https://admin.helloasso.com/{slug}/verification`. Vérifiable aussi via `GET /v5/organizations/{slug}` (champ `isCashInCompliant`, visible seulement avec rôle `OrganizationAdmin`).

### 2.4 Confirmation du paiement — 3 mécanismes, à combiner

1. **`returnUrl` (jamais suffisant seul)** : l'utilisateur est redirigé avec `?type=return&checkoutIntentId=3&code=succeeded`, mais ce code n'est pas fiable (perte de connexion, fermeture d'onglet, falsification possible). **Bon uniquement pour afficher un écran "merci, en cours de confirmation".**

2. **Webhook (recommandé, à privilégier)** : HelloAsso pousse un événement vers une URL qu'on configure. Deux notifications distinctes par achat :
   - `eventType: "Order"` — la commande est créée
   - `eventType: "Payment"` — le paiement est autorisé (ou refusé/remboursé/contesté)

   Exemple de payload "Paiement autorisé sur un checkout" :
   ```json
   {
     "data": {
       "order": { "id": 22707, "formType": "Checkout", "organizationSlug": "...", ... },
       "payer": { "email": "...", "firstName": "...", "lastName": "..." },
       "items": [{ "amount": 6000, "type": "Payment", "state": "Processed", "name": "..." }],
       "cashOutState": "Transfered",
       "amount": 1000,
       "paymentMeans": "Card",
       "state": "Authorized"
     },
     "eventType": "Payment",
     "metadata": { "deplacement_id": "...", "membre_id": "..." }
   }
   ```
   → **`metadata` est exactement ce qu'on a envoyé à la création du checkout.** C'est le lien direct entre le paiement HelloAsso et notre ligne en base (déplacement, commande Matos, distribution Stick, cotisation).

   Configuration : en tant qu'**association simple** (pas partenaire), l'URL de webhook se configure dans le back-office HelloAsso → **Mon Compte → Intégrations et API** (pas via API). Un seul champ `url`. Pour tester en amont sans back-office, on peut utiliser `webhook.site` (URL temporaire) pour observer le format réel des appels.

   **Limite de sécurité importante pour nous** : la vérification cryptographique par signature `x-ha-signature` (HMAC-SHA256) **n'est disponible que pour les comptes partenaires**, pas pour une association simple. En association simple, la seule vérification possible est le **whitelisting d'IP source** :
   - IP Production : `51.138.206.200`
   - IP Sandbox/Test : `4.233.135.234`

   → conséquence directe sur la conception de l'Edge Function (cf. §6.3).

   Fiabilité de la livraison : en cas de non-réponse 200 de notre côté, HelloAsso retente avec un intervalle `min(48h, 3 × 2^tentative)`, jusqu'à 16 essais sur ~27h. **Donc notre Edge Function doit toujours répondre 200 rapidement**, même si le traitement interne échoue (sinon on perd l'historique de retry pour rien) — ou alors gérer l'idempotence proprement pour qu'un retry ne double pas l'effet (cf. §6.4).

3. **Polling (filet de sécurité, pas la méthode principale)** :
   ```
   GET https://api.helloasso.com/v5/organizations/{slug}/checkout-intents/{checkoutIntentId}
   ```
   Renvoie `id`, `redirectUrl`, `metadata`, et `order` (rempli seulement si le paiement a réussi). Utile en tâche de fond (cron Supabase) pour rattraper un webhook qui n'arriverait jamais, ou pour détecter un **paiement abandonné** : si après **45 minutes** ni webhook ni polling ne montrent de paiement, le checkout peut être considéré comme abandonné.

### 2.5 États possibles (`payment.state`)

`Pending` (échéance à venir) · `WaitingBankValidation` (mandat SEPA en attente) · `Authorized` (paiement accepté — **l'état qui nous intéresse pour débloquer l'accès/décrémenter le stock**) · `Refused` · `Unknow` · `Registered` (paiement hors-ligne, espèces/chèque) · `Refunded` · `Refunding` · `Contested`.

États de versement (`cashOutState`, indépendant) : `WaitingForCashOutConfirmation` · `TransferInProgress` · `Transfered` · `MoneyIn` · `Refunding` · `Refunded` · `CashedOut`. **Ne pas confondre avec `state`** : `cashOutState` concerne le virement vers le compte bancaire de l'asso, pas la confirmation du paiement côté membre — on doit se baser sur `state: Authorized`, pas sur `cashOutState`, pour débloquer côté app.

### 2.6 Limitation à anticiper : reçus fiscaux

Contrairement à un formulaire HelloAsso classique (Don/Adhésion/Billetterie créé dans leur interface), **un paiement via Checkout API ne génère pas automatiquement de reçu fiscal**. Si Ultras Lutetia est éligible aux reçus fiscaux et veut en émettre pour les dons, il faudra soit le gérer manuellement depuis le back-office HelloAsso (si les données s'y prêtent), soit prévoir un export comptable séparé. **Point à trancher avec le bureau avant le module Dons**, indépendamment du code.

### 2.7 Bouton et mention obligatoire

HelloAsso fournit un bouton "Payer avec HelloAsso" prêt à l'emploi (HTML fourni dans leur doc) à utiliser pour rassurer l'utilisateur sur le moyen de paiement. Ils demandent aussi qu'on affiche, près du choix du mode de paiement, une mention sur le modèle de contribution volontaire (100% du paiement va à l'association, HelloAsso vit de pourboires volontaires). **À intégrer dans l'UI du futur écran de paiement**, pas juste une suggestion cosmétique — c'est une condition d'usage de leur Checkout.

---

## 3. Modes de paiement actifs vs prévus, par module

**Important pour ne pas coder des flux qui ne sont pas demandés** : tous les modules n'ont pas vocation à supporter Cash + HelloAsso en même temps dès le lancement.

| Module | Cash actif aujourd'hui ? | HelloAsso actif aujourd'hui ? | Note |
|---|---|---|---|
| Déplacements | ❌ Non — pas de paiement cash pour le moment | ✅ Oui — seul mode actif | Le code Cash existant (`validerCash`, bouton dans `voirInscritsDepl`) **reste en place** mais n'est pas le chemin principal. À ne pas supprimer, juste ne pas développer davantage — prévoir que ça puisse être réactivé si le bureau décide d'ouvrir le cash plus tard. |
| Matos | ✅ Oui | ✅ Oui (à automatiser, cf. §5.2) | Les deux coexistent déjà et restent actifs |
| Sticks | ✅ Oui — seul mode actif aujourd'hui | ❌ Non — pas encore activé, malgré le champ `lien_helloasso` qui existe en base | Décision actée la session précédente : Cash uniquement pour Sticks pour le moment. Le flux HelloAsso Sticks décrit en §5.3 est à considérer comme une **extension future**, pas un chantier immédiat — ne pas l'activer sans confirmation explicite. |
| Cartage (cotisation) | ✅ Oui | ✅ Oui (à automatiser, cf. §5.4) | Les deux coexistent déjà et restent actifs |
| Dons | n/a | Lien statique recommandé (cf. §5.5), pas de Cash prévu | — |

**Conséquence sur l'ordre de chantier (§5)** : le chantier HelloAsso prioritaire concerne Déplacements (seul mode, donc le webhook est la seule voie de validation — pas de filet Cash en parallèle si quelque chose rate), puis Matos et Cartage. **Sticks HelloAsso est explicitement hors scope du chantier immédiat.**

---

## 4. Flux détaillé — Déplacements (cas de référence)

C'est le module prioritaire : seul mode de paiement actif, donc le flux le plus simple à cadrer puisqu'il n'y a pas de double système à coordonner avec du cash.

```
1. User clique "M'inscrire"
   → front appelle Edge Function `helloasso-create-checkout`
   → Edge Function crée l'inscription en base avec statut_paiement = 'en_attente'
   → Edge Function appelle HelloAsso POST /checkout-intents
     metadata: { type: 'deplacement', deplacement_id, membre_id, inscription_id }
   → stocke checkout_intent_id sur la ligne inscription
   → renvoie redirectUrl au front

2. Renvoi vers HelloAsso
   → front redirige (window.location ou nouvel onglet) vers redirectUrl

3. Paiement sur HelloAsso
   → se passe entièrement chez eux, on ne voit rien pendant ce temps
   → le membre revient ensuite sur returnUrl (succès/échec) ou backUrl (abandon)
     → cet écran de retour affiche juste "paiement en cours de confirmation",
       ne valide RIEN lui-même (pas fiable, cf. §2.4)

4. Callback HelloAsso (webhook, asynchrone, peut arriver avant ou après l'étape 3)
   → Edge Function `helloasso-webhook` reçoit l'événement Payment
   → lit data.state :
       - "Authorized"           → statut_paiement = 'paye_helloasso'
       - "Refused"              → statut_paiement = 'refuse'
       - "Pending" / "Unknow"   → reste 'en_attente' (rien à faire, on attend le prochain événement)
   → route via metadata.inscription_id (pas besoin de chercher, c'est direct)

5. Inscription validée
   → dès que statut_paiement = 'paye_helloasso', l'inscription est "active"
   → côté UI : openDepl() affiche déjà ce cas (estPaye = true → QR code, billet prêt)
   → rien à coder côté affichage, juste le déclencheur qui devient automatique
```

### Statuts à gérer sur `inscriptions_deplacement.statut_paiement`

| Valeur | Quand | Déjà existant ? |
|---|---|---|
| `en_attente` | dès le clic "M'inscrire", avant tout retour HelloAsso | ✅ existe déjà |
| `paye_helloasso` | webhook reçu avec `state: Authorized` | ✅ existe déjà (utilisé par le flux manuel actuel) |
| `refuse` | webhook reçu avec `state: Refused` | ❌ à ajouter — aujourd'hui rien ne gère un refus, l'inscription reste juste bloquée en `en_attente` indéfiniment |
| `paye_cash` | flux Cash présentiel — **conservé en base/code mais non actif** pour Déplacements aujourd'hui (cf. tableau ci-dessus) | ✅ existe déjà |

Le seul vrai ajout conceptuel par rapport à l'existant : **`refuse`**. Aujourd'hui le code n'a que "payé" vs "en attente", pas de distinction "en attente de paiement" vs "paiement qui a échoué". Ça change l'UI : un membre dont le paiement est `refuse` doit pouvoir retenter (réémettre un nouveau checkout), pas rester coincé avec un bouton "en attente" qui ne mène plus nulle part.

### Différence avec le flux actuel (`doInscritDepl`)

Aujourd'hui `doInscritDepl()` crée l'inscription en `en_attente` puis affiche un lien HelloAsso statique + "paiement cash → contacter l'admin" — l'utilisateur doit revenir lui-même cliquer sur le lien, et un admin valide à la main plus tard. Le nouveau flux fusionne "s'inscrire" et "déclencher le paiement HelloAsso" en une seule action, et la validation devient automatique. La mention "paiement cash → contacter l'admin" doit disparaître de l'écran (puisque cash n'est pas actif pour ce module).

### Duplication ajustée vers les autres modules actifs (Matos, Cartage)

Le même squelette (créer la ligne en `en_attente` → checkout → webhook → transition automatique) s'applique à Matos et Cartage, **avec coexistence du Cash en parallèle** (donc pas de changement sur le bouton/flux Cash existant, on ajoute seulement l'automatisation du côté HelloAsso à côté). Détail module par module en §5.2 et §5.4 (sections déjà existantes plus bas dans ce document).

---

## 5. Mapping par module — ce qui change concrètement

### 5.1 Déplacements
Flux complet déjà détaillé en §4 (module de référence). Pour rappel synthétique : Edge Function `helloasso-create-checkout` au clic "M'inscrire" → checkout-intent HelloAsso (`itemName: "Déplacement {adversaire}"`) → `checkout_intent_id` stocké sur `inscriptions_deplacement` → webhook met à jour `statut_paiement` (`paye_helloasso` / `refuse` / inchangé selon `data.state`). Le flux Cash existant (`validerCash`) reste en code mais inactif pour ce module (cf. §3).

### 5.2 Boutique — Matos
- **Aujourd'hui** : mode `helloasso` existe déjà sur `commandes.mode_paiement`, mais pas de checkout dynamique ; pas de décrémentation HelloAsso spécifique au-delà de ce qui a été fait la session précédente pour `updateCommandeStatut`.
- **Cible** : même schéma — `metadata: { type: 'matos', commande_id, membre_id }`, webhook → transition `updateCommandeStatut(commande_id, 'validee')` sur `Authorized`, ou vers un statut `refusee` sur `Refused` (même logique de retentative qu'en §4 — à ajouter, n'existe pas encore pour ce module non plus). Réutilise la décrémentation de stock déjà codée (pas de nouvelle logique de stock à écrire, juste le déclencheur qui change de manuel à automatique). Le flux Cash existant reste inchangé et coexiste (cf. §3).

### 5.3 Sticks (hors scope immédiat, cf. §3)
- **Aujourd'hui** : flux Cash (Admin uniquement, immédiat) + `validerPaiementStick` pour HelloAsso (en_attente → décrémentation seulement à la confirmation).
- **Cible** : `metadata: { type: 'stick', distribution_id, membre_id }`. Webhook appelle l'équivalent de `validerPaiementStick` automatiquement au lieu d'attendre un clic Admin. Cohérent avec la règle déjà actée la session précédente ("le stock ne baisse que quand le paiement est confirmé").

### 5.4 Cotisation → renommage en **Cartage**
- Renommage fonctionnel demandé : `cotisation` devient `cartage` partout où c'est exposé à l'utilisateur (déjà le nom de la page admin existante `loadCartage`/`filtrerCartage` dans `calendrier.js` — il faudra harmoniser le vocabulaire interne aussi, voir tableau plus bas).
- **Aujourd'hui** : `config_asso.cotisation_lien_helloasso` (lien unique, pas par membre), `validerCotisationHelloAsso(membreId)` manuel.
- **Cible** : montant fixe par saison (`cotisation_montant` déjà en config) → `metadata: { type: 'cartage', membre_id, saison }`. Webhook met `membres.cotisation_a_jour = true` automatiquement. Pas de `checkout_intent_id` à stocker par membre nécessairement (un seul type de produit, le `metadata.membre_id` suffit à route le webhook).

### 5.5 Dons (nouveau module)
- N'existe pas encore. Vu la nature (montant libre, souvent un seul formulaire permanent plutôt qu'un produit par item), c'est le cas où le **lien statique classique** (formulaire de Don créé une fois dans le back-office HelloAsso, pas de Checkout API) est probablement suffisant — *et* permet de garder les reçus fiscaux automatiques (cf. §2.6), ce que l'API Checkout ne permet pas. **Recommandation : ne pas mettre les Dons sous Checkout API ; garder un simple lien vers un formulaire de Don HelloAsso classique.** À confirmer ensemble selon ce que veut faire le bureau (reçus fiscaux vs. UX intégrée).

### 5.6 Tableau de renommage à anticiper côté code (Cartage)

| Existant | Renommage proposé |
|---|---|
| `cotisation_a_jour` (colonne `membres`) | à garder tel quel en base (coût de migration), mais libellé UI → "Cartage à jour" |
| `validerCotisationCash` / `validerCotisationHelloAsso` | libellés boutons UI → "Cash" / "HelloAsso" sous un titre "Cartage", fonctions JS : renommage optionnel, pas obligatoire techniquement |
| `cotisation_lien_helloasso`, `cotisation_montant`, `cotisation_saison` (clés `config_asso`) | idem, renommage UI seulement suffit, pas la clé technique |
| Page admin `loadCartage`/`filtrerCartage` (déjà appelée "Cartage" dans `calendrier.js`) | déjà cohérent, rien à faire ici |

→ **Le renommage Cartage est presque déjà fait côté UI admin** (la page s'appelle déjà Cartage). Le travail restant est sémantique côté "Cotisation" dans `boutique.js`/`profil.js` (où le mot "Cotisation" apparaît encore) et dans les libellés visibles par les membres simples (page Profil : "💶 Cotisation: ✅ À jour").

---

## 6. Plan d'implémentation technique (pour le jour des accès)

### 6.1 Schéma DB — colonnes à ajouter

```sql
alter table inscriptions_deplacement add column checkout_intent_id integer;
alter table commandes add column checkout_intent_id integer;
alter table sticks_distribution add column checkout_intent_id integer;
-- Cartage : pas de table dédiée par paiement actuellement (juste un flag sur membres),
-- envisager une table cartage_paiements(membre_id, saison, checkout_intent_id, statut, created_at)
-- si on veut un historique multi-saison plutôt qu'un simple flag booléen.
```

### 6.2 Secrets à stocker côté Supabase (jamais côté client)

- `HELLOASSO_CLIENT_ID`, `HELLOASSO_CLIENT_SECRET` (prod)
- `HELLOASSO_ORG_SLUG` (slug de l'association sur HelloAsso)
- Variante sandbox en `_TEST` si on teste avant le vrai lancement (`HELLOASSO_CLIENT_ID_TEST`, etc., pointant vers `api.helloasso-sandbox.com`)

### 6.3 Edge Functions à créer (modèle = `send-email` déjà en place pour Brevo)

1. **`helloasso-create-checkout`** (appelée par le front, authentifiée par l'utilisateur connecté)
   - Reçoit `{ type, ref_id, montant_centimes, libelle }`
   - Récupère/rafraîchit un `access_token` HelloAsso (cache en table `helloasso_tokens` ou en mémoire de fonction avec TTL, pour respecter la limite de 20 tokens simultanés)
   - Appelle `POST /checkout-intents` avec `metadata: { type, ref_id, membre_id }`
   - Stocke `checkoutIntentId` sur la ligne correspondante
   - Renvoie `redirectUrl` au front

2. **`helloasso-webhook`** (appelée par HelloAsso, **jamais par le front**)
   - **Vérification d'origine** : comme la signature HMAC n'est pas disponible en compte association simple, vérifier l'IP source de la requête (`51.138.206.200` prod / `4.233.135.234` sandbox) — Supabase Edge Functions exposent l'IP appelante dans les headers (`x-forwarded-for` ou équivalent, à confirmer à l'implémentation). **Filet additionnel recommandé** : ne traiter que les `metadata` correspondant à un `checkoutIntentId` qu'on a nous-mêmes émis et qui est encore en attente — un faux webhook avec un `ref_id` inconnu ou déjà traité est ignoré silencieusement.
   - Toujours répondre **200** immédiatement (même si le traitement métier échoue derrière), pour ne pas déclencher de retries inutiles — logguer les échecs métier séparément pour investigation manuelle.
   - Distingue `eventType: Order` vs `Payment`. On agit surtout sur `Payment`.
   - **Mapping `data.state` → statut applicatif (les 3 branches doivent toutes être gérées, pas seulement le cas succès)** :
     - `Authorized` → `paye_helloasso` (déclenche la suite : décrémentation stock, accès débloqué, etc.)
     - `Refused` → `refuse` (l'utilisateur doit pouvoir retenter un nouveau checkout — ne pas le laisser bloqué sur l'ancien `checkoutIntentId`)
     - `Pending` / `WaitingBankValidation` / `Unknow` → reste `en_attente`, aucune action (on attend un futur événement)
     - `Refunded` / `Contested` → cas de gestion a posteriori (remboursement), hors scope du flux d'inscription initial mais à ne pas ignorer silencieusement — au minimum logguer pour traitement manuel par un Admin
   - Route selon `metadata.type` (`deplacement` / `matos` / `stick` / `cartage`) vers la mise à jour correspondante, en réutilisant les fonctions déjà existantes (`validerPaiementHelloAsso`, `updateCommandeStatut`, `validerPaiementStick`, `validerCotisationHelloAsso` côté logique serveur) — chacune doit donc accepter un statut explicite (`paye_helloasso` / `refuse`) plutôt que de supposer systématiquement un succès.

3. **(optionnel) `helloasso-poll-pending`** (cron, filet de sécurité)
   - Tourne par ex. toutes les 15 min, regarde les `checkout_intent_id` en attente depuis >10 min, fait un `GET /checkout-intents/{id}` pour rattraper un webhook manquant.
   - Marque comme `abandonne` les checkouts en attente depuis >45 min sans paiement (cf. §2.4.3).

### 6.4 Idempotence (important vu les retries HelloAsso jusqu'à 27h)

Chaque webhook traité doit être idempotent : si `metadata.ref_id` a déjà `statut_paiement = 'paye_helloasso'`, le second appel (retry HelloAsso ou doublon Order+Payment) ne doit rien re-décrémenter ni renvoyer un second email de confirmation. Vérifier l'état actuel avant d'agir, pas juste écraser.

### 6.5 Configuration côté back-office HelloAsso (à faire dès les accès obtenus, avant tout test)

1. Récupérer `client_id`/`client_secret` (Mon Compte → Intégrations et API)
2. Vérifier le statut de conformité L561-5 de l'association (sinon prévoir la vérification HelloAsso avant tout test réel) — voir §2.3
3. Configurer l'URL de notification (webhook) vers `helloasso-webhook` une fois déployée
4. Tester d'abord en sandbox (`api.helloasso-sandbox.com`, credentials séparés) avant de toucher la prod

---

## 7. Ordre de chantier suggéré (une fois les accès obtenus)

1. Récupération clés + vérification conformité (§6.5, points 1-2)
2. `helloasso-create-checkout` + `helloasso-webhook` (avec gestion explicite `Authorized`/`Refused`/en attente, §6.3) + test sandbox sur **Déplacements** — module prioritaire car seul mode de paiement actif aujourd'hui, donc le webhook est la seule voie de validation, sans filet Cash en parallèle
3. Ajout du statut `refuse` sur `inscriptions_deplacement.statut_paiement` + écran de retentative côté UI (un membre refusé doit pouvoir relancer un nouveau checkout, pas rester bloqué)
4. Une fois Déplacements validé en sandbox puis en prod réelle, dupliquer le pattern vers Cartage (le plus simple ensuite — montant fixe, un seul type de produit) puis Matos
5. Renommage UI Cotisation → Cartage (chantier indépendant, peut se faire avant ou après le reste)
6. Dons : décision bureau lien statique vs Checkout API (cf. §5.5) avant tout code
7. Sticks HelloAsso : **explicitement hors scope tant que non confirmé** (cf. §3) — à ne déclencher que sur demande explicite ultérieure

---

## 8. Points à reconfirmer sur la doc officielle au moment du codage

- Format exact de l'IP source telle qu'elle apparaît dans les headers d'une requête entrante sur une Supabase Edge Function (Deno) — à vérifier en conditions réelles avec `webhook.site` puis en sandbox, le `x-forwarded-for` peut contenir une liste de proxies.
- Existence ou non d'un test automatique de conformité (`isCashInCompliant`) accessible sans rôle `OrganizationAdmin` complet — à reconfirmer selon le type de clé obtenue.
- Tarification éventuelle évoquée nulle part dans cette doc consultée (HelloAsso se présente comme gratuit, financé par contributions volontaires des payeurs) — bon signe, mais à vérifier qu'aucun frais caché n'existe pour de la billetterie/boutique spécifiquement.
