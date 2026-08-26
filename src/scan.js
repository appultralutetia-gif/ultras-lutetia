// ─── SCAN MEMBRE ────────────────────────────────────────────
// Composant transverse : un seul scanner réutilisé pour 3 contextes
// (présence Déplacement, retrait Matos, remise Stick). Le scan résout
// d'abord un membre via son QR fixe (UL.getMembreParQrCode), puis affiche
// les actions contextuelles disponibles pour CE membre dans CE contexte.
//
// Caméra en mode principal (lib html5-qrcode), avec repli "saisie
// manuelle" toujours visible sous la zone vidéo si la caméra ne
// fonctionne pas (permissions refusées, pas de caméra, lumière
// insuffisante) — cf. plan_qr_membre.md §4.2.

let scanHtml5QrInstance = null;
let scanContexteActuel = null; // 'deplacement' | 'matos' | 'stick'

async function ouvrirScanMembre(contexte) {
  scanContexteActuel = contexte;

  let html = `
    <h3 class="modal-title">${libelleContexteScan(contexte)}</h3>
    <div id="scanCameraContainer" style="margin:14px 0;border-radius:12px;overflow:hidden;"></div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
      <input type="text" id="scanCodeManuel" placeholder="Ou saisir le code manuellement" style="flex:1;">
      <button class="btn btn-sm btn-secondary" onclick="doScanCodeManuel()">Valider</button>
    </div>
    <div id="scanResultat"></div>
    <button class="btn btn-secondary" style="margin-top:10px;width:100%;" onclick="closeModalScan()">Fermer</button>
  `;
  document.getElementById('modalScanContent').innerHTML = html;
  showModal('modalScan');
  demarrerCameraScan();
}

function libelleContexteScan(contexte) {
  if (contexte === 'deplacement') return '📷 Scanner présence — Déplacement';
  if (contexte === 'matos') return '📷 Scanner retrait — Matos';
  if (contexte === 'stick') return '📷 Scanner remise — Sticks';
  return '📷 Scanner';
}

function demarrerCameraScan() {
  const container = document.getElementById('scanCameraContainer');
  if (!container || typeof Html5Qrcode === 'undefined') {
    // Lib non chargée (CDN bloqué, hors-ligne) : on reste sur la saisie
    // manuelle, déjà affichée dans tous les cas — pas d'erreur bloquante.
    return;
  }
  container.innerHTML = '<div id="scanCameraView" style="width:100%;"></div>';
  scanHtml5QrInstance = new Html5Qrcode('scanCameraView');
  scanHtml5QrInstance.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 220 },
    (decodedText) => {
      // Un scan réussi traite immédiatement le code, puis coupe la caméra
      // pour économiser la batterie pendant la lecture du résultat — elle
      // est redémarrée automatiquement si on reste dans le même contexte
      // (cf. fin de traiterCodeMembre, pour scanner la personne suivante).
      arreterCameraScan();
      traiterCodeMembre(decodedText);
    },
    () => { /* échec de lecture frame par frame, pas une erreur — ignoré */ }
  ).catch(() => {
    container.innerHTML = '<div class="info-box" style="font-size:12px;">Caméra indisponible — utilise la saisie manuelle ci-dessous.</div>';
  });
}

function arreterCameraScan() {
  if (scanHtml5QrInstance) {
    // html5-qrcode peut lever une erreur SYNCHRONE ("Cannot stop, scanner
    // is not running or paused") si stop() est appelé alors que le
    // scanner n'a jamais réellement démarré (ex: caméra indisponible) —
    // le .catch() seul ne suffit pas à l'attraper puisqu'elle survient
    // avant même la création de la promesse. Sans ce try/catch, cette
    // erreur interrompait toute la fonction appelante (closeModalScan),
    // empêchant le bouton "Fermer" de fonctionner.
    try {
      const p = scanHtml5QrInstance.stop();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* scanner jamais démarré, rien à arrêter — ignoré */ }
    scanHtml5QrInstance = null;
  }
}

function doScanCodeManuel() {
  const code = document.getElementById('scanCodeManuel').value;
  if (!code || !code.trim()) return toast('Saisis un code', 'error');
  traiterCodeMembre(code.trim());
}

async function traiterCodeMembre(code) {
  const resultatEl = document.getElementById('scanResultat');
  resultatEl.innerHTML = '<div style="font-size:13px;color:var(--gris);">Recherche du membre…</div>';
  try {
    const membre = await UL.getMembreParQrCode(code);
    if (!membre) {
      resultatEl.innerHTML = '<div class="info-box error">❌ Code invalide — réessaie ou saisis manuellement</div>';
      relancerCameraSiPossible();
      return;
    }
    if (scanContexteActuel === 'deplacement') await afficherActionsDeplacement(membre);
    else if (scanContexteActuel === 'matos') await afficherActionsMatos(membre);
    else if (scanContexteActuel === 'stick') await afficherActionsStick(membre);
  } catch (e) {
    resultatEl.innerHTML = '<div class="info-box error">Erreur lors de la recherche du membre</div>';
    relancerCameraSiPossible();
  }
}

// Redémarre la caméra après un résultat (erreur ou action terminée) pour
// scanner la personne suivante sans avoir à fermer/rouvrir la modale —
// cf. plan §5.1, fluidifier l'usage devant un bus avec une file de gens.
function relancerCameraSiPossible() {
  setTimeout(demarrerCameraScan, 600);
}

// ─── Contexte Déplacement ───────────────────────────────────
// Refonte 25/08/2026 (demande Remi) : on scanne désormais le membre
// PRÉSENT lui-même (son propre QR de Profil), pas le payeur d'un groupe
// — un scan = une présence, plus de sélection manuelle par case à
// cocher. Comme il n'y a plus de déplacement présélectionné en amont
// (cf. ouvrirScanMembre), le/les déplacement(s) concernés sont
// retrouvés à partir du membre scanné : s'il n'a qu'un seul déplacement
// payé en attente de présence, la présence est confirmée immédiatement ;
// s'il en a plusieurs (rare, deux déplacements qui se chevauchent), on
// demande lequel avant de confirmer.
// ⚠️ Un invité hors app (jamais de compte, donc jamais de QR à scanner)
// ne peut plus être pointé par ce flux — cf. marquerPresentManuel
// (deplacements.js), nouveau bouton de secours dans "Voir inscrits"
// pour ce cas précis.
async function afficherActionsDeplacement(membre) {
  const resultatEl = document.getElementById('scanResultat');
  const nomComplet = `${membre.prenom || ''} ${membre.nom || ''}`.trim();
  resultatEl.innerHTML = `<div style="font-size:13px;color:var(--gris);">Recherche des déplacements de ${esc(nomComplet)}…</div>`;

  try {
    const candidats = await UL.getInscriptionsAPointerParMembre(membre.id);

    if (!candidats.length) {
      resultatEl.innerHTML = `<div class="info-box">Aucun déplacement payé en attente de présence pour ${esc(nomComplet)}</div>`;
      relancerCameraSiPossible();
      return;
    }

    if (candidats.length === 1) {
      resultatEl.innerHTML = `<div style="font-size:13px;color:var(--gris);">Confirmation pour ${esc(nomComplet)} — ${esc(candidats[0].deplacement.adversaire || '?')}…</div>`;
      await doConfirmerPresenceUnique(candidats[0].id, nomComplet);
      return;
    }

    resultatEl.innerHTML = `
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;">${esc(nomComplet)} — plusieurs déplacements en attente, sélectionne celui concerné :</div>
      ${candidats.map(c => `
        <button class="btn btn-sm btn-success" style="width:100%;margin-bottom:6px;" onclick="doConfirmerPresenceUnique('${c.id}','${esc(nomComplet)}')">
          ✅ ${esc(c.deplacement.adversaire || '?')}${c.deplacement.date_match ? ' — ' + new Date(c.deplacement.date_match).toLocaleDateString('fr-FR') : ''}
        </button>`).join('')}
    `;
  } catch (e) {
    resultatEl.innerHTML = '<div class="info-box error">Erreur recherche déplacements</div>';
    relancerCameraSiPossible();
  }
}

async function doConfirmerPresenceUnique(inscriptionId, nomComplet) {
  try {
    await UL.confirmerPresencesDeplacement([inscriptionId]);
    toast(`Présence confirmée ✅ — ${nomComplet}`, 'success');
    document.getElementById('scanResultat').innerHTML = `<div class="info-box success">✅ Présence confirmée — ${esc(nomComplet)}</div>`;
    relancerCameraSiPossible();
  } catch (e) {
    toast(e.message || 'Impossible de confirmer la présence', 'error');
    relancerCameraSiPossible();
  }
}

// ─── Contexte Matos ─────────────────────────────────────────
async function afficherActionsMatos(membre) {
  const resultatEl = document.getElementById('scanResultat');
  const nomComplet = `${membre.prenom || ''} ${membre.nom || ''}`.trim();
  resultatEl.innerHTML = `<div style="font-size:13px;color:var(--gris);">Recherche des commandes de ${esc(nomComplet)}…</div>`;

  try {
    const toutes = await UL.getAllCommandes();
    const commandesMembre = (toutes || []).filter(c => c.membre_id === membre.id);
    const disponibles = commandesMembre.filter(c => c.statut === 'disponible' || c.statut === 'prepare');
    // Payées mais pas encore physiquement disponibles (précommande en
    // attente de réception, ou paiement cash pas encore confirmé) — le
    // scan doit bloquer explicitement plutôt que de les ignorer
    // silencieusement (cf. demande explicite : "bloque — affiche pas
    // encore prêt").
    const pasEncoreDisponibles = commandesMembre.filter(c => c.statut === 'precommande_validee' || c.statut === 'en_attente');

    if (!disponibles.length && !pasEncoreDisponibles.length) {
      resultatEl.innerHTML = `<div class="info-box">Aucune commande à récupérer pour ${esc(nomComplet)}</div>`;
      relancerCameraSiPossible();
      return;
    }

    const blocHtml = pasEncoreDisponibles.length ? `
      <div class="info-box error" style="margin-bottom:10px;">
        ⏳ ${pasEncoreDisponibles.length} commande${pasEncoreDisponibles.length > 1 ? 's' : ''} pas encore disponible${pasEncoreDisponibles.length > 1 ? 's' : ''} — retrait impossible pour l'instant
        ${pasEncoreDisponibles.map(c => `<div style="font-size:12px;margin-top:4px;">${(c.commande_items || []).map(i => esc(i.produit?.nom || '?')).join(', ')} ${c.statut === 'precommande_validee' ? '(en attente de réception)' : '(paiement en attente)'}</div>`).join('')}
      </div>` : '';

    if (!disponibles.length) {
      resultatEl.innerHTML = blocHtml;
      relancerCameraSiPossible();
      return;
    }

    resultatEl.innerHTML = `
      ${blocHtml}
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;">${esc(nomComplet)} — ${disponibles.length} commande${disponibles.length > 1 ? 's' : ''} disponible${disponibles.length > 1 ? 's' : ''}</div>
      ${disponibles.map(c => `
        <div class="card" style="margin-bottom:8px;padding:10px;">
          <div style="font-size:13px;">${(c.commande_items || []).map(i => esc(i.produit?.nom || '?')).join(', ')}</div>
          <div style="font-size:12px;color:var(--gris);margin-bottom:8px;">${c.total}€</div>
          <button class="btn btn-sm btn-success" style="width:100%;" onclick="doConfirmerRetraitMatos('${c.id}')">✔️ Confirmer retrait</button>
        </div>`).join('')}
    `;
  } catch (e) {
    resultatEl.innerHTML = '<div class="info-box error">Erreur recherche commandes</div>';
    relancerCameraSiPossible();
  }
}

async function doConfirmerRetraitMatos(commandeId) {
  try {
    await UL.updateCommandeStatut(commandeId, 'distribue');
    toast('Retrait confirmé ✅', 'success');
    document.getElementById('scanResultat').innerHTML = '<div class="info-box success">✅ Retrait confirmé</div>';
    relancerCameraSiPossible();
  } catch (e) {
    toast(e.message || 'Impossible de confirmer le retrait', 'error');
  }
}

// ─── Contexte Stick ─────────────────────────────────────────
async function afficherActionsStick(membre) {
  const resultatEl = document.getElementById('scanResultat');
  const nomComplet = `${membre.prenom || ''} ${membre.nom || ''}`.trim();
  resultatEl.innerHTML = `<div style="font-size:13px;color:var(--gris);">Recherche des sticks de ${esc(nomComplet)}…</div>`;

  try {
    const toutes = await UL.getAllDistributions();
    // 'disponible'/'prepare' = payé (cash confirmé ou HelloAsso confirmé
    // par webhook) et physiquement en stock — préparé ou non à l'avance,
    // les deux sont scannables. Une ligne 'en_attente' (paiement pas
    // confirmé) ou 'precommande_validee' (payé mais pas encore reçu) doit
    // bloquer, pas être ignorée silencieusement.
    const disponibles = (toutes || []).filter(d => d.membre_id === membre.id && (d.statut === 'disponible' || d.statut === 'prepare'));
    const pasEncoreDisponibles = (toutes || []).filter(d => d.membre_id === membre.id && (d.statut === 'en_attente' || d.statut === 'precommande_validee'));

    if (!disponibles.length && !pasEncoreDisponibles.length) {
      resultatEl.innerHTML = `<div class="info-box">Aucune remise disponible pour ${esc(nomComplet)}</div>`;
      relancerCameraSiPossible();
      return;
    }

    const blocHtml = pasEncoreDisponibles.length ? `
      <div class="info-box error" style="margin-bottom:10px;">
        ⏳ ${pasEncoreDisponibles.length} remise${pasEncoreDisponibles.length > 1 ? 's' : ''} pas encore disponible${pasEncoreDisponibles.length > 1 ? 's' : ''} — remise impossible pour l'instant
        ${pasEncoreDisponibles.map(d => `<div style="font-size:12px;margin-top:4px;">${esc(d.stick?.nom || '?')} ${d.statut === 'precommande_validee' ? '(en attente de réception)' : '(paiement en attente)'}</div>`).join('')}
      </div>` : '';

    if (!disponibles.length) {
      resultatEl.innerHTML = blocHtml;
      relancerCameraSiPossible();
      return;
    }

    resultatEl.innerHTML = `
      ${blocHtml}
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;">${esc(nomComplet)} — ${disponibles.length} remise${disponibles.length > 1 ? 's' : ''} disponible${disponibles.length > 1 ? 's' : ''}</div>
      ${disponibles.map(d => `
        <div class="card" style="margin-bottom:8px;padding:10px;">
          <div style="font-size:13px;">${esc(d.stick?.nom || '?')} × ${d.quantite}</div>
          <div style="font-size:12px;color:var(--gris);margin-bottom:6px;">${d.mode_paiement === 'cash' ? '💵 Cash' : d.mode_paiement === 'helloasso' ? '💳 HelloAsso' : esc(d.mode_paiement || '')}</div>
          <button class="btn btn-sm btn-success" style="width:100%;" onclick="doConfirmerRemiseStick('${d.id}')">✔️ Confirmer remise</button>
        </div>`).join('')}
    `;
  } catch (e) {
    resultatEl.innerHTML = '<div class="info-box error">Erreur recherche sticks</div>';
    relancerCameraSiPossible();
  }
}

async function doConfirmerRemiseStick(distribId) {
  try {
    await UL.confirmerDistributionStick(distribId);
    toast('Remise confirmée ✅', 'success');
    document.getElementById('scanResultat').innerHTML = '<div class="info-box success">✅ Remise confirmée</div>';
    relancerCameraSiPossible();
  } catch (e) {
    toast(e.message || 'Impossible de confirmer la remise', 'error');
  }
}

// ─── Fermeture modale ───────────────────────────────────────
// Coupe systématiquement la caméra à la fermeture, pour ne jamais laisser
// le flux vidéo actif en arrière-plan (batterie, indicateur caméra du
// téléphone qui resterait allumé).
function closeModalScan(event) {
  // Même pattern que closeModalOutside (app.js) : ne ferme que si le clic
  // a eu lieu directement sur l'overlay, pas sur le contenu de la modale.
  if (event && event.target !== document.getElementById('modalScan')) return;
  arreterCameraScan();
  scanContexteActuel = null;
  closeModal('modalScan');
}
