/* ═══════════════════════════════════════════════════════════════════
   KARTI — minhu-ui.js
   MIN HU?  — the screen on top of js/minhu.js's pure engine
   (window.KARTI_MINHU.engine). This file is the board, the runner and
   the wire, and it follows js/ludu-ui.js's shape deliberately: a match is
   (opts, seed, log), every move goes through one doMove() gate, and
   rollback is cutting the log and replaying it.

   WHAT THIS FILE IS
     · the minimal entry menu (PLAY ONLINE / PLAY WITH AI / PASS THE
       PHONE + a sliding "How to play"), ludu/kanun style;
     · the board: 36 character faces in a scrolling grid, each FLIPPABLE — a tap
       flips a face down (eliminated) with a compositor-only 3D flip;
     · YOUR secret character shown to you at the top, never the
       opponent's (secrecy: the opponent's face id never enters the DOM);
     · the turn: a grouped attribute-question picker, the yes/no answer
       shown with a beat, and a GUESS button;
     · the winner screen via js/rebbieh.js;
     · autosave, reduced-motion, mobile-first; faces load from
       art/minhu/<id>.png when present, else a clean DRAWN SVG face built
       from the attributes so the game is playable before the art exists;
     · the online controller on KARTI_PARTY.online.minhu + the lobby
       contract on window.KARTI_MINHU.lobby (2 seats), and the private
       hook that receives THIS seat's secret character from the relay.

   HOUSE RULES OBEYED
     · borrows #scr-party through KARTI_PARTY, injects its own CSS once,
       never touches css/ or the tab bar's ancestors;
     · sounds only through KARTI_SFX ids that already exist (board.flip
       is the flip, game.win the win, ui.* the chrome);
     · every player-visible string is a T(en, mt) pair at its call site;
     · the back arrow goes BACK — no "are you sure" popup: autosaved.

   THE SECRET, ONLINE — read the header of js/minhu.js first.
     A shared seed would leak both secrets. So online runs the engine in
     'private' mode: no secret is known until the relay pushes THIS seat
     its own character index (the private hook), and the opponent's stays
     null forever on this client. A question's answer is computed by the
     ANSWERING phone (the only one that knows its own secret) and echoed
     with the answer bit stamped on — the friendly trust every KARTI
     hidden-role game documents, made verifiable by engine.verify() at
     reveal. Until the relay pushes secrets per seat, the lobby says so.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_MINHU;
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
   OUR CORNER OF localStorage — one key, debounced, flushed on hide.
   ═══════════════════════════════════════════════════════════════════ */
const STORE  = 'karti_minhu_v1';
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

/* ── the machine's three sharpnesses, off the engine's LEVELS ─────── */
function levels(){
  return (E.LEVELS || []).map(L => ({ level:L.k, name:L.name, note:L.note, icon:L.icon }));
}
function levelName(k){ const L = levels().find(x => x.level === k); return (L && L.name) || 'MAKNA'; }
function levelNote(k){ const L = levels().find(x => x.level === k); return L ? TE(L.note) : ''; }

/* ═══════════════════════════════════════════════════════════════════
   SOUND — existing ids only (js/sfx.js), through one gate.
     board.flip  a face flips              ui.tap   a chrome tap
     game.win / game.start                 ui.note  the answer lands
     ui.sheet / ui.back  the rules slide   mp.turn  turn passes to you
     move.illegal  a refused move          card.deal the deal
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
   THE RUNNER — (opts, seed, log), one door for every move.
   ═══════════════════════════════════════════════════════════════════ */
let M = null;      /* the live match     */
let UI = null;     /* the board's DOM    */
const moveSubs = [];
function fireList(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }

function newSeed(){ return (E.newSeed ? E.newSeed() : (Math.random() * 0x100000000) | 0) >>> 0; }

/* rebuild state from (opts, seed, log): deal, then replay every move
   through the engine's own gate. A move that no longer fits stops the
   replay (a corrupt save cannot crash the board). */
function buildState(opts, seed, log){
  const st = E.deal(opts, seed);
  for (let i = 0; i < log.length; i++){
    const mv = log[i];
    const seat = (mv.seat != null) ? mv.seat : E.turn(st);
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
    timer: 0, dead: false, finished: false, recorded: false,
    answering: null,                  /* {seat,key,val,a} the answer being shown */
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
function ownerOf(i){ if (!M) return 'ai'; const s = M.st.seats[i]; return s && s.own ? s.own : 'ai'; }
const isLocal = i => { const o = ownerOf(i); return o === 'me' || o === 'hot'; };
/* the seat "we" are looking at right now: online it is our seat; pass-the-
   phone it is whoever's turn it is (each looks at their own board). */
function viewSeat(){
  if (!M) return 0;
  if (M.net) return M.net.me != null ? M.net.me : E.meSeat(M.st);
  const turnS = E.turn(M.st);
  if (turnS >= 0 && isLocal(turnS)) return turnS;
  /* if it is the AI's turn, keep showing the human's board */
  const me = M.st.seats.findIndex(s => s.own === 'me');
  return me < 0 ? 0 : me;
}

/* THE gate. Every move — thumb, machine, wire, replay — is measured by
   the engine here and nowhere else. */
function doMove(seat, move, src){
  if (!M || M.dead) return { ok:false, err:'no game' };
  if (E.over(M.st) && move.t !== 'quit') return { ok:false, err:'game over' };
  if (!E.check(M.st, move, seat)) return { ok:false, err:'illegal move' };
  const rec = clone(move);
  rec.seat = seat;
  const idx = M.log.length;
  M.log.push(rec);
  E.apply(M.st, rec);
  autosave();
  fireList(moveSubs, { seat, move:clone(move), rec:clone(rec), index:idx, src:src || 'local' });
  return { ok:true, index:idx };
}

function snapshot(){
  if (!M) return null;
  return { v:SAVE_V, gid:'minhu', opts:clone(M.opts), seed:M.seed, log:clone(M.log) };
}
function autosave(){
  if (!M || M.net) return;                 /* online games are not resumed here */
  if (E.over(M.st)){ saveSlot(null); return; }
  saveSlot(snapshot());
}

/* ── the sound of a move — one subscriber ── */
moveSubs.push(ev => {
  if (!M || M.dead) return;
  const mv = ev.move;
  if (mv.t === 'flip'){ cue('board.flip', { gain: mv.down ? 0.8 : 0.5 }, true); return; }
  if (mv.t === 'ask'){ cue('ui.note', { gain: 0.6 }); return; }
  if (mv.t === 'guess'){ cue(ev.rec && M.st.done && M.st.done.winner === ev.seat ? 'ui.reward' : 'ui.error', { gain:0.7 }, true); return; }
  if (mv.t === 'quit'){ cue('mp.left', { gain:0.7 }); return; }
});

/* ═══════════════════════════════════════════════════════════════════
   THE FACE — art/minhu/<id>.png if it exists, else a DRAWN SVG built
   from the attributes. The SVG is deterministic from the character so the
   real art can drop in later with no other change. drawnFace(i) returns
   an <svg>; faceHTML(i) wraps it in an <img> that falls back to the SVG
   on error (so a half-generated art folder never shows a broken image).
   ═══════════════════════════════════════════════════════════════════ */
const ART = 'art/minhu/';
const HAIR_HEX = { black:'#20242e', brown:'#6b4426', blond:'#e0b658', red:'#b6461f', white:'#e8e8ec', bald:'' };
const SKIN_HEX = { light:'#f2c9a8', olive:'#d09b6e', dark:'#8a5a3b' };
const EYE_HEX  = { brown:'#5a3a1e', blue:'#3d6aa8', green:'#3f8a5a' };

/* one drawn face as an inline SVG string. viewBox 0 0 100 118 (a touch
   taller than wide so hats/beards have room). No emoji, no image. */
function drawnFace(i, opts){
  opts = opts || {};
  const c = E.ROSTER[i]; if (!c) return '';
  const a = c.a;
  const skin = SKIN_HEX[a.skin] || SKIN_HEX.light;
  const hair = HAIR_HEX[a.hair] || '#333';
  const eye  = EYE_HEX[a.eyes]  || EYE_HEX.brown;
  const bald = a.hair === 'bald';
  const parts = [];
  parts.push('<svg class="mh-fsvg" viewBox="0 0 100 118" xmlns="http://www.w3.org/2000/svg" ' +
    'preserveAspectRatio="xMidYMid meet" aria-hidden="true">');
  /* soft backdrop disc, per-character hue so a grid of drawn faces reads */
  const bgh = (i * 53) % 360;
  parts.push('<rect x="0" y="0" width="100" height="118" rx="12" fill="hsl(' + bgh + ' 30% 22%)"/>');
  parts.push('<rect x="0" y="0" width="100" height="118" rx="12" fill="url(#mh-vg)"/>');
  /* neck + shoulders */
  parts.push('<path d="M30 118 q0-20 20-24 q20 4 20 24 z" fill="' + shade(skin, -18) + '"/>');
  parts.push('<rect x="26" y="104" width="48" height="14" rx="7" fill="hsl(' + ((bgh + 180) % 360) + ' 34% 40%)"/>');
  /* long hair behind the head */
  if (!bald && a.length === 'long'){
    parts.push('<path d="M20 54 q-6 34 6 52 q10-18 8-40 q6 30 32 40 q-4-24-6-40 q14 6 12 40 q16-16 10-52 z" fill="' + hair + '"/>');
  }
  /* head */
  parts.push('<ellipse cx="50" cy="58" rx="30" ry="34" fill="' + skin + '"/>');
  parts.push('<ellipse cx="50" cy="58" rx="30" ry="34" fill="url(#mh-fg)"/>');
  /* ears (+ earrings) */
  parts.push('<circle cx="20" cy="60" r="6" fill="' + skin + '"/><circle cx="80" cy="60" r="6" fill="' + skin + '"/>');
  if (a.earring === 'yes'){
    parts.push('<circle cx="20" cy="68" r="2.4" fill="#ffd54a" stroke="#a67c00" stroke-width="0.6"/>');
    parts.push('<circle cx="80" cy="68" r="2.4" fill="#ffd54a" stroke="#a67c00" stroke-width="0.6"/>');
  }
  /* hair on top */
  if (!bald){
    if (a.length === 'short'){
      parts.push('<path d="M20 52 q2-30 30-30 q28 0 30 30 q-8-14-30-14 q-22 0-30 14 z" fill="' + hair + '"/>');
    } else {
      parts.push('<path d="M18 54 q2-34 32-34 q30 0 32 34 q-10-18-32-18 q-22 0-32 18 z" fill="' + hair + '"/>');
    }
  } else {
    /* a bald pate: a soft highlight */
    parts.push('<ellipse cx="50" cy="40" rx="22" ry="14" fill="rgba(255,255,255,0.10)"/>');
  }
  /* eyebrows */
  const browY = 48;
  parts.push('<rect x="34" y="' + browY + '" width="12" height="3" rx="1.5" fill="' + (bald ? '#555' : shade(hair, -10)) + '"/>');
  parts.push('<rect x="54" y="' + browY + '" width="12" height="3" rx="1.5" fill="' + (bald ? '#555' : shade(hair, -10)) + '"/>');
  /* eyes */
  parts.push('<ellipse cx="40" cy="56" rx="5.4" ry="4" fill="#fff"/><circle cx="40" cy="56" r="2.6" fill="' + eye + '"/>');
  parts.push('<ellipse cx="60" cy="56" rx="5.4" ry="4" fill="#fff"/><circle cx="60" cy="56" r="2.6" fill="' + eye + '"/>');
  /* nose + mouth */
  parts.push('<path d="M50 58 l-3 8 h6 z" fill="' + shade(skin, -22) + '"/>');
  parts.push('<path d="M42 78 q8 6 16 0" fill="none" stroke="' + shade(skin, -30) + '" stroke-width="2" stroke-linecap="round"/>');
  /* rosy cheeks / freckles / mole */
  if (a.feature === 'rosy'){
    parts.push('<circle cx="32" cy="70" r="5" fill="#e8737a" opacity="0.5"/><circle cx="68" cy="70" r="5" fill="#e8737a" opacity="0.5"/>');
  }
  if (a.feature === 'freckles'){
    for (const p of [[36,68],[40,72],[44,69],[60,69],[64,72],[68,68]])
      parts.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="1.1" fill="' + shade(skin, -30) + '"/>');
  }
  if (a.feature === 'mole'){
    parts.push('<circle cx="62" cy="80" r="1.8" fill="#3a2416"/>');
  }
  /* facial hair */
  if (a.facial === 'moustache'){
    parts.push('<path d="M40 74 q10 6 20 0 q-10 4-20 0 z" fill="' + (bald ? '#555' : hair) + '"/>');
    parts.push('<rect x="40" y="72" width="20" height="4" rx="2" fill="' + (bald ? '#555' : hair) + '"/>');
  } else if (a.facial === 'beard'){
    parts.push('<path d="M24 62 q2 34 26 40 q24-6 26-40 q-8 22-26 22 q-18 0-26-22 z" fill="' + (bald ? '#555' : hair) + '"/>');
  }
  /* glasses */
  if (a.glasses === 'yes'){
    parts.push('<g fill="none" stroke="#2a2a30" stroke-width="2">' +
      '<circle cx="40" cy="56" r="8"/><circle cx="60" cy="56" r="8"/>' +
      '<path d="M48 56 h4"/><path d="M32 54 l-8-2"/><path d="M68 54 l8-2"/></g>');
  }
  /* hat, drawn last so it sits on top of the hair */
  if (a.hat === 'yes'){
    parts.push('<path d="M22 34 h56 v6 h-56 z" fill="#2b2f5a"/>');
    parts.push('<path d="M30 34 q20-18 40 0 z" fill="#3a3f70"/>');
    parts.push('<rect x="30" y="30" width="40" height="6" rx="3" fill="#22254a"/>');
  }
  parts.push('<defs>' +
    '<radialGradient id="mh-fg" cx="42%" cy="34%" r="72%"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="100%" stop-color="#000" stop-opacity="0.14"/></radialGradient>' +
    '<linearGradient id="mh-vg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#000" stop-opacity="0.22"/></linearGradient>' +
    '</defs></svg>');
  void opts;
  return parts.join('');
}
/* darken/lighten a #rrggbb by pct (−100..100) */
function shade(hex, pct){
  if (!hex || hex[0] !== '#' || hex.length < 7) return hex || '#000';
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = pct / 100;
  const adj = v => Math.max(0, Math.min(255, Math.round(v + (f < 0 ? v * f : (255 - v) * f))));
  r = adj(r); g = adj(g); b = adj(b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
/* the face used inside a tile: an <img> that falls back to the drawn SVG
   if the art file is missing. The SVG lives in a sibling layer, shown by
   default and hidden once the image loads. */
function faceHTML(i){
  const id = E.idOf(i);
  return '<span class="mh-fart">' +
    drawnFace(i) +
    '<img class="mh-fimg" alt="" loading="lazy" src="' + esc(ART + id + '.png') +
      '" onload="this.classList.add(\'ok\')" onerror="this.remove()">' +
    '</span>';
}
const nameOf = i => TE(E.ROSTER[i] ? E.ROSTER[i].name : { en:'?', mt:'?' });

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party. A card-table
   identity: warm felt, gold accents, faces as little framed tiles that
   flip. The flip is a 3D rotateY on a compositor transform; the "down"
   face is a slate back with a big X.
   ═══════════════════════════════════════════════════════════════════ */
let cssDone = false;
function injectCSS(){
  if (cssDone || document.getElementById('mh-runtime-css')){ cssDone = true; return; }
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'mh-runtime-css';
  st.textContent =
    '#scr-party{--mh-felt:#123227;--mh-felt2:#0b201a;--mh-gold:var(--gold,#FFC542)}' +

    '#scr-party .pt-host.mh-host{align-items:stretch;justify-content:stretch;overflow:visible}' +
    '#scr-party .mh-wrap{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;' +
      'gap:6px;padding:6px 6px 8px;position:relative}' +

    /* ── the secret + status header ── */
    '#scr-party .mh-top{flex:0 0 auto;display:flex;align-items:center;gap:9px;' +
      'padding:5px 7px;border-radius:13px;background:rgba(0,0,0,.28);' +
      'border:1px solid rgba(255,255,255,.09)}' +
    '#scr-party .mh-secret{flex:0 0 auto;width:44px;height:52px;border-radius:9px;overflow:hidden;' +
      'position:relative;border:1.5px solid var(--mh-gold);box-shadow:0 2px 8px rgba(0,0,0,.45)}' +
    '#scr-party .mh-secret .mh-fart{position:absolute;inset:0}' +
    '#scr-party .mh-tcol{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}' +
    '#scr-party .mh-tlbl{font:900 8.5px/1 var(--disp);letter-spacing:.14em;text-transform:uppercase;' +
      'color:var(--mh-gold)}' +
    '#scr-party .mh-tname{font:900 13px/1.1 var(--disp);color:var(--txt);white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .mh-tturn{font:700 10.5px/1.3 var(--body);color:rgba(255,255,255,.72)}' +
    '#scr-party .mh-tturn b{color:var(--mh-gold);font-weight:900}' +
    '#scr-party .mh-count{flex:0 0 auto;text-align:center;padding:2px 8px;border-radius:9px;' +
      'background:rgba(255,197,66,.12);border:1px solid rgba(255,197,66,.4)}' +
    '#scr-party .mh-count b{display:block;font:900 17px/1 var(--disp);color:var(--mh-gold)}' +
    '#scr-party .mh-count i{font-style:normal;font:700 7.5px/1.3 var(--disp);letter-spacing:.08em;' +
      'text-transform:uppercase;color:var(--dim)}' +

    /* ── the board of 24 faces ── */
    '#scr-party .mh-boardbox{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;' +
      '-webkit-overflow-scrolling:touch;padding:1px}' +
    '#scr-party .mh-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}' +
    '#scr-party .mh-tile{position:relative;aspect-ratio:5/6;border-radius:9px;cursor:pointer;' +
      'perspective:520px;-webkit-tap-highlight-color:transparent;background:none;border:0;padding:0}' +
    '#scr-party .mh-inner{position:absolute;inset:0;transform-style:preserve-3d;' +
      'transition:transform .42s var(--ease,cubic-bezier(.34,1.2,.4,1))}' +
    '#scr-party .mh-tile.down .mh-inner{transform:rotateY(180deg)}' +
    '#scr-party .mh-face,#scr-party .mh-back{position:absolute;inset:0;border-radius:9px;overflow:hidden;' +
      '-webkit-backface-visibility:hidden;backface-visibility:hidden;' +
      'border:1.5px solid rgba(255,255,255,.14);box-shadow:0 2px 6px rgba(0,0,0,.4)}' +
    '#scr-party .mh-back{transform:rotateY(180deg);background:linear-gradient(160deg,#28323b,#161d24);' +
      'display:grid;place-items:center;border-color:rgba(255,255,255,.10)}' +
    '#scr-party .mh-back svg{width:34%;height:34%;stroke:rgba(255,255,255,.4);stroke-width:2.4;' +
      'fill:none;stroke-linecap:round}' +
    '#scr-party .mh-fart{position:absolute;inset:0;display:block}' +
    '#scr-party .mh-fart .mh-fsvg{position:absolute;inset:0;width:100%;height:100%}' +
    '#scr-party .mh-fimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' +
      'opacity:0;transition:opacity .2s ease}' +
    '#scr-party .mh-fimg.ok{opacity:1}' +
    '#scr-party .mh-nm{position:absolute;left:0;right:0;bottom:0;padding:2px 2px 2.5px;' +
      'font:900 8px/1.1 var(--disp);letter-spacing:.02em;text-align:center;color:#fff;' +
      'text-transform:uppercase;background:linear-gradient(0deg,rgba(0,0,0,.82),rgba(0,0,0,0));' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .mh-tile.down .mh-nm{opacity:0}' +
    /* the "still in the running" ring pulse when it is the one guess target */
    '#scr-party .mh-tile.aim .mh-face{border-color:var(--mh-gold);box-shadow:0 0 0 2px var(--mh-gold)}' +
    'body.reduced #scr-party .mh-inner{transition:none}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .mh-inner{transition:none}}' +
    '#scr-party.mh-still .mh-inner{transition:none}' +

    /* ── the action dock ── */
    '#scr-party .mh-dock{flex:0 0 auto;display:flex;gap:8px;padding:2px 2px 0}' +
    '#scr-party .mh-btn{flex:1;min-height:50px;border-radius:13px;font:900 12.5px/1 var(--disp);' +
      'letter-spacing:.05em;text-transform:uppercase;-webkit-tap-highlight-color:transparent;' +
      'display:flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}' +
    '#scr-party .mh-btn.ask{color:#241800;background:linear-gradient(180deg,#FFD979,var(--mh-gold));' +
      'border:1px solid #FFE9B0;box-shadow:0 3px 0 -1px rgba(0,0,0,.4)}' +
    '#scr-party .mh-btn.guess{color:var(--txt);background:rgba(255,255,255,.08);' +
      'border:1px solid rgba(255,255,255,.2)}' +
    '#scr-party .mh-btn:not([disabled]):active{transform:translateY(2px);box-shadow:none}' +
    '#scr-party .mh-btn[disabled]{opacity:.4;pointer-events:none}' +
    '#scr-party .mh-btn.guess.armed{color:#241800;background:linear-gradient(180deg,#ff9a76,#e8613a);' +
      'border-color:#ffb59a}' +

    /* ── a slide-up sheet (rules, question picker, answer) ── */
    '#scr-party .mh-sheet{position:absolute;left:0;right:0;bottom:0;z-index:30;max-height:78%;' +
      'display:flex;flex-direction:column;border-radius:16px 16px 0 0;overflow:hidden;' +
      'background:linear-gradient(180deg,#183a2d,#0c211a);border:1px solid rgba(255,255,255,.14);' +
      'border-bottom:0;box-shadow:0 -14px 34px rgba(0,0,0,.6);' +
      'transform:translateY(108%);opacity:0;visibility:hidden;pointer-events:none;' +
      'transition:transform .28s var(--ease),opacity .28s var(--ease),visibility 0s .28s}' +
    '#scr-party .mh-sheet.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .28s var(--ease),opacity .28s var(--ease)}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .mh-sheet{transition:none}}' +
    'body.reduced #scr-party .mh-sheet{transition:none}' +
    '#scr-party .mh-sheet-h{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;' +
      'padding:11px 6px 6px 16px}' +
    '#scr-party .mh-sheet-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--mh-gold)}' +
    '#scr-party .mh-sheet-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;color:var(--txt);' +
      'cursor:pointer;display:grid;place-items:center;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .mh-sheet-x svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.2;' +
      'stroke-linecap:round}' +
    '#scr-party .mh-sheet-b{min-height:0;overflow-y:auto;padding:2px 14px 16px;-webkit-overflow-scrolling:touch}' +
    '#scr-party .mh-sheet-b li{font-size:12px;line-height:1.6;color:var(--dim);margin:0 0 6px 14px}' +

    /* the question picker: grouped chips */
    '#scr-party .mh-qgrp{margin:8px 0 2px}' +
    '#scr-party .mh-qgrp>b{display:block;font:900 9px/1.4 var(--disp);letter-spacing:.12em;' +
      'text-transform:uppercase;color:var(--dim);margin:0 0 5px}' +
    '#scr-party .mh-chips{display:flex;flex-wrap:wrap;gap:6px}' +
    '#scr-party .mh-chip{padding:8px 12px;min-height:40px;border-radius:11px;font:800 12px/1 var(--body);' +
      'color:var(--txt);background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);' +
      'cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .mh-chip .n{color:var(--mh-gold);font-weight:900;margin-left:5px;font-size:11px}' +
    '#scr-party .mh-chip:active{background:rgba(255,197,66,.16)}' +

    /* the answer reveal */
    '#scr-party .mh-ans{display:flex;flex-direction:column;align-items:center;gap:10px;padding:14px 8px 6px;text-align:center}' +
    '#scr-party .mh-ans .q{font:700 13px/1.5 var(--body);color:rgba(255,255,255,.85)}' +
    '#scr-party .mh-ans .q b{color:var(--mh-gold);font-weight:900}' +
    '#scr-party .mh-ans .big{font:900 34px/1 var(--disp);letter-spacing:.06em}' +
    '#scr-party .mh-ans .big.yes{color:#57d98a}' +
    '#scr-party .mh-ans .big.no{color:#ff7a6b}' +
    '#scr-party .mh-ans .hint{font-size:11px;color:var(--dim)}' +

    /* ── the menu face ── */
    '#scr-party .mh-menu .mh-hero{position:relative;display:grid;grid-template-columns:repeat(4,1fr);' +
      'gap:5px;margin:2px 0 12px;padding:12px;border-radius:16px;overflow:hidden;' +
      'background:radial-gradient(120% 130% at 50% 15%,#1c4a39 0%,var(--mh-felt) 55%,var(--mh-felt2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.06)}' +
    '#scr-party .mh-hero .mh-hface{position:relative;aspect-ratio:5/6;border-radius:8px;overflow:hidden;' +
      'border:1px solid rgba(255,255,255,.12)}' +
    '#scr-party .mh-hero .mh-hface.dn{filter:grayscale(1) brightness(.4)}' +
    '#scr-party .mh-menu .pt-lbl{color:#8fdcbe}' +

    /* ── the PICK screen — choose your own secret face ── */
    '#scr-party .mh-pick{flex:1;min-height:0;display:flex;flex-direction:column;gap:8px;padding:6px}' +
    '#scr-party .mh-pick-h{flex:0 0 auto;text-align:center;padding:2px 4px}' +
    '#scr-party .mh-pick-h b{display:block;font:900 15px/1.15 var(--disp);color:var(--txt)}' +
    '#scr-party .mh-pick-h i{font-style:normal;font:700 11px/1.4 var(--body);color:var(--dim)}' +
    '#scr-party .mh-pickbox{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;' +
      '-webkit-overflow-scrolling:touch;padding:1px}' +
    '#scr-party .mh-pgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}' +
    '#scr-party .mh-ptile{position:relative;aspect-ratio:5/6;border-radius:9px;cursor:pointer;padding:0;' +
      'background:none;border:1.5px solid rgba(255,255,255,.14);overflow:hidden;' +
      '-webkit-tap-highlight-color:transparent;box-shadow:0 2px 6px rgba(0,0,0,.4)}' +
    '#scr-party .mh-ptile.sel{border-color:var(--mh-gold);box-shadow:0 0 0 2px var(--mh-gold)}' +
    '#scr-party .mh-ptile .mh-nm{position:absolute;left:0;right:0;bottom:0;padding:2px 2px 2.5px;' +
      'font:900 8px/1.1 var(--disp);text-align:center;color:#fff;text-transform:uppercase;' +
      'background:linear-gradient(0deg,rgba(0,0,0,.82),rgba(0,0,0,0));white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .mh-pickdock{flex:0 0 auto;display:flex;gap:8px;padding:2px}' +

    /* ── the HANDOVER curtain (pass-the-phone, keeps a pick hidden) ── */
    '#scr-party .mh-hand{position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:16px;text-align:center;padding:24px;' +
      'background:radial-gradient(120% 120% at 50% 30%,#1c4a39,var(--mh-felt) 60%,var(--mh-felt2))}' +
    '#scr-party .mh-hand b{font:900 22px/1.15 var(--disp);color:var(--mh-gold)}' +
    '#scr-party .mh-hand p{max-width:280px;font:600 13px/1.5 var(--body);color:rgba(255,255,255,.82)}' +
    '#scr-party .mh-hand .btn{min-width:180px}' +

    /* ── TALK MODE: the free-form yes/no answer prompt ── */
    '#scr-party .mh-yn{display:flex;gap:10px;padding:12px 4px 4px}' +
    '#scr-party .mh-yn button{flex:1;min-height:62px;border-radius:14px;font:900 18px/1 var(--disp);' +
      'letter-spacing:.06em;text-transform:uppercase;cursor:pointer;-webkit-tap-highlight-color:transparent;' +
      'display:flex;align-items:center;justify-content:center}' +
    '#scr-party .mh-yn .yes{color:#06301a;background:linear-gradient(180deg,#7ce8a6,#39c877);border:1px solid #a7f3c6}' +
    '#scr-party .mh-yn .no{color:#3a0d08;background:linear-gradient(180deg,#ff9b8c,#f0644f);border:1px solid #ffb9ad}' +
    '#scr-party .mh-yn button:active{transform:translateY(2px)}' +
    '#scr-party .mh-talkhint{font:600 12px/1.5 var(--body);color:var(--dim);text-align:center;padding:6px 10px 2px}' +
    /* the ask/talk toggle in the dock area */
    '#scr-party .mh-modeseg{flex:0 0 auto;display:flex;gap:0;margin:0 2px 2px;border-radius:11px;overflow:hidden;' +
      'border:1px solid rgba(255,255,255,.16)}' +
    '#scr-party .mh-modeseg button{flex:1;min-height:34px;border:0;background:rgba(255,255,255,.05);' +
      'color:var(--dim);font:900 10px/1 var(--disp);letter-spacing:.08em;text-transform:uppercase;cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .mh-modeseg button.on{background:rgba(255,197,66,.16);color:var(--mh-gold)}' +

    /* keep 36 faces tidy on the smallest phones */
    '@media (max-height:670px){#scr-party .mh-grid,#scr-party .mh-pgrid{gap:4px}' +
      '#scr-party .mh-nm{font-size:7px}}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   THE FRAME + BOARD DOM
   ═══════════════════════════════════════════════════════════════════ */
function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: 'MIN HU?',
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'mh-rules', label:T('Rules', 'Regoli'), icon:'book',    cls:'ghost' },
      { id:'mh-new',   label:T('New', 'Ġdida'),    icon:'refresh', cls:'ghost' }
    ]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();
  M.ctx.badge.textContent = M.net ? T('Online', 'Onlajn') : levelName(pickLvl());
  buildBoard();
  M.ctx.btn('mh-rules').onclick = () => openSheet('rules');
  const nb = M.ctx.btn('mh-new');
  if (nb) nb.onclick = () => {
    if (M.net) return;
    P.ui.confirm(M.ctx, {
      head: T('Start a fresh round?', 'Tibda rawnd ġdid?'),
      why:  T('This game ends and a new secret is dealt.', 'Din il-logħba tispiċċa u jinqasam sigriet ġdid.'),
      yes:  T('New round', 'Rawnd ġdid'),
      no:   T('No, carry on', 'Le, kompli'),
      go: () => setupSheet()
    });
  };
}
function pickLvl(){
  if (!M) return 2;
  const ai = M.st.seats.find(s => s.own === 'ai');
  return ai ? ai.lvl : (pref().lvl || 2);
}

function buildBoard(){
  const ctx = M.ctx;
  ctx.host.classList.add('mh-host');
  ctx.host.innerHTML =
    '<div class="mh-wrap" id="mh-wrap">' +
      '<div class="mh-top" id="mh-top"></div>' +
      '<div class="mh-boardbox" id="mh-boardbox"><div class="mh-grid" id="mh-grid"></div></div>' +
      '<div class="mh-dock" id="mh-dock"></div>' +
      /* one reusable slide-up sheet for rules / questions / answer */
      '<div class="mh-sheet" id="mh-sheet" aria-hidden="true">' +
        '<div class="mh-sheet-h"><h4 id="mh-sheet-t"></h4>' +
          '<button class="mh-sheet-x" id="mh-sheet-x" aria-label="' + esc(T('Close', 'Agħlaq')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button></div>' +
        '<div class="mh-sheet-b" id="mh-sheet-b"></div>' +
      '</div>' +
    '</div>';
  const root = ctx.host.querySelector('#mh-wrap');
  UI = {
    ctx, root,
    top:    root.querySelector('#mh-top'),
    grid:   root.querySelector('#mh-grid'),
    dock:   root.querySelector('#mh-dock'),
    sheet:  root.querySelector('#mh-sheet'),
    sheetT: root.querySelector('#mh-sheet-t'),
    sheetB: root.querySelector('#mh-sheet-b'),
    sheetMode: null, armed: false,
    qmode: (pref().qmode === 'talk') ? 'talk' : 'buttons'   /* BUTTONS or TALK */
  };
  root.querySelector('#mh-sheet-x').addEventListener('click', () => closeSheet());
  buildGrid();
  render();
}

/* the 36 tiles, built once; render() only toggles classes and the header */
function buildGrid(){
  const view = viewSeat();
  UI.grid.innerHTML = E.ROSTER.map((c, i) =>
    '<button class="mh-tile" data-c="' + i + '" aria-label="' + esc(nameOf(i)) + '">' +
      '<div class="mh-inner">' +
        '<div class="mh-face">' + faceHTML(i) + '<span class="mh-nm">' + esc(nameOf(i)) + '</span></div>' +
        '<div class="mh-back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></div>' +
      '</div>' +
    '</button>').join('');
  UI.grid.addEventListener('click', onTileTap);
  void view;
}

/* tapping a face: if we are "arming a guess", it names that character;
   otherwise it flips the face down/up on our own board (bookkeeping). */
function onTileTap(e){
  if (!M || M.dead) return;
  const btn = e.target && e.target.closest && e.target.closest('.mh-tile');
  if (!btn) return;
  const c = btn.getAttribute('data-c') | 0;
  const seat = viewSeat();
  if (UI.armed){
    /* confirm a guess */
    disarmGuess();
    submitGuess(seat, c);
    return;
  }
  /* free bookkeeping flip on our own board — allowed any time. A face
     currently standing (board true) flips DOWN (down=true); a face already
     down flips back up (down=false). */
  const down = M.st.board[seat][c];          /* standing → down, down → up */
  const res = doMove(seat, { t:'flip', c, down }, 'local');
  if (!res.ok){ cue('move.illegal', { gain:0.7 }); return; }
  render();
}

/* ═══════════════════════════════════════════════════════════════════
   RENDER — the whole screen off the engine's readers.
   ═══════════════════════════════════════════════════════════════════ */
function render(){
  if (!M || !UI || !UI.root || !UI.root.isConnected) return;
  const st = M.st;
  const view = viewSeat();
  const scr = document.getElementById('scr-party');
  if (scr) scr.classList.toggle('mh-still', reduced());
  paintTop(view);
  paintGrid(view);
  paintDock(view);
  maybeThink();
  if (E.over(st)) finish();
}

function paintTop(view){
  const st = M.st;
  const mySecret = st.secret[view];
  const turnS = E.turn(st);
  const mine = !E.over(st) && turnS === view;
  const secHTML = (typeof mySecret === 'number')
    ? faceHTML(mySecret)
    : '<span class="mh-fart"></span>';
  const secName = (typeof mySecret === 'number') ? nameOf(mySecret) : T('secret', 'sigriet');
  let turnLine;
  if (E.over(st)){
    turnLine = esc(TE(E.note(st)));
  } else if (mine){
    turnLine = '<b>' + esc(T('Your turn', 'Imissek int')) + '</b> — ' +
      esc(T('ask or guess', 'staqsi jew aqta’'));
  } else {
    const who = ownerOf(turnS) === 'ai' ? levelName(st.seats[turnS].lvl)
      : isLocal(turnS) ? (st.seats[turnS].name || T('Player 2', 'Plejer 2'))
      : (st.seats[turnS].name || T('Opponent', 'Avversarju'));
    turnLine = esc(who) + ' ' + esc(T('is thinking…', 'qed jaħseb…'));
  }
  UI.top.innerHTML =
    '<div class="mh-secret">' + secHTML + '</div>' +
    '<div class="mh-tcol">' +
      '<span class="mh-tlbl">' + esc(T('Your character', 'Il-karattru tiegħek')) + '</span>' +
      '<span class="mh-tname">' + esc(secName) + '</span>' +
      '<span class="mh-tturn">' + turnLine + '</span>' +
    '</div>' +
    '<div class="mh-count"><b>' + E.standing(st, view) + '</b><i>' + esc(T('left', 'baqa’')) + '</i></div>';
}

function paintGrid(view){
  const st = M.st;
  const tiles = UI.grid.querySelectorAll('.mh-tile');
  tiles.forEach(t => {
    const c = t.getAttribute('data-c') | 0;
    const down = !st.board[view][c];
    t.classList.toggle('down', down);
    t.classList.toggle('aim', UI.armed && !down);
  });
}

function paintDock(view){
  const st = M.st;
  const mine = !E.over(st) && E.turn(st) === view && !M.answering && !M.talkPending;
  if (E.over(st)){
    UI.dock.innerHTML = '<button class="mh-btn guess" disabled>' + esc(T('Game over', 'Spiċċat')) + '</button>';
    return;
  }
  /* TALK mode, mid-turn: the opponent has answered; the asker is flipping
     faces by hand. Show the answer reminder + a Done bar that ends the turn. */
  if (M.talkPending){
    const a = M.talkPending.a;
    UI.dock.innerHTML =
      '<div class="mh-modeseg" aria-hidden="true"><button class="on" disabled>' +
        esc(T('Answer:', 'Tweġiba:')) + ' ' + esc(a ? T('YES', 'IVA') : T('NO', 'LE')) +
        ' · ' + esc(T('flip your faces, then Done', 'aqleb il-wċuħ, imbagħad Lest')) + '</button></div>' +
      '<button class="mh-btn ask" id="mh-talkdone">' + esc(T('Done', 'Lest')) + '</button>';
    const dn = UI.dock.querySelector('#mh-talkdone');
    if (dn) dn.onclick = () => finishTalk();
    return;
  }
  if (UI.armed){
    UI.dock.innerHTML =
      '<button class="mh-btn guess armed" id="mh-cancel">' + esc(T('Cancel', 'Ikkanċella')) + '</button>';
    const cn = UI.dock.querySelector('#mh-cancel');
    if (cn) cn.onclick = () => { disarmGuess(); render(); };
    return;
  }
  const askDis = mine ? '' : ' disabled';
  const talk = UI.qmode === 'talk';
  /* the BUTTONS / TALK toggle: only for a HUMAN opponent (the AI cannot
     hear you). Structured buttons work remotely; TALK is for the same room
     (ask out loud, the opponent taps yes/no, you flip faces by hand). */
  const seg = talkAvailable()
    ? '<div class="mh-modeseg" id="mh-modeseg" role="group" aria-label="' +
        esc(T('Question mode', 'Mod tal-mistoqsija')) + '">' +
        '<button data-m="buttons"' + (!talk ? ' class="on"' : '') + ' aria-pressed="' + (!talk) + '">' +
          esc(T('Buttons', 'Buttuni')) + '</button>' +
        '<button data-m="talk"' + (talk ? ' class="on"' : '') + ' aria-pressed="' + talk + '">' +
          esc(T('Talk (out loud)', 'Bil-fomm')) + '</button>' +
      '</div>'
    : '';
  const askBtn = talk
    ? '<button class="mh-btn ask" id="mh-ask"' + askDis + '>' + ico('help') + ' ' +
        esc(T('Ask out loud', 'Staqsi bil-fomm')) + '</button>'
    : '<button class="mh-btn ask" id="mh-ask"' + askDis + '>' + ico('help') + ' ' +
        esc(T('Ask a question', 'Staqsi')) + '</button>';
  UI.dock.innerHTML = seg +
    '<div style="display:flex;gap:8px">' +
      askBtn +
      '<button class="mh-btn guess" id="mh-guess"' + askDis + '>' + ico('users') + ' ' +
        esc(T('Guess', 'Aqta’')) + '</button>' +
    '</div>';
  const sg = UI.dock.querySelector('#mh-modeseg');
  if (sg) sg.querySelectorAll('button').forEach(b => b.onclick = () => {
    UI.qmode = b.getAttribute('data-m');
    pref({ qmode: UI.qmode });
    cue('ui.toggle', { gain:0.5 });
    render();
  });
  const ab = UI.dock.querySelector('#mh-ask'), gb = UI.dock.querySelector('#mh-guess');
  if (ab && !ab.disabled) ab.onclick = () => talk ? openTalk() : openSheet('ask');
  if (gb && !gb.disabled) gb.onclick = () => armGuess();
}

/* talk mode is offered only when the OPPONENT is a person (they can hear
   the spoken question): pass-the-phone or online, never vs the machine. */
function talkAvailable(){
  if (!M) return false;
  const other = M.st.seats.find((s, i) => i !== viewSeat());
  const anyAI = M.st.seats.some(s => s.own === 'ai');
  return !anyAI && !!other;
}

/* ═══════════════════════════════════════════════════════════════════
   THE GUESS FLOW — tap GUESS, then tap a face. A wrong guess loses; a
   right one wins (engine rule). We arm, the grid pulses standing faces,
   and the next tile tap submits.
   ═══════════════════════════════════════════════════════════════════ */
function armGuess(){
  UI.armed = true;
  cue('ui.toggle', { gain:0.7 });
  render();
}
function disarmGuess(){ UI.armed = false; }
function submitGuess(seat, c){
  if (!M || E.over(M.st)) return;
  /* online: this client may not hold the opponent's secret, so it cannot
     judge — send the guess and let the opponent's phone stamp right. But
     locally (offline / our own AI game) the engine judges directly. */
  const mv = { t:'guess', c };
  const res = doMove(seat, mv, 'local');
  if (!res.ok){ cue('move.illegal', { gain:0.7 }); render(); return; }
  render();
}

/* ═══════════════════════════════════════════════════════════════════
   THE QUESTION SHEET — grouped chips. Tapping one asks it, the sheet
   shows the answer with a beat, then closes and the turn passes.
   ═══════════════════════════════════════════════════════════════════ */
function openSheet(mode){
  UI.sheetMode = mode;
  if (mode === 'rules'){
    UI.sheetT.textContent = T('How to play', 'Kif tilgħab');
    UI.sheetB.innerHTML = '<ul style="margin:0;padding:0">' +
      rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul>';
  } else if (mode === 'ask'){
    UI.sheetT.textContent = T('Ask about their face', 'Staqsi fuq wiċċhom');
    UI.sheetB.innerHTML = questionPickerHTML();
    UI.sheetB.querySelectorAll('.mh-chip').forEach(ch => {
      ch.onclick = () => askQuestion(ch.getAttribute('data-k'), ch.getAttribute('data-v'));
    });
  }
  UI.sheet.classList.add('open');
  UI.sheet.setAttribute('aria-hidden', 'false');
  cue('ui.sheet', { gain:0.8 });
}
function closeSheet(){
  if (!UI || !UI.sheet) return;
  UI.sheet.classList.remove('open');
  UI.sheet.setAttribute('aria-hidden', 'true');
  UI.sheetMode = null;
  cue('ui.back', { gain:0.5 });
}

function questionPickerHTML(){
  return E.SCHEMA.map(a => {
    const chips = a.values
      .map(val => ({ val, yes: E.fieldSplit({ key:a.key, val:val.v }) }))
      .filter(o => o.yes > 0 && o.yes < E.N)
      .map(o => '<button class="mh-chip" data-k="' + esc(a.key) + '" data-v="' + esc(o.val.v) + '">' +
        esc(TE(o.val)) + '<span class="n">' + o.yes + '</span></button>').join('');
    if (!chips) return '';
    return '<div class="mh-qgrp"><b>' + esc(TE(a.label)) + '</b><div class="mh-chips">' + chips + '</div></div>';
  }).join('');
}

/* ask a question: submit the move, then reveal the answer with a beat */
function askQuestion(key, val){
  const seat = viewSeat();
  if (E.turn(M.st) !== seat){ closeSheet(); return; }
  const mv = { t:'ask', key, val };
  const res = doMove(seat, mv, 'local');
  if (!res.ok){ cue('move.illegal', { gain:0.7 }); return; }
  /* the answer the engine recorded on the move */
  const rec = M.log[M.log.length - 1];
  const a = (rec && (rec.a === 0 || rec.a === 1)) ? rec.a : (M.st.lastAsk ? M.st.lastAsk.a : 0);
  showAnswer(seat, key, val, a);
}

/* ═══════════════════════════════════════════════════════════════════
   TALK MODE — the IN-THE-ROOM turn. The asker (whose turn it is) tapped
   "Ask out loud"; they say the question aloud, and the OPPONENT, who is
   right there, taps YES or NO. That honest bit is the {t:'talk',a} move —
   no attribute, so nothing auto-flips and NOTHING is verifiable (there is
   no structured claim to audit). The asker then flips faces BY HAND by
   tapping tiles. Online, the fully-answered talk move travels so the other
   phone advances its turn; this is why talk is for players in one room.

   TRUST MODEL: identical friendly trust to every KARTI hidden-role game —
   the answerer answers honestly. A spoken question cannot be machine-
   checked, so verify() simply skips talk turns; use Buttons for remote,
   audit-able play.
   ═══════════════════════════════════════════════════════════════════ */
function openTalk(){
  const seat = viewSeat();
  if (E.turn(M.st) !== seat) return;
  UI.sheetMode = 'talk';
  UI.sheetT.textContent = T('Say it out loud', 'Għidha bil-fomm');
  UI.sheetB.innerHTML =
    '<div class="mh-ans">' +
      '<div class="q">' + esc(T('Ask your opponent a yes/no question out loud. They tap the honest answer.',
                                 'Staqsi lill-avversarju mistoqsija iva/le bil-fomm. Huma jagħfsu t-tweġiba vera.')) + '</div>' +
    '</div>' +
    '<div class="mh-talkhint">' + esc(T('The opponent answers:', 'L-avversarju jwieġeb:')) + '</div>' +
    '<div class="mh-yn">' +
      '<button class="yes" id="mh-yn-yes">' + esc(T('YES', 'IVA')) + '</button>' +
      '<button class="no" id="mh-yn-no">' + esc(T('NO', 'LE')) + '</button>' +
    '</div>' +
    '<div class="mh-talkhint">' + esc(T('Then flip the faces that no longer fit yourself, by tapping them.',
                                        'Imbagħad aqleb int stess il-wċuħ li ma jibqgħux jaqblu, billi tagħfashom.')) + '</div>';
  UI.sheet.classList.add('open');
  UI.sheet.setAttribute('aria-hidden', 'false');
  cue('ui.sheet', { gain:0.8 });
  const yes = UI.sheetB.querySelector('#mh-yn-yes');
  const no  = UI.sheetB.querySelector('#mh-yn-no');
  if (yes) yes.onclick = () => talkAnswered(seat, 1);
  if (no)  no.onclick  = () => talkAnswered(seat, 0);
}
/* the opponent tapped YES/NO. Keep the ASKER on their turn (view stays on
   the asker's board) so they can flip the faces that no longer fit by hand;
   a Done button then emits the {t:'talk',a} move, which is what passes the
   turn. This ordering is what makes manual flipping work — offline the view
   would otherwise switch away the instant the turn passed. */
function talkAnswered(seat, a){
  if (!M || E.over(M.st)) return;
  if (E.turn(M.st) !== seat){ closeSheet(); return; }
  M.talkPending = { seat, a: a ? 1 : 0 };
  cue('ui.note', { gain:0.7 }, true);
  /* close the sheet so the BOARD is tappable — the asker now flips the
     faces that no longer fit by hand. The dock shows a Done bar (paintDock
     reads M.talkPending) that commits the turn. */
  closeSheet();
  render();
}
/* commit the talk turn — emits the move that passes the turn. */
function finishTalk(){
  const p = M && M.talkPending;
  if (!p){ closeSheet(); return; }
  M.talkPending = null;
  const res = doMove(p.seat, { t:'talk', a: p.a }, 'local');
  if (!res.ok){ cue('move.illegal', { gain:0.7 }); return; }
  closeSheet();
  render();
}

/* the answer reveal — a beat, then the sheet offers to auto-flip the
   faces that no longer fit, and closes. */
function showAnswer(seat, key, val, a){
  M.answering = { seat, key, val, a };
  const qLabel = TE(E.valLabel(key, val));
  UI.sheetMode = 'answer';
  UI.sheetT.textContent = T('The answer', 'It-tweġiba');
  UI.sheetB.innerHTML =
    '<div class="mh-ans">' +
      '<div class="q">' + esc(T('Does their character have', 'Il-karattru tagħhom għandu')) +
        ' <b>' + esc(qLabel) + '</b>?</div>' +
      '<div class="big ' + (a ? 'yes' : 'no') + '">' + esc(a ? T('YES', 'IVA') : T('NO', 'LE')) + '</div>' +
      '<div class="hint">' + esc(T('Faces that disagree will flip down.', 'Wċuħ li ma jaqblux jinqalbu.')) + '</div>' +
    '</div>';
  UI.sheet.classList.add('open');
  UI.sheet.setAttribute('aria-hidden', 'false');
  cue(a ? 'ui.note' : 'ui.note', { gain:0.7 }, true);
  render();
  /* after a beat, auto-flip the non-matching standing faces and close */
  const delay = reduced() ? 250 : 1150;
  setTimeout(() => {
    if (!M || M.dead) return;
    autoFlipAfter(seat, key, val, a);
    M.answering = null;
    closeSheet();
    render();
  }, delay);
}

/* auto-flip the faces on the asker's board that disagree with the truth.
   Uses the engine's botFlips() so a human's board is cleaned the same way
   the AI cleans its own — and each flip is a real logged move. */
function autoFlipAfter(seat, key, val, a){
  const flips = E.botFlips(M.st, seat, key, val, a);
  flips.forEach(c => { doMove(seat, { t:'flip', c, down:true }, 'auto'); });
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE'S TURN — engine's think() drives it. Ask (with a shown
   answer beat, so a person can watch) or guess.
   ═══════════════════════════════════════════════════════════════════ */
function maybeThink(){
  if (!M || M.dead || M.timer || M.answering) return;
  const st = M.st;
  if (E.over(st)) return;
  const seat = E.turn(st);
  if (ownerOf(seat) !== 'ai') return;
  if (M.net && M.net.host === false) return;    /* only the host drives bots online */
  const delay = reduced() ? 80 : 620;
  M.timer = setTimeout(() => {
    M.timer = 0;
    if (!M || M.dead) return;
    const st2 = M.st;
    if (E.over(st2) || ownerOf(E.turn(st2)) !== 'ai'){ render(); return; }
    const s2 = E.turn(st2);
    const mv = E.think(st2, s2, st2.seats[s2].lvl);
    if (!mv){ render(); return; }
    if (mv.t === 'ask'){
      const rec = Object.assign({}, mv);
      const res = doMove(s2, rec, 'local');
      if (!res.ok){ render(); return; }
      const stamped = M.log[M.log.length - 1];
      const a = (stamped && (stamped.a === 0 || stamped.a === 1)) ? stamped.a : (M.st.lastAsk ? M.st.lastAsk.a : 0);
      /* the bot cleans its own board */
      autoFlipAfter(s2, mv.key, mv.val, a);
      render();
    } else if (mv.t === 'guess'){
      doMove(s2, mv, 'local');
      render();
    }
  }, delay);
}

/* ═══════════════════════════════════════════════════════════════════
   THE END — the shared winner screen (js/rebbieh.js). Two rows, the
   local seat flagged, the winner crowned. The loser's secret is revealed
   in the standings so the round makes sense.
   ═══════════════════════════════════════════════════════════════════ */
function finish(){
  if (!M || M.finished) return;
  M.finished = true;
  stopThinking();
  const st = M.st;
  const me = viewSeat();
  const v = E.verdict(st, me);
  if (!M.net && !M.recorded){
    M.recorded = true;
    if (v && v.tone === 'win') ST.rec.w++; else ST.rec.l++;
    persist();
  }
  saveSlot(null);
  cue(v && v.tone === 'win' ? 'game.win' : 'game.lose', { gain:0.95 }, true);

  const winner = st.done ? st.done.winner : me;
  const order = [winner, E.opp(winner)];
  const rows = order.map((seat, i) => {
    const s = st.seats[seat];
    const isMe = seat === me;
    /* reveal each seat's secret in the score line when known */
    const sec = st.secret[seat];
    const secName = (typeof sec === 'number') ? nameOf(sec) : '';
    return {
      name: isMe ? T('You', 'Int')
        : s.own === 'ai' ? levelName(s.lvl)
        : (s.name || T('Opponent', 'Avversarju')),
      place: i + 1,
      you: isMe,
      bot: s.own === 'ai',
      score: secName,
      avatar: (typeof sec === 'number') ? (ART + E.idOf(sec) + '.png') : null,
      border: seat === winner ? (window.KARTI_MINHU ? '#FFC542' : null) : null
    };
  });

  const reason = st.done ? st.done.reason : 'guessed';
  const head = (v && v.tone === 'win')
    ? T('You cracked it!', 'Qtajtha!')
    : reason === 'wrong'
      ? T('Wrong guess', 'Qatgħa ħażina')
      : reason === 'quit'
        ? T('They left', 'Telqu')
        : T('They guessed you', 'Qatgħuk');

  const show = window.KARTI_REBBIEH && window.KARTI_REBBIEH.show;
  const net = M.net;
  if (!show){
    P.ui.result(M.ctx, {
      tone: v ? v.tone : 'draw',
      head,
      why: reason === 'wrong'
        ? T('A wrong guess loses the round. Ask one more question next time.',
            'Qatgħa ħażina titlef ir-rawnd. Il-ħin li jmiss staqsi waħda oħra.')
        : T('The board is down to one.', 'It-tabellun niżel għal wieħed.'),
      buttons: [
        { label:T('Play again', 'Erġa\' lgħab'), icon:'refresh', cls:'primary',
          go: () => { leave(); if (net && net.onLeave) net.onLeave(); else setupSheet(); } },
        { label:T('Leave', 'Oħroġ'), icon:'back', cls:'ghost',
          go: () => { leave(); if (net && net.onLeave) net.onLeave(); else P.hub(); } }
      ]
    });
    return;
  }
  show({
    title: head,
    subtitle: T('The secrets', 'Is-sigrieti'),
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
  if (M){ autosave(); persistNow(); M.dead = true; }
  M = null; UI = null;
}

/* ═══════════════════════════════════════════════════════════════════
   THE RULES CARD
   ═══════════════════════════════════════════════════════════════════ */
function rulesFor(){
  return [
    T('At the start you each <b>choose your own secret character</b> from the board — the ' +
      'opponent never sees your pick. (Prefer chance? Tap "Surprise me".)',
      'Fil-bidu kull wieħed <b>jagħżel il-karattru sigriet tiegħu</b> mit-tabellun — l-avversarju ' +
      'qatt ma jara l-għażla tiegħek. (Trid ix-xorti? Agħfas "Aħsibli int".)'),
    T('Your character is shown to you at the top; theirs is hidden.',
      'Il-karattru tiegħek jidher fuq nett; tagħhom moħbi.'),
    T('On your turn, <b>ask a yes/no question</b> about their character — "do they have a ' +
      'beard?", "is the hair red?". The answer is truthful. With a person opposite you can ' +
      'switch to <b>Talk</b>: ask out loud, they tap YES or NO, and you flip the faces yourself.',
      'Meta jmissek, <b>staqsi mistoqsija iva/le</b> fuq il-karattru tagħhom — "għandu daqna?", ' +
      '"ix-xagħar aħmar?". It-tweġiba hija vera. Ma’ persuna maġenbek tista’ taqleb għal <b>Bil-fomm</b>: ' +
      'staqsi bil-fomm, huma jagħfsu IVA jew LE, u int taqleb il-wċuħ waħdek.'),
    T('Faces that <b>do not fit</b> the answer flip down, so what is left is who they could be.',
      'Il-wċuħ li <b>ma jaqblux</b> mat-tweġiba jinqalbu, u dak li jibqa’ huma min jistgħu jkunu.'),
    T('When you are sure, tap <b>Guess</b> and pick a face. Guess right and you <b>win</b>; ' +
      'guess wrong and you <b>lose</b> — so be sure.',
      'Meta tkun ċert, agħfas <b>Aqta’</b> u agħżel wiċċ. Aqta’ sew u <b>tirbaħ</b>; aqta’ ħażin u ' +
      '<b>titlef</b> — mela kun ċert.'),
    T('You can also flip any face down or up yourself by tapping it — it is your board to keep.',
      'Tista’ wkoll taqleb kull wiċċ int stess billi tagħfsu — it-tabellun tiegħek biex iżżomm.')
  ];
}

/* ═══════════════════════════════════════════════════════════════════
   THE ENTRY SCREEN — MINIMAL. PLAY ONLINE (top) / PLAY WITH AI / PASS
   THE PHONE + a sliding How-to-play. Nothing else.
   ═══════════════════════════════════════════════════════════════════ */
function setupSheet(){
  injectCSS();
  P.show();
  stopThinking(); M = null; UI = null;
  const el = P.ui.screenEl();
  const online = canGoOnline();
  /* a little hero: eight faces, a couple flipped, as a badge */
  const heroFaces = [];
  for (let k = 0; k < 8; k++){
    const dn = (k === 2 || k === 5) ? ' dn' : '';
    heroFaces.push('<div class="mh-hface' + dn + '">' + faceHTML((k * 3) % E.N) + '</div>');
  }

  el.innerHTML =
    '<div class="pt-wrap mh-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="mh-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>MIN HU?</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="mh-hero" aria-hidden="true">' + heroFaces.join('') + '</div>' +
      '<p class="blurb">' +
        T('You both hold a secret face. Ask yes/no questions, flip the ones that do not fit, ' +
          'and be the first to guess who the other one is.',
          'It-tnejn iżżommu wiċċ sigriet. Staqsi mistoqsijiet iva/le, aqleb dawk li ma jaqblux, ' +
          'u kun l-ewwel wieħed li jaqta’ min hu l-ieħor.') +
      '</p>' +

      (ST.save
        ? '<button class="btn primary" id="mh-res" style="margin:2px 0 12px">' +
          esc(T('Carry on the saved round', 'Kompli r-rawnd imħażen')) + '</button>'
        : '') +

      '<div class="mh-modes" style="display:grid;gap:9px;margin-top:4px">' +
        (online
          ? '<button class="btn primary" id="mh-online">' + ico('users') + ' ' +
            esc(T('Play online', 'Ilgħab onlajn')) + '</button>'
          : '') +
        '<button class="btn' + (online ? ' ghost' : ' primary') + '" id="mh-ai">' +
          ico('dice') + ' ' + esc(T('Play with the machine', 'Ilgħab mal-magna')) + '</button>' +
        '<button class="btn ghost" id="mh-pnp">' + ico('users') + ' ' +
          esc(T('Pass the phone', 'Għaddi t-telefon')) + '</button>' +
        '<button class="btn ghost" id="mh-rulesbtn">' + ico('book') + ' ' +
          esc(T('How to play', 'Kif tilgħab')) + '</button>' +
      '</div>' +

      (ST.rec.w + ST.rec.l
        ? '<p class="pt-ledger" style="margin-top:14px">' +
          T('Rounds so far: <b>' + ST.rec.w + '</b> won, <b>' + ST.rec.l + '</b> lost.',
            'Rawnds s’issa: <b>' + ST.rec.w + '</b> rebħin, <b>' + ST.rec.l + '</b> mitlufin.') +
          '</p>'
        : '') +
    '</div>' +

    /* the rules slide-up */
    '<div class="mh-sheet" id="mh-menurules" aria-hidden="true">' +
      '<div class="mh-sheet-h"><h4>MIN HU? — ' + esc(T('the rules', 'ir-regoli')) + '</h4>' +
        '<button class="mh-sheet-x" id="mh-menurules-x" aria-label="' + esc(T('Close', 'Agħlaq')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button></div>' +
      '<div class="mh-sheet-b"><ul style="margin:0;padding:0">' +
        rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul></div>' +
    '</div>' +
    '</div>';

  el.querySelector('#mh-back').onclick = () => { cue('ui.back'); P.hub(); };
  const on = el.querySelector('#mh-online');
  if (on) on.onclick = () => { if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('minhu'); };
  el.querySelector('#mh-ai').onclick  = () => offlineSetup('ai');
  el.querySelector('#mh-pnp').onclick = () => offlineSetup('pnp');
  const rs = el.querySelector('#mh-res');
  if (rs) rs.onclick = () => { if (ST.save) newGame(null, ST.save); };

  const rules = el.querySelector('#mh-menurules');
  const openR = o => {
    rules.classList.toggle('open', o);
    rules.setAttribute('aria-hidden', o ? 'false' : 'true');
    cue(o ? 'ui.sheet' : 'ui.back', { gain:0.8 });
  };
  el.querySelector('#mh-rulesbtn').onclick = () => openR(!rules.classList.contains('open'));
  el.querySelector('#mh-menurules-x').onclick = () => openR(false);

  if (window.KARTI_LANG && KARTI_LANG.onChange && !setupSheet._sub){
    setupSheet._sub = KARTI_LANG.onChange(() => {
      try { if (!M && el.isConnected && el.querySelector('#mh-ai')) setupSheet();
            else if (M && UI){ buildGrid(); render(); } } catch(e){}
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════
   OFFLINE OPTIONS — the ONE small step: for AI, how sharp the machine is;
   for pass-the-phone, nothing to choose (two players, one device). A big
   START.
   ═══════════════════════════════════════════════════════════════════ */
function offlineSetup(mode){
  injectCSS();
  P.show();
  const el = P.ui.screenEl();
  const p = pref();
  let lvl = p.lvl || 2;

  function paint(){
    el.innerHTML =
      '<div class="pt-wrap mh-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="mh-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(mode === 'pnp' ? T('Pass the phone', 'Għaddi t-telefon')
                                    : T('Play the machine', 'Ilgħab mal-magna')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +
        (mode === 'ai'
          ? '<div class="tiny pt-lbl">' + esc(T('How sharp is the machine', 'Kemm hi taħraq il-magna')) + '</div>' +
            '<div class="pt-opts" id="mh-lvl">' + levels().map(o =>
              '<button class="pt-opt' + (o.level === lvl ? ' on' : '') + '" data-lvl="' + o.level + '">' +
              ico(o.icon || ('diff-' + Math.min(3, o.level))) +
              '<b>' + esc(o.name) + '</b><i>' + esc(TE(o.note)) + '</i></button>').join('') +
            '</div>'
          : '<p class="blurb">' +
              T('Two players, one phone. Each of you looks at your own board on your turn — ' +
                'hand it over after every question so nobody sees the other\'s secret.',
                'Żewġ plejers, telefon wieħed. Kull wieħed iħares lejn it-tabellun tiegħu meta ' +
                'jmissu — għaddi t-telefon wara kull mistoqsija biex ħadd ma jara s-sigriet tal-ieħor.') +
            '</p>') +

        '<div class="pt-acts" style="margin-top:18px;display:grid;gap:9px">' +
          '<button class="btn primary" id="mh-go">' +
            esc(mode === 'pnp' ? T('Start', 'Ibda') : T('Play', 'Ilgħab')) + '</button>' +
        '</div>' +
      '</div></div>';

    el.querySelector('#mh-back').onclick = () => { cue('ui.back'); setupSheet(); };
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { lvl = +b.dataset.lvl; paint(); });
    el.querySelector('#mh-go').onclick = () => {
      pref({ lvl });
      /* both players now CHOOSE their own face (not dealt). The pick flow
         handles pass-the-phone handovers and the AI self-picking. */
      offlinePickFlow(mode === 'pnp' ? 'pnp' : 'ai', lvl);
    };
  }
  paint();
}

function canGoOnline(){
  try {
    const MP = window.KARTI_MP;
    return !!(MP && MP.openFor && P.online && P.online.minhu);
  } catch(e){ return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   THE PICK SCREEN — CHOOSE YOUR OWN SECRET FACE (not dealt).
   A grid of all faces; tap one to choose, or "Surprise me" for a random.
   Used by every mode:
     · pass-the-phone: a handover curtain, then P1 picks (hidden), a second
       handover, then P2 picks (hidden) — neither sees the other's choice.
     · vs-AI: the human picks; the AI picks its OWN face with randomChar()
       (its choice never shown), then the board opens.
     · online: THIS seat picks LOCALLY and self-injects its own secret; the
       pick NEVER crosses the wire, so the opponent's client cannot hold it.
   onDone(charIndex) receives the chosen index.
   ═══════════════════════════════════════════════════════════════════ */
function pickGridHTML(sel){
  return E.ROSTER.map((c, i) =>
    '<button class="mh-ptile' + (sel === i ? ' sel' : '') + '" data-c="' + i + '" ' +
      'aria-label="' + esc(nameOf(i)) + '">' +
      faceHTML(i) + '<span class="mh-nm">' + esc(nameOf(i)) + '</span>' +
    '</button>').join('');
}

/* render the pick UI into `el`. who: a {en,mt} label for whose pick it is. */
function pickScreen(el, who, onDone, onBack){
  injectCSS();
  let sel = -1;
  el.innerHTML =
    '<div class="pt-wrap mh-menu" style="height:100%">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="mh-pback" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + esc(T('Pick your face', 'Agħżel wiċċek')) + '</h2>' +
    '</div>' +
    '<div class="mh-pick">' +
      '<div class="mh-pick-h"><b>' + esc(who ? TE(who) : T('Choose your secret character', 'Agħżel il-karattru sigriet tiegħek')) + '</b>' +
        '<i>' + esc(T('Tap a face to make it yours. The opponent never sees it.',
                      'Agħfas wiċċ biex tagħmlu tiegħek. L-avversarju qatt ma jarah.')) + '</i></div>' +
      '<div class="mh-pickbox"><div class="mh-pgrid" id="mh-pgrid">' + pickGridHTML(-1) + '</div></div>' +
      '<div class="mh-pickdock">' +
        '<button class="mh-btn guess" id="mh-prand">' + ico('dice') + ' ' +
          esc(T('Surprise me', 'Aħsibli int')) + '</button>' +
        '<button class="mh-btn ask" id="mh-pgo" disabled>' +
          esc(T('This is me', 'Dan jien')) + '</button>' +
      '</div>' +
    '</div></div>';

  const grid = el.querySelector('#mh-pgrid');
  const goBtn = el.querySelector('#mh-pgo');
  function paintSel(){
    grid.querySelectorAll('.mh-ptile').forEach(t =>
      t.classList.toggle('sel', (t.getAttribute('data-c') | 0) === sel && sel >= 0));
    goBtn.disabled = !(sel >= 0);
  }
  grid.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('.mh-ptile');
    if (!b) return;
    sel = b.getAttribute('data-c') | 0;
    cue('ui.tap', { gain:0.6 });
    paintSel();
  });
  el.querySelector('#mh-prand').onclick = () => {
    sel = E.randomChar(newSeed());
    cue('ui.toggle', { gain:0.7 });
    paintSel();
    /* scroll the chosen one into view so the player sees who they got */
    const t = grid.querySelector('.mh-ptile.sel');
    if (t && t.scrollIntoView) try { t.scrollIntoView({ block:'center' }); } catch(e){}
  };
  goBtn.onclick = () => { if (sel >= 0){ cue('card.deal', { gain:0.7 }); onDone(sel); } };
  const pb = el.querySelector('#mh-pback');
  if (pb) pb.onclick = () => { cue('ui.back'); if (onBack) onBack(); };
}

/* a full-screen handover curtain — pass-the-phone secrecy between picks. */
function handover(el, who, onReady){
  injectCSS();
  el.innerHTML =
    '<div class="pt-wrap mh-menu" style="height:100%;position:relative">' +
      '<div class="mh-hand">' +
        '<b>' + esc(TE(who)) + '</b>' +
        '<p>' + esc(T('Pass the phone to this player. When only you can see the screen, tap below to pick your secret face — keep it hidden from the other one.',
                      'Għaddi t-telefon lil dan il-plejer. Meta int biss tara l-iskrin, agħfas hawn taħt biex tagħżel il-wiċċ sigriet tiegħek — żommu moħbi mill-ieħor.')) + '</p>' +
        '<button class="btn primary" id="mh-handgo">' + esc(T('I\'m ready — pick', 'Lest — agħżel')) + '</button>' +
      '</div>' +
    '</div>';
  el.querySelector('#mh-handgo').onclick = () => { cue('ui.tap'); onReady(); };
}

/* the OFFLINE pick flow: pass-the-phone (two picks with handovers) or
   vs-AI (one human pick, AI self-picks). Ends by starting the match. */
function offlinePickFlow(mode, lvl){
  injectCSS();
  P.show();
  const el = P.ui.screenEl();
  if (mode === 'ai'){
    pickScreen(el, { en:'Choose your secret character', mt:'Agħżel il-karattru sigriet tiegħek' },
      human => {
        const aiPick = E.randomChar(newSeed());               /* the AI picks its OWN, hidden */
        const base = { humans:1, lvl };
        newGame(E.pickedOpts(base, { 0:human, 1:aiPick }));
      },
      () => offlineSetup('ai'));
    return;
  }
  /* pass-the-phone: P1 handover → P1 picks → P2 handover → P2 picks → start */
  const picks = {};
  const P1 = { en:'Player 1', mt:'Plejer 1' }, P2 = { en:'Player 2', mt:'Plejer 2' };
  handover(el, { en:'Player 1 — get ready', mt:'Plejer 1 — lesti' }, () => {
    pickScreen(el, { en:'Player 1, choose your face', mt:'Plejer 1, agħżel wiċċek' },
      p1 => {
        picks[0] = p1;
        handover(el, { en:'Player 2 — get ready', mt:'Plejer 2 — lesti' }, () => {
          pickScreen(el, { en:'Player 2, choose your face', mt:'Plejer 2, agħżel wiċċek' },
            p2 => {
              picks[1] = p2;
              newGame(E.pickedOpts({ humans:2, lvl }, { 0:picks[0], 1:picks[1] }));
            },
            () => offlineSetup('pnp'));
        });
      },
      () => offlineSetup('pnp'));
  });
  void P1; void P2;
}

/* ═══════════════════════════════════════════════════════════════════
   START A LOCAL GAME
   ═══════════════════════════════════════════════════════════════════ */
function newGame(opts, snap){
  injectCSS();
  P.show();
  const m = snap ? (snap.opts ? startMatch(snap.opts, snap.seed, snap.log) : null)
                 : startMatch(opts);
  if (!m){ setupSheet(); return; }
  M.meta = M.st.seats.map((s, i) => ({
    name: i === 0 ? T('You', 'Int') : (s.own === 'ai' ? levelName(s.lvl) : T('Player 2', 'Plejer 2')),
    own: s.own, lvl: s.lvl
  }));
  applyMeta();
  M.finished = false;
  openBoard(() => setupSheet());
  cue('card.deal', { gain:0.9 }, true);
}

/* ═══════════════════════════════════════════════════════════════════
   ONLINE — real 1v1 tables, the secret kept by the wire. The relay hands
   each seat ONE secret character privately (planDeal → the relay's per-
   seat push → the private hook). Questions are answered by the ANSWERING
   phone and echoed with the answer bit stamped; the shape mirrors poker.
   ═══════════════════════════════════════════════════════════════════ */
let NET = null;

function planDeal(opts){ return E.planDeal(opts); }

function onlineStart(cfg){
  cfg = cfg || {};
  const chairs = (cfg.seats || []).filter(Boolean);
  const n = chairs.length;
  if (n !== 2) throw new Error('MIN HU is 1v1, not ' + n);

  const toGame = {}, toRoom = [];
  chairs.forEach((s, g) => {
    const room = (typeof s.seat === 'number') ? s.seat : g;
    toGame[room] = g; toRoom[g] = room;
  });
  const meG = (toGame[cfg.you] !== undefined) ? toGame[cfg.you] : 0;
  const iAmHost = (cfg.you === (cfg.host | 0));
  const lvl = (chairs.map(s => s && s.level).find(v => v)) || 2;

  stopThinking();
  if (M){ try { leave(); } catch(e){} }

  /* PRIVATE from the off — no secret known until the relay pushes ours */
  const opts = { humans:0, lvl, deal:'private', given:{ secret:{} } };
  const m = startMatch(opts, cfg.seed >>> 0);
  if (!m) throw new Error('MIN HU would not deal');
  M.online = { toGame, toRoom, meG };
  M.meta = chairs.map((s, g) => ({
    name: String(s.name || ('Player ' + (g + 1))).slice(0, 14),
    own:  g === meG ? 'me' : (s.kind === 'cpu' ? 'ai' : 'net'),
    lvl:  s.level || lvl
  }));
  applyMeta();

  NET = Object.assign({}, cfg.net, { host: iAmHost, toGame, toRoom, me: meG });
  M.net = NET;
  M.finished = false;
  M.pickedOwn = false;      /* becomes true once THIS seat has chosen locally */
  injectCSS();
  P.show();

  /* ONLINE PICK-YOUR-OWN. This seat chooses its own secret LOCALLY and we
     inject it right here on this device — the pick NEVER crosses the wire,
     so the opponent's client can never hold it (stronger than a relay deal,
     which we no longer need). The opponent picks on their own phone in
     parallel. If the relay still pushes a per-seat secret (legacy), the
     private hook honours it only until this seat has picked. */
  const el = P.ui.screenEl();
  pickScreen(el, { en:'Choose your secret character', mt:'Agħżel il-karattru sigriet tiegħek' },
    mine => {
      M.pickedOwn = true;
      const secret = {}; secret[meG] = mine;
      M.opts = Object.assign({}, M.opts, { deal:'private', given:{ secret } });
      M.log = [];
      M.st = buildState(M.opts, M.seed, M.log);
      applyMeta();
      M.recorded = false;
      openBoard(() => { const nx = NET; leave(); if (nx && nx.onLeave) nx.onLeave(); else P.hub(); });
      render();
      cue('game.start', { gain:0.9 }, true);
    },
    () => { const nx = NET; leave(); if (nx && nx.onLeave) nx.onLeave(); else P.hub(); });
  return snapshot();
}

/* THE PRIVATE SECRET. The relay pushed THIS seat, and only this seat, its
   own character index (mp.js routes {t:'mine'} here). Re-deal with it
   injected under our game seat — the opponent stays null — and repaint.
   This is the ONLY place this client learns a secret, and it is its own. */
function onlinePrivate(d){
  if (!M || M.dead || !M.online) return;
  if (M.pickedOwn) return;            /* this seat already CHOSE its own face locally */
  const val = Array.isArray(d) ? (d[0] | 0) : (d | 0);
  if (!(val >= 0 && val < E.N)) return;
  const me = M.online.meG;
  const secret = {}; secret[me] = val;
  M.opts = Object.assign({}, M.opts, { deal:'private', given:{ secret } });
  M.log = [];
  M.st = buildState(M.opts, M.seed, M.log);
  applyMeta();
  M.recorded = false;
  buildGrid();
  render();
  cue('card.deal', { gain:0.8 }, true);
}

/* a move from the other chair, gated by the engine. An 'ask' arriving from
   the opponent needs OUR truthful answer stamped before it is applied,
   because we are the only client that holds our own secret. So when we
   RECEIVE an opponent's ask with no answer, we compute it against our own
   secret and the wire echo (mp.js) carries it onward. Symmetrically our
   own outgoing ask leaves a undefined and the opponent stamps it. */
function onlineRemote(seat, wire){
  if (!M || M.dead || !NET) return null;
  const g = NET.toGame[seat];
  if (g === undefined) return { ok:false, why:'a move from a chair not at this table' };
  const mv = E.decWire(wire);
  if (!mv) return { ok:false, why:'a move this table does not know' };
  if (mv.t === 'quit'){ doQuit(g); render(); return null; }
  if (mv.t === 'ask' && mv.a === undefined){
    /* the opponent asked us; answer truthfully from OUR secret (the seat
       being asked about is us — opp(g) === our seat). */
    const mySeat = M.online.meG;
    if (E.opp(g) === mySeat && typeof M.st.secret[mySeat] === 'number'){
      mv.a = E.answer(M.st.secret[mySeat], { key:mv.key, val:mv.val });
    }
  }
  if (mv.t === 'guess' && mv.right === undefined){
    /* the opponent guessed OUR character; we judge against our secret */
    const mySeat = M.online.meG;
    if (E.opp(g) === mySeat && typeof M.st.secret[mySeat] === 'number'){
      mv.right = (mv.c === M.st.secret[mySeat]) ? 1 : 0;
    }
  }
  mv.seat = g;
  const r = doMove(g, mv, 'net');
  if (!r.ok) return { ok:false, why:String(r.err || 'refused') };
  /* if it was an ask we just answered, the answer must go back on the wire
     — mp.js re-broadcasts the stamped move via the onMove feed below. */
  render();
  return null;
}

function doQuit(g){
  if (!M || M.dead || E.over(M.st)) return;
  doMove(g, { t:'quit' }, 'net');
}

function onlineNote(text, tone){ if (M && M.ctx) P.ui.setNet(M.ctx, text || '', tone || ''); }
function onlineStop(why, tone){
  if (!M || M.dead || !M.ctx) return;
  const ctx = M.ctx;
  stopThinking();
  M.finished = true;
  P.ui.setNet(ctx, '', '');
  P.ui.result(ctx, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? T('No result', 'Ebda riżultat') : T('Cut off', 'Inqata’'),
    why: why || T('The game stopped.', 'Il-logħba waqfet.'),
    quip: T('Nobody lost anything.', 'Ħadd ma tilef xejn.'),
    buttons: [{ label: T('Back to the rooms', 'Lura fil-kmamar'), icon:'back', cls:'primary',
                go: () => { const nx = NET; leave(); if (nx && nx.onLeave) nx.onLeave(); else P.hub(); } }]
  });
}

const NET_HOOKS = {
  live:   () => !!(M && !M.dead && !E.over(M.st)),
  phase:  () => !M ? 'idle' : (E.over(M.st) ? 'over' : 'play'),
  seed:   () => (M ? M.seed : null),
  gameId: () => (M ? 'minhu' : null),
  turn:   () => (M && NET) ? (NET.toRoom[E.turn(M.st)] != null ? NET.toRoom[E.turn(M.st)] : -1) : -1,
  over:   () => (M ? E.over(M.st) : null),
  moveCount: () => (M ? M.log.length : 0),
  /* local moves go out; net/auto never echo back. A flip is BOOKKEEPING —
     it is a private view change, so flips are NOT forwarded (src 'local'
     flips from tile taps stay on this device). Only ask/guess/quit travel. */
  onMove: fn => {
    const f = info => {
      if (!M || M.dead || !NET || !info) return;
      if (info.src === 'net' || info.src === 'auto') return;
      if (info.move.t === 'flip') return;                 /* private board bookkeeping */
      const w = E.encWire(info.move.t === 'ask' && info.rec ? info.rec : info.move);
      if (!w) return;
      const room = NET.toRoom[info.seat];
      fn(w, { seat: (room == null ? info.seat : room), src: info.src });
    };
    moveSubs.push(f);
    return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); };
  },
  private: (d /*, mates */) => onlinePrivate(d),
  apply: (seat, wire) => onlineRemote(seat, wire),
  seatGone: seat => {
    if (!M || M.dead || !NET) return;
    const g = NET.toGame[seat];
    if (g === undefined) return;
    doQuit(g); render();
  }
};

P.online = P.online || {};
P.online.minhu = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  planDeal,
  live: () => NET_HOOKS.live(),
  hooks: NET_HOOKS
};

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — window.KARTI_MINHU.lobby. Read by js/mp.js.
   Online is a 2-seat table. Whether it is OPEN depends on the relay
   pushing a per-seat secret (planDeal → private hook) AND relaying the
   answer bit back on an ask. The plumbing is here and proven offline; if
   the relay does not yet route per-seat private deals, canStart says so.
   ═══════════════════════════════════════════════════════════════════ */
const ONLINE_READY = true;   /* the private hook + answer echo are wired; flip
                                to false if the relay is not yet routing them */

const LOBBY = {
  id:'minhu',
  name:'MIN HU?',
  mt:'Min Hu?',
  minSeats: E.MIN_SEATS,
  maxSeats: E.MAX_SEATS,
  levels: levels().map(L => ({ level:L.level, name:L.name, note:TE(L.note) })),
  defaultLevel: 2,
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu')
    ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    const list = (seatList || []).filter(Boolean);
    const n = list.length;
    if (!ONLINE_READY){
      return { ok:false, why: T(
        'MIN HU? online needs the server to deal each phone its own secret face — coming next. ' +
        'Play the machine for now.',
        'Min Hu? onlajn irid li s-server jagħti lil kull telefon il-wiċċ sigriet tiegħu — ġej. ' +
        'Ilgħab kontra l-magna għalissa.') };
    }
    if (n < 2) return { ok:false, why: T('MIN HU? is one against one.', 'Min Hu? hu wieħed kontra wieħed.') };
    if (n > 2) return { ok:false, why: T('Only two at this board.', 'Tnejn biss ma’ dan it-tabellun.') };
    const un = list.filter(x => x && x.kind !== 'cpu' && !x.ready);
    if (un.length) return { ok:false, why:(un.map(s => s.name || 'Somebody').join(' and ')) + ' ' +
      T('not ready yet.', 'għadhom mhux lesti.') };
    return { ok:true, why:'' };
  },
  start(seatsList, opts){
    return onlineStart({ seats: seatsList, seed: opts && opts.seed, you: 0, host: 0,
                         net: (opts && opts.net) || {} });
  },
  rulesHTML: () =>
    '<p>' + T('Two players, each choosing a secret character from the board. Ask yes/no questions ' +
      'about the other one\'s face and flip down whoever no longer fits.',
      'Żewġ plejers, kull wieħed jagħżel karattru sigriet mit-tabellun. Staqsi mistoqsijiet iva/le fuq ' +
      'il-wiċċ tal-ieħor u aqleb lil min ma jibqax jaqbel.') + '</p>' +
    '<p>' + T('Guess right and you win; guess wrong and you lose. First correct guess takes it.',
      'Aqta’ sew u tirbaħ; aqta’ ħażin u titlef. L-ewwel qatgħa tajba tirbaħ.') + '</p>',
  blurb: T('A secret face each. Ask, eliminate, and guess who they are first.',
           'Wiċċ sigriet kull wieħed. Staqsi, elimina, u aqta’ min huma l-ewwel.'),
  myName(){
    try {
      const nm = K.displayName && K.displayName();
      if (nm && String(nm).trim() && String(nm).trim().toLowerCase() !== 'guest')
        return String(nm).trim().slice(0, 14);
    } catch(e){}
    return T('You', 'Int');
  },
  wire: { fields: E.WIRE_FIELDS },
  takeback: false
};
R.lobby = LOBBY;

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF — one tile.
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'minhu', order:27, kind:'board', cat:'board',
  name:'MIN HU?', mt:'Min Hu?', icon:'users', status:'live',
  get tag(){
    return T('A secret face each. Ask yes/no questions, flip the faces that do not fit, and be ' +
             'first to guess who the other one is.',
             'Wiċċ sigriet kull wieħed. Staqsi mistoqsijiet iva/le, aqleb il-wċuħ li ma jaqblux, ' +
             'u kun l-ewwel li taqta’ min hu l-ieħor.') +
           (ST.save ? ' ' + T('There is a round half-played.', 'Hemm rawnd nofsu milgħub.') : '');
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

/* ── test hooks — inert unless the page is opened with ?minhutest ──── */
if (/[?&]minhutest\b/.test(location.search || '')){
  window.__MINHU_TEST = {
    setupSheet, offlineSetup, newGame, doMove, render, buildGrid,
    askQuestion, armGuess, submitGuess, openSheet, closeSheet,
    pickScreen, offlinePickFlow, handover, openTalk, talkAnswered, finishTalk,
    onlineStart, onlinePrivate, onlineRemote,
    get M(){ return M; }, get UI(){ return UI; },
    engine: E, LOBBY, hooks: NET_HOOKS, online: P.online.minhu, leave, viewSeat
  };
}

})();
