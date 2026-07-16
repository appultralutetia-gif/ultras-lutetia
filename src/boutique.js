// ─── BOUTIQUE ─────────────────────────────────────────────────

let allProduits = [], allSticks = [];
let currentFiltresMatos = 'tous', currentFiltresSticks = 'tous';

async function loadBoutique() {
  // Note (05/07/2026) : les actions d'admin (Ajouter un article/stick,
  // Modifier, Stock, Photo, Archiver, Cash, Toutes les commandes,
  // Historique distributions) ont été retirées de cette page — elles
  // vivent désormais uniquement dans la page dédiée pageAdminBoutique
  // (cf. loadAdminBoutique), accessible via Admin → "Gérer la boutique
  // matos/sticks". Cette page (bottom nav "Boutique") reste 100% côté
  // membre : parcourir le catalogue et acheter, rien d'autre.
  // Le lien "⚙️ Gérer le cartage" (admin/bureau) est géré directement
  // dans loadCotisation() via #cotisationAdminLien.
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
    // En mode précommande, le badge "stock" n'a pas de sens (stock=0 par
    // défaut tant que rien n'est reçu) — on affiche plutôt l'état de la
    // fenêtre de précommande (05/07/2026, corrige le badge "Épuisé"
    // trompeur signalé par Remi). En mode stock, comportement inchangé.
    const precommandeOuverte = precommandeEstOuverte(p);
    let stockBadge;
    if (p.mode === 'precommande') {
      if (precommandePasEncoreOuverte(p)) {
        stockBadge = `<span class="badge badge-orange" style="font-size:10px;">Précommande dès le ${new Date(p.precommande_debut).toLocaleDateString('fr-FR')}</span>`;
      } else if (!precommandeOuverte) {
        stockBadge = `<span class="badge badge-rouge" style="font-size:10px;">Précommande terminée</span>`;
      } else {
        stockBadge = '';
      }
    } else {
      stockBadge = p.stock <= 3 && p.stock > 0
        ? `<span class="badge badge-orange" style="font-size:10px;">Stock limité</span>`
        : p.stock === 0 ? `<span class="badge badge-rouge" style="font-size:10px;">Épuisé</span>` : '';
    }
    const sectionBadge = p.section
      ? `<span class="badge badge-bleu" style="font-size:10px;">Section ${p.section.nom}</span>` : '';
    const peutCommander = (p.stock > 0 || p.mode === 'precommande') && precommandeOuverte;
    return `<div class="produit-card">
      <div class="produit-img">${p.photo_url ? `<img src="${p.photo_url}" alt="${esc(p.nom)}">` : icones[p.categorie] || '📦'}</div>
      <div class="produit-info">
        <div class="produit-nom">${esc(p.nom)}</div>
        <div class="produit-prix">${p.prix}€</div>
        <div class="produit-meta">
          ${labelTypeTailles(p.type_tailles) ? `• ${labelTypeTailles(p.type_tailles)}` : ''}
          ${p.quota_par_membre ? `• Quota: ${p.quota_par_membre} max` : ''}
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${stockBadge}${sectionBadge}</div>
        ${p.mode === 'precommande' && (p.precommande_debut || p.precommande_fin) ? `<div style="font-size:11px;color:var(--gris);margin-top:4px;">📅 Précommande${formatPlagePrecommande(p)}</div>` : ''}
        ${p.mode === 'precommande' && p.precommande_livraison_estimee ? `<div style="font-size:11px;color:var(--bleu-clair);margin-top:4px;">📅 Livraison estimée : ${new Date(p.precommande_livraison_estimee).toLocaleDateString('fr-FR', { day:'numeric', month:'long' })}</div>` : ''}
        ${peutCommander ? `
        <button class="btn btn-sm btn-primary" style="margin-top:10px;" onclick="openCommander('${p.id}')">
          ${p.mode === 'precommande' ? '📋 Précommander' : '🛒 Commander'}
        </button>` : ''}
      </div>
    </div>`;
  }).join('');
}

// Article actuellement ouvert dans modalCommander — permet à
// changerQuantiteCommande() de connaître les bornes (stock, quota) sans
// resolliciter le réseau à chaque clic +/-.
let _produitCommandeCourant = null;

async function openCommander(produitId) {
  try {
    const p = await UL.getProduitById(produitId);
    if (!precommandeEstOuverte(p)) return toast('Précommande terminée', 'error');
    _produitCommandeCourant = p;
    const icones = { textile:'👕', accessoire:'🎒' };

    // Section tailles — menu déroulant (05/07/2026, demande Remi ; boutons
    // cliquables remplacés par un <select>, plus rapide sur mobile et plus
    // cohérent avec le reste des formulaires de l'app).
    const taillesHtml = taillesPourType(p.type_tailles) ? `
      <div class="form-group">
        <label>Taille</label>
        <select id="cmdTaille">
          ${optionsTaillesHtml(p.type_tailles)}
        </select>
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
        <label>Quantité</label>
        <div style="display:flex;align-items:center;gap:14px;">
          <button type="button" class="btn btn-sm btn-secondary" onclick="changerQuantiteCommande(-1)">−</button>
          <span id="cmdQuantiteAffichage" style="font-size:17px;font-weight:700;min-width:26px;text-align:center;">1</span>
          <button type="button" class="btn btn-sm btn-secondary" onclick="changerQuantiteCommande(1)">+</button>
        </div>
        <input type="hidden" id="cmdQuantite" value="1">
      </div>
      <div class="form-group">
        <label>Mode de paiement</label>
        <select id="cmdMode" style="background:#1F2937;border:1.5px solid #4B5563;color:white;padding:11px 14px;border-radius:9px;width:100%;font-size:15px;">
          <option value="helloasso">💳 HelloAsso (en ligne)</option>
          ${p.mode !== 'precommande' ? `<option value="cash">💵 Cash (en présentiel)</option>` : ''}
        </select>
      </div>
      ${p.mode === 'precommande' ? `<div class="info-box" style="font-size:12px;">📋 Article en précommande — paiement HelloAsso uniquement. Il sera disponible au retrait une fois reçu par la cellule Matos.</div>` : ''}
      <button class="btn btn-primary" onclick="doCommander('${p.id}',${!!taillesPourType(p.type_tailles)})">Valider la commande</button>
      <button class="btn btn-secondary" style="margin-top:8px;" onclick="closeModal('modalCommander')">Annuler</button>
    `;
    showModal('modalCommander');
  } catch(e) { toast('Erreur chargement article', 'error'); }
}

// Borne la quantité entre 1 et le plus restrictif de : stock disponible
// (si mode 'stock', un article en 'precommande' n'a pas cette limite) et
// quota_par_membre. Pas de vérification du quota déjà consommé ici (ça
// reste fait côté passerCommande/Edge Function au moment de valider) —
// juste un garde-fou évident côté UI pour éviter de saisir une quantité
// absurde.
function changerQuantiteCommande(delta) {
  const p = _produitCommandeCourant;
  if (!p) return;
  const input = document.getElementById('cmdQuantite');
  const affichage = document.getElementById('cmdQuantiteAffichage');
  let max = 99;
  if (p.mode !== 'precommande' && p.stock > 0) max = Math.min(max, p.stock);
  if (p.quota_par_membre) max = Math.min(max, p.quota_par_membre);
  const nouvelle = Math.max(1, Math.min(max, (parseInt(input.value) || 1) + delta));
  input.value = nouvelle;
  affichage.textContent = nouvelle;
}

// Note : selectTaille() a été retirée le 05/07/2026 — le sélecteur de
// taille est désormais un <select> natif (cf. taillesHtml, openCommander),
// qui n'a besoin d'aucun gestionnaire de clic dédié.

async function doCommander(produitId, avecTailles = false) {
  const taille = avecTailles ? (document.getElementById('cmdTaille')?.value || null) : null;
  const quantite = parseInt(document.getElementById('cmdQuantite')?.value) || 1;
  const mode = document.getElementById('cmdMode').value;
  if (avecTailles && !taille) return toast('Sélectionne une taille', 'error');
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    if (mode === 'helloasso') {
      const { redirectUrl, commandeId } = await UL.demanderCommandeHelloAsso(produitId, taille, quantite);
      closeModal('modalCommander');
      afficherAvertissementHelloAsso(redirectUrl, 'matos', commandeId);
      // Pas de réactivation du bouton : soit l'avertissement s'affiche
      // (l'utilisateur peut revenir en arrière depuis là), soit la page
      // quitte directement l'app vers HelloAsso (case "ne plus afficher").
    } else {
      await UL.passerCommande(produitId, taille, quantite);
      toast('Commande enregistrée ✅', 'success');
      closeModal('modalCommander');
      loadMatos();
    }
  } catch(e) {
    toast(e.message || 'Erreur commande', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Valider la commande'; }
  }
}

function renderMesCommandes(commandes) {
  const el = document.getElementById('mesCommandes');
  if (!commandes.length) { el.innerHTML = '<p style="color:var(--gris);font-size:13px;">Aucune commande</p>'; return; }
  const statuts = {
    en_attente:'⏳ En attente de paiement', precommande_validee:'📋 Précommande validée — en attente de réception',
    disponible:'✅ Disponible — à retirer', prepare:'✅ Disponible — à retirer', distribue:'✔️ Récupérée', refuse:'❌ Paiement refusé', annulee:'❌ Annulée',
  };
  // 'prepare' (préparé à l'avance par l'équipe, 07/07/2026) est un statut
  // purement interne — le membre doit toujours voir "Disponible", jamais
  // ce détail de préparation.
  const badgeClasse = c => {
    if (c.statut === 'distribue' || c.statut === 'disponible' || c.statut === 'prepare') return 'badge-vert';
    if (c.statut === 'precommande_validee') return 'badge-bleu';
    if (c.statut === 'refuse' || c.statut === 'annulee') return 'badge-rouge';
    return 'badge-orange';
  };
  el.innerHTML = commandes.map(c => {
    const items = c.commande_items || [];
    // Repli défensif : si aucune ligne n'est remontée (cf. le bug RLS
    // suspecté sur commande_items, voir getMesCommandes), on l'affiche
    // clairement au lieu de laisser un titre vide qui donne l'impression
    // que la commande est "muette" — et ça permet de repérer facilement
    // si le souci revient après la migration RLS.
    if (!items.length) console.warn('Commande sans commande_items — RLS ?', c.id);
    const detailItems = items.length
      ? items.map(i => `${esc(i.produit?.nom || '?')} ×${i.quantite}${i.taille ? ` (${esc(i.taille)})` : ''}`).join(', ')
      : '⚠️ Détail de commande indisponible — contacte le bureau si besoin';
    // Date de livraison estimée — portée par l'article (fixée une fois
    // par l'admin pour toute la précommande, pas par commande individuelle).
    const livraisonEstimee = items
      .map(i => i.produit?.mode === 'precommande' ? i.produit?.precommande_livraison_estimee : null)
      .find(Boolean);
    return `
    <div class="card" style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;">${detailItems}</div>
        <span class="badge ${badgeClasse(c)}">${statuts[c.statut]||c.statut}</span>
      </div>
      <div style="font-size:12px;color:var(--gris);">
        ${c.total}€ · ${c.mode_paiement === 'helloasso' ? 'HelloAsso' : 'Cash'} ·
        ${new Date(c.created_at).toLocaleDateString('fr-FR')}
      </div>
      ${livraisonEstimee ? `<div style="font-size:12px;color:var(--bleu-clair);margin-top:4px;">📅 Livraison estimée : ${new Date(livraisonEstimee).toLocaleDateString('fr-FR', { day:'numeric', month:'long' })}</div>` : ''}
      ${c.mode_paiement === 'helloasso' && (c.statut === 'refuse' || c.statut === 'en_attente') ? `
      <button class="btn btn-sm btn-primary" style="width:100%;margin-top:8px;" onclick="doReessayerCommande('${c.commande_items?.[0]?.produit_id||''}')">${c.statut === 'refuse' ? '🔄 Relancer le paiement' : '💳 Reprendre le paiement'}</button>` : ''}
      ${c.statut === 'en_attente' ? `
      <button class="btn btn-sm btn-danger" style="width:100%;margin-top:6px;" onclick="doAnnulerCommande('${c.id}')">❌ Annuler</button>` : ''}
    </div>`;
  }).join('');
}

// Annulation par le membre lui-même (uniquement si en_attente) — cash
// ou HelloAsso abandonné. L'admin peut annuler depuis la vue Gestion
// (bouton déjà présent dans renderToutesCommandes).
async function doAnnulerCommande(commandeId) {
  if (!confirm('Annuler cette commande ? Cette action est irréversible.')) return;
  try {
    await UL.updateCommandeStatut(commandeId, 'annulee');
    toast('Commande annulée', 'success');
    loadMatos();
  } catch(e) { toast(e.message || 'Impossible d\'annuler cette commande', 'error'); }
}

// Un membre dont le paiement HelloAsso a été refusé doit pouvoir relancer
// directement une nouvelle tentative — on rouvre simplement la modal de
// commande sur le même article plutôt que de le laisser bloqué.
function doReessayerCommande(produitId) {
  if (!produitId) return toast('Article introuvable pour relancer le paiement', 'error');
  openCommander(produitId);
}

// Sélection courante pour la validation groupée de réception (Matos) —
// uniquement des commandes en 'precommande_validee', réinitialisée à
// chaque rechargement/changement de filtre pour éviter de garder une
// sélection sur des commandes qui ne sont plus affichées.
let commandesSelectionneesReception = new Set();

function renderToutesCommandes(commandes) {
  const el = document.getElementById('adminToutesCommandes');
  if (!commandes.length) { el.innerHTML = '<p style="color:var(--gris);font-size:13px;">Aucune commande</p>'; commandesSelectionneesReception.clear(); return; }
  const statuts = { en_attente:'⏳', prepare:'📦', precommande_validee:'📋', disponible:'✅', distribue:'✔️', refuse:'❌', annulee:'❌' };

  // Ne garder en sélection que des commandes toujours affichées et
  // toujours en precommande_validee (évite de valider par erreur une
  // commande déjà traitée entretemps par quelqu'un d'autre).
  const idsPrecommandeValidee = commandes.filter(c => c.statut === 'precommande_validee').map(c => c.id);
  const idsPrecommandeValideeSet = new Set(idsPrecommandeValidee);
  [...commandesSelectionneesReception].forEach(id => { if (!idsPrecommandeValideeSet.has(id)) commandesSelectionneesReception.delete(id); });

  // Barre de sélection groupée — n'apparaît que s'il y a au moins une
  // précommande validée à réceptionner dans la vue actuelle (05/07/2026
  // demande Remi : pouvoir valider la réception de tout un lot de
  // précommande d'un coup, plutôt qu'article par article).
  const barreSelection = idsPrecommandeValidee.length ? `
    <div class="card" style="margin-bottom:8px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;background:var(--surface-2);">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin:0;">
        <input type="checkbox" ${commandesSelectionneesReception.size === idsPrecommandeValidee.length ? 'checked' : ''}
          onclick='toggleToutesSelectionCommandes(${JSON.stringify(idsPrecommandeValidee)})'>
        Tout sélectionner (${idsPrecommandeValidee.length} précommande${idsPrecommandeValidee.length>1?'s':''} validée${idsPrecommandeValidee.length>1?'s':''})
      </label>
      ${commandesSelectionneesReception.size ? `<button class="btn btn-sm btn-primary" onclick="doReceptionnerCommandesEnMasse()">✅ Valider la réception (${commandesSelectionneesReception.size})</button>` : ''}
    </div>` : '';

  // Tri d'affichage (12/07/2026, demande Remi) : commandes "en cours"
  // (cf. STATUTS_EN_COURS, même constante que le filtre "En cours" de
  // l'onglet) groupées en premier, annulées/refusées/déjà reçues après —
  // évite qu'une commande annulée s'intercale visuellement entre deux
  // commandes qui nécessitent encore une action. Tri stable : à
  // l'intérieur de chaque groupe, l'ordre d'origine (plus récent
  // d'abord) est conservé.
  const commandesTriees = [...commandes].sort((a, b) => {
    const aEnCours = STATUTS_EN_COURS.includes(a.statut) ? 0 : 1;
    const bEnCours = STATUTS_EN_COURS.includes(b.statut) ? 0 : 1;
    return aEnCours - bEnCours;
  });

  el.innerHTML = barreSelection + commandesTriees.map(c => `
    <div class="card" style="margin-bottom:8px;${c.statut==='en_attente'?'opacity:.65;border-left:3px solid #F59E0B;':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${c.statut === 'precommande_validee' ? `<input type="checkbox" ${commandesSelectionneesReception.has(c.id)?'checked':''} onclick="toggleSelectionCommande('${c.id}')">` : ''}
          <div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;">@${c.membre?.pseudo_telegram||'?'}</div>
            <div style="font-size:12px;color:var(--gris);">${(c.commande_items||[]).map(i=>`${esc(i.produit?.nom||'?')}${i.taille?` (${esc(i.taille)})`:''}${i.quantite>1?` ×${i.quantite}`:''}`).join(', ')} · ${c.total}€ · ${c.mode_paiement === 'helloasso' ? 'HelloAsso' : 'Cash'}</div>
          </div>
        </div>
        <span class="badge ${c.statut==='distribue'||c.statut==='disponible'?'badge-vert':c.statut==='prepare'||c.statut==='precommande_validee'?'badge-bleu':c.statut==='refuse'||c.statut==='annulee'?'badge-rouge':'badge-orange'}">${statuts[c.statut]||''} ${c.statut}</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${c.statut==='en_attente' && c.mode_paiement==='cash' ? `<button class="btn btn-sm btn-success" onclick="changerStatutCommande('${c.id}','disponible')">💵 Confirmer paiement cash</button>` : ''}
        ${c.statut==='precommande_validee' ? `<button class="btn btn-sm btn-primary" onclick="doReceptionnerCommande('${c.id}')">📦 Marquer reçu</button>` : ''}
        ${c.statut==='disponible' ? `<button class="btn btn-sm btn-secondary" onclick="doMarquerPreparee('matos','${c.id}')">✔️ Marquer préparé</button>` : ''}
        ${['en_attente','precommande_validee'].includes(c.statut) ? `<button class="btn btn-sm btn-danger" onclick="changerStatutCommande('${c.id}','annulee')">Annuler</button>` : ''}
      </div>
    </div>`).join('');
}

function toggleSelectionCommande(id) {
  if (commandesSelectionneesReception.has(id)) commandesSelectionneesReception.delete(id);
  else commandesSelectionneesReception.add(id);
  filtrerCommandesAdminSansEvent(currentFiltreCommandesAdmin);
}

function toggleToutesSelectionCommandes(ids) {
  if (commandesSelectionneesReception.size === ids.length) commandesSelectionneesReception.clear();
  else ids.forEach(id => commandesSelectionneesReception.add(id));
  filtrerCommandesAdminSansEvent(currentFiltreCommandesAdmin);
}

// Validation groupée — avec pop-up de confirmation rappelant de bien
// vérifier les articles/tailles reçus avant de tout basculer en
// 'disponible' d'un coup (demande Remi 07/07/2026 : chaque précommande
// correspond à une vente groupée, donc un seul geste pour réceptionner
// tout le lot une fois le colis reçu et contrôlé).
// Notifie le membre que son article est prêt à être retiré (08/07/2026,
// demande Remi) — cherché dans allCommandesAdmin (déjà chargé) plutôt que
// de refaire une requête réseau. Jamais bloquant : une notification qui
// échoue ne doit jamais empêcher la réception elle-même de réussir (déjà
// garanti par envoyerNotificationPush, qui échoue silencieusement).
function notifierReceptionCommande(commandeId) {
  const c = allCommandesAdmin.find(x => x.id === commandeId);
  if (!c?.membre_id) return;
  const nomArticle = (c.commande_items || []).map(i => i.produit?.nom || '?').join(', ') || 'Ton article';
  UL.envoyerNotificationPush(c.membre_id, '📦 Disponible !', `${nomArticle} est prêt — viens le récupérer.`, '/ultras-lutetia/');
}

async function doReceptionnerCommandesEnMasse() {
  const ids = [...commandesSelectionneesReception];
  if (!ids.length) return;
  const confirme = confirm(
    `Tu es sur le point de marquer ${ids.length} commande${ids.length>1?'s':''} comme reçue${ids.length>1?'s':''} (disponible${ids.length>1?'s':''} au retrait).\n\n` +
    `As-tu bien vérifié que les articles et les tailles reçus correspondent exactement à ce qui a été commandé pour chacune ?\n\n` +
    `Cette action ne peut pas être annulée en masse ensuite.`
  );
  if (!confirme) return;
  let ok = 0, echecs = 0;
  for (const id of ids) {
    try { await UL.receptionnerCommande(id); notifierReceptionCommande(id); ok++; }
    catch(e) { echecs++; }
  }
  commandesSelectionneesReception.clear();
  toast(echecs ? `${ok} validée(s), ${echecs} échec(s)` : `${ok} commande(s) marquée(s) reçue(s) ✅`, echecs ? 'error' : 'success');
  loadAdminBoutique();
}

async function changerStatutCommande(id, statut) {
  // Confirmation demandée uniquement pour l'annulation — la confirmation
  // cash est une étape normale du suivi, pas une action à risque.
  if (statut === 'annulee' && !confirm('Annuler cette commande ?')) return;
  try { await UL.updateCommandeStatut(id, statut); toast('Commande mise à jour ✅', 'success'); loadAdminBoutique(); }
  catch(e) { toast('Impossible de modifier le statut de la commande', 'error'); }
}

// Équivalent Sticks de changerStatutCommande — manquait jusqu'ici
// (asymétrie repérée le 07/07/2026 : le bouton "Annuler" existait côté
// Matos mais jamais côté Sticks).
async function changerStatutDistrib(id, statut) {
  if (statut === 'annulee' && !confirm('Annuler cette distribution ?')) return;
  try { await UL.updateDistribStatut(id, statut); toast('Distribution mise à jour ✅', 'success'); loadAdminBoutique(); }
  catch(e) { toast('Impossible de modifier le statut de la distribution', 'error'); }
}

async function doReceptionnerCommande(id) {
  try {
    await UL.receptionnerCommande(id);
    notifierReceptionCommande(id);
    toast('Commande marquée reçue — disponible au retrait ✅', 'success');
    loadAdminBoutique();
  } catch(e) { toast('Impossible de marquer cette commande reçue', 'error'); }
}

async function modifierStock(id, nom, stockActuel) {
  const nouveau = prompt(`Stock actuel: ${stockActuel}
Nouveau stock pour "${nom}" :`, stockActuel);
  if (nouveau === null) return; // Annulé par l'utilisateur — pas d'erreur à afficher
  if (isNaN(parseInt(nouveau))) return toast('Stock invalide — saisis un nombre', 'error');
  try {
    await UL.updateProduit(id, { stock: parseInt(nouveau) });
    toast('Stock mis à jour ✅', 'success');
    loadAdminBoutique();
  } catch(e) { toast(e.message || 'Une erreur est survenue', 'error'); }
}

async function doArchiverProduit(id) {
  if (!confirm('Archiver cet article ?')) return;
  try { await UL.archiverProduit(id); toast('Article archivé', 'success'); loadAdminBoutique(); }
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
  if (!sticks.length) { el.innerHTML = '<div class="empty-state"><div>🎟️</div>Aucun stick disponible</div>'; return; }
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">` +
  sticks.map(s => {
    const precommandeOuverte = precommandeEstOuverte(s);
    let statutBadge = '';
    if (s.mode === 'precommande') {
      if (precommandePasEncoreOuverte(s)) {
        statutBadge = `<span class="badge badge-orange" style="font-size:10px;margin-top:6px;display:inline-block;">Dès le ${new Date(s.precommande_debut).toLocaleDateString('fr-FR')}</span>`;
      } else if (!precommandeOuverte) {
        statutBadge = `<span class="badge badge-rouge" style="font-size:10px;margin-top:6px;display:inline-block;">Précommande terminée</span>`;
      }
    }
    const peutCommander = (s.stock > 0 || s.mode === 'precommande') && s.prix > 0 && precommandeOuverte;
    return `
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
      ${statutBadge}
      ${s.mode === 'precommande' && (s.precommande_debut || s.precommande_fin) ? `<div style="font-size:11px;color:var(--gris);margin-top:4px;">📅 Précommande${formatPlagePrecommande(s)}</div>` : ''}
      ${s.mode === 'precommande' && s.precommande_livraison_estimee ? `<div style="font-size:11px;color:var(--bleu-clair);margin-top:4px;">📅 Livraison estimée : ${new Date(s.precommande_livraison_estimee).toLocaleDateString('fr-FR', { day:'numeric', month:'long' })}</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:5px;margin-top:10px;">
        ${peutCommander ? `<button class="btn btn-sm btn-primary" style="width:100%;" onclick="ouvrirCommanderStick('${s.id}')">💳 HelloAsso</button>` : ''}
      </div>
    </div>`;
  }).join('') + `</div>`;
}

// ── Paiement HelloAsso (membre) ─────────────────────────────────
// Article actuellement ouvert dans modalCommanderStick — mêmes bornes
// (stock/quota) que _produitCommandeCourant pour Matos.
let _stickCommandeCourant = null;

async function ouvrirCommanderStick(stickId) {
  try {
    const s = await UL.getStickById(stickId);
    if (!s) return toast('Article introuvable', 'error');
    if (!precommandeEstOuverte(s)) return toast('Précommande terminée', 'error');
    _stickCommandeCourant = s;

    let quotaHtml = '';
    try {
      const quota = await UL.getMonQuotaStick(stickId);
      if (quota) quotaHtml = `<div class="info-box warning">⚠️ Quota: il te reste ${quota.restant} sur ${quota.quota}</div>`;
    } catch(e) {}

    document.getElementById('modalCommanderStickContent').innerHTML = `
      <h3 class="modal-title">${esc(s.nom)}</h3>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        ${s.visuel_url ? `<img src="${s.visuel_url}" style="width:70px;height:70px;object-fit:cover;border-radius:10px;">` : `<div style="font-size:42px;">🎟️</div>`}
        <div>
          <div style="font-size:24px;font-family:'Bebas Neue',sans-serif;color:var(--bleu-clair);">${s.prix}€</div>
          <div style="font-size:12px;color:var(--gris);">${s.mode==='precommande' ? 'Précommande' : 'Stock: ' + s.stock}${s.lot && s.lot > 1 ? ` · Lot de ${s.lot}` : ''}</div>
        </div>
      </div>
      ${quotaHtml}
      <div class="form-group">
        <label>Quantité</label>
        <div style="display:flex;align-items:center;gap:14px;">
          <button type="button" class="btn btn-sm btn-secondary" onclick="changerQuantiteStick(-1)">−</button>
          <span id="stickQuantiteAffichage" style="font-size:17px;font-weight:700;min-width:26px;text-align:center;">1</span>
          <button type="button" class="btn btn-sm btn-secondary" onclick="changerQuantiteStick(1)">+</button>
        </div>
        <input type="hidden" id="stickQuantite" value="1">
      </div>
      ${s.mode === 'precommande' ? `<div class="info-box" style="font-size:12px;">📋 Article en précommande — disponible au retrait une fois reçu par la cellule Sticks.</div>` : ''}
      <button class="btn btn-primary" onclick="doCommanderStickHelloAsso('${s.id}', this)">💳 Payer avec HelloAsso</button>
      <button class="btn btn-secondary" style="margin-top:8px;" onclick="closeModal('modalCommanderStick')">Annuler</button>
    `;
    showModal('modalCommanderStick');
  } catch(e) { toast('Erreur chargement article', 'error'); }
}

function changerQuantiteStick(delta) {
  const s = _stickCommandeCourant;
  if (!s) return;
  const input = document.getElementById('stickQuantite');
  const affichage = document.getElementById('stickQuantiteAffichage');
  let max = 99;
  if (s.mode !== 'precommande' && s.stock > 0) max = Math.min(max, s.stock);
  if (s.quota_par_membre) max = Math.min(max, s.quota_par_membre);
  const nouvelle = Math.max(1, Math.min(max, (parseInt(input.value) || 1) + delta));
  input.value = nouvelle;
  affichage.textContent = nouvelle;
}

async function doCommanderStickHelloAsso(stickId, btn) {
  const quantite = parseInt(document.getElementById('stickQuantite')?.value) || 1;
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    const { redirectUrl, distribId } = await UL.demanderStickHelloAsso(stickId, quantite);
    closeModal('modalCommanderStick');
    if (btn) { btn.disabled = false; btn.textContent = '💳 Payer avec HelloAsso'; }
    afficherAvertissementHelloAsso(redirectUrl, 'stick', distribId);
  } catch(e) {
    toast(e.message || 'Impossible de lancer le paiement', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '💳 Payer avec HelloAsso'; }
  }
}

// ── Valider un cash (Admin/Bureau/Cellule Sticks) ──────────────
let _allMembresCashStick = [];

// ═══════════════════════════════════════════════════════════════
// PAGE ADMIN BOUTIQUE (05/07/2026) — indépendante de la page membre
// ─────────────────────────────────────────────────────────────────
// Toutes les actions de gestion (Modifier, Stock, Photo, Archiver, Cash,
// Toutes les commandes, Historique distributions) vivent désormais
// exclusivement ici — la page Boutique du bottom nav (renderMatos/
// renderSticks ci-dessus) ne montre plus jamais ces boutons, quel que
// soit le rôle du membre. Auto-suffisante : recharge ses propres données
// (ne dépend pas d'un passage préalable par pageBoutique).
// ═══════════════════════════════════════════════════════════════

let allProduitsAdmin = [], allSticksAdmin = [];
let currentFiltreMatosAdmin = 'tous', currentFiltreSticksAdminSection = '';

function switchAdminBoutiqueTab(tab) {
  document.getElementById('sectionAdminMatos').style.display = tab === 'matos' ? 'block' : 'none';
  document.getElementById('sectionAdminSticks').style.display = tab === 'sticks' ? 'block' : 'none';
  document.getElementById('sectionAdminGestion').style.display = tab === 'gestion' ? 'block' : 'none';
  document.getElementById('tabAdminMatos').classList.toggle('active', tab === 'matos');
  document.getElementById('tabAdminSticks').classList.toggle('active', tab === 'sticks');
  document.getElementById('tabAdminGestion').classList.toggle('active', tab === 'gestion');
}

// ── Sous-onglets Articles / Commandes en cours (05/07/2026, demande Remi)
// À l'intérieur de chaque onglet Matos/Sticks de la page admin — sépare
// la gestion du catalogue (Articles) du suivi des commandes/distributions
// (Commandes en cours), pour ne pas tout mélanger dans un seul long scroll.
function switchAdminMatosSubTab(tab) {
  document.getElementById('subSectionMatosArticles').style.display = tab === 'articles' ? 'block' : 'none';
  document.getElementById('subSectionMatosCommandes').style.display = tab === 'commandes' ? 'block' : 'none';
  document.getElementById('subTabMatosArticles').classList.toggle('active', tab === 'articles');
  document.getElementById('subTabMatosCommandes').classList.toggle('active', tab === 'commandes');
}

function switchAdminSticksSubTab(tab) {
  document.getElementById('subSectionSticksArticles').style.display = tab === 'articles' ? 'block' : 'none';
  document.getElementById('subSectionSticksCommandes').style.display = tab === 'commandes' ? 'block' : 'none';
  document.getElementById('subTabSticksArticles').classList.toggle('active', tab === 'articles');
  document.getElementById('subTabSticksCommandes').classList.toggle('active', tab === 'commandes');
}

// Statuts considérés "en cours" = nécessitent encore une action ou une
// attention (paiement en attente/refusé, payé mais pas encore récupéré) —
// à l'inverse de 'distribue'/'annulee'/'rembourse', qui sont des états
// terminaux, du seul intérêt d'un historique.
const STATUTS_EN_COURS = ['en_attente', 'prepare', 'disponible', 'precommande_validee', 'refuse'];

let allCommandesAdmin = [], allDistribsAdmin = [];
let currentFiltreCommandesAdmin = 'en_cours', currentFiltreDistribsAdmin = 'en_cours';

function filtrerCommandesAdmin(mode) {
  document.querySelectorAll('#subSectionMatosCommandes .filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  currentFiltreCommandesAdmin = mode;
  const filtered = mode === 'en_cours'
    ? allCommandesAdmin.filter(c => STATUTS_EN_COURS.includes(c.statut))
    : allCommandesAdmin;
  renderToutesCommandes(filtered);
}

function filtrerDistribsAdmin(mode) {
  document.querySelectorAll('#subSectionSticksCommandes .filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  currentFiltreDistribsAdmin = mode;
  const filtered = mode === 'en_cours'
    ? allDistribsAdmin.filter(d => STATUTS_EN_COURS.includes(d.statut))
    : allDistribsAdmin;
  renderToutesDistribs(filtered);
}

async function loadAdminBoutique() {
  try {
    const [produits, sticks, sections] = await Promise.all([
      UL.getProduits(), UL.getSticks(), UL.getSections(),
    ]);
    allProduitsAdmin = produits;
    allSticksAdmin = sticks;
    renderMatosAdmin(allProduitsAdmin);
    renderSticksAdmin(allSticksAdmin);

    const sel = document.getElementById('filtreAdminSticksSection');
    if (sel) {
      const valeurActuelle = sel.value;
      sel.innerHTML = '<option value="">Toutes sections</option>' +
        sections.map(s => `<option value="${s.id}">${esc(s.nom)}</option>`).join('');
      sel.value = valeurActuelle;
    }

    allCommandesAdmin = await UL.getAllCommandes();
    filtrerCommandesAdminSansEvent(currentFiltreCommandesAdmin);
    allDistribsAdmin = await UL.getAllDistributions();
    filtrerDistribsAdminSansEvent(currentFiltreDistribsAdmin);

    // Badges de compteur sur les onglets "Commandes/Distributions en cours"
    // — repère visuel rapide (sans avoir à ouvrir l'onglet) du nombre
    // d'éléments nécessitant encore une action.
    const nbCommandesEnCours = allCommandesAdmin.filter(c => STATUTS_EN_COURS.includes(c.statut)).length;
    const badgeCmd = document.getElementById('badgeCommandesEnCours');
    if (badgeCmd) {
      badgeCmd.textContent = nbCommandesEnCours;
      badgeCmd.style.display = nbCommandesEnCours > 0 ? 'inline-block' : 'none';
    }
    const nbDistribsEnCours = allDistribsAdmin.filter(d => STATUTS_EN_COURS.includes(d.statut)).length;
    const badgeDist = document.getElementById('badgeDistribsEnCours');
    if (badgeDist) {
      badgeDist.textContent = nbDistribsEnCours;
      badgeDist.style.display = nbDistribsEnCours > 0 ? 'inline-block' : 'none';
    }

    renderGestionCommandes();
  } catch(e) { toast('Erreur chargement boutique (admin)', 'error'); }
}

// Variantes sans `event.target` (utilisées au chargement initial, où il
// n'y a pas de clic réel) — évitent une erreur si event est undefined à
// ce moment-là. Les boutons de filtre eux-mêmes continuent d'appeler
// filtrerCommandesAdmin/filtrerDistribsAdmin (avec la gestion active/inactive).
function filtrerCommandesAdminSansEvent(mode) {
  const filtered = mode === 'en_cours'
    ? allCommandesAdmin.filter(c => STATUTS_EN_COURS.includes(c.statut))
    : allCommandesAdmin;
  renderToutesCommandes(filtered);
}
function filtrerDistribsAdminSansEvent(mode) {
  const filtered = mode === 'en_cours'
    ? allDistribsAdmin.filter(d => STATUTS_EN_COURS.includes(d.statut))
    : allDistribsAdmin;
  renderToutesDistribs(filtered);
}

// ═══════════════════════════════════════════════════════════════
// GESTION DES COMMANDES (05/07/2026, demande Remi) — 3e onglet de
// pageAdminBoutique, réunit Matos ET Sticks (contrairement aux onglets
// "Commandes en cours" propres à chaque catalogue) — pensé pour préparer
// une session de distribution : qui a commandé quoi, en 2 vues (par
// membre pour composer les colis, par article pour savoir combien sortir
// du stock), avec export Telegram (texte à coller) et CSV (tableur).
// ═══════════════════════════════════════════════════════════════

let filtreTypeGestion = 'tous', filtreStatutGestion = 'en_cours', vueGestionCommandes = 'membre';

const STATUT_LABEL_GESTION = {
  en_attente: '⏳ Attente paiement', prepare: '📦 Préparé', disponible: '✅ Disponible', precommande_validee: '📋 Précommande validée',
  distribue: '✔️ Remis', refuse: '❌ Refusé', annulee: '❌ Annulée', rembourse: '↩️ Remboursé',
};

// Aplati les commandes Matos (potentiellement plusieurs commande_items par
// commande) et les distributions Sticks en une seule liste de lignes au
// même format — c'est ce qui permet de les traiter ensemble dans cet
// onglet. Réutilise allCommandesAdmin/allDistribsAdmin, déjà chargées par
// loadAdminBoutique — aucun appel réseau supplémentaire ici.
function construireCommandesUnifiees() {
  const rows = [];
  for (const c of allCommandesAdmin) {
    for (const item of c.commande_items || []) {
      rows.push({
        id: c.id,
        type: 'matos',
        mode: item.produit?.mode || 'stock',
        membre: c.membre,
        article: item.produit?.nom || '?',
        taille: item.taille || null,
        quantite: item.quantite,
        statut: c.statut,
        mode_paiement: c.mode_paiement,
        prix: (item.prix_unitaire || 0) * item.quantite,
        created_at: c.created_at,
      });
    }
  }
  for (const d of allDistribsAdmin) {
    rows.push({
      id: d.id,
      type: 'stick',
      mode: d.stick?.mode || 'stock',
      membre: d.membre,
      article: d.stick?.nom || '?',
      taille: null,
      quantite: d.quantite,
      lot: d.stick?.lot || 1,
      statut: d.statut,
      mode_paiement: d.mode_paiement,
      prix: d.stick?.prix ? d.stick.prix * d.quantite : null,
      created_at: d.created_at,
    });
  }
  return rows;
}

function getRowsGestionFiltrees() {
  let rows = construireCommandesUnifiees();
  if (filtreTypeGestion === 'matos' || filtreTypeGestion === 'stick') rows = rows.filter(r => r.type === filtreTypeGestion);
  else if (filtreTypeGestion === 'precommande') rows = rows.filter(r => r.mode === 'precommande');
  if (filtreStatutGestion === 'en_cours') rows = rows.filter(r => STATUTS_EN_COURS.includes(r.statut));
  return rows;
}

function grouperParMembre(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.membre?.pseudo_telegram || '—';
    if (!map.has(key)) map.set(key, { membre: r.membre, items: [] });
    map.get(key).items.push(r);
  }
  return [...map.values()].sort((a, b) => (a.membre?.pseudo_telegram || '').localeCompare(b.membre?.pseudo_telegram || ''));
}

function grouperParArticle(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = `${r.type}|${r.article}|${r.taille || ''}`;
    if (!map.has(key)) map.set(key, { type: r.type, article: r.article, taille: r.taille, mode: r.mode, quantite: 0, totalUnites: 0, membres: new Set() });
    const g = map.get(key);
    g.quantite += r.quantite;
    // totalUnites = nombre réel de stickers (lots × taille du lot) — pour
    // Matos, lot est toujours 1 (pas de notion de lot), donc totalUnites
    // === quantite dans ce cas, affiché nulle part de différent.
    g.totalUnites += r.quantite * (r.lot || 1);
    g.membres.add(r.membre?.pseudo_telegram || '—');
  }
  return [...map.values()].sort((a, b) => a.article.localeCompare(b.article));
}

function filtrerTypeGestion(type) {
  document.querySelectorAll('#gestionFiltreType .filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  filtreTypeGestion = type;
  renderGestionCommandes();
}

function filtrerStatutGestion(statut) {
  document.querySelectorAll('#gestionFiltreStatut .filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  filtreStatutGestion = statut;
  renderGestionCommandes();
}

function toggleVueGestion(vue) {
  document.querySelectorAll('#gestionVueToggle .filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  vueGestionCommandes = vue;
  renderGestionCommandes();
}

function renderGestionCommandes() {
  const el = document.getElementById('gestionCommandesListe');
  const recapEl = document.getElementById('gestionRecap');
  if (!el) return; // onglet pas encore dans le DOM au tout premier chargement
  const rows = getRowsGestionFiltrees();

  // Seules les commandes avec un paiement confirmé comptent dans les
  // précommandes — une ligne 'en_attente' (paiement abandonné ou en cours)
  // ne doit pas gonfler artificiellement le nombre de lots à préparer.
  const rowsPayees = rows.filter(r => r.statut !== 'en_attente');
  const nbPrecommandes = rowsPayees.filter(r => r.mode === 'precommande').length;
  const nbEnAttente = rows.length - rowsPayees.length;
  recapEl.textContent = `${rowsPayees.length} ligne${rowsPayees.length > 1 ? 's' : ''}` +
    (nbPrecommandes ? ` · dont ${nbPrecommandes} précommande${nbPrecommandes > 1 ? 's' : ''}` : '') +
    (nbEnAttente ? ` · ${nbEnAttente} en attente de paiement (non comptées)` : '');

  if (!rows.length) { el.innerHTML = '<div class="empty-state"><div>📋</div>Rien à préparer</div>'; return; }

  if (vueGestionCommandes === 'article') {
    const groupes = grouperParArticle(rows);
    el.innerHTML = groupes.map(g => `
      <div class="card" style="margin-bottom:8px;padding:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;">${g.type === 'matos' ? '🛍️' : '🎟️'} ${esc(g.article)}${g.taille ? ' (' + g.taille + ')' : ''}</div>
            <div style="font-size:12px;color:var(--gris);">${g.membres.size} membre${g.membres.size > 1 ? 's' : ''}${g.mode === 'precommande' ? ' · 📋 Précommande' : ''}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:20px;font-family:'Bebas Neue',sans-serif;color:var(--bleu-clair);">×${g.quantite} lot${g.quantite > 1 ? 's' : ''}</div>
            ${g.type === 'stick' && g.totalUnites !== g.quantite ? `<div style="font-size:12px;color:var(--gris);">${g.totalUnites} sticks</div>` : ''}
          </div>
        </div>
      </div>`).join('');
  } else {
    const groupes = grouperParMembre(rows);
    el.innerHTML = groupes.map(g => {
      const nom = g.membre ? `${esc(g.membre.prenom)} ${esc(g.membre.nom)} (@${esc(g.membre.pseudo_telegram)})` : 'Membre inconnu';
      return `
      <div class="card" style="margin-bottom:8px;padding:12px;">
        <div style="font-weight:700;margin-bottom:6px;">👤 ${nom}</div>
        ${g.items.map(it => `
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:3px 0;gap:6px;">
            <span>${it.type === 'matos' ? '🛍️' : '🎟️'} ${esc(it.article)}${it.taille ? ' (' + it.taille + ')' : ''}${it.mode === 'precommande' ? ' · 📋' : ''} ×${it.quantite} lot${it.quantite > 1 ? 's' : ''}${it.type === 'stick' && it.lot > 1 ? ` (${it.quantite * it.lot} sticks)` : ''}</span>
            <span style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
              ${it.statut === 'disponible' ? `<button class="btn btn-sm btn-secondary" style="font-size:10px;padding:3px 8px;" onclick="doMarquerPreparee('${it.type}','${it.id}')">✔️ Préparé</button>` : ''}
              <span class="badge ${it.statut === 'distribue' ? 'badge-vert' : it.statut === 'disponible' ? 'badge-vert' : it.statut === 'prepare' ? 'badge-bleu' : it.statut === 'precommande_validee' ? 'badge-bleu' : it.statut === 'refuse' || it.statut === 'annulee' ? 'badge-rouge' : 'badge-orange'}" style="font-size:10px;">${STATUT_LABEL_GESTION[it.statut] || it.statut}</span>
            </span>
          </div>`).join('')}
      </div>`;
    }).join('');
  }
}

// Statut intermédiaire "préparé" (07/07/2026) — dispatch Matos/Sticks
// vers la bonne fonction backend selon le type de la ligne.
async function doMarquerPreparee(type, id) {
  try {
    if (type === 'matos') await UL.marquerCommandePreparee(id);
    else await UL.marquerStickPrepare(id);
    toast('Marqué préparé ✅', 'success');
    loadAdminBoutique();
  } catch(e) { toast(e.message || 'Impossible de marquer cet article préparé', 'error'); }
}

// ── Export Telegram ──────────────────────────────────────────
// Copie un texte prêt à coller tel quel dans le groupe Telegram — le
// format suit la vue active (par membre ou récap par article), pour
// rester cohérent avec ce que l'admin est justement en train de regarder.
function exporterTelegramCommandes() {
  const rows = getRowsGestionFiltrees();
  if (!rows.length) return toast('Aucune commande à exporter', 'error');
  const dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  let texte = `📦 COMMANDES À PRÉPARER — ${dateStr}\n\n`;

  if (vueGestionCommandes === 'article') {
    for (const g of grouperParArticle(rows)) {
      const detailUnites = g.type === 'stick' && g.totalUnites !== g.quantite ? ` = ${g.totalUnites} sticks` : '';
      texte += `• ${g.type === 'matos' ? '🛍️' : '🎟️'} ${g.article}${g.taille ? ' (' + g.taille + ')' : ''}${g.mode === 'precommande' ? ' [PRÉCOMMANDE]' : ''} — ×${g.quantite} lot${g.quantite > 1 ? 's' : ''}${detailUnites} (${g.membres.size} membre${g.membres.size > 1 ? 's' : ''})\n`;
    }
  } else {
    for (const g of grouperParMembre(rows)) {
      const nom = g.membre ? `${g.membre.prenom} ${g.membre.nom} (@${g.membre.pseudo_telegram})` : 'Membre inconnu';
      texte += `👤 ${nom}\n`;
      for (const it of g.items) {
        const detailUnites = it.type === 'stick' && it.lot > 1 ? ` (${it.quantite * it.lot} sticks)` : '';
        texte += `   • ${it.type === 'matos' ? '🛍️' : '🎟️'} ${it.article}${it.taille ? ' (' + it.taille + ')' : ''}${it.mode === 'precommande' ? ' [PRÉCOMMANDE]' : ''} ×${it.quantite} lot${it.quantite > 1 ? 's' : ''}${detailUnites}\n`;
      }
      texte += `\n`;
    }
  }
  texte += `Total : ${rows.length} ligne${rows.length > 1 ? 's' : ''} de commande`;

  navigator.clipboard.writeText(texte)
    .then(() => toast('Liste copiée — colle-la dans Telegram ✅', 'success'))
    .catch(() => toast('Impossible de copier (clipboard non disponible)', 'error'));
}

// ── Export CSV ────────────────────────────────────────────────
// Toujours le détail complet ligne par ligne, indépendamment de la vue
// active à l'écran (un tableur fait mieux le tri/regroupement lui-même) —
// colonne Mode ('stock'/'precommande') incluse explicitement pour pouvoir
// filtrer/trier les précommandes facilement une fois dans Excel/Sheets.
function exporterCsvCommandes() {
  const rows = getRowsGestionFiltrees();
  if (!rows.length) return toast('Aucune commande à exporter', 'error');
  const header = ['Type', 'Mode', 'Prenom', 'Nom', 'Pseudo', 'Article', 'Taille', 'Quantite', 'Statut', 'ModePaiement', 'Prix', 'Date'];
  const lignes = rows.map(r => [
    r.type === 'matos' ? 'Matos' : 'Stick',
    r.mode === 'precommande' ? 'Précommande' : 'Stock',
    r.membre?.prenom || '',
    r.membre?.nom || '',
    r.membre?.pseudo_telegram || '',
    r.article,
    r.taille || '',
    r.quantite,
    STATUT_LABEL_GESTION[r.statut] || r.statut,
    r.mode_paiement || '',
    r.prix != null ? r.prix : '',
    new Date(r.created_at).toLocaleDateString('fr-FR'),
  ]);
  const csvEscape = v => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...lignes].map(l => l.map(csvEscape).join(';')).join('\n');
  // BOM UTF-8 en tête : sans lui, Excel (version FR notamment) affiche les
  // accents/emoji corrompus à l'ouverture d'un CSV UTF-8 sans BOM.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `commandes_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export CSV téléchargé ✅', 'success');
}

function filtrerMatosAdmin(cat) {
  document.querySelectorAll('#sectionAdminMatos .filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  currentFiltreMatosAdmin = cat;
  const filtered = cat === 'tous' ? allProduitsAdmin : allProduitsAdmin.filter(p => p.categorie === cat);
  renderMatosAdmin(filtered);
}

function filtrerSticksAdminSection(sectionId) {
  currentFiltreSticksAdminSection = sectionId;
  const filtered = sectionId ? allSticksAdmin.filter(s => s.section_id === sectionId) : allSticksAdmin;
  renderSticksAdmin(filtered);
}

function renderMatosAdmin(produits) {
  const el = document.getElementById('adminMatosCatalogue');
  if (!el) return;
  if (!produits.length) { el.innerHTML = '<div class="empty-state"><div>🛍️</div>Aucun article</div>'; return; }
  el.innerHTML = produits.map(p => {
    const icones = { textile:'👕', accessoire:'🎒' };
    // ⚠️ BUG CORRIGÉ (07/07/2026) : cette vue Admin affichait encore
    // "Épuisé" pour tout article à stock=0, y compris en précommande en
    // cours (stock=0 par défaut tant que rien n'est reçu) — le correctif
    // du même jour n'avait été appliqué qu'à la vue membre (renderMatos),
    // pas ici. Même logique reprise : badge de fenêtre de précommande à
    // la place du badge de stock quand mode === 'precommande'.
    const precommandeOuverte = precommandeEstOuverte(p);
    let stockBadge;
    if (p.mode === 'precommande') {
      if (precommandePasEncoreOuverte(p)) {
        stockBadge = `<span class="badge badge-orange" style="font-size:10px;">Précommande dès le ${new Date(p.precommande_debut).toLocaleDateString('fr-FR')}</span>`;
      } else if (!precommandeOuverte) {
        stockBadge = `<span class="badge badge-rouge" style="font-size:10px;">Précommande terminée</span>`;
      } else {
        stockBadge = `<span class="badge badge-bleu" style="font-size:10px;">Précommande en cours</span>`;
      }
    } else {
      stockBadge = p.stock <= 3 && p.stock > 0
        ? `<span class="badge badge-orange" style="font-size:10px;">Stock limité</span>`
        : p.stock === 0 ? `<span class="badge badge-rouge" style="font-size:10px;">Épuisé</span>` : '';
    }
    const sectionBadge = p.section
      ? `<span class="badge badge-bleu" style="font-size:10px;">Section ${esc(p.section.nom)}</span>` : '';
    const archiveBadge = p.statut === 'archive'
      ? `<span class="badge badge-rouge" style="font-size:10px;">Archivé</span>` : '';
    const brouillonBadge = p.visible_membres === false
      ? `<span class="badge badge-rouge" style="font-size:10px;">🔒 Brouillon</span>` : '';
    return `<div class="produit-card">
      <div class="produit-img">${p.photo_url ? `<img src="${p.photo_url}" alt="${esc(p.nom)}">` : icones[p.categorie] || '📦'}</div>
      <div class="produit-info">
        <div class="produit-nom">${esc(p.nom)}</div>
        <div class="produit-prix">${p.prix}€ · Stock: ${p.stock} · Lot de 1</div>
        <div class="produit-meta">
          ${labelTypeTailles(p.type_tailles) ? `• ${labelTypeTailles(p.type_tailles)}` : ''}
          ${p.quota_par_membre ? `• Quota: ${p.quota_par_membre} max` : ''}
          ${p.mode === 'precommande' ? `• Précommande${formatPlagePrecommande(p)}` : ''}
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${brouillonBadge}${stockBadge}${sectionBadge}${archiveBadge}</div>
        <div style="display:flex;gap:5px;margin-top:8px;flex-wrap:wrap;">
          ${p.mode !== 'precommande' ? `<button class="btn btn-sm btn-success" onclick="ouvrirCashMatos('${p.id}','${esc(p.nom)}','${p.type_tailles || 'aucune'}')">💵 Cash</button>` : ''}
          <button class="btn btn-sm btn-secondary" onclick="ouvrirModifierProduit('${p.id}')">✏️ Modifier</button>
          <button class="btn btn-sm btn-secondary" onclick="modifierStock('${p.id}','${esc(p.nom)}',${p.stock})">📦 Stock</button>
          <button class="btn btn-sm btn-secondary" onclick="uploadPhotoExistant('${p.id}','matos')">🖼️ Photo</button>
          <button class="btn btn-sm btn-danger" onclick="doArchiverProduit('${p.id}')">Archiver</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderSticksAdmin(sticks) {
  const el = document.getElementById('adminSticksCatalogue');
  if (!el) return;
  if (!sticks.length) { el.innerHTML = '<div class="empty-state"><div>🎟️</div>Aucun stick</div>'; return; }
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">` +
  sticks.map(s => `
    <div class="card" style="padding:10px;">
      <div style="width:100%;height:150px;border-radius:8px;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;margin-bottom:10px;">
        ${s.visuel_url ? `<img src="${s.visuel_url}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:48px;">🎟️</span>`}
      </div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:16px;">${esc(s.nom)}</div>
      <div style="font-size:12px;color:var(--gris);margin-top:2px;">
        ${s.prix ? `${s.prix}€ · ` : 'Gratuit · '}
        ${s.mode === 'precommande' ? 'Précommande' + formatPlagePrecommande(s) : 'Stock: ' + s.stock}
        ${s.lot && s.lot > 1 ? ` · Lot de ${s.lot}` : ''}
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">
        ${s.visible_membres === false ? `<span class="badge badge-rouge" style="font-size:10px;">🔒 Brouillon</span>` : ''}
        ${s.section ? `<span class="badge badge-bleu" style="font-size:10px;">Section ${esc(s.section.nom)}</span>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;margin-top:10px;">
        ${s.mode !== 'precommande' ? `<button class="btn btn-sm btn-success" onclick="ouvrirCashStick('${s.id}','${esc(s.nom)}')">💵 Cash</button>` : ''}
        <button class="btn btn-sm btn-secondary" onclick="ouvrirModifierStick('${s.id}')">✏️ Modifier</button>
        <button class="btn btn-sm btn-secondary" onclick="uploadPhotoExistant('${s.id}','stick')">🖼️ Photo</button>
      </div>
    </div>`).join('') + `</div>`;
}

// ── Cash Matos (nouveau, 05/07/2026 — même principe que Cash Stick) ──
let _allMembresCashMatos = [];

async function ouvrirCashMatos(produitId, nom, typeTailles) {
  document.getElementById('cashMatosId').value = produitId;
  document.getElementById('cashMatosTitre').textContent = `Valider un cash — ${nom}`;
  document.getElementById('cashMatosQte').value = '1';
  document.getElementById('cashMatosSearch').value = '';
  const tailles = taillesPourType(typeTailles);
  document.getElementById('cashMatosTailleGroup').style.display = tailles ? 'block' : 'none';
  if (tailles) document.getElementById('cashMatosTaille').innerHTML = optionsTaillesHtml(typeTailles);
  document.getElementById('cashMatosListeMembres').innerHTML = '<div class="empty-state"><div>⏳</div>Chargement…</div>';
  showModal('modalCashMatos');
  try {
    _allMembresCashMatos = await UL.getAllMembres();
    renderListeMembresCashMatos(_allMembresCashMatos);
  } catch(e) { toast('Erreur chargement membres', 'error'); }
}

function filtrerMembresCashMatos() {
  const recherche = document.getElementById('cashMatosSearch').value.trim().toLowerCase();
  if (!recherche) return renderListeMembresCashMatos(_allMembresCashMatos);
  const filtres = _allMembresCashMatos.filter(m => {
    const champs = [m.nom, m.prenom, m.pseudo_telegram].filter(Boolean).join(' ').toLowerCase();
    return champs.includes(recherche);
  });
  renderListeMembresCashMatos(filtres);
}

function renderListeMembresCashMatos(membres) {
  const el = document.getElementById('cashMatosListeMembres');
  if (!membres.length) { el.innerHTML = '<div class="empty-state"><div>👥</div>Aucun membre trouvé</div>'; return; }
  el.innerHTML = membres.map(m => `
    <div class="card" style="margin-bottom:6px;padding:10px;cursor:pointer;" onclick="doValiderCashMatos('${m.id}','${esc(m.prenom)} ${esc(m.nom)}')">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="avatar" style="width:30px;height:30px;font-size:12px;flex-shrink:0;">${((m.prenom||'?')[0]+(m.nom||'?')[0]).toUpperCase()}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;">${esc(m.prenom)} ${esc(m.nom)}</div>
          <div style="font-size:11px;color:var(--gris);">@${esc(m.pseudo_telegram)}</div>
        </div>
      </div>
    </div>`).join('');
}

async function doValiderCashMatos(membreId, nomMembre) {
  const produitId = document.getElementById('cashMatosId').value;
  const qte = parseInt(document.getElementById('cashMatosQte').value) || 1;
  const tailleGroupVisible = document.getElementById('cashMatosTailleGroup').style.display !== 'none';
  const taille = tailleGroupVisible ? document.getElementById('cashMatosTaille').value : null;
  if (!confirm(`Enregistrer le paiement cash de ${nomMembre} (x${qte}) ?`)) return;
  try {
    await UL.distribuerProduitAdmin(produitId, membreId, taille, qte);
    toast(`Paiement enregistré pour ${nomMembre} — à confirmer au retrait`, 'success');
    closeModal('modalCashMatos');
    loadAdminBoutique();
  } catch(e) { toast(e.message || 'Impossible d\'enregistrer le paiement', 'error'); }
}


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
  // Le paiement Cash étant encaissé sur-le-champ par l'admin, la ligne part
  // directement en 'disponible' (cf. distribuerStickAdmin,
  // supabase-client.js) — reste à confirmer la remise physique par scan QR
  // (cf. scan.js, contexte 'stick') ou par le bouton manuel de filet de
  // secours dans la liste "Historique distributions" (renderToutesDistribs).
  const stickId = document.getElementById('cashStickId').value;
  const qte = parseInt(document.getElementById('cashStickQte').value) || 1;
  if (!confirm(`Enregistrer le paiement cash de ${nomMembre} (x${qte}) ?`)) return;
  try {
    await UL.distribuerStickAdmin(stickId, membreId, qte, 'cash');
    toast(`Paiement enregistré pour ${nomMembre} — à confirmer au retrait`, 'success');
    closeModal('modalCashStick');
    loadAdminBoutique();
  } catch(e) { toast(e.message || 'Impossible d\'enregistrer le paiement', 'error'); }
}

function renderMesSticks(distribs) {
  const el = document.getElementById('mesSticks');
  if (!distribs.length) { el.innerHTML = '<p style="color:var(--gris);font-size:13px;">Aucun stick reçu</p>'; return; }
  const statuts = {
    en_attente:'⏳ En attente de paiement', precommande_validee:'📋 Précommande validée — en attente de réception',
    disponible:'✅ Disponible — à retirer', prepare:'✅ Disponible — à retirer', distribue:'✔️ Reçu', refuse:'❌ Paiement refusé', annulee:'❌ Annulée',
  };
  el.innerHTML = distribs.map(d => `
    <div class="card" style="margin-bottom:6px;padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:600;font-size:14px;">${esc(d.stick?.nom||'?')}</div>
          <div style="font-size:12px;color:var(--gris);">Qté: ${d.quantite} · ${new Date(d.created_at).toLocaleDateString('fr-FR')}</div>
        </div>
        <span class="badge ${d.statut==='distribue'||d.statut==='disponible'||d.statut==='prepare'?'badge-vert':d.statut==='precommande_validee'?'badge-bleu':d.statut==='refuse'||d.statut==='annulee'?'badge-rouge':'badge-orange'}">${statuts[d.statut]||d.statut}</span>
      </div>
      ${d.stick?.mode === 'precommande' && d.stick?.precommande_livraison_estimee ? `<div style="font-size:12px;color:var(--bleu-clair);margin-top:4px;">📅 Livraison estimée : ${new Date(d.stick.precommande_livraison_estimee).toLocaleDateString('fr-FR', { day:'numeric', month:'long' })}</div>` : ''}
      ${d.mode_paiement === 'helloasso' && (d.statut === 'refuse' || d.statut === 'en_attente') ? `
      <button class="btn btn-sm btn-primary" style="width:100%;margin-top:8px;" onclick="ouvrirCommanderStick('${d.stick_id}')">${d.statut === 'refuse' ? '🔄 Relancer le paiement' : '💳 Reprendre le paiement'}</button>` : ''}
      ${d.statut === 'en_attente' ? `
      <button class="btn btn-sm btn-danger" style="width:100%;margin-top:6px;" onclick="doAnnulerDistrib('${d.id}')">❌ Annuler</button>` : ''}
    </div>`).join('');
}

// Annulation stick par le membre lui-même (uniquement si en_attente).
async function doAnnulerDistrib(distribId) {
  if (!confirm('Annuler cette commande de stick ? Cette action est irréversible.')) return;
  try {
    await UL.updateDistribStatut(distribId, 'annulee');
    toast('Commande annulée', 'success');
    loadSticks();
  } catch(e) { toast(e.message || 'Impossible d\'annuler', 'error'); }
}

let distribsSelectionneesReception = new Set();

function renderToutesDistribs(distribs) {
  const el = document.getElementById('adminToutesDistribs');
  if (!distribs.length) { el.innerHTML = '<p style="color:var(--gris);font-size:13px;">Aucune distribution</p>'; distribsSelectionneesReception.clear(); return; }

  const idsPrecommandeValidee = distribs.filter(d => d.statut === 'precommande_validee').map(d => d.id);
  const idsPrecommandeValideeSet = new Set(idsPrecommandeValidee);
  [...distribsSelectionneesReception].forEach(id => { if (!idsPrecommandeValideeSet.has(id)) distribsSelectionneesReception.delete(id); });

  const barreSelection = idsPrecommandeValidee.length ? `
    <div class="card" style="margin-bottom:8px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;background:var(--surface-2);">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin:0;">
        <input type="checkbox" ${distribsSelectionneesReception.size === idsPrecommandeValidee.length ? 'checked' : ''}
          onclick='toggleToutesSelectionDistribs(${JSON.stringify(idsPrecommandeValidee)})'>
        Tout sélectionner (${idsPrecommandeValidee.length} précommande${idsPrecommandeValidee.length>1?'s':''} validée${idsPrecommandeValidee.length>1?'s':''})
      </label>
      ${distribsSelectionneesReception.size ? `<button class="btn btn-sm btn-primary" onclick="doReceptionnerStickEnMasse()">✅ Valider la réception (${distribsSelectionneesReception.size})</button>` : ''}
    </div>` : '';

  // Tri d'affichage (12/07/2026, demande Remi) — même principe que
  // renderToutesCommandes (Matos) ci-dessus.
  const distribsTriees = [...distribs].sort((a, b) => {
    const aEnCours = STATUTS_EN_COURS.includes(a.statut) ? 0 : 1;
    const bEnCours = STATUTS_EN_COURS.includes(b.statut) ? 0 : 1;
    return aEnCours - bEnCours;
  });

  el.innerHTML = barreSelection + distribsTriees.slice(0,30).map(d => `
    <div class="card" style="margin-bottom:6px;padding:12px;${d.statut==='en_attente'?'opacity:.65;border-left:3px solid #F59E0B;':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${d.statut === 'precommande_validee' ? `<input type="checkbox" ${distribsSelectionneesReception.has(d.id)?'checked':''} onclick="toggleSelectionDistrib('${d.id}')">` : ''}
          <div>
            <div style="font-weight:600;font-size:13px;">@${d.membre?.pseudo_telegram||'?'} — ${esc(d.stick?.nom||'?')}</div>
            <div style="font-size:11px;color:var(--gris);">Qté: ${d.quantite} · ${d.mode_paiement} · ${new Date(d.created_at).toLocaleDateString('fr-FR')}</div>
          </div>
        </div>
        <span class="badge ${d.statut==='distribue'||d.statut==='disponible'?'badge-vert':d.statut==='prepare'||d.statut==='precommande_validee'?'badge-bleu':'badge-orange'}">${d.statut}</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
        ${d.statut === 'precommande_validee' ? `<button class="btn btn-sm btn-primary" style="flex:1;" onclick="doReceptionnerStick('${d.id}')">📦 Marquer reçu</button>` : ''}
        ${d.statut === 'disponible' ? `<button class="btn btn-sm btn-secondary" style="flex:1;" onclick="doMarquerPreparee('stick','${d.id}')">✔️ Marquer préparé</button>` : ''}
        ${d.statut === 'disponible' || d.statut === 'prepare' ? `<button class="btn btn-sm btn-secondary" style="flex:1;" onclick="doConfirmerDistributionManuelle('${d.id}')">✔️ Confirmer (sans scan)</button>` : ''}
        ${['en_attente','precommande_validee'].includes(d.statut) ? `<button class="btn btn-sm btn-danger" onclick="changerStatutDistrib('${d.id}','annulee')">Annuler</button>` : ''}
      </div>
    </div>`).join('');
}

function toggleSelectionDistrib(id) {
  if (distribsSelectionneesReception.has(id)) distribsSelectionneesReception.delete(id);
  else distribsSelectionneesReception.add(id);
  filtrerDistribsAdminSansEvent(currentFiltreDistribsAdmin);
}

function toggleToutesSelectionDistribs(ids) {
  if (distribsSelectionneesReception.size === ids.length) distribsSelectionneesReception.clear();
  else ids.forEach(id => distribsSelectionneesReception.add(id));
  filtrerDistribsAdminSansEvent(currentFiltreDistribsAdmin);
}

function notifierReceptionStick(distribId) {
  const d = allDistribsAdmin.find(x => x.id === distribId);
  if (!d?.membre_id) return;
  const nomStick = d.stick?.nom || 'Ton stick';
  UL.envoyerNotificationPush(d.membre_id, '📦 Disponible !', `${nomStick} est prêt — viens le récupérer.`, '/ultras-lutetia/');
}

async function doReceptionnerStickEnMasse() {
  const ids = [...distribsSelectionneesReception];
  if (!ids.length) return;
  const confirme = confirm(
    `Tu es sur le point de marquer ${ids.length} stick${ids.length>1?'s':''} comme reçu${ids.length>1?'s':''} (disponible${ids.length>1?'s':''} au retrait).\n\n` +
    `As-tu bien vérifié que les quantités reçues correspondent à ce qui a été commandé pour chacun ?\n\n` +
    `Cette action ne peut pas être annulée en masse ensuite.`
  );
  if (!confirme) return;
  let ok = 0, echecs = 0;
  for (const id of ids) {
    try { await UL.receptionnerStick(id); notifierReceptionStick(id); ok++; }
    catch(e) { echecs++; }
  }
  distribsSelectionneesReception.clear();
  toast(echecs ? `${ok} validé(s), ${echecs} échec(s)` : `${ok} stick(s) marqué(s) reçu(s) ✅`, echecs ? 'error' : 'success');
  loadAdminBoutique();
}

async function doReceptionnerStick(distribId) {
  try {
    await UL.receptionnerStick(distribId);
    notifierReceptionStick(distribId);
    toast('Stick marqué reçu — disponible au retrait ✅', 'success');
    loadAdminBoutique();
  } catch(e) { toast('Impossible de marquer ce stick reçu', 'error'); }
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
    loadAdminBoutique();
  } catch(e) { toast(e.message || 'Impossible de confirmer la distribution', 'error'); }
}

// ── COTISATION (07/07/2026 : catalogue de cartages, plus lien statique) ─
async function loadCotisation() {
  try {
    const [catalogue, { paiements, aJour }] = await Promise.all([
      UL.getCartageCatalogue(),
      UL.getMesPaiementsCartage(),
    ]);
    const el = document.getElementById('cotisationStatut');

    if (aJour) {
      const dernierPaye = paiements.find(p => p.statut === 'paye');
      el.innerHTML = `
        <div class="cotisation-badge ok">
          <div style="font-size:48px;">✅</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:.05em;">Cartage à jour</div>
          ${dernierPaye ? `
          <div style="font-size:13px;color:var(--gris);">${esc(dernierPaye.cartage?.nom || 'Cartage')} · ${dernierPaye.montant}€</div>
          <div style="font-size:12px;color:var(--vert);">Payé le ${new Date(dernierPaye.paye_at).toLocaleDateString('fr-FR')}</div>` : ''}
        </div>`;
    } else if (!catalogue.length) {
      el.innerHTML = `
        <div class="cotisation-badge nok">
          <div style="font-size:48px;">⏳</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:.05em;">Cartage en attente</div>
          <div style="font-size:13px;color:var(--gris);margin-top:6px;">Aucun cartage disponible pour le moment — contacte un admin.</div>
        </div>`;
    } else {
      el.innerHTML = `
        <div class="cotisation-badge nok">
          <div style="font-size:48px;">⏳</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:.05em;">Cartage en attente</div>
        </div>
        ${catalogue.map(c => {
          const paiementEnCours = paiements.find(p => p.cartage_id === c.id && (p.statut === 'en_attente' || p.statut === 'refuse'));
          const label = paiementEnCours
            ? (paiementEnCours.statut === 'refuse' ? '🔄 Relancer le paiement' : '💳 Reprendre le paiement')
            : '💳 Payer via HelloAsso';
          return `
          <div class="card" style="margin-top:10px;padding:10px;">
            <div style="width:100%;height:150px;border-radius:8px;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;margin-bottom:10px;">
              ${c.image_url ? `<img src="${c.image_url}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:48px;">🗂️</span>`}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:16px;">${esc(c.nom)}</div>
              <div style="font-size:14px;">${c.prix}€</div>
            </div>
            ${c.description ? `<div style="font-size:12px;color:var(--gris);margin-top:4px;">${esc(c.description)}</div>` : ''}
            <button class="btn btn-primary" style="width:100%;margin-top:10px;" onclick="doPayerCartage('${c.id}',this)">${label}</button>
          </div>`;
        }).join('')}`;
    }

    const lienAdmin = document.getElementById('cotisationAdminLien');
    if (lienAdmin) lienAdmin.style.display = (isAdmin(UL.getCurrentMembre()) || isBureau(UL.getCurrentMembre())) ? 'block' : 'none';
  } catch(e) { toast('Erreur cotisations', 'error'); }
}

async function doPayerCartage(cartageId, btn) {
  const texteOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    const { redirectUrl, paiementId } = await UL.demanderCartageHelloAsso(cartageId);
    if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
    afficherAvertissementHelloAsso(redirectUrl, 'cartage', paiementId);
  } catch(e) {
    toast(e.message || 'Impossible de lancer le paiement', 'error');
    if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
  }
}

// ─── MATOS ────────────────────────────────────────────────────

function toggleSectionSelect() {
  const val = document.getElementById('pAcces').value;
  document.getElementById('sectionSelectGroup').style.display = val !== 'tous' ? 'block' : 'none';
}

// Affiche/masque la plage de dates de précommande selon le mode choisi —
// même principe que toggleSectionSelect (05/07/2026, demande Remi : plages
// de précommande optionnelles pour Matos/Sticks, auto-fermeture à la date
// de fin, cf. synthèse du 07/07/2026).
function toggleModePrecommandeMatos() {
  const val = document.getElementById('pMode').value;
  document.getElementById('pPrecommandeDatesGroup').style.display = val === 'precommande' ? 'block' : 'none';
}
function toggleModePrecommandeStick() {
  const val = document.getElementById('stMode').value;
  document.getElementById('stPrecommandeDatesGroup').style.display = val === 'precommande' ? 'block' : 'none';
}

// Convertit la valeur d'un <input type="datetime-local"> (heure locale du
// navigateur, sans timezone) en ISO string UTC pour la base, ou null si
// vide. Symétrique de isoVersDateLocal ci-dessous.
function dateLocalVersISO(id) {
  const v = document.getElementById(id).value;
  return v ? new Date(v).toISOString() : null;
}
// Convertit une valeur ISO (venant de la base) vers le format attendu par
// un <input type="datetime-local"> ("YYYY-MM-DDTHH:mm", heure locale) —
// nécessaire pour pré-remplir le champ en mode édition.
// Valeur d'un <input type="date"> simple (pas de conversion de fuseau
// nécessaire, contrairement à datetime-local) — null si vide.
function dateSimpleOuNull(id) {
  return document.getElementById(id).value || null;
}

function isoVersDateLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Détermine si un article/stick en mode 'precommande' est actuellement
// commandable, selon sa plage de dates optionnelle. Un article en mode
// 'stock' n'est jamais concerné (retourne toujours true — la logique de
// disponibilité pour le stock reste basée sur p.stock, gérée séparément).
// Les deux bornes sont optionnelles et indépendantes (on peut n'avoir
// qu'une fin, qu'un début, les deux, ou aucun des deux).
function precommandeEstOuverte(item) {
  if (item.mode !== 'precommande') return true;
  const maintenant = new Date();
  if (item.precommande_debut && maintenant < new Date(item.precommande_debut)) return false;
  if (item.precommande_fin && maintenant > new Date(item.precommande_fin)) return false;
  return true;
}
// true si la précommande n'a pas encore commencé (date de début future) —
// distingue ce cas de "terminée" pour afficher le bon badge.
function precommandePasEncoreOuverte(item) {
  return item.mode === 'precommande' && item.precommande_debut && new Date() < new Date(item.precommande_debut);
}

// Petit texte " (du .. au ..)" pour les vues admin — vide si aucune des
// deux dates n'est renseignée.
function formatPlagePrecommande(item) {
  if (!item.precommande_debut && !item.precommande_fin) return '';
  const fmt = iso => new Date(iso).toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
  const debut = item.precommande_debut ? fmt(item.precommande_debut) : null;
  const fin = item.precommande_fin ? fmt(item.precommande_fin) : null;
  if (debut && fin) return ` (du ${debut} au ${fin})`;
  if (fin) return ` (jusqu'au ${fin})`;
  return ` (dès le ${debut})`;
}

// ── Types de tailles (07/07/2026, demande Remi) ─────────────────
// Remplace l'ancienne case à cocher "avec tailles" (oui/non) par un choix
// entre 3 types, chacun avec sa propre échelle de tailles usuelles.
// 'aucune' = pas de sélection de taille (article taille unique).
// Le champ produits.avec_tailles (booléen) est conservé en base et tenu
// à jour en parallèle (avec_tailles = type_tailles !== 'aucune') pour ne
// pas casser d'éventuel autre code qui le lirait encore (ex: testable.js).
const TAILLES_PAR_TYPE = {
  standard: ['XS','S','M','L','XL','XXL'],
  pantalon: ['38','40','42','44','46','48','50','52'],
};
function taillesPourType(type) {
  return TAILLES_PAR_TYPE[type] || null;
}
// Génère les <option> pour un <select> de taille, avec une sélection par
// défaut au milieu de l'échelle (comportement identique à l'ancien select
// figé qui présélectionnait 'M').
function optionsTaillesHtml(type, valeurActuelle) {
  const tailles = taillesPourType(type);
  if (!tailles) return '';
  const defaut = valeurActuelle || tailles[Math.floor((tailles.length - 1) / 2)];
  return tailles.map(t => `<option value="${t}" ${t === defaut ? 'selected' : ''}>${t}</option>`).join('');
}
function labelTypeTailles(type) {
  return type === 'pantalon' ? 'Tailles pantalon' : type === 'standard' ? 'Tailles S-XXL' : '';
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
  } else if (type === 'cartage') {
    reader.onload = e => {
      const imgEl = document.getElementById('photoPreviewImgCartage');
      const wrapEl = document.getElementById('photoPreviewCartage');
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
      loadAdminBoutique();
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
  const sectionId = acces !== 'tous' ? document.getElementById('pSection').value : null;

  if (!nom) return toast('Nom requis', 'error');
  if (!prix || isNaN(prix)) return toast('Prix requis', 'error');
  if (acces !== 'tous' && !sectionId) return toast('Sélectionne une section', 'error');

  const notifier = document.getElementById('pNotifier')?.checked;

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
      type_tailles: document.getElementById('pTypeTailles').value,
      avec_tailles: document.getElementById('pTypeTailles').value !== 'aucune',
      niveau_acces: acces,
      section_id: sectionId,
      mode: document.getElementById('pMode').value,
      precommande_debut: dateLocalVersISO('pPrecommandeDebut'),
      precommande_fin: dateLocalVersISO('pPrecommandeFin'),
      precommande_livraison_estimee: dateSimpleOuNull('pLivraisonEstimee'),
      statut: 'disponible',
      photo_url: photoUrl,
      // Brouillon (10/07/2026) : caché des membres tant que non coché —
      // utile pour tester un vrai paiement HelloAsso avant publication.
      visible_membres: !document.getElementById('pBrouillon').checked,
    });

    hideLoading();
    const sectionNom = acces !== 'tous'
      ? document.getElementById('pSection').options[document.getElementById('pSection').selectedIndex].text
      : null;
    const estBrouillon = document.getElementById('pBrouillon').checked;

    toast(estBrouillon ? 'Article créé en brouillon 🔒 ✅' : `Article créé ✅ ${sectionNom ? '— Section ' + sectionNom : '— Généraliste'}`, 'success');
    closeModal('modalCreerProduit');
    reinitialiserFormulaireProduit();
    ['pNom','pDesc','pPrix','pStock','pQuota','pPrecommandeDebut','pPrecommandeFin','pLivraisonEstimee'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('pPhoto').value = '';
    document.getElementById('photoPreviewMatos').style.display = 'none';
    document.getElementById('pMode').value = 'stock';
    document.getElementById('pPrecommandeDatesGroup').style.display = 'none';
    // Notification réservée à ceux qui ont le droit de voir cet article —
    // cible:'matos' reproduit côté serveur la même règle que getProduits
    // (supabase-client.js) : 'tous' = tout le monde, 'section' = Confirmés
    // partout + Draft de la section visée uniquement.
    if (notifier && !estBrouillon) {
      UL.envoyerNotificationPushGroupe({
        cible: 'matos',
        niveauAcces: acces,
        sectionId,
        titre: '🛍️ Nouvel article boutique',
        corps: nom,
        url: '/ultras-lutetia/',
      });
    }
    document.getElementById('pAcces').value = 'tous';
    document.getElementById('pTypeTailles').value = 'aucune';
    document.getElementById('sectionSelectGroup').style.display = 'none';
    document.getElementById('pBrouillon').checked = false;
    loadAdminBoutique();
  } catch(e) {
    hideLoading();
    toast(e.message || 'Erreur création article', 'error');
  }
}

// Ouvre le modal modalCreerProduit en mode édition, pré-rempli avec les
// valeurs actuelles — réutilise allProduitsAdmin (chargée par
// loadAdminBoutique, la page Admin dédiée) plutôt que de resolliciter le
// réseau. Même principe de swap dynamique (titre + bouton submit) que
// pour les matchs (cf. ouvrirModifierMatch dans admin.js), pour rester
// cohérent avec ce pattern déjà en place dans le projet plutôt que de
// dupliquer un second modal complet.
// ⚠️ Bug corrigé le 07/07/2026 : cette fonction lisait par erreur
// allProduits (la liste de la page membre Boutique, jamais chargée si on
// n'a pas visité cet onglet dans la session) au lieu de allProduitsAdmin
// (la liste de la page Admin d'où ce bouton est réellement appelé depuis
// la restructuration du 05/07/2026) — symptôme : "Article introuvable" à
// chaque clic sur Modifier, sauf si l'onglet Boutique membre avait été
// ouvert avant dans la même session.
async function ouvrirModifierProduit(produitId) {
  const p = allProduitsAdmin.find(pr => pr.id === produitId);
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
  document.getElementById('pTypeTailles').value = p.type_tailles || (p.avec_tailles ? 'standard' : 'aucune');
  document.getElementById('pAcces').value = p.niveau_acces || 'tous';
  document.getElementById('pMode').value = p.mode || 'stock';
  document.getElementById('pPrecommandeDebut').value = isoVersDateLocal(p.precommande_debut);
  document.getElementById('pPrecommandeFin').value = isoVersDateLocal(p.precommande_fin);
  document.getElementById('pLivraisonEstimee').value = p.precommande_livraison_estimee ? String(p.precommande_livraison_estimee).substring(0,10) : '';
  toggleModePrecommandeMatos();
  document.getElementById('pPhoto').value = '';
  if (p.photo_url) {
    document.getElementById('photoPreviewImgMatos').src = p.photo_url;
    document.getElementById('photoPreviewMatos').style.display = 'block';
  } else {
    document.getElementById('photoPreviewMatos').style.display = 'none';
  }
  toggleSectionSelect();
  if (p.section_id) document.getElementById('pSection').value = p.section_id;
  document.getElementById('pBrouillon').checked = p.visible_membres === false;

  const btn = document.getElementById('modalProduitSubmitBtn');
  btn.textContent = '💾 Enregistrer';
  btn.setAttribute('onclick', 'doModifierProduit()');
  document.getElementById('pNotifierGroup').style.display = 'none';

  showModal('modalCreerProduit');
}

async function doModifierProduit() {
  const id = document.getElementById('pId').value;
  const nom = document.getElementById('pNom').value.trim();
  const prix = parseFloat(document.getElementById('pPrix').value);
  const acces = document.getElementById('pAcces').value;
  const sectionId = acces !== 'tous' ? document.getElementById('pSection').value : null;

  if (!nom) return toast('Nom requis', 'error');
  if (!prix || isNaN(prix)) return toast('Prix requis', 'error');
  if (acces !== 'tous' && !sectionId) return toast('Sélectionne une section', 'error');

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
      type_tailles: document.getElementById('pTypeTailles').value,
      avec_tailles: document.getElementById('pTypeTailles').value !== 'aucune',
      niveau_acces: acces,
      section_id: sectionId,
      mode: document.getElementById('pMode').value,
      precommande_debut: dateLocalVersISO('pPrecommandeDebut'),
      precommande_fin: dateLocalVersISO('pPrecommandeFin'),
      precommande_livraison_estimee: dateSimpleOuNull('pLivraisonEstimee'),
      visible_membres: !document.getElementById('pBrouillon').checked,
    };
    if (photoFile) {
      updates.photo_url = await UL.uploadPhotoMatos(photoFile, nom);
    }

    await UL.updateProduit(id, updates);

    hideLoading();
    toast('Article modifié ✅', 'success');
    closeModal('modalCreerProduit');
    reinitialiserFormulaireProduit();
    loadAdminBoutique();
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
  document.getElementById('pNotifierGroup').style.display = '';
  document.getElementById('pNotifier').checked = true;
  document.getElementById('pBrouillon').checked = false;
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

  if (!nom) return toast('Nom requis', 'error');
  if (niveauAcces !== 'tous' && !sectionId) return toast('Sélectionne une section', 'error');

  const notifier = document.getElementById('stNotifier')?.checked;

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
      precommande_debut: dateLocalVersISO('stPrecommandeDebut'),
      precommande_fin: dateLocalVersISO('stPrecommandeFin'),
      precommande_livraison_estimee: dateSimpleOuNull('stLivraisonEstimee'),
      statut: 'disponible',
      visuel_url: visuelUrl,
      // Brouillon (10/07/2026) — même principe que Matos.
      visible_membres: !document.getElementById('stBrouillon').checked,
    });

    hideLoading();
    const sectionNom = niveauAcces !== 'tous'
      ? document.getElementById('stSection').options[document.getElementById('stSection').selectedIndex].text
      : null;
    const estBrouillon = document.getElementById('stBrouillon').checked;

    toast(estBrouillon ? 'Stick créé en brouillon 🔒 ✅' : `Stick créé ✅ ${sectionNom ? '— Section ' + sectionNom : '— Tous les membres'}`, 'success');
    closeModal('modalCreerStick');
    reinitialiserFormulaireStick();
    ['stNom','stPrix','stLot','stQuota','stStock','stPrecommandeDebut','stPrecommandeFin','stLivraisonEstimee'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('stLot').value = '1';
    document.getElementById('stMode').value = 'stock';
    document.getElementById('stPrecommandeDatesGroup').style.display = 'none';
    document.getElementById('stPhoto').value = '';
    document.getElementById('photoPreviewStick').style.display = 'none';
    document.getElementById('stCat').value = 'tous';
    loadAdminBoutique();
    // Notification réservée à ceux qui ont le droit de voir ce stick —
    // cible:'sticks' reproduit côté serveur la même règle que getSticks
    // (supabase-client.js) : 'tous' = tout le monde, 'draft_confirme'/
    // 'confirme' = restreint à la section choisie + statut minimum requis.
    if (notifier && !estBrouillon) {
      UL.envoyerNotificationPushGroupe({
        cible: 'sticks',
        niveauAcces,
        sectionId,
        titre: '🎟️ Nouveau stick',
        corps: nom,
        url: '/ultras-lutetia/',
      });
    }
  } catch(e) {
    hideLoading();
    toast(e.message || 'Erreur création stick', 'error');
  }
}

// Ouvre modalCreerStick en mode édition, pré-rempli — réutilise
// allSticksAdmin (chargée par loadAdminBoutique, la page Admin dédiée)
// plutôt que de resolliciter le réseau. Même principe de swap dynamique
// (titre + bouton submit) que pour les produits Matos et les matchs, pour
// rester cohérent avec ce pattern. ⚠️ Même bug corrigé que pour Matos ci-
// dessus (07/07/2026) : lisait par erreur allSticks (page membre) au lieu
// de allSticksAdmin (page Admin, d'où ce bouton est réellement appelé).
async function ouvrirModifierStick(stickId) {
  const s = allSticksAdmin.find(st => st.id === stickId);
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
  document.getElementById('stPrecommandeDebut').value = isoVersDateLocal(s.precommande_debut);
  document.getElementById('stPrecommandeFin').value = isoVersDateLocal(s.precommande_fin);
  document.getElementById('stLivraisonEstimee').value = s.precommande_livraison_estimee ? String(s.precommande_livraison_estimee).substring(0,10) : '';
  toggleModePrecommandeStick();
  document.getElementById('stPhoto').value = '';
  if (s.visuel_url) {
    document.getElementById('photoPreviewImgStick').src = s.visuel_url;
    document.getElementById('photoPreviewStick').style.display = 'block';
  } else {
    document.getElementById('photoPreviewStick').style.display = 'none';
  }
  if (s.section_id) document.getElementById('stSection').value = s.section_id;
  document.getElementById('stBrouillon').checked = s.visible_membres === false;

  const btn = document.getElementById('modalStickSubmitBtn');
  btn.textContent = '💾 Enregistrer';
  btn.setAttribute('onclick', 'doModifierStick()');
  document.getElementById('stNotifierGroup').style.display = 'none';

  showModal('modalCreerStick');
}

async function doModifierStick() {
  const id = document.getElementById('stId').value;
  const nom = document.getElementById('stNom').value.trim();
  const prixRaw = document.getElementById('stPrix').value;
  const prix = prixRaw ? parseFloat(prixRaw) : null;
  const niveauAcces = document.getElementById('stCat').value;
  const sectionId = document.getElementById('stSection').value || null;

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
      precommande_debut: dateLocalVersISO('stPrecommandeDebut'),
      precommande_fin: dateLocalVersISO('stPrecommandeFin'),
      precommande_livraison_estimee: dateSimpleOuNull('stLivraisonEstimee'),
      visible_membres: !document.getElementById('stBrouillon').checked,
    };
    if (photoFile) {
      updates.visuel_url = await UL.uploadPhotoStick(photoFile, nom);
    }

    await UL.updateStick(id, updates);

    hideLoading();
    toast('Stick modifié ✅', 'success');
    closeModal('modalCreerStick');
    reinitialiserFormulaireStick();
    loadAdminBoutique();
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
  document.getElementById('stNotifierGroup').style.display = '';
  document.getElementById('stNotifier').checked = true;
  document.getElementById('stBrouillon').checked = false;
}