/* ═══════════════════════════════════════════════════════════════════
   KARTI — ludu-ui.js
   LUDU — the tappable game on top of js/ludu.js's pure engine
   (window.KARTI_LUDU.engine). This file is the screen, the runner and
   the wire, and it follows js/poker-ui.js's shape deliberately: a match
   is (opts, seed, log), every move goes through one doMove() gate, and
   rollback is cutting the log and replaying it.

   WHAT THIS FILE IS
     · the shelf tile and the themed setup sheet — the cross/rosette
       board worn as a badge, the player count (4/6/8), the difficulty,
       and the rules FOLDED shut so starting a game is short
     · the board: a P-arm rosette drawn from the engine's layout()
       (polar coords → xy), tokens in seat colours, the die, the legal
       moves lit, captures and home animated compositor-only
     · the runner: log, seed, autosave (karti_ludu_v1)
     · the online controller published on KARTI_PARTY.online.ludu and
       the lobby contract on window.KARTI_LUDU.lobby, both exactly the
       shape js/mp.js reads (see js/tombla-ui.js for the reference)

   HOUSE RULES OBEYED
     · borrows #scr-party through KARTI_PARTY, injects its own CSS once,
       never touches css/ or the tab bar's ancestors;
     · no unicode dice pips as glyphs — the die is drawn in SVG;
     · sounds only through KARTI_SFX ids that already exist;
     · every player-visible string is a T(en, mt) pair at its call site
       — js/lang.js's rule — and the engine's {en,mt} TEXT is rendered
       here, never printed as an id;
     · the back arrow goes BACK. It never asks "are you sure": the game
       is autosaved on every move and the setup sheet offers it again at
       the top.

   THE DICE ONLINE — read the header of js/ludu.js first.
     A shared seed leaks every future roll. The engine's fair seam is
     DICE.given, fed by the relay stamping mv.d. The relay we talk to
     (js/mp.js) does NOT stamp dice today — it carries the move's own
     fields (WIRE_FIELDS = ['k','d']) faithfully, so if a client fills
     mv.d the wire keeps it, but nothing on the Pi generates entropy per
     roll. So online tables run on DICE.seed for now (honest, needs no
     round trip, PREDICTABLE by a client with the seed) and this file
     says so in the lobby. The seam is one flag on deal() — the day the
     relay stamps dice, flip opts.dice to 'given' and nothing else here
     changes. See ONLINE_DICE_NOTE.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_LUDU;
if (!K || !P || !R || !R.engine) return;

const E = R.engine;
const esc = (K && K.esc) || (s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');
const clone = o => JSON.parse(JSON.stringify(o));

/* ── the one language switch (js/lang.js) ────────────────────────── */
const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
/* the engine hands back {en,mt} pairs; render the right side, never the
   id, and never a bare English string */
const TE = pair => pair ? T(pair.en, pair.mt) : '';

/* ═══════════════════════════════════════════════════════════════════
   SEAT COLOUR — the engine publishes COLOURS (id, hex, name{en,mt}).
   The hexes are a suggestion the header says the UI may ignore; we take
   them, because eight legible token colours is exactly the hard part.
   ═══════════════════════════════════════════════════════════════════ */
const COLOURS = E.COLOURS || [];
const colourOf = id => COLOURS.find(c => c.id === id) || { id, hex:'#888', name:{ en:id, mt:id } };
const hexOf    = id => colourOf(id).hex;
const colourName = id => TE(colourOf(id).name);

/* ═══════════════════════════════════════════════════════════════════
   OUR CORNER OF localStorage — the save, the prefs and the record, the
   poker way: one key, debounced, flushed inline when the tab hides.
   ═══════════════════════════════════════════════════════════════════ */
const STORE  = 'karti_ludu_v1';
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

function pref(patch){
  if (patch){ Object.assign(ST.pref, patch); persist(); }
  return ST.pref;
}
function saveSlot(snap){ ST.save = snap || null; persist(); }

/* UI-only prefs in their own key — a UI preference is not the game, so
   binning a board must never forget how you keep the rules folded */
const UIKEY = 'karti_ludu_ui_v1';
let rulesOpen = false, setupOpen = false;
try { rulesOpen = localStorage.getItem(UIKEY + '.rules') === '1'; } catch(e){}
try { setupOpen = localStorage.getItem(UIKEY + '.setup') === '1'; } catch(e){}
function setSetupOpen(open){
  setupOpen = !!open;
  try { localStorage.setItem(UIKEY + '.setup', setupOpen ? '1' : '0'); } catch(e){}
}

/* ── the machine's three sharpnesses, off the engine's LEVELS. The NAME
   is a name in both languages (js/lang.js rule 3); only the note is a
   pair we translate. ─────────────────────────────────────────────── */
function levels(){
  return (E.LEVELS || []).map(L => ({ level:L.k, name:L.name, note:L.note, icon:L.icon }));
}
function levelName(k){
  const L = levels().find(x => x.level === k);
  return (L && L.name) || 'MAKNA';
}
function levelNote(k){
  const L = levels().find(x => x.level === k);
  return L ? TE(L.note) : '';
}

/* ═══════════════════════════════════════════════════════════════════
   SOUND — existing ids only (read js/sfx.js), through one gate so a
   fast run does not machine-gun the mixer.
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
function cueIn(ms, fn){
  const m = M;
  setTimeout(() => { if (M === m && M && !M.dead){ try { fn(); } catch(e){} } }, ms);
}
function reduced(){
  try {
    if (document.body && document.body.classList.contains('reduced')) return true;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch(e){ return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   THE RUNNER — (opts, seed, log) and one door for every move. The move
   subscribers are where the sound and the online forward hang; a
   rollback replay never passes through doMove, so it is silent by
   construction.
   ═══════════════════════════════════════════════════════════════════ */
let M = null;      /* the live match                                     */
let UI = null;     /* the board's DOM handles                            */
const moveSubs  = [];
const stateSubs = [];
function fireList(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }

/* THE ONE Math.random this file touches: a brand-new local match
   choosing its seed. From here the seed is data and the engine is pure.
   The engine has its own newSeed(); use it so both halves agree. */
function newSeed(){ return (E.newSeed ? E.newSeed() : (Math.random() * 0x100000000) | 0) >>> 0; }

function buildState(opts, seed, log){
  const st = E.deal(opts, seed);
  for (let i = 0; i < log.length; i++){
    const mv = log[i];
    const seat = (mv.t === 'quit') ? (mv.seat | 0) : E.turn(st);
    if (!E.check(st, mv, seat)) break;
    E.apply(st, Object.assign({}, mv, { seat }));
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
    anim: null,                       /* {kind, ...} the last thing to animate */
    recorded: false,
    net: null, meta: null
  };
  M.st = buildState(M.opts, M.seed, M.log);
  applyMeta();
  return M;
}
function applyMeta(){
  if (!M || !M.meta || !M.st) return;
  M.meta.forEach((m, i) => {
    const s = M.st.seats[i];
    if (!s || !m) return;
    if (m.name) s.name = m.name;
    if (m.own)  s.own  = m.own;
    if (m.lvl)  s.lvl  = m.lvl;
  });
}
function stopThinking(){ if (M && M.timer){ clearTimeout(M.timer); M.timer = 0; } }
function ownerOf(i){
  if (!M) return 'ai';
  const s = M.st.seats[i];
  return s && s.own ? s.own : 'ai';
}
const isLocal = i => { const o = ownerOf(i); return o === 'me' || o === 'hot'; };

/* THE gate. Every move — thumb, machine, wire, replay — is measured by
   the engine here and nowhere else. src distinguishes a local move (which
   the transport forwards) from a wire move (which it must not echo). */
function doMove(seat, move, src){
  if (!M || M.dead) return { ok:false, err:'no game' };
  if (E.over(M.st)) return { ok:false, err:'game over' };
  const t = (move && move.t === 'quit') ? seat : E.turn(M.st);
  if (t !== seat && !(move && move.t === 'quit')) return { ok:false, err:'not your turn' };
  if (!E.check(M.st, move, seat)) return { ok:false, err:'illegal move' };
  const rec = clone(move);
  rec.seat = seat;
  const idx = M.log.length;
  M.log.push(rec);
  E.apply(M.st, rec);
  autosave();
  fireList(moveSubs,  { seat, move:clone(move), index:idx, src:src || 'local' });
  fireList(stateSubs, { reason:'move', index:idx });
  return { ok:true, index:idx };
}

function snapshot(){
  if (!M) return null;
  return { v:SAVE_V, gid:'ludu', opts:clone(M.opts), seed:M.seed, log:clone(M.log) };
}
function autosave(){
  if (!M || M.net) return;               /* online games are not resumed here */
  if (E.over(M.st)){ saveSlot(null); return; }
  saveSlot(snapshot());
}

/* ═══════════════════════════════════════════════════════════════════
   THE SOUND OF A MOVE — one subscriber. Existing ids only: the die is
   dice.roll, a token stepping is piece.place, a capture is
   piece.capture, a token home is ui.reward.
   ═══════════════════════════════════════════════════════════════════ */
moveSubs.push(ev => {
  if (!M || M.dead) return;
  const mv = ev.move, mine = ev.seat >= 0 && isLocal(ev.seat);
  const st = M.st;
  if (mv.t === 'roll'){ cue('dice.roll', { gain: mine ? 0.85 : 0.6 }, true); return; }
  if (mv.t === 'pass'){ cue('ui.back',   { gain: 0.45 }); return; }
  if (mv.t === 'quit'){ cue('mp.left',   { gain: 0.7 }); return; }
  if (mv.t === 'move'){
    const why = st.why;
    if (why === 'capture'){ cue('piece.capture', { gain: mine ? 0.9 : 0.72 }, true); return; }
    if (why === 'home' || why === 'finished'){ cue('ui.reward', { gain: 0.9 }, true); return; }
    if (why === 'column'){ cue('piece.place', { gain: 0.7 }); cueIn(70, () => cue('ui.note', { gain:0.5 })); return; }
    if (why === 'entered'){ cue('piece.lift', { gain: 0.7 }); cueIn(60, () => cue('piece.place', { gain:0.6, force:true })); return; }
    cue('piece.place', { gain: mine ? 0.75 : 0.55 });
    return;
  }
});

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party. The identity is
   a rosette: a soft board disc, eight seat wells at the rim, a ring of
   travel squares, and the tokens as coloured discs told apart by seat.
   Kazin wood-and-felt, not poker's green — Ludo is a home board.
   ═══════════════════════════════════════════════════════════════════ */
let cssDone = false;
function injectCSS(){
  if (cssDone || document.getElementById('lu-runtime-css')){ cssDone = true; return; }
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'lu-runtime-css';
  st.textContent =
    '#scr-party{--lu-board:#241A3E;--lu-board2:#150F28;--lu-gold:var(--gold,#FFC542)}' +

    /* ── the host takes the slack; the board is a centred square ── */
    '#scr-party .pt-host.lu-host{align-items:stretch;justify-content:stretch;overflow:visible}' +
    '#scr-party .lu-wrap{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;' +
      'gap:5px;padding:6px 6px 7px;position:relative}' +

    /* ── the rail of seats across the top ── */
    '#scr-party .lu-seats{flex:0 0 auto;display:flex;gap:5px;overflow-x:auto;overflow-y:hidden;' +
      'padding:2px 2px 3px;-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
    '#scr-party .lu-seats::-webkit-scrollbar{display:none}' +
    '#scr-party .lu-seat{flex:0 0 auto;position:relative;display:flex;align-items:center;gap:6px;' +
      'min-width:0;padding:4px 9px 4px 5px;border-radius:11px;' +
      'background:rgba(0,0,0,.30);border:1px solid rgba(255,255,255,.09)}' +
    '#scr-party .lu-seat.on{background:rgba(255,197,66,.15);border-color:rgba(255,197,66,.6)}' +
    '#scr-party .lu-seat.out{opacity:.4}' +
    '#scr-party .lu-seat.done{opacity:.7}' +
    '#scr-party .lu-seat .sw{width:16px;height:16px;flex:0 0 auto;border-radius:50%;' +
      'box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.4),0 1px 3px rgba(0,0,0,.5)}' +
    '#scr-party .lu-seat .col{display:flex;flex-direction:column;gap:1px;min-width:0}' +
    '#scr-party .lu-seat .n{font:900 9px/1.1 var(--disp);letter-spacing:.05em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.72);max-width:74px;white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .lu-seat.on .n{color:var(--lu-gold)}' +
    '#scr-party .lu-seat .h{font:700 8px/1.1 var(--disp);letter-spacing:.02em;' +
      'color:rgba(255,255,255,.5)}' +
    '#scr-party .lu-seat .rk{position:absolute;top:-5px;right:-4px;min-width:16px;height:16px;' +
      'padding:0 3px;border-radius:99px;display:grid;place-items:center;font:900 9px/1 var(--disp);' +
      'color:#241800;background:linear-gradient(180deg,#FFDE8B,var(--lu-gold));' +
      'border:1.5px solid var(--bg,#0E0B14)}' +

    /* ── the board disc ── */
    '#scr-party .lu-boardbox{flex:1 1 auto;min-height:0;position:relative;display:flex;' +
      'align-items:center;justify-content:center}' +
    '#scr-party .lu-svg{display:block;touch-action:manipulation;' +
      '-webkit-tap-highlight-color:transparent;' +
      'filter:drop-shadow(0 10px 26px rgba(0,0,0,.5))}' +
    '#scr-party .lu-disc{fill:url(#lu-discg);stroke:rgba(0,0,0,.5);stroke-width:.5}' +
    '#scr-party .lu-cell{fill:rgba(255,255,255,.05);stroke:rgba(255,255,255,.11);stroke-width:.28}' +
    '#scr-party .lu-cell.safe{fill:rgba(255,255,255,.14);stroke:rgba(255,255,255,.30)}' +
    '#scr-party .lu-home{stroke:rgba(0,0,0,.35);stroke-width:.3}' +
    '#scr-party .lu-well{opacity:.9}' +
    '#scr-party .lu-goal{stroke:rgba(255,255,255,.5);stroke-width:.4}' +
    /* a legal destination pulses a gold ring — compositor transform only */
    '#scr-party .lu-hint{fill:none;stroke:var(--lu-gold);stroke-width:.9;opacity:.9;' +
      'transform-box:fill-box;transform-origin:center}' +
    '#scr-party.lu-anim .lu-hint{animation:lu-pulse 1.1s ease-in-out infinite}' +
    '@keyframes lu-pulse{0%,100%{transform:scale(.86);opacity:.55}50%{transform:scale(1.08);opacity:1}}' +

    /* ── the tokens ── */
    '#scr-party .lu-tok{cursor:pointer;transform-box:fill-box;transform-origin:center;' +
      'transition:transform .28s var(--ease,cubic-bezier(.22,.9,.28,1))}' +
    '#scr-party .lu-tok .body{stroke:rgba(0,0,0,.55);stroke-width:.5}' +
    '#scr-party .lu-tok .gloss{fill:rgba(255,255,255,.5)}' +
    '#scr-party .lu-tok.pick .body{stroke:#fff;stroke-width:1.1}' +
    '#scr-party .lu-tok.pick{animation:lu-bob 1s ease-in-out infinite}' +
    '@keyframes lu-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.3px)}}' +
    '#scr-party.lu-still .lu-tok.pick{animation:none}' +
    '#scr-party.lu-still .lu-tok{transition:none}' +
    'body.reduced #scr-party .lu-tok,body.reduced #scr-party.lu-anim .lu-hint,' +
      'body.reduced #scr-party .lu-tok.pick{animation:none!important;transition:none!important}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .lu-tok,#scr-party.lu-anim .lu-hint,' +
      '#scr-party .lu-tok.pick{animation:none!important;transition:none!important}}' +

    /* ── the die + the roll button, sat below the board ── */
    '#scr-party .lu-say{flex:0 0 auto;font:700 11.5px/1.4 var(--body);text-align:center;' +
      'color:rgba(255,255,255,.85);min-height:16px;padding:0 8px}' +
    '#scr-party .lu-say b{color:var(--lu-gold);font-weight:900}' +
    '#scr-party .lu-dock{flex:0 0 auto;display:flex;align-items:center;justify-content:center;' +
      'gap:12px;padding:3px 4px 2px}' +
    '#scr-party .lu-die{width:52px;height:52px;flex:0 0 auto;border-radius:13px;position:relative;' +
      'background:linear-gradient(155deg,#FFF7E4,#E9D9AE);border:1px solid rgba(0,0,0,.35);' +
      'box-shadow:0 4px 0 -1px rgba(0,0,0,.4),inset 0 2px 0 rgba(255,255,255,.7);' +
      'display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);' +
      'padding:9px;gap:2px}' +
    '#scr-party .lu-die i{border-radius:50%;background:#2A1E12;align-self:center;justify-self:center;' +
      'width:8px;height:8px;visibility:hidden}' +
    '#scr-party .lu-die i.on{visibility:visible}' +
    '#scr-party .lu-die.rolling{animation:lu-roll .5s var(--ease,ease)}' +
    '@keyframes lu-roll{0%{transform:rotate(0) scale(1)}45%{transform:rotate(200deg) scale(1.12)}' +
      '100%{transform:rotate(360deg) scale(1)}}' +
    'body.reduced #scr-party .lu-die.rolling,' +
      '@media (prefers-reduced-motion:reduce){#scr-party .lu-die.rolling{animation:none}}' +
    '#scr-party .lu-roll{min-width:118px;min-height:52px;padding:0 18px;border-radius:14px;' +
      'font:900 13px/1 var(--disp);letter-spacing:.06em;text-transform:uppercase;color:#241800;' +
      'background:linear-gradient(180deg,#FFD979,var(--lu-gold));border:1px solid #FFE9B0;' +
      'box-shadow:0 3px 0 -1px rgba(0,0,0,.4);-webkit-tap-highlight-color:transparent}' +
    '#scr-party .lu-roll:not([disabled]):active{transform:translateY(2px);box-shadow:none}' +
    '#scr-party .lu-roll[disabled]{opacity:.4}' +
    '#scr-party .lu-roll.ghost{background:rgba(255,255,255,.08);color:var(--txt);' +
      'border-color:rgba(255,255,255,.2);box-shadow:none}' +

    /* ── the rules panel: hide-and-slide from the top, never a wall ── */
    '#scr-party .lu-rules{position:absolute;top:0;left:0;right:0;z-index:30;max-height:60%;' +
      'display:flex;flex-direction:column;border-radius:14px;overflow:hidden;' +
      'background:linear-gradient(180deg,#2A1F49,#140E26);border:1px solid rgba(255,255,255,.16);' +
      'box-shadow:0 14px 30px rgba(0,0,0,.55);' +
      'transform:translateY(-108%);opacity:0;visibility:hidden;pointer-events:none;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease),visibility 0s .26s}' +
    '#scr-party .lu-rules.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease)}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .lu-rules{transition:none}}' +
    'body.reduced #scr-party .lu-rules{transition:none}' +
    '#scr-party .lu-rules-h{flex:0 0 auto;display:flex;align-items:center;' +
      'justify-content:space-between;padding:9px 4px 2px 14px}' +
    '#scr-party .lu-rules-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--lu-gold)}' +
    '#scr-party .lu-rules-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;' +
      'color:var(--txt);cursor:pointer;display:grid;place-items:center;' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .lu-rules-x svg{width:16px;height:16px;stroke:currentColor;fill:none;' +
      'stroke-width:2.2;stroke-linecap:round}' +
    '#scr-party .lu-rules-b{min-height:0;overflow-y:auto;padding:2px 14px 12px;' +
      '-webkit-overflow-scrolling:touch}' +
    '#scr-party .lu-rules-b li{font-size:12px;line-height:1.6;color:var(--dim);margin:0 0 6px 14px}' +

    /* ── landscape: seats down the side, board and dock in a row ── */
    '@media (max-height:520px){' +
      '#scr-party .lu-wrap{flex-direction:row;align-items:stretch;gap:7px}' +
      '#scr-party .lu-seats{flex-direction:column;flex:0 0 auto;overflow-y:auto;overflow-x:hidden;' +
        'max-width:120px}' +
      '#scr-party .lu-seat{min-width:0}' +
      '#scr-party .lu-mid{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:4px}' +
      '#scr-party .lu-say{order:-1}' +
      '#scr-party .lu-rules{max-height:88%}' +
    '}' +
    '@media (min-height:521px){#scr-party .lu-mid{display:contents}}' +

    /* ── THE SETUP SHEET'S OWN FACE — the rosette worn as a badge ── */
    '#scr-party .lu-menu .pt-lbl{color:#C4AEFF}' +
    '#scr-party .lu-menu .lu-hero{position:relative;display:flex;align-items:center;' +
      'justify-content:center;margin:2px 0 12px;padding:16px 8px;border-radius:16px;overflow:hidden;' +
      'background:radial-gradient(120% 130% at 50% 20%,#2E2153 0%,var(--lu-board) 52%,var(--lu-board2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.06),' +
      'inset 0 -14px 26px rgba(0,0,0,.4)}' +
    '#scr-party .lu-menu .lu-hero svg{width:150px;height:150px;display:block}' +
    '#scr-party .lu-menu .lu-hero-cap{position:absolute;right:11px;bottom:8px;' +
      'font:900 9.5px/1 var(--disp);letter-spacing:.18em;color:rgba(255,255,255,.32)}' +
    '#scr-party .lu-step{display:flex;align-items:center;gap:10px;justify-content:center;padding:4px 0}' +
    '#scr-party .lu-step .v{font:900 26px/1 var(--disp);color:var(--lu-gold);min-width:104px;' +
      'text-align:center}' +
    '#scr-party .lu-step .v i{display:block;font:700 9px/1.4 var(--disp);font-style:normal;' +
      'letter-spacing:.12em;color:var(--dim);text-transform:uppercase}' +
    '#scr-party .lu-rnd{width:46px;height:46px;border-radius:12px;font:900 22px/1 var(--disp);' +
      'color:var(--txt);background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.2)}' +
    '#scr-party .lu-rnd[disabled]{opacity:.35}' +
    '#scr-party .lu-fold-h{display:flex;align-items:center;gap:10px;width:100%;text-align:left;' +
      'border:0;background:none;padding:2px 0;margin:0;color:var(--txt);cursor:pointer;' +
      'min-height:44px;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .lu-fold-h span{flex:1;min-width:0}' +
    '#scr-party .lu-fold-h b{display:block;font:900 10px/1.4 var(--disp);letter-spacing:.11em;' +
      'text-transform:uppercase;color:var(--lu-gold)}' +
    '#scr-party .lu-fold-h i{display:block;font-style:normal;font-size:10.5px;line-height:1.4;' +
      'color:var(--dim);margin-top:3px}' +
    '#scr-party .lu-fold-h em{flex:0 0 auto;width:24px;height:24px;display:grid;place-items:center;' +
      'color:var(--dim)}' +
    '#scr-party .lu-fold-h em svg{width:15px;height:15px;stroke:currentColor;fill:none;' +
      'stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;transition:transform .22s var(--ease)}' +
    '#scr-party .lu-fold-h[aria-expanded="true"] em svg{transform:rotate(90deg)}' +
    '#scr-party .lu-fold-b{display:grid;grid-template-rows:0fr;' +
      'transition:grid-template-rows .28s var(--ease)}' +
    '#scr-party .lu-fold-b.open{grid-template-rows:1fr}' +
    '#scr-party .lu-fold-i{overflow:hidden;min-height:0}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .lu-fold-b{transition:none}}' +
    'body.reduced #scr-party .lu-fold-b{transition:none}' +
    '#scr-party .lu-note{font-size:11.5px;line-height:1.6;margin:8px 2px 0;padding:9px 11px;' +
      'border-radius:12px;text-transform:none;letter-spacing:0;color:#CFC2F0;' +
      'background:rgba(138,92,255,.10);border:1px solid rgba(138,92,255,.3)}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   THE BOARD — drawn from the engine's layout(). layout(n) returns polar
   coords (a in turns, r in 0..1) and an xy(a,r) helper; we map that into
   an SVG viewBox centred on 0,0 with radius 100. Nothing about the
   geometry is invented here — it is the engine's own numbers, so the
   picture cannot disagree with the rules.
   ═══════════════════════════════════════════════════════════════════ */
const VB = 240, C = VB / 2, RAD = 112;   /* viewBox, centre, board radius */
function layoutFor(st){
  return E.layout(st.n, st.homeLen, st.safeMode);
}
/* an engine polar point → svg px */
function pxOf(lay, a, r){
  const p = lay.xy(a, r);
  return { x: C + p.x * RAD, y: C + p.y * RAD };
}

/* the ring square path — a small rounded rect, oriented is not needed at
   phone size; a disc reads cleaner and never seams */
function cellR(lay){ return Math.max(4.4, 7.2 - lay.P * 0.28); }
function tokR(lay){ return cellR(lay) * 0.86; }

/* one die face, pips lit */
function dieFace(n){
  const map = {
    1:[4], 2:[0,8], 3:[0,4,8], 4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8]
  };
  const on = map[n] || [];
  let s = '';
  for (let i = 0; i < 9; i++) s += '<i' + (on.indexOf(i) >= 0 ? ' class="on"' : '') + '></i>';
  return s;
}

/* ═══════════════════════════════════════════════════════════════════
   THE FRAME + THE BOARD DOM
   ═══════════════════════════════════════════════════════════════════ */
function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: 'LUDU',
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'lu-rules', label:T('Rules', 'Regoli'), icon:'book',    cls:'ghost' },
      { id:'lu-new',   label:T('New', 'Ġdida'),    icon:'refresh', cls:'ghost' }
    ]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();     /* we size our own square board */
  M.ctx.badge.textContent = M.st.n + ' · ' +
    (M.net ? T('Online', 'Onlajn') : levelName(pickLvl()));
  buildBoard();
  M.ctx.btn('lu-rules').onclick = () => setRules(!rulesOpen);
  const nb = M.ctx.btn('lu-new');
  if (nb) nb.onclick = () => {
    if (M.net){ return; }
    P.ui.confirm(M.ctx, {
      head: T('Start a fresh board?', 'Tibda tabellun ġdid?'),
      why:  T('This game goes back in the box and you set up a new one.',
              'Din il-logħba terġa’ lura fil-kaxxa u tibda oħra.'),
      yes:  T('New board', 'Tabellun ġdid'),
      no:   T('No, carry on', 'Le, kompli'),
      go: () => setupSheet()
    });
  };
  paintRules();
}
function pickLvl(){
  if (!M) return 2;
  const ai = M.st.seats.find(s => s.own === 'ai');
  return ai ? ai.lvl : (pref().lvl || 2);
}

function buildBoard(){
  const ctx = M.ctx;
  ctx.host.classList.add('lu-host');
  ctx.host.innerHTML =
    '<div class="lu-wrap" id="lu-wrap">' +
      '<div class="lu-seats" id="lu-seats"></div>' +
      '<div class="lu-mid">' +
        '<div class="lu-boardbox" id="lu-boardbox"></div>' +
        '<div class="lu-say" id="lu-say"></div>' +
        '<div class="lu-dock" id="lu-dock"></div>' +
      '</div>' +
      '<div class="lu-rules" id="lu-rulespanel" aria-hidden="true">' +
        '<div class="lu-rules-h"><h4 id="lu-rules-t"></h4>' +
          '<button class="lu-rules-x" id="lu-rules-x" aria-label="' +
            esc(T('Put the rules away', 'Warrab ir-regoli')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button></div>' +
        '<div class="lu-rules-b" id="lu-rules-b"></div>' +
      '</div>' +
    '</div>';
  const root = ctx.host.querySelector('#lu-wrap');
  UI = {
    ctx, root,
    seats:    root.querySelector('#lu-seats'),
    boardbox: root.querySelector('#lu-boardbox'),
    say:      root.querySelector('#lu-say'),
    dock:     root.querySelector('#lu-dock'),
    rules:    root.querySelector('#lu-rulespanel'),
    svg: null, dieEl: null, rollEl: null
  };
  root.querySelector('#lu-rules-x').addEventListener('click', () => setRules(false));
  /* tap outside the rules panel puts it away; the board under it stays live */
  ctx.root.addEventListener('pointerdown', e => {
    if (!rulesOpen || !UI || !UI.rules) return;
    const rb = ctx.btn && ctx.btn('lu-rules');
    if (!UI.rules.contains(e.target) && !(rb && rb.contains(e.target))) setRules(false);
  }, true);
  sizeBoard();
  if (typeof ResizeObserver === 'function'){
    UI._ro = new ResizeObserver(() => sizeBoard());
    UI._ro.observe(UI.boardbox);
  } else {
    UI._onResize = () => sizeBoard();
    window.addEventListener('resize', UI._onResize);
  }
  render();
}

/* the board is the biggest square that fits the box */
function sizeBoard(){
  if (!UI || !UI.boardbox || !UI.boardbox.isConnected) return;
  const w = UI.boardbox.clientWidth, h = UI.boardbox.clientHeight;
  if (!w || !h) return;
  const s = Math.max(180, Math.floor(Math.min(w, h)));
  if (UI.svg){ UI.svg.style.width = s + 'px'; UI.svg.style.height = s + 'px'; }
}

/* ═══════════════════════════════════════════════════════════════════
   RENDER — the whole screen off the engine's readers. Cheap enough to
   redraw whole; a Ludo board is ~60 elements.
   ═══════════════════════════════════════════════════════════════════ */
function render(){
  if (!M || !UI || !UI.root || !UI.root.isConnected) return;
  const st = M.st;
  paintSeats();
  paintBoard();
  paintDock();
  paintSay();
  /* motion classes */
  const still = reduced();
  document.getElementById('scr-party') &&
    document.getElementById('scr-party').classList.toggle('lu-anim', !still);
  document.getElementById('scr-party') &&
    document.getElementById('scr-party').classList.toggle('lu-still', still);
  maybeThink();
  if (E.over(st)) finish();
}

function paintSeats(){
  const st = M.st, tally = E.tally(st), turn = E.turn(st);
  UI.seats.innerHTML = tally.map(s => {
    const on = (s.seat === turn && !E.over(st)) ? ' on' : '';
    const out = s.gone ? ' out' : '';
    const done = s.done ? ' done' : '';
    const nm = isLocal(s.seat) ? T('You', 'Int')
             : s.own === 'ai' ? levelName(s.lvl)
             : s.name;
    return '<div class="lu-seat' + on + out + done + '">' +
      '<span class="sw" style="background:' + esc(hexOf(s.colour)) + '"></span>' +
      '<span class="col">' +
        '<span class="n">' + esc(nm) + '</span>' +
        '<span class="h">' + s.home + '/' + st.tokens + ' ' + esc(T('home', 'id-dar')) + '</span>' +
      '</span>' +
      (s.rank ? '<span class="rk">' + s.rank + '</span>' : '') +
    '</div>';
  }).join('');
}

function paintBoard(){
  const st = M.st, lay = layoutFor(st);
  const cr = cellR(lay), tr = tokR(lay);
  const pend = E.pending(st);
  const myTurn = !E.over(st) && isLocal(E.turn(st));
  const canMove = myTurn && pend.phase === 'move';
  const legalToks = {};   /* seat:tok -> destination px, for hints */
  if (canMove) pend.moves.forEach(m => { legalToks[E.turn(st) + ':' + m.k] = m; });

  /* the disc */
  let s = '<svg class="lu-svg" id="lu-svg" viewBox="0 0 ' + VB + ' ' + VB + '" ' +
    'xmlns="http://www.w3.org/2000/svg" aria-label="' +
    esc(T('The Ludo board', 'It-tabellun tal-Ludu')) + '">' +
    '<defs>' +
      '<radialGradient id="lu-discg" cx="50%" cy="38%" r="72%">' +
        '<stop offset="0" stop-color="#2E2153"/><stop offset="60%" stop-color="#241A3E"/>' +
        '<stop offset="100%" stop-color="#150F28"/></radialGradient>' +
    '</defs>' +
    '<circle class="lu-disc" cx="' + C + '" cy="' + C + '" r="' + (RAD + 6) + '"/>';

  /* the seat wells + goal triangles at the rim, in seat colour */
  lay.seats.forEach(se => {
    const hx = hexOf(se.colour);
    const yard = pxOf(lay, se.axis, 0.995);
    s += '<circle class="lu-well" cx="' + yard.x.toFixed(1) + '" cy="' + yard.y.toFixed(1) +
      '" r="' + (cr * 2.1).toFixed(1) + '" fill="' + esc(hx) + '" fill-opacity="0.16" ' +
      'stroke="' + esc(hx) + '" stroke-opacity="0.5" stroke-width="0.7"/>';
    /* the home goal near the centre */
    const g = pxOf(lay, se.axis, 0.06);
    s += '<circle class="lu-goal" cx="' + g.x.toFixed(1) + '" cy="' + g.y.toFixed(1) +
      '" r="' + (cr * 0.9).toFixed(1) + '" fill="' + esc(hx) + '" fill-opacity="0.5"/>';
    /* the home column path, tinted */
    se.col.forEach(cc => {
      const p = pxOf(lay, cc.a, cc.r);
      s += '<circle class="lu-home" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) +
        '" r="' + (cr * 0.72).toFixed(1) + '" fill="' + esc(hx) + '" fill-opacity="0.22"/>';
    });
  });

  /* the travel ring */
  lay.ring.forEach(rc => {
    const p = pxOf(lay, rc.a, rc.r);
    let cls = 'lu-cell' + (rc.safe ? ' safe' : '');
    let extra = '';
    if (rc.entryOf != null){
      const hx = hexOf(colourFor(st, rc.entryOf));
      extra = ' fill="' + esc(hx) + '" fill-opacity="0.28"';
    }
    s += '<circle class="' + cls + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) +
      '" r="' + cr.toFixed(1) + '"' + extra + '/>';
    if (rc.safe && rc.entryOf == null){
      /* a small star mark for the neutral safe squares */
      s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' +
        (cr * 0.28).toFixed(1) + '" fill="rgba(255,255,255,.55)"/>';
    }
  });

  /* the tokens, grouped by square so stacks fan out a touch */
  const toks = E.tokens(st);
  /* index tokens by their pixel cell so a stack can offset */
  const stackAt = {};
  const posOf = tk => {
    if (tk.where === 'yard'){
      const ySeat = lay.seats[tk.seat];
      const slot = ySeat.yard[tk.tok % ySeat.yard.length];
      return pxOf(lay, slot.a, slot.r);
    }
    if (tk.where === 'home'){
      const g = lay.seats[tk.seat].home;
      return pxOf(lay, g.a, 0.06);
    }
    if (tk.where === 'col'){
      const col = lay.seats[tk.seat].col;
      const cc = col[Math.min(tk.col, col.length - 1)];
      return pxOf(lay, cc.a, cc.r);
    }
    /* ring */
    const rc = lay.ring[tk.ring];
    return pxOf(lay, rc.a, rc.r);
  };

  toks.forEach(tk => {
    const base = posOf(tk);
    const key = Math.round(base.x) + ',' + Math.round(base.y);
    const n = (stackAt[key] = (stackAt[key] || 0) + 1) - 1;
    const off = n === 0 ? { x:0, y:0 } : { x:(n % 2 ? 1 : -1) * tr * 0.5, y:(n > 1 ? tr * 0.5 : -tr * 0.4) };
    const cx = base.x + off.x, cy = base.y + off.y;
    const hx = hexOf(tk.colour);
    const legal = legalToks[tk.seat + ':' + tk.tok];
    const pick = !!legal;
    s += '<g class="lu-tok' + (pick ? ' pick' : '') + '"' +
      (pick ? ' data-tok="' + tk.tok + '" role="button" tabindex="0" aria-label="' +
        esc(T('Move this token', 'Ċaqlaq din il-biċċa')) + '"' : ' aria-hidden="true"') +
      '>' +
      '<circle class="body" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' +
        tr.toFixed(1) + '" fill="' + esc(hx) + '"/>' +
      '<circle class="gloss" cx="' + (cx - tr * 0.28).toFixed(1) + '" cy="' +
        (cy - tr * 0.32).toFixed(1) + '" r="' + (tr * 0.28).toFixed(1) + '" fill-opacity="0.55"/>';
    /* a legal move gets a gold destination ring drawn at the target cell */
    if (legal){
      const dest = destPx(st, lay, tk.seat, legal);
      if (dest) s += '<circle class="lu-hint" cx="' + dest.x.toFixed(1) + '" cy="' +
        dest.y.toFixed(1) + '" r="' + (cr + 1.5).toFixed(1) + '"/>';
    }
    s += '</g>';
  });

  s += '</svg>';
  UI.boardbox.innerHTML = s;
  UI.svg = UI.boardbox.querySelector('#lu-svg');
  sizeBoard();

  /* one delegated tap handler for the tokens */
  UI.svg.addEventListener('click', onBoardTap);
  UI.svg.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' '){ onBoardTap(e); }
  });
}

/* the colour worn by a seat index (for entry-square tinting) */
function colourFor(st, seat){
  const s = st.seats[seat % st.n];
  return s ? s.colour : (COLOURS[seat % COLOURS.length] || {}).id;
}

/* where a legal move lands, in board px — mirror the engine's tokens()
   mapping for the destination position `to` */
function destPx(st, lay, seat, m){
  const bd = E.bdOf(st), R = lay.R, HOME = lay.HOME;
  const to = m.to;
  if (to === HOME){ const g = lay.seats[seat].home; return pxOf(lay, g.a, 0.06); }
  if (to > R - 1){
    const col = lay.seats[seat].col;
    const cc = col[Math.min(to - R, col.length - 1)];
    return pxOf(lay, cc.a, cc.r);
  }
  const ri = bd.sq(seat, to);
  const rc = lay.ring[ri];
  return pxOf(lay, rc.a, rc.r);
}

function onBoardTap(e){
  if (!M || M.dead) return;
  const g = e.target && e.target.closest && e.target.closest('.lu-tok[data-tok]');
  if (!g) return;
  const seat = E.turn(M.st);
  if (!isLocal(seat)) return;
  const k = g.getAttribute('data-tok') | 0;
  const res = doMove(seat, { t:'move', k }, 'local');
  if (!res.ok){ cue('move.illegal', { gain:0.7 }); return; }
  render();
}

function paintDock(){
  const st = M.st;
  const pend = E.pending(st);
  const turn = E.turn(st);
  const mine = !E.over(st) && isLocal(turn);
  const dieN = st.die || (st.last && st.last.t === 'roll' ? st.last.d : 0);
  const rolling = !!(M.anim && M.anim.kind === 'roll');
  let dock = '<div class="lu-die' + (rolling ? ' rolling' : '') + '" id="lu-die" aria-hidden="true">' +
    dieFace(dieN || 0) + '</div>';
  if (E.over(st)){
    dock += '<button class="lu-roll ghost" id="lu-roll" disabled>' +
      esc(T('Game over', 'Spiċċat')) + '</button>';
  } else if (mine && pend.phase === 'roll'){
    dock += '<button class="lu-roll" id="lu-roll">' + esc(TE(E.t('roll'))) + '</button>';
  } else if (mine && pend.phase === 'move' && pend.moves.length === 0){
    dock += '<button class="lu-roll" id="lu-roll">' + esc(T('Pass', 'Għaddi')) + '</button>';
  } else if (mine && pend.phase === 'move'){
    dock += '<button class="lu-roll ghost" id="lu-roll" disabled>' +
      esc(T('Tap a token', 'Agħfas biċċa')) + '</button>';
  } else {
    dock += '<button class="lu-roll ghost" id="lu-roll" disabled>' +
      esc(T('Their turn', 'Imisshom')) + '</button>';
  }
  UI.dock.innerHTML = dock;
  UI.dieEl = UI.dock.querySelector('#lu-die');
  UI.rollEl = UI.dock.querySelector('#lu-roll');
  if (UI.rollEl && !UI.rollEl.disabled){
    UI.rollEl.onclick = () => {
      const seat = E.turn(M.st);
      if (!isLocal(seat)) return;
      const pend2 = E.pending(M.st);
      if (pend2.phase === 'roll'){ rollAnd(seat); }
      else if (pend2.phase === 'move' && pend2.moves.length === 0){
        doMove(seat, { t:'pass' }, 'local'); render();
      }
    };
  }
}

/* a local roll, with the die animation then the result painted */
function rollAnd(seat){
  const st = M.st;
  /* under DICE.seed the engine rolls; under DICE.given (fair, online
     when the relay stamps it) the value must arrive on the move — solo
     always uses seed so mv has no d */
  const need = E.diceOf(st).needsValue;
  const mv = { t:'roll' };
  if (need){
    /* the relay is meant to supply this; offline/seed never gets here.
       If we ever reach it without a relay value, fall back to a fair
       local draw so the die is not stuck. */
    mv.d = 1 + (Math.floor(Math.random() * 6) % 6);
  }
  M.anim = { kind:'roll' };
  const res = doMove(seat, mv, 'local');
  if (!res.ok){ M.anim = null; render(); return; }
  render();
  /* clear the rolling class after the animation frame so the next paint
     is still */
  const die = UI && UI.dieEl;
  if (die && !reduced()){
    setTimeout(() => { M && (M.anim = null); if (UI) paintDock(); }, 520);
  } else { M.anim = null; }
}

function paintSay(){
  const st = M.st;
  const n = E.note(st);
  let head;
  if (E.over(st)){
    head = TE(n.text);
  } else {
    const turn = E.turn(st);
    const mine = isLocal(turn);
    const who = mine ? T('Your turn', 'Imissek int')
      : (isLocal(turn) ? st.seats[turn].name
         : ownerOf(turn) === 'ai' ? levelName(st.seats[turn].lvl)
         : st.seats[turn].name);
    const line = TE(n.text);
    head = mine
      ? '<b>' + esc(who) + '</b> · ' + esc(line)
      : esc(who) + ' — ' + esc(line);
  }
  UI.say.innerHTML = head;
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE'S TURN — the engine's think() drives it. Solo works fully
   offline: seat by seat, roll then move then pass, with a short beat so
   a person can watch the pieces move.
   ═══════════════════════════════════════════════════════════════════ */
function maybeThink(){
  if (!M || M.dead || M.timer) return;
  const st = M.st;
  if (E.over(st)) return;
  const seat = E.turn(st);
  /* a machine seat we run locally: any AI seat is ours to drive; an
     online table lets the HOST drive the bots and every phone drive
     nobody else. mp.js relays what the host applies. */
  if (ownerOf(seat) !== 'ai') return;
  if (M.net && M.net.seat !== M.net.host) return;   /* only the host thinks for bots */
  const delay = reduced() ? 60 : 460;
  M.timer = setTimeout(() => {
    M.timer = 0;
    if (!M || M.dead) return;
    const st2 = M.st;
    if (E.over(st2) || ownerOf(E.turn(st2)) !== 'ai') { render(); return; }
    const s2 = E.turn(st2);
    const pend = E.pending(st2);
    if (pend.phase === 'roll'){
      const mv = E.think(st2, s2, st2.seats[s2].lvl);
      /* under `given` think() returns null on a roll — supply a fair
         value so an online host's bot is not stuck */
      const roll = mv || { t:'roll' };
      if (E.diceOf(st2).needsValue && roll.t === 'roll' && roll.d == null)
        roll.d = 1 + (Math.floor(Math.random() * 6) % 6);
      M.anim = { kind:'roll' };
      doMove(s2, roll, 'local');
      render();
      setTimeout(() => { if (M){ M.anim = null; render(); } }, reduced() ? 40 : 420);
    } else {
      const mv = E.think(st2, s2, st2.seats[s2].lvl) || { t:'pass' };
      doMove(s2, mv, 'local');
      render();
    }
  }, delay);
}

/* ═══════════════════════════════════════════════════════════════════
   THE END — into the shared AAA winner screen (js/rebbieh.js). One row
   per seat, in the engine's placing order, the local seat flagged, the
   winner crowned. onPlayAgain returns to the lobby/setup; onLeave leaves.
   ═══════════════════════════════════════════════════════════════════ */
function finish(){
  if (!M || M.finished) return;
  M.finished = true;
  stopThinking();
  const st = M.st;
  const ov = E.over(st);
  const me = E.meSeat(st);
  const tally = E.tally(st);
  /* record the table result offline (win = local seat first) */
  if (!M.net && !M.recorded){
    M.recorded = true;
    if (ov && ov.winner === me) ST.rec.w++; else ST.rec.l++;
    persist();
  }
  saveSlot(null);

  const order = (ov && ov.ranks && ov.ranks.length) ? ov.ranks
    : tally.slice().sort((a,b) => (a.rank||99) - (b.rank||99)).map(t => t.seat);
  const rows = order.map((seat, i) => {
    const s = st.seats[seat];
    const isMe = isLocal(seat);
    return {
      name: isMe ? T('You', 'Int')
        : s.own === 'ai' ? levelName(s.lvl) + ' ' + (seat + 1)
        : s.name,
      place: i + 1,
      you: isMe,
      bot: s.own === 'ai',
      score: colourName(s.colour),
      border: s.colour                    /* the seat colour frames the avatar */
    };
  });

  const show = window.KARTI_REBBIEH && window.KARTI_REBBIEH.show;
  if (!show){
    /* rebbieh not on the page — fall back to the party result card */
    P.ui.result(M.ctx, {
      tone: (ov && ov.winner === me) ? 'win' : 'lose',
      head: TE(ov ? ov.head : E.t('won')),
      why:  TE(ov ? ov.why : null),
      quip: TE(ov ? ov.quip : null),
      buttons: [
        { label:T('Play again', 'Erġa\' lgħab'), icon:'refresh', cls:'primary',
          go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else setupSheet(); } },
        { label:T('Leave', 'Oħroġ'), icon:'back', cls:'ghost',
          go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }
      ]
    });
    return;
  }
  const net = M.net;
  show({
    title: (ov && ov.tone === 'win') ? T('You are home', 'Wasalt id-dar')
                                     : TE(ov ? ov.head : E.t('won')),
    subtitle: T('Final standings', 'Klassifika finali'),
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
  if (UI && UI._ro){ try { UI._ro.disconnect(); } catch(e){} }
  if (UI && UI._onResize){ try { window.removeEventListener('resize', UI._onResize); } catch(e){} }
  if (M){
    autosave();
    persistNow();
    M.dead = true;
  }
  M = null; UI = null;
}

/* ═══════════════════════════════════════════════════════════════════
   THE RULES CARD — one game, told once, both languages. The stars/safe
   squares and the exact-finish are the two things people argue about, so
   they get their own lines.
   ═══════════════════════════════════════════════════════════════════ */
function rulesFor(){
  return [
    T('Every player has four tokens parked in a yard. A token only leaves the yard on a ' +
      '<b>six</b>.',
      'Kull plejer għandu erba’ biċċiet fil-bitħa. Biċċa toħroġ biss b’<b>sitta</b>.'),
    T('Once out, a token runs the whole ring, turns into its own home column, and must roll ' +
      'the <b>exact</b> number to step home — an overshoot does not move.',
      'Ladarba barra, il-biċċa ddur mad-dawra kollha, tidħol fil-kolonna tad-dar tagħha, u ' +
      'trid titfa’ n-numru <b>eżatt</b> biex tidħol id-dar — jekk taqbeż, ma tiċċaqlaqx.'),
    T('Land on a lone opponent and you send that token <b>all the way back</b> to its yard. ' +
      'A capture buys you another roll.',
      'Jekk taqa’ fuq biċċa waħedha tal-avversarju, tibgħatha <b>lura kollox</b> fil-bitħa ' +
      'tagħha. Qabda tagħtik tefgħa oħra.'),
    T('<b>Safe squares</b> — the stars and every player’s own entry — shelter you: nobody can ' +
      'capture you there.',
      'Il-<b>kwadri sikuri</b> — l-istilel u d-daħla ta’ kull plejer — jipproteġuk: ħadd ma ' +
      'jista’ jaqbdek hemm.'),
    T('Two of your own on one square make a <b>block</b> nobody can land on or pass.',
      'Tnejn tiegħek fuq l-istess kwadru jagħmlu <b>blokk</b> li ħadd ma jista’ jaqa’ fuqu ' +
      'jew jaqbeż.'),
    T('A <b>six rolls again</b>. Three sixes in one turn and the turn is <b>lost</b>.',
      '<b>Sitta terġa’ titfa’</b>. Tliet sittiet f’dawra waħda u <b>titlef</b> id-dawra.'),
    T('First player to get <b>all four tokens home</b> wins.',
      'L-ewwel plejer li jġib <b>l-erba’ biċċiet kollha d-dar</b> jirbaħ.')
  ];
}
function paintRules(){
  if (!UI || !UI.rules) return;
  UI.rules.querySelector('#lu-rules-t').textContent = 'LUDU — ' + T('the rules', 'ir-regoli');
  UI.rules.querySelector('#lu-rules-b').innerHTML =
    '<ul style="margin:0;padding:0">' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul>';
  UI.rules.classList.toggle('open', rulesOpen);
  UI.rules.setAttribute('aria-hidden', rulesOpen ? 'false' : 'true');
  const rb = M && M.ctx && M.ctx.btn && M.ctx.btn('lu-rules');
  if (rb) rb.setAttribute('aria-expanded', rulesOpen ? 'true' : 'false');
}
function setRules(open){
  rulesOpen = !!open;
  try { localStorage.setItem(UIKEY + '.rules', rulesOpen ? '1' : '0'); } catch(e){}
  cue(rulesOpen ? 'ui.sheet' : 'ui.back', { gain:0.8 });
  paintRules();
}

/* ═══════════════════════════════════════════════════════════════════
   THE SETUP SHEET — the player count, the difficulty, and Start, with
   the rules FOLDED shut. Back goes to the party hub; NO confirmation
   popup.
   ═══════════════════════════════════════════════════════════════════ */
const SIZES = (E.SIZES && E.SIZES.length) ? E.SIZES : [4, 6, 8];

/* the rosette badge, drawn from a layout at the chosen size */
function heroSVG(n){
  const lay = E.layout(n, E.HOME_LEN, 'stars');
  const cr = cellR(lay);
  let s = '<svg viewBox="0 0 ' + VB + ' ' + VB + '" xmlns="http://www.w3.org/2000/svg" ' +
    'aria-hidden="true">' +
    '<defs><radialGradient id="lu-herog" cx="50%" cy="35%" r="72%">' +
    '<stop offset="0" stop-color="#3A2A66"/><stop offset="100%" stop-color="#171029"/>' +
    '</radialGradient></defs>' +
    '<circle cx="' + C + '" cy="' + C + '" r="' + (RAD + 6) + '" fill="url(#lu-herog)" ' +
    'stroke="rgba(0,0,0,.5)" stroke-width="0.6"/>';
  lay.seats.forEach(se => {
    const hx = hexOf(se.colour);
    const y = pxOf(lay, se.axis, 0.99);
    s += '<circle cx="' + y.x.toFixed(1) + '" cy="' + y.y.toFixed(1) + '" r="' +
      (cr * 2).toFixed(1) + '" fill="' + esc(hx) + '" fill-opacity="0.7"/>';
    const g = pxOf(lay, se.axis, 0.05);
    s += '<circle cx="' + g.x.toFixed(1) + '" cy="' + g.y.toFixed(1) + '" r="' +
      (cr).toFixed(1) + '" fill="' + esc(hx) + '"/>';
  });
  lay.ring.forEach(rc => {
    const p = pxOf(lay, rc.a, rc.r);
    s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' +
      (cr * 0.7).toFixed(1) + '" fill="rgba(255,255,255,' + (rc.safe ? '.4' : '.14') + ')"/>';
  });
  return s + '</svg>';
}

/* ═══════════════════════════════════════════════════════════════════
   THE ENTRY SCREEN — MINIMAL. The player picks HOW to play, optionally
   reads the rules (a clean slide-up, never a wall), and goes. Big
   choices in order: PLAY ONLINE (primary, top), PLAY WITH AI, PASS THE
   PHONE. No settings here — those come AFTER a mode is chosen, and even
   then only a tiny inline choice (player count, and difficulty for AI).
   ═══════════════════════════════════════════════════════════════════ */
function setupSheet(){
  injectCSS();
  P.show();
  stopThinking(); M = null; UI = null;
  const el = P.ui.screenEl();
  const online = canGoOnline();

  el.innerHTML =
    '<div class="pt-wrap lu-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="lu-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>LUDU</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="lu-hero" aria-hidden="true">' + heroSVG(4) +
        '<span class="lu-hero-cap">4 &middot; 6 &middot; 8</span></div>' +
      '<p class="blurb">' +
        T('Four tokens each, one long lap, and no mercy. Get all four home before anybody ' +
          'else — and knock theirs back to the yard on the way.',
          'Erba’ biċċiet kull wieħed, dawra twila waħda, u ebda ħniena. Ġib l-erbgħa d-dar ' +
          'qabel ħaddieħor — u waqqagħlhom tagħhom lura fil-bitħa fit-triq.') +
      '</p>' +

      (ST.save
        ? '<button class="btn primary" id="lu-res" style="margin:2px 0 12px">' +
          esc(T('Carry on the saved board', 'Kompli t-tabellun imħażen')) + '</button>'
        : '') +

      /* ── the modes, big and few, in order ── */
      '<div class="lu-modes" style="display:grid;gap:9px;margin-top:4px">' +
        (online
          ? '<button class="btn primary" id="lu-online">' + ico('users') + ' ' +
            esc(T('Play online', 'Ilgħab onlajn')) + '</button>'
          : '') +
        '<button class="btn' + (online ? ' ghost' : ' primary') + '" id="lu-ai">' +
          ico('dice') + ' ' + esc(T('Play with the machine', 'Ilgħab mal-magna')) + '</button>' +
        '<button class="btn ghost" id="lu-pnp">' + ico('users') + ' ' +
          esc(T('Pass the phone', 'Għaddi t-telefon')) + '</button>' +
        '<button class="btn ghost" id="lu-rulesbtn">' + ico('book') + ' ' +
          esc(T('How to play', 'Kif tilgħab')) + '</button>' +
      '</div>' +

      (ST.rec.w + ST.rec.l
        ? '<p class="pt-ledger" style="margin-top:14px">' +
          T('Boards so far: <b>' + ST.rec.w + '</b> won, <b>' + ST.rec.l + '</b> lost.',
            'Logħbiet s’issa: <b>' + ST.rec.w + '</b> rebħin, <b>' + ST.rec.l + '</b> mitlufin.') +
          '</p>'
        : '') +
    '</div>' +

    /* ── the rules: a clean slide-up sheet over the menu, tap to open ── */
    '<div class="lu-rules" id="lu-menurules" aria-hidden="true">' +
      '<div class="lu-rules-h"><h4>LUDU — ' + esc(T('the rules', 'ir-regoli')) + '</h4>' +
        '<button class="lu-rules-x" id="lu-menurules-x" aria-label="' +
          esc(T('Close', 'Agħlaq')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button></div>' +
      '<div class="lu-rules-b"><ul style="margin:0;padding:0">' +
        rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul></div>' +
    '</div>' +
    '</div>';

  /* BACK GOES BACK — straight to the hub, no confirm popup */
  el.querySelector('#lu-back').onclick = () => { cue('ui.back'); P.hub(); };
  const on = el.querySelector('#lu-online');
  if (on) on.onclick = () => { if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('ludu'); };
  el.querySelector('#lu-ai').onclick  = () => offlineSetup('ai');
  el.querySelector('#lu-pnp').onclick = () => offlineSetup('pnp');
  const rs = el.querySelector('#lu-res');
  if (rs) rs.onclick = () => { if (ST.save) newGame(null, ST.save); };

  /* the rules slide-up */
  const rules = el.querySelector('#lu-menurules');
  const openRules = o => {
    rules.classList.toggle('open', o);
    rules.setAttribute('aria-hidden', o ? 'false' : 'true');
    cue(o ? 'ui.sheet' : 'ui.back', { gain:0.8 });
  };
  el.querySelector('#lu-rulesbtn').onclick = () => openRules(!rules.classList.contains('open'));
  el.querySelector('#lu-menurules-x').onclick = () => openRules(false);

  if (window.KARTI_LANG && KARTI_LANG.onChange && !setupSheet._sub){
    setupSheet._sub = KARTI_LANG.onChange(() => {
      try { if (!M && el.isConnected && el.querySelector('#lu-ai')) setupSheet();
            else if (M && UI){ render(); paintRules(); } } catch(e){}
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════
   OFFLINE OPTIONS — the ONE small step after picking AI or pass-phone.
   Sensible defaults, one inline choice: how many at the board (and, for
   AI, how sharp the machine is). Not a settings wall. A big START.
   ═══════════════════════════════════════════════════════════════════ */
function offlineSetup(mode){
  injectCSS();
  P.show();
  const el = P.ui.screenEl();
  const p = pref();
  let seats = SIZES.indexOf(p.seats) >= 0 ? p.seats : 4;
  let lvl   = p.lvl || 2;
  let humans = mode === 'pnp'
    ? Math.max(2, Math.min(seats, p.humans || 2))
    : 1;

  function paint(){
    if (mode === 'pnp') humans = Math.max(2, Math.min(seats, humans));
    el.innerHTML =
      '<div class="pt-wrap lu-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="lu-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(mode === 'pnp' ? T('Pass the phone', 'Għaddi t-telefon')
                                    : T('Play the machine', 'Ilgħab mal-magna')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<div class="lu-hero" aria-hidden="true">' + heroSVG(seats) +
          '<span class="lu-hero-cap">' + seats + ' &times;</span></div>' +

        '<div class="tiny pt-lbl">' + esc(T('How many round the board', 'Kemm madwar it-tabellun')) +
        '</div>' +
        '<div class="lu-step">' +
          '<button class="lu-rnd" id="lu-dn"' + (SIZES.indexOf(seats) <= 0 ? ' disabled' : '') +
            ' aria-label="' + esc(T('Fewer players', 'Inqas plejers')) + '">&minus;</button>' +
          '<span class="v">' + seats + '<i>' + esc(T('players', 'plejers')) + '</i></span>' +
          '<button class="lu-rnd" id="lu-up"' +
            (SIZES.indexOf(seats) >= SIZES.length - 1 ? ' disabled' : '') +
            ' aria-label="' + esc(T('More players', 'Aktar plejers')) + '">+</button>' +
        '</div>' +

        (mode === 'pnp'
          ? '<div class="tiny pt-lbl">' + esc(T('How many of them are people',
                'Kemm minnhom huma nies')) + '</div>' +
            '<div class="lu-step">' +
              '<button class="lu-rnd" id="lu-hdn"' + (humans <= 2 ? ' disabled' : '') +
                ' aria-label="' + esc(T('Fewer people', 'Inqas nies')) + '">&minus;</button>' +
              '<span class="v">' + humans + '<i>' + esc(T('on this phone', 'fuq dan it-telefon')) +
                '</i></span>' +
              '<button class="lu-rnd" id="lu-hup"' + (humans >= seats ? ' disabled' : '') +
                ' aria-label="' + esc(T('More people', 'Aktar nies')) + '">+</button>' +
            '</div>' +
            (humans < seats
              ? '<p class="lu-note" style="margin-top:6px">' +
                esc(T('The other ' + (seats - humans) + ' ' +
                      (seats - humans === 1 ? 'seat is' : 'seats are') + ' the machine.',
                      'Il-' + (seats - humans === 1 ? 'kumplament' : (seats - humans) + ' l-oħra') +
                      ' huma l-magna.')) + '</p>'
              : '')
          : '<div class="tiny pt-lbl">' + esc(T('How sharp is the machine',
                'Kemm hi taħraq il-magna')) + '</div>' +
            '<div class="pt-opts" id="lu-lvl">' + levels().map(o =>
              '<button class="pt-opt' + (o.level === lvl ? ' on' : '') + '" data-lvl="' + o.level + '">' +
              ico(o.icon || ('diff-' + Math.min(3, o.level))) +
              '<b>' + esc(o.name) + '</b><i>' + esc(TE(o.note)) + '</i></button>').join('') +
            '</div>') +

        (seats >= 8
          ? '<p class="lu-note" style="margin-top:8px">' +
            esc(T('Eight is a long game — thirty-two tokens knocking each other back.',
                  'Tmienja hija logħba twila — tnejn u tletin biċċa jwaqqgħu lil xulxin.')) + '</p>'
          : '') +

        '<div class="pt-acts" style="margin-top:18px;display:grid;gap:9px">' +
          '<button class="btn primary" id="lu-go">' +
            esc(mode === 'pnp'
              ? T('Start', 'Ibda')
              : T('Play — you vs ' + (seats - 1) + ' machine' + (seats - 1 === 1 ? '' : 's'),
                  'Ilgħab — int kontra ' + (seats - 1) + ' magn' + (seats - 1 === 1 ? 'a' : 'i'))) +
          '</button>' +
        '</div>' +
      '</div></div>';

    el.querySelector('#lu-back').onclick = () => { cue('ui.back'); setupSheet(); };
    el.querySelector('#lu-dn').onclick = () => {
      const i = SIZES.indexOf(seats);
      if (i > 0){ seats = SIZES[i - 1]; cue('ui.tap', { gain:0.8 }, true); paint(); }
    };
    el.querySelector('#lu-up').onclick = () => {
      const i = SIZES.indexOf(seats);
      if (i < SIZES.length - 1){ seats = SIZES[i + 1]; cue('ui.tap', { gain:0.8 }, true); paint(); }
    };
    const hdn = el.querySelector('#lu-hdn'), hup = el.querySelector('#lu-hup');
    if (hdn) hdn.onclick = () => { if (humans > 2){ humans--; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    if (hup) hup.onclick = () => { if (humans < seats){ humans++; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { lvl = +b.dataset.lvl; paint(); });
    el.querySelector('#lu-go').onclick = () => {
      pref({ seats, lvl, humans: mode === 'pnp' ? humans : 1 });
      newGame({ seats, humans: mode === 'pnp' ? humans : 1, lvl, dice:'seed' });
    };
  }
  paint();
}

/* is an online door worth showing — mp.js present and ludu known to it */
function canGoOnline(){
  try {
    const MP = window.KARTI_MP;
    return !!(MP && MP.openFor && P.online && P.online.ludu);
  } catch(e){ return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   START A LOCAL GAME
   ═══════════════════════════════════════════════════════════════════ */
function newGame(opts, snap){
  injectCSS();
  P.show();
  const m = snap ? (snap.opts ? startMatch(snap.opts, snap.seed, snap.log) : null)
                 : startMatch(opts);
  if (!m) { setupSheet(); return; }
  M.meta = M.st.seats.map((s, i) => ({
    name: i === 0 ? T('You', 'Int') : levelName(s.lvl) + ' ' + i,
    own: s.own, lvl: s.lvl
  }));
  applyMeta();
  M.finished = false;
  openBoard(() => setupSheet());
  cue('game.start', { gain:0.9 }, true);
}

/* ═══════════════════════════════════════════════════════════════════
   THE ONLINE CONTROLLER — KARTI_PARTY.online.ludu. js/mp.js is the only
   caller. The shape is js/tombla-ui.js's, widened for Ludo: start() puts
   a room's game on the screen; remote(seat, move) applies a wire move;
   note()/stop() are the two things the transport may say through the
   board screen; hooks are the seams mp.js reaches for (onMove to forward
   local moves, phase/apply for a lobby handshake — Ludo has none, so
   they answer honestly — attachNet, setOwner, live, seatBack).

   THE DICE, ONLINE — see the file header. mp.js carries WIRE_FIELDS
   ['k','d'] faithfully but does NOT stamp dice with its own entropy, so
   an online table runs on DICE.seed today (opts.dice omitted → 'seed').
   The day the relay stamps mv.d, start() passes opts.dice='given' and
   nothing else here changes. Until then the lobby says so out loud.
   ═══════════════════════════════════════════════════════════════════ */
const ONLINE_DICE_NOTE = T(
  'Online Ludu shares one number to keep the boards in step, and today the dice come out of ' +
  'that number — so a clever phone could read the next few rolls. Fine among friends; the ' +
  'day the server rolls the dice itself, nobody will be able to. The game plays fully in the ' +
  'meantime.',
  'Il-Ludu onlajn jaqsam numru wieħed biex it-tabelluni jibqgħu jaqblu, u llum id-dadu joħroġ ' +
  'minn dak in-numru — mela telefon furban jista’ jaqra ftit tefgħat li ġejjin. Tajjeb bejn ' +
  'il-ħbieb; il-ġurnata li s-server jitfa’ d-dadu hu, ħadd ma jkun jista’. Sadanittant il-logħba ' +
  'tinżel għalkollox.');

/* THE SEAMS mp.js reads on LB.net.hooks. Built here from the runner. */
const hooks = {
  /* every applied move is announced; mp.js forwards the local ones */
  onMove(fn){ moveSubs.push(fn); return () => { const i = moveSubs.indexOf(fn); if (i >= 0) moveSubs.splice(i, 1); }; },
  /* Ludo has NO lobby phase inside the engine — the room's lobby already
     seated everyone — so phase() is never 'lobby' and apply() is a no-op.
     Answering honestly is the contract (see mp.js's onBegan). */
  phase(){ return M ? 'play' : 'idle'; },
  apply(seat, move){ if (!M) return { ok:false, why:'no ludu' }; return onlineRemote(seat, move); },
  attachNet(net){ if (M){ M.net = net || null; maybeThink(); } },
  setOwner(i, own){ if (M && M.st.seats[i]){ M.st.seats[i].own = own; } },
  setName(i, name){ if (M && M.st.seats[i] && name){ M.st.seats[i].name = name; } },
  live(){ return !!(M && !M.dead && !E.over(M.st)); },
  seatBack(seat){ /* a walked-out player came back — nothing special to do,
                     the engine keeps their tokens once quit; re-render */
                  if (M) render(); }
};

function onlineStart(cfg){
  cfg = cfg || {};
  injectCSS();
  P.show();
  /* seats from the room; dice stays 'seed' until the relay stamps it */
  const opts = Object.assign({}, cfg.opts || {}, {
    seats: (cfg.seats && cfg.seats.length) || (cfg.opts && cfg.opts.seats) || 4,
    humans: 0,                 /* ownership is set per-seat below, not by count */
    dice: 'seed'
  });
  startMatch(opts, cfg.seed);
  const st = M.st;
  (cfg.seats || []).forEach((s, i) => {
    if (!st.seats[i]) return;
    st.seats[i].own = (i === cfg.you) ? 'me' : (s && (s.own === 'ai' || s.kind === 'cpu') ? 'ai' : 'net');
    if (s && s.name) st.seats[i].name = s.name;
    if (s && s.level) st.seats[i].lvl = s.level;
  });
  M.meta = null;               /* ownership already stamped on the seats */
  M.net = cfg.net || null;
  M.finished = false;
  openBoard(() => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); });
  hooks.attachNet(cfg.net || null);
  render();
  return snapshot();
}
/* a move from another chair, gated by the engine (the referee, not the
   relay). Returns {ok:false,why} to make mp.js bail rather than drift. */
function onlineRemote(seat, move){
  if (!M) return { ok:false, why:'no ludu on the table' };
  if (E.over(M.st)) return { ok:false, why:'the game is over' };
  const dec = E.decWire ? (E.decWire(move) || move) : move;
  const res = doMove(seat, dec, 'net');
  if (!res.ok) return { ok:false, why: res.err || 'that move did not fit the rules' };
  render();
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
P.online.ludu = {
  start: onlineStart,
  remote: onlineRemote,      /* remote(seat, move) — the two-arg shape mp.js keys off */
  note: onlineNote,
  stop: onlineStop,
  live: () => !!(M && !M.dead && hooks.live()),
  hooks
};

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — window.KARTI_LUDU.lobby. Read by js/mp.js before
   a token exists. The same object il-kiri and tombla publish, filled in
   for Ludo. Seat range and levels come straight off the engine so the
   room list and the offline screen can never disagree.
   ═══════════════════════════════════════════════════════════════════ */
const LOBBY = {
  id:'ludu',
  name:'LUDU',
  mt:'Il-Ludu',
  minSeats: E.MIN_SEATS,
  maxSeats: E.MAX_SEATS,
  levels: levels().map(L => ({ level:L.level, name:L.name, note:TE(L.note) })),
  defaultLevel: 2,
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu')
    ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    const n = (seatList || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why: T('You need at least two round the board.',
                                                   'Trid mill-inqas tnejn madwar it-tabellun.') };
    if (n > E.MAX_SEATS) return { ok:false, why: T('Eight is as many arms as the board has.',
                                                   'Tmienja huma daqs kemm hemm dirgħajn.') };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready) return { ok:false, why: unready + (unready > 1
        ? T(' people are not ready yet.', ' persuni għadhom mhux lesti.')
        : T(' person is not ready yet.', ' persuna għadha mhux lesta.')) };
    return { ok:true, why:'' };
  },
  rulesHTML: () =>
    '<p>' + T('Four tokens each, one lap of the board, and captures that send a token all the ' +
      'way home. Only a six gets you out; you need the exact number to finish.',
      'Erba’ biċċiet kull wieħed, dawra waħda tat-tabellun, u qabdiet li jibagħtu biċċa lura ' +
      'kollox. Sitta biss toħroġ; trid in-numru eżatt biex tispiċċa.') + '</p>' +
    '<p>' + T('Four, six or eight round one board — the arms multiply but the lap stays short.',
      'Erbgħa, sitta jew tmienja madwar tabellun wieħed — id-dirgħajn jiżdiedu imma d-dawra ' +
      'tibqa’ qasira.') + '</p>' +
    '<p>' + esc(ONLINE_DICE_NOTE) + '</p>',
  blurb: T('Four tokens, one lap, no mercy. Four, six or eight round the board.',
           'Erba’ biċċiet, dawra waħda, ebda ħniena. Erbgħa, sitta jew tmienja madwar it-tabellun.'),
  /* the offline twin of the room, for anything that opens ludu from a
     seat list rather than from the setup sheet */
  start(seats, opts){
    const n = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, (seats || []).length || 4));
    const lv = (seats || []).map(s => s && s.level).find(v => v) || (pref().lvl || 2);
    return newGame(Object.assign({ seats:n, humans:1, lvl:lv, dice:'seed' }, opts || {}));
  },
  myName(){
    try {
      const n = K.displayName && K.displayName();
      if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
        return String(n).trim().slice(0, 14);
    } catch(e){}
    return T('You', 'Int');
  },
  wire: { fields: E.WIRE_FIELDS },
  takeback: false
};
R.lobby = LOBBY;

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF — one tile. register() replaces by id, so party.js wiring
   the same descriptor again costs nothing. `kind:'board'` puts it with
   the board games (chess, dama, tombla).
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'ludu', order:26, kind:'board', cat:'board',
  name:'LUDU', mt:'Il-Ludu', icon:'dice', status:'live',
  get tag(){
    return T('Four tokens each, one lap of the board, and no mercy on a lone piece. Four, six ' +
             'or eight can play.',
             'Erba’ biċċiet kull wieħed, dawra waħda tat-tabellun, u ebda ħniena fuq biċċa ' +
             'waħedha. Erbgħa, sitta jew tmienja jistgħu jilagħbu.') +
           (ST.save ? ' ' + T('There is a board half-played.', 'Hemm tabellun nofsu milgħub.') : '');
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

/* ── test hooks — inert unless the page is opened with ?ludutest ──── */
if (/[?&]ludutest\b/.test(location.search || '')){
  window.__LUDU_TEST = {
    setupSheet, newGame, doMove, render, get M(){ return M; }, get UI(){ return UI; },
    engine: E, LOBBY, hooks, online: P.online.ludu, leave
  };
}

})();
