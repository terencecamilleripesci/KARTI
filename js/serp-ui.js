/* ═══════════════════════════════════════════════════════════════════
   KARTI — serp-ui.js
   SERP — the arena. The rules live in js/serp.js; this file is the
   screen, the clock, the wire and the paint. It follows
   js/poker-ui.js's shape — engine and UI split down the middle, the
   themed menu with the rules folded shut at the bottom of it, the back
   arrow that goes BACK — and departs from it in exactly one place,
   which is the clock, because this is the app's first game that runs
   on a frame timer instead of on turns.

   WHAT THIS FILE IS
     · the shelf tile and the themed menu — how many snakes, how hard
       the machine is, how fast, with the RULES FOLDED SHUT at the
       bottom of the sheet so starting a game is one tap
     · the arena: a <canvas>, drawn at device pixel ratio, one snake
       per player plus the machine's, the pellets, and a HUD that says
       who is still moving
     · the thumb: a four-way pad UNDER the arena and a swipe over it
     · the clock: one requestAnimationFrame loop that steps the
       simulation on a fixed tick and interpolates between ticks
     · the wire: turns, eats and deaths, and the jitter buffer that
       makes somebody else's snake look smooth from 100ms away
     · the serp kit shelf — snake skins and trails

   ── WHY A CANVAS, WHEN EVERY OTHER GAME HERE IS DOM ────────────────
     Chess has 32 pieces that move twice a minute; a DOM node each is
     right, and it is what chess.js does. SERP has up to EIGHT snakes
     of up to sixty segments — five hundred boxes — and every one of
     them moves EVERY FRAME, because the whole point of the
     interpolation below is that nothing snaps.

     Five hundred elements with a transform rewritten sixty times a
     second is five hundred style resolutions and a layout pass per
     frame. It is not a close call and it is not a matter of taste: it
     is the difference between 60fps and a slideshow on a mid phone.

     So: ONE canvas element. Its backing store is resized on RESIZE
     ONLY, never in the frame loop (`fitCanvas`), and the loop itself
     reads no geometry at all — no getBoundingClientRect, no
     offsetWidth, no getComputedStyle — so there is nothing per frame
     for the browser to lay out. The canvas is a single compositor
     layer whose size never changes mid-game, and everything that
     moves, moves inside it.

     The HUD is DOM, and it is repainted on CHANGE, not per frame.

   ── THE CONTROL SCHEME, AND WHY IT IS A PAD AND NOT A SWIPE ────────
     Tested on a 390x844 phone with one thumb. Three options, and the
     reasons the other two lost:

     TAP-TO-TURN (tap left half / right half to turn relative to your
       heading) is the most thumb-friendly thing you can build and it
       is wrong for snake. Relative steering means the same tap means
       "up" or "down" depending on which way you happen to be pointing,
       and at 120ms a step nobody has time to work that out. It is
       excellent in a one-button game and disorienting in this one.

     SWIPE is the obvious phone answer and it has one fatal property
       here: a swipe is not a swipe until it has TRAVELLED. A
       recogniser needs somewhere around 24 pixels of movement before
       it can tell a swipe from a tap, and on a real thumb that is
       40–80ms. A snake steps every 120ms — so a swipe can and does
       cost a whole step, which is a whole cell, which is the wall.
       You cannot fix that by lowering the threshold; you just start
       turning when somebody meant to scratch the screen.

     THE PAD WINS, on two counts:
       1. LATENCY. A pointerdown on a button is a direction, now, at
          the first event. There is nothing to recognise and nothing to
          wait for. Against a 120ms step that is the whole margin back.
       2. THE THUMB. The single worst thing about phone snake is that
          the hand covering the controls is also covering the snake.
          A pad that lives in its own strip BELOW the arena makes that
          impossible by construction rather than by hoping — the arena
          is a square at the top, the pad owns the bottom 150px, and
          they never overlap at any size this app supports. That is
          asserted in the test file, not eyeballed.

     Swipe is kept ANYWAY, over the arena, for people who reach for it
     — it costs nothing, because the pad is not where the swipe is. The
     pad is the one that is measured and the one the rules card names.

   ── THE JITTER BUFFER, WHICH IS THE WHOLE ONLINE GAME ──────────────
     Measured: a player's round trip is 50–100ms and it JITTERS inside
     one session. Not a stable 50. Not a stable 100.

     Every remote snake is therefore simulated to `tick - lag[seat]`
     rather than to `tick`, and the collision test in js/serp.js reads
     snakes AT WHATEVER TICK THEY HAVE REACHED — so you are never
     killed by a body this phone only guessed at. Being smooth and
     three frames behind beats being current and stuttering, every
     time, and it is also the only version that is fair.

     lag[seat] is NOT the 80ms somebody read in an article. It is
     measured, per peer, continuously:

       · every event carries the sender's TICK NUMBER. On arrival we
         note d = (our tick) - (their tick). That d is their clock
         offset plus the one-way trip.
       · the MINIMUM d over the last 24 events is the offset plus the
         BEST trip — the sample with no queueing in it. That is the
         floor, and it is what NTP does for the same reason.
       · the spread above that floor is the JITTER, and it is the only
         thing the buffer has to cover. So the margin is the 90th
         percentile of (d - min), never a constant.
       · js/mp.js's pingStats() is folded in as a second opinion, so a
         quiet peer who has sent three events still gets a buffer sized
         from a live measurement of the same radio.

     A message that beats the buffer is applied on time. One that loses
     is applied RETROACTIVELY — js/serp.js rewinds that one snake and
     replays it — and the correction is then BLENDED OUT over ~110ms by
     the visual offset in `smooth()`, never teleported.

   HOUSE RULES OBEYED
     · borrows #scr-party through KARTI_PARTY, injects its own CSS
       once, never touches css/ or the tab bar's ancestors;
     · no emoji; sounds only through KARTI_SFX ids that already exist;
     · every player-visible string is a T(en, mt) pair at its call
       site — js/lang.js's rule;
     · reduced motion turns off interpolation, the death burst and the
       pellet pulse, and the game stays completely playable;
     · the back arrow goes BACK. It never asks "are you sure", and it
       registers no js/nav.js guard, which is how that is arranged.
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
   SOUND — existing ids only, through one gate. A snake eats every
   second or two and dies once, so the eat is the quiet one and the
   death is the loud one; the reverse is what makes a game tiring.
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

/* ── UI-only preferences in their OWN key (il-kiri's dock rule) ──── */
const UIKEY = 'karti_serp_ui_v1';
let rulesOpen = false;          /* the in-arena panel                 */
let setupOpen = false;          /* the fold at the bottom of the menu */
try { rulesOpen = localStorage.getItem(UIKEY + '.rules') === '1'; } catch(e){}
try { setupOpen = localStorage.getItem(UIKEY + '.setup') === '1'; } catch(e){}
function setSetupOpen(open){
  setupOpen = !!open;
  try { localStorage.setItem(UIKEY + '.setup', setupOpen ? '1' : '0'); } catch(e){}
}

/* the machine, by the club's own names — the same three every other
   table in this app uses, so a difficulty means one thing everywhere */
const LEVELS = [
  { level:1, name:'Gentle',   note:'Will miss things.' },
  { level:2, name:'Normal',   note:'Plays properly.' },
  { level:3, name:'Ruthless', note:'Plays to win.' }
];
function levelWords(k){
  if (k === 1) return { n:T('Gentle', 'Kalm'),        i:T('Wanders. Hits things.', 'Jitlajja. Jaħbat.') };
  if (k === 3) return { n:T('Ruthless', 'Bla ħniena'), i:T('Cuts you off on purpose.', 'Jaqtagħlek it-triq apposta.') };
  return { n:T('Normal', 'Normali'), i:T('Plays properly.', 'Jilgħab sew.') };
}

/* the speeds, named. The NAME is the speed's name in both languages;
   only the note is translated. */
const SPEEDWORDS = {
  kalm:   () => ({ n:'KALM',    i:T('A gentle crawl. Room to think.', 'Bil-mod. Spazju biex taħseb.') }),
  normal: () => ({ n:'NORMALI', i:T('The house speed.', 'Il-pass tad-dar.') }),
  mignun: () => ({ n:'MIĠNUN',  i:T('Too fast. That is the point.', 'Mgħaġġel wisq. Dak hu l-punt.') })
};

/* ── the eight snakes, by colour. Seat order, fixed, so the snake you
   are is the same colour on every phone at the table. ───────────── */
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
   The arena is a fixed square and the pad is a fixed strip under it,
   and the two are laid out by the FLEX BOX and never by script — so a
   rotation or a keyboard cannot land them on top of each other.
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS(){
  if (document.getElementById('sp-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'sp-runtime-css';
  st.textContent =
    '#scr-party .sp-host{display:flex;flex-direction:column;align-items:center;' +
      'justify-content:flex-start;gap:8px;min-height:0}' +

    /* ── the arena ── */
    '#scr-party .sp-arena{position:relative;flex:0 0 auto;border-radius:14px;overflow:hidden;' +
      'border:2px solid rgba(0,0,0,.55);background:#0B1018;' +
      'box-shadow:0 10px 26px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.05)}' +
    '#scr-party .sp-arena canvas{display:block;width:100%;height:100%;touch-action:none}' +

    /* the countdown and the round banner sit OVER the canvas and are
       the only DOM that ever moves; both are transform/opacity only */
    '#scr-party .sp-over{position:absolute;inset:0;display:flex;align-items:center;' +
      'justify-content:center;pointer-events:none;z-index:4}' +
    '#scr-party .sp-cd{font:900 64px/1 var(--disp);color:#fff;letter-spacing:.02em;' +
      'text-shadow:0 4px 18px rgba(0,0,0,.8);transform:scale(1);opacity:.95}' +
    '#scr-party .sp-cd.go{font-size:40px;color:var(--gold,#FFC542)}' +

    /* ── the HUD: one chip per snake, repainted on CHANGE only ── */
    '#scr-party .sp-hud{flex:0 0 auto;display:flex;flex-wrap:wrap;gap:5px;' +
      'justify-content:center;width:100%;padding:0 4px;box-sizing:border-box}' +
    '#scr-party .sp-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;' +
      'border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);' +
      'font:900 10px/1 var(--disp);letter-spacing:.06em;color:var(--dim)}' +
    '#scr-party .sp-chip .d{width:9px;height:9px;border-radius:3px;flex:0 0 auto}' +
    '#scr-party .sp-chip b{color:#fff;font-size:11px}' +
    '#scr-party .sp-chip.me{background:rgba(255,197,66,.13);border-color:rgba(255,197,66,.38)}' +
    '#scr-party .sp-chip.out{opacity:.38}' +
    '#scr-party .sp-chip.out b{text-decoration:line-through}' +

    /* ── THE PAD. Its own strip, under the arena, never over it. ──
       44px minimum targets, laid out as a 3x3 grid diamond so the
       thumb has a dead centre to rest in and cannot fat-finger two. */
    '#scr-party .sp-pad{flex:0 0 auto;display:grid;grid-template-columns:repeat(3,56px);' +
      'grid-template-rows:repeat(3,46px);gap:5px;margin:2px 0 4px;touch-action:none;' +
      '-webkit-user-select:none;user-select:none}' +
    '#scr-party .sp-pad button{-webkit-appearance:none;appearance:none;border:0;padding:0;' +
      'border-radius:13px;background:rgba(255,255,255,.075);color:#E9E4F5;' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.10);display:flex;align-items:center;' +
      'justify-content:center;touch-action:none}' +
    '#scr-party .sp-pad button svg{width:24px;height:24px;stroke:currentColor;fill:none;' +
      'stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}' +
    '#scr-party .sp-pad button.on{background:rgba(255,197,66,.26);color:#fff;' +
      'box-shadow:inset 0 0 0 1px rgba(255,197,66,.5)}' +
    '#scr-party .sp-pad .sp-mid{background:none;box-shadow:none;pointer-events:none}' +
    '#scr-party .sp-pad .sp-mid span{width:12px;height:12px;border-radius:50%;' +
      'background:rgba(255,255,255,.13)}' +
    '#scr-party .sp-u{grid-area:1/2/2/3}#scr-party .sp-l{grid-area:2/1/3/2}' +
    '#scr-party .sp-c{grid-area:2/2/3/3}#scr-party .sp-r{grid-area:2/3/3/4}' +
    '#scr-party .sp-d{grid-area:3/2/4/3}' +
    '@media (max-height:680px){#scr-party .sp-pad{grid-template-rows:repeat(3,40px)}}' +

    /* ── the rules: a panel that HIDES AND SLIDES, poker's exactly ── */
    '#scr-party .sp-rules{position:absolute;top:0;left:0;right:0;z-index:30;max-height:60%;' +
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
      'justify-content:center;height:118px;margin:2px 0 12px;border-radius:16px;overflow:hidden;' +
      'background:radial-gradient(120% 90% at 50% 30%,#15422F 0%,#0C2A1F 52%,#060F0C 100%);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),inset 0 -16px 30px rgba(0,0,0,.45)}' +
    '#scr-party .sp-menu .sp-hero canvas{display:block}' +
    '#scr-party .sp-menu .sp-hero-cap{position:absolute;right:10px;bottom:8px;' +
      'font:900 10px/1 var(--disp);letter-spacing:.12em;color:rgba(255,255,255,.42)}' +
    '@media (max-height:520px){#scr-party .sp-menu .sp-hero{height:88px}}' +
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

    /* the fold at the bottom of the menu — poker's pk-fold, renamed */
    '#scr-party .sp-fold-h{width:100%;display:flex;align-items:center;justify-content:space-between;' +
      'gap:8px;padding:12px 2px;border:0;background:none;color:#fff;text-align:left}' +
    '#scr-party .sp-fold-h b{font:900 11px/1.3 var(--disp);letter-spacing:.06em;' +
      'text-transform:uppercase}' +
    '#scr-party .sp-fold-h i{font:900 9px/1 var(--disp);letter-spacing:.1em;color:var(--dim);' +
      'font-style:normal;flex:0 0 auto}' +
    '#scr-party .sp-fold-b{display:grid;grid-template-rows:0fr;' +
      'transition:grid-template-rows .28s var(--ease)}' +
    '#scr-party .sp-fold-b.open{grid-template-rows:1fr}' +
    '#scr-party .sp-fold-i{overflow:hidden;min-height:0}' +
    '#scr-party .sp-fold-i .sp-fold-c{transform:translateY(-10px);opacity:0;' +
      'transition:transform .28s var(--ease),opacity .28s var(--ease)}' +
    '#scr-party .sp-fold-b.open .sp-fold-i .sp-fold-c{transform:none;opacity:1}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .sp-fold-b,' +
      '#scr-party .sp-fold-i .sp-fold-c{transition:none}}' +
    'body.reduced #scr-party .sp-fold-b,body.reduced #scr-party .sp-fold-i .sp-fold-c' +
      '{transition:none}' +
    '#scr-party .sp-fold-c li{font-size:12px;line-height:1.6;color:var(--dim);list-style:none;' +
      'margin:0 0 7px;padding:0 0 0 13px;position:relative}' +
    '#scr-party .sp-fold-c li:before{content:"";position:absolute;left:0;top:7px;width:5px;' +
      'height:5px;border-radius:2px;background:var(--gold,#FFC542);opacity:.75}' +
    '#scr-party .sp-fold-c b{color:#fff}' +

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

/* ── the shelf mark. One symbol, injected once, the way every other
   party game does it (js/spy-ui.js's sprite is the reference). ──── */
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
   M is the whole live game: the engine state, the clock, the wire and
   the canvas. There is exactly one, and leave() is the only way out.
   ═══════════════════════════════════════════════════════════════════ */
let M = null;
let UI = null;
const moveSubs = [];
function fire(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }

/* THE ONE PLACE ANYTHING IN SERP TOUCHES Math.random: a brand-new local
   match choosing its seed, which is skarta's and poker's pattern. From
   here on the seed is data and the engine is pure. */
function newSeed(){ return (Math.random() * 0xFFFFFFFF) >>> 0; }

const nowMs = () => (typeof performance !== 'undefined' && performance.now)
                      ? performance.now() : Date.now();

/* how long the machine's snake keeps going after its owner walks out,
   in ticks — about a second and a half at any speed */
const coastTicks = st => Math.max(8, Math.round(1500 / st.step));
/* the countdown before a round: three beats and a GO */
const LEAD_MS = 2400;

function startMatch(opts, seed, net){
  stopLoop();
  FX.length = 0;                            /* no flourishes leak across rounds */
  const o = Object.assign({ seats:4, speed:'normal', lvl:2 }, opts || {});
  M = {
    opts: o,
    seed: (seed == null ? newSeed() : seed) >>> 0,
    st: null,
    ctx: null, cv: null, g2: null,
    net: net || null,
    me: 0,                      /* which seat this phone drives         */
    mine: [],                   /* every seat THIS phone is authoritative over */
    meta: [],
    t0: 0,                      /* nowMs() of tick 0                    */
    tick: 0,
    want: 0,                    /* the direction the thumb has asked for */
    peers: {},                  /* seat -> the jitter measurement        */
    raf: 0, dead: false, finished: false,
    fps: { n:0, at:0, val:0 },  /* measured, and shown in the test hook  */
    lead: LEAD_MS,              /* countdown remaining before tick 1     */
    ledSaid: -1
  };
  M.st = E.deal(o, M.seed);
  return M;
}

/* ═══════════════════════════════════════════════════════════════════
   THE JITTER BUFFER
   One of these per remote seat. `d` is (our tick) - (their tick) at the
   moment an event landed: their clock offset plus the trip. The FLOOR
   of d is the offset plus the best trip; everything above the floor is
   jitter, and jitter is the only thing a buffer has to cover.
   ═══════════════════════════════════════════════════════════════════ */
const RING = 24;
function peerOf(seat){
  let p = M.peers[seat];
  if (!p) p = M.peers[seat] = { ds:[], floor:0, lag:2, seen:0 };
  return p;
}

/* js/mp.js has been timing the keep-alive since before this game
   existed. A peer who has said three words still gets a buffer sized
   off a live measurement of the same radio. Returns MILLISECONDS of
   jitter, or null when there is nothing worth believing yet. */
function radioJitter(){
  try {
    const MPX = window.KARTI_MP;
    if (!MPX || !MPX.pingStats) return null;
    const s = MPX.pingStats();
    if (!s || s.n < 4 || s.best == null) return null;
    /* half the observed spread: the round trip's wobble, one way */
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
  /* the 90th percentile of the spread above the floor, in TICKS */
  const p90 = a[Math.min(a.length - 1, Math.floor(a.length * 0.9))];
  let margin = Math.max(0, p90 - p.floor);

  /* the second opinion, in ticks */
  const rj = radioJitter();
  if (rj != null) margin = Math.max(margin, rj / M.st.step);

  /* one whole tick of slack on top: a message that lands in the same
     millisecond as the step that needs it is a coin toss otherwise */
  p.lag = Math.max(0, Math.min(24, p.floor + Math.ceil(margin) + 1));
}

/* what tick a given seat should be simulated to right now */
function seatTick(seat){
  if (M.mine.indexOf(seat) >= 0) return M.tick;      /* ours: instant   */
  const p = M.peers[seat];
  return M.tick - (p ? p.lag : 2);
}

/* the buffer actually in force, in ms — for the HUD and the report */
function lagMs(){
  let worst = 0;
  for (const k in M.peers) worst = Math.max(worst, M.peers[k].lag);
  return Math.round(worst * M.st.step);
}

/* ═══════════════════════════════════════════════════════════════════
   THE CLOCK
   One rAF loop. It steps the simulation on a FIXED tick derived from
   wall time — never "one step per frame", which would run the game at
   whatever speed the phone happened to manage — and then draws once,
   interpolating between the last two ticks.

   A tab that was backgrounded for ten seconds comes back owing eighty
   steps. Those are NOT run: they are skipped forward (see the catch-up
   clamp), because replaying them would fast-forward the snake into a
   wall while nobody was looking.
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

  /* the countdown, before tick 1 has happened */
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
    /* we were away. Do not replay the missing steps into a wall —
       move the clock's origin instead, and carry on from here. */
    M.t0 = now - (M.tick * st.step);
  } else {
    let guard = 0;
    while (M.tick < want && guard++ < MAX_CATCHUP) doTick();
  }

  const frac = Math.max(0, Math.min(1, (now - M.t0) / st.step - (M.tick - 1)));
  draw(noMotion() ? 1 : frac);
  meter(now);
}

/* the frame rate, measured rather than assumed */
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
   ONE TICK
   The order here is the design, so it is spelled out:
     1. every REMOTE snake is walked forward to its own buffered tick,
        using only events that actually arrived;
     2. every snake THIS PHONE OWNS turns (thumb, or the machine),
        moves, and then — and only then — decides whether it just died
        or just ate, against a world made of buffered remote bodies;
     3. the horizon moves up and the past is frozen.
   Nothing in step 2 ever writes to a snake from step 1.
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

    /* the turn. Ours goes in LOCALLY FIRST and travels afterwards —
       the thumb never waits for the network. */
    let d = null;
    if (seat === M.me){
      if (M.want != null && M.want !== sn.dir && M.want !== E.back(sn.dir)) d = M.want;
      M.want = null;
    }
    if (sn.own === 'ai') d = E.bot(st, sn, M.tick, sn.lvl || st.lvl);
    if (d != null && E.plan(st, sn, { t:M.tick, k:'turn', d })) say(seat, { t:'turn', tick:M.tick, dir:d });

    E.simTo(st, sn, M.tick, null);

    /* 2b — DID I DIE. Nobody else's phone may answer this. */
    const occ = E.occupancy(st, seat);
    const why = E.hitTest(st, sn, occ);
    if (why != null){
      E.plan(st, sn, { t:M.tick, k:'die', n:why });
      say(seat, { t:'die', tick:M.tick, why });
      onDeath(seat, why);
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
        fxEat(sn.cells[0].x + 0.5, sn.cells[0].y + 0.5, seat === M.me ? '#FFC542' : kit.a);
        if (seat === M.me) cue('ui.coin', { gain:0.42 });
      }
      hud();
    }
  }

  /* 3 — freeze the past */
  E.advanceHorizon(st, M.tick - E.HORIZON);

  if (!M.finished && E.over(st)) finish();
}

/* settle() may have re-decided who got a pellet. Anybody whose accepted
   list changed is rewound and replayed — and the correction is blended
   out by smooth(), never snapped. */
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

const headOf = sn => (sn.cells && sn.cells[0]) ? { x:sn.cells[0].x, y:sn.cells[0].y } : null;

/* ── ERROR SMOOTHING ──────────────────────────────────────────────
   A rewind moves a head. Drawing it at the new place immediately is a
   teleport, and a teleport is the single thing that makes a networked
   game look broken. So the DIFFERENCE is remembered as a visual offset
   and decays to nothing over about a tenth of a second: the snake ends
   up in the right place, and the eye never sees it jump.
   Beyond three cells the error is not jitter, it is a phone that was
   away — and dragging a three-cell rubber band across the arena looks
   worse than the cut. So that one snaps, once, honestly. */
const SMOOTH_TAU = 110;
const SMOOTH_MAX = 3;
function smoothFrom(sn, was){
  if (!was || noMotion()) return;
  const h = headOf(sn);
  if (!h) return;
  const dx = was.x - h.x, dy = was.y - h.y;
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
    if (sn.vx) { sn.vx *= k; if (Math.abs(sn.vx) < 0.004) sn.vx = 0; }
    if (sn.vy) { sn.vy *= k; if (Math.abs(sn.vy) < 0.004) sn.vy = 0; }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   THE CANVAS
   fitCanvas() is the ONLY thing in this file that reads layout, and it
   runs on mount and on resize — never inside the frame loop. The
   backing store is sized in device pixels once; the loop then draws in
   CSS pixels through a single scale, so nothing per frame asks the
   browser to measure anything.
   ═══════════════════════════════════════════════════════════════════ */
function fitCanvas(){
  if (!UI || !UI.cv || !UI.arena) return;
  const st = M.st;
  const host = UI.host;
  /* the arena is a SQUARE and the pad keeps its own strip below it, so
     the square is whatever is left after the pad and the HUD. Rounded
     down to a whole number of cells so no seam ever falls half a pixel
     between two of them. */
  const padH = UI.pad ? UI.pad.offsetHeight : 150;
  const hudH = UI.hud ? UI.hud.offsetHeight : 24;
  const availW = Math.max(160, host.clientWidth - 8);
  const availH = Math.max(160, host.clientHeight - padH - hudH - 26);
  const cell = Math.max(6, Math.floor(Math.min(availW, availH) / st.grid));
  const side = cell * st.grid;

  UI.cell = cell;
  UI.side = side;
  UI.arena.style.width = side + 'px';
  UI.arena.style.height = side + 'px';

  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const px = Math.round(side * dpr);
  if (UI.cv.width !== px || UI.cv.height !== px){
    UI.cv.width = px;
    UI.cv.height = px;
  }
  UI.dpr = dpr;
  const g = UI.g2;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  UI.dirtyBg = true;
}

/* the arena floor. Repainted into an offscreen canvas only when the
   size changes — a grid of 676 faint squares is not worth redrawing
   sixty times a second and it never changes. */
function bg(){
  const side = UI.side, cell = UI.cell, st = M.st;
  if (!UI.bgc) UI.bgc = document.createElement('canvas');
  const dpr = UI.dpr;
  UI.bgc.width = Math.round(side * dpr);
  UI.bgc.height = Math.round(side * dpr);
  const g = UI.bgc.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const grd = g.createRadialGradient(side / 2, side * 0.34, 0, side / 2, side * 0.5, side * 0.78);
  const sk = KIT.floor();
  grd.addColorStop(0, sk.a); grd.addColorStop(1, sk.b);
  g.fillStyle = grd;
  g.fillRect(0, 0, side, side);
  g.strokeStyle = sk.line;
  g.lineWidth = 1;
  for (let i = 1; i < st.grid; i++){
    const p = Math.round(i * cell) + 0.5;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, side); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(side, p); g.stroke();
  }
  UI.dirtyBg = false;
}

/* ── draw one frame ───────────────────────────────────────────────
   `f` is how far between the previous tick and the current one we are,
   0..1. A snake's body at tick k-1 is EXACTLY its body at tick k
   shifted one segment along, so segment i can be drawn at
   lerp(cells[i+1], cells[i], f) with no history kept and no error —
   that identity is what makes a grid game look continuous for free. */
function draw(f){
  if (!UI || !UI.g2) return;
  const st = M.st, g = UI.g2, cell = UI.cell, side = UI.side;
  const now = nowMs();
  decaySmooth(Math.max(0, Math.min(64, now - (UI.lastAt || now))));
  UI.lastAt = now;

  if (UI.dirtyBg || !UI.bgc) bg();
  g.clearRect(0, 0, side, side);
  g.drawImage(UI.bgc, 0, 0, side, side);

  /* ── the pellets ── */
  const pulse = noMotion() ? 1 : (0.86 + 0.14 * Math.sin(now / 260));
  for (let i = 0; i < st.live.length; i++){
    const p = E.pellet(st, st.live[i]);
    const r = cell * 0.31 * pulse;
    const cx = (p.x + 0.5) * cell, cy = (p.y + 0.5) * cell;
    g.beginPath();
    g.arc(cx, cy, r, 0, 6.2832);
    g.fillStyle = '#FFC542';
    g.fill();
    if (!noMotion()){
      g.beginPath();
      g.arc(cx, cy, r * 1.9, 0, 6.2832);
      g.fillStyle = 'rgba(255,197,66,.12)';
      g.fill();
    }
  }

  /* ── the snakes, dead ones first so the living draw over them ── */
  for (let pass = 0; pass < 2; pass++){
    for (let s = 0; s < st.snakes.length; s++){
      const sn = st.snakes[s];
      if ((pass === 0) !== !sn.alive) continue;
      drawSnake(g, sn, f, cell, now);
    }
  }

  /* ── the flourishes, on top of everything, additive and cheap ── */
  fxDraw(g, cell, now);
}

function drawSnake(g, sn, f, cell, now){
  const cells = sn.cells;
  if (!cells || cells.length < 2) return;
  const col = COLS[sn.seat % COLS.length];
  const kit = KIT.skin(sn.seat);
  const mine = (sn.seat === M.me);

  /* a dead snake fades out over 700ms and then is not drawn at all */
  let alpha = 1;
  if (!sn.alive){
    const gone = (M.tick - (sn.dieAt == null ? M.tick : sn.dieAt)) * M.st.step;
    alpha = Math.max(0, 1 - gone / 700);
    if (alpha <= 0) return;
  }
  g.globalAlpha = alpha;

  const vx = sn.vx || 0, vy = sn.vy || 0;
  const w = cell * 0.82;
  const off = (cell - w) / 2;
  const rad = Math.min(w / 2, cell * 0.3);

  /* the body, tail-first so the head sits on top of its own neck */
  for (let i = cells.length - 2; i >= 0; i--){
    const a = cells[i + 1], b = cells[i];
    const x = (a.x + (b.x - a.x) * f + vx) * cell + off;
    const y = (a.y + (b.y - a.y) * f + vy) * cell + off;
    g.fillStyle = i === 0 ? kit.head : (i % 2 ? kit.a : kit.b);
    roundRect(g, x, y, w, w, rad);
    g.fill();
  }

  /* the head gets an eye, so which way it is pointing is readable at a
     glance and at arm's length — the one thing that must never be
     ambiguous in this game */
  const a0 = cells[1], b0 = cells[0];
  const hx = (a0.x + (b0.x - a0.x) * f + vx) * cell + cell / 2;
  const hy = (a0.y + (b0.y - a0.y) * f + vy) * cell + cell / 2;
  const d = E.DIRS[sn.dir];
  const er = Math.max(1.2, cell * 0.10);
  g.fillStyle = '#0B1018';
  for (let k = -1; k <= 1; k += 2){
    g.beginPath();
    g.arc(hx + d[0] * cell * 0.18 - d[1] * cell * 0.16 * k,
          hy + d[1] * cell * 0.18 + d[0] * cell * 0.16 * k, er, 0, 6.2832);
    g.fill();
  }

  /* your own snake wears a ring. Eight colours is more than anybody can
     hold in their head mid-panic; "the one with the ring is me" is not. */
  if (mine && sn.alive){
    g.strokeStyle = 'rgba(255,255,255,.85)';
    g.lineWidth = Math.max(1.4, cell * 0.10);
    g.beginPath();
    g.arc(hx, hy, cell * 0.52, 0, 6.2832);
    g.stroke();
  }

  /* the trail — decoration, and the first thing reduced motion drops */
  if (kit.trail && sn.alive && !noMotion()){
    const t = cells[cells.length - 1], t2 = cells[cells.length - 2] || t;
    const tx = (t.x + (t2.x - t.x) * f + vx) * cell + cell / 2;
    const ty = (t.y + (t2.y - t.y) * f + vy) * cell + cell / 2;
    g.globalAlpha = alpha * (0.30 + 0.14 * Math.sin(now / 190));
    g.fillStyle = kit.trail;
    g.beginPath();
    g.arc(tx, ty, cell * 0.42, 0, 6.2832);
    g.fill();
  }
  g.globalAlpha = 1;
  void col;
}

function roundRect(g, x, y, w, h, r){
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* ═══════════════════════════════════════════════════════════════════
   THE FLOURISHES — eat pop, death crunch, round-win ring
   ───────────────────────────────────────────────────────────────────
   Everything here is drawn on the SAME canvas as the snakes, into the
   same single compositor layer, with no DOM and no per-frame layout —
   so a burst of sparks costs a handful of arcs, never a reflow. Each
   effect is a small object with a birth time; draw() ages them by wall
   clock and drops them when spent, so the frame loop stays fixed-tick
   and the effects are purely cosmetic on top. Reduced motion adds none
   of them and the game plays exactly the same without a single one.

   Coordinates are in CELLS (grid space), turned into pixels at paint
   time by fxDraw — so a resize that changes the cell size never leaves
   an effect stranded at an old scale. */
const FX = [];
const FX_CAP = 120;                       /* a hard ceiling: never unbounded */
function fxPush(o){ if (noMotion()) return; if (FX.length >= FX_CAP) FX.shift(); o.t0 = nowMs(); FX.push(o); }

/* an EAT POP: a quick gold ring plus a few sparks flung outward. Fired
   at the cell a head just cleared a pellet off. */
function fxEat(cx, cy, tint){
  if (noMotion()) return;
  const sparks = [];
  const N = 7;
  for (let i = 0; i < N; i++){
    const a = (i / N) * 6.2832 + Math.random() * 0.7;
    const sp = 1.4 + Math.random() * 1.6;
    sparks.push({ x:cx, y:cy, vx:Math.cos(a) * sp, vy:Math.sin(a) * sp });
  }
  fxPush({ k:'eat', x:cx, y:cy, life:360, sparks, tint: tint || '#FFC542' });
}

/* a DEATH CRUNCH: the snake's segments burst apart, thrown from the head
   outward, fading fast. A short, loud punctuation to a quiet game. */
function fxDeath(sn){
  if (noMotion() || !sn.cells || !sn.cells.length) return;
  const col = COLS[sn.seat % COLS.length];
  const bits = [];
  const step = Math.max(1, Math.floor(sn.cells.length / 14));
  for (let i = 0; i < sn.cells.length; i += step){
    const c = sn.cells[i];
    const a = Math.random() * 6.2832, sp = 1.0 + Math.random() * 2.2;
    bits.push({ x:c.x + 0.5, y:c.y + 0.5, vx:Math.cos(a) * sp, vy:Math.sin(a) * sp,
                r:0.28 + Math.random() * 0.14 });
  }
  fxPush({ k:'death', life:520, bits, a:col.a, b:col.b });
}

/* a ROUND-WIN FLOURISH: three gold rings that expand from the winner's
   head, in the half-second before the result sheet slides up. */
function fxWin(sn){
  if (noMotion() || !sn.cells || !sn.cells.length) return;
  const h = sn.cells[0];
  fxPush({ k:'win', x:h.x + 0.5, y:h.y + 0.5, life:900 });
}

/* draw and age the effects. `cell` turns grid space into pixels. */
function fxDraw(g, cell, now){
  if (!FX.length) return;
  for (let i = FX.length - 1; i >= 0; i--){
    const e = FX[i];
    const age = now - e.t0;
    const p = age / e.life;                 /* 0..1 progress */
    if (p >= 1){ FX.splice(i, 1); continue; }
    const s = age / 1000;                   /* seconds, for velocity */
    if (e.k === 'eat'){
      const rr = cell * (0.32 + p * 0.9);
      g.globalAlpha = (1 - p) * 0.7;
      g.strokeStyle = e.tint; g.lineWidth = Math.max(1, cell * 0.09 * (1 - p));
      g.beginPath(); g.arc(e.x * cell, e.y * cell, rr, 0, 6.2832); g.stroke();
      g.fillStyle = e.tint; g.globalAlpha = (1 - p);
      for (let k = 0; k < e.sparks.length; k++){
        const sp = e.sparks[k];
        const px = (sp.x + sp.vx * s * 6) * cell, py = (sp.y + sp.vy * s * 6) * cell;
        g.beginPath(); g.arc(px, py, Math.max(0.6, cell * 0.10 * (1 - p)), 0, 6.2832); g.fill();
      }
    } else if (e.k === 'death'){
      g.globalAlpha = (1 - p);
      for (let k = 0; k < e.bits.length; k++){
        const bt = e.bits[k];
        const px = (bt.x + bt.vx * s * 5) * cell, py = (bt.y + bt.vy * s * 5) * cell;
        g.fillStyle = (k & 1) ? e.a : e.b;
        const rr = cell * bt.r * (1 - p * 0.5);
        roundRect(g, px - rr, py - rr, rr * 2, rr * 2, rr * 0.5); g.fill();
      }
    } else if (e.k === 'win'){
      for (let ring = 0; ring < 3; ring++){
        const rp = Math.max(0, p - ring * 0.16);
        if (rp <= 0 || rp >= 1) continue;
        g.globalAlpha = (1 - rp) * 0.5;
        g.strokeStyle = '#FFC542'; g.lineWidth = Math.max(1, cell * 0.12 * (1 - rp));
        g.beginPath(); g.arc(e.x * cell, e.y * cell, cell * (0.4 + rp * 3.2), 0, 6.2832); g.stroke();
      }
    }
  }
  g.globalAlpha = 1;
}

/* ═══════════════════════════════════════════════════════════════════
   THE KIT, READ AT PAINT TIME
   The cosmetics themselves are registered at the bottom of this file
   through KARTI_XP. This is the reader: it turns "what is equipped"
   into the four colours the canvas actually needs, and it is cached
   because equipped() is not free and this runs every frame.
   Unequipped = stock, which is the seat's own colour.
   ═══════════════════════════════════════════════════════════════════ */
const SKINS = {
  'serp.skin.klassiku': null,                                     /* stock */
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
  'serp.floor.kazin':  { a:'#123527', b:'#060F0C', line:'rgba(255,255,255,.045)' },
  'serp.floor.franka': { a:'#3A3222', b:'#14110B', line:'rgba(255,222,160,.05)' },
  'serp.floor.qiegh':  { a:'#0E2E44', b:'#04121C', line:'rgba(150,220,255,.05)' }
};
const KIT = {
  _v: 0, _skin: null, _trail: null, _floor: null,
  bust(){ this._v++; this._skin = null; this._trail = null; this._floor = null;
          if (UI) UI.dirtyBg = true; },
  /* the skin only ever dresses YOUR snake: eight players wearing eight
     bought skins is eight snakes nobody can tell apart, and telling
     them apart is the game. Everybody else keeps their seat colour. */
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
      this._floor = f || FLOORS['serp.floor.kazin'];
    }
    return this._floor;
  }
};

/* ═══════════════════════════════════════════════════════════════════
   THE SCREEN
   ═══════════════════════════════════════════════════════════════════ */
const ARROW = {
  0:'M12 5v14M12 5l-6 6M12 5l6 6',
  1:'M5 12h14M19 12l-6-6M19 12l-6 6',
  2:'M12 19V5M12 19l-6-6M12 19l6-6',
  3:'M19 12H5M5 12l6-6M5 12l6 6'
};
const arrowSVG = d => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ARROW[d] + '"/></svg>';

function board(){
  const ctx = M.ctx;
  ctx.host.classList.add('sp-host');
  ctx.host.innerHTML =
    '<div class="sp-hud" id="sp-hud"></div>' +
    '<div class="sp-arena" id="sp-arena">' +
      '<canvas id="sp-cv"></canvas>' +
      '<div class="sp-over"><span class="sp-cd" id="sp-cd"></span></div>' +
      /* the rules panel lives OVER the arena; draw() never touches it —
         only paintRules() does */
      '<div class="sp-rules" id="sp-rulespanel" aria-hidden="true">' +
        '<div class="sp-rules-h"><h4 id="sp-rules-t"></h4>' +
          '<button class="sp-rules-x" id="sp-rules-x" aria-label="' +
            esc(T('Put the rules away', 'Warrab ir-regoli')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<div class="sp-rules-b" id="sp-rules-b"></div>' +
      '</div>' +
    '</div>' +
    /* THE PAD. Its own strip. It is a sibling of the arena and BELOW
       it in the flex column, which is how the thumb is kept off the
       snake — not by a z-index and not by hoping. */
    '<div class="sp-pad" id="sp-pad" role="group" aria-label="' +
        esc(T('Steer the snake', 'Mexxi s-serp')) + '">' +
      '<button class="sp-u" data-dir="0" aria-label="' + esc(T('Up', 'Fuq')) + '">' + arrowSVG(0) + '</button>' +
      '<button class="sp-l" data-dir="3" aria-label="' + esc(T('Left', 'Xellug')) + '">' + arrowSVG(3) + '</button>' +
      '<span class="sp-mid sp-c" aria-hidden="true"><span></span></span>' +
      '<button class="sp-r" data-dir="1" aria-label="' + esc(T('Right', 'Lemin')) + '">' + arrowSVG(1) + '</button>' +
      '<button class="sp-d" data-dir="2" aria-label="' + esc(T('Down', 'Isfel')) + '">' + arrowSVG(2) + '</button>' +
    '</div>';

  const arena = ctx.host.querySelector('#sp-arena');
  const cv = ctx.host.querySelector('#sp-cv');
  UI = {
    ctx, arena, cv,
    g2: cv.getContext('2d', { alpha:false }),
    host: ctx.host,
    hud: ctx.host.querySelector('#sp-hud'),
    pad: ctx.host.querySelector('#sp-pad'),
    cd:  ctx.host.querySelector('#sp-cd'),
    rules: ctx.host.querySelector('#sp-rulespanel'),
    cell:12, side:240, dpr:1, bgc:null, dirtyBg:true, lastAt:0
  };
  M.cv = cv; M.g2 = UI.g2;

  wireControls();
  UI.rules.querySelector('#sp-rules-x').addEventListener('click', () => setRules(false));
  /* tap anywhere OUTSIDE the rules panel puts it away. The arena under
     it stays live, so this must never eat the tap itself. */
  ctx.root.addEventListener('pointerdown', e => {
    if (!rulesOpen || !UI || !UI.rules) return;
    const rb = ctx.btn && ctx.btn('sp-rules');
    if (!UI.rules.contains(e.target) && !(rb && rb.contains(e.target))) setRules(false);
  }, true);

  fitCanvas();
  /* fitCanvas is the only layout read in the file, and it runs HERE and
     on resize — never in the frame loop */
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
   THE THUMB
   turn() is the whole input path and it is deliberately three lines:
   the direction is remembered, the NEXT tick uses it, and nothing here
   waits for, asks or tells the network first. The wire is told
   afterwards, by doTick(), and it is told what already happened.
   ═══════════════════════════════════════════════════════════════════ */
function turn(d){
  if (!M || M.dead || M.finished) return;
  const sn = M.st.snakes[M.me];
  if (!sn || !sn.alive) return;
  if (d === sn.dir || d === E.back(sn.dir)) return;
  M.want = d;
  flash(d);
}
function flash(d){
  if (!UI || !UI.pad || noMotion()) return;
  const b = UI.pad.querySelector('[data-dir="' + d + '"]');
  if (!b) return;
  b.classList.add('on');
  setTimeout(() => { try { b.classList.remove('on'); } catch(e){} }, 110);
}

function wireControls(){
  /* THE PAD — pointerdown, not click. A click is not delivered until
     the finger LIFTS, which on a real thumb is 80–150ms after the
     player decided. At a 120ms step that is a whole cell. */
  UI.pad.addEventListener('pointerdown', e => {
    const b = e.target && e.target.closest && e.target.closest('[data-dir]');
    if (!b) return;
    e.preventDefault();
    turn(+b.getAttribute('data-dir'));
  });

  /* THE SWIPE — over the arena only, and therefore never under the
     thumb that is on the pad. Offered because people reach for it;
     never the measured path. 22px is the smallest threshold that does
     not fire on a resting thumb. */
  let sx = 0, sy = 0, on = false;
  UI.arena.addEventListener('pointerdown', e => {
    if (rulesOpen) return;
    on = true; sx = e.clientX; sy = e.clientY;
  });
  UI.arena.addEventListener('pointermove', e => {
    if (!on) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
    on = false;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  });
  UI.arena.addEventListener('pointerup', () => { on = false; });
  UI.arena.addEventListener('pointercancel', () => { on = false; });

  /* a keyboard, for the desk and for the test harness */
  UI.keys = e => {
    if (!M || M.dead) return;
    const k = e.key;
    const d = (k === 'ArrowUp' || k === 'w') ? 0 : (k === 'ArrowRight' || k === 'd') ? 1
            : (k === 'ArrowDown' || k === 's') ? 2 : (k === 'ArrowLeft' || k === 'a') ? 3 : -1;
    if (d < 0) return;
    e.preventDefault();
    turn(d);
  };
  window.addEventListener('keydown', UI.keys);
}

/* ── the HUD. Repainted when a score or a life changes, NEVER per
   frame: sixty innerHTML writes a second is the layout thrash this
   whole file is arranged to avoid. ──────────────────────────────── */
function hud(){
  if (!UI || !UI.hud) return;
  const st = M.st;
  UI.hud.innerHTML = st.snakes.map(sn => {
    const c = COLS[sn.seat % COLS.length];
    const m = M.meta[sn.seat] || {};
    return '<span class="sp-chip' + (sn.seat === M.me ? ' me' : '') +
             (sn.alive ? '' : ' out') + '">' +
      '<span class="d" style="background:' + c.a + '"></span>' +
      esc(m.name || ('#' + (sn.seat + 1))) + ' <b>' + sn.score + '</b></span>';
  }).join('');
}

function paintCountdown(beat){
  if (!UI || !UI.cd) return;
  if (beat <= 0){ UI.cd.textContent = ''; UI.cd.className = 'sp-cd'; return; }
  if (beat >= 4){ UI.cd.textContent = ''; return; }
  UI.cd.className = 'sp-cd' + (beat === 1 ? ' go' : '');
  UI.cd.textContent = beat === 1 ? T('GO', 'MUR') : String(beat - 1);
}

/* ── somebody's snake stopped ─────────────────────────────────────── */
function onDeath(seat, why){
  const sn = M.st.snakes[seat];
  if (sn) fxDeath(sn);                     /* the crunch — segments scatter */
  if (seat === M.me){
    cue('duel.destroy', { gain:0.8 }, true);
    if (M.ctx) P.ui.setTurn(M.ctx, {
      cls:'bad',
      who: T('You are out', 'Int barra'),
      note: deathWords(why)
    });
  } else {
    cue('piece.capture', { gain:0.4 });
  }
  hud();
}
function deathWords(why){
  const C = E.CAUSE;
  if (why === C.WALL)  return T('Into the wall.', 'Fil-ħajt.');
  if (why === C.SELF)  return T('Into your own tail.', 'F’denbek stess.');
  if (why === C.GONE)  return T('The phone left.', 'It-telefon telaq.');
  return T('Into somebody else.', 'F’ħaddieħor.');
}

/* ═══════════════════════════════════════════════════════════════════
   THE RULES CARD — one game, told once, in both languages
   ═══════════════════════════════════════════════════════════════════ */
function rulesFor(){
  return [
    T('You are <b>always moving</b>. The pad under the arena turns you; you cannot turn back ' +
      'into your own neck.',
      'Int <b>dejjem miexi</b>. Il-pad taħt l-arena jdawrek; ma tistax iddur lura f’għonqok.'),
    T('Eat a <b>gold pellet</b> to score one and grow two. There are always a few on the floor.',
      'Kul <b>ballun tad-deheb</b> biex tieħu punt u tikber b’tnejn. Dejjem hemm ftit fl-art.'),
    T('You are <b>out</b> the moment your head meets a wall, your own tail, or anybody else. ' +
      'There are no lives.',
      'Toħroġ <b>barra</b> malli rasek tiltaqa’ ma’ ħajt, ma’ denbek, jew ma’ ħaddieħor. ' +
      'M’hemmx ħajjiet.'),
    T('<b>Last snake moving wins</b> the round. If everybody goes at once, the highest score ' +
      'takes it.',
      '<b>L-aħħar serp li jibqa’ miexi jirbaħ</b> ir-round. Jekk imutu lkoll flimkien, ' +
      'l-ogħla punteġġ jieħdu.'),
    T('Two of you claiming <b>the same pellet</b> at the same moment: the earlier one gets it, ' +
      'and every phone works that out the same way.',
      'Tnejn jaqbdu <b>l-istess ballun</b> fl-istess ħin: min kien l-ewwel jieħdu, u kull ' +
      'telefon joħroġ l-istess tweġiba.'),
    T('You can swipe over the arena instead of using the pad. The pad is faster.',
      'Tista’ tiżloq fuq l-arena minflok il-pad. Il-pad hu eħfef.')
  ];
}

/* the panel: hide and slide, never a wall. Its height is clamped to
   what is actually above the pad, so it can never cover the controls. */
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

  /* the record book and the XP, offline only — an online table's result
     is the room's business, and this is the same line poker draws */
  if (solo){
    const mine = tbl.find(r => r.seat === M.me);
    if (mine && mine.score > ST.best){ ST.best = mine.score; }
    ST.rec[won ? 'w' : 'l']++;
    persist();
    try {
      /* P.record's outcome alphabet is 'w'|'l'|'d' (js/party.js record()),
         and js/progress.js wraps that same call to pay the XP — so this
         is ONE line, not two, and KARTI_XP.finish() is only the fallback
         for a build where party.js has no ledger. */
      if (P.record) P.record('serp', won ? 'w' : 'l');
      else if (window.KARTI_XP && KARTI_XP.finish)
        KARTI_XP.finish({ game:'serp', result: won ? 'w' : 'l',
                          ms: Math.max(1, M.tick * st.step) });
    } catch(e){}
  }

  /* the winner's head throws three gold rings in the half-second before
     the result sheet — the flourish, drawn on the same canvas */
  if (tbl.length){
    const champ = M.st.snakes[tbl[0].seat];
    if (champ) fxWin(champ);
  }

  cue(won ? 'game.win' : 'game.lose', { gain:0.9 }, true);
  setTimeout(() => { if (M && !M.dead) showResult(tbl, won); }, 620);
}

/* the seat colours, in ir-rebbieħ's own palette vocabulary, so the podium
   frames each snake in the colour it wore in the arena */
const REB_BORDER = ['jade', 'ruby', 'ice', 'gold', 'neon', 'fire', 'ice', 'silver'];

function showResult(tbl, won){
  if (!M || !M.ctx) return;
  const solo = !M.net;
  const again = () => { if (M.net) rematchAsk(); else newGame(M.opts); };
  const back  = () => { const nx = M.net; leave();
                        if (nx && nx.onLeave) nx.onLeave(); else menu(); };

  /* IR-REBBIEĦ — the shared podium winner screen (bomba/briks use the same).
     Rows are the final standings; the seat colour rides in as `border` and
     the machine's chairs are flagged so it can mark them. Avatars are null:
     the app's avatar art is its own span system, so rebbieh draws the
     handsome initials tile. */
  const R2 = window.KARTI_REBBIEH;
  if (R2 && R2.show){
    R2.show({
      lang: (window.KARTI_LANG ? KARTI_LANG.lang() : 'en'),
      reduced: noMotion(),
      title: won ? T('You are the last one moving', 'Int l-aħħar wieħed miexi')
                 : T('Out', 'Barra'),
      subtitle: T('Last snake moving takes the round', 'L-aħħar serp miexi jieħu r-round'),
      rows: tbl.map((r, i) => {
        const m = M.meta[r.seat] || {};
        return {
          name: m.name || ('#' + (r.seat + 1)),
          place: i + 1,
          you: r.seat === M.me,
          bot: (m.own === 'ai'),
          score: r.score,
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

  /* fallback: the board's own tally card, if ir-rebbieħ is not present */
  const rows = tbl.map((r, i) => {
    const c = COLS[r.seat % COLS.length];
    const m = M.meta[r.seat] || {};
    return '<div class="sp-row' + (i === 0 ? ' win' : '') + '">' +
      '<span class="p">' + (i + 1) + '</span>' +
      '<span class="d" style="background:' + c.a + '"></span>' +
      '<span class="n">' + esc(m.name || ('#' + (r.seat + 1))) + '</span>' +
      '<span class="s">' + r.score + '</span></div>';
  }).join('');

  P.ui.result(M.ctx, {
    tone: won ? 'win' : 'lose',
    head: won ? T('You are the last one moving', 'Int l-aħħar wieħed miexi')
              : T('Out', 'Barra'),
    why: '<div class="sp-tally">' + rows + '</div>',
    quip: won ? T('Nothing left to hit but the walls.', 'Ma fadal xejn x’taħbat miegħu ħlief il-ħitan.')
              : T('The wall was always going to be there.', 'Il-ħajt dejjem kien se jkun hemm.'),
    buttons: [
      { label: T('Again', 'Erġa'), icon:'refresh', cls:'primary', go: again },
      { label: T('Back', 'Lura'), icon:'back', cls:'ghost', go: back }
    ]
  });
  void solo;
}

function rematchAsk(){
  /* online: a rematch is the ROOM's decision, and this build does not
     hold a vote — it walks back to the lobby, where the room already
     knows how to start another one. Honest beats half-built. */
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
    M.mine.push(s);                      /* offline, this phone owns them all */
    M.meta.push({ name: s === 0 ? T('You', 'Int') : levelWords(o.lvl || 2).n + ' ' + s,
                  own: sn.own });
  }
  openBoard(() => menu());
  startLoop();
}

function openBoard(onBack){
  M.ctx = P.ui.frame({
    /* SERP is the game's NAME and stays itself in both languages */
    title: 'SERP',
    /* THE BACK ARROW GOES BACK. No "are you sure" and no js/nav.js
       guard registered: a round of SERP is ninety seconds, it is not
       worth a popup, and a confirm that is always wrong teaches people
       to dismiss the ones that matter. */
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'sp-rules', label:T('Rules', 'Regoli'), icon:'book',    cls:'ghost' },
      { id:'sp-new',   label:T('New', 'Ġdida'),    icon:'refresh', cls:'ghost' }
    ]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();      /* the square-board sizer is not ours */
  M.ctx.badge.textContent = SPEEDWORDS[M.st.speed]().n + ' · ' + M.st.n;
  board();
  M.ctx.btn('sp-rules').onclick = () => setRules(!rulesOpen);
  paintRules();
  const nb = M.ctx.btn('sp-new');
  if (nb) nb.onclick = () => { if (M.net) rematchAsk(); else newGame(M.opts); };
  P.ui.setTurn(M.ctx, { cls:'', who: T('Get ready', 'Ħejji ruħek'),
                        note: T('The pad is under the arena.', 'Il-pad qiegħed taħt l-arena.') });
}

function leave(){
  stopLoop();
  if (UI){
    if (UI.stopFit) { try { UI.stopFit(); } catch(e){} }
    if (UI.keys) { try { window.removeEventListener('keydown', UI.keys); } catch(e){} }
  }
  if (M){ M.dead = true; persistNow(); }
  M = null; UI = null;
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE
   say() is the ONE place a local event leaves this phone. It is called
   AFTER the event has already been applied here — never before, never
   instead of. Offline M.net is null and this is a no-op, which is why
   solo needs no network at all rather than a stubbed one.

   The `hooks.onMove` shape is js/rummy-ui.js's, so js/mp.js's existing
   machinery carries it unchanged — including the one piece SERP would
   otherwise have had to build itself: a host that is running the
   machine's snakes has its bot events stamped as those chairs by
   mp.js's sendFor() path, because it already does that for rummy.
   ═══════════════════════════════════════════════════════════════════ */
function say(seat, mv){
  if (!M || !M.net) return;
  const w = E.encWire(mv);
  if (!w) return;
  fire(moveSubs, { seat, move: w, src:'local' });
}

/* a message from another chair. Never fatal: an action this build does
   not know is an action about somebody else's snake (see the note at
   the end of js/serp.js's header on why there is no bail here). */
function onlineRemote(seat, wire){
  if (!M || M.dead || !M.net) return null;
  const g = M.net.toGame ? M.net.toGame[seat] : seat;
  if (g === undefined || !M.st.snakes[g]) return null;
  if (M.mine.indexOf(g) >= 0) return null;      /* our own, echoed back */
  const mv = E.decWire(wire);
  if (!mv) return null;
  const sn = M.st.snakes[g];

  if (mv.t === 'again') return null;

  noteArrival(g, mv.tick);
  const was = headOf(sn);

  if (mv.t === 'turn'){
    E.plan(M.st, sn, { t:mv.tick, k:'turn', d:mv.dir });
    smoothFrom(sn, was);
    return null;
  }
  if (mv.t === 'die'){
    E.plan(M.st, sn, { t:mv.tick, k:'die', n:mv.why });
    smoothFrom(sn, was);
    onDeath(g, mv.why);
    return null;
  }
  if (mv.t === 'eat'){
    /* a CLAIM, not a verdict. settle() is the court and it runs on
       every phone including the claimant's. */
    M.st.claims.push({ i:mv.idx, s:g, t:mv.tick });
    E.plan(M.st, sn, { t:mv.tick, k:'eat', n:mv.idx });
    const mineWas = M.st.snakes[M.me] ? M.st.snakes[M.me].score : 0;
    const wasScore = sn.score;
    resettle();
    smoothFrom(sn, was);
    /* a remote snake's eat pops in its own colour, but only if the court
       actually awarded it the pellet (its score really went up) */
    if (sn.score > wasScore && sn.cells && sn.cells[0]){
      const kit = KIT.skin(sn.seat);
      fxEat(sn.cells[0].x + 0.5, sn.cells[0].y + 0.5, kit.a);
    }
    const mineNow = M.st.snakes[M.me] ? M.st.snakes[M.me].score : 0;
    if (mineNow < mineWas){
      /* we lost a pellet we thought we had. Say so — silently taking
         two segments off somebody's snake is how a game gets called
         broken when it is in fact being correct. */
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
  const lvl = (chairs.map(s => s && s.level).find(v => v)) || 2;

  leave();
  injectCSS();
  startMatch({ seats:n, lvl, speed:(cfg.opts && cfg.opts.mode) || 'normal' },
             cfg.seed >>> 0, null);
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
    /* THE MACHINE'S SNAKES BELONG TO THE HOST, and to exactly one
       phone. They are deterministic, so every phone could in principle
       run them — but every phone sees a slightly different arena
       through its own buffer, so "in principle" would drift. One
       owner, broadcasting like any player, cannot. */
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
  /* NOBODY IS EVER ON TURN. This is the honest answer for a real-time
     game, and it is the answer mp.js's push-on-your-turn code reads —
     so SERP never sends anybody a "your turn" notification, which would
     be nonsense. */
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
  /* THE PHONE THAT WALKED OUT. Its snake COASTS — it keeps the heading
     it had for about a second and a half and then dissolves — rather
     than freezing on the spot or vanishing mid-arena. Freezing turns a
     live snake into a wall nobody was warned about; vanishing opens a
     hole somebody was already steering around. Coasting is what the
     snake was going to do anyway, and it gives everyone time to see it
     go. js/serp.js's stepOne() is where it happens. */
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
   THE ENTRY SCREEN — MINIMAL, the shape ludu/kanun/bomba use. Screen
   one is a hero, a blurb, PLAY ONLINE on top (emphasised) then PLAY WITH
   AI, and a HOW TO PLAY that slides the rules up over the menu. Nothing
   else — no pass-the-phone (SERP is real-time simultaneous) and no
   settings wall (snakes/speed/difficulty live on the SECOND step). Every
   picker lives on aiSetup, reached after PLAY WITH AI, behind sensible
   defaults so a player can just start. PLAY ONLINE routes into the shared
   party lobby (bomba/briks' openOnline pattern): if the relay knows the
   word it opens a room; if not, an honest toast and a drop into the AI
   step, so the tap is never a dead end. Presentation only: newGame still
   gets {seats,speed,lvl}.
   ═══════════════════════════════════════════════════════════════════ */

/* PLAY ONLINE — route into the shared party lobby if the app offers one
   (the relay opens a real serp room once it knows the word); otherwise
   say the honest status through a toast and drop into the AI step so the
   tap is never a dead end. This is bomba/briks' openOnline, verbatim in
   shape — the online engine, wire and controller are already live on
   P.online.serp and the R.lobby contract above. */
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

function heroCanvas(){
  /* the identity piece: a snake drawn with the real renderer's geometry
     so the menu and the arena are unmistakably the same game.
     Decoration only — aria-hidden, nothing tappable, and it is drawn
     ONCE, not animated, so opening the menu costs one paint. */
  const cv = document.createElement('canvas');
  const w = 210, h = 96, dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cell = 15;
  const path = [[9,3],[8,3],[7,3],[6,3],[5,3],[5,4],[5,2],[4,2],[3,2],[2,2]];
  const body = [[2,2],[3,2],[4,2],[5,2],[5,3],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[10,3],[10,2],[11,2],[12,2]];
  for (let i = 0; i < body.length; i++){
    const b = body[i];
    g.fillStyle = i === body.length - 1 ? '#BFF9DA' : (i % 2 ? '#3BE08A' : '#0E7A45');
    roundRect(g, b[0] * cell + 1.4, b[1] * cell + 1.4, cell - 2.8, cell - 2.8, 4);
    g.fill();
  }
  const hd = body[body.length - 1];
  g.fillStyle = '#0B1018';
  g.beginPath(); g.arc(hd[0] * cell + cell * 0.68, hd[1] * cell + cell * 0.34, 1.7, 0, 6.2832); g.fill();
  g.beginPath(); g.arc(hd[0] * cell + cell * 0.68, hd[1] * cell + cell * 0.68, 1.7, 0, 6.2832); g.fill();
  g.fillStyle = '#FFC542';
  g.beginPath(); g.arc(14 * cell + cell / 2, 2 * cell + cell / 2, cell * 0.3, 0, 6.2832); g.fill();
  void path;
  return cv;
}

function menu(){
  injectCSS();
  P.show();
  stopLoop(); M = null; UI = null;
  const el = P.ui.screenEl();
  const p = pref();
  const seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, p.seats || 4));

  el.innerHTML =
    '<div class="pt-wrap sp-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="sp-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>SERP</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="sp-hero" id="sp-hero" aria-hidden="true">' +
        '<span class="sp-hero-cap">' + E.gridFor(seats) + '&times;' + E.gridFor(seats) + '</span>' +
      '</div>' +
      '<p class="blurb">' +
        T('You are always moving. Eat, get longer, and be the last one still going. ' +
          'Two to eight snakes in one walled arena.',
          'Int dejjem miexi. Kul, itwal, u kun l-aħħar wieħed li għadu sejjer. ' +
          'Minn żewġ sa tmien sriep f’arena waħda bil-ħitan.') +
      '</p>' +
      (ST.best ? '<p class="blurb" style="color:var(--gold,#FFC542)">' +
        esc(T('Your best: ', 'L-aħjar tiegħek: ') + ST.best) + '</p>' : '') +

      /* ── the modes, big and few: PLAY ONLINE on top and emphasised,
         PLAY WITH AI below, then HOW TO PLAY. ── */
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

    /* ── the rules: a clean slide-up sheet over the menu, tap to open.
       Reuses SERP's own .sp-rules chrome so the menu matches the arena. ── */
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

  /* BACK GOES BACK — straight to the hub, no confirm popup */
  el.querySelector('#sp-back').onclick = () => { cue('ui.back', { gain:0.7 }); P.hub(); };
  el.querySelector('#sp-online').onclick = () => { cue('ui.tap', { gain:0.7 }); goOnline(); };
  el.querySelector('#sp-ai').onclick = () => aiSetup();

  /* the rules slide-up */
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
   THE OPTIONS STEP — the ONE small step after PLAY WITH AI. Sensible
   defaults so a player can just start: how many snakes, how fast, how
   sharp the machine is, then a big START. Not a settings wall on screen
   one. Presentation only — it hands newGame the same {seats,speed,lvl}
   the old menu did, so gameplay is unchanged.
   ═══════════════════════════════════════════════════════════════════ */
function aiSetup(){
  injectCSS();
  P.show();
  const el = P.ui.screenEl();
  const p = pref();
  let seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, p.seats || 4));
  let lvl   = p.lvl || 2;
  let speed = E.speedOf(p.speed).id;

  function paint(){
    el.innerHTML =
      '<div class="pt-wrap sp-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="sp-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(T('Play the machine', 'Ilgħab mal-magna')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<div class="sp-hero" id="sp-hero" aria-hidden="true">' +
          '<span class="sp-hero-cap">' + E.gridFor(seats) + '&times;' + E.gridFor(seats) + '</span>' +
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
          esc(T('You, and the rest are the machine.',
                'Int, u l-bqija huma l-magna.')) +
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

    /* BACK goes to the entry screen, never a popup */
    el.querySelector('#sp-back').onclick = () => { cue('ui.back', { gain:0.7 }); menu(); };
    el.querySelector('#sp-go').onclick = () => {
      pref({ seats, lvl, speed });
      newGame({ seats, lvl, speed });
    };
    const dn = el.querySelector('#sp-s-dn'), up = el.querySelector('#sp-s-up');
    if (dn) dn.onclick = () => { if (seats > E.MIN_SEATS){ seats--; paint(); } };
    if (up) up.onclick = () => { if (seats < E.MAX_SEATS){ seats++; paint(); } };
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

/* repaint on a language change, but only what we own and only if it is
   actually on screen — js/lang.js rule 4 */
try {
  if (window.KARTI_LANG) KARTI_LANG.onChange(() => {
    try {
      const el = P.ui.screenEl();
      /* re-render whichever step is up — the options step owns #sp-go,
         the entry screen owns #sp-ai — so a language change never kicks
         the player back a step */
      if (el && el.querySelector('#sp-go')) aiSetup();
      else if (el && el.querySelector('.sp-menu')) menu();
      else if (UI && rulesOpen) paintRules();
      if (UI) hud();
    } catch(e){}
  });
} catch(e){}

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — what js/mp.js reads before a snake exists.

   ── READ THIS BEFORE TRYING TO OPEN AN ONLINE ROOM ─────────────────
   The online half above is written, wired and tested. It is NOT
   reachable, and the reason is one line on the relay that is not ours
   to change:

       server/karti_server.py
       TABLES = ("skarta","klabb","kiri","tombla","rummy","gin",
                 "gharraq","spy","suspett")

   v_game() refuses any room, and any bact payload, whose `game` is not
   in that tuple. 'serp' is not in it. A room labelled serp is rejected
   at the door with Reject("game") — so this cannot be made to work
   from the client side at all, and the honest thing is to say so here
   rather than to ship a door that opens onto a wall.

   THAT IS THE ONLY THING MISSING. Everything else the relay already
   does correctly, and deliberately so:
     · it forwards, it does not referee — which is exactly what this
       design needs, and why SERP asks it for nothing else;
     · its generic bact codec ({a, i, j, s, n, c, k[]}, every value a
       bounded byte) carries a turn, an eat and a death with a byte to
       spare — see WIRE_FIELDS in js/serp.js;
     · its FAN_RATE of 40 relayed messages a second PER ROOM is not a
       problem, it is a VINDICATION: eight snakes at 15 ticks/sec would
       need 120/s and would be throttled to a slideshow. SERP sends a
       message only when somebody TURNS, EATS or DIES — about 2/sec per
       player in a busy round, ~16/s for a full table of eight. Inside
       the budget with room to spare, and that is not luck: it is the
       reason the design broadcasts events and not state.

   So this contract is published in FULL — SERP is a first-class citizen
   of the room list — and canStart() now returns ok for a ready table.
   The ONE remaining thing, and it is not ours to change, is that the
   relay must know the word "serp" before it will open a room at all:

     ── THE INTEGRATION (four lines, mirroring kanun/bomba/briks) ──
       1. server/karti_server.py  TABLES += ("serp",)
       2. server/karti_server.py  GAME_SEATS['serp'] = (2, 8)   # min..max
       3. js/mp.js  GAMES += { k:'serp', name:'Is-Serp', short:'SERP',
                               icon:'dice', blurb:'...' }
       4. js/mp.js  LOBBY_GLOBAL.serp = 'KARTI_SERP'
     (SEATS_FALLBACK is optional — R.lobby publishes minSeats/maxSeats, so
      the shared lobby reads them from the contract, not the fallback.)

   The day those land, PLAY ONLINE below opens a real room and canStart()
   lets it go. Until then P.lobbyFor('serp') / openLobby fall through to
   an honest toast and the AI step — the tap is never a dead end.
   ═══════════════════════════════════════════════════════════════════ */
const ONLINE_WHY = T(
  'Online SERP is written, wired and tested on this phone — real-time prediction, a jitter ' +
  'buffer and a refereeless pellet court. It needs the KARTI server to know the word "serp" ' +
  'so it can open a room; four lines add it, alongside bomba and briks. Until then, SERP is ' +
  'you against the machine.',
  'SERP onlajn hu miktub, imqabbad u ttestjat fuq dan it-telefon — bi tbassir ħaj, jitter ' +
  'buffer u qorti tal-ballun bla referi. Irid biss li s-server tal-KARTI jkun jaf il-kelma ' +
  '"serp" biex jiftaħ kamra; erba’ linji jżiduha, ħdejn bomba u briks. Sa dakinhar, SERP hu ' +
  'int kontra l-magna.');

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
  /* ONLINE IS ON. A ready table starts. The only questions the lobby is
     authoritative about are how many are round the arena and whether the
     people (never the machine) have said ready — the same shape ludu and
     battleship publish. The relay must know the word "serp" for a room to
     open at all (see THE INTEGRATION note below); once it does, this ok is
     what lets the room go. */
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
    '<p>' + T('Two to eight snakes in one walled arena, all moving at once. Eat the gold to ' +
      'score and grow. Hit a wall, your own tail or anybody else and you are out.',
      'Minn żewġ sa tmien sriep f’arena waħda bil-ħitan, kollha jimxu f’daqqa. Kul id-deheb ' +
      'biex tieħu punti u tikber. Aħbat ma’ ħajt, ma’ denbek jew ma’ ħaddieħor u toħroġ barra.') +
    '</p>' +
    '<p>' + T('Last one moving wins. Nobody ever waits for a turn — everybody plays at the ' +
      'same time, and each phone answers only for its own snake.',
      'L-aħħar wieħed miexi jirbaħ. Ħadd qatt ma jistenna dawra — kulħadd jilgħab fl-istess ' +
      'ħin, u kull telefon iwieġeb biss għas-serp tiegħu.') + '</p>' +
    '<p>' + esc(ONLINE_WHY) + '</p>',
  blurb: T('Always moving, always getting longer. Last snake going takes it.',
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
    seats: Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, (seatList || []).length || 4)),
    lvl: ((seatList || []).map(s => s && s.level).find(v => v)) || 2,
    speed: (o && o.mode) || pref().speed || 'normal'
  }),
  wire: { fields: E.WIRE_FIELDS },
  takeback: false
};

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF — one tile on the BOARD shelf, alongside chess, dama,
   għarraqhom, tombla and il-kiri. SERP is not a card game: there is no
   deck, no hand and nothing to keep a straight face about. It is a
   walled arena with things moving on it, which is what that shelf is
   for — js/party.js's shelfOf() puts `kind:'board'` there.
   register() replaces by id, so wiring the same descriptor twice
   costs nothing.
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'serp', order:27, kind:'board', name:'SERP', mt:'Is-serp',
  sprite:'sp-t-serp', status:'live',
  get tag(){
    return T('Always moving, always getting longer, and the wall is always exactly where you ' +
             'left it. Two to eight snakes at once — nobody ever waits for a turn.',
             'Dejjem miexi, dejjem jitwal, u l-ħajt dejjem eżatt fejn ħallejtu. Minn żewġ sa ' +
             'tmien sriep f’daqqa — ħadd qatt ma jistenna dawra.') +
           (ST.best ? ' ' + T('Your best is ', 'L-aħjar tiegħek hu ') + ST.best + '.' : '');
  },
  open: () => menu(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: LEVELS,
  rulesHTML: () => R.lobby.rulesHTML()
};
R.shelfTile = TILE;
R.open = () => menu();
R.close = () => { leave(); P.hub(); };
/* the kit shelf at the bottom of this file calls this when the player
   equips something. KIT caches what is equipped, because it is read
   every frame, and this is the only thing allowed to clear that cache. */
R.kitChanged = () => { KIT.bust(); if (UI) hud(); };
P.register(TILE);

/* the shelf mark must exist before the shelf is painted */
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
        startMatch(opts || { seats:2, speed:'normal', lvl:2 }, seed);
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
      /* drive a match that is already up, without the clock */
      solo: n => { for (let i = 0; i < (n | 0); i++) doTick(); return M.tick; },
      tickOnce: () => { doTick(); return M.tick; },
      setMine: list => { M.mine = list.slice(); },
      setNet: n => { M.net = n; },
      want: d => { M.want = d; },
      turn, doTick, resettle, say,
      remote: (seat, wire) => onlineRemote(seat, wire),
      hooks: NET_HOOKS,
      peers: () => M.peers,
      lagMs, seatTick, noteArrival,
      fps: () => (M ? M.fps.val : 0),
      draw, fitCanvas, hud, board, openBoard,
      rules: () => rulesOpen, setRules,
      lobby: R.lobby, tile: TILE,
      store: () => ST,
      kit: KIT
    };
  }
} catch(e){}

})();

/* ═══════════════════════════════════════════════════════════════════
   SERP — THE KIT SHELF (purely cosmetic, always)
   Snake skins, trails and arena floors through KARTI_XP.register(),
   additively: nothing outside this block is touched and no other
   game's shelf is aware of it. progress.js keys a cosmetic by
   game + '.' + slot, so 'serp.skin' cannot collide with anybody, and
   progress-ui.js grows a SERP tab on its own the moment one item is
   registered — XP.games() is built from what has registered, not from
   a list somebody has to remember to edit.

   THE SKIN DRESSES YOUR SNAKE AND NOBODY ELSE'S. Eight players in
   eight bought skins is eight snakes you cannot tell apart, and
   telling them apart IS the game — so the seat colours are load-
   bearing and stay. See KIT.skin() above.

   Unequipped = stock. The preview draws the real thing with the real
   renderer's geometry, so what is on the shelf is what turns up in the
   arena.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

function rr(g, x, y, w, h, r){
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* three segments and a head, drawn exactly the way drawSnake() does */
function skinPv(t){
  return function(size){
    var s = size || 62, dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    var cv = document.createElement('canvas');
    cv.width = Math.round(s * dpr); cv.height = Math.round(s * dpr);
    cv.style.width = s + 'px'; cv.style.height = s + 'px';
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var c = Math.floor(s / 4.4), y = Math.round(s / 2 - c / 2), x0 = Math.round(s * 0.1);
    for (var i = 0; i < 4; i++){
      g.fillStyle = i === 3 ? t.head : (i % 2 ? t.a : t.b);
      rr(g, x0 + i * c, y, c - 2, c - 2, Math.max(2, c * 0.3));
      g.fill();
    }
    g.fillStyle = '#0B1018';
    g.beginPath(); g.arc(x0 + 3 * c + c * 0.62, y + c * 0.3, Math.max(1, c * 0.11), 0, 6.2832); g.fill();
    g.beginPath(); g.arc(x0 + 3 * c + c * 0.62, y + c * 0.68, Math.max(1, c * 0.11), 0, 6.2832); g.fill();
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
      preview:skinPv({ a:'#3BE08A', b:'#0E7A45', head:'#BFF9DA' }) },
    { slot:'skin', id:'serp.skin.bahar', level:4, name:'Ilma tal-Baħar',
      blurb:'Channel blue with a white crest. Looks calm. Is not.',
      preview:skinPv({ a:'#3FB8E8', b:'#1B6E96', head:'#BFF0FF' }) },
    { slot:'skin', id:'serp.skin.franka', level:9, name:'Franka',
      blurb:'Cut from the same limestone as every wall you are about to hit.',
      preview:skinPv({ a:'#E4CFA3', b:'#A88C5C', head:'#FFF6E2' }) },
    { slot:'skin', id:'serp.skin.luzzu', level:16, name:'Luzzu',
      blurb:'Red, blue and an eye on the front. The eye has seen this coming.',
      preview:skinPv({ a:'#F04B3C', b:'#1B4FA0', head:'#FFE9B0' }) },
    { slot:'skin', id:'serp.skin.lejl', level:25, name:'Wara Nofsillejl',
      blurb:'The colour an arena goes when nobody has mentioned the time in two hours.',
      preview:skinPv({ a:'#5C4FA8', b:'#2A2350', head:'#CFC4FF' }) },
    { slot:'skin', id:'serp.skin.festa', level:38, name:'Lejl tal-Festa',
      blurb:'Pink and gold and far too loud. The band is tuning up.',
      preview:skinPv({ a:'#FF6FD8', b:'#8A1F73', head:'#FFE1F6' }) },

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

    /* ── MALTESE SUMMER ── the same shelves, one shared tag, exactly
       the way js/poker-ui.js and js/dama.js tag theirs */
    { slot:'skin', id:'serp.skin.lampuk', level:5, set:'summer', name:'Lampuka',
      blurb:'Straight off the boat and still flashing gold. By Sunday it is a pie.',
      preview:skinPv({ a:'#FFD24D', b:'#C97A12', head:'#FFF3C7' }) },
    { slot:'trail', id:'serp.trail.bahar', level:11, set:'summer', name:'Ġebla fl-Ilma',
      blurb:'The wake off the back of a dgħajsa, held for half a second.',
      preview:trailPv('rgba(90,220,255,.65)') },
    { slot:'floor', id:'serp.floor.qiegh', level:18, set:'summer', name:'Qiegħ il-Baħar',
      blurb:'The bottom, seen through four metres of very clear water.',
      preview:floorPv({ a:'#0E2E44', b:'#04121C', line:'rgba(150,220,255,.07)' }) }
  ]);
  /* the reader in the game file caches; this is how it is told to stop */
  KIT.onChange(function(){
    try { if (R.kitChanged) R.kitChanged(); } catch (e){}
  });
}
boot(0);

})();
