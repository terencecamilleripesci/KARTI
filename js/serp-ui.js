/* ═══════════════════════════════════════════════════════════════════
   KARTI — serp-ui.js
   SERP — the arena. The rules live in js/serp.js; this file is the
   screen, the clock, the wire and the paint. It follows js/poker-ui.js's
   shape — engine and UI split down the middle, the themed menu with the
   rules folded shut, the back arrow that goes BACK — and departs from it
   in exactly one place, the clock, because SERP runs on a frame timer.

   WHAT THIS FILE IS  (rebuilt for the modern arena snake)
     · the shelf tile and a MINIMAL entry menu — PLAY ONLINE / PLAY WITH
       THE MACHINE / HOW TO PLAY, with the arena size, snake count and
       speed on a tidy second step so starting a game is one tap
     · the arena: a <canvas> drawn at device pixel ratio, showing a
       WINDOW onto a world many times bigger than the screen. A CAMERA
       follows your snake's head; you see a slice of a large wrapping
       arena with several snakes hunting pellets and each other
     · the thumb: a floating STEER STICK — drag anywhere on the arena and
       the head arcs toward your thumb; a BOOST button to sprint
     · the clock: one requestAnimationFrame loop that steps the sim on a
       FIXED tick and interpolates between ticks for 60fps
     · the wire: aims, boosts, eats and deaths, and the jitter buffer that
       makes a remote snake look smooth from 100ms away
     · a MINIMAP so you can find the other snakes on the big map, a clean
       HUD (your length + rank), and juicy screen-space effects
     · the serp kit shelf — snake skins, trails and arena floors

   ── WHY A CANVAS, AND WHY A CAMERA ─────────────────────────────────
     SERP has up to eight snakes of dozens of segments, all moving every
     frame, on a world several screens wide. A DOM node each would be a
     layout pass per frame and a slideshow on a mid phone. So: ONE canvas.
     Its backing store is resized on RESIZE ONLY (`fitCanvas`), never in
     the loop, and the loop reads no geometry — nothing per frame for the
     browser to lay out. Everything that moves, moves inside the canvas,
     drawn CAMERA-RELATIVE: the world is huge and wraps, and only the
     slice around your head is painted. The HUD and minimap counts are
     DOM, repainted on CHANGE, not per frame.

   ── THE CONTROL SCHEME, AND WHY IT IS A DRAG STICK ─────────────────
     The old SERP was a grid snake and used a four-way pad, because a grid
     snake only has four headings. THIS snake steers CONTINUOUSLY — it can
     point anywhere — so a four-way pad would throw away most of the
     control the movement now allows. Tested on a 390x844 phone, one
     thumb:

     A FOUR-WAY PAD can only ask for up/right/down/left, and a continuous
       snake that can only be pointed at 90° increments feels exactly as
       stiff as the grid game we are replacing. Wrong for this movement.

     A DRAG STICK wins, and it is the genre's own answer: press anywhere
       on the arena and a little stick appears under your thumb; the head
       steers toward the DIRECTION from the stick's origin to where your
       thumb is now. Push the thumb where you want to go. It reads a
       heading the instant the finger moves — there is nothing to
       "recognise" the way a swipe gesture has to travel first — and the
       turn-rate limit in the engine turns that heading into a smooth arc,
       so the snake curves toward the thumb rather than snapping.

     The stick FLOATS: it is wherever the thumb lands, so the hand is
       never forced over the snake, and on a tall phone the thumb rests
       low while the head is followed by the camera up in the middle of
       the arena. A BOOST button sits in the corner for the other thumb
       (or a double-tap boosts) — hold to sprint, which costs a little
       length, the genre staple.

     A keyboard drives it too (arrows / WASD set a heading), for the desk
     and for the test harness.

   ── THE JITTER BUFFER, WHICH IS THE WHOLE ONLINE GAME ──────────────
     Unchanged in spirit from the grid build and adapted to continuous
     movement. Every remote snake is simulated to `tick - lag[seat]`, and
     the swept collision in js/serp.js reads snakes AT WHATEVER TICK THEY
     REACHED — so you are never killed by a body this phone only guessed
     at. lag[seat] is measured per peer, continuously: every event carries
     the sender's TICK; the MINIMUM offset over the last events is the
     floor (offset + best trip), the spread above it is the jitter, and
     the buffer is the 90th percentile of that spread plus a tick of
     slack. js/mp.js's pingStats() folds in as a second opinion. A late
     message is applied RETROACTIVELY (the engine rewinds that one snake)
     and the correction is BLENDED OUT over ~110ms by the visual offset in
     smooth(), never teleported.

   HOUSE RULES OBEYED
     · borrows #scr-party through KARTI_PARTY; injects its own CSS once;
     · no emoji; sounds only through KARTI_SFX ids that already exist;
     · every player-visible string is a T(en, mt) pair (js/lang.js);
     · reduced motion turns off interpolation, the trail, the death burst
       and the pellet pulse, and the game stays completely playable;
     · the back arrow goes BACK, no "are you sure", no js/nav.js guard.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_SERP;
if (!K || !P || !R || !R.engine) return;

const E = R.engine;
const esc = K.esc || (s => String(s == null ? '' : s));
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');

/* ── the one language switch (js/lang.js) ────────────────────────── */
const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;

/* ── reduced motion, the two doors the rest of the app honours ───── */
function noMotion(){
  try {
    if (window.KARTI && KARTI.REDUCED) return true;
    if (document.body && document.body.classList.contains('reduced')) return true;
    return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch(e){ return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   SOUND — existing ids only, through one gate. A snake eats every second
   or two and dies once, so the eat is the quiet one and the death is the
   loud one; the reverse is what makes a game tiring.
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
const STORE = 'karti_serp_v1';
let ST = { v:1, pref:{}, best:0, rec:{ w:0, l:0, d:0 } };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object'){
    ST.pref = (j.pref && typeof j.pref === 'object') ? j.pref : {};
    ST.rec  = (j.rec  && typeof j.rec  === 'object') ? j.rec  : ST.rec;
    ST.best = j.best | 0;
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

/* ── UI-only preferences in their OWN key ────────────────────────── */
const UIKEY = 'karti_serp_ui_v1';
let rulesOpen = false;
try { rulesOpen = localStorage.getItem(UIKEY + '.rules') === '1'; } catch(e){}

/* the machine, by the club's own names */
const LEVELS = [
  { level:1, name:'Gentle',   note:'Will miss things.' },
  { level:2, name:'Normal',   note:'Plays properly.' },
  { level:3, name:'Ruthless', note:'Plays to win.' }
];
function levelWords(k){
  if (k === 1) return { n:T('Gentle', 'Kalm'),         i:T('Wanders. Easy to beat.', 'Jitlajja. Faċli tirbaħ.') };
  if (k === 3) return { n:T('Ruthless', 'Bla ħniena'), i:T('Cuts you off on purpose.', 'Jaqtagħlek it-triq apposta.') };
  return { n:T('Normal', 'Normali'), i:T('Plays properly.', 'Jilgħab sew.') };
}

/* the speeds, named */
const SPEEDWORDS = {
  kalm:   () => ({ n:'KALM',    i:T('A gentle glide. Room to think.', 'Bil-mod. Spazju biex taħseb.') }),
  normal: () => ({ n:'NORMALI', i:T('The house speed.', 'Il-pass tad-dar.') }),
  mignun: () => ({ n:'MIĠNUN',  i:T('Too fast. That is the point.', 'Mgħaġġel wisq. Dak hu l-punt.') })
};

/* ── the eight snakes, by colour. Seat order fixed, so the snake you are
   is the same colour on every phone at the table. ───────────────── */
const COLS = [
  { a:'#3BE08A', b:'#0E7A45', n:() => T('Green',  'Aħdar')   },
  { a:'#FF6B8A', b:'#8E1F38', n:() => T('Pink',   'Roża')    },
  { a:'#5FC8FF', b:'#175E8E', n:() => T('Blue',   'Blu')     },
  { a:'#FFC542', b:'#8A6210', n:() => T('Gold',   'Deheb')   },
  { a:'#C08BFF', b:'#5A2E92', n:() => T('Violet', 'Vjola')   },
  { a:'#FF9A4D', b:'#8E4A10', n:() => T('Orange', 'Oranġjo') },
  { a:'#7BE8E0', b:'#177A74', n:() => T('Teal',   'Teal')    },
  { a:'#E8E2D0', b:'#7A7260', n:() => T('Bone',   'Għadma')  }
];

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party .sp-*
   The arena is a fixed rectangle that fills the space above a slim
   control strip; both are laid out by the FLEX BOX, never by script.
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS(){
  if (document.getElementById('sp-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'sp-runtime-css';
  st.textContent =
    /* the host fills its parent and NEVER overflows it: width:100% +
       box-sizing keep the arena (and the minimap pinned to its corner)
       inside the viewport at every phone size and orientation */
    '#scr-party .sp-host{display:flex;flex-direction:column;align-items:stretch;' +
      'justify-content:flex-start;gap:6px;min-height:0;height:100%;width:100%;' +
      'max-width:100%;box-sizing:border-box;overflow:hidden;' +
      /* a heart glyph as an SVG mask, so a life pip is one tiny element */
      "--sp-heart:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' " +
        "viewBox='0 0 24 24'%3E%3Cpath d='M12 21s-8-5.4-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.6-8 11-8 11z'/%3E%3C/svg%3E\")}" +

    /* ── the arena: fills the space; the world scrolls inside it ── */
    '#scr-party .sp-arena{position:relative;flex:1 1 auto;min-height:0;border-radius:14px;' +
      'overflow:hidden;border:2px solid rgba(0,0,0,.55);background:#070B12;' +
      'box-shadow:0 10px 26px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.05)}' +
    '#scr-party .sp-arena canvas.sp-cv{display:block;width:100%;height:100%;touch-action:none;' +
      '-webkit-user-select:none;user-select:none}' +

    /* the minimap sits over the top-right of the arena, DOM-free (canvas) */
    '#scr-party .sp-mini{position:absolute;top:8px;right:8px;width:74px;height:74px;' +
      'border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(6,10,18,.62);' +
      'box-shadow:0 4px 12px rgba(0,0,0,.4);pointer-events:none;z-index:3}' +
    '@media (max-height:560px){#scr-party .sp-mini{width:58px;height:58px}}' +

    /* the boost button, bottom-right of the arena */
    '#scr-party .sp-boost{position:absolute;right:12px;bottom:12px;width:66px;height:66px;' +
      'border-radius:50%;border:0;z-index:5;touch-action:none;-webkit-user-select:none;' +
      'user-select:none;background:radial-gradient(circle at 50% 38%,rgba(255,197,66,.30),' +
      'rgba(255,197,66,.10));box-shadow:inset 0 0 0 1.5px rgba(255,197,66,.5),' +
      '0 6px 16px rgba(0,0,0,.45);color:#FFE7B0;display:flex;align-items:center;' +
      'justify-content:center;font:900 10px/1 var(--disp);letter-spacing:.08em}' +
    '#scr-party .sp-boost svg{width:26px;height:26px;stroke:currentColor;fill:none;' +
      'stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}' +
    '#scr-party .sp-boost.on{background:radial-gradient(circle at 50% 38%,rgba(255,213,110,.6),' +
      'rgba(255,160,40,.28));color:#fff;box-shadow:inset 0 0 0 2px rgba(255,220,120,.85),' +
      '0 0 22px rgba(255,180,60,.6)}' +

    /* the countdown and the round banner sit OVER the canvas */
    '#scr-party .sp-over{position:absolute;inset:0;display:flex;align-items:center;' +
      'justify-content:center;pointer-events:none;z-index:4}' +
    '#scr-party .sp-cd{font:900 64px/1 var(--disp);color:#fff;letter-spacing:.02em;' +
      'text-shadow:0 4px 18px rgba(0,0,0,.8);transform:scale(1);opacity:.95}' +
    '#scr-party .sp-cd.go{font-size:40px;color:var(--gold,#FFC542)}' +

    /* ── the HUD: rank + length + a chip per snake, on CHANGE only ── */
    '#scr-party .sp-hud{flex:0 0 auto;display:flex;align-items:center;gap:8px;width:100%;' +
      'padding:0 4px;box-sizing:border-box;overflow:hidden}' +
    '#scr-party .sp-rank{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;padding:3px 9px;border-radius:11px;background:rgba(255,197,66,.13);' +
      'box-shadow:inset 0 0 0 1px rgba(255,197,66,.32)}' +
    '#scr-party .sp-rank b{font:900 15px/1 var(--disp);color:#fff}' +
    '#scr-party .sp-rank i{font:900 8px/1 var(--disp);letter-spacing:.1em;color:var(--dim);' +
      'font-style:normal;margin-top:2px}' +
    '#scr-party .sp-chips{flex:1 1 auto;display:flex;flex-wrap:nowrap;gap:5px;overflow:hidden}' +
    '#scr-party .sp-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;' +
      'border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);' +
      'font:900 10px/1 var(--disp);letter-spacing:.04em;color:var(--dim);flex:0 0 auto}' +
    '#scr-party .sp-chip .d{width:9px;height:9px;border-radius:3px;flex:0 0 auto}' +
    '#scr-party .sp-chip b{color:#fff;font-size:11px}' +
    '#scr-party .sp-chip.me{background:rgba(255,197,66,.13);border-color:rgba(255,197,66,.38)}' +
    '#scr-party .sp-chip.out{opacity:.36}' +
    '#scr-party .sp-chip.out b{text-decoration:line-through}' +

    /* ── LIVES pips: a little heart per life, hollow once spent. The rank
       block gets a dedicated life variant so the local count reads big. ── */
    '#scr-party .sp-rank-life b{color:#FF6B8A}' +
    '#scr-party .sp-pips{display:inline-flex;align-items:center;gap:2px;margin:2px 0 0}' +
    '#scr-party .sp-chip .sp-pips{margin:0 1px 0 0}' +
    '#scr-party .sp-pip{width:7px;height:7px;flex:0 0 auto;background:#FF6B8A;' +
      '-webkit-mask:var(--sp-heart) center/contain no-repeat;mask:var(--sp-heart) center/contain no-repeat}' +
    '#scr-party .sp-pip-x{background:rgba(255,255,255,.22)}' +
    '#scr-party .sp-chip .sp-pip{width:6px;height:6px}' +

    /* a tiny hint strip under the arena naming the controls */
    '#scr-party .sp-hint{flex:0 0 auto;text-align:center;font:900 9px/1.3 var(--disp);' +
      'letter-spacing:.06em;text-transform:uppercase;color:var(--dim);opacity:.8;' +
      'padding:1px 0 3px}' +

    /* ── the rules: a panel that HIDES AND SLIDES, poker's exactly ── */
    '#scr-party .sp-rules{position:absolute;top:0;left:0;right:0;z-index:30;max-height:76%;' +
      'display:flex;flex-direction:column;background:rgba(14,12,24,.97);' +
      'border-bottom:1px solid rgba(255,255,255,.12);border-radius:0 0 16px 16px;' +
      'box-shadow:0 14px 34px rgba(0,0,0,.6);transform:translateY(-102%);opacity:0;' +
      'visibility:hidden;pointer-events:none;' +
      'transition:transform .3s var(--ease),opacity .3s var(--ease),visibility 0s .3s}' +
    '#scr-party .sp-rules.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .3s var(--ease),opacity .3s var(--ease),visibility 0s 0s}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .sp-rules{transition:none}}' +
    'body.reduced #scr-party .sp-rules{transition:none}' +
    '#scr-party .sp-rules-h{flex:0 0 auto;display:flex;align-items:center;' +
      'justify-content:space-between;gap:8px;padding:10px 14px 6px}' +
    '#scr-party .sp-rules-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--gold,#FFC542)}' +
    '#scr-party .sp-rules-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;' +
      'color:var(--dim);display:flex;align-items:center;justify-content:center}' +
    '#scr-party .sp-rules-x svg{width:16px;height:16px;stroke:currentColor;fill:none;' +
      'stroke-width:2.2;stroke-linecap:round}' +
    '#scr-party .sp-rules-b{min-height:0;overflow-y:auto;padding:2px 14px 14px;' +
      '-webkit-overflow-scrolling:touch}' +
    '#scr-party .sp-rules-b ul{margin:0;padding:0}' +
    '#scr-party .sp-rules-b li{font-size:12px;line-height:1.6;color:var(--dim);' +
      'list-style:none;margin:0 0 7px;padding:0 0 0 13px;position:relative}' +
    '#scr-party .sp-rules-b li:before{content:"";position:absolute;left:0;top:7px;width:5px;' +
      'height:5px;border-radius:2px;background:var(--gold,#FFC542);opacity:.75}' +
    '#scr-party .sp-rules-b b{color:#fff}' +

    /* ── the menu, poker's chrome ── */
    '#scr-party .sp-menu .sp-hero{position:relative;display:flex;align-items:center;' +
      'justify-content:center;height:128px;margin:2px 0 12px;border-radius:16px;overflow:hidden;' +
      'background:radial-gradient(120% 120% at 50% 24%,#0F3A56 0%,#0B2033 52%,#060C14 100%);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),inset 0 -16px 30px rgba(0,0,0,.45)}' +
    '#scr-party .sp-menu .sp-hero canvas{display:block}' +
    '#scr-party .sp-menu .sp-hero-cap{position:absolute;right:10px;bottom:8px;' +
      'font:900 10px/1 var(--disp);letter-spacing:.12em;color:rgba(255,255,255,.42)}' +
    '@media (max-height:520px){#scr-party .sp-menu .sp-hero{height:96px}}' +
    '#scr-party .sp-step{display:flex;align-items:center;justify-content:space-between;gap:10px;' +
      'padding:6px 10px;border-radius:14px;background:rgba(255,255,255,.05);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}' +
    '#scr-party .sp-step .v{font:900 24px/1 var(--disp);color:#fff;display:flex;' +
      'flex-direction:column;align-items:center;gap:3px}' +
    '#scr-party .sp-step .v i{font:900 9px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--dim);font-style:normal}' +
    '#scr-party .sp-rnd{width:46px;height:46px;border-radius:50%;border:0;' +
      'background:rgba(255,255,255,.09);color:#fff;font:900 22px/1 var(--disp)}' +
    '#scr-party .sp-rnd[disabled]{opacity:.3}' +

    /* the end-of-round table */
    '#scr-party .sp-tally{width:100%;max-width:340px;margin:0 auto}' +
    '#scr-party .sp-row{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:11px;' +
      'background:rgba(255,255,255,.045);margin-bottom:5px}' +
    '#scr-party .sp-row .p{font:900 12px/1 var(--disp);color:var(--dim);width:20px}' +
    '#scr-party .sp-row .d{width:11px;height:11px;border-radius:3px;flex:0 0 auto}' +
    '#scr-party .sp-row .n{flex:1;min-width:0;font:900 12px/1.2 var(--disp);color:#fff;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#scr-party .sp-row .s{font:900 13px/1 var(--disp);color:var(--gold,#FFC542)}' +
    '#scr-party .sp-row.win{background:rgba(255,197,66,.14);' +
      'box-shadow:inset 0 0 0 1px rgba(255,197,66,.3)}';
  document.head.appendChild(st);
}

/* ── the shelf mark. One symbol, injected once. ──────────────────── */
function injectDefs(){
  if (document.getElementById('sp-defs') || !document.body) return;
  const d = document.createElement('div');
  d.id = 'sp-defs';
  d.setAttribute('aria-hidden', 'true');
  d.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  d.innerHTML =
    '<svg width="0" height="0" focusable="false">' +
    '<symbol id="sp-t-serp" viewBox="0 0 24 24">' +
      '<path d="M5 18.4h7.2a3.2 3.2 0 0 0 0-6.4H8.6a3.2 3.2 0 0 1 0-6.4H16" ' +
        'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" ' +
        'stroke-linejoin="round"/>' +
      '<circle cx="18.1" cy="5.6" r="2.5"/>' +
      '<circle cx="17.3" cy="4.9" r=".62" fill="#0B1018"/>' +
    '</symbol></svg>';
  document.body.appendChild(d);
}

/* ═══════════════════════════════════════════════════════════════════
   THE RUNNER
   M is the whole live game: engine state, clock, wire and canvas. There
   is exactly one, and leave() is the only way out.
   ═══════════════════════════════════════════════════════════════════ */
let M = null;
let UI = null;
const moveSubs = [];
function fire(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }

/* THE ONE PLACE ANYTHING IN SERP TOUCHES Math.random: a brand-new local
   match choosing its seed. From here on the seed is data and the engine
   is pure. */
function newSeed(){ return (Math.random() * 0xFFFFFFFF) >>> 0; }

const nowMs = () => (typeof performance !== 'undefined' && performance.now)
                      ? performance.now() : Date.now();

const coastTicks = st => Math.max(16, Math.round(1500 / st.step));
const LEAD_MS = 2400;

/* how many WORLD UNITS the viewport shows across its shorter side. The
   world is WORLD_U (200) units, so ~28 units visible is a world roughly
   7x the screen — a big scrolling arena. */
const VIEW_U = 30;

/* ═══════════════════════════════════════════════════════════════════
   DYNAMIC CAMERA ZOOM — slither.io / snake.io's own trick, and PURELY a
   render transform: it scales `UI.ppu` at paint time and NEVER touches the
   sim. The engine hashes nothing this reads or writes.

   As YOUR snake grows longer it is harder to keep the whole animal on a
   phone, so the camera eases OUT (fewer pixels per world-unit → more world
   on screen). Dead/respawned and short again, it eases back IN.

   THE MAP, length -> zoom multiplier on the base ppu:
     growth = max(0, bodyTicks - SEG_START)         (0 at birth)
     zoom   = ZOOM_MIN + (1 - ZOOM_MIN) * K/(K + growth)
   A hyperbola: full base scale (1.0) at the starting length, easing toward
   ZOOM_MIN as you get long. K sets the half-way point — at growth = K the
   snake has zoomed HALF of the way from 1.0 to the floor.

   RE-BASELINED for the SNAKE.IO ramp: snakes now START SMALL (SEG_START ≈ 5)
   and grow ~GROW_TICKS per pellet, so `growth` measures body-ticks earned by
   eating from that tiny baseline. A BRAND-NEW small snake has growth 0 → the
   ZOOMED-IN baseline (z = 1.0, a close comfortable view of a little starter
   snake). As it eats it lengthens and the camera eases OUT smoothly toward
   the floor. ZOOM_K is tuned to this new scale: growth reaches K around ~20
   pellets (5 + 4·20 = 85 ticks ⇒ growth 80), so a mid-length snake is halfway
   out and a long, well-fed snake sits near the ZOOM_MIN floor.

   THE CLAMP, and why it is playable at 390×844, in the NOW-SCALABLE world:
     Base VIEW_U is 30 units across the shorter (390px) side. The world is no
     longer a fixed 200 — it grows with the snake count (up to 428 at a full
     table) — so a long snake needs to zoom out MORE than before to read the
     late game like slither.io. ZOOM_MIN is deepened to 0.40: the most-zoomed
     -out view shows 30/0.40 = 75 units across — a wide window that still
     paints a max-length body at several px and keeps pellets tappable, and in
     a 428-unit world that is a good ~1/6 of the map on screen at once (in a
     small 200-unit world it is over a third — the zoom composes with the
     world size for free, because everything is camera-relative). ZOOM_K is
     lowered to 65 so a mid-length snake is already easing out, matching the
     genre's "get big, see more" feel. Past ZOOM_MIN the world gets too tiny
     to steer, so it is the floor and we never shrink further.
   ═══════════════════════════════════════════════════════════════════ */
const ZOOM_MIN = 0.40;   /* never below 40% of the base scale (playable)  */
const ZOOM_K   = 65;     /* growth-ticks to half-way zoom (~15 pellets on
                            the small-start ramp: 5 + 4·15 ⇒ growth 60)     */
const ZOOM_TAU = 260;    /* ease time-constant (ms); glides, never jumps   */

/* the target multiplier for a given body length (ticks). Pure, no state. */
function zoomFor(bodyTicks){
  const growth = Math.max(0, (bodyTicks | 0) - E.SEG_START);
  const z = ZOOM_MIN + (1 - ZOOM_MIN) * (ZOOM_K / (ZOOM_K + growth));
  return z < ZOOM_MIN ? ZOOM_MIN : (z > 1 ? 1 : z);
}

/* the LOCAL snake's current length, in body-ticks — a read, never a write.
   Falls back to the starting length before the world exists. */
function currentLen(){
  try {
    const me = M && M.st && M.st.snakes[M.me];
    return me ? (me.bodyTicks | 0) : E.SEG_START;
  } catch(e){ return E.SEG_START; }
}

function startMatch(opts, seed, net){
  stopLoop();
  FX.length = 0;
  const o = Object.assign({ seats:6, speed:'normal', lvl:2, lives:E.LIVES_DEFAULT }, opts || {});
  M = {
    opts: o,
    seed: (seed == null ? newSeed() : seed) >>> 0,
    st: null,
    cv: null, g2: null, mini: null, mg2: null,
    net: net || null,
    me: 0,
    mine: [],
    meta: [],
    t0: 0,
    tick: 0,
    aim: null,                  /* the heading the thumb has asked for   */
    aimSaid: -1,                /* the last aim we broadcast (to dedupe) */
    boost: 0,                   /* is the local snake sprinting          */
    boostSaid: -1,
    peers: {},
    raf: 0, dead: false, finished: false,
    fps: { n:0, at:0, val:0 },
    lead: LEAD_MS,
    ledSaid: -1,
    cam: { x:0, y:0, set:false }
  };
  M.st = E.deal(o, M.seed);
  return M;
}

/* ═══════════════════════════════════════════════════════════════════
   THE JITTER BUFFER — one per remote seat, exactly as the grid build.
   ═══════════════════════════════════════════════════════════════════ */
const RING = 24;
function peerOf(seat){
  let p = M.peers[seat];
  if (!p) p = M.peers[seat] = { ds:[], floor:0, lag:2, seen:0 };
  return p;
}
function radioJitter(){
  try {
    const MPX = window.KARTI_MP;
    if (!MPX || !MPX.pingStats) return null;
    const s = MPX.pingStats();
    if (!s || s.n < 4 || s.best == null) return null;
    return Math.max(0, (s.worst - s.best) / 2);
  } catch(e){ return null; }
}
function noteArrival(seat, remoteTick){
  const p = peerOf(seat);
  const d = M.tick - (remoteTick | 0);
  p.ds.push(d);
  if (p.ds.length > RING) p.ds.shift();
  p.seen = M.tick;
  const a = p.ds.slice().sort((x, y) => x - y);
  p.floor = a[0];
  const p90 = a[Math.min(a.length - 1, Math.floor(a.length * 0.9))];
  let margin = Math.max(0, p90 - p.floor);
  const rj = radioJitter();
  if (rj != null) margin = Math.max(margin, rj / M.st.step);
  p.lag = Math.max(0, Math.min(24, p.floor + Math.ceil(margin) + 1));
}
function seatTick(seat){
  if (M.mine.indexOf(seat) >= 0) return M.tick;
  const p = M.peers[seat];
  return M.tick - (p ? p.lag : 2);
}
function lagMs(){
  let worst = 0;
  for (const k in M.peers) worst = Math.max(worst, M.peers[k].lag);
  return Math.round(worst * M.st.step);
}

/* ═══════════════════════════════════════════════════════════════════
   THE CLOCK — one rAF loop. Fixed tick derived from wall time, then one
   draw interpolating between the last two ticks. A backgrounded tab that
   comes back owing many steps SKIPS them (catch-up clamp) rather than
   fast-forwarding a snake into somebody.
   ═══════════════════════════════════════════════════════════════════ */
const MAX_CATCHUP = 4;

function stopLoop(){
  if (M && M.raf){ cancelAnimationFrame(M.raf); M.raf = 0; }
}
function startLoop(){
  if (!M || M.raf) return;
  M.t0 = nowMs() + M.lead;
  const step = t => {
    if (!M || M.dead) return;
    M.raf = requestAnimationFrame(step);
    frame(t);
  };
  M.raf = requestAnimationFrame(step);
}

function frame(t){
  const st = M.st;
  const now = (t == null) ? nowMs() : t;

  if (now < M.t0){
    const left = M.t0 - now;
    const beat = Math.ceil(left / 800);
    if (beat !== M.ledSaid){
      M.ledSaid = beat;
      const S = window.KARTI_SFX;
      if (S && S.note) { try { S.note(4 - beat); } catch(e){} }
      paintCountdown(beat);
    }
    draw(0);
    meter(now);
    return;
  }
  if (M.ledSaid !== 0){
    M.ledSaid = 0;
    paintCountdown(0);
    cue('game.start', { gain:0.85 }, true);
  }

  const want = Math.floor((now - M.t0) / st.step) + 1;
  if (want - M.tick > MAX_CATCHUP){
    M.t0 = now - (M.tick * st.step);
  } else {
    let guard = 0;
    while (M.tick < want && guard++ < MAX_CATCHUP) doTick();
  }

  const frac = Math.max(0, Math.min(1, (now - M.t0) / st.step - (M.tick - 1)));
  draw(noMotion() ? 1 : frac);
  meter(now);
}

function meter(now){
  const f = M.fps;
  f.n++;
  if (!f.at) f.at = now;
  else if (now - f.at >= 1000){
    f.val = Math.round(f.n * 1000 / (now - f.at));
    f.n = 0; f.at = now;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   ONE TICK — the order is the design:
     1. every REMOTE snake is walked to its own buffered tick, on events
        that actually arrived;
     2. every snake THIS PHONE OWNS steers (thumb, or the machine), moves,
        then — and only then — decides whether it just died or just ate,
        against a world of buffered remote bodies;
     3. the horizon moves up and the past is frozen.
   Nothing in step 2 writes to a snake from step 1.
   ═══════════════════════════════════════════════════════════════════ */
function doTick(){
  const st = M.st;
  M.tick++;

  /* 1 — the neighbours, as far as we have actually been told */
  for (let s = 0; s < st.snakes.length; s++){
    if (M.mine.indexOf(s) >= 0) continue;
    const sn = st.snakes[s];
    const to = seatTick(s);
    if (to > sn.tick){
      const was = headOf(sn);
      E.simTo(st, sn, to, null);
      smoothFrom(sn, was);
    }
  }

  /* 2 — ours */
  for (let i = 0; i < M.mine.length; i++){
    const seat = M.mine[i];
    const sn = st.snakes[seat];
    if (!sn.alive){ sn.tick = M.tick; continue; }

    /* the local snake's steering + boost go in LOCALLY FIRST and travel
       afterwards — the thumb never waits for the network */
    if (seat === M.me){
      if (M.aim != null && M.aim !== M.aimSaid){
        if (E.plan(st, sn, { t:M.tick, k:'aim', a:M.aim })){
          say(seat, { t:'aim', tick:M.tick, ang:M.aim });
          M.aimSaid = M.aim;
        }
      }
      if (M.boost !== M.boostSaid){
        if (E.plan(st, sn, { t:M.tick, k:'boost', b:M.boost })){
          say(seat, { t:'boost', tick:M.tick, on:M.boost });
          M.boostSaid = M.boost;
        }
      }
    }
    /* the machine's snakes: a steer decision on their own beat */
    if (sn.own === 'ai'){
      const a = E.bot(st, sn, M.tick, sn.lvl || st.lvl);
      if (a != null && a !== sn.aim && E.plan(st, sn, { t:M.tick, k:'aim', a }))
        say(seat, { t:'aim', tick:M.tick, ang:a });
    }

    E.simTo(st, sn, M.tick, null);

    /* 2b — DID I DIE. Nobody else's phone may answer this. Swept from the
       head's previous sample to its new one. */
    const p = sn.path;
    const fromX = (p.length > 1) ? p[1].x : sn.hx;
    const fromY = (p.length > 1) ? p[1].y : sn.hy;
    const why = E.hitTest(st, sn, fromX, fromY);
    if (why != null){
      /* the head, WHERE IT FELL, for the death burst — plan() may respawn the
         snake (a life in hand) and move its head before we get to paint it */
      const fellX = sn.hx, fellY = sn.hy;
      /* the engine spends a life, scatters the drip and respawns-or-eliminates
         inside plan()/stepOne — scatterDrops is engine-internal now, not ours */
      E.plan(st, sn, { t:M.tick, k:'die', n:why });
      resettle();
      say(seat, { t:'die', tick:M.tick, why });
      onDeath(seat, why, fellX, fellY);
      /* if a life remained the snake is alive again (small, elsewhere); only
         a true elimination stops it. Either way this tick is spent. */
      continue;
    }

    /* 2c — DID I EAT. A claim, not a verdict: settle() decides. */
    const idx = E.pelletUnder(st, sn);
    if (idx >= 0){
      st.claims.push({ i:idx, s:seat, t:M.tick });
      E.plan(st, sn, { t:M.tick, k:'eat', n:idx });
      resettle();
      say(seat, { t:'eat', tick:M.tick, idx });
      if (sn.score > (sn.saidScore | 0)){
        sn.saidScore = sn.score;
        const kit = KIT.skin(sn.seat);
        fxEat(sn.hx, sn.hy, seat === M.me ? '#FFC542' : kit.a);
        if (seat === M.me) cue('ui.coin', { gain:0.42 });
      }
      hud();
    }
  }

  /* 3 — freeze the past */
  E.advanceHorizon(st, M.tick - E.HORIZON);

  if (!M.finished && E.over(st)) finish();
}

function resettle(){
  const st = M.st;
  const before = st.snakes.map(headOf);
  const redo = E.settle(st);
  for (let i = 0; i < redo.length; i++){
    const sn = redo[i];
    const want = sn.tick;
    E.restore(sn);
    E.simTo(st, sn, want, null);
    smoothFrom(sn, before[sn.seat]);
  }
  if (redo.length) hud();
  return redo;
}

const headOf = sn => ({ x: sn.hx, y: sn.hy });

/* ── ERROR SMOOTHING — a rewind moves a head; drawing it there at once is
   a teleport, the one thing that makes a networked game look broken. The
   DIFFERENCE is remembered as a visual offset (in fu) and decays to
   nothing over ~110ms. Beyond a few units the error is a phone that was
   away, not jitter, so that snaps once, honestly. ────────────────── */
const SMOOTH_TAU = 110;
const SMOOTH_MAX = 6 * E.ONE;
function smoothFrom(sn, was){
  if (!was || noMotion()) return;
  const h = headOf(sn);
  let dx = E.wrapDelta(was.x - h.x), dy = E.wrapDelta(was.y - h.y);
  if (!dx && !dy) return;
  if (Math.abs(dx) > SMOOTH_MAX || Math.abs(dy) > SMOOTH_MAX){ sn.vx = 0; sn.vy = 0; return; }
  sn.vx = (sn.vx || 0) + dx;
  sn.vy = (sn.vy || 0) + dy;
}
function decaySmooth(dtMs){
  const k = Math.exp(-dtMs / SMOOTH_TAU);
  const sns = M.st.snakes;
  for (let i = 0; i < sns.length; i++){
    const sn = sns[i];
    if (sn.vx) { sn.vx *= k; if (Math.abs(sn.vx) < 4) sn.vx = 0; }
    if (sn.vy) { sn.vy *= k; if (Math.abs(sn.vy) < 4) sn.vy = 0; }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   THE CANVAS
   fitCanvas() is the ONLY thing that reads layout; it runs on mount and
   on resize, never in the loop. The world is drawn CAMERA-RELATIVE at a
   scale of `ppu` pixels per world-unit; the loop reads no geometry.
   ═══════════════════════════════════════════════════════════════════ */
function fitCanvas(){
  if (!UI || !UI.cv || !UI.arena) return;
  const aw = UI.arena.clientWidth, ah = UI.arena.clientHeight;
  if (!aw || !ah) return;
  UI.vw = aw; UI.vh = ah;
  /* pixels per world-unit: fit VIEW_U units across the SHORTER side, so a
     portrait phone and a landscape one both see a sensible slice. This is
     the BASE scale; the dynamic zoom multiplies it into UI.ppu (below), so
     the whole renderer reads one number and the follow framing is unchanged. */
  UI.ppuBase = Math.min(aw, ah) / VIEW_U;
  if (UI.zoom == null) UI.zoom = zoomFor(currentLen());
  UI.ppu = UI.ppuBase * UI.zoom;

  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const px = Math.round(aw * dpr), py = Math.round(ah * dpr);
  if (UI.cv.width !== px || UI.cv.height !== py){ UI.cv.width = px; UI.cv.height = py; }
  UI.dpr = dpr;
  UI.g2.setTransform(dpr, 0, 0, dpr, 0, 0);

  /* the minimap backing store */
  if (UI.mini){
    const ms = UI.mini.clientWidth || 74;
    const mp = Math.round(ms * dpr);
    if (UI.mini.width !== mp){ UI.mini.width = mp; UI.mini.height = mp; }
    UI.mg2.setTransform(dpr, 0, 0, dpr, 0, 0);
    UI.miniSide = ms;
  }
}

/* fu -> screen pixel, camera-relative, with wrap. Returns {x,y}. The
   world wraps, so a point is drawn at whichever copy is nearest the
   camera centre. */
function toScreen(wx, wy){
  const cam = M.cam;
  const dx = E.wrapDelta(wx - cam.x), dy = E.wrapDelta(wy - cam.y);
  return {
    x: UI.vw / 2 + (dx / E.ONE) * UI.ppu,
    y: UI.vh / 2 + (dy / E.ONE) * UI.ppu
  };
}

/* ── draw one frame. `f` is 0..1 between the previous tick and this one.
   A body sample at tick k is one head-step behind tick k-1, so a segment
   is drawn at lerp of consecutive samples — continuous for free. ──── */
function draw(f){
  if (!UI || !UI.g2 || !UI.vw) return;
  const st = M.st, g = UI.g2, now = nowMs();
  const dtMs = Math.max(0, Math.min(64, now - (UI.lastAt || now)));
  decaySmooth(dtMs);
  UI.lastAt = now;

  /* ── DYNAMIC ZOOM — ease the applied scale toward the length's target,
     frame-rate-independent, then fold it into UI.ppu. This is the ONLY
     writer of UI.zoom/UI.ppu in the loop; everything camera-relative
     (toScreen, grid, bounds, minimap, body/pellet sizing) reads UI.ppu, so
     the zoom composes with the head-follow about screen centre for free.
     Reduced motion snaps to the target (no glide), like the camera above. */
  if (UI.ppuBase){
    const zTarget = zoomFor(currentLen());
    if (UI.zoom == null || noMotion()) UI.zoom = zTarget;
    else {
      const kz = 1 - Math.exp(-dtMs / ZOOM_TAU);
      UI.zoom += (zTarget - UI.zoom) * kz;
    }
    UI.ppu = UI.ppuBase * UI.zoom;
  }

  /* the camera eases toward the local head so a rewind never yanks it */
  const me = st.snakes[M.me];
  if (me){
    const hx = me.hx + (me.vx || 0), hy = me.hy + (me.vy || 0);
    if (!M.cam.set){ M.cam.x = hx; M.cam.y = hy; M.cam.set = true; }
    else {
      const kx = noMotion() ? 1 : 0.22;
      M.cam.x = E.wrapFu(M.cam.x + E.wrapDelta(hx - M.cam.x) * kx);
      M.cam.y = E.wrapFu(M.cam.y + E.wrapDelta(hy - M.cam.y) * kx);
    }
  }

  /* ── the floor: a dark vignette + a scrolling grid so speed reads ── */
  const sk = KIT.floor();
  const grd = g.createRadialGradient(UI.vw / 2, UI.vh * 0.42, 0,
                                     UI.vw / 2, UI.vh * 0.5, Math.max(UI.vw, UI.vh) * 0.75);
  grd.addColorStop(0, sk.a); grd.addColorStop(1, sk.b);
  g.fillStyle = grd;
  g.fillRect(0, 0, UI.vw, UI.vh);
  drawGrid(g, sk.line);
  drawBounds(g);

  /* ── the pellets in view ── */
  drawPellets(g, f, now);

  /* ── the snakes, dead ones first so the living draw over them ── */
  for (let pass = 0; pass < 2; pass++){
    for (let s = 0; s < st.snakes.length; s++){
      const sn = st.snakes[s];
      if ((pass === 0) !== !sn.alive) continue;
      drawSnake(g, sn, f, now);
    }
  }

  /* ── flourishes, then the minimap ── */
  fxDraw(g, now);
  drawMini();
}

/* the world grid, scrolling under the camera; a light square lattice */
function drawGrid(g, line){
  const step = UI.ppu * 5;                 /* a line every 5 world-units   */
  if (step < 6) return;
  const cam = M.cam;
  const ox = ((-(cam.x / E.ONE) % 5) * UI.ppu);
  const oy = ((-(cam.y / E.ONE) % 5) * UI.ppu);
  g.strokeStyle = line; g.lineWidth = 1;
  g.beginPath();
  for (let x = (ox % step) - step; x < UI.vw + step; x += step){
    const px = Math.round(x) + 0.5;
    g.moveTo(px, 0); g.lineTo(px, UI.vh);
  }
  for (let y = (oy % step) - step; y < UI.vh + step; y += step){
    const py = Math.round(y) + 0.5;
    g.moveTo(0, py); g.lineTo(UI.vw, py);
  }
  g.stroke();
}

/* the world edge — drawn as a glowing boundary you can SEE, so the wrap
   is legible: cross it and you come out the far side. Not a wall. */
function drawBounds(g){
  const tl = toScreen(0, 0), br = toScreen(E.WORLD, E.WORLD);
  g.save();
  g.strokeStyle = 'rgba(255,197,66,.28)';
  g.lineWidth = 3;
  g.setLineDash([10, 8]);
  g.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  g.restore();
}

function drawPellets(g, f, now){
  const st = M.st;
  const pulse = noMotion() ? 1 : (0.86 + 0.14 * Math.sin(now / 260));
  const list = st.live.concat(st.drops);
  const R2 = UI.ppu * 0.7;
  for (let i = 0; i < list.length; i++){
    const p = E.pellet(st, list[i]);
    const s = toScreen(p.x, p.y);
    if (s.x < -20 || s.x > UI.vw + 20 || s.y < -20 || s.y > UI.vh + 20) continue;
    const drop = list[i] >= E.DROP_BASE;
    const r = R2 * (drop ? 0.62 : 0.5) * pulse;
    if (!noMotion()){
      g.beginPath(); g.arc(s.x, s.y, r * 2.4, 0, 6.2832);
      g.fillStyle = drop ? 'rgba(120,232,224,.10)' : 'rgba(255,197,66,.12)';
      g.fill();
    }
    g.beginPath(); g.arc(s.x, s.y, r, 0, 6.2832);
    g.fillStyle = drop ? '#7BE8E0' : '#FFC542';
    g.fill();
    g.beginPath(); g.arc(s.x - r * 0.3, s.y - r * 0.3, r * 0.4, 0, 6.2832);
    g.fillStyle = 'rgba(255,255,255,.7)';
    g.fill();
  }
}

/* interpolate a snake's head-side sample: between path[i+1] (older) and
   path[i] (newer) by f. Returns fu, with the visual offset folded in. */
function lerpSample(sn, i, f){
  const p = sn.path;
  const a = p[Math.min(i + 1, p.length - 1)], b = p[Math.min(i, p.length - 1)];
  return {
    x: a.x + E.wrapDelta(b.x - a.x) * f + (sn.vx || 0),
    y: a.y + E.wrapDelta(b.y - a.y) * f + (sn.vy || 0)
  };
}

function drawSnake(g, sn, f, now){
  const p = sn.path;
  if (!p || p.length < 2) return;
  const kit = KIT.skin(sn.seat);
  const mine = (sn.seat === M.me);

  let alpha = 1;
  if (!sn.alive){
    const gone = (M.tick - (sn.dieAt == null ? M.tick : sn.dieAt)) * M.st.step;
    alpha = Math.max(0, 1 - gone / 700);
    if (alpha <= 0) return;
  }

  const rFu = E.bodyR(sn.bodyTicks);
  const wpx = Math.max(3, (rFu / E.ONE) * UI.ppu * 2);      /* body diameter */

  /* build the on-screen polyline of body centres, head-first */
  const pts = [];
  const n = Math.min(p.length - 1, Math.max(2, sn.bodyTicks));
  for (let i = 0; i <= n; i++){
    const w = lerpSample(sn, i, f);
    const s = toScreen(w.x, w.y);
    pts.push(s);
  }
  /* cull if wholly off-screen */
  let vis = false;
  for (let i = 0; i < pts.length; i++){
    if (pts[i].x > -40 && pts[i].x < UI.vw + 40 && pts[i].y > -40 && pts[i].y < UI.vh + 40){ vis = true; break; }
  }
  if (!vis) return;

  g.save();
  g.globalAlpha = alpha;

  /* the body as one fat rounded stroke, plus a lighter core stroke for a
     glossy tube. A trail glow underneath if motion is allowed. */
  if (!noMotion() && sn.alive){
    g.globalAlpha = alpha * 0.5;
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = kit.trail || kit.a;
    g.lineWidth = wpx + 6;
    strokePoly(g, pts);
    g.globalAlpha = alpha;
  }
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = kit.b;
  g.lineWidth = wpx;
  strokePoly(g, pts);
  g.strokeStyle = kit.a;
  g.lineWidth = Math.max(1, wpx * 0.56);
  strokePoly(g, pts);

  /* the head: a bright cap, an eye pair pointing along the heading, and a
     ring if it is you */
  const head = pts[0];
  const hr = wpx * 0.62;
  g.beginPath(); g.arc(head.x, head.y, hr, 0, 6.2832);
  g.fillStyle = kit.head; g.fill();

  /* heading in screen space, from the first two samples */
  let hx = 1, hy = 0;
  if (pts.length > 1){
    const dx = head.x - pts[1].x, dy = head.y - pts[1].y;
    const m = Math.hypot(dx, dy) || 1;
    hx = dx / m; hy = dy / m;
  }
  const er = Math.max(1.4, hr * 0.34);
  g.fillStyle = '#0B1018';
  for (let k = -1; k <= 1; k += 2){
    g.beginPath();
    g.arc(head.x + hx * hr * 0.34 - hy * hr * 0.42 * k,
          head.y + hy * hr * 0.34 + hx * hr * 0.42 * k, er, 0, 6.2832);
    g.fill();
  }
  if (mine && sn.alive){
    g.strokeStyle = 'rgba(255,255,255,.9)';
    g.lineWidth = Math.max(1.4, hr * 0.22);
    g.beginPath(); g.arc(head.x, head.y, hr + 3, 0, 6.2832); g.stroke();
  }
  /* a boosting snake glows */
  if (sn.boost && sn.alive && !noMotion()){
    g.globalAlpha = alpha * (0.4 + 0.25 * Math.sin(now / 90));
    g.strokeStyle = '#FFE7B0';
    g.lineWidth = wpx * 0.3;
    strokePoly(g, pts.slice(0, Math.min(pts.length, 6)));
  }
  g.restore();
}

function strokePoly(g, pts){
  if (pts.length < 2) return;
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.stroke();
}

/* the minimap — the whole world at a glance, with a dot per snake and a
   frame showing the camera window. No DOM, drawn on its own small canvas
   once per frame (cheap: a handful of arcs). */
function drawMini(){
  if (!UI.mg2 || !UI.miniSide) return;
  const g = UI.mg2, side = UI.miniSide, st = M.st;
  g.clearRect(0, 0, side, side);
  /* an opaque inset so the dots read against whatever is behind the panel */
  g.fillStyle = 'rgba(6,11,20,.9)';
  g.fillRect(0, 0, side, side);
  const sc = side / E.WORLD;
  /* a faint dot for each pellet, so the map shows where the food is */
  g.fillStyle = 'rgba(255,197,66,.5)';
  for (let i = 0; i < st.live.length; i++){
    const p = E.pellet(st, st.live[i]);
    g.fillRect(p.x * sc - 0.5, p.y * sc - 0.5, 1, 1);
  }
  /* the camera window frame, under the dots */
  const w = (UI.vw / UI.ppu) * E.ONE * sc, h = (UI.vh / UI.ppu) * E.ONE * sc;
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1;
  g.strokeRect(M.cam.x * sc - w / 2, M.cam.y * sc - h / 2, w, h);
  /* a bright dot per living snake; yours is white with its seat ring */
  for (let s = 0; s < st.snakes.length; s++){
    const sn = st.snakes[s];
    if (!sn.alive) continue;
    const c = COLS[sn.seat % COLS.length];
    g.beginPath();
    g.arc(sn.hx * sc, sn.hy * sc, sn.seat === M.me ? 3.2 : 2.4, 0, 6.2832);
    g.fillStyle = sn.seat === M.me ? '#fff' : c.a;
    g.fill();
    if (sn.seat === M.me){
      g.beginPath(); g.arc(sn.hx * sc, sn.hy * sc, 3.6, 0, 6.2832);
      g.strokeStyle = c.a; g.lineWidth = 1.6; g.stroke();
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   THE FLOURISHES — eat pop, death burst, round-win ring. On the same
   canvas, no DOM, no per-frame layout. Coordinates are in FU (world
   space), turned to screen at paint time so a camera move never strands
   an effect. Reduced motion adds none of them and the game is identical.
   ═══════════════════════════════════════════════════════════════════ */
const FX = [];
const FX_CAP = 140;
function fxPush(o){ if (noMotion()) return; if (FX.length >= FX_CAP) FX.shift(); o.t0 = nowMs(); FX.push(o); }

function fxEat(wx, wy, tint){
  if (noMotion()) return;
  const sparks = [];
  const N = 7;
  for (let i = 0; i < N; i++){
    const a = (i / N) * 6.2832 + Math.random() * 0.7;
    const sp = (1.2 + Math.random() * 1.4) * E.ONE;
    sparks.push({ x:wx, y:wy, vx:Math.cos(a) * sp, vy:Math.sin(a) * sp });
  }
  fxPush({ k:'eat', x:wx, y:wy, life:360, sparks, tint: tint || '#FFC542' });
}
function fxDeath(sn){
  if (noMotion() || !sn.path || !sn.path.length) return;
  const col = COLS[sn.seat % COLS.length];
  const bits = [];
  const step = Math.max(1, Math.floor(sn.path.length / 16));
  for (let i = 0; i < sn.path.length; i += step){
    const c = sn.path[i];
    const a = Math.random() * 6.2832, sp = (0.9 + Math.random() * 2.0) * E.ONE;
    bits.push({ x:c.x, y:c.y, vx:Math.cos(a) * sp, vy:Math.sin(a) * sp,
                r:(0.5 + Math.random() * 0.5) });
  }
  fxPush({ k:'death', life:560, bits, a:col.a, b:col.b });
}
/* a death burst centred on WHERE THE SNAKE FELL — with lives the head has
   usually already respawned elsewhere, so we scatter around (fx,fy) rather
   than the (now-moved) body path. */
function fxDeathAt(sn, fx, fy){
  if (noMotion()) return;
  if (fx == null || fy == null){ fxDeath(sn); return; }
  const col = COLS[sn.seat % COLS.length];
  const bits = [];
  const N = 16;
  for (let i = 0; i < N; i++){
    const a = Math.random() * 6.2832, sp = (0.9 + Math.random() * 2.4) * E.ONE;
    const jx = (Math.random() - 0.5) * 2 * E.ONE, jy = (Math.random() - 0.5) * 2 * E.ONE;
    bits.push({ x:fx + jx, y:fy + jy, vx:Math.cos(a) * sp, vy:Math.sin(a) * sp,
                r:(0.5 + Math.random() * 0.6) });
  }
  fxPush({ k:'death', life:560, bits, a:col.a, b:col.b });
}
function fxWin(sn){
  if (noMotion() || !sn.path || !sn.path.length) return;
  fxPush({ k:'win', x:sn.hx, y:sn.hy, life:900 });
}
function fxDraw(g, now){
  if (!FX.length) return;
  for (let i = FX.length - 1; i >= 0; i--){
    const e = FX[i];
    const age = now - e.t0;
    const p = age / e.life;
    if (p >= 1){ FX.splice(i, 1); continue; }
    const s = age / 1000;
    if (e.k === 'eat'){
      const c = toScreen(e.x, e.y);
      const rr = UI.ppu * (0.4 + p * 1.4);
      g.globalAlpha = (1 - p) * 0.7;
      g.strokeStyle = e.tint; g.lineWidth = Math.max(1, UI.ppu * 0.18 * (1 - p));
      g.beginPath(); g.arc(c.x, c.y, rr, 0, 6.2832); g.stroke();
      g.fillStyle = e.tint; g.globalAlpha = (1 - p);
      for (let k = 0; k < e.sparks.length; k++){
        const sp = e.sparks[k];
        const pt = toScreen(sp.x + sp.vx * s * 6, sp.y + sp.vy * s * 6);
        g.beginPath(); g.arc(pt.x, pt.y, Math.max(0.6, UI.ppu * 0.18 * (1 - p)), 0, 6.2832); g.fill();
      }
    } else if (e.k === 'death'){
      g.globalAlpha = (1 - p);
      for (let k = 0; k < e.bits.length; k++){
        const bt = e.bits[k];
        const pt = toScreen(bt.x + bt.vx * s * 5, bt.y + bt.vy * s * 5);
        g.fillStyle = (k & 1) ? e.a : e.b;
        const rr = UI.ppu * bt.r * (1 - p * 0.5);
        g.beginPath(); g.arc(pt.x, pt.y, rr, 0, 6.2832); g.fill();
      }
    } else if (e.k === 'win'){
      const c = toScreen(e.x, e.y);
      for (let ring = 0; ring < 3; ring++){
        const rp = Math.max(0, p - ring * 0.16);
        if (rp <= 0 || rp >= 1) continue;
        g.globalAlpha = (1 - rp) * 0.5;
        g.strokeStyle = '#FFC542'; g.lineWidth = Math.max(1, UI.ppu * 0.24 * (1 - rp));
        g.beginPath(); g.arc(c.x, c.y, UI.ppu * (0.6 + rp * 5), 0, 6.2832); g.stroke();
      }
    }
  }
  g.globalAlpha = 1;
}

/* ═══════════════════════════════════════════════════════════════════
   THE KIT, READ AT PAINT TIME
   ═══════════════════════════════════════════════════════════════════ */
const SKINS = {
  'serp.skin.klassiku': null,
  'serp.skin.bahar':  { a:'#3FB8E8', b:'#1B6E96', head:'#BFF0FF' },
  'serp.skin.lampuk': { a:'#FFD24D', b:'#C97A12', head:'#FFF3C7' },
  'serp.skin.luzzu':  { a:'#F04B3C', b:'#1B4FA0', head:'#FFE9B0' },
  'serp.skin.franka': { a:'#E4CFA3', b:'#A88C5C', head:'#FFF6E2' },
  'serp.skin.lejl':   { a:'#5C4FA8', b:'#2A2350', head:'#CFC4FF' },
  'serp.skin.festa':  { a:'#FF6FD8', b:'#8A1F73', head:'#FFE1F6' }
};
const TRAILS = {
  'serp.trail.ghabra': 'rgba(255,255,255,.55)',
  'serp.trail.nar':    'rgba(255,140,60,.7)',
  'serp.trail.bahar':  'rgba(90,220,255,.6)'
};
const FLOORS = {
  'serp.floor.kazin':  { a:'#123527', b:'#060F0C', line:'rgba(255,255,255,.05)' },
  'serp.floor.franka': { a:'#3A3222', b:'#14110B', line:'rgba(255,222,160,.06)' },
  'serp.floor.qiegh':  { a:'#0E2E44', b:'#04121C', line:'rgba(150,220,255,.06)' }
};
const KIT = {
  _v: 0, _skin: null, _trail: null, _floor: null,
  bust(){ this._v++; this._skin = null; this._trail = null; this._floor = null; },
  skin(seat){
    if (this._skin === null){
      let s = null, t = null;
      try {
        const XP = window.KARTI_XP;
        if (XP){ s = SKINS[XP.equipped('skin', 'serp') || ''] || null;
                 t = TRAILS[XP.equipped('trail', 'serp') || ''] || null; }
      } catch(e){}
      this._skin = s || 0; this._trail = t || 0;
    }
    const c = COLS[seat % COLS.length];
    const mine = M && seat === M.me;
    const base = (mine && this._skin) ? this._skin : { a:c.a, b:c.b, head:c.a };
    return { a:base.a, b:base.b, head:base.head,
             trail: (mine && this._trail) ? this._trail : 0 };
  },
  floor(){
    if (this._floor === null){
      let f = null;
      try {
        const XP = window.KARTI_XP;
        if (XP) f = FLOORS[XP.equipped('floor', 'serp') || ''] || null;
      } catch(e){}
      this._floor = f || FLOORS['serp.floor.qiegh'];
    }
    return this._floor;
  }
};

/* ═══════════════════════════════════════════════════════════════════
   THE SCREEN
   ═══════════════════════════════════════════════════════════════════ */
function board(){
  const ctx = M.ctx;
  ctx.host.classList.add('sp-host');
  ctx.host.innerHTML =
    '<div class="sp-hud" id="sp-hud"></div>' +
    '<div class="sp-arena" id="sp-arena">' +
      '<canvas class="sp-cv" id="sp-cv"></canvas>' +
      '<canvas class="sp-mini" id="sp-mini" aria-hidden="true"></canvas>' +
      '<button class="sp-boost" id="sp-boost" aria-label="' + esc(T('Boost', 'Aċċellera')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>' +
      '</button>' +
      '<div class="sp-over"><span class="sp-cd" id="sp-cd"></span></div>' +
      '<div class="sp-rules" id="sp-rulespanel" aria-hidden="true">' +
        '<div class="sp-rules-h"><h4 id="sp-rules-t"></h4>' +
          '<button class="sp-rules-x" id="sp-rules-x" aria-label="' +
            esc(T('Put the rules away', 'Warrab ir-regoli')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<div class="sp-rules-b" id="sp-rules-b"></div>' +
      '</div>' +
    '</div>' +
    '<div class="sp-hint" id="sp-hint">' +
      esc(T('Drag anywhere to steer · hold boost to sprint', 'Iġbed biex tmexxi · żomm biex tħaffef')) +
    '</div>';

  const arena = ctx.host.querySelector('#sp-arena');
  const cv = ctx.host.querySelector('#sp-cv');
  const mini = ctx.host.querySelector('#sp-mini');
  UI = {
    ctx, arena, cv, mini,
    g2: cv.getContext('2d', { alpha:false }),
    mg2: mini ? mini.getContext('2d') : null,
    host: ctx.host,
    hud: ctx.host.querySelector('#sp-hud'),
    boostBtn: ctx.host.querySelector('#sp-boost'),
    cd:  ctx.host.querySelector('#sp-cd'),
    rules: ctx.host.querySelector('#sp-rulespanel'),
    vw:0, vh:0, ppu:12, ppuBase:12, zoom:null, dpr:1, lastAt:0,
    stick: null
  };
  M.cv = cv; M.g2 = UI.g2;

  wireControls();
  UI.rules.querySelector('#sp-rules-x').addEventListener('click', () => setRules(false));
  ctx.root.addEventListener('pointerdown', e => {
    if (!rulesOpen || !UI || !UI.rules) return;
    const rb = ctx.btn && ctx.btn('sp-rules');
    if (!UI.rules.contains(e.target) && !(rb && rb.contains(e.target))) setRules(false);
  }, true);

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
  hud();
  return UI;
}

/* ═══════════════════════════════════════════════════════════════════
   THE THUMB — a floating drag stick.
   Press anywhere on the arena; the head steers toward the direction from
   where the finger LANDED to where it is NOW. The engine's turn-rate cap
   arcs the snake to that heading rather than snapping. Nothing here waits
   for the network: aimAt() sets M.aim and doTick() broadcasts it.
   ═══════════════════════════════════════════════════════════════════ */
function aimAt(dx, dy){
  if (!M || M.dead || M.finished) return;
  if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;   /* too small to mean */
  M.aim = E.angOf(Math.round(dx), Math.round(dy));
}

function wireControls(){
  const cv = UI.cv;
  let id = null, ox = 0, oy = 0;

  cv.addEventListener('pointerdown', e => {
    if (rulesOpen) return;
    if (e.target && e.target.closest && e.target.closest('#sp-boost')) return;
    id = e.pointerId; ox = e.clientX; oy = e.clientY;
    try { cv.setPointerCapture(id); } catch(_){}
    e.preventDefault();
  });
  cv.addEventListener('pointermove', e => {
    if (id == null || e.pointerId !== id) return;
    aimAt(e.clientX - ox, e.clientY - oy);
    /* the stick re-centres under a slow drag so long holds keep working */
    const mx = e.clientX - ox, my = e.clientY - oy;
    const m = Math.hypot(mx, my);
    if (m > 60){ ox = e.clientX - mx / m * 60; oy = e.clientY - my / m * 60; }
    e.preventDefault();
  });
  const end = e => { if (e.pointerId === id) id = null; };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  /* BOOST — hold to sprint. pointerdown for zero latency. */
  const bb = UI.boostBtn;
  const bOn = e => { e.preventDefault(); setBoost(1); };
  const bOff = e => { if (e) e.preventDefault(); setBoost(0); };
  bb.addEventListener('pointerdown', bOn);
  bb.addEventListener('pointerup', bOff);
  bb.addEventListener('pointercancel', bOff);
  bb.addEventListener('pointerleave', bOff);

  /* a keyboard for the desk and the harness: arrows/WASD pick a heading,
     space is boost */
  UI.keys = e => {
    if (!M || M.dead) return;
    const k = e.key;
    let a = null;
    if (k === 'ArrowUp' || k === 'w') a = E.angOf(0, -1);
    else if (k === 'ArrowDown' || k === 's') a = E.angOf(0, 1);
    else if (k === 'ArrowLeft' || k === 'a') a = E.angOf(-1, 0);
    else if (k === 'ArrowRight' || k === 'd') a = E.angOf(1, 0);
    if (a != null){ e.preventDefault(); if (M.st && M.st.snakes[M.me] && M.st.snakes[M.me].alive) M.aim = a; return; }
    if (k === ' ' || k === 'Shift'){ e.preventDefault(); setBoost(1); }
  };
  UI.keysUp = e => { if (e.key === ' ' || e.key === 'Shift') setBoost(0); };
  window.addEventListener('keydown', UI.keys);
  window.addEventListener('keyup', UI.keysUp);
}

function setBoost(on){
  if (!M || M.dead || M.finished) return;
  const sn = M.st.snakes[M.me];
  if (!sn || !sn.alive){ M.boost = 0; return; }
  M.boost = on ? 1 : 0;
  if (UI && UI.boostBtn) UI.boostBtn.classList.toggle('on', !!on);
}

/* a row of life pips — filled hearts for lives left, hollow for spent. Kept
   tiny and text-free so it reads on a 390px HUD and a compact chip. */
function pips(lives, total){
  const full = Math.max(0, lives | 0), all = Math.max(full, total | 0);
  let s = '';
  for (let i = 0; i < all; i++)
    s += '<span class="sp-pip' + (i < full ? '' : ' sp-pip-x') + '"></span>';
  return '<span class="sp-pips" aria-label="' + full + ' of ' + all + ' lives">' + s + '</span>';
}

/* ── the HUD. Repainted on a score/life/rank change, NEVER per frame. ── */
function hud(){
  if (!UI || !UI.hud) return;
  const st = M.st;
  const tbl = E.standings(st);
  let myRank = tbl.findIndex(r => r.seat === M.me) + 1;
  if (myRank < 1) myRank = st.n;
  const me = st.snakes[M.me];
  const myLen = me ? me.bodyTicks : 0;
  const myLives = me ? (me.lives | 0) : 0;
  const total = st.lives | 0;

  const chips = st.snakes.slice()
    .sort((a, b) => (a.out === b.out ? b.bodyTicks - a.bodyTicks : (a.out ? 1 : -1)))
    .map(sn => {
      const c = COLS[sn.seat % COLS.length];
      const m = M.meta[sn.seat] || {};
      return '<span class="sp-chip' + (sn.seat === M.me ? ' me' : '') +
               (sn.out ? ' out' : '') + '">' +
        '<span class="d" style="background:' + c.a + '"></span>' +
        esc(m.name || ('#' + (sn.seat + 1))) +
        (sn.out ? '' : ' ' + pips(sn.lives, total)) +
        ' <b>' + sn.bodyTicks + '</b></span>';
    }).join('');

  UI.hud.innerHTML =
    '<span class="sp-rank sp-rank-life"><b>' + myLives + '</b>' + pips(myLives, total) +
      '<i>' + esc(T('lives', 'ħajjiet')) + '</i></span>' +
    '<span class="sp-rank"><b>#' + myRank + '</b><i>' +
      esc(T('of', 'minn')) + ' ' + st.n + '</i></span>' +
    '<span class="sp-rank"><b>' + myLen + '</b><i>' + esc(T('length', 'tul')) + '</i></span>' +
    '<span class="sp-chips">' + chips + '</span>';
}

function paintCountdown(beat){
  if (!UI || !UI.cd) return;
  if (beat <= 0){ UI.cd.textContent = ''; UI.cd.className = 'sp-cd'; return; }
  if (beat >= 4){ UI.cd.textContent = ''; return; }
  UI.cd.className = 'sp-cd' + (beat === 1 ? ' go' : '');
  UI.cd.textContent = beat === 1 ? T('GO', 'MUR') : String(beat - 1);
}

/* ── somebody's snake stopped ──────────────────────────────────────
   With LIVES, a death is usually a RESPAWN, not the end: the engine has
   already spent a life and (if any remained) put the snake back small at a
   clear spot. So the message depends on whether the snake is OUT. (fellX,
   fellY) is where the head fell, since a respawned head is already elsewhere. */
function onDeath(seat, why, fellX, fellY){
  const sn = M.st.snakes[seat];
  if (sn) fxDeathAt(sn, fellX, fellY);
  const out = !!(sn && sn.out);
  const lives = sn ? (sn.lives | 0) : 0;
  if (seat === M.me){
    setBoost(0);
    cue('duel.destroy', { gain: out ? 0.8 : 0.55 }, out);
    if (M.ctx) P.ui.setTurn(M.ctx, out ? {
      cls:'bad',
      who: T('You are out', 'Int barra'),
      note: deathWords(why)
    } : {
      cls:'',
      who: livesWord(lives),
      note: T('Back in — you are small again.', 'Reġajt dħalt — żgħir mill-ġdid.')
    });
  } else {
    cue('piece.capture', { gain:0.4 });
  }
  hud();
}
function livesWord(n){
  if (n === 1) return T('One life left', 'Ħajja waħda');
  return T(n + ' lives left', n + ' ħajjiet');
}
function deathWords(why){
  const C = E.CAUSE;
  if (why === C.SELF)   return T('Into your own body.', 'F’ġismek stess.');
  if (why === C.GONE)   return T('The phone left.', 'It-telefon telaq.');
  if (why === C.HEADON) return T('Head to head.', 'Ras ma’ ras.');
  if (why === C.TIME)   return T('Time. The longest snake wins.', 'Ħin. L-itwal serp jirbaħ.');
  return T('Into another snake.', 'F’serp ieħor.');
}

/* ═══════════════════════════════════════════════════════════════════
   THE RULES CARD — one game, told once, in both languages
   ═══════════════════════════════════════════════════════════════════ */
function rulesFor(){
  return [
    T('You are <b>always gliding forward</b>. <b>Drag anywhere</b> on the arena and your head ' +
      'arcs toward your thumb — steer, do not tap.',
      'Int <b>dejjem miexi ’l quddiem</b>. <b>Iġbed</b> fuq l-arena u rasek iddur lejn subgħajk — ' +
      'mexxi, tagħfasx.'),
    T('The <b>map is huge</b> and it does <b>not</b> kill you. Glide off one edge and you come ' +
      'out the opposite side. The minimap top-right shows where everyone is.',
      'Il-<b>mappa hi kbira</b> u <b>ma</b> toqtlokx. Oħroġ minn tarf u terġa’ tidħol min-naħa ' +
      'l-oħra. Il-minimap fuq il-lemin turik fejn qiegħed kulħadd.'),
    T('Eat the <b>glowing pellets</b> to get longer. A snake that dies scatters its length as ' +
      'food — eat the remains.',
      'Kul <b>il-blalen jixegħlu</b> biex titwal. Serp li jmut ixerred it-tul tiegħu bħala ' +
      'ikel — kul dak li jibqa’.'),
    T('You <b>only die</b> by driving your head into <b>another snake’s body</b> — or your own. ' +
      'The wall never kills you.',
      '<b>Tmut biss</b> jekk iddaħħal rasek f’<b>ġisem ta’ serp ieħor</b> — jew tiegħek. ' +
      'Il-ħajt qatt ma joqtlok.'),
    T('<b>Hold BOOST</b> to sprint. It burns a little length and drops it behind you — spend it ' +
      'to cut somebody off or to escape.',
      '<b>Żomm BOOST</b> biex tħaffef. Jaħraq ftit tul u jħallih warajk — użah biex taqta’ ' +
      't-triq lil xi ħadd jew biex taħrab.'),
    T('<b>Last snake moving wins.</b> If the round runs out of time, the <b>longest</b> snake ' +
      'takes it.',
      '<b>L-aħħar serp miexi jirbaħ.</b> Jekk jispiċċa l-ħin, l-<b>itwal</b> serp jieħdu.')
  ];
}

function clampRules(){
  if (!UI || !UI.rules || !UI.arena) return;
  try {
    UI.rules.style.maxHeight = Math.max(120, Math.floor(UI.arena.clientHeight * 0.86)) + 'px';
  } catch(e){}
}
function paintRules(){
  if (!UI || !UI.rules) return;
  clampRules();
  UI.rules.querySelector('#sp-rules-t').textContent = 'SERP — ' + T('the rules', 'ir-regoli');
  UI.rules.querySelector('#sp-rules-b').innerHTML =
    '<ul>' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul>';
  UI.rules.classList.toggle('open', rulesOpen);
  UI.rules.setAttribute('aria-hidden', rulesOpen ? 'false' : 'true');
  const rb = M && M.ctx && M.ctx.btn && M.ctx.btn('sp-rules');
  if (rb) rb.setAttribute('aria-expanded', rulesOpen ? 'true' : 'false');
}
function setRules(open){
  rulesOpen = !!open;
  try { localStorage.setItem(UIKEY + '.rules', rulesOpen ? '1' : '0'); } catch(e){}
  paintRules();
}
window.addEventListener('resize', () => { if (UI && rulesOpen) clampRules(); });

/* ═══════════════════════════════════════════════════════════════════
   THE END OF A ROUND
   ═══════════════════════════════════════════════════════════════════ */
function finish(){
  if (!M || M.finished) return;
  M.finished = true;
  const st = M.st;
  const tbl = E.standings(st);
  const won = tbl.length && tbl[0].seat === M.me;
  const solo = !M.net;

  if (solo){
    const mine = tbl.find(r => r.seat === M.me);
    if (mine && mine.len > ST.best){ ST.best = mine.len; }
    ST.rec[won ? 'w' : 'l']++;
    persist();
    try {
      if (P.record) P.record('serp', won ? 'w' : 'l');
      else if (window.KARTI_XP && KARTI_XP.finish)
        KARTI_XP.finish({ game:'serp', result: won ? 'w' : 'l',
                          ms: Math.max(1, M.tick * st.step) });
    } catch(e){}
  }

  if (tbl.length){
    const champ = M.st.snakes[tbl[0].seat];
    if (champ) fxWin(champ);
  }

  cue(won ? 'game.win' : 'game.lose', { gain:0.9 }, true);
  setTimeout(() => { if (M && !M.dead) showResult(tbl, won); }, 640);
}

const REB_BORDER = ['jade', 'ruby', 'ice', 'gold', 'neon', 'fire', 'ice', 'silver'];

function showResult(tbl, won){
  if (!M || !M.ctx) return;
  const solo = !M.net;
  const again = () => { if (M.net) rematchAsk(); else newGame(M.opts); };
  const back  = () => { const nx = M.net; leave();
                        if (nx && nx.onLeave) nx.onLeave(); else menu(); };

  const R2 = window.KARTI_REBBIEH;
  if (R2 && R2.show){
    R2.show({
      lang: (window.KARTI_LANG ? KARTI_LANG.lang() : 'en'),
      reduced: noMotion(),
      title: won ? T('Last snake standing', 'L-aħħar serp wieqaf')
                 : T('Out', 'Barra'),
      subtitle: T('Last snake with a life takes the round', 'L-aħħar serp b’ħajja jieħu r-round'),
      rows: tbl.map((r, i) => {
        const m = M.meta[r.seat] || {};
        return {
          name: m.name || ('#' + (r.seat + 1)),
          place: i + 1,
          you: r.seat === M.me,
          bot: (m.own === 'ai'),
          /* the score column shows LIVES-LEFT · length so the ranking reads */
          score: (r.out ? '✗' : (r.lives | 0) + '♥') + ' · ' + r.len,
          border: REB_BORDER[r.seat % REB_BORDER.length]
        };
      }),
      sound: id => cue(id, { gain:0.6 }),
      playAgainLabel: M.net ? T('Back to the room', 'Lura għall-kamra') : T('Play again', 'Erġa’ lgħab'),
      onPlayAgain: again,
      onLeave: back
    });
    return;
  }

  const rows = tbl.map((r, i) => {
    const c = COLS[r.seat % COLS.length];
    const m = M.meta[r.seat] || {};
    return '<div class="sp-row' + (i === 0 ? ' win' : '') + (r.out ? ' out' : '') + '">' +
      '<span class="p">' + (i + 1) + '</span>' +
      '<span class="d" style="background:' + c.a + '"></span>' +
      '<span class="n">' + esc(m.name || ('#' + (r.seat + 1))) + '</span>' +
      '<span class="s">' + (r.out ? esc(T('out', 'barra'))
                                  : (r.lives | 0) + '♥') + ' · ' + r.len + '</span></div>';
  }).join('');

  P.ui.result(M.ctx, {
    tone: won ? 'win' : 'lose',
    head: won ? T('Last snake standing', 'L-aħħar serp wieqaf')
              : T('Out', 'Barra'),
    why: '<div class="sp-tally">' + rows + '</div>',
    quip: won ? T('The whole arena, and nobody left to hit.', 'L-arena kollha, u ħadd ma fadal x’taħbat miegħu.')
              : T('Somebody was always going to be there.', 'Xi ħadd dejjem kien se jkun hemm.'),
    buttons: [
      { label: T('Again', 'Erġa'), icon:'refresh', cls:'primary', go: again },
      { label: T('Back', 'Lura'), icon:'back', cls:'ghost', go: back }
    ]
  });
  void solo;
}

function rematchAsk(){
  const nx = M.net;
  leave();
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
  M.me = 0;
  M.mine = [];
  M.meta = [];
  for (let s = 0; s < M.st.snakes.length; s++){
    const sn = M.st.snakes[s];
    sn.own = s === 0 ? 'me' : 'ai';
    sn.lvl = o.lvl || 2;
    M.mine.push(s);
    M.meta.push({ name: s === 0 ? T('You', 'Int') : levelWords(o.lvl || 2).n + ' ' + s,
                  own: sn.own });
  }
  openBoard(() => menu());
  startLoop();
}

function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: 'SERP',
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'sp-rules', label:T('Rules', 'Regoli'), icon:'book',    cls:'ghost' },
      { id:'sp-new',   label:T('New', 'Ġdida'),    icon:'refresh', cls:'ghost' }
    ]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();      /* the square-board sizer is not ours */
  M.ctx.badge.textContent = SPEEDWORDS[M.st.speed]().n + ' · ' + M.st.n +
    ' · ' + T(M.st.lives + ' lives', M.st.lives + ' ħajjiet');
  board();
  M.ctx.btn('sp-rules').onclick = () => setRules(!rulesOpen);
  paintRules();
  const nb = M.ctx.btn('sp-new');
  if (nb) nb.onclick = () => { if (M.net) rematchAsk(); else newGame(M.opts); };
  P.ui.setTurn(M.ctx, { cls:'', who: T('Get ready', 'Ħejji ruħek'),
                        note: T('Drag to steer. The wall will not kill you.', 'Iġbed biex tmexxi. Il-ħajt mhux se joqtlok.') });
}

function leave(){
  stopLoop();
  if (UI){
    if (UI.stopFit) { try { UI.stopFit(); } catch(e){} }
    if (UI.keys) { try { window.removeEventListener('keydown', UI.keys); } catch(e){} }
    if (UI.keysUp) { try { window.removeEventListener('keyup', UI.keysUp); } catch(e){} }
  }
  if (M){ M.dead = true; persistNow(); }
  M = null; UI = null;
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — say() is the ONE place a local event leaves this phone,
   called AFTER the event was applied here. Offline M.net is null and this
   is a no-op. The hooks.onMove shape is js/rummy-ui.js's, so mp.js carries
   it unchanged — including a host running the machine's snakes stamped as
   those chairs by mp.js's sendFor() path.
   ═══════════════════════════════════════════════════════════════════ */
function say(seat, mv){
  if (!M || !M.net) return;
  const w = E.encWire(mv);
  if (!w) return;
  fire(moveSubs, { seat, move: w, src:'local' });
}

function onlineRemote(seat, wire){
  if (!M || M.dead || !M.net) return null;
  const g = M.net.toGame ? M.net.toGame[seat] : seat;
  if (g === undefined || !M.st.snakes[g]) return null;
  if (M.mine.indexOf(g) >= 0) return null;
  const mv = E.decWire(wire);
  if (!mv) return null;
  const sn = M.st.snakes[g];

  if (mv.t === 'again') return null;

  noteArrival(g, mv.tick);
  const was = headOf(sn);

  if (mv.t === 'aim'){
    E.plan(M.st, sn, { t:mv.tick, k:'aim', a:mv.ang });
    smoothFrom(sn, was);
    return null;
  }
  if (mv.t === 'boost'){
    E.plan(M.st, sn, { t:mv.tick, k:'boost', b:mv.on ? 1 : 0 });
    smoothFrom(sn, was);
    return null;
  }
  if (mv.t === 'die'){
    /* where the head was before plan() (maybe) respawns it small elsewhere.
       scatterDrops is engine-internal now — plan()/stepOne spends the life,
       drips the food and respawns-or-eliminates. */
    const fellX = sn.hx, fellY = sn.hy;
    E.plan(M.st, sn, { t:mv.tick, k:'die', n:mv.why });
    resettle();
    smoothFrom(sn, was);
    onDeath(g, mv.why, fellX, fellY);
    return null;
  }
  if (mv.t === 'eat'){
    M.st.claims.push({ i:mv.idx, s:g, t:mv.tick });
    E.plan(M.st, sn, { t:mv.tick, k:'eat', n:mv.idx });
    const mineWas = M.st.snakes[M.me] ? M.st.snakes[M.me].score : 0;
    const wasScore = sn.score;
    resettle();
    smoothFrom(sn, was);
    if (sn.score > wasScore){
      const kit = KIT.skin(sn.seat);
      fxEat(sn.hx, sn.hy, kit.a);
    }
    const mineNow = M.st.snakes[M.me] ? M.st.snakes[M.me].score : 0;
    if (mineNow < mineWas){
      cue('ui.error', { gain:0.5 });
      try { K.toast(T('Beaten to that one.', 'Ġibhielek qabel.')); } catch(e){}
    }
    hud();
    return null;
  }
  return null;
}

function onlineNote(text, tone){ if (M && M.ctx) P.ui.setNet(M.ctx, text || '', tone || ''); }

function onlineStop(why, tone){
  if (!M || M.dead || !M.ctx) return;
  const ctx = M.ctx;
  stopLoop();
  M.finished = true;
  P.ui.setNet(ctx, '', '');
  P.ui.result(ctx, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? T('No game', 'L-ebda logħba') : T('Cut off', 'Maqtugħ'),
    why: why || T('The arena stopped.', 'L-arena waqfet.'),
    quip: T('Nothing was counted. Nobody loses a round over a dropped connection.',
            'Xejn ma ngħadd. Ħadd ma jitlef round minħabba konnessjoni li waqgħet.'),
    buttons: [{ label:T('Back to the rooms', 'Lura għall-kmamar'), icon:'back', cls:'primary',
                go: () => { const nx = M.net; leave();
                            if (nx && nx.onLeave) nx.onLeave(); else P.hub(); } }]
  });
}

function onlineStart(cfg){
  cfg = cfg || {};
  const chairs = (cfg.seats || []).filter(Boolean);
  const n = chairs.length;
  if (n < E.MIN_SEATS || n > E.MAX_SEATS)
    throw new Error('SERP: seats 2 to 8, not ' + n);

  const toGame = {}, toRoom = [];
  chairs.forEach((s, g) => {
    const room = (typeof s.seat === 'number') ? s.seat : g;
    toGame[room] = g; toRoom[g] = room;
  });
  const meG = (toGame[cfg.you] !== undefined) ? toGame[cfg.you] : 0;
  const iAmHost = (cfg.you === (cfg.host | 0));

  /* THE MATCH TUPLE, off ONE start blob — all deterministic, all agreed:
       · SEATS  — the chair count mp.js is authoritative about (cfg.seats).
       · AI lvl — already travels PER SEAT (s.level), forwarded by mp.js today.
       · SPEED  — the room variant, forwarded as cfg.opts.mode today.
       · LIVES  — the one multi-number opt mp.js does not forward yet. It rides
                  cfg.opts.lives IF the relay's opaque `rules` blob is wired
                  into onBegan's start-opts (a one-line mp.js change, reported
                  in the hand-off — it must be merged with the misteru whisper
                  additions, not clobbered). Until then every client falls back
                  to the SAME LIVES_DEFAULT (3), so online stays in lockstep
                  regardless: nobody re-derives a different number. */
  const O = (cfg.opts && typeof cfg.opts === 'object') ? cfg.opts : {};
  const lvl = (O.lvl | 0) || (chairs.map(s => s && s.level).find(v => v)) || 2;
  const lives = (O.lives == null ? E.LIVES_DEFAULT
                 : Math.max(1, Math.min(E.LIVES_MAX, O.lives | 0))) || E.LIVES_DEFAULT;
  const speed = O.speed || O.mode || 'normal';

  leave();
  injectCSS();
  startMatch({ seats:n, lvl, speed, lives }, cfg.seed >>> 0, null);
  M.net = Object.assign({}, cfg.net, { host:iAmHost, toGame, toRoom });
  M.me = meG;
  M.mine = [meG];
  M.meta = chairs.map((s, g) => ({
    name: String(s.name || ('#' + (g + 1))).slice(0, 14),
    own:  g === meG ? 'me' : (s.kind === 'cpu' ? 'ai' : 'net')
  }));
  chairs.forEach((s, g) => {
    const sn = M.st.snakes[g];
    sn.own = g === meG ? 'me' : (s.kind === 'cpu' ? 'ai' : 'net');
    sn.lvl = s.level || lvl;
    if (sn.own === 'ai' && iAmHost) M.mine.push(g);
  });

  P.show();
  openBoard(() => { const nx = M.net; leave(); if (nx && nx.onLeave) nx.onLeave(); else P.hub(); });
  startLoop();
  return null;
}

const NET_HOOKS = {
  live:      () => !!(M && !M.dead && !E.over(M.st)),
  phase:     () => !M ? 'idle' : (E.over(M.st) ? 'over' : 'play'),
  seed:      () => (M ? M.seed : null),
  gameId:    () => (M ? 'serp' : null),
  turn:      () => -1,
  over:      () => (M ? E.over(M.st) : null),
  moveCount: () => (M ? M.tick : 0),
  check:     () => (M ? E.check(M.st) : ''),
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
    if (g === undefined || !M.st.snakes[g]) return;
    const sn = M.st.snakes[g];
    if (!sn.alive || sn.coast != null) return;
    sn.coast = M.st.top + coastTicks(M.st);
    const m = M.meta[g];
    try { K.toast((m && m.name ? m.name : T('A snake', 'Serp')) + ' — ' +
                  T('gone.', 'telaq.')); } catch(e){}
    hud();
  }
};

P.online = P.online || {};
P.online.serp = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  live: () => NET_HOOKS.live(),
  hooks: NET_HOOKS
};

/* ═══════════════════════════════════════════════════════════════════
   THE ENTRY SCREEN — MINIMAL, the shape ludu/kanun/bomba use.
   ═══════════════════════════════════════════════════════════════════ */
function goOnline(){
  try {
    if (P.lobbyFor){ P.lobbyFor('serp'); return; }
    if (P.openLobby){ P.openLobby('serp'); return; }
    if (window.KARTI_MP && KARTI_MP.GAMES && KARTI_MP.GAMES.some &&
        KARTI_MP.GAMES.some(g => (g && g.k) === 'serp')){
      if (KARTI_MP.openRoom){ KARTI_MP.openRoom('serp'); return; }
    }
  } catch(e){}
  try { K.toast(T('Online rooms for SERP are not open on the server yet — playing the machine.',
                  'Il-kmamar onlajn għal SERP għadhom mhux miftuħa fuq is-server — ' +
                  'nilagħbu mal-magna.')); } catch(e){}
  cue('ui.denied', { gain:0.6 });
  aiSetup();
}

/* the identity piece: a curved snake drawn with the arena's own tube
   renderer so the menu and the arena are unmistakably the same game.
   Decoration only — drawn ONCE, not animated. */
function heroCanvas(){
  const cv = document.createElement('canvas');
  const w = 230, h = 118, dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  /* a sine-ish path across the hero */
  const pts = [];
  for (let i = 0; i <= 40; i++){
    const x = 24 + (i / 40) * (w - 60);
    const y = h / 2 + Math.sin(i / 40 * 6.0) * 22;
    pts.push({ x, y });
  }
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = 'rgba(59,224,138,.4)'; g.lineWidth = 26;
  stroke(pts);
  g.strokeStyle = '#0E7A45'; g.lineWidth = 20; stroke(pts);
  g.strokeStyle = '#3BE08A'; g.lineWidth = 11; stroke(pts);
  const head = pts[pts.length - 1];
  g.fillStyle = '#BFF9DA';
  g.beginPath(); g.arc(head.x, head.y, 13, 0, 6.2832); g.fill();
  g.fillStyle = '#0B1018';
  g.beginPath(); g.arc(head.x + 4, head.y - 4, 2.2, 0, 6.2832); g.fill();
  g.beginPath(); g.arc(head.x + 4, head.y + 4, 2.2, 0, 6.2832); g.fill();
  /* a couple of pellets */
  g.fillStyle = '#FFC542';
  g.beginPath(); g.arc(w - 26, 30, 6, 0, 6.2832); g.fill();
  g.beginPath(); g.arc(40, h - 24, 5, 0, 6.2832); g.fill();
  function stroke(P2){ g.beginPath(); g.moveTo(P2[0].x, P2[0].y);
    for (let i = 1; i < P2.length; i++) g.lineTo(P2[i].x, P2[i].y); g.stroke(); }
  return cv;
}

function menu(){
  injectCSS();
  P.show();
  stopLoop(); M = null; UI = null;
  const el = P.ui.screenEl();
  const p = pref();
  const seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, p.seats || 6));

  el.innerHTML =
    '<div class="pt-wrap sp-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="sp-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>SERP</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="sp-hero" id="sp-hero" aria-hidden="true">' +
        '<span class="sp-hero-cap">' + E.WORLD_U + '&times;' + E.WORLD_U + '</span>' +
      '</div>' +
      '<p class="blurb">' +
        T('A big open arena, several snakes, and you are always gliding. Eat, get longer, and ' +
          'be the last one moving. The wall does not kill you — it wraps.',
          'Arena kbira u miftuħa, ħafna sriep, u int dejjem miexi. Kul, itwal, u kun l-aħħar ' +
          'wieħed miexi. Il-ħajt ma joqtlokx — iddur mill-ġenb l-ieħor.') +
      '</p>' +
      (ST.best ? '<p class="blurb" style="color:var(--gold,#FFC542)">' +
        esc(T('Your longest: ', 'L-itwal tiegħek: ') + ST.best) + '</p>' : '') +

      '<div class="sp-modes" style="display:grid;gap:9px;margin-top:6px">' +
        '<button class="btn primary" id="sp-online">' + ico('globe') + ' ' +
          esc(T('Play online', 'Ilgħab onlajn')) + '</button>' +
        '<button class="btn ghost" id="sp-ai">' + ico('dice') + ' ' +
          esc(T('Play with the machine', 'Ilgħab mal-magna')) + '</button>' +
        '<button class="btn ghost" id="sp-rulesbtn">' + ico('book') + ' ' +
          esc(T('How to play', 'Kif tilgħab')) + '</button>' +
      '</div>' +

      (ST.rec.w + ST.rec.l
        ? '<p class="pt-ledger" style="margin-top:14px">' +
          T('Rounds so far: <b>' + ST.rec.w + '</b> won, <b>' + ST.rec.l + '</b> lost.',
            'Rounds s’issa: <b>' + ST.rec.w + '</b> rebħin, <b>' + ST.rec.l + '</b> mitlufin.') +
          '</p>'
        : '') +
    '</div>' +

    '<div class="sp-rules" id="sp-menurules" aria-hidden="true">' +
      '<div class="sp-rules-h"><h4>SERP — ' + esc(T('the rules', 'ir-regoli')) + '</h4>' +
        '<button class="sp-rules-x" id="sp-menurules-x" aria-label="' +
          esc(T('Close', 'Agħlaq')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button></div>' +
      '<div class="sp-rules-b"><ul style="margin:0;padding:0">' +
        rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul></div>' +
    '</div>' +
    '</div>';

  const hero = el.querySelector('#sp-hero');
  if (hero) hero.insertBefore(heroCanvas(), hero.firstChild);

  el.querySelector('#sp-back').onclick = () => { cue('ui.back', { gain:0.7 }); P.hub(); };
  el.querySelector('#sp-online').onclick = () => { cue('ui.tap', { gain:0.7 }); goOnline(); };
  el.querySelector('#sp-ai').onclick = () => aiSetup();

  const rules = el.querySelector('#sp-menurules');
  const openRules = o => {
    rules.classList.toggle('open', o);
    rules.setAttribute('aria-hidden', o ? 'false' : 'true');
    cue(o ? 'ui.sheet' : 'ui.back', { gain:0.8 });
  };
  el.querySelector('#sp-rulesbtn').onclick = () => openRules(!rules.classList.contains('open'));
  el.querySelector('#sp-menurules-x').onclick = () => openRules(false);
}

/* ═══════════════════════════════════════════════════════════════════
   THE OPTIONS STEP — one small step after PLAY WITH THE MACHINE.
   ═══════════════════════════════════════════════════════════════════ */
function aiSetup(){
  injectCSS();
  P.show();
  const el = P.ui.screenEl();
  const p = pref();
  let seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, p.seats || 6));
  let lvl   = p.lvl || 2;
  let speed = E.speedOf(p.speed).id;
  let lives = Math.max(1, Math.min(E.LIVES_MAX, p.lives || E.LIVES_DEFAULT));

  function paint(){
    /* the arena grows with the snake count — show the size the chosen
       count will actually build, so the host sees the world scale */
    const wu = E.worldFor(seats);
    el.innerHTML =
      '<div class="pt-wrap sp-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="sp-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(T('Play the machine', 'Ilgħab mal-magna')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<div class="sp-hero" id="sp-hero" aria-hidden="true">' +
          '<span class="sp-hero-cap">' + wu + '&times;' + wu + '</span>' +
        '</div>' +

        '<div class="tiny pt-lbl">' + esc(T('How many snakes', 'Kemm-il serp')) + '</div>' +
        '<div class="sp-step">' +
          '<button class="sp-rnd" id="sp-s-dn"' + (seats <= E.MIN_SEATS ? ' disabled' : '') +
            ' aria-label="' + esc(T('Fewer snakes', 'Inqas sriep')) + '">&minus;</button>' +
          '<span class="v">' + seats + '<i>' + esc(T('snakes', 'sriep')) + '</i></span>' +
          '<button class="sp-rnd" id="sp-s-up"' + (seats >= E.MAX_SEATS ? ' disabled' : '') +
            ' aria-label="' + esc(T('More snakes', 'Aktar sriep')) + '">+</button>' +
        '</div>' +
        '<p class="blurb" style="margin:6px 2px 12px">' +
          esc(T('You, and the rest are the machine. More snakes → a bigger arena.',
                'Int, u l-bqija huma l-magna. Aktar sriep → arena akbar.')) +
        '</p>' +

        '<div class="tiny pt-lbl">' + esc(T('Lives each', 'Ħajjiet kull wieħed')) + '</div>' +
        '<div class="sp-step">' +
          '<button class="sp-rnd" id="sp-l-dn"' + (lives <= 1 ? ' disabled' : '') +
            ' aria-label="' + esc(T('Fewer lives', 'Inqas ħajjiet')) + '">&minus;</button>' +
          '<span class="v">' + lives + '<i>' + esc(T('lives', 'ħajjiet')) + '</i></span>' +
          '<button class="sp-rnd" id="sp-l-up"' + (lives >= E.LIVES_MAX ? ' disabled' : '') +
            ' aria-label="' + esc(T('More lives', 'Aktar ħajjiet')) + '">+</button>' +
        '</div>' +
        '<p class="blurb" style="margin:6px 2px 12px">' +
          esc(T('Die and you respawn small — until your lives run out. Last snake with a life wins.',
                'Tmut u terġa’ tibda żgħir — sakemm jispiċċaw il-ħajjiet. L-aħħar serp b’ħajja jirbaħ.')) +
        '</p>' +

        '<div class="tiny pt-lbl">' + esc(T('How fast', 'Kemm mgħaġġel')) + '</div>' +
        '<div class="pt-opts" id="sp-speed">' +
          E.SPEEDS.map(s => {
            const w = SPEEDWORDS[s.id]();
            return '<button class="pt-opt' + (speed === s.id ? ' on' : '') + '" data-sp="' + s.id + '">' +
              '<b>' + esc(w.n) + '</b><i>' + esc(w.i) + '</i></button>';
          }).join('') +
        '</div>' +

        '<div class="tiny pt-lbl">' + esc(T('How hard the machine is', 'Kemm hi iebsa l-magna')) + '</div>' +
        '<div class="pt-opts" id="sp-lvl">' +
          LEVELS.map(L => {
            const w = levelWords(L.level);
            return '<button class="pt-opt' + (lvl === L.level ? ' on' : '') + '" data-lvl="' + L.level + '">' +
              '<b>' + esc(w.n) + '</b><i>' + esc(w.i) + '</i></button>';
          }).join('') +
        '</div>' +

        '<div class="pt-acts" style="margin-top:18px;display:grid;gap:9px">' +
          '<button class="btn primary" id="sp-go">' +
            esc(T('Play — you vs ' + (seats - 1) + ' machine' + (seats - 1 === 1 ? '' : 's'),
                  'Ilgħab — int kontra ' + (seats - 1) + ' magn' + (seats - 1 === 1 ? 'a' : 'i'))) +
          '</button>' +
        '</div>' +
        '<div style="height:12px"></div>' +
      '</div></div>';

    const hero = el.querySelector('#sp-hero');
    if (hero) hero.insertBefore(heroCanvas(), hero.firstChild);

    el.querySelector('#sp-back').onclick = () => { cue('ui.back', { gain:0.7 }); menu(); };
    el.querySelector('#sp-go').onclick = () => {
      pref({ seats, lvl, speed, lives });
      newGame({ seats, lvl, speed, lives });
    };
    const dn = el.querySelector('#sp-s-dn'), up = el.querySelector('#sp-s-up');
    if (dn) dn.onclick = () => { if (seats > E.MIN_SEATS){ seats--; paint(); } };
    if (up) up.onclick = () => { if (seats < E.MAX_SEATS){ seats++; paint(); } };
    const ldn = el.querySelector('#sp-l-dn'), lup = el.querySelector('#sp-l-up');
    if (ldn) ldn.onclick = () => { if (lives > 1){ lives--; paint(); } };
    if (lup) lup.onclick = () => { if (lives < E.LIVES_MAX){ lives++; paint(); } };
    el.querySelector('#sp-speed').addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-sp]');
      if (!b) return; speed = b.getAttribute('data-sp'); paint();
    });
    el.querySelector('#sp-lvl').addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-lvl]');
      if (!b) return; lvl = +b.getAttribute('data-lvl'); paint();
    });
  }
  paint();
}

/* repaint on a language change, only what we own and only if on screen */
try {
  if (window.KARTI_LANG) KARTI_LANG.onChange(() => {
    try {
      const el = P.ui.screenEl();
      if (el && el.querySelector('#sp-go')) aiSetup();
      else if (el && el.querySelector('.sp-menu')) menu();
      else if (UI && rulesOpen) paintRules();
      if (UI) hud();
    } catch(e){}
  });
} catch(e){}

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — what js/mp.js reads before a snake exists.

   The online half above is written, wired and tested. It is NOT reachable
   yet, and the reason is one line on the relay that is not ours to change:

       server/karti_server.py
       TABLES = ("skarta","klabb","kiri","tombla","rummy","gin",
                 "gharraq","spy","suspett")

   v_game() refuses any room whose `game` is not in that tuple, and 'serp'
   is not in it — so the honest thing is to say so here rather than ship a
   door that opens onto a wall. Everything else the relay already does
   correctly: it FORWARDS, it does not referee, which is exactly what this
   design needs; its generic bact codec carries an aim, a boost, an eat and
   a death with bytes to spare (see WIRE_FIELDS in js/serp.js); and its
   FAN_RATE of 40 msgs/sec/room is ample, because SERP sends a message only
   when somebody STEERS, BOOSTS, EATS or DIES — a couple a second per
   player, well inside the budget.

     ── THE INTEGRATION (four lines, mirroring kanun/bomba/briks) ──
       1. server/karti_server.py  TABLES += ("serp",)
       2. server/karti_server.py  GAME_SEATS['serp'] = (2, 8)   # min..max
       3. js/mp.js  GAMES += { k:'serp', name:'Is-Serp', short:'SERP',
                               icon:'dice', blurb:'...' }
       4. js/mp.js  LOBBY_GLOBAL.serp = 'KARTI_SERP'
   ═══════════════════════════════════════════════════════════════════ */
const ONLINE_WHY = T(
  'Online SERP is written, wired and tested on this phone — real-time prediction, a jitter ' +
  'buffer and a refereeless pellet court, all over the big scrolling arena. It needs the KARTI ' +
  'server to know the word "serp" so it can open a room; four lines add it, alongside bomba and ' +
  'briks. Until then, SERP is you against the machine.',
  'SERP onlajn hu miktub, imqabbad u ttestjat fuq dan it-telefon — bi tbassir ħaj, jitter ' +
  'buffer u qorti tal-ballun bla referi, fuq l-arena kbira kollha. Irid biss li s-server ' +
  'tal-KARTI jkun jaf il-kelma "serp" biex jiftaħ kamra; erba’ linji jżiduha, ħdejn bomba u ' +
  'briks. Sa dakinhar, SERP hu int kontra l-magna.');

R.lobby = {
  id:'serp',
  name:'Serp',
  mt:'Is-Serp',
  minSeats: E.MIN_SEATS,
  maxSeats: E.MAX_SEATS,
  levels: LEVELS,
  defaultLevel: 2,
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu')
    ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    const n = (seatList || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why: T('You need at least two snakes in the arena.',
                                                   'Trid mill-inqas żewġ sriep fl-arena.') };
    if (n > E.MAX_SEATS) return { ok:false, why: T('Eight snakes is all one arena holds.',
                                                   'Tmien sriep huma daqs kemm iżżomm arena.') };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready) return { ok:false, why: unready + (unready > 1
        ? T(' players are not ready yet.', ' plejers għadhom mhux lesti.')
        : T(' player is not ready yet.', ' plejer għadu mhux lest.')) };
    return { ok:true, why:'' };
  },
  rulesHTML: () =>
    '<p>' + T('A big open arena, two to eight snakes, all gliding at once. Drag to steer — your ' +
      'head arcs toward your thumb. Eat the glowing pellets to get longer; hold boost to sprint.',
      'Arena kbira u miftuħa, minn żewġ sa tmien sriep, kollha jimxu f’daqqa. Iġbed biex tmexxi — ' +
      'rasek iddur lejn subgħajk. Kul il-blalen jixegħlu biex titwal; żomm biex tħaffef.') +
    '</p>' +
    '<p>' + T('The wall does NOT kill you — the map wraps. You only die by driving your head into ' +
      'another snake’s body, or your own. Last one moving wins; on time, the longest snake wins.',
      'Il-ħajt MA joqtlokx — il-mappa ddur. Tmut biss jekk iddaħħal rasek f’ġisem ta’ serp ieħor, ' +
      'jew tiegħek. L-aħħar wieħed miexi jirbaħ; fuq il-ħin, l-itwal serp jirbaħ.') + '</p>' +
    '<p>' + esc(ONLINE_WHY) + '</p>',
  blurb: T('Always gliding, always getting longer. Last snake moving takes it.',
           'Dejjem miexi, dejjem jitwal. L-aħħar serp li jibqa’ sejjer jieħu kollox.'),
  myName(){
    try {
      const n = K.displayName && K.displayName();
      if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
        return String(n).trim().slice(0, 14);
    } catch(e){}
    return T('You', 'Int');
  },
  start: (seatList, o) => newGame({
    seats: Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, (seatList || []).length || 5)),
    lvl: ((seatList || []).map(s => s && s.level).find(v => v)) || 2,
    speed: (o && o.mode) || pref().speed || 'normal'
  }),
  wire: { fields: E.WIRE_FIELDS },
  takeback: false
};

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF — one tile on the BOARD shelf.
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'serp', order:27, kind:'board', name:'SERP', mt:'Is-serp',
  sprite:'sp-t-serp', status:'live',
  get tag(){
    return T('A big open arena you glide across, several snakes at once, and a wall that wraps ' +
             'instead of killing you. Eat, get longer, be the last one moving.',
             'Arena kbira u miftuħa li timxi fiha, ħafna sriep f’daqqa, u ħajt li ddur minnu ' +
             'flok joqtlok. Kul, itwal, kun l-aħħar wieħed miexi.') +
           (ST.best ? ' ' + T('Your longest is ', 'L-itwal tiegħek hu ') + ST.best + '.' : '');
  },
  open: () => menu(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: LEVELS,
  rulesHTML: () => R.lobby.rulesHTML()
};
R.shelfTile = TILE;
R.open = () => menu();
R.close = () => { leave(); P.hub(); };
R.kitChanged = () => { KIT.bust(); if (UI) hud(); };
P.register(TILE);

if (document.body) injectDefs();
else document.addEventListener('DOMContentLoaded', injectDefs);

/* ── test hooks — inert unless the page is opened with ?pttest ──── */
try {
  if (String(location.search).indexOf('pttest') >= 0){
    window.__SP_TEST = {
      engine: E,
      M: () => M,
      st: () => (M ? M.st : null),
      UI: () => UI,
      menu, newGame, leave,
      /* start a match this test drives by hand: no rAF, no countdown */
      manual: (opts, seed) => {
        injectCSS(); P.show();
        startMatch(opts || { seats:4, speed:'normal', lvl:2 }, seed);
        M.me = 0; M.mine = []; M.meta = [];
        for (let s = 0; s < M.st.snakes.length; s++){
          M.st.snakes[s].own = s === 0 ? 'me' : 'ai';
          M.st.snakes[s].lvl = (opts && opts.lvl) || 2;
          M.mine.push(s);
          M.meta.push({ name:'#' + (s + 1) });
        }
        M.lead = 0;
        return M;
      },
      openBoard: onBack => openBoard(onBack || (() => menu())),
      board,
      solo: n => { for (let i = 0; i < (n | 0); i++) doTick(); return M.tick; },
      tickOnce: () => { doTick(); return M.tick; },
      setMine: list => { M.mine = list.slice(); },
      setNet: n => { M.net = n; },
      aim: a => { M.aim = a; },
      aimAt, setBoost,
      doTick, resettle, say,
      remote: (seat, wire) => onlineRemote(seat, wire),
      hooks: NET_HOOKS,
      peers: () => M.peers,
      lagMs, seatTick, noteArrival,
      fps: () => (M ? M.fps.val : 0),
      draw, fitCanvas, hud, openBoardFn: openBoard,
      rules: () => rulesOpen, setRules,
      lobby: R.lobby, tile: TILE,
      store: () => ST,
      kit: KIT,
      toScreen: (x, y) => toScreen(x, y),
      /* zoom test surface: the pure length→scale map, the live eased
         multiplier and the effective pixels-per-unit the camera paints at */
      zoomFor, currentLen,
      zoom: () => (UI ? UI.zoom : null),
      ppu: () => (UI ? UI.ppu : null),
      ppuBase: () => (UI ? UI.ppuBase : null),
      ZOOM_MIN, ZOOM_K
    };
  }
} catch(e){}

})();

/* ═══════════════════════════════════════════════════════════════════
   SERP — THE KIT SHELF (purely cosmetic, always)
   Snake skins, trails and arena floors through KARTI_XP.register(),
   additively. THE SKIN DRESSES YOUR SNAKE AND NOBODY ELSE'S — eight
   players in eight bought skins is eight snakes you cannot tell apart,
   and telling them apart IS the game, so the seat colours stay. Unequipped
   is stock; the preview draws the real thing with the real tube renderer.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* a short curved tube, drawn the way drawSnake() strokes the arena body */
function tubePv(t){
  return function(size){
    var s = size || 62, dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    var cv = document.createElement('canvas');
    cv.width = Math.round(s * dpr); cv.height = Math.round(s * dpr);
    cv.style.width = s + 'px'; cv.style.height = s + 'px';
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var pts = [];
    for (var i = 0; i <= 12; i++){
      var x = s * 0.16 + (i / 12) * s * 0.68;
      var y = s * 0.5 + Math.sin(i / 12 * 5.2) * s * 0.18;
      pts.push({ x:x, y:y });
    }
    g.lineJoin = 'round'; g.lineCap = 'round';
    function stroke(w, col){ g.strokeStyle = col; g.lineWidth = w; g.beginPath();
      g.moveTo(pts[0].x, pts[0].y); for (var i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y); g.stroke(); }
    stroke(s * 0.32, t.b);
    stroke(s * 0.18, t.a);
    var h = pts[pts.length - 1];
    g.fillStyle = t.head;
    g.beginPath(); g.arc(h.x, h.y, s * 0.13, 0, 6.2832); g.fill();
    g.fillStyle = '#0B1018';
    g.beginPath(); g.arc(h.x + s * 0.04, h.y - s * 0.03, s * 0.022, 0, 6.2832); g.fill();
    g.beginPath(); g.arc(h.x + s * 0.04, h.y + s * 0.03, s * 0.022, 0, 6.2832); g.fill();
    return cv;
  };
}
function trailPv(col){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style', 'display:flex;align-items:center;justify-content:center;' +
      'width:' + s + 'px;height:' + s + 'px');
    el.innerHTML = '<span style="display:block;width:' + Math.round(s * 0.74) + 'px;height:' +
      Math.round(s * 0.3) + 'px;border-radius:999px;background:linear-gradient(90deg,' +
      'transparent 0%,' + col + ' 62%,#fff 100%)"></span>';
    return el;
  };
}
function floorPv(t){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style', 'display:flex;align-items:center;justify-content:center;' +
      'width:' + s + 'px;height:' + s + 'px');
    var step = Math.round(s / 5);
    el.innerHTML = '<span style="display:block;width:' + Math.round(s * 0.84) + 'px;height:' +
      Math.round(s * 0.84) + 'px;border-radius:9px;box-sizing:border-box;' +
      'border:1px solid rgba(0,0,0,.5);background:' +
      'repeating-linear-gradient(0deg,transparent 0 ' + (step - 1) + 'px,' + t.line + ' ' +
        (step - 1) + 'px ' + step + 'px),' +
      'repeating-linear-gradient(90deg,transparent 0 ' + (step - 1) + 'px,' + t.line + ' ' +
        (step - 1) + 'px ' + step + 'px),' +
      'radial-gradient(120% 90% at 50% 30%,' + t.a + ' 0%,' + t.b + ' 100%)"></span>';
    return el;
  };
}

function boot(tries){
  var XP = window.KARTI_XP;
  var R = window.KARTI_SERP;
  if (!XP || !document.body || !R){
    if (tries < 40) setTimeout(function(){ boot(tries + 1); }, 500);
    return;
  }
  var KIT = XP.forGame('serp');
  KIT.register([
    { slot:'skin', id:'serp.skin.klassiku', level:0, name:'Klassiku',
      blurb:'Your seat colour, and nothing else. Everybody can see who you are.',
      preview:tubePv({ a:'#3BE08A', b:'#0E7A45', head:'#BFF9DA' }) },
    { slot:'skin', id:'serp.skin.bahar', level:4, name:'Ilma tal-Baħar',
      blurb:'Channel blue with a white crest. Looks calm. Is not.',
      preview:tubePv({ a:'#3FB8E8', b:'#1B6E96', head:'#BFF0FF' }) },
    { slot:'skin', id:'serp.skin.franka', level:9, name:'Franka',
      blurb:'Cut from the same limestone as every island you glide past.',
      preview:tubePv({ a:'#E4CFA3', b:'#A88C5C', head:'#FFF6E2' }) },
    { slot:'skin', id:'serp.skin.luzzu', level:16, name:'Luzzu',
      blurb:'Red, blue and an eye on the front. The eye has seen this coming.',
      preview:tubePv({ a:'#F04B3C', b:'#1B4FA0', head:'#FFE9B0' }) },
    { slot:'skin', id:'serp.skin.lejl', level:25, name:'Wara Nofsillejl',
      blurb:'The colour an arena goes when nobody has mentioned the time in two hours.',
      preview:tubePv({ a:'#5C4FA8', b:'#2A2350', head:'#CFC4FF' }) },
    { slot:'skin', id:'serp.skin.festa', level:38, name:'Lejl tal-Festa',
      blurb:'Pink and gold and far too loud. The band is tuning up.',
      preview:tubePv({ a:'#FF6FD8', b:'#8A1F73', head:'#FFE1F6' }) },

    { slot:'trail', id:'serp.trail.ghabra', level:7, name:'Għabra',
      blurb:'A little dust off the tail. Proof you went past.',
      preview:trailPv('rgba(255,255,255,.55)') },
    { slot:'trail', id:'serp.trail.nar', level:20, name:'Nar',
      blurb:'Embers. Purely for the benefit of whoever is behind you.',
      preview:trailPv('rgba(255,140,60,.75)') },

    { slot:'floor', id:'serp.floor.kazin', level:0, name:'Art tal-Każin',
      blurb:'Club green under a bare bulb. Where every bad turn on this island was taken.',
      preview:floorPv({ a:'#123527', b:'#060F0C', line:'rgba(255,255,255,.06)' }) },
    { slot:'floor', id:'serp.floor.franka', level:12, name:'Franka Mikula',
      blurb:'Worn limestone. Every square has been stood on by somebody.',
      preview:floorPv({ a:'#3A3222', b:'#14110B', line:'rgba(255,222,160,.07)' }) },

    { slot:'skin', id:'serp.skin.lampuk', level:5, set:'summer', name:'Lampuka',
      blurb:'Straight off the boat and still flashing gold. By Sunday it is a pie.',
      preview:tubePv({ a:'#FFD24D', b:'#C97A12', head:'#FFF3C7' }) },
    { slot:'trail', id:'serp.trail.bahar', level:11, set:'summer', name:'Ġebla fl-Ilma',
      blurb:'The wake off the back of a dgħajsa, held for half a second.',
      preview:trailPv('rgba(90,220,255,.65)') },
    { slot:'floor', id:'serp.floor.qiegh', level:18, set:'summer', name:'Qiegħ il-Baħar',
      blurb:'The bottom, seen through four metres of very clear water.',
      preview:floorPv({ a:'#0E2E44', b:'#04121C', line:'rgba(150,220,255,.07)' }) }
  ]);
  KIT.onChange(function(){
    try { if (R.kitChanged) R.kitChanged(); } catch (e){}
  });
}
boot(0);

})();
