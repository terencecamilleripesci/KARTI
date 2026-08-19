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
      'transition:opacity .12s var(--ease);z-index:5}' +
    '#scr-party .kn-power.on{opacity:1}' +
    '#scr-party .kn-power i{display:block;height:100%;width:0;border-radius:999px;' +
      'background:linear-gradient(90deg,#3BE08A,#FFC542 60%,#FF6B4D)}' +

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

    /* ── the menu, poker/serp chrome ── */
    '#scr-party .kn-menu .kn-hero{position:relative;display:flex;align-items:flex-end;' +
      'justify-content:center;height:132px;margin:2px 0 12px;border-radius:16px;overflow:hidden;' +
      'background:radial-gradient(130% 100% at 50% 12%,#2A4763 0%,#14293D 55%,#080F17 100%);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),inset 0 -16px 30px rgba(0,0,0,.45)}' +
    '#scr-party .kn-menu .kn-hero canvas{display:block}' +
    '#scr-party .kn-menu .kn-hero-cap{position:absolute;right:10px;top:8px;' +
      'font:900 10px/1 var(--disp);letter-spacing:.12em;color:rgba(255,255,255,.42)}' +
    '@media (max-height:560px){#scr-party .kn-menu .kn-hero{height:96px}}' +

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
    '#scr-party .kn-scrim.on{opacity:1;pointer-events:auto}';
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
  stopAnim();
  const o = Object.assign({ lvl:2, first:0, strat:'BAL' }, opts || {});
  const seedN = (seed == null ? E.newSeed() : seed) >>> 0;
  const st = E.newMatch(seedN, {
    lvl: [ o.lvl0 != null ? o.lvl0 : 0, o.lvl1 != null ? o.lvl1 : o.lvl ],
    first: o.first | 0
  });
  M = {
    opts: o, seed: seedN, st,
    net: net || null,
    me: 0,                      /* the seat this phone drives            */
    mine: [0],                  /* seats this phone is authoritative over */
    meta: [],
    ctx: null, cv: null, g2: null,
    sel: 0,                     /* selected weapon id                    */
    drag: null,                 /* {x,y,dx,dy,mv} while aiming           */
    preview: null,              /* the previewed track pts               */
    anim: null,                 /* the shell flight in progress          */
    raf: 0, busy:false, dead:false, finished:false,
    shopOpen:false, aiPending:0
  };
  return M;
}

/* ═══════════════════════════════════════════════════════════════════
   THE CANVAS — fitCanvas() is the ONLY layout read, on mount/resize.
   The world is 200x100; it is letter-boxed into the field so the whole
   battlefield is always visible and the mapping world→screen is one
   scale and one offset, computed once here.
   ═══════════════════════════════════════════════════════════════════ */
function fitCanvas(){
  if (!UI || !UI.cv || !UI.field) return;
  const w = UI.field.clientWidth, h = UI.field.clientHeight;
  if (!w || !h) return;
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const px = Math.round(w * dpr), py = Math.round(h * dpr);
  if (UI.cv.width !== px || UI.cv.height !== py){ UI.cv.width = px; UI.cv.height = py; }
  UI.dpr = dpr; UI.cw = w; UI.ch = h;

  /* fit the whole world, keeping aspect. A little headroom at the top
     for the highest lob; the ground sits near the bottom. */
  const worldW = E.W, worldH = E.H;
  const sc = Math.min(w / worldW, h / worldH);
  UI.sc = sc;
  UI.ox = (w - worldW * sc) / 2;
  UI.oy = (h - worldH * sc) / 2;
  UI.g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  UI.dirty = true;
  draw();
}
/* world (cell) → screen (css px) */
function sx(x){ return UI.ox + x * UI.sc; }
function sy(y){ return UI.oy + y * UI.sc; }
/* screen → world, for the drag */
function wx(px){ return (px - UI.ox) / UI.sc; }
function wy(py){ return (py - UI.oy) / UI.sc; }

/* ═══════════════════════════════════════════════════════════════════
   DRAW — the whole battlefield, painted from the engine's view. The
   grid is drawn as spans of same-material cells per column so 20 000
   cells do not become 20 000 fillRects; a run of identical solid cells
   in a column is one rectangle.
   ═══════════════════════════════════════════════════════════════════ */
function draw(){
  if (!UI || !UI.g2 || !M) return;
  const g = UI.g2, w = UI.cw, h = UI.ch, st = M.st;
  const v = E.view(st);

  /* sky + sea */
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#183042'); sky.addColorStop(1, '#0A1420');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);

  /* the moat */
  const wyTop = sy(v.waterY);
  const sea = g.createLinearGradient(0, wyTop, 0, sy(E.H));
  sea.addColorStop(0, 'rgba(60,150,190,.55)'); sea.addColorStop(1, 'rgba(20,70,110,.85)');
  g.fillStyle = sea;
  g.fillRect(sx(0), wyTop, E.W * UI.sc, sy(E.H) - wyTop);
  /* a couple of still highlight lines so it reads as water, not a slab */
  if (!noMotion()){
    g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 1;
    const t = nowMs() / 900;
    for (let i = 0; i < 3; i++){
      const yy = wyTop + (i + 1) * (sy(E.H) - wyTop) / 4;
      g.beginPath();
      g.moveTo(sx(0), yy + Math.sin(t + i) * 1.2);
      g.lineTo(sx(E.W), yy + Math.sin(t + i + 2) * 1.2);
      g.stroke();
    }
  }

  /* the terrain: per-column span merge */
  const mat = v.mat, hp = v.hp, cell = UI.sc;
  const px = Math.max(1, Math.ceil(cell) + 0.5);
  for (let x = 0; x < E.W; x++){
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
        /* a two-tone column: lit left, shaded right, so faces read */
        g.fillStyle = c.a;
        g.fillRect(bx, top, px, bot - top);
        g.fillStyle = c.b;
        g.fillRect(bx + px * 0.55, top, px * 0.45, bot - top);
        /* damage darkening on the topmost cell of a span (cheap, telling) */
        const full = E.MAT[m] ? E.MAT[m].hp : 0;
        if (full > 0 && full < 60000){
          const dmg = 1 - Math.max(0, Math.min(1, hp[y * E.W + x] / full));
          if (dmg > 0.15){
            g.fillStyle = 'rgba(0,0,0,' + (dmg * 0.45).toFixed(2) + ')';
            g.fillRect(bx, sy(y), px, cell);
          }
        }
      }
      y = y2;
    }
  }

  /* the crew, each side its colour, health as a little bar over the head */
  for (const sd of v.sides){
    const col = SIDECOL[sd.seat];
    for (const c of sd.crew){
      if (c.wet) continue;
      const cx = sx(c.x), cyFeet = sy(c.y);
      const bw = E.T.CH_W * cell, bh = E.T.CH_H * cell;
      const bx0 = cx - bw / 2, by0 = cyFeet - bh;
      if (!c.alive){
        g.globalAlpha = 0.4;
      }
      /* body */
      g.fillStyle = col.b;
      roundRect(g, bx0, by0, bw, bh, Math.min(bw, bh) * 0.28); g.fill();
      g.fillStyle = col.a;
      roundRect(g, bx0, by0, bw, bh * 0.55, Math.min(bw, bh) * 0.28); g.fill();
      /* head */
      g.fillStyle = '#F2D9B0';
      g.beginPath();
      g.arc(cx, by0 - bh * 0.06, bw * 0.42, 0, 6.2832); g.fill();
      g.globalAlpha = 1;
      /* health bar for the living */
      if (c.alive && cell > 1.2){
        const hw = bw * 1.2, hx = cx - hw / 2, hy = by0 - bh * 0.5;
        g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(hx, hy, hw, 3);
        const f = Math.max(0, Math.min(1, c.hp / E.T.CH_HP));
        g.fillStyle = f > 0.5 ? '#3BE08A' : f > 0.25 ? '#FFC542' : '#FF6B4D';
        g.fillRect(hx, hy, hw * f, 3);
      }
    }
  }

  /* the aim: a taut band from the thrower's hand to the finger, plus
     the previewed arc. This is the whole read of "where will it go". */
  if (M.drag && M.preview){
    const p = M.drag;
    /* the sling band */
    g.strokeStyle = 'rgba(255,197,66,.9)';
    g.lineWidth = Math.max(1.5, cell * 0.4);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(sx(p.hx), sy(p.hy));
    g.lineTo(sx(p.fx), sy(p.fy));
    g.stroke();
    /* the predicted arc, dotted */
    const pts = M.preview;
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.setLineDash([3, 5]);
    g.lineWidth = 1.6;
    g.beginPath();
    for (let i = 0; i < pts.length; i += 2){
      const X = sx(pts[i]), Y = sy(pts[i + 1]);
      if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
    }
    g.stroke();
    g.setLineDash([]);
    /* a target dot at the predicted end */
    if (pts.length >= 2){
      const ex = pts[pts.length - 2], ey = pts[pts.length - 1];
      g.fillStyle = 'rgba(255,107,77,.9)';
      g.beginPath(); g.arc(sx(ex), sy(ey), Math.max(2.5, cell * 0.8), 0, 6.2832); g.fill();
    }
  }

  /* the shell in flight, plus its trail */
  if (M.anim){
    const a = M.anim, pt = a.pos;
    if (a.trail.length){
      g.strokeStyle = 'rgba(255,220,150,.45)'; g.lineWidth = Math.max(1.2, cell * 0.5);
      g.beginPath();
      for (let i = 0; i < a.trail.length; i += 2){
        const X = sx(a.trail[i]), Y = sy(a.trail[i + 1]);
        if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
      }
      g.stroke();
    }
    if (pt){
      g.fillStyle = '#FFE08A';
      g.beginPath(); g.arc(sx(pt[0]), sy(pt[1]), Math.max(2.5, cell * 0.9), 0, 6.2832); g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)';
      g.beginPath(); g.arc(sx(pt[0]), sy(pt[1]), Math.max(1, cell * 0.4), 0, 6.2832); g.fill();
    }
    /* the boom flashes */
    for (const b of a.booms){
      const age = (nowMs() - b.at) / 320;
      if (age > 1) continue;
      const rr = b.r * cell * (0.4 + age * 1.1);
      g.fillStyle = 'rgba(255,150,60,' + (0.55 * (1 - age)).toFixed(2) + ')';
      g.beginPath(); g.arc(sx(b.x), sy(b.y), rr, 0, 6.2832); g.fill();
    }
  }
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
   AIMING — a drag. pointerdown anywhere on the field begins the pull;
   the drag vector from the hand is the shot, SLINGSHOT style: you pull
   BACK and the shell flies the opposite way, so dragging down-left
   throws up-right. dragOf() quantises the finger's float into the two
   signed bytes the engine wants, and preview() draws the exact arc.
   ═══════════════════════════════════════════════════════════════════ */
const MAXPULL = 46;   /* cells of pull that map to full power (DRAG_MAX) */

function beginAim(px, py){
  if (!canAct()) return;
  const hand = handOf(M.me);
  if (!hand) return;
  M.drag = { hx: hand.x, hy: hand.y, fx: wx(px), fy: wy(py), sx0:px, sy0:py };
  moveAim(px, py);
}
function moveAim(px, py){
  if (!M.drag) return;
  const fx = wx(px), fy = wy(py);
  M.drag.fx = fx; M.drag.fy = fy;
  /* the pull is hand→finger; the shot is its OPPOSITE (slingshot) */
  const pdx = fx - M.drag.hx, pdy = fy - M.drag.hy;
  const drag = E.dragOf(-pdx, -pdy, MAXPULL);
  M.drag.dx = drag.dx; M.drag.dy = drag.dy;
  const mv = { seat: M.me, w: M.sel, dx: drag.dx, dy: drag.dy };
  M.drag.mv = mv;
  /* power meter */
  const pw = Math.min(1, Math.sqrt(drag.dx * drag.dx + drag.dy * drag.dy) / E.T.DRAG_MAX);
  if (UI.power){ UI.power.classList.add('on'); UI.powerFill.style.width = (pw * 100) + '%'; }
  /* the preview arc — only when the pull is worth a shot */
  const chk = E.legal(M.st, mv);
  if (chk.ok){
    const rep = E.preview(M.st, mv);
    M.preview = firstTrackPts(rep);
  } else {
    M.preview = null;
  }
  draw();
}
function endAim(){
  if (!M.drag){ return; }
  const mv = M.drag.mv;
  M.drag = null; M.preview = null;
  if (UI.power){ UI.power.classList.remove('on'); UI.powerFill.style.width = '0%'; }
  draw();
  if (!mv){ return; }
  const chk = E.legal(M.st, mv);
  if (!chk.ok){
    tip('<b>' + esc(TP(chk.why)) + '</b>', 1400);
    cue('move.illegal', { gain:0.5 });
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
  if (E.turnOf(M.st) !== M.me) return false;
  return true;
}

/* ═══════════════════════════════════════════════════════════════════
   FIRING — apply the move to the engine (which produces the whole
   report: the tracks, the events, the new world), then ANIMATE the
   shell along the reported path. Reduced motion skips straight to the
   settled world.
   ═══════════════════════════════════════════════════════════════════ */
function fireShot(mv, src){
  if (M.busy) return;
  M.busy = true;
  const seat = mv.seat;
  const rep = E.apply(M.st, { seat, w:mv.w, dx:mv.dx, dy:mv.dy });
  if (!rep){ M.busy = false; return; }
  /* tell the wire — AFTER it has been applied here, never before */
  if (src === 'me') say(seat, { seat, w:mv.w, dx:mv.dx, dy:mv.dy });
  saveGame();
  cue('duel.attack', { gain:0.75 }, true);

  playFlight(rep, () => {
    M.busy = false;
    afterThrow(rep);
  });
}

/* walk the primary track's points at a steady pace, firing boom/skip
   sounds off the report's events as the shell passes their position. */
function playFlight(rep, done){
  stopAnim();
  const track = (rep.tracks || []).find(t => t.id === 0) || (rep.tracks || [])[0];
  const kids = (rep.tracks || []).filter(t => t !== track && t.pts && t.pts.length >= 2);
  const pts = track && track.pts ? track.pts : null;

  if (noMotion() || !pts || pts.length < 4){
    /* land it now: play the impact sound and repaint */
    boomSounds(rep, true);
    draw(); hud();
    if (done) done();
    return;
  }

  /* precompute the boom points so we can flash them on arrival */
  const booms = [];
  for (const e of rep.ev){
    if (e.t === 'boom' || e.t === 'stick' || e.t === 'splash')
      booms.push({ x:e.x, y:e.y, r:(e.r || 4), fired:false, at:0 });
  }

  const a = M.anim = {
    pts, i:0, kids, kidIdx: kids.map(() => 0),
    trail:[], pos:null, booms:[], start:nowMs(), lastBounceAt:0,
    events: rep.ev.slice(), evi:0
  };
  /* ~2.4 world cells per frame at 60fps, capped so long shots do not
     crawl and short ones do not blink past */
  const SPEED = 3.0;
  let carried = 0;

  const step = () => {
    if (!M || M.dead){ return; }
    a.raf = M.raf = requestAnimationFrame(step);
    carried += SPEED;
    let advanced = 0;
    while (carried >= 1 && a.i + 2 < pts.length){
      a.i += 2; carried -= 1; advanced++;
      a.trail.push(pts[a.i], pts[a.i + 1]);
      if (a.trail.length > 40) a.trail.splice(0, a.trail.length - 40);
    }
    a.pos = [pts[a.i], pts[a.i + 1]];

    /* fire a bounce click when we pass one, rate-limited by cue() */
    const now = nowMs();
    for (const e of rep.ev){
      if (e._done) continue;
      if (e.t === 'bounce' && near(a.pos, e.x, e.y, 3)){
        e._done = true; cue('piece.slide', { gain:0.3 });
      } else if (e.t === 'skip' && near(a.pos, e.x, e.y, 3)){
        e._done = true; cue('sea.splash', { gain:0.35 });
      }
    }
    /* flash booms whose point we have reached */
    for (const b of booms){
      if (!b.fired && (a.i + 2 >= pts.length || near(a.pos, b.x, b.y, 4))){
        b.fired = true; b.at = now; a.booms.push({ x:b.x, y:b.y, r:b.r, at:now });
        cue(b.r >= 7 ? 'duel.boss' : 'duel.hit', { gain:0.6 }, b.r >= 7);
      }
    }

    draw();
    if (a.i + 2 >= pts.length){
      /* let the last boom flash breathe, then settle */
      const anyLive = a.booms.some(b => now - b.at < 300);
      if (!advanced && !anyLive){
        stopAnim();
        boomSounds(rep, false);
        draw(); hud();
        if (done) done();
      }
    }
  };
  a.raf = M.raf = requestAnimationFrame(step);
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
  if (M) M.anim = null;
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
    else setTurn('you');
  } else {
    /* a remote human's turn — wait */
    setTurn('them');
  }
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
    const mine = (s === M.me);
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

function setTurn(who){
  if (!M || !M.ctx) return;
  if (who === 'you'){
    P.ui.setTurn(M.ctx, { cls:'good', who:T('Your throw', 'It-tefgħa tiegħek'),
      note:T('Pull back from your castle and let go.', 'Iġbed lura mill-kastell tiegħek u itilqu.') });
    tip(esc(T('Pull back to aim. Further back is harder.', 'Iġbed lura biex timmira. Aktar lura, aktar b\'saħħtu.')), 2600);
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
  const me = v.sides[M.me];
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
  const seat = M.me;
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

  function row(r){
    const can = r.can;
    const owned = (r.kind === 1 && sd.tier[r.d] >= (r.to));   /* already at/above this tier */
    const cls = 'kn-item' + (owned ? ' owned' : (can ? '' : ' no'));
    const ic = r.kind === 0 ? '<span class="sw">' + wepGlyph(E.WEAPONS[r.w].key) + '</span>'
             : defGlyph(r);
    const why = (!can && !owned && r.why) ? '<i>' + esc(TP(r.why)) + '</i>' : '';
    return '<button class="' + cls + '" data-it="' + r.it + '"' + ((can && !owned) ? '' : ' disabled') + '>' +
      '<span class="ic">' + ic + '</span>' +
      '<span class="tx"><b>' + esc(TP(r.name)) + '</b>' +
        '<i>' + esc(shorten(TP(r.blurb))) + '</i>' + why + '</span>' +
      '<span class="pr">' + (owned ? esc(T('Have it', 'Diġà')) : (r.cost + ' <small>' + T('coins', 'muniti') + '</small>')) + '</span>' +
      '</button>';
  }
  UI.shopBody.innerHTML =
    (AMMO.length ? '<div class="kn-grp">' + esc(T('Something to throw', 'X\'titfa\'')) + '</div>' + AMMO.map(row).join('') : '') +
    (UPG.length ? '<div class="kn-grp">' + esc(T('Better cover', 'Kenn aħjar')) + '</div>' + UPG.map(row).join('') : '') +
    (FIX.length ? '<div class="kn-grp">' + esc(T('Patch it up', 'Sewwih')) + '</div>' + FIX.map(row).join('') : '') +
    (ONE.length ? '<div class="kn-grp">' + esc(T('Right now', 'Issa')) + '</div>' + ONE.map(row).join('') : '');
}
function defGlyph(r){
  /* a wall / tower / parapet block, coloured by target tier's material */
  const D = E.DEFS[r.d != null ? r.d : 0];
  const tier = r.kind === 2 ? (E.view(M.st).sides[M.me].tier[r.d]) : (r.to || 0);
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

function buy(it){
  const seat = M.me;
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
      '<div class="kn-power" id="kn-power"><i id="kn-power-fill"></i></div>' +
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
  ctx.host.querySelector('#kn-store').onclick = () => openShop();
  ctx.host.querySelector('#kn-shop-done').onclick = () => closeShop();
  UI.shopBody.addEventListener('click', e => {
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
  let aiming = false;
  f.addEventListener('pointerdown', e => {
    if (rulesOpen || M.shopOpen) return;
    if (!canAct()) return;
    e.preventDefault();
    aiming = true;
    try { f.setPointerCapture(e.pointerId); } catch(_){}
    beginAim(e.clientX - rectLeft(), e.clientY - rectTop());
  });
  f.addEventListener('pointermove', e => {
    if (!aiming) return;
    moveAim(e.clientX - rectLeft(), e.clientY - rectTop());
  });
  const up = e => {
    if (!aiming) return;
    aiming = false;
    endAim();
  };
  f.addEventListener('pointerup', up);
  f.addEventListener('pointercancel', () => { aiming = false; M.drag = null; M.preview = null; if (UI.power) UI.power.classList.remove('on'); draw(); });

  /* keyboard, for the desk and the harness: arrows nudge, space fires
     a straight-ahead ranging shot at half power */
  UI.keys = e => {
    if (!canAct()) return;
    if (e.key === ' ' || e.key === 'Enter'){
      e.preventDefault();
      const face = M.me === 0 ? 1 : -1;
      fireShot({ seat:M.me, w:M.sel, dx: 70 * face, dy: -70 }, 'me');
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
    T('Two castles across a moat. You throw, they throw, until one courtyard is <b>empty</b>.',
      'Żewġ kastelli fuq foss. Titfa\', jitfgħu, sakemm bitħa waħda tibqa\' <b>vojta</b>.'),
    T('<b>Pull back</b> from your castle like a slingshot and let go. Further back is harder; ' +
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

  /* the record + XP, offline only. earnings() REPORTS; here is where
     the UI decides to hand it to KARTI's economy — never in-match. */
  let xp = null;
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
  }
  ST.save = null; persistNow();   /* the match is done; drop the autosave */

  cue(won ? 'game.win' : draw2 ? 'duel.draw' : 'game.lose', { gain:0.9 }, true);
  setTimeout(() => { if (M && !M.dead) showResult(won, draw2, xp); }, 560);
}

function showResult(won, draw2, xp){
  if (!M) return;
  const st = M.st;
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
  M.me = 0; M.mine = [0];
  M.meta = [
    { name:T('You', 'Int'), own:'me', lvl:o.lvl || 2 },
    { name: levelWords(o.lvl || 2).n, own:'ai', lvl:o.lvl || 2, strat: o.strat || 'BAL' }
  ];
  /* pick a sensible starting weapon: the free balloon */
  M.sel = 0;
  openBoard(() => menu());
  saveGame();
  /* if the machine throws first, let it */
  const first = E.turnOf(M.st);
  if (first === 1){ scheduleAI(1); } else { setTurn('you'); }
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
  stopAnim();
  M = {
    opts:o, seed: st.seed, st,
    net:null, me:0, mine:[0], meta:[
      { name:T('You', 'Int'), own:'me', lvl:o.lvl || 2 },
      { name: levelWords(o.lvl || 2).n, own:'ai', lvl:o.lvl || 2, strat:o.strat || 'BAL' }
    ],
    ctx:null, cv:null, g2:null, sel:0, drag:null, preview:null, anim:null,
    raf:0, busy:false, dead:false, finished:false, shopOpen:false, aiPending:0
  };
  openBoard(() => menu());
  const cur = E.turnOf(M.st);
  if (cur === 1){ scheduleAI(1); } else if (cur === 0){ setTurn('you'); } else { finish(); }
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
    note:T('Pull back from your castle to aim.', 'Iġbed lura mill-kastell biex timmira.') });
}

function leave(){
  stopAnim();
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
  /* a throw — apply and animate, then hand back to the turn machinery */
  if (M.busy) { /* rare: still animating our own. Queue by applying after */ }
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

  leave();
  injectCSS();
  startMatch({ lvl, first:0 }, cfg.seed >>> 0, null);
  M.net = Object.assign({}, cfg.net, { host:iAmHost, toGame, toRoom });
  M.me = meG;
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
  /* two little castles and a shell arc, drawn once. Decoration only. */
  const cv = document.createElement('canvas');
  const w = 260, h = 118, dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  /* sea */
  g.fillStyle = 'rgba(40,110,150,.5)'; g.fillRect(0, h - 26, w, 26);
  /* left castle (blue) */
  drawCastle(g, 18, h - 26, SIDECOL[0], false);
  /* right castle (red) */
  drawCastle(g, w - 62, h - 26, SIDECOL[1], true);
  /* the rock */
  g.fillStyle = '#5c554b';
  g.beginPath(); g.moveTo(w/2 - 8, h - 26); g.lineTo(w/2, h - 44); g.lineTo(w/2 + 8, h - 26); g.closePath(); g.fill();
  /* an arc */
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.setLineDash([3, 4]); g.lineWidth = 1.6;
  g.beginPath();
  for (let i = 0; i <= 24; i++){
    const t = i / 24, x = 44 + t * (w - 108), y = (h - 40) - Math.sin(t * Math.PI) * 62;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke(); g.setLineDash([]);
  g.fillStyle = '#FFE08A';
  g.beginPath(); g.arc(w/2, h - 40 - 62, 3.2, 0, 6.2832); g.fill();
  return cv;
}
function drawCastle(g, x, gy, col, flip){
  g.fillStyle = col.b;
  g.fillRect(x, gy - 30, 44, 30);
  g.fillStyle = col.a;
  for (let i = 0; i < 4; i++) g.fillRect(x + i * 11, gy - 36, 7, 8);
  /* a tower */
  const tx = flip ? x + 34 : x + 2;
  g.fillStyle = col.b; g.fillRect(tx, gy - 46, 10, 46);
  g.fillStyle = col.flag;
  g.beginPath(); g.moveTo(tx + 10, gy - 46); g.lineTo(tx + 22, gy - 42); g.lineTo(tx + 10, gy - 38); g.closePath(); g.fill();
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
        '<span class="kn-hero-cap">' + esc(T('CASTLE WARS', 'GWERER TAL-KASTELLI')) + '</span>' +
      '</div>' +

      (hasSave ? '<button class="btn primary" id="kn-resume" style="margin:2px 0 12px">' +
        esc(T('Carry on the last match', 'Kompli l-aħħar partita')) + '</button>' : '') +

      '<div class="kn-modes">' +
        '<button class="kn-mode primary" id="kn-m-online">' +
          '<span class="mi">' + ICO_GLOBE + '</span>' +
          '<span class="mt"><b>' + esc(T('Play online', 'Ilgħab onlajn')) + '</b>' +
            '<i>' + esc(T('Two castles, two phones.', 'Żewġ kastelli, żewġ telefowns.')) + '</i></span>' +
          '<span class="chev">' + ICO_CHEV + '</span>' +
        '</button>' +
        '<button class="kn-mode" id="kn-m-ai">' +
          '<span class="mi">' + ICO_BOT + '</span>' +
          '<span class="mt"><b>' + esc(T('Play with AI', 'Ilgħab mal-magna')) + '</b>' +
            '<i>' + esc(T('You against the machine.', 'Int kontra l-magna.')) + '</i></span>' +
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

  function paint(){
    el.innerHTML =
      '<div class="pt-wrap kn-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="kn-sb" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(T('Play with AI', 'Ilgħab mal-magna')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<div class="tiny pt-lbl" style="margin-top:6px">' + esc(T('How hard the machine is', 'Kemm hi iebsa l-magna')) + '</div>' +
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
    el.querySelector('#kn-sb').onclick = () => { cue('ui.back', { gain:0.65 }); menu(); };
    el.querySelector('#kn-lvl').addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-lvl]');
      if (!b) return; lvl = +b.getAttribute('data-lvl'); paint();
    });
    el.querySelector('#kn-start').onclick = () => {
      pref({ lvl, first:0 });
      ST.save = null; persist();
      newGame({ lvl, first:0, strat:'BAL' });
    };
  }
  paint();
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
  canStart(){ return { ok:false, why: ONLINE_WHY }; },
  rulesHTML: () =>
    '<p>' + T('Two castles across a moat. Take turns throwing comically Maltese ordnance, and ' +
      'between throws spend what you earn on bigger weapons and better cover.',
      'Żewġ kastelli fuq foss. Bir-rota titfgħu affarijiet Maltin komiċi, u bejniethom onfqu dak ' +
      'li taqilgħu fuq armi akbar u kenn aħjar.') + '</p>' +
    '<p>' + T('Pull back like a slingshot to aim; the shots bounce off the rock in the middle. ' +
      'Knock all of them into the moat to win.',
      'Iġbed lura bħal żbandola biex timmira; it-tefgħat jaqbżu mal-blata fin-nofs. Waddab lil ' +
      'kulħadd fil-foss biex tirbaħ.') + '</p>' +
    '<p>' + esc(ONLINE_WHY) + '</p>',
  blurb: T('Two castles, a moat, and a slingshot. Bounce it off the rock into the other lot.',
           'Żewġ kastelli, foss, u żbandola. Aqbeż mal-blata għal fuq l-oħrajn.'),
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
    first: 0, strat:'BAL'
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
    return T('Two castles across a moat and a slingshot in your hand. Pull back, bank it off ' +
             'the rock, and put the other lot in the sea. Comically Maltese. Solo vs the machine.',
             'Żewġ kastelli fuq foss u żbandola f\'idejk. Iġbed lura, aqbeż mal-blata, u itfa\' ' +
             'lill-oħrajn il-baħar. Malti komiku. Waħdek kontra l-magna.');
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
      lobby: R.lobby, tile: TILE,
      store: () => ST,
      canvas: () => (UI ? UI.cv : null)
    };
  }
} catch(e){}

})();
