/* ═══════════════════════════════════════════════════════════════════
   KARTI — misteru-ui.js
   IL-MISTERU — the tappable murder-mystery on top of js/misteru.js's pure
   engine (window.KARTI_MISTERU.engine). This file is the screen, the
   runner and the wire; it follows js/erbgha-ui.js's / js/minhu-ui.js's
   shape deliberately: a match is (opts, seed, log), every move goes
   through one doMove() gate, and a rollback is cutting the log.

   WHAT THIS FILE IS
     · the shelf tile and the MINIMAL entry menu — a noir hero, three big
       buttons (PLAY ONLINE / PLAY WITH AI / PASS THE PHONE) and a sliding
       How-to-play. Players/case/AI-strength live on a small SECOND step
       (never a settings wall on screen one). A browsable CASE PICKER of
       all 50 cases.
     · the case intro card (victim + story), the deal animation, the
       suggestion picker, the "a card was shown to you" flip reveal, the
       detective NOTEBOOK (a tappable deduction grid), the accusation
       sequence and the dramatic SOLUTION reveal → rebbieh podium.
     · the runner: log, seed, autosave (karti_misteru_v1).
     · the online controller on KARTI_PARTY.online.misteru + the lobby
       contract on window.KARTI_MISTERU.lobby, both the shape js/mp.js reads.

   HIDDEN INFORMATION (read js/misteru.js's header first)
     The solution + every hand are secret. OFFLINE one device holds them
     all and shows each player only their own hand behind a HANDOVER
     curtain (pass-the-phone) or hides the AI hands (solo) — the same
     technique js/minhu-ui.js uses. ONLINE the relay deals privately per
     seat (each phone learns only its own hand; the host also learns the
     solution to judge accusations). See the PRIVATE-DEAL note at the
     bottom for the exact server plumbing this needs.

   HOUSE RULES OBEYED
     · borrows #scr-party through KARTI_PARTY, injects its own CSS once,
       never touches css/ or the tab bar's ancestors;
     · sounds only through KARTI_SFX ids that already exist (card.deal /
       card.open / board.flip for reveals, ui.tap for marks, duel.start /
       duel.boss for the accusation sting, game.win for the solve);
     · every player-visible string is a T(en,mt) pair at its call site;
     · the back arrow goes BACK — never a confirm popup.

   PORTRAITS: a suspect's face loads from art/misteru/<id>.png; until it
   exists the UI DRAWS a themed vector portrait from the suspect id, so the
   game is 100% playable with no art at all (js/minhu-ui.js's technique).
   Weapons and locations are drawn as themed vector icons.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_MISTERU;
if (!K || !P || !R || !R.engine) return;

const E = R.engine;
const esc = (K && K.esc) || (s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');
const clone = o => JSON.parse(JSON.stringify(o));

/* ── the one language switch (js/lang.js) ────────────────────────── */
const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
const TE = pair => pair ? T(pair.en, pair.mt) : '';

/* seat colours — up to six detectives, told apart at a glance */
const SEAT_HEX = ['#E23B4E','#F5A524','#3FA7D6','#7B5CD6','#3FB57A','#E06CB0'];
const seatHex = i => SEAT_HEX[i % SEAT_HEX.length];

/* ═══════════════════════════════════════════════════════════════════
   OUR CORNER OF localStorage — save, prefs, record (ludu/poker way).
   ═══════════════════════════════════════════════════════════════════ */
const STORE  = 'karti_misteru_v1';
const SAVE_V = 1;
let ST = { v:1, pref:{}, rec:{ w:0, l:0 }, save:null, notes:null };
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
  persistPending = setTimeout(() => { persistPending = 0;
    try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){} }, 0);
}
function persistNow(){
  if (persistPending){ clearTimeout(persistPending); persistPending = 0; }
  try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){}
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persistNow(); });
window.addEventListener('pagehide', persistNow);
function pref(patch){ if (patch){ Object.assign(ST.pref, patch); persist(); } return ST.pref; }
function saveSlot(snap){ ST.save = snap || null; persist(); }

/* the machine's sharpnesses, off the engine's LEVELS */
function levels(){ return (E.LEVELS || []).map(L => ({ level:L.k, name:L.name, note:L.note, icon:L.icon })); }
function levelName(k){ const L = levels().find(x => x.level === k); return (L && L.name) || 'DETECTIVE'; }

/* ═══════════════════════════════════════════════════════════════════
   SOUND — existing ids only (js/sfx.js). One gate so a fast run does not
   machine-gun the mixer.
   ═══════════════════════════════════════════════════════════════════ */
let cueAt = 0;
function cue(id, opts, big){
  const S = window.KARTI_SFX; if (!S) return;
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
const moveSubs = [];
function fireList(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }
function newSeed(){ return (E.newSeed ? E.newSeed() : (Math.random() * 0x100000000) >>> 0) >>> 0; }

function buildState(opts, seed, log){
  const st = E.deal(opts, seed);
  for (let i = 0; i < log.length; i++){
    const mv = log[i];
    const seat = (mv.seat != null) ? mv.seat : E.turn(st);
    if (!E.check(st, mv, seat)) continue;
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
    timer: 0, dead: false, finished: false, recorded: false,
    net: null, online: null,
    notes: {},                 /* per-seat hand-marks: notes[card] = '✓'|'✗'|'?' */
    reveal: null               /* a pending "card shown to you" flip */
  };
  M.st = buildState(M.opts, M.seed, M.log);
  return M;
}
function stopThinking(){ if (M && M.timer){ clearTimeout(M.timer); M.timer = 0; } }

function ownerOf(i){ if (!M || !M.st) return 'ai'; const s = M.st.seats[i]; return s ? s.own : 'ai'; }
const isLocal = i => { const o = ownerOf(i); return o === 'me' || o === 'hot'; };
function viewSeat(){
  if (!M || !M.st) return 0;
  if (M.online) return M.online.meG != null ? M.online.meG : E.meSeat(M.st);
  const turnS = E.turn(M.st);
  if (turnS >= 0 && isLocal(turnS)) return turnS;
  const me = M.st.seats.findIndex(s => s.own === 'me');
  return me < 0 ? 0 : me;
}
function seatName(i){
  if (!M || !M.st) return 'Detective ' + (i + 1);
  const s = M.st.seats[i];
  if (s.own === 'me') return T('You', 'Int');
  if (s.own === 'ai') return levelName(s.lvl) + ' ' + (i + 1);
  return s.name || ('Detective ' + (i + 1));
}

/* THE gate. Every move — thumb, machine, wire, replay — measured here. */
function doMove(seat, move, src){
  if (!M || M.dead) return { ok:false, err:'no game' };
  if (E.over(M.st) && move.t !== 'quit') return { ok:false, err:'game over' };
  if (!E.check(M.st, move, seat)) return { ok:false, err:'illegal move' };
  const rec = clone(move); rec.seat = seat;
  const idx = M.log.length;
  E.apply(M.st, rec);            /* engine stamps by/card/right onto rec */
  M.log.push(rec);
  autosave();
  fireList(moveSubs, { seat, move:clone(rec), rec, index:idx, src:src || 'local' });
  return { ok:true, index:idx, rec };
}
function snapshot(){
  if (!M) return null;
  return { v:SAVE_V, gid:'misteru', opts:clone(M.opts), seed:M.seed, log:clone(M.log), notes:clone(M.notes || {}) };
}
function autosave(){
  if (!M || M.net) return;
  if (E.over(M.st)){ saveSlot(null); return; }
  saveSlot(snapshot());
}

/* ═══════════════════════════════════════════════════════════════════
   PORTRAITS + ICONS — art/misteru/<id>.png with a drawn vector fallback.
   ═══════════════════════════════════════════════════════════════════ */
const ART = 'art/misteru/';
function shade(hex, pct){
  if (!hex || hex[0] !== '#' || hex.length < 7) return hex || '#000';
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = pct / 100;
  const adj = v => Math.max(0, Math.min(255, Math.round(v + (f < 0 ? v * f : (255 - v) * f))));
  r = adj(r); g = adj(g); b = adj(b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
/* a deterministic drawn suspect portrait (SVG) from the id — noir palette,
   a silhouette in a hat so a grid of drawn faces reads even with no art. */
function drawnSuspect(id){
  const idx = E.SUSPECTS.findIndex(s => s.id === id);
  const hue = (idx * 41 + 200) % 360;
  const skin = ['#e7bd97','#d3a074','#b07d54','#8a5a3b'][idx % 4];
  const coat = 'hsl(' + hue + ' 22% 26%)';
  const accent = 'hsl(' + ((hue + 40) % 360) + ' 45% 52%)';
  return '<svg class="ms-fsvg" viewBox="0 0 100 118" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
    '<rect x="0" y="0" width="100" height="118" rx="12" fill="hsl(' + hue + ' 24% 16%)"/>' +
    '<rect x="0" y="0" width="100" height="118" rx="12" fill="url(#ms-vg)"/>' +
    /* shoulders / coat */
    '<path d="M18 118 q0-26 32-30 q32 4 32 30 z" fill="' + coat + '"/>' +
    '<path d="M50 92 l-8 26 h16 z" fill="' + shade(coat, 12) + '"/>' +
    /* neck + head */
    '<rect x="44" y="78" width="12" height="12" rx="4" fill="' + shade(skin, -14) + '"/>' +
    '<ellipse cx="50" cy="58" rx="24" ry="27" fill="' + skin + '"/>' +
    '<ellipse cx="50" cy="58" rx="24" ry="27" fill="url(#ms-fg)"/>' +
    /* eyes in shadow (noir) */
    '<rect x="30" y="52" width="40" height="9" rx="4" fill="rgba(0,0,0,.34)"/>' +
    '<circle cx="42" cy="57" r="2.3" fill="#fff"/><circle cx="58" cy="57" r="2.3" fill="#fff"/>' +
    /* nose + mouth */
    '<path d="M50 60 l-3 8 h6 z" fill="' + shade(skin, -22) + '"/>' +
    '<path d="M43 74 q7 4 14 0" fill="none" stroke="' + shade(skin, -34) + '" stroke-width="2" stroke-linecap="round"/>' +
    /* fedora — the noir signature */
    '<path d="M22 40 q28-16 56 0 q-6-24-28-24 q-22 0-28 24 z" fill="' + shade(coat, -18) + '"/>' +
    '<path d="M16 41 q34 12 68 0 q0 7-34 9 q-34-2-34-9 z" fill="' + shade(coat, -26) + '"/>' +
    '<rect x="30" y="30" width="40" height="6" rx="3" fill="' + accent + '"/>' +
    '<defs>' +
    '<radialGradient id="ms-fg" cx="42%" cy="34%" r="72%"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="100%" stop-color="#000" stop-opacity="0.18"/></radialGradient>' +
    '<linearGradient id="ms-vg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.05"/><stop offset="1" stop-color="#000" stop-opacity="0.30"/></linearGradient>' +
    '</defs></svg>';
}
function suspectHTML(id){
  return '<span class="ms-fart">' + drawnSuspect(id) +
    '<img class="ms-fimg" alt="" loading="lazy" src="' + esc(ART + id + '.png') +
      '" onload="this.classList.add(\'ok\')" onerror="this.remove()"></span>';
}
/* a themed drawn icon for a weapon or location (no art needed) */
const WPATH = {
  ponta:'M50 20 L58 70 L50 92 L42 70 Z', kandelabru:'M46 24 h8 v40 h14 v8 h-36 v-8 h14 z',
  velenu:'M40 24 h20 v10 l6 40 a10 10 0 0 1 -32 0 l6 -40 z', habel:'M30 24 q40 20 0 40 q40 20 0 40',
  pistola:'M28 40 h34 v10 h-8 v22 h-10 v-22 h-16 z', imhadda:'M24 44 q0-12 14-12 h24 q14 0 14 12 v20 q0 12 -14 12 h-24 q-14 0 -14 -12 z',
  cavetta:'M30 30 h14 v20 h12 v-20 h14 v10 l-8 8 v40 h-24 v-40 l-8-8 z', flixkun:'M44 20 h12 v14 l8 16 v40 h-28 v-40 l8-16 z',
  labra:'M50 22 a6 6 0 1 1 -0.1 0 M50 34 v56', martell:'M30 28 h40 v14 h-14 v52 h-12 v-52 h-14 z',
  girlanda:'M28 34 q44 -8 44 24 q0 32 -44 24', petard:'M42 26 h16 v50 h-16 z M50 20 v-8'
};
function weaponIcon(id){
  const p = WPATH[id] || 'M40 40 h20 v20 h-20 z';
  const hue = (E.WEAPONS.findIndex(w => w.id === id) * 33 + 20) % 360;
  return '<svg class="ms-obj" viewBox="0 0 100 100" aria-hidden="true">' +
    '<rect x="0" y="0" width="100" height="100" rx="14" fill="hsl(' + hue + ' 22% 20%)"/>' +
    '<path d="' + p + '" fill="none" stroke="hsl(' + hue + ' 55% 66%)" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>' +
    '</svg>';
}
function locationIcon(id){
  const hue = (E.LOCATIONS.findIndex(l => l.id === id) * 37 + 140) % 360;
  return '<svg class="ms-obj" viewBox="0 0 100 100" aria-hidden="true">' +
    '<rect x="0" y="0" width="100" height="100" rx="14" fill="hsl(' + hue + ' 22% 20%)"/>' +
    '<path d="M20 54 L50 28 L80 54 v30 h-60 z" fill="none" stroke="hsl(' + hue + ' 55% 66%)" stroke-width="6" stroke-linejoin="round"/>' +
    '<rect x="42" y="62" width="16" height="22" fill="hsl(' + hue + ' 55% 66%)"/>' +
    '</svg>';
}
function cardArt(card){
  const cat = E.catOf(card), b = E.baseOf(card);
  if (cat === 's') return suspectHTML(b);
  if (cat === 'w') return weaponIcon(b);
  return locationIcon(b);
}
const cardName = card => TE(E.nameOfCard(card));

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party. Noir felt, gold
   accents, a case-file look.
   ═══════════════════════════════════════════════════════════════════ */
let cssDone = false;
function injectCSS(){
  if (cssDone) return; cssDone = true;
  const css = [
    '#scr-party .ms-menu{display:flex;flex-direction:column;height:100%;color:#f3ede0}',
    '#scr-party .ms-menu .scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:4px 14px 22px}',
    '#scr-party .ms-menu .tbar{display:flex;align-items:center;gap:10px;padding:10px 12px 6px}',
    '#scr-party .ms-menu .tbar h2{font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;letter-spacing:.06em;font-size:19px;margin:0}',
    '#scr-party .iconbtn{width:38px;height:38px;border-radius:11px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;flex:0 0 auto}',
    '#scr-party .iconbtn svg{width:20px;height:20px;stroke:#f3ede0;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}',
    '#scr-party .ms-hero{position:relative;border-radius:16px;overflow:hidden;padding:20px 16px;margin:8px 0 12px;background:radial-gradient(120% 90% at 30% 0,#3a2f52 0,#1a1622 70%);border:1px solid rgba(255,255,255,.08)}',
    '#scr-party .ms-hero .ms-lamp{position:absolute;top:-40px;right:16px;width:110px;height:150px;background:radial-gradient(closest-side,rgba(255,206,120,.34),transparent);pointer-events:none}',
    '#scr-party .ms-hero h1{font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;letter-spacing:.08em;font-size:30px;margin:0}',
    '#scr-party .ms-hero p{margin:6px 0 0;font-size:13px;color:#c9bfae;line-height:1.5}',
    '#scr-party .ms-hero .ms-sil{display:flex;gap:6px;margin-top:14px}',
    '#scr-party .ms-hero .ms-sil .ms-fart{width:44px;height:52px;border-radius:8px;overflow:hidden;flex:0 0 auto;box-shadow:0 4px 10px rgba(0,0,0,.35)}',
    '#scr-party .btn{border:none;border-radius:13px;padding:13px 16px;font-family:var(--disp,"Exo 2",sans-serif);font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;color:#fff}',
    '#scr-party .btn svg{width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:2.1}',
    '#scr-party .btn.primary{background:linear-gradient(180deg,#e0b84e,#c69528);color:#1a1410;box-shadow:0 6px 16px rgba(198,149,40,.32)}',
    '#scr-party .btn.ghost{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}',
    '#scr-party .ms-blurb{font-size:13px;color:#c9bfae;line-height:1.55;margin:0 0 10px}',
    '#scr-party .pt-ledger{font-size:12px;color:#a89f8e}',
    '#scr-party .ms-lbl{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#a89f8e;margin:14px 0 7px;font-weight:800}',
    '#scr-party .ms-opts{display:grid;gap:8px}',
    '#scr-party .ms-opt{display:flex;align-items:center;gap:11px;text-align:left;border-radius:12px;padding:11px 13px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#f3ede0}',
    '#scr-party .ms-opt.on{border-color:#e0b84e;background:rgba(224,184,78,.14)}',
    '#scr-party .ms-opt svg{width:22px;height:22px;flex:0 0 auto}',
    '#scr-party .ms-opt b{font-family:var(--disp,"Exo 2",sans-serif);font-size:14px;display:block}',
    '#scr-party .ms-opt i{font-style:normal;font-size:11.5px;color:#a89f8e;display:block;margin-top:1px}',
    '#scr-party .ms-count{display:flex;gap:8px;flex-wrap:wrap}',
    '#scr-party .ms-count button{width:44px;height:44px;border-radius:11px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#f3ede0;font-weight:900;font-size:16px}',
    '#scr-party .ms-count button.on{border-color:#e0b84e;background:rgba(224,184,78,.18);color:#fff}',
    /* case picker */
    '#scr-party .ms-cases{display:grid;gap:8px}',
    '#scr-party .ms-casetile{display:flex;gap:11px;align-items:flex-start;text-align:left;border-radius:13px;padding:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#f3ede0}',
    '#scr-party .ms-casetile.on{border-color:#e0b84e;background:rgba(224,184,78,.12)}',
    '#scr-party .ms-casetile .ms-cn{width:34px;height:34px;flex:0 0 auto;border-radius:9px;background:rgba(224,184,78,.16);color:#e0b84e;font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;display:flex;align-items:center;justify-content:center;font-size:15px}',
    '#scr-party .ms-casetile b{font-family:var(--disp,"Exo 2",sans-serif);font-size:14px;display:block;line-height:1.25}',
    '#scr-party .ms-casetile i{font-style:normal;font-size:11.5px;color:#a89f8e;display:block;margin-top:3px;line-height:1.4}',
    /* handover */
    '#scr-party .ms-hand{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;height:100%;padding:34px 26px;gap:14px}',
    '#scr-party .ms-hand b{font-family:var(--disp,"Exo 2",sans-serif);font-size:22px;font-weight:900}',
    '#scr-party .ms-hand p{color:#c9bfae;font-size:13.5px;line-height:1.55;max-width:320px}',
    /* the board */
    '#scr-party .ms-host{height:100%}',
    '#scr-party .ms-wrap{display:flex;flex-direction:column;height:100%;color:#f3ede0}',
    '#scr-party .ms-top{flex:0 0 auto;padding:8px 12px 4px}',
    '#scr-party .ms-seats{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}',
    '#scr-party .ms-seat{flex:0 0 auto;display:flex;align-items:center;gap:6px;border-radius:20px;padding:5px 11px 5px 6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);font-size:12px}',
    '#scr-party .ms-seat.turn{border-color:var(--sc,#e0b84e);box-shadow:0 0 0 2px var(--sc,#e0b84e) inset}',
    '#scr-party .ms-seat.out{opacity:.42}',
    '#scr-party .ms-seat .dot{width:12px;height:12px;border-radius:50%;background:var(--sc,#888);flex:0 0 auto}',
    '#scr-party .ms-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:2px 12px 12px}',
    '#scr-party .ms-strip{font-size:12.5px;color:#c9bfae;min-height:20px;padding:6px 12px;line-height:1.4}',
    '#scr-party .ms-dock{flex:0 0 auto;display:grid;gap:8px;padding:8px 12px 12px;grid-template-columns:1fr 1fr 1fr}',
    '#scr-party .ms-dock .btn{padding:12px 8px;font-size:13px}',
    /* my hand */
    '#scr-party .ms-myhand{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 4px}',
    '#scr-party .ms-chip{display:flex;align-items:center;gap:6px;border-radius:9px;padding:5px 9px 5px 5px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);font-size:12px}',
    '#scr-party .ms-chip .ms-fart,#scr-party .ms-chip .ms-obj{width:26px;height:26px;border-radius:6px;overflow:hidden;flex:0 0 auto}',
    '#scr-party .ms-fart{position:relative;display:inline-block}',
    '#scr-party .ms-fsvg,#scr-party .ms-obj{position:absolute;inset:0;width:100%;height:100%}',
    '#scr-party .ms-obj{position:static}',
    '#scr-party .ms-fimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0}',
    '#scr-party .ms-fimg.ok{opacity:1}',
    /* notebook grid */
    '#scr-party .ms-nb{width:100%;border-collapse:separate;border-spacing:0;font-size:12px}',
    '#scr-party .ms-nb th,#scr-party .ms-nb td{padding:0;text-align:center}',
    '#scr-party .ms-nb thead th{position:sticky;top:0;background:#1a1622;padding:5px 2px;font-size:10px;color:#c9bfae;font-weight:700}',
    '#scr-party .ms-nb .rowh{text-align:left;padding:5px 6px;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;color:#f3ede0}',
    '#scr-party .ms-nb .cathdr td{padding:7px 6px 2px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#e0b84e;text-align:left;font-weight:800}',
    '#scr-party .ms-cell{width:30px;height:30px;border-radius:7px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);font-size:15px;font-weight:800;color:#f3ede0;margin:2px auto;display:flex;align-items:center;justify-content:center}',
    '#scr-party .ms-cell.tick{color:#3fb57a;background:rgba(63,181,122,.12)}',
    '#scr-party .ms-cell.cross{color:#e23b4e;background:rgba(226,59,78,.12)}',
    '#scr-party .ms-cell.auto{opacity:.9;box-shadow:0 0 0 1px rgba(224,184,78,.4) inset}',
    '#scr-party .ms-cell.solc{box-shadow:0 0 0 2px #e0b84e inset}',
    /* sheet */
    '#scr-party .ms-sheet{position:absolute;left:0;right:0;bottom:0;background:#201a2b;border-top:1px solid rgba(255,255,255,.1);border-radius:16px 16px 0 0;transform:translateY(102%);transition:transform .28s cubic-bezier(.2,.8,.2,1);max-height:82%;display:flex;flex-direction:column;z-index:6}',
    '#scr-party .ms-sheet.open{transform:translateY(0)}',
    '#scr-party .ms-sheet-h{display:flex;align-items:center;justify-content:space-between;padding:12px 14px}',
    '#scr-party .ms-sheet-h h4{font-family:var(--disp,"Exo 2",sans-serif);margin:0;font-size:16px}',
    '#scr-party .ms-sheet-x{width:32px;height:32px;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center}',
    '#scr-party .ms-sheet-x svg{width:16px;height:16px;stroke:#f3ede0;fill:none;stroke-width:2.2}',
    '#scr-party .ms-sheet-b{overflow-y:auto;padding:2px 14px 18px}',
    '#scr-party .ms-pickrow{margin:10px 0}',
    '#scr-party .ms-pickrow .ms-lbl{margin:0 0 6px}',
    '#scr-party .ms-pickgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}',
    '#scr-party .ms-pk{border-radius:11px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);padding:6px;color:#f3ede0;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px}',
    '#scr-party .ms-pk.on{border-color:#e0b84e;background:rgba(224,184,78,.16)}',
    '#scr-party .ms-pk .ms-fart,#scr-party .ms-pk .ms-obj{width:100%;aspect-ratio:1;border-radius:8px;overflow:hidden}',
    '#scr-party .ms-pk span{text-align:center;line-height:1.1;max-height:26px;overflow:hidden}',
    /* case intro overlay */
    '#scr-party .ms-intro{position:absolute;inset:0;background:radial-gradient(120% 100% at 50% 0,#3a2f52,#120f1a);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px 26px;z-index:8;gap:12px}',
    '#scr-party .ms-intro .ms-file{font-size:11px;letter-spacing:.24em;color:#e0b84e;text-transform:uppercase}',
    '#scr-party .ms-intro h2{font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;font-size:26px;margin:0;line-height:1.15}',
    '#scr-party .ms-intro .ms-vic{font-size:13px;color:#f3ede0}',
    '#scr-party .ms-intro p{font-size:13.5px;color:#c9bfae;line-height:1.6;max-width:340px}',
    /* reveal flip */
    '#scr-party .ms-revl{position:absolute;inset:0;background:rgba(10,8,14,.86);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9;gap:14px;padding:26px}',
    '#scr-party .ms-revcard{width:150px;height:200px;border-radius:16px;background:#241d31;border:1px solid rgba(255,255,255,.14);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;transform:rotateY(90deg);transition:transform .5s cubic-bezier(.2,.8,.2,1);box-shadow:0 16px 40px rgba(0,0,0,.5)}',
    '#scr-party .ms-revcard.in{transform:rotateY(0)}',
    '#scr-party .ms-revcard .ms-fart,#scr-party .ms-revcard .ms-obj{width:104px;height:104px;border-radius:12px;overflow:hidden}',
    '#scr-party .ms-revcard b{font-family:var(--disp,"Exo 2",sans-serif);font-size:15px}',
    /* solution reveal */
    '#scr-party .ms-sol{display:flex;gap:10px;justify-content:center;margin:14px 0}',
    '#scr-party .ms-sol .ms-solc{width:88px;border-radius:12px;background:#241d31;border:1px solid #e0b84e;padding:8px;display:flex;flex-direction:column;align-items:center;gap:6px;transform:rotateY(90deg);transition:transform .55s cubic-bezier(.2,.8,.2,1)}',
    '#scr-party .ms-sol .ms-solc.in{transform:rotateY(0)}',
    '#scr-party .ms-sol .ms-solc .ms-fart,#scr-party .ms-sol .ms-solc .ms-obj{width:100%;aspect-ratio:1;border-radius:8px;overflow:hidden}',
    '#scr-party .ms-sol .ms-solc span{font-size:11px;text-align:center;color:#f3ede0}',
    '#scr-party .reduced .ms-revcard,#scr-party .reduced .ms-sol .ms-solc{transition:none!important}'
  ].join('');
  const el = document.createElement('style'); el.id = 'ms-css'; el.textContent = css;
  document.head.appendChild(el);
}

/* ═══════════════════════════════════════════════════════════════════
   THE ENTRY MENU — MINIMAL. PLAY ONLINE / PLAY WITH AI / PASS THE PHONE
   + a sliding How-to-play. Nothing else on screen one.
   ═══════════════════════════════════════════════════════════════════ */
function rulesFor(){
  return [
    T('A murder in the village. One <b>suspect</b>, one <b>weapon</b>, one <b>place</b> are the secret solution — set aside face-down.',
      'Delitt fir-raħal. <b>Suspettat</b> wieħed, <b>arma</b> waħda, <b>post</b> wieħed huma s-soluzzjoni sigrieta — imwarrba mimduda.'),
    T('The rest of the cards are dealt to the detectives. On your turn, <b>suggest</b> a suspect + weapon + place.',
      'Il-bqija tal-karti jitqassmu lid-detectives. Fuq id-dawra tiegħek, <b>issuġġerixxi</b> suspettat + arma + post.'),
    T('Going clockwise, the first detective holding any of those three must <b>show you one</b> — privately. That is how you learn a card is <b>not</b> the answer.',
      'Bl-arloġġ, l-ewwel detective li għandu waħda minn dawk it-tlieta jrid <b>jurik waħda</b> — privatament. Hekk titgħallem li karta <b>mhijiex</b> it-tweġiba.'),
    T('Mark your <b>notebook</b> — ✓ or ✗ — until only one suspect, weapon and place are left unexplained. Those are the solution.',
      'Immarka l-<b>ktejjeb</b> tiegħek — ✓ jew ✗ — sakemm jibqa\' suspettat, arma u post wieħed bla spjega. Dawk huma s-soluzzjoni.'),
    T('When you are sure, <b>accuse</b>. Right — you win and the truth is revealed. Wrong — you are out (but still show your cards).',
      'Meta tkun ċert, <b>akkuża</b>. Tajjeb — tirbaħ u l-verità tinkixef. Ħażin — toħroġ (imma xorta turi l-karti tiegħek).')
  ];
}
function canGoOnline(){
  try { const MP = window.KARTI_MP; return !!(MP && MP.openFor && P.online && P.online.misteru); }
  catch(e){ return false; }
}

function setupSheet(){
  injectCSS(); P.show();
  stopThinking(); M = null; UI = null;
  const el = P.ui.screenEl();
  const online = canGoOnline();
  const sil = [];
  for (let k = 0; k < 5; k++) sil.push('<span class="ms-fart">' + suspectHTML(E.SUSPECTS[(k * 3) % E.SUSPECTS.length].id) + '</span>');

  el.innerHTML =
    '<div class="ms-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="ms-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>IL-MISTERU</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="ms-hero"><div class="ms-lamp"></div>' +
        '<h1>IL-MISTERU</h1>' +
        '<p>' + T('A Maltese murder-mystery. Suggest, deduce, and be the first to name the killer, the weapon and the place.',
                  'Misteru ta\' delitt Malti. Issuġġerixxi, iddeduċi, u kun l-ewwel li ssemmi l-qattiel, l-arma u l-post.') + '</p>' +
        '<div class="ms-sil">' + sil.join('') + '</div>' +
      '</div>' +
      (ST.save
        ? '<button class="btn primary" id="ms-res" style="margin:0 0 12px;width:100%">' +
          esc(T('Carry on the saved case', 'Kompli l-każ imħażen')) + '</button>' : '') +
      '<div style="display:grid;gap:9px">' +
        (online ? '<button class="btn primary" id="ms-online">' + ico('users') + ' ' +
          esc(T('Play online', 'Ilgħab onlajn')) + '</button>' : '') +
        '<button class="btn' + (online ? ' ghost' : ' primary') + '" id="ms-ai">' + ico('search') + ' ' +
          esc(T('Play with detectives', 'Ilgħab mad-detectives')) + '</button>' +
        '<button class="btn ghost" id="ms-pnp">' + ico('users') + ' ' +
          esc(T('Pass the phone', 'Għaddi t-telefon')) + '</button>' +
        '<button class="btn ghost" id="ms-rulesbtn">' + ico('book') + ' ' +
          esc(T('How to play', 'Kif tilgħab')) + '</button>' +
      '</div>' +
      (ST.rec.w + ST.rec.l
        ? '<p class="pt-ledger" style="margin-top:14px">' +
          T('Cases so far: <b>' + ST.rec.w + '</b> solved, <b>' + ST.rec.l + '</b> lost.',
            'Każi s\'issa: <b>' + ST.rec.w + '</b> solvuti, <b>' + ST.rec.l + '</b> mitlufa.') + '</p>' : '') +
    '</div>' +
    '<div class="ms-sheet" id="ms-menurules" aria-hidden="true">' +
      '<div class="ms-sheet-h"><h4>' + esc(T('How to play', 'Kif tilgħab')) + '</h4>' +
        '<button class="ms-sheet-x" id="ms-menurules-x"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="ms-sheet-b"><ul style="margin:0;padding-left:18px;line-height:1.6;font-size:13px">' +
        rulesFor().map(r => '<li style="margin:0 0 8px">' + r + '</li>').join('') + '</ul></div>' +
    '</div>' +
    '</div>';

  el.querySelector('#ms-back').onclick = () => { cue('ui.back'); P.hub(); };
  const on = el.querySelector('#ms-online');
  if (on) on.onclick = () => { if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('misteru'); };
  el.querySelector('#ms-ai').onclick  = () => offlineSetup('ai');
  el.querySelector('#ms-pnp').onclick = () => offlineSetup('pnp');
  const rs = el.querySelector('#ms-res');
  if (rs) rs.onclick = () => { if (ST.save) resumeSaved(); };

  const rules = el.querySelector('#ms-menurules');
  const openR = o => { rules.classList.toggle('open', o); rules.setAttribute('aria-hidden', o ? 'false' : 'true');
    cue(o ? 'ui.sheet' : 'ui.back', { gain:0.8 }); };
  el.querySelector('#ms-rulesbtn').onclick = () => openR(!rules.classList.contains('open'));
  el.querySelector('#ms-menurules-x').onclick = () => openR(false);

  if (window.KARTI_LANG && KARTI_LANG.onChange && !setupSheet._sub){
    setupSheet._sub = KARTI_LANG.onChange(() => {
      try { if (!M && el.isConnected && el.querySelector('#ms-ai')) setupSheet();
            else if (M && UI) render(); } catch(e){}
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════
   OFFLINE OPTIONS — the small SECOND step: players (2–6), which CASE,
   AI strength (for solo). A browsable case picker of the 50.
   ═══════════════════════════════════════════════════════════════════ */
function offlineSetup(mode){
  injectCSS(); P.show();
  const el = P.ui.screenEl();
  const p = pref();
  let players = Math.max(2, Math.min(6, p.players || (mode === 'pnp' ? 3 : 4)));
  let lvl = p.lvl || 2;
  let caseId = Math.max(1, Math.min(E.CASES.length, p.caseId || 1));
  let pickerOpen = false;

  function paint(){
    const cs = E.caseOf(caseId);
    el.innerHTML =
      '<div class="ms-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="ms-back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(mode === 'pnp' ? T('Pass the phone', 'Għaddi t-telefon') : T('Play detectives', 'Ilgħab detectives')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<div class="ms-lbl">' + esc(T('Detectives', 'Detectives')) + '</div>' +
        '<div class="ms-count" id="ms-players">' +
          [2,3,4,5,6].map(n => '<button data-n="' + n + '"' + (n === players ? ' class="on"' : '') + '>' + n + '</button>').join('') +
        '</div>' +
        (mode === 'pnp'
          ? '<p class="ms-blurb" style="margin-top:8px">' +
             T('That many people at one phone. Hand it over when the curtain asks, so nobody sees another\'s hand.',
               'Daqstant nies fuq telefon wieħed. Għaddih meta l-purtiera titlob, biex ħadd ma jara l-id ta\' ħaddieħor.') + '</p>'
          : '<div class="ms-lbl">' + esc(T('AI strength', 'Saħħa tal-AI')) + '</div>' +
            '<div class="ms-opts" id="ms-lvl">' + levels().map(o =>
              '<button class="ms-opt' + (o.level === lvl ? ' on' : '') + '" data-lvl="' + o.level + '">' +
              ico(o.icon || ('diff-' + Math.min(3, o.level))) +
              '<span><b>' + esc(o.name) + '</b><i>' + esc(TE(o.note)) + '</i></span></button>').join('') + '</div>') +

        '<div class="ms-lbl">' + esc(T('The case', 'Il-każ')) + '</div>' +
        '<button class="ms-casetile on" id="ms-casebtn" style="width:100%">' +
          '<span class="ms-cn">' + cs.id + '</span>' +
          '<span style="flex:1"><b>' + esc(TE(cs.title)) + '</b><i>' + esc(TE(cs.victim)) + '</i></span>' +
          '<span style="align-self:center;color:#e0b84e">' + ico('search') + '</span>' +
        '</button>' +
        '<button class="btn ghost" id="ms-randcase" style="width:100%;margin-top:8px">' + ico('refresh') + ' ' +
          esc(T('Random case', 'Każ każwali')) + '</button>' +

        '<div style="margin-top:18px;display:grid;gap:9px">' +
          '<button class="btn primary" id="ms-go" style="width:100%">' +
            esc(mode === 'pnp' ? T('Start the case', 'Ibda l-każ') : T('Play', 'Ilgħab')) + '</button>' +
        '</div>' +
      '</div>' +

      /* the case picker sheet */
      '<div class="ms-sheet" id="ms-picker" aria-hidden="true">' +
        '<div class="ms-sheet-h"><h4>' + esc(T('Pick a case', 'Agħżel każ')) + '</h4>' +
          '<button class="ms-sheet-x" id="ms-picker-x"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<div class="ms-sheet-b"><div class="ms-cases" id="ms-caselist">' +
          E.CASES.map(c => '<button class="ms-casetile' + (c.id === caseId ? ' on' : '') + '" data-case="' + c.id + '">' +
            '<span class="ms-cn">' + c.id + '</span>' +
            '<span style="flex:1"><b>' + esc(TE(c.title)) + '</b><i>' + esc(TE(c.victim)) + '</i></span>' +
          '</button>').join('') +
        '</div></div>' +
      '</div>' +
      '</div>';

    el.querySelector('#ms-back').onclick = () => { cue('ui.back'); setupSheet(); };
    el.querySelectorAll('#ms-players button').forEach(b => b.onclick = () => { players = +b.dataset.n; cue('ui.tap'); paint(); });
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { lvl = +b.dataset.lvl; cue('ui.tap'); paint(); });
    el.querySelector('#ms-randcase').onclick = () => {
      caseId = 1 + (Math.floor(Math.random() * E.CASES.length));   /* menu-only, not gameplay RNG */
      cue('ui.tap'); paint();
    };
    const picker = el.querySelector('#ms-picker');
    const openP = o => { picker.classList.toggle('open', o); picker.setAttribute('aria-hidden', o ? 'false' : 'true');
      pickerOpen = o; cue(o ? 'ui.sheet' : 'ui.back', { gain:0.8 }); };
    el.querySelector('#ms-casebtn').onclick = () => openP(true);
    el.querySelector('#ms-picker-x').onclick = () => openP(false);
    el.querySelectorAll('[data-case]').forEach(b => b.onclick = () => { caseId = +b.dataset.case; cue('ui.tap'); openP(false); paint(); });
    if (pickerOpen) openP(true);

    el.querySelector('#ms-go').onclick = () => {
      pref({ players, lvl, caseId });
      offlineStartFlow(mode, { players, lvl, caseId });
    };
  }
  paint();
}

/* ═══════════════════════════════════════════════════════════════════
   THE HANDOVER CURTAIN — pass-the-phone secrecy between turns/deals.
   ═══════════════════════════════════════════════════════════════════ */
function handover(who, onReady){
  injectCSS();
  const el = P.ui.screenEl();
  el.innerHTML =
    '<div class="ms-menu"><div class="ms-hand">' +
      '<b>' + esc(TE(who)) + '</b>' +
      '<p>' + esc(T('Pass the phone to this detective. When only you can see the screen, tap to look at your hand — keep it hidden from the others.',
                    'Għaddi t-telefon lil dan id-detective. Meta int biss tara l-iskrin, agħfas biex tara l-id tiegħek — żommha moħbija mill-oħrajn.')) + '</p>' +
      '<button class="btn primary" id="ms-handgo">' + esc(T('I\'m ready', 'Lest')) + '</button>' +
    '</div></div>';
  el.querySelector('#ms-handgo').onclick = () => { cue('ui.tap'); onReady(); };
}

/* ═══════════════════════════════════════════════════════════════════
   START A LOCAL GAME (solo or pass-the-phone). Solo = 1 human + AI;
   pass-the-phone = all human seats.
   ═══════════════════════════════════════════════════════════════════ */
function offlineStartFlow(mode, cfg){
  const humans = mode === 'pnp' ? cfg.players : 1;
  const opts = { humans, players:cfg.players, lvl:cfg.lvl, caseId:cfg.caseId, deal:'seed' };
  startMatch(opts);
  M.notes = {};
  openBoard(() => { leave(); P.hub(); });
  caseIntro(() => { render(); afterMove(); });
}
function resumeSaved(){
  const snap = ST.save; if (!snap) return;
  startMatch(snap.opts, snap.seed, snap.log);
  M.notes = snap.notes || {};
  openBoard(() => { leave(); P.hub(); });
  render(); afterMove();
}

/* ═══════════════════════════════════════════════════════════════════
   THE CASE INTRO CARD — victim + story reveal before play.
   ═══════════════════════════════════════════════════════════════════ */
function caseIntro(done){
  if (!M || !M.ctx){ done && done(); return; }
  const cs = E.theCase(M.st);
  const host = M.ctx.host;
  const ov = document.createElement('div');
  ov.className = 'ms-intro';
  ov.innerHTML =
    '<div class="ms-file">' + esc(T('Case file no.', 'Fajl tal-każ nru.')) + ' ' + cs.id + '</div>' +
    '<h2>' + esc(TE(cs.title)) + '</h2>' +
    '<div class="ms-vic">' + esc(T('Victim:', 'Vittma:')) + ' <b>' + esc(TE(cs.victim)) + '</b></div>' +
    '<p>' + esc(TE(cs.story)) + '</p>' +
    '<button class="btn primary" id="ms-introgo" style="margin-top:6px">' + esc(T('Open the case', 'Iftaħ il-każ')) + '</button>';
  host.appendChild(ov);
  cue('duel.start', { gain:0.7 }, true);
  ov.querySelector('#ms-introgo').onclick = () => {
    cue('card.deal', { gain:0.8 }, true);
    ov.remove(); done && done();
  };
}

/* ═══════════════════════════════════════════════════════════════════
   THE BOARD
   ═══════════════════════════════════════════════════════════════════ */
function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: 'IL-MISTERU',
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'ms-nb',    label:T('Notebook', 'Ktejjeb'), icon:'book', cls:'ghost' },
      { id:'ms-rules', label:T('Rules', 'Regoli'),     icon:'search', cls:'ghost' }
    ]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();
  M.ctx.badge.textContent = M.net ? T('Online', 'Onlajn') : ('#' + M.st.caseId);
  buildBoard();
  M.ctx.btn('ms-nb').onclick = () => openNotebook();
  M.ctx.btn('ms-rules').onclick = () => openRules();
}

function buildBoard(){
  const ctx = M.ctx;
  ctx.host.classList.add('ms-host');
  ctx.host.innerHTML =
    '<div class="ms-wrap">' +
      '<div class="ms-top"><div class="ms-seats" id="ms-seats"></div></div>' +
      '<div class="ms-strip" id="ms-strip"></div>' +
      '<div class="ms-scroll" id="ms-scroll"></div>' +
      '<div class="ms-dock" id="ms-dock"></div>' +
      '<div class="ms-sheet" id="ms-sheet" aria-hidden="true">' +
        '<div class="ms-sheet-h"><h4 id="ms-sheet-t"></h4>' +
          '<button class="ms-sheet-x" id="ms-sheet-x"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<div class="ms-sheet-b" id="ms-sheet-b"></div>' +
      '</div>' +
    '</div>';
  UI = {
    ctx,
    seats:  ctx.host.querySelector('#ms-seats'),
    strip:  ctx.host.querySelector('#ms-strip'),
    scroll: ctx.host.querySelector('#ms-scroll'),
    dock:   ctx.host.querySelector('#ms-dock'),
    sheet:  ctx.host.querySelector('#ms-sheet'),
    sheetT: ctx.host.querySelector('#ms-sheet-t'),
    sheetB: ctx.host.querySelector('#ms-sheet-b')
  };
  ctx.host.querySelector('#ms-sheet-x').onclick = () => closeSheet();
  render();
}

function closeSheet(){ if (UI){ UI.sheet.classList.remove('open'); UI.sheet.setAttribute('aria-hidden', 'true'); cue('ui.back', { gain:0.7 }); } }
function openSheet(title){ if (!UI) return; UI.sheetT.textContent = title; UI.sheet.classList.add('open'); UI.sheet.setAttribute('aria-hidden', 'false'); cue('ui.sheet', { gain:0.8 }); }

/* the seat rail + turn indicator */
function paintSeats(){
  if (!UI) return;
  const st = M.st, t = E.turn(st);
  UI.seats.innerHTML = st.seats.map((s, i) =>
    '<div class="ms-seat' + (i === t ? ' turn' : '') + (st.out[i] ? ' out' : '') + '" style="--sc:' + seatHex(i) + '">' +
      '<span class="dot"></span>' + esc(seatName(i)) + (st.out[i] ? ' ' + esc(T('(out)', '(barra)')) : '') +
    '</div>').join('');
}

/* the main scroll body: your hand + a hint of the notebook */
function paintBody(){
  if (!UI) return;
  const st = M.st, view = viewSeat();
  const myHand = E.handOf(st, view) || [];
  const nb = E.notebookFor(st, view);
  const sol = nb.solution || {};
  UI.scroll.innerHTML =
    '<div class="ms-lbl">' + esc(T('Your hand', 'L-id tiegħek')) + '</div>' +
    '<div class="ms-myhand">' +
      (myHand.length ? myHand.map(c => '<span class="ms-chip">' + cardArt(c) + esc(cardName(c)) + '</span>').join('')
                     : '<span class="pt-ledger">' + esc(T('(hidden — tap "I\'m ready" on your turn)', '(moħbija — agħfas "Lest" fuq id-dawra tiegħek)')) + '</span>') +
    '</div>' +
    '<div class="ms-lbl">' + esc(T('What you have deduced', 'X\'iddeduċejt')) + '</div>' +
    '<div class="ms-myhand">' +
      E.CATS.map(cat => {
        const label = cat === 's' ? T('Suspect', 'Suspettat') : cat === 'w' ? T('Weapon', 'Arma') : T('Place', 'Post');
        const card = sol[cat];
        return '<span class="ms-chip" style="border-color:' + (card ? '#e0b84e' : 'rgba(255,255,255,.1)') + '">' +
          (card ? cardArt(card) + esc(cardName(card)) : '<b style="color:#a89f8e">' + esc(label) + ': ?</b>') + '</span>';
      }).join('') +
    '</div>' +
    '<p class="pt-ledger" style="margin-top:10px">' +
      esc(T('Open the Notebook to mark cards and work it out.', 'Iftaħ il-Ktejjeb biex timmarka l-karti u ssolviha.')) + '</p>';
}

/* the dock: Suggest / Accuse / Notebook — enabled only on your live turn */
function paintDock(){
  if (!UI) return;
  const st = M.st, view = viewSeat(), t = E.turn(st);
  const myTurn = (t === view) && !st.out[view] && !E.over(st) && isLocal(t) && !M.reveal;
  UI.dock.innerHTML =
    '<button class="btn ' + (myTurn ? 'primary' : 'ghost') + '" id="ms-suggest"' + (myTurn ? '' : ' disabled style="opacity:.5"') + '>' +
      ico('search') + ' ' + esc(T('Suggest', 'Issuġġerixxi')) + '</button>' +
    '<button class="btn ghost" id="ms-accuse"' + (myTurn ? '' : ' disabled style="opacity:.5"') + '>' +
      ico('flag') + ' ' + esc(T('Accuse', 'Akkuża')) + '</button>' +
    '<button class="btn ghost" id="ms-nbk">' + ico('book') + ' ' + esc(T('Notebook', 'Ktejjeb')) + '</button>';
  const sg = UI.dock.querySelector('#ms-suggest'), ac = UI.dock.querySelector('#ms-accuse'), nk = UI.dock.querySelector('#ms-nbk');
  if (sg && myTurn) sg.onclick = () => openPicker('suggest');
  if (ac && myTurn) ac.onclick = () => openPicker('accuse');
  if (nk) nk.onclick = () => openNotebook();
}

function paintStrip(){
  if (!UI) return;
  const st = M.st;
  let txt;
  if (E.over(st)){ txt = TE(E.note(st)); }
  else {
    const t = E.turn(st);
    const sug = st.lastSug;
    if (sug){
      const shower = (sug.by >= 0) ? seatName(sug.by) : T('nobody', 'ħadd');
      txt = T(seatName(sug.seat) + ' suggested ' + cardName(sug.s) + ', ' + cardName(sug.w) + ', ' + cardName(sug.l) + '. ',
              seatName(sug.seat) + ' issuġġerixxa ' + cardName(sug.s) + ', ' + cardName(sug.w) + ', ' + cardName(sug.l) + '. ') +
        (sug.by >= 0 ? T(shower + ' showed a card.', shower + ' wera karta.') : T('No one could show a card!', 'Ħadd ma seta\' juri karta!'));
    } else {
      txt = (t === viewSeat()) ? TE(E.note(st)) : T(seatName(t) + ' is thinking…', seatName(t) + ' qed jaħseb…');
    }
  }
  UI.strip.innerHTML = esc(txt);
}

function render(){
  if (!M || !UI) return;
  paintSeats(); paintStrip(); paintBody(); paintDock();
}

/* ═══════════════════════════════════════════════════════════════════
   THE SUGGESTION / ACCUSATION PICKER — pick a suspect + weapon + place.
   ═══════════════════════════════════════════════════════════════════ */
let pickerSel = { s:null, w:null, l:null };
function openPicker(kind){
  const st = M.st, cs = E.theCase(st);
  pickerSel = { s:null, w:null, l:null };
  const rowFor = (cat, title) => {
    const ids = cs[cat];
    return '<div class="ms-pickrow"><div class="ms-lbl">' + esc(title) + '</div>' +
      '<div class="ms-pickgrid" data-cat="' + cat + '">' +
        ids.map(id => { const card = E.cardOf(cat, id);
          return '<button class="ms-pk" data-card="' + esc(card) + '">' + cardArt(card) +
            '<span>' + esc(TE(E.nameOfCard(card))) + '</span></button>'; }).join('') +
      '</div></div>';
  };
  UI.sheetB.innerHTML =
    rowFor('s', T('Suspect', 'Suspettat')) +
    rowFor('w', T('Weapon', 'Arma')) +
    rowFor('l', T('Place', 'Post')) +
    (kind === 'accuse'
      ? '<p class="pt-ledger" style="margin:8px 0 0">' + esc(T('Warning: a wrong accusation puts you out of the game.', 'Twissija: akkuża ħażina toħroġk mil-logħba.')) + '</p>' : '') +
    /* pinned footer: the confirm button stays visible at the bottom of the
       sheet even before you scroll past the cards (else it hid below the fold
       and a suggestion looked like it "did nothing"). */
    '<div style="position:sticky;bottom:0;left:0;right:0;background:#201a2b;padding:10px 0 4px;margin-top:8px;box-shadow:0 -12px 16px -6px rgba(0,0,0,.6)">' +
      '<button class="btn primary" id="ms-pickgo" style="width:100%" disabled>' +
        esc(kind === 'accuse' ? T('Accuse', 'Akkuża') : T('Suggest', 'Issuġġerixxi')) + '</button>' +
    '</div>';
  openSheet(kind === 'accuse' ? T('Make your accusation', 'Agħmel l-akkuża tiegħek') : T('Make a suggestion', 'Agħmel suġġeriment'));

  const go = UI.sheetB.querySelector('#ms-pickgo');
  UI.sheetB.querySelectorAll('.ms-pickgrid').forEach(grid => {
    const cat = grid.dataset.cat;
    grid.querySelectorAll('.ms-pk').forEach(b => b.onclick = () => {
      grid.querySelectorAll('.ms-pk').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); pickerSel[cat] = b.dataset.card; cue('ui.tap');
      go.disabled = !(pickerSel.s && pickerSel.w && pickerSel.l);
      go.style.opacity = go.disabled ? '.5' : '1';
    });
  });
  go.onclick = () => {
    if (!(pickerSel.s && pickerSel.w && pickerSel.l)) return;
    closeSheet();
    const view = viewSeat();
    if (kind === 'accuse') doAccuse(view, pickerSel);
    else doSuggest(view, pickerSel);
  };
}

/* a local suggestion.
     OFFLINE: the engine resolves the refuter + shown card here.
     ONLINE : the move is NOT self-applied (a local engine can't referee it).
       · non-host → whisper a compact request to the host on 'ms-req'; wait
         for the host's authoritative echo (the board updates on the echo).
       · host     → referee it directly (resolve, apply, broadcast, whisper). */
function doSuggest(seat, sel){
  cue('card.throw', { gain:0.8 }, true);
  if (M.online){ sendMoveOnline('sug', seat, sel); return; }
  const res = doMove(seat, { t:'suggest', s:sel.s, w:sel.w, l:sel.l }, 'local');
  if (!res.ok){ cue('ui.error'); return; }
  const rec = res.rec;
  /* if a card was shown TO ME, flip-reveal it and auto-mark the notebook */
  if (rec.by >= 0 && rec.card && rec.seat === seat){
    showRevealTo(rec.card, rec.by, () => { autoMark(rec.card, 'cross'); render(); afterMove(); });
  } else {
    render(); afterMove();
  }
}
function doAccuse(seat, sel){
  cue('duel.boss', { gain:0.9 }, true);
  if (M.online){ sendMoveOnline('acc', seat, sel); return; }
  const res = doMove(seat, { t:'accuse', s:sel.s, w:sel.w, l:sel.l }, 'local');
  if (!res.ok){ cue('ui.error'); return; }
  render();
  if (E.over(M.st)) { finish(); return; }
  afterMove();
}
/* ONLINE dispatch for a locally-chosen suggest/accuse. A non-host sends the
   host a private request; the host (already knowing every hand + solution)
   referees it as if it arrived as a request from its own seat. Neither path
   advances the local engine speculatively — the board updates only when the
   host's authoritative move arrives (over the net for non-hosts, in-place for
   the host inside hostReferee). */
function sendMoveOnline(kind, seat, sel){
  if (amHost()){
    hostReferee(seat, { kind, s:sel.s, w:sel.w, l:sel.l });
    return;
  }
  const str = encReq(kind, sel);
  const to = hostRoomSeat();
  if (str != null && to != null && NET && NET.whisper){ NET.whisper(to, str, WHISPER_REQ); }
  render();   /* reflect "waiting for the host" — the dock disables off-turn */
}

/* ═══════════════════════════════════════════════════════════════════
   THE "A CARD WAS SHOWN TO YOU" FLIP REVEAL.
   ═══════════════════════════════════════════════════════════════════ */
function showRevealTo(card, bySeat, done){
  if (!M || !M.ctx){ done && done(); return; }
  M.reveal = { card, by:bySeat };
  const host = M.ctx.host;
  const ov = document.createElement('div');
  ov.className = 'ms-revl';
  ov.innerHTML =
    '<div style="font-size:13px;color:#c9bfae">' + esc(seatName(bySeat)) + ' ' + esc(T('showed you:', 'werewk:')) + '</div>' +
    '<div class="ms-revcard" id="ms-revcard">' + cardArt(card) + '<b>' + esc(cardName(card)) + '</b></div>' +
    '<button class="btn primary" id="ms-revgo">' + esc(T('Got it', 'Fhimt')) + '</button>';
  host.appendChild(ov);
  const flip = () => { const c = ov.querySelector('#ms-revcard'); if (c) c.classList.add('in'); };
  if (reduced()){ ov.querySelector('#ms-revcard').classList.add('in'); }
  else requestAnimationFrame(() => setTimeout(flip, 20));
  cue('board.flip', { gain:0.85 }, true);
  ov.querySelector('#ms-revgo').onclick = () => { cue('ui.tap'); M.reveal = null; ov.remove(); done && done(); };
}

/* ═══════════════════════════════════════════════════════════════════
   THE DETECTIVE NOTEBOOK — a tappable deduction grid. Rows = every card
   in the case; columns = the players + the SOLUTION. Auto-fills your hand
   and any card shown TO you; hand-mark the rest. Smart auto-cross once a
   card is definitively located.
   ═══════════════════════════════════════════════════════════════════ */
function noteKey(card, col){ return card + '@' + col; }        /* col: seat index or 'sol' */
function getMark(card, col){ return (M.notes && M.notes[noteKey(card, col)]) || ''; }
function setMark(card, col, v){
  if (!M.notes) M.notes = {};
  const k = noteKey(card, col);
  if (v) M.notes[k] = v; else delete M.notes[k];
  autosave();
}
/* auto-mark a card shown to me: it is held (✓ in the shower's column) and
   therefore NOT the solution (✗ in the solution column). */
function autoMark(card, mode){
  const view = viewSeat();
  const rec = M.log.slice().reverse().find(r => r.t === 'suggest' && r.card === card && r.by >= 0 && r.seat === view);
  const by = rec ? rec.by : null;
  if (by != null) setMark(card, by, 'tick');
  setMark(card, 'sol', 'cross');
}
function openNotebook(){
  const st = M.st, cs = E.theCase(st), view = viewSeat();
  const nb = E.notebookFor(st, view);
  const myHand = E.handOf(st, view) || [];
  const cols = [];
  for (let i = 0; i < st.n; i++) cols.push({ id:i, label:(i === view ? T('Me', 'Jien') : (st.seats[i].own === 'ai' ? 'D' + (i + 1) : (st.seats[i].name || ('P' + (i + 1))).slice(0, 3))) });
  cols.push({ id:'sol', label:'?' });

  const catRows = cat => {
    const title = cat === 's' ? T('Suspects', 'Suspettati') : cat === 'w' ? T('Weapons', 'Armi') : T('Places', 'Postijiet');
    let html = '<tr class="cathdr"><td colspan="' + (cols.length + 1) + '">' + esc(title) + '</td></tr>';
    (cs[cat] || []).forEach(id => {
      const card = E.cardOf(cat, id);
      const isSolDed = nb.solution[cat] === card;               /* engine proved it the solution */
      html += '<tr><td class="rowh' + (isSolDed ? '" style="color:#e0b84e' : '') + '">' + esc(cardName(card)) + '</td>';
      cols.forEach(col => {
        let mark = getMark(card, col.id);
        let auto = false;
        /* auto-fill: my own hand → ✓ in my column, ✗ in solution */
        if (col.id === view && myHand.indexOf(card) >= 0){ mark = 'tick'; auto = true; }
        if (col.id === 'sol' && (myHand.indexOf(card) >= 0 || nb.status[card] === 'has')){ mark = 'cross'; auto = true; }
        if (col.id === 'sol' && isSolDed){ mark = 'tick'; auto = true; }
        const cls = 'ms-cell ' + (mark === 'tick' ? 'tick' : mark === 'cross' ? 'cross' : '') + (auto ? ' auto' : '') + (col.id === 'sol' && isSolDed ? ' solc' : '');
        const sym = mark === 'tick' ? '✓' : mark === 'cross' ? '✗' : (getMark(card, col.id) === '?' ? '?' : '');
        html += '<td><button class="' + cls + '"' + (auto ? ' disabled' : '') + ' data-card="' + esc(card) + '" data-col="' + col.id + '">' + sym + '</button></td>';
      });
      html += '</tr>';
    });
    return html;
  };

  UI.sheetB.innerHTML =
    '<p class="pt-ledger" style="margin:0 0 8px">' + esc(T('Tap a cell to cycle blank → ✓ → ✗ → ?. Your hand and cards shown to you fill in automatically.',
      'Agħfas ċella biex iddur vojt → ✓ → ✗ → ?. L-id tiegħek u l-karti murija lilek jimtlew waħedhom.')) + '</p>' +
    '<div style="overflow-x:auto"><table class="ms-nb"><thead><tr><th></th>' +
      cols.map(c => '<th>' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' +
      E.CATS.map(catRows).join('') +
    '</tbody></table></div>';
  openSheet(T('Detective notebook', 'Ktejjeb tad-detective'));

  UI.sheetB.querySelectorAll('.ms-cell[data-card]').forEach(b => {
    if (b.disabled) return;
    b.onclick = () => {
      const card = b.dataset.card, col = b.dataset.col === 'sol' ? 'sol' : (+b.dataset.col);
      const cur = getMark(card, col);
      const nextV = cur === '' ? 'tick' : cur === 'tick' ? 'cross' : cur === 'cross' ? '?' : '';
      setMark(card, col, nextV);
      cue('ui.tap', { gain:0.7 });
      openNotebook();          /* re-render the grid in place */
    };
  });
}

function openRules(){
  UI.sheetB.innerHTML = '<ul style="margin:0;padding-left:18px;line-height:1.6;font-size:13px">' +
    rulesFor().map(r => '<li style="margin:0 0 8px">' + r + '</li>').join('') + '</ul>';
  openSheet(T('How to play', 'Kif tilgħab'));
}

/* ═══════════════════════════════════════════════════════════════════
   TURN DRIVE — after any move, either it is a local human's turn (wait
   for the dock), an AI's turn (think on a short timer), or a remote seat
   (wait for the wire). Pass-the-phone inserts a handover before a human's
   turn so nobody sees another's hand. Terminates the moment the game ends.
   ═══════════════════════════════════════════════════════════════════ */
function afterMove(){
  if (!M || M.dead) return;
  if (E.over(M.st)){ finish(); return; }
  if (M.reveal) return;                       /* wait for the reveal overlay */
  const t = E.turn(M.st);
  if (t < 0){ finish(); return; }
  const o = ownerOf(t);
  if (o === 'ai'){
    if (M.online && M.net && M.net.host === false) return;    /* only host drives bots online */
    stopThinking();
    M.timer = setTimeout(() => { M.timer = 0; aiTurn(t); }, reduced() ? 120 : 620);
    render();
    return;
  }
  if (o === 'net') { render(); return; }      /* remote seat: wait for the wire */
  /* a local human seat. In pass-the-phone, curtain before their turn. */
  if (!M.online && M.st.seats.filter(s => s.own === 'hot').length > 1 && M.st.seats[t].own === 'hot' && M._lastHuman !== t){
    M._lastHuman = t;
    handover({ en:seatName(t) + ' — your turn', mt:seatName(t) + ' — id-dawra tiegħek' }, () => {
      rebuildBoardAfterHandover();
    });
    return;
  }
  M._lastHuman = t;
  render();
}
function rebuildBoardAfterHandover(){
  /* the frame was replaced by the curtain; rebuild the board fresh */
  openBoard(() => { leave(); P.hub(); });
  render();
}

function aiTurn(seat){
  if (!M || M.dead || E.over(M.st)) return;
  if (E.turn(M.st) !== seat) return;
  const lvl = M.st.seats[seat].lvl || 2;
  let mv = E.think(M.st, seat, lvl);
  if (!mv || !E.check(M.st, mv, seat)) mv = { t:'pass' };
  /* ONLINE the host drives the bots and is the sole referee: route a bot's
     suggest/accuse through hostReferee (resolves refutation/judgement from
     M.refDeal + the solution and broadcasts it with sg). pass/quit have no
     refutation to resolve and go out on the plain move channel. */
  if (M.online && amHost() && (mv.t === 'suggest' || mv.t === 'accuse')){
    if (mv.t === 'suggest') cue('card.throw', { gain:0.6 });
    else cue('duel.boss', { gain:0.8 }, true);
    hostReferee(seat, { kind: mv.t === 'suggest' ? 'sug' : 'acc', s:mv.s, w:mv.w, l:mv.l });
    return;
  }
  const res = doMove(seat, mv, 'auto');
  if (!res.ok){ doMove(seat, { t:'pass' }, 'auto'); }
  if (mv.t === 'suggest') cue('card.throw', { gain:0.6 });
  else if (mv.t === 'accuse') cue('duel.boss', { gain:0.8 }, true);
  render();
  if (E.over(M.st)){ finish(); return; }
  afterMove();
}

/* ═══════════════════════════════════════════════════════════════════
   THE END — the dramatic solution reveal → shared winner screen.
   ═══════════════════════════════════════════════════════════════════ */
function finish(){
  if (!M || M.finished) return;
  M.finished = true;
  stopThinking();
  const st = M.st, me = viewSeat();
  const v = E.verdict(st, me);
  if (!M.net && !M.recorded){
    M.recorded = true;
    if (v && v.tone === 'win') ST.rec.w++; else ST.rec.l++;
    persist();
  }
  saveSlot(null);
  /* the solution — from st.done (offline holds it) or the last accusation */
  const sol = (st.done && st.done.solution) || st.solution ||
    (st.accusations.length ? st.accusations[st.accusations.length - 1] : null);
  solutionReveal(sol, v, () => podium(sol, v));
}

function solutionReveal(sol, v, done){
  if (!sol || !M || !M.ctx){ done && done(); return; }
  const host = M.ctx.host;
  const ov = document.createElement('div');
  ov.className = 'ms-intro';
  ov.innerHTML =
    '<div class="ms-file">' + esc(T('Case closed', 'Il-każ magħluq')) + '</div>' +
    '<h2>' + esc(v && v.tone === 'win' ? T('You solved it!', 'Solvejtha!') : T('The solution', 'Is-soluzzjoni')) + '</h2>' +
    '<div class="ms-sol" id="ms-sol">' +
      ['s','w','l'].map(cat => '<div class="ms-solc" data-cat="' + cat + '">' + cardArt(sol[cat]) +
        '<span>' + esc(cardName(sol[cat])) + '</span></div>').join('') +
    '</div>' +
    '<p>' + esc(T('It was ' + cardName(sol.s) + ', with ' + cardName(sol.w) + ', in ' + cardName(sol.l) + '.',
                  'Kien ' + cardName(sol.s) + ', bl-' + cardName(sol.w) + ', f\'' + cardName(sol.l) + '.')) + '</p>' +
    '<button class="btn primary" id="ms-solgo" style="margin-top:4px">' + esc(T('Continue', 'Kompli')) + '</button>';
  host.appendChild(ov);
  cue('duel.boss', { gain:0.95 }, true);
  const cards = ov.querySelectorAll('.ms-solc');
  if (reduced()){ cards.forEach(c => c.classList.add('in')); }
  else cards.forEach((c, i) => setTimeout(() => { c.classList.add('in'); cue('board.flip', { gain:0.8 }, true); }, 260 + i * 300));
  ov.querySelector('#ms-solgo').onclick = () => { cue(v && v.tone === 'win' ? 'game.win' : 'ui.tap', { gain:0.9 }, true); ov.remove(); done && done(); };
}

function podium(sol, v){
  const st = M.st;
  const show = window.KARTI_REBBIEH && window.KARTI_REBBIEH.show;
  const winner = st.done ? st.done.winner : viewSeat();
  const order = [];
  for (let i = 0; i < st.n; i++) order.push(i);
  order.sort((a, b) => (a === winner ? -1 : b === winner ? 1 : a - b));
  const rows = order.map((seat, i) => ({
    name: seat === viewSeat() ? T('You', 'Int') : seatName(seat),
    place: seat === winner ? 1 : i + 1,
    you: seat === viewSeat(),
    bot: st.seats[seat].own === 'ai',
    score: st.out[seat] ? T('out', 'barra') : '',
    border: seat === winner ? '#e0b84e' : null
  }));
  const head = (v && v.tone === 'win')
    ? T('Case solved!', 'Il-każ solvut!')
    : (st.done && st.done.reason === 'cap') ? T('Time ran out', 'Il-ħin spiċċa')
    : T('Someone else cracked it', 'Xi ħadd ieħor qatagħha');
  const back = () => { leave(); P.hub(); };
  if (!show){
    P.ui.result(M.ctx, { tone: v ? v.tone : 'draw', head,
      why: T('The case is closed.', 'Il-każ magħluq.'),
      buttons: [{ label:T('Back', 'Lura'), icon:'back', cls:'primary', go:back }] });
    return;
  }
  cue(v && v.tone === 'win' ? 'game.win' : 'game.lose', { gain:0.9 }, true);
  show({
    title: head,
    subtitle: T('Case #' + st.caseId + ' — ' + TE(E.theCase(st).title), 'Każ #' + st.caseId + ' — ' + TE(E.theCase(st).title)),
    rows,
    onPlayAgain: M.net ? null : () => setupSheet(),
    onLeave: back
  });
}

/* ═══════════════════════════════════════════════════════════════════
   LEAVE — tidy up, no confirm.
   ═══════════════════════════════════════════════════════════════════ */
function leave(){
  stopThinking();
  if (M){ M.dead = true; }
  M = null; UI = null;
}

/* ═══════════════════════════════════════════════════════════════════
   ONLINE — turn-based move relay (like erbgha), with HIDDEN info dealt
   privately per seat. See the PRIVATE-DEAL note below for what js/mp.js /
   the server must supply.
   ═══════════════════════════════════════════════════════════════════ */
let NET = null;
function relayIfOnline(rec){ /* the onMove hook forwards; nothing to do inline */ void rec; }

/* WHAT THE SHARED LOBBY ASKS THE RELAY TO DEAL PRIVATELY.

   IL-MISTERU's deal is AUTHORITATIVE, not a shuffled pool: the host's engine
   fixes the whole deal here (solution + every hand) and each seat must get a
   DIFFERENT payload — plus the host (judge seat 0) alone gets the solution.
   So instead of the pool shape ({items,each}) we return the addressed shape
   ({mine:{seat:payload}}). The relay carries each payload as an opaque blob
   and pushes it to that seat's bit ONLY (see the deal note in karti_server).

   · every seat i          → { hand:[cards], caseId }         (its own cards)
   · the judge (seat 0)    → { hand:[cards], caseId, solution, all:[hands] }

   The solution — and the WHOLE deal (`all`) — is written into seat 0's blob and
   NO other, so the wire hands it to the host and to nobody else. The host is
   already the one that computed this deal, and it is the JUDGE: it holds the
   solution anyway, and it needs every hand to referee refutations (resolve who
   must show a card, and whisper WHICH card only to the suggester — see the
   refutation flow). caseId rides in every blob so each phone builds the SAME
   case authoritatively — the host picks it, the deal carries it, and no case id
   ever has to be whitelisted on the relay as a variant. */
function planDeal(opts){
  opts = opts || {};
  const rules = opts.rules || {};
  const caseId = Math.max(1, Math.min(E.CASES.length,
    (rules.caseId | 0) || (opts.variant | 0) || pref().caseId || 1));
  /* A FRESH deal seed, NOT the room's broadcast seed. The room seed is in
     `began` and known to every phone; a solution derived from it would be a
     secret only by politeness. This seed never leaves the host — the deal it
     produces is delivered per-seat by the wire, so no other phone can rebuild
     it even though they all share the room seed. */
  const plan = E.planDeal({ players: opts.seats, caseId, seed: newSeed() });
  const n = plan.players;
  const mine = {};
  for (let i = 0; i < n; i++){
    const g = E.givenForSeat(plan, i, i === plan.judge);
    const payload = { hand: (g.hand && g.hand[i]) || [], caseId: plan.caseId };
    if (g.solution){                                 /* seat 0 (judge) only */
      payload.solution = g.solution;
      payload.all = plan.hands.map(h => (h || []).slice());   /* referee copy */
    }
    mine[i] = payload;
  }
  return { mine };
}

function onlineStart(cfg){
  cfg = cfg || {};
  const chairs = (cfg.seats || []).filter(Boolean);
  const n = chairs.length;
  if (n < E.MIN_SEATS || n > E.MAX_SEATS) throw new Error('IL-MISTERU seats 2..6, not ' + n);

  const toGame = {}, toRoom = [];
  chairs.forEach((s, g) => { const room = (typeof s.seat === 'number') ? s.seat : g; toGame[room] = g; toRoom[g] = room; });
  const meG = (toGame[cfg.you] !== undefined) ? toGame[cfg.you] : 0;
  const iAmHost = (cfg.you === (cfg.host | 0));
  const lvl = (chairs.map(s => s && s.level).find(v => v)) || 2;
  const caseId = (cfg.opts && cfg.opts.caseId) || (cfg.variant | 0) || pref().caseId || 1;

  stopThinking();
  if (M){ try { leave(); } catch(e){} }

  /* PRIVATE from the off — no hand or solution known until the relay pushes
     ours. The judge (host) additionally receives the solution. */
  const opts = { humans:0, players:n, lvl, caseId, deal:'private', given:{ hand:{}, solution:null } };
  startMatch(opts, cfg.seed >>> 0);
  M.online = { toGame, toRoom, meG, judge:0 };
  M.st.seats.forEach((s, g) => {
    s.own = g === meG ? 'me' : (chairs[g] && chairs[g].kind === 'cpu' ? 'ai' : 'net');
    s.name = String((chairs[g] && chairs[g].name) || ('Detective ' + (g + 1))).slice(0, 14);
    s.lvl = (chairs[g] && chairs[g].level) || lvl;
  });
  NET = Object.assign({}, cfg.net, { host: iAmHost, toGame, toRoom, me: meG });
  M.net = NET; M.finished = false; M.notes = {};
  injectCSS(); P.show();
  openBoard(() => { const nx = NET; leave(); if (nx && nx.onLeave) nx.onLeave(); else P.hub(); });
  caseIntro(() => { render(); afterMove(); });
  return snapshot();
}

/* THE PRIVATE DEAL. The relay pushed THIS seat its own hand (and, to the
   judge, the solution AND the whole deal to referee with) via {t:'mine'} →
   hooks.private(d). We inject it and rebuild. d shape we REQUIRE: an object
   { hand:[cards], caseId, solution?:{s,w,l}, all?:[hands] } for our seat only.
   `solution`/`all` ride ONLY in the host's blob. The caseId rides in every
   blob so every phone rebuilds the SAME case the host dealt, without any case
   id being whitelisted on the relay. */
function onlinePrivate(d){
  if (!M || M.dead || !M.online) return;
  const me = M.online.meG;
  const payload = Array.isArray(d) ? d[0] : d;
  const given = { hand:{}, solution:null };
  if (payload && Array.isArray(payload.hand)) given.hand[me] = payload.hand.filter(E.validCard);
  if (payload && payload.solution) given.solution = payload.solution;
  const caseId = (payload && (payload.caseId | 0)) || (M.opts && M.opts.caseId) || 1;
  /* THE HOST IS THE REFEREE. Its blob (and no other) carries the whole deal.
     We keep it OUT of the engine state — the engine's public state must stay
     identical on every phone — and hold it aside on M.refDeal so the host can
     resolve refutations (who holds a suggested card, and which) authoritatively
     without any hand crossing the wire. Non-hosts never receive `all`, so this
     branch never runs for them and M.refDeal stays null. */
  M.refDeal = (payload && Array.isArray(payload.all) && me === M.online.judge)
    ? payload.all.map(h => Array.isArray(h) ? h.slice() : [])
    : null;
  M.opts = Object.assign({}, M.opts, { deal:'private', caseId, given });
  M.log = [];
  M.st = buildState(M.opts, M.seed, M.log);
  M.st.seats.forEach((s, g) => {
    s.own = g === me ? 'me' : (s.own === 'ai' ? 'ai' : 'net');
  });
  M.recorded = false;
  render(); afterMove();
  cue('card.deal', { gain:0.8 }, true);
}

/* ═══════════════════════════════════════════════════════════════════
   THE HOST-REFEREED MOVE PROTOCOL — the only cheat-proof online design,
   because only the host (judge seat 0) knows every hand (M.refDeal) and
   the solution (M.st.solution).

   A player's local suggestion/accusation must NOT be self-applied to the
   shared engine online — a non-host can't resolve who refutes (it only
   knows its own hand) nor judge an accusation. Instead:

     · non-host  → whispers a compact request to the host on channel
                   'ms-req' ("sug|s|w|l" or "acc|s|w|l", using the within-
                   case index of each card). It does NOT advance its own
                   engine; it waits for the host's authoritative echo.
     · host      → resolves it authoritatively (hostReferee) from M.refDeal
                   (+ st.solution for accusations), applies it to its own
                   engine attributed to the SUGGESTER's seat, and BROADCASTS
                   the fully-stamped move on the move channel so every client
                   applies the SAME move. The public broadcast carries `sg`
                   (true suggester room seat) and, for a suggestion, cd=255
                   (HIDDEN) — the shown card never rides the public wire.
                   The host ALSO whispers the shown card to the suggester
                   ONLY, on channel 'ms-show'.
   ═══════════════════════════════════════════════════════════════════ */
const WHISPER_REQ = 'ms-req';     /* non-host → host: a suggestion/accusation request */
const WHISPER_SHOW = 'ms-show';   /* host → suggester: the card shown, privately */

function amHost(){ return !!(NET && NET.host); }
function hostRoomSeat(){ return (M && M.online) ? (M.online.toRoom[M.online.judge]) : 0; }

/* the within-case index of a card, for the compact request/whisper strings */
function catIdx(card){ return E.catIndexInCase(M.st.caseId, card); }
function cardFromIdx(cat, i){ return E.cardFromCase(M.st.caseId, cat, i | 0); }

/* pack/parse the tiny request the non-host whispers to the host. The relay's
   chat channel carries a short string; keep it human-legible and index-based
   so it survives the chat filter and rebuilds to the exact cards. */
function encReq(kind, sel){
  const si = catIdx(sel.s), wi = catIdx(sel.w), li = catIdx(sel.l);
  if (si < 0 || wi < 0 || li < 0) return null;
  return kind + '|' + si + '|' + wi + '|' + li;
}
function parseReq(str){
  const p = String(str || '').split('|');
  if (p.length !== 4) return null;
  const kind = p[0];
  if (kind !== 'sug' && kind !== 'acc') return null;
  const s = cardFromIdx('s', +p[1]), w = cardFromIdx('w', +p[2]), l = cardFromIdx('l', +p[3]);
  if (!s || !w || !l) return null;
  return { kind, s, w, l };
}

/* THE REFEREE. Runs on the host ONLY. Given the suggester's GAME seat and a
   {s,w,l}, resolve who must refute (and which card) from M.refDeal — the
   clockwise-first holder from the suggester, card picked in category order
   s,w,l exactly as the engine's apply() does — or judge an accusation from
   st.solution. Then apply it locally, broadcast it with sg=suggester room
   seat and cd hidden, and whisper the shown card to the suggester only. */
function refDealHandOf(seat){ return (M.refDeal && Array.isArray(M.refDeal[seat])) ? M.refDeal[seat] : []; }
function hostResolveRefuter(suggesterG, sug){
  /* clockwise from the suggester, first OTHER seat holding any suggested card */
  const n = M.st.n;
  for (let k = 1; k < n; k++){
    const i = (suggesterG + k) % n;
    if (i === suggesterG) continue;
    const hand = refDealHandOf(i);
    const choices = E.refuteChoices(hand, sug);
    if (choices.length > 0){
      /* deterministic pick: category order s,w,l (same as engine apply) */
      const order = [sug.s, sug.w, sug.l];
      const card = order.find(c => choices.indexOf(c) >= 0) || choices[0] || null;
      return { by:i, card: card || null };
    }
  }
  return { by:-1, card:null };
}

/* build the resolved engine move, apply it (attributed to the suggester),
   broadcast it publicly, and (for a shown suggestion) whisper the card. */
function hostReferee(suggesterG, req){
  if (!M || M.dead || !amHost()) return;
  if (E.over(M.st)) return;
  if (E.turn(M.st) !== suggesterG) return;   /* referee in turn order only */
  const suggesterRoom = M.online.toRoom[suggesterG];

  if (req.kind === 'sug'){
    const sug = { s:req.s, w:req.w, l:req.l };
    const { by, card } = hostResolveRefuter(suggesterG, sug);
    /* apply to the HOST engine, fully stamped, attributed to the suggester */
    const mv = { t:'suggest', s:sug.s, w:sug.w, l:sug.l, by, card: card || null };
    const res = doMove(suggesterG, mv, 'referee');
    if (!res.ok) return;
    /* BROADCAST the resolved move — public wire: by present, cd HIDDEN (255),
       sg = the true suggester's ROOM seat (the relay stamps the sender as the
       host, so sg is how every client recovers who really suggested). */
    hostBroadcast({ t:'suggest', s:sug.s, w:sug.w, l:sug.l, by, card:null }, suggesterRoom);
    if (by >= 0 && card){
      if (suggesterG === M.online.meG){
        /* the host IS the suggester: reveal locally (no self-whisper — the
           relay would only echo it back and race the reveal). */
        showRevealTo(card, by, () => { autoMark(card, 'cross'); render(); afterMove(); });
        return;
      }
      /* whisper the shown card to the (remote) suggester ONLY */
      if (suggesterRoom != null && NET.whisper) NET.whisper(suggesterRoom, card, WHISPER_SHOW);
    }
    render(); if (E.over(M.st)){ finish(); return; } afterMove();
    return;
  }

  if (req.kind === 'acc'){
    const acc = { s:req.s, w:req.w, l:req.l };
    let right = 0;
    if (M.st.solution){
      right = (acc.s === M.st.solution.s && acc.w === M.st.solution.w && acc.l === M.st.solution.l) ? 1 : 0;
    }
    const mv = { t:'accuse', s:acc.s, w:acc.w, l:acc.l, right };
    const res = doMove(suggesterG, mv, 'referee');
    if (!res.ok) return;
    hostBroadcast({ t:'accuse', s:acc.s, w:acc.w, l:acc.l, right }, suggesterRoom);
    render();
    if (E.over(M.st)){ finish(); return; }
    afterMove();
    return;
  }
}

/* put a fully-resolved move on the public move channel with the suggester's
   ROOM seat stamped as `sg`. Encodes via the engine, adds sg (and, for a
   suggestion, forces cd hidden), and hands the wire to net.move. */
function hostBroadcast(mv, suggesterRoom){
  if (!NET || !NET.move) return;
  const w = E.encWire(mv, M.st.caseId);
  if (!w) return;
  if (w.t === 'sug') w.cd = 255;                 /* the shown card never rides the public wire */
  if (suggesterRoom != null) w.sg = suggesterRoom | 0;
  NET.move('move', w);
}

/* a move from another chair. ONLINE all shared moves are host-refereed and
   travel over this channel, stamped by the relay as coming from the HOST —
   so we recover the TRUE actor from w.sg (falling back to the relayed seat
   when sg is absent, e.g. a quit). Because the move is fully resolved and
   attributed, every client's public state stays byte-identical. */
function onlineRemote(seat, wire){
  if (!M || M.dead || !NET) return null;
  /* recover the true actor: for a host-refereed suggest/accuse the wire
     carries `sg` (the suggester's room seat); otherwise use the relayed seat. */
  const room = (wire && wire.sg !== undefined && wire.sg !== 255) ? (wire.sg | 0) : seat;
  const g = NET.toGame[room];
  if (g === undefined) return { ok:false, why:'a move from a chair not at this table' };
  const mv = E.decWire(wire, M.st.caseId);
  if (!mv) return { ok:false, why:'a move this table does not know' };
  /* the host already stamped by/card (suggest) and right (accuse); a non-host
     applies exactly what arrived. cd was hidden on the public wire, so mv.card
     is absent here — the shown card reaches the suggester only via 'ms-show'. */
  mv.seat = g;
  const r = doMove(g, mv, 'net');
  if (!r.ok) return { ok:false, why:String(r.err || 'refused') };
  render();
  if (E.over(M.st)){ finish(); return null; }
  afterMove();
  return null;
}

/* INBOUND PRIVATE WORDS (relay's addressed chat). Room seats throughout.
     'ms-req'   I am the host: a non-host's suggestion/accusation request —
                referee it authoritatively.
     'ms-show'  I am the suggester: the card the host says was shown to me —
                flip-reveal it and auto-mark, so only I learn WHICH card. */
function onlineWhisper(fromRoomSeat, x, ch){
  if (!M || M.dead || !M.online) return;
  if (ch === WHISPER_REQ){
    if (!amHost()) return;                        /* only the host referees */
    const fromG = NET.toGame[fromRoomSeat];
    if (fromG === undefined) return;
    const req = parseReq(x);
    if (!req) return;
    hostReferee(fromG, req);
    return;
  }
  if (ch === WHISPER_SHOW){
    /* the card shown to me. Ignore my own echo of a card I already revealed. */
    if (M.reveal) return;
    const card = String(x || '');
    if (!E.validCard(card)) return;
    /* find who showed it: the most recent suggestion I made where the host set
       by>=0. autoMark/showRevealTo key off my last suggestion in the log. */
    const view = viewSeat();
    const rec = M.log.slice().reverse().find(r => r.t === 'suggest' && r.seat === view && r.by >= 0);
    const by = rec ? rec.by : -1;
    if (by < 0) return;
    /* mark it directly: the public log hid the shown card (card:null on the
       broadcast), so autoMark's card-match would miss — set both marks here. */
    showRevealTo(card, by, () => { setMark(card, by, 'tick'); setMark(card, 'sol', 'cross'); render(); afterMove(); });
    return;
  }
}

function onlineNote(text, tone){ if (M && M.ctx) P.ui.setNet(M.ctx, text || '', tone || ''); }
function onlineStop(why, tone){
  if (!M || M.dead || !M.ctx) return;
  stopThinking(); M.finished = true;
  P.ui.setNet(M.ctx, '', '');
  P.ui.result(M.ctx, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? T('No result', 'Ebda riżultat') : T('Cut off', 'Inqata\''),
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
  gameId: () => (M ? 'misteru' : null),
  turn:   () => (M && NET) ? (NET.toRoom[E.turn(M.st)] != null ? NET.toRoom[E.turn(M.st)] : -1) : -1,
  over:   () => (M ? E.over(M.st) : null),
  moveCount: () => (M ? M.log.length : 0),
  onMove: fn => {
    const f = info => {
      if (!M || M.dead || !NET || !info) return;
      if (info.src === 'net') return;
      /* HOST-REFEREED suggest/accuse moves are broadcast explicitly by
         hostBroadcast (with sg + cd hidden). Do NOT let the generic auto-send
         re-broadcast them — that would double-send and leak the shown card. */
      if (info.src === 'referee') return;
      /* Online, the host is the sole broadcaster. A non-host never puts a move
         on the shared channel: its suggestions/accusations go to the host as a
         private 'ms-req' request, and it applies only the host's echo. */
      if (!amHost()) return;
      const rec = info.rec || info.move;
      /* the host still auto-sends pass/quit (no refutation to referee). Stamp
         sg so every client recovers the true actor (the relay stamps the
         broadcast as coming from the host's seat, not the actor's). */
      if (rec && rec.t !== 'pass' && rec.t !== 'quit') return;
      const w = E.encWire(rec, M.st.caseId);
      if (!w) return;
      const room = NET.toRoom[info.seat];
      if (room != null) w.sg = room | 0;
      const send = { seat: (room == null ? info.seat : room), src: info.src };
      fn(w, send);
    };
    moveSubs.push(f);
    return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); };
  },
  private: (d) => onlinePrivate(d),
  whisper: (from, x, ch) => onlineWhisper(from, x, ch),
  apply: (seat, wire) => onlineRemote(seat, wire),
  seatGone: seat => {
    if (!M || M.dead || !NET) return;
    const g = NET.toGame[seat]; if (g === undefined) return;
    doMove(g, { t:'quit' }, 'net'); render(); if (E.over(M.st)) finish(); else afterMove();
  }
};

P.online = P.online || {};
P.online.misteru = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  planDeal,
  live: () => NET_HOOKS.live(),
  hooks: NET_HOOKS
};

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — window.KARTI_MISTERU.lobby. Read by js/mp.js.
   Online is a 2..6 seat table. It is OPEN only once the relay deals each
   phone its own hand privately AND the host the solution (see the note).
   ═══════════════════════════════════════════════════════════════════ */
const ONLINE_READY = true;    /* the private-deal plumbing below is wired: the
                                 relay carries the authoritative addressed deal
                                 ({t:'start',deal:{mine:{…}}}) and pushes each
                                 seat only its own hand — and the host alone the
                                 solution. See planDeal() above. */
function myName(){
  try { const nm = K.displayName && K.displayName();
    if (nm && String(nm).trim() && String(nm).trim().toLowerCase() !== 'guest') return String(nm).trim().slice(0, 14);
  } catch(e){}
  return T('You', 'Int');
}
const LOBBY = {
  id:'misteru',
  name:'Il-Misteru',
  mt:'Il-Misteru',
  minSeats: E.MIN_SEATS,
  maxSeats: E.MAX_SEATS,
  levels: levels().map(L => ({ level:L.level, name:L.name, note:TE(L.note) })),
  defaultLevel: 2,
  /* THE CASE IS START-DATA, NOT A RELAY VARIANT. There are 50 cases; exposing
     them as lobby variants would make the host's pick cross the wire as a
     `setvariant` the relay would have to whitelist (50 ids) or reject. Instead
     the host's chosen case (pref().caseId, set from the setup sheet) is baked
     into the authoritative deal by planDeal and carried per-seat in the private
     blob (see planDeal / onlinePrivate). So no case id is ever a relay variant
     and every phone still agrees on the case — it reads it from its own deal.
     No `variants` here means the lobby shows no mode button for the case. */
  currentVariant(){ return null; },
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    const list = (seatList || []).filter(Boolean);
    const n = list.length;
    if (!ONLINE_READY){
      return { ok:false, why: T(
        'IL-MISTERU online needs the server to deal each phone its own hand (and the host the solution) — coming next. Play detectives or pass the phone for now.',
        'Il-Misteru onlajn irid li s-server jagħti lil kull telefon l-id tiegħu (u lill-host is-soluzzjoni) — ġej. Ilgħab mad-detectives jew għaddi t-telefon għalissa.') };
    }
    if (n < E.MIN_SEATS) return { ok:false, why: T('IL-MISTERU needs at least two detectives.', 'Il-Misteru jrid mill-inqas żewġ detectives.') };
    if (n > E.MAX_SEATS) return { ok:false, why: T('Up to six detectives.', 'Sa sitt detectives.') };
    const un = list.filter(x => x && x.kind !== 'cpu' && !x.ready);
    if (un.length) return { ok:false, why:(un.map(s => s.name || 'Somebody').join(' and ')) + ' ' + T('not ready yet.', 'għadhom mhux lesti.') };
    return { ok:true, why:'' };
  },
  start(seatsList, opts){
    return onlineStart({ seats: seatsList, seed: opts && opts.seed, you: 0, host: 0,
                         variant: (opts && opts.variant) || pref().caseId || 1,
                         opts: { caseId: (opts && opts.variant) || pref().caseId || 1 },
                         net: (opts && opts.net) || {} });
  },
  rulesHTML: () =>
    '<p>' + T('A murder mystery for 2–6 detectives. One suspect, one weapon and one place are the secret solution, set aside; the rest of the cards are dealt out.',
      'Misteru ta\' delitt għal 2–6 detectives. Suspettat wieħed, arma waħda u post wieħed huma s-soluzzjoni sigrieta, imwarrba; il-bqija tal-karti jitqassmu.') + '</p>' +
    '<p>' + T('On your turn, suggest a suspect + weapon + place; the next detective holding one must show it to you privately. Mark your notebook, then accuse when sure.',
      'Fuq id-dawra tiegħek, issuġġerixxi suspettat + arma + post; id-detective li jmiss li għandu waħda jrid jurihielek privatament. Immarka l-ktejjeb, imbagħad akkuża meta tkun ċert.') + '</p>',
  blurb: T('Suggest, deduce, accuse. Be first to name the killer.', 'Issuġġerixxi, iddeduċi, akkuża. Kun l-ewwel li ssemmi l-qattiel.'),
  myName,
  /* THE WIRE — the engine's fields PLUS `sg`, the true suggester's ROOM seat.
     The host is the sole referee: a player's suggestion/accusation is resolved
     by the host and BROADCAST on the move channel, but the relay stamps that
     broadcast as coming from the HOST's seat — so the resolved move must carry
     `sg` to name the seat it was actually made for. mp.js's toWire REFUSES any
     field not in this list, so `sg` MUST be declared here (a room seat 0..5,
     fits a byte). See onMove/onlineRemote below. */
  wire: { fields: E.WIRE_FIELDS.concat(['sg']) },
  takeback: false
};
R.lobby = LOBBY;

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF — one tile. kind:'board' shelves it with the deduction games.
   Icon 'search' (a real ICO symbol — NOT 'dice').
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'misteru', order:28, kind:'board', cat:'board',
  name:'Il-Misteru', mt:'Il-Misteru', icon:'search', status:'live',
  get tag(){
    return T('A Maltese murder mystery for 2–6. Suggest, deduce with your notebook, and be first to name the killer, the weapon and the place.',
             'Misteru ta\' delitt Malti għal 2–6. Issuġġerixxi, iddeduċi bil-ktejjeb, u kun l-ewwel li ssemmi l-qattiel, l-arma u l-post.') +
           (ST.save ? ' ' + T('There is a case half-solved.', 'Hemm każ nofsu solvut.') : '');
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

/* ── test hooks — inert unless the page is opened with ?misterutest ──── */
if (/[?&]misterutest\b/.test(location.search || '')){
  window.__MISTERU_TEST = {
    setupSheet, offlineSetup, offlineStartFlow, startMatch, doMove, render,
    openPicker, doSuggest, doAccuse, openNotebook, setMark, getMark, autoMark,
    caseIntro, showRevealTo, finish, solutionReveal, podium, handover,
    onlineStart, onlinePrivate, onlineRemote, onlineWhisper, buildState,
    hostReferee, sendMoveOnline, encReq, parseReq, hostResolveRefuter, hostBroadcast,
    get M(){ return M; }, get UI(){ return UI; },
    engine: E, LOBBY, hooks: NET_HOOKS, online: P.online.misteru, leave, viewSeat, afterMove
  };
}

})();
