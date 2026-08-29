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
/* HAPTICS — beside the cue() that already marks the same moment. js/sfx.js
   owns the pattern, the player's switch and every no-op path, so nothing
   here needs a guard beyond the module being absent. NOT gated on reduced()
   — a buzz in the hand is not motion and has its own switch — but always
   gated on `mine`: the machine's dice and another phone's capture play the
   whole theatre and leave the hand perfectly still. */
function buzz(kind){ try { const S = window.KARTI_SFX; if (S && S.haptic) S.haptic(kind); } catch(e){} }
function reduced(){
  try {
    if (document.body && document.body.classList.contains('reduced')) return true;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch(e){ return false; }
}
/* THE HOP SOUND. Each cell a token clears makes an actual little HOP —
   dama.jump is the checkers "spring" sound, the closest thing in the kit
   to a bounce. A tiny rate lift as the run goes on keeps a long march
   from sounding robotic without turning it into a musical scale (the old
   pentatonic note read as a xylophone, not hopping). */
function sfxHop(i, gain){
  const S = window.KARTI_SFX;
  if (!S || !S.play) return;
  try { S.play('dama.jump', { force: true, gain: gain || 0.4,
                              rate: 0.94 + Math.min(i, 8) * 0.02 }); } catch(e){}
}
/* one pentatonic step off sfx.js's instrument — kept for the die flourish */
function sfxN(step, gain){
  const S = window.KARTI_SFX;
  if (!S || !S.note) return;
  try { S.note(step, { gain: gain || 0.5 }); } catch(e){}
}
/* lighten (f>0) / darken (f<0) a #rrggbb — the cheap bevel's two ends */
function shade(hex, f){
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const to = f > 0 ? 255 : 0, k = Math.abs(f);
  r = Math.round(r + (to - r) * k); g = Math.round(g + (to - g) * k); b = Math.round(b + (to - b) * k);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
/* tokens per player by table size — mirrors the engine's tokensFor (not
   exported); only the SETUP HERO uses this, a live match reads st.tokens */
function tokensForUI(n){ return (n <= 4) ? 4 : (n <= 6) ? 3 : 2; }

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
  killTheatre();
  M = {
    opts: clone(opts || {}),
    seed: (seed == null ? newSeed() : (seed >>> 0)),
    log: log ? clone(log) : [],
    st: null, ctx: null,
    timer: 0, dead: false, finished: false,
    anim: null,                       /* {kind, ...} the last thing to animate */
    recorded: false,
    net: null, meta: null,
    skins: {},                        /* seat → exclusive-set wire byte    */
    exclSaid: false                   /* my byte goes out once, first move */
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

/* ═══════════════════════════════════════════════════════════════════
   THE GOLDEN ROUTE (ludu.*.excl) — who is gilded on this table.
   Tokens are a PLAYER's pieces, so they travel: my equipped set rides
   my first move as the appended `e` wire byte (see WIRE_FIELDS in
   js/ludu.js) and lands in M.skins, seat → byte, so every phone gilds
   that seat's tokens. The DICE and the BOARD are shared table surfaces
   the local player looks at, so — like every basic cosmetic — they are
   the local choice and never travel. A gilded token keeps its SEAT
   COLOUR as the rim: four golden armies you cannot tell apart would
   break the board, and the rim is how you read whose token that is.
   ═══════════════════════════════════════════════════════════════════ */
function xEq(slot){
  try {
    const XP = window.KARTI_XP;
    return !!XP && XP.equipped(slot, 'ludu') === 'ludu.' + slot + '.excl';
  } catch(e){ return false; }
}
function giltSeat(seat){
  if (!M || !M.st) return false;
  const s = M.st.seats[seat];
  if (s && s.own === 'me') return xEq('tokens');
  return !!(M.skins && M.skins[seat] === 1);
}
/* the golden token gradient, added to the board defs every paint */
const GTOK =
  '<radialGradient id="lu-gtok" cx="38%" cy="30%" r="80%">' +
    '<stop offset="0" stop-color="#FFF6CF"/><stop offset="45%" stop-color="#FFD979"/>' +
    '<stop offset="100%" stop-color="#C8860D"/></radialGradient>';

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
  const out = clone(move);
  /* my exclusive-set byte rides my FIRST outgoing move — once, tagged on
     the fired clone only (never the log, never the engine). AI chairs a
     host runs are not `me`, so they are never tagged. */
  if (M.net && (src || 'local') !== 'net' && ownerOf(seat) === 'me' && !M.exclSaid){
    M.exclSaid = true;
    if (xEq('tokens')) out.e = 1;
  }
  fireList(moveSubs,  { seat, move:out, index:idx, src:src || 'local' });
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
  if (mv.t === 'roll'){
    if (mine) buzz('roll');            /* HIS die, tumbling in his hand */
    cue('dice.roll', { gain: mine ? 0.85 : 0.6 }, true);
    /* A SIX IS AN EVENT — a little rising pentatonic flourish lands just
       as the die settles (the die itself glows, see paintDock) */
    if (st.last && st.last.t === 'roll' && st.last.d === 6 &&
        st.why !== 'threesixes' && st.why !== 'threesent'){
      cueIn(430, () => sfxN(5, 0.5));
      cueIn(540, () => sfxN(8, 0.5));
    }
    /* three sixes: the turn dies — a small mocking un-toggle */
    if (st.why === 'threesixes' || st.why === 'threesent')
      cueIn(430, () => cue('ui.untoggle', { gain: 0.6 }));
    return;
  }
  if (mv.t === 'pass'){ cue('ui.back',   { gain: 0.45 }); return; }
  if (mv.t === 'quit'){ cue('mp.left',   { gain: 0.7 }); return; }
  if (mv.t === 'move'){
    /* when the THEATRE is running it voices the move itself, per hop and
       at the landing, so the sound stays glued to the picture */
    if (theatreWilling()) return;      /* the theatre voices AND buzzes it */
    const why = st.why;
    /* no theatre: the token still ARRIVED, so the moment still gets a thud */
    if (mine) buzz('thud');
    if (why === 'capture' || why === 'captureagain'){ cue('piece.capture', { gain: mine ? 0.9 : 0.72 }, true); return; }
    if (why === 'home' || why === 'homeagain' || why === 'finished' ||
        why === 'teamfinished'){ cue('ui.reward', { gain: 0.9 }, true); return; }
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
      'gap:5px;padding:6px 0 7px;position:relative}' +

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
    /* a capture destination warns in red */
    '#scr-party .lu-hint.cap{stroke:#FF6A5A}' +
    /* the GHOST TOKEN — "where you are going": a translucent copy of the
       piece already stood on the landing cell, breathing */
    '#scr-party .lu-ghost{pointer-events:none}' +
    '#scr-party.lu-anim .lu-ghost{animation:lu-ghk 1.1s ease-in-out infinite}' +
    '@keyframes lu-ghk{0%,100%{opacity:.38}50%{opacity:.8}}' +

    /* ── the tokens ── */
    '#scr-party .lu-tok{transform-box:fill-box;transform-origin:center;' +
      'transition:transform .28s var(--ease,cubic-bezier(.22,.9,.28,1))}' +
    '#scr-party .lu-tok .body{stroke:rgba(0,0,0,.55);stroke-width:.5}' +
    '#scr-party .lu-tok .gloss{fill:rgba(255,255,255,.5)}' +
    /* THE GOLDEN ROUTE — a gilded token keeps its seat colour as the rim
       (identity first); a movable one still flips to the white pick ring */
    '#scr-party .lu-tok.gilt .body{stroke:var(--lus,#8A5B12);stroke-width:1.2}' +
    '#scr-party .lu-tok.gilt.pick .body{stroke:#fff;stroke-width:1.3}' +
    /* the golden dice (local choice) */
    '#scr-party .lu-die.lu-die-x{background:linear-gradient(155deg,#FFF3C9,#E9B93B);' +
      'border-color:#8A5B12;box-shadow:0 4px 0 -1px rgba(0,0,0,.4),' +
      'inset 0 2px 0 rgba(255,255,255,.8),0 0 14px rgba(255,197,66,.45)}' +
    '#scr-party .lu-die.lu-die-x i{background:#4A3005}' +
    /* the board paved in light (local choice) — the travel cells and the
       yards go warm gold; the coloured cells keep their seats */
    '#scr-party .lu-xb .lu-cellw{fill:#FFE9AE}' +
    '#scr-party .lu-xb .lu-yard{fill:#FFF3D4}' +
    '#scr-party .lu-xb .lu-band{fill:#FFF0C4}' +
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
      'transform-origin:center;transition:transform .08s var(--ease,ease)}' +
    /* the lifted token in flight — a shadow so it reads as picked up */
    '#scr-party .lu-fly{transform-box:view-box;pointer-events:none;' +
      'filter:drop-shadow(0 2px 2px rgba(0,0,0,.45))}' +
    /* THE HOP — the token bounces cell to cell: the outer .lu-fly slides,
       this inner group arcs up and squashes on every landing. One CSS
       animation whose period IS the per-cell step, so they cannot drift. */
    '#scr-party .lu-hopI{animation:lu-hopk var(--luhms,120ms) linear infinite;' +
      'transform-box:fill-box;transform-origin:center 70%}' +
    '@keyframes lu-hopk{0%{transform:translateY(0) scale(1)}' +
      '42%{transform:translateY(var(--luarc,-6px)) scale(1.05,1.03)}' +
      '82%{transform:translateY(0) scale(1)}92%{transform:translateY(0) scale(1.14,.85)}' +
      '100%{transform:translateY(0) scale(1)}}' +
    /* the final landing: one meaty squash-and-settle */
    '#scr-party .lu-landI{animation:lu-landk .2s ease-out 1;' +
      'transform-box:fill-box;transform-origin:center 70%}' +
    '@keyframes lu-landk{0%{transform:scale(1.3,.62)}55%{transform:scale(.9,1.08)}' +
      '100%{transform:scale(1)}}' +
    /* THE TAUNT — the capturer stands on the victim and laughs: three
       little bounces with a rotation shake */
    '#scr-party .lu-tauntI{animation:lu-tauntk .74s ease-in-out 1;' +
      'transform-box:fill-box;transform-origin:center 80%}' +
    '@keyframes lu-tauntk{0%{transform:translateY(0) rotate(0)}' +
      '12%{transform:translateY(-5px) rotate(-9deg)}26%{transform:translateY(0) rotate(7deg)}' +
      '40%{transform:translateY(-4px) rotate(-7deg)}54%{transform:translateY(0) rotate(5deg)}' +
      '70%{transform:translateY(-2px) rotate(-3deg)}100%{transform:translateY(0) rotate(0)}}' +
    /* the victim, squashed flat under the capturer */
    '#scr-party .lu-flatI{transform:scale(1.35,.3);transition:transform .16s ease-in;' +
      'transform-box:fill-box;transform-origin:center 90%}' +
    '#scr-party.lu-still .lu-tok.pick{animation:none}' +
    '#scr-party.lu-still .lu-tok{transition:none}' +
    'body.reduced #scr-party .lu-tok,body.reduced #scr-party.lu-anim .lu-hint,' +
      'body.reduced #scr-party .lu-tok.pick,body.reduced #scr-party .lu-tok.pick .glow,' +
      'body.reduced #scr-party .lu-hopI,body.reduced #scr-party .lu-landI,' +
      'body.reduced #scr-party .lu-tauntI,body.reduced #scr-party .lu-ghost,' +
      'body.reduced #scr-party .lu-flatI,body.reduced #scr-party .lu-fly{' +
      'animation:none!important;transition:none!important}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .lu-tok,#scr-party.lu-anim .lu-hint,' +
      '#scr-party .lu-tok.pick,#scr-party .lu-tok.pick .glow,#scr-party .lu-hopI,' +
      '#scr-party .lu-landI,#scr-party .lu-tauntI,#scr-party .lu-ghost,' +
      '#scr-party .lu-flatI,#scr-party .lu-fly{animation:none!important;transition:none!important}}' +

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
    /* the die BOUNCES when thrown — up, spin, drop, one little rebound */
    '#scr-party .lu-die.rolling{animation:lu-roll .55s cubic-bezier(.3,.6,.4,1)}' +
    '@keyframes lu-roll{0%{transform:translateY(0) rotate(0) scale(1)}' +
      '28%{transform:translateY(-10px) rotate(150deg) scale(1.12)}' +
      '52%{transform:translateY(3px) rotate(250deg) scale(.95)}' +
      '70%{transform:translateY(-5px) rotate(315deg) scale(1.04)}' +
      '86%{transform:translateY(1px) rotate(348deg)}' +
      '100%{transform:translateY(0) rotate(360deg) scale(1)}}' +
    /* A SIX IS AN EVENT — the die glows gold and swells twice */
    '#scr-party .lu-die.six{border-color:#FFD979;box-shadow:0 4px 0 -1px rgba(0,0,0,.4),' +
      'inset 0 2px 0 rgba(255,255,255,.7),0 0 16px rgba(255,197,66,.55)}' +
    '#scr-party.lu-anim .lu-die.six:not(.rolling){animation:lu-sixp .5s ease-out 2}' +
    '@keyframes lu-sixp{0%{transform:scale(1)}40%{transform:scale(1.12)}100%{transform:scale(1)}}' +
    'body.reduced #scr-party .lu-die.rolling,body.reduced #scr-party .lu-die.six{animation:none!important}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .lu-die.rolling,' +
      '#scr-party .lu-die.six{animation:none!important}}' +
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
function geom(lay, T){
  const P = lay.P;
  const tok = Math.max(1, T | 0 || 4);
  const key = P + '|' + lay.H + '|' + tok;
  if (GEOM[key]) return GEOM[key];
  const out = (P === 4) ? geomGrid(lay) : geomStar(lay, tok);
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

/* ── THE STAR BOARD (every P except the 15×15 cross) ─────────────────
   A real six- or eight-player Ludo board is the CROSS with more arms:
   a star of P three-lane corridors radiating from the hub, exactly the
   anatomy of the classic four-arm board. The engine's longer sectors
   (railOf now keeps the full 13-square sector at every size — 78 ring
   cells at six seats, 104 at eight) made the old rim-band wedge board
   unreadable on a phone: 104 cells around one polygon rim is ~5px a
   cell. Laid out radially, the same cells get nearly twice the size,
   and the board finally looks like what it is — Ludo.

   ONE SECTOR of the engine's ring = ONE ARM, walked clockwise:

                    tip (the sector's CORNER cell)
                     ◇
                    ▫ ▫        ← up-rail (out, jj outward) │
                    ▫ ▫          down-rail (in, jj inward) │ L cells
                    ▫ ▫                                    │ each side
                    ▫ ▫
              entry→▫ ▫←──── previous seat's turnoff is the
                   /   \      down-rail base of the arm BEFORE this one
              ░░░ /     \ ░░░   ← the VALLEYS between arms hold each
              ░░ home col ░░      seat's YARD (outer) and its coloured
                 ▪▪ hub ▪▪        HOME COLUMN (inner, running to the hub)

   · ARM k sits on axis θ_k = k·(2π/P), clockwise from the top. Its two
     rails are at lateral ±LAT pitches. The engine's ring index maps in
     three lines and cannot drift:
         out cell (sector k, jj)  → arm k up-rail,  radius r0 + jj
         corner   (sector k)      → arm k's TIP,    radius r0 + L
         in cell  (sector k, jj)  → arm k down-rail, radius r0 + L-1-jj
     so the walk runs up one side, round the tip, down the other — and
     sector k's last cell (seat k+1's TURNOFF, down-rail base of arm k)
     sits across the valley from seat k+1's ENTRY (up-rail base of arm
     k+1), flanking that valley's home-column mouth. Everything seat k
     owns — entry, turnoff, column, yard — clusters round ONE valley,
     exactly as each player's quadrant clusters on the classic cross.
   · THE HOME COLUMN of seat k runs down the valley axis φ_k = θ_k − π/P
     from the mouth (radius colMo) to the HUB, H−1 coloured cells.
   · THE YARD is a coloured plate out in the same valley, past the arm
     bases where the star opens up, with st.tokens slot wells (the big
     tables play fewer tokens — the slots follow).

   NOTHING OVERLAPS, by arithmetic: everything is in units of `pitch`,
   and pitch is solved so the top arm's tip lands exactly on RMAX.
   Tightest squeezes, checked at P=8 (the worst case):
       col cells of adjacent valleys at the hub: chord 2·2.65·sin(π/8)
         = 2.0 pitch for a 0.84 pitch cell — clear;
       yard plate half-width capped at the valley's real half-chord
         minus the arm corridor — clear at every P.                     */
function geomStar(lay, T){
  const P = lay.P, L = lay.L, H = lay.H, R = lay.R;
  const RMAX = 116;                       /* the star's outer radius, px */
  const nCol = Math.max(1, H - 1);
  /* the radial ladder, in pitch units, hub outward */
  const hubU  = 2.0;                      /* hub circumradius            */
  const colG  = 0.95;                     /* home-column cell spacing    */
  const colIn = hubU + 0.95;              /* innermost column cell       */
  const colMo = colIn + colG * (nCol - 1);/* the column MOUTH            */
  const r0u   = colMo + 0.85;             /* arm base radius             */
  const rimU  = r0u + L + 1.0;            /* tip + breathing room        */
  const pitch = RMAX / rimU;
  const cell  = pitch * 0.42;             /* drawn HALF-size of a cell   */
  const LAT   = 0.55;                     /* rail lateral offset, units  */

  /* frames: AF[k] the arm axis, VF[k] the valley axis (θ_k − π/P) */
  const AF = [], VF = [];
  for (let k = 0; k < P; k++){
    const th = (k / P) * 2 * Math.PI;
    const ph = th - Math.PI / P;
    AF.push({ theta: th, ux: Math.sin(th), uy: -Math.cos(th),
              tx: Math.cos(th), ty: Math.sin(th) });
    VF.push({ theta: ph, ux: Math.sin(ph), uy: -Math.cos(ph),
              tx: Math.cos(ph), ty: Math.sin(ph) });
  }
  const at = (F, r, s, th) => ({
    x: C + (F.ux * r + F.tx * s) * pitch,
    y: C + (F.uy * r + F.ty * s) * pitch,
    th: th === undefined ? F.theta : th
  });

  /* ── THE RING — straight off the engine's ring index ── */
  const ring = new Array(R);
  for (let i = 0; i < R; i++){
    const rc = lay.ring[i], k = rc.sector;
    if (rc.role === 'out')         ring[i] = at(AF[k], r0u + rc.jj, -LAT);
    else if (rc.role === 'corner') ring[i] = at(AF[k], r0u + L, 0);
    else                           ring[i] = at(AF[k], r0u + (L - 1 - rc.jj), LAT);
  }

  /* ── THE HOME COLUMNS — down the valley axes, mouth → hub ── */
  const col = [], home = [];
  for (let k = 0; k < P; k++){
    const cells = [];
    for (let c = 0; c < nCol; c++) cells.push(at(VF[k], colMo - colG * c, 0));
    col.push(cells);
    home.push(at(VF[k], hubU * 0.5, 0));
  }

  /* ── THE YARDS — coloured plates out in the valleys. The plate's
     half-width is capped by the valley's REAL half-chord at that radius
     minus the arm corridor, so it clears the arms at every P. ── */
  const yardR = r0u + 2.6;
  const yard = [];
  const avail = yardR * Math.sin(Math.PI / P) - (LAT + 0.62);
  const pw = Math.max(0.95, Math.min(2.15, avail - 0.15));  /* half-width */
  const ph2 = Math.min(1.85, pw * 1.15);                    /* half-height */
  for (let k = 0; k < P; k++){
    const F = VF[k];
    const cpt = at(F, yardR, 0);
    const sl = [];
    const so = Math.min(0.82, pw - 0.55);          /* slot lateral offset */
    if (T >= 4){
      sl.push(at(F, yardR + 0.78, -so), at(F, yardR + 0.78, so),
              at(F, yardR - 0.78, -so), at(F, yardR - 0.78, so));
      for (let x = 4; x < T; x++) sl.push(at(F, yardR, 0));
    } else if (T === 3){
      sl.push(at(F, yardR + 0.75, 0), at(F, yardR - 0.62, -so), at(F, yardR - 0.62, so));
    } else if (T === 2){
      sl.push(at(F, yardR, -so), at(F, yardR, so));
    } else {
      sl.push(cpt);
    }
    yard.push({ cx: cpt.x, cy: cpt.y, size: ph2 * 2 * pitch, theta: F.theta,
                pw: pw * pitch, ph: ph2 * pitch, slots: sl });
  }

  /* the entry arrow points the way the lap runs — OUT along the arm */
  const arm = AF.map(f => ({ ux: f.ux, uy: f.uy, vx: f.tx, vy: f.ty, theta: f.theta }));

  return { P, L, H, R, T, grid: false, star: true,
           gap: pitch, step: 1, pitch, cell, tok: cell * 0.92,
           ring, col, home, yard, arm, AF, VF,
           hubU, colIn, colMo, colG, r0u, rimU, LAT, yardR,
           finishR: hubU * pitch };
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
  /* the winner screen WAITS for the winning hop and its gold burst —
     the theatre's settle() re-renders and lands here with both clear */
  if (E.over(st) && !sliding && !pendTh) finish();
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
    if (!M || M.dead) return;
    if (sliding){ M._auto = null; return; }   /* theatre running — the
      settle()'s render re-arms this, else the one-tap move never fires */
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

/* ── THE CLASSIC 15×15 CROSS BOARD (P=4) — same material family as the
   star: a dark frame, a cream plate, recessed track bands, bevelled
   tiles, glowing home lanes, gold safe stars, and a vignette. ── */
function boardBodyGrid(st, lay, g, hs){
  const cr = g.cell, gap = g.gap;
  const swc = Math.max(0.35, hs * 0.1);
  let s = '';
  /* the FRAME: a dark bezel with a highlight lip, then the cream plate */
  s += '<rect x="0.8" y="0.8" width="' + (VB - 1.6) + '" height="' + (VB - 1.6) +
    '" rx="11" ry="11" fill="#221741" stroke="#0E0A1C" stroke-width="1.2"/>';
  s += '<rect x="2" y="2" width="' + (VB - 4) + '" height="' + (VB - 4) +
    '" rx="10" ry="10" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="0.8"/>';
  s += '<rect x="4.5" y="4.5" width="' + (VB - 9) + '" height="' + (VB - 9) +
    '" rx="7" ry="7" fill="url(#lu-back)" stroke="rgba(0,0,0,.4)" stroke-width="0.7"/>';

  /* the CROSS bands, recessed a shade so the white tiles read raised */
  const band = () => 'class="lu-band" fill="#E4DCC6" stroke="rgba(0,0,0,.14)" stroke-width="0.4"';
  const px = (r, c) => ({ x: 3 + c * gap, y: 3 + r * gap });
  const hBand = px(6, 0), vBand = px(0, 6);
  s += '<rect x="' + (hBand.x + 2).toFixed(2) + '" y="' + hBand.y.toFixed(2) + '" width="' +
    (gap * 15 - 4).toFixed(2) + '" height="' + (gap * 3).toFixed(2) + '" ' + band() + '/>';
  s += '<rect x="' + vBand.x.toFixed(2) + '" y="' + (vBand.y + 2).toFixed(2) + '" width="' +
    (gap * 3).toFixed(2) + '" height="' + (gap * 15 - 4).toFixed(2) + '" ' + band() + '/>';

  /* the four 6×6 corner YARDS: bevelled colour block, cream inner court,
     recessed wells ringed in the seat colour */
  g.yard.forEach((y, k) => {
    const hx = hexOf(colourFor(st, k));
    const [r0, c0] = y.block;
    const bx = 3 + c0 * gap, by = 3 + r0 * gap, bw = gap * 6;
    s += '<rect x="' + bx.toFixed(2) + '" y="' + by.toFixed(2) + '" width="' + bw.toFixed(2) +
      '" height="' + bw.toFixed(2) + '" rx="7" ry="7" fill="url(#lu-sg' + k +
      ')" stroke="' + esc(shade(hx, -0.42)) + '" stroke-width="0.9"/>';
    s += '<rect x="' + (bx + 1.4).toFixed(2) + '" y="' + (by + 1.4).toFixed(2) + '" width="' +
      (bw - 2.8).toFixed(2) + '" height="' + (bw - 2.8).toFixed(2) +
      '" rx="6" ry="6" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="0.6"/>';
    const ins = gap * 0.9, iw = bw - ins * 2;
    s += '<rect x="' + (bx + ins).toFixed(2) + '" y="' + (by + ins).toFixed(2) + '" width="' +
      iw.toFixed(2) + '" height="' + iw.toFixed(2) + '" rx="6" ry="6" fill="url(#lu-plate)" ' +
      'stroke="rgba(0,0,0,.2)" stroke-width="0.6"/>';
    y.slots.forEach(sl => {
      s += '<circle cx="' + sl.x.toFixed(2) + '" cy="' + sl.y.toFixed(2) + '" r="' +
        (gap * 0.44).toFixed(2) + '" fill="rgba(0,0,0,.08)" stroke="' + esc(hx) +
        '" stroke-opacity="0.6" stroke-width="1.1"/>';
    });
  });

  /* the coloured HOME COLUMNS — a soft glow under bevelled lane cells */
  g.col.forEach((cells, k) => {
    const hx = hexOf(colourFor(st, k));
    const a = cells[0], b = cells[cells.length - 1];
    const line = 'M' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) + 'L' +
                 b.x.toFixed(2) + ' ' + b.y.toFixed(2);
    s += '<path d="' + line + '" stroke="' + esc(hx) + '" stroke-opacity="0.22" ' +
      'stroke-width="' + (gap * 1.45).toFixed(2) + '" stroke-linecap="round" fill="none"/>';
    cells.forEach(cc => {
      s += gridCell(cc.x, cc.y, hs, cr * 0.14) + ' fill="url(#lu-sg' + k +
        ')" stroke="rgba(255,255,255,.65)" stroke-width="0.5"/>';
    });
  });

  /* the centre 3×3 FINISH: bevelled triangles and the gold medallion */
  const c3 = gap * 1.5;
  const cx = C, cy = C;
  const corners = [
    { x: cx - c3, y: cy - c3 }, { x: cx + c3, y: cy - c3 },
    { x: cx + c3, y: cy + c3 }, { x: cx - c3, y: cy + c3 }
  ];
  s += '<rect x="' + (cx - c3).toFixed(2) + '" y="' + (cy - c3).toFixed(2) + '" width="' +
    (c3 * 2).toFixed(2) + '" height="' + (c3 * 2).toFixed(2) +
    '" fill="url(#lu-plate)" stroke="rgba(0,0,0,.2)" stroke-width="0.5"/>';
  /* map triangle edge → the seat whose HOME MOUTH sits on that edge:
     seat0 home lane is row7 cols1-5 → enters centre from the LEFT edge;
     seat1 col7 rows1-5 → from the TOP; seat2 row7 cols9-13 → RIGHT;
     seat3 col7 rows9-13 → BOTTOM. */
  const edgeOfSeat = { 0: [corners[3], corners[0]], 1: [corners[0], corners[1]],
                       2: [corners[1], corners[2]], 3: [corners[2], corners[3]] };
  for (let k = 0; k < 4; k++){
    const [a, b] = edgeOfSeat[k];
    s += '<path d="M' + cx.toFixed(2) + ' ' + cy.toFixed(2) + 'L' + a.x.toFixed(2) + ' ' +
      a.y.toFixed(2) + 'L' + b.x.toFixed(2) + ' ' + b.y.toFixed(2) + 'Z" fill="url(#lu-sg' +
      k + ')" stroke="rgba(255,255,255,.4)" stroke-width="0.5" stroke-linejoin="round"/>';
  }
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (gap * 0.62).toFixed(2) +
    '" fill="url(#lu-med)" stroke="rgba(0,0,0,.3)" stroke-width="0.5"/>' +
    '<path d="' + starPath(cx, cy, gap * 0.4) + '" fill="rgba(255,255,255,.85)"/>';

  /* the travel RING: bevelled tiles, gold stars, glowing coloured
     entries with their travel arrow, and chevrons showing the flow */
  lay.ring.forEach((rc, i) => {
    const p = g.ring[i];
    s += ringCellSVG(st, g, rc, p, hs, swc);
    if (rc.entryOf == null && !rc.safe && i % 3 === 1){
      s += chevron(p, g.ring[(i + 1) % g.R], hs, swc * 0.8);
    }
  });

  /* the light across the plate — tokens are drawn above this */
  s += '<rect x="4.5" y="4.5" width="' + (VB - 9) + '" height="' + (VB - 9) +
    '" rx="7" ry="7" fill="url(#lu-vig)" pointer-events="none"/>';
  return s;
}

/* ═══════════════════════════════════════════════════════════════════
   SHARED DEFS — one set of gradients does all the bevelling. A cell is
   a single path with a vertical light-to-dark gradient plus a thin dark
   stroke: it reads as a raised tile, costs one element, and never asks
   the compositor for a filter. Per-seat gradients (lu-sg<k>) are built
   from the live seat colours every paint.
   ═══════════════════════════════════════════════════════════════════ */
function defsFor(st){
  let d =
    '<radialGradient id="lu-discg" cx="50%" cy="38%" r="72%">' +
      '<stop offset="0" stop-color="#2E2153"/><stop offset="60%" stop-color="#241A3E"/>' +
      '<stop offset="100%" stop-color="#150F28"/></radialGradient>' + GTOK +
    '<linearGradient id="lu-wg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E7E1D0"/></linearGradient>' +
    '<linearGradient id="lu-goldc" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#FBEECB"/><stop offset="1" stop-color="#EAD299"/></linearGradient>' +
    '<linearGradient id="lu-plate" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#F8F4E9"/><stop offset="1" stop-color="#E5DDC7"/></linearGradient>' +
    '<linearGradient id="lu-back" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#EFE8D6"/><stop offset="1" stop-color="#D8CEB2"/></linearGradient>' +
    '<radialGradient id="lu-med" cx="38%" cy="30%" r="80%">' +
      '<stop offset="0" stop-color="#FFEDB0"/><stop offset="1" stop-color="#D9971C"/></radialGradient>' +
    '<radialGradient id="lu-vig" cx="50%" cy="46%" r="60%">' +
      '<stop offset="0" stop-color="#000" stop-opacity="0"/>' +
      '<stop offset="0.8" stop-color="#000" stop-opacity="0"/>' +
      '<stop offset="1" stop-color="#000" stop-opacity="0.16"/></radialGradient>';
  const n = (st && st.n) || 4;
  for (let k = 0; k < n; k++){
    const hx = hexOf(colourFor(st, k));
    d += '<linearGradient id="lu-sg' + k + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + esc(shade(hx, 0.34)) + '"/>' +
      '<stop offset="0.52" stop-color="' + esc(hx) + '"/>' +
      '<stop offset="1" stop-color="' + esc(shade(hx, -0.26)) + '"/></linearGradient>';
  }
  return '<defs>' + d + '</defs>';
}

/* a faint chevron on a track cell pointing the way the lap runs */
function chevron(px, nx, hs, swc){
  const dx = nx.x - px.x, dy = nx.y - px.y, m = Math.hypot(dx, dy) || 1;
  const ux = dx / m, uy = dy / m, vx = -uy, vy = ux;
  const a = hs * 0.34;
  const t  = { x: px.x + ux * a, y: px.y + uy * a };
  const b1 = { x: px.x - ux * a * 0.5 + vx * a, y: px.y - uy * a * 0.5 + vy * a };
  const b2 = { x: px.x - ux * a * 0.5 - vx * a, y: px.y - uy * a * 0.5 - vy * a };
  return '<path d="M' + b1.x.toFixed(1) + ' ' + b1.y.toFixed(1) + 'L' + t.x.toFixed(1) +
    ' ' + t.y.toFixed(1) + 'L' + b2.x.toFixed(1) + ' ' + b2.y.toFixed(1) +
    '" fill="none" stroke="#8B8298" stroke-opacity="0.55" stroke-width="' +
    (swc * 1.5).toFixed(2) + '" stroke-linecap="round" stroke-linejoin="round"/>';
}
/* the white travel arrow on an entry cell */
function entryArrow(p, a, hs){
  const tip = { x: p.x + a.ux * hs * 0.60, y: p.y + a.uy * hs * 0.60 };
  const b1  = { x: p.x - a.ux * hs * 0.22 + a.vx * hs * 0.42,
                y: p.y - a.uy * hs * 0.22 + a.vy * hs * 0.42 };
  const b2  = { x: p.x - a.ux * hs * 0.22 - a.vx * hs * 0.42,
                y: p.y - a.uy * hs * 0.22 - a.vy * hs * 0.42 };
  return '<path d="M' + tip.x.toFixed(2) + ' ' + tip.y.toFixed(2) + 'L' +
    b1.x.toFixed(2) + ' ' + b1.y.toFixed(2) + 'L' + b2.x.toFixed(2) + ' ' +
    b2.y.toFixed(2) + 'Z" fill="rgba(255,255,255,.92)" stroke="rgba(0,0,0,.25)" ' +
    'stroke-width="0.3"/>';
}
/* one ring cell, bevelled; entry cells coloured + glowing, safes starred */
function ringCellSVG(st, g, rc, p, hs, swc){
  let s = '';
  if (rc.entryOf != null){
    const hx = hexOf(colourFor(st, rc.entryOf));
    s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' +
      (hs * 1.55).toFixed(1) + '" fill="' + esc(hx) + '" fill-opacity="0.32"/>';
    s += '<path class="lu-cellc" d="' + sqCell(p.x, p.y, hs, p.th) +
      '" fill="url(#lu-sg' + rc.entryOf + ')" stroke="' + esc(shade(hx, -0.45)) +
      '" stroke-width="' + swc.toFixed(2) + '"/>';
    s += entryArrow(p, g.arm[rc.entryOf], hs);
  } else if (rc.safe){
    s += '<path class="lu-cellw safe" d="' + sqCell(p.x, p.y, hs, p.th) +
      '" fill="url(#lu-goldc)" stroke="rgba(122,92,28,.55)" stroke-width="' +
      (swc * 1.3).toFixed(2) + '"/>';
    s += '<path d="' + starPath(p.x, p.y, hs * 0.62) +
      '" fill="#E7B94C" stroke="rgba(96,66,10,.55)" stroke-width="' +
      (swc * 0.7).toFixed(2) + '"/>';
  } else {
    s += '<path class="lu-cellw" d="' + sqCell(p.x, p.y, hs, p.th) +
      '" fill="url(#lu-wg)" stroke="rgba(0,0,0,.16)" stroke-width="' +
      (swc * 0.9).toFixed(2) + '"/>';
  }
  return s;
}

/* ── THE STAR BODY (every P except 4) — painted like a real board:
   a dark drop shadow, the star plate, the raised arm corridors, the
   valley guides, the glowing home lanes, the coloured yards with their
   recessed wells, the hub with its gold medallion, then the cells. ── */
function boardBodyStar(st, lay, g){
  const P = g.P, p = g.pitch, hs = g.cell * 0.94, L = g.L;
  const swc = Math.max(0.3, hs * 0.14);
  const deg = r => (r * 180 / Math.PI).toFixed(2);
  let s = '';

  s += '<circle class="lu-disc" cx="' + C + '" cy="' + C + '" r="' + (RAD + 6) + '"/>';

  /* ── THE ROUND PLATE — a framed wooden table board: drop shadow, a
     dark bezel, a gold pinstripe, then the cream face ── */
  const rPlate = (g.rimU - 0.1) * p;
  s += '<circle cx="' + C + '" cy="' + (C + 2) + '" r="' + rPlate.toFixed(2) +
    '" fill="rgba(0,0,0,.5)"/>';
  s += '<circle cx="' + C + '" cy="' + C + '" r="' + rPlate.toFixed(2) +
    '" fill="#221741" stroke="#0E0A1C" stroke-width="1.2"/>';
  s += '<circle cx="' + C + '" cy="' + C + '" r="' + (rPlate - 1.1).toFixed(2) +
    '" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="0.7"/>';
  s += '<circle cx="' + C + '" cy="' + C + '" r="' + (rPlate - 2.6).toFixed(2) +
    '" fill="url(#lu-back)" stroke="var(--lu-gold,#FFC542)" stroke-opacity="0.55" ' +
    'stroke-width="0.8"/>';

  /* ── THE ARM CORRIDORS — raised cream plates with a bevel stroke ── */
  const armW = (g.LAT + 0.62) * p;
  const armY0 = C - (g.r0u + L + 0.75) * p, armH = (L + 1.5) * p;
  for (let k = 0; k < P; k++){
    s += '<g transform="rotate(' + deg(g.AF[k].theta) + ' ' + C + ' ' + C + ')">' +
      '<rect x="' + (C - armW).toFixed(2) + '" y="' + armY0.toFixed(2) +
        '" width="' + (armW * 2).toFixed(2) + '" height="' + armH.toFixed(2) +
        '" rx="2.6" fill="url(#lu-plate)" stroke="rgba(0,0,0,.35)" stroke-width="0.8"/>' +
      '<rect x="' + (C - armW + 1).toFixed(2) + '" y="' + (armY0 + 1).toFixed(2) +
        '" width="' + ((armW - 1) * 2).toFixed(2) + '" height="' + (armH - 2).toFixed(2) +
        '" rx="2" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="0.5"/>' +
      '</g>';
  }

  /* ── THE VALLEY GUIDES — a dotted curve from each seat's turnoff,
     round its column mouth, to its entry: the lap made legible ── */
  for (let k = 0; k < P; k++){
    const en = g.ring[k * lay.A];
    const tf = g.ring[(k * lay.A - 1 + g.R) % g.R];
    const mid = { x: C + g.VF[k].ux * (g.colMo + 1.05) * p,
                  y: C + g.VF[k].uy * (g.colMo + 1.05) * p };
    s += '<path d="M' + tf.x.toFixed(1) + ' ' + tf.y.toFixed(1) + 'Q' +
      mid.x.toFixed(1) + ' ' + mid.y.toFixed(1) + ' ' + en.x.toFixed(1) + ' ' +
      en.y.toFixed(1) + '" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="' +
      swc.toFixed(2) + '" stroke-dasharray="0.2 ' + (p * 0.45).toFixed(1) +
      '" stroke-linecap="round"/>';
  }

  /* ── THE HOME COLUMNS — a solid tinted LANE from mouth to hub (so the
     five cells read as one road), a soft glow, then bevelled cells ── */
  g.col.forEach((cells, k) => {
    const hx = hexOf(colourFor(st, k));
    const a = cells[0], b = cells[cells.length - 1];
    const line = 'M' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) + 'L' +
                 b.x.toFixed(2) + ' ' + b.y.toFixed(2);
    s += '<path d="' + line + '" stroke="' + esc(hx) + '" stroke-opacity="0.15" ' +
      'stroke-width="' + (hs * 4.1).toFixed(2) + '" stroke-linecap="round" fill="none"/>';
    s += '<path d="' + line + '" stroke="url(#lu-plate)" ' +
      'stroke-width="' + (hs * 2.9).toFixed(2) + '" stroke-linecap="round" fill="none"/>';
    s += '<path d="' + line + '" stroke="' + esc(hx) + '" stroke-opacity="0.4" ' +
      'stroke-width="' + (hs * 2.9).toFixed(2) + '" stroke-linecap="round" fill="none"/>';
    cells.forEach(cc => {
      s += '<path class="lu-home" d="' + sqCell(cc.x, cc.y, hs, cc.th) +
        '" fill="url(#lu-sg' + k + ')" stroke="rgba(255,255,255,.7)" stroke-width="' +
        (swc * 1.1).toFixed(2) + '"/>';
    });
  });

  /* ── THE YARDS — a coloured plate in the valley, wells recessed ── */
  g.yard.forEach((y, k) => {
    const hx = hexOf(colourFor(st, k));
    s += '<g transform="rotate(' + deg(y.theta) + ' ' + C + ' ' + C + ')">' +
      '<rect x="' + (C - y.pw).toFixed(2) + '" y="' + (C - g.yardR * p - y.ph).toFixed(2) +
        '" width="' + (y.pw * 2).toFixed(2) + '" height="' + (y.ph * 2).toFixed(2) +
        '" rx="3" fill="url(#lu-sg' + k + ')" stroke="' + esc(shade(hx, -0.42)) +
        '" stroke-width="0.9"/>' +
      '<rect x="' + (C - y.pw + 1).toFixed(2) + '" y="' + (C - g.yardR * p - y.ph + 1).toFixed(2) +
        '" width="' + ((y.pw - 1) * 2).toFixed(2) + '" height="' + ((y.ph - 1) * 2).toFixed(2) +
        '" rx="2.4" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="0.5"/>' +
      '</g>';
    y.slots.forEach(sl => {
      s += '<circle class="lu-well" cx="' + sl.x.toFixed(2) + '" cy="' + sl.y.toFixed(2) +
        '" r="' + (g.tok * 1.22).toFixed(2) + '" fill="rgba(0,0,0,.25)" ' +
        'stroke="rgba(255,255,255,.4)" stroke-width="0.6"/>';
    });
  });

  /* ── THE HUB — the P-sided finish with a gold medallion ── */
  const hubP = g.hubU * p;
  s += '<circle cx="' + C + '" cy="' + (C + 1.4) + '" r="' + (hubP * 1.12).toFixed(2) +
    '" fill="rgba(0,0,0,.35)"/>';
  s += '<circle cx="' + C + '" cy="' + C + '" r="' + (hubP * 1.12).toFixed(2) +
    '" fill="url(#lu-plate)" stroke="rgba(0,0,0,.35)" stroke-width="0.8"/>';
  const hv = g.AF.map(a => ({ x: C + a.ux * hubP, y: C + a.uy * hubP }));
  for (let k = 0; k < P; k++){
    const a = hv[(k - 1 + P) % P], b = hv[k];
    s += '<path class="lu-goal" d="M' + C + ' ' + C + 'L' + a.x.toFixed(2) + ' ' +
      a.y.toFixed(2) + 'L' + b.x.toFixed(2) + ' ' + b.y.toFixed(2) +
      'Z" fill="url(#lu-sg' + k + ')" stroke="rgba(255,255,255,.5)" stroke-width="0.4"/>';
  }
  s += '<circle cx="' + C + '" cy="' + C + '" r="' + (hubP * 0.36).toFixed(2) +
    '" fill="url(#lu-med)" stroke="rgba(0,0,0,.3)" stroke-width="0.5"/>' +
    '<path d="' + starPath(C, C, hubP * 0.22) + '" fill="rgba(255,255,255,.85)"/>';

  /* ── THE RING CELLS — bevelled tiles, arrows, stars, chevrons; the
     arm TIP wears its seat's colour as a ring (the halfway tower) ── */
  lay.ring.forEach((rc, i) => {
    const px = g.ring[i];
    s += ringCellSVG(st, g, rc, px, hs, swc);
    if (rc.role === 'corner'){
      s += '<circle cx="' + px.x.toFixed(1) + '" cy="' + px.y.toFixed(1) + '" r="' +
        (hs * 0.48).toFixed(2) + '" fill="none" stroke="' +
        esc(hexOf(colourFor(st, rc.sector))) + '" stroke-opacity="0.8" stroke-width="' +
        (swc * 1.7).toFixed(2) + '"/>';
    } else if (rc.entryOf == null && !rc.safe && i % 3 === 1){
      s += chevron(px, g.ring[(i + 1) % g.R], hs, swc);
    }
  });

  /* the vignette lays the light across the whole board, tokens above */
  s += '<circle cx="' + C + '" cy="' + C + '" r="' + (RAD + 6) +
    '" fill="url(#lu-vig)" pointer-events="none"/>';
  return s;
}

function paintBoard(){
  const st = M.st, lay = layoutFor(st), g = geom(lay, st.tokens);
  const cr = g.cell, tr = g.tok;
  const pend = E.pending(st);
  const myTurn = !E.over(st) && isLocal(E.turn(st));
  const canMove = myTurn && pend.phase === 'move';
  const legalToks = {};   /* seat:tok -> destination px, for hints */
  if (canMove) pend.moves.forEach(m => { legalToks[E.turn(st) + ':' + m.k] = m; });
  const hs = cr * 0.94;               /* half-size of a ring/home cell   */

  /* tokens the THEATRE is about to animate paint hidden, so the state is
     truth on screen and the flight is pure decoration over it */
  const hide = {};
  if (pendTh){
    hide[pendTh.seat + ':' + pendTh.k] = 1;
    (pendTh.caps || []).forEach(c => { hide[c.seat + ':' + c.tok] = 1; });
  }

  /* the board disc */
  let s = '<svg class="lu-svg' + (xEq('board') ? ' lu-xb' : '') +
    '" id="lu-svg" viewBox="0 0 ' + VB + ' ' + VB + '" ' +
    'xmlns="http://www.w3.org/2000/svg" aria-label="' +
    esc(T('The Ludo board', 'It-tabellun tal-Ludu')) + '">' +
    defsFor(st);
  s += g.grid ? boardBodyGrid(st, lay, g, hs) : boardBodyStar(st, lay, g);

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
  const HIT_U = (g.grid ? g.gap * 1.15 : g.gap * 1.9);
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
    const gilt = giltSeat(tk.seat);
    const hid = hide[tk.seat + ':' + tk.tok];
    const cls = 'lu-tok' + (gilt ? ' gilt' : '') + (pick ? ' pick' : '') + dim;
    const sty = (gilt ? '--lus:' + esc(hx) + ';' : '') + (hid ? 'visibility:hidden' : '');
    s += '<g class="' + cls + '"' +
      (sty ? ' style="' + sty + '"' : '') +
      (pick ? ' data-tok="' + tk.tok + '" role="button" tabindex="0" aria-label="' +
        esc(T('Move this token', 'Ċaqlaq din il-biċċa')) + '"' : ' aria-hidden="true"') +
      ' data-seat="' + tk.seat + '" data-k="' + tk.tok +
      '" data-cx="' + cx.toFixed(1) + '" data-cy="' + cy.toFixed(1) + '">';
    /* a soft glow halo behind a movable piece — reads before you look */
    if (pick){
      s += '<circle class="glow" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) +
        '" r="' + (tr * 1.42).toFixed(1) + '" fill="' + esc(gilt ? '#FFD979' : hx) + '"/>';
    }
    /* a grounding shadow, then the piece */
    s += '<ellipse cx="' + cx.toFixed(1) + '" cy="' + (cy + tr * 0.55).toFixed(1) +
        '" rx="' + (tr * 0.9).toFixed(1) + '" ry="' + (tr * 0.38).toFixed(1) +
        '" fill="rgba(0,0,0,.3)"/>' +
      '<circle class="body" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' +
        tr.toFixed(1) + '" fill="' + (gilt ? 'url(#lu-gtok)' : esc(hx)) + '"/>' +
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
    /* a legal move previews its landing: a ghost of this token stood on
       the destination cell plus a pulsing ring — red when it captures */
    if (legal){
      const dest = destPx(st, lay, tk.seat, legal);
      if (dest){
        const cap = legal.caps && legal.caps.length;
        hints += '<g class="lu-ghost" aria-hidden="true">' +
          '<circle cx="' + dest.x.toFixed(1) + '" cy="' + dest.y.toFixed(1) + '" r="' +
            (tr * 0.92).toFixed(1) + '" fill="' + esc(hx) + '" fill-opacity="0.35" ' +
            'stroke="#fff" stroke-opacity="0.6" stroke-width="0.5" ' +
            'stroke-dasharray="1.6 1.2"/></g>' +
          '<circle class="lu-hint' + (cap ? ' cap' : '') + '" cx="' + dest.x.toFixed(1) +
            '" cy="' + dest.y.toFixed(1) + '" r="' + (cr + 1.5).toFixed(1) + '"/>';
      }
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
   apply through the ONE gate, then paint. The theatre subscriber (below)
   sees the applied move and animates it — same path as a wire move. */
let sliding = false;                    /* a theatre flight is in the air */
function tapMove(seat, k, gEl){
  if (sliding) return;                          /* one move at a time */
  if (!isLocal(seat)) return;
  const res = doMove(seat, { t:'move', k }, 'local');
  if (!res.ok){ if (gEl) gEl.classList.remove('press'); cue('ui.error', { gain:0.5 }); buzz('no'); return; }
  render();
}
function stillMode(){
  const scr = document.getElementById('scr-party');
  return !!(scr && scr.classList.contains('lu-still'));
}

/* ═══════════════════════════════════════════════════════════════════
   THE THEATRE — every applied 'move' (thumb, machine, wire: one
   subscriber, so another phone's turn gets the same show) becomes a
   cell-by-cell HOP with a pop per landing; a capture is a full scene —
   the capturer lands ON the victim, taunts with a bounce-and-shake
   while the victim squashes flat, then the victim is flung home along
   an arc with a trail; a token reaching HOME bursts gold.

   Render-only by construction: the engine has ALREADY advanced when the
   subscriber fires. The caller's render() paints the true board with
   the travelling tokens hidden (see paintBoard/pendTh), and the theatre
   flies clones above it. Any interruption — a fast online move, a
   re-render, leaving — simply removes the clones and re-renders:
   snap-forward, never desync. All motion is transform/opacity only.
   ═══════════════════════════════════════════════════════════════════ */
let pendTh = null;                      /* set on apply, eaten by runTheatre */
let TH = null, thSeq = 0;               /* the one live theatre             */
function theatreWilling(){
  return !!(UI && UI.svg) && !reduced() && !stillMode();
}
function killTheatre(){ if (TH){ try { TH.cancel(); } catch(e){} } pendTh = null; }

moveSubs.push(ev => {
  if (!M || M.dead || !ev || !ev.move) return;
  const st = M.st;
  /* a wire roll still bounces the die on this phone */
  if (ev.move.t === 'roll' && ev.src === 'net' && !reduced()){
    M.anim = { kind:'roll' };
    const m = M;
    setTimeout(() => { if (M === m && M){ M.anim = null; if (UI) paintDock(); } }, 560);
    return;
  }
  if (ev.move.t !== 'move') return;
  const last = st.last;
  if (!last || last.t !== 'move') return;
  if (!theatreWilling()) return;
  pendTh = { seat: last.seat, k: last.k, from: last.from, to: last.to, d: last.d,
             caps: (last.caps || []).map(c => ({ seat: c.seat, tok: c.tok })),
             why: st.why, idx: ev.index };
  const m = M;
  /* one tick later — AFTER the caller's synchronous render() painted the
     final board (with the travellers hidden). setTimeout, not rAF: a
     hidden tab must still settle. */
  setTimeout(() => {
    if (M !== m || !M || M.dead){ pendTh = null; return; }
    if (pendTh && pendTh.idx === ev.index) runTheatre();
  }, 17);
});

/* the two circles every flying piece is made of */
function tokenBits(r, hx, gilt){
  return '<circle cx="0" cy="0" r="' + r.toFixed(1) + '" fill="' +
      (gilt ? 'url(#lu-gtok)' : esc(hx)) + '" stroke="' +
      (gilt ? esc(hx) : 'rgba(0,0,0,.55)') + '" stroke-width="0.6"/>' +
    '<circle cx="' + (-r * 0.28).toFixed(1) + '" cy="' + (-r * 0.32).toFixed(1) +
      '" r="' + (r * 0.28).toFixed(1) + '" fill="#fff" fill-opacity="0.55"/>';
}

function runTheatre(){
  const t = pendTh; pendTh = null;
  if (!t || !M || M.dead || !UI || !UI.svg || !UI.svg.isConnected){
    if (M && !M.dead && UI) render();          /* unhide whatever was hidden */
    return;
  }
  if (TH) TH.cancel();
  const st = M.st, lay = layoutFor(st), g = geom(lay, st.tokens);
  const svg = UI.svg;
  const id = ++thSeq;
  const nodes = [], timers = [];
  const live = () => TH && TH.id === id && M && !M.dead;
  const cancel = () => {
    timers.forEach(clearTimeout);
    nodes.forEach(n => { try { n.remove(); } catch(e){} });
    if (TH && TH.id === id) TH = null;
    sliding = false;
  };
  TH = { id, cancel };
  sliding = true;
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const settle = () => { cancel(); if (M && !M.dead && UI) render(); };

  const seat = t.seat, k = t.k;
  const tr = g.tok, hx = hexOf(colourFor(st, seat)), gilt = giltSeat(seat);
  const NS = 'http://www.w3.org/2000/svg';
  const mine = isLocal(seat);

  /* the cells this token hops: yard exit is ONE big leap; a ring/column
     move visits every cell of its own path, exactly as drawn */
  const cells = [];
  if (t.from < 0){
    const y = g.yard[seat];
    const sl = y.slots[k % y.slots.length];
    cells.push({ x: sl.x, y: sl.y }, pathPx(st, lay, seat, t.to));
  } else {
    for (let p = t.from; p <= t.to; p++) cells.push(pathPx(st, lay, seat, p));
  }
  if (cells.length < 2){ settle(); return; }
  const dest = cells[cells.length - 1];

  /* victims keep standing on the capture square until they are flung */
  const vics = t.caps.map((c, i) => {
    const outer = document.createElementNS(NS, 'g');
    outer.setAttribute('class', 'lu-fly');
    const inner = document.createElementNS(NS, 'g');
    inner.innerHTML = tokenBits(tr, hexOf(colourFor(st, c.seat)), giltSeat(c.seat));
    outer.appendChild(inner);
    const lx = dest.x + (i ? (i % 2 ? 1 : -1) * tr * 0.5 : 0);
    const ly = dest.y + (i > 1 ? tr * 0.5 : 0);
    outer.style.transform = 'translate(' + lx.toFixed(1) + 'px,' + ly.toFixed(1) + 'px)';
    svg.appendChild(outer); nodes.push(outer);
    return { el: outer, inner, seat: c.seat, tok: c.tok, x: lx, y: ly };
  });

  /* the traveller: outer group slides, inner group hops and squashes */
  const fly = document.createElementNS(NS, 'g');
  fly.setAttribute('class', 'lu-fly');
  const hop = document.createElementNS(NS, 'g');
  hop.setAttribute('class', 'lu-hopI');
  hop.innerHTML = tokenBits(tr * 1.06, hx, gilt);
  fly.appendChild(hop);
  const p0 = cells[0];
  fly.style.transform = 'translate(' + p0.x.toFixed(1) + 'px,' + p0.y.toFixed(1) + 'px)';
  svg.appendChild(fly); nodes.push(fly);

  const per = Math.max(95, Math.min(170, 760 / (cells.length - 1)));
  hop.style.setProperty('--luhms', per + 'ms');
  hop.style.setProperty('--luarc', (-Math.max(4, g.gap * 0.55)).toFixed(1) + 'px');
  if (t.from < 0) cue('piece.lift', { gain: 0.6 }, true);

  let i = 1;
  const step = () => {
    if (!live()) return;
    /* a re-render wiped the clone (someone acted mid-flight): settle NOW
       — cancel alone would leave maybeAutoMove un-armed and stall a
       one-move turn (seen in the AI smoke test, log frozen at 'move'/1) */
    if (!fly.isConnected){ settle(); return; }
    const c = cells[i];
    fly.style.transition = 'transform ' + per + 'ms linear';
    fly.style.transform = 'translate(' + c.x.toFixed(1) + 'px,' + c.y.toFixed(1) + 'px)';
    if (i < cells.length - 1){
      sfxHop(i, mine ? 0.44 : 0.3);                  /* an actual hop per cell */
      i++;
      later(per, step);
    } else {
      later(per + 20, land);
    }
  };

  const land = () => {
    if (!live()) return;
    if (!fly.isConnected){ settle(); return; }
    hop.setAttribute('class', 'lu-landI');
    if (vics.length){ drama(); return; }
    if (t.why === 'home' || t.why === 'homeagain' ||
        t.why === 'finished' || t.why === 'teamfinished'){
      if (mine) buzz('thud');          /* HIS token, home */
      cue('ui.reward', { gain: 0.9 }, true);
      burst(svg, dest.x, dest.y, (t.why === 'finished' || t.why === 'teamfinished') ? 14 : 9,
            g, nodes);
      later(460, settle);
      return;
    }
    if (mine) buzz('thud');            /* HIS token, landing */
    cue('piece.place', { gain: mine ? 0.75 : 0.6 }, true);
    if (t.why === 'column') cueIn(70, () => cue('ui.note', { gain: 0.5 }));
    later(210, settle);
  };

  /* CAPTURE — land on the victim, laugh, squash, fling them home */
  const drama = () => {
    if (mine) buzz('thud');            /* HIS capture, in his hand */
    cue('piece.capture', { gain: mine ? 0.95 : 0.8 }, true);
    cueIn(140, () => cue('duel.hit', { gain: 0.8 }));
    hop.setAttribute('class', 'lu-tauntI');
    vics.forEach(v => v.inner.setAttribute('class', 'lu-flatI'));
    cueIn(450, () => cue('ui.untoggle', { gain: 0.6 }));
    later(760, () => {
      if (!live()) return;
      cue('card.throw', { gain: 0.7 }, true);
      let maxMs = 0;
      vics.forEach((v, vi) => {
        const y2 = g.yard[v.seat];
        const sl = y2.slots[v.tok % y2.slots.length];
        v.inner.removeAttribute('class');        /* un-squash in the air */
        maxMs = Math.max(maxMs, flingArc(svg, v.el, v.x, v.y, sl.x, sl.y, g, vi, nodes,
                                         hexOf(colourFor(st, v.seat))));
      });
      cueIn(Math.min(900, maxMs), () => cue('piece.place', { gain: 0.45 }));
      later(maxMs + 80, settle);
    });
  };

  /* let the initial transform commit, then fly */
  later(30, step);
}

/* the victim's arc home: a WAAPI keyframe flight with spin and a short
   fading trail. Falls back to a straight transition without WAAPI. */
function flingArc(svg, el, x0, y0, x1, y1, g, vi, nodes, hx){
  const dur = 540 + vi * 70, delay = vi * 60;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - Math.max(8, g.gap * 1.8);
  const kf = [
    { transform: 'translate(' + x0.toFixed(1) + 'px,' + y0.toFixed(1) + 'px) rotate(0deg)' },
    { transform: 'translate(' + mx.toFixed(1) + 'px,' + my.toFixed(1) + 'px) rotate(200deg)' },
    { transform: 'translate(' + x1.toFixed(1) + 'px,' + y1.toFixed(1) + 'px) rotate(360deg)' }
  ];
  if (el.animate){
    el.animate(kf, { duration: dur, delay, easing: 'cubic-bezier(.35,.5,.45,1)', fill: 'forwards' });
    /* the trail: two fading ghosts chasing the same arc */
    const NS = 'http://www.w3.org/2000/svg';
    for (let tI = 1; tI <= 2; tI++){
      const gh = document.createElementNS(NS, 'circle');
      gh.setAttribute('r', (g.tok * (1 - tI * 0.22)).toFixed(1));
      gh.setAttribute('fill', hx);
      gh.setAttribute('opacity', String(0.3 - tI * 0.1));
      gh.setAttribute('class', 'lu-fly');
      gh.style.transform = 'translate(' + x0.toFixed(1) + 'px,' + y0.toFixed(1) + 'px)';
      svg.appendChild(gh); nodes.push(gh);
      gh.animate(kf, { duration: dur, delay: delay + tI * 55,
                       easing: 'cubic-bezier(.35,.5,.45,1)', fill: 'forwards' });
    }
  } else {
    el.style.transition = 'transform ' + dur + 'ms cubic-bezier(.35,.5,.45,1) ' + delay + 'ms';
    el.style.transform = 'translate(' + x1.toFixed(1) + 'px,' + y1.toFixed(1) + 'px)';
  }
  return dur + delay;
}

/* the HOME burst: gold sparks thrown outward, gone in half a second */
function burst(svg, x, y, n, g, nodes){
  if (!document.body || !Element.prototype.animate) return;
  const NS = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < n; i++){
    const c = document.createElementNS(NS, 'circle');
    const r = Math.max(0.9, g.cell * 0.3);
    c.setAttribute('r', (r * (0.7 + (i % 3) * 0.25)).toFixed(1));
    c.setAttribute('fill', i % 3 === 2 ? '#FFFFFF' : '#FFD979');
    c.setAttribute('class', 'lu-fly');
    c.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    svg.appendChild(c); nodes.push(c);
    const a = (i / n) * 2 * Math.PI + (i % 2) * 0.35;
    const d = g.gap * (1.5 + (i % 4) * 0.35);
    c.animate([
      { transform: 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(1)', opacity: 1 },
      { transform: 'translate(' + (x + Math.cos(a) * d).toFixed(1) + 'px,' +
                   (y + Math.sin(a) * d).toFixed(1) + 'px) scale(.4)', opacity: 0 }
    ], { duration: 480 + (i % 3) * 60, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
  }
}

function paintDock(){
  const st = M.st;
  const pend = E.pending(st);
  const turn = E.turn(st);
  const mine = !E.over(st) && isLocal(turn);
  const dieN = st.die || (st.last && st.last.t === 'roll' ? st.last.d : 0);
  const rolling = !!(M.anim && M.anim.kind === 'roll');
  /* a live six glows gold and swells — the roll everyone waits for */
  const six = dieN === 6 && !E.over(st);
  let dock = '<div class="lu-die' + (rolling ? ' rolling' : '') + (six ? ' six' : '') +
    (xEq('dice') ? ' lu-die-x' : '') + '" id="lu-die" aria-hidden="true">' +
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
  /* let a running theatre finish its scene before the machine moves on */
  if (sliding || pendTh){
    M.timer = setTimeout(() => { M.timer = 0; maybeThink(); }, 280);
    return;
  }
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
  if (localWon) buzz('win');        /* the one long buzz, once, and only his */
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
  /* ── THE PAYMENT (tombla-ui's funnel) — the podium path bypasses the
     wrapped P.ui.result that progress.js pays through, so pay here:
     awardPlay exactly once under a stable match id (progress.js dedups
     the id across re-renders and reloads), and the pot through mp.js's
     own idempotent stakeSettle door. `ranked` only when a real pot is
     on the table. The card fallback above still pays through the wrap,
     so nothing on that path changes and nothing pays twice. */
  const MPX = window.KARTI_MP;
  const staked = !!(net && MPX && MPX.MP && MPX.MP.stakeLive);
  const tone = localWon ? 'win' : 'lose';
  /* the match id, lifted out of the payment so the RECORD BOOK below can
     be told under exactly the same id */
  const mid = (net && MPX && MPX.MP && MPX.MP.code != null)
    ? 'ludu:' + MPX.MP.code + ':' + ((MPX.MP.seed || 0) >>> 0)
    : (M.payId || (M.payId = 'ludu:' + Date.now().toString(36) + '-' +
                              ((Math.random() * 1e6) | 0).toString(36)));
  let pay = null, potRes = null;
  if (window.KARTI_XP && KARTI_XP.awardPlay){
    try {
      const r = KARTI_XP.awardPlay({ game:'ludu', won: tone === 'win',
                                     draw: false, id: mid, ranked: staked });
      if (r && r.counted) pay = r;
    } catch(e){}
  }
  /* ── THE RECORD BOOK (js/stats.js) — the profile row and the
     leaderboard. Ludu reported to nobody, so a win here moved no W/L
     anywhere. AFTER awardPlay and under the SAME id on purpose:
     record() forwards a counted result into progress.js, whose fresh()
     has already stamped 'ludu:<mid>', so the forward lands on 'already'
     and the money still moves exactly once. */
  try {
    if (window.KARTI_STATS && KARTI_STATS.record)
      KARTI_STATS.record('ludu', { result: tone === 'win' ? 'win' : 'loss', id: mid });
  } catch(e){}
  if (staked && MPX.stakeSettle){
    try { potRes = MPX.stakeSettle(tone); } catch(e){}
  }
  show({
    xp: pay ? { level: pay.level, gained: pay.xp, leveledUp: !!pay.levelled,
                before: 0, after: pay.levelled ? 1 : 0.7 } : null,
    reward: (pay || potRes) ? {
      xp: pay ? pay.xp : 0,
      chips: pay ? (pay.chips | 0) + (pay.chipsLevel | 0) : 0,
      wonBonus: pay ? pay.wonBonus : 0,
      staked: potRes ? potRes.ante : 0,
      pot: (potRes && potRes.kind === 'win') ? potRes.pot : 0
    } : undefined,
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
  killTheatre();
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
  /* the big tables play fewer tokens (the engine decides) — the rules
     card must say the number the board actually has */
  const tk = (M && M.st && M.st.tokens) || 4;
  const EN = { 2:'two', 3:'three', 4:'four' }[tk] || String(tk);
  const MT = { 2:'żewġ', 3:'tliet', 4:'erba’' }[tk] || String(tk);
  return [
    T('Every player has ' + EN + ' tokens parked in a yard. A token only leaves the yard on a ' +
      '<b>six</b>.',
      'Kull plejer għandu ' + MT + ' biċċiet fil-bitħa. Biċċa toħroġ biss b’<b>sitta</b>.'),
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
    T('First player to get <b>all their tokens home</b> wins.',
      'L-ewwel plejer li jġib <b>il-biċċiet kollha tiegħu d-dar</b> jirbaħ.')
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

/* the board badge for the setup sheet — the REAL board in miniature,
   drawn by the very same body functions the game uses, so the preview
   can never lie about the board the player is about to get. Colours use
   the default seat order (no live state on the setup sheet). */
function heroSVG(n){
  const lay = E.layout(n, E.HOME_LEN, 'stars');
  const T = tokensForUI(n);
  const g = geom(lay, T);
  const fake = {
    n, tokens: T,
    seats: Array.from({ length: n }, (_, k) => ({
      colour: (COLOURS[k % COLOURS.length] || {}).id
    }))
  };
  return '<svg viewBox="0 0 ' + VB + ' ' + VB + '" xmlns="http://www.w3.org/2000/svg" ' +
    'aria-hidden="true">' + defsFor(fake) +
    (g.grid ? boardBodyGrid(fake, lay, g, g.cell * 0.94) : boardBodyStar(fake, lay, g)) +
    '</svg>';
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
  /* every applied move is announced; mp.js forwards the local ones.
     js/mp.js subscribes with (move, { seat, src }) while our own feed fires
     ONE {seat, move, index, src} event. Adapt here (same fix as aqleb-ui):
     without it, mp.js received the whole event object as the move, toWire()
     found no `t` on it, and the table was stopped on the FIRST local move. */
  onMove(fn){
    const f = ev => { if (ev) fn(ev.move, { seat: ev.seat, src: ev.src }); };
    moveSubs.push(f);
    return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); };
  },
  /* Ludo has NO lobby phase inside the engine — the room's lobby already
     seated everyone — so phase() is never 'lobby' and apply() is a no-op.
     Answering honestly is the contract (see mp.js's onBegan). */
  phase(){ return M ? 'play' : 'idle'; },
  apply(seat, move){ if (!M) return { ok:false, why:'no ludu' }; return onlineRemote(seat, move); },
  attachNet(net){ if (M){ M.net = net || null; maybeThink(); } },
  setOwner(i, own){ if (M && M.st.seats[i]){ M.st.seats[i].own = own; } },
  setName(i, name){ if (M && M.st.seats[i] && name){ M.st.seats[i].name = name; } },
  live(){ return !!(M && !M.dead && !E.over(M.st)); },
  /* A CHAIR THAT IS GONE FOR GOOD. The engine HAS a walkout move, so fold
     the seat out deterministically on EVERY phone (mp.js fires seatGone on
     each): tokens leave the board, the clock moves on if it was their turn,
     and the table plays on instead of parking on an empty chair forever.
     src:'net' so the quit is never echoed back onto the wire. */
  seatGone(seat){
    if (!M || M.dead || !M.net) return;
    if (E.over(M.st) || !M.st.seats[seat] || M.st.seats[seat].gone) return;
    const res = doMove(seat, { t:'quit' }, 'net');
    if (res.ok){ render(); if (E.over(M.st)) finish(); }
  },
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
  /* that player's exclusive-set byte, riding their move. Validated
     against the one byte this build knows before it can reach a paint;
     anything else (a newer build's set) is simply stock. decWire strips
     it, so the engine below never sees it. */
  if (move && (move.e | 0) === 1 && M.st.seats[seat]){
    if (!M.skins) M.skins = {};
    M.skins[seat] = 1;
  }
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
    '<p>' + T('A pocketful of tokens each (fewer at the biggest tables), one lap of the ' +
      'board, and captures that send a token all the way home. Only a six gets you out; you ' +
      'need the exact number to finish.',
      'Ftit biċċiet kull wieħed (inqas fuq l-ikbar imwejjed), dawra waħda tat-tabellun, u ' +
      'qabdiet li jibagħtu biċċa lura kollox. Sitta biss toħroġ; trid in-numru eżatt biex ' +
      'tispiċċa.') + '</p>' +
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
