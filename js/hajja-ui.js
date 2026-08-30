/* ═══════════════════════════════════════════════════════════════════
   KARTI — hajja-ui.js
   IL-ĦAJJA — the screens. js/hajja.js is the pure engine and is not
   touched from here: this file only ever asks it questions and hands
   it moves through E.apply().

   WHAT IS ON SCREEN
     A REAL BOARD, bigger than the phone, that you pan, pinch, double-tap
     and FIT — the same gesture kit js/kiri-ui.js already got right, kept
     deliberately identical so the two boards feel like the same box.
     A CAR PER PLAYER in their own colour with the pegs actually drawn in
     it (you, a spouse, up to four children) — that toy is the game, and
     a peg count is not a picture of it.
     A SPINNER you spin. The engine decides the number BEFORE a single
     pixel moves; the wheel is then animated TO it. An animation that
     picked the number would be a second, disagreeing, source of truth.

   THE WIRE — READ THIS BEFORE CHANGING IT
     The engine publishes WIRE_FIELDS = ['t','v'], and that list cannot
     go on the relay as it stands:
       · js/mp.js's toWire() runs Math.floor(Number(x)) over EVERY name in
         the list. 't' always holds the action word ('spin'), which is
         NaN, so every single move would be refused. The action is already
         carried separately in `a` (WIRE_SKIP), so 't' must not be a field
         at all — no other engine here lists it.
       · fromWire() does `mv.v = !!mv.v`. A career id, a house id or a
         stock number 1..10 all arrive as `true`.
     So the payload rides ONE APPENDED INTEGER FIELD, 'c', and the lobby
     publishes ['v','c'] — the engine's list with the un-sendable name
     dropped and the new one APPENDED, never inserted. Nothing is removed
     from the middle, and 'v' stays declared (unused) so an older decoder
     still lines up. encMove/decMove below are the only two places that
     know the codes. See docs/AGENT-LOG.md.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function (){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_HAJJA = window.KARTI_HAJJA || {};
if (!P || !R.engine) return;
const E = R.engine;

const esc = (K && K.esc) || (s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');
const clone = o => JSON.parse(JSON.stringify(o));
const T  = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
const TE = pair => pair ? T(pair.en, pair.mt) : '';

/* ── money ─────────────────────────────────────────────────────────
   The engine counts in whole euro thousands, so the screen says so. */
function money(v){
  v = v | 0;
  return (v < 0 ? '−' : '') + '€' + Math.abs(v) + 'k';
}
function signed(v){ return (v > 0 ? '+' : v < 0 ? '−' : '') + '€' + Math.abs(v | 0) + 'k'; }

/* ── the six seat colours, straight off the engine ─────────────────
   carOf(seat) is deterministic, so every phone paints the same car in
   the same chair with nothing on the wire. */
const carOf   = i => E.carOf(i);
const carHex  = i => carOf(i).hex;
const carName = i => T(carOf(i).n, carOf(i).mt);

/* mix a hex towards another, for the peg highlight and the car shading */
function mix(a, b, t){
  const p = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  const x = p(a), y = p(b);
  const c = i => Math.round(x[i] + (y[i] - x[i]) * t);
  const h = n => ('0' + n.toString(16)).slice(-2);
  return '#' + h(c(0)) + h(c(1)) + h(c(2));
}

/* ═══════════════════════════════════════════════════════════════════
   WHAT THIS PHONE REMEMBERS
   ═══════════════════════════════════════════════════════════════════ */
const STORE = 'karti_hajja_v1';
const SAVE_V = 1;
let ST = { v:1, pref:{}, rec:{ w:0, l:0, d:0 }, save:null };
try {
  const raw = localStorage.getItem(STORE);
  if (raw){
    const o = JSON.parse(raw);
    if (o && typeof o === 'object'){
      ST.pref = o.pref || {};
      ST.rec  = Object.assign({ w:0, l:0, d:0 }, o.rec || {});
      ST.save = o.save || null;
    }
  }
} catch(e){}
let persistT = 0;
function persist(){
  if (persistT) return;
  persistT = setTimeout(persistNow, 220);
}
function persistNow(){
  if (persistT){ clearTimeout(persistT); persistT = 0; }
  try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){}
}
function pref(patch){ if (patch){ Object.assign(ST.pref, patch); persist(); } return ST.pref; }
function saveSlot(s){ ST.save = s || null; persist(); }

/* ── the three machines ────────────────────────────────────────────── */
function levels(){
  return (E.LEVELS || []).map(L => ({ level:L.level, name:L.name, note:L.note }));
}
function levelName(k){
  const L = levels().find(x => x.level === k);
  return (L && L.name) || T('Machine', 'Magna');
}
function levelNote(k){
  const L = levels().find(x => x.level === k);
  return L ? TE(L.note) : '';
}

/* ═══════════════════════════════════════════════════════════════════
   SOUND — existing ids only (js/sfx.js). One gate so a cascade of
   footsteps does not machine-gun the mixer.
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
function note(step, gain){
  const S = window.KARTI_SFX;
  if (!S || !S.note) return;
  try { S.note(step, { gain: gain == null ? 0.5 : gain }); } catch(e){}
}
function haptic(kind){
  const S = window.KARTI_SFX;
  if (!S || !S.haptic) return;
  try { S.haptic(kind); } catch(e){}
}
function reduced(){
  try {
    if (document.body && document.body.classList.contains('reduced')) return true;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch(e){ return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE CODEC — see the header block. Everything a hajja move can
   say fits in ONE integer 0..255.
   ═══════════════════════════════════════════════════════════════════ */
const WIRE = ['v', 'c'];
const CAREER_IDS = (E.CAREERS || []).map(c => c.id);
const HOUSE_IDS  = (E.HOUSES  || []).map(h => h.id);
const INS_IDS    = ['car', 'home'];

function encMove(mv){
  const m = (E.encWire ? E.encWire(mv) : mv) || mv;
  if (!m || !m.t) return null;
  let c = 0;
  switch (m.t){
    case 'fork':   c = (m.v === 'uni') ? 1 : 0; break;
    case 'career': c = m.v ? CAREER_IDS.indexOf(m.v) + 1 : 0; break;
    case 'house':  c = m.v ? HOUSE_IDS.indexOf(m.v) + 1 : 0; break;
    case 'ins':    c = m.v ? INS_IDS.indexOf(m.v) + 1 : 0; break;
    case 'stock':  c = Math.max(0, Math.min(10, m.v | 0)); break;
    default:       c = 0; break;                 /* spin, loan carry nothing */
  }
  if (c < 0 || c > 255) return null;
  return { t: m.t, c: c };
}
function decMove(w){
  if (!w || !w.t) return null;
  const c = w.c | 0;
  switch (w.t){
    case 'fork':   return { t:'fork',   v: c ? 'uni' : 'work' };
    case 'career': return { t:'career', v: c ? (CAREER_IDS[c - 1] || '') : '' };
    case 'house':  return { t:'house',  v: c ? (HOUSE_IDS[c - 1] || '')  : '' };
    case 'ins':    return { t:'ins',    v: c ? (INS_IDS[c - 1] || '')    : '' };
    case 'stock':  return { t:'stock',  v: Math.max(0, Math.min(10, c)) };
    case 'spin':   return { t:'spin' };
    case 'loan':   return { t:'loan' };
    default:       return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   THE RUNNER — one match, and ONE door every move goes through.
   ═══════════════════════════════════════════════════════════════════ */
let M = null;      /* the live match */
let UI = null;     /* the board's handles */
const moveSubs = [];
const stateSubs = [];
function fireList(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }

function newSeed(){ return (E.newSeed ? E.newSeed() : (Math.random() * 0x100000000) | 0) >>> 0; }

function buildState(opts, seed, log){
  const st = E.newGame(opts, seed);
  for (let i = 0; i < log.length; i++){
    const seat = E.turn(st);
    if (seat < 0) break;
    const r = E.apply(st, seat, log[i]);
    if (!r || !r.ok) break;
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
    st: null, ctx: null, meta: null, net: null,
    timer: 0, animT: 0, wheelT: 0, goneT: 0,
    dead: false, finished: false, recorded: false,
    anim: null, rot: 0, aiFails: 0, gone: null,
    sheet: null, solePot: null, startedAt: Date.now()
  };
  M.st = buildState(M.opts, M.seed, M.log);
  return M;
}
function stopThinking(){
  if (!M) return;
  if (M.timer){ clearTimeout(M.timer); M.timer = 0; }
  if (M.animT){ clearTimeout(M.animT); M.animT = 0; }
  if (M.wheelT){ clearTimeout(M.wheelT); M.wheelT = 0; }
  if (M.goneT){ clearTimeout(M.goneT); M.goneT = 0; }
}

/* ownership lives here; the engine only knows seat numbers.
   meta[i] = { own:'me'|'hot'|'ai'|'net', name, lvl } */
function seatCount(){ return M && M.st ? M.st.seats : 2; }
function ownerOf(i){ return (M && M.meta && M.meta[i] && M.meta[i].own) || 'ai'; }
const isLocal = i => { const o = ownerOf(i); return o === 'me' || o === 'hot'; };
function seatLvl(i){ return (M && M.meta && M.meta[i] && M.meta[i].lvl) || 2; }
function seatName(i){
  if (!M || !M.meta || !M.meta[i]) return carName(i);
  const m = M.meta[i];
  if (m.own === 'me') return m.name || T('You', 'Int');
  if (m.own === 'hot') return m.name || (T('Player', 'Plejer') + ' ' + (i + 1));
  if (m.own === 'ai') return levelName(m.lvl);
  return m.name || carName(i);
}
function firstLocalSeat(){
  for (let i = 0; i < seatCount(); i++) if (isLocal(i)) return i;
  return -1;
}
/* the seat this thumb is allowed to move right now */
function actingSeat(){
  if (!M || !M.st) return -1;
  const t = E.turn(M.st);
  return (t >= 0 && isLocal(t)) ? t : -1;
}

/* THE gate. Thumb, machine, wire and replay all measure here. */
function doMove(seat, move, src){
  if (!M || M.dead) return { ok:false, err:'no game' };
  if (E.over(M.st)) return { ok:false, err:'game over' };
  const rec = clone(move);
  const res = E.apply(M.st, seat, rec);
  if (!res || !res.ok) return { ok:false, err:(res && res.err) || 'illegal' };
  const idx = M.log.length;
  M.log.push(rec);
  autosave();
  /* the ENCODED move goes to subscribers — js/mp.js is one of them and
     what it receives is what goes on the wire */
  const enc = encMove(rec);
  fireList(moveSubs, { seat, move: enc || rec, raw: clone(rec), index: idx, src: src || 'local' });
  fireList(stateSubs, { reason:'move', index: idx });
  return { ok:true, index: idx };
}

function snapshot(){
  if (!M) return null;
  return { v:SAVE_V, gid:'hajja', opts:clone(M.opts), seed:M.seed,
           log:clone(M.log), meta:clone(M.meta || null) };
}
function autosave(){
  if (!M || M.net) return;
  if (E.over(M.st)){ saveSlot(null); return; }
  saveSlot(snapshot());
}

/* ═══════════════════════════════════════════════════════════════════
   THE LAYOUT — computed ONCE from the engine's own board.
   Board space is a fixed 960 × 1480 rectangle in "board units"; the view
   transform below is the only thing that ever scales it, so every
   position in here is a constant and nothing reflows when you pinch.

   The shape is the shape of the game: a fork at the top, the long
   UNIVERSITY spur snaking down the left, the short WORK spur dropping
   down the right, and the two of them merging into the shared road,
   which serpentines to RETIRE at the bottom.
   ═══════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════
   THE ROUTE

   A real Game of Life board is not a grid. It is a NARROW WINDING RIBBON
   of small tiles through a landscape that takes up most of the board, and
   the tiles lean with the road. The serpentine this file shipped with was
   a spreadsheet by comparison, and no amount of scenery fixed it, because
   a 6-column grid of 128px buttons leaves no room for a landscape to be.

   So the route is a SPLINE now. Three of them: the study loop swinging
   out west, the work road running straight down the middle, and the long
   meander they both feed. Tiles are placed at even ARC LENGTH along each
   one and rotated to its tangent, which is what makes the board read as a
   road you drive rather than a table you scan.

   The whole point of a curve is the POCKETS it leaves. Those are named in
   sceneSVG() and they are where the island lives; if you move a waypoint,
   you move a pocket, and something in the scenery will end up under a
   tile.
   ═══════════════════════════════════════════════════════════════════ */
/* The board is bigger than the route needs on purpose: the route's own
   bounding box is x 92..1130 / y 140..1975, and an island has to have a
   COAST outside its roads. OFF pushes the whole route inboard so there is
   sea on every side of it. */
const BW = 1340, BH = 2140;
const OFF = [50, 62];
const TW = 70, TH = 54;                  /* an ordinary tile             */

/* Catmull-Rom through the waypoints, sampled densely, plus the running
   arc length -- even SPACING is what stops tiles bunching on the bends. */
function spline(P0){
  const P = P0.map(q => [q[0] + OFF[0], q[1] + OFF[1]]);
  const at = i => P[Math.max(0, Math.min(P.length - 1, i))];
  const S = [];
  for (let i = 0; i < P.length - 1; i++){
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2), N = 26;
    for (let k = (i ? 1 : 0); k <= N; k++){
      const t = k / N, t2 = t * t, t3 = t2 * t;
      S.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t +
              (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
              (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t +
              (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
              (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      ]);
    }
  }
  const L = [0];
  for (let i = 1; i < S.length; i++)
    L.push(L[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]));
  return { S, L, total: L[L.length - 1] };
}
/* a point and a HEADING at fraction u of the way along, by arc length */
function along(sp, u){
  const d = Math.max(0, Math.min(1, u)) * sp.total;
  let i = 1;
  while (i < sp.L.length - 1 && sp.L[i] < d) i++;
  const seg = Math.max(1e-6, sp.L[i] - sp.L[i - 1]);
  const f = (d - sp.L[i - 1]) / seg, A = sp.S[i - 1], B = sp.S[i];
  let ang = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI;
  /* a tile on a leg heading west would print its word upside down */
  if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
  return { x: A[0] + (B[0] - A[0]) * f, y: A[1] + (B[1] - A[1]) * f, a: ang };
}

const LAY = (function (){
  const B = E.BOARD, n = B.sq.length, pos = new Array(n);

  const START = [320, 140];
  const JOIN  = [460, 830];
  /* the study road: the long way round, west, with the most stops on it */
  const UNI  = spline([START, [160, 215], [92, 392], [100, 575], [180, 715],
                       [320, 790], JOIN]);
  /* the work road: short, straight, and only four stops -- which IS the
     difference between the two lives, drawn rather than written */
  const WORK = spline([START, [470, 262], [546, 432], [546, 610], [480, 746], JOIN]);
  /* and the meander both of them feed, out to the far corner */
  const ROAD = spline([JOIN, [665, 862], [860, 840], [1030, 895], [1130, 1035],
                       [1085, 1175], [925, 1240], [712, 1240], [508, 1218],
                       [305, 1250], [165, 1370], [165, 1530], [305, 1638],
                       [508, 1682], [712, 1682], [900, 1714], [1050, 1810],
                       [1075, 1938], [940, 1975]]);

  pos[0] = { x:START[0] + OFF[0], y:START[1] + OFF[1], w:250, h:86, a:0, big:1 };

  const lay = (sp, from, to, u0, u1) => {
    const c = to - from;
    for (let i = 0; i < c; i++){
      const q = along(sp, c === 1 ? (u0 + u1) / 2 : u0 + (u1 - u0) * i / (c - 1));
      pos[from + i] = { x:q.x, y:q.y, w:TW, h:TH, a:q.a };
    }
  };
  lay(UNI,  B.uniAt,  B.uniEnd,  0.07, 0.95);
  lay(WORK, B.workAt, B.workEnd, 0.12, 0.84);
  lay(ROAD, B.joinAt, n,         0.02, 0.995);

  return { pos, uni:UNI.S, work:WORK.S, road:ROAD.S };
})();

/* ═══════════════════════════════════════════════════════════════════
   HOW A SQUARE LOOKS. One letter of engine kind → a colour, an icon and
   a word short enough to read at FIT. The square's own long sentence is
   never squeezed in here: it goes in the ticker when somebody lands on
   it, and in the sheet when you tap it.
   ═══════════════════════════════════════════════════════════════════ */
const ICONS = {
  fork:  'M12 21v-8M12 13L5 4M12 13l7-9',
  pay:   'M2 7h20v10H2zM12 9a3 3 0 100 6 3 3 0 000-6',
  tile:  'M12 3l2.6 5.5 6 .9-4.3 4.2 1 6-5.3-2.8L6.7 19.6l1-6L3.4 9.4l6-.9z',
  up:    'M12 19V5M6 11l6-6 6 6',
  down:  'M12 5v14M6 13l6 6 6-6',
  job:   'M3 8h18v11H3zM9 8V5h6v3',
  baby:  'M12 5a4 4 0 100 8 4 4 0 000-8M4 21c1.6-4.4 4.4-6.5 8-6.5s6.4 2.1 8 6.5',
  cap:   'M12 4L2 9l10 5 10-5zM6 12v4c0 1.6 2.7 3 6 3s6-1.4 6-3v-4',
  wasla: 'M10 13a3.5 3.5 0 010-5l2-2a3.5 3.5 0 015 5l-1 1M14 11a3.5 3.5 0 010 5l-2 2a3.5 3.5 0 01-5-5l1-1',
  stock: 'M3 17l5-6 4 3 6-8M17 6h4v4',
  shield:'M12 3l8 3v6c0 5-3.4 8.2-8 9.4C7.4 20.2 4 17 4 12V6z',
  rings: 'M9 15a4.5 4.5 0 100-9 4.5 4.5 0 000 9M15 15a4.5 4.5 0 100-9 4.5 4.5 0 000 9',
  house: 'M3 11l9-7 9 7M5.5 10v10h13V10',
  flag:  'M5 21V4M5 5h13l-3 4 3 4H5',
  road:  'M12 4v3M12 11v3M12 18v3'
};
function svgIcon(d, cls){
  return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' +
         '<path d="' + d + '"/></svg>';
}

/* colour · icon · short word, for one square */
function face(i){
  const sq = E.BOARD.sq[i];
  if (!sq) return { c:'road', ic:ICONS.road, t:'' };
  switch (sq.k){
    case 'S': return { c:'fork', ic:ICONS.fork,  t:T('THE FORK', 'IL-FERGĦA') };
    case 'P': return { c:'pay',  ic:ICONS.pay,   t:T('PAYDAY', 'PAGA') };
    case 'L': return { c:'tile', ic:ICONS.tile,  t:T('ĦAJJA', 'ĦAJJA') };
    case 'C': return { c:'job',  ic:ICONS.job,   t:T('A JOB', 'XOGĦOL') };
    case 'B': return { c:'baby', ic:ICONS.baby,
                       t: sq.n > 1 ? T('TWINS', 'TEWMIN') : T('A BABY', 'TARBIJA') };
    case 'T': return { c:'uni',  ic:ICONS.cap,   t:T('TUITION', 'MIŻATA') };
    case 'W': return { c:'wasla',ic:ICONS.wasla, t:T('IL-WASLA', 'IL-WASLA') };
    case 'K': return { c:'stock',ic:ICONS.stock, t:T('STOCK', 'AZZJONI') };
    case 'I': return { c:'ins',  ic:ICONS.shield,t:T('INSURANCE', 'ASSIGURAZZJONI') };
    case 'X': return sq.stop === 'marry'
                ? { c:'stop', ic:ICONS.rings, t:T('MARRY', 'IŻŻEWWEĠ'), stop:1 }
              : sq.stop === 'house'
                ? { c:'stop', ic:ICONS.house, t:T('BUY A HOUSE', 'IXTRI DAR'), stop:1 }
                : { c:'end',  ic:ICONS.flag,  t:T('RETIRE', 'IRTIRA'), stop:1 };
    case 'E': {
      const v = sq.v || 0;
      if (sq.tax) return { c:'bad', ic:ICONS.down, t:T('TAX', 'TAXXA') };
      return v >= 0
        ? { c:'good', ic:ICONS.up,   t: signed(v) }
        : { c:'bad',  ic:ICONS.down, t: signed(v) };
    }
    default: return { c:'road', ic:ICONS.road, t:'' };
  }
}
/* the long sentence, for the ticker and the tap sheet */
function squareText(i){
  const sq = E.BOARD.sq[i];
  return sq ? (sq.t || '') : '';
}

/* ═══════════════════════════════════════════════════════════════════
   THE CAR, AND THE PEGS IN IT — the toy at the centre of the game, so
   it is drawn, not counted. Six sockets in a 3×2 grid on the body: a
   filled peg is somebody, an empty socket is a seat still going. The
   driver ('me') wears a pale ring, a child is drawn smaller — the pegs
   themselves take the CAR's colour, never a colour for a sex.
   ═══════════════════════════════════════════════════════════════════ */
const PEG_AT = [[19,17],[36,17],[53,17],[19,29],[36,29],[53,29]];
function carSVG(seat, pegs, opts){
  opts = opts || {};
  const hex  = carHex(seat);
  const lite = mix(hex, '#FFFFFF', 0.46);
  const dark = mix(hex, '#000000', 0.55);
  const id   = 'hjc' + seat + (opts.tag || '');
  let s = '<svg class="hj-carsvg" viewBox="0 0 72 46" aria-hidden="true">' +
    '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + mix(hex, '#FFFFFF', 0.30) + '"/>' +
      '<stop offset="1" stop-color="' + mix(hex, '#000000', 0.22) + '"/>' +
    '</linearGradient></defs>' +
    /* wheels */
    '<rect x="10" y="31" width="16" height="11" rx="5" fill="#15101F"/>' +
    '<rect x="46" y="31" width="16" height="11" rx="5" fill="#15101F"/>' +
    /* body */
    '<path d="M6 34V16a6 6 0 016-6h38l14 10v14a2 2 0 01-2 2H8a2 2 0 01-2-2z" ' +
      'fill="url(#' + id + ')" stroke="' + dark + '" stroke-width="2"/>' +
    /* the bonnet's light edge */
    '<path d="M50 10l14 10h-9a5 5 0 01-5-5z" fill="' + lite + '" opacity=".55"/>';
  /* the sockets, then whoever is in them */
  for (let i = 0; i < E.CAR_SEATS; i++){
    const p = PEG_AT[i], who = pegs && pegs[i];
    if (!who){
      s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="5" fill="' + dark + '" opacity=".72"/>';
      continue;
    }
    const r = who.k === 'kid' ? 5.2 : 6.2;
    s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + r + '" fill="' + lite + '" ' +
         'stroke="' + (who.k === 'me' ? '#FFFFFF' : dark) + '" stroke-width="' +
         (who.k === 'me' ? 2 : 1.4) + '"/>' +
         '<circle cx="' + (p[0] - 1.6) + '" cy="' + (p[1] - 1.8) + '" r="1.7" ' +
         'fill="#FFFFFF" opacity=".8"/>';
  }
  return s + '</svg>';
}

/* ═══════════════════════════════════════════════════════════════════
   THE SPINNER FACE — ten sectors, 1..10, clockwise from twelve. The
   pointer never moves; the disc does. Sector k covers [k·36, (k+1)·36)
   degrees, so landing on v means turning the disc to −((v−1)·36 + 18).
   ═══════════════════════════════════════════════════════════════════ */
function wheelSVG(){
  let s = '<svg class="hj-wdisc-svg" viewBox="0 0 100 100" aria-hidden="true">';
  for (let k = 0; k < 10; k++){
    const a0 = (k * 36 - 90) * Math.PI / 180, a1 = ((k + 1) * 36 - 90) * Math.PI / 180;
    const x0 = (50 + 47 * Math.cos(a0)).toFixed(2), y0 = (50 + 47 * Math.sin(a0)).toFixed(2);
    const x1 = (50 + 47 * Math.cos(a1)).toFixed(2), y1 = (50 + 47 * Math.sin(a1)).toFixed(2);
    s += '<path d="M50 50L' + x0 + ' ' + y0 + 'A47 47 0 0 1 ' + x1 + ' ' + y1 + 'Z" fill="' +
         (k % 2 ? '#2B1F4C' : '#3E2D6B') + '"/>';
    const am = ((k + 0.5) * 36 - 90) * Math.PI / 180;
    s += '<text x="' + (50 + 33 * Math.cos(am)).toFixed(2) + '" y="' +
         (50 + 33 * Math.sin(am) + 4).toFixed(2) + '" text-anchor="middle" ' +
         'class="hj-wt">' + (k + 1) + '</text>';
  }
  return s + '<circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,197,66,.55)" ' +
         'stroke-width="2.5"/></svg>';
}
function wheelTarget(v){ return (360 - (((v - 1) * 36 + 18) % 360)) % 360; }

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, every rule scoped to #scr-party.
   ═══════════════════════════════════════════════════════════════════ */
let cssDone = false;
function injectCSS(){
  if (cssDone || document.getElementById('hj-runtime-css')){ cssDone = true; return; }
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'hj-runtime-css';
  st.textContent =
    '#scr-party{--hj-gold:var(--gold,#FFC542);--hj-ink:#0C0818}' +

    /* THE HOST TAKES THE WHOLE PHONE. The frame's own sizer is stopped
       the line after frame() returns, so nothing stamps a square size
       over this column. .pt-host already bleeds 6px each side; stretch
       claims the rest. */
    '#scr-party .pt-host.hj-host{align-items:stretch;justify-content:stretch;overflow:visible}' +
    '#scr-party .hj-wrap{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;' +
      'gap:5px;position:relative}' +

    /* ── the seat rail ── */
    '#scr-party .hj-seats{flex:0 0 auto;display:flex;gap:5px;overflow-x:auto;overflow-y:hidden;' +
      'padding:1px 2px 2px;scrollbar-width:none;-webkit-overflow-scrolling:touch}' +
    '#scr-party .hj-seats::-webkit-scrollbar{display:none}' +
    '#scr-party .hj-seat{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:3px 9px 3px 4px;' +
      'border-radius:11px;border:1px solid rgba(255,255,255,.09);background:rgba(0,0,0,.30);' +
      'color:var(--txt);-webkit-tap-highlight-color:transparent;cursor:pointer}' +
    '#scr-party .hj-seat.on{background:rgba(255,197,66,.15);border-color:rgba(255,197,66,.62)}' +
    '#scr-party .hj-seat.out{opacity:.5}' +
    '#scr-party .hj-seat .hj-mini{width:34px;height:22px;flex:0 0 auto;display:block}' +
    '#scr-party .hj-seat .col{display:flex;flex-direction:column;gap:1px;align-items:flex-start;min-width:0}' +
    '#scr-party .hj-seat .n{font:900 9px/1.1 var(--disp);letter-spacing:.05em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.7);max-width:84px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .hj-seat.on .n{color:var(--hj-gold)}' +
    '#scr-party .hj-seat .h{font:900 11px/1 var(--disp);color:rgba(255,255,255,.92);' +
      'font-variant-numeric:tabular-nums}' +

    /* ── THE STAGE. The board is a physical thing bigger than the glass,
         so this box clips and the board inside it is moved with ONE
         transform. touch-action:none is what stops the browser taking
         the pinch before we see it; the page itself still cannot
         scroll, because nothing here changes the document's height. ── */
    '#scr-party .hj-stage{flex:1 1 auto;min-height:120px;min-width:0;position:relative;' +
      'overflow:hidden;border-radius:14px;touch-action:none;' +
      '-webkit-user-select:none;user-select:none;' +
      'background:#2E86B8;' +
      'border:1px solid rgba(255,197,66,.16);' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.07),inset 0 -18px 30px rgba(0,0,0,.35)}' +
    '#scr-party .hj-board{position:absolute;left:0;top:0;transform-origin:0 0;' +
      'width:' + BW + 'px;height:' + BH + 'px;will-change:transform}' +
    '#scr-party .hj-scene{position:absolute;inset:0;width:100%;height:100%;display:block;'+'pointer-events:none}' +
    '#scr-party .hj-scene text{font-family:var(--disp);font-weight:900;'+
      'letter-spacing:.06em;text-anchor:middle}' +
    '#scr-party .hj-roads{position:absolute;inset:0;width:100%;height:100%;display:block;'+'pointer-events:none}' +

    /* ── a square ── */
    '#scr-party .hj-sq{position:absolute;padding:0;border-radius:9px;' +
      'border:2px solid rgba(255,255,255,.92);transform-origin:50% 50%;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;' +
      'color:#fff;font-family:var(--disp);overflow:hidden;cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent;' +
      'box-shadow:inset 0 2px 0 rgba(255,255,255,.28),inset 0 -6px 10px rgba(0,0,0,.28),' +
      '0 3px 7px rgba(40,26,10,.42)}' +
    '#scr-party .hj-sq svg{width:21px;height:21px;flex:0 0 auto;fill:none;stroke:currentColor;' +
      'stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round;opacity:.95}' +
    '#scr-party .hj-sq b{font:900 9px/1.02 var(--disp);letter-spacing:.02em;text-align:center;' +
      'padding:0 2px;text-shadow:0 1px 1px rgba(0,0,0,.35)}' +
    '#scr-party .hj-sq.big{border-radius:16px;border-width:3px}' +
    '#scr-party .hj-sq.big svg{width:40px;height:40px}' +
    '#scr-party .hj-sq.big b{font-size:21px;letter-spacing:.1em}' +
    '#scr-party .hj-sq.k-road{background:linear-gradient(180deg,#FFFDF6,#E7DCC2);' +
      'color:#8A7448}' +
    '#scr-party .hj-sq.k-road svg{width:16px;height:16px}' +
    '#scr-party .hj-sq.k-fork{background:linear-gradient(180deg,#FFD36B,#E09A15);color:#3A2600}' +
    '#scr-party .hj-sq.k-pay{background:linear-gradient(180deg,#5BE79B,#1FA65E);color:#04301B}' +
    '#scr-party .hj-sq.k-tile{background:linear-gradient(180deg,#CBA6FF,#8A5CFF);color:#22083F}' +
    '#scr-party .hj-sq.k-job{background:linear-gradient(180deg,#7FCEFF,#2E8FD8);color:#05263D}' +
    '#scr-party .hj-sq.k-baby{background:linear-gradient(180deg,#FFB4D2,#E571A5);color:#3E0A22}' +
    '#scr-party .hj-sq.k-uni{background:linear-gradient(180deg,#FFC08A,#DE7A2A);color:#3B1C00}' +
    '#scr-party .hj-sq.k-wasla{background:linear-gradient(180deg,#8FF0E4,#26B6A4);color:#02332D}' +
    '#scr-party .hj-sq.k-stock{background:linear-gradient(180deg,#C8F58C,#79BF33);color:#1B3000}' +
    '#scr-party .hj-sq.k-ins{background:linear-gradient(180deg,#A9BEE6,#5C77B5);color:#0A1730}' +
    '#scr-party .hj-sq.k-good{background:linear-gradient(180deg,#3E7B5C,#255440);color:#D8FFEB}' +
    '#scr-party .hj-sq.k-bad{background:linear-gradient(180deg,#7E3A46,#54222C);color:#FFDCE1}' +
    '#scr-party .hj-sq.k-stop{background:linear-gradient(180deg,#FF7C8C,#C82236);color:#fff;' +
      'box-shadow:inset 0 2px 0 rgba(255,255,255,.28),0 0 0 3px rgba(255,84,104,.28),' +
      '0 6px 14px rgba(0,0,0,.5)}' +
    '#scr-party .hj-sq.k-end{background:linear-gradient(180deg,#FFE8A6,#D8A317);color:#3A2600;' +
      'box-shadow:inset 0 2px 0 rgba(255,255,255,.4),0 0 0 4px rgba(255,197,66,.3),' +
      '0 6px 16px rgba(0,0,0,.5)}' +
    '#scr-party .hj-sq.here{outline:5px solid #FF9A1F;outline-offset:3px;z-index:3}' +
    '#scr-party .hj-sq:active{filter:brightness(1.2)}' +

    /* ── the cars ride above the squares ── */
    '#scr-party .hj-cars{position:absolute;inset:0;pointer-events:none;z-index:5}' +
    /* the ring lifts its tile over its NEIGHBOURS (they overlap on a bend),
       so the cars have to be lifted over the ring or the car you are
       actually looking for vanishes under the square it is standing on */

    '#scr-party .hj-car{position:absolute;transform-origin:50% 50%;' +
      'transition:left .12s linear,top .12s linear;' +
      'filter:drop-shadow(0 5px 7px rgba(0,0,0,.6))}' +
    'body.reduced #scr-party .hj-car{transition:none;animation:none}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .hj-car{transition:none;animation:none}}' +
    '#scr-party .hj-car.go{animation:hjhop .3s var(--ease,ease)}' +
    '@keyframes hjhop{50%{transform:translateY(-9px) scale(1.06)}}' +
    '#scr-party .hj-carsvg{width:100%;height:100%;display:block;overflow:visible}' +

    /* ── zoom furniture, where it cannot be missed ── */
    '#scr-party .hj-zoom{position:absolute;right:5px;bottom:5px;z-index:9;display:flex;gap:5px}' +
    '#scr-party .hj-zb{min-width:34px;height:34px;border-radius:11px;padding:0 8px;' +
      'border:1px solid rgba(255,255,255,.18);background:rgba(12,8,22,.78);color:#E7DEFF;' +
      'font:900 16px/1 var(--disp);display:grid;place-items:center;opacity:.66;cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .hj-zb:active{background:rgba(138,92,255,.5);opacity:1}' +
    '#scr-party .hj-zb[disabled]{opacity:.22}' +
    '#scr-party .hj-zb.fit{font-size:10.5px;letter-spacing:.09em;opacity:1;' +
      'background:rgba(255,197,66,.92);border-color:#FFE29A;color:#2B1D00}' +
    '#scr-party .hj-zoom.fitted .fit{display:none}' +
    '#scr-party .hj-zoom.fitted .hj-zb{opacity:.44}' +

    /* the one-line ticker across the top of the stage */
    '#scr-party .hj-tick{position:absolute;left:6px;right:6px;top:6px;z-index:8;pointer-events:none;' +
      'font:700 11px/1.35 var(--body);color:#EFE7FF;padding:6px 10px;border-radius:11px;' +
      'background:rgba(12,8,22,.78);border:1px solid rgba(255,255,255,.12);' +
      'max-height:44px;overflow:hidden;opacity:0;transition:opacity .2s var(--ease,ease)}' +
    '#scr-party .hj-tick.on{opacity:1}' +
    '#scr-party .hj-tick b{color:var(--hj-gold);font-weight:900}' +

    /* ── the action deck ── */
    '#scr-party .hj-act{flex:0 0 auto;display:flex;align-items:stretch;gap:8px;padding-top:1px}' +
    '#scr-party .hj-wheel{flex:0 0 auto;width:88px;height:88px;position:relative;border:0;padding:0;' +
      'background:none;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .hj-wheel[disabled]{opacity:.45;cursor:default}' +
    '#scr-party .hj-wdisc{position:absolute;inset:4px;border-radius:50%;overflow:hidden;' +
      'box-shadow:0 6px 14px rgba(0,0,0,.55),inset 0 0 0 1px rgba(255,255,255,.12)}' +
    '#scr-party .hj-wdisc-svg{width:100%;height:100%;display:block}' +
    '#scr-party .hj-wt{fill:#fff;font:900 13px var(--disp)}' +
    '#scr-party .hj-wpin{position:absolute;left:50%;top:-3px;width:0;height:0;margin-left:-7px;' +
      'border-left:7px solid transparent;border-right:7px solid transparent;' +
      'border-top:13px solid var(--hj-gold);z-index:3;' +
      'filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}' +
    '#scr-party .hj-whub{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'width:34px;height:34px;border-radius:50%;display:grid;place-items:center;z-index:2;' +
      'background:linear-gradient(180deg,#FFE2A0,#E0A522);color:#3A2600;' +
      'font:900 16px/1 var(--disp);box-shadow:0 2px 5px rgba(0,0,0,.5)}' +
    '#scr-party .hj-actr{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:5px;' +
      'justify-content:center}' +
    '#scr-party .hj-say{font:700 11.5px/1.35 var(--body);color:rgba(255,255,255,.86);min-height:15px}' +
    '#scr-party .hj-say b{color:var(--hj-gold);font-weight:900}' +
    '#scr-party .hj-btns{display:flex;gap:6px;flex-wrap:wrap}' +
    '#scr-party .hj-b{flex:1 1 0;min-width:0;min-height:42px;border-radius:12px;padding:5px 8px;' +
      'border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:var(--txt);' +
      'font:900 11px/1.2 var(--disp);letter-spacing:.06em;text-transform:uppercase;cursor:pointer;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .hj-b i{font:700 9px/1 var(--disp);letter-spacing:.05em;color:var(--dim);' +
      'font-style:normal;text-transform:none}' +
    '#scr-party .hj-b.go{background:linear-gradient(180deg,#FFD36B,#E09A15);border-color:#FFE29A;' +
      'color:#3A2600}' +
    '#scr-party .hj-b.go i{color:rgba(58,38,0,.7)}' +
    '#scr-party .hj-b:disabled{opacity:.4;cursor:default}' +
    '#scr-party .hj-b:active{filter:brightness(1.15)}' +

    /* ── the sheet: decisions, a square you tapped, a player card.
         NEVER the shared result card — that one pays the player just for
         being shown, so a question must never be asked through it. ── */
    '#scr-party .hj-sheet{position:absolute;inset:0;z-index:40;display:flex;align-items:flex-end;' +
      'background:rgba(6,4,14,.66);opacity:0;visibility:hidden;' +
      'transition:opacity .2s var(--ease,ease),visibility 0s .2s}' +
    '#scr-party .hj-sheet.on{opacity:1;visibility:visible;transition:opacity .2s var(--ease,ease)}' +
    '#scr-party .hj-card{width:100%;max-height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
      'border-radius:18px 18px 14px 14px;padding:13px 13px 14px;' +
      'background:linear-gradient(180deg,#221845,#120C24);' +
      'border:1px solid rgba(255,197,66,.28);box-shadow:0 -12px 30px rgba(0,0,0,.6);' +
      'transform:translateY(14px);transition:transform .22s var(--ease,ease)}' +
    '#scr-party .hj-sheet.on .hj-card{transform:none}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .hj-sheet,#scr-party .hj-card{transition:none}}' +
    'body.reduced #scr-party .hj-sheet,body.reduced #scr-party .hj-card{transition:none}' +
    '#scr-party .hj-card h4{margin:0 0 3px;font:900 13px/1.2 var(--disp);letter-spacing:.09em;' +
      'text-transform:uppercase;color:var(--hj-gold)}' +
    '#scr-party .hj-card p{margin:0 0 9px;font-size:12px;line-height:1.5;color:var(--dim)}' +
    '#scr-party .hj-opts{display:grid;gap:6px}' +
    '#scr-party .hj-opt{min-height:46px;border-radius:12px;padding:7px 11px;text-align:left;' +
      'border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:var(--txt);' +
      'display:flex;align-items:center;gap:9px;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .hj-opt:active{background:rgba(255,197,66,.18)}' +
    '#scr-party .hj-opt .t{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}' +
    '#scr-party .hj-opt .t b{font:900 12px/1.15 var(--disp);letter-spacing:.03em}' +
    '#scr-party .hj-opt .t i{font:700 10.5px/1.3 var(--body);font-style:normal;color:var(--dim)}' +
    '#scr-party .hj-opt .v{flex:0 0 auto;font:900 13px/1 var(--disp);color:var(--hj-gold);' +
      'font-variant-numeric:tabular-nums}' +
    '#scr-party .hj-nums{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}' +
    '#scr-party .hj-num{min-height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.14);' +
      'background:rgba(255,255,255,.06);color:var(--txt);font:900 15px/1 var(--disp);cursor:pointer}' +
    '#scr-party .hj-num:active{background:rgba(255,197,66,.24)}' +
    '#scr-party .hj-x{width:100%;min-height:42px;margin-top:7px;border-radius:12px;' +
      'border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:var(--dim);' +
      'font:900 11px/1 var(--disp);letter-spacing:.08em;text-transform:uppercase;cursor:pointer}' +
    '#scr-party .hj-rows{display:grid;gap:4px;margin:2px 0 4px}' +
    '#scr-party .hj-row{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;' +
      'line-height:1.5;color:var(--dim);border-bottom:1px solid rgba(255,255,255,.06);padding-bottom:3px}' +
    '#scr-party .hj-row b{color:var(--txt);font-weight:900;font-family:var(--disp);' +
      'font-variant-numeric:tabular-nums}' +
    '#scr-party .hj-bigcar{width:132px;height:84px;margin:0 auto 6px;display:block}' +

    /* ── the menu's own face ── */
    '#scr-party .hj-menu .hj-hero{position:relative;display:flex;align-items:center;' +
      'justify-content:center;margin:2px 0 12px;padding:14px 8px;border-radius:16px;overflow:hidden;' +
      'background:radial-gradient(120% 130% at 50% 15%,#2C1F58 0%,#1A1233 55%,#0B0718 100%);' +
      'border:1px solid rgba(0,0,0,.5);' +
      'box-shadow:inset 0 2px 0 rgba(255,255,255,.07),inset 0 -14px 26px rgba(0,0,0,.42)}' +
    '#scr-party .hj-menu .hj-hero svg{width:190px;height:150px;display:block}' +
    '#scr-party .hj-menu .hj-hcap{position:absolute;right:11px;bottom:8px;font:900 9.5px/1 var(--disp);' +
      'letter-spacing:.18em;color:rgba(255,255,255,.32)}' +
    '#scr-party .hj-note{font-size:11.5px;line-height:1.6;margin:8px 2px 0;padding:9px 11px;' +
      'border-radius:12px;color:#E6D9FF;background:rgba(138,92,255,.12);' +
      'border:1px solid rgba(138,92,255,.34)}' +
    '#scr-party .hj-step{display:flex;align-items:center;justify-content:center;gap:14px;margin:6px 0 2px}' +
    '#scr-party .hj-rnd{width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.18);' +
      'background:rgba(255,255,255,.05);color:var(--txt);font:900 24px/1 var(--disp);cursor:pointer;' +
      'display:grid;place-items:center;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .hj-rnd:disabled{opacity:.3;cursor:default}' +
    '#scr-party .hj-step .v{font:900 30px/1 var(--disp);color:var(--hj-gold);min-width:120px;' +
      'text-align:center;display:flex;flex-direction:column;gap:2px}' +
    '#scr-party .hj-step .v i{font:700 10px/1 var(--disp);letter-spacing:.12em;text-transform:uppercase;' +
      'color:var(--dim);font-style:normal}' +

    /* a short phone gives the deck less room, never the board */
    '@media (max-height:680px){' +
      '#scr-party .hj-wheel{width:76px;height:76px}' +
      '#scr-party .hj-seat .hj-mini{width:30px;height:20px}' +
      '#scr-party .hj-b{min-height:38px}' +
    '}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   THE FRAME AND THE BOARD DOM
   ═══════════════════════════════════════════════════════════════════ */
function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: T('The Life', 'Il-Ħajja'),
    onBack,
    leave: () => leave(),
    barCls: 'two',
    buttons: [
      { id:'hj-rules', label:T('Rules', 'Regoli'), icon:'book',  cls:'ghost' },
      { id:'hj-me',    label:T('My car', 'Il-karozza'), icon:'users', cls:'ghost' }
    ]
  });
  /* the frame's own sizer would stamp a square width and height onto our
     column a tick from now — stop it DEAD, synchronously, here */
  if (M.ctx.stopFit) M.ctx.stopFit();

  /* THE BADGE NAMES WHO YOU ARE PLAYING, not how the bytes arrive. A
     table with a machine at it says the machine's difficulty even when
     it is an online room; "Online" is true of the plumbing and means
     nothing to the player. */
  let ai = -1;
  for (let i = 0; i < seatCount(); i++) if (ownerOf(i) === 'ai'){ ai = i; break; }
  M.ctx.badge.textContent = ai >= 0 ? levelName(seatLvl(ai))
    : M.net ? T('Online', 'Onlajn')
    : T('Pass & play', 'Għaddi u lgħab');

  buildBoard();
  M.ctx.btn('hj-rules').onclick = () => openRulesSheet();
  M.ctx.btn('hj-me').onclick = () => {
    const s = actingSeat() >= 0 ? actingSeat() : Math.max(0, firstLocalSeat());
    playerSheet(s);
  };
}

function buildBoard(){
  const ctx = M.ctx;
  ctx.host.classList.add('hj-host');
  ctx.host.innerHTML =
    '<div class="hj-wrap" id="hj-wrap">' +
      '<div class="hj-seats" id="hj-seats"></div>' +
      '<div class="hj-stage" id="hj-stage">' +
        '<div class="hj-board" id="hj-board">' +
          '<svg class="hj-scene" viewBox="0 0 ' + BW + ' ' + BH + '" ' +
            'preserveAspectRatio="none" aria-hidden="true">' + sceneSVG() + '</svg>' +
          '<svg class="hj-roads" id="hj-roads" viewBox="0 0 ' + BW + ' ' + BH + '" ' +
            'preserveAspectRatio="none" aria-hidden="true"></svg>' +
          '<div class="hj-sqs" id="hj-sqs"></div>' +
          '<div class="hj-cars" id="hj-cars"></div>' +
        '</div>' +
        '<div class="hj-tick" id="hj-tick" role="status" aria-live="polite"></div>' +
        '<div class="hj-zoom fitted" id="hj-zoom">' +
          '<button class="hj-zb fit" id="hj-zfit">' + esc(T('FIT', 'KOLLU')) + '</button>' +
          '<button class="hj-zb" id="hj-zout" aria-label="' + esc(T('Zoom out', 'Ċekken')) + '">&minus;</button>' +
          '<button class="hj-zb" id="hj-zin" aria-label="' + esc(T('Zoom in', 'Kabbar')) + '">+</button>' +
        '</div>' +
      '</div>' +
      '<div class="hj-act">' +
        '<button class="hj-wheel" id="hj-wheel" aria-label="' + esc(T('Spin', 'Dawwar')) + '">' +
          '<span class="hj-wpin" aria-hidden="true"></span>' +
          '<span class="hj-wdisc" id="hj-wdisc">' + wheelSVG() + '</span>' +
          '<span class="hj-whub" id="hj-whub">–</span>' +
        '</button>' +
        '<div class="hj-actr">' +
          '<div class="hj-say" id="hj-say"></div>' +
          '<div class="hj-btns" id="hj-btns"></div>' +
        '</div>' +
      '</div>' +
      '<div class="hj-sheet" id="hj-sheet" aria-hidden="true">' +
        '<div class="hj-card" id="hj-cardbody"></div>' +
      '</div>' +
    '</div>';

  const root = ctx.host.querySelector('#hj-wrap');
  UI = {
    ctx, root,
    seats: root.querySelector('#hj-seats'),
    stage: root.querySelector('#hj-stage'),
    board: root.querySelector('#hj-board'),
    roads: root.querySelector('#hj-roads'),
    sqs:   root.querySelector('#hj-sqs'),
    cars:  root.querySelector('#hj-cars'),
    tick:  root.querySelector('#hj-tick'),
    zoom:  root.querySelector('#hj-zoom'),
    wheel: root.querySelector('#hj-wheel'),
    disc:  root.querySelector('#hj-wdisc'),
    hub:   root.querySelector('#hj-whub'),
    say:   root.querySelector('#hj-say'),
    btns:  root.querySelector('#hj-btns'),
    sheet: root.querySelector('#hj-sheet'),
    card:  root.querySelector('#hj-cardbody')
  };

  paintRoads();
  paintSquares();

  UI.sheet.addEventListener('pointerdown', e => { if (e.target === UI.sheet) closeSheet(); });
  UI.wheel.onclick = () => { if (!panning) onWheel(); };

  wireZoom(root);
  sizeStage();
  if (typeof ResizeObserver === 'function'){
    UI._ro = new ResizeObserver(() => sizeStage());
    UI._ro.observe(UI.stage);
  } else {
    UI._onResize = () => sizeStage();
    window.addEventListener('resize', UI._onResize);
  }
  render();
}

/* ═══════════════════════════════════════════════════════════════════
   THE MAP. A printed board, not a grid on a slab — the route runs
   THROUGH a place. That place is Malta at dusk, which is the only
   palette that can carry scenery without fighting the app's own dark
   chrome; a daylight board would read as a different product.

   Everything here is hand-placed against LAY's fixed geometry, so
   before you move a square, know what is parked in the gap next to it:

     y   0..165   sea, behind and either side of START
     x 470..800 / y 150..640   THE BIG GAP between the two branches —
                 the hill, Mdina on its crown, the university on the
                 left flank and the office block on the right, which
                 puts the fork's two futures either side of it
     y 766..786, 878..898, ...  the 20px seams between serpentine rows
                 — dry-stone walls, which is what actually sits between
                 two Maltese fields
     x 0..30 / 930..960        the outer margins, walls and prickly pear
     x 775..960 / y 1345..1480 the last corner, free because the bottom
                 row is five squares wide — the retirement villa

   Purely decorative: pointer-events are off and nothing here is ever
   repainted, so it costs one string at build and nothing per move.
   ═══════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════
   THE ISLAND, IN 2.5D

   The board is famous for its punch-out cardboard scenery standing up off
   the paper, so flat SVG shapes were never going to get there. Everything
   with height is EXTRUDED through one helper and lit by one sun, because
   the fastest way to make a map look amateur is a scene where each object
   invented its own light.

   THE SUN IS TOP-LEFT. Consequences, and none of them are negotiable:
     · the roof/top face is the LIGHTEST plane
     · the front face is mid
     · the RIGHT face is the dark one
     · every cast shadow falls DOWN AND RIGHT, its length scaled by height
   `tone()` derives all three planes from one base colour so a new object
   cannot drift off the scheme by being typed in by hand. It is NOT called
   face() -- this file already has a face(i) for how a SQUARE looks, and a
   second one silently shadowed it and stripped the colour off every tile.

   The landscape is deliberately held in a NARROW, DESATURATED value band.
   The tiles on top are small and highly saturated, and they have to win —
   a landscape painted at the same chroma turns the route into camouflage.
   ═══════════════════════════════════════════════════════════════════ */
const SUN = { dep: 0.30, cast: 0.34 };   /* roof depth, cast-shadow length */

/* one base colour in, three lit planes out */
function tone(hex, amt){
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(c + amt * (amt > 0 ? 255 - c : c))));
  return '#' + [f(n >> 16 & 255), f(n >> 8 & 255), f(n & 255)]
    .map(v => v.toString(16).padStart(2, '0')).join('');
}

function sceneSVG(){
  const D = '#2A1E10';                        /* the printed outline       */
  const pts = a => a.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');

  /* AN EXTRUDED BLOCK. (x,y) is the middle of its FRONT-BOTTOM edge, which
     is the point that actually sits on the ground -- anchoring by the top
     left corner is how buildings end up floating. */
  const block = (x, y, w, h, base, dep) => {
    const d = dep == null ? w * SUN.dep : dep, r = d * 0.86, u = d * 0.62;
    const L = x - w / 2, R = x + w / 2, T = y - h;
    return '<g>' +
      /* cast shadow, down and right, longer for taller things */
      '<polygon points="' + pts([[L, y], [R, y], [R + h * SUN.cast, y + h * SUN.cast * .5],
        [L + h * SUN.cast, y + h * SUN.cast * .5]]) + '" fill="#3F6A22" opacity=".26"/>' +
      /* right face -- the dark one */
      '<polygon points="' + pts([[R, y], [R, T], [R + r, T - u], [R + r, y - u]]) +
        '" fill="' + tone(base, -0.26) + '" stroke="' + D + '" stroke-width="3" ' +
        'stroke-linejoin="round"/>' +
      /* roof -- the light one */
      '<polygon points="' + pts([[L, T], [R, T], [R + r, T - u], [L + r, T - u]]) +
        '" fill="' + tone(base, 0.30) + '" stroke="' + D + '" stroke-width="3" ' +
        'stroke-linejoin="round"/>' +
      /* front face */
      '<rect x="' + L + '" y="' + T + '" width="' + w + '" height="' + h + '" fill="' + base +
        '" stroke="' + D + '" stroke-width="3"/></g>';
  };
  const win = (x, y, w, h) =>
    '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#8FD4F0" ' +
      'stroke="' + D + '" stroke-width="2.5"/>' +
    '<path d="M' + x + ' ' + (y + h) + 'L' + (x + w) + ' ' + y + '" stroke="#FFF" ' +
      'stroke-width="2" opacity=".55"/>';
  const door = (x, y, w, h) =>
    '<rect x="' + (x - w / 2) + '" y="' + (y - h) + '" width="' + w + '" height="' + h +
      '" rx="' + (w / 2) + '" fill="#8A5A2E" stroke="' + D + '" stroke-width="3"/>';

  /* a house: an extruded box, a pitched or flat roof, windows and a door */
  const house = (x, y, w, h, base) =>
    '<g>' + block(x, y, w, h, base || '#F3E3BE') +
    win(x - w / 2 + 8, y - h + 12, 13, 13) + win(x + w / 2 - 21, y - h + 12, 13, 13) +
    door(x, y, 15, 22) + '</g>';

  /* a tree is a cone of foliage with its own shade side */
  const tree = (x, y, k) =>
    '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')">' +
      '<ellipse cx="14" cy="4" rx="26" ry="9" fill="#3F6A22" opacity=".26"/>' +
      '<path d="M0 0v-22" stroke="#6B4A28" stroke-width="8" stroke-linecap="round"/>' +
      '<circle cx="0" cy="-42" r="25" fill="#4E9A55" stroke="' + D + '" stroke-width="3"/>' +
      '<path d="M0 -67a25 25 0 0114 46 25 25 0 000-46" fill="#3B7A42"/>' +
      '<circle cx="-15" cy="-27" r="14" fill="#59A85E" stroke="' + D + '" stroke-width="3"/>' +
    '</g>';
  const palm = (x, y, k) =>
    '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')">' +
      '<ellipse cx="16" cy="3" rx="24" ry="8" fill="#3F6A22" opacity=".24"/>' +
      '<path d="M0 0q-5-30 3-52" stroke="#8A6234" stroke-width="9" fill="none" ' +
        'stroke-linecap="round"/>' +
      '<path d="M3 -52q-32-8-42 10M3 -52q32-10 42 8M3 -52q-15-25-37-25M3 -52q17-25 39-20" ' +
        'fill="none" stroke="#3F8C4A" stroke-width="10" stroke-linecap="round"/>' +
      '<path d="M3 -52q32-10 42 8" fill="none" stroke="#59A85E" stroke-width="5" ' +
        'stroke-linecap="round"/>' +
    '</g>';
  const luzzu = (x, y, k, c) =>
    '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')">' +
      '<path d="M-36 0q36 22 72 0l-10 14h-53z" fill="' + c + '" stroke="' + D + '" stroke-width="3"/>' +
      '<path d="M-36 0q36 22 72 0z" fill="' + tone(c, 0.28) + '"/>' +
      '<rect x="-2" y="-28" width="5" height="28" fill="' + D + '"/>' +
      '<circle cx="-22" cy="4" r="5" fill="#FFF"/><circle cx="-22" cy="4" r="2.2" fill="' + D + '"/>' +
    '</g>';

  let s = '<defs>' +
    '<linearGradient id="hjSea" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#5CBBE6"/><stop offset="1" stop-color="#2E80BC"/></linearGradient>' +
    '<linearGradient id="hjLand" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#A9CC7E"/><stop offset=".5" stop-color="#96BF6C"/>' +
      '<stop offset="1" stop-color="#86B25E"/></linearGradient>' +
    '</defs>';

  /* ── the sea, and the island cut out of it ─────────────────────────
     THE COASTLINE IS GENERATED, not drawn by hand. An ellipse can never
     contain a route that fills a rectangle -- the far corner of the
     meander is at 83% of the half-width AND 96% of the half-height at
     once -- which is how two hand-drawn coastlines both let the road run
     out into the sea. A superellipse is a rounded rectangle, so
     enclosure is a property of the shape, not something to eyeball. */
  const coast = grow => {
    const cx = BW / 2, cy = BH / 2, a = (BW / 2 - 40) * grow, b = (BH / 2 - 40) * grow, P = [];
    for (let i = 0; i < 132; i++){
      const t = i / 132 * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
      const w = 1 + 0.025 * Math.sin(3 * t + 0.7) + 0.016 * Math.sin(5 * t + 2.1);
      P.push([cx + Math.sign(ct) * Math.pow(Math.abs(ct), 0.2) * a * w,
              cy + Math.sign(st) * Math.pow(Math.abs(st), 0.2) * b * w]);
    }
    return 'M' + P.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L') + 'Z';
  };
  const SAND = coast(1.04), COAST = coast(1);
  s += '<rect x="0" y="0" width="' + BW + '" height="' + BH + '" fill="url(#hjSea)"/>';
  for (const [x, y, w] of [[80,120,150],[430,70,130],[930,150,160],[1210,340,90],
                           [60,960,110],[1240,820,90],[70,1820,130],[950,2040,150],
                           [330,2065,120],[1230,1600,90]])
    s += '<path d="M' + x + ' ' + y + 'q' + (w / 4) + ' -8 ' + (w / 2) + ' 0t' + (w / 2) +
         ' 0" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="4" stroke-linecap="round"/>';
  /* the island reads as a THING with thickness: a shelf under the sand */
  s += '<path d="' + SAND + '" fill="#7FA9C4" opacity=".55" ' +
         'transform="translate(10 16)"/>' +
       '<path d="' + SAND + '" fill="#F1E3B8"/>' +
       '<path d="' + COAST + '" fill="url(#hjLand)"/>' +
       '<path d="' + COAST + '" fill="none" stroke="#7C9E52" stroke-width="4" opacity=".65"/>';
  s += luzzu(160, 1880, 1, '#E2513F') + luzzu(1090, 210, .8, '#F2B33C') +
       luzzu(95, 690, .7, '#3E9AD8');

  return s + sceneProps(D, pts, block, house, tree, palm, luzzu, win, door);
}


/* ═══════════════════════════════════════════════════════════════════
   WHAT STANDS ON THE ISLAND

   Placed by hand in the pockets the meander leaves. Move a waypoint in
   LAY and something in here ends up under a tile.

     U  x 250..470  / y 320..760    inside the study loop -- THE COLLEGE
     A  x 640..1270 / y 200..880    east of the work road -- the office,
                                    the mountain, the walled city, a town
     B  x 570..1140 / y 950..1280   inside the first bend -- the lake
     C  x 250..520  / y 1360..1700  inside the west loop -- fields
     D  x 610..1150 / y 1350..1720  the village and its church
   ═══════════════════════════════════════════════════════════════════ */
function sceneProps(D, pts, block, house, tree, palm, luzzu, win, door){
  let s = '';
  const lawn = (x, y, rx, ry, c) =>
    '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + c +
      '" stroke="#7C9E52" stroke-width="3" opacity=".9"/>';
  /* a hill: a lit west face, a dark east face, one cast shadow */
  const mount = (x, y, w, h, base) =>
    '<g><polygon points="' + pts([[x - w / 2, y], [x + w / 2, y],
        [x + w / 2 + h * 0.34, y + h * 0.17], [x - w / 2 + h * 0.34, y + h * 0.17]]) +
      '" fill="#3F6A22" opacity=".24"/>' +
    '<path d="M' + (x - w / 2) + ' ' + y + 'q' + (w * 0.16) + ' -' + (h * 0.62) + ' ' +
      (w / 2) + ' -' + h + 'q' + (w * 0.34) + ' ' + (h * 0.38) + ' ' + (w / 2) + ' ' + h +
      'z" fill="' + base + '" stroke="' + D + '" stroke-width="4" stroke-linejoin="round"/>' +
    '<path d="M' + x + ' ' + (y - h) + 'q' + (w * 0.34) + ' ' + (h * 0.38) + ' ' + (w / 2) +
      ' ' + h + 'h-' + (w / 2) + 'z" fill="rgba(0,0,0,.16)"/>' +
    '<path d="M' + (x - w * 0.30) + ' ' + (y - h * 0.34) + 'q' + (w * 0.30) + ' -' + (h * 0.14) +
      ' ' + (w * 0.60) + ' 0" fill="none" stroke="rgba(255,255,255,.30)" stroke-width="6"/></g>';

  /* ═══ THE TWO WAYS IN. On the real board the roads are not colour-coded
     and there is no arch -- what tells you it is a choice is a pair of blue
     signposts on posts, one per road. Without them the board has two roads
     leaving START and no reason given, which is the single thing a new
     player has to understand before their first spin. ═══ */
  const signpost = (x, y, label, dir) =>
    '<g>' +
      '<ellipse cx="' + (x + 12) + '" cy="' + (y + 4) + '" rx="26" ry="9" ' +
        'fill="#3F6A22" opacity=".26"/>' +
      '<rect x="' + (x - 5) + '" y="' + (y - 62) + '" width="10" height="62" ' +
        'fill="#8A6234" stroke="' + D + '" stroke-width="3"/>' +
      '<rect x="' + (x - 78) + '" y="' + (y - 108) + '" width="156" height="50" rx="8" ' +
        'fill="#1E88D8" stroke="' + D + '" stroke-width="4"/>' +
      '<rect x="' + (x - 78) + '" y="' + (y - 108) + '" width="156" height="13" rx="6" ' +
        'fill="#5CB4EE"/>' +
      '<polygon points="' + pts(dir > 0
        ? [[x + 60, y - 92], [x + 60, y - 74], [x + 74, y - 83]]
        : [[x - 60, y - 92], [x - 60, y - 74], [x - 74, y - 83]]) + '" fill="#FFF"/>' +
      '<text x="' + (x - (dir > 0 ? 8 : -8)) + '" y="' + (y - 74) +
        '" font-size="24" fill="#FFF">' + esc(label) + '</text>' +
    '</g>';
  s += signpost(258, 214, T('COLLEGE', 'UNIVERSITÀ'), -1) +
       signpost(606, 318, T('CAREER', 'XOGĦOL'), 1);

  /* ═══ U — THE COLLEGE. The study road loops right around it, which is
     the whole point: the long way round is long because of this. ═══ */
  s += lawn(348, 566, 132, 96, '#A8D07C');
  s += block(348, 596, 168, 74, '#F5E6C4') +
       block(348, 522, 52, 96, '#EDD9AF') +            /* the clock tower  */
       '<circle cx="348" cy="470" r="17" fill="#FFF" stroke="' + D + '" stroke-width="3"/>' +
       '<path d="M348 470v-11M348 470l8 5" stroke="' + D + '" stroke-width="3" ' +
         'stroke-linecap="round"/>' +
       '<polygon points="' + pts([[318, 426], [378, 426], [348, 398]]) +
         '" fill="#E0C489" stroke="' + D + '" stroke-width="3" stroke-linejoin="round"/>';
  for (let i = 0; i < 4; i++) s += win(288 + i * 34, 552, 16, 20);
  s += door(348, 596, 22, 30) + tree(250, 640, .8) + tree(452, 636, .74) +
       tree(300, 460, .6);

  /* ═══ A — the office the WORK road runs past, then the mountain ═══ */
  s += block(706, 452, 104, 176, '#C8CDDA');
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++)
    s += win(668 + c * 30, 302 + r * 30, 19, 19);
  s += door(706, 452, 26, 34);
  s += mount(992, 846, 566, 348, '#E4CE9C');
  /* the walled city on the crown */
  s += block(992, 648, 176, 46, '#F7EACA');
  for (let i = 0; i < 6; i++)
    s += '<rect x="' + (912 + i * 28) + '" y="590" width="16" height="17" ' +
         'fill="#FBF2DA" stroke="' + D + '" stroke-width="3"/>';
  s += '<path d="M952 604a40 40 0 0180 0z" fill="#EBD7A4" stroke="' + D +
         '" stroke-width="4"/>' +
       '<path d="M992 564a40 40 0 0140 40h-40z" fill="rgba(0,0,0,.14)"/>' +
       '<rect x="987" y="538" width="10" height="22" fill="#8A6A34"/>' +
       '<path d="M982 546h20M992 536v24" stroke="#8A6A34" stroke-width="4"/>' +
       block(930, 604, 32, 62, '#F3E5C0') + block(1054, 604, 32, 62, '#F3E5C0');
  for (let i = 0; i < 4; i++) s += win(938 + i * 32, 620, 13, 15);
  /* the town at the mountain's foot */
  s += house(742, 872, 78, 54) + house(1250, 866, 74, 50) +
       tree(690, 906, .95) + tree(1292, 900, .82);

  /* ═══ B — the lake ═══ */
  s += '<path d="M600 1236q46-166 250-176 210-12 282 92 50 92-44 148-134 78-292 50' +
       '-158-30-196-114z" fill="#7FA9C4" opacity=".5" transform="translate(8 14)"/>' +
       '<path d="M600 1236q46-166 250-176 210-12 282 92 50 92-44 148-134 78-292 50' +
       '-158-30-196-114z" fill="url(#hjSea)" stroke="' + D + '" stroke-width="4"/>' +
       '<path d="M660 1130q66-30 132 0M840 1096q78-22 144 10" fill="none" ' +
         'stroke="rgba(255,255,255,.65)" stroke-width="5" stroke-linecap="round"/>' +
       luzzu(830, 1170, .74, '#4FBF8A') + palm(600, 1046, 1.05) + palm(1104, 1214, .92) +
       tree(672, 990, .8);

  /* ═══ THE BRIDGE — right edge, mid-height, the one place the road goes
     OVER something, exactly where the board's own assembly diagram puts
     it. The first attempt aimed the deck at a coordinate I typed in and
     the creek crossed the road forty pixels away from it, so BOTH are
     derived from the same road sample now: find P on the road, take its
     heading, and run the creek through P on the PERPENDICULAR. They
     cannot drift apart. ═══ */
  {
    let bi = 0, bd = 1e9;
    for (let i = 0; i < LAY.road.length; i++){
      const q = LAY.road[i];
      const dd = (q[0] - 1215) * (q[0] - 1215) + (q[1] - 1210) * (q[1] - 1210);
      if (dd < bd){ bd = dd; bi = i; }
    }
    const P = LAY.road[bi];
    const A = LAY.road[Math.max(0, bi - 4)];
    const B = LAY.road[Math.min(LAY.road.length - 1, bi + 4)];
    const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
    const px = -Math.sin(ang), py = Math.cos(ang);          /* the perpendicular */
    const at = t => [(P[0] + px * t).toFixed(1), (P[1] + py * t).toFixed(1)];
    const creek = 'M' + at(-230).join(' ') + 'Q' + at(-110).join(' ') + ' ' +
      at(-20).join(' ') + 'T' + at(200).join(' ');
    s += '<path d="' + creek + '" fill="none" stroke="#7FA9C4" stroke-width="46" ' +
           'stroke-linecap="round" opacity=".45" transform="translate(7 11)"/>' +
         '<path d="' + creek + '" fill="none" stroke="url(#hjSea)" stroke-width="40" ' +
           'stroke-linecap="round"/>' +
         '<path d="' + creek + '" fill="none" stroke="#BFE4F5" stroke-width="9" ' +
           'stroke-linecap="round" opacity=".5"/>';
    s += '<g transform="translate(' + P[0].toFixed(1) + ' ' + P[1].toFixed(1) +
           ') rotate(' + (ang * 180 / Math.PI).toFixed(1) + ')">' +
      '<path d="M-84 54q84-34 168 0v-108q-84-34-168 0z" fill="#3F6A22" opacity=".24" ' +
        'transform="translate(9 13)"/>' +
      '<path d="M-84 54q84-34 168 0v-108q-84-34-168 0z" fill="#F7F1E2" stroke="' + D +
        '" stroke-width="4" stroke-linejoin="round"/>' +
      /* the two parapets -- the only part of the deck the road does not cover */
      '<path d="M-84 54q84-34 168 0" fill="none" stroke="#E7DAB8" stroke-width="16" ' +
        'stroke-linecap="round"/>' +
      '<path d="M-84 54q84-34 168 0" fill="none" stroke="' + D + '" stroke-width="3" ' +
        'fill="none" opacity=".7"/>' +
      '<path d="M-84 -54q84-34 168 0" fill="none" stroke="#FFFFFF" stroke-width="16" ' +
        'stroke-linecap="round"/>' +
      '<path d="M-84 -54q84-34 168 0" fill="none" stroke="' + D + '" stroke-width="3" ' +
        'opacity=".7"/>' +
      '<path d="M-56 48v-96M-19 40v-88M19 40v-88M56 48v-96" stroke="#D9CBAE" ' +
        'stroke-width="4" opacity=".6"/>' +
      '</g>';
  }

  /* ═══ C — the fields, the farmhouse and the windmill ═══ */
  for (let i = 0; i < 4; i++)
    s += '<rect x="' + (262 + (i % 2) * 128) + '" y="' + (1392 + Math.floor(i / 2) * 126) +
         '" width="116" height="110" rx="9" fill="' + (i % 2 ? '#D3C773' : '#A6C465') +
         '" stroke="#7C9E52" stroke-width="3"/>';
  for (let i = 0; i < 10; i++)
    s += '<path d="M' + (276 + (i % 5) * 22 + (i > 4 ? 128 : 0)) + ' ' +
         (1490 + (i > 4 ? 126 : 0)) + 'v-82" stroke="#86AB4E" stroke-width="5" ' +
         'stroke-linecap="round" opacity=".85"/>';
  s += house(408, 1662, 96, 62, '#F0DDB2') + tree(288, 1678, 1) +
       block(536, 1454, 56, 78, '#F3E5C0') +
       '<circle cx="536" cy="1376" r="10" fill="#8A6A34" stroke="' + D + '" stroke-width="3"/>' +
       '<path d="M536 1376l-52-24M536 1376l52 24M536 1376l-24 52M536 1376l24-52" ' +
         'stroke="#8A6A34" stroke-width="8" stroke-linecap="round"/>';

  /* ═══ D — the village and its church ═══ */
  s += block(864, 1594, 148, 108, '#F7EACA') +
       '<path d="M796 1486a68 68 0 01136 0z" fill="#EBD7A4" stroke="' + D + '" stroke-width="4"/>' +
       '<path d="M864 1418a68 68 0 0168 68h-68z" fill="rgba(0,0,0,.14)"/>' +
       '<rect x="858" y="1386" width="12" height="26" fill="#8A6A34"/>' +
       '<path d="M852 1396h24M864 1384v28" stroke="#8A6A34" stroke-width="4"/>' +
       door(864, 1594, 34, 52) + win(812, 1520, 20, 26) + win(896, 1520, 20, 26);
  s += house(676, 1560, 80, 54) + house(1006, 1552, 88, 60, '#EFD3A6') +
       house(1108, 1584, 66, 44) + tree(628, 1618, .92) + tree(760, 1630, .8) +
       tree(1188, 1618, .95);

  /* ═══ the far end. The road has to be driving TOWARDS something or the
     last third of the board is just green. ═══ */
  s += '<ellipse cx="1168" cy="1892" rx="132" ry="70" fill="#A8D07C" ' +
         'stroke="#7C9E52" stroke-width="3"/>' +
       block(1168, 1892, 158, 76, '#F7EACA') +
       win(1112, 1848, 20, 22) + win(1148, 1848, 20, 22) + win(1196, 1848, 20, 22) +
       door(1168, 1892, 26, 36) +
       '<ellipse cx="1252" cy="1936" rx="46" ry="22" fill="#5CBBE6" stroke="' + D +
         '" stroke-width="3"/>' +                       /* the pool          */
       tree(1076, 1946, .85) + palm(1266, 1858, .9);

  /* a bay cut into the south coast, so the last stretch is not all green */
  s += '<path d="M392 2060q28-142 210-150 196-8 244 96 34 74-48 120z" fill="#7FA9C4" ' +
         'opacity=".5" transform="translate(8 12)"/>' +
       '<path d="M392 2060q28-142 210-150 196-8 244 96 34 74-48 120z" fill="url(#hjSea)" ' +
         'stroke="' + D + '" stroke-width="4"/>' +
       '<path d="M470 1988q58-24 116 0" fill="none" stroke="rgba(255,255,255,.6)" ' +
         'stroke-width="5" stroke-linecap="round"/>' +
       luzzu(690, 1966, .68, '#E2513F') + palm(380, 1926, 1.05) + palm(880, 1948, .92);

  /* the second mountain, bottom-left corner -- the real board puts its
     three at the corners and lets the road pass around them */
  s += mount(196, 1760, 300, 190, '#DFC894') + tree(300, 1786, .8);

  /* the beach at the west end */
  s += palm(176, 1918, 1.05) + tree(146, 1804, .8);

  /* scatter, so the green is never just green */
  for (const [x, y, k] of [[490, 300, .78], [286, 1046, .84], [472, 1204, .74],
                           [1252, 1420, .84], [1266, 1810, .9], [232, 1300, .8],
                           [612, 380, .7], [1120, 1930, .8]])
    s += tree(x, y, k);
  return s;
}

/* the roads themselves — two thick strokes with a dashed centre line,
   drawn UNDER the squares so the board reads as one continuous route */
function paintRoads(){
  const d = pts => 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
  /* a printed board road: a dark verge, a cream carriageway and a dashed
     white centre line. Round caps and joins, because the path is a dense
     polyline off the spline and any mitre would spike on a tight bend. */
  const lane = (pts, w) =>
    /* cast shadow, down-right, same sun as everything in sceneSVG */
    '<path d="' + d(pts.map(q => [q[0] + 5, q[1] + 8])) + '" fill="none" stroke="#3F6A22" ' +
      'stroke-width="' + (w + 12) + '" stroke-linecap="round" stroke-linejoin="round" ' +
      'opacity=".26"/>' +
    '<path d="' + d(pts) + '" fill="none" stroke="#6E5A38" stroke-width="' + (w + 14) +
      '" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>' +
    '<path d="' + d(pts) + '" fill="none" stroke="#FBEBC6" stroke-width="' + (w + 8) +
      '" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="' + d(pts) + '" fill="none" stroke="#F2A93B" stroke-width="' + w +
      '" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="' + d(pts) + '" fill="none" stroke="#FFFFFF" stroke-width="3" ' +
      'stroke-dasharray="16 20" stroke-linecap="round" opacity=".8"/>';
  UI.roads.innerHTML = lane(LAY.uni, 48) + lane(LAY.work, 48) + lane(LAY.road, 54);
}


/* every square, once. Only the "who is standing here" ring is ever
   repainted after this. */
function paintSquares(){
  let h = '';
  for (let i = 0; i < E.BOARD.sq.length; i++){
    const p = LAY.pos[i];
    if (!p) continue;
    const f = face(i);
    h += '<button class="hj-sq k-' + f.c + (p.big ? ' big' : '') + '" id="hj-s' + i + '" ' +
      'data-sq="' + i + '" style="left:' + (p.x - p.w / 2).toFixed(1) + 'px;top:' +
      (p.y - p.h / 2).toFixed(1) + 'px;width:' + p.w + 'px;height:' + p.h + 'px' +
      (p.a ? ';transform:rotate(' + p.a.toFixed(1) + 'deg)' : '') + '">' +
      svgIcon(f.ic) + (f.t ? '<b>' + esc(f.t) + '</b>' : '') + '</button>';
  }
  UI.sqs.innerHTML = h;
  UI.sqs.querySelectorAll('[data-sq]').forEach(b => {
    b.onclick = () => { if (!panning) squareSheet(+b.dataset.sq); };
  });
}

/* ═══════════════════════════════════════════════════════════════════
   PINCH, DRAG, DOUBLE-TAP, FIT
   The gesture kit is js/kiri-ui.js's, deliberately unchanged: ONE
   transform on .hj-board (translate then scale, origin at its top-left
   corner), a tap told from a drag by nine points of slop, capture taken
   only once it IS a drag, and a FIT button that appears the instant the
   board is not fitted so you can never be stranded.

   `fitK` is the scale at which the whole board fits the stage, so
   vw.k === 1 always means "the whole board" whatever the phone is.
   ═══════════════════════════════════════════════════════════════════ */
const ZMAX = 4.5, ZTAP = 2.2, DRAG_SLOP = 9;
let fitK = 0.3;
let vw = { k:1, x:0, y:0 };
let panning = false;
let pts = new Map();
let gest = null;
let lastTap = 0, lastTapX = 0, lastTapY = 0;
let dblWired = false;

function applyView(){
  if (!UI || !UI.board) return;
  const s = fitK * vw.k;
  UI.board.style.transform =
    'translate(' + vw.x.toFixed(1) + 'px,' + vw.y.toFixed(1) + 'px) scale(' + s.toFixed(4) + ')';
  if (UI.zoom){
    UI.zoom.classList.toggle('fitted', vw.k <= 1.001);
    const zi = UI.zoom.querySelector('#hj-zin'), zo = UI.zoom.querySelector('#hj-zout');
    if (zi) zi.disabled = vw.k >= ZMAX - 0.001;
    if (zo) zo.disabled = vw.k <= 1.001;
  }
}
function clampView(){
  if (!UI || !UI.stage) return;
  const w = UI.stage.clientWidth, h = UI.stage.clientHeight;
  const cw = BW * fitK * vw.k, ch = BH * fitK * vw.k;
  vw.x = cw <= w ? (w - cw) / 2 : Math.min(0, Math.max(w - cw, vw.x));
  vw.y = ch <= h ? (h - ch) / 2 : Math.min(0, Math.max(h - ch, vw.y));
  applyView();
}
function fitView(){ vw.k = 1; clampView(); }
function sizeStage(){
  if (!UI || !UI.stage || !UI.stage.isConnected) return;
  const w = UI.stage.clientWidth, h = UI.stage.clientHeight;
  if (!w || !h) return;
  fitK = Math.min(w / BW, h / BH);
  clampView();
}
function zoomTo(k, px, py){
  k = Math.max(1, Math.min(ZMAX, k));
  if (Math.abs(k - vw.k) < 0.0005) return;
  const r = k / vw.k;
  vw.x = px - (px - vw.x) * r;
  vw.y = py - (py - vw.y) * r;
  vw.k = k;
  clampView();
}
function stagePt(e){
  const r = UI.stage.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}
function zoomStep(mul){
  zoomTo(vw.k * mul, UI.stage.clientWidth / 2, UI.stage.clientHeight / 2);
}

/* ZOOMED IN, THE GAME COMES TO YOU. A square that is completely off the
   stage is slid to the middle; a square you can still see is one you
   were probably looking at, and shoving it about would be the board
   arguing with your thumb. */
function followSquare(at){
  if (!UI || !UI.stage || vw.k <= 1.02) return;
  const p = LAY.pos[at];
  if (!p) return;
  const s = fitK * vw.k;
  const cx = vw.x + p.x * s, cy = vw.y + p.y * s;
  const w = UI.stage.clientWidth, h = UI.stage.clientHeight;
  const m = 24;
  if (cx > m && cx < w - m && cy > m && cy < h - m) return;
  vw.x += w / 2 - cx;
  vw.y += h / 2 - cy;
  clampView();
}

function wireZoom(el){
  const q = id => el.querySelector('#' + id);
  q('hj-zin').onclick  = () => zoomStep(1.5);
  q('hj-zout').onclick = () => zoomStep(1 / 1.5);
  q('hj-zfit').onclick = () => fitView();

  const st = UI.stage;
  const dist = () => {
    const a = [...pts.values()];
    return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
  };
  const mid = () => {
    const a = [...pts.values()], r = st.getBoundingClientRect();
    return [(a[0].x + a[1].x) / 2 - r.left, (a[0].y + a[1].y) / 2 - r.top];
  };
  function grab(id){ try { st.setPointerCapture(id); } catch(err){} }

  st.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if (pts.size === 1){
      const p = stagePt(e);
      gest = { mode:'maybe', id:e.pointerId, x0:p[0], y0:p[1], vx:vw.x, vy:vw.y };
      panning = false;
    } else if (pts.size === 2){
      const m = mid();
      gest = { mode:'pinch', d0:dist(), k0:vw.k, mx:m[0], my:m[1], vx:vw.x, vy:vw.y };
      panning = true;                       /* two fingers is never a tap */
      grab(e.pointerId);
    }
  });

  st.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (!gest) return;
    if (gest.mode === 'pinch' && pts.size >= 2){
      const d = dist();
      if (!gest.d0) return;
      const k = Math.max(1, Math.min(ZMAX, gest.k0 * (d / gest.d0)));
      const m = mid(), r = k / gest.k0;
      vw.k = k;
      /* the pinch's own midpoint may have travelled too — that is the
         two-finger pan, and leaving it out makes a zoom feel nailed down */
      vw.x = m[0] - (gest.mx - gest.vx) * r;
      vw.y = m[1] - (gest.my - gest.vy) * r;
      clampView();
      e.preventDefault();
      return;
    }
    if (gest.mode === 'maybe'){
      const c = stagePt(e);
      if (Math.abs(c[0] - gest.x0) + Math.abs(c[1] - gest.y0) < DRAG_SLOP) return;
      gest.mode = 'pan';
      panning = true;
      grab(e.pointerId);
    }
    if (gest.mode === 'pan'){
      const c = stagePt(e);
      vw.x = gest.vx + (c[0] - gest.x0);
      vw.y = gest.vy + (c[1] - gest.y0);
      clampView();
      e.preventDefault();
    }
  });

  const up = e => {
    pts.delete(e.pointerId);
    if (pts.size === 0){
      gest = null;
      /* the click that follows this pointerup has to see `panning`;
         the tick after it has to not */
      setTimeout(() => { panning = false; }, 0);
    } else if (pts.size === 1 && gest && gest.mode === 'pinch'){
      const only = [...pts.entries()][0];
      const r = st.getBoundingClientRect();
      gest = { mode:'pan', id:only[0], x0:only[1].x - r.left, y0:only[1].y - r.top,
               vx:vw.x, vy:vw.y };
    }
  };
  st.addEventListener('pointerup', up);
  st.addEventListener('pointercancel', up);

  st.addEventListener('wheel', e => {
    const p = stagePt(e);
    zoomTo(vw.k * (e.deltaY < 0 ? 1.16 : 1 / 1.16), p[0], p[1]);
    e.preventDefault();
  }, { passive:false });

  /* DOUBLE-TAP, ONCE EVER. The second tap of a double lands on the scrim
     of the sheet the first tap opened, so a listener on the stage alone
     would work everywhere except on the squares — the only places worth
     double-tapping. #scr-party outlives every board we build, so this is
     wired one time; wiring it per game would fire it once per game ever
     started. */
  if (dblWired) return;
  dblWired = true;
  P.ui.screenEl().addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button) return;
    if (!UI || !UI.stage || !UI.stage.isConnected) return;
    const inStage = UI.stage.contains(e.target);
    const onScrim = UI.sheet && e.target === UI.sheet;
    if (!inStage && !onScrim) return;
    const now = Date.now();
    const near = Math.abs(e.clientX - lastTapX) + Math.abs(e.clientY - lastTapY) < 34;
    if (now - lastTap < 320 && near){
      lastTap = 0;
      if (M && M.sheet && M.sheet.kind === 'square') closeSheet();
      const r = UI.stage.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      if (vw.k > 1.02) fitView(); else zoomTo(ZTAP, px, py);
      panning = true;                 /* and do not open anything */
      setTimeout(() => { panning = false; }, 0);
      return;
    }
    lastTap = now; lastTapX = e.clientX; lastTapY = e.clientY;
  }, true);
}

/* ═══════════════════════════════════════════════════════════════════
   RENDER — the state is the truth on screen FIRST. The only thing an
   animation ever holds back is where a car is standing, and even that
   snaps forward the moment it is interrupted.
   ═══════════════════════════════════════════════════════════════════ */
function render(){
  if (!M || !UI || !UI.root || !UI.root.isConnected) return;
  renderTurn();
  renderSeats();
  renderCars();
  renderHere();
  renderAct();
}

function renderTurn(){
  const st = M.st, ctx = M.ctx;
  if (!ctx || !ctx.turn) return;
  if (E.over(st)){
    ctx.turn.className = 'pt-turn';
    ctx.turn.innerHTML = '<span class="pt-dot" style="background:#FFC542"></span>' +
      '<span class="pt-who">' + esc(T('Everybody has retired', 'Kulħadd irtira')) + '</span>';
    return;
  }
  const s = st.turn, p = st.players[s];
  const mine = isLocal(s);
  const note = p.done ? T('retired', 'irtirat')
    : st.phase === 'fork'   ? T('choose a road', 'agħżel triq')
    : st.phase === 'choose' ? T('a decision', 'deċiżjoni')
    : T('to spin', 'biex idawwar');
  ctx.turn.className = 'pt-turn' + (mine ? ' alert' : '');
  ctx.turn.innerHTML =
    '<span class="pt-dot" style="background:' + carHex(s) + '"></span>' +
    '<span class="pt-who">' + esc(mine ? T('Your go', 'Il-go tiegħek') : seatName(s)) + '</span>' +
    '<span class="pt-note">' + esc(note) + '</span>';
}

function renderSeats(){
  const st = M.st;
  let h = '';
  for (let i = 0; i < st.seats; i++){
    const p = st.players[i];
    h += '<button class="hj-seat' + (i === st.turn && !E.over(st) ? ' on' : '') +
      (p.done ? ' out' : '') + '" data-seat="' + i + '">' +
      '<span class="hj-mini">' + carSVG(i, p.pegs, { tag:'m' }) + '</span>' +
      '<span class="col"><span class="n">' + esc(seatName(i)) + '</span>' +
      '<span class="h">' + esc(money(p.cash)) + '</span></span></button>';
  }
  UI.seats.innerHTML = h;
  UI.seats.querySelectorAll('[data-seat]').forEach(b => {
    b.onclick = () => playerSheet(+b.dataset.seat);
  });
}

/* where a car actually stands right now: the animation's step if one is
   running for that seat, otherwise the engine's own number */
function carAt(seat){
  if (M.anim && M.anim.seat === seat) return M.anim.path[M.anim.i];
  return M.st.players[seat].at;
}
/* up to six cars can share one square, so they shrink and tile */
const SPREAD = {
  1: [[0, 0]],
  2: [[-27, 0], [27, 0]],
  3: [[-32, -13], [32, -13], [0, 15]],
  4: [[-31, -15], [31, -15], [-31, 15], [31, 15]],
  5: [[-38, -14], [0, -14], [38, -14], [-19, 15], [19, 15]],
  6: [[-38, -14], [0, -14], [38, -14], [-38, 15], [0, 15], [38, 15]]
};
function renderCars(){
  const st = M.st;
  const at = [], by = {};
  for (let i = 0; i < st.seats; i++){
    const a = carAt(i);
    at.push(a);
    (by[a] = by[a] || []).push(i);
  }
  let h = '';
  for (let i = 0; i < st.seats; i++){
    const a = at[i], group = by[a], n = group.length, k = group.indexOf(i);
    const off = (SPREAD[n] || SPREAD[6])[k] || [0, 0];
    const sc = n <= 1 ? 1 : n <= 2 ? 0.82 : n <= 4 ? 0.68 : 0.58;
    const w = 62 * sc, hh = 40 * sc;
    const p = LAY.pos[a] || LAY.pos[0];
    const moving = !!(M.anim && M.anim.seat === i);
    h += '<div class="hj-car' + (moving ? ' go' : '') + '" id="hj-car' + i + '" ' +
      'style="left:' + (p.x + off[0] - w / 2).toFixed(1) + 'px;top:' +
      (p.y + off[1] - hh / 2).toFixed(1) + 'px;width:' + w.toFixed(1) + 'px;height:' +
      hh.toFixed(1) + 'px;opacity:' + (st.players[i].done ? '.5' : '1') + '">' +
      carSVG(i, st.players[i].pegs, { tag:'b' }) + '</div>';
  }
  UI.cars.innerHTML = h;
}

/* the ring round the square the current player is standing on */
let lastHere = -1;
function renderHere(){
  const at = M.st.players[M.st.turn] ? carAt(M.st.turn) : -1;
  if (at === lastHere) return;
  const old = lastHere >= 0 && UI.sqs.querySelector('#hj-s' + lastHere);
  if (old) old.classList.remove('here');
  const now = at >= 0 && UI.sqs.querySelector('#hj-s' + at);
  if (now) now.classList.add('here');
  lastHere = at;
}

/* the one-line ticker: what the board just did to somebody */
let tickT = 0;
function say(html){
  if (!UI || !UI.tick) return;
  UI.tick.innerHTML = html;
  UI.tick.classList.add('on');
  if (tickT) clearTimeout(tickT);
  tickT = setTimeout(() => { if (UI && UI.tick) UI.tick.classList.remove('on'); }, 3600);
}
function sayLast(seat){
  const log = M.st.log;
  if (!log || !log.length) return;
  const e = log[log.length - 1];
  if (e.seat !== seat) return;
  say('<b>' + esc(seatName(seat)) + '</b> — ' + esc(e.t || '') +
      (e.v ? ' <b>' + esc(signed(e.v)) + '</b>' : ''));
}

/* ── the action deck ─────────────────────────────────────────────── */
function renderAct(){
  const st = M.st;
  /* the hub holds a dash while the wheel is turning: the engine already
     knows the number, and printing it beside a spinning wheel would give
     the answer away a second and a half before the wheel does */
  UI.hub.textContent = M.spinning ? '…' : (st.spin ? String(st.spin) : '–');
  const busy = !!M.anim || !!M.spinning;
  const seat = actingSeat();
  const over = !!E.over(st);
  let sayTx = '', btns = '';

  const B = (id, lab, sub, cls) =>
    '<button class="hj-b' + (cls ? ' ' + cls : '') + '" data-act="' + id + '">' +
    esc(lab) + (sub ? '<i>' + esc(sub) + '</i>' : '') + '</button>';

  if (over){
    sayTx = T('The game is over.', 'Il-logħba spiċċat.');
    btns = B('again', T('Results', 'Riżultati'), '', 'go');
  } else if (seat < 0){
    const who = seatName(st.turn);
    sayTx = ownerOf(st.turn) === 'ai'
      ? T('<b>' + esc(who) + '</b> is thinking…', '<b>' + esc(who) + '</b> qed jaħseb…')
      : T('Waiting for <b>' + esc(who) + '</b>…', 'Nistennew lil <b>' + esc(who) + '</b>…');
    UI.say.innerHTML = sayTx;
    UI.btns.innerHTML = '';
    UI.wheel.disabled = true;
    return;
  } else if (st.phase === 'fork'){
    sayTx = T('University, or straight to work?', 'Università, jew dritt għax-xogħol?');
    btns = B('uni', T('University', 'Università'), T('two loans, better jobs', 'żewġ self, xogħol aħjar')) +
           B('work', T('Straight to work', 'Dritt għax-xogħol'), T('paid from day one', 'imħallas mill-ewwel'));
  } else if (st.phase === 'choose' && st.pending){
    sayTx = pendingTitle(st.pending);
    btns = B('decide', T('Decide', 'Iddeċiedi'), '', 'go');
  } else {
    const p = st.players[seat];
    sayTx = T('Spin the wheel.', 'Dawwar ir-rota.') +
      ' <b>' + esc(money(p.cash)) + '</b>' +
      (p.salary ? ' · ' + esc(T('pay ', 'paga ') + money(p.salary)) : '');
    btns = B('spin', T('Spin', 'Dawwar'), '', 'go') +
           B('loan', T('Loan', 'Self'),
             money(E.LOAN) + ' → ' + T('owe ', 'tħallas ') + money(E.LOAN_BACK));
  }

  UI.say.innerHTML = sayTx;
  UI.btns.innerHTML = btns;
  UI.wheel.disabled = busy || over || seat < 0 || st.phase !== 'spin';
  UI.btns.querySelectorAll('[data-act]').forEach(b => {
    b.disabled = busy;
    b.onclick = () => onAct(b.dataset.act);
  });
}

function onAct(a){
  if (!M || M.dead || M.anim || M.wheelT) return;
  const seat = actingSeat();
  if (a === 'again'){ finish(); return; }
  if (seat < 0) return;
  if (a === 'uni')  return commit(seat, { t:'fork', v:'uni' }, 'local');
  if (a === 'work') return commit(seat, { t:'fork', v:'work' }, 'local');
  if (a === 'spin') return onWheel();
  if (a === 'loan'){
    cue('ui.coin', { gain:0.7 }, true);
    return commit(seat, { t:'loan' }, 'local');
  }
  if (a === 'decide') return decisionSheet();
}
function onWheel(){
  if (!M || M.dead || M.anim || M.wheelT) return;
  const seat = actingSeat();
  if (seat < 0 || M.st.phase !== 'spin') return;
  commit(seat, { t:'spin' }, 'local');
}

/* ═══════════════════════════════════════════════════════════════════
   ONE MOVE, START TO FINISH
   The engine has already decided everything by the time commit()
   returns — the number, the money, the square. The theatre that follows
   only SHOWS it, which is why an interrupted animation can always snap
   forward without the table disagreeing with itself.

   The SAME theatre plays for a machine's move and for a move off the
   wire. A spin that only animates for the phone that pressed it is a
   game the other five people are reading off a number.
   ═══════════════════════════════════════════════════════════════════ */
function pathBetween(a, b){
  if (a === b) return [a];
  /* THE FORK IS A JUMP, NOT A WALK. nextSpace() only knows the road, and
     from square 0 it walks the UNIVERSITY spur — so a car that chose WORK
     was animated the whole length of the other road and past half the
     board before arriving. Measured: 46 steps for a one-space move, and
     four machine seats then took longer than the test would wait. */
  if (a === 0) return [0, b];
  const out = [a];
  let cur = a, guard = 0;
  while (cur !== b && guard++ < 120){
    cur = E.nextSpace(cur);
    out.push(cur);
    if (cur >= E.END) break;
  }
  /* if the road did not actually lead there, hop rather than lie */
  if (out[out.length - 1] !== b) return [a, b];
  return out;
}

function commit(seat, mv, src){
  if (!M || M.dead) return { ok:false, err:'no game' };
  if (M.anim || M.spinning) return { ok:false, err:'busy' };
  const st = M.st;
  const from = st.players[seat] ? st.players[seat].at : 0;
  const res = doMove(seat, mv, src);
  if (!res.ok){ render(); return res; }
  const to = st.players[seat].at;
  if (mv && mv.t === 'spin') M.spinning = st.spin;
  if (to !== from) M.anim = { seat, path: pathBetween(from, to), i:0 };
  closeSheet();
  render();
  if (mv && mv.t === 'spin') spinTo(st.spin, () => walkCar(seat, () => afterMove(seat)));
  else if (M.anim) walkCar(seat, () => afterMove(seat));
  else { sayLast(seat); afterMove(seat); }
  return res;
}

/* the wheel turns TO the number, never for it */
function spinTo(v, done){
  if (!UI || !UI.disc){ M.spinning = 0; done(); return; }
  cue('dice.roll', { gain:0.72 }, true);
  haptic('roll');
  if (reduced()){ M.spinning = 0; renderAct(); done(); return; }
  const target = wheelTarget(v);
  let next = (M.rot | 0) + 360 * 4;
  next += ((target - (next % 360)) + 360) % 360;
  M.rot = next;
  UI.disc.style.transition = 'transform 1450ms cubic-bezier(.13,.72,.14,1)';
  UI.disc.style.transform = 'rotate(' + next + 'deg)';
  /* a run of ticks that slows with the wheel */
  let n = 0;
  const tick = () => {
    if (!M || M.dead || !M.spinning){ return; }
    note(2 + (n % 5), 0.3);
    n++;
    if (n < 13) M.tickT = setTimeout(tick, 60 + n * 16);
  };
  M.tickT = setTimeout(tick, 40);
  M.wheelT = setTimeout(() => {
    M.wheelT = 0;
    if (!M || M.dead) return;
    M.spinning = 0;
    if (M.tickT){ clearTimeout(M.tickT); M.tickT = 0; }
    cue('ui.reward', { gain:0.5 }, true);
    haptic('thud');
    renderAct();
    done();
  }, 1500);
}

/* the car walks the road one space at a time, so a payday you PASS is
   something you watch happen rather than something you find in a total */
function walkCar(seat, done){
  if (!M || M.dead) return;
  if (!M.anim || M.anim.seat !== seat){ done(); return; }
  if (reduced()){
    const last = M.anim.path[M.anim.path.length - 1];
    M.anim = null; renderCars(); renderHere(); followSquare(last); sayLast(seat); done();
    return;
  }
  const tick = () => {
    M.animT = 0;
    if (!M || M.dead) return;
    if (!M.anim){ done(); return; }
    M.anim.i++;
    if (M.anim.i >= M.anim.path.length){
      const last = M.anim.path[M.anim.path.length - 1];
      M.anim = null;
      renderCars(); renderHere(); followSquare(last);
      sayLast(seat);
      cue('dama.place', { gain:0.6 }, true);
      done();
      return;
    }
    renderCars(); renderHere();
    followSquare(M.anim.path[M.anim.i]);
    note(Math.min(9, 1 + M.anim.i), 0.3);
    M.animT = setTimeout(tick, 150);
  };
  M.animT = setTimeout(tick, 150);
}

/* ═══════════════════════════════════════════════════════════════════
   AFTER A MOVE — repaint, end it, ask the human, or let the machine go.
   ═══════════════════════════════════════════════════════════════════ */
function afterMove(){
  if (!M || M.dead) return;
  render();
  if (E.over(M.st)){ finish(); return; }
  maybeDecide();
  maybeThink();
  driveGone();
}

/* a decision that is OURS gets its sheet opened for us; one that is not
   is simply drawn on the deck as somebody else's business */
function maybeDecide(){
  if (!M || M.dead || M.anim || M.spinning) return;
  const st = M.st;
  if (st.phase !== 'choose' || !st.pending) return;
  if (!isLocal(st.pending.seat)) return;
  if (M.sheet && M.sheet.kind === 'decide') return;
  decisionSheet();
}

function maybeThink(){
  if (!M || M.dead || M.timer || M.anim || M.spinning) return;
  const st = M.st;
  if (E.over(st)) return;
  const seat = E.turn(st);
  if (seat < 0 || ownerOf(seat) !== 'ai') return;
  /* ONLINE, ONLY THE HOST DRIVES A MACHINE. iAmHost is stamped by
     onlineStart below because js/mp.js never sets it — reading it
     unstamped makes `!undefined` true on EVERY phone, and then nobody
     drives the bots and the table hangs for ever. */
  if (M.net && !M.net.iAmHost) return;
  M.timer = setTimeout(() => {
    M.timer = 0;
    if (!M || M.dead || M.anim || M.spinning){ if (M && !M.dead) maybeThink(); return; }
    const st2 = M.st;
    if (E.over(st2)) return;
    const s2 = E.turn(st2);
    if (s2 < 0 || ownerOf(s2) !== 'ai'){ render(); return; }
    const mv = E.aiMove(st2, s2, seatLvl(s2));
    if (!mv){ render(); return; }
    const r = commit(s2, mv, 'local');
    if (!r.ok){
      /* never spin here for ever: six refusals and the machine stands down */
      M.aiFails = (M.aiFails | 0) + 1;
      render();
      if (M.aiFails < 6) maybeThink();
    } else M.aiFails = 0;
  }, reduced() ? 90 : 620);
}

/* ── A CHAIR THE RELAY FREED MID-GAME ────────────────────────────────
   The engine's aiMove() is PURE — state plus a level, no clock and no
   Math.random — so every remaining phone computes the SAME move for the
   empty chair with nothing on the wire. Level 1 fixed, not the seat's,
   so no phone can disagree about which move that is. */
function driveGone(){
  if (!M || M.dead || !M.net || !M.gone || M.goneT) return;
  if (E.over(M.st) || M.anim || M.spinning) return;
  const s = E.turn(M.st);
  if (s < 0 || !M.gone[s]) return;
  M.goneT = setTimeout(() => {
    if (M) M.goneT = 0;
    if (!M || M.dead || M.anim || M.spinning || E.over(M.st)) return;
    const s2 = E.turn(M.st);
    if (!M.gone[s2]) return;
    const mv = E.aiMove(M.st, s2, 1);
    if (!mv){ render(); return; }
    commit(s2, mv, 'net');
  }, reduced() ? 90 : 560);
}

/* ═══════════════════════════════════════════════════════════════════
   THE SHEET — decisions, a square you tapped, a player's card, the
   rules. It is OURS and not the shared result card: that one pays the
   player as a side effect of being shown, so a question asked through
   it would pay somebody for reading it.
   ═══════════════════════════════════════════════════════════════════ */
function openSheet(kind, html){
  if (!UI || !UI.sheet) return null;
  M.sheet = { kind };
  UI.card.innerHTML = html;
  UI.card.scrollTop = 0;
  UI.sheet.classList.add('on');
  UI.sheet.setAttribute('aria-hidden', 'false');
  cue('ui.sheet', { gain:0.7 });
  const x = UI.card.querySelector('[data-close]');
  if (x) x.onclick = () => { cue('ui.back', { gain:0.7 }); closeSheet(); };
  return UI.card;
}
function closeSheet(){
  if (!UI || !UI.sheet || !M) return;
  M.sheet = null;
  UI.sheet.classList.remove('on');
  UI.sheet.setAttribute('aria-hidden', 'true');
}
const closeBtn = lab =>
  '<button class="hj-x" data-close="1">' + esc(lab || T('Close', 'Agħlaq')) + '</button>';

function pendingTitle(pd){
  if (!pd) return '';
  if (pd.kind === 'career') return T('Take a job?', 'Tieħu xogħol?');
  if (pd.kind === 'house')  return T('Buy a house?', 'Tixtri dar?');
  if (pd.kind === 'stock')  return T('Buy a stock number?', 'Tixtri numru tal-azzjoni?');
  if (pd.kind === 'ins')    return T('Buy insurance?', 'Tixtri assigurazzjoni?');
  return T('A decision', 'Deċiżjoni');
}

function decisionSheet(){
  const st = M.st, pd = st.pending;
  if (!pd || st.phase !== 'choose') return;
  const seat = pd.seat;
  if (!isLocal(seat)) return;
  const p = st.players[seat];
  let why = '', opts = '';

  if (pd.kind === 'career'){
    why = p.career
      ? T('You are a ' + E.careerById(p.career).n + ' on ' + money(p.salary) +
          '. The salary is its own card — a new job means a new draw.',
          'Int ' + E.careerById(p.career).n + ' fuq ' + money(p.salary) +
          '. Il-paga hija karta għaliha — xogħol ġdid ifisser ġibda ġdida.')
      : T('The salary is its own card. A degree deals from the top of the deck.',
          'Il-paga hija karta għaliha. Degree jaqsam minn fuq il-mazz.');
    (pd.options || []).forEach(id => {
      const c = E.careerById(id);
      if (!c) return;
      opts += '<button class="hj-opt" data-v="' + esc(id) + '">' +
        '<span class="t"><b>' + esc(c.n) + '</b><i>' +
        esc(c.deg ? T('needs the degree · tax ', 'trid id-degree · taxxa ')
                  : T('tax ', 'taxxa ')) + esc(money(c.tax)) + '</i></span>' +
        '<span class="v">' + esc(c.deg ? T('DEGREE', 'DEGREE') : T('JOB', 'XOGĦOL')) +
        '</span></button>';
    });
    opts += '<button class="hj-opt" data-v=""><span class="t"><b>' +
      esc(p.career ? T('Stay where you are', 'Ibqa\' fejn int') : T('No job for now', 'Ebda xogħol issa')) +
      '</b><i>' + esc(T('nothing changes', 'xejn ma jinbidel')) + '</i></span></button>';

  } else if (pd.kind === 'house'){
    why = T('You have ' + money(p.cash) + '. The house is sold back on one spin at the end — ' +
            'the spread is the gamble.',
            'Għandek ' + money(p.cash) + '. Id-dar tinbiegħ fuq dawra waħda fl-aħħar — ' +
            'id-differenza hi l-azzard.');
    (pd.options || []).forEach(id => {
      const h = E.houseById(id);
      if (!h) return;
      opts += '<button class="hj-opt" data-v="' + esc(id) + '">' +
        '<span class="t"><b>' + esc(h.n) + '</b><i>' +
        esc(T('sells for ', 'tinbiegħ ') + money(h.low) + ' – ' + money(h.high)) +
        '</i></span><span class="v">' + esc(money(h.cost)) + '</span></button>';
    });
    if (!(pd.options || []).length)
      opts += '<p style="margin:0 0 8px">' +
        esc(T('You cannot afford any of them.', 'Ma tiflaħx għal ebda waħda minnhom.')) + '</p>';
    opts += '<button class="hj-opt" data-v=""><span class="t"><b>' +
      esc(T('Do not buy', 'Tixtrix')) + '</b><i>' +
      esc(T('keep the cash', 'żomm il-flus')) + '</i></span></button>';

  } else if (pd.kind === 'stock'){
    why = T('Whenever ANYBODY spins your number you collect ' + money(E.STOCK_PAY) +
            '. It costs ' + money(pd.cost) + ' and you get that back at the end.',
            'Kull meta XI ĦADD idawwar in-numru tiegħek tieħu ' + money(E.STOCK_PAY) +
            '. Tiswa ' + money(pd.cost) + ' u tieħuhom lura fl-aħħar.');
    if (pd.can){
      opts += '<div class="hj-nums">';
      for (let i = 1; i <= 10; i++) opts += '<button class="hj-num" data-v="' + i + '">' + i + '</button>';
      opts += '</div>';
    } else {
      opts += '<p style="margin:0 0 8px">' + esc(p.stock
        ? T('You already hold number ' + p.stock + '.', 'Diġà għandek in-numru ' + p.stock + '.')
        : T('You cannot afford it.', 'Ma tiflaħx għaliha.')) + '</p>';
    }
    opts += '<button class="hj-opt" data-v="0"><span class="t"><b>' +
      esc(T('No thanks', 'Le grazzi')) + '</b></span></button>';

  } else if (pd.kind === 'ins'){
    why = T('A policy cancels the squares it covers for the rest of the game. It only pays ' +
            'for itself if you buy it early.',
            'Polza tħassar il-kaxxi li tkopri għall-bqija tal-logħba. Tħallas għaliha nnifisha ' +
            'biss jekk tixtriha kmieni.');
    (pd.options || []).forEach(id => {
      const o = E.INS[id];
      if (!o) return;
      opts += '<button class="hj-opt" data-v="' + esc(id) + '">' +
        '<span class="t"><b>' + esc(o.n) + '</b><i>' +
        esc(id === 'car' ? T('breakdowns and services', 'ħsarat u servisjar')
                         : T('the roof, and the neighbours', 'is-saqaf, u l-ġirien')) +
        '</i></span><span class="v">' + esc(money(o.cost)) + '</span></button>';
    });
    if (!(pd.options || []).length)
      opts += '<p style="margin:0 0 8px">' +
        esc(T('Nothing on offer you can pay for.', 'Xejn li tiflaħ għalih.')) + '</p>';
    opts += '<button class="hj-opt" data-v=""><span class="t"><b>' +
      esc(T('No thanks', 'Le grazzi')) + '</b></span></button>';
  }

  const card = openSheet('decide',
    '<h4>' + esc(pendingTitle(pd)) + '</h4>' +
    '<p>' + esc(why) + '</p>' + '<div class="hj-opts">' + opts + '</div>' +
    closeBtn(T('Not now', 'Mhux issa')));
  if (!card) return;
  card.querySelectorAll('[data-v]').forEach(b => {
    b.onclick = () => {
      const raw = b.dataset.v;
      const v = pd.kind === 'stock' ? (raw | 0) : raw;
      cue('ui.tap', { gain:0.8 }, true);
      const r = commit(seat, { t: pd.kind, v: v }, 'local');
      if (!r.ok) cue('ui.error', { gain:0.6 }, true);
    };
  });
}

/* tap any square and it tells you what it is — the long sentence the
   board itself has no room for at FIT */
function squareSheet(i){
  const sq = E.BOARD.sq[i];
  if (!sq || !M) return;
  const f = face(i);
  const who = [];
  for (let s = 0; s < M.st.seats; s++) if (M.st.players[s].at === i) who.push(seatName(s));
  openSheet('square',
    '<h4>' + esc(f.t || T('The road', 'It-triq')) + '</h4>' +
    '<p>' + esc(squareText(i) || T('Just road. Keep going.', 'Triq biss. Kompli.')) + '</p>' +
    (sq.k === 'P' ? '<div class="hj-row"><span>' + esc(T('Pays', 'Iħallas')) + '</span><b>' +
        esc(T('your salary', 'il-paga tiegħek')) + '</b></div>' : '') +
    (sq.k === 'X' ? '<div class="hj-row"><span>' + esc(T('This one STOPS you', 'Din TWAQQFEK')) +
        '</span><b>' + esc(T('even with spin left', 'anke b\'dawra żejda')) + '</b></div>' : '') +
    (who.length ? '<div class="hj-row"><span>' + esc(T('Standing here', 'Hawn hawn')) +
        '</span><b>' + esc(who.join(', ')) + '</b></div>' : '') +
    closeBtn());
}

/* a player's whole life, at a glance */
function playerSheet(seat){
  if (!M || seat < 0 || seat >= M.st.seats) return;
  const p = M.st.players[seat];
  const c = p.career ? E.careerById(p.career) : null;
  const h = p.house ? E.houseById(p.house) : null;
  const row = (a, b) => '<div class="hj-row"><span>' + esc(a) + '</span><b>' + esc(b) + '</b></div>';
  openSheet('player',
    '<h4>' + esc(seatName(seat)) + ' — ' + esc(carName(seat)) + '</h4>' +
    '<div class="hj-bigcar">' + carSVG(seat, p.pegs, { tag:'s' }) + '</div>' +
    '<div class="hj-rows">' +
      row(T('In the car', 'Fil-karozza'),
          p.pegs.length + '/' + E.CAR_SEATS + ' · ' +
          (p.married ? T('married', 'miżżewweġ') : T('single', 'waħdu')) +
          (p.kids ? ' · ' + p.kids + ' ' + T('children', 'tfal') : '')) +
      row(T('Cash', 'Flus'), money(p.cash)) +
      row(T('Job', 'Xogħol'), c ? c.n + ' · ' + money(p.salary) : T('none yet', 'xejn s\'issa')) +
      row(T('House', 'Dar'), h ? h.n + ' · ' + money(h.cost) : T('none', 'ebda')) +
      row(T('Stock', 'Azzjoni'), p.stock ? T('number ', 'numru ') + p.stock : T('none', 'ebda')) +
      row(T('Insurance', 'Assigurazzjoni'),
          [p.ins.car ? T('motor', 'vettura') : '', p.ins.home ? T('home', 'dar') : '']
            .filter(Boolean).join(' + ') || T('none', 'ebda')) +
      row(T('Il-Wasla', 'Il-Wasla'), String(p.wasla)) +
      row(T('Ħajja tiles', 'Kartuni tal-Ħajja'),
          p.tiles.length + ' ' + T('face down', 'wiċċ \'l isfel')) +
      row(T('Loans', 'Self'), p.loans + ' × ' + money(E.LOAN_BACK)) +
      /* `uni` is false BEFORE the fork as well as after choosing work, so
         reading it alone told everyone at the start line they had already
         taken the short road */
      row(T('Road', 'Triq'), p.at === 0 ? T('not chosen yet', 'għadha ma ntgħażlitx')
            : p.uni ? T('university', 'università') : T('straight to work', 'dritt għax-xogħol')) +
    '</div>' + closeBtn());
}

function openRulesSheet(){
  openSheet('rules',
    '<h4>' + esc(T('The Life', 'Il-Ħajja')) + ' — ' + esc(T('the rules', 'ir-regoli')) + '</h4>' +
    rulesHTML() + closeBtn());
}

/* ═══════════════════════════════════════════════════════════════════
   THE RULES — one game, told once, in both languages.
   ═══════════════════════════════════════════════════════════════════ */
function rulesHTML(){
  return '<p>' + T('Spin, drive your car along the road, and take whatever the square you land ' +
      'on gives you. Every <b>PAYDAY</b> you pass or land on pays your salary — which is why the ' +
      'long way round can be worth taking.',
      'Dawwar, saq il-karozza tiegħek mat-triq, u ħu dak li tagħtik il-kaxxa fejn tieqaf. Kull ' +
      '<b>PAGA</b> li tgħaddi minnha jew tieqaf fuqha tħallaslek il-paga — għalhekk it-triq ' +
      'twila tista\' tkun tiswa.') + '</p>' +
    '<p>' + T('The first square is the only real decision: <b>university</b> costs two loans and ' +
      'a longer road before you earn anything, and opens the degree jobs — Tabib, Avukat, Perit. ' +
      '<b>Straight to work</b> starts paying you at once on a shorter, poorer road.',
      'L-ewwel kaxxa hi l-unika deċiżjoni vera: l-<b>università</b> tiswa żewġ self u triq itwal ' +
      'qabel taqla\' xejn, u tiftaħlek ix-xogħol tad-degree — Tabib, Avukat, Perit. ' +
      '<b>Dritt għax-xogħol</b> jibda jħallsek mill-ewwel fuq triq iqsar u ifqar.') + '</p>' +
    '<p>' + T('A <b>STOP</b> square halts you even with spin left, so marriage, the house and ' +
      'retirement are never missed. Your car carries six: you, whoever you marry, and up to four ' +
      'children.',
      'Kaxxa <b>STOP</b> twaqqfek anke jekk fadallek dawra, biż-żwieġ, id-dar u l-irtirar qatt ma ' +
      'jinqabżu. Il-karozza tiegħek iġġorr sitta: int, min tiżżewweġ, u sa erbat itfal.') + '</p>' +
    '<p>' + T('<b>Il-Wasla</b> is ours: you know somebody, and the next bill that lands on you ' +
      'quietly goes away, once. A <b>stock</b> number pays you whenever ANYBODY spins it. ' +
      '<b>Insurance</b> cancels the squares it covers for the rest of the game.',
      '<b>Il-Wasla</b> hi tagħna: taf lil xi ħadd, u l-kont li jmiss li jaqa\' fuqek jgħib bil-' +
      'kwiet, darba. Numru ta\' <b>azzjoni</b> iħallsek kull meta XI ĦADD idawwru. ' +
      'L-<b>assigurazzjoni</b> tħassar il-kaxxi li tkopri għall-bqija tal-logħba.') + '</p>' +
    '<p>' + T('At the end: cash, plus your face-down <b>Ħajja</b> tiles turned over, plus what the ' +
      'house fetched, minus ' + money(E.LOAN_BACK) + ' for every loan. Most money wins.',
      'Fl-aħħar: il-flus, il-kartuni tal-<b>Ħajja</b> maqlubin, kemm ġabet id-dar, nieqes ' +
      money(E.LOAN_BACK) + ' għal kull self. L-aktar flus jirbaħ.') + '</p>';
}

/* ═══════════════════════════════════════════════════════════════════
   THE END — into the shared winner screen (js/rebbieh.js), and the ONE
   payment. The podium path never calls P.ui.result, so the wrap
   js/progress.js hangs on that call never fires and the pay is ours to
   make: KARTI_XP.awardPlay under a stable match id, idempotent, ONCE.
   KARTI_PARTY.record() is deliberately NOT called — it would pay twice.
   ═══════════════════════════════════════════════════════════════════ */
function finish(forced){
  if (!M || M.dead) return;
  const st = M.st;
  const ov = forced || M.ov || E.over(st);
  if (!ov) return;
  M.ov = ov;
  const me = firstLocalSeat();
  const iWon = me >= 0 && ov.winners.indexOf(me) >= 0;
  const shared = ov.winners.length > 1;

  if (!M.finished){
    M.finished = true;
    stopThinking();
    closeSheet();
    cue('game.win', { gain:0.95 }, true);
    haptic('win');
    if (!M.net && !M.recorded){
      M.recorded = true;
      if (shared && iWon) ST.rec.d = (ST.rec.d | 0) + 1;
      else if (iWon) ST.rec.w++;
      else if (me >= 0) ST.rec.l++;
      persist();
    }
    saveSlot(null);

    const MPX = window.KARTI_MP;
    const staked = !!(M.net && MPX && MPX.MP && MPX.MP.stakeLive);
    const code = (M.net && MPX && MPX.MP && MPX.MP.code) ? MPX.MP.code : 'local';
    M.mid = 'hajja:' + code + ':' + (M.seed >>> 0);
    if (me >= 0 && window.KARTI_XP && KARTI_XP.awardPlay){
      try {
        const r = KARTI_XP.awardPlay({
          game:'hajja', won: iWon && !shared, draw: !!(shared && iWon),
          id: M.mid, ms: Math.max(0, Date.now() - (M.startedAt || Date.now())),
          ranked: staked
        });
        if (r && r.counted) M.pay = r;
      } catch(e){}
    }
    /* the ladder, under the SAME id — progress.js refuses the second
       payment while the profile still counts the game */
    try {
      if (me >= 0 && window.KARTI_STATS && KARTI_STATS.record)
        KARTI_STATS.record('hajja', {
          result: (shared && iWon) ? 'draw' : iWon ? 'win' : 'loss', id: M.mid });
    } catch(e){}
    if (staked && me >= 0){
      try {
        M.potRes = (shared && MPX.stakeSettleTeam)
          ? MPX.stakeSettleTeam('win', ov.winners, me)
          : (MPX.stakeSettle ? MPX.stakeSettle(iWon ? 'win' : 'lose') : null);
      } catch(e){}
    }
    if (!M.potRes && iWon && M.solePot){ M.potRes = M.solePot; M.solePot = null; }
  }
  showResult(ov, me, iWon, shared);
}

function showResult(ov, me, iWon, shared){
  const order = [];
  for (let i = 0; i < seatCount(); i++) order.push(i);
  order.sort((a, b) => ov.counts[b] - ov.counts[a]);
  let place = 0, lastC = null;
  const rows = order.map((seat, i) => {
    if (lastC === null || ov.counts[seat] < lastC){ place = i + 1; lastC = ov.counts[seat]; }
    return {
      name: isLocal(seat) ? (seatCount() > 2 && ownerOf(seat) === 'hot' ? seatName(seat) : T('You', 'Int'))
        : ownerOf(seat) === 'ai' ? levelName(seatLvl(seat)) : seatName(seat),
      place,
      you: isLocal(seat),
      bot: ownerOf(seat) === 'ai',
      score: money(ov.counts[seat]),
      border: null
    };
  });

  const title = ov.sole && iWon
      ? T('They walked out — you win', 'Telaq — ir-rebħa tiegħek')
    : (shared && iWon) ? T('A shared life!', 'Ħajja maqsuma!')
    : iWon ? T('The richest life!', 'L-aktar ħajja għanja!')
    : (me >= 0) ? T('Beaten', 'Mirbuħ')
    : carName(ov.winners[0]) + ' ' + T('wins', 'jirbaħ');

  const net = M.net;
  const show = window.KARTI_REBBIEH && window.KARTI_REBBIEH.show;
  if (!show){
    P.ui.result(M.ctx, {
      tone: iWon ? 'win' : 'lose',
      head: title,
      why: T('Cash, tiles, the house — minus what the bank is owed.',
             'Flus, kartuni, id-dar — nieqes dak li jmissu l-bank.'),
      buttons: [
        { label:T('Play again', 'Erġa\' lgħab'), icon:'refresh', cls:'primary',
          go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else setupSheet(); } },
        { label:T('Leave', 'Oħroġ'), icon:'back', cls:'ghost',
          go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }
      ]
    });
    return;
  }
  const pay = M.pay, potRes = M.potRes;
  show({
    title,
    subtitle: T('What the life was worth', 'Kemm kienet tiswa l-ħajja'),
    rows,
    reduced: reduced(),
    lang: (window.KARTI_LANG ? KARTI_LANG.lang() : 'en'),
    xp: pay ? { level: pay.level, gained: pay.xp, leveledUp: !!pay.levelled,
                before: 0, after: pay.levelled ? 1 : 0.7 } : null,
    reward: (pay || potRes) ? {
      xp: pay ? pay.xp : 0,
      chips: pay ? (pay.chips | 0) + (pay.chipsLevel | 0) : 0,
      wonBonus: pay ? pay.wonBonus : 0,
      staked: potRes ? potRes.ante : 0,
      pot: (potRes && potRes.kind === 'win') ? potRes.pot : 0
    } : undefined,
    sound: id => cue(id, {}, true),
    playAgainLabel: net ? T('Back to the rooms', 'Lura fil-kmamar') : T('Play again', 'Erġa\' lgħab'),
    onPlayAgain: () => { leave(); if (net && net.onLeave) net.onLeave(); else setupSheet(); },
    onLeave:     () => { leave(); if (net && net.onLeave) net.onLeave(); else P.hub(); }
  });
}

function leave(){
  stopThinking();
  if (tickT){ clearTimeout(tickT); tickT = 0; }
  if (UI && UI._ro){ try { UI._ro.disconnect(); } catch(e){} }
  if (UI && UI._onResize){ try { window.removeEventListener('resize', UI._onResize); } catch(e){} }
  if (M){
    if (M.tickT){ clearTimeout(M.tickT); M.tickT = 0; }
    autosave(); persistNow();
    M.dead = true; M.anim = null; M.spinning = 0;
  }
  M = null; UI = null;
  lastHere = -1;
  vw = { k:1, x:0, y:0 };
}

/* ═══════════════════════════════════════════════════════════════════
   THE ENTRY SCREEN — play online, play the machine, pass the phone,
   how to play. Settings are a small second step, never screen one.
   ═══════════════════════════════════════════════════════════════════ */
function heroSVG(){
  const sqr = (x, y, fill, ink, d) =>
    '<rect x="' + x + '" y="' + y + '" width="46" height="34" rx="8" fill="' + fill + '"/>' +
    '<g transform="translate(' + (x + 13) + ',' + (y + 5) + ') scale(.83)" fill="none" stroke="' +
      ink + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="' + d + '"/></g>';
  return '<svg viewBox="0 0 240 190" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<rect x="0" y="0" width="240" height="190" rx="16" fill="#140E29"/>' +
    '<path d="M28 44H150a24 24 0 010 48H70a24 24 0 000 48H206" fill="none" stroke="#0B0716" ' +
      'stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M28 44H150a24 24 0 010 48H70a24 24 0 000 48H206" fill="none" stroke="#2A2148" ' +
      'stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M28 44H150a24 24 0 010 48H70a24 24 0 000 48H206" fill="none" ' +
      'stroke="rgba(255,197,66,.32)" stroke-width="3" stroke-dasharray="12 15"/>' +
    sqr(26, 27, '#5BE79B', '#04301B', ICONS.pay) +
    sqr(150, 75, '#CBA6FF', '#22083F', ICONS.tile) +
    sqr(168, 123, '#FFE8A6', '#3A2600', ICONS.flag) +
    '<g transform="translate(48,104) scale(1.05)">' + carSVG(0, [{k:'me'},{k:'spouse'},{k:'kid'}]) + '</g>' +
    '</svg>';
}

function setupSheet(){
  injectCSS();
  P.show();
  if (M){ stopThinking(); M.dead = true; }
  M = null; UI = null;
  const el = P.ui.screenEl();
  const online = canGoOnline();
  el.innerHTML =
    '<div class="pt-wrap hj-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="hj-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + esc(T('The Life', 'Il-Ħajja')) + '</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="hj-hero" aria-hidden="true">' + heroSVG() +
        '<span class="hj-hcap">' + (E.BOARD.sq.length - 1) + ' ' +
        esc(T('SQUARES', 'KAXXI')) + '</span></div>' +
      '<p class="blurb">' +
        esc(T('Spin, drive, and fill the car. University or straight to work, a job, a wedding, ' +
              'a house in Gozo and four children in the back seat. Whoever retires richest wins.',
              'Dawwar, saq, u imla l-karozza. Università jew dritt għax-xogħol, xogħol, tieġ, ' +
              'dar Għawdex u erbat itfal wara. Min jirtira l-aktar għani jirbaħ.')) + '</p>' +
      (ST.save
        ? '<button class="btn primary" id="hj-res" style="margin:2px 0 12px">' +
          esc(T('Carry on the saved game', 'Kompli l-logħba mħażna')) + '</button>'
        : '') +
      '<div style="display:grid;gap:9px;margin-top:4px">' +
        (online
          ? '<button class="btn primary" id="hj-online">' + ico('users') + ' ' +
            esc(T('Play online', 'Ilgħab onlajn')) + '</button>'
          : '') +
        '<button class="btn' + (online ? ' ghost' : ' primary') + '" id="hj-ai">' +
          ico('coach') + ' ' + esc(T('Play with the machine', 'Ilgħab mal-magna')) + '</button>' +
        '<button class="btn ghost" id="hj-pnp">' + ico('users') + ' ' +
          esc(T('Pass the phone', 'Għaddi t-telefon')) + '</button>' +
        '<button class="btn ghost" id="hj-rulesbtn">' + ico('book') + ' ' +
          esc(T('How to play', 'Kif tilgħab')) + '</button>' +
      '</div>' +
      '<div id="hj-menurules" hidden style="margin-top:12px">' + rulesHTML() + '</div>' +
      (ST.rec.w + ST.rec.l + (ST.rec.d | 0)
        ? '<p class="pt-ledger">' + T('So far: <b>' + ST.rec.w + '</b> won, <b>' + ST.rec.l +
            '</b> lost' + ((ST.rec.d | 0) ? ', <b>' + (ST.rec.d | 0) + '</b> shared' : '') + '.',
            'S\'issa: <b>' + ST.rec.w + '</b> rebħin, <b>' + ST.rec.l + '</b> mitlufin' +
            ((ST.rec.d | 0) ? ', <b>' + (ST.rec.d | 0) + '</b> maqsuma' : '') + '.') + '</p>'
        : '') +
    '</div></div>';

  el.querySelector('#hj-back').onclick = () => { cue('ui.back'); P.hub(); };
  const on = el.querySelector('#hj-online');
  if (on) on.onclick = () => { if (!P.openLobby('hajja') && window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('hajja'); };
  el.querySelector('#hj-ai').onclick  = () => offlineSetup('ai');
  el.querySelector('#hj-pnp').onclick = () => offlineSetup('pnp');
  const rs = el.querySelector('#hj-res');
  if (rs) rs.onclick = () => { if (ST.save) newGame(null, ST.save); };
  const rp = el.querySelector('#hj-menurules');
  el.querySelector('#hj-rulesbtn').onclick = () => {
    rp.hidden = !rp.hidden;
    cue(rp.hidden ? 'ui.back' : 'ui.sheet', { gain:0.8 });
    if (!rp.hidden) rp.scrollIntoView({ block:'nearest', behavior: reduced() ? 'auto' : 'smooth' });
  };
  if (window.KARTI_LANG && KARTI_LANG.onChange && !setupSheet._sub){
    setupSheet._sub = KARTI_LANG.onChange(() => {
      try { if (!M && el.isConnected && el.querySelector('#hj-ai')) setupSheet();
            else if (M && UI) render(); } catch(e){}
    });
  }
}

function offlineSetup(mode){
  injectCSS();
  P.show();
  const el = P.ui.screenEl();
  const p = pref();
  const MIN = E.MIN_SEATS, MAX = E.MAX_SEATS;
  let seats = Math.max(MIN, Math.min(MAX, p.seats || 2));
  let lvl = p.lvl || 2;
  let humans = mode === 'pnp' ? Math.max(2, Math.min(seats, p.humans || 2)) : 1;

  function paint(){
    if (mode === 'pnp') humans = Math.max(2, Math.min(seats, humans));
    el.innerHTML =
      '<div class="pt-wrap hj-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="hj-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(mode === 'pnp' ? T('Pass the phone', 'Għaddi t-telefon')
                                    : T('Play the machine', 'Ilgħab mal-magna')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<div class="tiny pt-lbl">' + esc(T('How many cars', 'Kemm-il karozza')) + '</div>' +
        '<div class="hj-step">' +
          '<button class="hj-rnd" id="hj-dn"' + (seats <= MIN ? ' disabled' : '') + '>&minus;</button>' +
          '<span class="v">' + seats + '<i>' + esc(T('players', 'plejers')) + '</i></span>' +
          '<button class="hj-rnd" id="hj-up"' + (seats >= MAX ? ' disabled' : '') + '>+</button>' +
        '</div>' +
        (mode === 'pnp'
          ? '<div class="tiny pt-lbl" style="margin-top:8px">' +
              esc(T('How many of them are people', 'Kemm minnhom huma nies')) + '</div>' +
            '<div class="hj-step">' +
              '<button class="hj-rnd" id="hj-hdn"' + (humans <= 2 ? ' disabled' : '') + '>&minus;</button>' +
              '<span class="v">' + humans + '<i>' + esc(T('people', 'nies')) + '</i></span>' +
              '<button class="hj-rnd" id="hj-hup"' + (humans >= seats ? ' disabled' : '') + '>+</button>' +
            '</div>' +
            (humans < seats ? '<p class="hj-note">' + esc(T('The other ' + (seats - humans) + ' ' +
                (seats - humans === 1 ? 'car is' : 'cars are') + ' the machine.',
                'L-oħrajn huma l-magna.')) + '</p>' : '')
          : '<div class="tiny pt-lbl" style="margin-top:8px">' +
              esc(T('How sharp is the machine', 'Kemm hi taħraq il-magna')) + '</div>' +
            '<div class="pt-opts" id="hj-lvl">' + levels().map(o =>
              '<button class="pt-opt' + (o.level === lvl ? ' on' : '') + '" data-lvl="' + o.level + '">' +
              ico('diff-' + Math.min(3, o.level)) +
              '<b>' + esc(o.name) + '</b><i>' + esc(TE(o.note)) + '</i></button>').join('') +
            '</div>') +
        '<div style="margin-top:18px;display:grid;gap:9px">' +
          '<button class="btn primary" id="hj-go">' + esc(T('Start', 'Ibda')) + '</button>' +
        '</div>' +
      '</div></div>';
    el.querySelector('#hj-back').onclick = () => { cue('ui.back'); setupSheet(); };
    el.querySelector('#hj-dn').onclick = () => { if (seats > MIN){ seats--; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    el.querySelector('#hj-up').onclick = () => { if (seats < MAX){ seats++; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    const hdn = el.querySelector('#hj-hdn'), hup = el.querySelector('#hj-hup');
    if (hdn) hdn.onclick = () => { if (humans > 2){ humans--; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    if (hup) hup.onclick = () => { if (humans < seats){ humans++; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => {
      lvl = +b.dataset.lvl; cue('ui.tap', { gain:0.8 }, true); paint();
    });
    el.querySelector('#hj-go').onclick = () => {
      pref({ seats, lvl, humans: mode === 'pnp' ? humans : 1 });
      newGame({ seats, humans: mode === 'pnp' ? humans : 1, lvl });
    };
  }
  paint();
}

function canGoOnline(){
  try {
    const MP = window.KARTI_MP;
    return !!(MP && MP.openFor && P.online && P.online.hajja);
  } catch(e){ return false; }
}
function myName(){
  try {
    const n = K && K.displayName && K.displayName();
    if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
      return String(n).trim().slice(0, 14);
  } catch(e){}
  return T('You', 'Int');
}

/* ═══════════════════════════════════════════════════════════════════
   START A LOCAL GAME
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
  M.finished = false;
  openBoard(() => setupSheet());
  cue('game.start', { gain:0.9 }, true);
  afterMove();
}
function defaultMeta(opts){
  opts = opts || {};
  const seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, opts.seats || 2));
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

/* ═══════════════════════════════════════════════════════════════════
   THE ONLINE CONTROLLER — KARTI_PARTY.online.hajja. js/mp.js is the
   only caller.
   ═══════════════════════════════════════════════════════════════════ */
const hooks = {
  /* mp.js subscribes with (move, {seat, src}); our own feed fires ONE
     {seat, move, index, src} event. Without this adapter mp.js receives
     the whole event object as the move, toWire() finds no `t` on it, and
     the table stops on the first move. `ev.move` is already the ENCODED
     move — what goes out is what the wire can carry. */
  onMove(fn){
    const f = ev => { if (ev) fn(ev.move, { seat: ev.seat, src: ev.src }); };
    moveSubs.push(f);
    return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); };
  },
  phase(){ return M ? 'play' : 'idle'; },
  apply(seat, move){ if (!M) return { ok:false, why:'no hajja' }; return onlineRemote(seat, move); },
  attachNet(net){
    if (!M) return;
    const was = M.net && M.net.iAmHost;
    M.net = net ? Object.assign({}, net, { iAmHost: !!(net.iAmHost || was) }) : null;
    maybeThink();
  },
  setOwner(i, own){ if (M && M.meta && M.meta[i]) M.meta[i].own = own; },
  setName(i, name){ if (M && M.meta && M.meta[i] && name) M.meta[i].name = name; },
  live(){ return !!(M && !M.dead && !E.over(M.st)); },
  seatBack(){ if (M && UI) render(); },
  seatGone(seat){
    if (!M || M.dead || E.over(M.st)) return;
    seat = seat | 0;
    if (seat < 0 || seat >= seatCount()) return;
    M.gone = M.gone || {};
    if (M.gone[seat]) return;
    M.gone[seat] = 1;
    if (M.meta && M.meta[seat]) M.meta[seat].own = 'net';
    render();
    driveGone();
  },
  /* the 1v1 walk-out. mp.js has already settled the pot (idempotent);
     finish()'s M.finished latch keeps the id-guarded award to one firing. */
  soleWin(seat, pot){
    if (!M || M.dead || M.finished || !M.net || E.over(M.st)) return;
    const me = firstLocalSeat();
    if (me < 0) return;
    M.solePot = pot || null;
    const counts = [];
    for (let i = 0; i < seatCount(); i++) counts.push(E.scoreOf(M.st.players[i]));
    finish({ counts, winners:[me], sole:true });
  }
};

function onlineStart(cfg){
  cfg = cfg || {};
  injectCSS();
  /* WITHOUT THIS a guest sits on the ready roster while the game runs
     invisibly — and it is invisible to any host-only test. */
  P.show();
  const list = cfg.seats || [];
  const n = list.length || (cfg.opts && cfg.opts.seats) || 2;
  const seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, n));
  /* ALWAYS the relay's shared seed, coerced, so every phone's board and
     every spin off the seeded stream are identical */
  startMatch({ seats, lvl: 2 }, cfg.seed >>> 0);
  M.meta = [];
  for (let i = 0; i < seatCount(); i++){
    const s = list[i] || {};
    /* SEAT KINDS. A chair with kind:'cpu' (or own:'ai') is a MACHINE and
       must be filed 'ai'. Filing every non-you chair as 'net' has shipped
       four times here: the machine never moves and the table hangs. */
    const own = (i === (cfg.you | 0)) ? 'me'
      : (s.own === 'ai' || s.kind === 'cpu') ? 'ai' : 'net';
    M.meta.push({ own, name: s.name || carName(i), lvl: s.level || s.lvl || 2 });
  }
  /* STAMP iAmHost. js/mp.js never sets it, and maybeThink() reads it —
     unstamped, `!undefined` is true on every phone and NOBODY drives the
     machines. Three games have been bitten by exactly this. */
  M.net = cfg.net ? Object.assign({}, cfg.net, {
    iAmHost: (cfg.you | 0) === (cfg.host | 0)
  }) : null;
  M.finished = false;
  openBoard(() => { const nn = M && M.net; leave(); if (nn && nn.onLeave) nn.onLeave(); else P.hub(); });
  hooks.attachNet(cfg.net || null);
  afterMove();
  return snapshot();
}

function onlineRemote(seat, move){
  if (!M) return { ok:false, why:'no hajja on the table' };
  if (E.over(M.st)) return { ok:false, why:'the game is over' };
  const dec = decMove(move) || (E.decWire ? E.decWire(move) : null) || move;
  if (!dec || !dec.t) return { ok:false, why:'that move did not fit the wire' };
  /* A MOVE OFF THE WIRE NEVER WAITS FOR OUR OWN THEATRE. Queuing it
     would mean answering mp.js "ok" for something that has not been
     measured by the engine yet — a lie it cannot recover from if the
     move turns out illegal. Instead the animation SNAPS FORWARD (the
     state was already true on screen; only the car was lagging) and the
     new move is applied and answered honestly. */
  if (M.anim || M.spinning) snapTheatre();
  const res = commit(seat, dec, 'net');
  if (!res.ok) return { ok:false, why: res.err || 'that move did not fit the rules' };
  return { ok:true };
}
/* end whatever is mid-flight this instant, with the board showing truth */
function snapTheatre(){
  if (!M) return;
  if (M.animT){ clearTimeout(M.animT); M.animT = 0; }
  if (M.wheelT){ clearTimeout(M.wheelT); M.wheelT = 0; }
  if (M.tickT){ clearTimeout(M.tickT); M.tickT = 0; }
  M.anim = null;
  M.spinning = 0;
  render();
}

function onlineNote(text, tone){ if (M && M.ctx) P.ui.setNet(M.ctx, text || '', tone || ''); }
function onlineStop(why, tone){
  if (!M || !M.ctx) return;
  stopThinking();
  P.ui.setNet(M.ctx, '', '');
  P.ui.result(M.ctx, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? T('No result', 'Ebda riżultat') : T('Cut off', 'Inqata\''),
    why: why || T('The game stopped.', 'Il-logħba waqfet.'),
    quip: T('Nobody lost anything.', 'Ħadd ma tilef xejn.'),
    buttons: [{ label:T('Back to the rooms', 'Lura fil-kmamar'), icon:'back', cls:'primary',
                go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
  });
}

P.online = P.online || {};
P.online.hajja = {
  start: onlineStart,
  remote: onlineRemote,
  note: onlineNote,
  stop: onlineStop,
  live: () => !!(M && !M.dead && hooks.live()),
  hooks
};

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — window.KARTI_HAJJA.lobby, read by js/mp.js.
   ═══════════════════════════════════════════════════════════════════ */
const LEVELS = levels().map(L => ({ level:L.level, name:L.name, note:TE(L.note), blurb:TE(L.note) }));
const LOBBY = {
  id:'hajja',
  name:'The Life',
  mt:'Il-Ħajja',
  minSeats: E.MIN_SEATS,
  maxSeats: E.MAX_SEATS,
  defaultSeats: 4,
  levels: LEVELS,
  defaultLevel: 2,
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    const n = (seatList || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why:T('The Life needs at least two cars.',
                                                  'Il-Ħajja trid tal-anqas żewġ karozzi.') };
    if (n > E.MAX_SEATS) return { ok:false, why:T('Up to six can play.', 'Sa sitta jistgħu jilagħbu.') };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready) return { ok:false, why: unready + (unready > 1
        ? T(' people are not ready yet.', ' persuni għadhom mhux lesti.')
        : T(' person is not ready yet.', ' persuna għadha mhux lesta.')) };
    return { ok:true, why:'' };
  },
  rulesHTML,
  blurb: T('Spin, drive, fill the car. Richest life wins.',
           'Dawwar, saq, imla l-karozza. L-eghna ħajja tirbaħ.'),
  start(seats, opts){
    const n = (seats && seats.length) || 2;
    return newGame(Object.assign({
      seats: Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, n)),
      humans: Math.max(2, Math.min(E.MAX_SEATS, n)),
      lvl: (pref().lvl || 2)
    }, opts || {}));
  },
  myName,
  /* SEE THE HEADER BLOCK. The engine's ['t','v'] cannot go on the relay
     as it stands: toWire() numeric-coerces every listed name and 't'
     always holds the action word (already carried in `a`), while
     fromWire() turns 'v' into a boolean. The un-sendable name is dropped,
     'v' stays declared, and the payload rides the APPENDED integer 'c'. */
  wire: { fields: WIRE },
  takeback: false
};
R.lobby = LOBBY;

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF — one tile.
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'hajja', order:26, kind:'board', cat:'board',
  name:'The Life', mt:'Il-Ħajja', icon:'map', status:'live',
  get tag(){
    return T('Spin the wheel and drive a car full of people through a Maltese life — university ' +
             'or straight to work, a job, a wedding, a house, and four children in the back. ' +
             'Two to six. Whoever retires richest wins.',
             'Dawwar ir-rota u saq karozza mimlija nies minn ħajja Maltija — università jew dritt ' +
             'għax-xogħol, xogħol, tieġ, dar, u erbat itfal wara. Tnejn sa sitta. Min jirtira ' +
             'l-aktar għani jirbaħ.') +
           (ST.save ? ' ' + T('There is a game half-played.', 'Hemm logħba nofsha milgħuba.') : '');
  },
  open: () => setupSheet(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  /* THREE machines. An EMPTY levels array declares "no machines here". */
  levels: LEVELS,
  rulesHTML,
  start: (seatList, o) => LOBBY.start(seatList, o)
};
R.shelfTile = TILE;
R.ui = { open: setupSheet, leave, injectCSS };
R.open  = () => setupSheet();
R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

/* ── test hooks — inert unless the page is opened with ?hajjatest ───── */
if (/[?&]hajjatest\b/.test(location.search || '')){
  window.__HAJJA_TEST = {
    setupSheet, offlineSetup, newGame, commit, afterMove, maybeThink, render,
    decisionSheet, squareSheet, playerSheet, openRulesSheet, closeSheet,
    encMove, decMove, pathBetween, snapTheatre, finish, leave,
    LAY, engine: E, LOBBY, TILE, hooks, online: P.online.hajja,
    get M(){ return M; }, get UI(){ return UI; },
    view(){ return { k: vw.k, x: vw.x, y: vw.y, fitK }; },
    setView(k){ vw.k = k; clampView(); },
    fit(){ fitView(); },
    reduced
  };
}


})();
