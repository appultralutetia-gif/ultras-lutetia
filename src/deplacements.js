// ─── DÉPLACEMENTS ─────────────────────────────────────────────
async function loadDeplacements() {
  document.getElementById('deplacementsListe').innerHTML = '<div class="empty-state"><div>⏳</div>Chargement…</div>';
  try {
    // ⚠️ Refonte 09/07/2026 (demande Remi) : le découpage à venir/historique
    // se fait par STATUT effectif, pas par date — un déplacement "Fermé"
    // (ou "Annulé") va dans l'historique même si sa date est encore dans
    // le futur (ex: fermé manuellement en avance). Un seul appel (tous,
    // sans filtre de date), partitionné ensuite en JS.
    const tous = await UL.getDeplacements(false);
    const aVenir = tous.filter(d => !estHistoriqueDepl(d));
    const historique = tous.filter(estHistoriqueDepl);

    // Ouverts en premier dans "à venir" (le seul groupe qui peut encore
    // contenir un mélange ouvert/complet), chronologique dans chaque cas.
    aVenir.sort((a, b) => {
      const ao = statutEffectifDepl(a) === 'ouvert' ? 0 : 1;
      const bo = statutEffectifDepl(b) === 'ouvert' ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (a.date_match || '').localeCompare(b.date_match || '');
    });
    historique.sort((a, b) => (b.date_match || '').localeCompare(a.date_match || '')); // plus récent d'abord

    document.getElementById('deplacementsListe').innerHTML = aVenir.length
      ? aVenir.map(d => renderDeplCard(d)).join('')
      : '<div class="empty-state"><div>✈️</div>Aucun déplacement à venir</div>';
    document.getElementById('deplacementsHistorique').innerHTML = historique.length
      ? historique.map(d => renderDeplCard(d)).join('')
      : '<div class="empty-state"><div>📋</div>Aucun historique</div>';
  } catch(e) { toast('Erreur chargement déplacements', 'error'); }
}

// Statut EFFECTIF d'un déplacement (demande Remi 09/07/2026) : une fois
// la date du match échue, le déplacement doit se comporter comme "fermé"
// même si le champ statut est resté à "ouvert" OU "complet" en base —
// jamais appliqué à "annulé" (un déplacement annulé reste annulé, la
// date ne change rien à ça). Purement calculé à l'affichage : ne modifie
// rien en base.
function statutEffectifDepl(d) {
  const matchPasse = !!d.date_match && d.date_match < new Date().toISOString().split('T')[0];
  if (matchPasse && (d.statut === 'ouvert' || d.statut === 'complet')) {
    return 'ferme';
  }
  return d.statut;
}

// Un déplacement va dans "Historique" dès que son statut effectif est
// "fermé" ou "annulé" — qu'importe si sa date est encore dans le futur
// (ex: fermé manuellement en avance par le Bureau) ou déjà passée.
// "Ouvert" et "complet" (tant que la date n'est pas dépassée) restent
// dans "À venir".
function estHistoriqueDepl(d) {
  const s = statutEffectifDepl(d);
  return s === 'ferme' || s === 'annule';
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
// ⚠️ Complété le 09/07/2026 : ferme aussi une fois la date du MATCH elle-
// même dépassée, même sans date_limite_inscription renseignée — sinon un
// déplacement passé, affiché dans l'historique (cf. estHistoriqueDepl),
// montrerait encore un bouton "M'inscrire" pour un bus déjà parti.
function inscriptionsDeplFermees(d) {
  const dateLimitePassee = !!d.date_limite_inscription && new Date() > new Date(d.date_limite_inscription);
  const matchDejaPasse = !!d.date_match && d.date_match < new Date().toISOString().split('T')[0];
  return dateLimitePassee || matchDejaPasse;
}

// Accès échelonné par statut (demande Remi 09/07/2026) : un Confirmé peut
// avoir accès en avance par rapport à un Draft, lui-même avant un
// Sympathisant. Un déplacement sans date configurée pour un statut donné
// reste ouvert sans restriction pour ce statut (comportement par défaut
// inchangé si Remi ne remplit rien) — seule une date FUTURE bloque.
function champOuverturePourStatut(statut) {
  if (statut === 'confirme') return 'ouverture_confirme';
  if (statut === 'draft') return 'ouverture_draft';
  if (statut === 'visiteur') return 'ouverture_visiteur';
  return 'ouverture_sympathisant'; // sympathisant, ou tout statut non prioritaire
}
// Les dates d'ouverture (datetime-local) étaient envoyées telles quelles
// à la base, sans passer par un objet Date — Postgres les stockait alors
// en interprétant la chaîne "naïve" (ex. "2026-07-23T09:00", sans fuseau)
// comme de l'UTC, alors que Rémi la saisit en heure de Paris. Résultat :
// un décalage de 1h (hiver, CET = UTC+1) ou 2h (été, CEST = UTC+2) entre
// l'heure saisie et l'heure réellement appliquée (demande Remi
// 22/07/2026). new Date(valeur) interprète correctement la chaîne comme
// heure LOCALE du navigateur (le fuseau du navigateur, Europe/Paris pour
// cette app), gérant nativement le passage heure d'été/hiver — pas de
// calcul de décalage à faire à la main.
function datetimeLocalVersUTC(valeur) {
  return valeur ? new Date(valeur).toISOString() : null;
}
// Inverse : reformate une date stockée (UTC) en chaîne locale compatible
// avec un input datetime-local, pour que le formulaire de modification
// réaffiche bien l'heure de Paris telle que saisie à l'origine — pas
// l'heure UTC brute (ancien bug : simple slice(0,16) sur la valeur ISO).
function utcVersDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function inscriptionPasEncoreOuvertePourMoi(d) {
  const m = UL.getCurrentMembre();
  // Admin/Bureau/Cellule Déplacement peuvent toujours prendre leur place,
  // même avant l'ouverture échelonnée correspondant à leur propre statut
  // et même sur un déplacement en brouillon — utile pour tester un
  // paiement avant publication (demande Remi 22/07/2026). La visibilité
  // des brouillons pour ce même groupe existait déjà (getDeplacements) ;
  // seule cette restriction d'horaire les bloquait encore.
  if (hasCelluleDepl(m)) return false;
  const champ = champOuverturePourStatut(m?.statut);
  const dateOuverture = d[champ];
  if (!dateOuverture) return false; // pas de restriction configurée pour ce statut
  return new Date() < new Date(dateOuverture);
}

// Affiche systématiquement les dates d'ouverture échelonnée configurées
// (12/07/2026, demande Remi) — jusqu'ici, la date n'était visible QUE
// tant que ce n'était pas encore ouvert pour le membre courant ; une fois
// l'ouverture passée, plus aucune trace de quand elle avait eu lieu.
// N'affiche que les paliers réellement configurés (au moins une des 3
// dates) ; vide si Remi n'a rien renseigné (comportement neutre inchangé
// pour les déplacements sans accès échelonné).
function formatEchelonnementDepl(d) {
  const paliers = [
    { label: 'Confirmés', date: d.ouverture_confirme },
    { label: 'Draft', date: d.ouverture_draft },
    { label: 'Sympathisants', date: d.ouverture_sympathisant },
    { label: 'Visiteur', date: d.ouverture_visiteur },
  ].filter(p => p.date);
  if (!paliers.length) return '';
  const fmt = iso => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return paliers.map(p => `${p.label} dès le ${fmt(p.date)}`).join(' · ');
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
    if (inscriptionsDeplFermees(d)) {
      boutonAction = `<span class="badge badge-gris">⏳ Inscriptions terminées</span>`;
    } else if (inscriptionPasEncoreOuvertePourMoi(d)) {
      const dateOuv = d[champOuverturePourStatut(m?.statut)];
      boutonAction = `<span class="badge badge-gris">🔒 Ouverture le ${new Date(dateOuv).toLocaleDateString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>`;
    } else {
      boutonAction = `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();showConfirmInscriptionDepl('${d.id}')">M'inscrire</button>`;
    }
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
  // Aperçu équilibre (12/07/2026) — visible seulement par la cellule
  // Déplacement, uniquement si coût bus + places max sont renseignés.
  // Recalculé à l'affichage de la carte, indépendant du formulaire.
  let equilibreApercu = '';
  if (hasCelluleDepl(m) && d.cout_bus && d.places_max) {
    const seuil = d.cout_bus / d.places_max;
    const auDessus = (d.prix_bus || 0) >= seuil;
    equilibreApercu = `<div style="font-size:11px;color:var(--gris);margin-top:6px;">🎯 Seuil ${seuil.toFixed(1)}€/place ${auDessus ? '✅' : '⚠️'} ${d.distance_km ? `· 🛣️ ${d.distance_km}km A/R` : ''}</div>`;
    // Manque pour l'équilibre + bénéfice/perte RÉEL au nombre d'inscrits
    // payés actuel (demande Remi 22/07/2026) — jusqu'ici seul le scénario
    // "bus plein" était visible (dans le détail, pas sur la carte). Basé
    // uniquement sur prix_bus, jamais prix_place (le prix de la place ne
    // sert pas à couvrir le coût du bus — précisé par Remi).
    if (d.prix_bus) {
      const seuilPersonnes = d.cout_bus / d.prix_bus;
      const inscritsPayes = d._inscritsPayes || 0;
      const manque = Math.max(0, Math.ceil(seuilPersonnes) - inscritsPayes);
      const beneficeActuel = (inscritsPayes * d.prix_bus) - d.cout_bus;
      const enPerte = beneficeActuel < 0;
      equilibreApercu += `<div style="font-size:11px;color:${manque > 0 ? 'var(--orange)' : 'var(--vert)'};margin-top:2px;">${manque > 0 ? `⚠️ Encore ${manque} personne${manque>1?'s':''} pour l'équilibre` : '✅ Équilibre atteint'}</div>`;
      equilibreApercu += `<div style="font-size:11px;color:${enPerte ? 'var(--rouge)' : 'var(--vert)'};margin-top:2px;">${enPerte ? `📉 Perte actuelle : ${Math.abs(beneficeActuel).toFixed(0)}€` : `📈 Bénéfice actuel : ${beneficeActuel.toFixed(0)}€`} (${inscritsPayes} payé${inscritsPayes>1?'s':''})</div>`;
    }
  }
  const adminBar = hasCelluleDepl(m) ? `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
      <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();voirInscritsDepl('${d.id}')">👥 Inscrits</button>
      <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();copierListeBus('${d.id}')">📋 Liste bus</button>
      <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();ouvrirModifierDepl('${d.id}')">✏️ Modifier</button>
    </div>${equilibreApercu}` : '';

  return `<div class="depl-card" onclick="openDepl('${d.id}')">
    ${d.visible_membres === false ? `<div style="margin-bottom:6px;"><span class="badge badge-rouge">🔒 Brouillon — invisible pour les membres</span></div>` : ''}
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
      <span class="badge ${statutEffectifDepl(d)==='ouvert'?'badge-vert':statutEffectifDepl(d)==='complet'?'badge-rouge':'badge-gris'}" style="flex-shrink:0;margin-top:2px;">
        ${statutEffectifDepl(d)==='ouvert'?'Ouvert':statutEffectifDepl(d)==='complet'?'Complet':statutEffectifDepl(d)==='ferme'?'Fermé':'Annulé'}
      </span>
    </div>
    ${d.places_max ? `
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
      <div class="places-bar" style="flex:1;"><div class="places-fill" style="width:${pct}%"></div></div>
      <span style="font-size:11px;color:var(--gris);flex-shrink:0;">${d._inscrits||0}/${d.places_max}</span>
    </div>` : ''}
    ${formatEchelonnementDepl(d) ? `<div style="font-size:11px;color:var(--gris);margin-top:6px;">📅 ${formatEchelonnementDepl(d)}</div>` : ''}
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
        ${d.distance_km ? `🛣️ ${d.distance_km}km A/R<br>` : ''}
        ${d.date_limite_inscription ? `⏳ Limite: ${new Date(d.date_limite_inscription).toLocaleDateString('fr-FR')}<br>` : ''}
        ${formatEchelonnementDepl(d) ? `📅 Ouverture : ${formatEchelonnementDepl(d)}<br>` : ''}
      </div>
      ${hasCelluleDepl(m) && (d.cout_bus || d.prix_bus) ? `
      <div class="info-box" style="font-size:12px;margin-bottom:16px;">
        🎯 <strong>Détail cellule</strong><br>
        ${d.prix_bus != null ? `Prix bus: ${d.prix_bus}€ + Prix place: ${d.prix_place ?? 10}€<br>` : ''}
        ${d.cout_bus ? `Coût devis bus: ${d.cout_bus}€<br>` : ''}
        ${d.cout_bus && d.places_max ? (() => {
          const seuil = d.cout_bus / d.places_max;
          const benef = ((d.prix_bus || 0) - seuil) * d.places_max;
          return `Seuil équilibre: ${seuil.toFixed(1)}€/place — ${(d.prix_bus||0) >= seuil ? `✅ bénéf. plein bus ${benef.toFixed(0)}€` : `⚠️ perte plein bus ${benef.toFixed(0)}€`}`;
        })() : ''}
      </div>` : ''}
      <div style="font-size:14px;margin-bottom:16px;font-weight:600;">👥 ${nbInscrits} inscrit${nbInscrits>1?'s':''}${d.places_max?' / '+d.places_max+' places':''}</div>`;

    if (!estInscrit) {
      if (inscriptionsDeplFermees(d)) {
        html += `<div class="info-box">⏳ Les inscriptions sont terminées pour ce déplacement.</div>`;
      } else if (inscriptionPasEncoreOuvertePourMoi(d)) {
        const dateOuv = d[champOuverturePourStatut(m?.statut)];
        html += `<div class="info-box">🔒 Ouverture de tes inscriptions le ${new Date(dateOuv).toLocaleDateString('fr-FR',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}</div>`;
      } else {
        html += `<button class="btn btn-primary" onclick="showConfirmInscriptionDepl('${d.id}')">M'inscrire</button>`;
      }
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

// Ouvre le choix "seul / avec des amis" avant de lancer le paiement —
// remplace l'ancien clic direct sur "M'inscrire" qui appelait le checkout
// HelloAsso immédiatement (demande Remi 09/07/2026 : inscrire plusieurs
// personnes — membres de l'app ou invités hors app — en une seule fois).
//
// ⚠️ Cas "Réessayer/Relancer le paiement" (une inscription existe déjà
// pour soi, statut refuse ou en_attente) : on NE PASSE PAS par le modal
// multi-personnes — ça relancerait un paiement pour un tout nouveau
// participant "moi" au lieu de reprendre l'inscription existante, donc
// un doublon. Dans ce cas, on garde l'appel direct à un seul participant,
// identique à l'ancien comportement d'avant cette évolution.
let _deplIdCourantInscription = null;
async function doInscritDepl(id, btn) {
  const texteOriginal = btn ? btn.textContent : '';
  try {
    const { deplacement: d, monInscrit } = await UL.getDeplacement(id);

    if (monInscrit) {
      // Relance de paiement pour une inscription déjà existante — appel
      // strictement inchangé par rapport à avant (cf. relancerPaiementDeplacement),
      // aucune dépendance à l'évolution de l'Edge Function pour ce cas.
      if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
      const data = await UL.relancerPaiementDeplacement(id);
      closeModal('modalDepl');
      if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
      afficherAvertissementHelloAsso(data.redirectUrl, 'deplacement', data.inscriptionId);
      return;
    }

    // Pas encore inscrit : ouvre le modal de sélection (soi seul par
    // défaut, avec option amis app — invités hors app retirés le
    // 22/07/2026, demande Remi).
    _deplIdCourantInscription = id;
    document.getElementById('idAvecAmis').checked = false;
    document.getElementById('blocAmisDepl').style.display = 'none';
    document.getElementById('idRechercheAmis').value = '';
    _amisDeplDisponibles = [];
    _amisDeplSelectionnes.clear();

    let quotaHtml = '';
    const quota = await UL.getMonQuotaDepl(id).catch(() => null);
    if (quota) quotaHtml = `<div class="info-box warning">⚠️ Quota: il te reste ${quota.restant} place${quota.restant>1?'s':''} sur ${quota.quota}</div>`;
    document.getElementById('inscritDeplQuotaInfo').innerHTML = quotaHtml;
    _quotaDeplCourant = quota;
    _prixDeplCourant = d.prix_total || 0;

    majRecapInscritDepl();
    showModal('modalInscritDepl');
  } catch(e) {
    toast(e.message || 'Impossible de s\'inscrire au déplacement', 'error');
    if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
  }
}

let _amisDeplDisponibles = [];
let _amisDeplSelectionnes = new Set();
let _quotaDeplCourant = null;
let _prixDeplCourant = 0;

async function toggleAmisDepl() {
  const actif = document.getElementById('idAvecAmis').checked;
  document.getElementById('blocAmisDepl').style.display = actif ? 'block' : 'none';
  if (actif && !_amisDeplDisponibles.length) {
    document.getElementById('listeAmisDepl').innerHTML = '<div class="empty-state"><div>⏳</div>Chargement…</div>';
    try {
      _amisDeplDisponibles = await UL.getMembresPourAmisDepl();
      renderListeAmisDepl(_amisDeplDisponibles);
    } catch(e) { document.getElementById('listeAmisDepl').innerHTML = '<div class="empty-state"><div>⚠️</div>Erreur de chargement</div>'; }
  }
  majRecapInscritDepl();
}

function filtrerAmisDepl() {
  const q = document.getElementById('idRechercheAmis').value.trim().toLowerCase();
  const filtres = _amisDeplDisponibles.filter(m => `${m.prenom} ${m.nom} ${m.pseudo_telegram}`.toLowerCase().includes(q));
  renderListeAmisDepl(filtres);
}

function renderListeAmisDepl(liste) {
  const el = document.getElementById('listeAmisDepl');
  if (!liste.length) { el.innerHTML = '<div style="font-size:13px;color:var(--gris);">Aucun ami confirmé pour l\'instant — ajoute des amis depuis Profil.</div>'; return; }
  el.innerHTML = liste.map(m => `
    <label style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;">
      <input type="checkbox" ${_amisDeplSelectionnes.has(m.id)?'checked':''} onchange="toggleAmiDeplSelectionne('${m.id}',this.checked)" style="width:18px;height:18px;accent-color:#1A56DB;flex-shrink:0;">
      <span style="font-size:14px;">${esc(nomAfficheMembre(m))}</span>
    </label>`).join('');
}

function toggleAmiDeplSelectionne(membreId, coche) {
  if (coche) _amisDeplSelectionnes.add(membreId); else _amisDeplSelectionnes.delete(membreId);
  majRecapInscritDepl();
}

// Fonctions "amis hors app" retirées (demande Remi 22/07/2026) — on ne
// peut plus inscrire quelqu'un qui n'est pas un ami dans l'app
// (toggleInvitesDepl, ajouterLigneInviteDepl, lireInvitesDepl
// supprimées, ainsi que le branchement 'invite' dans doInscritDeplMulti
// ci-dessous).

function majRecapInscritDepl() {
  const nbAmis = document.getElementById('idAvecAmis')?.checked ? _amisDeplSelectionnes.size : 0;
  const total = 1 + nbAmis; // 1 = soi-même
  const montant = (_prixDeplCourant * total).toFixed(2);
  let html = `👥 ${total} place${total>1?'s':''} — 💶 ${montant}€`;
  if (_quotaDeplCourant && total > _quotaDeplCourant.restant) {
    html += `<div style="color:var(--rouge);font-size:13px;font-weight:400;margin-top:4px;">⚠️ Dépasse ton quota restant (${_quotaDeplCourant.restant})</div>`;
  }
  document.getElementById('inscritDeplRecap').innerHTML = html;
}

async function doInscritDeplMulti(btn) {
  const id = _deplIdCourantInscription;
  const participants = [{ type: 'moi' }];
  if (document.getElementById('idAvecAmis').checked) {
    _amisDeplSelectionnes.forEach(membreId => participants.push({ type: 'ami', membreId }));
  }
  if (_quotaDeplCourant && participants.length > _quotaDeplCourant.restant) {
    return toast(`Quota dépassé — il te reste ${_quotaDeplCourant.restant} place(s)`, 'error');
  }

  const texteOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    const data = await UL.demanderInscriptionDeplacementHelloAsso(id, participants);
    closeModal('modalInscritDepl');
    closeModal('modalDepl');
    if (btn) { btn.disabled = false; btn.textContent = texteOriginal; }
    afficherAvertissementHelloAsso(data.redirectUrl, 'deplacement', data.inscriptionId);
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
    ${!liste.length ? '<p style="color:var(--gris);font-size:13px;">Aucun inscrit pour ce filtre</p>' : liste.map(i => {
      // Participant : membre de l'app (pseudo + nom) ou invité hors app
      // (nom/prénom saisis à l'inscription, jamais de pseudo) — cf.
      // migration_deplacements_avance.sql.
      const estInvite = !i.membre_id;
      const ligneParticipant = estInvite
        ? `<div style="font-weight:600;">${esc(i.invite_prenom||'')} ${esc(i.invite_nom||'')}</div><div style="color:var(--gris);">👤 Invité hors app</div>`
        : `<div style="font-weight:600;">@${esc(i.membre?.pseudo_telegram||'?')}</div><div style="color:var(--gris);">${esc(i.membre?.prenom||'')} ${esc(i.membre?.nom||'')}</div>`;
      // Payeur affiché seulement s'il diffère du participant lui-même —
      // sinon "Payé par @toi-même" n'apporte rien (demande Remi
      // 09/07/2026 : savoir qui a payé pour un ami/invité).
      const payeurDiffere = i.payeur_id && i.payeur_id !== i.membre_id;
      const ligneNaP = payeurDiffere
        ? `<div style="font-size:11px;color:var(--bleu-clair);margin-top:2px;">💳 Payé par @${esc(i.payeur?.pseudo_telegram||'?')}</div>`
        : '';
      return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <div style="flex:1;">
          ${ligneParticipant}
          ${ligneNaP}
        </div>
        <span class="badge ${i.statut_paiement==='en_attente'?'badge-orange':i.statut_paiement.includes('paye')?'badge-vert':'badge-gris'}">
          ${i.statut_paiement==='en_attente'?'⏳':i.statut_paiement==='paye_cash'?'Cash ✅':'HA ✅'}
        </span>
        ${(i.statut_paiement==='paye_cash'||i.statut_paiement==='paye_ha') ? `
          <span class="badge ${i.present_at?'badge-vert':'badge-orange'}">${i.present_at?'✅ Présent':'⏳ Absent'}</span>` : ''}
        ${i.statut_paiement==='en_attente' ? `
          <button class="btn btn-sm btn-success" onclick="validerCash('${d.id}','${i.id}')">Cash</button>
          <button class="btn btn-sm btn-danger" onclick="annulerInscritAdmin('${d.id}','${i.id}')">Annuler</button>` : ''}
      </div>`;
    }).join('')}
  `;
}

async function validerCash(deplId, inscriptionId) {
  try { await UL.validerPaiementCash(inscriptionId); toast('Paiement cash validé ✅', 'success'); voirInscritsDepl(deplId); }
  catch(e) { toast('Impossible de valider le paiement cash', 'error'); }
}

// Annulation admin d'une inscription en attente de paiement — uniquement
// si non payée (cf. annulerInscriptionDeplAdmin, supabase-client.js).
async function annulerInscritAdmin(deplId, inscriptionId) {
  if (!confirm('Annuler cette inscription ? Le membre devra se réinscrire si besoin.')) return;
  try {
    await UL.annulerInscriptionDeplAdmin(inscriptionId);
    toast('Inscription annulée ✅', 'success');
    voirInscritsDepl(deplId);
  } catch(e) { toast(e.message || 'Impossible d\'annuler cette inscription', 'error'); }
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
// ⚠️ Corrigé (12/07/2026) — plusieurs clés ne correspondaient pas aux
// noms de stades réellement stockés dans la table matchs (tirets
// manquants, noms de sponsor à jour type "Orange Vélodrome" au lieu de
// "Stade Vélodrome", "Stade Marie-Marvingt" au lieu de "MMArena") : la
// déduction automatique de ville échouait silencieusement pour Auxerre,
// Angers, Marseille et Le Mans depuis la mise en place du calendrier
// 2026-2027. Vérifié contre les 17 valeurs réelles de matchs.stade.
const STADE_VERS_VILLE = {
  'Stade Raymond-Kopa': 'Angers',
  'Stade de l\'Abbé-Deschamps': 'Auxerre',
  'Stade Francis-Le Blé': 'Brest',
  'Stade Océane': 'Le Havre',
  'Stade Marie-Marvingt': 'Le Mans',
  'Stade Bollaert-Delelis': 'Lens',
  'Stade Pierre-Mauroy': 'Villeneuve-d\'Ascq',
  'Stade du Moustoir': 'Lorient',
  'Groupama Stadium': 'Décines-Charpieu',
  'Orange Vélodrome': 'Marseille',
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
  ['dHeure','dPlaces','dLimite','dNotes','dDistance','dCoutBus','dPrixBus'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('dPrixPlace').value = 10;
  document.getElementById('dEquilibreInfo').style.display = 'none';
  ['dQuota','dOuvConfirme','dOuvDraft','dOuvSympa'].forEach(id => document.getElementById(id).value = '');
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

// Indicateur d'équilibre (12/07/2026, demande Remi) — recalculé en
// direct (oninput) sur les formulaires création/modification. Seuil =
// coût du devis bus / places max (prix par place nécessaire pour
// rentrer dans les frais du bus). Comparé à prix_bus (pas prix_total :
// prix_place — l'entrée du match — ne sert pas à couvrir le coût du
// bus, cf. décomposition demandée par Remi). N'affiche rien tant que
// coût bus ET places max ne sont pas tous les deux renseignés.
function calculerEquilibreDepl(prefixe) {
  const p = prefixe === 'modif' ? 'dm' : 'd';
  const coutBus = parseFloat(document.getElementById(`${p}CoutBus`).value) || 0;
  const places = parseInt(document.getElementById(`${p}Places`).value) || 0;
  const prixBus = parseFloat(document.getElementById(`${p}PrixBus`).value) || 0;
  const box = document.getElementById(`${p}EquilibreInfo`);
  if (!coutBus || !places) { box.style.display = 'none'; return; }
  const seuil = coutBus / places;
  const beneficePlein = (prixBus - seuil) * places;
  const auDessus = prixBus >= seuil;
  box.style.display = 'block';
  box.className = `info-box ${auDessus ? '' : 'warning'}`;
  box.style.fontSize = '12px';
  box.innerHTML = `🎯 Seuil d'équilibre : <strong>${seuil.toFixed(1)}€/place</strong> (bus complet, ${places} places)<br>` +
    (auDessus
      ? `✅ Prix bus actuel au-dessus du seuil — bénéf. plein bus : <strong>${beneficePlein.toFixed(0)}€</strong>`
      : `⚠️ Prix bus actuel EN DESSOUS du seuil — perte plein bus : <strong>${beneficePlein.toFixed(0)}€</strong>`);
}

async function doCreerDepl(btn) {
  const source = document.getElementById('dSource').value;
  const matchId = document.getElementById('dMatchId').value;
  const rdvChoix = document.getElementById('dRdv').value;
  const pointRdv = rdvChoix === 'autre' ? (document.getElementById('dRdvAutre').value.trim() || null) : (rdvChoix || null);
  // Prix décomposé (12/07/2026, demande Remi) : prix_total reste la
  // colonne utilisée partout ailleurs (paiement HelloAsso, affichage
  // membre) — jamais saisi directement, toujours recalculé comme
  // prix_bus + prix_place pour rester rigoureusement cohérent. prix_bus/
  // prix_place ne servent qu'à la décomposition et aux stats équilibre.
  const prixBus = parseFloat(document.getElementById('dPrixBus').value) || 0;
  const prixPlace = parseFloat(document.getElementById('dPrixPlace').value) || 0;
  const data = {
    adversaire: document.getElementById('dAdv').value,
    date_match: document.getElementById('dDate').value,
    stade: document.getElementById('dStade').value || null,
    ville: document.getElementById('dVille').value || null,
    point_rdv: pointRdv,
    lien_telegram: document.getElementById('dTelegram').value.trim() || null,
    heure_depart: document.getElementById('dHeure').value || null,
    distance_km: parseFloat(document.getElementById('dDistance').value) || null,
    cout_bus: parseFloat(document.getElementById('dCoutBus').value) || null,
    prix_bus: prixBus || null,
    prix_place: prixPlace || null,
    prix_total: (prixBus + prixPlace) || null,
    places_max: parseInt(document.getElementById('dPlaces').value) || null,
    date_limite_inscription: document.getElementById('dLimite').value || null,
    notes: document.getElementById('dNotes').value || null,
    match_id: (source === 'match' && matchId) ? matchId : null,
    quota_par_membre: parseInt(document.getElementById('dQuota').value) || null,
    ouverture_confirme: datetimeLocalVersUTC(document.getElementById('dOuvConfirme').value),
    ouverture_draft: datetimeLocalVersUTC(document.getElementById('dOuvDraft').value),
    ouverture_sympathisant: datetimeLocalVersUTC(document.getElementById('dOuvSympa').value),
    ouverture_visiteur: datetimeLocalVersUTC(document.getElementById('dOuvVisiteur').value),
    // Brouillon (10/07/2026) : caché des membres tant que non coché,
    // utile pour tester un vrai paiement HelloAsso avant publication.
    visible_membres: !document.getElementById('dBrouillon').checked,
  };
  if (!data.adversaire || !data.date_match) return toast('Adversaire et date requis', 'error');
  const notifier = document.getElementById('dNotifier')?.checked;
  const texteOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    const depl = await UL.createDeplacement(data);
    toast(data.visible_membres ? 'Déplacement créé ✅' : 'Déplacement créé en brouillon 🔒 ✅', 'success');
    closeModal('modalCreerDepl');
    document.getElementById('dBrouillon').checked = false;
    loadDeplacements();
    // Notification "nouveau contenu" — ouverte à tous les membres actifs,
    // sans restriction de statut (cf. cible:'tous', cohérent avec
    // getDeplacements qui n'applique aucun filtre de droits côté lecture
    // pour un déplacement visible). Jamais envoyée pour un brouillon,
    // même si la case "Notifier" est restée cochée.
    if (notifier && data.visible_membres) {
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
    document.getElementById('dmDistance').value = d.distance_km ?? '';
    document.getElementById('dmCoutBus').value = d.cout_bus ?? '';
    // Repli (12/07/2026) : pour un déplacement créé avant l'ajout de la
    // décomposition prix_bus/prix_place, ces deux champs sont vides en
    // base — on déduit prix_bus de prix_total - prix_place plutôt que de
    // laisser le champ à 0, pour ne pas perdre silencieusement le prix
    // déjà fixé au moment de la première sauvegarde après migration.
    const prixPlaceActuel = d.prix_place ?? 10;
    document.getElementById('dmPrixPlace').value = prixPlaceActuel;
    document.getElementById('dmPrixBus').value = d.prix_bus ?? (d.prix_total != null ? Math.max(0, d.prix_total - prixPlaceActuel) : '');
    document.getElementById('dmPlaces').value = d.places_max || '';
    document.getElementById('dmLimite').value = d.date_limite_inscription || '';
    document.getElementById('dmNotes').value = d.notes || '';
    document.getElementById('dmStatut').value = d.statut || 'ouvert';
    document.getElementById('dmQuota').value = d.quota_par_membre ?? '';
    document.getElementById('dmBrouillon').checked = d.visible_membres === false;
    calculerEquilibreDepl('modif');
    // datetime-local attend "YYYY-MM-DDTHH:mm" — les timestamptz renvoyés
    // par Supabase incluent secondes/fuseau (ex. "2026-07-15T14:30:00+00:00"),
    // on tronque à 16 caractères pour que l'input les accepte.
    // datetime-local attend "YYYY-MM-DDTHH:mm" en heure LOCALE — avant,
    // un simple .slice(0,16) sur la valeur UTC stockée réaffichait
    // l'heure UTC brute, décalée de 1h/2h par rapport à l'heure de Paris
    // saisie à l'origine (même bug que datetimeLocalVersUTC ci-dessus,
    // corrigé le 22/07/2026 — cf. utcVersDatetimeLocal).
    document.getElementById('dmOuvConfirme').value = utcVersDatetimeLocal(d.ouverture_confirme);
    document.getElementById('dmOuvDraft').value = utcVersDatetimeLocal(d.ouverture_draft);
    document.getElementById('dmOuvSympa').value = utcVersDatetimeLocal(d.ouverture_sympathisant);
    document.getElementById('dmOuvVisiteur').value = utcVersDatetimeLocal(d.ouverture_visiteur);

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
    distance_km: parseFloat(document.getElementById('dmDistance').value) || null,
    cout_bus: parseFloat(document.getElementById('dmCoutBus').value) || null,
    prix_bus: parseFloat(document.getElementById('dmPrixBus').value) || null,
    prix_place: parseFloat(document.getElementById('dmPrixPlace').value) || null,
    prix_total: ((parseFloat(document.getElementById('dmPrixBus').value) || 0) + (parseFloat(document.getElementById('dmPrixPlace').value) || 0)) || null,
    places_max: parseInt(document.getElementById('dmPlaces').value) || null,
    date_limite_inscription: document.getElementById('dmLimite').value || null,
    notes: document.getElementById('dmNotes').value || null,
    statut: document.getElementById('dmStatut').value,
    match_id: (source === 'match' && matchId) ? matchId : null,
    quota_par_membre: parseInt(document.getElementById('dmQuota').value) || null,
    ouverture_confirme: datetimeLocalVersUTC(document.getElementById('dmOuvConfirme').value),
    ouverture_draft: datetimeLocalVersUTC(document.getElementById('dmOuvDraft').value),
    ouverture_sympathisant: datetimeLocalVersUTC(document.getElementById('dmOuvSympa').value),
    ouverture_visiteur: datetimeLocalVersUTC(document.getElementById('dmOuvVisiteur').value),
    visible_membres: !document.getElementById('dmBrouillon').checked,
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
