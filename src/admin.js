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
    document.getElementById('matchsList').innerHTML = matchs.slice(0,40).map(m => {
      const statutBadge = m.statut_date === 'a_confirmer'
        ? '<span class="badge badge-orange" style="font-size:10px;">⏳ À confirmer</span>'
        : '<span class="badge badge-vert" style="font-size:10px;">✅ Confirmée</span>';
      const actionBtn = m.statut_date === 'a_confirmer'
        ? `<button class="btn btn-sm btn-success" onclick="ouvrirConfirmerDate('${m.id}')">✅ Confirmer</button>`
        : `<button class="btn btn-sm btn-secondary" onclick="doRouvrirConfirmation('${m.id}')">↺ Rouvrir</button>`;
      return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;">${m.journee?'J'+m.journee+' · ':''}${esc(m.equipe_domicile)} — ${esc(m.equipe_exterieur)}</div>
          <div style="color:var(--gris);">${m.date}${m.horaire?' · '+m.horaire.slice(0,5):''} · <span class="badge ${m.type==='exterieur'?'badge-rouge':'badge-vert'}">${m.type}</span> ${statutBadge}</div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          ${actionBtn}
          <button class="btn btn-sm btn-danger" onclick="doSupprimerMatch('${m.id}')">🗑</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) {}
}

// ─── Confirmation de date (Bureau+) ────────────────────────────
// Réutilise le modal "Calendrier matchs" : bascule temporairement son
// formulaire d'ajout en mode "confirmer la date de tel match" plutôt
// que de créer un modal HTML dédié.
let _matchEnConfirmation = null;

function ouvrirConfirmerDate(matchId) {
  _matchEnConfirmation = matchId;
  document.getElementById('modalMatchsTitre').textContent = 'Confirmer la date du match';
  document.getElementById('modalMatchsFormLabel').textContent = 'Date / horaire / stade définitifs';
  document.getElementById('mExtGroup').style.display = 'none';
  document.getElementById('mTypeGroup').style.display = 'none';
  document.getElementById('mDate').value = '';
  document.getElementById('mHeure').value = '';
  document.getElementById('mStade').value = '';
  const btn = document.getElementById('modalMatchsSubmitBtn');
  btn.textContent = '✅ Confirmer';
  btn.setAttribute('onclick', 'doConfirmerDateMatch()');
  document.getElementById('modalMatchsCancelBtn').style.display = '';
  showModal('modalMatchs');
  setTimeout(() => document.getElementById('mDate').focus(), 150);
}

function annulerConfirmerDate() {
  _matchEnConfirmation = null;
  document.getElementById('modalMatchsTitre').textContent = 'Calendrier matchs';
  document.getElementById('modalMatchsFormLabel').textContent = 'Ajouter un match';
  document.getElementById('mExtGroup').style.display = '';
  document.getElementById('mTypeGroup').style.display = '';
  document.getElementById('mDate').value = '';
  document.getElementById('mHeure').value = '';
  document.getElementById('mStade').value = '';
  const btn = document.getElementById('modalMatchsSubmitBtn');
  btn.textContent = '+ Ajouter';
  btn.setAttribute('onclick', 'doAjouterMatch()');
  document.getElementById('modalMatchsCancelBtn').style.display = 'none';
}

async function doConfirmerDateMatch() {
  if (!_matchEnConfirmation) return;
  const date = document.getElementById('mDate').value;
  const horaire = document.getElementById('mHeure').value || null;
  const stade = document.getElementById('mStade').value || null;
  if (!date) return toast('Date requise', 'error');
  try {
    await UL.confirmerDateMatch(_matchEnConfirmation, { date, horaire, stade });
    toast('Date confirmée ✅', 'success');
    annulerConfirmerDate();
    loadMatchsList();
    if (document.getElementById('pageCalendrier')?.classList.contains('active')) loadCalendrier();
  } catch(e) { toast(e.message || 'Impossible de confirmer la date', 'error'); }
}

async function doRouvrirConfirmation(id) {
  if (!confirm('Repasser ce match en "date à confirmer" ?')) return;
  try {
    await UL.rouvrirConfirmationMatch(id);
    toast('Match repassé en attente de confirmation', 'success');
    loadMatchsList();
    if (document.getElementById('pageCalendrier')?.classList.contains('active')) loadCalendrier();
  } catch(e) { toast(e.message || 'Impossible de rouvrir la confirmation', 'error'); }
}

async function doSupprimerMatch(id) {
  if (!confirm('Supprimer ce match ?')) return;
  try { await UL.deleteMatch(id); toast('Match supprimé', 'success'); loadMatchsList(); }
  catch(e) { toast(e.message || 'Impossible de supprimer ce match', 'error'); }
}
document.getElementById('modalMatchs')?.addEventListener('ul:show', loadMatchsList);

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

// ─── CHARTE (Bureau+) ───────────────────────────────────────────
async function loadGererCharte() {
  try {
    const charte = await UL.getCharteActive();
    const infoEl = document.getElementById('gererCharteInfo');
    if (!charte) {
      document.getElementById('gcNom').value = '';
      document.getElementById('gcDateFin').value = '';
      document.getElementById('gcContenu').value = '';
      if (infoEl) infoEl.textContent = 'Aucune charte active — la sauvegarde en créera une.';
      return;
    }
    document.getElementById('gcNom').value = charte.nom || '';
    document.getElementById('gcDateFin').value = charte.date_fin_validite || '';
    document.getElementById('gcContenu').value = charte.contenu || '';
    if (infoEl) infoEl.textContent = `Version active actuelle créée le ${new Date(charte.created_at).toLocaleDateString('fr-FR')}.`;
  } catch(e) { toast('Erreur chargement de la charte', 'error'); }
}

async function doSauvegarderCharte() {
  const nom = document.getElementById('gcNom').value.trim();
  const contenu = document.getElementById('gcContenu').value.trim();
  const dateFin = document.getElementById('gcDateFin').value || null;
  if (!nom || !contenu) return toast('Nom et contenu requis', 'error');
  if (!confirm('Publier cette nouvelle version ? Tous les membres devront resigner la charte avant de pouvoir continuer à utiliser l\'app.')) return;
  try {
    await UL.publierNouvelleCharte({ nom, contenu, dateFin });
    toast('Nouvelle version de la charte publiée ✅', 'success');
    showPage('pageAdmin');
  } catch(e) { toast(e.message || 'Impossible de publier la charte', 'error'); }
}
