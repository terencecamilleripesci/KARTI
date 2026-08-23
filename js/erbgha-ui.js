/* ═══════════════════════════════════════════════════════════════════
   KARTI — erbgha-ui.js
   ERBGĦA F'RINGIELA (Connect 4) — the tappable game on top of
   js/erbgha.js's pure engine (window.KARTI_ERBGHA.engine). This file is
   the screen, the runner and the wire, and it follows js/ludu-ui.js's
   shape deliberately: a match is (opts, seed, log), every move goes
   through one doMove() gate, and a rollback is cutting the log and
   replaying it.

   WHAT THIS FILE IS
     · the shelf tile and the MINIMAL entry menu — a themed hero, three
       big buttons (PLAY ONLINE / PLAY WITH AI / PASS THE PHONE) and a
       "How to play" that slides the rules up; difficulty is a tiny
       second step after PLAY WITH AI, never a settings wall on screen one
     · the board: a canvas grid drawn in the seat colours, a hovering
       ghost disc over the column under the thumb, and THE HERO — a disc
       that falls from the top and SETTLES with gravity and a small bounce
       into its slot, compositor-friendly per-frame canvas on rAF at 60fps
     · the runner: log, seed, autosave (karti_erbgha_v1)
     · the online controller published on KARTI_PARTY.online.erbgha and
       the lobby contract on window.KARTI_ERBGHA.lobby, both exactly the
       shape js/mp.js reads (see js/ludu-ui.js / js/kanun-ui.js)

   WHY CANVAS, NOT DOM/SVG, FOR THE DROP
     The drop is the hero. A disc falling six rows and bouncing wants a
     per-frame position with easing that DOM transitions cannot express
     cleanly (a bounce is not a cubic-bezier). One canvas, one rAF loop,
     every frame is a transform of pixels the compositor uploads once —
     no layout, no reflow, 60fps on a phone. The static board is redrawn
     each frame too, which is nothing at ~42 discs. Reduced motion skips
     the fall entirely: the disc is painted settled at once.

   HOUSE RULES OBEYED
     · borrows #scr-party through KARTI_PARTY, injects its own CSS once,
       never touches css/ or the tab bar's ancestors;
     · sounds only through KARTI_SFX ids that already exist (piece.slide
       / piece.place for the land, game.win for the flourish);
     · every player-visible string is a T(en,mt) pair at its call site
       — js/lang.js's rule — and the engine's {en,mt} note is rendered
       here, never printed as an id;
     · the back arrow goes BACK. It never asks "are you sure": the game
       is autosaved on every move and the menu offers it again at the top.

   ONLINE IS HONEST BY CONSTRUCTION. Connect 4 has no hidden state and no
   seed-dependent play — both phones drop discs onto the identical shared
   board from the same list of columns. The seed only tunes the machine's
   tie-break, and an online table has no machine driving the human seats.
   So the online controller relays a bare column through encWire/decWire
   and the engine (the referee) gates it. Nothing to reveal, nothing to
   hide.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_ERBGHA;
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
   THE TWO DISC COLOURS — seat 0 is red, seat 1 is yellow, the two
   Connect 4 colours everybody already knows. Legible on the deep board
   and told apart at a glance even by someone who cannot see red/green.
   ═══════════════════════════════════════════════════════════════════ */
const DISCS = [
  { id:'red',    hex:'#F0384B', hi:'#FF6D7C', lo:'#B01625', name:{ en:'Red',    mt:'Aħmar' } },
  { id:'yellow', hex:'#FFC542', hi:'#FFE08A', lo:'#C89211', name:{ en:'Yellow', mt:'Isfar' } }
];
const discColour = seat => DISCS[seat] || DISCS[0];
const discName   = seat => TE(discColour(seat).name);

/* ═══════════════════════════════════════════════════════════════════
   OUR CORNER OF localStorage — the save, the prefs and the record, the
   ludu/poker way: one key, debounced, flushed inline when the tab hides.
   ═══════════════════════════════════════════════════════════════════ */
const STORE  = 'karti_erbgha_v1';
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

/* UI-only prefs — folding the rules is not the game */
const UIKEY = 'karti_erbgha_ui_v1';
let rulesOpen = false;
try { rulesOpen = localStorage.getItem(UIKEY + '.rules') === '1'; } catch(e){}

/* the machine's sharpnesses, off the engine's LEVELS */
function levels(){ return (E.LEVELS || []).map(L => ({ level:L.k, name:L.name, note:L.note, icon:L.icon })); }
function levelName(k){ const L = levels().find(x => x.level === k); return (L && L.name) || 'MAKNA'; }
function levelNote(k){ const L = levels().find(x => x.level === k); return L ? TE(L.note) : ''; }

/* ═══════════════════════════════════════════════════════════════════
   SOUND — existing ids only (read js/sfx.js), through one gate so a fast
   run does not machine-gun the mixer. The drop land is piece.slide then
   piece.place as it settles; the win is game.win.
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
let M = null;      /* the live match     */
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
    hover: -1,                /* the column the ghost disc floats over */
    skins: {},                /* seat → exclusive-set wire byte          */
    exclSaid: false           /* my byte goes out once, on my first drop */
  };
  M.st = buildState(M.opts, M.seed, M.log);
  applyMeta();
  return M;
}
function applyMeta(){
  if (!M || !M.meta || !M.st) return;
  M.meta.forEach((m, i) => {
    if (!m) return;
    M.st['seat' + i] = m;      /* ownership/name book kept beside the engine state */
  });
}
function stopThinking(){ if (M && M.timer){ clearTimeout(M.timer); M.timer = 0; } }

/* ownership lives in the UI (the engine only knows seats). meta[i] =
   { own:'me'|'hot'|'ai'|'net', name, lvl } */
function ownerOf(i){
  if (!M || !M.meta || !M.meta[i]) return 'ai';
  return M.meta[i].own || 'ai';
}
const isLocal = i => { const o = ownerOf(i); return o === 'me' || o === 'hot'; };

/* ═══════════════════════════════════════════════════════════════════
   NEON DROP (erbgha.*.excl) — who glows on this board.
   Discs are a PLAYER's pieces, so they travel: my equipped set rides my
   first drop as the appended `e` wire byte (see WIRE_FIELDS in
   js/erbgha.js) and lands in M.skins, seat → byte, so both phones light
   that seat's discs. The BOARD is the shared cabinet both players look
   at, so it stays the local choice and never travels. A neon disc keeps
   its SEAT COLOUR — red glows magenta-red, yellow glows electric gold —
   because red-versus-yellow IS the game.
   ═══════════════════════════════════════════════════════════════════ */
function xEq(slot){
  try {
    const XP = window.KARTI_XP;
    return !!XP && XP.equipped(slot, 'erbgha') === 'erbgha.' + slot + '.excl';
  } catch(e){ return false; }
}
function neonSeat(seat){
  if (!M) return false;
  if (ownerOf(seat) === 'me') return xEq('discs');
  return !!(M.skins && M.skins[seat] === 1);
}
const NEON_DISCS = [
  { hex:'#FF2E6C', hi:'#FF9CBC', lo:'#8E0F3A', glow:'#FF3EA5' },
  { hex:'#FFD54A', hi:'#FFF3A6', lo:'#B78A00', glow:'#FFE066' }
];
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
  const out = clone(move);
  /* my exclusive-set byte rides my FIRST outgoing drop — once, tagged on
     the fired clone only (never the log, never the engine) */
  if (M.net && (src || 'local') !== 'net' && ownerOf(seat) === 'me' && !M.exclSaid){
    M.exclSaid = true;
    if (xEq('discs')) out.e = 1;
  }
  fireList(moveSubs,  { seat, move:out, index:idx, src:src || 'local', landed:M.st.last });
  fireList(stateSubs, { reason:'move', index:idx });
  return { ok:true, index:idx };
}

function snapshot(){
  if (!M) return null;
  return { v:SAVE_V, gid:'erbgha', opts:clone(M.opts), seed:M.seed, log:clone(M.log), meta:clone(M.meta || null) };
}
function autosave(){
  if (!M || M.net) return;
  if (E.over(M.st)){ saveSlot(null); return; }
  saveSlot(snapshot());
}

/* ═══════════════════════════════════════════════════════════════════
   THE SOUND OF A MOVE — one subscriber. The land is voiced by the drop
   animation itself (so it lands with the pixels), not here, to keep the
   thud in sync with the bounce. This subscriber only handles the
   non-animated cases (reduced motion) and the win flourish.
   ═══════════════════════════════════════════════════════════════════ */
moveSubs.push(ev => {
  if (!M || M.dead) return;
  if (ev.move && ev.move.t === 'drop' && reduced()){
    cue('piece.place', { gain: 0.8 }, true);
  }
});

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party. The identity is
   a deep indigo cabinet with two warm disc colours — a Maltese każin
   table, not a plastic toy. The board is a canvas; everything around it
   (seats, status, rules) is DOM.
   ═══════════════════════════════════════════════════════════════════ */
let cssDone = false;
function injectCSS(){
  if (cssDone || document.getElementById('e4-runtime-css')){ cssDone = true; return; }
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'e4-runtime-css';
  st.textContent =
    '#scr-party{--e4-board:#241A3E;--e4-board2:#150F28;--e4-gold:var(--gold,#FFC542);' +
      '--e4-red:#F0384B;--e4-yel:#FFC542}' +

    '#scr-party .pt-host.e4-host{align-items:stretch;justify-content:stretch;overflow:visible}' +
    '#scr-party .e4-wrap{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;' +
      'gap:6px;padding:6px 6px 7px;position:relative}' +

    /* ── the two seat chips across the top ── */
    '#scr-party .e4-seats{flex:0 0 auto;display:flex;gap:8px;justify-content:center;' +
      'padding:2px 2px 1px}' +
    '#scr-party .e4-seat{flex:0 1 auto;position:relative;display:flex;align-items:center;gap:8px;' +
      'min-width:0;padding:5px 12px 5px 6px;border-radius:12px;' +
      'background:rgba(0,0,0,.30);border:1px solid rgba(255,255,255,.09);transition:border-color .2s}' +
    '#scr-party .e4-seat.on{background:rgba(255,197,66,.14);border-color:rgba(255,197,66,.6)}' +
    '#scr-party .e4-seat .sw{width:20px;height:20px;flex:0 0 auto;border-radius:50%;' +
      'box-shadow:inset 0 2px 0 rgba(255,255,255,.45),inset 0 0 0 1.5px rgba(0,0,0,.3),0 1px 3px rgba(0,0,0,.5)}' +
    '#scr-party .e4-seat .col{display:flex;flex-direction:column;gap:1px;min-width:0}' +
    '#scr-party .e4-seat .n{font:900 10px/1.1 var(--disp);letter-spacing:.05em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.74);max-width:120px;white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .e4-seat.on .n{color:var(--e4-gold)}' +
    '#scr-party .e4-seat .h{font:700 8.5px/1.1 var(--disp);letter-spacing:.02em;color:rgba(255,255,255,.5)}' +

    /* ── the board box holds the canvas, sized to the biggest 7:6 that fits ── */
    '#scr-party .e4-boardbox{flex:1 1 auto;min-height:0;position:relative;display:flex;' +
      'align-items:center;justify-content:center}' +
    '#scr-party .e4-canv{display:block;touch-action:manipulation;-webkit-tap-highlight-color:transparent;' +
      'border-radius:16px;filter:drop-shadow(0 10px 26px rgba(0,0,0,.5));cursor:pointer}' +

    /* ── the status line + the drop hint under the board ── */
    '#scr-party .e4-say{flex:0 0 auto;font:700 12px/1.4 var(--body);text-align:center;' +
      'color:rgba(255,255,255,.85);min-height:17px;padding:0 8px}' +
    '#scr-party .e4-say b{color:var(--e4-gold);font-weight:900}' +
    '#scr-party .e4-say .dot{display:inline-block;width:11px;height:11px;border-radius:50%;' +
      'vertical-align:-1px;margin-right:5px;box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}' +

    /* ── the rules panel: slide from the top, never a wall ── */
    '#scr-party .e4-rules{position:absolute;top:0;left:0;right:0;z-index:30;max-height:64%;' +
      'display:flex;flex-direction:column;border-radius:14px;overflow:hidden;' +
      'background:linear-gradient(180deg,#2A1F49,#140E26);border:1px solid rgba(255,255,255,.16);' +
      'box-shadow:0 14px 30px rgba(0,0,0,.55);' +
      'transform:translateY(-108%);opacity:0;visibility:hidden;pointer-events:none;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease),visibility 0s .26s}' +
    '#scr-party .e4-rules.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease)}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .e4-rules{transition:none}}' +
    'body.reduced #scr-party .e4-rules{transition:none}' +
    '#scr-party .e4-rules-h{flex:0 0 auto;display:flex;align-items:center;' +
      'justify-content:space-between;padding:9px 4px 2px 14px}' +
    '#scr-party .e4-rules-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--e4-gold)}' +
    '#scr-party .e4-rules-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;' +
      'color:var(--txt);cursor:pointer;display:grid;place-items:center;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .e4-rules-x svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round}' +
    '#scr-party .e4-rules-b{min-height:0;overflow-y:auto;padding:2px 14px 12px;-webkit-overflow-scrolling:touch}' +
    '#scr-party .e4-rules-b li{font-size:12px;line-height:1.6;color:var(--dim);margin:0 0 6px 14px}' +

    /* ── landscape: seats down the side ── */
    '@media (max-height:520px){' +
      '#scr-party .e4-wrap{flex-direction:row;align-items:stretch;gap:8px}' +
      '#scr-party .e4-seats{flex-direction:column;flex:0 0 auto;justify-content:flex-start;max-width:150px}' +
      '#scr-party .e4-mid{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:5px}' +
      '#scr-party .e4-say{order:-1}' +
      '#scr-party .e4-rules{max-height:90%}' +
    '}' +
    '@media (min-height:521px){#scr-party .e4-mid{display:contents}}' +

    /* ── THE MENU'S OWN FACE — a mini board worn as a badge ── */
    '#scr-party .e4-menu .pt-lbl{color:#C4AEFF}' +
    '#scr-party .e4-menu .e4-hero{position:relative;display:flex;align-items:center;justify-content:center;' +
      'margin:2px 0 12px;padding:16px 8px;border-radius:16px;overflow:hidden;' +
      'background:radial-gradient(120% 130% at 50% 20%,#2E2153 0%,var(--e4-board) 52%,var(--e4-board2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.06),inset 0 -14px 26px rgba(0,0,0,.4)}' +
    '#scr-party .e4-menu .e4-hero svg{width:170px;height:150px;display:block}' +
    '#scr-party .e4-menu .e4-hero-cap{position:absolute;right:11px;bottom:8px;' +
      'font:900 9.5px/1 var(--disp);letter-spacing:.18em;color:rgba(255,255,255,.32)}' +
    '#scr-party .e4-note{font-size:11.5px;line-height:1.6;margin:8px 2px 0;padding:9px 11px;' +
      'border-radius:12px;text-transform:none;letter-spacing:0;color:#CFC2F0;' +
      'background:rgba(138,92,255,.10);border:1px solid rgba(138,92,255,.3)}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   THE FRAME + THE BOARD DOM
   ═══════════════════════════════════════════════════════════════════ */
function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: T('Four in a Row', 'Erbgħa f’Ringiela'),
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'e4-rules', label:T('Rules', 'Regoli'), icon:'book',    cls:'ghost' },
      { id:'e4-new',   label:T('New', 'Ġdida'),    icon:'refresh', cls:'ghost' }
    ]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();     /* we size our own 7:6 board */
  M.ctx.badge.textContent = M.net ? T('Online', 'Onlajn')
    : (ownerOf(0) === 'ai' || ownerOf(1) === 'ai') ? levelName(seatLvl(ownerOf(0) === 'ai' ? 0 : 1))
    : T('Pass & play', 'Għaddi u lgħab');
  buildBoard();
  M.ctx.btn('e4-rules').onclick = () => setRules(!rulesOpen);
  const nb = M.ctx.btn('e4-new');
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
  ctx.host.classList.add('e4-host');
  ctx.host.innerHTML =
    '<div class="e4-wrap" id="e4-wrap">' +
      '<div class="e4-seats" id="e4-seats"></div>' +
      '<div class="e4-mid">' +
        '<div class="e4-boardbox" id="e4-boardbox">' +
          '<canvas class="e4-canv" id="e4-canv" role="img" aria-label="' +
            esc(T('The Connect Four board', 'It-tabellun ta’ Erbgħa f’Ringiela')) + '"></canvas>' +
        '</div>' +
        '<div class="e4-say" id="e4-say"></div>' +
      '</div>' +
      '<div class="e4-rules" id="e4-rulespanel" aria-hidden="true">' +
        '<div class="e4-rules-h"><h4 id="e4-rules-t"></h4>' +
          '<button class="e4-rules-x" id="e4-rules-x" aria-label="' +
            esc(T('Put the rules away', 'Warrab ir-regoli')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button></div>' +
        '<div class="e4-rules-b" id="e4-rules-b"></div>' +
      '</div>' +
    '</div>';
  const root = ctx.host.querySelector('#e4-wrap');
  UI = {
    ctx, root,
    seats:    root.querySelector('#e4-seats'),
    boardbox: root.querySelector('#e4-boardbox'),
    canv:     root.querySelector('#e4-canv'),
    say:      root.querySelector('#e4-say'),
    rules:    root.querySelector('#e4-rulespanel'),
    cx: null, geom: null, dpr: 1
  };
  UI.cx = UI.canv.getContext('2d');
  root.querySelector('#e4-rules-x').addEventListener('click', () => setRules(false));
  ctx.root.addEventListener('pointerdown', e => {
    if (!rulesOpen || !UI || !UI.rules) return;
    const rb = ctx.btn && ctx.btn('e4-rules');
    if (!UI.rules.contains(e.target) && !(rb && rb.contains(e.target))) setRules(false);
  }, true);

  /* board input: pointer move sets the hover column (ghost), tap drops */
  UI.canv.addEventListener('pointermove', onPointerMove);
  UI.canv.addEventListener('pointerleave', () => { if (M){ M.hover = -1; drawStatic(); } });
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

/* the board is the biggest 7×6 that fits the box */
function sizeBoard(){
  if (!UI || !UI.boardbox || !UI.boardbox.isConnected) return;
  const bw = UI.boardbox.clientWidth, bh = UI.boardbox.clientHeight;
  if (!bw || !bh) return;
  const cols = E.COLS, rows = E.ROWS;
  /* fit a 7:6 rectangle */
  let w = bw, h = w * rows / cols;
  if (h > bh){ h = bh; w = h * cols / rows; }
  w = Math.max(210, Math.floor(w));
  h = Math.floor(w * rows / cols);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  UI.dpr = dpr;
  UI.canv.style.width = w + 'px';
  UI.canv.style.height = h + 'px';
  UI.canv.width = Math.floor(w * dpr);
  UI.canv.height = Math.floor(h * dpr);
  /* geometry in CSS px */
  const pad = Math.max(8, w * 0.028);
  const cellW = (w - pad * 2) / cols;
  const cellH = (h - pad * 2) / rows;
  const cell = Math.min(cellW, cellH);
  const gridW = cell * cols, gridH = cell * rows;
  UI.geom = {
    w, h, pad, cell,
    ox: (w - gridW) / 2,
    oy: (h - gridH) / 2,
    r: cell * 0.40                 /* disc radius */
  };
  drawStatic();
}

/* map a client x to a column, or -1 */
function colAt(clientX){
  if (!UI || !UI.geom) return -1;
  const rect = UI.canv.getBoundingClientRect();
  const g = UI.geom;
  const x = clientX - rect.left - g.ox;
  if (x < 0) return -1;
  const c = Math.floor(x / g.cell);
  return (c >= 0 && c < E.COLS) ? c : -1;
}

function onPointerMove(e){
  if (!M || M.dead || E.over(M.st) || M.anim) return;
  const seat = E.turn(M.st);
  if (!isLocal(seat)) return;
  const c = colAt(e.clientX);
  if (c !== M.hover){ M.hover = c; drawStatic(); }
}
function onPointerDown(e){
  if (!M || M.dead) return;
  const c = colAt(e.clientX);
  if (c < 0) return;
  tryDrop(c);
}
function onKeyDown(e){
  if (!M || M.dead || E.over(M.st) || M.anim) return;
  const seat = E.turn(M.st);
  if (!isLocal(seat)) return;
  if (e.key === 'ArrowLeft'){ M.hover = Math.max(0, (M.hover < 0 ? 3 : M.hover) - 1); drawStatic(); e.preventDefault(); }
  else if (e.key === 'ArrowRight'){ M.hover = Math.min(E.COLS - 1, (M.hover < 0 ? 3 : M.hover) + 1); drawStatic(); e.preventDefault(); }
  else if (e.key === 'Enter' || e.key === ' '){ if (M.hover >= 0){ tryDrop(M.hover); e.preventDefault(); } }
}

/* the one place a local drop is issued: it plays the fall animation, and
   ONLY when the disc has settled does the move commit to the log — so
   the board never jumps ahead of the pixels. */
function tryDrop(c){
  if (!M || M.dead || E.over(M.st) || M.anim) return;
  const seat = E.turn(M.st);
  if (!isLocal(seat)) return;
  if (!E.colOpen(M.st, c)){ cue('move.illegal', { gain:0.7 }); return; }
  commitDrop(seat, c, 'local');
}

/* commit a drop for any owner (local thumb, AI, or a wire move). Runs the
   fall animation from the current board, then applies through the gate.
   The engine result is identical whether or not the animation ran, so a
   remote/AI move that arrives while we are mid-drop simply queues behind
   M.anim (guarded by the M.anim checks at every entry). */
function commitDrop(seat, c, src){
  const st = M.st;
  if (!E.colOpen(st, c)) return;
  const landRow = st.height[c];              /* where it will settle       */
  M.hover = -1;

  if (reduced() || !UI || !UI.geom){
    /* no fall: commit and paint settled */
    doMove(seat, { t:'drop', c }, src);
    drawStatic();
    afterMove();
    return;
  }
  /* animate the fall, then commit */
  animateDrop(seat, c, landRow, () => {
    doMove(seat, { t:'drop', c }, src);
    drawStatic();
    afterMove();
  });
}

/* ═══════════════════════════════════════════════════════════════════
   THE HERO — the disc falls and SETTLES with a small bounce. Pure canvas
   on requestAnimationFrame: a real gravity integration from the top of
   the column to the landing cell, then one or two decaying bounces. The
   land sound fires the first time the disc touches its slot, in sync with
   the pixels. Compositor-only in spirit — one canvas, no layout.
   ═══════════════════════════════════════════════════════════════════ */
function animateDrop(seat, c, landRow, done){
  const g = UI.geom;
  const cx = g.ox + c * g.cell + g.cell / 2;
  /* y of the centre of a cell, row r (r=0 bottom) */
  const yOf = r => g.oy + (E.ROWS - 1 - r) * g.cell + g.cell / 2;
  const yStart = g.oy - g.cell * 0.5;        /* just above the board rim   */
  const yLand  = yOf(landRow);
  const fallPx = yLand - yStart;

  /* gravity tuned so a full-height drop takes ~360ms — snappy but weighty.
     v in px/ms, a in px/ms². */
  const A = 0.0075 + 0.0009 * (E.ROWS - landRow);   /* longer drops fall a touch faster */
  let y = yStart, v = 0, bounces = 0, thudded = false;
  const rest = 0.34;                          /* restitution of each bounce */
  let last = performance.now();

  M.anim = { seat, c, landRow, cx };
  cancelRaf();

  function frame(now){
    if (!M || M.dead){ M.anim = null; return; }
    let dt = now - last; last = now;
    if (dt > 40) dt = 40;                      /* clamp a stalled tab       */
    v += A * dt;
    y += v * dt;
    if (y >= yLand){
      y = yLand;
      if (!thudded){ thudded = true; cue('piece.slide', { gain: 0.7 }, true); }
      /* bounce: reverse a fraction of the velocity */
      if (v > 0.12 && bounces < 2){ v = -v * rest; bounces++; }
      else {
        /* settled */
        M.anim.y = yLand;
        drawStatic();
        drawFallingDisc(seat, cx, yLand, 0);
        cue('piece.place', { gain: 0.55 });
        M.anim = null; M.raf = 0;
        if (done) done();
        return;
      }
    }
    /* a tiny squash on the frames right after a bounce reads as weight */
    const squash = (thudded && v < 0) ? Math.min(0.18, Math.abs(v) * 0.8) : 0;
    drawStatic();
    drawFallingDisc(seat, cx, y, squash);
    M.raf = requestAnimationFrame(frame);
  }
  M.raf = requestAnimationFrame(frame);
}
function cancelRaf(){ if (M && M.raf){ cancelAnimationFrame(M.raf); M.raf = 0; } }

/* ═══════════════════════════════════════════════════════════════════
   DRAWING — the static board (grid, holes, settled discs, ghost, winning
   highlight) and the single falling disc drawn on top of it each frame.
   ═══════════════════════════════════════════════════════════════════ */
function boardBg(cx, g){
  const grad = cx.createLinearGradient(0, 0, 0, g.h);
  if (xEq('board')){
    /* NEON DROP's cabinet (local choice): a deep magenta night */
    grad.addColorStop(0, '#3A1245');
    grad.addColorStop(0.55, '#2A0E36');
    grad.addColorStop(1, '#160722');
    return grad;
  }
  grad.addColorStop(0, '#2E2153');
  grad.addColorStop(0.55, '#241A3E');
  grad.addColorStop(1, '#150F28');
  return grad;
}
function discFill(cx, x, y, r, seat){
  const neon = neonSeat(seat);
  const col = neon ? (NEON_DISCS[seat] || NEON_DISCS[0]) : discColour(seat);
  const grad = cx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.15, x, y, r);
  grad.addColorStop(0, col.hi);
  grad.addColorStop(0.55, col.hex);
  grad.addColorStop(1, col.lo);
  cx.fillStyle = grad;
  if (neon){
    /* the firework glow — lands still glowing */
    cx.save();
    cx.shadowColor = col.glow;
    cx.shadowBlur = r * 0.9;
    cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
    cx.restore();
  }
  cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
  /* rim */
  cx.lineWidth = Math.max(1, r * 0.06);
  cx.strokeStyle = neon ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.35)';
  cx.stroke();
  /* top gloss */
  cx.beginPath();
  cx.ellipse(x - r * 0.22, y - r * 0.3, r * 0.42, r * 0.26, -0.5, 0, Math.PI * 2);
  cx.fillStyle = 'rgba(255,255,255,.28)';
  cx.fill();
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
  const win = over && over.line ? over.line : null;
  const myTurn = !over && isLocal(E.turn(st)) && !M.anim;

  /* ghost disc above the hovered column */
  if (myTurn && M.hover >= 0 && E.colOpen(st, M.hover)){
    const gx = g.ox + M.hover * g.cell + g.cell / 2;
    const gy = g.oy - g.cell * 0.5;
    cx.globalAlpha = 0.5;
    discFill(cx, gx, gy, g.r, E.turn(st));
    cx.globalAlpha = 1;
    /* a soft column highlight */
    cx.fillStyle = 'rgba(255,255,255,.05)';
    roundRect(cx, g.ox + M.hover * g.cell + 1, g.oy, g.cell - 2, E.ROWS * g.cell, 6); cx.fill();
  }

  /* the holes + settled discs, punched into the board face */
  for (let c = 0; c < E.COLS; c++){
    for (let r = 0; r < E.ROWS; r++){
      const x = g.ox + c * g.cell + g.cell / 2;
      const y = g.oy + (E.ROWS - 1 - r) * g.cell + g.cell / 2;
      const v = E.cell(st, c, r);
      /* the mid-drop disc must not be drawn twice: skip the cell it is
         about to land in while the animation runs */
      const animCell = M.anim && M.anim.c === c && M.anim.landRow === r && M.anim.y == null;
      if (v === E.EMPTY || animCell){
        /* an empty socket: a dark hole in the face */
        cx.fillStyle = 'rgba(0,0,0,.42)';
        cx.beginPath(); cx.arc(x, y, g.r, 0, Math.PI * 2); cx.fill();
        cx.lineWidth = Math.max(1, g.r * 0.05);
        cx.strokeStyle = 'rgba(0,0,0,.5)';
        cx.stroke();
        cx.beginPath(); cx.arc(x, y, g.r * 0.94, Math.PI * 0.9, Math.PI * 1.6);
        cx.strokeStyle = 'rgba(255,255,255,.06)'; cx.stroke();
      } else {
        const onWin = win && win.some(p => p.c === c && p.r === r);
        discFill(cx, x, y, g.r, E.seatOfDisc(v));
        if (onWin){
          /* the winning discs get a bright pulsing ring */
          const t = reduced() ? 1 : (0.6 + 0.4 * Math.sin(Date.now() / 180));
          cx.lineWidth = Math.max(2, g.r * 0.16);
          cx.strokeStyle = 'rgba(255,255,255,' + (0.55 + 0.4 * t) + ')';
          cx.beginPath(); cx.arc(x, y, g.r * (0.82 + 0.05 * t), 0, Math.PI * 2); cx.stroke();
        }
      }
    }
  }
  cx.restore();

  /* keep the win pulse animating without a move */
  if (win && !reduced()){
    if (!M._pulse) M._pulse = requestAnimationFrame(function loop(){
      if (!M || M.dead){ return; }
      drawStatic();
      if (E.over(M.st)) M._pulse = requestAnimationFrame(loop);
      else M._pulse = 0;
    });
  }
  paintSay();
}
/* the falling disc, drawn on top of the static board each frame */
function drawFallingDisc(seat, x, y, squash){
  if (!UI || !UI.cx || !UI.geom) return;
  const cx = UI.cx, g = UI.geom, dpr = UI.dpr;
  cx.save();
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ry = g.r * (1 - squash);
  const rx = g.r * (1 + squash * 0.5);
  cx.save();
  cx.translate(x, y);
  cx.scale(rx / g.r, ry / g.r);
  discFill(cx, 0, 0, g.r, seat);
  cx.restore();
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
  for (let i = 0; i < E.SEATS; i++){
    const on = (i === turn && !over) ? ' on' : '';
    const col = discColour(i);
    const nm = seatName(i);
    const cnt = countDiscs(st, i);
    html += '<div class="e4-seat' + on + '">' +
      '<span class="sw" style="background:radial-gradient(circle at 35% 30%,' + col.hi + ',' + col.hex + ' 60%,' + col.lo + ')"></span>' +
      '<span class="col">' +
        '<span class="n">' + esc(nm) + '</span>' +
        '<span class="h">' + cnt + ' ' + esc(T('discs', 'diski')) + '</span>' +
      '</span>' +
    '</div>';
  }
  UI.seats.innerHTML = html;
}
function countDiscs(st, seat){
  const d = E.discOf(seat); let n = 0;
  for (let i = 0; i < st.grid.length; i++) if (st.grid[i] === d) n++;
  return n;
}

function paintSay(){
  if (!UI || !UI.say || !M) return;
  const st = M.st, over = E.over(st);
  let html;
  if (over){
    if (over.draw){ html = esc(T('The board is full — a draw.', 'It-tabellun mimli — ndaqs.')); }
    else {
      const w = over.winner;
      const dot = '<span class="dot" style="background:' + discColour(w).hex + '"></span>';
      const who = isLocal(w) ? T('You win!', 'Rbaħt int!') : esc(seatName(w)) + ' ' + T('wins', 'jirbaħ');
      html = dot + '<b>' + who + '</b> — ' + esc(T('four in a row.', 'erbgħa f’ringiela.'));
    }
  } else {
    const turn = E.turn(st);
    const dot = '<span class="dot" style="background:' + discColour(turn).hex + '"></span>';
    const mine = isLocal(turn);
    const who = mine ? T('Your drop', 'Imissek titfa’')
      : ownerOf(turn) === 'ai' ? levelName(seatLvl(turn)) + ' ' + T('is thinking', 'qed jaħseb')
      : esc(seatName(turn)) + ' ' + T('to drop', 'jitfa’');
    html = dot + (mine ? '<b>' + who + '</b>' : who);
  }
  UI.say.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════════════
   AFTER A MOVE — voice the seats, check for the end, else let the machine
   think if it is its turn.
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
  /* online: ONLY the host thinks for a bot chair and relays the column —
     mp.js's net is { seat, host, … } (there is no iAmHost field; checking
     one meant NOBODY drove the bot and the table hung at its turn). The
     non-host phones apply the relayed move like any other remote drop. */
  if (M.net && M.net.seat !== M.net.host) return;
  const delay = reduced() ? 60 : 420;
  M.timer = setTimeout(() => {
    M.timer = 0;
    if (!M || M.dead || M.anim) { if (M) maybeThink(); return; }
    const st2 = M.st;
    if (E.over(st2) || ownerOf(E.turn(st2)) !== 'ai'){ drawStatic(); return; }
    const s2 = E.turn(st2);
    const mv = E.think(st2, s2, seatLvl(s2));
    if (!mv){ drawStatic(); return; }
    commitDrop(s2, mv.c, 'local');
  }, delay);
}

/* ═══════════════════════════════════════════════════════════════════
   THE END — into the shared AAA winner screen (js/rebbieh.js). Two rows,
   the winner first; a draw shows both level with the board.
   ═══════════════════════════════════════════════════════════════════ */
/* `forced` is the sole-win path only: a verdict the engine cannot reach
   ({winner, draw:false, sole:true}) because the other chair walked out of
   a 1v1 rather than losing on the board. Every ordinary caller passes
   nothing and reads E.over exactly as before. */
function finish(forced){
  if (!M || M.finished) return;
  M.finished = true;
  stopThinking();
  const st = M.st;
  const ov = forced || E.over(st);
  if (!ov) return;
  cue('game.win', { gain: 0.95 }, true);

  const me = firstLocalSeat();
  if (!M.net && !M.recorded){
    M.recorded = true;
    if (ov.draw) ST.rec.d = (ST.rec.d | 0) + 1;
    else if (me >= 0 && ov.winner === me) ST.rec.w++;
    else ST.rec.l++;
    persist();
  }
  saveSlot(null);

  /* order: winner first (or seat 0 first on a draw) */
  const order = ov.draw ? [0, 1] : [ov.winner, 1 - ov.winner];
  const rows = order.map((seat, i) => {
    const isMe = isLocal(seat);
    return {
      name: isMe ? T('You', 'Int')
        : ownerOf(seat) === 'ai' ? levelName(seatLvl(seat))
        : seatName(seat),
      place: ov.draw ? 1 : (i + 1),
      you: isMe,
      bot: ownerOf(seat) === 'ai',
      score: discName(seat),
      border: discColour(seat).id
    };
  });

  const net = M.net;
  const iWon = !ov.draw && me >= 0 && ov.winner === me;
  const title = ov.draw ? T('A draw', 'Ndaqs')
    : ov.sole ? T('They walked out — you win', 'Telaq — ir-rebħa tiegħek')
    : iWon ? T('Four in a row!', 'Erbgħa f’ringiela!')
    : (isLocal(0) || isLocal(1)) ? T('Beaten', 'Mirbuħ')
    : discName(ov.winner) + ' ' + T('wins', 'jirbaħ');

  const show = window.KARTI_REBBIEH && window.KARTI_REBBIEH.show;
  if (!show){
    P.ui.result(M.ctx, {
      tone: ov.draw ? 'draw' : iWon ? 'win' : 'lose',
      head: title,
      why:  ov.draw ? T('Forty-two discs, nobody lined up four.',
                        'Tnejn u erbgħin diska, ħadd ma llinja erbgħa.')
                    : T('Four of a colour, straight through.',
                        'Erbgħa ta’ lewn, dritt għaddej.'),
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
        ? 'erbgha:' + MPX.MP.code + ':' + ((MPX.MP.seed || 0) >>> 0)
        : (M.payId || (M.payId = 'erbgha:' + Date.now().toString(36) + '-' +
                                  ((Math.random() * 1e6) | 0).toString(36)));
      const r = KARTI_XP.awardPlay({ game:'erbgha', won: tone === 'win',
                                     draw: tone === 'draw', id: mid, ranked: staked });
      if (r && r.counted) pay = r;
    } catch(e){}
  }
  if (staked && MPX.stakeSettle){
    try { potRes = MPX.stakeSettle(tone); } catch(e){}
  }
  /* a 1v1 walk-out settled the pot in mp.js before this ran (the sole-win
     hook stashed it); the settle above was a no-op then */
  if (!potRes && tone === 'win' && M.solePot){ potRes = M.solePot; M.solePot = null; }
  show({
    title,
    subtitle: ov.sole ? T('The other chair emptied mid-game', 'Is-siġġu l-ieħor tbattal waqt il-logħba')
            : ov.draw ? T('The board filled up', 'It-tabellun imtela')
                      : T('Four in a row', 'Erbgħa f’ringiela'),
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
  for (let i = 0; i < E.SEATS; i++) if (isLocal(i)) return i;
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
    T('Two players, two colours. Take turns <b>dropping a disc</b> into any column that is not ' +
      'yet full; it falls to the lowest empty slot.',
      'Żewġ plejers, żewġ lwien. Bir-rotazzjoni <b>itfa’ diska</b> f’kolonna li għadha mhux ' +
      'mimlija; taqa’ fl-iktar post baxx vojt.'),
    T('The first to line up <b>four of their own</b> in a row — across, up, or on either ' +
      'diagonal — wins on the spot.',
      'L-ewwel wieħed li jillinja <b>erbgħa tiegħu</b> f’ringiela — bil-wisa’, ’il fuq, jew ' +
      'fuq kwalunkwe djagonali — jirbaħ dak il-ħin.'),
    T('There is <b>no luck</b> and nothing hidden: you both see the whole board, all the time.',
      'M’hemmx <b>xorti</b> u xejn moħbi: it-tnejn taraw it-tabellun kollu, il-ħin kollu.'),
    T('Fill all forty-two slots with nobody lined up and it is a <b>draw</b>.',
      'Imla t-tnejn u erbgħin post kollha bla ħadd illinja u tkun <b>ndaqs</b>.'),
    T('A tip: the <b>middle column</b> is worth the most — it touches the most possible fours.',
      'Parir: il-<b>kolonna tan-nofs</b> tiswa l-aktar — tmiss l-aktar erbgħat possibbli.')
  ];
}
function paintRules(){
  if (!UI || !UI.rules) return;
  UI.rules.querySelector('#e4-rules-t').textContent =
    T('Four in a Row', 'Erbgħa f’Ringiela') + ' — ' + T('the rules', 'ir-regoli');
  UI.rules.querySelector('#e4-rules-b').innerHTML =
    '<ul style="margin:0;padding:0">' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul>';
  UI.rules.classList.toggle('open', rulesOpen);
  UI.rules.setAttribute('aria-hidden', rulesOpen ? 'false' : 'true');
  const rb = M && M.ctx && M.ctx.btn && M.ctx.btn('e4-rules');
  if (rb) rb.setAttribute('aria-expanded', rulesOpen ? 'true' : 'false');
}
function setRules(open){
  rulesOpen = !!open;
  try { localStorage.setItem(UIKEY + '.rules', rulesOpen ? '1' : '0'); } catch(e){}
  cue(rulesOpen ? 'ui.sheet' : 'ui.back', { gain:0.8 });
  paintRules();
}

/* ═══════════════════════════════════════════════════════════════════
   THE ENTRY SCREEN — MINIMAL, like ludu/kanun. PLAY ONLINE (top), PLAY
   WITH AI, PASS THE PHONE, and "How to play". No settings on screen one;
   difficulty is a tiny second step after PLAY WITH AI. Back goes to the
   hub with no confirm popup.
   ═══════════════════════════════════════════════════════════════════ */
function heroSVG(){
  /* a small 7×6 board with a few discs — the game worn as a badge */
  const cols = 7, rows = 6, cell = 22, pad = 10;
  const w = cols * cell + pad * 2, h = rows * cell + pad * 2;
  const seed = [ [3,0,0],[3,1,1],[3,2,0],[2,0,1],[4,0,1],[2,1,0],[1,0,0] ];  /* [c,r,seat] */
  let discs = '';
  const filled = {};
  seed.forEach(d => { filled[d[0] + ',' + d[1]] = d[2]; });
  let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<defs>' +
      '<radialGradient id="e4h-r" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#FF6D7C"/>' +
        '<stop offset="60%" stop-color="#F0384B"/><stop offset="100%" stop-color="#B01625"/></radialGradient>' +
      '<radialGradient id="e4h-y" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#FFE08A"/>' +
        '<stop offset="60%" stop-color="#FFC542"/><stop offset="100%" stop-color="#C89211"/></radialGradient>' +
    '</defs>' +
    '<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="14" fill="#241A3E" ' +
      'stroke="rgba(0,0,0,.5)" stroke-width="1"/>';
  for (let c = 0; c < cols; c++){
    for (let r = 0; r < rows; r++){
      const x = pad + c * cell + cell / 2;
      const y = pad + (rows - 1 - r) * cell + cell / 2;
      const key = c + ',' + r;
      if (filled[key] != null){
        s += '<circle cx="' + x + '" cy="' + y + '" r="' + (cell * 0.4) + '" fill="url(#e4h-' +
          (filled[key] === 0 ? 'r' : 'y') + ')"/>';
      } else {
        s += '<circle cx="' + x + '" cy="' + y + '" r="' + (cell * 0.4) + '" fill="rgba(0,0,0,.42)"/>';
      }
    }
  }
  /* a disc mid-drop above the middle column, the hero motion frozen */
  s += '<circle cx="' + (pad + 3 * cell + cell / 2) + '" cy="' + (pad - cell * 0.35) +
    '" r="' + (cell * 0.4) + '" fill="url(#e4h-r)"/>';
  return s + '</svg>';
}

function setupSheet(){
  injectCSS();
  P.show();
  stopThinking(); M = null; UI = null;
  const el = P.ui.screenEl();
  const online = canGoOnline();

  el.innerHTML =
    '<div class="pt-wrap e4-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="e4-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + esc(T('Four in a Row', 'Erbgħa f’Ringiela')) + '</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="e4-hero" aria-hidden="true">' + heroSVG() +
        '<span class="e4-hero-cap">7 &times; 6</span></div>' +
      '<p class="blurb">' +
        T('Drop your discs and line up four — across, up, or on the slant. No dice, no cards, ' +
          'no luck: just you, them, and one board you can both see.',
          'Itfa’ d-diski tiegħek u llinja erbgħa — bil-wisa’, ’il fuq, jew fuq il-mejl. Ebda dadi, ' +
          'ebda karti, ebda xorti: int, huma, u tabellun wieħed li taraw it-tnejn.') +
      '</p>' +

      (ST.save
        ? '<button class="btn primary" id="e4-res" style="margin:2px 0 12px">' +
          esc(T('Carry on the saved game', 'Kompli l-logħba mħażna')) + '</button>'
        : '') +

      '<div class="e4-modes" style="display:grid;gap:9px;margin-top:4px">' +
        (online
          ? '<button class="btn primary" id="e4-online">' + ico('users') + ' ' +
            esc(T('Play online', 'Ilgħab onlajn')) + '</button>'
          : '') +
        '<button class="btn' + (online ? ' ghost' : ' primary') + '" id="e4-ai">' +
          ico('coach') + ' ' + esc(T('Play with the machine', 'Ilgħab mal-magna')) + '</button>' +
        '<button class="btn ghost" id="e4-pnp">' + ico('users') + ' ' +
          esc(T('Pass the phone', 'Għaddi t-telefon')) + '</button>' +
        '<button class="btn ghost" id="e4-rulesbtn">' + ico('book') + ' ' +
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

    '<div class="e4-rules" id="e4-menurules" aria-hidden="true">' +
      '<div class="e4-rules-h"><h4>' + esc(T('Four in a Row', 'Erbgħa f’Ringiela')) + ' — ' +
        esc(T('the rules', 'ir-regoli')) + '</h4>' +
        '<button class="e4-rules-x" id="e4-menurules-x" aria-label="' + esc(T('Close', 'Agħlaq')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button></div>' +
      '<div class="e4-rules-b"><ul style="margin:0;padding:0">' +
        rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul></div>' +
    '</div>' +
    '</div>';

  el.querySelector('#e4-back').onclick = () => { cue('ui.back'); P.hub(); };
  const on = el.querySelector('#e4-online');
  if (on) on.onclick = () => { if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('erbgha'); };
  el.querySelector('#e4-ai').onclick  = () => difficultyStep();
  el.querySelector('#e4-pnp').onclick = () => newGame({ humans:2, lvl:2 });
  const rs = el.querySelector('#e4-res');
  if (rs) rs.onclick = () => { if (ST.save) newGame(null, ST.save); };

  const rules = el.querySelector('#e4-menurules');
  const openRules = o => {
    rules.classList.toggle('open', o);
    rules.setAttribute('aria-hidden', o ? 'false' : 'true');
    cue(o ? 'ui.sheet' : 'ui.back', { gain:0.8 });
  };
  el.querySelector('#e4-rulesbtn').onclick = () => openRules(!rules.classList.contains('open'));
  el.querySelector('#e4-menurules-x').onclick = () => openRules(false);

  if (window.KARTI_LANG && KARTI_LANG.onChange && !setupSheet._sub){
    setupSheet._sub = KARTI_LANG.onChange(() => {
      try { if (!M && el.isConnected && el.querySelector('#e4-ai')) setupSheet();
            else if (M && UI){ paintSeats(); drawStatic(); paintRules(); } } catch(e){}
    });
  }
}

/* the ONE tiny step after PLAY WITH AI — just the difficulty, then a big
   START. Also lets you pick who drops first. Not a settings wall. */
function difficultyStep(){
  injectCSS();
  P.show();
  const el = P.ui.screenEl();
  const p = pref();
  let lvl = p.lvl || 2;
  let youFirst = p.youFirst !== false;

  function paint(){
    el.innerHTML =
      '<div class="pt-wrap e4-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="e4-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(T('Play the machine', 'Ilgħab mal-magna')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<div class="e4-hero" aria-hidden="true">' + heroSVG() + '</div>' +

        '<div class="tiny pt-lbl">' + esc(T('How sharp is the machine', 'Kemm hi taħraq il-magna')) + '</div>' +
        '<div class="pt-opts" id="e4-lvl">' + levels().map(o =>
          '<button class="pt-opt' + (o.level === lvl ? ' on' : '') + '" data-lvl="' + o.level + '">' +
          ico(o.icon || ('diff-' + Math.min(3, o.level))) +
          '<b>' + esc(o.name) + '</b><i>' + esc(TE(o.note)) + '</i></button>').join('') +
        '</div>' +

        '<div class="tiny pt-lbl" style="margin-top:10px">' + esc(T('Who drops first', 'Min jitfa’ l-ewwel')) + '</div>' +
        '<div class="pt-opts two" id="e4-first">' +
          '<button class="pt-opt' + (youFirst ? ' on' : '') + '" data-first="1">' +
            '<b>' + esc(T('You', 'Int')) + '</b><i>' + esc(T('the red discs', 'id-diski ħomor')) + '</i></button>' +
          '<button class="pt-opt' + (!youFirst ? ' on' : '') + '" data-first="0">' +
            '<b>' + esc(T('The machine', 'Il-magna')) + '</b><i>' + esc(T('you play yellow', 'inti tilgħab isfar')) + '</i></button>' +
        '</div>' +

        '<div class="pt-acts" style="margin-top:18px;display:grid;gap:9px">' +
          '<button class="btn primary" id="e4-go">' + esc(T('Play', 'Ilgħab')) + '</button>' +
        '</div>' +
      '</div></div>';

    el.querySelector('#e4-back').onclick = () => { cue('ui.back'); setupSheet(); };
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { lvl = +b.dataset.lvl; cue('ui.tap', { gain:0.8 }, true); paint(); });
    el.querySelectorAll('[data-first]').forEach(b => b.onclick = () => { youFirst = b.dataset.first === '1'; cue('ui.tap', { gain:0.8 }, true); paint(); });
    el.querySelector('#e4-go').onclick = () => {
      pref({ lvl, youFirst });
      newGame({ humans:1, lvl, youFirst });
    };
  }
  paint();
}

function canGoOnline(){
  try {
    const MP = window.KARTI_MP;
    return !!(MP && MP.openFor && P.online && P.online.erbgha);
  } catch(e){ return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   START A LOCAL GAME. meta stamps who owns each seat (the engine only
   knows seat 0 and seat 1). humans:1 → you vs AI; humans:2 → pass phone.
   youFirst decides whether the human is seat 0 (red, first) or seat 1.
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
    startMatch({ lvl: opts.lvl || 2 }, null);
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
  const lvl = opts.lvl || 2;
  if ((opts.humans | 0) === 2){
    return [ { own:'me',  name: myName(), lvl }, { own:'hot', name: T('Player 2', 'Plejer 2'), lvl } ];
  }
  /* you vs AI */
  const youFirst = opts.youFirst !== false;
  const you = { own:'me', name: myName(), lvl };
  const ai  = { own:'ai', name: levelName(lvl), lvl };
  return youFirst ? [you, ai] : [ai, you];
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
   THE ONLINE CONTROLLER — KARTI_PARTY.online.erbgha. js/mp.js is the only
   caller. Connect 4 has no hidden state and no seeded play, so this is
   the simplest turn-based controller in the box: start() puts the board
   on screen, remote(seat, move) applies a wire move through the engine
   gate, note()/stop() are the two things the transport may say.
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
  apply(seat, move){ if (!M) return { ok:false, why:'no erbgha' }; return onlineRemote(seat, move); },
  attachNet(net){ if (M){ M.net = net || null; maybeThink(); } },
  setOwner(i, own){ if (M && M.meta && M.meta[i]){ M.meta[i].own = own; } },
  setName(i, name){ if (M && M.meta && M.meta[i] && name){ M.meta[i].name = name; } },
  live(){ return !!(M && !M.dead && !E.over(M.st)); },
  /* A CHAIR THAT IS GONE FOR GOOD. Two hands, no engine walkout: the game
     cannot be played around an empty chair, so stop the table honestly
     (kodici's pattern) instead of parking the turn on it forever. The stop
     card's wrapped P.ui.result settles any stake as a draw — antes home. */
  seatGone(seat){
    if (!M || M.dead || !M.net || E.over(M.st)) return;
    const who = (M.meta && M.meta[seat] && M.meta[seat].name) || T('Somebody', 'Xi ħadd');
    onlineStop(who + ' ' + T('left the table — two hands cannot play around an empty chair.',
                             'telaq mill-mejda — tnejn ma jistgħux jilagħbu madwar siġġu vojt.'));
  },
  /* THE 1v1 WALK-OUT IS A WIN — and erbgħa is always 1v1, so this is the
     door every real departure now comes through (js/mp.js prefers it over
     seatGone above, which stays for older mp.js builds). The pot was
     already settled in mp.js (idempotent; a friendly table moves nothing)
     and is stashed for finish() to paint; finish()'s M.finished latch
     keeps the single id-guarded award to one firing. */
  soleWin(seat, pot){
    if (!M || M.dead || M.finished || !M.net || E.over(M.st)) return;
    M.solePot = pot || null;
    finish({ winner: firstLocalSeat(), draw: false, sole: true });
  },
  seatBack(){ if (M){ paintSeats(); drawStatic(); } }
};

function onlineStart(cfg){
  cfg = cfg || {};
  injectCSS();
  P.show();
  /* NEVER fall back to a per-client random seed online (startMatch would if
     seed were null): every phone must hold the SAME rs, since the host's bot
     tie-break reads it. mp.js always sends a number, but a missing seed must
     degrade to the same value (0) on every phone, not a different one each. */
  startMatch({ lvl: 2 }, (cfg.seed == null ? 0 : cfg.seed) >>> 0);
  /* two seats from the room; the local seat is cfg.you */
  const seats = cfg.seats || [];
  M.meta = [0, 1].map(i => {
    const s = seats[i] || {};
    const own = (i === cfg.you) ? 'me' : (s.own === 'ai' || s.kind === 'cpu') ? 'ai' : 'net';
    return { own, name: s.name || discName(i), lvl: s.level || 2 };
  });
  applyMeta();
  M.net = cfg.net || null;
  M.finished = false;
  openBoard(() => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); });
  hooks.attachNet(cfg.net || null);
  afterMove();
  return snapshot();
}
function onlineRemote(seat, move){
  if (!M) return { ok:false, why:'no erbgha on the table' };
  if (E.over(M.st)) return { ok:false, why:'the game is over' };
  /* that player's exclusive-set byte, riding their drop. Validated
     against the one byte this build knows before it can reach a paint;
     decWire strips it, so the engine below never sees it. */
  if (move && (move.e | 0) === 1 && (seat === 0 || seat === 1)){
    if (!M.skins) M.skins = {};
    M.skins[seat] = 1;
  }
  const dec = E.decWire ? (E.decWire(move) || move) : move;
  /* a remote drop animates too, for parity with a local one, then commits */
  if (M.anim){
    /* mid-animation: apply straight through (rare race) */
    const res = doMove(seat, dec, 'net');
    if (!res.ok) return { ok:false, why: res.err || 'that move did not fit the rules' };
    drawStatic(); afterMove();
    return { ok:true };
  }
  if (!E.check(M.st, dec, seat)) return { ok:false, why:'that move did not fit the rules' };
  commitDrop(seat, dec.c, 'net');
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
P.online.erbgha = {
  start: onlineStart,
  remote: onlineRemote,
  note: onlineNote,
  stop: onlineStop,
  live: () => !!(M && !M.dead && hooks.live()),
  hooks
};

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — window.KARTI_ERBGHA.lobby. Read by js/mp.js. Two
   seats, always; a ready 2-seat table can start.
   ═══════════════════════════════════════════════════════════════════ */
const LOBBY = {
  id:'erbgha',
  name:'Four in a Row',
  mt:'Erbgħa f’Ringiela',
  minSeats: E.MIN_SEATS,
  maxSeats: E.MAX_SEATS,
  levels: levels().map(L => ({ level:L.level, name:L.name, note:TE(L.note) })),
  defaultLevel: 2,
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    const n = (seatList || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why: T('Four in a Row is for two.', 'Erbgħa f’Ringiela hija għal tnejn.') };
    if (n > E.MAX_SEATS) return { ok:false, why: T('Only two can play.', 'Tnejn biss jistgħu jilagħbu.') };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready) return { ok:false, why: unready + (unready > 1
        ? T(' people are not ready yet.', ' persuni għadhom mhux lesti.')
        : T(' person is not ready yet.', ' persuna għadha mhux lesta.')) };
    return { ok:true, why:'' };
  },
  rulesHTML: () =>
    '<p>' + T('Two players drop discs into a seven-by-six grid. First to line up four of their ' +
      'own — across, up, or diagonally — wins.',
      'Żewġ plejers jitfgħu diski f’tabellun sebgħa b’sitta. L-ewwel li jillinja erbgħa tiegħu — ' +
      'bil-wisa’, ’il fuq, jew djagonali — jirbaħ.') + '</p>' +
    '<p>' + T('No luck and nothing hidden — you both see the whole board, so online is as honest ' +
      'as across a table.',
      'Ebda xorti u xejn moħbi — it-tnejn taraw it-tabellun kollu, mela onlajn hu daqstant onest ' +
      'daqs wiċċ imb wiċċ.') + '</p>',
  blurb: T('Drop discs, line up four. No luck, all skill.',
           'Itfa’ diski, llinja erbgħa. Ebda xorti, kollox ħila.'),
  start(seats, opts){
    /* the offline twin: two people at one phone by default */
    return newGame(Object.assign({ humans:2, lvl:(pref().lvl || 2) }, opts || {}));
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
  id:'erbgha', order:27, kind:'board', cat:'board',
  name:'Four in a Row', mt:'Erbgħa f’Ringiela', icon:'drop', status:'live',
  get tag(){
    return T('Drop your discs and line up four — across, up or diagonally. No dice, no luck, ' +
             'just you and one board you can both see.',
             'Itfa’ d-diski u llinja erbgħa — bil-wisa’, ’il fuq jew djagonali. Ebda dadi, ebda ' +
             'xorti, int u tabellun wieħed li taraw it-tnejn.') +
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

/* ── test hooks — inert unless the page is opened with ?erbghatest ──── */
if (/[?&]erbghatest\b/.test(location.search || '')){
  window.__ERBGHA_TEST = {
    setupSheet, newGame, difficultyStep, commitDrop, tryDrop, drawStatic,
    get M(){ return M; }, get UI(){ return UI; },
    engine: E, LOBBY, hooks, online: P.online.erbgha, leave,
    colAt, reduced
  };
}

})();
