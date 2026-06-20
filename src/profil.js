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
    sympathisant:'💙 Sympathisant', draft:'🚀 Draft', confirme:'🏅 Confirmé',
    membre_cellule:'🛡️ Membre Cellule', bureau:'🏆 Bureau', admin:'⚙️ Admin'
  };

  // Catégories d'évaluation pertinentes pour ce membre :
  // comité (sympa ou draft selon statut actuel) + tifo/déplacement s'il a une note dans ces catégories.
  let evaluations = {};
  try { evaluations = await UL.getEvaluationsMembre(m.id); } catch(e) {}

  const categoriesAAfficher = [];
  if (m.statut === 'sympathisant' && evaluations.comite_sympa) categoriesAAfficher.push('comite_sympa');
  if (m.statut === 'draft' && evaluations.comite_draft) categoriesAAfficher.push('comite_draft');
  if (evaluations.tifo) categoriesAAfficher.push('tifo');
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
    <div style="font-size:13px;">💶 Cotisation: ${m.cotisation_a_jour ? '✅ À jour' : '⏳ En attente'}</div>
  `;
  try {
    const stats = await UL.getMesStats();
    document.getElementById('profilStats').innerHTML = `
      <div class="stat-card"><div class="stat-value">${stats.sessionsPresent}</div><div class="stat-label">Présences</div></div>
      <div class="stat-card"><div class="stat-value">${stats.tauxPresence}%</div><div class="stat-label">Assiduité</div></div>
      <div class="stat-card"><div class="stat-value">${stats.deplacements}</div><div class="stat-label">Déplacements</div></div>
      <div class="stat-card"><div class="stat-value">${stats.sessionsInscrites}</div><div class="stat-label">Inscriptions</div></div>`;
  } catch(e) {}
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
      const dateSignature = signature?.created_at
        ? new Date(signature.created_at).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })
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
