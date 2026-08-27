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

/* ── HAPTICS — the other half of "something just happened" ─────────────
   One line, next to the cue() that already marks the same moment, so a
   buzz and a click can never drift apart. js/sfx.js owns the pattern, the
   player's switch and every no-op path (no motor, no permission, iOS); it
   can neither throw nor delay the tap that caused it, so there is nothing
   to guard here beyond the module being absent entirely.

   DELIBERATELY NOT GATED ON reduced(). That setting is about things moving
   on screen; a buzz in the hand is not motion and has its own switch. What
   IS gated on reduced() is every animation below — the walk, the tumble,
   the press scale — and the haptic still fires when the animation does not,
   because the MOMENT is what the player is being told about, not the
   picture of it. Only ever called for something the player caused. */
function buzz(kind){
  try { const S = window.KARTI_SFX; if (S && S.haptic) S.haptic(kind); } catch(e){}
}
/* arriving somewhere: a room is a thud, a paving stone is a tick */
function landKind(p){ return E.posIsRoom(p) ? 'thud' : 'tick'; }

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
    walkHold: 0,               /* ms the next afterMove() should leave for a walk */
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
/* THE ONE WAY A CARD GETS ITS PICTURE. A drawn thing is rendered first and
   never removed; the painting is a second layer that starts invisible and is
   revealed only by a real load event. An image that 404s simply never appears
   — no broken-image glyph, no flash of alt text, no layout change, because
   the drawn floor underneath was already the right size. Every id in the
   three pools is unique (16 suspects + 12 weapons + 12 locations = 40 ids,
   all distinct), which is why all three can share one flat art/misteru/<id>.png
   convention and one function. */
function artLayer(id, drawn){
  return '<span class="ms-fart">' + drawn +
    '<img class="ms-fimg" alt="" loading="lazy" src="' + esc(ART + id + '.png') +
      '" onload="this.classList.add(\'ok\')" onerror="this.remove()"></span>';
}
function suspectHTML(id){ return artLayer(id, drawnSuspect(id)); }
/* a themed drawn icon for a weapon or location (no art needed) */
const WPATH = {
  ponta:'M50 20 L58 70 L50 92 L42 70 Z', kandelabru:'M46 24 h8 v40 h14 v8 h-36 v-8 h14 z',
  velenu:'M40 24 h20 v10 l6 40 a10 10 0 0 1 -32 0 l6 -40 z', habel:'M30 24 q40 20 0 40 q40 20 0 40',
  pistola:'M28 40 h34 v10 h-8 v22 h-10 v-22 h-16 z', imhadda:'M24 44 q0-12 14-12 h24 q14 0 14 12 v20 q0 12 -14 12 h-24 q-14 0 -14 -12 z',
  cavetta:'M30 30 h14 v20 h12 v-20 h14 v10 l-8 8 v40 h-24 v-40 l-8-8 z', flixkun:'M44 20 h12 v14 l8 16 v40 h-28 v-40 l8-16 z',
  labra:'M50 22 a6 6 0 1 1 -0.1 0 M50 34 v56', martell:'M30 28 h40 v14 h-14 v52 h-12 v-52 h-14 z',
  girlanda:'M28 34 q44 -8 44 24 q0 32 -44 24', petard:'M42 26 h16 v50 h-16 z M50 20 v-8'
};
function drawnWeapon(id){
  const p = WPATH[id] || 'M40 40 h20 v20 h-20 z';
  const hue = (E.WEAPONS.findIndex(w => w.id === id) * 33 + 20) % 360;
  return '<svg class="ms-obj" viewBox="0 0 100 100" aria-hidden="true">' +
    '<rect x="0" y="0" width="100" height="100" rx="14" fill="hsl(' + hue + ' 22% 20%)"/>' +
    '<path d="' + p + '" fill="none" stroke="hsl(' + hue + ' 55% 66%)" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>' +
    '</svg>';
}
function drawnLocation(id){
  const hue = (E.LOCATIONS.findIndex(l => l.id === id) * 37 + 140) % 360;
  return '<svg class="ms-obj" viewBox="0 0 100 100" aria-hidden="true">' +
    '<rect x="0" y="0" width="100" height="100" rx="14" fill="hsl(' + hue + ' 22% 20%)"/>' +
    '<path d="M20 54 L50 28 L80 54 v30 h-60 z" fill="none" stroke="hsl(' + hue + ' 55% 66%)" stroke-width="6" stroke-linejoin="round"/>' +
    '<rect x="42" y="62" width="16" height="22" fill="hsl(' + hue + ' 55% 66%)"/>' +
    '</svg>';
}
/* Weapons and locations were drawn-only until the paintings existed. They go
   through the same photo probe the suspects always did, so the twelve weapon
   and twelve location canvases light up with no other change — and a phone
   that never downloads them still sees the drawn icon it saw before. */
function weaponIcon(id){ return artLayer(id, drawnWeapon(id)); }
function locationIcon(id){ return artLayer(id, drawnLocation(id)); }
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
    '#scr-party .pt-host.ms-host{height:100%;align-items:stretch;justify-content:stretch;overflow:hidden;padding:0}',
    /* width:100% is load-bearing. .pt-host is a flex row, so without it the
       wrap takes its MAX-CONTENT width — the seat rail's — and the board,
       measured from that box, was built 489px wide inside a 390px phone and
       ran off the right-hand edge. */
    '#scr-party .ms-wrap{display:flex;flex-direction:column;height:100%;min-height:0;' +
      'width:100%;max-width:100%;color:#f3ede0}',
    '#scr-party .ms-top{flex:0 0 auto;padding:6px 10px 2px;min-width:0}',
    '#scr-party .ms-seats{display:flex;gap:6px;overflow-x:auto;padding-bottom:3px;min-width:0}',
    '#scr-party .ms-seat{flex:0 0 auto;display:flex;align-items:center;gap:6px;border-radius:14px;padding:4px 10px 4px 6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);font-size:12px;line-height:1.15;text-align:left}',
    '#scr-party .ms-seat.turn{border-color:var(--sc,#e0b84e);box-shadow:0 0 0 2px var(--sc,#e0b84e) inset}',
    '#scr-party .ms-seat.out{opacity:.42}',
    '#scr-party .ms-seat .dot{width:11px;height:11px;border-radius:50%;background:var(--sc,#888);flex:0 0 auto}',
    /* the seat rail says WHERE each detective is — the board is only half the
       information; "who is in the Bakery with me" is the other half, and it
       must be readable without hunting for six coloured discs. */
    '#scr-party .ms-seat b{display:block;font-weight:800;font-size:11.5px;white-space:nowrap}',
    '#scr-party .ms-seat i{display:block;font-style:normal;font-size:9.5px;color:#a89f8e;white-space:nowrap;max-width:96px;overflow:hidden;text-overflow:ellipsis}',
    '#scr-party .ms-strip{font-size:12.5px;color:#c9bfae;min-height:20px;padding:5px 12px;line-height:1.3;display:flex;align-items:center;gap:8px}',
    '#scr-party .ms-strip .ms-msg{flex:1;min-width:0}',
    '#scr-party .ms-dock{flex:0 0 auto;display:grid;gap:8px;padding:6px 12px 10px;grid-template-columns:1fr 1fr 1fr}',
    /* an EXPLICIT height, not min-height. Left to min-height these buttons
       measured 65px — 19px per row of dock stolen straight off the board on a
       640px phone, which is the difference between a 41px cell and a 44px one.
       48px still clears the 44px touch minimum, and two lines of a long
       Maltese label ("Passaġġ sigriet") fit inside it. */
    '#scr-party .ms-dock .btn{box-sizing:border-box;height:48px;min-height:0;padding:4px 6px;' +
      'font-size:12.5px;line-height:1.2;text-align:center;overflow:hidden}',

    /* ═══ THE BOARD ITSELF ═══════════════════════════════════════════
       The 7x8 map. The box flexes into whatever vertical slack the seat
       rail, the strip and the dock leave over, and sizeBoard() writes the
       ONE number the whole grid is built from — `--c`, the cell edge in px,
       measured from that box. Nothing here is a hard-coded cell size: a
       fixed px board is exactly what falls off the bottom of a 360x640
       phone. The declarations below (aspect-ratio + 1fr tracks) are the
       fallback shape if the measure has not run yet, so the first paint is
       never a pile of squares in the corner. */
    /* the negative margin buys back most of .screen's 12px gutter: at 360px
       every pixel of that gutter comes straight off the cell size, and a cell
       under the 44px touch minimum is a worse trade than a narrow margin. */
    '#scr-party .ms-boardbox{flex:1 1 auto;min-height:0;min-width:0;width:auto;display:flex;' +
      'align-items:center;justify-content:center;margin:0 -8px;padding:2px;position:relative}',
    '#scr-party .ms-board{--c:44px;--g:2px;box-sizing:border-box;display:grid;' +
      'grid-template-columns:repeat(7,1fr);grid-template-rows:repeat(8,1fr);gap:var(--g);' +
      'aspect-ratio:7/8;max-width:100%;max-height:100%;' +
      'width:calc(var(--c)*7 + var(--g)*6 + 8px);height:calc(var(--c)*8 + var(--g)*7 + 8px);' +
      'padding:4px;border-radius:12px;background:#151019 url("art/misteru/board-felt.jpg") center/cover;' +
      'box-shadow:0 10px 26px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.07) inset}',
    '#scr-party .ms-cellx{position:relative;overflow:hidden;border:0;margin:0;padding:0;font:inherit;' +
      'color:#f3ede0;background:transparent;border-radius:4px;-webkit-appearance:none;appearance:none;' +
      'touch-action:manipulation;transition:transform .15s ease,opacity .15s ease}',
    /* the paving is ONE photograph shared by the whole board, each square
       showing its own slice — twenty copies of the same tile centred twenty
       times reads as wallpaper, not as a street. */
    '#scr-party .ms-corr{background-image:url("art/misteru/board-street.jpg");' +
      'background-size:calc(var(--c)*7) calc(var(--c)*8);' +
      'background-position:calc(var(--cc) * var(--c) * -1) calc(var(--rr) * var(--c) * -1);' +
      'box-shadow:0 0 0 1px rgba(255,255,255,.05) inset,0 0 0 2px rgba(0,0,0,.35) inset}',
    /* A ROOM IS A FLOOR PLAN, NOT A PICTURE. The board is seen from directly
       overhead; the paintings are perspective interiors, and at 156x104 with
       enough darkening for tokens to read they were a brown smudge. So the
       tile is a drawn plan — tinted limestone floor, walls with a real gap at
       every doorway, one furniture glyph from above — and the painting is
       promoted to the moment you walk in (see roomEntryCard). */
    '#scr-party .ms-room{border-radius:6px}',
    '#scr-party .ms-floor{position:absolute;inset:0;border-radius:6px;' +
      'background-image:linear-gradient(var(--t1),var(--t2)),url("art/misteru/board-street.jpg");' +
      'background-size:cover,cover;background-position:center,center}',
    '#scr-party .ms-plan{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '#scr-party .ms-room .ms-scrim{position:absolute;inset:0;border-radius:6px;' +
      'background:linear-gradient(180deg,rgba(9,7,13,0),rgba(9,7,13,.12) 46%,rgba(9,7,13,.80))}',
    /* the painting, promoted: shown big for a moment when you walk in */
    '#scr-party .ms-enter{position:absolute;left:10px;right:10px;top:8px;z-index:5;pointer-events:none;' +
      'display:flex;align-items:center;gap:11px;padding:9px 12px 9px 9px;border-radius:14px;' +
      'background:linear-gradient(180deg,rgba(32,26,43,.97),rgba(20,16,28,.97));' +
      'border:1px solid rgba(255,197,66,.55);box-shadow:0 14px 34px rgba(0,0,0,.6);' +
      'opacity:0;transform:translateY(-10px);transition:opacity .22s ease,transform .22s cubic-bezier(.2,.8,.2,1)}',
    '#scr-party .ms-enter.in{opacity:1;transform:translateY(0)}',
    '#scr-party .ms-enter .ms-fart,#scr-party .ms-enter .ms-obj{width:92px;height:92px;flex:0 0 auto;' +
      'border-radius:10px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,197,66,.35)}',
    '#scr-party .ms-enter b{display:block;font-family:var(--disp,"Exo 2",sans-serif);font-size:15px;color:#FFC542}',
    '#scr-party .ms-enter i{display:block;font-style:normal;font-size:11.5px;color:#c9bfae;margin-top:2px}',
    'body.reduced #scr-party .ms-enter{transition:none}',
    '@media (prefers-reduced-motion:reduce){#scr-party .ms-enter{transition:none}}',
    /* long Maltese room names ("Il-Każin tal-Banda") get two lines and then
       an ellipsis — never an overflow that pushes the tokens off the tile. */
    '#scr-party .ms-rname{position:absolute;left:3px;right:3px;bottom:2px;text-align:center;' +
      'font-family:var(--disp,"Exo 2",sans-serif);font-weight:800;font-size:clamp(9px,2.9vw,12px);' +
      'line-height:1.14;letter-spacing:.01em;color:#FFC542;' +
      'text-shadow:0 1px 3px rgba(0,0,0,.98),0 0 4px rgba(0,0,0,.9),0 0 8px rgba(0,0,0,.7);' +
      'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    /* tokens: a small wrapping row, so six detectives in one room stay six
       legible discs instead of one pile. */
    '#scr-party .ms-toks{position:absolute;left:1px;right:1px;top:1px;display:flex;flex-wrap:wrap;' +
      'gap:1px;justify-content:center;align-content:flex-start;pointer-events:none}',
    '#scr-party .ms-tok{width:min(46%,20px);aspect-ratio:1;border-radius:50%;background:var(--sc,#888);' +
      'color:#120e18;font:900 10px/1 var(--disp,"Exo 2",sans-serif);display:flex;align-items:center;' +
      'justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.65),0 0 0 1px rgba(0,0,0,.45)}',
    '#scr-party .ms-room .ms-tok{width:min(26%,22px)}',
    '#scr-party .ms-tok.me{box-shadow:0 0 0 2px #FFC542,0 1px 3px rgba(0,0,0,.65)}',
    '#scr-party .ms-tok.out{opacity:.42;filter:grayscale(.55)}',
    /* REACHABLE IS NEVER COLOUR ALONE: full brightness + a gold inset outline
       + a pulsing dot, against a dimmed, untappable rest of the board. */
    '#scr-party .ms-board.lit .ms-cellx{opacity:.45;pointer-events:none}',
    /* OUTLINE, not an inset box-shadow. A room tile's floor and floor-plan are
       absolutely-positioned children, and they paint OVER the button's own
       inset shadow — the gold ring was invisible on exactly the cells a player
       most wants to walk into. Outlines paint last, over the children. */
    '#scr-party .ms-board.lit .ms-cellx.rch{opacity:1;pointer-events:auto;cursor:pointer;' +
      'outline:2px solid #FFC542;outline-offset:-2px;box-shadow:0 0 12px rgba(255,197,66,.45)}',
    '#scr-party .ms-board:not(.lit) .ms-cellx{pointer-events:none}',
    '#scr-party .ms-board.lit .ms-cellx.rch:active{transform:scale(.97)}',

    /* ═══ PRESS FEEDBACK ═════════════════════════════════════════════
       Every tappable thing in this game shrinks a little under the thumb.
       TRANSFORM ONLY — a padding or a border change here would re-flow the
       grid the board is measured from, and on a 360px phone that is a cell
       size that jitters on every tap. Scoped to this game's own classes so
       nothing else on #scr-party inherits a press it did not ask for.
       :active is the CSS half; the tick buzz is the other half, fired from
       one delegated pointerdown in pressWire(). */
    '#scr-party .ms-dock .btn,#scr-party .ms-menu .btn,#scr-party .ms-opt,' +
      '#scr-party .ms-casetile,#scr-party .ms-count button,#scr-party .ms-pk,' +
      '#scr-party .ms-nb .ms-cell,#scr-party .ms-menu .iconbtn,#scr-party .ms-sheet-x,' +
      '#scr-party .ms-intro .btn,#scr-party .ms-revl .btn,#scr-party .ms-hand .btn' +
      '{transition:transform .15s cubic-bezier(.2,.8,.2,1)}',
    '#scr-party .ms-dock .btn:active,#scr-party .ms-menu .btn:active,#scr-party .ms-opt:active,' +
      '#scr-party .ms-casetile:active,#scr-party .ms-count button:active,#scr-party .ms-pk:active,' +
      '#scr-party .ms-nb .ms-cell:active,#scr-party .ms-menu .iconbtn:active,#scr-party .ms-sheet-x:active,' +
      '#scr-party .ms-intro .btn:active,#scr-party .ms-revl .btn:active,#scr-party .ms-hand .btn:active' +
      '{transform:scale(.97)}',
    '#scr-party .ms-dock .btn[disabled]:active,#scr-party .ms-pk[disabled]:active,' +
      '#scr-party .ms-nb .ms-cell[disabled]:active{transform:none}',
    'body.reduced #scr-party .ms-dock .btn,body.reduced #scr-party .ms-menu .btn{transition:none}',

    /* ═══ THE WALKING TOKEN ══════════════════════════════════════════
       A single absolutely-positioned disc that travels the board while the
       real token in the destination tray is held invisible. translate()
       ONLY — animating left/top would lay the board out again on every one
       of six steps, which is the perf cliff this repo already fell off.
       It is a picture of a move that has ALREADY been applied to the
       engine, so losing it costs nothing but the animation. */
    '#scr-party .ms-walk{position:absolute;left:0;top:0;z-index:4;pointer-events:none;' +
      'width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:var(--sc,#888);' +
      'color:#120e18;font:900 10px/1 var(--disp,"Exo 2",sans-serif);display:flex;' +
      'align-items:center;justify-content:center;will-change:transform;' +
      'box-shadow:0 0 0 2px #FFC542,0 2px 7px rgba(0,0,0,.75);' +
      'transition:transform .11s cubic-bezier(.35,0,.35,1)}',
    '#scr-party .ms-walk.snap{transition:none}',
    /* the squares just left behind, lit for the length of the walk: the trail
       says WHICH way round the block the detective went, which the destination
       on its own can never say. An OUTLINE, for the same reason the reachable
       ring is one — a room tile's floor and plan paint over an inset shadow. */
    '#scr-party .ms-board .ms-cellx.trail{outline:2px solid rgba(255,197,66,.45);outline-offset:-2px}',
    /* the die tumbles: a few faces go past and it settles, easing out */
    '@keyframes ms-tumble{0%{transform:rotate(-160deg) scale(.55)}' +
      '45%{transform:rotate(120deg) scale(1.2)}72%{transform:rotate(-24deg) scale(1.04)}' +
      '100%{transform:rotate(0) scale(1)}}',
    '#scr-party .ms-die.tumble{animation:ms-tumble .6s cubic-bezier(.16,.84,.28,1) 1}',
    'body.reduced #scr-party .ms-die.tumble,body.reduced #scr-party .ms-walk{animation:none;transition:none}',
    '@media (prefers-reduced-motion:reduce){#scr-party .ms-die.tumble{animation:none}' +
      '#scr-party .ms-walk{transition:none}' +
      '#scr-party .ms-dock .btn,#scr-party .ms-menu .btn{transition:none}}',
    '#scr-party .ms-pip{position:absolute;left:50%;top:50%;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;' +
      'border-radius:50%;background:#FFC542;box-shadow:0 0 8px rgba(255,197,66,.95);' +
      'animation:ms-pulse 1.15s ease-in-out infinite}',
    '#scr-party .ms-pip[hidden]{display:none}',
    '@keyframes ms-pulse{0%,100%{transform:scale(.68);opacity:.55}50%{transform:scale(1.18);opacity:1}}',
    /* the die is a drawn face, never a numeral and never an emoji */
    '#scr-party .ms-die{width:26px;height:26px;flex:0 0 auto}',
    '@keyframes ms-roll{0%{transform:rotate(-30deg) scale(.66)}55%{transform:rotate(14deg) scale(1.16)}100%{transform:rotate(0) scale(1)}}',
    '#scr-party .ms-die.roll{animation:ms-roll .5s cubic-bezier(.2,.8,.2,1) 1}',
    'body.reduced #scr-party .ms-pip,body.reduced #scr-party .ms-die.roll{animation:none}',
    '@media (prefers-reduced-motion:reduce){#scr-party .ms-pip,#scr-party .ms-die.roll{animation:none}' +
      '#scr-party .ms-cellx{transition:none}}',
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
  pressWire();
}

/* ── THE TICK UNDER THE THUMB ─────────────────────────────────────────
   ONE delegated pointerdown, in the capture phase, on #scr-party — the
   permanent screen node this game borrows. Not per element: the board's
   cells, the dock and the notebook grid are all rewritten on every paint,
   so a per-element handler would have to be re-bound on every render and
   would leak the ones it forgot. Not on document either: this listener has
   no business firing while another game is on screen, and the selector
   list is this game's own classes so it stays inert if it ever did.
   Installed exactly once, on a node that outlives every match, so there is
   nothing to detach — unlike the motion listener below, which is a battery
   cost and is torn down the moment its window closes. */
const PRESS_SEL = '.ms-cellx.rch,.ms-dock .btn,.ms-menu .btn,.ms-opt,.ms-casetile,' +
                  '.ms-count button,.ms-pk,.ms-nb .ms-cell,.ms-menu .iconbtn,.ms-sheet-x,' +
                  '.ms-intro .btn,.ms-revl .btn,.ms-hand .btn';
let pressDone = false;
function pressWire(){
  if (pressDone) return;
  let scr = null;
  try { scr = document.getElementById('scr-party') ||
              (P.ui && P.ui.screenEl && P.ui.screenEl().closest ? P.ui.screenEl().closest('.screen') : null); }
  catch(e){ scr = null; }
  if (!scr) return;
  pressDone = true;
  scr.addEventListener('pointerdown', ev => {
    try {
      const t = ev.target && ev.target.closest ? ev.target.closest(PRESS_SEL) : null;
      if (!t || t.disabled) return;
      /* SOME BUTTONS SAY SOMETHING BETTER THAN "tapped". js/sfx.js merges two
         buzzes closer together than 40ms — deliberately, so they do not smear
         — and pointerdown lands a few milliseconds before the click that runs
         the handler. So an unconditional press tick here would EAT the roll of
         the die and the thud of the secret passage, and the two moments the
         hand should feel most would be the two that felt like nothing. Those
         buttons carry data-hap="skip" and buzz for themselves.            */
      if (t.dataset && t.dataset.hap === 'skip') return;
      buzz('tick');
    } catch(e){}
  }, true);
}

/* ── WARM THE BOARD CATALOGUE OFF THE CRITICAL PATH ───────────────────
   The FIRST boardFor() call is the one that enumerates every legal packing
   of six rooms into the 7x8 grid — thousands of them — and on a cheap
   phone that measured over a second of blocked main thread. Every board
   after it is a memo lookup plus a small derive. So the cost is not "this
   case", it is "the first case", and it can be paid while the player is
   still reading the menu and choosing detectives.

   FIRE AND FORGET. requestIdleCallback so it never competes with the menu
   painting, setTimeout(…,1) where that API is missing (older WebKit), and
   the whole thing inside a try: a warm-up that throws must cost the player
   nothing, because the real boardFor() call is still coming and is still
   correct. Safe to call any number of times — the flag stops the second
   schedule and boardFor() is memoised underneath it anyway. */
let warmKicked = false;
function warmBoards(caseId){
  if (warmKicked) return;
  warmKicked = true;
  const go = () => { try { E.boardFor(caseId || pref().caseId || 1); } catch(e){} };
  try {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(go, { timeout:1500 });
    else setTimeout(go, 1);
  } catch(e){ try { setTimeout(go, 1); } catch(e2){} }
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
  motionDetach();          /* no match, no roll window, no motion listener */
  /* the menu is several seconds of reading and tapping — spend them paying
     for the board catalogue instead of making the player wait for it after
     they hit start. Kicked BEFORE the markup so an idle slot exists early;
     it cannot block the paint, it is a callback. */
  warmBoards();
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
  warmBoards(caseId);      /* second chance, if the player came in on a deep link */

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
  /* the frame's turn strip stays empty in this game — .ms-strip below the
     board is the turn prompt — and an empty one still eats ~34px of the
     height the board needs on a 360x640 phone. Hide THIS frame's, never the
     rule for every game. */
  if (M.ctx.turn) M.ctx.turn.style.display = 'none';
  M.ctx.badge.textContent = M.net ? T('Online', 'Onlajn') : ('#' + M.st.caseId);
  buildBoard();
  M.ctx.btn('ms-nb').onclick = () => openNotebook();
  M.ctx.btn('ms-rules').onclick = () => openRules();
}

function buildBoard(){
  const ctx = M.ctx;
  stopWatchBox();
  ctx.host.classList.add('ms-host');
  /* seat rail → board → turn prompt → dock. Nothing here scrolls; the board
     box is the only elastic row and it takes whatever is left. */
  ctx.host.innerHTML =
    '<div class="ms-wrap">' +
      '<div class="ms-top"><div class="ms-seats" id="ms-seats"></div></div>' +
      '<div class="ms-boardbox" id="ms-boardbox"><div class="ms-board" id="ms-board"></div></div>' +
      '<div class="ms-strip" id="ms-strip"></div>' +
      '<div class="ms-dock" id="ms-dock"></div>' +
      '<div class="ms-sheet" id="ms-sheet" aria-hidden="true">' +
        '<div class="ms-sheet-h"><h4 id="ms-sheet-t"></h4>' +
          '<button class="ms-sheet-x" id="ms-sheet-x"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<div class="ms-sheet-b" id="ms-sheet-b"></div>' +
      '</div>' +
    '</div>';
  UI = {
    ctx,
    seats:    ctx.host.querySelector('#ms-seats'),
    boardBox: ctx.host.querySelector('#ms-boardbox'),
    board:    ctx.host.querySelector('#ms-board'),
    strip:    ctx.host.querySelector('#ms-strip'),
    dock:     ctx.host.querySelector('#ms-dock'),
    sheet:    ctx.host.querySelector('#ms-sheet'),
    sheetT:   ctx.host.querySelector('#ms-sheet-t'),
    sheetB:   ctx.host.querySelector('#ms-sheet-b')
  };
  ctx.host.querySelector('#ms-sheet-x').onclick = () => closeSheet();
  /* ONE delegated listener on the container: the cells are rewritten whenever
     the case or the language changes, and a per-cell handler would have to be
     re-bound every time (and would leak the ones it forgot). */
  UI.board.onclick = ev => {
    const cell = ev.target && ev.target.closest ? ev.target.closest('.ms-cellx') : null;
    if (!cell || !cell.classList.contains('rch')) return;
    boardTap(+cell.dataset.pos);
  };
  watchBox();
  render();
}

/* ═══════════════════════════════════════════════════════════════════
   THE BOARD — 7 x 8 off the engine's geometry. Six room tiles (each ONE
   grid item spanning its rectangle) and twenty corridor squares. Built
   once per case/language and then only repainted: rebuilding the markup
   every turn would re-request the six room paintings and flash the drawn
   fallback back in on every AI move.
   ═══════════════════════════════════════════════════════════════════ */
/* ── THE FLOOR PLAN ───────────────────────────────────────────────────
   One furniture glyph per location, drawn FROM ABOVE, in a 30 x 20 unit
   space (three cells wide, two tall — the room rectangle's own shape). A
   handful of primitives each: it has to read at about 156 x 104 CSS px, so
   simple beats accurate. Keyed by the engine's location id, so slot k draws
   whatever card the case put there and nothing is hand-placed per case. */
const PLAN_GLYPH = {
  /* band club — bass drum and two music stands */
  kazinbanda:'<circle cx="15" cy="8" r="4.4"/><circle cx="15" cy="8" r="1.5"/>' +
             '<rect x="5.5" y="6" width="3.2" height="4.6" rx="1"/><rect x="21.3" y="6" width="3.2" height="4.6" rx="1"/>',
  /* church — altar block and rows of pews */
  knisja:'<rect x="12" y="2.4" width="6" height="2.6" rx="0.6"/>' +
         '<path d="M8 7.4h14M8 9.6h14M8 11.8h14"/>',
  /* bakery — the oven mouth, an arch, and the hearth line */
  forn:'<path d="M9 12.6V9a6 6 0 0 1 12 0v3.6"/><path d="M6.5 12.6h17"/><path d="M13 12.6V9.6h4v3"/>',
  /* cellar — barrel ends in a rack */
  kantina:'<circle cx="9" cy="7.6" r="2.7"/><circle cx="15" cy="7.6" r="2.7"/><circle cx="21" cy="7.6" r="2.7"/>' +
          '<path d="M6 11.6h18"/>',
  /* catacombs — niches cut into two walls */
  katakombi:'<rect x="6" y="4" width="4" height="2.4"/><rect x="6" y="8" width="4" height="2.4"/>' +
            '<rect x="20" y="4" width="4" height="2.4"/><rect x="20" y="8.6" width="4" height="2.4"/>' +
            '<path d="M12 3.5v9"/><path d="M18 3.5v9"/>',
  /* theatre — the stage bar and an arc of seats */
  teatru:'<rect x="7" y="3" width="16" height="2.2" rx="0.6"/>' +
         '<path d="M6.5 8.6a9 9 0 0 0 17 0"/><path d="M8 11.8a7.4 7.4 0 0 0 14 0"/>',
  /* garden — a fountain, and four beds around it */
  gnien:'<circle cx="15" cy="8" r="4.6"/><circle cx="15" cy="8" r="1.7"/>' +
        '<rect x="5" y="4" width="3" height="3"/><rect x="22" y="4" width="3" height="3"/>' +
        '<rect x="5" y="9.4" width="3" height="3"/><rect x="22" y="9.4" width="3" height="3"/>',
  /* market — a grid of stalls */
  suq:'<rect x="6" y="4" width="4.6" height="3.4"/><rect x="12.7" y="4" width="4.6" height="3.4"/>' +
      '<rect x="19.4" y="4" width="4.6" height="3.4"/><rect x="6" y="9" width="4.6" height="3.4"/>' +
      '<rect x="12.7" y="9" width="4.6" height="3.4"/><rect x="19.4" y="9" width="4.6" height="3.4"/>',
  /* yacht — a pointed hull, from above */
  jott:'<path d="M15 2.6c4.6 3.4 5.6 7.6 4.6 10.4h-9.2C9.4 10.2 10.4 6 15 2.6z"/><path d="M15 4.4v8.6"/>',
  /* palace — the long table and its chairs */
  palazz:'<rect x="7" y="6" width="16" height="4" rx="1"/>' +
         '<circle cx="10" cy="4.2" r="1.1"/><circle cx="15" cy="4.2" r="1.1"/><circle cx="20" cy="4.2" r="1.1"/>' +
         '<circle cx="10" cy="11.8" r="1.1"/><circle cx="15" cy="11.8" r="1.1"/><circle cx="20" cy="11.8" r="1.1"/>',
  /* hotel — the reception desk and the pigeonholes behind it */
  lukanda:'<rect x="5.5" y="8.4" width="10.5" height="3.6" rx="1"/>' +
          '<rect x="18" y="3.4" width="6.5" height="6.6"/><path d="M18 5.6h6.5M18 7.8h6.5M21.25 3.4v6.6"/>',
  /* bocci club — the lane and two bowls */
  kazinbocci:'<rect x="4.5" y="5.6" width="21" height="5" rx="1.4"/>' +
             '<circle cx="9.5" cy="8.1" r="1.5"/><circle cx="20.5" cy="8.1" r="1.5"/><circle cx="15" cy="8.1" r="0.8"/>'
};
/* every slot gets its own hue, off the SLOT and not the case, so the six
   rooms stay six distinguishable colours whichever of the fifty cases is on
   the table (and so nothing shifts when the case changes). */
function roomHue(k){ return (k * 57 + 24) % 360; }
function roomTint(k){
  const h = roomHue(k);
  return '--t1:hsla(' + h + ',34%,34%,.80);--t2:hsla(' + h + ',36%,19%,.90)';
}
/* THE WALLS ARE DERIVED, NOT DRAWN BY HAND. Every corridor square touching
   the room rectangle IS a door (that is exactly what the engine's DOORS list
   is), so each side cell is either solid wall or a wall with a real opening
   in the middle of it. The plan therefore tells the truth about where you can
   walk in and out — which is worth more on a Cluedo board than any texture. */
function roomPlanSVG(k){
  /* the geometry is per case now — read the board off the state, never a
     module constant, or every case draws case 1's walls. */
  const brd = E.boardOf(M.st);
  const m = brd.ROOMS[k];
  const cols = m.c1 - m.c0 + 1, rows = m.r1 - m.r0 + 1;
  const W = cols * 10, H = rows * 10;
  const GAP = 4.4;                       /* the doorway, in the same units */
  const wall = [], sill = [];
  /* seg(): one cell-length of a side. `open` = a corridor is on the far side,
     so leave a centred gap and lay a gold threshold across it. */
  const seg = (open, x1, y1, x2, y2) => {
    if (!open){ wall.push('M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2); return; }
    const dx = x2 - x1, dy = y2 - y1, len = Math.abs(dx) + Math.abs(dy);
    const f = (len - GAP) / 2 / len;
    const ax = x1 + dx * f, ay = y1 + dy * f;
    const bx = x2 - dx * f, by = y2 - dy * f;
    wall.push('M' + x1 + ' ' + y1 + 'L' + ax.toFixed(2) + ' ' + ay.toFixed(2));
    wall.push('M' + bx.toFixed(2) + ' ' + by.toFixed(2) + 'L' + x2 + ' ' + y2);
    sill.push('M' + ax.toFixed(2) + ' ' + ay.toFixed(2) + 'L' + bx.toFixed(2) + ' ' + by.toFixed(2));
  };
  for (let c = m.c0; c <= m.c1; c++){
    const x = (c - m.c0) * 10;
    seg(E.corrIndexAt(brd, m.r0 - 1, c) >= 0, x, 0, x + 10, 0);       /* top */
    seg(E.corrIndexAt(brd, m.r1 + 1, c) >= 0, x, H, x + 10, H);       /* bottom */
  }
  for (let r = m.r0; r <= m.r1; r++){
    const y = (r - m.r0) * 10;
    seg(E.corrIndexAt(brd, r, m.c0 - 1) >= 0, 0, y, 0, y + 10);       /* left */
    seg(E.corrIndexAt(brd, r, m.c1 + 1) >= 0, W, y, W, y + 10);       /* right */
  }
  const card = E.roomCard(M.st, k);
  const id = card ? E.baseOf(card) : '';
  const glyph = PLAN_GLYPH[id] || '<rect x="9" y="5" width="12" height="6" rx="1"/><circle cx="15" cy="8" r="1.4"/>';
  const acc = 'hsl(' + roomHue(k) + ' 62% 74%)';
  /* preserveAspectRatio=none: the glyph space IS the room rectangle, so it
     stretches with the tile instead of leaving letterboxes at 360px. */
  return '<svg class="ms-plan" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<g transform="translate(' + ((W - 30) / 2) + ' ' + ((H - 20) / 2) + ')" fill="none" stroke="' + acc + '" ' +
      'stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round" opacity="0.34">' + glyph + '</g>' +
    '<path d="' + wall.join('') + '" fill="none" stroke="rgba(12,9,16,.85)" stroke-width="2.4" stroke-linecap="square"/>' +
    '<path d="' + wall.join('') + '" fill="none" stroke="' + acc + '" stroke-width="1.1" stroke-linecap="square" opacity="0.72"/>' +
    '<path d="' + sill.join('') + '" fill="none" stroke="#FFC542" stroke-width="0.7" opacity="0.55"/>' +
  '</svg>';
}

function boardHTML(){
  const st = M.st, brd = E.boardOf(st), out = [];
  for (let k = 0; k < brd.ROOMS.length; k++){
    const m = brd.ROOMS[k];
    const card = E.roomCard(st, k);
    const nm = card ? cardName(card) : '';
    out.push('<button type="button" class="ms-cellx ms-room" data-pos="' + k + '"' +
      ' style="grid-area:' + (m.r0 + 1) + '/' + (m.c0 + 1) + '/' + (m.r1 + 2) + '/' + (m.c1 + 2) + ';' +
        roomTint(k) + '"' +
      ' aria-label="' + esc(nm) + '">' +
      '<span class="ms-floor"></span>' +
      roomPlanSVG(k) +
      '<span class="ms-scrim"></span>' +
      '<span class="ms-rname">' + esc(nm) + '</span>' +
      '<span class="ms-toks" data-toks="' + k + '"></span>' +
      '<span class="ms-pip" hidden></span>' +
    '</button>');
  }
  brd.CORR.forEach((cell, i) => {
    const p = E.corrPos(brd, i);
    out.push('<button type="button" class="ms-cellx ms-corr" data-pos="' + p + '"' +
      ' style="grid-area:' + (cell.r + 1) + '/' + (cell.c + 1) + ';--rr:' + cell.r + ';--cc:' + cell.c + '"' +
      ' aria-label="' + esc(T('street', 'triq')) + '">' +
      '<span class="ms-toks" data-toks="' + p + '"></span>' +
      '<span class="ms-pip" hidden></span>' +
    '</button>');
  });
  return out.join('');
}

/* the disc a seat is drawn as. The initial is the label the spec asks for,
   but four machine detectives all begin with D — so a seat whose initial is
   shared falls back to its number rather than shipping four identical discs
   and leaving the colour to carry it alone. */
function tokenLabel(i){
  const ini = s => (String(s || '').trim().charAt(0) || '?').toUpperCase();
  const mine = ini(seatName(i));
  for (let j = 0; j < M.st.n; j++) if (j !== i && ini(seatName(j)) === mine) return String(i + 1);
  return mine;
}
/* where a seat is standing, in words, for the rail and the prompt */
function whereName(i){
  const room = E.roomOfSeat(M.st, i);
  return room >= 0 ? cardName(E.roomCard(M.st, room)) : T('in the street', 'fit-triq');
}

/* THE ONE NUMBER THE BOARD IS BUILT FROM. Measured from the box the board
   was given, never assumed: 390x844 and 360x640 leave very different slack
   and a constant here is what breaks the smaller one. */
function sizeBoard(){
  if (!UI || !UI.board || !UI.boardBox) return 0;
  /* the CONTENT box, not clientWidth — clientWidth still carries the box's own
     padding, and sizing the board from it made a board wider than the space it
     had, which max-width then squeezed into non-square cells. */
  const cs = getComputedStyle(UI.boardBox);
  const w = UI.boardBox.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  const h = UI.boardBox.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
  if (w <= 0 || h <= 0) return 0;
  const G = 2, PAD = 8;                       /* gap, and the felt's own padding */
  const cw = (w - PAD - G * (E.BOARD_W - 1)) / E.BOARD_W;
  const ch = (h - PAD - G * (E.BOARD_H - 1)) / E.BOARD_H;
  const c = Math.max(20, Math.floor(Math.min(cw, ch)));
  UI.board.style.setProperty('--c', c + 'px');
  return c;
}
let boxRO = null;
function watchBox(){
  stopWatchBox();
  if (!UI || !UI.boardBox) return;
  if (typeof ResizeObserver !== 'function'){ window.addEventListener('resize', sizeBoard); boxRO = 'win'; return; }
  boxRO = new ResizeObserver(() => sizeBoard());
  boxRO.observe(UI.boardBox);
}
function stopWatchBox(){
  if (!boxRO) return;
  if (boxRO === 'win') window.removeEventListener('resize', sizeBoard);
  else { try { boxRO.disconnect(); } catch(e){} }
  boxRO = null;
}

function paintBoard(){
  if (!UI || !UI.board) return;
  const st = M.st, view = viewSeat(), t = E.turn(st);
  /* the structure is rebuilt only when the CASE or the LANGUAGE changed —
     the first room's translated name is the cheapest witness of both. */
  const key = st.caseId + '|' + cardName(E.roomCard(st, 0));
  if (UI.board.dataset.k !== key){ UI.board.innerHTML = boardHTML(); UI.board.dataset.k = key; }

  const at = {};
  for (let i = 0; i < st.n; i++){
    const p = (st.pos || [])[i];
    if (!E.posOK(st, p)) continue;
    (at[p] = at[p] || []).push(i);
  }
  UI.board.querySelectorAll('.ms-toks').forEach(tray => {
    const list = at[+tray.dataset.toks] || [];
    /* data-seat so the walk can find and hold THIS seat's disc invisible
       while its stand-in travels the board — without it the destination
       token would already be sitting there before the walk had started. */
    tray.innerHTML = list.map(i =>
      '<span class="ms-tok' + (i === view ? ' me' : '') + (st.out[i] ? ' out' : '') +
        '" data-seat="' + i + '" style="--sc:' + seatHex(i) + '" title="' + esc(seatName(i)) + '">' +
        esc(tokenLabel(i)) + '</span>').join('');
  });

  /* ONE call to reachable() per paint — it is the same list the dock and the
     prompt reason about, so asking twice could only ever disagree. */
  const myTurn = canAct();
  const lit = (myTurn && !st.moved && st.roll > 0) ? E.reachable(st, view) : [];
  const on = {}; lit.forEach(p => { on[p] = 1; });
  UI.board.classList.toggle('lit', lit.length > 0);
  UI.board.querySelectorAll('.ms-cellx').forEach(cell => {
    const hot = !!on[+cell.dataset.pos];
    cell.classList.toggle('rch', hot);
    const pip = cell.querySelector('.ms-pip');
    if (pip) pip.hidden = !hot;
  });
  void t;
  sizeBoard();
  return lit;
}

function closeSheet(){ if (UI){ UI.sheet.classList.remove('open'); UI.sheet.setAttribute('aria-hidden', 'true'); cue('ui.back', { gain:0.7 }); } }
function openSheet(title){ if (!UI) return; UI.sheetT.textContent = title; UI.sheet.classList.add('open'); UI.sheet.setAttribute('aria-hidden', 'false'); cue('ui.sheet', { gain:0.8 }); }

/* the seat rail + turn indicator, and WHERE each detective is standing */
function paintSeats(){
  if (!UI) return;
  const st = M.st, t = E.turn(st);
  UI.seats.innerHTML = st.seats.map((s, i) =>
    '<div class="ms-seat' + (i === t ? ' turn' : '') + (st.out[i] ? ' out' : '') + '" style="--sc:' + seatHex(i) + '">' +
      '<span class="dot"></span>' +
      '<span><b>' + esc(seatName(i)) + (st.out[i] ? ' ' + esc(T('(out)', '(barra)')) : '') + '</b>' +
        '<i>' + esc(whereName(i)) + '</i></span>' +
    '</div>').join('');
}

/* ── THE DIE ──────────────────────────────────────────────────────────
   A real pipped face, drawn. Not a numeral (a "4" is a label, a die face is
   the object the player just threw) and never an emoji — house rule. */
const DIE_PIPS = {
  1:[[50,50]],
  2:[[32,32],[68,68]],
  3:[[32,32],[50,50],[68,68]],
  4:[[32,32],[68,32],[32,68],[68,68]],
  5:[[32,32],[68,32],[50,50],[32,68],[68,68]],
  6:[[32,28],[68,28],[32,50],[68,50],[32,72],[68,72]]
};
function diePips(n){
  return (DIE_PIPS[n | 0] || []).map(p =>
    '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="9" fill="#1a1410"/>').join('');
}
function dieSVG(n, anim){
  return '<svg class="ms-die' + (anim ? ' roll tumble' : '') + '" viewBox="0 0 100 100" ' +
    'role="img" aria-label="' + esc(T('die showing ' + (n | 0), 'daddu juri ' + (n | 0))) + '">' +
    '<rect x="6" y="6" width="88" height="88" rx="18" fill="#f6f1e6" stroke="rgba(0,0,0,.4)" stroke-width="3"/>' +
    '<g class="ms-pips">' + diePips(n) + '</g>' +
  '</svg>';
}

/* ── THE TUMBLE ───────────────────────────────────────────────────────
   A die that appears already showing its number is a label; a die that
   goes past a few faces and slows into one is an object that was thrown.
   The faces are swapped on a DECELERATING timer — the gap grows by a
   quarter each time — so it reads as something losing momentum rather
   than a strobe, and it always ends on the number the engine rolled,
   which is set unconditionally at the end whatever the timers did.

   The intermediate faces are cosmetic and use Math.random deliberately:
   nothing here touches st.rs, so it cannot fork the machine or disagree
   between two phones — the RESULT was decided by the engine before this
   was ever called. Under reduced() it is never called at all.        */
let dieTimer = 0;
function stopTumble(){ if (dieTimer){ clearTimeout(dieTimer); dieTimer = 0; } }
function tumbleDie(svg, finalN){
  stopTumble();
  if (!svg) return;
  const g = svg.querySelector('.ms-pips');
  if (!g) return;
  let gap = 62, spent = 0, prev = finalN;
  const settle = () => { dieTimer = 0; if (g.isConnected) g.innerHTML = diePips(finalN); };
  const tick = () => {
    dieTimer = 0;
    if (!g.isConnected) return;
    if (spent >= 470){ settle(); return; }
    let n = 1 + Math.floor(Math.random() * 6);
    if (n === prev) n = 1 + (n % 6);           /* never two identical faces in a row */
    prev = n;
    g.innerHTML = diePips(n);
    spent += gap; gap = Math.round(gap * 1.26);
    dieTimer = setTimeout(tick, gap);
  };
  dieTimer = setTimeout(tick, gap);
}

/* ── THE TURN, AND WHO MAY DRIVE IT ───────────────────────────────────
   canAct() is the one answer to "may this thumb move the game right now";
   the board's lit squares, the prompt and the dock all read it, so they can
   never disagree about whose turn it is. */
function canAct(){
  if (!M || !M.st) return false;
  const st = M.st, view = viewSeat(), t = E.turn(st);
  return (t === view) && !st.out[view] && !E.over(st) && isLocal(t) && !M.reveal;
}

/* roll → tap a lit square → suggest. Every one of these goes through
   doMove() so the log, the autosave and the AI drive stay correct. None of
   roll/move/passage advances the turn, so they render and stay put. */
function doRoll(src){
  const view = viewSeat();
  /* the roll window is closing whatever happens next — take the listener
     down FIRST, before any of the work, so an early return can never leave
     it running. render() below re-syncs it and will find it not wanted. */
  motionDetach();
  const res = doMove(view, { t:'roll' }, 'local');
  if (!res.ok){ cue('ui.error'); buzz('no'); return; }
  M.dieAnim = true;
  cue('board.flip', { gain:0.8 }, true);
  buzz('roll');                 /* the die starts tumbling */
  void src;
  render();
}

/* ═══════════════════════════════════════════════════════════════════
   SHAKE TO ROLL — an ACCELERATOR, never the only way in.

   THE ROLL BUTTON NEVER GOES ANYWHERE. Somebody playing one-handed on a
   bus, somebody with a tremor, somebody whose phone has no accelerometer
   at all, somebody who said no to the permission — every one of them plays
   the whole game with the button that has always been there. Shaking is a
   second door onto the same doRoll(), and that is the only thing it is.

   THE LISTENER LIVES EXACTLY AS LONG AS THE ROLL WINDOW. devicemotion
   fires 60 times a second and the radio behind it is not free; one left
   running behind a finished game is a battery leak nobody would ever see
   in a screenshot. So motionSync() is called at the end of every render()
   and asks one question — is it MY turn, have I not moved, and is the die
   still unrolled — and attaches or detaches on the answer. doRoll() takes
   it down before it does anything else, leave() and setupSheet() take it
   down on the way out, and the attach is idempotent.

   iOS ASKS ONCE. DeviceMotionEvent.requestPermission() must come from a
   user gesture, so it hangs off the Roll BUTTON and never off page load.
   A refusal is remembered in prefs for good: asking a second time is how a
   permission prompt turns into nagging, and the button still rolls. */
const SHAKE_DELTA = 16;      /* m/s^2 summed over the three axes            */
const SHAKE_GAP   = 900;     /* one shake is one roll, not a burst of six   */
let motionFn = null, motionLast = null, motionAt = 0, askedShake = false;

function shakeAvailable(){
  try {
    if (!window.DeviceMotionEvent) return false;
    if (reduced()) return false;              /* same gate the pack tilt uses */
    if (pref().shake === 'no') return false;  /* refused once, never again    */
    return true;
  } catch(e){ return false; }
}
function motionAttach(){
  if (motionFn || !shakeAvailable()) return;
  motionFn = ev => {
    try {
      const a = ev.accelerationIncludingGravity || ev.acceleration;
      if (!a) return;
      const x = +a.x || 0, y = +a.y || 0, z = +a.z || 0;
      const p = motionLast;
      motionLast = { x, y, z };
      if (!p) return;
      const d = Math.abs(x - p.x) + Math.abs(y - p.y) + Math.abs(z - p.z);
      if (d < SHAKE_DELTA) return;
      const now = Date.now();
      if (now - motionAt < SHAKE_GAP) return;
      motionAt = now;
      /* the same three conditions the window was opened on, re-asked at the
         moment of use: a shake that arrives one tick after the turn ended
         must do nothing at all. */
      if (!M || !M.st || !canAct() || M.st.moved || (M.st.roll | 0) !== 0) { motionDetach(); return; }
      doRoll('shake');
    } catch(e){}
  };
  try { window.addEventListener('devicemotion', motionFn); }
  catch(e){ motionFn = null; }
}
function motionDetach(){
  if (!motionFn) return;
  try { window.removeEventListener('devicemotion', motionFn); } catch(e){}
  motionFn = null; motionLast = null;
}
function motionSync(){
  const want = !!(M && M.st && !M.dead && canAct() && !M.st.moved && (M.st.roll | 0) === 0 && !E.over(M.st));
  if (want) motionAttach(); else motionDetach();
}
/* asked from the Roll button's own tap — a gesture, which is what iOS wants */
function askShake(){
  try {
    const DM = window.DeviceMotionEvent;
    if (!DM || typeof DM.requestPermission !== 'function') return;
    if (askedShake || pref().shake === 'ok' || pref().shake === 'no') return;
    askedShake = true;
    const r = DM.requestPermission();
    if (r && r.then) r.then(s => {
      pref({ shake: s === 'granted' ? 'ok' : 'no' });
      if (s === 'granted') motionSync();
    }).catch(() => { pref({ shake:'no' }); });
  } catch(e){ try { pref({ shake:'no' }); } catch(e2){} }
}
/* ── THE PATH, NOT JUST THE DESTINATION ───────────────────────────────
   reachable() hands back WHERE you may end up; walking needs HOW you get
   there. So this is the same breadth-first search over the same graph,
   with the same three rules — a room is a destination and never a junction,
   another detective's corridor square blocks entry and pass-through, and no
   square is visited twice — but keeping a parent pointer so the route can
   be read back off the end.

   IT IS A COPY OF A RULE THAT LIVES IN THE ENGINE, and that is a real cost,
   so it is fenced: the engine stays the only authority on whether the move
   is LEGAL (doMove has already said yes before this is drawn), and this is
   only ever asked for a picture. If the two ever disagree the picture loses
   — see startWalk, which places the token and gets on with it rather than
   arguing. blockedCorr is not exported, so it is rebuilt here from st.pos,
   which is the same public thing the engine reads it from. */
function movePath(st, seat, to){
  try {
    if (!st || !st.pos) return null;
    const B = E.boardOf(st);
    const from = st.pos[seat];
    const budget = st.roll | 0;
    if (!E.posOK(B, from) || !E.posOK(B, to) || budget <= 0 || from === to) return null;
    /* every square another seat stands on: no entry and no cutting through.
       Eliminated seats still hold theirs — they are still in the building. */
    const blocked = new Array(B.POS_MAX + 1).fill(false);
    for (let i = 0; i < st.n; i++){
      if (i === seat) continue;
      const p = st.pos[i];
      if (E.posCorr(B, p) >= 0) blocked[p] = true;
    }
    const prev = new Array(B.POS_MAX + 1).fill(-2);
    prev[from] = -1;
    const queue = [from];
    const dist = new Array(B.POS_MAX + 1).fill(-1);
    dist[from] = 0;
    for (let qi = 0; qi < queue.length; qi++){
      const p = queue[qi], d = dist[p];
      if (d >= budget) continue;
      if (E.posIsRoom(p) && p !== from) continue;      /* arrived in a room → stop */
      const nbrs = B.NEIGH[p];
      for (let k = 0; k < nbrs.length; k++){
        const q = nbrs[k];
        if (dist[q] >= 0) continue;
        if (blocked[q]) continue;
        dist[q] = d + 1; prev[q] = p; queue.push(q);
      }
    }
    if (dist[to] < 0) return null;
    const out = [];
    for (let p = to; p !== -1 && p !== -2; p = prev[p]) out.push(p);
    out.reverse();
    return (out.length >= 2 && out[0] === from) ? out : null;
  } catch(e){ return null; }
}

/* ── THE TOKEN WALKS ──────────────────────────────────────────────────
   The move is ALREADY applied and rendered when this starts: the engine,
   the log and the autosave are done with it, and what is on screen is the
   truth. All this does is hold the arrived token invisible for a moment
   and send a stand-in disc along the route it took, one square every
   110ms, transform only.

   NEVER BLOCKS INPUT. A tap anywhere during the walk finishes it on the
   spot — the disc snaps to the end, the real token comes back and whatever
   was going to happen next happens immediately. Nothing waits on the
   animation: it holds no lock, and cancelling it is always safe, because
   the only state it owns is a hidden style on one span.

   Under reduced() there is no walk at all — the token is simply there —
   but the arrival still buzzes, because the MOMENT is what the player is
   being told about, not the picture of it.

   EVERY SEAT WALKS, NOT JUST YOURS. A machine detective and a detective on
   another phone take the same route through the same corridors, and at a
   real table you watch where they went — that is a deduction cue, and a
   token that teleports throws it away. So aiTurn() and onlineRemote() drive
   this same walk (never a second animation) with `silent` set, which is the
   ONE difference that matters: the per-step tick and the arrival thud are
   the player's own hand being told what the player's own thumb did. Buzzing
   for somebody else's token is a phone that will not stop shaking. */
const WALK_MS = 110;
const LAND_MS = 90;        /* clear of js/sfx.js's 40ms two-buzz merge guard */
let W = null;              /* the walk in flight, or null */
/* the squares the LAST walk actually put the token on, kept for the test
   hook so "it animated the real path" is an assertion and not a claim */
let lastTrace = null, lastAnimated = false;
/* the last few walks, whoever made them — the test hook reads this to prove
   an AI's or a remote seat's route was a real path and ended where the
   engine says that seat stands. Capped: it is a ring, not a log. */
const walkHist = [];
/* how long a walk down this path will actually take on screen, 0 when
   nothing will animate (reduced motion, no board, a path of one square).
   Read exactly once, by afterMove(), to keep the next bot think from
   repainting the board out from under a token that is still mid-corridor. */
function walkMs(path){
  if (!path || path.length < 2 || reduced() || !UI || !UI.board) return 0;
  return (path.length - 1) * WALK_MS + LAND_MS;
}
function walkXY(p){
  if (!UI || !UI.board || !UI.boardBox) return null;
  const cell = UI.board.querySelector('.ms-cellx[data-pos="' + p + '"]');
  if (!cell) return null;
  const a = cell.getBoundingClientRect(), b = UI.boardBox.getBoundingClientRect();
  if (!a.width || !a.height) return null;
  return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2, cell };
}
/* End the walk NOW, from anywhere, any number of times. `quiet` is for
   leaving the game: the disc comes off the board but nobody is owed a buzz
   or a room card for a move they walked out on. */
function endWalk(quiet){
  const w = W; if (!w) return;
  W = null;
  if (quiet){ w.landed = true; w.done = null; }
  if (w.timer){ clearTimeout(w.timer); w.timer = 0; }
  try { if (w.tapOff) w.tapOff(); } catch(e){}
  try { if (w.ov && w.ov.parentNode) w.ov.remove(); } catch(e){}
  try { if (w.tok && w.tok.isConnected) w.tok.style.visibility = ''; } catch(e){}
  try { (w.trail || []).forEach(c => { if (c && c.isConnected) c.classList.remove('trail'); }); } catch(e){}
  /* the arrival is owed either way: if the walk was cut short it never got
     to the last square, and a move with no buzz at all reads as a dropped tap.
     Owed to the PLAYER, though — a silent walk is somebody else's token and
     the hand holding this phone is owed nothing for it. */
  if (!w.landed){ w.landed = true; if (!w.silent) buzz(landKind(w.path[w.path.length - 1])); }
  lastTrace = w.trace.slice();
  walkHist.push({ seat:w.seat, silent:!!w.silent, animated:!!w.pts, trace:w.trace.slice() });
  if (walkHist.length > 60) walkHist.shift();
  const fn = w.done; w.done = null;
  if (fn) { try { fn(); } catch(e){} }
}
/* `silent` — this token is not the player's own: animate it, buzz for nothing. */
function startWalk(seat, path, done, silent){
  endWalk();
  silent = !!silent;
  const finish = () => { if (done) { const f = done; done = null; f(); } };
  const last = path && path.length ? path[path.length - 1] : null;
  /* no path, no board, or the player asked for no motion → place and buzz */
  if (!UI || !UI.board || reduced() || !path || path.length < 2){
    lastTrace = last == null ? [] : [last]; lastAnimated = false;
    if (last == null){ finish(); return; }
    /* nobody's hand to tell and no picture to draw: the token is already
       standing where the engine put it, so there is nothing left to do. */
    if (silent){
      walkHist.push({ seat, silent:true, animated:false, trace:[last] });
      if (walkHist.length > 60) walkHist.shift();
      finish(); return;
    }
    /* THE ARRIVAL IS DEFERRED BY ONE BEAT, not skipped and not fired inline.
       js/sfx.js merges two buzzes closer together than 40ms so they cannot
       smear, and the tap that caused this landed only a few milliseconds
       ago. Fired inline, the arrival — the 'thud' of walking into a room,
       the most meaningful buzz on this board — would be swallowed whole by
       the press tick, and with the walk animation off there is nothing else
       left to say you got there. 90ms is still instant to a hand. */
    W = { path:[last], pts:null, ov:null, tok:null, seat, i:0, landed:false, silent,
          trail:[], done:finish, tapOff:null, trace:[last], timer:0 };
    W.timer = setTimeout(() => { if (W) W.timer = 0; endWalk(); }, LAND_MS);
    return;
  }
  /* A SQUARE THAT COULD NOT BE MEASURED IS NOT A REASON TO LOSE A TOKEN.
     The route was only ever a picture; render() has already stood the token
     on the engine's square. Drop the picture, keep the position. */
  const pts = path.map(walkXY);
  if (pts.some(p => !p)){
    lastTrace = [last]; lastAnimated = false;
    if (silent){
      walkHist.push({ seat, silent:true, animated:false, trace:[last] });
      if (walkHist.length > 60) walkHist.shift();
      finish(); return;
    }
    W = { path:[last], pts:null, ov:null, tok:null, seat, i:0, landed:false, silent,
          trail:[], done:finish, tapOff:null, trace:[last], timer:0 };
    W.timer = setTimeout(() => { if (W) W.timer = 0; endWalk(); }, LAND_MS);
    return;
  }
  lastAnimated = true;
  const tok = UI.board.querySelector('.ms-toks[data-toks="' + last + '"] .ms-tok[data-seat="' + seat + '"]');
  const ov = document.createElement('span');
  ov.className = 'ms-walk snap';
  ov.style.setProperty('--sc', seatHex(seat));
  ov.textContent = tokenLabel(seat);
  ov.style.transform = 'translate(' + pts[0].x + 'px,' + pts[0].y + 'px)';
  UI.boardBox.appendChild(ov);
  if (tok) tok.style.visibility = 'hidden';
  W = { path, pts, ov, tok, seat, i:0, timer:0, landed:false, silent, trail:[], done:finish, tapOff:null,
        trace:[path[0]] };
  /* a tap ANYWHERE finishes the walk — capture phase so it lands before the
     board's own click handler, and one-shot so it can never outlive the walk. */
  try {
    const host = M && M.ctx && M.ctx.host;
    if (host){
      const h = () => endWalk();
      host.addEventListener('pointerdown', h, true);
      W.tapOff = () => { try { host.removeEventListener('pointerdown', h, true); } catch(e){} };
    }
  } catch(e){}
  requestAnimationFrame(() => { if (W && W.ov === ov) ov.classList.remove('snap'); step(); });

  function step(){
    const w = W; if (!w || w.ov !== ov) return;
    w.i++;
    const p = w.path[w.i], pt = w.pts[w.i];
    ov.style.transform = 'translate(' + pt.x + 'px,' + pt.y + 'px)';
    /* the square just left glows for a beat, so the route is readable */
    const prevCell = w.pts[w.i - 1].cell;
    if (prevCell && !E.posIsRoom(w.path[w.i - 1])){
      prevCell.classList.add('trail'); w.trail.push(prevCell);
    }
    w.timer = setTimeout(() => {
      const cur = W; if (!cur || cur.ov !== ov) return;
      cur.timer = 0;
      cur.trace.push(p);
      if (cur.i >= cur.path.length - 1){ cur.landed = true; if (!cur.silent) buzz(landKind(p)); endWalk(); return; }
      if (!cur.silent) buzz('tick');
      step();
    }, WALK_MS);
  }
}

function boardTap(to){
  const view = viewSeat();
  /* the route is read BEFORE the move applies — afterwards st.pos and
     st.roll are the destination and zero, and the path is unrecoverable. */
  const path = movePath(M.st, view, to);
  const res = doMove(view, { t:'move', to }, 'local');
  if (!res.ok){ cue('ui.error'); buzz('no'); return; }
  cue('ui.tap');
  render();
  startWalk(view, path && path[path.length - 1] === to ? path : [to],
    () => roomEntryCard(E.posRoom(M.st.pos[view])));
}
function doPassage(){
  const view = viewSeat();
  const res = doMove(view, { t:'passage' }, 'local');
  if (!res.ok){ cue('ui.error'); buzz('no'); return; }
  cue('board.flip', { gain:0.9 }, true);
  buzz('thud');                 /* you did not walk there — you stepped through a wall */
  render();
  roomEntryCard(E.posRoom(M.st.pos[view]));
}

/* ── THE PAINTING, PROMOTED ───────────────────────────────────────────
   art/misteru/<location>.png is a perspective interior. On a 156x104
   overhead floor tile it was a smudge; here — the moment YOU walk in — it
   is big enough to actually look at, which is the only place it earns its
   keep on this screen. Only the local seat's own arrivals: three machine
   detectives popping a card each every lap would be noise, not atmosphere.
   Pointer-events stay off so it can never swallow the next tap, and it
   clears itself; reduced motion just shows it and takes it away again. */
let enterTimer = 0;
function roomEntryCard(slot){
  if (!M || !M.ctx || !(slot >= 0)) return;
  const box = M.ctx.host.querySelector('#ms-boardbox');
  if (!box) return;
  const old = box.querySelector('.ms-enter'); if (old) old.remove();
  if (enterTimer){ clearTimeout(enterTimer); enterTimer = 0; }
  const card = E.roomCard(M.st, slot); if (!card) return;
  const id = E.baseOf(card);
  const ov = document.createElement('div');
  ov.className = 'ms-enter';
  ov.innerHTML = artLayer(id, drawnLocation(id)) +
    '<span><b>' + esc(cardName(card)) + '</b>' +
      '<i>' + esc(T('You step inside.', 'Tidħol ġewwa.')) + '</i></span>';
  box.appendChild(ov);
  const soft = reduced();
  if (soft) ov.classList.add('in');
  else requestAnimationFrame(() => { if (ov.isConnected) ov.classList.add('in'); });
  enterTimer = setTimeout(() => {
    enterTimer = 0;
    if (!ov.isConnected) return;
    if (soft){ ov.remove(); return; }
    ov.classList.remove('in');
    setTimeout(() => { if (ov.isConnected) ov.remove(); }, 260);
  }, soft ? 1200 : 1900);
}
function doPass(){
  const view = viewSeat();
  const res = doMove(view, { t:'pass' }, 'local');
  if (!res.ok){ cue('ui.error'); buzz('no'); return; }
  cue('ui.back', { gain:0.7 });
  render(); afterMove();
}

/* the prompt + the dock are ONE decision — read off st.roll / st.moved and
   the room the seat is standing in — so the sentence and the buttons under
   it can never describe two different turns. `lit` is the reachable list the
   board just drew, passed in rather than recomputed. */
function turnPlan(lit){
  const st = M.st, view = viewSeat();
  const room = E.roomOfSeat(st, view);
  const pos = (st.pos || [])[view];
  const passTo = E.passageFrom(st, pos);
  const B = (id, label, cls, go, w, icon, hap) => ({ id, label, cls, go, w: w || 1, icon, hap });

  if (!st.moved && st.roll === 0){
    /* the BUTTON is the way to roll and always will be; the shake is an
       extra door onto the same call. The prompt mentions it only when this
       phone can actually do it, so nobody is told to shake a laptop. */
    const btns = [B('ms-roll', T('Roll the die', 'Itfa\' d-daddu'), 'primary',
                    () => { askShake(); doRoll('btn'); }, 2, null, 'skip')];
    if (passTo >= 0)
      btns.push(B('ms-secret', T('Secret passage', 'Passaġġ sigriet'), 'ghost', doPassage, 1, null, 'skip'));
    btns.push(B('ms-accuse', T('Accuse', 'Akkuża'), 'ghost', () => openPicker('accuse'), 1, 'flag'));
    return { txt: shakeAvailable()
      ? T('Roll the die — or shake the phone.', 'Itfa\' d-daddu — jew ħawwad it-telefon.')
      : T('Roll the die.', 'Itfa\' d-daddu.'), die:0, btns };
  }
  if (!st.moved && st.roll > 0){
    /* boxed in: every square within reach is occupied. legal() always keeps a
       pass, and without offering it here the turn could never end. */
    if (!lit.length){
      return { txt: T('You rolled ' + st.roll + ' — nowhere to go.', 'Tfajt ' + st.roll + ' — imkien fejn tmur.'),
        die: st.roll,
        btns: [B('ms-pass', T('Pass', 'Aqbeż'), 'primary', doPass, 2),
               B('ms-accuse', T('Accuse', 'Akkuża'), 'ghost', () => openPicker('accuse'), 1, 'flag')] };
    }
    return { txt: T('You rolled ' + st.roll + ' — tap a lit square.', 'Tfajt ' + st.roll + ' — agħfas kwadru mixgħul.'),
      die: st.roll,
      btns: [B('ms-accuse', T('Accuse', 'Akkuża'), 'ghost', () => openPicker('accuse'), 1, 'flag')] };
  }
  if (room >= 0){
    const nm = cardName(E.roomCard(st, room));
    return { txt: T('You are in ' + nm + '.', 'Int f\'' + nm + '.'), die:0,
      btns: [B('ms-suggest', T('Suggest here', 'Issuġġerixxi hawn'), 'primary', () => openPicker('suggest'), 2, 'search'),
             B('ms-accuse', T('Accuse', 'Akkuża'), 'ghost', () => openPicker('accuse'), 1, 'flag'),
             B('ms-pass', T('Pass', 'Aqbeż'), 'ghost', doPass, 1)] };
  }
  return { txt: T('Nothing to search out here.', 'M\'hemm xejn x\'tfittex hawn barra.'), die:0,
    btns: [B('ms-pass', T('Pass', 'Aqbeż'), 'primary', doPass, 2),
           B('ms-accuse', T('Accuse', 'Akkuża'), 'ghost', () => openPicker('accuse'), 1, 'flag')] };
}

/* the dock: contextual, and the SAME three-state read the prompt uses */
function paintDock(lit){
  if (!UI) return;
  const st = M.st, t = E.turn(st);
  let btns;
  if (!canAct()){
    /* off-turn the dock is not a row of dead buttons: the notebook is the one
       thing you genuinely can do while a detective thinks. */
    btns = [{ id:'ms-nbk', label:T('Notebook', 'Ktejjeb'), cls:'ghost', icon:'book', w:1, go:() => openNotebook() },
            { id:'ms-wait', w:1, cls:'ghost', off:true,
              label: E.over(st) ? T('Case closed', 'Il-każ magħluq')
                                : T(seatName(t) + '…', seatName(t) + '…') }];
  } else {
    btns = turnPlan(lit).btns;
  }
  UI.dock.style.gridTemplateColumns = btns.map(b => (b.w || 1) + 'fr').join(' ');
  UI.dock.innerHTML = btns.map(b =>
    '<button class="btn ' + (b.cls || 'ghost') + '" id="' + b.id + '"' +
      (b.hap ? ' data-hap="' + b.hap + '"' : '') +
      (b.off ? ' disabled style="opacity:.5"' : '') + '>' +
      (b.icon ? ico(b.icon) + ' ' : '') + esc(b.label) + '</button>').join('');
  btns.forEach(b => {
    if (b.off || !b.go) return;
    const el = UI.dock.querySelector('#' + b.id);
    if (el) el.onclick = b.go;
  });
}

function paintStrip(lit){
  if (!UI) return;
  const st = M.st;
  let txt, die = 0;
  if (E.over(st)){ txt = TE(E.note(st)); }
  else if (canAct()){
    /* MY turn: the prompt beats the news. What to do next is the one thing a
       player cannot work out for themselves. */
    const plan = turnPlan(lit);
    txt = plan.txt; die = plan.die;
  } else {
    const t = E.turn(st);
    const sug = st.lastSug;
    if (sug){
      const shower = (sug.by >= 0) ? seatName(sug.by) : T('nobody', 'ħadd');
      txt = T(seatName(sug.seat) + ' suggested ' + cardName(sug.s) + ', ' + cardName(sug.w) + ', ' + cardName(sug.l) + '. ',
              seatName(sug.seat) + ' issuġġerixxa ' + cardName(sug.s) + ', ' + cardName(sug.w) + ', ' + cardName(sug.l) + '. ') +
        (sug.by >= 0 ? T(shower + ' showed a card.', shower + ' wera karta.') : T('No one could show a card!', 'Ħadd ma seta\' juri karta!'));
    } else {
      txt = T(seatName(t) + ' is thinking…', seatName(t) + ' qed jaħseb…');
    }
  }
  const anim = !!M.dieAnim && !reduced();
  M.dieAnim = false;
  if (!anim) stopTumble();
  UI.strip.innerHTML = (die > 0 ? dieSVG(die, anim) : '') +
    '<span class="ms-msg">' + esc(txt) + '</span>';
  /* reduced motion gets the number and nothing else — no tumble, no spin */
  if (anim && die > 0) tumbleDie(UI.strip.querySelector('.ms-die'), die);
}

function render(){
  if (!M || !UI) return;
  /* a repaint rewrites every token tray, so a walk still in flight is
     holding a reference to a span that is about to be thrown away. Finish
     it first — it never owned anything but a hidden style. */
  endWalk();
  paintSeats();
  const lit = paintBoard() || [];
  paintStrip(lit); paintDock(lit);
  /* LAST, and on every paint: the roll window may have just opened or just
     closed, and this is the one place that knows which. */
  motionSync();
}

/* ═══════════════════════════════════════════════════════════════════
   THE SUGGESTION / ACCUSATION PICKER — pick a suspect + weapon + place.
   ═══════════════════════════════════════════════════════════════════ */
let pickerSel = { s:null, w:null, l:null };
function openPicker(kind){
  const st = M.st, cs = E.theCase(st);
  pickerSel = { s:null, w:null, l:null };
  /* THE PLACE IS NOT A CHOICE IN A SUGGESTION. The engine's check() refuses
     any suggestion naming a room other than the one you are standing in — so
     the row shows that room, already chosen and not selectable, with one line
     saying why. Letting the player pick freely and then swallowing the refusal
     is how a rule turns into a bug report. */
  const lockRoom = (kind === 'suggest') ? E.roomOfSeat(st, viewSeat()) : -1;
  const lockCard = lockRoom >= 0 ? E.roomCard(st, lockRoom) : null;
  if (lockCard) pickerSel.l = lockCard;
  const rowFor = (cat, title) => {
    const ids = (cat === 'l' && lockCard) ? [E.baseOf(lockCard)] : cs[cat];
    return '<div class="ms-pickrow"><div class="ms-lbl">' + esc(title) + '</div>' +
      '<div class="ms-pickgrid" data-cat="' + cat + '">' +
        ids.map(id => { const card = E.cardOf(cat, id);
          const locked = (cat === 'l' && lockCard);
          return '<button class="ms-pk' + (locked ? ' on' : '') + '"' + (locked ? ' disabled' : '') +
            ' data-card="' + esc(card) + '">' + cardArt(card) +
            '<span>' + esc(TE(E.nameOfCard(card))) + '</span></button>'; }).join('') +
      '</div>' +
      ((cat === 'l' && lockCard)
        ? '<p class="pt-ledger" style="margin:6px 0 0">' +
          esc(T('You may only ask about the room you are standing in.',
                'Tista\' tistaqsi biss dwar il-kamra fejn qiegħed int.')) + '</p>' : '') +
      '</div>';
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
  if (!res.ok){ cue('ui.error'); buzz('no'); return; }
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
  if (!res.ok){ cue('ui.error'); buzz('no'); return; }
  /* WRONG, and you are out. The engine has already stamped it; the buzz is
     the head-shake. A RIGHT accusation says nothing here — the win buzz is
     owed once, at the solve, and firing both would be two answers. */
  if (M.st.out[seat]) buzz('no');
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
  buzz('double');            /* two beats: a card was shown to YOU, privately */
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

  /* YOUR HAND LIVES HERE NOW. The board took the middle of the screen, so the
     cards you hold moved into the notebook — the one place you are already
     looking when you reason about who holds what. */
  const nbSol = nb.solution || {};
  UI.sheetB.innerHTML =
    '<div class="ms-lbl" style="margin-top:2px">' + esc(T('Your hand', 'L-id tiegħek')) + '</div>' +
    '<div class="ms-myhand">' +
      (myHand.length ? myHand.map(c => '<span class="ms-chip">' + cardArt(c) + esc(cardName(c)) + '</span>').join('')
                     : '<span class="pt-ledger">' + esc(T('(hidden — tap "I\'m ready" on your turn)', '(moħbija — agħfas "Lest" fuq id-dawra tiegħek)')) + '</span>') +
    '</div>' +
    '<div class="ms-lbl">' + esc(T('What you have deduced', 'X\'iddeduċejt')) + '</div>' +
    '<div class="ms-myhand">' +
      E.CATS.map(cat => {
        const label = cat === 's' ? T('Suspect', 'Suspettat') : cat === 'w' ? T('Weapon', 'Arma') : T('Place', 'Post');
        const card = nbSol[cat];
        return '<span class="ms-chip" style="border-color:' + (card ? '#e0b84e' : 'rgba(255,255,255,.1)') + '">' +
          (card ? cardArt(card) + esc(cardName(card)) : '<b style="color:#a89f8e">' + esc(label) + ': ?</b>') + '</span>';
      }).join('') +
    '</div>' +
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
  /* A WALK THIS PHONE IS ABOUT TO DRAW, IN MILLISECONDS — set by whoever is
     about to call startWalk() for a seat that is not the local player, and
     consumed HERE, exactly once, so it can never leak into a later and
     unrelated afterMove(). It only ever pushes out THIS phone's own bot
     think-timer, so a token is not repainted out from under itself
     mid-corridor; nothing waits on it, no other phone is delayed by it, and
     it is capped so a long route cannot stall the table. */
  const hold = Math.max(0, Math.min(M.walkHold | 0, 900));
  M.walkHold = 0;
  if (E.over(M.st)){ finish(); return; }
  if (M.reveal) return;                       /* wait for the reveal overlay */
  const t = E.turn(M.st);
  if (t < 0){ finish(); return; }
  const o = ownerOf(t);
  if (o === 'ai'){
    if (M.online && M.net && M.net.host === false) return;    /* only host drives bots online */
    stopThinking();
    M.timer = setTimeout(() => { M.timer = 0; aiTurn(t); }, reduced() ? 120 : Math.max(620, hold + 120));
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
  /* THE ROUTE IS READ BEFORE THE MOVE APPLIES — exactly as boardTap does it,
     and for the same reason: afterwards st.pos is the destination and st.roll
     is zero, so the path is unrecoverable. Reconstructing it later is not an
     option, so it is captured here or not at all. */
  const path = (mv.t === 'move' && mv.to != null) ? movePath(M.st, seat, mv.to) : null;
  const res = doMove(seat, mv, 'auto');
  if (!res.ok){ doMove(seat, { t:'pass' }, 'auto'); }
  if (mv.t === 'suggest') cue('card.throw', { gain:0.6 });
  else if (mv.t === 'accuse') cue('duel.boss', { gain:0.8 }, true);
  render();
  if (E.over(M.st)){ finish(); return; }
  /* the machine's token walks the corridor it actually took, and buzzes for
     nothing: it is not this player's move. Started AFTER afterMove(), because
     afterMove() repaints and a repaint ends any walk in flight — the hold
     above is what stops its next think-timer landing mid-walk. */
  const walk = (res.ok && path && path[path.length - 1] === mv.to) ? path : null;
  M.walkHold = walkMs(walk);
  afterMove();
  if (walk) startWalk(seat, walk, null, true);
}

/* ═══════════════════════════════════════════════════════════════════
   THE END — the dramatic solution reveal → shared winner screen.
   ═══════════════════════════════════════════════════════════════════ */
function finish(){
  if (!M || M.finished) return;
  M.finished = true;
  stopThinking();
  motionDetach();            /* the game is over: no turn, no roll, no listener */
  const st = M.st, me = viewSeat();
  const v = E.verdict(st, me);
  /* exactly once — finish() is fenced by M.finished — and only for a win.
     A loss already had its own 'no' at the wrong accusation. */
  if (v && v.tone === 'win') buzz('win');
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

  /* ── THE PAY, exactly once, under the match id ────────────────────
     The podium never calls P.ui.result, so the wrap progress.js hangs
     on it never fires: pay here through KARTI_XP.awardPlay (idempotent
     under the match id) and settle a staked pot through mp.js's own
     idempotent door. A case with NO winner at all (reason 'nobody' —
     every detective accused wrong and is out) is a finish with no
     rebbieħ: nobody may take the pot, so every ante goes home through
     stakeAbort — refusing to pay is recoverable, overpaying is not. */
  const MPX = window.KARTI_MP;
  const staked = !!(M.net && MPX && MPX.MP && MPX.MP.stakeLive);
  const mid = 'misteru:' + (M.net && MPX && MPX.MP && MPX.MP.code ? MPX.MP.code : 'local') +
              ':' + (M.seed >>> 0);
  const iWon = !!(v && v.tone === 'win');
  let pay = null;
  if (window.KARTI_XP && KARTI_XP.awardPlay){
    try {
      const r = KARTI_XP.awardPlay({ game:'misteru', won: iWon, id: mid, ranked: staked });
      if (r && r.counted) pay = r;
    } catch(e){}
  }
  try {
    if (window.KARTI_STATS && KARTI_STATS.record)
      KARTI_STATS.record('misteru', { result: iWon ? 'win' : 'loss', id: mid });
  } catch(e){}
  let potRes = null;
  if (staked){
    try {
      if (winner < 0){ if (MPX.stakeAbort) MPX.stakeAbort(); }
      else if (MPX.stakeSettle) potRes = MPX.stakeSettle(iWon ? 'win' : 'lose');
    } catch(e){}
  }

  show({
    title: head,
    subtitle: T('Case #' + st.caseId + ' — ' + TE(E.theCase(st).title), 'Każ #' + st.caseId + ' — ' + TE(E.theCase(st).title)),
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
    onPlayAgain: M.net ? null : () => setupSheet(),
    onLeave: back
  });
}

/* ═══════════════════════════════════════════════════════════════════
   LEAVE — tidy up, no confirm.
   ═══════════════════════════════════════════════════════════════════ */
function leave(){
  stopThinking();
  stopWatchBox();          /* a ResizeObserver left on a detached board is a leak */
  /* and so is a devicemotion listener, only worse: it keeps a sensor awake
     for as long as the tab lives. Down it comes, first, unconditionally. */
  motionDetach();
  endWalk(true);
  stopTumble();
  if (enterTimer){ clearTimeout(enterTimer); enterTimer = 0; }
  if (M){ M.dead = true; }
  M = null; UI = null;
}

/* ═══════════════════════════════════════════════════════════════════
   ONLINE — turn-based move relay (like erbgha), with HIDDEN info dealt
   privately per seat. See the PRIVATE-DEAL note below for what js/mp.js /
   the server must supply.
   ═══════════════════════════════════════════════════════════════════ */
/* ── THE BOARD CROSSES THE WIRE — and who broadcasts what ─────────────
   The engine publishes `rol` / `mov` / `psg` alongside `sug`, `acc`,
   `pass` and `quit` (js/misteru.js, THE WIRE). Two different routes, and
   the split is about HIDDEN INFORMATION, not about rank:

     · roll / move / passage / pass — NO hidden information. Anybody may
       resolve them: check() is the same on every phone, the die comes out
       of st.rs which every phone replays identically, and the position is
       one small integer. So the SEAT THAT MADE THE MOVE broadcasts it and
       every client replays it. They do NOT go through hostReferee — a
       referee here would only add a round trip and a second source of
       truth for a number both ends already agree on.
     · suggest / accuse — hidden information (who holds what, and the
       solution). Only the host knows, so a non-host whispers a request
       and applies nothing until the host's stamped echo comes back.

   The onMove hook below is where those two rules are actually written. */
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
  /* KEEP THE ROSTER. buildState re-deals the table and deal() (humans:0)
     stamps EVERY seat own:'ai' — so without carrying the roster across the
     rebuild, every remote HUMAN got reclassified as a bot, and the host's
     afterMove() would then play their turns for them with aiTurn() while
     their real requests bounced off the turn guard. Carry the seat roster
     onlineStart built (own/name/lvl, from the lobby chairs) across. */
  const roster = M.st.seats.map(s => ({ own:s.own, name:s.name, lvl:s.lvl }));
  M.st = buildState(M.opts, M.seed, M.log);
  M.st.seats.forEach((s, g) => {
    const prev = roster[g];
    if (prev){ s.own = prev.own; s.name = prev.name; s.lvl = prev.lvl; }
    if (g === me) s.own = 'me';
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

/* ── THE WIRE ORDER — this exact array IS the wire ────────────────────
   mp.js's toWire/fromWire walk a FIELD ORDER against a bitmask: field n
   is bit n. So the order is a published contract and this list is
   APPEND-ONLY, for the same reason the engine's own WIRE_FIELDS is.

   Note the one thing that is NOT `E.WIRE_FIELDS.concat(['sg'])` any more,
   and why. `sg` — the true suggester's room seat — has sat at INDEX 6
   since this game shipped, and it is the field that tells every phone WHO
   a host-refereed move belongs to. The engine appended its new `to` at
   its own index 6; concatenating `sg` after it would have shoved `sg` to
   7, which is an INSERT as far as the wire is concerned. A phone on an
   older cached build walks its own six-field list plus `sg` at 6 against
   OUR mask, so every `sug`, `acc` and `pass` it received would have come
   out naming the wrong seat (or no seat), been refused by check(), and
   stopped its table — for the four moves that work online today.
   So `to` goes at the END of THIS list, after `sg`. Same set of names as
   the engine's contract, one order, appended to — and the guard below
   says so out loud if the engine ever grows a field this list forgot. */
const WIRE_ORDER = ['s', 'w', 'l', 'by', 'cd', 'r', 'sg', 'to'];
E.WIRE_FIELDS.forEach(f => {
  if (WIRE_ORDER.indexOf(f) < 0)
    console.error('IL-MISTERU wire: the engine declares "' + f + '" and the wire order does not carry it. ' +
                  'APPEND it to WIRE_ORDER (never insert) or the field will not travel.');
});

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
  /* FOLD ONTO THE {a,n,k} CODEC the wire actually speaks. A raw {t,…}
     object went out here before, and every receiving phone's fromWire()
     — which reads an action name in `a` and a field bitmask in `n` —
     returned null and dropped it silently. So no host-refereed
     suggestion or accusation ever reached the other phones: the host's
     board moved, everybody else's sat waiting, and a finished case (and
     its pot) existed on one phone only. Same fold L-ISPJUN's olSend
     does, over this game's own published field list. */
  let mask = 0; const vals = [];
  WIRE_ORDER.forEach((f, at) => {
    const v = w[f];
    if (v === undefined || v === null) return;
    mask |= (1 << at);
    vals.push(v === true ? 1 : v === false ? 0 : (Number(v) | 0));
  });
  const out = { a: w.t, n: mask };
  if (vals.length) out.k = vals;
  NET.move('move', out);
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
  /* the route BEFORE apply, for the same reason boardTap reads it before its
     own move: st.pos and st.roll are rewritten by it and the path is gone. */
  const path = (mv.t === 'move' && mv.to != null) ? movePath(M.st, g, mv.to) : null;
  const r = doMove(g, mv, 'net');
  if (!r.ok) return { ok:false, why:String(r.err || 'refused') };
  render();
  if (E.over(M.st)){ finish(); return null; }
  /* THE OTHER PHONE'S TOKEN WALKS ON THIS ONE TOO. Purely decoration over a
     state change that has already landed: the wire is never waited on, the
     next message repaints and collapses this walk to the newer one, and the
     buzz stays off because this hand did not make the move. `mine` is belt
     and braces — an echo of my own move would be refused by doMove above. */
  const mine = (g === viewSeat());
  const walk = (!mine && path && path[path.length - 1] === mv.to) ? path : null;
  M.walkHold = walkMs(walk);
  afterMove();
  if (walk) startWalk(g, walk, null, true);
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
    /* THE RELAY ECHOES EVERY WHISPER BACK TO ITS SENDER as a delivery receipt
       (karti_server's chat(): `seats.add(conn.slot)`). So the moment the host
       whispers a shown card to a remote suggester, that same card comes
       straight back to the HOST — and the "ignore my own echo" line below only
       catches it while a reveal is still open, which on the host it never is.
       What actually happened, caught by a two-client run: the host flip-
       revealed to ITSELF a card that had been shown privately to somebody
       else, ticked its own notebook with it, and — because canAct() is false
       while a reveal is pending — sat behind a "Got it" it had to tap before
       it could move again. Data-dependent, too: it only fires once the host
       has a suggestion of its own that was refuted, which is why it survived.
       The host never needs this message at all: when the host is the
       suggester, hostReferee reveals locally and deliberately does not
       self-whisper. So: not for the host, and only from the REFEREE.
       The second half is not just tidiness — this channel is open to every
       seat at the table, so a `ms-show` from anyone but the host is another
       player forging a reveal and writing a lie into your notebook. */
    if (amHost()) return;
    if (fromRoomSeat !== hostRoomSeat()) return;
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
      const rec = info.rec || info.move;
      const t = rec && rec.t;
      /* THE OPEN MOVES — roll, move, passage, pass. No hidden information in
         any of them, so the seat that made one sends it itself and every
         other client replays it. This is the whole board fix: without it a
         non-host rolled and walked on its OWN phone only, the host went on
         believing that seat was still on its starting corridor square, and
         the first suggestion it whispered was refused by the host's check()
         (you may only suggest from the room you stand in) and dropped in
         silence — a table that looks alive and can never move again. */
      const OPEN = (t === 'roll' || t === 'move' || t === 'passage' || t === 'pass');
      /* suggest/accuse are broadcast by hostBroadcast, fully stamped and with
         the shown card stripped. Never here — that would double-send them and
         put the refuted card on the public wire. */
      if (!OPEN && t !== 'quit') return;
      /* quit stays host-only: online it is synthesised from the relay's
         seatGone on every phone at once, so a broadcast would be an echo. */
      if (t === 'quit' && !amHost()) return;
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
  /* THE WIRE — the engine's fields PLUS `sg`, the true suggester's ROOM seat,
     in the ONE append-only order WIRE_ORDER declares (read the note there
     before touching it: the order is the contract, and `sg` may not move).
     The host is the sole referee for a suggestion/accusation: it resolves one
     and BROADCASTS it, but the relay stamps that broadcast as coming from the
     HOST's seat — so the resolved move must carry `sg` to name the seat it was
     actually made for. mp.js's toWire REFUSES any field not in this list, so
     `sg` MUST be declared here (a room seat, fits a byte), and so must the
     engine's `to` (a position — bounded by the engine's own posOK, not by a
     number written down here). See onMove/onlineRemote below. */
  wire: { fields: WIRE_ORDER },
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
    paintBoard, sizeBoard, turnPlan, canAct, dieSVG, boardTap, doRoll, doPassage, doPass,
    /* feel: the walk, the shake window, the warm-up */
    movePath, startWalk, endWalk, warmBoards, buzz, reduced,
    motionSync, motionAttach, motionDetach, shakeAvailable, askShake,
    get motionOn(){ return !!motionFn; },
    get walkTrace(){ return W ? W.trace.slice() : (lastTrace || []); },
    get walkAnimated(){ return lastAnimated; },
    get walking(){ return !!W; },
    /* every walk, whoever made it: {seat, silent, animated, trace} */
    get walkLog(){ return walkHist.map(w => ({ seat:w.seat, silent:w.silent, animated:w.animated, trace:w.trace.slice() })); },
    clearWalkLog: () => { walkHist.length = 0; },
    walkMs,
    onlineStart, onlinePrivate, onlineRemote, onlineWhisper, buildState,
    hostReferee, sendMoveOnline, encReq, parseReq, hostResolveRefuter, hostBroadcast,
    get M(){ return M; }, get UI(){ return UI; },
    engine: E, LOBBY, hooks: NET_HOOKS, online: P.online.misteru, leave, viewSeat, afterMove
  };
}

})();
