/* ═══════════════════════════════════════════════════════════════════
   KARTI — kaxxi-ui.js
   IL-KAXXI ("PUNTINI U KAXXI", dots & boxes) — the tappable game on top
   of js/kaxxi.js's pure engine (window.KARTI_KAXXI.engine). This file is
   the screen, the runner and the wire, and it follows js/erbgha-ui.js's
   shape deliberately: a match is (opts, seed, log), every move goes
   through one doMove() gate, and a rollback is cutting the log.

   WHAT THIS FILE IS
     · the shelf tile and the MINIMAL entry menu — a themed hero, three
       big buttons (PLAY ONLINE / PLAY WITH AI / PASS THE PHONE) and a
       "How to play" that slides the rules up; players (2–4), board size
       and difficulty live on a tiny SECOND step, never a settings wall
     · the board: a canvas grid of dots, tappable edges with hover/press
       feedback, edges that stroke in, captured boxes that POP in the
       capturer's colour with their mark, chain captures that CASCADE,
       an "extra turn!" flash, per-seat box-count chips and an active-seat
       turn indicator in that seat's colour
     · the runner: log, seed, autosave (karti_kaxxi_v1)
     · the online controller published on KARTI_PARTY.online.kaxxi and the
       lobby contract on window.KARTI_KAXXI.lobby, both the shape js/mp.js
       reads (see js/erbgha-ui.js / js/ludu-ui.js)

   ONLINE IS HONEST BY CONSTRUCTION. Dots & boxes has no hidden state and
   no seed-dependent play — every phone draws the same edges onto the
   identical shared board off the same list and each derives the capture /
   extra-turn / whose-turn result the same way. So the online controller
   relays a bare edge {dir,r,c} through encWire/decWire and the engine
   (the referee) gates it. Nothing to reveal, nothing to hide.

   HOUSE RULES OBEYED
     · borrows #scr-party through KARTI_PARTY, injects its own CSS once,
       never touches css/ or the tab bar's ancestors;
     · sounds ONLY through KARTI_SFX ids that already exist (piece.slide /
       move.select for drawing an edge, piece.place / piece.capture for a
       capture, chain.eat for a cascade, game.win for the flourish);
     · every player-visible string is a T(en,mt) pair at its call site;
     · the back arrow goes BACK — it never asks "are you sure": the game
       is autosaved on every move and the menu offers it again at the top.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_KAXXI;
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
   THE SEAT COLOURS — up to four, warm and legible on the deep board,
   told apart at a glance. Each carries a MARK (initial) painted into the
   captured box, so colour is never the only signal (a11y).
   ═══════════════════════════════════════════════════════════════════ */
const SEATS = [
  { id:'red',    hex:'#F0384B', hi:'#FF6D7C', lo:'#B01625', mark:'A', name:{ en:'Red',    mt:'Aħmar' } },
  { id:'blue',   hex:'#3B8CF0', hi:'#78B4FF', lo:'#1D5DB0', mark:'B', name:{ en:'Blue',   mt:'Blu'   } },
  { id:'yellow', hex:'#FFC542', hi:'#FFE08A', lo:'#C89211', mark:'C', name:{ en:'Yellow', mt:'Isfar' } },
  { id:'green',  hex:'#38C26E', hi:'#6FE79C', lo:'#1C8C48', mark:'D', name:{ en:'Green',  mt:'Aħdar' } }
];
const seatColour = seat => SEATS[seat] || SEATS[0];
const seatColName = seat => TE(seatColour(seat).name);

/* ═══════════════════════════════════════════════════════════════════
   OUR CORNER OF localStorage — the save, the prefs and the record, the
   erbgha/ludu way: one key, debounced, flushed inline when the tab hides.
   ═══════════════════════════════════════════════════════════════════ */
const STORE  = 'karti_kaxxi_v1';
const SAVE_V = 1;
let ST = { v:1, pref:{}, rec:{ w:0, l:0, d:0 }, save:null };
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

const UIKEY = 'karti_kaxxi_ui_v1';
let rulesOpen = false;
try { rulesOpen = localStorage.getItem(UIKEY + '.rules') === '1'; } catch(e){}

/* the machine's sharpnesses, off the engine's LEVELS */
function levels(){ return (E.LEVELS || []).map(L => ({ level:L.k, name:L.name, note:L.note, icon:L.icon })); }
function levelName(k){ const L = levels().find(x => x.level === k); return (L && L.name) || 'MAKNA'; }
function levelNote(k){ const L = levels().find(x => x.level === k); return L ? TE(L.note) : ''; }

/* board sizes, off the engine */
function sizes(){ return (E.SIZES || []).map(s => ({ id:s.id, boxRows:s.boxRows, boxCols:s.boxCols, name:s.name })); }
function sizeName(id){ const s = sizes().find(x => x.id === id); return s ? TE(s.name) : ''; }

/* ═══════════════════════════════════════════════════════════════════
   SOUND — existing ids only (js/sfx.js), through one gate so a fast run
   does not machine-gun the mixer. move.select for drawing an edge,
   piece.capture for a box, chain.eat for a cascade, game.win for the win.
   ═══════════════════════════════════════════════════════════════════ */
let cueAt = 0;
function cue(id, opts, big){
  const S = window.KARTI_SFX;
  if (!S) return;
  const now = Date.now();
  if (!big && now - cueAt < 40) return;
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
let M = null;      /* the live match      */
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
    anim: null, raf: 0,
    recorded: false,
    net: null, meta: null,
    netq: [],                  /* wire moves held IN ORDER while an earlier
                                  one still animates (see onlineRemote)      */
    hover: null,               /* the edge {dir,r,c} under the thumb    */
    press: null,               /* the edge being pressed                */
    flash: null,               /* "extra turn!" flash timer             */
    pops: []                   /* live capture pops for the cascade     */
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

/* ownership lives in the UI (the engine only knows seats). meta[i] =
   { own:'me'|'hot'|'ai'|'net', name, lvl } */
function ownerOf(i){
  if (!M || !M.meta || !M.meta[i]) return 'ai';
  return M.meta[i].own || 'ai';
}
const isLocal = i => { const o = ownerOf(i); return o === 'me' || o === 'hot'; };
function seatLvl(i){ return (M && M.meta && M.meta[i] && M.meta[i].lvl) || 2; }
function seatCount(){ return (M && M.st) ? M.st.seats : 2; }
function seatName(i){
  if (!M || !M.meta || !M.meta[i]) return seatColName(i);
  const m = M.meta[i];
  if (m.own === 'me' || m.own === 'hot') return m.name || T('You', 'Int');
  if (m.own === 'ai') return levelName(m.lvl);
  return m.name || seatColName(i);
}

/* THE gate. Every move — thumb, machine, wire, replay — is measured by
   the engine here and nowhere else. */
function doMove(seat, move, src){
  if (!M || M.dead) return { ok:false, err:'no game' };
  if (E.over(M.st)) return { ok:false, err:'game over' };
  const t = E.turn(M.st);
  if (t !== seat) return { ok:false, err:'not your turn' };
  if (!E.check(M.st, move, seat)) return { ok:false, err:'illegal move' };
  const rec = clone(move);
  const idx = M.log.length;
  M.log.push(rec);
  E.apply(M.st, rec);
  autosave();
  fireList(moveSubs,  { seat, move:clone(move), index:idx, src:src || 'local', last:M.st.last });
  fireList(stateSubs, { reason:'move', index:idx });
  return { ok:true, index:idx, last:M.st.last };
}

function snapshot(){
  if (!M) return null;
  return { v:SAVE_V, gid:'kaxxi', opts:clone(M.opts), seed:M.seed, log:clone(M.log), meta:clone(M.meta || null) };
}
function autosave(){
  if (!M || M.net) return;
  if (E.over(M.st)){ saveSlot(null); return; }
  saveSlot(snapshot());
}

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party. A deep indigo
   cabinet with a bright dot lattice; captured boxes glow in seat colours.
   ═══════════════════════════════════════════════════════════════════ */
let cssDone = false;
function injectCSS(){
  if (cssDone || document.getElementById('kx-runtime-css')){ cssDone = true; return; }
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'kx-runtime-css';
  st.textContent =
    '#scr-party{--kx-board:#241A3E;--kx-board2:#150F28;--kx-gold:var(--gold,#FFC542)}' +

    '#scr-party .pt-host.kx-host{align-items:stretch;justify-content:stretch;overflow:visible}' +
    '#scr-party .kx-wrap{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;' +
      'gap:6px;padding:6px 6px 7px;position:relative}' +

    /* ── the seat chips across the top ── */
    '#scr-party .kx-seats{flex:0 0 auto;display:flex;gap:6px;justify-content:center;flex-wrap:wrap;' +
      'padding:2px 2px 1px}' +
    '#scr-party .kx-seat{flex:0 1 auto;position:relative;display:flex;align-items:center;gap:7px;' +
      'min-width:0;padding:4px 11px 4px 5px;border-radius:11px;' +
      'background:rgba(0,0,0,.30);border:1px solid rgba(255,255,255,.09);transition:border-color .2s,background .2s}' +
    '#scr-party .kx-seat.on{background:rgba(255,197,66,.14);border-color:rgba(255,197,66,.6)}' +
    '#scr-party .kx-seat .sw{width:18px;height:18px;flex:0 0 auto;border-radius:5px;position:relative;' +
      'display:grid;place-items:center;font:900 10px/1 var(--disp);color:rgba(0,0,0,.55);' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 1px 2px rgba(0,0,0,.5)}' +
    '#scr-party .kx-seat .col{display:flex;flex-direction:column;gap:1px;min-width:0}' +
    '#scr-party .kx-seat .n{font:900 10px/1.1 var(--disp);letter-spacing:.04em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.74);max-width:96px;white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .kx-seat.on .n{color:var(--kx-gold)}' +
    '#scr-party .kx-seat .h{font:900 11px/1 var(--disp);letter-spacing:.02em;color:#fff}' +

    /* ── the board box holds the canvas ── */
    '#scr-party .kx-boardbox{flex:1 1 auto;min-height:0;position:relative;display:flex;' +
      'align-items:center;justify-content:center}' +
    '#scr-party .kx-canv{display:block;touch-action:manipulation;-webkit-tap-highlight-color:transparent;' +
      'border-radius:16px;filter:drop-shadow(0 10px 26px rgba(0,0,0,.5));cursor:pointer}' +

    /* ── the status line under the board ── */
    '#scr-party .kx-say{flex:0 0 auto;font:700 12px/1.4 var(--body);text-align:center;' +
      'color:rgba(255,255,255,.85);min-height:17px;padding:0 8px;position:relative}' +
    '#scr-party .kx-say b{color:var(--kx-gold);font-weight:900}' +
    '#scr-party .kx-say .dot{display:inline-block;width:11px;height:11px;border-radius:3px;' +
      'vertical-align:-1px;margin-right:5px;box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}' +

    /* ── the "extra turn!" flash ── */
    '#scr-party .kx-flash{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);z-index:24;' +
      'font:900 15px/1 var(--disp);letter-spacing:.08em;text-transform:uppercase;padding:8px 16px;' +
      'border-radius:12px;color:#241800;background:linear-gradient(180deg,#FFE08A,var(--kx-gold));' +
      'box-shadow:0 8px 22px rgba(0,0,0,.5);pointer-events:none;opacity:0;' +
      'animation:kx-flash 1s var(--ease) forwards}' +
    '@keyframes kx-flash{0%{opacity:0;transform:translate(-50%,-50%) scale(.7)}' +
      '18%{opacity:1;transform:translate(-50%,-70%) scale(1.06)}' +
      '70%{opacity:1;transform:translate(-50%,-78%) scale(1)}' +
      '100%{opacity:0;transform:translate(-50%,-96%) scale(1)}}' +
    'body.reduced #scr-party .kx-flash{animation:none;opacity:1}' +

    /* ── the rules panel: slide from the top ── */
    '#scr-party .kx-rules{position:absolute;top:0;left:0;right:0;z-index:30;max-height:66%;' +
      'display:flex;flex-direction:column;border-radius:14px;overflow:hidden;' +
      'background:linear-gradient(180deg,#2A1F49,#140E26);border:1px solid rgba(255,255,255,.16);' +
      'box-shadow:0 14px 30px rgba(0,0,0,.55);' +
      'transform:translateY(-108%);opacity:0;visibility:hidden;pointer-events:none;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease),visibility 0s .26s}' +
    '#scr-party .kx-rules.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease)}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .kx-rules{transition:none}}' +
    'body.reduced #scr-party .kx-rules{transition:none}' +
    '#scr-party .kx-rules-h{flex:0 0 auto;display:flex;align-items:center;' +
      'justify-content:space-between;padding:9px 4px 2px 14px}' +
    '#scr-party .kx-rules-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--kx-gold)}' +
    '#scr-party .kx-rules-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;' +
      'color:var(--txt);cursor:pointer;display:grid;place-items:center;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .kx-rules-x svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round}' +
    '#scr-party .kx-rules-b{min-height:0;overflow-y:auto;padding:2px 14px 12px;-webkit-overflow-scrolling:touch}' +
    '#scr-party .kx-rules-b li{font-size:12px;line-height:1.6;color:var(--dim);margin:0 0 6px 14px}' +

    /* ── landscape: seats down the side ── */
    '@media (max-height:520px){' +
      '#scr-party .kx-wrap{flex-direction:row;align-items:stretch;gap:8px}' +
      '#scr-party .kx-seats{flex-direction:column;flex:0 0 auto;justify-content:flex-start;max-width:140px}' +
      '#scr-party .kx-mid{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:5px}' +
      '#scr-party .kx-say{order:-1}' +
      '#scr-party .kx-rules{max-height:90%}' +
    '}' +
    '@media (min-height:521px){#scr-party .kx-mid{display:contents}}' +

    /* ── THE MENU'S OWN FACE ── */
    '#scr-party .kx-menu .pt-lbl{color:#C4AEFF}' +
    '#scr-party .kx-menu .kx-hero{position:relative;display:flex;align-items:center;justify-content:center;' +
      'margin:2px 0 12px;padding:16px 8px;border-radius:16px;overflow:hidden;' +
      'background:radial-gradient(120% 130% at 50% 20%,#2E2153 0%,var(--kx-board) 52%,var(--kx-board2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.06),inset 0 -14px 26px rgba(0,0,0,.4)}' +
    '#scr-party .kx-menu .kx-hero svg{width:180px;height:150px;display:block}' +
    '#scr-party .kx-menu .kx-hero-cap{position:absolute;right:11px;bottom:8px;' +
      'font:900 9.5px/1 var(--disp);letter-spacing:.18em;color:rgba(255,255,255,.32)}' +
    '#scr-party .kx-note{font-size:11.5px;line-height:1.6;margin:8px 2px 0;padding:9px 11px;' +
      'border-radius:12px;text-transform:none;letter-spacing:0;color:#CFC2F0;' +
      'background:rgba(138,92,255,.10);border:1px solid rgba(138,92,255,.3)}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   THE FRAME + THE BOARD DOM
   ═══════════════════════════════════════════════════════════════════ */
function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: T('Dots & Boxes', 'Puntini u Kaxxi'),
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'kx-rules', label:T('Rules', 'Regoli'), icon:'book',    cls:'ghost' },
      { id:'kx-new',   label:T('New', 'Ġdida'),    icon:'refresh', cls:'ghost' }
    ]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();
  M.ctx.badge.textContent = M.net ? T('Online', 'Onlajn')
    : anyAI() ? levelName(firstAILvl())
    : T('Pass & play', 'Għaddi u lgħab');
  buildBoard();
  M.ctx.btn('kx-rules').onclick = () => setRules(!rulesOpen);
  const nb = M.ctx.btn('kx-new');
  if (nb) nb.onclick = () => {
    if (M.net) return;
    P.ui.confirm(M.ctx, {
      head: T('Start a fresh game?', 'Tibda logħba ġdida?'),
      why:  T('This board goes back in the box and you set up a new one.',
              'Dan it-tabellun jerġa’ lura fil-kaxxa u tibda oħra.'),
      yes:  T('New game', 'Logħba ġdida'),
      no:   T('No, carry on', 'Le, kompli'),
      go: () => setupSheet()
    });
  };
  paintRules();
}
function anyAI(){ for (let i = 0; i < seatCount(); i++) if (ownerOf(i) === 'ai') return true; return false; }
function firstAILvl(){ for (let i = 0; i < seatCount(); i++) if (ownerOf(i) === 'ai') return seatLvl(i); return 2; }

function buildBoard(){
  const ctx = M.ctx;
  ctx.host.classList.add('kx-host');
  ctx.host.innerHTML =
    '<div class="kx-wrap" id="kx-wrap">' +
      '<div class="kx-seats" id="kx-seats"></div>' +
      '<div class="kx-mid">' +
        '<div class="kx-boardbox" id="kx-boardbox">' +
          '<canvas class="kx-canv" id="kx-canv" role="img" aria-label="' +
            esc(T('The dots and boxes grid', 'It-tabellun tal-puntini u l-kaxxi')) + '"></canvas>' +
        '</div>' +
        '<div class="kx-say" id="kx-say"></div>' +
      '</div>' +
      '<div class="kx-rules" id="kx-rulespanel" aria-hidden="true">' +
        '<div class="kx-rules-h"><h4 id="kx-rules-t"></h4>' +
          '<button class="kx-rules-x" id="kx-rules-x" aria-label="' +
            esc(T('Put the rules away', 'Warrab ir-regoli')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button></div>' +
        '<div class="kx-rules-b" id="kx-rules-b"></div>' +
      '</div>' +
    '</div>';
  const root = ctx.host.querySelector('#kx-wrap');
  UI = {
    ctx, root,
    seats:    root.querySelector('#kx-seats'),
    boardbox: root.querySelector('#kx-boardbox'),
    canv:     root.querySelector('#kx-canv'),
    say:      root.querySelector('#kx-say'),
    rules:    root.querySelector('#kx-rulespanel'),
    cx: null, geom: null, dpr: 1
  };
  UI.cx = UI.canv.getContext('2d');
  root.querySelector('#kx-rules-x').addEventListener('click', () => setRules(false));
  ctx.root.addEventListener('pointerdown', e => {
    if (!rulesOpen || !UI || !UI.rules) return;
    const rb = ctx.btn && ctx.btn('kx-rules');
    if (!UI.rules.contains(e.target) && !(rb && rb.contains(e.target))) setRules(false);
  }, true);

  UI.canv.addEventListener('pointermove', onPointerMove);
  UI.canv.addEventListener('pointerleave', () => { if (M){ M.hover = null; drawStatic(); } });
  UI.canv.addEventListener('pointerdown', onPointerDown);
  UI.canv.addEventListener('keydown', onKeyDown);
  UI.canv.tabIndex = 0;

  sizeBoard();
  if (typeof ResizeObserver === 'function'){
    UI._ro = new ResizeObserver(() => sizeBoard());
    UI._ro.observe(UI.boardbox);
  } else {
    UI._onResize = () => sizeBoard();
    window.addEventListener('resize', UI._onResize);
  }
  paintSeats();
  drawStatic();
}

/* the board fills the box, keeping the boxRows:boxCols aspect */
function sizeBoard(){
  if (!UI || !UI.boardbox || !UI.boardbox.isConnected || !M) return;
  const bw = UI.boardbox.clientWidth, bh = UI.boardbox.clientHeight;
  if (!bw || !bh) return;
  const st = M.st, cols = st.boxCols, rows = st.boxRows;
  const aspect = cols / rows;
  let w = bw, h = w / aspect;
  if (h > bh){ h = bh; w = h * aspect; }
  w = Math.max(200, Math.floor(w));
  h = Math.floor(w / aspect);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  UI.dpr = dpr;
  UI.canv.style.width = w + 'px';
  UI.canv.style.height = h + 'px';
  UI.canv.width = Math.floor(w * dpr);
  UI.canv.height = Math.floor(h * dpr);
  /* geometry: an inner margin, then a cell grid of (cols)×(rows) */
  const pad = Math.max(14, w * 0.05);
  const cellW = (w - pad * 2) / cols;
  const cellH = (h - pad * 2) / rows;
  const cell = Math.min(cellW, cellH);
  const gridW = cell * cols, gridH = cell * rows;
  UI.geom = {
    w, h, cell,
    ox: (w - gridW) / 2,
    oy: (h - gridH) / 2,
    dot: Math.max(2.5, cell * 0.09),
    hit: Math.max(16, cell * 0.42)      /* edge hit radius */
  };
  drawStatic();
}

/* pixel of dot (dr,dc): dr in 0..boxRows, dc in 0..boxCols */
function dotXY(g, dr, dc){ return { x: g.ox + dc * g.cell, y: g.oy + dr * g.cell }; }
/* midpoint pixel of edge {dir,r,c} */
function edgeMid(g, dir, r, c){
  if (dir === 0){ /* horizontal: dot-row r, cols c..c+1 */
    const a = dotXY(g, r, c), b = dotXY(g, r, c + 1);
    return { x:(a.x + b.x)/2, y:(a.y + b.y)/2, ax:a.x, ay:a.y, bx:b.x, by:b.y };
  } else { /* vertical: dot-col c, rows r..r+1 */
    const a = dotXY(g, r, c), b = dotXY(g, r + 1, c);
    return { x:(a.x + b.x)/2, y:(a.y + b.y)/2, ax:a.x, ay:a.y, bx:b.x, by:b.y };
  }
}

/* find the nearest UNDRAWN edge to a client point, within the hit radius */
function edgeAt(clientX, clientY){
  if (!UI || !UI.geom || !M) return null;
  const rect = UI.canv.getBoundingClientRect();
  const g = UI.geom, st = M.st;
  const x = clientX - rect.left, y = clientY - rect.top;
  let best = null, bestD = g.hit * g.hit;
  const consider = (dir, r, c) => {
    if (!E.edgeValid(st, dir, r, c)) return;
    const m = edgeMid(g, dir, r, c);
    const dx = x - m.x, dy = y - m.y, d = dx*dx + dy*dy;
    if (d < bestD){ bestD = d; best = { dir, r, c }; }
  };
  for (let r = 0; r <= st.boxRows; r++) for (let c = 0; c < st.boxCols; c++) consider(0, r, c);
  for (let r = 0; r < st.boxRows; r++) for (let c = 0; c <= st.boxCols; c++) consider(1, r, c);
  return best;
}
function sameEdge(a, b){ return a && b && a.dir === b.dir && a.r === b.r && a.c === b.c; }

function onPointerMove(e){
  if (!M || M.dead || E.over(M.st) || M.anim) return;
  const seat = E.turn(M.st);
  if (!isLocal(seat)) return;
  const ed = edgeAt(e.clientX, e.clientY);
  if (!sameEdge(ed, M.hover)){ M.hover = ed; drawStatic(); }
}
function onPointerDown(e){
  if (!M || M.dead) return;
  const ed = edgeAt(e.clientX, e.clientY);
  if (!ed) return;
  tryDraw(ed);
}
function onKeyDown(e){
  if (!M || M.dead || E.over(M.st) || M.anim) return;
  const seat = E.turn(M.st);
  if (!isLocal(seat)) return;
  const st = M.st;
  const all = E.legal(st, seat);
  if (!all.length) return;
  /* arrow keys cycle the hovered edge through the legal list; Enter draws it */
  let idx = M.hover ? all.findIndex(m => sameEdge(m, M.hover)) : -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown'){ idx = (idx + 1) % all.length; M.hover = all[idx]; drawStatic(); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp'){ idx = (idx <= 0 ? all.length : idx) - 1; M.hover = all[idx]; drawStatic(); e.preventDefault(); }
  else if (e.key === 'Enter' || e.key === ' '){ if (M.hover){ tryDraw(M.hover); e.preventDefault(); } }
}

/* the one place a local edge is issued */
function tryDraw(ed){
  if (!M || M.dead || E.over(M.st) || M.anim) return;
  const seat = E.turn(M.st);
  if (!isLocal(seat)) return;
  if (!E.edgeValid(M.st, ed.dir, ed.r, ed.c)){ cue('move.illegal', { gain:0.6 }); return; }
  commitEdge(seat, ed, 'local');
}

/* commit an edge for any owner (thumb, AI, wire). Runs the stroke +
   capture animation, then applies through the gate. The engine result is
   identical whether or not the animation ran. */
function commitEdge(seat, ed, src){
  const st = M.st;
  if (!E.edgeValid(st, ed.dir, ed.r, ed.c)) return;
  M.hover = null; M.press = null;

  /* peek at what this edge will capture, for the animation, WITHOUT
     mutating engine state (we recompute after the real apply too) */
  const willCap = E.captureCount(st, ed.dir, ed.r, ed.c);

  if (reduced() || !UI || !UI.geom){
    const res = doMove(seat, { t:'edge', dir:ed.dir, r:ed.r, c:ed.c }, src);
    if (res.ok){
      cue('move.select', { gain:0.7 }, true);
      if (res.last && res.last.captured && res.last.captured.length){
        cue('piece.capture', { gain:0.85 }, true);
      }
    }
    drawStatic();
    afterMove();
    return;
  }
  animateEdge(seat, ed, () => {
    const res = doMove(seat, { t:'edge', dir:ed.dir, r:ed.r, c:ed.c }, src);
    if (res.ok && res.last && res.last.captured && res.last.captured.length){
      cascadeCaptures(seat, res.last.captured, () => { drawStatic(); afterMove(); });
    } else {
      drawStatic();
      afterMove();
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
   THE HERO ANIMATIONS — an edge strokes in; captured boxes POP; a chain
   of captures CASCADES box by box. Pure canvas on requestAnimationFrame.
   ═══════════════════════════════════════════════════════════════════ */
function animateEdge(seat, ed, done){
  const g = UI.geom;
  const m = edgeMid(g, ed.dir, ed.r, ed.c);
  const dur = reduced() ? 0 : 150;
  let t0 = performance.now();
  M.anim = { kind:'edge', seat, ed, m, prog:0 };
  cancelRaf();
  cue('move.select', { gain:0.7 }, true);
  if (dur === 0){ M.anim = null; if (done) done(); return; }
  function frame(now){
    if (!M || M.dead){ M.anim = null; return; }
    const p = Math.min(1, (now - t0) / dur);
    M.anim.prog = p;
    drawStatic();
    drawStrokingEdge(seat, m, p);
    if (p >= 1){ M.anim = null; M.raf = 0; if (done) done(); return; }
    M.raf = requestAnimationFrame(frame);
  }
  M.raf = requestAnimationFrame(frame);
}
function drawStrokingEdge(seat, m, p){
  const cx = UI.cx, g = UI.geom, dpr = UI.dpr;
  cx.save(); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const col = seatColour(seat);
  cx.lineCap = 'round';
  cx.lineWidth = Math.max(3, g.cell * 0.12);
  cx.strokeStyle = col.hex;
  cx.shadowColor = col.hi; cx.shadowBlur = 8;
  cx.beginPath();
  cx.moveTo(m.ax, m.ay);
  cx.lineTo(m.ax + (m.bx - m.ax) * p, m.ay + (m.by - m.ay) * p);
  cx.stroke();
  cx.restore();
}

/* the captured boxes pop in sequence — a satisfying cascade for chains */
function cascadeCaptures(seat, boxes, done){
  if (reduced() || !boxes.length){
    if (boxes.length > 1) cue('chain.eat', { gain:0.8 }, true);
    else if (boxes.length) cue('piece.capture', { gain:0.85 }, true);
    if (done) done();
    return;
  }
  const g = UI.geom;
  const step = boxes.length > 1 ? 90 : 0;
  M.pops = [];
  let i = 0;
  const startOne = () => {
    if (!M || M.dead){ if (done) done(); return; }
    if (i >= boxes.length){
      /* let the last pop finish */
      setTimeout(() => { M.pops = []; if (done) done(); }, 220);
      return;
    }
    const b = boxes[i];
    M.pops.push({ br:b.br, bc:b.bc, seat, t0: performance.now() });
    cue(i === 0 ? 'piece.capture' : 'chain.eat', { gain: 0.8 }, true);
    if (!M.raf) runPops();
    i++;
    setTimeout(startOne, step || 200);
  };
  startOne();
}
function runPops(){
  cancelRaf();
  function frame(now){
    if (!M || M.dead){ M.raf = 0; return; }
    let live = false;
    drawStatic();
    for (const p of M.pops){
      const dt = now - p.t0;
      const dur = 340;
      if (dt < dur){ live = true; drawPop(p, dt / dur); }
    }
    if (live){ M.raf = requestAnimationFrame(frame); }
    else { M.raf = 0; drawStatic(); }
  }
  M.raf = requestAnimationFrame(frame);
}
function drawPop(p, t){
  const cx = UI.cx, g = UI.geom, dpr = UI.dpr, st = M.st;
  const x = g.ox + p.bc * g.cell, y = g.oy + p.br * g.cell;
  const col = seatColour(p.seat);
  const ease = 1 - Math.pow(1 - t, 3);
  const scale = 0.4 + 0.6 * ease;
  const glow = (1 - t);
  cx.save(); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx.translate(x + g.cell/2, y + g.cell/2);
  cx.scale(scale, scale);
  cx.translate(-(x + g.cell/2), -(y + g.cell/2));
  paintBoxFill(cx, g, p.br, p.bc, p.seat, 0.55 + 0.45 * ease);
  cx.globalAlpha = glow * 0.7;
  cx.strokeStyle = col.hi; cx.lineWidth = 3;
  roundRect(cx, x + 3, y + 3, g.cell - 6, g.cell - 6, 6); cx.stroke();
  cx.restore();
}
function cancelRaf(){ if (M && M.raf){ cancelAnimationFrame(M.raf); M.raf = 0; } }

/* ═══════════════════════════════════════════════════════════════════
   DRAWING — the static board: cabinet, captured fills, drawn edges, the
   dot lattice, the hover/press ghost, the last-edge marker.
   ═══════════════════════════════════════════════════════════════════ */
function boardBg(cx, g){
  const grad = cx.createLinearGradient(0, 0, 0, g.h);
  grad.addColorStop(0, '#2E2153');
  grad.addColorStop(0.55, '#241A3E');
  grad.addColorStop(1, '#150F28');
  return grad;
}
function paintBoxFill(cx, g, br, bc, seat, alpha){
  const x = g.ox + bc * g.cell, y = g.oy + br * g.cell;
  const col = seatColour(seat);
  cx.save();
  cx.globalAlpha = (alpha == null ? 1 : alpha);
  const grad = cx.createLinearGradient(x, y, x, y + g.cell);
  grad.addColorStop(0, col.hi);
  grad.addColorStop(0.5, col.hex);
  grad.addColorStop(1, col.lo);
  cx.fillStyle = grad;
  roundRect(cx, x + 2.5, y + 2.5, g.cell - 5, g.cell - 5, 5); cx.fill();
  /* the capturer's mark */
  cx.globalAlpha = (alpha == null ? 1 : alpha) * 0.9;
  cx.fillStyle = 'rgba(0,0,0,.42)';
  cx.font = '900 ' + Math.floor(g.cell * 0.42) + 'px var(--disp), sans-serif';
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText(col.mark, x + g.cell/2, y + g.cell/2 + g.cell*0.02);
  cx.restore();
}
function drawStatic(){
  if (!UI || !UI.cx || !UI.geom || !M) return;
  const cx = UI.cx, g = UI.geom, st = M.st, dpr = UI.dpr;
  cx.save();
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx.clearRect(0, 0, g.w, g.h);

  /* the cabinet */
  cx.fillStyle = boardBg(cx, g);
  roundRect(cx, 0, 0, g.w, g.h, 16); cx.fill();

  const over = E.over(st);
  const myTurn = !over && isLocal(E.turn(st)) && !M.anim;

  /* captured box fills — skip any box currently mid-pop (drawn on top) */
  const popping = {};
  if (M.pops) for (const p of M.pops) popping[p.br + ',' + p.bc] = 1;
  for (let br = 0; br < st.boxRows; br++){
    for (let bc = 0; bc < st.boxCols; bc++){
      const o = st.owner[E.bIdx(st, br, bc)];
      if (o >= 0 && !popping[br + ',' + bc]) paintBoxFill(cx, g, br, bc, o, 1);
    }
  }

  /* the ghost of the hovered/pressed edge */
  const ghost = (myTurn && M.hover && E.edgeValid(st, M.hover.dir, M.hover.r, M.hover.c)) ? M.hover : null;
  if (ghost){
    const m = edgeMid(g, ghost.dir, ghost.r, ghost.c);
    cx.save();
    cx.lineCap = 'round';
    cx.lineWidth = Math.max(3, g.cell * 0.12);
    cx.strokeStyle = seatColour(E.turn(st)).hex;
    cx.globalAlpha = 0.42;
    cx.beginPath(); cx.moveTo(m.ax, m.ay); cx.lineTo(m.bx, m.by); cx.stroke();
    cx.restore();
  }

  /* drawn edges */
  cx.lineCap = 'round';
  cx.lineWidth = Math.max(2.5, g.cell * 0.10);
  const last = st.last;
  for (let r = 0; r <= st.boxRows; r++) for (let c = 0; c < st.boxCols; c++)
    if (st.H[E.hIdx(st, r, c)] === 1) drawEdge(cx, g, 0, r, c, last);
  for (let r = 0; r < st.boxRows; r++) for (let c = 0; c <= st.boxCols; c++)
    if (st.V[E.vIdx(st, r, c)] === 1) drawEdge(cx, g, 1, r, c, last);

  /* the dot lattice, on top */
  for (let dr = 0; dr <= st.boxRows; dr++){
    for (let dc = 0; dc <= st.boxCols; dc++){
      const d = dotXY(g, dr, dc);
      cx.fillStyle = 'rgba(255,255,255,.85)';
      cx.beginPath(); cx.arc(d.x, d.y, g.dot, 0, Math.PI * 2); cx.fill();
      cx.fillStyle = 'rgba(0,0,0,.25)';
      cx.beginPath(); cx.arc(d.x, d.y + g.dot * 0.35, g.dot * 0.5, 0, Math.PI * 2); cx.fill();
    }
  }
  cx.restore();

  /* the winning glow keeps pulsing without a move */
  if (over && !reduced()){
    if (!M._pulse) M._pulse = requestAnimationFrame(function loop(){
      if (!M || M.dead){ return; }
      drawStatic();
      if (E.over(M.st)) M._pulse = requestAnimationFrame(loop);
      else M._pulse = 0;
    });
  }
  paintSay();
}
function drawEdge(cx, g, dir, r, c, last){
  const m = edgeMid(g, dir, r, c);
  /* colour a drawn edge by whichever seat's move most recently touched it?
     We do not track per-edge owner (the engine does not need it); paint all
     drawn edges a warm bone colour, and highlight the LAST edge in gold. */
  const isLast = last && last.dir === dir && last.r === r && last.c === c;
  cx.save();
  cx.lineCap = 'round';
  if (isLast){
    cx.strokeStyle = '#FFE08A';
    cx.shadowColor = '#FFC542'; cx.shadowBlur = 8;
    cx.lineWidth = Math.max(3, g.cell * 0.13);
  } else {
    cx.strokeStyle = 'rgba(233,217,174,.92)';
    cx.lineWidth = Math.max(2.5, g.cell * 0.10);
  }
  cx.beginPath(); cx.moveTo(m.ax, m.ay); cx.lineTo(m.bx, m.by); cx.stroke();
  cx.restore();
}
function roundRect(cx, x, y, w, h, r){
  r = Math.min(r, w / 2, h / 2);
  cx.beginPath();
  cx.moveTo(x + r, y);
  cx.arcTo(x + w, y, x + w, y + h, r);
  cx.arcTo(x + w, y + h, x, y + h, r);
  cx.arcTo(x, y + h, x, y, r);
  cx.arcTo(x, y, x + w, y, r);
  cx.closePath();
}

function paintSeats(){
  if (!UI || !UI.seats || !M) return;
  const st = M.st, turn = E.turn(st), over = E.over(st);
  let html = '';
  for (let i = 0; i < st.seats; i++){
    const on = (i === turn && !over) ? ' on' : '';
    const col = seatColour(i);
    const nm = seatName(i);
    const cnt = st.scores[i] || 0;
    html += '<div class="kx-seat' + on + '">' +
      '<span class="sw" style="background:linear-gradient(180deg,' + col.hi + ',' + col.hex + ' 60%,' + col.lo + ')">' +
        esc(col.mark) + '</span>' +
      '<span class="col">' +
        '<span class="n">' + esc(nm) + '</span>' +
        '<span class="h">' + cnt + '</span>' +
      '</span>' +
    '</div>';
  }
  UI.seats.innerHTML = html;
}

function paintSay(){
  if (!UI || !UI.say || !M) return;
  const st = M.st, over = E.over(st);
  let html;
  if (over){
    const ov = E.over(st);
    if (ov.draw){
      html = esc(T('A tie — the boxes split.', 'Ndaqs — il-kaxxi nqasmu.'));
    } else {
      const w = ov.winner;
      const dot = '<span class="dot" style="background:' + seatColour(w).hex + '"></span>';
      const who = isLocal(w) ? T('You win!', 'Rbaħt int!') : esc(seatName(w)) + ' ' + T('wins', 'jirbaħ');
      html = dot + '<b>' + who + '</b> — ' + esc(ov.scores[w] + ' ' + T('boxes', 'kaxxi'));
    }
  } else {
    const turn = E.turn(st);
    const dot = '<span class="dot" style="background:' + seatColour(turn).hex + '"></span>';
    const mine = isLocal(turn);
    const who = mine ? T('Your edge', 'Imissek int')
      : ownerOf(turn) === 'ai' ? levelName(seatLvl(turn)) + ' ' + T('is thinking', 'qed jaħseb')
      : esc(seatName(turn)) + ' ' + T('to draw', 'imiss');
    html = dot + (mine ? '<b>' + who + '</b>' : who);
  }
  UI.say.innerHTML = html + (M._flashEl ? '' : '');
  if (M._flashEl){ UI.say.appendChild(M._flashEl); }
}

/* an "extra turn!" flash when a local seat captures and moves again */
function flashExtra(){
  if (reduced() || !UI || !UI.say) return;
  const el = document.createElement('div');
  el.className = 'kx-flash';
  el.textContent = T('Extra turn!', 'Darba oħra!');
  UI.say.appendChild(el);
  M._flashEl = el;
  setTimeout(() => { if (el && el.parentNode) el.parentNode.removeChild(el); if (M) M._flashEl = null; }, 1050);
}

/* ═══════════════════════════════════════════════════════════════════
   AFTER A MOVE — voice the seats, check the end, else let the machine
   think if it is its turn. When the same local seat keeps the turn after
   a capture, show the "extra turn!" flash.
   ═══════════════════════════════════════════════════════════════════ */
let _lastTurnSeat = -1;
function afterMove(){
  if (!M || M.dead) return;
  paintSeats();
  drawStatic();
  const st = M.st;
  if (E.over(st)){ finish(); return; }
  const cur = E.turn(st);
  const last = st.last;
  if (last && last.captured && last.captured.length && last.seat === cur && isLocal(cur)){
    flashExtra();
  }
  /* a wire move held behind the one that just applied goes next, before the
     machine is allowed to think off a stale turn */
  flushNetQ();
  maybeThink();
}

function maybeThink(){
  if (!M || M.dead || M.timer || M.anim) return;
  const st = M.st;
  if (E.over(st)) return;
  const seat = E.turn(st);
  if (ownerOf(seat) !== 'ai') return;
  if (M.net && !M.net.iAmHost) return;
  const delay = reduced() ? 40 : 380;
  M.timer = setTimeout(() => {
    M.timer = 0;
    if (!M || M.dead || M.anim){ if (M) maybeThink(); return; }
    const st2 = M.st;
    if (E.over(st2) || ownerOf(E.turn(st2)) !== 'ai'){ drawStatic(); return; }
    const s2 = E.turn(st2);
    const mv = E.think(st2, s2, seatLvl(s2));
    if (!mv){ drawStatic(); return; }
    commitEdge(s2, { dir:mv.dir, r:mv.r, c:mv.c }, 'local');
  }, delay);
}

/* ═══════════════════════════════════════════════════════════════════
   THE END — into the shared AAA winner screen (js/rebbieh.js). One row
   per seat ranked by boxes; ties share the place.
   ═══════════════════════════════════════════════════════════════════ */
function finish(){
  if (!M || M.finished) return;
  M.finished = true;
  stopThinking();
  const st = M.st;
  const ov = E.over(st);
  if (!ov) return;
  cue('game.win', { gain: 0.95 }, true);

  const me = firstLocalSeat();
  const iWon = me >= 0 && ov.winners.indexOf(me) >= 0;
  if (!M.net && !M.recorded){
    M.recorded = true;
    if (ov.draw && iWon) ST.rec.d = (ST.rec.d | 0) + 1;
    else if (iWon) ST.rec.w++;
    else ST.rec.l++;
    persist();
  }
  saveSlot(null);

  /* rank the seats by score (desc); ties share a place */
  const order = [];
  for (let i = 0; i < st.seats; i++) order.push(i);
  order.sort((a, b) => (ov.scores[b] - ov.scores[a]) || (a - b));
  let place = 0, lastScore = null;
  const rows = order.map((seat, i) => {
    const sc = ov.scores[seat];
    if (sc !== lastScore){ place = i + 1; lastScore = sc; }
    const isMe = isLocal(seat);
    return {
      name: isMe ? T('You', 'Int')
        : ownerOf(seat) === 'ai' ? levelName(seatLvl(seat))
        : seatName(seat),
      place,
      you: isMe,
      bot: ownerOf(seat) === 'ai',
      score: sc + ' ' + T('boxes', 'kaxxi'),
      border: seatColour(seat).id
    };
  });

  const net = M.net;
  const title = ov.draw
    ? (iWon ? T('Shared victory', 'Rebħa maqsuma') : T('A tie', 'Ndaqs'))
    : iWon ? T('You win!', 'Rbaħt int!')
    : (me >= 0) ? T('Beaten', 'Mirbuħ')
    : seatName(ov.winner) + ' ' + T('wins', 'jirbaħ');

  const show = window.KARTI_REBBIEH && window.KARTI_REBBIEH.show;
  if (!show){
    P.ui.result(M.ctx, {
      tone: ov.draw ? 'draw' : iWon ? 'win' : 'lose',
      head: title,
      why: T('Most boxes wins.', 'L-iktar kaxxi jirbaħ.'),
      buttons: [
        { label:T('Play again', 'Erġa\' lgħab'), icon:'refresh', cls:'primary',
          go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else setupSheet(); } },
        { label:T('Leave', 'Oħroġ'), icon:'back', cls:'ghost',
          go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }
      ]
    });
    return;
  }
  /* ── THE PAYMENT (tombla-ui's funnel) — the podium path bypasses the
     wrapped P.ui.result that progress.js pays through, so pay here:
     awardPlay exactly once under a stable match id (progress.js dedups
     the id across re-renders and reloads), and the pot through mp.js's
     own idempotent stakeSettle door. `ranked` only when a real pot is
     on the table. The card fallback above still pays through the wrap,
     so nothing on that path changes and nothing pays twice. */
  const MPX = window.KARTI_MP;
  const staked = !!(net && MPX && MPX.MP && MPX.MP.stakeLive);
  const tone = ov.draw ? 'draw' : iWon ? 'win' : 'lose';
  let pay = null, potRes = null;
  if (window.KARTI_XP && KARTI_XP.awardPlay){
    try {
      const mid = (net && MPX && MPX.MP && MPX.MP.code != null)
        ? 'kaxxi:' + MPX.MP.code + ':' + ((MPX.MP.seed || 0) >>> 0)
        : (M.payId || (M.payId = 'kaxxi:' + Date.now().toString(36) + '-' +
                                  ((Math.random() * 1e6) | 0).toString(36)));
      const r = KARTI_XP.awardPlay({ game:'kaxxi', won: tone === 'win',
                                     draw: tone === 'draw', id: mid, ranked: staked });
      if (r && r.counted) pay = r;
    } catch(e){}
  }
  if (staked && MPX.stakeSettle){
    try { potRes = MPX.stakeSettle(tone); } catch(e){}
  }
  show({
    title,
    subtitle: T('Most boxes wins', 'L-iktar kaxxi jirbaħ'),
    rows,
    xp: pay ? { level: pay.level, gained: pay.xp, leveledUp: !!pay.levelled,
                before: 0, after: pay.levelled ? 1 : 0.7 } : null,
    reward: (pay || potRes) ? {
      xp: pay ? pay.xp : 0,
      chips: pay ? (pay.chips | 0) + (pay.chipsLevel | 0) : 0,
      wonBonus: pay ? pay.wonBonus : 0,
      staked: potRes ? potRes.ante : 0,
      pot: (potRes && potRes.kind === 'win') ? potRes.pot : 0
    } : undefined,
    reduced: reduced(),
    lang: (window.KARTI_LANG ? KARTI_LANG.lang() : 'en'),
    sound: id => cue(id, {}, true),
    playAgainLabel: net ? T('Back to the rooms', 'Lura fil-kmamar') : T('Play again', 'Erġa\' lgħab'),
    onPlayAgain: () => { leave(); if (net && net.onLeave) net.onLeave(); else setupSheet(); },
    onLeave:     () => { leave(); if (net && net.onLeave) net.onLeave(); else P.hub(); }
  });
}
function firstLocalSeat(){
  for (let i = 0; i < seatCount(); i++) if (isLocal(i)) return i;
  return -1;
}

function leave(){
  stopThinking();
  cancelRaf();
  if (M && M._pulse){ cancelAnimationFrame(M._pulse); M._pulse = 0; }
  if (UI && UI._ro){ try { UI._ro.disconnect(); } catch(e){} }
  if (UI && UI._onResize){ try { window.removeEventListener('resize', UI._onResize); } catch(e){} }
  if (M){ autosave(); persistNow(); M.dead = true; M.anim = null; }
  M = null; UI = null;
}

/* ═══════════════════════════════════════════════════════════════════
   THE RULES CARD — one game, told once, both languages.
   ═══════════════════════════════════════════════════════════════════ */
function rulesFor(){
  return [
    T('On your turn, draw <b>one line</b> between two neighbouring dots — up-and-down or side-to-side.',
      'Meta jmiss lilek, iġbed <b>linja waħda</b> bejn żewġ puntini ġirien — ’il fuq u ’l isfel jew mal-ġenb.'),
    T('Close the <b>fourth side of a box</b> and you <b>win that box</b> — and you <b>go again</b>. ' +
      'One line can close two boxes at once.',
      'Agħlaq ir-<b>raba’ ġenb ta’ kaxxa</b> u <b>tirbaħ dik il-kaxxa</b> — u <b>terġa’ tilgħab</b>. ' +
      'Linja waħda tista’ tagħlaq żewġ kaxxi f’daqqa.'),
    T('If your line closes no box, it becomes the <b>next player’s</b> turn.',
      'Jekk il-linja tiegħek ma tagħlaq l-ebda kaxxa, imiss il-<b>plejer li jmiss</b>.'),
    T('When every line is drawn, whoever holds the <b>most boxes wins</b>. A level split is a tie.',
      'Meta jitgeżbnu l-linji kollha, min għandu <b>l-iktar kaxxi jirbaħ</b>. Qsim indaqs ikun ndaqs.'),
    T('A tip: giving away a <b>short chain</b> costs less than a long one — and the clever move is ' +
      'sometimes to <b>leave two boxes</b> so the other player has to open next.',
      'Parir: li tagħti <b>katina qasira</b> jiswa inqas minn waħda twila — u l-aqwa mossa kultant hi li ' +
      '<b>tħalli żewġ kaxxi</b> biex il-plejer l-ieħor ikollu jiftaħ hu.')
  ];
}
function paintRules(){
  if (!UI || !UI.rules) return;
  UI.rules.querySelector('#kx-rules-t').textContent =
    T('Dots & Boxes', 'Puntini u Kaxxi') + ' — ' + T('the rules', 'ir-regoli');
  UI.rules.querySelector('#kx-rules-b').innerHTML =
    '<ul style="margin:0;padding:0">' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul>';
  UI.rules.classList.toggle('open', rulesOpen);
  UI.rules.setAttribute('aria-hidden', rulesOpen ? 'false' : 'true');
  const rb = M && M.ctx && M.ctx.btn && M.ctx.btn('kx-rules');
  if (rb) rb.setAttribute('aria-expanded', rulesOpen ? 'true' : 'false');
}
function setRules(open){
  rulesOpen = !!open;
  try { localStorage.setItem(UIKEY + '.rules', rulesOpen ? '1' : '0'); } catch(e){}
  cue(rulesOpen ? 'ui.sheet' : 'ui.back', { gain:0.8 });
  paintRules();
}

/* ═══════════════════════════════════════════════════════════════════
   THE ENTRY SCREEN — MINIMAL. PLAY ONLINE (top), PLAY WITH AI, PASS THE
   PHONE, and "How to play". Settings (players, board, difficulty) are a
   tiny second step. Back goes to the hub with no confirm popup.
   ═══════════════════════════════════════════════════════════════════ */
function heroSVG(){
  /* a small 4×4 dot lattice with a couple of captured boxes and a line
     mid-draw — the game worn as a badge */
  const rows = 4, cols = 4, cell = 34, pad = 16;
  const w = cols * cell + pad * 2, h = rows * cell + pad * 2;
  const dot = (r, c) => (pad + c * cell) + ',' + (pad + r * cell);
  let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<defs>' +
      '<linearGradient id="kxh-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF6D7C"/>' +
        '<stop offset="1" stop-color="#B01625"/></linearGradient>' +
      '<linearGradient id="kxh-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#78B4FF"/>' +
        '<stop offset="1" stop-color="#1D5DB0"/></linearGradient>' +
    '</defs>' +
    '<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="16" fill="#241A3E" stroke="rgba(0,0,0,.5)"/>';
  /* two captured boxes */
  const box = (r, c, fill, mark) => {
    const x = pad + c * cell, y = pad + r * cell;
    return '<rect x="' + (x+3) + '" y="' + (y+3) + '" width="' + (cell-6) + '" height="' + (cell-6) +
      '" rx="5" fill="' + fill + '"/>' +
      '<text x="' + (x + cell/2) + '" y="' + (y + cell/2 + 6) + '" text-anchor="middle" ' +
      'font-family="sans-serif" font-weight="900" font-size="' + (cell*0.42) + '" fill="rgba(0,0,0,.42)">' + mark + '</text>';
  };
  s += box(0, 0, 'url(#kxh-r)', 'A');
  s += box(1, 2, 'url(#kxh-b)', 'B');
  /* a few drawn edges */
  const line = (r1,c1,r2,c2,col,wd) => {
    const [x1,y1]=dot(r1,c1).split(','), [x2,y2]=dot(r2,c2).split(',');
    return '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+col+'" stroke-width="'+(wd||3)+'" stroke-linecap="round"/>';
  };
  s += line(0,0,0,1,'rgba(233,217,174,.9)');
  s += line(0,1,0,2,'rgba(233,217,174,.9)');
  s += line(2,1,2,2,'rgba(233,217,174,.9)');
  s += line(1,3,2,3,'rgba(233,217,174,.9)');
  /* the hero line mid-draw, in gold */
  s += line(2,0,3,0,'#FFC542',4);
  /* the dots on top */
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++){
    const [x,y] = dot(r,c).split(',');
    s += '<circle cx="'+x+'" cy="'+y+'" r="4" fill="#fff"/>';
  }
  return s + '</svg>';
}

function setupSheet(){
  injectCSS();
  P.show();
  stopThinking(); M = null; UI = null;
  const el = P.ui.screenEl();
  const online = canGoOnline();

  el.innerHTML =
    '<div class="pt-wrap kx-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="kx-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + esc(T('Dots & Boxes', 'Puntini u Kaxxi')) + '</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="kx-hero" aria-hidden="true">' + heroSVG() +
        '<span class="kx-hero-cap">' + esc(T('2–4 players', '2–4 plejers')) + '</span></div>' +
      '<p class="blurb">' +
        T('Draw the lines, close the boxes. Every box you shut is yours — and you get another go. ' +
          'The one with the most boxes wins.',
          'Iġbed il-linji, agħlaq il-kaxxi. Kull kaxxa li tagħlaq hi tiegħek — u terġa’ tilgħab. ' +
          'Min jiġbor l-iktar kaxxi jirbaħ.') +
      '</p>' +

      (ST.save
        ? '<button class="btn primary" id="kx-res" style="margin:2px 0 12px">' +
          esc(T('Carry on the saved game', 'Kompli l-logħba mħażna')) + '</button>'
        : '') +

      '<div class="kx-modes" style="display:grid;gap:9px;margin-top:4px">' +
        (online
          ? '<button class="btn primary" id="kx-online">' + ico('users') + ' ' +
            esc(T('Play online', 'Ilgħab onlajn')) + '</button>'
          : '') +
        '<button class="btn' + (online ? ' ghost' : ' primary') + '" id="kx-ai">' +
          ico('coach') + ' ' + esc(T('Play with the machine', 'Ilgħab mal-magna')) + '</button>' +
        '<button class="btn ghost" id="kx-pnp">' + ico('users') + ' ' +
          esc(T('Pass the phone', 'Għaddi t-telefon')) + '</button>' +
        '<button class="btn ghost" id="kx-rulesbtn">' + ico('book') + ' ' +
          esc(T('How to play', 'Kif tilgħab')) + '</button>' +
      '</div>' +

      (ST.rec.w + ST.rec.l + (ST.rec.d | 0)
        ? '<p class="pt-ledger" style="margin-top:14px">' +
          T('So far: <b>' + ST.rec.w + '</b> won, <b>' + ST.rec.l + '</b> lost' +
            ((ST.rec.d | 0) ? ', <b>' + (ST.rec.d | 0) + '</b> drawn' : '') + '.',
            'S’issa: <b>' + ST.rec.w + '</b> rebħin, <b>' + ST.rec.l + '</b> mitlufin' +
            ((ST.rec.d | 0) ? ', <b>' + (ST.rec.d | 0) + '</b> ndaqs' : '') + '.') +
          '</p>'
        : '') +
    '</div>' +

    '<div class="kx-rules" id="kx-menurules" aria-hidden="true">' +
      '<div class="kx-rules-h"><h4>' + esc(T('Dots & Boxes', 'Puntini u Kaxxi')) + ' — ' +
        esc(T('the rules', 'ir-regoli')) + '</h4>' +
        '<button class="kx-rules-x" id="kx-menurules-x" aria-label="' + esc(T('Close', 'Agħlaq')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button></div>' +
      '<div class="kx-rules-b"><ul style="margin:0;padding:0">' +
        rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul></div>' +
    '</div>' +
    '</div>';

  el.querySelector('#kx-back').onclick = () => { cue('ui.back'); P.hub(); };
  const on = el.querySelector('#kx-online');
  if (on) on.onclick = () => { if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('kaxxi'); };
  el.querySelector('#kx-ai').onclick  = () => settingsStep('ai');
  el.querySelector('#kx-pnp').onclick = () => settingsStep('pnp');
  const rs = el.querySelector('#kx-res');
  if (rs) rs.onclick = () => { if (ST.save) newGame(null, ST.save); };

  const rules = el.querySelector('#kx-menurules');
  const openRules = o => {
    rules.classList.toggle('open', o);
    rules.setAttribute('aria-hidden', o ? 'false' : 'true');
    cue(o ? 'ui.sheet' : 'ui.back', { gain:0.8 });
  };
  el.querySelector('#kx-rulesbtn').onclick = () => openRules(!rules.classList.contains('open'));
  el.querySelector('#kx-menurules-x').onclick = () => openRules(false);

  if (window.KARTI_LANG && KARTI_LANG.onChange && !setupSheet._sub){
    setupSheet._sub = KARTI_LANG.onChange(() => {
      try { if (!M && el.isConnected && el.querySelector('#kx-ai')) setupSheet();
            else if (M && UI){ paintSeats(); drawStatic(); paintRules(); } } catch(e){}
    });
  }
}

/* the ONE tiny step after PLAY WITH AI / PASS THE PHONE — players, board
   size, and (for AI) difficulty. Not a settings wall. */
function settingsStep(mode){
  injectCSS();
  P.show();
  const el = P.ui.screenEl();
  const p = pref();
  let seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, p.seats || 2));
  let sizeId = (sizes().find(s => s.id === p.sizeId) ? p.sizeId : 'm');
  let lvl = p.lvl || 2;

  function paint(){
    el.innerHTML =
      '<div class="pt-wrap kx-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="kx-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(mode === 'pnp' ? T('Pass the phone', 'Għaddi t-telefon') : T('Play the machine', 'Ilgħab mal-magna')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<div class="kx-hero" aria-hidden="true">' + heroSVG() + '</div>' +

        '<div class="tiny pt-lbl">' + esc(T('How many players', 'Kemm-il plejer')) + '</div>' +
        '<div class="pt-opts" id="kx-seats">' + [2,3,4].map(n =>
          '<button class="pt-opt' + (n === seats ? ' on' : '') + '" data-seats="' + n + '">' +
          '<b>' + n + '</b><i>' + esc(n === 2 ? T('a duel', 'duell') : T('players', 'plejers')) + '</i></button>').join('') +
        '</div>' +

        '<div class="tiny pt-lbl" style="margin-top:10px">' + esc(T('Board size', 'Daqs tat-tabellun')) + '</div>' +
        '<div class="pt-opts" id="kx-size">' + sizes().map(s =>
          '<button class="pt-opt' + (s.id === sizeId ? ' on' : '') + '" data-size="' + s.id + '">' +
          '<b>' + esc(TE(s.name)) + '</b><i>' + s.boxCols + '×' + s.boxRows + ' ' + esc(T('boxes', 'kaxxi')) + '</i></button>').join('') +
        '</div>' +

        (mode === 'ai'
          ? '<div class="tiny pt-lbl" style="margin-top:10px">' + esc(T('How sharp is the machine', 'Kemm hi taħraq il-magna')) + '</div>' +
            '<div class="pt-opts" id="kx-lvl">' + levels().map(o =>
              '<button class="pt-opt' + (o.level === lvl ? ' on' : '') + '" data-lvl="' + o.level + '">' +
              ico(o.icon || ('diff-' + Math.min(3, o.level))) +
              '<b>' + esc(o.name) + '</b><i>' + esc(TE(o.note)) + '</i></button>').join('') +
            '</div>'
          : '') +

        '<div class="pt-acts" style="margin-top:18px;display:grid;gap:9px">' +
          '<button class="btn primary" id="kx-go">' + esc(T('Play', 'Ilgħab')) + '</button>' +
        '</div>' +
      '</div></div>';

    el.querySelector('#kx-back').onclick = () => { cue('ui.back'); setupSheet(); };
    el.querySelectorAll('[data-seats]').forEach(b => b.onclick = () => { seats = +b.dataset.seats; cue('ui.tap', { gain:0.8 }, true); paint(); });
    el.querySelectorAll('[data-size]').forEach(b => b.onclick = () => { sizeId = b.dataset.size; cue('ui.tap', { gain:0.8 }, true); paint(); });
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { lvl = +b.dataset.lvl; cue('ui.tap', { gain:0.8 }, true); paint(); });
    el.querySelector('#kx-go').onclick = () => {
      pref({ seats, sizeId, lvl });
      if (mode === 'pnp') newGame({ seats, sizeId, mode:'pnp' });
      else newGame({ seats, sizeId, lvl, mode:'ai' });
    };
  }
  paint();
}

function canGoOnline(){
  try {
    const MP = window.KARTI_MP;
    return !!(MP && MP.openFor && P.online && P.online.kaxxi);
  } catch(e){ return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   START A LOCAL GAME. meta stamps who owns each seat. mode:'pnp' → all
   seats are people at one phone; mode:'ai' → seat 0 is you, the rest are
   machines at the chosen level.
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
    startMatch({ seats: opts.seats, sizeId: opts.sizeId, lvl: opts.lvl || 2 }, null);
    meta = defaultMeta(opts);
  }
  M.meta = meta;
  applyMeta();
  M.finished = false;
  openBoard(() => setupSheet());
  cue('game.start', { gain:0.9 }, true);
  afterMove();      /* if a machine has seat 0, let it open */
}
function defaultMeta(opts){
  opts = opts || {};
  const seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, opts.seats | 0 || 2));
  const lvl = opts.lvl || 2;
  const out = [];
  if (opts.mode === 'pnp'){
    for (let i = 0; i < seats; i++)
      out.push({ own:'hot', name: i === 0 ? myName() : (T('Player', 'Plejer') + ' ' + (i + 1)), lvl });
    if (out[0]) out[0].own = 'me';
  } else {
    /* you vs the machines */
    out.push({ own:'me', name: myName(), lvl });
    for (let i = 1; i < seats; i++)
      out.push({ own:'ai', name: levelName(lvl), lvl });
  }
  return out;
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
   THE ONLINE CONTROLLER — KARTI_PARTY.online.kaxxi. js/mp.js is the only
   caller. Dots & boxes has no hidden state and no seeded play, so this is
   a plain turn-based relay: start() puts the board up, remote(seat,move)
   applies a wire edge through the engine gate (which computes the capture
   and whose-turn-next identically on every phone), note()/stop() are the
   two things the transport may say.
   ═══════════════════════════════════════════════════════════════════ */
const hooks = {
  /* js/mp.js subscribes with (move, { seat, src }) while our own feed fires
     ONE {seat, move, index, src} event. Adapt here (same fix as aqleb-ui):
     without it, mp.js received the whole event object as the move, toWire()
     found no `t` on it, and the table was stopped on the FIRST local move. */
  onMove(fn){
    const f = ev => { if (ev) fn(ev.move, { seat: ev.seat, src: ev.src }); };
    moveSubs.push(f);
    return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); };
  },
  phase(){ return M ? 'play' : 'idle'; },
  apply(seat, move){ if (!M) return { ok:false, why:'no kaxxi' }; return onlineRemote(seat, move); },
  attachNet(net){ if (M){ M.net = net || null; maybeThink(); } },
  setOwner(i, own){ if (M && M.meta && M.meta[i]){ M.meta[i].own = own; } },
  setName(i, name){ if (M && M.meta && M.meta[i] && name){ M.meta[i].name = name; } },
  live(){ return !!(M && !M.dead && !E.over(M.st)); },
  /* A CHAIR THAT IS GONE FOR GOOD. No engine walkout exists and a seat
     turned 'ai' mid-game cannot ride the wire (mp.js only relays bot moves
     for seats in began.bots), so stop the table honestly (kodici's pattern)
     instead of parking the turn on an empty chair forever. The stop card's
     wrapped P.ui.result settles any stake as a draw — antes home. */
  seatGone(seat){
    if (!M || M.dead || !M.net || E.over(M.st)) return;
    const who = (M.meta && M.meta[seat] && M.meta[seat].name) || T('Somebody', 'Xi ħadd');
    onlineStop(who + ' ' + T('left the table — the boxes cannot be drawn around an empty chair.',
                             'telaq mill-mejda — il-kaxxi ma jistgħux jitkomplew b’siġġu vojt.'));
  },
  seatBack(){ if (M){ paintSeats(); drawStatic(); } }
};

function onlineStart(cfg){
  cfg = cfg || {};
  injectCSS();
  P.show();
  const seatsList = cfg.seats || [];
  const nSeats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS,
    (seatsList.length || cfg.count || 2)));
  /* the host's board-size variant rides in cfg.opts.mode (mp.js puts the
     relay's broadcast m.variant there); cfg.variant is kept for any direct
     caller. Both come off the ONE shared broadcast, so every phone lands on
     the same board. */
  const varId = cfg.variant || (cfg.opts && cfg.opts.mode) || '';
  const sizeId = (sizes().find(s => s.id === varId) ? varId : 'm');
  /* NEVER fall back to startMatch's per-client newSeed() online: a missing
     seed must degrade to the SAME value (0) on every phone, never a different
     one each — the host's bot tie-break reads st.rs off this seed. */
  startMatch({ seats: nSeats, sizeId, lvl: 2 }, (cfg.seed == null ? 0 : cfg.seed) >>> 0);
  M.meta = [];
  for (let i = 0; i < nSeats; i++){
    const s = seatsList[i] || {};
    const own = (i === cfg.you) ? 'me' : (s.own === 'ai' || s.kind === 'cpu') ? 'ai' : 'net';
    M.meta.push({ own, name: s.name || seatColName(i), lvl: s.level || 2 });
  }
  applyMeta();
  /* stamp iAmHost onto the net handle: maybeThink() only lets THE HOST drive
     the machine chairs online (its moves are relayed; everyone else applies
     them off the wire). mp.js's raw net has host/seat but no iAmHost, so
     without this stamp NO phone drove the bots and a bot's turn hung forever. */
  const net = Object.assign({}, cfg.net || {}, {
    iAmHost: (cfg.you | 0) === (cfg.host | 0)
  });
  M.net = net;
  M.finished = false;
  openBoard(() => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); });
  hooks.attachNet(net);
  afterMove();
  return snapshot();
}
function onlineRemote(seat, move){
  if (!M) return { ok:false, why:'no kaxxi on the table' };
  if (E.over(M.st)) return { ok:false, why:'the game is over' };
  const dec = E.decWire ? (E.decWire(move) || move) : move;
  /* ORDER IS THE GAME. A wire move that lands while an earlier one is still
     animating (and so NOT YET APPLIED) must WAIT BEHIND it, not jump it:
     kaxxi's extra-turn rule means two moves from the same seat can BOTH pass
     check() before either is applied, so applying the newcomer straight away
     replayed them B-then-A here while every other phone had A-then-B — and
     the deferred A then failed and was dropped. Queue in arrival order; the
     queue drains one per applied move in afterMove(). */
  if (M.anim || (M.netq && M.netq.length)){
    M.netq.push({ seat, mv:{ t:'edge', dir:dec.dir | 0, r:dec.r | 0, c:dec.c | 0 } });
    return { ok:true };
  }
  if (!E.check(M.st, dec, seat)) return { ok:false, why:'that move did not fit the rules' };
  commitEdge(seat, { dir:dec.dir, r:dec.r, c:dec.c }, 'net');
  return { ok:true };
}
/* drain the held wire moves, IN ORDER, one commit at a time. A queued move
   that no longer fits means the tables have already split — stop loudly (the
   same posture mp.js takes on a bad live move) rather than drop it silently
   and drift. */
function flushNetQ(){
  if (!M || M.dead || M.anim || !M.netq || !M.netq.length) return;
  if (E.over(M.st)){ M.netq.length = 0; return; }
  const q = M.netq.shift();
  if (!E.check(M.st, q.mv, q.seat)){
    M.netq.length = 0;
    if (M.net && typeof M.net.bail === 'function'){
      try { M.net.bail('A move did not fit the rules here.'); } catch(e){}
    } else {
      onlineStop(T('A move did not fit the rules on this phone.',
                   'Mossa ma qablitx mar-regoli fuq dan it-telefon.'), 'cheat');
    }
    return;
  }
  commitEdge(q.seat, { dir:q.mv.dir, r:q.mv.r, c:q.mv.c }, 'net');
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
    quip: T('Nobody lost anything.', 'Ħadd ma tilef xejn.'),
    buttons: [{ label:T('Back to the rooms', 'Lura fil-kmamar'), icon:'back', cls:'primary',
                go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
  });
}

P.online = P.online || {};
P.online.kaxxi = {
  start: onlineStart,
  remote: onlineRemote,
  note: onlineNote,
  stop: onlineStop,
  live: () => !!(M && !M.dead && hooks.live()),
  hooks
};

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — window.KARTI_KAXXI.lobby. Read by js/mp.js. Two to
   four seats; the board size is a host-changeable VARIANT.
   NOTE: canStart intentionally refuses until 'kaxxi' is added to the relay
   (server GAME_SEATS + mp.js GAMES/LOBBY_GLOBAL). This is honest — the
   room cannot carry a move the relay does not know — and is the same
   posture js/bomba-ui.js takes until it is wired.
   ═══════════════════════════════════════════════════════════════════ */
const ONLINE_WHY = T('Online tables open once the room supports Dots & Boxes.',
                     'Il-postijiet onlajn jinfetħu meta l-kamra tieħu Puntini u Kaxxi.');
const LOBBY = {
  id:'kaxxi',
  name:'Dots & Boxes',
  mt:'Puntini u Kaxxi',
  minSeats: E.MIN_SEATS,
  maxSeats: E.MAX_SEATS,
  levels: levels().map(L => ({ level:L.level, name:L.name, note:TE(L.note) })),
  defaultLevel: 2,
  /* board sizes as host-changeable variants (the `net` word is the engine
     size id, so the relay's deterministic broadcast names the exact same
     board on every phone) */
  get variants(){
    return sizes().map(s => ({ net:s.id, label:{ en: TE(s.name) + ' ' + s.boxCols + '×' + s.boxRows,
                                                  mt: TE(s.name) + ' ' + s.boxCols + '×' + s.boxRows } }));
  },
  currentVariant(){
    try {
      const v = window.KARTI_MP && window.KARTI_MP.MP && window.KARTI_MP.MP.variant;
      if (v && E.sizeOf(v).id === v) return v;
    } catch(e){}
    const p = pref().sizeId;
    return (p && E.sizeOf(p).id === p) ? p : 'm';
  },
  applyVariant(net){
    const id = (net && E.sizeOf(net).id === net) ? net : 'm';
    pref({ sizeId: id });
    return { variant: id };
  },
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    /* Refuse until the relay knows 'kaxxi' (see note above). Once wired,
       flip this to the seat-count / readiness gate below. */
    if (!(window.KARTI_PARTY && window.KARTI_PARTY.online && window.KARTI_PARTY.online.kaxxi))
      return { ok:false, why: ONLINE_WHY };
    const n = (seatList || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why: T('Dots & Boxes needs at least two.', 'Puntini u Kaxxi jridu mill-inqas tnejn.') };
    if (n > E.MAX_SEATS) return { ok:false, why: T('Up to four can play.', 'Sa erbgħa jistgħu jilagħbu.') };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready) return { ok:false, why: unready + (unready > 1
        ? T(' people are not ready yet.', ' persuni għadhom mhux lesti.')
        : T(' person is not ready yet.', ' persuna għadha mhux lesta.')) };
    return { ok:true, why:'' };
  },
  rulesHTML: () =>
    '<p>' + T('Two to four players take turns drawing lines between dots. Close the fourth side of a ' +
      'box to win it — and go again. Most boxes wins.',
      'Minn tnejn sa erbgħa plejers idawru l-linji bejn il-puntini. Agħlaq ir-raba’ ġenb ta’ kaxxa ' +
      'biex tirbaħha — u terġa’ tilgħab. L-iktar kaxxi jirbaħ.') + '</p>' +
    '<p>' + T('No luck and nothing hidden — everyone sees the whole board, so online is as honest as ' +
      'across a table.',
      'Ebda xorti u xejn moħbi — kulħadd jara t-tabellun kollu, mela onlajn hu onest daqs wiċċ imb wiċċ.') + '</p>',
  blurb: T('Draw lines, close boxes. No luck, all wits.',
           'Iġbed linji, agħlaq kaxxi. Ebda xorti, kollox moħħ.'),
  start(seats, opts){
    return newGame(Object.assign({ seats: Math.max(2, Math.min(4, (seats && seats.length) || 2)),
                                   sizeId: pref().sizeId || 'm', mode:'pnp' }, opts || {}));
  },
  myName,
  wire: { fields: E.WIRE_FIELDS },
  takeback: false
};
R.lobby = LOBBY;

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF — one tile. kind:'board' puts it with the board games. Icon
   'map' (a real ICO id) reads as a lattice/grid — no invented symbol.
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'kaxxi', order:28, kind:'board', cat:'board',
  name:'Dots & Boxes', mt:'Puntini u Kaxxi', icon:'map', status:'live',
  get tag(){
    return T('Draw the lines and close the boxes — every box you shut is yours, and you go again. ' +
             'Two to four players, all skill, no luck.',
             'Iġbed il-linji u agħlaq il-kaxxi — kull kaxxa li tagħlaq hi tiegħek, u terġa’ tilgħab. ' +
             'Minn tnejn sa erbgħa, kollox ħila, ebda xorti.') +
           (ST.save ? ' ' + T('There is a game half-played.', 'Hemm logħba nofsha milgħuba.') : '');
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

/* ── test hooks — inert unless ?kaxxitest is in the URL or a harness set
   window.__KAXXI_FORCE_TEST (an iframe harness injects this file into the
   real app, whose URL carries no query, so the flag is the reliable gate) ── */
if (/[?&]kaxxitest\b/.test(location.search || '') || window.__KAXXI_FORCE_TEST){
  window.__KAXXI_TEST = {
    setupSheet, newGame, settingsStep, commitEdge, tryDraw, drawStatic,
    get M(){ return M; }, get UI(){ return UI; },
    engine: E, LOBBY, hooks, online: P.online.kaxxi, leave,
    edgeAt, edgeMid, reduced
  };
}

})();
