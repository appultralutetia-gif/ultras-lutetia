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
let scanDeplacementChoisi = null; // id du déplacement sélectionné (contexte deplacement uniquement)

async function ouvrirScanMembre(contexte) {
  scanContexteActuel = contexte;
  scanDeplacementChoisi = null;

  let html = `
    <h3 class="modal-title">${libelleContexteScan(contexte)}</h3>
    <div id="scanSelecteurContexte"></div>
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

  if (contexte === 'deplacement') {
    await chargerSelecteurDeplacement();
  } else {
    // Matos/Stick n'ont pas besoin de désambiguïser une ressource avant
    // de scanner — on démarre la caméra directement.
    demarrerCameraScan();
  }
}

function libelleContexteScan(contexte) {
  if (contexte === 'deplacement') return '📷 Scanner présence — Déplacement';
  if (contexte === 'matos') return '📷 Scanner retrait — Matos';
  if (contexte === 'stick') return '📷 Scanner remise — Sticks';
  return '📷 Scanner';
}

// Liste déroulante des déplacements à venir, pré-sélectionnée si un seul
// existe (cas le plus fréquent en pratique — cf. plan §5.1). Le menu reste
// affiché et modifiable même dans ce cas, pour éviter toute ambiguïté si
// deux déplacements se chevauchent un jour.
async function chargerSelecteurDeplacement() {
  const conteneur = document.getElementById('scanSelecteurContexte');
  conteneur.innerHTML = '<div style="font-size:13px;color:var(--gris);">Chargement des déplacements…</div>';
  try {
    const depls = await UL.getDeplacements(true);
    if (!depls.length) {
      conteneur.innerHTML = '<div class="info-box">Aucun déplacement à venir</div>';
      return;
    }
    scanDeplacementChoisi = depls[0].id;
    conteneur.innerHTML = `
      <div class="form-group">
        <label>Déplacement concerné</label>
        <select id="scanSelectDepl" onchange="scanDeplacementChoisi=this.value">
          ${depls.map(d => `<option value="${d.id}">${esc(d.adversaire || '?')} — ${d.date_match || ''}</option>`).join('')}
        </select>
      </div>
    `;
    demarrerCameraScan();
  } catch (e) {
    conteneur.innerHTML = '<div class="info-box error">Erreur chargement déplacements</div>';
  }
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
  if (scanContexteActuel === 'deplacement' && !scanDeplacementChoisi) return;
  setTimeout(demarrerCameraScan, 600);
}

// ─── Contexte Déplacement ───────────────────────────────────
// Refonte 09/07/2026 (demande Remi, multi-personnes) : on scanne
// désormais le QR du PAYEUR, pas celui de chaque participant — un seul
// scan peut couvrir plusieurs places (soi + amis + invités payés
// ensemble). L'admin coche qui est physiquement présent parmi les
// personnes que ce payeur a réglées, puis confirme en un seul geste.
let _inscriptionsScanCourant = [];

async function afficherActionsDeplacement(payeur) {
  const resultatEl = document.getElementById('scanResultat');
  if (!scanDeplacementChoisi) {
    resultatEl.innerHTML = '<div class="info-box error">Aucun déplacement sélectionné</div>';
    return;
  }
  const nomPayeur = `${payeur.prenom || ''} ${payeur.nom || ''}`.trim();
  resultatEl.innerHTML = `<div style="font-size:13px;color:var(--gris);">Recherche des places payées par ${esc(nomPayeur)}…</div>`;

  try {
    const { inscrits } = await UL.getDeplacement(scanDeplacementChoisi);
    const mesInscriptions = (inscrits || []).filter(i => i.payeur_id === payeur.id);

    if (!mesInscriptions.length) {
      resultatEl.innerHTML = `<div class="info-box error">❌ ${esc(nomPayeur)} n'a inscrit personne à ce déplacement</div>`;
      relancerCameraSiPossible();
      return;
    }

    _inscriptionsScanCourant = mesInscriptions;

    resultatEl.innerHTML = `
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;">Payé par ${esc(nomPayeur)} — coche les personnes présentes :</div>
      ${mesInscriptions.map(i => {
        const nomParticipant = i.membre_id
          ? (`${i.membre?.prenom||''} ${i.membre?.nom||''}`.trim() || `@${i.membre?.pseudo_telegram||'?'}`)
          : `${i.invite_prenom||''} ${i.invite_nom||''} (hors app)`.trim();
        const estPaye = i.statut_paiement === 'paye_cash' || i.statut_paiement === 'paye_ha';
        const dejaPresent = !!i.present_at;
        return `
          <label style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);">
            <input type="checkbox" class="scan-depl-check" value="${i.id}" ${dejaPresent?'checked disabled':''} style="width:20px;height:20px;flex-shrink:0;">
            <span style="flex:1;font-size:14px;">${esc(nomParticipant)}</span>
            ${dejaPresent
              ? '<span class="badge badge-vert" style="flex-shrink:0;">✅ Présent</span>'
              : estPaye
                ? '<span class="badge badge-vert" style="flex-shrink:0;">✅ Payé</span>'
                : `<span class="badge badge-orange" style="flex-shrink:0;">⚠️ ${esc(i.statut_paiement)}</span>`}
          </label>`;
      }).join('')}
      <button class="btn btn-success" style="width:100%;margin-top:12px;" onclick="doConfirmerPresence(false)">✅ Confirmer présence des personnes cochées</button>
    `;
  } catch (e) {
    resultatEl.innerHTML = '<div class="info-box error">Erreur vérification déplacement</div>';
    relancerCameraSiPossible();
  }
}

// force=true reproposé automatiquement (confirm()) si des places cochées
// ne sont pas encore payées — évite de multiplier les boutons "Valider
// quand même" ligne par ligne pour un cas qui reste rare en pratique.
async function doConfirmerPresence(force) {
  const ids = [...document.querySelectorAll('.scan-depl-check:checked:not(:disabled)')].map(el => el.value);
  if (!ids.length) return toast('Coche au moins une personne présente', 'error');
  try {
    const res = await UL.confirmerPresencesDeplacement(ids, force);
    toast(`Présence confirmée ✅ (${res.nb})`, 'success');
    document.getElementById('scanResultat').innerHTML = '<div class="info-box success">✅ Présence confirmée</div>';
    relancerCameraSiPossible();
  } catch (e) {
    if (e.code === 'PAIEMENT_NON_CONFIRME' && !force) {
      if (confirm(`${e.message} — valider quand même la présence pour les personnes cochées ?`)) {
        return doConfirmerPresence(true);
      }
      return;
    }
    toast(e.message || 'Impossible de confirmer la présence', 'error');
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
  scanDeplacementChoisi = null;
  closeModal('modalScan');
}
