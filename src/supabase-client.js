// ============================================================
// ULTRAS LUTETIA — supabase-client.js
// Remplace gas-shim.js — même interface, backend Supabase
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
  const { data } = await sb.from('membres')
    .select('*')
    .ilike('pseudo_telegram', normalizePseudo(pseudo))
    .maybeSingle();
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
// Déplacement : 'paye_cash'/'paye_helloasso' = payé, 'en_attente' = non
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
    if (d.statut_paiement === 'paye_cash' || d.statut_paiement === 'paye_helloasso') m.deplPaye++;
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
// SECTIONS & CELLULES
// ============================================================

async function getSections() {
  const { data } = await sb.from('sections').select('*').eq('actif', true).order('nom');
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

async function addMatch(matchData) {
  const { data, error } = await sb.from('matchs').insert(matchData).select().single();
  if (error) throw error;
  return data;
}

async function getMatchs() {
  const { data } = await sb.from('matchs').select('*').order('date');
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
  const { data } = await sb.from('chartes')
    .select('*')
    .eq('active', true)
    .or(`date_fin_validite.is.null,date_fin_validite.gte.${today}`)
    .order('date_fin_validite', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
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
  const { data } = await sb.from('membres').select('*').not('id', 'in', `(${sigIds.join(',')})`);
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
  const { data } = await sb.from('sessions_tifo')
    .select('*, inscriptions_session(statut)')
    .lt('date', today)
    .order('date', { ascending: false })
    .limit(20);
  return (data || []).map(s => ({
    ...s,
    _nb_inscrits: s.inscriptions_session?.length || 0,
  }));
}

async function getSessionDetails(sessionId) {
  const { data } = await sb.from('sessions_tifo')
    .select('*')
    .eq('id', sessionId)
    .single();
  const { data: inscrits } = await sb.from('inscriptions_session')
    .select('*, membre:membres(nom, prenom, pseudo_telegram, statut, section:sections(nom))')
    .eq('session_id', sessionId);
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
  const { data } = await sb.from('sessions_tifo')
    .select('*, inscriptions_session(statut)')
    .order('date', { ascending: false });
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
  const { data } = await sb.from('inscriptions_session')
    .select('pizza, membre:membres(nom, prenom)')
    .eq('session_id', sessionId)
    .neq('pizza', 'non');
  return data || [];
}

// ============================================================
// DÉPLACEMENTS
// ============================================================

async function getDeplacements(upcoming = true) {
  const today = new Date().toISOString().split('T')[0];
  let query = sb.from('deplacements')
    .select('*, match:matchs(*)')
    .order('date_match');
  if (upcoming) query = query.gte('date_match', today);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function getDeplacement(id) {
  const { data } = await sb.from('deplacements')
    .select('*, match:matchs(*)')
    .eq('id', id).single();
  const { data: inscrits } = await sb.from('inscriptions_deplacement')
    .select('*, membre:membres(nom, prenom, pseudo_telegram)')
    .eq('deplacement_id', id);
  const monInscrit = (inscrits || []).find(i => i.membre_id === currentUser?.id);
  const nbInscrits = (inscrits || []).length;
  return { deplacement: data, inscrits: inscrits || [], monInscrit, nbInscrits };
}

async function sInscrireDeplacements(deplacementId) {
  const { error } = await sb.from('inscriptions_deplacement').insert({
    deplacement_id: deplacementId,
    membre_id: currentUser.id,
  });
  if (error && error.code === '23505') throw new Error('Déjà inscrit');
  if (error) throw error;
  return { success: true };
}

async function validerPaiementCash(deplacementId, membreId) {
  const qrCode = `UL-${Date.now()}-${membreId.slice(0,6).toUpperCase()}`;
  const { error } = await sb.from('inscriptions_deplacement')
    .update({
      statut_paiement: 'paye_cash',
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

async function validerPaiementHelloAsso(deplacementId, membreId) {
  const qrCode = `UL-HA-${Date.now()}-${membreId.slice(0,6).toUpperCase()}`;
  const { error } = await sb.from('inscriptions_deplacement')
    .update({
      statut_paiement: 'paye_helloasso',
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
// MATOS
// ============================================================
// getProduits() — voir la section "BOUTIQUE — MATOS" plus bas dans ce
// fichier. (Une première version, dupliquée et avec un bug de détection
// Admin/Bureau, vivait ici — supprimée pour ne garder qu'une seule
// implémentation, la version corrigée ci-dessous.)

async function passerCommande(items) {
  // items = [{produit_id, quantite, taille}]
  const total = items.reduce((sum, item) => sum + (item.prix * item.quantite), 0);
  const { data: commande, error } = await sb.from('commandes').insert({
    membre_id: currentUser.id,
    total,
    statut: 'en_attente',
  }).select().single();
  if (error) throw error;
  await sb.from('commande_items').insert(
    items.map(item => ({
      commande_id: commande.id,
      produit_id: item.produit_id,
      quantite: item.quantite,
      taille: item.taille || null,
      prix_unitaire: item.prix,
    }))
  );
  return commande;
}

async function getMesCommandes() {
  const { data } = await sb.from('commandes')
    .select('*, commande_items(*, produit:produits(nom, photo_url))')
    .eq('membre_id', currentUser.id)
    .order('created_at', { ascending: false });
  return data || [];
}

// ============================================================
// STICKS
// ============================================================

async function getSticksCatalogue() {
  const { data } = await sb.from('sticks_catalogue')
    .select('*').eq('statut', 'disponible').order('nom');
  return data || [];
}

async function distribuerStick(stickId, membreId, quantite = 1, sessionId = null) {
  // Vérifier quota
  const { data: deja } = await sb.from('sticks_distribution')
    .select('quantite').eq('stick_id', stickId).eq('membre_id', membreId);
  const totalDeja = (deja || []).reduce((s, d) => s + d.quantite, 0);
  const { data: stick } = await sb.from('sticks_catalogue').select('quota_par_membre').eq('id', stickId).single();
  if (totalDeja + quantite > stick.quota_par_membre) throw new Error('Quota dépassé');

  const { error } = await sb.from('sticks_distribution').insert({
    stick_id: stickId,
    membre_id: membreId,
    quantite,
    distribue_par: currentUser.id,
    session_id: sessionId,
  });
  if (error) throw error;
  return { success: true };
}

// ============================================================
// COTISATIONS
// ============================================================

async function getMaCotisation(saison) {
  const { data } = await sb.from('cotisations')
    .select('*')
    .eq('membre_id', currentUser.id)
    .eq('saison', saison)
    .single();
  return data;
}

async function validerCotisation(membreId, montant, saison, modePaiement = 'cash') {
  const { error } = await sb.from('cotisations').upsert({
    membre_id: membreId,
    saison,
    montant,
    mode_paiement: modePaiement,
    statut: 'paye',
    valide_par: currentUser.id,
    paye_at: new Date().toISOString(),
  }, { onConflict: 'membre_id,saison' });
  if (error) throw error;
  await updateMembre(membreId, { cotisation_a_jour: true });
  return { success: true };
}

// ============================================================
// ANNONCES
// ============================================================

async function getAnnonces() {
  const { data } = await sb.from('annonces')
    .select('*, publie_par:membres(nom, prenom)')
    .eq('actif', true)
    .order('created_at', { ascending: false })
    .limit(10);
  return data || [];
}

async function publierAnnonce(titre, contenu, categorie = 'info', celluleId = null) {
  const { error } = await sb.from('annonces').insert({
    titre, contenu, categorie,
    cellule_id: celluleId,
    publie_par: currentUser.id,
  });
  if (error) throw error;
  return { success: true };
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
  const isConfirme = statut === 'confirme' || isAdminBureauCellule;
  const { data } = await sb.from('produits')
    .select('*, section:sections(id, nom)')
    .eq('statut', 'disponible')
    .order('nom');
  return (data || []).filter(p => {
    if (isAdminBureauCellule) return true;
    if (p.niveau_acces === 'tous') return true;
    if (p.niveau_acces === 'section') {
      if (isConfirme) return true;
      if (statut === 'draft' && sectionId && p.section_id === sectionId) return true;
      return false;
    }
    return false;
  });
}

async function getProduitById(id) {
  const { data } = await sb.from('produits')
    .select('*, section:sections(id, nom)')
    .eq('id', id).single();
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

async function passerCommande(produitId, taille, modePaiement, quantite = 1) {
  const produit = await getProduitById(produitId);
  if (!produit) throw new Error('Article introuvable');
  // Vérif quota si collector
  if (produit.quota_par_membre) {
    const { data: dejaCommande } = await sb.from('commandes')
      .select('commande_items(quantite)')
      .eq('membre_id', currentUser.id)
      .in('statut', ['en_attente', 'validee', 'prete', 'recuperee']);
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
    mode_paiement: modePaiement,
  }).select().single();
  if (error) throw error;
  await sb.from('commande_items').insert({
    commande_id: commande.id,
    produit_id: produitId,
    quantite,
    taille: taille || null,
    prix_unitaire: produit.prix,
  });
  return commande;
}

async function getMesCommandes() {
  const { data } = await sb.from('commandes')
    .select('*, commande_items(*, produit:produits(nom, photo_url, categorie))')
    .eq('membre_id', currentUser.id)
    .order('created_at', { ascending: false });
  return data || [];
}

async function getAllCommandes() {
  const { data } = await sb.from('commandes')
    .select('*, membre:membres(nom, prenom, pseudo_telegram), commande_items(*, produit:produits(nom))')
    .order('created_at', { ascending: false });
  return data || [];
}

async function updateCommandeStatut(commandeId, statut) {
  const { error } = await sb.from('commandes')
    .update({ statut, updated_at: new Date().toISOString() })
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
  // Même correctif que getProduits — voir le commentaire détaillé là-bas :
  // détection via roles_app[] (isAdmin/isBureau/isCellule), pas via statut.
  const isAdminBureauCellule = isAdmin(membre) || isBureau(membre) || isCellule(membre);
  const isConfirme = statut === 'confirme' || isAdminBureauCellule;
  const { data } = await sb.from('sticks_catalogue')
    .select('*, section:sections(id, nom)')
    .eq('statut', 'disponible')
    .order('nom');
  return (data || []).filter(s => {
    if (isAdminBureauCellule) return true;
    if (s.niveau_acces === 'tous') return true;
    if (s.niveau_acces === 'section') {
      if (isConfirme) return true;
      if (statut === 'draft' && sectionId && s.section_id === sectionId) return true;
      return false;
    }
    return false;
  });
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

async function demanderStick(stickId, modePaiement = 'helloasso', quantite = 1) {
  const quota = await getMonQuotaStick(stickId);
  if (quota && quota.restant < quantite) {
    throw new Error(`Quota dépassé — il te reste ${quota.restant} sur ${quota.quota}`);
  }
  const { error } = await sb.from('sticks_distribution').insert({
    stick_id: stickId,
    membre_id: currentUser.id,
    quantite,
    distribue_par: currentUser.id,
    mode_paiement: modePaiement,
    statut: modePaiement === 'helloasso' ? 'en_attente' : 'distribue',
  });
  if (error) throw error;
  return { success: true };
}

async function getMesSticks() {
  const { data } = await sb.from('sticks_distribution')
    .select('*, stick:sticks_catalogue(nom, visuel_url, categorie, prix, section_id, section:sections(nom))')
    .eq('membre_id', currentUser.id)
    .order('created_at', { ascending: false });
  return data || [];
}

async function distribuerStickAdmin(stickId, membreId, quantite, modePaiement = 'cash') {
  const { data: stick } = await sb.from('sticks_catalogue')
    .select('quota_par_membre').eq('id', stickId).single();
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
    statut: modePaiement === 'helloasso' ? 'en_attente' : 'distribue',
  });
  if (error) throw error;
  return { success: true };
}

async function getAllDistributions() {
  const { data } = await sb.from('sticks_distribution')
    .select('*, stick:sticks_catalogue(nom, categorie), membre:membres(nom, prenom, pseudo_telegram)')
    .order('created_at', { ascending: false })
    .limit(100);
  return data || [];
}

async function validerPaiementStick(distribId) {
  const { error } = await sb.from('sticks_distribution')
    .update({ statut: 'paye_helloasso' })
    .eq('id', distribId);
  if (error) throw error;
  return { success: true };
}

// ============================================================
// BOUTIQUE — COTISATIONS
// ============================================================

async function getConfigCotisation() {
  const { data } = await sb.from('config_asso')
    .select('*').in('cle', ['cotisation_lien_helloasso', 'cotisation_montant', 'cotisation_saison']);
  const cfg = {};
  (data || []).forEach(r => { cfg[r.cle] = r.valeur; });
  return {
    lien: cfg.cotisation_lien_helloasso || '',
    montant: cfg.cotisation_montant || '20',
    saison: cfg.cotisation_saison || '2026-2027',
  };
}

async function updateConfigCotisation(lien, montant) {
  await Promise.all([
    sb.from('config_asso').update({ valeur: lien }).eq('cle', 'cotisation_lien_helloasso'),
    sb.from('config_asso').update({ valeur: montant }).eq('cle', 'cotisation_montant'),
  ]);
  return { success: true };
}

async function getMaCotisation() {
  const cfg = await getConfigCotisation();
  const { data } = await sb.from('cotisations')
    .select('*')
    .eq('membre_id', currentUser.id)
    .eq('saison', cfg.saison)
    .single();
  return { cotisation: data, config: cfg };
}

async function validerCotisationCash(membreId) {
  const cfg = await getConfigCotisation();
  const { error } = await sb.from('cotisations').upsert({
    membre_id: membreId,
    saison: cfg.saison,
    montant: parseFloat(cfg.montant),
    mode_paiement: 'cash',
    statut: 'paye',
    valide_par: currentUser.id,
    paye_at: new Date().toISOString(),
  }, { onConflict: 'membre_id,saison' });
  if (error) throw error;
  await sb.from('membres').update({ cotisation_a_jour: true }).eq('id', membreId);
  return { success: true };
}

async function validerCotisationHelloAsso(membreId) {
  const cfg = await getConfigCotisation();
  const { error } = await sb.from('cotisations').upsert({
    membre_id: membreId,
    saison: cfg.saison,
    montant: parseFloat(cfg.montant),
    mode_paiement: 'helloasso',
    statut: 'paye',
    valide_par: currentUser.id,
    paye_at: new Date().toISOString(),
  }, { onConflict: 'membre_id,saison' });
  if (error) throw error;
  await sb.from('membres').update({ cotisation_a_jour: true }).eq('id', membreId);
  return { success: true };
}

async function getAllCotisations() {
  const cfg = await getConfigCotisation();
  const { data } = await sb.from('membres')
    .select('id, nom, prenom, pseudo_telegram, cotisation_a_jour, section:sections(nom), cotisations(statut, mode_paiement, paye_at)')
    .order('nom');
  return (data || []).map(m => ({
    ...m,
    cotisation_saison: (m.cotisations || []).find(c => true) || null,
  }));
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
  // Référentiels
  getSections,
  // Calendrier
  getCalendar, addMatch, getMatchs, deleteMatch,
  saisirScoreMatch, confirmerDateMatch, rouvrirConfirmationMatch,
  // Charte
  getCharteActive, signerCharte, getMembresNonSignataires, checkConformiteCharte, publierNouvelleCharte,
  // Sessions Tifo
  getUpcomingSessions, getPastSessions, getSessionDetails,
  inscrire, desinscrire, validerPresence, savePizzaChoice,
  createSession, openSession, closeSession, deleteSession,
  updateSession, getSessionsWithStats, updateInscriptionStatut, getPizzaOrders,
  // Déplacements
  getDeplacements, getDeplacement, sInscrireDeplacements,
  validerPaiementCash, validerPaiementHelloAsso, createDeplacement, getListeBusTelegram,
  // Matos
  getProduits, passerCommande, getMesCommandes,
  // Sticks
  getSticksCatalogue, distribuerStick,
  // Cotisations
  getMaCotisation, validerCotisation,
  // Annonces
  getAnnonces, publierAnnonce,
  // Stats
  getStats, getMesStats,
  // Matos
  getProduits, getProduitById, updateProduit, archiverProduit,
  passerCommande, getMesCommandes, getAllCommandes, updateCommandeStatut,
  // Sticks
  getSticks, getMonQuotaStick, demanderStick, getMesSticks,
  distribuerStickAdmin, getAllDistributions, validerPaiementStick,
  // Cotisations
  getConfigCotisation, updateConfigCotisation, getMaCotisation,
  validerCotisationCash, validerCotisationHelloAsso, getAllCotisations,
  // Storage / Upload
  uploadPhotoMatos, uploadPhotoStick, updatePhotoMatos, updatePhotoStick,
  // Email
  envoyerEmailValidation,
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
