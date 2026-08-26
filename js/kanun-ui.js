/* ═══════════════════════════════════════════════════════════════════
   KARTI — kanun-ui.js
   IL-KANUN — the screen. The physics live in js/kanun.js
   (window.KARTI_KANUN.engine); this file is the battlefield, the
   thumb, the store and the wire. It follows js/serp-ui.js's shape —
   a themed menu with the RULES FOLDED SHUT at the bottom, a <canvas>
   drawn at device pixel ratio, a back arrow that goes BACK — and
   js/poker-ui.js's house menu/store/turn-based-online conventions.

   WHAT THIS FILE IS
     · the shelf tile and the themed menu — how hard the machine is,
       who throws first, with the RULES a tap away underneath
     · the battlefield: a <canvas> painting the engine's grid of
       destructible cells, two castles, the crew, the moat, the wind
     · DRAG-BACK AIMING: pull back from your castle like a slingshot;
       the drag vector is the shot (dx/dy, two signed bytes). While
       you drag, the predicted arc is drawn from engine.preview(mv) —
       the exact same flight with every write to the world switched
       off, so the line is bit-for-bit the throw. Release to fire.
     · the SHELL FLIGHT: the shot is animated along the engine's
       computed path — its bounces, its skips, its impact — from the
       report the throw returned. Reduced motion skips straight to the
       result.
     · the STORE between turns: buy weapons/ammo and upgrade DEFENCES
       (walls, towers, parapets) from the engine's shopView. A repair
       option. Purchases are engine MOVES, so they replay.
     · SOLO vs AI, fully offline, driven by engine.aiTurn/think.
     · ONLINE turn-based, wired like rummy's relayed moves — written,
       and refused in words until the relay knows the word "kanun".

   ── WHY A CANVAS ──────────────────────────────────────────────────
     The world is 200x100 destructible cells that change every throw,
     a shell that visits dozens of cells a step, ragdolls, splashes.
     One <canvas> painted through a single scale is the only thing
     that keeps a mid phone at 60fps. The chrome (HUD, store, turn
     strip) is DOM, repainted on CHANGE, never per frame.

   ── THE CURRENCY IS THE ENGINE'S OWN ──────────────────────────────
     The engine keeps MATCH coins, because what the other castle
     bought changes the problem in front of you. Those coins are NOT
     KARTI's wallet — the engine never reads or writes the real
     balance. Only at match end does earnings() REPORT what the round
     was worth, and only then does the UI hand it to KARTI's economy.
     Never during a match, and never on a replay.

   HOUSE RULES OBEYED
     · borrows #scr-party through KARTI_PARTY, injects its own CSS
       once, never touches css/ or the tab bar's ancestors;
     · no emoji; sounds only through existing KARTI_SFX ids;
     · every player-visible string is a T(en, mt) pair at its call
       site — js/lang.js's rule. The engine returns {en,mt} names for
       weapons/defences; UI chrome adds its own pairs;
     · reduced motion drops the shell flight, the muzzle flash and the
       wind streaks — the game stays fully playable;
     · the back arrow goes BACK. No "are you sure", no js/nav.js guard.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_KANUN;
if (!K || !P || !R || !R.engine) return;

const E = R.engine;
const esc = (K && K.esc) || (s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;'));

/* ── the one language switch (js/lang.js) ────────────────────────── */
const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
/* a {en,mt} pair the engine authored → the current language */
const TP = p => p ? T(p.en, p.mt) : '';

/* ── reduced motion, the two doors the rest of the app honours ───── */
function noMotion(){
  try {
    if (window.KARTI && KARTI.REDUCED) return true;
    if (document.body && document.body.classList.contains('reduced')) return true;
    return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch(e){ return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   SOUND — existing ids only, through one gate. A throw is loud once;
   a bounce is quiet and rate-limited so a slipper that rattles twelve
   times off the barrels does not turn into a machine gun.
   ═══════════════════════════════════════════════════════════════════ */
let cueAt = 0;
function cue(id, opts, big){
  const S = window.KARTI_SFX;
  if (!S) return;
  const now = Date.now();
  if (!big && now - cueAt < 55) return;
  cueAt = Math.max(cueAt, now);
  try { S.play(id, opts); } catch(e){}
}

/* ── our corner of localStorage ──────────────────────────────────── */
const STORE = 'karti_kanun_v1';
let ST = { v:1, pref:{}, rec:{ w:0, l:0, d:0 }, save:null };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object'){
    ST.pref = (j.pref && typeof j.pref === 'object') ? j.pref : {};
    ST.rec  = (j.rec  && typeof j.rec  === 'object') ? j.rec  : ST.rec;
    ST.save = j.save || null;
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
  if (!persistPending) return;
  clearTimeout(persistPending); persistPending = 0;
  try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){}
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persistNow(); });
window.addEventListener('pagehide', persistNow);
function pref(patch){
  if (patch){ Object.assign(ST.pref, patch); persist(); }
  return ST.pref;
}

/* ── UI-only preferences (the folds) ─────────────────────────────── */
const UIKEY = 'karti_kanun_ui_v1';
let rulesOpen = false;
let setupOpen = false;
try { rulesOpen = localStorage.getItem(UIKEY + '.rules') === '1'; } catch(e){}
try { setupOpen = localStorage.getItem(UIKEY + '.setup') === '1'; } catch(e){}
function setSetupOpen(open){
  setupOpen = !!open;
  try { localStorage.setItem(UIKEY + '.setup', setupOpen ? '1' : '0'); } catch(e){}
}

/* the machine's four levels, by the engine's own names */
function levelWords(k){
  const L = E.LEVELS[Math.max(1, Math.min(4, k | 0))];
  const note = k === 1 ? T('Barely aims. A soft start.', 'Bilkemm jimmira. Bidu artab.')
             : k === 2 ? T('Walks its shots onto you.', 'Iġib it-tefgħat fuqek bil-mod.')
             : k === 3 ? T('Brackets you and closes in.', 'Jaqbdek bejn tnejn u jagħlaq fuqek.')
             :           T('Ranges fast and shops well.', 'Jimmira malajr u jixtri sew.');
  return { n: TP(L.name), i: note };
}

/* the two seats' colours — banners and crew, so which castle is yours
   is never in doubt. Seat 0 is you (offline); seat 1 the enemy. */
const SIDECOL = [
  { a:'#5FC8FF', b:'#175E8E', flag:'#3FB8E8', n:() => T('Blue', 'Blu') },
  { a:'#FF6B4D', b:'#8E2E10', flag:'#FF7A4D', n:() => T('Red',  'Aħmar') }
];

/* the materials, in one place, painted rather than image-loaded. The
   key is the engine's material id; two flat colours make a lit face. */
const MATCOL = {};
MATCOL[E.AIR]      = null;
MATCOL[E.GLASS]    = { a:'#BEE9F2', b:'#7FB6C4' };
MATCOL[E.WOOD]     = { a:'#B5813F', b:'#6E4A1E' };
MATCOL[E.SAND]     = { a:'#D8C48A', b:'#A8905A' };
MATCOL[E.BRICK]    = { a:'#C05B44', b:'#7C3524' };
MATCOL[E.CONCRETE] = { a:'#A8A5A0', b:'#6C6A66' };
MATCOL[E.STEEL]    = { a:'#C7CDD6', b:'#7A828E' };
MATCOL[E.ROCK]     = { a:'#7C756B', b:'#463F38' };
MATCOL[E.HULL]     = { a:'#5B534A', b:'#2E2822' };
MATCOL[E.BOX]      = { a:'#C79A5B', b:'#7E5626' };  /* the crate you float a soldier on */

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party .kn-*
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS(){
  if (document.getElementById('kn-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'kn-runtime-css';
  st.textContent =
    '#scr-party .kn-host{display:flex;flex-direction:column;align-items:stretch;' +
      'justify-content:flex-start;gap:6px;min-height:0}' +

    /* ── the battlefield ── */
    '#scr-party .kn-field{position:relative;flex:1 1 auto;min-height:0;border-radius:14px;' +
      'overflow:hidden;border:2px solid rgba(0,0,0,.55);background:#0A1420;' +
      'box-shadow:0 10px 26px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.05)}' +
    '#scr-party .kn-field canvas{display:block;width:100%;height:100%;touch-action:none}' +

    /* the banner over the canvas — wind, coins, whose throw */
    '#scr-party .kn-over{position:absolute;inset:0;pointer-events:none;z-index:4}' +
    '#scr-party .kn-wind{position:absolute;top:8px;left:50%;transform:translateX(-50%);' +
      'display:flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;' +
      'background:rgba(10,14,22,.72);border:1px solid rgba(255,255,255,.12);' +
      'font:900 10px/1 var(--disp);letter-spacing:.08em;color:var(--dim);white-space:nowrap}' +
    '#scr-party .kn-wind b{color:#fff}' +
    '#scr-party .kn-wind svg{width:15px;height:12px;stroke:var(--gold,#FFC542);fill:none;' +
      'stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
    '#scr-party .kn-purse{position:absolute;top:6px;display:flex;flex-direction:column;gap:3px;' +
      'font:900 11px/1 var(--disp);color:#fff}' +
    '#scr-party .kn-purse.p0{left:8px;align-items:flex-start}' +
    '#scr-party .kn-purse.p1{right:8px;align-items:flex-end}' +
    '#scr-party .kn-purse .c{display:flex;align-items:center;gap:4px;padding:3px 8px;' +
      'border-radius:999px;background:rgba(10,14,22,.7);border:1px solid rgba(255,255,255,.12)}' +
    '#scr-party .kn-purse .c .d{width:8px;height:8px;border-radius:2px}' +
    '#scr-party .kn-purse .c .co{color:var(--gold,#FFC542)}' +
    '#scr-party .kn-purse .hp{font:900 9px/1 var(--disp);letter-spacing:.05em;color:var(--dim)}' +

    /* the hint under the field, spelled once */
    '#scr-party .kn-tip{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);' +
      'max-width:88%;text-align:center;padding:5px 12px;border-radius:12px;' +
      'background:rgba(10,14,22,.72);border:1px solid rgba(255,255,255,.1);' +
      'font:800 11px/1.35 var(--disp);color:var(--dim);opacity:0;' +
      'transition:opacity .25s var(--ease)}' +
    '#scr-party .kn-tip.on{opacity:1}' +
    '#scr-party .kn-tip b{color:#fff}' +

    /* the power meter shown while dragging */
    '#scr-party .kn-power{position:absolute;left:10px;bottom:10px;right:10px;height:8px;' +
      'border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden;opacity:0;' +
      'pointer-events:none;' +   /* never eat an aim drag that ends low on the field */
      'transition:opacity .12s var(--ease);z-index:5}' +
    '#scr-party .kn-power.on{opacity:1}' +

    /* the return-to-base button — hidden until you pan away to scout */
    '#scr-party .kn-home{position:absolute;right:8px;bottom:8px;z-index:6;' +
      '-webkit-appearance:none;appearance:none;border:0;display:none;align-items:center;gap:6px;' +
      'padding:8px 12px;border-radius:999px;background:rgba(10,14,22,.82);' +
      'box-shadow:inset 0 0 0 1px rgba(255,197,66,.5),0 4px 14px rgba(0,0,0,.4);' +
      'color:#fff;font:900 11px/1 var(--disp);letter-spacing:.04em;touch-action:manipulation}' +
    '#scr-party .kn-home.on{display:flex}' +
    '#scr-party .kn-home svg{width:16px;height:16px;stroke:var(--gold,#FFC542);fill:none;' +
      'stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +

    /* the SHOOT / LOOK mode toggle — an explicit, always-visible button so
       the player always knows what a drag will do. Top-left of the field. */
    '#scr-party .kn-mode-t{position:absolute;left:8px;top:8px;z-index:6;' +
      '-webkit-appearance:none;appearance:none;border:0;display:flex;align-items:center;gap:7px;' +
      'padding:7px 12px;border-radius:999px;background:rgba(10,14,22,.82);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),0 4px 14px rgba(0,0,0,.4);' +
      'color:#fff;font:900 11px/1 var(--disp);letter-spacing:.06em;text-transform:uppercase;' +
      'touch-action:manipulation}' +
    '#scr-party .kn-mode-t svg{width:16px;height:16px;stroke:currentColor;fill:none;' +
      'stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
    '#scr-party .kn-mode-t .dot{width:7px;height:7px;border-radius:999px;background:currentColor;' +
      'box-shadow:0 0 6px currentColor}' +
    '#scr-party .kn-mode-t.shoot{color:#FF9A5A;' +
      'box-shadow:inset 0 0 0 1px rgba(255,154,90,.6),0 4px 14px rgba(0,0,0,.4)}' +
    '#scr-party .kn-mode-t.look{color:#5FC8FF;' +
      'box-shadow:inset 0 0 0 1px rgba(95,200,255,.6),0 4px 14px rgba(0,0,0,.4)}' +
    '#scr-party .kn-mode-t b{color:#fff}' +
    '#scr-party .kn-mode-t .sub{font:800 8.5px/1 var(--disp);letter-spacing:.08em;' +
      'color:var(--dim);text-transform:none}' +
    '#scr-party .kn-power i{display:block;height:100%;width:0;border-radius:999px;' +
      'background:linear-gradient(90deg,#3BE08A,#FFC542 60%,#FF6B4D)}' +

    /* ── THE PLACEMENT PHASE: the bar that walks you through laying out
       your own keep and your own crew, and the privacy curtain that goes
       up between two players sharing one phone. ── */
    '#scr-party .kn-setup{position:absolute;left:8px;right:8px;bottom:8px;z-index:7;' +
      'display:none;flex-direction:column;gap:8px;padding:10px 12px;border-radius:14px;' +
      'background:rgba(10,14,22,.9);box-shadow:inset 0 0 0 1px rgba(255,197,66,.35),' +
      '0 8px 22px rgba(0,0,0,.5)}' +
    '#scr-party .kn-host.kn-placing .kn-setup{display:flex}' +
    '#scr-party .kn-setup-t b{display:block;font:900 12px/1.2 var(--disp);color:#fff;' +
      'letter-spacing:.04em}' +
    '#scr-party .kn-setup-t i{display:block;font:800 10.5px/1.35 var(--disp);font-style:normal;' +
      'color:var(--dim);margin-top:3px}' +
    '#scr-party .kn-setup-t em{font-style:normal;color:var(--gold,#FFC542)}' +
    '#scr-party .kn-setup-a{display:flex;gap:8px}' +
    '#scr-party .kn-setup-a .btn{flex:1;margin:0}' +
    /* while the castles are being laid out the fighting chrome is away */
    '#scr-party .kn-host.kn-placing .kn-weps,' +
    '#scr-party .kn-host.kn-placing .kn-acts,' +
    '#scr-party .kn-host.kn-placing .kn-mode-t,' +
    '#scr-party .kn-host.kn-placing .kn-home,' +
    '#scr-party .kn-host.kn-placing .kn-power{display:none}' +
    /* the pass-the-phone curtain: an OPAQUE cover over the whole field, so
       the next player cannot see what the last one just laid out */
    '#scr-party .kn-curtain{position:absolute;inset:0;z-index:25;display:none;' +
      'flex-direction:column;align-items:center;justify-content:center;gap:12px;' +
      'padding:24px;text-align:center;background:#080C13}' +
    '#scr-party .kn-curtain.on{display:flex}' +
    '#scr-party .kn-curtain h4{margin:0;font:900 17px/1.15 var(--disp);color:#fff;' +
      'letter-spacing:.02em}' +
    '#scr-party .kn-curtain p{margin:0;max-width:280px;font:800 12px/1.5 var(--disp);color:var(--dim)}' +
    '#scr-party .kn-curtain .btn{margin-top:4px;min-width:180px}' +
    '#scr-party .kn-curtain .kn-seatdot{width:16px;height:16px;border-radius:5px}' +

    /* the weapon strip — the one you throw, tap to change */
    '#scr-party .kn-weps{flex:0 0 auto;display:flex;gap:6px;overflow-x:auto;padding:2px 2px 4px;' +
      '-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
    '#scr-party .kn-weps::-webkit-scrollbar{display:none}' +
    '#scr-party .kn-wep{flex:0 0 auto;min-width:64px;-webkit-appearance:none;appearance:none;' +
      'border:0;border-radius:12px;background:rgba(255,255,255,.06);color:#E9E4F5;' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.09);padding:6px 8px;text-align:center;' +
      'display:flex;flex-direction:column;align-items:center;gap:2px;touch-action:manipulation}' +
    '#scr-party .kn-wep b{font:900 10px/1.15 var(--disp);color:#fff;letter-spacing:.02em}' +
    '#scr-party .kn-wep i{font:900 9px/1 var(--disp);font-style:normal;color:var(--dim)}' +
    '#scr-party .kn-wep .sw{width:22px;height:22px;border-radius:7px;display:flex;' +
      'align-items:center;justify-content:center}' +
    '#scr-party .kn-wep .sw svg{width:18px;height:18px}' +
    '#scr-party .kn-wep.on{background:rgba(255,197,66,.20);' +
      'box-shadow:inset 0 0 0 1px rgba(255,197,66,.55)}' +
    '#scr-party .kn-wep.out{opacity:.34}' +
    '#scr-party .kn-wep .cd{color:#FF6B4D}' +

    /* the two action buttons under the weapon strip */
    '#scr-party .kn-acts{flex:0 0 auto;display:flex;gap:8px;padding:0 2px 4px}' +
    '#scr-party .kn-acts .btn{flex:1}' +

    /* ── the STORE, a sheet that slides up from the bottom ── */
    '#scr-party .kn-shop{position:absolute;left:0;right:0;bottom:0;top:0;z-index:20;' +
      'display:flex;flex-direction:column;background:rgba(12,10,20,.98);' +
      'transform:translateY(101%);transition:transform .3s var(--ease);' +
      'border-radius:16px 16px 0 0}' +
    '#scr-party .kn-shop.open{transform:none}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .kn-shop{transition:none}}' +
    'body.reduced #scr-party .kn-shop{transition:none}' +
    '#scr-party .kn-shop-h{flex:0 0 auto;display:flex;align-items:center;gap:10px;' +
      'justify-content:space-between;padding:12px 14px 8px}' +
    '#scr-party .kn-shop-h h4{margin:0;font:900 14px/1 var(--disp);letter-spacing:.06em;' +
      'text-transform:uppercase;color:#fff}' +
    '#scr-party .kn-shop-h .coins{font:900 13px/1 var(--disp);color:var(--gold,#FFC542)}' +
    '#scr-party .kn-shop-b{flex:1 1 auto;min-height:0;overflow-y:auto;padding:2px 12px 10px;' +
      '-webkit-overflow-scrolling:touch}' +
    '#scr-party .kn-grp{margin:8px 0 2px;font:900 10px/1 var(--disp);letter-spacing:.12em;' +
      'text-transform:uppercase;color:var(--dim)}' +
    '#scr-party .kn-item{width:100%;text-align:left;-webkit-appearance:none;appearance:none;' +
      'border:0;display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:12px;' +
      'background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);' +
      'margin-bottom:6px;color:#E9E4F5;touch-action:manipulation}' +
    '#scr-party .kn-item .ic{width:30px;height:30px;border-radius:8px;flex:0 0 auto;' +
      'display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.06)}' +
    '#scr-party .kn-item .ic svg{width:22px;height:22px}' +
    '#scr-party .kn-item .tx{flex:1;min-width:0}' +
    '#scr-party .kn-item .tx b{display:block;font:900 12px/1.2 var(--disp);color:#fff}' +
    '#scr-party .kn-item .tx i{display:block;font:800 10px/1.35 var(--disp);font-style:normal;' +
      'color:var(--dim);margin-top:2px}' +
    '#scr-party .kn-item .pr{flex:0 0 auto;font:900 12px/1 var(--disp);color:var(--gold,#FFC542);' +
      'display:flex;flex-direction:column;align-items:flex-end;gap:2px}' +
    '#scr-party .kn-item .pr small{font:900 8px/1 var(--disp);letter-spacing:.08em;color:var(--dim)}' +
    '#scr-party .kn-item.no{opacity:.4}' +
    '#scr-party .kn-item.no .pr{color:var(--dim)}' +
    '#scr-party .kn-item.owned{opacity:.62}' +
    '#scr-party .kn-shop-f{flex:0 0 auto;padding:8px 12px calc(env(safe-area-inset-bottom,0px) + 12px)}' +

    /* ── the rules panel, poker's exactly ── */
    '#scr-party .kn-rules{position:absolute;top:0;left:0;right:0;z-index:30;max-height:74%;' +
      'display:flex;flex-direction:column;background:rgba(14,12,24,.97);' +
      'border-bottom:1px solid rgba(255,255,255,.12);border-radius:0 0 16px 16px;' +
      'box-shadow:0 14px 34px rgba(0,0,0,.6);transform:translateY(-102%);opacity:0;' +
      'visibility:hidden;pointer-events:none;' +
      'transition:transform .3s var(--ease),opacity .3s var(--ease),visibility 0s .3s}' +
    '#scr-party .kn-rules.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .3s var(--ease),opacity .3s var(--ease),visibility 0s 0s}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .kn-rules{transition:none}}' +
    'body.reduced #scr-party .kn-rules{transition:none}' +
    '#scr-party .kn-rules-h{flex:0 0 auto;display:flex;align-items:center;' +
      'justify-content:space-between;gap:8px;padding:10px 14px 6px}' +
    '#scr-party .kn-rules-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--gold,#FFC542)}' +
    '#scr-party .kn-rules-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;' +
      'color:var(--dim);display:flex;align-items:center;justify-content:center}' +
    '#scr-party .kn-rules-x svg{width:16px;height:16px;stroke:currentColor;fill:none;' +
      'stroke-width:2.2;stroke-linecap:round}' +
    '#scr-party .kn-rules-b{min-height:0;overflow-y:auto;padding:2px 14px 14px;' +
      '-webkit-overflow-scrolling:touch}' +
    '#scr-party .kn-rules-b ul{margin:0;padding:0}' +
    '#scr-party .kn-rules-b li{font-size:12px;line-height:1.6;color:var(--dim);' +
      'list-style:none;margin:0 0 7px;padding:0 0 0 13px;position:relative}' +
    '#scr-party .kn-rules-b li:before{content:"";position:absolute;left:0;top:7px;width:5px;' +
      'height:5px;border-radius:2px;background:var(--gold,#FFC542);opacity:.75}' +
    '#scr-party .kn-rules-b b{color:#fff}' +

    /* ── the menu, poker/serp chrome (hero styled in the AAA block below) ── */
    /* the fold at the bottom of the menu — serp's kn-fold */
    '#scr-party .kn-fold-h{width:100%;display:flex;align-items:center;justify-content:space-between;' +
      'gap:8px;padding:12px 2px;border:0;background:none;color:#fff;text-align:left}' +
    '#scr-party .kn-fold-h b{font:900 11px/1.3 var(--disp);letter-spacing:.06em;' +
      'text-transform:uppercase}' +
    '#scr-party .kn-fold-h i{font:900 9px/1 var(--disp);letter-spacing:.1em;color:var(--dim);' +
      'font-style:normal;flex:0 0 auto}' +
    '#scr-party .kn-fold-b{display:grid;grid-template-rows:0fr;' +
      'transition:grid-template-rows .28s var(--ease)}' +
    '#scr-party .kn-fold-b.open{grid-template-rows:1fr}' +
    '#scr-party .kn-fold-i{overflow:hidden;min-height:0}' +
    '#scr-party .kn-fold-i .kn-fold-c{transform:translateY(-10px);opacity:0;' +
      'transition:transform .28s var(--ease),opacity .28s var(--ease)}' +
    '#scr-party .kn-fold-b.open .kn-fold-i .kn-fold-c{transform:none;opacity:1}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .kn-fold-b,' +
      '#scr-party .kn-fold-i .kn-fold-c{transition:none}}' +
    'body.reduced #scr-party .kn-fold-b,body.reduced #scr-party .kn-fold-i .kn-fold-c' +
      '{transition:none}' +
    '#scr-party .kn-fold-c li{font-size:12px;line-height:1.6;color:var(--dim);list-style:none;' +
      'margin:0 0 7px;padding:0 0 0 13px;position:relative}' +
    '#scr-party .kn-fold-c li:before{content:"";position:absolute;left:0;top:7px;width:5px;' +
      'height:5px;border-radius:2px;background:var(--gold,#FFC542);opacity:.75}' +
    '#scr-party .kn-fold-c b{color:#fff}' +

    /* ── the ENTRY screen: a few big choices, nothing else ── */
    '#scr-party .kn-modes{display:flex;flex-direction:column;gap:10px;margin:4px 0 14px}' +
    '#scr-party .kn-mode{-webkit-appearance:none;appearance:none;border:0;text-align:left;' +
      'display:flex;align-items:center;gap:12px;padding:15px 16px;border-radius:16px;color:#fff;' +
      'background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.09);' +
      'touch-action:manipulation}' +
    '#scr-party .kn-mode .mi{width:40px;height:40px;flex:0 0 auto;border-radius:12px;' +
      'display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.07)}' +
    '#scr-party .kn-mode .mi svg{width:24px;height:24px;stroke:currentColor;fill:none;' +
      'stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
    '#scr-party .kn-mode .mt{flex:1;min-width:0}' +
    '#scr-party .kn-mode .mt b{display:block;font:900 15px/1.1 var(--disp);letter-spacing:.02em}' +
    '#scr-party .kn-mode .mt i{display:block;font:800 11px/1.3 var(--disp);font-style:normal;' +
      'color:var(--dim);margin-top:3px}' +
    '#scr-party .kn-mode .chev{flex:0 0 auto;opacity:.5}' +
    '#scr-party .kn-mode .chev svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2.4;' +
      'stroke-linecap:round;stroke-linejoin:round}' +
    '#scr-party .kn-mode.primary{background:linear-gradient(120deg,rgba(255,197,66,.22),rgba(255,107,77,.16));' +
      'box-shadow:inset 0 0 0 1px rgba(255,197,66,.5)}' +
    '#scr-party .kn-mode.primary .mi{background:rgba(255,197,66,.24);color:var(--gold,#FFC542)}' +
    '#scr-party .kn-mode.primary .mt b{color:#fff}' +
    /* the RULES button on the entry screen, and the slide-up panel it opens */
    '#scr-party .kn-mrules{position:fixed;left:0;right:0;bottom:0;z-index:40;max-height:78%;' +
      'display:flex;flex-direction:column;background:rgba(14,12,24,.98);' +
      'border-top:1px solid rgba(255,255,255,.12);border-radius:16px 16px 0 0;' +
      'box-shadow:0 -14px 34px rgba(0,0,0,.6);transform:translateY(101%);' +
      'transition:transform .3s var(--ease)}' +
    '#scr-party .kn-mrules.open{transform:none}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .kn-mrules{transition:none}}' +
    'body.reduced #scr-party .kn-mrules{transition:none}' +
    '#scr-party .kn-mrules-h{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;' +
      'gap:8px;padding:12px 14px 6px}' +
    '#scr-party .kn-mrules-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--gold,#FFC542)}' +
    '#scr-party .kn-mrules-b{min-height:0;overflow-y:auto;padding:2px 14px calc(env(safe-area-inset-bottom,0px) + 16px)}' +
    '#scr-party .kn-mrules-b ul{margin:0;padding:0}' +
    '#scr-party .kn-mrules-b li{font-size:12.5px;line-height:1.6;color:var(--dim);list-style:none;' +
      'margin:0 0 8px;padding:0 0 0 13px;position:relative}' +
    '#scr-party .kn-mrules-b li:before{content:"";position:absolute;left:0;top:7px;width:5px;height:5px;' +
      'border-radius:2px;background:var(--gold,#FFC542);opacity:.75}' +
    '#scr-party .kn-mrules-b b{color:#fff}' +
    '#scr-party .kn-scrim{position:fixed;inset:0;z-index:39;background:rgba(0,0,0,.5);opacity:0;' +
      'pointer-events:none;transition:opacity .3s var(--ease)}' +
    '#scr-party .kn-scrim.on{opacity:1;pointer-events:auto}' +

    /* ── the AAA menu hero: a full-bleed dramatic scene, a big title
       lockup over it, and a gold rule. The generated art image, if it
       ever drops in as a background, composes UNDER the canvas scene. ── */
    '#scr-party .kn-menu .kn-hero{position:relative;display:block;height:210px;' +
      'margin:2px 0 16px;border-radius:20px;overflow:hidden;' +
      'background:radial-gradient(120% 120% at 50% 0%,#2A4763 0%,#122536 52%,#070D15 100%);' +
      'box-shadow:0 18px 40px rgba(0,0,0,.55),inset 0 0 0 1px rgba(255,255,255,.07),' +
      'inset 0 -30px 60px rgba(0,0,0,.5)}' +
    '#scr-party .kn-menu .kn-hero canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
    '#scr-party .kn-menu .kn-hero-art{position:absolute;inset:0;background-size:cover;' +
      'background-position:center;opacity:0}' +   /* set to 1 by JS if art present */
    '#scr-party .kn-menu .kn-hero-lock{position:absolute;left:16px;right:16px;bottom:14px;z-index:2}' +
    '#scr-party .kn-menu .kn-hero-cap{display:inline-block;font:900 9px/1 var(--disp);' +
      'letter-spacing:.28em;text-transform:uppercase;color:var(--gold,#FFC542);' +
      'padding:3px 8px;border-radius:999px;background:rgba(0,0,0,.4);' +
      'box-shadow:inset 0 0 0 1px rgba(255,197,66,.35);margin-bottom:6px}' +
    '#scr-party .kn-menu .kn-hero-title{margin:0;font:900 40px/0.9 var(--disp);letter-spacing:.01em;' +
      'color:#fff;text-shadow:0 3px 0 rgba(0,0,0,.4),0 10px 24px rgba(0,0,0,.5)}' +
    '#scr-party .kn-menu .kn-hero-sub{margin:5px 0 0;font:800 12px/1.3 var(--disp);' +
      'color:rgba(255,255,255,.72)}' +
    '@media (max-height:620px){#scr-party .kn-menu .kn-hero{height:158px}' +
      '#scr-party .kn-menu .kn-hero-title{font-size:32px}}' +

    /* ── the battlefield picker cards in AI setup ── */
    '#scr-party .kn-maps{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0 2px}' +
    '#scr-party .kn-map{-webkit-appearance:none;appearance:none;border:0;text-align:left;' +
      'display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:14px;color:#fff;' +
      'background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);' +
      'touch-action:manipulation}' +
    '#scr-party .kn-map.on{background:rgba(255,197,66,.14);' +
      'box-shadow:inset 0 0 0 1.5px rgba(255,197,66,.6)}' +
    '#scr-party .kn-map-thumb{display:block;border-radius:9px;overflow:hidden;line-height:0;' +
      'box-shadow:inset 0 0 0 1px rgba(0,0,0,.4)}' +
    '#scr-party .kn-map-thumb canvas{width:100%;height:auto;display:block}' +
    '#scr-party .kn-map-tx b{display:block;font:900 12px/1.1 var(--disp);color:#fff}' +
    '#scr-party .kn-map-tx i{display:block;font:800 9.5px/1.3 var(--disp);font-style:normal;' +
      'color:var(--dim);margin-top:2px}' +

    /* the aim readout sits centred in the tip while dragging; already styled */
    '';
  document.head.appendChild(st);
}

/* ── the shelf mark and the weapon glyphs, injected once ─────────── */
function injectDefs(){
  if (document.getElementById('kn-defs') || !document.body) return;
  const d = document.createElement('div');
  d.id = 'kn-defs';
  d.setAttribute('aria-hidden', 'true');
  d.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  d.innerHTML =
    '<svg width="0" height="0" focusable="false">' +
    /* the tile: a stubby cannon on a wall */
    '<symbol id="kn-t-kanun" viewBox="0 0 24 24">' +
      '<path d="M3 20h18M4 20v-3h4v3M16 20v-3h4v3" fill="none" stroke="currentColor" ' +
        'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M6.5 13.5l9-4.2 1.6 3.4-9 4.2z" fill="currentColor"/>' +
      '<circle cx="6.6" cy="14.8" r="2.1" fill="currentColor"/>' +
      '<path d="M15.6 8.2l2.6-1.2.9 2-2.6 1.2z" fill="currentColor"/>' +
    '</symbol></svg>';
  document.body.appendChild(d);
}

/* a small SVG for each weapon, so the strip reads at a glance and no
   image file is loaded. currentColor + a themed swatch behind it. */
function wepGlyph(key){
  const g = {
    BALLUN:    '<circle cx="12" cy="13" r="7" fill="#5FC8FF"/><path d="M12 6c3 2 3 6 0 8" stroke="#fff" stroke-width="1.4" fill="none" opacity=".6"/>',
    PASTIZZ:   '<path d="M4 14c2-5 14-5 16 0-2 3-14 3-16 0z" fill="#E8C879"/><path d="M6 13h12" stroke="#8a6a20" stroke-width="1.3"/>',
    QUBBAJT:   '<rect x="6" y="8" width="12" height="9" rx="2" fill="#F0E4C0"/><circle cx="9" cy="12" r="1.1" fill="#C08"/><circle cx="14" cy="14" r="1.1" fill="#C08"/>',
    PPAPOCC:   '<path d="M5 15c0-3 3-4 6-4h5c2 0 2 3 0 3H9c-2 0-2 2 0 2h5" fill="#5C4FA8"/>',
    BAJTRA:    '<ellipse cx="12" cy="13" rx="5.5" ry="7" fill="#3BE08A"/><path d="M12 5v2M9 7l1 1M15 7l-1 1M8 11l1 .5M16 11l-1 .5" stroke="#0E7A45" stroke-width="1.3"/>',
    MURTAL:    '<circle cx="12" cy="14" r="6" fill="#444"/><path d="M12 8V4M12 4l-2 2M12 4l2 2" stroke="#FFC542" stroke-width="1.6" fill="none"/>',
    TRIVELLA:  '<path d="M12 4l3 4-3 2-3-2z" fill="#C7CDD6"/><path d="M9 10l6 0-1 3-4 0zM10 13l4 0-1 3-2 0z" fill="#7A828E"/>',
    KARRETTUN: '<path d="M5 15h11l1-5H6z" fill="#9a8f80"/><circle cx="8" cy="18" r="1.8" fill="#333"/><circle cx="15" cy="18" r="1.8" fill="#333"/>'
  }[key] || '<circle cx="12" cy="12" r="6" fill="#888"/>';
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + g + '</svg>';
}

/* ═══════════════════════════════════════════════════════════════════
   THE RUNNER — one live match at a time. leave() is the only way out.
   ═══════════════════════════════════════════════════════════════════ */
let M = null;
let UI = null;
const moveSubs = [];
function fire(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }

const nowMs = () => (typeof performance !== 'undefined' && performance.now)
                      ? performance.now() : Date.now();

function startMatch(opts, seed, net){
  stopAnim(); stopFx();
  const o = Object.assign({ lvl:2, first:0, strat:'BAL' }, opts || {});
  const V = VARIANTS[o.variant] ? o.variant : 'malta';
  const preset = VARIANTS[V];
  const seedN = (seed == null ? E.newSeed() : seed) >>> 0;
  /* the variant feeds the engine ONLY through opts (part of the match
     tuple, so both phones build the same world): the starting purse and
     the allowed weapon set. Everything else the variant changes is the
     UI's theme, which never touches the sim. */
  const engOpts = {
    lvl: [ o.lvl0 != null ? o.lvl0 : 0, o.lvl1 != null ? o.lvl1 : o.lvl ],
    first: o.first | 0
  };
  if (o.purse != null) engOpts.purse = o.purse | 0;
  else if (preset.purse != null) engOpts.purse = preset.purse;
  if (o.own) engOpts.own = o.own;
  else if (preset.own) engOpts.own = [ preset.own.slice(), preset.own.slice() ];
  if (o.place) engOpts.place = o.place;
  const st = E.newMatch(seedN, engOpts);
  const themeKey = preset.theme;
  M = {
    opts: o, seed: seedN, st,
    /* kept so the placement phase can rebuild the SAME match on the SAME
       seed with a different layout — a match is its tuple, and the layout
       is part of the tuple, so changing it means rebuilding, not patching */
    engOpts: engOpts,
    net: net || null,
    me: 0,                      /* the seat this phone drives            */
    mine: [0],                  /* seats this phone is authoritative over */
    meta: [],
    ctx: null, cv: null, g2: null,
    sel: 0,                     /* selected weapon id                    */
    drag: null,                 /* {x,y,dx,dy,mv} while aiming           */
    preview: null,              /* the previewed track pts               */
    anim: null,                 /* the shell flight in progress          */
    cam: null,                  /* the camera (initCam on mount)         */
    fx: null,                   /* the destruction particle system       */
    /* FOG: persistent cleared patches, kept PER SEAT. A reveal is something
       the SHOOTER learned, so it must never be inherited by the other
       player on a pass-the-phone handover: one list per seat, and the
       screen only ever draws the VIEWER's own. */
    revealsBy: [[], []],
    /* THE LAST SHOT, PER SEAT. Only the viewer's own arc and marker are
       ever drawn, so the opponent's trail never hangs on your screen —
       "your last shot needs to stay, not the enemy's". */
    lastArc: [null, null],
    lastShot: [null, null],
    viewSeat: 0,                /* whose eyes this screen is — the fog's owner */
    phase: 'play',              /* 'place' while the castles are being laid out */
    place: null,                /* the in-progress placement (see placeStart)   */
    hotseat: false,             /* two players, one phone                       */
    theme: THEMES[themeKey],
    variant: V,
    raf: 0, busy:false, dead:false, finished:false,
    shopOpen:false, aiPending:0,
    fireQ: []                   /* moves that arrived while a flight played */
  };
  return M;
}

/* ── WHOSE PHONE THIS IS, RIGHT NOW ───────────────────────────────────
   Everything the local player drives — aiming, the weapon strip, the
   store, their own last-shot arc — reads THIS, not M.me. Solo and online
   it is simply the seat this device holds. Pass-the-phone it is whoever
   is sitting in front of it, which is what makes the fog flip over to the
   new player's point of view on a handover. */
function mySeat(){ return localSide(); }

/* ═══════════════════════════════════════════════════════════════════
   THE CANVAS + THE CAMERA — fitCanvas() is the ONLY layout read, on
   mount/resize. It computes the BASE FIT: the scale and offset that
   letter-box the whole 200x100 world into the field. On top of that
   base sits a CAMERA (M.cam) that pans and zooms in world space, so
   the view can be tighter than the whole board and can FOLLOW A SHELL.

   ── WHY THIS IS COMPOSITOR-CHEAP ──────────────────────────────────
   The camera is not a CSS transform on the canvas element and never
   touches layout: `fitCanvas()` reads clientWidth/Height ONCE per
   mount/resize, caches sc/ox/oy, and nothing after that reads the DOM.
   Panning/zooming is pure arithmetic inside sx()/sy() — a multiply and
   an add per point — recomputed each animation frame we were going to
   paint anyway. No reflow, no getBoundingClientRect in the hot path,
   no layout thrash: the canvas bitmap is the same size every frame and
   only its *contents* move. The eased follow is a critically-damped
   lerp (see tickCam), which is frame-rate tolerant and never overshoots.
   ═══════════════════════════════════════════════════════════════════ */
function fitCanvas(){
  if (!UI || !UI.cv || !UI.field) return;
  const w = UI.field.clientWidth, h = UI.field.clientHeight;
  if (!w || !h) return;
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const px = Math.round(w * dpr), py = Math.round(h * dpr);
  if (UI.cv.width !== px || UI.cv.height !== py){ UI.cv.width = px; UI.cv.height = py; }
  UI.dpr = dpr; UI.cw = w; UI.ch = h;

  /* the base fit: the whole world, keeping aspect. */
  const worldW = E.W, worldH = E.H;
  const sc = Math.min(w / worldW, h / worldH);
  UI.baseSc = sc;
  UI.baseOx = (w - worldW * sc) / 2;
  UI.baseOy = (h - worldH * sc) / 2;
  UI.g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (M && !M.cam) initCam();
  /* the aim frame is DERIVED from the field size (frameWhole reads
     UI.cw/ch/baseSc), so a resize changes it. When the camera is idle
     — not following a shell, not mid-throw — re-fit it to the new frame
     so the enemy castle stays framed after a rotate/resize. */
  else if (M && M.cam && !M.anim && !M.cam.follow && !M.cam.userPan && !M.pan){
    /* don't yank a camera the player is actively scouting with (userPan) */
    const f = frameWhole();
    M.cam.tx = f.x; M.cam.ty = f.y; M.cam.tzoom = f.zoom;
    snapCam();
  } else if (M && M.cam && M.cam.userPan){
    clampCam(M.cam);   /* just keep the scouted view on-world after resize */
  }
  UI.dirty = true;
  draw();
}

/* ── THE RESTING / AIMING SHOT: your OWN base, zoomed IN ──────────────
   Now that FOG hides the enemy half, there is nothing to gain by framing
   BOTH castles — that zoom is so far out that your slingshot is a speck
   and aiming needs huge off-screen drags. The aim view instead sits
   CLOSE on the LOCAL player's own castle + the sky above it (room for the
   arc), so the sling gesture is big and precise. The camera still FOLLOWS
   the shell into the fog during flight (playFlight), then eases back here.

   frameForBase(seat) frames the band from the back wall of `seat`'s own
   castle out toward the moat, with a margin, and vertically from high sky
   (for the arc) down to just under the waterline. The zoom is DERIVED
   from the field size and clamped so the base fills a large central
   portion of the viewport without a wall slipping off. Draw-only: nothing
   here feeds the simulation. */
const FRAME_TOP_Y    = 34;   /* highest cell kept in view (sky for the arc) */
const FRAME_BOT_Y    = 82;   /* lowest cell kept in view (just under water) */
/* the aim view is a fixed-width band centred on the LAUNCH HAND, so the
   slingshot sits in the MIDDLE of the viewport with room on BOTH sides to
   pull back (the launch is from the castle's rear, so the pull goes back
   toward the world edge — the hand must not be jammed against it). The
   band spans BASE_HALF_W cells each side of the hand; the world edges clamp
   it but the derived zoom keeps the base large. */
const BASE_HALF_W = 34;      /* cells of room each side of the launch hand */
/* the zoom is capped so the base reads big; floored so a very tall field
   never leaves dead sky flapping around it. */
/* PLAY sits CLOSE on the thrower (1.9) so aiming can then pull the camera
   out to follow the arc to where it lands. PLACEMENT floors much lower
   (0.8) so all three boxes, dropped right across the map, still fit. */
const BASE_ZOOM_MIN  = 1.9;
const PLACE_ZOOM_MIN = 0.8;
const BASE_ZOOM_MAX  = 4.2;

function frameForBase(seat){
  seat = seat | 0;
  const hand = (M && M.st) ? handOf(seat) : null;
  const castleMid = seat === 0 ? (E.L_X0 + E.L_X1) / 2 : (E.R_X0 + E.R_X1) / 2;
  let bx0, bx1, zmin;
  if (M && M.phase === 'place'){
    /* PLACEMENT: the WHOLE stretch of water you may drop boxes in, so you
       can see and reach all three however far apart they are. */
    const back = (M.st && M.st.sides[seat] ? M.st.sides[seat].back : 0) | 0;
    const z = E.crewZone(seat, back);
    const MARG = 9;
    bx0 = z.x0 - MARG; bx1 = z.x1 + MARG;
    const MINW = BASE_HALF_W * 1.3;
    if (bx1 - bx0 < MINW){ const c = (bx0 + bx1) / 2; bx0 = c - MINW / 2; bx1 = c + MINW / 2; }
    zmin = PLACE_ZOOM_MIN;
  } else {
    /* PLAY: sit CLOSE on the thrower, so aiming then pulls the camera OUT to
       follow the arc all the way to where it comes down. Centre on the launch
       hand with room each side for the pull. */
    const hx = hand ? hand.x : castleMid;
    bx0 = hx - BASE_HALF_W; bx1 = hx + BASE_HALF_W;
    zmin = BASE_ZOOM_MIN;
  }
  /* keep the band on-world, but preserve its WIDTH when it hits an edge so
     the zoom stays stable near the world edge. */
  const bandW0 = bx1 - bx0;
  if (bx0 < 0){ bx0 = 0; bx1 = bandW0; }
  if (bx1 > E.W){ bx1 = E.W; bx0 = E.W - bandW0; }
  const cx = (bx0 + bx1) / 2;
  const cy = (FRAME_TOP_Y + FRAME_BOT_Y) / 2;
  /* with no field measured yet (pre-mount), fall back to a sane close zoom */
  if (!UI || !UI.cw || !UI.ch || !UI.baseSc){
    return { x: cx, y: cy, zoom: zmin };
  }
  const bandW = bx1 - bx0;                 /* cells across the band  */
  const bandH = FRAME_BOT_Y - FRAME_TOP_Y; /* cells down the band    */
  /* the zoom (a multiple of baseSc) that just fits the band in each axis;
     take the SMALLER so the whole base stays framed, then clamp. */
  const zx = (UI.cw / UI.baseSc) / bandW;
  const zy = (UI.ch / UI.baseSc) / bandH;
  let zoom = Math.min(zx, zy);
  zoom = clampN(zoom, zmin, BASE_ZOOM_MAX);
  return { x: cx, y: cy, zoom };
}
/* ── THE AIM CAMERA FOLLOWS THE SHOT TO ITS LANDING ──────────────────
   While the finger is down, the camera pulls back to frame from the
   launch HAND out to the END of the predicted arc — "zoom till the end
   of the aim assist". A short pull stays tight on the base; a full-power
   shot eases the camera out so the whole trajectory, right to where it
   comes down, is on screen. NO bounce prediction is added: the framed
   line is exactly the arc the game already draws under the finger,
   nothing more. And because drawFog paints the enemy half in world space
   (its crew is never painted on the fogged side, camera or no), seeing
   WHERE a shell will land never reveals WHO is standing there — the duel
   stays competitive. */
const AIM_MARGIN   = 7;     /* cells of breathing room around the arc      */
const AIM_ZOOM_MIN = 1.05;  /* never pull so far the base becomes a speck  */
/* NOTE: named frameArc, NOT frameForAim — there is a separate, older
   frameForAim(snap) further down that homes the view at the start of a turn;
   two functions of the same name would collide (the later one wins) and this
   arc-follow would silently never run. */
function frameArc(seat, pts){
  seat = seat | 0;
  /* pts is the engine's FLAT track: [x0,y0,x1,y1,...], two numbers a point */
  if (!pts || pts.length < 4 || !UI || !UI.cw || !UI.ch || !UI.baseSc)
    return frameForBase(seat);
  const hand = (M && M.st) ? handOf(seat) : null;
  let x0 = hand ? hand.x : pts[0], x1 = x0;
  let y0 = hand ? hand.y : pts[1], y1 = y0;
  for (let i = 0; i < pts.length; i += 2){
    const px = pts[i], py = pts[i + 1];
    if (px < x0) x0 = px; else if (px > x1) x1 = px;
    if (py < y0) y0 = py; else if (py > y1) y1 = py;
  }
  /* a little sky above the apex, a little water below the landing */
  x0 -= AIM_MARGIN; x1 += AIM_MARGIN;
  y0 -= AIM_MARGIN; y1 += AIM_MARGIN * 0.6;
  if (y0 < 0) y0 = 0;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const spanW = Math.max(1, x1 - x0), spanH = Math.max(1, y1 - y0);
  const zx = (UI.cw / UI.baseSc) / spanW;
  const zy = (UI.ch / UI.baseSc) / spanH;
  let zoom = clampN(Math.min(zx, zy), AIM_ZOOM_MIN, BASE_ZOOM_MAX);
  return { x: cx, y: cy, zoom };
}

/* the seat whose base the aim camera should rest on: the local human's
   own seat (canAct() gates aiming to E.turnOf === M.me), resolved the
   same way localSide() picks the clear half so pass-the-phone / online
   agree with the fog. */
function aimSeat(){ return localSide(); }
function frameWhole(){ return frameForBase(aimSeat()); }
function initCam(){
  const f = frameForBase(M ? aimSeat() : 0);
  M.cam = { x:f.x, y:f.y, zoom:f.zoom, tx:f.x, ty:f.y, tzoom:f.zoom,
            hold:0, follow:false };
}

/* clamp the camera so it never shows beyond the world's edges by more
   than a little sky, whatever the zoom. */
function camScale(){ return UI.baseSc * (M && M.cam ? M.cam.zoom : 1); }
function clampCam(c){
  if (!UI) return;
  const s = UI.baseSc * c.zoom;
  const halfW = (UI.cw / 2) / s, halfH = (UI.ch / 2) / s;
  const minX = halfW - 6, maxX = E.W - halfW + 6;
  const minY = halfH - 40, maxY = E.H - halfH + 6;
  c.x = (minX > maxX) ? E.W / 2 : clampN(c.x, minX, maxX);
  c.y = (minY > maxY) ? (E.GROUND_Y - 12) : clampN(c.y, minY, maxY);
}
function clampN(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }

/* the eased follow: move a fraction of the remaining gap each frame,
   frame-rate compensated so it feels the same at 30 and 60fps. Returns
   whether it is still meaningfully moving. */
function tickCam(dt){
  const c = M && M.cam; if (!c || !UI) return false;
  const k = 1 - Math.pow(0.0016, Math.min(0.05, dt) );  /* ~critically damped */
  const nx = c.x + (c.tx - c.x) * k;
  const ny = c.y + (c.ty - c.y) * k;
  const nz = c.zoom + (c.tzoom - c.zoom) * k;
  const moved = Math.abs(nx - c.x) + Math.abs(ny - c.y) + Math.abs(nz - c.zoom) * 40;
  c.x = nx; c.y = ny; c.zoom = nz;
  clampCam(c);
  return moved > 0.01;
}
/* jump the camera to its target instantly (reduced motion / setup) */
function snapCam(){ const c = M && M.cam; if (!c) return; c.x=c.tx; c.y=c.ty; c.zoom=c.tzoom; clampCam(c); }

/* world (cell) → screen (css px), through the camera. When no match is
   live (menu hero uses its own canvas) this is never called. */
function sx(x){
  const c = M && M.cam ? M.cam : null; const s = camScale();
  const cx = c ? c.x : E.W / 2;
  return UI.cw / 2 + (x - cx) * s + (UI.camShX || 0);
}
function sy(y){
  const c = M && M.cam ? M.cam : null; const s = camScale();
  const cy = c ? c.y : E.H / 2;
  return UI.ch / 2 + (y - cy) * s + (UI.camShY || 0);
}
/* screen → world, for the drag (inverse of the above, shake excluded) */
function wx(px){ const c = M && M.cam ? M.cam : null; const s = camScale();
  return (c ? c.x : E.W / 2) + (px - UI.cw / 2) / s; }
function wy(py){ const c = M && M.cam ? M.cam : null; const s = camScale();
  return (c ? c.y : E.H / 2) + (py - UI.ch / 2) / s; }
/* the world scale a caller needs where it used UI.sc before */
function cellPx(){ return camScale(); }

/* ═══════════════════════════════════════════════════════════════════
   DRAW — the whole battlefield, painted from the engine's view. The
   grid is drawn as spans of same-material cells per column so 20 000
   cells do not become 20 000 fillRects; a run of identical solid cells
   in a column is one rectangle.
   ═══════════════════════════════════════════════════════════════════ */
function draw(){
  if (!UI || !UI.g2 || !M || !M.cam) return;
  const g = UI.g2, w = UI.cw, h = UI.ch, st = M.st;
  const v = E.view(st);
  const cell = cellPx();
  const th = M.theme || THEMES.malta;

  /* ── sky: a themed vertical wash, and a soft sun/haze glow ── */
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, th.sky0); sky.addColorStop(0.62, th.sky1); sky.addColorStop(1, th.sky2);
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  if (th.glow){
    const gx = sx(th.glowX != null ? th.glowX : E.W * 0.5), gy = sy(-20);
    const gr = Math.max(60, cell * 90);
    const gl = g.createRadialGradient(gx, gy, 0, gx, gy, gr);
    gl.addColorStop(0, th.glow); gl.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gl; g.fillRect(0, 0, w, h);
  }

  /* NO far skyline any more — the raft game is open water and nothing else,
     so the old parallax hills + landmark building are gone. Just sky + sea. */
  /* drawSkyline(g, th, v); */

  /* ── the moat: a lit surface line and a darkening depth ── */
  const wyTop = sy(v.waterY);
  const wBot = sy(E.H);
  const seaL = sx(0), seaR = sx(E.W), seaW = seaR - seaL;
  const sea = g.createLinearGradient(0, wyTop, 0, wBot);
  sea.addColorStop(0, th.sea0); sea.addColorStop(1, th.sea1);
  g.fillStyle = sea; g.fillRect(seaL, wyTop, seaW, wBot - wyTop);
  /* the bright meniscus at the waterline */
  g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(seaL, wyTop, seaW, Math.max(1, cell * 0.4));
  if (!noMotion()){
    g.strokeStyle = 'rgba(255,255,255,.09)'; g.lineWidth = 1;
    const t = nowMs() / 900;
    for (let i = 0; i < 3; i++){
      const yy = wyTop + (i + 1) * (wBot - wyTop) / 4;
      g.beginPath();
      g.moveTo(seaL, yy + Math.sin(t + i) * 1.4);
      g.lineTo(seaR, yy + Math.sin(t + i + 2) * 1.4);
      g.stroke();
    }
  }

  /* ══ EVERYTHING FROM HERE TO THE MATCHING restore() IS WORLD CONTENT,
        AND IT IS PAINTED ONLY WHERE THIS VIEWER MAY SEE IT.
        The clip is the viewer's own half plus the patches their shells
        have opened. Terrain, damage cracks, the pennants, the crew, their
        shadows and their health bars are all inside it, so there is
        nothing of the enemy on the canvas for the fog to fail to cover.
        See clipVisible(). ══ */
  g.save();
  clipVisible(g);

  /* ── the terrain: per-column span merge, two-tone faces, damage
        cracks that deepen as a cell loses hp so a battered wall LOOKS
        battered before it falls. Only columns in view are walked. ── */
  const mat = v.mat, hp = v.hp;
  const px = Math.max(1, Math.ceil(cell) + 0.5);
  const x0v = Math.max(0, Math.floor(wx(0)) - 1);
  const x1v = Math.min(E.W - 1, Math.ceil(wx(w)) + 1);
  for (let x = x0v; x <= x1v; x++){
    let y = 0;
    const bx = sx(x);
    while (y < E.H){
      const m = mat[y * E.W + x];
      if (!m){ y++; continue; }
      let y2 = y + 1;
      while (y2 < E.H && mat[y2 * E.W + x] === m) y2++;
      const c = MATCOL[m];
      if (c){
        const top = sy(y), bot = sy(y2);
        g.fillStyle = c.a;
        g.fillRect(bx, top, px, bot - top);
        g.fillStyle = c.b;
        g.fillRect(bx + px * 0.55, top, px * 0.45, bot - top);
        /* a top edge highlight so a wall's crown catches the light */
        g.fillStyle = 'rgba(255,255,255,.10)';
        g.fillRect(bx, top, px, Math.max(1, cell * 0.18));
        /* damage: darken + a hairline crack on the topmost cell */
        const full = E.MAT[m] ? E.MAT[m].hp : 0;
        if (full > 0 && full < 60000){
          const dmg = 1 - Math.max(0, Math.min(1, hp[y * E.W + x] / full));
          if (dmg > 0.12){
            g.fillStyle = 'rgba(0,0,0,' + (dmg * 0.5).toFixed(2) + ')';
            g.fillRect(bx, sy(y), px, cell);
            if (dmg > 0.4 && cell > 1.5){
              g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = Math.max(0.6, cell * 0.12);
              g.beginPath();
              g.moveTo(bx + px * 0.3, sy(y));
              g.lineTo(bx + px * 0.55, sy(y) + cell * 0.55);
              g.lineTo(bx + px * 0.4, sy(y) + cell);
              g.stroke();
            }
          }
        }
      }
      y = y2;
    }
  }

  /* NO tower pennants — there are no towers now. The seat colours read off
     the soldiers themselves. */
  /* drawBanner(g, 0, cell); drawBanner(g, 1, cell); */

  /* ── the crew ── */
  for (const sd of v.sides){
    const col = SIDECOL[sd.seat];
    for (const c of sd.crew){
      if (c.wet) continue;
      const cx = sx(c.x), cyFeet = sy(c.y);
      const bw = E.T.CH_W * cell, bh = E.T.CH_H * cell;
      const bx0 = cx - bw / 2, by0 = cyFeet - bh;
      if (!c.alive) g.globalAlpha = 0.4;
      /* a soft ground shadow */
      if (c.alive){
        g.fillStyle = 'rgba(0,0,0,.28)';
        g.beginPath(); g.ellipse(cx, cyFeet, bw * 0.7, bh * 0.12, 0, 0, 6.2832); g.fill();
      }
      g.fillStyle = col.b;
      roundRect(g, bx0, by0, bw, bh, Math.min(bw, bh) * 0.28); g.fill();
      g.fillStyle = col.a;
      roundRect(g, bx0, by0, bw, bh * 0.55, Math.min(bw, bh) * 0.28); g.fill();
      g.fillStyle = '#F2D9B0';
      g.beginPath(); g.arc(cx, by0 - bh * 0.06, bw * 0.42, 0, 6.2832); g.fill();
      g.globalAlpha = 1;
      if (c.alive && cell > 1.2){
        const hw = bw * 1.2, hx = cx - hw / 2, hy = by0 - bh * 0.5;
        g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(hx, hy, hw, 3);
        const f = Math.max(0, Math.min(1, c.hp / E.T.CH_HP));
        g.fillStyle = f > 0.5 ? '#3BE08A' : f > 0.25 ? '#FFC542' : '#FF6B4D';
        g.fillRect(hx, hy, hw * f, 3);
      }
    }
  }

  /* ── DEBRIS (behind the shell, in front of terrain): tumbling chunks
        thrown off a blast, coloured by the material they came from. Still
        inside the clip — chunks flying out of a wall you cannot see would
        draw the wall for you. ── */
  if (M.fx) drawDebris(g, cell);

  g.restore();   /* ══ end of the concealed world content ══ */

  /* ── FOG OF WAR: the enemy half is drawn under a moody drifting haze
        so the player sees a DIM SILHOUETTE of the enemy castle but not
        its exact damage/crew. Shots you land on the enemy side punch
        PERSISTENT crisp holes in the fog (M.reveals) — scouting is how
        you learn their true state. Purely a per-viewer RENDER overlay:
        the engine keeps full state; this never touches the sim. It sits
        UNDER the aim arc / reticle / shell / FX below, so lining up a
        shot stays fully possible through the fog. ── */
  drawFog(g, cell, th, v);

  /* ── LAST-SHOT GRID + HIT MARKER: a subtle coordinate grid and a pin at
        the last shell's landing point, drawn ON TOP of the fog so they are
        always visible. Persists until the next shot updates it. ── */
  drawLastShot(g, cell);

  /* ── THE PLACEMENT OVERLAY: while the castles are being laid out, the
        legal ground and the slots you are dragging, on top of the fog so
        it is never ambiguous where you may put something. ── */
  drawPlacement(g, cell);

  /* ── THE AIM: the sling band, the wind-bent predicted arc, a clear
        landing marker. This is the whole "see where you're shooting". ── */
  if (M.drag && M.preview){
    const p = M.drag;
    g.strokeStyle = 'rgba(255,197,66,.92)';
    g.lineWidth = Math.max(1.6, cell * 0.42); g.lineCap = 'round';
    g.beginPath(); g.moveTo(sx(p.hx), sy(p.hy)); g.lineTo(sx(p.fx), sy(p.fy)); g.stroke();
    /* a small arrow head at the hand pointing the way the shot leaves */
    const pts = M.preview;
    /* the dotted trajectory, fading toward the end so the eye reads
       direction and the landing marker owns the destination */
    g.setLineDash([Math.max(2, cell * 0.7), Math.max(3, cell * 1.1)]);
    g.lineWidth = Math.max(1.4, cell * 0.28);
    for (let i = 2; i < pts.length; i += 2){
      const f = i / pts.length;
      g.strokeStyle = 'rgba(255,255,255,' + (0.7 - f * 0.4).toFixed(2) + ')';
      g.beginPath();
      g.moveTo(sx(pts[i - 2]), sy(pts[i - 1]));
      g.lineTo(sx(pts[i]), sy(pts[i + 1]));
      g.stroke();
    }
    g.setLineDash([]);
    if (pts.length >= 2){
      const ex = pts[pts.length - 2], ey = pts[pts.length - 1];
      const mr = Math.max(4, cell * 1.4);
      /* a BIG target reticle at the predicted landing — this is the whole
         point of aiming into the fog, so make it UNMISTAKABLE: a dark halo
         for contrast on the murk, a bright ring, long gapped crosshair arms
         so the exact impact cell stays clear, and a hot centre dot. */
      const rr = mr * 1.5, sxe = sx(ex), sye = sy(ey);
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = Math.max(3, cell * 0.5);
      g.beginPath(); g.arc(sxe, sye, rr, 0, 6.2832); g.stroke();
      g.strokeStyle = 'rgba(255,120,90,.98)'; g.lineWidth = Math.max(2, cell * 0.34);
      g.beginPath(); g.arc(sxe, sye, rr, 0, 6.2832); g.stroke();
      g.beginPath();
      g.moveTo(sxe - rr * 1.7, sye); g.lineTo(sxe - rr * 0.55, sye);
      g.moveTo(sxe + rr * 0.55, sye); g.lineTo(sxe + rr * 1.7, sye);
      g.moveTo(sxe, sye - rr * 1.7); g.lineTo(sxe, sye - rr * 0.55);
      g.moveTo(sxe, sye + rr * 0.55); g.lineTo(sxe, sye + rr * 1.7);
      g.stroke();
      g.fillStyle = 'rgba(255,235,140,.98)';
      g.beginPath(); g.arc(sxe, sye, Math.max(2, cell * 0.5), 0, 6.2832); g.fill();
    }
  }

  /* ── shockwave rings + particles + the shell, in blast order ── */
  if (M.fx) drawRings(g, cell);

  if (M.anim){
    const a = M.anim, pt = a.pos;
    if (a.trail.length){
      /* a glowing tapered trail */
      for (let i = 2; i < a.trail.length; i += 2){
        const f = i / a.trail.length;
        g.strokeStyle = 'rgba(255,214,140,' + (0.08 + f * 0.4).toFixed(2) + ')';
        g.lineWidth = Math.max(1, cell * 0.3 + f * cell * 0.5);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(sx(a.trail[i - 2]), sy(a.trail[i - 1]));
        g.lineTo(sx(a.trail[i]), sy(a.trail[i + 1]));
        g.stroke();
      }
    }
    if (pt){
      const R = Math.max(2.5, cell * 1.0);
      const gl = g.createRadialGradient(sx(pt[0]), sy(pt[1]), 0, sx(pt[0]), sy(pt[1]), R * 3);
      gl.addColorStop(0, 'rgba(255,220,150,.5)'); gl.addColorStop(1, 'rgba(255,220,150,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(sx(pt[0]), sy(pt[1]), R * 3, 0, 6.2832); g.fill();
      g.fillStyle = '#FFE08A';
      g.beginPath(); g.arc(sx(pt[0]), sy(pt[1]), R, 0, 6.2832); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(sx(pt[0]), sy(pt[1]), R * 0.4, 0, 6.2832); g.fill();
    }
  }

  if (M.fx) drawParticles(g, cell);

  /* ── the muzzle flash + full-screen impact flash, on top of all ── */
  if (M.fx && M.fx.flash > 0.001){
    g.fillStyle = 'rgba(255,240,210,' + (M.fx.flash * 0.5).toFixed(3) + ')';
    g.fillRect(0, 0, w, h);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   FOG OF WAR — a per-LOCAL-viewer render overlay. It hides the OPPONENT
   of whoever is aiming on this phone; it never reads or writes the sim,
   so determinism/economy/online stay byte-identical (the engine keeps
   full state — this only decides what THIS screen paints).

   HOW IT LOOKS
     · the local player's OWN half is CLEAR; the enemy half sits under a
       moody, drifting haze consistent with the dusk/night themes.
     · the fog is TRANSLUCENT, so the enemy castle still reads as a DIM
       SILHOUETTE through it (you can aim at it) — but the murk hides the
       exact damage cracks, crew health bars and terrain detail, so you
       can't just read their condition at a glance.
     · NIGHT map → heavier fog. Reduced motion → a STATIC haze (no drift)
       that still reveals on impact.

   HOW THE REVEALS WORK (shots reveal, and STAY revealed)
     · when a shell LANDS on/near the enemy side, addReveal() records a
       PERSISTENT circular patch (M.reveals) around the impact. Scouting
       shots are rewarded: that patch reads CRISP for the rest of the
       match. At most a very slow, partial regrowth (down to a clarity
       floor) — it never closes back up. Multiple impacts accumulate as
       multiple cleared patches, progressively opening the enemy side.
     · the reveal is derived purely from the boom/splash impact points
       the UI already reads from rep.ev — read-only, no sim change.

   HOW THE HOLES ARE PUNCHED
     · the fog is composited on an OFFSCREEN canvas, then each reveal is
       erased from it with a soft-edged destination-out gradient, then
       the whole layer is drawn over the enemy half. Erasing offscreen
       means the holes cut the FOG only — never the terrain beneath it.
   ═══════════════════════════════════════════════════════════════════ */

/* the vertical line down the middle of the moat that splits "mine" from
   "theirs". Derived from the engine's castle spans, never a magic const. */
function fogMidX(){ return (E.L_X1 + E.R_X0) / 2; }

/* which seat's OPPONENT does this phone's fog hide? Prefer the seat that
   is AIMING right now if it's a local human turn (so pass-the-phone flips
   the fog to the active player each turn); otherwise fall back to the
   seat this phone drives. Solo → 0 (AI's side fogged). Online → M.me
   (opponent fogged). This resolves the local side the SAME way the rest
   of the file does (M.me / M.mine / turnOf). */
function localSide(){
  if (!M) return 0;
  /* M.viewSeat is AUTHORITATIVE and is set at exactly two moments: when a
     match opens (the seat this device holds) and, pass-the-phone, when the
     next player taps through the handover curtain. Deriving it from whose
     turn it is was subtly wrong — apply() flips the turn BEFORE the shell
     has finished flying, so the fog used to swap sides mid-flight on a
     two-humans-one-phone table. One field, set deliberately, cannot. */
  if (M.viewSeat != null) return M.viewSeat | 0;
  const turn = E.turnOf(M.st);
  if (turn >= 0 && M.mine && M.mine.indexOf(turn) >= 0 &&
      M.meta && M.meta[turn] && M.meta[turn].own === 'me'){
    return turn;
  }
  return M.me | 0;
}
/* is `seat` a seat the person now holding this phone plays? */
function ownedHere(seat){
  return !!(M && M.meta && M.meta[seat] && M.meta[seat].own === 'me');
}

/* reveal tuning */
const FOG_REVEAL_MIN_R = 9;    /* cells: smallest crisp patch a hit opens  */
const FOG_REVEAL_SCALE = 2.1;  /* impact radius → reveal radius            */
const FOG_REVEAL_MAX_R = 30;   /* cap so one huge blast doesn't clear all  */
const FOG_MERGE_D      = 6;    /* cells: fold a new hit into a near patch   */
const FOG_REGROW_START = 9000; /* ms before a patch starts its slow fade    */
const FOG_REGROW_SPAN  = 22000;/* ms over which it eases to the floor       */
const FOG_CLARITY_FLOOR= 0.72; /* a scouted patch never dims below this     */

/* the reveals THIS screen is looking through */
function myReveals(){
  if (!M) return [];
  if (!M.revealsBy) M.revealsBy = [[], []];
  return M.revealsBy[localSide()] || [];
}

/* record a PERSISTENT reveal at a world impact for the SHOOTER — but only
   if it landed on the side that is fogged FOR THAT SHOOTER, since their own
   half is already clear to them. The owner is passed in rather than read
   off whose turn it is, because by the time a shell lands the engine has
   already handed the turn over. Nearby hits merge so a barrage doesn't grow
   the list without bound. */
function addReveal(owner, x, y, r){
  if (!M) return;
  if (!M.revealsBy) M.revealsBy = [[], []];
  owner = owner | 0;
  const list = M.revealsBy[owner] || (M.revealsBy[owner] = []);
  const mid = fogMidX();
  /* the enemy side is right of mid for seat 0, left of mid for seat 1 */
  const onEnemy = owner === 0 ? (x > mid) : (x < mid);
  if (!onEnemy) return;
  const rad = clampN((r || 4) * FOG_REVEAL_SCALE, FOG_REVEAL_MIN_R, FOG_REVEAL_MAX_R);
  for (const p of list){
    const dx = p.x - x, dy = p.y - y;
    if (dx * dx + dy * dy <= FOG_MERGE_D * FOG_MERGE_D){
      /* fold in: keep the widest, freshen it so it re-crisps */
      p.x = (p.x + x) / 2; p.y = (p.y + y) / 2;
      p.r = Math.max(p.r, rad); p.born = nowMs();
      return;
    }
  }
  if (list.length > 64) list.shift();  /* hard safety cap */
  list.push({ x, y, r: rad, born: nowMs() });
}

/* open reveals directly from a shot report's impact points — used on the
   reduced-motion / instant path where there is no flight to walk. Mirrors
   the boom/splash/stick classing playFlight uses. */
function revealFromReport(rep){
  if (!rep || !rep.ev) return;
  const owner = rep.seat | 0;
  for (const e of rep.ev){
    if (e.t === 'boom') addReveal(owner, e.x, e.y, e.r || 4);
    else if (e.t === 'splash' || e.t === 'overboard') addReveal(owner, e.x, E.WATER_Y, 3.5);
    else if (e.t === 'stick') addReveal(owner, e.x, e.y, 2.5);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   LAST-SHOT GRID + MARKER — after every shell lands, remember WHERE it
   landed. A subtle coordinate grid and a persistent crosshair/pin at that
   point are drawn ON TOP of the fog so the player can always see exactly
   where their last shot hit and adjust. It updates on the next shot.
   Read-only: the landing point comes from the shot report the UI already
   reads (the last boom, or the shell's rest / a splash), never the sim.
   ═══════════════════════════════════════════════════════════════════ */
function recordLastShot(rep, focus){
  if (!M) return;
  let x = null, y = null, water = false;
  /* prefer the passed focus (the follow path's last boom); else derive the
     landing from the report's events, mirroring the reveal classing. */
  if (focus && focus.x != null){ x = focus.x; y = focus.y; }
  else if (rep && rep.ev){
    for (const e of rep.ev){
      if (e.t === 'boom'){ x = e.x; y = e.y; water = false; }
      else if (e.t === 'splash' || e.t === 'overboard'){ x = e.x; y = E.WATER_Y; water = true; }
      else if (e.t === 'stick' && x == null){ x = e.x; y = e.y; }
    }
  }
  if (x == null) return;
  /* the shooter. The marker is filed under THEIR seat and drawn only when
     the viewer is that seat, so an opponent's pin never hangs on your
     screen after their turn resolves. */
  let seat = (rep && rep.seat != null) ? rep.seat
           : (rep && rep.ev && (rep.ev.find(e => e.t === 'throw') || {}).seat);
  if (seat == null) seat = M.me;
  if (!M.lastShot) M.lastShot = [null, null];
  M.lastShot[seat | 0] = { x, y, water, seat: seat | 0, born: nowMs() };
}
/* the arc / marker THIS screen owns — nobody else's is ever fetched */
function myLastShot(){ return (M && M.lastShot) ? M.lastShot[mySeat()] : null; }
function myLastArc(){  return (M && M.lastArc)  ? M.lastArc[mySeat()]  : null; }

/* a patch's clarity: 1 fresh, easing to a floor after a long time, but it
   never fully closes — scouting stays rewarded. Static (full) under
   reduced motion so a still screen still reads its cleared patches. */
function revealClarity(p){
  if (noMotion()) return 1;
  const age = nowMs() - (p.born || 0);
  if (age <= FOG_REGROW_START) return 1;
  const t = Math.min(1, (age - FOG_REGROW_START) / FOG_REGROW_SPAN);
  return 1 - (1 - FOG_CLARITY_FLOOR) * t;
}

/* ── THE FOG IS NOW OPAQUE, AND THAT IS THE POINT ────────────────────
   It used to be a TRANSLUCENT wash (weight 0.80-0.90 under an 0.98 cap),
   which meant a tenth to a fifth of the enemy castle, its crew and its
   damage cracks came through it. You could read the other side's whole
   condition at a glance, and the scouting shot — the entire loop — was
   worth nothing. So:

     · the wash is painted at alpha 1. Nothing gets through it. The
       "cloud" look is now carried by TONE, not by transparency: a
       lighter muted tint at the top of the bank easing to the base tint
       at the bottom, plus the drifting puffs, all at full opacity.
     · and, belt and braces, the world content on the fogged side is not
       PAINTED in the first place — see clipVisible(). Even if a future
       stop slipped below 1, there would be nothing behind it to show.

   The tone stays exactly where it was: a MUTED MID-DARK haze. The tints
   below are chosen so the composited luma of the fogged half sits in the
   ~54-73 band the last pass settled on — never a blinding white, never a
   pure-black void. Night is the moodiest, quarry the dustiest. */
const FOG_ALPHA_MAX = 1;
function fogWeight(th){
  return 1;                       /* opaque. Concealment is not negotiable. */
}
/* the fog's tint — a MUTED, DESATURATED, MEDIUM-DARK atmospheric haze
   (soft dark-grey / blue-grey smoke, a dusk mist), NOT a pale/white cloud
   and NOT a pure-black void. Each keeps a faint hint of its palette so the
   haze sits in the scene it hangs over. */
function fogTint(th){
  const k = th && th.key;
  if (k === 'night')  return [46, 55, 70];     /* moody blue-slate, darkest  */
  if (k === 'dusk')   return [58, 54, 66];     /* dim mauve-grey dusk mist   */
  if (k === 'quarry') return [60, 62, 66];     /* dusty grey stone haze      */
  return [48, 60, 72];                          /* malta: soft blue-grey mist */
}
/* how much lighter the TOP of the cloud bank reads than its base. A tone
   step, not an alpha step — the wash is opaque all the way down. Small,
   so the whole fogged half stays inside the muted mid-dark band. */
const FOG_TOP_LIFT = 8;
/* the drifting puffs are a tone lift too, and deliberately faint */
const FOG_PUFF_LIFT = [14, 13, 12];
const FOG_PUFF_ALPHA = 0.18;

/* ═══════════════════════════════════════════════════════════════════
   THE CONCEALMENT CLIP — the reason nothing of the enemy gets through.

   Painting the world and then dropping a sheet over it only ever hides
   things as well as the sheet is opaque, and any translucency at all
   leaks the castle, the crew, the damage cracks and the pennants. So the
   fogged half is not painted in the first place: every draw call that
   puts WORLD CONTENT on the canvas — terrain spans, damage cracks, the
   two pennants, crew bodies, their ground shadows, their health bars —
   runs inside this clip.

   The clip is the union of:
     · the LOCAL player's own half of the board, always clear; and
     · every persistent reveal patch this viewer has opened by landing a
       shell over there.
   Built with one rect plus one arc per patch, all wound the same way, so
   canvas's nonzero fill rule unions them. Screen space, rebuilt each
   frame from the camera — no layout read, no allocation beyond the path.

   The consequence is the one the game wanted: over there is genuinely
   unknown, and the ONLY way to learn anything is to put a shell into it.
   ═══════════════════════════════════════════════════════════════════ */
function clipVisible(g){
  if (!M || !UI) return;
  const side = localSide();
  const w = UI.cw, h = UI.ch;
  const midX = sx(fogMidX());
  const cell = cellPx();
  g.beginPath();
  /* the viewer's own half, generously past the frame edge */
  if (side === 0) g.rect(-8, -8, clampN(midX + 8, 0, w + 16), h + 16);
  else            g.rect(clampN(midX, 0, w), -8, w - clampN(midX, 0, w) + 8, h + 16);
  /* every scouted patch, punched back IN */
  for (const p of myReveals()){
    const cx = sx(p.x), cy = sy(p.y);
    const rr = Math.max(6, p.r * cell);
    if (cx + rr < -8 || cx - rr > w + 8 || cy + rr < -8 || cy - rr > h + 8) continue;
    g.moveTo(cx + rr, cy);
    g.arc(cx, cy, rr, 0, 6.2832);
  }
  g.clip();
}

/* the offscreen layer the fog is composited on (so reveals cut the fog,
   not the terrain). Sized to the device-pixel canvas; rebuilt on resize. */
function fogLayer(){
  if (!UI) return null;
  const w = UI.cv ? UI.cv.width : 0, h = UI.cv ? UI.cv.height : 0;
  if (!w || !h) return null;
  let L = UI._fog;
  if (!L){ L = UI._fog = { cv:null, g:null }; }
  if (!L.cv){
    try { L.cv = document.createElement('canvas'); } catch(e){ return null; }
    L.g = L.cv.getContext('2d');
  }
  if (L.cv.width !== w || L.cv.height !== h){ L.cv.width = w; L.cv.height = h; }
  return L;
}

function drawFog(g, cell, th, v){
  if (!M || !UI || !UI.cw || !UI.ch) return;
  const side = localSide();
  const mid = fogMidX();
  const w = UI.cw, h = UI.ch;
  /* the enemy half in SCREEN space (css px), clipped to the field edge. */
  const midX = sx(mid);
  let fx0, fx1;
  if (side === 0){ fx0 = midX; fx1 = w; }   /* enemy is to the right */
  else           { fx0 = 0;    fx1 = midX; }/* enemy is to the left  */
  fx0 = clampN(fx0, 0, w); fx1 = clampN(fx1, 0, w);
  if (fx1 - fx0 < 1) return;                 /* enemy half off-screen */

  const L = fogLayer();
  if (!L){ drawFogSimple(g, th, fx0, fx1, w, h); return; }
  const dpr = UI.dpr || 1;
  const fg = L.g;
  fg.setTransform(dpr, 0, 0, dpr, 0, 0);
  fg.clearRect(0, 0, w, h);

  /* ── build the CLOUD on the offscreen layer. The wash is OPAQUE — the
        concealment is absolute — and the cloud look comes from TONE: a
        slightly lifted tint at the top of the bank easing down to the base
        tint, then soft drifting puffs over it. Nothing here is translucent,
        so nothing behind it can read through. ── */
  const tint = fogTint(th);
  const base = fogWeight(th);
  const rgb = tint[0] + ',' + tint[1] + ',' + tint[2];
  const top = [ Math.min(255, tint[0] + FOG_TOP_LIFT),
                Math.min(255, tint[1] + FOG_TOP_LIFT),
                Math.min(255, tint[2] + FOG_TOP_LIFT) ];
  const topRgb = top[0] + ',' + top[1] + ',' + top[2];
  /* a faint lift for the puff highlights — small, so the haze stays muted
     and mid-dark rather than drifting toward pale */
  const hi = [ Math.min(255, tint[0] + FOG_PUFF_LIFT[0]),
               Math.min(255, tint[1] + FOG_PUFF_LIFT[1]),
               Math.min(255, tint[2] + FOG_PUFF_LIFT[2]) ];
  const hiRgb = hi[0] + ',' + hi[1] + ',' + hi[2];
  /* the concealing wash. EVERY stop is at full alpha; only the colour
     moves, so the bank has depth without a single see-through pixel. */
  const a1 = Math.min(FOG_ALPHA_MAX, base).toFixed(3);
  const grad = fg.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0,   'rgba(' + topRgb + ',' + a1 + ')');
  grad.addColorStop(0.45,'rgba(' + rgb + ',' + a1 + ')');
  grad.addColorStop(1,   'rgba(' + rgb + ',' + a1 + ')');
  fg.fillStyle = grad;
  fg.fillRect(fx0, 0, fx1 - fx0, h);

  /* ── drifting cloud puffs: brighter soft blobs that give the wash a
        billowing, cloud-like body and motion (static under reduced motion).
        Deterministic-free decoration; never touches the sim. ── */
  const still = noMotion();
  const t = still ? 0 : nowMs() / 1000;
  const spanW = fx1 - fx0;
  const blob = Math.max(60, cell * 26);
  fg.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 9; i++){
    const ph = i * 1.7;
    const drift = still ? 0 : Math.sin(t * 0.18 + ph) * blob * 0.6;
    const bob   = still ? 0 : Math.cos(t * 0.13 + ph * 1.3) * blob * 0.28;
    const bx = fx0 + (spanW * ((i * 0.31 + 0.08) % 1)) + drift;
    const by = h * (0.14 + 0.66 * ((i * 0.23 + 0.1) % 1)) + bob;
    const br = blob * (1.2 + (i % 3) * 0.45);
    const gl = fg.createRadialGradient(bx, by, 0, bx, by, br);
    /* soft-edged puffs — kept faint so the haze reads as moody atmosphere
       and the average luminance stays comfortably mid-dark (not pale) */
    const a = Math.min(FOG_PUFF_ALPHA, 0.10 + (i % 3) * 0.04);
    gl.addColorStop(0,   'rgba(' + hiRgb + ',' + a.toFixed(3) + ')');
    gl.addColorStop(0.5, 'rgba(' + hiRgb + ',' + (a * 0.5).toFixed(3) + ')');
    gl.addColorStop(1,   'rgba(' + hiRgb + ',0)');
    fg.fillStyle = gl;
    fg.beginPath(); fg.arc(bx, by, br, 0, 6.2832); fg.fill();
  }

  /* ── punch the PERSISTENT reveal holes: soft destination-out gradients
        so a scouted patch reads crisp, with a feathered edge that eases
        back into the haze. Clarity controls how fully it's cleared. ── */
  const rev = myReveals();
  if (rev.length){
    fg.globalCompositeOperation = 'destination-out';
    for (const p of rev){
      const cx = sx(p.x), cy = sy(p.y);
      const rr = Math.max(6, p.r * cell);
      const clar = revealClarity(p);
      const gl = fg.createRadialGradient(cx, cy, 0, cx, cy, rr);
      /* HOLD the erase at full clarity across most of the patch and feather
         only the last quarter. A scouting shot has to be WORTH taking: the
         old gradient started fading at 0.62 of the radius and was barely
         half cut by 0.8, so the window you paid a turn for showed a smear
         rather than the castle. Now the core — comfortably wider than the
         blast that opened it — is genuinely clear, and only the rim eases
         back into the murk so the hole does not read as a cut-out disc. */
      gl.addColorStop(0,    'rgba(0,0,0,' + clar.toFixed(3) + ')');
      gl.addColorStop(0.74, 'rgba(0,0,0,' + clar.toFixed(3) + ')');
      gl.addColorStop(0.88, 'rgba(0,0,0,' + (clar * 0.62).toFixed(3) + ')');
      gl.addColorStop(1,    'rgba(0,0,0,0)');
      fg.fillStyle = gl;
      fg.beginPath(); fg.arc(cx, cy, rr, 0, 6.2832); fg.fill();
    }
    fg.globalCompositeOperation = 'source-over';
  }

  /* ── composite the finished fog layer over the field. The layer is in
        device pixels; draw it back at CSS size with the identity map. ── */
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(L.cv, 0, 0);
  g.restore();
}

/* a no-offscreen fallback (older canvas): a flat translucent wash over the
   enemy half with the reveals as lighter cut-outs. Still reveals on hit. */
function drawFogSimple(g, th, fx0, fx1, w, h){
  const tint = fogTint(th), base = fogWeight(th);
  g.save();
  g.beginPath(); g.rect(fx0, 0, fx1 - fx0, h); g.clip();
  g.fillStyle = 'rgba(' + tint[0] + ',' + tint[1] + ',' + tint[2] + ',' + base.toFixed(3) + ')';
  g.fillRect(fx0, 0, fx1 - fx0, h);
  {
    for (const p of myReveals()){
      const cx = sx(p.x), cy = sy(p.y), rr = Math.max(6, p.r * cellPx());
      const clar = revealClarity(p);
      const gl = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
      gl.addColorStop(0, 'rgba(' + tint[0] + ',' + tint[1] + ',' + tint[2] + ',0)');
      gl.addColorStop(1, 'rgba(' + tint[0] + ',' + tint[1] + ',' + tint[2] + ',' + (base * clar).toFixed(3) + ')');
      /* draw the map through the hole by lightening the wash there */
      g.globalCompositeOperation = 'destination-out';
      const gl2 = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
      gl2.addColorStop(0,    'rgba(0,0,0,' + clar.toFixed(3) + ')');
      gl2.addColorStop(0.74, 'rgba(0,0,0,' + clar.toFixed(3) + ')');
      gl2.addColorStop(1,    'rgba(0,0,0,0)');
      g.fillStyle = gl2; g.beginPath(); g.arc(cx, cy, rr, 0, 6.2832); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
  }
  g.restore();
}

/* ── the last-shot grid + hit marker. The grid is a light coordinate
     lattice over the whole battlefield (drawn only where in view); the
     marker is a crosshair/pin at the last landing point, with a small
     distance label so the player can read and adjust their aim. ── */
const GRID_STEP = 20;   /* cells between grid lines (10 columns × 5 rows)   */

/* ── THE PERSISTENT AIM LINE — the arc the LAST shell actually flew, left
     HANGING IN THE AIR after the shot resolves so the player can see the
     path their shot took and adjust the next one. It stays until the next
     shot replaces M.lastArc. Drawn ON TOP of the fog (called from
     drawLastShot). Read-only: the points are the engine's own track. ── */
function drawLastArc(g, cell, arc){
  const pts = arc.pts;
  /* it is always the viewer's own arc — myLastArc() never hands over
     anybody else's — so it is always the local tint */
  const col = '95,200,255';
  g.save();
  /* a soft dark under-stroke so the line reads over both clear ground and
     the muted fog, then the tinted arc on top, then dashes for a "trace" */
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = 'rgba(0,0,0,.45)';
  g.lineWidth = Math.max(2, cell * 0.5);
  g.beginPath();
  g.moveTo(sx(pts[0]), sy(pts[1]));
  for (let i = 2; i < pts.length; i += 2) g.lineTo(sx(pts[i]), sy(pts[i + 1]));
  g.stroke();
  g.strokeStyle = 'rgba(' + col + ',.9)';
  g.lineWidth = Math.max(1.4, cell * 0.3);
  g.setLineDash([Math.max(3, cell * 1.1), Math.max(3, cell * 0.9)]);
  g.beginPath();
  g.moveTo(sx(pts[0]), sy(pts[1]));
  for (let i = 2; i < pts.length; i += 2) g.lineTo(sx(pts[i]), sy(pts[i + 1]));
  g.stroke();
  g.setLineDash([]);
  /* a small launch pip at the hand end so the origin of the shot is clear */
  g.fillStyle = 'rgba(' + col + ',.95)';
  g.beginPath(); g.arc(sx(pts[0]), sy(pts[1]), Math.max(1.6, cell * 0.42), 0, 6.2832); g.fill();
  g.restore();
}

function drawLastShot(g, cell){
  /* ONLY THE VIEWER'S OWN SHOT. The arc, the grid and the pin are filed
     per seat and fetched for THIS seat, so the opponent's trail is never
     left hanging after their turn resolves — their shell still animates
     in flight as it happens, and then it is gone. Yours stays, which is
     the one you need in order to adjust. */
  const arc = myLastArc();
  /* the persistent aim ARC hangs in the air on its own (it may be present
     before a marker exists on odd paths); draw it first so a marker/pin
     lands on top of it. */
  if (arc && arc.pts && arc.pts.length >= 4) drawLastArc(g, cell, arc);
  const ls = myLastShot();
  if (!ls) return;
  const w = UI.cw, h = UI.ch;
  /* ── the coordinate grid: faint lines on 20-cell spacing, only the ones
        that fall inside the viewport are stroked. ── */
  g.save();
  g.strokeStyle = 'rgba(255,255,255,.14)';
  g.lineWidth = 1;
  g.beginPath();
  for (let gx = 0; gx <= E.W; gx += GRID_STEP){
    const X = sx(gx);
    if (X < -2 || X > w + 2) continue;
    g.moveTo(X, 0); g.lineTo(X, h);
  }
  for (let gy = 0; gy <= E.H; gy += GRID_STEP){
    const Y = sy(gy);
    if (Y < -2 || Y > h + 2) continue;
    g.moveTo(0, Y); g.lineTo(w, Y);
  }
  g.stroke();
  g.restore();

  /* ── the marker: a crosshair ring + pin at YOUR landing point, with a
        distance-from-your-hand label. ── */
  const mx = sx(ls.x), my = sy(ls.y);
  const col = ls.water ? '120,190,255' : '95,200,255';
  const r = Math.max(6, cell * 1.6);
  g.save();
  /* a soft halo so it reads over both clear and fogged ground */
  const halo = g.createRadialGradient(mx, my, 0, mx, my, r * 2.2);
  halo.addColorStop(0, 'rgba(' + col + ',.35)');
  halo.addColorStop(1, 'rgba(' + col + ',0)');
  g.fillStyle = halo;
  g.beginPath(); g.arc(mx, my, r * 2.2, 0, 6.2832); g.fill();
  /* the crosshair ring */
  g.strokeStyle = 'rgba(' + col + ',.95)';
  g.lineWidth = Math.max(1.4, cell * 0.3);
  g.beginPath(); g.arc(mx, my, r, 0, 6.2832); g.stroke();
  g.beginPath();
  g.moveTo(mx - r * 1.6, my); g.lineTo(mx - r * 0.5, my);
  g.moveTo(mx + r * 0.5, my); g.lineTo(mx + r * 1.6, my);
  g.moveTo(mx, my - r * 1.6); g.lineTo(mx, my - r * 0.5);
  g.moveTo(mx, my + r * 0.5); g.lineTo(mx, my + r * 1.6);
  g.stroke();
  /* the centre dot */
  g.fillStyle = 'rgba(' + col + ',.95)';
  g.beginPath(); g.arc(mx, my, Math.max(1.5, cell * 0.42), 0, 6.2832); g.fill();
  /* a small "LAST" label above the pin, with the range from your hand */
  const hand = handOf(mySeat());
  let label = T('LAST', 'L-AĦĦAR');
  if (hand){
    const d = Math.round(Math.hypot(ls.x - hand.x, ls.y - hand.y));
    label += '  ' + d;
  }
  const fs = Math.max(9, Math.min(13, cell * 2.2));
  g.font = '900 ' + fs + 'px var(--disp,sans-serif)';
  g.textAlign = 'center'; g.textBaseline = 'bottom';
  const ly = my - r * 1.9;
  const tw = g.measureText(label).width;
  g.fillStyle = 'rgba(10,14,22,.78)';
  roundRect(g, mx - tw / 2 - 5, ly - fs - 4, tw + 10, fs + 6, 5); g.fill();
  g.fillStyle = 'rgba(' + col + ',1)';
  g.fillText(label, mx, ly - 1);
  g.restore();
}

/* ── the parallax skyline: a repeating jagged silhouette + a couple of
     landmarks, offset by a fraction of the camera so distant things
     drift slower than the battlefield. Deterministic-free (decoration
     only), so it never touches the sim. ── */
function drawSkyline(g, th, v){
  const cam = M.cam; const cell = cellPx();
  const horizon = sy(E.GROUND_Y - 2);
  /* parallax: shift by a fraction of how far the camera has panned from
     centre. A pure screen offset — cheap. */
  const par = (cam.x - E.W / 2) * cellPx() * -0.35;
  g.save();
  g.translate(par, 0);
  g.fillStyle = th.hill;
  const baseY = horizon;
  const spanL = sx(-40), spanR = sx(E.W + 40);
  const step = Math.max(14, cell * 6);
  g.beginPath(); g.moveTo(spanL, baseY);
  let seed = 1337;
  for (let X = spanL; X <= spanR; X += step){
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const hgt = (seed % 1000) / 1000 * cell * 10 + cell * 4;
    g.lineTo(X, baseY - hgt);
    g.lineTo(X + step / 2, baseY - hgt * 0.7);
  }
  g.lineTo(spanR, baseY); g.closePath(); g.fill();
  /* a single landmark: a dome or a chimney, themed */
  if (th.landmark === 'dome'){
    const lx = sx(E.W * 0.5), ly = baseY - cell * 12;
    g.fillStyle = th.hill2 || th.hill;
    g.beginPath(); g.arc(lx, ly, cell * 5, Math.PI, 0); g.fill();
    g.fillRect(lx - cell * 5, ly, cell * 10, cell * 12);
  } else if (th.landmark === 'crane'){
    const lx = sx(E.W * 0.32), ly = baseY;
    g.strokeStyle = th.hill2 || th.hill; g.lineWidth = Math.max(1.5, cell * 0.4);
    g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx, ly - cell * 22);
    g.lineTo(lx + cell * 14, ly - cell * 20); g.stroke();
  }
  g.restore();
}

function drawBanner(g, seat, cell){
  /* find the tower top: highest solid cell in the middle of the TOWER
     SLOT — read off the seat's own chosen layout, so a keep the player
     set back carries its pennant back with it instead of leaving the flag
     planted where the tower used to be */
  const st = M.st, col = SIDECOL[seat], flip = seat === 1;
  const sp = E.slotSpanIn(st, seat, 1);
  let topY = E.GROUND_Y, tx = (sp.x0 + sp.x1) >> 1;
  for (let y = 0; y < E.GROUND_Y; y++){
    if (E.solidAt(st, tx, y)){ topY = y; break; }
  }
  const bx = sx(tx + 0.5), by = sy(topY);
  if (by < -20 || by > UI.ch + 20) return;
  g.strokeStyle = 'rgba(20,16,10,.7)'; g.lineWidth = Math.max(1, cell * 0.22);
  g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, by - cell * 4); g.stroke();
  g.fillStyle = col.flag;
  const fw = cell * 3.4 * (flip ? -1 : 1);
  g.beginPath();
  g.moveTo(bx, by - cell * 4);
  g.lineTo(bx + fw, by - cell * 3.3);
  g.lineTo(bx, by - cell * 2.6);
  g.closePath(); g.fill();
}

function roundRect(g, x, y, w, h, r){
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* ═══════════════════════════════════════════════════════════════════
   THE BATTLEFIELD THEMES — each map variant paints a different place.
   These are DECORATION ONLY: sky/sea colours, a far skyline, a landmark.
   They NEVER touch the engine's world (which is (seed,opts)), so two
   phones on the same theme paint the same picture and the SIM is
   untouched. Terrain-shape variety comes from the seed the engine
   builds from; the theme dresses the frame around it.
   ═══════════════════════════════════════════════════════════════════ */
const THEMES = {
  malta: { key:'malta',
    name:{ en:'Grand Harbour', mt:'Il-Port il-Kbir' },
    sky0:'#2C5A7C', sky1:'#183042', sky2:'#0A1420',
    sea0:'rgba(60,150,190,.55)', sea1:'rgba(20,70,110,.9)',
    hill:'#12222F', hill2:'#1B3346', landmark:'dome',
    glow:'rgba(255,196,120,.28)', glowX:E.W*0.5 },
  dusk: { key:'dusk',
    name:{ en:'Festa Dusk', mt:'Għabex tal-Festa' },
    sky0:'#B8546A', sky1:'#5A3355', sky2:'#1C1730',
    sea0:'rgba(150,90,140,.5)', sea1:'rgba(40,30,70,.92)',
    hill:'#241830', hill2:'#3A2447', landmark:'dome',
    glow:'rgba(255,150,90,.4)', glowX:E.W*0.72 },
  quarry: { key:'quarry',
    name:{ en:'The Quarry', mt:'Il-Barriera' },
    sky0:'#8C9AA0', sky1:'#5E676C', sky2:'#2A2E30',
    sea0:'rgba(120,140,150,.4)', sea1:'rgba(45,55,60,.9)',
    hill:'#3A3E40', hill2:'#4E5457', landmark:'crane',
    glow:'rgba(255,255,240,.14)', glowX:E.W*0.4 },
  night: { key:'night',
    name:{ en:'Siege by Night', mt:'Assedju bil-Lejl' },
    sky0:'#122038', sky1:'#0B1526', sky2:'#05080F',
    sea0:'rgba(40,80,130,.45)', sea1:'rgba(10,25,50,.94)',
    hill:'#0A1020', hill2:'#141F38', landmark:'dome',
    glow:'rgba(150,190,255,.16)', glowX:E.W*0.6 }
};
const THEME_LIST = ['malta', 'dusk', 'quarry', 'night'];

/* ═══════════════════════════════════════════════════════════════════
   THE BATTLEFIELDS (map variants) — a distinct place AND a distinct
   set of rules for each, surfaced in the AI setup and, online, through
   the lobby's variants/currentVariant/applyVariant contract (following
   klabb and cards2131). Each is:
     · a THEME (sky/sea/skyline — decoration, never the sim)
     · a starting PURSE (engine opt — part of the match tuple)
     · a weapon SET (engine opt `own` — likewise)
   The terrain SHAPE still varies by seed; the variant dresses and
   balances the fight around it without a single engine change, so the
   determinism, economy and online guarantees are untouched.

   `own` is a per-weapon starting ammo array over E.WEAPONS. -1/ammo is
   normalised by the engine's normLoadout (tier-0 is always unlimited).
   ═══════════════════════════════════════════════════════════════════ */
function loadout(spec){
  /* spec: 'all' | 'starter' | array of ammo. Returns an ammo array. */
  if (Array.isArray(spec)) return spec.slice();
  return E.WEAPONS.map(w => {
    if (spec === 'starter') return w.tier === 0 ? w.ammo : 0;
    if (spec === 'heavy')   return w.tier >= 3 ? Math.max(2, w.ammo) : (w.tier === 0 ? w.ammo : 0);
    return w.ammo;   /* 'all' */
  });
}
const VARIANTS = {
  malta: { key:'malta', theme:'malta', purse:260, own:null,
    name:{ en:'Grand Harbour', mt:'Il-Port il-Kbir' },
    note:{ en:'The classic duel. Standard purse, full armoury.',
           mt:'Id-duell klassiku. Purse standard, armerija sħiħa.' } },
  dusk: { key:'dusk', theme:'dusk', purse:420, own:null,
    name:{ en:'Festa Dusk', mt:'Għabex tal-Festa' },
    note:{ en:'Deep pockets. Buy big early and go loud.',
           mt:'But mimli. Ixtri kbir kmieni u agħmel ħoss.' } },
  quarry: { key:'quarry', theme:'quarry', purse:180, own:loadout('starter'),
    name:{ en:'The Quarry', mt:'Il-Barriera' },
    note:{ en:'Lean start. Earn your armoury the hard way.',
           mt:'Bidu fqir. Aqla’ l-armerija bit-tbatija.' } },
  night: { key:'night', theme:'night', purse:300, own:loadout('heavy'),
    name:{ en:'Siege by Night', mt:'Assedju bil-Lejl' },
    note:{ en:'Heavy ordnance only. Nothing subtle survives the dark.',
           mt:'Armi tqal biss. Xejn fin ma jgħix fid-dlam.' } }
};
const VARIANT_LIST = ['malta', 'dusk', 'quarry', 'night'];

/* ═══════════════════════════════════════════════════════════════════
   THE DESTRUCTION FX — the juice. When a shell lands the engine has
   ALREADY resolved the world (apply() returns the report with the boom
   points, the cover it broke, the crew it hurt, what went overboard).
   None of the following is simulation: it is a short-lived particle
   system that DRESSES the reported impact — chunks that fly off, dirt
   and smoke, sparks, a shockwave ring, a screen flash and a camera
   shake scaled to the blast. It runs on its own rAF, hard-caps every
   pool, and is entirely skipped under reduced motion (the world still
   updates instantly — the game is fully playable without a single
   particle). Math.random here is fine: it never feeds the engine.
   ═══════════════════════════════════════════════════════════════════ */
const FX_CAP = { debris:110, particles:200, rings:10 };
/* the crate the soldiers float on — splinter tints for a box shatter */
const SPLINTER_COLS = ['#C79A5B', '#a87f47', '#7E5626', '#8d6a3c', '#d8b077'];
function initFx(){
  return { debris:[], particles:[], rings:[], shake:0, shakeMax:0, flash:0,
           raf:0, last:0, running:false };
}
function rr(a, b){ return a + Math.random() * (b - a); }

/* spawn the whole impact bundle for one boom. `power` scales everything;
   `matCol` tints the chunks to what actually broke there. */
function spawnImpact(wx, wy, radius, power, opts){
  if (noMotion() || !M) return;
  if (!M.fx) M.fx = initFx();
  const fx = M.fx;
  const big = radius >= 7;
  opts = opts || {};
  /* the shockwave ring — big blasts get a second, hotter, slower ring
     underneath so the boom reads as a FIREBALL, not just an outline */
  if (fx.rings.length < FX_CAP.rings)
    fx.rings.push({ x:wx, y:wy, r0:radius * 0.35, r1:radius * (1.6 + power * 0.5),
                    born:nowMs(), life:big ? 520 : 340,
                    col: opts.water ? '180,220,255' : '255,170,80' });
  if (big && !opts.water && fx.rings.length < FX_CAP.rings)
    fx.rings.push({ x:wx, y:wy, r0:radius * 0.2, r1:radius * 2.3,
                    born:nowMs(), life:680, col:'255,120,40' });
  /* the flash */
  fx.flash = Math.min(1, fx.flash + (big ? 0.9 : 0.4));
  /* the camera shake, scaled and clamped — the biggest booms kick harder */
  const s = Math.min(big ? 5.2 : 4.2, radius * 0.4 + power * 1.4);
  fx.shake = Math.max(fx.shake, s); fx.shakeMax = Math.max(fx.shakeMax, s);
  /* chunks: tumbling squares that arc out and settle. Count scales with
     the blast but is hard-capped. */
  const nChunks = Math.min(FX_CAP.debris - fx.debris.length,
                           Math.round(radius * (big ? 2.2 : 1.6) + power * 4));
  const cols = opts.cols && opts.cols.length ? opts.cols : ['#8a6a3a', '#6b5330', '#5a4726'];
  for (let i = 0; i < nChunks; i++){
    const ang = rr(-Math.PI, 0) - (Math.random() < 0.5 ? 0 : Math.PI); /* mostly up/out */
    const sp = rr(0.6, 2.4) * (0.8 + power * 0.4);
    fx.debris.push({
      x:wx, y:wy,
      vx:Math.cos(ang) * sp * rr(0.6, 1.4),
      vy:-Math.abs(Math.sin(ang)) * sp * rr(1.0, 1.8) - rr(0.4, 1.2),
      sz:rr(0.7, 2.1), rot:rr(0, 6.28), vr:rr(-0.4, 0.4),
      col:cols[(Math.random() * cols.length) | 0], life:1, born:nowMs(), settle:0
    });
  }
  /* BOX SHATTER: long wooden SPLINTERS torn off the crate — elongated
     shards that spin fast and fly hard, so a hit box reads as blown to
     bits, not merely removed. opts.splinters is set by playFlight when
     the boom landed on/near a soldier's crate. */
  const nSpl = Math.min(FX_CAP.debris - fx.debris.length, opts.splinters | 0);
  for (let i = 0; i < nSpl; i++){
    const ang = rr(-2.9, -0.25);            /* fan upward and outward */
    const sp = rr(1.2, 3.2) * (0.9 + power * 0.4);
    fx.debris.push({
      x:wx, y:wy,
      vx:Math.cos(ang) * sp,
      vy:Math.sin(ang) * sp - rr(0.5, 1.6),
      sz:0, shard:1, len:rr(1.1, 2.6), wid:rr(0.22, 0.5),
      rot:rr(0, 6.28), vr:rr(-0.9, 0.9),
      col:SPLINTER_COLS[(Math.random() * SPLINTER_COLS.length) | 0],
      life:1, born:nowMs(), settle:0
    });
  }
  /* dirt/smoke puffs + sparks */
  const nP = Math.min(FX_CAP.particles - fx.particles.length,
                      Math.round(radius * 2.2 + power * 6));
  for (let i = 0; i < nP; i++){
    const spark = !opts.water && Math.random() < 0.35;
    const ang = rr(0, 6.283);
    const sp = rr(0.3, spark ? 3.0 : 1.4) * (0.7 + power * 0.3);
    fx.particles.push({
      x:wx, y:wy, vx:Math.cos(ang) * sp, vy:Math.sin(ang) * sp - rr(0.2, 1.0),
      r:spark ? rr(0.3, 0.7) : rr(0.9, 2.6), born:nowMs(),
      life:spark ? rr(180, 340) : rr(420, 820),
      kind: opts.water ? 'water' : spark ? 'spark' : 'smoke'
    });
  }
  /* the BIG-BLAST dressing: a swelling fireball core, glowing embers
     that arc and gutter out, and a few tall lingering smoke columns.
     Small taps get none of this, so ammo classes read differently. */
  if (big && !opts.water){
    let room = FX_CAP.particles - fx.particles.length;
    const nFire = Math.min(room, 6); room -= nFire;
    for (let i = 0; i < nFire; i++){
      const ang = rr(0, 6.283), sp = rr(0.1, 0.6);
      fx.particles.push({ x:wx + rr(-1, 1), y:wy + rr(-1, 1),
        vx:Math.cos(ang) * sp, vy:Math.sin(ang) * sp - rr(0.1, 0.4),
        r:rr(1.4, 2.6), born:nowMs(), life:rr(260, 440), kind:'fire' });
    }
    const nEm = Math.min(room, Math.round(radius * 1.6)); room -= nEm;
    for (let i = 0; i < nEm; i++){
      const ang = rr(-3.0, -0.15), sp = rr(1.2, 3.4);
      fx.particles.push({ x:wx, y:wy, vx:Math.cos(ang) * sp,
        vy:Math.sin(ang) * sp - rr(0.3, 1.0),
        r:rr(0.25, 0.55), born:nowMs(), life:rr(480, 950), kind:'ember' });
    }
    const nSm = Math.min(room, 4);
    for (let i = 0; i < nSm; i++){
      fx.particles.push({ x:wx + rr(-2, 2), y:wy + rr(-1.5, 0.5),
        vx:rr(-0.15, 0.15), vy:-rr(0.2, 0.55),
        r:rr(2.4, 4.0), born:nowMs(), life:rr(900, 1500), kind:'smoke' });
    }
  }
  startFx();
}

/* THE SPLASH — the money moment: a soldier (or shell) hits the sea. A
   tall white water column erupts, droplets fan out and rain back in,
   foam blooms at the base and flat ripple rings run out across the
   surface at E.WATER_Y. `big` marks a soldier going OVERBOARD, which
   gets the full geyser. Draw-only, capped, skipped under reduced motion. */
function spawnSplash(wx, scale, big){
  if (noMotion() || !M) return;
  if (!M.fx) M.fx = initFx();
  const fx = M.fx, wy = E.WATER_Y;
  /* flat ripple rings racing out on the surface */
  if (fx.rings.length < FX_CAP.rings)
    fx.rings.push({ x:wx, y:wy, r0:scale * 0.4, r1:scale * (big ? 3.2 : 2.2),
                    born:nowMs(), life:big ? 700 : 480, col:'190,230,255', flat:true });
  if (big && fx.rings.length < FX_CAP.rings)
    fx.rings.push({ x:wx, y:wy, r0:scale * 0.2, r1:scale * 1.8,
                    born:nowMs(), life:520, col:'235,250,255', flat:true });
  let room = FX_CAP.particles - fx.particles.length;
  /* the white column: near-vertical jets that climb tall then rain back */
  const nCol = Math.min(room, big ? 20 : 12); room -= nCol;
  for (let i = 0; i < nCol; i++){
    fx.particles.push({
      x:wx + rr(-0.6, 0.6) * scale * 0.3, y:wy,
      vx:rr(-0.4, 0.4), vy:-rr(1.9, 4.0) * (big ? 1.35 : 0.95),
      r:rr(0.9, 2.2), born:nowMs(), life:rr(560, 1050), kind:'plume'
    });
  }
  /* scattered droplets fanning wider */
  const nDrop = Math.min(room, big ? 14 : 8); room -= nDrop;
  for (let i = 0; i < nDrop; i++){
    const ang = rr(-2.8, -0.35), sp = rr(0.8, 2.6);
    fx.particles.push({ x:wx, y:wy, vx:Math.cos(ang) * sp,
      vy:Math.sin(ang) * sp - rr(0.2, 0.8),
      r:rr(0.3, 0.8), born:nowMs(), life:rr(380, 720), kind:'water' });
  }
  /* foam blooming at the base */
  const nFoam = Math.min(room, big ? 5 : 3);
  for (let i = 0; i < nFoam; i++){
    fx.particles.push({ x:wx + rr(-1, 1) * scale * 0.3, y:wy,
      vx:rr(-0.1, 0.1), vy:0,
      r:rr(0.9, 1.8), born:nowMs(), life:rr(420, 680), kind:'foam' });
  }
  fx.shake = Math.max(fx.shake, big ? 2.6 : 1.1);
  fx.shakeMax = Math.max(fx.shakeMax, fx.shake);
  if (big) fx.flash = Math.min(1, fx.flash + 0.25);
  startFx();
}

/* launch a person-sized puff when a crew member is knocked flying, so a
   direct hit reads as a body being thrown, not a number changing */
function spawnKnock(wx, wy, col){
  if (noMotion() || !M) return;
  if (!M.fx) M.fx = initFx();
  const fx = M.fx;
  const n = Math.min(FX_CAP.particles - fx.particles.length, 10);
  for (let i = 0; i < n; i++){
    const ang = rr(-Math.PI, 0);
    const sp = rr(0.6, 1.8);
    fx.particles.push({ x:wx, y:wy, vx:Math.cos(ang) * sp, vy:Math.sin(ang) * sp,
      r:rr(0.8, 1.8), born:nowMs(), life:rr(300, 560), kind:'dust' });
  }
  /* DIRECT HIT punch: a hard white pop ring, a violent star of sparks,
     a flash spike and a sharp short shake, so a body-shot lands with
     real weight */
  if (fx.rings.length < FX_CAP.rings)
    fx.rings.push({ x:wx, y:wy, r0:0.4, r1:3.4, born:nowMs(), life:260,
                    col:'255,255,255' });
  const nSp = Math.min(FX_CAP.particles - fx.particles.length, 8);
  for (let i = 0; i < nSp; i++){
    const ang = rr(0, 6.283), sp = rr(1.4, 3.2);
    fx.particles.push({ x:wx, y:wy, vx:Math.cos(ang) * sp, vy:Math.sin(ang) * sp,
      r:rr(0.3, 0.6), born:nowMs(), life:rr(160, 320), kind:'spark' });
  }
  fx.flash = Math.min(1, fx.flash + 0.3);
  fx.shake = Math.max(fx.shake, 2.4);
  fx.shakeMax = Math.max(fx.shakeMax, fx.shake);
  startFx();
}

function startFx(){
  const fx = M && M.fx; if (!fx || fx.running) return;
  fx.running = true; fx.last = nowMs();
  const loop = () => {
    if (!M || M.dead || !M.fx){ return; }
    const now = nowMs(); const dt = Math.min(0.05, (now - M.fx.last) / 1000); M.fx.last = now;
    const alive = stepFx(dt);
    /* the camera shake decays here and is written to UI as a screen
       offset — it is applied in sx/sy via UI.camShX/Y, so it costs
       nothing but two adds per drawn point. */
    const sh = M.fx.shake;
    if (sh > 0.02){
      UI.camShX = (Math.random() * 2 - 1) * sh * cellPx();
      UI.camShY = (Math.random() * 2 - 1) * sh * cellPx();
    } else { UI.camShX = 0; UI.camShY = 0; }
    draw();
    if (alive || M.anim){ M.fx.raf = requestAnimationFrame(loop); }
    else { M.fx.running = false; M.fx.raf = 0; UI.camShX = 0; UI.camShY = 0; draw(); }
  };
  fx.raf = requestAnimationFrame(loop);
}

function stepFx(dt){
  const fx = M.fx; if (!fx) return false;
  const G = 0.06, f = dt * 60;   /* frame-normalised gravity for the puffs */
  const wy = E.WATER_Y;
  /* debris physics: gravity, a bounce off the ground/water surface, then
     settle. Cheap Euler; capped lifetime. */
  for (let i = fx.debris.length - 1; i >= 0; i--){
    const d = fx.debris[i];
    if (d.settle){ if (nowMs() - d.settleAt > 900) fx.debris.splice(i, 1); continue; }
    d.vy += G * f; d.x += d.vx * f; d.y += d.vy * f; d.rot += d.vr * f;
    /* the ground under this column */
    const gy = groundScreenY(d.x);
    if (d.y >= gy){
      if (gy >= wy - 0.5){
        /* into the moat — a little plink of spray where it lands */
        if (fx.particles.length < FX_CAP.particles)
          fx.particles.push({ x:d.x, y:wy, vx:rr(-0.3, 0.3), vy:-rr(0.4, 1.1),
            r:rr(0.3, 0.7), born:nowMs(), life:rr(220, 420), kind:'water' });
        fx.debris.splice(i, 1); continue;
      }
      d.y = gy; d.vy *= -0.34; d.vx *= 0.55; d.vr *= 0.5;
      if (Math.abs(d.vy) < 0.25){ d.settle = 1; d.settleAt = nowMs(); }
    }
    if (d.y > E.H + 4) fx.debris.splice(i, 1);
  }
  /* particles */
  for (let i = fx.particles.length - 1; i >= 0; i--){
    const p = fx.particles[i];
    const age = nowMs() - p.born;
    if (age > p.life){ fx.particles.splice(i, 1); continue; }
    if (p.kind === 'smoke' || p.kind === 'dust'){ p.vy -= 0.006 * f; p.vx *= 0.98; p.r += 0.03 * f; }
    else if (p.kind === 'fire'){ p.r += 0.1 * f; p.vy -= 0.01 * f; p.vx *= 0.96; }
    else if (p.kind === 'foam'){ p.r += 0.045 * f; p.vx *= 0.9; }
    else if (p.kind === 'ember'){ p.vy += G * 0.8 * f; p.vx *= 0.99; }
    else if (p.kind === 'plume'){ p.vy += G * 1.15 * f; p.vx *= 0.985; }
    else { p.vy += G * f; }
    p.x += p.vx * f; p.y += p.vy * f;
    /* water bits vanish when they fall back under the surface */
    if ((p.kind === 'plume' || p.kind === 'water') && p.vy > 0 && p.y > wy + 0.5)
      fx.particles.splice(i, 1);
  }
  /* rings just age out (drawn by drawRings) */
  const now = nowMs();
  for (let i = fx.rings.length - 1; i >= 0; i--){
    if (now - fx.rings[i].born > fx.rings[i].life) fx.rings.splice(i, 1);
  }
  /* shake + flash decay */
  fx.shake *= Math.pow(0.001, dt); if (fx.shake < 0.02) fx.shake = 0;
  /* the flash is a POP, not a veil: die fast so the destruction underneath
     stays readable the very next beat */
  fx.flash *= Math.pow(0.002, dt); if (fx.flash < 0.001) fx.flash = 0;
  return fx.debris.length + fx.particles.length + fx.rings.length > 0 || fx.shake > 0 || fx.flash > 0;
}

/* the SCREEN y of the first solid ground in a world column — for debris
   to land on. Read off the engine's live grid (post-throw), so chunks
   settle on the real, cratered surface. */
function groundScreenY(wxCell){
  const cx = Math.floor(wxCell);
  const st = M.st;
  for (let y = Math.max(0, Math.floor(E.GROUND_Y - 20)); y < E.H; y++){
    if (E.solidAt(st, cx, y)) return y;
  }
  return E.WATER_Y;
}

function drawDebris(g, cell){
  const fx = M.fx; if (!fx || !fx.debris.length) return;
  for (const d of fx.debris){
    const X = sx(d.x), Y = sy(d.y);
    g.save(); g.translate(X, Y); g.rotate(d.rot);
    if (d.shard){
      /* a wooden splinter: a long thin plank with a lit top edge */
      const L = Math.max(2, d.len * cell), W = Math.max(1, d.wid * cell);
      g.fillStyle = d.col;
      g.fillRect(-L / 2, -W / 2, L, W);
      g.fillStyle = 'rgba(255,244,214,.28)';
      g.fillRect(-L / 2, -W / 2, L, W / 2);
    } else {
      const s = Math.max(1, d.sz * cell);
      g.fillStyle = d.col;
      g.fillRect(-s / 2, -s / 2, s, s);
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.fillRect(0, -s / 2, s / 2, s);
    }
    g.restore();
  }
}
function drawRings(g, cell){
  const fx = M.fx; if (!fx || !fx.rings.length) return;
  const now = nowMs();
  for (const rg of fx.rings){
    const t = (now - rg.born) / rg.life; if (t > 1 || t < 0) continue;
    const r = (rg.r0 + (rg.r1 - rg.r0) * t) * cell;
    g.strokeStyle = 'rgba(' + rg.col + ',' + (0.7 * (1 - t)).toFixed(2) + ')';
    g.lineWidth = Math.max(1.5, cell * (1 - t) * 1.2);
    if (rg.flat){
      /* a surface ripple: a flattened ellipse hugging the water line */
      g.beginPath(); g.ellipse(sx(rg.x), sy(rg.y), r, r * 0.26, 0, 0, 6.2832); g.stroke();
      continue;
    }
    g.beginPath(); g.arc(sx(rg.x), sy(rg.y), r, 0, 6.2832); g.stroke();
    /* a hot inner flash early in the life */
    if (t < 0.4){
      const fr = r * 0.5;
      const gl = g.createRadialGradient(sx(rg.x), sy(rg.y), 0, sx(rg.x), sy(rg.y), fr);
      gl.addColorStop(0, 'rgba(' + rg.col + ',' + (0.6 * (1 - t / 0.4)).toFixed(2) + ')');
      gl.addColorStop(1, 'rgba(' + rg.col + ',0)');
      g.fillStyle = gl; g.beginPath(); g.arc(sx(rg.x), sy(rg.y), fr, 0, 6.2832); g.fill();
    }
  }
}
function drawParticles(g, cell){
  const fx = M.fx; if (!fx || !fx.particles.length) return;
  const now = nowMs();
  for (const p of fx.particles){
    const t = (now - p.born) / p.life; if (t > 1) continue;
    const X = sx(p.x), Y = sy(p.y), r = Math.max(0.6, p.r * cell);
    if (p.kind === 'spark'){
      g.fillStyle = 'rgba(255,' + (180 + ((1 - t) * 60) | 0) + ',80,' + (1 - t).toFixed(2) + ')';
      g.beginPath(); g.arc(X, Y, r, 0, 6.2832); g.fill();
    } else if (p.kind === 'ember'){
      /* a glowing ember: hot core cooling from near-white to deep red */
      const a = 1 - t;
      g.fillStyle = 'rgba(255,' + ((90 + a * 140) | 0) + ',40,' + (0.35 * a).toFixed(2) + ')';
      g.beginPath(); g.arc(X, Y, r * 2.2, 0, 6.2832); g.fill();
      g.fillStyle = 'rgba(255,' + ((150 + a * 90) | 0) + ',' + ((60 + a * 120) | 0) + ',' + a.toFixed(2) + ')';
      g.beginPath(); g.arc(X, Y, r, 0, 6.2832); g.fill();
    } else if (p.kind === 'fire'){
      /* the fireball core of a big blast: orange shell, yellow heart */
      const a = 1 - t;
      g.fillStyle = 'rgba(255,120,40,' + (0.5 * a).toFixed(2) + ')';
      g.beginPath(); g.arc(X, Y, r, 0, 6.2832); g.fill();
      g.fillStyle = 'rgba(255,224,130,' + (0.7 * a).toFixed(2) + ')';
      g.beginPath(); g.arc(X, Y, r * 0.55, 0, 6.2832); g.fill();
    } else if (p.kind === 'plume'){
      /* the splash column: a tall white streak of thrown water */
      g.fillStyle = 'rgba(228,244,255,' + (0.85 * (1 - t)).toFixed(2) + ')';
      g.beginPath(); g.ellipse(X, Y, r * 0.55, r * 1.6, 0, 0, 6.2832); g.fill();
    } else if (p.kind === 'foam'){
      /* foam blooming flat on the surface */
      g.fillStyle = 'rgba(240,250,255,' + (0.6 * (1 - t)).toFixed(2) + ')';
      g.beginPath(); g.ellipse(X, Y, r, r * 0.35, 0, 0, 6.2832); g.fill();
    } else if (p.kind === 'water'){
      g.fillStyle = 'rgba(190,225,255,' + (0.7 * (1 - t)).toFixed(2) + ')';
      g.beginPath(); g.arc(X, Y, r, 0, 6.2832); g.fill();
    } else {
      const a = (p.kind === 'smoke' ? 0.4 : 0.5) * (1 - t);
      g.fillStyle = (p.kind === 'dust') ? 'rgba(150,130,100,' + a.toFixed(2) + ')'
                                        : 'rgba(70,64,58,' + a.toFixed(2) + ')';
      g.beginPath(); g.arc(X, Y, r, 0, 6.2832); g.fill();
    }
  }
}
function stopFx(){
  if (M && M.fx){ if (M.fx.raf) cancelAnimationFrame(M.fx.raf); M.fx.running = false; M.fx.raf = 0; }
  if (UI){ UI.camShX = 0; UI.camShY = 0; }
}

/* ═══════════════════════════════════════════════════════════════════
   THE THROWER'S HAND — where the sling starts. It is the front-most
   living crew member (the engine throws from firstUp), a couple of
   cells up. We compute the same point the engine does so the band and
   the shell agree.
   ═══════════════════════════════════════════════════════════════════ */
function handOf(seat){
  const c = E.firstUp(M.st.sides[seat]);
  if (!c) return null;
  return { x: c.x, y: c.y - E.T.CH_H };
}

/* ═══════════════════════════════════════════════════════════════════
   THE PLACEMENT PHASE — YOU PUT YOUR OWN CASTLE AND YOUR OWN CREW DOWN

   Before a shot is thrown, each side lays out its own half:

     STEP 1  THE KEEP.   Drag your wall/tower/parapet stack back and forth
                         along your own shelf. The engine's `back` is an
                         integer 0..PLACE.BACK_MAX; the drag maps a finger
                         travel in world cells straight onto it and clamps.
     STEP 2  THE CREW.   Tap three columns in your own rear courtyard. Each
                         tap is validated BEFORE it sticks: on your own
                         shelf, behind your own parapet, and not on top of
                         one of your own — an illegal tap is refused with
                         the engine's own reason and nothing moves.

   WHY IT REBUILDS THE MATCH RATHER THAN EDITING IT
     A match IS (seed, opts, moves), and the layout lives in opts.place —
     it is NOT a move, because a layout chosen after a throw would change
     the world under a replay. So every change re-runs E.newMatch on the
     SAME seed with the layout so far. That is a whole world rebuild, but
     it happens only when an integer actually changes (at most a handful
     of times per drag), it costs a couple of typed-array fills, and it
     buys the thing that matters: what you are looking at while you place
     is exactly, bit-for-bit, the world you are about to fight in. There
     is no second representation that could drift.

   WHAT EACH MODE DOES
     vs AI            you lay out; the machine's own layout is
                      E.aiPlace(seed, seat) — a pure hash of the seed, so
                      it is decided without a coin toss and identically on
                      any phone that replays the match.
     pass-the-phone   both lay out, one after the other, with an OPAQUE
                      curtain between them; the second player's screen has
                      the first player's half behind the fog, and the fog
                      no longer leaks (see clipVisible).
     online           GATED for now — both phones use the default layout,
                      which is identical on both without a byte crossing.
                      See ONLINE_PLACE_WHY for what the wire would need.
   ═══════════════════════════════════════════════════════════════════ */

/* ── ONLINE_PLACE_WHY ────────────────────────────────────────────────
   Why online does NOT run the placement phase, and what wiring it up
   would take. onlineStart() never calls placeStart(): both phones build
   the match with normPlace(undefined) → the historical default layout,
   which is byte-identical on every device, so the two worlds agree with
   nothing crossing the wire. That is correct and safe; it just means
   online players do not get to choose where their keep and crew stand.

   To let them choose, the layout — being part of the match TUPLE, not a
   move — has to be agreed BEFORE the first throw, the same way (seed,
   opts) already are. The minimal relay plumbing:

     1. Each client runs placeStart([myGameSeat], ...) locally and, when
        the player taps Ready, sends its own legal layout for its OWN
        seat only (never the opponent's) as a new pre-match packet, e.g.
        { t:'place', seat, back, crew:[...] }. legalPlace() gates it on
        the sender so a tampered client cannot post an illegal keep.
     2. Neither client starts the duel until BOTH layouts have arrived.
        The host is the authority: it collects place[0] and place[1],
        then broadcasts the assembled opts.place to both so they call
        E.newMatch(seed, {...opts, place}) with the SAME tuple. (A CPU
        seat's layout is E.aiPlace(seed, seat), decided locally on the
        host — no packet — exactly as it is offline.)
     3. Because the layout is in opts, the existing snapshot()/replay()
        and the fingerprint tripwire already cover it: two phones that
        somehow disagreed on a keep would trip fingerprint() on turn one
        instead of silently drifting.

   The only NEW surface is that one 'place' packet and the host's
   "wait for both, then broadcast" gate — no change to the engine, which
   already treats opts.place as authoritative. Until that packet exists
   in js/mp.js's codec, online stays on the default layout above.
   ── */

/* the layout a seat is fighting with, or the default if it never chose */
function placeDefault(seat){
  const back = 0;
  return { back, crew: E.defaultCrewX(seat, back) };
}

/* rebuild the provisional match from the layouts known so far. The seat
   still choosing sees its own live; the other side is whatever it will
   actually be, which the fog hides from this viewer anyway. */
function placeRebuild(){
  const P0 = M.place;
  const layout = [null, null];
  for (let s = 0; s < 2; s++){
    layout[s] = (s === P0.seat) ? { back: P0.back, crew: placeCrewNow(s) }
              : (P0.done[s] || P0.foe[s] || placeDefault(s));
  }
  M.st = E.newMatch(M.seed, Object.assign({}, M.engOpts, { place: layout }));
  M.lastArc = [null, null]; M.lastShot = [null, null];
  M.revealsBy = [[], []];
}

/* the three columns to build the seat's crew from RIGHT NOW: the ones the
   player has tapped so far, topped up with the default spots so the world
   always has three people in it while they are still choosing. Sorted into
   the seat's own marching order, which is the order legalPlace wants. */
function placeCrewNow(seat){
  const P0 = M.place;
  const picked = P0.crew.slice();
  if (picked.length < E.CH_PER_SIDE){
    const fill = E.defaultCrewX(seat, P0.back);
    for (const f of fill){
      if (picked.length >= E.CH_PER_SIDE) break;
      if (picked.every(c => Math.abs(c - f) >= E.PLACE.GAP)) picked.push(f);
    }
    while (picked.length < E.CH_PER_SIDE) picked.push(E.crewZone(seat, P0.back).x0);
  }
  return placeOrder(seat, picked);
}
/* seat 0 lines up from the back of its courtyard forward (ascending
   columns); seat 1 mirrors it. A pure sort, so both phones agree. */
function placeOrder(seat, xs){
  const out = xs.slice(0, E.CH_PER_SIDE);
  out.sort((a, b) => seat === 0 ? (a - b) : (b - a));
  return out;
}

/* would putting one of them at column `c` be legal, given what is already
   down? Returns the engine's own {en,mt} reason when it would not. */
function placeCheckCrew(seat, c){
  const P0 = M.place;
  const z = E.crewZone(seat, P0.back);
  if (!(c >= z.x0 && c <= z.x1)){
    return { ok:false, why:{ en:'Drop it in the water on your own half.',
                             mt:'Itfa’ha fil-baħar fin-naħa tiegħek.' } };
  }
  for (const p of P0.crew){
    if (Math.abs(p - c) < E.PLACE.GAP){
      return { ok:false, why:{ en:'Too close to the one already standing there.',
                               mt:'Wisq viċin ta’ min diġà qiegħed hemm.' } };
    }
  }
  /* and the whole set, once this one joins it, must satisfy the engine */
  const trial = placeOrder(seat, P0.crew.concat([c]));
  if (trial.length === E.CH_PER_SIDE){
    const chk = E.legalPlace(seat, { back:P0.back, crew:trial });
    if (!chk.ok) return { ok:false, why:chk.why };
  }
  return { ok:true };
}

/* ── opening the phase ─────────────────────────────────────────────── */
function placeStart(queue, foeLayouts){
  M.phase = 'place';
  M.place = { seat:0, step:0, back:0, crew:[],
              done:[null, null], foe: foeLayouts || [null, null],
              queue: queue.slice(), drag:null };
  if (UI && UI.host) UI.host.classList.add('kn-placing');
  P.ui.setTurn(M.ctx, { cls:'', who:T('Lay out your boxes', 'Qassam il-kaxxi tiegħek'),
    note:T('Where they float is up to you.', 'Fejn iżommu jiddeċiedi int.') });
  placeNext(false);
}

function placeNext(needCurtain){
  const P0 = M.place;
  if (!P0.queue.length){ placeFinish(); return; }
  const seat = P0.queue[0];
  if (needCurtain){ placeCurtain(seat, () => { P0.queue.shift(); placeSeat(seat); }); return; }
  P0.queue.shift();
  placeSeat(seat);
}

function placeSeat(seat){
  const P0 = M.place;
  /* the three boxes are ON THE WATER from the start, spread across your
     half — you drag each one to where you want it. No 'how far back' step
     any more: dragging gives you the whole map directly. */
  P0.seat = seat; P0.step = 1; P0.back = 0;
  P0.crew = E.defaultCrewX(seat, 0); P0.drag = null;
  /* the screen becomes THIS player's: the fog turns around with it, so
     what the other one just laid out is behind the murk. */
  M.viewSeat = seat;
  placeRebuild();
  if (M.cam){ const f = frameForBase(seat); M.cam.tx = f.x; M.cam.ty = f.y; M.cam.tzoom = f.zoom; snapCam(); }
  renderSetup(); hud(); draw();
}

/* the OPAQUE hand-over screen. Nothing of the board is on it. */
function placeCurtain(seat, go){
  if (!UI || !UI.curtain){ go(); return; }
  const col = SIDECOL[seat];
  const nm = (M.meta[seat] && M.meta[seat].name) || col.n();
  UI.curtain.innerHTML =
    '<span class="kn-seatdot" style="background:' + col.a + '"></span>' +
    '<h4>' + esc(T('Pass the phone to ', 'Għaddi t-telefon lil ') + nm) + '</h4>' +
    '<p>' + esc(T('Nobody else may see where you drop your boxes. Tap when it is only you looking.',
                  'Ħadd ma jista’ jara fejn titfa’ l-kaxxi tiegħek. Agħfas meta tkun waħdek tħares.')) +
    '</p>' +
    '<button class="btn primary" id="kn-curtain-go">' +
      esc(T('I have it — lay out my boxes', 'F’idejja — ħa nqassam il-kaxxi')) + '</button>';
  UI.curtain.classList.add('on');
  const b = UI.curtain.querySelector('#kn-curtain-go');
  if (b) b.onclick = () => { UI.curtain.classList.remove('on'); cue('ui.tap', { gain:0.6 }); go(); };
}

/* ── the two steps ─────────────────────────────────────────────────── */
function placeAdvance(){
  const P0 = M.place, seat = P0.seat;
  if (P0.step === 0){
    P0.step = 1; P0.crew = [];
    placeRebuild();
    renderSetup(); draw();
    cue('move.select', { gain:0.45 });
    return;
  }
  if (P0.crew.length < E.CH_PER_SIDE){
    tip('<b>' + esc(T('Three of them, all down.', 'It-tlieta, kollha mniżżla.')) + '</b>', 1400);
    cue('move.illegal', { gain:0.5 });
    return;
  }
  const layout = { back:P0.back, crew: placeOrder(seat, P0.crew) };
  const chk = E.legalPlace(seat, layout);
  if (!chk.ok){ tip('<b>' + esc(TP(chk.why)) + '</b>', 1600); cue('move.illegal', { gain:0.5 }); return; }
  P0.done[seat] = layout;
  cue('ui.tap', { gain:0.6 });
  placeNext(M.hotseat && P0.queue.length > 0);
}

function placeUndo(){
  const P0 = M.place;
  /* 'Reset' — spread the three back out to their default spots */
  P0.crew = E.defaultCrewX(P0.seat, 0);
  placeRebuild(); renderSetup(); draw();
}

/* ── the finger ────────────────────────────────────────────────────── */
function placeDown(px, py){
  const P0 = M.place;
  if (P0.step === 0){
    P0.drag = { back0:P0.back, wx0:wx(px) };
    return;
  }
  /* pick up the box nearest the finger and drag it one by one */
  const fx = wx(px);
  let idx = 0, bd = Infinity;
  for (let k = 0; k < P0.crew.length; k++){
    const d = Math.abs(P0.crew[k] - fx);
    if (d < bd){ bd = d; idx = k; }
  }
  P0.drag = { idx };
  cue('move.select', { gain:0.4 });
}
function placeMove(px){
  const P0 = M.place;
  if (!P0.drag) return;
  if (P0.step === 0){
    /* (legacy back-slider, not reached in the drag model) */
    const dir = P0.seat === 0 ? -1 : 1;
    const moved = (wx(px) - P0.drag.wx0) * dir;
    const back = clampN(Math.round(P0.drag.back0 + moved), E.PLACE.BACK_MIN, E.PLACE.BACK_MAX);
    if (back === P0.back) return;
    P0.back = back; placeRebuild(); cue('piece.slide', { gain:0.25 }); renderSetup(); draw();
    return;
  }
  /* slide THE PICKED box to the finger, kept in the water and a clear GAP
     from the other two so they never merge. */
  const idx = P0.drag.idx;
  if (idx == null || idx < 0 || idx >= P0.crew.length) return;
  const z = E.crewZone(P0.seat, P0.back);
  const GAP = E.PLACE.GAP;
  let col = clampN(Math.round(wx(px)), z.x0, z.x1);
  for (let k = 0; k < P0.crew.length; k++){
    if (k === idx) continue;
    const o = P0.crew[k];
    if (Math.abs(col - o) < GAP) col = (col >= o) ? (o + GAP) : (o - GAP);
  }
  col = clampN(col, z.x0, z.x1);
  let clear = true;
  for (let k = 0; k < P0.crew.length; k++)
    if (k !== idx && Math.abs(col - P0.crew[k]) < GAP) clear = false;
  if (!clear || col === P0.crew[idx]) return;
  P0.crew[idx] = col;
  placeRebuild();
  cue('piece.slide', { gain:0.25 });
  renderSetup(); draw();
}
function placeUp(){ if (M.place) M.place.drag = null; }

/* ── the bar under the field ───────────────────────────────────────── */
function renderSetup(){
  if (!UI || !UI.setup || !M || M.phase !== 'place') return;
  const P0 = M.place, seat = P0.seat;
  const nm = (M.meta[seat] && M.meta[seat].name) || SIDECOL[seat].n();
  const who = M.hotseat ? (esc(nm) + ' — ') : '';
  let title, hint, go, canGo;
  if (P0.step === 0){
    title = who + T('How far out do your boxes float?', 'Kemm ’il barra jżommu l-kaxxi tiegħek?');
    hint = T('Drag to push your boxes out toward the pillar — closer is braver. ',
             'Iġbed biex timbotta l-kaxxi lejn il-kolonna — eqreb hu aktar qalbieni. ') +
           '<em>' + T('Out ', 'Barra ') + P0.back + '/' + E.PLACE.BACK_MAX + '</em>';
    go = T('Now the boxes', 'Issa l-kaxxi'); canGo = true;
  } else {
    title = who + T('Drag your boxes into place', 'Iġbed il-kaxxi f’posthom');
    hint = T('Drag each box along the water, one by one — a soldier rides each one. ',
             'Iġbed kull kaxxa tul l-ilma, waħda waħda — suldat fuq kull waħda. ') +
           '<em>' + T('all set', 'lesti') + '</em>';
    go = T('Ready — begin', 'Lest — ibda'); canGo = P0.crew.length >= E.CH_PER_SIDE;
  }
  UI.setup.innerHTML =
    '<div class="kn-setup-t"><b>' + esc(title) + '</b><i>' + hint + '</i></div>' +
    '<div class="kn-setup-a">' +
      '<button class="btn ghost sm" id="kn-setup-undo">' + esc(T('Reset', 'Irrisettja')) + '</button>' +
      '<button class="btn primary sm" id="kn-setup-go"' + (canGo ? '' : ' disabled') + '>' +
        esc(go) + '</button>' +
    '</div>';
  const u = UI.setup.querySelector('#kn-setup-undo');
  const g = UI.setup.querySelector('#kn-setup-go');
  if (u) u.onclick = () => { placeUndo(); cue('ui.back', { gain:0.5 }); };
  if (g) g.onclick = () => placeAdvance();
}

/* ── closing the phase and starting the duel ───────────────────────── */
function placeFinish(){
  const P0 = M.place;
  const layout = [ P0.done[0] || P0.foe[0] || placeDefault(0),
                   P0.done[1] || P0.foe[1] || placeDefault(1) ];
  M.engOpts = Object.assign({}, M.engOpts, { place: layout });
  M.st = E.newMatch(M.seed, M.engOpts);
  M.phase = 'play'; M.place = null;
  M.lastArc = [null, null]; M.lastShot = [null, null]; M.revealsBy = [[], []];
  if (UI && UI.host) UI.host.classList.remove('kn-placing');
  if (UI && UI.curtain) UI.curtain.classList.remove('on');
  /* the first player at the phone is the one whose turn it is (hot-seat)
     or simply the seat this device holds */
  const first = E.turnOf(M.st);
  M.viewSeat = (M.hotseat && first >= 0 && ownedHere(first)) ? first : (M.me | 0);
  if (M.cam){ const f = frameForBase(mySeat()); M.cam.tx = f.x; M.cam.ty = f.y; M.cam.tzoom = f.zoom; snapCam(); }
  saveGame();
  hud(); weps(); renderModeBtn(); draw();
  cue('game.start', { gain:0.85 }, true);
  if (first < 0){ finish(); return; }
  if (M.mine.indexOf(first) >= 0 && M.meta[first] && M.meta[first].own === 'ai') scheduleAI(first);
  else if (ownedHere(first)) setTurn('you');
  else setTurn('them');
}

/* ── the placement overlay on the canvas: the courtyard you may use and
     a pip on each of your three, so the legal ground is never a guess ── */
function drawPlacement(g, cell){
  if (!M || M.phase !== 'place' || !M.place) return;
  const P0 = M.place, seat = P0.seat;
  const z = E.crewZone(seat, P0.back);
  const x0 = sx(z.x0), x1 = sx(z.x1 + 1);
  const yTop = sy(E.GROUND_Y - E.T.CH_H - 1), yBot = sy(E.GROUND_Y + 1);
  g.save();
  /* the legal courtyard, lit up only while the crew are going down */
  if (P0.step === 1){
    g.fillStyle = 'rgba(59,224,138,.14)';
    g.fillRect(x0, yTop, x1 - x0, yBot - yTop);
    g.strokeStyle = 'rgba(59,224,138,.7)';
    g.lineWidth = Math.max(1.2, cell * 0.22);
    g.setLineDash([Math.max(3, cell), Math.max(3, cell)]);
    g.strokeRect(x0, yTop, x1 - x0, yBot - yTop);
    g.setLineDash([]);
    /* a pip under each one already placed */
    g.fillStyle = 'rgba(59,224,138,.95)';
    for (const c of P0.crew){
      g.beginPath();
      g.arc(sx(c + 0.5), sy(E.GROUND_Y + 1), Math.max(2, cell * 0.6), 0, 6.2832);
      g.fill();
    }
  } else {
    /* the keep step: outline the three slots so the stack is obvious */
    g.strokeStyle = 'rgba(255,197,66,.85)';
    g.lineWidth = Math.max(1.4, cell * 0.26);
    g.setLineDash([Math.max(3, cell * 1.2), Math.max(3, cell * 0.8)]);
    for (let d = 0; d < E.NDEF; d++){
      const sp = E.slotSpan(seat, d, P0.back);
      const sxa = sx(sp.x0), sxb = sx(sp.x1 + 1);
      g.strokeRect(sxa, sy(E.GROUND_Y - 16), sxb - sxa, sy(E.GROUND_Y + 1) - sy(E.GROUND_Y - 16));
    }
    g.setLineDash([]);
  }
  g.restore();
}

/* ═══════════════════════════════════════════════════════════════════
   PAN vs AIM — the touch is hit-tested against the SLINGSHOT region
   FIRST. A press on/near your own launch hand (or your own castle) is an
   AIM drag (the slingshot pull, unchanged). A press anywhere else on the
   open map is a PAN drag: it scrolls the camera around the battlefield to
   SCOUT for the enemy base through the cloudy fog, clamped to the world.
   The two never fight because the hit-test decides up front, and a
   "return to base" button (or auto-return on aim / on pan release) snaps
   the view back to your slingshot so the player is never trapped away.
   ═══════════════════════════════════════════════════════════════════ */
/* radius (in css px) around the launch hand that counts as "the sling".
   Generous so the aim gesture is easy to grab, but small enough that the
   rest of the field is free to pan. */
const SLING_HIT_PX = 78;
/* is this screen point on/near the LOCAL player's slingshot (their launch
   hand or own castle body)? Only true when it's actually the player's turn
   to aim — otherwise every press pans (scout freely between throws). */
function onSlingshot(px, py){
  if (!M || !M.st) return false;
  if (!canAct()) return false;
  const seat = mySeat();
  const hand = handOf(seat);
  if (!hand) return false;
  const hx = sx(hand.x), hy = sy(hand.y);
  const dx = px - hx, dy = py - hy;
  if (dx * dx + dy * dy <= SLING_HIT_PX * SLING_HIT_PX) return true;
  /* also treat a press over the player's OWN castle BODY as aim (a thumb on
     the wall behind the crew still pulls the sling) — but ONLY down at the
     castle itself, not the open sky above it, so high sky always PANS for
     scouting. Restrict the fallback to at/below a little over the crew. */
  const cx0 = seat === 0 ? E.L_X0 : E.R_X0;
  const cx1 = seat === 0 ? E.L_X1 : E.R_X1;
  const wcx = wx(px), wcy = wy(py);
  const overCastleX = wcx >= cx0 - 4 && wcx <= cx1 + 4;
  const atCastleY   = wcy >= E.GROUND_Y - E.T.CH_H - 8;   /* crew height + a hair */
  return overCastleX && atCastleY;
}

/* ── PAN GESTURE: move the camera by the finger's world-space delta, drop
   the eased-follow targets onto the live position so tickCam doesn't fight
   it, and keep momentum on release. Clamped to the battlefield by clampCam.
   A user pan sets M.cam.userPan so the turn machinery won't yank the view
   back until the player asks (return-to-base) or aims. ── */
function beginPan(px, py){
  const c = M && M.cam; if (!c) return;
  stopPanMomentum();
  c.follow = false; c.userPan = true;
  M.pan = { sx0:px, sy0:py, wx0:wx(px), wy0:wy(py),
            lx:px, ly:py, vx:0, vy:0, lt:nowMs() };
  /* pin the eased targets to the current position so tickCam is a no-op
     while the finger drives the camera directly. */
  c.tx = c.x; c.ty = c.y; c.tzoom = c.zoom;
}
function movePan(px, py){
  const c = M && M.cam; if (!c || !M.pan) return;
  /* world point under the finger at grab time should stay under the finger:
     translate the camera by the difference. */
  const s = camScale();
  c.x = M.pan.wx0 - (px - UI.cw / 2) / s;
  c.y = M.pan.wy0 - (py - UI.ch / 2) / s;
  clampCam(c);
  c.tx = c.x; c.ty = c.y;
  /* track velocity (world units/ms) for release momentum */
  const now = nowMs(); const dt = Math.max(1, now - M.pan.lt);
  M.pan.vx = ((px - M.pan.lx) / s) / dt;
  M.pan.vy = ((py - M.pan.ly) / s) / dt;
  M.pan.lx = px; M.pan.ly = py; M.pan.lt = now;
  draw();
}
function endPan(){
  const c = M && M.cam; if (!c || !M.pan) { M.pan = null; return; }
  const vx = M.pan.vx, vy = M.pan.vy;
  M.pan = null;
  if (noMotion()){ draw(); return; }
  /* glide: decay the velocity and keep dropping the target on the camera so
     the momentum coasts to a clamped stop. */
  const s0 = camScale();
  let gx = -vx, gy = -vy;   /* world delta per ms, opposite finger travel */
  const start = nowMs();
  const glide = () => {
    const c2 = M && M.cam; if (!c2 || M.dead || M.pan || M.anim) { M._panRaf = 0; return; }
    const now = nowMs();
    const dt = 16;
    c2.x += gx * dt; c2.y += gy * dt;
    clampCam(c2); c2.tx = c2.x; c2.ty = c2.y;
    gx *= 0.90; gy *= 0.90;
    draw();
    if ((Math.abs(gx) + Math.abs(gy)) * s0 > 0.02 && now - start < 900){
      M._panRaf = requestAnimationFrame(glide);
    } else { M._panRaf = 0; }
  };
  M._panRaf = requestAnimationFrame(glide);
}
function stopPanMomentum(){ if (M && M._panRaf){ cancelAnimationFrame(M._panRaf); M._panRaf = 0; } }

/* snap the camera back to the AIM view of the LOCAL player's own base —
   the "return to base" affordance. Clears the user-pan latch so the turn
   machinery frames normally again. */
function returnToBase(){
  const c = M && M.cam; if (!c) return;
  stopPanMomentum();
  c.userPan = false; c.follow = false;
  const f = frameWhole();
  c.tx = f.x; c.ty = f.y; c.tzoom = f.zoom;
  if (noMotion()){ snapCam(); draw(); }
  else easeCamToTarget();
  refreshReturnBtn();
}
/* a tiny rAF that eases the camera to its target when nothing else is
   animating (pan release / return-to-base), then stops. */
function easeCamToTarget(){
  if (M && M._easeRaf) return;
  const tick = () => {
    if (!M || M.dead || !M.cam || M.anim || M.pan){ if (M) M._easeRaf = 0; return; }
    const moving = tickCam(0.016);
    draw();
    if (moving){ M._easeRaf = requestAnimationFrame(tick); }
    else { M._easeRaf = 0; }
  };
  M._easeRaf = requestAnimationFrame(tick);
}
/* ── THE SHOOT / LOOK MODE TOGGLE ─────────────────────────────────────
   An EXPLICIT button, always on screen, that decides what a drag on the
   field does — replacing the old implicit drag-region hit-test:
     · SHOOT (aim mode): a drag on the field pulls the slingshot and FIRES.
     · LOOK  (scout mode): a drag PANS the camera to find the enemy base.
   Tapping it switches mode; the button shows the CURRENT mode clearly. */
function renderModeBtn(){
  if (!UI || !UI.modeBtn || !M) return;
  const look = M.mode === 'look';
  UI.modeBtn.classList.toggle('shoot', !look);
  UI.modeBtn.classList.toggle('look', look);
  const glyph = look
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/></svg>';
  const word = look ? T('LOOK', 'ĦARES') : T('SHOOT', 'SPARA');
  const sub  = look ? T('drag pans', 'iġbed biex tħares') : T('drag aims', 'iġbed biex timmira');
  UI.modeBtn.innerHTML =
    '<span class="dot"></span>' + glyph +
    '<span><b>' + esc(word) + '</b> <span class="sub">' + esc(sub) + '</span></span>';
  UI.modeBtn.setAttribute('aria-label',
    look ? T('Look mode: a drag pans the map. Tap to switch to shoot.',
             'Mod ħars: iġbed biex tħares. Agħfas biex tispara.')
         : T('Shoot mode: a drag aims and fires. Tap to switch to look.',
             'Mod spara: iġbed biex timmira. Agħfas biex tħares.'));
}
function toggleMode(){
  if (!M) return;
  M.mode = (M.mode === 'look') ? 'shoot' : 'look';
  /* leaving LOOK for SHOOT snaps the aim view back to your own base so the
     slingshot is under the thumb; entering LOOK just lets you drag to pan. */
  if (M.mode === 'shoot' && M.cam && M.cam.userPan) returnToBase();
  /* cancel any in-progress gesture that no longer matches the mode */
  if (M.drag){ M.drag = null; M.preview = null;
    if (UI && UI.power){ UI.power.classList.remove('on'); UI.powerFill.style.width = '0%'; }
    if (UI && UI.tip) UI.tip.classList.remove('on'); }
  renderModeBtn();
  draw();
}

/* show the return-to-base button only when the player has panned away from
   their aim view (so it isn't clutter when already home). */
function refreshReturnBtn(){
  if (!UI || !UI.returnBtn) return;
  const c = M && M.cam;
  const away = !!(c && c.userPan);
  UI.returnBtn.classList.toggle('on', away);
}

/* ═══════════════════════════════════════════════════════════════════
   AIMING — a drag. pointerdown anywhere on the field begins the pull;
   the drag vector from the hand is the shot, SLINGSHOT style: you pull
   BACK and the shell flies the opposite way, so dragging down-left
   throws up-right. dragOf() quantises the finger's float into the two
   signed bytes the engine wants, and preview() draws the exact arc.
   ═══════════════════════════════════════════════════════════════════ */
/* ── POWER MAPPING IS IN SCREEN SPACE, NOT WORLD SPACE ───────────────
   The old mapping measured the pull in WORLD CELLS (MAXPULL=46 cells to
   full power) and then, at the zoomed-in aim view, 46 cells is a screen
   distance far bigger than the viewport — so full power meant dragging
   your thumb clean off the screen and aiming felt impossible. The pull
   is now measured in SCREEN PIXELS from the hand: a COMFORTABLE on-screen
   drag of MAXPULL_PX reaches full power, regardless of how far the camera
   is zoomed in (zoom changes what a pixel is worth in the world, but the
   power now depends only on how far your thumb actually travels).

   How it stays deterministic: the engine still receives the two signed
   dx/dy bytes from E.dragOf(). dragOf(fx,fy,maxPull) scales its input by
   DRAG_MAX/maxPull; feeding it the SCREEN pull (px) with maxPull=the
   screen span that should mean full power makes a MAXPULL_PX-pixel drag
   land exactly on DRAG_MAX. The direction is preserved (screen and world
   axes share orientation), so slingshot semantics are unchanged. */
const MAXPULL_PX_FRAC = 0.42;  /* full power = this fraction of min(vw,vh) */
const MAXPULL_PX_MIN  = 120;   /* but never a silly-short comfortable drag */
const MAXPULL_PX_MAX  = 300;   /* nor longer than a thumb wants to travel  */
function maxPullPx(){
  const base = Math.min(UI ? UI.cw : 360, UI ? UI.ch : 640) * MAXPULL_PX_FRAC;
  return clampN(base, MAXPULL_PX_MIN, MAXPULL_PX_MAX);
}

function beginAim(px, py){
  if (!canAct()) return;
  const seat = mySeat();
  const hand = handOf(seat);
  if (!hand) return;
  /* anchor the pull at the HAND's SCREEN position, so the drag distance
     is read in pixels the thumb actually travels. */
  M.drag = { seat, hx: hand.x, hy: hand.y,
             hsx: sx(hand.x), hsy: sy(hand.y),
             fx: wx(px), fy: wy(py), sx0:px, sy0:py };
  moveAim(px, py);
}
function moveAim(px, py){
  if (!M.drag) return;
  const seat = M.drag.seat;
  const fx = wx(px), fy = wy(py);
  M.drag.fx = fx; M.drag.fy = fy;
  /* the pull, IN SCREEN PIXELS, from the hand to the finger. The shot is
     its OPPOSITE (slingshot): pull back, fly forward. */
  const spdx = px - M.drag.hsx, spdy = py - M.drag.hsy;
  const drag = E.dragOf(-spdx, -spdy, maxPullPx());
  M.drag.dx = drag.dx; M.drag.dy = drag.dy;
  const mv = { seat, w: M.sel, dx: drag.dx, dy: drag.dy };
  M.drag.mv = mv;
  /* power meter + a live power/angle readout so lining up a shot is a
     precise, satisfying thing rather than a guess */
  const pw = Math.min(1, Math.sqrt(drag.dx * drag.dx + drag.dy * drag.dy) / E.T.DRAG_MAX);
  if (UI.power){ UI.power.classList.add('on'); UI.powerFill.style.width = (pw * 100) + '%'; }
  /* angle above horizontal, from the shot vector (dy is up-negative). We
     read it off the two bytes so it matches the launch exactly. Uses the
     engine's own table lerp — decoration, never fed back. */
  const face = seat === 0 ? 1 : -1;
  const shotx = drag.dx * face, shoty = drag.dy;
  const ang = Math.round(Math.atan2(-shoty, Math.abs(shotx) || 1) * 180 / Math.PI);
  tip('<b>' + Math.round(pw * 100) + '%</b> · ' + (ang >= 0 ? '+' : '') + ang + '°', 0);
  /* the preview arc — only when the pull is worth a shot */
  const chk = E.legal(M.st, mv);
  if (chk.ok){
    const rep = E.preview(M.st, mv);
    M.preview = firstTrackPts(rep);
  } else {
    M.preview = null;
  }
  /* ZOOM THE CAMERA OUT TO THE END OF THE AIM ASSIST. Set the eased
     target only (never snap) so the view glides back as the pull grows,
     and never fight a player who is hand-scouting with a two-finger pan. */
  if (M.cam && !M.cam.userPan && !M.anim){
    const f = (M.preview && M.preview.length >= 4)
              ? frameArc(seat, M.preview)
              : frameForBase(seat);
    if (f && isFinite(f.x) && isFinite(f.y) && isFinite(f.zoom)){
      M.cam.tx = f.x; M.cam.ty = f.y; M.cam.tzoom = f.zoom;
      if (!noMotion()) easeCamToTarget(); else { snapCam(); }
    }
  }
  draw();
}
function endAim(){
  if (!M.drag){ return; }
  const seat = M.drag.seat;
  const mv = M.drag.mv;
  M.drag = null; M.preview = null;
  if (UI.power){ UI.power.classList.remove('on'); UI.powerFill.style.width = '0%'; }
  if (UI.tip) UI.tip.classList.remove('on');
  draw();
  /* the aim pulled the camera out to the arc's end; if NO shot goes (weak
     pull, or the move is illegal), ease the view back onto the base so the
     player is not left staring down-range. A real shot lets fireShot's
     flight-follow take the camera instead. */
  const easeBackToBase = () => {
    if (M.cam && !M.cam.userPan && !M.anim){
      const f = frameForBase(seat);
      M.cam.tx = f.x; M.cam.ty = f.y; M.cam.tzoom = f.zoom;
      if (!noMotion()) easeCamToTarget(); else { snapCam(); draw(); }
    }
  };
  if (!mv){ easeBackToBase(); return; }
  const chk = E.legal(M.st, mv);
  if (!chk.ok){
    tip('<b>' + esc(TP(chk.why)) + '</b>', 1400);
    cue('move.illegal', { gain:0.5 });
    easeBackToBase();
    return;
  }
  fireShot(mv, 'me');
}

/* the pts of the primary projectile track, for the aim line */
function firstTrackPts(rep){
  if (!rep || !rep.tracks || !rep.tracks.length) return null;
  /* the parent (id 0) is the ranging line; use it */
  let t = rep.tracks.find(x => x.id === 0) || rep.tracks[0];
  return (t && t.pts && t.pts.length >= 2) ? t.pts : null;
}

/* can this phone act right now? its turn, no shell flying, not over */
function canAct(){
  if (!M || M.dead || M.finished || M.busy) return false;
  if (M.st.done) return false;
  if (M.phase === 'place') return false;   /* the castles are still being laid out */
  if (E.turnOf(M.st) !== mySeat()) return false;
  return true;
}

/* ═══════════════════════════════════════════════════════════════════
   FIRING — apply the move to the engine (which produces the whole
   report: the tracks, the events, the new world), then ANIMATE the
   shell along the reported path. Reduced motion skips straight to the
   settled world.
   ═══════════════════════════════════════════════════════════════════ */
function fireShot(mv, src){
  if (M.busy){
    /* A THROW MUST NEVER BE DROPPED. A remote (or queued AI) move can land
       while our own flight is still animating; the sender has ALREADY
       applied it to their engine, so swallowing it here forks the match —
       the exact "starts, then breaks" desync. Queue it; the flight's done
       callback drains the queue in arrival order. */
    (M.fireQ || (M.fireQ = [])).push({ mv, src });
    return;
  }
  M.busy = true;
  const seat = mv.seat;
  /* material colours at the impacts, sampled from the LIVE world just
     before apply() resolves it, so the debris matches what breaks */
  const rep = E.apply(M.st, { seat, w:mv.w, dx:mv.dx, dy:mv.dy });
  if (!rep){ M.busy = false; return; }
  /* PERSISTENT AIM LINE: remember the actual trajectory this shot flew so
     the arc HANGS IN THE AIR after firing (drawn in drawLastShot, on top of
     the fog) until THAT SHOOTER'S next shot replaces it — the player sees
     the path their own shell took and can adjust. Filed under the SHOOTER's
     seat: drawLastShot only ever fetches the viewer's own, so an opponent's
     arc is never left on your screen once their shell has landed, and your
     own survives their turn intact. Read-only: the pts are the engine's own
     primary-track points, never fed back to the sim. */
  const arcPts = firstTrackPts(rep);
  if (!M.lastArc) M.lastArc = [null, null];
  if (arcPts) M.lastArc[seat] = { pts: arcPts, seat, born: nowMs() };
  /* tell the wire — AFTER it has been applied here, never before.
     'ai' goes out too: a CPU chair is host-decided-and-RELAYED (its buys
     already were, at aiPlay); without this the other phone never sees the
     machine's throw and the match forks. mp.js stamps it as the bot's
     chair (began.bots) and drops only src:'net' echoes. */
  if (src === 'me' || src === 'ai') say(seat, { seat, w:mv.w, dx:mv.dx, dy:mv.dy });
  saveGame();
  cue('duel.attack', { gain:0.75 }, true);
  /* the muzzle flash + a kick of the camera at the hand */
  const thr = rep.ev.find(e => e.t === 'throw');
  if (thr){
    if (!noMotion() && M.fx == null) M.fx = initFx();
    if (M.fx){ M.fx.flash = Math.min(1, M.fx.flash + 0.5); startFx(); }
  }

  playFlight(rep, () => {
    M.busy = false;
    afterThrow(rep);
    /* drain anything that arrived mid-flight, in arrival order — each
       queued move goes through this same function, so it is applied,
       relayed (if ours) and animated exactly as if it had come in idle */
    if (M && !M.dead && !M.busy && !M.st.done && M.fireQ && M.fireQ.length){
      const q = M.fireQ.shift();
      fireShot(q.mv, q.src);
    }
  });
}

/* a small material palette for the debris of a blast, picked from the
   THEME so it always sits right on the map, plus a warm dirt base */
function debrisCols(){
  const th = M.theme || THEMES.malta;
  return ['#9a7648', '#7a5c34', th.hill2 || '#5a4726', '#8a6a3a'];
}

/* did this boom land on (or blow away) a soldier's floating crate? Reads
   the engine's post-apply grid, never writes it. If surviving BOX cells
   sit near the blast, it hit a crate; if the blast is low over open sea
   with nothing solid beneath, the crate it hit is GONE — splinters both
   ways. */
function boomNearBox(wx, wy){
  const st = M && M.st; if (!st) return false;
  const x0 = Math.floor(wx), y0 = Math.floor(wy);
  for (let dx = -3; dx <= 3; dx++)
    for (let dy = -3; dy <= 3; dy++)
      if (E.matAt(st, x0 + dx, y0 + dy) === E.BOX) return true;
  return wy >= E.WATER_Y - 6 && groundScreenY(wx) >= E.WATER_Y - 0.5;
}

/* ── THE FLIGHT: walk the shell along the engine's own path, FOLLOW IT
   with the camera, fire the sounds and — the point of all this — SPAWN
   THE DESTRUCTION at each impact the report describes. Reduced motion
   skips straight to the settled world. ── */
function playFlight(rep, done){
  stopAnim();
  const track = (rep.tracks || []).find(t => t.id === 0) || (rep.tracks || [])[0];
  const pts = track && track.pts ? track.pts : null;

  if (noMotion() || !pts || pts.length < 4){
    /* land it now: play the impact sound and repaint (no particles) */
    boomSounds(rep, true);
    /* FOG: no flight to walk, so open the persistent reveals straight
       from the report's impact points (reduced motion still reveals). */
    revealFromReport(rep);
    /* LAST-SHOT MARKER: record where this shot landed (last boom, or the
       shell's rest) so the grid + pin persist until the next shot. */
    recordLastShot(rep, null);
    /* still frame the action so the result is legible */
    if (M.cam){ const f = frameWhole(); M.cam.tx = f.x; M.cam.ty = f.y; M.cam.tzoom = f.zoom; snapCam(); }
    draw(); hud();
    if (done) done();
    return;
  }

  /* the boom points (impacts, sticks, splashes) with their radius */
  const booms = [];
  for (const e of rep.ev){
    if (e.t === 'boom') booms.push({ x:e.x, y:e.y, r:(e.r || 4), water:false, fired:false });
    else if (e.t === 'splash' || e.t === 'overboard')
      booms.push({ x:e.x, y:e.y, r:e.t === 'overboard' ? 5 : 3.5, water:true,
                   over:e.t === 'overboard', fired:false });
    else if (e.t === 'stick') booms.push({ x:e.x, y:e.y, r:2.5, water:false, fired:false, small:true });
  }
  /* the thumps (direct hits) → a knock puff at the person */
  const thumps = rep.ev.filter(e => e.t === 'thump' || e.t === 'thud');

  const a = M.anim = {
    pts, i:0, trail:[], pos:null, start:nowMs(),
    zoomedIn:false
  };
  /* zoom the camera in a touch and follow the shell */
  if (M.cam){ M.cam.follow = true; M.cam.hold = 0; }

  const SPEED = 3.0;
  let carried = 0;
  let landed = false, landAt = 0;

  const step = () => {
    if (!M || M.dead){ return; }
    a.raf = M.raf = requestAnimationFrame(step);
    if (!landed){
      /* hit-stop: a thump freezes the cosmetic flight for a beat */
      if (!(a.holdUntil && nowMs() < a.holdUntil)) carried += SPEED;
      while (carried >= 1 && a.i + 2 < pts.length){
        a.i += 2; carried -= 1;
        a.trail.push(pts[a.i], pts[a.i + 1]);
        if (a.trail.length > 44) a.trail.splice(0, a.trail.length - 44);
      }
      a.pos = [pts[a.i], pts[a.i + 1]];

      /* CAMERA FOLLOW: aim the camera at the shell, zoomed in so the
         action fills the field. The eased tickCam does the smoothing. */
      if (M.cam){
        M.cam.tx = a.pos[0]; M.cam.ty = a.pos[1]; M.cam.tzoom = 1.9;
      }

      const now = nowMs();
      for (const e of rep.ev){
        if (e._done) continue;
        if (e.t === 'bounce' && near(a.pos, e.x, e.y, 3)){
          e._done = true; cue('piece.slide', { gain:0.3 });
          spawnSparks(e.x, e.y);
        } else if (e.t === 'skip' && near(a.pos, e.x, e.y, 3)){
          e._done = true; cue('sea.splash', { gain:0.35 });
          spawnSplash(e.x, 2.2, false);
        }
      }
      /* fire the impact FX when the shell reaches (or the path ends at)
         a boom point */
      for (const b of booms){
        if (!b.fired && (a.i + 2 >= pts.length || near(a.pos, b.x, b.y, 4))){
          b.fired = true;
          const power = Math.min(1.6, b.r / 6);
          /* FOG: this shot LANDED — punch a persistent reveal for the
             SHOOTER at the impact, if it's on the side fogged for them
             (addReveal filters). The owner is passed explicitly because
             the engine has already handed the turn on by now. */
          addReveal(rep.seat, b.x, b.water ? E.WATER_Y : b.y, b.r);
          if (b.water){
            /* the sea takes it — a soldier overboard gets the full geyser */
            spawnSplash(b.x, b.r, !!b.over);
            cue('sea.splash', { gain:b.over ? 0.7 : 0.5 }, true);
          } else {
            /* on land: if the blast landed on/near a soldier's crate,
               dress it with wooden splinters so the box visibly shatters */
            const spl = boomNearBox(b.x, b.y) ? Math.round(6 + b.r * 1.5) : 0;
            spawnImpact(b.x, b.y, b.r, power, { cols:debrisCols(), splinters:spl });
            cue(b.r >= 7 ? 'duel.boss' : 'duel.hit', { gain:0.65 }, b.r >= 7);
          }
        }
      }
      for (const tp of thumps){
        if (!tp._done && near(a.pos, tp.x, tp.y, 4)){
          tp._done = true;
          spawnKnock(tp.x, tp.y);
          /* a hit-stop beat: freeze the (purely cosmetic) flight walk for
             a breath so the direct hit lands with weight. Draw-only — the
             engine already resolved everything at apply(). */
          a.holdUntil = now + 90;
          cue('duel.hit', { gain:0.55 });
        }
      }

      if (a.i + 2 >= pts.length){
        landed = true; landAt = now;
        /* the moment of impact: point the camera at the last boom (or
           the shell's rest), pull back a little to show the damage */
        const focus = booms.length ? booms[booms.length - 1] : { x:a.pos[0], y:a.pos[1] };
        if (M.cam){ M.cam.tx = focus.x; M.cam.ty = focus.y; M.cam.tzoom = 2.2; }
        /* LAST-SHOT MARKER: pin the grid + crosshair on this landing point. */
        recordLastShot(rep, focus);
      }
    } else {
      /* impact settling: hold on the blast, then ease back to frame both
         castles so the player reads what changed */
      const held = nowMs() - landAt;
      if (M.cam && held > 620 && !a.easedBack){
        a.easedBack = true;
        const f = frameWhole();
        M.cam.tx = f.x; M.cam.ty = f.y; M.cam.tzoom = f.zoom; M.cam.follow = false;
      }
    }

    /* advance the camera + repaint */
    if (M.cam) tickCam(0.016);
    draw();

    /* done when landed, camera has essentially arrived at the wide frame,
       and the FX have mostly burned down (or a safety timeout) */
    if (landed){
      const held = nowMs() - landAt;
      const camDone = !M.cam || (Math.abs(M.cam.zoom - frameWhole().zoom) < 0.06 &&
                       Math.abs(M.cam.x - frameWhole().x) < 2);
      const fxQuiet = !M.fx || (M.fx.debris.length + M.fx.rings.length < 6);
      if (held > 1200 && (camDone && fxQuiet || held > 2600)){
        stopAnim();
        boomSounds(rep, false);
        draw(); hud();
        if (done) done();
      }
    }
  };
  a.raf = M.raf = requestAnimationFrame(step);
}
function spawnSparks(x, y){
  if (noMotion() || !M) return;
  if (!M.fx) M.fx = initFx();
  const n = Math.min(FX_CAP.particles - M.fx.particles.length, 5);
  for (let i = 0; i < n; i++){
    const ang = rr(-Math.PI, 0), sp = rr(0.5, 1.8);
    M.fx.particles.push({ x, y, vx:Math.cos(ang) * sp, vy:Math.sin(ang) * sp,
      r:rr(0.3, 0.6), born:nowMs(), life:rr(140, 260), kind:'spark' });
  }
  startFx();
}
function near(p, x, y, r){ if (!p) return false; const dx = p[0]-x, dy = p[1]-y; return dx*dx+dy*dy <= r*r; }
function boomSounds(rep, instant){
  let big = false, water = false;
  for (const e of rep.ev){ if (e.t === 'boom' && (e.r||0) >= 7) big = true; if (e.t === 'overboard' || e.t === 'splash') water = true; }
  if (instant){
    if (big) cue('duel.boss', { gain:0.6 }, true);
  }
  if (rep.downed && rep.downed.length){
    cue(water ? 'sea.sink' : 'duel.destroy', { gain:0.8 }, true);
  }
}
function stopAnim(){
  if (M && M.raf){ cancelAnimationFrame(M.raf); M.raf = 0; }
  if (M){ stopPanMomentum(); if (M._easeRaf){ cancelAnimationFrame(M._easeRaf); M._easeRaf = 0; } }
  if (M) M.anim = null;
  if (M && M.cam){ M.cam.follow = false; M.cam.userPan = false; }
}

/* ═══════════════════════════════════════════════════════════════════
   AFTER A THROW — narrate what landed, then either hand the turn to
   the machine (offline) or wait for the next phone (online). The store
   is offered to the side about to throw.
   ═══════════════════════════════════════════════════════════════════ */
function afterThrow(rep){
  hud(); weps(); draw();
  if (M.st.done){ finish(); return; }

  /* a line about the throw */
  if (rep.downed && rep.downed.length){
    tip('<b>' + esc(TP({ en:'Down!', mt:'Waqa\'!' })) + '</b> ' +
        esc(T('That is one of them in the moat.', 'Dak wieħed minnhom fil-foss.')), 1600);
  } else if (rep.dealt > 0){
    tip('<b>' + rep.dealt + ' ' + esc(T('damage', 'ħsara')) + '</b>', 1200);
  } else if (rep.coins > E.PAY.stipend){
    tip(esc(T('Chipped their wall. Coins in.', 'Kissirt il-ħajt tagħhom. Flus ġejjin.')), 1300);
  }

  const next = E.turnOf(M.st);
  if (next < 0){ finish(); return; }
  if (M.mine.indexOf(next) >= 0){
    /* our (or the host's AI) turn */
    if (M.meta[next] && M.meta[next].own === 'ai'){ scheduleAI(next); }
    /* two players on one phone: put the curtain up before the board is
       handed over, so the next player does not inherit the last one's
       view — their scouted patches, their arc, or their clear half */
    else if (M.hotseat && next !== (M.viewSeat | 0)) handOver(next);
    else setTurn('you');
  } else {
    /* a remote human's turn — wait */
    setTurn('them');
  }
}

/* ── PASS THE PHONE. The curtain is opaque and covers the whole field;
   only when the next player taps it does M.viewSeat move, and with it the
   fog, the reveals and the persistent last-shot arc. ── */
function handOver(seat){
  const go = () => {
    M.viewSeat = seat | 0;
    if (M.cam) frameForAim(true);
    hud(); weps(); draw();
    setTurn('you');
  };
  if (!UI || !UI.curtain){ go(); return; }
  const col = SIDECOL[seat];
  const nm = (M.meta[seat] && M.meta[seat].name) || col.n();
  UI.curtain.innerHTML =
    '<span class="kn-seatdot" style="background:' + col.a + '"></span>' +
    '<h4>' + esc(T('Pass the phone to ', 'Għaddi t-telefon lil ') + nm) + '</h4>' +
    '<p>' + esc(T('Their throw. What you scouted stays yours.',
                  'It-tefgħa tagħhom. Dak li skoprejt jibqa’ tiegħek.')) + '</p>' +
    '<button class="btn primary" id="kn-hand-go">' +
      esc(T('Ready — my throw', 'Lest — it-tefgħa tiegħi')) + '</button>';
  UI.curtain.classList.add('on');
  P.ui.setTurn(M.ctx, { cls:'', who: esc(nm) + ' ' + T('to throw', 'imiss'), note:'' });
  const b = UI.curtain.querySelector('#kn-hand-go');
  if (b) b.onclick = () => { UI.curtain.classList.remove('on'); cue('ui.tap', { gain:0.6 }); go(); };
}

/* ── the machine takes its turn: it shops (applied to st inside the
   engine), those buys go on the log, then it throws. We flush the buys
   as log entries via replay-safe apply for the wire, and animate the
   shot. ── */
function scheduleAI(seat){
  setTurn('ai');
  M.aiPending = setTimeout(() => {
    M.aiPending = 0;
    if (!M || M.dead || M.st.done) return;
    aiPlay(seat);
  }, noMotion() ? 120 : 620);
}
function aiPlay(seat){
  const lvl = M.meta[seat] ? (M.meta[seat].lvl || M.opts.lvl) : M.opts.lvl;
  const strat = (M.meta[seat] && M.meta[seat].strat) || M.opts.strat || 'BAL';
  /* aiTurn applies the buys to st and appends them to st.log itself,
     and returns {buys, shot}. The buys are already in the world; we
     just relay them and repaint. The shot still has to go through apply. */
  const plan = E.aiTurn(M.st, seat, lvl, strat);
  /* relay the buys (they are already applied + logged by the engine) */
  if (plan.buys && plan.buys.length){
    for (const b of plan.buys){ say(seat, { seat, t:'buy', it:b.it }); }
    cue('money.pay', { gain:0.4 });
    hud();
  }
  if (!plan.shot){ // nothing to throw (no crew) — engine will end it
    // force a check by a no-op: the match is likely over
    if (M.st.done){ finish(); return; }
    setTurn('you'); return;
  }
  saveGame();
  fireShot(plan.shot, 'ai');
}

/* ═══════════════════════════════════════════════════════════════════
   THE HUD — coins, wind, integrity, the turn strip. On CHANGE only.
   ═══════════════════════════════════════════════════════════════════ */
function hud(){
  if (!UI || !M) return;
  const v = E.view(M.st);
  if (UI.wind){
    const wd = v.wind;
    const dir = wd === 0 ? '' : wd > 0 ? '→' : '←';
    const arrow = '<svg viewBox="0 0 24 12" aria-hidden="true">' +
      (wd >= 0 ? '<path d="M2 6h18M14 2l6 4-6 4"/>' : '<path d="M22 6H4M10 2L4 6l6 4"/>') + '</svg>';
    UI.wind.innerHTML = (Math.abs(wd) > 3 ? arrow : '') +
      esc(T('Wind', 'Riħ')) + ' <b>' + Math.abs(wd) + '</b>' + (dir ? ' ' + dir : ' ' + esc(T('still', 'kwiet')));
  }
  for (let s = 0; s < 2; s++){
    const el = UI['purse' + s];
    if (!el) continue;
    const sd = v.sides[s], col = SIDECOL[s];
    const mine = (s === mySeat());
    el.innerHTML =
      '<span class="c"><span class="d" style="background:' + col.a + '"></span>' +
        '<span class="co">' + sd.coins + '</span></span>' +
      '<span class="hp">' + esc(mine ? T('You', 'Int') : (M.meta[s] && M.meta[s].name) || SIDECOL[s].n()) +
        ' · ' + sd.alive + '/' + 3 + ' · ' + Math.round(sd.integrity / 10) + '%</span>';
  }
}

let tipTimer = 0;
function tip(html, ms){
  if (!UI || !UI.tip) return;
  UI.tip.innerHTML = html;
  UI.tip.classList.add('on');
  clearTimeout(tipTimer);
  if (ms) tipTimer = setTimeout(() => { if (UI && UI.tip) UI.tip.classList.remove('on'); }, ms);
}

/* point the camera at the both-castles aiming frame. Used whenever a
   turn hands to a player who now has to AIM — the enemy castle must be
   in view before the first finger touch, with no panning. */
function frameForAim(snap){
  if (!M || !M.cam) return;
  const f = frameWhole();
  M.cam.tx = f.x; M.cam.ty = f.y; M.cam.tzoom = f.zoom; M.cam.follow = false;
  M.cam.userPan = false;               /* a fresh aim turn homes the view  */
  if (snap) snapCam();
  refreshReturnBtn();
}
function setTurn(who){
  if (!M || !M.ctx) return;
  if (who === 'you'){
    /* frame BOTH castles so the enemy target is visible before aiming.
       Only snap if the camera is idle (no shell flight easing) so we
       never yank it out from under an in-progress follow. */
    if (M.cam && !M.anim) frameForAim(true);
    P.ui.setTurn(M.ctx, { cls:'good', who:T('Your throw', 'It-tefgħa tiegħek'),
      note:T('Pull back from your soldier and let go.', 'Iġbed lura mis-suldat tiegħek u itilqu.') });
    /* EVERY TURN, the store pops up so you choose what to throw: the water
       balloon is free, everything else costs coins (you earn some each turn).
       Tap 'Done — now throw' to close and aim. */
    if (!M.shopOpen && canAct()) openShop();
    tip(esc(T('Pick your throw, then pull back to aim.', 'Agħżel xi tixħet, imbagħad iġbed lura biex timmira.')), 2600);
  } else if (who === 'ai'){
    P.ui.setTurn(M.ctx, { cls:'', who:T('The machine is thinking', 'Il-magna qed taħseb'), note:'' });
  } else {
    const nm = (M.meta[E.turnOf(M.st)] && M.meta[E.turnOf(M.st)].name) || T('The other castle', 'Il-kastell l-ieħor');
    P.ui.setTurn(M.ctx, { cls:'', who:esc(nm) + ' ' + T('to throw', 'imiss'), note:'' });
  }
}

/* ═══════════════════════════════════════════════════════════════════
   THE WEAPON STRIP — the loadout you can throw right now, tap to pick.
   ═══════════════════════════════════════════════════════════════════ */
function weps(){
  if (!UI || !UI.weps) return;
  const v = E.view(M.st);
  const me = v.sides[mySeat()];
  UI.weps.innerHTML = E.WEAPONS.map(w => {
    const ammo = me.ammo[w.id];
    const cool = me.cool[w.id];
    const off = ammo === 0;
    const cls = 'kn-wep' + (w.id === M.sel ? ' on' : '') + (off ? ' out' : '');
    const amStr = ammo < 0 ? '∞' : (cool > 0 ? '<span class="cd">' + esc(T('cool', 'sakemm')) + ' ' + cool + '</span>' : String(ammo));
    return '<button class="' + cls + '" data-w="' + w.id + '"' + (off ? ' disabled' : '') + '>' +
      '<span class="sw">' + wepGlyph(w.key) + '</span>' +
      '<b>' + esc(TP(w.name)) + '</b><i>' + amStr + '</i></button>';
  }).join('');
}

/* ═══════════════════════════════════════════════════════════════════
   THE STORE — a sheet the current side opens between throws. Every row
   comes from shopView(); a tap that canBuy() applies a 'buy' MOVE.
   ═══════════════════════════════════════════════════════════════════ */
function openShop(){
  if (!canAct()) return;
  M.shopOpen = true;
  paintShop();
  UI.shop.classList.add('open');
  cue('ui.sheet', { gain:0.5 });
}
function closeShop(){
  M.shopOpen = false;
  UI.shop.classList.remove('open');
  cue('ui.sheet', { gain:0.45 });
}
function paintShop(){
  if (!UI || !UI.shopBody) return;
  const seat = mySeat();
  const rows = E.shopView(M.st, seat);
  const coins = M.st.sides[seat].coins;
  UI.shopCoins.textContent = coins + ' ' + T('coins', 'muniti');

  /* group the flat shop into WEAPONS, DEFENCES (upgrades + repairs), EXTRAS */
  const AMMO = [], UPG = [], FIX = [], ONE = [];
  rows.forEach(r => {
    if (r.kind === 0) AMMO.push(r);
    else if (r.kind === 1) UPG.push(r);
    else if (r.kind === 2) FIX.push(r);
    else ONE.push(r);
  });
  const sd = E.view(M.st).sides[seat];

  /* YOUR THROW — what you can throw RIGHT NOW, tap to pick. The water balloon
     (weapon 0) is always here, free and unlimited; bought ammo shows its count.
     The full-screen store hides the weapon strip, so this is how you choose the
     free balloon vs something you bought. */
  const mine = [];
  for (const w of E.WEAPONS){
    const n = sd.ammo[w.id];
    if (w.id === 0 || n > 0) mine.push({ w:w.id, name:w.name, key:w.key, n });
  }
  function throwRow(m){
    const on = (M.sel === m.w);
    const count = m.w === 0 ? T('free · ∞', 'b\'xejn · ∞') : (m.n + '×');
    const hi = on ? ' style="box-shadow:inset 0 0 0 2px var(--gold,#FFC542)"' : '';
    return '<button class="kn-item" data-w="' + m.w + '"' + hi + '>' +
      '<span class="ic"><span class="sw">' + wepGlyph(m.key) + '</span></span>' +
      '<span class="tx"><b>' + esc(TP(m.name)) + '</b>' +
        '<i>' + esc(wepStat(m.w)) + '</i>' +
        '<i>' + (on ? esc(T('Picked — throwing this', 'Magħżul — dan se titfa\'')) :
                       esc(T('Tap to throw this', 'Agħfas biex titfa\' dan'))) + '</i></span>' +
      '<span class="pr">' + esc(count) + '</span>' +
      '</button>';
  }

  function row(r){
    const can = r.can;
    const owned = (r.kind === 1 && sd.tier[r.d] >= (r.to));   /* already at/above this tier */
    const cls = 'kn-item' + (owned ? ' owned' : (can ? '' : ' no'));
    const ic = r.kind === 0 ? '<span class="sw">' + wepGlyph(E.WEAPONS[r.w].key) + '</span>'
             : defGlyph(r);
    const why = (!can && !owned && r.why) ? '<i>' + esc(TP(r.why)) + '</i>' : '';
    const stat = (r.kind === 0) ? '<i>' + esc(wepStat(r.w)) + '</i>' : '';
    return '<button class="' + cls + '" data-it="' + r.it + '"' + ((can && !owned) ? '' : ' disabled') + '>' +
      '<span class="ic">' + ic + '</span>' +
      '<span class="tx"><b>' + esc(TP(r.name)) + '</b>' + stat +
        '<i>' + esc(shorten(TP(r.blurb))) + '</i>' + why + '</span>' +
      '<span class="pr">' + (owned ? esc(T('Have it', 'Diġà')) : (r.cost + ' <small>' + T('coins', 'muniti') + '</small>')) + '</span>' +
      '</button>';
  }
  UI.shopBody.innerHTML =
    (mine.length ? '<div class="kn-grp">' + esc(T('Your throw', 'It-tefgħa tiegħek')) + '</div>' + mine.map(throwRow).join('') : '') +
    (AMMO.length ? '<div class="kn-grp">' + esc(T('Buy something nastier', 'Ixtri xi ħaġa agħar')) + '</div>' + AMMO.map(row).join('') : '') +
    (UPG.length ? '<div class="kn-grp">' + esc(T('Better cover', 'Kenn aħjar')) + '</div>' + UPG.map(row).join('') : '') +
    (FIX.length ? '<div class="kn-grp">' + esc(T('Patch it up', 'Sewwih')) + '</div>' + FIX.map(row).join('') : '') +
    (ONE.length ? '<div class="kn-grp">' + esc(T('Right now', 'Issa')) + '</div>' + ONE.map(row).join('') : '');
}
function defGlyph(r){
  /* a wall / tower / parapet block, coloured by target tier's material */
  const D = E.DEFS[r.d != null ? r.d : 0];
  const tier = r.kind === 2 ? (E.view(M.st).sides[mySeat()].tier[r.d]) : (r.to || 0);
  const mat = D.tiers[Math.max(0, Math.min(3, tier))].mat;
  const c = MATCOL[mat] || { a:'#888', b:'#555' };
  const shape = r.d === 1
    ? '<rect x="9" y="3" width="6" height="18" rx="1" fill="' + c.a + '"/><rect x="12" y="3" width="3" height="18" fill="' + c.b + '"/>'
    : r.d === 2
    ? '<rect x="3" y="13" width="18" height="7" rx="1" fill="' + c.a + '"/><rect x="12" y="13" width="9" height="7" fill="' + c.b + '"/>'
    : '<rect x="4" y="6" width="16" height="14" rx="1" fill="' + c.a + '"/><rect x="12" y="6" width="8" height="14" fill="' + c.b + '"/>';
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + shape + '</svg>';
}
function shorten(s){ s = String(s || ''); return s.length > 92 ? s.slice(0, 90).replace(/\s+\S*$/, '') + '…' : s; }

/* a compact "what it does" line for a weapon, so you see the damage and the
   blast BEFORE you spend a coin on it */
function wepStat(id){
  const w = E.WEAPONS[id]; if (!w) return '';
  const punch = w.knock >= 1.2 ? T('big knock', 'daqqa kbira')
              : w.knock >= 0.85 ? T('good knock', 'daqqa tajba')
              : T('light knock', 'daqqa ħafifa');
  return T('Hits ', 'Jolqot ') + w.dmg + ' · ' + T('blast ', 'blast ') + Math.round(w.r) + ' · ' + punch;
}

function buy(it){
  const seat = mySeat();
  const chk = E.canBuy(M.st, seat, it);
  if (!chk.ok){ tip('<b>' + esc(TP(chk.why)) + '</b>', 1400); cue('move.illegal', { gain:0.5 }); return; }
  const done = E.apply(M.st, { seat, t:'buy', it });
  if (!done){ return; }
  say(seat, { seat, t:'buy', it });
  saveGame();
  cue('money.pay', { gain:0.5 });
  paintShop(); hud(); weps(); draw();
}

/* ═══════════════════════════════════════════════════════════════════
   THE BOARD
   ═══════════════════════════════════════════════════════════════════ */
function board(){
  const ctx = M.ctx;
  ctx.host.classList.add('kn-host');
  ctx.host.innerHTML =
    '<div class="kn-field" id="kn-field">' +
      '<canvas id="kn-cv"></canvas>' +
      '<div class="kn-over">' +
        '<div class="kn-wind" id="kn-wind"></div>' +
        '<div class="kn-purse p0" id="kn-purse0"></div>' +
        '<div class="kn-purse p1" id="kn-purse1"></div>' +
        '<div class="kn-tip" id="kn-tip"></div>' +
      '</div>' +
      /* the SHOOT / LOOK toggle — tap to switch what a drag does: SHOOT
         (aim + fire the slingshot) or LOOK (pan the camera to scout) */
      '<button class="kn-mode-t" id="kn-mode-t" type="button"></button>' +
      /* the "return to base" affordance — appears when you have panned away
         to scout, taps to snap the aim view back onto your slingshot */
      '<button class="kn-home" id="kn-home" type="button" aria-label="' +
        esc(T('Back to your castle', 'Lura lejn il-kastell tiegħek')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M4 11l8-6 8 6M6 10v9h12v-9"/></svg>' +
        '<span>' + esc(T('My base', 'Il-bażi')) + '</span></button>' +
      '<div class="kn-power" id="kn-power"><i id="kn-power-fill"></i></div>' +
      /* the PLACEMENT bar — only on screen while a castle is being laid out */
      '<div class="kn-setup" id="kn-setup"></div>' +
      /* the pass-the-phone curtain — an opaque cover so the next player
         cannot see what the last one just put down */
      '<div class="kn-curtain" id="kn-curtain"></div>' +
      /* the rules panel over the field */
      '<div class="kn-rules" id="kn-rulespanel" aria-hidden="true">' +
        '<div class="kn-rules-h"><h4 id="kn-rules-t"></h4>' +
          '<button class="kn-rules-x" id="kn-rules-x" aria-label="' +
            esc(T('Put the rules away', 'Warrab ir-regoli')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<div class="kn-rules-b" id="kn-rules-b"></div>' +
      '</div>' +
      /* the store sheet */
      '<div class="kn-shop" id="kn-shop" aria-hidden="true">' +
        '<div class="kn-shop-h"><h4>' + esc(T('The store', 'Il-ħanut')) + '</h4>' +
          '<span class="coins" id="kn-shop-coins"></span></div>' +
        '<div class="kn-shop-b" id="kn-shop-b"></div>' +
        '<div class="kn-shop-f"><button class="btn primary" id="kn-shop-done">' +
          esc(T('Done — now throw', 'Lest — issa itfa\'')) + '</button></div>' +
      '</div>' +
    '</div>' +
    '<div class="kn-weps" id="kn-weps"></div>' +
    '<div class="kn-acts">' +
      '<button class="btn ghost sm" id="kn-store">' +
        (window.ILB ? window.ILB('coin', esc(T('Store', 'Ħanut'))) : esc(T('Store', 'Ħanut'))) + '</button>' +
    '</div>';

  const field = ctx.host.querySelector('#kn-field');
  const cv = ctx.host.querySelector('#kn-cv');
  UI = {
    ctx, field, cv,
    g2: cv.getContext('2d'),
    host: ctx.host,
    wind: ctx.host.querySelector('#kn-wind'),
    purse0: ctx.host.querySelector('#kn-purse0'),
    purse1: ctx.host.querySelector('#kn-purse1'),
    tip: ctx.host.querySelector('#kn-tip'),
    power: ctx.host.querySelector('#kn-power'),
    powerFill: ctx.host.querySelector('#kn-power-fill'),
    returnBtn: ctx.host.querySelector('#kn-home'),
    modeBtn: ctx.host.querySelector('#kn-mode-t'),
    setup: ctx.host.querySelector('#kn-setup'),
    curtain: ctx.host.querySelector('#kn-curtain'),
    weps: ctx.host.querySelector('#kn-weps'),
    rules: ctx.host.querySelector('#kn-rulespanel'),
    shop: ctx.host.querySelector('#kn-shop'),
    shopBody: ctx.host.querySelector('#kn-shop-b'),
    shopCoins: ctx.host.querySelector('#kn-shop-coins'),
    sc:1, ox:0, oy:0, dpr:1, cw:1, ch:1, dirty:true
  };
  M.cv = cv; M.g2 = UI.g2;

  wireField();

  UI.weps.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-w]');
    if (!b || b.disabled) return;
    M.sel = +b.getAttribute('data-w');
    weps();
    cue('move.select', { gain:0.4 });
  });
  if (UI.returnBtn) UI.returnBtn.addEventListener('click', () => { returnToBase(); cue('move.select', { gain:0.4 }); });
  if (M.mode == null) M.mode = 'shoot';
  if (UI.modeBtn) UI.modeBtn.addEventListener('click', () => { toggleMode(); cue('move.select', { gain:0.4 }); });
  renderModeBtn();
  ctx.host.querySelector('#kn-store').onclick = () => openShop();
  ctx.host.querySelector('#kn-shop-done').onclick = () => closeShop();
  UI.shopBody.addEventListener('click', e => {
    /* pick what to throw (data-w) — the free balloon or bought ammo */
    const bw = e.target.closest && e.target.closest('[data-w]');
    if (bw){ M.sel = +bw.getAttribute('data-w'); paintShop(); weps(); cue('move.select', { gain:0.4 }); return; }
    /* or buy something (data-it) */
    const b = e.target.closest && e.target.closest('[data-it]');
    if (!b || b.disabled) return;
    buy(+b.getAttribute('data-it'));
  });
  UI.rules.querySelector('#kn-rules-x').addEventListener('click', () => setRules(false));
  ctx.root.addEventListener('pointerdown', e => {
    if (!rulesOpen || !UI || !UI.rules) return;
    const rb = ctx.btn && ctx.btn('kn-rules');
    if (!UI.rules.contains(e.target) && !(rb && rb.contains(e.target))) setRules(false);
  }, true);

  /* the sizer — the only layout read, here and on resize */
  fitCanvas();
  if (typeof ResizeObserver === 'function'){
    const ro = new ResizeObserver(() => { if (UI && UI.host.isConnected) fitCanvas(); });
    ro.observe(ctx.host);
    UI.stopFit = () => ro.disconnect();
  } else {
    const onR = () => { if (UI) fitCanvas(); };
    window.addEventListener('resize', onR);
    UI.stopFit = () => window.removeEventListener('resize', onR);
  }
  requestAnimationFrame(() => { if (UI) fitCanvas(); });
  hud(); weps();
  return UI;
}

function wireField(){
  const f = UI.field;
  let mode = null;   /* 'aim' | 'pan' | 'place' | null — decided on pointerdown */
  f.addEventListener('pointerdown', e => {
    if (rulesOpen || M.shopOpen) return;
    e.preventDefault();
    const px = e.clientX - rectLeft(), py = e.clientY - rectTop();
    /* WHILE THE CASTLES ARE BEING LAID OUT the field does one thing only:
       it places. No aiming (canAct() is false in this phase) and no
       panning, so a stray drag can never lose the player their own half. */
    if (M.phase === 'place'){
      mode = 'place';
      try { f.setPointerCapture(e.pointerId); } catch(_){}
      placeDown(px, py);
      return;
    }
    /* THE EXPLICIT SHOOT / LOOK BUTTON decides the gesture, so the player
       always knows what a drag will do (no implicit drag-region hit-test):
         · SHOOT mode + your turn → a drag AIMS + fires the slingshot;
         · LOOK mode (or not your turn) → a drag PANS the camera to scout.
       In SHOOT mode we auto-home the view onto your base so the sling is
       under the thumb. */
    const wantAim = (M.mode !== 'look') && canAct();
    if (wantAim){
      mode = 'aim';
      if (M.cam && M.cam.userPan) returnToBase();
      try { f.setPointerCapture(e.pointerId); } catch(_){}
      beginAim(px, py);
    } else {
      mode = 'pan';
      try { f.setPointerCapture(e.pointerId); } catch(_){}
      beginPan(px, py);
    }
  });
  f.addEventListener('pointermove', e => {
    if (!mode) return;
    const px = e.clientX - rectLeft(), py = e.clientY - rectTop();
    if (mode === 'place') placeMove(px, py);
    else if (mode === 'aim') moveAim(px, py);
    else movePan(px, py);
  });
  const up = e => {
    if (!mode) return;
    const m = mode; mode = null;
    if (m === 'place') placeUp();
    else if (m === 'aim') endAim();
    else { endPan(); refreshReturnBtn(); }
  };
  f.addEventListener('pointerup', up);
  f.addEventListener('pointercancel', () => {
    if (mode === 'place'){ mode = null; placeUp(); return; }
    if (mode === 'pan'){ mode = null; endPan(); refreshReturnBtn(); return; }
    mode = null; M.drag = null; M.preview = null;
    if (UI.power) UI.power.classList.remove('on'); draw();
  });

  /* keyboard, for the desk and the harness: arrows nudge, space fires
     a straight-ahead ranging shot at half power */
  UI.keys = e => {
    if (!canAct()) return;
    if (e.key === ' ' || e.key === 'Enter'){
      e.preventDefault();
      const seat = mySeat();
      const face = seat === 0 ? 1 : -1;
      fireShot({ seat, w:M.sel, dx: 70 * face, dy: -70 }, 'me');
    }
  };
  window.addEventListener('keydown', UI.keys);

  function rectLeft(){ return f.getBoundingClientRect().left; }
  function rectTop(){ return f.getBoundingClientRect().top; }
  UI._rectLeft = rectLeft; UI._rectTop = rectTop;
}

/* ═══════════════════════════════════════════════════════════════════
   THE RULES CARD
   ═══════════════════════════════════════════════════════════════════ */
function rulesFor(){
  return [
    T('Two crews on boxes in the water. You throw, they throw, until one side is all <b>in the sea</b>.',
      'Żewġ ekwipaġġi fuq kaxxi fl-ilma. Titfa\', jitfgħu, sakemm naħa waħda tispiċċa kollha <b>fil-baħar</b>.'),
    T('<b>Pull back</b> from your soldier like a slingshot and let go. Further back is harder; ' +
      'the dotted line shows where it will land.',
      '<b>Iġbed lura</b> mill-kastell tiegħek bħal żbandola u itilqu. Aktar lura, aktar b\'saħħtu; ' +
      'il-linja bit-tikek turik fejn se jinżel.'),
    T('The shots <b>bounce</b>. Bank a pastizz off the rock in the middle into somebody hiding.',
      'It-tefgħat <b>jaqbżu</b>. Ferra\' pastizz mal-blata fin-nofs għal fuq min qed jinħeba.'),
    T('Between throws, spend what you earned in the <b>store</b>: bigger weapons, and better walls, ' +
      'towers and parapets — or a repair.',
      'Bejn tefgħa u oħra, onfoq dak li qlajt fil-<b>ħanut</b>: armi akbar, u ħitan, torrijiet u ' +
      'parapetti aħjar — jew tiswija.'),
    T('The <b>wind</b> pushes light shots and drifts a little each turn — learn it.',
      'Ir-<b>riħ</b> jimbotta t-tefgħat ħfief u jinbidel ftit kull dawra — itgħallmu.'),
    T('Knock all three of them into the moat, or be the fuller courtyard when the throws run out.',
      'Waddab it-tlieta tagħhom fil-foss, jew kun il-bitħa l-aktar mimlija meta jispiċċaw it-tefgħat.')
  ];
}
function clampRules(){
  if (!UI || !UI.rules || !UI.field) return;
  try { UI.rules.style.maxHeight = Math.max(140, Math.floor(UI.field.clientHeight * 0.82)) + 'px'; } catch(e){}
}
function paintRules(){
  if (!UI || !UI.rules) return;
  clampRules();
  UI.rules.querySelector('#kn-rules-t').textContent = 'IL-KANUN — ' + T('the rules', 'ir-regoli');
  UI.rules.querySelector('#kn-rules-b').innerHTML =
    '<ul>' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul>';
  UI.rules.classList.toggle('open', rulesOpen);
  UI.rules.setAttribute('aria-hidden', rulesOpen ? 'false' : 'true');
  const rb = M && M.ctx && M.ctx.btn && M.ctx.btn('kn-rules');
  if (rb) rb.setAttribute('aria-expanded', rulesOpen ? 'true' : 'false');
}
function setRules(open){
  rulesOpen = !!open;
  try { localStorage.setItem(UIKEY + '.rules', rulesOpen ? '1' : '0'); } catch(e){}
  paintRules();
}
window.addEventListener('resize', () => { if (UI && rulesOpen) clampRules(); });

/* ═══════════════════════════════════════════════════════════════════
   THE END OF A MATCH — into IR-REBBIEĦ, the shared winner screen.
   ═══════════════════════════════════════════════════════════════════ */
function finish(){
  if (!M || M.finished) return;
  M.finished = true;
  stopAnim();
  const st = M.st;
  const won = st.done && st.done.winner === M.me;
  const draw2 = st.done && st.done.winner < 0;
  const solo = !M.net;

  /* the record + XP. Offline the old funnel stands: P.record is wrapped
     by progress.js and pays as a side effect. ONLINE that funnel never
     fired — the podium never calls P.ui.result either, so an online win
     paid nothing. The online path pays itself through KARTI_XP.awardPlay,
     exactly once under the match id, and settles a staked pot through
     mp.js's own idempotent door. earnings() REPORTS; here is where the
     UI decides to hand it to KARTI's economy — never in-match. */
  let xp = null, potRes = null;
  if (solo){
    ST.rec[draw2 ? 'd' : won ? 'w' : 'l']++;
    persist();
    try {
      const earn = E.earnings(st, M.me);
      if (P.record) P.record('kanun', draw2 ? 'd' : won ? 'w' : 'l');
      else if (window.KARTI_XP && KARTI_XP.finish)
        KARTI_XP.finish({ game:'kanun', result: draw2 ? 'd' : won ? 'w' : 'l', ms: 1 });
      xp = { gained: earn.xp };
    } catch(e){}
  } else {
    ST.rec[draw2 ? 'd' : won ? 'w' : 'l']++;
    persist();
    const MPX = window.KARTI_MP;
    const staked = !!(MPX && MPX.MP && MPX.MP.stakeLive);
    const mid = 'kanun:' + ((MPX && MPX.MP && MPX.MP.code) || 'room') + ':' + (M.seed >>> 0);
    let pay = null;
    try {
      if (window.KARTI_XP && KARTI_XP.awardPlay){
        const r = KARTI_XP.awardPlay({
          game:'kanun', won, draw: draw2, id: mid, ranked: staked });
        if (r && r.counted) pay = r;
      }
    } catch(e){}
    /* shelf badge, NO award attached (P.record is wrapped to pay) */
    try { if (P.tally) P.tally('kanun', draw2 ? 'd' : won ? 'w' : 'l'); } catch(e){}
    try {
      if (window.KARTI_STATS && KARTI_STATS.record)
        KARTI_STATS.record('kanun', {
          result: won ? 'win' : (draw2 ? 'draw' : 'loss'), id: mid });
    } catch(e){}
    if (staked && MPX.stakeSettle){
      try { potRes = MPX.stakeSettle(won ? 'win' : (draw2 ? 'draw' : 'lose')); } catch(e){}
    }
    if (pay){
      xp = { level: pay.level, gained: pay.xp, leveledUp: !!pay.levelled,
             before: 0, after: pay.levelled ? 1 : 0.7 };
      xp.pay = pay;                      /* the raw figures, for the reward block */
    }
  }
  ST.save = null; persistNow();   /* the match is done; drop the autosave */

  cue(won ? 'game.win' : draw2 ? 'duel.draw' : 'game.lose', { gain:0.9 }, true);
  setTimeout(() => { if (M && !M.dead) showResult(won, draw2, xp, potRes); }, 560);
}

function showResult(won, draw2, xp, potRes){
  if (!M) return;
  const st = M.st;
  const pay = xp && xp.pay;
  /* two rows for the two castles, placed by who won */
  const meName = (M.meta[M.me] && M.meta[M.me].name) || T('You', 'Int');
  const foe = M.me === 0 ? 1 : 0;
  const foeName = (M.meta[foe] && M.meta[foe].name) || SIDECOL[foe].n();
  const meScore = E.crewHp(st, M.me) + E.aliveCrew(st, M.me) * 100;
  const foeScore = E.crewHp(st, foe) + E.aliveCrew(st, foe) * 100;
  const mePlace = draw2 ? 1 : won ? 1 : 2;
  const rows = [
    { name: meName, score: meScore, place: mePlace, you:true,
      avatar: (K.avatar && K.avatar()) || null },
    { name: foeName, score: foeScore, place: draw2 ? 1 : won ? 2 : 1,
      bot: !(M.meta[foe] && M.meta[foe].own === 'net') }
  ];

  const REB = window.KARTI_REBBIEH;
  if (REB && REB.show){
    REB.show({
      lang: window.KARTI_LANG ? KARTI_LANG.lang() : 'en',
      reduced: noMotion(),
      title: draw2 ? T('Dead level', 'Ndaqs') : won ? T('The castle stands', 'Il-kastell jibqa\' wieqaf')
                                                    : T('Into the moat', 'Fil-foss'),
      subtitle: TP(st.done && st.done.why),
      rows,
      xp: xp,
      reward: (pay || potRes) ? {
        xp: pay ? pay.xp : 0,
        chips: pay ? (pay.chips | 0) + (pay.chipsLevel | 0) : 0,
        wonBonus: pay ? pay.wonBonus : 0,
        staked: potRes ? potRes.ante : 0,
        pot: (potRes && potRes.kind === 'win') ? potRes.pot : 0
      } : undefined,
      sound: id => cue(id, { gain:0.7 }, true),
      playAgainLabel: T('Again', 'Erġa\''),
      onPlayAgain: () => { if (M && M.net) rematchAsk(); else newGame(M.opts); },
      onLeave: () => { const nx = M && M.net; leave(); if (nx && nx.onLeave) nx.onLeave(); else menu(); }
    });
    return;
  }
  /* rebbieh missing (harness without it): fall back to the party result */
  P.ui.result(M.ctx, {
    tone: draw2 ? 'draw' : won ? 'win' : 'lose',
    head: draw2 ? T('Dead level', 'Ndaqs') : won ? T('You win', 'Rbaħt') : T('You lose', 'Tlift'),
    why: TP(st.done && st.done.why),
    buttons: [
      { label:T('Again', 'Erġa\''), icon:'refresh', cls:'primary',
        go: () => { if (M && M.net) rematchAsk(); else newGame(M.opts); } },
      { label:T('Back', 'Lura'), icon:'back', cls:'ghost',
        go: () => { const nx = M && M.net; leave(); if (nx && nx.onLeave) nx.onLeave(); else menu(); } }
    ]
  });
}
function rematchAsk(){
  const nx = M.net; leave();
  if (nx && nx.onLeave) nx.onLeave(); else menu();
}

/* ═══════════════════════════════════════════════════════════════════
   OPENING AND CLOSING
   ═══════════════════════════════════════════════════════════════════ */
function newGame(opts){
  injectCSS();
  P.show();
  const o = Object.assign({}, opts || {});
  startMatch(o, null, null);
  /* solo: this phone drives seat 0 (you) AND is authoritative over the
     machine on seat 1 — so seat 1 goes in M.mine, otherwise afterThrow()
     mistakes the AI's turn for a remote human's and waits forever
     (the machine never fires). See afterThrow(). */
  M.me = 0; M.mine = [0, 1]; M.viewSeat = 0;
  M.meta = [
    { name:T('You', 'Int'), own:'me', lvl:o.lvl || 2 },
    { name: levelWords(o.lvl || 2).n, own:'ai', lvl:o.lvl || 2, strat: o.strat || 'BAL' }
  ];
  /* pick a sensible starting weapon: the free balloon */
  M.sel = 0;
  openBoard(() => menu());
  /* SET OUT THE CASTLES FIRST. You lay out seat 0; the machine's own
     layout is a pure hash of the seed, so it is decided here without a
     coin toss and any phone replaying this match builds the identical
     enemy castle — which is exactly what the fog then hides. */
  placeStart([0], [null, E.aiPlace(M.seed, 1)]);
}

/* TWO PLAYERS, ONE PHONE. Both lay out their own castle behind an opaque
   curtain, then throw in turn — and because the whole screen (fog,
   reveals, the persistent last-shot arc) is keyed on M.viewSeat, handing
   the phone over hands the point of view over with it. */
function newGameHotseat(opts){
  injectCSS();
  P.show();
  const o = Object.assign({}, opts || {});
  startMatch(o, null, null);
  M.me = 0; M.mine = [0, 1]; M.viewSeat = 0; M.hotseat = true;
  M.meta = [
    { name:T('Blue', 'Blu'), own:'me', lvl:2 },
    { name:T('Red',  'Aħmar'), own:'me', lvl:2 }
  ];
  M.sel = 0;
  openBoard(() => menu());
  placeStart([0, 1], [null, null]);
}

/* resume the autosaved match, if any */
function resumeGame(){
  if (!ST.save) { menu(); return; }
  injectCSS();
  P.show();
  let st = null;
  try { st = E.restore(ST.save.snap); } catch(e){}
  if (!st){ ST.save = null; persist(); menu(); return; }
  const o = ST.save.opts || { lvl:2, strat:'BAL' };
  const V = VARIANTS[o.variant] ? o.variant : 'malta';
  const hot = !!o.hotseat;
  stopAnim(); stopFx();
  M = {
    opts:o, seed: st.seed, st,
    net:null, me:0, mine:[0, 1], meta: hot ? [
      { name:T('Blue', 'Blu'),  own:'me', lvl:2 },
      { name:T('Red',  'Aħmar'), own:'me', lvl:2 }
    ] : [
      { name:T('You', 'Int'), own:'me', lvl:o.lvl || 2 },
      { name: levelWords(o.lvl || 2).n, own:'ai', lvl:o.lvl || 2, strat:o.strat || 'BAL' }
    ],
    ctx:null, cv:null, g2:null, sel:0, drag:null, preview:null, anim:null,
    cam:null, fx:null, revealsBy:[[], []], lastArc:[null, null], lastShot:[null, null],
    viewSeat:0, phase:'play', place:null, hotseat:hot,
    engOpts:(ST.save.snap && ST.save.snap.opts) || {},
    theme:THEMES[VARIANTS[V].theme], variant:V,
    raf:0, busy:false, dead:false, finished:false, shopOpen:false, aiPending:0
  };
  openBoard(() => menu());
  const cur = E.turnOf(M.st);
  /* a resumed match keeps the layouts it was saved with — they are in the
     snapshot's opts, so E.restore() already rebuilt the world with them */
  if (hot && cur >= 0) M.viewSeat = cur;
  if (cur < 0){ finish(); }
  else if (!hot && cur === 1){ scheduleAI(1); }
  else { setTurn('you'); }
}

function saveGame(){
  if (!M || M.net || M.st.done) { return; }
  try { ST.save = { snap: E.snapshot(M.st), opts: M.opts }; persist(); } catch(e){}
}

function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: 'IL-KANUN',
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'kn-rules', label:T('Rules', 'Regoli'), icon:'book',    cls:'ghost' },
      { id:'kn-new',   label:T('New', 'Ġdida'),    icon:'refresh', cls:'ghost' }
    ]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();   /* the square-board sizer is not ours */
  M.ctx.badge.textContent = levelWords(M.opts.lvl || 2).n;
  board();
  M.ctx.btn('kn-rules').onclick = () => setRules(!rulesOpen);
  paintRules();
  const nb = M.ctx.btn('kn-new');
  if (nb) nb.onclick = () => { if (M.net) rematchAsk(); else newGame(M.opts); };
  P.ui.setTurn(M.ctx, { cls:'', who:T('Ready', 'Lest'),
    note:T('Pull back from your soldier to aim.', 'Iġbed lura mis-suldat biex timmira.') });
}

function leave(){
  stopAnim(); stopFx();
  if (M){ stopPanMomentum(); if (M._easeRaf){ cancelAnimationFrame(M._easeRaf); M._easeRaf = 0; } M.pan = null; }
  if (M && M.aiPending){ clearTimeout(M.aiPending); M.aiPending = 0; }
  if (UI){
    if (UI.stopFit) { try { UI.stopFit(); } catch(e){} }
    if (UI.keys) { try { window.removeEventListener('keydown', UI.keys); } catch(e){} }
  }
  if (M){ M.dead = true; persistNow(); }
  M = null; UI = null;
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — say() is the ONE place a local move leaves this phone,
   AFTER it has already been applied here. Offline M.net is null and
   this is a no-op, so solo needs no network at all. The shape follows
   js/rummy-ui.js so js/mp.js's machinery carries it unchanged.
   ═══════════════════════════════════════════════════════════════════ */
function say(seat, mv){
  if (!M || !M.net) return;
  const w = E.encWire(mv);
  if (!w) return;
  fire(moveSubs, { seat, move: w, src:'local' });
}

/* a move from another chair. Applied through the same apply() as ours;
   determinism is the engine's guarantee, so we just animate the result. */
function onlineRemote(seat, wire){
  if (!M || M.dead || !M.net) return null;
  const g = M.net.toGame ? M.net.toGame[seat] : seat;
  if (g === undefined) return { ok:false, why:'a move from a chair not at this table' };
  if (M.mine.indexOf(g) >= 0) return null;      /* our own, echoed back */
  const mv = E.decWire(wire, g);
  if (!mv) return { ok:false, why:'a move this table does not know' };

  if (mv.t === 'buy'){
    const done = E.apply(M.st, { seat:g, t:'buy', it:mv.it });
    if (!done) return { ok:false, why:'a purchase the ledger will not have' };
    hud(); if (M.shopOpen) paintShop();
    return null;
  }
  if (mv.t === 'quit'){
    E.apply(M.st, { seat:g, t:'quit' });
    if (M.st.done){ finish(); }
    return null;
  }
  /* a throw — apply and animate, then hand back to the turn machinery.
     If we are still animating our own, fireShot QUEUES it (it must never
     be dropped: the sender's engine has already applied it). */
  const chk = E.legal(M.st, { seat:g, w:mv.w, dx:mv.dx, dy:mv.dy });
  if (!chk.ok) return { ok:false, why:'a refused throw (' + (chk.why ? chk.why.en : '?') + ')' };
  fireShot({ seat:g, w:mv.w, dx:mv.dx, dy:mv.dy }, 'net');
  return null;
}

function onlineNote(text, tone){ if (M && M.ctx) P.ui.setNet(M.ctx, text || '', tone || ''); }
function onlineStop(why, tone){
  if (!M || M.dead || !M.ctx) return;
  stopAnim(); M.finished = true;
  P.ui.setNet(M.ctx, '', '');
  P.ui.result(M.ctx, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? T('No game', 'L-ebda logħba') : T('Cut off', 'Maqtugħ'),
    why: why || T('The battlefield stopped.', 'Il-kamp waqaf.'),
    quip: T('Nothing was banked. Nobody loses a match over a dropped connection.',
            'Xejn ma nġabar. Ħadd ma jitlef partita minħabba konnessjoni li waqgħet.'),
    buttons: [{ label:T('Back to the rooms', 'Lura għall-kmamar'), icon:'back', cls:'primary',
      go: () => { const nx = M.net; leave(); if (nx && nx.onLeave) nx.onLeave(); else P.hub(); } }]
  });
}

function onlineStart(cfg){
  cfg = cfg || {};
  const chairs = (cfg.seats || []).filter(Boolean);
  const n = chairs.length;
  if (n !== 2) throw new Error('IL-KANUN: two castles, not ' + n);

  const toGame = {}, toRoom = [];
  chairs.forEach((s, g) => {
    const room = (typeof s.seat === 'number') ? s.seat : g;
    toGame[room] = g; toRoom[g] = room;
  });
  const meG = (toGame[cfg.you] !== undefined) ? toGame[cfg.you] : 0;
  const iAmHost = (cfg.you === (cfg.host | 0));
  const lvl = (chairs.map(s => s && s.level).find(v => v)) || 2;

  /* the room's variant word decides the battlefield for BOTH phones. It
     rides in on cfg.variant (the relay's word), and because a variant is
     only theme + purse + weapon-set, all of which go into the match tuple
     the same way on every phone, both build the identical world. */
  const variant = VARIANTS[String(cfg.variant || '').toLowerCase()] ? String(cfg.variant).toLowerCase() : 'malta';

  leave();
  injectCSS();
  startMatch({ lvl, first:0, variant }, cfg.seed >>> 0, null);
  M.net = Object.assign({}, cfg.net, { host:iAmHost, toGame, toRoom });
  M.me = meG;
  M.viewSeat = meG;
  M.mine = [meG];
  chairs.forEach((s, g) => {
    if (s.kind === 'cpu' && iAmHost) M.mine.push(g);
  });
  M.meta = chairs.map((s, g) => ({
    name: String(s.name || SIDECOL[g].n()).slice(0, 14),
    own:  g === meG ? 'me' : (s.kind === 'cpu' ? 'ai' : 'net'),
    lvl:  s.level || lvl, strat:'BAL'
  }));
  M.sel = 0;

  P.show();
  openBoard(() => { const nx = M.net; leave(); if (nx && nx.onLeave) nx.onLeave(); else P.hub(); });
  const cur = E.turnOf(M.st);
  if (M.mine.indexOf(cur) >= 0 && M.meta[cur] && M.meta[cur].own === 'ai') scheduleAI(cur);
  else if (cur === M.me) setTurn('you'); else setTurn('them');
  cue('game.start', { gain:0.9 }, true);
  return null;
}

const NET_HOOKS = {
  live:      () => !!(M && !M.dead && !M.st.done),
  phase:     () => !M ? 'idle' : (M.st.done ? 'over' : 'play'),
  seed:      () => (M ? M.seed : null),
  gameId:    () => (M ? 'kanun' : null),
  turn:      () => (M && M.net) ? (M.net.toRoom[E.turnOf(M.st)] != null
                                   ? M.net.toRoom[E.turnOf(M.st)] : -1) : -1,
  over:      () => (M ? !!M.st.done : null),
  moveCount: () => (M ? M.st.log.length : 0),
  check:     () => (M ? String(E.fingerprint(M.st)) : ''),
  onMove: fn => {
    const f = info => {
      if (!M || M.dead || !M.net || !info) return;
      const room = M.net.toRoom ? M.net.toRoom[info.seat] : info.seat;
      fn(info.move, { seat: (room == null ? info.seat : room), src: info.src });
    };
    moveSubs.push(f);
    return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); };
  },
  apply: (seat, wire) => onlineRemote(seat, wire),
  seatGone: seat => {
    if (!M || M.dead || !M.net) return;
    const g = M.net.toGame[seat];
    if (g === undefined || !M.st.sides[g]) return;
    if (M.st.done) return;
    E.apply(M.st, { seat:g, t:'quit' });
    if (M.st.done) finish();
  }
};

P.online = P.online || {};
P.online.kanun = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  live: () => NET_HOOKS.live(),
  hooks: NET_HOOKS
};

/* ═══════════════════════════════════════════════════════════════════
   THE MENU
   ═══════════════════════════════════════════════════════════════════ */
function heroCanvas(){
  /* a dramatic full-bleed scene: moody dusk sky, a far skyline, two
     castles across the harbour, a glowing shell arcing over with a
     tapered trail, and a bright impact burst on the far keep. Rendered
     once to an internal buffer and scaled to fill the hero box (the
     CSS pins it to inset:0). Decoration only — no engine, no image. */
  const w = 400, h = 220, dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const th = THEMES.dusk;
  /* sky */
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, th.sky0); sky.addColorStop(0.55, th.sky1); sky.addColorStop(1, th.sky2);
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  /* a low sun glow */
  const gl = g.createRadialGradient(w * 0.72, h * 0.2, 0, w * 0.72, h * 0.2, w * 0.5);
  gl.addColorStop(0, 'rgba(255,150,90,.45)'); gl.addColorStop(1, 'rgba(255,150,90,0)');
  g.fillStyle = gl; g.fillRect(0, 0, w, h);
  const horizon = h - 44;
  /* far skyline silhouette */
  g.fillStyle = th.hill;
  g.beginPath(); g.moveTo(0, horizon);
  let s = 7;
  for (let x = 0; x <= w; x += 26){ s = (s * 1103515245 + 12345) & 0x7fffffff;
    const hh = (s % 100) / 100 * 30 + 8; g.lineTo(x, horizon - hh); g.lineTo(x + 13, horizon - hh * 0.6); }
  g.lineTo(w, horizon); g.closePath(); g.fill();
  /* a dome landmark */
  g.fillStyle = th.hill2; g.beginPath(); g.arc(w * 0.5, horizon - 30, 20, Math.PI, 0); g.fill();
  g.fillRect(w * 0.5 - 20, horizon - 30, 40, 30);
  /* sea */
  const sea = g.createLinearGradient(0, horizon, 0, h);
  sea.addColorStop(0, th.sea0); sea.addColorStop(1, th.sea1);
  g.fillStyle = sea; g.fillRect(0, horizon, w, h - horizon);
  g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(0, horizon, w, 2);
  /* castles */
  drawCastle(g, 26, horizon, SIDECOL[0], false, 1.5);
  drawCastle(g, w - 92, horizon, SIDECOL[1], true, 1.5);
  /* the rock */
  g.fillStyle = '#4a4238';
  g.beginPath(); g.moveTo(w/2 - 12, horizon); g.lineTo(w/2, horizon - 24); g.lineTo(w/2 + 12, horizon); g.closePath(); g.fill();
  /* the arcing shot: a tapered glowing trail */
  const arc = [];
  for (let i = 0; i <= 40; i++){ const t = i / 40;
    arc.push(64 + t * (w - 168), (horizon - 26) - Math.sin(t * Math.PI) * 118); }
  for (let i = 2; i < arc.length; i += 2){ const f = i / arc.length;
    g.strokeStyle = 'rgba(255,214,140,' + (0.08 + f * 0.5).toFixed(2) + ')';
    g.lineWidth = 1 + f * 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(arc[i - 2], arc[i - 1]); g.lineTo(arc[i], arc[i + 1]); g.stroke(); }
  /* the shell near the far end, glowing */
  const sxp = arc[arc.length - 8], syp = arc[arc.length - 7];
  const sgl = g.createRadialGradient(sxp, syp, 0, sxp, syp, 16);
  sgl.addColorStop(0, 'rgba(255,230,160,.9)'); sgl.addColorStop(1, 'rgba(255,230,160,0)');
  g.fillStyle = sgl; g.beginPath(); g.arc(sxp, syp, 16, 0, 6.2832); g.fill();
  g.fillStyle = '#FFE8A0'; g.beginPath(); g.arc(sxp, syp, 4, 0, 6.2832); g.fill();
  /* an impact burst on the far keep */
  const ix = w - 70, iy = horizon - 30;
  const bgl = g.createRadialGradient(ix, iy, 0, ix, iy, 30);
  bgl.addColorStop(0, 'rgba(255,180,90,.85)'); bgl.addColorStop(0.5, 'rgba(255,120,60,.5)'); bgl.addColorStop(1, 'rgba(255,120,60,0)');
  g.fillStyle = bgl; g.beginPath(); g.arc(ix, iy, 30, 0, 6.2832); g.fill();
  for (let i = 0; i < 10; i++){ const a = i / 10 * 6.283, r = 10 + (i % 3) * 8;
    g.fillStyle = 'rgba(255,200,120,.8)';
    g.fillRect(ix + Math.cos(a) * r, iy + Math.sin(a) * r - 4, 3, 3); }
  /* a soft vignette so the title lockup reads */
  const vg = g.createLinearGradient(0, h * 0.4, 0, h);
  vg.addColorStop(0, 'rgba(7,13,21,0)'); vg.addColorStop(1, 'rgba(7,13,21,.78)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  return cv;
}
function drawCastle(g, x, gy, col, flip, sc){
  sc = sc || 1;
  g.fillStyle = col.b;
  g.fillRect(x, gy - 30 * sc, 44 * sc, 30 * sc);
  g.fillStyle = col.a;
  for (let i = 0; i < 4; i++) g.fillRect(x + i * 11 * sc, gy - 36 * sc, 7 * sc, 8 * sc);
  const tx = flip ? x + 34 * sc : x + 2 * sc;
  g.fillStyle = col.b; g.fillRect(tx, gy - 46 * sc, 10 * sc, 46 * sc);
  g.fillStyle = col.flag;
  g.beginPath(); g.moveTo(tx + 10 * sc, gy - 46 * sc); g.lineTo(tx + 22 * sc, gy - 42 * sc);
  g.lineTo(tx + 10 * sc, gy - 38 * sc); g.closePath(); g.fill();
}

/* ── the ENTRY screen: a few big choices, nothing else. Pick HOW to
   play, optionally read the rules in the slide-up panel, go. Settings
   live AFTER a mode is chosen (aiSetup for solo; the lobby online). ── */
const ICO_GLOBE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/>' +
  '<path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>';
const ICO_BOT = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="8" width="14" height="10" rx="2"/>' +
  '<path d="M12 8V4M9 13h.01M15 13h.01M2 12v3M22 12v3"/></svg>';
const ICO_BOOK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/>' +
  '<path d="M4 19a2 2 0 0 1 2-2h12"/></svg>';
const ICO_CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const ICO_PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10 18h4"/></svg>';

function menu(){
  injectCSS();
  P.show();
  stopAnim(); M = null; UI = null;
  const el = P.ui.screenEl();
  const hasSave = !!(ST.save && ST.save.snap);

  el.innerHTML =
    '<div class="pt-wrap kn-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="kn-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>IL-KANUN</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="kn-hero" id="kn-hero" aria-hidden="true">' +
        '<div class="kn-hero-art" id="kn-hero-art"></div>' +
        '<div class="kn-hero-lock">' +
          '<span class="kn-hero-cap">' + esc(T('WAR ON THE WATER', 'GWERRA FUQ L-ILMA')) + '</span>' +
          '<h1 class="kn-hero-title">IL-KANUN</h1>' +
          '<p class="kn-hero-sub">' + esc(T('Three boxes on the water and a slingshot.',
            'Tliet kaxxi fuq l-ilma u żbandola.')) + '</p>' +
        '</div>' +
      '</div>' +

      (hasSave ? '<button class="btn primary" id="kn-resume" style="margin:2px 0 12px">' +
        esc(T('Carry on the last match', 'Kompli l-aħħar partita')) + '</button>' : '') +

      '<div class="kn-modes">' +
        '<button class="kn-mode primary" id="kn-m-online">' +
          '<span class="mi">' + ICO_GLOBE + '</span>' +
          '<span class="mt"><b>' + esc(T('Play online', 'Ilgħab onlajn')) + '</b>' +
            '<i>' + esc(T('Two crews on the water, two phones.', 'Żewġ ekwipaġġi fuq l-ilma, żewġ telefowns.')) + '</i></span>' +
          '<span class="chev">' + ICO_CHEV + '</span>' +
        '</button>' +
        '<button class="kn-mode" id="kn-m-ai">' +
          '<span class="mi">' + ICO_BOT + '</span>' +
          '<span class="mt"><b>' + esc(T('Play with AI', 'Ilgħab mal-magna')) + '</b>' +
            '<i>' + esc(T('You against the machine.', 'Int kontra l-magna.')) + '</i></span>' +
          '<span class="chev">' + ICO_CHEV + '</span>' +
        '</button>' +
        '<button class="kn-mode" id="kn-m-hot">' +
          '<span class="mi">' + ICO_PHONE + '</span>' +
          '<span class="mt"><b>' + esc(T('Two on one phone', 'Tnejn fuq telefon')) + '</b>' +
            '<i>' + esc(T('Lay out your castles in turn, then throw.',
                          'Ħejju l-kastelli tagħkom wieħed wara l-ieħor, imbagħad itfgħu.')) + '</i></span>' +
          '<span class="chev">' + ICO_CHEV + '</span>' +
        '</button>' +
        '<button class="kn-mode" id="kn-m-rules">' +
          '<span class="mi">' + ICO_BOOK + '</span>' +
          '<span class="mt"><b>' + esc(T('How to play', 'Kif tilgħabha')) + '</b>' +
            '<i>' + esc(T('The rules, in a nutshell.', 'Ir-regoli, fil-qosor.')) + '</i></span>' +
          '<span class="chev">' + ICO_CHEV + '</span>' +
        '</button>' +
      '</div>' +
      '<div style="height:12px"></div>' +
    '</div>' +
    /* the slide-up rules panel — clean, never dumped on the screen */
    '<div class="kn-scrim" id="kn-mscrim"></div>' +
    '<div class="kn-mrules" id="kn-mrules" aria-hidden="true">' +
      '<div class="kn-mrules-h"><h4>IL-KANUN — ' + esc(T('the rules', 'ir-regoli')) + '</h4>' +
        '<button class="kn-rules-x" id="kn-mrules-x" aria-label="' + esc(T('Close', 'Agħlaq')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="kn-mrules-b"><ul>' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul></div>' +
    '</div>' +
    '</div>';

  const hero = el.querySelector('#kn-hero');
  if (hero) hero.insertBefore(heroCanvas(), hero.firstChild);

  el.querySelector('#kn-back').onclick = () => { cue('ui.back', { gain:0.7 }); P.hub(); };
  const res = el.querySelector('#kn-resume');
  if (res) res.onclick = () => { cue('ui.tap', { gain:0.6 }); resumeGame(); };

  el.querySelector('#kn-m-ai').onclick = () => { cue('ui.tap', { gain:0.6 }); aiSetup(); };
  el.querySelector('#kn-m-online').onclick = () => { cue('ui.tap', { gain:0.6 }); goOnline(); };
  el.querySelector('#kn-m-hot').onclick = () => {
    cue('ui.tap', { gain:0.6 });
    const p = pref();
    ST.save = null; persist();
    newGameHotseat({ lvl:2, first:0, strat:'BAL', hotseat:true,
                     variant: VARIANTS[p.variant] ? p.variant : 'malta' });
  };

  const panel = el.querySelector('#kn-mrules');
  const scrim = el.querySelector('#kn-mscrim');
  const openR = () => { cue('ui.sheet', { gain:0.55 }); panel.classList.add('open'); scrim.classList.add('on');
                        panel.setAttribute('aria-hidden', 'false'); };
  const closeR = () => { panel.classList.remove('open'); scrim.classList.remove('on');
                         panel.setAttribute('aria-hidden', 'true'); };
  el.querySelector('#kn-m-rules').onclick = openR;
  el.querySelector('#kn-mrules-x').onclick = closeR;
  scrim.onclick = closeR;
}

/* PLAY ONLINE — the room list is the shared lobby's business. If the
   lobby cannot open a kanun room (the relay word is unknown), say so
   honestly and fall back to AI. */
function goOnline(){
  const can = R.lobby.canStart();
  /* If the relay ever learns the word "kanun", canStart() returns ok
     and the shared lobby opens the room (mp.js is the only caller that
     routes there). Until then it refuses in words — say so honestly
     and offer the machine, never a dead room. */
  if (can && can.ok && window.KARTI_MP && KARTI_MP.openFor){
    try { KARTI_MP.openFor('kanun'); return; } catch(e){}
  }
  const el = P.ui.screenEl();
  const panel = el.querySelector('#kn-mrules');
  const why = (can && can.why) || ONLINE_WHY;
  if (panel){
    panel.querySelector('.kn-mrules-h h4').textContent = T('Online is not open yet', 'L-onlajn għadu mhux miftuħ');
    panel.querySelector('.kn-mrules-b').innerHTML =
      '<ul><li>' + esc(why) + '</li>' +
      '<li><b>' + esc(T('Play the machine instead', 'Ilgħab kontra l-magna minflok')) + '</b> — ' +
        esc(T('same game, same slingshot, offline.', 'l-istess logħba, l-istess żbandola, offlajn.')) + '</li></ul>' +
      '<button class="btn primary" id="kn-fallback-ai" style="margin-top:6px">' +
        esc(T('Play with AI', 'Ilgħab mal-magna')) + '</button>';
    el.querySelector('#kn-mscrim').classList.add('on');
    panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false');
    const fb = panel.querySelector('#kn-fallback-ai');
    if (fb) fb.onclick = () => aiSetup();
    cue('ui.sheet', { gain:0.55 });
  } else {
    aiSetup();
  }
}

/* AI SETUP — reached only AFTER the player chooses "Play with AI". A
   tidy single-choice step (difficulty), sensible defaults, and Start.
   Not a settings wall on the entry screen. */
function aiSetup(){
  injectCSS();
  P.show();
  const el = P.ui.screenEl();
  const p = pref();
  let lvl = p.lvl || 2;
  let variant = VARIANTS[p.variant] ? p.variant : 'malta';

  function paint(){
    el.innerHTML =
      '<div class="pt-wrap kn-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="kn-sb" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(T('Play with AI', 'Ilgħab mal-magna')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<div class="tiny pt-lbl" style="margin-top:6px">' + esc(T('The battlefield', 'Il-kamp tal-battalja')) + '</div>' +
        '<div class="kn-maps" id="kn-maps">' +
          VARIANT_LIST.map(k => {
            const V = VARIANTS[k];
            return '<button class="kn-map' + (variant === k ? ' on' : '') + '" data-map="' + k + '">' +
              '<span class="kn-map-thumb" data-thumb="' + k + '"></span>' +
              '<span class="kn-map-tx"><b>' + esc(TP(V.name)) + '</b>' +
                '<i>' + esc(TP(V.note)) + '</i></span></button>';
          }).join('') +
        '</div>' +
        '<div class="tiny pt-lbl" style="margin-top:14px">' + esc(T('How hard the machine is', 'Kemm hi iebsa l-magna')) + '</div>' +
        '<div class="pt-opts" id="kn-lvl">' +
          [1,2,3,4].map(L => {
            const w = levelWords(L);
            return '<button class="pt-opt' + (lvl === L ? ' on' : '') + '" data-lvl="' + L + '">' +
              '<b>' + esc(w.n) + '</b><i>' + esc(w.i) + '</i></button>';
          }).join('') +
        '</div>' +
        '<button class="btn primary" id="kn-start" style="margin:16px 0 8px">' +
          esc(T('Start the match', 'Ibda l-partita')) + '</button>' +
        '<p class="blurb" style="margin:4px 2px 12px">' +
          esc(T('You throw first. Change weapons and buy cover from the store between turns.',
                'Titfa\' l-ewwel. Ibdel l-armi u ixtri kenn mill-ħanut bejn id-dawriet.')) +
        '</p>' +
      '</div></div>';
    /* paint the little map thumbnails */
    el.querySelectorAll('[data-thumb]').forEach(sp => {
      sp.appendChild(mapThumb(sp.getAttribute('data-thumb')));
    });
    el.querySelector('#kn-sb').onclick = () => { cue('ui.back', { gain:0.65 }); menu(); };
    el.querySelector('#kn-maps').addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-map]');
      if (!b) return; variant = b.getAttribute('data-map'); cue('move.select', { gain:0.4 }); paint();
    });
    el.querySelector('#kn-lvl').addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-lvl]');
      if (!b) return; lvl = +b.getAttribute('data-lvl'); paint();
    });
    el.querySelector('#kn-start').onclick = () => {
      pref({ lvl, first:0, variant });
      ST.save = null; persist();
      newGame({ lvl, first:0, strat:'BAL', variant });
    };
  }
  paint();
}

/* a small themed thumbnail for a battlefield card: sky wash, sea, two
   castles, a shot arc — the theme's palette in miniature. */
function mapThumb(key){
  const th = THEMES[VARIANTS[key] ? VARIANTS[key].theme : 'malta'] || THEMES.malta;
  const w = 76, h = 52, dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, th.sky0); sky.addColorStop(0.6, th.sky1); sky.addColorStop(1, th.sky2);
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = th.hill; g.beginPath(); g.moveTo(0, h - 16);
  g.lineTo(14, h - 24); g.lineTo(30, h - 18); g.lineTo(50, h - 26); g.lineTo(w, h - 18);
  g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
  g.fillStyle = th.sea1; g.fillRect(0, h - 10, w, 10);
  g.fillStyle = SIDECOL[0].b; g.fillRect(8, h - 22, 12, 12);
  g.fillStyle = SIDECOL[0].a; g.fillRect(8, h - 22, 12, 4);
  g.fillStyle = SIDECOL[1].b; g.fillRect(w - 20, h - 22, 12, 12);
  g.fillStyle = SIDECOL[1].a; g.fillRect(w - 20, h - 22, 12, 4);
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.setLineDash([2, 3]); g.lineWidth = 1.2;
  g.beginPath();
  for (let i = 0; i <= 16; i++){ const t = i / 16, x = 16 + t * (w - 32), y = (h - 18) - Math.sin(t * Math.PI) * 22;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
  g.stroke(); g.setLineDash([]);
  return cv;
}

/* repaint on a language change, only what we own and only if on screen */
try {
  if (window.KARTI_LANG) KARTI_LANG.onChange(() => {
    try {
      const el = P.ui.screenEl();
      if (el && el.querySelector('.kn-menu')) menu();
      else if (UI){ paintRules(); hud(); weps(); if (M && M.shopOpen) paintShop(); }
    } catch(e){}
  });
} catch(e){}

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — what js/mp.js reads before a match exists.

   The online half above is written and wired the way js/rummy-ui.js's
   is: relayed moves through encWire/decWire on the shared seed, a
   deterministic engine that guarantees both phones land the same crate
   in the same cell. It is NOT reachable, for exactly one reason that
   is not ours to change:

       server/karti_server.py
       TABLES = ("skarta","klabb","kiri","tombla","rummy","gin",
                 "gharraq","spy","suspett")

   v_game() rejects any room whose `game` is not in that tuple, and
   'kanun' is not in it. So a room labelled kanun is refused at the
   door — this cannot be made to work from the client alone. The
   honest thing is to publish the contract and REFUSE in words until
   the word is known, exactly as js/serp-ui.js and js/poker-ui.js do.

   Turn-based helps here: a throw is three bytes, a purchase is one,
   and nobody is ever waiting on a clock — so the day 'kanun' joins
   TABLES, this opens with no other change.
   ═══════════════════════════════════════════════════════════════════ */
const ONLINE_WHY = T(
  'Online IL-KANUN is written and ready on this phone — turn-based, so latency is a non-issue — ' +
  'but the KARTI server does not know the word "kanun" yet, so it will not open a room for it. ' +
  'Nothing here is missing; one line on the server is. Until then, IL-KANUN is you against the machine.',
  'IL-KANUN onlajn hu miktub u lest fuq dan it-telefon — bid-dawr, mela d-dewmien mhux problema — ' +
  'imma s-server tal-KARTI għadu ma jafx il-kelma "kanun", mela mhux se jiftaħ kamra għaliha. ' +
  'Xejn hawn ma jonqos; linja waħda fuq is-server tonqos. Sa dakinhar, IL-KANUN hu int kontra l-magna.');

R.lobby = {
  id:'kanun',
  name:'Il-Kanun',
  mt:'Il-Kanun',
  minSeats: 2,
  maxSeats: 2,
  levels: E.LEVELS.filter(Boolean),
  defaultLevel: 2,
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu')
    ? Object.assign({}, seat, { ready:true }) : seat,

  /* ── THE BATTLEFIELDS, for the shared lobby's Rules picker. Same shape
     klabb and cards2131 publish: the relay's word, a bilingual label,
     and the seats each plays (always 2 here). The host picks a map; the
     relay carries the word; applyVariant turns it into what rides on the
     wire; onlineStart reads cfg.variant and both phones build it. ── */
  variants: VARIANT_LIST.map(k => ({
    id: k, net: k, name: VARIANTS[k].name.en, mt: VARIANTS[k].name.mt,
    label: VARIANTS[k].name, note: VARIANTS[k].note, seats: [2] })),
  currentVariant(){
    try {
      const v = window.KARTI_MP && window.KARTI_MP.MP && window.KARTI_MP.MP.variant;
      const k = String(v || '').toLowerCase();
      return VARIANTS[k] ? k : 'malta';
    } catch(e){ return 'malta'; }
  },
  applyVariant(net){
    const k = String(net || '').toLowerCase();
    return { variant: VARIANTS[k] ? k : 'malta', rules: null };
  },

  canStart(seatList){
    if (!(window.KARTI_PARTY && window.KARTI_PARTY.online && window.KARTI_PARTY.online.kanun))
      return { ok:false, why: ONLINE_WHY };
    const n = (seatList || []).length;
    if (n < 2) return { ok:false, why: T('Il-Kanun needs two castles.', 'Il-Kanun irid żewġ kastelli.') };
    if (n > 2) return { ok:false, why: T('Only two can play.', 'Tnejn biss jistgħu jilagħbu.') };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready) return { ok:false, why: unready + (unready > 1
        ? T(' people are not ready yet.', ' persuni għadhom mhux lesti.')
        : T(' person is not ready yet.', ' persuna għadha mhux lesta.')) };
    return { ok:true, why:'' };
  },
  rulesHTML: () =>
    '<p>' + T('Drop three boxes in the water and stand a soldier on each. Take turns throwing ' +
      'comically Maltese ordnance, and between throws spend what you earn on wilder ammo.',
      'Itfa\' tliet kaxxi fl-ilma u qiegħed suldat fuq kull waħda. Bir-rota titfgħu affarijiet ' +
      'Maltin komiċi, u bejniethom onfqu dak li taqilgħu fuq munizzjon aktar selvaġġ.') + '</p>' +
    '<p>' + T('Pull back like a slingshot to aim; the shots bounce off the rock in the middle. ' +
      'Knock all of them into the sea to win.',
      'Iġbed lura bħal żbandola biex timmira; it-tefgħat jaqbżu mal-blata fin-nofs. Waddab lil ' +
      'kulħadd fil-baħar biex tirbaħ.') + '</p>' +
    '<p>' + esc(ONLINE_WHY) + '</p>',
  blurb: T('Three boxes on the water and a slingshot. Bounce it off the rock into the other lot.',
           'Tliet kaxxi fuq l-ilma u żbandola. Aqbeż mal-blata għal fuq l-oħrajn.'),
  myName(){
    try {
      const n = K.displayName && K.displayName();
      if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
        return String(n).trim().slice(0, 14);
    } catch(e){}
    return T('You', 'Int');
  },
  start: (seatList, o) => newGame({
    lvl: ((seatList || []).map(s => s && s.level).find(v => v)) || 2,
    first: 0, strat:'BAL',
    variant: (o && o.variant) || R.lobby.currentVariant()
  }),
  wire: { fields: E.WIRE_FIELDS },
  takeback: false
};

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF TILE — on the BOARD shelf, alongside serp and the board
   games. register() replaces by id, so wiring it twice costs nothing.
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'kanun', order:28, kind:'board', name:'IL-KANUN', mt:'Il-Kanun',
  sprite:'kn-t-kanun', status:'live',
  get tag(){
    return T('Three boxes on the water, a soldier on each, and a slingshot in your hand. Pull ' +
             'back, bank it off the rock, and put the other lot in the sea. Comically Maltese.',
             'Tliet kaxxi fuq l-ilma, suldat fuq kull waħda, u żbandola f\'idejk. Iġbed lura, ' +
             'aqbeż mal-blata, u itfa\' lill-oħrajn il-baħar. Malti komiku.');
  },
  open: () => menu(),
  seats: { min:2, max:2 },
  levels: E.LEVELS.filter(Boolean),
  rulesHTML: () => R.lobby.rulesHTML()
};
R.shelfTile = TILE;
R.open = () => menu();
R.close = () => { leave(); P.hub(); };
P.register(TILE);

/* the shelf mark must exist before the shelf is painted */
if (document.body) injectDefs();
else document.addEventListener('DOMContentLoaded', injectDefs);

/* ── test hooks — inert unless the page is opened with ?pttest ──── */
try {
  if (String(location.search).indexOf('pttest') >= 0){
    window.__KN_TEST = {
      engine: E,
      M: () => M,
      st: () => (M ? M.st : null),
      UI: () => UI,
      menu, newGame, leave, resumeGame,
      /* start a match this test drives by hand: no AI timer, no flight */
      manual: (opts, seed) => {
        injectCSS(); P.show();
        startMatch(opts || { lvl:2, first:0 }, seed);
        M.me = 0; M.mine = [0];
        M.meta = [
          { name:'You', own:'me', lvl:(opts && opts.lvl) || 2 },
          { name:'CPU', own:'ai', lvl:(opts && opts.lvl) || 2, strat:'BAL' }
        ];
        M.sel = 0;
        openBoard(() => menu());
        return M;
      },
      /* fire a shot synchronously (no animation), return the report */
      shoot: mv => {
        const seat = mv.seat != null ? mv.seat : M.me;
        const rep = E.apply(M.st, { seat, w:mv.w, dx:mv.dx, dy:mv.dy });
        hud(); weps(); draw();
        return rep;
      },
      /* fire a shot through the REAL animated path (camera-follow + FX) */
      fire: (mv, src) => fireShot(Object.assign({ seat:M.me }, mv), src || 'me'),
      /* spawn destruction directly, for a synchronous FX assertion */
      spawnImpact: (x, y, r, p, o) => spawnImpact(x, y, r, p, o),
      spawnSplash: (x, s, big) => spawnSplash(x, s, big),
      /* advance the FX physics n steps of dt, headless (no rAF) */
      tickFx: (n, dt) => { for (let i = 0; i < (n||1); i++) stepFx(dt||0.016); },
      /* advance the camera one eased step toward its target */
      tickCam: dt => tickCam(dt||0.016),
      fx: () => (M ? M.fx : null),
      cam: () => (M ? M.cam : null),
      setVariant: k => { if (M) { M.variant = k; M.theme = THEMES[VARIANTS[k]?VARIANTS[k].theme:'malta']; draw(); } },
      themeKey: () => (M && M.theme ? M.theme.key : null),
      preview: mv => E.preview(M.st, Object.assign({ seat:M.me }, mv)),
      buy: it => { const r = E.apply(M.st, { seat:M.me, t:'buy', it }); paintShop && (M.shopOpen ? paintShop() : 0); hud(); weps(); return r; },
      aiTurn: seat => E.aiTurn(M.st, seat == null ? 1 : seat, M.opts.lvl || 2, 'BAL'),
      openShop, closeShop, paintShop,
      isShopOpen: () => !!(M && M.shopOpen),
      beginAim, moveAim, endAim,
      setSel: w => { M.sel = w; weps(); },
      draw, fitCanvas, hud, weps, board, openBoard, finish,
      rules: () => rulesOpen, setRules,
      remote: (seat, wire) => onlineRemote(seat, wire),
      hooks: NET_HOOKS,
      lobby: R.lobby, tile: TILE, variants: VARIANTS, aiSetup,
      store: () => ST,
      canvas: () => (UI ? UI.cv : null),
      /* ── FOG test hooks ── */
      fog: {
        side: () => localSide(),
        midX: () => fogMidX(),
        reveals: () => myReveals(),
        revealsOf: seat => (M && M.revealsBy) ? (M.revealsBy[seat | 0] || []) : [],
        add: (x, y, r, owner) => addReveal(owner == null ? mySeat() : owner, x, y, r),
        fromReport: rep => revealFromReport(rep),
        clarity: p => revealClarity(p),
        /* fog-layer alpha (0..255) at a CSS-px point, read from the
           offscreen fog canvas the last draw() composited. 0 = clear. */
        alphaAt: (px, py) => {
          const L = UI && UI._fog;
          if (!L || !L.cv || !L.g) return 0;
          const dpr = UI.dpr || 1;
          try {
            const d = L.g.getImageData(Math.round(px * dpr), Math.round(py * dpr), 1, 1).data;
            return d[3];
          } catch(e){ return -1; }
        },
        /* CSS-px screen coords of a world cell, for the harness */
        screenOf: (wxc, wyc) => [sx(wxc), sy(wyc)],
        /* the FINAL composited RGB on the main canvas at a CSS-px point —
           used to prove the fog reads as a PALE cloud (light), not black. */
        rgbAt: (px, py) => {
          if (!UI || !UI.g2) return null;
          const dpr = UI.dpr || 1;
          try {
            const d = UI.g2.getImageData(Math.round(px * dpr), Math.round(py * dpr), 1, 1).data;
            return [d[0], d[1], d[2]];
          } catch(e){ return null; }
        }
      },
      /* aim-framing hooks (prior-fix regression): frame both castles and
         read the resulting whole-frame the resting/aim view uses. */
      frameForAim: snap => frameForAim(snap),
      frameWhole: () => frameWhole(),
      /* base-aim framing hooks (this fix): the resting/aim view is your
         OWN base zoomed in, and the drag→power span is in screen px. */
      frameForBase: seat => frameForBase(seat == null ? (M ? M.me : 0) : seat),
      aimSeat: () => aimSeat(),
      maxPullPx: () => maxPullPx(),
      handOf: seat => handOf(seat == null ? (M ? M.me : 0) : seat),
      screenOf: (wxc, wyc) => [sx(wxc), sy(wyc)],
      snapCam: () => snapCam(),
      /* ── PAN / SCOUT hooks (this fix) ── */
      onSlingshot: (px, py) => onSlingshot(px, py),
      beginPan: (px, py) => beginPan(px, py),
      movePan: (px, py) => movePan(px, py),
      endPan: () => { endPan(); refreshReturnBtn(); },
      returnToBase: () => returnToBase(),
      fogAlphaMax: () => FOG_ALPHA_MAX,
      fogWeight: () => fogWeight(M ? M.theme : THEMES.malta),
      /* ── LAST-SHOT grid/marker hooks. Per seat now: the screen only ever
           draws mySeat()'s own, so an opponent's arc cannot hang about. ── */
      lastShot: () => myLastShot(),
      lastArc: () => myLastArc(),
      lastShotOf: seat => (M && M.lastShot) ? M.lastShot[seat | 0] : null,
      lastArcOf:  seat => (M && M.lastArc)  ? M.lastArc[seat | 0]  : null,
      recordLastShot: (rep, focus) => recordLastShot(rep, focus),
      drawLastShot: () => { if (UI && UI.g2) drawLastShot(UI.g2, cellPx()); },
      wx: px => wx(px), wy: py => wy(py),

      /* ── WHOSE SCREEN THIS IS ── */
      mySeat: () => mySeat(),
      viewSeat: () => (M ? M.viewSeat : null),
      setViewSeat: s => { if (M){ M.viewSeat = s | 0; draw(); } },

      /* ── PLACEMENT PHASE hooks ── */
      phase: () => (M ? M.phase : null),
      hotseat: () => !!(M && M.hotseat),
      newGameHotseat,
      place: () => (M && M.place) ? {
        seat:M.place.seat, step:M.place.step, back:M.place.back,
        crew:M.place.crew.slice(), queue:M.place.queue.slice(),
        done:M.place.done.map(d => d ? { back:d.back, crew:d.crew.slice() } : null)
      } : null,
      placeOf: seat => E.placeOf(M.st, seat == null ? mySeat() : seat),
      placeDown: (px, py) => placeDown(px, py),
      placeMove: px => placeMove(px, 0),
      placeUp: () => placeUp(),
      placeAdvance: () => placeAdvance(),
      placeUndo: () => placeUndo(),
      crewZone: (seat, back) => E.crewZone(seat, back),
      curtainOn: () => !!(UI && UI.curtain && UI.curtain.classList.contains('on')),
      curtainTap: () => {
        const b = UI && UI.curtain && UI.curtain.querySelector('button');
        if (b) b.click();
        return !!b;
      },
      setupHTML: () => (UI && UI.setup ? UI.setup.innerHTML : ''),
      setupTap: id => {
        const b = UI && UI.setup && UI.setup.querySelector('#' + id);
        if (!b || b.disabled) return false;
        b.click(); return true;
      },
      handOver: seat => handOver(seat)
    };
  }
} catch(e){}

})();
