// ─── CALENDRIER ──────────────────────────────────────────────
let allMatchs = [], allEvenements = [], currentFiltreCalendrier = 'tous';
// Map match_id → déplacement correspondant (un match extérieur peut avoir
// au plus un déplacement organisé). Alimentée par loadCalendrier, utilisée
// par renderMatchCard pour proposer un accès direct au déplacement lié
// sans dupliquer la requête à chaque rendu de carte.
let depParMatchId = {};

// Formatage de date "Jour court + jour/mois" indépendant du moteur JS du
// navigateur (toLocaleDateString peut donner des abréviations différentes
// selon l'OS/navigateur). Table fixe demandée : Lun, Mar, Mer, Jeu, Vend,
// Sam, Dim. Date.getDay()/getDate()/getMonth() sont exacts sur tout le
// calendrier grégorien (donc valable nativement sur des décennies, pas
// besoin de précharger une table d'années — seul le nom du jour est
// fixé en dur ici pour ne plus dépendre du fr-FR du navigateur).
const JOURS_COURTS_FR = ['Dim','Lun','Mar','Mer','Jeu','Vend','Sam']; // getDay(): 0=dimanche
const MOIS_COURTS_FR = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];

function formatDateCourte(dateStr) {
  if (!dateStr) return null;
  // Parsing manuel "YYYY-MM-DD" pour éviter tout décalage de fuseau horaire
  // lié à new Date('YYYY-MM-DD') (interprétée en UTC par certains moteurs).
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return `${JOURS_COURTS_FR[date.getDay()]} ${d} ${MOIS_COURTS_FR[m - 1]}`;
}

function formatHeureCourte(horaireStr) {
  if (!horaireStr) return null;
  return horaireStr.slice(0, 5); // "20:45:00" -> "20:45"
}

async function loadCalendrier() {
  document.getElementById('calendrierListe').innerHTML = '<div class="empty-state"><div>⏳</div>Chargement…</div>';
  try {
    const [matchs, evenements, deplacements] = await Promise.all([
      UL.getMatchs(),
      UL.getEvenements ? UL.getEvenements() : Promise.resolve([]),
      UL.getDeplacements ? UL.getDeplacements(false) : Promise.resolve([]),
    ]);
    allMatchs = matchs || [];
    allEvenements = evenements || [];
    // upcoming=false : un déplacement passé doit aussi rester lié à son
    // match dans le calendrier (consultation historique), pas seulement
    // les déplacements à venir.
    depParMatchId = {};
    (deplacements || []).forEach(d => { if (d.match_id) depParMatchId[d.match_id] = d; });
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
  const date = formatDateCourte(match.date) || '—';
  const heure = formatHeureCourte(match.horaire);
  const isPasse = match.date && new Date(match.date) < new Date();
  const typeLabel = match.type === 'domicile'
    ? '<span class="badge badge-vert">🏠 Domicile</span>'
    : '<span class="badge badge-rouge">✈️ Extérieur</span>';
  const score = (match.score_domicile !== null && match.score_exterieur !== null)
    ? `<div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.05em;text-align:center;margin:6px 0;">${match.score_domicile} — ${match.score_exterieur}</div>` : '';
  const saisieScore = isPasse && isBureau(membre) && !score
    ? `<button class="btn btn-sm btn-secondary" style="margin-top:8px;" onclick="saisirScore('${match.id}')">⚽ Saisir le score</button>` : '';
  const statutDateBadge = match.statut_date === 'a_confirmer'
    ? '<span class="badge badge-orange" style="font-size:10px;">⏳ Date à confirmer</span>'
    : '<span class="badge badge-vert" style="font-size:10px;">✅ Date confirmée</span>';
  // Note : le bouton "Confirmer la date" a été retiré d'ici le 05/07/2026
  // (cf. commentaire plus haut) — plus de variable confirmerBtn, la
  // confirmation ne se fait plus que depuis Admin → "Gérer le calendrier".
  // Accès direct au déplacement organisé pour ce match, s'il existe — rien
  // n'est affiché si aucun déplacement n'a encore été créé (cf. décision
  // produit : pas de bruit visuel pour signaler l'absence de déplacement).
  const depl = depParMatchId[match.id];
  const deplBtn = depl
    ? `<button class="btn btn-sm btn-primary" style="margin-top:8px;" onclick="openDepl('${depl.id}')">🚌 Voir le déplacement</button>` : '';
  // ⚠️ Bouton "Modifier le match" retiré volontairement de cette carte le
  // 05/07/2026 (demande Remi) : la modification d'un match n'est plus
  // accessible ni depuis l'accueil ni depuis la page Calendrier — les deux
  // réutilisent renderMatchCard() — pour éviter les fausses manipulations.
  // Reste possible uniquement via Admin → "Gérer le calendrier (matchs)"
  // (cf. ouvrirModifierMatchParId, admin.js).

  // Mise en page façon calendrier officiel LFP : logo domicile à gauche,
  // "VS" au centre, logo extérieur à droite, nom de l'équipe sous chaque logo.
  const logoImg = (url) => url
    ? `<img src="${esc(url)}" style="width:44px;height:44px;object-fit:contain;" onerror="this.outerHTML='<div style=&quot;width:44px;height:44px;background:var(--surface);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;&quot;>⚽</div>'">`
    : '<div style="width:44px;height:44px;background:var(--surface);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;">⚽</div>';

  return `<div class="card" style="margin-bottom:10px;border-left:3px solid ${match.statut_date==='a_confirmer'?'#F59E0B':'#10B981'};">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:4px;">
      <span style="font-size:11px;color:var(--gris);">${match.journee ? 'J'+match.journee+' · ' : ''}${date}${heure ? ' · '+heure : ''}</span>
      ${typeLabel}
    </div>
    <div style="display:flex;align-items:center;justify-content:center;gap:18px;padding:10px 0;">
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:90px;">
        ${logoImg(match.logo_domicile)}
        <div style="font-size:12px;font-weight:600;text-align:center;line-height:1.2;">${esc(match.equipe_domicile||'?')}</div>
      </div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--gris);flex-shrink:0;">VS</div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:90px;">
        ${logoImg(match.logo_exterieur)}
        <div style="font-size:12px;font-weight:600;text-align:center;line-height:1.2;">${esc(match.equipe_exterieur||'?')}</div>
      </div>
    </div>
    ${score}
    ${heure ? `<div style="font-size:12px;color:var(--bleu-clair);text-align:center;font-weight:600;">🕐 Coup d'envoi ${heure}</div>` : ''}
    ${match.stade ? `<div style="font-size:11px;color:var(--gris);text-align:center;margin-top:2px;">📍 ${esc(match.stade)}</div>` : ''}
    <div style="margin-top:8px;display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap;">
      ${match.competition ? `<span class="badge badge-bleu" style="font-size:10px;">${esc(match.competition)}</span>` : ''}
      ${statutDateBadge}
    </div>
    ${saisieScore}
    ${deplBtn}
  </div>`;
}

// Note : ouvrirModifierMatchDepuisCalendrier() a été retirée le 05/07/2026
// en même temps que le bouton "Modifier le match" de renderMatchCard —
// la modification d'un match n'est plus accessible depuis l'accueil ni le
// calendrier, uniquement via Admin → "Gérer le calendrier (matchs)".

function renderEvenementCard(ev) {
  const types = { reunion:'🤝', bbq:'🍖', fete:'🎊', autre:'🎉' };
  const couleurs = { reunion:'badge-bleu', bbq:'badge-orange', fete:'badge-orange', autre:'badge-vert' };
  const date = formatDateCourte(ev.date) || '—';
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

// ─── GÉRER LE CARTAGE (07/07/2026) ─────────────────────────────
// Remplace l'ancienne page pageCartage (liste membres + config lien
// statique) par une vraie page de gestion à 2 sous-onglets, symétrique à
// pageAdminBoutique : Articles (catalogue cartage_catalogue, CRUD comme
// Matos/Sticks) et Suivi des paiements (ex-pageCartage, filtres étendus).
let allCartage = [], currentFiltreCartage = 'tous';
let allCartageCatalogueAdmin = [];

function switchGererCartageTab(tab) {
  document.getElementById('tabGererCartageArticles').classList.toggle('active', tab === 'articles');
  document.getElementById('tabGererCartageSuivi').classList.toggle('active', tab === 'suivi');
  document.getElementById('subPageGererCartageArticles').style.display = tab === 'articles' ? 'block' : 'none';
  document.getElementById('subPageGererCartageSuivi').style.display = tab === 'suivi' ? 'block' : 'none';
}

async function loadGererCartage() {
  await Promise.all([loadGererCartageArticles(), loadCartageSuivi()]);
}

// ── Sous-onglet Articles ────────────────────────────────────────
async function loadGererCartageArticles() {
  try {
    allCartageCatalogueAdmin = await UL.getAllCartageCatalogue();
    renderGererCartageArticles();
  } catch(e) { toast('Erreur chargement cartage', 'error'); }
}

function renderGererCartageArticles() {
  const el = document.getElementById('gererCartageArticles');
  if (!allCartageCatalogueAdmin.length) { el.innerHTML = '<div class="empty-state"><div>🗂️</div>Aucun cartage créé</div>'; return; }
  el.innerHTML = allCartageCatalogueAdmin.map(c => `
    <div class="card" style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        ${c.image_url ? `<img src="${c.image_url}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;flex-shrink:0;">` : ''}
        <div style="flex:1;min-width:0;">
          <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;">${esc(c.nom)}</div>
          <div style="font-size:12px;color:var(--gris);">${c.prix}€ · Saison ${esc(c.saison)}</div>
          ${c.description ? `<div style="font-size:12px;color:var(--gris);margin-top:2px;">${esc(c.description)}</div>` : ''}
        </div>
        <span class="badge ${c.statut === 'archive' ? 'badge-rouge' : 'badge-vert'}" style="flex-shrink:0;">${c.statut === 'archive' ? 'Archivé' : 'Disponible'}</span>
      </div>
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
        <button class="btn btn-sm btn-secondary" onclick="ouvrirModifierCartage('${c.id}')">✏️ Modifier</button>
        ${c.statut !== 'archive' ? `<button class="btn btn-sm btn-danger" onclick="doArchiverCartage('${c.id}')">Archiver</button>` : ''}
      </div>
    </div>`).join('');
}

function ouvrirCreerCartage() {
  document.getElementById('cartageModalTitre').textContent = 'Ajouter un cartage';
  document.getElementById('cartageId').value = '';
  document.getElementById('cartageNom').value = '';
  document.getElementById('cartageDesc').value = '';
  document.getElementById('cartagePrix').value = '';
  document.getElementById('cartageSaison').value = allCartageCatalogueAdmin[0]?.saison || '2026-2027';
  document.getElementById('cartagePhoto').value = '';
  document.getElementById('photoPreviewCartage').style.display = 'none';
  showModal('modalCreerCartage');
}

function ouvrirModifierCartage(id) {
  const c = allCartageCatalogueAdmin.find(x => x.id === id);
  if (!c) return toast('Cartage introuvable', 'error');
  document.getElementById('cartageModalTitre').textContent = 'Modifier le cartage';
  document.getElementById('cartageId').value = c.id;
  document.getElementById('cartageNom').value = c.nom;
  document.getElementById('cartageDesc').value = c.description || '';
  document.getElementById('cartagePrix').value = c.prix;
  document.getElementById('cartageSaison').value = c.saison;
  document.getElementById('cartagePhoto').value = '';
  if (c.image_url) {
    document.getElementById('photoPreviewImgCartage').src = c.image_url;
    document.getElementById('photoPreviewCartage').style.display = 'block';
  } else {
    document.getElementById('photoPreviewCartage').style.display = 'none';
  }
  showModal('modalCreerCartage');
}

async function doSauvegarderCartage() {
  const id = document.getElementById('cartageId').value;
  const nom = document.getElementById('cartageNom').value.trim();
  const prix = parseFloat(document.getElementById('cartagePrix').value);
  const saison = document.getElementById('cartageSaison').value.trim();
  if (!nom) return toast('Nom requis', 'error');
  if (!prix || isNaN(prix)) return toast('Prix requis', 'error');
  if (!saison) return toast('Saison requise', 'error');
  const payload = {
    nom,
    description: document.getElementById('cartageDesc').value.trim() || null,
    prix,
    saison,
  };
  try {
    showLoading();
    const photoFile = document.getElementById('cartagePhoto').files[0];
    if (photoFile) {
      payload.image_url = await UL.uploadPhotoCartage(photoFile, nom);
    }
    if (id) await UL.updateCartage(id, payload);
    else await UL.createCartage({ ...payload, statut: 'disponible' });
    hideLoading();
    toast('Cartage enregistré ✅', 'success');
    closeModal('modalCreerCartage');
    loadGererCartageArticles();
  } catch(e) { hideLoading(); toast(e.message || 'Impossible d\'enregistrer le cartage', 'error'); }
}

async function doArchiverCartage(id) {
  if (!confirm('Archiver ce cartage ? Il ne sera plus proposé aux membres.')) return;
  try { await UL.archiverCartage(id); toast('Cartage archivé', 'success'); loadGererCartageArticles(); }
  catch(e) { toast('Impossible d\'archiver ce cartage', 'error'); }
}

// ── Sous-onglet Suivi des paiements (ex-pageCartage) ────────────
async function loadCartageSuivi() {
  try {
    allCartage = await UL.getAllCartagePaiements();
    const cartes = allCartage.filter(m => m.cotisation_a_jour && m.charte_signee);
    const incomplets = allCartage.filter(m => !m.cotisation_a_jour || !m.charte_signee);
    const enAttente = allCartage.filter(m => m.dernierPaiementCartage && m.dernierPaiementCartage.statut === 'en_attente');
    const payes = allCartage.filter(m => m.cotisation_a_jour);
    document.getElementById('cartageStats').innerHTML =
      `<span>👥 ${allCartage.length} membres</span>` +
      `<span style="color:var(--vert);">✅ ${cartes.length} cartés</span>` +
      `<span style="color:var(--orange);">⚠️ ${incomplets.length} incomplets</span>` +
      `<span style="color:var(--bleu-clair);">⏳ ${enAttente.length} en attente de paiement</span>`;
    filtrerCartage(currentFiltreCartage);
  } catch(e) { toast('Erreur cartage', 'error'); }
}

function filtrerCartage(filtre) {
  currentFiltreCartage = filtre;
  ['fcartTous','fcartCartes','fcartIncomplets','fcartAttente','fcartPaye'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const aid = {tous:'fcartTous',cartes:'fcartCartes',incomplets:'fcartIncomplets',attente:'fcartAttente',paye:'fcartPaye'}[filtre];
  if (aid && document.getElementById(aid)) document.getElementById(aid).classList.add('active');

  let filtered = allCartage;
  if (filtre === 'cartes') filtered = allCartage.filter(m => m.cotisation_a_jour && m.charte_signee);
  if (filtre === 'incomplets') filtered = allCartage.filter(m => !m.cotisation_a_jour || !m.charte_signee);
  // Nouveaux filtres (07/07/2026, demande Remi) : basés sur le paiement de
  // cartage le plus récent (dernierPaiementCartage), indépendamment de la
  // charte — un membre "en attente de paiement" a une tentative HelloAsso
  // en cours (en_attente) non encore confirmée ni refusée.
  if (filtre === 'attente') filtered = allCartage.filter(m => m.dernierPaiementCartage && m.dernierPaiementCartage.statut === 'en_attente');
  if (filtre === 'paye') filtered = allCartage.filter(m => m.cotisation_a_jour);

  const el = document.getElementById('cartageListe');
  if (!filtered.length) { el.innerHTML = '<div class="empty-state"><div>🗂️</div>Aucun membre</div>'; return; }

  el.innerHTML = filtered.map(m => {
    const carte = m.cotisation_a_jour && m.charte_signee;
    const dp = m.dernierPaiementCartage;
    return `<div class="card" style="margin-bottom:8px;padding:12px;border-left:3px solid ${carte?'#22C55E':'#F59E0B'};">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="avatar" style="width:36px;height:36px;font-size:13px;">${((m.prenom||'?')[0]+(m.nom||'?')[0]).toUpperCase()}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;">${esc(m.prenom)} ${esc(m.nom)}</div>
          <div style="font-size:11px;color:var(--gris);">@${esc(m.pseudo_telegram)} · <span class="statut-${m.statut}">${m.statut}</span></div>
          <div style="font-size:11px;margin-top:3px;">
            ${m.cotisation_a_jour ? '✅' : '❌'} Cotisation &nbsp;|&nbsp; ${m.charte_signee ? '✅' : '❌'} Charte
          </div>
          ${dp && dp.statut === 'en_attente' ? `<div style="font-size:11px;color:var(--bleu-clair);margin-top:2px;">⏳ Paiement en cours (${esc(dp.cartage?.nom||'?')})</div>` : ''}
          ${dp && dp.statut === 'refuse' ? `<div style="font-size:11px;color:var(--rouge);margin-top:2px;">❌ Paiement refusé (${esc(dp.cartage?.nom||'?')})</div>` : ''}
        </div>
        <span class="badge ${carte?'badge-vert':'badge-orange'}" style="flex-shrink:0;">${carte?'✅ Carté':'⚠️ Incomplet'}</span>
      </div>
      ${!m.cotisation_a_jour ? `
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
        <button class="btn btn-sm btn-primary" onclick="ouvrirValiderCartage('${m.id}','${esc(m.prenom)} ${esc(m.nom)}')">💰 Valider un paiement</button>
      </div>` : ''}
    </div>`;
  }).join('');
}

// Modal de validation Cash/HA — nécessite de choisir QUEL cartage
// désormais (plusieurs types possibles), contrairement à l'ancien bouton
// direct Cash/HA quand il n'y avait qu'un seul cartage global.
async function ouvrirValiderCartage(membreId, nomMembre) {
  document.getElementById('validerCartageMembreId').value = membreId;
  document.getElementById('validerCartageTitre').textContent = `Valider le paiement — ${nomMembre}`;
  document.getElementById('validerCartageOptions').innerHTML = '<div class="empty-state"><div>⏳</div>Chargement…</div>';
  showModal('modalValiderCartagePaiement');
  try {
    const catalogue = await UL.getCartageCatalogue();
    document.getElementById('validerCartageOptions').innerHTML = catalogue.length ? catalogue.map(c => `
      <div class="card" style="margin-bottom:8px;padding:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-weight:600;">${esc(c.nom)}</div>
          <div>${c.prix}€</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-success" style="flex:1;" onclick="doValiderCartage('${c.id}','cash')">💵 Cash</button>
          <button class="btn btn-sm btn-primary" style="flex:1;" onclick="doValiderCartage('${c.id}','helloasso')">💳 HA (manuel)</button>
        </div>
      </div>`).join('') : '<div class="empty-state"><div>📦</div>Aucun cartage disponible — crée-en un dans l\'onglet Articles.</div>';
  } catch(e) {
    document.getElementById('validerCartageOptions').innerHTML = '<div class="empty-state">Erreur de chargement</div>';
  }
}

async function doValiderCartage(cartageId, mode) {
  const membreId = document.getElementById('validerCartageMembreId').value;
  try {
    if (mode === 'cash') await UL.validerCartageCash(membreId, cartageId);
    else await UL.validerCartageHelloAssoManuel(membreId, cartageId);
    toast('Cotisation validée ✅', 'success');
    closeModal('modalValiderCartagePaiement');
    loadCartageSuivi();
  } catch(e) { toast(e.message || 'Impossible de valider ce paiement', 'error'); }
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

async function doSauvegarderEvenement(btn) {
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
  const texteOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
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
  } catch(e) {
    toast(e.message || 'Erreur', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
  }
}

async function doSupprimerEvenement(id) {
  if (!confirm('Supprimer cet événement ?')) return;
  try {
    await UL.deleteEvenement(id);
    toast('Événement supprimé', 'success');
    loadCalendrier();
  } catch(e) { toast('Impossible de supprimer l\'événement', 'error'); }
}
