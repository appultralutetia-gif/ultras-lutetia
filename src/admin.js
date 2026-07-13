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
        ${isAdmin(UL.getCurrentMembre()) ? `<button class="btn btn-sm btn-secondary" onclick="doConnexionEnTantQue('${m.id}','${esc(m.prenom||'')} ${esc(m.nom||'')}')">🕵️ Se connecter en tant que</button>` : ''}
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
// Mode d'ouverture du modal partagé modalEditMembre :
// - 'complet' : page Membres (Bureau+) — tous les champs, tous les rôles.
// - 'comite'  : page Comité de passage — identité en lecture seule
//   (champs masqués), rôles Admin/Bureau exclus de la liste (un membre
//   éligible au Comité — donc jamais protégé, cf. renderMembreComiteCard
//   — ne les a de toute façon jamais ; les proposer ici permettrait au
//   Comité de se créer un accès Admin/Bureau lui-même, jamais voulu).
let _modalEditMembreMode = 'complet';
// Statut du membre AVANT ouverture du modal — comparé au nouveau statut
// dans doSauvegarderMembre pour détecter une vraie première validation
// (sympathisant → draft/confirmé) et déclencher l'email + la notification
// (demande Remi 09/07/2026 : jusqu'ici, seul le flux dédié "Demandes
// d'inscription en attente" envoyait cet email — pas ce modal-ci, alors
// que le Comité de passage valide justement par ce chemin).
let _statutAvantEditionMembre = null;

async function openEditMembre(id) {
  const m = allMembres.find(x => x.id === id);
  if (!m) return;
  await _ouvrirModalEditMembre(m, 'complet');
}

// Ouverture depuis la page Comité de passage — cf. demande Remi
// 09/07/2026 : le Comité doit pouvoir modifier Statut UL, Section et
// Rôles Fonctionnels (jusqu'ici : uniquement notation + blocage). Jamais
// disponible pour un membre protégé (Bureau/Admin) — le bouton n'est de
// toute façon affiché que pour les membres non-protégés, cf.
// renderMembreComiteCard.
async function openEditMembreComite(id) {
  const m = _allMembresComite.find(x => x.id === id);
  if (!m) return;
  await _ouvrirModalEditMembre(m, 'comite');
}

async function _ouvrirModalEditMembre(m, mode) {
  _modalEditMembreMode = mode;
  _statutAvantEditionMembre = m.statut;
  document.getElementById('modalEditMembreTitre').textContent =
    mode === 'comite' ? 'Modifier statut & accès' : 'Modifier le membre';
  document.querySelectorAll('.champ-identite-membre').forEach(el => {
    el.style.display = mode === 'comite' ? 'none' : '';
  });

  document.getElementById('editMembreId').value = m.id;
  document.getElementById('editPrenom').value = m.prenom||'';
  document.getElementById('editNom').value = m.nom||'';
  document.getElementById('editTelegram').value = m.pseudo_telegram||'';
  document.getElementById('editEmail').value = m.email||'';
  // Statut UL : seulement sympathisant/draft/confirme
  const statutUL = ['visiteur','sympathisant','draft','confirme'].includes(m.statut) ? m.statut : 'confirme';
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

  // Rôles fonctionnels — Admin/Bureau exclus de la liste en mode 'comite'
  // (cf. commentaire sur _modalEditMembreMode ci-dessus).
  _rolesActifs = new Set(Array.isArray(m.roles_app) ? m.roles_app : []);
  const rolesAffiches = mode === 'comite'
    ? ROLES_DEFS.filter(r => r.key !== 'admin_app' && r.key !== 'bureau_app')
    : ROLES_DEFS;
  const container = document.getElementById('rolesContainer');
  container.innerHTML = rolesAffiches.map(r => {
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
  const nouveauStatut = document.getElementById('editStatut').value;
  const texteOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    const membre = await UL.updateMembre(id, {
      prenom: document.getElementById('editPrenom').value.trim(),
      nom: document.getElementById('editNom').value.trim(),
      pseudo_telegram: document.getElementById('editTelegram').value.trim(),
      email: document.getElementById('editEmail').value.trim() || null,
      statut: nouveauStatut,
      valide_tifo: document.getElementById('editValideTifo').checked,
      section_id: document.getElementById('editSection').value || null,
      roles_app: Array.from(_rolesActifs),
    });
    toast('Membre mis à jour ✅', 'success');

    // Email + notification de validation — seulement pour une vraie
    // PREMIÈRE validation (sympathisant → draft/confirmé), jamais pour un
    // simple changement ultérieur (ex: draft → confirmé plus tard, ou une
    // correction de nom) qui enverrait un "bienvenue" hors de propos.
    // Complète validerDemandeAdmin (pageDemandesAdmin), qui couvrait déjà
    // ce cas mais uniquement depuis ce flux-là — pas depuis ce modal-ci,
    // pourtant emprunté par le Comité de passage pour valider (demande
    // Remi 09/07/2026).
    if (_statutAvantEditionMembre === 'sympathisant' && nouveauStatut !== 'sympathisant') {
      if (membre?.email) {
        UL.envoyerEmailValidation(membre).catch(e => {
          console.error('[UL] Échec envoi email de validation:', e);
          toast(`⚠️ Compte activé, mais l'email n'a pas pu être envoyé (${e.message||'erreur inconnue'})`, 'error');
        });
      }
      UL.envoyerNotificationPush(
        id,
        '✅ Compte activé !',
        'Ton compte Ultras Lutetia a été validé — tu peux te connecter.',
        '/ultras-lutetia/',
      );
    }

    closeModal('modalEditMembre');
    if (_modalEditMembreMode === 'comite') loadMembresComite();
    else loadMembres();
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

// Connexion en tant que (Admin uniquement, cf. bouton conditionné à
// isAdmin dans renderMembres — même vérification refaite côté serveur
// dans l'Edge Function, qui ne fait pas confiance à l'UI). Le lien
// généré REMPLACE la session actuelle si ouvert dans le même navigateur
// (stockage de session partagé par origine, pas par onglet) — d'où
// l'avertissement explicite avant de l'ouvrir, et l'ouverture dans un
// nouvel onglet plutôt qu'en redirigeant celui-ci.
async function doConnexionEnTantQue(membreId, nomAffiche) {
  if (!confirm(
    `Générer un lien de connexion pour ${nomAffiche} ?\n\n` +
    `⚠️ Si tu l'ouvres dans ce même navigateur, ça remplacera TA session Admin actuelle par la sienne (la session est partagée par le navigateur, pas par onglet).\n\n` +
    `Pour garder ta session Admin active en parallèle, ouvre le lien dans une fenêtre de navigation privée.`
  )) return;
  try {
    const res = await UL.genererLienConnexionAdmin(membreId);
    window.open(res.lien, '_blank');
    toast(`Lien généré pour ${nomAffiche} ✅ — ouvre-le en navigation privée pour garder ta session Admin`, 'success');
  } catch(e) { toast(e.message || 'Impossible de générer le lien', 'error'); }
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


function switchStatsTab(tab) {
  document.getElementById('sectionStatsGeneral').style.display = tab === 'general' ? 'block' : 'none';
  document.getElementById('sectionStatsTifo').style.display = tab === 'tifo' ? 'block' : 'none';
  document.getElementById('tabStatsGeneral').classList.toggle('active', tab === 'general');
  document.getElementById('tabStatsTifo').classList.toggle('active', tab === 'tifo');
  // Chargement paresseux (12/07/2026) : les stats Tifo demandent plusieurs
  // requêtes (sessions + présences + population + sections) — inutile de
  // les lancer tant que l'admin n'a pas cliqué sur cet onglet. _tifoCharge
  // évite de tout recharger à chaque clic une fois que c'est déjà affiché.
  if (tab === 'tifo' && !_statsTifoCharge) {
    _statsTifoCharge = true;
    loadStatsTifo();
  }
}
let _statsTifoCharge = false;

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
          <div class="stat-card"><div class="stat-value">${mesStats.presencesDomicile}</div><div class="stat-label">Présent domicile</div></div>
          <div class="stat-card"><div class="stat-value">${mesStats.presencesExterieur}</div><div class="stat-label">Présent extérieur</div></div>
        </div>
      </div>`;
  } catch(e) { el.innerHTML = '<div class="empty-state"><div>⚠️</div>Erreur chargement</div>'; }
}

// ─── STATS TIFO (12/07/2026, demande Remi) ─────────────────────
function barreHtml(label, valeur, max, couleur) {
  const pct = max > 0 ? Math.round((valeur / max) * 100) : 0;
  return `
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
        <span>${label}</span><span style="font-weight:700;">${valeur}</span>
      </div>
      <div class="places-bar"><div class="places-fill" style="width:${pct}%;background:${couleur||'var(--bleu)'};"></div></div>
    </div>`;
}

// Courbe combinée (12/07/2026, demande Remi) — SVG simple en polyline,
// pas de dépendance externe. viewBox responsive (s'adapte à la largeur
// du conteneur sur mobile comme desktop). Les deux séries partagent le
// même axe des mois (cf. getStatsTifo → evolution.mois), donc toujours
// alignées point à point même si l'une a des zéros que l'autre n'a pas.
function courbeDoubleSvg(mois, serieALabel, serieAValeurs, serieACouleur, serieBLabel, serieBValeurs, serieBCouleur) {
  if (!mois.length) return '<div class="empty-state" style="padding:12px;"><div>📈</div>Pas assez de données</div>';
  const W = 320, H = 180, padL = 26, padR = 10, padT = 22, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = mois.length;
  const maxY = Math.max(1, ...serieAValeurs, ...serieBValeurs);
  const xFor = i => (n > 1 ? padL + (i / (n - 1)) * plotW : padL + plotW / 2);
  const yFor = v => padT + plotH - (v / maxY) * plotH;
  const ligne = valeurs => valeurs.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' ');
  const points = (valeurs, couleur) => valeurs.map((v, i) => `<circle cx="${xFor(i)}" cy="${yFor(v)}" r="2.8" fill="${couleur}"/>`).join('');
  // Étiquettes de valeur (12/07/2026, demande Remi) — série A (présences,
  // généralement la ligne basse) étiquetée SOUS son point, série B
  // (cumulé, généralement la ligne haute) étiquetée AU-DESSUS — évite le
  // chevauchement la plupart du temps vu que B ≥ A presque toujours
  // (cumul croissant). Reste lisible même quand les deux se frôlent.
  const valeursTexte = (valeurs, couleur, dy) => valeurs.map((v, i) =>
    `<text x="${xFor(i)}" y="${yFor(v) + dy}" font-size="9" font-weight="700" fill="${couleur}" text-anchor="middle">${v}</text>`
  ).join('');
  const labelMois = m => {
    const l = new Date(m + '-01').toLocaleDateString('fr-FR', { month: 'short' });
    return l.charAt(0).toUpperCase() + l.slice(1).replace('.', '');
  };
  const xLabels = mois.map((m, i) => `<text x="${xFor(i)}" y="${H - 6}" font-size="8" fill="var(--gris)" text-anchor="middle">${labelMois(m)}</text>`).join('');
  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;overflow:visible;display:block;">
      <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="var(--border)" stroke-width="1"/>
      <polyline points="${ligne(serieBValeurs)}" fill="none" stroke="${serieBCouleur}" stroke-width="2" opacity="0.9"/>
      <polyline points="${ligne(serieAValeurs)}" fill="none" stroke="${serieACouleur}" stroke-width="2.2"/>
      ${points(serieBValeurs, serieBCouleur)}
      ${points(serieAValeurs, serieACouleur)}
      ${valeursTexte(serieBValeurs, serieBCouleur, -8)}
      ${valeursTexte(serieAValeurs, serieACouleur, 14)}
      ${xLabels}
    </svg>
    <div style="display:flex;gap:16px;justify-content:center;margin-top:4px;font-size:11px;color:var(--gris);">
      <span style="display:flex;align-items:center;gap:5px;"><span style="width:9px;height:9px;border-radius:50%;background:${serieACouleur};display:inline-block;"></span>${serieALabel}</span>
      <span style="display:flex;align-items:center;gap:5px;"><span style="width:9px;height:9px;border-radius:50%;background:${serieBCouleur};display:inline-block;"></span>${serieBLabel}</span>
    </div>`;
}

// ─── STATS TIFO (12/07/2026, enrichie le 12/07/2026 — demande Remi) ────
let _statsTifoActuel = null;        // dernier résultat serveur (saison affichée)
let _statsTifoPrecedent = null;     // stats de la saison précédente (comparaison #11), ou null
let _statsTifoSaisonsCache = [];    // liste des saisons dispo, pour le select
let _statsTifoSaisonSelectionnee = null;
let _statsTifoTypeFiltre = null;    // filtre actif sur le classement (type_session ou null = tous)
let _statsTifoVoirTout = false;     // classement tronqué à 10 ou complet

async function loadStatsTifo(saisonForcee) {
  const el = document.getElementById('statsTifoContent');
  try {
    const saisons = await UL.getSaisonsTifoDisponibles();
    _statsTifoSaisonsCache = saisons;
    const saisonCourante = saisonForcee || _statsTifoSaisonSelectionnee || saisons[0] || null;
    _statsTifoSaisonSelectionnee = saisonCourante;

    const s = await UL.getStatsTifo(saisonCourante);
    _statsTifoActuel = s;
    _statsTifoTypeFiltre = null;
    _statsTifoVoirTout = false;

    // Comparaison saison précédente (#11) — la liste est triée la plus
    // récente en premier (cf. getSaisonsTifoDisponibles), donc l'entrée
    // juste après la saison courante dans le tableau est la précédente.
    // Reste null tant qu'une seule saison existe en base — le bloc de
    // comparaison ne s'affiche simplement pas dans ce cas.
    const idx = saisons.indexOf(saisonCourante);
    const saisonPrecedente = idx >= 0 && idx < saisons.length - 1 ? saisons[idx + 1] : null;
    _statsTifoPrecedent = saisonPrecedente ? await UL.getStatsTifo(saisonPrecedente) : null;

    renderStatsTifo();
  } catch(e) { console.error(e); el.innerHTML = '<div class="empty-state"><div>⚠️</div>Erreur chargement</div>'; }
}

function changerSaisonStatsTifo(saison) { loadStatsTifo(saison); }

function toggleFiltreTypeTifo(type) {
  _statsTifoTypeFiltre = (_statsTifoTypeFiltre === type) ? null : type;
  _statsTifoVoirTout = false;
  renderStatsTifo();
}

function toggleVoirToutClassementTifo() {
  _statsTifoVoirTout = !_statsTifoVoirTout;
  renderStatsTifo();
}

// Classement recalculé côté client depuis presencesDetail — évite un
// aller-retour serveur à chaque clic sur un type dans "Répartition".
function calculerClassementFiltreTifo() {
  const s = _statsTifoActuel;
  if (!_statsTifoTypeFiltre) return s.classement;
  const map = new Map();
  for (const p of s.presencesDetail) {
    if (p.type !== _statsTifoTypeFiltre || !p.membre_id) continue;
    if (!map.has(p.membre_id)) map.set(p.membre_id, { membre: p.membre, nb: 0 });
    map.get(p.membre_id).nb++;
  }
  return [...map.values()].sort((a, b) => b.nb - a.nb);
}

function exporterCsvClassementTifo() {
  const s = _statsTifoActuel;
  const classement = calculerClassementFiltreTifo();
  if (!s || !classement.length) return toast('Aucune donnée à exporter', 'error');
  const entete = ['Rang', 'Prénom', 'Nom', 'Pseudo', 'Nombre de présences'];
  const lignes = classement.map((c, i) => [
    i + 1, c.membre?.prenom || '', c.membre?.nom || '', c.membre?.pseudo_telegram || '', c.nb,
  ]);
  const csv = '\uFEFF' + [entete, ...lignes].map(l => l.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `classement_tifo_${s.saison}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`Export CSV généré (${classement.length}) !`, 'success');
}

// Export PDF (12/07/2026) — approche "conteneur cloné" : on copie le
// contenu déjà rendu de #statsTifoContent dans une zone dédiée
// (#zoneImpressionStatsTifo, cf. styles.css) que le navigateur imprime
// seule via window.print(). Pas de vraie génération PDF côté client
// (pas de dépendance ajoutée) — l'utilisateur choisit "Enregistrer en
// PDF" comme destination dans la boîte de dialogue d'impression, ce que
// tous les navigateurs proposent nativement.
function exporterPdfStatsTifo() {
  const source = document.getElementById('statsTifoContent');
  if (!source) return;
  let conteneur = document.getElementById('zoneImpressionStatsTifo');
  if (!conteneur) {
    conteneur = document.createElement('div');
    conteneur.id = 'zoneImpressionStatsTifo';
    document.body.appendChild(conteneur);
  }
  const dateExport = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  conteneur.innerHTML = `
    <h1 style="font-family:'Bebas Neue',sans-serif;font-size:28px;margin-bottom:2px;">Stats Tifo — Ultras Lutetia</h1>
    <div style="font-size:13px;margin-bottom:20px;">Saison ${esc(_statsTifoActuel?.saison || '')} · Exporté le ${dateExport}</div>
    ${source.innerHTML}`;
  window.print();
}

function renderStatsTifo() {
  const el = document.getElementById('statsTifoContent');
  const s = _statsTifoActuel;
  const labelType = { Tracage: '✏️ Traçage', Assemblage: '🧵 Assemblage', Peinture: '🎨 Peinture' };
  const labelStatut = { confirme: 'Confirmé', draft: 'Draft', sympathisant: 'Sympathisant', visiteur: 'Visiteur' };

  const saisonSelectHtml = `
    <div class="form-group" style="margin-bottom:12px;">
      <select id="statsTifoSaisonSelect" onchange="changerSaisonStatsTifo(this.value)">
        ${_statsTifoSaisonsCache.map(sa => `<option value="${esc(sa)}" ${sa === _statsTifoSaisonSelectionnee ? 'selected' : ''}>Saison ${esc(sa)}</option>`).join('')}
      </select>
    </div>`;

  const maxType = Math.max(1, ...Object.values(s.repartitionType));
  const repartitionTypeHtml = Object.entries(s.repartitionType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `
      <div onclick="toggleFiltreTypeTifo('${type}')" style="cursor:pointer;border-radius:6px;padding:2px 4px;margin:-2px -4px;${_statsTifoTypeFiltre === type ? 'background:rgba(26,86,219,.18);' : ''}">
        ${barreHtml(`${labelType[type] || type}${_statsTifoTypeFiltre === type ? ' · filtre actif ✓' : ''}`, n, maxType)}
      </div>`).join('')
    || '<div class="empty-state" style="padding:12px;"><div>🎨</div>Aucune session</div>';
  const noteFiltreType = `<div style="font-size:11px;color:var(--gris);margin:-6px 0 10px;">👆 Clique un type pour filtrer le classement ci-dessous</div>`;

  const maxLieu = Math.max(1, ...Object.values(s.repartitionLieu));
  const repartitionLieuHtml = Object.entries(s.repartitionLieu)
    .sort((a, b) => b[1] - a[1])
    .map(([lieu, n]) => barreHtml(esc(lieu), n, maxLieu, 'var(--blue-light)')).join('');

  const maxStatut = Math.max(1, ...Object.values(s.presencesParStatut));
  const repartitionStatutHtml = Object.entries(s.presencesParStatut)
    .sort((a, b) => b[1] - a[1])
    .map(([st, n]) => barreHtml(labelStatut[st] || st, n, maxStatut, 'var(--open)')).join('');

  const classementComplet = calculerClassementFiltreTifo();
  const classementAffiche = _statsTifoVoirTout ? classementComplet : classementComplet.slice(0, 10);
  const classementHtml = classementAffiche.map((c, i) => {
    const nom = c.membre ? `${esc(c.membre.prenom)} (@${esc(c.membre.pseudo_telegram || '?')})` : 'Membre inconnu';
    const medaille = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:5px 0;border-bottom:1px solid var(--border);">
        <span>${medaille} ${nom}</span>
        <span class="badge badge-bleu" style="font-size:11px;">${c.nb} présence${c.nb > 1 ? 's' : ''}</span>
      </div>`;
  }).join('') || '<div class="empty-state" style="padding:12px;"><div>🏆</div>Aucune présence enregistrée</div>';
  const boutonVoirTout = classementComplet.length > 10 ? `
    <button class="btn btn-sm btn-secondary" style="width:100%;margin-top:8px;" onclick="toggleVoirToutClassementTifo()">
      ${_statsTifoVoirTout ? '▲ Réduire' : `▼ Voir tout (${classementComplet.length})`}
    </button>` : '';

  const totalPop = s.populationTotal || 0;
  const pctBucket = n => (totalPop ? Math.round((n / totalPop) * 100) : 0);
  const ligneBuckets = (buckets, total) => `
    <div class="tranche-grid" style="grid-template-columns:repeat(5,1fr);">
      ${['0','1','2','3-4','5+'].map(k => `
        <div class="tranche"><div class="tranche-lbl">${k}</div><div class="tranche-val">${buckets[k]}</div><div style="font-size:10px;color:var(--gris);margin-top:2px;">${total ? Math.round((buckets[k]/total)*100) : 0}%</div></div>
      `).join('')}
    </div>`;
  // KPI #6 (12/07/2026) : tranches séparées Confirmé / Draft plutôt que
  // fusionnées — révèle si le décrochage touche plutôt l'un ou l'autre.
  const nbConfirme = s.buckets ? Object.values(s.bucketsParStatut.confirme).reduce((a,b)=>a+b,0) : 0;
  const nbDraft = s.bucketsParStatut ? Object.values(s.bucketsParStatut.draft).reduce((a,b)=>a+b,0) : 0;
  const bucketsHtml = `
    <div style="font-size:11px;color:var(--open);margin:8px 0 4px;font-weight:700;">Confirmés (${nbConfirme})</div>
    ${ligneBuckets(s.bucketsParStatut.confirme, nbConfirme)}
    <div style="font-size:11px;color:var(--pizza);margin:12px 0 4px;font-weight:700;">Draft (${nbDraft})</div>
    ${ligneBuckets(s.bucketsParStatut.draft, nbDraft)}
    <div style="font-size:10px;color:var(--gris);margin-top:8px;">Ensemble Confirmés+Draft :</div>
    ${ligneBuckets(s.buckets, totalPop)}`;

  const evolutionHtml = courbeDoubleSvg(
    s.evolution.mois,
    'Présences/mois', s.evolution.presences, 'var(--bleu-clair)',
    'Cumulé unique', s.evolution.cumulUniques, '#C4B5FF'
  );

  const maxSectionPresences = Math.max(1, ...s.classementSections.map(sec => sec.nbPresences));
  const classementSectionsHtml = s.classementSections.map((sec, i) => `
    <div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
        <span>${i + 1}. ${esc(sec.nom)}</span>
        <span style="color:var(--gris);">${sec.nbPresences} présences · ${sec.nbMembres} membres</span>
      </div>
      <div class="places-bar"><div class="places-fill" style="width:${Math.round((sec.nbPresences / maxSectionPresences) * 100)}%;background:var(--bleu);"></div></div>
    </div>`).join('') || '<div class="empty-state" style="padding:12px;"><div>🏳️</div>Aucune donnée</div>';

  // KPI #2 (12/07/2026) — décrocheurs.
  const decrocheursHtml = s.decrocheurs.length ? s.decrocheurs.slice(0, 15).map(d => {
    const nom = d.membre ? `${esc(d.membre.prenom)} (@${esc(d.membre.pseudo_telegram || '?')})` : 'Membre inconnu';
    const jours = Math.round((Date.now() - new Date(d.derniereDate).getTime()) / (24*3600*1000));
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:5px 0;border-bottom:1px solid var(--border);">
        <span>${nom}</span>
        <span style="font-size:11px;color:var(--gris);">${d.nb} présence${d.nb>1?'s':''} · vu il y a ${jours}j</span>
      </div>`;
  }).join('') + (s.decrocheurs.length > 15 ? `<div style="font-size:11px;color:var(--gris);margin-top:6px;">+ ${s.decrocheurs.length - 15} autre(s)</div>` : '')
    : '<div class="empty-state" style="padding:12px;"><div>✅</div>Personne n\'a décroché</div>';

  // KPI #11 — comparaison saison précédente.
  const comparaisonHtml = _statsTifoPrecedent ? `
    <div class="card" style="margin-top:12px;">
      <div class="card-label">📊 Vs saison ${esc(_statsTifoPrecedent.saison)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="stat-card"><div class="stat-value">${s.totalSessions >= _statsTifoPrecedent.totalSessions ? '+' : ''}${s.totalSessions - _statsTifoPrecedent.totalSessions}</div><div class="stat-label">Sessions (${_statsTifoPrecedent.totalSessions} → ${s.totalSessions})</div></div>
        <div class="stat-card"><div class="stat-value">${s.totalPresences >= _statsTifoPrecedent.totalPresences ? '+' : ''}${s.totalPresences - _statsTifoPrecedent.totalPresences}</div><div class="stat-label">Présences (${_statsTifoPrecedent.totalPresences} → ${s.totalPresences})</div></div>
      </div>
    </div>` : (_statsTifoSaisonsCache.length <= 1 ? `
    <div class="card" style="margin-top:12px;">
      <div class="card-label">📊 Comparaison saisons</div>
      <div class="empty-state" style="padding:12px;"><div>📅</div>Historique multi-saison disponible dès la saison suivante</div>
    </div>` : '');

  el.innerHTML = `
    ${saisonSelectHtml}

    <div class="card">
      <div class="card-label">Vue d'ensemble</div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-lbl">Sessions</div><div class="kpi-val">${s.totalSessions}</div></div>
        <div class="kpi"><div class="kpi-lbl">Présences</div><div class="kpi-val" style="color:var(--open)">${s.totalPresences}</div></div>
        <div class="kpi"><div class="kpi-lbl">Membres actifs</div><div class="kpi-val" style="color:var(--pizza)">${s.membresActifs}</div></div>
      </div>
      <div style="font-size:11px;color:var(--gris);margin:4px 0 12px;">${s.sessionsTerminees} terminée${s.sessionsTerminees > 1 ? 's' : ''} · ${s.sessionsAVenir} à venir</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
        <div class="stat-card"><div class="stat-value">${s.moyennePresencesParSession.toFixed(1)}</div><div class="stat-label">Présents / session</div></div>
        <div class="stat-card"><div class="stat-value">${s.sessionTop ? s.sessionTop.nb : '—'}</div><div class="stat-label">Présents max / session</div>${s.sessionTop ? `<div style="font-size:9px;color:var(--gris);margin-top:2px;">${esc(s.sessionTop.nom)}</div>` : ''}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
        <div class="stat-card"><div class="stat-value">${s.nbSansSession}</div><div class="stat-label">Confirmés+Draft sans session</div></div>
        <div class="stat-card"><div class="stat-value">${Math.round(s.tauxAvecSession * 100)}%</div><div class="stat-label">Confirmés+Draft ayant participé</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
        <div class="stat-card"><div class="stat-value">${Math.round(s.tauxRetention * 100)}%</div><div class="stat-label">Taux de rétention (≥2 sessions)</div></div>
        <div class="stat-card"><div class="stat-value">${s.cadenceMoyenneJours != null ? Math.round(s.cadenceMoyenneJours) + 'j' : '—'}</div><div class="stat-label">Cadence moyenne</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="stat-card"><div class="stat-value">${s.tauxParticipationCelluleTifo != null ? Math.round(s.tauxParticipationCelluleTifo * 100) + '%' : '—'}</div><div class="stat-label">Cellule Tifo active${s.tauxParticipationCelluleTifo != null ? ` (${s.celluleTifoAvecPresence}/${s.celluleTifoTotal})` : ''}</div></div>
        <div class="stat-card"><div class="stat-value">${s.tauxRemplissageMoyen != null ? Math.round(s.tauxRemplissageMoyen * 100) + '%' : '—'}</div><div class="stat-label">Remplissage moyen${s.tauxRemplissageMoyen != null ? ` (${s.nbSessionsAvecCapacite} session${s.nbSessionsAvecCapacite>1?'s':''})` : ' (aucune capacité définie)'}</div></div>
      </div>
      <div style="font-size:12px;font-weight:700;color:var(--gris);margin:14px 0 4px;text-transform:uppercase;letter-spacing:.03em;">Nombre de sessions faites</div>
      ${bucketsHtml}
    </div>

    <div class="card" style="margin-top:12px;">
      <div class="card-label">⚠️ Décrocheurs (45j+ sans présence)</div>
      ${decrocheursHtml}
    </div>

    <div class="card" style="margin-top:12px;">
      <div class="card-label">Répartition</div>
      <div style="font-size:12px;font-weight:700;color:var(--gris);margin:4px 0;text-transform:uppercase;letter-spacing:.03em;">Par type</div>
      ${repartitionTypeHtml}
      ${noteFiltreType}
      <div style="font-size:12px;font-weight:700;color:var(--gris);margin:14px 0 4px;text-transform:uppercase;letter-spacing:.03em;">Par lieu</div>
      ${repartitionLieuHtml}
      <div style="font-size:12px;font-weight:700;color:var(--gris);margin:14px 0 4px;text-transform:uppercase;letter-spacing:.03em;">Présences par statut membre</div>
      ${repartitionStatutHtml}
    </div>

    <div class="card" style="margin-top:12px;">
      <div class="card-label">Classement &amp; assiduité ${_statsTifoTypeFiltre ? `<span class="badge badge-bleu" style="font-size:10px;">${labelType[_statsTifoTypeFiltre] || _statsTifoTypeFiltre}</span>` : ''}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
        <div class="stat-card"><div class="stat-value">${Math.round(s.tauxNoShow * 100)}%</div><div class="stat-label">Taux de no-show</div></div>
        <div class="stat-card"><div class="stat-value">${s.nouveauxParticipants}</div><div class="stat-label">Nouveaux (30j)</div></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0 4px;">
        <span style="font-size:12px;font-weight:700;color:var(--gris);text-transform:uppercase;letter-spacing:.03em;">🏆 Classement présences</span>
        <button class="btn btn-sm btn-secondary" onclick="exporterCsvClassementTifo()">📄 CSV</button>
      </div>
      ${classementHtml}
      ${boutonVoirTout}
    </div>

    <div class="card" style="margin-top:12px;">
      <div class="card-label">Évolution</div>
      ${evolutionHtml}
    </div>

    <div class="card" style="margin-top:12px;">
      <div class="card-label">🏳️ Classement des sections</div>
      ${classementSectionsHtml}
    </div>

    ${comparaisonHtml}

    <button class="btn btn-secondary" style="width:100%;margin-top:12px;" onclick="exporterPdfStatsTifo()">📄 Exporter la page en PDF</button>`;
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
  // ⚠️ BUG CORRIGÉ (05/07/2026) : cette fonction VIDAIT les champs
  // date/horaire/stade au lieu de les pré-remplir avec les valeurs
  // actuelles du match. Résultat pour Remi : en cliquant directement sur
  // "Confirmer" sans ressaisir une date (pensant confirmer celle déjà
  // affichée dans la liste), doConfirmerDateMatch() refusait silencieusement
  // ("Date requise") — perçu comme "la confirmation ne marche pas". On
  // récupère maintenant le match en cache (allMatchsAdmin, déjà peuplé par
  // loadMatchsList — même source que ouvrirModifierMatchParId) pour
  // pré-remplir les 3 champs ; l'admin n'a plus qu'à ajuster ce qui a
  // réellement changé (souvent rien pour la date, parfois juste l'horaire).
  const match = allMatchsAdmin.find(m => m.id === matchId);
  _matchEnConfirmation = matchId;
  _matchEnModification = null;
  document.getElementById('modalMatchsTitre').textContent = 'Confirmer la date du match';
  document.getElementById('modalMatchsFormLabel').textContent = 'Date / horaire / stade définitifs';
  document.getElementById('mExtGroup').style.display = 'none';
  document.getElementById('mTypeGroup').style.display = 'none';
  document.getElementById('mCompGroup').style.display = 'none'; // peut être resté visible si un "Modifier" a précédé
  document.getElementById('mDate').value = match?.date || '';
  document.getElementById('mHeure').value = match?.horaire ? match.horaire.slice(0,5) : '';
  document.getElementById('mStade').value = match?.stade || '';
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
    // Le texte doit revenir à ce qu'il était avant l'appel (le mode actif
    // n'a pas changé en cas d'échec) — `disabled`, lui, est désormais géré
    // uniformément dans le `finally` ci-dessous, succès compris.
    if (btn) btn.textContent = texteOriginal;
  } finally {
    // ⚠️ BUG CORRIGÉ (05/07/2026) : ce bouton n'était réactivé que dans le
    // bloc catch (erreur) — après un succès, il restait disabled=true pour
    // de bon. Comme modalMatchsSubmitBtn est le MÊME bouton réutilisé pour
    // les 3 modes (ajouter/modifier/confirmer, cf. annulerConfirmerDate),
    // la première modification ou confirmation réussie bloquait tout le
    // modal Matchs ensuite — un bouton disabled ne déclenche même pas
    // l'événement 'click', d'où un silence total (aucune erreur console)
    // signalé par Remi. Sur succès, annulerConfirmerDate() remet bien le
    // texte du bouton à '+ Ajouter' mais ne touchait jamais `disabled` —
    // ce `finally` corrige les deux causes en une fois (comme
    // doAjouterMatch, qui n'avait jamais eu ce bug grâce à son propre
    // finally déjà présent).
    if (btn) btn.disabled = false;
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
    if (btn) btn.textContent = texteOriginal;
  } finally {
    // Même bug/correctif que doModifierMatch ci-dessus — bouton partagé,
    // jamais réactivé sur succès avant le 05/07/2026.
    if (btn) btn.disabled = false;
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
// Note : le rechargement de la liste à l'ouverture du modal est déjà géré
// explicitement par le bouton d'entrée ("⚽ Gérer le calendrier", index.html
// : onclick="showModal('modalMatchs');loadMatchsList()") — un ancien
// écouteur sur un événement personnalisé 'ul:show' vivait ici mais n'était
// déclenché nulle part dans le code (showModal() ne l'émet jamais),
// c'était donc du code mort, retiré le 05/07/2026.

// ─── DEMANDES ADMIN (page dédiée) ────────────────────────────
// Généralisée le 10/07/2026 (bug rapporté par Remi) : cette fonction
// servait uniquement pageDemandesAdmin — l'Accueil avait sa PROPRE copie
// quasi-identique (loadDemandes/validerDemande/refuserDemande, app.js),
// jamais mise à jour en même temps que celle-ci (statut par défaut,
// bouton Visiteur, sélecteur de section inline, correctif email
// silencieux...) — d'où des versions divergentes selon l'écran. Les deux
// emplacements appellent désormais CETTE fonction, avec leurs propres
// ids de conteneur/badge — plus qu'une seule implémentation à maintenir.
async function loadDemandesAdmin(idListe = 'demandesListeAdmin', idBadge = 'demandesBadge2') {
  try {
    const tous = await UL.getAllMembres();
    // ⚠️ 10/07/2026 : le statut par défaut à l'inscription est passé de
    // 'sympathisant' à 'visiteur' — mais les inscriptions faites AVANT ce
    // changement ont encore statut='sympathisant' et sont toujours en
    // attente (!actif). Les deux valeurs sont donc acceptées ici, pour ne
    // pas faire disparaître ces demandes déjà en cours.
    const demandes = tous.filter(m => (m.statut === 'visiteur' || m.statut === 'sympathisant') && !m.actif);
    const badge = document.getElementById(idBadge);
    if (badge) {
      badge.textContent = demandes.length + ' en attente';
      badge.style.display = demandes.length ? 'inline-flex' : 'none';
    }

    const el = document.getElementById(idListe);
    if (!el) return;
    if (!demandes.length) {
      el.innerHTML = '<div class="empty-state"><div>✅</div>Aucune demande en attente</div>';
      return;
    }

    // Sections chargées une seule fois pour toute la liste (pas un appel
    // par carte) — "Ultra Lutetia" présélectionnée par défaut sur chaque
    // carte (demande Remi 10/07/2026 : "plus simple à gérer").
    let optionsSection = '<option value="">-- Sélectionner une section --</option>';
    try {
      const sections = await UL.getSections();
      const ulOption = sections.find(s => s.nom?.toLowerCase().includes('ultra lutetia'));
      optionsSection = sections.map(s =>
        `<option value="${s.id}" ${ulOption && s.id === ulOption.id ? 'selected' : ''}>${esc(s.nom)}</option>`
      ).join('');
    } catch(e) { /* select reste avec le seul placeholder si le chargement échoue */ }

    // Id du <select> préfixé par idListe : les DEUX conteneurs (Accueil +
    // page Admin) existent simultanément dans le DOM (l'un juste masqué),
    // donc un id non préfixé serait dupliqué deux fois dans la page —
    // getElementById ne retrouverait alors jamais le bon des deux.
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
        <select id="sectionDemande_${idListe}_${m.id}" style="margin-bottom:8px;">${optionsSection}</select>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-secondary" onclick="validerDemandeInline('${m.id}','visiteur',this,'${idListe}')">🚶 Visiteur</button>
          <button class="btn btn-sm btn-secondary" onclick="validerDemandeInline('${m.id}','sympathisant',this,'${idListe}')">💙 Sympa.</button>
          <button class="btn btn-sm btn-success" onclick="validerDemandeInline('${m.id}','draft',this,'${idListe}')">✅ Draft</button>
          <button class="btn btn-sm btn-primary" onclick="validerDemandeInline('${m.id}','confirme',this,'${idListe}')">⭐ Confirmé</button>
          <button class="btn btn-sm btn-danger" onclick="refuserDemandeAdmin('${m.id}','${idListe}')">❌ Refuser</button>
        </div>
      </div>`).join('');
  } catch(e) { console.error('Erreur demandes admin:', e); }
}

// Remplace l'ancien flux en 2 étapes (bouton statut → popup section à
// part) — demande Remi 10/07/2026 : la section est choisie directement
// sur la carte (présélectionnée sur Ultra Lutetia), un clic sur un statut
// suffit désormais à valider.
async function validerDemandeInline(membreId, statut, btn, idListe) {
  const sectionId = document.getElementById('sectionDemande_' + idListe + '_' + membreId).value;
  if (!sectionId) return toast('Sélectionne une section', 'error');
  const texteOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    await validerDemandeAdmin(membreId, statut, sectionId, idListe);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
  }
}

async function validerDemandeAdmin(membreId, statut, sectionId, idListe = 'demandesListeAdmin') {
  try {
    const membre = await UL.updateMembre(membreId, { statut, actif: true, section_id: sectionId || null });
    toast(`Membre accepté → ${statut} ✅`, 'success');
    if (membre && membre.email) {
      // ⚠️ Corrigé 09/07/2026 : catch silencieux remplacé — un échec
      // d'envoi (clé API Brevo, expéditeur non vérifié, quota...) passait
      // totalement inaperçu jusqu'ici, aucun moyen de savoir que l'email
      // n'était jamais parti. La validation elle-même reste non-bloquante
      // (le compte est déjà activé au moment de cet appel), mais l'échec
      // est maintenant visible (toast + log console).
      UL.envoyerEmailValidation(membre).catch(e => {
        console.error('[UL] Échec envoi email de validation:', e);
        toast(`⚠️ Compte activé, mais l'email n'a pas pu être envoyé (${e.message||'erreur inconnue'})`, 'error');
      });
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
    loadDemandesAdmin(idListe, _badgeIdPour(idListe));
  } catch(e) { toast('Impossible de valider la demande', 'error'); }
}

// Les deux emplacements (Accueil / page Admin dédiée) sont toujours
// appairés liste↔badge de la même façon — évite d'avoir à faire passer
// l'id du badge partout en plus de celui de la liste.
function _badgeIdPour(idListe) {
  return idListe === 'demandesListe' ? 'demandesBadge' : 'demandesBadge2';
}

async function refuserDemandeAdmin(membreId, idListe = 'demandesListeAdmin') {
  if (!confirm('Refuser et désactiver ce compte ?')) return;
  try {
    await UL.toggleBlocageMembre(membreId, false);
    toast('Demande refusée', 'success');
    loadDemandesAdmin(idListe, _badgeIdPour(idListe));
  } catch(e) { toast('Impossible de refuser la demande', 'error'); }
}

// Recherche Bureau/Admin d'un code de réabonnement — pour vérifier
// qu'une personne en a bien un (support/dépannage) sans devoir attendre
// qu'elle se connecte elle-même sur "Mon (ré)abonnement". Le rôle est
// re-vérifié côté serveur (cf. migration_admin_recherche_code.sql).
async function chercherCodeReaboAdmin() {
  const terme = document.getElementById('verifCodeRecherche').value.trim();
  const el = document.getElementById('verifCodeResultats');
  if (!terme) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="empty-state"><div>⏳</div>Recherche…</div>';
  try {
    const resultats = await UL.rechercherCodeReabonnementAdmin(terme);
    if (!resultats.length) {
      el.innerHTML = '<div class="empty-state"><div>❓</div>Aucun code trouvé pour cette recherche</div>';
      return;
    }
    el.innerHTML = resultats.map(c => `
      <div class="card" style="margin-bottom:8px;padding:14px;">
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:15px;">${esc(c.prenom||'')} ${esc(c.nom||'')}</div>
        <div style="font-size:12px;color:var(--gris);margin-bottom:6px;">✉️ ${esc(c.email)}</div>
        <div style="font-family:'Courier New',monospace;font-size:16px;font-weight:700;background:var(--fond2,rgba(255,255,255,.06));border-radius:6px;padding:6px 10px;display:inline-block;">
          ${esc(c.code)}
        </div>
        <div style="font-size:12px;color:var(--gris);margin-top:6px;">Abonné 25-26 : ${esc(c.abonne_25_26||'—')}${c.date_paiement ? ' · Payé le ' + new Date(c.date_paiement).toLocaleDateString('fr-FR') : ''}</div>
      </div>`).join('');
  } catch(e) {
    el.innerHTML = '<div class="empty-state"><div>⚠️</div>Erreur de recherche</div>';
  }
}

// Bascule Bureau/Admin de la page "Mon (ré)abonnement" (Profil) — à
// masquer en dehors de la période de campagne, cf. migration_
// reabonnement_page.sql. Demande confirmation en rappelant l'état actuel
// pour éviter un clic accidentel qui la couperait/rouvrirait pour tous.
async function toggleReabonnementAdmin() {
  try {
    const ouvertActuel = await UL.getStatutReabonnement();
    const action = ouvertActuel ? 'désactiver' : 'activer';
    if (!confirm(`La page "Mon (ré)abonnement" est actuellement ${ouvertActuel ? 'ACTIVÉE' : 'DÉSACTIVÉE'} pour tous les membres.\nVeux-tu la ${action} ?`)) return;
    await UL.setReabonnementOuvert(!ouvertActuel);
    toast(`Page Réabonnement ${!ouvertActuel ? 'activée' : 'désactivée'} ✅`, 'success');
  } catch(e) { toast(e.message || 'Impossible de changer ce paramètre', 'error'); }
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
// Codes de réabonnement indexés par email (minuscules, espaces retirés) —
// chargés une seule fois par visite de la page, pas un appel par carte.
// Une même adresse peut avoir plusieurs codes (cf. lignes dupliquées
// tolérées dans le fichier source) — on garde un tableau par email.
let _codesReaboParEmail = {};
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
    const [membres, sections, codesReabo] = await Promise.all([
      UL.getAllMembres(),
      UL.getSections(),
      // N'échoue jamais le chargement de la page si ça échoue (ex. rôle
      // insuffisant côté serveur) — les cartes s'affichent juste sans
      // code, dégradation silencieuse plutôt que page bloquée.
      UL.listerCodesReabonnementAdmin().catch(() => []),
    ]);
    _codesReaboParEmail = {};
    codesReabo.forEach(c => {
      const cle = (c.email || '').trim().toLowerCase();
      if (!cle) return;
      (_codesReaboParEmail[cle] = _codesReaboParEmail[cle] || []).push(c);
    });
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
  visiteur: '🚶 Visiteur', sympathisant: '💙 Sympathisant', draft: '🚀 Draft', confirme: '🏅 Confirmé',
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
  const codesReabo = _codesReaboParEmail[(m.email||'').trim().toLowerCase()] || [];
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
    <div style="margin-top:8px;">
      ${codesReabo.length
        ? codesReabo.map(c => `<span style="font-family:'Courier New',monospace;font-size:12px;font-weight:700;background:var(--fond2,rgba(255,255,255,.06));border-radius:5px;padding:3px 8px;display:inline-block;margin-right:4px;margin-top:4px;">🎫 ${esc(c.code)}</span>`).join('')
        : `<span style="font-size:11px;color:var(--gris);opacity:.7;">🎫 Aucun code réabonnement pour cet email</span>`}
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
    <div style="margin-top:10px;display:flex;gap:8px;">
      <button class="btn btn-sm btn-secondary" onclick="openEditMembreComite('${m.id}')">✏️ Modifier</button>
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
