// ═══════════════════════════════════════════════════════════════
//  tests.js — Ultras Lutetia PWA
//  Usage : node tests.js
//  Ne nécessite pas Supabase — teste les fonctions pures
// ═══════════════════════════════════════════════════════════════

// ── Simuler le DOM minimal pour les fonctions de rendu ──────────
global.document = {
  _els: {},
  getElementById: (id) => global.document._els[id] || {
    style: { display: '' }, value: '', checked: false,
    textContent: '', innerHTML: '',
    classList: { add:()=>{}, remove:()=>{}, contains:()=>false },
    querySelectorAll: ()=>[], querySelector:()=>null,
  },
  querySelectorAll: ()=>[],
  createElement: ()=>({ className:'', textContent:'', remove:()=>{}, style:{} }),
  body: { appendChild:()=>{} },
};
global.navigator = { clipboard: { writeText: ()=>Promise.resolve() } };
global.UL = { getCurrentMembre: () => ({ roles_app: ['admin_app'], statut:'confirme' }) };
global.allMembres = [];
global.allCartage = [];

// ── Charger les fonctions testables ────────────────────────────
const {
  hasRoleApp, isAdmin, isBureau, isCellule,
  hasCelluleTifo, hasCelluleDepl, hasCelluleMatos,
  hasCelluleSticks, hasCelluleComite, peutValiderInscriptions,
  esc, PIZZAS, PINTES,
  renderTifoCard, renderDeplCard, renderMembres,
  renderMatchCard, renderEvenementCard, renderMatos,
  filtrerMembres, filtrerCartage,
} = require('./testable.js');

// ── Framework de test ────────────────────────────────────────────
let passed = 0, failed = 0, total = 0;

function test(nom, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ ${nom}`);
    passed++;
  } catch(e) {
    console.log(`  ❌ ${nom}`);
    console.log(`     → ${e.message}`);
    failed++;
  }
}

function expect(val) {
  return {
    toBe:           (exp) => { if (val !== exp) throw new Error(`Reçu: ${JSON.stringify(val)} | Attendu: ${JSON.stringify(exp)}`); },
    toBeTrue:       ()    => { if (val !== true) throw new Error(`Attendu true, reçu: ${JSON.stringify(val)}`); },
    toBeFalse:      ()    => { if (val !== false) throw new Error(`Attendu false, reçu: ${JSON.stringify(val)}`); },
    toContain:      (str) => { if (!String(val).includes(str)) throw new Error(`"${str}" absent dans: "${String(val).slice(0,100)}..."`); },
    toNotContain:   (str) => { if (String(val).includes(str)) throw new Error(`"${str}" ne devrait pas être présent`); },
    toBeDefined:    ()    => { if (val == null) throw new Error(`Valeur null/undefined`); },
    toBeGreaterThan:(n)   => { if (val <= n) throw new Error(`${val} n'est pas > ${n}`); },
    toBe_length:    (n)   => { if (val.length !== n) throw new Error(`Longueur: ${val.length}, attendu: ${n}`); },
  };
}

// ── Données de test communes ─────────────────────────────────────
const M = {
  admin:   { roles_app: ['admin_app'] },
  bureau:  { roles_app: ['bureau_app'] },
  tifo:    { roles_app: ['cellule_tifo'] },
  depl:    { roles_app: ['cellule_depl'] },
  matos:   { roles_app: ['cellule_matos'] },
  sticks:  { roles_app: ['cellule_sticks'] },
  comite:  { roles_app: ['cellule_comite'] },
  multi:   { roles_app: ['cellule_tifo', 'cellule_depl'] },
  vide:    { roles_app: [] },
  null_r:  { roles_app: null },
};

const SESSION = {
  id:'s1', nom:'Tifo Peinture #5', date:'2026-06-20',
  heure:'09:00:00', lieu:'Paris Sud', type_session:'Peinture',
  statut:'a_venir', avec_pizza:false, capacite_max:25,
  _nb_inscrits:12, lien_telegram:'https://t.me/test', code_validation:null,
};
const SESSION_PIZZA  = { ...SESSION, id:'s2', avec_pizza:true };
const SESSION_OPEN   = { ...SESSION, id:'s3', statut:'en_cours', code_validation:'4827' };
const SESSION_CLOSED = { ...SESSION, id:'s4', statut:'terminee' };

const DEPL = {
  id:'d1', adversaire:'OGC Nice', date_match:'2026-08-15',
  stade:'Allianz Riviera', ville:'Nice',
  prix_total:55, places_max:40, statut:'ouvert', _inscrits:18,
};

const MATCH = {
  id:'m1', equipe_domicile:'OGC Nice', equipe_exterieur:'Paris FC',
  date:'2026-08-22', horaire:'20:45:00', type:'exterieur',
  stade:'Allianz Riviera', competition:'Ligue 1', journee:3,
  statut:'a_venir', score_domicile:null, score_exterieur:null,
};

const XSS = '<script>alert("xss")</script>';
const XSS2 = '<img src=x onerror="evil()">';


// ════════════════════════════════════════════════════════════════
// 1. DROITS — roles_app
// ════════════════════════════════════════════════════════════════
console.log('\n── 1. Droits & Rôles ───────────────────────────────────────');

test('isAdmin — admin_app → true',                () => expect(isAdmin(M.admin)).toBeTrue());
test('isAdmin — bureau_app → false',              () => expect(isAdmin(M.bureau)).toBeFalse());
test('isAdmin — cellule_tifo → false',            () => expect(isAdmin(M.tifo)).toBeFalse());
test('isAdmin — roles vides → false',             () => expect(isAdmin(M.vide)).toBeFalse());
test('isAdmin — null → false',                    () => expect(isAdmin(null)).toBeFalse());
test('isAdmin — undefined → false',               () => expect(isAdmin(undefined)).toBeFalse());
test('isAdmin — roles_app null → false',          () => expect(isAdmin(M.null_r)).toBeFalse());

test('isBureau — admin → true',                   () => expect(isBureau(M.admin)).toBeTrue());
test('isBureau — bureau → true',                  () => expect(isBureau(M.bureau)).toBeTrue());
test('isBureau — tifo → false',                   () => expect(isBureau(M.tifo)).toBeFalse());
test('isBureau — confirme vide → false',          () => expect(isBureau(M.vide)).toBeFalse());

test('isCellule — admin → true',                  () => expect(isCellule(M.admin)).toBeTrue());
test('isCellule — bureau → true',                 () => expect(isCellule(M.bureau)).toBeTrue());
test('isCellule — tifo → true',                   () => expect(isCellule(M.tifo)).toBeTrue());
test('isCellule — depl → true',                   () => expect(isCellule(M.depl)).toBeTrue());
test('isCellule — matos → true',                  () => expect(isCellule(M.matos)).toBeTrue());
test('isCellule — sticks → true',                 () => expect(isCellule(M.sticks)).toBeTrue());
test('isCellule — comite → true',                 () => expect(isCellule(M.comite)).toBeTrue());
test('isCellule — vide → false',                  () => expect(isCellule(M.vide)).toBeFalse());
test('isCellule — null → false',                  () => expect(isCellule(null)).toBeFalse());

test('hasCelluleTifo — admin → true',             () => expect(hasCelluleTifo(M.admin)).toBeTrue());
test('hasCelluleTifo — bureau → true',            () => expect(hasCelluleTifo(M.bureau)).toBeTrue());
test('hasCelluleTifo — tifo → true',              () => expect(hasCelluleTifo(M.tifo)).toBeTrue());
test('hasCelluleTifo — depl → false',             () => expect(hasCelluleTifo(M.depl)).toBeFalse());
test('hasCelluleTifo — matos → false',            () => expect(hasCelluleTifo(M.matos)).toBeFalse());

test('hasCelluleDepl — admin → true',             () => expect(hasCelluleDepl(M.admin)).toBeTrue());
test('hasCelluleDepl — depl → true',              () => expect(hasCelluleDepl(M.depl)).toBeTrue());
test('hasCelluleDepl — tifo → false',             () => expect(hasCelluleDepl(M.tifo)).toBeFalse());

test('hasCelluleMatos — matos → true',            () => expect(hasCelluleMatos(M.matos)).toBeTrue());
test('hasCelluleMatos — sticks → false',          () => expect(hasCelluleMatos(M.sticks)).toBeFalse());
test('hasCelluleMatos — bureau → true',           () => expect(hasCelluleMatos(M.bureau)).toBeTrue());

test('hasCelluleSticks — sticks → true',          () => expect(hasCelluleSticks(M.sticks)).toBeTrue());
test('hasCelluleSticks — matos → false',          () => expect(hasCelluleSticks(M.matos)).toBeFalse());

test('hasCelluleComite — comite → true',          () => expect(hasCelluleComite(M.comite)).toBeTrue());
test('hasCelluleComite — tifo → false',           () => expect(hasCelluleComite(M.tifo)).toBeFalse());

test('peutValider — admin → true',                () => expect(peutValiderInscriptions(M.admin)).toBeTrue());
test('peutValider — bureau → true',               () => expect(peutValiderInscriptions(M.bureau)).toBeTrue());
test('peutValider — comite → true',               () => expect(peutValiderInscriptions(M.comite)).toBeTrue());
test('peutValider — tifo → false',                () => expect(peutValiderInscriptions(M.tifo)).toBeFalse());
test('peutValider — null → false',                () => expect(peutValiderInscriptions(null)).toBeFalse());

test('Multi-rôles tifo+depl → hasCelluleTifo',   () => expect(hasCelluleTifo(M.multi)).toBeTrue());
test('Multi-rôles tifo+depl → hasCelluleDepl',   () => expect(hasCelluleDepl(M.multi)).toBeTrue());
test('Multi-rôles tifo+depl → pas hasCelluleMatos', () => expect(hasCelluleMatos(M.multi)).toBeFalse());


// ════════════════════════════════════════════════════════════════
// 2. UTILITAIRES — esc()
// ════════════════════════════════════════════════════════════════
console.log('\n── 2. esc() — Protection XSS ───────────────────────────────');

test('esc — chaîne normale inchangée',            () => expect(esc('Bonjour Paris FC')).toBe('Bonjour Paris FC'));
test('esc — < encodé',                            () => expect(esc('<')).toBe('&lt;'));
test('esc — > encodé',                            () => expect(esc('>')).toBe('&gt;'));
test('esc — & encodé',                            () => expect(esc('&')).toBe('&amp;'));
test('esc — " encodé',                            () => expect(esc('"')).toBe('&quot;'));
test('esc — null → chaîne vide',                  () => expect(esc(null)).toBe(''));
test('esc — undefined → chaîne vide',             () => expect(esc(undefined)).toBe(''));
test('esc — nombre → string',                     () => expect(esc(42)).toBe('42'));
test('esc — <script> neutralisé',                 () => expect(esc(XSS)).toNotContain('<script>'));
test('esc — tag img neutralisé (< encodé)',        () => expect(esc(XSS2)).toNotContain('<img '));
test('esc — apostrophe conservée',                () => expect(esc("L'Ultra")).toContain("L'Ultra"));


// ════════════════════════════════════════════════════════════════
// 3. CONSTANTES
// ════════════════════════════════════════════════════════════════
console.log('\n── 3. Constantes Pizzas & Pintes ───────────────────────────');

test('PIZZAS — 5 options',                        () => expect(PIZZAS.length).toBe(5));
test('PIZZAS — margherita présente',              () => expect(PIZZAS.some(p => p.id === 'margherita')).toBeTrue());
test('PIZZAS — regina présente',                  () => expect(PIZZAS.some(p => p.id === 'regina')).toBeTrue());
test('PIZZAS — 4fromages présente',               () => expect(PIZZAS.some(p => p.id === '4fromages')).toBeTrue());
test('PIZZAS — bellissima présente',              () => expect(PIZZAS.some(p => p.id === 'bellissima')).toBeTrue());
test('PIZZAS — aucune présente',                  () => expect(PIZZAS.some(p => p.id === 'aucune')).toBeTrue());
test('PIZZAS — tous ont id, label, emoji',        () => expect(PIZZAS.every(p => p.id && p.label && p.emoji)).toBeTrue());
test('PINTES — 3 options',                        () => expect(PINTES.length).toBe(3));
test('PINTES — blonde présente',                  () => expect(PINTES.some(p => p.id === 'blonde')).toBeTrue());
test('PINTES — brune présente',                   () => expect(PINTES.some(p => p.id === 'brune')).toBeTrue());
test('PINTES — sans présente',                    () => expect(PINTES.some(p => p.id === 'sans')).toBeTrue());
test('PINTES — tous ont id, label, emoji',        () => expect(PINTES.every(p => p.id && p.label && p.emoji)).toBeTrue());


// ════════════════════════════════════════════════════════════════
// 4. renderTifoCard
// ════════════════════════════════════════════════════════════════
console.log('\n── 4. renderTifoCard ────────────────────────────────────');

test('tifo — contient le nom',                 () => expect(renderTifoCard(SESSION)).toContain('Tifo Peinture #5'));
test('tifo — contient le lieu',                () => expect(renderTifoCard(SESSION)).toContain('Paris Sud'));
test('tifo — contient heure',                  () => expect(renderTifoCard(SESSION)).toContain('09:00'));
test('tifo — badge À venir',                   () => expect(renderTifoCard(SESSION)).toContain('venir'));
test('tifo — badge En cours',                  () => expect(renderTifoCard(SESSION_OPEN)).toContain('cours'));
test('tifo — badge Terminée',                  () => expect(renderTifoCard(SESSION_CLOSED)).toContain('ermin'));
test('tifo — 🍕 si pizza',                     () => expect(renderTifoCard(SESSION_PIZZA)).toContain('🍕'));
test('tifo — pas pizza si sans',               () => expect(renderTifoCard(SESSION)).toNotContain('Tifo pizza'));
test('tifo — compteur places 12/25',           () => { const h = renderTifoCard(SESSION); expect(h).toContain('12'); });
test('tifo — code 4827 si session ouverte',    () => expect(renderTifoCard(SESSION_OPEN)).toContain('4827'));
test('tifo — bouton participants visible',      () => expect(renderTifoCard(SESSION)).toContain('participants'));
test('tifo — ID unique dans le HTML',          () => expect(renderTifoCard(SESSION)).toContain('s1'));
test('tifo — XSS nom neutralisé',              () => expect(renderTifoCard({...SESSION, nom: XSS})).toNotContain('<script>'));
test('tifo — XSS lieu neutralisé (tag img)',   () => expect(renderTifoCard({...SESSION, lieu: XSS2})).toNotContain('<img '));
test('tifo — bouton commandes pizza si open+pizza', () => {
  expect(renderTifoCard({...SESSION_OPEN, avec_pizza:true})).toContain('Commandes');
});


// ════════════════════════════════════════════════════════════════
// 5. renderDeplCard
// ════════════════════════════════════════════════════════════════
console.log('\n── 5. renderDeplCard ───────────────────────────────────────');

test('depl — contient adversaire',                () => expect(renderDeplCard(DEPL)).toContain('OGC Nice'));
test('depl — contient prix 55€',                  () => expect(renderDeplCard(DEPL)).toContain('55'));
test('depl — badge Ouvert',                       () => expect(renderDeplCard(DEPL)).toContain('Ouvert'));
test('depl — badge Complet',                      () => expect(renderDeplCard({...DEPL, statut:'complet'})).toContain('Complet'));
test('depl — badge Fermé',                        () => expect(renderDeplCard({...DEPL, statut:'ferme'})).toContain('erm'));
test('depl — barre places 18/40',                 () => { const h = renderDeplCard(DEPL); expect(h).toContain('18'); expect(h).toContain('40'); });
test('depl — XSS adversaire neutralisé',          () => expect(renderDeplCard({...DEPL, adversaire:XSS})).toNotContain('<script>'));
test('depl — Paris FC dans le titre',             () => expect(renderDeplCard(DEPL)).toContain('Paris FC'));


// ════════════════════════════════════════════════════════════════
// 6. renderMatchCard
// ════════════════════════════════════════════════════════════════
console.log('\n── 6. renderMatchCard ──────────────────────────────────────');

test('match — Paris FC présent',                  () => expect(renderMatchCard(MATCH, M.admin)).toContain('Paris FC'));
test('match — badge Extérieur',                   () => expect(renderMatchCard(MATCH, M.admin)).toContain('xtérieur'));
test('match — badge Domicile',                    () => expect(renderMatchCard({...MATCH, type:'domicile'}, M.admin)).toContain('omicile'));
test('match — journée J3',                        () => expect(renderMatchCard(MATCH, M.admin)).toContain('J3'));
test('match — compétition Ligue 1',               () => expect(renderMatchCard(MATCH, M.admin)).toContain('Ligue 1'));
test('match — score affiché si terminé',          () => {
  const m = {...MATCH, score_domicile:1, score_exterieur:2, statut:'termine', date:'2025-01-01'};
  const html = renderMatchCard(m, M.admin);
  expect(html).toContain('1');
  expect(html).toContain('2');
});
test('match — bouton score si admin + passé + pas de score', () => {
  const m = {...MATCH, statut:'termine', date:'2025-01-01'};
  expect(renderMatchCard(m, M.admin)).toContain('Saisir le score');
});
test('match — pas bouton score si simple membre', () => {
  const m = {...MATCH, statut:'termine', date:'2025-01-01'};
  expect(renderMatchCard(m, M.vide)).toNotContain('Saisir le score');
});
test('match — XSS neutralisé',                   () => expect(renderMatchCard({...MATCH, equipe_exterieur:XSS}, M.admin)).toNotContain('<script>'));


// ════════════════════════════════════════════════════════════════
// 7. renderEvenementCard
// ════════════════════════════════════════════════════════════════
console.log('\n── 7. renderEvenementCard ──────────────────────────────────');

const EVT = {
  reunion: { id:'e1', type:'reunion', nom:'Réunion mensuelle', date:'2026-07-10', lieu:'Paris', lien_helloasso:null },
  bbq:     { id:'e2', type:'bbq',     nom:'BBQ estival',       date:'2026-07-20', lieu:'Bois', lien_helloasso:'https://ha.com/bbq' },
  fete:    { id:'e3', type:'fete',    nom:'Fête fin de saison', date:'2026-06-30', lieu:'Paris', lien_helloasso:null },
  autre:   { id:'e4', type:'autre',   nom:'Événement surprise', date:'2026-08-01', lieu:null, lien_helloasso:null },
};

test('événement — réunion contient 🤝',           () => expect(renderEvenementCard(EVT.reunion)).toContain('🤝'));
test('événement — bbq contient 🍖',               () => expect(renderEvenementCard(EVT.bbq)).toContain('🍖'));
test('événement — fête contient 🎊',              () => expect(renderEvenementCard(EVT.fete)).toContain('🎊'));
test('événement — autre contient 🎉',             () => expect(renderEvenementCard(EVT.autre)).toContain('🎉'));
test('événement — nom affiché',                   () => expect(renderEvenementCard(EVT.reunion)).toContain('Réunion mensuelle'));
test('événement — lien HelloAsso si présent',     () => expect(renderEvenementCard(EVT.bbq)).toContain('Inscriptions'));
test('événement — pas lien si absent',            () => expect(renderEvenementCard(EVT.reunion)).toNotContain('Inscriptions'));
test('événement — bouton modifier si admin',      () => expect(renderEvenementCard(EVT.reunion)).toContain('Modifier'));
test('événement — XSS nom neutralisé',            () => expect(renderEvenementCard({...EVT.reunion, nom:XSS})).toNotContain('<script>'));


// ════════════════════════════════════════════════════════════════
// 8. renderMembres & filtres
// ════════════════════════════════════════════════════════════════
console.log('\n── 8. renderMembres & filtrerMembres ───────────────────────');

const MEMBRES_DATA = [
  { id:'a', prenom:'Remi', nom:'VF',  pseudo_telegram:'RemiVF', statut:'confirme',
    roles_app:['admin_app'], actif:true, section:{nom:'Ultra Lutetia'}, email:'remi@test.fr' },
  { id:'b', prenom:'Hadri',nom:'UL',  pseudo_telegram:'HadriUL',statut:'draft',
    roles_app:['cellule_tifo'], actif:true, section:null, email:null },
  { id:'c', prenom:'Jamy', nom:'UL',  pseudo_telegram:'JamyUL', statut:'confirme',
    roles_app:[], actif:false, section:{nom:'Ultra Lutetia'}, email:null },
];

global.allMembres = MEMBRES_DATA;
global.document._els['membresList']  = { innerHTML:'' };
global.document._els['searchMembre'] = { value:'' };
global.document._els['filterStatut'] = { value:'' };

renderMembres(MEMBRES_DATA);
test('membres — Remi affiché',                    () => expect(document._els['membresList'].innerHTML).toContain('Remi'));
test('membres — section Ultra Lutetia',           () => expect(document._els['membresList'].innerHTML).toContain('Ultra Lutetia'));
test('membres — roles_app affiché',               () => expect(document._els['membresList'].innerHTML).toContain('admin'));
test('membres — bouton Modifier',                 () => expect(document._els['membresList'].innerHTML).toContain('Modifier'));
test('membres — bouton Bloquer (actif)',          () => expect(document._els['membresList'].innerHTML).toContain('Bloquer'));
test('membres — bouton Débloquer (inactif)',      () => expect(document._els['membresList'].innerHTML).toContain('bloquer'));
test('membres — XSS prenom neutralisé (<script>)',() => {
  global.document._els['membresList'] = { innerHTML:'' };
  renderMembres([{...MEMBRES_DATA[0], prenom:XSS}]);
  expect(document._els['membresList'].innerHTML).toNotContain('<script>');
});

// filtrerMembres
global.allMembres = MEMBRES_DATA;
global.document._els['membresList'] = { innerHTML:'' };

test('filtrer — tous sans filtre',                () => {
  document._els['searchMembre'].value = '';
  document._els['filterStatut'].value = '';
  filtrerMembres();
  expect(document._els['membresList'].innerHTML).toContain('Remi');
  expect(document._els['membresList'].innerHTML).toContain('Hadri');
});
test('filtrer — recherche "remi"',                () => {
  document._els['searchMembre'].value = 'remi';
  document._els['filterStatut'].value = '';
  filtrerMembres();
  expect(document._els['membresList'].innerHTML).toContain('Remi');
  expect(document._els['membresList'].innerHTML).toNotContain('Hadri');
});
test('filtrer — statut draft',                    () => {
  document._els['searchMembre'].value = '';
  document._els['filterStatut'].value = 'draft';
  filtrerMembres();
  expect(document._els['membresList'].innerHTML).toContain('Hadri');
  expect(document._els['membresList'].innerHTML).toNotContain('Remi');
});
test('filtrer — recherche+statut combinés',       () => {
  document._els['searchMembre'].value = 'jamy';
  document._els['filterStatut'].value = 'confirme';
  filtrerMembres();
  expect(document._els['membresList'].innerHTML).toContain('Jamy');
  expect(document._els['membresList'].innerHTML).toNotContain('Remi');
});
test('filtrer — aucun résultat',                  () => {
  document._els['searchMembre'].value = 'xxxxxxxx';
  document._els['filterStatut'].value = '';
  filtrerMembres();
  expect(document._els['membresList'].innerHTML).toContain('ucun');
});


// ════════════════════════════════════════════════════════════════
// 9. filtrerCartage
// ════════════════════════════════════════════════════════════════
console.log('\n── 9. filtrerCartage ───────────────────────────────────────');

global.allCartage = [
  { id:'c1', prenom:'Remi', nom:'VF', pseudo_telegram:'Remi', statut:'confirme', cotisation_a_jour:true,  charte_signee:true  },
  { id:'c2', prenom:'Hadri',nom:'UL', pseudo_telegram:'Hadri',statut:'draft',    cotisation_a_jour:false, charte_signee:true  },
  { id:'c3', prenom:'Jamy', nom:'UL', pseudo_telegram:'Jamy', statut:'confirme', cotisation_a_jour:true,  charte_signee:false },
];
global.document._els['cartageListe']   = { innerHTML:'' };
global.document._els['cartageStats']   = { innerHTML:'' };
['fcartTous','fcartCartes','fcartIncomplets'].forEach(id => {
  global.document._els[id] = { classList: { remove:()=>{}, add:()=>{} } };
});

test('cartage — tous : 3 membres',                () => {
  filtrerCartage('tous');
  expect(document._els['cartageListe'].innerHTML).toContain('Remi');
  expect(document._els['cartageListe'].innerHTML).toContain('Hadri');
  expect(document._els['cartageListe'].innerHTML).toContain('Jamy');
});
test('cartage — cartés : seulement Remi',         () => {
  filtrerCartage('cartes');
  expect(document._els['cartageListe'].innerHTML).toContain('Remi');
  expect(document._els['cartageListe'].innerHTML).toNotContain('Hadri');
  expect(document._els['cartageListe'].innerHTML).toNotContain('Jamy');
});
test('cartage — incomplets : Hadri + Jamy',       () => {
  filtrerCartage('incomplets');
  expect(document._els['cartageListe'].innerHTML).toContain('Hadri');
  expect(document._els['cartageListe'].innerHTML).toContain('Jamy');
  expect(document._els['cartageListe'].innerHTML).toNotContain('Remi');
});
test('cartage — carte = cotisation ET charte',    () => {
  // Jamy a cotisation ok mais pas charte → incomplet
  filtrerCartage('cartes');
  expect(document._els['cartageListe'].innerHTML).toNotContain('Jamy');
});


// ════════════════════════════════════════════════════════════════
// 10. SÉCURITÉ XSS — couverture globale
// ════════════════════════════════════════════════════════════════
console.log('\n── 10. Sécurité XSS globale ────────────────────────────────');

// XSS : vérifier que les tags HTML sont neutralisés
// esc() encode < et > donc les tags deviennent inoffensifs
// (onerror= sans < > autour ne peut pas s'exécuter)
const XSS_CASES = [
  ['<script>alert(1)</script>', '<script>'],
  // <img onerror> : le tag est neutralisé car < est encodé en &lt;
  // On vérifie l'absence du tag, pas de l'attribut seul
  ['<img src=x onerror="evil()">', '<img '],
  ['"><script>alert(1)</script>', '<script>'],
];

XSS_CASES.forEach(([payload, dangerous]) => {
  test(`XSS session nom "${payload.slice(0,30)}..."`,
    () => expect(renderTifoCard({...SESSION, nom:payload})).toNotContain(dangerous));
  test(`XSS depl adversaire "${payload.slice(0,30)}..."`,
    () => expect(renderDeplCard({...DEPL, adversaire:payload})).toNotContain(dangerous));
  test(`XSS match equipe "${payload.slice(0,30)}..."`,
    () => expect(renderMatchCard({...MATCH, equipe_exterieur:payload}, M.admin)).toNotContain(dangerous));
  test(`XSS evenement nom "${payload.slice(0,30)}..."`,
    () => expect(renderEvenementCard({...EVT.reunion, nom:payload})).toNotContain(dangerous));
});




// ════════════════════════════════════════════════════════════════
// 11. NOUVELLES FONCTIONS — fixes nuit du 17/06
// ════════════════════════════════════════════════════════════════
console.log('\n── 11. Fixes — doLogout & messages erreur ──────────────────');

// doLogout : vérifier via le code source app.js
test('doLogout — est async',                      () => {
  const appSrc = require('fs').readFileSync('./src/app.js', 'utf8');
  const fn = appSrc.slice(appSrc.indexOf('async function doLogout'), appSrc.indexOf('// ─── App init'));
  expect(fn).toContain('async function doLogout');
});
test('doLogout — contient try/finally',           () => {
  const appSrc = require('fs').readFileSync('./src/app.js', 'utf8');
  const fn = appSrc.slice(appSrc.indexOf('async function doLogout'), appSrc.indexOf('// ─── App init'));
  expect(fn).toContain('try');
  expect(fn).toContain('finally');
});
test('doLogout — showLoginPage dans finally',     () => {
  const appSrc = require('fs').readFileSync('./src/app.js', 'utf8');
  const fn = appSrc.slice(appSrc.indexOf('async function doLogout'), appSrc.indexOf('// ─── App init'));
  const finallyBlock = fn.slice(fn.indexOf('finally'));
  expect(finallyBlock).toContain('showLoginPage');
});

// Vérifier que les fonctions render n'ont plus de UL.sb.from
test('renderTifoCard — pas de sb.from direct',  () => {
  expect(renderTifoCard.toString()).toNotContain('sb.from');
});
test('renderDeplCard — pas de sb.from direct',     () => {
  expect(renderDeplCard.toString()).toNotContain('sb.from');
});
test('renderMembres — pas de sb.from direct',      () => {
  expect(renderMembres.toString()).toNotContain('sb.from');
});

// Vérifier que les spinners de chargement sont présents dans le code
test('loadTifos — spinner de chargement',       () => {
  // On vérifie via le fichier source directement
  const appSrc = require('fs').readFileSync('./src/app.js', 'utf8');
  const loadTifosFn = appSrc.slice(appSrc.indexOf('async function loadTifos'), appSrc.indexOf('async function renderTifoCard') || appSrc.indexOf('function renderTifoCard'));
  expect(loadTifosFn).toContain('⏳');
});
test('loadDeplacements — spinner de chargement',   () => {
  const appSrc = require('fs').readFileSync('./src/app.js', 'utf8');
  const fn = appSrc.slice(appSrc.indexOf('async function loadDeplacements'), appSrc.indexOf('function renderDeplCard'));
  expect(fn).toContain('⏳');
});

// Messages d'erreur améliorés (plus de toast('Erreur') générique)
test('app.js — 0 toast générique',                () => {
  const appSrc = require('fs').readFileSync('./src/app.js', 'utf8');
  const genericErrors = appSrc.split('\n').filter(l => l.includes("toast('Erreur', 'error')"));
  expect(genericErrors.length).toBe(0);
});

// Vérifier que UL.sb.from() a disparu de app.js
test('app.js — 0 UL.sb.from() direct',            () => {
  const appSrc = require('fs').readFileSync('./src/app.js', 'utf8');
  expect(appSrc).toNotContain('UL.sb.from');
});


// ════════════════════════════════════════════════════════════════
// RÉSUMÉ FINAL
// ════════════════════════════════════════════════════════════════
const pct = Math.round((passed/total)*100);
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`Total  : ${total} tests`);
console.log(`✅ OK  : ${passed}`);
if (failed > 0) console.log(`❌ KO  : ${failed}`);
console.log(`Score  : ${pct}%`);
console.log('');
if (failed === 0) {
  console.log('✅  TOUS LES TESTS PASSENT');
} else {
  console.log(`❌  ${failed} TEST(S) EN ÉCHEC — corriger avant de déployer`);
}
console.log('');
process.exit(failed > 0 ? 1 : 0);
