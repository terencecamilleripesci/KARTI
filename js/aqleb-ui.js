/* ═══════════════════════════════════════════════════════════════════
   KARTI — aqleb-ui.js
   AQLEB (Maltese Reversi/Othello, 2–4 players) — the tappable game on top
   of js/aqleb.js's pure engine (window.KARTI_AQLEB.engine). This file is
   the screen, the runner and the wire, and it follows js/erbgha-ui.js's
   shape deliberately: a match is (opts, seed, log), every move goes
   through one doMove() gate, and a rollback is cutting the log and
   replaying it.

   WHAT THIS FILE IS
     · the shelf tile and the MINIMAL entry menu — a themed hero, three
       big buttons (PLAY ONLINE / PLAY WITH AI / PASS THE PHONE) and a
       "How to play" that slides the rules up; the player count (2/3/4) and
       difficulty are a tiny SECOND step, never a settings wall on screen one
     · the board: a canvas 8×8 grid drawn on dark felt with a gold grid,
       hint dots on the human's legal cells, a last-move marker, and THE
       HERO — a disc that DROPS IN on placement and a satisfying 3D FLIP
       that CASCADES along each flanked line as the captured discs turn to
       your colour. One canvas, one rAF loop, 60fps on a phone.
     · the runner: log, seed, autosave (karti_aqleb_v1)
     · the online controller published on KARTI_PARTY.online.aqleb and the
       lobby contract on window.KARTI_AQLEB.lobby, both exactly the shape
       js/mp.js reads (see js/erbgha-ui.js / js/ludu-ui.js)

   ONLINE IS HONEST BY CONSTRUCTION. Reversi has no hidden state and no
   seed-dependent play — every phone applies the identical deterministic
   flip from the same list of {r,c} placements. The seed only tunes the
   machine's tie-break, and an online table has no machine on the human
   seats. So the online controller relays a bare cell through
   encWire/decWire and the engine (the referee) gates it.

   HOUSE RULES OBEYED
     · borrows #scr-party through KARTI_PARTY, injects its own CSS once,
       never touches css/ or the tab bar's ancestors;
     · sounds only through existing KARTI_SFX ids (dama.place for the drop,
       board.flip for the cascade, game.win for the flourish);
     · every player-visible string is a T(en,mt) pair at its call site;
     · the back arrow goes BACK. It never asks "are you sure": the game is
       autosaved on every move and the menu offers it again at the top.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_AQLEB;
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
   THE SEAT COLOURS — the KARTI seat palette: seat0 gold, seat1 ice/blue,
   seat2 jade/green, seat3 ruby/red. The `border` ids (gold/ice/jade/ruby)
   are exactly the ones js/rebbieh.js knows, so the podium frames match the
   discs with no extra wiring. Each has a hi/lo for the disc's 3D shading.
   ═══════════════════════════════════════════════════════════════════ */
const DISCS = [
  { id:'gold', border:'gold', hex:'#FFC542', hi:'#FFE08A', lo:'#C89211', name:{ en:'Gold', mt:'Deheb'  } },
  { id:'ice',  border:'ice',  hex:'#4FB6FF', hi:'#A7E0FF', lo:'#1E6FB8', name:{ en:'Ice',  mt:'Silġ'   } },
  { id:'jade', border:'jade', hex:'#3DDC84', hi:'#93F5BE', lo:'#1C9557', name:{ en:'Jade', mt:'Ġada'   } },
  { id:'ruby', border:'ruby', hex:'#FF5468', hi:'#FF97A5', lo:'#B0263A', name:{ en:'Ruby', mt:'Rubin'  } }
];
const discColour = seat => DISCS[seat] || DISCS[0];
const discName   = seat => TE(discColour(seat).name);

/* ═══════════════════════════════════════════════════════════════════
   OUR CORNER OF localStorage — the save, the prefs and the record, the
   erbgha/ludu way: one key, debounced, flushed inline when the tab hides.
   ═══════════════════════════════════════════════════════════════════ */
const STORE  = 'karti_aqleb_v1';
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

/* UI-only prefs */
const UIKEY = 'karti_aqleb_ui_v1';
let rulesOpen = false;
try { rulesOpen = localStorage.getItem(UIKEY + '.rules') === '1'; } catch(e){}

/* the machine's sharpnesses, off the engine's LEVELS */
function levels(){ return (E.LEVELS || []).map(L => ({ level:L.k, name:L.name, note:L.note, icon:L.icon })); }
function levelName(k){ const L = levels().find(x => x.level === k); return (L && L.name) || 'MAKNA'; }
function levelNote(k){ const L = levels().find(x => x.level === k); return L ? TE(L.note) : ''; }

/* ═══════════════════════════════════════════════════════════════════
   SOUND — existing ids only (read js/sfx.js), through one gate so a fast
   cascade does not machine-gun the mixer. The drop is dama.place; each
   flip in the cascade is board.flip; the win is game.win.
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
    anim: null, raf: 0, pulseRaf: 0,
    recorded: false,
    net: null, meta: null,
    hover: null                /* {r,c} the human is pointing at */
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
function seatCount(){ return M && M.st ? M.st.seats : 2; }
function ownerOf(i){
  if (!M || !M.meta || !M.meta[i]) return 'ai';
  return M.meta[i].own || 'ai';
}
const isLocal = i => { const o = ownerOf(i); return o === 'me' || o === 'hot'; };
function seatLvl(i){ return (M && M.meta && M.meta[i] && M.meta[i].lvl) || 2; }
function seatName(i){
  if (!M || !M.meta || !M.meta[i]) return discName(i);
  const m = M.meta[i];
  if (m.own === 'me' || m.own === 'hot') return m.name || T('You', 'Int');
  if (m.own === 'ai') return levelName(m.lvl);
  return m.name || discName(i);
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
  fireList(moveSubs,  { seat, move:clone(move), index:idx, src:src || 'local', landed:M.st.last });
  fireList(stateSubs, { reason:'move', index:idx });
  return { ok:true, index:idx };
}

function snapshot(){
  if (!M) return null;
  return { v:SAVE_V, gid:'aqleb', opts:clone(M.opts), seed:M.seed, log:clone(M.log), meta:clone(M.meta || null) };
}
function autosave(){
  if (!M || M.net) return;
  if (E.over(M.st)){ saveSlot(null); return; }
  saveSlot(snapshot());
}

/* reduced-motion sound: the drop is voiced by the animation; here we only
   voice the non-animated case */
moveSubs.push(ev => {
  if (!M || M.dead) return;
  if (ev.move && ev.move.t === 'place' && reduced()){
    cue('dama.place', { gain: 0.8 }, true);
  }
});

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party.
   ═══════════════════════════════════════════════════════════════════ */
let cssDone = false;
function injectCSS(){
  if (cssDone || document.getElementById('aq-runtime-css')){ cssDone = true; return; }
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'aq-runtime-css';
  st.textContent =
    '#scr-party{--aq-felt:#123024;--aq-felt2:#0B1D16;--aq-gold:var(--gold,#FFC542)}' +

    '#scr-party .pt-host.aq-host{align-items:stretch;justify-content:stretch;overflow:visible}' +
    '#scr-party .aq-wrap{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;' +
      'gap:6px;padding:6px 6px 7px;position:relative}' +

    /* ── the seat chips across the top ── */
    '#scr-party .aq-seats{flex:0 0 auto;display:flex;gap:6px;justify-content:center;' +
      'flex-wrap:wrap;padding:2px 2px 1px}' +
    '#scr-party .aq-seat{flex:0 1 auto;position:relative;display:flex;align-items:center;gap:7px;' +
      'min-width:0;padding:4px 11px 4px 6px;border-radius:12px;' +
      'background:rgba(0,0,0,.30);border:1px solid rgba(255,255,255,.09);transition:border-color .2s}' +
    '#scr-party .aq-seat.on{background:rgba(255,197,66,.14);border-color:rgba(255,197,66,.6)}' +
    '#scr-party .aq-seat .sw{width:18px;height:18px;flex:0 0 auto;border-radius:50%;' +
      'box-shadow:inset 0 2px 0 rgba(255,255,255,.45),inset 0 0 0 1.5px rgba(0,0,0,.3),0 1px 3px rgba(0,0,0,.5)}' +
    '#scr-party .aq-seat .col{display:flex;flex-direction:column;gap:1px;min-width:0}' +
    '#scr-party .aq-seat .n{font:900 10px/1.1 var(--disp);letter-spacing:.05em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.74);max-width:96px;white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .aq-seat.on .n{color:var(--aq-gold)}' +
    '#scr-party .aq-seat .h{font:900 11px/1 var(--disp);color:rgba(255,255,255,.9);' +
      'font-variant-numeric:tabular-nums}' +
    '#scr-party .aq-seat.on .h{color:var(--aq-gold)}' +

    /* ── the board box holds the square canvas ── */
    '#scr-party .aq-boardbox{flex:1 1 auto;min-height:0;position:relative;display:flex;' +
      'align-items:center;justify-content:center}' +
    '#scr-party .aq-canv{display:block;touch-action:manipulation;-webkit-tap-highlight-color:transparent;' +
      'border-radius:14px;filter:drop-shadow(0 10px 26px rgba(0,0,0,.5));cursor:pointer}' +

    /* ── the status line under the board ── */
    '#scr-party .aq-say{flex:0 0 auto;font:700 12px/1.4 var(--body);text-align:center;' +
      'color:rgba(255,255,255,.85);min-height:17px;padding:0 8px}' +
    '#scr-party .aq-say b{color:var(--aq-gold);font-weight:900}' +
    '#scr-party .aq-say .dot{display:inline-block;width:11px;height:11px;border-radius:50%;' +
      'vertical-align:-1px;margin-right:5px;box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}' +

    /* ── the rules panel: slide from the top ── */
    '#scr-party .aq-rules{position:absolute;top:0;left:0;right:0;z-index:30;max-height:64%;' +
      'display:flex;flex-direction:column;border-radius:14px;overflow:hidden;' +
      'background:linear-gradient(180deg,#173A2C,#0A1913);border:1px solid rgba(255,255,255,.16);' +
      'box-shadow:0 14px 30px rgba(0,0,0,.55);' +
      'transform:translateY(-108%);opacity:0;visibility:hidden;pointer-events:none;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease),visibility 0s .26s}' +
    '#scr-party .aq-rules.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease)}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .aq-rules{transition:none}}' +
    'body.reduced #scr-party .aq-rules{transition:none}' +
    '#scr-party .aq-rules-h{flex:0 0 auto;display:flex;align-items:center;' +
      'justify-content:space-between;padding:9px 4px 2px 14px}' +
    '#scr-party .aq-rules-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--aq-gold)}' +
    '#scr-party .aq-rules-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;' +
      'color:var(--txt);cursor:pointer;display:grid;place-items:center;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .aq-rules-x svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round}' +
    '#scr-party .aq-rules-b{min-height:0;overflow-y:auto;padding:2px 14px 12px;-webkit-overflow-scrolling:touch}' +
    '#scr-party .aq-rules-b li{font-size:12px;line-height:1.6;color:var(--dim);margin:0 0 6px 14px}' +

    /* ── landscape: seats down the side ── */
    '@media (max-height:520px){' +
      '#scr-party .aq-wrap{flex-direction:row;align-items:stretch;gap:8px}' +
      '#scr-party .aq-seats{flex-direction:column;flex:0 0 auto;justify-content:flex-start;max-width:150px}' +
      '#scr-party .aq-mid{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:5px}' +
      '#scr-party .aq-say{order:-1}' +
      '#scr-party .aq-rules{max-height:90%}' +
    '}' +
    '@media (min-height:521px){#scr-party .aq-mid{display:contents}}' +

    /* ── THE MENU'S OWN FACE ── */
    '#scr-party .aq-menu .pt-lbl{color:#9EE7C4}' +
    '#scr-party .aq-menu .aq-hero{position:relative;display:flex;align-items:center;justify-content:center;' +
      'margin:2px 0 12px;padding:16px 8px;border-radius:16px;overflow:hidden;' +
      'background:radial-gradient(120% 130% at 50% 20%,#1B4433 0%,var(--aq-felt) 52%,var(--aq-felt2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.06),inset 0 -14px 26px rgba(0,0,0,.4)}' +
    '#scr-party .aq-menu .aq-hero svg{width:168px;height:168px;display:block}' +
    '#scr-party .aq-menu .aq-hero-cap{position:absolute;right:11px;bottom:8px;' +
      'font:900 9.5px/1 var(--disp);letter-spacing:.18em;color:rgba(255,255,255,.32)}' +
    '#scr-party .aq-note{font-size:11.5px;line-height:1.6;margin:8px 2px 0;padding:9px 11px;' +
      'border-radius:12px;text-transform:none;letter-spacing:0;color:#BFE8D4;' +
      'background:rgba(61,220,132,.10);border:1px solid rgba(61,220,132,.3)}' +

    /* ── the +/- stepper for player count ── */
    '#scr-party .aq-step{display:flex;align-items:center;justify-content:center;gap:14px;margin:6px 0 2px}' +
    '#scr-party .aq-rnd{width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.18);' +
      'background:rgba(255,255,255,.05);color:var(--txt);font:900 24px/1 var(--disp);cursor:pointer;' +
      'display:grid;place-items:center;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .aq-rnd:disabled{opacity:.3;cursor:default}' +
    '#scr-party .aq-step .v{font:900 30px/1 var(--disp);color:var(--aq-gold);min-width:120px;text-align:center;' +
      'display:flex;flex-direction:column;gap:2px}' +
    '#scr-party .aq-step .v i{font:700 10px/1 var(--disp);letter-spacing:.12em;text-transform:uppercase;' +
      'color:var(--dim);font-style:normal}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   THE FRAME + THE BOARD DOM
   ═══════════════════════════════════════════════════════════════════ */
function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: T('Flip It', 'Aqleb'),
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'aq-rules', label:T('Rules', 'Regoli'), icon:'book',    cls:'ghost' },
      { id:'aq-new',   label:T('New', 'Ġdida'),    icon:'refresh', cls:'ghost' }
    ]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();
  const anyAI = () => { for (let i=0;i<seatCount();i++) if (ownerOf(i)==='ai') return i; return -1; };
  const ai = anyAI();
  M.ctx.badge.textContent = M.net ? T('Online', 'Onlajn')
    : ai >= 0 ? levelName(seatLvl(ai))
    : T('Pass & play', 'Għaddi u lgħab');
  buildBoard();
  M.ctx.btn('aq-rules').onclick = () => setRules(!rulesOpen);
  const nb = M.ctx.btn('aq-new');
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

function buildBoard(){
  const ctx = M.ctx;
  ctx.host.classList.add('aq-host');
  ctx.host.innerHTML =
    '<div class="aq-wrap" id="aq-wrap">' +
      '<div class="aq-seats" id="aq-seats"></div>' +
      '<div class="aq-mid">' +
        '<div class="aq-boardbox" id="aq-boardbox">' +
          '<canvas class="aq-canv" id="aq-canv" role="img" aria-label="' +
            esc(T('The Aqleb board', 'It-tabellun ta’ Aqleb')) + '"></canvas>' +
        '</div>' +
        '<div class="aq-say" id="aq-say"></div>' +
      '</div>' +
      '<div class="aq-rules" id="aq-rulespanel" aria-hidden="true">' +
        '<div class="aq-rules-h"><h4 id="aq-rules-t"></h4>' +
          '<button class="aq-rules-x" id="aq-rules-x" aria-label="' +
            esc(T('Put the rules away', 'Warrab ir-regoli')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button></div>' +
        '<div class="aq-rules-b" id="aq-rules-b"></div>' +
      '</div>' +
    '</div>';
  const root = ctx.host.querySelector('#aq-wrap');
  UI = {
    ctx, root,
    seats:    root.querySelector('#aq-seats'),
    boardbox: root.querySelector('#aq-boardbox'),
    canv:     root.querySelector('#aq-canv'),
    say:      root.querySelector('#aq-say'),
    rules:    root.querySelector('#aq-rulespanel'),
    cx: null, geom: null, dpr: 1
  };
  UI.cx = UI.canv.getContext('2d');
  root.querySelector('#aq-rules-x').addEventListener('click', () => setRules(false));
  ctx.root.addEventListener('pointerdown', e => {
    if (!rulesOpen || !UI || !UI.rules) return;
    const rb = ctx.btn && ctx.btn('aq-rules');
    if (!UI.rules.contains(e.target) && !(rb && rb.contains(e.target))) setRules(false);
  }, true);

  UI.canv.addEventListener('pointermove', onPointerMove);
  UI.canv.addEventListener('pointerleave', () => { if (M){ M.hover = null; drawStatic(); } });
  UI.canv.addEventListener('pointerdown', onPointerDown);
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

/* the board is the biggest square that fits the box */
function sizeBoard(){
  if (!UI || !UI.boardbox || !UI.boardbox.isConnected) return;
  const bw = UI.boardbox.clientWidth, bh = UI.boardbox.clientHeight;
  if (!bw || !bh) return;
  let side = Math.max(220, Math.floor(Math.min(bw, bh)));
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  UI.dpr = dpr;
  UI.canv.style.width = side + 'px';
  UI.canv.style.height = side + 'px';
  UI.canv.width = Math.floor(side * dpr);
  UI.canv.height = Math.floor(side * dpr);
  const pad = Math.max(7, side * 0.022);
  const cell = (side - pad * 2) / E.N;
  UI.geom = { side, pad, cell, ox: pad, oy: pad, r: cell * 0.40 };
  drawStatic();
}

/* map a client point to a cell, or null */
function cellAt(clientX, clientY){
  if (!UI || !UI.geom) return null;
  const rect = UI.canv.getBoundingClientRect();
  const g = UI.geom;
  const x = clientX - rect.left - g.ox, y = clientY - rect.top - g.oy;
  if (x < 0 || y < 0) return null;
  const c = Math.floor(x / g.cell), r = Math.floor(y / g.cell);
  return (r >= 0 && r < E.N && c >= 0 && c < E.N) ? { r, c } : null;
}
function sameCell(a, b){ return a && b && a.r === b.r && a.c === b.c; }

function onPointerMove(e){
  if (!M || M.dead || E.over(M.st) || M.anim) return;
  const seat = E.turn(M.st);
  if (!isLocal(seat)) return;
  const cc = cellAt(e.clientX, e.clientY);
  if (!sameCell(cc, M.hover)){ M.hover = cc; drawStatic(); }
}
function onPointerDown(e){
  if (!M || M.dead) return;
  const cc = cellAt(e.clientX, e.clientY);
  if (!cc) return;
  tryPlace(cc.r, cc.c);
}

/* the one place a local placement is issued */
function tryPlace(r, c){
  if (!M || M.dead || E.over(M.st) || M.anim) return;
  const seat = E.turn(M.st);
  if (!isLocal(seat)) return;
  if (!E.check(M.st, { t:'place', r, c }, seat)){ cue('move.illegal', { gain:0.7 }); return; }
  commitPlace(seat, r, c, 'local');
}

/* commit a placement for any owner (local thumb, AI, or a wire move). Runs
   the drop-in + flip cascade from the CURRENT board, then applies through
   the gate. The engine result is identical whether or not the animation
   ran. */
function commitPlace(seat, r, c, src){
  const st = M.st;
  if (!E.check(st, { t:'place', r, c }, seat)) return;
  const flips = E.flipsFor(st, r, c, seat);
  M.hover = null;

  /* APPLY FIRST, ANIMATE AFTER. The engine move lands synchronously so
     the shared sim can never lag behind the wire: when the apply waited
     for the flip cascade to finish, a second net move arriving mid-
     animation (a relay burst, or rAF frozen in a background tab) found
     the previous move still unapplied, failed the turn check, and mp.js
     stopped the table "out of step". The cascade below is purely
     cosmetic — it draws from its own captured {from} colours while
     drawStatic() skips the cells it owns — and the log/broadcast now
     leave this phone the instant the move is real. */
  const res = doMove(seat, { t:'place', r, c }, src);
  if (!res.ok) return;

  if (reduced() || !UI || !UI.geom){
    drawStatic();
    afterMove();
    return;
  }
  animatePlace(seat, r, c, flips, () => {
    drawStatic();
    afterMove();
  });
}

/* ═══════════════════════════════════════════════════════════════════
   THE HERO — the disc DROPS IN with a small settle, then the captured
   discs FLIP one after another, CASCADING outward along each flanked line
   (nearer discs turn first). Each flip is a 3D coin-turn: the disc's width
   scales to zero showing its old colour, then swells back showing the new
   colour — so you literally watch it turn over. Pure canvas on rAF. The
   flip sound fires as each disc crosses its edge, gated so a long line does
   not machine-gun the mixer.
   ═══════════════════════════════════════════════════════════════════ */
function animatePlace(seat, r, c, flips, done){
  const g = UI.geom;
  /* order flips by distance from the placed cell so the cascade radiates */
  const seq = flips.map(f => ({
    r: f.r, c: f.c, from: f.from,
    d: Math.max(Math.abs(f.r - r), Math.abs(f.c - c))
  })).sort((a, b) => a.d - b.d);

  const DROP_MS = 190;                 /* the disc falls in                 */
  const FLIP_MS = 220;                 /* one disc's turn                   */
  const STAGGER = 55;                  /* gap between successive flips       */
  const start = performance.now();
  M.anim = { seat, r, c, seq, done, phase:'drop', soundedFlip:0 };
  cancelRaf();
  cue('dama.place', { gain: 0.7 }, true);   /* the drop thud, in sync       */

  function frame(now){
    if (!M || M.dead){ M.anim = null; return; }
    const t = now - start;
    /* progress of the drop 0..1 with an ease-out settle */
    const dropT = Math.min(1, t / DROP_MS);
    M.anim.dropT = 1 - Math.pow(1 - dropT, 3);

    /* per-flip progress, staggered after the drop lands */
    let allDone = dropT >= 1;
    for (let i = 0; i < seq.length; i++){
      const t0 = DROP_MS + i * STAGGER;
      const p = (t - t0) / FLIP_MS;
      seq[i].p = p <= 0 ? 0 : p >= 1 ? 1 : p;
      if (seq[i].p < 1) allDone = false;
      /* voice the flip as it crosses the midpoint (edge-on) */
      if (seq[i].p >= 0.5 && !seq[i]._snd){
        seq[i]._snd = true;
        if (now - M.anim.soundedFlip > 40){ M.anim.soundedFlip = now; cue('board.flip', { gain:0.5 }); }
      }
    }

    drawStatic();
    drawAnim();

    if (allDone){
      M.anim = null; M.raf = 0;
      if (done) done();
      return;
    }
    M.raf = requestAnimationFrame(frame);
  }
  M.raf = requestAnimationFrame(frame);
}
function cancelRaf(){ if (M && M.raf){ cancelAnimationFrame(M.raf); M.raf = 0; } }

/* ═══════════════════════════════════════════════════════════════════
   DRAWING — the static board (felt, gold grid, settled discs, hint dots,
   last-move marker, winning glow) and the animated layer (the dropping
   disc + the flipping discs) on top of it each frame.
   ═══════════════════════════════════════════════════════════════════ */
function feltBg(cx, g){
  const grad = cx.createLinearGradient(0, 0, 0, g.side);
  grad.addColorStop(0, '#1B4433');
  grad.addColorStop(0.55, '#123024');
  grad.addColorStop(1, '#0B1D16');
  return grad;
}
function cellCentre(g, r, c){ return { x: g.ox + c * g.cell + g.cell/2, y: g.oy + r * g.cell + g.cell/2 }; }

/* a disc, optionally squashed horizontally (scaleX) for the flip turn */
function discFace(cx, x, y, r, seat, scaleX){
  const col = discColour(seat);
  cx.save();
  cx.translate(x, y);
  if (scaleX != null && scaleX !== 1) cx.scale(Math.max(0.02, scaleX), 1);
  const grad = cx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.15, 0, 0, r);
  grad.addColorStop(0, col.hi);
  grad.addColorStop(0.55, col.hex);
  grad.addColorStop(1, col.lo);
  cx.fillStyle = grad;
  cx.beginPath(); cx.arc(0, 0, r, 0, Math.PI * 2); cx.fill();
  cx.lineWidth = Math.max(1, r * 0.07);
  cx.strokeStyle = 'rgba(0,0,0,.35)'; cx.stroke();
  /* gloss */
  cx.beginPath();
  cx.ellipse(-r * 0.22, -r * 0.3, r * 0.42, r * 0.26, -0.5, 0, Math.PI * 2);
  cx.fillStyle = 'rgba(255,255,255,.26)'; cx.fill();
  cx.restore();
}

function drawStatic(){
  if (!UI || !UI.cx || !UI.geom || !M) return;
  const cx = UI.cx, g = UI.geom, st = M.st, dpr = UI.dpr;
  cx.save();
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx.clearRect(0, 0, g.side, g.side);

  /* the felt cabinet */
  cx.fillStyle = feltBg(cx, g);
  roundRect(cx, 0, 0, g.side, g.side, 14); cx.fill();

  /* the gold grid lines */
  cx.strokeStyle = 'rgba(255,197,66,.20)';
  cx.lineWidth = Math.max(1, g.cell * 0.03);
  for (let i = 0; i <= E.N; i++){
    const p = g.oy + i * g.cell;
    cx.beginPath(); cx.moveTo(g.ox, p); cx.lineTo(g.ox + E.N * g.cell, p); cx.stroke();
    const q = g.ox + i * g.cell;
    cx.beginPath(); cx.moveTo(q, g.oy); cx.lineTo(q, g.oy + E.N * g.cell); cx.stroke();
  }

  const over = E.over(st);
  const curSeat = E.turn(st);
  const myTurn = !over && isLocal(curSeat) && !M.anim;

  /* hint dots on the human's legal cells */
  if (myTurn){
    const moves = E.legal(st, curSeat);
    const col = discColour(curSeat);
    for (let i = 0; i < moves.length; i++){
      const p = cellCentre(g, moves[i].r, moves[i].c);
      const hovered = sameCell(M.hover, moves[i]);
      cx.beginPath();
      cx.arc(p.x, p.y, g.r * (hovered ? 0.62 : 0.24), 0, Math.PI * 2);
      cx.fillStyle = hovered
        ? 'rgba(255,255,255,.22)'
        : 'rgba(255,255,255,.28)';
      cx.fill();
      if (hovered){
        /* a translucent ghost of the disc under the thumb */
        cx.globalAlpha = 0.55;
        discFace(cx, p.x, p.y, g.r, curSeat, 1);
        cx.globalAlpha = 1;
      } else {
        cx.beginPath(); cx.arc(p.x, p.y, g.r * 0.24, 0, Math.PI * 2);
        cx.strokeStyle = col.hex; cx.globalAlpha = 0.5; cx.lineWidth = 1.5; cx.stroke();
        cx.globalAlpha = 1;
      }
    }
  }

  /* the settled discs */
  const last = st.last;
  for (let r = 0; r < E.N; r++){
    for (let c = 0; c < E.N; c++){
      const v = E.cell(st, r, c);
      if (v === E.EMPTY) continue;
      /* skip cells the animation currently owns (drawn on the anim layer) */
      if (M.anim && animOwns(r, c)) continue;
      const p = cellCentre(g, r, c);
      discFace(cx, p.x, p.y, g.r, v - 1, 1);
      /* last-move marker: a small gold ring on the placed cell */
      if (last && last.r === r && last.c === c && !M.anim){
        cx.beginPath(); cx.arc(p.x, p.y, g.r * 0.5, 0, Math.PI * 2);
        cx.strokeStyle = 'rgba(255,255,255,.85)'; cx.lineWidth = Math.max(1.5, g.r * 0.10); cx.stroke();
      }
    }
  }

  /* winner glow: a soft ring on each disc of the top seat(s) */
  if (over){
    const winners = over.winners;
    const t = reduced() ? 1 : (0.6 + 0.4 * Math.sin(Date.now() / 200));
    for (let r = 0; r < E.N; r++)
      for (let c = 0; c < E.N; c++){
        const v = E.cell(st, r, c);
        if (v === E.EMPTY || winners.indexOf(v - 1) < 0) continue;
        const p = cellCentre(g, r, c);
        cx.beginPath(); cx.arc(p.x, p.y, g.r * (0.86 + 0.05 * t), 0, Math.PI * 2);
        cx.strokeStyle = 'rgba(255,255,255,' + (0.35 + 0.35 * t) + ')';
        cx.lineWidth = Math.max(1.5, g.r * 0.12); cx.stroke();
      }
    if (!reduced() && !M.pulseRaf){
      M.pulseRaf = requestAnimationFrame(function loop(){
        if (!M || M.dead){ return; }
        drawStatic();
        if (E.over(M.st)) M.pulseRaf = requestAnimationFrame(loop);
        else M.pulseRaf = 0;
      });
    }
  }
  cx.restore();
  paintSay();
}

/* which cells the running animation is responsible for drawing */
function animOwns(r, c){
  const a = M.anim; if (!a) return false;
  if (a.r === r && a.c === c) return true;
  for (let i = 0; i < a.seq.length; i++) if (a.seq[i].r === r && a.seq[i].c === c) return true;
  return false;
}

/* the animated layer: the dropping disc + the flipping discs */
function drawAnim(){
  if (!UI || !UI.cx || !UI.geom || !M || !M.anim) return;
  const cx = UI.cx, g = UI.geom, dpr = UI.dpr, a = M.anim;
  cx.save();
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);

  /* the just-placed disc drops in from above its cell with a settle */
  const pc = cellCentre(g, a.r, a.c);
  const dt = a.dropT == null ? 1 : a.dropT;
  const yFrom = pc.y - g.cell * 1.4;
  const y = yFrom + (pc.y - yFrom) * dt;
  const scale = 0.7 + 0.3 * dt;
  discAt(cx, pc.x, y, g.r * scale, a.seat, 1);

  /* the flipping discs: scaleX shrinks to 0 (edge-on, old colour) then
     swells to 1 (new colour) — the coin turn. */
  for (let i = 0; i < a.seq.length; i++){
    const f = a.seq[i];
    const p = cellCentre(g, f.r, f.c);
    const pr = f.p == null ? 0 : f.p;
    if (pr <= 0){
      discAt(cx, p.x, p.y, g.r, f.from - 1, 1);          /* still old colour */
    } else if (pr >= 1){
      discAt(cx, p.x, p.y, g.r, a.seat, 1);              /* fully new colour */
    } else if (pr < 0.5){
      const sx = 1 - pr * 2;                             /* 1→0 : old face   */
      discAt(cx, p.x, p.y, g.r, f.from - 1, sx);
    } else {
      const sx = (pr - 0.5) * 2;                         /* 0→1 : new face   */
      discAt(cx, p.x, p.y, g.r, a.seat, sx);
    }
  }
  cx.restore();
}
/* discAt = discFace but the caller already set the base transform */
function discAt(cx, x, y, r, seat, scaleX){ discFace(cx, x, y, r, seat, scaleX); }

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
  for (let i = 0; i < seatCount(); i++){
    const on = (i === turn && !over) ? ' on' : '';
    const col = discColour(i);
    const nm = seatName(i);
    const cnt = E.countDiscs(st, i);
    html += '<div class="aq-seat' + on + '">' +
      '<span class="sw" style="background:radial-gradient(circle at 35% 30%,' + col.hi + ',' + col.hex + ' 60%,' + col.lo + ')"></span>' +
      '<span class="col">' +
        '<span class="n">' + esc(nm) + '</span>' +
      '</span>' +
      '<span class="h">' + cnt + '</span>' +
    '</div>';
  }
  UI.seats.innerHTML = html;
}

function paintSay(){
  if (!UI || !UI.say || !M) return;
  const st = M.st, over = E.over(st);
  let html;
  if (over){
    if (over.draw){
      html = esc(T('The board is full — a shared top.', 'It-tabellun mimli — quċċata maqsuma.'));
    } else {
      const w = over.winner;
      const dot = '<span class="dot" style="background:' + discColour(w).hex + '"></span>';
      const who = isLocal(w) ? T('You win!', 'Rbaħt int!') : esc(seatName(w)) + ' ' + T('wins', 'jirbaħ');
      html = dot + '<b>' + who + '</b> — ' + esc(over.counts[w] + ' ' + T('discs', 'diski'));
    }
  } else {
    const turn = E.turn(st);
    const dot = '<span class="dot" style="background:' + discColour(turn).hex + '"></span>';
    const mine = isLocal(turn);
    const who = mine ? T('Your turn', 'Imissek')
      : ownerOf(turn) === 'ai' ? levelName(seatLvl(turn)) + ' ' + T('is thinking', 'qed jaħseb')
      : esc(seatName(turn)) + ' ' + T('to play', 'jilgħab');
    html = dot + (mine ? '<b>' + who + '</b>' : who);
  }
  UI.say.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════════════
   AFTER A MOVE — voice the seats, check for the end, else let the machine
   think if it is its turn. (Passes are handled inside the engine's
   turn-advance; the UI never needs to issue one.)
   ═══════════════════════════════════════════════════════════════════ */
function afterMove(){
  if (!M || M.dead) return;
  paintSeats();
  drawStatic();
  if (E.over(M.st)){ finish(); return; }
  maybeThink();
}

function maybeThink(){
  if (!M || M.dead || M.timer || M.anim) return;
  const st = M.st;
  if (E.over(st)) return;
  const seat = E.turn(st);
  if (ownerOf(seat) !== 'ai') return;
  if (M.net && !M.net.iAmHost) return;    /* online: only the host drives bots */
  const delay = reduced() ? 60 : 440;
  M.timer = setTimeout(() => {
    M.timer = 0;
    if (!M || M.dead || M.anim){ if (M) maybeThink(); return; }
    const st2 = M.st;
    if (E.over(st2) || ownerOf(E.turn(st2)) !== 'ai'){ drawStatic(); return; }
    const s2 = E.turn(st2);
    const mv = E.think(st2, s2, seatLvl(s2));
    if (!mv){ drawStatic(); return; }     /* no move: engine already skipped */
    commitPlace(s2, mv.r, mv.c, 'local');
  }, delay);
}

/* ═══════════════════════════════════════════════════════════════════
   THE END — into the shared AAA winner screen (js/rebbieh.js). One row
   per seat, ranked by disc count; ties share a place.
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
    if (ov.draw && iWon) ST.rec.d = (ST.rec.d | 0) + 1;   /* shared top counts as a draw */
    else if (iWon) ST.rec.w++;
    else if (me >= 0) ST.rec.l++;
    persist();
  }
  saveSlot(null);

  /* rank seats by disc count (desc); equal counts share a place */
  const order = [];
  for (let i = 0; i < seatCount(); i++) order.push(i);
  order.sort((a, b) => ov.counts[b] - ov.counts[a]);
  let place = 0, lastCnt = null;
  const rows = order.map((seat, i) => {
    if (lastCnt === null || ov.counts[seat] < lastCnt){ place = i + 1; lastCnt = ov.counts[seat]; }
    const isMe = isLocal(seat);
    return {
      name: isMe ? T('You', 'Int')
        : ownerOf(seat) === 'ai' ? levelName(seatLvl(seat))
        : seatName(seat),
      place,
      you: isMe,
      bot: ownerOf(seat) === 'ai',
      score: ov.counts[seat] + ' ' + T('discs', 'diski'),
      border: discColour(seat).border
    };
  });

  const net = M.net;
  const title = ov.draw
    ? (iWon ? T('Shared top!', 'Quċċata maqsuma!') : T('A shared top', 'Quċċata maqsuma'))
    : iWon ? T('You flipped the most!', 'Aqlibt l-aktar!')
    : (me >= 0) ? T('Beaten', 'Mirbuħ')
    : discName(ov.winner) + ' ' + T('wins', 'jirbaħ');

  const show = window.KARTI_REBBIEH && window.KARTI_REBBIEH.show;
  if (!show){
    P.ui.result(M.ctx, {
      tone: iWon ? 'win' : 'lose',
      head: title,
      why:  T('Most discs of your colour takes the board.',
              'L-aktar diski tal-lewn tiegħek jieħdu t-tabellun.'),
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
    subtitle: T('Final count', 'L-għadd finali'),
    rows,
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
  if (M && M.pulseRaf){ cancelAnimationFrame(M.pulseRaf); M.pulseRaf = 0; }
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
    T('Take turns placing <b>one disc</b> of your colour on an empty square. Two, three or four ' +
      'players — each a different colour.',
      'Bir-rotazzjoni poġġi <b>diska waħda</b> tal-lewn tiegħek f’kaxxa vojta. Tnejn, tlieta jew ' +
      'erba’ plejers — kull wieħed lewn ieħor.'),
    T('Your disc must <b>trap a straight line</b> of other colours between the new disc and one of ' +
      'yours already on the board — across, up-down, or diagonally. Every trapped disc <b>flips</b> ' +
      'to your colour.',
      'Id-diska tiegħek trid <b>taqbad ringiela dritta</b> ta’ lwien oħra bejn id-diska l-ġdida u ' +
      'waħda tiegħek diġà fuq it-tabellun — bil-wisa’, ’il fuq-isfel, jew djagonali. Kull diska ' +
      'maqbuda <b>tinqaleb</b> għal-lewn tiegħek.'),
    T('A move is only allowed if it <b>flips at least one</b> disc. If you cannot move, your turn ' +
      'is <b>passed</b> automatically.',
      'Mossa titħalla biss jekk <b>taqleb tal-anqas waħda</b>. Jekk ma tistax timxi, it-turn ' +
      'tiegħek <b>jgħaddi</b> waħdu.'),
    T('The game ends when the board is full or nobody can move. <b>Most discs wins</b> — a tie ' +
      'shares the top.',
      'Il-logħba tispiċċa meta t-tabellun jimtela jew ħadd ma jista’ jimxi. <b>L-aktar diski ' +
      'jirbaħ</b> — indaqs jaqsam il-quċċata.'),
    T('A tip: the <b>corners</b> can never be flipped back — grab them and hold your edges.',
      'Parir: l-<b>irkejjen</b> qatt ma jistgħu jinqalbu lura — aqbadhom u żomm it-truf tiegħek.')
  ];
}
function paintRules(){
  if (!UI || !UI.rules) return;
  UI.rules.querySelector('#aq-rules-t').textContent =
    T('Flip It', 'Aqleb') + ' — ' + T('the rules', 'ir-regoli');
  UI.rules.querySelector('#aq-rules-b').innerHTML =
    '<ul style="margin:0;padding:0">' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul>';
  UI.rules.classList.toggle('open', rulesOpen);
  UI.rules.setAttribute('aria-hidden', rulesOpen ? 'false' : 'true');
  const rb = M && M.ctx && M.ctx.btn && M.ctx.btn('aq-rules');
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
   PHONE, and "How to play". No settings on screen one; player count and
   difficulty are a tiny second step. Back goes to the hub, no confirm.
   ═══════════════════════════════════════════════════════════════════ */
function heroSVG(){
  /* a small board with a few discs, one mid-flip — the game worn as a badge */
  const n = 6, cell = 24, pad = 10;
  const w = n * cell + pad * 2, h = w;
  let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<defs>' +
      '<radialGradient id="aqh-g" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#FFE08A"/>' +
        '<stop offset="60%" stop-color="#FFC542"/><stop offset="100%" stop-color="#C89211"/></radialGradient>' +
      '<radialGradient id="aqh-i" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#A7E0FF"/>' +
        '<stop offset="60%" stop-color="#4FB6FF"/><stop offset="100%" stop-color="#1E6FB8"/></radialGradient>' +
    '</defs>' +
    '<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="14" fill="#123024" ' +
      'stroke="rgba(0,0,0,.5)" stroke-width="1"/>';
  /* grid */
  for (let i = 0; i <= n; i++){
    const p = pad + i * cell;
    s += '<line x1="' + pad + '" y1="' + p + '" x2="' + (pad + n * cell) + '" y2="' + p + '" stroke="rgba(255,197,66,.2)" stroke-width="1"/>';
    s += '<line x1="' + p + '" y1="' + pad + '" x2="' + p + '" y2="' + (pad + n * cell) + '" stroke="rgba(255,197,66,.2)" stroke-width="1"/>';
  }
  /* a scatter of discs, gold vs ice, with one caught mid-flip (a thin ellipse) */
  const seed = [ [1,1,'g'],[1,2,'i'],[2,1,'i'],[2,2,'g'],[2,3,'g'],[3,2,'i'],[3,3,'g'],[1,3,'i'],[4,3,'g'] ];
  seed.forEach(d => {
    const x = pad + d[1] * cell + cell/2, y = pad + d[0] * cell + cell/2;
    s += '<circle cx="' + x + '" cy="' + y + '" r="' + (cell*0.38) + '" fill="url(#aqh-' + d[2] + ')"/>';
  });
  /* a disc mid-flip (edge-on ellipse) at (3,1) */
  const fx = pad + 1 * cell + cell/2, fy = pad + 3 * cell + cell/2;
  s += '<ellipse cx="' + fx + '" cy="' + fy + '" rx="' + (cell*0.13) + '" ry="' + (cell*0.38) + '" fill="url(#aqh-i)"/>';
  return s + '</svg>';
}

function setupSheet(){
  injectCSS();
  P.show();
  stopThinking(); M = null; UI = null;
  const el = P.ui.screenEl();
  const online = canGoOnline();

  el.innerHTML =
    '<div class="pt-wrap aq-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="aq-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + esc(T('Flip It', 'Aqleb')) + '</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="aq-hero" aria-hidden="true">' + heroSVG() +
        '<span class="aq-hero-cap">8 &times; 8</span></div>' +
      '<p class="blurb">' +
        T('Place a disc, trap a line, flip it to your colour. Two to four players race to own the ' +
          'most of the board. No luck — just the corners and your nerve.',
          'Poġġi diska, aqbad ringiela, aqlibha għal-lewn tiegħek. Tnejn sa erba’ plejers ' +
          'jiġġieldu għall-akbar biċċa tat-tabellun. Ebda xorti — l-irkejjen u l-kuraġġ tiegħek.') +
      '</p>' +

      (ST.save
        ? '<button class="btn primary" id="aq-res" style="margin:2px 0 12px">' +
          esc(T('Carry on the saved game', 'Kompli l-logħba mħażna')) + '</button>'
        : '') +

      '<div class="aq-modes" style="display:grid;gap:9px;margin-top:4px">' +
        (online
          ? '<button class="btn primary" id="aq-online">' + ico('users') + ' ' +
            esc(T('Play online', 'Ilgħab onlajn')) + '</button>'
          : '') +
        '<button class="btn' + (online ? ' ghost' : ' primary') + '" id="aq-ai">' +
          ico('coach') + ' ' + esc(T('Play with the machine', 'Ilgħab mal-magna')) + '</button>' +
        '<button class="btn ghost" id="aq-pnp">' + ico('users') + ' ' +
          esc(T('Pass the phone', 'Għaddi t-telefon')) + '</button>' +
        '<button class="btn ghost" id="aq-rulesbtn">' + ico('book') + ' ' +
          esc(T('How to play', 'Kif tilgħab')) + '</button>' +
      '</div>' +

      (ST.rec.w + ST.rec.l + (ST.rec.d | 0)
        ? '<p class="pt-ledger" style="margin-top:14px">' +
          T('So far: <b>' + ST.rec.w + '</b> won, <b>' + ST.rec.l + '</b> lost' +
            ((ST.rec.d | 0) ? ', <b>' + (ST.rec.d | 0) + '</b> shared' : '') + '.',
            'S’issa: <b>' + ST.rec.w + '</b> rebħin, <b>' + ST.rec.l + '</b> mitlufin' +
            ((ST.rec.d | 0) ? ', <b>' + (ST.rec.d | 0) + '</b> maqsuma' : '') + '.') +
          '</p>'
        : '') +
    '</div>' +

    '<div class="aq-rules" id="aq-menurules" aria-hidden="true">' +
      '<div class="aq-rules-h"><h4>' + esc(T('Flip It', 'Aqleb')) + ' — ' +
        esc(T('the rules', 'ir-regoli')) + '</h4>' +
        '<button class="aq-rules-x" id="aq-menurules-x" aria-label="' + esc(T('Close', 'Agħlaq')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button></div>' +
      '<div class="aq-rules-b"><ul style="margin:0;padding:0">' +
        rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul></div>' +
    '</div>' +
    '</div>';

  el.querySelector('#aq-back').onclick = () => { cue('ui.back'); P.hub(); };
  const on = el.querySelector('#aq-online');
  if (on) on.onclick = () => { if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('aqleb'); };
  el.querySelector('#aq-ai').onclick  = () => offlineSetup('ai');
  el.querySelector('#aq-pnp').onclick = () => offlineSetup('pnp');
  const rs = el.querySelector('#aq-res');
  if (rs) rs.onclick = () => { if (ST.save) newGame(null, ST.save); };

  const rules = el.querySelector('#aq-menurules');
  const openRules = o => {
    rules.classList.toggle('open', o);
    rules.setAttribute('aria-hidden', o ? 'false' : 'true');
    cue(o ? 'ui.sheet' : 'ui.back', { gain:0.8 });
  };
  el.querySelector('#aq-rulesbtn').onclick = () => openRules(!rules.classList.contains('open'));
  el.querySelector('#aq-menurules-x').onclick = () => openRules(false);

  if (window.KARTI_LANG && KARTI_LANG.onChange && !setupSheet._sub){
    setupSheet._sub = KARTI_LANG.onChange(() => {
      try { if (!M && el.isConnected && el.querySelector('#aq-ai')) setupSheet();
            else if (M && UI){ paintSeats(); drawStatic(); paintRules(); } } catch(e){}
    });
  }
}

/* the ONE small step after PLAY WITH AI / PASS THE PHONE — player count
   (2/3/4), and for AI the difficulty. Not a settings wall. A big START. */
function offlineSetup(mode){
  injectCSS();
  P.show();
  const el = P.ui.screenEl();
  const p = pref();
  let seats = Math.max(2, Math.min(4, p.seats || 2));
  let lvl   = p.lvl || 2;
  let humans = mode === 'pnp' ? Math.max(2, Math.min(seats, p.humans || 2)) : 1;

  function paint(){
    if (mode === 'pnp') humans = Math.max(2, Math.min(seats, humans));
    el.innerHTML =
      '<div class="pt-wrap aq-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="aq-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(mode === 'pnp' ? T('Pass the phone', 'Għaddi t-telefon')
                                    : T('Play the machine', 'Ilgħab mal-magna')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<div class="aq-hero" aria-hidden="true">' + heroSVG() +
          '<span class="aq-hero-cap">' + seats + ' &times;</span></div>' +

        '<div class="tiny pt-lbl">' + esc(T('How many at the board', 'Kemm mal-tabellun')) + '</div>' +
        '<div class="aq-step">' +
          '<button class="aq-rnd" id="aq-dn"' + (seats <= 2 ? ' disabled' : '') +
            ' aria-label="' + esc(T('Fewer players', 'Inqas plejers')) + '">&minus;</button>' +
          '<span class="v">' + seats + '<i>' + esc(T('players', 'plejers')) + '</i></span>' +
          '<button class="aq-rnd" id="aq-up"' + (seats >= 4 ? ' disabled' : '') +
            ' aria-label="' + esc(T('More players', 'Aktar plejers')) + '">+</button>' +
        '</div>' +

        (mode === 'pnp'
          ? '<div class="tiny pt-lbl" style="margin-top:8px">' +
              esc(T('How many of them are people', 'Kemm minnhom huma nies')) + '</div>' +
            '<div class="aq-step">' +
              '<button class="aq-rnd" id="aq-hdn"' + (humans <= 2 ? ' disabled' : '') +
                ' aria-label="' + esc(T('Fewer people', 'Inqas nies')) + '">&minus;</button>' +
              '<span class="v">' + humans + '<i>' + esc(T('people', 'nies')) + '</i></span>' +
              '<button class="aq-rnd" id="aq-hup"' + (humans >= seats ? ' disabled' : '') +
                ' aria-label="' + esc(T('More people', 'Aktar nies')) + '">+</button>' +
            '</div>' +
            (humans < seats
              ? '<p class="aq-note" style="margin-top:6px">' +
                esc(T('The other ' + (seats - humans) + ' ' +
                      (seats - humans === 1 ? 'seat is' : 'seats are') + ' the machine.',
                      'L-oħra huma l-magna.')) + '</p>'
              : '')
          : '<div class="tiny pt-lbl" style="margin-top:8px">' +
              esc(T('How sharp is the machine', 'Kemm hi taħraq il-magna')) + '</div>' +
            '<div class="pt-opts" id="aq-lvl">' + levels().map(o =>
              '<button class="pt-opt' + (o.level === lvl ? ' on' : '') + '" data-lvl="' + o.level + '">' +
              ico(o.icon || ('diff-' + Math.min(3, o.level))) +
              '<b>' + esc(o.name) + '</b><i>' + esc(TE(o.note)) + '</i></button>').join('') +
            '</div>') +

        '<div class="pt-acts" style="margin-top:18px;display:grid;gap:9px">' +
          '<button class="btn primary" id="aq-go">' +
            esc(mode === 'pnp'
              ? T('Start', 'Ibda')
              : T('Play — you vs ' + (seats - 1) + ' machine' + (seats - 1 === 1 ? '' : 's'),
                  'Ilgħab — int kontra ' + (seats - 1) + ' magn' + (seats - 1 === 1 ? 'a' : 'i'))) +
          '</button>' +
        '</div>' +
      '</div></div>';

    el.querySelector('#aq-back').onclick = () => { cue('ui.back'); setupSheet(); };
    el.querySelector('#aq-dn').onclick = () => { if (seats > 2){ seats--; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    el.querySelector('#aq-up').onclick = () => { if (seats < 4){ seats++; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    const hdn = el.querySelector('#aq-hdn'), hup = el.querySelector('#aq-hup');
    if (hdn) hdn.onclick = () => { if (humans > 2){ humans--; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    if (hup) hup.onclick = () => { if (humans < seats){ humans++; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { lvl = +b.dataset.lvl; cue('ui.tap', { gain:0.8 }, true); paint(); });
    el.querySelector('#aq-go').onclick = () => {
      pref({ seats, lvl, humans: mode === 'pnp' ? humans : 1 });
      newGame({ seats, humans: mode === 'pnp' ? humans : 1, lvl });
    };
  }
  paint();
}

function canGoOnline(){
  try {
    const MP = window.KARTI_MP;
    return !!(MP && MP.openFor && P.online && P.online.aqleb);
  } catch(e){ return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   START A LOCAL GAME. meta stamps who owns each seat (the engine only
   knows seat indices). For AI: seat 0 is the human, the rest are the
   machine. For pass-the-phone: the first `humans` seats are people, the
   rest are the machine.
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
    startMatch({ seats: opts.seats || 2, lvl: opts.lvl || 2 }, null);
    meta = defaultMeta(opts);
  }
  M.meta = meta;
  applyMeta();
  M.finished = false;
  openBoard(() => setupSheet());
  cue('game.start', { gain:0.9 }, true);
  afterMove();      /* if the machine has seat 0, let it open */
}
function defaultMeta(opts){
  opts = opts || {};
  const seats = Math.max(2, Math.min(4, opts.seats || 2));
  const lvl = opts.lvl || 2;
  const humans = (opts.humans | 0) || 1;
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
   THE ONLINE CONTROLLER — KARTI_PARTY.online.aqleb. js/mp.js is the only
   caller. Reversi has no hidden state and no seeded play, so this is a
   simple turn-based controller: start() puts the board on screen,
   remote(seat, move) applies a wire move through the engine gate,
   note()/stop() are the two things the transport may say.
   ═══════════════════════════════════════════════════════════════════ */
const hooks = {
  /* js/mp.js subscribes with (move, { seat, src }) — the shape skarta/
     tankijiet hand it — while our own feed fires ONE {seat, move, index,
     src} event. Adapt here: without this, mp.js received the whole event
     object as the move, toWire() found no `t` on it, and the table was
     stopped with "a move would not fit on the wire" on the FIRST local
     placement (and net-echoed moves were never filtered either). Game
     seats and room seats are the same numbers for aqleb (onlineStart
     seats the table straight off cfg.seats), so no toRoom mapping. */
  onMove(fn){
    const f = ev => { if (ev) fn(ev.move, { seat: ev.seat, src: ev.src }); };
    moveSubs.push(f);
    return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); };
  },
  phase(){ return M ? 'play' : 'idle'; },
  apply(seat, move){ if (!M) return { ok:false, why:'no aqleb' }; return onlineRemote(seat, move); },
  attachNet(net){ if (M){ M.net = net || null; maybeThink(); } },
  setOwner(i, own){ if (M && M.meta && M.meta[i]){ M.meta[i].own = own; } },
  setName(i, name){ if (M && M.meta && M.meta[i] && name){ M.meta[i].name = name; } },
  live(){ return !!(M && !M.dead && !E.over(M.st)); },
  seatBack(){ if (M){ paintSeats(); drawStatic(); } }
};

function onlineStart(cfg){
  cfg = cfg || {};
  injectCSS();
  P.show();
  const seats = (cfg.seats && cfg.seats.length) || (cfg.opts && cfg.opts.seats) || 2;
  /* ALWAYS the relay's shared seed, coerced (>>>0 maps a missing seed to 0
     on every phone alike) — never startMatch's per-client newSeed()
     fallback, so every phone's match record is identical. */
  startMatch({ seats: Math.max(2, Math.min(4, seats)), lvl: 2 }, cfg.seed >>> 0);
  const list = cfg.seats || [];
  M.meta = [];
  for (let i = 0; i < seatCount(); i++){
    const s = list[i] || {};
    const own = (i === cfg.you) ? 'me' : (s.own === 'ai' || s.kind === 'cpu') ? 'ai' : 'net';
    M.meta.push({ own, name: s.name || discName(i), lvl: s.level || 2 });
  }
  applyMeta();
  M.net = cfg.net || null;
  M.finished = false;
  openBoard(() => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); });
  hooks.attachNet(cfg.net || null);
  afterMove();
  return snapshot();
}
function onlineRemote(seat, move){
  if (!M) return { ok:false, why:'no aqleb on the table' };
  if (E.over(M.st)) return { ok:false, why:'the game is over' };
  const dec = E.decWire ? (E.decWire(move) || move) : move;
  if (M.anim){
    const res = doMove(seat, dec, 'net');
    if (!res.ok) return { ok:false, why: res.err || 'that move did not fit the rules' };
    drawStatic(); afterMove();
    return { ok:true };
  }
  if (!E.check(M.st, dec, seat)) return { ok:false, why:'that move did not fit the rules' };
  commitPlace(seat, dec.r, dec.c, 'net');
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
    quip: T('Nobody lost anything.', 'Ħadd ma tilef xejn.'),
    buttons: [{ label:T('Back to the rooms', 'Lura fil-kmamar'), icon:'back', cls:'primary',
                go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
  });
}

P.online = P.online || {};
P.online.aqleb = {
  start: onlineStart,
  remote: onlineRemote,
  note: onlineNote,
  stop: onlineStop,
  live: () => !!(M && !M.dead && hooks.live()),
  hooks
};

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — window.KARTI_AQLEB.lobby. Read by js/mp.js. Two to
   four seats; a ready table of 2..4 can start.
   ═══════════════════════════════════════════════════════════════════ */
const LOBBY = {
  id:'aqleb',
  name:'Flip It',
  mt:'Aqleb',
  minSeats: E.MIN_SEATS,
  maxSeats: E.MAX_SEATS,
  levels: levels().map(L => ({ level:L.level, name:L.name, note:TE(L.note) })),
  defaultLevel: 2,
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    const n = (seatList || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why: T('Flip It needs at least two.', 'Aqleb irid tal-anqas tnejn.') };
    if (n > E.MAX_SEATS) return { ok:false, why: T('Up to four can play.', 'Sa erbgħa jistgħu jilagħbu.') };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready) return { ok:false, why: unready + (unready > 1
        ? T(' people are not ready yet.', ' persuni għadhom mhux lesti.')
        : T(' person is not ready yet.', ' persuna għadha mhux lesta.')) };
    return { ok:true, why:'' };
  },
  rulesHTML: () =>
    '<p>' + T('Two to four players take turns placing a disc that traps a straight line of other ' +
      'colours between it and one of their own; every trapped disc flips to their colour.',
      'Tnejn sa erbgħa jpoġġu diska li taqbad ringiela dritta ta’ lwien oħra bejnha u waħda ' +
      'tagħhom; kull diska maqbuda tinqaleb għal-lewn tagħhom.') + '</p>' +
    '<p>' + T('Most discs when the board fills wins. No luck and nothing hidden — every phone ' +
      'flips the identical discs, so online is as honest as across a table.',
      'L-aktar diski meta jimtela t-tabellun jirbaħ. Ebda xorti u xejn moħbi — kull telefon ' +
      'jaqleb l-istess diski, mela onlajn hu daqstant onest daqs wiċċ imb wiċċ.') + '</p>',
  blurb: T('Trap a line, flip it. Two to four, all skill.',
           'Aqbad ringiela, aqlibha. Tnejn sa erbgħa, kollox ħila.'),
  start(seats, opts){
    /* the offline twin: two people at one phone by default */
    const n = (seats && seats.length) || 2;
    return newGame(Object.assign({ seats: Math.max(2, Math.min(4, n)), humans: Math.max(2, Math.min(4, n)),
                                   lvl:(pref().lvl || 2) }, opts || {}));
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
  id:'aqleb', order:28, kind:'board', cat:'board',
  name:'Flip It', mt:'Aqleb', icon:'drop', status:'live',
  get tag(){
    return T('Place a disc, trap a line, flip it to your colour. Two to four players race for the ' +
             'most of the board — no luck, all corners and nerve.',
             'Poġġi diska, aqbad ringiela, aqlibha għal-lewn tiegħek. Tnejn sa erbgħa għall-akbar ' +
             'biċċa tat-tabellun — ebda xorti, l-irkejjen u l-kuraġġ.') +
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

/* ── test hooks — inert unless the page is opened with ?aqlebtest ────── */
if (/[?&]aqlebtest\b/.test(location.search || '')){
  window.__AQLEB_TEST = {
    setupSheet, newGame, offlineSetup, commitPlace, tryPlace, drawStatic,
    afterMove, maybeThink,
    allBotsGo(){ if (M && M.meta){ M.meta.forEach(m => { if (m.own === 'me' || m.own === 'hot') m.own = 'ai'; }); afterMove(); } },
    get M(){ return M; }, get UI(){ return UI; },
    engine: E, LOBBY, hooks, online: P.online.aqleb, leave,
    cellAt, reduced
  };
}

})();
