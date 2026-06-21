# TODO HelloAsso — à compléter dès obtention des accès

*Ce fichier consolide tout ce qui manque pour activer réellement le code écrit le 21/06/2026 (Edge Functions `helloasso-create-checkout` et `helloasso-webhook`, migration SQL, front `deplacements.js`). Le code a été écrit en amont des accès — il est syntaxiquement complet et structurellement prêt, mais ne fonctionnera pas tel quel sans les informations ci-dessous.*

**À renvoyer dans Claude (ou à compléter directement) dès que tu as les accès HelloAsso.**

---

## 1. Informations à obtenir côté HelloAsso (bloquant)

| # | Info à récupérer | Où | Utilisée dans |
|---|---|---|---|
| 1 | `client_id` (sandbox) | Mon Compte → Intégrations et API (compte sandbox de test) | `HELLOASSO_CLIENT_ID` |
| 2 | `client_secret` (sandbox) | idem | `HELLOASSO_CLIENT_SECRET` |
| 3 | `organizationSlug` de l'association (sandbox) | visible dans l'URL du back-office HelloAsso, ou via `GET /v5/users/me/organizations` | `HELLOASSO_ORG_SLUG` |
| 4 | Statut de conformité L561-5 (l'asso est-elle "vérifiée" ?) | back-office HelloAsso, ou `GET /v5/organizations/{slug}` champ `isCashInCompliant` | conditionne si l'appel checkout-intents renverra une 409 |
| 5 | Mêmes infos 1-3 en **production** (une fois testé en sandbox) | back-office HelloAsso, compte réel Ultras Lutetia | `HELLOASSO_CLIENT_ID`/`SECRET`/`ORG_SLUG` prod |

→ Items 1-3 nécessaires pour faire le moindre test, même en sandbox. Item 4 conditionne si ça vaut le coup de tester avant ou après la démarche de vérification.

---

## 2. Configuration à faire côté back-office HelloAsso (bloquant, manuel)

- [ ] Configurer l'URL de notification (webhook) dans **Mon Compte → Intégrations et API** :
  `https://<PROJECT_REF>.supabase.co/functions/v1/helloasso-webhook`
  → `<PROJECT_REF>` = `afgriuvrtdkklluvtswg` (déjà connu, cf. config.js) — **mais à confirmer que c'est la même Edge Function URL pattern utilisée pour `send-email`/`update-evaluation-deplacement` existantes**, pas supposé ici.
- [ ] Si le statut de vérification (item 4 ci-dessus) montre que l'asso n'est pas vérifiée : suivre la procédure sur `https://admin.helloasso.com/<slug>/verification` avant tout test réel de paiement (le sandbox peut avoir ses propres règles, à vérifier).

---

## 3. Secrets à renseigner côté Supabase (bloquant, technique)

Une fois les infos de la section 1 obtenues, à exécuter (depuis la CLI Supabase ou le dashboard) :

```bash
supabase secrets set HELLOASSO_CLIENT_ID=<valeur sandbox>
supabase secrets set HELLOASSO_CLIENT_SECRET=<valeur sandbox>
supabase secrets set HELLOASSO_ORG_SLUG=<slug sandbox>
supabase secrets set HELLOASSO_API_BASE=https://api.helloasso-sandbox.com
```

Puis, une fois validé en sandbox, refaire la même chose avec les valeurs de production et `HELLOASSO_API_BASE=https://api.helloasso.com`.

---

## 4. Table à créer avant le premier déploiement réel

`helloasso_tokens` (cache du token OAuth2, partagé par tous les futurs modules HelloAsso — pas seulement Déplacements) :

```sql
create table if not exists helloasso_tokens (
  id int primary key default 1,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  constraint single_row check (id = 1)
);

-- RLS : cette table ne doit être accessible qu'en service_role (Edge
-- Functions), jamais depuis le client. Vérifier qu'aucune policy publique
-- n'expose ces tokens.
alter table helloasso_tokens enable row level security;
-- (pas de policy ajoutée : par défaut, RLS activé sans policy = personne
-- n'a accès sauf service_role qui bypasse RLS — comportement voulu ici)
```

---

## 5. Migration `inscriptions_deplacement` — ✅ diagnostic fait le 21/06/2026

Contrainte réelle trouvée :
```
inscriptions_deplacement_statut_paiement_check
CHECK (statut_paiement = ANY (ARRAY['en_attente','paye_cash','paye_ha','rembourse']))
```

**Deux corrections importantes faites suite à cette découverte** (le code initial supposait à tort `'paye_helloasso'`) :
- Toute la chaîne Déplacements (Edge Functions, `deplacements.js`, `supabase-client.js`) utilise désormais `'paye_ha'`, la seule valeur réellement autorisée par la contrainte
- Le statut `'rembourse'`, qui existait déjà dans la contrainte avant ce chantier, est désormais géré explicitement dans le webhook (auparavant seulement loggué comme cas générique)
- `validerPaiementHelloAsso()` dans `supabase-client.js` contenait un bug préexistant (écrivait `'paye_helloasso'`, qui aurait toujours violé la contrainte) — corrigé au passage

- [ ] **Reste à faire** : exécuter la migration mise à jour (`docs/migration_helloasso_deplacements.sql`), qui contient maintenant directement les requêtes `DROP CONSTRAINT` / `ADD CONSTRAINT` avec les bonnes valeurs (plus besoin de diagnostic, déjà fait)

---

## 6. Points techniques à vérifier en conditions réelles (non bloquants pour coder, bloquants pour valider)

- [ ] **Header IP appelante exact** sur une requête entrante vers une Supabase Edge Function (Deno). Le code suppose `x-forwarded-for`, premier élément de la liste — à confirmer avec un test réel (ex. webhook.site en frontal, ou logguer `req.headers` lors du premier vrai appel HelloAsso en sandbox). Si le header est différent, ajuster `extraireIpAppelante()` dans `helloasso-webhook/index.ts`.
- [ ] **Contrainte NOT NULL éventuelle sur `valide_par`** : le webhook met à jour `inscriptions_deplacement` sans renseigner `valide_par` (aucun humain n'a validé). Si la colonne est `NOT NULL` en base, l'update échouera. Vérifier le schéma réel avant le premier test (`select is_nullable from information_schema.columns where table_name='inscriptions_deplacement' and column_name='valide_par'`). Si NOT NULL : soit l'assouplir, soit définir un membre "système" sentinelle à utiliser dans ce cas.
- [ ] **Test du flux complet en sandbox** avant tout passage en prod : créer un déplacement de test avec un petit montant, s'inscrire, payer avec une carte de test HelloAsso sandbox, vérifier que le webhook arrive et que le statut passe bien à `paye_ha` avec un QR code généré.
- [ ] **Test du cas refus** : HelloAsso sandbox propose normalement des cartes de test qui déclenchent un refus — vérifier que le statut passe bien à `refuse` et que le bouton "Réessayer le paiement" fonctionne.
- [ ] **Test du cas abandon** : fermer l'onglet HelloAsso sans payer, vérifier qu'on reste proprement en `en_attente` et qu'on peut relancer sans créer de doublon en base.

---

## 7. Décisions produit encore ouvertes (pas bloquantes pour ce module, mais à trancher avant d'étendre)

- [ ] Notification au membre en cas de refus (email via Brevo ? Pas fait dans cette première version — actuellement seul l'affichage dans l'app change, pas de push actif vers le membre)
- [ ] Cas `Refunded`/`Contested` (remboursement, contestation bancaire) : actuellement seulement loggué côté serveur pour revue manuelle par un Admin — pas de statut dédié ni d'action automatique. À enrichir si ce cas se présente en réel.
- [ ] Décision Dons : lien statique vs Checkout API (cf. plan_helloasso.md §5.5) — sans impact sur Déplacements, mais à trancher avant d'attaquer ce module.

---

## Fichiers concernés par ce chantier

- `docs/migration_helloasso_deplacements.sql` — migration SQL (+ requête de diagnostic à lancer avant)
- `supabase/functions/helloasso-create-checkout/index.ts` — Edge Function de création du checkout
- `supabase/functions/helloasso-webhook/index.ts` — Edge Function de réception des notifications HelloAsso
- `src/deplacements.js` — `doInscritDepl()` et `openDepl()` modifiées pour le nouveau flux
