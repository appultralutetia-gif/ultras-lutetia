// ─── PROFIL ───────────────────────────────────────────────────
const EVAL_EMOJI = {
  tifo: '🖌️', deplacement: '🚌', comite_sympa: '💙', comite_draft: '🚀',
};
const EVAL_LABEL = {
  tifo: 'Cellule Tifo', deplacement: 'Déplacements', comite_sympa: 'Évaluation', comite_draft: 'Évaluation',
};
function renderEtoiles(emoji, note) {
  return emoji.repeat(note) + '<span style="opacity:.25;">' + emoji.repeat(3 - note) + '</span>';
}

async function loadProfil() {
  const m = UL.getCurrentMembre();
  if (!m) return;
  const initiales = ((m.prenom||'?')[0]+(m.nom||'?')[0]).toUpperCase();
  const statutLabel = {
    visiteur:'🚶 Visiteur', sympathisant:'💙 Sympathisant', draft:'🚀 Draft', confirme:'🏅 Confirmé',
    membre_cellule:'🛡️ Membre Cellule', bureau:'🏆 Bureau', admin:'⚙️ Admin'
  };

  // Catégories d'évaluation pertinentes pour ce membre :
  // comité (sympa ou draft selon statut actuel) + tifo/déplacement s'il a une note dans ces catégories.
  let evaluations = {};
  try { evaluations = await UL.getEvaluationsMembre(m.id); } catch(e) {}

  const categoriesAAfficher = [];
  if (m.statut === 'sympathisant' && evaluations.comite_sympa) categoriesAAfficher.push('comite_sympa');
  if (m.statut === 'draft' && evaluations.comite_draft) categoriesAAfficher.push('comite_draft');
  if (evaluations.deplacement) categoriesAAfficher.push('deplacement');

  const evaluationsHtml = categoriesAAfficher.length
    ? categoriesAAfficher.map(cat => `
        <div style="font-size:13px;margin-bottom:6px;">
          ${renderEtoiles(EVAL_EMOJI[cat], evaluations[cat])} ${EVAL_LABEL[cat]}
        </div>`).join('')
    : '<div style="font-size:13px;margin-bottom:6px;color:var(--gris);">Pas encore d\'évaluation</div>';

  document.getElementById('profilCard').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
      <div class="avatar" style="width:54px;height:54px;font-size:18px;">${initiales}</div>
      <div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:18px;">${m.prenom} ${m.nom}</div>
        <div style="font-size:13px;color:var(--gris);">@${m.pseudo_telegram}</div>
        <div class="statut-${m.statut}" style="font-size:13px;margin-top:3px;">${statutLabel[m.statut]||m.statut}</div>
      </div>
    </div>
    <div style="height:1px;background:var(--border);margin-bottom:12px;"></div>
    ${m.section ? `<div style="font-size:13px;margin-bottom:6px;">🛡️ Section: <strong>${m.section.nom}</strong></div>` : ''}
    ${evaluationsHtml}
    <div style="font-size:13px;margin-bottom:6px;">📋 Charte: ${m.charte_signee ? '✅ Signée' : '❌ Non signée'}</div>
    <div style="font-size:13px;">💶 Cartage: ${m.cotisation_a_jour ? '✅ À jour' : '⏳ En attente'}</div>
    <div id="profilReabonnementBtn" style="margin-top:10px;"></div>
    <div style="margin-top:10px;">
      <button class="btn btn-secondary" onclick="showPage('pageAmis');loadAmis()">👥 Mes amis</button>
    </div>
  `;
  afficherBoutonReabonnementProfil();
  try {
    const stats = await UL.getMesStats();
    document.getElementById('profilStats').innerHTML = `
      <div class="stat-card"><div class="stat-value">${stats.matchsTotal}</div><div class="stat-label">Matchs (saison)</div></div>
      <div class="stat-card"><div class="stat-value">${stats.presencesDomicile}</div><div class="stat-label">Présent domicile</div></div>
      <div class="stat-card"><div class="stat-value">${stats.presencesExterieur}</div><div class="stat-label">Présent extérieur</div></div>
      <div class="stat-card"><div class="stat-value">${stats.sessionsPresent}</div><div class="stat-label">Sessions tifo</div></div>`;
  } catch(e) {}

  // QR code membre — généré à la demande (lazy) au premier chargement,
  // chargé en parallèle non-bloquant : un échec ici ne doit jamais
  // empêcher l'affichage du reste du profil (cf. plan_qr_membre.md §3.2).
  try {
    const code = await UL.getOrCreateQrCodeMembre();
    document.getElementById('profilQrCard').innerHTML = `
      <div style="font-size:13px;font-weight:600;margin-bottom:10px;">Mon QR code</div>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(code)}" width="160" height="160">
      <p style="font-size:12px;color:var(--gris);margin-top:8px;">${esc(code)}</p>
      <p style="font-size:12px;color:var(--gris);margin-top:4px;">Présente ce code à un membre du bureau pour signaler ta présence ou récupérer ta commande.</p>
    `;
  } catch(e) {
    document.getElementById('profilQrCard').innerHTML = '';
  }

  chargerStatutNotifsProfil();
}

// Affiche, selon le statut réel détecté sur CET appareil : un bouton
// "Activer", une confirmation si déjà activées, ou une explication si
// impossible (iOS hors écran d'accueil, ou navigateur non compatible).
// _estIOSHorsEcranAccueil() est définie dans app.js (utilitaire partagé,
// aussi utilisée par la popup de bienvenue post-connexion).
async function chargerStatutNotifsProfil() {
  const el = document.getElementById('profilNotifsContainer');
  if (!el) return;

  if (_estIOSHorsEcranAccueil()) {
    el.innerHTML = `
      <div class="info-box" style="font-size:13px;">
        📲 Sur iPhone/iPad, les notifications nécessitent d'installer l'app sur l'écran d'accueil :
        appuie sur <strong>Partager</strong> dans Safari, puis <strong>Sur l'écran d'accueil</strong>.
      </div>`;
    return;
  }

  const statut = await UL.getStatutNotificationsPush();
  if (statut === 'non-supporte') {
    el.innerHTML = ''; // navigateur ne supportant pas le push — pas de message, pas d'action possible
  } else if (statut === 'refuse') {
    el.innerHTML = `
      <div class="info-box" style="font-size:13px;">
        🔕 Notifications bloquées pour cette app dans les réglages de ton navigateur/téléphone.
      </div>`;
  } else if (statut === 'active') {
    el.innerHTML = `<button class="btn btn-secondary" onclick="doDesactiverNotifs()">🔔 Notifications activées — désactiver</button>`;
  } else {
    el.innerHTML = `<button class="btn btn-primary" onclick="doActiverNotifs()">🔔 Activer les notifications</button>`;
  }
}

async function doActiverNotifs() {
  try {
    await UL.activerNotificationsPush();
    toast('Notifications activées ✅', 'success');
    chargerStatutNotifsProfil();
  } catch(e) { toast(e.message || 'Impossible d\'activer les notifications', 'error'); }
}

async function doDesactiverNotifs() {
  try {
    await UL.desactiverNotificationsPush();
    toast('Notifications désactivées', 'success');
    chargerStatutNotifsProfil();
  } catch(e) { toast(e.message || 'Impossible de désactiver les notifications', 'error'); }
}

// Bouton "Mon (ré)abonnement" affiché dans Profil — masqué si le Bureau/
// Admin a désactivé la page pour la saison (cf. toggleReabonnementAdmin,
// admin.js). Séparé de loadProfil() pour ne pas bloquer l'affichage du
// reste du profil si cet appel réseau est lent/échoue.
async function afficherBoutonReabonnementProfil() {
  const el = document.getElementById('profilReabonnementBtn');
  if (!el) return;
  try {
    const ouvert = await UL.getStatutReabonnement();
    el.innerHTML = ouvert
      ? `<button class="btn btn-secondary" onclick="showPage('pageReabonnement');loadReabonnement()">🎫 Mon (ré)abonnement</button>`
      : '';
  } catch(e) { el.innerHTML = ''; }
}

// ─── PAGE "MON (RÉ)ABONNEMENT" ─────────────────────────────────
// Le code de réabonnement sert sur le site externe de billetterie du
// Paris FC, pas dans cette app — le rôle de cette page est uniquement
// de retrouver et d'afficher le/les code(s) du membre (via son email),
// avec le lien vers billetterie.parisfc.fr et le guide PDF du club. Le
// bouton "J'ai terminé" est déclaratif (aucune vérification possible
// depuis l'app) — il marque juste cotisation_a_jour = true côté UL.
async function loadReabonnement() {
  const el = document.getElementById('reabonnementContainer');
  if (!el) return;
  el.innerHTML = '<div class="empty-state"><div>⏳</div>Chargement…</div>';
  try {
    const codes = await UL.getMesCodesReabonnement();
    if (!codes.length) {
      el.innerHTML = `
        <div class="empty-state"><div>❓</div>Aucun code trouvé pour ton adresse email.<br>
        Contacte le bureau si tu penses que c'est une erreur.</div>`;
      return;
    }
    el.innerHTML = `
      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:14px;margin-bottom:10px;">
          Utilise le code ci-dessous sur le site de billetterie du Paris FC pour activer ton (ré)abonnement.
          Le guide détaillé (PDF) explique chaque étape.
        </div>
        <a class="btn btn-primary" style="display:block;text-align:center;margin-bottom:8px;"
           href="https://billetterie.parisfc.fr/fr/access/activation-code" target="_blank" rel="noopener">
          🎟️ Accéder à la billetterie Paris FC
        </a>
        <a class="btn btn-secondary" style="display:block;text-align:center;"
           href="/ultras-lutetia/guide-code-activation.pdf" target="_blank" rel="noopener">
          📄 Voir le guide (PDF)
        </a>
      </div>
      ${codes.map(c => `
        <div class="card" style="margin-bottom:10px;">
          ${c.nom || c.prenom ? `<div style="font-size:12px;color:var(--gris);margin-bottom:4px;">Pour : ${esc(c.prenom||'')} ${esc(c.nom||'')}</div>` : ''}
          <div style="font-family:'Courier New',monospace;font-size:20px;font-weight:700;letter-spacing:1px;background:var(--fond2,rgba(255,255,255,.06));border-radius:8px;padding:10px;text-align:center;">
            ${esc(c.code)}
          </div>
        </div>`).join('')}
    `;
  } catch(e) {
    el.innerHTML = '<div class="empty-state"><div>⚠️</div>Impossible de charger tes codes</div>';
  }
}

// ─── MES AMIS ───────────────────────────────────────────────────
// Confidentialité (demande Remi 09/07/2026) : nomAfficheMembre (app.js)
// décide seule ce qui est montré (pseudo pour un membre simple, nom
// complet pour Bureau/Admin) — cette page ne fait jamais elle-même le
// choix d'afficher nom/prénom.
async function loadAmis() {
  document.getElementById('amisRecherche').value = '';
  document.getElementById('amisRechercheResultats').innerHTML = '';

  try {
    const [recues, envoyees, amis] = await Promise.all([
      UL.getDemandesAmitieRecues(),
      UL.getDemandesAmitieEnvoyees(),
      UL.getMesAmis(),
    ]);

    const secRecues = document.getElementById('amisDemandesRecuesSection');
    secRecues.style.display = recues.length ? 'block' : 'none';
    document.getElementById('amisDemandesRecues').innerHTML = recues.map(d => `
      <div class="card" style="margin-bottom:8px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span style="font-size:14px;">${esc(nomAfficheMembre(d.demandeur))}</span>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn btn-sm btn-success" onclick="doRepondreAmi('${d.id}',true,this)">✅ Accepter</button>
          <button class="btn btn-sm btn-danger" onclick="doRepondreAmi('${d.id}',false,this)">❌ Refuser</button>
        </div>
      </div>`).join('');

    const secEnvoyees = document.getElementById('amisDemandesEnvoyeesSection');
    secEnvoyees.style.display = envoyees.length ? 'block' : 'none';
    document.getElementById('amisDemandesEnvoyees').innerHTML = envoyees.map(d => `
      <div class="card" style="margin-bottom:8px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span style="font-size:14px;">${esc(nomAfficheMembre(d.destinataire))}</span>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <span class="badge badge-orange">⏳ En attente</span>
          <button class="btn btn-sm btn-secondary" onclick="doAnnulerDemandeAmi('${d.id}',this)">Annuler</button>
        </div>
      </div>`).join('');

    document.getElementById('amisListe').innerHTML = amis.length
      ? amis.map(m => `
        <div class="card" style="margin-bottom:8px;padding:12px;">
          <span style="font-size:14px;">${esc(nomAfficheMembre(m))}</span>
        </div>`).join('')
      : '<div class="empty-state"><div>👥</div>Aucun ami confirmé pour l\'instant</div>';
  } catch(e) { toast('Erreur chargement de tes amis', 'error'); }
}

async function chercherAmiPotentiel() {
  const q = document.getElementById('amisRecherche').value.trim();
  const el = document.getElementById('amisRechercheResultats');
  if (!q) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="empty-state"><div>⏳</div>Recherche…</div>';
  try {
    const resultats = await UL.rechercherMembrePourAmi(q);
    if (!resultats.length) { el.innerHTML = '<div style="font-size:13px;color:var(--gris);">Aucun résultat</div>'; return; }
    el.innerHTML = resultats.map(m => `
      <div class="card" style="margin-bottom:8px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span style="font-size:14px;">${esc(nomAfficheMembre(m))}</span>
        <button class="btn btn-sm btn-primary" style="flex-shrink:0;" onclick="doEnvoyerDemandeAmi('${m.id}',this)">➕ Ajouter</button>
      </div>`).join('');
  } catch(e) { el.innerHTML = '<div class="empty-state"><div>⚠️</div>Erreur de recherche</div>'; }
}

async function doEnvoyerDemandeAmi(membreId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    const res = await UL.envoyerDemandeAmitie(membreId);
    if (res.success) {
      toast(res.auto_acceptee ? 'Vous êtes maintenant amis ✅' : 'Demande envoyée ✅', 'success');
      loadAmis();
    } else {
      toast(res.error || 'Impossible d\'envoyer la demande', 'error');
      if (btn) { btn.disabled = false; btn.textContent = '➕ Ajouter'; }
    }
  } catch(e) {
    toast(e.message || 'Impossible d\'envoyer la demande', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '➕ Ajouter'; }
  }
}

async function doRepondreAmi(amitieId, accepter, btn) {
  if (btn) { btn.disabled = true; }
  try {
    await UL.repondreDemandeAmitie(amitieId, accepter);
    toast(accepter ? 'Ami ajouté ✅' : 'Demande refusée', 'success');
    loadAmis();
  } catch(e) { toast(e.message || 'Impossible de répondre à cette demande', 'error'); if (btn) btn.disabled = false; }
}

async function doAnnulerDemandeAmi(amitieId, btn) {
  if (btn) { btn.disabled = true; }
  try {
    await UL.annulerDemandeAmitie(amitieId);
    toast('Demande annulée', 'success');
    loadAmis();
  } catch(e) { toast(e.message || 'Impossible d\'annuler cette demande', 'error'); if (btn) btn.disabled = false; }
}

async function doChangeMdp() {
  const p1 = document.getElementById('newPassword').value;
  const p2 = document.getElementById('newPasswordConfirm').value;
  if (p1.length < 8) return toast('Mot de passe trop court', 'error');
  if (p1 !== p2) return toast('Les mots de passe ne correspondent pas', 'error');
  try { await UL.changePassword(p1); toast('Mot de passe modifié ✅', 'success'); closeModal('modalMdp'); }
  catch(e) { toast(e.message || 'Impossible de changer le mot de passe', 'error'); }
}

// ─── CHARTE (consultation, depuis Profil) ──────────────────────
// La signature elle-même se fait exclusivement via le gate bloquant
// (afficherCharteGate / signerCharteGate dans app.js) — cette page est
// accessible une fois la charte déjà signée, en lecture seule, pour
// permettre à un membre de relire le texte ou vérifier sa date de
// signature / validité.
async function loadCharte() {
  try {
    const { charteActive, signature } = await UL.checkConformiteCharte();
    const infoEl = document.getElementById('charteStatutInfo');
    if (!charteActive) {
      document.getElementById('charteTexte').textContent = 'Aucune charte active pour le moment.';
      if (infoEl) infoEl.textContent = '';
      return;
    }
    document.getElementById('charteTexte').innerHTML = renderCharteHTML(charteActive.contenu);
    if (infoEl) {
      const dateSignature = signature?.signed_at
        ? new Date(signature.signed_at).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })
        : null;
      const dateValidite = charteActive.date_fin_validite
        ? new Date(charteActive.date_fin_validite).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })
        : null;
      infoEl.innerHTML = [
        dateSignature ? `✅ Signée le ${dateSignature}` : '',
        dateValidite ? `Valable jusqu'au ${dateValidite}` : '',
      ].filter(Boolean).join(' · ');
    }
  } catch(e) {}
}

// ── HISTORIQUE D'ACHATS ────────────────────────────────────────
// Page accessible depuis le bouton "Mon historique d'achats" dans
// Profil. Affiche l'ensemble des achats du membre (déplacements,
// matos, sticks, cartage) triés par date décroissante.
// Chaque ligne affiche : emoji type · nom · date · montant · statut
// · référence HelloAsso (checkout_intent_id).
// Un bouton "📄 Attestation" est disponible pour les lignes payées.
async function loadHistorique() {
  const el = document.getElementById('historiqueContainer');
  if (!el) return;
  el.innerHTML = '<div class="empty-state"><div>⏳</div>Chargement…</div>';
  try {
    const achats = await UL.getMesAchats();
    if (!achats.length) {
      el.innerHTML = '<div class="empty-state"><div>🛒</div>Aucun achat pour le moment</div>';
      return;
    }

    const statutLabel = {
      paye_ha: '✅ Payé (HelloAsso)', paye_cash: '✅ Payé (cash)',
      precommande_validee: '✅ Précommande validée',
      en_attente: '⏳ En attente', refuse: '❌ Refusé',
      annulee: '🚫 Annulée', annule: '🚫 Annulée',
      rembourse: '↩️ Remboursé', valide: '✅ Validé',
      paye: '✅ Payé',
    };

    const isPaye = s => ['paye_ha','paye_cash','precommande_validee','valide','paye'].includes(s);

    el.innerHTML = achats.map(a => {
      const date = new Date(a.date).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
      // ⚠️ FIX 17/07/2026 (bug rapporté par Remi : montants affichés 100×
      // trop petits, ex. 15 € → 0,15 €) : getMesAchats() (supabase-client.js)
      // renvoie déjà un montant en EUROS pour les 4 types (deplacement,
      // matos, stick, cartage — cf. commandes.total, sticks_catalogue.prix,
      // cartage_catalogue.prix, deplacements.prix_total, tous saisis en
      // euros côté admin, jamais en centimes). La division par 100
      // ci-dessous supposait à tort un stockage en centimes — retirée.
      const montant = a.montant != null ? `${Number(a.montant).toFixed(2).replace('.',',')} €` : '';
      const statut = statutLabel[a.statut] || a.statut || '';
      // ⚠️ FIX 17/07/2026 (demande Remi) : numero_commande_ha (numéro de
      // commande définitif HelloAsso, capturé à la confirmation du
      // paiement — cf. supabase-client.js/getMesAchats) affiché en
      // priorité, car c'est LE numéro visible sur le reçu HelloAsso du
      // membre (ex: "Commande n°188000117"). checkout_intent_id (ID de
      // l'intention de paiement, capturé à la CRÉATION, différent du
      // numéro final) reste en repli pour les paiements antérieurs à cet
      // ajout, où numero_commande_ha est encore null.
      const refNumero = a.numero_commande_ha || a.checkout_intent_id;
      const ref = refNumero ? `<span style="font-size:10px;color:var(--gris);">Réf. HelloAsso : ${refNumero}</span>` : '';
      const attestBtn = isPaye(a.statut) ? `<button class="btn btn-sm btn-secondary" style="margin-top:8px;" onclick="genererAttestation('${a.id}','${a.type}','${esc(a.nom)}','${date}','${montant}','${refNumero||''}')">📄 Attestation</button>` : '';
      return `
    <div class="card" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:15px;">${a.emoji} ${esc(a.nom)}</div>
          <div style="font-size:12px;color:var(--gris);margin-top:2px;">${date}${montant ? ' · ' + montant : ''}</div>
          <div style="font-size:12px;margin-top:2px;">${statut}</div>
          ${ref ? `<div style="margin-top:4px;">${ref}</div>` : ''}
        </div>
        <div style="font-size:11px;color:var(--bleu-clair);white-space:nowrap;">${a.type}</div>
      </div>
      ${attestBtn}
    </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = '<div class="empty-state"><div>⚠️</div>Impossible de charger l\'historique</div>';
    console.error('loadHistorique', e);
  }
}

// Génère une attestation de paiement simple en HTML imprimable et
// ouvre une nouvelle fenêtre pour impression/sauvegarde PDF.
function genererAttestation(id, type, nom, date, montant, refHelloAsso) {
  const m = UL.getCurrentMembre();
  const nomMembre = m ? `${m.prenom || ''} ${m.nom || ''}`.trim() : 'Membre';
  const emailMembre = m?.email || '';
  const typeLabel = { deplacement:'Déplacement', matos:'Matos', stick:'Stick', cartage:'Cartage' };

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Attestation de paiement - Ultras Lutetia</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; color: #111; }
    h1 { color: #1A56DB; font-size: 22px; border-bottom: 2px solid #1A56DB; padding-bottom: 8px; }
    .logo { font-size: 32px; text-align: center; margin-bottom: 8px; }
    .asso { text-align: center; font-weight: bold; font-size: 18px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    td { padding: 8px 12px; border: 1px solid #ddd; font-size: 14px; }
    td:first-child { font-weight: bold; background: #f5f7ff; width: 40%; }
    .footer { font-size: 11px; color: #888; margin-top: 24px; text-align: center; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <div class="logo">🎭</div>
  <div class="asso">Ultras Lutetia</div>
  <h1>Attestation de paiement</h1>
  <table>
    <tr><td>Membre</td><td>${nomMembre}</td></tr>
    ${emailMembre ? `<tr><td>Email</td><td>${emailMembre}</td></tr>` : ''}
    <tr><td>Type</td><td>${typeLabel[type] || type}</td></tr>
    <tr><td>Article / Événement</td><td>${nom}</td></tr>
    <tr><td>Date</td><td>${date}</td></tr>
    <tr><td>Montant</td><td>${montant || 'N/A'}</td></tr>
    ${refHelloAsso ? `<tr><td>Réf. HelloAsso</td><td>${refHelloAsso}</td></tr>` : ''}
  </table>
  <p style="font-size:13px;margin-top:16px;">Ce document atteste du paiement effectué par le membre ci-dessus dans le cadre de l'activité des <strong>Ultras Lutetia</strong>, groupe de supporters du Paris FC.</p>
  <div class="footer">
    Document généré le ${new Date().toLocaleDateString('fr-FR')} · Ultras Lutetia — Paris FC<br>
    Ce document n'a pas valeur de reçu fiscal.
  </div>
  <br>
  <button onclick="window.print()">🖨️ Imprimer / Sauvegarder en PDF</button>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
  else toast('Autorisez les popups pour générer l\'attestation', 'warning');
}
