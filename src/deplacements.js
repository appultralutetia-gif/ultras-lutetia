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
    ${adminBar}
  </div>`;
}

async function openDepl(deplId) {
  currentDeplId = deplId;
  const m = UL.getCurrentMembre();
  try {
    const { deplacement: d, inscrits, monInscrit, nbInscrits } = await UL.getDeplacement(deplId);
    const estInscrit = !!monInscrit;
    // ⚠️ Avec l'ajout du statut 'refuse' (paiement HelloAsso refusé), on ne
    // peut plus se contenter de "!== 'en_attente'" pour détecter un paiement
    // confirmé — un paiement refusé n'est pas 'en_attente' mais n'est pas
    // payé non plus. On distingue explicitement les 3 cas.
    const estPaye = monInscrit && (monInscrit.statut_paiement === 'paye_cash' || monInscrit.statut_paiement === 'paye_ha');
    const estRefuse = monInscrit && monInscrit.statut_paiement === 'refuse';
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
      html += `<button class="btn btn-primary" onclick="doInscritDepl('${d.id}')">M'inscrire</button>`;
    } else if (estRefuse) {
      html += `<div class="info-box error">❌ Paiement refusé</div>
        <button class="btn btn-primary" onclick="doInscritDepl('${d.id}')">Réessayer le paiement</button>`;
    } else if (!estPaye) {
      html += `<div class="info-box">⏳ Inscrit — paiement en cours</div>
        <p style="text-align:center;font-size:12px;color:var(--gris);margin-top:8px;">Si le paiement n'a pas démarré ou a été abandonné, tu peux réessayer.</p>
        <button class="btn btn-secondary" onclick="doInscritDepl('${d.id}')">Relancer le paiement</button>`;
    } else {
      html += `<div class="info-box success">✅ Paiement confirmé — ton billet est prêt</div>
        <div class="qr-container" id="qrDepl"></div>
        <p style="text-align:center;font-size:12px;color:var(--gris);">Code: ${monInscrit.qr_code||''}</p>`;
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
async function doInscritDepl(id) {
  try {
    toast('Redirection vers le paiement…', 'success');
    const { data, error } = await UL.sb.functions.invoke('helloasso-create-checkout', {
      body: { deplacementId: id },
    });
    if (error) throw new Error(error.message || 'Impossible de lancer le paiement');
    if (data?.error) throw new Error(data.error);
    if (!data?.redirectUrl) throw new Error('Réponse de paiement invalide');
    closeModal('modalDepl');
    window.location.href = data.redirectUrl;
  } catch(e) {
    toast(e.message || 'Impossible de s\'inscrire au déplacement', 'error');
  }
}

async function voirInscritsDepl(deplId) {
  try {
    const { inscrits, deplacement: d } = await UL.getDeplacement(deplId);
    document.getElementById('modalAdminSessionContent').innerHTML = `
      <h3 class="modal-title">Inscrits — ${d.adversaire}</h3>
      ${inscrits.map(i => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <div style="flex:1;">
            <div style="font-weight:600;">@${i.membre?.pseudo_telegram||'?'}</div>
            <div style="color:var(--gris);">${i.membre?.prenom||''} ${i.membre?.nom||''}</div>
          </div>
          <span class="badge ${i.statut_paiement==='en_attente'?'badge-orange':i.statut_paiement.includes('paye')?'badge-vert':'badge-gris'}">
            ${i.statut_paiement==='en_attente'?'⏳':i.statut_paiement==='paye_cash'?'Cash ✅':'HA ✅'}
          </span>
          ${i.statut_paiement==='en_attente' ? `
            <button class="btn btn-sm btn-success" onclick="validerCash('${deplId}','${i.membre_id}')">Cash</button>` : ''}
        </div>`).join('')}
    `;
    showModal('modalAdminSession');
  } catch(e) { toast('Impossible de charger les inscrits du déplacement', 'error'); }
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
  ['dRdv','dHeure','dPrix','dPlaces','dLimite','dNotes'].forEach(id => document.getElementById(id).value = '');
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

// Pré-remplit adversaire/date/stade/ville à partir du match sélectionné.
// Les champs restent modifiables ensuite (cf. décision produit) — utile
// si le stade ou la date affichée au calendrier n'est pas encore à jour.
// equipe_domicile = l'adversaire, puisque seuls les matchs extérieur sont
// proposés ici (Paris FC est toujours equipe_exterieur dans ce cas).
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
  } catch(e) { toast('Erreur chargement du match', 'error'); }
}

async function doCreerDepl() {
  const source = document.getElementById('dSource').value;
  const matchId = document.getElementById('dMatchId').value;
  const data = {
    adversaire: document.getElementById('dAdv').value,
    date_match: document.getElementById('dDate').value,
    stade: document.getElementById('dStade').value || null,
    ville: document.getElementById('dVille').value || null,
    point_rdv: document.getElementById('dRdv').value || null,
    heure_depart: document.getElementById('dHeure').value || null,
    prix_total: parseFloat(document.getElementById('dPrix').value) || null,
    places_max: parseInt(document.getElementById('dPlaces').value) || null,
    date_limite_inscription: document.getElementById('dLimite').value || null,
    notes: document.getElementById('dNotes').value || null,
    match_id: (source === 'match' && matchId) ? matchId : null,
  };
  if (!data.adversaire || !data.date_match) return toast('Adversaire et date requis', 'error');
  try {
    await UL.createDeplacement(data);
    toast('Déplacement créé ✅', 'success');
    closeModal('modalCreerDepl');
    loadDeplacements();
  } catch(e) { toast(e.message, 'error'); }
}
