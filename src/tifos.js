// ─── SESSIONS ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// Pizzas et boissons
const PIZZAS = [
  { id: 'margherita',  label: 'Margherita',                    emoji: '🍕' },
  { id: 'regina',      label: 'Regina (Jambon Champignon)',     emoji: '🍕' },
  { id: '4fromages',   label: '4 Fromages',                    emoji: '🍕' },
  { id: 'bellissima',  label: 'Bellissima (Viande, Chorizo, Poivrons)', emoji: '🍕' },
  { id: 'aucune',      label: 'Je ne mange pas',               emoji: '🚫' },
];
const PINTES = [
  { id: 'blonde',   label: 'Blonde',  emoji: '🍺' },
  { id: 'sans',     label: 'Sans pinte', emoji: '❌' },
];

async function refreshTifosActions(sessions, prefix='') {
  await Promise.all(sessions.map(s => loadTifoActions(s.id, null, prefix).catch(() => {})));
}

async function loadTifos() {
  const m = UL.getCurrentMembre();
  if (!peutVoirTifos(m)) {
    const message = m?.statut === 'draft'
      ? '<div>🔒</div>Les tifos sont réservés aux Confirmés et Draft validés.<br>Contacte un membre de la cellule Tifo pour demander l\'accès.'
      : '<div>🔒</div>Les tifos sont réservés aux Confirmés et Draft.';
    document.getElementById('tifosListe').innerHTML = `<div class="empty-state">${message}</div>`;
    const histEl = document.getElementById('tifosHistorique');
    if (histEl) histEl.innerHTML = '';
    return;
  }
  document.getElementById('tifosListe').innerHTML = '<div class="empty-state"><div>⏳</div>Chargement…</div>';
  try {
    const [sessions, past] = await Promise.all([
      UL.getUpcomingSessions(),
      UL.getPastSessions(),
    ]);
    document.getElementById('tifosListe').innerHTML = sessions.length
      ? sessions.map(s => renderTifoCard(s)).join('')
      : '<div class="empty-state"><div>📋</div>Aucun tifo à venir</div>';
    document.getElementById('tifosHistorique').innerHTML = past.length
      ? past.map(s => renderTifoCard(s)).join('')
      : '<div class="empty-state"><div>📋</div>Aucun historique</div>';
    await refreshTifosActions(sessions);
  } catch(e) { toast('Erreur chargement des tifos', 'error'); }
}

function renderTifoCard(s, prefix='') {
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
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);" id="tifoActions_${prefix}${s.id}">
      <div style="text-align:center;padding:8px;color:var(--gris);font-size:13px;">⏳</div>
    </div>

    <!-- Participants (visible par tous) -->
    <div style="margin-top:8px;">
      <button class="btn btn-secondary" style="width:100%;padding:8px;" onclick="toggleParticipants('${prefix}${s.id}', event)">
        👥 Voir les participants
      </button>
      <div id="participants_${prefix}${s.id}" style="display:none;margin-top:8px;"></div>
    </div>

    ${adminBar}
  </div>`;
}

async function loadTifoActions(sessionId, btn, prefix='') {
  const originalText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    const { session: s, monInscrit } = await UL.getSessionDetails(sessionId);
    const estInscrit  = !!monInscrit;
    const estPresent  = monInscrit?.statut === 'present';
    const isOpen      = s.statut === 'en_cours';
    const isPlanned   = s.statut === 'a_venir';
    const el          = document.getElementById('tifoActions_' + prefix + sessionId);
    let html = '';

    if (!estInscrit && isPlanned) {
      html = `<button class="btn btn-primary" style="width:100%;" onclick="showConfirmInscription('${s.id}')">
        S'inscrire${s.avec_pizza?' 🍕':''}</button>`;

    } else if (estInscrit && isPlanned) {
      html = `<div class="info-box" style="text-align:center;margin:0;">✅ Tu es inscrit(e)</div>`;
      if (s.lien_telegram) html += `
        <a href="${esc(s.lien_telegram)}" target="_blank" style="display:block;margin-top:8px;">
          <button class="btn btn-secondary" style="width:100%;">📲 Groupe Telegram</button>
        </a>`;

    } else if (estInscrit && isOpen && !estPresent) {
      html = `<button class="btn btn-success" style="width:100%;"
        onclick="ouvrirModalPresence('${s.id}', ${s.avec_pizza})">
        ✅ Confirmer ma présence</button>`;
      if (s.lien_telegram) html += `
        <a href="${esc(s.lien_telegram)}" target="_blank" style="display:block;margin-top:8px;">
          <button class="btn btn-secondary" style="width:100%;">📲 Groupe Telegram</button>
        </a>`;

    } else if (estPresent) {
      html = `<div class="info-box success" style="text-align:center;margin:0;">✅ Présence validée</div>`;
      if (s.lien_telegram) html += `
        <a href="${esc(s.lien_telegram)}" target="_blank" style="display:block;margin-top:8px;">
          <button class="btn btn-secondary" style="width:100%;">📲 Groupe Telegram</button>
        </a>`;

    } else if (s.statut === 'terminee') {
      html = `<div style="text-align:center;font-size:13px;color:var(--gris);">Tifo terminé</div>`;
    }

    if (el) {
      el.innerHTML = html || `<div style="font-size:13px;color:var(--gris);text-align:center;">Aucune action disponible</div>`;
    } else if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    } else {
      // DOM pas encore prêt — réessayer dans 300ms
      setTimeout(() => {
        const el2 = document.getElementById('tifoActions_' + prefix + sessionId);
        if (el2) el2.innerHTML = html || '';
      }, 300);
    }
  } catch(e) {
    console.error('loadSessionActions erreur:', sessionId, e);
    if (btn) { btn.disabled = false; btn.textContent = originalText || "S'inscrire"; }
    // Fallback : remettre un bouton cliquable si appel silencieux
    if (!btn) {
      const elErr = document.getElementById('tifoActions_' + prefix + sessionId);
      if (elErr) elErr.innerHTML = `<button class="btn btn-primary" style="width:100%;padding:8px;" onclick="loadTifoActions('${sessionId}', this)">S'inscrire</button>`;
    }
  }
}

// ── Modal présence (enrichi pizza + pinte) ─────────────────────
function ouvrirModalPresence(sessionId, avecPizza) {
  currentSessionId = sessionId;
  const modal = document.getElementById('modalPresence');

  // Construire le contenu dynamiquement selon avecPizza
  let pizzaHtml = '';
  if (avecPizza) {
    pizzaHtml = `
      <div class="form-group" style="margin-top:16px;">
        <label style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94A3B8;display:block;margin-bottom:10px;">Choix pizza</label>
        <div style="display:flex;flex-direction:column;gap:8px;" id="pizzaChoixContainer">
          ${PIZZAS.map(p => `
            <div onclick="selectPizza('${p.id}',this)" data-pizza="${p.id}"
              style="display:flex;align-items:center;gap:12px;padding:11px 14px;
                     background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.12);
                     border-radius:9px;cursor:pointer;transition:all .15s;">
              <span style="font-size:20px;">${p.emoji}</span>
              <span style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:.03em;color:#94A3B8;">${p.label}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="form-group" style="margin-top:16px;">
        <label style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94A3B8;display:block;margin-bottom:10px;">Pinte ?</label>
        <div style="display:flex;gap:8px;" id="pinteChoixContainer">
          ${PINTES.map(p => `
            <div onclick="selectPinte('${p.id}',this)" data-pinte="${p.id}"
              style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px 8px;
                     background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.12);
                     border-radius:9px;cursor:pointer;transition:all .15s;text-align:center;">
              <span style="font-size:18px;">${p.emoji}</span>
              <span style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;text-transform:uppercase;color:#94A3B8;">${p.label}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  document.getElementById('modalPresenceBody').innerHTML = `
    <p style="color:var(--gris);font-size:14px;margin-bottom:16px;">Entre le code 4 chiffres affiché par le responsable.</p>
    <div class="form-group">
      <input type="number" id="codePresence" placeholder="_ _ _ _" maxlength="4" inputmode="numeric"
        style="font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:.3em;text-align:center;">
    </div>
    ${pizzaHtml}
    <button class="btn btn-primary" style="margin-top:16px;" onclick="doValiderPresence(${avecPizza})">Valider</button>`;

  showModal('modalPresence');
}

function selectPizza(id, rowEl) {
  document.querySelectorAll('#pizzaChoixContainer [data-pizza]').forEach(el => {
    el.removeAttribute('data-selected');
    el.style.background = 'rgba(255,255,255,.07)';
    el.style.borderColor = 'rgba(255,255,255,.12)';
    el.querySelector('span:last-child').style.color = '#94A3B8';
  });
  rowEl.setAttribute('data-selected', '1');
  rowEl.style.background = 'rgba(26,86,219,.18)';
  rowEl.style.borderColor = '#1A56DB';
  rowEl.querySelector('span:last-child').style.color = '#E2E8F0';
}

function selectPinte(id, rowEl) {
  document.querySelectorAll('#pinteChoixContainer [data-pinte]').forEach(el => {
    el.removeAttribute('data-selected');
    el.style.background = 'rgba(255,255,255,.07)';
    el.style.borderColor = 'rgba(255,255,255,.12)';
    el.querySelector('span:last-child').style.color = '#94A3B8';
  });
  rowEl.setAttribute('data-selected', '1');
  rowEl.style.background = 'rgba(26,86,219,.18)';
  rowEl.style.borderColor = '#1A56DB';
  rowEl.querySelector('span:last-child').style.color = '#E2E8F0';
}

async function doValiderPresence(avecPizza = false) {
  const code = document.getElementById('codePresence').value;
  if (!code || code.length !== 4) return toast('Code à 4 chiffres requis', 'error');

  let pizza = null, pinte = null;
  if (avecPizza) {
    const pizzaEl = document.querySelector('#pizzaChoixContainer [data-pizza][data-selected]');
    const pinteEl = document.querySelector('#pinteChoixContainer [data-pinte][data-selected]');
    if (!pizzaEl) return toast('Choisis une pizza (ou "Je ne mange pas")', 'error');
    pizza = pizzaEl.dataset.pizza;
    pinte = pinteEl ? pinteEl.dataset.pinte : null; // facultatif
  }

  try {
    await UL.validerPresence(currentSessionId, code, pizza, pinte);
    toast('Présence validée ! ✅', 'success');
    closeModal('modalPresence');
    loadTifos();
    loadAccueil();
  } catch(e) { toast(e.message || 'Code incorrect', 'error'); }
}

// ── Inscrire / désinscrire ────────────────────────────────────
async function doInscrire(id, btn) {
  if (!id && btn) id = btn.getAttribute('data-session-id');
  if (!id) id = currentSessionId;
  if (!id) return toast('Erreur : tifo introuvable', 'error');
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    await UL.inscrire(id);
    toast('Inscription confirmée ✅', 'success');
    closeModal('modalConfirmInscription');
    // Mettre à jour uniquement la zone actions de ce tifo sans recharger toute la liste
    // Rafraîchir silencieusement la zone actions (sans passer de bouton)
    await loadTifoActions(id, null);
    await loadAccueil();
  } catch(e) {
    toast(e.message || 'Impossible de s\'inscrire', 'error');
    if (btn) { btn.disabled = false; btn.textContent = "S'inscrire"; }
  }
}
async function doDesinscrire(id) {
  try { await UL.desinscrire(id); toast('Désinscription effectuée', 'success'); loadTifos(); }
  catch(e) { toast(e.message || 'Impossible de se désinscrire', 'error'); }
}

// ── Admin : ouvrir / fermer / supprimer ──────────────────────
async function doOuvrirSession(id, e) {
  if (e) e.stopPropagation();
  try {
    const { code } = await UL.openSession(id);
    toast('Tifo ouvert ! Code : ' + code, 'success');
    loadTifos();
  } catch(e) { toast(e.message || 'Impossible d\'ouvrir le tifo', 'error'); }
}
async function doFermerSession(id, e) {
  if (e) e.stopPropagation();
  if (!confirm('Fermer ce tifo ?')) return;
  try { await UL.closeSession(id); toast('Tifo fermé', 'success'); loadTifos(); }
  catch(e) { toast('Impossible de fermer le tifo', 'error'); }
}
async function doSupprimerSession(id, e) {
  if (e) e.stopPropagation();
  if (!confirm('Supprimer définitivement ?')) return;
  try { await UL.deleteSession(id); toast('Session supprimée', 'success'); loadTifos(); }
  catch(e) { toast('Impossible de supprimer le tifo', 'error'); }
}

// ── Admin : voir inscrits ────────────────────────────────────
async function voirInscrits(id, nom, e) {
  if (e) e.stopPropagation();
  const m = UL.getCurrentMembre();
  try {
    const { inscrits } = await UL.getSessionDetails(id);
    const presents = inscrits.filter(i => i.statut === 'present');
    const statutLabel = { inscrit:'📋 Inscrit', present:'✅ Présent', absent:'❌ Absent' };
    document.getElementById('modalAdminSessionContent').innerHTML = `
      <h3 class="modal-title">👥 ${esc(nom)}</h3>
      <div style="font-size:13px;color:var(--gris);margin-bottom:12px;">✅ ${presents.length} présents · Total: ${inscrits.length}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
        <button class="btn btn-sm btn-secondary" onclick="copierListeComplete(${esc(JSON.stringify(inscrits.map(i=>({pseudo:i.membre?.pseudo_telegram||'?',prenom:i.membre?.prenom||'',nom:i.membre?.nom||'',statut:i.membre?.statut||'',section:i.membre?.section?.nom||'',presence:i.statut}))))})">📋 Liste complète</button>
      </div>
      ${inscrits.map(i => `
        <div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border);">
          <div class="avatar" style="width:30px;height:30px;font-size:11px;flex-shrink:0;">${(i.membre?.prenom||'?')[0]}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;">@${esc(i.membre?.pseudo_telegram||'?')}</div>
            <div style="font-size:11px;color:var(--gris);">${esc(i.membre?.prenom||'')} ${esc(i.membre?.nom||'')}${i.membre?.section?.nom?' · '+esc(i.membre.section.nom):''}</div>
          </div>
          <span class="badge ${i.statut==='present'?'badge-vert':i.statut==='absent'?'badge-rouge':'badge-bleu'}" style="font-size:10px;flex-shrink:0;">${statutLabel[i.statut]||i.statut}</span>
          ${hasCelluleTifo(m)?`<button class="btn btn-sm btn-danger" style="padding:4px 8px;font-size:11px;" onclick="doDesinscrireAdmin('${id}','${i.membre_id}','${esc(nom)}')">✕</button>`:''}
        </div>`).join('')}`;
    showModal('modalAdminSession');
  } catch(e) { toast('Impossible de charger les inscrits', 'error'); }
}

async function doDesinscrireAdmin(sessionId, membreId, nom) {
  if (!confirm('Désinscrire ce membre ?')) return;
  try {
    await UL.desinscrireMembreSession(sessionId, membreId);
    toast('Membre désinscrit ✅', 'success');
    voirInscrits(sessionId, nom, null);
    loadAdminTifos();
  } catch(e) { toast('Impossible de désinscrire le membre', 'error'); }
}

// ── Admin : commandes pizza ───────────────────────────────────
async function voirCommandesPizza(sessionId, nom, e) {
  if (e) e.stopPropagation();
  try {
    const { inscrits } = await UL.getSessionDetails(sessionId);
    const presents = inscrits.filter(i => i.statut === 'present');

    // Grouper par pizza
    const pizzaMap = {};
    const pinteMap = {};
    presents.forEach(i => {
      const pz = i.pizza || 'aucune';
      const pt = i.pinte || 'sans';
      if (!pizzaMap[pz]) pizzaMap[pz] = [];
      if (!pinteMap[pt]) pinteMap[pt] = [];
      pizzaMap[pz].push(i.membre?.prenom || i.membre?.pseudo_telegram || '?');
      pinteMap[pt].push(i.membre?.prenom || i.membre?.pseudo_telegram || '?');
    });

    const pizzaLabel = { margherita:'Margherita', regina:'Regina', '4fromages':'4 Fromages', bellissima:'Bellissima', aucune:'Je ne mange pas' };
    const pinteLabel = { blonde:'Blonde', sans:'Sans pinte' };

    const pizzaHtml = Object.entries(pizzaMap)
      .filter(([k]) => k !== 'aucune' || pizzaMap[k].length)
      .map(([k, noms]) => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border);">
          <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:15px;">
            🍕 ${pizzaLabel[k]||k} <span style="color:var(--bleu-clair);">×${noms.length}</span>
          </div>
          <div style="font-size:12px;color:var(--gris);margin-top:3px;">(${noms.join(', ')})</div>
        </div>`).join('');

    const pinteHtml = Object.entries(pinteMap)
      .filter(([k]) => k !== 'sans' || pinteMap[k].length)
      .map(([k, noms]) => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border);">
          <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:15px;">
            🍺 ${pinteLabel[k]||k} <span style="color:var(--bleu-clair);">×${noms.length}</span>
          </div>
          <div style="font-size:12px;color:var(--gris);margin-top:3px;">(${noms.join(', ')})</div>
        </div>`).join('');

    const texteCopie = [
      '🍕 PIZZAS',
      ...Object.entries(pizzaMap).map(([k,noms]) => `${pizzaLabel[k]||k} ×${noms.length} : ${noms.join(', ')}`),
      '',
      '🍺 PINTES',
      ...Object.entries(pinteMap).filter(([k]) => k !== 'sans').map(([k,noms]) => `${pinteLabel[k]||k} ×${noms.length} : ${noms.join(', ')}`),
    ].join('\n');

    document.getElementById('modalAdminSessionContent').innerHTML = `
      <h3 class="modal-title">🍕 Commandes — ${esc(nom)}</h3>
      <div style="font-size:13px;color:var(--gris);margin-bottom:12px;">${presents.length} présent${presents.length>1?'s':''}</div>
      <button class="btn btn-sm btn-secondary" style="margin-bottom:16px;" onclick="navigator.clipboard.writeText(${esc(JSON.stringify(texteCopie))}).then(()=>toast('Copié !','success'))">📋 Copier la liste</button>
      <div class="section-title" style="margin-bottom:8px;">Pizzas</div>
      ${pizzaHtml || '<p style="color:var(--gris);font-size:13px;">Aucune commande</p>'}
      <div class="section-title" style="margin-top:16px;margin-bottom:8px;">Pintes</div>
      ${pinteHtml || '<p style="color:var(--gris);font-size:13px;">Aucune pinte</p>'}`;
    showModal('modalAdminSession');
  } catch(e) { toast('Impossible de charger les commandes pizza', 'error'); }
}

// ── Participants (visible par tous) ──────────────────────────
async function toggleParticipants(sessionId, e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const el = document.getElementById('participants_' + sessionId);
  if (!el) return;
  if (el.style.display !== 'none') {
    el.style.display = 'none';
    btn.textContent = '👥 Voir les participants';
    return;
  }
  btn.textContent = '⏳ Chargement…';
  btn.disabled = true;
  // Retirer le prefix acc_ pour l'appel Supabase
  const realId = sessionId.replace(/^acc_/, '');
  try {
    const { inscrits } = await UL.getSessionDetails(realId);
    const statutEmoji = { inscrit:'📋', present:'✅', absent:'❌' };
    el.innerHTML = inscrits.length
      ? inscrits.map(i => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;">@${esc(i.membre?.pseudo_telegram||'?')}</div>
              <div style="color:var(--gris);font-size:11px;">${esc(i.membre?.prenom||'')} ${esc(i.membre?.nom||'')}</div>
            </div>
            <span class="badge ${i.statut==='present'?'badge-vert':i.statut==='absent'?'badge-rouge':'badge-bleu'}" style="font-size:10px;">
              ${statutEmoji[i.statut]||''} ${i.statut==='present'?'Présent':i.statut==='absent'?'Absent':'Inscrit'}
            </span>
          </div>`).join('')
      : '<div style="font-size:13px;color:var(--gris);text-align:center;padding:8px 0;">Aucun participant</div>';
    el.style.display = 'block';
    btn.textContent = '👥 Masquer les participants';
  } catch(err) {
    toast('Impossible de charger les participants', 'error');
    btn.textContent = '👥 Voir les participants';
  }
  btn.disabled = false;
}

// ── Copie listes ─────────────────────────────────────────────
function copierInscrits(pseudos) {
  const texte = pseudos.map((p,i) => `${i+1}. @${p}`).join('\n');
  navigator.clipboard.writeText(texte).then(() => toast('Liste Telegram copiée !', 'success'));
}
function copierListeComplete(membres) {
  const entete = 'Pseudo | Prénom Nom | Statut | Section | Présence';
  const lignes = membres.map(m => `@${m.pseudo} | ${m.prenom} ${m.nom} | ${m.statut} | ${m.section||'—'} | ${m.presence}`);
  navigator.clipboard.writeText([entete,...lignes].join('\n')).then(() => toast(`Liste copiée (${membres.length}) !`, 'success'));
}

// ── Créer / Modifier session ──────────────────────────────────
async function doCreerSession() {
  const data = {
    nom: document.getElementById('sNom').value.trim(),
    date: document.getElementById('sDate').value,
    heure: document.getElementById('sHeure').value || null,
    lieu: document.getElementById('sLieu').value,
    type_session: document.getElementById('sType').value,
    capacite_max: parseInt(document.getElementById('sCapacite').value) || null,
    lien_telegram: document.getElementById('sTelegram').value || null,
    avec_pizza: document.getElementById('sPizza').checked,
    description: document.getElementById('sDesc').value.trim() || null,
  };
  if (!data.nom || !data.date) return toast('Nom et date requis', 'error');
  try {
    await UL.createSession(data);
    toast('Session créée ✅', 'success');
    closeModal('modalCreerSession');
    loadTifos();
  } catch(e) { toast(e.message, 'error'); }
}

async function ouvrirModifierSession() {
  try {
    const sessions = await UL.getSessionsWithStats();
    const sel = document.getElementById('msSelectSession');
    sel.innerHTML = '<option value="">-- Sélectionner --</option>' +
      sessions.map(s => {
        const d = new Date(s.date).toLocaleDateString('fr-FR', {day:'numeric', month:'short'});
        return `<option value="${s.id}">${esc(s.nom)} — ${d}</option>`;
      }).join('');
    document.getElementById('msFormFields').style.display = 'none';
    showModal('modalModifierSession');
  } catch(e) { toast('Erreur chargement des tifos', 'error'); }
}

async function chargerSessionAModifier(id) {
  if (!id) { document.getElementById('msFormFields').style.display = 'none'; return; }
  try {
    const { session: s } = await UL.getSessionDetails(id);
    document.getElementById('msNom').value = s.nom || '';
    document.getElementById('msDate').value = s.date || '';
    document.getElementById('msHeure').value = s.heure ? s.heure.slice(0,5) : '';
    document.getElementById('msLieu').value = s.lieu || 'Paris Sud';
    document.getElementById('msType').value = s.type_session || 'Peinture';
    document.getElementById('msCapacite').value = s.capacite_max || '';
    document.getElementById('msTelegram').value = s.lien_telegram || '';
    document.getElementById('msPizza').checked = !!s.avec_pizza;
    document.getElementById('msDesc').value = s.description || '';
    document.getElementById('msFormFields').style.display = 'block';
  } catch(e) { toast('Erreur chargement session', 'error'); }
}

async function doModifierSession() {
  const id = document.getElementById('msSelectSession').value;
  if (!id) return toast('Sélectionne un tifo', 'error');
  const data = {
    nom: document.getElementById('msNom').value.trim(),
    date: document.getElementById('msDate').value,
    heure: document.getElementById('msHeure').value || null,
    lieu: document.getElementById('msLieu').value,
    type_session: document.getElementById('msType').value,
    capacite_max: parseInt(document.getElementById('msCapacite').value) || null,
    lien_telegram: document.getElementById('msTelegram').value || null,
    avec_pizza: document.getElementById('msPizza').checked,
    description: document.getElementById('msDesc').value.trim() || null,
  };
  if (!data.nom || !data.date) return toast('Nom et date requis', 'error');
  try {
    await UL.updateSession(id, data);
    toast('Session modifiée ✅', 'success');
    closeModal('modalModifierSession');
    loadTifos();
    loadAdminTifos();
  } catch(e) { toast(e.message || 'Erreur modification', 'error'); }
}

function loadAdminTifos() {
  if (document.getElementById('pageTifos')?.classList.contains('active')) loadTifos();
}

// ── Évaluation membres (Cellule Tifo) ──────────────────────────
// Placeholder : module complet (liste membres cellule Tifo + notation
// manuelle 🖌️/🖌️🖌️/🖌️🖌️🖌️) à construire — table evaluations déjà prête.
function ouvrirEvaluationMembresTifo() {
  toast('Module Évaluation membres — bientôt disponible 🖌️', 'info');
}
