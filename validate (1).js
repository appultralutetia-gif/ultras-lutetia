#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  validate.js — Ultras Lutetia PWA
//  Usage : node validate.js index.html
//  Lance avant chaque déploiement ou commit.
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const { execSync } = require('child_process');

const file = process.argv[2] || 'src/app.js';
if (!fs.existsSync(file)) {
  console.error(`❌ Fichier introuvable : ${file}`);
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');

// ── Supporter .js direct ou .html avec bloc <script> ───────────
let js, htmlForIds;
if (file.endsWith('.js')) {
  js = raw;
  // Pour la vérification des IDs, chercher index.html à côté
  const htmlPath = file.replace('src/app.js','index.html').replace('app.js','index.html');
  htmlForIds = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : raw;
} else {
  const jsStart = raw.indexOf('<script>');
  const jsEnd   = raw.lastIndexOf('</script>');
  if (jsStart === -1 || jsEnd === -1) {
    console.error('❌ Pas de bloc <script> trouvé');
    process.exit(1);
  }
  js = raw.slice(jsStart + 8, jsEnd);
  htmlForIds = raw;
}
const tmpFile = '/tmp/_ul_validate.js';
fs.writeFileSync(tmpFile, js);

let errors = 0;

// ── 1. Syntaxe JS (node --check) ────────────────────────────────
console.log('\n── 1. Syntaxe JS ───────────────────────────────');
try {
  execSync(`node --check ${tmpFile}`, { stdio: 'pipe' });
  console.log('  ✅ Syntaxe valide');
} catch (e) {
  console.error('  ❌ ERREUR SYNTAXE :');
  console.error(e.stderr.toString());
  errors++;
}

// ── 2. Fonctions critiques ───────────────────────────────────────
console.log('\n── 2. Fonctions critiques ──────────────────────');
const REQUIRED_FUNCTIONS = [
  'doLogin', 'doInscription', 'doLogout', 'showApp', 'showLoginPage',
  'showPage', 'applyRights',
  'loadAccueil', 'loadTifos', 'loadDeplacements', 'loadBoutique',
  'loadProfil', 'loadMembres', 'loadCalendrier', 'loadCartage',
  'loadDemandesAdmin', 'loadStats',
  'isAdmin', 'isBureau', 'isCellule',
  'hasCelluleTifo', 'hasCelluleDepl', 'hasCelluleMatos',
  'hasCelluleSticks', 'hasCelluleComite', 'peutValiderInscriptions',
  'showConfirmInscription', 'doInscrire',
  'openEditMembre', 'doSauvegarderMembre',
  'doSauvegarderEvenement', 'ouvrirCreerEvenement',
  'toast', 'showModal', 'closeModal',
  'loadCalendrier', 'loadCartage', 'saisirScore',
  'renderTifoCard', 'renderDeplCard', 'renderMembres',
  'switchBoutiqueTab', 'filtrerCartage', 'filtrerCalendrier',
];
const missing = REQUIRED_FUNCTIONS.filter(fn => !new RegExp(`function\\s+${fn}\\s*\\(`).test(js));
if (missing.length === 0) {
  console.log('  ✅ Toutes les fonctions présentes');
} else {
  missing.forEach(fn => console.error(`  ❌ MANQUANTE : ${fn}`));
  errors += missing.length;
}

// ── 3. await dans fonctions non-async ───────────────────────────
console.log('\n── 3. await dans fonctions non-async ──────────');
const lines = js.split('\n');
let depth = 0;
// Stack: { name, isAsync, openDepth }
let funcStack = [];
let awaitErrors = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const lineNum = i + 1;
  const opens  = (line.match(/{/g) || []).length;
  const closes = (line.match(/}/g) || []).length;

  // Détecter déclaration de fonction nommée
  const fnMatch = line.match(/(async\s+)?function\s+(\w+)\s*\(/);
  if (fnMatch) {
    funcStack.push({ name: fnMatch[2], isAsync: !!fnMatch[1], openDepth: depth });
  }
  // Détecter arrow async
  if (/(async\s*\(|async\s+\w+\s*=>)/.test(line)) {
    funcStack.push({ name: '__arrow__', isAsync: true, openDepth: depth });
  }

  depth += opens - closes;

  // Dépiler les fonctions dont la profondeur d'ouverture est dépassée
  funcStack = funcStack.filter(f => f.openDepth < depth || (f.openDepth === depth && opens > 0));

  // Vérifier await
  if (/\bawait\s/.test(line)) {
    const currentIsAsync = funcStack.some(f => f.isAsync);
    if (!currentIsAsync && funcStack.length > 0) {
      const fn = funcStack[funcStack.length - 1].name;
      awaitErrors.push(`  ❌ Line ${lineNum} dans '${fn}': ${line.trim().slice(0, 80)}`);
    }
  }
}

if (awaitErrors.length === 0) {
  console.log('  ✅ Aucun await dans une fonction non-async');
} else {
  awaitErrors.forEach(e => console.error(e));
  errors += awaitErrors.length;
}

// ── 4. Apostrophes non échappées dans strings JS ────────────────
console.log('\n── 4. Apostrophes dans strings JS ─────────────');
const aposErrors = [];
lines.forEach((line, i) => {
  // Chercher 'texte l'texte' hors double-quotes
  if (/'[^'"]*\bl'[a-zA-ZÀ-ÿ]/.test(line) && !line.trim().startsWith('//')) {
    aposErrors.push(`  ⚠️  Line ${i+1}: ${line.trim().slice(0, 80)}`);
  }
});
if (aposErrors.length === 0) {
  console.log('  ✅ Aucune apostrophe suspecte');
} else {
  aposErrors.forEach(e => console.warn(e));
  // Warning uniquement, pas d'erreur bloquante (node --check l'aurait déjà attrapé)
}

// ── 5. IDs JS vs HTML ───────────────────────────────────────────
console.log('\n── 5. IDs référencés en JS vs HTML ────────────');
const jsIds   = new Set([...js.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));
const htmlIds = new Set([...htmlForIds.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

// IDs générés dynamiquement ou connus comme absents volontairement
const KNOWN_DYNAMIC = new Set([
  'qrDepl', 'taillesContainer',
  'photoPreviewImgStick', 'photoPreviewStick', // guarded avec if(el)
  'codePresence', 'cmdMode', 'cmdTaille',       // injectés dynamiquement dans modals
  'pizzaChoixContainer', 'pinteChoixContainer', // injectés par ouvrirModalPresence
]);

const missingIds = [...jsIds].filter(id =>
  !htmlIds.has(id) &&
  !KNOWN_DYNAMIC.has(id) &&
  !id.includes('$') &&
  !id.startsWith('participants_') &&
  !id.startsWith('sessionActions_')
);

if (missingIds.length === 0) {
  console.log('  ✅ Tous les IDs JS trouvés dans le HTML');
} else {
  missingIds.sort().forEach(id => console.error(`  ❌ getElementById('${id}') absent du HTML`));
  errors += missingIds.length;
}

// ── Résumé ───────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
if (errors === 0) {
  console.log('✅  FICHIER PROPRE — prêt à déployer\n');
  process.exit(0);
} else {
  console.error(`❌  ${errors} PROBLÈME(S) — NE PAS DÉPLOYER\n`);
  process.exit(1);
}
