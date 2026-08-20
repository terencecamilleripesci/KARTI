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

    /* ── the rail of seats across the top. width:100%+min-width:0 pins it
       to the board width so 6/8 chips scroll INSIDE the strip and never
       push the screen wider (no horizontal page overflow). ── */
    '#scr-party .lu-seats{flex:0 0 auto;width:100%;min-width:0;max-width:100%;' +
      'box-sizing:border-box;display:flex;gap:5px;overflow-x:auto;overflow-y:hidden;' +
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
    '#scr-party .lu-cell{fill:rgba(255,255,255,.11);stroke:rgba(255,255,255,.22);stroke-width:.4}' +
    '#scr-party .lu-cell.safe{fill:rgba(255,255,255,.2);stroke:rgba(255,255,255,.4)}' +
    '#scr-party .lu-home{stroke-width:.5}' +
    '#scr-party .lu-yard{stroke-linejoin:round}' +
    '#scr-party .lu-well{opacity:.9}' +
    '#scr-party .lu-goal{stroke:rgba(255,255,255,.5);stroke-width:.4}' +
    /* a legal destination pulses a gold ring — compositor transform only */
    '#scr-party .lu-hint{fill:none;stroke:var(--lu-gold);stroke-width:.9;opacity:.9;' +
      'transform-box:fill-box;transform-origin:center}' +
    '#scr-party.lu-anim .lu-hint{animation:lu-pulse 1.1s ease-in-out infinite}' +
    '@keyframes lu-pulse{0%,100%{transform:scale(.86);opacity:.55}50%{transform:scale(1.08);opacity:1}}' +

    /* ── the tokens ── */
    '#scr-party .lu-tok{transform-box:fill-box;transform-origin:center;' +
      'transition:transform .28s var(--ease,cubic-bezier(.22,.9,.28,1))}' +
    '#scr-party .lu-tok .body{stroke:rgba(0,0,0,.55);stroke-width:.5}' +
    '#scr-party .lu-tok .gloss{fill:rgba(255,255,255,.5)}' +
    /* the generous invisible hit target — the pointer surface. touch-action
       none so the first touch fires without a scroll/zoom race. */
    '#scr-party .lu-tok .hit{cursor:pointer;pointer-events:auto;' +
      'touch-action:none;-webkit-tap-highlight-color:transparent}' +
    /* a movable piece: white rim, a soft coloured glow, and a gentle bob
       so "what can I move" reads before you even look for the die */
    '#scr-party .lu-tok.pick{cursor:pointer}' +
    '#scr-party .lu-tok.pick .body{stroke:#fff;stroke-width:1.3}' +
    '#scr-party .lu-tok .glow{opacity:0}' +
    '#scr-party .lu-tok.pick .glow{opacity:.5;filter:blur(1.4px)}' +
    '#scr-party.lu-anim .lu-tok.pick .glow{animation:lu-glow 1.1s ease-in-out infinite}' +
    '@keyframes lu-glow{0%,100%{opacity:.32}50%{opacity:.62}}' +
    '#scr-party .lu-tok.pick{animation:lu-bob 1s ease-in-out infinite}' +
    '@keyframes lu-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.4px)}}' +
    /* a NON-movable piece dims back when it is my move so the movable ones
       are the only bright things on the board */
    '#scr-party .lu-tok.dim{opacity:.5}' +
    /* instant press feedback on the FIRST touch — no wait for the move */
    '#scr-party .lu-tok.press{animation:none!important}' +
    '#scr-party .lu-tok.press .body{transform:scale(.86);transform-box:fill-box;' +
      'transform-origin:center;transition:transform .08s ease}' +
    /* the lifted token in flight — a shadow so it reads as picked up */
    '#scr-party .lu-fly{transform-box:view-box;pointer-events:none;' +
      'filter:drop-shadow(0 2px 2px rgba(0,0,0,.45))}' +
    '#scr-party.lu-still .lu-tok.pick{animation:none}' +
    '#scr-party.lu-still .lu-tok{transition:none}' +
    'body.reduced #scr-party .lu-tok,body.reduced #scr-party.lu-anim .lu-hint,' +
      'body.reduced #scr-party .lu-tok.pick,body.reduced #scr-party .lu-tok.pick .glow{' +
      'animation:none!important;transition:none!important}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .lu-tok,#scr-party.lu-anim .lu-hint,' +
      '#scr-party .lu-tok.pick,#scr-party .lu-tok.pick .glow{animation:none!important;transition:none!important}}' +

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
      'background:rgba(138,92,255,.10);border:1px solid rgba(138,92,255,.3)}' +

    /* ── TEAMS toggle on the setup sheet ── */
    '#scr-party .lu-teams{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:2px}' +
    '#scr-party .lu-tbtn{min-height:44px;padding:8px 10px;border-radius:12px;cursor:pointer;' +
      'font:800 11.5px/1.25 var(--disp);letter-spacing:.02em;color:var(--txt);' +
      'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .lu-tbtn.on{color:#241800;background:linear-gradient(180deg,#FFD979,var(--lu-gold));' +
      'border-color:#FFE9B0}' +
    '#scr-party .lu-tsize{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}' +
    '#scr-party .lu-tszb{min-height:40px;padding:6px 16px;border-radius:11px;cursor:pointer;' +
      'font:900 13px/1 var(--disp);letter-spacing:.04em;color:var(--txt);' +
      'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .lu-tszb.on{color:#241800;background:linear-gradient(180deg,#FFD979,var(--lu-gold));' +
      'border-color:#FFE9B0}' +
    /* the partner tie on a seat chip in-game */
    '#scr-party .lu-seat .tm{font:900 7.5px/1.1 var(--disp);letter-spacing:.06em;' +
      'padding:1px 4px;border-radius:6px;color:#0E0B14;white-space:nowrap}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   THE BOARD — an AUTHENTIC Ludo layout, built from the engine's ring
   topology (layout().ring carries sector / role / jj for every square,
   and the seats carry entry / turnoff / colour). The engine's polar
   a/r is a rosette; the header says a UI that wants the REAL board may
   ignore a/r and rebuild the picture from sector+role+jj — which is
   exactly what geom() does here, so the drawing is a genuine Ludo
   board (a cross at P=4, a hexagon at P=6, an octagon at P=8) while the
   RULES stay the engine's and cannot disagree.

   ── HOW AN ARM IS BUILT ────────────────────────────────────────────
   The board is P identical ARMS radiating from the centre, one per
   seat, at angle θ_k = k/P of a full turn (0 = straight up, clockwise).
   Each arm is a three-lane corridor:
       · LEADING rail  (+side)  — seat k enters here and climbs OUTWARD
       · HOME column   (centre) — seat k's coloured lane to the finish
       · TRAILING rail (-side)  — the previous sector comes back INWARD
   A ring square's screen slot is read straight off the engine sector:
       out  cell  (sector k, jj) → arm k, LEADING  rail, ring row jj
       corner     (sector k)     → the tip square between arm k & k+1
       in   cell  (sector k, jj) → arm k+1, TRAILING rail, row L-1-jj
   so seat k+1's entry (start of sector k+1, a leading-rail inner cell)
   and its turnoff (end of sector k, a trailing-rail inner cell) FLANK
   arm k+1's home-column mouth exactly as on a real board. A big
   coloured YARD square sits at each arm's outer base holding the four
   parked tokens; the centre is the P-way coloured finish.
   ═══════════════════════════════════════════════════════════════════ */
const VB = 240, C = VB / 2, RAD = 112;   /* viewBox, centre, board radius */
function layoutFor(st){
  return E.layout(st.n, st.homeLen, st.safeMode);
}
/* an engine polar point → svg px (kept for the hero badge fallback) */
function pxOf(lay, a, r){
  const p = lay.xy(a, r);
  return { x: C + p.x * RAD, y: C + p.y * RAD };
}

/* the authentic geometry, memoised per (P, H). Returns, in board px:
     ring[i]  = {x,y,th} for every ring square i (th = cell rotation, rad)
     col[k]   = [{x,y,th}...] home-column cells for seat k (mouth→finish)
     home[k]  = {x,y} the seat's spot in the centre finish
     yard[k]  = {cx,cy,size,theta,slots:[{x,y}...]} the corner home yard
     arm[k]   = {ux,uy,vx,vy,theta} arm unit vectors, for arrows etc.
     cell     = the ring-square radius; tok = the token radius
   For P=4 this is the CANONICAL 15×15 Ludo grid (a solved layout, cells
   NEVER overlap). For P=6/8 it is a clean rosette of P arms scaled to the
   disc so nothing overflows. Both agree with the engine's rules because
   every ring/col cell is placed by the engine's ring index. */
const GEOM = {};
function geom(lay){
  const P = lay.P;
  const key = P + '|' + lay.H;
  if (GEOM[key]) return GEOM[key];
  const out = (P === 4) ? geomGrid(lay) : geomWedge(lay);
  GEOM[key] = out;
  return out;
}

/* ── THE CANONICAL 15×15 CROSS (P=4) ────────────────────────────────
   The classic board is a 15×15 grid: four 6×6 corner yards, a 3-wide
   white cross of track through the middle, four 5-cell coloured home
   columns down the middle lane of each arm, and a 3×3 four-colour finish
   at the centre. The 52 track cells are laid out ONCE, in engine ring
   order (ring index i → RING_PATH[i]), so bd.sq(seat,p) indexes straight
   into it; the home column of seat k → HOME_LANES[k] (mouth→centre); the
   yard of seat k → a 6×6 corner square with a 2×2 of parked slots. Cells
   are axis-aligned unit squares on the grid and so cannot overlap. */
const GRID_N = 15;
/* ring path: 52 cells (row,col) clockwise, engine ring index 0 = seat 0's
   start = (6,1). Four arms of 13 = the engine's four sectors. */
const RING_PATH = [
  [6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],
  [1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],
  [8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],
  [13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]
];
/* seat k's home column, mouth (path pos R) → deepest (path pos R+H-2). */
const HOME_LANES = [
  [[7,1],[7,2],[7,3],[7,4],[7,5]],          /* seat 0 — top-left  */
  [[1,7],[2,7],[3,7],[4,7],[5,7]],          /* seat 1 — top-right */
  [[7,13],[7,12],[7,11],[7,10],[7,9]],      /* seat 2 — bottom-right */
  [[13,7],[12,7],[11,7],[10,7],[9,7]]       /* seat 3 — bottom-left  */
];
/* the 6×6 yard corner of each seat: [rowStart,colStart] of the 6×6 block. */
const YARD_BLOCK = [ [0,0], [0,9], [9,9], [9,0] ];
/* which way each arm points from centre (for the arrows / cell rotation) */
const ARM_DIR = [
  { ux:-1, uy: 0 }, /* seat 0 track flows out along -x then up   */
  { ux: 0, uy:-1 },
  { ux: 1, uy: 0 },
  { ux: 0, uy: 1 }
];
function geomGrid(lay){
  const R = lay.R, H = lay.H;
  const pad = 3;                                   /* px inset inside viewBox   */
  const gap = (VB - pad * 2) / GRID_N;             /* one grid cell, px         */
  const cell = gap * 0.46;                         /* drawn half-size of a cell */
  const at = (r, c) => ({ x: pad + (c + 0.5) * gap, y: pad + (r + 0.5) * gap, th: 0 });

  const ring = new Array(R);
  for (let i = 0; i < R; i++) ring[i] = at(RING_PATH[i][0], RING_PATH[i][1]);

  const col = [], home = [];
  for (let k = 0; k < 4; k++){
    col.push(HOME_LANES[k].map(([r, c]) => at(r, c)));
    /* the seat's spot in the 3×3 centre — nudged toward its own arm */
    const d = ARM_DIR[k];
    home.push({ x: C + d.ux * gap * 0.9, y: C + d.uy * gap * 0.9, th: 0 });
  }

  /* yards: 6×6 corner blocks, 2×2 parked slots inside the white inner box */
  const yard = [];
  for (let k = 0; k < 4; k++){
    const [r0, c0] = YARD_BLOCK[k];
    const cx = pad + (c0 + 3) * gap, cy = pad + (r0 + 3) * gap;
    const s = gap * 1.35;                           /* slot offset from centre  */
    const slots = [
      { x: cx - s, y: cy - s }, { x: cx + s, y: cy - s },
      { x: cx - s, y: cy + s }, { x: cx + s, y: cy + s }
    ];
    yard.push({ cx, cy, size: gap * 6, block: [r0, c0], theta: 0, slots, gap });
  }

  /* arm unit vectors (kept for the arrow direction on the start cells) */
  const arm = ARM_DIR.map(d => ({ ux: d.ux, uy: d.uy, vx: -d.uy, vy: d.ux, theta: 0 }));

  return { P: 4, L: lay.L, H, R, grid: true, gap, cell, tok: cell * 0.82,
           ring, col, home, yard, arm, finishR: gap * 1.5,
           center: { x: C, y: C, half: gap * 1.5 } };
}

/* ── THE HEXAGON (P=6) / OCTAGON (P=8) — THE REAL COMMERCIAL BOARD ───
   A shop-bought six- or eight-player Ludo board is NOT four thin arms
   with more arms bolted on. It is a POLYGON TILED BY WEDGES: a hexagon
   cut into six equal triangles (an octagon into eight), one per player,
   each triangle filled in that player's colour, packed edge to edge
   with no gaps at all. That is what this builds.

   ONE WEDGE, in its own local frame (u = straight out along the wedge's
   axis, s = sideways along the polygon edge, both in "pitch" units):

              W(k-1) ─────── polygon edge k ─────── W(k)      ← the rim
                 \   ▫ ▫ ▫ ▫  │  ▫ ▫ ▫ ▫   /                  ← TRACK ROW
                  \   in-rail  │  out-rail /                     2L cells
                   \          ███              /                ← HOME COLUMN
                    \      ▪ ███ ▪           /                    H-1 cells
                     \   (yard plate,      /                    ← 4 TOKEN
                      \   4 token dots)  /                         SLOTS
                       \       ███      /
                        \      ███     /
                         \____________/
                              HUB                               ← the finish

   · WEDGE k is the triangle (centre, W(k-1), W(k)) where W(j) is the
     polygon vertex at angle θ_j + π/P. So wedge k is centred on the
     axis θ_k = k·(2π/P) and its OUTER edge is polygon edge k, whose
     midpoint sits on that axis. The P wedges tile the polygon exactly:
     they share edges, they cover it, they overlap nowhere.
   · THE TRACK is a row of cells along each polygon edge, just inside
     the rim, 2L of them, laid symmetrically about the edge midpoint,
     plus ONE turn cell at each polygon vertex. P·(2L+1) = P·A = R, the
     engine's ring exactly: 54 at P=6, 56 at P=8.
   · THE ENGINE'S RING INDEX maps in three lines and cannot drift:
         out cell (sector k, jj)  → edge k, at +(jj+0.5) pitches from
                                    the midpoint — the OUT-RAIL, the
                                    half of the row leaving the mouth
         corner   (sector k)      → the turn cell at polygon vertex W(k)
         in cell  (sector k, jj)  → edge k+1, at −(L−jj−0.5) pitches —
                                    the IN-RAIL, the half of the row
                                    arriving at the next mouth
     so seat k's ENTRY lands at +0.5 pitch and seat k's TURNOFF at
     −0.5 pitch on the SAME edge: the two flank the midpoint of wedge
     k's own outer edge, which is exactly where its HOME COLUMN starts.
     Out-rail on one side of the mouth, in-rail on the other, precisely
     as on the real board.
   · THE HOME COLUMN runs from that mouth straight down the wedge's
     axis, inward, H−1 coloured cells, and ends at the HUB — the central
     P-sided finish where all the wedges meet.
   · THE YARD is a cream plate across the middle of the wedge with four
     slot wells, two either side of the home column, holding the four
     parked tokens.

   NOTHING OVERLAPS, and that is arithmetic rather than luck. The whole
   board is derived from ONE number, `pitch`:
       half band edge  = (L + 0.65)·pitch     → 1.15 pitch clear between
                                                 the last rail cell and
                                                 the turn cell
       cell half-size  = 0.42·pitch           → 0.84 pitch of square in
                                                 a 1.00 pitch slot
       column mouth    = one pitch inside the band, same rotation
       column spacing  = ≥ 1.0 pitch by construction
   and `pitch` itself is solved so the polygon's circumradius lands
   exactly on RMAX, so the board fills the square and never clips.        */
function geomWedge(lay){
  const P = lay.P, L = lay.L, H = lay.H, R = lay.R;
  const half = Math.PI / P;                     /* half a wedge, radians  */
  const SIN = Math.sin(half), COS = Math.cos(half), TAN = Math.tan(half);

  const RMAX = 114;                             /* the board's outer radius */
  const PAD  = 1.25;                            /* rim outside the band, pitches */
  const SPAN = L + 0.65;                        /* half a band edge, pitches */
  /* Rpoly = pitch·(SPAN/sin + PAD) — solve it for pitch */
  const pitch = RMAX / (SPAN / SIN + PAD);
  const rBand = SPAN * pitch / TAN;             /* band INRADIUS (edge mids) */
  const Rband = rBand / COS;                    /* band circumradius (turns) */
  const Rpoly = Rband + PAD * pitch;            /* the polygon              */
  const rPoly = Rpoly * COS;                    /* polygon inradius         */
  const cell  = pitch * 0.42;                   /* drawn HALF-size of a cell */
  const hub   = pitch * 2.1;                    /* the central finish        */

  /* per-wedge frame: u = outward along the axis, t = along the edge */
  const F = [];
  for (let k = 0; k < P; k++){
    const th = (k / P) * 2 * Math.PI;
    F.push({ theta: th,
             ux: Math.sin(th), uy: -Math.cos(th),
             tx: Math.cos(th), ty:  Math.sin(th) });
  }
  const pt = (k, r, s) => ({ x: C + F[k].ux * r + F[k].tx * s,
                             y: C + F[k].uy * r + F[k].ty * s,
                             th: F[k].theta });

  /* the polygon vertices. polyV[j] sits between wedge j and wedge j+1,
     so wedge k is the triangle (centre, polyV[k-1], polyV[k]). */
  const polyV = [], bandV = [];
  for (let k = 0; k < P; k++){
    polyV.push(pt(k, rPoly, rPoly * TAN));
    bandV.push(pt(k, rBand, rBand * TAN));
  }

  /* ── THE RING — one row of cells per polygon edge, one turn cell per
     polygon vertex, straight off the engine's ring index ── */
  const ring = new Array(R);
  for (let i = 0; i < R; i++){
    const rc = lay.ring[i], k = rc.sector;
    if (rc.role === 'out'){
      ring[i] = pt(k, rBand, (rc.jj + 0.5) * pitch);
    } else if (rc.role === 'corner'){
      ring[i] = { x: bandV[k].x, y: bandV[k].y, th: F[k].theta + half };
    } else {
      const km = (k + 1) % P;
      ring[i] = pt(km, rBand, -((L - rc.jj - 0.5) * pitch));
    }
  }

  /* ── THE HOME COLUMN — down the wedge axis, mouth → hub ── */
  const rCol0 = rBand - pitch;                  /* the mouth               */
  const rColN = hub + pitch * 0.85;             /* the last cell           */
  const nCol  = Math.max(1, H - 1);
  const cspace = nCol > 1 ? (rCol0 - rColN) / (nCol - 1) : 0;
  const col = [], home = [];
  for (let k = 0; k < P; k++){
    const cells = [];
    for (let c = 0; c < nCol; c++) cells.push(pt(k, rCol0 - cspace * c, 0));
    col.push(cells);
    home.push(pt(k, hub * 0.62, 0));
  }

  /* ── THE YARD — a plate across the wedge, four slots either side of
     the column. Laterals are a fraction of the room the wedge actually
     has at that radius (r·tan), so the slots sit inside the triangle at
     every P and never touch the home column. ── */
  const yard = [];
  const yOut = rCol0 - pitch * 0.45, yIn = hub + pitch * 0.55;
  const yD = yOut - yIn;
  const r1 = yIn + yD * 0.30, r2 = yIn + yD * 0.72;
  for (let k = 0; k < P; k++){
    const o1 = r1 * TAN * 0.62, o2 = r2 * TAN * 0.62;
    const w1 = yIn * TAN * 0.80, w2 = yOut * TAN * 0.80;
    yard.push({
      cx: pt(k, (yIn + yOut) / 2, 0).x, cy: pt(k, (yIn + yOut) / 2, 0).y,
      size: yD, theta: F[k].theta,
      plate: [pt(k, yIn, -w1), pt(k, yOut, -w2), pt(k, yOut, w2), pt(k, yIn, w1)],
      slots: [pt(k, r2, -o2), pt(k, r2, o2), pt(k, r1, -o1), pt(k, r1, o1)]
    });
  }

  /* the arrow on an entry cell points the way the lap runs — along the
     edge (+t); v is the outward normal, for the arrowhead's spread */
  const arm = F.map(f => ({ ux: f.tx, uy: f.ty, vx: f.ux, vy: f.uy, theta: f.theta }));

  return { P, L, H, R, grid: false, wedge: true,
           gap: pitch, step: 1, pitch, cell, tok: cell * 0.82,
           ring, col, home, yard, arm, F,
           polyV, bandV, half, SIN, COS, TAN,
           Rpoly, rPoly, rBand, Rband, hub, finishR: hub,
           rCol0, rColN, cspace, yIn, yOut };
}

/* the ring square / token radii — now taken from the authentic geometry */
function cellR(lay){ return geom(lay).cell; }
function tokR(lay){ return geom(lay).tok; }

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
  maybeAutoMove();
  if (E.over(st)) finish();
}

/* ONE-TAP relief — when it is the local seat's move and there is exactly
   ONE legal move, the player should not have to hunt for the only piece
   that can go. After a short beat (long enough to SEE it light up) the
   engine plays it, sliding like any tap. Runs at most once per state. */
function maybeAutoMove(){
  if (!M || M.dead || M.timer || sliding) return;
  const st = M.st;
  if (E.over(st)) return;
  const seat = E.turn(st);
  if (!isLocal(seat)) return;
  const pend = E.pending(st);
  if (pend.phase !== 'move' || (pend.moves || []).length !== 1) return;
  const k = pend.moves[0].k;
  const tag = M.log.length + ':' + k;
  if (M._auto === tag) return;                 /* already fired for this state */
  M._auto = tag;
  M.timer = setTimeout(() => {
    M.timer = 0;
    if (!M || M.dead || sliding) return;
    if (E.over(M.st)) return;
    if (E.turn(M.st) !== seat) return;
    const p2 = E.pending(M.st);
    if (p2.phase !== 'move' || (p2.moves || []).length !== 1 || p2.moves[0].k !== k) return;
    tapMove(seat, k, null);
  }, reduced() ? 120 : 560);
}

/* the team badge for a seat chip: a short letter (A/B/C/D) on the colour of
   the team's FIRST seat, so partners read as the same badge at a glance */
const TEAM_LETTERS = ['A', 'B', 'C', 'D'];
function teamBadge(st, team){
  if (!st.teams || team < 0) return '';
  const first = st.teams.indexOf(team);
  const hx = first >= 0 ? hexOf(colourFor(st, first)) : '#888';
  const lab = T('Team', 'Tim') + ' ' + (TEAM_LETTERS[team] || (team + 1));
  return '<span class="tm" style="background:' + esc(hx) + '">' + esc(lab) + '</span>';
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
    const badge = (st.teams && s.team >= 0) ? teamBadge(st, s.team) : '';
    return '<div class="lu-seat' + on + out + done + '">' +
      '<span class="sw" style="background:' + esc(hexOf(s.colour)) + '"></span>' +
      '<span class="col">' +
        '<span class="n">' + esc(nm) + (badge ? ' ' + badge : '') + '</span>' +
        '<span class="h">' + s.home + '/' + st.tokens + ' ' + esc(T('home', 'id-dar')) + '</span>' +
      '</span>' +
      (s.rank ? '<span class="rk">' + s.rank + '</span>' : '') +
    '</div>';
  }).join('');
}

/* a five-point star path centred at (cx,cy), outer radius ro */
function starPath(cx, cy, ro){
  const ri = ro * 0.42;
  let d = '';
  for (let i = 0; i < 10; i++){
    const r = i % 2 ? ri : ro;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    d += (i ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1);
  }
  return d + 'Z';
}
/* a rounded-square path centred at (cx,cy), half-size hs, rotation th (rad) */
function sqCell(cx, cy, hs, th){
  const co = Math.cos(th || 0), si = Math.sin(th || 0);
  const pts = [[-hs,-hs],[hs,-hs],[hs,hs],[-hs,hs]].map(([x,y]) =>
    [cx + x * co - y * si, cy + x * si + y * co]);
  /* a crisp rotated square — reads as a Ludo board cell */
  return 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
}

/* an axis-aligned grid square centred at (cx,cy), half-size hs, corner r */
function gridCell(cx, cy, hs, r){
  const x = cx - hs, y = cy - hs, w = hs * 2, rr = r || 0;
  return '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + w.toFixed(2) +
    '" height="' + w.toFixed(2) + '" rx="' + rr.toFixed(2) + '" ry="' + rr.toFixed(2) + '"';
}

/* ── THE CLASSIC 15×15 CROSS BOARD (P=4) ──────────────────────────── */
function boardBodyGrid(st, lay, g, hs){
  const cr = g.cell, gap = g.gap;
  let s = '';
  /* a soft rounded plate behind the whole board */
  s += '<rect x="1.5" y="1.5" width="' + (VB - 3) + '" height="' + (VB - 3) +
    '" rx="10" ry="10" fill="#fbfbf7" stroke="rgba(0,0,0,.28)" stroke-width="1"/>';

  /* the white CROSS (track background) — horizontal + vertical 3-wide bands */
  const band = () => 'fill="#fff" stroke="rgba(0,0,0,.10)" stroke-width="0.4"';
  const px = (r, c) => ({ x: 3 + c * gap, y: 3 + r * gap });
  const hBand = px(6, 0), vBand = px(0, 6);
  s += '<rect x="' + hBand.x.toFixed(2) + '" y="' + hBand.y.toFixed(2) + '" width="' +
    (gap * 15).toFixed(2) + '" height="' + (gap * 3).toFixed(2) + '" ' + band() + '/>';
  s += '<rect x="' + vBand.x.toFixed(2) + '" y="' + vBand.y.toFixed(2) + '" width="' +
    (gap * 3).toFixed(2) + '" height="' + (gap * 15).toFixed(2) + '" ' + band() + '/>';

  /* the four 6×6 corner YARDS: a bold colour block with a white inner box */
  g.yard.forEach((y, k) => {
    const hx = hexOf(colourFor(st, k));
    const [r0, c0] = y.block;
    const bx = 3 + c0 * gap, by = 3 + r0 * gap, bw = gap * 6;
    s += '<rect x="' + bx.toFixed(2) + '" y="' + by.toFixed(2) + '" width="' + bw.toFixed(2) +
      '" height="' + bw.toFixed(2) + '" rx="7" ry="7" fill="' + esc(hx) +
      '" stroke="rgba(0,0,0,.22)" stroke-width="0.8"/>';
    /* white inner box holding the 2×2 parked slots */
    const ins = gap * 0.9, iw = bw - ins * 2;
    s += '<rect x="' + (bx + ins).toFixed(2) + '" y="' + (by + ins).toFixed(2) + '" width="' +
      iw.toFixed(2) + '" height="' + iw.toFixed(2) + '" rx="6" ry="6" fill="#fbfbf7" ' +
      'stroke="rgba(0,0,0,.14)" stroke-width="0.6"/>';
    /* the four parked-slot wells */
    y.slots.forEach(sl => {
      s += '<circle cx="' + sl.x.toFixed(2) + '" cy="' + sl.y.toFixed(2) + '" r="' +
        (gap * 0.42).toFixed(2) + '" fill="none" stroke="' + esc(hx) +
        '" stroke-opacity="0.55" stroke-width="1.1"/>';
    });
  });

  /* the coloured HOME COLUMNS (each seat's 5-cell lane to the centre) */
  g.col.forEach((cells, k) => {
    const hx = hexOf(colourFor(st, k));
    cells.forEach(cc => {
      s += gridCell(cc.x, cc.y, hs, cr * 0.14) + ' fill="' + esc(hx) +
        '" stroke="rgba(0,0,0,.18)" stroke-width="0.4"/>';
    });
  });

  /* the centre 3×3 FINISH: four coloured triangles meeting at the middle */
  const c3 = gap * 1.5;                       /* half the 3×3 block, px */
  const cx = C, cy = C;
  const corners = [
    { x: cx - c3, y: cy - c3 }, { x: cx + c3, y: cy - c3 },
    { x: cx + c3, y: cy + c3 }, { x: cx - c3, y: cy + c3 }
  ];
  /* the box behind the triangles */
  s += '<rect x="' + (cx - c3).toFixed(2) + '" y="' + (cy - c3).toFixed(2) + '" width="' +
    (c3 * 2).toFixed(2) + '" height="' + (c3 * 2).toFixed(2) +
    '" fill="#fff" stroke="rgba(0,0,0,.14)" stroke-width="0.5"/>';
  /* seat 0 (top-left) → top triangle, 1 → right, 2 → bottom, 3 → left, so
     each colour's triangle points at that seat's home column mouth */
  const triFor = [
    [corners[0], corners[1]],   /* seat 0: top edge  */
    [corners[1], corners[2]],   /* seat 1: right edge (top-right home) */
    [corners[2], corners[3]],   /* seat 2: bottom edge */
    [corners[3], corners[0]]    /* seat 3: left edge */
  ];
  /* map triangle edge → the seat whose HOME MOUTH sits on that edge:
     seat0 home lane is row7 cols1-5 → enters centre from the LEFT edge;
     seat1 col7 rows1-5 → from the TOP; seat2 row7 cols9-13 → RIGHT;
     seat3 col7 rows9-13 → BOTTOM. */
  const edgeOfSeat = { 0: [corners[3], corners[0]], 1: [corners[0], corners[1]],
                       2: [corners[1], corners[2]], 3: [corners[2], corners[3]] };
  for (let k = 0; k < 4; k++){
    const hx = hexOf(colourFor(st, k));
    const [a, b] = edgeOfSeat[k];
    s += '<path d="M' + cx.toFixed(2) + ' ' + cy.toFixed(2) + 'L' + a.x.toFixed(2) + ' ' +
      a.y.toFixed(2) + 'L' + b.x.toFixed(2) + ' ' + b.y.toFixed(2) + 'Z" fill="' + esc(hx) +
      '" stroke="rgba(0,0,0,.18)" stroke-width="0.5" stroke-linejoin="round"/>';
  }

  /* the travel RING cells: white squares, coloured starts, star safes */
  lay.ring.forEach((rc, i) => {
    const p = g.ring[i];
    if (rc.entryOf != null){
      const hx = hexOf(colourFor(st, rc.entryOf));
      s += gridCell(p.x, p.y, hs, cr * 0.14) + ' fill="' + esc(hx) +
        '" stroke="rgba(0,0,0,.2)" stroke-width="0.5"/>';
    } else {
      s += gridCell(p.x, p.y, hs, cr * 0.14) + ' fill="#fff" ' +
        (rc.safe ? 'stroke="rgba(0,0,0,.28)" stroke-width="0.7"' :
                   'stroke="rgba(0,0,0,.12)" stroke-width="0.4"') + '/>';
    }
    if (rc.safe && rc.entryOf == null){
      s += '<path d="' + starPath(p.x, p.y, cr * 0.6) +
        '" fill="rgba(80,80,90,.42)" stroke="rgba(0,0,0,.18)" stroke-width="0.3"/>';
    }
    if (rc.entryOf != null){
      /* an outward arrow in the direction of travel */
      const a = g.arm[rc.entryOf];
      const tip = { x: p.x + a.ux * cr * 0.55, y: p.y + a.uy * cr * 0.55 };
      const b1 = { x: p.x - a.ux * cr * 0.2 + a.vx * cr * 0.38,
                   y: p.y - a.uy * cr * 0.2 + a.vy * cr * 0.38 };
      const b2 = { x: p.x - a.ux * cr * 0.2 - a.vx * cr * 0.38,
                   y: p.y - a.uy * cr * 0.2 - a.vy * cr * 0.38 };
      s += '<path d="M' + tip.x.toFixed(1) + ' ' + tip.y.toFixed(1) + 'L' +
        b1.x.toFixed(1) + ' ' + b1.y.toFixed(1) + 'L' + b2.x.toFixed(1) + ' ' +
        b2.y.toFixed(1) + 'Z" fill="rgba(255,255,255,.9)" stroke="rgba(0,0,0,.25)" stroke-width="0.3"/>';
    }
  });
  return s;
}

/* ── THE HEXAGON / OCTAGON BODY (P=6 / P=8) ──────────────────────────
   Painted in the order a real board is printed: the polygon, then the P
   coloured WEDGES tiling it edge to edge, then the dark corner blocks
   (the octagon's, as on the shop board), then the cream TRACK BAND
   round the rim with the cells tiled into it, then each wedge's YARD
   PLATE and four slot wells, then the coloured HOME COLUMNS running
   from each edge's midpoint down to the middle, and last the P-sided
   HUB where every column finishes. */
/* the sheen laid over every wedge — one gradient, so P flat colours read
   as a printed board rather than as a pie chart */
const WSHEEN =
  '<radialGradient id="lu-wsheen" cx="50%" cy="50%" r="62%">' +
    '<stop offset="0" stop-color="#000" stop-opacity="0.26"/>' +
    '<stop offset="55%" stop-color="#000" stop-opacity="0.06"/>' +
    '<stop offset="100%" stop-color="#fff" stop-opacity="0.14"/></radialGradient>';
function polyPathAt(g, inr){
  const P = g.P, out = [];
  for (let k = 0; k < P; k++){
    const th = (k / P) * 2 * Math.PI + g.half, r = inr / g.COS;
    out.push([C + r * Math.sin(th), C - r * Math.cos(th)]);
  }
  return 'M' + out.map(p => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z';
}
function ptsPath(list){
  return 'M' + list.map(p => p.x.toFixed(2) + ' ' + p.y.toFixed(2)).join('L') + 'Z';
}
function boardBodyWedge(st, lay, g){
  const P = g.P, pitch = g.pitch, hs = g.cell;
  const V = g.polyV;
  let s = '';

  /* the board plate — the polygon itself, on a soft dark disc */
  s += '<circle class="lu-disc" cx="' + C + '" cy="' + C + '" r="' + (RAD + 6) + '"/>';
  s += '<path d="' + ptsPath(V) + '" fill="#1b1330" stroke="rgba(0,0,0,.55)" ' +
       'stroke-width="1.6" stroke-linejoin="round"/>';

  /* ── THE WEDGES. Wedge k = (centre, V[k-1], V[k]) in seat k's colour.
     They share edges and cover the polygon: no gaps, no overlaps. ── */
  for (let k = 0; k < P; k++){
    const hx = hexOf(colourFor(st, k));
    const a = V[(k - 1 + P) % P], b = V[k];
    s += '<path class="lu-wedge" data-wedge="' + k + '" d="M' + C + ' ' + C + 'L' +
      a.x.toFixed(2) + ' ' + a.y.toFixed(2) + 'L' + b.x.toFixed(2) + ' ' + b.y.toFixed(2) +
      'Z" fill="' + esc(hx) + '" stroke="rgba(0,0,0,.30)" stroke-width="0.7" ' +
      'stroke-linejoin="round"/>';
    /* a soft sheen down the outer half so eight flat colours do not read
       like a pie chart */
    s += '<path d="M' + C + ' ' + C + 'L' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) + 'L' +
      b.x.toFixed(2) + ' ' + b.y.toFixed(2) + 'Z" fill="url(#lu-wsheen)" ' +
      'pointer-events="none"/>';
  }

  /* ── THE CORNER BLOCKS — the dark blocks the eight-player board wears
     at the octagon's corners. Drawn at every vertex; on the hexagon they
     read as the printed corner joints of the rim. ── */
  const cq = pitch * (P >= 8 ? 2.05 : 1.55);
  for (let j = 0; j < P; j++){
    const w = V[j];
    const midA = { x: C + g.F[j].ux * g.rPoly, y: C + g.F[j].uy * g.rPoly };
    const nx = (j + 1) % P;
    const midB = { x: C + g.F[nx].ux * g.rPoly, y: C + g.F[nx].uy * g.rPoly };
    const along = (from, to, d) => {
      const dx = to.x - from.x, dy = to.y - from.y, m = Math.hypot(dx, dy) || 1;
      return { x: from.x + dx / m * d, y: from.y + dy / m * d };
    };
    s += '<path d="' + ptsPath([w, along(w, midA, cq), along(w, midB, cq)]) +
      '" fill="#171126" fill-opacity="' + (P >= 8 ? '0.92' : '0.55') +
      '" stroke="rgba(0,0,0,.4)" stroke-width="0.5" stroke-linejoin="round"/>';
  }

  /* ── THE TRACK BAND — a cream ring just inside the rim, the row of
     cells tiled into it. Even-odd of two concentric polygons. ── */
  const bh = pitch * 1.05;
  s += '<path d="' + polyPathAt(g, g.rBand + bh) + polyPathAt(g, g.rBand - bh) +
    '" fill-rule="evenodd" fill="#f7f5ef" stroke="rgba(0,0,0,.20)" stroke-width="0.6"/>';

  /* ── THE YARD PLATES + the four parked slots ── */
  g.yard.forEach((y, k) => {
    const hx = hexOf(colourFor(st, k));
    s += '<path class="lu-yard" d="' + ptsPath(y.plate) + '" fill="#f7f5ef" ' +
      'stroke="' + esc(hx) + '" stroke-opacity="0.8" stroke-width="1.4" ' +
      'stroke-linejoin="round"/>';
    y.slots.forEach(sl => {
      s += '<circle class="lu-well" cx="' + sl.x.toFixed(2) + '" cy="' + sl.y.toFixed(2) +
        '" r="' + (g.tok * 1.28).toFixed(2) + '" fill="' + esc(hx) + '" fill-opacity="0.20" ' +
        'stroke="' + esc(hx) + '" stroke-opacity="0.75" stroke-width="1.1"/>';
    });
  });

  /* ── THE HOME COLUMNS — mouth (at the edge midpoint) down to the hub ── */
  g.col.forEach((cells, k) => {
    const hx = hexOf(colourFor(st, k));
    /* a thin coloured spine so the five cells read as ONE lane */
    const a = cells[0], b = cells[cells.length - 1];
    s += '<path d="M' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) + 'L' + b.x.toFixed(2) +
      ' ' + b.y.toFixed(2) + '" stroke="' + esc(hx) + '" stroke-opacity="0.55" ' +
      'stroke-width="' + (hs * 2.1).toFixed(2) + '" stroke-linecap="round" fill="none"/>';
    cells.forEach(cc => {
      s += '<path class="lu-home" d="' + sqCell(cc.x, cc.y, hs, cc.th) + '" fill="' +
        esc(hx) + '" stroke="rgba(255,255,255,.75)" stroke-width="0.6"/>';
    });
  });

  /* ── THE HUB — the P-sided finish every column runs into ── */
  s += '<path d="' + polyPathAt(g, g.hub * g.COS) + '" fill="#f7f5ef" ' +
    'stroke="rgba(0,0,0,.25)" stroke-width="0.8" stroke-linejoin="round"/>';
  for (let k = 0; k < P; k++){
    const hx = hexOf(colourFor(st, k));
    const th = (k / P) * 2 * Math.PI, r = g.hub;
    const p0 = { x: C + r * Math.sin(th - g.half), y: C - r * Math.cos(th - g.half) };
    const p1 = { x: C + r * Math.sin(th + g.half), y: C - r * Math.cos(th + g.half) };
    s += '<path class="lu-goal" d="M' + C + ' ' + C + 'L' + p0.x.toFixed(2) + ' ' +
      p0.y.toFixed(2) + 'L' + p1.x.toFixed(2) + ' ' + p1.y.toFixed(2) + 'Z" fill="' +
      esc(hx) + '" fill-opacity="0.92"/>';
  }
  s += '<circle cx="' + C + '" cy="' + C + '" r="' + (g.hub * 0.20).toFixed(2) +
    '" fill="#f7f5ef" stroke="rgba(0,0,0,.2)" stroke-width="0.5"/>';

  /* ── THE RING CELLS — white squares in the band, the entries in the
     owner's colour with an arrow the way the lap runs, stars on safes ── */
  lay.ring.forEach((rc, i) => {
    const p = g.ring[i];
    if (rc.entryOf != null){
      const hx = hexOf(colourFor(st, rc.entryOf));
      s += '<path class="lu-cellc" d="' + sqCell(p.x, p.y, hs, p.th) + '" fill="' + esc(hx) +
        '" stroke="rgba(0,0,0,.28)" stroke-width="0.5"/>';
      const a = g.arm[rc.entryOf];
      const tip = { x: p.x + a.ux * hs * 0.60, y: p.y + a.uy * hs * 0.60 };
      const b1  = { x: p.x - a.ux * hs * 0.22 + a.vx * hs * 0.42,
                    y: p.y - a.uy * hs * 0.22 + a.vy * hs * 0.42 };
      const b2  = { x: p.x - a.ux * hs * 0.22 - a.vx * hs * 0.42,
                    y: p.y - a.uy * hs * 0.22 - a.vy * hs * 0.42 };
      s += '<path d="M' + tip.x.toFixed(2) + ' ' + tip.y.toFixed(2) + 'L' +
        b1.x.toFixed(2) + ' ' + b1.y.toFixed(2) + 'L' + b2.x.toFixed(2) + ' ' +
        b2.y.toFixed(2) + 'Z" fill="rgba(255,255,255,.92)"/>';
    } else {
      s += '<path class="lu-cellw" d="' + sqCell(p.x, p.y, hs, p.th) + '" fill="#fff" ' +
        (rc.safe ? 'stroke="rgba(0,0,0,.32)" stroke-width="0.8"'
                 : 'stroke="rgba(0,0,0,.14)" stroke-width="0.45"') + '/>';
      if (rc.safe)
        s += '<path d="' + starPath(p.x, p.y, hs * 0.66) +
          '" fill="rgba(70,70,84,.5)" stroke="rgba(0,0,0,.18)" stroke-width="0.3"/>';
    }
  });
  return s;
}

function paintBoard(){
  const st = M.st, lay = layoutFor(st), g = geom(lay);
  const cr = g.cell, tr = g.tok;
  const pend = E.pending(st);
  const myTurn = !E.over(st) && isLocal(E.turn(st));
  const canMove = myTurn && pend.phase === 'move';
  const legalToks = {};   /* seat:tok -> destination px, for hints */
  if (canMove) pend.moves.forEach(m => { legalToks[E.turn(st) + ':' + m.k] = m; });
  const hs = cr * 0.94;               /* half-size of a ring/home cell   */

  /* the board disc */
  let s = '<svg class="lu-svg" id="lu-svg" viewBox="0 0 ' + VB + ' ' + VB + '" ' +
    'xmlns="http://www.w3.org/2000/svg" aria-label="' +
    esc(T('The Ludo board', 'It-tabellun tal-Ludu')) + '">' +
    '<defs>' +
      '<radialGradient id="lu-discg" cx="50%" cy="38%" r="72%">' +
        '<stop offset="0" stop-color="#2E2153"/><stop offset="60%" stop-color="#241A3E"/>' +
        '<stop offset="100%" stop-color="#150F28"/></radialGradient>' +
      WSHEEN +
    '</defs>';
  s += g.grid ? boardBodyGrid(st, lay, g, hs) : boardBodyWedge(st, lay, g);

  /* the tokens, grouped by square so stacks fan out a touch */
  const toks = E.tokens(st);
  /* index tokens by their pixel cell so a stack can offset */
  const stackAt = {};
  const posOf = tk => {
    if (tk.where === 'yard'){
      const y = g.yard[tk.seat];
      return y.slots[tk.tok % y.slots.length];
    }
    if (tk.where === 'home') return g.home[tk.seat];
    if (tk.where === 'col'){
      const col = g.col[tk.seat];
      return col[Math.min(tk.col, col.length - 1)];
    }
    return g.ring[tk.ring];   /* ring */
  };

  /* a full-cell, thumb-sized invisible tap surface sits UNDER every
     movable token so the finger never has to find the small disc. It is
     centred on the token (stack offset included) and sized to a whole
     board cell so on the 15×15 grid it is ~cell-wide and on the rosette
     it is a generous square around the piece. Reported below as HIT_U in
     viewBox units; at a 360px board that is HIT_U × 1.5 CSS px. */
  const HIT_U = (g.grid ? g.gap * 1.15 : g.gap * g.step * 1.55);
  UI._hitU = HIT_U; if (M) M._hitU = HIT_U;
  /* when it is my turn to move, DIM everything so the movable pieces are
     the only bright things on the board — "what can I move" at a glance */
  const dimRest = canMove && pend.moves.length > 0;

  /* the hint rings are drawn in one pass ABOVE the tokens so the gold
     destination never hides behind a stacked disc */
  let hints = '';

  toks.forEach(tk => {
    const base = posOf(tk);
    const key = Math.round(base.x) + ',' + Math.round(base.y);
    const n = (stackAt[key] = (stackAt[key] || 0) + 1) - 1;
    const off = n === 0 ? { x:0, y:0 } : { x:(n % 2 ? 1 : -1) * tr * 0.5, y:(n > 1 ? tr * 0.5 : -tr * 0.4) };
    const cx = base.x + off.x, cy = base.y + off.y;
    const hx = hexOf(tk.colour);
    const legal = legalToks[tk.seat + ':' + tk.tok];
    const pick = !!legal;
    const dim = dimRest && !pick ? ' dim' : '';
    const cls = 'lu-tok' + (pick ? ' pick' : '') + dim;
    s += '<g class="' + cls + '"' +
      (pick ? ' data-tok="' + tk.tok + '" role="button" tabindex="0" aria-label="' +
        esc(T('Move this token', 'Ċaqlaq din il-biċċa')) + '"' : ' aria-hidden="true"') +
      ' data-seat="' + tk.seat + '" data-cx="' + cx.toFixed(1) + '" data-cy="' + cy.toFixed(1) + '">';
    /* a soft glow halo behind a movable piece — reads before you look */
    if (pick){
      s += '<circle class="glow" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) +
        '" r="' + (tr * 1.42).toFixed(1) + '" fill="' + esc(hx) + '"/>';
    }
    s += '<circle class="body" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' +
        tr.toFixed(1) + '" fill="' + esc(hx) + '"/>' +
      '<circle class="gloss" cx="' + (cx - tr * 0.28).toFixed(1) + '" cy="' +
        (cy - tr * 0.32).toFixed(1) + '" r="' + (tr * 0.28).toFixed(1) + '" fill-opacity="0.55"/>';
    /* the generous invisible hit target, LAST so it is the topmost thing
       inside the group and catches the pointer wherever the thumb lands */
    if (pick){
      s += '<rect class="hit" x="' + (cx - HIT_U / 2).toFixed(1) + '" y="' +
        (cy - HIT_U / 2).toFixed(1) + '" width="' + HIT_U.toFixed(1) + '" height="' +
        HIT_U.toFixed(1) + '" rx="3" ry="3" fill="transparent"/>';
    }
    s += '</g>';
    /* a legal move gets a gold destination ring drawn at the target cell */
    if (legal){
      const dest = destPx(st, lay, tk.seat, legal);
      if (dest) hints += '<circle class="lu-hint" cx="' + dest.x.toFixed(1) + '" cy="' +
        dest.y.toFixed(1) + '" r="' + (cr + 1.5).toFixed(1) + '"/>';
    }
  });
  s += hints;

  s += '</svg>';
  UI.boardbox.innerHTML = s;
  UI.svg = UI.boardbox.querySelector('#lu-svg');
  sizeBoard();

  /* ONE pointer handler — pointerdown so the tap registers on the FIRST
     touch with no 300ms click delay and no dead zone. A press state is
     added instantly, then the move animates. click/keydown stay as an
     accessible fallback but are guarded so a pointer tap never double-fires. */
  UI.svg.addEventListener('pointerdown', onBoardPress);
  UI.svg.addEventListener('click', onBoardTap);
  UI.svg.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); onBoardTap(e); }
  });
}

/* the colour worn by a seat index (for entry-square tinting) */
function colourFor(st, seat){
  const s = st.seats[seat % st.n];
  return s ? s.colour : (COLOURS[seat % COLOURS.length] || {}).id;
}

/* where a seat's OWN path position `p` (0..HOME) sits in board px — the
   single source both destPx and the slide read, so a token in flight
   passes through exactly the cells the board draws. */
function pathPx(st, lay, seat, p){
  const bd = E.bdOf(st), g = geom(lay), R = lay.R, HOME = lay.HOME;
  if (p === HOME) return g.home[seat];
  if (p > R - 1){
    const col = g.col[seat];
    return col[Math.min(p - R, col.length - 1)];
  }
  if (p < 0){                                  /* still in the yard */
    const y = g.yard[seat];
    return y.slots[0];
  }
  return g.ring[bd.sq(seat, p)];
}
/* where a legal move lands, in board px */
function destPx(st, lay, seat, m){
  return pathPx(st, lay, seat, m.to);
}

/* THE PRESS — pointerdown. Registers the tap on first touch, shows an
   instant press state, and (unless reduced motion) slides the piece
   cell-by-cell before the state actually changes. Guarded so the click
   that follows a pointer tap does not fire the move twice. */
let pressGuard = 0;
function onBoardPress(e){
  if (!M || M.dead) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const g = e.target && e.target.closest && e.target.closest('.lu-tok[data-tok]');
  if (!g){ return; }                           /* empty / non-movable → nothing */
  e.preventDefault();
  pressGuard = Date.now();                      /* swallow the synthetic click */
  g.classList.add('press');
  const seat = E.turn(M.st);
  const k = g.getAttribute('data-tok') | 0;
  tapMove(seat, k, g);
}
/* the click path stays for keyboard/AT and non-pointer taps only */
function onBoardTap(e){
  if (!M || M.dead) return;
  if (Date.now() - pressGuard < 700) return;    /* pointer already handled it */
  const g = e.target && e.target.closest && e.target.closest('.lu-tok[data-tok]');
  if (!g) return;
  const seat = E.turn(M.st);
  const k = g.getAttribute('data-tok') | 0;
  tapMove(seat, k, g);
}

/* the shared move gate for a thumb: verify it is the local seat's move,
   grab the flight path BEFORE the engine advances, apply, then slide the
   piece to where the engine put it. */
let sliding = false;
function tapMove(seat, k, gEl){
  if (sliding) return;                          /* one move at a time */
  if (!isLocal(seat)) return;
  const st = M.st, lay = layoutFor(st);
  const pend = E.pending(st);
  const legal = (pend.moves || []).find(m => m.k === k);
  const from = st.seats[seat] ? st.seats[seat].toks[k] : undefined;
  const res = doMove(seat, { t:'move', k }, 'local');
  if (!res.ok){ if (gEl) gEl.classList.remove('press'); cue('ui.error', { gain:0.5 }); return; }
  /* the engine has advanced; animate the piece we just moved along its
     own path from `from` to `legal.to`, then paint the true board */
  if (legal && from != null && !reduced() && !stillMode()){
    slidePiece(seat, k, from, legal.to, lay);
  } else {
    render();
  }
}
function stillMode(){
  const scr = document.getElementById('scr-party');
  return !!(scr && scr.classList.contains('lu-still'));
}

/* slide a lifted clone of the moved piece cell-by-cell to its landing,
   compositor-only (transform), then hand back to a clean render(). This
   is render-only: the engine state is already final. */
function slidePiece(seat, k, from, to, lay){
  const st = M.st;
  /* the cells the piece visits, in its own path order (skip the yard-exit
     jump: a token entering from the yard just lands, no ring crawl) */
  const cells = [];
  if (from < 0){
    cells.push(pathPx(st, lay, seat, to));
  } else {
    for (let p = from; p <= to; p++) cells.push(pathPx(st, lay, seat, p));
  }
  if (cells.length < 2){ render(); return; }

  /* build a lifted token that flies over the static board; the real
     moved token is hidden underneath until we land */
  const svg = UI && UI.svg;
  if (!svg){ render(); return; }
  const g = geom(lay), tr = g.tok, hx = hexOf(colourFor(st, seat));
  /* hide the source token (still drawn at `from` in the pre-move DOM) and
     dull the gold hints so only the flying piece reads during the slide */
  const srcEl = svg.querySelector('.lu-tok[data-tok="' + k + '"][data-seat="' + seat + '"]');
  if (srcEl) srcEl.style.visibility = 'hidden';
  svg.querySelectorAll('.lu-hint').forEach(h => { h.style.opacity = '0.18'; });
  const NS = 'http://www.w3.org/2000/svg';
  const fly = document.createElementNS(NS, 'g');
  fly.setAttribute('class', 'lu-fly');
  const p0 = cells[0];
  fly.innerHTML =
    '<circle cx="' + p0.x.toFixed(1) + '" cy="' + p0.y.toFixed(1) + '" r="' +
      (tr * 1.15).toFixed(1) + '" fill="' + esc(hx) + '" stroke="#fff" stroke-width="1.1"/>' +
    '<circle cx="' + (p0.x - tr * 0.28).toFixed(1) + '" cy="' + (p0.y - tr * 0.32).toFixed(1) +
      '" r="' + (tr * 0.28).toFixed(1) + '" fill="#fff" fill-opacity="0.55"/>';
  svg.appendChild(fly);

  sliding = true;
  let i = 1;
  const per = Math.max(70, Math.min(150, 620 / (cells.length - 1)));  /* ms per step */
  const step = () => {
    if (!M || M.dead || !fly.isConnected){ sliding = false; return; }
    const c = cells[i], b = cells[i - 1];
    fly.style.transition = 'transform ' + per + 'ms cubic-bezier(.34,.9,.4,1)';
    fly.style.transform = 'translate(' + (c.x - p0.x).toFixed(1) + 'px,' + (c.y - p0.y).toFixed(1) + 'px)';
    if (i < cells.length - 1) cue('piece.slide', { gain: 0.35 });
    i++;
    if (i < cells.length){ setTimeout(step, per); }
    else {
      setTimeout(() => {
        sliding = false;
        try { fly.remove(); } catch(e){}
        if (M && !M.dead) render();
      }, per + 40);
    }
  };
  /* kick after a frame so the initial transform paints before the first move */
  requestAnimationFrame(() => requestAnimationFrame(step));
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
  /* record the table result offline. In teams mode a win is your TEAM
     winning, which over().tone already resolves relative to the local
     seat; otherwise it is the local seat coming first. */
  const localWon = ov && (st.teams ? ov.tone === 'win' : ov.winner === me);
  if (!M.net && !M.recorded){
    M.recorded = true;
    if (localWon) ST.rec.w++; else ST.rec.l++;
    persist();
  }
  saveSlot(null);

  /* TEAMS: the winner screen ranks TEAMS, one row per team in placing
     order, each row naming its two-or-more partners and flagged if the
     local seat is on it. Non-teams: one row per seat as before. */
  let rows;
  if (st.teams && ov && ov.teamRanks && ov.teamRanks.length){
    rows = ov.teamRanks.map((team, i) => {
      const members = (ov.teamSeats && ov.teamSeats[i]) || E.teamSeats(st, team);
      const mine = members.some(sq => isLocal(sq));
      const first = members[0];
      const names = members.map(sq => {
        const s = st.seats[sq];
        return isLocal(sq) ? T('You', 'Int')
          : s.own === 'ai' ? levelName(s.lvl) + ' ' + (sq + 1) : s.name;
      });
      return {
        name: (T('Team', 'Tim') + ' ' + (TEAM_LETTERS[team] || (team + 1))),
        place: i + 1,
        you: mine,
        bot: members.every(sq => st.seats[sq].own === 'ai'),
        score: names.join(' + '),
        border: st.seats[first].colour
      };
    });
  } else {
    const order = (ov && ov.ranks && ov.ranks.length) ? ov.ranks
      : tally.slice().sort((a,b) => (a.rank||99) - (b.rank||99)).map(t => t.seat);
    rows = order.map((seat, i) => {
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
  }

  const show = window.KARTI_REBBIEH && window.KARTI_REBBIEH.show;
  if (!show){
    /* rebbieh not on the page — fall back to the party result card */
    P.ui.result(M.ctx, {
      tone: localWon ? 'win' : 'lose',
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
    title: (ov && ov.tone === 'win')
             ? (st.teams ? T('Your team is home', 'It-tim tiegħek wasal id-dar')
                         : T('You are home', 'Wasalt id-dar'))
             : TE(ov ? ov.head : E.t('won')),
    subtitle: st.teams ? T('Team standings', 'Klassifika tat-timijiet')
                       : T('Final standings', 'Klassifika finali'),
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

/* the board badge for the setup sheet — the AUTHENTIC layout in
   miniature (a cross at 4, a hexagon at 6, an octagon at 8), so the
   preview is the real board the player is about to get. Colours use
   the default seat order (no live state on the setup sheet). */
function heroSVG(n){
  const lay = E.layout(n, E.HOME_LEN, 'stars');
  const g = geom(lay);
  const cr = g.cell, hs = cr * 0.94;
  const hx = k => hexOf((COLOURS[k % COLOURS.length] || {}).id);
  let s = '<svg viewBox="0 0 ' + VB + ' ' + VB + '" xmlns="http://www.w3.org/2000/svg" ' +
    'aria-hidden="true">' +
    '<defs><radialGradient id="lu-herog" cx="50%" cy="35%" r="72%">' +
    '<stop offset="0" stop-color="#3A2A66"/><stop offset="100%" stop-color="#171029"/>' +
    '</radialGradient></defs>' +
    '<circle cx="' + C + '" cy="' + C + '" r="' + (RAD + 6) + '" fill="url(#lu-herog)" ' +
    'stroke="rgba(0,0,0,.5)" stroke-width="0.6"/>';
  /* yards */
  g.yard.forEach((y, k) => {
    s += '<path d="' + sqCell(y.cx, y.cy, y.size / 2, y.theta) + '" fill="' + esc(hx(k)) +
      '" fill-opacity="0.55" stroke="' + esc(hx(k)) + '" stroke-width="1.1"/>';
  });
  /* home columns */
  g.col.forEach((cells, k) => cells.forEach(cc => {
    s += '<path d="' + sqCell(cc.x, cc.y, hs, g.arm[k].theta) + '" fill="' + esc(hx(k)) +
      '" fill-opacity="0.5"/>';
  }));
  /* centre finish */
  const fr = g.finishR * 1.9;
  for (let k = 0; k < g.P; k++){
    const a0 = g.arm[k].theta - Math.PI / 2 - Math.PI / g.P;
    const a1 = g.arm[k].theta - Math.PI / 2 + Math.PI / g.P;
    s += '<path d="M' + C + ' ' + C + 'L' + (C + fr * Math.cos(a0)).toFixed(1) + ' ' +
      (C + fr * Math.sin(a0)).toFixed(1) + 'L' + (C + fr * Math.cos(a1)).toFixed(1) + ' ' +
      (C + fr * Math.sin(a1)).toFixed(1) + 'Z" fill="' + esc(hx(k)) + '" fill-opacity="0.8"/>';
  }
  /* ring */
  lay.ring.forEach((rc, i) => {
    const p = g.ring[i];
    const th = g.arm[(rc.role === 'in' ? (rc.sector + 1) % g.P : rc.sector)].theta;
    const fill = rc.entryOf != null ? esc(hx(rc.entryOf)) : 'rgba(255,255,255,.16)';
    const op = rc.entryOf != null ? '0.75' : (rc.safe ? '0.5' : '0.32');
    s += '<path d="' + sqCell(p.x, p.y, hs, th) + '" fill="' + fill + '" fill-opacity="' + op + '"/>';
    if (rc.safe && rc.entryOf == null)
      s += '<path d="' + starPath(p.x, p.y, cr * 0.55) + '" fill="rgba(255,255,255,.6)"/>';
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
  /* TEAMS. Off by default. teamSize picks the grouping for counts that
     offer more than one (6 → 2 or 3, 8 → 2 or 4); at 4 there is only 2v2.
     The choice is part of the match tuple deal() reads (opts.teams,
     opts.teamSize), so every phone that deals it sits at the same board. */
  let teamsOn  = !!p.teams;
  let teamSize = p.teamSize | 0 || 2;
  const teamOpts  = () => (E.TEAM_SIZES && E.TEAM_SIZES[seats]) || [];
  const teamAllowed = () => teamOpts().length > 0;
  /* keep teamSize legal for the current seat count */
  const fixTeamSize = () => {
    const opt = teamOpts();
    if (!opt.length){ teamsOn = false; return; }
    if (opt.indexOf(teamSize) < 0) teamSize = opt[0];
  };

  function paint(){
    if (mode === 'pnp') humans = Math.max(2, Math.min(seats, humans));
    fixTeamSize();
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

        /* ── TEAMS — a toggle, and (where the count offers more than one)
           the grouping. Partners sit opposite; a whole team must get home
           to win. Off by default. ── */
        (teamAllowed()
          ? '<div class="tiny pt-lbl">' + esc(T('Teams', 'Timijiet')) + '</div>' +
            '<div class="lu-teams" id="lu-teams">' +
              '<button class="lu-tbtn' + (teamsOn ? '' : ' on') + '" id="lu-tno">' +
                esc(T('Every player for themselves', 'Kull wieħed għalih')) + '</button>' +
              '<button class="lu-tbtn' + (teamsOn ? ' on' : '') + '" id="lu-tyes">' +
                esc(T('Play in teams', 'Ilgħabu f’timijiet')) + '</button>' +
            '</div>' +
            (teamsOn && teamOpts().length > 1
              ? '<div class="lu-tsize" id="lu-tsize">' + teamOpts().map(sz => {
                  const G = seats / sz;
                  const label = G + ' × ' + sz;   /* e.g. 3 × 2, 2 × 4 */
                  return '<button class="lu-tszb' + (sz === teamSize ? ' on' : '') +
                    '" data-tsz="' + sz + '">' + esc(label) + '</button>';
                }).join('') + '</div>'
              : '') +
            (teamsOn
              ? '<p class="lu-note lu-tnote" style="margin-top:8px">' +
                esc(teamsBlurb(seats, teamSize)) + '</p>'
              : '')
          : '') +

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
    const tno = el.querySelector('#lu-tno'), tyes = el.querySelector('#lu-tyes');
    if (tno)  tno.onclick  = () => { if (teamsOn){ teamsOn = false; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    if (tyes) tyes.onclick = () => { if (!teamsOn){ teamsOn = true; fixTeamSize(); cue('ui.tap', { gain:0.8 }, true); paint(); } };
    el.querySelectorAll('[data-tsz]').forEach(b => b.onclick = () => {
      teamSize = +b.dataset.tsz; cue('ui.tap', { gain:0.8 }, true); paint();
    });
    el.querySelector('#lu-go').onclick = () => {
      fixTeamSize();
      const useTeams = teamsOn && teamAllowed();
      pref({ seats, lvl, humans: mode === 'pnp' ? humans : 1,
             teams: useTeams, teamSize: useTeams ? teamSize : 0 });
      const o = { seats, humans: mode === 'pnp' ? humans : 1, lvl, dice:'seed' };
      if (useTeams){ o.teams = true; o.teamSize = teamSize; }
      newGame(o);
    };
  }
  paint();
}

/* a one-line description of the partnership for the setup note: how many
   teams of what size, and — at teamSize 2 — that partners sit opposite. */
function teamsBlurb(seats, size){
  const G = seats / size;
  if (size === 2)
    return T(G + ' teams of two — partners sit opposite and cannot capture each other. ' +
             'A whole team must get home to win.',
             G + ' timijiet ta’ tnejn — is-sħab joqogħdu wieħed biswit l-ieħor u ma jistgħux ' +
             'jaqbdu lil xulxin. It-tim kollu jrid jasal id-dar biex jirbaħ.');
  return T(G + ' teams of ' + size + ' — teammates cannot capture each other, and the whole ' +
           'team must get home to win.',
           G + ' timijiet ta’ ' + size + ' — is-sħab ma jistgħux jaqbdu lil xulxin, u t-tim ' +
           'kollu jrid jasal id-dar biex jirbaħ.');
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
  /* seats from the room; dice stays 'seed' until the relay stamps it.
     TEAMS is part of the match tuple deal() reads, so it must be identical
     on every phone — it comes off the room config (cfg.teams / cfg.teamSize,
     or an opts already carrying them) and never from local prefs, or two
     clients would deal different partnerships and desync. */
  const src = cfg.opts || {};
  const wantTeams = cfg.teams === true || cfg.teams === 'on' ||
                    src.teams === true || src.teams === 'on';
  const opts = Object.assign({}, src, {
    seats: (cfg.seats && cfg.seats.length) || src.seats || 4,
    humans: 0,                 /* ownership is set per-seat below, not by count */
    dice: 'seed'
  });
  if (wantTeams){ opts.teams = true; opts.teamSize = (cfg.teamSize || src.teamSize | 0) || 2; }
  else { delete opts.teams; delete opts.teamSize; }
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
  name:'LUDU', mt:'Il-Ludu', icon:'flag', status:'live',
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
    engine: E, LOBBY, hooks, online: P.online.ludu, leave,
    geom, layoutFor
  };
}

})();
