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

  // Si hash access_token présent, attendre que Supabase JS le traite
  const hash = window.location.hash;
  if (hash && hash.includes('access_token')) {
    showLoading();
    await new Promise(r => setTimeout(r, 1500));
    hideLoading();
    window.history.replaceState({}, '', window.location.pathname);
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
  if (hasCelluleTifo(membre)) document.getElementById('btnCreerTifo').style.display = 'block';
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
  if (hasCelluleTifo(membre))   el('adminSectionTifos').style.display = 'block';
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
    pageTifos:3, pageBoutique:4, pageProfil:5, pageAdmin:6,
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
  if (pageId === 'pageTifos') loadTifos();
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
    const el = document.getElementById('tifosAccueil');
    el.innerHTML = sessions.length
      ? sessions.slice(0,2).map(s => renderTifoCard(s, 'acc_')).join('')
      : '<p style="color:var(--gris);font-size:14px;">Aucun tifo à venir</p>';
    await refreshTifosActions(sessions.slice(0,2), 'acc_');
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

// ─── Exports globaux (utilisés par les modules) ───────────────
// State
window.getCurrentMembre = () => UL.getCurrentMembre();
// Ces variables sont déjà accessibles globalement (var/let au niveau du script)
// Les modules y accèdent directement car même scope global (pas de modules ES6)
