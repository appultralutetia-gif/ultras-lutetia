// AUTO-GÉNÉRÉ — fonctions pures extraites de app.js pour les tests
// Régénérer avec : python3 scripts/generate_testable.py
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


function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

const PIZZAS = [
  {id:'margherita',label:'Margherita',emoji:'🍕'},
  {id:'regina',label:'Regina (Jambon Champignon)',emoji:'🍕'},
  {id:'4fromages',label:'4 Fromages',emoji:'🍕'},
  {id:'bellissima',label:'Bellissima (Viande, Chorizo, Poivrons)',emoji:'🍕'},
  {id:'aucune',label:'Je ne mange pas',emoji:'🚫'},
];
const PINTES = [
  {id:'blonde',label:'Blonde',emoji:'🍺'},
  {id:'brune',label:'Brune',emoji:'🍺'},
  {id:'sans',label:'Sans pinte',emoji:'❌'},
];

// ── renderTifoCard ──
function renderTifoCard(s) {
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
    <div class="tifo-admin-bar">
      ${isPlanned ? `<button class="btn btn-sm btn-success" onclick="doOuvrirSession('${s.id}',event)">▶ Ouvrir</button>` : ''}
      ${isOpen    ? `<button class="btn btn-sm btn-danger"  onclick="doFermerSession('${s.id}',event)">⏹ Fermer</button>` : ''}
      ${isOpen && s.code_validation ? `<div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:.3em;color:var(--vert);padding:4px 10px;background:rgba(34,197,94,.12);border-radius:8px;">🔑 ${s.code_validation}</div>` : ''}
      <button class="btn btn-sm btn-secondary" onclick="voirInscrits('${s.id}','${esc(s.nom)}',event)">👥 Inscrits</button>
      ${s.avec_pizza ? `<button class="btn btn-sm btn-secondary" onclick="voirCommandesPizza('${s.id}','${esc(s.nom)}',event)">🍕 Commandes</button>` : ''}
      <button class="btn btn-sm btn-danger"   onclick="doSupprimerSession('${s.id}',event)">🗑</button>
    </div>` : '';

  return `<div class="tifo-card ${isOpen?'open':''}">
    <div style="display:flex;align-items:flex-start;gap:10px;">
      <div class="status-dot ${isOpen?'open':isPlanned?'planned':'closed'}" style="margin-top:5px;"></div>
      <div style="flex:1;min-width:0;">
        <div class="card-title">${types[s.type_session]||'📋'} ${esc(s.nom)}</div>
        <div class="card-sub">${date}${s.heure?' · '+s.heure.slice(0,5):''} · ${esc(s.lieu)}</div>
        ${s.avec_pizza ? '<div style="font-size:11px;color:var(--pizza);margin-top:4px;">🍕 Tifo pizza</div>' : ''}
        ${s.capacite_max ? `<div style="font-size:11px;color:var(--gris);margin-top:2px;">👥 ${s._nb_inscrits||0} / ${s.capacite_max} places</div>` : ''}
      </div>
      ${badge}
    </div>

    <!-- Zone actions membre -->
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);" id="sessionActions_${s.id}">
      <button class="btn btn-primary" style="width:100%;padding:8px;" onclick="loadTifoActions('${s.id}', this)">
        ${isPlanned ? "S'inscrire à ce tifo" + (s.avec_pizza?' 🍕':'') : isOpen ? 'Voir mes options' : 'Tifo terminé'}
      </button>
    </div>

    <!-- Participants (visible par tous) -->
    <div style="margin-top:8px;">
      <button class="btn btn-secondary" style="width:100%;padding:8px;" onclick="toggleParticipants('${s.id}', event)">
        👥 Voir les participants
      </button>
      <div id="participants_${s.id}" style="display:none;margin-top:8px;"></div>
    </div>

    ${adminBar}
  </div>`;
}
// ── renderDeplCard ──
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
// ── renderMembres ──
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
        <button class="btn btn-sm ${m.actif?'btn-danger':'btn-success'}" onclick="toggleMembre('${m.id}',${!m.actif})">
          ${m.actif?'Bloquer':'Débloquer'}
        </button>
      </div>
    </div>`).join('');
}
// ── renderMatchCard ──
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
// ── renderEvenementCard ──
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
// ── renderMatos ──
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
          <button class="btn btn-sm btn-secondary" onclick="modifierStock('${p.id}','${esc(p.nom)}',${p.stock})">📦 Stock</button>
          <button class="btn btn-sm btn-secondary" onclick="uploadPhotoExistant('${p.id}','matos')">🖼️ Photo</button>
          <button class="btn btn-sm btn-danger" onclick="doArchiverProduit('${p.id}')">Archiver</button>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
}
// ── filtrerMembres ──
function filtrerMembres() {
  const q = document.getElementById('searchMembre').value.toLowerCase();
  const s = document.getElementById('filterStatut').value;
  renderMembres(allMembres.filter(m => {
    const match = `${m.nom} ${m.prenom} ${m.pseudo_telegram}`.toLowerCase().includes(q);
    return match && (!s || m.statut === s);
  }));
}
// ── filtrerCartage ──
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
// ── copierInscrits ──
function copierInscrits(pseudos) {
  const texte = pseudos.map((p,i) => `${i+1}. @${p}`).join('\n');
  navigator.clipboard.writeText(texte).then(() => toast('Liste Telegram copiée !', 'success'));
}
// ── copierListeComplete ──
function copierListeComplete(membres) {
  const entete = 'Pseudo | Prénom Nom | Statut | Section | Présence';
  const lignes = membres.map(m => `@${m.pseudo} | ${m.prenom} ${m.nom} | ${m.statut} | ${m.section||'—'} | ${m.presence}`);
  navigator.clipboard.writeText([entete,...lignes].join('\n')).then(() => toast(`Liste copiée (${membres.length}) !`, 'success'));
}
// ── doLogout ──
async function doLogout() {
  try {
    await UL.logout();
  } catch(e) {
    console.error('Erreur déconnexion:', e);
  } finally {
    showLoginPage();
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    hasRoleApp,isAdmin,isBureau,isCellule,
    hasCelluleTifo,hasCelluleDepl,hasCelluleMatos,
    hasCelluleSticks,hasCelluleComite,peutValiderInscriptions,
    esc,PIZZAS,PINTES,
    renderTifoCard,renderDeplCard,renderMembres,
    renderMatchCard,renderEvenementCard,renderMatos,
    filtrerMembres,filtrerCartage,copierInscrits,copierListeComplete,
    doLogout,
  };
}
