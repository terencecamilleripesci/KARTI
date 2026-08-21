/* KARTI multiplayer-lobby audit.
   Loads js/mp.js + party.js + EVERY game file under a minimal DOM shim, then
   for every game key in the runtime registry asserts:
     · the LOBBY_GLOBAL global resolves (or the game is 'bare' on purpose)
     · KARTI_PARTY.online[k] publishes {start, remote}  (playable transport)
     · min/max seats match the relay's GAME_SEATS (parsed from the server file,
       read-only) — with the client's documented min>=2 clamp allowed
     · rulesHTML() returns real text
     · whether art/ui/logo-<k>.png exists, and whether LOGO_GAMES claims it
     · whether the game's own contract GATES online (canStart refuses a full
       table of ready humans) and with what reason
   Exit non-zero on any hard failure. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = '/home/foxhound/webclients/karti-malta';

/* ── the shim ─────────────────────────────────────────────────────── */
function makeEl(){
  const el = {
    style: { cssText:'', setProperty(){}, removeProperty(){} },
    dataset: {}, classList: { add(){}, remove(){}, toggle(){}, contains:()=>false },
    children: [], attributes: {},
    setAttribute(k,v){ this.attributes[k]=v; }, getAttribute(k){ return this.attributes[k]; },
    removeAttribute(){}, appendChild(c){ this.children.push(c); return c; },
    removeChild(){}, insertBefore(c){ return c; }, remove(){},
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; },
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    getElementsByTagName(){ return []; }, closest(){ return null; },
    getBoundingClientRect(){ return { left:0, top:0, width:360, height:640, right:360, bottom:640 }; },
    focus(){}, blur(){}, click(){}, scrollTo(){},
    getContext(){ return new Proxy({}, { get:(t,p)=> (p==='canvas'? el : (typeof p==='string'? ()=>({}) : undefined)) }); },
    innerHTML:'', textContent:'', value:'', scrollTop:0, scrollHeight:0, clientHeight:0,
    offsetWidth:360, offsetHeight:640, width:0, height:0,
    content: null, cloneNode(){ return makeEl(); }
  };
  el.content = { cloneNode: () => makeEl(), firstElementChild: null };
  return el;
}
const documentShim = {
  readyState: 'complete', hidden: false, visibilityState: 'visible', title: '',
  body: makeEl(), head: makeEl(), documentElement: makeEl(),
  createElement: () => makeEl(), createElementNS: () => makeEl(),
  createTextNode: t => ({ textContent: t }),
  createDocumentFragment: () => makeEl(),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; },
  fonts: { add(){}, load: () => Promise.resolve() },
  activeElement: null
};
const storage = (() => { const m = new Map(); return {
  getItem: k => (m.has(k) ? m.get(k) : null),
  setItem: (k,v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(),
  key: i => Array.from(m.keys())[i] || null, get length(){ return m.size; } }; })();

global.window = global;
global.self = global;
global.document = documentShim;
global.localStorage = storage;
global.sessionStorage = storage;
global.location = { search:'', href:'https://test/', protocol:'https:', host:'test', hostname:'test', pathname:'/', hash:'' };
Object.defineProperty(global, 'navigator', { value:
  { userAgent:'node-audit', language:'en', clipboard:{ writeText: () => Promise.resolve() },
    vibrate(){}, onLine:true, serviceWorker: { register: () => Promise.resolve({}) } },
  configurable: true });
global.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
global.requestAnimationFrame = cb => setTimeout(cb, 16);
global.cancelAnimationFrame = id => clearTimeout(id);
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.dispatchEvent = () => true;
global.Event = class Event { constructor(t){ this.type = t; } };
global.CustomEvent = class CustomEvent extends global.Event { constructor(t,o){ super(t); this.detail = o && o.detail; } };
global.Image = class Image { constructor(){ this.onload = null; this.onerror = null; } set src(v){} };
global.Audio = class Audio { constructor(){} play(){ return Promise.resolve(); } pause(){} load(){} };
global.AudioContext = class AudioContext { constructor(){ throw new Error('no audio in audit'); } };
global.WebSocket = class WebSocket { constructor(){ this.readyState = 0; } send(){} close(){} };
global.fetch = () => Promise.reject(new Error('no network in audit'));
global.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} };
global.getComputedStyle = () => ({ getPropertyValue: () => '' });
global.innerWidth = 390; global.innerHeight = 844; global.devicePixelRatio = 2;
global.scrollTo = () => {};
global.history = { pushState(){}, replaceState(){}, back(){}, state:null };
global.screen = { width:390, height:844, orientation:{ type:'portrait-primary', addEventListener(){} } };
global.speechSynthesis = { getVoices: () => [], speak(){}, cancel(){}, addEventListener(){} };
global.performance = global.performance || { now: () => 0 };
global.URL = global.URL || class {};

/* window.KARTI — the app kernel (game.js). Games only touch it lazily and
   guarded; mp.js needs $, $$, esc and a few data wells. */
const noop = () => {};
global.KARTI = new Proxy({
  $: () => null, $$: () => [], esc: s => String(s == null ? '' : s),
  toast: noop, go: noop, on: noop, sfx: noop,
  STARTER_DECKS: {}, ATTR_ICON: {},
  S: { decks: [], name: 'Probe', settings: {} },
  deckIsLegal: () => true,
  displayName: () => 'Probe',
  save: noop, load: noop
}, { get: (t, p) => (p in t ? t[p] : (typeof p === 'string' ? noop : undefined)) });
global.ICO = (n) => '<svg data-ico="' + n + '"></svg>';

/* ── load the app the way index.html does ─────────────────────────── */
const FILES = [
  'js/mp.js',
  'js/party.js', 'js/chess.js', 'js/dama.js',
  'js/battleship.js', 'js/battleship-ui.js',
  'js/skarta.js', 'js/skarta-ui.js',
  'js/klabb.js', 'js/klabb-briscola.js', 'js/klabb-sette.js', 'js/klabb-cheat.js',
  'js/rummy.js', 'js/rummy-ui.js',
  'js/gin.js', 'js/gin-ui.js',
  'js/poker.js', 'js/poker-ui.js',
  'js/serp.js', 'js/serp-ui.js',
  'js/tombla.js', 'js/tombla-ui.js',
  'js/kiri.js', 'js/kiri-ai.js', 'js/kiri-ui.js',
  'js/spy-words.js', 'js/spy.js', 'js/spy-ui.js',
  'js/suspett.js', 'js/suspett-ui.js',
  'js/mimika.js', 'js/mimika-ui.js',
  'js/blackjack.js', 'js/tletin.js', 'js/cards2131-ui.js',
  'js/kanun.js', 'js/kanun-ui.js',
  'js/bomba.js', 'js/bomba-ui.js',
  'js/briks.js', 'js/briks-ui.js',
  'js/ludu.js', 'js/ludu-ui.js',
  'js/erbgha.js', 'js/erbgha-ui.js',
  'js/minhu.js', 'js/minhu-ui.js',
  'js/kodici.js', 'js/kodici-ui.js',
  'js/tankijiet.js', 'js/tankijiet-ui.js',
  'js/ballun.js', 'js/ballun-ui.js',
  'js/aqleb.js', 'js/aqleb-ui.js',
  'js/kaxxi.js', 'js/kaxxi-ui.js',
  'js/konkwista.js', 'js/konkwista-ui.js',
  'js/misteru.js', 'js/misteru-ui.js'
];
const loadFail = [];
for (const f of FILES){
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try {
    /* function-wrap: each file keeps its own top-level scope, exactly like a
       browser <script> for the IIFE style these files use; globals only ever
       land via window.* which is what the audit reads. */
    new Function('window', 'document', code).call(global, global, documentShim);
  } catch (e){
    loadFail.push(f + ' :: ' + (e && e.message));
  }
}

/* ── the relay's own seat table, parsed read-only ─────────────────── */
const srv = fs.readFileSync(path.join(ROOT, 'server/karti_server.py'), 'utf8');
const seatsBlock = srv.match(/GAME_SEATS\s*=\s*\{([\s\S]*?)\n\}/);
const RELAY = {};
if (seatsBlock){
  const re = /"([a-z0-9]+)":\s*\((\d+),\s*(\d+),\s*(\d+)\)/g;
  let m; while ((m = re.exec(seatsBlock[1]))) RELAY[m[1]] = [ +m[2], +m[3], +m[4] ];
}
/* GAME_VARIANT_SEATS narrows a game's range per mode; where EVERY variant of a
   game is narrowed (klabb: all four cap at 4) the union of the variant ranges
   is the range a client can actually seat, and that is what the client should
   publish. Parse it and fold the union over the base range. */
const varBlock = srv.match(/GAME_VARIANT_SEATS\s*=\s*\{([\s\S]*?)\n\}/);
const varBlockGames = srv.match(/GAME_VARIANTS\s*=\s*\{([\s\S]*?)\n\}/);
const VARIANTS_OF = {};
if (varBlockGames){
  const re = /"([a-z0-9]+)":\s*\(([^)]*)\)/g;
  let m; while ((m = re.exec(varBlockGames[1])))
    VARIANTS_OF[m[1]] = m[2].split(',').map(s => s.replace(/["'\s]/g, '')).filter(Boolean);
}
const VARSEAT = {};
if (varBlock){
  const re = /\("([a-z0-9]+)",\s*"([a-z0-9_]+)"\):\s*\((\d+),\s*(\d+),\s*(\d+)\)/g;
  let m; while ((m = re.exec(varBlock[1]))){
    (VARSEAT[m[1]] = VARSEAT[m[1]] || {})[m[2]] = [ +m[3], +m[4] ];
  }
}
/* the range the relay will actually seat for game k, considering variants */
function relayEffective(k){
  const base = RELAY[k];
  if (!base) return null;
  const vs = VARIANTS_OF[k];
  const narrowed = VARSEAT[k];
  if (!vs || !narrowed) return [ base[0], base[1] ];
  /* union over the variants; a variant with no narrowing keeps the base */
  let lo = Infinity, hi = 0;
  for (const v of vs){
    const r = narrowed[v] || base;
    lo = Math.min(lo, r[0]); hi = Math.max(hi, r[1]);
  }
  return [ lo, hi ];
}
const INSTANT = ['cards', 'chess', 'dama'];

/* ── the audit ────────────────────────────────────────────────────── */
const MPX = global.KARTI_MP;
if (!MPX){ console.error('KARTI_MP never registered'); process.exit(2); }
const P = global.KARTI_PARTY;
const LOGO_SRC = fs.readFileSync(path.join(ROOT, 'js/mp.js'), 'utf8');
const logoM = LOGO_SRC.match(/const LOGO_GAMES = \(('[^']*'\s*\+\s*)*'[^']*'\)\.split/);
const logoList = (LOGO_SRC.match(/const LOGO_GAMES = \(([\s\S]*?)\)\.split\(' '\)/) || [,''])[1]
  .replace(/['+\n ]+/g, ' ').trim().split(/\s+/).filter(Boolean);

function probeGate(k, LB){
  /* a full table of ready humans at the game's own default size; a contract
     that refuses even that is gated on purpose and says why */
  try {
    const seats = [];
    for (let i = 0; i < LB.defaultSeats; i++)
      seats.push({ seat:i, name:'P' + (i + 1), kind:'human', ready:true, level:0, link:'ok' });
    const v = LB.canStart(seats);
    if (v && v.ok === false) return String(v.why || '(no reason given)');
  } catch (e){ return 'PROBE THREW: ' + e.message; }
  return null;
}

const rows = [];
const fails = [];
const keys = MPX.GAME_KEYS.slice();
for (const k of keys){
  const meta = MPX.gameMeta(k);
  const LB = MPX.gameLobby(k);
  const net = P && P.online && P.online[k];
  const playable = MPX.gamePlayable(k);
  const startRemote = !!(net && net.start && net.remote) || k === 'cards';
  const relay = RELAY[k] || null;
  const logoFile = fs.existsSync(path.join(ROOT, 'art/ui/logo-' + k + '.png'));
  const logoClaimed = logoList.indexOf(k) >= 0;
  const gate = (INSTANT.indexOf(k) >= 0) ? null : probeGate(k, LB);
  let rules = '';
  try { rules = String(LB.rulesHTML() || ''); } catch (e){ rules = ''; }

  const notes = [];
  /* 1 · resolvable contract or a deliberate bare fallback */
  if (LB.bare && INSTANT.indexOf(k) < 0) notes.push('NO published lobby contract (bare)');
  /* 2 · transport */
  if (!startRemote) fails.push(k + ': no {start,remote} transport — tile is dead');
  /* 3 · seats vs the relay (client documents a min>=2 clamp) */
  if (!relay) fails.push(k + ': relay does not seat this game at all');
  else {
    const eff = relayEffective(k);
    const wantMin = Math.max(2, eff[0]);       /* client documents a min>=2 clamp */
    if (LB.minSeats !== wantMin || LB.maxSeats !== eff[1])
      fails.push(k + ': seats ' + LB.minSeats + '..' + LB.maxSeats +
                 ' vs relay effective ' + eff[0] + '..' + eff[1] +
                 ' (base ' + relay[0] + '..' + relay[1] + ')');
  }
  /* 4 · rules panel */
  if (!rules || rules.length < 20) fails.push(k + ': rulesHTML missing/empty');
  /* 5 · logo honesty */
  if (logoClaimed && !logoFile) fails.push(k + ': LOGO_GAMES claims a png that is not on disk');
  if (!logoClaimed && logoFile) notes.push('logo png exists on disk but LOGO_GAMES does not show it');
  /* 6 · variants (informational) */
  let variants = 0;
  try {
    let raw = LB._pub && LB._pub.variants;
    if (typeof raw === 'function') raw = raw.call(LB._pub);
    if (Array.isArray(raw)) variants = raw.length;
  } catch (e){}

  rows.push({
    game: k, name: meta.name,
    contract: LB.bare ? 'bare' : 'published',
    transport: startRemote ? 'start+remote' : 'MISSING',
    seats: LB.minSeats + '..' + LB.maxSeats,
    relay: relay ? relay[0] + '..' + relay[1] : 'NOT SEATED',
    variants,
    logo: logoFile ? (logoClaimed ? 'png+shown' : 'png HIDDEN') : 'glyph',
    gated: gate ? ('GATED: ' + gate.slice(0, 60)) : '',
    notes: notes.join('; ')
  });
}

/* mimika: online half exists on the phone but the relay does not seat it —
   assert it is correctly kept OUT of the registry (a tile would be a dead room) */
if (keys.indexOf('mimika') >= 0) fails.push('mimika is in the registry but the relay cannot seat it');
if (P && P.online && P.online.mimika && keys.indexOf('mimika') < 0)
  rows.push({ game:'mimika', name:'Mimika', contract:'(not offered)', transport:'start+remote',
              seats:'-', relay:'NOT SEATED', variants:0, logo:'glyph',
              gated:'kept out of the picker on purpose (relay has no seat table for it)', notes:'' });

/* relay games with no client tile at all = a room the list could show but the
   phone would mislabel */
for (const rk of Object.keys(RELAY))
  if (keys.indexOf(rk) < 0)
    fails.push('relay seats "' + rk + '" but the client registry has no tile for it');

/* the gate list must be exactly the deliberate ones */
const gatedNow = rows.filter(r => r.gated && r.game !== 'mimika').map(r => r.game).sort();
console.log('\n══ KARTI multiplayer lobby audit ══');
if (loadFail.length){ console.log('\nLOAD FAILURES:'); loadFail.forEach(f => console.log('  ✗ ' + f)); }
console.table(rows);
console.log('gated (deliberate, honest reason shown): ' + (gatedNow.join(', ') || 'none'));
console.log('picker offers (playable & ungated): ' +
  keys.filter(x => MPX.gamePlayable(x) && !rows.find(r => r.game === x && r.gated)).join(', '));
if (typeof MPX.gameGated === 'function'){
  const viaMp = keys.filter(x => MPX.gameGated(x));
  console.log('mp.js gameGated() agrees: ' + (viaMp.join(', ') || 'none'));
  const a = JSON.stringify(viaMp.sort()), b = JSON.stringify(gatedNow);
  if (a !== b) fails.push('gameGated() (' + a + ') disagrees with the probe (' + b + ')');
} else {
  console.log('mp.js gameGated(): NOT PRESENT — picker cannot tell a gated game from a live one');
}

if (fails.length){
  console.log('\nFAILURES:');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('\nALL ASSERTIONS PASS (' + rows.length + ' games audited)');
process.exit(0);
