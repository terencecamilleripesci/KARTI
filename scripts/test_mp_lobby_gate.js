/* Behavior test for the multiplayer picker/gate changes in js/mp.js.
   Same shim as mp_audit.js but with a real-enough element registry so painted
   innerHTML can be read back, and a counting WebSocket so "no socket was
   opened" is provable. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = '/home/foxhound/webclients/karti-malta';

/* ── element with innerHTML that PARSES far enough to query buttons ── */
let WS_OPENED = 0;
const REG = {};                       /* id -> element */
function makeEl(tag){
  const el = {
    tag: tag || 'div', _html: '',
    style: { cssText:'', setProperty(){}, removeProperty(){} },
    dataset: {}, attributes: {},
    classList: { add(){}, remove(){}, toggle(){}, contains:()=>false },
    children: [],
    setAttribute(k,v){ this.attributes[k]=String(v); if (k==='id') REG[v]=this; },
    getAttribute(k){ return this.attributes[k]; }, removeAttribute(){},
    appendChild(c){ this.children.push(c); return c; }, removeChild(){},
    insertBefore(c){ return c; }, remove(){},
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; },
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    getElementsByTagName(){ return []; }, closest(){ return null; },
    getBoundingClientRect(){ return { left:0, top:0, width:360, height:640, right:360, bottom:640 }; },
    focus(){}, blur(){}, click(){}, scrollTo(){},
    getContext(){ return new Proxy({}, { get:()=>()=>({}) }); },
    scrollTop:0, scrollHeight:0, clientHeight:0, offsetWidth:360, offsetHeight:640,
    value:'', textContent:'', cloneNode(){ return makeEl(); }
  };
  Object.defineProperty(el, 'innerHTML', {
    get(){ return this._html; }, set(v){ this._html = String(v); }
  });
  el.content = { cloneNode: () => makeEl(), firstElementChild: null };
  return el;
}
/* screens mp.js paints into */
for (const id of ['scr-mp', 'mp-body', 'mp-stat', 'mp-rooms', 'mp-inbox',
                  'mp-social', 'mp-pick']) REG[id] = makeEl();
global.__VIVIFY = false;

const documentShim = {
  readyState: 'complete', hidden: false, visibilityState: 'visible', title: '',
  body: makeEl('body'), head: makeEl('head'), documentElement: makeEl('html'),
  createElement: t => makeEl(t), createElementNS: () => makeEl(),
  createTextNode: t => ({ textContent: t }), createDocumentFragment: () => makeEl(),
  getElementById: id => REG[id] || null,
  /* after load, unseen ids auto-vivify so mpScreen's post-paint wiring finds a
     stub to hang handlers on; during load they stay null so nothing mounts */
  querySelector: sel => {
    const m = /^#([\w-]+)/.exec(sel || '');
    if (!m) return null;
    if (REG[m[1]]) return REG[m[1]];
    return global.__VIVIFY ? (REG[m[1]] = makeEl()) : null;
  },
  querySelectorAll: () => [],
  addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; },
  fonts: { add(){}, load: () => Promise.resolve() }, activeElement: null
};
const storage = (() => { const m = new Map(); return {
  getItem: k => (m.has(k) ? m.get(k) : null),
  setItem: (k,v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(),
  key: i => Array.from(m.keys())[i] || null, get length(){ return m.size; } }; })();

global.window = global; global.self = global;
global.document = documentShim;
global.localStorage = storage; global.sessionStorage = storage;
global.location = { search:'', href:'https://test/', protocol:'https:', host:'test', hostname:'test', pathname:'/', hash:'' };
Object.defineProperty(global, 'navigator', { value:
  { userAgent:'node-audit', language:'en', clipboard:{ writeText: () => Promise.resolve() },
    vibrate(){}, onLine:true, serviceWorker: { register: () => Promise.resolve({}) } },
  configurable: true });
global.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
global.requestAnimationFrame = cb => setTimeout(cb, 16);
global.cancelAnimationFrame = id => clearTimeout(id);
global.addEventListener = () => {}; global.removeEventListener = () => {};
global.dispatchEvent = () => true;
global.Event = class Event { constructor(t){ this.type = t; } };
global.CustomEvent = class CustomEvent extends global.Event { constructor(t,o){ super(t); this.detail = o && o.detail; } };
global.Image = class Image { set src(v){} };
global.Audio = class Audio { play(){ return Promise.resolve(); } pause(){} load(){} };
global.WebSocket = class WebSocket {
  constructor(){ WS_OPENED++; this.readyState = 0; }
  send(){} close(){}
};
global.fetch = () => Promise.reject(new Error('no network'));
global.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} };
global.getComputedStyle = () => ({ getPropertyValue: () => '' });
global.innerWidth = 390; global.innerHeight = 844; global.devicePixelRatio = 2;
global.scrollTo = () => {};
global.history = { pushState(){}, replaceState(){}, back(){}, state:null };
global.screen = { width:390, height:844, orientation:{ type:'portrait-primary', addEventListener(){} } };
global.speechSynthesis = { getVoices: () => [], speak(){}, cancel(){}, addEventListener(){} };
global.URL = global.URL || class {};

const noop = () => {};
global.KARTI = new Proxy({
  $: sel => documentShim.querySelector(sel), $$: () => [],
  esc: s => String(s == null ? '' : s),
  toast: noop, go: noop, on: noop, sfx: noop,
  STARTER_DECKS: { fire: { name:'Fire', f:'fire', c:'#f00', list:[] } }, ATTR_ICON: {},
  S: { decks: [], name: 'Probe', settings: {} },
  deckIsLegal: () => true, displayName: () => 'Probe',
  save: noop, load: noop
}, { get: (t, p) => (p in t ? t[p] : (typeof p === 'string' ? noop : undefined)) });
global.ICO = n => '<svg data-ico="' + n + '"></svg>';

const FILES = [
  'js/mp.js', 'js/party.js', 'js/chess.js', 'js/dama.js',
  'js/battleship.js', 'js/battleship-ui.js', 'js/skarta.js', 'js/skarta-ui.js',
  'js/klabb.js', 'js/klabb-briscola.js', 'js/klabb-sette.js', 'js/klabb-cheat.js',
  'js/rummy.js', 'js/rummy-ui.js', 'js/gin.js', 'js/gin-ui.js',
  'js/poker.js', 'js/poker-ui.js', 'js/serp.js', 'js/serp-ui.js',
  'js/tombla.js', 'js/tombla-ui.js', 'js/kiri.js', 'js/kiri-ai.js', 'js/kiri-ui.js',
  'js/spy-words.js', 'js/spy.js', 'js/spy-ui.js', 'js/suspett.js', 'js/suspett-ui.js',
  'js/mimika.js', 'js/mimika-ui.js', 'js/blackjack.js', 'js/tletin.js', 'js/cards2131-ui.js',
  'js/kanun.js', 'js/kanun-ui.js', 'js/bomba.js', 'js/bomba-ui.js',
  'js/briks.js', 'js/briks-ui.js', 'js/ludu.js', 'js/ludu-ui.js',
  'js/erbgha.js', 'js/erbgha-ui.js', 'js/minhu.js', 'js/minhu-ui.js',
  'js/kodici.js', 'js/kodici-ui.js', 'js/tankijiet.js', 'js/tankijiet-ui.js',
  'js/ballun.js', 'js/ballun-ui.js', 'js/aqleb.js', 'js/aqleb-ui.js',
  'js/kaxxi.js', 'js/kaxxi-ui.js', 'js/konkwista.js', 'js/konkwista-ui.js',
  'js/misteru.js', 'js/misteru-ui.js'
];
for (const f of FILES){
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { new Function('window', 'document', code).call(global, global, documentShim); }
  catch (e){ console.error('LOAD FAIL ' + f + ': ' + e.message); process.exit(2); }
}

global.__VIVIFY = true;
const MPX = global.KARTI_MP;
const fails = [];
const ok = (cond, name) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fails.push(name); };

/* ── 1 · the picker paints every game with an icon, gated tiles marked ── */
MPX.mpScreen();
const html = REG['scr-mp'].innerHTML;
ok(html.length > 5000, 'mpScreen painted the Online screen');
for (const g of MPX.GAMES){
  const tile = new RegExp('data-g="' + g.k + '"').test(html);
  ok(tile, 'tile exists: ' + g.k);
}
ok(!/Not on this phone/.test(html), 'no tile degrades to "Not on this phone" on a full build');
/* THE HIDDEN-HAND GAMES ARE LIVE NOW: the relay deals a fresh private
   hand every round ({t:'redeal'} → net.redeal) and both poker and 21·31
   wired their lobbies to it, so their own canStart lets an all-human
   ready table go — neither tile may be gated any more. */
const pokerTile = html.match(/<button class="mp-g[^"]*" data-g="poker"[^>]*>[\s\S]*?<\/button>/);
ok(pokerTile && !/gated/.test(pokerTile[0]), 'poker tile is NOT gated (online is open)');
const c21Tile = html.match(/<button class="mp-g[^"]*" data-g="cards2131"[^>]*>[\s\S]*?<\/button>/);
ok(c21Tile && !/gated/.test(c21Tile[0]), '21·31 tile is NOT gated (online is open)');
const ludoTile = html.match(/<button class="mp-g[^"]*" data-g="ludu"[^>]*>[\s\S]*?<\/button>/);
ok(ludoTile && !/gated/.test(ludoTile[0]), 'ludu tile is NOT gated');
/* every tile carries visible art: the logo img or a glyph/sprite */
const tiles = html.match(/<button class="mp-g[^>]*data-g="[a-z0-9]+"[\s\S]*?<\/button>/g) || [];
for (const t of tiles){
  const k = (t.match(/data-g="([a-z0-9]+)"/) || [])[1];
  ok(/(<img src="\.\/art\/ui\/logo-|<svg)/.test(t), 'tile has art (logo or glyph): ' + k);
  if (/<img src="\.\/art\/ui\/logo-/.test(t)){
    const f = (t.match(/logo-([a-z0-9]+)\.png/) || [])[1];
    ok(fs.existsSync(path.join(ROOT, 'art/ui/logo-' + f + '.png')), 'logo png really exists: ' + f);
    ok(/onerror="this\.remove\(\)"/.test(t), 'logo has the broken-image fallback: ' + f);
  }
}

/* ── 2 · a formerly-gated pick now enables Open ── */
MPX.MP.wantGame = 'cards2131';
MPX.mpScreen();
const h2 = REG['scr-mp'].innerHTML;
ok(/id="mp-open"(?![^>]*disabled)/.test(h2), 'Open button is ENABLED for 21·31');
MPX.MP.wantGame = 'poker';
MPX.mpScreen();
ok(/id="mp-open"(?![^>]*disabled)/.test(REG['scr-mp'].innerHTML),
   'Open button is ENABLED for poker');

/* ── 3 · start('create') opens a socket for every formerly-gated game ── */
for (const g of ['ludu', 'poker', 'cards2131']){
  WS_OPENED = 0;
  MPX.start('create', null, null, false, g);
  ok(WS_OPENED === 1, "start('create','" + g + "') opens a socket");
  try { MPX.mpLeave(); } catch(e){}
}

/* ── 4 · gameGated() surface: nothing on the shelf is gated any more ── */
for (const k of MPX.GAME_KEYS)
  ok(MPX.gameGated(k) === null, 'gameGated(' + k + ') is null (live)');

console.log(fails.length ? '\nHASFAIL: ' + fails.length : '\nALLPASS');
process.exit(fails.length ? 1 : 0);
