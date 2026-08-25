# Guide — Notifications de nouveau contenu (déplacements, tifos, matos, sticks)

Ce guide vient en complément du premier (`GUIDE_NOTIFICATIONS_PUSH.md`) — tu dois avoir déjà fait ses 5 étapes (clés VAPID, table, première Edge Function, etc.) avant de continuer ici.

## Ce qui a été ajouté

Sur les formulaires de création de **déplacement**, **session tifo**, **article boutique** et **stick**, une case "🔔 Notifier les membres" est maintenant présente, **cochée par défaut**. Si tu décoches, aucune notification n'est envoyée pour cette création précise — tout le reste fonctionne pareil.

**Le respect des droits est géré automatiquement**, calculé sur le serveur (pas dans l'app), avec les mêmes règles que celles déjà utilisées pour décider qui peut voir quoi :

- **Déplacement** → tous les membres actifs (aucune restriction, comme aujourd'hui)
- **Session tifo** → uniquement les Confirmés, les Draft validés (cellule Tifo a coché "Validé Tifo" sur leur fiche), et les membres de la cellule Tifo/Bureau/Admin
- **Article boutique (Matos)** → selon ce que tu choisis à la création : "Généraliste" = tout le monde, ou "Section spécifique" = tous les Confirmés + seulement les Draft de cette section précise
- **Stick** → selon la catégorie choisie : "Tous les membres", ou restreint à une section avec un statut minimum (Draft+Confirmé, ou Confirmé seulement)

Un membre qui n'a pas le droit de voir un contenu ne recevra jamais de notification à son sujet, même s'il a les notifications activées.

---

## Ce qu'il te reste à faire — une seule étape supplémentaire

### Déployer une deuxième Edge Function : `send-push-notification-groupe`

C'est une fonction différente de `send-push-notification` (celle de la validation de compte) — celle-là envoie à une seule personne, celle-ci calcule une liste de destinataires selon les droits puis envoie à tout le monde en une fois.

1. Crée le dossier `supabase/functions/send-push-notification-groupe/`
2. Mets-y le fichier fourni (renommé en `index.ts`)
3. Déploie-la :
   ```bash
   supabase functions deploy send-push-notification-groupe
   ```
4. **Désactive "Verify JWT"** dans ses Settings (même réglage que pour `send-push-notification`)
5. **Pas de nouveau secret à ajouter** — elle réutilise les mêmes `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` déjà configurés pour la première fonction.

Ensuite, déploie les fichiers front mis à jour (`index.html`, `supabase-client.js`, `deplacements.js`, `tifos.js`, `boutique.js`) comme d'habitude.

---

## Tests à faire après déploiement

1. **Déplacement** : crée un déplacement test avec la case cochée → un membre avec les notifications activées doit recevoir "🚌 Nouveau déplacement"
2. **Décocher la case** : recrée un déplacement test, case décochée → aucune notification ne doit partir
3. **Session tifo — le test le plus important pour les droits** :
   - Active les notifications sur 3 comptes test : un **Sympathisant**, un **Draft non validé**, un **Confirmé**
   - Crée une session tifo (case cochée)
   - Seul le compte **Confirmé** doit recevoir la notification — ni le Sympathisant, ni le Draft non validé
   - Valide ensuite le Draft (coche "Validé Tifo" sur sa fiche), recrée une session → cette fois il doit la recevoir aussi
4. **Article boutique en "Section spécifique"** :
   - Active les notifications sur un compte Draft de la section A, et un compte Draft de la section B
   - Crée un article réservé à la section A
   - Seul le compte de la section A doit recevoir la notification (le Confirmé de n'importe quelle section la recevrait aussi, mais teste d'abord ce cas Draft, le plus restrictif)
5. **Stick "Confirmés uniquement"** : même genre de test que le 4, mais avec un compte Draft et un compte Confirmé de la même section — seul le Confirmé doit recevoir la notification.
