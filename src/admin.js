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
        <button class="btn btn-sm btn-danger" aria-label="Supprimer ${esc(m.prenom||'')} ${esc(m.nom||'')}" onclick="supprimerMembre('${m.id}','${esc(m.prenom||'')} ${esc(m.nom||'')}')">🗑 Supprimer</button>
      </div>
    </div>`).join('');
}
// Roles fonctionnels définis pour le modal
const ROLES_DEFS = [
  { key:'admin_app',       label:'⚙️ Admin App – Accès total' },
  { key:'bureau_app',      label:'🏆 Bureau – Gestion générale' },
  { key:'cellule_tifo',    label:'🎨 Cellule Tifo' },
  { key:'cellule_depl',    label:'🚌 Cellule Déplacement – création/édition + scan' },
  { key:'distributeur_depl',   label:'🎫 Distributeur Déplacement – scan uniquement' },
  { key:'cellule_matos',   label:'🎒 Cellule Matos – création/édition + scan' },
  { key:'distributeur_matos',  label:'📦 Distributeur Matos – scan uniquement' },
  { key:'cellule_sticks',  label:'🎟️ Cellule Sticks – création/édition + scan' },
  { key:'distributeur_sticks', label:'🏷️ Distributeur Sticks – scan uniquement' },
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
  document.getElementById('editValideTifo').checked = !!m.valide_tifo;

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
    // role="checkbox" + aria-checked + tabindex : sans ces attributs, un
    // lecteur d'écran ne peut pas percevoir que cette ligne est une case à
    // cocher, et le clavier (Tab puis Espace/Entrée) ne fonctionne pas —
    // ce <div> est sinon invisible pour qui n'utilise pas la souris/le tactile.
    return `<div onclick="toggleRole('${r.key}',this)" onkeydown="onKeydownRole(event,'${r.key}',this)"
      data-role="${r.key}" role="checkbox" aria-checked="${actif}" tabindex="0"
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

// Active/désactive un rôle au clavier (Espace ou Entrée), en plus du clic
// souris/tactile géré par toggleRole. Sans ce gestionnaire, une case
// focusée au clavier (Tab) ne réagirait à aucune touche.
function onKeydownRole(event, key, rowEl) {
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    toggleRole(key, rowEl);
  }
}

function toggleRole(key, rowEl) {
  if (_rolesActifs.has(key)) {
    _rolesActifs.delete(key);
    rowEl.setAttribute('aria-checked', 'false');
    rowEl.style.background = 'rgba(255,255,255,.07)';
    rowEl.style.border = '1.5px solid rgba(255,255,255,.12)';
    const box = rowEl.querySelector('div');
    box.style.background = 'transparent';
    box.style.borderColor = '#4B5563';
    box.innerHTML = '';
    rowEl.querySelector('span').style.color = '#94A3B8';
  } else {
    _rolesActifs.add(key);
    rowEl.setAttribute('aria-checked', 'true');
    rowEl.style.background = 'rgba(26,86,219,0.18)';
    rowEl.style.border = '1.5px solid #1A56DB';
    const box = rowEl.querySelector('div');
    box.style.background = '#1A56DB';
    box.style.borderColor = '#1A56DB';
    box.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" stroke="white" stroke-width="2" fill="none"/></svg>';
    rowEl.querySelector('span').style.color = '#E2E8F0';
  }
}
async function doSauvegarderMembre(btn) {
  const id = document.getElementById('editMembreId').value;
  const texteOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    await UL.updateMembre(id, {
      prenom: document.getElementById('editPrenom').value.trim(),
      nom: document.getElementById('editNom').value.trim(),
      pseudo_telegram: document.getElementById('editTelegram').value.trim(),
      email: document.getElementById('editEmail').value.trim() || null,
      statut: document.getElementById('editStatut').value,
      valide_tifo: document.getElementById('editValideTifo').checked,
      section_id: document.getElementById('editSection').value || null,
      roles_app: Array.from(_rolesActifs),
    });
    toast('Membre mis à jour ✅', 'success');
    closeModal('modalEditMembre');
    loadMembres();
  } catch(e) {
    toast('Erreur: ' + (e.message||''), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
  }
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
async function doPublierAnnonce(btn) {
  const titre = document.getElementById('annonceTitre').value.trim();
  const contenu = document.getElementById('annonceContenu').value.trim();
  const cat = document.getElementById('annonceCat').value;
  if (!titre || !contenu) return toast('Titre et contenu requis', 'error');
  const texteOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    await UL.publierAnnonce(titre, contenu, cat);
    toast('Annonce publiée ✅', 'success');
    closeModal('modalAnnonce');
    document.getElementById('annonceTitre').value = '';
    document.getElementById('annonceContenu').value = '';
    loadAccueil();
  } catch(e) {
    toast(e.message || 'Une erreur est survenue', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
  }
}

// ─── MATCHS ───────────────────────────────────────────────────
// Liste des matchs chargée par loadMatchsList, conservée pour permettre à
// ouvrirModifierMatchParId() de retrouver l'objet match complet sans
// resolliciter le réseau ni sérialiser l'objet dans un attribut onclick
// (fragile avec apostrophes/accents — cf. esc() utilisé partout ailleurs
// pour le texte, mais inadapté à un objet entier).
let allMatchsAdmin = [];

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
  const btn = document.getElementById('modalMatchsSubmitBtn');
  const texteOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    await UL.addMatch(data);
    toast('Match ajouté ✅', 'success');
    loadMatchsList();
  } catch(e) {
    toast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
  }
}

function ouvrirModifierMatchParId(matchId) {
  const match = allMatchsAdmin.find(m => m.id === matchId);
  if (!match) return toast('Match introuvable', 'error');
  ouvrirModifierMatch(matchId, match);
}

async function loadMatchsList() {
  try {
    const matchs = await UL.getMatchs();
    allMatchsAdmin = matchs;
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
          <button class="btn btn-sm btn-secondary" onclick="ouvrirModifierMatchParId('${m.id}')">✏️</button>
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
// Modification complète d'un match (tous les champs) — même principe de
// swap dynamique du modal modalMatchs, ajouté comme 3e mode aux côtés
// d'ajout et de confirmation de date.
let _matchEnModification = null;

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

// Ouvre le formulaire en mode édition complète : adversaire, date, heure,
// type (domicile/extérieur), stade, compétition et journée — tous les
// champs visibles, contrairement au mode "confirmer la date" qui en
// masque une partie. mComp/mJournee sont ajoutés au modal spécifiquement
// pour ce mode (cf. modalMatchs dans index.html).
function ouvrirModifierMatch(matchId, match) {
  _matchEnModification = matchId;
  _matchEnConfirmation = null;
  document.getElementById('modalMatchsTitre').textContent = 'Modifier le match';
  document.getElementById('modalMatchsFormLabel').textContent = 'Tous les champs';
  document.getElementById('mExtGroup').style.display = '';
  document.getElementById('mTypeGroup').style.display = '';
  document.getElementById('mCompGroup').style.display = '';
  document.getElementById('mExt').value = match.type === 'domicile' ? (match.equipe_exterieur || '') : (match.equipe_domicile || '');
  document.getElementById('mDate').value = match.date || '';
  document.getElementById('mHeure').value = match.horaire ? match.horaire.slice(0,5) : '';
  document.getElementById('mType').value = match.type || 'exterieur';
  document.getElementById('mStade').value = match.stade || '';
  document.getElementById('mComp').value = match.competition || 'Ligue 1';
  document.getElementById('mJournee').value = match.journee || '';
  const btn = document.getElementById('modalMatchsSubmitBtn');
  btn.textContent = '💾 Enregistrer';
  btn.setAttribute('onclick', 'doModifierMatch()');
  document.getElementById('modalMatchsCancelBtn').style.display = '';
  showModal('modalMatchs');
}

async function doModifierMatch() {
  if (!_matchEnModification) return;
  const adversaire = document.getElementById('mExt').value;
  const date = document.getElementById('mDate').value;
  const type = document.getElementById('mType').value;
  if (!adversaire || !date) return toast('Adversaire et date requis', 'error');
  // Paris FC est toujours l'une des deux équipes — laquelle dépend du type
  // (domicile/extérieur), exactement comme pour la création (doAjouterMatch).
  const data = {
    equipe_domicile: type === 'domicile' ? 'Paris FC' : adversaire,
    equipe_exterieur: type === 'domicile' ? adversaire : 'Paris FC',
    date,
    horaire: document.getElementById('mHeure').value || null,
    type,
    stade: document.getElementById('mStade').value || null,
    competition: document.getElementById('mComp').value.trim() || 'Ligue 1',
    journee: parseInt(document.getElementById('mJournee').value) || null,
  };
  const btn = document.getElementById('modalMatchsSubmitBtn');
  const texteOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    await UL.updateMatch(_matchEnModification, data);
    toast('Match modifié ✅', 'success');
    annulerConfirmerDate();
    loadMatchsList();
    if (document.getElementById('pageCalendrier')?.classList.contains('active')) loadCalendrier();
  } catch(e) {
    toast(e.message, 'error');
    // Ce bouton change de libellé/onclick selon le mode actif (ajout,
    // modification, confirmation de date — cf. annulerConfirmerDate) : en
    // cas d'échec on le réactive avec le texte qu'il avait avant l'appel,
    // pas un texte générique, car le mode courant n'a pas changé.
    if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
  }
}

function annulerConfirmerDate() {
  _matchEnConfirmation = null;
  _matchEnModification = null;
  document.getElementById('modalMatchsTitre').textContent = 'Calendrier matchs';
  document.getElementById('modalMatchsFormLabel').textContent = 'Ajouter un match';
  document.getElementById('mExtGroup').style.display = '';
  document.getElementById('mTypeGroup').style.display = '';
  document.getElementById('mCompGroup').style.display = 'none';
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
  const btn = document.getElementById('modalMatchsSubmitBtn');
  const texteOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    await UL.confirmerDateMatch(_matchEnConfirmation, { date, horaire, stade });
    toast('Date confirmée ✅', 'success');
    annulerConfirmerDate();
    loadMatchsList();
    if (document.getElementById('pageCalendrier')?.classList.contains('active')) loadCalendrier();
  } catch(e) {
    toast(e.message || 'Impossible de confirmer la date', 'error');
    if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
  }
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
    // Notification push en plus de l'email — n'échoue jamais l'action de
    // validation elle-même si l'envoi échoue (cf. envoyerNotificationPush,
    // qui avale ses propres erreurs). Si le membre n'a jamais activé les
    // notifications sur aucun appareil, l'Edge Function ne fait rien — il
    // recevra quand même l'email.
    UL.envoyerNotificationPush(
      membreId,
      '✅ Compte activé !',
      'Ton compte Ultras Lutetia a été validé par le bureau — tu peux te connecter.',
      '/ultras-lutetia/',
    );
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

// ─── COMITÉ DE PASSAGE — Page Membres (vue unique) ─────────────
// Fusion de l'ancienne modal "Évaluation membres" (notation 1-3) et de
// la page "Gérer les membres" (recherche + blocage) — un seul écran,
// une seule liste. Contrairement à pageMembres (Bureau+, gestion
// complète : modifier fiche, reset mdp, supprimer compte), cette page
// n'expose que : la notation (Sympathisant/Draft uniquement — les
// autres niveaux n'ont pas de catégorie de notation, ils ont déjà
// passé l'évaluation), et le blocage/déblocage, JAMAIS sur un membre
// Bureau/Admin — ces niveaux restent hors de portée du Comité.
// renderCarteEvaluation/doNoterMembre sont définis dans tifos.js
// (modules en globals window-exposed, partage normal sur ce projet).
let _allMembresComite = [];
// État combiné des filtres — partagé par les deux boutons d'export, qui
// exportent toujours exactement ce qui est affiché à l'écran.
let _filtresComite = { recherche: '', statut: '', sectionId: '', niveau: '' };

async function loadMembresComite() {
  document.getElementById('membresComiteList').innerHTML = '<div class="empty-state"><div>⏳</div>Chargement…</div>';
  // Réinitialisation à chaque entrée sur la page : le HTML des boutons de
  // filtre et le <select> sections sont régénérés ci-dessous, donc l'état
  // JS doit repartir à zéro avec eux pour rester synchronisé (sinon un
  // filtre resté actif en mémoire d'une visite précédente ne serait plus
  // reflété visuellement, mais s'appliquerait quand même).
  _filtresComite = { recherche: '', statut: '', sectionId: '', niveau: '' };
  const searchInput = document.getElementById('searchMembreComite');
  if (searchInput) searchInput.value = '';
  document.querySelectorAll('#filtresStatutComite .filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.statut === ''));
  document.querySelectorAll('#filtresNiveauComite .filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.niveau === ''));
  try {
    const [membres, sections] = await Promise.all([
      UL.getAllMembres(),
      UL.getSections(),
    ]);
    const membreIds = membres.map(m => m.id);
    const [evals, participations] = await Promise.all([
      UL.getEvaluationsCourantesBatch(membreIds),
      UL.getParticipationBatch(membreIds),
    ]);
    membres.forEach(m => {
      m._evalCourante = evals[m.id] || {};
      m._participation = participations[m.id] || { tifoPresent: 0, tifoAbsent: 0, deplPaye: 0, deplNonPaye: 0 };
    });
    _allMembresComite = membres;

    const selSection = document.getElementById('filterSectionComite');
    selSection.innerHTML = '<option value="">Toutes sections</option>' +
      sections.map(s => `<option value="${s.id}">${esc(s.nom)}</option>`).join('');

    appliquerFiltresComite();
  } catch(e) { toast('Erreur chargement membres', 'error'); }
}

function filtrerMembresComite() {
  _filtresComite.recherche = document.getElementById('searchMembreComite').value.trim().toLowerCase();
  appliquerFiltresComite();
}
function filtrerStatutComite(statut) {
  _filtresComite.statut = statut;
  document.querySelectorAll('#filtresStatutComite .filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.statut === statut));
  appliquerFiltresComite();
}
function filtrerNiveauComite(niveau) {
  _filtresComite.niveau = niveau;
  document.querySelectorAll('#filtresNiveauComite .filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.niveau === niveau));
  appliquerFiltresComite();
}
function filtrerSectionComite() {
  _filtresComite.sectionId = document.getElementById('filterSectionComite').value;
  appliquerFiltresComite();
}

// Le niveau d'un membre = sa note dans SA catégorie de notation
// (comite_sympa pour un Sympathisant, comite_draft pour un Draft).
// Un membre sans catégorie applicable (Confirmé+) est toujours "non noté".
function niveauNoteComite(m) {
  const categorie = categorieNotationComite(m);
  return categorie ? (m._evalCourante?.[categorie] ?? null) : null;
}

// Applique recherche + statut + section + niveau ensemble (ET logique),
// puis affiche le résultat. C'est cette liste filtrée, et uniquement
// elle, qui sera utilisée par les deux boutons d'export.
function appliquerFiltresComite() {
  const { recherche, statut, sectionId, niveau } = _filtresComite;
  const filtres = _allMembresComite.filter(m => {
    if (recherche) {
      const champs = [m.nom, m.prenom, m.pseudo_telegram, m.email, m.ville, m.code_postal, m.section?.nom]
        .filter(Boolean).join(' ').toLowerCase();
      if (!champs.includes(recherche)) return false;
    }
    if (statut && m.statut !== statut) return false;
    if (sectionId && m.section_id !== sectionId) return false;
    if (niveau) {
      const n = niveauNoteComite(m);
      if (niveau === 'non_note') { if (n !== null) return false; }
      else if (n !== Number(niveau)) return false;
    }
    return true;
  });
  renderMembresComiteListe(filtres);
}

// Tri : niveau hiérarchique d'abord (Admin en tête, Sympathisant en
// dernier), alphabétique au sein d'un même niveau.
const ORDRE_STATUT_COMITE = { admin: 0, bureau: 1, membre_cellule: 2, confirme: 3, draft: 4, sympathisant: 5 };
function niveauMembreComite(m) {
  if (isAdmin(m)) return 0;
  if (isBureau(m)) return 1;
  if (isCellule(m)) return 2;
  return ORDRE_STATUT_COMITE[m.statut] ?? 3;
}

// Liste actuellement filtrée/triée, mémorisée pour que les exports
// portent exactement sur ce qui est affiché (évite de retrier deux fois
// avec un risque de léger écart d'ordre entre affichage et export).
let _membresComiteTriesAffiches = [];

function renderMembresComiteListe(membres) {
  const el = document.getElementById('membresComiteList');
  const tries = [...membres].sort((a, b) => {
    const na = niveauMembreComite(a), nb = niveauMembreComite(b);
    if (na !== nb) return na - nb;
    return `${a.prenom||''} ${a.nom||''}`.trim().toLowerCase()
      .localeCompare(`${b.prenom||''} ${b.nom||''}`.trim().toLowerCase());
  });
  _membresComiteTriesAffiches = tries;
  if (!tries.length) { el.innerHTML = '<div class="empty-state"><div>👥</div>Aucun membre</div>'; return; }
  el.innerHTML = tries.map(m => renderMembreComiteCard(m)).join('');
}

const STATUT_LABEL_COMITE = {
  sympathisant: '💙 Sympathisant', draft: '🚀 Draft', confirme: '🏅 Confirmé',
};
// Catégorie de notation applicable selon le statut — null si aucune
// (Confirmé+ a déjà passé l'évaluation, pas de catégorie pour lui ici).
function categorieNotationComite(m) {
  if (m.statut === 'sympathisant') return 'comite_sympa';
  if (m.statut === 'draft') return 'comite_draft';
  return null;
}
function renderMembreComiteCard(m) {
  // Niveau protégé = Bureau ou Admin (via roles_app[]) — jamais bloqué
  // par le Comité de passage, quel que soit le statut affiché.
  const protege = isAdmin(m) || isBureau(m);
  const labelStatut = isAdmin(m) ? '⚙️ Admin'
    : isBureau(m) ? '🏆 Bureau'
    : isCellule(m) ? '🛡️ Membre Cellule'
    : STATUT_LABEL_COMITE[m.statut] || m.statut;
  const categorie = categorieNotationComite(m);
  return `<div class="card" style="margin-bottom:8px;padding:12px;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div class="avatar" style="width:36px;height:36px;font-size:13px;flex-shrink:0;">${((m.prenom||'?')[0]+(m.nom||'?')[0]).toUpperCase()}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;">${esc(m.prenom)} ${esc(m.nom)}</div>
        <div style="font-size:11px;color:var(--gris);">@${esc(m.pseudo_telegram)} · ${labelStatut}</div>
        ${m.email ? `<div style="font-size:11px;color:var(--gris);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">✉️ ${esc(m.email)}</div>` : ''}
        ${m.section ? `<div style="font-size:11px;color:var(--bleu-clair);margin-top:1px;">🛡️ ${esc(m.section.nom)}</div>` : ''}
      </div>
      <span class="badge ${m.actif?'badge-vert':'badge-rouge'}" style="flex-shrink:0;font-size:10px;">${m.actif?'✅ Actif':'⛔ Bloqué'}</span>
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:11px;color:var(--gris);">
      <span>🖌️ ${m._participation?.tifoPresent ?? 0} présent${(m._participation?.tifoPresent ?? 0) === 1 ? '' : 's'} · ${m._participation?.tifoAbsent ?? 0} absent${(m._participation?.tifoAbsent ?? 0) === 1 ? '' : 's'}</span>
      <span>🚌 ${m._participation?.deplPaye ?? 0} payé${(m._participation?.deplPaye ?? 0) === 1 ? '' : 's'} · ${m._participation?.deplNonPaye ?? 0} non payé${(m._participation?.deplNonPaye ?? 0) === 1 ? '' : 's'}</span>
    </div>
    ${categorie ? `
    <div style="display:flex;gap:4px;margin-top:10px;" data-eval-boutons="${categorie}_${m.id}">
      ${[1,2,3].map(n => {
        const emoji = EVAL_EMOJI[categorie];
        const actif = (m._evalCourante?.[categorie] ?? null) === n;
        return `<button class="btn btn-sm ${actif?'btn-primary':'btn-secondary'}" style="padding:4px 10px;font-size:12px;"
          onclick="doNoterMembre('${m.id}','${categorie}',${n},this)">${emoji.repeat(n)}</button>`;
      }).join('')}
    </div>` : ''}
    ${!protege ? `
    <div style="margin-top:10px;">
      <button class="btn btn-sm ${m.actif?'btn-danger':'btn-success'}" onclick="toggleMembreComite('${m.id}',${!m.actif})">
        ${m.actif?'⛔ Bloquer':'✅ Débloquer'}
      </button>
    </div>` : `
    <div style="margin-top:8px;font-size:11px;color:var(--gris);opacity:.7;">🔒 Hors de portée du Comité de passage</div>`}
  </div>`;
}

async function toggleMembreComite(id, actif) {
  try {
    await UL.toggleBlocageMembre(id, actif);
    toast(actif ? 'Compte réactivé' : 'Compte bloqué', 'success');
    loadMembresComite();
  } catch(e) { toast('Impossible de modifier le statut du membre', 'error'); }
}

// ─── Exports (Telegram + CSV) ───────────────────────────────────
// Les deux portent toujours sur _membresComiteTriesAffiches, c'est-à-
//-dire exactement la liste actuellement filtrée et triée à l'écran —
// jamais sur la liste complète : changer un filtre change ce qui sera
// exporté, sans bouton de validation séparé.
function niveauLabelComite(m) {
  const n = niveauNoteComite(m);
  if (n === null) return '—';
  const categorie = categorieNotationComite(m);
  return EVAL_EMOJI[categorie].repeat(n);
}

function copierListeMembresComite() {
  const membres = _membresComiteTriesAffiches;
  if (!membres.length) return toast('Aucun membre à exporter avec ces filtres', 'error');
  const entete = 'Pseudo | Prénom Nom | Statut | Section | Niveau';
  const lignes = membres.map(m =>
    `@${m.pseudo_telegram||'?'} | ${m.prenom||''} ${m.nom||''} | ${m.statut||''} | ${m.section?.nom||'—'} | ${niveauLabelComite(m)}`);
  navigator.clipboard.writeText([entete, ...lignes].join('\n'))
    .then(() => toast(`Liste copiée (${membres.length}) !`, 'success'));
}

// Échappe une valeur pour un champ CSV (RFC 4180) : entoure de guillemets
// si la valeur contient une virgule, un guillemet ou un retour à la
// ligne, et double les guillemets internes.
function csvEscape(val) {
  const s = String(val ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exporterCsvMembresComite() {
  const membres = _membresComiteTriesAffiches;
  if (!membres.length) return toast('Aucun membre à exporter avec ces filtres', 'error');
  const entete = ['Pseudo', 'Prénom', 'Nom', 'Email', 'Statut', 'Section', 'Niveau', 'Tifo présents', 'Tifo absents', 'Dépl. payés', 'Dépl. non payés'];
  const lignes = membres.map(m => [
    m.pseudo_telegram || '', m.prenom || '', m.nom || '', m.email || '',
    m.statut || '', m.section?.nom || '', niveauLabelComite(m),
    m._participation?.tifoPresent ?? 0, m._participation?.tifoAbsent ?? 0,
    m._participation?.deplPaye ?? 0, m._participation?.deplNonPaye ?? 0,
  ]);
  // BOM UTF-8 en tête pour qu'Excel reconnaisse l'encodage et affiche
  // correctement les accents/emoji sans réglage manuel à l'ouverture.
  const csv = '\uFEFF' + [entete, ...lignes].map(l => l.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `membres_comite_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`Export CSV généré (${membres.length}) !`, 'success');
}
