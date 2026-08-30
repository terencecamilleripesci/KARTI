/* ═══════════════════════════════════════════════════════════════════
   KARTI — kiri-ui.js
   IL-KIRI · THE SCREEN

   THE PHONE PROBLEM, AND WHAT WE DID ABOUT IT
   A property board is a big flat object designed for a table. Shrunk
   to 440 points wide it becomes forty unreadable stamps, and the
   usual answer — pinch and pan — means you are dragging the board
   around instead of playing on it.

   So the board here is a MAP, not a document. Thirty-two squares in a
   9x9 ring, every cell 44 points or better, carrying only what a map
   needs: the colour of the group, who owns it, how many floors are on
   it, and where everybody is standing. Nothing on a cell is meant to
   be read as a sentence.

   Everything you actually READ lives in two places that are always
   big enough:
     · the middle of the ring — the dice, the square you are on, and
       what the game is waiting for
     · the dock underneath — four tabs: the current SQUARE in full,
       your DEEDS as a list you can build and mortgage from, the
       TABLE (everybody's money, and the button that starts a trade),
       and the LOG.
   Tapping any square opens its full sheet. Nothing scrolls sideways,
   nothing is under 44 points, and no text is smaller than 11px.

   HOUSE RULES THIS FILE OBEYS
     · index.html and css/ belong to other parts of the build, so this
       file builds its own <section id="scr-kiri"> at runtime and
       injects its stylesheet once, the way js/mp.js and js/party.js do
     · its own storage key, karti_kiri_v1, via js/kiri.js
     · nothing here puts transform / filter / backdrop-filter on
       anything that could be an ancestor of .tabbar
     · the game is fully playable with NO artwork. Every square is a
       CSS chip with an emoji. When art/kiri/*.jpg exists it is used
       as a wash behind the square sheet, and if it does not, nobody
       can tell.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

/* loaded twice — a stale service worker, a duplicated <script> — is a
   real way to end up with two sets of listeners on one board. */
if (window.KARTI_KIRI) return;


const K  = window.KIRI;
const AI = window.KIRI_AI;
if (!K || !AI) return;

const KA = window.KARTI || {};
const P  = window.KARTI_PARTY || null;
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');
const esc = KA.esc || function(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
};
const money = K.money;
/* js/artkit.js's silhouettes, if it is on the page. It always is in the
   app; a bare test harness that loads only this file still draws. */
const artkit = () => window.KARTI_ART || null;

/* ═══════════════════════════════════════════════════════════════════
   SOUND
   js/sfx.js owns ./audio/ and every path in it is a no-op on a missing
   file, so these are plain calls with no guard beyond "does the layer
   exist". We add no files and register no ids — every one of these is
   already in its registry.

   THREE THINGS THIS SECTION EXISTS TO GET RIGHT
   ───────────────────────────────────────────────────────────────────
   1. THE MACHINE MUST MAKE THE SAME NOISES YOU DO. Two thirds of the
      seats at a normal table are the phone. Hanging sounds off button
      handlers only ever sounds a third of the game, so every game
      moment comes from js/kiri.js's fx() bus instead — the machine
      goes through exactly the same engine functions a finger does, so
      it gets the same sounds for nothing.

   2. NOTHING MAY LAND ON TOP OF ANYTHING ELSE. A machine turn can
      resolve a roll, a move, a salary, a rent payment and the end of
      the turn inside one frame. Five files starting together is not a
      game, it is a crash. So nothing plays immediately: everything
      goes into cue(), which spaces sounds GAP apart, and when the
      queue runs long it DROPS the least important rather than playing
      late — sfx.js's own note, "late audio is worse than no audio".

   3. THE DELEGATED LAYER ALREADY SOUNDED THE BUTTON. sfx.js puts
      ui.tap on every <button> in the app, including all of ours. A
      hand-rolled sound on the same click is a second file on the same
      frame — two different ids, so the 40 ms dedupe does not save us.
      Everything here is therefore a CONSEQUENCE, played at least LEAD
      ms after the finger, never a second opinion about the tap. The
      chrome (setup toggles, tabs, close buttons) is left entirely to
      the delegated layer.
   ═══════════════════════════════════════════════════════════════════ */
function sfx(id, opts){
  try { if (window.KARTI_SFX && KARTI_SFX.play) KARTI_SFX.play(id, opts); } catch(e){}
}
/* the pitched kalimba — one file, a different rate per step */
function snote(step, opts){
  try { if (window.KARTI_SFX && KARTI_SFX.note) KARTI_SFX.note(step, opts); } catch(e){}
}

/* ── the spacer ────────────────────────────────────────────────────
   GAP  — how far apart two of our sounds may land
   LEAD — the shortest gap between the tap that caused it and the
          sound of what it did; enough that they read as cause and
          effect and not as one clipped noise
   MAX  — how deep the queue may get before we start dropping. Four is
          about a second of backlog; past that the sound is describing
          something that is no longer on screen.
   OLD  — anything that has waited this long is stale and goes, unless
          it is important enough (pri 0/1) to be worth being late.  */
const GAP = 130, LEAD = 85, MAXQ = 4, OLD = 900;
let Q = [], qT = 0, qAt = 0;

function cue(id, opts, pri, step){
  if (!id && step == null) return;
  Q.push({ id, opts, pri: pri == null ? 5 : pri, step, at: Date.now() });
  while (Q.length > MAXQ){
    /* keep the running order — drop the least consequential thing in
       the queue, latest first, so the news survives and the texture goes */
    let worst = 0;
    for (let i = 1; i < Q.length; i++) if (Q[i].pri >= Q[worst].pri) worst = i;
    Q.splice(worst, 1);
  }
  kick();
}

function kick(){
  if (qT || !Q.length) return;
  const wait = Math.max(LEAD, GAP - (Date.now() - qAt));
  qT = setTimeout(() => {
    qT = 0;
    const now = Date.now();
    let it;
    while ((it = Q.shift())){
      if (it.pri <= 1 || now - it.at < OLD) break;   /* stale texture, binned */
      it = null;
    }
    if (it){
      qAt = now;
      if (it.step != null) snote(it.step, it.opts); else sfx(it.id, it.opts);
    }
    kick();
  }, wait);
}

function hushQueue(){
  Q = [];
  if (qT){ clearTimeout(qT); qT = 0; }
}

/* is this seat a person sitting here, rather than the phone? */
const human = i => !!G && i >= 0 && i < G.players.length && !K.machineSeat(G, i);

/* ── HAPTICS ───────────────────────────────────────────────────────
   js/sfx.js owns the pattern, the player's switch and every no-op path
   (no motor, iOS, refused without a gesture), so there is nothing to
   guard here beyond the module being absent. Two rules only:

   NOT QUEUED. cue() above spaces SOUNDS apart because two files on one
   frame is a crash; a buzz has no such problem and, unlike a sound,
   a LATE buzz is a lie about when something happened. So haptics fire
   at the moment, and sfx.js's own 40 ms merge is the only spacing.

   AND ONLY FOR THIS PHONE'S OWN SEAT. `human()` is not enough — online,
   every other player is a human too. mine() is human AND, when there is
   a NET, this device's chair; the machine's dice and a remote player's
   houses make exactly the same noise and leave the hand still.       */
function buzz(kind){ try { const S = window.KARTI_SFX; if (S && S.haptic) S.haptic(kind); } catch(e){} }
const mine = i => human(i) && (!NET || i === NET.mySeat);

/* ── one game moment → one sound ───────────────────────────────────
   THE NUMBER IN `gain` IS A MULTIPLIER, NOT A LEVEL. sfx.js's fire()
   does `REG[id].g * opts.gain`, so 1 means "the level the registry
   already chose for this file" and everything here is a nudge either
   side of it. Getting that backwards is how a sound set ends up
   quieter the harder it tries.

   Which way to nudge is decided the way REG decides it: by FREQUENCY,
   not by importance. A roll and a token landing happen fifty times a
   game each and are pulled BELOW their registry level; a bankruptcy
   happens once and is pushed above it. And the machine is quieter
   than you are at the same thing — its rent, its purchases and its
   salary are background, yours are the news.                       */
function onFx(e){
  if (!live || !G) return;
  switch (e.k){
    /* ── heard constantly: under the registry level ── */
    case 'roll':
      if (mine(e.p)) buzz('roll');           /* HIS dice, tumbling in his hand */
      cue('dice.roll', { gain: 0.86 }, 3);
      /* a double is a free go, and it must be audibly not a plain roll:
         the dice, then the instrument up the pentatonic. */
      if (e.dbl) cue(null, { gain: 1.10 }, 4, 7);
      break;
    case 'move':   if (mine(e.p)) buzz('thud');   /* his token, arriving */
                   cue('piece.place', { gain: 0.78 }, 4); break;
    case 'turn':   if (human(e.p)) cue('duel.turn', { gain: 1.00 }, 4); break;

    /* ── money. The centre of the game, and the reason it hurts. ──
       Rent out of YOUR hand is the only thing in IL-KIRI pushed past
       its registry level; rent out of the phone's is background. */
    case 'pay': {
      const mine = human(e.from);
      cue('money.pay', { gain: mine ? (e.to >= 0 ? 1.12 : 1.00) : 0.70 }, e.to >= 0 ? 1 : 2);
      if (e.to >= 0 && human(e.to)) cue('ui.coin', { gain: 0.90 }, 1);
      else if (e.split && e.split.some(x => human(x.p))) cue('ui.coin', { gain: 0.75 }, 2);
      break;
    }
    case 'salary': cue('ui.coin', { gain: human(e.p) ? 0.92 : 0.50 }, 2); break;
    case 'get':    cue('ui.coin', { gain: human(e.p) ? 0.88 : 0.50 }, 2); break;

    /* ── deeds ── */
    case 'buy':
      if (mine(e.p)) buzz('tap');            /* he bought it */
      cue('money.pay', { gain: human(e.p) ? 1.00 : 0.70 }, 1);
      cue('ui.reward', { gain: human(e.p) ? 0.65 : 0.45 }, 2);
      break;
    case 'decline': cue('ui.back', { gain: 1.00 }, 3); break;

    /* ── the auction. Every bid is one step further up the scale, so
         a hard-fought lot literally climbs; the hammer is the bell. ── */
    case 'auction': cue('call.bell', { gain: 0.75 }, 2); break;
    case 'bid':     cue(null, { gain: 1.15 }, 3,
                        Math.max(0, Math.min(9, Math.round((e.amt / (e.price || 100)) * 6)))); break;
    case 'aucOut':  cue('ui.back', { gain: 0.80 }, 4); break;
    case 'hammer':
      cue('call.bell', { gain: 1.00 }, 1);
      if (e.p >= 0) cue('money.pay', { gain: human(e.p) ? 1.00 : 0.70 }, 2);
      break;

    /* ── concrete ── */
    case 'build':
      if (mine(e.p)) buzz('thud');           /* the concrete goes down */
      cue('duel.summon', { gain: e.pent ? 1.05 : 0.90 }, 2);
      if (e.pent) cue('ui.reward', { gain: 0.85 }, 3);
      break;
    case 'sell':     cue('duel.destroy', { gain: 0.85 }, 2); cue('ui.coin', { gain: 0.62 }, 3); break;
    /* a mortgage is the deed coming off the board and cash going on */
    case 'mortgage': cue('piece.lift', { gain: 1.15 }, 2); cue('ui.coin', { gain: 0.65 }, 3); break;
    case 'redeem':   cue('money.pay', { gain: 0.95 }, 2); cue('piece.place', { gain: 0.95 }, 3); break;

    /* ── the queue at counter four ── */
    case 'jail':   cue('duel.trap', { gain: 0.95 }, 1); break;
    case 'freed':  cue('ui.reward', { gain: 0.85 }, 2); break;
    case 'stuck':  cue('ui.error', { gain: 0.75 }, 3); break;

    /* ── paper ── */
    case 'card':   cue('card.throw', { gain: 1.00 }, 2); break;
    case 'trade':  cue('ui.reward', { gain: 0.85 }, 2); break;

    /* ── heard once, and remembered: at or above the registry level ── */
    /* a refusal is the one thing worth buzzing even when it is quiet —
       it is the only feedback that the tap did NOT take */
    case 'short':    if (mine(e.who)) buzz('no');
                     cue('ui.error', { gain: 1.05 }, 1); break;
    case 'refused':  if (mine(e.from)) buzz('no');
                     cue('ui.error', { gain: 0.90 }, 2); break;
    case 'nope':     if (mine(e.p)) buzz('no');
                     cue('ui.error', { gain: 0.80 }, 3); break;
    case 'bankrupt':
      cue(human(e.p) ? 'game.lose' : 'duel.destroy', { gain: 1.05 }, 0);
      break;
  }
}
try { K.onFx(onFx); } catch(e){}

/* ═══════════════════════════════════════════════════════════════════
   1. THE STYLESHEET — injected once, entirely scoped to #scr-kiri
   ═══════════════════════════════════════════════════════════════════ */
let cssIn = false;
function injectCSS(){
  if (cssIn || document.getElementById('kiri-css')) { cssIn = true; return; }
  cssIn = true;
  const st = document.createElement('style');
  st.id = 'kiri-css';
  st.textContent =
  '#scr-kiri{position:absolute;inset:0;display:none;flex-direction:column;' +
    'background:radial-gradient(120% 80% at 50% -10%,#241A3E 0%,#0E0B14 62%);' +
    'color:#F4EFFF;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
    'padding:calc(env(safe-area-inset-top,0px) + 4px) 8px calc(env(safe-area-inset-bottom,0px) + 6px);' +
    'overflow:hidden;z-index:5}' +
  '#scr-kiri.on{display:flex}' +
  '#scr-kiri *{box-sizing:border-box}' +
  '#scr-kiri button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation}' +

  /* ── title bar ── */
  '#scr-kiri .kr-tbar{display:flex;align-items:center;gap:8px;min-height:46px;flex:0 0 auto}' +
  '#scr-kiri .kr-tbar h2{margin:0;font-family:var(--disp);' +
    'font-size:17px;letter-spacing:.06em;flex:1;text-align:center}' +
  '#scr-kiri .kr-ib{width:44px;height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.14);' +
    'background:rgba(255,255,255,.05);display:grid;place-items:center;flex:0 0 auto}' +
  '#scr-kiri .kr-ib:active{background:rgba(255,255,255,.14)}' +
  '#scr-kiri .kr-ib svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;' +
    'stroke-linecap:round;stroke-linejoin:round}' +
  '#scr-kiri .kr-round{font-size:11px;font-weight:800;letter-spacing:.05em;padding:6px 9px;border-radius:9px;' +
    'background:rgba(255,197,66,.13);color:#FFC542;border:1px solid rgba(255,197,66,.3);white-space:nowrap}' +

  /* ── the turn strip ── */
  '#scr-kiri .kr-strip{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 10px;' +
    'border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.10);' +
    'margin:4px 0;flex:0 0 auto}' +
  '#scr-kiri .kr-who{font-weight:800;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  '#scr-kiri .kr-cash{margin-left:auto;font-weight:900;font-size:15px;color:#FFC542;white-space:nowrap}' +
  '#scr-kiri .kr-auto{font-size:10px;font-weight:800;letter-spacing:.04em;padding:4px 7px;border-radius:7px;' +
    'background:rgba(138,92,255,.22);color:#C4AEFF;border:1px solid rgba(138,92,255,.45);white-space:nowrap}' +
  '#scr-kiri .kr-back{min-height:34px;padding:0 10px;border-radius:9px;border:1px solid #3DDC84;' +
    'background:rgba(61,220,132,.16);color:#3DDC84;font-weight:800;font-size:11px;white-space:nowrap}' +

  '#scr-kiri .kr-away{display:flex;align-items:center;gap:7px;min-height:40px;padding:4px 8px;margin-bottom:4px;' +
    'border-radius:11px;background:rgba(138,92,255,.16);border:1px solid rgba(138,92,255,.42);flex:0 0 auto}' +
  '#scr-kiri .kr-away .kr-awt{flex:1;min-width:0;font-size:11.5px;line-height:1.25;color:#D9CFF2}' +
  '#scr-kiri .kr-away .kr-awt b{color:#F4EFFF}' +
  /* the transport's one line, warmer when it is bad news */
  '#scr-kiri .kr-away.warn{background:rgba(255,84,104,.16);border-color:rgba(255,84,104,.45)}' +
  '#scr-kiri .kr-away.warn .kr-awt{color:#FF9AA6}' +

  /* ── THE BOARD, AS AN OBJECT ────────────────────────────────────
     It used to be thirty-two flat rectangles in a dark box, which is
     correct and reads like a spreadsheet. A board is a THING on a
     table: it has a rim you could pick it up by, tiles that sit down
     into it, and a middle that is the middle of a table rather than
     a hole. All of that is CSS — gradients, layered shadows, one
     inset highlight along the top edge for a single light source
     above and behind, exactly the lighting js/artkit.js's surfaces
     are drawn to. No image is loaded and none is needed.

     THE RING IS DEEPER THAN THE SQUARES ARE WIDE. A real board's edge
     squares are narrower across than they are deep, and that one
     ratio is most of why a board looks like a board: --rail sets the
     two outer grid tracks to 1.28 of the seven inner ones, so the
     ring reads as a band with room for a name AND a price instead of
     a strip of tiny boxes.

     1.18 is the measured compromise, not a taste. At 440 points wide a
     flat 9x9 gives 43 by 43; 1.18 gives 42 by 50, so a square is two
     thirds of a point narrower to the finger and seven points deeper
     to the eye — which is where the code, the price and the floors
     have to live. Any deeper and the tap target starts to be the
     thing you notice. */
  /* ── THE STAGE ──────────────────────────────────────────────────
     The board no longer sits in a centred grid cell that is exactly
     its own size. It sits INSIDE a stage — a window it can be bigger
     than — because the ring is now something you can pinch, drag and
     double-tap. The stage takes every point the dock is not using
     (flex:1) and clips; the board is absolutely positioned inside it
     and moved with ONE transform. The page itself still cannot
     scroll: #scr-kiri is inset:0 with overflow:hidden and the stage
     has overflow:hidden of its own, so there is nowhere for a scroll
     to come from. touch-action:none is what stops the browser
     claiming the pinch before we see it.

     The negative side margin is the screen's own 8-point padding
     given back: the ring is the one thing on this screen that should
     touch the glass, and on a 440-point phone that is sixteen points
     of board (nearly four per cent) for nothing. */
  '#scr-kiri .kr-wrap{flex:1 1 auto;min-height:0;min-width:0;position:relative;overflow:hidden;' +
    'margin:2px -8px 0;touch-action:none;-webkit-user-select:none;user-select:none}' +
  '#scr-kiri .kr-board{position:absolute;left:0;top:0;transform-origin:0 0;' +
    '--rail:1.18fr;width:var(--bs,340px);height:var(--bs,340px);display:grid;gap:2px;' +
    'grid-template-columns:var(--rail) repeat(7,1fr) var(--rail);' +
    'grid-template-rows:var(--rail) repeat(7,1fr) var(--rail);' +
    'padding:7px;border-radius:18px;position:relative;' +
    'background:linear-gradient(158deg,#584174 0%,#3B2B62 16%,#281D46 44%,#1A1233 74%,#100B1F 100%);' +
    'border:1px solid rgba(255,197,66,.22);' +
    'box-shadow:inset 0 1.5px 0 rgba(255,255,255,.26),inset 0 0 0 1.5px rgba(255,197,66,.16),' +
      'inset 0 -14px 26px rgba(0,0,0,.45),0 2px 0 rgba(255,255,255,.05),' +
      '0 18px 34px rgba(0,0,0,.62),0 44px 64px rgba(0,0,0,.38)}' +

  /* a tile sits DOWN in the rim: dark face, one hairline of light on
     its top edge, and its own small shadow underneath */
  '#scr-kiri .kr-cell{position:relative;border-radius:5px;' +
    'background:linear-gradient(180deg,#2A2050 0%,#1C1438 55%,#150E2B 100%);' +
    'border:1px solid rgba(255,255,255,.06);' +
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 1px 2px rgba(0,0,0,.45);' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;' +
    'padding:2px;overflow:hidden;min-width:0;min-height:0;transition:filter .12s var(--ease,ease)}' +
  /* the group tint, under everything, so a colour group reads even
     where the strip itself is behind a token */
  '#scr-kiri .kr-cell::after{content:"";position:absolute;inset:0;pointer-events:none;' +
    'background:var(--g,transparent);opacity:.15}' +
  '#scr-kiri .kr-cell:active{filter:brightness(1.35)}' +

  /* ── EVERY SQUARE IS A PICTURE OF ITSELF ────────────────────────
     The drawing fills the tile and the code sits on top of it, which
     is the only arrangement that fits: a cell is forty-odd points and
     a mark stacked ABOVE a code plus a price is three lines in the
     room for two. Underneath at half strength it costs nothing, is
     the square's own object at a glance, and becomes a proper little
     illustration the moment you pinch — which is half the reason the
     zoom is here at all. The ink is js/artkit.js's warm near-black, declared
     here because .ka-g inherits --ka-ink from whatever contains it. */
  '#scr-kiri .kr-pic{position:absolute;z-index:0;pointer-events:none;--ka-ink:#0B0716;' +
    'display:grid;place-items:center;line-height:0;opacity:.5;' +
    /* the group colour is already on the band and in the tint of the
       tile, so the drawing takes a LIGHT version of it: enough that the
       Sliema squares are blue and the Ħamrun ones olive, not so much
       that a brown silhouette disappears into a brown tile */
    'color:color-mix(in srgb,var(--pc,#C6B4F0) 42%,#F1E9FF);' +
    'left:8%;right:8%;top:8%;bottom:8%}' +
  '#scr-kiri .kr-pic .ka-g{width:100%;height:100%;display:block;stroke-width:.9}' +
  '#scr-kiri .kr-cell.s-l .kr-pic{right:16%}' +
  '#scr-kiri .kr-cell.s-r .kr-pic{left:16%}' +
  '#scr-kiri .kr-cell.s-t .kr-pic{bottom:16%}' +
  '#scr-kiri .kr-cell.s-b .kr-pic{top:16%}' +
  /* a corner has no price and no group, so its drawing is the point of
     it: bigger, brighter, in the house gold, and ABOVE its name rather
     than behind it */
  '#scr-kiri .kr-cell.corner .kr-pic{opacity:.9;color:#FFC94E;left:12%;right:12%;top:5%;bottom:32%}' +
  '#scr-kiri .kr-cell.chance .kr-pic{opacity:.4;color:color-mix(in srgb,var(--g,#FFC542) 55%,#FFF4DC)}' +

  /* ── THE COLOUR STRIP FACES THE MIDDLE ──────────────────────────
     On every board ever printed the group colour runs along the edge
     of the square that faces the centre of the table, so the four
     bands frame the middle and you read a group as a block. Which
     edge that is depends only on which side of the ring the square
     is on, and that never changes, so the side is a class set once
     when the ring is built. The floors stand ON the strip, which is
     also where they stand on a real board. */
  '#scr-kiri .kr-cell .kr-band{position:absolute;z-index:1;background:var(--g,transparent);' +
    'display:flex;align-items:center;justify-content:center;gap:2px;overflow:hidden;' +
    'box-shadow:inset 0 0 0 1px rgba(0,0,0,.30)}' +
  '#scr-kiri .kr-cell.s-l .kr-band{right:0;top:0;bottom:0;width:8px;flex-direction:column}' +
  '#scr-kiri .kr-cell.s-r .kr-band{left:0;top:0;bottom:0;width:8px;flex-direction:column}' +
  '#scr-kiri .kr-cell.s-t .kr-band{bottom:0;left:0;right:0;height:8px}' +
  '#scr-kiri .kr-cell.s-b .kr-band{top:0;left:0;right:0;height:8px}' +
  '#scr-kiri .kr-cell.s-l{padding-right:10px}' +
  '#scr-kiri .kr-cell.s-r{padding-left:10px}' +
  '#scr-kiri .kr-cell.s-t{padding-bottom:10px}' +
  '#scr-kiri .kr-cell.s-b{padding-top:10px}' +
  /* a floor is a little block standing on the strip; the penthouse is
     one wide slab with a gold roofline, which is what it is */
  '#scr-kiri .kr-fl{flex:0 0 auto;width:4px;height:4px;border-radius:1px;background:#120C22;' +
    'box-shadow:0 0 0 1px rgba(255,255,255,.55)}' +
  '#scr-kiri .kr-fl.pent{width:15px;height:5px;border-radius:1.5px;background:#0E0B14;' +
    'box-shadow:0 0 0 1px #FFC542,0 0 6px rgba(255,197,66,.55)}' +
  '#scr-kiri .kr-cell.s-l .kr-fl.pent,#scr-kiri .kr-cell.s-r .kr-fl.pent{width:5px;height:15px}' +

  /* ── WHO OWNS IT reads on the OUTSIDE edge ──────────────────────
     Deliberately the opposite edge from the group strip, so the two
     never argue: colour groups point in, deeds point out, and the
     board grows a coloured hem as the table gets bought up. */
  '#scr-kiri .kr-cell .kr-own{position:absolute;z-index:1;background:var(--o,transparent);' +
    'box-shadow:inset 0 0 0 1px rgba(0,0,0,.35)}' +
  '#scr-kiri .kr-cell.s-l .kr-own{left:0;top:0;bottom:0;width:4px}' +
  '#scr-kiri .kr-cell.s-r .kr-own{right:0;top:0;bottom:0;width:4px}' +
  '#scr-kiri .kr-cell.s-t .kr-own{top:0;left:0;right:0;height:4px}' +
  '#scr-kiri .kr-cell.s-b .kr-own{bottom:0;left:0;right:0;height:4px}' +
  '#scr-kiri .kr-cell.mine{box-shadow:inset 0 0 0 1px var(--o),inset 0 1px 0 rgba(255,255,255,.09),' +
    '0 1px 2px rgba(0,0,0,.45)}' +

  /* THE TYPE IS A FRACTION OF THE BOARD, not a fixed number. The ring
     is drawn anywhere from 276 to 560 points across depending on the
     window, and 12.5px is right in the middle of that and wrong at
     both ends. clamp() keeps it readable on the smallest phone and
     stops it shouting on the biggest.

     AND IT NOW STANDS ON A DRAWING, so it carries its own night with
     it: a tight dark shadow plus two soft ones, which is what keeps a
     three-letter code readable over a silhouette without putting a
     plate behind it and losing the picture. */
  '#scr-kiri .kr-cell .kr-e{font-size:clamp(9px,calc(var(--bs,340px) * .0305),16px);line-height:1;' +
    'font-weight:900;letter-spacing:.02em;color:#FFFDF8;font-family:var(--disp);' +
    'text-shadow:0 1px 1.5px #08050F,0 0 5px rgba(8,5,15,.95),0 0 10px rgba(8,5,15,.8);' +
    'position:relative;z-index:1}' +
  '#scr-kiri .kr-cell .kr-p{font-size:clamp(7px,calc(var(--bs,340px) * .0215),11px);line-height:1;' +
    'font-weight:800;letter-spacing:.02em;color:#D9CBFF;position:relative;z-index:1;' +
    'text-shadow:0 1px 1.5px #08050F,0 0 5px rgba(8,5,15,.95)}' +
  '#scr-kiri .kr-cell.corner{background:linear-gradient(180deg,#3E2D63 0%,#2A1F50 55%,#1C1439 100%);' +
    'justify-content:flex-end}' +
  '#scr-kiri .kr-cell.corner .kr-e{font-size:clamp(8px,calc(var(--bs,340px) * .0265),14px);color:#FFC542}' +
  /* the two decks keep their ? and !, because a question mark IS the
     mark on every board ever printed — but it now stands in front of
     the deck's own drawing rather than on a bare tile */
  '#scr-kiri .kr-cell.chance .kr-e{font-size:clamp(13px,calc(var(--bs,340px) * .044),23px);' +
    'color:var(--g,#FFC542);text-shadow:0 1px 3px #06040C,0 0 8px var(--g,#FFC542)}' +
  /* where the piece is standing, lit from inside */
  '#scr-kiri .kr-cell.here{border-color:#FFC542;' +
    'box-shadow:inset 0 0 0 1px #FFC542,inset 0 0 14px rgba(255,197,66,.32),0 0 12px rgba(255,197,66,.30)}' +
  /* MORTGAGED: dimmed is not enough on a dark board, so it is also
     struck through with a hatch — the colour-blind reading of "this
     one is out of play" and the paper metaphor at the same time */
  '#scr-kiri .kr-cell.mort{filter:saturate(.35)}' +
  '#scr-kiri .kr-cell.mort::before{content:"";position:absolute;inset:0;z-index:2;pointer-events:none;' +
    'background:repeating-linear-gradient(45deg,rgba(255,84,104,.30) 0 2px,rgba(0,0,0,0) 2px 6px)}' +
  '#scr-kiri .kr-cell.mort .kr-e,#scr-kiri .kr-cell.mort .kr-p{opacity:.5}' +
  '#scr-kiri .kr-cell .kr-lock{position:absolute;top:1px;left:1px;z-index:3;font-size:8px;line-height:1;' +
    'font-weight:900;color:#0E0B14;background:#FF5468;border-radius:3px;padding:1px 2px}' +

  /* ── THE PIECES ARE THE PLAYERS' FACES ──────────────────────────
     A player already HAS a face everywhere else in KARTI — a drawn
     Maltese one, or their own photograph, with whatever border they
     have unlocked — and there is exactly one renderer for it. So the
     piece is that face, drawn by that renderer, and nothing here
     knows how to draw a face at all.

     THE SHAPE STAYED, AS THE FRAME. Eight faces at eighteen points
     are eight faces; the disc, square, diamond, triangle, pentagon,
     hexagon, bar and cross are what tell you WHICH IS YOURS across
     the width of a board without reading anything, and the ring is
     also where the seat colour lives. So the shape is now a collar
     the face sits in — clipped plate underneath, face centred on top
     at 74% — which keeps the never-colour-alone reading and does not
     crop anybody's chin.

     .kr-tok is the token anywhere a seat is named. --tz is its size
     in points, set by whoever writes it, because the face inside is
     a fixed pixel size handed to the renderer and the two must agree. */
  '#scr-kiri .kr-tok{position:relative;width:var(--tz,34px);height:var(--tz,34px);flex:0 0 auto;' +
    'display:grid;place-items:center;line-height:0}' +
  '#scr-kiri .kr-tok::before{content:"";position:absolute;inset:0;background:var(--c,#fff);' +
    'filter:drop-shadow(0 0 1.4px #0E0B14) drop-shadow(0 1.5px 1.5px rgba(0,0,0,.75))}' +
  '#scr-kiri .kr-tok > *{position:relative;z-index:1}' +
  '#scr-kiri .kr-tok .kx-av{display:block}' +
  /* the phone is playing this seat: the COLLAR is hatched, never the
     face — you must still be able to see who is not really there */
  '#scr-kiri .kr-tok.auto::before{background:repeating-linear-gradient(45deg,var(--c,#fff) 0 2.5px,' +
    'rgba(14,11,20,.9) 2.5px 5px)}' +
  /* THE EIGHT SHAPES, ONCE. The token wears them on its collar and the
     little owner chip on a sold square wears the same one at eight
     points, so "who has this" and "who is standing here" are the same
     eight silhouettes and never drift apart. */
  '#scr-kiri .kr-oc{position:relative;z-index:1;height:auto;aspect-ratio:1;background:var(--c,#fff);' +
    'width:clamp(6px,calc(var(--bs,340px) * .021),11px);' +
    'filter:drop-shadow(0 0 1.3px #0E0B14) drop-shadow(0 1px 1px rgba(0,0,0,.7))}' +
  '#scr-kiri .kr-tok.k0::before,#scr-kiri .kr-oc.k0{border-radius:50%}' +
  '#scr-kiri .kr-tok.k1::before,#scr-kiri .kr-oc.k1{border-radius:14%}' +
  '#scr-kiri .kr-tok.k2::before,#scr-kiri .kr-oc.k2{clip-path:polygon(50% -6%,106% 50%,50% 106%,-6% 50%)}' +
  '#scr-kiri .kr-tok.k3::before,#scr-kiri .kr-oc.k3{clip-path:polygon(50% -10%,112% 104%,-12% 104%)}' +
  '#scr-kiri .kr-tok.k4::before,#scr-kiri .kr-oc.k4{clip-path:polygon(50% -4%,104% 36%,86% 106%,14% 106%,-4% 36%)}' +
  '#scr-kiri .kr-tok.k5::before,#scr-kiri .kr-oc.k5{clip-path:polygon(25% -2%,75% -2%,104% 50%,75% 102%,25% 102%,-4% 50%)}' +
  '#scr-kiri .kr-tok.k6::before,#scr-kiri .kr-oc.k6{clip-path:polygon(-4% 16%,104% 16%,104% 84%,-4% 84%)}' +
  '#scr-kiri .kr-tok.k7::before,#scr-kiri .kr-oc.k7{clip-path:polygon(31% -4%,69% -4%,69% 31%,104% 31%,104% 69%,' +
    '69% 69%,69% 104%,31% 104%,31% 69%,-4% 69%,-4% 31%,31% 31%)}' +
  /* whose turn it is, on the board itself */
  '#scr-kiri .kr-tok.now::after{content:"";position:absolute;inset:-13%;border-radius:50%;' +
    'box-shadow:0 0 0 1.5px #FFC542,0 0 9px rgba(255,197,66,.75);pointer-events:none}' +

  /* ── WHO IS STANDING ON A SQUARE ────────────────────────────────
     Its own layer, one grid cell per square, laid over the tiles and
     NOT inside them: a tile is clipped (its picture has to be) and a
     crowd is not. The layer takes no taps — the tile underneath is
     still the thing you press, which is what opens the list of
     everybody on it.

     Eight people start on Il-Bidu. Eight faces do not go on one
     forty-point square at any size that is worth drawing, so the
     board shows as many as are worth showing and says +N for the
     rest, out loud, rather than quietly dropping anybody. How many
     fit is a function of the zoom, so pinching in genuinely reveals
     more of them, and tapping the square lists every single one with
     their name.

     A PIECE STANDS AT THE INNER EDGE AND OVERHANGS THE FELT, which is
     where a piece sits on a real board and is also the only place it
     can go: the square itself is where the code and the price are, and
     a token dropped in the middle of one covers both. Which edge is
     "inner" is the side the square is on, and the same class the
     colour strip uses says so. */
  '#scr-kiri .kr-toks{position:relative;z-index:6;pointer-events:none;min-width:0;min-height:0;' +
    'display:flex;flex-wrap:wrap;align-content:center;justify-content:center;' +
    'align-items:center;gap:1.5px;padding:0}' +
  '#scr-kiri .kr-toks.s-b{align-content:flex-start;top:-22%}' +
  '#scr-kiri .kr-toks.s-t{align-content:flex-end;top:22%}' +
  '#scr-kiri .kr-toks.s-l{justify-content:flex-end;left:22%}' +
  '#scr-kiri .kr-toks.s-r{justify-content:flex-start;left:-22%}' +
  '#scr-kiri .kr-toks.corner{align-content:flex-start;top:-14%}' +
  /* a corner with somebody standing on it lets its drawing go quiet —
     eight people start on one and the piece is the thing to look at */
  '#scr-kiri .kr-cell.corner.busy .kr-pic{opacity:.34}' +
  '#scr-kiri .kr-more{flex:0 0 auto;font-size:calc(var(--tz,18px) * .58);line-height:1;font-weight:900;' +
    'font-family:var(--disp);color:#FFE6A8;background:rgba(10,7,18,.88);border-radius:99px;' +
    'padding:calc(var(--tz,18px) * .16) calc(var(--tz,18px) * .24);' +
    'box-shadow:0 0 0 1px rgba(255,197,66,.55),0 1px 3px rgba(0,0,0,.7)}' +

  /* ── THE MIDDLE OF THE TABLE ────────────────────────────────────
     js/artkit.js's felt, the same cut as the kazin card table, with
     the game's name laid across it the way a board has its name laid
     across it, and the dice on top. The wordmark is drawn at 4% so it
     is furniture, not a label competing with the square you are
     standing on. */
  '#scr-kiri .kr-mid{grid-column:2/9;grid-row:2/9;border-radius:9px;position:relative;overflow:hidden;' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;' +
    'padding:8px;text-align:center;min-width:0;' +
    'box-shadow:inset 0 0 0 1px rgba(255,197,66,.20),inset 0 2px 10px rgba(0,0,0,.55),' +
      'inset 0 -16px 30px rgba(0,0,0,.45)}' +
  /* js/artkit.js's felt is drawn lit from above for a card table with
     the light on. Inside a board rim it is in shadow, so it gets one
     scrim — which also stops a bright green square from out-shouting
     the ring, which is the thing you are meant to be looking at. */
  '#scr-kiri .kr-mid::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;' +
    'background:radial-gradient(120% 90% at 50% 0%,rgba(4,12,8,.30),rgba(3,9,6,.72) 80%)}' +
  '#scr-kiri .kr-mid > *{position:relative;z-index:1}' +
  '#scr-kiri .kr-midmark{position:absolute;z-index:0;inset:0;display:grid;place-items:center;' +
    'pointer-events:none;overflow:hidden}' +
  '#scr-kiri .kr-midmark b{font-family:var(--disp);font-size:calc(var(--bs,340px) * .095);font-weight:900;' +
    'letter-spacing:.16em;color:#EAF6EE;opacity:.085;transform:rotate(-27deg);white-space:nowrap;' +
    'text-shadow:0 1px 0 rgba(0,0,0,.5)}' +

  /* real dice: three-by-three, pips drawn, ivory face with a lit top
     edge and a dark seat under it so they look like they are lying on
     the felt rather than printed on it */
  '#scr-kiri .kr-dice{display:flex;gap:9px}' +
  '#scr-kiri .kr-die{width:clamp(26px,calc(var(--bs,340px) * .085),46px);height:auto;aspect-ratio:1;' +
    'border-radius:9px;padding:11%;display:grid;gap:5%;' +
    'grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);' +
    'background:linear-gradient(158deg,#FFFCF2 0%,#F1E7D1 52%,#D9CBAE 100%);' +
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.9),inset 0 -2px 3px rgba(120,96,58,.4),' +
      '0 3px 0 rgba(0,0,0,.35),0 6px 12px rgba(0,0,0,.5)}' +
  '#scr-kiri .kr-die i{border-radius:50%;background:transparent}' +
  '#scr-kiri .kr-die i.on{background:radial-gradient(circle at 34% 30%,#4A3B2A,#160E06 70%);' +
    'box-shadow:inset 0 -.5px .5px rgba(255,255,255,.35)}' +
  '#scr-kiri .kr-die.idle i.on{opacity:.16}' +
  '#scr-kiri .kr-die.roll{animation:krshake .34s var(--ease,ease)}' +
  '@keyframes krshake{0%{transform:translateY(0) rotate(0)}30%{transform:translateY(-7px) rotate(-11deg)}' +
    '60%{transform:translateY(3px) rotate(9deg)}100%{transform:none}}' +
  '#scr-kiri .kr-midn{font-family:var(--disp);font-weight:900;font-size:14px;line-height:1.15;' +
    'letter-spacing:.03em;max-width:100%;text-shadow:0 1px 3px rgba(0,0,0,.7)}' +
  '#scr-kiri .kr-midmt{font-size:11px;color:#CFE6D8;font-style:italic;opacity:.85}' +
  '#scr-kiri .kr-midask{font-size:12px;color:#F4EFFF;background:rgba(6,16,11,.55);border-radius:9px;' +
    'border:1px solid rgba(255,255,255,.14);padding:6px 10px;line-height:1.3;max-width:100%}' +
  '#scr-kiri .kr-midask.warn{background:rgba(255,84,104,.28);color:#FFD3D8;border-color:rgba(255,84,104,.5)}' +
  /* what the bank has left, which is the one number that lives in the
     middle of a table rather than in anybody's hand */
  '#scr-kiri .kr-supply{display:flex;gap:8px;font-size:9px;font-weight:900;letter-spacing:.08em;' +
    'color:#BFD9C9;opacity:.9}' +
  '#scr-kiri .kr-supply span{display:flex;align-items:center;gap:3px}' +
  '#scr-kiri .kr-supply i{width:6px;height:6px;border-radius:1px;background:#120C22;' +
    'box-shadow:0 0 0 1px rgba(255,255,255,.6)}' +
  '#scr-kiri .kr-supply i.p{width:11px;height:5px;box-shadow:0 0 0 1px #FFC542}' +

  /* one square, at reading size, wherever it has to be named */
  '#scr-kiri .kr-plate{width:44px;height:52px;border-radius:7px;flex:0 0 auto;position:relative;' +
    'overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;' +
    'padding:0 2px 8px;background:linear-gradient(180deg,#2A2050,#150E2B);' +
    'box-shadow:inset 0 0 0 1px rgba(255,255,255,.10),0 3px 8px rgba(0,0,0,.5)}' +
  '#scr-kiri .kr-plate::after{content:"";position:absolute;left:0;right:0;bottom:0;height:7px;' +
    'background:var(--g,transparent)}' +
  '#scr-kiri .kr-plate .kr-e{font-family:var(--disp);font-size:13px;font-weight:900;line-height:1;' +
    'color:#F6F1FF;text-shadow:0 1px 2px rgba(0,0,0,.7)}' +
  '#scr-kiri .kr-plate.chance .kr-e{font-size:20px;color:var(--g,#FFC542)}' +
  '#scr-kiri .kr-plate .kr-pic{opacity:.5;left:12%;right:12%;top:8%;bottom:22%}' +
  '#scr-kiri .kr-plate.corner .kr-pic{opacity:.62;color:#FFC542}' +

  /* the winner, on a plate the size of a medal */
  '#scr-kiri .kr-crown{width:74px;height:74px;border-radius:50%;display:grid;place-items:center;' +
    'background:radial-gradient(70% 70% at 34% 26%,rgba(255,197,66,.35),rgba(14,11,20,.9));' +
    'box-shadow:0 0 0 2px rgba(255,197,66,.6),0 0 30px rgba(255,197,66,.35)}' +
  /* a cut cable, drawn: two ends and the gap between them */
  '#scr-kiri .kr-plug{width:76px;height:16px;border-radius:8px;' +
    'background:linear-gradient(90deg,#8A5CFF 0 40%,rgba(0,0,0,0) 40% 60%,#8A5CFF 60% 100%);' +
    'box-shadow:0 0 18px rgba(138,92,255,.5)}' +
  '#scr-kiri .kr-plug.no{background:linear-gradient(90deg,#FF5468 0 40%,rgba(0,0,0,0) 40% 60%,' +
    '#FF5468 60% 100%);box-shadow:0 0 18px rgba(255,84,104,.5)}' +

  /* ── ZOOM, WHERE IT CANNOT BE MISSED ────────────────────────────
     Pinch is the real gesture and double-tap is the quick one, but
     neither is discoverable and neither exists on a laptop, so the
     stage carries three small buttons in its own corner. FIT is the
     important one: it is the way back from having zoomed into a
     corner, it appears the instant the board is not fitted, and it is
     always exactly one tap. When the board IS fitted there is nothing
     to go back from, so it stands down and leaves + and − at half
     strength over the rim. */
  '#scr-kiri .kr-zoom{position:absolute;right:5px;bottom:5px;z-index:9;display:flex;gap:5px;align-items:center}' +
  '#scr-kiri .kr-zb{min-width:36px;height:36px;border-radius:11px;padding:0 8px;' +
    'border:1px solid rgba(255,255,255,.18);background:rgba(12,8,22,.72);color:#E7DEFF;' +
    'font-size:17px;font-weight:900;line-height:1;display:grid;place-items:center;opacity:.62}' +
  '#scr-kiri .kr-zb:active{background:rgba(138,92,255,.5);opacity:1}' +
  '#scr-kiri .kr-zb[disabled]{opacity:.22}' +
  '#scr-kiri .kr-zb.fit{font-size:11px;letter-spacing:.08em;font-family:var(--disp);opacity:1;' +
    'background:rgba(255,197,66,.92);border-color:#FFE29A;color:#2B1D00}' +
  '#scr-kiri .kr-zoom.fitted .fit{display:none}' +
  '#scr-kiri .kr-zoom.fitted .kr-zb{opacity:.45}' +

  /* ── the dock, which slides down ────────────────────────────────
     The four tabs are worth a third of the screen when you are
     reading a deed and worth nothing at all when you are looking at
     the board, so they fold away behind a grab handle the width of
     the dock. What stays when it is down is chosen, not left over:
     the turn strip above it (whose turn, and what they have) never
     belonged to the dock, and the ACTION BAR comes down with the
     handle — a collapsed dock that hides the one button the game is
     waiting on is worse than no collapse at all. The state is
     remembered, because it is a preference and not a mode. */
  '#scr-kiri .kr-dock{flex:0 0 var(--dockh,268px);min-height:0;display:flex;flex-direction:column;' +
    'gap:5px;margin-top:5px}' +
  '#scr-kiri .kr-dock.down{flex:0 0 auto}' +
  '#scr-kiri .kr-dock.down .kr-tabs,#scr-kiri .kr-dock.down .kr-pane{display:none}' +
  '#scr-kiri .kr-grip{flex:0 0 auto;min-height:32px;width:100%;border-radius:11px;padding:0 10px;' +
    'border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.05);' +
    'display:flex;align-items:center;justify-content:center;gap:8px;' +
    'font-size:10px;font-weight:900;letter-spacing:.1em;color:#8E80B4}' +
  '#scr-kiri .kr-grip:active{background:rgba(255,255,255,.13)}' +
  '#scr-kiri .kr-grip i{width:34px;height:4px;border-radius:2px;background:rgba(255,255,255,.30);' +
    'flex:0 0 auto}' +
  '#scr-kiri .kr-grip svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2.4;' +
    'stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto;transition:transform .16s var(--ease,ease)}' +
  /* DOWN, the handle is the only way back, so it grows to a full
     44-point target and says which tab it will open */
  '#scr-kiri .kr-dock.down .kr-grip{min-height:44px;background:rgba(138,92,255,.16);' +
    'border-color:rgba(138,92,255,.4);color:#C4AEFF}' +
  '#scr-kiri .kr-dock.down .kr-grip svg{transform:rotate(180deg)}' +
  '#scr-kiri .kr-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;flex:0 0 auto}' +
  '#scr-kiri .kr-tab{min-height:44px;border-radius:10px;border:1px solid rgba(255,255,255,.10);' +
    'background:rgba(255,255,255,.04);font-size:11px;font-weight:800;letter-spacing:.04em;color:#A093C4}' +
  '#scr-kiri .kr-tab[aria-selected="true"]{background:rgba(138,92,255,.22);border-color:rgba(138,92,255,.55);color:#F4EFFF}' +
  '#scr-kiri .kr-pane{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
    'border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);padding:8px}' +
  '#scr-kiri .kr-act{flex:0 0 auto;display:flex;gap:6px}' +
  '#scr-kiri .kr-btn{flex:1 1 0;min-height:50px;border-radius:12px;border:1px solid rgba(255,255,255,.14);' +
    'background:rgba(255,255,255,.06);font-weight:800;font-size:13px;line-height:1.15;padding:4px 6px;min-width:0}' +
  '#scr-kiri .kr-btn:active{transform:translateY(1px)}' +
  '#scr-kiri .kr-btn[disabled]{opacity:.38}' +
  '#scr-kiri .kr-btn.go{background:linear-gradient(180deg,#8A5CFF,#6a3fd8);border-color:#A98BFF;color:#fff}' +
  '#scr-kiri .kr-btn.buy{background:linear-gradient(180deg,#FFC542,#e0a520);border-color:#FFD87A;color:#2b1d00}' +
  '#scr-kiri .kr-btn.bad{background:rgba(255,84,104,.18);border-color:rgba(255,84,104,.5);color:#FF9AA6}' +
  '#scr-kiri .kr-btn.ok{background:rgba(61,220,132,.16);border-color:rgba(61,220,132,.5);color:#3DDC84}' +
  '#scr-kiri .kr-btn small{display:block;font-size:10px;font-weight:600;opacity:.8}' +
  /* a destructive button that has been asked once and is waiting for the
     second tap. It goes solid — the state has to be unmistakable, because
     the next tap is the one that cannot be taken back. */
  '#scr-kiri .kr-btn.bad.armed{background:#FF5468;border-color:#FF8A98;color:#2A0409;' +
    'box-shadow:0 0 0 3px rgba(255,84,104,.28);animation:krarm .18s var(--ease,ease)}' +
  '@keyframes krarm{from{transform:scale(.97)}to{transform:none}}' +
  '#scr-kiri .kr-saved{border-radius:14px;padding:9px;margin-bottom:10px;' +
    'background:rgba(255,197,66,.07);border:1px solid rgba(255,197,66,.26)}' +

  /* ── list rows in the dock ── */
  '#scr-kiri .kr-row{display:flex;align-items:center;gap:8px;min-height:46px;padding:5px 8px;border-radius:10px;' +
    'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);margin-bottom:5px;width:100%;text-align:left}' +
  '#scr-kiri .kr-row .kr-sw{width:6px;align-self:stretch;border-radius:3px;background:var(--g,#5a4b86);flex:0 0 auto}' +
  '#scr-kiri .kr-row .kr-rn{flex:1;min-width:0;font-size:12.5px;font-weight:700;line-height:1.2}' +
  '#scr-kiri .kr-row .kr-rs{display:block;font-size:10.5px;font-weight:600;color:#A093C4;margin-top:2px}' +
  '#scr-kiri .kr-row .kr-rv{font-size:12px;font-weight:900;color:#FFC542;white-space:nowrap}' +
  '#scr-kiri .kr-mini{min-width:44px;min-height:44px;border-radius:9px;border:1px solid rgba(255,255,255,.16);' +
    'background:rgba(255,255,255,.07);font-size:11px;font-weight:800;padding:0 7px;flex:0 0 auto}' +
  '#scr-kiri .kr-mini[disabled]{opacity:.3}' +
  '#scr-kiri .kr-mini.ok{border-color:rgba(61,220,132,.5);color:#3DDC84}' +
  '#scr-kiri .kr-mini.bad{border-color:rgba(255,84,104,.5);color:#FF9AA6}' +
  '#scr-kiri .kr-hd{font-size:10.5px;font-weight:900;letter-spacing:.09em;color:#7F73A0;margin:8px 2px 5px}' +
  '#scr-kiri .kr-hd:first-child{margin-top:0}' +
  '#scr-kiri .kr-empty{padding:16px 10px;text-align:center;color:#A093C4;font-size:12.5px;line-height:1.5}' +
  '#scr-kiri .kr-joke{font-size:12px;line-height:1.5;color:#C9BEE6;font-style:italic}' +
  '#scr-kiri .kr-logl{font-size:11.5px;line-height:1.45;padding:5px 7px;border-radius:7px;margin-bottom:3px;' +
    'background:rgba(255,255,255,.035);border-left:2px solid rgba(255,255,255,.12)}' +
  '#scr-kiri .kr-logl.good{border-left-color:#3DDC84}' +
  '#scr-kiri .kr-logl.bad{border-left-color:#FF5468}' +
  '#scr-kiri .kr-logl.card{border-left-color:#FFC542}' +

  /* ── rent table ── */
  '#scr-kiri .kr-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}' +
  '#scr-kiri .kr-tbl td{padding:5px 6px;border-bottom:1px solid rgba(255,255,255,.07)}' +
  '#scr-kiri .kr-tbl td:last-child{text-align:right;font-weight:900;color:#FFC542;white-space:nowrap}' +
  '#scr-kiri .kr-tbl tr.now td{background:rgba(255,197,66,.13);color:#FFD87A}' +

  /* ── sheets ── */
  '#scr-kiri .kr-scrim{position:absolute;inset:0;background:rgba(6,4,12,.72);z-index:20;display:none}' +
  '#scr-kiri .kr-scrim.on{display:block}' +
  '#scr-kiri .kr-sheet{position:absolute;left:0;right:0;bottom:0;z-index:21;max-height:88%;display:none;' +
    'flex-direction:column;border-radius:18px 18px 0 0;background:#1B1430;border:1px solid rgba(255,255,255,.14);' +
    'border-bottom:0;padding:10px 12px calc(env(safe-area-inset-bottom,0px) + 12px);' +
    'box-shadow:0 -14px 40px rgba(0,0,0,.6)}' +
  '#scr-kiri .kr-sheet.on{display:flex;animation:krup .22s var(--ease,cubic-bezier(.22,.9,.28,1))}' +
  '@keyframes krup{from{transform:translateY(26px);opacity:.4}to{transform:none;opacity:1}}' +
  '#scr-kiri .kr-sh-h{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex:0 0 auto}' +
  '#scr-kiri .kr-sh-h h3{margin:0;font-size:15px;font-weight:900;flex:1;line-height:1.2}' +
  '#scr-kiri .kr-sh-b{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}' +
  '#scr-kiri .kr-sh-f{flex:0 0 auto;display:flex;gap:6px;margin-top:9px}' +
  '#scr-kiri .kr-grab{width:38px;height:4px;border-radius:2px;background:rgba(255,255,255,.22);margin:0 auto 8px}' +

  /* ── the art slot: absent until a real load event says otherwise ── */
  '#scr-kiri .kr-art{position:absolute;inset:0;opacity:0;transition:opacity .35s var(--ease,ease);' +
    'pointer-events:none;border-radius:inherit;z-index:0}' +
  '#scr-kiri .kr-sh-b{position:relative}' +
  '#scr-kiri .kr-sh-b > *{position:relative;z-index:1}' +
  '#scr-kiri .kr-sh-b > .kr-art{position:absolute;z-index:0;border-radius:12px}' +
  '#scr-kiri .kr-card{position:relative;overflow:hidden}' +
  '#scr-kiri .kr-card > *:not(.kr-art){position:relative;z-index:1}' +

  /* ── the card ── */
  '#scr-kiri .kr-card{border-radius:14px;padding:16px 14px;text-align:center;border:2px solid var(--c,#FFC542);' +
    'background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.03))}' +
  '#scr-kiri .kr-card .kr-ce{width:52px;height:52px;margin:0 auto;border-radius:50%;' +
    'display:grid;place-items:center;font-family:var(--disp);font-size:30px;font-weight:900;' +
    'line-height:1;color:var(--c,#FFC542);background:rgba(14,11,20,.55);' +
    'box-shadow:inset 0 0 0 2px var(--c,#FFC542),0 0 18px rgba(0,0,0,.5)}' +
  '#scr-kiri .kr-card .kr-cd{font-size:10px;font-weight:900;letter-spacing:.16em;color:var(--c,#FFC542);margin:6px 0 4px}' +
  '#scr-kiri .kr-card .kr-ct{font-size:17px;font-weight:900;line-height:1.2;margin-bottom:8px}' +
  '#scr-kiri .kr-card .kr-cx{font-size:13px;line-height:1.55;color:#D9CFF2}' +

  /* ── chips (trade builder) ── */
  '#scr-kiri .kr-chips{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:4px}' +
  '#scr-kiri .kr-chip{min-height:44px;border-radius:10px;padding:4px 9px;font-size:11.5px;font-weight:700;' +
    'border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);max-width:100%;text-align:left;' +
    'border-left:5px solid var(--g,#5a4b86)}' +
  '#scr-kiri .kr-chip[aria-pressed="true"]{background:rgba(138,92,255,.28);border-color:#A98BFF}' +
  '#scr-kiri .kr-chip small{display:block;font-size:10px;opacity:.75;font-weight:600}' +
  '#scr-kiri .kr-step{display:flex;align-items:center;gap:5px;margin:4px 0 10px}' +
  '#scr-kiri .kr-step .kr-mini{flex:0 0 auto}' +
  '#scr-kiri .kr-step .kr-val{flex:1;text-align:center;font-weight:900;font-size:14px;color:#FFC542}' +

  /* ── the lobby-shaped bits ── */
  '#scr-kiri .kr-seatname{flex:1;min-width:0;min-height:44px;text-align:left;padding:0 10px;border-radius:9px;' +
    'background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.12);font-size:13px;font-weight:800;' +
    'color:#F4EFFF;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '#scr-kiri .kr-seatname small{display:block;font-size:10px;font-weight:600;color:#A093C4;margin-top:1px}' +
  '#scr-kiri .kr-rules{border-radius:12px;padding:10px 12px;margin-bottom:10px;' +
    'background:rgba(138,92,255,.12);border:1px solid rgba(138,92,255,.34)}' +
  '#scr-kiri .kr-rules p{margin:0 0 7px;font-size:12.5px;line-height:1.5;color:#D9CFF2}' +
  '#scr-kiri .kr-rules p:last-child{margin-bottom:0}' +
  '#scr-kiri .kr-rules b{color:#F4EFFF}' +

  /* ── setup ── */
  '#scr-kiri .kr-scroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:2px 2px 8px}' +
  '#scr-kiri .kr-blurb{font-size:12.5px;line-height:1.55;color:#C9BEE6;margin:2px 2px 12px}' +
  '#scr-kiri .kr-seg{display:flex;gap:5px;margin-bottom:10px}' +
  '#scr-kiri .kr-seg button{flex:1;min-height:46px;border-radius:11px;border:1px solid rgba(255,255,255,.12);' +
    'background:rgba(255,255,255,.04);font-size:12px;font-weight:800;color:#A093C4;padding:4px}' +
  '#scr-kiri .kr-seg button[aria-pressed="true"]{background:rgba(138,92,255,.26);border-color:#A98BFF;color:#F4EFFF}' +
  '#scr-kiri .kr-seg button small{display:block;font-size:9.5px;font-weight:600;opacity:.8;margin-top:2px}' +
  '#scr-kiri .kr-pl{display:flex;align-items:center;gap:7px;padding:6px;border-radius:12px;margin-bottom:6px;' +
    'background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09)}' +
  '#scr-kiri .kr-pl input{flex:1;min-width:0;min-height:44px;border-radius:9px;padding:0 10px;font-size:13px;' +
    'font-weight:700;background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.12);color:#F4EFFF}' +
  '#scr-kiri .kr-pl .kr-mini{min-width:56px}' +

  /* ── result ── */
  /* THE RESULT SCREEN SCROLLS ITSELF, AND NOTHING ELSE DOES. Eight
     seats of standings on a phone lying on its side is more than 440
     points of content whatever we do to it, and an absolutely
     positioned child that overflows pushes its PARENT's scroll height
     out — which is how a screen with overflow:hidden ends up with the
     Again button somewhere below the glass. It gets its own scroller
     and the board screen keeps its promise. */
  '#scr-kiri .kr-over{position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:10px;padding:22px;text-align:center;' +
    'overflow-y:auto;-webkit-overflow-scrolling:touch;' +
    /* NEARLY OPAQUE, on purpose. At .95 with a soft edge the board's own
       text read straight through the winner's name, which is the one
       word on this screen. */
    'background:linear-gradient(rgba(8,5,16,.955),rgba(8,5,16,.975)),' +
      'radial-gradient(90% 60% at 50% 28%,rgba(138,92,255,.42),rgba(6,4,12,1) 68%)}' +
  '#scr-kiri .kr-over > *{flex:0 0 auto}' +
  '#scr-kiri .kr-over h3{margin:0;font-family:var(--disp);font-size:25px;' +
    'letter-spacing:.05em;line-height:1.15}' +
  '#scr-kiri .kr-over p{margin:0;font-size:13px;line-height:1.55;color:#C9BEE6;max-width:320px}' +
  '#scr-kiri .kr-standings{width:100%;max-width:330px;margin-top:4px}' +

  /* ── THE MENU'S IDENTITY PIECE ──────────────────────────────────
     A corner of the board itself, drawn out of the board screen's own
     vocabulary — the rim gradient, the sunken tiles, the group
     strips, a token and the dice — tilted a few degrees and let run
     off the panel's edge so it reads as a corner OF something, not a
     diagram. Pure CSS and two inline SVGs; the art wash layers under
     it when the pack exists and nothing changes when it does not. */
  '#scr-kiri .kr-hero{position:relative;height:132px;border-radius:14px;margin-bottom:10px;' +
    'overflow:hidden;flex:0 0 auto;' +
    'background:radial-gradient(130% 140% at 20% 0%,#584174 0%,#2A1E4E 46%,#140E28 100%);' +
    'border:1px solid rgba(255,197,66,.28);' +
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.14),inset 0 -12px 22px rgba(0,0,0,.4)}' +
  '#scr-kiri .kr-hero .kr-art{z-index:0}' +
  '#scr-kiri .kr-hcorner{position:absolute;left:10px;bottom:-16px;z-index:1;' +
    'transform:rotate(-5deg);display:grid;gap:3px;padding:7px;border-radius:14px;' +
    'grid-template-columns:52px 42px 42px 42px;grid-template-rows:42px 52px;' +
    'background:linear-gradient(150deg,#584174,#281D46 60%,#150E2B);' +
    'border:1px solid rgba(255,197,66,.3);' +
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 10px 22px rgba(0,0,0,.55)}' +
  /* a tile, sunk into the rim exactly like .kr-cell */
  '#scr-kiri .kr-ht{position:relative;border-radius:5px;' +
    'background:linear-gradient(180deg,#2A2050,#160F2E);' +
    'border:1px solid rgba(255,255,255,.08);box-shadow:inset 0 1px 0 rgba(255,255,255,.10)}' +
  '#scr-kiri .kr-ht i{position:absolute;left:3px;right:3px;top:3px;height:7px;' +
    'border-radius:3px;background:var(--g,#5a4b86)}' +
  '#scr-kiri .kr-ht b{position:absolute;left:5px;right:6px;top:15px;height:3px;' +
    'border-radius:2px;background:rgba(255,255,255,.30)}' +
  '#scr-kiri .kr-ht b+b{top:21px;right:14px;opacity:.55}' +
  /* the START corner: gold-rimmed, with its arrow */
  '#scr-kiri .kr-hc{position:relative;border-radius:6px;display:grid;place-items:center;' +
    'background:linear-gradient(180deg,#33265C,#1A1233);border:1px solid rgba(255,197,66,.4);' +
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.12)}' +
  '#scr-kiri .kr-hc svg{width:24px;height:24px;fill:#FFC542;' +
    'filter:drop-shadow(0 1px 1px rgba(0,0,0,.6))}' +
  /* a token stood ON a square, and the pair of dice by it */
  '#scr-kiri .kr-htok{position:absolute;z-index:2;width:23px;height:23px;border-radius:50%;' +
    'background:radial-gradient(120% 120% at 32% 26%,#FFE9B0,#FFC542 55%,#B07E10);' +
    'box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.4),0 3px 5px rgba(0,0,0,.55)}' +
  '#scr-kiri .kr-htok.g{background:radial-gradient(120% 120% at 32% 26%,#B8F5D3,#3DDC84 55%,#12703E)}' +
  '#scr-kiri .kr-hdie{position:absolute;z-index:2;width:19px;height:19px;border-radius:4px;' +
    'background:linear-gradient(180deg,#FCF7EA,#E4DAC0);' +
    'box-shadow:inset 0 1px 0 #fff,0 2px 4px rgba(0,0,0,.5)}' +
  '#scr-kiri .kr-hdie svg{width:100%;height:100%;fill:#2A1C10}' +
  /* the one-line caption chip, top right, out of the corner's way */
  '#scr-kiri .kr-hchip{position:absolute;right:10px;top:10px;z-index:1;' +
    'font-size:9.5px;font-weight:900;letter-spacing:.12em;color:#FFD87A;' +
    'background:rgba(0,0,0,.42);border:1px solid rgba(255,197,66,.3);' +
    'padding:5px 9px;border-radius:999px}' +
  '#scr-kiri .kr-hchip2{position:absolute;right:10px;bottom:10px;z-index:1;' +
    'font-size:9.5px;font-weight:900;letter-spacing:.12em;color:#C4AEFF;' +
    'background:rgba(0,0,0,.42);border:1px solid rgba(138,92,255,.4);' +
    'padding:5px 9px;border-radius:999px}' +

  /* ── the menu's ledger line ── */
  '#scr-kiri .kr-ledger{font-size:12px;line-height:1.6;color:#A093C4;' +
    'margin:2px 2px 12px;text-align:center}' +
  '#scr-kiri .kr-ledger b{color:#FFC542}' +

  /* ── the rules, at the bottom of the menu, sliding ──
     In the flow at the end of the scroll: open, they push the page
     longer and cover nothing. transform/opacity only, and only on a
     real toggle (.anim), never on a repaint. The menu's scroll is a
     flex column and the panel takes margin-top:auto, so on a tall
     phone with little above it the row still sits AT the bottom
     instead of adrift in the middle. */
  '#scr-kiri .kr-menuscroll{display:flex;flex-direction:column}' +
  '#scr-kiri .kr-menuscroll>*{flex:0 0 auto}' +
  '#scr-kiri .kr-menuscroll .kr-ruleslide{margin-top:auto}' +

  /* ── THE THREE WAYS IN — big, stacked, one job each ── */
  '#scr-kiri .kr-modes{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}' +
  '#scr-kiri .kr-mode{display:flex;align-items:center;gap:11px;text-align:left;width:100%;' +
    'min-height:62px;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.14);' +
    'background:rgba(255,255,255,.05);color:var(--txt,#F4EFFF);cursor:pointer;' +
    'transition:transform .08s var(--ease,ease),background .15s var(--ease,ease),border-color .15s var(--ease,ease)}' +
  '#scr-kiri .kr-mode:active{transform:translateY(1px)}' +
  '#scr-kiri .kr-mode.primary{background:linear-gradient(180deg,#8A5CFF,#6a3fd8);border-color:#A98BFF;color:#fff}' +
  '#scr-kiri .kr-mode .mi{flex:0 0 auto;width:38px;height:38px;border-radius:11px;display:grid;' +
    'place-items:center;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.14)}' +
  '#scr-kiri .kr-mode.primary .mi{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.28)}' +
  '#scr-kiri .kr-mode .mi svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;' +
    'stroke-linecap:round;stroke-linejoin:round}' +
  '#scr-kiri .kr-mode .mt{flex:1;min-width:0}' +
  '#scr-kiri .kr-mode .mt b{display:block;font-family:var(--disp);font-size:14.5px;font-weight:900;' +
    'letter-spacing:.02em;line-height:1.1}' +
  '#scr-kiri .kr-mode .mt i{display:block;font-style:normal;font-size:11px;font-weight:600;line-height:1.35;' +
    'margin-top:3px;color:#C9BEE6}' +
  '#scr-kiri .kr-mode.primary .mt i{color:rgba(255,255,255,.82)}' +
  '#scr-kiri .kr-mode .chev{flex:0 0 auto;color:#8578AC}' +
  '#scr-kiri .kr-mode.primary .chev{color:rgba(255,255,255,.7)}' +
  '#scr-kiri .kr-mode .chev svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.4;' +
    'stroke-linecap:round;stroke-linejoin:round}' +
  '#scr-kiri .kr-ruleslide{border-radius:12px;border:1px solid rgba(255,255,255,.12);' +
    'background:rgba(255,255,255,.04);overflow:hidden;margin-bottom:6px}' +
  '#scr-kiri .kr-ruleslide .kr-row{margin-bottom:0;border:0;background:none;min-height:52px}' +
  '#scr-kiri .kr-rbody{padding:2px 12px 10px}' +
  '#scr-kiri .kr-ruleslide.anim.open .kr-rbody{animation:krslide .22s var(--ease,ease)}' +
  '@keyframes krslide{from{transform:translateY(-8px);opacity:0}to{transform:none;opacity:1}}' +

  /* ── short phones ── */
  '@media (max-height:720px){' +
    '#scr-kiri .kr-tbar{min-height:40px}' +
    '#scr-kiri .kr-btn{min-height:46px}' +
    '#scr-kiri .kr-hero{height:112px}' +
    '#scr-kiri .kr-die{width:29px;height:29px;font-size:16px}}' +

  /* ── A PHONE ON ITS SIDE ──────────────────────────────────────────
     894x440 is the house's second shape and the column layout above
     cannot hold it: the ring alone will not go under 300 points, the
     dock will not go under 280, and 300 + 280 + the chrome is 688 in
     a 440-point window. The board screen has NEVER fitted on its side
     — the page did not scroll (this screen is inset:0 with
     overflow:hidden) but the action bar sat forty points below the
     glass, so the one button you actually need was the one you could
     not reach.

     Turned on its side there is width instead, so the ring goes beside
     the dock rather than above it. Same markup, same handlers, same
     everything: four grid placements and a different sum in
     sizeBoard().

     THE COLUMN IS NOW A NUMBER, not `auto`. The board is absolutely
     positioned inside its stage so the stage has no intrinsic width
     of its own — an `auto` track would measure zero and the ring
     would vanish. --kw names the BOARD's column instead, and
     sizeBoard() can state it exactly: on its side the ring is limited
     by the 440 points of height and by nothing else. Every remaining
     point then goes to the dock instead of to two empty gutters
     either side of a board that cannot use them. */
  '@media (orientation:landscape) and (max-height:560px){' +
    '#scr-kiri .kr-over{gap:6px;padding:12px;justify-content:flex-start}' +
    '#scr-kiri .kr-over h3{font-size:20px}' +
    /* .kr-landgrid: only the BOARD screen turns into the side-by-side
       grid — the menu and the setup stay ordinary columns, or the
       menu's hero and buttons end up folded into a 300-point gutter
       with the title floating in the other column. */
    '#scr-kiri.on.kr-landgrid{display:grid;column-gap:6px;' +
      'grid-template-columns:var(--kw,300px) minmax(0,1fr);' +
      'grid-template-rows:auto auto auto minmax(0,1fr)}' +
    /* THE TITLE BAR GOES IN THE DOCK'S COLUMN. It used to span both,
       which cost the ring its own height in points for a row of chrome
       that had a whole empty column to sit in. */
    '#scr-kiri.kr-landgrid .kr-tbar{grid-area:1/2/2/3;min-height:38px}' +
    '#scr-kiri.kr-landgrid .kr-wrap{grid-area:1/1/5/2;align-self:stretch;margin:0 0 0 -8px}' +
    '#scr-kiri.kr-landgrid .kr-strip{grid-area:2/2/3/3;margin:0 0 4px}' +
    '#scr-kiri.kr-landgrid #kr-awayhost{grid-area:3/2/4/3}' +
    '#scr-kiri.kr-landgrid .kr-dock{grid-area:4/2/5/3;margin-top:0;flex:1 1 auto;justify-content:flex-end}' +
    '#scr-kiri.kr-landgrid .kr-dock.down{flex:1 1 auto}' +
    '#scr-kiri.kr-landgrid .kr-dock .kr-grip{order:-1}' +
    '#scr-kiri .kr-die{width:26px;height:26px;font-size:15px}' +
    '#scr-kiri .kr-btn{min-height:44px}}' +

  /* ── SOMEBODY WHO HAS ASKED FOR LESS MOVEMENT ────────────────────
     The dice shake, the sheet's rise and the arming flash all say
     something, but none of them says anything the words do not. Off
     they go, and the game plays identically. */
  '@media (prefers-reduced-motion:reduce){' +
    '#scr-kiri .kr-die.roll,#scr-kiri .kr-sheet.on,#scr-kiri .kr-btn.bad.armed{animation:none}' +
    '#scr-kiri .kr-ruleslide.anim.open .kr-rbody{animation:none}' +
    '#scr-kiri .kr-cell{transition:none}}' +
  'body.reduced #scr-kiri .kr-ruleslide.anim.open .kr-rbody{animation:none}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   2. OUR SCREEN
   js/game.js's go() only knows the screens in its own SCREENS array
   and that array is not ours to edit, so — exactly like js/party.js —
   we show and hide ourselves, and a MutationObserver stands us down
   the moment any other screen switches itself on.
   ═══════════════════════════════════════════════════════════════════ */
let scr = null, live = false, watching = false;

function screenEl(){
  if (scr && scr.isConnected) return scr;
  scr = document.getElementById('scr-kiri');
  if (!scr){
    scr = document.createElement('section');
    scr.id = 'scr-kiri';
    (document.getElementById('app') || document.body).appendChild(scr);
  }
  return scr;
}

function watch(){
  if (watching || typeof MutationObserver !== 'function') return;
  const app = document.getElementById('app');
  if (!app) return;
  watching = true;
  new MutationObserver(recs => {
    if (!live) return;
    for (const r of recs){
      const t = r.target;
      if (t === scr || !t.parentNode || t.parentNode !== app) continue;
      if (t.classList && t.classList.contains('screen') && t.classList.contains('on')){ standDown(); return; }
    }
  }).observe(app, { attributes:true, attributeFilter:['class'], subtree:true });
}

function show(){
  injectCSS();
  const el = screenEl();
  const app = document.getElementById('app');
  if (app) for (const s of app.children){
    if (s !== el && s.classList && s.classList.contains('screen')) s.classList.remove('on');
  }
  el.classList.add('on');
  live = true;
  watch();
  watchDead(el);
}

/* ── THE TAP THAT DOES NOTHING ──────────────────────────────────────
   Buy it with forty euro in your pocket, Build with the group half
   sold, Pay the fifty when you cannot: the answer is a `disabled`
   button, and Chrome dispatches NO click for one of those — not to
   the button, not to anything above it. So sfx.js's delegated layer
   physically cannot sound a refused tap, and the most frustrating
   thing you can do in this game is also the quietest.

   pointerdown still fires, so we listen for that, once, on our own
   screen only, passive, and never touch the event.

   The same listener does a second job. sfx.js's delegated layer puts
   ui.tap on every live button, and the queue cannot see that — so a
   consequence cued by the same click could still land 40 ms behind
   the tap, which is close enough to sound like one broken noise. A
   tap therefore counts as "a sound just happened" and the queue
   waits its full GAP from it, not the shorter LEAD.                */
let deadWired = false;
function watchDead(el){
  if (deadWired || !el) return;
  deadWired = true;
  const down = e => {
    try {
      const t = e.target && e.target.closest && e.target.closest('button,.btn');
      if (!t || !el.contains(t)) return;
      if (t.disabled){ cue('ui.error', { gain: 0.80 }, 2); return; }
      /* the delegated layer is about to tap. Count it as one of ours, and
         push out anything already on its way so the tap keeps its own air. */
      qAt = Date.now();
      if (qT){ clearTimeout(qT); qT = 0; kick(); }
    } catch(err){}
  };
  try { el.addEventListener('pointerdown', down, { passive: true }); }
  catch(err){ try { el.addEventListener('pointerdown', down, false); } catch(_){} }
  /* a synthetic .click() (the tests, and anything scripted) never sends a
     pointerdown, so the tap has to be noticed on the click as well */
  try { el.addEventListener('click', down, { passive: true, capture: true }); }
  catch(err){ try { el.addEventListener('click', down, true); } catch(_){} }
}

/* ── THE CRASH NET, AND ONLY THE CRASH NET ──────────────────────────
   Every idle exit — standing the screen down, the tab going away, the
   page unloading, Escape — writes the board so a phone that dies
   mid-game comes back to it. A FINISHED game must never be written:
   renderOver() bins the save the moment the game ends, and half a
   second later close() used to put it straight back, which is how a
   game you had already won turned up on the menu offering to be
   carried on with. One guard, one place. */
function stash(){ if (G && !G.over) K.save(G); return !!(G && !G.over); }

function standDown(){
  live = false;
  stopLoop();
  hushQueue();          /* nothing queued may follow us onto another screen */
  stash();
  if (scr) scr.classList.remove('on');
}

/* back to the party hub, which is where we came from */
function close(){
  standDown();
  if (P && P.open) P.open();
  else if (KA.go) KA.go('home');
}

/* ═══════════════════════════════════════════════════════════════════
   3. STATE HELD BY THE SCREEN (never by the engine)
   ═══════════════════════════════════════════════════════════════════ */
let G = null;             /* the game */
let tab = 'square';       /* which dock tab */
let timer = 0;            /* the machine's next move */
let clockT = 0;           /* the turn clock */
let clockLeft = 0;
let turnClock = 90;       /* seconds a human seat gets before the phone takes over; 0 = off */
let rolled = false;       /* for the dice shake */
let sheet = null;         /* {kind, ...} currently open */
let trade = null;         /* the offer being built */

const P_OF = i => G.players[i];
const me = () => G.players[G.turn];

/* ═══════════════════════════════════════════════════════════════════
   3b. THE ONLY WAY THIS SCREEN TOUCHES THE GAME
   ───────────────────────────────────────────────────────────────────
   Fifteen handlers used to call js/kiri.js's mutators straight —
   K.roll(G), K.buy(G), K.build(G,i) — which was fine while a finger
   on this phone was the only thing that could move a piece.

   It is not fine now. js/kiri.js §20 has ONE door, apply(G, seat,
   move), and a move that goes round it is a move the transport never
   sees: it would happen on this screen and nowhere else, and the two
   tables would drift apart with nothing to say so. So every single
   tap below goes through act(), act() ends in K.apply(), and there is
   no second path in this file. The test that proves it greps this
   file for `K.<mutator>(` and expects nothing.

   WHICH CHAIR IS PRESSING?
     · offline there is one phone and it holds every chair, so the
       chair is whichever one the move belongs to — and the engine's
       own actorOf() answers that, so the screen and the machine and a
       packet all get the answer from the same place.
     · online this phone owns exactly ONE chair and may only ever act
       as that one. A tap that is not ours is handed in as ours and
       refused BY NAME, which is the behaviour we want: it is said out
       loud instead of quietly doing nothing.
   ═══════════════════════════════════════════════════════════════════ */
let NET = null;                 /* null offline; the room otherwise. §12 */
let netMsg = { t:'', k:'' };    /* the one line the transport may say */

/* is this chair ours to answer for? Offline: all of them. */
const isMine = i => (!NET || i === NET.mySeat);

/* WHO WORKS OUT THE MACHINE'S MOVE FOR THIS CHAIR — and, because the
   move then goes out on the wire, who SENDS it. Exactly one phone per
   chair, or the same move arrives twice.
     · offline           this phone, for everything
     · online, own chair this phone, including while it is on autopilot
     · online, a machine the host, because the relay will only carry a
                         move stamped for a chair the host declared as
                         a machine when the room started. A dropped
                         PERSON'S chair therefore cannot be covered by
                         anybody else — see the report. */
function iDrive(i){
  if (!G || !G.players[i]) return false;
  if (!NET) return true;
  if (i === NET.mySeat) return true;
  /* a chair the relay freed FOR GOOD (hooks.seatGone): its own phone is
     not coming back to play it, so EVERY remaining phone drives it
     locally — the AI is deterministic (no Math.random in kiri-ai; the
     dice come off the seeded stream in the state), so all phones compute
     the identical move, and mp.js drops the send for a seat that is
     neither ours nor a lobby machine, so nothing doubles on the wire. */
  if (NET.gone && NET.gone[i]) return true;
  return !!NET.host && G.players[i].kind === 'cpu';
}

/* the seat the table is waiting on, whether that is a roll, a bid or
   an answer to a deal. One answer, used by the clock, by the sheets
   and by the action bar. */
function askedSeat(){
  if (!G || G.over) return -1;
  if (G.offer) return G.offer.to;
  if (G.phase === 'auction' && G.auction) return K.auctionBidder(G);
  if (G.phase === 'debt' && G.debt) return G.debt.who;
  return G.turn;
}

/* THE DOOR. Nothing else in this file may change G. */
function act(mv, seat){
  if (!G || !mv) return { ok:false, err:'no-game', why:'' };
  const s = (seat != null) ? seat
          : (NET ? NET.mySeat : K.actorOf(G, mv.t));
  const r = K.apply(G, s, mv, 'local');
  if (!r.ok) refusedHere(r);
  return r;
}

/* A REFUSED TAP IS SAID, NOT SWALLOWED. Offline this is nearly always
   a disabled button somebody got to anyway; online it is the useful
   half of the contract — "that was out of turn" beats a dead button. */
function refusedHere(r){
  cue('ui.error', { gain: 0.80 }, 2);
  if (!NET) return;
  netNote('That was ' + (r.why || 'not allowed') + '.', 'warn');
}

function netNote(text, tone){
  netMsg = { t: String(text || ''), k: tone || '' };
  if (els && els.away) renderAway();
}

/* ═══════════════════════════════════════════════════════════════════
   4. THE WAY IN
   ═══════════════════════════════════════════════════════════════════ */
function open(){
  show();
  menu();
}

/* ── THE MENU'S IDENTITY PIECE ──────────────────────────────────────
   A corner of the board, built out of the board screen's own pieces:
   the rim, three sunken tiles with their group strips, the START
   square with its arrow, a token mid-journey and the dice that put it
   there. It hangs off the bottom-left of the panel so it reads as a
   corner of something bigger — which is exactly what it is. */
function heroHTML(){
  const g = id => (K.GROUPS[id] ? K.GROUPS[id].c : '#5a4b86');
  const die = pips => '<span class="kr-hdie" style="' + pips[0] + '" aria-hidden="true">' +
    '<svg viewBox="0 0 24 24">' + pips[1] + '</svg></span>';
  const dot = (x, y) => '<circle cx="' + x + '" cy="' + y + '" r="2.6"/>';
  return '<div class="kr-hero">' +
    '<div class="kr-art" id="kr-heroart"></div>' +
    '<div class="kr-hcorner" aria-hidden="true">' +
      /* the column going up off the top of the panel */
      '<span class="kr-ht" style="--g:' + g('marsa') + '"><i></i><b></b><b></b></span>' +
      '<span class="kr-ht" style="--g:' + g('hamrun') + '"><i></i><b></b><b></b></span>' +
      '<span class="kr-ht" style="--g:' + g('birgu') + '"><i></i><b></b><b></b></span>' +
      '<span class="kr-ht" style="--g:' + g('sliema') + '"><i></i><b></b><b></b></span>' +
      /* the START corner and the row running right, off the panel's edge */
      '<span class="kr-hc"><svg viewBox="0 0 24 24">' +
        '<path d="M12 3l6 6h-3.6v6h-4.8V9H6z"/>' +
        '<path d="M6 17h12v3H6z" opacity=".7"/></svg></span>' +
      '<span class="kr-ht" style="--g:' + g('swieqi') + '"><i></i><b></b><b></b></span>' +
      '<span class="kr-ht" style="--g:' + g('belt') + '"><i></i><b></b><b></b></span>' +
      '<span class="kr-ht" style="--g:' + g('hamrun') + '"><i></i><b></b><b></b></span>' +
      /* a token that has just landed, and the roll that put it there */
      '<span class="kr-htok" style="left:76px;top:62px"></span>' +
      '<span class="kr-htok g" style="left:130px;top:66px"></span>' +
    '</div>' +
    die(['position:absolute;right:96px;top:46px;z-index:2;transform:rotate(-11deg)',
         dot(7, 7) + dot(17, 7) + dot(7, 17) + dot(17, 17) + dot(12, 12)]) +
    die(['position:absolute;right:70px;top:54px;z-index:2;transform:rotate(9deg)',
         dot(7, 7) + dot(17, 17) + dot(12, 12)]) +
    '<span class="kr-hchip">MALTA &middot; 32 SQUARES</span>' +
    '<span class="kr-hchip2">RENT IS DUE</span>' +
  '</div>';
}

/* ── the three mode-button icons, drawn not glyphed ── */
const KR_ICO_GLOBE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/>' +
  '<path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>';
const KR_ICO_BOT = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="8" width="14" height="10" rx="2"/>' +
  '<path d="M12 8V4M9 13h.01M15 13h.01M2 12v3M22 12v3"/></svg>';
const KR_ICO_PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2.5"/>' +
  '<path d="M11 18h2"/></svg>';
const KR_ICO_CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

function menu(){
  stopLoop();
  G = null;
  NET = null;
  netMsg = { t:'', k:'' };
  let saved = K.load();
  /* A ROOM'S GAME IS NOT RESUMABLE FROM HERE. It is saved after every
     action like every other game — that is the crash net, and it is
     what the absence handling rests on — but the other seven people
     are not in this room any more, so offering to "carry on" with it
     would hand somebody a hotseat game they never agreed to play. */
  if (saved && saved.players.some(p => p.link === 'net')){ K.clearSave(); saved = null; }
  const rec = (P && P.recOf) ? P.recOf('kiri') : { w:0, l:0, d:0 };
  const el = screenEl();
  el.classList.remove('kr-landgrid');
  el.innerHTML =
    '<div class="kr-tbar">' +
      '<button class="kr-ib" id="kr-home" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>IL-KIRI</h2><span style="width:44px"></span>' +
    '</div>' +
    '<div class="kr-scroll kr-menuscroll">' +
      heroHTML() +
      '<p class="kr-blurb">Buy half of Malta, charge your friends rent for landing on it, and watch a ' +
      'friendship end over a garage in Marsa. Thirty-two squares, six colour groups, floors instead of ' +
      'houses, and a queue at counter four instead of a prison cell.</p>' +
      /* ── THE ONE UNFINISHED GAME, AND THE WAY OUT OF IT ────────────
         There is exactly one save slot (js/kiri.js's SAVE_KEY), so this
         is never a list — it is one game, and it gets a bin of its own
         rather than only ever being replaced by another one. */
      (saved
        ? '<div class="kr-saved">' +
            '<div class="kr-hd" style="margin-top:0">THE GAME YOU LEFT</div>' +
            '<button class="kr-btn buy" id="kr-resume" style="width:100%">' +
              'Carry on with it<small>' + esc(resumeLine(saved)) + '</small></button>' +
            '<div class="kr-act" style="margin-top:6px">' +
              '<button class="kr-btn" id="kr-new">Start a new one<small>this one goes in the bin</small></button>' +
              '<button class="kr-btn bad" id="kr-bin" style="flex:0 0 40%">Bin it<small>and be rid of it</small></button>' +
            '</div>' +
          '</div>'
        : '') +
      /* ── THE THREE WAYS IN ─────────────────────────────────────────
         One tap each, nothing to fill in first. ONLINE hands off to the
         shared lobby (mp.js) with its relay seed; WITH AI deals straight
         in on defaults; PASS THE PHONE opens the seat setup so the people
         round the table can be named. The old settings wall (round limit,
         clock, per-machine difficulty) lives on that second step now. */
      '<div class="kr-modes">' +
        '<button class="kr-mode primary" id="kr-m-online">' +
          '<span class="mi">' + KR_ICO_GLOBE + '</span>' +
          '<span class="mt"><b>Play online</b>' +
            '<i>Real people, one board, every phone dealt the same.</i></span>' +
          '<span class="chev">' + KR_ICO_CHEV + '</span>' +
        '</button>' +
        '<button class="kr-mode" id="kr-m-ai">' +
          '<span class="mi">' + KR_ICO_BOT + '</span>' +
          '<span class="mt"><b>Play with the machine</b>' +
            '<i>You and two of them, dealt right now.</i></span>' +
          '<span class="chev">' + KR_ICO_CHEV + '</span>' +
        '</button>' +
        '<button class="kr-mode" id="kr-m-hot">' +
          '<span class="mi">' + KR_ICO_PHONE + '</span>' +
          '<span class="mt"><b>Pass the phone</b>' +
            '<i>Everybody round one phone. Sort the seats, then deal.</i></span>' +
          '<span class="chev">' + KR_ICO_CHEV + '</span>' +
        '</button>' +
      '</div>' +
      (rec.w + rec.l
        ? '<p class="kr-ledger">At this table so far: <b>' + rec.w + '</b> won, <b>' +
          rec.l + '</b> lost.</p>' : '') +
      /* ── THE RULES, AT THE BOTTOM, SLIDING ─────────────────────────
         In the flow at the end of the scroll, closed by default: open,
         they push the page longer and cover nothing. Remembered in the
         UI key, never with a save. */
      '<div class="kr-ruleslide' + (rulesDown ? ' open' : '') + '" id="kr-ruleswrap">' +
        '<button class="kr-row" id="kr-rules" aria-controls="kr-rulebody"' +
          ' aria-expanded="' + (rulesDown ? 'true' : 'false') + '">' +
          '<span class="kr-sw" style="background:#8A5CFF"></span>' +
          '<span class="kr-rn">How it works<span class="kr-rs">the rules &mdash; they slide out here, over nothing</span></span>' +
          '<span class="kr-rv">' + (rulesDown ? '&#9650;' : '&#9660;') + '</span>' +
        '</button>' +
        '<div class="kr-rbody" id="kr-rulebody"' + (rulesDown ? '' : ' hidden') + '>' +
          rulesLong() + '</div>' +
      '</div>' +
    '</div>';
  artWash(el.querySelector('#kr-heroart'), 'kiri-hero', 0.22);
  el.querySelector('#kr-home').onclick = close;
  /* THE THREE WAYS IN — each does exactly one thing, no form first. */
  el.querySelector('#kr-m-online').onclick = () => { cue('ui.tap', { gain:0.6 }); goOnline(); };
  el.querySelector('#kr-m-ai').onclick     = () => { cue('ui.tap', { gain:0.6 }); startAI(); };
  el.querySelector('#kr-m-hot').onclick    = () => { cue('ui.tap', { gain:0.6 }); setup('hot'); };
  /* the saved-game "Start a new one" bins the old board and drops back to
     the same three ways in — it is not a fourth path of its own */
  const nw = el.querySelector('#kr-new');
  if (nw) nw.onclick = () => { K.clearSave(); menu(); };
  el.querySelector('#kr-rules').onclick = () => {
    rulesDown = !rulesDown;
    try { localStorage.setItem(UI_KEY + '.rules', rulesDown ? '1' : '0'); } catch(e){}
    const wrap = el.querySelector('#kr-ruleswrap');
    wrap.classList.toggle('open', rulesDown);
    wrap.classList.add('anim');               /* animate real toggles only */
    el.querySelector('#kr-rulebody').hidden = !rulesDown;
    el.querySelector('#kr-rules').setAttribute('aria-expanded', rulesDown ? 'true' : 'false');
    el.querySelector('#kr-rules .kr-rv').innerHTML = rulesDown ? '&#9650;' : '&#9660;';
    if (rulesDown){
      try { wrap.scrollIntoView({ block:'nearest', behavior: noMotion() ? 'auto' : 'smooth' }); }
      catch(e){}
    }
  };
  const r = el.querySelector('#kr-resume');
  if (r) r.onclick = () => { G = saved; boardScreen(); };
  const bin = el.querySelector('#kr-bin');
  if (bin) arm(bin, 'Bin it<small>and be rid of it</small>', 'Sure?', () => {
    K.clearSave();
    cue('duel.destroy', { gain: 0.85 }, 2);
    menu();
  });
}

/* ── A DESTRUCTIVE BUTTON THAT ASKS ONCE, IN PLACE ──────────────────
   Binning a game cannot be undone, so it may not happen on a stray
   tap — but a second sheet on top of a sheet is how a delete ends up
   buried, and buried is the bug we are here to fix. So the button
   arms itself: the first tap changes what it says, the second does it,
   and it disarms itself after four seconds if the answer was no. One
   confirmation, no new screen, and the label always says exactly what
   the next tap will do. */
function arm(btn, label, ask, done){
  let hot = 0, t = 0;
  const off = () => { hot = 0; btn.classList.remove('armed'); btn.innerHTML = label; };
  btn.onclick = () => {
    if (hot){ clearTimeout(t); off(); done(); return; }
    hot = 1;
    btn.classList.add('armed');
    btn.innerHTML = ask + '<small>this cannot be undone</small>';
    cue('ui.error', { gain: 0.70 }, 3);
    t = setTimeout(off, 4000);
  };
}

function resumeLine(g){
  /* ENOUGH TO RECOGNISE IT, not the whole table. Eight seats of names
     and money is two lines of small print on a button, and the thing
     you actually need to know is which game this is. */
  const live = g.players.filter(p => !p.out);
  const names = live.slice(0, 2).map(p => p.name);
  if (live.length > 2) names.push('and ' + (live.length - 2) + ' more');
  return 'Round ' + g.round + (g.roundLimit ? ' of ' + g.roundLimit : '') +
         ' · ' + names.join(', ') +
         (live[0] ? ' · you had ' + money(live[0].cash) : '');
}

/* ── WHAT "LEAVE" MEANS ─────────────────────────────────────────────
   Two different things, and the game used to guess. Put it down and it
   is waiting for you; end it and it is gone. Both from one tap on the
   back arrow, both said in as many words. */
function leaveSheet(){
  K.save(G);            /* whichever way this goes, nothing is lost meanwhile */
  openSheet({
    kind:'leave',
    title:'Leave the game?',
    body:'<p class="kr-blurb">It is written down after every roll, so putting it down here costs nothing — ' +
      'it will be waiting on the IL-KIRI screen, exactly as you left it.</p>' +
      '<div class="kr-hd">OR BE DONE WITH IT</div>' +
      '<button class="kr-btn bad" id="kr-endit" style="width:100%">Temm il-logħba' +
        '<small>end it here and throw it away</small></button>' +
      '<p class="kr-blurb" style="margin:8px 2px 2px">Nobody wins, nothing goes on anybody\'s record, and the ' +
      'IL-KIRI screen comes back empty. It does not come back.</p>',
    foot:'<button class="kr-btn" id="kr-stay">Stay here</button>' +
         '<button class="kr-btn go" id="kr-keep">Put it down<small>and come back to it</small></button>',
    wire: root => {
      root.querySelector('#kr-stay').onclick = closeSheet;
      root.querySelector('#kr-keep').onclick = () => { K.save(G); closeSheetOnly(); menu(); };
      arm(root.querySelector('#kr-endit'),
          'Temm il-logħba<small>end it here and throw it away</small>', 'Sure?', () => {
        K.clearSave();
        cue('duel.destroy', { gain: 0.90 }, 2);
        closeSheetOnly();
        menu();               /* which sets G to null and offers a fresh start */
      });
    },
  });
}

/* ── LEAVING A ROOM, FROM WHEREVER ──────────────────────────────────
   The save-after-every-action is a crash net for a phone that died
   mid-game. It is NOT a reason to keep a room's board once this phone
   has walked out of the room: the other seven are not there any more,
   and menu() would have to bin it on sight anyway. So it goes here,
   at the moment of leaving, and no ghost is ever written. */
function dropRoom(n){
  NET = null;
  netMsg = { t:'', k:'' };
  stopLoop();
  K.clearSave();
  G = null;
  if (n && n.onLeave) n.onLeave(); else close();
}
function leaveRoom(){ dropRoom(NET); }

/* the full rules, as one block of sections — the menu's sliding panel
   is the only reader now, so a stranger reads them where the game is
   rather than on a separate screen a back-arrow away */
function rulesLong(){
  return sect('The point', 'Go round the ring. Buy what you land on. Charge everybody else rent when they land on it. ' +
      'The game ends when there is one person left with money, or when the rounds run out — whichever comes first.') +
    sect('Colour groups', 'Own every square of one colour and the base rent on all of them DOUBLES straight away, ' +
      'even with nothing built. That is why people trade. Mortgage one of them and the double goes.') +
    sect('Floors and the penthouse', 'With a full group and nothing in it mortgaged you can build: four floors, ' +
      'then a penthouse. You must build evenly — no square may get more than one floor ahead of its neighbours. ' +
      'The bank only has ' + K.SUPPLY.floors + ' floors and ' + K.SUPPLY.penthouses + ' penthouses, and when they are gone they are gone.') +
    sect('Il-Kju — the queue', 'Land on Marsa Junction, draw the wrong card, or roll three doubles in a row and you ' +
      'are at counter four. Roll a double to get out, pay ' + money(K.BAIL) + ', or use a Skip The Queue. ' +
      'Three failed attempts and you pay anyway.') +
    sect('Mortgages', 'Half the price now, and ten percent on top to get it back. Nothing can be mortgaged with a ' +
      'floor standing anywhere in its group.') +
    sect('When you cannot pay', 'The table stops. Sell floors, mortgage deeds, do a deal. If there is genuinely ' +
      'nothing left, you hand everything you own to whoever you owed it to and go and sit down.') +
    sect('Somebody wanders off', 'If a seat goes quiet the phone plays it, visibly, and hands it straight back when ' +
      'they return. It plays that seat carefully — it will not sign a trade on somebody else\'s behalf.');
}
const sect = (h, b) => '<div class="kr-hd">' + esc(h).toUpperCase() + '</div><p class="kr-blurb">' + esc(b) + '</p>';

/* ═══════════════════════════════════════════════════════════════════
   5. WHO IS PLAYING

   THE NAME IS NEVER ASKED FOR. He is signed in and the app already
   knows who he is; a name field is a form standing between a man and
   his game. Seat one is the profile name, full stop. The other seats
   are pre-filled with their token's name so a four-player hot-seat
   game starts with nothing typed at all — and any of them can still
   be renamed by tapping the seat, which is an option rather than a
   gate.

   THE SAME SHAPE ONLINE. js/mp.js owns the shared lobby; this screen
   is its offline twin and deliberately answers the same questions in
   the same order: who is in, how hard is the machine, how long, and
   what happens if somebody wanders off. Both read the rules from the
   same rulesPanel() so a stranger gets the same thirty seconds either
   way.
   ═══════════════════════════════════════════════════════════════════ */

/* the three machine levels, named once and shared with the lobby */
const LEVELS = [
  { k:1, n:'Iż-Żijja',       t:'sits on her money' },
  { k:2, n:'Il-Ħabib',       t:'plays properly' },
  { k:3, n:'L-Iżviluppatur', t:'buys everything' },
];
const levelName = k => (LEVELS.find(L => L.k === k) || LEVELS[1]).n;

/* WHO IS HE. Taken from the profile, never typed.
   A signed-in player is his own name. A guest is "You" — not the word
   "Guest", which reads like a bug in the log ("Guest owes you two
   thousand euro"), and not the token's name either, because nobody
   thinks of themselves as The Key. "You bought The Marsa Garage" is
   the line we want. */
function myName(){
  try {
    const n = KA.displayName && KA.displayName();
    if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
      return String(n).trim().slice(0, 14);
  } catch(e){}
  return 'You';
}

/* THE THIRTY SECONDS THAT LETS A STRANGER SIT DOWN.
   Short on purpose. Somebody who has never heard of IL-KIRI has to be
   able to read this without leaving the room and losing their seat, so
   it is five lines, not a manual. The full version is one tap away and
   only reachable from the menu, where nobody is waiting for you. */
function rulesPanel(){
  return '' +
    '<div class="kr-rules">' +
      '<p><b>Go round the ring buying things.</b> Land on somebody else\'s and you pay them rent. ' +
      'Run out of money and you are out.</p>' +
      '<p><b>Own a whole colour and the rent doubles</b> on all of it, straight away, with nothing built. ' +
      'That is why people trade — and nobody completes a colour without trading.</p>' +
      '<p><b>Then you build:</b> four floors, then a penthouse. The bank only has ' + K.SUPPLY.floors +
      ' floors and ' + K.SUPPLY.penthouses + ' penthouses on the whole island.</p>' +
      '<p><b>Il-Kju</b> is the queue at counter four. Roll a double to get out, pay ' + money(K.BAIL) +
      ', or know somebody.</p>' +
      '<p><b>It ends</b> when one person is left, or when the rounds run out and the richest takes it. ' +
      'Nobody is ever stuck here all night.</p>' +
    '</div>';
}

let cfg = null;
/* mode: 'ai' fills the extra chairs with the machine (you + two of them);
   'hot' fills them with people on this phone. Seat one is always you. */
function defaultSeats(mode){
  const hot = mode === 'hot';
  const out = [{ name: myName(), kind:'human', level:2 }];
  for (let i = 1; i < K.MAX_SEATS; i++)
    out.push({
      name: K.SEATS[i].en,
      kind: i < 3 ? (hot ? 'human' : 'cpu') : 'off',
      level: 2,
    });
  return out;
}

/* PLAY WITH THE MACHINE — no settings step. You and two machines on the
   house defaults, dealt straight in. No seed is forced, so js/kiri.js
   deals a fresh random board (an online table is the only one that pins
   the seed — see onlineStart). */
function startAI(){
  turnClock = 90;
  startGame(defaultSeats('ai').filter(s => s.kind !== 'off')
    .map(s => ({ name:s.name, kind:s.kind, level:s.level })),
    { roundLimit: 30, clock: 90 });
}

/* PLAY ONLINE — hand off to the shared lobby (js/mp.js). IL-KIRI is a
   live online game there (registered in mp.js's GAMES), so this opens the
   real room list; the lobby calls back into onlineStart() with the relay
   seed every phone shares. If mp.js is somehow absent, fall back to the
   seat setup rather than a dead end. */
function goOnline(){
  if (window.KARTI_MP && KARTI_MP.openFor){
    try { KARTI_MP.openFor('kiri'); return; } catch(e){}
  }
  setup('hot');
}

/* PASS THE PHONE (and "Start a new one") — the seat setup, where the
   people round the table get named and the round limit / clock / machine
   difficulty are chosen. This is the SECOND step, off the primary path. */
function setup(mode){
  if (!cfg) cfg = { seats: defaultSeats(mode), roundLimit: 30, clock: 90, showRules: false };
  else if (mode === 'hot'){
    /* coming in fresh from PASS THE PHONE: default the spare chairs to
       people, not machines, without wiping a table already being edited */
    cfg.seats = defaultSeats('hot');
  }
  /* the profile may have changed since the last game on this phone */
  cfg.seats[0].name = myName();
  cfg.seats[0].kind = 'human';
  paintSetup();
}

const seatsIn = () => cfg.seats.filter(s => s.kind !== 'off');

function paintSetup(){
  const el = screenEl();
  el.classList.remove('kr-landgrid');
  const live = seatsIn();
  const enough = live.length >= K.MIN_SEATS;
  el.innerHTML =
    '<div class="kr-tbar">' +
      '<button class="kr-ib" id="kr-bk" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Who is playing</h2><span style="width:44px"></span>' +
    '</div>' +
    '<div class="kr-scroll" id="kr-setup"></div>' +
    '<div class="kr-act" id="kr-startbar"></div>';

  const w = el.querySelector('#kr-setup');
  let h =
    '<button class="kr-row" id="kr-whatis" style="margin-bottom:8px">' +
      '<span class="kr-sw" style="background:#8A5CFF"></span>' +
      '<span class="kr-rn">What is IL-KIRI?<span class="kr-rs">' +
      (cfg.showRules ? 'tap to fold it away' : 'thirty seconds, before you start') + '</span></span>' +
      '<span class="kr-rv">' + (cfg.showRules ? '▲' : '▼') + '</span></button>' +
    (cfg.showRules ? rulesPanel() : '') +
    '<div class="kr-hd">THE SEATS · ' + live.length + ' OF ' + K.MAX_SEATS + '</div>';

  cfg.seats.forEach((s, i) => {
    const S = K.SEATS[i];
    const off = s.kind === 'off';
    h += '<div class="kr-pl">' +
      /* the face on the chair is the PERSON sitting in it, drawn by the
         one renderer, so the piece you pick here is the piece you see
         on the board. An empty chair gets the shape and no face. */
      tok(i, S.c, off ? S.n : s.name, 34, off ? 'bare' : '') +
      (off
        ? '<span style="flex:1;color:#7F73A0;font-size:12.5px;font-weight:700">Empty chair</span>'
        : '<button class="kr-seatname" id="kr-nm-' + i + '">' + esc(s.name) +
          '<small>' + (i === 0 ? 'your profile'
                     : s.kind === 'cpu' ? levelName(s.level) + ' · ready'
                     : 'on this phone') + '</small></button>') +
      '<button class="kr-mini" id="kr-kind-' + i + '"' + (i === 0 ? ' disabled' : '') + '>' +
        (off ? 'Add' : s.kind === 'cpu' ? 'Phone' : 'Person') + '</button>' +
      '</div>';
    if (s.kind === 'cpu'){
      h += '<div class="kr-seg" style="margin:-2px 0 8px 34px">' +
        LEVELS.map(L => '<button data-lv="' + i + ':' + L.k + '" aria-pressed="' + (s.level === L.k) + '">' +
          esc(L.n) + '<small>' + esc(L.t) + '</small></button>').join('') + '</div>';
    }
  });

  h += '<p class="kr-blurb">Two is the minimum and ' + K.MAX_SEATS + ' is the most this board can seat — ' +
    'past that the tokens stop being telling apart on a square. Sixteen properties between ' +
    K.MAX_SEATS + ' people means nobody finishes a colour on their own, which is when this game is at its best.</p>' +

    '<div class="kr-hd">HOW LONG</div><div class="kr-seg">' +
    [[15,'Short','~15 min'],[30,'Normal','~30 min'],[45,'Long','settle in'],[0,'To the end','or round ' + K.HARD_ROUNDS]]
      .map(o => '<button data-rl="' + o[0] + '" aria-pressed="' + (cfg.roundLimit === o[0]) + '">' +
        esc(o[1]) + '<small>' + esc(o[2]) + '</small></button>').join('') + '</div>' +
    '<p class="kr-blurb">On a round limit, whoever is worth the most when the rounds run out takes it — ' +
    'cash plus deeds plus everything built on them. It is how a property game gets to actually finish. ' +
    'Even "to the end" has a backstop at round ' + K.HARD_ROUNDS + ', because two stubborn people can pass ' +
    'the same rent back and forth until Christmas.</p>' +

    '<div class="kr-hd">IF SOMEBODY WANDERS OFF</div><div class="kr-seg">' +
    [[0,'Never','wait for them'],[45,'45 sec',''],[90,'90 sec',''],[180,'3 min','']]
      .map(o => '<button data-ck="' + o[0] + '" aria-pressed="' + (cfg.clock === o[0]) + '">' +
        esc(o[1]) + (o[2] ? '<small>' + esc(o[2]) + '</small>' : '') + '</button>').join('') + '</div>' +
    '<p class="kr-blurb">A seat that does not move within the clock is taken over by the phone so the table keeps ' +
    'going. It is obvious on screen when that happens, and one tap takes the seat back.</p>';
  w.innerHTML = h;

  /* the start bar says WHY it is unavailable rather than just sitting there dead */
  el.querySelector('#kr-startbar').innerHTML = enough
    ? '<button class="kr-btn go" id="kr-start">Deal the money out<small>' +
      live.length + ' playing · ' + (cfg.roundLimit ? cfg.roundLimit + ' rounds' : 'to the end') + '</small></button>'
    : '<button class="kr-btn" id="kr-start" disabled>Add one more<small>it takes ' + K.MIN_SEATS +
      ' to charge anybody rent</small></button>';

  w.querySelector('#kr-whatis').onclick = () => {
    cfg.showRules = !cfg.showRules;
    /* no sound: sfx.js's delegated layer already tapped this button, and a
       second file on the same frame is the double-fire, not a flourish */
    paintSetup();
  };
  cfg.seats.forEach((s, i) => {
    const nm = w.querySelector('#kr-nm-' + i);
    if (nm) nm.onclick = () => renameSheet(i);
    const kb = w.querySelector('#kr-kind-' + i);
    if (kb && i > 0) kb.onclick = () => {
      s.kind = s.kind === 'off' ? 'cpu' : s.kind === 'cpu' ? 'human' : 'off';
      if (s.kind !== 'off' && !s.name) s.name = K.SEATS[i].en;
      /* seats fill left to right — never leave a hole in the middle */
      if (s.kind === 'off') for (let j = i + 1; j < K.MAX_SEATS; j++) cfg.seats[j].kind = 'off';
      paintSetup();
    };
  });
  w.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => {
    const parts = b.getAttribute('data-lv').split(':');
    cfg.seats[Number(parts[0])].level = Number(parts[1]);
    paintSetup();
  });
  w.querySelectorAll('[data-rl]').forEach(b => b.onclick = () => {
    cfg.roundLimit = Number(b.getAttribute('data-rl')); paintSetup();
  });
  w.querySelectorAll('[data-ck]').forEach(b => b.onclick = () => {
    cfg.clock = Number(b.getAttribute('data-ck')); paintSetup();
  });
  el.querySelector('#kr-bk').onclick = menu;
  const go = el.querySelector('#kr-start');
  if (go && enough) go.onclick = () => {
    turnClock = cfg.clock;
    startGame(seatsIn().map(s => ({ name:s.name, kind:s.kind, level:s.level })), {
      roundLimit: cfg.roundLimit, clock: cfg.clock,
    });
  };
}

/* renaming is a choice, never a gate — the game is already startable
   without anybody touching this */
function renameSheet(i){
  const s = cfg.seats[i];
  const S = K.SEATS[i];
  const el = screenEl();
  let host = el.querySelector('#kr-sheet');
  if (!host){
    el.insertAdjacentHTML('beforeend',
      '<div class="kr-scrim" id="kr-scrim"></div><div class="kr-sheet" id="kr-sheet" role="dialog"></div>');
    els.scrim = el.querySelector('#kr-scrim');
    els.sheet = el.querySelector('#kr-sheet');
    els.scrim.onclick = closeSheet;
  }
  openSheet({
    kind:'rename',
    title:'Seat ' + (i + 1) + ' — ' + esc(S.n),
    body:'<p class="kr-blurb">' + (i === 0
        ? 'This is your profile name and it follows you into every game. Change it here just for tonight if you like.'
        : 'Call this seat whatever the person sitting in it answers to.') + '</p>' +
      '<div class="kr-pl">' + tok(i, S.c, s.name) +
      '<input id="kr-rn" maxlength="14" value="' + esc(s.name) + '" aria-label="Name for this seat"></div>',
    foot:'<button class="kr-btn" id="kr-rnx">Leave it</button>' +
         '<button class="kr-btn go" id="kr-rnok">That\'s it</button>',
    wire: root => {
      const f = root.querySelector('#kr-rn');
      setTimeout(() => { try { f.focus(); f.select(); } catch(e){} }, 60);
      root.querySelector('#kr-rnx').onclick = () => { closeSheetOnly(); paintSetup(); };
      root.querySelector('#kr-rnok').onclick = () => {
        s.name = (f.value || '').trim().slice(0, 14) || K.SEATS[i].en;
        closeSheetOnly(); paintSetup();
      };
    },
  });
}

/* ═══════════════════════════════════════════════════════════════════
   5b. ONE WAY IN, FOR BOTH PATHS
   The offline setup above and js/mp.js's shared lobby both land here,
   so an online game and a kitchen-table game are the same game with
   the same rules and the same save.
   ═══════════════════════════════════════════════════════════════════ */
function startGame(seatList, opts){
  opts = opts || {};
  const seats = (seatList || []).slice(0, K.MAX_SEATS).map((s, i) => ({
    name: (s && s.name ? String(s.name).trim().slice(0, 14) : '') || K.SEATS[i].en,
    kind: (s && s.kind === 'cpu') ? 'cpu' : 'human',
    level: s && s.level != null ? Math.max(1, Math.min(3, s.level | 0)) : 2,
    link: s && s.link ? s.link : 'local',
  }));
  if (seats.length < K.MIN_SEATS) return null;
  if (opts.clock != null) turnClock = Math.max(0, opts.clock | 0);
  G = K.newGame({
    players: seats,
    roundLimit: opts.roundLimit == null ? 30 : opts.roundLimit,
    seed: opts.seed,
    /* part of the DEAL, not a per-tap choice — see G.auctionOn in
       js/kiri.js, and the note over declineBuy() */
    auction: opts.auction !== false,
  });
  K.save(G);
  cue('game.start', { gain: 1.00 }, 0);
  show();
  boardScreen();
  return G;
}

/* ═══════════════════════════════════════════════════════════════════
   6. THE BOARD SCREEN
   Built once; render() repaints it. The ring is a 9x9 CSS grid and
   every square gets its grid cell from cellPos() — bottom-left is the
   start, and it runs clockwise: up the left, across the top, down the
   right, back along the bottom.
   ═══════════════════════════════════════════════════════════════════ */
function cellPos(i){
  if (i === 0)  return [9, 1];
  if (i < 8)    return [9 - i, 1];
  if (i === 8)  return [1, 1];
  if (i < 16)   return [1, i - 7];
  if (i === 16) return [1, 9];
  if (i < 24)   return [i - 15, 9];
  if (i === 24) return [9, 9];
  return [9, 9 - (i - 24)];
}

let els = {};
function boardScreen(){
  show();
  const el = screenEl();
  /* the landscape side-by-side grid belongs to the BOARD — the menu
     and the setup are ordinary columns whichever way the phone faces */
  el.classList.add('kr-landgrid');
  el.innerHTML =
    '<div class="kr-tbar">' +
      '<button class="kr-ib" id="kr-menu" aria-label="Leave the game"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>IL-KIRI</h2>' +
      '<span class="kr-round" id="kr-round"></span>' +
    '</div>' +
    '<div class="kr-strip" id="kr-strip"></div>' +
    '<div id="kr-awayhost"></div>' +
    '<div class="kr-wrap" id="kr-stage">' +
      '<div class="kr-board" id="kr-board"></div>' +
      '<div class="kr-zoom fitted" id="kr-zoom">' +
        '<button class="kr-zb fit" id="kr-zfit" aria-label="Fit the whole board on the screen">FIT</button>' +
        '<button class="kr-zb" id="kr-zout" aria-label="Zoom out">&#8722;</button>' +
        '<button class="kr-zb" id="kr-zin" aria-label="Zoom in">+</button>' +
      '</div>' +
    '</div>' +
    '<div class="kr-dock' + (dockDown ? ' down' : '') + '" id="kr-dock">' +
      '<button class="kr-grip" id="kr-grip" aria-controls="kr-dock" aria-expanded="' +
        (dockDown ? 'false' : 'true') + '"><i></i><span id="kr-griptx"></span>' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button>' +
      '<div class="kr-tabs" role="tablist">' +
        '<button class="kr-tab" role="tab" data-tab="square">SQUARE</button>' +
        '<button class="kr-tab" role="tab" data-tab="deeds">DEEDS</button>' +
        '<button class="kr-tab" role="tab" data-tab="table">TABLE</button>' +
        '<button class="kr-tab" role="tab" data-tab="log">LOG</button>' +
      '</div>' +
      '<div class="kr-pane" id="kr-pane"></div>' +
      '<div class="kr-act" id="kr-act"></div>' +
    '</div>' +
    '<div class="kr-scrim" id="kr-scrim"></div>' +
    '<div class="kr-sheet" id="kr-sheet" role="dialog" aria-modal="true"></div>';

  els = {
    round: el.querySelector('#kr-round'),
    strip: el.querySelector('#kr-strip'),
    away:  el.querySelector('#kr-awayhost'),
    wrap:  el.querySelector('.kr-wrap'),
    board: el.querySelector('#kr-board'),
    pane:  el.querySelector('#kr-pane'),
    act:   el.querySelector('#kr-act'),
    scrim: el.querySelector('#kr-scrim'),
    sheet: el.querySelector('#kr-sheet'),
    dock:  el.querySelector('#kr-dock'),
    grip:  el.querySelector('#kr-grip'),
    gript: el.querySelector('#kr-griptx'),
    zoom:  el.querySelector('#kr-zoom'),
  };
  /* the back arrow. Offline it asks what "leave" means — put it down
     for later, or end it here — because a game that is autosaved after
     every single action and can only ever be REPLACED is a game you are
     stuck with. Online the way out of a table is the room list, exactly
     as it is for every other party game, and leaving the room takes the
     save with it: the crash net is for a phone that died mid-game, not
     for a room you deliberately walked out of. */
  el.querySelector('#kr-menu').onclick = () => {
    if (NET){
      /* a live online table used to walk straight out with no confirm —
         the shared gate (P.guardLeave → KARTI_MP.askLeave) now asks
         first, with the honest sentence for this table's size and
         stake. No gate shipped yet → today's instant door, unchanged. */
      if (P && P.guardLeave) P.guardLeave(leaveRoom, 'back');
      else leaveRoom();
      return;
    }
    leaveSheet();
  };
  el.querySelectorAll('.kr-tab').forEach(b => b.onclick = () => {
    tab = b.getAttribute('data-tab'); render();
  });
  els.scrim.onclick = () => { if (!sheet || sheet.dismissable !== false) closeSheet(); };

  els.grip.onclick = () => setDock(!dockDown);
  wireZoom(el);

  /* the ring, built once */
  injectSprite();
  for (let i = 0; i < 32; i++){
    const s = K.BOARD[i];
    const c = document.createElement('button');
    c.className = 'kr-cell' + (['go','jail','rest','togo'].indexOf(s.t) >= 0 ? ' corner' : '');
    c.type = 'button';
    c.id = 'kr-c' + i;
    const [r, col] = cellPos(i);
    c.style.gridRow = r; c.style.gridColumn = col;
    c.setAttribute('aria-label', s.n);
    /* A DRAG IS NOT A TAP. The stage under this button pans the board,
       and a pan that started on a square used to open that square when
       your thumb came up. `panning` is set the moment the gesture
       passes the same slop threshold SKARTA's drag-to-arrange uses, so
       a tap still selects and a drag still drags. */
    c.onclick = () => { if (!panning) squareSheet(i); };
    els.board.appendChild(c);
  }
  const mid = document.createElement('div');
  mid.className = 'kr-mid'; mid.id = 'kr-mid';
  /* THE MIDDLE OF A TABLE IS A TABLE. js/artkit.js already owns the
     house's felt — the same cut as the kazin card table — so the ring
     asks the kit for it rather than mixing a second green here. */
  try { const a = artkit(); if (a && a.paint) a.paint(mid, 'felt'); } catch(e){}
  els.board.appendChild(mid);
  els.mid = mid;

  /* THE PIECES LIVE OVER THE RING, NOT IN IT. One grid cell per
     square, same placement, no pointer events — see the note over
     .kr-toks. A tile has to clip (its picture fills it); a crowd of
     eight faces must not. */
  els.toks = [];
  for (let i = 0; i < 32; i++){
    const t = document.createElement('div');
    t.className = 'kr-toks ' + (sideOf(i) || 'corner');
    t.id = 'kr-t' + i;
    const [r, col] = cellPos(i);
    t.style.gridRow = r; t.style.gridColumn = col;
    els.board.appendChild(t);
    els.toks.push(t);
  }

  paintDock();
  sizeBoard();
  fitView();
  if (!sizerOn) startSizer();
  render();
  resetClock();
  startDog();
  pump();
}

/* ═══════════════════════════════════════════════════════════════════
   6b. THE DOCK SLIDES DOWN
   A preference, so it is remembered — and remembered in its own key,
   never in the save: binning the game must not also forget that you
   like the board big. Everything the game is WAITING on stays on
   screen when it is down (the turn strip above it, the action bar
   inside it); only the four tabs and the pane they scroll fold away.
   ═══════════════════════════════════════════════════════════════════ */
const UI_KEY = 'karti_kiri_ui_v1';
let dockDown = false;
try { dockDown = localStorage.getItem(UI_KEY + '.dock') === '1'; } catch(e){}
/* whether the menu's rules panel is slid open — same idiom as .dock:
   a screen preference in its own key, never written into a save */
let rulesDown = false;
try { rulesDown = localStorage.getItem(UI_KEY + '.rules') === '1'; } catch(e){}
/* the OS setting and the app's own toggle both mean it */
function noMotion(){
  try {
    return document.body.classList.contains('reduced') ||
           (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch(e){ return false; }
}

const TABNAME = { square:'SQUARE', deeds:'DEEDS', table:'TABLE', log:'LOG' };
function paintDock(){
  if (!els.dock) return;
  els.dock.classList.toggle('down', dockDown);
  els.grip.setAttribute('aria-expanded', dockDown ? 'false' : 'true');
  els.grip.setAttribute('aria-label', dockDown
    ? 'Show the tabs' : 'Hide the tabs and give the board the room');
  if (els.gript) els.gript.textContent = dockDown ? (TABNAME[tab] || 'TABS') + ' — TAP TO OPEN' : 'HIDE';
}
function setDock(down){
  dockDown = !!down;
  try { localStorage.setItem(UI_KEY + '.dock', dockDown ? '1' : '0'); } catch(e){}
  paintDock();
  /* the stage just changed height; refit rather than leave the board
     hanging where the old one put it */
  sizeBoard();
  fitView();
  if (!dockDown) render();
}

/* ═══════════════════════════════════════════════════════════════════
   6c. THE RING IS AS BIG AS THE STAGE, AND THE STAGE IS MEASURED
   The old sum was arithmetic over the chrome: read the title bar's
   height, guess the dock's, subtract, hope. It has been replaced by
   the layout doing its own job — the dock is told what it is worth
   (--dockh, or --kw for the board's column beside it) and the stage
   is `flex:1`,
   so `stage.clientWidth/Height` IS the answer and there is nothing
   left to get wrong. The board is then the largest square that fits
   it, with no cap: on a tall phone with the dock down that is the
   whole screen, which is exactly what was asked for.

   Nothing here can feed back on itself. The board is absolutely
   positioned inside the stage, so its size cannot change the stage's;
   and --dockh is a function of the SCREEN's height, never the stage's.

   The page must never scroll — #scr-kiri is inset:0 with
   overflow:hidden and the stage clips too — so no amount of zooming
   can put a scrollbar anywhere.
   ═══════════════════════════════════════════════════════════════════ */
let sizerOn = false, ro = null;
function onItsSide(){
  const el = screenEl();
  return !!el && el.clientWidth > el.clientHeight && el.clientHeight <= 560;
}
function sizeBoard(){
  const el = screenEl();
  if (!el || !els.board || !els.wrap) return;
  /* what a dock has to be to be a dock: a grab handle, four 44-point
     tabs, a 50-point action bar and something to read between them.
     On a tall phone it can have its full 280; on a 660-point one,
     insisting on 280 was costing the board forty points it could have
     had. Beside the board it is a width instead of a height. */
  if (onItsSide()){
    /* BESIDE THE DOCK the ring is limited by HEIGHT, always — 440
       points of phone on its side is less than half its width. So the
       board's column is told exactly how wide the board will be and
       every remaining point goes to the dock, instead of the ring
       floating in the middle of a column with a hundred and fifty
       points of nothing either side of it. */
    const cs = getComputedStyle(el);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const minDock = dockDown ? 210 : 262;
    el.style.setProperty('--kw', Math.max(240,
      Math.min(el.clientHeight - padY, el.clientWidth - padX - 6 - minDock)) + 'px');
    el.style.removeProperty('--dockh');
  } else {
    el.style.removeProperty('--kw');
    el.style.setProperty('--dockh',
      Math.max(198, Math.min(280, Math.round(el.clientHeight * 0.34))) + 'px');
  }
  const w = els.wrap.clientWidth, h = els.wrap.clientHeight;
  if (!w || !h) return;
  const s = Math.max(240, Math.floor(Math.min(w, h)));
  if (s !== base){
    base = s;
    els.board.style.setProperty('--bs', s + 'px');
    if (G) renderCells();          /* the token sizes are a fraction of it */
  }
  clampView();
}
function startSizer(){
  sizerOn = true;
  if (typeof ResizeObserver === 'function'){
    ro = new ResizeObserver(sizeBoard);
    ro.observe(screenEl());
  } else window.addEventListener('resize', sizeBoard);
}

/* ═══════════════════════════════════════════════════════════════════
   6d. PINCH, DRAG, DOUBLE-TAP, FIT
   The board is a physical object on a table and the table is bigger
   than the phone, so you move it. All of it is ONE transform on
   .kr-board — translate then scale, origin at its top-left corner —
   which is the only thing on this screen that touches the compositor
   and the only thing that could not be done in layout.

   THE PAGE STILL CANNOT SCROLL. Zoom and pan happen strictly inside
   the stage's own overflow:hidden box; the document's scroll height
   never changes, whatever the zoom is. touch-action:none on the stage
   is what stops the browser taking the pinch for itself first.

   A TAP AND A DRAG ARE TOLD APART BY DISTANCE, the same nine points
   SKARTA uses to tell playing a card from rearranging your hand.
   Under the threshold the finger never moved and the square's own
   click runs; over it, `panning` is set and the click is dropped.

   YOU CAN NEVER BE STRANDED. The moment the board is not fitted, FIT
   appears in the corner of the stage and is one tap; double-tapping
   anywhere zooms straight back out; and the board is clamped so it
   can never be dragged off its own stage.
   ═══════════════════════════════════════════════════════════════════ */
const ZMAX = 4, ZTAP = 2.4, DRAG_SLOP = 9;
let base = 320;                     /* the fitted size of the board, in points */
let vw = { k:1, x:0, y:0 };
let panning = false;                /* this gesture has become a drag */
let pts = new Map();                /* live pointers on the stage */
let gest = null;                    /* the gesture in flight */
let lastTap = 0, lastTapX = 0, lastTapY = 0;
let dblWired = false;

function applyView(){
  if (!els.board) return;
  els.board.style.transform =
    'translate(' + vw.x.toFixed(1) + 'px,' + vw.y.toFixed(1) + 'px) scale(' + vw.k.toFixed(4) + ')';
  if (els.zoom){
    els.zoom.classList.toggle('fitted', vw.k <= 1.001);
    const zi = els.zoom.querySelector('#kr-zin'), zo = els.zoom.querySelector('#kr-zout');
    if (zi) zi.disabled = vw.k >= ZMAX - 0.001;
    if (zo) zo.disabled = vw.k <= 1.001;
  }
}
function clampView(){
  if (!els.wrap) return;
  const w = els.wrap.clientWidth, h = els.wrap.clientHeight, c = base * vw.k;
  vw.x = c <= w ? (w - c) / 2 : Math.min(0, Math.max(w - c, vw.x));
  vw.y = c <= h ? (h - c) / 2 : Math.min(0, Math.max(h - c, vw.y));
  applyView();
}
function fitView(){ vw.k = 1; followed = -1; clampView(); }

/* ── ZOOMED IN, THE GAME COMES TO YOU ───────────────────────────────
   Somebody who has pinched into the Belt corner should not have to
   pan back every time it is somebody else's turn. When the board is
   zoomed and the seat whose turn it is has moved to a square that is
   COMPLETELY off the stage, the board slides that square to the
   middle. Only completely off — a square you can still see is a
   square you were probably looking at, and shoving it about would be
   the board arguing with your thumb. */
let followed = -1;
function followTurn(){
  if (!G || G.over || vw.k <= 1.02 || !els.wrap) return;
  if (G.turn === followed) return;
  followed = G.turn;
  const p = G.players[G.turn];
  const c = p && document.getElementById('kr-c' + p.pos);
  if (!c) return;
  const r = c.getBoundingClientRect(), s = els.wrap.getBoundingClientRect();
  if (r.right > s.left && r.left < s.right && r.bottom > s.top && r.top < s.bottom) return;
  vw.x += els.wrap.clientWidth / 2 - ((r.left + r.right) / 2 - s.left);
  vw.y += els.wrap.clientHeight / 2 - ((r.top + r.bottom) / 2 - s.top);
  clampView();
}
/* zoom about a point in stage coordinates, so what is under your
   fingers stays under your fingers */
function zoomTo(k, px, py){
  k = Math.max(1, Math.min(ZMAX, k));
  if (Math.abs(k - vw.k) < 0.0005) return;
  const r = k / vw.k;
  vw.x = px - (px - vw.x) * r;
  vw.y = py - (py - vw.y) * r;
  vw.k = k;
  clampView();
  tokenReflow();
}
function stagePt(e){
  const r = els.wrap.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}
function centrePt(){ return [els.wrap.clientWidth / 2, els.wrap.clientHeight / 2]; }
function zoomStep(mul){
  const c = centrePt();
  zoomTo(vw.k * mul, c[0], c[1]);
}

/* HOW MANY FACES A SQUARE CAN SHOW depends on how big that square
   actually is ON THE GLASS, which is the cell size times the zoom —
   so pinching in really does reveal more of a crowd rather than just
   magnifying the same three. Only ever on a settled gesture: a
   re-render in the middle of a pinch is a stutter nobody asked for. */
let reflowT = 0, lastCap = 0;
function tokenReflow(){
  if (reflowT) return;
  reflowT = setTimeout(() => {
    reflowT = 0;
    if (G && els.board && tokCap() !== lastCap) renderCells();
  }, 90);
}

function wireZoom(el){
  const z = id => el.querySelector('#' + id);
  /* NO sfx() ON ANY OF THESE. sfx.js already puts ui.tap on every
     <button> in the app, and a hand-rolled second one is two files on
     the same frame — see the note over cue(). */
  z('kr-zin').onclick  = () => zoomStep(1.5);
  z('kr-zout').onclick = () => zoomStep(1 / 1.5);
  z('kr-zfit').onclick = () => { fitView(); tokenReflow(); };

  const st = els.wrap;
  const dist = () => {
    const a = [...pts.values()];
    return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
  };
  const mid = () => {
    const a = [...pts.values()], r = st.getBoundingClientRect();
    return [(a[0].x + a[1].x) / 2 - r.left, (a[0].y + a[1].y) / 2 - r.top];
  };

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

  /* CAPTURE ONLY ONCE IT IS A DRAG, never on the way down. A captured
     pointer retargets the compatibility click as well, so capturing on
     pointerdown would send every tap on a square to the stage and no
     square would ever open — which is the one thing that must not
     break. Taking the pointer at the moment the gesture passes the
     slop threshold gets both: a drag that survives the finger leaving
     the board, and a tap that still lands on the tile. */
  function grab(id){ try { st.setPointerCapture(id); } catch(err){} }

  st.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (!gest) return;
    if (gest.mode === 'pinch' && pts.size >= 2){
      const d = dist();
      if (!gest.d0) return;
      const k = Math.max(1, Math.min(ZMAX, gest.k0 * (d / gest.d0)));
      const m = mid();
      const r = k / gest.k0;
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
      const q = stagePt(e);
      if (Math.abs(q[0] - gest.x0) + Math.abs(q[1] - gest.y0) < DRAG_SLOP) return;
      gest.mode = 'pan';
      panning = true;
      grab(e.pointerId);
    }
    if (gest.mode === 'pan'){
      const q = stagePt(e);
      vw.x = gest.vx + (q[0] - gest.x0);
      vw.y = gest.vy + (q[1] - gest.y0);
      clampView();
      e.preventDefault();
    }
  });

  const up = e => {
    pts.delete(e.pointerId);
    if (pts.size === 0){
      const wasPan = gest && (gest.mode === 'pan' || gest.mode === 'pinch');
      gest = null;
      if (wasPan) tokenReflow();
      /* the click that follows this pointerup has to see `panning`;
         the tick after it has to not */
      setTimeout(() => { panning = false; }, 0);
    } else if (pts.size === 1 && gest && gest.mode === 'pinch'){
      /* one finger lifted out of a pinch — carry on as a pan from here */
      const only = [...pts.entries()][0];
      const r = els.wrap.getBoundingClientRect();
      gest = { mode:'pan', id:only[0], x0:only[1].x - r.left, y0:only[1].y - r.top,
               vx:vw.x, vy:vw.y };
    }
  };
  st.addEventListener('pointerup', up);
  st.addEventListener('pointercancel', up);

  /* a laptop, and anybody testing this on one */
  st.addEventListener('wheel', e => {
    const p = stagePt(e);
    zoomTo(vw.k * (e.deltaY < 0 ? 1.16 : 1 / 1.16), p[0], p[1]);
    e.preventDefault();
  }, { passive:false });

  /* DOUBLE-TAP, ON THE WHOLE SCREEN AND ON PURPOSE. The second tap of
     a double-tap on a square lands on the scrim of the sheet the FIRST
     tap opened, so a listener on the stage alone would never see it and
     double-tap would work everywhere except on the squares — which are
     the only places worth double-tapping. Listening in the capture
     phase on the screen catches both, and the only sheet it is allowed
     to dismiss is the harmless one it opened itself.

     ONCE, EVER. The stage is rebuilt every time the board screen is
     and takes its own listeners with it, but #scr-kiri is the same
     element for the life of the app — adding this again on every new
     game would fire the zoom once per game ever started. */
  if (dblWired) return;
  dblWired = true;
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button) return;
    if (!els.wrap || !els.wrap.isConnected) return;
    const inStage = els.wrap.contains(e.target);
    const onScrim = els.scrim && e.target === els.scrim;
    if (!inStage && !onScrim) return;
    const now = Date.now();
    const near = Math.abs(e.clientX - lastTapX) + Math.abs(e.clientY - lastTapY) < 34;
    if (now - lastTap < 320 && near){
      lastTap = 0;
      if (sheet && sheet.kind === 'square') closeSheetOnly();
      const r = els.wrap.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      if (vw.k > 1.02){ fitView(); tokenReflow(); }
      else zoomTo(ZTAP, px, py);
      panning = true;                 /* and do not open anything */
      setTimeout(() => { panning = false; }, 0);
      return;
    }
    lastTap = now; lastTapX = e.clientX; lastTapY = e.clientY;
  }, true);
}

/* ═══════════════════════════════════════════════════════════════════
   7. RENDER
   ═══════════════════════════════════════════════════════════════════ */
function render(){
  if (!G || !els.board) return;
  renderRound();
  renderStrip();
  renderAway();
  renderCells();
  followTurn();
  renderMid();
  renderPane();
  renderAct();
  if (G.over) renderOver();
}

function renderRound(){
  els.round.textContent = G.roundLimit
    ? 'ROUND ' + Math.min(G.round, G.roundLimit) + '/' + G.roundLimit
    : 'ROUND ' + G.round;
}

function renderStrip(){
  const p = me();
  const auto = K.machineSeat(G, G.turn);
  const empty = K.tableEmpty(G) && !G.over;
  let h =
    tok(p.i, p.colour, p.name) +
    '<span class="kr-who">' + esc(p.name) + '</span>' +
    (p.kind === 'cpu' ? '<span class="kr-auto">PHONE</span>'
      : p.auto ? '<span class="kr-auto">ON AUTOPILOT</span>' : '') +
    (p.jail > 0 ? '<span class="kr-auto" style="background:rgba(255,84,104,.2);color:#FF9AA6;border-color:rgba(255,84,104,.45)">IN THE QUEUE</span>' : '') +
    (p.skips > 0 ? '<span class="kr-auto" style="background:rgba(61,220,132,.18);color:#3DDC84;border-color:rgba(61,220,132,.45)">SKIP ×' + p.skips + '</span>' : '') +
    '<span class="kr-cash">' + money(p.cash) + '</span>' +
    /* ONLINE THE STRIP IS SOMEBODY ELSE HALF THE TIME, so your own
       money goes on it too — otherwise the only place you can see what
       you are worth is a tab you have to switch to. */
    (NET && G.turn !== NET.mySeat && G.players[NET.mySeat]
      ? '<span class="kr-auto" style="background:rgba(61,220,132,.16);color:#3DDC84;' +
        'border-color:rgba(61,220,132,.4)">YOU ' + money(G.players[NET.mySeat].cash) + '</span>'
      : '');
  /* the button that hands a seat back lives in ONE place, the away bar
     below — two of them on screen at once just looks like a mistake */
  if (!auto && turnClock > 0 && clockLeft <= 20 && clockLeft > 0 && !G.over)
    h += '<span class="kr-auto" style="background:rgba(255,84,104,.2);color:#FF9AA6">' + clockLeft + 's</span>';
  els.strip.innerHTML = h;
  els.strip.style.borderColor = empty ? 'rgba(255,84,104,.5)' : 'rgba(255,255,255,.10)';
}

/* WHO IS BEING PLAYED BY THE PHONE, VISIBLE AT ALL TIMES.
   The turn strip only ever shows the seat whose turn it is, so a seat
   that went quiet three turns ago was invisible to everybody else —
   they just watched somebody make odd decisions and wondered. This bar
   sits under the strip whenever any human seat is on autopilot, names
   the people, and carries the button that hands the seat straight
   back. It is the only honest way to run a table with a missing chair. */
function renderAway(){
  if (!els.away) return;
  const gone = G.players.filter(p => !p.out && p.kind !== 'cpu' && p.auto);
  /* THE ONE LINE THE TRANSPORT MAY SAY. js/mp.js hands us a sentence —
     somebody joined, somebody dropped, a packet was refused — and it
     goes here, in the bar that already exists, so the online build adds
     no chrome and nothing can push the board off a 894-point screen. */
  const net = netMsg.t
    ? '<div class="kr-away' + (netMsg.k === 'warn' ? ' warn' : '') + '" role="status" aria-live="polite">' +
      '<span class="kr-awt">' + esc(netMsg.t) + '</span></div>'
    : '';
  if (!gone.length || G.over){ els.away.innerHTML = G.over ? '' : net; sizeBoard(); return; }
  const why = { clock:'has not moved', signal:'has lost the connection', away:'has gone', asked:'asked the phone to play' };
  els.away.innerHTML = net +
    '<div class="kr-away" role="status" aria-live="polite">' +
      gone.map(p => tok(p.i, p.colour, p.name, 28)).join('') +
      '<span class="kr-awt"><b>' + gone.map(p => esc(p.name)).join(', ') + '</b> ' +
        (gone.length > 1 ? 'are away' : (why[gone[0].autoWhy] || 'is away')) +
        ' — the phone is playing ' + (gone.length > 1 ? 'those seats' : 'that seat') + '.</span>' +
      '<button class="kr-back" id="kr-awayback">' +
        (gone.length > 1 ? 'We\'re back' : 'I\'m back') + '</button>' +
    '</div>';
  /* the away bar appearing or going away changes how much room is left
     above the ring, and nothing else would notice */
  sizeBoard();
  els.away.querySelector('#kr-awayback').onclick = () => {
    cue('mp.joined', { gain: 1.00 }, 1);
    gone.forEach(p => act({ t:'back' }, p.i));
    if (timer){ clearTimeout(timer); timer = 0; }
    K.save(G); render(); resetClock(); pump();
  };
}

/* ═══════════════════════════════════════════════════════════════════
   6e. THIRTY DRAWINGS, ONE FOR EVERY SQUARE

   A short code is what a square is CALLED. It is not what a square
   IS, and thirty-two tiles that differ only in three letters is a
   list, not a board. So every square on this ring is now drawn —
   sixteen properties in six groups, four transport, two services,
   two taxes, two decks and four corners — and the drawing is of that
   square in particular, off the joke printed under its own name in
   js/kiri.js. The garage is a garage with a sofa in it. The shop has
   its sign still hanging. The Mdina house has one lit window and one
   dark one, because nobody has slept in it since 1987.

   IT IS THE SAME LANGUAGE js/artkit.js SPEAKS, not a second one.
   Same 24x24 grid, same filled silhouette with the holes cut by
   fill-rule="evenodd" rather than painted over, the same two shadow
   tones at fill-opacity .45 and .75, the same warm near-black ink,
   and the kit's own .ka-g class doing the stroking — so a KIRI
   square and a KARTI emblem sit on the same shelf. Where the kit
   already owns a shape (the ferry, the bus) this asks for it with an
   '@' rather than drawing a second one. The sprite lives here only
   because js/artkit.js is not this file's to edit; everything about
   the drawing obeys it.

   NO EMOJI, and no generated art file: the board still ships
   finished with nothing in art/ at all.
   ═══════════════════════════════════════════════════════════════════ */
/* an ellipse as a path, so it can be a hole inside another path */
const ell = (cx, cy, rx, ry) =>
  'M' + (cx - rx) + ' ' + cy + 'a' + rx + ' ' + ry + ' 0 1 0 ' + (rx * 2) + ' 0' +
  'a' + rx + ' ' + ry + ' 0 1 0 ' + (-rx * 2) + ' 0Z';
const rct = (x, y, w, h) => 'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'Z';
/* a grid of little windows, as holes */
function panes(x, y, w, h, gx, gy, cols, rows){
  let d = '';
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      d += rct(+(x + c * (w + gx)).toFixed(2), +(y + r * (h + gy)).toFixed(2), w, h);
  return d;
}
/* a tyre: a fat ring lying flat */
const tyre = (cx, cy, r) =>
  '<path fill-rule="evenodd" d="' + ell(cx, cy, r, r * 0.52) +
  ell(cx, cy, r * 0.4, r * 0.21) + '"/>';

const KR_MARKS = {

  /* ── the four corners ───────────────────────────────────────── */
  /* IL-BIDU: the post you set off from, and the way round the board */
  bidu: '<path d="' + rct(2.2, 2.4, 2.8, 19.2) + '"/>' +
        '<path d="M7.4 9h6.4V4.2L21.8 12l-8 7.8V15H7.4Z"/>',
  /* IL-KJU: three people, one behind the other, at counter four */
  kju:  '<path fill-rule="evenodd" d="' + ell(5.2, 6.4, 2.7, 2.7) + '"/>' +
        '<path d="M1.5 21.6v-6.9a3.7 3.7 0 0 1 7.4 0v6.9Z"/>' +
        '<path fill-opacity=".75" d="' + ell(12, 7, 2.4, 2.4) + '"/>' +
        '<path fill-opacity=".75" d="M8.8 21.6v-6.4a3.2 3.2 0 0 1 6.4 0v6.4Z"/>' +
        '<path fill-opacity=".45" d="' + ell(18.6, 7.5, 2.2, 2.2) + '"/>' +
        '<path fill-opacity=".45" d="M15.7 21.6v-6a2.9 2.9 0 0 1 5.8 0v6Z"/>',
  /* IL-PJAZZA: a café table, a cup on it, and two chairs nobody has
     got up from since the first coffee */
  pjazza: '<path fill-opacity=".45" d="' + rct(0.6, 6.4, 2.2, 10.4) + rct(0.6, 16.8, 4.8, 1.8) +
        rct(1.4, 18.6, 1.4, 3.2) + rct(21.2, 6.4, 2.2, 10.4) + rct(18.6, 16.8, 4.8, 1.8) +
        rct(21.2, 18.6, 1.4, 3.2) + '"/>' +
        '<path d="' + rct(4.6, 13.4, 14.8, 2.2) + rct(10.9, 15.6, 2.2, 5.2) +
        rct(7.6, 20.8, 8.8, 1.8) + '"/>' +
        '<path d="M9.2 6.2h5.4v4.2a2.7 2.7 0 0 1-5.4 0Z"/>' +
        '<path fill-opacity=".75" d="M14.9 7h1.3a1.8 1.8 0 0 1 0 3.6h-1.3Z"/>' +
        '<path d="' + rct(7.6, 11.4, 8.6, 1.6) + '"/>',
  /* IL-MARSA: the lights, and the lane you are in is the wrong one */
  junction: '<path fill-rule="evenodd" d="M7.4 1.2h9.2a2.2 2.2 0 0 1 2.2 2.2v13a2.2 2.2 0 0 1-2.2 2.2H7.4' +
        'a2.2 2.2 0 0 1-2.2-2.2v-13a2.2 2.2 0 0 1 2.2-2.2Z' +
        ell(12, 5.4, 1.9, 1.9) + ell(12, 9.9, 1.9, 1.9) + ell(12, 14.4, 1.9, 1.9) + '"/>' +
        '<path d="' + rct(10.9, 18.6, 2.2, 4.2) + '"/>' +
        '<path fill-opacity=".45" d="' + rct(7.4, 21.4, 9.2, 1.6) + '"/>',

  /* ── what the state takes ───────────────────────────────────── */
  /* IT-TAXXA: the till receipt, torn off at the bottom */
  taxxa: '<path fill-rule="evenodd" d="M4.2 1.6h15.6v19.6l-1.95-1.5-1.95 1.5-1.95-1.5-1.95 1.5' +
        '-1.95-1.5-1.95 1.5-1.95-1.5L4.2 21.2Z' +
        rct(6.8, 5, 10.4, 1.7) + rct(6.8, 8.6, 10.4, 1.7) + rct(6.8, 12.2, 6.6, 1.7) + '"/>',
  /* IĊ-ĊENS: set in 1912, sealed, and it will outlive the building */
  cens: '<path fill-rule="evenodd" d="M4.4 2.2h11.4a2.6 2.6 0 0 1 2.6 2.6v12.6a2.6 2.6 0 0 1-2.6 2.6H4.4' +
        'a2.6 2.6 0 0 1-2.6-2.6V4.8a2.6 2.6 0 0 1 2.6-2.6Z' +
        rct(5.4, 6, 8.6, 1.6) + rct(5.4, 9.6, 8.6, 1.6) + rct(5.4, 13.2, 5.4, 1.6) + '"/>' +
        '<path fill-rule="evenodd" d="' + ell(17.4, 17.6, 4.2, 4.2) + ell(17.4, 17.6, 1.7, 1.7) + '"/>',

  /* ── transport ──────────────────────────────────────────────── */
  /* IL-KAROZZIN: forty euro to be pulled past things you could walk to */
  /* the horse is ONE closed path, not a body with parts stuck on it:
     four separate shapes each get their own ink outline and the
     animal comes out looking assembled rather than drawn */
  karozzin: '<path fill-opacity=".75" d="M11.4 10.2 18.6 10.2 20 5.8 19.6 4.4 21.2 5 23.4 5 23.4 8' +
        ' 21.2 8.4 20.4 11 19.8 15.2 19.8 19.2 18 19.2 18 15.2 14.6 15.2 14.6 19.2 12.8 19.2' +
        ' 12.8 15.2 11.4 15.2Z"/>' +
        '<path d="M0.8 8h8.7a1.9 1.9 0 0 1 1.9 1.9v5.3h-10.6Z"/>' +
        '<path fill-opacity=".45" d="' + rct(0.8, 5.4, 7.4, 2.6) + '"/>' +
        '<path fill-rule="evenodd" d="' + ell(5.8, 17.6, 4.6, 4.6) + ell(5.8, 17.6, 1.6, 1.6) + '"/>' +
        '<path fill-opacity=".45" d="' + rct(10.6, 13.4, 3, 1.4) + '"/>',
  /* IT-TAXI: the fare is fixed, at a different number every time */
  taxi: '<path d="M8.6 1.4h6.8a1.3 1.3 0 0 1 1.3 1.3v2.5H7.3V2.7A1.3 1.3 0 0 1 8.6 1.4Z"/>' +
        '<path fill-rule="evenodd" d="M4.6 6.4h14.8a2.1 2.1 0 0 1 2 1.5l1.3 4.2v4.7a1.5 1.5 0 0 1-1.5 1.5' +
        'H2.8a1.5 1.5 0 0 1-1.5-1.5v-4.7l1.3-4.2a2.1 2.1 0 0 1 2-1.5Z' +
        'M5.6 8.6 4.4 12.2h6.6V8.6Z M13 8.6v3.6h6.6L18.4 8.6Z"/>' +
        '<path fill-rule="evenodd" d="' + ell(6.2, 18.8, 2.9, 2.9) + ell(6.2, 18.8, 1, 1) +
        ell(17.8, 18.8, 2.9, 2.9) + ell(17.8, 18.8, 1, 1) + '"/>',

  /* ── services ───────────────────────────────────────────────── */
  /* IL-BOWSER: he comes when he comes, and he does not do Tuesdays */
  bowser: '<path d="M1.2 8a3.9 3.9 0 0 1 3.9-3.9h6.6A3.9 3.9 0 0 1 15.6 8v4.2' +
        'a3.9 3.9 0 0 1-3.9 3.9H5.1a3.9 3.9 0 0 1-3.9-3.9Z"/>' +
        '<path fill-opacity=".45" d="' + rct(7.7, 4.6, 1.4, 11) + '"/>' +
        '<path fill-rule="evenodd" d="M16.4 7.4h3.2l3.2 4.4v4.3h-6.4Z M18 9.2v2.8h3.1L19.1 9.2Z"/>' +
        '<path fill-rule="evenodd" d="' + ell(6, 18.6, 2.7, 2.7) + ell(6, 18.6, .9, .9) +
        ell(18.2, 18.6, 2.7, 2.7) + ell(18.2, 18.6, .9, .9) + '"/>',
  /* IL-ĠENERATUR: eleven seconds after the power cuts */
  generatur: '<path fill-opacity=".45" d="' + rct(4.4, 1.6, 3, 4.4) + '"/>' +
        '<path fill-rule="evenodd" d="M2.2 6.2h19.6a2 2 0 0 1 2 2v9.4a2 2 0 0 1-2 2H2.2a2 2 0 0 1-2-2V8.2' +
        'a2 2 0 0 1 2-2Z M13.4 8 8.2 13.9h3.2l-1 4.5 5.4-6.1h-3.4Z"/>' +
        '<path fill-opacity=".45" d="' + rct(3, 19.6, 3.4, 2.6) + rct(17.6, 19.6, 3.4, 2.6) + '"/>',

  /* ── the two decks ──────────────────────────────────────────── */
  /* GĦAJDUT: she said it because it was TRUE, and you were not there */
  ghajdut: '<path fill-rule="evenodd" d="' + ell(6.6, 6.8, 3.6, 3.6) + '"/>' +
        '<path d="M1.2 21.8v-5.4a5.4 5.4 0 0 1 10.8 0v5.4Z"/>' +
        '<path fill-opacity=".55" d="' + ell(17.6, 8.2, 3, 3) + '"/>' +
        '<path fill-opacity=".55" d="M13.2 21.8v-4.4a4.4 4.4 0 0 1 8.8 0v4.4Z"/>' +
        '<path fill-opacity=".45" d="' + rct(10.6, 9.4, 4.2, 1.5) + '"/>',
  /* TAL-GVERN: a brown envelope with a window in it */
  gvern: '<path fill-rule="evenodd" d="M2 4.4h20a2 2 0 0 1 2 2v11.2a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6.4' +
        'a2 2 0 0 1 2-2Z ' + rct(12.8, 12.4, 7.2, 4.6) + '"/>' +
        '<path fill-opacity=".45" d="M2.2 5h19.6L12 10.8Z"/>',

  /* ── IL-MARSA: brown ────────────────────────────────────────── */
  /* IL-GARAXX: advertised as a workshop, contains a sofa */
  garaxx: '<path fill-rule="evenodd" d="' + rct(1.8, 1.6, 20.4, 7.6) +
        rct(3.6, 3.3, 16.8, 1.1) + rct(3.6, 5.6, 16.8, 1.1) + '"/>' +
        '<path d="' + rct(5, 11.6, 14, 3.4) + '"/>' +
        '<path d="' + rct(3.8, 14, 2.8, 3.4) + rct(17.4, 14, 2.8, 3.4) + '"/>' +
        '<path d="' + rct(5.2, 15, 13.6, 3.8) + '"/>' +
        '<path fill-opacity=".45" d="' + rct(11.5, 15.2, 1, 3.4) + '"/>' +
        '<path d="' + rct(5.4, 18.8, 1.6, 2) + rct(17, 18.8, 1.6, 2) + '"/>' +
        '<path fill-opacity=".45" d="' + rct(1.4, 21, 21.2, 1.6) + '"/>',
  /* IL-MAĦŻEN: six tonnes of metal and a man who knows the price of copper */
  mahzen: '<path fill-opacity=".45" d="M1.4 7.2 12 2 22.6 7.2v2H1.4Z"/>' +
        '<path fill-rule="evenodd" d="' + ell(6.6, 15.8, 5.4, 5.4) + ell(6.6, 15.8, 2.2, 2.2) + '"/>' +
        '<path d="' + rct(13, 11.4, 9.6, 2.6) + '"/>' +
        '<path fill-opacity=".75" d="' + rct(14, 14.8, 8.6, 2.6) + '"/>' +
        '<path d="' + rct(13, 18.2, 9.6, 2.6) + '"/>',
  /* ── IL-ĦAMRUN: olive ───────────────────────────────────────── */
  /* IL-ĦANUT: closing down since 2016, and the sign has not aged */
  hanut: '<path d="' + rct(1.2, 3.4, 21.6, 3.2) + '"/>' +
        '<path d="M1.2 6.6h21.6v2.2a1.8 1.8 0 0 1-3.6 0 1.8 1.8 0 0 1-3.6 0 1.8 1.8 0 0 1-3.6 0' +
        ' 1.8 1.8 0 0 1-3.6 0 1.8 1.8 0 0 1-3.6 0 1.8 1.8 0 0 1-3.6 0Z"/>' +
        '<path fill-rule="evenodd" d="' + rct(3, 11.4, 18, 10.8) +
        rct(4.8, 13.2, 14.4, 1.2) + rct(4.8, 15.8, 14.4, 1.2) + rct(4.8, 18.4, 14.4, 1.2) + '"/>' +
        '<path transform="rotate(-13 15.6 15.4)" d="' + rct(10.4, 12.4, 10.4, 6) + '"/>',
  /* IL-FURNAR: warm all year, and at four in the morning you are awake */
  furnar: '<path fill-rule="evenodd" d="' + rct(4.4, 1.2, 15.2, 7.6) +
        panes(6.2, 3, 3.2, 3.6, 1.4, 0, 3, 1) + '"/>' +
        '<path fill-rule="evenodd" d="' + ell(12, 16.4, 8.2, 5.8) +
        'M8 14.1l1.5-1.2 2.8 3.6-1.5 1.2Z M12.1 13.6l1.5-1.2 2.8 3.6-1.5 1.2Z"/>',
  /* ID-DAR BL-UMDITÀ: the surveyor called it rising, the wardrobe calls it home */
  umdita: '<path fill-rule="evenodd" d="M12 1.4 23 9.8v12.2H1V9.8Z ' + rct(4, 11.4, 16, 8.8) + '"/>' +
        '<path fill-opacity=".75" d="M6.6 13c2.4-1.5 4.4.6 6.3-.2 2-.9 3.5.4 3.9 1.9.5 1.9-.8 3.6-2.8 4' +
        '-2.2.4-3.6-.8-5.3-.3-1.8.5-3.1-.7-3.2-2.2-.1-1.5.8-2.6 1.1-3.2Z"/>' +
        '<path d="M8.2 19c.7.8 1.1 1.4 1.1 1.9a1.1 1.1 0 0 1-2.2 0c0-.5.4-1.1 1.1-1.9Z' +
        'M13.6 19.3c.6.7 1 1.3 1 1.7a1 1 0 0 1-2 0c0-.4.4-1 1-1.7Z"/>',
  /* ── IL-BIRGU: red ──────────────────────────────────────────── */
  /* IL-BIR: twelve metres deep and under where the dishwasher goes */
  bir: '<path d="' + rct(2.8, 0.8, 18.4, 2) + rct(4.2, 2.8, 1.9, 5.6) + rct(17.9, 2.8, 1.9, 5.6) + '"/>' +
        '<path fill-opacity=".45" d="' + rct(11.2, 2.8, 1.6, 4.6) + '"/>' +
        '<path d="M9.2 7.4h5.6l-.8 4H10Z"/>' +
        '<path fill-rule="evenodd" d="' + rct(2.4, 12.4, 19.2, 9.8) +
        rct(4.4, 14.4, 15.2, 1.3) + rct(4.4, 17.4, 15.2, 1.3) + '"/>',
  /* ID-DAR TAL-KARATTRU: every ceiling four centimetres lower than your head */
  karattru: '<path fill-rule="evenodd" d="M12 1.8a8.8 8.8 0 0 1 8.8 8.8v11.4H3.2V10.6A8.8 8.8 0 0 1 12 1.8Z' +
        'M12 4.6a6 6 0 0 0-6 6v9h12v-9a6 6 0 0 0-6-6Z"/>' +
        '<path fill-opacity=".45" d="' + rct(11.2, 11.4, 1.6, 8.2) + '"/>' +
        '<path fill-rule="evenodd" d="' + ell(9.2, 13.6, 1.6, 1.6) + ell(9.2, 13.6, .6, .6) + '"/>',
  /* L-ISTALLA: the horse would still find it about right */
  stalla: '<path fill-rule="evenodd" d="' + rct(3.4, 2.2, 17.2, 19.6) + rct(5.6, 4.4, 12.8, 6.4) + '"/>' +
        '<path fill-opacity=".45" d="' + rct(3.4, 11.6, 17.2, 1.4) + '"/>' +
        '<path fill-rule="evenodd" d="M12 13.6a4.4 4.4 0 0 1 4.4 4.4v3h-2.6v-3a1.8 1.8 0 0 0-3.6 0v3H7.6v-3' +
        'A4.4 4.4 0 0 1 12 13.6Z"/>',
  /* ── IS-SWIEQI: orange ──────────────────────────────────────── */
  /* IL-BLOKK BLA PERMESS: the paperwork says "boundary wall" */
  blokk: '<path d="' + rct(1.8, 2.6, 18.4, 3.6) + '"/>' +
        '<path fill-rule="evenodd" d="' + rct(4.6, 6.2, 11.6, 15.8) +
        panes(6.4, 8.2, 3, 2.6, 1.8, 2.2, 2, 3) + '"/>' +
        '<path fill-opacity=".45" d="' + rct(18.2, 6.4, 1.6, 15.6) + rct(16.4, 21.2, 5.6, 1.4) + '"/>',
  /* IL-MAISONETTE TAL-ĦABIB: he will do you a price, and be thanked for it */
  maisonette: '<path d="M0.8 7 9.4 1.6 18 7Z"/>' +
        '<path fill-rule="evenodd" d="' + rct(2.4, 7, 14, 14.8) +
        rct(4.6, 9.2, 3.4, 3.2) + rct(9.8, 9.2, 3.4, 3.2) + rct(4.6, 15, 3.4, 4.8) + '"/>' +
        '<path fill-opacity=".75" d="M16.4 21.8v-2.4h1.7V17h1.7v-2.4h1.7v-2.4h1.7v11.6Z"/>',
  /* PENTHOUSE BIT-TIKKA BAĦAR: nine centimetres of sea, going in April */
  penthouse: '<path fill-opacity=".45" d="M1.2 5.6h21.6v1.5H1.2Z M1.2 8.6h21.6v1.5H1.2Z"/>' +
        '<path d="M3 6.6a9 9 0 0 1 18 0Z"/>' +
        '<path d="' + rct(11.2, 6.6, 1.6, 9.4) + rct(1.4, 15.4, 21.2, 2) + '"/>' +
        '<path fill-opacity=".75" d="' + rct(2.6, 17.8, 1.5, 4.4) + rct(11.2, 17.8, 1.5, 4.4) +
        rct(19.9, 17.8, 1.5, 4.4) + rct(2.6, 17.8, 18.8, 1.3) + '"/>',
  /* ── TAS-SLIEMA: sea blue ───────────────────────────────────── */
  /* IL-FLAT TAL-FRONT: everyone can tell you what it went for */
  front: '<path d="' + rct(2.2, 1.4, 19.6, 2.2) + '"/>' +
        '<path fill-rule="evenodd" d="' + rct(3.4, 3.6, 17.2, 11.6) +
        rct(5.4, 5.6, 3.4, 5.6) + rct(10.3, 5.6, 3.4, 5.6) + rct(15.2, 5.6, 3.4, 5.6) + '"/>' +
        '<path fill-opacity=".45" d="M5 15.2h14v1.8l-1.8 1.4h-10.4L5 17Z"/>' +
        '<path fill-opacity=".75" d="M0.8 19.6h4.6v1.6H0.8Z M6.8 21h4.6v1.6H6.8Z M12.8 19.6h4.6v1.6h-4.6Z' +
        ' M18.8 21h4.4v1.6h-4.4Z"/>',
  /* IT-TORRI: eleven people live in it, four of them exist */
  torri: '<path fill-rule="evenodd" d="' + rct(6, 1.2, 12, 18.6) +
        panes(7.6, 3, 2.4, 2.2, 1.4, 1.9, 3, 4) + '"/>' +
        '<path fill-opacity=".45" d="' + rct(0.8, 20, 22.4, 1.5) + rct(0.8, 22.2, 22.4, 1.2) + '"/>',
  /* ŻEWĠ KMAMAR BIL-VISTA: you will show people the view for life */
  vista: '<path fill-opacity=".75" d="' + rct(0.8, 3.2, 4.4, 15.4) + rct(18.8, 3.2, 4.4, 15.4) + '"/>' +
        '<path fill-rule="evenodd" d="' + rct(6, 3.2, 12, 15.4) + rct(8, 5.2, 8, 11.4) + '"/>' +
        '<path d="' + ell(13.4, 8.6, 2, 2) + '"/>' +
        '<path d="' + rct(8, 12.4, 8, 1.5) + '"/>',
  /* ── IL-BELT: purple ────────────────────────────────────────── */
  /* IL-PALAZZ: you may look at it, pay for it, and change nothing */
  palazz: '<path d="M0.8 6.4 12 1.2l11.2 5.2Z"/>' +
        '<path fill-rule="evenodd" d="' + rct(2.2, 6.4, 19.6, 15.6) +
        rct(4.6, 9, 3.4, 4.4) + rct(16, 9, 3.4, 4.4) + '"/>' +
        '<path d="M9.6 15.2h4.8v6.8H9.6Z"/>' +
        '<path fill-opacity=".75" d="M9.4 8.4h5.2v3.6L12 14.6 9.4 12Z"/>',
  /* ID-DAR TAL-IMDINA: nobody has slept in it since 1987 */
  imdina: '<path d="' + rct(1.2, 3.8, 3.4, 3.4) + rct(7, 3.8, 3.4, 3.4) +
        rct(12.8, 3.8, 3.4, 3.4) + rct(18.6, 3.8, 3.4, 3.4) + '"/>' +
        '<path fill-rule="evenodd" d="' + rct(1.2, 7.2, 21.6, 14.8) +
        'M12 12.4a2.8 2.8 0 0 0-2.8 2.8V22h5.6v-6.8a2.8 2.8 0 0 0-2.8-2.8Z"/>' +
        '<path d="' + rct(4, 9.8, 3, 3) + '"/>' +
        '<path fill-opacity=".45" d="' + rct(17, 9.8, 3, 3) + '"/>',
};

/* the sprite, injected once. Same shape as js/artkit.js's, with our
   own id prefix so the two can never collide. */
let spriteIn = false;
function injectSprite(){
  if (spriteIn || document.getElementById('kiri-sprite')){ spriteIn = true; return; }
  if (!document.body) return;
  spriteIn = true;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', 'kiri-sprite');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  let s = '';
  for (const k in KR_MARKS)
    if (Object.prototype.hasOwnProperty.call(KR_MARKS, k))
      s += '<symbol id="kr-m-' + k + '" viewBox="0 0 24 24">' + KR_MARKS[k] + '</symbol>';
  svg.innerHTML = s;
  document.body.appendChild(svg);
}

/* WHICH DRAWING BELONGS TO WHICH SQUARE, by the square's own id — so
   a renamed square never silently loses its picture, and a new one
   without a drawing is simply a tile with a code on it rather than a
   broken cell. An '@' means the shared kit already draws it. */
const DRAW = {
  bidu:'bidu', kju:'kju', pjazza:'pjazza', junction:'junction',
  taxxa:'taxxa', cens:'cens',
  vapur:'@ferry', terminus:'@bus', karozzin:'karozzin', taxi:'taxi',
  bowser:'bowser', generatur:'generatur',
  garaxx:'garaxx', mahzen:'mahzen',
  hanut:'hanut', furnar:'furnar', umdita:'umdita',
  bir:'bir', karattru:'karattru', stalla:'stalla',
  blokk:'blokk', maisonette:'maisonette', penthouse:'penthouse',
  front:'front', torri:'torri', vista:'vista',
  palazz:'palazz', imdina:'imdina',
};
const DECK_DRAW = { ghajdut:'ghajdut', gvern:'gvern' };

function drawOf(s){
  return s.t === 'card' ? (DECK_DRAW[s.deck] || '') : (DRAW[s.id] || '');
}
function markSVG(n){
  if (!n) return '';
  if (n.charAt(0) === '@'){
    const a = artkit();
    return (a && a.mark) ? a.mark(n.slice(1)) : '';
  }
  injectSprite();
  return '<svg class="ka-g" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
         '<use href="#kr-m-' + n + '"></use></svg>';
}
/* the picture that fills a tile, tinted with the square's own colour */
function pictureFor(s, colour){
  const g = markSVG(drawOf(s));
  return g ? '<span class="kr-pic"' +
             (colour ? ' style="--pc:' + colour + '"' : '') + '>' + g + '</span>' : '';
}

/* WHICH SIDE OF THE RING A SQUARE IS ON. It never changes, so it is
   worked out once when the ring is built and lives on the cell as a
   class — the colour strip, the deed hem and the token row all hang
   off it. Corners get no side: nothing on them faces anywhere. */
function sideOf(i){
  if (i === 0 || i === 8 || i === 16 || i === 24) return '';
  if (i < 8)  return 's-l';
  if (i < 16) return 's-t';
  if (i < 24) return 's-r';
  return 's-b';
}

/* the seat's silhouette. Eight are drawn; the ninth would be the
   ninth shape, not the ninth shade of blue. */
const pipClass = i => 'k' + (i % 8);

/* ── A PLAYER IS THEIR OWN FACE ─────────────────────────────────────
   THE ONLY WAY A FACE IS DRAWN IN THIS FILE. js/progress-ui.js owns
   every face in KARTI — the drawn Maltese ones, somebody's own
   photograph, the border they have unlocked — and it fills in this
   span wherever it finds one. Nothing here knows or decides anything
   about what a player looks like, which is the entire point: the last
   time two places both "knew", it cost four bugs in a day.

   The shape around it is the seat, not the person: eight collars
   (disc, square, diamond, triangle, pentagon, hexagon, bar, cross) in
   the eight seat colours, so that at the far side of the board you can
   still find yours without recognising a face nine points across. */
function faceSpan(name, px){
  return '<span data-kx-av="' + esc(name || '') + '" data-kx-size="' + Math.round(px) + '"></span>';
}
/* the token, wherever a seat has to be named: board, strip, away bar,
   table, standings, setup. `sz` is its width in points; the face
   inside is 74% of it, which leaves the collar showing all round. */
function tok(i, colour, name, sz, cls){
  const s = sz || 34;
  /* 'bare' is the empty chair in the lobby: the piece exists, nobody is
     holding it, and a face on it would be a person who is not there */
  const bare = cls && cls.indexOf('bare') >= 0;
  return '<span class="kr-tok ' + pipClass(i) + (cls ? ' ' + cls : '') +
         '" style="--tz:' + s + 'px;--c:' + colour + '" title="' + esc(name || '') + '">' +
         (bare ? '' : faceSpan(name, s * 0.74)) + '</span>';
}
/* the same token for a seat that may be being played by the phone */
function seatTok(p, sz, cls){
  const auto = K.machineSeat(G, p.i) && p.kind !== 'cpu';
  return tok(p.i, p.colour, p.name, sz, (auto ? 'auto ' : '') + (cls || ''));
}

/* ── HOW BIG A SQUARE ACTUALLY IS ───────────────────────────────────
   The ring is a 9x9 grid of one padding, eight two-point gaps and
   nine tracks, the outer two of which are 1.18 of the inner seven.
   Everything drawn on top of a square in points — a face, a crowd —
   is a fraction of THAT, not of a constant, so it is right at 240
   points and right at 900. */
function cellUnit(){
  return Math.max(14, (base - 14 - 16) / 9.36);
}
/* how many faces are worth drawing on one square, given how big that
   square is ON THE GLASS right now — which is why pinching in shows
   you more of a crowd instead of just bigger versions of the same
   three. Eight people start on Il-Bidu; that is the case this is for.
   A corner is 1.18 wider than a side square and gets one more face
   for it. */
function capFor(cw){
  const eff = cw * vw.k;
  return eff < 46 ? 3 : eff < 74 ? 4 : eff < 110 ? 6 : 8;
}
function tokCap(){ return capFor(cellUnit()) * 10 + capFor(cellUnit() * 1.18); }

function renderCells(){
  const unit = cellUnit();
  lastCap = tokCap();
  for (let i = 0; i < 32; i++){
    const s = K.BOARD[i], c = document.getElementById('kr-c' + i);
    if (!c) continue;
    /* every square has a colour; only the ones that can be BOUGHT get
       the strip. The two decks are told apart by theirs — gossip is the
       house purple, the government is the house gold — which is how you
       learn which card is coming before you land on it. */
    const g = s.g ? K.GROUPS[s.g].c
            : s.t === 'rail' ? '#B79E70'
            : s.t === 'util' ? '#4FC3F7'
            /* the deck's OWN colour, the one the card itself is drawn
               in, so you can see which one is coming before you land */
            : s.t === 'card' ? ((K.DECKS[s.deck] || {}).c || '#FFC542') : '';
    const banded = s.t === 'prop' || s.t === 'rail' || s.t === 'util';
    const o = G.own[i];
    const own = o >= 0 ? G.players[o] : null;
    /* The square's mark is a SHORT CODE drawn in CSS, not an emoji.
       Emoji are the house style everywhere else in KARTI, but a board
       cell is 44 points and the only thing on it — if a device has no
       colour emoji font (plenty do not) every square becomes an
       identical grey box and the board is destroyed. A code always
       renders, is sharper at this size, and the full name is one tap
       away and printed in the middle of the ring anyway. */
    const priced = (s.t === 'prop' || s.t === 'rail' || s.t === 'util');
    /* the strip, and the concrete standing on it */
    let floors = '';
    if (s.t === 'prop' && G.lvl[i] > 0)
      floors = G.lvl[i] === 5 ? '<i class="kr-fl pent"></i>'
                              : new Array(G.lvl[i]).fill('<i class="kr-fl"></i>').join('');
    let h = pictureFor(s, g) +
            (banded && g ? '<span class="kr-band" style="--g:' + g + '">' + floors + '</span>' : '') +
            (own ? '<span class="kr-own"></span>' : '') +
            '<span class="kr-e">' + esc(s.code) + '</span>' +
            /* SECOND LINE: what it costs, or who has it. A board with
               prices on it is a board you can plan a turn from without
               opening anything; once it is sold the price is history
               and the owner is the useful fact. */
            (priced
              /* UNSOLD: what it costs, so a turn can be planned off the
                 board itself. SOLD: the owner's own silhouette, never
                 their initials — two letters under the square's own
                 three-letter code is a code nobody can read. */
              ? (own ? '<span class="kr-oc ' + pipClass(own.i) +
                       '" style="--c:' + own.colour + '"></span>'
                     : '<span class="kr-p">' + money(s.price) + '</span>')
              : '') +
            (G.mort[i] ? '<span class="kr-lock">M</span>' : '');
    const on = G.players.filter(p => !p.out && p.pos === i);
    c.innerHTML = h;
    c.className = 'kr-cell ' + sideOf(i) +
      (['go','jail','rest','togo'].indexOf(s.t) >= 0 ? ' corner' : '') +
      (s.t === 'card' ? ' chance' : '') + (on.length ? ' busy' : '') +
      (own ? ' mine' : '') + (G.mort[i] ? ' mort' : '') +
      (me().pos === i ? ' here' : '');
    c.style.setProperty('--o', own ? own.colour : 'transparent');
    c.style.setProperty('--g', g || 'transparent');
    c.setAttribute('aria-label', s.n + (on.length
      ? ' — ' + on.map(p => p.name).join(', ') + ' ' + (on.length > 1 ? 'are' : 'is') + ' here' : ''));

    /* ── the crowd, in its own layer over the tile ──────────────
       As many faces as are worth drawing at this zoom, then +N, out
       loud, for the rest — never a silent truncation. Tapping the
       square names every one of them. */
    const T = els.toks && els.toks[i];
    if (!T) continue;
    if (!on.length){ if (T.firstChild) T.innerHTML = ''; continue; }
    const cw = unit * (['go','jail','rest','togo'].indexOf(s.t) >= 0 ? 1.18 : 1);
    const cap = capFor(cw);
    const show = on.length <= cap ? on.length : Math.max(1, cap - 1);
    /* the size is chosen so the cluster WRAPS to a tidy block inside
       the square rather than to whatever flexbox happens to fit: one
       across, two across, then three, at 66 / 50 / 44 / 30 per cent of
       the square. Above four they spill a little onto the felt, which
       is where a real pile of pieces spills to. */
    const tz = Math.round(Math.max(11,
      show <= 1 ? cw * 0.66 : show <= 2 ? cw * 0.46 :
      show <= 4 ? cw * 0.44 : cw * 0.30));
    T.style.setProperty('--tz', tz + 'px');
    T.innerHTML = on.slice(0, show).map(p =>
        seatTok(p, tz, p.i === G.turn && !G.over ? 'now' : '')).join('') +
      (on.length > show ? '<span class="kr-more">+' + (on.length - show) + '</span>' : '');
  }
}

/* a real die face: three by three, pips drawn. A digit on a white
   square is a number; six dots is a die, and it is the same amount of
   markup either way. */
const PIPS = [[], [4], [0,8], [0,4,8], [0,2,6,8], [0,2,4,6,8], [0,2,3,5,6,8]];
function die(n){
  /* AN UNROLLED DIE IS STILL A DIE. Nine empty holes read as a blank
     tile and look like something failed to draw, so before the first
     roll the pips are there and simply not lit. */
  const idle = !(n >= 1 && n <= 6);
  const on = PIPS[idle ? 5 : n];
  let h = '';
  for (let k = 0; k < 9; k++) h += '<i' + (on.indexOf(k) >= 0 ? ' class="on"' : '') + '></i>';
  return '<span class="kr-die' + (idle ? ' idle' : '') + (rolled ? ' roll' : '') +
         '" aria-hidden="true">' + h + '</span>';
}

function renderMid(){
  const p = me();
  const s = K.BOARD[p.pos];
  const d = G.dice;
  let ask = '', warn = false;
  if (G.over) ask = 'That is that.';
  else if (K.tableEmpty(G)) { ask = 'Nobody is here. The game is saved and waiting.'; warn = true; }
  else if (G.phase === 'awaitRoll') ask = p.jail > 0 ? 'Still at counter four.' : 'Roll.';
  else if (G.phase === 'awaitBuy') ask = money(K.BOARD[p.pos].price) + ' — yes or no.';
  else if (G.phase === 'debt') { ask = 'Owes ' + money(G.debt ? G.debt.amt : 0) + ' and has not got it.'; warn = true; }
  else if (G.phase === 'auction') ask = 'Under the hammer.';
  else if (G.phase === 'card') ask = 'A card.';
  else ask = 'Build, deal, or end the turn.';

  /* WHAT IS LEFT IN THE BANK'S YARD. Money the bank cannot run out of;
     concrete it can, and that is the one number that belongs in the
     middle of the table rather than on anybody's own sheet. */
  let fl = 0, pn = 0;
  for (let i = 0; i < 32; i++){
    if (G.lvl[i] === 5) pn++;
    else fl += G.lvl[i] || 0;
  }

  els.mid.innerHTML =
    '<div class="kr-midmark" aria-hidden="true"><b>IL-KIRI</b></div>' +
    '<div class="kr-dice" role="img" aria-label="' +
      (d ? 'Dice ' + d[0] + ' and ' + d[1] : 'The dice are not rolled') + '">' +
      die(d ? d[0] : 0) + die(d ? d[1] : 0) +
    '</div>' +
    '<div class="kr-midn">' + esc(s.n) + '</div>' +
    '<div class="kr-midmt">' + esc(s.mt) + '</div>' +
    '<div class="kr-midask' + (warn ? ' warn' : '') + '">' + esc(ask) + '</div>' +
    '<div class="kr-supply" aria-label="Left in the bank: ' + (K.SUPPLY.floors - fl) +
      ' floors, ' + (K.SUPPLY.penthouses - pn) + ' penthouses">' +
      '<span><i></i>' + (K.SUPPLY.floors - fl) + ' LEFT</span>' +
      '<span><i class="p"></i>' + (K.SUPPLY.penthouses - pn) + ' LEFT</span>' +
    '</div>';
  rolled = false;
}

/* ── the dock panes ───────────────────────────────────────────────── */
function renderPane(){
  screenEl().querySelectorAll('.kr-tab').forEach(b =>
    b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === tab)));
  if (tab === 'square') paneSquare();
  else if (tab === 'deeds') paneDeeds();
  else if (tab === 'table') paneTable();
  else paneLog();
}

function paneSquare(){
  const p = me(), i = p.pos, s = K.BOARD[i];
  els.pane.innerHTML = squareBody(i) +
    '<p class="kr-joke" style="margin-top:8px">' + esc(s.joke) + '</p>';
  wireSquareButtons(els.pane, i);
}

/* ── THE SQUARE, AS THE BOARD DRAWS IT, AT READING SIZE ─────────────
   The sheet and the auction used to head themselves with the square's
   emoji, which on a phone with no colour emoji font is an empty box —
   the exact failure the board itself refuses to risk. So they show a
   little tile instead: same colour strip, same code, same silhouette,
   drawn the same way. You are looking at the thing you tapped. */
function plate(i){
  const s = K.BOARD[i];
  const g = s.g ? K.GROUPS[s.g].c
          : s.t === 'rail' ? '#B79E70'
          : s.t === 'util' ? '#4FC3F7'
          : s.t === 'card' ? ((K.DECKS[s.deck] || {}).c || '#FFC542') : '#FFC542';
  return '<span class="kr-plate' + (s.t === 'card' ? ' chance' : '') +
         (['go','jail','rest','togo'].indexOf(s.t) >= 0 ? ' corner' : '') +
         '" style="--g:' + g + '" aria-hidden="true">' +
         pictureFor(s, g) +
         '<span class="kr-e">' + esc(s.code) + '</span></span>';
}

/* the full picture of one square — reused by the tab and by the sheet */
function squareBody(i){
  const s = K.BOARD[i];
  const o = G.own[i];
  const g = s.g ? K.GROUPS[s.g] : null;
  let h = '<div class="kr-hd">' + esc(g ? g.n.toUpperCase() : s.t === 'rail' ? 'TRANSPORT' :
          s.t === 'util' ? 'SERVICES' : s.t === 'card' ? esc(s.n).toUpperCase() : 'THE BOARD') + '</div>' +
    '<div style="display:flex;align-items:center;gap:9px">' +
      plate(i) +
      '<span style="flex:1;min-width:0"><b style="font-size:14.5px;line-height:1.2;display:block">' + esc(s.n) + '</b>' +
      '<span style="font-size:11px;color:#A093C4;font-style:italic">' + esc(s.mt) + '</span></span>' +
    '</div>';

  /* ── WHO IS ACTUALLY STANDING ON IT ──────────────────────────────
     Eight people start on Il-Bidu and no square that size can show
     eight faces, so the board shows what fits and says +N — and THIS
     is where the +N goes when you tap it: everybody on the square,
     with their own face and their own name, in the sheet that was
     already opening anyway. Nothing is ever silently dropped. */
  const here = G.players.filter(p => !p.out && p.pos === i);
  if (here.length){
    h += '<div class="kr-hd">' + (here.length > 1 ? 'STANDING HERE — ' + here.length : 'STANDING HERE') + '</div>' +
      here.map(p => '<div class="kr-row" style="--g:' + p.colour + '">' +
        '<span class="kr-sw"></span>' + seatTok(p, 30) +
        '<span class="kr-rn">' + esc(p.name) +
        '<span class="kr-rs">' + (p.i === G.turn && !G.over ? 'it is their turn' :
          p.jail > 0 ? 'in the queue' :
          K.machineSeat(G, p.i) && p.kind !== 'cpu' ? 'the phone is playing this seat' :
          p.kind === 'cpu' ? 'the phone' : 'waiting') + '</span></span>' +
        '<span class="kr-rv">' + money(p.cash) + '</span></div>').join('');
  }

  if (o >= 0){
    h += '<div class="kr-row" style="margin-top:8px;--g:' + (G.players[o].colour) + '">' +
      '<span class="kr-sw"></span><span class="kr-rn">' + esc(G.players[o].name) +
      '<span class="kr-rs">' + (G.mort[i] ? 'mortgaged — earns nothing' :
        s.t === 'prop' && K.canDevelop(G, o, i) ? 'holds the whole group' : 'owner') + '</span></span>' +
      '<span class="kr-rv">' + money(K.rentOf(G, i, G.dice ? G.dice[0] + G.dice[1] : 7)) + '</span></div>';
  } else if (s.price){
    h += '<div class="kr-row" style="margin-top:8px"><span class="kr-sw"></span>' +
      '<span class="kr-rn">On the market<span class="kr-rs">nobody has bought it</span></span>' +
      '<span class="kr-rv">' + money(s.price) + '</span></div>';
  }

  if (s.t === 'prop'){
    const lvl = G.lvl[i], full = K.canDevelop(G, o, i);
    const rows = [
      ['Rent',            s.rent[0], o >= 0 && lvl === 0 && !full],
      ['With the group',  s.rent[0] * 2, o >= 0 && lvl === 0 && full],
      ['One floor',       s.rent[1], lvl === 1],
      ['Two floors',      s.rent[2], lvl === 2],
      ['Three floors',    s.rent[3], lvl === 3],
      ['Four floors',     s.rent[4], lvl === 4],
      ['Penthouse',       s.rent[5], lvl === 5],
    ];
    h += '<table class="kr-tbl">' + rows.map(r =>
      '<tr class="' + (r[2] ? 'now' : '') + '"><td>' + esc(r[0]) + '</td><td>' + money(r[1]) + '</td></tr>').join('') +
      '<tr><td style="color:#A093C4">A floor costs</td><td style="color:#A093C4">' + money(g.build) + '</td></tr>' +
      '<tr><td style="color:#A093C4">Mortgage / redeem</td><td style="color:#A093C4">' +
        money(K.mortgageValue(i)) + ' / ' + money(K.unmortgageCost(i)) + '</td></tr>' +
      '</table>';
  } else if (s.t === 'rail'){
    h += '<table class="kr-tbl">' + K.RAIL_RENT.slice(1).map((r, n) => {
      const held = K.RAILS.filter(x => G.own[x] === o && !G.mort[x]).length;
      return '<tr class="' + (o >= 0 && held === n + 1 ? 'now' : '') + '"><td>' + (n + 1) +
        ' of the four</td><td>' + money(r) + '</td></tr>';
    }).join('') + '<tr><td style="color:#A093C4">Mortgage / redeem</td><td style="color:#A093C4">' +
      money(K.mortgageValue(i)) + ' / ' + money(K.unmortgageCost(i)) + '</td></tr></table>';
  } else if (s.t === 'util'){
    const held = K.UTILS.filter(x => G.own[x] === o && !G.mort[x]).length;
    h += '<table class="kr-tbl">' +
      '<tr class="' + (held === 1 ? 'now' : '') + '"><td>One of the two</td><td>4× the dice</td></tr>' +
      '<tr class="' + (held >= 2 ? 'now' : '') + '"><td>Both</td><td>10× the dice</td></tr>' +
      '<tr><td style="color:#A093C4">Mortgage / redeem</td><td style="color:#A093C4">' +
      money(K.mortgageValue(i)) + ' / ' + money(K.unmortgageCost(i)) + '</td></tr></table>';
  } else if (s.t === 'tax'){
    h += '<table class="kr-tbl"><tr class="now"><td>Flat charge</td><td>' + money(s.amount) + '</td></tr>' +
      (s.perBuilding ? '<tr><td>Per floor you own</td><td>' + money(s.perBuilding) + '</td></tr>' : '') + '</table>';
  }

  /* what you can do about it, right now */
  const acts = ownerActions(i);
  if (acts.length) h += '<div class="kr-hd">YOURS TO MANAGE</div><div style="display:flex;gap:5px;flex-wrap:wrap">' +
    acts.map(a => '<button class="kr-mini ' + (a.cls || '') + '" data-act="' + a.k + ':' + i + '"' +
      (a.on ? '' : ' disabled') + '>' + esc(a.n) + '</button>').join('') + '</div>';
  return h;
}

/* WHAT YOU CAN DO WITH A SQUARE, RIGHT NOW.
   The engine builds, sells and mortgages as the seat whose TURN it is
   — it always has — so these buttons only ever appear for the chair
   holding the dice. Online that has to be OUR chair as well, or the
   deeds pane offers you buttons for somebody else's property that the
   door would refuse. */
function ownerActions(i){
  if (!G || G.own[i] !== G.turn || !isMine(G.turn)) return [];
  const p = G.turn, s = K.BOARD[i];
  const out = [];
  if (s.t === 'prop'){
    out.push({ k:'build', n:'Build ' + money(K.buildCost(i)), cls:'ok', on: K.canBuild(G, p, i) });
    out.push({ k:'sell',  n:'Sell a floor', on: K.canSell(G, p, i) });
  }
  if (G.mort[i]) out.push({ k:'redeem', n:'Redeem ' + money(K.unmortgageCost(i)), cls:'ok', on: K.canUnmortgage(G, p, i) });
  else out.push({ k:'mort', n:'Mortgage ' + money(K.mortgageValue(i)), cls:'bad', on: K.canMortgage(G, p, i) });
  return out;
}

function wireSquareButtons(root, fallbackI){
  root.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
    const [k, ns] = b.getAttribute('data-act').split(':');
    const i = Number(ns);
    const t = k === 'build' ? 'build' : k === 'sell' ? 'sell' :
              k === 'mort' ? 'mortgage' : k === 'redeem' ? 'unmortgage' : null;
    if (t) act({ t, i });
    after();
    if (sheet && sheet.kind === 'square') squareSheet(sheet.i);
  });
}

function paneDeeds(){
  /* offline the dock belongs to whoever has the dice; online it
     belongs to YOU, always, whosever turn it is */
  const p = NET ? NET.mySeat : G.turn;
  const mine = K.holdings(G, p);
  if (!mine.length){
    els.pane.innerHTML = '<div class="kr-empty">Not one deed. You are, at present, a tourist.</div>';
    return;
  }
  let h = '';
  const done = {};
  for (const key of Object.keys(K.GROUPS)){
    const set = K.GROUPS[key].props.filter(i => G.own[i] === p);
    if (!set.length) continue;
    const full = K.GROUPS[key].props.every(i => G.own[i] === p);
    h += '<div class="kr-hd">' + esc(K.GROUPS[key].n.toUpperCase()) + ' · ' + set.length + '/' +
         K.GROUPS[key].props.length + (full ? ' — YOURS' : '') + '</div>';
    set.forEach(i => { done[i] = 1; h += deedRow(i); });
  }
  const rest = mine.filter(i => !done[i]);
  if (rest.length){
    h += '<div class="kr-hd">TRANSPORT &amp; SERVICES</div>';
    rest.forEach(i => { h += deedRow(i); });
  }
  const b = K.buildingsOf(G, p);
  h += '<div class="kr-hd">WORTH</div><div class="kr-row"><span class="kr-sw"></span>' +
    '<span class="kr-rn">Everything you have<span class="kr-rs">' + mine.length + ' deed(s), ' +
    b.floors + ' floor(s), ' + b.pent + ' penthouse(s)</span></span>' +
    '<span class="kr-rv">' + money(K.netWorth(G, p)) + '</span></div>';
  els.pane.innerHTML = h;
  els.pane.querySelectorAll('[data-open]').forEach(x =>
    x.onclick = () => squareSheet(Number(x.getAttribute('data-open'))));
}

function deedRow(i){
  const s = K.BOARD[i];
  const g = s.g ? K.GROUPS[s.g].c : (s.t === 'rail' ? '#7F73A0' : '#4FC3F7');
  const lvl = G.lvl[i];
  const note = G.mort[i] ? 'mortgaged' :
    lvl === 5 ? 'penthouse' : lvl > 0 ? lvl + ' floor' + (lvl > 1 ? 's' : '') :
    K.canDevelop(G, G.own[i], i) ? 'full group — double rent' : 'rent ' + money(K.rentOf(G, i, 7));
  return '<button class="kr-row" data-open="' + i + '" style="--g:' + g + '">' +
    '<span class="kr-sw"></span>' +
    '<span class="kr-rn">' + esc(s.n) + '<span class="kr-rs">' + esc(note) + '</span></span>' +
    '<span class="kr-rv">' + money(K.rentOf(G, i, 7)) + '</span></button>';
}

function paneTable(){
  let h = '';
  G.players.forEach(p => {
    const badge = p.out ? 'OUT' : p.kind === 'cpu' ? 'PHONE' : p.auto ? 'AUTOPILOT' : '';
    h += '<div class="kr-row" style="--g:' + p.colour + (p.out ? ';opacity:.45' : '') + '">' +
      '<span class="kr-sw"></span>' +
      tok(p.i, p.colour, p.name, 30) +
      '<span class="kr-rn">' + esc(p.name) + (badge ? ' <span class="kr-auto">' + badge + '</span>' : '') +
      '<span class="kr-rs">' + (p.out ? 'finished' :
        K.holdings(G, p.i).length + ' deed(s) · worth ' + money(K.netWorth(G, p.i)) +
        (p.jail > 0 ? ' · in the queue' : '')) + '</span></span>' +
      '<span class="kr-rv">' + money(p.cash) + '</span></div>';
  });
  const opp = G.players.filter(p => !p.out && p.i !== G.turn);
  /* a deal is proposed by the chair holding the dice, and online that
     chair has to be ours as well */
  if (!G.over && opp.length && G.phase === 'awaitEnd' && !G.offer &&
      isMine(G.turn) && !K.machineSeat(G, G.turn)){
    h += '<div class="kr-hd">DO A DEAL</div>';
    opp.forEach(p => {
      h += '<button class="kr-row" data-trade="' + p.i + '" style="--g:' + p.colour + '">' +
        '<span class="kr-sw"></span><span class="kr-rn">Offer ' + esc(p.name) + ' something' +
        '<span class="kr-rs">deeds, cash, or both</span></span>' +
        '<span class="kr-rv">→</span></button>';
    });
  }
  h += '<div class="kr-hd">THE BANK</div><div class="kr-row"><span class="kr-sw"></span>' +
    '<span class="kr-rn">Concrete left<span class="kr-rs">when it runs out, nobody builds</span></span>' +
    '<span class="kr-rv">' + G.supply.floors + ' floors · ' + G.supply.penthouses + ' pent</span></div>';
  els.pane.innerHTML = h;
  els.pane.querySelectorAll('[data-trade]').forEach(b =>
    b.onclick = () => tradeSheet(Number(b.getAttribute('data-trade'))));
}

function paneLog(){
  const l = G.log.slice(-60).reverse();
  els.pane.innerHTML = l.map(x =>
    '<div class="kr-logl ' + esc(x.k) + '">' + esc(x.t) + '</div>').join('') ||
    '<div class="kr-empty">Nothing has happened yet.</div>';
}

/* ── the action bar ───────────────────────────────────────────────── */
function renderAct(){
  const p = me();
  const machine = K.machineSeat(G, G.turn);
  const asked = askedSeat();
  const B = [];
  const add = (id, label, cls, on) => B.push({ id, label, cls, on: on !== false });

  if (G.over) add('kr-a-done', 'See how it finished', 'go');
  else if (K.tableEmpty(G) && !NET) add('kr-a-claim', 'Take a seat back', 'go');
  /* ONLINE, THE BAR IS ONLY EVER YOURS. Every other chair is somebody
     else's phone, and a button that says Roll on it when it is not
     your roll is a button that lies. The engine would refuse the tap
     anyway; this is so nobody has to find that out. */
  else if (NET && asked >= 0 && !isMine(asked))
    add('kr-a-wait', (G.players[asked] ? G.players[asked].name : 'The table') +
        (K.machineSeat(G, asked) ? ' is thinking…' : ' to answer…'), '', false);
  else if (NET && G.players[NET.mySeat] && G.players[NET.mySeat].auto)
    add('kr-a-claim', 'Take your seat back', 'go');
  else if (machine) add('kr-a-wait', p.name + ' is thinking…', '', false);
  else switch (G.phase){
    case 'awaitRoll':
      if (p.jail > 0){
        add('kr-a-roll', 'Roll for a double', 'go');
        if (p.skips > 0) add('kr-a-skip', 'Skip the queue', 'ok');
        add('kr-a-bail', 'Pay ' + money(K.BAIL), 'buy', p.cash >= K.BAIL);
      } else add('kr-a-roll', 'Roll', 'go');
      break;
    case 'awaitBuy': {
      const s = K.BOARD[p.pos];
      add('kr-a-buy', 'Buy it<small>' + money(s.price) + '</small>', 'buy', p.cash >= s.price);
      add('kr-a-pass', G.auctionOn !== false ? 'Let it go to auction' : 'Leave it', '');
      break;
    }
    case 'card':  add('kr-a-card', 'Read it', 'go'); break;
    case 'debt':
      add('kr-a-raise', 'Raise ' + money(G.debt ? G.debt.amt - p.cash : 0), 'buy');
      add('kr-a-give', 'Give up', 'bad');
      break;
    case 'auction': add('kr-a-auc', 'Bid', 'go'); break;
    default:
      add('kr-a-manage', 'Deeds', '');
      add('kr-a-trade', 'Trade', '', G.players.filter(x => !x.out).length > 1);
      add('kr-a-end', endLabel(), 'go');
  }

  els.act.innerHTML = B.map(b =>
    '<button class="kr-btn ' + (b.cls || '') + '" id="' + b.id + '"' + (b.on ? '' : ' disabled') + '>' +
    b.label + '</button>').join('');

  const on = (id, fn) => { const e = els.act.querySelector('#' + id); if (e) e.onclick = fn; };
  /* NOT ONE sfx() ON THIS BAR. Every button here ends in an engine call and
     the engine announces what it did, so the sound is identical whether a
     finger or the phone pressed it — and it arrives after the delegated
     ui.tap instead of on top of it. */
  on('kr-a-roll',  () => { rolled = true; act({ t:'roll' }); after(); });
  on('kr-a-bail',  () => { act({ t:'bail' }); after(); });
  on('kr-a-skip',  () => { act({ t:'skip' }); after(); });
  on('kr-a-buy',   () => { act({ t:'buy' }); after(); });
  on('kr-a-pass',  () => { act({ t:'decline' }); after(); });
  on('kr-a-card',  () => cardSheet());
  on('kr-a-raise', () => raiseSheet());
  on('kr-a-give',  () => giveUpSheet());
  on('kr-a-auc',   () => auctionSheet());
  on('kr-a-manage',() => { tab = 'deeds'; render(); });
  on('kr-a-trade', () => { tab = 'table'; render(); });
  on('kr-a-end',   () => { act({ t:'end' }); after(); });
  on('kr-a-done',  () => renderOver());
  on('kr-a-claim', () => { const i = NET ? NET.mySeat : seatToClaim(); if (i >= 0) claimSeat(i); });
}

function endLabel(){
  return (G.dice && G.dice[0] === G.dice[1] && G.doubles > 0 && !me().jail)
    ? 'Roll again<small>you had a double</small>' : 'End turn';
}

/* ═══════════════════════════════════════════════════════════════════
   7b. THE ART SLOT
   IL-KIRI ships finished with NO generated images, and it must stay
   that way — the CSS underneath is the design, not a placeholder.

   So art is never written into markup. It is a layer that starts at
   opacity 0 and is only ever revealed by a real `load` event on an
   Image(). A file that does not exist fires `error`, we do nothing at
   all, and the player sees the CSS object they were always going to
   see: no broken-image icon, no empty panel, no layout shift.

   That means art can arrive ONE FILE AT A TIME. Drop
   art/ui/kiri-loc-sliema.jpg in and Sliema gets a picture of itself
   while the other five groups stay CSS. Nothing to rebuild, nothing
   to configure, and no risk that a half-finished GPU run leaves the
   game looking broken.

   The BOARD deliberately loads nothing. Thirty-two images at 44
   points would be thirty-two requests to decorate a map that is
   already legible as colour and code. Art belongs in the sheets,
   where there is room to look at it.
   See docs/KIRI_ART.md for what each id is.
   ═══════════════════════════════════════════════════════════════════ */
/* ONE SENTINEL, THE WAY js/game.js does it.
   Firing twenty-nine requests to find out whether the art pack exists
   would be twenty-nine 404s in the console of every phone that has not
   had the GPU run yet. So we probe exactly one file. If it is not
   there, the game never asks for another and the console stays clean;
   if it is, individual files light up as they load. */
const ART = {};                    /* id -> true known good, false known missing */
let artOn = null;                  /* null unknown · 'probing' · true · false */
let artQ = [];

function probeArt(){
  if (artOn !== null) return;
  artOn = 'probing';
  const i = new Image();
  i.onload  = () => { artOn = true;  const q = artQ; artQ = []; q.forEach(f => f()); };
  i.onerror = () => { artOn = false; artQ = []; };
  i.src = 'art/ui/kiri-hero.jpg';
}

function artWash(host, id, opacity){
  if (!host || !id || artOn === false || ART[id] === false) return;
  /* js/artkit.js landed alongside this build with a shared slot
     registry. If it is present and already knows this id, its path
     wins, so there is one place that decides where a picture lives.
     If it is not, or it has never heard of us, we fall back to the
     filename in docs/KIRI_ART.md. Either way the behaviour is the
     same and neither file has to know about the other. */
  const src = (window.KARTI_ART && window.KARTI_ART.path && window.KARTI_ART.path(id)) ||
              ('art/ui/' + id + '.jpg');
  const paint = () => {
    if (!host.isConnected) return;
    host.style.backgroundImage = 'url(' + src + ')';
    host.style.backgroundSize = 'cover';
    host.style.backgroundPosition = 'center';
    host.style.opacity = String(opacity == null ? 0.3 : opacity);
  };
  const go = () => {
    if (ART[id] === true){ paint(); return; }
    const img = new Image();
    img.onload  = () => { ART[id] = true;  paint(); };
    img.onerror = () => { ART[id] = false; };   /* the CSS underneath IS the design */
    img.src = src;
  };
  if (artOn === true){ go(); return; }
  if (artQ.length < 12) artQ.push(go);
  probeArt();
}

/* which picture belongs to a square, per docs/KIRI_ART.md */
function artForSquare(i){
  const sq = K.BOARD[i];
  if (!sq) return null;
  if (sq.g) return 'kiri-loc-' + sq.g;
  if (sq.t === 'rail') return 'kiri-sq-transport';
  if (sq.t === 'util') return 'kiri-sq-services';
  if (sq.t === 'tax')  return 'kiri-sq-tax';
  if (sq.t === 'go')   return 'kiri-sq-start';
  if (sq.t === 'jail') return 'kiri-sq-queue';
  if (sq.t === 'rest') return 'kiri-sq-pjazza';
  if (sq.t === 'togo') return 'kiri-sq-junction';
  if (sq.t === 'card') return 'kiri-fate-' + sq.deck;
  return null;
}

/* and to a card, keyed by what the card DOES — so a card written next
   month inherits a picture without a new image */
function artForCard(deckKey, cardId){
  const c = (K.DECKS[deckKey].cards || []).find(x => x.id === cardId);
  const k = c && c.a ? c.a.k : '';
  if (k === 'get' || k === 'getEach') return 'kiri-fate-get';
  if (k === 'pay' || k === 'payEach') return 'kiri-fate-pay';
  if (k === 'jail' || k === 'back' || k === 'skip') return 'kiri-fate-queue';
  if (k === 'move' || k === 'step' || k === 'nearest') return 'kiri-fate-move';
  if (k === 'repairs') return 'kiri-fate-repairs';
  return 'kiri-fate-' + deckKey;
}

/* ═══════════════════════════════════════════════════════════════════
   8. SHEETS
   Everything that needs room comes up from the bottom, where a thumb
   already is. One sheet at a time, always dismissable except when the
   game is genuinely waiting on an answer.
   ═══════════════════════════════════════════════════════════════════ */
function openSheet(o){
  sheet = o;
  els.sheet.innerHTML =
    '<div class="kr-grab"></div>' +
    '<div class="kr-sh-h"><h3>' + o.title + '</h3>' +
      (o.dismissable === false ? '' :
       '<button class="kr-ib" id="kr-shx" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>') +
    '</div>' +
    '<div class="kr-sh-b" id="kr-shb">' + o.body + '</div>' +
    (o.foot ? '<div class="kr-sh-f" id="kr-shf">' + o.foot + '</div>' : '');
  els.sheet.classList.add('on');
  els.scrim.classList.add('on');
  const x = els.sheet.querySelector('#kr-shx');
  if (x) x.onclick = closeSheet;
  if (o.wire) o.wire(els.sheet);
}

/* the board screen's closeSheet() also pumps the game loop; the setup
   screen has no game to pump, so it uses this half of it */
function closeSheetOnly(){
  sheet = null;
  if (!els.sheet) return;
  els.sheet.classList.remove('on');
  els.scrim.classList.remove('on');
  els.sheet.innerHTML = '';
}

function closeSheet(){
  sheet = null;
  els.sheet.classList.remove('on');
  els.scrim.classList.remove('on');
  els.sheet.innerHTML = '';
  pump();
}

/* ── one square, in full ──────────────────────────────────────────── */
function squareSheet(i){
  if (!G || !els.sheet) return;
  const s = K.BOARD[i];
  openSheet({
    kind:'square', i,
    title: esc(s.n),
    body: '<div class="kr-art" id="kr-art"></div>' + squareBody(i) +
          '<p class="kr-joke" style="margin:10px 2px 2px">' + esc(s.joke) + '</p>',
    wire: root => {
      wireSquareButtons(root, i);
      artWash(root.querySelector('#kr-art'), artForSquare(i), 0.34);
    },
  });
}

/* ── a card turned over ───────────────────────────────────────────── */
function cardSheet(){
  if (!G || !G.card) return;
  if (!isMine(G.turn)) return;        /* somebody else's card to turn over */
  const D = K.DECKS[G.card.deck];
  openSheet({
    kind:'card', dismissable:false,
    title: esc(D.n),
    body: '<div class="kr-card" style="--c:' + D.c + '" id="kr-cardbox">' +
      '<div class="kr-art" id="kr-art"></div>' +
      '<div class="kr-ce">' + (G.card.deck === 'ghajdut' ? '?' : '!') + '</div>' +
      '<div class="kr-cd">' + esc(D.n.toUpperCase()) + '</div>' +
      '<div class="kr-ct">' + esc(G.card.n) + '</div>' +
      '<div class="kr-cx">' + esc(G.card.txt) + '</div></div>',
    foot: '<button class="kr-btn go" id="kr-ck">Right then</button>',
    wire: root => {
      /* the card already made its noise when it was turned over; what it
         DOES makes the next one, whatever that turns out to be */
      root.querySelector('#kr-ck').onclick = () => { act({ t:'card' }); closeSheet(); after(); };
      artWash(root.querySelector('#kr-art'), artForCard(G.card.deck, G.card.id), 0.30);
    },
  });
}

/* ── raising money ────────────────────────────────────────────────── */
function raiseSheet(){
  if (!G || !G.debt) return;
  if (!isMine(G.debt.who)) return;   /* somebody else's money to find */
  const p = G.debt.who;
  const need = G.debt.amt;
  const have = G.players[p].cash;
  const list = K.liquidationList(G, p);
  const can = have + list.reduce((n, x) => n + x.gain, 0);
  let body =
    '<p class="kr-blurb">Owes <b style="color:#FFC542">' + money(need) + '</b>, has ' + money(have) + '. ' +
    (can >= need ? 'There is enough here, if you are willing to take it apart.'
                 : 'Everything sold and everything mortgaged still comes to ' + money(can) + '. It is over.') + '</p>' +
    '<div class="kr-hd">IN THE ORDER A SENSIBLE PERSON WOULD DO IT</div>';
  if (!list.length) body += '<div class="kr-empty">Nothing left to sell and nothing left to mortgage.</div>';
  list.forEach((x, n) => {
    const s = K.BOARD[x.i];
    const g = s.g ? K.GROUPS[s.g].c : '#7F73A0';
    body += '<button class="kr-row" data-liq="' + n + '" style="--g:' + g + '">' +
      '<span class="kr-sw"></span><span class="kr-rn">' +
      (x.kind === 'sell' ? 'Sell a floor off ' : 'Mortgage ') + esc(s.n) +
      '<span class="kr-rs">' + (x.kind === 'sell' ? 'half what it cost to build' :
        (K.ownsSet(G, p, x.i) ? 'breaks up a group you own' : 'not part of anything')) + '</span></span>' +
      '<span class="kr-rv">+' + money(x.gain) + '</span></button>';
  });
  openSheet({
    kind:'raise', dismissable:false,
    title:'Where is it coming from',
    body,
    foot:'<button class="kr-btn bad" id="kr-give">Give up</button>' +
         '<button class="kr-btn ok" id="kr-paynow"' + (have >= need ? '' : ' disabled') + '>Pay ' + money(need) + '</button>',
    wire: root => {
      root.querySelectorAll('[data-liq]').forEach(b => b.onclick = () => {
        const x = list[Number(b.getAttribute('data-liq'))];
        act({ t: x.kind === 'sell' ? 'sell' : 'mortgage', i: x.i }, p);
        K.save(G); render();
        if (!G.debt){ closeSheet(); after(); } else raiseSheet();
      });
      root.querySelector('#kr-give').onclick = giveUpSheet;
      const pay = root.querySelector('#kr-paynow');
      if (pay) pay.onclick = () => { act({ t:'settle' }, p); closeSheet(); after(); };
    },
  });
}

function giveUpSheet(){
  const p = G.debt ? G.debt.who : G.turn;
  if (!isMine(p)) return;
  const to = G.debt && !G.debt.split && G.debt.to >= 0 ? G.players[G.debt.to] : null;
  openSheet({
    kind:'give',
    title:'Give up?',
    body:'<p class="kr-blurb">Everything ' + esc(G.players[p].name) + ' owns — every deed, every euro, ' +
      'every floor sold back to the bank — goes to ' + (to ? '<b>' + esc(to.name) + '</b>' : 'the bank, and the deeds go back on the market') +
      '. There is no coming back from it.</p>',
    foot:'<button class="kr-btn" id="kr-nogive">Not yet</button>' +
         '<button class="kr-btn bad" id="kr-yesgive">Give up</button>',
    wire: root => {
      root.querySelector('#kr-nogive').onclick = () => { closeSheet(); if (G.debt) raiseSheet(); };
      root.querySelector('#kr-yesgive').onclick = () => { act({ t:'bankrupt' }, p); closeSheet(); after(); };
    },
  });
}

/* ── the auction ──────────────────────────────────────────────────── */
function auctionSheet(){
  if (!G || !G.auction) return;
  const A = G.auction;
  const b = K.auctionBidder(G);
  if (b < 0 || K.machineSeat(G, b)){ pump(); return; }
  if (!isMine(b)) return;            /* somebody else's bid to make */
  const s = K.BOARD[A.pos];
  const P = G.players[b];
  const step = Math.max(10, Math.round((s.price || 100) * 0.08 / 10) * 10);
  const opts = [step, step * 3, step * 8].filter(n => A.bid + n <= P.cash);
  openSheet({
    kind:'auction', dismissable:false,
    title:'Going once…',
    body:'<div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">' +
      plate(A.pos) +
      '<span style="flex:1"><b style="display:block;font-size:14.5px">' + esc(s.n) + '</b>' +
      '<span style="font-size:11px;color:#A093C4">bank price ' + money(s.price) + '</span></span></div>' +
      '<div class="kr-row"><span class="kr-sw"></span><span class="kr-rn">' +
      (A.high >= 0 ? esc(G.players[A.high].name) + ' leads' : 'No bids yet') +
      '<span class="kr-rs">' + esc(P.name) + ' to answer · has ' + money(P.cash) + '</span></span>' +
      '<span class="kr-rv">' + money(A.bid) + '</span></div>' +
      '<div style="display:flex;gap:5px;margin-top:8px">' +
      opts.map(n => '<button class="kr-mini ok" data-bid="' + (A.bid + n) + '" style="flex:1;min-height:46px">+' +
        money(n) + '</button>').join('') + '</div>',
    foot:'<button class="kr-btn bad" id="kr-aout">Out</button>' +
         (opts.length ? '<button class="kr-btn buy" id="kr-abid">Bid ' + money(A.bid + opts[0]) + '</button>' : ''),
    wire: root => {
      const go = n => { act({ t:'bid', n }, b); K.save(G); closeSheet(); after(); };
      root.querySelectorAll('[data-bid]').forEach(x => x.onclick = () => go(Number(x.getAttribute('data-bid'))));
      const bb = root.querySelector('#kr-abid');
      if (bb) bb.onclick = () => go(A.bid + opts[0]);
      root.querySelector('#kr-aout').onclick = () => { act({ t:'pass' }, b); K.save(G); closeSheet(); after(); };
    },
  });
}

/* ── the trade builder ────────────────────────────────────────────── */
function tradeable(p){
  return K.holdings(G, p).filter(i =>
    !(K.BOARD[i].t === 'prop' && K.GROUPS[K.BOARD[i].g].props.some(x => G.lvl[x] > 0)));
}

function tradeSheet(other){
  const meI = G.turn;
  trade = trade && trade.to === other ? trade
    : { from: meI, to: other, propsFrom: [], propsTo: [], cashFrom: 0, cashTo: 0, skipsFrom: 0, skipsTo: 0 };
  paintTrade();
}

function paintTrade(){
  const A = G.players[trade.from], Bp = G.players[trade.to];
  const chip = (i, side) => {
    const s = K.BOARD[i];
    const g = s.g ? K.GROUPS[s.g].c : (s.t === 'rail' ? '#7F73A0' : '#4FC3F7');
    const on = trade[side].indexOf(i) >= 0;
    return '<button class="kr-chip" style="--g:' + g + '" aria-pressed="' + on + '" data-tp="' + side + ':' + i + '">' +
      esc(s.n) + '<small>' + money(s.price) + (G.mort[i] ? ' · mortgaged' : '') + '</small></button>';
  };
  const stepper = (side, cash) =>
    '<div class="kr-step">' +
      '<button class="kr-mini" data-cash="' + side + ':-100">−100</button>' +
      '<button class="kr-mini" data-cash="' + side + ':-10">−10</button>' +
      '<span class="kr-val">' + money(trade[side]) + '</span>' +
      '<button class="kr-mini" data-cash="' + side + ':10">+10</button>' +
      '<button class="kr-mini" data-cash="' + side + ':100">+100</button>' +
    '</div>';

  const bad = K.tradeLegal(G, trade);
  const body =
    '<div class="kr-hd">' + esc(A.name.toUpperCase()) + ' GIVES</div>' +
    '<div class="kr-chips">' + (tradeable(A.i).map(i => chip(i, 'propsFrom')).join('') ||
      '<span class="kr-empty" style="padding:6px">nothing to give</span>') + '</div>' +
    stepper('cashFrom') +
    (A.skips > 0 ? '<button class="kr-mini' + (trade.skipsFrom ? ' ok' : '') + '" id="kr-skf">' +
      (trade.skipsFrom ? '✓ ' : '') + 'a Skip The Queue</button>' : '') +
    '<div class="kr-hd">' + esc(Bp.name.toUpperCase()) + ' GIVES</div>' +
    '<div class="kr-chips">' + (tradeable(Bp.i).map(i => chip(i, 'propsTo')).join('') ||
      '<span class="kr-empty" style="padding:6px">nothing to give</span>') + '</div>' +
    stepper('cashTo') +
    (Bp.skips > 0 ? '<button class="kr-mini' + (trade.skipsTo ? ' ok' : '') + '" id="kr-skt">' +
      (trade.skipsTo ? '✓ ' : '') + 'a Skip The Queue</button>' : '') +
    (bad ? '<p class="kr-blurb" style="color:#FF9AA6;margin-top:9px">' + esc(bad) + '</p>' : '');

  openSheet({
    kind:'trade',
    title:'You ⇄ ' + esc(Bp.name),
    body,
    foot:'<button class="kr-btn" id="kr-tclear">Clear</button>' +
         '<button class="kr-btn go" id="kr-toffer"' + (bad ? ' disabled' : '') + '>Put it to ' + esc(Bp.name) + '</button>',
    wire: root => {
      root.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => {
        const [side, ns] = b.getAttribute('data-tp').split(':');
        const i = Number(ns), at = trade[side].indexOf(i);
        if (at >= 0) trade[side].splice(at, 1); else trade[side].push(i);
        paintTrade();
      });
      root.querySelectorAll('[data-cash]').forEach(b => b.onclick = () => {
        const [side, ns] = b.getAttribute('data-cash').split(':');
        const who = side === 'cashFrom' ? G.players[trade.from] : G.players[trade.to];
        trade[side] = Math.max(0, Math.min(who.cash, trade[side] + Number(ns)));
        paintTrade();
      });
      const sf = root.querySelector('#kr-skf');
      if (sf) sf.onclick = () => { trade.skipsFrom = trade.skipsFrom ? 0 : 1; paintTrade(); };
      const st = root.querySelector('#kr-skt');
      if (st) st.onclick = () => { trade.skipsTo = trade.skipsTo ? 0 : 1; paintTrade(); };
      root.querySelector('#kr-tclear').onclick = () => {
        trade = { from:trade.from, to:trade.to, propsFrom:[], propsTo:[], cashFrom:0, cashTo:0, skipsFrom:0, skipsTo:0 };
        paintTrade();
      };
      const off = root.querySelector('#kr-toffer');
      if (off) off.onclick = () => {
        const o = trade;
        const r = act({ t:'offer', to:o.to, propsFrom:o.propsFrom, propsTo:o.propsTo,
                        cashFrom:o.cashFrom, cashTo:o.cashTo,
                        skipsFrom:o.skipsFrom, skipsTo:o.skipsTo }, o.from);
        if (!r.ok) return;                       /* the sheet stays up, reason said */
        trade = null;
        closeSheet(); after();
        if (G.offer && isMine(G.offer.to) && !K.machineSeat(G, G.offer.to)) offerSheet();
      };
    },
  });
}

/* ── an offer put to you ──────────────────────────────────────────── */
function offerSheet(){
  const o = G.offer;
  if (!o) return;
  if (!isMine(o.to)) return;         /* somebody else's call to make */
  const A = G.players[o.from], Bp = G.players[o.to];
  const line = (list, cash, skips, who) => {
    const bits = (list || []).map(i => K.BOARD[i].n);
    if (cash) bits.push(money(cash));
    if (skips) bits.push('a Skip The Queue');
    return '<div class="kr-row"><span class="kr-sw" style="background:' + who.colour + '"></span>' +
      '<span class="kr-rn">' + esc(who.name) + ' gives<span class="kr-rs">' +
      esc(bits.length ? bits.join(' · ') : 'nothing at all') + '</span></span></div>';
  };
  openSheet({
    kind:'offer', dismissable:false,
    title: esc(A.name) + ' has an offer',
    body: line(o.propsFrom, o.cashFrom, o.skipsFrom, A) + line(o.propsTo, o.cashTo, o.skipsTo, Bp) +
      '<p class="kr-blurb" style="margin-top:9px">' + esc(Bp.name) + ', it is your call. Take your time; ' +
      'everybody is watching you do the sums.</p>',
    foot:'<button class="kr-btn bad" id="kr-ono">No</button>' +
         '<button class="kr-btn ok" id="kr-oyes">Done</button>',
    wire: root => {
      root.querySelector('#kr-oyes').onclick = () => {
        act({ t:'accept' }, o.to);
        closeSheet(); after();
      };
      root.querySelector('#kr-ono').onclick = () => {
        act({ t:'refuse', n:0 }, o.to);   /* and will not be asked the same thing again */
        closeSheet(); after();
      };
    },
  });
}

/* ── the end ──────────────────────────────────────────────────────── */
function renderOver(){
  const el = screenEl();
  if (el.querySelector('.kr-over')) return;
  stopLoop();
  K.clearSave();
  const w = G.over.winner >= 0 ? G.players[G.over.winner] : null;
  const rank = G.players.slice().sort((a, b) =>
    (a.out === b.out ? K.netWorth(G, b.i) - K.netWorth(G, a.i) : (a.out ? 1 : -1)));
  const d = document.createElement('div');
  d.className = 'kr-over';
  d.innerHTML =
    (w ? '<div class="kr-crown">' + tok(w.i, w.colour, w.name, 54) + '</div>' : '') +
    '<h3>' + esc(w ? w.name.toUpperCase() : 'NOBODY') + '</h3>' +
    '<p>' + (G.over.why === 'rounds'
      ? 'The rounds ran out and ' + esc(w.name) + ' was worth the most. ' + money(K.netWorth(G, w.i)) +
        ', most of it in buildings nobody asked for.'
      : 'Everybody else ran out of money. ' + esc(w ? w.name : '') + ' owns the island and will now ' +
        'explain, at length, exactly how it was done.') + '</p>' +
    '<div class="kr-standings">' + rank.map((p, n) =>
      '<div class="kr-row" style="--g:' + p.colour + '"><span class="kr-sw"></span>' +
      tok(p.i, p.colour, p.name, 30) +
      '<span class="kr-rn">' + (n + 1) + '. ' + esc(p.name) +
      '<span class="kr-rs">' + (p.out ? 'went under' : K.holdings(G, p.i).length + ' deed(s)') + '</span></span>' +
      '<span class="kr-rv">' + money(p.out ? 0 : K.netWorth(G, p.i)) + '</span></div>').join('') + '</div>' +
    '<div style="display:flex;gap:6px;width:100%;max-width:330px">' +
      (NET ? '<button class="kr-btn go" id="kr-orooms">Back to the rooms</button>'
           : '<button class="kr-btn" id="kr-ohub">Party games</button>' +
             '<button class="kr-btn go" id="kr-oagain">Again</button>') + '</div>';
  el.appendChild(d);
  /* DID *YOU* WIN? Offline that is "a person, not on autopilot"; online
     it is your chair and nobody else's, however many people were human. */
  const won = NET ? (G.over.winner === NET.mySeat) : !!(w && w.kind === 'human' && !w.auto);
  if (won) buzz('win');             /* the one long buzz, once, and only his */
  cue(won ? 'game.win' : 'game.lose', { gain: 1.00 }, 0);
  const again = d.querySelector('#kr-oagain');
  if (again) again.onclick = () => { d.remove(); setup(); };
  const hub = d.querySelector('#kr-ohub');
  if (hub) hub.onclick = () => { d.remove(); close(); };
  const rooms = d.querySelector('#kr-orooms');
  if (rooms) rooms.onclick = () => {
    const n = NET; d.remove(); dropRoom(n);
  };
  /* P.record is wrapped by progress.js and PAYS (XP + chips) as a side
     effect — that part always worked, online included. What never
     happened was the POT: this screen is not P.ui.result, so mp.js's
     stake ceremony never fired and a for-chips game destroyed the pot.
     Settled here through mp.js's own idempotent door (settled flag +
     id guard), and said on the card. A game with NO winner refunds
     every ante instead — nobody may take a pot nobody won. */
  /* ── THE RECORD BOOK (js/stats.js) — the profile row and the leaderboard.
     ONE call, through party.js's single door, which forwards to stats.js
     itself.

     There used to be a SECOND, direct KARTI_STATS.record() here to attach
     the leaderboard score, on the reasoning that being id-less it would land
     inside progress.js's ten-second (game|result) window and be ignored. It
     is ignored — offline. Online it also set `score`, and stats.js dedupes on
     `id|result|moves|score`, so the score changed the signature and the
     second call booked a WHOLE SECOND MATCH: two plays, two wins and a
     streak of 2 for one game of IL-KIRI. Measured, not guessed.

     The score now rides `extra` through the same door, so there is exactly
     one call and the leaderboard keeps its "richest game". Sent ONLY online,
     where NET.mySeat says which chair is mine; offline the table is a hot
     seat with no single local player to price. */
  if (P && P.record && w){
    const extra = {};
    if (NET && NET.mySeat != null){
      const nw = K.netWorth(G, NET.mySeat);
      if (typeof nw === 'number' && isFinite(nw) && nw > 0) extra.score = Math.floor(nw);
    }
    P.record('kiri', won ? 'w' : 'l', extra);
  }
  if (NET){
    const MPX = window.KARTI_MP;
    if (MPX && MPX.MP && MPX.MP.stakeLive){
      let pot = null;
      try {
        if (!w){ if (MPX.stakeAbort) MPX.stakeAbort(); }
        else if (MPX.stakeSettle) pot = MPX.stakeSettle(won ? 'win' : 'lose');
      } catch (e){}
      if (pot){
        const line = document.createElement('p');
        line.style.cssText = 'font-weight:800;color:' +
          (pot.kind === 'win' ? '#FFC542' : pot.kind === 'draw' ? '#9FE8B5' : '#FF9AA6');
        line.innerHTML = pot.kind === 'win'
          ? '+' + pot.pot + ' chips — the pot: ' + pot.humans + ' antes of ' + pot.ante
          : pot.kind === 'draw'
            ? '+' + pot.ante + ' chips — every ante went back'
            : '&minus;' + pot.ante + ' chips — your ante went to the winner';
        const stand = d.querySelector('.kr-standings');
        if (stand) stand.after(line); else d.appendChild(line);
      }
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   9. THE LOOP
   One place decides what happens next: if the seat in front of us is
   a machine seat (a chosen opponent, or a person who has gone quiet)
   it takes one action, we draw, and we come round again. If it is a
   person, we stop and wait — with the turn clock running.
   ═══════════════════════════════════════════════════════════════════ */
const PACE = { roll: 620, buy: 520, pass: 520, bid: 520, auctionPass: 420, build: 380,
               offer: 700, acceptTrade: 700, declineTrade: 700, card: 900, end: 420 };

/* THE WATCHDOG.
   pump() is called from a dozen places and every one of them is right,
   but "the machine's turn came round and nobody happened to call pump"
   is a class of bug that ends with a frozen board and a player who can
   do nothing at all. So once every two seconds, if a machine seat is
   waiting and there is no move scheduled and no sheet in the way, we
   nudge it. It costs one comparison a second and it makes a permanent
   freeze structurally impossible. */
let dogT = 0;
function startDog(){
  if (dogT) return;
  dogT = setInterval(() => {
    if (!G || G.over || !live || sheet || timer) return;
    if (document.hidden && !NET) return;
    if (!NET && K.tableEmpty(G)) return;
    if (!K.machineSeat(G, G.turn) && !(G.offer && K.machineSeat(G, G.offer.to)) &&
        !(G.phase === 'auction' && G.auction && K.machineSeat(G, K.auctionBidder(G)))) return;
    pump();
  }, 2000);
}

function stopLoop(){
  if (timer) { clearTimeout(timer); timer = 0; }
  if (clockT) { clearInterval(clockT); clockT = 0; }
  if (dogT) { clearInterval(dogT); dogT = 0; }
}

function after(){
  if (!G) return;
  K.save(G);
  render();
  resetClock();
  pump();
}

function pump(){
  if (!G || G.over || !live) return;
  /* A move is already on the way. Do NOT cancel and re-schedule it: pump()
     is called after every repaint, every closed sheet and every incoming
     presence change, and a version of this that reset the timer each time
     could be starved indefinitely by anything that repainted faster than
     the machine's own pace. The only thing allowed to cancel a pending
     move is a person taking the seat back. */
  if (timer) return;
  /* offline a hidden tab means nobody is watching; online it means one
     person is, and eight other people are waiting on this chair */
  if (document.hidden && !NET) return;

  /* a person has to answer something: put the right sheet up and wait.
     ONLINE, only if that person is us — the other chairs are being
     asked on their own phones. */
  if (!sheet){
    if (G.phase === 'card' && !K.machineSeat(G, G.turn) && isMine(G.turn)) { cardSheet(); return; }
    if (G.phase === 'auction' && G.auction){
      const b = K.auctionBidder(G);
      if (b >= 0 && !K.machineSeat(G, b) && isMine(b)) { auctionSheet(); return; }
    }
    if (G.offer && !K.machineSeat(G, G.offer.to) && isMine(G.offer.to)) { offerSheet(); return; }
  }
  if (sheet) return;

  /* nobody at the table at all — stop dead, do not play the game out
     to a winner behind everybody's back. Online there IS somebody at
     the table, on another phone, and stopping would strand them. */
  if (!NET && K.tableEmpty(G)){
    K.save(G);
    return;
  }

  const a = AI.next(G);
  if (!a) return;                              /* waiting on a person */
  /* ONE PHONE PER CHAIR. Offline this phone drives every machine seat;
     online it drives its own chair and, if it is the host, the machines
     — because those are the only chairs the relay will carry a move for
     from this socket. Without this every phone in the room would compute
     the same machine move and send it, and the table would play it
     once per player. */
  const who = AI.seatFor(G, a);
  if (who < 0 || !iDrive(who)) return;
  timer = setTimeout(() => {
    timer = 0;
    if (!G || !live) return;
    if (a.k === 'roll') rolled = true;
    /* no sounds here either — AI.perform goes through the same door a
       person does, and the engine is what makes the noise */
    AI.perform(G, a);
    K.save(G);
    render();
    resetClock();
    pump();
  }, PACE[a.k] || 400);
}

/* ═══════════════════════════════════════════════════════════════════
   10. ABSENCE — the turn clock, and handing the seat back
   ═══════════════════════════════════════════════════════════════════ */
/* WHOSE ANSWER IS THE TABLE ACTUALLY WAITING FOR?
   Usually the seat whose turn it is — but not always. An auction goes
   round every seat, and a trade offer is answered by the person it was
   put to, who may be three seats away. Point the clock at G.turn only
   and a game can sit forever on an unanswered offer, which is exactly
   the stall this whole feature exists to prevent. */
function waitingOn(){
  if (!G || G.over) return -1;
  let seat = -1;
  if (G.offer && !K.machineSeat(G, G.offer.to)) seat = G.offer.to;
  else if (G.phase === 'auction' && G.auction){
    const b = K.auctionBidder(G);
    if (b >= 0 && !K.machineSeat(G, b)) seat = b;
  }
  else if (!K.machineSeat(G, G.turn)) seat = G.turn;
  /* ONLINE THE CLOCK ONLY EVER RUNS ON OUR OWN CHAIR.
     Every phone in the room can see that chair 3 has not moved, and if
     every phone acted on it three phones would each decide chair 3 was
     away — a race with no winner. So each device watches exactly one
     person: the one holding it. If somebody else goes quiet, it is
     THEIR phone that notices and THEIR phone that plays the seat. */
  if (NET && seat !== NET.mySeat) return -1;
  return seat;
}

/* the seat a returning person would want back */
function seatToClaim(){
  if (!G) return -1;
  const w = G.players.find(p => !p.out && p.kind !== 'cpu' && p.auto && p.i === G.turn);
  if (w) return w.i;
  const a = G.players.find(p => !p.out && p.kind !== 'cpu' && p.auto);
  return a ? a.i : -1;
}

function resetClock(){
  if (clockT){ clearInterval(clockT); clockT = 0; }
  if (!G || G.over || !live) return;
  if (!turnClock) return;
  const seat = waitingOn();
  if (seat < 0) return;
  clockLeft = turnClock;
  clockT = setInterval(() => {
    if (!G || G.over || !live || document.hidden) return;
    if (waitingOn() !== seat){ clearInterval(clockT); clockT = 0; resetClock(); return; }
    clockLeft--;
    if (clockLeft <= 20) renderStrip();
    if (clockLeft <= 0){
      clearInterval(clockT); clockT = 0;
      act({ t:'away', why:'clock' }, seat);
      K.save(G);
      /* the sheet that seat was being asked to answer belongs to nobody
         now — take it down so the machine can answer through the engine */
      if (sheet){
        sheet = null;
        els.sheet.classList.remove('on');
        els.scrim.classList.remove('on');
        els.sheet.innerHTML = '';
      }
      render();
      pump();
    }
  }, 1000);
}

/* one tap and the person has their seat back — no rejoin, no restart,
   nothing lost. If it is not their turn they simply resume; if it IS
   their turn the machine's pending move is cancelled before it lands. */
function claimSeat(i){
  if (!G) return false;
  if (NET && i !== NET.mySeat) return false;    /* only ever your own */
  if (timer){ clearTimeout(timer); timer = 0; }
  const changed = act({ t:'back' }, i).ok;
  K.save(G);
  render();
  resetClock();
  pump();
  return changed;
}

function releaseSeat(i, why){
  if (!G) return false;
  if (NET && i !== NET.mySeat) return false;    /* only ever your own */
  const changed = act({ t:'away', why: why || 'away' }, i).ok;
  K.save(G);
  render();
  pump();
  return changed;
}

/* the tab going away is not one player leaving — it is EVERYBODY
   leaving, on a single device. So we save and stop rather than play
   the game out while nobody is looking. */
document.addEventListener('visibilitychange', () => {
  if (!G || !live) return;
  /* OFFLINE a hidden tab is everybody leaving at once, so we stop dead
     rather than play the game out where nobody can see it. ONLINE it is
     one person putting their phone in a pocket while eight other people
     wait — so the loop keeps running (throttled by the browser, which
     is fine) and this phone goes on answering for its own chair. */
  if (document.hidden && !NET){ stopLoop(); stash(); return; }
  if (document.hidden){ stash(); return; }
  render(); resetClock(); pump();
});
window.addEventListener('pagehide', stash);

/* Escape closes whatever is on top, then leaves */
document.addEventListener('keydown', e => {
  if (!live || e.key !== 'Escape') return;
  if (sheet && sheet.dismissable !== false){ closeSheet(); return; }
  stash();
  if (NET) return;             /* leaving a room is a deliberate tap, not a key */
  menu();
});

/* ═══════════════════════════════════════════════════════════════════
   12. THE TRANSPORT HALF
   ───────────────────────────────────────────────────────────────────
   The lobby half of IL-KIRI shipped first and js/mp.js's shared lobby
   was written against it, so a room of this game could always be
   opened, filled, readied and started — and then landed on a game
   with no way to carry a move. This is that way.

   THE FOUR THINGS THAT MAKE IT SAFE, three of which the engine was
   already built for:

   1. NOTHING BUT MOVES CROSSES. The deal is (seed, seat list, round
      limit) and every phone deals it for itself. The relay carries
      {a, n, k[]} — a short name and a handful of bytes — and never a
      board. No client is ever SENT the state, so there is no snapshot
      on the wire to read the next card off.
   2. A PACKET GOES THROUGH THE DOOR A TAP GOES THROUGH. remote() ends
      in K.apply(), the same call every button on this screen ends in,
      so a move out of turn is REFUSED BY NAME and said out loud
      rather than absorbed. Nothing else in this file can change G.
   3. THE SEAT IS THE RELAY'S, NEVER THE SENDER'S. The move on the
      wire carries no seat at all — encMove() does not put one on it —
      and remote() is told which chair it came from by js/mp.js, which
      got it from the Pi. A phone cannot play as somebody else because
      it has nowhere to say that it is.
   4. THE ABSENCE HANDLING IS THE ONE THAT WAS ALREADY THERE. A seat
      that goes quiet is played conservatively by the machine, saved
      after every action with the RNG state in the save, and handed
      back on one tap. Online, the phone that does that is the phone
      that OWNS the chair — see waitingOn() and iDrive(). Presence
      never crosses the wire and is not in the checksum, so two phones
      cannot race to decide that somebody has gone.

   WHAT IS HIDDEN. Most of a board game is public and that is the
   point of the genre — but three things are not, and hooks.view()
   below hands out K.view(G, seat), never the game: it strips the RNG
   state (which is every future roll), the deck order (which is the
   next card) and the contents of a deal that has been put to somebody
   and not yet answered. See §20c of js/kiri.js.
   ═══════════════════════════════════════════════════════════════════ */

/* ── the codec ────────────────────────────────────────────────────
   js/mp.js carries a move as an action name plus a BITMASK of which
   declared fields are present plus a list of BYTES. An IL-KIRI move
   mostly fits that as it stands — a square index, a chair — but two
   do not: a bid is a sum of money, and an offer is two lists of
   deeds, two sums of money and two cards. So they are spread over
   fields HERE, in the game, which is what `lobby.wire` is for and
   what the note over WIRE_FIELDS in js/mp.js asks for.

     i            a square, 0..31 — and the group square on a refusal
     na nb nc     ONE number, big-endian, three bytes: the bid, the
                  reason a deal was turned down, or what the proposer
                  is putting in
     j            the other chair in a deal
     ma mb mc     the second number: what the other side puts in
     pa..pd       the proposer's deeds, as a 32-bit board mask
     qa..qd       the other side's deeds, same
     sa sb        a Skip The Queue from each side

   The board mask is the whole trick: a deed is a square number 0..31
   and there are 32 squares, so ANY set of deeds is exactly four bytes
   and no list ever has to be sent.

   EIGHTEEN, AND NOT NINETEEN, AND THIS IS NOT TASTE.
   The relay bounds every field of a table move, and the field the
   bitmask travels in is bounded at 999,999 (MAX_MOVE_AMT in
   server/karti_server.py). A mask is 2^k - 1 at worst, so twenty
   declared fields can produce 1,048,575 and the Pi REFUSES THE WHOLE
   PACKET — with an error back to the sender only. The sender has
   already applied its own move, so the table silently drifts apart
   and nothing on either phone says so. That is exactly what happened
   with a twenty-one field list, on an offer, and it took two
   browsers and a wire dump to see. Nineteen fields is the ceiling
   (524,287); this is eighteen, and the test asserts the worst-case
   mask of every move name rather than the count. */
const WIRE_FIELDS = ['i', 'na', 'nb', 'nc', 'j', 'ma', 'mb', 'mc',
                     'pa', 'pb', 'pc', 'pd', 'qa', 'qb', 'qc', 'qd', 'sa', 'sb'];

const B3 = 16777215;
function put3(w, k, v){
  v = Math.max(0, Math.min(B3, Math.round(v || 0)));
  w[k[0]] = (v >>> 16) & 255; w[k[1]] = (v >>> 8) & 255; w[k[2]] = v & 255;
}
const get3 = (w, k) => ((w[k[0]] | 0) << 16) + ((w[k[1]] | 0) << 8) + (w[k[2]] | 0);

function putMask(w, k, list){
  let m = 0;
  (list || []).forEach(i => { i = i | 0; if (i >= 0 && i < 32) m |= (1 << i); });
  m = m >>> 0;
  w[k[0]] = (m >>> 24) & 255; w[k[1]] = (m >>> 16) & 255;
  w[k[2]] = (m >>> 8) & 255;  w[k[3]] = m & 255;
}
function getMask(w, k){
  const m = ((((w[k[0]] | 0) << 24) >>> 0) + ((w[k[1]] | 0) << 16) +
             ((w[k[2]] | 0) << 8) + (w[k[3]] | 0)) >>> 0;
  const out = [];
  for (let i = 0; i < 32; i++) if (m & (1 << i)) out.push(i);
  return out;
}

const N1 = ['na', 'nb', 'nc'], N2 = ['ma', 'mb', 'mc'];
const PM = ['pa', 'pb', 'pc', 'pd'], QM = ['qa', 'qb', 'qc', 'qd'];

/* the engine's logged move -> the wire. Never carries a chair. */
function encMove(m){
  if (!m || K.MOVES.indexOf(m.t) < 0) return null;
  const w = { t: m.t };
  switch (m.t){
    case 'build': case 'sell': case 'mortgage': case 'unmortgage':
      w.i = m.i | 0; break;
    case 'bid':
      put3(w, N1, m.n); break;
    case 'refuse':
      put3(w, N1, Math.max(0, Math.min(255, m.n | 0)));
      if (m.i != null) w.i = m.i | 0;
      break;
    case 'offer':
      w.j = m.to | 0;
      put3(w, N1, m.cashFrom); put3(w, N2, m.cashTo);
      putMask(w, PM, m.propsFrom); putMask(w, QM, m.propsTo);
      w.sa = Math.max(0, Math.min(255, m.skipsFrom | 0));
      w.sb = Math.max(0, Math.min(255, m.skipsTo | 0));
      break;
  }
  return w;
}

/* ...and back. Everything in `w` has already been rebuilt field by
   field on the Pi and is a bounded integer before it is looked at, but
   a shape this table cannot make is still refused HERE rather than
   handed to the engine to puzzle over. */
function decMove(w){
  if (!w || typeof w.t !== 'string') return null;
  if (K.MOVES.indexOf(w.t) < 0) return null;
  const sq = n => (n >= 0 && n < 32) ? n : -1;
  switch (w.t){
    case 'build': case 'sell': case 'mortgage': case 'unmortgage': {
      const i = sq(w.i | 0);
      return i < 0 ? null : { t: w.t, i };
    }
    case 'bid': {
      const n = get3(w, N1);
      return n > 0 ? { t: 'bid', n } : null;
    }
    case 'refuse': {
      const n = get3(w, N1);
      if (n > 255) return null;
      const m = { t: 'refuse', n };
      if (w.i !== undefined){ const i = sq(w.i | 0); if (i < 0) return null; m.i = i; }
      return m;
    }
    case 'offer': {
      const to = w.j | 0;
      if (to < 0 || to >= K.MAX_SEATS) return null;
      return { t: 'offer', to,
               cashFrom: get3(w, N1), cashTo: get3(w, N2),
               propsFrom: getMask(w, PM), propsTo: getMask(w, QM),
               skipsFrom: Math.max(0, w.sa | 0), skipsTo: Math.max(0, w.sb | 0) };
    }
    default:
      return { t: w.t };          /* the twelve that carry nothing */
  }
}

/* ── the room's chairs, and ours ──────────────────────────────────
   A room is opened at the game's MAXIMUM so it reads as a table
   filling up, and people sit in it from chair 0 up — but the host puts
   machines in chairs it picked, so the chairs actually playing are not
   necessarily 0..n-1. The relay stamps a move with the ROOM chair; the
   engine seats n players numbered 0..n-1. Two numbering systems, so
   there is a map, built once at start from the list the lobby hands us
   and never guessed at afterwards. */
function onlineStart(cfg){
  cfg = cfg || {};
  const chairs = (cfg.seats || []).filter(Boolean);
  if (chairs.length < K.MIN_SEATS) throw new Error('IL-KIRI: it takes two to charge anybody rent');
  if (chairs.length > K.MAX_SEATS) throw new Error('IL-KIRI: eight is as many as this board seats');

  const toGame = {}, toRoom = [];
  chairs.forEach((s, g) => {
    const room = (typeof s.seat === 'number') ? s.seat : g;
    toGame[room] = g;
    toRoom[g] = room;
  });
  const mine = (toGame[cfg.you] !== undefined) ? toGame[cfg.you] : 0;

  /* THE HOST DRIVES THE MACHINES, and every phone works that out from
     the same two numbers rather than being told. */
  NET = Object.assign({}, cfg.net, {
    mySeat: mine,
    host: (cfg.you === (cfg.host | 0)),
    toGame, toRoom,
    room: (cfg.net && typeof cfg.net.seat === 'number') ? cfg.net.seat : (cfg.you | 0),
    onLeave: cfg.net && cfg.net.onLeave,
  });
  netMsg = { t:'', k:'' };

  /* the seat list is IDENTICAL on every phone — a machine is a machine
     everywhere — because it is what the game is dealt from */
  const list = chairs.map((s, g) => ({
    name: String(s.name || ('Player ' + (g + 1))).slice(0, 14),
    kind: s.kind === 'cpu' ? 'cpu' : 'human',
    level: s.level == null ? 2 : s.level,
    link: g === mine ? 'local' : (s.kind === 'cpu' ? 'cpu' : 'net'),
  }));

  const g = startGame(list, {
    seed: (cfg.seed >>> 0),
    roundLimit: cfg.roundLimit == null ? 30 : cfg.roundLimit,
    clock: cfg.clock == null ? 90 : cfg.clock,
    auction: true,
  });
  if (!g){ NET = null; throw new Error('IL-KIRI: that table would not deal'); }
  netNote('Chair ' + (NET.room + 1) + ' is yours. Everybody has been dealt the same board.', '');
  return K.checksum(G);
}

/* A move from another chair. `seat` is the RELAY's stamp and the packet
   carries no seat of its own, so there is nothing here to spoof. */
function onlineRemote(room, w){
  if (!G || !NET) return { ok:false, why:'no IL-KIRI on the table' };
  const seat = NET.toGame[room];
  if (seat === undefined) return { ok:false, why:'a move from a chair that is not at this table' };
  const mv = decMove(w);
  if (!mv) return { ok:false, why:'a move this table does not know how to make' };
  const r = K.apply(G, seat, mv, 'net');
  if (!r.ok){
    /* REFUSED, NOT ABSORBED. The engine has not touched the state and
       the reason is the engine's own, in words js/mp.js can put in
       front of somebody without a code in it. */
    return { ok:false, why: r.why + ' from ' + (G.players[seat] ? G.players[seat].name : 'that chair') };
  }
  /* a sheet this phone was holding may have just been answered from
     elsewhere — a deal accepted, an auction moved on */
  if (sheet && ((sheet.kind === 'offer' && !G.offer) ||
                (sheet.kind === 'auction' && (!G.auction || !isMine(K.auctionBidder(G)))))){
    sheet = null;
    els.sheet.classList.remove('on');
    els.scrim.classList.remove('on');
    els.sheet.innerHTML = '';
  }
  K.save(G);
  render();
  resetClock();
  if (!G.over) pump();
  return null;
}

function onlineNote(text, tone){ netNote(text, tone); }

function onlineStop(why, tone){
  /* NO BOARD, NO SCREEN TO SAY IT ON. js/mp.js's tableStop() falls back
     to its own "stopped" panel if this throws, which is exactly the
     right place for a room that never reached a table — so throw
     rather than swallow it and leave somebody looking at nothing. */
  if (!G || !live) throw new Error('IL-KIRI: no table to stop');
  stopLoop();
  const el = screenEl();
  if (el.querySelector('.kr-over')) return;
  /* the room is over the moment it is cut off: the overlay covers the
     board, and NET going null means a tap that got underneath it is
     refused rather than posted into a dead socket */
  const n = NET;
  NET = null;
  netMsg = { t:'', k:'' };
  const d = document.createElement('div');
  d.className = 'kr-over';
  d.innerHTML =
    '<div class="kr-plug' + (tone === 'cheat' ? ' no' : '') + '" aria-hidden="true"></div>' +
    '<h3>' + (tone === 'cheat' ? 'NO DEAL' : 'CUT OFF') + '</h3>' +
    '<p>' + esc(why || 'The table stopped.') + '</p>' +
    '<p style="opacity:.8">Nothing was recorded. Nobody loses a garage in Marsa over a ' +
      'dropped connection.</p>' +
    '<div style="display:flex;gap:6px;width:100%;max-width:330px">' +
      '<button class="kr-btn go" id="kr-nback">Back to the rooms</button></div>';
  el.appendChild(d);
  d.querySelector('#kr-nback').onclick = () => { d.remove(); dropRoom(n); };
}

/* ── what js/mp.js drives the wire with ───────────────────────────
   Read off the shelf BEFORE start() is called, so it is a static
   object over module state rather than something start() builds. */
const HOOKS = {
  live:      () => !!(G && NET && !G.over),
  phase:     () => (!G || !NET) ? 'idle' : (G.over ? 'over' : 'play'),
  seed:      () => (G && G.setup) ? G.setup.seed : null,
  turn:      () => (G && NET) ? (NET.toRoom[G.turn] == null ? -1 : NET.toRoom[G.turn]) : -1,
  over:      () => (G ? G.over : null),
  moveCount: () => (G ? G.moves.length : 0),
  /* the agreement check. Two phones that have applied the same moves in
     the same order from the same seed print the same few characters. It
     deliberately cannot see the log, the wall clock or who is on
     autopilot — all three legitimately differ per device. */
  check:     () => (G ? K.checksum(G) : ''),
  /* NEVER the game itself — see the header. This is the one shape a
     client may be handed, and §20c of js/kiri.js says what it strips. */
  view:      room => (G && NET && NET.toGame[room] !== undefined)
                       ? K.view(G, NET.toGame[room]) : null,
  /* every move this phone applied, in the relay's shape, with the ROOM
     chair on it and where it came from. js/mp.js forwards the ones made
     here and drops the ones it delivered itself a moment ago. */
  onMove: fn => K.onMove((rec, info) => {
    if (!G || !NET) return;
    const w = encMove(rec);
    if (!w) return;
    const room = NET.toRoom[info.seat];
    fn(w, { seat: (room == null ? info.seat : room), src: info.src });
  }),
  apply: (room, w) => onlineRemote(room, w),
  /* a seat gone FOR GOOD (deliberate leave, or the relay freeing a
     dropped chair). Before this the game parked on the empty chair
     forever: presence is per-phone ("THEIR phone notices"), but a
     phone that LEFT is not there to notice anything. Flip the seat to
     autopilot with the engine's own 'away' move (presence is local by
     design — it is not in the checksum) and let iDrive()'s gone rule
     above have every remaining phone play it out identically. */
  seatGone: room => {
    if (!G || !NET || G.over) return;
    const g = NET.toGame[room];
    if (g === undefined || !G.players[g] || G.players[g].kind === 'cpu') return;
    NET.gone = NET.gone || {};
    if (NET.gone[g]) return;
    NET.gone[g] = 1;
    try { K.apply(G, g, { t:'away', why:'signal' }, 'net'); } catch (e){}
    K.save(G);
    render();
    resetClock();
    if (!G.over) pump();
  },
};

if (P){
  P.online = P.online || {};
  P.online.kiri = {
    start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
    live: () => HOOKS.live(),
    hooks: HOOKS,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   11. REGISTER WITH THE PARTY HUB, AND THE PUBLIC FACE
   The hub already carries an inert COMING SOON tile under the id
   'kiri'. Registering the same id with status:'live' and an open()
   replaces it and moves it onto the playable shelf — that IS the
   wiring; index.html needs nothing but the two <script> lines.
   ═══════════════════════════════════════════════════════════════════ */
if (P && P.register){
  P.register({
    id:'kiri', order:40, name:'IL-KIRI', mt:'Il-kiri', icon:'coin', status:'live',
    tag:'Buy half of Malta, charge your friends rent for landing on it, and watch a ' +
        'friendship end over a garage in Marsa.',
    open: open,
    /* the hub tile carries the lobby contract too, so js/mp.js can read
       seat range, difficulty names and the rules panel straight off the
       shelf without knowing this file exists */
    seats: { min: K.MIN_SEATS, max: K.MAX_SEATS },
    levels: LEVELS.map(L => ({ level:L.k, name:L.n, note:L.t })),
    rulesHTML: rulesPanel,
    start: (seatList, o) => startGame(seatList, o)
  });
}

window.KARTI_KIRI = {
  open, close,

  /* ═══════════════════════════════════════════════════════════════
     THE LOBBY CONTRACT
     js/mp.js owns the one shared lobby every party game feeds; this
     is everything it needs from IL-KIRI and nothing it does not.
     Read it, do not guess at it — the seat maximum in particular is
     a measured number, not a round one.
     ═══════════════════════════════════════════════════════════════ */
  lobby: {
    id:'kiri',
    name:'IL-KIRI',
    mt:'Il-kiri',

    /* SEATS. Two to eight.
       Two is the floor because you cannot charge yourself rent.
       Eight is the ceiling and it is the TOKENS that set it: a player
       is a 9-point coloured dot on a 44-point board square, and eight
       is as many colours as stay honestly distinguishable at that
       size. The rules scale further — the bank's concrete is shared,
       the money is the bank's and never runs out — so if the tokens
       ever get real artwork with distinct SHAPES instead of distinct
       colours, this number can go up without touching the engine.
       Measured over 120 headless games at every seat count from 2 to
       8: all finished, none stalled, and even at eight seats 95% of
       games still saw somebody complete a colour group. */
    minSeats: K.MIN_SEATS,
    maxSeats: K.MAX_SEATS,

    /* the machine, by name, for the difficulty picker */
    levels: LEVELS.map(L => ({ level:L.k, name:L.n, note:L.t })),
    defaultLevel: 2,

    /* AN AI SEAT IS READY THE INSTANT IT EXISTS.
       It never blocks a start and nobody has to ready it by hand. The
       lobby can call this for any seat rather than special-casing
       machines itself. */
    isReady: seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
    autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,

    /* can this table start, and if not, why not — in words the lobby
       can put straight on screen */
    canStart(seatList){
      const n = (seatList || []).length;
      if (n < K.MIN_SEATS) return { ok:false, why:'It takes two to charge anybody rent.' };
      if (n > K.MAX_SEATS) return { ok:false, why:'Eight is as many as this board can seat.' };
      const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
      if (unready) return { ok:false, why:unready + (unready > 1 ? ' people are' : ' person is') + ' not ready yet.' };
      return { ok:true, why:'' };
    },

    /* the thirty seconds that lets a stranger sit down, as HTML the
       lobby can drop into a panel. Same words as the offline setup. */
    rulesHTML: rulesPanel,
    blurb:'Buy half of Malta, charge your friends rent for landing on it, and watch a friendship ' +
          'end over a garage in Marsa.',

    /* THE WAY IN. seats: [{name, kind:'human'|'cpu', level, link}]
       opts:  {roundLimit, clock, seed, auction}
       Names are taken from the lobby, never asked for here. */
    start: (seats, opts) => startGame(seats, opts),

    /* HOW AN IL-KIRI MOVE FOLDS ONTO THE RELAY'S BYTES.
       js/mp.js's own table of field lists says, in as many words, that
       this belongs in the game — so here it is. Twenty-one names, all
       of them bytes, and encMove()/decMove() in §12 are what fill and
       read them. A move with a field that is not on this line is
       refused by js/mp.js loudly, at the point of sending, rather than
       arriving somewhere else with half of it missing. */
    wire: { fields: WIRE_FIELDS, moves: K.MOVES },

    /* the profile name, so the lobby seats him without a prompt */
    myName,
  },

  /* ── hooks for whoever wires the online transport ──────────────────
     A seat is just a flag. Tell us somebody has gone and the phone
     plays that seat, conservatively and visibly; tell us they are
     back and they resume mid-game with everything intact. None of
     this needs the transport to understand a single rule. */
  seat: {
    setPresent: (i, present, why) => present ? claimSeat(i) : releaseSeat(i, why),
    claim:      i => claimSeat(i),
    release:    (i, why) => releaseSeat(i, why),
    isAuto:     i => !!(G && G.players[i] && G.players[i].auto),
    isMachine:  i => !!(G && K.machineSeat(G, i)),
    tableEmpty: () => !!(G && K.tableEmpty(G)),
    clock:      s => { turnClock = Math.max(0, s | 0); resetClock(); },
    link:       (i, how) => { if (G && G.players[i]) G.players[i].link = how; },
  },
  state:  () => G,
  engine: K,

  /* THE CODEC, OUT LOUD. js/mp.js only ever reads `lobby.wire.fields`,
     but a field list is half a contract — the half that is checkable is
     what encMove/decMove actually DO with it. They are published here so
     a test can round-trip every move name and, more to the point, work
     out the bitmask each one produces and prove it is inside the bound
     the relay enforces. See the note over WIRE_FIELDS. */
  wire: { fields: WIRE_FIELDS, enc: encMove, dec: decMove },
  ai:     AI,
  save:   () => stash(),
  clearSave: () => K.clearSave(),
  hasSave: () => K.hasSave(),
};

/* ── TEST HOOKS ────────────────────────────────────────────────────
   Inert unless the page is opened with ?kiritest, which the live app
   never is. They exist so the harness can put a real position on the
   real board and then TAP it. */
try {
  if (String(location.search).indexOf('kiritest') >= 0){
    window.__KIRI_T = {
      start(opts){
        turnClock = (opts && opts.clock != null) ? opts.clock : 0;
        G = K.newGame(opts || {});
        show(); boardScreen();
        return G;
      },
      resume(){ const s = K.load(); if (!s) return null; G = s; show(); boardScreen(); return G; },
      G: () => G,
      set(fn){ fn(G); K.save(G); render(); return G; },
      pump(){ pump(); },
      go(t){ tab = t; render(); },
      sheet: () => (sheet ? sheet.kind : null),
      pace(ms){ for (const k of Object.keys(PACE)) PACE[k] = ms; },
    };
  }
} catch(e){}

/* ── test hooks — inert unless the page is opened with ?kiritest ─────
   The house shape (see js/erbgha-ui.js), on IL-KIRI's OWN flag — the
   same one __KIRI_T above already answers to, because a game gets one
   flag, not two. __KIRI_T stays exactly as it is; harnesses ask for it
   by name. This one is the whole door: the way in (open/menu/setup),
   the way a turn is actually taken (act, then after() to let the
   machine seats run), the repaint, the live game, the engine and the
   way out. show() injects the stylesheet, so startGame() alone already
   gives a dressed board — call injectCSS() first only if you mean to
   measure something before a screen exists. ─────────────────────────*/
if (/[?&]kiritest\b/.test(location.search || '')){
  window.__KIRI_TEST = {
    open, menu, setup, startAI, goOnline, startGame, boardScreen,
    act, after, pump, render, renderAct, renderCells, renderPane,
    claimSeat, releaseSeat, openSheet, closeSheet,
    get G(){ return G; },
    get NET(){ return NET; },
    get sheet(){ return sheet ? sheet.kind : null; },
    get tab(){ return tab; },
    engine: K, ai: AI, hooks: HOOKS,
    online: (P && P.online) ? P.online.kiri : null,
    onlineStart, leave: close, standDown, leaveRoom, stash,
    injectCSS, show, screenEl, noMotion
  };
}

})();

/* ═══════════════════════════════════════════════════════════════════
   IL-KIRI — THE KIT SHELF (purely cosmetic, always)
   Boards, table felts and dice, declared through KARTI_XP.register()
   and applied as a handful of CSS overrides scoped one id deeper
   (#app #scr-kiri) than the game's own sheet, so equal rules lose and
   nothing about play is touched. The style node is re-appended on
   every change so it always lands after the game's own sheet, and an
   unequipped slot writes nothing at all — stock look, untouched.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* board: the 5-stop 158deg rim gradient + its border, and the 3-stop
   tile face family to match. Never the ::after group tint. */
var BOARDS = {
  'kiri.board.franka': { bg:['#E9DBB8','#DECBA0','#C9B183','#AE9260','#8F7343'],
                         bd:'rgba(92,64,22,.38)',    cell:['#6E5A38','#5A4829','#4B3B20'] },
  'kiri.board.port':   { bg:['#3A5A7E','#2C4767','#20364F','#16263A','#0D1826'],
                         bd:'rgba(140,190,235,.28)', cell:['#24405E','#182E46','#112336'] },
  'kiri.board.inbid':  { bg:['#7E3548','#66293A','#4C1D2C','#35131F','#200A13'],
                         bd:'rgba(255,178,150,.26)', cell:['#4E2130','#381622','#2A0F19'] },
  'kiri.board.nzul':   { bg:['#B57785','#9A5E72','#74445C','#4E2C43','#2E1830'],
                         bd:'rgba(255,210,220,.30)', cell:['#6B3E52','#50293D','#3B1C2E'] },
  /* MALTESE SUMMER */
  'kiri.board.lapsi':  { bg:['#FBF6E6','#E4F0EA','#A9DED6','#4FADB4','#1C6F82'],
                         bd:'rgba(255,255,255,.40)', cell:['#2F8290','#206672','#154C58'] }
};
/* the old 'table' slot — the felt scrim over artkit's cloth — was
   retired when the ONE shared deck arrived: the shared FELT (game
   'karti', js/deck-kit.js) now tints .kr-mid for every card game at
   once, and the four kiri.table.* moods were migrated there. */
/* dice: face gradient + pip gradient. idle/roll only touch opacity
   and animation, so the base face is safe to restate. */
var DICE = {
  'kiri.dice.avorju':  { f:['#FFFCF2','#F1E7D1','#D9CBAE'], p:['#4A3B2A','#160E06'] },
  'kiri.dice.ghadam':  { f:['#FBF6EC','#EFE5D4','#DCCDB4'], p:['#8A2439','#3A0716'] },
  'kiri.dice.zebbug':  { f:['#8A7342','#6E5930','#514021'], p:['#F5EAD0','#C9B98F'] },
  'kiri.dice.bahar':   { f:['#CFEDE4','#A9D9CC','#7FBFB0'], p:['#1E3A5C','#0A1626'] },
  'kiri.dice.indurat': { f:['#3A3038','#241C26','#120C16'], p:['#FFE9A8','#C89020'] },
  /* MALTESE SUMMER */
  'kiri.dice.granita': { f:['#FFFFFF','#E2F2FA','#B8D9EA'], p:['#FF7A9C','#B8102F'] }
};

function sheet(){
  var st = document.getElementById('krx-kit-css');
  if (!st){ st = document.createElement('style'); st.id = 'krx-kit-css'; }
  /* appendChild MOVES an existing node to the end, so this sheet is
     always later than the game's own; the #app prefix out-specifies
     the game's #scr-kiri rules besides. */
  document.head.appendChild(st);
  return st;
}

function apply(){
  var XP = window.KARTI_XP;
  if (!XP) return;
  var P = '#app #scr-kiri ', css = '';
  var b = BOARDS[XP.equipped('board', 'kiri') || ''];
  if (b) css += P + '.kr-board{background:linear-gradient(158deg,' +
      b.bg[0] + ' 0%,' + b.bg[1] + ' 16%,' + b.bg[2] + ' 44%,' +
      b.bg[3] + ' 74%,' + b.bg[4] + ' 100%);border-color:' + b.bd + '}' +
    P + '.kr-cell{background:linear-gradient(180deg,' +
      b.cell[0] + ' 0%,' + b.cell[1] + ' 55%,' + b.cell[2] + ' 100%)}';
  var d = DICE[XP.equipped('dice', 'kiri') || ''];
  if (d) css += P + '.kr-die{background:linear-gradient(158deg,' +
      d.f[0] + ' 0%,' + d.f[1] + ' 52%,' + d.f[2] + ' 100%)}' +
    P + '.kr-die i.on{background:radial-gradient(circle at 34% 30%,' +
      d.p[0] + ',' + d.p[1] + ' 70%)}';
  sheet().textContent = css;
}

/* previews: the board is the rim gradient with the grid suggested by
   two hairlines; a die is one face with three pips painted as
   background circles. */
function boardPv(t){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style',
      'display:block;width:' + s + 'px;height:' + s + 'px;border-radius:10px;' +
      'box-sizing:border-box;border:2px solid ' + t.bd + ';' +
      'background-image:' +
      'linear-gradient(0deg,transparent 48.5%,rgba(255,255,255,.22) 48.5%,' +
        'rgba(255,255,255,.22) 51.5%,transparent 51.5%),' +
      'linear-gradient(90deg,transparent 48.5%,rgba(255,255,255,.22) 48.5%,' +
        'rgba(255,255,255,.22) 51.5%,transparent 51.5%),' +
      'linear-gradient(158deg,' + t.bg[0] + ' 0%,' + t.bg[1] + ' 16%,' +
        t.bg[2] + ' 44%,' + t.bg[3] + ' 74%,' + t.bg[4] + ' 100%)');
    return el;
  };
}
function dicePv(t){
  return function(size){
    var s = size || 62, ds = Math.max(26, Math.round(s * .55)),
        pr = Math.max(2, Math.round(ds * .11)),
        el = document.createElement('span'), die = document.createElement('span');
    el.setAttribute('style', 'display:flex;align-items:center;justify-content:center;' +
      'width:' + s + 'px;height:' + s + 'px');
    function pip(x, y){
      return 'radial-gradient(circle ' + pr + 'px at ' + x + '% ' + y + '%,' +
        t.p[0] + ',' + t.p[1] + ' 72%,transparent 100%)';
    }
    die.setAttribute('style',
      'display:block;width:' + ds + 'px;height:' + ds + 'px;' +
      'border-radius:' + Math.round(ds * .26) + 'px;' +
      'background-image:' + pip(26, 26) + ',' + pip(50, 50) + ',' + pip(74, 74) + ',' +
      'linear-gradient(158deg,' + t.f[0] + ' 0%,' + t.f[1] + ' 52%,' + t.f[2] + ' 100%);' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 2px 4px rgba(0,0,0,.45)');
    el.appendChild(die);
    return el;
  };
}

function boot(tries){
  var XP = window.KARTI_XP;
  if (!XP){ if (tries < 40) setTimeout(function(){ boot(tries + 1); }, 500); return; }
  var KIT = XP.forGame('kiri');
  KIT.register([
    { slot:'board', id:'kiri.board.franka', level:3,  name:'Franka fix-Xemx',
      blurb:'Limestone at noon. The rent is due and so is the glare.', preview:boardPv(BOARDS['kiri.board.franka']) },
    { slot:'board', id:'kiri.board.port',   level:12, name:'Il-Port Billejl',
      blurb:'Harbour water after dark. Somebody still owes mooring fees.', preview:boardPv(BOARDS['kiri.board.port']) },
    { slot:'board', id:'kiri.board.inbid',  level:28, name:'Inbid Aħmar',
      blurb:'Spilled at the signing. The lease held; the tablecloth did not.', preview:boardPv(BOARDS['kiri.board.inbid']) },
    { slot:'board', id:'kiri.board.nzul',   level:46, name:'Nżul ix-Xemx',
      blurb:'Rose dusk over the bastions. Prices only go up from here.', preview:boardPv(BOARDS['kiri.board.nzul']) },
    { slot:'board', id:'kiri.board.lapsi',  level:9,  name:'Għar Lapsi', set:'summer',
      blurb:'White rock, turquoise water, and somebody’s cousin already parked in your spot.', preview:boardPv(BOARDS['kiri.board.lapsi']) },

    { slot:'dice', id:'kiri.dice.avorju',  level:0,  name:'Avorju Klassiku',
      blurb:'The pair the notary keeps in his drawer for serious matters.', preview:dicePv(DICE['kiri.dice.avorju']) },
    { slot:'dice', id:'kiri.dice.ghadam',  level:9,  name:'Għadam u Nbid',
      blurb:'Bone white with wine pips. Both older than your lease.', preview:dicePv(DICE['kiri.dice.ghadam']) },
    { slot:'dice', id:'kiri.dice.zebbug',  level:18, name:'Injam taż-Żebbuġ',
      blurb:'Olive wood. Survived three droughts; will survive your throws.', preview:dicePv(DICE['kiri.dice.zebbug']) },
    { slot:'dice', id:'kiri.dice.bahar',   level:31, name:'Ħġieġ tal-Baħar',
      blurb:'Sea glass, smoothed by tides and disappointed landlords.', preview:dicePv(DICE['kiri.dice.bahar']) },
    { slot:'dice', id:'kiri.dice.indurat', level:49, name:'Iswed Indurat',
      blurb:'Black and gold. Rolled once by a marquis, allegedly.', preview:dicePv(DICE['kiri.dice.indurat']) },
    { slot:'dice', id:'kiri.dice.granita', level:4,  name:'Granita', set:'summer',
      blurb:'Crushed ice with syrup pips. Roll before the pair turns into a drink.', preview:dicePv(DICE['kiri.dice.granita']) }
  ]);
  KIT.onChange(apply);
  apply();
}
boot(0);

})();
