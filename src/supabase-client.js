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

function normalizePseudo(pseudoTelegram) {
  return (pseudoTelegram || '')
    .replace(/@/g, '')
    .replace(/[\u00A0\u202F\s]+/g, ' ')
    .trim();
}

async function resolvePseudoToEmail(pseudoTelegram, emailADoubleVerifier) {
  const pseudo = normalizePseudo(pseudoTelegram);
  if (!pseudo) throw new Error('Pseudo Telegram requis');

  const payload = { pseudo_telegram: pseudo };
  if (emailADoubleVerifier) payload.email = emailADoubleVerifier.trim();

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/resolve-pseudo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(payload),
  });
  const body = await resp.json();
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

async function demanderResetMdp(pseudoTelegram, emailSaisi) {
  if (!emailSaisi || !emailSaisi.trim()) throw new Error('Email requis');
  const email = await resolvePseudoToEmail(pseudoTelegram, emailSaisi);

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://appultralutetia-gif.github.io/ultras-lutetia/',
  });
  if (error) throw new Error(error.message);
  return { success: true };
}

async function inscription(data) {
  if (!data.email) throw new Error('Email obligatoire');

  const { data: authData, error: authError } = await sb.auth.signUp({
    email: data.email,
    password: data.password,
  });
  if (authError) throw new Error(authError.message);

  const payload = {
    id: authData.user.id,
    pseudo_telegram: normalizePseudo(data.pseudoTelegram),
    nom: data.nom,
    prenom: data.prenom,
    email: data.email,
    ville: data.ville || null,
    code_postal: data.codePostal || null,
    statut: 'visiteur',
  };

  let dernierError = null;
  for (let tentative = 0; tentative < 3; tentative++) {
    const { error: membreError } = await sb.from('membres').insert(payload);
    if (!membreError) return { success: true };
    dernierError = membreError;
    if (membreError.code !== '23503') break;
    await new Promise(r => setTimeout(r, 500 * (tentative + 1)));
  }
  throw new Error(dernierError?.message || 'Impossible de créer le compte');
}

async function verifierCodeInscription(email, code) {
  const { data, error } = await sb.auth.verifyOtp({
    email,
    token: code,
    type: 'email',
  });
  if (error) throw new Error(error.message || 'Code invalide ou expiré');
  await sb.auth.signOut();
  return { success: true };
}

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

// Confirme l'email d'un compte directement (bypass du code à 8
// chiffres) — utile quand un membre est bloqué avant de l'avoir saisi.
// Réservé Admin/Bureau, vérifié côté fonction Postgres (pas seulement
// côté app).
async function confirmerEmailMembre(membreId) {
  const { error } = await sb.rpc('confirmer_email_membre', { p_membre_id: membreId });
  if (error) throw error;
}

// Map membre_id -> dernière connexion (ou null si jamais connecté) —
// Admin/Bureau uniquement, cf. fonction Postgres lister_dernieres_connexions.
async function getDernieresConnexionsParMembre() {
  const { data, error } = await sb.rpc('lister_dernieres_connexions');
  if (error) throw error;
  const map = {};
  (data || []).forEach(r => { map[r.membre_id] = r.derniere_connexion; });
  return map;
}

async function updateStatutMembre(membreId, statut) {
  return updateMembre(membreId, { statut });
}

async function updateSectionMembre(membreId, sectionId) {
  return updateMembre(membreId, { section_id: sectionId });
}

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
  return { success: true, message: 'Non implémenté' };
}

async function updateMembreMdp(membreId, newPassword) {
  const { data: membre } = await sb.from('membres')
    .select('email').eq('id', membreId).single();
  if (!membre?.email) throw new Error('Email introuvable pour ce membre');
  const { error } = await sb.auth.resetPasswordForEmail(membre.email);
  if (error) throw error;
  return { success: true };
}

async function supprimerMembre(membreId) {
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

// ============================================================
// QR CODE MEMBRE
// ============================================================

function genererTokenQrMembre() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffixe = '';
  for (let i = 0; i < 16; i++) {
    suffixe += chars[Math.floor(Math.random() * chars.length)];
  }
  return `UL-MBR-${suffixe}`;
}

async function getOrCreateQrCodeMembre() {
  if (currentMembre?.qr_code_membre) return currentMembre.qr_code_membre;

  const token = genererTokenQrMembre();
  const { data, error } = await sb.from('membres')
    .update({ qr_code_membre: token })
    .eq('id', currentUser.id)
    .select('qr_code_membre')
    .single();
  if (error) throw error;
  currentMembre = await getMembre(currentUser.id);
  return data.qr_code_membre;
}

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

async function getClassementLigue1() {
  const { data, error } = await sb.from('classement_ligue1')
    .select('*')
    .order('position');
  if (error) throw error;
  return data || [];
}

async function syncClassementLigue1Manuel() {
  const { data, error } = await sb.functions.invoke('sync-classement-ligue1', { body: {} });
  if (error) throw error;
  return data;
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

async function checkConformiteCharte() {
  const charteActive = await getCharteActive();
  if (!charteActive) {
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
  if (error && error.code !== '23505') throw error;
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

// Liste des paiements cartage en attente de compte (email connu, jamais
// rattaché à un membre) — utilisée par l'export CSV admin (demande Remi
// 20/07/2026). nom/prenom peuvent être vides pour de très rares entrées
// historiques importées avant que ces colonnes n'existent.
async function getCartageNonInscrits() {
  const { data, error } = await sb
    .from('cartage_preinscriptions')
    .select('nom, prenom, email')
    .is('membre_id', null)
    .order('nom', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

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
  // Le trigger verifier_quota_session_tifo (Postgres) lève une exception
  // texte "Session complète (...)" quand capacite_max est atteinte —
  // remontée telle quelle par PostgREST dans error.message.
  if (error && /complète/i.test(error.message || '')) throw new Error(error.message);
  if (error) throw error;

  // Notification aux admins Tifo (demande Remi 20/07/2026) — pas
  // bloquant : une erreur d'envoi ne doit jamais faire échouer
  // l'inscription elle-même, d'où le catch silencieux.
  notifierAdminsTifoInscription(sessionId).catch(e => console.warn('Notif admins Tifo non envoyée:', e));

  return { success: true };
}

// Envoie une notification push à chaque membre ayant le rôle Cellule
// Tifo (ou Bureau/Admin, cf. hasCelluleTifo côté app.js) quand un membre
// s'inscrit à une session — permet à la cellule de suivre les inscriptions
// sans avoir à rouvrir l'app. Réutilise envoyerNotificationPush (cible
// unique, déjà utilisée pour la validation de compte) plutôt que la
// fonction groupée par droits de contenu (send-push-notification-groupe),
// qui répond à un besoin différent (notifier les MEMBRES d'un nouveau
// contenu, pas notifier les ADMINS d'une action d'un membre).
async function notifierAdminsTifoInscription(sessionId) {
  const [{ data: session }, { data: inscrit }, { data: admins }] = await Promise.all([
    sb.from('sessions_tifo').select('nom').eq('id', sessionId).single(),
    sb.from('membres').select('nom, prenom, pseudo_telegram').eq('id', currentUser.id).single(),
    sb.from('membres').select('id').overlaps('roles_app', ['admin_app', 'bureau_app', 'cellule_tifo']),
  ]);
  if (!admins || !admins.length) return;
  const nomInscrit = inscrit?.pseudo_telegram || `${inscrit?.prenom || ''} ${inscrit?.nom || ''}`.trim() || 'Un membre';
  const nomSession = session?.nom || 'un tifo';
  await Promise.all(
    admins
      .filter(a => a.id !== currentUser.id) // pas besoin de se notifier soi-même si on est aussi Cellule Tifo
      .map(a => envoyerNotificationPush(
        a.id,
        '🖌️ Nouvelle inscription Tifo',
        `${nomInscrit} vient de s'inscrire à "${nomSession}"`,
        '/ultras-lutetia/'
      ))
  );
}

async function desinscrire(sessionId) {
  const { error } = await sb.from('inscriptions_session')
    .delete()
    .eq('session_id', sessionId)
    .eq('membre_id', currentUser.id);
  if (error) throw error;
  return { success: true };
}

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

async function getDeplacements(upcoming = true) {
  const today = new Date().toISOString().split('T')[0];
  let query = sb.from('deplacements')
    .select('*, match:matchs(*)')
    .order('date_match');
  if (upcoming) query = query.gte('date_match', today);
  const { data, error } = await query;
  if (error) throw error;
  const membre = currentMembre;
  const voitLesBrouillons = membre && hasCelluleDepl(membre);
  const visibles = voitLesBrouillons ? (data || []) : (data || []).filter(d => d.visible_membres !== false);
  return await _enrichirDeplacements(visibles);
}

async function _enrichirDeplacements(depls) {
  if (!depls.length) return depls;
  const { data: inscriptions } = await sb.from('inscriptions_deplacement')
    .select('*')
    .in('deplacement_id', depls.map(d => d.id));
  return depls.map(d => {
    const inscritsDuDepl = (inscriptions || []).filter(i => i.deplacement_id === d.id);
    return {
      ...d,
      _inscrits: inscritsDuDepl.length,
      // Utilisé pour l'aperçu d'équilibre financier (Cellule Déplacement
      // uniquement, cf. deplacements.js:renderDeplCard) — seuls les
      // inscrits réellement PAYÉS comptent, pas les en_attente/refusés.
      _inscritsPayes: inscritsDuDepl.filter(i => i.statut_paiement === 'paye_ha' || i.statut_paiement === 'paye_cash').length,
      monInscrit: inscritsDuDepl.find(i => i.membre_id === currentUser?.id) || null,
    };
  });
}

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

async function getMonQuotaDepl(deplacementId) {
  const { data: d } = await sb.from('deplacements')
    .select('quota_par_membre').eq('id', deplacementId).single();
  if (!d?.quota_par_membre) return null;
  const { data: mesInscriptions } = await sb.from('inscriptions_deplacement')
    .select('id, statut_paiement')
    .eq('deplacement_id', deplacementId)
    .eq('payeur_id', currentUser.id);
  // Seules les inscriptions réellement PAYÉES comptent dans le quota
  // (règle Remi 21/07/2026) — 'en_attente' (paiement jamais finalisé),
  // 'refuse', 'annule' et 'rembourse' ne doivent jamais bloquer un
  // membre qui n'est pas allé au bout du paiement.
  const utilise = (mesInscriptions || []).filter(i => ['paye_cash', 'paye_ha'].includes(i.statut_paiement)).length;
  return { quota: d.quota_par_membre, utilise, restant: d.quota_par_membre - utilise };
}

async function getMembresPourAmisDepl() {
  return await getMesAmis();
}

// ============================================================
// AMITIÉS
// ============================================================

async function getMesAmis() {
  const { data, error } = await sb.from('amities')
    .select(`
      id, demandeur_id, destinataire_id,
      demandeur:membres!amities_demandeur_id_fkey(id, nom, prenom, pseudo_telegram, deplacements_gratuits, statut),
      destinataire:membres!amities_destinataire_id_fkey(id, nom, prenom, pseudo_telegram, deplacements_gratuits, statut)
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

async function annulerInscriptionDepl(inscriptionId) {
  const { data: insc, error: fetchErr } = await sb.from('inscriptions_deplacement')
    .select('statut_paiement, membre_id').eq('id', inscriptionId).single();
  if (fetchErr) throw fetchErr;
  if (insc.membre_id !== currentUser.id) throw new Error('Action non autorisée');
  if (insc.statut_paiement === 'paye_cash' || insc.statut_paiement === 'paye_ha') {
    throw new Error('Impossible d\'annuler un paiement déjà confirmé — contacte le bureau');
  }
  const { error } = await sb.from('inscriptions_deplacement')
    .update({ statut_paiement: 'annule' })
    .eq('id', inscriptionId);
  if (error) throw error;
  return { success: true };
}

async function annulerInscriptionDeplAdmin(inscriptionId) {
  const { data: insc, error: fetchErr } = await sb.from('inscriptions_deplacement')
    .select('statut_paiement').eq('id', inscriptionId).single();
  if (fetchErr) throw fetchErr;
  if (insc.statut_paiement === 'paye_cash' || insc.statut_paiement === 'paye_ha') {
    throw new Error('Impossible d\'annuler un paiement déjà confirmé');
  }
  const { error } = await sb.from('inscriptions_deplacement')
    .update({ statut_paiement: 'annule' })
    .eq('id', inscriptionId);
  if (error) throw error;
  return { success: true };
}

// Toutes les fonctions HelloAsso ci-dessous appelaient sb.functions.invoke
// directement et perdaient le vrai message d'erreur renvoyé par l'Edge
// Function (ex. "Quota dépassé — max 1 par membre") — le SDK Supabase
// remplace ce message par un texte générique ("Edge Function returned a
// non-2xx status code") dès que le code HTTP n'est pas 2xx, `data` restant
// alors `null`. Le vrai corps de réponse est dans `error.context` (la
// Response brute), à relire manuellement (demande Remi 22/07/2026, suite
// au cas Brahim Bennais / Tour de Cou : message affiché totalement
// inexploitable pour diagnostiquer).
async function appellerHelloAssoCheckout(body) {
  const { data, error } = await sb.functions.invoke('helloasso-create-checkout', { body });
  if (error) {
    let messageReel = error.message;
    try {
      const corps = await error.context?.json();
      if (corps?.error) messageReel = corps.error;
    } catch (_) { /* corps non lisible en JSON — on garde le message générique */ }
    throw new Error(messageReel || 'Impossible de lancer le paiement');
  }
  if (data?.error) throw new Error(data.error);
  // Cas gratuit (déplacement, demande Remi 23/07/2026) : pas de
  // redirectUrl puisqu'aucun paiement HelloAsso n'a été déclenché,
  // l'inscription a été validée directement côté serveur.
  if (data?.gratuit) return data;
  if (!data?.redirectUrl) throw new Error('Réponse de paiement invalide');
  return data;
}

async function relancerPaiementDeplacement(deplacementId) {
  return appellerHelloAssoCheckout({ deplacementId });
}

async function demanderInscriptionDeplacementHelloAsso(deplacementId, participants) {
  return appellerHelloAssoCheckout({ deplacementId, participants });
}

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
  if (inscription.membre_id) recalculerEvaluationDeplacement(inscription.membre_id);
  return { success: true, qrCode };
}

async function validerPaiementHelloAsso(deplacementId, membreId) {
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
  recalculerEvaluationDeplacement(membreId);
  return { success: true, qrCode };
}

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
    `✅ *PAYÉS (${payes.length}${deplacement.places_max ? '/' + deplacement.places_max : ''})*`,
    ...payes.map((i, n) => `${n+1}. @${i.membre.pseudo_telegram} — ${i.statut_paiement === 'paye_cash' ? 'Cash' : 'HelloAsso'}`),
    ``,
    `⏳ En attente: ${inscrits.length - payes.length}`,
  ];
  return lines.join('\n');
}

// ============================================================
// ANNONCES
// ============================================================

async function getAnnonces() {
  const { data, error } = await sb.from('annonces')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data || [];
}

async function publierAnnonce(titre, contenu, categorie = 'info') {
  const { error } = await sb.from('annonces').insert({
    titre, contenu, categorie,
  });
  if (error) throw error;
  return { success: true };
}

// ============================================================
// CODES DE RÉABONNEMENT
// ============================================================

async function getMesCodesReabonnement() {
  const { data, error } = await sb.rpc('get_mes_codes_reabonnement');
  if (error) throw error;
  return data || [];
}

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

async function rechercherCodeReabonnementAdmin(recherche) {
  const { data, error } = await sb.rpc('admin_rechercher_code_reabonnement', { p_recherche: (recherche||'').trim() });
  if (error) throw error;
  return data || [];
}

async function listerCodesReabonnementAdmin() {
  const { data, error } = await sb.rpc('admin_lister_codes_reabonnement');
  if (error) throw error;
  return data || [];
}

// ============================================================
// CONNEXION EN TANT QUE (Admin uniquement)
// ============================================================

async function genererLienConnexionAdmin(membreId) {
  const { data, error } = await sb.functions.invoke('admin-generer-lien-connexion', {
    body: { membreId },
  });
  if (error) {
    // Même bug que les fonctions HelloAsso (corrigé le 22/07/2026) : le
    // SDK Supabase remplace le vrai message d'erreur par un texte
    // générique dès que le code HTTP n'est pas 2xx — à relire depuis
    // error.context (la Response brute).
    let messageReel = error.message;
    try {
      const corps = await error.context?.json();
      if (corps?.error) messageReel = corps.error;
    } catch (_) { /* corps non lisible en JSON — on garde le message générique */ }
    throw new Error(messageReel || 'Impossible de générer le lien');
  }
  if (data?.error) throw new Error(data.error);
  if (!data?.lien) throw new Error('Réponse invalide du serveur');
  return data;
}

// ============================================================
// STATS
// ============================================================

async function getStats() {
  const [membres, sessions, deplacements, sections, cartageNonInscrits] = await Promise.all([
    sb.from('membres').select('statut, section_id, created_at, cotisation_a_jour, charte_signee, actif, roles_app', { count: 'exact' }),
    sb.from('sessions_tifo').select('id', { count: 'exact' }),
    sb.from('deplacements').select('id', { count: 'exact' }),
    sb.from('sections').select('id, nom').eq('actif', true),
    // Dégradation silencieuse si la policy manque un jour (ex. table
    // cartage_preinscriptions) — une stat en moins ne doit jamais casser
    // toute la page Stats.
    getCartageNonInscrits().catch(() => []),
  ]);
  const m = membres.data || [];

  // Courbe "inscriptions cumulées" (demande Remi 22/07/2026, affinée le
  // 22/07/2026 : regroupement par SEMAINE plutôt que par mois — avec
  // seulement 1-2 mois d'historique, un regroupement mensuel ne donnait
  // que 2 points, illisible). Cumul semaine par semaine du total de
  // membres, de la première semaine connue à aujourd'hui.
  const parSemaine = {};
  m.forEach(x => {
    if (!x.created_at) return;
    const d = new Date(x.created_at);
    // Lundi de la semaine, en UTC pour éviter tout décalage de fuseau
    // horaire qui ferait glisser certaines inscriptions dans la mauvaise
    // semaine près de minuit.
    const jour = (d.getUTCDay() + 6) % 7; // 0 = lundi
    const lundi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - jour));
    const cle = lundi.toISOString().slice(0, 10);
    parSemaine[cle] = (parSemaine[cle] || 0) + 1;
  });
  const semainesTriees = Object.keys(parSemaine).sort();
  let cumul = 0;
  const courbeInscriptions = semainesTriees.map(semaine => {
    cumul += parSemaine[semaine];
    return { semaine, total: cumul };
  });

  // Répartition par section — noms résolus (avant : uniquement
  // section_id, jamais affiché) ; "Sans section" pour les membres non
  // rattachés.
  const sectionsById = new Map((sections.data || []).map(s => [s.id, s.nom]));
  const parSection = {};
  m.forEach(x => {
    const nom = sectionsById.get(x.section_id) || 'Sans section';
    parSection[nom] = (parSection[nom] || 0) + 1;
  });
  const repartitionSections = Object.entries(parSection).sort((a, b) => b[1] - a[1]);

  const compteRole = (role) => m.filter(x => Array.isArray(x.roles_app) && x.roles_app.includes(role)).length;

  return {
    totalMembres: membres.count || 0,
    totalSessions: sessions.count || 0,
    totalDeplacements: deplacements.count || 0,
    cartageNonInscrits: (cartageNonInscrits || []).length,
    courbeInscriptions,
    repartitionSections,
    repartitionStatuts: m.reduce((acc, x) => {
      acc[x.statut] = (acc[x.statut] || 0) + 1;
      return acc;
    }, {}),
    cartageOk: m.filter(x => x.cotisation_a_jour).length,
    charteSignee: m.filter(x => x.charte_signee).length,
    actifs: m.filter(x => x.actif).length,
    bloques: m.filter(x => !x.actif).length,
    roles: {
      admin: compteRole('admin_app'),
      bureau: compteRole('bureau_app'),
      celluleTifo: compteRole('cellule_tifo'),
      celluleDepl: compteRole('cellule_depl'),
      celluleMatos: compteRole('cellule_matos'),
      celluleSticks: compteRole('cellule_sticks'),
      celluleComite: compteRole('cellule_comite'),
    },
  };
}

async function getMesStats() {
  const [presencesTifo, presencesDomicile, presencesExterieur] = await Promise.all([
    sb.from('inscriptions_session').select('id', { count: 'exact', head: true }).eq('membre_id', currentUser.id).eq('statut','present'),
    sb.from('presences_matchs_domicile').select('id', { count: 'exact', head: true }).eq('membre_id', currentUser.id),
    sb.from('inscriptions_deplacement').select('id', { count: 'exact', head: true }).eq('membre_id', currentUser.id).not('present_at', 'is', null),
  ]);
  const nbDomicile = presencesDomicile.count || 0;
  const nbExterieur = presencesExterieur.count || 0;
  return {
    matchsTotal: nbDomicile + nbExterieur,
    sessionsPresent: presencesTifo.count || 0,
    presencesDomicile: nbDomicile,
    presencesExterieur: nbExterieur,
  };
}

async function getStatsTifo(saison = null) {
  let sessionsQuery = sb.from('sessions_tifo').select('id, nom, date, statut, type_session, lieu, saison, capacite_max');
  if (saison) sessionsQuery = sessionsQuery.eq('saison', saison);

  const [sessionsRes, inscriptionsRes, popRes, celluleTifoRes, sectionsRes] = await Promise.all([
    sessionsQuery,
    sb.from('inscriptions_session')
      .select('id, session_id, membre_id, statut, membre:membres(prenom, nom, pseudo_telegram, statut, section_id, roles_app)'),
    sb.from('membres').select('id, statut, section_id').in('statut', ['confirme', 'draft']),
    sb.from('membres').select('id, statut').contains('roles_app', ['cellule_tifo']),
    sb.from('sections').select('id, nom').eq('actif', true),
  ]);
  if (sessionsRes.error) throw sessionsRes.error;
  if (inscriptionsRes.error) throw inscriptionsRes.error;
  if (popRes.error) throw popRes.error;
  if (celluleTifoRes.error) throw celluleTifoRes.error;
  if (sectionsRes.error) throw sectionsRes.error;

  const sessions = sessionsRes.data || [];
  const sessionIds = new Set(sessions.map(s => s.id));
  const inscriptions = (inscriptionsRes.data || []).filter(i => sessionIds.has(i.session_id));
  const population = popRes.data || [];
  const celluleTifo = celluleTifoRes.data || [];
  const sections = sectionsRes.data || [];

  const sessionById = new Map(sessions.map(s => [s.id, s]));
  const presences = inscriptions.filter(i => i.statut === 'present');

  const totalSessions = sessions.length;
  const sessionsAVenir = sessions.filter(s => s.statut === 'a_venir').length;
  const sessionsTerminees = sessions.filter(s => s.statut === 'terminee').length;
  const totalPresences = presences.length;

  const parMembre = new Map();
  for (const p of presences) {
    if (!p.membre_id) continue;
    if (!parMembre.has(p.membre_id)) parMembre.set(p.membre_id, { membre: p.membre, nb: 0, dates: [] });
    const entry = parMembre.get(p.membre_id);
    entry.nb++;
    const sess = sessionById.get(p.session_id);
    if (sess?.date) entry.dates.push(sess.date);
  }
  const membresActifs = parMembre.size;
  const moyennePresencesParSession = sessionsTerminees ? totalPresences / sessionsTerminees : 0;

  const presencesParSession = new Map();
  for (const p of presences) presencesParSession.set(p.session_id, (presencesParSession.get(p.session_id) || 0) + 1);
  let sessionTop = null, sessionTopNb = 0;
  for (const [sid, nb] of presencesParSession) {
    if (nb > sessionTopNb) { sessionTopNb = nb; sessionTop = sessionById.get(sid); }
  }

  const popIds = new Set(population.map(m => m.id));
  const popAvecSession = new Set([...parMembre.keys()].filter(id => popIds.has(id)));
  const nbSansSession = population.length - popAvecSession.size;
  const tauxAvecSession = population.length ? popAvecSession.size / population.length : 0;

  function calculerBuckets(sousPopulation) {
    const b = { '0': 0, '1': 0, '2': 0, '3-4': 0, '5+': 0 };
    for (const m of sousPopulation) {
      const nb = parMembre.get(m.id)?.nb || 0;
      if (nb === 0) b['0']++;
      else if (nb === 1) b['1']++;
      else if (nb === 2) b['2']++;
      else if (nb <= 4) b['3-4']++;
      else b['5+']++;
    }
    return b;
  }
  const buckets = calculerBuckets(population);
  const bucketsParStatut = {
    confirme: calculerBuckets(population.filter(m => m.statut === 'confirme')),
    draft: calculerBuckets(population.filter(m => m.statut === 'draft')),
  };

  const repartitionType = sessions.reduce((acc, s) => { acc[s.type_session] = (acc[s.type_session] || 0) + 1; return acc; }, {});
  const repartitionLieu = sessions.reduce((acc, s) => { const l = s.lieu || 'Non renseigné'; acc[l] = (acc[l] || 0) + 1; return acc; }, {});
  const presencesParStatut = presences.reduce((acc, p) => { const st = p.membre?.statut || 'inconnu'; acc[st] = (acc[st] || 0) + 1; return acc; }, {});

  const classement = [...parMembre.values()].sort((a, b) => b.nb - a.nb);
  const resolus = inscriptions.filter(i => i.statut === 'present' || i.statut === 'absent');
  const absents = inscriptions.filter(i => i.statut === 'absent');
  const tauxNoShow = resolus.length ? absents.length / resolus.length : 0;

  const aujourdHui = new Date();
  const il30j = new Date(aujourdHui.getTime() - 30 * 24 * 3600 * 1000);
  let nouveauxParticipants = 0;
  for (const entry of parMembre.values()) {
    if (!entry.dates.length) continue;
    const premiereDate = entry.dates.reduce((min, d) => (d < min ? d : min), entry.dates[0]);
    if (new Date(premiereDate) >= il30j) nouveauxParticipants++;
  }

  const nbAuMoinsUne = parMembre.size;
  const nbAuMoinsDeux = [...parMembre.values()].filter(e => e.nb >= 2).length;
  const tauxRetention = nbAuMoinsUne ? nbAuMoinsDeux / nbAuMoinsUne : 0;

  const SEUIL_DECROCHAGE_JOURS = 45;
  const seuilDecrochage = new Date(aujourdHui.getTime() - SEUIL_DECROCHAGE_JOURS * 24 * 3600 * 1000);
  const decrocheurs = [];
  for (const entry of parMembre.values()) {
    if (!entry.dates.length) continue;
    const derniereDate = entry.dates.reduce((max, d) => (d > max ? d : max), entry.dates[0]);
    if (new Date(derniereDate) < seuilDecrochage) {
      decrocheurs.push({ membre: entry.membre, nb: entry.nb, derniereDate });
    }
  }
  decrocheurs.sort((a, b) => b.derniereDate.localeCompare(a.derniereDate));

  const sessionsTrieesCadence = [...sessions].filter(s => s.date).sort((a, b) => a.date.localeCompare(b.date));
  let cadenceMoyenneJours = null;
  if (sessionsTrieesCadence.length >= 2) {
    let totalJours = 0;
    for (let i = 1; i < sessionsTrieesCadence.length; i++) {
      totalJours += (new Date(sessionsTrieesCadence[i].date) - new Date(sessionsTrieesCadence[i - 1].date)) / (24 * 3600 * 1000);
    }
    cadenceMoyenneJours = totalJours / (sessionsTrieesCadence.length - 1);
  }

  const celluleTifoAvecPresence = celluleTifo.filter(m => parMembre.has(m.id)).length;
  const tauxParticipationCelluleTifo = celluleTifo.length ? celluleTifoAvecPresence / celluleTifo.length : null;

  const sessionsAvecCapacite = sessions.filter(s => s.capacite_max);
  let tauxRemplissageMoyen = null;
  if (sessionsAvecCapacite.length) {
    const totalPct = sessionsAvecCapacite.reduce((sum, s) => {
      const nb = presencesParSession.get(s.id) || 0;
      return sum + Math.min(1, nb / s.capacite_max);
    }, 0);
    tauxRemplissageMoyen = totalPct / sessionsAvecCapacite.length;
  }

  const parMoisPresences = new Map();
  for (const p of presences) {
    const sess = sessionById.get(p.session_id);
    if (!sess?.date) continue;
    const mois = sess.date.slice(0, 7);
    parMoisPresences.set(mois, (parMoisPresences.get(mois) || 0) + 1);
  }
  const sessionsTriees = [...sessions].filter(s => s.date).sort((a, b) => a.date.localeCompare(b.date));
  const vus = new Set();
  const parMoisCumul = new Map();
  for (const s of sessionsTriees) {
    const mois = s.date.slice(0, 7);
    for (const p of presences) { if (p.session_id === s.id && p.membre_id) vus.add(p.membre_id); }
    parMoisCumul.set(mois, vus.size);
  }
  const tousMois = [...new Set([...parMoisPresences.keys(), ...parMoisCumul.keys()])].sort();
  let dernierCumul = 0;
  const evolution = {
    mois: tousMois,
    presences: tousMois.map(m => parMoisPresences.get(m) || 0),
    cumulUniques: tousMois.map(m => {
      if (parMoisCumul.has(m)) dernierCumul = parMoisCumul.get(m);
      return dernierCumul;
    }),
  };

  const sectionById = new Map(sections.map(s => [s.id, s.nom]));
  const parSection = new Map();
  for (const p of presences) {
    const secId = p.membre?.section_id || null;
    if (!parSection.has(secId)) parSection.set(secId, { nb: 0, membres: new Set() });
    const entry = parSection.get(secId);
    entry.nb++;
    if (p.membre_id) entry.membres.add(p.membre_id);
  }
  const classementSections = [...parSection.entries()]
    .map(([secId, v]) => ({ nom: sectionById.get(secId) || 'Sans section', nbPresences: v.nb, nbMembres: v.membres.size }))
    .sort((a, b) => b.nbPresences - a.nbPresences);

  return {
    saison: saison || 'toutes',
    totalSessions, sessionsAVenir, sessionsTerminees, totalPresences, membresActifs,
    moyennePresencesParSession, sessionTop: sessionTop ? { nom: sessionTop.nom, nb: sessionTopNb } : null,
    nbSansSession, tauxAvecSession, populationTotal: population.length, buckets, bucketsParStatut,
    repartitionType, repartitionLieu, presencesParStatut,
    classement, tauxNoShow, nbAbsents: absents.length, nbResolus: resolus.length,
    nouveauxParticipants, tauxRetention, decrocheurs, cadenceMoyenneJours,
    tauxParticipationCelluleTifo, celluleTifoTotal: celluleTifo.length, celluleTifoAvecPresence,
    tauxRemplissageMoyen, nbSessionsAvecCapacite: sessionsAvecCapacite.length,
    evolution, classementSections,
    presencesDetail: presences.map(p => ({
      membre_id: p.membre_id, membre: p.membre,
      type: sessionById.get(p.session_id)?.type_session,
    })),
  };
}

async function getSaisonsTifoDisponibles() {
  const { data, error } = await sb.from('sessions_tifo').select('saison');
  if (error) throw error;
  const saisons = [...new Set((data || []).map(s => s.saison).filter(Boolean))];
  return saisons.sort((a, b) => b.localeCompare(a));
}

// ────────────────────────────────────────────────────────────
// Stats Déplacements / Matos / Sticks (22/07/2026, demande Remi ;
// enrichies le 23/07/2026 pour être au même niveau de détail que
// getStatsTifo — classements, évolution dans le temps, répartitions,
// fidélité des acheteurs/participants) — 2 petits utilitaires partagés
// pour éviter de dupliquer 3 fois la même logique de regroupement.
// ────────────────────────────────────────────────────────────

// Classement par membre à partir d'une liste de lignes "payées"
// (inscriptions_deplacement, commandes ou sticks_distribution — toutes
// ont un membre_id et une relation `membre` chargée). `valeurFn` calcule
// le montant à additionner pour chaque ligne.
function _classementParMembre(lignes, valeurFn) {
  const parMembre = new Map();
  for (const l of lignes) {
    if (!l.membre_id) continue;
    if (!parMembre.has(l.membre_id)) parMembre.set(l.membre_id, { membre: l.membre, nb: 0, montant: 0 });
    const e = parMembre.get(l.membre_id);
    e.nb++;
    e.montant += valeurFn(l);
  }
  return [...parMembre.values()].sort((a, b) => b.montant - a.montant || b.nb - a.nb);
}

// Évolution mensuelle cumulée (nombre de lignes + montant) — même esprit
// que la courbe "inscriptions cumulées" de l'onglet Général (getStats),
// réutilisée ici pour visualiser la progression du CA dans le temps.
function _evolutionMensuelleCumulee(lignes, montantFn) {
  const parMois = new Map();
  for (const l of lignes) {
    if (!l.created_at) continue;
    const mois = l.created_at.slice(0, 7);
    if (!parMois.has(mois)) parMois.set(mois, { nb: 0, montant: 0 });
    const e = parMois.get(mois);
    e.nb++;
    e.montant += montantFn(l);
  }
  const moisTries = [...parMois.keys()].sort();
  let cumulNb = 0, cumulMontant = 0;
  return moisTries.map(mois => {
    const e = parMois.get(mois);
    cumulNb += e.nb;
    cumulMontant += e.montant;
    return { mois, nbCumul: cumulNb, montantCumul: Math.round(cumulMontant * 100) / 100 };
  });
}

async function getStatsDeplacements() {
  const [deplRes, inscrRes, popRes] = await Promise.all([
    sb.from('deplacements').select('id, adversaire, date_match, statut, prix_total, places_max, quota_par_membre'),
    sb.from('inscriptions_deplacement')
      .select('id, deplacement_id, statut_paiement, membre_id, invite_nom, created_at, membre:membres!inscriptions_deplacement_membre_id_fkey(prenom, nom, pseudo_telegram, statut, section_id)'),
    // Population de référence (Draft+Confirmé) pour situer la participation
    // aux déplacements dans l'ensemble du club — même logique que
    // getStatsTifo (tauxAvecSession/nbSansSession).
    sb.from('membres').select('id, statut').in('statut', ['confirme', 'draft']),
  ]);
  if (deplRes.error) throw deplRes.error;
  if (inscrRes.error) throw inscrRes.error;
  if (popRes.error) throw popRes.error;
  const depls = deplRes.data || [];
  const inscrs = inscrRes.data || [];
  const population = popRes.data || [];
  const deplById = new Map(depls.map(d => [d.id, d]));

  const payees = inscrs.filter(i => i.statut_paiement === 'paye_ha' || i.statut_paiement === 'paye_cash');
  const parStatut = inscrs.reduce((acc, i) => { acc[i.statut_paiement] = (acc[i.statut_paiement] || 0) + 1; return acc; }, {});
  const parModePaiement = { paye_ha: 0, paye_cash: 0 };
  payees.forEach(i => { if (parModePaiement[i.statut_paiement] !== undefined) parModePaiement[i.statut_paiement]++; });

  const montantTotal = payees.reduce((sum, i) => sum + (deplById.get(i.deplacement_id)?.prix_total || 0), 0);
  const montantMoyenParInscription = payees.length ? montantTotal / payees.length : 0;

  const parDepl = new Map();
  for (const i of payees) parDepl.set(i.deplacement_id, (parDepl.get(i.deplacement_id) || 0) + 1);
  const classementDeplacements = [...parDepl.entries()]
    .map(([id, nb]) => ({ nom: deplById.get(id)?.adversaire || 'Déplacement supprimé', nb, montant: nb * (deplById.get(id)?.prix_total || 0) }))
    .sort((a, b) => b.nb - a.nb);
  const topDepl = classementDeplacements[0] || null;

  const classementMembres = _classementParMembre(payees, i => deplById.get(i.deplacement_id)?.prix_total || 0);

  const parMembreId = new Map();
  for (const i of payees) {
    if (!i.membre_id) continue;
    parMembreId.set(i.membre_id, (parMembreId.get(i.membre_id) || 0) + 1);
  }
  const popIds = new Set(population.map(m => m.id));
  const popAvecDepl = new Set([...parMembreId.keys()].filter(id => popIds.has(id)));
  const tauxAvecParticipation = population.length ? popAvecDepl.size / population.length : 0;
  const nbSansParticipation = population.length - popAvecDepl.size;
  const nbAuMoinsDeux = [...parMembreId.values()].filter(nb => nb >= 2).length;
  const tauxRetention = parMembreId.size ? nbAuMoinsDeux / parMembreId.size : 0;

  const nbInvites = inscrs.filter(i => i.invite_nom).length;
  const resolus = inscrs.filter(i => ['paye_ha', 'paye_cash', 'refuse', 'rembourse'].includes(i.statut_paiement));
  const tauxRembourseOuRefuse = resolus.length
    ? resolus.filter(i => i.statut_paiement === 'refuse' || i.statut_paiement === 'rembourse').length / resolus.length
    : 0;

  const avecCapacite = depls.filter(d => d.places_max);
  let tauxRemplissageMoyen = null;
  if (avecCapacite.length) {
    const totalPct = avecCapacite.reduce((sum, d) => sum + Math.min(1, (parDepl.get(d.id) || 0) / d.places_max), 0);
    tauxRemplissageMoyen = totalPct / avecCapacite.length;
  }

  const evolution = _evolutionMensuelleCumulee(payees, i => deplById.get(i.deplacement_id)?.prix_total || 0);

  return {
    totalDeplacements: depls.length,
    aVenir: depls.filter(d => d.statut === 'ouvert' || d.statut === 'complet').length,
    termines: depls.filter(d => d.statut === 'termine').length,
    annules: depls.filter(d => d.statut === 'annule').length,
    totalInscriptions: inscrs.length,
    totalPayees: payees.length,
    parStatut,
    parModePaiement,
    montantTotal,
    montantMoyenParInscription,
    topDeplacement: topDepl ? { nom: topDepl.nom, nb: topDepl.nb } : null,
    classementDeplacements,
    classementMembres: classementMembres.slice(0, 10),
    nbParticipantsDistincts: parMembreId.size,
    populationTotal: population.length,
    tauxAvecParticipation,
    nbSansParticipation,
    tauxRetention,
    nbInvites,
    tauxRembourseOuRefuse,
    tauxRemplissageMoyen,
    evolution,
  };
}

// Stats détaillées d'UN SEUL déplacement (bouton "📊 Stats" sur la carte,
// visible Admin/Bureau/Cellule Déplacement uniquement — cf. ouvrirStatsDepl
// dans deplacements.js) — remplissage, répartition par statut membre et
// par section, répartition des modes de paiement, équilibre financier.
// Demande Remi 23/07/2026. Reprend la logique déjà utilisée pour
// l'aperçu d'équilibre affiché sur la carte (renderDeplCard) pour rester
// cohérent avec les chiffres déjà visibles ailleurs dans l'app.
async function getStatsDeplacement(deplacementId) {
  const [deplRes, inscrRes, sectionsRes] = await Promise.all([
    sb.from('deplacements').select('*').eq('id', deplacementId).single(),
    sb.from('inscriptions_deplacement')
      .select('id, statut_paiement, membre_id, invite_nom, present_at, membre:membres!inscriptions_deplacement_membre_id_fkey(statut, section_id)')
      .eq('deplacement_id', deplacementId),
    sb.from('sections').select('id, nom'),
  ]);
  if (deplRes.error) throw deplRes.error;
  if (inscrRes.error) throw inscrRes.error;
  const d = deplRes.data;
  const inscrs = inscrRes.data || [];
  const sections = sectionsRes.data || [];
  const sectionById = new Map(sections.map(s => [s.id, s.nom]));

  const payees = inscrs.filter(i => i.statut_paiement === 'paye_ha' || i.statut_paiement === 'paye_cash');
  const enAttente = inscrs.filter(i => i.statut_paiement === 'en_attente').length;
  const refuses = inscrs.filter(i => i.statut_paiement === 'refuse').length;
  const rembourses = inscrs.filter(i => i.statut_paiement === 'rembourse').length;
  const invites = inscrs.filter(i => i.invite_nom).length;

  const placesPrises = payees.length;
  const placesRestantes = d.places_max ? Math.max(0, d.places_max - placesPrises) : null;
  const tauxRemplissage = d.places_max ? Math.min(1, placesPrises / d.places_max) : null;

  const repartitionStatut = { confirme: 0, draft: 0, sympathisant: 0, visiteur: 0 };
  const repartitionSection = {};
  for (const i of payees) {
    if (!i.membre_id) continue; // invité hors app : pas de statut/section à comptabiliser
    const st = i.membre?.statut;
    if (st && repartitionStatut[st] !== undefined) repartitionStatut[st]++;
    const sec = sectionById.get(i.membre?.section_id) || 'Sans section';
    repartitionSection[sec] = (repartitionSection[sec] || 0) + 1;
  }

  const parModePaiement = {
    paye_ha: inscrs.filter(i => i.statut_paiement === 'paye_ha').length,
    paye_cash: inscrs.filter(i => i.statut_paiement === 'paye_cash').length,
  };

  const montantCollecte = placesPrises * (d.prix_total || 0);

  // Équilibre financier — même calcul que l'aperçu carte (renderDeplCard) :
  // seul prix_bus sert à couvrir cout_bus, jamais prix_place.
  let equilibre = null;
  if (d.cout_bus && d.prix_bus) {
    const seuilPersonnes = d.cout_bus / d.prix_bus;
    const manque = Math.max(0, Math.ceil(seuilPersonnes) - placesPrises);
    const beneficeActuel = (placesPrises * d.prix_bus) - d.cout_bus;
    const beneficeSiComplet = d.places_max ? (d.places_max * d.prix_bus) - d.cout_bus : null;
    equilibre = {
      seuilPersonnes: Math.ceil(seuilPersonnes),
      seuilPrixParPlace: d.places_max ? d.cout_bus / d.places_max : null,
      manque,
      beneficeActuel,
      beneficeSiComplet,
    };
  }

  const presents = payees.filter(i => i.present_at).length;
  const matchPasse = !!d.date_match && d.date_match < new Date().toISOString().split('T')[0];

  return {
    adversaire: d.adversaire,
    placesMax: d.places_max,
    placesPrises,
    placesRestantes,
    tauxRemplissage,
    enAttente, refuses, rembourses, invites,
    totalInscriptions: inscrs.length,
    repartitionStatut, repartitionSection, parModePaiement,
    montantCollecte,
    prixTotal: d.prix_total,
    prixBus: d.prix_bus,
    coutBus: d.cout_bus,
    distanceKm: d.distance_km,
    equilibre,
    matchPasse,
    presents,
    absents: matchPasse ? Math.max(0, payees.length - presents) : null,
  };
}

async function getStatsMatos() {
  const [produitsRes, commandesRes] = await Promise.all([
    sb.from('produits').select('id, nom, prix, categorie, mode, section:sections(nom)'),
    sb.from('commandes')
      .select('id, statut, total, membre_id, created_at, commande_items(quantite, prix_unitaire, produit_id), membre:membres!commandes_membre_id_fkey(prenom, nom, pseudo_telegram)'),
  ]);
  if (produitsRes.error) throw produitsRes.error;
  if (commandesRes.error) throw commandesRes.error;
  const produits = produitsRes.data || [];
  const commandes = commandesRes.data || [];
  const produitById = new Map(produits.map(p => [p.id, p]));

  const STATUTS_PAYES = ['disponible', 'precommande_validee', 'distribue', 'prepare'];
  const payees = commandes.filter(c => STATUTS_PAYES.includes(c.statut));
  const parStatut = commandes.reduce((acc, c) => { acc[c.statut] = (acc[c.statut] || 0) + 1; return acc; }, {});

  const chiffreAffaires = payees.reduce((sum, c) => sum + (Number(c.total) || 0), 0);
  const panierMoyen = payees.length ? chiffreAffaires / payees.length : 0;

  const parProduit = new Map();
  for (const c of payees) {
    for (const item of (c.commande_items || [])) {
      const e = parProduit.get(item.produit_id) || { qte: 0, montant: 0 };
      e.qte += item.quantite || 0;
      e.montant += (item.quantite || 0) * (Number(item.prix_unitaire) || 0);
      parProduit.set(item.produit_id, e);
    }
  }
  const classementProduits = [...parProduit.entries()]
    .map(([id, v]) => ({ nom: produitById.get(id)?.nom || 'Article supprimé', qte: v.qte, montant: v.montant }))
    .sort((a, b) => b.qte - a.qte);

  const repartitionCategorie = {};
  for (const [id, v] of parProduit) {
    const cat = produitById.get(id)?.categorie || 'Sans catégorie';
    if (!repartitionCategorie[cat]) repartitionCategorie[cat] = { qte: 0, montant: 0 };
    repartitionCategorie[cat].qte += v.qte;
    repartitionCategorie[cat].montant += v.montant;
  }

  const repartitionMode = { stock: 0, precommande: 0 };
  for (const c of payees) {
    for (const item of (c.commande_items || [])) {
      const mode = produitById.get(item.produit_id)?.mode;
      if (repartitionMode[mode] !== undefined) repartitionMode[mode] += item.quantite || 0;
    }
  }

  const classementAcheteurs = _classementParMembre(payees, c => Number(c.total) || 0);
  const nbArticlesVendus = [...parProduit.values()].reduce((sum, v) => sum + v.qte, 0);
  const evolution = _evolutionMensuelleCumulee(payees, c => Number(c.total) || 0);

  return {
    totalProduits: produits.length,
    totalCommandes: commandes.length,
    totalPayees: payees.length,
    parStatut,
    chiffreAffaires,
    panierMoyen,
    nbArticlesVendus,
    classementProduits,
    repartitionCategorie,
    repartitionMode,
    classementAcheteurs: classementAcheteurs.slice(0, 10),
    nbAcheteursDistincts: classementAcheteurs.length,
    evolution,
  };
}

async function getStatsSticks() {
  const [sticksRes, distribRes] = await Promise.all([
    sb.from('sticks_catalogue').select('id, nom, prix, niveau_acces, section:sections(nom)'),
    sb.from('sticks_distribution')
      .select('id, statut, quantite, membre_id, stick_id, created_at, membre:membres!sticks_distribution_membre_id_fkey(prenom, nom, pseudo_telegram)'),
  ]);
  if (sticksRes.error) throw sticksRes.error;
  if (distribRes.error) throw distribRes.error;
  const sticks = sticksRes.data || [];
  const distribs = distribRes.data || [];
  const stickById = new Map(sticks.map(s => [s.id, s]));

  const STATUTS_PAYES = ['disponible', 'precommande_validee', 'distribue', 'prepare'];
  const payees = distribs.filter(d => STATUTS_PAYES.includes(d.statut));
  const parStatut = distribs.reduce((acc, d) => { acc[d.statut] = (acc[d.statut] || 0) + 1; return acc; }, {});

  const chiffreAffaires = payees.reduce((sum, d) => sum + (d.quantite || 0) * (stickById.get(d.stick_id)?.prix || 0), 0);
  const panierMoyen = payees.length ? chiffreAffaires / payees.length : 0;

  const parStick = new Map();
  for (const d of payees) parStick.set(d.stick_id, (parStick.get(d.stick_id) || 0) + (d.quantite || 0));
  const classementSticks = [...parStick.entries()]
    .map(([id, qte]) => ({ nom: stickById.get(id)?.nom || 'Stick supprimé', qte }))
    .sort((a, b) => b.qte - a.qte);

  const repartitionSection = {};
  const repartitionNiveauAcces = {};
  for (const d of payees) {
    const stick = stickById.get(d.stick_id);
    const sec = stick?.section?.nom || 'Sans section';
    const niv = stick?.niveau_acces || 'inconnu';
    repartitionSection[sec] = (repartitionSection[sec] || 0) + (d.quantite || 0);
    repartitionNiveauAcces[niv] = (repartitionNiveauAcces[niv] || 0) + (d.quantite || 0);
  }

  const classementAcheteurs = _classementParMembre(payees, d => (d.quantite || 0) * (stickById.get(d.stick_id)?.prix || 0));
  const evolution = _evolutionMensuelleCumulee(payees, d => (d.quantite || 0) * (stickById.get(d.stick_id)?.prix || 0));

  return {
    totalSticks: sticks.length,
    totalDistributions: distribs.length,
    totalPayees: payees.length,
    parStatut,
    chiffreAffaires,
    panierMoyen,
    classementSticks,
    repartitionSection,
    repartitionNiveauAcces,
    classementAcheteurs: classementAcheteurs.slice(0, 10),
    nbAcheteursDistincts: classementAcheteurs.length,
    evolution,
  };
}


async function getMaPresenceMatch(matchId) {
  const { data, error } = await sb.from('presences_matchs_domicile')
    .select('id').eq('match_id', matchId).eq('membre_id', currentUser.id).maybeSingle();
  if (error) throw error;
  return !!data;
}

async function declarerPresenceMatch(matchId) {
  const { error } = await sb.from('presences_matchs_domicile')
    .insert({ match_id: matchId, membre_id: currentUser.id });
  if (error) throw error;
  return { success: true };
}

async function annulerPresenceMatch(matchId) {
  const { error } = await sb.from('presences_matchs_domicile')
    .delete().eq('match_id', matchId).eq('membre_id', currentUser.id);
  if (error) throw error;
  return { success: true };
}

// ============================================================
// BOUTIQUE — MATOS
// ============================================================

async function getProduits() {
  const membre = currentMembre;
  if (!membre) return [];
  const statut = membre.statut;
  const sectionId = membre.section_id;
  const isAdminBureauCellule = isAdmin(membre) || isBureau(membre) || isCellule(membre);
  const voitBrouillon = hasCelluleMatos(membre);
  const { data, error } = await sb.from('produits')
    .select('*, section:sections(id, nom)')
    .eq('statut', 'disponible')
    .order('nom');
  if (error) throw error;
  return (data || []).filter(p => {
    // Précommande terminée = archivée (demande Remi 22/07/2026) : plus
    // visible dans le catalogue membre du tout, quel que soit le statut
    // ou visible_membres — seul l'onglet "Historique" de l'admin y donne
    // encore accès (cf. getProduitsHistoriqueMatos ci-dessous).
    if (p.mode === 'precommande' && p.precommande_fin && new Date(p.precommande_fin) < new Date()) return false;
    if (p.visible_membres === false && !voitBrouillon) return false;
    if (isAdminBureauCellule) return true;
    if (p.niveau_acces === 'tous') return true;
    const sectionEstUltraLutetia = p.section?.nom?.toLowerCase() === 'ultra lutetia';
    const memeSection = sectionEstUltraLutetia || (sectionId && p.section_id === sectionId);
    if (p.niveau_acces === 'draft_confirme') {
      return memeSection && (statut === 'draft' || statut === 'confirme');
    }
    if (p.niveau_acces === 'confirme') {
      return memeSection && statut === 'confirme';
    }
    return false;
  });
}

// Articles Matos dont la précommande est terminée — réservé à l'admin,
// pour l'onglet "Historique" (demande Remi 22/07/2026). Contrairement à
// getProduits(), aucun filtre de droits/visibilité : c'est un historique
// de référence, pas un catalogue d'achat.
async function getProduitsHistoriqueMatos() {
  const { data, error } = await sb.from('produits')
    .select('*, section:sections(id, nom)')
    .eq('mode', 'precommande')
    .not('precommande_fin', 'is', null)
    .lt('precommande_fin', new Date().toISOString())
    .order('precommande_fin', { ascending: false });
  if (error) throw error;
  return data || [];
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

async function passerCommande(produitId, taille, quantite = 1) {
  const produit = await getProduitById(produitId);
  if (!produit) throw new Error('Article introuvable');
  if (produit.mode === 'precommande') {
    throw new Error('Le paiement Cash n\'est pas disponible pour une précommande — utilise HelloAsso');
  }
  if (produit.quota_par_membre) {
    // Corrigé (22/07/2026, cas Brahim Bennais/Tour de Cou) : le quota
    // doit être compté PAR ARTICLE — avant, la requête ne filtrait pas
    // par produit_id et additionnait TOUTES les commandes payées du
    // membre, tous articles confondus, faisant dépasser à tort le quota
    // d'un article jamais acheté simplement parce qu'un AUTRE article
    // avait déjà été payé.
    const { data: dejaCommande } = await sb.from('commandes')
      .select('commande_items!inner(quantite, produit_id)')
      .eq('membre_id', currentUser.id)
      .eq('commande_items.produit_id', produitId)
      // Seules les commandes réellement PAYÉES comptent dans le quota
      // (règle Remi 21/07/2026) — 'en_attente' (cash pas encore
      // récupéré, ou HelloAsso jamais finalisé) ne doit jamais bloquer
      // un membre qui n'est pas allé au bout du paiement.
      .in('statut', ['disponible', 'precommande_validee', 'distribue', 'prepare']);
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

async function distribuerProduitAdmin(produitId, membreId, taille, quantite = 1) {
  const produit = await getProduitById(produitId);
  if (!produit) throw new Error('Article introuvable');
  if (produit.mode === 'precommande') {
    throw new Error('Le paiement Cash n\'est pas disponible pour une précommande — utilise HelloAsso');
  }
  if (produit.quota_par_membre) {
    // Même correctif que passerCommande ci-dessus (22/07/2026) : quota
    // scopé par produit_id, plus par la totalité des commandes du membre.
    const { data: dejaCommande } = await sb.from('commandes')
      .select('commande_items!inner(quantite, produit_id)')
      .eq('membre_id', membreId)
      .eq('commande_items.produit_id', produitId)
      // Seules les commandes réellement PAYÉES comptent dans le quota
      // (règle Remi 21/07/2026) — 'en_attente' (cash pas encore
      // récupéré, ou HelloAsso jamais finalisé) ne doit jamais bloquer
      // un membre qui n'est pas allé au bout du paiement.
      .in('statut', ['disponible', 'precommande_validee', 'distribue', 'prepare']);
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
async function demanderCommandeHelloAsso(produitId, taille, quantite = 1) {
  return appellerHelloAssoCheckout({ produitId, taille, quantite });
}

async function getMesCommandes() {
  const { data, error } = await sb.from('commandes')
    .select('*, commande_items(*, produit:produits(nom, photo_url, categorie, mode, precommande_livraison_estimee))')
    .eq('membre_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getAllCommandes() {
  const { data, error } = await sb.from('commandes')
    .select('*, membre:membres!commandes_membre_id_fkey(nom, prenom, pseudo_telegram), commande_items(*, produit:produits(nom, mode))')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return data || [];
}

async function updateCommandeStatut(commandeId, statut) {
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
  const { error } = await sb.from('commandes')
    .update({ statut })
    .eq('id', commandeId);
  if (error) throw error;
  return { success: true };
}

async function confirmerPaiementCashCommande(commandeId) {
  return updateCommandeStatut(commandeId, 'disponible');
}

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
  const isAdminBureauCellule = isAdmin(membre) || isBureau(membre) || isCellule(membre);
  const voitBrouillon = hasCelluleSticks(membre);
  const { data, error } = await sb.from('sticks_catalogue')
    .select('*, section:sections(id, nom)')
    .eq('statut', 'disponible')
    .order('nom');
  if (error) throw error;
  return (data || []).filter(s => {
    // Même règle que Matos ci-dessus (demande Remi 22/07/2026) : une
    // précommande terminée disparaît du catalogue membre, seul
    // l'historique admin y donne encore accès.
    if (s.mode === 'precommande' && s.precommande_fin && new Date(s.precommande_fin) < new Date()) return false;
    if (s.visible_membres === false && !voitBrouillon) return false;
    if (isAdminBureauCellule) return true;
    if (s.niveau_acces === 'tous') return true;
    const sectionEstUltraLutetia = s.section?.nom?.toLowerCase() === 'ultra lutetia';
    const memeSection = sectionEstUltraLutetia || (sectionId && s.section_id === sectionId);
    if (s.niveau_acces === 'draft_confirme') {
      return memeSection && (statut === 'draft' || statut === 'confirme');
    }
    if (s.niveau_acces === 'confirme') {
      return memeSection && statut === 'confirme';
    }
    return false;
  });
}

// Sticks dont la précommande est terminée — réservé à l'admin, pour
// l'onglet "Historique" (demande Remi 22/07/2026). Même principe que
// getProduitsHistoriqueMatos.
async function getSticksHistorique() {
  const { data, error } = await sb.from('sticks_catalogue')
    .select('*, section:sections(id, nom)')
    .eq('mode', 'precommande')
    .not('precommande_fin', 'is', null)
    .lt('precommande_fin', new Date().toISOString())
    .order('precommande_fin', { ascending: false });
  if (error) throw error;
  return data || [];
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
  if (!stick?.quota_par_membre) return null;
  const { data: distribs } = await sb.from('sticks_distribution')
    .select('quantite')
    .eq('stick_id', stickId)
    .eq('membre_id', currentUser.id);
  const total = (distribs || []).reduce((s, d) => s + (d.quantite || 0), 0);
  return { quota: stick.quota_par_membre, utilise: total, restant: stick.quota_par_membre - total };
}

async function demanderStickHelloAsso(stickId, quantite = 1) {
  return appellerHelloAssoCheckout({ stickId, quantite });
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

async function confirmerDistributionStick(distribId) {
  return validerPaiementStick(distribId);
}

async function getAllDistributions() {
  const { data, error } = await sb.from('sticks_distribution')
    .select('*, stick:sticks_catalogue(nom, categorie, prix, mode, lot), membre:membres!sticks_distribution_membre_id_fkey(nom, prenom, pseudo_telegram)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

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

async function updateDistribStatut(distribId, statut) {
  const { error } = await sb.from('sticks_distribution')
    .update({ statut })
    .eq('id', distribId);
  if (error) throw error;
  return { success: true };
}

async function validerPaiementStick(distribId) {
  const { data: distrib } = await sb.from('sticks_distribution')
    .select('stick_id, quantite, statut').eq('id', distribId).single();
  if (distrib && distrib.statut !== 'disponible' && distrib.statut !== 'prepare' && distrib.statut !== 'distribue') {
    throw new Error('Cette remise n\'est pas encore disponible (paiement non confirmé ou précommande non réceptionnée)');
  }
  const { error } = await sb.from('sticks_distribution')
    .update({ statut: 'distribue' })
    .eq('id', distribId);
  if (error) throw error;
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
// BOUTIQUE — CARTAGE
// ============================================================

async function getCartageCatalogue() {
  const membre = currentMembre;
  const voitLesBrouillons = membre && hasCelluleComite(membre);
  const { data, error } = await sb.from('cartage_catalogue')
    .select('*')
    .eq('statut', 'disponible')
    .order('prix');
  if (error) throw error;
  return voitLesBrouillons ? (data || []) : (data || []).filter(c => c.visible_membres !== false);
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

async function getMesPaiementsCartage() {
  const { data: paiements } = await sb.from('cartage_paiements')
    .select('*, cartage:cartage_catalogue(nom, prix)')
    .eq('membre_id', currentUser.id)
    .order('created_at', { ascending: false });
  return { paiements: paiements || [], aJour: !!currentMembre?.cotisation_a_jour };
}

async function demanderCartageHelloAsso(cartageId) {
  return appellerHelloAssoCheckout({ cartageId });
}

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

async function getAllCartagePaiements() {
  const { data, error } = await sb.from('membres')
    .select('id, nom, prenom, pseudo_telegram, email, statut, cotisation_a_jour, charte_signee, section:sections(nom), cartage_paiements!cartage_paiements_membre_id_fkey(statut, montant, mode_paiement, paye_at, cartage:cartage_catalogue(nom), created_at)')
    .order('nom');
  if (error) throw error;
  return (data || []).map(m => {
    const paiements = (m.cartage_paiements || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { ...m, dernierPaiementCartage: paiements[0] || null };
  });
}

// Version allégée de ce qui précède : juste le dernier paiement cartage
// par membre (membre_id -> paiement), pour enrichir une liste de membres
// déjà chargée par ailleurs (ex. Gérer les membres) sans refaire une
// requête complète select(*) sur membres.
async function getDerniersPaiementsCartageParMembre() {
  const { data, error } = await sb
    .from('cartage_paiements')
    .select('membre_id, statut, montant, mode_paiement, paye_at, created_at, cartage:cartage_catalogue(nom)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const map = {};
  (data || []).forEach(p => { if (!map[p.membre_id]) map[p.membre_id] = p; });
  return map;
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
  let fileToUpload = file;
  const MAX_SIZE_KB = 100;
  if (file.size > MAX_SIZE_KB * 1024) {
    try {
      fileToUpload = await compressImage(file, maxWidth, qualite);
      console.log(`Compression: ${Math.round(file.size/1024)}KB → ${Math.round(fileToUpload.size/1024)}KB`);
    } catch(e) {
      console.warn('Compression échouée, upload original:', e);
      fileToUpload = file;
    }
  }

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
  return uploadPhoto(file, 'matos', produitNom, 400, 0.80);
}

async function uploadPhotoStick(file, stickNom) {
  return uploadPhoto(file, 'sticks', stickNom, 400, 0.80);
}

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
// NOTIFICATIONS PUSH
// ============================================================

function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function notificationsPushSupportees() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

async function getStatutNotificationsPush() {
  if (!notificationsPushSupportees()) return 'non-supporte';
  if (Notification.permission === 'denied') return 'refuse';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'active' : 'inactif';
}

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
      userVisibleOnly: true,
      applicationServerKey: _urlBase64ToUint8Array(UL_CONFIG.VAPID_PUBLIC_KEY),
    });
  }
  const json = sub.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert({
    membre_id: currentUser.id,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  }, { onConflict: 'endpoint' });
  if (error) throw new Error('Impossible d\'enregistrer l\'abonnement: ' + error.message);
  return true;
}

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
  loginByTelegram, logout, changePassword, inscription, demanderResetMdp,
  verifierCodeInscription, renvoyerCodeInscription,
  getMembre, getAllMembres, updateMembre, updateStatutMembre, confirmerEmailMembre, getDernieresConnexionsParMembre,
  updateSectionMembre, toggleBlocageMembre,
  noterMembre, getEvaluationsMembre, getEvaluationsCourantesBatch, getHistoriqueEvaluation,
  getParticipationBatch,
  adminResetPassword, updateMembreMdp, supprimerMembre,
  getOrCreateQrCodeMembre, getMembreParQrCode, confirmerPresencesDeplacement, regenererQrCodeMembre,
  getSections,
  getCalendar, addMatch, updateMatch, getMatchs, deleteMatch,
  getClassementLigue1, syncClassementLigue1Manuel,
  saisirScoreMatch, confirmerDateMatch, rouvrirConfirmationMatch,
  getEvenements, getEvenement, saveEvenement, deleteEvenement,
  getCharteActive, signerCharte, getMembresNonSignataires, checkConformiteCharte, publierNouvelleCharte,
  getUpcomingSessions, getPastSessions, getSessionDetails, getCartageNonInscrits,
  inscrire, desinscrire, desinscrireMembreSession, validerPresence, savePizzaChoice,
  createSession, openSession, closeSession, deleteSession,
  updateSession, getSessionsWithStats, updateInscriptionStatut, getPizzaOrders,
  getDeplacements, getDeplacement, getStatutInscriptionDepl,
  getMonQuotaDepl, getMembresPourAmisDepl, relancerPaiementDeplacement, demanderInscriptionDeplacementHelloAsso,
  getMesAmis, getDemandesAmitieRecues, getDemandesAmitieEnvoyees, repondreDemandeAmitie, annulerDemandeAmitie,
  envoyerDemandeAmitie, rechercherMembrePourAmi,
  validerPaiementCash, validerPaiementHelloAsso, createDeplacement, updateDeplacement, getListeBusTelegram,
  annulerInscriptionDepl, annulerInscriptionDeplAdmin,
  getAnnonces, publierAnnonce,
  getMesCodesReabonnement, getStatutReabonnement, setReabonnementOuvert, rechercherCodeReabonnementAdmin, listerCodesReabonnementAdmin,
  genererLienConnexionAdmin,
  getStats, getMesStats, getStatsTifo, getSaisonsTifoDisponibles,
  getStatsDeplacements, getStatsDeplacement, getStatsMatos, getStatsSticks,
  getMaPresenceMatch, declarerPresenceMatch, annulerPresenceMatch,
  getProduits, getProduitById, createProduit, updateProduit, archiverProduit, getProduitsHistoriqueMatos,
  passerCommande, demanderCommandeHelloAsso, confirmerPaiementCashCommande, receptionnerCommande, marquerCommandePreparee, distribuerProduitAdmin,
  getMesCommandes, getAllCommandes, updateCommandeStatut,
  getSticks, getStickById, createStick, updateStick, getMonQuotaStick, getSticksHistorique,
  demanderStickHelloAsso, receptionnerStick, marquerStickPrepare, updateDistribStatut, getMesSticks,
  distribuerStickAdmin, getAllDistributions, validerPaiementStick, confirmerDistributionStick,
  getCartageCatalogue, getAllCartageCatalogue, createCartage, updateCartage, archiverCartage,
  getMesAchats,
  getMesPaiementsCartage, demanderCartageHelloAsso,
  validerCartageCash, validerCartageHelloAssoManuel, getAllCartagePaiements, getDerniersPaiementsCartageParMembre,
  uploadPhotoMatos, uploadPhotoStick, uploadPhotoCartage, updatePhotoMatos, updatePhotoStick,
  envoyerEmailValidation,
  notificationsPushSupportees, getStatutNotificationsPush,
  activerNotificationsPush, desactiverNotificationsPush,
  envoyerNotificationPush, envoyerNotificationPushGroupe,
  sb, getCurrentUser: () => currentUser, getCurrentMembre: () => currentMembre,
};

// ============================================================
// EMAIL — Brevo API
// ============================================================

// ── HISTORIQUE D'ACHATS ────────────────────────────────────────
// ⚠️ AJOUT 17/07/2026 (demande Remi — "Réf. HelloAsso" affichée ne
// correspond pas au numéro de commande visible sur le reçu HelloAsso) :
// chaque sous-requête sélectionne désormais aussi numero_commande_ha
// (capturé par helloasso-webhook à la confirmation du paiement, vérifié
// sur un vrai paiement le 17/07/2026 : data.order.id = numéro de commande
// réel). Champ ajouté dans l'objet achat final ; profil.js/loadHistorique
// l'utilise en priorité sur checkout_intent_id, avec repli automatique
// pour les paiements antérieurs à cet ajout (numero_commande_ha alors
// null pour ceux-là).
async function getMesAchats() {
  const uid = currentUser?.id;
  if (!uid) throw new Error('Non connecté');

  const results = { depl: [], matos: [], sticks: [], cartage: [] };

  try {
    const { data } = await sb.from('inscriptions_deplacement')
      .select('id, statut_paiement, created_at, checkout_intent_id, numero_commande_ha, deplacements(adversaire, ville, date_match, prix_total)')
      .eq('membre_id', uid)
      .order('created_at', { ascending: false });
    results.depl = data || [];
  } catch(e) { console.warn('getMesAchats: depl', e); }

  try {
    const { data } = await sb.from('commandes')
      .select('id, statut, total, created_at, checkout_intent_id, numero_commande_ha, commande_items(quantite, prix_unitaire, produits(nom))')
      .eq('membre_id', uid)
      .order('created_at', { ascending: false });
    results.matos = data || [];
  } catch(e) { console.warn('getMesAchats: matos', e); }

  try {
    const { data } = await sb.from('sticks_distribution')
      .select('id, statut, quantite, created_at, checkout_intent_id, numero_commande_ha, sticks_catalogue(nom, lot, prix)')
      .eq('membre_id', uid)
      .order('created_at', { ascending: false });
    results.sticks = data || [];
  } catch(e) { console.warn('getMesAchats: sticks', e); }

  try {
    const { data } = await sb.from('cartage_paiements')
      .select('id, statut, montant, created_at, checkout_intent_id, numero_commande_ha, cartage_catalogue(nom)')
      .eq('membre_id', uid)
      .order('created_at', { ascending: false });
    results.cartage = data || [];
  } catch(e) { console.warn('getMesAchats: cartage', e); }

  const achats = [];

  results.depl.forEach(d => achats.push({
    id: d.id, type: 'deplacement', emoji: '🚌',
    nom: d.deplacements ? `${d.deplacements.adversaire || '?'} — ${d.deplacements.ville || ''}`.trim() : 'Déplacement',
    date: d.created_at,
    montant: d.deplacements?.prix_total || null,
    statut: d.statut_paiement,
    checkout_intent_id: d.checkout_intent_id,
    numero_commande_ha: d.numero_commande_ha,
  }));

  results.matos.forEach(c => {
    const noms = (c.commande_items || []).map(i => `${i.produits?.nom || '?'} ×${i.quantite}`).join(', ');
    achats.push({
      id: c.id, type: 'matos', emoji: '🛍️',
      nom: noms || 'Commande matos',
      date: c.created_at,
      montant: c.total,
      statut: c.statut,
      checkout_intent_id: c.checkout_intent_id,
      numero_commande_ha: c.numero_commande_ha,
    });
  });

  results.sticks.forEach(d => achats.push({
    id: d.id, type: 'stick', emoji: '🎟️',
    nom: `${d.sticks_catalogue?.nom || 'Stick'} ×${d.quantite} lot${d.quantite > 1 ? 's' : ''}`,
    date: d.created_at,
    montant: d.sticks_catalogue?.prix ? d.sticks_catalogue.prix * d.quantite : null,
    statut: d.statut,
    checkout_intent_id: d.checkout_intent_id,
    numero_commande_ha: d.numero_commande_ha,
  }));

  results.cartage.forEach(p => achats.push({
    id: p.id, type: 'cartage', emoji: '🗂️',
    nom: p.cartage_catalogue?.nom || 'Cartage',
    date: p.created_at,
    montant: p.montant,
    statut: p.statut,
    checkout_intent_id: p.checkout_intent_id,
    numero_commande_ha: p.numero_commande_ha,
  }));

  achats.sort((a, b) => new Date(b.date) - new Date(a.date));
  return achats;
}

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
