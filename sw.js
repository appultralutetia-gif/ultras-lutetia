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
// v83 (12/07/2026) : CACHE_NAME bumpé (v82 → v83) — Stats Tifo devient un
// onglet séparé (Général / Tifo) sur la page Statistiques, avec beaucoup
// plus de KPI : vue d'ensemble (dont taux Confirmés+Draft ayant
// participé, répartition 0/1/2/3-4/5+ sessions), répartition par type/
// lieu/statut membre, classement top 10 + no-show + nouveaux (30j),
// évolution mensuelle + cumul participants uniques, classement des
// sections.
// v84 (12/07/2026) : CACHE_NAME bumpé (v83 → v84) — onglet Stats Tifo :
// courbe SVG combinée (présences/mois + cumul unique) à la place des
// barres, histogramme pour le classement des sections, KPI "présents
// max" avec libellé générique (plus le nom de session en gros), % ajouté
// sous chaque tranche du nombre de sessions faites.
// v85 (12/07/2026) : CACHE_NAME bumpé (v84 → v85) — la courbe Stats Tifo
// affiche maintenant la valeur numérique à côté de chaque point (série
// présences en dessous, série cumulé au-dessus, pour limiter le
// chevauchement).
// v86 (12/07/2026) : CACHE_NAME bumpé (v85 → v86) — décomposition du
// prix Déplacement en "Prix bus" + "Prix place" (pré-rempli 10€,
// modifiable), ajout distance A/R et coût réel du devis bus, indicateur
// d'équilibre en direct dans les formulaires création/modification +
// aperçu sur la carte et la fiche détail (cellule Déplacement
// uniquement). prix_total reste calculé automatiquement, jamais saisi
// à la main. Migration : migration_decomposition_prix_deplacements.sql
// (déjà appliquée en direct).
// v87 (12/07/2026) : CACHE_NAME bumpé (v86 → v87) — visibilité brouillon
// précisée (demande Remi) : admin + bureau + cellule CONCERNÉE
// précisément (Matos → cellule_matos, Sticks → cellule_sticks, Cartage →
// cellule_comite, Déplacements → cellule_depl déjà correct), plus
// "n'importe quelle cellule" comme avant. Le bypass niveau_acces
// (Matos/Sticks) reste inchangé, générique à toute cellule.
// v88 (12/07/2026) : CACHE_NAME bumpé (v87 → v88) — correction de la
// table stade→ville (STADE_VERS_VILLE) : plusieurs clés ne matchaient
// pas les vrais noms de stades du calendrier 2026-2027 (Auxerre, Angers,
// Marseille, Le Mans) — la déduction auto de ville échouait
// silencieusement pour ces 4 matchs. Corrigé + ville rétroremplie en
// base pour les 17 déplacements existants.
// v89 (12/07/2026) : CACHE_NAME bumpé (v88 → v89) — listes "Commandes en
// cours" (Matos et Sticks, vue "Toutes") triées : commandes en cours
// groupées en premier, annulées/refusées/reçues après — pour plus de
// visibilité (demande Remi).
// v90 (12/07/2026) : CACHE_NAME bumpé (v89 → v90) — Stats Tifo très
// enrichie (demande Remi) : sélecteur de saison (nouvelle colonne
// sessions_tifo.saison), taux de rétention, décrocheurs (45j+),
// cadence moyenne entre sessions, participation cellule Tifo, taux de
// remplissage vs capacité, tranches de sessions faites séparées
// Confirmé/Draft, classement filtrable par type (clic sur une barre),
// classement complet ("Voir tout"), comparaison saison précédente,
// export CSV du classement, export PDF de toute la page (impression).
// v91 (13/07/2026) : CACHE_NAME bumpé (v90 → v91) — Classement Ligue 1
// (demande Remi) : nouvelle carte en haut de la page Calendrier,
// repliée par défaut (aperçu ligne Paris FC), synchronisée
// automatiquement toutes les 3h via cron Supabase + Edge Function
// sync-classement-ligue1 (source football-data.org, gratuite). Bouton
// "🔄 Rafraîchir" manuel réservé Admin/Bureau. Nécessite le secret
// FOOTBALL_DATA_API_KEY côté Supabase (à poser par Remi, cf. message).
// v92 (13/07/2026) : CACHE_NAME bumpé (v91 → v92) — bascule Ligue 1 vers
// API-Football avec système de synchro "intelligent" (crons fréquents
// mais auto-gated, ne consomment le quota que dans les fenêtres
// pertinentes) : classement (toutes les 15 min si match L1 en cours),
// suivi live PFC (compo ~45 min avant, score+buteurs+stats toutes les
// 8 min pendant le match). Carte match affiche désormais le badge "EN
// DIRECT", les buteurs, et un indicateur "Compositions disponibles".
// v94 (16/07/2026) : CACHE_NAME bumpé (v93 → v94) — annulation commandes
// non payées (bouton Annuler membre + admin déplacements), exclusion
// en_attente des comptages précommandes boutique, masquage membres
// anonymisés (RGPD) dans les demandes en attente et liste admin.
// v93 (13/07/2026) : CACHE_NAME bumpé (v92 → v93) — nettoyage complet du
// système Ligue 1 "intelligent" API-Football (abandonné : plan gratuit
// ne couvre pas la saison en cours) — retrait du code live PFC
// (buteurs/badge direct/compos) de renderMatchCard, colonnes et tables
// superflues supprimées côté base. sync-classement-ligue1 repassée sur
// football-data.org, cron simple toutes les 15 min. 2 matchs erronés
// (VfB Stuttgart, Anger) supprimés du calendrier PFC.
// v95 (17/07/2026) : CACHE_NAME bumpé (v94 → v95) — correction crash
//   silencieux (ID dupliqué modalAvertissementHelloAsso supprimé),
//   getMesAchats corrigé (bons noms de colonnes Supabase), onglet Don
//   boutique + page Historique d'achats + attestations de paiement.
// v96 (17/07/2026) : CACHE_NAME bumpé (v95 → v96) — app.js : showApp() et
//   signerCharteGate() appellent désormais explicitement
//   afficherPage('pageAccueil') avant de charger le contenu de l'accueil,
//   au lieu de compter sur class="page active" codé en dur dans
//   index.html. Robustesse : l'affichage de l'accueil ne dépend plus d'un
//   attribut statique du markup qui pourrait disparaître lors d'un futur
//   remaniement du HTML.
// v97 (17/07/2026) : CACHE_NAME bumpé (v96 → v97) — index.html : retrait
//   du style="display:none;" codé en dur sur #pageHistorique et #pageDon.
//   Ce style inline avait une priorité CSS supérieure à la règle de
//   classe .page.active, donc même une fois la classe "active" ajoutée
//   par afficherPage(), ces 2 pages restaient invisibles (écran noir) —
//   confirmé en DevTools : className='page active' mais
//   getComputedStyle().display='none'. La visibilité de ces pages est
//   désormais entièrement gérée par le système .page/.page.active, comme
//   toutes les autres pages de l'app.
// v98 (17/07/2026) : CACHE_NAME bumpé (v97 → v98) — profil.js :
//   loadHistorique() divisait par erreur tous les montants par 100
//   (`a.montant/100`), comme s'ils étaient stockés en centimes. Or
//   getMesAchats() (supabase-client.js) renvoie déjà un montant en EUROS
//   pour les 4 types (deplacement, matos, stick, cartage) — la division
//   affichait donc 15 € comme 0,15 €. Retirée, montant affiché tel quel.
// v99 (17/07/2026) : CACHE_NAME bumpé (v98 → v99) — supabase-client.js
//   (getMesAchats) + profil.js (loadHistorique/genererAttestation)
//   affichent désormais numero_commande_ha (numéro de commande définitif
//   HelloAsso, capturé côté serveur par helloasso-webhook à la
//   confirmation du paiement) en priorité sur checkout_intent_id (ID de
//   l'intention de paiement, différent — cf. cas rapporté par Remi :
//   app affichait 6547557, reçu HelloAsso affichait n°187972729).
//   Vérifié sur un vrai paiement le 17/07/2026 : data.order.id du
//   payload webhook = le bon numéro. Repli automatique sur
//   checkout_intent_id pour les paiements antérieurs à cet ajout.
// v100 (20/07/2026) : CACHE_NAME bumpé (v99 → v100) — sessions_tifo :
//   blocage de l'inscription une fois capacite_max atteint (trigger DB,
//   inchangé ici) + tifos.js : tri "à venir" avec les sessions non-
//   complètes en premier (comme les déplacements), badge "Complet" en
//   rouge, bouton "S'inscrire" remplacé par un état bloqué. Fichiers
//   modifiés : tifos.js, supabase-client.js (notif push aux admins
//   Cellule Tifo à chaque inscription, cf. notifierAdminsTifoInscription).
// v101 (20/07/2026) : CACHE_NAME bumpé (v100 → v101) — v100 ne corrigeait
//   le tri "non-complètes en premier" que dans la page Tifos (tifos.js) ;
//   oubli du widget "Prochaine session tifo" sur l'Accueil (app.js,
//   loadAccueil), qui appelle aussi getUpcomingSessions() en direct avec
//   son propre slice(0,2) — même tri appliqué là aussi maintenant.
// v102 (20/07/2026) : CACHE_NAME bumpé (v101 → v102) — tifos.js : le
//   champ "description" (déjà en base, déjà dans le formulaire d'édition,
//   jamais affiché nulle part) apparaît maintenant sur la fiche de
//   chaque session, uniquement pour Admin/Bureau/Cellule Tifo
//   (hasCelluleTifo) — un membre simple ne le voit pas.
// v103 (20/07/2026) : CACHE_NAME bumpé (v102 → v103) — nouveau bouton
//   "📋 Cartage non inscrits" sur la page Gérer les membres (Admin) :
//   exporte en CSV (nom, prénom, email) les personnes ayant payé le
//   cartage mais n'ayant pas encore de compte dans l'app. Fichiers
//   modifiés : index.html (bouton), admin.js (exporterCsvCartageNonInscrits),
//   supabase-client.js (getCartageNonInscrits). Migration DB associée :
//   ajout des colonnes nom/prenom sur cartage_preinscriptions.
// v104 (20/07/2026) : CACHE_NAME bumpé (v103 → v104) — nouveau champ
//   membres.cartage_depuis (calculé une fois via script à partir de
//   l'historique multi-saisons 2022-2023 → 2026-2027, table
//   cartage_historique), affiché sous forme "Carté depuis XXXX-XXXX" sur
//   les cartes "Comité de passage" et "Gérer les membres" (admin.js).
//   Règle : plus vieille saison si continu jusqu'à aujourd'hui, sinon
//   la saison la plus récente si une saison manque dans l'historique.
// v105 (20/07/2026) : CACHE_NAME bumpé (v104 → v105) — "Carté depuis
//   XXXX-XXXX" ajouté aussi sur la page Profil du membre (profil.js),
//   sous la ligne Cartage. Aucune requête supplémentaire nécessaire,
//   le champ était déjà chargé via getMembre() (select *).
// v106 (20/07/2026) : CACHE_NAME bumpé (v105 → v106) — page Comité de
//   passage : compteur "X / Y sans code de réabonnement" (respecte les
//   filtres actifs, comme les autres exports) + nouveau bouton "Export
//   sans code réabonnement" (CSV : pseudo, prénom, nom, email, statut,
//   section). Fichiers modifiés : index.html, admin.js.
// v107 (20/07/2026) : CACHE_NAME bumpé (v106 → v107) — Comité de
//   passage : nouveau filtre toggle "🎫 Sans code réabonnement" (le
//   compteur X/Y reste basé sur les autres filtres actifs, indépendant
//   de ce toggle, pour rester lisible même quand il est activé). Gérer
//   les membres : le(s) code(s) de réabonnement (ou son absence) sont
//   maintenant affichés sur chaque carte, comme sur le Comité de passage
//   (chargement des codes ajouté à loadMembres). Fichiers modifiés :
//   index.html, admin.js.
// v108 (20/07/2026) : CACHE_NAME bumpé (v107 → v108) — Gérer le cartage
//   (Suivi des paiements) : nouveau filtre statut UL (Visiteur/Sympa/
//   Draft/Confirmé), combinable avec les filtres existants. Gérer les
//   membres : les 6 filtres cartage de "Gérer le cartage" (Incomplets,
//   En attente, Payé, Cartage non payé, Charte non signée) y sont
//   maintenant disponibles aussi, combinables avec le filtre statut
//   déjà présent. Fichiers modifiés : index.html, admin.js,
//   calendrier.js, supabase-client.js (nouvelle fonction
//   getDerniersPaiementsCartageParMembre).
// v109 (20/07/2026) : CACHE_NAME bumpé (v108 → v109) — nouveau lien
//   "Compte non confirmé ? Renvoyer le code" sur l'écran de connexion.
//   Contrairement au bouton "renvoyer" déjà présent sur l'écran OTP
//   (qui dépend de _emailEnAttenteOtp, perdu si l'app a été fermée
//   entre-temps), celui-ci redemande l'email et fonctionne donc même
//   après avoir quitté l'app — utile pour tous les comptes bloqués sans
//   avoir à recréer un compte (impossible, email déjà pris) ni à
//   attendre une intervention manuelle. Fichiers modifiés : index.html,
//   app.js.
// v110 (21/07/2026) : CACHE_NAME bumpé (v109 → v110) — correctif : le
//   texte "Liste Bus" Telegram affichait "PAYÉS (2/null)" au lieu de
//   "PAYÉS (2)" quand le déplacement n'a pas de quota de places défini
//   (places_max null = illimité) — signalé par Paul Coyette sur
//   ESTAC Troyes. Fichier modifié : supabase-client.js
//   (getListeBusTelegram).
// v111 (21/07/2026) : CACHE_NAME bumpé (v110 → v111) — RÉGRESSION
//   corrigée : le tri "non-complètes en premier" du widget Accueil
//   "Prochaine session tifo" (app.js:loadAccueil) avait disparu suite à
//   une réécriture ultérieure du fichier lors de l'ajout du renvoi de
//   code de confirmation (19/07/2026) — perte accidentelle, pas une
//   décision. Remis en place. Fichier modifié : app.js.
// v112 (21/07/2026) : CACHE_NAME bumpé (v111 → v112) — le modal
//   "Confirmer l'inscription" (engagement de présence), jusqu'ici
//   uniquement sur les sessions Tifo, s'affiche maintenant aussi avant
//   "M'inscrire" sur un déplacement (les deux boutons, carte liste et
//   vue détail — pas sur "Réessayer/Relancer le paiement", qui concerne
//   une inscription déjà engagée). Modal généralisé en interne pour
//   gérer les deux types sans duplication. Fichiers modifiés :
//   index.html, app.js, tifos.js, deplacements.js.
// v113 (21/07/2026) : CACHE_NAME bumpé (v112 → v113) — nouveau bouton
//   "📧 Confirmer email" sur les cartes de Gérer les membres : confirme
//   directement l'email d'un compte (bypass du code à 8 chiffres),
//   Admin/Bureau uniquement (vérifié aussi côté fonction Postgres
//   confirmer_email_membre, pas seulement côté app). Fini de me le
//   demander à chaque fois. Fichiers modifiés : admin.js,
//   supabase-client.js.
// v114 (21/07/2026) : CACHE_NAME bumpé (v113 → v114) — "🕐 Dernière
//   connexion" (format "Il y a X jours" / "Hier" / "Aujourd'hui" /
//   "Jamais connecté") ajoutée sur les cartes de Gérer les membres ET
//   Comité de passage. Nouvelle fonction Postgres
//   lister_dernieres_connexions (Admin/Bureau uniquement, expose
//   auth.users.last_sign_in_at normalement inaccessible). Fichiers
//   modifiés : admin.js, supabase-client.js.
// v115 (21/07/2026) : CACHE_NAME bumpé (v114 → v115) — correctif règle
//   "seule une commande PAYÉE compte dans le quota" (demande Remi
//   21/07/2026, cas Brahim Bennais / Tour de Cou) : passerCommande et
//   distribuerProduitAdmin ne comptaient plus 'en_attente' dans le
//   quota_par_membre boutique ; getMonQuotaDepl ne comptait plus que
//   'paye_cash'/'paye_ha' (au lieu de TOUTES les inscriptions, y
//   compris en_attente/refuse/annule/rembourse) dans le quota
//   déplacement. ⚠️ Le flux HelloAsso (Edge Function
//   helloasso-create-checkout, hors dépôt front) applique probablement
//   la même logique de quota côté serveur et n'a pas pu être corrigé
//   ici — c'est très probablement la cause réelle du blocage de
//   Brahim. Fichier modifié : supabase-client.js.
// v116 (22/07/2026) : CACHE_NAME bumpé (v115 → v116) — page Stats
//   (Général) : nouveau KPI "Cartés non inscrits sur l'app" (réutilise
//   getCartageNonInscrits) et courbe cumulée du nombre de membres
//   inscrits par mois (SVG généré côté client, pas de librairie externe
//   ajoutée). Fichiers modifiés : admin.js, supabase-client.js.
// v117 (22/07/2026) : CACHE_NAME bumpé (v116 → v117) — Stats (Général),
//   correctifs et ajouts demandés par Remi : courbe d'inscriptions
//   regroupée par SEMAINE au lieu du mois (trop peu de points sinon) ;
//   suppression du doublon Confirmés/Drafts (affichés à la fois en KPI
//   et dans le détail par statut) ; ajout Visiteur au détail par statut,
//   retrait de "Cellule" (n'était pas un vrai statut, toujours à 0) ;
//   nouvelle répartition par section ; nouvelles stats Cartage à jour/
//   Charte signée/Actifs/Bloqués ; nouveau détail par rôle (Admin/
//   Bureau/Cellules). Fichiers modifiés : admin.js, supabase-client.js.
// v118 (22/07/2026) : CACHE_NAME bumpé (v117 → v118) — valeurs affichées
//   directement sur la courbe d'inscriptions ; correctif : le bouton
//   d'onglet "Tifo" de la page Stats ne faisait rien (switchStatsTab
//   n'existait pas du tout, ni aucun rendu des stats Tifo pourtant déjà
//   calculées par getStatsTifo) — implémenté. Ajout de 3 nouveaux
//   onglets Stats : Déplacement, Matos, Stick (nouvelles fonctions
//   getStatsDeplacements/getStatsMatos/getStatsSticks). Fichiers
//   modifiés : index.html, admin.js, supabase-client.js.
// v119 (22/07/2026) : CACHE_NAME bumpé (v118 → v119) — Boutique : un
//   article/stick en mode 'precommande' dont precommande_fin est passée
//   disparaît désormais entièrement du catalogue membre (getProduits/
//   getSticks), remplaçant l'ancien comportement "visible mais fermé".
//   Nouvel onglet admin "🗄️ Historique" (Matos et Sticks) listant ces
//   articles archivés (getProduitsHistoriqueMatos/getSticksHistorique).
//   Nouveau menu déroulant de filtre par article dans "Commandes en
//   cours" (Matos et Sticks), combinable avec le filtre En cours/Toutes
//   existant. Fichiers modifiés : index.html, boutique.js,
//   supabase-client.js.
// v120 (22/07/2026) : CACHE_NAME bumpé (v119 → v120) — correctif : les 5
//   fonctions appelant helloasso-create-checkout affichaient le message
//   générique du SDK Supabase ("Edge Function returned a non-2xx status
//   code") au lieu du vrai message renvoyé par la fonction (ex. "Quota
//   dépassé..."), perdu car non-2xx → data devient null côté SDK. Le
//   vrai message est maintenant relu depuis error.context. Signalé par
//   le cas Brahim Bennais / Tour de Cou (le déploiement du correctif de
//   quota du 21/07 était en fait bon — vérifié directement via les logs
//   et le code déployé, ce n'était pas la cause). Nouvelle fonction
//   partagée appellerHelloAssoCheckout. Fichier modifié :
//   supabase-client.js.
// v121 (22/07/2026) : CACHE_NAME bumpé (v120 → v121) — VRAI bug de
//   quota trouvé et corrigé (cas Brahim Bennais/Tour de Cou, épisode 2,
//   message "Quota dépassé" enfin lisible grâce au correctif v120) : le
//   contrôle de quota Matos ne filtrait pas par produit_id — il
//   additionnait TOUTES les commandes payées du membre, tous articles
//   confondus, bloquant l'achat d'un article jamais acheté simplement
//   parce qu'un AUTRE article avait déjà été payé. Corrigé dans
//   passerCommande et distribuerProduitAdmin (front) ET dans
//   helloasso-create-checkout (Edge Function, déployée directement en
//   v30 sans repasser par un copier-coller manuel). Sticks n'avait pas
//   ce bug (stick_id déjà direct sur sticks_distribution). Fichier
//   modifié : supabase-client.js.
// v122 (22/07/2026) : CACHE_NAME bumpé (v121 → v122) — Déplacements,
//   3 demandes Remi : (1) 4e palier d'ouverture échelonnée "Visiteur"
//   ajouté (colonne ouverture_visiteur, migration appliquée) ; (2) plus
//   possible d'ajouter un "ami hors app" à l'inscription multi-
//   participants — uniquement soi-même + amis déjà membres de l'app ;
//   (3) correctif fuseau horaire sur les 4 dates d'ouverture échelonnée
//   (datetime-local) : elles étaient stockées en interprétant l'heure
//   saisie comme de l'UTC brut au lieu de l'heure de Paris, causant un
//   décalage de 1h (hiver) ou 2h (été) — converties désormais via
//   new Date(valeur).toISOString(), qui gère nativement le passage
//   heure d'été/hiver. Les champs Date du match/Heure départ/Date
//   limite n'étaient pas concernés (pas de composante datetime-local).
//   Fichiers modifiés : index.html, deplacements.js.
// v123 (22/07/2026) : CACHE_NAME bumpé (v122 → v123) — Déplacements,
//   demande Remi : sur chaque carte, Admin/Bureau/Cellule Déplacement
//   voient maintenant en plus du seuil "bus plein" déjà existant : (1)
//   le nombre de personnes manquantes pour atteindre l'équilibre au
//   nombre d'inscrits PAYÉS actuel, (2) le bénéfice ou la perte réel à
//   date — calculés uniquement sur prix_bus, jamais prix_place (le prix
//   de la place ne sert pas à couvrir le coût du bus). Correctif : ce
//   même groupe (Admin/Bureau/Cellule Déplacement) pouvait être bloqué
//   par l'ouverture échelonnée liée à son propre statut (visiteur/
//   sympa/draft/confirmé) même pour tester un paiement sur un
//   déplacement en brouillon — la visibilité des brouillons pour ce
//   groupe existait déjà, seule cette restriction d'horaire manquait
//   son bypass. Fichiers modifiés : deplacements.js,
//   supabase-client.js.
// v124 (22/07/2026) : CACHE_NAME bumpé (v123 → v124) — Tifo : "Voir les
//   participants" affichait nom+prénom à absolument tous les membres
//   (le pseudo seul aurait dû suffire) — corrigé, nom+prénom réservé à
//   Admin/Bureau/Cellule Tifo, comme c'était déjà le cas côté
//   Déplacement (bouton "Inscrits" réservé à la cellule) et Matos
//   (aucune liste de participants exposée aux membres, rien à changer).
//   Fichier modifié : tifos.js.
// v125 (23/07/2026) : CACHE_NAME bumpé (v124 → v125) — l'heure de
//   départ du bus n'est plus affichée dans le détail d'un déplacement
//   tant qu'on n'est pas inscrit et payé (info confidentielle, demande
//   Remi) — un message "🔒 Heure de départ visible une fois inscrit"
//   la remplace. Admin/Bureau/Cellule Déplacement la voient toujours,
//   comme le reste du détail cellule. Fichier modifié : deplacements.js.
// v126 (23/07/2026) : CACHE_NAME bumpé (v125 → v126) — libellé "Heure
//   départ bus" renommé en "Heure de RDV" (formulaires création/
//   modification + détail déplacement), demande Remi. Champ DB
//   heure_depart inchangé, purement cosmétique. Fichiers modifiés :
//   index.html, deplacements.js.
// v127 (23/07/2026) : CACHE_NAME bumpé (v126 → v127) — même correctif
//   que HelloAsso (v120) appliqué à genererLienConnexionAdmin ("Se
//   connecter en tant que") : le vrai message d'erreur renvoyé par
//   l'Edge Function admin-generer-lien-connexion était remplacé par le
//   texte générique du SDK Supabase. Cas observé : plusieurs 500
//   entrecoupés de 200 sur cette fonction en peu de temps (probable
//   limite de fréquence Supabase sur la génération de liens, pas un
//   bug lié à un compte précis). Fichier modifié : supabase-client.js.
// v128 (23/07/2026) : CACHE_NAME bumpé (v127 → v128) — nouvelle
//   exemption de paiement déplacements par membre (demande Remi, cas
//   Myriam Amarzit) : colonne membres.deplacements_gratuits. Un
//   participant exempté a sa part comptée à 0€ dans le calcul du
//   montant HelloAsso (Edge Function helloasso-create-checkout,
//   déployée directement en v31) ; si le groupe entier est exempté,
//   l'inscription est validée directement sans paiement HelloAsso.
//   Fichiers modifiés : deplacements.js, supabase-client.js.
const CACHE_NAME = 'ul-v128';

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
