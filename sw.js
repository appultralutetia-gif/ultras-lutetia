// ============================================================
// ULTRAS LUTETIA — Service Worker v78
// ============================================================
// Historique complet des versions précédentes déplacé vers
// CHANGELOG.md.
//
// v78 (10/07/2026) : CACHE_NAME bumpé (v77 → v78) — Gérer le cartage →
// Suivi des paiements : 2 nouveaux filtres (demande Remi) — "❌ Cartage
// non payé" et "❌ Charte non signée" — pour isoler chaque cause
// séparément (le filtre "Incomplets" existant mélange les deux, cartage
// OU charte manquant, sans distinguer lequel).
//
// v77 (10/07/2026) : CACHE_NAME bumpé (v76 → v77) — cause RÉELLE de la
// carte "Demandes d'inscription" restée bloquée sur l'ancienne version
// malgré plusieurs déploiements confirmés : ce n'était PAS un problème de
// cache. app.js contenait une copie ENTIÈREMENT SÉPARÉE de cette
// fonctionnalité (loadDemandes/validerDemande/refuserDemande, pour la
// section repliée sur l'Accueil), jamais mise à jour en parallèle de
// celle d'admin.js (pageDemandesAdmin) pendant tous les correctifs
// précédents (statut par défaut, bouton Visiteur, sélecteur de section
// inline, email non-bloquant...). loadDemandesAdmin (admin.js) généralisée
// pour servir les DEUX emplacements (paramètres idListe/idBadge, ids de
// <select> préfixés pour éviter les doublons puisque les deux conteneurs
// existent simultanément dans le DOM) ; la copie dans app.js supprimée,
// loadDemandes() n'est plus qu'un appel à loadDemandesAdmin('demandesListe',
// 'demandesBadge'). Une seule implémentation désormais, plus de risque de
// divergence future entre les deux écrans.
//
// v76 (10/07/2026) : CACHE_NAME bumpé (v75 → v76) — cause probable
// trouvée pour les épisodes répétés de "version pas à jour malgré un
// déploiement confirmé sur GitHub" : fetch(e.request) dans la branche
// "network-first" respectait le cache HTTP du navigateur (et/ou du CDN
// GitHub Pages) — un fetch() peut être satisfait silencieusement par une
// réponse encore "fraîche" en cache selon Cache-Control, sans jamais
// vraiment retourner sur le réseau. { cache: 'reload' } force désormais
// une vraie revalidation serveur pour tous les fichiers NETWORK_FIRST.
// ⚠️ Ce correctif lui-même dépend du navigateur qui va récupérer CE
// nouveau sw.js au moins une fois pour être actif — si le problème
// persiste après déploiement, un Unregister manuel du service worker
// (DevTools → Application → Service Workers) reste le recours immédiat,
// ce correctif évite que ça se reproduise ensuite.
//
// v75 (10/07/2026) : CACHE_NAME bumpé (v74 → v75) — le filtre "Demandes
// d'inscription" de v74 (statut === 'visiteur' uniquement) faisait
// disparaître les inscriptions faites AVANT le changement de statut par
// défaut, encore à 'sympathisant' et toujours en attente — repéré via
// Ahmad Makadji, inscrit avant v74, devenu invisible dans la liste.
// Élargi pour accepter les deux valeurs ('visiteur' OU 'sympathisant')
// tant que !actif.
//
// v74 (10/07/2026) : CACHE_NAME bumpé (v73 → v74) — suite Visiteur
// (demande Remi) : (1) statut par défaut à l'inscription passé de
// 'sympathisant' à 'visiteur' (inscription(), supabase-client.js).
// (2) Filtre "Demandes d'inscription en attente" mis à jour en
// conséquence (cherchait statut === 'sympathisant', cherche désormais
// 'visiteur' — sinon les nouvelles inscriptions n'y seraient plus
// jamais apparues). (3) Choix de la section intégré directement sur
// chaque carte de demande (select "Ultra Lutetia" présélectionné par
// défaut) au lieu d'une popup séparée après le clic sur un statut — un
// seul clic suffit désormais. modalValiderDemande (HTML) et le flux en
// 2 étapes (ouvrirValiderDemande/confirmerValiderDemande) retirés,
// remplacés par validerDemandeInline().
//
// v73 (10/07/2026) : CACHE_NAME bumpé (v72 → v73) — 2 demandes Remi :
// (1) Évaluation "Cellule Tifo" (pinceaux 🖌️) retirée de l'affichage
// Profil — les évaluations Comité (sympa/draft) et Déplacement restent.
// (2) Nouveau statut "Visiteur" (gens qui ne rejoignent pas l'association
// mais veulent faire des déplacements) — ajouté partout où sympathisant/
// draft/confirme sont listés (dropdown Modifier le membre, boutons de
// validation des demandes d'inscription, filtres Gérer les membres et
// Comité de passage, libellés). Visibilité par statut : Visiteur et
// Sympathisant n'ont plus l'onglet Tifos dans la nav (masqué) ; Visiteur
// ne voit que l'onglet Cartage dans Boutique (Matos/Sticks masqués,
// bascule automatique sur Cartage). Accueil/Calendrier/Déplacements/
// Profil restent visibles pour tous, inchangé.
// ⚠️ PARTIEL : nécessite une migration SQL pour autoriser 'visiteur' dans
// la contrainte CHECK de membres.statut — en attente de la définition
// exacte de cette contrainte (cf. message) avant de l'écrire, pour ne
// pas deviner un schéma une fois de plus.
//
// v72 (09/07/2026) : CACHE_NAME bumpé (v71 → v72) — annonces, cette fois
// pour de bon : schéma réel obtenu via information_schema.columns
// (annonces = id, titre, contenu, categorie, created_at — rien d'autre).
// publierAnnonce() n'envoie plus publie_par (colonne inexistante,
// 3e colonne fantôme trouvée après cellule_id et actif). getAnnonces()
// simplifiée en conséquence : plus de recherche d'auteur (jamais
// affiché côté front de toute façon).
//
// v71 (09/07/2026) : CACHE_NAME bumpé (v70 → v71) — page Gérer le cartage
// → Suivi des paiements (demande Remi) : (1) email affiché sur chaque
// carte membre (ajouté à getAllCartagePaiements, absent jusqu'ici).
// (2) Nouveau bouton "📥 Exporter en CSV" — exporte exactement ce qui est
// affiché à l'écran (respecte le filtre courant : Tous/Incomplets/En
// attente/Payé), colonnes Prénom/Nom/Pseudo/Email/Statut UL/Statut
// Cartage/Statut Charte. Même convention que exporterCsvMembresComite
// (Comité de passage) dont csvEscape() est réutilisé.
//
// v70 (09/07/2026) : CACHE_NAME bumpé (v69 → v70) — bug rapporté par
// Remi à l'inscription : "insert or update on table 'membres' violates
// foreign key constraint 'membres_id_fkey'". Cause : latence de
// réplication interne à Supabase entre la création de la ligne
// auth.users (par signUp()) et sa visibilité côté API REST/Postgres —
// l'insert dans membres qui suit immédiatement tombait parfois dans
// cette fenêtre de quelques centaines de ms. Corrigé avec une nouvelle
// tentative automatique (jusqu'à 3, délai croissant), déclenchée
// uniquement sur ce code d'erreur précis (23503) — toute autre erreur
// (pseudo déjà pris, etc.) échoue immédiatement sans attente inutile.
//
// v69 (09/07/2026) : CACHE_NAME bumpé (v68 → v69) — les deux appels à
// envoyerEmailValidation (validerDemandeAdmin et doSauvegarderMembre)
// avalaient silencieusement tout échec d'envoi (.catch(() => {})) —
// aucun moyen de savoir qu'un email n'était jamais parti (cas rapporté
// par Remi : compte validé, aucun email reçu). Remplacé par un toast
// d'erreur explicite + log console à chaque échec, sans bloquer la
// validation elle-même (déjà effective au moment de l'appel).
//
// v68 (09/07/2026) : CACHE_NAME bumpé (v67 → v68) — l'email + notification
// de validation de compte (déjà existants, cf. envoyerEmailValidation)
// n'étaient envoyés QUE depuis "Demandes d'inscription en attente"
// (validerDemandeAdmin) — jamais depuis le modal "Modifier le membre" /
// "Modifier statut & accès", pourtant le chemin emprunté par le Comité de
// passage pour valider (cf. openEditMembreComite). doSauvegarderMembre
// envoie désormais aussi l'email + la notif, mais seulement pour une
// VRAIE première validation (statut sympathisant → draft/confirmé,
// détecté via _statutAvantEditionMembre mémorisé à l'ouverture du modal)
// — jamais pour un changement de statut ultérieur ou une simple
// correction de nom, qui enverraient un "bienvenue" hors de propos.
//
// v67 (09/07/2026) : CACHE_NAME bumpé (v66 → v67) — 2 correctifs :
// (1) Annonces enfin résolu — vraie erreur obtenue cette fois : "column
// annonces.actif does not exist". Filtre .eq('actif', true) retiré de
// getAnnonces(), cette colonne n'existe pas sur la vraie table.
// (2) Déplacements à venir/historique : le découpage se faisait par DATE
// (v66), Remi voulait par STATUT — un déplacement "Fermé" (ou "Annulé")
// va maintenant dans l'historique même si sa date est encore future (ex:
// fermé manuellement en avance). getDeplacementsHistorique (v66, requête
// serveur par date) retirée — un seul appel getDeplacements(false) côté
// front, partitionné par statutEffectifDepl/estHistoriqueDepl.
// statutEffectifDepl couvre maintenant aussi "complet" (pas seulement
// "ouvert") une fois la date du match dépassée.
//
// v66 (09/07/2026) : CACHE_NAME bumpé (v65 → v66) — page Déplacements
// réorganisée comme la page Sessions Tifo (demande Remi) : deux sections
// "Déplacements à venir" / "Historique" au lieu d'une liste unique.
// Nouvelle fonction getDeplacementsHistorique() (20 derniers déplacements
// passés, même limite que getPastSessions) ; enrichissement _inscrits/
// monInscrit factorisé (_enrichirDeplacements) entre les deux fonctions.
// Le tri "ouverts en premier" (v63) reste appliqué uniquement à la liste
// "à venir". Corrigé au passage : inscriptionsDeplFermees() ferme
// maintenant aussi une fois la date du MATCH passée (pas seulement
// date_limite_inscription) — sinon un déplacement de l'historique aurait
// encore pu afficher "M'inscrire" pour un bus déjà parti.
// ⚠️ Aucune migration SQL nécessaire.
//
// v65 (09/07/2026) : CACHE_NAME bumpé (v64 → v65) — correctif "Matchs
// (saison)" : comptait le nombre total de matchs programmés au calendrier
// (34), pas les présences personnelles — recalculé comme la somme des
// présences domicile + extérieur du membre (demande Remi : "matchs
// présents dans la saison domicile + extérieur").
//
// v64 (09/07/2026) : CACHE_NAME bumpé (v63 → v64) — 4 sujets Accueil/
// Stats/Annonces (demande Remi) :
// (1) Section "Prochain déplacement" retirée d'Accueil — redondante avec
// le bouton "🚌 Voir le déplacement" déjà présent sur la carte "Prochain
// match extérieur".
// (2) Annonces : "Impossible de charger" toujours signalé malgré le
// correctif v57 — l'erreur réelle (e.message) s'affiche maintenant
// directement dans le message, pour diagnostiquer sans devoir ouvrir la
// console navigateur.
// (3) Nouveau : présence déclarative gratuite aux matchs à DOMICILE
// (bouton "✅ Présent au match" sur la carte, désinscription possible à
// tout moment — contrairement à un déplacement extérieur, payant). Table
// presences_matchs_domicile, RLS un membre gère sa propre présence.
// renderMatchCard (calendrier.js) accepte un 3e paramètre optionnel
// avecPresence (jamais utilisé nulle part ailleurs que la carte domicile
// d'Accueil pour l'instant — Calendrier et la carte extérieur inchangés).
// (4) "Mes stats" (Accueil + Profil + mini-bloc page Statistiques admin)
// remplacées : Matchs (saison), Présent domicile, Présent extérieur
// (désormais basé sur present_at réellement scanné, pas juste
// inscrit/payé), Sessions tifo réalisées.
// ⚠️ Nécessite d'exécuter migration_presence_matchs_domicile.sql avant de
// déployer les fichiers front.
//
// v63 (09/07/2026) : CACHE_NAME bumpé (v62 → v63) — 2 demandes Remi sur la
// liste Déplacements : (1) tri : ouverts en premier, fermés/complets/
// annulés ensuite, chronologique dans chaque groupe. (2) Un déplacement
// resté "ouvert" en base dont la date du match est déjà passée se
// comporte désormais comme "fermé" à l'affichage (badge + tri) — calculé
// à la volée (statutEffectifDepl), rien de modifié en base, jamais
// appliqué à un statut déjà "complet"/"annulé". Annonces : bug "Impossible
// de charger" toujours signalé malgré le correctif v57 (embeds déjà
// retirés) — en attente du message d'erreur exact ou confirmation que
// v57 est bien déployé avant nouvelle investigation.
//
// v62 (09/07/2026) : CACHE_NAME bumpé (v61 → v62) — suite retour Remi sur
// le multi-personnes Déplacements :
// (1) Liste "Inscrits" (admin) : un invité hors app affiche maintenant
// son nom/prénom (au lieu de "@?" vide) ; le nom du PAYEUR s'affiche en
// plus quand il diffère du participant ("💳 Payé par @...") — pour savoir
// qui a réglé la place de qui. getDeplacement() embarque désormais aussi
// le payeur (2e FK vers membres, contrainte explicite comme pour
// membre_id).
// (2) Scan présence (contexte Déplacement) : refonte complète du flux —
// on scanne maintenant le QR du PAYEUR (pas celui du participant), et
// l'admin voit la liste de TOUTES les places que cette personne a payées
// pour ce déplacement (soi + amis + invités), avec une case à cocher par
// personne. Un seul "Confirmer" valide la présence des personnes cochées
// — si le payeur a réglé 3 places, coche les 3 pour valider les 3 d'un
// coup (ou seulement celles réellement présentes). confirmerPresenceDeplacement
// (singulier, un membre_id) remplacée par confirmerPresencesDeplacement
// (pluriel, une liste d'inscriptionIds) — fonctionne aussi pour les
// invités hors app, qui n'ont pas de membre_id. validerPaiementCash prend
// désormais un inscriptionId directement (même raison : un invité n'a pas
// de membre_id à chercher).
// ⚠️ Aucune migration SQL nécessaire pour cette version (les colonnes
// utilisées existent déjà depuis migration_deplacements_avance.sql).
//
// v61 (09/07/2026) : CACHE_NAME bumpé (v60 → v61) — 2 demandes Remi liées
// aux amis sur Déplacements :
// (1) Système de demandes d'amitié (nouvelle page "👥 Mes amis" depuis
// Profil) : recherche par pseudo, envoi de demande, acceptation/refus,
// liste des amis confirmés. Table amities (2 FK vers membres, contrainte
// explicite sur les embeds comme pour inscriptions_deplacement). La liste
// "amis" utilisable pour inscrire plusieurs personnes à un déplacement
// (getMembresPourAmisDepl) ne renvoie désormais QUE les amitiés
// confirmées, plus tous les membres actifs comme dans la version
// précédente.
// (2) Confidentialité : nouvelle fonction nomAfficheMembre (app.js) — un
// membre simple ne voit jamais le nom/prénom d'un autre membre simple,
// seulement son pseudo (@handle) ; seuls Bureau/Admin (roles_app
// admin_app/bureau_app) voient le nom complet. Appliqué à la recherche
// d'amis, aux demandes reçues/envoyées, à la liste d'amis, et au
// sélecteur "amis" sur Déplacements. ⚠️ Cette règle n'a PAS été
// rétro-appliquée aux pages de gestion existantes (Gérer les membres,
// Comité de passage) qui restent inchangées — ces cellules ont besoin de
// voir les vraies identités pour leur travail ; à confirmer avec Remi si
// la confidentialité doit aller plus loin.
// ⚠️ Nécessite d'exécuter migration_amities.sql avant de déployer les
// fichiers front.
//
// v60 (09/07/2026) : CACHE_NAME bumpé (v59 → v60) — Déplacements
// multi-personnes désormais COMPLET (partie serveur reçue de Remi) :
// helloasso-create-checkout étendu pour accepter { deplacementId,
// participants } — crée une ligne inscriptions_deplacement par
// participant (soi/ami app/invité hors app), un seul paiement HelloAsso
// pour le total (prix_total × nb participants). Validation en deux
// passes (résolution+vérif sans écriture, puis écriture) pour ne jamais
// laisser de lignes orphelines si un participant du groupe est déjà payé.
// Quota par payeur recalculé correctement en tenant compte des lignes
// réutilisées (une relance de paiement ne consomme jamais deux fois le
// quota). helloasso-webhook étendu en miroir : metadata.inscription_ids
// (pluriel) marque toutes les lignes du groupe 'paye_ha' ensemble à la
// confirmation, notifie chaque participant ayant un compte app + le
// payeur. Les deux fichiers Edge Function restent strictement
// rétrocompatibles : sans `participants` dans la requête (cas de
// relancerPaiementDeplacement, la relance de paiement), le comportement
// est identique à avant au bit près. ⚠️ Déploiement : remplacer les 2
// fichiers supabase/functions/helloasso-create-checkout/index.ts et
// supabase/functions/helloasso-webhook/index.ts, puis redéployer
// (supabase functions deploy helloasso-create-checkout / helloasso-webhook).
// Aucun changement de secrets/config nécessaire.
//
// v59 (09/07/2026) : CACHE_NAME bumpé (v58 → v59) — 4 évolutions
// Déplacements (demande Remi) :
// (1) Accès échelonné par statut : 3 dates optionnelles par déplacement
// (ouverture_confirme/draft/sympathisant) — un statut sans date reste
// ouvert sans restriction (comportement par défaut inchangé). Vérifié
// côté client (inscriptionPasEncoreOuvertePourMoi), affiché en badge
// "🔒 Ouverture le …" à la place du bouton M'inscrire tant que la date
// n'est pas atteinte pour le statut du membre connecté.
// (2) Quota par membre (quota_par_membre sur deplacements, mirroir exact
// du quota Sticks/Matos) — compte le total de places réservées par
// PAYEUR (pas juste par participant, cf. point 3).
// (3) Inscription multi-personnes : nouveau modal modalInscritDepl
// (soi + case "amis de l'app" avec sélection multiple + case "amis hors
// app" avec saisie nom/prénom/email répétable). ⚠️ PARTIEL : le paiement
// pour plusieurs personnes en une fois nécessite une évolution de
// l'Edge Function helloasso-create-checkout dont le code source n'a pas
// été fourni dans cette session (contrat attendu documenté en commentaire
// dans demanderInscriptionDeplacementHelloAsso, supabase-client.js) — le
// modal et les 3 autres évolutions sont pleinement fonctionnels dès
// maintenant, seule la validation du paiement à plusieurs est en attente.
// (4) La relance de paiement pour une inscription déjà existante
// (refusée/en attente) reste sur l'ancien appel exact, inchangé
// (relancerPaiementDeplacement) — aucune dépendance à l'Edge Function à
// venir pour ce cas, donc aucune régression possible dessus.
// ⚠️ Nécessite d'exécuter migration_deplacements_avance.sql avant de
// déployer les fichiers front (nouvelles colonnes utilisées dès le
// chargement de la page).
//
// v58 (09/07/2026) : CACHE_NAME bumpé (v57 → v58) — "🕵️ Se connecter en
// tant que" (demande Remi, option B "vraie connexion") : nouveau bouton
// sur chaque carte de Gérer les membres, visible uniquement pour
// admin_app (pas Bureau, volontairement plus strict que le reste du hub
// Admin — cette action donne un accès complet au compte de la personne).
// Génère un vrai lien de connexion (magic link) via la nouvelle Edge
// Function admin-generer-lien-connexion (service_role, jamais exposé
// côté client ; rôle admin_app revérifié côté serveur, indépendamment de
// l'UI). ⚠️ Comportement à connaître : ouvrir ce lien dans le même
// navigateur REMPLACE la session Admin actuelle par celle du membre visé
// (session partagée par origine, pas par onglet) — confirmation explicite
// affichée avant génération, et recommandation d'ouvrir en navigation
// privée pour garder les deux sessions en parallèle. ⚠️ Nécessite de
// déployer la nouvelle Edge Function (admin-generer-lien-connexion,
// Verify JWT resté ACTIVÉ — ne pas le désactiver comme les autres
// fonctions du projet, indispensable ici) avant de déployer admin.js/
// supabase-client.js.
//
// v57 (09/07/2026) : CACHE_NAME bumpé (v56 → v57) — vrai correctif des
// annonces (le précédent, en v50, devinait un nom de contrainte FK qui
// s'est révélé faux). Erreur exacte obtenue cette fois : "Could not find
// the 'cellule_id' column of 'annonces' in the schema cache" — cette
// colonne n'existe pas du tout dans la vraie table, retirée de
// publierAnnonce() (elle n'était de toute façon jamais renseignée par
// l'UI). Pour getAnnonces(), embed PostgREST membres(...) abandonné
// complètement (plus de pari sur un nom de contrainte) : deux requêtes
// séparées désormais — les annonces, puis les auteurs récupérés à part
// et recollés en JS. Aucun changement de rendu (le nom de l'auteur
// n'est de toute façon pas affiché sur Accueil).
//
// v56 (09/07/2026) : CACHE_NAME bumpé (v55 → v56) — correctif affichage
// sur pageVerifCode ("🔍 Vérifier un code réabonnement") : le champ de
// recherche s'affichait comme un minuscule carré, le bouton "Chercher"
// prenant presque toute la largeur. Cause : .btn a width:100% par défaut
// (pensé pour des boutons empilés en pleine largeur, cf. le reste de
// l'app) — placé à côté d'un input flex:1 dans une même ligne flex, les
// deux se disputaient l'espace et le bouton gagnait presque tout.
// Corrigé avec width:auto;flex-shrink:0 sur ce bouton précis. Aucun
// autre endroit de l'app ne combine input+bouton sur une même ligne
// flex, donc pas d'autre occurrence de ce bug à corriger.
//
// v55 (09/07/2026) : CACHE_NAME bumpé (v54 → v55) — retour Remi : l'outil
// de recherche au cas par cas "ne sert pas à grand chose", le code doit
// être visible directement sur chaque carte membre de la page Comité de
// passage. loadMembresComite() charge maintenant TOUTE la table
// codes_reabonnement en un seul appel (admin_lister_codes_reabonnement,
// cf. migration_liste_codes_reabonnement.sql), indexée par email
// côté front — chaque carte affiche son(ses) code(s) le cas échéant, ou
// "Aucun code réabonnement pour cet email" sinon. Échec silencieux si
// l'appel échoue (rôle insuffisant, etc.) : la page se charge quand même,
// juste sans codes affichés. La page de recherche au cas par cas
// (pageVerifCode) reste disponible en plus — utile pour une personne pas
// encore inscrite sur l'app, donc absente de cette liste de cartes.
// ⚠️ Nécessite d'exécuter migration_liste_codes_reabonnement.sql (après
// migration_maj_role_recherche_code.sql) avant de déployer admin.js.
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

// v79 (10/07/2026) : CACHE_NAME bumpé (v78 → v79) — statut "Brouillon"
// pour Déplacements/Matos/Sticks/Cartage (visible_membres) : un
// déplacement/article créé avec la case "🔒 Brouillon" cochée reste
// invisible pour les membres normaux, visible uniquement par la cellule
// concernée (+ Bureau/Admin) — permet de tester un vrai paiement
// HelloAsso en production avant publication. Nécessite la migration
// migration_brouillon_visible_membres.sql (ajout colonne visible_membres,
// default true, donc aucune régression sur l'existant).
// v80 (12/07/2026) : CACHE_NAME bumpé (v79 → v80) — page Gestion Boutique
// (Par article / Par membre) affiche désormais "×N lots" ET le nombre
// réel de stickers (lots × taille du lot) pour les articles Sticks,
// dans l'app et dans l'export Telegram. Aucun changement pour Matos
// (pas de notion de lot).
// v81 (12/07/2026) : CACHE_NAME bumpé (v80 → v81) — les dates d'ouverture
// (précommande Matos/Sticks, accès échelonné Déplacements) sont
// désormais affichées en permanence sur la carte, plus seulement avant
// l'ouverture. Demande Remi.
// v82 (12/07/2026) : CACHE_NAME bumpé (v81 → v82) — nouvelle carte
// "🎨 Stats Tifo" sur la page Statistiques Admin (sessions, présences,
// répartition par type, classement assiduité).
const CACHE_NAME = 'ul-v82';

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
    // ⚠️ Corrigé 10/07/2026 (bug rapporté par Remi : ancienne version
    // d'admin.js encore servie malgré un déploiement confirmé à jour sur
    // GitHub) — fetch(e.request) tout seul respecte le cache HTTP du
    // navigateur (et/ou celui du CDN de GitHub Pages) : "network-first"
    // ne garantissait donc PAS un vrai aller-retour réseau, juste un
    // fetch() qui pouvait être satisfait silencieusement par une réponse
    // en cache si elle était encore "fraîche" selon les en-têtes
    // Cache-Control — sans jamais toucher le réseau ni ce service worker.
    // { cache: 'reload' } force la revalidation réelle auprès du serveur.
    const req = new Request(e.request.url, { cache: 'reload' });
    e.respondWith(
      fetch(req).then(response => {
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
