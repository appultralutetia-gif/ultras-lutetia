// ─── PROFIL ───────────────────────────────────────────────────
async function loadProfil() {
  const m = UL.getCurrentMembre();
  if (!m) return;
  const initiales = ((m.prenom||'?')[0]+(m.nom||'?')[0]).toUpperCase();
  const statutLabel = {
    sympathisant:'💙 Sympathisant', draft:'🚀 Draft', confirme:'🏅 Confirmé',
    membre_cellule:'🛡️ Membre Cellule', bureau:'🏆 Bureau', admin:'⚙️ Admin'
  };
  const etoiles = '⭐'.repeat(m.etoiles||0)+'☆'.repeat(3-(m.etoiles||0));
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
    <div style="font-size:13px;margin-bottom:6px;">${etoiles} Évaluation</div>
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

// ─── CHARTE ───────────────────────────────────────────────────
async function loadCharte() {
  try {
    const charte = await UL.getCharteActive();
    if (!charte) return;
    document.getElementById('charteTexte').textContent = charte.contenu;
    document.getElementById('pageCharte')._charteId = charte.id;
  } catch(e) {}
}
function checkCharteScroll(el) {
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
    const cb = document.getElementById('charteAccept');
    cb.disabled = false;
    // Rendre le wrapper cliquable aussi
    const wrap = document.getElementById('charteCheckWrap');
    if (wrap) {
      wrap.style.cursor = 'pointer';
      wrap.onclick = () => { cb.checked = !cb.checked; document.getElementById('btnSignerCharte').disabled = !cb.checked; };
    }
    cb.onchange = () => { document.getElementById('btnSignerCharte').disabled = !cb.checked; };
  }
}
async function signerCharte() {
  const charteId = document.getElementById('pageCharte')._charteId;
  if (!charteId) return;
  try {
    await UL.signerCharte(charteId);
    toast('Charte signée ✅', 'success');
    document.getElementById('charteAlert').style.display = 'none';
    showPage('pageAccueil');
  } catch(e) { toast('Impossible de signer la charte', 'error'); }
}

