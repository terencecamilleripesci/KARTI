/* ═══════════════════════════════════════════════════════════════════
   KARTI — tapp-ui.js
   IT-TAPP (flick the bottle caps, 2–4 players) — the tappable game on
   top of js/tapp.js's pure engine (window.KARTI_TAPP.engine). This file
   is the screen, the runner and the wire, and it follows
   js/aqleb-ui.js's shape deliberately: a match is (opts, seed, log),
   every move goes through one doMove() gate, and a rollback is cutting
   the log and replaying it.

   WHAT THIS FILE IS
     · the shelf tile and the MINIMAL entry menu — a themed hero, three
       big buttons (PLAY ONLINE / PLAY WITH THE MACHINE / PASS THE
       PHONE) and a "How to play"; player count and difficulty are a
       tiny SECOND step, never a settings wall on screen one
     · the pitch: one canvas, green felt, the mouths painted in the
       colour of whoever defends them, caps as little bottle tops and
       the ball as a white puck
     · THE SLINGSHOT. You TAP one of your caps to pick it up, DRAG
       BACKWARDS away from where you want it to go, and let go — the cap
       fires along the opposite line, as hard as you pulled. Pool cue,
       not swipe. Drag back to nearly nothing to change your mind.
     · the film: the engine settles the whole table the instant the move
       is real and hands back a frame-by-frame film; the screen simply
       plays it. So the state can never lag behind the wire (the bug
       js/aqleb-ui.js documents at commitPlace) and both phones watch
       the identical physics.
     · the runner: log, seed, autosave (karti_tapp_v1)
     · the online controller on KARTI_PARTY.online.tapp and the lobby
       contract on window.KARTI_TAPP.lobby, both exactly the shape
       js/mp.js reads.

   THE VIEW IS TURNED SO YOUR MOUTH IS AT THE BOTTOM
     Everybody would like to be shooting UP the screen. The pitch is
     rotated by whole quarter-turns so the local seat's own wall is the
     bottom of the canvas — and because the 3–4 seat pitch is SQUARE
     (see js/tapp.js), a quarter turn never changes the canvas's shape.
     One pair of functions, toView()/toPitch(), is the whole of it, and
     every pointer goes back through toPitch() so aiming is always in
     pitch coordinates. The wire carries pitch angles, never view ones.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_TAPP;
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
   THE SEAT COLOURS — the KARTI seat palette: seat0 gold, seat1 ice,
   seat2 jade, seat3 ruby. The `border` ids are exactly the ones
   js/rebbieh.js knows, so the podium frames match the caps with no
   extra wiring. hi/lo shade the cap's little dome.
   ═══════════════════════════════════════════════════════════════════ */
const CAPS = [
  { id:'gold', border:'gold', hex:'#FFC542', hi:'#FFE08A', lo:'#C89211', name:{ en:'Gold', mt:'Deheb'  } },
  { id:'ice',  border:'ice',  hex:'#4FB6FF', hi:'#A7E0FF', lo:'#1E6FB8', name:{ en:'Ice',  mt:'Silġ'   } },
  { id:'jade', border:'jade', hex:'#3DDC84', hi:'#93F5BE', lo:'#1C9557', name:{ en:'Jade', mt:'Ġada'   } },
  { id:'ruby', border:'ruby', hex:'#FF5468', hi:'#FF97A5', lo:'#B0263A', name:{ en:'Ruby', mt:'Rubin'  } }
];
const capColour = seat => CAPS[seat] || CAPS[0];
const capName   = seat => TE(capColour(seat).name);

/* ═══════════════════════════════════════════════════════════════════
   OUR CORNER OF localStorage — the save, the prefs and the record.
   ═══════════════════════════════════════════════════════════════════ */
const STORE  = 'karti_tapp_v1';
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

const UIKEY = 'karti_tapp_ui_v1';
let rulesOpen = false;
try { rulesOpen = localStorage.getItem(UIKEY + '.rules') === '1'; } catch(e){}

function levels(){ return (E.LEVELS || []).map(L => ({ level:L.k, name:L.name, note:L.note, icon:L.icon })); }
function levelName(k){ const L = levels().find(x => x.level === k); return (L && L.name) || 'MAKNA'; }

/* ═══════════════════════════════════════════════════════════════════
   SOUND — existing ids only (js/sfx.js), through one gate so a long
   chain of contacts does not machine-gun the mixer.
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
    E.apply(st, mv, { frames:false });
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
    anim: null, raf: 0, goalFlash: 0,
    recorded: false,
    net: null, meta: null,
    drag: null                 /* { k, cap, px, py, pow, ang } while aiming */
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

/* ownership lives in the UI (the engine only knows seats).
   meta[i] = { own:'me'|'hot'|'ai'|'net', name, lvl } */
function seatCount(){ return M && M.st ? M.st.seats : 2; }
function ownerOf(i){
  if (!M || !M.meta || !M.meta[i]) return 'ai';
  return M.meta[i].own || 'ai';
}
const isLocal = i => { const o = ownerOf(i); return o === 'me' || o === 'hot'; };
function seatLvl(i){ return (M && M.meta && M.meta[i] && M.meta[i].lvl) || 2; }
function seatName(i){
  if (!M || !M.meta || !M.meta[i]) return capName(i);
  const m = M.meta[i];
  if (m.own === 'me' || m.own === 'hot') return m.name || T('You', 'Int');
  if (m.own === 'ai') return levelName(m.lvl);
  return m.name || capName(i);
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
  E.apply(M.st, rec);                       /* settles NOW, film attached */
  autosave();
  fireList(moveSubs,  { seat, move:clone(move), index:idx, src:src || 'local', landed:M.st.last });
  fireList(stateSubs, { reason:'move', index:idx });
  return { ok:true, index:idx };
}

function snapshot(){
  if (!M) return null;
  return { v:SAVE_V, gid:'tapp', opts:clone(M.opts), seed:M.seed, log:clone(M.log), meta:clone(M.meta || null) };
}
function autosave(){
  if (!M || M.net) return;
  if (E.over(M.st)){ saveSlot(null); return; }
  saveSlot(snapshot());
}

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party.
   ═══════════════════════════════════════════════════════════════════ */
let cssDone = false;
function injectCSS(){
  if (cssDone || document.getElementById('tp-runtime-css')){ cssDone = true; return; }
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'tp-runtime-css';
  st.textContent =
    '#scr-party{--tp-grass:#1D6B3A;--tp-grass2:#0E3F21;--tp-gold:var(--gold,#FFC542)}' +

    '#scr-party .pt-host.tp-host{align-items:stretch;justify-content:stretch;overflow:visible}' +
    '#scr-party .tp-wrap{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;' +
      'gap:5px;padding:5px 0 6px;position:relative}' +

    /* ── the seat chips across the top ── */
    '#scr-party .tp-seats{flex:0 0 auto;display:flex;gap:6px;justify-content:center;' +
      'flex-wrap:wrap;padding:1px 2px}' +
    '#scr-party .tp-seat{flex:0 1 auto;position:relative;display:flex;align-items:center;gap:7px;' +
      'min-width:0;padding:4px 11px 4px 6px;border-radius:12px;' +
      'background:rgba(0,0,0,.30);border:1px solid rgba(255,255,255,.09);transition:border-color .2s}' +
    '#scr-party .tp-seat.on{background:rgba(255,197,66,.14);border-color:rgba(255,197,66,.6)}' +
    '#scr-party .tp-seat .sw{width:18px;height:18px;flex:0 0 auto;border-radius:50%;' +
      'box-shadow:inset 0 2px 0 rgba(255,255,255,.45),inset 0 0 0 1.5px rgba(0,0,0,.3),0 1px 3px rgba(0,0,0,.5)}' +
    '#scr-party .tp-seat .n{font:900 10px/1.1 var(--disp);letter-spacing:.05em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.74);max-width:96px;white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .tp-seat.on .n{color:var(--tp-gold)}' +
    '#scr-party .tp-seat .h{font:900 13px/1 var(--disp);color:rgba(255,255,255,.92);' +
      'font-variant-numeric:tabular-nums}' +
    '#scr-party .tp-seat.on .h{color:var(--tp-gold)}' +

    /* ── the pitch box holds the canvas ── */
    '#scr-party .tp-boardbox{flex:1 1 auto;min-height:0;position:relative;display:flex;' +
      'align-items:center;justify-content:center}' +
    '#scr-party .tp-canv{display:block;touch-action:none;-webkit-tap-highlight-color:transparent;' +
      'border-radius:12px;filter:drop-shadow(0 10px 26px rgba(0,0,0,.5));cursor:pointer}' +

    /* ── the status line under the pitch ── */
    '#scr-party .tp-say{flex:0 0 auto;font:700 12px/1.4 var(--body);text-align:center;' +
      'color:rgba(255,255,255,.85);min-height:17px;padding:0 8px}' +
    '#scr-party .tp-say b{color:var(--tp-gold);font-weight:900}' +
    '#scr-party .tp-say .dot{display:inline-block;width:11px;height:11px;border-radius:50%;' +
      'vertical-align:-1px;margin-right:5px;box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}' +

    /* ── the rules panel: slide from the top ── */
    '#scr-party .tp-rules{position:absolute;top:0;left:0;right:0;z-index:30;max-height:64%;' +
      'display:flex;flex-direction:column;border-radius:14px;overflow:hidden;' +
      'background:linear-gradient(180deg,#1D5A34,#0A1D12);border:1px solid rgba(255,255,255,.16);' +
      'box-shadow:0 14px 30px rgba(0,0,0,.55);' +
      'transform:translateY(-108%);opacity:0;visibility:hidden;pointer-events:none;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease),visibility 0s .26s}' +
    '#scr-party .tp-rules.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease)}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .tp-rules{transition:none}}' +
    'body.reduced #scr-party .tp-rules{transition:none}' +
    '#scr-party .tp-rules-h{flex:0 0 auto;display:flex;align-items:center;' +
      'justify-content:space-between;padding:9px 4px 2px 14px}' +
    '#scr-party .tp-rules-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--tp-gold)}' +
    '#scr-party .tp-rules-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;' +
      'color:var(--txt);cursor:pointer;display:grid;place-items:center;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .tp-rules-x svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round}' +
    '#scr-party .tp-rules-b{min-height:0;overflow-y:auto;padding:2px 14px 12px;-webkit-overflow-scrolling:touch}' +
    '#scr-party .tp-rules-b li{font-size:12px;line-height:1.6;color:var(--dim);margin:0 0 6px 14px}' +

    /* ── landscape: seats down the side ── */
    '@media (max-height:520px){' +
      '#scr-party .tp-wrap{flex-direction:row;align-items:stretch;gap:8px}' +
      '#scr-party .tp-seats{flex-direction:column;flex:0 0 auto;justify-content:flex-start;max-width:150px}' +
      '#scr-party .tp-mid{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:5px}' +
      '#scr-party .tp-say{order:-1}' +
      '#scr-party .tp-rules{max-height:90%}' +
    '}' +
    '@media (min-height:521px){#scr-party .tp-mid{display:contents}}' +

    /* ── THE MENU'S OWN FACE ── */
    '#scr-party .tp-menu .pt-lbl{color:#9EE7C4}' +
    '#scr-party .tp-menu .tp-hero{position:relative;display:flex;align-items:center;justify-content:center;' +
      'margin:2px 0 12px;padding:14px 8px;border-radius:16px;overflow:hidden;' +
      'background:radial-gradient(120% 130% at 50% 20%,#2A8149 0%,var(--tp-grass) 52%,var(--tp-grass2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.06),inset 0 -14px 26px rgba(0,0,0,.4)}' +
    '#scr-party .tp-menu .tp-hero svg{width:176px;height:176px;display:block}' +
    '#scr-party .tp-menu .tp-hero-cap{position:absolute;right:11px;bottom:8px;' +
      'font:900 9.5px/1 var(--disp);letter-spacing:.18em;color:rgba(255,255,255,.32)}' +
    '#scr-party .tp-note{font-size:11.5px;line-height:1.6;margin:8px 2px 0;padding:9px 11px;' +
      'border-radius:12px;text-transform:none;letter-spacing:0;color:#BFE8D4;' +
      'background:rgba(61,220,132,.10);border:1px solid rgba(61,220,132,.3)}' +

    /* ── the +/- stepper for player count ── */
    '#scr-party .tp-step{display:flex;align-items:center;justify-content:center;gap:14px;margin:6px 0 2px}' +
    '#scr-party .tp-rnd{width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.18);' +
      'background:rgba(255,255,255,.05);color:var(--txt);font:900 24px/1 var(--disp);cursor:pointer;' +
      'display:grid;place-items:center;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .tp-rnd:disabled{opacity:.3;cursor:default}' +
    '#scr-party .tp-step .v{font:900 30px/1 var(--disp);color:var(--tp-gold);min-width:120px;text-align:center;' +
      'display:flex;flex-direction:column;gap:2px}' +
    '#scr-party .tp-step .v i{font:700 10px/1 var(--disp);letter-spacing:.12em;text-transform:uppercase;' +
      'color:var(--dim);font-style:normal}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   THE VIEW TRANSFORM — whole quarter turns only, so the local seat's
   own mouth is at the BOTTOM of the canvas. rot counts 90° clockwise
   turns of the pitch. Which turn puts which wall at the bottom:
     rot 0 → the BOTTOM wall (edge 0)   rot 1 → the RIGHT wall (edge 3)
     rot 2 → the TOP wall (edge 1)      rot 3 → the LEFT wall (edge 2)
   so ROT_FOR_EDGE[edge] is the turn a seat on that wall wants. rot 1
   and 3 swap the pitch's width and height, which is exactly why the
   3–4 seat pitch is square.
   ═══════════════════════════════════════════════════════════════════ */
const ROT_FOR_EDGE = [0, 2, 3, 1];
function viewRot(){
  if (!M || !M.st) return 0;
  const me = firstLocalSeat();
  if (me < 0) return 0;
  return ROT_FOR_EDGE[me] || 0;
}
function toView(x, y){
  const g = UI.geom;
  switch (g.rot){
    case 1:  return [g.PH - y, x];
    case 2:  return [g.PW - x, g.PH - y];
    case 3:  return [y, g.PW - x];
    default: return [x, y];
  }
}
function toPitch(vx, vy){
  const g = UI.geom;
  switch (g.rot){
    case 1:  return [vy, g.PH - vx];
    case 2:  return [g.PW - vx, g.PH - vy];
    case 3:  return [g.PW - vy, vx];
    default: return [vx, vy];
  }
}
/* pitch → canvas px */
function px(x, y){
  const g = UI.geom, v = toView(x, y);
  return [g.ox + v[0] * g.sc / 1000, g.oy + v[1] * g.sc / 1000];
}
/* canvas px → pitch */
function unpx(cx, cy){
  const g = UI.geom;
  return toPitch((cx - g.ox) * 1000 / g.sc, (cy - g.oy) * 1000 / g.sc);
}

/* ═══════════════════════════════════════════════════════════════════
   THE FRAME + THE PITCH DOM
   ═══════════════════════════════════════════════════════════════════ */
function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: T('The Cap', 'It-Tapp'),
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'tp-rules', label:T('Rules', 'Regoli'), icon:'book',    cls:'ghost' },
      { id:'tp-new',   label:T('New', 'Ġdida'),    icon:'refresh', cls:'ghost' }
    ]
  });
  /* we size the canvas ourselves from the box, so the shared auto-fit
     must stop dead — exactly as js/aqleb-ui.js does the line after
     frame() returns. */
  if (M.ctx.stopFit) M.ctx.stopFit();
  const anyAI = () => { for (let i=0;i<seatCount();i++) if (ownerOf(i)==='ai') return i; return -1; };
  const ai = anyAI();
  /* WHO you are playing beats HOW the bytes arrive. A machine at the table
     is named by its difficulty even when a net object is attached — which
     is what a Story level is, and what an offline table with a stubbed net
     is. Checking M.net first made every one of those read "Online", true of
     the plumbing and meaningless to the player. Same fix as sqaq, kelma and
     il-forka carry. */
  M.ctx.badge.textContent = ai >= 0 ? levelName(seatLvl(ai))
    : M.net ? T('Online', 'Onlajn')
    : T('Pass & play', 'Għaddi u lgħab');
  buildBoard();
  M.ctx.btn('tp-rules').onclick = () => setRules(!rulesOpen);
  const nb = M.ctx.btn('tp-new');
  if (nb) nb.onclick = () => {
    if (M.net) return;
    P.ui.confirm(M.ctx, {
      head: T('Start a fresh match?', 'Tibda logħba ġdida?'),
      why:  T('The caps go back in the bag and you set a new table up.',
              'It-tappijiet jerġgħu lura fil-borża u tibda oħra.'),
      yes:  T('New match', 'Logħba ġdida'),
      no:   T('No, carry on', 'Le, kompli'),
      go: () => setupSheet()
    });
  };
  paintRules();
}

function buildBoard(){
  const ctx = M.ctx;
  ctx.host.classList.add('tp-host');
  ctx.host.innerHTML =
    '<div class="tp-wrap" id="tp-wrap">' +
      '<div class="tp-seats" id="tp-seats"></div>' +
      '<div class="tp-mid">' +
        '<div class="tp-boardbox" id="tp-boardbox">' +
          '<canvas class="tp-canv" id="tp-canv" role="img" aria-label="' +
            esc(T('The It-Tapp pitch', 'Il-grawnd ta’ It-Tapp')) + '"></canvas>' +
        '</div>' +
        '<div class="tp-say" id="tp-say"></div>' +
      '</div>' +
      '<div class="tp-rules" id="tp-rulespanel" aria-hidden="true">' +
        '<div class="tp-rules-h"><h4 id="tp-rules-t"></h4>' +
          '<button class="tp-rules-x" id="tp-rules-x" aria-label="' +
            esc(T('Put the rules away', 'Warrab ir-regoli')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button></div>' +
        '<div class="tp-rules-b" id="tp-rules-b"></div>' +
      '</div>' +
    '</div>';
  const root = ctx.host.querySelector('#tp-wrap');
  UI = {
    ctx, root,
    seats:    root.querySelector('#tp-seats'),
    boardbox: root.querySelector('#tp-boardbox'),
    canv:     root.querySelector('#tp-canv'),
    say:      root.querySelector('#tp-say'),
    rules:    root.querySelector('#tp-rulespanel'),
    cx: null, geom: null, dpr: 1
  };
  UI.cx = UI.canv.getContext('2d');
  root.querySelector('#tp-rules-x').addEventListener('click', () => setRules(false));
  ctx.root.addEventListener('pointerdown', e => {
    if (!rulesOpen || !UI || !UI.rules) return;
    const rb = ctx.btn && ctx.btn('tp-rules');
    if (!UI.rules.contains(e.target) && !(rb && rb.contains(e.target))) setRules(false);
  }, true);

  UI.canv.addEventListener('pointerdown', onPointerDown);
  UI.canv.addEventListener('pointermove', onPointerMove);
  UI.canv.addEventListener('pointerup', onPointerUp);
  UI.canv.addEventListener('pointercancel', onPointerCancel);
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
  draw();
}

/* the pitch is the biggest rectangle of its own aspect that fits the box */
function sizeBoard(){
  if (!UI || !UI.boardbox || !UI.boardbox.isConnected || !M || !M.st) return;
  const bw = UI.boardbox.clientWidth, bh = UI.boardbox.clientHeight;
  if (!bw || !bh) return;
  const PW = M.st.W, PH = M.st.H;
  const rot = viewRot();
  const VW = (rot === 1 || rot === 3) ? PH : PW;
  const VH = (rot === 1 || rot === 3) ? PW : PH;
  /* sc is "canvas px per 1000 pitch subunits", kept integral-ish so the
     drawing stays crisp; the canvas is exactly the pitch rectangle. */
  const sc = Math.min(bw * 1000 / VW, bh * 1000 / VH);
  const wpx = Math.max(160, Math.floor(VW * sc / 1000));
  const hpx = Math.max(160, Math.floor(VH * sc / 1000));
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  UI.dpr = dpr;
  UI.canv.style.width  = wpx + 'px';
  UI.canv.style.height = hpx + 'px';
  UI.canv.width  = Math.floor(wpx * dpr);
  UI.canv.height = Math.floor(hpx * dpr);
  UI.geom = { PW, PH, rot, VW, VH, sc, ox:0, oy:0, w:wpx, h:hpx };
  draw();
}

/* ═══════════════════════════════════════════════════════════════════
   THE SLINGSHOT — tap a cap of yours, drag BACKWARDS, let go. The cap
   fires along the opposite line, hard as you pulled. Drag back to
   nearly nothing and the shot is cancelled. Pool cue, not a swipe.
   ═══════════════════════════════════════════════════════════════════ */
const PULL_MAX = 2600;             /* pitch subunits of pull = full power */
const PULL_MIN = 260;              /* below this, no shot                 */
const GRAB_R   = 1.9;              /* how forgiving picking a cap up is   */

function canAct(){
  return !!(M && !M.dead && !E.over(M.st) && !M.anim && isLocal(E.turn(M.st)));
}
function localPoint(e){
  const rect = UI.canv.getBoundingClientRect();
  return unpx(e.clientX - rect.left, e.clientY - rect.top);
}
function onPointerDown(e){
  if (!UI || !UI.geom || !canAct()) return;
  const seat = E.turn(M.st);
  const p = localPoint(e);
  let bestK = -1, bestD = E.CAP_R * GRAB_R;
  for (let k = 0; k < M.st.per; k++){
    const c = E.capOf(M.st, seat, k);
    const d = E.dist(c.x, c.y, p[0], p[1]);
    if (d <= bestD){ bestD = d; bestK = k; }
  }
  if (bestK < 0) return;
  try { UI.canv.setPointerCapture(e.pointerId); } catch(err){}
  const c = E.capOf(M.st, seat, bestK);
  M.drag = { id:e.pointerId, k:bestK, cx:c.x, cy:c.y, px:p[0], py:p[1], pow:0, ang:0 };
  cue('ui.tap', { gain:0.7 }, true);
  updateDrag(p[0], p[1]);
  e.preventDefault();
}
function updateDrag(x, y){
  const d = M.drag; if (!d) return;
  d.px = x; d.py = y;
  const dx = x - d.cx, dy = y - d.cy;
  const len = E.dist(0, 0, dx, dy);
  if (len < PULL_MIN){ d.pow = 0; return; }
  const cl = Math.min(PULL_MAX, len);
  d.pow = Math.max(E.POW_MIN, Math.min(E.POW_MAX,
            Math.round((cl - PULL_MIN) * (E.POW_MAX - E.POW_MIN) / (PULL_MAX - PULL_MIN)) + E.POW_MIN));
  d.ang = E.angleOf(-dx, -dy);          /* fire OPPOSITE the pull         */
}
function onPointerMove(e){
  if (!M || !M.drag || e.pointerId !== M.drag.id) return;
  const p = localPoint(e);
  updateDrag(p[0], p[1]);
  draw();
  e.preventDefault();
}
function onPointerUp(e){
  if (!M || !M.drag || e.pointerId !== M.drag.id) return;
  const d = M.drag;
  M.drag = null;
  try { UI.canv.releasePointerCapture(e.pointerId); } catch(err){}
  if (!d.pow){ cue('ui.back', { gain:0.6 }); draw(); return; }
  const seat = E.turn(M.st);
  commitFlick(seat, { t:'flick', k:d.k, a:d.ang, p:d.pow }, 'local');
  e.preventDefault();
}
function onPointerCancel(){ if (M){ M.drag = null; draw(); } }

/* the one place a flick is issued, for ANY owner (thumb, machine, or a
   wire move). The engine settles the table synchronously; the film it
   hands back is played afterwards, purely as a picture. */
function commitFlick(seat, mv, src){
  if (!M || M.dead) return false;
  if (!E.check(M.st, mv, seat)){ cue('move.illegal', { gain:0.7 }); return false; }
  const res = doMove(seat, mv, src);
  if (!res.ok) return false;
  cue('piece.slide', { gain:0.9 }, true);
  const film = M.st.last && M.st.last.frames;
  if (reduced() || !film || film.length < 2 || !UI || !UI.geom){
    draw(); afterMove(); return true;
  }
  playFilm(film, M.st.last.goal, () => { draw(); afterMove(); });
  return true;
}

/* ═══════════════════════════════════════════════════════════════════
   THE FILM — the engine already settled the table; this only PLAYS the
   frames it recorded, one engine tick per screen frame. Nothing here
   can change the outcome, which is exactly the point: a wire move that
   lands mid-film is applied instantly and simply starts a new film.
   ═══════════════════════════════════════════════════════════════════ */
const TICK_MS = 16;
function cancelRaf(){ if (M && M.raf){ cancelAnimationFrame(M.raf); M.raf = 0; } }

function playFilm(frames, goal, done){
  cancelRaf();
  M.anim = { frames, i:0, goal, done, t0: performance.now(), lastDx:0, lastDy:0 };
  const last = frames.length - 1;
  function step(now){
    if (!M || M.dead){ return; }
    const a = M.anim;
    if (!a){ return; }
    let i = Math.floor((now - a.t0) / TICK_MS);
    if (i < 0) i = 0;
    if (i > last) i = last;
    /* a click when the ball turns sharply — a wall or a cap */
    if (i > 0 && i !== a.i){
      const f = frames[i], p = frames[i - 1];
      const dx = f[0] - p[0], dy = f[1] - p[1];
      if ((dx || dy) && (a.lastDx || a.lastDy)){
        const dot = dx * a.lastDx + dy * a.lastDy;
        if (dot < 0) cue('dama.place', { gain:0.45 });
      }
      a.lastDx = dx; a.lastDy = dy;
    }
    a.i = i;
    draw();
    if (i >= last){
      M.anim = null; M.raf = 0;
      if (goal){
        cue('call.bell', { gain:0.95 }, true);
        paintSeats();                 /* the score must jump WITH the card */
        M.goalFlash = performance.now();
        flashGoal(() => { if (done) done(); });
      } else if (done) done();
      return;
    }
    M.raf = requestAnimationFrame(step);
  }
  M.raf = requestAnimationFrame(step);
}
/* the GOAL card: 900 ms over the reset pitch, then on with the game */
function flashGoal(done){
  const start = performance.now();
  function loop(now){
    if (!M || M.dead) return;
    M.goalFlash = start;
    draw();
    if (now - start > 900){ M.goalFlash = 0; M.raf = 0; draw(); if (done) done(); return; }
    M.raf = requestAnimationFrame(loop);
  }
  M.raf = requestAnimationFrame(loop);
}

/* where every body is RIGHT NOW: mid-film that is the film's frame,
   otherwise the settled state itself */
function bodies(){
  if (M.anim && M.anim.frames && M.anim.frames[M.anim.i]){
    const f = M.anim.frames[M.anim.i];
    return { bx:f[0], by:f[1], cap:i => [f[2 + i*2], f[3 + i*2]] };
  }
  return { bx:M.st.ball.x, by:M.st.ball.y, cap:i => [M.st.caps[i].x, M.st.caps[i].y] };
}

/* ═══════════════════════════════════════════════════════════════════
   DRAWING
   ═══════════════════════════════════════════════════════════════════ */
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
const S = u => UI.geom.sc * u / 1000;         /* pitch subunits → canvas px */

function draw(){
  if (!UI || !UI.cx || !UI.geom || !M || !M.st) return;
  const cx = UI.cx, g = UI.geom, st = M.st, dpr = UI.dpr;
  cx.save();
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx.clearRect(0, 0, g.w, g.h);

  /* the grass */
  const grad = cx.createLinearGradient(0, 0, 0, g.h);
  grad.addColorStop(0, '#2A8149');
  grad.addColorStop(0.5, '#1D6B3A');
  grad.addColorStop(1, '#12522B');
  cx.fillStyle = grad;
  roundRect(cx, 0, 0, g.w, g.h, 12); cx.fill();

  /* mown stripes, along the view's long axis */
  cx.save();
  roundRect(cx, 0, 0, g.w, g.h, 12); cx.clip();
  cx.fillStyle = 'rgba(255,255,255,.035)';
  const bands = 10, bw = g.h / bands;
  for (let i = 0; i < bands; i += 2) cx.fillRect(0, i * bw, g.w, bw);
  cx.restore();

  drawMarkings(cx, g, st);
  drawGoals(cx, g, st);

  const B = bodies();

  /* the caps */
  const turnSeat = E.turn(st);
  const live = !E.over(st) && !M.anim;
  for (let i = 0; i < st.caps.length; i++){
    const p = B.cap(i), seat = st.caps[i].s;
    const mineNow = live && seat === turnSeat && isLocal(seat);
    const picked = !!(M.drag && M.drag.k === (i % st.per) && seat === turnSeat && M.drag.cx != null);
    drawCap(cx, p[0], p[1], seat, (i % st.per) + 1, mineNow, picked);
  }
  /* the ball */
  drawBall(cx, B.bx, B.by);

  /* the slingshot */
  if (M.drag) drawSling(cx);

  /* the GOAL card */
  if (M.goalFlash) drawGoalCard(cx, g);

  cx.restore();
  paintSay();
}

function drawMarkings(cx, g, st){
  cx.strokeStyle = 'rgba(255,255,255,.28)';
  cx.lineWidth = Math.max(1, S(28));
  /* the touchline, inset a hair so it is not clipped by the corner */
  const m = S(40);
  roundRect(cx, m, m, g.w - m*2, g.h - m*2, 10); cx.stroke();
  /* the centre spot and circle */
  const c = px(st.W / 2, st.H / 2);
  cx.beginPath(); cx.arc(c[0], c[1], S(900), 0, Math.PI*2); cx.stroke();
  cx.beginPath(); cx.arc(c[0], c[1], Math.max(1.5, S(60)), 0, Math.PI*2);
  cx.fillStyle = 'rgba(255,255,255,.4)'; cx.fill();
  /* the halfway line, across the view's short axis */
  cx.beginPath();
  if (g.rot === 1 || g.rot === 3){ cx.moveTo(g.w/2, m); cx.lineTo(g.w/2, g.h - m); }
  else                           { cx.moveTo(m, g.h/2); cx.lineTo(g.w - m, g.h/2); }
  cx.stroke();
}

/* every wall that HAS a mouth gets it painted in the colour of the seat
   who has to defend it, so nobody has to be told which end is theirs */
function drawGoals(cx, g, st){
  for (let e = 0; e < st.seats; e++){
    const col = capColour(e);
    const half = E.GOAL_W / 2;
    let a, b;
    if (e === 0){ a = px(st.W/2 - half, st.H); b = px(st.W/2 + half, st.H); }
    else if (e === 1){ a = px(st.W/2 - half, 0); b = px(st.W/2 + half, 0); }
    else if (e === 2){ a = px(0, st.H/2 - half); b = px(0, st.H/2 + half); }
    else { a = px(st.W, st.H/2 - half); b = px(st.W, st.H/2 + half); }
    /* the mouth itself: a thick bar of the defender's colour */
    cx.save();
    cx.lineCap = 'round';
    cx.strokeStyle = 'rgba(0,0,0,.45)';
    cx.lineWidth = Math.max(5, S(190));
    cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke();
    cx.strokeStyle = col.hex;
    cx.lineWidth = Math.max(3, S(120));
    cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke();
    /* the net, hatched just inside the mouth */
    cx.globalAlpha = 0.35;
    cx.strokeStyle = '#FFFFFF';
    cx.lineWidth = 1;
    const steps = 6;
    for (let i = 0; i <= steps; i++){
      const t = i / steps;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      const nx = (b[1] - a[1]), ny = -(b[0] - a[0]);
      const nl = Math.sqrt(nx*nx + ny*ny) || 1;
      const inw = S(240);
      /* push INTO the pitch: towards the centre of the canvas */
      const dir = ((UI.geom.w/2 - x) * nx + (UI.geom.h/2 - y) * ny) >= 0 ? 1 : -1;
      cx.beginPath(); cx.moveTo(x, y);
      cx.lineTo(x + dir * nx / nl * inw, y + dir * ny / nl * inw);
      cx.stroke();
    }
    cx.restore();
  }
}

function drawCap(cx, x, y, seat, num, canFlick, picked){
  const col = capColour(seat), p = px(x, y), r = S(E.CAP_R);
  cx.save();
  /* the shadow it casts on the grass */
  cx.beginPath(); cx.arc(p[0] + r*0.10, p[1] + r*0.16, r, 0, Math.PI*2);
  cx.fillStyle = 'rgba(0,0,0,.30)'; cx.fill();
  /* the crimped skirt of a bottle top */
  cx.beginPath(); cx.arc(p[0], p[1], r, 0, Math.PI*2);
  const gr = cx.createRadialGradient(p[0] - r*0.32, p[1] - r*0.36, r*0.12, p[0], p[1], r);
  gr.addColorStop(0, col.hi); gr.addColorStop(0.58, col.hex); gr.addColorStop(1, col.lo);
  cx.fillStyle = gr; cx.fill();
  cx.lineWidth = Math.max(1, r*0.10); cx.strokeStyle = 'rgba(0,0,0,.45)'; cx.stroke();
  /* the flat disc on top */
  cx.beginPath(); cx.arc(p[0], p[1], r*0.66, 0, Math.PI*2);
  cx.fillStyle = 'rgba(0,0,0,.16)'; cx.fill();
  /* the number */
  if (r > 8){
    cx.fillStyle = 'rgba(255,255,255,.92)';
    cx.font = '900 ' + Math.max(7, Math.round(r*0.82)) + 'px ' +
      (getComputedStyle(document.body).getPropertyValue('--disp') || 'sans-serif');
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(String(num), p[0], p[1] + r*0.04);
  }
  /* the ones you may flick get a soft ring; the one in your fingers a
     bright one */
  if (picked || canFlick){
    cx.beginPath(); cx.arc(p[0], p[1], r * (picked ? 1.30 : 1.16), 0, Math.PI*2);
    cx.strokeStyle = picked ? '#FFFFFF' : 'rgba(255,255,255,.45)';
    cx.lineWidth = Math.max(1.4, r * (picked ? 0.16 : 0.09));
    cx.stroke();
  }
  cx.restore();
}

function drawBall(cx, x, y){
  const p = px(x, y), r = S(E.BALL_R);
  cx.save();
  cx.beginPath(); cx.arc(p[0] + r*0.10, p[1] + r*0.18, r, 0, Math.PI*2);
  cx.fillStyle = 'rgba(0,0,0,.32)'; cx.fill();
  const gr = cx.createRadialGradient(p[0] - r*0.34, p[1] - r*0.38, r*0.1, p[0], p[1], r);
  gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.6, '#E9EEF2'); gr.addColorStop(1, '#9AA7B0');
  cx.beginPath(); cx.arc(p[0], p[1], r, 0, Math.PI*2);
  cx.fillStyle = gr; cx.fill();
  cx.lineWidth = Math.max(1, r*0.12); cx.strokeStyle = 'rgba(0,0,0,.42)'; cx.stroke();
  if (r > 5){
    cx.beginPath(); cx.arc(p[0], p[1], r*0.34, 0, Math.PI*2);
    cx.fillStyle = 'rgba(20,26,32,.85)'; cx.fill();
  }
  cx.restore();
}

/* the aim: the elastic behind the cap, the line it will run along, an
   arrow head, and a power bar that fills as you pull */
function drawSling(cx){
  const d = M.drag; if (!d) return;
  const cP = px(d.cx, d.cy), fP = px(d.px, d.py);
  const r = S(E.CAP_R);
  cx.save();
  /* the elastic you are pulling */
  cx.setLineDash([Math.max(2, r*0.35), Math.max(2, r*0.30)]);
  cx.strokeStyle = 'rgba(255,255,255,.45)';
  cx.lineWidth = Math.max(1.2, r*0.14);
  cx.beginPath(); cx.moveTo(cP[0], cP[1]); cx.lineTo(fP[0], fP[1]); cx.stroke();
  cx.setLineDash([]);
  if (!d.pow){
    cx.fillStyle = 'rgba(255,255,255,.6)';
    cx.font = '900 ' + Math.max(9, Math.round(r*0.7)) + 'px sans-serif';
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText('×', fP[0], fP[1]);
    cx.restore(); return;
  }
  /* the line the cap will actually run — in PITCH space, then mapped,
     so it is exactly the direction the engine will be given */
  const reach = 900 + (d.pow - E.POW_MIN) * 90;
  const tx = d.cx + E.dirX(d.ang) * reach / E.DIR_U;
  const ty = d.cy + E.dirY(d.ang) * reach / E.DIR_U;
  const tP = px(tx, ty);
  const t = (d.pow - E.POW_MIN) / (E.POW_MAX - E.POW_MIN);
  const col = t > 0.72 ? '#FF7A5A' : t > 0.4 ? '#FFC542' : '#8FE3B0';
  cx.strokeStyle = col;
  cx.lineWidth = Math.max(1.6, r*0.20);
  cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(cP[0], cP[1]); cx.lineTo(tP[0], tP[1]); cx.stroke();
  /* the head */
  const ax = tP[0] - cP[0], ay = tP[1] - cP[1];
  const al = Math.sqrt(ax*ax + ay*ay) || 1;
  const ux = ax/al, uy = ay/al, hs = Math.max(4, r*0.75);
  cx.beginPath();
  cx.moveTo(tP[0], tP[1]);
  cx.lineTo(tP[0] - ux*hs - uy*hs*0.55, tP[1] - uy*hs + ux*hs*0.55);
  cx.lineTo(tP[0] - ux*hs + uy*hs*0.55, tP[1] - uy*hs - ux*hs*0.55);
  cx.closePath(); cx.fillStyle = col; cx.fill();
  /* the power ring around the cap */
  cx.beginPath();
  cx.arc(cP[0], cP[1], r*1.5, -Math.PI/2, -Math.PI/2 + Math.PI*2*t);
  cx.strokeStyle = col; cx.lineWidth = Math.max(2, r*0.24); cx.stroke();
  cx.restore();
}

function drawGoalCard(cx, g){
  const t = Math.min(1, (performance.now() - M.goalFlash) / 900);
  const a = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
  cx.save();
  cx.globalAlpha = Math.max(0, Math.min(1, a));
  cx.fillStyle = 'rgba(0,0,0,.42)';
  roundRect(cx, 0, 0, g.w, g.h, 12); cx.fill();
  const who = M.st.last && M.st.last.goal ? M.st.last.goal.scorer : -1;
  cx.fillStyle = who >= 0 ? capColour(who).hex : '#FFFFFF';
  cx.font = '900 ' + Math.round(Math.min(g.w, g.h) * 0.16) + 'px sans-serif';
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText(T('GOAL!', 'GOL!'), g.w/2, g.h/2);
  if (who >= 0){
    cx.font = '900 ' + Math.round(Math.min(g.w, g.h) * 0.055) + 'px sans-serif';
    cx.fillStyle = 'rgba(255,255,255,.9)';
    cx.fillText(seatName(who).toUpperCase(), g.w/2, g.h/2 + Math.min(g.w, g.h) * 0.13);
  }
  cx.restore();
}

/* ═══════════════════════════════════════════════════════════════════
   THE CHROME — the seat chips and the status line.
   ═══════════════════════════════════════════════════════════════════ */
function paintSeats(){
  if (!UI || !UI.seats || !M) return;
  const st = M.st, turn = E.turn(st), over = E.over(st);
  const score = E.counts(st);
  let html = '';
  for (let i = 0; i < seatCount(); i++){
    const on = (i === turn && !over) ? ' on' : '';
    const col = capColour(i);
    html += '<div class="tp-seat' + on + '">' +
      '<span class="sw" style="background:radial-gradient(circle at 35% 30%,' + col.hi + ',' + col.hex + ' 60%,' + col.lo + ')"></span>' +
      '<span class="col"><span class="n">' + esc(seatName(i)) + '</span></span>' +
      '<span class="h">' + (score[i] | 0) + '</span>' +
    '</div>';
  }
  UI.seats.innerHTML = html;
}

function paintSay(){
  if (!UI || !UI.say || !M) return;
  const st = M.st, over = E.over(st);
  let html;
  if (over){
    const w = over.winner;
    const dot = '<span class="dot" style="background:' + capColour(w).hex + '"></span>';
    const who = isLocal(w) ? T('You win!', 'Rbaħt int!') : esc(seatName(w)) + ' ' + T('wins', 'jirbaħ');
    html = dot + '<b>' + who + '</b> — ' + esc(over.score.join(' – '));
  } else if (M.anim){
    html = T('…', '…');
  } else {
    const turn = E.turn(st);
    const dot = '<span class="dot" style="background:' + capColour(turn).hex + '"></span>';
    const mine = isLocal(turn);
    const who = mine ? T('Your flick — drag back off a cap', 'Il-botta tiegħek — iġbed lura minn tapp')
      : ownerOf(turn) === 'ai' ? levelName(seatLvl(turn)) + ' ' + T('is lining it up', 'qed jillinja')
      : esc(seatName(turn)) + ' ' + T('to flick', 'jagħti l-botta');
    html = dot + (mine ? '<b>' + who + '</b>' : who);
  }
  UI.say.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════════════
   AFTER A MOVE — voice the chips, check for the end, else let the
   machine line its shot up.
   ═══════════════════════════════════════════════════════════════════ */
function afterMove(){
  if (!M || M.dead) return;
  paintSeats();
  draw();
  if (E.over(M.st)){ finish(); return; }
  maybeThink();
  driveGone();
}

/* ── A CHAIR THE RELAY FREED MID-MATCH ───────────────────────────────
   Without this the turn parks on the empty chair for ever. The engine's
   think() is PURE (state + level; the one Math.random in tapp.js lives
   in newSeed, never in play), so every remaining phone computes the
   SAME flick for the empty chair locally, with nothing on the wire.
   Level 1 — fixed, not the seat's — so no phone can disagree about it. */
function driveGone(){
  if (!M || M.dead || !M.net || !M.gone || M.goneT) return;
  if (E.over(M.st)) return;
  if (M.anim) return;
  const s = E.turn(M.st);
  if (!M.gone[s]) return;
  M.goneT = setTimeout(() => {
    if (M) M.goneT = 0;
    if (!M || M.dead || M.anim || E.over(M.st)) return;
    const s2 = E.turn(M.st);
    if (!M.gone[s2]) return;
    const mv = E.think(M.st, s2, 1);
    if (!mv){ draw(); return; }
    commitFlick(s2, mv, 'net');
  }, reduced() ? 80 : 520);
}

function maybeThink(){
  if (!M || M.dead || M.timer || M.anim) return;
  const st = M.st;
  if (E.over(st)) return;
  const seat = E.turn(st);
  if (ownerOf(seat) !== 'ai') return;
  if (M.net && !M.net.iAmHost) return;    /* online: only the host drives bots */
  const delay = reduced() ? 60 : 520;
  M.timer = setTimeout(() => {
    M.timer = 0;
    if (!M || M.dead || M.anim){ if (M) maybeThink(); return; }
    const st2 = M.st;
    if (E.over(st2) || ownerOf(E.turn(st2)) !== 'ai'){ draw(); return; }
    const s2 = E.turn(st2);
    const mv = E.think(st2, s2, seatLvl(s2));
    if (!mv){ draw(); return; }
    commitFlick(s2, mv, 'local');
  }, delay);
}

function firstLocalSeat(){
  for (let i = 0; i < seatCount(); i++) if (isLocal(i)) return i;
  return -1;
}

function leave(){
  stopThinking();
  cancelRaf();
  if (M && M.goneT){ clearTimeout(M.goneT); M.goneT = 0; }
  if (UI && UI._ro){ try { UI._ro.disconnect(); } catch(e){} }
  if (UI && UI._onResize){ try { window.removeEventListener('resize', UI._onResize); } catch(e){} }
  if (M){ autosave(); persistNow(); M.dead = true; M.anim = null; M.drag = null; }
  M = null; UI = null;
}

/* ═══════════════════════════════════════════════════════════════════
   THE END — into the shared AAA winner screen (js/rebbieh.js). One row
   per seat, ranked by goals.

   `forced` is the sole-win path only: a verdict the engine cannot reach
   ({winners:[me], sole:true, score:E.counts(st)}) because the other
   chair of a 1v1 walked out rather than losing on the pitch.
   ═══════════════════════════════════════════════════════════════════ */
function finish(forced){
  if (!M || M.finished) return;
  M.finished = true;
  stopThinking();
  cancelRaf();
  const st = M.st;
  const ov = forced || E.over(st);
  if (!ov) return;
  cue('game.win', { gain: 0.95 }, true);

  const me = firstLocalSeat();
  const iWon = me >= 0 && ov.winners.indexOf(me) >= 0;
  if (!M.net && !M.recorded){
    M.recorded = true;
    if (iWon) ST.rec.w++;
    else if (me >= 0) ST.rec.l++;
    persist();
  }
  saveSlot(null);

  const score = ov.score || ov.counts || E.counts(st);
  const order = [];
  for (let i = 0; i < seatCount(); i++) order.push(i);
  order.sort((a, b) => score[b] - score[a] || a - b);
  let place = 0, lastN = null;
  const rows = order.map((seat, i) => {
    if (lastN === null || score[seat] < lastN){ place = i + 1; lastN = score[seat]; }
    const isMe = isLocal(seat);
    return {
      name: isMe ? T('You', 'Int')
        : ownerOf(seat) === 'ai' ? levelName(seatLvl(seat))
        : seatName(seat),
      place,
      you: isMe,
      bot: ownerOf(seat) === 'ai',
      score: score[seat] + ' ' + T('goals', 'gowls'),
      border: capColour(seat).border
    };
  });

  const net = M.net;
  const title = (ov.sole && iWon) ? T('They walked off — you win', 'Telaq — ir-rebħa tiegħek')
    : iWon ? T('You take it!', 'Ħadtha int!')
    : (me >= 0) ? T('Beaten', 'Mirbuħ')
    : capName(ov.winner) + ' ' + T('wins', 'jirbaħ');

  const show = window.KARTI_REBBIEH && window.KARTI_REBBIEH.show;
  if (!show){
    P.ui.result(M.ctx, {
      tone: iWon ? 'win' : 'lose',
      head: title,
      why:  T('First to ' + st.target + ' goals takes the table.',
              'L-ewwel wieħed li jasal ' + st.target + ' gowls jieħu l-mejda.'),
      buttons: [
        { label:T('Play again', 'Erġa\' lgħab'), icon:'refresh', cls:'primary',
          go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else setupSheet(); } },
        { label:T('Leave', 'Oħroġ'), icon:'back', cls:'ghost',
          go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }
      ]
    });
    return;
  }
  /* ── THE PAY, exactly once, under the match id ────────────────────
     The podium path never calls P.ui.result, so the wrap progress.js
     hangs on it never fires: the podium pays for itself through
     KARTI_XP.awardPlay — idempotent under the match id, so a re-render
     or a double-fired finish pays once — and a staked pot settles
     through mp.js's own idempotent door. KARTI_PARTY.record is NOT
     called here: calling both pays twice, and neither shows an error. */
  const MPX = window.KARTI_MP;
  const staked = !!(net && MPX && MPX.MP && MPX.MP.stakeLive);
  const mid = 'tapp:' + (net && MPX && MPX.MP && MPX.MP.code ? MPX.MP.code : 'local') +
              ':' + (M.seed >>> 0);
  let pay = null;
  if (me >= 0 && window.KARTI_XP && KARTI_XP.awardPlay){
    try {
      const r = KARTI_XP.awardPlay({
        game:'tapp', won: iWon, draw: false, id: mid, ranked: staked
      });
      if (r && r.counted) pay = r;
    } catch(e){}
  }
  try {
    if (me >= 0 && window.KARTI_STATS && KARTI_STATS.record)
      KARTI_STATS.record('tapp', { result: iWon ? 'win' : 'loss', id: mid });
  } catch(e){}
  let potRes = null;
  if (staked && me >= 0){
    try {
      potRes = (ov.winners.length > 1 && MPX.stakeSettleTeam)
        ? MPX.stakeSettleTeam('win', ov.winners, me)
        : (MPX.stakeSettle ? MPX.stakeSettle(iWon ? 'win' : 'lose') : null);
    } catch(e){}
  }
  if (!potRes && iWon && M.solePot){ potRes = M.solePot; M.solePot = null; }

  show({
    title,
    subtitle: T('Full time', 'Ħin kollu'),
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

/* ═══════════════════════════════════════════════════════════════════
   THE RULES CARD — one game, told once, both languages.
   ═══════════════════════════════════════════════════════════════════ */
function rulesFor(){
  return [
    T('Everyone gets a set of bottle caps of their colour, and there is <b>one ball</b>. ' +
      'Two to four play; one flick each, strictly in turn.',
      'Kulħadd għandu sett tappijiet tal-lewn tiegħu, u hemm <b>ballun wieħed</b>. ' +
      'Tnejn sa erbgħa jilagħbu; botta waħda kull wieħed, bir-rotazzjoni.'),
    T('To flick: <b>tap one of your caps and drag BACKWARDS</b>, away from where you want it to ' +
      'go, then let go. The further you pull, the harder it goes. Pull back to nothing to change ' +
      'your mind.',
      'Biex tagħti botta: <b>mess tapp tiegħek u iġbed LURA</b>, ’il bogħod minn fejn trid tibgħatu, ' +
      'imbagħad itilqu. Aktar ma tiġbed, aktar tmur bis-saħħa. Iġbed lura kollox biex tibdel fehmtek.'),
    T('It is <b>billiards</b>, not football: caps knock caps, and a good shot moves three of them. ' +
      'Everything slides, rubs down and stops — and only <b>then</b> does the turn pass.',
      'Hija <b>biljard</b>, mhux futbol: it-tappijiet iħabbtu ma’ xulxin, u botta tajba ċċaqlaq tlieta. ' +
      'Kollox jiżżerżaq, jieqaf bil-mod — u <b>mbagħad biss</b> jgħaddi t-turn.'),
    T('Put the ball through <b>somebody else\'s mouth</b> and you score. The mouths are painted in ' +
      'the colour of whoever has to defend them. <b>First to three goals</b> takes it.',
      'Daħħal il-ballun <b>fil-lasta ta’ ħaddieħor</b> u tiskorja. Il-lasti huma miżbugħa bil-lewn ' +
      'ta’ min irid jiddefendihom. <b>L-ewwel għal tliet gowls</b> jieħu kollox.'),
    T('An <b>own goal</b> hands the point to the other player when there are two of you; at a table ' +
      'of three or four it counts for nobody and everything simply resets.',
      '<b>Awtogol</b> jagħti l-punt lill-ieħor meta tkunu tnejn; fuq mejda ta’ tlieta jew erbgħa ma ' +
      'jgħodd għal ħadd u kollox jerġa’ lura f’postu.'),
    T('Caps never leave the pitch — the mouth is solid for them. Only the ball goes through.',
      'It-tappijiet qatt ma jħallu l-grawnd — il-lasta hi soda għalihom. Il-ballun biss jgħaddi.')
  ];
}
function paintRules(){
  if (!UI || !UI.rules) return;
  UI.rules.querySelector('#tp-rules-t').textContent =
    T('The Cap', 'It-Tapp') + ' — ' + T('the rules', 'ir-regoli');
  UI.rules.querySelector('#tp-rules-b').innerHTML =
    '<ul style="margin:0;padding:0">' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul>';
  UI.rules.classList.toggle('open', rulesOpen);
  UI.rules.setAttribute('aria-hidden', rulesOpen ? 'false' : 'true');
  const rb = M && M.ctx && M.ctx.btn && M.ctx.btn('tp-rules');
  if (rb) rb.setAttribute('aria-expanded', rulesOpen ? 'true' : 'false');
}
function setRules(open){
  rulesOpen = !!open;
  try { localStorage.setItem(UIKEY + '.rules', rulesOpen ? '1' : '0'); } catch(e){}
  cue(rulesOpen ? 'ui.sheet' : 'ui.back', { gain:0.8 });
  paintRules();
}

/* ═══════════════════════════════════════════════════════════════════
   THE ENTRY SCREEN — MINIMAL. PLAY ONLINE (top), PLAY WITH THE MACHINE,
   PASS THE PHONE, and "How to play". No settings on screen one.
   ═══════════════════════════════════════════════════════════════════ */
function heroSVG(){
  /* a cap mid-flick at the ball, with the slingshot line behind it */
  const w = 200, h = 200;
  let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<defs>' +
      '<radialGradient id="tph-g" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#FFE08A"/>' +
        '<stop offset="60%" stop-color="#FFC542"/><stop offset="100%" stop-color="#C89211"/></radialGradient>' +
      '<radialGradient id="tph-i" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#A7E0FF"/>' +
        '<stop offset="60%" stop-color="#4FB6FF"/><stop offset="100%" stop-color="#1E6FB8"/></radialGradient>' +
      '<radialGradient id="tph-b" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#FFFFFF"/>' +
        '<stop offset="65%" stop-color="#E9EEF2"/><stop offset="100%" stop-color="#9AA7B0"/></radialGradient>' +
    '</defs>' +
    '<rect x="4" y="4" width="192" height="192" rx="16" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="3"/>' +
    '<line x1="4" y1="100" x2="196" y2="100" stroke="rgba(255,255,255,.22)" stroke-width="3"/>' +
    '<circle cx="100" cy="100" r="34" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="3"/>' +
    /* the mouth at the top, in ice */
    '<line x1="72" y1="5" x2="128" y2="5" stroke="#4FB6FF" stroke-width="9" stroke-linecap="round"/>' +
    /* the aim line */
    '<line x1="66" y1="146" x2="100" y2="100" stroke="#FFC542" stroke-width="4" stroke-linecap="round" stroke-dasharray="9 7"/>' +
    /* the elastic behind */
    '<line x1="66" y1="146" x2="44" y2="176" stroke="rgba(255,255,255,.5)" stroke-width="3" stroke-linecap="round" stroke-dasharray="5 5"/>' +
    /* the caps */
    '<circle cx="66" cy="146" r="17" fill="url(#tph-g)" stroke="rgba(0,0,0,.4)" stroke-width="2"/>' +
    '<circle cx="140" cy="150" r="17" fill="url(#tph-g)" stroke="rgba(0,0,0,.4)" stroke-width="2"/>' +
    '<circle cx="72" cy="56" r="17" fill="url(#tph-i)" stroke="rgba(0,0,0,.4)" stroke-width="2"/>' +
    '<circle cx="134" cy="52" r="17" fill="url(#tph-i)" stroke="rgba(0,0,0,.4)" stroke-width="2"/>' +
    '<circle cx="100" cy="100" r="12" fill="url(#tph-b)" stroke="rgba(0,0,0,.4)" stroke-width="2"/>';
  return s + '</svg>';
}

function setupSheet(){
  injectCSS();
  P.show();
  stopThinking(); M = null; UI = null;
  const el = P.ui.screenEl();
  const online = canGoOnline();

  el.innerHTML =
    '<div class="pt-wrap tp-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="tp-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + esc(T('The Cap', 'It-Tapp')) + '</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="tp-hero" aria-hidden="true">' + heroSVG() +
        '<span class="tp-hero-cap">' + esc(T('FLICK &amp; SCORE', 'BOTTA U GOL')) + '</span></div>' +
      '<p class="blurb">' +
        T('Bottle caps on a pitch. Drag back off one of yours, let go, and watch it barge through ' +
          'the others into the ball. Two to four players, one flick each, first to three goals.',
          'Tappijiet fuq grawnd. Iġbed lura minn wieħed tiegħek, itilqu, u arah jgħaddi minn ' +
          'ġol-oħrajn għall-ballun. Tnejn sa erbgħa, botta kull wieħed, l-ewwel għal tliet gowls.') +
      '</p>' +

      (ST.save
        ? '<button class="btn primary" id="tp-res" style="margin:2px 0 12px">' +
          esc(T('Carry on the saved match', 'Kompli l-logħba mħażna')) + '</button>'
        : '') +

      '<div class="tp-modes" style="display:grid;gap:9px;margin-top:4px">' +
        (online
          ? '<button class="btn primary" id="tp-online">' + ico('users') + ' ' +
            esc(T('Play online', 'Ilgħab onlajn')) + '</button>'
          : '') +
        '<button class="btn' + (online ? ' ghost' : ' primary') + '" id="tp-ai">' +
          ico('coach') + ' ' + esc(T('Play with the machine', 'Ilgħab mal-magna')) + '</button>' +
        '<button class="btn ghost" id="tp-pnp">' + ico('users') + ' ' +
          esc(T('Pass the phone', 'Għaddi t-telefon')) + '</button>' +
        '<button class="btn ghost" id="tp-rulesbtn">' + ico('book') + ' ' +
          esc(T('How to play', 'Kif tilgħab')) + '</button>' +
      '</div>' +

      (ST.rec.w + ST.rec.l
        ? '<p class="pt-ledger" style="margin-top:14px">' +
          T('So far: <b>' + ST.rec.w + '</b> won, <b>' + ST.rec.l + '</b> lost.',
            'S’issa: <b>' + ST.rec.w + '</b> rebħin, <b>' + ST.rec.l + '</b> mitlufin.') +
          '</p>'
        : '') +
    '</div>' +

    '<div class="tp-rules" id="tp-menurules" aria-hidden="true">' +
      '<div class="tp-rules-h"><h4>' + esc(T('The Cap', 'It-Tapp')) + ' — ' +
        esc(T('the rules', 'ir-regoli')) + '</h4>' +
        '<button class="tp-rules-x" id="tp-menurules-x" aria-label="' + esc(T('Close', 'Agħlaq')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button></div>' +
      '<div class="tp-rules-b"><ul style="margin:0;padding:0">' +
        rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul></div>' +
    '</div>' +
    '</div>';

  el.querySelector('#tp-back').onclick = () => { cue('ui.back'); P.hub(); };
  const on = el.querySelector('#tp-online');
  if (on) on.onclick = () => { if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('tapp'); };
  el.querySelector('#tp-ai').onclick  = () => offlineSetup('ai');
  el.querySelector('#tp-pnp').onclick = () => offlineSetup('pnp');
  const rs = el.querySelector('#tp-res');
  if (rs) rs.onclick = () => { if (ST.save) newGame(null, ST.save); };

  const rules = el.querySelector('#tp-menurules');
  const openRules = o => {
    rules.classList.toggle('open', o);
    rules.setAttribute('aria-hidden', o ? 'false' : 'true');
    cue(o ? 'ui.sheet' : 'ui.back', { gain:0.8 });
  };
  el.querySelector('#tp-rulesbtn').onclick = () => openRules(!rules.classList.contains('open'));
  el.querySelector('#tp-menurules-x').onclick = () => openRules(false);

  if (window.KARTI_LANG && KARTI_LANG.onChange && !setupSheet._sub){
    setupSheet._sub = KARTI_LANG.onChange(() => {
      try { if (!M && el.isConnected && el.querySelector('#tp-ai')) setupSheet();
            else if (M && UI){ paintSeats(); draw(); paintRules(); } } catch(e){}
    });
  }
}

/* the ONE small step after PLAY WITH THE MACHINE / PASS THE PHONE */
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
    const per = E.capsPerSeat(seats);
    el.innerHTML =
      '<div class="pt-wrap tp-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="tp-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(mode === 'pnp' ? T('Pass the phone', 'Għaddi t-telefon')
                                    : T('Play the machine', 'Ilgħab mal-magna')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<div class="tp-hero" aria-hidden="true">' + heroSVG() +
          '<span class="tp-hero-cap">' + seats + ' &times; ' + per + '</span></div>' +

        '<div class="tiny pt-lbl">' + esc(T('How many at the pitch', 'Kemm fuq il-grawnd')) + '</div>' +
        '<div class="tp-step">' +
          '<button class="tp-rnd" id="tp-dn"' + (seats <= 2 ? ' disabled' : '') +
            ' aria-label="' + esc(T('Fewer players', 'Inqas plejers')) + '">&minus;</button>' +
          '<span class="v">' + seats + '<i>' + esc(T('players', 'plejers')) + '</i></span>' +
          '<button class="tp-rnd" id="tp-up"' + (seats >= 4 ? ' disabled' : '') +
            ' aria-label="' + esc(T('More players', 'Aktar plejers')) + '">+</button>' +
        '</div>' +
        '<p class="tp-note">' +
          esc(T(per + ' caps each, and one ball. ' +
                (seats <= 2 ? 'Mouths at the two ends.' : 'A square pitch with a mouth on every wall.'),
                per + ' tappijiet kull wieħed, u ballun wieħed. ' +
                (seats <= 2 ? 'Lasti fuq iż-żewġ truf.' : 'Grawnd kwadru b’lasta fuq kull ħajt.'))) +
        '</p>' +

        (mode === 'pnp'
          ? '<div class="tiny pt-lbl" style="margin-top:8px">' +
              esc(T('How many of them are people', 'Kemm minnhom huma nies')) + '</div>' +
            '<div class="tp-step">' +
              '<button class="tp-rnd" id="tp-hdn"' + (humans <= 2 ? ' disabled' : '') +
                ' aria-label="' + esc(T('Fewer people', 'Inqas nies')) + '">&minus;</button>' +
              '<span class="v">' + humans + '<i>' + esc(T('people', 'nies')) + '</i></span>' +
              '<button class="tp-rnd" id="tp-hup"' + (humans >= seats ? ' disabled' : '') +
                ' aria-label="' + esc(T('More people', 'Aktar nies')) + '">+</button>' +
            '</div>'
          : '<div class="tiny pt-lbl" style="margin-top:8px">' +
              esc(T('How sharp is the machine', 'Kemm hi taħraq il-magna')) + '</div>' +
            '<div class="pt-opts" id="tp-lvl">' + levels().map(o =>
              '<button class="pt-opt' + (o.level === lvl ? ' on' : '') + '" data-lvl="' + o.level + '">' +
              ico(o.icon || ('diff-' + Math.min(3, o.level))) +
              '<b>' + esc(o.name) + '</b><i>' + esc(TE(o.note)) + '</i></button>').join('') +
            '</div>') +

        '<div class="pt-acts" style="margin-top:18px;display:grid;gap:9px">' +
          '<button class="btn primary" id="tp-go">' +
            esc(mode === 'pnp'
              ? T('Start', 'Ibda')
              : T('Play — you vs ' + (seats - 1) + ' machine' + (seats - 1 === 1 ? '' : 's'),
                  'Ilgħab — int kontra ' + (seats - 1) + ' magn' + (seats - 1 === 1 ? 'a' : 'i'))) +
          '</button>' +
        '</div>' +
      '</div></div>';

    el.querySelector('#tp-back').onclick = () => { cue('ui.back'); setupSheet(); };
    el.querySelector('#tp-dn').onclick = () => { if (seats > 2){ seats--; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    el.querySelector('#tp-up').onclick = () => { if (seats < 4){ seats++; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    const hdn = el.querySelector('#tp-hdn'), hup = el.querySelector('#tp-hup');
    if (hdn) hdn.onclick = () => { if (humans > 2){ humans--; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    if (hup) hup.onclick = () => { if (humans < seats){ humans++; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { lvl = +b.dataset.lvl; cue('ui.tap', { gain:0.8 }, true); paint(); });
    el.querySelector('#tp-go').onclick = () => {
      pref({ seats, lvl, humans: mode === 'pnp' ? humans : 1 });
      newGame({ seats, humans: mode === 'pnp' ? humans : 1, lvl });
    };
  }
  paint();
}

function canGoOnline(){
  try {
    const MP = window.KARTI_MP;
    return !!(MP && MP.openFor && P.online && P.online.tapp);
  } catch(e){ return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   START A LOCAL MATCH. meta stamps who owns each seat.
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
   THE ONLINE CONTROLLER — KARTI_PARTY.online.tapp. js/mp.js is the only
   caller. IT-TAPP is turn based with nothing hidden, so this is a plain
   relay of three small numbers: start() puts the pitch on screen,
   remote(seat, move) applies a wire flick through the engine gate,
   note()/stop() are the two things the transport may say.
   ═══════════════════════════════════════════════════════════════════ */
const hooks = {
  /* js/mp.js subscribes with (move, { seat, src }) — the shape
     skarta/tankijiet hand it — while our own feed fires ONE
     {seat, move, index, src} event. Adapt here: without this adapter
     mp.js receives the whole event object as the move, toWire() finds
     no `t` on it, and the table is stopped with "a move would not fit
     on the wire" on the FIRST local flick. (js/aqleb-ui.js has the same
     three lines and the same scar.) Game seats and room seats are the
     same numbers for tapp, so no toRoom mapping. */
  onMove(fn){
    const f = ev => { if (ev) fn(ev.move, { seat: ev.seat, src: ev.src }); };
    moveSubs.push(f);
    return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); };
  },
  phase(){ return M ? 'play' : 'idle'; },
  apply(seat, move){ if (!M) return { ok:false, why:'no tapp' }; return onlineRemote(seat, move); },
  attachNet(net){ if (M){ M.net = net || null; maybeThink(); } },
  setOwner(i, own){ if (M && M.meta && M.meta[i]){ M.meta[i].own = own; } },
  setName(i, name){ if (M && M.meta && M.meta[i] && name){ M.meta[i].name = name; } },
  live(){ return !!(M && !M.dead && !E.over(M.st)); },
  seatBack(){ if (M){ paintSeats(); draw(); } },
  seatGone(seat){
    if (!M || M.dead || E.over(M.st)) return;
    seat = seat | 0;
    if (!M.st || seat < 0 || seat >= seatCount()) return;
    M.gone = M.gone || {};
    if (M.gone[seat]) return;
    M.gone[seat] = 1;
    if (M.meta && M.meta[seat]) M.meta[seat].own = 'net';
    driveGone();
  },
  /* THE 1v1 WALK-OUT IS A WIN — js/mp.js calls this only when the match
     BEGAN with exactly two seats and the OTHER one left for good, with
     the pot already settled there. finish()'s M.finished latch keeps
     the single id-guarded award to one firing. */
  soleWin(seat, pot){
    if (!M || M.dead || M.finished || !M.net || E.over(M.st)) return;
    const me = firstLocalSeat();
    if (me < 0) return;
    M.solePot = pot || null;
    finish({ kind:'over', score: E.counts(M.st), counts: E.counts(M.st),
             winners:[me], winner: me, draw: false, sole: true });
  }
};

function onlineStart(cfg){
  cfg = cfg || {};
  injectCSS();
  /* P.show() OR THE GUESTS NEVER SEE IT. Without this the board is
     built and the match runs while every non-host phone sits on the
     ready roster — invisible to any host-only test. */
  P.show();
  const seats = (cfg.seats && cfg.seats.length) || (cfg.opts && cfg.opts.seats) || 2;
  /* ALWAYS the relay's shared seed, coerced (>>>0 maps a missing seed
     to 0 on every phone alike) — never startMatch's per-client
     newSeed() fallback, or the kick-off scatter would differ. */
  startMatch({ seats: Math.max(2, Math.min(4, seats)), lvl: 2 }, cfg.seed >>> 0);
  const list = cfg.seats || [];
  M.meta = [];
  for (let i = 0; i < seatCount(); i++){
    const s = list[i] || {};
    /* READ THE SEAT'S KIND. A seat with kind:'cpu' or own:'ai' is a
       MACHINE and must be filed as 'ai'; filing every non-you seat as
       'net' has shipped here three times and it means the machine
       never moves and the table hangs for ever. */
    const own = (i === cfg.you) ? 'me'
              : (s.own === 'ai' || s.kind === 'cpu' || s.bot === true) ? 'ai'
              : 'net';
    M.meta.push({ own, name: s.name || capName(i), lvl: s.level || s.lvl || 2 });
  }
  applyMeta();
  M.net = cfg.net || null;
  M.finished = false;
  openBoard(() => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); });
  hooks.attachNet(cfg.net || null);
  afterMove();      /* only the HOST will actually drive an 'ai' seat */
  return snapshot();
}
function onlineRemote(seat, move){
  if (!M) return { ok:false, why:'no tapp on the table' };
  if (E.over(M.st)) return { ok:false, why:'the match is over' };
  const dec = E.decWire ? (E.decWire(move) || move) : move;
  if (!E.check(M.st, dec, seat)) return { ok:false, why:'that flick did not fit the rules' };
  /* a wire flick that lands mid-film simply cuts the film short: the
     engine state is already final either way, so nothing can go out of
     step — the picture just jumps. */
  if (M.anim){ cancelRaf(); M.anim = null; }
  if (!commitFlick(seat, dec, 'net')) return { ok:false, why:'that flick did not fit the rules' };
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
    why:  why || T('The match stopped.', 'Il-logħba waqfet.'),
    quip: T('Nobody lost anything.', 'Ħadd ma tilef xejn.'),
    buttons: [{ label:T('Back to the rooms', 'Lura fil-kmamar'), icon:'back', cls:'primary',
                go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
  });
}

P.online = P.online || {};
P.online.tapp = {
  start: onlineStart,
  remote: onlineRemote,
  note: onlineNote,
  stop: onlineStop,
  live: () => !!(M && !M.dead && hooks.live()),
  hooks
};

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — window.KARTI_TAPP.lobby. Read by js/mp.js.

   THE WIRE FIELD LIST IS APPEND-ONLY: ['k','a','p'] — which of my caps,
   the angle index 0..255, the power notch 1..64. Never insert into it;
   an older build that meets an undeclared field stops the whole table.
   ═══════════════════════════════════════════════════════════════════ */
const LOBBY = {
  id:'tapp',
  name:'The Cap',
  mt:'It-Tapp',
  minSeats: E.MIN_SEATS,
  maxSeats: E.MAX_SEATS,
  levels: levels().map(L => ({ level:L.level, name:L.name, note:TE(L.note) })),
  defaultLevel: 2,
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    const n = (seatList || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why: T('It-Tapp needs at least two.', 'It-Tapp irid tal-anqas tnejn.') };
    if (n > E.MAX_SEATS) return { ok:false, why: T('Up to four can play.', 'Sa erbgħa jistgħu jilagħbu.') };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready) return { ok:false, why: unready + (unready > 1
        ? T(' people are not ready yet.', ' persuni għadhom mhux lesti.')
        : T(' person is not ready yet.', ' persuna għadha mhux lesta.')) };
    return { ok:true, why:'' };
  },
  rulesHTML: () =>
    '<p>' + T('Two to four players, a set of bottle caps each and one ball. Tap one of your caps, ' +
      'drag BACKWARDS and let go — it fires the other way, as hard as you pulled, and barges ' +
      'through whatever is in the way.',
      'Tnejn sa erbgħa, sett tappijiet kull wieħed u ballun. Mess tapp tiegħek, iġbed LURA u ' +
      'itilqu — jitlaq man-naħa l-oħra, bis-saħħa li ġbidt, u jgħaddi minn dak li jsib quddiemu.') + '</p>' +
    '<p>' + T('Everything slides and stops before the turn passes, so it is one flick each and no ' +
      'rush. Put the ball through somebody else\'s mouth to score; first to three goals wins.',
      'Kollox jiżżerżaq u jieqaf qabel jgħaddi t-turn, mela hi botta waħda kull wieħed u bl-kalma. ' +
      'Daħħal il-ballun fil-lasta ta’ ħaddieħor biex tiskorja; l-ewwel għal tliet gowls jirbaħ.') + '</p>' +
    '<p>' + T('The physics is whole-number and identical on every phone, so what you watch is what ' +
      'they watch — the wire only ever carries which cap, which angle and how hard.',
      'Il-fiżika hi bin-numri sħaħ u identika fuq kull telefon, mela dak li tara int jarawh huma — ' +
      'fuq il-wajer jgħaddi biss liema tapp, liema angolu u kemm bis-saħħa.') + '</p>',
  blurb: T('Flick your caps, barge the ball in. Two to four.',
           'Agħti botta lit-tappijiet, daħħal il-ballun. Tnejn sa erbgħa.'),
  start(seats, opts){
    const n = (seats && seats.length) || 2;
    return newGame(Object.assign({ seats: Math.max(2, Math.min(4, n)),
                                   humans: Math.max(2, Math.min(4, n)),
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
  id:'tapp', order:41, kind:'board', cat:'board', status:'live',
  name:'The Cap', mt:'It-Tapp', icon:'impact',
  get tag(){
    return T('Bottle caps on a pitch: drag back off one of yours, let go, and barge the ball ' +
             'through. Two to four players, one flick each, first to three goals.',
             'Tappijiet fuq grawnd: iġbed lura minn wieħed tiegħek, itilqu, u daħħal il-ballun. ' +
             'Tnejn sa erbgħa, botta kull wieħed, l-ewwel għal tliet gowls.') +
           (ST.save ? ' ' + T('There is a match half-played.', 'Hemm logħba nofsha milgħuba.') : '');
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

/* ── test hooks — inert unless the page is opened with ?tapptest ────── */
if (/[?&]tapptest\b/.test(location.search || '')){
  window.__TAPP_TEST = {
    setupSheet, newGame, offlineSetup, commitFlick, draw, afterMove, maybeThink,
    allBotsGo(){ if (M && M.meta){ M.meta.forEach(m => { if (m.own === 'me' || m.own === 'hot') m.own = 'ai'; }); afterMove(); } },
    get M(){ return M; }, get UI(){ return UI; },
    engine: E, LOBBY, hooks, online: P.online.tapp, leave, reduced,
    px: (x, y) => px(x, y), unpx: (a, b) => unpx(a, b),
    canvasRect(){ return UI && UI.canv ? UI.canv.getBoundingClientRect() : null; }
  };
}

})();
