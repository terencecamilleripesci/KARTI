/* ═══════════════════════════════════════════════════════════════════
   KARTI — sqaq-ui.js
   IS-SQAQ — the screens on top of js/sqaq.js. Follows js/aqleb-ui.js
   deliberately: a match is (opts, log), every move goes through one
   doMove() gate, the online controller and lobby contract are exactly
   the shapes js/mp.js reads, and finish() pays once through
   KARTI_XP.awardPlay under a stable match id.

   THE BOARD is one SVG rebuilt per move — a turn-based game repaints a
   dozen times a minute, so there is no canvas loop to leak. Below it,
   three mode chips: STEP (tap a highlighted square) and the two wall
   directions (tap a highlighted groove slot; only LEGAL slots are
   offered, so the seal-a-player-in wall simply is not tappable).

   HOUSE RULES OBEYED — borrows #scr-party via KARTI_PARTY, injects its
   CSS once, T(en,mt) at every call site, sounds through KARTI_SFX ids
   that already exist, and NOTHING random anywhere in play.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_SQAQ;
if (!K || !P || !R || !R.engine) return;

const E = R.engine;
const N = E.N;
const esc = (K && K.esc) || (s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');
const clone = o => JSON.parse(JSON.stringify(o));
const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;

/* the KARTI seat palette — the same border ids js/rebbieh.js knows */
const SEATS = [
  { id:'gold', border:'gold', hex:'#FFC542', name:{ en:'Gold', mt:'Deheb' } },
  { id:'ice',  border:'ice',  hex:'#4FB6FF', name:{ en:'Ice',  mt:'Silġ'  } },
  { id:'jade', border:'jade', hex:'#3DDC84', name:{ en:'Jade', mt:'Ġada'  } },
  { id:'ruby', border:'ruby', hex:'#FF5468', name:{ en:'Ruby', mt:'Rubin' } }
];
const seatColour = i => SEATS[i % 4];
const seatTitle  = i => T(seatColour(i).name.en, seatColour(i).name.mt);

const STORE = 'karti_sqaq_v1';
const SAVE_V = 1;
let ST = { pref:{ seats:2, lvl:2, humans:2 }, rec:{ w:0, l:0, d:0 }, save:null };
try { const s = JSON.parse(localStorage.getItem(STORE) || '0'); if (s && s.pref) ST = s; } catch(e){}
let persistT = 0;
function persist(){ clearTimeout(persistT); persistT = setTimeout(persistNow, 400); }
function persistNow(){ try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){} }
function pref(patch){ if (patch){ Object.assign(ST.pref, patch); persist(); } return ST.pref; }
function saveSlot(v){ ST.save = v || null; persist(); }

let cueAt = 0;
function cue(id, opts, big){
  const S = window.KARTI_SFX;
  if (!S) return;
  const now = Date.now();
  if (!big && now - cueAt < 45) return;
  cueAt = Math.max(cueAt, now);
  try { S.play(id, opts); } catch(e){}
}
/* HAPTICS — beside the cue() that already marks the same moment. js/sfx.js
   owns the pattern, the switch and every no-op path, so nothing here needs
   a guard beyond the module being absent. Fired only for a move this thumb
   made: doMove() carries a src, and 'ai' and 'net' moves stay silent. */
function buzz(kind){ try { const S = window.KARTI_SFX; if (S && S.haptic) S.haptic(kind); } catch(e){} }
function reduced(){
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){ return false; }
}
function myName(){
  try { if (window.KARTI && KARTI.displayName) return KARTI.displayName() || T('You', 'Int'); } catch(e){}
  return T('You', 'Int');
}
const LEVELS = [
  { level:1, name:'Pawlu',  note:{ en:'Just walks.',            mt:'Jimxi biss.' } },
  { level:2, name:'Rita',   note:{ en:'Walls you when behind.', mt:'Tibni meta taqa’ lura.' } },
  { level:3, name:'Il-Pont',note:{ en:'Walls you on sight.',    mt:'Jibni malli jarak.' } }
];
const levelName = l => (LEVELS.find(x => x.level === l) || LEVELS[1]).name;

/* ═════════════ the runner ═════════════ */
let M = null, UI = null;
const moveSubs = [];
function fireList(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }

/* WALL MODE. 'w' is the one wall button; 'h'/'v' are still understood so an
   autosave written by an older build resumes without a fuss. */
function isWallMode(){ return M && (M.mode === 'w' || M.mode === 'h' || M.mode === 'v'); }

function buildState(opts, log){
  const st = E.newGame(opts);
  for (let i = 0; i < log.length; i++){
    if (E.turn(st) < 0 || !E.check(st, log[i], st.turn)) break;
    E.apply(st, log[i]);
  }
  return st;
}
function startMatch(opts, log){
  stopThinking();
  M = { opts: clone(opts || {}), log: log ? clone(log) : [],
        st: null, ctx: null, timer: 0, dead: false, finished: false,
        recorded: false, net: null, meta: null, mode: 'go', pre: null, solePot: null };
  M.st = buildState(M.opts, M.log);
  return M;
}
function stopThinking(){ if (M && M.timer){ clearTimeout(M.timer); M.timer = 0; } }
function seatCount(){ return M && M.st ? M.st.seats : 2; }
function ownerOf(i){ return (M && M.meta && M.meta[i] && M.meta[i].own) || 'ai'; }
const isLocal = i => { const o = ownerOf(i); return o === 'me' || o === 'hot'; };
function seatLvl(i){ return (M && M.meta && M.meta[i] && M.meta[i].lvl) || 2; }
function seatName(i){
  const m = M && M.meta && M.meta[i];
  if (!m) return seatTitle(i);
  if (m.own === 'me') return m.name || T('You', 'Int');
  if (m.own === 'ai') return levelName(m.lvl || 2);
  return m.name || seatTitle(i);
}
function firstLocalSeat(){
  for (let i = 0; i < seatCount(); i++) if (isLocal(i)) return i;
  return -1;
}

/* THE gate — thumb, machine or wire, every move is measured here. */
function doMove(seat, move, src){
  if (!M || M.dead) return { ok:false, err:'no game' };
  if (E.over(M.st)) return { ok:false, err:'game over' };
  if (E.turn(M.st) !== seat) return { ok:false, err:'not your turn' };
  if (!E.check(M.st, move, seat)) return { ok:false, err:'illegal move' };
  const rec = clone(move);
  const idx = M.log.length;
  M.log.push(rec);
  E.apply(M.st, rec);
  autosave();
  cue(move.t === 'wall' ? 'board.flip' : 'dama.place', { gain:0.8 }, true);
  /* HIS move only: a wall slots home (thud), a step is a committed choice
     (tap). The machine's move and a wire move take the same road silently.
     Nothing here when the move ENDS the match: `win` follows within the
     same frame and sfx.js merges two buzzes 40 ms apart, so the long one
     would be the one dropped. The winning step says `win` and only `win`. */
  if ((src || 'local') === 'local' && isLocal(seat) && !E.over(M.st))
    buzz(move.t === 'wall' ? 'thud' : 'tap');
  /* the wire hears the ENCODED move (numeric orientation) — a raw 'h'/'v'
     string would be refused by the codec and stop the whole table */
  fireList(moveSubs, { seat, move: E.encWire(move), index: idx, src: src || 'local' });
  return { ok:true, index: idx };
}
function snapshot(){
  if (!M) return null;
  return { v:SAVE_V, gid:'sqaq', opts: clone(M.opts), log: clone(M.log), meta: clone(M.meta || null) };
}
function autosave(){
  if (!M || M.net) return;
  if (E.over(M.st)){ saveSlot(null); return; }
  saveSlot(snapshot());
}

/* ═════════════ the stylesheet — once, scoped ═════════════ */
let cssDone = false;
function injectCSS(){
  if (cssDone) return; cssDone = true;
  const s = document.createElement('style');
  s.textContent =
  '#scr-party #pt-board svg{display:block;width:100%;height:auto;touch-action:manipulation}' +
  '#scr-party .sq-seats{display:flex;gap:7px;justify-content:center;flex-wrap:wrap;margin:2px auto;width:100%}' +
  '#scr-party .sq-seat{display:flex;align-items:center;gap:7px;padding:4px 10px 4px 5px;' +
    'border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);' +
    'font-size:12px;color:#cfc8e6;transition:box-shadow .2s,border-color .2s}' +
  '#scr-party .sq-seat.on{border-color:var(--sq-c);box-shadow:0 0 0 1px var(--sq-c),0 0 14px -4px var(--sq-c);color:#fff}' +
  '#scr-party .sq-seat .sq-f{width:26px;height:26px;border-radius:50%;overflow:hidden;flex:0 0 auto}' +
  '#scr-party .sq-seat b{font-weight:700}' +
  '#scr-party .sq-seat .sq-w{opacity:.75;font-size:11px}' +
  '#scr-party .sq-modes{display:flex;gap:8px;justify-content:center;margin:4px auto;width:100%}' +
  '#scr-party .sq-mode{min-height:44px;padding:0 14px;border-radius:12px;border:1px solid rgba(255,255,255,.12);' +
    'background:rgba(255,255,255,.05);color:#cfc8e6;font-family:inherit;font-weight:700;font-size:13px;' +
    'display:flex;align-items:center;gap:7px}' +
  '#scr-party .sq-mode.on{background:rgba(255,197,66,.14);border-color:rgba(255,197,66,.55);color:#FFE39A}' +
  '#scr-party .sq-mode:disabled{opacity:.4}' +
  '#scr-party .sq-hint{text-align:center;font-size:12.5px;color:#9a90b8;margin:2px 10px 10px;min-height:17px}' +
  '#scr-party .sq-menu .blurb{color:#b9b0d4;font-size:14px;line-height:1.5;margin:10px 0 16px}' +
  '#scr-party .sq-hero{display:grid;place-items:center;margin:6px 0 2px}' +
  '#scr-party .sq-hero svg{width:min(52vw,190px);height:auto;filter:drop-shadow(0 10px 24px rgba(0,0,0,.45))}' +
  '#scr-party .sq-rules{position:fixed;left:0;right:0;bottom:0;max-height:72%;overflow:auto;' +
    'background:#171226;border-radius:18px 18px 0 0;border:1px solid rgba(255,255,255,.1);border-bottom:0;' +
    'padding:14px 16px calc(16px + env(safe-area-inset-bottom));transform:translateY(105%);transition:transform .28s;z-index:8}' +
  '#scr-party .sq-rules.open{transform:none}' +
  '#scr-party .sq-rules h4{margin:0 0 8px;color:#fff}' +
  '#scr-party .sq-rules li{margin:0 0 9px 18px;color:#c9c2e2;font-size:13.5px;line-height:1.5}' +
  '#scr-party .sq-rules-x{position:absolute;top:8px;right:8px;width:38px;height:38px;border-radius:50%;' +
    'border:0;background:rgba(255,255,255,.08);color:#fff}' +
  '#scr-party .sq-rules-x svg{width:16px;height:16px;stroke:currentColor;stroke-width:2.4;fill:none}';
  document.head.appendChild(s);
}

/* ═════════════ faces on the seat chips — the same truth everywhere ═════════════ */
function chipFace(i, size){
  try {
    const XP = window.KARTI_XP;
    if (!XP || !XP.avatarHTML) return '';
    if (isLocal(i)) return XP.avatarHTML(seatName(i), { size, me: ownerOf(i) === 'me' });
    if (M && M.net && window.KARTI_MP && KARTI_MP.rosterSeats){
      const rs = KARTI_MP.rosterSeats() || [];
      for (let j = 0; j < rs.length; j++){
        if ((rs[j].seat | 0) === i){
          const s = rs[j];
          return XP.avatarHTML(s.name || seatName(i), {
            size, who: s.av || undefined, pv: s.pv || 0,
            hint: s.look && s.look.f, border: s.look && s.look.b
          });
        }
      }
    }
    return XP.avatarHTML(seatName(i), { size });
  } catch(e){ return ''; }
}

/* ═════════════ the board — one SVG, rebuilt per move ═════════════ */
const CELL = 44, GAP = 8, PAD = 10;
const SZ = PAD * 2 + N * CELL + (N - 1) * GAP;
const cx = c => PAD + c * (CELL + GAP);
const cy = r => PAD + r * (CELL + GAP);

function boardSVG(){
  const st = M.st;
  const me = M.net ? firstLocalSeat()
    : (isLocal(E.turn(st)) ? E.turn(st) : firstLocalSeat());
  const myTurn = E.turn(st) >= 0 && isLocal(E.turn(st)) &&
                 (!M.net || E.turn(st) === firstLocalSeat());
  const seat = E.turn(st);
  let s = '<svg viewBox="0 0 ' + SZ + ' ' + SZ + '" xmlns="http://www.w3.org/2000/svg">';
  s += '<rect x="0" y="0" width="' + SZ + '" height="' + SZ + '" rx="14" fill="#141021"/>';
  /* goal edge glows — each side tinted its owner's colour */
  for (let i = 0; i < st.seats; i++){
    const c = seatColour(i).hex;
    const g = [ 'x="' + PAD + '" y="' + (PAD - 6) + '" width="' + (SZ - 2 * PAD) + '" height="4"',
                'x="' + PAD + '" y="' + (SZ - PAD + 2) + '" width="' + (SZ - 2 * PAD) + '" height="4"',
                'x="' + (SZ - PAD + 2) + '" y="' + PAD + '" width="4" height="' + (SZ - 2 * PAD) + '"',
                'x="' + (PAD - 6) + '" y="' + PAD + '" width="4" height="' + (SZ - 2 * PAD) + '"' ][i];
    s += '<rect ' + g + ' rx="2" fill="' + c + '" opacity="' + (st.gone[i] ? .12 : .55) + '"/>';
  }
  /* cells */
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      s += '<rect x="' + cx(c) + '" y="' + cy(r) + '" width="' + CELL + '" height="' + CELL +
           '" rx="7" fill="#231b3a"/>';
  /* placed walls */
  for (let i = 0; i < st.walls.length; i++){
    const w = st.walls[i];
    if (w.o === 'h')
      s += '<rect x="' + cx(w.c) + '" y="' + (cy(w.r) + CELL + 1) + '" width="' + (CELL * 2 + GAP) +
           '" height="' + (GAP - 2) + '" rx="3" fill="#FFB46B"/>';
    else
      s += '<rect x="' + (cx(w.c) + CELL + 1) + '" y="' + cy(w.r) + '" width="' + (GAP - 2) +
           '" height="' + (CELL * 2 + GAP) + '" rx="3" fill="#FFB46B"/>';
  }
  /* interactive layers — only on the local player's turn */
  if (myTurn && M.mode === 'go'){
    const steps = E.legalSteps(st, seat);
    for (let i = 0; i < steps.length; i++){
      const t = steps[i];
      s += '<rect data-go="' + t.r + ',' + t.c + '" x="' + cx(t.c) + '" y="' + cy(t.r) +
           '" width="' + CELL + '" height="' + CELL + '" rx="7" fill="' + seatColour(seat).hex +
           '" opacity="0.22" stroke="' + seatColour(seat).hex + '" stroke-opacity="0.7" stroke-width="2"/>';
    }
  }
  if (myTurn && isWallMode()){
    /* PLACEMENT, DONE CALMLY — and now WITHOUT picking the direction first.
       A dot sits on every junction where a wall may go. DRAG off a dot and
       the way you pull chooses the direction (sideways = ━, up/down = ┃) —
       the same "draw it on the dots" gesture kaxxi uses. Or tap a dot and the
       preview appears with a ROTATE handle beside it. Tap the bright preview
       to build it. Nothing is ever spent on one stray tap. */
    const slotsH = E.legalWalls(st, seat, 'h');
    const slotsV = E.legalWalls(st, seat, 'v');
    const anch = new Map();
    const add = (list, o) => { for (const w of list){
      const k = w.r + ',' + w.c;
      const e = anch.get(k) || { r:w.r, c:w.c, h:false, v:false };
      e[o] = true; anch.set(k, e);
    } };
    add(slotsH, 'h'); add(slotsV, 'v');
    const okAt = (r, c, o) => { const e = anch.get(r + ',' + c); return !!(e && e[o]); };
    const pre = (M.pre && okAt(M.pre.r, M.pre.c, M.pre.o)) ? M.pre : null;
    anch.forEach(e => {
      const ax = cx(e.c) + CELL + GAP / 2, ay = cy(e.r) + CELL + GAP / 2;
      const isPre = pre && pre.r === e.r && pre.c === e.c;
      if (!isPre)
        s += '<circle cx="' + ax + '" cy="' + ay + '" r="4.5" fill="#FFC542" opacity="0.5"/>';
      /* a fat, invisible grab target — what a thumb actually hits */
      s += '<rect data-anchor="' + e.r + ',' + e.c + '" x="' + (ax - 16) +
           '" y="' + (ay - 16) + '" width="32" height="32" fill="#000" opacity="0"/>';
    });
    if (pre){
      const glow = ' filter="drop-shadow(0 0 6px rgba(255,197,66,.8))"';
      const ax = cx(pre.c) + CELL + GAP / 2, ay = cy(pre.r) + CELL + GAP / 2;
      if (pre.o === 'h')
        s += '<rect data-place="1" x="' + cx(pre.c) + '" y="' + (cy(pre.r) + CELL) +
             '" width="' + (CELL * 2 + GAP) + '" height="' + GAP + '" rx="4" fill="#FFE39A"' + glow + '/>';
      else
        s += '<rect data-place="1" x="' + (cx(pre.c) + CELL) + '" y="' + cy(pre.r) +
             '" width="' + GAP + '" height="' + (CELL * 2 + GAP) + '" rx="4" fill="#FFE39A"' + glow + '/>';
      /* THE ROTATE HANDLE — shown only when the other way round is legal
         here, so it never offers a turn that cannot be taken. A real button
         on the board is how you know a wall CAN be turned. */
      const other = pre.o === 'h' ? 'v' : 'h';
      if (okAt(pre.r, pre.c, other)){
        const hx = ax + CELL * 0.60, hy = ay - CELL * 0.60;
        s += '<g data-rot="1">' +
               '<circle data-rot="1" cx="' + hx + '" cy="' + hy + '" r="15" fill="#1B1230" ' +
                 'stroke="#FFC542" stroke-width="2"/>' +
               '<path data-rot="1" d="M ' + (hx - 6) + ' ' + (hy + 5) +
                 ' A 8 8 0 1 0 ' + (hx - 7) + ' ' + (hy - 3) + '" fill="none" ' +
                 'stroke="#FFC542" stroke-width="2.2" stroke-linecap="round"/>' +
               '<path data-rot="1" d="M ' + (hx - 10) + ' ' + (hy - 7) + ' l 3 4 l 4 -3" ' +
                 'fill="none" stroke="#FFC542" stroke-width="2.2" stroke-linecap="round" ' +
                 'stroke-linejoin="round"/>' +
               '<rect data-rot="1" x="' + (hx - 17) + '" y="' + (hy - 17) +
                 '" width="34" height="34" fill="#000" opacity="0"/>' +
             '</g>';
      }
    }
  }
  /* the previous move, so a player looking up knows what just happened:
     the freshest wall burns brighter; a step leaves a ring on the square */
  if (st.last && st.winner < 0){
    if (st.last.t === 'wall'){
      const L = st.last;
      if (L.o === 'h')
        s += '<rect x="' + cx(L.c) + '" y="' + (cy(L.r) + CELL + 1) + '" width="' + (CELL * 2 + GAP) +
             '" height="' + (GAP - 2) + '" rx="3" fill="#FFD98A"/>';
      else
        s += '<rect x="' + (cx(L.c) + CELL + 1) + '" y="' + cy(L.r) + '" width="' + (GAP - 2) +
             '" height="' + (CELL * 2 + GAP) + '" rx="3" fill="#FFD98A"/>';
    } else {
      s += '<rect x="' + (cx(st.last.c) + 2) + '" y="' + (cy(st.last.r) + 2) + '" width="' + (CELL - 4) +
           '" height="' + (CELL - 4) + '" rx="6" fill="none" stroke="' +
           seatColour(st.last.seat).hex + '" stroke-width="2" opacity="0.55"/>';
    }
  }
  /* pawns on top */
  for (let i = 0; i < st.seats; i++){
    const p = st.pawns[i], col = seatColour(i);
    const X = cx(p.c) + CELL / 2, Y = cy(p.r) + CELL / 2;
    s += '<circle cx="' + X + '" cy="' + Y + '" r="' + (CELL * 0.34) + '" fill="' + col.hex +
         '" opacity="' + (st.gone[i] ? .35 : 1) + '" stroke="#0e0a18" stroke-width="3"/>';
    if (i === seat && st.winner < 0)
      s += '<circle cx="' + X + '" cy="' + Y + '" r="' + (CELL * 0.46) + '" fill="none" stroke="' +
           col.hex + '" stroke-width="2" opacity="0.85"/>';
  }
  return s + '</svg>';
}

function paint(){
  if (!M || !UI || !UI.board) return;
  UI.board.innerHTML = boardSVG();
  const svg = UI.board.firstChild;
  /* ── DRAG A WALL OFF A DOT ─────────────────────────────────────────
     pointerdown on a junction dot starts it; the direction you pull picks
     the wall's direction; letting go on a real pull BUILDS it. A tap (no
     pull) just previews, so a mis-touch never spends a wall. */
  const wallLegal = (r, c, o) => {
    const seat = E.turn(M.st);
    return E.legalWalls(M.st, seat, o).some(w => w.r === r && w.c === c);
  };
  svg.addEventListener('pointerdown', ev => {
    const t = ev.target;
    const an = t.getAttribute && t.getAttribute('data-anchor');
    if (!an) return;
    const seat = E.turn(M.st);
    if (seat < 0 || !isLocal(seat)) return;
    if (M.net && seat !== firstLocalSeat()) return;
    if (!isWallMode()) return;
    const a = an.split(',');
    M.drag = { r: a[0] | 0, c: a[1] | 0, x: ev.clientX, y: ev.clientY, pulled: false };
    try { svg.setPointerCapture(ev.pointerId); } catch(_){}
  });
  svg.addEventListener('pointermove', ev => {
    const d = M && M.drag; if (!d) return;
    const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
    if (dx * dx + dy * dy < 100) return;           /* not a pull yet */
    const o = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    d.pulled = true;
    if (!wallLegal(d.r, d.c, o)) return;           /* that way is not allowed here */
    if (!M.pre || M.pre.r !== d.r || M.pre.c !== d.c || M.pre.o !== o){
      M.pre = { r: d.r, c: d.c, o };
      cue('ui.tap', { gain:.35 });
      buzz('tick');
      paint();
    }
  });
  const endDrag = ev => {
    const d = M && M.drag; if (!d) return;
    M.drag = null;
    const seat = E.turn(M.st);
    if (seat < 0 || !isLocal(seat)) return;
    if (!d.pulled) return;                          /* a tap: the click below previews */
    if (M.pre && M.pre.r === d.r && M.pre.c === d.c){
      const w = M.pre; M.pre = null; M.lastO = w.o;
      M.noClick = true;                             /* the click that follows is ours */
      doMove(seat, { t:'wall', r: w.r, c: w.c, o: w.o }, 'local');
      M.mode = 'go'; afterMove();
    }
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', () => { if (M) M.drag = null; });

  svg.addEventListener('click', ev => {
    if (M && M.noClick){ M.noClick = false; return; }   /* the drag already built it */
    const t = ev.target;
    const go = t.getAttribute && t.getAttribute('data-go');
    const an = t.getAttribute && t.getAttribute('data-anchor');
    const pl = t.getAttribute && t.getAttribute('data-place');
    const rot = t.getAttribute && t.getAttribute('data-rot');
    const seat = E.turn(M.st);
    if (seat < 0 || !isLocal(seat)) return;
    if (M.net && seat !== firstLocalSeat()) return;
    if (go){
      const a = go.split(',');
      M.pre = null;
      doMove(seat, { t:'go', r: a[0] | 0, c: a[1] | 0 }, 'local');
      M.mode = 'go'; afterMove();
    } else if (rot && M.pre){
      /* TURN IT — flip the preview between ━ and ┃ */
      const other = M.pre.o === 'h' ? 'v' : 'h';
      if (wallLegal(M.pre.r, M.pre.c, other)){
        M.pre = { r: M.pre.r, c: M.pre.c, o: other };
        cue('ui.tap', { gain:.6 });
        paint();
      }
    } else if (pl && M.pre){
      /* tap the bright preview — build it */
      const w = M.pre; M.pre = null; M.lastO = w.o;
      doMove(seat, { t:'wall', r: w.r, c: w.c, o: w.o }, 'local');
      M.mode = 'go'; afterMove();
    } else if (an){
      const a = an.split(',');
      const r = a[0] | 0, c = a[1] | 0;
      if (M.pre && M.pre.r === r && M.pre.c === c){
        /* tapped the same dot again — build what is previewed there */
        const w = M.pre; M.pre = null; M.lastO = w.o;
        doMove(seat, { t:'wall', r: w.r, c: w.c, o: w.o }, 'local');
        M.mode = 'go'; afterMove();
      } else {
        /* first tap on a dot: preview it, preferring the direction you used
           last so repeat placements feel predictable */
        const want = (M.lastO === 'v' && wallLegal(r, c, 'v')) ? 'v'
                   : wallLegal(r, c, 'h') ? 'h'
                   : wallLegal(r, c, 'v') ? 'v' : null;
        if (!want) return;
        M.pre = { r, c, o: want };
        cue('ui.tap', { gain:.6 });
        paint();
      }
    }
  });
  /* seats */
  let chips = '';
  for (let i = 0; i < seatCount(); i++){
    const col = seatColour(i);
    chips += '<span class="sq-seat' + (E.turn(M.st) === i ? ' on' : '') +
      '" style="--sq-c:' + col.hex + '">' +
      '<span class="sq-f">' + chipFace(i, 26) + '</span>' +
      '<b>' + esc(seatName(i)) + '</b>' +
      '<span class="sq-w" title="' + esc(T('walls left', 'ħitan fadal')) + '">' +
        M.st.left[i] + ' ▮</span></span>';
  }
  UI.seats.innerHTML = chips;
  /* modes */
  const seat = E.turn(M.st);
  const my = seat >= 0 && isLocal(seat) && (!M.net || seat === firstLocalSeat());
  const wallsLeft = seat >= 0 ? M.st.left[seat] : 0;
  UI.modes.innerHTML =
    '<button class="sq-mode' + (M.mode === 'go' ? ' on' : '') + '" data-m="go">' +
      esc(T('Step', 'Pass')) + '</button>' +
    /* ONE wall button now: the direction is chosen on the board (drag, or the
       rotate handle), not up here — picking ━ or ┃ before you had even chosen
       a spot is what made walls go down the wrong way. */
    '<button class="sq-mode' + (isWallMode() ? ' on' : '') + '" data-m="w"' +
      (wallsLeft ? '' : ' disabled') + '>' + esc(T('Wall', 'Ħajt')) + ' ━┃</button>';
  UI.modes.querySelectorAll('.sq-mode').forEach(b => {
    b.onclick = () => { M.mode = b.getAttribute('data-m'); M.pre = null; cue('ui.tap', { gain:.6 }); paint(); };
  });
  UI.hint.textContent = M.st.winner >= 0 ? ''
    : !my ? (seatName(seat) + ' — ' + T('their go', 'imissu'))
    : M.mode === 'go' ? T('Tap a lit square to step.', 'Għafas kaxxa mixgħula biex timxi.')
    : M.pre ? T('Tap the bright wall to build it — or ↻ to turn it.',
                'Għafas il-ħajt jixgħel biex tibnih — jew ↻ biex iddawru.')
    : T('Drag off a dot to draw the wall — sideways or up-and-down.',
        'Iġbed minn tikka biex tpinġi l-ħajt — mal-ġenb jew ’il fuq u ’l isfel.');
}

/* after every move: repaint, check the end, poke the machine */
function afterMove(){
  if (!M) return;
  paint();
  if (E.over(M.st)){ finish(); return; }
  maybeThink();
}
function maybeThink(){
  if (!M || M.dead || E.over(M.st)) return;
  const seat = E.turn(M.st);
  if (seat < 0 || ownerOf(seat) !== 'ai') return;
  if (M.net) return;                       /* online tables drive no machines */
  stopThinking();
  M.timer = setTimeout(() => {
    if (!M || M.dead || E.over(M.st) || E.turn(M.st) !== seat) return;
    const mv = E.aiMove(M.st, seat, seatLvl(seat));
    if (mv) doMove(seat, mv, 'ai');
    afterMove();
  }, reduced() ? 120 : 520);
}

/* ═════════════ the frame ═════════════ */
function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: T('Is-Sqaq', 'Is-Sqaq'),
    onBack,
    leave: () => leave(),
    buttons: [ { id:'sq-rules', label:T('Rules', 'Regoli'), icon:'book', cls:'ghost' } ]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();
  M.ctx.badge.textContent = M.net ? T('Online', 'Onlajn')
    : (M.meta || []).some(m => m && m.own === 'ai') ? levelName(seatLvl(1))
    : T('Pass & play', 'Għaddi u lgħab');
  /* the frame's pt-board is an 8x8 chess grid with overflow:hidden —
     neutralise it for one free-flowing SVG, and use the rails the frame
     provides for exactly this: chips above the board, modes below. */
  M.ctx.board.style.cssText =
    'display:block;grid-template-columns:none;grid-template-rows:none;' +
    'width:min(94vw,50vh,520px);border:0;box-shadow:none;overflow:visible;background:transparent';
  M.ctx.railTop.innerHTML = '<div class="sq-seats"></div>';
  M.ctx.railBot.innerHTML = '<div class="sq-modes"></div>';
  M.ctx.root.insertAdjacentHTML('beforeend',
    '<div class="sq-rules" id="sq-rulescard" aria-hidden="true">' +
      '<h4>' + esc(T('Is-Sqaq — the rules', 'Is-Sqaq — ir-regoli')) + '</h4>' +
      '<button class="sq-rules-x" id="sq-rules-x" aria-label="' + esc(T('Close', 'Agħlaq')) + '">' +
        '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<ul>' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul>' +
    '</div>');
  UI = { board: M.ctx.board, seats: M.ctx.railTop.querySelector('.sq-seats'),
         modes: M.ctx.railBot.querySelector('.sq-modes'), hint: M.ctx.turn };
  const rc = M.ctx.root.querySelector('#sq-rulescard');
  const btn = M.ctx.btn ? M.ctx.btn('sq-rules') : null;
  const openRules = o => { rc.classList.toggle('open', o); rc.setAttribute('aria-hidden', o ? 'false' : 'true'); };
  if (btn) btn.onclick = () => openRules(!rc.classList.contains('open'));
  M.ctx.root.querySelector('#sq-rules-x').onclick = () => openRules(false);
  paint();
}

function rulesFor(){
  return [
    T('Reach <b>any square on the far side</b> before anyone else. First to touch it wins.',
      'Ilħaq <b>kwalunkwe kaxxa fuq in-naħa l-oħra</b> qabel ħaddieħor. L-ewwel li jmissha jirbaħ.'),
    T('On your turn, <b>step one square</b> — or spend one of your <b>walls</b>. A wall is two ' +
      'squares long and sits between the squares.',
      'Meta jmissek, <b>imxi kaxxa waħda</b> — jew uża wieħed mill-<b>ħitan</b> tiegħek. Ħajt hu ' +
      'twil żewġ kaxxi u joqgħod bejn il-kaxxi.'),
    T('A pawn right next to you is <b>jumped over</b>; if a wall sits behind it, you step ' +
      '<b>diagonally</b> around instead.',
      'Pedina eżatt ħdejk <b>taqbiżha</b>; jekk hemm ħajt warajha, tersaq <b>djagonalment</b> madwarha.'),
    T('You may make somebody’s road long and bitter — but <b>never closed</b>: a wall that would ' +
      'seal anyone in completely is not allowed, and the board will not offer it.',
      'Tista’ ttawwal it-triq ta’ xi ħadd kemm trid — imma <b>qatt tagħlaqha għalkollox</b>: ħajt ' +
      'li jissiġilla lil xi ħadd mhux permess, u t-tabellun lanqas joffrih.'),
    T('Walls each: <b>ten</b> for two players, <b>seven</b> for three, <b>five</b> for four.',
      'Ħitan kull wieħed: <b>għaxra</b> għal tnejn, <b>sebgħa</b> għal tlieta, <b>ħamsa</b> għal erbgħa.')
  ];
}

/* ═════════════ THE END — the shared winner screen, paid once ═════════════ */
function finish(forced){
  if (!M || M.finished) return;
  M.finished = true;
  stopThinking();
  const ov = forced || E.over(M.st);
  if (!ov) return;
  cue('game.win', { gain:.95 }, true);
  const me = firstLocalSeat();
  const iWon = me >= 0 && ov.winners.indexOf(me) >= 0;
  if (iWon) buzz('win');            /* the one long buzz, once, and only his */
  if (!M.net && !M.recorded){
    M.recorded = true;
    if (iWon) ST.rec.w++; else if (me >= 0) ST.rec.l++;
    persist();
  }
  saveSlot(null);

  /* rank: the winner, then everybody else by how close they got */
  const order = [];
  for (let i = 0; i < seatCount(); i++) order.push(i);
  const closeness = i => { const L = E.pathLen(M.st, i); return L < 0 ? 99 : L; };
  order.sort((a, b) => (a === ov.winner ? -1 : b === ov.winner ? 1 : closeness(a) - closeness(b)));
  const roster = (M.net && window.KARTI_MP && KARTI_MP.rosterSeats) ? (KARTI_MP.rosterSeats() || []) : [];
  const rows = order.map((seat, i) => {
    const rs = roster.find(x => (x.seat | 0) === seat);
    return {
      name: isLocal(seat) ? T('You', 'Int') : seatName(seat),
      place: i + 1, you: isLocal(seat), bot: ownerOf(seat) === 'ai',
      score: seat === ov.winner ? T('home', 'wasal')
        : closeness(seat) < 99 ? closeness(seat) + ' ' + T('to go', 'fadal') : '—',
      border: (rs && rs.look && rs.look.b) || seatColour(seat).border,
      av: rs ? rs.av : undefined, pv: rs ? rs.pv : undefined
    };
  });

  const net = M.net;
  const title = (ov.sole && iWon) ? T('They walked out — you win', 'Telaq — ir-rebħa tiegħek')
    : iWon ? T('You broke through!', 'Qbiżt kollox!')
    : (me >= 0) ? T('Walled off', 'Maqful barra')
    : seatName(ov.winner) + ' ' + T('wins', 'jirbaħ');

  const show = window.KARTI_REBBIEH && window.KARTI_REBBIEH.show;
  if (!show){
    P.ui.result(M.ctx, {
      tone: iWon ? 'win' : 'lose', head: title,
      why: T('First to the far side takes it.', 'L-ewwel fuq in-naħa l-oħra jirbaħ.'),
      buttons: [
        { label:T('Play again', 'Erġa’ lgħab'), icon:'refresh', cls:'primary',
          go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else setupSheet(); } },
        { label:T('Leave', 'Oħroġ'), icon:'back', cls:'ghost',
          go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }
      ]
    });
    return;
  }
  /* pay exactly once, under the match id; the ladder under the same id */
  const MPX = window.KARTI_MP;
  const staked = !!(net && MPX && MPX.MP && MPX.MP.stakeLive);
  const mid = 'sqaq:' + (net && MPX && MPX.MP && MPX.MP.code ? MPX.MP.code : 'local') + ':' + M.log.length;
  let pay = null;
  if (me >= 0 && window.KARTI_XP && KARTI_XP.awardPlay){
    try {
      const r = KARTI_XP.awardPlay({ game:'sqaq', won: iWon, draw:false, id: mid, ranked: staked });
      if (r && r.counted) pay = r;
    } catch(e){}
  }
  try {
    if (me >= 0 && window.KARTI_STATS && KARTI_STATS.record)
      KARTI_STATS.record('sqaq', { result: iWon ? 'win' : 'loss', id: mid });
  } catch(e){}
  let potRes = null;
  if (staked && me >= 0){
    try { potRes = MPX.stakeSettle ? MPX.stakeSettle(iWon ? 'win' : 'lose') : null; } catch(e){}
  }
  if (!potRes && iWon && M.solePot){ potRes = M.solePot; M.solePot = null; }

  show({
    title,
    subtitle: T('The alley is run', 'L-isqaq intemm'),
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
    playAgainLabel: net ? T('Back to the rooms', 'Lura fil-kmamar') : T('Play again', 'Erġa’ lgħab'),
    onPlayAgain: () => { leave(); if (net && net.onLeave) net.onLeave(); else setupSheet(); },
    onLeave:     () => { leave(); if (net && net.onLeave) net.onLeave(); else P.hub(); }
  });
}

function leave(){
  stopThinking();
  if (M){ autosave(); persistNow(); M.dead = true; }
  M = null; UI = null;
}

/* ═════════════ menus ═════════════ */
function heroSVG(){
  let s = '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="4" y="4" width="112" height="112" rx="14" fill="#1a1430"/>';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
    s += '<rect x="' + (12 + c * 26) + '" y="' + (12 + r * 26) + '" width="20" height="20" rx="4" fill="#2a2145"/>';
  s += '<rect x="12" y="34" width="46" height="6" rx="3" fill="#FFB46B"/>' +
       '<rect x="60" y="60" width="6" height="46" rx="3" fill="#FFB46B"/>' +
       '<circle cx="22" cy="99" r="8" fill="#FFC542" stroke="#0e0a18" stroke-width="2.5"/>' +
       '<circle cx="99" cy="22" r="8" fill="#4FB6FF" stroke="#0e0a18" stroke-width="2.5"/></svg>';
  return s;
}
function canGoOnline(){
  try { return !!(window.KARTI_MP && KARTI_MP.openFor && P.online && P.online.sqaq); } catch(e){ return false; }
}
function setupSheet(){
  injectCSS();
  P.show();
  stopThinking(); M = null; UI = null;
  const el = P.ui.screenEl();
  const online = canGoOnline();
  el.innerHTML =
    '<div class="pt-wrap sq-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="sq-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + esc(T('Is-Sqaq', 'Is-Sqaq')) + '</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="sq-hero" aria-hidden="true">' + heroSVG() + '</div>' +
      '<p class="blurb">' +
        T('Race your pawn to the far side of the alley. Step, jump — or spend a wall to send ' +
          'somebody the long way round. You may bend their road; you may never close it.',
          'Iġri bil-pedina tiegħek san-naħa l-oħra tal-isqaq. Imxi, aqbeż — jew ibni ħajt biex ' +
          'tibgħat lil xi ħadd mit-triq it-twila. Tista’ tgħawweġ triqthom; qatt ma tagħlaqha.') +
      '</p>' +
      (ST.save
        ? '<button class="btn primary" id="sq-res" style="margin:2px 0 12px">' +
          esc(T('Carry on the saved game', 'Kompli l-logħba mħażna')) + '</button>' : '') +
      '<div style="display:grid;gap:9px;margin-top:4px">' +
        (online
          ? '<button class="btn primary" id="sq-online">' + ico('users') + ' ' +
            esc(T('Play online', 'Ilgħab onlajn')) + '</button>' : '') +
        '<button class="btn' + (online ? ' ghost' : ' primary') + '" id="sq-ai">' +
          ico('coach') + ' ' + esc(T('Play with the machine', 'Ilgħab mal-magna')) + '</button>' +
        '<button class="btn ghost" id="sq-pnp">' + ico('users') + ' ' +
          esc(T('Pass the phone', 'Għaddi t-telefon')) + '</button>' +
        '<button class="btn ghost" id="sq-rulesbtn">' + ico('book') + ' ' +
          esc(T('How to play', 'Kif tilgħab')) + '</button>' +
      '</div>' +
      (ST.rec.w + ST.rec.l
        ? '<p class="pt-ledger" style="margin-top:14px">' +
          T('So far: <b>' + ST.rec.w + '</b> won, <b>' + ST.rec.l + '</b> lost.',
            'S’issa: <b>' + ST.rec.w + '</b> rebħin, <b>' + ST.rec.l + '</b> mitlufin.') + '</p>' : '') +
    '</div>' +
    '<div class="sq-rules" id="sq-menurules" aria-hidden="true">' +
      '<h4>' + esc(T('Is-Sqaq — the rules', 'Is-Sqaq — ir-regoli')) + '</h4>' +
      '<button class="sq-rules-x" id="sq-menurules-x" aria-label="' + esc(T('Close', 'Agħlaq')) + '">' +
        '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<ul>' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul>' +
    '</div>' +
    '</div>';
  el.querySelector('#sq-back').onclick = () => { cue('ui.back'); P.hub(); };
  const on = el.querySelector('#sq-online');
  if (on) on.onclick = () => { if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('sqaq'); };
  el.querySelector('#sq-ai').onclick  = () => offlineSetup('ai');
  el.querySelector('#sq-pnp').onclick = () => offlineSetup('pnp');
  const rs = el.querySelector('#sq-res');
  if (rs) rs.onclick = () => { if (ST.save) resumeSaved(); };
  const rules = el.querySelector('#sq-menurules');
  const openRules = o => { rules.classList.toggle('open', o); rules.setAttribute('aria-hidden', o ? 'false' : 'true'); };
  el.querySelector('#sq-rulesbtn').onclick = () => openRules(!rules.classList.contains('open'));
  el.querySelector('#sq-menurules-x').onclick = () => openRules(false);
}

function offlineSetup(mode){
  injectCSS();
  P.show();
  const el = P.ui.screenEl();
  const p = pref();
  let seats = Math.max(2, Math.min(4, p.seats || 2));
  let lvl = p.lvl || 2;
  function paintMenu(){
    el.innerHTML =
      '<div class="pt-wrap sq-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="sq-b2" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(mode === 'ai' ? T('Against the machine', 'Kontra l-magna') : T('Pass the phone', 'Għaddi t-telefon')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<p class="blurb">' + esc(T('How many pawns in the alley?', 'Kemm-il pedina fl-isqaq?')) + '</p>' +
        '<div style="display:flex;gap:9px;margin:4px 0 16px">' +
          [2, 3, 4].map(n => '<button class="btn' + (n === seats ? ' primary' : ' ghost') +
            '" data-n="' + n + '" style="flex:1">' + n + '</button>').join('') +
        '</div>' +
        (mode === 'ai'
          ? '<p class="blurb">' + esc(T('How mean is the machine?', 'Kemm hi kattiva l-magna?')) + '</p>' +
            '<div style="display:grid;gap:8px;margin:4px 0 16px">' +
            LEVELS.map(L => '<button class="btn' + (L.level === lvl ? ' primary' : ' ghost') +
              '" data-l="' + L.level + '">' + esc(L.name) + ' — ' + esc(T(L.note.en, L.note.mt)) + '</button>').join('') +
            '</div>'
          : '') +
        '<button class="btn primary" id="sq-go" style="margin-top:6px;width:100%">' +
          esc(T('Start', 'Ibda')) + '</button>' +
      '</div></div>';
    el.querySelector('#sq-b2').onclick = () => { cue('ui.back'); setupSheet(); };
    el.querySelectorAll('[data-n]').forEach(b => {
      b.onclick = () => { seats = b.getAttribute('data-n') | 0; pref({ seats }); paintMenu(); };
    });
    el.querySelectorAll('[data-l]').forEach(b => {
      b.onclick = () => { lvl = b.getAttribute('data-l') | 0; pref({ lvl }); paintMenu(); };
    });
    el.querySelector('#sq-go').onclick = () => {
      startMatch({ seats });
      M.meta = [];
      for (let i = 0; i < seats; i++){
        M.meta.push(mode === 'ai'
          ? { own: i === 0 ? 'me' : 'ai', name: i === 0 ? myName() : levelName(lvl), lvl }
          : { own: 'hot', name: seatTitle(i), lvl: 2 });
      }
      openBoard(() => { leave(); setupSheet(); });
      afterMove();
    };
  }
  paintMenu();
}
function resumeSaved(){
  const s = ST.save;
  if (!s || s.gid !== 'sqaq'){ saveSlot(null); return setupSheet(); }
  startMatch(s.opts, s.log);
  M.meta = s.meta || null;
  openBoard(() => { leave(); setupSheet(); });
  afterMove();
}

/* ═════════════ THE ONLINE CONTROLLER — KARTI_PARTY.online.sqaq ═════════════ */
const hooks = {
  /* mp.js subscribes with (move, {seat, src}); our feed fires one
     {seat, move, index, src} event — adapt here (the aqleb lesson:
     without this, mp.js gets the event object as the move and stops
     the table on the first local step). */
  onMove(fn){
    const f = ev => { if (ev) fn(ev.move, { seat: ev.seat, src: ev.src }); };
    moveSubs.push(f);
    return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); };
  },
  phase(){ return M ? 'play' : 'idle'; },
  apply(seat, move){ if (!M) return { ok:false, why:'no sqaq' }; return onlineRemote(seat, move); },
  attachNet(net){ if (M) M.net = net || null; },
  setOwner(i, own){ if (M && M.meta && M.meta[i]) M.meta[i].own = own; },
  setName(i, name){ if (M && M.meta && M.meta[i] && name) M.meta[i].name = name; },
  live(){ return !!(M && !M.dead && !E.over(M.st)); },
  seatBack(){ if (M && UI) paint(); },
  /* a seat gone for good: the pawn freezes as an obstacle and its
     turns are skipped — the same deterministic call on every phone
     off the same relay event, so the states cannot disagree. */
  seatGone(seat){
    if (!M || M.dead || E.over(M.st)) return;
    E.dropSeat(M.st, seat | 0);
    if (M.meta && M.meta[seat]) M.meta[seat].own = 'net';
    paint();
  },
  /* the 1v1 walk-out is a win — mp.js calls this only when the match
     began with exactly two seats and the other left for good. */
  soleWin(seat, pot){
    if (!M || M.dead || M.finished || !M.net || E.over(M.st)) return;
    const me = firstLocalSeat();
    if (me < 0) return;
    M.solePot = pot || null;
    finish({ winner: me, winners: [me], draw: false, sole: true });
  }
};

function onlineStart(cfg){
  cfg = cfg || {};
  injectCSS();
  P.show();
  const list = cfg.seats || [];
  const n = Math.max(2, Math.min(4, list.length || (cfg.opts && cfg.opts.seats) || 2));
  startMatch({ seats: n });
  M.meta = [];
  for (let i = 0; i < n; i++){
    const s = list[i] || {};
    const own = (i === cfg.you) ? 'me' : 'net';
    M.meta.push({ own, name: s.name || seatTitle(i), lvl: 2 });
  }
  M.net = cfg.net || null;
  M.finished = false;
  openBoard(() => { const nn = M && M.net; leave(); if (nn && nn.onLeave) nn.onLeave(); else P.hub(); });
  hooks.attachNet(cfg.net || null);
  afterMove();
  return snapshot();
}
function onlineRemote(seat, move){
  if (!M) return { ok:false, why:'no sqaq on the table' };
  if (E.over(M.st)) return { ok:false, why:'the game is over' };
  const dec = E.decWire(move) || move;
  const res = doMove(seat, dec, 'net');
  if (!res.ok) return { ok:false, why: res.err || 'that move did not fit the rules' };
  afterMove();
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
    why: why || T('The game stopped.', 'Il-logħba waqfet.'),
    quip: T('Nobody lost anything.', 'Ħadd ma tilef xejn.'),
    buttons: [{ label:T('Back to the rooms', 'Lura fil-kmamar'), icon:'back', cls:'primary',
      go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
  });
}

P.online = P.online || {};
P.online.sqaq = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  live: () => !!(M && !M.dead && hooks.live()),
  hooks
};

/* ═════════════ the lobby contract — read by js/mp.js ═════════════ */
const LOBBY = {
  id:'sqaq',
  name:'Is-Sqaq',
  mt:'Is-Sqaq',
  minSeats: E.MIN_SEATS,
  maxSeats: E.MAX_SEATS,
  levels: LEVELS.map(L => ({ level:L.level, name:L.name, note:T(L.note.en, L.note.mt) })),
  defaultLevel: 2,
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    const n = (seatList || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why:T('Is-Sqaq needs at least two.', 'Is-Sqaq irid tal-anqas tnejn.') };
    if (n > E.MAX_SEATS) return { ok:false, why:T('Up to four can play.', 'Sa erbgħa jistgħu jilagħbu.') };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready) return { ok:false, why: unready + (unready > 1
      ? T(' people are not ready yet.', ' persuni għadhom mhux lesti.')
      : T(' person is not ready yet.', ' persuna għadha mhux lesta.')) };
    return { ok:true, why:'' };
  },
  rulesHTML: () => '<p>' + rulesFor().join('</p><p>') + '</p>',
  blurb: T('Race to the far side. Wall them off — never seal them in.',
           'Iġri san-naħa l-oħra. Ibnilhom ħajt — imma qatt tagħlaqhom għalkollox.'),
  start(seats, opts){
    const n = Math.max(2, Math.min(4, (seats && seats.length) || 2));
    startMatch({ seats: n });
    M.meta = [];
    for (let i = 0; i < n; i++) M.meta.push({ own:'hot', name: seatTitle(i), lvl:2 });
    openBoard(() => { leave(); setupSheet(); });
    afterMove();
    return snapshot();
  },
  myName,
  wire: { fields: E.WIRE_FIELDS },
  takeback: false
};
R.lobby = LOBBY;

/* ═════════════ the shelf tile ═════════════ */
const TILE = {
  id:'sqaq', order:29, kind:'board', cat:'board',
  name:'Is-Sqaq', mt:'Is-Sqaq', icon:'map', status:'live',
  get tag(){
    return T('Race your pawn down the alley to the far side — and spend your walls to send the ' +
             'others the long way round. Two to four players, no luck at all.',
             'Iġri bil-pedina tiegħek mal-isqaq san-naħa l-oħra — u uża l-ħitan biex tibgħat ' +
             'lill-oħrajn mit-triq it-twila. Tnejn sa erbgħa, ebda xorti.') +
           (ST.save ? ' ' + T('There is a game half-played.', 'Hemm logħba nofsha milgħuba.') : '');
  },
  open: () => setupSheet(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: LOBBY.levels,
  rulesHTML: () => LOBBY.rulesHTML(),
  start: (seatList, o) => LOBBY.start(seatList, o)
};
R.shelfTile = TILE;
R.ui = { open: setupSheet, leave, injectCSS };
R.open  = () => setupSheet();
R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

/* test hooks — inert unless opened with ?sqaqtest */
if (/[?&]sqaqtest\b/.test(location.search || '')){
  window.__SQAQ_TEST = {
    setupSheet, offlineSetup, startMatch, doMove, afterMove, paint,
    get M(){ return M; }, get UI(){ return UI; },
    engine: E, LOBBY, hooks, online: P.online.sqaq, leave
  };
}

})();
