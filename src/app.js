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
// Accès à la page Tifos : Confirmé et au-dessus voient automatiquement,
// Draft seulement après validation explicite par cellule Tifo/Bureau/Admin
// (membre.valide_tifo), Sympathisant jamais. La cellule Tifo elle-même
// (et Bureau/Admin) ont toujours accès, indépendamment du statut, pour
// pouvoir gérer les sessions.
function peutVoirTifos(membre) {
  if (!membre) return false;
  if (hasCelluleTifo(membre)) return true;
  if (membre.statut === 'confirme') return true;
  if (membre.statut === 'draft') return !!membre.valide_tifo;
  return false;
}

// ─── Confirmation inscription ─────────────────────────────────
function showConfirmInscription(sessionId) {
  currentSessionId = sessionId;
  const btn = document.getElementById('btnConfirmerInscription');
  if (btn) btn.setAttribute('data-session-id', sessionId);
  showModal('modalConfirmInscription');
}

// ─── State ───────────────────────────────────────────────────
let currentSessionId = null;
let currentDeplId = null;
let allMembres = [];


// ─── Init ────────────────────────────────────────────────────

// Déclenché par supabase-client.js dès que le SDK émet l'événement
// PASSWORD_RECOVERY (clic sur le lien reçu par email). Plus fiable que de
// lire window.location.hash nous-mêmes : le SDK le parse et le nettoie tout
// seul, parfois avant que notre propre code n'ait eu la main.
// Peut se déclencher avant que le DOM soit complètement prêt (le listener
// est attaché dès l'exécution de supabase-client.js) — chaque accès DOM
// est donc protégé, et on réessaie après DOMContentLoaded si besoin.
let appDejaInitialisee = false;
function appliquerAffichageResetMdp() {
  const loginPage = document.getElementById('loginPage');
  const appContainer = document.getElementById('appContainer');
  const champNew = document.getElementById('resetMdpNew');
  const champConfirm = document.getElementById('resetMdpConfirm');
  if (!loginPage || !appContainer || !champNew || !champConfirm) return false;

  hideLoading();
  loginPage.style.display = 'flex';
  appContainer.style.display = 'none';
  champNew.value = '';
  champConfirm.value = '';
  showModal('modalResetMdp');
  return true;
}

let recoveryEnAttente = false;
window.UL_ON_PASSWORD_RECOVERY = function() {
  recoveryEnAttente = true;
  // Si l'app a déjà fini son initialisation normale (showApp/showLoginPage
  // déjà exécuté) au moment où cet événement arrive, on rattrape tout de
  // suite. Sinon, DOMContentLoaded s'en chargera après UL.initSession().
  if (appDejaInitialisee) appliquerAffichageResetMdp();
};

document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/ultras-lutetia/sw.js').catch(() => {});
  }

  showLoading();
  const { membre } = await UL.initSession();
  hideLoading();
  window.history.replaceState({}, '', window.location.pathname);

  // PASSWORD_RECOVERY a pu arriver pendant ou après UL.initSession() ci-dessus.
  // Dans tous les cas, le modal de reset prime sur l'affichage normal.
  if (recoveryEnAttente) {
    appliquerAffichageResetMdp();
    appDejaInitialisee = true;
    return;
  }

  appDejaInitialisee = true;
  membre ? showApp(membre) : showLoginPage();
});

// ─── Auth ────────────────────────────────────────────────────
function showLoginPage() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
}
function showLogin() {
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('inscriptionForm').style.display = 'none';
}
function showInscription() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('inscriptionForm').style.display = 'block';
}
async function doLogin() {
  const pseudo = document.getElementById('loginTelegram').value.trim();
  const pwd = document.getElementById('loginPassword').value;
  if (!pseudo || !pwd) return toast('Remplis tous les champs', 'error');
  try {
    showLoading();
    const { membre } = await UL.loginByTelegram(pseudo, pwd);
    hideLoading();
    showApp(membre);
  } catch(e) { hideLoading(); toast(e.message || 'Erreur de connexion', 'error'); }
}

// ─── Mot de passe oublié ───────────────────────────────────────
function ouvrirModalMdpOublie() {
  document.getElementById('mdpOublieTelegram').value = document.getElementById('loginTelegram').value.trim();
  showModal('modalMdpOublie');
}
async function doDemandeResetMdp() {
  const pseudo = document.getElementById('mdpOublieTelegram').value.trim();
  const email = document.getElementById('mdpOublieEmail').value.trim();
  if (!pseudo) return toast('Indique ton pseudo Telegram', 'error');
  if (!email || !email.includes('@')) return toast('Indique l\u2019email de ton compte', 'error');
  try {
    showLoading();
    await UL.demanderResetMdp(pseudo, email);
    hideLoading();
    closeModal('modalMdpOublie');
    toast('Si ces informations correspondent à un compte, un email vient d\u2019être envoyé \u2705', 'success', 5000);
  } catch(e) {
    hideLoading();
    // Message volontairement générique — ne pas confirmer/infirmer si pseudo/email correspondent
    closeModal('modalMdpOublie');
    toast('Si ces informations correspondent à un compte, un email vient d\u2019être envoyé \u2705', 'success', 5000);
  }
}
async function doResetMdp() {
  const p1 = document.getElementById('resetMdpNew').value;
  const p2 = document.getElementById('resetMdpConfirm').value;
  if (p1.length < 8) return toast('Mot de passe trop court (8 min)', 'error');
  if (p1 !== p2) return toast('Les mots de passe ne correspondent pas', 'error');
  try {
    showLoading();
    await UL.changePassword(p1);
    await UL.logout();
    hideLoading();
    closeModal('modalResetMdp');
    toast('Mot de passe modifié \u2705 — reconnecte-toi', 'success', 4000);
    showLoginPage();
    showLogin();
  } catch(e) { hideLoading(); toast(e.message || 'Impossible de modifier le mot de passe', 'error'); }
}
async function doInscription() {
  const prenom = document.getElementById('regPrenom').value.trim();
  const nom = document.getElementById('regNom').value.trim();
  const pseudo = document.getElementById('regTelegram').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const ville = document.getElementById('regVille').value.trim();
  const codePostal = document.getElementById('regCodePostal').value.trim();
  const pwd = document.getElementById('regPassword').value;
  const rgpd = document.getElementById('regRgpd').checked;
  if (!prenom || !nom || !pseudo || !pwd || !email) return toast('Champs obligatoires manquants (email requis)', 'error');
  if (!email.includes('@')) return toast('Email invalide', 'error');
  if (pwd.length < 8) return toast('Mot de passe trop court (8 min)', 'error');
  if (!rgpd) return toast('Accepte les conditions RGPD', 'error');
  try {
    showLoading();
    await UL.inscription({ prenom, nom, pseudoTelegram: pseudo, email, ville, codePostal, password: pwd });
    hideLoading();
    toast('Compte créé ✅ — Un email de confirmation t\'a été envoyé. Vérifie ta boîte mail (et tes spams) avant de te connecter.', 'success', 8000);
    showLogin();
  } catch(e) { hideLoading(); toast(e.message || 'Erreur inscription', 'error'); }
}
async function doLogout() {
  try {
    await UL.logout();
  } catch(e) {
    console.error('Erreur déconnexion:', e);
  } finally {
    showLoginPage();
  }
}

// ─── App init + droits ────────────────────────────────────────
async function showApp(membre) {
  document.getElementById('loginPage').style.display = 'none';

  // Membre non encore validé par le bureau
  if (!membre.actif) {
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('loginPage').innerHTML = `
      <div style="text-align:center;padding:40px 24px;max-width:400px;margin:auto;">
        <img src="logo_ul.png" alt="Ultras Lutetia" style="width:80px;margin-bottom:24px;">
        <h2 style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:.05em;margin-bottom:16px;">Compte en attente</h2>
        <div class="info-box" style="text-align:left;margin-bottom:24px;">
          \u2705 Ton adresse email a bien \u00e9t\u00e9 confirm\u00e9e.<br><br>
          \u23f3 Ton compte est en cours de validation par le bureau des Ultras Lutetia. Tu recevras un email d\u00e8s que ton acc\u00e8s sera activ\u00e9.
        </div>
        <button class="btn btn-secondary" onclick="doLogout()">Se d\u00e9connecter</button>
      </div>`;
    return;
  }

  document.getElementById('appContainer').style.display = 'block';
  document.getElementById('headerUser').textContent = '@' + membre.pseudo_telegram;

  // Appliquer droits selon statut
  applyRights(membre);

  // Charte : blocage total tant que la charte ACTIVE en cours de validité
  // n'a pas été signée par ce membre. Ne se fie jamais au seul flag
  // dénormalisé membre.charte_signee (qui ne distingue pas une charte
  // expirée d'une charte toujours valide) — voir checkConformiteCharte().
  const { conforme, charteActive } = await UL.checkConformiteCharte();
  if (!conforme) {
    await afficherCharteGate(charteActive);
    return;
  }
  document.getElementById('charteGate').style.display = 'none';

  await loadAccueil();
}

// ─── Rendu visuel de la charte (parsing du texte structuré) ────
// Le texte de la charte suit un format prévisible : des sections qui
// commencent par "Article N · Titre" (ou "Article N – Titre"), suivies
// de paragraphes, avec parfois un bloc "Point d'attention : ...".
// Cette fonction transforme ce texte brut en HTML avec icône par
// article et encadré dédié pour "Point d'attention" — partagée entre
// le gate bloquant et la page de consultation (Profil).
const CHARTE_ICONES = {
  1: '👑', 2: '🚫', 3: '👔', 4: '🍺', 5: '🏟️',
  6: '🚌', 7: '🎨', 8: '📈', 9: '🛡️', 10: '🤝', 11: '✍️',
};

function renderCharteHTML(texteBrut) {
  if (!texteBrut) return '';
  // Découpe sur les en-têtes d'article, en gardant le séparateur grâce
  // à un groupe capturant dans le split.
  const regexArticle = /(Article\s+(\d+)\s*[·–-]\s*[^\n]+)/g;
  const morceaux = texteBrut.split(regexArticle).filter(Boolean);

  // Si le texte ne matche pas le format attendu (contenu modifié à la
  // main sans suivre la convention), on retombe sur un rendu simple en
  // paragraphes plutôt que de planter ou d'afficher du vide.
  if (morceaux.length <= 1) {
    return texteBrut.split(/\n\s*\n/).map(p =>
      `<p style="margin-bottom:14px;white-space:pre-wrap;">${esc(p.trim())}</p>`
    ).join('');
  }

  let html = '';
  // Tout texte avant le premier "Article" (rare, mais on ne le perd pas).
  if (morceaux[0] && !/^Article\s+\d+/.test(morceaux[0].trim())) {
    html += `<p style="margin-bottom:14px;color:var(--gris);">${esc(morceaux.shift().trim())}</p>`;
  }

  for (let i = 0; i < morceaux.length; i += 3) {
    const titreComplet = morceaux[i];   // "Article N · Titre"
    const numero = morceaux[i + 1];
    const corps = (morceaux[i + 2] || '').trim();
    const icone = CHARTE_ICONES[numero] || '📄';
    const titre = titreComplet.replace(/^Article\s+\d+\s*[·–-]\s*/, '');

    // Le bloc "Point d'attention" est mis en évidence à part s'il existe.
    const pointAttentionMatch = corps.match(/Point d'attention\s*:\s*([\s\S]+?)(?=\n\n|$)/);
    let corpsSansPoint = corps;
    let pointAttentionHtml = '';
    if (pointAttentionMatch) {
      corpsSansPoint = corps.slice(0, pointAttentionMatch.index).trim();
      pointAttentionHtml = `
        <div style="margin-top:10px;padding:10px 12px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;display:flex;gap:8px;align-items:flex-start;">
          <span style="flex-shrink:0;">⚠️</span>
          <span style="font-size:12.5px;line-height:1.6;color:#FCD34D;">${esc(pointAttentionMatch[1].trim())}</span>
        </div>`;
    }

    const paragraphes = corpsSansPoint.split(/\n\s*\n/).filter(p => p.trim())
      .map(p => `<p style="margin-bottom:10px;white-space:pre-wrap;">${esc(p.trim())}</p>`).join('');

    html += `
      <div style="margin-bottom:20px;padding:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span style="font-size:20px;flex-shrink:0;">${icone}</span>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:.04em;">Article ${numero} · ${esc(titre)}</div>
        </div>
        <div style="font-size:13px;line-height:1.7;color:var(--blanc-dim);">${paragraphes}</div>
        ${pointAttentionHtml}
      </div>`;
  }
  return html;
}

// ─── Charte Gate (blocage plein écran) ─────────────────────────
async function afficherCharteGate(charteActive) {
  document.getElementById('appContainer').style.display = 'none';
  document.getElementById('charteGate').style.display = 'flex';
  const texteEl = document.getElementById('charteGateTexte');
  const sousTitreEl = document.getElementById('charteGateSousTitre');
  const checkbox = document.getElementById('charteGateAccept');
  const btn = document.getElementById('btnSignerCharteGate');
  checkbox.checked = false;
  checkbox.disabled = true;
  btn.disabled = true;
  if (!charteActive) {
    texteEl.textContent = 'Aucune charte active n\'est configurée pour le moment. Contacte le bureau.';
    sousTitreEl.textContent = '';
    return;
  }
  sousTitreEl.textContent = 'Lis attentivement jusqu\'en bas avant de signer.';
  texteEl.innerHTML = renderCharteHTML(charteActive.contenu);
  document.getElementById('pageCharte')._charteIdGate = charteActive.id; // réutilisé par signerCharteGate

  // Si le contenu ne déborde pas (écran large, texte court), il n'y aura
  // jamais d'événement de scroll pour débloquer la checkbox — on vérifie
  // donc aussi une fois le texte injecté, après layout. Un seul
  // requestAnimationFrame n'est pas toujours suffisant (police web pas
  // encore appliquée, logo pas encore chargé → scrollHeight sous-évalué
  // au moment du calcul) : on revérifie après un court délai, et on
  // re-vérifie aussi au redimensionnement (rotation mobile, etc.), tant
  // que la checkbox n'est pas débloquée.
  if (window._charteResizeHandler) window.removeEventListener('resize', window._charteResizeHandler);
  const recheck = () => checkCharteScroll(texteEl);
  window._charteResizeHandler = recheck;
  requestAnimationFrame(recheck);
  setTimeout(recheck, 300);
  window.addEventListener('resize', recheck);
}

function checkCharteScroll(el) {
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
    // Le scroll peut venir soit du gate, soit de l'ancienne page (les deux
    // partagent ce handler par cohérence, mais seul le gate a une checkbox
    // à débloquer aujourd'hui).
    const cbGate = document.getElementById('charteGateAccept');
    if (cbGate && el.id === 'charteGateTexte') {
      cbGate.disabled = false;
      const wrap = document.getElementById('charteGateCheckWrap');
      if (wrap) {
        wrap.style.cursor = 'pointer';
        wrap.onclick = () => { cbGate.checked = !cbGate.checked; document.getElementById('btnSignerCharteGate').disabled = !cbGate.checked; };
      }
      cbGate.onchange = () => { document.getElementById('btnSignerCharteGate').disabled = !cbGate.checked; };
      // Plus besoin de réécouter le resize une fois débloqué.
      if (window._charteResizeHandler) {
        window.removeEventListener('resize', window._charteResizeHandler);
        window._charteResizeHandler = null;
      }
    }
  }
}

async function signerCharteGate() {
  const charteId = document.getElementById('pageCharte')._charteIdGate;
  if (!charteId) return;
  try {
    await UL.signerCharte(charteId);
    toast('Charte signée ✅', 'success');
    document.getElementById('charteGate').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    await loadAccueil();
  } catch(e) { toast(e.message || 'Impossible de signer la charte', 'error'); }
}

function applyRights(membre) {
  // Boutons contextuels pages existantes
  if (hasCelluleTifo(membre)) document.getElementById('btnCreerTifo').style.display = 'block';
  if (hasCelluleDepl(membre)) document.getElementById('btnCreerDepl').style.display = 'block';
  if (isBureau(membre)) document.getElementById('btnPublierAnnonce').style.display = 'block';
  if (peutValiderInscriptions(membre)) document.getElementById('demandesSection').style.display = 'block';

  // Onglet Admin
  if (isCellule(membre)) {
    document.getElementById('nav6').style.display = 'flex';
  }

  // Sections Admin page
  if (isBureau(membre)) {
    el('adminSectionMembres').style.display = 'block';
    el('adminSectionCalendrier').style.display = 'block';
    el('adminSectionCharte').style.display = 'block';
  }
  if (hasCelluleDepl(membre))   el('adminSectionDepl').style.display = 'block';
  if (hasCelluleTifo(membre))   el('adminSectionTifos').style.display = 'block';
  if (hasCelluleMatos(membre))  el('adminSectionMatos').style.display = 'block';
  if (hasCelluleSticks(membre)) el('adminSectionSticks').style.display = 'block';
  if (isCellule(membre))        el('adminSectionStats').style.display = 'block';

  // Sections legacy Profil (rétrocompat)
  if (isBureau(membre)) {
    el('sectionAdmin').style.display = 'block';
    el('sectionStats').style.display = 'none';
  } else if (isCellule(membre)) {
    el('sectionStats').style.display = 'block';
  }
}
function el(id) { return document.getElementById(id); }

// peutValiderInscriptions défini dans les helpers droits

// ─── Navigation ───────────────────────────────────────────────
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById(pageId);
  if (pg) pg.classList.add('active');
  // Nav active
  const map = {
    pageAccueil:0, pageCalendrier:1, pageDeplacements:2,
    pageTifos:3, pageBoutique:4, pageProfil:5, pageAdmin:6,
    // pages secondaires → highlight parent
    pageMembres:6, pageStats:6, pageCharte:5, pageCartage:6, pageDemandesAdmin:6, pageGererCharte:6
  };
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const idx = map[pageId];
  if (idx !== undefined) {
    const navEl = document.getElementById('nav'+idx);
    if (navEl) navEl.classList.add('active');
  }
  // Lazy load
  if (pageId === 'pageCalendrier') loadCalendrier();
  if (pageId === 'pageTifos') loadTifos();
  if (pageId === 'pageDeplacements') loadDeplacements();
  if (pageId === 'pageBoutique') loadBoutique();
  if (pageId === 'pageProfil') loadProfil();
  if (pageId === 'pageMembres') loadMembres();
  if (pageId === 'pageStats') loadStats();
  if (pageId === 'pageCharte') loadCharte();
  if (pageId === 'pageGererCharte') loadGererCharte();
  if (pageId === 'pageCartage') loadCartage();
  if (pageId === 'pageDemandesAdmin') loadDemandesAdmin();
  // Scroll top
  window.scrollTo(0,0);
}

// ─── ACCUEIL ──────────────────────────────────────────────────
async function loadAccueil() {
  // Annonces
  try {
    const annonces = await UL.getAnnonces();
    document.getElementById('annoncesContainer').innerHTML = annonces.slice(0,2).map(a => `
      <div class="info-box ${a.categorie === 'urgent' ? '' : a.categorie === 'info' ? '' : 'success'}">
        <strong>${a.titre}</strong><br>
        <span style="font-size:13px;">${a.contenu}</span>
      </div>`).join('');
  } catch(e) {}
  // Sessions (visibles seulement si le membre a le droit de voir les tifos)
  try {
    const m = UL.getCurrentMembre();
    const el = document.getElementById('tifosAccueil');
    if (!peutVoirTifos(m)) {
      el.innerHTML = m?.statut === 'draft'
        ? '<p style="color:var(--gris);font-size:14px;">🔒 Réservé aux Draft validés — contacte la cellule Tifo.</p>'
        : '<p style="color:var(--gris);font-size:14px;">🔒 Réservé aux Confirmés et Draft.</p>';
    } else {
      const sessions = await UL.getUpcomingSessions();
      el.innerHTML = sessions.length
        ? sessions.slice(0,2).map(s => renderTifoCard(s, 'acc_')).join('')
        : '<p style="color:var(--gris);font-size:14px;">Aucun tifo à venir</p>';
      await refreshTifosActions(sessions.slice(0,2), 'acc_');
    }
  } catch(e) {}
  // Déplacement
  try {
    const depls = await UL.getDeplacements(true);
    const el = document.getElementById('deplAccueil');
    el.innerHTML = depls.length
      ? renderDeplCard(depls[0])
      : '<p style="color:var(--gris);font-size:14px;">Aucun déplacement à venir</p>';
  } catch(e) {}
  // Stats perso
  try {
    const stats = await UL.getMesStats();
    document.getElementById('mesStats').innerHTML = `
      <div class="stat-card"><div class="stat-value">${stats.sessionsPresent}</div><div class="stat-label">Présences</div></div>
      <div class="stat-card"><div class="stat-value">${stats.tauxPresence}%</div><div class="stat-label">Assiduité</div></div>
      <div class="stat-card"><div class="stat-value">${stats.deplacements}</div><div class="stat-label">Déplacements</div></div>
      <div class="stat-card"><div class="stat-value">${stats.sessionsInscrites}</div><div class="stat-label">Inscriptions</div></div>`;
  } catch(e) {}

  // Demandes en attente
  const m = UL.getCurrentMembre();
  if (peutValiderInscriptions(m)) {
    await loadDemandes();
  }
}

async function loadDemandes() {
  try {
    const tous = await UL.getAllMembres();
    const demandes = tous.filter(m => m.statut === 'sympathisant' && !m.actif);
    const badge = document.getElementById('demandesBadge');

    if (demandes.length > 0) {
      badge.textContent = demandes.length + ' en attente';
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }

    const el = document.getElementById('demandesListe');
    if (!demandes.length) {
      el.innerHTML = '<p style="color:var(--gris);font-size:13px;margin-bottom:16px;">Aucune demande en attente</p>';
      return;
    }

    el.innerHTML = demandes.map(m => `
      <div class="card" style="margin-bottom:8px;padding:14px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div class="avatar" style="width:38px;height:38px;font-size:14px;">${((m.prenom||'?')[0]+(m.nom||'?')[0]).toUpperCase()}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:15px;">${esc(m.prenom)} ${esc(m.nom)}</div>
            <div style="font-size:12px;color:var(--gris);">@${esc(m.pseudo_telegram)}</div>
            ${m.email ? `<div style="font-size:11px;color:var(--gris);">✉️ ${esc(m.email)}</div>` : ''}
            <div style="font-size:11px;color:var(--gris);">📅 ${new Date(m.created_at).toLocaleDateString('fr-FR')}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-secondary" onclick="validerDemande('${m.id}','sympathisant')">💙 Sympathisant</button>
          <button class="btn btn-sm btn-success" onclick="validerDemande('${m.id}','draft')">✅ Draft</button>
          <button class="btn btn-sm btn-primary" onclick="validerDemande('${m.id}','confirme')">⭐ Confirmé</button>
          <button class="btn btn-sm btn-danger" onclick="refuserDemande('${m.id}')">❌ Refuser</button>
        </div>
      </div>`).join('');
  } catch(e) { console.error('Erreur demandes:', e); }
}

async function validerDemande(membreId, nouveauStatut) {
  const label = nouveauStatut === 'draft' ? 'Draft' : nouveauStatut === 'sympathisant' ? 'Sympathisant' : 'Confirmé';
  try {
    const membre = await UL.updateMembre(membreId, { statut: nouveauStatut, actif: true });
    toast(`Membre accepté en tant que ${label} ✅`, 'success');
    if (membre && membre.email) {
      UL.envoyerEmailValidation(membre).catch(() => {});
    }
    await loadDemandes();
  } catch(e) { toast(e.message || 'Une erreur est survenue', 'error'); }
}

async function refuserDemande(membreId) {
  if (!confirm('Refuser et désactiver ce compte ?')) return;
  try {
    await UL.toggleBlocageMembre(membreId, false);
    toast('Demande refusée — compte désactivé', 'success');
    await loadDemandes();
  } catch(e) { toast(e.message || 'Une erreur est survenue', 'error'); }
}

// ═══════════════════════════════════════════════════════════════

// ─── UTILS ────────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function showModal(id) {
  document.getElementById(id).style.display = 'flex';
  if (id === 'modalMatchs') loadMatchsList();
}
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function closeModalOutside(e, id) { if (e.target === document.getElementById(id)) closeModal(id); }

function toast(msg, type='info', duree=2800) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duree);
}
let loadingEl = null;
function showLoading() {
  loadingEl = document.createElement('div');
  loadingEl.className = 'loading-overlay';
  loadingEl.innerHTML = '<div class="spinner"></div>';
  document.body.appendChild(loadingEl);
}
function hideLoading() { if (loadingEl) { loadingEl.remove(); loadingEl = null; } }

// ─── Exports globaux (utilisés par les modules) ───────────────
// State
window.getCurrentMembre = () => UL.getCurrentMembre();
// Ces variables sont déjà accessibles globalement (var/let au niveau du script)
// Les modules y accèdent directement car même scope global (pas de modules ES6)
