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
  const date = match.date ? new Date(match.date).toLocaleDateString('fr-FR', {weekday:'short',day:'numeric',month:'short'}) : '—';
  const isPasse = match.date && new Date(match.date) < new Date();
  const typeLabel = match.type === 'domicile'
    ? '<span class="badge badge-vert">🏠 Domicile</span>'
    : '<span class="badge badge-rouge">✈️ Extérieur</span>';
  const score = (match.score_domicile !== null && match.score_exterieur !== null)
    ? `<div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.05em;text-align:center;margin:6px 0;">${match.score_domicile} — ${match.score_exterieur}</div>` : '';
  const saisieScore = isPasse && isBureau(membre) && !score
    ? `<button class="btn btn-sm btn-secondary" style="margin-top:8px;" onclick="saisirScore('${match.id}')">⚽ Saisir le score</button>` : '';
  const statutDateBadge = match.statut_date === 'a_confirmer'
    ? '<span class="badge badge-orange" style="font-size:10px;">⏳ Date à confirmer</span>' : '';
  const confirmerBtn = isBureau(membre) && match.statut_date === 'a_confirmer'
    ? `<button class="btn btn-sm btn-success" style="margin-top:8px;" onclick="ouvrirConfirmerDate('${match.id}')">✅ Confirmer la date</button>` : '';

  // Mise en page façon calendrier officiel LFP : logo domicile à gauche,
  // "VS" au centre, logo extérieur à droite, nom de l'équipe sous chaque logo.
  const logoImg = (url) => url
    ? `<img src="${esc(url)}" style="width:44px;height:44px;object-fit:contain;">`
    : '<div style="width:44px;height:44px;background:var(--surface);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;">⚽</div>';

  return `<div class="card" style="margin-bottom:10px;${match.statut_date==='a_confirmer'?'border-left:3px solid #F59E0B;':''}">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:4px;">
      <span style="font-size:11px;color:var(--gris);">${match.journee ? 'J'+match.journee+' · ' : ''}${date}${match.horaire?' · '+match.horaire.slice(0,5):''}</span>
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
    ${match.stade ? `<div style="font-size:11px;color:var(--gris);text-align:center;margin-top:2px;">📍 ${esc(match.stade)}</div>` : ''}
    <div style="margin-top:8px;display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap;">
      ${match.competition ? `<span class="badge badge-bleu" style="font-size:10px;">${esc(match.competition)}</span>` : ''}
      ${statutDateBadge}
    </div>
    ${saisieScore}
    ${confirmerBtn}
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
