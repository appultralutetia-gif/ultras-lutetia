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
    const icones = { textile:'👕', accessoire:'🎒' };
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
          <button class="btn btn-sm btn-secondary" onclick="ouvrirModifierProduit('${p.id}')">✏️ Modifier</button>
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
    const icones = { textile:'👕', accessoire:'🎒' };

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
  // Confirmation demandée uniquement pour l'annulation — les autres
  // transitions (validée → prête → récupérée) sont des étapes normales du
  // suivi de commande, pas des actions à risque pour le membre.
  if (statut === 'annulee' && !confirm('Annuler cette commande ?')) return;
  try { await UL.updateCommandeStatut(id, statut); toast('Commande mise à jour ✅', 'success'); loadMatos(); }
  catch(e) { toast('Impossible de modifier le statut de la commande', 'error'); }
}

async function modifierStock(id, nom, stockActuel) {
  const nouveau = prompt(`Stock actuel: ${stockActuel}
Nouveau stock pour "${nom}" :`, stockActuel);
  if (nouveau === null) return; // Annulé par l'utilisateur — pas d'erreur à afficher
  if (isNaN(parseInt(nouveau))) return toast('Stock invalide — saisis un nombre', 'error');
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
let currentFiltreSticksStatut = 'tous', currentFiltreSticksSection = '';

async function loadSticks() {
  try {
    allSticks = await UL.getSticks();
    await remplirFiltreSticksSection();
    appliquerFiltresSticks();
    const mesSticks = await UL.getMesSticks();
    renderMesSticks(mesSticks);
    if (hasCelluleSticks(UL.getCurrentMembre())) {
      const distribs = await UL.getAllDistributions();
      renderToutesDistribs(distribs);
      await loadDistribuerModal();
    }
  } catch(e) { toast('Erreur chargement sticks', 'error'); }
}

async function remplirFiltreSticksSection() {
  try {
    const sections = await UL.getSections();
    const sel = document.getElementById('filtreSticksSection');
    const valeurActuelle = sel.value;
    sel.innerHTML = '<option value="">Toutes sections</option>' +
      sections.map(s => `<option value="${s.id}">${esc(s.nom)}</option>`).join('');
    sel.value = valeurActuelle;
  } catch(e) {}
}

function filtrerSticksStatut(statut) {
  document.querySelectorAll('#sectionSticks .filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  currentFiltreSticksStatut = statut;
  appliquerFiltresSticks();
}

function filtrerSticksSection(sectionId) {
  currentFiltreSticksSection = sectionId;
  appliquerFiltresSticks();
}

function appliquerFiltresSticks() {
  let filtered = allSticks;
  if (currentFiltreSticksStatut !== 'tous') {
    filtered = filtered.filter(s => s.niveau_acces === currentFiltreSticksStatut);
  }
  if (currentFiltreSticksSection) {
    filtered = filtered.filter(s => s.section_id === currentFiltreSticksSection);
  }
  renderSticks(filtered);
}

function renderSticks(sticks) {
  const el = document.getElementById('sticksCatalogue');
  const m = UL.getCurrentMembre();
  const peutEncaisser = hasCelluleSticks(m);
  if (!sticks.length) { el.innerHTML = '<div class="empty-state"><div>🎟️</div>Aucun stick disponible</div>'; return; }
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">` +
  sticks.map(s => `
    <div class="card" style="padding:10px;">
      <div style="width:100%;height:150px;border-radius:8px;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;margin-bottom:10px;">
        ${s.visuel_url ? `<img src="${s.visuel_url}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:48px;">🎟️</span>`}
      </div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:16px;">${esc(s.nom)}</div>
      <div style="font-size:12px;color:var(--gris);margin-top:2px;">
        ${s.prix ? `${s.prix}€ · ` : 'Gratuit · '}
        ${s.mode === 'precommande' ? 'Précommande' : 'Stock: ' + s.stock}
        ${s.lot && s.lot > 1 ? ` · Lot de ${s.lot}` : ''}
      </div>
      ${s.section ? `<span class="badge badge-bleu" style="font-size:10px;margin-top:6px;display:inline-block;">Section ${esc(s.section.nom)}</span>` : ''}
      <div style="display:flex;flex-direction:column;gap:5px;margin-top:10px;">
        ${s.stock > 0 || s.mode === 'precommande' ? `
        ${s.lien_helloasso ? `<a href="${s.lien_helloasso}" target="_blank"><button class="btn btn-sm btn-primary" style="width:100%;">HelloAsso</button></a>` : ''}
        ${peutEncaisser ? `<button class="btn btn-sm btn-secondary" onclick="ouvrirCashStick('${s.id}','${esc(s.nom)}')">Cash</button>` : ''}` : ''}
        ${peutEncaisser ? `<button class="btn btn-sm btn-secondary" onclick="ouvrirModifierStick('${s.id}')">✏️ Modifier</button>` : ''}
        ${peutEncaisser ? `<button class="btn btn-sm btn-secondary" onclick="uploadPhotoExistant('${s.id}','stick')">🖼️</button>` : ''}
      </div>
    </div>`).join('') + `</div>`;
}

// ── Valider un cash (Admin/Bureau/Cellule Sticks) ──────────────
let _allMembresCashStick = [];

async function ouvrirCashStick(stickId, nom) {
  document.getElementById('cashStickId').value = stickId;
  document.getElementById('cashStickTitre').textContent = `Valider un cash — ${nom}`;
  document.getElementById('cashStickQte').value = '1';
  document.getElementById('cashStickSearch').value = '';
  document.getElementById('cashStickListeMembres').innerHTML = '<div class="empty-state"><div>⏳</div>Chargement…</div>';
  showModal('modalCashStick');
  try {
    _allMembresCashStick = await UL.getAllMembres();
    renderListeMembresCashStick(_allMembresCashStick);
  } catch(e) { toast('Erreur chargement membres', 'error'); }
}

function filtrerMembresCashStick() {
  const recherche = document.getElementById('cashStickSearch').value.trim().toLowerCase();
  if (!recherche) return renderListeMembresCashStick(_allMembresCashStick);
  const filtres = _allMembresCashStick.filter(m => {
    const champs = [m.nom, m.prenom, m.pseudo_telegram].filter(Boolean).join(' ').toLowerCase();
    return champs.includes(recherche);
  });
  renderListeMembresCashStick(filtres);
}

function renderListeMembresCashStick(membres) {
  const el = document.getElementById('cashStickListeMembres');
  if (!membres.length) { el.innerHTML = '<div class="empty-state"><div>👥</div>Aucun membre trouvé</div>'; return; }
  el.innerHTML = membres.map(m => `
    <div class="card" style="margin-bottom:6px;padding:10px;cursor:pointer;" onclick="doValiderCashStick('${m.id}','${esc(m.prenom)} ${esc(m.nom)}')">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="avatar" style="width:30px;height:30px;font-size:12px;flex-shrink:0;">${((m.prenom||'?')[0]+(m.nom||'?')[0]).toUpperCase()}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;">${esc(m.prenom)} ${esc(m.nom)}</div>
          <div style="font-size:11px;color:var(--gris);">@${esc(m.pseudo_telegram)}</div>
        </div>
      </div>
    </div>`).join('');
}

async function doValiderCashStick(membreId, nomMembre) {
  // ⚠️ Depuis le 21/06/2026, cette action ne distribue plus immédiatement
  // (cf. distribuerStickAdmin, supabase-client.js) — elle crée la demande
  // en 'en_attente', à confirmer ensuite par scan QR du membre (cf.
  // scan.js, contexte 'stick') ou par le bouton manuel de filet de
  // secours dans la liste "Historique distributions" (renderToutesDistribs).
  const stickId = document.getElementById('cashStickId').value;
  const qte = parseInt(document.getElementById('cashStickQte').value) || 1;
  if (!confirm(`Enregistrer la demande cash de ${nomMembre} (x${qte}) ?`)) return;
  try {
    await UL.distribuerStickAdmin(stickId, membreId, qte, 'cash');
    toast(`Demande enregistrée pour ${nomMembre} — à confirmer au retrait`, 'success');
    closeModal('modalCashStick');
    loadSticks();
  } catch(e) { toast(e.message || 'Impossible d\'enregistrer la demande', 'error'); }
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
      ${d.statut === 'en_attente' ? `
      <div style="margin-top:8px;">
        <button class="btn btn-sm btn-secondary" style="width:100%;" onclick="doConfirmerDistributionManuelle('${d.id}')">✔️ Confirmer (sans scan)</button>
      </div>` : ''}
    </div>`).join('');
}

// Filet de secours pour confirmer une distribution Stick sans passer par
// le scan QR (cas client sans téléphone disponible le jour J) — réutilise
// la même fonction de confirmation que le scan, mêmes garanties
// d'idempotence (jamais décrémenté deux fois si déjà confirmée).
async function doConfirmerDistributionManuelle(distribId) {
  if (!confirm('Confirmer cette distribution sans scan ?')) return;
  try {
    await UL.confirmerDistributionStick(distribId);
    toast('Distribution confirmée ✅', 'success');
    loadSticks();
  } catch(e) { toast(e.message || 'Impossible de confirmer la distribution', 'error'); }
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

async function doDistribuerStick(btn) {
  const stickId = document.getElementById('distribStickId').value;
  const membreId = document.getElementById('distribMembreId').value;
  const qte = parseInt(document.getElementById('distribQte').value) || 1;
  const mode = document.getElementById('distribMode').value;
  const texteOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    await UL.distribuerStickAdmin(stickId, membreId, qte, mode);
    toast('Distribution enregistrée ✅', 'success');
    closeModal('modalDistribuer');
    loadSticks();
  } catch(e) {
    toast(e.message || 'Impossible d\'enregistrer la distribution', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
  }
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
      quota_par_membre: parseInt(document.getElementById('pQuota').value) || null,
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
    reinitialiserFormulaireProduit();
    ['pNom','pDesc','pPrix','pStock','pQuota'].forEach(id => document.getElementById(id).value = '');
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

// Ouvre le modal modalCreerProduit en mode édition, pré-rempli avec les
// valeurs actuelles — réutilise allProduits (déjà chargée par loadMatos)
// plutôt que de resolliciter le réseau. Même principe de swap dynamique
// (titre + bouton submit) que pour les matchs (cf. ouvrirModifierMatch
// dans admin.js), pour rester cohérent avec ce pattern déjà en place dans
// le projet plutôt que de dupliquer un second modal complet.
async function ouvrirModifierProduit(produitId) {
  const p = allProduits.find(pr => pr.id === produitId);
  if (!p) return toast('Article introuvable', 'error');

  await loadSectionsForModal();

  document.getElementById('pId').value = p.id;
  document.getElementById('modalProduitTitre').textContent = "Modifier l'article";
  document.getElementById('pNom').value = p.nom || '';
  document.getElementById('pDesc').value = p.description || '';
  document.getElementById('pCat').value = p.categorie || 'textile';
  document.getElementById('pPrix').value = p.prix ?? '';
  document.getElementById('pStock').value = p.stock ?? '';
  document.getElementById('pQuota').value = p.quota_par_membre ?? '';
  document.getElementById('pTailles').checked = !!p.avec_tailles;
  document.getElementById('pAcces').value = p.niveau_acces || 'tous';
  document.getElementById('pMode').value = p.mode || 'stock';
  document.getElementById('pPhoto').value = '';
  if (p.photo_url) {
    document.getElementById('photoPreviewImgMatos').src = p.photo_url;
    document.getElementById('photoPreviewMatos').style.display = 'block';
  } else {
    document.getElementById('photoPreviewMatos').style.display = 'none';
  }
  toggleSectionSelect();
  if (p.section_id) document.getElementById('pSection').value = p.section_id;

  const btn = document.getElementById('modalProduitSubmitBtn');
  btn.textContent = '💾 Enregistrer';
  btn.setAttribute('onclick', 'doModifierProduit()');

  showModal('modalCreerProduit');
}

async function doModifierProduit() {
  const id = document.getElementById('pId').value;
  const nom = document.getElementById('pNom').value.trim();
  const prix = parseFloat(document.getElementById('pPrix').value);
  const acces = document.getElementById('pAcces').value;
  const sectionId = acces === 'section' ? document.getElementById('pSection').value : null;

  if (!nom) return toast('Nom requis', 'error');
  if (!prix || isNaN(prix)) return toast('Prix requis', 'error');
  if (acces === 'section' && !sectionId) return toast('Sélectionne une section', 'error');

  try {
    showLoading();

    // Upload d'une nouvelle photo seulement si l'admin en a choisi une —
    // sinon on conserve photo_url existante (ne pas envoyer ce champ dans
    // l'update pour ne pas l'écraser avec null).
    const photoFile = document.getElementById('pPhoto').files[0];
    const updates = {
      nom,
      description: document.getElementById('pDesc').value || null,
      categorie: document.getElementById('pCat').value,
      prix,
      stock: parseInt(document.getElementById('pStock').value) || 0,
      quota_par_membre: parseInt(document.getElementById('pQuota').value) || null,
      avec_tailles: document.getElementById('pTailles').checked,
      niveau_acces: acces,
      section_id: sectionId,
      mode: document.getElementById('pMode').value,
    };
    if (photoFile) {
      updates.photo_url = await UL.uploadPhotoMatos(photoFile, nom);
    }

    await UL.updateProduit(id, updates);

    hideLoading();
    toast('Article modifié ✅', 'success');
    closeModal('modalCreerProduit');
    reinitialiserFormulaireProduit();
    loadMatos();
  } catch(e) {
    hideLoading();
    toast(e.message || 'Erreur modification article', 'error');
  }
}

// Remet le modal modalCreerProduit en mode "création" (titre, bouton,
// champ pId) — appelé après une création ou une modification réussie, et
// peut aussi être appelé avant d'ouvrir le modal en mode ajout pour
// repartir d'un état propre si le modal avait été laissé en mode édition.
function reinitialiserFormulaireProduit() {
  document.getElementById('pId').value = '';
  document.getElementById('modalProduitTitre').textContent = 'Ajouter un article matos';
  const btn = document.getElementById('modalProduitSubmitBtn');
  btn.textContent = 'Ajouter l\'article';
  btn.setAttribute('onclick', 'doCreerProduit()');
}

// ── STICKS — création (Admin/Cellule Sticks) ───────────────────
async function loadSectionsForModalStick() {
  try {
    const sections = await UL.getSections();
    const sel = document.getElementById('stSection');
    sel.innerHTML = sections.map(s =>
      `<option value="${s.id}">${s.nom}</option>`
    ).join('');
    // Pré-sélection par défaut sur Ultra Lutetia
    const ulOption = sections.find(s => s.nom?.toLowerCase().includes('ultra lutetia'));
    if (ulOption) sel.value = ulOption.id;
  } catch(e) {}
}

async function doCreerStick() {
  const nom = document.getElementById('stNom').value.trim();
  const prixRaw = document.getElementById('stPrix').value;
  const prix = prixRaw ? parseFloat(prixRaw) : null;
  const niveauAcces = document.getElementById('stCat').value;
  const sectionId = document.getElementById('stSection').value || null;
  const lienHelloasso = document.getElementById('stHelloasso').value.trim() || null;

  if (!nom) return toast('Nom requis', 'error');
  if (niveauAcces !== 'tous' && !sectionId) return toast('Sélectionne une section', 'error');

  try {
    showLoading();

    // Upload visuel si présent
    let visuelUrl = null;
    const photoFile = document.getElementById('stPhoto').files[0];
    if (photoFile) {
      visuelUrl = await UL.uploadPhotoStick(photoFile, nom);
    }

    await UL.createStick({
      nom,
      niveau_acces: niveauAcces,
      section_id: sectionId,
      prix,
      lot: parseInt(document.getElementById('stLot').value) || 1,
      quota_par_membre: parseInt(document.getElementById('stQuota').value) || null,
      stock: parseInt(document.getElementById('stStock').value) || 0,
      mode: document.getElementById('stMode').value,
      lien_helloasso: lienHelloasso,
      statut: 'disponible',
      visuel_url: visuelUrl,
    });

    hideLoading();
    const sectionNom = niveauAcces !== 'tous'
      ? document.getElementById('stSection').options[document.getElementById('stSection').selectedIndex].text
      : null;

    toast(`Stick créé ✅ ${sectionNom ? '— Section ' + sectionNom : '— Tous les membres'}`, 'success');
    closeModal('modalCreerStick');
    reinitialiserFormulaireStick();
    ['stNom','stPrix','stLot','stQuota','stStock','stHelloasso'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('stLot').value = '1';
    document.getElementById('stMode').value = 'stock';
    document.getElementById('stPhoto').value = '';
    document.getElementById('photoPreviewStick').style.display = 'none';
    document.getElementById('stCat').value = 'tous';
    loadSticks();
  } catch(e) {
    hideLoading();
    toast(e.message || 'Erreur création stick', 'error');
  }
}

// Ouvre modalCreerStick en mode édition, pré-rempli — réutilise allSticks
// (déjà chargée par loadSticks) plutôt que de resolliciter le réseau. Même
// principe de swap dynamique (titre + bouton submit) que pour les produits
// Matos et les matchs, pour rester cohérent avec ce pattern.
async function ouvrirModifierStick(stickId) {
  const s = allSticks.find(st => st.id === stickId);
  if (!s) return toast('Stick introuvable', 'error');

  await loadSectionsForModalStick();

  document.getElementById('stId').value = s.id;
  document.getElementById('modalStickTitre').textContent = 'Modifier le stick';
  document.getElementById('stNom').value = s.nom || '';
  document.getElementById('stCat').value = s.niveau_acces || 'tous';
  document.getElementById('stPrix').value = s.prix ?? '';
  document.getElementById('stLot').value = s.lot || 1;
  document.getElementById('stQuota').value = s.quota_par_membre ?? '';
  document.getElementById('stStock').value = s.stock ?? '';
  document.getElementById('stMode').value = s.mode || 'stock';
  document.getElementById('stHelloasso').value = s.lien_helloasso || '';
  document.getElementById('stPhoto').value = '';
  if (s.visuel_url) {
    document.getElementById('photoPreviewImgStick').src = s.visuel_url;
    document.getElementById('photoPreviewStick').style.display = 'block';
  } else {
    document.getElementById('photoPreviewStick').style.display = 'none';
  }
  if (s.section_id) document.getElementById('stSection').value = s.section_id;

  const btn = document.getElementById('modalStickSubmitBtn');
  btn.textContent = '💾 Enregistrer';
  btn.setAttribute('onclick', 'doModifierStick()');

  showModal('modalCreerStick');
}

async function doModifierStick() {
  const id = document.getElementById('stId').value;
  const nom = document.getElementById('stNom').value.trim();
  const prixRaw = document.getElementById('stPrix').value;
  const prix = prixRaw ? parseFloat(prixRaw) : null;
  const niveauAcces = document.getElementById('stCat').value;
  const sectionId = document.getElementById('stSection').value || null;
  const lienHelloasso = document.getElementById('stHelloasso').value.trim() || null;

  if (!nom) return toast('Nom requis', 'error');
  if (niveauAcces !== 'tous' && !sectionId) return toast('Sélectionne une section', 'error');

  try {
    showLoading();

    const photoFile = document.getElementById('stPhoto').files[0];
    const updates = {
      nom,
      niveau_acces: niveauAcces,
      section_id: sectionId,
      prix,
      lot: parseInt(document.getElementById('stLot').value) || 1,
      quota_par_membre: parseInt(document.getElementById('stQuota').value) || null,
      stock: parseInt(document.getElementById('stStock').value) || 0,
      mode: document.getElementById('stMode').value,
      lien_helloasso: lienHelloasso,
    };
    if (photoFile) {
      updates.visuel_url = await UL.uploadPhotoStick(photoFile, nom);
    }

    await UL.updateStick(id, updates);

    hideLoading();
    toast('Stick modifié ✅', 'success');
    closeModal('modalCreerStick');
    reinitialiserFormulaireStick();
    loadSticks();
  } catch(e) {
    hideLoading();
    toast(e.message || 'Erreur modification stick', 'error');
  }
}

// Remet modalCreerStick en mode "création" (titre, bouton, champ stId).
function reinitialiserFormulaireStick() {
  document.getElementById('stId').value = '';
  document.getElementById('modalStickTitre').textContent = 'Ajouter un stick';
  const btn = document.getElementById('modalStickSubmitBtn');
  btn.textContent = 'Ajouter le stick';
  btn.setAttribute('onclick', 'doCreerStick()');
}
