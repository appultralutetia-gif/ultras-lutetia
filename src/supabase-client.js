// ============================================================
// ULTRAS LUTETIA — supabase-client.js
// Remplace gas-shim.js — même interface, backend Supabase
// ============================================================
//
// ⚠️ NOTE D'ARCHITECTURE (07/07/2026) — à lire avant de modifier Matos,
// Sticks ou Cartage :
//
// Ces 3 modules couvrent un besoin très similaire ("un membre paie un
// article/une cotisation via HelloAsso ou cash, un admin suit et valide")
// mais avec 3 modèles de données DIFFÉRENTS :
//   - Matos   : 2 tables — commandes (1 par achat) + commande_items
//               (1 ligne par article/taille/quantité dans cet achat)
//   - Sticks  : 1 table — sticks_distribution (tout sur la même ligne)
//   - Cartage : 1 table — cartage_paiements (tout sur la même ligne,
//               pas de notion de stock/précommande contrairement aux 2
//               autres)
//
// Conséquence pratique : la quasi-totalité des bugs corrigés le
// 07/07/2026 venaient d'une fonctionnalité ajoutée sur UN SEUL des 3
// modules puis oubliée sur les autres (double FK vers membres non gérée
// partout, colonne manquante sur un seul des 3, bouton "Annuler" présent
// sur Matos mais pas Sticks, etc.). Avant de considérer une fonctionnalité
// "terminée" sur l'un des 3, vérifier systématiquement si elle doit
// exister sur les 2 autres — et si un embed Supabase du type
// `membre:membres(...)` est ajouté sur une nouvelle table, vérifier
// d'abord si cette table a une deuxième colonne référençant membres
// (valide_par, receptionnee_par, distribue_par...) et préciser la
// contrainte FK exacte (`membres!ma_table_membre_id_fkey(...)`) dès le
// départ plutôt que d'attendre l'erreur en production.
//
// Une fusion des 3 modèles en un seul serait plus robuste à terme, mais
// c'est un refactor risqué vu l'usage réel de l'app — pas fait ici,
// simplement documenté comme point de vigilance.
// ============================================================

const SUPABASE_URL = 'https://afgriuvrtdkklluvtswg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmZ3JpdXZydGRra2xsdXZ0c3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTkwODgsImV4cCI6MjA5NzI5NTA4OH0.3jXUyJD87MjhFJctzceMVoeHWGCSqGmVy3TPuXGQebc';
// Clé publishable au nouveau format (sb_publishable_...) — requise spécifiquement
// pour les appels aux Edge Functions utilisant withSupabase({auth:'publishable'}),
// qui ne reconnaît pas l'ancien format JWT legacy ci-dessus. Ne pas confondre :
// SUPABASE_ANON_KEY reste utilisée pour tous les appels PostgREST classiques (sb.from...).
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nE0Xqxqx8DTRalIKGsqAMA_Gmnvclh7';

// ── Init client Supabase ──────────────────────────────────────
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Session courante ──────────────────────────────────────────
let currentUser = null;
let currentMembre = null;

// Callback optionnel assigné par app.js (window.UL_ON_PASSWORD_RECOVERY = fn).
// On ne peut pas se fier à la lecture manuelle de window.location.hash : le SDK
// supabase-js parse et nettoie le hash automatiquement, souvent avant même que
// notre code DOMContentLoaded ne s'exécute. L'événement 'PASSWORD_RECOVERY' du
// SDK est la seule source fiable pour détecter un clic sur le lien de reset.
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    if (typeof window.UL_ON_PASSWORD_RECOVERY === 'function') {
      window.UL_ON_PASSWORD_RECOVERY(session);
    }
  }
});

async function initSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    currentMembre = await getMembre(session.user.id);
  }
  return { user: currentUser, membre: currentMembre };
}

// ============================================================
// AUTH
// ============================================================

// Normalise un pseudo Telegram pour comparaison/stockage :
// retire @, espaces insécables/multiples, trim. La casse est gérée
// séparément via .ilike() au login pour rester insensible à la casse
// sans perdre la casse d'origine stockée en base (affichage inchangé).
function normalizePseudo(pseudoTelegram) {
  return (pseudoTelegram || '')
    .replace(/@/g, '')
    .replace(/[\u00A0\u202F\s]+/g, ' ') // espaces insécables/multiples → un seul espace normal
    .trim();
}

// Résout un pseudo Telegram en email via l'Edge Function resolve-pseudo
// (la table membres est protégée par RLS, lecture réservée à 'authenticated' —
// impossible de lire l'email directement avant connexion avec le client anon).
// Utilisée par loginByTelegram() (sans emailADoubleVerifier) et
// demanderResetMdp() (avec, pour exiger pseudo + email cohérents).
async function resolvePseudoToEmail(pseudoTelegram, emailADoubleVerifier) {
  const pseudo = normalizePseudo(pseudoTelegram);
  if (!pseudo) throw new Error('Pseudo Telegram requis');

  const payload = { pseudo_telegram: pseudo };
  if (emailADoubleVerifier) payload.email = emailADoubleVerifier.trim();

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/resolve-pseudo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_PUBLISHABLE_KEY, // format sb_publishable_... requis par withSupabase
    },
    body: JSON.stringify(payload),
  });
  const body = await resp.json();
  // L'Edge Function peut répondre HTTP 200 même en cas d'échec applicatif
  // (message + code dans le corps plutôt qu'un vrai statut d'erreur) — ne
  // jamais se fier uniquement à resp.ok : vérifier aussi que body.email
  // est bien présent, sinon on continue avec un email undefined qui finit
  // par faire planter signInWithPassword plus loin avec une erreur trompeuse
  // ("No API key found in request") qui n'a rien à voir avec la vraie cause.
  if (!resp.ok || !body.email) {
    throw new Error(body.message || body.error || 'Identifiants incorrects');
  }
  return body.email;
}

async function loginByTelegram(pseudoTelegram, password) {
  let email;
  try {
    email = await resolvePseudoToEmail(pseudoTelegram);
  } catch (e) {
    throw new Error(e.message || 'Pseudo Telegram introuvable');
  }

  const { data, error } = await sb.auth.signInWithPassword({ 
    email, 
    password 
  });
  if (error) throw new Error('Identifiants incorrects : ' + error.message);

  currentUser = data.user;
  currentMembre = await getMembre(data.user.id);
  return { success: true, membre: currentMembre };
}

// Envoie l'email de réinitialisation de mot de passe via Supabase Auth.
// Double vérification : pseudo ET email doivent correspondre au même membre,
// pour empêcher qu'un tiers connaissant seulement le pseudo (visible dans
// l'app) déclenche un reset sur le compte d'un autre membre.
// redirectTo passe par le même mécanisme de callback que la confirmation
// d'inscription (404.html → ultras-lutetia/?...#access_token&type=recovery),
// que app.js détecte au démarrage pour afficher le modal de reset.
async function demanderResetMdp(pseudoTelegram, emailSaisi) {
  if (!emailSaisi || !emailSaisi.trim()) throw new Error('Email requis');
  const email = await resolvePseudoToEmail(pseudoTelegram, emailSaisi); // laisse throw si pseudo/email ne correspondent pas

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://appultralutetia-gif.github.io/ultras-lutetia/',
  });
  if (error) throw new Error(error.message);
  return { success: true };
}

async function inscription(data) {
  // Utilise le vrai email fourni à l'inscription
  if (!data.email) throw new Error('Email obligatoire');

  const { data: authData, error: authError } = await sb.auth.signUp({
    email: data.email,
    password: data.password,
  });
  if (authError) throw new Error(authError.message);

  const { error: membreError } = await sb.from('membres').insert({
    id: authData.user.id,
    pseudo_telegram: normalizePseudo(data.pseudoTelegram),
    nom: data.nom,
    prenom: data.prenom,
    email: data.email,
    ville: data.ville || null,
    code_postal: data.codePostal || null,
    statut: 'sympathisant',
  });
  if (membreError) throw new Error(membreError.message);
  return { success: true };
}

// Vérifie le code reçu par email à l'inscription (8 chiffres par défaut
// côté Supabase). Remplace
// le lien cliquable historique — voir BUGS.md : les liens de confirmation
// cliquables étaient parfois consommés automatiquement par des scanners
// de sécurité côté destinataire avant que le membre ne clique lui-même,
// via le SMTP custom Brevo (dont le tracking de clics ne peut pas être
// désactivé sur le canal transactionnel). Le template "Confirm signup"
// dans Supabase doit utiliser {{ .Token }} au lieu du lien classique pour
// que ce code soit bien envoyé dans l'email.
// IMPORTANT : type doit être 'email', pas 'signup' — 'signup'/'magiclink'
// sont dépréciés côté verifyOtp pour une vérification par email (la doc
// Supabase et plusieurs guides à jour confirment 'email' comme type
// correct ; 'signup' donnait un message trompeur "Token has expired or
// is invalid" même avec un code tout juste reçu et jamais utilisé).
async function verifierCodeInscription(email, code) {
  const { data, error } = await sb.auth.verifyOtp({
    email,
    token: code,
    type: 'email',
  });
  if (error) throw new Error(error.message || 'Code invalide ou expiré');
  // verifyOtp ouvre une session active, mais le compte reste actif=false
  // tant que Bureau n'a pas validé (workflow inchangé) — on déconnecte
  // donc immédiatement pour forcer un retour à l'écran de login normal,
  // plutôt que de laisser une session "fantôme" en mémoire.
  await sb.auth.signOut();
  return { success: true };
}

// Renvoie un nouveau code (limité par Supabase à une demande
// par 60 secondes par défaut — voir Auth > Providers > Email > rate limits).
async function renvoyerCodeInscription(email) {
  const { error } = await sb.auth.resend({
    type: 'signup',
    email,
  });
  if (error) throw new Error(error.message || 'Impossible de renvoyer le code');
  return { success: true };
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null;
  currentMembre = null;
  return { success: true };
}

async function changePassword(newPassword) {
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw new Error('Erreur changement mot de passe : ' + error.message);
  return { success: true };
}


// ============================================================
// MEMBRES
// ============================================================

async function getMembre(id) {
  const { data, error } = await sb
    .from('membres')
    .select('*, section:sections(nom)')
    .eq('id', id || currentUser?.id)
    .single();
  if (error) return null;
  return data;
}

async function getMembreByTelegram(pseudo) {
  const { data, error } = await sb.from('membres')
    .select('*')
    .ilike('pseudo_telegram', normalizePseudo(pseudo))
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getAllMembres(filters = {}) {
  let query = sb.from('membres')
    .select('*, section:sections(nom)')
    .order('nom');
  if (filters.statut) query = query.eq('statut', filters.statut);
  if (filters.section_id) query = query.eq('section_id', filters.section_id);
  if (filters.actif !== undefined) query = query.eq('actif', filters.actif);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function updateMembre(id, updates) {
  const { data, error } = await sb.from('membres')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateStatutMembre(membreId, statut) {
  return updateMembre(membreId, { statut });
}

async function updateSectionMembre(membreId, sectionId) {
  return updateMembre(membreId, { section_id: sectionId });
}

// ─── Évaluations par cellule (Tifo, Déplacement, Comité) ──────
// Catégories : 'tifo' | 'deplacement' | 'comite_sympa' | 'comite_draft'
// Une ligne = une notation horodatée. La note "courante" d'une
// catégorie pour un membre = la ligne la plus récente.
async function noterMembre(membreId, categorie, note) {
  if (!['tifo', 'comite_sympa', 'comite_draft'].includes(categorie)) {
    throw new Error('Catégorie de notation invalide');
  }
  if (note < 1 || note > 3) throw new Error('Note invalide (1 à 3)');
  const { error } = await sb.from('evaluations').insert({
    membre_id: membreId,
    categorie,
    note,
    notee_par: currentUser.id,
  });
  if (error) throw error;
  return { success: true };
}

// Retourne la note courante par catégorie pour un membre, ex :
// { tifo: 2, deplacement: 1, comite_sympa: null, comite_draft: null }
async function getEvaluationsMembre(membreId) {
  const { data, error } = await sb.from('evaluations')
    .select('categorie, note, created_at')
    .eq('membre_id', membreId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const courantes = {};
  (data || []).forEach(e => {
    if (!(e.categorie in courantes)) courantes[e.categorie] = e.note;
  });
  return courantes;
}

// Version batch de getEvaluationsMembre — une seule requête pour N membres
// (utilisée par les listes d'évaluation Tifo/Comité, pour éviter un N+1
// si on appelait getEvaluationsMembre membre par membre).
// Retourne : { [membreId]: { tifo: 2, comite_sympa: null, ... } }
async function getEvaluationsCourantesBatch(membreIds) {
  if (!membreIds || !membreIds.length) return {};
  const { data, error } = await sb.from('evaluations')
    .select('membre_id, categorie, note, created_at')
    .in('membre_id', membreIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const parMembre = {};
  (data || []).forEach(e => {
    if (!parMembre[e.membre_id]) parMembre[e.membre_id] = {};
    if (!(e.categorie in parMembre[e.membre_id])) parMembre[e.membre_id][e.categorie] = e.note;
  });
  return parMembre;
}

// Compteurs de participation Tifo/Déplacement pour N membres en une
// seule requête par table (utilisé par la page Membres Comité, pour
// donner un contexte objectif d'engagement avant notation) :
// { [membreId]: { tifoPresent, tifoAbsent, deplPaye, deplNonPaye } }
// Tifo : 'present' = présence confirmée, 'absent' = no-show réel —
// 'inscrit' (en attente de traitement) n'est compté dans aucun des deux.
// Déplacement : 'paye_cash'/'paye_ha' = payé, 'en_attente' = non
// payé (assimilé à un no-show, cf. demande explicite Comité de passage).
async function getParticipationBatch(membreIds) {
  if (!membreIds || !membreIds.length) return {};
  const [{ data: sessions, error: e1 }, { data: depls, error: e2 }] = await Promise.all([
    sb.from('inscriptions_session').select('membre_id, statut').in('membre_id', membreIds),
    sb.from('inscriptions_deplacement').select('membre_id, statut_paiement').in('membre_id', membreIds),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const parMembre = {};
  const ensure = (id) => parMembre[id] || (parMembre[id] = { tifoPresent: 0, tifoAbsent: 0, deplPaye: 0, deplNonPaye: 0 });
  (sessions || []).forEach(s => {
    const m = ensure(s.membre_id);
    if (s.statut === 'present') m.tifoPresent++;
    else if (s.statut === 'absent') m.tifoAbsent++;
  });
  (depls || []).forEach(d => {
    const m = ensure(d.membre_id);
    if (d.statut_paiement === 'paye_cash' || d.statut_paiement === 'paye_ha') m.deplPaye++;
    else m.deplNonPaye++;
  });
  return parMembre;
}

// Historique complet d'une catégorie pour un membre (qui a noté, quand)
async function getHistoriqueEvaluation(membreId, categorie) {
  const { data, error } = await sb.from('evaluations')
    .select('*, notateur:membres!evaluations_notee_par_fkey(prenom, nom, pseudo_telegram)')
    .eq('membre_id', membreId)
    .eq('categorie', categorie)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function toggleBlocageMembre(membreId, actif) {
  return updateMembre(membreId, { actif });
}

async function adminResetPassword(membreId, newPassword) {
  // Nécessite une Edge Function Supabase en prod
  return { success: true, message: 'Non implémenté' };
}

async function updateMembreMdp(membreId, newPassword) {
  const { data: membre } = await sb.from('membres')
    .select('email').eq('id', membreId).single();
  if (!membre?.email) throw new Error('Email introuvable pour ce membre');
  // Envoyer un email de reset — seule option sans Edge Function
  const { error } = await sb.auth.resetPasswordForEmail(membre.email);
  if (error) throw error;
  return { success: true };
}

async function supprimerMembre(membreId) {
  // Suppression logique : désactiver + anonymiser les données personnelles
  const { error } = await sb.from('membres')
    .update({
      actif: false,
      email: null,
      pseudo_telegram: 'supprimé_' + membreId.slice(0,8),
      prenom: '[Supprimé]',
      nom: '',
    })
    .eq('id', membreId);
  if (error) throw error;
  return { success: true };
}

// Évaluations : voir noterMembre / getEvaluationsMembre / getHistoriqueEvaluation
// (système par catégorie + historique, cf. table evaluations)

// ============================================================
// QR CODE MEMBRE — présence Déplacement / retrait Matos / retrait Stick
// ============================================================
// Un QR fixe par membre (Profil), distinct du qr_code par-inscription
// Déplacement existant (généré à la confirmation de paiement HelloAsso/
// Cash, cf. validerPaiementCash/validerPaiementHelloAsso plus haut) — les
// deux coexistent, aucune modification de la chaîne HelloAsso ici.

// Génère un token aléatoire au format UL-MBR-{16 car.} — préfixe distinct
// de UL-{...} (Cash) et UL-HA-{...} (HelloAsso) pour qu'un scan puisse
// immédiatement reconnaître un QR membre d'un QR d'inscription si les
// deux types sont un jour scannés dans le même flux par erreur.
function genererTokenQrMembre() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffixe = '';
  for (let i = 0; i < 16; i++) {
    suffixe += chars[Math.floor(Math.random() * chars.length)];
  }
  return `UL-MBR-${suffixe}`;
}

// Retourne le QR code du membre courant, en le générant à la demande
// (lazy) s'il n'existe pas encore — pas de backfill en masse à la
// migration, chaque membre obtient son token au premier chargement de
// son Profil après déploiement.
async function getOrCreateQrCodeMembre() {
  if (currentMembre?.qr_code_membre) return currentMembre.qr_code_membre;

  const token = genererTokenQrMembre();
  const { data, error } = await sb.from('membres')
    .update({ qr_code_membre: token })
    .eq('id', currentUser.id)
    .select('qr_code_membre')
    .single();
  if (error) throw error;
  currentMembre = await getMembre(currentUser.id); // resynchronise le cache local
  return data.qr_code_membre;
}

// Résout un code scanné (ou saisi manuellement) vers la fiche membre
// correspondante. Retourne null si le code ne correspond à aucun membre
// (code invalide, mal recopié, ou QR d'un autre type scanné par erreur).
async function getMembreParQrCode(code) {
  const trimmed = (code || '').trim();
  if (!trimmed) return null;
  const { data, error } = await sb.from('membres')
    .select('*, section:sections(nom)')
    .eq('qr_code_membre', trimmed)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// Confirme la présence physique d'un ou plusieurs participants à un
// déplacement (scan le jour J), distincte du statut de paiement.
//
// ⚠️ Refonte 09/07/2026 (demande Remi) : depuis l'inscription multi-
// personnes, on ne scanne plus le QR du PARTICIPANT lui-même mais celui
// du PAYEUR — un seul scan peut donc concerner plusieurs lignes
// inscriptions_deplacement d'un coup (soi + amis + invités payés
// ensemble). Cette fonction prend directement une liste d'inscriptionIds
// (résolue côté scan.js à partir du payeur_id scanné) plutôt qu'un
// membre_id unique — un invité hors app n'a de toute façon pas de
// membre_id sur lequel chercher.
//
// Par défaut, bloque si le paiement n'est pas confirmé (statut
// 'en_attente' ou 'refuse') — passer force=true pour le cas réel
// "paiement cash collecté sur le quai au dernier moment", décision
// laissée à la personne qui scanne plutôt qu'un blocage strict sans
// recours.
async function confirmerPresencesDeplacement(inscriptionIds, force = false) {
  if (!Array.isArray(inscriptionIds) || !inscriptionIds.length) {
    throw new Error('Aucune personne sélectionnée');
  }
  const { data: inscriptions, error: fetchError } = await sb.from('inscriptions_deplacement')
    .select('id, statut_paiement, present_at')
    .in('id', inscriptionIds);
  if (fetchError) throw fetchError;

  const nonPayees = inscriptions.filter(i => i.statut_paiement !== 'paye_cash' && i.statut_paiement !== 'paye_ha');
  if (nonPayees.length && !force) {
    const err = new Error(`${nonPayees.length} place(s) sélectionnée(s) avec un paiement non confirmé`);
    err.code = 'PAIEMENT_NON_CONFIRME';
    throw err;
  }

  const { error: updateError } = await sb.from('inscriptions_deplacement')
    .update({ present_at: new Date().toISOString() })
    .in('id', inscriptionIds);
  if (updateError) throw updateError;
  return { success: true, nb: inscriptionIds.length };
}

// Régénère le QR d'un membre (perte/partage accidentel) — invalide
// l'ancien token puisqu'il est remplacé, pas de table d'historique des
// tokens révoqués pour cette première version. Réservée Admin/Bureau,
// le contrôle de droit se fait côté UI (cf. admin.js) — cette fonction
// ne revérifie pas elle-même le rôle de l'appelant, comme le reste de
// ce fichier (le RLS Supabase est la vraie barrière de sécurité).
async function regenererQrCodeMembre(membreId) {
  const token = genererTokenQrMembre();
  const { data, error } = await sb.from('membres')
    .update({ qr_code_membre: token })
    .eq('id', membreId)
    .select('qr_code_membre')
    .single();
  if (error) throw error;
  return data.qr_code_membre;
}

// ============================================================
// SECTIONS & CELLULES
// ============================================================

async function getSections() {
  const { data, error } = await sb.from('sections').select('*').eq('actif', true).order('nom');
  if (error) throw error;
  return data || [];
}

// getCellules() / rattacherCellule() ont été supprimées — système parallèle
// basé sur la table membres_cellules, jamais branché à aucun bouton de
// l'UI, qui faisait doublon avec roles_app[] (qui gère nativement le
// multi-cellule : un membre peut avoir plusieurs entrées dans son tableau
// roles_app, chaque hasCellule*() étant un test indépendant — voir
// applyRights() dans app.js). rattacherCellule tentait en plus d'écrire
// membre.statut = 'membre_cellule', une valeur que le reste de l'app ne
// gère jamais (statut ne prend que 'sympathisant'/'draft'/'confirme').

// ============================================================
// CALENDRIER
// ============================================================

async function getCalendar() {
  const today = new Date().toISOString().split('T')[0];
  const { data: matchsData } = await sb.from('matchs')
    .select('*').gte('date', today).order('date').limit(20);
  const { data: evtsData } = await sb.from('evenements')
    .select('*').gte('date', today).order('date').limit(10);
  return { matchs: matchsData || [], evenements: evtsData || [] };
}

async function getEvenements() {
  const { data, error } = await sb.from('evenements').select('*').order('date');
  if (error) throw error;
  return data || [];
}

async function getEvenement(id) {
  const { data, error } = await sb.from('evenements').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// data attendu (cf. doSauvegarderEvenement dans calendrier.js) :
// { nom, type, date, heure, lieu, description, lien_helloasso }
// id fourni → update, id absent → création.
async function saveEvenement(data, id = null) {
  if (id) {
    const { data: updated, error } = await sb.from('evenements')
      .update(data).eq('id', id).select().single();
    if (error) throw error;
    return updated;
  }
  const { data: created, error } = await sb.from('evenements')
    .insert({ ...data, publie_par: currentUser.id }).select().single();
  if (error) throw error;
  return created;
}

async function deleteEvenement(id) {
  const { error } = await sb.from('evenements').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}

async function addMatch(matchData) {
  const { data, error } = await sb.from('matchs').insert(matchData).select().single();
  if (error) throw error;
  return data;
}

// Mise à jour générique d'un match (édition libre de tous les champs),
// distincte de confirmerDateMatch (qui ne touche que date/horaire/stade et
// force statut_date à 'confirmee') et de saisirScoreMatch (scores
// uniquement) — celles-ci restent utilisées pour leurs actions rapides
// dédiées sur la carte calendrier ; updateMatch sert au formulaire
// d'édition complète.
async function updateMatch(id, data) {
  const { data: result, error } = await sb.from('matchs')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return result;
}

async function getMatchs() {
  const { data, error } = await sb.from('matchs').select('*').order('date');
  if (error) throw error;
  return data || [];
}

async function deleteMatch(id) {
  const { error } = await sb.from('matchs').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}

async function saisirScoreMatch(id, scoreDomicile, scoreExterieur) {
  const { data, error } = await sb.from('matchs')
    .update({ score_domicile: scoreDomicile, score_exterieur: scoreExterieur })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// Confirme la date + horaire d'un match (Bureau+). statut_date passe de
// 'a_confirmer' à 'confirmee'. Permet aussi d'ajuster date/horaire/stade
// dans la même action si la LFP les a modifiés au moment de la confirmation
// officielle (TV, sécurité, etc.).
async function confirmerDateMatch(id, { date, horaire, stade } = {}) {
  const update = { statut_date: 'confirmee' };
  if (date) update.date = date;
  if (horaire !== undefined) update.horaire = horaire || null;
  if (stade !== undefined) update.stade = stade || null;
  const { data, error } = await sb.from('matchs')
    .update(update)
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// Repasse un match confirmé en "à confirmer" (erreur de saisie, annonce
// LFP annulée, etc.) — Bureau+.
async function rouvrirConfirmationMatch(id) {
  const { data, error } = await sb.from('matchs')
    .update({ statut_date: 'a_confirmer' })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ============================================================
// CHARTE
// ============================================================

async function getCharteActive() {
  // La validité est vérifiée côté requête (pas seulement côté client) :
  // une charte "active" mais dont la date_fin_validite est dépassée n'est
  // jamais retournée. Robuste même si le flag `active` n'a pas encore été
  // basculé manuellement par un admin au changement de saison.
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await sb.from('chartes')
    .select('*')
    .eq('active', true)
    .or(`date_fin_validite.is.null,date_fin_validite.gte.${today}`)
    .order('date_fin_validite', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Vérifie si le membre courant a signé LA charte active en cours (pas une
// charte antérieure expirée). C'est la seule source de vérité utilisée pour
// bloquer/débloquer l'accès à l'app — ne jamais se fier uniquement au flag
// dénormalisé `membres.charte_signee`, qui ne distingue pas "a signé une
// charte" de "a signé LA charte en cours de validité".
async function checkConformiteCharte() {
  const charteActive = await getCharteActive();
  if (!charteActive) {
    // Pas de charte active configurée → on ne bloque pas (évite un bug
    // de config qui rendrait l'app inutilisable pour tout le monde).
    return { conforme: true, charteActive: null };
  }
  const { data: signature, error } = await sb.from('signatures_charte')
    .select('id, signed_at')
    .eq('membre_id', currentUser.id)
    .eq('charte_id', charteActive.id)
    .maybeSingle();
  if (error) throw error;
  return { conforme: !!signature, charteActive, signature: signature || null };
}

async function signerCharte(charteId) {
  const { error } = await sb.from('signatures_charte').insert({
    membre_id: currentUser.id,
    charte_id: charteId,
  });
  if (error && error.code !== '23505') throw error; // 23505 = duplicate, already signed
  // Mettre à jour le membre (flag dénormalisé, pratique pour l'affichage
  // rapide côté admin/liste, mais jamais utilisé seul pour le blocage —
  // voir checkConformiteCharte()). Uniquement `charte_signee` : c'est la
  // seule colonne confirmée exister dans `membres` (cf. bug du même type
  // que `cree_par`/`updated_at`/`etoiles` — voir BUGS.md). La date exacte
  // de signature est disponible via signatures_charte.signed_at, pas
  // besoin de la dénormaliser en plus sur membres.
  await updateMembre(currentUser.id, {
    charte_signee: true,
  });
  currentMembre = await getMembre(currentUser.id);
  return { success: true };
}

async function getMembresNonSignataires() {
  const charteActive = await getCharteActive();
  if (!charteActive) return [];
  const { data: signataires } = await sb.from('signatures_charte')
    .select('membre_id').eq('charte_id', charteActive.id);
  const sigIds = (signataires || []).map(s => s.membre_id);
  const { data, error } = await sb.from('membres').select('*').not('id', 'in', `(${sigIds.join(',')})`);
  if (error) throw error;
  return data || [];
}

// Publie une nouvelle version de la charte (édition de contenu par le
// Bureau/Admin). Ne modifie JAMAIS la ligne existante en place : crée
// une nouvelle ligne `chartes` active et désactive l'ancienne. C'est
// ce qui garantit, sans aucune logique supplémentaire, que toutes les
// signatures existantes deviennent automatiquement invalides — voir
// checkConformiteCharte() qui compare l'id de la charte signée à l'id
// de la charte active courante. Chaque membre devra donc resigner.
//
// Pas de vraie transaction multi-statements disponible côté client
// PostgREST : on désactive d'abord l'ancienne, puis on insère la
// nouvelle. Si l'insertion échoue après la désactivation, on retente
// de réactiver l'ancienne pour ne pas laisser l'app sans charte active
// (le pire des deux scénarios : tout le monde bloqué sans recours).
async function publierNouvelleCharte({ nom, contenu, dateFin }) {
  const ancienne = await getCharteActive();

  if (ancienne) {
    const { error: errDesactivation } = await sb.from('chartes')
      .update({ active: false }).eq('id', ancienne.id);
    if (errDesactivation) throw errDesactivation;
  }

  const { data, error } = await sb.from('chartes').insert({
    nom,
    contenu,
    active: true,
    date_fin_validite: dateFin,
  }).select().single();

  if (error) {
    // Rollback manuel : on réactive l'ancienne pour éviter un état où
    // personne n'a de charte active à signer.
    if (ancienne) {
      await sb.from('chartes').update({ active: true }).eq('id', ancienne.id);
    }
    throw error;
  }
  return data;
}

// ============================================================
// SESSIONS TIFO
// ============================================================

async function getUpcomingSessions() {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await sb.from('sessions_tifo')
    .select('*, inscriptions_session(statut)')
    .gte('date', today)
    .in('statut', ['a_venir', 'en_cours'])
    .order('date');
  if (error) throw error;
  return (data || []).map(s => ({
    ...s,
    _nb_inscrits: s.inscriptions_session?.length || 0,
  }));
}

async function getPastSessions() {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await sb.from('sessions_tifo')
    .select('*, inscriptions_session(statut)')
    .lt('date', today)
    .order('date', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data || []).map(s => ({
    ...s,
    _nb_inscrits: s.inscriptions_session?.length || 0,
  }));
}

async function getSessionDetails(sessionId) {
  const { data, error } = await sb.from('sessions_tifo')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (error) throw error;
  const { data: inscrits, error: inscritsError } = await sb.from('inscriptions_session')
    .select('*, membre:membres(nom, prenom, pseudo_telegram, statut, section:sections(nom))')
    .eq('session_id', sessionId);
  if (inscritsError) throw inscritsError;
  const monInscrit = (inscrits || []).find(i => i.membre_id === currentUser?.id);
  return { session: data, inscrits: inscrits || [], monInscrit };
}

async function inscrire(sessionId) {
  const { error } = await sb.from('inscriptions_session').insert({
    session_id: sessionId,
    membre_id: currentUser.id,
    statut: 'inscrit',
  });
  if (error && error.code === '23505') throw new Error('Déjà inscrit');
  if (error) throw error;
  return { success: true };
}

async function desinscrire(sessionId) {
  const { error } = await sb.from('inscriptions_session')
    .delete()
    .eq('session_id', sessionId)
    .eq('membre_id', currentUser.id);
  if (error) throw error;
  return { success: true };
}

// Action admin (Cellule Tifo+) : désinscrit un autre membre que soi-même
// — cf. doDesinscrireAdmin dans tifos.js, bouton "✕" sur la liste des
// inscrits. Même requête que desinscrire(), avec membreId explicite au
// lieu de currentUser.id.
async function desinscrireMembreSession(sessionId, membreId) {
  const { error } = await sb.from('inscriptions_session')
    .delete()
    .eq('session_id', sessionId)
    .eq('membre_id', membreId);
  if (error) throw error;
  return { success: true };
}

async function validerPresence(sessionId, code, pizza = null, pinte = null) {
  const { data: session } = await sb.from('sessions_tifo')
    .select('code_validation').eq('id', sessionId).single();
  if (!session || session.code_validation !== code) throw new Error('Code incorrect');
  const { error } = await sb.from('inscriptions_session')
    .update({ statut: 'present', pizza, pinte })
    .eq('session_id', sessionId)
    .eq('membre_id', currentUser.id);
  if (error) throw error;
  return { success: true };
}

async function savePizzaChoice(sessionId, pizza) {
  const { error } = await sb.from('inscriptions_session')
    .update({ pizza })
    .eq('session_id', sessionId)
    .eq('membre_id', currentUser.id);
  if (error) throw error;
  return { success: true };
}

async function createSession(sessionData) {
  const { data, error } = await sb.from('sessions_tifo').insert({
    ...sessionData,
  }).select().single();
  if (error) throw error;
  return data;
}

async function openSession(sessionId) {
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const { data, error } = await sb.from('sessions_tifo')
    .update({ statut: 'en_cours', code_validation: code })
    .eq('id', sessionId).select().single();
  if (error) throw error;
  return { session: data, code };
}

async function closeSession(sessionId) {
  // Marquer les inscrits non présents comme absents
  await sb.from('inscriptions_session')
    .update({ statut: 'absent' })
    .eq('session_id', sessionId)
    .eq('statut', 'inscrit');
  const { data, error } = await sb.from('sessions_tifo')
    .update({ statut: 'terminee', code_validation: null })
    .eq('id', sessionId).select().single();
  if (error) throw error;
  return data;
}

async function deleteSession(sessionId) {
  // Supprime d'abord les inscriptions liées (indépendant d'une éventuelle
  // cascade FK non configurée côté base — évite une erreur de contrainte
  // 23503 si des membres sont/étaient inscrits).
  const { error: errInscriptions } = await sb.from('inscriptions_session')
    .delete()
    .eq('session_id', sessionId);
  if (errInscriptions) throw errInscriptions;

  const { error } = await sb.from('sessions_tifo').delete().eq('id', sessionId);
  if (error) throw error;
  return { success: true };
}

async function updateSession(sessionId, updates) {
  const { data, error } = await sb.from('sessions_tifo')
    .update(updates).eq('id', sessionId).select().single();
  if (error) throw error;
  return data;
}

async function getSessionsWithStats() {
  const { data, error } = await sb.from('sessions_tifo')
    .select('*, inscriptions_session(statut)')
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(s => ({
    ...s,
    nb_inscrits: s.inscriptions_session?.length || 0,
    nb_presents: s.inscriptions_session?.filter(i => i.statut === 'present').length || 0,
  }));
}

async function updateInscriptionStatut(sessionId, membreId, statut) {
  const { error } = await sb.from('inscriptions_session')
    .update({ statut })
    .eq('session_id', sessionId)
    .eq('membre_id', membreId);
  if (error) throw error;
  return { success: true };
}

async function getPizzaOrders(sessionId) {
  const { data, error } = await sb.from('inscriptions_session')
    .select('pizza, membre:membres(nom, prenom)')
    .eq('session_id', sessionId)
    .neq('pizza', 'non');
  if (error) throw error;
  return data || [];
}

// ============================================================
// DÉPLACEMENTS
// ============================================================

// ⚠️ Avant le 24/06/2026, cette fonction ne renvoyait que les lignes brutes
// de `deplacements` — ni _inscrits (nombre réel d'inscrits) ni monInscrit
// (statut du membre courant) n'étaient calculés ici, alors que
// renderDeplCard() dans deplacements.js lit déjà d._inscrits depuis
// toujours pour la barre de progression des places (bug latent : la barre
// affichait systématiquement 0/places_max, jamais le vrai nombre). Les deux
// champs sont désormais calculés pour chaque déplacement de la liste, ce
// qui permet aussi d'afficher sur la carte le bon bouton (M'inscrire /
// paiement en cours / payé / refusé) sans devoir ouvrir la modal de détail.
async function getDeplacements(upcoming = true) {
  const today = new Date().toISOString().split('T')[0];
  let query = sb.from('deplacements')
    .select('*, match:matchs(*)')
    .order('date_match');
  if (upcoming) query = query.gte('date_match', today);
  const { data, error } = await query;
  if (error) throw error;
  const depls = data || [];
  if (!depls.length) return depls;

  const { data: inscriptions } = await sb.from('inscriptions_deplacement')
    .select('*')
    .in('deplacement_id', depls.map(d => d.id));

  return depls.map(d => {
    const inscritsDuDepl = (inscriptions || []).filter(i => i.deplacement_id === d.id);
    return {
      ...d,
      _inscrits: inscritsDuDepl.length,
      monInscrit: inscritsDuDepl.find(i => i.membre_id === currentUser?.id) || null,
    };
  });
}

// ⚠️ Bug corrigé le 24/06/2026 (PGRST201) : depuis l'ajout de la colonne
// valide_par (qui référence elle aussi membres(id)), inscriptions_deplacement
// a DEUX clés étrangères vers membres (membre_id et valide_par). PostgREST
// ne peut plus deviner laquelle utiliser pour l'embed implicite
// membre:membres(...) et renvoie une erreur PGRST201 (relation ambiguë),
// silencieusement absorbée ici par `inscrits || []` — résultat : data
// devenait null, masqué comme un simple "aucun inscrit". La syntaxe
// membres!inscriptions_deplacement_membre_id_fkey(...) précise explicitement
// quelle FK suivre (celle du membre inscrit, pas celle du validateur).
// Statut d'une seule inscription déplacement, par id — utilisé
// uniquement par la pop-up de confirmation au retour de HelloAsso (08/07/
// 2026), pas besoin de la liste complète pour ce cas précis.
async function getStatutInscriptionDepl(id) {
  const { data, error } = await sb.from('inscriptions_deplacement')
    .select('statut_paiement, deplacement:deplacements(adversaire)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function getDeplacement(id) {
  const { data, error } = await sb.from('deplacements')
    .select('*, match:matchs(*)')
    .eq('id', id).single();
  if (error) throw error;
  const { data: inscrits, error: inscritsError } = await sb.from('inscriptions_deplacement')
    .select(`
      *,
      membre:membres!inscriptions_deplacement_membre_id_fkey(nom, prenom, pseudo_telegram),
      payeur:membres!inscriptions_deplacement_payeur_id_fkey(nom, prenom, pseudo_telegram)
    `)
    .eq('deplacement_id', id);
  if (inscritsError) console.error('[UL] getDeplacement — erreur chargement inscrits:', inscritsError.message);
  const monInscrit = (inscrits || []).find(i => i.membre_id === currentUser?.id);
  const nbInscrits = (inscrits || []).length;
  return { deplacement: data, inscrits: inscrits || [], monInscrit, nbInscrits };
}

// Quota par PAYEUR (pas par participant) — un membre peut avoir réservé
// plusieurs places sur plusieurs commandes séparées pour le même
// déplacement (lui + des amis à des moments différents) ; le total
// compte toutes les lignes où il est payeur_id, pas seulement membre_id
// (cf. migration_deplacements_avance.sql — mirroir du quota Sticks/Matos,
// getMonQuotaStick).
async function getMonQuotaDepl(deplacementId) {
  const { data: d } = await sb.from('deplacements')
    .select('quota_par_membre').eq('id', deplacementId).single();
  if (!d?.quota_par_membre) return null; // pas de quota configuré
  const { data: mesInscriptions } = await sb.from('inscriptions_deplacement')
    .select('id')
    .eq('deplacement_id', deplacementId)
    .eq('payeur_id', currentUser.id);
  const utilise = (mesInscriptions || []).length;
  return { quota: d.quota_par_membre, utilise, restant: d.quota_par_membre - utilise };
}

// ⚠️ Remplacée le 09/07/2026 (demande Remi) : renvoyait auparavant TOUS
// les membres actifs, ce qui exposait la liste complète des membres à
// n'importe qui (et pas seulement leur pseudo). Ne renvoie désormais que
// les amitiés CONFIRMÉES du membre connecté — cf. getMesAmis() ci-dessous.
async function getMembresPourAmisDepl() {
  return await getMesAmis();
}

// ============================================================
// AMITIÉS ("Mes amis") — demande Remi 09/07/2026
// ============================================================
// Deux FK vers membres sur la même table (demandeur_id, destinataire_id)
// — comme documenté en tête de ce fichier pour inscriptions_deplacement,
// contrainte explicite nécessaire dès le premier embed pour éviter une
// erreur PGRST201 (relation ambiguë).

// Amis confirmés (statut 'acceptee') — renvoie toujours "l'autre
// personne" de la relation, peu importe qui avait envoyé la demande à
// qui à l'origine.
async function getMesAmis() {
  const { data, error } = await sb.from('amities')
    .select(`
      id, demandeur_id, destinataire_id,
      demandeur:membres!amities_demandeur_id_fkey(id, nom, prenom, pseudo_telegram),
      destinataire:membres!amities_destinataire_id_fkey(id, nom, prenom, pseudo_telegram)
    `)
    .eq('statut', 'acceptee')
    .or(`demandeur_id.eq.${currentUser.id},destinataire_id.eq.${currentUser.id}`);
  if (error) throw error;
  return (data || []).map(r => r.demandeur_id === currentUser.id ? r.destinataire : r.demandeur).filter(Boolean);
}

async function getDemandesAmitieRecues() {
  const { data, error } = await sb.from('amities')
    .select('id, created_at, demandeur:membres!amities_demandeur_id_fkey(id, nom, prenom, pseudo_telegram)')
    .eq('destinataire_id', currentUser.id)
    .eq('statut', 'en_attente')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getDemandesAmitieEnvoyees() {
  const { data, error } = await sb.from('amities')
    .select('id, created_at, destinataire:membres!amities_destinataire_id_fkey(id, nom, prenom, pseudo_telegram)')
    .eq('demandeur_id', currentUser.id)
    .eq('statut', 'en_attente')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function repondreDemandeAmitie(amitieId, accepter) {
  const { error } = await sb.from('amities')
    .update({ statut: accepter ? 'acceptee' : 'refusee', repondu_at: new Date().toISOString() })
    .eq('id', amitieId);
  if (error) throw error;
  return { success: true };
}

async function annulerDemandeAmitie(amitieId) {
  const { error } = await sb.from('amities').delete().eq('id', amitieId);
  if (error) throw error;
  return { success: true };
}

async function envoyerDemandeAmitie(destinataireId) {
  const { data, error } = await sb.rpc('envoyer_demande_amitie', { p_destinataire_id: destinataireId });
  if (error) throw error;
  return data;
}

// Recherche par PSEUDO uniquement (jamais par nom/prénom dans la requête
// elle-même) — chercher quelqu'un par son nom irait à l'encontre de la
// confidentialité demandée. nom/prenom sont quand même renvoyés dans le
// résultat : c'est l'affichage (nomAfficheMembre, app.js) qui décide de
// les montrer ou non selon que le membre connecté est Bureau/Admin.
async function rechercherMembrePourAmi(recherche) {
  const { data, error } = await sb.from('membres')
    .select('id, pseudo_telegram, nom, prenom')
    .eq('actif', true)
    .neq('id', currentUser.id)
    .ilike('pseudo_telegram', `%${(recherche||'').trim()}%`)
    .limit(20);
  if (error) throw error;
  return data || [];
}

// Relance de paiement pour une inscription DÉJÀ existante (refusée ou en
// attente) — forme d'appel strictement identique à l'ancien comportement
// (avant l'ajout des amis/invités), pour continuer à fonctionner sans
// attendre la moindre évolution de l'Edge Function côté serveur.
async function relancerPaiementDeplacement(deplacementId) {
  const { data, error } = await sb.functions.invoke('helloasso-create-checkout', {
    body: { deplacementId },
  });
  if (error) throw new Error(error.message || 'Impossible de lancer le paiement');
  if (data?.error) throw new Error(data.error);
  if (!data?.redirectUrl) throw new Error('Réponse de paiement invalide');
  return data;
}

// ⚠️ Nécessite une évolution de l'Edge Function helloasso-create-checkout
// (non incluse ici — son code source n'a pas été fourni dans cette
// session). Jusqu'ici elle prenait { deplacementId } et créait UNE ligne
// inscriptions_deplacement pour currentUser, pour un montant = prix_total.
// Contrat attendu désormais, uniquement pour une TOUTE NOUVELLE
// inscription (jamais pour relancer un paiement existant — cf.
// relancerPaiementDeplacement ci-dessus, qui reste inchangée) : appel
// avec { deplacementId, participants }, où participants est un tableau :
//   { type: 'moi' }
//   { type: 'ami', membreId: '...' }
//   { type: 'invite', nom: '...', prenom: '...', email: '...' }
// → côté serveur, créer UNE ligne inscriptions_deplacement par
// participant (membre_id renseigné pour 'moi'/'ami', invite_* pour
// 'invite'), toutes avec payeur_id = currentUser.id, et un montant
// HelloAsso total = prix_total × participants.length. Le reste du flux
// (webhook, statuts paye_ha/refuse/rembourse) ne change pas de logique,
// juste appliqué à plusieurs lignes au lieu d'une avec la même référence
// de paiement.
async function demanderInscriptionDeplacementHelloAsso(deplacementId, participants) {
  const { data, error } = await sb.functions.invoke('helloasso-create-checkout', {
    body: { deplacementId, participants },
  });
  if (error) throw new Error(error.message || 'Impossible de lancer le paiement');
  if (data?.error) throw new Error(data.error);
  if (!data?.redirectUrl) throw new Error('Réponse de paiement invalide');
  return data;
}

// ⚠️ Changé le 09/07/2026 (demande Remi, multi-personnes) : prenait avant
// (deplacementId, membreId) — ne fonctionne plus pour un invité hors app
// (pas de membre_id). Identifie directement la ligne par inscriptionId.
async function validerPaiementCash(inscriptionId) {
  const { data: inscription, error: fetchError } = await sb.from('inscriptions_deplacement')
    .select('id, membre_id').eq('id', inscriptionId).single();
  if (fetchError) throw fetchError;
  const qrCode = `UL-${Date.now()}-${inscriptionId.slice(0,6).toUpperCase()}`;
  const { error } = await sb.from('inscriptions_deplacement')
    .update({
      statut_paiement: 'paye_cash',
      valide_par: currentUser.id,
      valide_at: new Date().toISOString(),
      qr_code: qrCode,
    })
    .eq('id', inscriptionId);
  if (error) throw error;
  // Pas d'évaluation à recalculer pour un invité hors app (pas de compte).
  if (inscription.membre_id) recalculerEvaluationDeplacement(inscription.membre_id);
  return { success: true, qrCode };
}

async function validerPaiementHelloAsso(deplacementId, membreId) {
  // ⚠️ Avant le 21/06/2026 cette fonction écrivait 'paye_helloasso', valeur
  // qui n'a JAMAIS existé dans la contrainte CHECK réelle de la table
  // (seule 'paye_ha' est autorisée) — tout appel à cette fonction aurait dû
  // échouer avec une violation de contrainte. Corrigé en même temps que
  // l'intégration HelloAsso Checkout (cf. TODO_HELLOASSO.md).
  const qrCode = `UL-HA-${Date.now()}-${membreId.slice(0,6).toUpperCase()}`;
  const { error } = await sb.from('inscriptions_deplacement')
    .update({
      statut_paiement: 'paye_ha',
      valide_par: currentUser.id,
      valide_at: new Date().toISOString(),
      qr_code: qrCode,
    })
    .eq('deplacement_id', deplacementId)
    .eq('membre_id', membreId);
  if (error) throw error;
  recalculerEvaluationDeplacement(membreId); // best-effort, ne bloque pas la validation
  return { success: true, qrCode };
}

// Appelle l'Edge Function qui recalcule la note "déplacement" (service_role, bypass RLS).
// Volontairement non bloquant : un échec ici ne doit jamais empêcher la validation du paiement.
async function recalculerEvaluationDeplacement(membreId) {
  try {
    const resp = await sb.functions.invoke('update-evaluation-deplacement', {
      body: { membreId },
    });
    if (resp.error) console.error('[UL] recalcul évaluation déplacement échoué:', resp.error.message);
  } catch (e) {
    console.error('[UL] recalcul évaluation déplacement échoué:', e.message);
  }
}

async function createDeplacement(data) {
  const { data: result, error } = await sb.from('deplacements').insert({
    ...data,
    cree_par: currentUser.id,
  }).select().single();
  if (error) throw error;
  return result;
}

async function updateDeplacement(id, data) {
  const { data: result, error } = await sb.from('deplacements')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return result;
}

async function getListeBusTelegram(deplacementId) {
  const { inscrits, deplacement } = await getDeplacement(deplacementId);
  const payes = inscrits.filter(i => i.statut_paiement !== 'en_attente');
  const lines = [
    `🚌 *LISTE BUS — ${deplacement.adversaire}*`,
    `📅 ${deplacement.date_match} — ${deplacement.heure_depart || ''}`,
    `📍 RDV: ${deplacement.point_rdv || ''}`,
    ``,
    `✅ *PAYÉS (${payes.length}/${deplacement.places_max})*`,
    ...payes.map((i, n) => `${n+1}. @${i.membre.pseudo_telegram} — ${i.statut_paiement === 'paye_cash' ? 'Cash' : 'HelloAsso'}`),
    ``,
    `⏳ En attente: ${inscrits.length - payes.length}`,
  ];
  return lines.join('\n');
}

// ============================================================
// MATOS / STICKS / COTISATIONS
// ============================================================
// Les implémentations vivent dans les sections "BOUTIQUE — MATOS",
// "BOUTIQUE — STICKS" et "BOUTIQUE — COTISATIONS" plus bas dans ce
// fichier. Une première génération de fonctions (passerCommande(items),
// getMesCommandes, getSticksCatalogue, distribuerStick, getMaCotisation,
// validerCotisation) vivait ici : dupliquée, avec un bug de détection
// Admin/Bureau, et jamais appelée par aucun module depuis le split en
// app.js/tifos.js/deplacements.js/boutique.js/calendrier.js/admin.js/
// profil.js. Supprimée pour ne garder qu'une seule implémentation par
// fonction — les versions corrigées ci-dessous.

// ============================================================
// ANNONCES
// ============================================================

async function getAnnonces() {
  // Ne passe plus par un embed PostgREST membres(...) — deviner le nom de
  // la contrainte FK (annonces_publie_par_fkey) s'est révélé faux : la
  // vraie erreur ("Impossible de charger les annonces") vient du fait que
  // cette table a un schéma différent de ce que le code supposait (cf.
  // aussi cellule_id ci-dessous, colonne qui n'existe pas du tout). Pour
  // ne plus dépendre de suppositions sur le schéma exact, on sépare en
  // deux requêtes simples : les annonces telles quelles, puis les noms
  // des auteurs récupérés à part et recollés en JS.
  const { data, error } = await sb.from('annonces')
    .select('*')
    .eq('actif', true)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  if (!data || !data.length) return data || [];

  const auteurIds = [...new Set(data.map(a => a.publie_par).filter(Boolean))];
  if (auteurIds.length) {
    const { data: auteurs } = await sb.from('membres').select('id, nom, prenom').in('id', auteurIds);
    const parId = {};
    (auteurs || []).forEach(m => { parId[m.id] = m; });
    data.forEach(a => { a.publie_par = parId[a.publie_par] || null; });
  }
  return data;
}

async function publierAnnonce(titre, contenu, categorie = 'info') {
  // cellule_id retiré (09/07/2026) : cette colonne n'existe pas dans la
  // vraie table annonces ("Could not find the 'cellule_id' column of
  // 'annonces' in the schema cache") — le paramètre n'était de toute
  // façon jamais renseigné par l'UI (doPublierAnnonce ne l'appelait
  // jamais avec une valeur), donc rien perdu à le retirer.
  const { error } = await sb.from('annonces').insert({
    titre, contenu, categorie,
    publie_par: currentUser.id,
  });
  if (error) throw error;
  return { success: true };
}

// ============================================================
// CODES DE RÉABONNEMENT (Cartage 26-27, page "Mon (ré)abonnement")
// ============================================================
// Passe par des fonctions Postgres security definer (cf. migration_
// reabonnement_page.sql) plutôt que par une requête directe sur la table
// codes_reabonnement : cette table contient les emails/noms de TOUS les
// payeurs, jamais consultable en direct par un membre.

// Retrouve le(s) code(s) de réabonnement associé(s) à l'email du membre
// connecté — remplace la saisie manuelle : l'app affiche directement le
// code au lieu de demander au membre de le retaper (cf. migration_
// reabonnement_page.sql, retour Remi 09/07/2026 "je ne vois pas les
// codes").
async function getMesCodesReabonnement() {
  const { data, error } = await sb.rpc('get_mes_codes_reabonnement');
  if (error) throw error;
  return data || [];
}

// Statut global (Bureau/Admin peut masquer la page "Mon (ré)abonnement"
// en dehors de la période de campagne) — lecture publique, table à une
// seule ligne (parametres_reabonnement).
async function getStatutReabonnement() {
  const { data, error } = await sb.from('parametres_reabonnement').select('ouvert').eq('id', 1).single();
  if (error) throw error;
  return !!(data && data.ouvert);
}

async function setReabonnementOuvert(ouvert) {
  const { data, error } = await sb.rpc('set_reabonnement_ouvert', { p_ouvert: !!ouvert });
  if (error) throw error;
  return data;
}

// Recherche Bureau/Admin d'un code (par nom/prénom/email/code) — pour
// vérifier qu'une personne a bien un code sans attendre qu'elle se
// connecte elle-même sur "Mon (ré)abonnement". Le rôle est vérifié côté
// serveur (cf. migration_admin_recherche_code.sql) : un membre non
// Bureau/Admin obtient toujours un tableau vide.
async function rechercherCodeReabonnementAdmin(recherche) {
  const { data, error } = await sb.rpc('admin_rechercher_code_reabonnement', { p_recherche: (recherche||'').trim() });
  if (error) throw error;
  return data || [];
}

// Toute la table en un appel (Bureau/Admin/Comité) — pour affichage
// direct du code sur chaque carte membre (page Comité de passage) au
// lieu d'une recherche au cas par cas, cf. migration_liste_codes_
// reabonnement.sql (retour Remi 09/07/2026, "il faudrait surtout avoir
// le code ici").
async function listerCodesReabonnementAdmin() {
  const { data, error } = await sb.rpc('admin_lister_codes_reabonnement');
  if (error) throw error;
  return data || [];
}

// ============================================================
// CONNEXION EN TANT QUE (Admin uniquement)
// ============================================================
// Passe par l'Edge Function admin-generer-lien-connexion (service_role,
// seule habilitée à générer un vrai lien de connexion pour n'importe quel
// compte) — jamais de service_role côté client. Le rôle admin_app est
// revérifié côté serveur, indépendamment de ce que montre l'UI.
async function genererLienConnexionAdmin(membreId) {
  const { data, error } = await sb.functions.invoke('admin-generer-lien-connexion', {
    body: { membreId },
  });
  if (error) throw new Error(error.message || 'Impossible de générer le lien');
  if (data?.error) throw new Error(data.error);
  if (!data?.lien) throw new Error('Réponse invalide du serveur');
  return data; // { success, lien, cible: { prenom, nom, email } }
}

// ============================================================
// STATS
// ============================================================

async function getStats() {
  const [membres, sessions, deplacements] = await Promise.all([
    sb.from('membres').select('statut, section_id', { count: 'exact' }),
    sb.from('sessions_tifo').select('id', { count: 'exact' }),
    sb.from('deplacements').select('id', { count: 'exact' }),
  ]);
  return {
    totalMembres: membres.count || 0,
    totalSessions: sessions.count || 0,
    totalDeplacements: deplacements.count || 0,
    repartitionStatuts: (membres.data || []).reduce((acc, m) => {
      acc[m.statut] = (acc[m.statut] || 0) + 1;
      return acc;
    }, {}),
  };
}

async function getMesStats() {
  const [inscriptions, presences, depls] = await Promise.all([
    sb.from('inscriptions_session').select('statut').eq('membre_id', currentUser.id),
    sb.from('inscriptions_session').select('id').eq('membre_id', currentUser.id).eq('statut','present'),
    sb.from('inscriptions_deplacement').select('statut_paiement').eq('membre_id', currentUser.id),
  ]);
  const totalInscrits = inscriptions.data?.length || 0;
  const totalPresents = presences.data?.length || 0;
  return {
    sessionsInscrites: totalInscrits,
    sessionsPresent: totalPresents,
    tauxPresence: totalInscrits > 0 ? Math.round((totalPresents / totalInscrits) * 100) : 0,
    deplacements: depls.data?.length || 0,
  };
}

// ============================================================
// BOUTIQUE — MATOS
// ============================================================

async function getProduits() {
  const membre = currentMembre;
  if (!membre) return [];
  const statut = membre.statut;
  const sectionId = membre.section_id;
  // Admin/Bureau/Membre Cellule sont identifiés via roles_app[] (isAdmin/
  // isBureau/isCellule, définis dans app.js), PAS via membre.statut — qui
  // ne contient que 'sympathisant'/'draft'/'confirme'. L'ancienne version
  // comparait statut à 'admin'/'bureau'/'membre_cellule', des valeurs que
  // ce champ ne prend jamais : un Admin/Bureau n'ayant que son rôle dans
  // roles_app (cas normal) tombait alors dans la branche restreinte.
  const isAdminBureauCellule = isAdmin(membre) || isBureau(membre) || isCellule(membre);
  const { data, error } = await sb.from('produits')
    .select('*, section:sections(id, nom)')
    .eq('statut', 'disponible')
    .order('nom');
  if (error) throw error;
  // ⚠️ Modèle changé (07/07/2026, demande Remi) : Matos utilise désormais
  // la même typologie à 3 niveaux que Sticks (tous/draft_confirme/confirme,
  // tous deux restreints à la section de l'article) au lieu de l'ancien
  // modèle à 2 niveaux (tous/section, où "section" restait visible à TOUS
  // les Confirmés quelle que soit leur section — incohérent avec Sticks).
  return (data || []).filter(p => {
    if (isAdminBureauCellule) return true;
    if (p.niveau_acces === 'tous') return true;
    const memeSection = sectionId && p.section_id === sectionId;
    if (p.niveau_acces === 'draft_confirme') {
      return memeSection && (statut === 'draft' || statut === 'confirme');
    }
    if (p.niveau_acces === 'confirme') {
      return memeSection && statut === 'confirme';
    }
    return false;
  });
}

async function getProduitById(id) {
  const { data, error } = await sb.from('produits')
    .select('*, section:sections(id, nom)')
    .eq('id', id).single();
  if (error) throw error;
  return data;
}

async function createProduit(produit) {
  const { data, error } = await sb.from('produits')
    .insert(produit).select().single();
  if (error) throw error;
  return data;
}

async function updateProduit(id, updates) {
  const { data, error } = await sb.from('produits')
    .update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function archiverProduit(id) {
  return updateProduit(id, { statut: 'archive' });
}

// Commande CASH uniquement — le paiement HelloAsso passe désormais par
// l'Edge Function helloasso-create-checkout (cf. demanderCommandeHelloAsso
// ci-dessous), qui crée elle-même la commande côté serveur. Cash n'est
// autorisé que pour un article en mode 'stock' (règle actée le 05/07/2026 —
// pour un article en précommande, il faut une preuve de paiement en amont
// de la réception, donc HelloAsso obligatoire).
async function passerCommande(produitId, taille, quantite = 1) {
  const produit = await getProduitById(produitId);
  if (!produit) throw new Error('Article introuvable');
  if (produit.mode === 'precommande') {
    throw new Error('Le paiement Cash n\'est pas disponible pour une précommande — utilise HelloAsso');
  }
  if (produit.quota_par_membre) {
    const { data: dejaCommande } = await sb.from('commandes')
      .select('commande_items(quantite)')
      .eq('membre_id', currentUser.id)
      .in('statut', ['en_attente', 'disponible', 'precommande_validee', 'distribue']);
    const totalDeja = (dejaCommande || [])
      .flatMap(c => c.commande_items || [])
      .reduce((sum, i) => sum + (i.quantite || 0), 0);
    if (totalDeja + quantite > produit.quota_par_membre) {
      throw new Error(`Quota dépassé — max ${produit.quota_par_membre} par membre`);
    }
  }
  const { data: commande, error } = await sb.from('commandes').insert({
    membre_id: currentUser.id,
    total: produit.prix * quantite,
    statut: 'en_attente',
    mode_paiement: 'cash',
  }).select().single();
  if (error) throw error;
  // ⚠️ BUG CORRIGÉ (07/07/2026) : cet insert n'était jamais vérifié —
  // cause réelle trouvée le 07/07/2026 : la colonne prix_unitaire
  // n'existait pas sur commande_items (cf.
  // migration_commande_items_prix_unitaire.sql), donc l'insert échouait
  // en silence à chaque fois depuis l'introduction du mode HelloAsso pour
  // Matos — la commande partait quand même sans aucune ligne d'article.
  // Corrigé pour vérifier l'erreur et annuler proprement la commande si
  // l'insertion des lignes échoue.
  const { error: itemError } = await sb.from('commande_items').insert({
    commande_id: commande.id,
    produit_id: produitId,
    quantite,
    taille: taille || null,
    prix_unitaire: produit.prix,
  });
  if (itemError) {
    await sb.from('commandes').delete().eq('id', commande.id);
    throw itemError;
  }
  return commande;
}

// Achat Cash enregistré par un admin AU NOM d'un membre (nouveau, 05/07/2026
// — bouton "💵 Cash" de la page Admin "Gérer la boutique matos"), même
// principe que distribuerStickAdmin pour les Sticks : le paiement étant
// déjà encaissé sur-le-champ par l'admin, la commande part directement en
// 'disponible' (pas de 'en_attente') — reste à confirmer le retrait par
// scan QR (cf. scan.js, contexte 'matos') ou par le bouton manuel de
// filet de secours. Cash réservé aux articles en mode 'stock' (même règle
// que passerCommande).
async function distribuerProduitAdmin(produitId, membreId, taille, quantite = 1) {
  const produit = await getProduitById(produitId);
  if (!produit) throw new Error('Article introuvable');
  if (produit.mode === 'precommande') {
    throw new Error('Le paiement Cash n\'est pas disponible pour une précommande — utilise HelloAsso');
  }
  if (produit.quota_par_membre) {
    const { data: dejaCommande } = await sb.from('commandes')
      .select('commande_items(quantite)')
      .eq('membre_id', membreId)
      .in('statut', ['en_attente', 'disponible', 'precommande_validee', 'distribue']);
    const totalDeja = (dejaCommande || [])
      .flatMap(c => c.commande_items || [])
      .reduce((sum, i) => sum + (i.quantite || 0), 0);
    if (totalDeja + quantite > produit.quota_par_membre) {
      throw new Error(`Quota dépassé pour ce membre (max ${produit.quota_par_membre})`);
    }
  }
  const { data: commande, error } = await sb.from('commandes').insert({
    membre_id: membreId,
    total: produit.prix * quantite,
    statut: 'disponible',
    mode_paiement: 'cash',
  }).select().single();
  if (error) throw error;
  // ⚠️ BUG CORRIGÉ (07/07/2026) — même correctif que passerCommande
  // ci-dessus : vérification d'erreur + annulation de la commande si
  // l'insertion des lignes échoue.
  const { error: itemError } = await sb.from('commande_items').insert({
    commande_id: commande.id,
    produit_id: produitId,
    quantite,
    taille: taille || null,
    prix_unitaire: produit.prix,
  });
  if (itemError) {
    await sb.from('commandes').delete().eq('id', commande.id);
    throw itemError;
  }
  return commande;
}
// Commande HelloAsso — délègue entièrement à l'Edge Function (elle crée
// la commande + commande_item côté serveur, contrairement à passerCommande
// qui le fait ici). Retourne { redirectUrl } pour que le front redirige.
async function demanderCommandeHelloAsso(produitId, taille, quantite = 1) {
  const { data, error } = await sb.functions.invoke('helloasso-create-checkout', {
    body: { produitId, taille, quantite },
  });
  if (error) throw new Error(error.message || 'Impossible de lancer le paiement');
  if (data?.error) throw new Error(data.error);
  if (!data?.redirectUrl) throw new Error('Réponse de paiement invalide');
  return data;
}

// ⚠️ Point ouvert (07/07/2026, signalé par Remi) : l'article commandé
// n'apparaissait pas dans "Mes commandes" côté membre, alors que le prix/
// statut/date s'affichaient bien. Hypothèse la plus probable : la table
// commande_items a RLS activé sans policy de lecture pour le membre
// propriétaire (contrairement à sticks_distribution, qui n'a pas ce
// problème — l'article y est directement sur la ligne, sans table
// enfant séparée à traverser). Voir migration_rls_commande_items.sql —
// ajoute la policy manquante. Si le problème persiste après avoir exécuté
// cette migration, il faudra vérifier les policies existantes de plus
// près (peut-être une policy déjà présente mais mal écrite plutôt
// qu'absente).
async function getMesCommandes() {
  const { data, error } = await sb.from('commandes')
    .select('*, commande_items(*, produit:produits(nom, photo_url, categorie, mode, precommande_livraison_estimee))')
    .eq('membre_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ⚠️ BUG CORRIGÉ (07/07/2026) — même cause que celle déjà rencontrée et
// corrigée sur getAllDistributions() le 05/07/2026 : depuis l'ajout de la
// colonne receptionnee_par (référençant elle aussi membres(id)) lors de
// la restructuration Matos/Sticks, la table commandes a DEUX clés
// étrangères vers membres (membre_id ET receptionnee_par). Sans préciser
// laquelle utiliser, PostgREST refuse la requête avec une erreur
// d'ambiguïté (statut 300) — non catchée ici (seul `data` était
// déstructuré, jamais `error`), donc getAllCommandes() retournait []  en
// silence. Symptôme observé : "Mes commandes" (getMesCommandes, qui ne
// fait pas ce join) affichait bien les commandes du membre, mais aucune
// commande n'apparaissait jamais dans la page Admin → Gestion, même en
// filtrant "En cours". Corrigé en précisant la contrainte FK exacte — on
// veut le membre auteur de la commande, pas l'admin qui l'a réceptionnée.
async function getAllCommandes() {
  const { data, error } = await sb.from('commandes')
    .select('*, membre:membres!commandes_membre_id_fkey(nom, prenom, pseudo_telegram), commande_items(*, produit:produits(nom, mode))')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return data || [];
}

async function updateCommandeStatut(commandeId, statut) {
  // ⚠️ BUG CORRIGÉ (05/07/2026) : la décrémentation se faisait ici à la
  // transition en_attente→disponible/precommande_validee — ce qui
  // fonctionnait pour le Cash (confirmé côté client via
  // confirmerPaiementCashCommande, qui appelle bien cette fonction JS),
  // mais JAMAIS pour HelloAsso : la confirmation de paiement HelloAsso
  // passe par l'Edge Function helloasso-webhook, du code Deno serveur
  // totalement séparé qui ne peut pas appeler cette fonction JS — un
  // achat Matos payé en HelloAsso ne décrémentait donc jamais le stock.
  // Déplacé sur la transition vers 'distribue' (déclenchée uniquement par
  // le scan ou la confirmation manuelle admin, toujours côté client quel
  // que soit le mode de paiement d'origine) — unifié avec le
  // comportement déjà correct de Sticks (validerPaiementStick décrémente
  // au même moment, cf. supabase-client.js).
  if (statut === 'distribue') {
    const { data: commandeActuelle } = await sb.from('commandes')
      .select('statut, commande_items(produit_id, quantite)')
      .eq('id', commandeId).single();
    if (commandeActuelle && commandeActuelle.statut !== 'distribue') {
      for (const item of commandeActuelle.commande_items || []) {
        const { data: produit } = await sb.from('produits')
          .select('stock').eq('id', item.produit_id).single();
        if (produit) {
          await sb.from('produits')
            .update({ stock: Math.max(0, produit.stock - item.quantite) })
            .eq('id', item.produit_id);
        }
      }
    }
  }
  // ⚠️ BUG CORRIGÉ (07/07/2026) : cet update écrivait aussi updated_at,
  // colonne qui n'existe pas sur commandes (jamais ajoutée en migration) —
  // PostgREST rejetait l'update entier ("Could not find the 'updated_at'
  // column"), bloquant le scan de retrait Matos ("Confirmer retrait"), qui
  // n'avait jamais été testé en conditions réelles jusqu'ici. Rien ne lit
  // ce champ ailleurs dans le code, donc simplement retiré plutôt que
  // d'ajouter la colonne pour rien.
  const { error } = await sb.from('commandes')
    .update({ statut })
    .eq('id', commandeId);
  if (error) throw error;
  return { success: true };
}

// Confirme le paiement Cash d'une commande 'en_attente' (stock uniquement,
// cf. passerCommande) — passe directement en 'disponible', pas d'étape
// 'precommande_validee' possible ici puisque Cash est refusé pour les
// précommandes en amont.
async function confirmerPaiementCashCommande(commandeId) {
  return updateCommandeStatut(commandeId, 'disponible');
}

// Action admin "réceptionné" — UNIQUEMENT pour une commande en
// 'precommande_validee' (payée, en attente de réception physique). Passe
// en 'disponible', prête pour le scan. Ne décrémente rien (déjà fait au
// passage en 'precommande_validee', cf. updateCommandeStatut ci-dessus).
async function receptionnerCommande(commandeId) {
  const { error } = await sb.from('commandes')
    .update({
      statut: 'disponible',
      receptionnee_par: currentUser.id,
      receptionnee_at: new Date().toISOString(),
    })
    .eq('id', commandeId);
  if (error) throw error;
  return { success: true };
}

// Statut intermédiaire "préparé" (07/07/2026, demande Remi) — un sac déjà
// fait à l'avance, pas encore remis physiquement au membre. Purement
// informatif pour l'équipe qui prépare, aucun changement d'affichage
// côté membre (toujours "Disponible — à retirer" tant que non scanné).
async function marquerCommandePreparee(commandeId) {
  const { error } = await sb.from('commandes')
    .update({
      statut: 'prepare',
      preparee_par: currentUser.id,
      preparee_at: new Date().toISOString(),
    })
    .eq('id', commandeId);
  if (error) throw error;
  return { success: true };
}

// ============================================================
// BOUTIQUE — STICKS
// ============================================================

async function getSticks() {
  const membre = currentMembre;
  if (!membre) return [];
  const statut = membre.statut;
  const sectionId = membre.section_id;
  // Détection via roles_app[] (isAdmin/isBureau/isCellule), pas via statut.
  const isAdminBureauCellule = isAdmin(membre) || isBureau(membre) || isCellule(membre);
  const { data, error } = await sb.from('sticks_catalogue')
    .select('*, section:sections(id, nom)')
    .eq('statut', 'disponible')
    .order('nom');
  if (error) throw error;
  return (data || []).filter(s => {
    if (isAdminBureauCellule) return true;
    if (s.niveau_acces === 'tous') return true;
    // 'draft_confirme' et 'confirme' sont tous deux restreints à la
    // section du stick — la différence est le statut minimum requis :
    // - draft_confirme : Draft ou Confirmé de cette section
    // - confirme       : Confirmé de cette section uniquement
    const memeSection = sectionId && s.section_id === sectionId;
    if (s.niveau_acces === 'draft_confirme') {
      return memeSection && (statut === 'draft' || statut === 'confirme');
    }
    if (s.niveau_acces === 'confirme') {
      return memeSection && statut === 'confirme';
    }
    return false;
  });
}

async function getStickById(id) {
  const { data, error } = await sb.from('sticks_catalogue')
    .select('*, section:sections(id, nom)')
    .eq('id', id).single();
  if (error) throw error;
  return data;
}

async function createStick(stick) {
  const { data, error } = await sb.from('sticks_catalogue')
    .insert(stick).select().single();
  if (error) throw error;
  return data;
}

async function updateStick(id, updates) {
  const { data, error } = await sb.from('sticks_catalogue')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getMonQuotaStick(stickId) {
  const { data: stick } = await sb.from('sticks_catalogue')
    .select('quota_par_membre').eq('id', stickId).single();
  if (!stick?.quota_par_membre) return null; // pas de quota
  const { data: distribs } = await sb.from('sticks_distribution')
    .select('quantite')
    .eq('stick_id', stickId)
    .eq('membre_id', currentUser.id);
  const total = (distribs || []).reduce((s, d) => s + (d.quantite || 0), 0);
  return { quota: stick.quota_par_membre, utilise: total, restant: stick.quota_par_membre - total };
}

// Demande HelloAsso — délègue à l'Edge Function (crée la ligne
// sticks_distribution côté serveur, comme pour Matos). Remplace l'ancienne
// demanderStick() qui créait la ligne ici mais n'était jamais réellement
// appelée par le front (le seul chemin HelloAsso actif jusqu'ici était un
// lien statique, cf. plan_helloasso.md §3 — Sticks HelloAsso confirmé le
// 05/07/2026).
async function demanderStickHelloAsso(stickId, quantite = 1) {
  const { data, error } = await sb.functions.invoke('helloasso-create-checkout', {
    body: { stickId, quantite },
  });
  if (error) throw new Error(error.message || 'Impossible de lancer le paiement');
  if (data?.error) throw new Error(data.error);
  if (!data?.redirectUrl) throw new Error('Réponse de paiement invalide');
  return data;
}

async function getMesSticks() {
  const { data, error } = await sb.from('sticks_distribution')
    .select('*, stick:sticks_catalogue(nom, visuel_url, categorie, prix, section_id, section:sections(nom), mode, precommande_livraison_estimee)')
    .eq('membre_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function distribuerStickAdmin(stickId, membreId, quantite, modePaiement = 'cash') {
  // Cash réservé aux articles en mode 'stock' (règle du 05/07/2026 — une
  // précommande exige une preuve de paiement HelloAsso en amont). Le
  // paiement étant déjà encaissé par l'admin au moment de cette action,
  // la ligne part directement en 'disponible' (pas de 'en_attente' ici,
  // contrairement au flux HelloAsso membre) — reste à scanner pour
  // confirmer la remise physique.
  const { data: stick } = await sb.from('sticks_catalogue')
    .select('quota_par_membre, stock, mode').eq('id', stickId).single();
  if (modePaiement === 'cash' && stick?.mode === 'precommande') {
    throw new Error('Le paiement Cash n\'est pas disponible pour une précommande — utilise HelloAsso');
  }
  if (stick?.quota_par_membre) {
    const { data: deja } = await sb.from('sticks_distribution')
      .select('quantite').eq('stick_id', stickId).eq('membre_id', membreId);
    const totalDeja = (deja || []).reduce((s, d) => s + d.quantite, 0);
    if (totalDeja + quantite > stick.quota_par_membre) {
      throw new Error(`Quota dépassé pour ce membre (max ${stick.quota_par_membre})`);
    }
  }
  const { error } = await sb.from('sticks_distribution').insert({
    stick_id: stickId,
    membre_id: membreId,
    quantite,
    distribue_par: currentUser.id,
    mode_paiement: modePaiement,
    statut: 'disponible',
  });
  if (error) throw error;
  return { success: true };
}

// Confirme une distribution Stick et décrémente le stock — point d'entrée
// unique utilisé par le scan QR (validerPaiementStick, déjà existante,
// inchangée) ET par le bouton manuel de filet de secours (mêmes garanties
// d'idempotence : jamais décrémenté deux fois si déjà confirmée).
// Alias volontaire de validerPaiementStick pour un nommage plus clair côté
// scan/bouton manuel, sans dupliquer la logique.
async function confirmerDistributionStick(distribId) {
  return validerPaiementStick(distribId);
}

async function getAllDistributions() {
  // ⚠️ sticks_distribution a deux FK vers membres (membre_id ET
  // distribue_par) — sans préciser laquelle, PostgREST refuse la requête
  // avec une erreur d'ambiguïté (statut 300), jamais détectée avant
  // l'introduction du scan QR car personne n'avait encore appelé cette
  // fonction en conditions réelles. getAllDistributions() retournait donc
  // systématiquement [] en silence (pas de gestion d'erreur), masquant
  // complètement le problème. Corrigé en précisant la contrainte FK
  // exacte (membre:membres!sticks_distribution_membre_id_fkey) — on veut
  // bien le membre destinataire, pas la personne qui a distribué.
  const { data, error } = await sb.from('sticks_distribution')
    .select('*, stick:sticks_catalogue(nom, categorie, prix, mode), membre:membres!sticks_distribution_membre_id_fkey(nom, prenom, pseudo_telegram)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

// Action admin "réceptionné" — UNIQUEMENT pour une distribution en
// 'precommande_validee'. Équivalent Sticks de receptionnerCommande.
async function receptionnerStick(distribId) {
  const { error } = await sb.from('sticks_distribution')
    .update({
      statut: 'disponible',
      receptionnee_par: currentUser.id,
      receptionnee_at: new Date().toISOString(),
    })
    .eq('id', distribId);
  if (error) throw error;
  return { success: true };
}

async function marquerStickPrepare(distribId) {
  const { error } = await sb.from('sticks_distribution')
    .update({
      statut: 'prepare',
      preparee_par: currentUser.id,
      preparee_at: new Date().toISOString(),
    })
    .eq('id', distribId);
  if (error) throw error;
  return { success: true };
}

// Changement de statut générique (Annuler notamment) — équivalent Sticks
// de updateCommandeStatut. Pas de décrémentation de stock ici : elle est
// gérée par validerPaiementStick au moment de 'distribue', pas concernée
// par une annulation.
async function updateDistribStatut(distribId, statut) {
  const { error } = await sb.from('sticks_distribution')
    .update({ statut })
    .eq('id', distribId);
  if (error) throw error;
  return { success: true };
}

async function validerPaiementStick(distribId) {
  // ⚠️ Avant le 21/06/2026 cette fonction écrivait toujours
  // statut:'paye_helloasso', incohérent avec le reste de l'UI qui affiche
  // 'distribue' comme statut final de remise (cf. boutique.js,
  // renderMesSticks/renderToutesDistribs) — un Stick confirmé via le mode
  // Cash se serait donc retrouvé avec un statut "paye_helloasso" trompeur.
  // Corrigé pour écrire 'distribue', cohérent quel que soit le
  // mode_paiement d'origine (cash ou helloasso) — c'est désormais le
  // statut final commun aux deux flux, confirmé par scan ou bouton manuel.
  const { data: distrib } = await sb.from('sticks_distribution')
    .select('stick_id, quantite, statut').eq('id', distribId).single();
  if (distrib && distrib.statut !== 'disponible' && distrib.statut !== 'prepare' && distrib.statut !== 'distribue') {
    // Sécurité : on ne confirme une remise que depuis 'disponible'/'prepare'
    // (payé et prêt, préparé à l'avance ou non) — un scan sur une ligne
    // encore 'en_attente' ou 'precommande_validee' serait un état
    // incohérent (ne devrait jamais arriver via l'UI normale, qui ne
    // propose au scan que ces lignes-là, cf. scan.js). Un statut déjà
    // 'distribue' est accepté sans erreur (idempotence en cas de
    // double-clic).
    throw new Error('Cette remise n\'est pas encore disponible (paiement non confirmé ou précommande non réceptionnée)');
  }
  const { error } = await sb.from('sticks_distribution')
    .update({ statut: 'distribue' })
    .eq('id', distribId);
  if (error) throw error;
  // Décrémentation au moment de la confirmation — jamais si déjà confirmée
  // avant (évite une double décrémentation en cas de double-clic/rappel).
  if (distrib && distrib.statut !== 'distribue') {
    const { data: stick } = await sb.from('sticks_catalogue')
      .select('stock').eq('id', distrib.stick_id).single();
    if (stick) {
      await sb.from('sticks_catalogue')
        .update({ stock: Math.max(0, stick.stock - distrib.quantite) })
        .eq('id', distrib.stick_id);
    }
  }
  return { success: true };
}

// ============================================================
// BOUTIQUE — CARTAGE (catalogue d'articles, comme Matos/Sticks)
// ────────────────────────────────────────────────────────────
// Remplace le 07/07/2026 l'ancien système (lien HelloAsso statique dans
// config_asso + validation manuelle admin, table cotisations) par un
// vrai catalogue permettant plusieurs types de cartage en parallèle
// (ex: 2 tarifs différents), chacun avec son propre Checkout API
// HelloAsso automatisé — même principe que Matos/Sticks. L'ancienne
// table cotisations et les clés config_asso cotisation_* sont conservées
// en base (non supprimées) mais ne sont plus utilisées par le code
// ci-dessous.
// ============================================================

async function getCartageCatalogue() {
  const { data, error } = await sb.from('cartage_catalogue')
    .select('*')
    .eq('statut', 'disponible')
    .order('prix');
  if (error) throw error;
  return data || [];
}

async function getAllCartageCatalogue() {
  const { data, error } = await sb.from('cartage_catalogue')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function createCartage(cartage) {
  const { data, error } = await sb.from('cartage_catalogue').insert(cartage).select().single();
  if (error) throw error;
  return data;
}

async function updateCartage(id, updates) {
  const { error } = await sb.from('cartage_catalogue').update(updates).eq('id', id);
  if (error) throw error;
  return { success: true };
}

async function archiverCartage(id) {
  return updateCartage(id, { statut: 'archive' });
}

// Mes paiements de cartage (vue membre, "Cotisation") — remplace
// getMaCotisation. Retourne l'historique (pour repérer un éventuel
// en_attente/refuse à relancer) + le statut "à jour" tiré directement de
// membres.cotisation_a_jour (mis à jour par le webhook ou la validation
// admin Cash/HA).
async function getMesPaiementsCartage() {
  const { data: paiements } = await sb.from('cartage_paiements')
    .select('*, cartage:cartage_catalogue(nom, prix)')
    .eq('membre_id', currentUser.id)
    .order('created_at', { ascending: false });
  return { paiements: paiements || [], aJour: !!currentMembre?.cotisation_a_jour };
}

// Paiement HelloAsso automatisé — délègue entièrement à l'Edge Function
// (elle crée/réutilise la ligne cartage_paiements, comme pour Matos/
// Sticks/Déplacements).
async function demanderCartageHelloAsso(cartageId) {
  const { data, error } = await sb.functions.invoke('helloasso-create-checkout', {
    body: { cartageId },
  });
  if (error) throw new Error(error.message || 'Impossible de lancer le paiement');
  if (data?.error) throw new Error(data.error);
  if (!data?.redirectUrl) throw new Error('Réponse de paiement invalide');
  return data;
}

// Validation Cash/HA par un admin — nécessite de préciser QUEL cartage
// (plusieurs types possibles désormais), contrairement à l'ancien
// système où il n'y en avait qu'un seul.
async function validerCartageCash(membreId, cartageId) {
  const { data: cartage } = await sb.from('cartage_catalogue').select('*').eq('id', cartageId).single();
  if (!cartage) throw new Error('Cartage introuvable');
  const { error } = await sb.from('cartage_paiements').insert({
    membre_id: membreId,
    cartage_id: cartageId,
    saison: cartage.saison,
    montant: cartage.prix,
    mode_paiement: 'cash',
    statut: 'paye',
    valide_par: currentUser.id,
    paye_at: new Date().toISOString(),
  });
  if (error) throw error;
  await sb.from('membres').update({ cotisation_a_jour: true }).eq('id', membreId);
  return { success: true };
}

async function validerCartageHelloAssoManuel(membreId, cartageId) {
  const { data: cartage } = await sb.from('cartage_catalogue').select('*').eq('id', cartageId).single();
  if (!cartage) throw new Error('Cartage introuvable');
  const { error } = await sb.from('cartage_paiements').insert({
    membre_id: membreId,
    cartage_id: cartageId,
    saison: cartage.saison,
    montant: cartage.prix,
    mode_paiement: 'helloasso',
    statut: 'paye',
    valide_par: currentUser.id,
    paye_at: new Date().toISOString(),
  });
  if (error) throw error;
  await sb.from('membres').update({ cotisation_a_jour: true }).eq('id', membreId);
  return { success: true };
}

// Suivi des paiements (page Admin "Gérer le cartage") — pour chaque
// membre, on ramène son paiement de cartage le plus récent (pour savoir
// s'il a un en_attente/refuse en cours), en plus du flag cotisation_a_jour
// qui reste la source de vérité pour "à jour" ou non.
// ⚠️ BUG CORRIGÉ (07/07/2026) — même cause que les bugs déjà rencontrés
// sur getAllDistributions() et getAllCommandes() : cartage_paiements a
// DEUX clés étrangères vers membres (membre_id ET valide_par), donc
// l'embed cartage_paiements(...) depuis membres est ambigu pour
// PostgREST sans préciser laquelle utiliser — la requête ENTIÈRE échouait
// (pas juste un filtrage partiel), et comme `error` n'était pas vérifié,
// ça retournait [] en silence ("0 membres" affiché alors que des
// paiements existaient bien). Corrigé en précisant la contrainte exacte —
// on veut le membre PAYEUR, pas l'admin qui a validé le paiement.
async function getAllCartagePaiements() {
  const { data, error } = await sb.from('membres')
    .select('id, nom, prenom, pseudo_telegram, statut, cotisation_a_jour, charte_signee, section:sections(nom), cartage_paiements!cartage_paiements_membre_id_fkey(statut, montant, mode_paiement, paye_at, cartage:cartage_catalogue(nom), created_at)')
    .order('nom');
  if (error) throw error;
  return (data || []).map(m => {
    const paiements = (m.cartage_paiements || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { ...m, dernierPaiementCartage: paiements[0] || null };
  });
}

// ============================================================
// STORAGE — Upload photos
// ============================================================

async function compressImage(file, maxWidthPx = 800, qualite = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Calculer les nouvelles dimensions en gardant le ratio
      let { width, height } = img;
      if (width > maxWidthPx) {
        height = Math.round((height * maxWidthPx) / width);
        width = maxWidthPx;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => {
          if (!blob) return reject(new Error('Compression échouée'));
          // Créer un nouveau File avec le bon nom
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg', lastModified: Date.now()
          });
          resolve(compressed);
        },
        'image/jpeg',
        qualite
      );
    };
    img.onerror = () => reject(new Error('Image invalide'));
    img.src = url;
  });
}

async function uploadPhoto(file, bucket, fileName, maxWidth = 800, qualite = 0.75) {
  // 1. Compression automatique avant upload
  let fileToUpload = file;
  const MAX_SIZE_KB = 100; // au-delà de 100KB on compresse
  if (file.size > MAX_SIZE_KB * 1024) {
    try {
      fileToUpload = await compressImage(file, maxWidth, qualite);
      console.log(`Compression: ${Math.round(file.size/1024)}KB → ${Math.round(fileToUpload.size/1024)}KB`);
    } catch(e) {
      console.warn('Compression échouée, upload original:', e);
      fileToUpload = file;
    }
  }

  // 2. Sanitize filename
  const cleanName = fileName.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/gi, '-')
    .toLowerCase();
  const path = `${cleanName}-${Date.now()}.jpg`;

  const { data, error } = await sb.storage
    .from(bucket)
    .upload(path, fileToUpload, { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' });

  if (error) throw new Error('Erreur upload: ' + error.message);

  const { data: urlData } = sb.storage.from(bucket).getPublicUrl(path);
  return urlData.publicUrl;
}

async function uploadPhotoMatos(file, produitNom) {
  // 400px max, ratio carré optimisé pour affichage vignette boutique
  return uploadPhoto(file, 'matos', produitNom, 400, 0.80);
}

async function uploadPhotoStick(file, stickNom) {
  return uploadPhoto(file, 'sticks', stickNom, 400, 0.80);
}

// Réutilise le bucket 'matos' (pas de bucket dédié à créer) — préfixe
// "cartage-" dans le nom de fichier pour rester lisible côté Storage.
async function uploadPhotoCartage(file, cartageNom) {
  return uploadPhoto(file, 'matos', `cartage-${cartageNom}`, 400, 0.80);
}

async function updatePhotoMatos(produitId, photoUrl) {
  const { error } = await sb.from('produits')
    .update({ photo_url: photoUrl })
    .eq('id', produitId);
  if (error) throw error;
  return { success: true };
}

async function updatePhotoStick(stickId, visuelUrl) {
  const { error } = await sb.from('sticks_catalogue')
    .update({ visuel_url: visuelUrl })
    .eq('id', stickId);
  if (error) throw error;
  return { success: true };
}

// ============================================================
// NOTIFICATIONS PUSH (générique — utilisable pour tout type d'alerte)
// ============================================================
//
// Principe en 2 temps :
// 1. Côté navigateur (ce fichier) : demander la permission au membre,
//    créer un "abonnement push" via le Service Worker, l'enregistrer dans
//    la table push_subscriptions (cf. migration_notifications_push.sql).
// 2. Côté serveur (Edge Function send-push-notification, à déployer
//    séparément) : envoyer réellement la notification à un membre donné,
//    quel que soit l'événement qui la déclenche (validation de compte,
//    rappel de déplacement, nouvelle annonce, etc. — un seul point d'envoi
//    générique, réutilisable pour tous les cas futurs).
//
// IMPORTANT iOS : sur iPhone/iPad, les notifications ne fonctionnent que
// si l'app a été installée sur l'écran d'accueil (Safari → Partager →
// Sur l'écran d'accueil) — impossible de les activer depuis un simple
// onglet Safari. Sur Android/Chrome, aucune installation n'est requise.

// Convertit la clé publique VAPID (texte base64url, cf. UL_CONFIG dans
// config.js) au format binaire attendu par PushManager.subscribe().
// Étape technique obligatoire — sans cette conversion, le navigateur
// rejette la clé.
function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// true si ce navigateur sait techniquement faire du push (indépendant de
// la permission accordée ou non — sert à savoir si on doit même proposer
// le bouton "Activer les notifications" à ce membre sur cet appareil).
function notificationsPushSupportees() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

// État actuel pour CET appareil (pas pour le membre en général — un même
// membre peut avoir activé sur son téléphone et pas sur sa tablette).
// Retourne 'non-supporte' | 'refuse' | 'active' | 'inactif'.
async function getStatutNotificationsPush() {
  if (!notificationsPushSupportees()) return 'non-supporte';
  if (Notification.permission === 'denied') return 'refuse';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'active' : 'inactif';
}

// Demande la permission (déclenche la popup native du navigateur — doit
// être appelée depuis un clic explicite du membre, jamais automatiquement
// au chargement de la page, sous peine d'être bloquée par le navigateur)
// puis crée et enregistre l'abonnement. À appeler depuis un bouton
// "Activer les notifications" dans l'UI (page Profil par ex.).
async function activerNotificationsPush() {
  if (!notificationsPushSupportees()) {
    throw new Error('Notifications non supportées sur cet appareil/navigateur');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications refusées');
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true, // obligatoire : on s'engage à toujours montrer une notif visible
      applicationServerKey: _urlBase64ToUint8Array(UL_CONFIG.VAPID_PUBLIC_KEY),
    });
  }
  const json = sub.toJSON();
  // upsert sur endpoint (unique) : si ce même appareil se réabonne (ex:
  // après avoir révoqué puis ré-autorisé), on remplace la ligne existante
  // plutôt que d'en créer une seconde orpheline.
  const { error } = await sb.from('push_subscriptions').upsert({
    membre_id: currentUser.id,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  }, { onConflict: 'endpoint' });
  if (error) throw new Error('Impossible d\'enregistrer l\'abonnement: ' + error.message);
  return true;
}

// Désactive les notifications sur CET appareil uniquement (désinscrit le
// navigateur + supprime la ligne correspondante en base).
async function desactiverNotificationsPush() {
  if (!notificationsPushSupportees()) return true;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
  }
  return true;
}

// Déclenche l'envoi d'une notification push à un membre, via l'Edge
// Function send-push-notification (cf. supabase/functions/send-push-notification/
// — à déployer séparément, voir GUIDE_NOTIFICATIONS_PUSH.md). Générique :
// n'importe quel code de l'app peut appeler cette fonction pour n'importe
// quel motif (validation de compte, rappel de déplacement, etc.), il
// suffit de fournir titre + texte. url (optionnelle) est la page ouverte
// si le membre tape sur la notification (ex: '/ultras-lutetia/').
// Échoue silencieusement par design : un problème d'envoi de notification
// ne doit jamais faire échouer l'action métier qui la déclenche (ex: la
// validation d'un membre doit réussir même si l'envoi de la notif échoue).
async function envoyerNotificationPush(membreId, titre, corps, url = null) {
  try {
    const { error } = await sb.functions.invoke('send-push-notification', {
      body: { membreId, titre, corps, url },
    });
    if (error) console.error('Notification push non envoyée:', error.message);
  } catch (e) {
    console.error('Notification push non envoyée:', e);
  }
}

// Notification "nouveau contenu" envoyée à TOUS les membres ayant le
// droit de voir ce contenu (pas une personne précise) — déplacement,
// session tifo, article matos, ou stick. Le calcul des destinataires est
// fait côté serveur (Edge Function send-push-notification-groupe), pas
// ici : on transmet seulement le critère de ciblage (cible, niveauAcces,
// sectionId), jamais une liste de membreId calculée dans le navigateur.
// cible : 'tous' (déplacement) | 'tifo' (session) | 'matos' | 'sticks'.
// Échoue silencieusement par design, comme envoyerNotificationPush — un
// souci d'envoi ne doit jamais faire échouer la création du contenu.
async function envoyerNotificationPushGroupe({ cible, titre, corps, url = null, niveauAcces = null, sectionId = null }) {
  try {
    const { error } = await sb.functions.invoke('send-push-notification-groupe', {
      body: { cible, titre, corps, url, niveauAcces, sectionId },
    });
    if (error) console.error('Notification groupée non envoyée:', error.message);
  } catch (e) {
    console.error('Notification groupée non envoyée:', e);
  }
}

// ============================================================
// EXPORT GLOBAL
// ============================================================

window.UL = {
  initSession,
  // Auth
  loginByTelegram, logout, changePassword, inscription, demanderResetMdp,
  verifierCodeInscription, renvoyerCodeInscription,
  // Membres
  getMembre, getAllMembres, updateMembre, updateStatutMembre,
  updateSectionMembre, toggleBlocageMembre,
  noterMembre, getEvaluationsMembre, getEvaluationsCourantesBatch, getHistoriqueEvaluation,
  getParticipationBatch,
  adminResetPassword, updateMembreMdp, supprimerMembre,
  // QR Code Membre
  getOrCreateQrCodeMembre, getMembreParQrCode, confirmerPresencesDeplacement, regenererQrCodeMembre,
  // Référentiels
  getSections,
  // Calendrier
  getCalendar, addMatch, updateMatch, getMatchs, deleteMatch,
  saisirScoreMatch, confirmerDateMatch, rouvrirConfirmationMatch,
  getEvenements, getEvenement, saveEvenement, deleteEvenement,
  // Charte
  getCharteActive, signerCharte, getMembresNonSignataires, checkConformiteCharte, publierNouvelleCharte,
  // Sessions Tifo
  getUpcomingSessions, getPastSessions, getSessionDetails,
  inscrire, desinscrire, desinscrireMembreSession, validerPresence, savePizzaChoice,
  createSession, openSession, closeSession, deleteSession,
  updateSession, getSessionsWithStats, updateInscriptionStatut, getPizzaOrders,
  // Déplacements
  getDeplacements, getDeplacement, getStatutInscriptionDepl,
  getMonQuotaDepl, getMembresPourAmisDepl, relancerPaiementDeplacement, demanderInscriptionDeplacementHelloAsso,
  // Amitiés
  getMesAmis, getDemandesAmitieRecues, getDemandesAmitieEnvoyees, repondreDemandeAmitie, annulerDemandeAmitie,
  envoyerDemandeAmitie, rechercherMembrePourAmi,
  validerPaiementCash, validerPaiementHelloAsso, createDeplacement, updateDeplacement, getListeBusTelegram,
  // Annonces
  getAnnonces, publierAnnonce,
  // Codes de réabonnement
  getMesCodesReabonnement, getStatutReabonnement, setReabonnementOuvert, rechercherCodeReabonnementAdmin, listerCodesReabonnementAdmin,
  // Connexion en tant que (Admin)
  genererLienConnexionAdmin,
  // Stats
  getStats, getMesStats,
  // Matos
  getProduits, getProduitById, createProduit, updateProduit, archiverProduit,
  passerCommande, demanderCommandeHelloAsso, confirmerPaiementCashCommande, receptionnerCommande, marquerCommandePreparee, distribuerProduitAdmin,
  getMesCommandes, getAllCommandes, updateCommandeStatut,
  // Sticks
  getSticks, getStickById, createStick, updateStick, getMonQuotaStick,
  demanderStickHelloAsso, receptionnerStick, marquerStickPrepare, updateDistribStatut, getMesSticks,
  distribuerStickAdmin, getAllDistributions, validerPaiementStick, confirmerDistributionStick,
  // Cartage
  getCartageCatalogue, getAllCartageCatalogue, createCartage, updateCartage, archiverCartage,
  getMesPaiementsCartage, demanderCartageHelloAsso,
  validerCartageCash, validerCartageHelloAssoManuel, getAllCartagePaiements,
  // Storage / Upload
  uploadPhotoMatos, uploadPhotoStick, uploadPhotoCartage, updatePhotoMatos, updatePhotoStick,
  // Email
  envoyerEmailValidation,
  // Notifications push
  notificationsPushSupportees, getStatutNotificationsPush,
  activerNotificationsPush, desactiverNotificationsPush,
  envoyerNotificationPush, envoyerNotificationPushGroupe,
  // Direct Supabase access
  sb, getCurrentUser: () => currentUser, getCurrentMembre: () => currentMembre,
};

// ============================================================
// EMAIL — Brevo API
// ============================================================

async function envoyerEmailBrevo({ to, toName, subject, htmlContent }) {
  const resp = await sb.functions.invoke('send-email', {
    body: { to, toName, subject, htmlContent },
  });
  if (resp.error) throw new Error('Email erreur: ' + resp.error.message);
  return true;
}

async function envoyerEmailValidation(membre) {
  const prenom = membre.prenom || 'membre';
  return envoyerEmailBrevo({
    to: membre.email,
    toName: prenom + ' ' + (membre.nom || ''),
    subject: '✅ Ton compte Ultras Lutetia est activé !',
    htmlContent: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;background:#0F172A;color:#E2E8F0;padding:32px;border-radius:12px;">
        <img src="https://appultralutetia-gif.github.io/ultras-lutetia/logo_ul.png" width="60" style="margin-bottom:20px;">
        <h2 style="font-family:Arial,sans-serif;color:#1A56DB;margin-bottom:8px;">Bienvenue dans les Ultras Lutetia !</h2>
        <p>Bonjour <strong>${prenom}</strong>,</p>
        <p>Ton compte a été validé par le bureau. Tu peux maintenant te connecter à l'espace membre :</p>
        <a href="https://appultralutetia-gif.github.io/ultras-lutetia/" 
           style="display:inline-block;background:#1A56DB;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">
          Accéder à l'application
        </a>
        <p style="color:#94A3B8;font-size:13px;margin-top:24px;">À bientôt dans les tribunes — Ultras Lutetia 🔵⚪</p>
      </div>`,
  });
}
