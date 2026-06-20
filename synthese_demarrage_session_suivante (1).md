# SYNTHÈSE DE DÉMARRAGE — Prochaine conversation
*20/06/2026 — Fin de session : Calendrier 2026-2027, accès Tifos par statut, charte testée, refonte confirmation email (OTP)*

---

## Fichiers à uploader

```
1. index.html
2. src/app.js
3. src/admin.js
4. src/profil.js
5. src/supabase-client.js
6. src/tifos.js
7. src/deplacements.js
8. src/boutique.js
9. src/calendrier.js
10. src/testable.js
11. src/styles.css
12. src/config.js
13. validate.js
14. tests.js
15. docs/BUGS.md          ← journal des bugs, lire avant de débugger quoi que ce soit
16. sw.js
```

## Phrase de démarrage suggérée

> "Lance validate.js, confirme que le flux d'inscription OTP tient toujours, et on continue sur [sujet suivant]"

---

## ⚠️ CHANGEMENT MAJEUR DE CETTE SESSION — à bien intégrer avant tout

**Le parcours d'inscription a changé de mécanisme.** Ce n'est plus un lien cliquable envoyé par email pour confirmer l'adresse — c'est désormais un **code à 8 chiffres** que le membre doit saisir manuellement dans l'app. Si une future session touche au formulaire d'inscription, au login, ou à `supabase-client.js`/`app.js` autour de l'authentification, il faut absolument relire la section "Confirmation d'inscription" ci-dessous avant de modifier quoi que ce soit dans cette zone — c'est un point fragile qui a pris énormément de temps à stabiliser.

---

## Contexte — ce qui a été fait dans cette session (par ordre chronologique)

### 1. Calendrier officiel 2026-2027 (34 journées Ligue 1, Paris FC)

- 34 matchs insérés dans `matchs`, domicile + extérieur, avec logos de clubs (`assets/logos/*.png` sur GitHub Pages).
- Nouvelle colonne `matchs.statut_date` (`a_confirmer`/`confirmee`) — workflow de confirmation de date/horaire par Bureau+ via le modal "Calendrier matchs" admin.
- Horaire par défaut 17h00 appliqué (UPDATE SQL ciblé, sans toucher à `statut_date`).
- Mise en page de la card calendrier refaite façon site officiel LFP (logo domicile / VS / logo extérieur, noms sous chaque logo). Fallback `onerror` sur les `<img>` (placeholder ⚽ si échec de chargement).
- Formatage de date FR fiabilisé (`formatDateCourte()` dans `calendrier.js`, table fixe de jours, indépendant du navigateur).
- `saisirScoreMatch` ajoutée dans `supabase-client.js` (bug latent corrigé — appelée depuis `calendrier.js` mais jamais implémentée).
- **Bug terrain résolu (pas du code)** : tous les logos renvoyaient 404 malgré déploiement confirmé — cause réelle : espace parasite en tête de chaque nom de fichier suite à un renommage en masse sur GitHub web. Voir `BUGS.md` #16.

### 2. `sw.js` v3 (`CACHE_NAME = 'ul-v5'`)

Tous les modules `src/*.js` passent en network-first (avant, seuls `app.js`/`supabase-client.js`/`styles.css`/`config.js` l'étaient). Le fallback de secours en cas d'échec réseau ne sert plus `index.html` pour n'importe quelle ressource — réservé aux navigations de page.

**Important pour la suite** : si un nouveau module JS est ajouté au projet, il faut l'ajouter à la liste `NETWORK_FIRST` dans `sw.js`, sinon le même bug de cache se reproduira.

### 3. Accès Tifos restreint par statut

- Nouvelle colonne `membres.valide_tifo` (boolean, défaut `false`).
- Règle : Sympathisant jamais / Draft seulement si `valide_tifo=true` / Confirmé automatique / cellule Tifo+Bureau+Admin toujours.
- `peutVoirTifos(membre)` dans `app.js`, vérifiée à 2 endroits : page Tifos dédiée et bloc accueil.
- Checkbox "Validé Tifo" dans la fiche membre admin.
- Testé et confirmé fonctionnel.

### 4. Charte bloquante — testée et validée de bout en bout

Chantier d'une session antérieure, jamais testé en conditions réelles jusqu'à cette session. Parcours complet confirmé : gate plein écran → checkbox bloquée jusqu'à scroll complet → signature → déblocage, sans boucle. Robustesse renforcée par précaution (setTimeout + écouteur resize en plus du requestAnimationFrame initial).

### 5. REFONTE MAJEURE — Confirmation d'inscription par email (lien vers code OTP)

Problème découvert : plusieurs nouveaux membres restaient bloqués en "Waiting for verification" malgré avoir cliqué le lien de confirmation reçu par email.

Cause racine : le SMTP custom Brevo (configuré dans Supabase Auth Settings — nécessaire et conservé, l'envoi natif Supabase échouait pour blocage IP lors d'une session antérieure) réécrit systématiquement tous les liens transactionnels pour son tracking de clics, sans option de désactivation pour ce canal. Un scanner de sécurité côté destinataire peut pré-visiter ce lien automatiquement, consommant le token de confirmation à usage unique avant le vrai clic du membre.

Solution déployée : remplacement du lien cliquable par un code à 8 chiffres saisi manuellement dans l'app.

Changements concrets :
- Template Supabase "Confirm signup" : lien remplacé par `{{ .Token }}` affiché en clair (voir docs/template_confirm_signup_otp.html).
- index.html : nouvel écran otpForm, champ otpCode (maxlength="8"), bouton Confirmer, bouton renvoyer le code.
- app.js : showOtpForm(email), doVerifyOtp(), doRenvoyerOtp(), doInscription() modifiée.
- supabase-client.js : verifierCodeInscription(email, code) utilise type 'email' (pas 'signup', déprécié) ; renvoyerCodeInscription(email) utilise sb.auth.resend({ type: 'signup', email }) — ce type reste correct pour resend, ne pas confondre avec celui de verifyOtp.
- Le workflow de validation Bureau n'a pas changé — la confirmation email reste une étape technique antérieure et indépendante.

Deux sous-bugs résolus en testant ce fix (détails complets dans BUGS.md #17) :
1. type 'signup' déprécié pour verifyOtp() avec email → corrigé en 'email'.
2. Supabase génère un code à 8 chiffres, pas 6 → maxlength="6" tronquait silencieusement la saisie → corrigé en maxlength="8".

Testé et confirmé fonctionnel par Remi en fin de session.

### 6. Nettoyage des comptes de test

3 comptes problématiques créés pendant la phase de bug (Ulcelluletifo, Nowena92, Yann.abarrategui) ont été entièrement supprimés (toutes tables + auth.users) via docs/sql_suppression_complete_3_comptes.sql. Ulcelluletifo s'est réinscrit avec succès après le fix.

---

## Comptes de test disponibles (gate charte — toujours valides, pas supprimés)

| Pseudo | Email | Mot de passe | Statut |
|---|---|---|---|
| TestSympath | sympath@test.ultraslutetia.fake | sympath | sympathisant, charte signée |
| TestDraft | draft@test.ultraslutetia.fake | draft | draft, charte signée |

Pour refaire un test du gate charte à zéro sans recréer les comptes, supprimer leurs lignes dans signatures_charte.

---

## État réel à la reprise — NON CONFIRMÉ

1. Nowena et Yann doivent encore se réinscrire avec le nouveau parcours OTP — leurs comptes ont été supprimés mais pas recréés.
2. Le bouton "renvoyer le code" n'a été testé qu'une fois dans un scénario qui a ensuite échoué pour une autre raison — son comportement nominal n'a pas été re-confirmé après le fix complet.
3. Logos de clubs : pas certain que les 18 fichiers aient TOUS été vérifiés pour l'espace parasite.
4. Le scénario "Draft non-validé → coché Validé Tifo en admin → accès débloqué" reste à tester concrètement de bout en bout.

Ne pas supposer que tout est testé — repartir de ces 4 points si l'un de ces sujets revient.

---

## Chantier explicitement mis de côté (reporté, pas dans cette session)

- Module Comité de passage (inexistant).
- Onglets "Évaluation membres" dans Tifo/Déplacement (backend prêt, UI à construire).
- Vérification non résolue : createDeplacement envoie cree_par vers deplacements — jamais vérifié si la colonne existe.
- Déplacements pré-remplis à partir du calendrier officiel (proposé, jamais traité).

---

## Rappels techniques importants

### Structure modules
```
src/app.js        core : auth (dont inscription OTP), nav, droits, charte GATE
src/profil.js     profil + charte CONSULTATION
src/admin.js      admin + charte ÉDITION + calendrier matchs + fiche membre (valide_tifo)
src/tifos.js      tifos + restriction d'accès par statut
src/calendrier.js calendrier matchs (mise en page LFP) + cartage + événements
src/deplacements.js
src/boutique.js
src/supabase-client.js  couche données + Edge Functions + logique charte/matchs/inscription OTP
```

### Fonctions clés ajoutées cette session
- Auth/inscription : verifierCodeInscription, renvoyerCodeInscription (supabase-client.js) ; showOtpForm, doVerifyOtp, doRenvoyerOtp (app.js)
- Calendrier : formatDateCourte, formatHeureCourte, confirmerDateMatch, rouvrirConfirmationMatch, saisirScoreMatch, ouvrirConfirmerDate, annulerConfirmerDate, doConfirmerDateMatch, doRouvrirConfirmation
- Accès Tifos : peutVoirTifos

### Schéma réel confirmé en base
- matchs : ajout statut_date text not null default 'a_confirmer'
- membres : ajout valide_tifo boolean not null default false
- signatures_charte : id, membre_id, charte_id, signed_at (toujours pas de created_at)
- Supabase Auth : email_confirmed_at reste null jusqu'à verifyOtp réussi désormais

### URLs
- App : https://appultralutetia-gif.github.io/ultras-lutetia/
- Supabase : https://afgriuvrtdkklluvtswg.supabase.co
- Logos clubs : https://appultralutetia-gif.github.io/ultras-lutetia/assets/logos/SLUG.png

### Pièges connus (voir BUGS.md sections 15-17 pour le détail complet)
- Tous les modules JS sont network-first dans sw.js v5 — ajouter tout nouveau module à NETWORK_FIRST.
- Un renommage en masse de fichiers peut introduire un espace invisible en tête de nom.
- Un message d'erreur générique peut cacher une cause totalement différente (mismatch de paramètre type/longueur).
- Ne jamais coder en dur un format par analogie — vérifier dans la doc officielle ou la donnée brute reçue.
- Le SMTP Brevo est nécessaire — ne jamais proposer de le désactiver pour résoudre un problème de confirmation email.
- Toute nouvelle restriction d'accès doit être vérifiée à tous les points d'entrée.

### Phase actuelle
Key Users toujours en cours. sql_nettoyage_avant_lancement.sql reste prêt mais non exécuté. Vérifier sa cohérence avec statut_date et valide_tifo (colonnes ajoutées cette session) avant exécution finale.
