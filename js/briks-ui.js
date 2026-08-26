/* ═══════════════════════════════════════════════════════════════════
   KARTI — briks-ui.js
   IL-ĦAJT — the screen. The rules live in js/briks.js
   (window.KARTI_BRIKS.engine); this file is the court, the clock, the
   thumb and the wire. It follows js/serp-ui.js's shape — engine and UI
   split down the middle, ONE <canvas> drawn at device-pixel-ratio, a
   fixed-tick rAF loop that interpolates between ticks, a themed menu
   with the rules folded shut at the bottom, and a back arrow that goes
   BACK — and shares SERP's honest online story: input-delay lockstep
   through the relay when the server knows the word, a full game against
   the machine when it does not.

   ── WHAT THIS FILE IS ──────────────────────────────────────────────
     · the shelf tile and the themed menu — how hard the machine is,
       with the RULES FOLDED SHUT at the bottom so starting is one tap
     · the court: a <canvas> the exact 240x380 aspect of the arena,
       YOUR paddle and wall always at the BOTTOM (the canvas is flipped
       for team 1 so "you" is always down here), the opponent opposite,
       the ball(s) rattling between, bricks with visible toughness,
       power-ups falling, the two scores
     · the thumb: a horizontal DRAG over the court's own control strip,
       one thumb, that slides your paddle along its lane. The strip is
       the bottom band of the court, UNDER the ball's playfield, so the
       thumb never covers the ball (asserted in the test, not eyeballed)
     · the clock: one requestAnimationFrame loop that steps the sim on a
       fixed 40Hz tick and interpolates the fixed-point ball for 60fps
     · the wire: input-delay lockstep — commit(tx, tick+D), relay via
       encWire/decWire, ready() stalls rather than inventing input

   ── WHY A CANVAS ───────────────────────────────────────────────────
     Up to six balls plus a paddle, a shield, falling drops and 64
     bricks, and the balls move EVERY FRAME because the interpolation is
     the whole point of it looking smooth. That is a DOM transform storm
     serp already argued its way out of; the same argument applies here.
     ONE canvas, sized on resize only (fitCanvas), the loop reading no
     layout at all.

   ── THE CONTROL SCHEME, AND WHY DRAG BEATS A PAD ───────────────────
     SERP is a grid: a four-way pad is right because a snake turns, it
     does not aim. IL-ĦAJT is the opposite — your paddle is a 1-D
     slider and WHERE on it the ball lands is the whole skill (the
     engine's paddleAngle maps contact offset to the rebound fan). A
     pad cannot express "a little left"; a drag can, continuously.

     So: a horizontal DRAG. Put your thumb anywhere in the control
     strip and the paddle's CENTRE tracks your thumb's x. Absolute, not
     relative — the engine's input is an absolute target x (see its
     header: absolute targets do not accumulate lag), so the paddle
     goes where your thumb is, and holding still for D ticks lands it
     exactly there.

     THE THUMB NEVER COVERS THE BALL. The court is drawn so the ball's
     playfield is the TOP portion and the drag strip is a dedicated band
     at the BOTTOM, in front of your own wall/paddle where your thumb
     already wants to be. The ball spends its life in the upper field;
     the paddle and the thumb share the bottom. They cannot overlap at
     any size this app supports, because the strip is laid out by the
     flexbox under the canvas and the canvas is a fixed aspect above it.
     Asserted in the test file.

   ── PREDICTED vs AUTHORITATIVE ─────────────────────────────────────
     The SIMULATION is lockstep and byte-identical on both phones: the
     ball reads only st.pads[i].x, which step() moves from committed
     inputs. But your own paddle SPRITE is drawn from ghost() — the
     engine's pure predictor that runs the same follow() forward over
     the targets you have already committed but the sim has not reached.
     It writes nothing, the ball never reads it, and when the sim
     arrives it lands exactly on the ghost's number. So your paddle
     feels attached to your thumb (no D-tick input lag on the sprite)
     while the world everybody simulates is never a guess. Offline this
     is still used — it makes the local paddle feel weightless the same
     way — and it is provably safe because ghost() is a read-only pure
     function of state.

   ── ONLINE, THE HONEST STATUS ──────────────────────────────────────
     Every wire piece is here and wired exactly like serp-ui:
     delayFor(RTT) → D, sample()/commit() files the target at tick N+D,
     encWire/decWire on the relay, ready() stalls the whole world for
     everyone rather than inventing a missing input. The ONE thing not
     in a UI file's gift is the server knowing the word "briks" — until
     one line is added to KARTI_MP.GAMES / the relay, no room opens, and
     canStart() says so in plain words. Until then IL-ĦAJT is you
     against the machine, complete.

   HOUSE RULES OBEYED
     · borrows #scr-party through KARTI_PARTY, injects its own scoped
       CSS once, never touches css/ or the tab bar;
     · no emoji, no image files for the game's own identity (CSS/SVG/
       canvas) — the ONE image door is the earned Arcade Ghost set,
       art/cosm/briks-exclusive-*.png, drawn in §GHOST below;
     · sounds only through KARTI_SFX ids that already exist;
     · every player-visible string is a T(en, mt) pair at its call site;
     · reduced motion turns off ball interpolation, the pulse and the
       hit flash, and the game stays completely playable;
     · the back arrow goes BACK. No "are you sure", no nav guard.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_BRIKS;
if (!K || !P || !R || !R.engine) return;

const E = R.engine;
const C = E.consts;
const esc = (K && K.esc) || (s => String(s == null ? '' : s));

/* HOW OFTEN AN ONLINE PHONE FILES + SHIPS ITS PADDLE TARGET, in sim ticks.
   This mirrors the engine's own BATCH_TICKS (js/briks.js): delayFor() already
   adds that many ticks to the input delay D "so a batched packet still lands
   ahead of use", so filing on this period can never outrun the watermark that
   ready() waits on. At 40Hz, 3 ticks is ~13 messages/second — comfortably
   under the relay's 25/s per-connection cap, where filing every tick (40/s)
   was not. Keep this <= the engine's BATCH_TICKS. */
const NET_BATCH_TICKS = 3;

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
   SOUND — existing ids only, through one gate. A paddle return happens
   a couple of times a second, so it is the quiet one; a wall breaking
   through and a round ending are the loud ones. A short throttle keeps
   a six-ball multi from turning into a machine-gun.
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

/* ── our corner of localStorage ──────────────────────────────────── */
const STORE = 'karti_briks_v1';
let ST = { v:1, pref:{}, rec:{ w:0, l:0, d:0 } };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object'){
    ST.pref = (j.pref && typeof j.pref === 'object') ? j.pref : {};
    ST.rec  = (j.rec  && typeof j.rec  === 'object') ? j.rec  : ST.rec;
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

/* ── UI-only preferences in their OWN key (serp's dock rule) ─────── */
const UIKEY = 'karti_briks_ui_v1';
let rulesOpen = false;
try { rulesOpen = localStorage.getItem(UIKEY + '.rules') === '1'; } catch(e){}

/* the machine, by the club's own three names, so a difficulty means
   one thing everywhere. The engine's AI[] index is 1..3. */
const LEVELS = [
  { level:1, name:'Gentle',   note:'Will miss things.' },
  { level:2, name:'Normal',   note:'Plays properly.' },
  { level:3, name:'Ruthless', note:'Plays to win.' }
];
function levelWords(k){
  if (k === 1) return { n:T('Gentle', 'Ħelu'),        i:T('Tracks the ball. No guessing.', 'Isegwi l-ballun. Bla tbassir.') };
  if (k === 3) return { n:T('Ruthless', 'Aħrax'),      i:T('Reads the bounce and aims for your gaps.', 'Jaqra r-rimbalz u jimmira lejn il-vojt tiegħek.') };
  return { n:T('Normal', 'Normali'), i:T('Plays a straight line. Misreads a side bounce.', 'Jilgħab dritt. Jiżbalja rimbalz mal-ġenb.') };
}

/* ── the two sides, by colour. Team 0 is always YOU on this phone and
   is always drawn at the bottom in the warm colour; the opponent is
   the cool colour opposite. (Which engine team you drive is M.me; the
   canvas flip below makes "you" always down here regardless.) ────── */
const TEAM = [
  { a:'#FFC542', b:'#8A5A0E', wall:'#E0932F', name:() => T('You', 'Int') },   /* down / you   */
  { a:'#5FC8FF', b:'#164C6E', wall:'#3E8FC4', name:() => T('Them', 'Huma') }  /* up / them    */
];
/* the seven power-ups, one glyph and colour each — drawn, never an image.
   Ids match the engine's PU map (1..7) so this is a plain index lookup. */
const PU_ART = {
  1: { c:'#FF6B8A', k:'multi',  n:() => T('Multi-ball','Aktar blalen') },   /* MULTI  */
  2: { c:'#3BE08A', k:'wide',   n:() => T('Wider','Usa\'') },               /* WIDE   */
  3: { c:'#57D6FF', k:'slow',   n:() => T('Slow','Bil-mod') },              /* SLOW   */
  4: { c:'#FFD54D', k:'sticky', n:() => T('Sticky','Taqbad') },             /* STICKY */
  5: { c:'#FF5A5A', k:'laser',  n:() => T('Laser','Lejżer') },              /* LASER  */
  6: { c:'#FF8A3D', k:'power',  n:() => T('Power ball','Ballun qawwi') },   /* POWER  */
  7: { c:'#C08BFF', k:'shield', n:() => T('Barrier','Ħarsien') }            /* SHIELD */
};

/* ═══════════════════════════════════════════════════════════════════
   THE ARCADE GHOST (briks.*.excl) — who glows violet on this court.
   The earned exclusive set (js/progress.js EXCLUSIVES.briks: paddle /
   ball / bricks, art/cosm/briks-exclusive-*.png). This is the ONE
   image door in this file — the house "no image files" rule is about
   game identity, and these are worn cosmetics, the same door every
   other arena game opened (bomba, serp, tankijiet).

   WHO OWNS WHAT — the same argument bomba and serp already settled:
     · the PADDLE is the PLAYER — it is the one thing on the court that
       IS you, so it TRAVELS: my equipped set goes out as a one-byte
       {t:'skin', p:1} action near match start (see onlineStart /
       onlineRemote). It reuses the DECLARED field `p`, so
       BK_WIRE_FIELDS does not grow, the l/h/g three-byte tick codec is
       untouched, and an older build's decWireX returns null on the
       unknown action and drops it whole — nothing ever reaches mp.js
       carrying a field the published contract has not named.
     · the BALL is the ROOM's — one shared object rattling between both
       walls, owned by nobody, so it stays the LOCAL choice: my
       equipped ball paints every ball on MY phone and nothing travels
       (serp's pellet, bomba's arena — the same rule).
     · the BRICKS are the ROOM's — the two walls are the arena
       furniture, so they too are the local choice and paint locally
       only. The team-coloured cap stays ON TOP of the texture so whose
       wall is whose (and each brick's remaining armour) reads exactly
       as before.

   All of it is DRAW-ONLY: nothing here is read by the engine, nothing
   rides a tick, and a phone that never loads the art (or never hears
   the skin byte) simply draws today's stock court.
   ═══════════════════════════════════════════════════════════════════ */
const COSM_SRC = {
  paddle: 'art/cosm/briks-exclusive-paddle.png',
  ball:   'art/cosm/briks-exclusive-ball.png',
  bricks: 'art/cosm/briks-exclusive-bricks.png'
};
const COSM_IMG = {};
/* an <img> per piece, started on first ask; null until DECODED, so a
   frame drawn before the art lands falls back to the stock paint. */
function cosmImg(slot){
  let im = COSM_IMG[slot];
  if (im === undefined){
    im = null;
    try { im = new Image(); im.src = COSM_SRC[slot]; } catch(e){ im = null; }
    COSM_IMG[slot] = im;
  }
  return (im && im.complete && im.naturalWidth > 0) ? im : null;
}
/* is MY briks.<slot>.excl equipped right now (progress.js is the shelf) */
function xEq(slot){
  try {
    const XP = window.KARTI_XP;
    return !!XP && XP.equipped(slot, 'briks') === 'briks.' + slot + '.excl';
  } catch(e){ return false; }
}
/* is the paddle at engine seat `pid` ghosted — mine by my own equip,
   a remote seat by the byte that arrived on its {t:'skin'} action. */
function ghostPad(pid){
  if (!M) return false;
  if (pid === M.me) return xEq('paddle');
  return !!(M.skins && M.skins[pid] === 1);
}

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party .bk-*
   The court is a fixed-aspect canvas at the top and the drag strip is
   the band under it, laid out by the FLEX BOX and never by script — so
   a rotation or a keyboard cannot land the thumb on top of the ball.
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS(){
  if (document.getElementById('bk-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'bk-runtime-css';
  st.textContent =
    '#scr-party .bk-host{display:flex;flex-direction:column;align-items:center;' +
      'justify-content:flex-start;gap:8px;min-height:0}' +

    /* ── the scores rail: two chips, repainted on CHANGE only ── */
    '#scr-party .bk-hud{flex:0 0 auto;display:flex;gap:8px;justify-content:center;' +
      'align-items:center;width:100%;padding:0 4px;box-sizing:border-box}' +
    '#scr-party .bk-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;' +
      'border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);' +
      'font:900 11px/1 var(--disp);letter-spacing:.06em;color:var(--dim)}' +
    '#scr-party .bk-chip .d{width:10px;height:10px;border-radius:3px;flex:0 0 auto}' +
    '#scr-party .bk-chip b{color:#fff;font-size:15px;min-width:16px;text-align:center}' +
    '#scr-party .bk-chip.me{background:rgba(255,197,66,.13);border-color:rgba(255,197,66,.38)}' +
    '#scr-party .bk-tgt{flex:0 0 auto;font:900 9px/1 var(--disp);letter-spacing:.1em;' +
      'color:rgba(255,255,255,.42);text-transform:uppercase}' +

    /* ── the court ── */
    '#scr-party .bk-court{position:relative;flex:0 0 auto;border-radius:14px;overflow:hidden;' +
      'border:2px solid rgba(0,0,0,.55);background:#0A0F16;' +
      'box-shadow:0 10px 26px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.05)}' +
    '#scr-party .bk-court canvas{display:block;width:100%;height:100%;touch-action:none;' +
      '-webkit-user-select:none;user-select:none}' +

    /* the countdown / banner over the canvas — transform+opacity only */
    '#scr-party .bk-over{position:absolute;inset:0;display:flex;align-items:center;' +
      'justify-content:center;pointer-events:none;z-index:4}' +
    '#scr-party .bk-cd{font:900 60px/1 var(--disp);color:#fff;letter-spacing:.02em;' +
      'text-shadow:0 4px 18px rgba(0,0,0,.8)}' +
    '#scr-party .bk-cd.go{font-size:38px;color:var(--gold,#FFC542)}' +
    '#scr-party .bk-flash{position:absolute;left:0;right:0;bottom:8px;text-align:center;' +
      'z-index:5;pointer-events:none;font:900 11px/1 var(--disp);letter-spacing:.08em;' +
      'text-transform:uppercase;color:var(--gold,#FFC542);opacity:0;transition:opacity .18s}' +
    '#scr-party .bk-flash.on{opacity:.92}' +
    'body.reduced #scr-party .bk-flash{transition:none}' +

    /* ── THE DRAG STRIP. Its own band, UNDER the court, never over the
       ball. A wide touch target; drag anywhere in it. ── */
    '#scr-party .bk-strip{flex:0 0 auto;width:100%;max-width:420px;height:62px;position:relative;' +
      'border-radius:13px;background:rgba(255,255,255,.05);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);touch-action:none;' +
      '-webkit-user-select:none;user-select:none;overflow:hidden}' +
    '#scr-party .bk-strip .bk-knob{position:absolute;top:8px;bottom:8px;width:52px;' +
      'border-radius:9px;background:linear-gradient(180deg,#FFD873,#C88A18);' +
      'box-shadow:0 2px 8px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.5);' +
      'transform:translateX(-50%);left:50%;will-change:left;' +
      'transition:box-shadow .12s ease,filter .12s ease}' +
    '#scr-party .bk-strip.pressed .bk-knob{filter:brightness(1.12);' +
      'box-shadow:0 0 0 2px rgba(255,233,176,.55),0 3px 14px rgba(255,197,66,.5),' +
      'inset 0 1px 0 rgba(255,255,255,.6)}' +
    'body.reduced #scr-party .bk-strip .bk-knob{transition:none}' +
    '#scr-party .bk-strip .bk-hint{position:absolute;inset:0;display:flex;align-items:center;' +
      'justify-content:center;font:900 10px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.34);pointer-events:none}' +
    '#scr-party .bk-strip.touched .bk-hint{opacity:0}' +
    '@media (max-height:680px){#scr-party .bk-strip{height:52px}}' +
    '@media (max-height:460px){#scr-party .bk-strip{height:46px}}' +

    /* ── the rules: a panel that HIDES AND SLIDES, poker's exactly ── */
    '#scr-party .bk-rules{position:absolute;top:0;left:0;right:0;z-index:30;max-height:70%;' +
      'display:flex;flex-direction:column;background:rgba(12,14,22,.97);' +
      'border-bottom:1px solid rgba(255,255,255,.12);border-radius:0 0 16px 16px;' +
      'box-shadow:0 14px 34px rgba(0,0,0,.6);transform:translateY(-102%);opacity:0;' +
      'visibility:hidden;pointer-events:none;' +
      'transition:transform .3s var(--ease),opacity .3s var(--ease),visibility 0s .3s}' +
    '#scr-party .bk-rules.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .3s var(--ease),opacity .3s var(--ease),visibility 0s 0s}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .bk-rules{transition:none}}' +
    'body.reduced #scr-party .bk-rules{transition:none}' +
    '#scr-party .bk-rules-h{flex:0 0 auto;display:flex;align-items:center;' +
      'justify-content:space-between;gap:8px;padding:10px 14px 6px}' +
    '#scr-party .bk-rules-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--gold,#FFC542)}' +
    '#scr-party .bk-rules-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;' +
      'color:var(--dim);display:flex;align-items:center;justify-content:center}' +
    '#scr-party .bk-rules-x svg{width:16px;height:16px;stroke:currentColor;fill:none;' +
      'stroke-width:2.2;stroke-linecap:round}' +
    '#scr-party .bk-rules-b{min-height:0;overflow-y:auto;padding:2px 14px 14px;' +
      '-webkit-overflow-scrolling:touch}' +
    '#scr-party .bk-rules-b ul{margin:0;padding:0}' +
    '#scr-party .bk-rules-b li{font-size:12px;line-height:1.6;color:var(--dim);' +
      'list-style:none;margin:0 0 7px;padding:0 0 0 13px;position:relative}' +
    '#scr-party .bk-rules-b li:before{content:"";position:absolute;left:0;top:7px;width:5px;' +
      'height:5px;border-radius:2px;background:var(--gold,#FFC542);opacity:.75}' +
    '#scr-party .bk-rules-b b{color:#fff}' +

    /* ── the menu, poker/serp chrome ── */
    '#scr-party .bk-menu .bk-hero{position:relative;display:flex;align-items:center;' +
      'justify-content:center;height:120px;margin:2px 0 12px;border-radius:16px;overflow:hidden;' +
      'background:radial-gradient(120% 90% at 50% 30%,#243a52 0%,#111a26 55%,#070C12 100%);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),inset 0 -16px 30px rgba(0,0,0,.45)}' +
    '#scr-party .bk-menu .bk-hero canvas{display:block}' +
    '#scr-party .bk-menu .bk-hero-cap{position:absolute;right:10px;bottom:8px;' +
      'font:900 10px/1 var(--disp);letter-spacing:.12em;color:rgba(255,255,255,.42)}' +
    '@media (max-height:520px){#scr-party .bk-menu .bk-hero{height:92px}}' +

    /* the fold at the bottom of the menu — serp's bk-fold */
    '#scr-party .bk-fold-h{width:100%;display:flex;align-items:center;justify-content:space-between;' +
      'gap:8px;padding:12px 2px;border:0;background:none;color:#fff;text-align:left}' +
    '#scr-party .bk-fold-h b{font:900 11px/1.3 var(--disp);letter-spacing:.06em;' +
      'text-transform:uppercase}' +
    '#scr-party .bk-fold-h i{font:900 9px/1 var(--disp);letter-spacing:.1em;color:var(--dim);' +
      'font-style:normal;flex:0 0 auto}' +
    '#scr-party .bk-fold-b{display:grid;grid-template-rows:0fr;' +
      'transition:grid-template-rows .28s var(--ease)}' +
    '#scr-party .bk-fold-b.open{grid-template-rows:1fr}' +
    '#scr-party .bk-fold-i{overflow:hidden;min-height:0}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .bk-fold-b{transition:none}}' +
    'body.reduced #scr-party .bk-fold-b{transition:none}' +
    '#scr-party .bk-fold-c li{font-size:12px;line-height:1.6;color:var(--dim);list-style:none;' +
      'margin:0 0 7px;padding:0 0 0 13px;position:relative}' +
    '#scr-party .bk-fold-c li:before{content:"";position:absolute;left:0;top:7px;width:5px;' +
      'height:5px;border-radius:2px;background:var(--gold,#FFC542);opacity:.75}' +
    '#scr-party .bk-fold-c b{color:#fff}' +

    /* ── the ENTRY screen: a few big choices, nothing else. PLAY ONLINE
       on top and emphasised; PLAY WITH AI below; RULES opens the slide-
       up. No settings on this screen — they come after a mode. ── */
    '#scr-party .bk-modes{display:flex;flex-direction:column;gap:12px;margin:8px 0 4px}' +
    '#scr-party .bk-mode{position:relative;display:flex;flex-direction:column;align-items:flex-start;' +
      'gap:3px;width:100%;min-height:66px;padding:14px 16px;border:0;border-radius:16px;' +
      'text-align:left;color:#fff;background:rgba(255,255,255,.06);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}' +
    '#scr-party .bk-mode b{font:900 16px/1.1 var(--disp);letter-spacing:.02em}' +
    '#scr-party .bk-mode i{font:600 11px/1.3 var(--disp);font-style:normal;color:var(--dim)}' +
    '#scr-party .bk-mode.primary{background:linear-gradient(135deg,#FFD873,#E0932F);color:#241500;' +
      'box-shadow:0 10px 24px rgba(224,147,47,.35),inset 0 1px 0 rgba(255,255,255,.4)}' +
    '#scr-party .bk-mode.primary i{color:rgba(40,22,0,.72)}' +
    '#scr-party .bk-mode .bk-badge{position:absolute;top:12px;right:14px;font:900 9px/1 var(--disp);' +
      'letter-spacing:.1em;text-transform:uppercase;color:rgba(40,22,0,.62)}' +
    '#scr-party .bk-mode.ghost .bk-badge{color:rgba(255,255,255,.4)}' +

    /* the RULES button on the entry screen — quiet, opens the slide-up */
    '#scr-party .bk-rulesbtn{width:100%;margin-top:14px;min-height:48px;border:0;border-radius:14px;' +
      'background:rgba(255,255,255,.05);color:#fff;font:900 12px/1 var(--disp);letter-spacing:.06em;' +
      'text-transform:uppercase;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);' +
      'display:flex;align-items:center;justify-content:center;gap:8px}' +
    '#scr-party .bk-rulesbtn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2}' +

    /* the AI difficulty step — a small, tidy sheet AFTER choosing AI */
    '#scr-party .bk-diff{display:flex;flex-direction:column;gap:10px;margin:6px 0 4px}' +

    /* the menu-level rules sheet: same slide-up as in the court */
    '#scr-party .bk-msheet{position:fixed;left:0;right:0;bottom:0;z-index:60;max-height:80%;' +
      'display:flex;flex-direction:column;background:rgba(12,14,22,.98);' +
      'border-top:1px solid rgba(255,255,255,.12);border-radius:18px 18px 0 0;' +
      'box-shadow:0 -14px 34px rgba(0,0,0,.6);transform:translateY(102%);' +
      'transition:transform .3s var(--ease)}' +
    '#scr-party .bk-msheet.open{transform:none}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .bk-msheet{transition:none}}' +
    'body.reduced #scr-party .bk-msheet{transition:none}' +
    '#scr-party .bk-msheet-h{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;' +
      'gap:8px;padding:12px 16px 6px}' +
    '#scr-party .bk-msheet-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--gold,#FFC542)}' +
    '#scr-party .bk-msheet-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;' +
      'color:var(--dim);display:flex;align-items:center;justify-content:center}' +
    '#scr-party .bk-msheet-x svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.2}' +
    '#scr-party .bk-msheet-b{min-height:0;overflow-y:auto;padding:2px 16px 22px}' +
    '#scr-party .bk-msheet-b li{font-size:12.5px;line-height:1.65;color:var(--dim);list-style:none;' +
      'margin:0 0 8px;padding:0 0 0 14px;position:relative}' +
    '#scr-party .bk-msheet-b li:before{content:"";position:absolute;left:0;top:7px;width:5px;height:5px;' +
      'border-radius:2px;background:var(--gold,#FFC542);opacity:.75}' +
    '#scr-party .bk-msheet-b b{color:#fff}' +
    '#scr-party .bk-scrim{position:fixed;inset:0;z-index:59;background:rgba(0,0,0,.5);opacity:0;' +
      'visibility:hidden;transition:opacity .3s var(--ease),visibility 0s .3s}' +
    '#scr-party .bk-scrim.open{opacity:1;visibility:visible;transition:opacity .3s var(--ease),visibility 0s 0s}';
  document.head.appendChild(st);
}

/* ── the shelf mark. One symbol, injected once (serp's sprite is the
   reference). A little brick wall with a ball. ─────────────────────── */
function injectDefs(){
  if (document.getElementById('bk-defs') || !document.body) return;
  const d = document.createElement('div');
  d.id = 'bk-defs';
  d.setAttribute('aria-hidden', 'true');
  d.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  d.innerHTML =
    '<svg width="0" height="0" focusable="false">' +
    '<symbol id="bk-t-briks" viewBox="0 0 24 24">' +
      '<rect x="3.5" y="14.5" width="7" height="4" rx="1" fill="none" stroke="currentColor" ' +
        'stroke-width="1.8"/>' +
      '<rect x="11.5" y="14.5" width="9" height="4" rx="1" fill="none" stroke="currentColor" ' +
        'stroke-width="1.8"/>' +
      '<rect x="6.5" y="19.5" width="11" height="3.2" rx="1" fill="none" stroke="currentColor" ' +
        'stroke-width="1.8"/>' +
      '<circle cx="15" cy="7" r="2.4" fill="currentColor"/>' +
      '<path d="M5 9.5h6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
    '</symbol></svg>';
  document.body.appendChild(d);
}

/* ═══════════════════════════════════════════════════════════════════
   THE RUNNER — M is the whole live game. Exactly one; leave() is the
   only way out.
   ═══════════════════════════════════════════════════════════════════ */
let M = null;
let UI = null;
const moveSubs = [];

/* ── JUICE: particles + ball trails, purely cosmetic and OUTSIDE the sim.
   Spawned from engine EVENTS (which are deterministic) but the particle
   motion uses Math.random / time freely — it never touches state, never
   feeds back into a tick, and is skipped entirely under reduced motion. ── */
let PARTS = [];                      /* {x,y,vx,vy,born,life,c,r} in arena u */
const PART_MAX = 220;
function spawnBurst(x, y, colour, n, spread, big){
  if (noMotion()) return;
  const now = nowMs();
  for (let i = 0; i < n; i++){
    const a = Math.random() * 6.2832;
    const sp = (0.3 + Math.random()) * spread;
    PARTS.push({ x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      born: now, life: (big ? 520 : 360) + Math.random() * 220,
      c: colour, r: C.S * (big ? 1.5 : 1.0) * (0.6 + Math.random() * 0.7) });
  }
  if (PARTS.length > PART_MAX) PARTS.splice(0, PARTS.length - PART_MAX);
}
function drawParticles(g, now){
  if (noMotion()){ PARTS.length = 0; return; }
  for (let i = PARTS.length - 1; i >= 0; i--){
    const p = PARTS[i];
    const age = now - p.born;
    if (age >= p.life){ PARTS.splice(i, 1); continue; }
    const t = age / p.life;
    const x = p.x + p.vx * age * 0.06;
    const y = p.y + p.vy * age * 0.06 + 0.0009 * age * age;   /* a little gravity */
    g.globalAlpha = (1 - t) * 0.9;
    g.fillStyle = p.c;
    g.beginPath(); g.arc(x, y, p.r * (1 - t * 0.5), 0, 6.2832); g.fill();
  }
  g.globalAlpha = 1;
}
function fire(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }

function newSeed(){ return (Math.random() * 0x7FFFFFFF) | 0; }
const nowMs = () => (typeof performance !== 'undefined' && performance.now)
                      ? performance.now() : Date.now();

const STEP_MS = C.TICK_MS;            /* 25ms — the engine's tick        */
const LEAD_MS = 2200;                 /* three beats and a GO            */

/* start a fresh match state. `net` is null offline. */
function startMatch(opts, seed, net){
  stopLoop();
  const o = Object.assign({ lvl:2 }, opts || {});
  const sd = (seed == null ? newSeed() : seed) | 0;
  M = {
    opts: o,
    seed: sd,
    st: null,
    cv: null, g2: null,
    net: net || null,
    me: 0,                    /* which ENGINE team this phone drives      */
    down: 0,                  /* which team is drawn at the bottom (=me)  */
    meta: [],
    D: 3,                     /* input-delay ticks; delayFor() maintains  */
    t0: 0, tick: 0,
    thumbX: null,             /* last committed absolute target (subunits)*/
    ghostX: null,             /* the predicted local paddle x, for draw   */
    renderX: null,            /* render-eased own paddle x (60fps, smooth)*/
    lastForTick: 0,           /* last tick we filed a target for          */
    lastFiled: null,          /* sim tick we last FILED on (net batching) */
    prev: null,               /* snapshot of ball positions last tick     */
    prevPad: null,            /* snapshot of paddle x last tick (opponent)*/
    lastFrameMs: 0,           /* wall time of the last draw, for easing   */
    raf: 0, dead: false, finished: false,
    fps: { n:0, at:0, val:0 },
    lead: LEAD_MS, ledSaid: -1,
    scoreSaid: [-1, -1],
    skins: {}                 /* seat → exclusive-set wire byte (§GHOST)  */
  };
  M.st = E.start({ seed: sd, target: C.TARGET, bestOf: 1,
                   bots: (o.bots || [0, 1]).slice(),
                   aiLvl: [o.lvl || 2, o.lvl || 2] });
  /* reset all draw-only juice so a fresh match starts clean */
  PARTS = []; BOUNCE = {}; PAD_SQUASH = [0, 0]; SERVE_T = 0;
  LAST_VSIGN = {}; PRESS = { on:false, x:0, t0:0 };
  return M;
}

/* THE WARMUP SEED. A committed input is filed for tick N+D, so the first
   D ticks have no human input at or before them and ready() would stall
   the world before it started. Fill every human seat's parked target for
   ticks 0..D so the opening D ticks resolve. Every phone does the exact
   same fill (the parked centre is deterministic), so it is desync-safe:
   it is the same "hold still at the start" input on both sides. */
function seedInputs(){
  if (!M || !M.st) return;
  /* ONLINE THE HORIZON IS FIXED, NOT M.D. M.D is measured from THIS
     phone's RTT, so two phones prefill different windows — and then a
     real input filed for a tick inside the LONGER window was refused on
     one phone (already prefilled) but accepted on the other: a desync in
     the first half-second. D_MAX is the same constant on every phone, so
     the refusal window is identical everywhere. Offline the local D is
     fine (there is nobody to disagree with). */
  const horizon = (M.net ? C.D_MAX : M.D) + 1;
  for (const p of M.st.pads){
    if (p.bot) continue;
    const parked = p.x;
    for (let t = 0; t <= horizon; t++) E.commit(M.st, p.pid, t, parked);
  }
}

/* the previous-tick ball table, keyed by ball id, so draw() can
   interpolate a fixed-point position to 60fps. Rebuilt each doTick. */
function snapBalls(){
  const m = {};
  for (const b of M.st.balls) m[b.id] = { x:b.x, y:b.y };
  return m;
}
/* the previous-tick paddle x per pid, so the OPPONENT paddle interpolates
   the same way the ball does (its authoritative x steps at 40Hz; drawing
   lerp(prev,now,frac) shows a smooth 60fps slab). YOUR paddle does not use
   this — it is drawn from the render-eased ghost, which is even smoother. */
function snapPads(){
  const m = {};
  for (const p of M.st.pads) m[p.pid] = p.x;
  return m;
}

/* ═══════════════════════════════════════════════════════════════════
   THE ONLINE CLOCK OFFSET (serp's floor+jitter, folded to what a
   lockstep game actually needs). delayFor() from the engine turns the
   measured RTT into D; we re-measure it periodically so a session that
   gets worse widens the input delay rather than stalling.
   ═══════════════════════════════════════════════════════════════════ */
function measureD(){
  if (!M || !M.net) return;
  let rtt = 100;
  try {
    const MPX = window.KARTI_MP;
    if (MPX && MPX.pingStats){
      const s = MPX.pingStats();
      /* the median-ish trip: best plus a bit of the spread, in ms */
      if (s && s.best != null){
        const jit = (s.worst != null) ? Math.max(0, s.worst - s.best) : 0;
        rtt = s.best + jit * 0.5;
      }
    } else if (MPX && MPX.measure){ MPX.measure(); }
  } catch(e){}
  const d = E.delayFor(rtt | 0);
  /* never SHRINK D mid-round (a smaller D would file a target for a tick
     that may already be committed) — only grow it. */
  M.D = M.net ? Math.max(M.D, d) : d;
}

/* ═══════════════════════════════════════════════════════════════════
   THE CLOCK — one rAF loop. Steps the sim on a fixed 40Hz tick derived
   from wall time (never one step per frame) and draws once, with the
   ball interpolated between ticks. A backgrounded tab that comes back
   owing a hundred steps skips forward rather than fast-simulating.
   ═══════════════════════════════════════════════════════════════════ */
const MAX_CATCHUP = 6;

function stopLoop(){ if (M && M.raf){ cancelAnimationFrame(M.raf); M.raf = 0; } }
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
  const now = (t == null) ? nowMs() : t;

  /* the countdown, before tick 1 */
  if (now < M.t0){
    const left = M.t0 - now;
    const beat = Math.ceil(left / 800);
    if (beat !== M.ledSaid){
      M.ledSaid = beat;
      const S = window.KARTI_SFX;
      if (S && S.note){ try { S.note(4 - beat); } catch(e){} }
      paintCountdown(beat);
    }
    draw(0);
    meter(now);
    return;
  }
  if (M.ledSaid !== 0){
    M.ledSaid = 0;
    paintCountdown(0);
    cue('game.start', { gain:0.8 }, true);
  }

  const want = Math.floor((now - M.t0) / STEP_MS) + 1;
  if (want - M.tick > MAX_CATCHUP){
    M.t0 = now - (M.tick * STEP_MS);
  } else {
    let guard = 0;
    while (M.tick < want && guard++ < MAX_CATCHUP){ if (!doTick()) break; }
  }

  const frac = Math.max(0, Math.min(1, (now - M.t0) / STEP_MS - (M.tick - 1)));
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
   ONE TICK
     1. file the local thumb target for tick+D (commit), so it is on the
        wire before the far phone needs it. Offline this is instant.
     2. if the world is not ready() (an input is late) HOLD — return
        false and let the clock try again next frame. Nobody is guessed.
     3. step() the engine one tick. It moves paddles from committed
        targets (or the machine), sweeps the balls, and raises events.
     4. read the events for sound and the score.
     5. remember the ball positions for interpolation.
   ═══════════════════════════════════════════════════════════════════ */
function doTick(){
  const st = M.st;

  /* 1 — file our input for a future tick. Absolute targets are forgiving of
     a dropped batch (engine header) and the engine HOLDS THE LAST one for
     any tick nothing was filed for, so a target does not need filing every
     single tick.

     ONLINE WE FILE ONCE EVERY BATCH TICKS, WHICH IS WHAT THE ENGINE ALREADY
     BUDGETS FOR. js/briks.js defines BATCH_TICKS = 3 ("inputs sent in 3s")
     and delayFor() ADDS it to D expressly "so a batched packet still lands
     ahead of use" — but this screen never batched: it filed and shipped on
     EVERY tick, which at 40Hz is 40 messages/second from one phone against
     the relay's 25/s PER-CONNECTION cap (server L.MSG_RATE). The relay
     therefore refused a steady fraction of them, peers waited on an input
     that never came, and the table hitched. At one send per 3 ticks it is
     ~13/s — inside the cap with room to spare.

     THE COMMIT AND THE SEND ARE GATED TOGETHER, deliberately: if this phone
     filed a target every tick but only shipped every third, its own sim
     would run on a finer input timeline than its peer's copy of the same
     seat and the two would drift apart. Same schedule = same inputs =
     same world. Offline there is no wire, so nothing is skipped. */
  const tx = (M.thumbX == null) ? st.pads[M.me].x : M.thumbX;
  const forTick = st.tick + M.D;
  const batch = M.net ? NET_BATCH_TICKS : 1;
  const due = (M.lastFiled == null) || ((st.tick - M.lastFiled) >= batch);
  let committed = false;
  if (due){
    committed = E.commit(st, M.me, forTick, tx);
    M.lastFiled = st.tick;
    M.lastForTick = forTick;
    if (M.net && committed){
      /* travel it — but ONLY an input the local sim actually took. A commit
         the engine refused (a tick already filed, e.g. inside the warmup
         prefill) must not reach the other phone, or it applies there what
         was rejected here and the two sims split. mp.js carries the same
         {seat,move} shape serp uses. */
      say(M.me, { t:'tx', forTick: forTick, tx: tx });
    }
  }

  /* 2 — is the world resolved for the tick we are about to run? Offline
     the only human is us and we just committed, so ready() is always
     true. Online, a missing remote input stalls everybody — a hitch,
     never a desync. */
  if (!E.ready(st)) return false;

  /* 3 — the authoritative step. */
  M.prev = snapBalls();
  M.prevPad = snapPads();
  const before = st.balls.length;
  E.step(st);
  M.tick = st.tick;

  /* 4 — events → sound + score. The engine writes ids, we own the noise. */
  reactEvents(st.ev || [], before);
  detectWallBounce();
  syncScore();

  /* 5 — end? */
  if (!M.finished && st.over){ finish(); return false; }
  return true;
}

/* map engine event ids to sound. Existing sfx ids only. */
function reactEvents(evs, ballsBefore){
  let paddle = false, crack = false, smash = false, through = false, pu = false,
      crumble = false, laser = false, sticky = false, serve = false;
  for (const e of evs){
    if (!e || !e.id) continue;
    switch (e.id){
      case 'ev.paddle': case 'ev.edge':
        paddle = true;
        /* a small spark off the struck paddle + a SQUASH on the struck slab and
           a BOUNCE FLASH on the ball nearest that face — pure draw state. */
        if (e.pid != null && M.st.pads[e.pid]){
          const p = M.st.pads[e.pid];
          const fy = p.side === 0 ? C.PAD_Y0[0] : C.PAD_Y1[1];
          spawnBurst(p.x, fy, TEAM[e.pid === M.me ? 0 : 1].a, 6, 36, false);
          punchPaddle(e.pid);
          flashNearestBall(p.x, fy);
        }
        break;
      case 'ev.brick':
        crack = true;
        if (e.side != null){ brickBurst(e, 5, false); flashBrickBall(e); }
        break;
      case 'ev.broke':
        smash = true;
        brickBurst(e, e.smash ? 16 : 10, !!e.smash);
        flashBrickBall(e);
        break;
      case 'ev.through':
        through = true;
        flash(sideIsMine(e.side)
          ? T('They broke through!', 'Qasmu n-naħa tiegħek!')
          : T('Through!', 'Għadda!'));
        break;
      case 'ev.catch':
        pu = true;
        pickupJuice(e.pid, e.pu);
        break;
      case 'ev.catch2': sticky = true; break;
      case 'ev.laser':  laser = true; break;
      case 'ev.shield': paddle = true; break;
      case 'ev.crumble': crumble = true; break;
      case 'ev.serve':  serve = true; serveFlourish(); break;
    }
  }
  if (serve)   cue('sea.whistle', { gain:0.6 }, true);   /* "ball in play" whistle */
  if (paddle && !smash) cue('duel.hit', { gain:0.4 });
  if (sticky)  cue('piece.place', { gain:0.5 });
  if (laser)   cue('sea.sonar', { gain:0.3 });
  if (crack)   cue('dama.jump', { gain:0.4 });
  if (smash)   cue('sea.sink', { gain:0.6 }, true);
  if (through) cue('sea.horn', { gain:0.7 }, true);
  if (pu)      cue('ui.reward', { gain:0.55 }, true);
  if (crumble) cue('ui.sheet', { gain:0.5 });
}

/* ═══════════════════════════════════════════════════════════════════
   BALL / PADDLE JUICE STATE — all DRAW-ONLY, keyed by wall-clock time.
   None of it is ever read by the engine or fed back into a tick; it is
   spawned from deterministic engine EVENTS but its own motion/decay uses
   time freely, and it is skipped whole under reduced motion. The ball's
   authoritative path is byte-identical with or without any of this.
   ═══════════════════════════════════════════════════════════════════ */
/* per-ball bounce pulse: {t0, dirx, diry} — a squash-and-stretch + flash
   whose axis is the surface normal the ball just bounced off. */
let BOUNCE = {};                     /* ballId -> {t0, nx, ny, big} */
let PAD_SQUASH = [0, 0];             /* pid -> wall-clock ms of last punch */
let SERVE_T = 0;                     /* wall-clock ms of the last serve      */
let PRESS = { on:false, x:0, t0:0 }; /* the finger-press glow on the strip   */
const BOUNCE_MS = 200, SQUASH_MS = 150, SERVE_MS = 620;

function bounceBall(id, nx, ny, big){
  if (noMotion()) return;
  BOUNCE[id] = { t0: nowMs(), nx, ny, big: !!big };
}
/* flash the ball closest to a paddle face (a paddle return). */
function flashNearestBall(fx, fy){
  if (noMotion() || !M.st) return;
  let best = null, bd = 1e18;
  for (const b of M.st.balls){
    const dx = b.x - fx, dy = b.y - fy, d = dx*dx + dy*dy;
    if (d < bd){ bd = d; best = b; }
  }
  if (best){
    /* normal points away from the face along y (the paddle bounce axis) */
    bounceBall(best.id, 0, 1, true);
  }
}
/* flash the ball nearest a struck brick (the bounce off a brick). */
function flashBrickBall(e){
  if (noMotion() || !M.st) return;
  let cx, cy;
  try { const bb = E.brickBox(e.side, e.r, e.c); cx = (bb.x0 + bb.x1) / 2; cy = (bb.y0 + bb.y1) / 2; }
  catch(err){ return; }
  let best = null, bd = 1e18;
  for (const b of M.st.balls){
    const dx = b.x - cx, dy = b.y - cy, d = dx*dx + dy*dy;
    if (d < bd){ bd = d; best = b; }
  }
  if (best){
    const dx = best.x - cx, dy = best.y - cy;
    const ax = Math.abs(dx) >= Math.abs(dy);
    bounceBall(best.id, ax ? 1 : 0, ax ? 0 : 1, false);
  }
}
function punchPaddle(pid){ if (!noMotion()) PAD_SQUASH[pid] = nowMs(); }
function serveFlourish(){ if (!noMotion()) SERVE_T = nowMs(); }

/* WALL-BOUNCE detection — the engine emits no event for a side/back wall
   bounce, so we read it off the ball's own authoritative velocity: a sign
   flip in vx is a side wall (or a brick side); a downward→upward vy flip at
   the field edge is a back wall. DRAW/AUDIO ONLY — it inspects state, never
   writes it. We remember each ball's last velocity sign between ticks. */
let LAST_VSIGN = {};
function detectWallBounce(){
  if (!M || !M.st) return;
  let sideBounce = false;
  const cur = {};
  for (const b of M.st.balls){
    if (b.stuck){ cur[b.id] = LAST_VSIGN[b.id] || {sx:0}; continue; }
    let vx = 0;
    try { const v = E.velOf(b.di, b.sp); vx = v[0]; } catch(e){}
    const sx = vx > 0 ? 1 : vx < 0 ? -1 : 0;
    const prev = LAST_VSIGN[b.id];
    /* a horizontal reversal while the ball is near a side wall = a wall tick */
    if (prev && prev.sx !== 0 && sx !== 0 && prev.sx !== sx){
      const nearWall = b.x < C.W * 0.16 || b.x > C.W * 0.84;
      if (nearWall){ sideBounce = true; bounceBall(b.id, 1, 0, false); }
    }
    cur[b.id] = { sx };
  }
  LAST_VSIGN = cur;
  if (sideBounce) cue('piece.slide', { gain:0.3 });
}

/* a coloured burst at a brick's centre. */
function brickBurst(e, n, big){
  try {
    const bb = E.brickBox(e.side, e.r, e.c);
    const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
    const mine = (e.side === M.me);
    spawnBurst(cx, cy, mine ? TEAM[0].a : TEAM[1].a, n, big ? 70 : 44, big);
    if (big) spawnBurst(cx, cy, '#fff', 6, 60, true);
  } catch(err){}
}
/* a bright pickup pop at the paddle that caught a power-up + a banner. */
function pickupJuice(pid, kind){
  const art = PU_ART[kind] || PU_ART[1];
  try {
    if (pid != null && M.st.pads[pid]){
      const p = M.st.pads[pid];
      const fy = p.side === 0 ? C.PAD_Y0[0] : C.PAD_Y1[1];
      spawnBurst(p.x, fy, art.c, 18, 66, true);
    }
  } catch(err){}
  /* only announce MY own pickups on the flash line, so it stays useful */
  if (pid === M.me && art.n) flash(art.n());
}

/* the score rail is DOM and repainted on CHANGE only. */
function syncScore(){
  const s = M.st.score;
  if (s[0] !== M.scoreSaid[0] || s[1] !== M.scoreSaid[1]){
    M.scoreSaid = [s[0], s[1]];
    hud();
  }
}

/* is engine `side` the wall THIS phone defends? side maps 1:1 to team. */
function sideIsMine(side){ return side === M.me; }

/* ═══════════════════════════════════════════════════════════════════
   THE CANVAS
   fitCanvas() is the ONLY layout read in the file; it runs on mount and
   on resize, never in the frame loop. The backing store is device
   pixels; the loop draws in ARENA units through one transform, so
   nothing per frame asks the browser to measure anything.

   THE FLIP: the engine always defends team 0 at the BOTTOM. This phone
   drives M.me. If M.me is 1 we FLIP the canvas vertically (and mirror
   x, since the arena is point-symmetric) so that "you" is always drawn
   at the bottom, under your thumb. Purely a draw transform — the sim is
   untouched, both phones simulate the identical world.
   ═══════════════════════════════════════════════════════════════════ */
const ASPECT = C.W / C.H;             /* 240/380 ≈ 0.63 : a tall court   */

function fitCanvas(){
  if (!UI || !UI.cv || !UI.court) return;
  const host = UI.host;
  const stripH = UI.strip ? UI.strip.offsetHeight : 60;
  const hudH   = UI.hud ? UI.hud.offsetHeight : 26;
  const availW = Math.max(140, host.clientWidth - 6);
  const availH = Math.max(160, host.clientHeight - stripH - hudH - 24);
  /* the court keeps the arena's tall aspect and is the biggest such box
     that fits the slack. */
  let w = availW, h = w / ASPECT;
  if (h > availH){ h = availH; w = h * ASPECT; }
  w = Math.floor(w); h = Math.floor(h);

  UI.court.style.width = w + 'px';
  UI.court.style.height = h + 'px';
  UI.vw = w; UI.vh = h;

  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const px = Math.round(w * dpr), py = Math.round(h * dpr);
  if (UI.cv.width !== px || UI.cv.height !== py){ UI.cv.width = px; UI.cv.height = py; }
  UI.dpr = dpr;
  /* scale from ARENA subunits → CSS pixels, folding in the DPR. */
  UI.scale = w / C.W;
  if (UI.strip) UI.strip.style.maxWidth = w + 'px';
  clampRules();
}

/* arena→css helpers, honouring the flip. AX/AY take engine subunits. */
function ax(x){ return M.down === 0 ? x : (C.W - x); }
function ay(y){ return M.down === 0 ? y : (C.H - y); }

/* ── draw one frame. `f` is 0..1 between the previous tick and now, for
   the ball only (paddles use the predictive ghost / the authoritative x
   which already look right). ──────────────────────────────────────── */
function draw(f){
  if (!UI || !UI.g2) return;
  const g = UI.g2, st = M.st;
  const dpr = UI.dpr, s = UI.scale * dpr;
  const now = nowMs();

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, UI.cv.width, UI.cv.height);
  /* one transform: subunits → device px, with the flip baked in. */
  if (M.down === 0) g.setTransform(s, 0, 0, s, 0, 0);
  else              g.setTransform(-s, 0, 0, -s, C.W * s, C.H * s);

  drawCourt(g);
  drawWalls(g, st);
  drawShields(g, st);
  drawBolts(g, st, f);
  drawDrops(g, st, now);
  drawTrails(g, st, f, now);
  drawBalls(g, st, f, now);
  drawPaddles(g, st, f, now);
  drawParticles(g, now);
  syncKnob();
}

/* keep the strip knob under the paddle, so the strip is a live tactile map
   of where your slab is (not a dead decoration). A single style write per
   frame, only when the fraction actually changed. Draw-only. */
function syncKnob(){
  if (!UI || !UI.knob) return;
  const p = M.st.pads[M.me]; if (!p) return;
  const drawX = (M.ghostX != null) ? M.ghostX : p.x;
  const { lo, hi } = laneRange();
  let fr = (drawX - lo) / Math.max(1, hi - lo);
  fr = Math.max(0, Math.min(1, M.down === 0 ? fr : (1 - fr)));
  const pct = (fr * 100).toFixed(1) + '%';
  if (UI._knobPct !== pct){ UI._knobPct = pct; UI.knob.style.left = pct; }
}

/* the floor: a faint centre line and a soft vignette, painted every
   frame (cheap: a rect and a line). */
function drawCourt(g){
  g.fillStyle = '#0A0F16';
  g.fillRect(0, 0, C.W, C.H);
  /* the halfway line */
  g.strokeStyle = 'rgba(255,255,255,.05)';
  g.lineWidth = C.S * 0.4;
  g.beginPath(); g.moveTo(0, C.H / 2); g.lineTo(C.W, C.H / 2); g.stroke();
  /* a dot at centre */
  g.fillStyle = 'rgba(255,255,255,.05)';
  g.beginPath(); g.arc(C.W / 2, C.H / 2, C.S * 2, 0, 6.2832); g.fill();
}

/* the two walls. Toughness reads off the brick's remaining hp vs its
   max: full-hp armour is solid and bright, a cracked brick shows the
   crack and dims. Row 0 is the front on both sides. */
function drawWalls(g, st){
  /* THE ARCADE GHOST bricks: the room's walls, the LOCAL choice (§GHOST).
     Each brick draws its own slice of the 256px texture — the whole wall
     assembles into one continuous glowing face — and every legibility
     layer (armour dim, team cap, cracks) still paints ON TOP, so nothing
     about reading the game changed, only the body of the brick. */
  const wimg = xEq('bricks') ? cosmImg('bricks') : null;
  for (let sdx = 0; sdx < st.walls.length; sdx++){
    const w = st.walls[sdx];
    const mine = (sdx === M.me);
    const tc = TEAM[mine ? 0 : 1];
    for (let r = 0; r < C.ROWS; r++){
      for (let c = 0; c < C.COLS; c++){
        const idx = r * C.COLS + c;
        const hp = w.cells[idx];
        if (hp <= 0) continue;
        const mx = w.max[idx] || 1;
        const bb = E.brickBox(sdx, r, c);
        const x = bb.x0, y = bb.y0, bw = bb.x1 - bb.x0, bh = bb.y1 - bb.y0;
        const pad = C.S * 0.6;
        /* armour (max 3) is the wall colour, front rows lighter */
        const frac = hp / mx;
        if (wimg){
          /* this brick's slice of the exclusive texture, by grid position */
          const iw = wimg.naturalWidth, ih = wimg.naturalHeight;
          g.globalAlpha = 0.45 + 0.55 * frac;
          g.drawImage(wimg,
            (c / C.COLS) * iw, (r / C.ROWS) * ih, iw / C.COLS, ih / C.ROWS,
            x + pad, y + pad, bw - pad * 2, bh - pad * 2);
          g.globalAlpha = 1;
        } else {
          g.fillStyle = mine ? tc.wall : tc.b;
          g.globalAlpha = 0.45 + 0.55 * frac;
          rrect(g, x + pad, y + pad, bw - pad * 2, bh - pad * 2, C.S * 1.4);
          g.fill();
          g.globalAlpha = 1;
        }
        /* a bright cap so bricks read as 3D and toughness is legible */
        g.fillStyle = mine ? tc.a : TEAM[1].a;
        g.globalAlpha = 0.10 + 0.22 * frac;
        rrect(g, x + pad, y + pad, bw - pad * 2, bh * 0.32, C.S * 1.2);
        g.fill();
        g.globalAlpha = 1;
        /* crack marks: one per point of damage taken */
        const dmg = mx - hp;
        if (dmg > 0){
          g.strokeStyle = 'rgba(0,0,0,.45)';
          g.lineWidth = C.S * 0.5;
          const cx = x + bw / 2, cy = y + bh / 2;
          for (let d = 0; d < dmg; d++){
            const off = (d - (dmg - 1) / 2) * bw * 0.22;
            g.beginPath();
            g.moveTo(cx + off, y + pad + bh * 0.15);
            g.lineTo(cx + off + bw * 0.08, cy);
            g.lineTo(cx + off - bw * 0.05, y + bh - pad - bh * 0.15);
            g.stroke();
          }
        }
      }
    }
  }
}

/* the barrier (SHIELD power-up): a bright bar hard against the wall. */
function drawShields(g, st){
  for (let sdx = 0; sdx < st.walls.length; sdx++){
    if (!st.walls[sdx].shield) continue;
    const mine = (sdx === M.me);
    const y0 = C.SH_Y0[sdx], y1 = C.SH_Y1[sdx];
    g.fillStyle = mine ? '#C08BFF' : '#8A5CFF';
    g.globalAlpha = 0.55 + 0.35 * (noMotion() ? 1 : (0.5 + 0.5 * Math.sin(Date.now() / 180)));
    g.fillRect(0, Math.min(y0, y1), C.W, Math.abs(y1 - y0));
    g.globalAlpha = 1;
  }
}

/* falling power-ups, each a coloured chit with a drawn glyph and a GLINT so
   a drop is unmistakable as it falls (a soft halo + a sweeping highlight). */
function drawDrops(g, st, now){
  for (const d of st.drops){
    const art = PU_ART[d.kind] || PU_ART[1];
    const r = C.S * 3.4;
    if (!noMotion()){
      /* telegraph halo — pulses so the eye catches it dropping */
      const pulse = 0.5 + 0.5 * Math.sin(now / 120 + d.id);
      g.globalAlpha = 0.25 + 0.25 * pulse;
      g.fillStyle = art.c;
      g.beginPath(); g.arc(d.x, d.y, r * 1.9, 0, 6.2832); g.fill();
      g.globalAlpha = 1;
    }
    g.fillStyle = art.c;
    g.beginPath(); g.arc(d.x, d.y, r, 0, 6.2832); g.fill();
    /* a bright rim so it reads as a coin/chit */
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = C.S * 0.5;
    g.beginPath(); g.arc(d.x, d.y, r, 0, 6.2832); g.stroke();
    /* a sweeping glint highlight */
    if (!noMotion()){
      g.globalAlpha = 0.5;
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.beginPath(); g.arc(d.x - r * 0.34, d.y - r * 0.34, r * 0.28, 0, 6.2832); g.fill();
      g.globalAlpha = 1;
    }
    g.fillStyle = 'rgba(0,0,0,.34)';
    puGlyph(g, art.k, d.x, d.y, r * 0.6);
  }
}
/* a tiny vector glyph per power-up — no image, no emoji. */
function puGlyph(g, kind, cx, cy, r){
  g.save();
  g.lineWidth = C.S * 0.7;
  g.strokeStyle = 'rgba(0,0,0,.42)';
  g.fillStyle = 'rgba(0,0,0,.42)';
  if (kind === 'multi'){
    g.beginPath(); g.arc(cx - r * 0.5, cy, r * 0.42, 0, 6.2832); g.fill();
    g.beginPath(); g.arc(cx + r * 0.5, cy, r * 0.42, 0, 6.2832); g.fill();
  } else if (kind === 'wide'){
    /* a bar with arrow-heads pointing out */
    g.fillRect(cx - r * 0.7, cy - r * 0.22, r * 1.4, r * 0.44);
    g.beginPath();
    g.moveTo(cx - r, cy); g.lineTo(cx - r * 0.6, cy - r * 0.4); g.lineTo(cx - r * 0.6, cy + r * 0.4);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(cx + r, cy); g.lineTo(cx + r * 0.6, cy - r * 0.4); g.lineTo(cx + r * 0.6, cy + r * 0.4);
    g.closePath(); g.fill();
  } else if (kind === 'slow'){
    /* a snail-ish spiral: a clock at rest — draw a ring + a short hand */
    g.beginPath(); g.arc(cx, cy, r * 0.7, 0, 6.2832); g.stroke();
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - r * 0.5); g.stroke();
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + r * 0.4, cy); g.stroke();
  } else if (kind === 'sticky'){
    /* a paddle with a ball glued on top */
    g.fillRect(cx - r * 0.8, cy + r * 0.3, r * 1.6, r * 0.4);
    g.beginPath(); g.arc(cx, cy - r * 0.15, r * 0.42, 0, 6.2832); g.fill();
  } else if (kind === 'laser'){
    /* a lightning bolt */
    g.beginPath();
    g.moveTo(cx + r * 0.2, cy - r); g.lineTo(cx - r * 0.5, cy + r * 0.1);
    g.lineTo(cx + r * 0.1, cy + r * 0.1); g.lineTo(cx - r * 0.2, cy + r);
    g.lineTo(cx + r * 0.55, cy - r * 0.1); g.lineTo(cx - r * 0.05, cy - r * 0.1);
    g.closePath(); g.fill();
  } else if (kind === 'power'){
    /* a solid star-ish burst = a heavy ball */
    g.beginPath(); g.arc(cx, cy, r * 0.55, 0, 6.2832); g.fill();
    for (let i = 0; i < 8; i++){
      const a = i * 0.7854;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      g.lineTo(cx + Math.cos(a + 0.35) * r * 0.5, cy + Math.sin(a + 0.35) * r * 0.5);
      g.closePath(); g.fill();
    }
  } else { /* shield */
    g.beginPath();
    g.moveTo(cx, cy - r); g.lineTo(cx + r * 0.8, cy - r * 0.4);
    g.lineTo(cx + r * 0.8, cy + r * 0.3); g.lineTo(cx, cy + r);
    g.lineTo(cx - r * 0.8, cy + r * 0.3); g.lineTo(cx - r * 0.8, cy - r * 0.4);
    g.closePath(); g.stroke();
  }
  g.restore();
}

/* the ball TRAIL: a few fading discs strung from the previous tick position
   toward the interpolated now, so a fast ball leaves a streak. Cheap, motion-
   gated, and reads velocity at a glance. Heavy (power) balls trail hot. */
function drawTrails(g, st, f, now){
  if (noMotion()) return;
  /* an Arcade Ghost ball streaks violet, so the trail matches the orb */
  const ghostBall = xEq('ball');
  for (const b of st.balls){
    if (b.stuck) continue;
    const p = M.prev && M.prev[b.id];
    if (!p) continue;
    const bx = p.x + (b.x - p.x) * f, by = p.y + (b.y - p.y) * f;
    const heavy = b.heavy > 0;
    const col = heavy ? '#FF8A3D' : (ghostBall ? '#C08BFF' : '#8FD8FF');
    const NS = 5;
    for (let i = 1; i <= NS; i++){
      const t = i / (NS + 1);
      const tx = bx + (p.x - bx) * t, ty = by + (p.y - by) * t;
      g.globalAlpha = (1 - t) * (heavy ? 0.34 : 0.22);
      g.fillStyle = col;
      g.beginPath(); g.arc(tx, ty, C.R * (1 - t * 0.5), 0, 6.2832); g.fill();
    }
  }
  g.globalAlpha = 1;
}

/* the balls, interpolated. A ball's authoritative position moved from
   M.prev[id] to now; drawing lerp(prev, now, f) removes the 40Hz step
   and shows a 60fps ball on any phone. New balls (no prev) draw at now. */
function drawBalls(g, st, f, now){
  const reduced = noMotion();
  /* THE ARCADE GHOST ball: the room's ball, the LOCAL choice (§GHOST).
     The art is a violet orb glowing on black, so it is composited with
     'screen' — the black contributes nothing and only the light lands
     on the court. A HEAVY (power) ball keeps its stock molten identity:
     that colour is gameplay information and outranks any cosmetic. */
  const bimg = xEq('ball') ? cosmImg('ball') : null;
  for (const b of st.balls){
    let bx = b.x, by = b.y;
    const p = M.prev && M.prev[b.id];
    if (p && f < 1 && !b.stuck){
      bx = p.x + (b.x - p.x) * f;
      by = p.y + (b.y - p.y) * f;
    }
    const r = C.R;
    const heavy = b.heavy > 0;
    /* speed tint: faster balls run hotter, so the escalation is legible */
    const hot = Math.min(1, Math.max(0, (b.sp - C.SP_MIN) / (C.SP_MAX - C.SP_MIN)));

    /* ── the SUBTLE SHADOW: an offset dark ellipse under the ball, so it
       reads as sitting above the court. Draw-only, motion-gated. ── */
    if (!reduced){
      g.globalAlpha = 0.22;
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(bx + r * 0.5, by + r * 0.7, r * 1.05, r * 0.7, 0, 0, 6.2832);
      g.fill();
      g.globalAlpha = 1;
    }

    /* ── the SQUASH-AND-STRETCH on a fresh bounce. Compress along the
       surface normal and stretch across it, easing back to a circle over
       BOUNCE_MS. A flash rides the same envelope. Draw-only. ── */
    let sqx = 1, sqy = 1, flash = 0, ang = 0;
    if (!reduced){
      const bo = BOUNCE[b.id];
      if (bo){
        const age = now - bo.t0;
        if (age >= BOUNCE_MS){ delete BOUNCE[b.id]; }
        else {
          const k = 1 - age / BOUNCE_MS;              /* 1→0 */
          const amp = (bo.big ? 0.42 : 0.28) * k * k;  /* ease-out */
          /* normal (nx,ny): squash along it, stretch across it */
          ang = Math.atan2(bo.ny, bo.nx);
          sqy = 1 - amp;                               /* along normal (local y) */
          sqx = 1 + amp * 0.8;                         /* across normal (local x) */
          flash = k;
        }
      }
    }

    const ghosted = !!(bimg && !heavy);
    if (!reduced && !ghosted){
      /* a HEAVY power-ball wears a fat molten halo so it is unmistakable */
      g.globalAlpha = heavy ? (0.34 + 0.12 * (0.5 + 0.5 * Math.sin(now / 90)))
                            : (0.16 + 0.2 * hot);
      g.beginPath(); g.arc(bx, by, r * (heavy ? 2.4 : 1.9), 0, 6.2832);
      g.fillStyle = heavy ? '#FF8A3D' : (hot > 0.5 ? '#FF9A4D' : '#5FC8FF');
      g.fill();
      g.globalAlpha = 1;
    }

    /* draw the ball body in a squash-rotated frame */
    g.save();
    g.translate(bx, by);
    if (!reduced && (sqx !== 1 || sqy !== 1)){ g.rotate(ang); g.scale(sqx, sqy); g.rotate(-ang); }
    if (ghosted){
      /* the orb fills ~62% of its frame; size the frame so the ORB is
         a touch over the ball's true radius and the art's own halo is
         the glow. Drawn TWICE under 'screen' — the orb's body is dark
         glass and one pass reads dimmer than the stock white ball; the
         second pass doubles the light so THE ball is never the hardest
         thing on the court to find. */
      const D = r * 3.6;
      g.globalCompositeOperation = 'screen';
      g.drawImage(bimg, -D / 2, -D / 2, D, D);
      g.drawImage(bimg, -D / 2, -D / 2, D, D);
      g.globalCompositeOperation = 'source-over';
    } else {
      g.fillStyle = heavy ? '#FFE0B0' : '#fff';
      g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill();
      /* a warm core when it is really moving or heavy */
      if (heavy || hot > 0.4){
        g.fillStyle = heavy ? '#FF6A1F' : '#FFD873';
        g.beginPath(); g.arc(0, 0, r * 0.5, 0, 6.2832); g.fill();
      }
    }
    /* the bounce FLASH: a bright rim that fades over the squash envelope */
    if (flash > 0){
      g.globalAlpha = 0.6 * flash;
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(0, 0, r * (1 + 0.5 * flash), 0, 6.2832); g.fill();
      g.globalAlpha = 1;
    }
    g.restore();
  }

  /* ── the SERVE FLOURISH: an expanding bright ring from arena centre when
     a fresh ball is put into play, so a serve reads as a launch. ── */
  if (!reduced && SERVE_T){
    const age = now - SERVE_T;
    if (age >= SERVE_MS){ SERVE_T = 0; }
    else {
      const k = age / SERVE_MS;
      g.globalAlpha = (1 - k) * 0.7;
      g.strokeStyle = '#FFD873';
      g.lineWidth = C.S * (2.4 * (1 - k) + 0.4);
      g.beginPath(); g.arc(C.W / 2, C.H / 2, C.S * (2 + 26 * k), 0, 6.2832); g.stroke();
      g.globalAlpha = 1;
    }
  }
}

/* the paddles. YOUR paddle (M.me) is drawn from the predictive ghost so
   it feels attached to your thumb; the opponent's from its authoritative
   x. A subtle angle gauge on your paddle makes the rebound legible: the
   face is drawn with a faint centre notch so you can see where "straight
   up" is versus the angled ends. */
/* THE PADDLES — the smoothness fix lives here.

   YOUR paddle: the engine's authoritative x steps at 40Hz and the ghost
   predicts where committed inputs will carry it. But the ghost itself steps
   40Hz, so drawing it raw still stutters. So we RENDER-EASE: M.renderX chases
   the ghost target every frame by a large fraction of the remaining gap
   (frame-rate independent, exponential). Because PAD_SPEED is now 22 du/tick
   the ghost is already almost ON the thumb, and the ease removes the 40Hz
   staircase — the slab glides under your thumb with no perceptible lag and no
   stutter. It is DRAW ONLY: the ball never reads renderX; ghost() and the
   authoritative sim are untouched, so determinism is intact.

   THE OPPONENT paddle: no prediction is possible (their input arrives late),
   so it INTERPOLATES between its previous and current authoritative x by the
   tick fraction, exactly like the ball — a smooth 60fps slab. */
function easePaddle(target, now){
  if (M.renderX == null){ M.renderX = target; M.lastFrameMs = now; return target; }
  let dt = now - (M.lastFrameMs || now);
  M.lastFrameMs = now;
  if (dt < 0) dt = 0; if (dt > 64) dt = 64;
  /* exponential ease: ~92% of the gap closed in 16ms, frame-rate independent.
     k per ms tuned so a 60fps frame lands the paddle essentially on target. */
  const k = 1 - Math.pow(0.0009, dt / 16);
  M.renderX = target + (M.renderX - target) * (1 - k);
  return M.renderX;
}
function drawPaddles(g, st, f, now){
  for (const p of st.pads){
    const mine = (p.pid === M.me);
    const tc = TEAM[mine ? 0 : 1];
    let x;
    if (mine){
      const tgt = (M.ghostX != null) ? M.ghostX : p.x;
      x = noMotion() ? tgt : easePaddle(tgt, now);
    } else {
      /* interpolate the opponent between last and current authoritative x */
      const prev = M.prevPad && M.prevPad[p.pid];
      x = (prev != null && f < 1 && !noMotion()) ? (prev + (p.x - prev) * f) : p.x;
    }
    /* a SQUASH when this slab just returned a ball: briefly flatten (thinner
       across the face) and widen, easing back over SQUASH_MS. Draw-only. */
    let sqW = 1, sqH = 1;
    if (!noMotion() && PAD_SQUASH[p.pid]){
      const age = now - PAD_SQUASH[p.pid];
      if (age >= SQUASH_MS){ PAD_SQUASH[p.pid] = 0; }
      else { const k = 1 - age / SQUASH_MS; const a = 0.28 * k * k; sqW = 1 + a; sqH = 1 - a; }
    }
    const chw = p.hw * sqW;
    const chh = ((C.PAD_Y1[p.side] - C.PAD_Y0[p.side]) * sqH);
    /* the slab keeps its FRONT face anchored so the squash reads as a recoil */
    const fyBase = p.side === 0 ? C.PAD_Y0[0] : C.PAD_Y1[1];
    const y0s = p.side === 0 ? fyBase : (fyBase - chh);
    const pb = { x0: x - chw, x1: x + chw, y0: y0s, y1: y0s + chh };
    const w = pb.x1 - pb.x0, h = pb.y1 - pb.y0;
    const cy = (pb.y0 + pb.y1) / 2;

    /* ── THE THUMB PRESS GLOW: while YOU are touching the strip, a warm
       radial glow sits under your paddle and follows it, so the slab reads
       as pressed by your finger. Draw-only; it never touches the sim, and
       the thumb itself stays down on the strip (never over the ball). ── */
    if (mine && !noMotion() && PRESS.on){
      const age = now - PRESS.t0;
      const settle = Math.min(1, age / 120);          /* a quick swell-in */
      const pulse = 0.5 + 0.5 * Math.sin(now / 220);
      const gy = (pb.y0 + pb.y1) / 2;
      const rad = C.S * (9 + 2 * pulse) * settle;
      let grd = null;
      try {
        grd = g.createRadialGradient(x, gy, C.S * 1.5, x, gy, rad);
        grd.addColorStop(0, 'rgba(255,216,115,0.42)');
        grd.addColorStop(0.6, 'rgba(255,197,66,0.16)');
        grd.addColorStop(1, 'rgba(255,197,66,0)');
      } catch(e){}
      if (grd){
        g.fillStyle = grd;
        g.beginPath(); g.arc(x, gy, rad, 0, 6.2832); g.fill();
      }
      /* a bright ring hugging the slab for a crisp "under-thumb" read */
      g.globalAlpha = 0.5 + 0.3 * pulse;
      g.strokeStyle = '#FFE9B0';
      g.lineWidth = C.S * 0.5;
      rrect(g, pb.x0 - C.S * 0.5, pb.y0 - C.S * 0.5, w + C.S, h + C.S, C.S * 1.6);
      g.stroke();
      g.globalAlpha = 1;
    }

    /* power-up state glow behind the slab so ACTIVE effects are legible:
       WIDE = the slab simply grew; STICKY = a soft aura + a tacky lip;
       LASER = a hot underglow and charge pips. */
    const sticky = p.stickyT > 0, laser = p.laser > 0;
    if (!noMotion() && (sticky || laser)){
      const pulse = 0.5 + 0.5 * Math.sin(now / 150);
      g.globalAlpha = 0.18 + 0.16 * pulse;
      g.fillStyle = sticky ? '#FFD54D' : '#FF5A5A';
      rrect(g, pb.x0 - C.S, pb.y0 - C.S, w + C.S * 2, h + C.S * 2, C.S * 1.8);
      g.fill();
      g.globalAlpha = 1;
    }

    /* the slab — or THE ARCADE GHOST paddle (§GHOST): mine when I wear
       briks.paddle.excl, the opponent's when their skin byte arrived on
       the wire. The art is a violet neon slab on black, composited with
       'screen' so only the light lands; the band is drawn a little past
       the true box so the glow breathes, and the TRUE box (pb) is still
       what the notch, the lip and the pips are laid out on — hitbox and
       legibility are exactly the stock ones. */
    const pimg = ghostPad(p.pid) ? cosmImg('paddle') : null;
    if (pimg){
      const iw = pimg.naturalWidth, ih = pimg.naturalHeight;
      const ex = w * 0.08 + C.S;            /* sideways glow allowance   */
      const hh = h * 1.5;                   /* the band is 3x the slab   */
      g.save();
      g.globalCompositeOperation = 'screen';
      g.drawImage(pimg, 0, ih * 0.28, iw, ih * 0.44,
                  pb.x0 - ex, cy - hh, w + ex * 2, hh * 2);
      g.restore();
    } else {
      g.fillStyle = tc.a;
      rrect(g, pb.x0, pb.y0, w, h, C.S * 1.2);
      g.fill();
      g.fillStyle = tc.b;
      g.globalAlpha = 0.5;
      rrect(g, pb.x0, pb.y0 + h * 0.5, w, h * 0.5, C.S * 1.2);
      g.fill();
      g.globalAlpha = 1;
    }

    /* a sticky "lip" on the front face so catch is obvious */
    if (sticky){
      const fy = p.side === 0 ? pb.y0 : pb.y1;
      g.strokeStyle = '#FFD54D';
      g.lineWidth = C.S * 0.9;
      g.beginPath(); g.moveTo(pb.x0 + C.S, fy); g.lineTo(pb.x1 - C.S, fy); g.stroke();
    }

    /* the angle notch — the centre is a flat return, the ends fan out. */
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath(); g.arc(x, cy, C.S * 0.7, 0, 6.2832); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.beginPath(); g.arc(pb.x0 + w * 0.16, cy, C.S * 0.5, 0, 6.2832); g.fill();
    g.beginPath(); g.arc(pb.x1 - w * 0.16, cy, C.S * 0.5, 0, 6.2832); g.fill();

    /* laser charge pips along the front edge */
    if (laser){
      g.fillStyle = '#FF5A5A';
      const fy = p.side === 0 ? pb.y0 + C.S * 1.2 : pb.y1 - C.S * 1.2;
      for (let i = 0; i < p.laser && i < 6; i++){
        g.beginPath(); g.arc(pb.x0 + w * (0.2 + 0.6 * (i / 5)), fy, C.S * 0.35, 0, 6.2832); g.fill();
      }
    }
  }
}

/* the laser bolts: a hot little dart travelling toward the enemy wall,
   interpolated by the tick fraction so they streak smoothly. */
function drawBolts(g, st, f){
  if (!st.bolts) return;
  for (const bo of st.bolts){
    const y = bo.y - (noMotion() ? 0 : bo.vy * (1 - Math.max(0, Math.min(1, f))));
    g.fillStyle = '#FF5A5A';
    g.globalAlpha = 0.85;
    rrect(g, bo.x - C.LASER_HW, y - C.S * 2, C.LASER_HW * 2, C.S * 4, C.LASER_HW);
    g.fill();
    if (!noMotion()){
      g.globalAlpha = 0.3;
      g.fillStyle = '#FFB0B0';
      g.beginPath(); g.arc(bo.x, y, C.S * 1.6, 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
  }
}

/* a rounded rect in arena units */
function rrect(g, x, y, w, h, r){
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
   THE SCREEN
   ═══════════════════════════════════════════════════════════════════ */
function board(){
  const ctx = M.ctx;
  ctx.host.classList.add('bk-host');
  ctx.host.innerHTML =
    '<div class="bk-hud" id="bk-hud"></div>' +
    '<div class="bk-court" id="bk-court">' +
      '<canvas id="bk-cv"></canvas>' +
      '<div class="bk-over"><span class="bk-cd" id="bk-cd"></span></div>' +
      '<div class="bk-flash" id="bk-flash"></div>' +
      '<div class="bk-rules" id="bk-rulespanel" aria-hidden="true">' +
        '<div class="bk-rules-h"><h4 id="bk-rules-t"></h4>' +
          '<button class="bk-rules-x" id="bk-rules-x" aria-label="' +
            esc(T('Put the rules away', 'Warrab ir-regoli')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<div class="bk-rules-b" id="bk-rules-b"></div>' +
      '</div>' +
    '</div>' +
    /* THE DRAG STRIP — its own band, below the court, never over the
       ball. It is a sibling of the court and BELOW it in the flex
       column, which is how the thumb is kept off the playfield. */
    '<div class="bk-strip" id="bk-strip" role="slider" tabindex="0" ' +
        'aria-label="' + esc(T('Slide your paddle', 'Żerżaq ir-raketta tiegħek')) + '">' +
      '<div class="bk-hint">' + esc(T('drag to move', 'iġbed biex timxi')) + '</div>' +
      '<div class="bk-knob" id="bk-knob"></div>' +
    '</div>';

  const court = ctx.host.querySelector('#bk-court');
  const cv = ctx.host.querySelector('#bk-cv');
  UI = {
    ctx, court, cv,
    g2: cv.getContext('2d'),
    host: ctx.host,
    hud:   ctx.host.querySelector('#bk-hud'),
    strip: ctx.host.querySelector('#bk-strip'),
    knob:  ctx.host.querySelector('#bk-knob'),
    cd:    ctx.host.querySelector('#bk-cd'),
    flash: ctx.host.querySelector('#bk-flash'),
    rules: ctx.host.querySelector('#bk-rulespanel'),
    vw:240, vh:380, dpr:1, scale:1, flashT:0
  };
  M.cv = cv; M.g2 = UI.g2;

  wireControls();
  UI.rules.querySelector('#bk-rules-x').addEventListener('click', () => setRules(false));
  ctx.root.addEventListener('pointerdown', e => {
    if (!rulesOpen || !UI || !UI.rules) return;
    const rb = ctx.btn && ctx.btn('bk-rules');
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
   THE THUMB
   A horizontal drag over the strip. The paddle CENTRE goes where the
   thumb's x maps into the lane. We track the strip's x range once per
   pointerdown (the only layout read on the input path) and map the
   thumb's clientX into [lo,hi] of the lane, honouring the canvas flip
   so "left on the strip" is "left on your paddle" whichever team you
   drive.

   aimAt() only stores M.thumbX (an absolute engine target). doTick()
   commits it for tick+D and travels it. The thumb never waits for the
   network, and the ghost draws it forward so the SPRITE has no lag.
   ═══════════════════════════════════════════════════════════════════ */
function laneRange(){
  const p = M.st.pads[M.me];
  return { lo: p.lo + p.hw, hi: p.hi - p.hw };
}
function aimFromClientX(clientX){
  if (!UI || !UI.strip) return;
  const rect = UI.strip.getBoundingClientRect();
  let frac = (clientX - rect.left) / Math.max(1, rect.width);
  frac = Math.max(0, Math.min(1, frac));
  /* the strip's left is the arena's left when un-flipped; when flipped
     (you drive team 1) left-on-strip must still be left-on-your-paddle,
     which is arena-right, so we invert. */
  const useFrac = (M.down === 0) ? frac : (1 - frac);
  const { lo, hi } = laneRange();
  aimAt(Math.round(lo + (hi - lo) * useFrac));
}
function aimAt(tx){
  if (!M || M.dead || M.finished) return;
  const { lo, hi } = laneRange();
  M.thumbX = Math.max(lo, Math.min(hi, tx | 0));
  if (UI && UI.strip) UI.strip.classList.add('touched');
}

/* ── the finger-press glow state (draw-only). PRESS.on gates the under-thumb
   glow on your paddle; the strip also gets a 'pressed' class for a CSS squeeze
   on the knob. clientX is only used to add a class — the paddle glow rides the
   paddle's own x so it never drifts off the slab. ── */
function pressOn(){
  PRESS.on = true; PRESS.t0 = nowMs();
  if (UI && UI.strip) UI.strip.classList.add('pressed');
}
function pressMove(){ if (PRESS.on) { /* keep the swell going; nothing to store */ } }
function pressOff(){
  PRESS.on = false;
  if (UI && UI.strip) UI.strip.classList.remove('pressed');
}

function wireControls(){
  let on = false, pid = -1;
  const down = e => {
    on = true; pid = e.pointerId;
    try { UI.strip.setPointerCapture(pid); } catch(err){}
    e.preventDefault();
    pressOn(e.clientX);
    aimFromClientX(e.clientX);
  };
  const move = e => { if (!on || e.pointerId !== pid) return; e.preventDefault(); pressMove(e.clientX); aimFromClientX(e.clientX); };
  const up = e => { on = false; pressOff(); try { UI.strip.releasePointerCapture(pid); } catch(err){} };
  UI.strip.addEventListener('pointerdown', down);
  UI.strip.addEventListener('pointermove', move);
  UI.strip.addEventListener('pointerup', up);
  UI.strip.addEventListener('pointercancel', up);

  /* the arena, too, for people who reach onto it — but only its BOTTOM
     third, which is your own half, so a stray tap up top never yanks the
     paddle across the field. The strip is the measured path. */
  UI.court.addEventListener('pointerdown', e => {
    if (rulesOpen) return;
    const rect = UI.court.getBoundingClientRect();
    if (e.clientY - rect.top < rect.height * 0.66) return;   /* upper field: ignore */
    pressOn(e.clientX); aimFromClientX2(e.clientX);
  });
  UI.court.addEventListener('pointermove', e => {
    if (rulesOpen || e.buttons === 0) return;
    const rect = UI.court.getBoundingClientRect();
    if (e.clientY - rect.top < rect.height * 0.66) return;
    pressMove(e.clientX); aimFromClientX2(e.clientX);
  });
  UI.court.addEventListener('pointerup', pressOff);
  UI.court.addEventListener('pointercancel', pressOff);

  /* a keyboard, for the desk and for the test harness. Arrow keys nudge
     the paddle; the strip's slider role makes them announce. */
  UI.keys = e => {
    if (!M || M.dead || M.finished) return;
    const k = e.key;
    let dir = 0;
    if (k === 'ArrowLeft' || k === 'a') dir = -1;
    else if (k === 'ArrowRight' || k === 'd') dir = 1;
    else return;
    e.preventDefault();
    const base = (M.thumbX == null) ? M.st.pads[M.me].x : M.thumbX;
    /* left-on-keyboard is left-on-your-paddle regardless of flip */
    aimAt(base + dir * (M.down === 0 ? 1 : 1) * C.S * 16);
  };
  window.addEventListener('keydown', UI.keys);
}
/* map a court clientX to a paddle target (same math as the strip). */
function aimFromClientX2(clientX){
  if (!UI || !UI.court) return;
  const rect = UI.court.getBoundingClientRect();
  let frac = (clientX - rect.left) / Math.max(1, rect.width);
  frac = Math.max(0, Math.min(1, frac));
  const useFrac = (M.down === 0) ? frac : (1 - frac);
  const { lo, hi } = laneRange();
  aimAt(Math.round(lo + (hi - lo) * useFrac));
}

/* ── the score rail. Two chips, repainted on CHANGE only. ────────── */
function hud(){
  if (!UI || !UI.hud) return;
  const st = M.st;
  const you = st.score[M.me], them = st.score[M.me === 0 ? 1 : 0];
  const meMeta = M.meta[M.me] || { name: T('You', 'Int') };
  const opMeta = M.meta[M.me === 0 ? 1 : 0] || { name: T('Them', 'Huma') };
  UI.hud.innerHTML =
    '<span class="bk-chip me">' +
      '<span class="d" style="background:' + TEAM[0].a + '"></span>' +
      esc(meMeta.name) + ' <b>' + you + '</b></span>' +
    '<span class="bk-tgt">' + esc(T('first to', 'l-ewwel għal') + ' ' + st.target) + '</span>' +
    '<span class="bk-chip">' +
      '<span class="d" style="background:' + TEAM[1].a + '"></span>' +
      esc(opMeta.name) + ' <b>' + them + '</b></span>';
}

function paintCountdown(beat){
  if (!UI || !UI.cd) return;
  if (beat <= 0){ UI.cd.textContent = ''; UI.cd.className = 'bk-cd'; return; }
  if (beat >= 4){ UI.cd.textContent = ''; return; }
  UI.cd.className = 'bk-cd' + (beat === 1 ? ' go' : '');
  UI.cd.textContent = beat === 1 ? T('GO', 'MUR') : String(beat - 1);
}

/* a one-line banner over the court (a break-through, a crumble). */
function flash(text){
  if (!UI || !UI.flash) return;
  UI.flash.textContent = text;
  UI.flash.classList.add('on');
  clearTimeout(UI.flashT);
  UI.flashT = setTimeout(() => { try { UI.flash.classList.remove('on'); } catch(e){} }, 1100);
}

/* ═══════════════════════════════════════════════════════════════════
   THE RULES CARD — one game, told once, both languages
   ═══════════════════════════════════════════════════════════════════ */
function rulesFor(){
  return [
    T('<b>Defend your wall, break theirs.</b> You are at the bottom; they are at the top. ' +
      'The ball never dies — it rattles between you forever.',
      '<b>Iddefendi l-ħajt tiegħek, kisser tagħhom.</b> Int taħt; huma fuq. Il-ballun qatt ' +
      'ma jmut — jibqa’ jiġġebbed bejnietkom għal dejjem.'),
    T('<b>Where the ball hits your paddle decides the bounce.</b> The centre sends it straight; ' +
      'the ends angle it. Aim, do not just block.',
      '<b>Fejn jolqot il-ballun ir-raketta tiddeċiedi r-rimbalz.</b> In-nofs jibgħatu dritt; ' +
      'it-truf jgħawġuh. Immira, mhux biss imblokka.'),
    T('<b>Get the ball past their paddle</b> and it eats their bricks. Front bricks are soft; the ' +
      'back row is armour, three hits and worth more.',
      '<b>Għaddi l-ballun mir-raketta tagħhom</b> u jiekol il-brikks tagħhom. Ta’ quddiem ' +
      'ratba; ta’ wara armatura, tliet daqqiet u tiswa aktar.'),
    T('<b>Break a brick and the power-up is YOURS</b> — it falls across to your own paddle to be ' +
      'caught. The player who does the breaking gets the boost, so keep smashing their wall.',
      '<b>Kisser brikksa u l-power-up ikun TIEGĦEK</b> — jaqa’ lejn ir-raketta tiegħek biex ' +
      'taqbdu. Min ikisser jieħu s-spinta, mela ibqa’ kisser il-ħajt tagħhom.'),
    T('<b>Seven power-ups:</b> more balls, a wider paddle, a slow-ball breather, a ' +
      '<b>sticky</b> paddle that catches and lets you aim, a <b>laser</b> that chips their wall, ' +
      'a <b>power ball</b> that smashes straight through bricks, and a one-save barrier.',
      '<b>Seba’ power-ups:</b> aktar blalen, raketta usa’, ballun bil-mod, raketta li ' +
      '<b>taqbad</b> u tħallik timmira, <b>lejżer</b> li jkisser il-ħajt tagħhom, ' +
      '<b>ballun qawwi</b> li jgħaddi dritt mill-brikks, u ħarsien li jsalvak darba.'),
    T('<b>After a minute the walls start to crumble</b> on their own, a row at a time from the ' +
      'front. First to the target score wins.',
      '<b>Wara minuta l-ħitan jibdew jiġġarrfu</b> waħedhom, ringiela kull darba minn quddiem. ' +
      'L-ewwel wieħed li jasal għall-punteġġ jirbaħ.'),
    T('Drag along the strip under the court to slide your paddle. Your thumb never covers the ball.',
      'Iġbed mal-medda taħt il-grawnd biex iżżerżaq ir-raketta. Subgħajk qatt ma jgħatti l-ballun.')
  ];
}
function clampRules(){
  if (!UI || !UI.rules || !UI.court) return;
  try {
    UI.rules.style.maxHeight = Math.max(120, Math.floor(UI.court.clientHeight * 0.9)) + 'px';
  } catch(e){}
}
function paintRules(){
  if (!UI || !UI.rules) return;
  clampRules();
  UI.rules.querySelector('#bk-rules-t').textContent = 'IL-ĦAJT — ' + T('the rules', 'ir-regoli');
  UI.rules.querySelector('#bk-rules-b').innerHTML =
    '<ul>' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul>';
  UI.rules.classList.toggle('open', rulesOpen);
  UI.rules.setAttribute('aria-hidden', rulesOpen ? 'false' : 'true');
  const rb = M && M.ctx && M.ctx.btn && M.ctx.btn('bk-rules');
  if (rb) rb.setAttribute('aria-expanded', rulesOpen ? 'true' : 'false');
}
function setRules(open){
  rulesOpen = !!open;
  try { localStorage.setItem(UIKEY + '.rules', rulesOpen ? '1' : '0'); } catch(e){}
  paintRules();
}
window.addEventListener('resize', () => { if (UI && rulesOpen) clampRules(); });

/* ═══════════════════════════════════════════════════════════════════
   OPENING / CLOSING
   ═══════════════════════════════════════════════════════════════════ */
function newGame(opts){
  injectCSS();
  P.show();
  const o = Object.assign({}, opts || {});
  startMatch(o, null, null);
  M.me = 0;
  M.down = 0;
  M.meta = [
    { name: T('You', 'Int'), own:'me' },
    { name: levelWords(o.lvl || 2).n, own:'ai' }
  ];
  /* offline: team 0 is you, team 1 is the machine. setBot flips team 1
     to the AI at tick 0 so both would agree if this were online. */
  E.setBot(M.st, 1, true, 0);
  E.setBot(M.st, 0, false, 0);
  M.st.pads[1].bot = 1;               /* so seedInputs skips the machine seat */
  seedInputs();
  openBoard(() => menu());
  startLoop();
}

function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: 'IL-ĦAJT',
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'bk-rules', label:T('Rules', 'Regoli'), icon:'book',    cls:'ghost' },
      { id:'bk-new',   label:T('New', 'Ġdida'),    icon:'refresh', cls:'ghost' }
    ]
  });
  if (M.ctx.stopFit){ try { M.ctx.stopFit(); } catch(e){} }   /* the square sizer is not ours */
  M.ctx.badge.textContent = levelWords(M.opts.lvl || 2).n;
  board();
  M.ctx.btn('bk-rules').onclick = () => setRules(!rulesOpen);
  paintRules();
  const nb = M.ctx.btn('bk-new');
  if (nb) nb.onclick = () => { if (M.net) rematchAsk(); else newGame(M.opts); };
  P.ui.setTurn(M.ctx, { cls:'', who: T('Get ready', 'Ħejji ruħek'),
                        note: T('Drag the strip under the court.', 'Iġbed il-medda taħt il-grawnd.') });
}

function leave(){
  stopLoop();
  if (UI){
    if (UI.stopFit){ try { UI.stopFit(); } catch(e){} }
    if (UI.keys){ try { window.removeEventListener('keydown', UI.keys); } catch(e){} }
    if (UI.flashT){ try { clearTimeout(UI.flashT); } catch(e){} }
  }
  if (M){ M.dead = true; persistNow(); }
  M = null; UI = null;
}

/* ═══════════════════════════════════════════════════════════════════
   THE END — the shared winner screen (js/rebbieh.js). Two seats: you
   and them, ranked by score. Play Again returns to the menu (the lobby
   for a solo game), Leave goes back to the menu too.
   ═══════════════════════════════════════════════════════════════════ */
function finish(){
  if (!M || M.finished) return;
  M.finished = true;
  stopLoop();
  const st = M.st;
  const won = st.over && st.over.winner === M.me;
  const draw = st.over && st.over.winner < 0;
  const solo = !M.net;

  /* Offline the old funnel stands: P.record is wrapped by progress.js
     and pays as a side effect. ONLINE that funnel never fired — the
     podium never calls P.ui.result either, so an online win paid
     nothing. The online path pays itself through KARTI_XP.awardPlay,
     exactly once under the match id, and settles a staked pot through
     mp.js's own idempotent door (win takes it, dead level refunds). */
  let pay = null, potRes = null;
  if (solo){
    ST.rec[draw ? 'd' : (won ? 'w' : 'l')]++;
    persist();
    try {
      if (P.record) P.record('briks', draw ? 'd' : (won ? 'w' : 'l'));
      else if (window.KARTI_XP && KARTI_XP.finish)
        KARTI_XP.finish({ game:'briks', result: draw ? 'd' : (won ? 'w' : 'l'),
                          ms: Math.max(1, M.tick * STEP_MS) });
    } catch(e){}
  } else {
    ST.rec[draw ? 'd' : (won ? 'w' : 'l')]++;
    persist();
    const MPX = window.KARTI_MP;
    const staked = !!(MPX && MPX.MP && MPX.MP.stakeLive);
    const mid = 'briks:' + ((MPX && MPX.MP && MPX.MP.code) || 'room') + ':' + (M.seed >>> 0);
    try {
      if (window.KARTI_XP && KARTI_XP.awardPlay){
        const r = KARTI_XP.awardPlay({
          game:'briks', won, draw, id: mid, ranked: staked,
          ms: Math.max(1, M.tick * STEP_MS)
        });
        if (r && r.counted) pay = r;
      }
    } catch(e){}
    /* shelf badge, NO award attached (P.record is wrapped to pay) */
    try { if (P.tally) P.tally('briks', draw ? 'd' : (won ? 'w' : 'l')); } catch(e){}
    try {
      if (window.KARTI_STATS && KARTI_STATS.record)
        KARTI_STATS.record('briks', {
          result: won ? 'win' : (draw ? 'draw' : 'loss'), id: mid });
    } catch(e){}
    if (staked && MPX.stakeSettle){
      try { potRes = MPX.stakeSettle(won ? 'win' : (draw ? 'draw' : 'lose')); } catch(e){}
    }
    /* a 1v1 walk-out settled the pot in mp.js before this ran (the
       sole-win hook stashed it); the settle above was a no-op then */
    if (!potRes && won && M.solePot){ potRes = M.solePot; M.solePot = null; }
  }

  cue(won ? 'game.win' : (draw ? 'board.draw' : 'game.lose'), { gain:0.9 }, true);
  const opts = M.opts;
  const net = M.net;
  const me = M.me;                 /* CAPTURE NOW — M may be null by the timeout */
  setTimeout(() => { showResult(st, won, draw, opts, net, me, pay, potRes); }, 560);
}

function showResult(st, won, draw, opts, net, me, pay, potRes){
  /* the result fires 560ms after the round ends. If the player tapped BACK
     (or started a new game) in that window, M is gone and they have already
     moved on — do NOT dereference a null M.me and do NOT paint a result over
     whatever screen they navigated to. me was captured at finish() time. */
  if (!M) return;
  if (me == null) me = M.me;
  const RB = window.KARTI_REBBIEH;
  const you = { name: T('You', 'Int'), score: st.score[me], you:true,
                border:'gold', place: (won || draw) ? 1 : 2 };
  const them = { name: levelWords(opts.lvl || 2).n, bot:true,
                 score: st.score[me === 0 ? 1 : 0], border:'ice',
                 place: (won || draw) ? 2 : 1 };
  const rows = (you.place <= them.place) ? [you, them] : [them, you];

  const backToMenu = () => { leave(); menu(); };

  if (RB && RB.show){
    RB.show({
      lang: (window.KARTI_LANG && KARTI_LANG.lang) ? KARTI_LANG.lang() : undefined,
      reduced: noMotion(),
      title: (won && st.over && st.over.sole)
              ? T('They walked out — you win', 'Telaq — ir-rebħa tiegħek')
            : won ? T('You held the wall', 'Żammejt il-ħajt')
            : draw ? T('Dead level', 'Indaqs')
            : T('They broke through', 'Qasmu n-naħa l-oħra'),
      subtitle: T('IL-ĦAJT', 'IL-ĦAJT'),
      rows: rows,
      xp: pay ? { level: pay.level, gained: pay.xp, leveledUp: !!pay.levelled,
                  before: 0, after: pay.levelled ? 1 : 0.7 } : null,
      reward: (pay || potRes) ? {
        xp: pay ? pay.xp : 0,
        chips: pay ? (pay.chips | 0) + (pay.chipsLevel | 0) : 0,
        wonBonus: pay ? pay.wonBonus : 0,
        staked: potRes ? potRes.ante : 0,
        pot: (potRes && potRes.kind === 'win') ? potRes.pot : 0
      } : undefined,
      sound: id => cue(id, { gain:0.6 }),
      playAgainLabel: T('Play again', 'Erġa\' lgħab'),
      onPlayAgain: () => { leave(); if (net) menu(); else newGame(opts); },
      onLeave: backToMenu
    });
    return;
  }
  /* fallback if rebbieh is somehow absent: the house result card */
  if (M && M.ctx) P.ui.result(M.ctx, {
    tone: won ? 'win' : (draw ? 'draw' : 'lose'),
    head: won ? T('You held the wall', 'Żammejt il-ħajt') : T('Through', 'Għadda'),
    why: '',
    buttons: [{ label:T('Again', 'Erġa'), icon:'refresh', cls:'primary',
                go: () => { leave(); newGame(opts); } },
              { label:T('Back', 'Lura'), icon:'back', cls:'ghost', go: backToMenu }]
  });
}

function rematchAsk(){
  /* online: a rematch is the room's decision — this button WALKS OUT of
     a live match, so it goes through the shared confirm gate exactly
     like the back arrow (P.guardLeave → KARTI_MP.askLeave; no gate
     shipped yet → today's instant door). */
  const go = () => {
    const nx = M && M.net; leave(); if (nx && nx.onLeave) nx.onLeave(); else menu();
  };
  if (P.guardLeave) P.guardLeave(go, 'new'); else go();
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — say() is the ONE place a local input leaves this phone. It
   is called from doTick() with the target that was just committed for
   tick+D. Offline M.net is null and it is a no-op, which is why solo
   needs no network at all. Shape matches serp's {seat, move} so mp.js's
   existing relay carries it unchanged.
   ═══════════════════════════════════════════════════════════════════ */
/* ── THE CODEC, done here and published to the lobby below ──────────
   The engine's encWire packed forTick into ONE byte ('k'), so the 256th
   tick — about thirteen seconds in — would not fit and mp.js stopped
   the table with "a move would not fit on the wire": every online
   round, always, mid-game. Its 'bot' move also carried an 'on' field
   the published list never named, so a walk-off replacement could not
   be said either. Both ends of the wire live in this file (say /
   onlineRemote), so the fix does too: bomba's proven shape — the tick
   over three bytes l/h/g (24 bits ≈ days), the paddle target over two
   (p/q), the bot flag in 'on'. */
const BK_WIRE_FIELDS = ['l', 'h', 'g', 'p', 'q', 'on'];
function encWireX(mv){
  if (!mv) return null;
  const tk = mv.forTick | 0;
  if (tk < 0 || tk > 0xFFFFFF) return null;
  const base = { l: tk & 255, h: (tk >> 8) & 255, g: (tk >> 16) & 255 };
  if (mv.t === 'bot') return Object.assign({ t:'bot', on: mv.on ? 1 : 0 }, base);
  if (mv.t === 'tx'){
    const x = Math.max(0, Math.min(0xFFFF, mv.tx | 0));
    return Object.assign({ t:'tx', p: (x >> 8) & 255, q: x & 255 }, base);
  }
  return null;
}
function decWireX(w){
  if (!w || typeof w.t !== 'string') return null;
  const tk = (((w.g | 0) & 255) << 16) | (((w.h | 0) & 255) << 8) | ((w.l | 0) & 255);
  if (w.t === 'bot') return { t:'bot', forTick: tk, on: (w.on | 0) ? 1 : 0 };
  if (w.t === 'tx')  return { t:'tx',  forTick: tk, tx: (((w.p | 0) & 255) << 8) | ((w.q | 0) & 255) };
  return null;
}
function say(seat, mv){
  if (!M || !M.net) return;
  const w = encWireX(mv);
  if (!w) return;
  fire(moveSubs, { seat, move: w, src:'local' });
}

/* a message from the other chair. Never fatal. */
function onlineRemote(seat, wire){
  if (!M || M.dead || !M.net) return null;
  const g = M.net.toGame ? M.net.toGame[seat] : seat;
  if (g === undefined || g === M.me) return null;       /* our own, echoed */
  if (!M.st.pads[g]) return null;
  /* that seat's exclusive-paddle byte arriving — pure paint, NEVER part
     of the lockstep (no tick, no input, nothing the sim reads), so it
     cannot fork the stream. It rides its own {t:'skin'} action on the
     already-declared field `p` (§GHOST), so BK_WIRE_FIELDS did not grow
     and the l/h/g tick codec is untouched. Validated against the one
     byte this build knows; anything else is simply stock. */
  if (wire && (wire.t === 'skin' || wire.a === 'skin')){
    if (((wire.p | 0) === 1) && M.skins) M.skins[g] = 1;
    return null;
  }
  const mv = decWireX(wire);
  if (!mv) return null;
  if (mv.t === 'tx')  E.commit(M.st, g, mv.forTick, mv.tx);
  else if (mv.t === 'bot') E.setBot(M.st, g, mv.on, mv.forTick);
  return null;
}

function onlineNote(text, tone){ if (M && M.ctx) P.ui.setNet(M.ctx, text || '', tone || ''); }

function onlineStop(why, tone){
  if (!M || M.dead || !M.ctx) return;
  stopLoop();
  M.finished = true;
  P.ui.setNet(M.ctx, '', '');
  P.ui.result(M.ctx, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? T('No game', 'L-ebda logħba') : T('Cut off', 'Maqtugħ'),
    why: why || T('The court stopped.', 'Il-grawnd waqaf.'),
    quip: T('Nothing was counted. Nobody loses a round over a dropped connection.',
            'Xejn ma ngħadd. Ħadd ma jitlef round minħabba konnessjoni li waqgħet.'),
    buttons: [{ label:T('Back', 'Lura'), icon:'back', cls:'primary',
                go: () => { const nx = M.net; leave();
                            if (nx && nx.onLeave) nx.onLeave(); else P.hub(); } }]
  });
}

/* online start — the same lockstep model as offline, but the machine is
   only run when a seat has no human. Every phone drives its own seat and
   commits inputs for tick+D; nobody sends ball state. */
function onlineStart(cfg){
  cfg = cfg || {};
  const chairs = (cfg.seats || []).filter(Boolean);
  if (chairs.length !== 2) throw new Error('IL-ĦAJT: exactly 2 seats, not ' + chairs.length);

  const toGame = {}, toRoom = [];
  chairs.forEach((s, gi) => {
    const room = (typeof s.seat === 'number') ? s.seat : gi;
    toGame[room] = gi; toRoom[gi] = room;
  });
  const meG = (toGame[cfg.you] !== undefined) ? toGame[cfg.you] : 0;
  const iAmHost = (cfg.you === (cfg.host | 0));
  const lvl = (chairs.map(s => s && s.level).find(v => v)) || 2;

  leave();
  injectCSS();
  startMatch({ lvl,
               bots: chairs.map(s => (s && s.kind === 'cpu') ? 1 : 0) },
             cfg.seed >>> 0, null);
  M.net = Object.assign({}, cfg.net, { host:iAmHost, toGame, toRoom });
  M.me = meG;
  M.down = meG;                              /* draw YOUR team at the bottom */
  M.meta = chairs.map((s, gi) => ({
    name: String(s.name || (gi === meG ? T('You', 'Int') : T('Them', 'Huma'))).slice(0, 14),
    own:  gi === meG ? 'me' : (s.kind === 'cpu' ? 'ai' : 'net')
  }));
  /* a cpu chair is committed to the machine at tick 0, on the host only,
     so both phones flip that seat to the bot on the same tick. */
  chairs.forEach((s, gi) => {
    if (s && s.kind === 'cpu'){ if (iAmHost) E.setBot(M.st, gi, true, 0); M.st.pads[gi].bot = 1; }
  });
  measureD();
  seedInputs();

  P.show();
  openBoard(() => { const nx = M.net; leave(); if (nx && nx.onLeave) nx.onLeave(); else P.hub(); });
  startLoop();
  /* keep D fresh as the radio changes. The timer id lives in a LOCAL —
     the old `clearInterval(M.dTimer)` read M after leave() had nulled
     it and threw on every walk-out of an online match. */
  { const dT = setInterval(() => {
      if (M && M.net && !M.dead) measureD(); else clearInterval(dT);
    }, 3000);
    M.dTimer = dT; }

  /* my exclusive PADDLE goes out as one byte on its own {t:'skin'}
     action (§GHOST) — it reuses the DECLARED field `p`, so wire.fields
     does not grow and an older build's decWireX drops it whole. Said
     three times across the first seconds because a peer still inside
     its own onlineStart when the first copy lands has no M yet;
     idempotent on arrival, three messages a match, nothing the
     lockstep ever reads. (bomba's proven pattern, byte for byte.) */
  if (xEq('paddle')){
    const sayskin = () => {
      if (!M || M.dead || !M.net) return;
      fire(moveSubs, { seat: M.me, move: { t:'skin', p:1 }, src:'local' });
    };
    sayskin();
    setTimeout(sayskin, 1200);
    setTimeout(sayskin, 3500);
  }
  return null;
}

const NET_HOOKS = {
  live:      () => !!(M && !M.dead && !(M.st && M.st.over)),
  phase:     () => !M ? 'idle' : ((M.st && M.st.over) ? 'over' : 'play'),
  seed:      () => (M ? M.seed : null),
  gameId:    () => (M ? 'briks' : null),
  turn:      () => -1,                       /* real-time: nobody is on turn */
  over:      () => (M && M.st ? M.st.over : null),
  moveCount: () => (M ? M.tick : 0),
  check:     () => (M && M.st ? (E.check(M.st).join('; ') || '') : ''),
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
    /* the phone that walked out: hand its seat to the machine at an
       agreed tick so both remaining phones flip on the same tick. */
    if (!M || M.dead || !M.net) return;
    const g = M.net.toGame[seat];
    if (g === undefined || !M.st.pads[g]) return;
    const at = M.tick + M.D;
    E.setBot(M.st, g, true, at);
    if (M.net.host) say(g, { t:'bot', forTick: at, on:1 });
    try { K.toast(T('Opponent left — the machine takes over.',
                    'L-avversarju telaq — il-magna tieħu post.')); } catch(e){}
  },
  /* THE 1v1 WALK-OUT IS A WIN — and briks is always 1v1, so this is the
     door every real departure now comes through (js/mp.js prefers it over
     seatGone above, which stays for older mp.js builds — handing the wall
     to a machine is not what the leave sheet promised the stayer). The
     pot was already settled in mp.js (idempotent; a friendly table moves
     nothing) and is stashed for finish() to paint; finish()'s M.finished
     latch keeps the single id-guarded award to one firing. */
  soleWin: (seat, pot) => {
    if (!M || M.dead || M.finished || !M.net) return;
    if (M.st.over) return;
    M.st.over = { winner: M.me, sole: true };
    M.solePot = pot || null;
    finish();
  }
};

P.online = P.online || {};
P.online.briks = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  live: () => NET_HOOKS.live(),
  hooks: NET_HOOKS
};

/* ═══════════════════════════════════════════════════════════════════
   THE MENU — the themed sheet, rules folded shut at the bottom.
   ═══════════════════════════════════════════════════════════════════ */
function heroCanvas(){
  /* the identity piece: the court drawn with the real geometry so the
     menu and the arena are unmistakably the same game. One paint. */
  const cv = document.createElement('canvas');
  const w = 190, h = 108, dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  /* two little walls and a ball between them */
  const cols = 6, bw = w / cols, bh = 8;
  for (let r = 0; r < 2; r++){
    for (let c = 0; c < cols; c++){
      g.fillStyle = (r === 0)
        ? (c % 2 ? '#5FC8FF' : '#164C6E')
        : (c % 2 ? '#FFC542' : '#8A5A0E');
      const y = (r === 0) ? 6 + (1 - r) * 0 : h - 14;
      g.globalAlpha = 0.9;
      const yy = (r === 0) ? 6 : h - 14;
      roundRectH(g, c * bw + 2, yy, bw - 4, bh, 3); g.fill();
    }
  }
  g.globalAlpha = 1;
  /* paddles */
  g.fillStyle = '#5FC8FF'; roundRectH(g, w * 0.4, 20, w * 0.2, 5, 2.5); g.fill();
  g.fillStyle = '#FFC542'; roundRectH(g, w * 0.32, h - 26, w * 0.2, 5, 2.5); g.fill();
  /* the ball */
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(w * 0.56, h * 0.5, 5, 0, 6.2832); g.fill();
  g.fillStyle = 'rgba(255,255,255,.18)';
  g.beginPath(); g.arc(w * 0.56, h * 0.5, 10, 0, 6.2832); g.fill();
  return cv;
}
function roundRectH(g, x, y, w, h, r){
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
   THE ENTRY SCREEN — minimal by house standard. A few big choices in a
   fixed order: PLAY ONLINE on top and emphasised, PLAY WITH AI below,
   and a RULES button that opens a slide-up (never rules dumped on the
   screen). NO settings here. Difficulty for the AI is a SECOND, tidy
   step reached only after you pick "with the machine"; a default is
   remembered so a fast player can go straight through.

   IL-ĦAJT is real-time and simultaneous — there are no turns to hand
   over — so there is no pass-the-phone mode, and it is not shown.
   ═══════════════════════════════════════════════════════════════════ */
let mView = 'home';            /* 'home' | 'diff'  — the entry step      */
function menu(){
  injectCSS();
  P.show();
  stopLoop(); M = null; UI = null;
  mView = 'home';
  paintMenu();
}

function paintMenu(){
  const el = P.ui.screenEl();
  const p = pref();
  let lvl = Math.max(1, Math.min(3, p.lvl || 2));

  const head =
    '<div class="tbar">' +
      '<button class="iconbtn" id="bk-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>IL-ĦAJT</h2>' +
    '</div>';

  const hero =
    '<div class="bk-hero" id="bk-hero" aria-hidden="true">' +
      '<span class="bk-hero-cap">1 v 1</span>' +
    '</div>';

  function homeBody(){
    return '<div class="scroll">' + hero +
      '<p class="blurb">' +
        T('Two paddles, two walls, one ball that never stops. Defend your bricks and break ' +
          'theirs — where you catch the ball is where you aim it.',
          'Żewġ rakketti, żewġ ħitan, ballun wieħed li qatt ma jieqaf. Iddefendi l-brikks tiegħek ' +
          'u kisser tagħhom — fejn taqbad il-ballun hu fejn timmirah.') +
      '</p>' +
      '<div class="bk-modes">' +
        '<button class="bk-mode primary" id="bk-online">' +
          '<span class="bk-badge">1 v 1</span>' +
          '<b>' + esc(T('Play online', 'Ilgħab onlajn')) + '</b>' +
          '<i>' + esc(T('Against another phone.', 'Kontra mowbajl ieħor.')) + '</i>' +
        '</button>' +
        '<button class="bk-mode ghost" id="bk-ai">' +
          '<b>' + esc(T('Play with the machine', 'Ilgħab mal-magna')) + '</b>' +
          '<i>' + esc(T('Solo, offline. Pick how hard next.', 'Waħdek, offlajn. Agħżel kemm iebes wara.')) + '</i>' +
        '</button>' +
      '</div>' +
      '<button class="bk-rulesbtn" id="bk-rulesbtn">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/></svg>' +
        esc(T('How to play', 'Kif tilgħab')) +
      '</button>' +
    '</div>';
  }

  function diffBody(){
    return '<div class="scroll">' + hero +
      '<p class="blurb">' +
        T('How hard should the machine play?', 'Kemm għandha tilgħab iebes il-magna?') +
      '</p>' +
      '<div class="bk-diff" id="bk-lvl">' +
        [1, 2, 3].map(k => {
          const w = levelWords(k);
          return '<button class="pt-opt' + (lvl === k ? ' on' : '') + '" data-lvl="' + k + '">' +
            '<b>' + esc(w.n) + '</b><i>' + esc(w.i) + '</i></button>';
        }).join('') +
      '</div>' +
      '<button class="btn primary" id="bk-go" style="margin:14px 0 4px">' +
        esc(T('Start', 'Ibda')) + '</button>' +
    '</div>';
  }

  el.innerHTML =
    '<div class="pt-wrap bk-menu">' + head +
      (mView === 'diff' ? diffBody() : homeBody()) +
    '</div>' +
    /* the menu-level rules sheet + scrim — the clean slide-up, always in
       the DOM so it can animate in and out */
    '<div class="bk-scrim" id="bk-scrim"></div>' +
    '<div class="bk-msheet" id="bk-msheet" role="dialog" aria-modal="true" aria-hidden="true">' +
      '<div class="bk-msheet-h"><h4>IL-ĦAJT — ' + esc(T('the rules', 'ir-regoli')) + '</h4>' +
        '<button class="bk-msheet-x" id="bk-msheet-x" aria-label="' +
          esc(T('Close', 'Agħlaq')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="bk-msheet-b"><ul>' +
        rulesFor().map(r => '<li>' + r + '</li>').join('') +
      '</ul></div>' +
    '</div>';

  const heroEl = el.querySelector('#bk-hero');
  if (heroEl){ try { heroEl.insertBefore(heroCanvas(), heroEl.firstChild); } catch(e){} }

  /* the rules slide-up, at menu level */
  const sheet = el.parentNode ? el.querySelector('#bk-msheet') : el.querySelector('#bk-msheet');
  const scrim = el.querySelector('#bk-scrim');
  function openSheet(open){
    if (sheet){ sheet.classList.toggle('open', open); sheet.setAttribute('aria-hidden', open ? 'false' : 'true'); }
    if (scrim) scrim.classList.toggle('open', open);
    cue(open ? 'ui.sheet' : 'ui.close');
  }
  const rb = el.querySelector('#bk-rulesbtn');
  if (rb) rb.onclick = () => openSheet(true);
  const rx = el.querySelector('#bk-msheet-x');
  if (rx) rx.onclick = () => openSheet(false);
  if (scrim) scrim.onclick = () => openSheet(false);

  /* the back arrow: from the difficulty step it goes back to the modes;
     from the modes it leaves to the hub. Never a popup. */
  el.querySelector('#bk-back').onclick = () => {
    cue('ui.back');
    if (mView === 'diff'){ mView = 'home'; paintMenu(); }
    else P.hub();
  };

  if (mView === 'home'){
    const on = el.querySelector('#bk-online');
    if (on) on.onclick = () => {
      cue('ui.tap');
      /* online is relay-gated: hand off to the party lobby if it exists,
         otherwise say so honestly through the rules sheet's own copy. */
      openOnline();
    };
    const ai = el.querySelector('#bk-ai');
    if (ai) ai.onclick = () => { cue('ui.tap'); mView = 'diff'; paintMenu(); };
  } else {
    el.querySelectorAll('#bk-lvl [data-lvl]').forEach(b => {
      b.onclick = () => { lvl = +b.getAttribute('data-lvl'); cue('ui.toggle'); pref({ lvl }); paintMenu(); };
    });
    const go = el.querySelector('#bk-go');
    if (go) go.onclick = () => { cue('ui.tap'); pref({ lvl }); newGame({ lvl }); };
  }
}

/* PLAY ONLINE — route into the party lobby for this game if the app
   offers one; otherwise tell the player the honest status (the server
   does not know the word yet) via a toast and fall back to the AI step
   so the tap is never a dead end. */
function openOnline(){
  try {
    if (P.lobbyFor){ P.lobbyFor('briks'); return; }
    if (P.openLobby){ P.openLobby('briks'); return; }
    if (K && K.go && P.online && window.KARTI_MP && KARTI_MP.GAMES &&
        KARTI_MP.GAMES.indexOf && KARTI_MP.GAMES.indexOf('briks') >= 0){
      /* the relay knows the word — let mp.js drive the room */
      if (window.KARTI_MP.openRoom){ window.KARTI_MP.openRoom('briks'); return; }
    }
  } catch(e){}
  /* not available: say why, then drop into the AI difficulty step */
  try { K.toast(T('Online rooms for IL-ĦAJT are not open on the server yet — playing the machine.',
                  'Il-kmamar onlajn għal IL-ĦAJT għadhom mhux miftuħa fuq is-server — ' +
                  'nilagħbu mal-magna.')); } catch(e){}
  cue('ui.denied');
  mView = 'diff';
  paintMenu();
}

/* ═══════════════════════════════════════════════════════════════════
   THE ONLINE LOBBY CONTRACT — published so IL-ĦAJT is a first-class
   room citizen the day the server knows the word, and canStart()
   refuses in words until then (serp/poker's identical decision). It is
   deliberately NOT taught to KARTI_MP.GAMES: offering a room the relay
   rejects is worse than not offering one.
   ═══════════════════════════════════════════════════════════════════ */
const ONLINE_WHY = T(
  'Online IL-ĦAJT is written and ready on this phone — input-delay lockstep through the relay, ' +
  'just like Serp — but the KARTI server does not know the word "briks" yet, so it will not open ' +
  'a room. Nothing here is missing; one line on the server is. Until then it is you against the machine.',
  'IL-ĦAJT onlajn hu miktub u lest fuq dan it-telefon — lockstep b’dewmien tal-input mir-relay, ' +
  'bħal Serp — imma s-server tal-KARTI għadu ma jafx il-kelma "briks", mela mhux se jiftaħ kamra. ' +
  'Xejn hawn ma jonqos; linja waħda fuq is-server tonqos. Sa dakinhar, int kontra l-magna.');

R.lobby = {
  id:'briks',
  name:'Il-Ħajt',
  mt:'Il-Ħajt',
  minSeats: 2,
  maxSeats: 2,
  levels: LEVELS,
  defaultLevel: 2,
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu')
    ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    if (!(window.KARTI_PARTY && window.KARTI_PARTY.online && window.KARTI_PARTY.online.briks))
      return { ok:false, why: ONLINE_WHY };
    const n = (seatList || []).length;
    if (n < 2) return { ok:false, why: T('Il-Ħajt needs two.', 'IL-ĦAJT irid tnejn.') };
    if (n > 2) return { ok:false, why: T('Only two can play.', 'Tnejn biss jistgħu jilagħbu.') };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready) return { ok:false, why: unready + (unready > 1
        ? T(' people are not ready yet.', ' persuni għadhom mhux lesti.')
        : T(' person is not ready yet.', ' persuna għadha mhux lesta.')) };
    return { ok:true, why:'' };
  },
  rulesHTML: () => '<ul>' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul>' +
                   '<p>' + esc(ONLINE_WHY) + '</p>',
  blurb: T('Defend your wall, break theirs. The ball never stops and the aim is in the bounce.',
           'Iddefendi l-ħajt tiegħek, kisser tagħhom. Il-ballun qatt ma jieqaf u l-mira fir-rimbalz.'),
  myName(){
    try {
      const n = K.displayName && K.displayName();
      if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
        return String(n).trim().slice(0, 14);
    } catch(e){}
    return T('You', 'Int');
  },
  start: (seatList, o) => newGame({
    lvl: ((seatList || []).map(s => s && s.level).find(v => v)) || pref().lvl || 2
  }),
  wire: { fields: BK_WIRE_FIELDS },
  takeback: false
};

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF — one tile on the BOARD shelf, alongside serp, chess, dama.
   register() replaces by id, so wiring the same descriptor twice costs
   nothing.
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'briks', order:28, kind:'board', name:'IL-ĦAJT', mt:'Il-Ħajt',
  sprite:'bk-t-briks', status:'live',
  get tag(){
    return T('Two paddles, two walls, one ball that never dies. Defend your bricks, break theirs, ' +
             'and aim every return with where you catch it.',
             'Żewġ rakketti, żewġ ħitan, ballun wieħed li qatt ma jmut. Iddefendi l-brikks tiegħek, ' +
             'kisser tagħhom, u immira kull daqqa lura b’fejn taqbadha.');
  },
  open: () => menu(),
  seats: { min:2, max:2 },
  levels: LEVELS,
  rulesHTML: () => R.lobby.rulesHTML()
};
R.shelfTile = TILE;
R.open = () => menu();
R.close = () => { leave(); P.hub(); };
P.register(TILE);

if (document.body) injectDefs();
else document.addEventListener('DOMContentLoaded', injectDefs);

/* ── test hooks — inert unless the page is opened with ?pttest ────── */
try {
  if (String(location.search).indexOf('pttest') >= 0){
    window.__BK_TEST = {
      engine: E,
      M: () => M,
      st: () => (M ? M.st : null),
      UI: () => UI,
      menu, newGame, leave,
      /* start a match this test drives by hand: no rAF, no countdown */
      manual: (opts, seed) => {
        injectCSS(); P.show();
        startMatch(opts || { lvl:2 }, seed == null ? 12345 : seed);
        M.me = 0; M.down = 0;
        M.meta = [{ name:'You', own:'me' }, { name:'AI', own:'ai' }];
        E.setBot(M.st, 1, true, 0);
        E.setBot(M.st, 0, false, 0);
        M.st.pads[1].bot = 1;
        seedInputs();
        M.lead = 0;
        return M;
      },
      /* drive the match without the clock */
      solo: n => { for (let i = 0; i < (n | 0); i++){ if (!doTick()) break; } return M.tick; },
      tickOnce: () => { doTick(); return M.tick; },
      aim: tx => aimAt(tx),
      aimFrac: fr => { const { lo, hi } = laneRange();
                       aimAt(Math.round(lo + (hi - lo) * Math.max(0, Math.min(1, fr)))); },
      thumbX: () => (M ? M.thumbX : null),
      ghost: () => { if (M) M.ghostX = E.ghost(M.st, M.me, M.lastForTick); return M ? M.ghostX : null; },
      draw, fitCanvas, hud, board, openBoard,
      rules: () => rulesOpen, setRules,
      flash,
      lobby: R.lobby, tile: TILE,
      hooks: NET_HOOKS,
      remote: (seat, wire) => onlineRemote(seat, wire),
      say,
      fps: () => (M ? M.fps.val : 0),
      store: () => ST,
      /* the Arcade Ghost, provable from a harness */
      xEq, skins: () => (M ? M.skins : null), cosmImg
    };
  }
} catch(e){}

/* keep the local paddle prediction fresh for the draw: recompute the
   ghost once per frame off the committed targets. Done here (not in the
   hot draw path's inner loops) so draw() stays a pure paint. */
(function ghostPump(){
  function pump(){
    if (M && !M.dead && M.st && !M.finished){
      try { M.ghostX = E.ghost(M.st, M.me, M.lastForTick); } catch(e){}
    }
    requestAnimationFrame(pump);
  }
  requestAnimationFrame(pump);
})();

})();
