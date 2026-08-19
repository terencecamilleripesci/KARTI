/* ═══════════════════════════════════════════════════════════════════
   KARTI — konkwista-ui.js
   IL-KONKWISTA — the tappable conquest game on top of js/konkwista.js's
   pure engine (window.KARTI_KONKWISTA.engine). This file is the screen,
   the runner and the wire, and it follows js/erbgha-ui.js's shape
   deliberately: a match is (opts, seed, log), every move goes through one
   doMove() gate, and a rollback is cutting the log and replaying it.

   WHAT THIS FILE IS
     · the shelf tile and the MINIMAL entry menu — a themed hero, three
       big buttons (PLAY ONLINE / PLAY WITH AI / PASS THE PHONE) and a
       "How to play" that slides the rules up; players / difficulty /
       turn-cap live on a tiny SECOND step, never a settings wall on
       screen one;
     · the board: the ORIGINAL vector archipelago map drawn as ONE SVG
       (every territory a tappable <path>), army-count badges, a glowing
       highlight of the legal targets, an attack arrow and an animated
       DICE roll for combat, a colour-sweep on capture and a region
       flourish — all compositor-friendly, all reduced-motion aware;
     · the phase machine on screen: a big PHASE BANNER with a live
       reinforcement counter and a primary action button, so the player
       is never left wondering whose turn it is or what to tap;
     · the runner: log, seed, autosave (karti_konkwista_v1);
     · the online controller published on KARTI_PARTY.online.konkwista and
       the lobby contract on window.KARTI_KONKWISTA.lobby, both the exact
       shape js/mp.js reads (see js/erbgha-ui.js / js/ludu-ui.js).

   ONLINE IS HONEST BY CONSTRUCTION. Konkwista is perfect-information, and
   the combat dice are derived from the shared seed + a roll counter — no
   phone trusts the roller. So the online controller relays a flat move
   through encWire/decWire and the engine (the referee) gates it; every
   client recomputes the identical dice and reaches the identical board.
   A disconnected seat is CONTINUED BY THE AI so a table never deadlocks
   (documented on the controller below).

   HOUSE RULES OBEYED
     · borrows #scr-party through KARTI_PARTY, injects its own CSS once,
       never touches css/ or the tab bar's ancestors;
     · sounds only through KARTI_SFX ids that already exist (dice.roll for
       the roll, duel.hit/duel.destroy for losses/captures, piece.place
       for reinforcement drops, sea.horn for a region flourish, game.win
       for the finish) — never invents an id, never touches audio/;
     · every player-visible string is a T(en,mt) pair at its call site;
     · the back arrow goes BACK. It never asks "are you sure": the game is
       autosaved on every move and the menu offers it again at the top.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_KONKWISTA;
if (!K || !P || !R || !R.engine) return;

const E = R.engine;
const esc = (K && K.esc) || (s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');
const clone = o => JSON.parse(JSON.stringify(o));

/* ── the one language switch (js/lang.js) ────────────────────────── */
const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
const TE = pair => pair ? T(pair.en, pair.mt) : '';

/* ═══════════════════════════════════════════════════════════════════
   SEAT COLOURS — off the engine's COLOURS (ids match rebbieh borders).
   ═══════════════════════════════════════════════════════════════════ */
const COLOURS = E.COLOURS || [];
const colourOf = seat => E.colourOf(seat);
const seatColName = seat => TE(colourOf(seat).name);

/* ═══════════════════════════════════════════════════════════════════
   CONTINENT COLOURS — the LAND is filled by its CONTINENT so the six
   landmasses read as six colour families at a glance. Each territory takes
   a slightly different SHADE of its continent's colour (a deterministic
   ripple) so neighbouring lands within a continent are still tellable apart,
   while clearly sharing one family. Ownership is drawn on TOP as a seat-colour
   ring + a seat-tinted troop badge — so "which continent" (fill) and "who owns
   it" (ring/badge) never fight.
   ═══════════════════════════════════════════════════════════════════ */
function hexToRgb(h){ h = h.replace('#',''); if (h.length===3) h = h.split('').map(c=>c+c).join(''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function rgbToHex(r,g,b){ const f=v=>('0'+Math.max(0,Math.min(255,Math.round(v))).toString(16)).slice(-2); return '#'+f(r)+f(g)+f(b); }
function mix(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
function shade(hex, amt){ const c = hexToRgb(hex); const tgt = amt<0 ? [12,20,32] : [255,255,255]; return rgbToHex(...mix(c, tgt, Math.abs(amt))); }
/* the CONTINENT descriptor for a territory index: base colour + a per-terr
   land shade + an unowned (dim) shade, all cached. */
const CONT_INFO = (function(){
  const info = {};       /* contId -> { hex, land:[perTerr shade], dim } */
  E.CONTINENTS.forEach(c => { info[c.id] = { hex:c.hex, name:c.name, bonus:c.bonus }; });
  return info;
})();
const contHex = cid => (CONT_INFO[cid] ? CONT_INFO[cid].hex : '#6a7a8a');
/* the fill for territory i given its owner: continent colour, brighter when
   owned (a live land), duller/greyer when unowned (open sea-frontier land). */
const TERR_SHADE = (function(){
  const arr = new Array(E.N_TERR);
  for (let i = 0; i < E.N_TERR; i++){
    const cid = E.TERRITORIES[i].cont;
    const base = contHex(cid);
    /* deterministic small ripple ±: index within continent */
    const mem = E.REGION_MEMBERS[cid];
    const k = mem.indexOf(i);
    const step = ((k % 3) - 1);          /* -1, 0, +1 */
    arr[i] = {
      owned:   shade(base, step === 0 ? 0.02 : (step * 0.11)),   /* lively family shade */
      unowned: rgbToHex(...mix(hexToRgb(base), [70,86,104], 0.62)) /* muted, greyed */
    };
  }
  return arr;
})();

/* ═══════════════════════════════════════════════════════════════════
   OUR CORNER OF localStorage — save, prefs, record.
   ═══════════════════════════════════════════════════════════════════ */
const STORE  = 'karti_konkwista_v1';
const SAVE_V = 1;
let ST = { v:1, pref:{}, rec:{ w:0, l:0 }, save:null };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object'){
    ST.pref = (j.pref && typeof j.pref === 'object') ? j.pref : {};
    ST.rec  = (j.rec  && typeof j.rec  === 'object') ? j.rec  : ST.rec;
    ST.save = (j.save && j.save.v === SAVE_V) ? j.save : null;
  }
} catch(e){}
let persistPending = 0;
function persist(){
  if (persistPending) return;
  persistPending = setTimeout(() => {
    persistPending = 0;
    try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){}
  }, 0);
}
function persistNow(){
  if (persistPending){ clearTimeout(persistPending); persistPending = 0; }
  try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){}
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persistNow(); });
window.addEventListener('pagehide', persistNow);

function pref(patch){ if (patch){ Object.assign(ST.pref, patch); persist(); } return ST.pref; }
function saveSlot(snap){ ST.save = snap || null; persist(); }

const UIKEY = 'karti_konkwista_ui_v1';
let rulesOpen = false;
try { rulesOpen = localStorage.getItem(UIKEY + '.rules') === '1'; } catch(e){}
let seenTip = false;
try { seenTip = localStorage.getItem(UIKEY + '.tip') === '1'; } catch(e){}

/* the machine's sharpnesses, off the engine's LEVELS */
function levels(){ return (E.LEVELS || []).map(L => ({ level:L.k, name:L.name, note:L.note, icon:L.icon })); }
function levelName(k){ const L = levels().find(x => x.level === k); return (L && L.name) || 'MAKNA'; }
function levelNote(k){ const L = levels().find(x => x.level === k); return L ? TE(L.note) : ''; }

/* ═══════════════════════════════════════════════════════════════════
   SOUND — existing ids only (js/sfx.js), through one gate so a fast run
   does not machine-gun the mixer.
     dice.roll      combat dice
     duel.attack    the attack launch
     duel.hit       an army lost in a fight
     duel.destroy   a captured territory
     piece.place    a reinforcement dropped
     sea.horn       a whole region taken (flourish)
     game.win       the finish
     ui.tap/back/sheet, move.illegal, game.start, mp.turn
   ═══════════════════════════════════════════════════════════════════ */
let cueAt = 0;
function cue(id, opts, big){
  const S = window.KARTI_SFX;
  if (!S) return;
  const now = Date.now();
  if (!big && now - cueAt < 45) return;
  cueAt = Math.max(cueAt, now);
  try { S.play(id, opts); } catch(e){}
}
function reduced(){
  try {
    if (document.body && document.body.classList.contains('reduced')) return true;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch(e){ return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   THE RUNNER — (opts, seed, log) and one door for every move.
   ═══════════════════════════════════════════════════════════════════ */
let M = null;      /* the live match */
let UI = null;     /* the board's handles */
const moveSubs  = [];
const stateSubs = [];
function fireList(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }

function newSeed(){ return (E.newSeed ? E.newSeed() : (Math.random() * 0x100000000) | 0) >>> 0; }

function buildState(opts, seed, log){
  const st = E.newGame(opts, seed);
  for (let i = 0; i < log.length; i++){
    const mv = log[i];
    const seat = E.turn(st);
    if (seat < 0 || !E.check(st, mv, seat)) break;
    E.apply(st, mv);
    if (E.over(st)) break;
  }
  return st;
}

function startMatch(opts, seed, log){
  stopThinking();
  M = {
    opts: clone(opts || {}),
    seed: (seed == null ? newSeed() : (seed >>> 0)),
    log: log ? clone(log) : [],
    st: null, ctx: null,
    timer: 0, dead: false, finished: false,
    raf: 0, anim: null,
    recorded: false,
    net: null, meta: null,
    sel: -1,                 /* the selected own territory (attack/fortify src) */
    fsel: -1,                /* fortify: chosen source once a dest is being picked */
    place: 1,                /* reinforcement chunk size the +/- picks           */
    busy: false              /* a battle animation is playing                    */
  };
  M.st = buildState(M.opts, M.seed, M.log);
  applyMeta();
  return M;
}
function applyMeta(){
  if (!M || !M.meta || !M.st) return;
  M.meta.forEach((m, i) => { if (m) M.st['seat' + i] = m; });
}
function stopThinking(){ if (M && M.timer){ clearTimeout(M.timer); M.timer = 0; } }

/* ownership lives in the UI. meta[i] = { own:'me'|'hot'|'ai'|'net', name, lvl } */
function ownerOf(i){
  if (!M || !M.meta || !M.meta[i]) return 'ai';
  return M.meta[i].own || 'ai';
}
const isLocal = i => { const o = ownerOf(i); return o === 'me' || o === 'hot'; };
function seatLvl(i){ return (M && M.meta && M.meta[i] && M.meta[i].lvl) || 2; }
function seatName(i){
  if (!M || !M.meta || !M.meta[i]) return seatColName(i);
  const m = M.meta[i];
  if (m.own === 'me' || m.own === 'hot') return m.name || T('You', 'Int');
  if (m.own === 'ai') return levelName(m.lvl);
  return m.name || seatColName(i);
}
function firstLocalSeat(){ for (let i = 0; i < (M ? M.st.seats : 0); i++) if (isLocal(i)) return i; return -1; }

/* THE gate. Every move — thumb, machine, wire, replay — measured here. */
function doMove(seat, move, src){
  if (!M || M.dead) return { ok:false, err:'no game' };
  if (E.over(M.st)) return { ok:false, err:'game over' };
  const t = E.turn(M.st);
  if (t !== seat) return { ok:false, err:'not your turn' };
  if (!E.check(M.st, move, seat)) return { ok:false, err:'illegal move' };
  const rec = clone(move);
  const idx = M.log.length;
  M.log.push(rec);
  const before = { battle:null };
  E.apply(M.st, rec);
  autosave();
  fireList(moveSubs,  { seat, move:clone(move), index:idx, src:src || 'local', last:M.st.last, battle:M.st.lastBattle });
  fireList(stateSubs, { reason:'move', index:idx });
  return { ok:true, index:idx };
}

function snapshot(){
  if (!M) return null;
  return { v:SAVE_V, gid:'konkwista', opts:clone(M.opts), seed:M.seed, log:clone(M.log), meta:clone(M.meta || null) };
}
function autosave(){
  if (!M || M.net) return;
  if (E.over(M.st)){ saveSlot(null); return; }
  saveSlot(snapshot());
}

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party. A parchment-sea
   identity: a deep Mediterranean-blue cabinet, the vector islands in the
   seat colours, a brass phase banner. The map is one SVG; everything
   around it is DOM.
   ═══════════════════════════════════════════════════════════════════ */
let cssDone = false;
function injectCSS(){
  if (cssDone || document.getElementById('kq-runtime-css')){ cssDone = true; return; }
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'kq-runtime-css';
  st.textContent =
    '#scr-party{--kq-sea:#0f2a44;--kq-sea2:#0a1c30;--kq-gold:var(--gold,#FFC542);' +
      '--kq-ink:#0b1622;--kq-parch:#e9d7ad}' +

    '#scr-party .pt-host.kq-host{align-items:stretch;justify-content:stretch;overflow:visible}' +
    '#scr-party .kq-wrap{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;' +
      'gap:5px;padding:5px 5px 6px;position:relative}' +

    /* ── the phase banner: the single most important strip ── */
    '#scr-party .kq-banner{flex:0 0 auto;display:flex;align-items:center;gap:9px;' +
      'padding:7px 10px;border-radius:13px;min-height:44px;' +
      'background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(0,0,0,.28));' +
      'border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}' +
    '#scr-party .kq-banner.turn-you{border-color:rgba(255,197,66,.55);' +
      'background:linear-gradient(180deg,rgba(255,197,66,.14),rgba(0,0,0,.28))}' +
    '#scr-party .kq-bdot{width:16px;height:16px;flex:0 0 auto;border-radius:50%;' +
      'box-shadow:inset 0 2px 0 rgba(255,255,255,.45),0 1px 3px rgba(0,0,0,.5)}' +
    '#scr-party .kq-btxt{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}' +
    '#scr-party .kq-bph{font:900 12px/1.05 var(--disp);letter-spacing:.08em;text-transform:uppercase;' +
      'color:var(--kq-gold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .kq-bhint{font:600 11px/1.2 var(--body);color:rgba(255,255,255,.78);' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .kq-bcount{flex:0 0 auto;font:900 20px/1 var(--disp);color:#fff;' +
      'min-width:30px;text-align:center;padding:2px 6px;border-radius:9px;' +
      'background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.14)}' +
    '#scr-party .kq-act{flex:0 0 auto;border:0;cursor:pointer;font:900 11px/1 var(--disp);' +
      'letter-spacing:.05em;text-transform:uppercase;padding:9px 12px;border-radius:11px;' +
      'color:#1a1205;background:linear-gradient(180deg,#FFDD7A,#E9A81F);' +
      'box-shadow:0 2px 0 rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.5);' +
      '-webkit-tap-highlight-color:transparent;white-space:nowrap}' +
    '#scr-party .kq-act:active{transform:translateY(1px)}' +
    '#scr-party .kq-act.ghost{color:#fff;background:rgba(255,255,255,.10);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}' +
    '#scr-party .kq-act[disabled]{opacity:.4;pointer-events:none}' +

    /* ── the reinforcement stepper (± chunk) ── */
    '#scr-party .kq-step{flex:0 0 auto;display:flex;align-items:center;gap:4px}' +
    '#scr-party .kq-step button{width:30px;height:30px;border-radius:8px;border:0;cursor:pointer;' +
      'font:900 16px/1 var(--disp);color:#fff;background:rgba(255,255,255,.12);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);-webkit-tap-highlight-color:transparent}' +
    '#scr-party .kq-step button:active{transform:translateY(1px)}' +
    '#scr-party .kq-step .kq-n{min-width:22px;text-align:center;font:900 15px/1 var(--disp);color:#fff}' +

    /* ── the seat strip ── */
    '#scr-party .kq-seats{flex:0 0 auto;display:flex;gap:5px;overflow-x:auto;padding:1px;' +
      '-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
    '#scr-party .kq-seats::-webkit-scrollbar{display:none}' +
    '#scr-party .kq-chip{flex:0 0 auto;display:flex;align-items:center;gap:5px;padding:3px 8px 3px 5px;' +
      'border-radius:10px;background:rgba(0,0,0,.30);border:1px solid rgba(255,255,255,.09)}' +
    '#scr-party .kq-chip.on{background:rgba(255,197,66,.16);border-color:rgba(255,197,66,.6)}' +
    '#scr-party .kq-chip.dead{opacity:.34;filter:grayscale(.7)}' +
    '#scr-party .kq-chip .sw{width:15px;height:15px;flex:0 0 auto;border-radius:50%;' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 1px 2px rgba(0,0,0,.5)}' +
    '#scr-party .kq-chip .cn{display:flex;flex-direction:column;line-height:1.05}' +
    '#scr-party .kq-chip .cn b{font:900 9px/1.1 var(--disp);letter-spacing:.03em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.8);max-width:74px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .kq-chip.on .cn b{color:var(--kq-gold)}' +
    '#scr-party .kq-chip .cn i{font:700 8px/1.1 var(--body);color:rgba(255,255,255,.55);font-style:normal}' +

    /* ── the map box holds the SVG, sized to fit ── */
    '#scr-party .kq-mapbox{flex:1 1 auto;min-height:0;position:relative;display:flex;' +
      'align-items:center;justify-content:center;overflow:hidden;border-radius:16px;' +
      'background:radial-gradient(130% 120% at 50% 15%,#164066 0%,var(--kq-sea) 55%,var(--kq-sea2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.05),inset 0 -14px 30px rgba(0,0,0,.42)}' +
    '#scr-party .kq-mapbg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.5;pointer-events:none}' +
    '#scr-party .kq-svg{position:relative;display:block;width:100%;height:100%;' +
      'touch-action:manipulation;-webkit-tap-highlight-color:transparent}' +
    /* THE LAND. Fill = the CONTINENT colour (set per-cell), so continent
       membership reads at a glance. The OWNER is a separate seat-colour RING
       (the .kq-ring overlay) + the troop badge tint — so "which continent" and
       "who owns it" are both legible without fighting each other. */
    '#scr-party .kq-terr{stroke:#0a1622;stroke-width:1.5;cursor:pointer;transition:filter .12s,opacity .12s}' +
    '#scr-party .kq-terr.legal{filter:drop-shadow(0 0 5px rgba(255,255,255,.92))}' +
    '#scr-party .kq-terr.target{stroke:#fff;stroke-width:3}' +
    '#scr-party .kq-terr.sel{stroke:var(--kq-gold);stroke-width:3.5;filter:drop-shadow(0 0 7px rgba(255,197,66,.95))}' +
    '#scr-party .kq-terr.dim{opacity:.9}' +
    /* the seat-colour owner ring: a stroke-only path over the land */
    '#scr-party .kq-ring{fill:none;stroke-width:3.5;pointer-events:none;stroke-linejoin:round;' +
      'transition:opacity .12s}' +
    '#scr-party .kq-badge circle{stroke:rgba(0,0,0,.55);stroke-width:2}' +
    '#scr-party .kq-badge text{font:900 14px/1 var(--disp);fill:#fff;text-anchor:middle;' +
      'dominant-baseline:central;paint-order:stroke;stroke:rgba(0,0,0,.6);stroke-width:3px}' +
    /* subtle per-territory name (small, on the land) */
    '#scr-party .kq-tname{font:800 8px/1 var(--body);fill:rgba(255,255,255,.42);text-anchor:middle;' +
      'pointer-events:none;letter-spacing:.02em}' +
    /* the SEA-ROUTE lanes between continents */
    '#scr-party .kq-lane{stroke:rgba(160,205,235,.55);stroke-width:2.4;stroke-dasharray:2 9;' +
      'stroke-linecap:round;fill:none;pointer-events:none}' +
    '#scr-party .kq-lanedot{fill:rgba(190,220,245,.7);pointer-events:none}' +
    /* the CONTINENT label plaque: NAME + BONUS on/near the landmass */
    '#scr-party .kq-clabel{pointer-events:none}' +
    '#scr-party .kq-clabel rect{rx:7}' +
    '#scr-party .kq-clabel .cl-nm{font:900 12px/1 var(--disp);letter-spacing:.06em;' +
      'text-transform:uppercase;text-anchor:middle;dominant-baseline:central;' +
      'paint-order:stroke;stroke:rgba(0,0,0,.55);stroke-width:3px}' +
    '#scr-party .kq-clabel .cl-bn{font:900 12px/1 var(--disp);fill:#fff;text-anchor:middle;' +
      'dominant-baseline:central;paint-order:stroke;stroke:rgba(0,0,0,.55);stroke-width:3px}' +

    /* ── first-run tip toast over the map ── */
    '#scr-party .kq-tip{position:absolute;left:8px;right:8px;bottom:8px;z-index:20;' +
      'padding:9px 12px;border-radius:12px;font:600 11.5px/1.4 var(--body);color:#1a1205;' +
      'background:linear-gradient(180deg,#FFE6A0,#F2C860);box-shadow:0 6px 18px rgba(0,0,0,.5);' +
      'display:flex;align-items:center;gap:9px}' +
    '#scr-party .kq-tip b{font-weight:900}' +
    '#scr-party .kq-tip button{margin-left:auto;flex:0 0 auto;border:0;background:rgba(0,0,0,.14);' +
      'color:#1a1205;font:900 10px/1 var(--disp);padding:6px 9px;border-radius:8px;cursor:pointer}' +

    /* ── rules panel (slide from the top) ── */
    '#scr-party .kq-rules{position:absolute;top:0;left:0;right:0;z-index:30;max-height:70%;' +
      'display:flex;flex-direction:column;border-radius:14px;overflow:hidden;' +
      'background:linear-gradient(180deg,#123452,#0a1c30);border:1px solid rgba(255,255,255,.16);' +
      'box-shadow:0 14px 30px rgba(0,0,0,.55);' +
      'transform:translateY(-108%);opacity:0;visibility:hidden;pointer-events:none;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease),visibility 0s .26s}' +
    '#scr-party .kq-rules.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease)}' +
    'body.reduced #scr-party .kq-rules{transition:none}' +
    '#scr-party .kq-rules-h{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:9px 4px 2px 14px}' +
    '#scr-party .kq-rules-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;text-transform:uppercase;color:var(--kq-gold)}' +
    '#scr-party .kq-rules-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;color:var(--txt);' +
      'cursor:pointer;display:grid;place-items:center;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .kq-rules-x svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round}' +
    '#scr-party .kq-rules-b{min-height:0;overflow-y:auto;padding:2px 14px 12px;-webkit-overflow-scrolling:touch}' +
    '#scr-party .kq-rules-b li{font-size:12px;line-height:1.55;color:var(--dim);margin:0 0 6px 14px}' +

    /* ── the dice overlay (combat) ── */
    '#scr-party .kq-dice{position:absolute;left:0;right:0;top:0;bottom:0;z-index:24;' +
      'display:flex;align-items:center;justify-content:center;gap:14px;pointer-events:none}' +
    '#scr-party .kq-dside{display:flex;flex-direction:column;align-items:center;gap:5px}' +
    '#scr-party .kq-dlabel{font:900 9px/1 var(--disp);letter-spacing:.1em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.85);text-shadow:0 1px 3px #000}' +
    '#scr-party .kq-drow{display:flex;gap:6px}' +
    '#scr-party .kq-die{width:34px;height:34px;border-radius:8px;background:linear-gradient(160deg,#fff,#dfe4ea);' +
      'box-shadow:0 3px 8px rgba(0,0,0,.5),inset 0 -3px 5px rgba(0,0,0,.12);' +
      'display:grid;place-items:center;font:900 20px/1 var(--disp);color:#12202e;position:relative}' +
    '#scr-party .kq-die.atk{background:linear-gradient(160deg,#ffd9d9,#ff9d9d)}' +
    '#scr-party .kq-die.def{background:linear-gradient(160deg,#d9e6ff,#9dc0ff)}' +
    '#scr-party .kq-die.lose{opacity:.35;transform:scale(.82)}' +
    '#scr-party .kq-die.win{box-shadow:0 0 0 2px #FFC542,0 3px 8px rgba(0,0,0,.5)}' +
    '@keyframes kq-shake{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-3px) rotate(-8deg)}75%{transform:translateY(2px) rotate(8deg)}}' +
    '#scr-party .kq-die.roll{animation:kq-shake .12s linear infinite}' +
    'body.reduced #scr-party .kq-die.roll{animation:none}' +

    /* ── the entry menu face ── */
    '#scr-party .kq-menu .pt-lbl{color:#9ec5e8}' +
    '#scr-party .kq-menu .kq-hero{position:relative;display:flex;align-items:center;justify-content:center;' +
      'margin:2px 0 12px;padding:14px 8px;border-radius:16px;overflow:hidden;' +
      'background:radial-gradient(120% 130% at 50% 15%,#1a5080 0%,var(--kq-sea) 55%,var(--kq-sea2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.06),inset 0 -14px 26px rgba(0,0,0,.4)}' +
    '#scr-party .kq-menu .kq-hero svg{width:100%;max-width:280px;height:auto;display:block}' +
    '#scr-party .kq-menu .kq-hero-cap{position:absolute;right:11px;bottom:8px;font:900 9.5px/1 var(--disp);' +
      'letter-spacing:.18em;color:rgba(255,255,255,.34)}' +
    '#scr-party .kq-note{font-size:11.5px;line-height:1.6;margin:8px 2px 0;padding:9px 11px;border-radius:12px;' +
      'text-transform:none;letter-spacing:0;color:#cfe2f0;background:rgba(60,140,220,.10);border:1px solid rgba(60,140,220,.3)}' +

    /* ── the cards button (in the banner) + card sheet ── */
    '#scr-party .kq-cards{flex:0 0 auto;position:relative;border:0;cursor:pointer;' +
      'font:900 11px/1 var(--disp);letter-spacing:.03em;padding:8px 10px;border-radius:11px;' +
      'color:#1a1205;background:linear-gradient(180deg,#EFE3C4,#CBB884);' +
      'box-shadow:0 2px 0 rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.5);' +
      '-webkit-tap-highlight-color:transparent;display:flex;align-items:center;gap:5px;white-space:nowrap}' +
    '#scr-party .kq-cards:active{transform:translateY(1px)}' +
    '#scr-party .kq-cards.trade{background:linear-gradient(180deg,#FFDD7A,#E9A81F);animation:kq-cardpulse 1.4s ease-in-out infinite}' +
    '#scr-party .kq-cards.must{background:linear-gradient(180deg,#ff9d6b,#e8552a);color:#fff}' +
    '@keyframes kq-cardpulse{0%,100%{box-shadow:0 2px 0 rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.5)}50%{box-shadow:0 0 0 3px rgba(255,197,66,.5),0 2px 0 rgba(0,0,0,.35)}}' +
    'body.reduced #scr-party .kq-cards.trade{animation:none}' +

    /* the card SHEET (slides up from the bottom of the map) */
    '#scr-party .kq-sheet{position:absolute;inset:0;z-index:40;display:flex;align-items:flex-end;' +
      'justify-content:center;background:rgba(0,0,0,.5)}' +
    '#scr-party .kq-sheet-in{width:100%;max-width:460px;margin:0 6px 8px;max-height:86%;overflow-y:auto;' +
      '-webkit-overflow-scrolling:touch;padding:14px 13px 13px;border-radius:16px;' +
      'background:linear-gradient(180deg,#123452,#0a1c30);border:1px solid rgba(255,255,255,.16);' +
      'box-shadow:0 -8px 30px rgba(0,0,0,.55)}' +
    '#scr-party .kq-sheet-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}' +
    '#scr-party .kq-sheet-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.08em;text-transform:uppercase;color:var(--kq-gold)}' +
    '#scr-party .kq-sheet-x{width:36px;height:36px;margin:-8px -6px -8px 0;border:0;background:none;color:#fff;' +
      'cursor:pointer;display:grid;place-items:center;font:900 18px/1 var(--disp);-webkit-tap-highlight-color:transparent}' +
    '#scr-party .kq-hand{display:flex;flex-wrap:wrap;gap:7px;margin:2px 0 4px}' +
    '#scr-party .kq-card{flex:0 0 auto;width:70px;height:92px;border-radius:10px;position:relative;cursor:pointer;' +
      'background:linear-gradient(160deg,#fbf4e2,#e3d3a8);box-shadow:0 2px 6px rgba(0,0,0,.45);' +
      'border:2px solid transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;' +
      '-webkit-tap-highlight-color:transparent;overflow:hidden}' +
    '#scr-party .kq-card.sel{border-color:var(--kq-gold);box-shadow:0 0 0 2px var(--kq-gold),0 2px 6px rgba(0,0,0,.45)}' +
    '#scr-party .kq-card .sym{font-size:26px;line-height:1}' +
    '#scr-party .kq-card .nm{font:800 8px/1.1 var(--body);color:#3a2c12;text-align:center;padding:0 3px;max-width:100%}' +
    '#scr-party .kq-card .wild{font:900 9px/1 var(--disp);letter-spacing:.1em;color:#8a4bd0;text-transform:uppercase}' +
    '#scr-party .kq-card .dot{position:absolute;top:5px;left:5px;width:9px;height:9px;border-radius:50%;box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}' +
    '#scr-party .kq-trade-row{display:flex;gap:8px;align-items:center;margin-top:8px}' +
    '#scr-party .kq-trade-row .kq-act{flex:1}' +
    '#scr-party .kq-hint2{font:600 11px/1.4 var(--body);color:rgba(255,255,255,.72);margin:4px 0 2px}' +

    /* the continent-bonus legend */
    '#scr-party .kq-conts{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:4px}' +
    '#scr-party .kq-cont{display:flex;align-items:center;gap:6px;padding:5px 7px;border-radius:9px;' +
      'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}' +
    '#scr-party .kq-cont.mine{background:rgba(255,197,66,.16);border-color:rgba(255,197,66,.55)}' +
    '#scr-party .kq-cont .cs{width:12px;height:12px;flex:0 0 auto;border-radius:3px}' +
    '#scr-party .kq-cont .cnm{flex:1;min-width:0;font:800 10px/1.1 var(--disp);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .kq-cont .cbn{flex:0 0 auto;font:900 11px/1 var(--disp);color:var(--kq-gold)}' +
    '#scr-party .kq-cont.mine .cbn{color:#7CF29B}' +
    '#scr-party .kq-cont .ck{flex:0 0 auto;font:700 8px/1 var(--body);color:rgba(255,255,255,.5)}' +

    /* ── landscape ── */
    '@media (max-height:520px){' +
      '#scr-party .kq-wrap{padding:4px}' +
      '#scr-party .kq-banner{min-height:38px}' +
    '}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   THE FRAME + THE BOARD DOM
   ═══════════════════════════════════════════════════════════════════ */
function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: T('Konkwista', 'Konkwista'),
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'kq-rules', label:T('Rules', 'Regoli'), icon:'book',    cls:'ghost' },
      { id:'kq-new',   label:T('New', 'Ġdida'),    icon:'refresh', cls:'ghost' }
    ]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();     /* we size our own map */
  M.ctx.badge.textContent = M.net ? T('Online', 'Onlajn')
    : anyAI() ? T('vs Machine', 'kontra l-Magna')
    : T('Pass & play', 'Għaddi u lgħab');
  buildBoard();
  M.ctx.btn('kq-rules').onclick = () => setRules(!rulesOpen);
  const nb = M.ctx.btn('kq-new');
  if (nb) nb.onclick = () => {
    if (M.net) return;
    P.ui.confirm(M.ctx, {
      head: T('Start a fresh campaign?', 'Tibda kampanja ġdida?'),
      why:  T('This map is folded away and a new one is dealt.',
              'Din il-mappa titwarrab u tinqasam waħda ġdida.'),
      yes:  T('New campaign', 'Kampanja ġdida'),
      no:   T('No, carry on', 'Le, kompli'),
      go: () => setupSheet()
    });
  };
  paintRules();
}
function anyAI(){ if (!M) return false; for (let i=0;i<M.st.seats;i++) if (ownerOf(i)==='ai') return true; return false; }

function buildBoard(){
  const ctx = M.ctx;
  ctx.host.classList.add('kq-host');
  ctx.host.innerHTML =
    '<div class="kq-wrap" id="kq-wrap">' +
      '<div class="kq-banner" id="kq-banner">' +
        '<span class="kq-bdot" id="kq-bdot"></span>' +
        '<span class="kq-btxt"><span class="kq-bph" id="kq-bph"></span><span class="kq-bhint" id="kq-bhint"></span></span>' +
        '<span class="kq-bcount" id="kq-bcount" hidden></span>' +
        '<span class="kq-step" id="kq-step" hidden>' +
          '<button id="kq-minus" aria-label="' + esc(T('Fewer','Inqas')) + '">−</button>' +
          '<span class="kq-n" id="kq-placen">1</span>' +
          '<button id="kq-plus" aria-label="' + esc(T('More','Aktar')) + '">+</button>' +
        '</span>' +
        '<button class="kq-cards" id="kq-cards" hidden aria-label="' + esc(T('Your cards','Il-karti tiegħek')) + '"></button>' +
        '<button class="kq-act" id="kq-act"></button>' +
      '</div>' +
      '<div class="kq-seats" id="kq-seats"></div>' +
      '<div class="kq-mapbox" id="kq-mapbox">' +
        '<img class="kq-mapbg" id="kq-mapbg" alt="" aria-hidden="true" src="art/ui/konkwista-bg.png" ' +
          'onerror="this.style.display=\'none\'">' +
        '<svg class="kq-svg" id="kq-svg" viewBox="0 0 660 1160" preserveAspectRatio="xMidYMid meet" ' +
          'role="img" aria-label="' + esc(T('The conquest map','Il-mappa tal-konkwista')) + '"></svg>' +
      '</div>' +
      '<div class="kq-rules" id="kq-rulespanel" aria-hidden="true">' +
        '<div class="kq-rules-h"><h4 id="kq-rules-t"></h4>' +
          '<button class="kq-rules-x" id="kq-rules-x" aria-label="' + esc(T('Put the rules away','Warrab ir-regoli')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<div class="kq-rules-b" id="kq-rules-b"></div>' +
      '</div>' +
    '</div>';
  const root = ctx.host.querySelector('#kq-wrap');
  UI = {
    ctx, root,
    banner: root.querySelector('#kq-banner'),
    bdot:   root.querySelector('#kq-bdot'),
    bph:    root.querySelector('#kq-bph'),
    bhint:  root.querySelector('#kq-bhint'),
    bcount: root.querySelector('#kq-bcount'),
    step:   root.querySelector('#kq-step'),
    placen: root.querySelector('#kq-placen'),
    cards:  root.querySelector('#kq-cards'),
    act:    root.querySelector('#kq-act'),
    seats:  root.querySelector('#kq-seats'),
    mapbox: root.querySelector('#kq-mapbox'),
    svg:    root.querySelector('#kq-svg'),
    rules:  root.querySelector('#kq-rulespanel'),
    terrEls: {}, badgeEls: {}, ringEls: {}, labelEls: {}
  };
  buildSVG();

  root.querySelector('#kq-rules-x').addEventListener('click', () => setRules(false));
  ctx.root.addEventListener('pointerdown', e => {
    if (!rulesOpen || !UI || !UI.rules) return;
    const rb = ctx.btn && ctx.btn('kq-rules');
    if (!UI.rules.contains(e.target) && !(rb && rb.contains(e.target))) setRules(false);
  }, true);

  UI.act.onclick = onAct;
  UI.cards.onclick = () => openCardSheet();
  root.querySelector('#kq-minus').onclick = () => bumpPlace(-1);
  root.querySelector('#kq-plus').onclick  = () => bumpPlace(1);

  paintSeats();
  paintAll();
  maybeTip();
}

/* where a continent's NAME+BONUS plaque sits: the widest gap near the top of
   its landmass, clear of badges. We take the continent bbox and drop the label
   at the horizontal centre, a little below the top edge. */
function contLabelAnchor(cid){
  const mem = E.REGION_MEMBERS[cid];
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  mem.forEach(i => { const p = E.TERRITORIES[i].poly;
    for (let k=0;k<p.length;k+=2){ x0=Math.min(x0,p[k]); x1=Math.max(x1,p[k]); y0=Math.min(y0,p[k+1]); y1=Math.max(y1,p[k+1]); } });
  return { x:(x0+x1)/2, y:y0 - 12, x0, y0, x1, y1 };
}

/* build the vector map: sea-route lanes, one polygon per territory (continent
   fill), a seat-colour owner ring, an army badge, and the continent plaques. */
function buildSVG(){
  const svg = UI.svg;
  const T = E.TERRITORIES;
  let s = '';

  /* 1 · SEA-ROUTE lanes UNDER the land (dashed lanes over the water). */
  (E.SEA_ROUTE_IDX || []).forEach(pair => {
    const a = T[pair[0]].c, b = T[pair[1]].c;
    s += '<line class="kq-lane" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"></line>' +
      '<circle class="kq-lanedot" cx="' + ((a[0]+b[0])/2).toFixed(0) + '" cy="' + ((a[1]+b[1])/2).toFixed(0) + '" r="3"></circle>';
  });

  /* 2 · the LAND — one polygon per territory, filled by its continent shade. */
  T.forEach((t, i) => {
    const pts = t.poly.reduce((a, v, k) => a + (k % 2 ? ',' : (k ? ' ' : '')) + v, '');
    s += '<polygon class="kq-terr" data-t="' + i + '" points="' + pts + '" ' +
      'fill="' + TERR_SHADE[i].unowned + '"></polygon>';
  });

  /* 3 · the OWNER RINGS — a stroke-only polygon on top, seat-coloured. */
  T.forEach((t, i) => {
    const pts = t.poly.reduce((a, v, k) => a + (k % 2 ? ',' : (k ? ' ' : '')) + v, '');
    s += '<polygon class="kq-ring" data-r="' + i + '" points="' + pts + '" display="none"></polygon>';
  });

  /* 4 · a subtle territory name on the land (helps read the board). */
  T.forEach((t, i) => {
    s += '<text class="kq-tname" data-n="' + i + '" x="' + t.c[0] + '" y="' + (t.c[1] + 20) + '">' +
      esc(TE(t.name)) + '</text>';
  });

  /* 5 · badges (drawn over the polygons). */
  T.forEach((t, i) => {
    s += '<g class="kq-badge" data-b="' + i + '">' +
      '<circle cx="' + t.c[0] + '" cy="' + t.c[1] + '" r="12.5"></circle>' +
      '<text x="' + t.c[0] + '" y="' + (t.c[1] + 1) + '">1</text></g>';
  });

  /* 6 · the CONTINENT plaques — NAME + BONUS on/near each landmass. */
  E.CONTINENTS.forEach(c => {
    const a = contLabelAnchor(c.id);
    const nm = TE(c.name).toUpperCase();
    const chW = 8.0;                                   /* rough glyph width */
    const bnW = 30;
    const w = Math.max(64, nm.length * chW + bnW + 24);
    const h = 22;
    let lx = a.x, ly = Math.max(14, a.y);
    lx = Math.max(w/2 + 4, Math.min(660 - w/2 - 4, lx));
    ly = Math.max(h/2 + 4, Math.min(1160 - h/2 - 4, ly));
    const nmX = lx - bnW/2 + 2;
    const bnX = lx + (w/2) - bnW/2 - 2;
    s += '<g class="kq-clabel" data-cl="' + c.id + '">' +
      '<rect x="' + (lx - w/2).toFixed(1) + '" y="' + (ly - h/2).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h + '" ' +
        'rx="7" fill="rgba(8,18,30,.72)" stroke="' + c.hex + '" stroke-width="1.5"></rect>' +
      '<text class="cl-nm" x="' + nmX.toFixed(1) + '" y="' + (ly).toFixed(1) + '" fill="' + shade(c.hex, 0.42) + '">' + esc(nm) + '</text>' +
      '<rect x="' + (bnX - bnW/2 + 3).toFixed(1) + '" y="' + (ly - 9).toFixed(1) + '" width="' + (bnW-6) + '" height="18" rx="5" ' +
        'fill="' + c.hex + '"></rect>' +
      '<text class="cl-bn" x="' + bnX.toFixed(1) + '" y="' + (ly).toFixed(1) + '">+' + c.bonus + '</text>' +
    '</g>';
  });

  svg.innerHTML = s;

  /* cache + wire taps */
  T.forEach((t, i) => {
    const el = svg.querySelector('.kq-terr[data-t="' + i + '"]');
    const rg = svg.querySelector('.kq-ring[data-r="' + i + '"]');
    const bg = svg.querySelector('.kq-badge[data-b="' + i + '"]');
    const nm = svg.querySelector('.kq-tname[data-n="' + i + '"]');
    UI.terrEls[i] = el;
    UI.ringEls[i] = rg;
    UI.badgeEls[i] = bg;
    UI.labelEls[i] = nm;
    if (el) el.addEventListener('pointerdown', ev => { ev.preventDefault(); onTerr(i); });
  });
}

/* ═══════════════════════════════════════════════════════════════════
   PAINTING — colours, badges, highlights, banner.
   ═══════════════════════════════════════════════════════════════════ */
function paintAll(){
  if (!UI || !M) return;
  paintMap();
  paintSeats();
  paintBanner();
}

function paintMap(){
  const st = M.st;
  const legalSet = computeLegalSet();
  for (let i = 0; i < E.N_TERR; i++){
    const el = UI.terrEls[i], bg = UI.badgeEls[i], rg = UI.ringEls[i];
    if (!el) continue;
    const o = st.owner[i];
    /* FILL = the CONTINENT colour: lively when owned, muted when open land. */
    const shd = TERR_SHADE[i];
    el.setAttribute('fill', o >= 0 ? shd.owned : shd.unowned);
    el.classList.toggle('sel', i === M.sel || i === M.fsel);
    el.classList.toggle('legal', legalSet.from.has(i));
    el.classList.toggle('target', legalSet.to.has(i));
    /* OWNER RING = the seat colour, drawn on top; hidden on open land. */
    if (rg){
      if (o < 0){ rg.setAttribute('display', 'none'); }
      else { rg.removeAttribute('display'); rg.setAttribute('stroke', colourOf(o).hex); }
    }
    /* badge — the troop count in the OWNER's seat colour so ownership reads
       even where the ring is thin. Hidden on UNOWNED land (the CLAIM opening). */
    if (bg){
      const c = bg.querySelector('circle'), tx = bg.querySelector('text');
      if (o < 0){
        bg.setAttribute('display', 'none');
      } else {
        bg.removeAttribute('display');
        const col = colourOf(o);
        if (c){ c.setAttribute('fill', col.hex); c.setAttribute('stroke', col.lo); }
        if (tx) tx.textContent = st.army[i];
      }
    }
  }
}

/* which territories should glow now (source set) and which are targets. */
function computeLegalSet(){
  const st = M.st;
  const from = new Set(), to = new Set();
  if (E.over(st)) return { from, to };
  const seat = E.turn(st);
  if (!isLocal(seat) || M.busy || st._pending) return { from, to };
  if (st.phase === E.PH_CLAIM){
    /* every EMPTY territory is claimable */
    for (let i = 0; i < E.N_TERR; i++) if (st.owner[i] === E.UNOWNED) from.add(i);
  } else if (st.phase === E.PH_DEPLOY){
    /* every OWN territory can take a setup army */
    for (let i = 0; i < E.N_TERR; i++) if (st.owner[i] === seat) from.add(i);
  } else if (st.phase === E.PH_REINFORCE){
    /* every own territory can take reinforcements */
    for (let i = 0; i < E.N_TERR; i++) if (st.owner[i] === seat) from.add(i);
  } else if (st.phase === E.PH_ATTACK){
    if (M.sel < 0){
      for (const s of E.attackSources(st, seat)) from.add(s);
    } else {
      for (const t of E.attackTargets(st, M.sel)) to.add(t);
    }
  } else if (st.phase === E.PH_FORTIFY){
    if (M.fsel < 0){
      for (let i = 0; i < E.N_TERR; i++)
        if (st.owner[i] === seat && st.army[i] > 1){
          /* has a reachable own neighbour? */
          for (const v of E.adjOf(i)) if (st.owner[v] === seat){ from.add(i); break; }
        }
    } else {
      /* reachable own territories from fsel */
      for (let i = 0; i < E.N_TERR; i++)
        if (i !== M.fsel && st.owner[i] === seat && E.fortifyReachable(st, seat, M.fsel, i)) to.add(i);
    }
  }
  return { from, to };
}

function paintSeats(){
  if (!UI || !UI.seats || !M) return;
  const st = M.st, turn = E.turn(st), over = E.over(st);
  let html = '';
  for (let i = 0; i < st.seats; i++){
    const on = (i === turn && !over) ? ' on' : '';
    const dead = !st.alive[i] ? ' dead' : '';
    const col = colourOf(i);
    html += '<div class="kq-chip' + on + dead + '">' +
      '<span class="sw" style="background:radial-gradient(circle at 35% 30%,' + col.hi + ',' + col.hex + ' 60%,' + col.lo + ')"></span>' +
      '<span class="cn"><b>' + esc(seatName(i)) + '</b>' +
        '<i>' + E.countTerr(st, i) + '⬢ · ' + E.countArmies(st, i) + '⚔' +
          (E.handOf(st, i).length ? ' · ' + E.handOf(st, i).length + '🃏' : '') + '</i></span>' +
    '</div>';
  }
  UI.seats.innerHTML = html;
}

function paintBanner(){
  if (!UI || !M) return;
  const st = M.st, over = E.over(st);
  if (over){ UI.banner.classList.remove('turn-you'); return; }
  const seat = E.turn(st);
  const mine = isLocal(seat);
  const col = colourOf(seat);
  UI.bdot.style.background = 'radial-gradient(circle at 35% 30%,' + col.hi + ',' + col.hex + ' 60%,' + col.lo + ')';
  UI.banner.classList.toggle('turn-you', mine);

  /* who + phase */
  const whoName = mine ? T('Your turn', 'Imissek') : esc(seatName(seat)) + ' ' + T('is moving', 'qed jilgħab');
  let phaseTxt, hint, showCount = false, showStep = false, actLabel = '', actGhost = false, actDisabled = false;

  if (st.phase === E.PH_CLAIM && st.setupMode === 'random'){
    phaseTxt = T('Random deal', 'Tqassim aleatorju');
    if (mine){
      hint = T('Deal the whole world at once', 'Aqsam id-dinja kollha f’daqqa');
      actLabel = T('Deal', 'Qassam'); actGhost = false;
    } else {
      hint = T('dealing the world…', 'qed jaqsam id-dinja…');
      actLabel = '';
    }
  } else if (st.phase === E.PH_CLAIM){
    phaseTxt = T('Claim a territory', 'Ħu territorju');
    showCount = true;                                 /* armies left to place */
    if (mine){
      hint = T('Tap an empty land to claim it', 'Ikklikkja art vojta biex teħodha');
    } else {
      hint = T('claiming land…', 'qed jieħu l-art…');
    }
    actLabel = '';
  } else if (st.phase === E.PH_DEPLOY){
    phaseTxt = T('Place your armies', 'Poġġi l-armati');
    showCount = true;
    if (mine){
      hint = T('Tap your land to place an army', 'Ikklikkja artek biex tpoġġi armata');
    } else {
      hint = T('placing armies…', 'qed iqiegħed armati…');
    }
    actLabel = '';
  } else if (st.phase === E.PH_REINFORCE){
    phaseTxt = T('Reinforce', 'Rinforza');
    if (mine){
      if (st.mustTrade){
        hint = T('You hold too many cards — trade a set first', 'Għandek wisq karti — biddel sett l-ewwel');
      } else {
        hint = T('Tap your land to place armies', 'Ikklikkja artek biex tqiegħed armati');
      }
      showCount = true; showStep = !st.mustTrade;
      actLabel = T('Done', 'Lest'); actGhost = false; actDisabled = st.reinf > 0 || st.mustTrade;
    } else {
      hint = T('placing armies…', 'qed iqiegħed armati…');
      actLabel = '';
    }
  } else if (st.phase === E.PH_ATTACK){
    phaseTxt = T('Attack', 'Attakka');
    if (mine){
      hint = M.sel < 0 ? T('Tap a glowing land, then an enemy', 'Ikklikkja art tleqq, imbagħad għadu')
                       : T('Tap the enemy to strike', 'Ikklikkja l-għadu biex tolqot');
      actLabel = T('End attack', 'Temm l-attakk'); actGhost = true;
    } else {
      hint = T('choosing a battle…', 'qed jagħżel battalja…');
    }
  } else { /* fortify */
    phaseTxt = T('Fortify', 'Fortifika');
    if (mine){
      hint = M.fsel < 0 ? T('Move armies once, or end your turn', 'Ċaqlaq l-armati darba, jew temm')
                        : T('Tap where to send them', 'Ikklikkja fejn tibgħathom');
      actLabel = T('End turn', 'Temm id-dawra'); actGhost = true;
    } else {
      hint = T('regrouping…', 'qed jerġa\' jiġġema\'…');
    }
  }

  UI.bph.textContent = whoName + ' — ' + phaseTxt;
  UI.bhint.textContent = hint;

  UI.bcount.hidden = !showCount;
  if (showCount){
    UI.bcount.textContent = (st.phase === E.PH_CLAIM || st.phase === E.PH_DEPLOY)
      ? (st.setupLeft ? st.setupLeft[seat] : 0)
      : st.reinf;
  }
  UI.step.hidden = !showStep;
  if (showStep){ clampPlace(); UI.placen.textContent = M.place; }

  if (mine && actLabel){
    UI.act.hidden = false;
    UI.act.textContent = actLabel;
    UI.act.classList.toggle('ghost', actGhost);
    UI.act.disabled = actDisabled;
  } else {
    UI.act.hidden = true;
  }

  paintCardsBtn(seat, mine);
}

/* the little cards button in the banner: shows the local seat's hand size,
   glows gold when a set can be traded in reinforce, and turns red when the
   player MUST trade (5+ cards). */
function paintCardsBtn(seat, mine){
  if (!UI || !UI.cards) return;
  const st = M.st;
  const hand = E.handOf(st, seat);
  const canTrade = mine && st.phase === E.PH_REINFORCE && E.hasTradeSet(st, seat);
  if (!mine || !hand.length){ UI.cards.hidden = true; return; }
  UI.cards.hidden = false;
  UI.cards.classList.toggle('must', !!st.mustTrade);
  UI.cards.classList.toggle('trade', canTrade && !st.mustTrade);
  UI.cards.textContent = '🃏 ' + hand.length + (canTrade ? ' ⇄' : '');
}

function clampPlace(){
  if (!M) return;
  M.place = Math.max(1, Math.min(M.place | 0 || 1, Math.max(1, M.st.reinf)));
}
function bumpPlace(d){
  clampPlace();
  M.place = Math.max(1, Math.min(M.place + d, Math.max(1, M.st.reinf)));
  cue('ui.tap', { gain:0.6 });
  if (UI) UI.placen.textContent = M.place;
}

/* ═══════════════════════════════════════════════════════════════════
   INPUT — one entry for a territory tap, one for the primary action.
   ═══════════════════════════════════════════════════════════════════ */
function onTerr(i){
  if (!M || M.dead || M.busy) return;
  if (E.over(M.st)) return;
  const st = M.st, seat = E.turn(st);
  if (!isLocal(seat) || st._pending) return;
  if (rulesOpen){ setRules(false); return; }

  if (st.phase === E.PH_CLAIM){
    if (st.owner[i] !== E.UNOWNED){ cue('move.illegal', { gain:0.6 }); return; }
    doMove(seat, { t:'claim', to:i }, 'local');
    cue('piece.place', { gain:0.75 }, true);
    dropInBadge(i);
    afterLocal();
    return;
  }
  if (st.phase === E.PH_DEPLOY){
    if (st.owner[i] !== seat){ cue('move.illegal', { gain:0.6 }); return; }
    doMove(seat, { t:'deploy', to:i }, 'local');
    cue('piece.place', { gain:0.7 }, true);
    dropInBadge(i);
    afterLocal();
    return;
  }

  if (st.phase === E.PH_REINFORCE){
    if (st.owner[i] !== seat){ cue('move.illegal', { gain:0.6 }); return; }
    clampPlace();
    const n = Math.min(M.place, st.reinf);
    if (n < 1) return;
    doMove(seat, { t:'place', to:i, n }, 'local');
    cue('piece.place', { gain:0.7 }, true);
    dropInBadge(i);
    afterLocal();
    return;
  }

  if (st.phase === E.PH_ATTACK){
    if (M.sel < 0){
      if (st.owner[i] === seat && st.army[i] > 1 && E.attackTargets(st, i).length){
        M.sel = i; cue('move.select', { gain:0.7 }); paintAll();
      } else cue('move.illegal', { gain:0.6 });
      return;
    }
    /* a source is selected: tap an enemy neighbour to attack, or re-pick */
    if (i === M.sel){ M.sel = -1; cue('ui.back', { gain:0.6 }); paintAll(); return; }
    if (st.owner[i] === seat){
      /* re-select another own source */
      if (st.army[i] > 1 && E.attackTargets(st, i).length){ M.sel = i; cue('move.select', { gain:0.6 }); paintAll(); }
      else cue('move.illegal', { gain:0.6 });
      return;
    }
    if (E.areAdjacent(M.sel, i)){
      launchAttack(seat, M.sel, i);
    } else cue('move.illegal', { gain:0.6 });
    return;
  }

  /* fortify */
  if (st.phase === E.PH_FORTIFY){
    if (M.fsel < 0){
      if (st.owner[i] === seat && st.army[i] > 1){
        let hasDest = false;
        for (const v of E.adjOf(i)) if (st.owner[v] === seat){ hasDest = true; break; }
        if (hasDest){ M.fsel = i; cue('move.select', { gain:0.7 }); paintAll(); }
        else cue('move.illegal', { gain:0.6 });
      } else cue('move.illegal', { gain:0.6 });
      return;
    }
    if (i === M.fsel){ M.fsel = -1; cue('ui.back', { gain:0.6 }); paintAll(); return; }
    if (st.owner[i] === seat && E.fortifyReachable(st, seat, M.fsel, i)){
      askFortifyAmount(seat, M.fsel, i);
    } else cue('move.illegal', { gain:0.6 });
    return;
  }
}

function onAct(){
  if (!M || M.dead || M.busy) return;
  const st = M.st, seat = E.turn(st);
  if (!isLocal(seat) || E.over(st) || st._pending) return;

  if (st.phase === E.PH_CLAIM && st.setupMode === 'random'){
    doMove(seat, { t:'deal' }, 'local');
    cue('game.start', { gain:0.85 }, true);
    afterLocal(); return;
  }
  if (st.phase === E.PH_REINFORCE){
    if (st.reinf > 0 || st.mustTrade) return;  /* button is disabled anyway */
    doMove(seat, { t:'endphase' }, 'local'); afterLocal(); return;
  }
  if (st.phase === E.PH_ATTACK){
    M.sel = -1;
    doMove(seat, { t:'endphase' }, 'local'); afterLocal(); return;
  }
  /* fortify: End turn */
  M.fsel = -1;
  doMove(seat, { t:'endturn' }, 'local'); afterLocal();
}

/* ═══════════════════════════════════════════════════════════════════
   CARDS — the hand sheet + trade. A card shows a symbol (infantry /
   cavalry / artillery, or WILD), the territory it names (with the current
   owner's colour dot), and — during reinforce — a Trade action that shows
   the next escalating bonus. The continent-bonus legend lives here too, so
   the "take a continent → more units" reward is always visible.
   ═══════════════════════════════════════════════════════════════════ */
const SYM_GLYPH = ['🛡️', '🐎', '🎯'];   /* infantry, cavalry, artillery */
function symGlyph(sym){ return sym < 0 ? '★' : (SYM_GLYPH[sym] || '?'); }
function symName(sym){
  if (sym < 0) return T('Wild', 'Selvaġġ');
  return [T('Infantry','Infanterija'), T('Cavalry','Kavallerija'), T('Artillery','Artillerija')][sym] || '';
}
let cardSel = [];      /* the 0..3 selected card ids in the open sheet */

function openCardSheet(){
  if (!M || M.dead || !UI || !UI.mapbox) return;
  const st = M.st, seat = E.turn(st);
  const meSeat = firstLocalSeat();
  const viewSeat = (isLocal(seat)) ? seat : (meSeat >= 0 ? meSeat : seat);
  cardSel = [];
  const ov = document.createElement('div');
  ov.className = 'kq-sheet';
  ov.id = 'kq-cardsheet';
  UI.mapbox.appendChild(ov);
  const rebuild = () => paintCardSheet(ov, viewSeat);
  rebuild();
  ov._rebuild = rebuild;
  ov.addEventListener('pointerdown', e => { if (e.target === ov){ ov.remove(); cue('ui.back', { gain:0.6 }); } });
  cue('ui.sheet', { gain:0.8 });
}

function paintCardSheet(ov, viewSeat){
  const st = M.st;
  const turnSeat = E.turn(st);
  const isMyReinforce = viewSeat === turnSeat && isLocal(turnSeat) && st.phase === E.PH_REINFORCE && !st._pending && !M.busy && !E.over(st);
  const hand = E.handOf(st, viewSeat);
  /* validate current selection is still a set */
  const selValid = cardSel.length === 3 && E.isCardSet(cardSel[0], cardSel[1], cardSel[2]);
  const nextVal = E.nextTradeValue(st);

  let cardsHtml = '';
  if (!hand.length){
    cardsHtml = '<div class="kq-hint2">' + esc(T('You hold no cards yet. Capture at least one land in a turn to earn one.',
      'Għad m’għandek ebda karta. Aqbad mill-inqas art f’dawra biex taqla’ waħda.')) + '</div>';
  } else {
    cardsHtml = '<div class="kq-hand">';
    hand.forEach(cid => {
      const card = E.CARDS[cid];
      const sel = cardSel.indexOf(cid) >= 0 ? ' sel' : '';
      let inner;
      if (card.terr < 0){
        inner = '<span class="sym">★</span><span class="wild">' + esc(T('Wild','Selvaġġ')) + '</span>';
      } else {
        const o = st.owner[card.terr];
        const dot = o >= 0 ? colourOf(o).hex : '#3b4a5a';
        inner = '<span class="dot" style="background:' + dot + '"></span>' +
          '<span class="sym">' + symGlyph(card.sym) + '</span>' +
          '<span class="nm">' + esc(TE(E.TERRITORIES[card.terr].name)) + '</span>';
      }
      cardsHtml += '<button class="kq-card' + sel + '" data-cid="' + cid + '">' + inner + '</button>';
    });
    cardsHtml += '</div>';
  }

  /* trade row (only in the player's own reinforce) */
  let tradeHtml = '';
  if (isMyReinforce && hand.length >= 3){
    const auto = E.findSet(hand);
    tradeHtml =
      '<div class="kq-hint2">' + esc(st.mustTrade
        ? T('You hold 5+ cards — you must trade a set before placing.', 'Għandek 5+ karti — trid tibdel sett qabel tqiegħed.')
        : T('Pick three (a matched set) to trade for armies.', 'Agħżel tlieta (sett) biex tibdilhom għal armati.')) + '</div>' +
      '<div class="kq-trade-row">' +
        '<button class="kq-act ghost" id="kq-autoset"' + (auto ? '' : ' disabled') + '>' +
          esc(T('Pick a set', 'Agħżel sett')) + '</button>' +
        '<button class="kq-act" id="kq-dotrade"' + (selValid ? '' : ' disabled') + '>' +
          esc(T('Trade for', 'Ibdel għal')) + ' +' + nextVal + '</button>' +
      '</div>';
  } else if (hand.length >= 3){
    tradeHtml = '<div class="kq-hint2">' + esc(T('Trade a set of three during your Reinforce step.',
      'Ibdel sett ta’ tlieta waqt ir-Rinforz tiegħek.')) + '</div>';
  }

  /* continent-bonus legend */
  let contHtml = '<div class="kq-hint2" style="margin-top:9px">' + esc(T('Continent bonuses — own every land of one for extra armies each turn:',
    'Bonus tal-kontinenti — żomm il-kontinent kollu għal armati żejda kull dawra:')) + '</div><div class="kq-conts">';
  E.CONTINENTS.forEach(c => {
    const mineWhole = E.ownsRegion(st, viewSeat, c.id);
    const mem = E.REGION_MEMBERS[c.id];
    let held = 0; mem.forEach(t => { if (st.owner[t] === viewSeat) held++; });
    contHtml += '<div class="kq-cont' + (mineWhole ? ' mine' : '') + '">' +
      '<span class="cs" style="background:' + c.hex + '"></span>' +
      '<span class="cnm">' + esc(TE(c.name)) + '</span>' +
      '<span class="ck">' + held + '/' + mem.length + '</span>' +
      '<span class="cbn">+' + c.bonus + (mineWhole ? ' ✓' : '') + '</span></div>';
  });
  contHtml += '</div>';

  ov.innerHTML =
    '<div class="kq-sheet-in">' +
      '<div class="kq-sheet-h"><h4>' + esc(T('Cards & continents', 'Karti u kontinenti')) + '</h4>' +
        '<button class="kq-sheet-x" id="kq-sheet-x" aria-label="' + esc(T('Close','Agħlaq')) + '">✕</button></div>' +
      cardsHtml + tradeHtml + contHtml +
    '</div>';

  ov.querySelector('#kq-sheet-x').onclick = () => { ov.remove(); cue('ui.back', { gain:0.6 }); };
  ov.querySelectorAll('.kq-card').forEach(b => {
    b.onclick = () => {
      if (!isMyReinforce) return;
      const cid = +b.dataset.cid;
      const i = cardSel.indexOf(cid);
      if (i >= 0) cardSel.splice(i, 1);
      else { if (cardSel.length >= 3) cardSel.shift(); cardSel.push(cid); }
      cue('ui.tap', { gain:0.6 });
      paintCardSheet(ov, viewSeat);
    };
  });
  const auto = ov.querySelector('#kq-autoset');
  if (auto) auto.onclick = () => { const set = E.findSet(hand); if (set){ cardSel = set.slice(); cue('move.select', { gain:0.7 }); paintCardSheet(ov, viewSeat); } };
  const go = ov.querySelector('#kq-dotrade');
  if (go) go.onclick = () => {
    if (cardSel.length !== 3 || !E.isCardSet(cardSel[0], cardSel[1], cardSel[2])) return;
    const seat = E.turn(st);
    const res = doMove(seat, { t:'trade', x:cardSel[0], y:cardSel[1], z:cardSel[2] }, 'local');
    if (res.ok){
      cue('piece.place', { gain:0.85 }, true);
      cardSel = [];
      paintAll();
      /* if still must trade (rare), rebuild; else close the sheet */
      if (M.st.mustTrade){ paintCardSheet(ov, viewSeat); }
      else { ov.remove(); }
    }
  };
}

/* a small pop on a badge when armies drop in */
function dropInBadge(i){
  if (reduced() || !UI) return;
  const bg = UI.badgeEls[i];
  if (!bg) return;
  const c = bg.querySelector('circle');
  if (!c) return;
  const r0 = 12.5;
  let t0 = performance.now();
  function f(now){
    const k = Math.min(1, (now - t0) / 220);
    const e = 1 + 0.5 * Math.sin(k * Math.PI) * (1 - k);
    c.setAttribute('r', (r0 * e).toFixed(2));
    if (k < 1) requestAnimationFrame(f); else c.setAttribute('r', r0);
  }
  requestAnimationFrame(f);
}

/* ═══════════════════════════════════════════════════════════════════
   FORTIFY AMOUNT — a tiny inline chooser (P.ui.confirm-style prompt).
   We reuse a small slider dialog rather than a settings wall.
   ═══════════════════════════════════════════════════════════════════ */
function askFortifyAmount(seat, from, to){
  const st = M.st;
  const max = st.army[from] - 1;
  if (max < 1){ M.fsel = -1; paintAll(); return; }
  let n = max;                                /* default: send the lot but one */
  const ov = document.createElement('div');
  ov.style.cssText = 'position:absolute;inset:0;z-index:40;display:flex;align-items:flex-end;' +
    'justify-content:center;background:rgba(0,0,0,.45)';
  ov.innerHTML =
    '<div style="width:100%;max-width:420px;margin:0 8px 10px;padding:14px;border-radius:16px;' +
      'background:linear-gradient(180deg,#123452,#0a1c30);border:1px solid rgba(255,255,255,.16);' +
      'box-shadow:0 -8px 30px rgba(0,0,0,.5)">' +
      '<div style="font:900 12px/1 var(--disp);letter-spacing:.08em;text-transform:uppercase;color:var(--gold,#FFC542);margin-bottom:10px">' +
        esc(T('Move how many armies?', 'Kemm armati tibgħat?')) + '</div>' +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<button id="kqf-minus" style="width:44px;height:44px;border-radius:11px;border:0;font:900 22px/1 var(--disp);' +
          'color:#fff;background:rgba(255,255,255,.12);cursor:pointer">−</button>' +
        '<div id="kqf-n" style="flex:1;text-align:center;font:900 34px/1 var(--disp);color:#fff">' + n + '</div>' +
        '<button id="kqf-plus" style="width:44px;height:44px;border-radius:11px;border:0;font:900 22px/1 var(--disp);' +
          'color:#fff;background:rgba(255,255,255,.12);cursor:pointer">+</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:14px">' +
        '<button id="kqf-cancel" class="kq-act ghost" style="width:100%">' + esc(T('Back','Lura')) + '</button>' +
        '<button id="kqf-go" class="kq-act" style="width:100%">' + esc(T('Move','Ċaqlaq')) + '</button>' +
      '</div>' +
    '</div>';
  UI.mapbox.appendChild(ov);
  const nEl = ov.querySelector('#kqf-n');
  const upd = () => { nEl.textContent = n; };
  ov.querySelector('#kqf-minus').onclick = () => { n = Math.max(1, n - 1); cue('ui.tap',{gain:0.5}); upd(); };
  ov.querySelector('#kqf-plus').onclick  = () => { n = Math.min(max, n + 1); cue('ui.tap',{gain:0.5}); upd(); };
  ov.querySelector('#kqf-cancel').onclick = () => { ov.remove(); };
  ov.querySelector('#kqf-go').onclick = () => {
    ov.remove();
    M.fsel = -1;
    doMove(seat, { t:'fortify', from, to, n }, 'local');
    cue('piece.slide', { gain:0.7 }, true);
    afterLocal();
  };
}

/* ═══════════════════════════════════════════════════════════════════
   COMBAT — the hero animation. We resolve the move through the engine
   FIRST (so the dice are the shared, deterministic ones), then replay
   the recorded battle as an animation: an arrow source→target, both
   sides' dice tumbling then settling on the real faces, army ticks, and
   a colour-sweep + region flourish on a capture.
   ═══════════════════════════════════════════════════════════════════ */
function launchAttack(seat, from, to){
  if (!M || M.busy) return;
  M.busy = true;
  M.sel = -1;
  cue('duel.attack', { gain:0.7 }, true);
  const res = doMove(seat, { t:'attack', from, to }, 'local');
  if (!res.ok){ M.busy = false; paintAll(); return; }
  const battle = M.st.lastBattle;
  playBattle(battle, () => {
    /* the capture-advance (if any) is a distinct move; auto-resolve for the
       local player with a sensible garrison, or ask? Keep it friendly:
       auto-advance a good chunk so the human is not nagged every capture. */
    if (M.st._pending){
      const p = M.st._pending;
      const nMove = Math.max(p.min, Math.min(p.max, Math.ceil(p.max * 0.6)));
      doMove(seat, { t:'advance', n:nMove }, 'local');
      cue('duel.destroy', { gain:0.8 }, true);
      sweepCapture(battle.to, seat, () => { M.busy = false; afterLocal(); });
    } else {
      M.busy = false; afterLocal();
    }
  });
}

/* draw the dice overlay + arrow, tumble, settle, tick armies. */
function playBattle(battle, done){
  if (!UI || !battle){ if (done) done(); return; }
  const st = M.st;
  const fromT = E.TERRITORIES[battle.from], toT = E.TERRITORIES[battle.to];

  /* the attack arrow (an SVG line drawn on the map, fades out) */
  drawArrow(fromT.c, toT.c);

  if (reduced()){
    /* still: paint outcome at once, no tumble */
    cue('dice.roll', { gain:0.6 }, true);
    paintMap();
    if (battle.atkLoss || battle.defLoss) cue('duel.hit', { gain:0.7 });
    if (done) done();
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'kq-dice';
  overlay.innerHTML =
    '<div class="kq-dside"><span class="kq-dlabel">' + esc(T('Attack','Attakk')) + '</span>' +
      '<div class="kq-drow" id="kq-atk"></div></div>' +
    '<div class="kq-dside"><span class="kq-dlabel">' + esc(T('Defend','Difiża')) + '</span>' +
      '<div class="kq-drow" id="kq-def"></div></div>';
  UI.mapbox.appendChild(overlay);
  const atkRow = overlay.querySelector('#kq-atk'), defRow = overlay.querySelector('#kq-def');
  const mkDie = (cls) => { const d = document.createElement('div'); d.className = 'kq-die ' + cls + ' roll'; d.textContent = '?'; return d; };
  const atkEls = battle.atkDice.map(() => { const d = mkDie('atk'); atkRow.appendChild(d); return d; });
  const defEls = battle.defDice.map(() => { const d = mkDie('def'); defRow.appendChild(d); return d; });

  cue('dice.roll', { gain:0.8 }, true);
  const start = performance.now();
  const DUR = 620;
  function tumble(now){
    const k = Math.min(1, (now - start) / DUR);
    if (k < 1){
      /* show random faces while tumbling */
      const r = () => 1 + (Math.floor((now * 7) + Math.random() * 6) % 6);
      atkEls.forEach(d => { if (d.classList.contains('roll')) d.textContent = r(); });
      defEls.forEach(d => { if (d.classList.contains('roll')) d.textContent = r(); });
      M.raf = requestAnimationFrame(tumble);
      return;
    }
    /* settle on the real, sorted faces */
    const a = battle.atkDice.slice().sort((x,y)=>y-x);
    const dd = battle.defDice.slice().sort((x,y)=>y-x);
    atkEls.forEach((d, idx) => { d.classList.remove('roll'); d.textContent = a[idx]; });
    defEls.forEach((d, idx) => { d.classList.remove('roll'); d.textContent = dd[idx]; });
    /* mark win/lose per compared pair */
    const cmp = Math.min(a.length, dd.length);
    for (let idx = 0; idx < cmp; idx++){
      if (a[idx] > dd[idx]){ atkEls[idx].classList.add('win'); defEls[idx].classList.add('lose'); }
      else { defEls[idx].classList.add('win'); atkEls[idx].classList.add('lose'); }
    }
    if (battle.atkLoss || battle.defLoss) cue('duel.hit', { gain:0.75 }, true);
    /* tick the army badges to the post-battle values (engine already applied) */
    paintMap();
    setTimeout(() => { overlay.remove(); if (done) done(); }, battle.captured ? 260 : 640);
  }
  M.raf = requestAnimationFrame(tumble);
}

/* an attack arrow on the SVG, fading */
function drawArrow(a, b){
  if (!UI || !UI.svg || reduced()) return;
  const ns = 'http://www.w3.org/2000/svg';
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', a[0]); line.setAttribute('y1', a[1]);
  line.setAttribute('x2', b[0]); line.setAttribute('y2', b[1]);
  line.setAttribute('stroke', '#fff');
  line.setAttribute('stroke-width', '5');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('opacity', '0.9');
  line.style.filter = 'drop-shadow(0 0 4px rgba(255,80,80,.9))';
  UI.svg.appendChild(line);
  const t0 = performance.now();
  function f(now){
    const k = Math.min(1, (now - t0) / 700);
    line.setAttribute('opacity', (0.9 * (1 - k)).toFixed(2));
    if (k < 1) requestAnimationFrame(f); else line.remove();
  }
  requestAnimationFrame(f);
}

/* a colour sweep across a captured territory, then a region-taken flourish */
function sweepCapture(i, seat, done){
  if (!UI){ if (done) done(); return; }
  paintMap();
  const el = UI.terrEls[i];
  if (el && !reduced()){
    el.classList.add('sel');
    setTimeout(() => { if (el) el.classList.remove('sel'); }, 320);
  }
  /* region flourish if the capture completed a region for this seat */
  const rid = E.TERRITORIES[i].region;
  if (E.ownsRegion(M.st, seat, rid)){
    cue('sea.horn', { gain:0.85 }, true);
    flashRegion(rid);
    setTimeout(() => { if (done) done(); }, reduced() ? 0 : 520);
    return;
  }
  setTimeout(() => { if (done) done(); }, reduced() ? 0 : 200);
}
function flashRegion(rid){
  if (!UI || reduced()) return;
  const mem = E.REGION_MEMBERS[rid];
  const t0 = performance.now();
  function f(now){
    const k = Math.min(1, (now - t0) / 700);
    const a = Math.sin(k * Math.PI);
    mem.forEach(t => {
      const el = UI.terrEls[t];
      if (el) el.style.filter = 'drop-shadow(0 0 ' + (10 * a).toFixed(1) + 'px rgba(255,197,66,' + (0.9 * a).toFixed(2) + '))';
    });
    if (k < 1) requestAnimationFrame(f);
    else mem.forEach(t => { const el = UI.terrEls[t]; if (el) el.style.filter = ''; });
  }
  requestAnimationFrame(f);
}

/* ═══════════════════════════════════════════════════════════════════
   AFTER A LOCAL MOVE — repaint, check the end, else auto-advance phases
   with no legal action, and let the machine think if it is its turn.
   ═══════════════════════════════════════════════════════════════════ */
function afterLocal(){
  if (!M || M.dead) return;
  paintAll();
  if (E.over(M.st)){ finish(); return; }
  autoAdvanceIfStuck();
  maybeThink();
}

/* if the local player's ATTACK phase has no legal attack, we do NOT
   auto-skip (they may want to just end); but a REINFORCE phase always has
   an action, and a FORTIFY with no move offers only End turn — handled by
   the banner. We DO auto-advance an AI-irrelevant dead phase for smoothness
   only when it belongs to a non-local seat (handled inside maybeThink). */
function autoAdvanceIfStuck(){
  if (!M || M.dead || M.busy) return;
  const st = M.st;
  if (E.over(st)) return;
  const seat = E.turn(st);
  if (!isLocal(seat)) return;
  /* attack phase with zero possible attacks → hint stays; offer auto-move
     on: nothing to do but End attack. We leave the button; no popup. */
}

function maybeThink(){
  if (!M || M.dead || M.timer || M.busy) return;
  const st = M.st;
  if (E.over(st)) return;
  const seat = E.turn(st);
  if (isLocal(seat)) return;
  if (ownerOf(seat) === 'net') return;         /* a live human elsewhere */
  if (M.net && !M.net.iAmHost) return;         /* online: host drives bots/disconnected */
  const delay = reduced() ? 30 : 300;
  M.timer = setTimeout(runAiStep, delay);
}

/* one AI step: think → the single move → apply (with battle animation for
   attacks). Then schedule the next step until the turn passes. Bounded by
   the engine (think always returns a terminating move; endturn passes). */
function runAiStep(){
  M.timer = 0;
  if (!M || M.dead || M.busy) { if (M) maybeThink(); return; }
  const st = M.st;
  if (E.over(st)){ paintAll(); finish(); return; }
  const seat = E.turn(st);
  if (isLocal(seat) || ownerOf(seat) === 'net'){ paintAll(); return; }
  const mv = E.think(st, seat, seatLvl(seat));
  if (!mv){ paintAll(); return; }
  if (mv.t === 'attack'){
    M.busy = true;
    const res = doMove(seat, mv, 'local');
    if (!res.ok){ M.busy = false; paintAll(); return; }
    const battle = M.st.lastBattle;
    /* faint highlight of the AI's chosen source for legibility */
    playBattle(battle, () => {
      if (M.st._pending){
        const p = M.st._pending;
        const amv = E.think(M.st, seat, seatLvl(seat)) || { t:'advance', n:p.min };
        doMove(seat, amv.t === 'advance' ? amv : { t:'advance', n:p.min }, 'local');
        cue('duel.destroy', { gain:0.7 }, true);
        sweepCapture(battle.to, seat, () => { M.busy = false; continueAi(); });
      } else { M.busy = false; continueAi(); }
    });
    return;
  }
  /* non-attack moves apply instantly */
  const res = doMove(seat, mv, 'local');
  if (!res.ok){ paintAll(); return; }
  if (mv.t === 'place' || mv.t === 'claim' || mv.t === 'deploy') dropInBadge(mv.to);
  paintAll();
  continueAi();
}
function continueAi(){
  if (!M || M.dead) return;
  paintAll();
  if (E.over(M.st)){ finish(); return; }
  const seat = E.turn(M.st);
  if (isLocal(seat) || ownerOf(seat) === 'net'){ return; }
  const setupPh = (M.st.phase === E.PH_CLAIM || M.st.phase === E.PH_DEPLOY);
  const delay = reduced() ? 12 : (setupPh ? 130 : (M.st.phase === E.PH_REINFORCE ? 140 : 200));
  M.timer = setTimeout(runAiStep, delay);
}

/* ═══════════════════════════════════════════════════════════════════
   THE END — into the shared AAA winner screen (js/rebbieh.js). One row
   per player, ranked by the engine's final ranking (survival, then
   territories then armies).
   ═══════════════════════════════════════════════════════════════════ */
function finish(){
  if (!M || M.finished) return;
  M.finished = true;
  stopThinking();
  const st = M.st;
  const ov = E.over(st);
  if (!ov) return;
  cue('game.win', { gain:0.95 }, true);

  const me = firstLocalSeat();
  const iWon = me >= 0 && ov.winner === me;
  if (!M.net && !M.recorded){
    M.recorded = true;
    if (me >= 0){ if (iWon) ST.rec.w++; else ST.rec.l++; }
    persist();
  }
  saveSlot(null);

  const ranking = ov.ranking && ov.ranking.length ? ov.ranking : [ov.winner];
  const rows = ranking.map((seat, i) => {
    const isMe = isLocal(seat);
    const col = colourOf(seat);
    return {
      name: isMe ? T('You', 'Int')
        : ownerOf(seat) === 'ai' ? levelName(seatLvl(seat))
        : seatName(seat),
      place: i + 1,
      you: isMe,
      bot: ownerOf(seat) === 'ai',
      score: E.countTerr(st, seat) + '⬢ · ' + E.countArmies(st, seat) + '⚔',
      border: col.id
    };
  });

  const net = M.net;
  const title = ov.capped ? T('Time called', 'Ħin mitmum')
    : iWon ? T('The map is yours!', 'Il-mappa hi tiegħek!')
    : (me >= 0) ? T('Conquered', 'Mirbuħ')
    : seatColName(ov.winner) + ' ' + T('rules all', 'jaħkem kollox');

  const show = window.KARTI_REBBIEH && window.KARTI_REBBIEH.show;
  if (!show){
    P.ui.result(M.ctx, {
      tone: iWon ? 'win' : 'lose',
      head: title,
      why: T('The banners are counted.', 'Il-bnadar jingħaddu.'),
      buttons: [
        { label:T('Play again', 'Erġa\' lgħab'), icon:'refresh', cls:'primary',
          go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else setupSheet(); } },
        { label:T('Leave', 'Oħroġ'), icon:'back', cls:'ghost',
          go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }
      ]
    });
    return;
  }
  show({
    title,
    subtitle: ov.capped ? T('Most land at the bell', 'L-aktar art meta daqqet il-qanpiena')
                        : T('Last banner standing', 'L-aħħar bandiera weqfa'),
    rows,
    reduced: reduced(),
    lang: (window.KARTI_LANG ? KARTI_LANG.lang() : 'en'),
    sound: id => cue(id, {}, true),
    playAgainLabel: net ? T('Back to the rooms', 'Lura fil-kmamar') : T('Play again', 'Erġa\' lgħab'),
    onPlayAgain: () => { leave(); if (net && net.onLeave) net.onLeave(); else setupSheet(); },
    onLeave:     () => { leave(); if (net && net.onLeave) net.onLeave(); else P.hub(); }
  });
}

function leave(){
  stopThinking();
  if (M && M.raf){ cancelAnimationFrame(M.raf); M.raf = 0; }
  if (M){ autosave(); persistNow(); M.dead = true; M.busy = false; }
  M = null; UI = null;
}

/* ═══════════════════════════════════════════════════════════════════
   FIRST-RUN TIP
   ═══════════════════════════════════════════════════════════════════ */
function maybeTip(){
  if (seenTip || !UI || !UI.mapbox) return;
  const t = document.createElement('div');
  t.className = 'kq-tip';
  t.innerHTML = '<span>' + T('Share out the world, then reinforce, <b>attack</b>, fortify. Take a whole <b>continent</b> for a bonus, and <b>trade cards</b> for armies — tap 🃏 to see your hand!',
    'Qassam id-dinja, imbagħad rinforza, <b>attakka</b>, fortifika. Ħu <b>kontinent</b> sħiħ għal bonus, u <b>ibdel il-karti</b> għal armati — ikklikkja 🃏 biex tara l-karti!') +
    '</span><button id="kq-tipx">' + esc(T('Got it','Fhimt')) + '</button>';
  UI.mapbox.appendChild(t);
  t.querySelector('#kq-tipx').onclick = () => {
    t.remove(); seenTip = true;
    try { localStorage.setItem(UIKEY + '.tip', '1'); } catch(e){}
  };
}

/* ═══════════════════════════════════════════════════════════════════
   THE RULES CARD
   ═══════════════════════════════════════════════════════════════════ */
function rulesFor(){
  return [
    T('<b>The world</b> — forty territories in six <b>continents</b>. The opening is your host’s choice: ' +
      '<b>Claim</b> the lands in turn (an army on each), or a <b>Random deal</b> that shares the whole world ' +
      'out for you. Either way you then spread your remaining setup armies over your own land.',
      '<b>Id-dinja</b> — erbgħin territorju f’sitt <b>kontinenti</b>. Il-bidu jagħżlu min jospita: <b>Ħu</b> ' +
      'l-artijiet bir-rota (armata fuq kull waħda), jew <b>Tqassim aleatorju</b> li jqassam id-dinja kollha. ' +
      'Imbagħad ixxerred il-bqija tal-armati fuq artek.'),
    T('Then play begins. On your turn you take <b>three steps</b>.',
      'Imbagħad tibda l-logħba. F’dawra tiegħek tagħmel <b>tliet passi</b>.'),
    T('<b>1 · Reinforce</b> — armies = one per three lands (at least three) <b>plus every whole continent’s ' +
      'bonus</b> (Aurora 5, Meridia 5, others 2–3). You may also <b>trade a set of three cards</b> for a growing ' +
      'pile of armies (4, 6, 8, 10, 12, 15, then +5 each).',
      '<b>1 · Rinforza</b> — armati = waħda għal kull tliet artijiet (mill-inqas tlieta) <b>flimkien mal-bonus ' +
      'ta’ kull kontinent sħiħ</b>. Tista’ wkoll <b>tibdel sett ta’ tliet karti</b> għal armati (4, 6, 8, 10, 12, 15, imbagħad +5).'),
    T('<b>2 · Attack</b> — tap one of your lands, then a bordering enemy. Both roll dice; the higher wins, ' +
      'ties go to the defender. Empty a land and it is <b>yours</b>. Capture at least one land in a turn and ' +
      'you <b>earn a card</b> at its end.',
      '<b>2 · Attakka</b> — ikklikkja waħda minn artek, imbagħad għadu maġenbek. It-tnejn jarmu dadi; l-ogħla ' +
      'jirbaħ, l-indaqs għad-difensur. Battal art u ssir <b>tiegħek</b>. Aqbad art f’dawra u <b>taqla’ karta</b>.'),
    T('<b>3 · Fortify</b> — move armies once between two of your connected lands, then end your turn.',
      '<b>3 · Fortifika</b> — ċaqlaq l-armati darba bejn żewġ artijiet tiegħek konnessi, imbagħad temm id-dawra.'),
    T('Take a rival’s last land and you <b>seize their cards</b>. Hold five or more and you <b>must trade</b>. ' +
      'Own the <b>whole world</b> — every territory — to win.',
      'Ħu l-aħħar art ta’ rivali u <b>taħtaf il-karti tiegħu</b>. Żomm ħamsa jew aktar u <b>trid tibdel</b>. ' +
      'Aħkem id-<b>dinja kollha</b> biex tirbaħ.')
  ];
}
function paintRules(){
  if (!UI || !UI.rules) return;
  UI.rules.querySelector('#kq-rules-t').textContent =
    T('Konkwista', 'Konkwista') + ' — ' + T('the rules', 'ir-regoli');
  UI.rules.querySelector('#kq-rules-b').innerHTML =
    '<ul style="margin:0;padding:0">' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul>';
  UI.rules.classList.toggle('open', rulesOpen);
  UI.rules.setAttribute('aria-hidden', rulesOpen ? 'false' : 'true');
}
function setRules(open){
  rulesOpen = !!open;
  try { localStorage.setItem(UIKEY + '.rules', rulesOpen ? '1' : '0'); } catch(e){}
  cue(rulesOpen ? 'ui.sheet' : 'ui.back', { gain:0.8 });
  paintRules();
}

/* ═══════════════════════════════════════════════════════════════════
   THE ENTRY SCREEN — MINIMAL. PLAY ONLINE / PLAY WITH AI / PASS THE PHONE
   + "How to play". Settings (players, difficulty, turn-cap) are a tiny
   SECOND step. Back goes to the hub with no confirm popup.
   ═══════════════════════════════════════════════════════════════════ */
function heroSVG(){
  /* a little archipelago badge in the seat colours — the game worn as a mark */
  let s = '<svg viewBox="0 0 280 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<defs><linearGradient id="kqh-sea" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#1a5080"/><stop offset="1" stop-color="#0a1c30"/></linearGradient></defs>' +
    '<rect x="0" y="0" width="280" height="150" rx="14" fill="url(#kqh-sea)"/>';
  const isles = [
    [40,50, '#d92b2b'], [95,38,'#2b6cd9'], [150,58,'#e6b422'],
    [205,42,'#2fa34d'], [70,100,'#e8752a'], [135,110,'#8a4bd0'], [215,100,'#d92b2b']
  ];
  isles.forEach(([x,y,c]) => {
    s += '<path d="M' + x + ' ' + y + ' q18 -12 34 2 q10 12 -4 22 q-18 10 -34 -2 q-10 -12 4 -22 z" ' +
      'fill="' + c + '" stroke="#0a1622" stroke-width="2"/>' +
      '<circle cx="' + (x+15) + '" cy="' + (y+10) + '" r="8" fill="rgba(0,0,0,.4)"/>' +
      '<text x="' + (x+15) + '" y="' + (y+14) + '" font-family="var(--disp)" font-weight="900" ' +
      'font-size="11" fill="#fff" text-anchor="middle">' + (Math.floor(Math.random()*4)+2) + '</text>';
  });
  return s + '</svg>';
}

function setupSheet(){
  injectCSS();
  P.show();
  stopThinking(); M = null; UI = null;
  const el = P.ui.screenEl();
  const online = canGoOnline();

  el.innerHTML =
    '<div class="pt-wrap kq-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="kq-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + esc(T('Konkwista', 'Konkwista')) + '</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="kq-hero" aria-hidden="true">' + heroSVG() +
        '<span class="kq-hero-cap">' + E.N_TERR + ' &middot; ' + E.REGIONS.length + '</span></div>' +
      '<p class="blurb">' +
        T('Share out the world, roll the dice, conquer every land. Reinforce, attack, fortify — hold a ' +
          'whole continent for a bonus, trade cards for armies, and be the last banner standing.',
          'Qassam id-dinja, armi d-dadi, aħkem kull art. Rinforza, attakka, fortifika — żomm kontinent ' +
          'sħiħ għal bonus, ibdel il-karti għal armati, u kun l-aħħar bandiera weqfa.') +
      '</p>' +

      (ST.save
        ? '<button class="btn primary" id="kq-res" style="margin:2px 0 12px">' +
          esc(T('Carry on the campaign', 'Kompli l-kampanja')) + '</button>'
        : '') +

      '<div class="kq-modes" style="display:grid;gap:9px;margin-top:4px">' +
        (online
          ? '<button class="btn primary" id="kq-online">' + ico('users') + ' ' +
            esc(T('Play online', 'Ilgħab onlajn')) + '</button>'
          : '') +
        '<button class="btn' + (online ? ' ghost' : ' primary') + '" id="kq-ai">' +
          ico('coach') + ' ' + esc(T('Play with the machine', 'Ilgħab mal-magna')) + '</button>' +
        '<button class="btn ghost" id="kq-pnp">' + ico('users') + ' ' +
          esc(T('Pass the phone', 'Għaddi t-telefon')) + '</button>' +
        '<button class="btn ghost" id="kq-rulesbtn">' + ico('book') + ' ' +
          esc(T('How to play', 'Kif tilgħab')) + '</button>' +
      '</div>' +

      (ST.rec.w + ST.rec.l
        ? '<p class="pt-ledger" style="margin-top:14px">' +
          T('So far: <b>' + ST.rec.w + '</b> won, <b>' + ST.rec.l + '</b> lost.',
            'S’issa: <b>' + ST.rec.w + '</b> rebħin, <b>' + ST.rec.l + '</b> mitlufin.') +
          '</p>'
        : '') +
    '</div>' +

    '<div class="kq-rules" id="kq-menurules" aria-hidden="true">' +
      '<div class="kq-rules-h"><h4>' + esc(T('Konkwista', 'Konkwista')) + ' — ' +
        esc(T('the rules', 'ir-regoli')) + '</h4>' +
        '<button class="kq-rules-x" id="kq-menurules-x" aria-label="' + esc(T('Close', 'Agħlaq')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="kq-rules-b"><ul style="margin:0;padding:0">' +
        rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul></div>' +
    '</div>' +
    '</div>';

  el.querySelector('#kq-back').onclick = () => { cue('ui.back'); P.hub(); };
  const on = el.querySelector('#kq-online');
  if (on) on.onclick = () => { if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('konkwista'); };
  el.querySelector('#kq-ai').onclick  = () => settingsStep('ai');
  el.querySelector('#kq-pnp').onclick = () => settingsStep('pnp');
  const rs = el.querySelector('#kq-res');
  if (rs) rs.onclick = () => { if (ST.save) newGame(null, ST.save); };

  const rules = el.querySelector('#kq-menurules');
  const openRules = o => {
    rules.classList.toggle('open', o);
    rules.setAttribute('aria-hidden', o ? 'false' : 'true');
    cue(o ? 'ui.sheet' : 'ui.back', { gain:0.8 });
  };
  el.querySelector('#kq-rulesbtn').onclick = () => openRules(!rules.classList.contains('open'));
  el.querySelector('#kq-menurules-x').onclick = () => openRules(false);

  if (window.KARTI_LANG && KARTI_LANG.onChange && !setupSheet._sub){
    setupSheet._sub = KARTI_LANG.onChange(() => {
      try { if (!M && el.isConnected && el.querySelector('#kq-ai')) setupSheet();
            else if (M && UI){ paintAll(); paintRules(); } } catch(e){}
    });
  }
}

/* the ONE tiny second step: players, difficulty, turn-cap. Not a wall. */
function settingsStep(mode){
  injectCSS();
  P.show();
  const el = P.ui.screenEl();
  const p = pref();
  let seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, p.seats || 3));
  let humans = mode === 'pnp' ? Math.max(2, Math.min(seats, p.humans || 2)) : 1;
  let lvl = p.lvl || 2;
  let cap = p.turnCap || E.DEFAULT_TURN_CAP;
  let setup = (p.setup === 'random') ? 'random' : 'claim';

  function paint(){
    if (mode === 'pnp') humans = Math.max(2, Math.min(seats, humans));
    el.innerHTML =
      '<div class="pt-wrap kq-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="kq-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(mode === 'pnp' ? T('Pass the phone', 'Għaddi t-telefon') : T('Play the machine', 'Ilgħab mal-magna')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +

        '<div class="tiny pt-lbl">' + esc(T('How many players', 'Kemm-il plejer')) + '</div>' +
        '<div class="pt-opts two" id="kq-seatpick" style="grid-template-columns:repeat(5,1fr)">' +
          [2,3,4,5,6].map(n =>
            '<button class="pt-opt' + (n === seats ? ' on' : '') + '" data-seats="' + n + '" style="min-width:0;text-align:center">' +
            '<b style="font-size:18px">' + n + '</b></button>').join('') +
        '</div>' +

        (mode === 'pnp'
          ? '<div class="tiny pt-lbl" style="margin-top:10px">' + esc(T('People on this phone', 'Nies fuq dan it-telefon')) + '</div>' +
            '<div class="pt-opts two" id="kq-humanpick" style="grid-template-columns:repeat(' + (seats-1) + ',1fr)">' +
              (function(){ let h=''; for(let n=2;n<=seats;n++){ h+='<button class="pt-opt'+(n===humans?' on':'')+'" data-humans="'+n+'" style="min-width:0;text-align:center"><b style="font-size:16px">'+n+'</b></button>'; } return h; })() +
            '</div>' +
            '<div class="tiny" style="opacity:.6;margin-top:5px">' + esc(T('Any empty seats are played by the machine.','Kwalunkwe siġġu vojt jilagħbu l-magna.')) + '</div>'
          : '') +

        (mode === 'ai' || (mode === 'pnp' && humans < seats)
          ? '<div class="tiny pt-lbl" style="margin-top:12px">' + esc(T('How sharp is the machine', 'Kemm hi taħraq il-magna')) + '</div>' +
            '<div class="pt-opts" id="kq-lvl">' + levels().map(o =>
              '<button class="pt-opt' + (o.level === lvl ? ' on' : '') + '" data-lvl="' + o.level + '">' +
              ico(o.icon || ('diff-' + Math.min(3, o.level))) +
              '<b>' + esc(o.name) + '</b><i>' + esc(TE(o.note)) + '</i></button>').join('') +
            '</div>'
          : '') +

        '<div class="tiny pt-lbl" style="margin-top:12px">' + esc(T('How the world is shared out', 'Kif titqassam id-dinja')) + '</div>' +
        '<div class="pt-opts two" id="kq-setup" style="grid-template-columns:repeat(2,1fr)">' +
          '<button class="pt-opt' + (setup === 'claim' ? ' on' : '') + '" data-setup="claim">' +
            '<b>' + esc(T('Claim','Ħu')) + '</b><i>' + esc(T('pick lands in turn','agħżel bir-rota')) + '</i></button>' +
          '<button class="pt-opt' + (setup === 'random' ? ' on' : '') + '" data-setup="random">' +
            '<b>' + esc(T('Random deal','Tqassim aleatorju')) + '</b><i>' + esc(T('dealt out for you','jitqassmu għalik')) + '</i></button>' +
        '</div>' +

        '<div class="tiny pt-lbl" style="margin-top:12px">' + esc(T('Safety turn limit', 'Limitu ta’ sigurtà')) + '</div>' +
        '<div class="pt-opts two" id="kq-cap" style="grid-template-columns:repeat(3,1fr)">' +
          [20,40,80].map(n =>
            '<button class="pt-opt' + (n === cap ? ' on' : '') + '" data-cap="' + n + '" style="min-width:0;text-align:center">' +
            '<b>' + n + '</b><i>' + esc(T('rounds','dawriet')) + '</i></button>').join('') +
        '</div>' +

        '<div class="pt-acts" style="margin-top:18px;display:grid;gap:9px">' +
          '<button class="btn primary" id="kq-go">' + esc(T('Start', 'Ibda')) + '</button>' +
        '</div>' +
      '</div></div>';

    el.querySelector('#kq-back').onclick = () => { cue('ui.back'); setupSheet(); };
    el.querySelectorAll('[data-seats]').forEach(b => b.onclick = () => { seats = +b.dataset.seats; if(mode==='pnp'&&humans>seats)humans=seats; cue('ui.tap',{gain:0.8},true); paint(); });
    el.querySelectorAll('[data-humans]').forEach(b => b.onclick = () => { humans = +b.dataset.humans; cue('ui.tap',{gain:0.8},true); paint(); });
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { lvl = +b.dataset.lvl; cue('ui.tap',{gain:0.8},true); paint(); });
    el.querySelectorAll('[data-cap]').forEach(b => b.onclick = () => { cap = +b.dataset.cap; cue('ui.tap',{gain:0.8},true); paint(); });
    el.querySelectorAll('[data-setup]').forEach(b => b.onclick = () => { setup = b.dataset.setup; cue('ui.tap',{gain:0.8},true); paint(); });
    el.querySelector('#kq-go').onclick = () => {
      pref({ seats, humans, lvl, turnCap:cap, setup });
      newGame({ seats, humans:(mode==='pnp'?humans:1), lvl, turnCap:cap, setup });
    };
  }
  paint();
}

function canGoOnline(){
  try {
    const MP = window.KARTI_MP;
    return !!(MP && MP.openFor && P.online && P.online.konkwista);
  } catch(e){ return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   START A LOCAL GAME. meta stamps who owns each seat. Empty seats (beyond
   `humans`) are the machine.
   ═══════════════════════════════════════════════════════════════════ */
function newGame(opts, snap){
  injectCSS();
  P.show();
  let meta;
  if (snap){
    if (!snap.opts){ setupSheet(); return; }
    startMatch(snap.opts, snap.seed, snap.log);
    meta = snap.meta || defaultMeta(snap.opts);
  } else {
    startMatch(opts, null);
    meta = defaultMeta(opts);
  }
  M.meta = meta;
  applyMeta();
  M.finished = false;
  openBoard(() => setupSheet());
  cue('game.start', { gain:0.9 }, true);
  paintAll();
  autoAdvanceIfStuck();
  maybeThink();      /* if the machine has the first seat, let it open */
}
function defaultMeta(opts){
  opts = opts || {};
  const seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, opts.seats | 0 || 3));
  const lvl = opts.lvl || 2;
  const humans = Math.max(1, Math.min(seats, opts.humans | 0 || 1));
  const meta = [];
  for (let i = 0; i < seats; i++){
    if (i === 0) meta.push({ own:'me', name: myName(), lvl });
    else if (i < humans) meta.push({ own:'hot', name: T('Player', 'Plejer') + ' ' + (i + 1), lvl });
    else meta.push({ own:'ai', name: levelName(lvl), lvl });
  }
  return meta;
}
function myName(){
  try {
    const n = K.displayName && K.displayName();
    if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
      return String(n).trim().slice(0, 14);
  } catch(e){}
  return T('You', 'Int');
}

/* ═══════════════════════════════════════════════════════════════════
   THE ONLINE CONTROLLER — KARTI_PARTY.online.konkwista. js/mp.js is the
   only caller. Turn-based move relay (NOT lockstep): a flat move is
   relayed and applied deterministically on every client; the seeded dice
   are recomputed identically, so all clients agree on the board and whose
   turn it is. A disconnected seat is CONTINUED BY THE AI (the host drives
   it) so the table never deadlocks.
   ═══════════════════════════════════════════════════════════════════ */
const hooks = {
  onMove(fn){ moveSubs.push(fn); return () => { const i = moveSubs.indexOf(fn); if (i >= 0) moveSubs.splice(i, 1); }; },
  phase(){ return M ? 'play' : 'idle'; },
  apply(seat, move){ if (!M) return { ok:false, why:'no konkwista' }; return onlineRemote(seat, move); },
  attachNet(net){ if (M){ M.net = net || null; maybeThink(); } },
  setOwner(i, own){ if (M && M.meta && M.meta[i]){ M.meta[i].own = own; if (own === 'ai' && !M.meta[i].lvl) M.meta[i].lvl = 2; maybeThink(); } },
  setName(i, name){ if (M && M.meta && M.meta[i] && name){ M.meta[i].name = name; } },
  live(){ return !!(M && !M.dead && !E.over(M.st)); },
  seatBack(){ if (M){ paintAll(); } }
};

function onlineStart(cfg){
  cfg = cfg || {};
  injectCSS();
  P.show();
  const roomSeats = cfg.seats || [];
  const nSeats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, roomSeats.length || 3));
  startMatch({ seats:nSeats, lvl: 2, turnCap: (cfg.turnCap || E.DEFAULT_TURN_CAP) }, cfg.seed);
  M.meta = [];
  for (let i = 0; i < nSeats; i++){
    const s = roomSeats[i] || {};
    const own = (i === cfg.you) ? 'me' : (s.own === 'ai' || s.kind === 'cpu') ? 'ai' : 'net';
    M.meta.push({ own, name: s.name || seatColName(i), lvl: s.level || 2 });
  }
  applyMeta();
  M.net = cfg.net || null;
  M.finished = false;
  openBoard(() => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); });
  hooks.attachNet(cfg.net || null);
  paintAll();
  maybeThink();
  return snapshot();
}
function onlineRemote(seat, move){
  if (!M) return { ok:false, why:'no konkwista on the table' };
  if (E.over(M.st)) return { ok:false, why:'the game is over' };
  const dec = E.decWire ? (E.decWire(move) || move) : move;
  if (!E.check(M.st, dec, seat)) return { ok:false, why:'that move did not fit the rules' };
  /* a remote attack animates too, for parity */
  if (dec.t === 'attack'){
    M.busy = true;
    const res = doMove(seat, dec, 'net');
    if (!res.ok){ M.busy = false; return { ok:false, why: res.err || 'illegal' }; }
    const battle = M.st.lastBattle;
    playBattle(battle, () => {
      if (M.st._pending){ /* the advance arrives as its own relayed move */ }
      M.busy = false; paintAll();
      if (E.over(M.st)) finish();
    });
    return { ok:true };
  }
  const res = doMove(seat, dec, 'net');
  if (!res.ok) return { ok:false, why: res.err || 'that move did not fit the rules' };
  if (dec.t === 'advance' && M.st.lastBattle && M.st.lastBattle.captured) sweepCapture(M.st.lastBattle.to, seat, () => {});
  if (dec.t === 'place' || dec.t === 'claim' || dec.t === 'deploy') dropInBadge(dec.to);
  paintAll();
  if (E.over(M.st)) finish();
  return { ok:true };
}
function onlineNote(text, tone){ if (M && M.ctx) P.ui.setNet(M.ctx, text || '', tone || ''); }
function onlineStop(why, tone){
  if (!M || !M.ctx) return;
  stopThinking();
  P.ui.setNet(M.ctx, '', '');
  P.ui.result(M.ctx, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? T('No result', 'Ebda riżultat') : T('Cut off', 'Inqata’'),
    why:  why || T('The game stopped.', 'Il-logħba waqfet.'),
    quip: T('The map is folded away.', 'Il-mappa tintwa.'),
    buttons: [{ label:T('Back to the rooms', 'Lura fil-kmamar'), icon:'back', cls:'primary',
                go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
  });
}

P.online = P.online || {};
P.online.konkwista = {
  start: onlineStart,
  remote: onlineRemote,
  note: onlineNote,
  stop: onlineStop,
  live: () => !!(M && !M.dead && hooks.live()),
  hooks
};

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — window.KARTI_KONKWISTA.lobby. Read by js/mp.js.
   Two to six seats. canStart refuses until the relay knows 'konkwista'
   (the integration must add it — noted in the report).
   ═══════════════════════════════════════════════════════════════════ */
const LOBBY = {
  id:'konkwista',
  name:'Konkwista',
  mt:'Konkwista',
  minSeats: E.MIN_SEATS,
  maxSeats: E.MAX_SEATS,
  levels: levels().map(L => ({ level:L.level, name:L.name, note:TE(L.note) })),
  defaultLevel: 2,
  variants: null,          /* one map / one mode for now; no variant wall */
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    const n = (seatList || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why: T('Konkwista needs at least two.', 'Konkwista trid mill-inqas tnejn.') };
    if (n > E.MAX_SEATS) return { ok:false, why: T('Up to six can play.', 'Sa sitta jistgħu jilagħbu.') };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready) return { ok:false, why: unready + (unready > 1
        ? T(' people are not ready yet.', ' persuni għadhom mhux lesti.')
        : T(' person is not ready yet.', ' persuna għadha mhux lesta.')) };
    return { ok:true, why:'' };
  },
  rulesHTML: () =>
    '<p>' + T('Two to six players carve up a world of forty lands in six continents. Each turn: reinforce, ' +
      'attack a neighbour with the dice, then fortify. Hold a whole continent for a bonus, and trade sets of cards for armies.',
      'Minn tnejn sa sitta jaqsmu dinja ta’ erbgħin art f’sitt kontinenti. Kull dawra: rinforza, attakka ġar bid-dadi, imbagħad fortifika. ' +
      'Żomm kontinent sħiħ għal bonus, u ibdel settijiet ta’ karti għal armati.') + '</p>' +
    '<p>' + T('Lose all your land and you are out; the last banner standing wins. Perfect information and ' +
      'shared dice make online as honest as across a table.',
      'Itlef artek kollha u toħroġ; l-aħħar bandiera tirbaħ. Informazzjoni sħiħa u dadi maqsuma jagħmlu ' +
      'l-onlajn onest daqs wiċċ imb wiċċ.') + '</p>',
  blurb: T('Share out the world, roll the dice, conquer every land.',
           'Qassam id-dinja, armi d-dadi, aħkem kull art.'),
  start(seats, opts){
    return newGame(Object.assign({ seats: Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, (seats||[]).length || 3)),
                                   humans:2, lvl:(pref().lvl || 2) }, opts || {}));
  },
  myName,
  wire: { fields: E.WIRE_FIELDS },
  takeback: false
};
R.lobby = LOBBY;

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF — one tile. kind:'board' puts it with the board games.
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'konkwista', order:29, kind:'board', cat:'board',
  name:'Konkwista', mt:'Konkwista', icon:'map', status:'live',
  get tag(){
    return T('Share out the world, roll the dice, conquer every land. A world conquest for ' +
             'two to six — reinforce, attack, fortify, trade cards, and hold a continent for a bonus.',
             'Qassam id-dinja, armi d-dadi, aħkem kull art. Konkwista tad-dinja għal tnejn sa sitta — ' +
             'rinforza, attakka, fortifika, ibdel karti, u żomm kontinent għal bonus.') +
           (ST.save ? ' ' + T('There is a campaign half-played.', 'Hemm kampanja nofsha milgħuba.') : '');
  },
  open: () => setupSheet(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: LOBBY.levels,
  rulesHTML: () => LOBBY.rulesHTML(),
  start: (seatList, o) => LOBBY.start(seatList, o)
};
R.shelfTile = TILE;
R.ui = { open: setupSheet, board: buildBoard, leave, injectCSS };
R.open  = () => setupSheet();
R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

/* ── test hooks — inert unless the page is opened with ?konkwistatest ── */
if (/[?&]konkwistatest\b/.test(location.search || '')){
  window.__KONKWISTA_TEST = {
    setupSheet, settingsStep, newGame, onTerr, onAct, launchAttack, paintAll,
    get M(){ return M; }, get UI(){ return UI; },
    engine: E, LOBBY, hooks, online: P.online.konkwista, leave,
    computeLegalSet, reduced,
    /* drive the local seat through the REAL move gate (what a thumb triggers),
       then run the same post-move pipeline the UI runs. */
    doMove: (seat, move) => { const r = doMove(seat, move, 'local'); afterLocal(); return r; },
    afterLocal, finish
  };
}

})();
