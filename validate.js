#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  validate.js — Ultras Lutetia PWA
//  Usage : node validate.js [fichier]
//    node validate.js             → valide tous les modules
//    node validate.js src/app.js  → valide un fichier spécifique
//  Lance avant chaque déploiement ou commit.
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const { execSync } = require('child_process');

// ── Mode : fichier unique ou tous les modules ──────────────────
const singleFile = process.argv[2];
const MODULES = [
  'src/app.js',
  'src/tifos.js',
  'src/deplacements.js',
  'src/boutique.js',
  'src/calendrier.js',
  'src/admin.js',
  'src/profil.js',
];

const filesToValidate = singleFile ? [singleFile] : MODULES;
const htmlPath = 'index.html';
const htmlForIds = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';

// ── Fonctions requises par module ──────────────────────────────
const REQUIRED_BY_MODULE = {
  'src/app.js': [
    'doLogin', 'doInscription', 'doLogout', 'showApp', 'showLoginPage',
    'showPage', 'applyRights',
    'loadAccueil', 'loadDemandes',
    'isAdmin', 'isBureau', 'isCellule',
    'hasCelluleTifo', 'hasCelluleDepl', 'hasCelluleMatos',
    'hasCelluleSticks', 'hasCelluleComite', 'peutValiderInscriptions',
    'toast', 'showModal', 'closeModal',
    'afficherCharteGate', 'signerCharteGate', 'checkCharteScroll', 'renderCharteHTML',
  ],
  'src/tifos.js': [
    'loadTifos', 'renderTifoCard', 'loadTifoActions', 'refreshTifosActions',
    'doInscrire',
    'ouvrirModalPresence', 'doValiderPresence',
    'doCreerSession', 'doModifierSession', 'loadAdminTifos',
    'ouvrirEvaluationMembresTifo', 'renderCarteEvaluation', 'doNoterMembre',
  ],
  'src/deplacements.js': [
    'loadDeplacements', 'renderDeplCard',
  ],
  'src/boutique.js': [
    'loadBoutique', 'switchBoutiqueTab',
    'loadMatos', 'renderMatos', 'filtrerMatos',
    'loadSticks', 'renderSticks',
    'loadCotisation',
  ],
  'src/calendrier.js': [
    'loadCalendrier', 'filtrerCalendrier',
    'renderMatchCard', 'saisirScore',
    'loadCartage', 'filtrerCartage',
    'ouvrirCreerEvenement', 'doSauvegarderEvenement',
  ],
  'src/admin.js': [
    'loadMembres', 'renderMembres', 'filtrerMembres',
    'openEditMembre', 'doSauvegarderMembre',
    'loadStats',
    'loadDemandesAdmin', 'validerDemandeAdmin',
    'doPublierAnnonce',
    'loadGererCharte', 'doSauvegarderCharte',
    'loadMembresComite', 'filtrerMembresComite', 'renderMembresComiteListe', 'toggleMembreComite',
    'filtrerStatutComite', 'filtrerNiveauComite', 'filtrerSectionComite',
    'copierListeMembresComite', 'exporterCsvMembresComite',
  ],
  'src/profil.js': [
    'loadProfil', 'loadCharte',
  ],
};

// ── IDs générés dynamiquement (exclus du check) ────────────────
const KNOWN_DYNAMIC = new Set([
  'qrDepl', 'taillesContainer',
  'photoPreviewImgStick', 'photoPreviewStick',
  'codePresence', 'cmdMode', 'cmdTaille',
  'pizzaChoixContainer', 'pinteChoixContainer',
  'evalTifoListe', 'evalTifoSearch',
  'evalComiteSympaListe', 'evalComiteDraftListe',
  'modalPropositionNotifs', // modale créée dynamiquement (cf. afficherModalePropositionNotifs, app.js) — jamais dans le HTML statique
]);

// ── Validation d'un fichier ─────────────────────────────────────
function validateFile(file) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📄  ${file}`);
  console.log('═'.repeat(60));

  if (!fs.existsSync(file)) {
    console.error(`  ❌ Fichier introuvable : ${file}`);
    return 1;
  }

  const js = fs.readFileSync(file, 'utf8');
  const tmpFile = '/tmp/_ul_validate.js';
  fs.writeFileSync(tmpFile, js);
  let errors = 0;

  // 1. Syntaxe JS
  console.log('\n── 1. Syntaxe JS');
  try {
    execSync(`node --check ${tmpFile}`, { stdio: 'pipe' });
    console.log('  ✅ Syntaxe valide');
  } catch (e) {
    console.error('  ❌ ERREUR SYNTAXE :');
    console.error(e.stderr.toString());
    errors++;
  }

  // 2. Fonctions requises
  const requiredFns = REQUIRED_BY_MODULE[file];
  if (requiredFns) {
    console.log('\n── 2. Fonctions requises');
    const missing = requiredFns.filter(fn => !new RegExp(`function\\s+${fn}\\s*\\(`).test(js));
    if (missing.length === 0) {
      console.log('  ✅ Toutes les fonctions présentes');
    } else {
      missing.forEach(fn => console.error(`  ❌ MANQUANTE : ${fn}`));
      errors += missing.length;
    }
  }

  // 3. await dans fonctions non-async
  console.log('\n── 3. await dans fonctions non-async');
  const lines = js.split('\n');
  let depth = 0;
  let funcStack = [];
  let awaitErrors = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opens  = (line.match(/{/g) || []).length;
    const closes = (line.match(/}/g) || []).length;
    const fnMatch = line.match(/(async\s+)?function\s+(\w+)\s*\(/);
    if (fnMatch) funcStack.push({ name: fnMatch[2], isAsync: !!fnMatch[1], openDepth: depth });
    if (/(async\s*\(|async\s+\w+\s*=>)/.test(line))
      funcStack.push({ name: '__arrow__', isAsync: true, openDepth: depth });
    depth += opens - closes;
    funcStack = funcStack.filter(f => f.openDepth < depth || (f.openDepth === depth && opens > 0));
    if (/\bawait\s/.test(line)) {
      const currentIsAsync = funcStack.some(f => f.isAsync);
      if (!currentIsAsync && funcStack.length > 0) {
        const fn = funcStack[funcStack.length - 1].name;
        awaitErrors.push(`  ❌ Line ${i+1} dans '${fn}': ${line.trim().slice(0, 80)}`);
      }
    }
  }
  if (awaitErrors.length === 0) console.log('  ✅ Aucun await dans une fonction non-async');
  else { awaitErrors.forEach(e => console.error(e)); errors += awaitErrors.length; }

  // 4. Apostrophes suspectes
  console.log('\n── 4. Apostrophes dans strings JS');
  const aposErrors = [];
  lines.forEach((line, i) => {
    if (/'[^'"]*\bl'[a-zA-ZÀ-ÿ]/.test(line) && !line.trim().startsWith('//'))
      aposErrors.push(`  ⚠️  Line ${i+1}: ${line.trim().slice(0, 80)}`);
  });
  if (aposErrors.length === 0) console.log('  ✅ Aucune apostrophe suspecte');
  else aposErrors.forEach(e => console.warn(e));

  // 5. IDs JS vs HTML (seulement si index.html disponible)
  if (htmlForIds) {
    console.log('\n── 5. IDs référencés en JS vs HTML');
    const jsIds   = new Set([...js.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));
    const htmlIds = new Set([...htmlForIds.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
    const missingIds = [...jsIds].filter(id =>
      !htmlIds.has(id) &&
      !KNOWN_DYNAMIC.has(id) &&
      !id.includes('$') &&
      !id.startsWith('participants_') &&
      !id.startsWith('sessionActions_')
    );
    if (missingIds.length === 0) console.log('  ✅ Tous les IDs JS trouvés dans le HTML');
    else { missingIds.sort().forEach(id => console.error(`  ❌ getElementById('${id}') absent du HTML`)); errors += missingIds.length; }
  }

  return errors;
}

// ── Main ────────────────────────────────────────────────────────
let totalErrors = 0;
for (const file of filesToValidate) {
  totalErrors += validateFile(file);
}

console.log(`\n${'═'.repeat(60)}`);
if (filesToValidate.length > 1) {
  console.log(`📦  ${filesToValidate.length} modules validés`);
}
if (totalErrors === 0) {
  console.log('✅  TOUS LES FICHIERS PROPRES — prêt à déployer\n');
  process.exit(0);
} else {
  console.error(`❌  ${totalErrors} PROBLÈME(S) — NE PAS DÉPLOYER\n`);
  process.exit(1);
}
