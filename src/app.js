// ─── Helpers droits — roles_app[] ───────────────────────────
function hasRoleApp(membre, role) {
  return Array.isArray(membre?.roles_app) && membre.roles_app.includes(role);
}
function isAdmin(membre) {
  return hasRoleApp(membre, 'admin_app');
}
function isBureau(membre) {
  return isAdmin(membre) || hasRoleApp(membre, 'bureau_app');
}
function isCellule(membre) {
  if (!membre) return false;
  return ['admin_app','bureau_app','cellule_tifo','cellule_depl','cellule_matos','cellule_sticks','cellule_comite']
    .some(r => hasRoleApp(membre, r));
}
function hasCelluleTifo(membre)   { return isAdmin(membre) || isBureau(membre) || hasRoleApp(membre,'cellule_tifo'); }
function hasCelluleDepl(membre)   { return isAdmin(membre) || isBureau(membre) || hasRoleApp(membre,'cellule_depl'); }
function hasCelluleMatos(membre)  { return isAdmin(membre) || isBureau(membre) || hasRoleApp(membre,'cellule_matos'); }
function hasCelluleSticks(membre) { return isAdmin(membre) || isBureau(membre) || hasRoleApp(membre,'cellule_sticks'); }
function hasCelluleComite(membre) { return isAdmin(membre) || isBureau(membre) || hasRoleApp(membre,'cellule_comite'); }
function peutValiderInscriptions(membre) {
  return isAdmin(membre) || isBureau(membre) || hasCelluleComite(membre);
}

// ─── Confirmation inscription ─────────────────────────────────
function showConfirmInscription(sessionId) {
  currentSessionId = sessionId;
  const btn = document.getElementById('btnConfirmerInscription');
  if (btn) btn.setAttribute('data-session-id', sessionId);
  showModal('modalConfirmInscription');
}

// ─── State ───────────────────────────────────────────────────
let currentSessionId = null;
let currentDeplId = null;
let allMembres = [];


// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/ultras-lutetia/sw.js').catch(() => {});
  }

  // Gérer le token de confirmation email dans l'URL
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  if (tokenHash && type === 'email') {
    try {
      showLoading();
      const { error } = await UL.sb.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
      hideLoading();
      if (error) {
        showLoginPage();
        toast('Lien de confirmation invalide ou expiré', 'error');
        return;
      }
      // Nettoyer l'URL
      window.history.replaceState({}, '', window.location.pathname);
    } catch(e) {
      hideLoading();
      showLoginPage();
      return;
    }
  }

  const { membre } = await UL.initSession();
  membre ? showApp(membre) : showLoginPage();
});

// ─── Auth ────────────────────────────────────────────────────
function showLoginPage() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
}
function showLogin() {
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('inscriptionForm').style.display = 'none';
}
function showInscription() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('inscriptionForm').style.display = 'block';
}
async function doLogin() {
  const pseudo = document.getElementById('loginTelegram').value.trim();
  const pwd = document.getElementById('loginPassword').value;
  if (!pseudo || !pwd) return toast('Remplis tous les champs', 'error');
  try {
    showLoading();
    const { membre } = await UL.loginByTelegram(pseudo, pwd);
    hideLoading();
    showApp(membre);
  } catch(e) { hideLoading(); toast(e.message || 'Erreur de connexion', 'error'); }
}
async function doInscription() {
  const prenom = document.getElementById('regPrenom').value.trim();
  const nom = document.getElementById('regNom').value.trim();
  const pseudo = document.getElementById('regTelegram').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const ville = document.getElementById('regVille').value.trim();
  const codePostal = document.getElementById('regCodePostal').value.trim();
  const pwd = document.getElementById('regPassword').value;
  const rgpd = document.getElementById('regRgpd').checked;
  if (!prenom || !nom || !pseudo || !pwd || !email) return toast('Champs obligatoires manquants (email requis)', 'error');
  if (!email.includes('@')) return toast('Email invalide', 'error');
  if (pwd.length < 8) return toast('Mot de passe trop court (8 min)', 'error');
  if (!rgpd) return toast('Accepte les conditions RGPD', 'error');
  try {
    showLoading();
    await UL.inscription({ prenom, nom, pseudoTelegram: pseudo, email, ville, codePostal, password: pwd });
    hideLoading();
    toast('Compte créé ✅ — Un email de confirmation t\'a été envoyé. Vérifie ta boîte mail (et tes spams) avant de te connecter.', 'success', 8000);
    showLogin();
  } catch(e) { hideLoading(); toast(e.message || 'Erreur inscription', 'error'); }
}
async function doLogout() {
  try {
    await UL.logout();
  } catch(e) {
    console.error('Erreur déconnexion:', e);
  } finally {
    showLoginPage();
  }
}

// ─── App init + droits ────────────────────────────────────────
async function showApp(membre) {
  document.getElementById('loginPage').style.display = 'none';

  // Membre non encore validé par le bureau
  if (!membre.actif) {
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('loginPage').innerHTML = `
      <div style="text-align:center;padding:40px 24px;max-width:400px;margin:auto;">
        <img src="logo_ul.png" alt="Ultras Lutetia" style="width:80px;margin-bottom:24px;">
        <h2 style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:.05em;margin-bottom:16px;">Compte en attente</h2>
        <div class="info-box" style="text-align:left;margin-bottom:24px;">
          \u2705 Ton adresse email a bien \u00e9t\u00e9 confirm\u00e9e.<br><br>
          \u23f3 Ton compte est en cours de validation par le bureau des Ultras Lutetia. Tu recevras un email d\u00e8s que ton acc\u00e8s sera activ\u00e9.
        </div>
        <button class="btn btn-secondary" onclick="doLogout()">Se d\u00e9connecter</button>
      </div>`;
    return;
  }

  document.getElementById('appContainer').style.display = 'block';
  document.getElementById('headerUser').textContent = '@' + membre.pseudo_telegram;

  // Appliquer droits selon statut
  applyRights(membre);

  // Charte
  if (!membre.charte_signee) {
    document.getElementById('charteAlert').style.display = 'block';
    await loadCharte();
  }

  await loadAccueil();
}

function applyRights(membre) {
  // Boutons contextuels pages existantes
  if (hasCelluleTifo(membre)) document.getElementById('btnCreerSession').style.display = 'block';
  if (hasCelluleDepl(membre)) document.getElementById('btnCreerDepl').style.display = 'block';
  if (isBureau(membre)) document.getElementById('btnPublierAnnonce').style.display = 'block';
  if (peutValiderInscriptions(membre)) document.getElementById('demandesSection').style.display = 'block';

  // Onglet Admin
  if (isCellule(membre)) {
    document.getElementById('nav6').style.display = 'flex';
  }

  // Sections Admin page
  if (isBureau(membre)) {
    el('adminSectionMembres').style.display = 'block';
    el('adminSectionCalendrier').style.display = 'block';
  }
  if (hasCelluleDepl(membre))   el('adminSectionDepl').style.display = 'block';
  if (hasCelluleTifo(membre))   el('adminSectionSessions').style.display = 'block';
  if (hasCelluleMatos(membre))  el('adminSectionMatos').style.display = 'block';
  if (hasCelluleSticks(membre)) el('adminSectionSticks').style.display = 'block';
  if (isCellule(membre))        el('adminSectionStats').style.display = 'block';

  // Sections legacy Profil (rétrocompat)
  if (isBureau(membre)) {
    el('sectionAdmin').style.display = 'block';
    el('sectionStats').style.display = 'none';
  } else if (isCellule(membre)) {
    el('sectionStats').style.display = 'block';
  }
}
function el(id) { return document.getElementById(id); }

// peutValiderInscriptions défini dans les helpers droits

// ─── Navigation ───────────────────────────────────────────────
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById(pageId);
  if (pg) pg.classList.add('active');
  // Nav active
  const map = {
    pageAccueil:0, pageCalendrier:1, pageDeplacements:2,
    pageSessions:3, pageBoutique:4, pageProfil:5, pageAdmin:6,
    // pages secondaires → highlight parent
    pageMembres:6, pageStats:6, pageCharte:5, pageCartage:6, pageDemandesAdmin:6
  };
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const idx = map[pageId];
  if (idx !== undefined) {
    const navEl = document.getElementById('nav'+idx);
    if (navEl) navEl.classList.add('active');
  }
  // Lazy load
  if (pageId === 'pageCalendrier') loadCalendrier();
  if (pageId === 'pageSessions') loadSessions();
  if (pageId === 'pageDeplacements') loadDeplacements();
  if (pageId === 'pageBoutique') loadBoutique();
  if (pageId === 'pageProfil') loadProfil();
  if (pageId === 'pageMembres') loadMembres();
  if (pageId === 'pageStats') loadStats();
  if (pageId === 'pageCharte') loadCharte();
  if (pageId === 'pageCartage') loadCartage();
  if (pageId === 'pageDemandesAdmin') loadDemandesAdmin();
  // Scroll top
  window.scrollTo(0,0);
}

// ─── ACCUEIL ──────────────────────────────────────────────────
async function loadAccueil() {
  // Annonces
  try {
    const annonces = await UL.getAnnonces();
    document.getElementById('annoncesContainer').innerHTML = annonces.slice(0,2).map(a => `
      <div class="info-box ${a.categorie === 'urgent' ? '' : a.categorie === 'info' ? '' : 'success'}">
        <strong>${a.titre}</strong><br>
        <span style="font-size:13px;">${a.contenu}</span>
      </div>`).join('');
  } catch(e) {}
  // Sessions
  try {
    const sessions = await UL.getUpcomingSessions();
    const el = document.getElementById('sessionsAccueil');
    el.innerHTML = sessions.length
      ? sessions.slice(0,2).map(s => renderSessionCard(s, 'acc_')).join('')
      : '<p style="color:var(--gris);font-size:14px;">Aucune session à venir</p>';
    await refreshSessionsActions(sessions.slice(0,2), 'acc_');
  } catch(e) {}
  // Déplacement
  try {
    const depls = await UL.getDeplacements(true);
    const el = document.getElementById('deplAccueil');
    el.innerHTML = depls.length
      ? renderDeplCard(depls[0])
      : '<p style="color:var(--gris);font-size:14px;">Aucun déplacement à venir</p>';
  } catch(e) {}
  // Stats perso
  try {
    const stats = await UL.getMesStats();
    document.getElementById('mesStats').innerHTML = `
      <div class="stat-card"><div class="stat-value">${stats.sessionsPresent}</div><div class="stat-label">Présences</div></div>
      <div class="stat-card"><div class="stat-value">${stats.tauxPresence}%</div><div class="stat-label">Assiduité</div></div>
      <div class="stat-card"><div class="stat-value">${stats.deplacements}</div><div class="stat-label">Déplacements</div></div>
      <div class="stat-card"><div class="stat-value">${stats.sessionsInscrites}</div><div class="stat-label">Inscriptions</div></div>`;
  } catch(e) {}

  // Demandes en attente
  const m = UL.getCurrentMembre();
  if (peutValiderInscriptions(m)) {
    await loadDemandes();
  }
}

async function loadDemandes() {
  try {
    const tous = await UL.getAllMembres();
    const demandes = tous.filter(m => m.statut === 'sympathisant' && !m.actif);
    const badge = document.getElementById('demandesBadge');

    if (demandes.length > 0) {
      badge.textContent = demandes.length + ' en attente';
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }

    const el = document.getElementById('demandesListe');
    if (!demandes.length) {
      el.innerHTML = '<p style="color:var(--gris);font-size:13px;margin-bottom:16px;">Aucune demande en attente</p>';
      return;
    }

    el.innerHTML = demandes.map(m => `
      <div class="card" style="margin-bottom:8px;padding:14px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div class="avatar" style="width:38px;height:38px;font-size:14px;">${((m.prenom||'?')[0]+(m.nom||'?')[0]).toUpperCase()}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:15px;">${esc(m.prenom)} ${esc(m.nom)}</div>
            <div style="font-size:12px;color:var(--gris);">@${esc(m.pseudo_telegram)}</div>
            ${m.email ? `<div style="font-size:11px;color:var(--gris);">✉️ ${esc(m.email)}</div>` : ''}
            <div style="font-size:11px;color:var(--gris);">📅 ${new Date(m.created_at).toLocaleDateString('fr-FR')}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-secondary" onclick="validerDemande('${m.id}','sympathisant')">💙 Sympathisant</button>
          <button class="btn btn-sm btn-success" onclick="validerDemande('${m.id}','draft')">✅ Draft</button>
          <button class="btn btn-sm btn-primary" onclick="validerDemande('${m.id}','confirme')">⭐ Confirmé</button>
          <button class="btn btn-sm btn-danger" onclick="refuserDemande('${m.id}')">❌ Refuser</button>
        </div>
      </div>`).join('');
  } catch(e) { console.error('Erreur demandes:', e); }
}

async function validerDemande(membreId, nouveauStatut) {
  const label = nouveauStatut === 'draft' ? 'Draft' : nouveauStatut === 'sympathisant' ? 'Sympathisant' : 'Confirmé';
  try {
    const membre = await UL.updateMembre(membreId, { statut: nouveauStatut, actif: true });
    toast(`Membre accepté en tant que ${label} ✅`, 'success');
    if (membre && membre.email) {
      UL.envoyerEmailValidation(membre).catch(() => {});
    }
    await loadDemandes();
  } catch(e) { toast(e.message || 'Une erreur est survenue', 'error'); }
}

async function refuserDemande(membreId) {
  if (!confirm('Refuser et désactiver ce compte ?')) return;
  try {
    await UL.toggleBlocageMembre(membreId, false);
    toast('Demande refusée — compte désactivé', 'success');
    await loadDemandes();
  } catch(e) { toast(e.message || 'Une erreur est survenue', 'error'); }
}

// ═══════════════════════════════════════════════════════════════
// ─── SESSIONS ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// Pizzas et boissons
const PIZZAS = [
  { id: 'margherita',  label: 'Margherita',                    emoji: '🍕' },
  { id: 'regina',      label: 'Regina (Jambon Champignon)',     emoji: '🍕' },
  { id: '4fromages',   label: '4 Fromages',                    emoji: '🍕' },
  { id: 'bellissima',  label: 'Bellissima (Viande, Chorizo, Poivrons)', emoji: '🍕' },
  { id: 'aucune',      label: 'Je ne mange pas',               emoji: '🚫' },
];
const PINTES = [
  { id: 'blonde',   label: 'Blonde',  emoji: '🍺' },
  { id: 'brune',    label: 'Brune',   emoji: '🍺' },
  { id: 'sans',     label: 'Sans pinte', emoji: '❌' },
];

async function refreshSessionsActions(sessions, prefix='') {
  await Promise.all(sessions.map(s => loadSessionActions(s.id, null, prefix).catch(() => {})));
}

async function loadSessions() {
  document.getElementById('sessionsListe').innerHTML = '<div class="empty-state"><div>⏳</div>Chargement…</div>';
  try {
    const [sessions, past] = await Promise.all([
      UL.getUpcomingSessions(),
      UL.getPastSessions(),
    ]);
    document.getElementById('sessionsListe').innerHTML = sessions.length
      ? sessions.map(s => renderSessionCard(s)).join('')
      : '<div class="empty-state"><div>📋</div>Aucune session à venir</div>';
    document.getElementById('sessionsHistorique').innerHTML = past.length
      ? past.map(s => renderSessionCard(s)).join('')
      : '<div class="empty-state"><div>📋</div>Aucun historique</div>';
    await refreshSessionsActions(sessions);
  } catch(e) { toast('Erreur chargement sessions', 'error'); }
}

function renderSessionCard(s, prefix='') {
  const m = UL.getCurrentMembre();
  const date = new Date(s.date).toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' });
  const types = { Tracage:'🖊️', Assemblage:'🔧', Peinture:'🖌️' };
  const isOpen    = s.statut === 'en_cours';
  const isPlanned = s.statut === 'a_venir';
  const isTerminee = s.statut === 'terminee';

  const badge = `<span class="badge ${isOpen?'badge-vert':isPlanned?'badge-bleu':'badge-gris'}" style="flex-shrink:0;">
    ${isOpen ? '🟢 En cours' : isPlanned ? '🔵 À venir' : '⚫ Terminée'}
  </span>`;

  // Barre admin : ouvrir/fermer/supprimer + code si session ouverte
  const adminBar = hasCelluleTifo(m) ? `
    <div class="session-admin-bar">
      ${isPlanned ? `<button class="btn btn-sm btn-success" onclick="doOuvrirSession('${s.id}',event)">▶ Ouvrir</button>` : ''}
      ${isOpen    ? `<button class="btn btn-sm btn-danger"  onclick="doFermerSession('${s.id}',event)">⏹ Fermer</button>` : ''}
      ${isOpen && s.code_validation ? `<div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:.3em;color:var(--vert);padding:4px 10px;background:rgba(34,197,94,.12);border-radius:8px;">🔑 ${s.code_validation}</div>` : ''}
      <button class="btn btn-sm btn-secondary" onclick="voirInscrits('${s.id}','${esc(s.nom)}',event)">👥 Inscrits</button>
      ${s.avec_pizza ? `<button class="btn btn-sm btn-secondary" onclick="voirCommandesPizza('${s.id}','${esc(s.nom)}',event)">🍕 Commandes</button>` : ''}
      <button class="btn btn-sm btn-danger"   onclick="doSupprimerSession('${s.id}',event)">🗑</button>
    </div>` : '';

  return `<div class="session-card ${isOpen?'open':''}">
    <div style="display:flex;align-items:flex-start;gap:10px;">
      <div class="status-dot ${isOpen?'open':isPlanned?'planned':'closed'}" style="margin-top:5px;"></div>
      <div style="flex:1;min-width:0;">
        <div class="card-title">${types[s.type_session]||'📋'} ${esc(s.nom)}</div>
        <div class="card-sub">${date}${s.heure?' · '+s.heure.slice(0,5):''} · ${esc(s.lieu)}</div>
        ${s.avec_pizza ? '<div style="font-size:11px;color:var(--pizza);margin-top:4px;">🍕 Session pizza</div>' : ''}
        ${s.capacite_max ? `<div style="font-size:11px;color:var(--gris);margin-top:2px;">👥 ${s._nb_inscrits||0} / ${s.capacite_max} places</div>` : ''}
      </div>
      ${badge}
    </div>

    <!-- Zone actions membre -->
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);" id="sessionActions_${prefix}${s.id}">
      <div style="text-align:center;padding:8px;color:var(--gris);font-size:13px;">⏳</div>
    </div>

    <!-- Participants (visible par tous) -->
    <div style="margin-top:8px;">
      <button class="btn btn-secondary" style="width:100%;padding:8px;" onclick="toggleParticipants('${prefix}${s.id}', event)">
        👥 Voir les participants
      </button>
      <div id="participants_${prefix}${s.id}" style="display:none;margin-top:8px;"></div>
    </div>

    ${adminBar}
  </div>`;
}

async function loadSessionActions(sessionId, btn, prefix='') {
  const originalText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    const { session: s, monInscrit } = await UL.getSessionDetails(sessionId);
    const estInscrit  = !!monInscrit;
    const estPresent  = monInscrit?.statut === 'present';
    const isOpen      = s.statut === 'en_cours';
    const isPlanned   = s.statut === 'a_venir';
    const el          = document.getElementById('sessionActions_' + prefix + sessionId);
    let html = '';

    if (!estInscrit && isPlanned) {
      html = `<button class="btn btn-primary" style="width:100%;" onclick="showConfirmInscription('${s.id}')">
        S'inscrire${s.avec_pizza?' 🍕':''}</button>`;

    } else if (estInscrit && isPlanned) {
      html = `<div class="info-box" style="text-align:center;margin:0;">✅ Tu es inscrit(e)</div>`;
      if (s.lien_telegram) html += `
        <a href="${esc(s.lien_telegram)}" target="_blank" style="display:block;margin-top:8px;">
          <button class="btn btn-secondary" style="width:100%;">📲 Groupe Telegram</button>
        </a>`;

    } else if (estInscrit && isOpen && !estPresent) {
      html = `<button class="btn btn-success" style="width:100%;"
        onclick="ouvrirModalPresence('${s.id}', ${s.avec_pizza})">
        ✅ Confirmer ma présence</button>`;
      if (s.lien_telegram) html += `
        <a href="${esc(s.lien_telegram)}" target="_blank" style="display:block;margin-top:8px;">
          <button class="btn btn-secondary" style="width:100%;">📲 Groupe Telegram</button>
        </a>`;

    } else if (estPresent) {
      html = `<div class="info-box success" style="text-align:center;margin:0;">✅ Présence validée</div>`;
      if (s.lien_telegram) html += `
        <a href="${esc(s.lien_telegram)}" target="_blank" style="display:block;margin-top:8px;">
          <button class="btn btn-secondary" style="width:100%;">📲 Groupe Telegram</button>
        </a>`;

    } else if (s.statut === 'terminee') {
      html = `<div style="text-align:center;font-size:13px;color:var(--gris);">Session terminée</div>`;
    }

    if (el) {
      el.innerHTML = html || `<div style="font-size:13px;color:var(--gris);text-align:center;">Aucune action disponible</div>`;
    } else if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    } else {
      // DOM pas encore prêt — réessayer dans 300ms
      setTimeout(() => {
        const el2 = document.getElementById('sessionActions_' + prefix + sessionId);
        if (el2) el2.innerHTML = html || '';
      }, 300);
    }
  } catch(e) {
    console.error('loadSessionActions erreur:', sessionId, e);
    if (btn) { btn.disabled = false; btn.textContent = originalText || "S'inscrire"; }
    // Fallback : remettre un bouton cliquable si appel silencieux
    if (!btn) {
      const elErr = document.getElementById('sessionActions_' + prefix + sessionId);
      if (elErr) elErr.innerHTML = `<button class="btn btn-primary" style="width:100%;padding:8px;" onclick="loadSessionActions('${sessionId}', this)">S'inscrire</button>`;
    }
  }
}

// ── Modal présence (enrichi pizza + pinte) ─────────────────────
function ouvrirModalPresence(sessionId, avecPizza) {
  currentSessionId = sessionId;
  const modal = document.getElementById('modalPresence');

  // Construire le contenu dynamiquement selon avecPizza
  let pizzaHtml = '';
  if (avecPizza) {
    pizzaHtml = `
      <div class="form-group" style="margin-top:16px;">
        <label style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94A3B8;display:block;margin-bottom:10px;">Choix pizza</label>
        <div style="display:flex;flex-direction:column;gap:8px;" id="pizzaChoixContainer">
          ${PIZZAS.map(p => `
            <div onclick="selectPizza('${p.id}',this)" data-pizza="${p.id}"
              style="display:flex;align-items:center;gap:12px;padding:11px 14px;
                     background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.12);
                     border-radius:9px;cursor:pointer;transition:all .15s;">
              <span style="font-size:20px;">${p.emoji}</span>
              <span style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:.03em;color:#94A3B8;">${p.label}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="form-group" style="margin-top:16px;">
        <label style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94A3B8;display:block;margin-bottom:10px;">Pinte ?</label>
        <div style="display:flex;gap:8px;" id="pinteChoixContainer">
          ${PINTES.map(p => `
            <div onclick="selectPinte('${p.id}',this)" data-pinte="${p.id}"
              style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px 8px;
                     background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.12);
                     border-radius:9px;cursor:pointer;transition:all .15s;text-align:center;">
              <span style="font-size:18px;">${p.emoji}</span>
              <span style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;text-transform:uppercase;color:#94A3B8;">${p.label}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  document.getElementById('modalPresenceBody').innerHTML = `
    <p style="color:var(--gris);font-size:14px;margin-bottom:16px;">Entre le code 4 chiffres affiché par le responsable.</p>
    <div class="form-group">
      <input type="number" id="codePresence" placeholder="_ _ _ _" maxlength="4" inputmode="numeric"
        style="font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:.3em;text-align:center;">
    </div>
    ${pizzaHtml}
    <button class="btn btn-primary" style="margin-top:16px;" onclick="doValiderPresence(${avecPizza})">Valider</button>`;

  showModal('modalPresence');
}

function selectPizza(id, rowEl) {
  document.querySelectorAll('#pizzaChoixContainer [data-pizza]').forEach(el => {
    el.removeAttribute('data-selected');
    el.style.background = 'rgba(255,255,255,.07)';
    el.style.borderColor = 'rgba(255,255,255,.12)';
    el.querySelector('span:last-child').style.color = '#94A3B8';
  });
  rowEl.setAttribute('data-selected', '1');
  rowEl.style.background = 'rgba(26,86,219,.18)';
  rowEl.style.borderColor = '#1A56DB';
  rowEl.querySelector('span:last-child').style.color = '#E2E8F0';
}

function selectPinte(id, rowEl) {
  document.querySelectorAll('#pinteChoixContainer [data-pinte]').forEach(el => {
    el.removeAttribute('data-selected');
    el.style.background = 'rgba(255,255,255,.07)';
    el.style.borderColor = 'rgba(255,255,255,.12)';
    el.querySelector('span:last-child').style.color = '#94A3B8';
  });
  rowEl.setAttribute('data-selected', '1');
  rowEl.style.background = 'rgba(26,86,219,.18)';
  rowEl.style.borderColor = '#1A56DB';
  rowEl.querySelector('span:last-child').style.color = '#E2E8F0';
}

async function doValiderPresence(avecPizza = false) {
  const code = document.getElementById('codePresence').value;
  if (!code || code.length !== 4) return toast('Code à 4 chiffres requis', 'error');

  let pizza = null, pinte = null;
  if (avecPizza) {
    const pizzaEl = document.querySelector('#pizzaChoixContainer [data-pizza][data-selected]');
    const pinteEl = document.querySelector('#pinteChoixContainer [data-pinte][data-selected]');
    if (!pizzaEl) return toast('Choisis une pizza (ou "Je ne mange pas")', 'error');
    if (!pinteEl) return toast('Choisis une option pinte', 'error');
    pizza = pizzaEl.dataset.pizza;
    pinte = pinteEl.dataset.pinte;
  }

  try {
    await UL.validerPresence(currentSessionId, code, pizza, pinte);
    toast('Présence validée ! ✅', 'success');
    closeModal('modalPresence');
    loadSessions();
    loadAccueil();
  } catch(e) { toast(e.message || 'Code incorrect', 'error'); }
}

// ── Inscrire / désinscrire ────────────────────────────────────
async function doInscrire(id, btn) {
  if (!id && btn) id = btn.getAttribute('data-session-id');
  if (!id) id = currentSessionId;
  if (!id) return toast('Erreur : session introuvable', 'error');
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    await UL.inscrire(id);
    toast('Inscription confirmée ✅', 'success');
    closeModal('modalConfirmInscription');
    // Mettre à jour uniquement la zone actions de cette session sans recharger toute la liste
    // Rafraîchir silencieusement la zone actions (sans passer de bouton)
    await loadSessionActions(id, null);
    loadAccueil();
  } catch(e) {
    toast(e.message || 'Impossible de s\'inscrire', 'error');
    if (btn) { btn.disabled = false; btn.textContent = "S'inscrire"; }
  }
}
async function doDesinscrire(id) {
  try { await UL.desinscrire(id); toast('Désinscription effectuée', 'success'); loadSessions(); }
  catch(e) { toast(e.message || 'Impossible de se désinscrire', 'error'); }
}

// ── Admin : ouvrir / fermer / supprimer ──────────────────────
async function doOuvrirSession(id, e) {
  if (e) e.stopPropagation();
  try {
    const { code } = await UL.openSession(id);
    toast('Session ouverte ! Code : ' + code, 'success');
    loadSessions();
  } catch(e) { toast(e.message || 'Impossible d\'ouvrir la session', 'error'); }
}
async function doFermerSession(id, e) {
  if (e) e.stopPropagation();
  if (!confirm('Fermer cette session ?')) return;
  try { await UL.closeSession(id); toast('Session fermée', 'success'); loadSessions(); }
  catch(e) { toast('Impossible d\'ouvrir la session', 'error'); }
}
async function doSupprimerSession(id, e) {
  if (e) e.stopPropagation();
  if (!confirm('Supprimer définitivement ?')) return;
  try { await UL.deleteSession(id); toast('Session supprimée', 'success'); loadSessions(); }
  catch(e) { toast('Impossible de fermer la session', 'error'); }
}

// ── Admin : voir inscrits ────────────────────────────────────
async function voirInscrits(id, nom, e) {
  if (e) e.stopPropagation();
  const m = UL.getCurrentMembre();
  try {
    const { inscrits } = await UL.getSessionDetails(id);
    const presents = inscrits.filter(i => i.statut === 'present');
    const statutLabel = { inscrit:'📋 Inscrit', present:'✅ Présent', absent:'❌ Absent' };
    document.getElementById('modalAdminSessionContent').innerHTML = `
      <h3 class="modal-title">👥 ${esc(nom)}</h3>
      <div style="font-size:13px;color:var(--gris);margin-bottom:12px;">✅ ${presents.length} présents · Total: ${inscrits.length}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
        <button class="btn btn-sm btn-secondary" onclick="copierInscrits(${JSON.stringify(inscrits.map(i=>i.membre?.pseudo_telegram||'?'))})">📋 Liste Telegram</button>
        <button class="btn btn-sm btn-secondary" onclick="copierListeComplete(${JSON.stringify(inscrits.map(i=>({pseudo:i.membre?.pseudo_telegram||'?',prenom:i.membre?.prenom||'',nom:i.membre?.nom||'',statut:i.membre?.statut||'',section:i.membre?.section?.nom||'',presence:i.statut})))})">📄 Liste complète</button>
      </div>
      ${inscrits.map(i => `
        <div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border);">
          <div class="avatar" style="width:30px;height:30px;font-size:11px;flex-shrink:0;">${(i.membre?.prenom||'?')[0]}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;">@${esc(i.membre?.pseudo_telegram||'?')}</div>
            <div style="font-size:11px;color:var(--gris);">${esc(i.membre?.prenom||'')} ${esc(i.membre?.nom||'')}${i.membre?.section?.nom?' · '+esc(i.membre.section.nom):''}</div>
          </div>
          <span class="badge ${i.statut==='present'?'badge-vert':i.statut==='absent'?'badge-rouge':'badge-bleu'}" style="font-size:10px;flex-shrink:0;">${statutLabel[i.statut]||i.statut}</span>
          ${hasCelluleTifo(m)?`<button class="btn btn-sm btn-danger" style="padding:4px 8px;font-size:11px;" onclick="doDesinscrireAdmin('${id}','${i.membre_id}','${esc(nom)}')">✕</button>`:''}
        </div>`).join('')}`;
    showModal('modalAdminSession');
  } catch(e) { toast('Impossible de supprimer la session', 'error'); }
}

async function doDesinscrireAdmin(sessionId, membreId, nom) {
  if (!confirm('Désinscrire ce membre ?')) return;
  try {
    await UL.desinscrireMembreSession(sessionId, membreId);
    toast('Membre désinscrit ✅', 'success');
    voirInscrits(sessionId, nom, null);
    loadAdminSessions();
  } catch(e) { toast('Impossible de charger les inscrits', 'error'); }
}

// ── Admin : commandes pizza ───────────────────────────────────
async function voirCommandesPizza(sessionId, nom, e) {
  if (e) e.stopPropagation();
  try {
    const { inscrits } = await UL.getSessionDetails(sessionId);
    const presents = inscrits.filter(i => i.statut === 'present');

    // Grouper par pizza
    const pizzaMap = {};
    const pinteMap = {};
    presents.forEach(i => {
      const pz = i.pizza || 'aucune';
      const pt = i.pinte || 'sans';
      if (!pizzaMap[pz]) pizzaMap[pz] = [];
      if (!pinteMap[pt]) pinteMap[pt] = [];
      pizzaMap[pz].push(i.membre?.prenom || i.membre?.pseudo_telegram || '?');
      pinteMap[pt].push(i.membre?.prenom || i.membre?.pseudo_telegram || '?');
    });

    const pizzaLabel = { margherita:'Margherita', regina:'Regina', '4fromages':'4 Fromages', bellissima:'Bellissima', aucune:'Je ne mange pas' };
    const pinteLabel = { blonde:'Blonde', brune:'Brune', sans:'Sans pinte' };

    const pizzaHtml = Object.entries(pizzaMap)
      .filter(([k]) => k !== 'aucune' || pizzaMap[k].length)
      .map(([k, noms]) => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border);">
          <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:15px;">
            🍕 ${pizzaLabel[k]||k} <span style="color:var(--bleu-clair);">×${noms.length}</span>
          </div>
          <div style="font-size:12px;color:var(--gris);margin-top:3px;">(${noms.join(', ')})</div>
        </div>`).join('');

    const pinteHtml = Object.entries(pinteMap)
      .filter(([k]) => k !== 'sans' || pinteMap[k].length)
      .map(([k, noms]) => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border);">
          <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:15px;">
            🍺 ${pinteLabel[k]||k} <span style="color:var(--bleu-clair);">×${noms.length}</span>
          </div>
          <div style="font-size:12px;color:var(--gris);margin-top:3px;">(${noms.join(', ')})</div>
        </div>`).join('');

    const texteCopie = [
      '🍕 PIZZAS',
      ...Object.entries(pizzaMap).map(([k,noms]) => `${pizzaLabel[k]||k} ×${noms.length} : ${noms.join(', ')}`),
      '',
      '🍺 PINTES',
      ...Object.entries(pinteMap).filter(([k]) => k !== 'sans').map(([k,noms]) => `${pinteLabel[k]||k} ×${noms.length} : ${noms.join(', ')}`),
    ].join('\n');

    document.getElementById('modalAdminSessionContent').innerHTML = `
      <h3 class="modal-title">🍕 Commandes — ${esc(nom)}</h3>
      <div style="font-size:13px;color:var(--gris);margin-bottom:12px;">${presents.length} présent${presents.length>1?'s':''}</div>
      <button class="btn btn-sm btn-secondary" style="margin-bottom:16px;" onclick="navigator.clipboard.writeText(${JSON.stringify(texteCopie)}).then(()=>toast('Copié !','success'))">📋 Copier la liste</button>
      <div class="section-title" style="margin-bottom:8px;">Pizzas</div>
      ${pizzaHtml || '<p style="color:var(--gris);font-size:13px;">Aucune commande</p>'}
      <div class="section-title" style="margin-top:16px;margin-bottom:8px;">Pintes</div>
      ${pinteHtml || '<p style="color:var(--gris);font-size:13px;">Aucune pinte</p>'}`;
    showModal('modalAdminSession');
  } catch(e) { toast('Impossible de charger les commandes pizza', 'error'); }
}

// ── Participants (visible par tous) ──────────────────────────
async function toggleParticipants(sessionId, e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const el = document.getElementById('participants_' + sessionId);
  if (!el) return;
  if (el.style.display !== 'none') {
    el.style.display = 'none';
    btn.textContent = '👥 Voir les participants';
    return;
  }
  btn.textContent = '⏳ Chargement…';
  btn.disabled = true;
  // Retirer le prefix acc_ pour l'appel Supabase
  const realId = sessionId.replace(/^acc_/, '');
  try {
    const { inscrits } = await UL.getSessionDetails(realId);
    const statutEmoji = { inscrit:'📋', present:'✅', absent:'❌' };
    el.innerHTML = inscrits.length
      ? inscrits.map(i => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;">@${esc(i.membre?.pseudo_telegram||'?')}</div>
              <div style="color:var(--gris);font-size:11px;">${esc(i.membre?.prenom||'')} ${esc(i.membre?.nom||'')}</div>
            </div>
            <span class="badge ${i.statut==='present'?'badge-vert':i.statut==='absent'?'badge-rouge':'badge-bleu'}" style="font-size:10px;">
              ${statutEmoji[i.statut]||''} ${i.statut==='present'?'Présent':i.statut==='absent'?'Absent':'Inscrit'}
            </span>
          </div>`).join('')
      : '<div style="font-size:13px;color:var(--gris);text-align:center;padding:8px 0;">Aucun participant</div>';
    el.style.display = 'block';
    btn.textContent = '👥 Masquer les participants';
  } catch(err) {
    toast('Impossible de charger les participants', 'error');
    btn.textContent = '👥 Voir les participants';
  }
  btn.disabled = false;
}

// ── Copie listes ─────────────────────────────────────────────
function copierInscrits(pseudos) {
  const texte = pseudos.map((p,i) => `${i+1}. @${p}`).join('\n');
  navigator.clipboard.writeText(texte).then(() => toast('Liste Telegram copiée !', 'success'));
}
function copierListeComplete(membres) {
  const entete = 'Pseudo | Prénom Nom | Statut | Section | Présence';
  const lignes = membres.map(m => `@${m.pseudo} | ${m.prenom} ${m.nom} | ${m.statut} | ${m.section||'—'} | ${m.presence}`);
  navigator.clipboard.writeText([entete,...lignes].join('\n')).then(() => toast(`Liste copiée (${membres.length}) !`, 'success'));
}

// ── Créer / Modifier session ──────────────────────────────────
async function doCreerSession() {
  const data = {
    nom: document.getElementById('sNom').value.trim(),
    date: document.getElementById('sDate').value,
    heure: document.getElementById('sHeure').value || null,
    lieu: document.getElementById('sLieu').value,
    type_session: document.getElementById('sType').value,
    capacite_max: parseInt(document.getElementById('sCapacite').value) || null,
    lien_telegram: document.getElementById('sTelegram').value || null,
    avec_pizza: document.getElementById('sPizza').checked,
    description: document.getElementById('sDesc').value.trim() || null,
  };
  if (!data.nom || !data.date) return toast('Nom et date requis', 'error');
  try {
    await UL.createSession(data);
    toast('Session créée ✅', 'success');
    closeModal('modalCreerSession');
    loadSessions();
  } catch(e) { toast(e.message, 'error'); }
}

async function ouvrirModifierSession() {
  try {
    const sessions = await UL.getSessionsWithStats();
    const sel = document.getElementById('msSelectSession');
    sel.innerHTML = '<option value="">-- Sélectionner --</option>' +
      sessions.map(s => {
        const d = new Date(s.date).toLocaleDateString('fr-FR', {day:'numeric', month:'short'});
        return `<option value="${s.id}">${esc(s.nom)} — ${d}</option>`;
      }).join('');
    document.getElementById('msFormFields').style.display = 'none';
    showModal('modalModifierSession');
  } catch(e) { toast('Erreur chargement sessions', 'error'); }
}

async function chargerSessionAModifier(id) {
  if (!id) { document.getElementById('msFormFields').style.display = 'none'; return; }
  try {
    const { session: s } = await UL.getSessionDetails(id);
    document.getElementById('msNom').value = s.nom || '';
    document.getElementById('msDate').value = s.date || '';
    document.getElementById('msHeure').value = s.heure ? s.heure.slice(0,5) : '';
    document.getElementById('msLieu').value = s.lieu || 'Paris Sud';
    document.getElementById('msType').value = s.type_session || 'Peinture';
    document.getElementById('msCapacite').value = s.capacite_max || '';
    document.getElementById('msTelegram').value = s.lien_telegram || '';
    document.getElementById('msPizza').checked = !!s.avec_pizza;
    document.getElementById('msDesc').value = s.description || '';
    document.getElementById('msFormFields').style.display = 'block';
  } catch(e) { toast('Erreur chargement session', 'error'); }
}

async function doModifierSession() {
  const id = document.getElementById('msSelectSession').value;
  if (!id) return toast('Sélectionne une session', 'error');
  const data = {
    nom: document.getElementById('msNom').value.trim(),
    date: document.getElementById('msDate').value,
    heure: document.getElementById('msHeure').value || null,
    lieu: document.getElementById('msLieu').value,
    type_session: document.getElementById('msType').value,
    capacite_max: parseInt(document.getElementById('msCapacite').value) || null,
    lien_telegram: document.getElementById('msTelegram').value || null,
    avec_pizza: document.getElementById('msPizza').checked,
    description: document.getElementById('msDesc').value.trim() || null,
  };
  if (!data.nom || !data.date) return toast('Nom et date requis', 'error');
  try {
    await UL.updateSession(id, data);
    toast('Session modifiée ✅', 'success');
    closeModal('modalModifierSession');
    loadSessions();
    loadAdminSessions();
  } catch(e) { toast(e.message || 'Erreur modification', 'error'); }
}

function loadAdminSessions() {
  if (document.getElementById('pageSessions')?.classList.contains('active')) loadSessions();
}

// ─── DÉPLACEMENTS ─────────────────────────────────────────────
async function loadDeplacements() {
  document.getElementById('deplacementsListe').innerHTML = '<div class="empty-state"><div>⏳</div>Chargement…</div>';
  try {
    const depls = await UL.getDeplacements(true);
    document.getElementById('deplacementsListe').innerHTML = depls.length
      ? depls.map(d => renderDeplCard(d)).join('')
      : '<div class="empty-state"><div>✈️</div>Aucun déplacement à venir</div>';
  } catch(e) { toast('Erreur chargement déplacements', 'error'); }
}

function renderDeplCard(d) {
  const m = UL.getCurrentMembre();
  const date = d.date_match ? new Date(d.date_match).toLocaleDateString('fr-FR', {weekday:'short', day:'numeric', month:'short'}) : '';
  const pct = d.places_max ? Math.min(100, Math.round(((d._inscrits||0)/d.places_max)*100)) : 0;

  // Barre de places + boutons admin bus
  const adminBar = hasCelluleDepl(m) ? `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
      <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();voirInscritsDepl('${d.id}')">👥 Inscrits</button>
      <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();copierListeBus('${d.id}')">📋 Liste bus</button>
    </div>` : '';

  return `<div class="depl-card" onclick="openDepl('${d.id}')">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
      <div style="flex:1;min-width:0;">
        <div class="depl-match">Paris FC — ${esc(d.adversaire || d.match?.equipe_exterieur || '?')}</div>
        <div class="depl-infos">
          ${date ? `<span>📅 ${date}</span>` : ''}
          ${d.stade||d.match?.stade ? `<span>📍 ${d.stade||d.match?.stade}</span>` : ''}
          ${d.prix_total ? `<span>💶 ${d.prix_total}€</span>` : ''}
          ${d.places_max ? `<span>🪑 ${d.places_max} places</span>` : ''}
        </div>
      </div>
      <span class="badge ${d.statut==='ouvert'?'badge-vert':d.statut==='complet'?'badge-rouge':'badge-gris'}" style="flex-shrink:0;margin-top:2px;">
        ${d.statut==='ouvert'?'Ouvert':d.statut==='complet'?'Complet':d.statut==='ferme'?'Fermé':'Annulé'}
      </span>
    </div>
    ${d.places_max ? `
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
      <div class="places-bar" style="flex:1;"><div class="places-fill" style="width:${pct}%"></div></div>
      <span style="font-size:11px;color:var(--gris);flex-shrink:0;">${d._inscrits||0}/${d.places_max}</span>
    </div>` : ''}
    ${adminBar}
  </div>`;
}

async function openDepl(deplId) {
  currentDeplId = deplId;
  const m = UL.getCurrentMembre();
  try {
    const { deplacement: d, inscrits, monInscrit, nbInscrits } = await UL.getDeplacement(deplId);
    const estInscrit = !!monInscrit;
    const estPaye = monInscrit && monInscrit.statut_paiement !== 'en_attente';
    const date = d.date_match ? new Date(d.date_match).toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'}) : '';
    let html = `
      <h3 class="modal-title">Paris FC — ${esc(d.adversaire||d.match?.equipe_exterieur||'?')}</h3>
      <div style="color:var(--gris);font-size:14px;margin-bottom:16px;line-height:2.2;">
        ${date ? `📅 ${date}<br>` : ''}
        ${d.stade||d.match?.stade ? `🏟️ ${d.stade||d.match?.stade}<br>` : ''}
        ${d.ville ? `📍 ${d.ville}<br>` : ''}
        ${d.point_rdv ? `🚌 RDV: ${d.point_rdv}<br>` : ''}
        ${d.heure_depart ? `⏰ Départ: ${d.heure_depart}<br>` : ''}
        ${d.prix_total ? `💶 ${d.prix_total}€ (bus + entrée)<br>` : ''}
        ${d.date_limite_inscription ? `⏳ Limite: ${new Date(d.date_limite_inscription).toLocaleDateString('fr-FR')}<br>` : ''}
      </div>
      <div style="font-size:14px;margin-bottom:16px;font-weight:600;">👥 ${nbInscrits} inscrit${nbInscrits>1?'s':''}${d.places_max?' / '+d.places_max+' places':''}</div>`;

    if (!estInscrit) {
      html += `<button class="btn btn-primary" onclick="doInscritDepl('${d.id}')">M'inscrire</button>`;
    } else if (!estPaye) {
      html += `<div class="info-box">⏳ Inscrit — en attente de paiement</div>
        ${d.lien_helloasso ? `<a href="${d.lien_helloasso}" target="_blank"><button class="btn btn-primary">💳 Payer via HelloAsso</button></a>` : ''}
        <p style="text-align:center;font-size:12px;color:var(--gris);margin-top:8px;">Paiement cash → contacter l'admin</p>`;
    } else {
      html += `<div class="info-box success">✅ Paiement confirmé — ton billet est prêt</div>
        <div class="qr-container" id="qrDepl"></div>
        <p style="text-align:center;font-size:12px;color:var(--gris);">Code: ${monInscrit.qr_code||''}</p>`;
    }

    // Boutons admin déplacement
    if (hasCelluleDepl(m)) {
      const payes = inscrits.filter(i => i.statut_paiement !== 'en_attente');
      html += `
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);">
          <div class="card-label">Gestion déplacement</div>
          <div style="font-size:13px;color:var(--gris);margin-bottom:10px;">✅ ${payes.length} payés · ⏳ ${inscrits.length-payes.length} en attente</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-sm btn-secondary" onclick="voirInscritsDepl('${d.id}')">👥 Voir inscrits</button>
            <button class="btn btn-sm btn-secondary" onclick="copierListeBus('${d.id}')">📋 Liste bus</button>
          </div>
        </div>`;
    }

    if (d.notes) html += `<div style="margin-top:12px;font-size:13px;color:var(--gris);">📝 ${d.notes}</div>`;
    document.getElementById('modalDeplContent').innerHTML = html;
    if (estPaye && monInscrit?.qr_code) {
      document.getElementById('qrDepl').innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(monInscrit.qr_code)}" width="160" height="160">`;
    }
    showModal('modalDepl');
  } catch(e) { toast('Erreur chargement déplacement', 'error'); }
}

async function doInscritDepl(id) {
  try { await UL.sInscrireDeplacements(id); toast('Inscription confirmée !', 'success'); closeModal('modalDepl'); loadDeplacements(); }
  catch(e) { toast(e.message || 'Impossible de s\'inscrire au déplacement', 'error'); }
}
async function voirInscritsDepl(deplId) {
  try {
    const { inscrits, deplacement: d } = await UL.getDeplacement(deplId);
    document.getElementById('modalAdminSessionContent').innerHTML = `
      <h3 class="modal-title">Inscrits — ${d.adversaire}</h3>
      ${inscrits.map(i => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <div style="flex:1;">
            <div style="font-weight:600;">@${i.membre?.pseudo_telegram||'?'}</div>
            <div style="color:var(--gris);">${i.membre?.prenom||''} ${i.membre?.nom||''}</div>
          </div>
          <span class="badge ${i.statut_paiement==='en_attente'?'badge-orange':i.statut_paiement.includes('paye')?'badge-vert':'badge-gris'}">
            ${i.statut_paiement==='en_attente'?'⏳':i.statut_paiement==='paye_cash'?'Cash ✅':'HA ✅'}
          </span>
          ${i.statut_paiement==='en_attente' ? `
            <button class="btn btn-sm btn-success" onclick="validerCash('${deplId}','${i.membre_id}')">Cash</button>` : ''}
        </div>`).join('')}
    `;
    showModal('modalAdminSession');
  } catch(e) { toast('Impossible de charger les inscrits du déplacement', 'error'); }
}
async function validerCash(deplId, membreId) {
  try { await UL.validerPaiementCash(deplId, membreId); toast('Paiement cash validé ✅', 'success'); voirInscritsDepl(deplId); }
  catch(e) { toast('Impossible de valider le paiement cash', 'error'); }
}
async function copierListeBus(deplId) {
  try {
    const liste = await UL.getListeBusTelegram(deplId);
    await navigator.clipboard.writeText(liste);
    toast('Liste bus copiée !', 'success');
  } catch(e) { toast('Impossible de copier la liste bus', 'error'); }
}
async function doCreerDepl() {
  const data = {
    adversaire: document.getElementById('dAdv').value,
    date_match: document.getElementById('dDate').value,
    stade: document.getElementById('dStade').value || null,
    ville: document.getElementById('dVille').value || null,
    point_rdv: document.getElementById('dRdv').value || null,
    heure_depart: document.getElementById('dHeure').value || null,
    prix_total: parseFloat(document.getElementById('dPrix').value) || null,
    places_max: parseInt(document.getElementById('dPlaces').value) || null,
    lien_helloasso: document.getElementById('dHelloasso').value || null,
    date_limite_inscription: document.getElementById('dLimite').value || null,
    notes: document.getElementById('dNotes').value || null,
  };
  if (!data.adversaire || !data.date_match) return toast('Adversaire et date requis', 'error');
  try {
    await UL.createDeplacement(data);
    toast('Déplacement créé ✅', 'success');
    closeModal('modalCreerDepl');
    loadDeplacements();
  } catch(e) { toast(e.message, 'error'); }
}

// ─── PROFIL ───────────────────────────────────────────────────
async function loadProfil() {
  const m = UL.getCurrentMembre();
  if (!m) return;
  const initiales = ((m.prenom||'?')[0]+(m.nom||'?')[0]).toUpperCase();
  const statutLabel = {
    sympathisant:'💙 Sympathisant', draft:'🚀 Draft', confirme:'🏅 Confirmé',
    membre_cellule:'🛡️ Membre Cellule', bureau:'🏆 Bureau', admin:'⚙️ Admin'
  };
  const etoiles = '⭐'.repeat(m.etoiles||0)+'☆'.repeat(3-(m.etoiles||0));
  document.getElementById('profilCard').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
      <div class="avatar" style="width:54px;height:54px;font-size:18px;">${initiales}</div>
      <div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:18px;">${m.prenom} ${m.nom}</div>
        <div style="font-size:13px;color:var(--gris);">@${m.pseudo_telegram}</div>
        <div class="statut-${m.statut}" style="font-size:13px;margin-top:3px;">${statutLabel[m.statut]||m.statut}</div>
      </div>
    </div>
    <div style="height:1px;background:var(--border);margin-bottom:12px;"></div>
    ${m.section ? `<div style="font-size:13px;margin-bottom:6px;">🛡️ Section: <strong>${m.section.nom}</strong></div>` : ''}
    <div style="font-size:13px;margin-bottom:6px;">${etoiles} Évaluation</div>
    <div style="font-size:13px;margin-bottom:6px;">📋 Charte: ${m.charte_signee ? '✅ Signée' : '❌ Non signée'}</div>
    <div style="font-size:13px;">💶 Cotisation: ${m.cotisation_a_jour ? '✅ À jour' : '⏳ En attente'}</div>
  `;
  try {
    const stats = await UL.getMesStats();
    document.getElementById('profilStats').innerHTML = `
      <div class="stat-card"><div class="stat-value">${stats.sessionsPresent}</div><div class="stat-label">Présences</div></div>
      <div class="stat-card"><div class="stat-value">${stats.tauxPresence}%</div><div class="stat-label">Assiduité</div></div>
      <div class="stat-card"><div class="stat-value">${stats.deplacements}</div><div class="stat-label">Déplacements</div></div>
      <div class="stat-card"><div class="stat-value">${stats.sessionsInscrites}</div><div class="stat-label">Inscriptions</div></div>`;
  } catch(e) {}
}

async function doChangeMdp() {
  const p1 = document.getElementById('newPassword').value;
  const p2 = document.getElementById('newPasswordConfirm').value;
  if (p1.length < 8) return toast('Mot de passe trop court', 'error');
  if (p1 !== p2) return toast('Les mots de passe ne correspondent pas', 'error');
  try { await UL.changePassword(p1); toast('Mot de passe modifié ✅', 'success'); closeModal('modalMdp'); }
  catch(e) { toast(e.message || 'Impossible de changer le mot de passe', 'error'); }
}

// ─── MEMBRES (Admin) ──────────────────────────────────────────
async function loadMembres() {
  document.getElementById('membresList').innerHTML = '<div class="empty-state"><div>⏳</div>Chargement…</div>';
  try {
    allMembres = await UL.getAllMembres();
    renderMembres(allMembres);
  } catch(e) { toast('Erreur chargement membres', 'error'); }
}
function filtrerMembres() {
  const q = document.getElementById('searchMembre').value.toLowerCase();
  const s = document.getElementById('filterStatut').value;
  renderMembres(allMembres.filter(m => {
    const match = `${m.nom} ${m.prenom} ${m.pseudo_telegram}`.toLowerCase().includes(q);
    return match && (!s || m.statut === s);
  }));
}
function renderMembres(membres) {
  const el = document.getElementById('membresList');
  if (!membres.length) { el.innerHTML = '<div class="empty-state"><div>👥</div>Aucun membre</div>'; return; }
  el.innerHTML = membres.map(m => `
    <div class="membre-card">
      <div class="membre-card-header">
        <div class="avatar">${((esc(m.prenom)||'?')[0]+(esc(m.nom)||'?')[0]).toUpperCase()}</div>
        <div style="flex:1;min-width:0;">
          <div class="membre-name">${esc(m.prenom)} ${esc(m.nom)}</div>
          <div class="membre-meta">@${m.pseudo_telegram} · <span class="statut-${m.statut}">${m.statut}</span></div>
          ${m.email ? `<div style="font-size:11px;color:var(--gris);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">✉️ ${esc(m.email)}</div>` : ''}
          ${m.section ? `<div style="font-size:11px;color:var(--bleu-clair);margin-top:1px;">🛡️ ${esc(m.section.nom)}</div>` : ''}
          ${Array.isArray(m.roles_app) && m.roles_app.length ? `<div style="font-size:10px;color:#818CF8;margin-top:2px;">🔑 ${m.roles_app.map(r=>r.replace('_',' ')).join(' · ')}</div>` : ''}
        </div>
        <span style="font-size:12px;color:var(--bleu-clair);">${esc(m.section?.nom||'Ultra Lutetia')}</span>
      </div>
      <div class="membre-card-actions">
        <button class="btn btn-sm btn-secondary" onclick="openEditMembre('${m.id}')">✏️ Modifier</button>
        <button class="btn btn-sm btn-secondary" onclick="adminResetMdp('${m.id}','${esc(m.email||'')}','${esc(m.prenom||'')}')">🔑 MDP</button>
        <button class="btn btn-sm ${m.actif?'btn-danger':'btn-success'}" onclick="toggleMembre('${m.id}',${!m.actif})">
          ${m.actif?'Bloquer':'Débloquer'}
        </button>
        <button class="btn btn-sm btn-danger" onclick="supprimerMembre('${m.id}','${esc(m.prenom||'')} ${esc(m.nom||'')}')">🗑</button>
      </div>
    </div>`).join('');
}
// Roles fonctionnels définis pour le modal
const ROLES_DEFS = [
  { key:'admin_app',       label:'⚙️ Admin App – Accès total' },
  { key:'bureau_app',      label:'🏆 Bureau – Gestion générale' },
  { key:'cellule_tifo',    label:'🎨 Cellule Tifo' },
  { key:'cellule_depl',    label:'🚌 Cellule Déplacement' },
  { key:'cellule_matos',   label:'🎒 Cellule Matos' },
  { key:'cellule_sticks',  label:'🎟️ Cellule Sticks' },
  { key:'cellule_comite',  label:'🔔 Comité de Passage' },
];
let _rolesActifs = new Set();

async function openEditMembre(id) {
  const m = allMembres.find(x => x.id === id);
  if (!m) return;
  document.getElementById('editMembreId').value = m.id;
  document.getElementById('editPrenom').value = m.prenom||'';
  document.getElementById('editNom').value = m.nom||'';
  document.getElementById('editTelegram').value = m.pseudo_telegram||'';
  document.getElementById('editEmail').value = m.email||'';
  // Statut UL : seulement sympathisant/draft/confirme
  const statutUL = ['sympathisant','draft','confirme'].includes(m.statut) ? m.statut : 'confirme';
  document.getElementById('editStatut').value = statutUL;

  // Section (charger la liste + sélectionner la section du membre)
  try {
    const sections = await UL.getSections ? await UL.getSections() : [];
    const selSec = document.getElementById('editSection');
    selSec.innerHTML = sections.map(s =>
      `<option value="${s.id}">${s.nom}</option>`
    ).join('');
    // Défaut = Ultra Lutetia ou section du membre
    const membreSectionId = m.section?.id || m.section_id || '';
    const ulOption = sections.find(s => s.nom?.toLowerCase().includes('ultra lutetia'));
    selSec.value = membreSectionId || (ulOption ? ulOption.id : (sections[0]?.id || ''));
  } catch(e) { document.getElementById('editSection').innerHTML = '<option value="">Ultra Lutetia</option>'; }

  // Rôles fonctionnels
  _rolesActifs = new Set(Array.isArray(m.roles_app) ? m.roles_app : []);
  const container = document.getElementById('rolesContainer');
  container.innerHTML = ROLES_DEFS.map(r => {
    const actif = _rolesActifs.has(r.key);
    return `<div onclick="toggleRole('${r.key}',this)" data-role="${r.key}"
      style="display:flex;align-items:center;gap:12px;padding:11px 14px;
             background:${actif?'rgba(26,86,219,0.18)':'rgba(255,255,255,.07)'};
             border:1.5px solid ${actif?'#1A56DB':'rgba(255,255,255,.12)'};
             border-radius:9px;cursor:pointer;transition:all .15s;">
      <div style="width:22px;height:22px;border-radius:6px;border:2px solid ${actif?'#1A56DB':'#4B5563'};
                  background:${actif?'#1A56DB':'transparent'};display:flex;align-items:center;
                  justify-content:center;flex-shrink:0;transition:all .15s;">
        ${actif?'<svg width="12" height="12" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" stroke="white" stroke-width="2" fill="none"/></svg>':''}
      </div>
      <span style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;letter-spacing:.03em;text-transform:uppercase;color:${actif?'#E2E8F0':'#94A3B8'};">${r.label}</span>
    </div>`;
  }).join('');

  showModal('modalEditMembre');
}

function toggleRole(key, rowEl) {
  if (_rolesActifs.has(key)) {
    _rolesActifs.delete(key);
    rowEl.style.background = 'rgba(255,255,255,.07)';
    rowEl.style.border = '1.5px solid rgba(255,255,255,.12)';
    const box = rowEl.querySelector('div');
    box.style.background = 'transparent';
    box.style.borderColor = '#4B5563';
    box.innerHTML = '';
    rowEl.querySelector('span').style.color = '#94A3B8';
  } else {
    _rolesActifs.add(key);
    rowEl.style.background = 'rgba(26,86,219,0.18)';
    rowEl.style.border = '1.5px solid #1A56DB';
    const box = rowEl.querySelector('div');
    box.style.background = '#1A56DB';
    box.style.borderColor = '#1A56DB';
    box.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" stroke="white" stroke-width="2" fill="none"/></svg>';
    rowEl.querySelector('span').style.color = '#E2E8F0';
  }
}
async function doSauvegarderMembre() {
  const id = document.getElementById('editMembreId').value;
  try {
    await UL.updateMembre(id, {
      prenom: document.getElementById('editPrenom').value.trim(),
      nom: document.getElementById('editNom').value.trim(),
      pseudo_telegram: document.getElementById('editTelegram').value.trim(),
      email: document.getElementById('editEmail').value.trim() || null,
      statut: document.getElementById('editStatut').value,
      section_id: document.getElementById('editSection').value || null,
      roles_app: Array.from(_rolesActifs),
    });
    toast('Membre mis à jour ✅', 'success');
    closeModal('modalEditMembre');
    loadMembres();
  } catch(e) { toast('Erreur: ' + (e.message||''), 'error'); }
}
async function toggleMembre(id, actif) {
  try { await UL.toggleBlocageMembre(id, actif); toast(actif?'Compte réactivé':'Compte bloqué', 'success'); loadMembres(); }
  catch(e) { toast('Impossible de modifier le statut du membre', 'error'); }
}

// ─── STATS ────────────────────────────────────────────────────
async function adminResetMdp(membreId, email, prenom) {
  if (!email) return toast('Aucun email pour ce membre', 'error');
  if (!confirm(`Envoyer un email de réinitialisation de mot de passe à ${prenom} (${email}) ?`)) return;
  try {
    await UL.updateMembreMdp(membreId);
    toast(`Email de réinitialisation envoyé à ${prenom} ✅`, 'success');
  } catch(e) { toast(e.message || 'Impossible d\'envoyer le reset', 'error'); }
}

async function supprimerMembre(membreId, nom) {
  if (!confirm(`Supprimer définitivement ${nom} ? Cette action est irréversible.`)) return;
  try {
    await UL.supprimerMembre(membreId);
    toast(`${nom} supprimé ✅`, 'success');
    allMembres = allMembres.filter(m => m.id !== membreId);
    renderMembres(allMembres);
  } catch(e) { toast(e.message || 'Impossible de supprimer ce membre', 'error'); }
}


async function loadStats() {
  const el = document.getElementById('statsContent');
  try {
    const stats = await UL.getStats();
    const mesStats = await UL.getMesStats();
    const COLORS = ['#1700D1','#2E18E0','#4530EF','#5B48FF','#7060FF','#8575FF'];
    const r = stats.repartitionStatuts || {};
    el.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-lbl">Total membres</div><div class="kpi-val">${stats.totalMembres}</div></div>
        <div class="kpi"><div class="kpi-lbl">Confirmés</div><div class="kpi-val" style="color:var(--open)">${r.confirme||0}</div></div>
        <div class="kpi"><div class="kpi-lbl">Drafts</div><div class="kpi-val" style="color:var(--pizza)">${r.draft||0}</div></div>
      </div>
      <div class="tranche-grid">
        <div class="tranche"><div class="tranche-lbl" style="color:var(--blue-light)">Sympa.</div><div class="tranche-val" style="color:var(--blue-light)">${r.sympathisant||0}</div></div>
        <div class="tranche"><div class="tranche-lbl" style="color:var(--pizza)">Draft</div><div class="tranche-val" style="color:var(--pizza)">${r.draft||0}</div></div>
        <div class="tranche"><div class="tranche-lbl" style="color:var(--open)">Confirmé</div><div class="tranche-val" style="color:var(--open)">${r.confirme||0}</div></div>
        <div class="tranche"><div class="tranche-lbl" style="color:#C4B5FF">Cellule</div><div class="tranche-val" style="color:#C4B5FF">${r.membre_cellule||0}</div></div>
      </div>
      <div class="card">
        <div class="card-label">Mes stats perso</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="stat-card"><div class="stat-value">${mesStats.sessionsPresent}</div><div class="stat-label">Présences</div></div>
          <div class="stat-card"><div class="stat-value">${mesStats.tauxPresence}%</div><div class="stat-label">Assiduité</div></div>
        </div>
      </div>`;
  } catch(e) { el.innerHTML = '<div class="empty-state"><div>⚠️</div>Erreur chargement</div>'; }
}

// ─── CHARTE ───────────────────────────────────────────────────
async function loadCharte() {
  try {
    const charte = await UL.getCharteActive();
    if (!charte) return;
    document.getElementById('charteTexte').textContent = charte.contenu;
    document.getElementById('pageCharte')._charteId = charte.id;
  } catch(e) {}
}
function checkCharteScroll(el) {
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
    const cb = document.getElementById('charteAccept');
    cb.disabled = false;
    // Rendre le wrapper cliquable aussi
    const wrap = document.getElementById('charteCheckWrap');
    if (wrap) {
      wrap.style.cursor = 'pointer';
      wrap.onclick = () => { cb.checked = !cb.checked; document.getElementById('btnSignerCharte').disabled = !cb.checked; };
    }
    cb.onchange = () => { document.getElementById('btnSignerCharte').disabled = !cb.checked; };
  }
}
async function signerCharte() {
  const charteId = document.getElementById('pageCharte')._charteId;
  if (!charteId) return;
  try {
    await UL.signerCharte(charteId);
    toast('Charte signée ✅', 'success');
    document.getElementById('charteAlert').style.display = 'none';
    showPage('pageAccueil');
  } catch(e) { toast('Impossible de signer la charte', 'error'); }
}

// ─── ANNONCES ─────────────────────────────────────────────────
async function doPublierAnnonce() {
  const titre = document.getElementById('annonceTitre').value.trim();
  const contenu = document.getElementById('annonceContenu').value.trim();
  const cat = document.getElementById('annonceCat').value;
  if (!titre || !contenu) return toast('Titre et contenu requis', 'error');
  try {
    await UL.publierAnnonce(titre, contenu, cat);
    toast('Annonce publiée ✅', 'success');
    closeModal('modalAnnonce');
    document.getElementById('annonceTitre').value = '';
    document.getElementById('annonceContenu').value = '';
    loadAccueil();
  } catch(e) { toast(e.message || 'Une erreur est survenue', 'error'); }
}

// ─── MATCHS ───────────────────────────────────────────────────
async function doAjouterMatch() {
  const data = {
    equipe_domicile: 'Paris FC',
    equipe_exterieur: document.getElementById('mExt').value,
    date: document.getElementById('mDate').value,
    horaire: document.getElementById('mHeure').value || null,
    type: document.getElementById('mType').value,
    stade: document.getElementById('mStade').value || null,
    competition: 'Ligue 1',
  };
  if (!data.equipe_exterieur || !data.date) return toast('Adversaire et date requis', 'error');
  try {
    await UL.addMatch(data);
    toast('Match ajouté ✅', 'success');
    loadMatchsList();
  } catch(e) { toast(e.message, 'error'); }
}
async function loadMatchsList() {
  try {
    const matchs = await UL.getMatchs();
    document.getElementById('matchsList').innerHTML = matchs.slice(0,8).map(m => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <div>
          <div style="font-weight:600;">${m.equipe_domicile} — ${m.equipe_exterieur}</div>
          <div style="color:var(--gris);">${m.date} · <span class="badge ${m.type==='exterieur'?'badge-rouge':'badge-vert'}">${m.type}</span></div>
        </div>
        <button class="btn btn-sm btn-danger" onclick="doSupprimerMatch('${m.id}')">🗑</button>
      </div>`).join('');
  } catch(e) {}
}
async function doSupprimerMatch(id) {
  if (!confirm('Supprimer ce match ?')) return;
  try { await UL.deleteMatch(id); toast('Match supprimé', 'success'); loadMatchsList(); }
  catch(e) { toast(e.message || 'Impossible de supprimer ce match', 'error'); }
}
document.getElementById('modalMatchs')?.addEventListener('ul:show', loadMatchsList);

// ─── BOUTIQUE ─────────────────────────────────────────────────

let allProduits = [], allSticks = [], allCotisations = [];
let currentFiltresMatos = 'tous', currentFiltresSticks = 'tous', currentFiltresCotisations = 'tous';

async function loadBoutique() {
  const m = UL.getCurrentMembre();
  // Afficher boutons admin
  if (hasCelluleMatos(m)) {
    document.getElementById('btnAddProduit').style.display = 'block';
    document.getElementById('toutesCommandesSection').style.display = 'block';
  }
  if (hasCelluleSticks(m)) {
    document.getElementById('btnDistribuerStick').style.display = 'block';
    document.getElementById('toutesDistribsSection').style.display = 'block';
  }
  if (isBureau(m)) {
    document.getElementById('adminCotisationSection').style.display = 'block';
  }
  await Promise.all([loadMatos(), loadSticks(), loadCotisation()]);
}

// ── Sous-onglets boutique ──────────────────────────────────────
function switchBoutiqueTab(tab) {
  ['sectionMatos','sectionSticks','sectionCotisation'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  ['tabMatos','tabSticks','tabCotisation'].forEach(id => {
    document.getElementById(id).classList.remove('active');
  });
  document.getElementById('section' + tab.charAt(0).toUpperCase() + tab.slice(1)).style.display = 'block';
  document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
}

// ── MATOS ──────────────────────────────────────────────────────
async function loadMatos() {
  try {
    allProduits = await UL.getProduits();
    renderMatos(allProduits);
    const commandes = await UL.getMesCommandes();
    renderMesCommandes(commandes);
    if (isCellule(UL.getCurrentMembre())) {
      const toutes = await UL.getAllCommandes();
      renderToutesCommandes(toutes);
    }
  } catch(e) { toast('Erreur chargement matos', 'error'); }
}

function filtrerMatos(cat) {
  document.querySelectorAll('#sectionMatos .filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  currentFiltresMatos = cat;
  const filtered = cat === 'tous' ? allProduits : allProduits.filter(p => p.categorie === cat);
  renderMatos(filtered);
}

function renderMatos(produits) {
  const el = document.getElementById('matosCatalogue');
  if (!produits.length) {
    el.innerHTML = '<div class="empty-state"><div>🛍️</div>Aucun article disponible</div>';
    return;
  }
  el.innerHTML = produits.map(p => {
    const icones = { textile:'👕', accessoire:'🎒', collector:'⭐' };
    const stockBadge = p.stock <= 3 && p.stock > 0
      ? `<span class="badge badge-orange" style="font-size:10px;">Stock limité</span>`
      : p.stock === 0 ? `<span class="badge badge-rouge" style="font-size:10px;">Épuisé</span>` : '';
    const sectionBadge = p.section
      ? `<span class="badge badge-bleu" style="font-size:10px;">Section ${p.section.nom}</span>` : '';
    return `<div class="produit-card">
      <div class="produit-img">${p.photo_url ? `<img src="${p.photo_url}" alt="${esc(p.nom)}">` : icones[p.categorie] || '📦'}</div>
      <div class="produit-info">
        <div class="produit-nom">${esc(p.nom)}</div>
        <div class="produit-prix">${p.prix}€</div>
        <div class="produit-meta">
          ${p.avec_tailles ? '• Tailles dispo' : ''}
          ${p.quota_par_membre ? `• Quota: ${p.quota_par_membre} max` : ''}
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${stockBadge}${sectionBadge}</div>
        ${p.stock > 0 || p.mode === 'precommande' ? `
        <button class="btn btn-sm btn-primary" style="margin-top:10px;" onclick="openCommander('${p.id}')">
          ${p.mode === 'precommande' ? '📋 Précommander' : '🛒 Commander'}
        </button>` : ''}
        ${hasCelluleMatos(UL.getCurrentMembre()) ? `
        <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-secondary" onclick="modifierStock('${p.id}','${esc(p.nom)}',${p.stock})">📦 Stock</button>
          <button class="btn btn-sm btn-secondary" onclick="uploadPhotoExistant('${p.id}','matos')">🖼️ Photo</button>
          <button class="btn btn-sm btn-danger" onclick="doArchiverProduit('${p.id}')">Archiver</button>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function openCommander(produitId) {
  try {
    const p = await UL.getProduitById(produitId);
    const icones = { textile:'👕', accessoire:'🎒', collector:'⭐' };

    // Section tailles — boutons cliquables
    const taillesHtml = p.avec_tailles ? `
      <div class="form-group">
        <label>Taille</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:2px;" id="taillesContainer">
          ${['XS','S','M','L','XL','XXL'].map((t,i) => `
            <button type="button"
              class="taille-btn ${i===2?'active':''}"
              onclick="selectTaille('${t}')"
              data-taille="${t}">
              ${t}
            </button>`).join('')}
        </div>
        <input type="hidden" id="cmdTaille" value="M">
      </div>` : '';

    document.getElementById('modalCommanderContent').innerHTML = `
      <h3 class="modal-title">${esc(p.nom)}</h3>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        ${p.photo_url ? `<img src="${p.photo_url}" style="width:70px;height:70px;object-fit:cover;border-radius:10px;">` : `<div style="font-size:42px;">${icones[p.categorie]||'📦'}</div>`}
        <div>
          <div style="font-size:24px;font-family:'Bebas Neue',sans-serif;color:var(--bleu-clair);">${p.prix}€</div>
          <div style="font-size:12px;color:var(--gris);">${p.categorie}${p.mode==='precommande'?' · Précommande':''}</div>
          ${p.stock > 0 ? `<div style="font-size:12px;color:var(--vert);">Stock: ${p.stock}</div>` : `<div style="font-size:12px;color:var(--orange);">Précommande</div>`}
        </div>
      </div>
      ${p.description ? `<p style="font-size:13px;color:var(--gris);margin-bottom:14px;line-height:1.6;">${esc(p.description)}</p>` : ''}
      ${p.quota_par_membre ? `<div class="info-box warning">⚠️ Quota: max ${p.quota_par_membre} par membre</div>` : ''}
      ${taillesHtml}
      <div class="form-group">
        <label>Mode de paiement</label>
        <select id="cmdMode" style="background:#1F2937;border:1.5px solid #4B5563;color:white;padding:11px 14px;border-radius:9px;width:100%;font-size:15px;">
          <option value="helloasso">💳 HelloAsso (en ligne)</option>
          <option value="cash">💵 Cash (en présentiel)</option>
        </select>
      </div>
      ${p.lien_helloasso ? `<div class="info-box" style="font-size:12px;">💡 Le lien HelloAsso te sera communiqué après validation.</div>` : ''}
      <button class="btn btn-primary" onclick="doCommander('${p.id}',${!!p.avec_tailles})">Valider la commande</button>
      <button class="btn btn-secondary" style="margin-top:8px;" onclick="closeModal('modalCommander')">Annuler</button>
    `;
    showModal('modalCommander');
  } catch(e) { toast('Erreur chargement article', 'error'); }
}

function selectTaille(taille) {
  document.querySelectorAll('.taille-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`.taille-btn[data-taille="${taille}"]`).forEach(b => b.classList.add('active'));
  document.getElementById('cmdTaille').value = taille;
}

async function doCommander(produitId, avecTailles = false) {
  const taille = avecTailles ? (document.getElementById('cmdTaille')?.value || null) : null;
  const mode = document.getElementById('cmdMode').value;
  if (avecTailles && !taille) return toast('Sélectionne une taille', 'error');
  try {
    await UL.passerCommande(produitId, taille, mode);
    toast('Commande enregistrée ✅', 'success');
    closeModal('modalCommander');
    loadMatos();
  } catch(e) { toast(e.message || 'Erreur commande', 'error'); }
}

function renderMesCommandes(commandes) {
  const el = document.getElementById('mesCommandes');
  if (!commandes.length) { el.innerHTML = '<p style="color:var(--gris);font-size:13px;">Aucune commande</p>'; return; }
  const statuts = { en_attente:'⏳ En attente', validee:'✅ Validée', prete:'📦 Prête', recuperee:'✔️ Récupérée', annulee:'❌ Annulée' };
  el.innerHTML = commandes.map(c => `
    <div class="card" style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;">${(c.commande_items||[]).map(i=>esc(i.produit?.nom||'?')).join(', ')}</div>
        <span class="badge ${c.statut==='recuperee'?'badge-vert':c.statut==='prete'?'badge-bleu':c.statut==='annulee'?'badge-rouge':'badge-orange'}">${statuts[c.statut]||c.statut}</span>
      </div>
      <div style="font-size:12px;color:var(--gris);">
        ${c.total}€ · ${c.mode_paiement === 'helloasso' ? 'HelloAsso' : 'Cash'} ·
        ${new Date(c.created_at).toLocaleDateString('fr-FR')}
      </div>
    </div>`).join('');
}

function renderToutesCommandes(commandes) {
  const el = document.getElementById('toutesCommandes');
  if (!commandes.length) { el.innerHTML = '<p style="color:var(--gris);font-size:13px;">Aucune commande</p>'; return; }
  const statuts = { en_attente:'⏳', validee:'✅', prete:'📦', recuperee:'✔️', annulee:'❌' };
  el.innerHTML = commandes.map(c => `
    <div class="card" style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;">@${c.membre?.pseudo_telegram||'?'}</div>
          <div style="font-size:12px;color:var(--gris);">${(c.commande_items||[]).map(i=>esc(i.produit?.nom||'?')).join(', ')} · ${c.total}€</div>
        </div>
        <span class="badge ${c.statut==='recuperee'?'badge-vert':c.statut==='prete'?'badge-bleu':'badge-orange'}">${statuts[c.statut]||''} ${c.statut}</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${c.statut==='en_attente' ? `<button class="btn btn-sm btn-success" onclick="changerStatutCommande('${c.id}','validee')">Valider</button>` : ''}
        ${c.statut==='validee' ? `<button class="btn btn-sm btn-primary" onclick="changerStatutCommande('${c.id}','prete')">Prête</button>` : ''}
        ${c.statut==='prete' ? `<button class="btn btn-sm btn-success" onclick="changerStatutCommande('${c.id}','recuperee')">Récupérée</button>` : ''}
        ${['en_attente','validee'].includes(c.statut) ? `<button class="btn btn-sm btn-danger" onclick="changerStatutCommande('${c.id}','annulee')">Annuler</button>` : ''}
      </div>
    </div>`).join('');
}

async function changerStatutCommande(id, statut) {
  try { await UL.updateCommandeStatut(id, statut); toast('Commande mise à jour ✅', 'success'); loadMatos(); }
  catch(e) { toast('Impossible de modifier le statut de la commande', 'error'); }
}

async function modifierStock(id, nom, stockActuel) {
  const nouveau = prompt(`Stock actuel: ${stockActuel}
Nouveau stock pour "${nom}" :`, stockActuel);
  if (nouveau === null || isNaN(parseInt(nouveau))) return;
  try {
    await UL.updateProduit(id, { stock: parseInt(nouveau) });
    toast('Stock mis à jour ✅', 'success');
    loadMatos();
  } catch(e) { toast(e.message || 'Une erreur est survenue', 'error'); }
}

async function doArchiverProduit(id) {
  if (!confirm('Archiver cet article ?')) return;
  try { await UL.archiverProduit(id); toast('Article archivé', 'success'); loadMatos(); }
  catch(e) { toast('Impossible d\'archiver cet article', 'error'); }
}

// ── STICKS ─────────────────────────────────────────────────────
async function loadSticks() {
  try {
    allSticks = await UL.getSticks();
    renderSticks(allSticks);
    const mesSticks = await UL.getMesSticks();
    renderMesSticks(mesSticks);
    if (hasCelluleSticks(UL.getCurrentMembre())) {
      const distribs = await UL.getAllDistributions();
      renderToutesDistribs(distribs);
      await loadDistribuerModal();
    }
  } catch(e) { toast('Erreur chargement sticks', 'error'); }
}

function filtrerSticks(cat) {
  document.querySelectorAll('#sectionSticks .filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  const filtered = cat === 'tous' ? allSticks : allSticks.filter(s => s.categorie === cat);
  renderSticks(filtered);
}

function renderSticks(sticks) {
  const el = document.getElementById('sticksCatalogue');
  const icones = { sticker:'🎟️', fumigene:'💨', drapeau:'🚩', echarpe:'🧣', collector:'⭐', autre:'📦' };
  if (!sticks.length) { el.innerHTML = '<div class="empty-state"><div>🎟️</div>Aucun stick disponible</div>'; return; }
  el.innerHTML = sticks.map(s => `
    <div class="stick-card">
      <div style="font-size:32px;flex-shrink:0;">${s.visuel_url ? `<img src="${s.visuel_url}" style="width:52px;height:52px;object-fit:cover;border-radius:8px;">` : icones[s.categorie]||'🎟️'}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:16px;">${esc(s.nom)}</div>
        <div style="font-size:12px;color:var(--gris);">
          ${s.serie ? `Série: ${esc(s.serie)} · ` : ''}
          ${s.prix ? `${s.prix}€ · ` : 'Gratuit · '}
          Stock: ${s.stock}
          ${s.quota_par_membre ? ` · Quota: ${s.quota_par_membre}` : ''}
        </div>
        ${s.section ? `<span class="badge badge-bleu" style="font-size:10px;margin-top:4px;">Section ${esc(s.section.nom)}</span>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0;">
        ${s.lien_helloasso ? `<a href="${s.lien_helloasso}" target="_blank"><button class="btn btn-sm btn-primary">HelloAsso</button></a>` : ''}
        <button class="btn btn-sm btn-secondary" onclick="demanderStickCash('${s.id}','${esc(s.nom)}')">Cash</button>
        ${hasCelluleSticks(UL.getCurrentMembre()) ? `<button class="btn btn-sm btn-secondary" onclick="uploadPhotoExistant('${s.id}','stick')">🖼️</button>` : ''}
      </div>
    </div>`).join('');
}

async function demanderStickCash(stickId, nom) {
  const qte = parseInt(prompt(`Quantité souhaitée pour "${nom}" (cash, à remettre en présentiel) :`, '1'));
  if (!qte || qte < 1) return;
  try {
    await UL.demanderStick(stickId, 'cash', qte);
    toast('Demande enregistrée ✅ — à régler en présentiel', 'success');
    loadSticks();
  } catch(e) { toast(e.message || 'Erreur', 'error'); }
}

function renderMesSticks(distribs) {
  const el = document.getElementById('mesSticks');
  if (!distribs.length) { el.innerHTML = '<p style="color:var(--gris);font-size:13px;">Aucun stick reçu</p>'; return; }
  const statuts = { distribue:'✅ Reçu', en_attente:'⏳ En attente', paye_helloasso:'💳 Payé', paye_cash:'💵 Cash', gratuit:'🎁 Gratuit' };
  el.innerHTML = distribs.map(d => `
    <div class="card" style="margin-bottom:6px;padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:600;font-size:14px;">${esc(d.stick?.nom||'?')}</div>
          <div style="font-size:12px;color:var(--gris);">Qté: ${d.quantite} · ${new Date(d.created_at).toLocaleDateString('fr-FR')}</div>
        </div>
        <span class="badge ${d.statut==='distribue'||d.statut==='paye_helloasso'||d.statut==='paye_cash'?'badge-vert':d.statut==='gratuit'?'badge-bleu':'badge-orange'}">${statuts[d.statut]||d.statut}</span>
      </div>
    </div>`).join('');
}

function renderToutesDistribs(distribs) {
  const el = document.getElementById('toutesDistribs');
  if (!distribs.length) { el.innerHTML = '<p style="color:var(--gris);font-size:13px;">Aucune distribution</p>'; return; }
  el.innerHTML = distribs.slice(0,30).map(d => `
    <div class="card" style="margin-bottom:6px;padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:600;font-size:13px;">@${d.membre?.pseudo_telegram||'?'} — ${esc(d.stick?.nom||'?')}</div>
          <div style="font-size:11px;color:var(--gris);">Qté: ${d.quantite} · ${d.mode_paiement} · ${new Date(d.created_at).toLocaleDateString('fr-FR')}</div>
        </div>
        <span class="badge ${d.statut==='distribue'?'badge-vert':'badge-orange'}">${d.statut}</span>
      </div>
    </div>`).join('');
}

async function loadDistribuerModal() {
  try {
    const [sticks, membres] = await Promise.all([
      UL.getSticks(),
      UL.getAllMembres(),
    ]);
    document.getElementById('distribStickId').innerHTML = sticks.map(s =>
      `<option value="${s.id}">${esc(s.nom)} (stock: ${s.stock})</option>`).join('');
    document.getElementById('distribMembreId').innerHTML = membres.map(m =>
      `<option value="${m.id}">@${esc(m.pseudo_telegram)} — ${esc(m.prenom)} ${esc(m.nom)}</option>`).join('');
  } catch(e) {}
}

async function doDistribuerStick() {
  const stickId = document.getElementById('distribStickId').value;
  const membreId = document.getElementById('distribMembreId').value;
  const qte = parseInt(document.getElementById('distribQte').value) || 1;
  const mode = document.getElementById('distribMode').value;
  try {
    await UL.distribuerStickAdmin(stickId, membreId, qte, mode);
    toast('Distribution enregistrée ✅', 'success');
    closeModal('modalDistribuer');
    loadSticks();
  } catch(e) { toast(e.message || 'Impossible d\'enregistrer la distribution', 'error'); }
}

// ── COTISATION ─────────────────────────────────────────────────
async function loadCotisation() {
  try {
    const { cotisation, config } = await UL.getMaCotisation();
    const aJour = cotisation && cotisation.statut === 'paye';
    document.getElementById('cotisationStatut').innerHTML = `
      <div class="cotisation-badge ${aJour ? 'ok' : 'nok'}">
        <div style="font-size:48px;">${aJour ? '✅' : '⏳'}</div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:.05em;">
          ${aJour ? 'Cotisation à jour' : 'Cotisation en attente'}
        </div>
        <div style="font-size:13px;color:var(--gris);">Saison ${config.saison} · ${config.montant}€</div>
        ${aJour ? `<div style="font-size:12px;color:var(--vert);">Payé le ${new Date(cotisation.paye_at).toLocaleDateString('fr-FR')}</div>` : ''}
      </div>
      ${!aJour && config.lien ? `
        <a href="${config.lien}" target="_blank">
          <button class="btn btn-primary">💳 Payer via HelloAsso</button>
        </a>
        <div style="text-align:center;margin-top:8px;font-size:12px;color:var(--gris);">
          Paiement cash possible — contacte un admin
        </div>` : ''}`;
    if (isAdmin(UL.getCurrentMembre()) || isBureau(UL.getCurrentMembre())) {
      const config2 = await UL.getConfigCotisation();
      document.getElementById('configLienCotisation').value = config2.lien || '';
      document.getElementById('configMontantCotisation').value = config2.montant || '20';
      await loadListeCotisations();
    }
  } catch(e) { toast('Erreur cotisations', 'error'); }
}

async function loadListeCotisations() {
  try {
    allCotisations = await UL.getAllCotisations();
    renderCotisations(allCotisations);
  } catch(e) {}
}

function filtrerCotisations(filtre) {
  document.querySelectorAll('#adminCotisationSection .filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  currentFiltresCotisations = filtre;
  let filtered = allCotisations;
  if (filtre === 'a_jour') filtered = allCotisations.filter(m => m.cotisation_a_jour);
  if (filtre === 'en_attente') filtered = allCotisations.filter(m => !m.cotisation_a_jour);
  renderCotisations(filtered);
}

function renderCotisations(membres) {
  const el = document.getElementById('listeCotisations');
  if (!membres.length) { el.innerHTML = '<div class="empty-state"><div>👥</div>Aucun membre</div>'; return; }
  el.innerHTML = membres.map(m => `
    <div class="card" style="margin-bottom:8px;padding:12px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="avatar" style="width:34px;height:34px;font-size:13px;">${((m.prenom||'?')[0]+(m.nom||'?')[0]).toUpperCase()}</div>
        <div style="flex:1;">
          <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;">${esc(m.prenom)} ${esc(m.nom)}</div>
          <div style="font-size:11px;color:var(--gris);">@${esc(m.pseudo_telegram)} ${m.section ? '· ' + esc(m.section.nom) : ''}</div>
        </div>
        <span class="badge ${m.cotisation_a_jour ? 'badge-vert' : 'badge-orange'}">${m.cotisation_a_jour ? '✅ À jour' : '⏳ Attente'}</span>
      </div>
      ${!m.cotisation_a_jour ? `
      <div style="display:flex;gap:6px;margin-top:10px;">
        <button class="btn btn-sm btn-success" onclick="doValiderCotisationCash('${m.id}')">💵 Valider cash</button>
        <button class="btn btn-sm btn-primary" onclick="doValiderCotisationHA('${m.id}')">💳 Valider HA</button>
      </div>` : ''}
    </div>`).join('');
}

async function doValiderCotisationCash(membreId) {
  try { await UL.validerCotisationCash(membreId); toast('Cotisation validée (cash) ✅', 'success'); loadListeCotisations(); }
  catch(e) { toast(e.message || 'Impossible de valider la cotisation cash', 'error'); }
}
async function doValiderCotisationHA(membreId) {
  try { await UL.validerCotisationHelloAsso(membreId); toast('Cotisation validée (HelloAsso) ✅', 'success'); loadListeCotisations(); }
  catch(e) { toast(e.message || 'Impossible de valider la cotisation HelloAsso', 'error'); }
}
async function doSauvegarderConfigCotisation() {
  const lien = document.getElementById('configLienCotisation').value.trim();
  const montant = document.getElementById('configMontantCotisation').value.trim();
  try { await UL.updateConfigCotisation(lien, montant); toast('Config cotisation enregistrée ✅', 'success'); }
  catch(e) { toast('Impossible de sauvegarder la configuration', 'error'); }
}

// ─── MATOS ────────────────────────────────────────────────────

function toggleSectionSelect() {
  const val = document.getElementById('pAcces').value;
  document.getElementById('sectionSelectGroup').style.display = val === 'section' ? 'block' : 'none';
}

function previewPhoto(input, type) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  if (type === 'matos') {
    reader.onload = e => {
      document.getElementById('photoPreviewImgMatos').src = e.target.result;
      document.getElementById('photoPreviewMatos').style.display = 'block';
    };
  } else if (type === 'stick') {
    reader.onload = e => {
      const imgEl = document.getElementById('photoPreviewImgStick');
      const wrapEl = document.getElementById('photoPreviewStick');
      if (imgEl) imgEl.src = e.target.result;
      if (wrapEl) wrapEl.style.display = 'block';
    };
  }
  reader.readAsDataURL(file);
}

// Upload photo sur un article existant (bouton photo dans la liste)
async function uploadPhotoExistant(produitId, type) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      showLoading();
      let url;
      if (type === 'matos') {
        url = await UL.uploadPhotoMatos(file, produitId);
        await UL.updatePhotoMatos(produitId, url);
      } else {
        url = await UL.uploadPhotoStick(file, produitId);
        await UL.updatePhotoStick(produitId, url);
      }
      hideLoading();
      toast('Photo mise à jour ✅', 'success');
      type === 'matos' ? loadMatos() : loadSticks();
    } catch(e) { hideLoading(); toast(e.message || 'Erreur upload', 'error'); }
  };
  input.click();
}

async function loadSectionsForModal() {
  try {
    const sections = await UL.getSections();
    const sel = document.getElementById('pSection');
    sel.innerHTML = sections.map(s =>
      `<option value="${s.id}">${s.nom}</option>`
    ).join('');
  } catch(e) {}
}

async function doCreerProduit() {
  const nom = document.getElementById('pNom').value.trim();
  const prix = parseFloat(document.getElementById('pPrix').value);
  const acces = document.getElementById('pAcces').value;
  const sectionId = acces === 'section' ? document.getElementById('pSection').value : null;

  if (!nom) return toast('Nom requis', 'error');
  if (!prix || isNaN(prix)) return toast('Prix requis', 'error');
  if (acces === 'section' && !sectionId) return toast('Sélectionne une section', 'error');

  try {
    showLoading();

    // Upload photo si présente
    let photoUrl = null;
    const photoFile = document.getElementById('pPhoto').files[0];
    if (photoFile) {
      photoUrl = await UL.uploadPhotoMatos(photoFile, nom);
    }

    const produit = await UL.createProduit({
      nom,
      description: document.getElementById('pDesc').value || null,
      categorie: document.getElementById('pCat').value,
      prix,
      stock: parseInt(document.getElementById('pStock').value) || 0,
      avec_tailles: document.getElementById('pTailles').checked,
      niveau_acces: acces,
      section_id: sectionId,
      mode: document.getElementById('pMode').value,
      statut: 'disponible',
      photo_url: photoUrl,
    });

    hideLoading();
    const sectionNom = acces === 'section'
      ? document.getElementById('pSection').options[document.getElementById('pSection').selectedIndex].text
      : null;

    toast(`Article créé ✅ ${sectionNom ? '— Section ' + sectionNom : '— Généraliste'}`, 'success');
    closeModal('modalCreerProduit');
    ['pNom','pDesc','pPrix','pStock'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('pPhoto').value = '';
    document.getElementById('photoPreviewMatos').style.display = 'none';
    document.getElementById('pAcces').value = 'tous';
    document.getElementById('pTailles').checked = false;
    document.getElementById('sectionSelectGroup').style.display = 'none';
    loadMatos();
  } catch(e) {
    hideLoading();
    toast(e.message || 'Erreur création article', 'error');
  }
}

// ─── CALENDRIER ──────────────────────────────────────────────
let allMatchs = [], allEvenements = [], currentFiltreCalendrier = 'tous';

async function loadCalendrier() {
  document.getElementById('calendrierListe').innerHTML = '<div class="empty-state"><div>⏳</div>Chargement…</div>';
  try {
    const [matchs, evenements] = await Promise.all([
      UL.getMatchs(),
      UL.getEvenements ? UL.getEvenements() : Promise.resolve([]),
    ]);
    allMatchs = matchs || [];
    allEvenements = evenements || [];
    filtrerCalendrier('tous');
  } catch(e) { document.getElementById('calendrierListe').innerHTML = '<div class="empty-state"><div>⚠️</div>Erreur chargement</div>'; }
}

function filtrerCalendrier(filtre) {
  currentFiltreCalendrier = filtre;
  ['fcalTous','fcalDom','fcalExt','fcalEv'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const activeId = {tous:'fcalTous',domicile:'fcalDom',exterieur:'fcalExt',evenement:'fcalEv'}[filtre];
  if (activeId && document.getElementById(activeId)) document.getElementById(activeId).classList.add('active');

  const m = UL.getCurrentMembre();
  let items = [];

  if (filtre !== 'evenement') {
    let matchsFiltres = allMatchs;
    if (filtre === 'domicile') matchsFiltres = allMatchs.filter(m => m.type === 'domicile');
    if (filtre === 'exterieur') matchsFiltres = allMatchs.filter(m => m.type === 'exterieur');
    items = matchsFiltres.map(m => ({ ...m, _type: 'match' }));
  }
  if (filtre === 'evenement' || filtre === 'tous') {
    items = [...items, ...allEvenements.map(e => ({ ...e, _type: 'evenement' }))];
  }

  // Tri par date
  items.sort((a, b) => {
    const da = a.date || a.date_match || '';
    const db = b.date || b.date_match || '';
    return da.localeCompare(db);
  });

  const el = document.getElementById('calendrierListe');
  if (!items.length) { el.innerHTML = '<div class="empty-state"><div>📅</div>Aucun élément</div>'; return; }

  el.innerHTML = items.map(item => {
    if (item._type === 'match') return renderMatchCard(item, m);
    return renderEvenementCard(item);
  }).join('');
}

function renderMatchCard(match, membre) {
  const isPFC = match.equipe_domicile?.includes('Paris FC') || match.type === 'domicile';
  const adversaire = isPFC ? match.equipe_exterieur : match.equipe_domicile;
  const date = match.date ? new Date(match.date).toLocaleDateString('fr-FR', {weekday:'short',day:'numeric',month:'short'}) : '—';
  const isPasse = match.date && new Date(match.date) < new Date();
  const logoAdv = match.logo_exterieur || match.logo_domicile || null;
  const typeLabel = match.type === 'domicile'
    ? '<span class="badge badge-vert">🏠 Domicile</span>'
    : '<span class="badge badge-rouge">✈️ Extérieur</span>';
  const score = (match.score_domicile !== null && match.score_exterieur !== null)
    ? `<div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.05em;margin:4px 0;">${match.score_domicile} — ${match.score_exterieur}</div>` : '';
  const saisieScore = isPasse && isBureau(membre) && !score
    ? `<button class="btn btn-sm btn-secondary" style="margin-top:8px;" onclick="saisirScore('${match.id}')">⚽ Saisir le score</button>` : '';

  return `<div class="card" style="margin-bottom:10px;">
    <div style="display:flex;align-items:center;gap:12px;">
      ${logoAdv ? `<img src="${esc(logoAdv)}" style="width:38px;height:38px;object-fit:contain;flex-shrink:0;">` : '<div style="width:38px;height:38px;background:var(--surface);border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px;">⚽</div>'}
      <div style="flex:1;min-width:0;">
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:16px;">Paris FC — ${esc(adversaire||'?')}</div>
        <div style="font-size:12px;color:var(--gris);">${date}${match.horaire?' · '+match.horaire.slice(0,5):''}</div>
        ${match.stade ? `<div style="font-size:11px;color:var(--gris);">📍 ${esc(match.stade)}</div>` : ''}
      </div>
      ${typeLabel}
    </div>
    ${score}
    <div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
      ${match.journee ? `<span style="font-size:11px;color:var(--gris);">J${match.journee}</span>` : ''}
      ${match.competition ? `<span class="badge badge-bleu" style="font-size:10px;">${esc(match.competition)}</span>` : ''}
    </div>
    ${saisieScore}
  </div>`;
}

function renderEvenementCard(ev) {
  const types = { reunion:'🤝', bbq:'🍖', fete:'🎊', autre:'🎉' };
  const couleurs = { reunion:'badge-bleu', bbq:'badge-orange', fete:'badge-orange', autre:'badge-vert' };
  const date = ev.date ? new Date(ev.date).toLocaleDateString('fr-FR', {weekday:'short',day:'numeric',month:'short'}) : '—';
  const m = UL.getCurrentMembre();
  const canEdit = isBureau(m);
  return `<div class="card" style="margin-bottom:10px;border-left:3px solid #1A56DB;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="font-size:28px;">${types[ev.type]||'🎉'}</div>
      <div style="flex:1;">
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:16px;">${esc(ev.nom||ev.titre||'Événement')}</div>
        <div style="font-size:12px;color:var(--gris);">${date}${ev.lieu?' · '+esc(ev.lieu):''}</div>
        ${ev.description ? `<div style="font-size:12px;color:var(--gris);margin-top:3px;">${esc(ev.description)}</div>` : ''}
      </div>
      <span class="badge ${couleurs[ev.type]||'badge-vert'}" style="font-size:10px;flex-shrink:0;">${types[ev.type]||'🎉'} ${ev.type||'événement'}</span>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
      ${ev.lien_helloasso ? `<a href="${esc(ev.lien_helloasso)}" target="_blank"><button class="btn btn-sm btn-primary">Inscriptions →</button></a>` : ''}
      ${canEdit ? `<button class="btn btn-sm btn-secondary" onclick="ouvrirModifierEvenement('${ev.id}')">✏️ Modifier</button>` : ''}
      ${canEdit ? `<button class="btn btn-sm btn-danger" onclick="doSupprimerEvenement('${ev.id}')">🗑</button>` : ''}
    </div>
  </div>`;
}

async function saisirScore(matchId) {
  const dom = prompt('Score Paris FC (domicile si dom) :');
  if (dom === null) return;
  const ext = prompt('Score adversaire :');
  if (ext === null) return;
  try {
    await UL.saisirScoreMatch(matchId, parseInt(dom), parseInt(ext));
    toast('Score enregistré ✅', 'success');
    loadCalendrier();
  } catch(e) { toast(e.message || 'Une erreur est survenue', 'error'); }
}

// ─── CARTAGE ──────────────────────────────────────────────────
let allCartage = [], currentFiltreCartage = 'tous';

async function loadCartage() {
  try {
    const membres = await UL.getAllMembres();
    allCartage = membres;
    const cartes = membres.filter(m => m.cotisation_a_jour && m.charte_signee);
    const incomplets = membres.filter(m => !m.cotisation_a_jour || !m.charte_signee);
    document.getElementById('cartageStats').innerHTML =
      `<span>👥 ${membres.length} membres</span>` +
      `<span style="color:var(--vert);">✅ ${cartes.length} cartés</span>` +
      `<span style="color:var(--orange);">⚠️ ${incomplets.length} incomplets</span>`;
    filtrerCartage(currentFiltreCartage);
  } catch(e) { toast('Erreur cartage', 'error'); }
}

function filtrerCartage(filtre) {
  currentFiltreCartage = filtre;
  ['fcartTous','fcartCartes','fcartIncomplets'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const aid = {tous:'fcartTous',cartes:'fcartCartes',incomplets:'fcartIncomplets'}[filtre];
  if (aid && document.getElementById(aid)) document.getElementById(aid).classList.add('active');

  let filtered = allCartage;
  if (filtre === 'cartes') filtered = allCartage.filter(m => m.cotisation_a_jour && m.charte_signee);
  if (filtre === 'incomplets') filtered = allCartage.filter(m => !m.cotisation_a_jour || !m.charte_signee);

  const el = document.getElementById('cartageListe');
  if (!filtered.length) { el.innerHTML = '<div class="empty-state"><div>🗂️</div>Aucun membre</div>'; return; }

  el.innerHTML = filtered.map(m => {
    const carte = m.cotisation_a_jour && m.charte_signee;
    return `<div class="card" style="margin-bottom:8px;padding:12px;border-left:3px solid ${carte?'#22C55E':'#F59E0B'};">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="avatar" style="width:36px;height:36px;font-size:13px;">${((m.prenom||'?')[0]+(m.nom||'?')[0]).toUpperCase()}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;">${esc(m.prenom)} ${esc(m.nom)}</div>
          <div style="font-size:11px;color:var(--gris);">@${esc(m.pseudo_telegram)} · <span class="statut-${m.statut}">${m.statut}</span></div>
          <div style="font-size:11px;margin-top:3px;">
            ${m.cotisation_a_jour ? '✅' : '❌'} Cotisation &nbsp;|&nbsp; ${m.charte_signee ? '✅' : '❌'} Charte
          </div>
        </div>
        <span class="badge ${carte?'badge-vert':'badge-orange'}" style="flex-shrink:0;">${carte?'✅ Carté':'⚠️ Incomplet'}</span>
      </div>
      ${!m.cotisation_a_jour ? `
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
        <button class="btn btn-sm btn-success" onclick="doValiderCotisationCash('${m.id}');setTimeout(loadCartage,400)">💵 Cash</button>
        <button class="btn btn-sm btn-primary" onclick="doValiderCotisationHA('${m.id}');setTimeout(loadCartage,400)">💳 HA</button>
      </div>` : ''}
    </div>`;
  }).join('');
}

// ─── ÉVÉNEMENTS ──────────────────────────────────────────────
function ouvrirCreerEvenement() {
  document.getElementById('evId').value = '';
  document.getElementById('modalEvenementTitre').textContent = 'Créer un événement';
  ['evNom','evLieu','evDesc','evHelloasso'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('evType').value = 'reunion';
  document.getElementById('evDate').value = '';
  document.getElementById('evHeure').value = '';
  showModal('modalEvenement');
}

async function ouvrirModifierEvenement(id) {
  try {
    const ev = await UL.getEvenement(id);
    if (!ev) return toast('Événement introuvable', 'error');
    document.getElementById('evId').value = ev.id;
    document.getElementById('modalEvenementTitre').textContent = "Modifier l'événement";
    document.getElementById('evNom').value = ev.nom || ev.titre || '';
    document.getElementById('evType').value = ev.type || 'autre';
    document.getElementById('evDate').value = ev.date || '';
    document.getElementById('evHeure').value = ev.heure ? ev.heure.slice(0,5) : '';
    document.getElementById('evLieu').value = ev.lieu || '';
    document.getElementById('evDesc').value = ev.description || '';
    document.getElementById('evHelloasso').value = ev.lien_helloasso || '';
    showModal('modalEvenement');
  } catch(e) { toast('Erreur chargement événement', 'error'); }
}

async function doSauvegarderEvenement() {
  const nom = document.getElementById('evNom').value.trim();
  const date = document.getElementById('evDate').value;
  if (!nom || !date) return toast('Nom et date requis', 'error');
  const data = {
    nom, type: document.getElementById('evType').value,
    date, heure: document.getElementById('evHeure').value || null,
    lieu: document.getElementById('evLieu').value.trim() || null,
    description: document.getElementById('evDesc').value.trim() || null,
    lien_helloasso: document.getElementById('evHelloasso').value.trim() || null,
  };
  const id = document.getElementById('evId').value;
  try {
    if (id) {
      await UL.saveEvenement(data, id);
      toast('Événement modifié ✅', 'success');
    } else {
      await UL.saveEvenement(data);
      toast('Événement créé ✅', 'success');
    }
    closeModal('modalEvenement');
    if (document.getElementById('pageCalendrier')?.classList.contains('active')) loadCalendrier();
  } catch(e) { toast(e.message || 'Erreur', 'error'); }
}

async function doSupprimerEvenement(id) {
  if (!confirm('Supprimer cet événement ?')) return;
  try {
    await UL.deleteEvenement(id);
    toast('Événement supprimé', 'success');
    loadCalendrier();
  } catch(e) { toast('Impossible de supprimer l\'événement', 'error'); }
}

// ─── DEMANDES ADMIN (page dédiée) ────────────────────────────
async function loadDemandesAdmin() {
  try {
    const tous = await UL.getAllMembres();
    const demandes = tous.filter(m => m.statut === 'sympathisant' && !m.actif);
    const badge = document.getElementById('demandesBadge2');
    if (badge) {
      badge.textContent = demandes.length + ' en attente';
      badge.style.display = demandes.length ? 'inline-flex' : 'none';
    }

    const el = document.getElementById('demandesListeAdmin');
    if (!el) return;
    if (!demandes.length) {
      el.innerHTML = '<div class="empty-state"><div>✅</div>Aucune demande en attente</div>';
      return;
    }

    el.innerHTML = demandes.map(m => `
      <div class="card" style="margin-bottom:8px;padding:14px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div class="avatar" style="width:38px;height:38px;font-size:14px;">${((m.prenom||'?')[0]+(m.nom||'?')[0]).toUpperCase()}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:15px;">${esc(m.prenom)} ${esc(m.nom)}</div>
            <div style="font-size:12px;color:var(--gris);">@${esc(m.pseudo_telegram)}</div>
            ${m.email ? `<div style="font-size:11px;color:var(--gris);">✉️ ${esc(m.email)}</div>` : ''}
            <div style="font-size:11px;color:var(--gris);">📅 ${new Date(m.created_at).toLocaleDateString('fr-FR')}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-secondary" onclick="validerDemandeAdmin('${m.id}','sympathisant')">💙 Sympa.</button>
          <button class="btn btn-sm btn-success" onclick="validerDemandeAdmin('${m.id}','draft')">✅ Draft</button>
          <button class="btn btn-sm btn-primary" onclick="validerDemandeAdmin('${m.id}','confirme')">⭐ Confirmé</button>
          <button class="btn btn-sm btn-danger" onclick="refuserDemandeAdmin('${m.id}')">❌ Refuser</button>
        </div>
      </div>`).join('');
  } catch(e) { console.error('Erreur demandes admin:', e); }
}

async function validerDemandeAdmin(membreId, statut) {
  try {
    const membre = await UL.updateMembre(membreId, { statut, actif: true });
    toast(`Membre accepté → ${statut} ✅`, 'success');
    if (membre && membre.email) {
      UL.envoyerEmailValidation(membre).catch(() => {});
    }
    loadDemandesAdmin();
  } catch(e) { toast('Impossible de valider la demande', 'error'); }
}

async function refuserDemandeAdmin(membreId) {
  if (!confirm('Refuser et désactiver ce compte ?')) return;
  try {
    await UL.toggleBlocageMembre(membreId, false);
    toast('Demande refusée', 'success');
    loadDemandesAdmin();
  } catch(e) { toast('Impossible de refuser la demande', 'error'); }
}

// ─── UTILS ────────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function showModal(id) {
  document.getElementById(id).style.display = 'flex';
  if (id === 'modalMatchs') loadMatchsList();
}
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function closeModalOutside(e, id) { if (e.target === document.getElementById(id)) closeModal(id); }

function toast(msg, type='info', duree=2800) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duree);
}
let loadingEl = null;
function showLoading() {
  loadingEl = document.createElement('div');
  loadingEl.className = 'loading-overlay';
  loadingEl.innerHTML = '<div class="spinner"></div>';
  document.body.appendChild(loadingEl);
}
function hideLoading() { if (loadingEl) { loadingEl.remove(); loadingEl = null; } }
