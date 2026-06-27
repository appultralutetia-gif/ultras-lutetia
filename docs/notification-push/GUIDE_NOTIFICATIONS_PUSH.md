# Guide — Mise en place des notifications push

Ce guide t'accompagne pour activer les notifications push sur Ultras Lutetia. Le code est déjà prêt (fichiers livrés) — il te reste 4 étapes côté Supabase, à faire une seule fois. Ensuite, ajouter une nouvelle notification (pour un autre événement que la validation de compte) ne demandera plus aucune de ces étapes.

**Avant de commencer : ce que les membres verront concrètement**

- Sur **Android** : un bouton "🔔 Activer les notifications" apparaît dans Profil. Un clic, une popup native du téléphone, et c'est activé — aucune installation requise.
- Sur **iPhone/iPad** : la notification ne peut fonctionner QUE si le membre a installé l'app sur son écran d'accueil (Safari → bouton Partager → "Sur l'écran d'accueil"). Si ce n'est pas fait, l'app affiche un message qui l'explique automatiquement — rien à faire de ton côté, c'est déjà géré dans le code.
- L'email de validation existant **continue de fonctionner exactement comme avant**, en plus de la notification push.

---

## Étape 1 — Générer les clés VAPID

Les clés VAPID sont une paire de clés qui identifient ton app auprès des navigateurs (Chrome, Safari, etc.) pour qu'ils acceptent d'envoyer des notifications en ton nom. Tu ne les génères qu'une seule fois, jamais à refaire ensuite.

**Méthode sans Node.js (recommandée si tu ne l'as pas installé) :**

Ouvre le fichier `generateur_cles_vapid.html` fourni, directement dans ton navigateur (double-clic dessus, pas besoin de serveur ni d'internet). Clique sur "Générer une paire de clés" — tout se passe localement dans ton navigateur, rien n'est envoyé nulle part (tu peux même le vérifier en couplant le wifi pendant que tu génères, ça fonctionnera quand même). Copie tout de suite les deux valeurs affichées avec les boutons "Copier" — si tu fermes ou recharges la page avant de les avoir copiées, elles sont perdues et il faut en regénérer une nouvelle paire.

**Méthode avec Node.js (si jamais tu l'installes plus tard) :**

```bash
npx web-push generate-vapid-keys
```

Les deux méthodes donnent des clés strictement équivalentes — peu importe laquelle tu utilises.

Tu vas obtenir deux valeurs : une **clé publique** et une **clé privée**. **Garde-les de côté** (copie-les dans un fichier texte temporaire) — tu en as besoin dans les étapes suivantes. La clé publique n'est pas secrète (elle finit dans le code visible par tout le monde), mais la clé privée doit rester strictement confidentielle, comme un mot de passe.

---

## Étape 2 — Créer la table en base de données

Va dans Supabase → ton projet → **SQL Editor**, et exécute le contenu du fichier `migration_notifications_push.sql` fourni. Ça crée une nouvelle table `push_subscriptions` qui retient quels membres ont activé les notifications, et sur quel appareil.

C'est strictement additif — ça ne touche à aucune table existante, aucun risque pour le reste de l'app.

---

## Étape 3 — Déployer l'Edge Function `send-push-notification`

C'est la fonction côté serveur qui envoie réellement les notifications. Même procédure que pour `helloasso-create-checkout`/`helloasso-webhook` :

1. Crée le dossier `supabase/functions/send-push-notification/` dans ton projet
2. Mets-y le fichier `index.ts` fourni (renommé depuis `send-push-notification.ts`)
3. Déploie-la :
   ```bash
   supabase functions deploy send-push-notification
   ```

Ensuite, configure les **secrets** de cette fonction (Dashboard Supabase → Edge Functions → send-push-notification → Settings, ou en ligne de commande) :

```bash
supabase secrets set VAPID_PUBLIC_KEY=<ta clé publique de l'étape 1>
supabase secrets set VAPID_PRIVATE_KEY=<ta clé privée de l'étape 1>
```

Les secrets `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont normalement déjà disponibles automatiquement pour toutes tes Edge Functions (Supabase les injecte par défaut) — rien à faire pour ceux-là.

⚠️ Comme pour le webhook HelloAsso : vérifie dans les Settings de cette fonction que **"Verify JWT" est désactivé**, sinon les appels depuis l'app échoueront.

---

## Étape 4 — Renseigner la clé publique dans le front

✅ **Déjà fait** dans le fichier `config.js` livré — ta clé publique est déjà à l'intérieur, rien à faire ici.

---

## Étape 5 — Déployer les fichiers front

Comme d'habitude (GitHub Pages) : remplace les fichiers `config.js`, `supabase-client.js`, `sw.js`, `admin.js`, `profil.js` et `index.html` par les versions livrées dans cette conversation, et déploie.

**Point d'attention service worker** : le `CACHE_NAME` a été monté en v13 — comme d'habitude, ça force tous les navigateurs à récupérer la nouvelle version au prochain chargement, pas besoin d'action supplémentaire de ta part.

---

## Ce qui se passe ensuite, pour TOI

Une fois ces 5 étapes faites, le cas "validation de compte" fonctionne tout seul. Si tu veux ajouter une notification pour un autre événement plus tard (rappel de déplacement, nouvelle annonce urgente, etc.), tu n'as **plus besoin de refaire aucune des 5 étapes** — il suffira d'ajouter un appel comme celui-ci à l'endroit du code concerné :

```js
UL.envoyerNotificationPush(
  membreId,           // à qui envoyer
  'Titre de la notif',
  'Le texte du message',
  '/ultras-lutetia/'  // page ouverte si on tape sur la notif (optionnel)
);
```

Demande-moi quand tu voudras en ajouter une nouvelle — je m'occuperai du `onclick`/de l'endroit exact où l'insérer dans le code, toi tu n'auras qu'à me dire "à quel moment" et "quel texte".

---

## Tests à faire après déploiement

1. **Activation** : va dans Profil → "🔔 Activer les notifications" → accepte la popup du navigateur → le bouton doit changer en "Notifications activées — désactiver".
2. **Validation d'un compte test** : crée un compte sympathisant de test, active les notifications avec ce compte, puis valide-le depuis un autre compte admin/bureau → la notification doit apparaître sur le téléphone du compte test (même si l'app est fermée).
3. **App complètement fermée** : ferme l'app (pas juste l'onglet — vraiment fermée), refais le test de validation → la notification doit quand même arriver et, au clic, ouvrir l'app.
4. **Désactivation** : clique "Désactiver" dans Profil → revalide un compte test → plus aucune notification ne doit arriver sur cet appareil (l'email, lui, continue d'arriver normalement).
5. **Sur iPhone, sans installation sur écran d'accueil** : va dans Profil → tu dois voir le message expliquant qu'il faut installer l'app, pas de bouton "Activer".
6. **Sur iPhone, après installation sur écran d'accueil** : reteste les points 1 à 4 — ça doit fonctionner comme sur Android.
7. **Refus de la popup** : si tu cliques "Bloquer" sur la popup native du navigateur au lieu d'"Autoriser", retourne dans Profil → un message doit indiquer que c'est bloqué dans les réglages, pas le bouton "Activer" qui réapparaît bêtement.
