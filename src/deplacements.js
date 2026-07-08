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

// Calcule le statut de paiement du membre courant pour un déplacement, à
// partir de son inscription (ou son absence). Centralisé ici pour être
// utilisé à la fois par la carte de liste (renderDeplCard) et la modal de
// détail (openDepl) — éviter que les deux affichages divergent un jour.
// ⚠️ Avec l'ajout du statut 'refuse' (paiement HelloAsso refusé), on ne
// peut plus se contenter de "!== 'en_attente'" pour détecter un paiement
// confirmé — un paiement refusé n'est pas 'en_attente' mais n'est pas
// payé non plus. On distingue explicitement les 3 cas.
function calculerStatutPaiementDepl(monInscrit) {
  const estInscrit = !!monInscrit;
  const estPaye = !!monInscrit && (monInscrit.statut_paiement === 'paye_cash' || monInscrit.statut_paiement === 'paye_ha');
  const estRefuse = !!monInscrit && monInscrit.statut_paiement === 'refuse';
  return { estInscrit, estPaye, estRefuse };
}

// Le champ date_limite_inscription existait déjà en base et était affiché
// en simple texte informatif ("⏳ Limite: ..."), sans jamais bloquer
// réellement une nouvelle inscription une fois la date passée (05/07/2026,
// même chantier que les plages de précommande Matos/Sticks — demande
// Remi : auto-fermeture à la date). Optionnel : un déplacement sans date
// limite reste ouvert sans limite, comportement inchangé.
function inscriptionsDeplFermees(d) {
  return !!d.date_limite_inscription && new Date() > new Date(d.date_limite_inscription);
}

function renderDeplCard(d) {
  const m = UL.getCurrentMembre();
  const date = d.date_match ? new Date(d.date_match).toLocaleDateString('fr-FR', {weekday:'short', day:'numeric', month:'short'}) : '';
  const pct = d.places_max ? Math.min(100, Math.round(((d._inscrits||0)/d.places_max)*100)) : 0;
  const { estInscrit, estPaye, estRefuse } = calculerStatutPaiementDepl(d.monInscrit);
  const estPresent = !!d.monInscrit?.present_at;

  // Bouton d'action directement visible sur la carte, sans devoir l'ouvrir —
  // reflète le même statut que la modal de détail (cf. openDepl). Le
  // stopPropagation empêche le clic sur le bouton de déclencher en plus
  // l'ouverture de la modal (la carte entière reste cliquable pour le détail).
  let boutonAction;
  if (!estInscrit) {
    boutonAction = inscriptionsDeplFermees(d)
      ? `<span class="badge badge-gris">⏳ Inscriptions terminées</span>`
      : `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();doInscritDepl('${d.id}',this)">M'inscrire</button>`;
  } else if (estRefuse) {
    boutonAction = `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();doInscritDepl('${d.id}',this)">❌ Réessayer le paiement</button>`;
  } else if (!estPaye) {
    boutonAction = `<span class="badge badge-orange">⏳ Paiement en cours</span>`;
  } else {
    // Badge présence affiché uniquement une fois le paiement confirmé — un
    // membre non payé ne peut de toute façon pas avoir été scanné présent
    // (confirmerPresenceDeplacement bloque le scan sans paiement, sauf
    // force=true côté admin, cf. supabase-client.js).
    boutonAction = `<span class="badge badge-vert">✅ Payé</span> <span class="badge ${estPresent?'badge-vert':'badge-orange'}">${estPresent?'✅ Présent':'⏳ Pas encore présent'}</span>`;
  }

  // Barre de places + boutons admin bus
  const adminBar = hasCelluleDepl(m) ? `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
      <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();voirInscritsDepl('${d.id}')">👥 Inscrits</button>
      <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();copierListeBus('${d.id}')">📋 Liste bus</button>
      <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();ouvrirModifierDepl('${d.id}')">✏️ Modifier</button>
    </div>` : '';

  return `<div class="depl-card" onclick="openDepl('${d.id}')">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
      <div style="flex:1;min-width:0;">
        <div class="depl-match">${esc(d.adversaire || d.match?.equipe_domicile || '?')} — Paris FC</div>
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
    <div style="margin-top:10px;">${boutonAction}</div>
    ${adminBar}
  </div>`;
}

async function openDepl(deplId) {
  currentDeplId = deplId;
  const m = UL.getCurrentMembre();
  try {
    const { deplacement: d, inscrits, monInscrit, nbInscrits } = await UL.getDeplacement(deplId);
    const { estInscrit, estPaye, estRefuse } = calculerStatutPaiementDepl(monInscrit);
    const date = d.date_match ? new Date(d.date_match).toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'}) : '';
    let html = `
      <h3 class="modal-title">${esc(d.adversaire||d.match?.equipe_domicile||'?')} — Paris FC</h3>
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
      html += inscriptionsDeplFermees(d)
        ? `<div class="info-box">⏳ Les inscriptions sont terminées pour ce déplacement.</div>`
        : `<button class="btn btn-primary" onclick="doInscritDepl('${d.id}',this)">M'inscrire</button>`;
    } else if (estRefuse) {
      html += `<div class="info-box error">❌ Paiement refusé</div>
        <button class="btn btn-primary" onclick="doInscritDepl('${d.id}',this)">Réessayer le paiement</button>`;
    } else if (!estPaye) {
      html += `<div class="info-box">⏳ Inscrit — paiement en cours</div>
        <p style="text-align:center;font-size:12px;color:var(--gris);margin-top:8px;">Si le paiement n'a pas démarré ou a été abandonné, tu peux réessayer.</p>
        <button class="btn btn-secondary" onclick="doInscritDepl('${d.id}',this)">Relancer le paiement</button>`;
    } else {
      html += `<div class="info-box success">✅ Paiement confirmé — ton billet est prêt</div>
        <div class="qr-container" id="qrDepl"></div>
        <p style="text-align:center;font-size:12px;color:var(--gris);">Code: ${monInscrit.qr_code||''}</p>
        ${d.lien_telegram ? `<a href="${esc(d.lien_telegram)}" target="_blank"><button class="btn btn-secondary" style="margin-top:10px;">💬 Groupe Telegram du déplacement</button></a>` : ''}`;
    }

    // Boutons admin déplacement
    if (hasCelluleDepl(m)) {
      const payes = inscrits.filter(i => i.statut_paiement === 'paye_cash' || i.statut_paiement === 'paye_ha');
      const refuses = inscrits.filter(i => i.statut_paiement === 'refuse');
      html += `
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);">
          <div class="card-label">Gestion déplacement</div>
          <div style="font-size:13px;color:var(--gris);margin-bottom:10px;">✅ ${payes.length} payés · ⏳ ${inscrits.length-payes.length-refuses.length} en attente${refuses.length ? ' · ❌ '+refuses.length+' refusés' : ''}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-sm btn-secondary" onclick="voirInscritsDepl('${d.id}')">👥 Voir inscrits</button>
            <button class="btn btn-sm btn-secondary" onclick="copierListeBus('${d.id}')">📋 Liste bus</button>
            <button class="btn btn-sm btn-secondary" onclick="ouvrirModifierDepl('${d.id}')">✏️ Modifier</button>
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

// Fusionne "s'inscrire" et "déclencher le paiement HelloAsso" en une seule
// action : Déplacements n'a aujourd'hui aucun mode cash actif, HelloAsso
// est donc le seul chemin — pas besoin de proposer un choix de mode de
// paiement à l'utilisateur ici.
// btn (optionnel) : le bouton cliqué, désactivé pendant l'appel réseau pour
// empêcher un double-tap de déclencher deux fois la création du checkout
// HelloAsso (cf. point d'audit ergonomique — seul flux de paiement réel de
// l'app, donc le plus sensible à un double déclenchement).
async function doInscritDepl(id, btn) {
  const texteOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    const { data, error } = await UL.sb.functions.invoke('helloasso-create-checkout', {
      body: { deplacementId: id },
    });
    if (error) throw new Error(error.message || 'Impossible de lancer le paiement');
    if (data?.error) throw new Error(data.error);
    if (!data?.redirectUrl) throw new Error('Réponse de paiement invalide');
    closeModal('modalDepl');
    if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
    afficherAvertissementHelloAsso(data.redirectUrl);
    // Bouton réactivé avant l'avertissement (pas systématiquement dans une
    // modale qui se ferme — cf. bouton "M'inscrire" directement sur la
    // carte déplacement) — voir doPayerCartage (boutique.js) même logique.
  } catch(e) {
    toast(e.message || 'Impossible de s\'inscrire au déplacement', 'error');
    if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
  }
}

// Inscrits du déplacement actuellement affiché dans modalAdminSession,
// conservés pour permettre de changer de filtre (Tous/Présents/Absents)
// sans resolliciter le réseau à chaque clic.
let _inscritsDeplCourant = [];
let _deplCourantPourListe = null;
let _filtreInscritsDepl = 'tous';

async function voirInscritsDepl(deplId) {
  try {
    const { inscrits, deplacement: d } = await UL.getDeplacement(deplId);
    _inscritsDeplCourant = inscrits;
    _deplCourantPourListe = { id: deplId, adversaire: d.adversaire };
    _filtreInscritsDepl = 'tous';
    renderListeInscritsDepl();
    showModal('modalAdminSession');
  } catch(e) { toast('Impossible de charger les inscrits du déplacement', 'error'); }
}

function filtrerInscritsDepl(filtre) {
  _filtreInscritsDepl = filtre;
  renderListeInscritsDepl();
}

function renderListeInscritsDepl() {
  const d = _deplCourantPourListe;
  if (!d) return;

  // Filtre appliqué uniquement sur les inscriptions payées — un membre non
  // payé n'a de toute façon jamais pu être scanné présent (cf. note dans
  // renderDeplCard), donc le filtre "Présents"/"Absents" n'a de sens que
  // parmi les payés ; "Tous" continue d'afficher tout le monde, paiement
  // en attente compris, pour ne pas perdre la visibilité d'ensemble.
  let liste = _inscritsDeplCourant;
  if (_filtreInscritsDepl === 'presents') liste = liste.filter(i => !!i.present_at);
  if (_filtreInscritsDepl === 'absents') {
    const estPaye = i => i.statut_paiement === 'paye_cash' || i.statut_paiement === 'paye_ha';
    liste = liste.filter(i => estPaye(i) && !i.present_at);
  }

  const filtreBtn = (val, label) => `<button class="btn btn-sm ${_filtreInscritsDepl===val?'btn-primary':'btn-secondary'}" onclick="filtrerInscritsDepl('${val}')">${label}</button>`;

  document.getElementById('modalAdminSessionContent').innerHTML = `
    <h3 class="modal-title">Inscrits — ${esc(d.adversaire)}</h3>
    <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
      ${filtreBtn('tous', 'Tous')}
      ${filtreBtn('presents', '✅ Présents')}
      ${filtreBtn('absents', '⏳ Absents')}
    </div>
    ${!liste.length ? '<p style="color:var(--gris);font-size:13px;">Aucun inscrit pour ce filtre</p>' : liste.map(i => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <div style="flex:1;">
          <div style="font-weight:600;">@${i.membre?.pseudo_telegram||'?'}</div>
          <div style="color:var(--gris);">${i.membre?.prenom||''} ${i.membre?.nom||''}</div>
        </div>
        <span class="badge ${i.statut_paiement==='en_attente'?'badge-orange':i.statut_paiement.includes('paye')?'badge-vert':'badge-gris'}">
          ${i.statut_paiement==='en_attente'?'⏳':i.statut_paiement==='paye_cash'?'Cash ✅':'HA ✅'}
        </span>
        ${(i.statut_paiement==='paye_cash'||i.statut_paiement==='paye_ha') ? `
          <span class="badge ${i.present_at?'badge-vert':'badge-orange'}">${i.present_at?'✅ Présent':'⏳ Absent'}</span>` : ''}
        ${i.statut_paiement==='en_attente' ? `
          <button class="btn btn-sm btn-success" onclick="validerCash('${d.id}','${i.membre_id}')">Cash</button>` : ''}
      </div>`).join('')}
  `;
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
// Correspondance stade → ville, pour pré-remplir le champ Ville à partir
// du stade du match (la table `matchs` n'a pas de colonne ville dédiée).
// Couvre les stades de Ligue 1 2026-2027 (18 clubs, dont les promus ESTAC
// Troyes et Le Mans FC) — à étendre si Ultras Lutetia se déplace pour une
// coupe ou un amical contre un club hors Ligue 1.
const STADE_VERS_VILLE = {
  'Stade Raymond Kopa': 'Angers',
  'Stade de l\'Abbé Deschamps': 'Auxerre',
  'Stade Francis-Le Blé': 'Brest',
  'Stade Océane': 'Le Havre',
  'MMArena': 'Le Mans',
  'Stade Bollaert-Delelis': 'Lens',
  'Stade Pierre-Mauroy': 'Villeneuve-d\'Ascq',
  'Stade du Moustoir': 'Lorient',
  'Groupama Stadium': 'Décines-Charpieu',
  'Stade Vélodrome': 'Marseille',
  'Stade Louis-II': 'Monaco',
  'Allianz Riviera': 'Nice',
  'Parc des Princes': 'Paris',
  'Roazhon Park': 'Rennes',
  'Stade de la Meinau': 'Strasbourg',
  'Stadium de Toulouse': 'Toulouse',
  'Stade de l\'Aube': 'Troyes',
};

function deduireVilleDepuisStade(stade) {
  if (!stade) return '';
  return STADE_VERS_VILLE[stade] || '';
}

// Ouvre le modal de création de déplacement et charge la liste des
// matchs à l'extérieur à venir (seuls éligibles : Ultras Lutetia se
// déplace pour soutenir Paris FC, jamais pour un match à domicile).
// Le formulaire démarre toujours en mode "match du calendrier" — c'est
// le cas le plus fréquent — avec bascule possible vers "Autre événement"
// (cf. onChangeSourceDepl) pour les déplacements hors calendrier officiel
// (amicaux, Coupe, etc. pas encore dans la table matchs).
async function ouvrirCreerDepl() {
  document.getElementById('dSource').value = 'match';
  document.getElementById('dMatchId').innerHTML = '<option value="">— Sélectionner un match —</option>';
  document.getElementById('dMatchId').value = '';
  document.getElementById('dMatchVide').style.display = 'none';
  ['dAdv','dStade','dVille'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('dDate').value = '';
  document.getElementById('dRdv').value = '';
  document.getElementById('dRdvAutre').value = '';
  document.getElementById('dRdvAutre').style.display = 'none';
  document.getElementById('dTelegram').value = '';
  ['dHeure','dPrix','dPlaces','dLimite','dNotes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('dNotifier').checked = true;
  onChangeSourceDepl();

  try {
    const matchs = await UL.getMatchs();
    const today = new Date().toISOString().split('T')[0];
    const matchsExterieurFuturs = (matchs || [])
      .filter(m => m.type === 'exterieur' && m.date && m.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));

    const sel = document.getElementById('dMatchId');
    if (!matchsExterieurFuturs.length) {
      document.getElementById('dMatchVide').style.display = 'block';
    } else {
      sel.innerHTML = '<option value="">— Sélectionner un match —</option>' +
        matchsExterieurFuturs.map(m => {
          const dateAff = formatDateCourte ? (formatDateCourte(m.date) || m.date) : m.date;
          return `<option value="${m.id}">${esc(m.equipe_domicile || '?')} — ${dateAff}</option>`;
        }).join('');
    }
  } catch(e) { toast('Erreur chargement des matchs', 'error'); }

  showModal('modalCreerDepl');
}

// Bascule entre mode "match du calendrier" (bloc sélecteur visible, champs
// pré-remplis attendus) et "autre événement" (saisie 100% manuelle, comme
// avant l'introduction de ce sélecteur).
function onChangeSourceDepl() {
  const source = document.getElementById('dSource').value;
  document.getElementById('dBlocMatch').style.display = source === 'match' ? 'block' : 'none';
  if (source === 'autre') {
    document.getElementById('dMatchId').value = '';
  }
}

// Affiche le champ libre uniquement quand "Autre" est choisi comme point
// de RDV — Charléty et Porte de Versailles n'ont pas besoin de précision.
function onChangeRdvDepl() {
  const rdv = document.getElementById('dRdv').value;
  const autreInput = document.getElementById('dRdvAutre');
  autreInput.style.display = rdv === 'autre' ? 'block' : 'none';
  if (rdv !== 'autre') autreInput.value = '';
}

// Pré-remplit adversaire/date/stade/ville à partir du match sélectionné.
// Les champs restent modifiables ensuite (cf. décision produit) — utile
// si le stade ou la date affichée au calendrier n'est pas encore à jour.
// equipe_domicile = l'adversaire, puisque seuls les matchs extérieur sont
// proposés ici (Paris FC est toujours equipe_exterieur dans ce cas).
// La ville est déduite du stade via STADE_VERS_VILLE (la table matchs n'a
// pas de colonne ville) — reste vide et modifiable si le stade n'est pas
// reconnu (amical, stade neutre, etc.).
async function onChangeMatchDepl() {
  const matchId = document.getElementById('dMatchId').value;
  if (!matchId) return;
  try {
    const matchs = await UL.getMatchs();
    const match = (matchs || []).find(m => m.id === matchId);
    if (!match) return;
    document.getElementById('dAdv').value = match.equipe_domicile || '';
    document.getElementById('dDate').value = match.date || '';
    document.getElementById('dStade').value = match.stade || '';
    document.getElementById('dVille').value = deduireVilleDepuisStade(match.stade);
  } catch(e) { toast('Erreur chargement du match', 'error'); }
}

async function doCreerDepl(btn) {
  const source = document.getElementById('dSource').value;
  const matchId = document.getElementById('dMatchId').value;
  const rdvChoix = document.getElementById('dRdv').value;
  const pointRdv = rdvChoix === 'autre' ? (document.getElementById('dRdvAutre').value.trim() || null) : (rdvChoix || null);
  const data = {
    adversaire: document.getElementById('dAdv').value,
    date_match: document.getElementById('dDate').value,
    stade: document.getElementById('dStade').value || null,
    ville: document.getElementById('dVille').value || null,
    point_rdv: pointRdv,
    lien_telegram: document.getElementById('dTelegram').value.trim() || null,
    heure_depart: document.getElementById('dHeure').value || null,
    prix_total: parseFloat(document.getElementById('dPrix').value) || null,
    places_max: parseInt(document.getElementById('dPlaces').value) || null,
    date_limite_inscription: document.getElementById('dLimite').value || null,
    notes: document.getElementById('dNotes').value || null,
    match_id: (source === 'match' && matchId) ? matchId : null,
  };
  if (!data.adversaire || !data.date_match) return toast('Adversaire et date requis', 'error');
  const notifier = document.getElementById('dNotifier')?.checked;
  const texteOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    const depl = await UL.createDeplacement(data);
    toast('Déplacement créé ✅', 'success');
    closeModal('modalCreerDepl');
    loadDeplacements();
    // Notification "nouveau contenu" — ouverte à tous les membres actifs,
    // sans restriction de statut (cf. cible:'tous', cohérent avec
    // getDeplacements qui n'applique aucun filtre de droits côté lecture).
    if (notifier) {
      UL.envoyerNotificationPushGroupe({
        cible: 'tous',
        titre: '🚌 Nouveau déplacement',
        corps: `${data.adversaire} — inscriptions ouvertes`,
        url: '/ultras-lutetia/',
      });
    }
  } catch(e) {
    toast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
  }
}

// Ouvre le modal de modification, pré-rempli avec les valeurs actuelles du
// déplacement. Suit le même pattern à deux modals séparés que les sessions
// tifo (modalCreerSession / modalModifierSession) plutôt qu'un seul modal
// réutilisé, pour rester cohérent avec le reste du projet.
async function ouvrirModifierDepl(deplId) {
  try {
    const { deplacement: d } = await UL.getDeplacement(deplId);
    document.getElementById('dmId').value = d.id;
    document.getElementById('dmSource').value = d.match_id ? 'match' : 'autre';
    document.getElementById('dmAdv').value = d.adversaire || '';
    document.getElementById('dmDate').value = d.date_match || '';
    document.getElementById('dmStade').value = d.stade || '';
    document.getElementById('dmVille').value = d.ville || '';
    document.getElementById('dmTelegram').value = d.lien_telegram || '';
    document.getElementById('dmHeure').value = d.heure_depart || '';
    document.getElementById('dmPrix').value = d.prix_total || '';
    document.getElementById('dmPlaces').value = d.places_max || '';
    document.getElementById('dmLimite').value = d.date_limite_inscription || '';
    document.getElementById('dmNotes').value = d.notes || '';
    document.getElementById('dmStatut').value = d.statut || 'ouvert';

    // Point de RDV : si la valeur actuelle correspond à une des options
    // prédéfinies, on la sélectionne ; sinon on bascule sur "Autre" avec
    // le champ libre pré-rempli (cas d'un RDV saisi avant l'introduction
    // de ce sélecteur, ou un point de RDV non standard).
    const rdvConnu = ['Stade Charléty', 'Porte de Versailles'].includes(d.point_rdv);
    document.getElementById('dmRdv').value = rdvConnu ? d.point_rdv : (d.point_rdv ? 'autre' : '');
    document.getElementById('dmRdvAutre').value = (!rdvConnu && d.point_rdv) ? d.point_rdv : '';
    document.getElementById('dmRdvAutre').style.display = (!rdvConnu && d.point_rdv) ? 'block' : 'none';

    onChangeSourceDeplModif();

    // Charge la liste des matchs extérieur (mêmes critères que la création)
    // — inclut aussi le match déjà lié même s'il est passé, pour ne pas le
    // faire disparaître du sélecteur lors d'une modification tardive.
    const matchs = await UL.getMatchs();
    const today = new Date().toISOString().split('T')[0];
    const matchsExterieur = (matchs || [])
      .filter(m => m.type === 'exterieur' && (m.id === d.match_id || (m.date && m.date >= today)))
      .sort((a, b) => (a.date||'').localeCompare(b.date||''));

    const sel = document.getElementById('dmMatchId');
    if (!matchsExterieur.length) {
      document.getElementById('dmMatchVide').style.display = 'block';
      sel.innerHTML = '<option value="">— Sélectionner un match —</option>';
    } else {
      document.getElementById('dmMatchVide').style.display = 'none';
      sel.innerHTML = '<option value="">— Sélectionner un match —</option>' +
        matchsExterieur.map(m => {
          const dateAff = formatDateCourte ? (formatDateCourte(m.date) || m.date) : m.date;
          return `<option value="${m.id}">${esc(m.equipe_domicile || '?')} — ${dateAff}</option>`;
        }).join('');
    }
    sel.value = d.match_id || '';

    showModal('modalModifierDepl');
  } catch(e) { toast('Erreur chargement du déplacement', 'error'); }
}

function onChangeSourceDeplModif() {
  const source = document.getElementById('dmSource').value;
  document.getElementById('dmBlocMatch').style.display = source === 'match' ? 'block' : 'none';
  if (source === 'autre') {
    document.getElementById('dmMatchId').value = '';
  }
}

function onChangeRdvDeplModif() {
  const rdv = document.getElementById('dmRdv').value;
  const autreInput = document.getElementById('dmRdvAutre');
  autreInput.style.display = rdv === 'autre' ? 'block' : 'none';
  if (rdv !== 'autre') autreInput.value = '';
}

async function onChangeMatchDeplModif() {
  const matchId = document.getElementById('dmMatchId').value;
  if (!matchId) return;
  try {
    const matchs = await UL.getMatchs();
    const match = (matchs || []).find(m => m.id === matchId);
    if (!match) return;
    document.getElementById('dmAdv').value = match.equipe_domicile || '';
    document.getElementById('dmDate').value = match.date || '';
    document.getElementById('dmStade').value = match.stade || '';
    document.getElementById('dmVille').value = deduireVilleDepuisStade(match.stade);
  } catch(e) { toast('Erreur chargement du match', 'error'); }
}

async function doModifierDepl(btn) {
  const id = document.getElementById('dmId').value;
  const source = document.getElementById('dmSource').value;
  const matchId = document.getElementById('dmMatchId').value;
  const rdvChoix = document.getElementById('dmRdv').value;
  const pointRdv = rdvChoix === 'autre' ? (document.getElementById('dmRdvAutre').value.trim() || null) : (rdvChoix || null);
  const data = {
    adversaire: document.getElementById('dmAdv').value,
    date_match: document.getElementById('dmDate').value,
    stade: document.getElementById('dmStade').value || null,
    ville: document.getElementById('dmVille').value || null,
    point_rdv: pointRdv,
    lien_telegram: document.getElementById('dmTelegram').value.trim() || null,
    heure_depart: document.getElementById('dmHeure').value || null,
    prix_total: parseFloat(document.getElementById('dmPrix').value) || null,
    places_max: parseInt(document.getElementById('dmPlaces').value) || null,
    date_limite_inscription: document.getElementById('dmLimite').value || null,
    notes: document.getElementById('dmNotes').value || null,
    statut: document.getElementById('dmStatut').value,
    match_id: (source === 'match' && matchId) ? matchId : null,
  };
  if (!data.adversaire || !data.date_match) return toast('Adversaire et date requis', 'error');
  const texteOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    await UL.updateDeplacement(id, data);
    toast('Déplacement modifié ✅', 'success');
    closeModal('modalModifierDepl');
    loadDeplacements();
  } catch(e) {
    toast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
  }
}
