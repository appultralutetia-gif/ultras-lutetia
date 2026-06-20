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
  if (!resp.ok) throw new Error(body.error || 'Identifiants incorrects');
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
    .select('*, section:sections(nom), membres_cellules(cellule_id, role, cellule:cellules(nom))')
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
    .select('*, section:sections(nom), membres_cellules(cellule:cellules(nom))')
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

// Évaluations
async function setEvaluation(membreId, celluleId, note, commentaire = '') {
  const { data, error } = await sb.from('evaluations').upsert({
    membre_id: membreId,
    cellule_id: celluleId,
    note,
    note_par: currentUser.id,
    commentaire,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'membre_id,cellule_id' });
  if (error) throw error;
  return data;
}

async function getEvaluations(membreId) {
  const { data } = await sb.from('evaluations')
    .select('*, cellule:cellules(nom)')
    .eq('membre_id', membreId);
  return data || [];
}

// ============================================================
// SECTIONS & CELLULES
// ============================================================

async function getSections() {
  const { data } = await sb.from('sections').select('*').eq('actif', true).order('nom');
  return data || [];
}

async function getCellules() {
  const { data } = await sb.from('cellules').select('*').eq('actif', true).order('nom');
  return data || [];
}

async function rattacherCellule(membreId, celluleId, role = 'membre') {
  const { error } = await sb.from('membres_cellules').upsert({
    membre_id: membreId,
    cellule_id: celluleId,
    role,
  }, { onConflict: 'membre_id,cellule_id' });
  if (error) throw error;
  // Mettre à jour le statut si pas encore membre_cellule
  const m = await getMembre(membreId);
  if (!['membre_cellule','bureau','admin'].includes(m.statut)) {
    await updateStatutMembre(membreId, 'membre_cellule');
  }
  return { success: true };
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

// ============================================================
// CHARTE
// ============================================================

async function getCharteActive() {
  const { data } = await sb.from('chartes')
    .select('*').eq('active', true).single();
  return data;
}

async function signerCharte(charteId) {
  const { error } = await sb.from('signatures_charte').insert({
    membre_id: currentUser.id,
    charte_id: charteId,
  });
  if (error && error.code !== '23505') throw error; // 23505 = duplicate, already signed
  // Mettre à jour le membre
  await updateMembre(currentUser.id, {
    charte_signee: true,
    charte_signee_at: new Date().toISOString()
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

// ============================================================
// SESSIONS TIFO
// ============================================================

async function getUpcomingSessions() {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await sb.from('sessions_tifo')
    .select('*')
    .gte('date', today)
    .in('statut', ['a_venir', 'en_cours'])
    .order('date');
  if (error) throw error;
  return data || [];
}

async function getPastSessions() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await sb.from('sessions_tifo')
    .select('*')
    .lt('date', today)
    .order('date', { ascending: false })
    .limit(20);
  return data || [];
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

async function validerPresence(sessionId, code) {
  const { data: session } = await sb.from('sessions_tifo')
    .select('code_validation').eq('id', sessionId).single();
  if (!session || session.code_validation !== code) throw new Error('Code incorrect');
  const { error } = await sb.from('inscriptions_session')
    .update({ statut: 'present', updated_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('membre_id', currentUser.id);
  if (error) throw error;
  return { success: true };
}

async function savePizzaChoice(sessionId, pizza) {
  const { error } = await sb.from('inscriptions_session')
    .update({ pizza, updated_at: new Date().toISOString() })
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

async function getProduits() {
  const membre = currentMembre;
  if (!membre) return [];

  const statut = membre.statut;
  const sectionId = membre.section_id;

  // Admin et Bureau voient tout
  const isAdminBureau = ['admin', 'bureau', 'membre_cellule'].includes(statut);
  const isConfirme = ['confirme', 'membre_cellule', 'bureau', 'admin'].includes(statut);

  // Récupérer tous les produits disponibles avec leur section
  const { data } = await sb.from('produits')
    .select('*, section:sections(id, nom)')
    .eq('statut', 'disponible')
    .order('nom');

  return (data || []).filter(p => {
    // Admin/Bureau voient tout
    if (isAdminBureau) return true;

    // Généraliste → tout le monde (Sympathisant inclus)
    if (p.niveau_acces === 'tous') return true;

    // Section spécifique :
    // ✅ Confirmé+ (toutes sections) OU Draft de la bonne section
    if (p.niveau_acces === 'section') {
      if (isConfirme) return true;
      // Draft : uniquement si dans la bonne section
      if (statut === 'draft' && sectionId && p.section_id === sectionId) return true;
      return false;
    }

    return false;
  });
}

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
  const isAdminBureau = ['admin', 'bureau', 'membre_cellule'].includes(statut);
  const isConfirme = ['confirme', 'membre_cellule', 'bureau', 'admin'].includes(statut);
  const { data } = await sb.from('produits')
    .select('*, section:sections(id, nom)')
    .eq('statut', 'disponible')
    .order('nom');
  return (data || []).filter(p => {
    if (isAdminBureau) return true;
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
  const isAdminBureau = ['admin', 'bureau', 'membre_cellule'].includes(statut);
  const isConfirme = ['confirme', 'membre_cellule', 'bureau', 'admin'].includes(statut);
  const { data } = await sb.from('sticks_catalogue')
    .select('*, section:sections(id, nom)')
    .eq('statut', 'disponible')
    .order('nom');
  return (data || []).filter(s => {
    if (isAdminBureau) return true;
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
  // Membres
  getMembre, getAllMembres, updateMembre, updateStatutMembre,
  updateSectionMembre, toggleBlocageMembre,
  noterMembre, getEvaluationsMembre, getHistoriqueEvaluation,
  adminResetPassword, updateMembreMdp, supprimerMembre, setEvaluation, getEvaluations,
  // Référentiels
  getSections, getCellules, rattacherCellule,
  // Calendrier
  getCalendar, addMatch, getMatchs, deleteMatch,
  // Charte
  getCharteActive, signerCharte, getMembresNonSignataires,
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
