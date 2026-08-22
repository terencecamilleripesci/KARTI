/* ═══════════════════════════════════════════════════════════════════
   KARTI — tombla-ui.js
   TOMBLA — the screen.

   js/tombla.js owns every rule. This file owns every pixel, and it has
   one job: make the KARTELLA the best-looking, most legible object in
   the app.

   NO GENERATED ART, ANYWHERE, ON PURPOSE.
   This is the one game in KARTI where the numbers ARE the graphics. A
   cartella drawn in CSS reads at arm's length in a noisy room, redraws
   in a frame, survives a dark kitchen and a cracked screen, and costs
   zero bytes on a phone. A photograph of one would do none of that.
   Chess and dama generate nothing for the same reason. Tombla needs
   no art pack and will never ask for one.

   HOUSE RULES THIS FILE OBEYS
     · the stylesheet is injected at runtime from here, the way
       js/mp.js and js/party.js do it. index.html and css/ are not ours.
     · we borrow js/party.js's screen and frame, so Escape, the back
       arrow and the "another screen took over" MutationObserver all
       keep working without being written twice.
     · NOTHING SCROLLS except the two panels that are allowed to: the
       setup sheet and the master board. The table itself never does,
       ever, on any phone.
     · no unicode pictographs. Every mark is a number, a drawn disc, or
       the app's own SVG sprite.
     · persistence is karti_tombla_v1 (owned by js/tombla.js) and
       nothing else.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const T = window.KARTI_TOMBLA;
if (!K || !P || !T) return;

const esc = K.esc || (s => String(s == null ? '' : s));
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');
const ilb = (n, s) => (window.ILB ? window.ILB(n, s) : s);
const sfx = (id, o) => { try { if (window.KARTI_SFX) window.KARTI_SFX.play(id, o); } catch(e){} };

/* ═══════════════════════════════════════════════════════════════════
   WHEN THE SOUNDS LAND
   ───────────────────────────────────────────────────────────────────
   Tombla is the only screen in KARTI with a VOICE on it, and a voice
   is the one thing that cannot share a moment with anything else: two
   sounds at once is a texture, a sound over a word is a word you did
   not hear. Every one of these numbers is the MEASURED BODY of a file
   — where its energy actually is, not how long the file is. That
   distinction is the whole of this block, because scripts/trim_sfx.py
   trims each cue to a target and leaves the reverb tail on, so the
   duration on the sheet is much longer than the sound:

     file                 duration   audible body (RMS to -35 dB)
     tombla-call.mp3       0.601 s     0.30 s   the token out of the bag
     tombla-near.mp3       0.627 s     0.30 s   the room going quiet
     tombla-shout.mp3      1.776 s     0.45 s   the verdict
     duel-win.mp3          2.247 s     0.90 s   the fanfare
     audio/call/call-NN     0.63-1.88 s          the spoken number
     audio/call/shout-*     0.57-0.91 s          the spoken prize

   Timed off the FILE lengths the sequence would have three seconds of
   dead air in it. Timed off nothing at all — which is what it was —
   the voice starts inside the bag rattle and the fanfare starts inside
   the shout. Both were measured; these are the gaps that came out. */

/* THE CALL. The token comes out of the bag, and THEN the number is
   said. The bag is 300ms of sound, so the voice waits 340 and the two
   are one cue instead of two racing. Even at the quickest speed the
   gap between calls is 2600ms and the longest number is 1880, so a
   delayed voice still finishes with room; and if it does not, a new
   call cuts it off the way it always did. */
const SAY_AFTER_BAG = 340;
/* THE VERDICT, which is the best moment in the game and had three
   sounds stacked on one instant. It is a sequence now:
     +0      tombla.shout   the sting          body 450ms
     +480    the voice      "VERS" / "FATTA"   body ~450ms
     +1000   duel.win/lose  only for the fatta body 900ms
   and the fanfare's body then ends at +1900, which is the exact
   moment the read-back box comes down and the result screen goes up. */
const SAY_AFTER_STING = 480;
const FANFARE_AFTER_SAY = 1000;
/* one of OUR sprite's glyphs, drawn the way ICO() draws the app's */
const mark = (id, label) =>
  '<svg class="ico" viewBox="0 0 24 24" ' +
  (label ? 'role="img" aria-label="' + esc(label) + '"' : 'aria-hidden="true"') +
  ' focusable="false"><use href="#' + id + '"></use></svg>';

/* ═══════════════════════════════════════════════════════════════════
   THE MARK ON THE SHELF
   party.js draws a tile's mark by dropping <use href="#id"> into a
   24x24 box and painting it flat gold with no stroke, so this is a
   pure fill on a 24 grid, told apart by its SILHOUETTE: a kartella
   with counters on it. Nothing else on the shelf is a landscape
   rectangle, so it reads at thirty pixels.
   ═══════════════════════════════════════════════════════════════════ */
const SPRITE =
  '<symbol id="tb-mark" viewBox="0 0 24 24">' +
    '<path fill-rule="evenodd" d="M2.2 4.6h19.6c.66 0 1.2.54 1.2 1.2v12.4c0 .66-.54 1.2-1.2 1.2' +
      'H2.2c-.66 0-1.2-.54-1.2-1.2V5.8c0-.66.54-1.2 1.2-1.2Zm.8 2.2v10.4h18V6.8Z"/>' +
    '<circle cx="5.7"  cy="9.7"  r="1.5"/>' +
    '<circle cx="12"   cy="9.7"  r="1.5"/>' +
    '<circle cx="18.3" cy="9.7"  r="1.5"/>' +
    '<circle cx="8.85" cy="14.4" r="1.5"/>' +
    '<circle cx="15.15" cy="14.4" r="1.5"/>' +
  '</symbol>' +
  /* the app's sprite has no pause glyph, and 'flag' means RESIGN
     everywhere else in KARTI — putting it on the stop button would have
     told sixteen people the host had given up. */
  '<symbol id="tb-hold" viewBox="0 0 24 24">' +
    '<rect x="6" y="4.5" width="4.2" height="15" rx="1.4"/>' +
    '<rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4"/>' +
  '</symbol>' +
  '<symbol id="tb-go" viewBox="0 0 24 24">' +
    '<path d="M7 4.6 19.4 12 7 19.4Z"/>' +
  '</symbol>';

function injectSprite(){
  if (document.getElementById('tb-sprite')) return;
  const holder = document.createElement('div');
  holder.id = 'tb-sprite';
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  holder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><defs>' + SPRITE + '</defs></svg>';
  document.body.appendChild(holder);
}

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET
   Injected once, and every rule is scoped to #scr-party so it cannot
   reach into css/ or into the shell. party.js's own runtime sheet is
   loaded first (we call P.ui.css() before this) and we only ever ADD.

   THE CARD IS THE WHOLE INTERFACE, so it gets the whole budget:
     · warm printed-paper cream, a red rule round it, square corners
       inside and rounded outside — a printed kartella, not a table
     · numbers in the display face at 21px, near-black on cream. That
       is bigger than anything else in the app and it is the point.
     · blanks are not empty: they are a flat oatmeal panel, so the eye
       reads the SHAPE of the row and finds a number by position
     · a marked number is a TERRACOTTA DISC with the number knocked
       out of it in cream. It still reads — you must be able to check
       your own row at a glance — but from a metre away the card is
       just a pattern of red dots, which is exactly what a real one
       looks like with the counters on.
   ═══════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════
   THE ANUNZJATUR'S MODULE, IF NOBODY ELSE HAS LOADED IT
   ───────────────────────────────────────────────────────────────────
   js/tombla-caller.js is in index.html's loader list and in sw.js's
   CORE, which is where it belongs. This is the net under that: if the
   tag is ever dropped, or a build ships without it, the first thing
   that opens a tombla fetches it — once, and only if the global is not
   already there.

   IT IS CALLED FROM HERE AND NOT AT LOAD TIME. index.html loads the
   modules in a chain, and this file is earlier in that chain than the
   caller is — so a check made while this file is executing always says
   "missing", injects, and the app ends up running the module twice.
   By the time anybody has opened the tombla screen the chain is long
   finished, and the answer is the true one.

   It cannot fail loudly. A 404 leaves window.KARTI_CALLER undefined,
   every call site is `window.KARTI_CALLER && ...`, and TOMBLA is
   exactly as silent as it was before any of this existed. Rule 1 of
   docs/TOMBLA_CALLER.md §9.
   ═══════════════════════════════════════════════════════════════════ */
function ensureCaller(){
  if (window.KARTI_CALLER) return;
  if (document.querySelector('script[src*="tombla-caller.js"]')) return;
  try {
    const s = document.createElement('script');
    s.id = 'tb-caller-js';
    s.src = 'js/tombla-caller.js';
    s.async = false;
    s.onerror = () => {};
    document.head.appendChild(s);
  } catch(e){}
}

function injectCSS(){
  try { P.ui.css(); } catch(e){}
  injectSprite();
  ensureCaller();
  if (document.getElementById('tb-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'tb-runtime-css';
  st.textContent =

  /* ── the palette, in one place ── */
  '#scr-party .tb{--paper:#F6E9CC;--paper2:#EBDBB6;--blank:#DCC79C;' +
    '--ink:#2A1B0C;--rule:#A8321E;--rule2:#7B2415;' +
    '--bean:#C1361F;--bean2:#8E2412;--beanTx:#FFF3DC;' +
    '--ball:#FFF6E2;--live:#3DDC84;--warn:#FF5468}' +

  /* ══ THE ĠOG TAKES THE WHOLE PANE ══
     index.html gives every .screen twelve pixels down each side, and at
     760px and wider it stops being a phone screen at all and becomes a
     720-wide reading column in the middle of the glass. That column is
     correct for a page of text and it is wrong for a ġog: a phone turned
     sideways is 894 wide and the sheet was being drawn into 720 of them,
     with 87 pixels of nothing down each edge. A hundred and seventy-four
     pixels is SIX PIXELS OFF EVERY COLUMN OF EVERY CARTELLA — the single
     biggest thing on this screen that was not a number.

     So while a ġog is on the table the screen keeps the SAFE AREAS and
     nothing else. Four pixels are left down the sides in portrait, and
     three sideways, because a phone with rounded corners will shave a
     card that is flush to the glass. The class is put on by board() and
     taken off by leave(), so it can never leak onto the hub or another
     game. */
  '#scr-party.tb-edge{padding:calc(var(--sat) + 4px) calc(var(--sar) + 4px) ' +
    'calc(var(--sab) + 4px) calc(var(--sal) + 4px)}' +

  /* ── the stack that fills pt-host ── */
  /* space-between, not flex-start: whatever slack a tall phone leaves
     over becomes generous air BETWEEN the six blocks rather than one
     two-hundred-pixel hole under the card. Every block keeps its own
     natural height and the composition holds at 894, at 760 and at
     660. */
  '#scr-party .tb{width:100%;height:100%;display:flex;flex-direction:column;' +
    'gap:8px;min-height:0;justify-content:space-between}' +

  /* ══ THE ANUNZJATUR ══ */
  '#scr-party .tb-call{flex:0 0 auto;display:grid;grid-template-columns:auto 1fr;' +
    'gap:11px;align-items:center;padding:9px 11px;border-radius:15px;' +
    'background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.03));' +
    'border:1px solid var(--line)}' +
  /* the token out of the bag. A drawn sphere: radial highlight, warm
     rim, hard inner ring — a wooden tombola number, not a UI chip. */
  '#scr-party .tb-ball{width:92px;height:92px;border-radius:50%;display:grid;' +
    'place-items:center;position:relative;flex:0 0 auto;' +
    'background:radial-gradient(circle at 34% 26%,#FFFDF4,#F0DFB8 52%,#C9AE79);' +
    'box-shadow:inset 0 -5px 9px rgba(120,80,30,.28),inset 0 0 0 3px rgba(255,255,255,.5),' +
    '0 5px 14px rgba(0,0,0,.5)}' +
  '#scr-party .tb-ball b{font-family:var(--disp);font-weight:900;font-size:38px;line-height:1;' +
    'color:#3A2408;letter-spacing:-.01em}' +
  '#scr-party .tb-ball.pop{animation:tbPop .42s var(--ease) both}' +
  '@keyframes tbPop{0%{transform:scale(.72);opacity:0}' +
    '58%{transform:scale(1.07);opacity:1}100%{transform:scale(1)}}' +
  '#scr-party .tb-ball.none{background:rgba(255,255,255,.05);box-shadow:none;' +
    'border:2px dashed var(--line2)}' +
  '#scr-party .tb-ball.none b{font-size:12px;color:var(--dim2);letter-spacing:.1em}' +
  /* what the caller says. Three lines and they never move: Maltese
     name, the laqam, then the aside. A line that jumps around as the
     text changes length is unreadable at this speed. */
  '#scr-party .tb-say{min-width:0;display:flex;flex-direction:column;gap:2px;justify-content:center}' +
  '#scr-party .tb-mt{font-family:var(--disp);font-weight:900;font-size:14px;letter-spacing:.05em;' +
    'text-transform:uppercase;color:var(--gold);white-space:nowrap;overflow:hidden;' +
    'text-overflow:ellipsis}' +
  '#scr-party .tb-laqam{font-size:12.5px;line-height:1.4;color:var(--txt);' +
    'display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}' +
  '#scr-party .tb-laqam i{font-style:normal;color:var(--dim2)}' +
  '#scr-party .tb-joke{font-size:11.5px;line-height:1.4;color:var(--dim);' +
    'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:32px}' +

  /* ══ THE RAIL — WHAT HAS COME OUT, RUNNING RIGHT TO LEFT ══
     "Right always the right one then move to left for what come out so
     every can see what come out rather then asking."

     The newest number lands on the RIGHT, gold and a size up, and every
     older one shuffles left and fades. It is the one thing at a real
     tombla that a phone can do better than a person: nobody has to
     shout "what was that one?" over the table, and nobody has to ask
     the caller to say it again.

     THE DOM IS OLDEST-FIRST and the strip is justify-content:flex-end,
     so it hugs the right edge and the overflow falls off the LEFT and
     is clipped — which is exactly the motion he described. Nothing is
     measured, nothing is truncated in JavaScript, and it therefore
     shows precisely as many as fit on whatever phone it is on, in
     either orientation.

     IT COSTS THE KARTELLI NOTHING. Thirty pixels, and it takes them
     from the miniature tabellone below, which said the same thing in
     dots and is switched off wherever the rail is on. Tapping the rail
     opens the full board, which is the job the miniature was doing. */
  '#scr-party .tb-rail{flex:0 0 auto;display:flex;gap:4px;align-items:center;width:100%;' +
    'justify-content:flex-end;height:30px;overflow:hidden;padding:0;border:0;' +
    'background:none;-webkit-tap-highlight-color:transparent}' +
  '#scr-party .tb-rail span{flex:0 0 auto;min-width:30px;height:26px;padding:0 5px;border-radius:7px;' +
    'display:grid;place-items:center;font:900 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'color:#3A2408;background:linear-gradient(180deg,#EFE0BC,#CFB98A);' +
    'box-shadow:0 2px 0 -1px rgba(0,0,0,.4)}' +
  /* the one that just came out */
  '#scr-party .tb-rail span.now{min-width:38px;height:30px;font-size:16px;' +
    'background:linear-gradient(180deg,#FFD873,#F0A81E);' +
    'box-shadow:0 0 0 2px rgba(255,255,255,.4),0 3px 0 -1px rgba(0,0,0,.45)}' +
  /* ONLY ON A NEW NUMBER, and it lands in place rather than sliding in
     from the right. Two things were wrong with the slide: the strip is
     overflow:hidden and flush to the right edge, so a chip translated
     14px right began its life clipped in half — and the caller bar
     repaints on things that are not calls (a machine seat marking, a
     peek, a pause), so the newest number re-animated several times per
     call and flickered. The `just` class is put on by paintChrome only
     when the number has actually changed. */
  '#scr-party .tb-rail span.now.just{animation:tbSlide .3s var(--ease) both}' +
  '@keyframes tbSlide{0%{transform:scale(.7);opacity:0}' +
    '62%{transform:scale(1.07);opacity:1}100%{transform:scale(1);opacity:1}}' +
  /* older ones fade the further left they get. Done with nth-last-child
     rather than a class per chip, so the fade is a property of POSITION
     and cannot drift out of step with the order. */
  '#scr-party .tb-rail span:nth-last-child(n+5){opacity:.62}' +
  '#scr-party .tb-rail span:nth-last-child(n+9){opacity:.38}' +
  '#scr-party .tb-rail em{font-style:normal;font-size:9.5px;font-weight:900;letter-spacing:.12em;' +
    'text-transform:uppercase;color:var(--dim2);margin-right:auto;white-space:nowrap}' +

  /* ══ THE KARTELLA ══ */
  /* the kartella block takes ALL the slack and centres itself in it. A
     phone with room to spare must not end up with two hundred dead
     pixels under the seats — the card floats in the middle of the
     space instead, which is where the eye already is. */
  /* ── THE ĠOG IS A SHEET, NOT A LIST ──────────────────────────────
     "Row one 3 ticket stacks, row 2 3 ticket stacks, so side by side" —
     his paper is printed two columns of three, and for a while so was
     this. It was two across because the first version stacked all six
     down the page and needed 577 pixels on a phone whose card area was
     361 of them: the last two were not small, they were BELOW THE FOLD
     of a block that scrolls, which is why he counted four kartelli and
     not six. Two across fixed the count and it never was the answer to
     the SIZE — it gave every cartella a 214-pixel box for nine columns,
     which is a 22-pixel square, and 22 pixels is why he then asked for
     "more bigger please so easy clicable".

     Neither shape is hard-coded now. fitCards() costs one across, two
     across and three across in the box it actually measured and keeps
     the one with the biggest short side; on a tall phone that is ONE
     ACROSS AND SIX DOWN, which fits because the height is measured
     rather than assumed, and sideways it is two across and three down.
     See fitCards() for the arithmetic and for the numbers each screen
     lands on. */
  '#scr-party .tb-cards{flex:1 1 auto;display:flex;flex-direction:column;gap:10px;' +
    'justify-content:center;min-height:0;overflow-y:auto;overflow-x:hidden;' +
    '-webkit-overflow-scrolling:touch;overscroll-behavior:contain}' +
  '#scr-party .tb.gog .tb-cards{display:grid;gap:5px;align-content:center;' +
    'grid-template-columns:repeat(var(--tbcols,2),minmax(0,1fr))}' +
  '#scr-party .tb-card{position:relative;padding:6px;border-radius:13px;' +
    'background:linear-gradient(180deg,var(--rule),var(--rule2));' +
    'box-shadow:0 7px 0 -3px rgba(0,0,0,.45),0 12px 26px rgba(0,0,0,.45)}' +
  '#scr-party .tb-card.peek{filter:saturate(.55);opacity:.9}' +
  '#scr-party .tb-grid{display:grid;grid-template-columns:repeat(9,1fr);' +
    'grid-auto-rows:var(--tbh,58px);gap:2px;background:var(--paper2);padding:2px;border-radius:8px}' +
  /* one cell */
  /* ── THE NUMBER IS SIZED OFF BOTH SIDES OF ITS CELL ──────────────
     It used to be sized off the HEIGHT alone, which is correct while a
     cartella is the full width of the phone and forty-three pixels a
     column. Two cartelli across is twenty, and a number sized off a
     thirty-pixel row then draws nineteen pixels of digits into a
     twenty-pixel box: the ninety on your sheet touch their own edges
     and read as a smear. So it takes the SMALLER of what each axis can
     carry. --tbw is written by fitCards() from the cell it measured;
     the 26px ceiling is still there for one big kartella. */
  '#scr-party .tb-c{position:relative;display:grid;place-items:center;padding:0;border:0;' +
    'border-radius:4px;background:var(--paper);color:var(--ink);' +
    'font-family:var(--disp);font-weight:900;line-height:1;letter-spacing:-.02em;' +
    'font-size:min(26px,calc(var(--tbh,58px) * .56),calc(var(--tbw,44px) * .64));' +
    '-webkit-tap-highlight-color:transparent}' +
  /* a blank is not "nothing" — it is what gives a row its shape, and
     finding your number is half a matter of finding the gap it sits
     beside. So it is a flat oatmeal panel with a faint weave: clearly
     quieter than a numbered cell, clearly still part of the card. */
  '#scr-party .tb-c.e{background:var(--blank);box-shadow:inset 0 1px 2px rgba(90,60,20,.22);' +
    'background-image:repeating-linear-gradient(135deg,rgba(120,80,30,.10) 0 3px,transparent 3px 8px)}' +
  /* A MARKED NUMBER IS A COUNTER PUT DOWN ON THE PAPER, not a red
     brick. The paper stays; a terracotta disc lands on top of it and
     the number is knocked out of the disc in cream. From a metre away
     the kartella is a pattern of red dots, which is what a real one
     looks like with the counters on; from thirty centimetres you can
     still read every number you have marked, which is what checking
     your own row needs. */
  '#scr-party .tb-c.on{color:var(--beanTx)}' +
  '#scr-party .tb-c.on::before{content:"";position:absolute;left:50%;top:50%;width:96%;' +
    'aspect-ratio:1;max-width:none;transform:translate(-50%,-50%);border-radius:50%;' +
    'background:radial-gradient(circle at 36% 28%,#E4573C,var(--bean) 58%,var(--bean2));' +
    'box-shadow:inset 0 -3px 7px rgba(0,0,0,.34),inset 0 0 0 2px rgba(255,255,255,.16),' +
    '0 2px 4px rgba(0,0,0,.3);pointer-events:none}' +
  /* the digits ride ON TOP of the counter. They are wrapped in their
     own span for exactly this reason: a ::before on a <button> paints
     over the button's own text, and "the number you marked disappears"
     is the single worst bug this screen could have. */
  '#scr-party .tb-n{position:relative;z-index:1;display:block}' +
  '#scr-party .tb-c.just{animation:tbStamp .3s var(--ease) both}' +
  '@keyframes tbStamp{0%{transform:scale(1.24)}70%{transform:scale(.96)}100%{transform:scale(1)}}' +
  /* the hint ring — OFF unless the player asked for it in the sheet */
  '#scr-party .tb-c.hint::before{content:"";position:absolute;inset:3px;border-radius:5px;' +
    'box-shadow:inset 0 0 0 3px rgba(61,220,132,.85);animation:tbHint 1.1s ease-in-out infinite}' +
  '@keyframes tbHint{0%,100%{opacity:.45}50%{opacity:1}}' +
  '#scr-party .tb-c:disabled{opacity:1}' +
  /* ── NOTHING ON THE TICKET HELPS YOU ────────────────────────────
     There was a gutter down the right of every kartella showing how
     many of that row were down, and a gold ring round a card that was
     one away. Both are gone, and they are gone on purpose: they told
     you where you were, and finding out where you are is the game.
     The kartella now shows exactly what a printed one shows — the
     numbers, and the counters you yourself put on them.
     The two accessibility switches in the setup sheet are the only
     assistance in tombla, they are opt-in, and they are off. */
  /* the kartella whose claim is being read back to the room */
  '#scr-party .tb-card.reading{box-shadow:0 0 0 3px var(--gold),0 7px 0 -3px rgba(0,0,0,.45),' +
    '0 12px 26px rgba(0,0,0,.45)}' +

  /* ══ SIX KARTELLI ON A PHONE ══
     A ġog is the whole screen and then some, so in `.tb.gog` every
     other block gives up what it can: the token shrinks and goes
     inline, the miniature board and the room strip disappear entirely,
     the ladder halves, and js/party.js's turn strip is hidden because
     everything it said now lives in the caller bar. The kartelli take
     all of it. Nothing else on this screen is allowed to cost a
     cartella a pixel — including the two host controls, which live
     inside the button bar that was already there.

     THE RAIL IS THE ONE EXCEPTION AND IT IS NOT AN EXCEPTION: it takes
     the thirty pixels the miniature board gives up in the same breath,
     and it does that block's job better. Net cost to the ġog: nothing. */
  '#scr-party .pt-wrap.tbgog .pt-turn{display:none}' +
  '#scr-party .tb.gog{gap:6px}' +
  /* ── WHAT A CARTELLA SPENDS ON THINGS THAT ARE NOT A NUMBER ───────
     SIX CARTELLI MEANS EVERY PIXEL OF CHROME IS PAID SIX TIMES, and
     across the width it is paid twice on top of that (two cards across).
     Measured on a 440-wide phone, one cartella used to spend 26.4 of its
     205 pixels of width on things that are not a digit:

         card padding (the red rule)   3 + 3
         grid padding                  2 + 2
         EIGHT GUTTERS BETWEEN CELLS   8 x 2 = 16

     The gutters were the whole story: sixteen pixels, eight per cent of
     the cartella, spent on lines. At a device pixel ratio of three a ONE
     pixel gutter is still three real lines on the glass and reads
     perfectly as the rule on a printed card, so the gutter is 1, the grid
     padding is 1 and the red rule is 2. Chrome 26.4 -> 14.4, and every
     one of those twelve pixels goes back into the nine columns. */
  '#scr-party .tb.gog .tb-cards{gap:4px}' +
  '#scr-party .tb.gog .tb-card{padding:2px;border-radius:8px;box-shadow:0 4px 0 -2px rgba(0,0,0,.45),' +
    '0 8px 16px rgba(0,0,0,.4)}' +
  /* the gutter is one pixel now, so it has to be a pixel you can SEE: the
     grid's backing goes a clear step darker than the paper, and the rule
     between two numbers reads as a printed rule instead of a seam. Free
     — it is a colour, not a pixel of layout. */
  '#scr-party .tb.gog .tb-grid{gap:1px;padding:1px;border-radius:6px;background:#C7AE81}' +
  /* ── THE DIGITS, CONDENSED, WHICH IS FREE HEIGHT ─────────────────
     The number is sized off the smaller of what each axis can carry, and
     it used to be true that on a ġog that is ALWAYS the width. It is not
     true any more: a cartella across the full width of the phone is 46
     pixels a column and 28 pixels a row, so the HEIGHT is now what binds
     and the height factor stopped being a spare cap and became the whole
     answer. Left at .56 the new bigger square drew SMALLER digits than
     the old cramped one — 15.1px in a 34x27 cell sideways where the 22x42
     cell it replaced got 17.6 — which is the opposite of what was asked
     for. So it is measured now too, on the same face and the same canvas:

       Exo 2 at weight 900 draws "88" 0.72em above the baseline and 0.01em
       below it, so the INK of a two-digit number is 0.73 of the font size.

     At .72 the digits stand 0.53 of the row, which is a printed cartella
     and leaves a clear margin top and bottom inside the counter that may
     land on them (the counter is 90% of the row). At .56 they stood 0.41
     of it, and eleven pixels of a twenty-eight pixel row were air nobody
     asked for.

     The width factor is unchanged and still the one that was measured: the
     widest pair of digits, "88", is 1.278em wide, and with the -.02em
     tracking this cell already carries it is 1.238em. So a two-digit
     number fits a cell of width W at any size up to .808W, and the old
     .64W was leaving eighteen per cent of the room unused.

     It is taken in two bites. The factor goes to .80 — which draws the
     digits at .99W, edge to edge — and then the span is squeezed to 90%
     of its width, putting the ink back to .89W with four per cent of air
     down each side. Net: the SAME width as a .72 factor would give, and
     digits ELEVEN PER CENT TALLER than that for nothing. A geometric sans
     at 90% reads as a condensed cut, not as a squashed one, and it is the
     cut a printed cartella uses for the same reason.

     ĠOG ONLY. One big kartella is 43 pixels a column, its font is already
     up against the 26px ceiling, and condensing it there would make the
     digits smaller for no reason at all. */
  '#scr-party .tb.gog .tb-c{border-radius:3px;' +
    'font-size:min(26px,calc(var(--tbh,26px) * .72),calc(var(--tbw,20px) * .80))}' +
  '#scr-party .tb.gog .tb-n{transform:scaleX(.9)}' +
  /* ── THE GUTTER IS PART OF THE SQUARE YOU AIMED AT ────────────────
     He marks ninety times a game and a wrong mark now stays until
     somebody shouts, so the failure to hunt is not "too small to hit", it
     is "hit nothing" and "hit the wrong one". A tap that lands on the
     rule between two cells used to reach .tb-grid, match nothing, and do
     absolutely nothing — a silent miss on a screen where every call needs
     a tap. Each numbered square now claims half the gutter on every side,
     so the squares of a cartella TILE: there is no dead line anywhere on
     the sheet and the nearest number always wins. Half, not all, so two
     neighbours never overlap and a boundary tap cannot go to the wrong
     one. Blanks are spans, not buttons, and are left out of this — they
     have no handler and tapping one goes on doing nothing, quietly. */
  '#scr-party .tb.gog button.tb-c::after{content:"";position:absolute;inset:-0.5px}' +
  /* a ġog cell is 41 wide and 26 tall, so a counter sized as a circle
     off the WIDTH overflows the row and the six kartelli start to look
     like they are bleeding into one another. Sized to the box it lands
     in it is a slightly squashed disc — which is what a dried bean
     looks like anyway. */
  /* ...and a ġog cell is no longer reliably taller than it is wide. Full
     width down a portrait phone it is 46 by 28, sideways it is 47 by 32,
     and on a short phone three across it is still 27 by 37. So the
     counter is held off BOTH of the cell's dimensions rather than one:
     whichever axis is the long one, the bean is capped at about one and
     a half times the short one and the rest of that axis stays paper.
     Held off only the width, a 46x28 cell drew a 44x25 pill that ran the
     whole way to its neighbours and the sheet read as stripes. */
  '#scr-party .tb.gog .tb-c.on::before{' +
    'width:min(94%,calc(var(--tbh,26px) * 1.30));' +
    'height:min(90%,calc(var(--tbw,20px) * 1.45));aspect-ratio:auto}' +
  '#scr-party .tb.gog .tb-call{padding:6px 9px;gap:9px}' +
  '#scr-party .tb.gog .tb-ball{width:58px;height:58px}' +
  '#scr-party .tb.gog .tb-ball b{font-size:25px}' +
  '#scr-party .tb.gog .tb-ball.none b{font-size:10px}' +
  '#scr-party .tb.gog .tb-mt{font-size:13px}' +
  '#scr-party .tb.gog .tb-laqam{font-size:11px}' +
  '#scr-party .tb.gog .tb-joke{display:none}' +
  /* the miniature board goes: the rail says the same thing in numbers
     and opens the same panel. The ROOM STRIP stays — it used to be
     hidden here because six cartelli stacked down the page needed every
     pixel, and two across do not. Sixteen people playing for chips want
     to see who is at the table. It is still dropped on a short phone and
     sideways, by the media queries at the foot of this sheet. */
  '#scr-party .tb.gog .tb-mini{display:none}' +
  '#scr-party .tb.gog .tb-seats{grid-template-columns:repeat(4,minmax(0,1fr));gap:3px}' +
  '#scr-party .tb.gog .tb-seat{padding:3px 5px;border-radius:7px;gap:4px}' +
  '#scr-party .tb.gog .tb-seat b{font-size:9px}' +
  '#scr-party .tb.gog .tb-rail{height:26px}' +
  '#scr-party .tb.gog .tb-rail span{height:22px;min-width:27px;font-size:12px}' +
  '#scr-party .tb.gog .tb-rail span.now{height:26px;min-width:34px;font-size:14.5px}' +
  '#scr-party .tb.gog .tb-rung{padding:3px 2px 2px;border-radius:7px}' +
  '#scr-party .tb.gog .tb-rung b{font-size:8px}' +
  '#scr-party .tb.gog .tb-rung i{font-size:8px;margin-top:1px}' +

  /* ══ THE BAG IS A BUTTON ══
     In manual calling the token IS the draw control: you tap the bag
     and a number comes out. It costs no layout at all — it is the
     thing that was already the biggest object on the strip — and it
     is the most obvious tap target on the screen. */
  '#scr-party button.tb-ball{cursor:pointer;-webkit-tap-highlight-color:transparent;' +
    'border:0;padding:0}' +
  '#scr-party button.tb-ball:active{transform:scale(.94)}' +
  '#scr-party .tb-ball.draw{background:radial-gradient(circle at 34% 26%,#FFF6DC,#FFD873 52%,#E0A222);' +
    'box-shadow:inset 0 -5px 9px rgba(140,90,10,.3),inset 0 0 0 3px rgba(255,255,255,.55),' +
    '0 5px 16px rgba(240,168,30,.45);animation:tbArm 1.5s ease-in-out infinite}' +
  '#scr-party .tb-ball.draw b{font-size:13px;letter-spacing:.06em;line-height:1.15;text-align:center}' +
  '#scr-party .tb.gog .tb-ball.draw b{font-size:11px}' +

  /* ══ THE STATUS LINE IN THE CALLER BAR ══
     What js/party.js's turn strip used to say. Facts the anunzjatur
     announces out loud anyway — which call this is, how many are left,
     who is holding the ball — and not one word about your kartella. */
  '#scr-party .tb-stat{display:flex;align-items:center;gap:6px;flex-wrap:wrap;' +
    'font:700 9.5px/1.3 var(--disp);letter-spacing:.1em;text-transform:uppercase;color:var(--dim2)}' +
  '#scr-party .tb-stat b{font-weight:900;color:var(--dim)}' +
  '#scr-party .tb-stat .on{color:var(--gold)}' +
  '#scr-party .tb-stat .hot{color:var(--warn)}' +

  /* ══ THE HOST CONTROLS ══
     Two, and both inside the button bar that party.js's frame already
     draws — so the cluster costs the ġog exactly zero pixels. PAUSE is
     direct because it is wanted in a hurry; everything rare is one tap
     deeper behind MORE. */
  '#scr-party .pt-bar.tb-bar{grid-template-columns:1fr 52px 52px}' +
  '#scr-party .pt-bar.tb-bar.solo{grid-template-columns:1fr 52px}' +
  '#scr-party .pt-bar.tb-bar .btn{min-height:54px}' +
  '#scr-party .pt-bar.tb-bar .btn.sq{padding:0;font-size:0}' +
  '#scr-party .pt-bar.tb-bar .btn.sq .ico{width:21px;height:21px}' +
  '#scr-party .pt-bar.tb-bar .btn.sq.on{background:rgba(255,197,66,.18);' +
    'border-color:rgba(255,197,66,.55);color:var(--gold)}' +

  /* the overflow: a bottom sheet, thumb-high, tap outside to lose it */
  '#scr-party .tb-sheet{position:absolute;inset:0;z-index:26;display:flex;flex-direction:column;' +
    'justify-content:flex-end;padding:14px;background:rgba(8,5,15,.72);' +
    'animation:ptFade .15s var(--ease) both}' +
  '#scr-party .tb-sheetbox{border-radius:20px;padding:8px;max-height:78%;overflow:auto;' +
    '-webkit-overflow-scrolling:touch;' +
    'background:linear-gradient(180deg,var(--panel2),var(--panel));' +
    'border:1px solid var(--line2);box-shadow:0 18px 44px rgba(0,0,0,.65)}' +
  '#scr-party .tb-sheetbox h4{font:900 10px/1 var(--disp);letter-spacing:.14em;' +
    'text-transform:uppercase;color:var(--dim2);padding:10px 12px 8px}' +
  '#scr-party .tb-item{display:flex;align-items:center;gap:12px;width:100%;text-align:left;' +
    'min-height:54px;padding:8px 12px;border-radius:14px;color:var(--txt);background:none;border:0}' +
  '#scr-party .tb-item:active{background:rgba(255,255,255,.07)}' +
  '#scr-party .tb-item .ico{width:20px;height:20px;flex:0 0 auto;color:var(--dim)}' +
  '#scr-party .tb-item b{flex:1;min-width:0;font:900 12.5px/1.2 var(--disp);letter-spacing:.05em;' +
    'text-transform:uppercase}' +
  '#scr-party .tb-item i{font-style:normal;font-size:10.5px;color:var(--dim2);text-align:right;' +
    'max-width:46%}' +
  '#scr-party .tb-item.bad b{color:var(--danger)}' +
  '#scr-party .tb-item.bad .ico{color:var(--danger)}' +
  '#scr-party .tb-item.on{background:rgba(255,197,66,.13)}' +
  '#scr-party .tb-item.on b{color:var(--gold)}' +
  '#scr-party .tb-sheetbox .sep{height:1px;margin:4px 12px;background:var(--line)}' +

  /* ══ THE PAUSED BANNER ══ a stalled caller must never read as a bug */
  '#scr-party .tb-hold{position:absolute;left:0;right:0;top:0;z-index:19;padding:7px 12px;' +
    'text-align:center;font:900 10.5px/1.4 var(--disp);letter-spacing:.12em;' +
    'text-transform:uppercase;color:#2A1B0C;background:linear-gradient(180deg,#FFE9A8,#F0C34E);' +
    'box-shadow:0 4px 14px rgba(0,0,0,.45)}' +

  /* ══ THE CHECK ══
     Somebody shouts, the room goes quiet, and the card is read back
     number by number while everybody waits. This overlay is that. */
  /* ── AND THE ROOM GOES DARK ──────────────────────────────────────
     The gradient alone was drawn over a mostly-dark board with ONE
     kartella on it. Over a full ġog it is six cream rectangles showing
     through the middle of it, and the numbers being read back sit on
     top of ninety other numbers. A near-opaque base goes UNDER the
     gradient: the warm middle is still there, the room still darkens
     from the edges in, and the only thing you can read is the kartella
     being checked. That is the point of the moment — they are playing
     for chips and a prize is being decided. */
  '#scr-party .tb-chk{position:absolute;inset:0;z-index:25;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:14px;padding:24px;pointer-events:none;' +
    'background:radial-gradient(circle at 50% 42%,rgba(255,197,66,.17),rgba(6,4,12,.99) 60%),' +
    'rgba(6,4,12,.93)}' +
  '#scr-party .tb-chk .who{font:900 12px/1.5 var(--disp);letter-spacing:.14em;' +
    'text-transform:uppercase;color:var(--txt);text-align:center;opacity:.85;max-width:300px}' +
  '#scr-party .tb-chk .who b{color:var(--gold)}' +
  /* which of the six, on its own line and in the gold, because with a
     ġog in front of you that is the first thing anybody asks */
  '#scr-party .tb-chk .who i{display:block;font-style:normal;margin-top:5px;font-size:13px;' +
    'letter-spacing:.1em;color:var(--gold)}' +
  '#scr-party .tb-chk .read{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:340px}' +
  '#scr-party .tb-chk .read span{min-width:44px;height:44px;padding:0 7px;border-radius:11px;' +
    'display:grid;place-items:center;font:900 19px/1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'color:rgba(255,255,255,.16);background:rgba(255,255,255,.05);' +
    'border:1px solid var(--line);transition:none}' +
  '#scr-party .tb-chk .read span.lit{color:#3A2408;border-color:transparent;' +
    'background:linear-gradient(180deg,#F3E4C0,#CFB98A);animation:tbLit .22s var(--ease) both}' +
  '#scr-party .tb-chk .read span.ghost{color:#FFF;border-color:transparent;' +
    'background:linear-gradient(180deg,#FF7A88,#C11F32);animation:tbNo .3s var(--ease) both}' +
  '@keyframes tbLit{from{transform:scale(1.3)}to{transform:scale(1)}}' +
  '@keyframes tbNo{0%{transform:scale(1.3) rotate(-4deg)}60%{transform:scale(.97) rotate(3deg)}' +
    '100%{transform:scale(1) rotate(0)}}' +
  '#scr-party .tb-chk .say{min-height:44px;font:900 26px/1.2 var(--disp);letter-spacing:.05em;' +
    'text-align:center;color:var(--gold);padding:0 8px}' +
  /* LE is the verdict, not a footnote. It was set two sizes down from
     the win and read as an apology; a wrong shout should land as hard
     as a right one — that is what makes it funny instead of sad. */
  '#scr-party .tb-chk .say.no{color:#FF8E9C;font-size:30px}' +
  '#scr-party .tb-chk .sub{font-size:13.5px;line-height:1.55;color:var(--txt);text-align:center;' +
    'max-width:310px;min-height:21px;font-weight:600}' +

  /* ══ THE TABELLONE, IN MINIATURE ══
     At a real tombla the big board is on the table and everybody
     glances at it between numbers — how full is the bag, has my column
     been picked over. Thirty across and three down puts all ninety
     under the kartella in forty pixels, in reading order, so the shape
     of what has gone is readable at a glance without opening anything.
     Tap it for the full board. */
  '#scr-party .tb-mini{flex:0 0 auto;display:grid;grid-template-columns:repeat(30,1fr);' +
    'gap:2px;padding:5px 6px;width:100%;border-radius:9px;' +
    'background:rgba(255,255,255,.04);border:1px solid var(--line)}' +
  '#scr-party .tb-mini i{display:block;height:10px;border-radius:2px;' +
    'background:rgba(255,255,255,.10)}' +
  '#scr-party .tb-mini i.o{background:linear-gradient(180deg,#EFE0BC,#CFB98A)}' +
  '#scr-party .tb-mini i.l{background:#FFC542;box-shadow:0 0 0 1px rgba(255,255,255,.55)}' +

  /* ══ THE LADDER ══ */
  '#scr-party .tb-lad{flex:0 0 auto;display:grid;gap:4px}' +
  '#scr-party .tb-lad.n5{grid-template-columns:repeat(5,minmax(0,1fr))}' +
  '#scr-party .tb-lad.n2{grid-template-columns:repeat(2,minmax(0,1fr))}' +
  '#scr-party .tb-rung{padding:5px 3px 4px;border-radius:9px;text-align:center;' +
    'background:rgba(255,255,255,.05);border:1px solid var(--line);min-width:0}' +
  '#scr-party .tb-rung b{display:block;font:900 8.5px/1.1 var(--disp);letter-spacing:.03em;' +
    'text-transform:uppercase;color:var(--dim);white-space:nowrap;overflow:hidden;' +
    'text-overflow:ellipsis}' +
  '#scr-party .tb-rung i{display:block;font-style:normal;font-size:8.5px;line-height:1.3;' +
    'margin-top:2px;color:var(--dim2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  '#scr-party .tb-rung.live{border-color:rgba(255,197,66,.35)}' +
  '#scr-party .tb-rung.live b{color:var(--gold)}' +
  '#scr-party .tb-rung.won{background:rgba(255,197,66,.16);border-color:rgba(255,197,66,.55)}' +
  '#scr-party .tb-rung.won b{color:var(--gold)}' +
  '#scr-party .tb-rung.won i{color:var(--txt)}' +
  '#scr-party .tb-rung.mine{background:rgba(61,220,132,.17);border-color:rgba(61,220,132,.5)}' +
  '#scr-party .tb-rung.mine b,#scr-party .tb-rung.mine i{color:var(--ok)}' +
  '#scr-party .tb-rung.void{opacity:.42}' +
  '#scr-party .tb-rung.void b{text-decoration:line-through}' +

  /* ══ THE SEATS ══ */
  '#scr-party .tb-seats{flex:0 0 auto;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));' +
    'gap:4px}' +
  '#scr-party .tb-seat{display:flex;align-items:center;gap:5px;padding:5px 6px;border-radius:9px;' +
    'background:rgba(255,255,255,.04);border:1px solid var(--line);min-width:0;text-align:left}' +
  '#scr-party .tb-seat b{flex:1;min-width:0;font:700 10px/1.2 var(--disp);letter-spacing:.04em;' +
    'text-transform:uppercase;color:var(--dim);white-space:nowrap;overflow:hidden;' +
    'text-overflow:ellipsis}' +
  '#scr-party .tb-seat em{flex:0 0 auto;font-style:normal;font:900 10px/1 ui-monospace,' +
    'SFMono-Regular,Menlo,monospace;color:var(--dim2)}' +
  '#scr-party .tb-seat .tb-pip{flex:0 0 auto;width:8px;height:8px;border-radius:50%;' +
    'background:var(--dim2)}' +
  '#scr-party .tb-seat.you{background:rgba(61,220,132,.13);border-color:rgba(61,220,132,.42)}' +
  '#scr-party .tb-seat.you b{color:var(--ok)}' +
  '#scr-party .tb-seat.you .tb-pip{background:var(--ok)}' +
  '#scr-party .tb-seat.hasw em{color:var(--gold)}' +
  '#scr-party .tb-seat.hasw .tb-pip{background:var(--gold)}' +
  '#scr-party .tb-seat.peeking{outline:2px solid var(--gold);outline-offset:-2px}' +
  '#scr-party .tb-seat.ready .tb-pip{background:var(--ok)}' +

  /* ══ THE CLAIM BUTTON ══
     NOTE: the bar's own grid is declared ONCE, up in THE HOST CONTROLS,
     as `1fr 52px 52px`. It used to be declared a second time down here
     as `1fr 62px` — two tracks for three buttons — so the MORE button
     wrapped onto a second row and the button bar was silently twice as
     tall as it was drawn to be. Sixty pixels off the kartelli, in every
     orientation, from a rule nobody could see. Do not re-add it. */
  '#scr-party #tb-claim{font-family:var(--disp);font-weight:900;font-size:16px;letter-spacing:.09em;' +
    'text-transform:uppercase;transition:background .16s var(--ease),color .16s var(--ease)}' +
  '#scr-party #tb-claim .tb-sub{display:block;font:700 9px/1.2 var(--disp);letter-spacing:.1em;' +
    'opacity:.72;margin-top:2px}' +
  '#scr-party #tb-claim.armed{background:linear-gradient(180deg,#FFD873,#F0A81E);color:#2A1B0C;' +
    'box-shadow:0 5px 0 -1px #9C6A05,0 8px 20px rgba(240,168,30,.4);' +
    'animation:tbArm .8s ease-in-out infinite}' +
  '@keyframes tbArm{0%,100%{filter:brightness(1)}50%{filter:brightness(1.13)}}' +
  '#scr-party #tb-claim.close{border-color:rgba(255,84,104,.6);color:#FFC0C8;' +
    'background:rgba(255,84,104,.16)}' +
  '#scr-party #tb-claim.idle{color:var(--dim2)}' +

  /* ══ THE MASTER BOARD (it-tabellone) ══ */
  '#scr-party .tb-board{position:absolute;inset:0;z-index:22;display:flex;flex-direction:column;' +
    'padding:14px;background:rgba(8,5,15,.975);animation:ptFade .18s var(--ease) both}' +
  '#scr-party .tb-board h3{font:900 13px/1 var(--disp);letter-spacing:.12em;text-transform:uppercase;' +
    'color:var(--gold);margin-bottom:3px}' +
  '#scr-party .tb-board p{font-size:11.5px;line-height:1.5;color:var(--dim2);margin-bottom:11px}' +
  '#scr-party .tb-bgrid{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;' +
    'display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:3px;align-content:center}' +
  '#scr-party .tb-b{aspect-ratio:1;display:grid;place-items:center;border-radius:6px;' +
    'font:900 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'background:rgba(255,255,255,.045);color:var(--dim2)}' +
  '#scr-party .tb-b.out{background:linear-gradient(180deg,#EFE0BC,#CFB98A);color:#3A2408}' +
  '#scr-party .tb-b.last{background:linear-gradient(180deg,#FFD873,#F0A81E);color:#2A1B0C;' +
    'box-shadow:0 0 0 2px rgba(255,255,255,.5)}' +
  '#scr-party .tb-board .btn{margin-top:12px}' +

  /* ══ THE LOBBY ══ */
  '#scr-party .tb-lob{flex:1;min-height:0;display:flex;flex-direction:column;gap:9px}' +
  '#scr-party .tb-lobhead{flex:0 0 auto;text-align:center;padding:4px 0 2px}' +
  '#scr-party .tb-lobhead h3{font:900 20px/1.1 var(--disp);letter-spacing:.09em;' +
    'text-transform:uppercase;color:var(--gold)}' +
  '#scr-party .tb-lobhead p{font-size:12px;line-height:1.55;color:var(--dim);margin-top:6px}' +
  '#scr-party .tb-lobseats{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;' +
    'display:flex;flex-direction:column;gap:6px}' +
  '#scr-party .tb-lseat{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:13px;' +
    'background:rgba(255,255,255,.04);border:1px solid var(--line)}' +
  '#scr-party .tb-lseat .tb-av{flex:0 0 auto;width:30px;height:30px;border-radius:50%;display:grid;' +
    'place-items:center;font:900 12px/1 var(--disp);color:#2A1B0C;' +
    'background:linear-gradient(180deg,#EFE0BC,#CFB98A)}' +
  '#scr-party .tb-lseat b{flex:1;min-width:0;font:900 13px/1.2 var(--disp);letter-spacing:.05em;' +
    'text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  '#scr-party .tb-lseat .tb-tag{flex:0 0 auto;font:900 9.5px/1 var(--disp);letter-spacing:.11em;' +
    'text-transform:uppercase;padding:5px 9px;border-radius:999px;color:var(--dim2);' +
    'background:rgba(255,255,255,.05);border:1px solid var(--line)}' +
  '#scr-party .tb-lseat.rdy{border-color:rgba(61,220,132,.45);background:rgba(61,220,132,.10)}' +
  '#scr-party .tb-lseat.rdy .tb-tag{color:var(--ok);border-color:rgba(61,220,132,.5);' +
    'background:rgba(61,220,132,.14)}' +
  '#scr-party .tb-lseat.me b{color:var(--gold)}' +
  '#scr-party button.tb-lseat{width:100%;text-align:left;' +
    '-webkit-tap-highlight-color:transparent}' +
  '#scr-party button.tb-lseat:active{background:rgba(255,255,255,.09)}' +

  /* ══ THE SETUP SHEET ══
     It had eight full-width option cards down it and it was a page of
     reading before you could play. Everything that is a CHOICE BETWEEN
     A FEW THINGS is now one row: the name on the left, the options on
     the right, forty-eight pixels. The chair count is a stepper,
     because nobody sets sixteen chairs by tapping sixteen. And the
     reasoning — which ladder, why Malta plays the short one — folds
     away into the rules panel where somebody can read it once. */
  '#scr-party .tb-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:6px}' +
  '#scr-party .tb-sq{min-height:46px;border-radius:12px;background:rgba(255,255,255,.04);' +
    'border:1px solid var(--line);color:var(--dim);font:900 13px/1 var(--disp);letter-spacing:.05em}' +
  '#scr-party .tb-sq.on{background:rgba(255,197,66,.14);border-color:rgba(255,197,66,.5);' +
    'color:var(--gold)}' +
  '#scr-party .tb-note{font-size:11px;line-height:1.55;color:var(--dim2);margin:7px 2px 0;' +
    'text-transform:none;letter-spacing:0}' +

  /* ══ WHICH GAME — AND HOW MANY KARTELLI YOU ARE ABOUT TO BE HANDED ══
     "There is only 1 tocket in tombla not all 6 wtf." He opened a game,
     got one kartella, and thought the app was broken. It was not broken;
     he had klassika selected, and klassika deals one. That is MY fault
     and not his: the sheet is now the biggest single difference between
     the two games and it was being announced by the word "Klassika" and
     a line of small grey type underneath.

     So the choice is not a pair of chips any more. It is two cards, and
     the first thing on each of them is A PICTURE OF THE SHEET — one
     cartella against six, drawn at the same size so the difference is a
     shape and not a sentence. Nobody has to read anything to see that one
     of these deals six times as much paper. It is drawn geometry (cream
     rectangles with the red rule, ruled across like a cartella), which is
     the same thing the rest of this file draws instead of pictures. */
  '#scr-party .tb-modes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:4px 0 2px}' +
  '#scr-party .tb-mode{display:flex;flex-direction:column;align-items:flex-start;gap:8px;' +
    'min-height:0;padding:10px 10px 11px;text-align:left;letter-spacing:0}' +
  '#scr-party .tb-mode .pic{display:grid;grid-template-columns:repeat(2,27px);grid-auto-rows:17px;' +
    'gap:3px;justify-content:start;align-content:start;height:57px}' +
  '#scr-party .tb-mode .pic i{display:block;border-radius:3px;background:#F6E9CC;' +
    'box-shadow:0 0 0 1.5px #A8321E;' +
    'background-image:repeating-linear-gradient(180deg,transparent 0 4px,rgba(120,80,30,.3) 4px 5px)}' +
  '#scr-party .tb-mode b{font:900 12.5px/1.2 var(--disp);letter-spacing:.05em;text-transform:uppercase}' +
  '#scr-party .tb-mode u{text-decoration:none;font:900 10.5px/1.25 var(--disp);letter-spacing:.08em;' +
    'text-transform:uppercase;color:var(--gold)}' +
  '#scr-party .tb-mode i{font-style:normal;font-size:10.5px;line-height:1.45;color:var(--dim2)}' +
  '#scr-party .tb-mode:not(.on) u{color:var(--dim)}' +
  '#scr-party .tb-mode:not(.on) .pic i{opacity:.55}' +
  /* one setting, one row */
  '#scr-party .tb-set{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;' +
    'min-height:50px;padding:5px 2px;border-bottom:1px solid var(--line)}' +
  '#scr-party .tb-set:last-child{border-bottom:0}' +
  '#scr-party .tb-set>.lab{min-width:0}' +
  '#scr-party .tb-set .lab b{display:block;font:900 11.5px/1.25 var(--disp);letter-spacing:.07em;' +
    'text-transform:uppercase;color:var(--txt)}' +
  '#scr-party .tb-set .lab i{display:block;font-style:normal;font-size:10.5px;line-height:1.4;' +
    'color:var(--dim2);margin-top:2px}' +
  '#scr-party .tb-set .tb-seg{grid-auto-columns:minmax(52px,auto)}' +
  '#scr-party .tb-set .tb-sq{min-height:38px;padding:0 11px;font-size:11.5px}' +
  /* the stepper — two thumbs and a number, for anything up to sixteen */
  '#scr-party .tb-step{display:flex;align-items:center;gap:2px}' +
  '#scr-party .tb-step button{width:40px;height:40px;border-radius:11px;font:900 20px/1 var(--disp);' +
    'color:var(--gold);background:rgba(255,255,255,.05);border:1px solid var(--line)}' +
  '#scr-party .tb-step button:disabled{opacity:.3;color:var(--dim2)}' +
  '#scr-party .tb-step button:active:not(:disabled){background:rgba(255,197,66,.16)}' +
  '#scr-party .tb-step .val{min-width:46px;text-align:center;font:900 19px/1 var(--disp);' +
    'color:var(--txt)}' +
  /* the chairs, drawn — sixteen chips is a room, "16" is a number */
  '#scr-party .tb-chairs{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0 2px}' +
  '#scr-party .tb-chairs i{width:15px;height:15px;border-radius:4px;display:block;' +
    'background:rgba(255,255,255,.09)}' +
  '#scr-party .tb-chairs i.me{background:var(--ok)}' +
  '#scr-party .tb-chairs i.on{background:var(--gold)}' +
  /* the folding rules panel */
  '#scr-party .tb-fold{margin:14px 0 6px;border-radius:14px;border:1px solid var(--line);' +
    'background:rgba(255,255,255,.03);overflow:hidden}' +
  '#scr-party .tb-fold>button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;' +
    'min-height:48px;padding:8px 13px;color:var(--dim);background:none;border:0;' +
    'font:900 11px/1.3 var(--disp);letter-spacing:.1em;text-transform:uppercase}' +
  '#scr-party .tb-fold>button .ico{width:17px;height:17px;flex:0 0 auto}' +
  '#scr-party .tb-fold>button .cv{margin-left:auto;font-size:15px;line-height:1}' +
  '#scr-party .tb-fold .body{padding:2px 14px 14px}' +
  '#scr-party .tb-fold .body[hidden]{display:none}' +
  '#scr-party .tb-fold .body p{font-size:11.5px;line-height:1.65;color:var(--dim);margin:8px 0 0;' +
    'text-transform:none;letter-spacing:0}' +
  '#scr-party .tb-fold .body p b{color:var(--gold)}' +

  /* ══ the toast — "not yet", "you missed one" ══ */
  '#scr-party .tb-toast{position:absolute;left:50%;bottom:74px;transform:translateX(-50%);' +
    'z-index:24;max-width:86%;padding:9px 15px;border-radius:999px;pointer-events:none;' +
    'font:700 12px/1.35 var(--font);text-align:center;color:#2A1B0C;' +
    'background:linear-gradient(180deg,#FFE9A8,#F0C34E);box-shadow:0 6px 18px rgba(0,0,0,.5);' +
    'animation:tbToast 1.7s var(--ease) both}' +
  '#scr-party .tb-toast.bad{background:linear-gradient(180deg,#FFC3CB,#F0687C)}' +
  '@keyframes tbToast{0%{opacity:0;transform:translate(-50%,10px)}' +
    '14%{opacity:1;transform:translate(-50%,0)}82%{opacity:1;transform:translate(-50%,0)}' +
    '100%{opacity:0;transform:translate(-50%,-6px)}}' +

  /* ══ the big shout when a rung goes ══ */
  /* gap 14 and a real line-height on the shout, not 1: the display
     face's caps overflow a line-height:1 box by several pixels, and at
     46px that put "TOMBLA!" straight on top of the name underneath. */
  '#scr-party .tb-shout{position:absolute;inset:0;z-index:23;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:14px;pointer-events:none;' +
    'background:radial-gradient(circle at 50% 45%,rgba(255,197,66,.22),rgba(8,5,15,.86) 62%);' +
    'animation:tbShout 1.55s var(--ease) both}' +
  /* PADDING, not line-height. The display face overshoots its line box
     below the baseline by about a quarter of the cap height, so at 46px
     no amount of line-height stops "TOMBLA!" sitting on the name under
     it. Real padding is real space and it cannot be argued with. */
  '#scr-party .tb-shout b{font:900 40px/1.05 var(--disp);letter-spacing:.06em;color:var(--gold);' +
    'text-shadow:0 4px 18px rgba(0,0,0,.7);text-align:center;padding:10px 12px 16px}' +
  '#scr-party .tb-shout i{font-style:normal;font-size:13px;line-height:1.5;color:var(--txt);' +
    'text-align:center;max-width:280px;padding:0 12px}' +
  '#scr-party .tb-shout u{text-decoration:none;font:900 11px/1 var(--disp);letter-spacing:.14em;' +
    'text-transform:uppercase;color:var(--ok)}' +
  '@keyframes tbShout{0%{opacity:0}12%{opacity:1}76%{opacity:1}100%{opacity:0}}' +
  '#scr-party .tb-shout.big b{font-size:46px}' +

  /* ══ short phones: the card keeps its size, everything else gives ══ */
  '@media (max-height:760px){' +
    '#scr-party .tb-ball{width:66px;height:66px}' +
    '#scr-party .tb-ball b{font-size:28px}' +
    '#scr-party .tb-joke{-webkit-line-clamp:1;min-height:0}' +
    '#scr-party .tb-rail{height:26px}' +
    '#scr-party .tb-rail span{height:22px;min-width:27px;font-size:12px}' +
    '#scr-party .tb-rail span.now{height:26px;min-width:34px;font-size:14.5px}' +
    '#scr-party .pt-bar.tb-bar .btn{min-height:50px}}' +
  '@media (max-height:660px){' +
    '#scr-party .tb-seats{display:none}' +
    '#scr-party .tb-call{padding:6px 9px}}' +

  /* ══ THE PHONE TURNED SIDEWAYS ══
     Not "does not break" — the better way to play a ġog, and worth
     saying out loud. A cartella is NINE COLUMNS WIDE, so width is the
     axis it wants and portrait is the axis that is short of it. Turned
     sideways there is nearly nine hundred pixels of it, the sheet goes
     two across and three down on a phone and three across and two down
     on a short one (fitCards() works that out from the measurement, not
     from this rule), and every cell comes out BIGGER than it can ever be
     in portrait.

     What is scarce is now height, so everything that stacks gives:
     the joke, the miniature board, the room strip and the turn strip
     all go, the ball comes down to a token, and the button bar loses
     its generous thumb height because a thumb reaching a landscape
     phone is coming from the side anyway.

     Nothing here locks or forces an orientation. The player turns the
     phone; the app follows, and fitCards() re-measures on the resize —
     iOS resizes in stages, so it is asked more than once. */
  '@media (orientation:landscape) and (max-height:600px){' +
    '#scr-party .tb{gap:4px}' +
    /* OURS ONLY — see the note on .tbboard in board(). Without the
       marker this hid the shared turn strip in every party game. */
    '#scr-party .pt-wrap.tbboard .pt-turn{display:none}' +
    '#scr-party .tb-call{padding:4px 9px;gap:9px;border-radius:12px}' +
    '#scr-party .tb-ball,#scr-party .tb.gog .tb-ball{width:46px;height:46px}' +
    '#scr-party .tb-ball b,#scr-party .tb.gog .tb-ball b{font-size:20px}' +
    '#scr-party .tb-ball.none b,#scr-party .tb.gog .tb-ball.none b{font-size:9px}' +
    '#scr-party .tb-ball.draw b,#scr-party .tb.gog .tb-ball.draw b{font-size:9.5px}' +
    '#scr-party .tb-joke{display:none}' +
    '#scr-party .tb-seats,#scr-party .tb-mini{display:none}' +
    '#scr-party .tb-rail,#scr-party .tb.gog .tb-rail{height:24px}' +
    '#scr-party .tb-rail span,#scr-party .tb.gog .tb-rail span{height:20px;min-width:26px;font-size:11.5px}' +
    '#scr-party .tb-rail span.now,#scr-party .tb.gog .tb-rail span.now{height:24px;min-width:32px;font-size:13.5px}' +
    '#scr-party .tb-rung,#scr-party .tb.gog .tb-rung{padding:2px 2px 1px;border-radius:6px}' +
    '#scr-party .tb-rung b,#scr-party .tb.gog .tb-rung b{font-size:8px}' +
    '#scr-party .tb-rung i,#scr-party .tb.gog .tb-rung i{font-size:7.5px;margin-top:0}' +
    '#scr-party .pt-bar.tb-bar .btn{min-height:38px}' +
    '#scr-party .pt-bar.tb-bar .btn.sq .ico{width:18px;height:18px}' +
    '#scr-party #tb-claim{font-size:14px}' +
    '#scr-party #tb-claim .tb-sub{font-size:8px;margin-top:1px}' +
    '#scr-party .tb-chk{gap:9px;padding:14px}' +
    '#scr-party .tb-chk .read{max-width:min(92%,620px)}' +
    '#scr-party .tb-chk .read span{min-width:36px;height:36px;font-size:16px}' +
    '#scr-party .tb-chk .say{font:900 22px/1.15 var(--disp);min-height:0}' +
    '#scr-party .tb-chk .say.no{font-size:25px}' +
    '#scr-party .tb-shout b{font-size:30px;padding:6px 12px 10px}' +
    '#scr-party .tb-shout.big b{font-size:34px}}' +

  /* ══ SIDEWAYS, A ĠOG IS THE WHOLE SCREEN ══
     "Even la d scap is small u should use full screen boss." He is right,
     and the reason he was right is measurable. Turned sideways a phone is
     894 pixels wide; the sheet was being drawn into 720 of them (see
     .tb-edge above), and then of the 440 pixels of HEIGHT it had, 256 —
     fifty-eight per cent — went on a title bar, a caller bar, a rail on
     its own line, a ladder and a button bar. The kartelli got 184.

     Turned sideways this is therefore not the portrait layout rotated.
     It is a different composition:

       THE TITLE BAR GOES. In portrait it earns its band; sideways it
       costs fifty-six pixels of the scarce axis to say a word the caller
       bar already says. Nothing is lost with it — the badge said 12/90
       and the status line in the caller bar says 12/90 — so only the way
       back has to be rehomed, and it becomes a small disc in the corner
       of the caller bar. It is still #pt-back, so party.js's handler,
       Escape and the back arrow all go on working untouched.

       THE STRIP IS ONE ROW, NOT THREE. The ball, the rail and the ladder
       stop stacking and sit side by side across the top: the ball is
       fifty pixels tall and the other two are shorter than that, so two
       of the three now cost nothing at all. .tb is a grid for exactly
       this and for no other reason.

     WHAT IS NOT DONE, AND THE NUMBERS FOR WHY. The button bar was going
     to float over the cards. It was measured first: once the width is
     back, a landscape cell is 31 wide and its digits are sized off the
     WIDTH, so the bar costs the numbers nothing — floating it would have
     bought zero legibility, put the CLAIM button on top of somebody's
     kartella, and taken the same button away from the lobby that shares
     it. It stays in the flow, one row, at the foot. */
  '@media (orientation:landscape) and (max-height:600px){' +
    '#scr-party .pt-wrap.tbgog.tbplay>.tbar{position:absolute;z-index:21;top:var(--sat);left:var(--sal);' +
      'display:block;width:auto;min-height:0;height:auto;margin:0;padding:0;border:0;background:none}' +
    '#scr-party .pt-wrap.tbgog.tbplay>.tbar h2,' +
    '#scr-party .pt-wrap.tbgog.tbplay>.tbar .pt-badge{display:none}' +
    '#scr-party .pt-wrap.tbgog.tbplay>.tbar .iconbtn{width:30px;height:30px;min-height:0;min-width:0;' +
      'border-radius:50%;background:rgba(255,255,255,.09);color:var(--dim)}' +
    '#scr-party .tbplay .tb.gog{display:grid;gap:4px 8px;align-content:stretch;' +
      'grid-template-columns:minmax(0,1.15fr) minmax(0,1.5fr) auto;' +
      'grid-template-rows:auto minmax(0,1fr)}' +
    /* the strip is as tall as the ball and not a pixel taller. The status
       line was wrapping to two lines inside a narrow caller bar and every
       one of those lines came off all six cartelli. */
    '#scr-party .tbplay .tb.gog .tb-stat{flex-wrap:nowrap;overflow:hidden;white-space:nowrap}' +
    /* the left of the strip keeps the thirty pixels the back disc sits in */
    '#scr-party .tbplay .tb.gog .tb-call{grid-column:1;grid-row:1;padding:2px 8px 2px 32px;border-radius:10px}' +
    '#scr-party .tbplay .tb.gog .tb-rail{grid-column:2;grid-row:1;align-self:center}' +
    '#scr-party .tbplay .tb.gog .tb-lad{grid-column:3;grid-row:1;align-self:center;width:128px;gap:3px}' +
    '#scr-party .tbplay .tb.gog .tb-cards{grid-column:1/4;grid-row:2}' +
    '#scr-party .pt-wrap.tbgog.tbplay .pt-bar{margin-top:4px}}' +

  /* the small phone, sideways — an SE is 375 tall in landscape and a
     ġog wants every pixel of it. The laqam is the first thing to go
     after the joke: it is the nickname, it is lovely, and it is not
     what anybody is looking at while they hunt for a number. The
     Maltese name of the number and the ball stay, because those are
     the call itself. */
  '@media (orientation:landscape) and (max-height:430px){' +
    '#scr-party .tb.gog .tb-laqam{display:none}' +
    '#scr-party .tb.gog .tb-call{padding:3px 8px}' +
    '#scr-party .tb.gog .tb-cards{gap:4px}' +
    '#scr-party .tb.gog .tb-card{padding:2px;border-radius:7px}' +
    '#scr-party .tb.gog .tb-grid{gap:1px;padding:1px;border-radius:5px}}' +

  /* ══ THE DOOR\'S OWN DRESS ═══════════════════════════════════════
     Scoped under .tbm — the wrapper the setup sheet (and only the
     setup sheet) puts on. The identity piece is a kartella mid-story:
     a printed ticket, three numbers marked, and the token that has
     just come out of the bag resting on its corner. Drawn in the same
     cream, red rule and terracotta the game itself is drawn in, so
     the door and the table are one object. */
  '#scr-party .tbm{--tbm-paper:#F6E9CC;--tbm-blank:#DCC79C;--tbm-ink:#2A1B0C;' +
    '--tbm-rule:#A8321E;--tbm-bean:#C1361F;--tbm-bean2:#8E2412}' +
  '#scr-party .tbm-hero{position:relative;display:flex;justify-content:center;' +
    'padding:10px 0 22px}' +
  '#scr-party .tbm-hero::before{content:"";position:absolute;left:6%;right:6%;top:0;bottom:0;' +
    'background:radial-gradient(60% 80% at 50% 55%,rgba(193,54,31,.16),' +
    'rgba(246,233,204,.07) 55%,transparent 80%);pointer-events:none}' +
  '#scr-party .tbm-tick{position:relative;transform:rotate(-2.5deg);' +
    'background:var(--tbm-paper);border-radius:9px;padding:5px;' +
    'box-shadow:0 0 0 2.5px var(--tbm-rule),0 0 0 4px rgba(0,0,0,.25),' +
    '0 10px 22px rgba(0,0,0,.55)}' +
  '#scr-party .tbm-grid{display:grid;grid-template-columns:repeat(9,clamp(23px,7vw,30px));' +
    'grid-auto-rows:clamp(21px,6.2vw,27px);gap:2px}' +
  '#scr-party .tbm-grid span{display:grid;place-items:center;border-radius:3px;' +
    'background:var(--tbm-paper);box-shadow:inset 0 0 0 1px rgba(168,50,30,.4);' +
    'font:900 12.5px/1 var(--disp);color:var(--tbm-ink)}' +
  '#scr-party .tbm-grid span.e{background:var(--tbm-blank);' +
    'box-shadow:inset 0 0 0 1px rgba(168,50,30,.22)}' +
  /* a marked number is the game\'s own bean: terracotta, number knocked out */
  '#scr-party .tbm-grid span.on{color:#FFF3DC;border-radius:50%;' +
    'background:radial-gradient(circle at 34% 28%,#E85B36,var(--tbm-bean) 55%,var(--tbm-bean2));' +
    'box-shadow:inset 0 -2px 3px rgba(0,0,0,.35),0 1px 3px rgba(0,0,0,.4)}' +
  /* the token out of the bag, resting on the ticket\'s corner */
  '#scr-party .tbm-ball{position:absolute;right:-12px;bottom:-16px;width:52px;height:52px;' +
    'border-radius:50%;display:grid;place-items:center;transform:rotate(2.5deg);' +
    'background:radial-gradient(circle at 34% 26%,#FFFDF4,#F0DFB8 52%,#C9AE79);' +
    'box-shadow:inset 0 -4px 7px rgba(120,80,30,.28),inset 0 0 0 2.5px rgba(255,255,255,.5),' +
    '0 6px 14px rgba(0,0,0,.55)}' +
  '#scr-party .tbm-ball b{font:900 21px/1 var(--disp);color:#3A2408}' +

  /* ── the rules dock at the foot — in the flow, never over anything.
     The slide is transform-and-opacity on the words only; layout snaps,
     the panel can never cover a setting or the Start button. ── */
  '#scr-party .tbm-dock{flex:0 0 auto;margin-top:8px;border-radius:15px;overflow:hidden;' +
    'border:1px solid var(--line2);' +
    'background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02))}' +
  '#scr-party .tbm-grip{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;' +
    'padding:8px 14px;border:0;background:none;color:var(--dim);text-align:left;cursor:pointer;' +
    'font:900 11px/1.3 var(--disp);letter-spacing:.1em;text-transform:uppercase}' +
  '#scr-party .tbm-grip .ico{width:17px;height:17px;flex:0 0 auto}' +
  '#scr-party .tbm-grip .cv{margin-left:auto;width:17px;height:17px;flex:0 0 auto;' +
    'transition:transform .2s var(--ease)}' +
  '#scr-party .tbm-dock.open{border-color:rgba(193,54,31,.55)}' +
  '#scr-party .tbm-dock.open .tbm-grip{color:#FFB49A}' +
  '#scr-party .tbm-dock.open .cv{transform:rotate(180deg)}' +
  '#scr-party .tbm-body{max-height:min(38vh,300px);overflow-y:auto;padding:0 14px 10px}' +
  '#scr-party .tbm-body[hidden]{display:none}' +
  '#scr-party .tbm-body>div{animation:tbmUp .22s var(--ease)}' +
  '@keyframes tbmUp{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}' +
  '#scr-party .tbm-body p{font-size:11.5px;line-height:1.65;color:var(--dim);margin:8px 0 0;' +
    'text-transform:none;letter-spacing:0}' +
  '#scr-party .tbm-body p b{color:var(--gold)}' +
  /* sideways, the ticket gives a little */
  '@media (orientation:landscape) and (max-height:480px){' +
    '#scr-party .tbm-hero{padding:4px 0 16px}' +
    '#scr-party .tbm-grid{grid-template-columns:repeat(9,24px);grid-auto-rows:21px}' +
    '#scr-party .tbm-ball{width:42px;height:42px}' +
    '#scr-party .tbm-ball b{font-size:17px}}' +
  '@media (prefers-reduced-motion:reduce){' +
    '#scr-party .tbm-body>div{animation:none}' +
    '#scr-party .tbm-grip .cv{transition:none}}' +
  'body.reduced #scr-party .tbm-body>div{animation:none}' +
  'body.reduced #scr-party .tbm-grip .cv{transition:none}';

  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   HOW THE ĠOG IS LAID OUT
   ───────────────────────────────────────────────────────────────────
   Two jobs, and they are the same arithmetic: HOW MANY CARTELLI ACROSS
   and HOW TALL A CELL IS.

   THIS IS THE CODE THAT LOST HIM TWO KARTELLI, so it is worth saying
   exactly what went wrong. The old version added up the heights of the
   blocks around the cards — the caller bar, the ladder, the seats, the
   flex gaps between them — and subtracted. Adding up a layout is a
   guess dressed as a measurement: it double-counted the gaps of blocks
   that were display:none, it guessed a card's own chrome, and the
   error came out of the bottom of a block that CLIPS. The kartella did
   not get smaller. It went away, with nothing on screen saying so, and
   he counted four.

   Nothing is added up here any more. THREE MEASUREMENTS, ALL TAKEN
   FROM THE DOM AFTER IT HAS BEEN LAID OUT:

     the space         .tb-cards is flex:1 with min-height:0, so after
                       a layout pass its clientHeight and clientWidth
                       ARE the space it was given, whatever is around
                       it, in either orientation. There is nothing to
                       add up because the browser has already done it.
     a card's chrome   its own height minus the three rows it is
                       currently drawing; its own width minus the nine
                       cells it is currently drawing. Self-correcting,
                       and it cannot drift when the stylesheet changes.
     the answer        written back as two custom properties.

   HOW MANY ACROSS — AND WHY THE OLD ANSWER WAS COSTING HIM THE SQUARE.
   "The tombla need to be more bigger please so easy clicable please even
   landscape." The column count used to be picked from the ASPECT of the
   card area: wide box, three across; tall box, two. That reads sensibly
   and it is the wrong question, because a cartella is NINE COLUMNS BY
   THREE ROWS and a cell is therefore

       min( cardWidth / 9 , cardHeight / 3 )

   on the axis a thumb actually has to hit. A card box that is not about
   three to one wastes one of its two axes outright, and the aspect rule
   was handing out boxes that were nowhere near it. Measured on a 440x894
   phone, two across gave each cartella a 214-pixel box for 9 columns and
   140 pixels of height for 3 rows: cells 22 WIDE and 44 TALL, with two
   thirds of every cell's height doing nothing while the digits were
   squeezed into twenty-two pixels. Sideways it was the same fault, milder.

   So nothing is picked from the aspect any more. EVERY COLUMN COUNT THAT
   COULD FIT IS COSTED, in the real measured box, and the winner is the
   one with the biggest SHORT SIDE — because the short side is the whole
   of "easy to tap" and the whole of how big the digits can be. A
   candidate is only eligible if it clears both floors: MIN_W, or two
   digits do not fit, and MIN_H WITHOUT BEING CLAMPED UP TO IT, which is
   the important one — a row forced up to the floor is a row the ġog does
   not have the height for, and THAT is how six kartelli became four. The
   cost function does not know or care what the numbers come out as; it
   is run out fresh on whatever box the browser gives.

   What it lands on, and it is worth having the numbers written down:

     440x894  one across, six down     22.2 -> 28.1   (was 2 x 3)
     412x915  one across, six down     20.5 -> 29.3   (was 2 x 3)
     360x800  one across, six down     17.6 -> 22.9   (was 2 x 3)
     390x660  two across, three down   19.4 -> 19.4   one across is 17.9
                                                      here and does not
                                                      fit: rejected, and
                                                      by measurement
     894x440  two across, three down   30.9 -> 31.9   (was 3 x 2)
     660x390  two across, three down   22.3 -> 28.4   (was 3 x 2)
     800x360  three across, two down   27.5 -> 27.5   two across is 25.0
                                                      on a 245-tall box:
                                                      rejected

   A tall phone therefore gets ONE CARTELLA ACROSS, full width, six down
   — which is not the two stacks of three his paper is printed in, and
   that is a real cost. It is paid because he asked for bigger and easier
   to tap in the same sentence and a 22-pixel column is the answer to
   why: full width buys the square 47 pixels across and 28 down instead
   of 22 across and 44 down. Same paper, unfolded.

   HOW TALL. Whatever is left, capped at twice the cell's own WIDTH so a
   cartella cannot stretch into a bar of letterboxes when the height is
   the plentiful axis. The slack goes into air around the sheet instead —
   align-content:center — which is what a ġog on a table looks like.
   ═══════════════════════════════════════════════════════════════════ */
const MIN_W = 15;      /* under this two digits do not fit, at any size */
const MIN_H = 20;      /* small and legible still beats absent          */
const MAX_H = 76;      /* above this one cartella stretches into a bar  */

function fitCards(){
  if (!U || !U.root || !U.root.isConnected) return;
  const host = U.root.querySelector('#tb-cardhost');
  if (!host) return;
  const grids = host.querySelectorAll('.tb-grid');
  if (!grids.length) return;

  const availW = host.clientWidth, availH = host.clientHeight;
  /* not laid out yet (or laid out to nothing). Leave whatever is there
     rather than writing a number computed from zero — this runs off a
     ResizeObserver and will be asked again the moment there is a box. */
  if (availW < 60 || availH < 60) return;

  const n = grids.length;
  const card0 = grids[0].parentNode;
  const cell0 = grids[0].querySelector('.tb-c');
  /* the gap between cartelli, read off the stylesheet rather than typed
     in again here. A landscape media query trims it and this must not
     have to know that. */
  const cs = getComputedStyle(host);
  const gap = parseFloat(cs.rowGap) || parseFloat(cs.gap) || (U.gog ? 5 : 10);

  /* a card's own chrome, on BOTH axes, taken the same way: what the card
     is drawing now, minus the cells it is drawing it with. The height
     used to be read off the --tbh we last wrote, which is nothing at all
     on the first pass — so the first fit of a fresh ġog costed a chrome
     of ninety-odd pixels and picked its columns from it. It is the
     PAINTED row that is measured now, exactly as the column already was,
     so the very first pass is right and there is no shape to flicker
     out of. */
  const cw0 = cell0 ? cell0.getBoundingClientRect().width : 0;
  const ch0 = cell0 ? cell0.getBoundingClientRect().height : 0;
  const chromeW = cw0 > 0
    ? Math.max(0, card0.getBoundingClientRect().width - cw0 * 9)
    : 26;                                   /* padding + eight gutters  */
  let chromeH;
  if (ch0 > 0){
    chromeH = Math.max(0, card0.getBoundingClientRect().height - ch0 * 3);
  } else {
    const curH = parseFloat(grids[0].style.getPropertyValue('--tbh')) ||
                 parseFloat(getComputedStyle(grids[0]).getPropertyValue('--tbh')) || 26;
    chromeH = Math.max(0, card0.offsetHeight - curH * 3);
  }

  /* ── how many cartelli across, and how tall a cell is in what is left ──
     One arithmetic, run for every column count that could hold n cards,
     and then the best short side wins. See the block above for why the
     short side is the only thing worth maximising here. */
  const cell = (cols) => {
    const rows = Math.ceil(n / cols);
    const w = ((availW - (cols - 1) * gap) / cols - chromeW) / 9;
    /* the height this many rows can HONESTLY have. Not clamped up to
       MIN_H — a candidate that needs clamping is a candidate that does
       not fit, and it has to be able to say so. */
    const hFits = (availH - (rows - 1) * gap - rows * chromeH) / (rows * 3);
    const h = Math.min(Math.floor(hFits), Math.round(w * (U.gog ? 2 : 1.75)), MAX_H);
    return { cols, rows, w, h, hFits, ok: w >= MIN_W && hFits >= MIN_H,
             short: Math.min(w, h), area: w * h };
  };

  let pick;
  if (U.gog){
    const tries = [];
    for (let c = 1; c <= Math.min(3, n); c++) tries.push(cell(c));
    const fit = tries.filter(t => t.ok);
    /* among the ones that fit: biggest short side, and if two are within
       a pixel of each other the bigger square wins. If NOTHING fits —
       a screen smaller than anything real — take the one that at least
       does not need the height it has not got, so a cartella is small
       rather than off the bottom of a block that clips. */
    const rank = (a, b) => (Math.abs(b.short - a.short) > 1
      ? b.short - a.short : b.area - a.area);
    pick = fit.length ? fit.sort(rank)[0]
         : tries.filter(t => t.hFits >= MIN_H).sort(rank)[0]
         || tries.sort((a, b) => b.hFits - a.hFits)[0];
  } else {
    pick = cell(1);                 /* one big kartella: nothing to choose */
  }

  const cols = pick.cols;
  const h = Math.max(MIN_H, pick.h);
  const w = Math.max(MIN_W, Math.round(pick.w));

  /* written only when they actually change: this runs off a
     ResizeObserver and off every repaint, and a style write that says
     the same thing is a layout the phone did not need. */
  if (host.style.getPropertyValue('--tbcols') !== String(cols))
    host.style.setProperty('--tbcols', String(cols));
  for (const g of grids){
    if (g.style.getPropertyValue('--tbh') !== h + 'px') g.style.setProperty('--tbh', h + 'px');
    /* the cell's own width, for the font. Measured rather than derived
       from the column count, so a stylesheet change to a padding
       cannot make the digits overflow their box. */
    if (g.style.getPropertyValue('--tbw') !== w + 'px') g.style.setProperty('--tbw', w + 'px');
  }
}

/* ── WHEN TO MEASURE AGAIN ─────────────────────────────────────────
   A ResizeObserver on the host catches everything that changes the box
   under us — a rotation, an iOS URL bar sliding away, a keyboard. But
   iOS resizes a rotation in STAGES: the first pass can report the old
   width with the new height, and a layout computed from that is a
   layout of a phone that does not exist. So a rotation is also asked
   again a beat later, twice, and fitCards() is cheap and idempotent —
   it writes nothing when the answer has not moved. */
let fitRO = null, fitOri = null;
function againSoon(){
  fitCards();
  requestAnimationFrame(fitCards);
  soon(fitCards, 140);
  soon(fitCards, 420);
}
function watchFit(){
  stopFit();
  fitOri = () => againSoon();
  window.addEventListener('orientationchange', fitOri);
  window.addEventListener('resize', fitOri);
  if (typeof ResizeObserver !== 'function'){
    fitRO = { disconnect(){} };
    return;
  }
  fitRO = new ResizeObserver(() => fitCards());
  if (U && U.ctx && U.ctx.host) fitRO.observe(U.ctx.host);
}
function stopFit(){
  if (fitOri){
    window.removeEventListener('orientationchange', fitOri);
    window.removeEventListener('resize', fitOri);
    fitOri = null;
  }
  if (fitRO){ try { fitRO.disconnect(); } catch(e){} fitRO = null; }
}

/* ═══════════════════════════════════════════════════════════════════
   THE LIVE SCREEN
   One at a time, and it owns nothing the engine owns. U is torn down
   by leave(), which js/party.js calls for EVERY way out of the board
   including the app navigating out from under us.
   ═══════════════════════════════════════════════════════════════════ */
let U = null;

function localSeat(){
  const st = T.state();
  if (!st) return 0;
  let i = st.seats.findIndex(s => s.own === 'me');
  if (i < 0) i = st.seats.findIndex(s => s.own === 'hot');
  return i < 0 ? 0 : i;
}
const isLocalSeat = i => { const st = T.state(); const s = st && st.seats[i];
                           return !!s && (s.own === 'me' || s.own === 'hot'); };

function leave(){
  stopFit();
  /* the pane gets its margins back the moment the ġog is off it */
  try { P.ui.screenEl().classList.remove('tb-edge'); } catch(e){}
  /* the voice goes with the table. A number half-said while the player
     is already back on the shelf is the app talking to an empty room. */
  try { if (window.KARTI_CALLER){ window.KARTI_CALLER.stop(); window.KARTI_CALLER.setEnabled(false); } } catch(e){}
  if (U){
    if (U.off) { try { U.off(); } catch(e){} }
    try { closeSheets(); } catch(e){}
    for (const t of U.timers) clearTimeout(t);
    const net = U.net;
    U = null;
    if (net && net.onGone) { try { net.onGone(); } catch(e){} }
  }
  T.stopClock();
  T.end();
}
function soon(fn, ms){
  if (!U) return;
  const t = setTimeout(() => {
    if (U){ const i = U.timers.indexOf(t); if (i >= 0) U.timers.splice(i, 1); }
    if (U) fn();
  }, ms);
  U.timers.push(t);
}

/* ═══════════════════════════════════════════════════════════════════
   1 · THE SETUP SHEET
   party.js's own setup() is built for a two-player board game with a
   difficulty and a colour, which tombla is not, so this is our own —
   built out of party.js's classes so it is the same object to look at,
   and it scrolls, which is the one place in this game that may.

   ONLINE IS FIRST, and it is a DOOR: tapping Start on it hands you
   straight to js/mp.js's room list with tombla already picked. Eight
   people all playing at once with nobody waiting for a turn is what
   this game is FOR. Pass-the-phone is last, and it is last on purpose.
   ═══════════════════════════════════════════════════════════════════ */
const LEVELS = [
  { k:1, name:'Nofs rieqda', note:'Talking, not looking. They miss things — and now and then they ' +
        'put a counter on the wrong square and shout on it.', icon:'diff-1' },
  { k:2, name:'Tal-każin',   note:'Play every week. They rarely miss a number.', icon:'diff-2' },
  { k:3, name:'In-nanna',    note:'A whole ġog, one pen, and eyes like a hawk.', icon:'diff-3' }
];

/* one settings row: a name on the left, a few chips on the right */
function setRow(id, label, note, opts, cur){
  return '<div class="tb-set"><span class="lab"><b>' + esc(label) + '</b>' +
    (note ? '<i>' + esc(note) + '</i>' : '') + '</span>' +
    '<div class="tb-seg" id="' + id + '">' + opts.map(o =>
      '<button class="tb-sq' + (String(o.v) === String(cur) ? ' on' : '') +
      '" data-v="' + esc(o.v) + '">' + esc(o.l) + '</button>').join('') + '</div></div>';
}
/* one of the two games, with its SHEET drawn on it. `n` mini cartelli,
   laid out two across the way a real ġog is folded, so one card against
   six is a shape you cannot mistake for a shorter sentence. */
function modeCard(v, name, n, sheet, note){
  let pic = '';
  for (let i = 0; i < n; i++) pic += '<i></i>';
  return '<button class="tb-sq tb-mode" data-v="' + esc(v) + '">' +
    '<span class="pic" aria-hidden="true">' + pic + '</span>' +
    '<b>' + esc(name) + '</b><u>' + esc(sheet) + '</u><i>' + esc(note) + '</i></button>';
}

function stepRow(id, label, note, val){
  return '<div class="tb-set"><span class="lab"><b>' + esc(label) + '</b>' +
    (note ? '<i>' + esc(note) + '</i>' : '') + '</span>' +
    '<div class="tb-step" id="' + id + '">' +
      '<button data-d="-1" aria-label="one fewer">&minus;</button>' +
      '<span class="val">' + val + '</span>' +
      '<button data-d="1" aria-label="one more">+</button>' +
    '</div></div>';
}

/* THE THIRTY SECONDS THAT SEATS A STRANGER.
   The same words in two places — folded open in the setup sheet below, and
   handed to js/mp.js's shared lobby as `rulesHTML()`. Written once so the two
   can never disagree about what a vers is. */
/* THE IDENTITY PIECE for the setup sheet: one kartella, mid-game. The
   arrangement is fixed and legal (fifteen numbers, five a row, columns in
   their decades), 48 has just come out of the bag — it is on the token AND
   marked on the sheet — and two older calls are already beaned. Decoration
   to a screen reader; the whole thing is aria-hidden. */
const HERO_LAY = [
   3, 17,  0, 34,  0, 56,  0, 71,  0,
   0, 19, 25,  0, 48,  0, 62,  0, 88,
  14,  0,  0, 39,  0, 53,  0, 77, 90];
const HERO_ON = { 17:1, 48:1, 90:1 };
function heroHTML(){
  let cells = '';
  for (const n of HERO_LAY)
    cells += n ? '<span' + (HERO_ON[n] ? ' class="on"' : '') + '>' + n + '</span>'
               : '<span class="e"></span>';
  return '<div class="tbm-hero" aria-hidden="true"><div class="tbm-tick">' +
    '<div class="tbm-grid">' + cells + '</div>' +
    '<span class="tbm-ball"><b>48</b></span>' +
  '</div></div>';
}

/* the rules dock's open state is a UI preference and lives in a UI-only
   key — never with a game save. Same pattern as karti_kiri_ui_v1.dock. */
const UI_KEY = 'karti_tombla_ui_v1';

function rulesPanel(){
  return '<p><b>Tombla klassika</b> — <b>one kartella</b>, the Italian ladder: <b>ambo</b> ' +
      'two on one row, <b>terna</b> three, <b>kwaterna</b> four, <b>ċinkwina</b> the whole ' +
      'row of five, then <b>TOMBLA</b> — all fifteen. Each is won once and the game carries ' +
      'on for the next, which is why nobody leaves the table. Fifteen numbers to watch, and ' +
      'it is over in ten minutes.</p>' +
    '<p><b>Tal-każin</b> — <b>the full ġog of six</b>, and in Malta it is always the full ' +
      'six. The Lotteries and Other Games Act defines a tombla as won by the <b>vers</b> — ' +
      'five on one row — or the <b>fatta</b>, all fifteen. No ambo, no terna. That is the ' +
      'game the band clubs and the parishes play. Every number that comes out is somewhere ' +
      'on your sheet, so you mark ninety times instead of fifteen and the room is in it to ' +
      'the last ball.</p>' +
    '<p>The prize is always <b>on one kartella</b>: a row of that one, or that one filled. ' +
      'Nothing counts across the sheet — six cartelli are six chances, not one big card. ' +
      'And no two people are ever dealt the same arrangement, so who wins is the sheet you ' +
      'were handed.</p>' +
    '<p>Both are here under their own names. Neither is invented.</p>' +
    '<p>You mark your own numbers and you shout for your own prize. Nobody waits for a ' +
      'turn, which is why this table seats sixteen.</p>';
}

/* ═══════════════════════════════════════════════════════════════════
   1 · THE ENTRY — one clean screen, the way ludu/kanun/bomba open.
   Hero, one line, and the two honest ways to play as big buttons:
   PLAY ONLINE (primary, when the relay knows the word) and PLAY WITH
   AI, with HOW TO PLAY sliding the same rules dock up from the foot.
   There is NO settings wall here any more — mode, caller, chairs,
   speed, level and the accessibility toggles all moved one tap deeper
   into setupAI(), so starting a game is a single choice. A saved board
   still gets first billing so it is never buried under a fresh start.

   Online carries no mode — no variants are published, so the lobby has
   no field for one and must not grow one here. The każin/klassika choice
   is a LOCAL, second-step decision (setupAI); online opens the shared
   room list, which deals whatever the room's contract deals.

   ── THERE IS NO PASS-THE-PHONE TOMBLA ────────────────────────────
   Everybody marks at the SAME MOMENT on their own sheet, so there is no
   turn to hand over. A hot-seat tombla would mean passing the phone
   ninety times while the room waits. Two honest ways only, and this is
   why the entry is two buttons, not three.
   ═══════════════════════════════════════════════════════════════════ */
function menu(){
  injectCSS();
  leave();
  P.ui.sprite();
  P.show();
  const el = P.ui.screenEl();
  const p = T.pref();
  const rec = T.recOf();
  const saved = T.savedSlot();

  /* ── is the online door actually a door? ──────────────────────────
     js/mp.js keeps its own list of what a room can be a room OF, and a
     game that is not in it is quietly turned into a card duel by
     cleanGame() — so we ask mp.js rather than ourselves. The moment
        { k:'tombla', name:'Tombla', short:'TOMBLA', sym:'tb-mark',
          blurb:'Ninety numbers. Everybody at once.' }
     lands in that file's GAMES array this lights up on its own. */
  const M = window.KARTI_MP;
  const canOnline = !!(M && M.openFor && M.GAME_KEYS &&
                       M.GAME_KEYS.indexOf('tombla') >= 0 && P.online && P.online.tombla);
  const relayDown = !!(canOnline && M.PR && M.PR.tried && M.PR.err);

  el.innerHTML =
    '<div class="pt-wrap tbm">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="pt-back" aria-label="Back to party games">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Tombla</h2>' +
    '</div>' +
    '<div class="scroll">' +
      heroHTML() +
      '<p class="blurb">Ninety numbers in a bag, and everybody marks their own sheet at ' +
        'once — nobody waits for a turn. Play a room of people, or take on the phone.</p>' +

      (saved ? '<button class="btn primary" id="tb-resume" style="margin:2px 0 12px">' +
        ilb('play', 'Carry on — call ' +
          ((saved.log || []).filter(m => m.t === 'call').length) + ' of 90') + '</button>' : '') +

      '<div class="pt-opts" id="tb-modes" style="margin:6px 0 8px">' +
        (canOnline
          ? '<button class="pt-opt on" data-v="online">' + ico('users') +
            '<b>Play online</b><i>Up to sixteen, everybody marking at once.</i></button>'
          : '') +
        '<button class="pt-opt" data-v="ai">' + ico('coach') +
          '<b>Play with AI</b><i>You and the phone. The rest of the table is the machine.</i></button>' +
        '<button class="pt-opt" data-v="rules">' + ico('book') +
          '<b>How to play</b><i>The rules, and why there are two games.</i></button>' +
      '</div>' +
      (relayDown
        ? '<p class="pt-warn">The KARTI server cannot be reached from this phone right now. ' +
          '<b>If Tailscale is on, turn it off.</b> Everything else here works with no internet.</p>'
        : '') +

      (rec.w + rec.l + rec.d
        ? '<p class="pt-ledger">Tombla so far: <b>' + rec.w + '</b> won, <b>' + rec.d +
          '</b> with a prize, <b>' + rec.l + '</b> with nothing.</p>'
        : '') +
      '<div style="height:8px"></div>' +
    '</div>' +
    /* the rules live at the foot, folded — the same tbm-dock the setup
       used. "How to play" slides it up; open or shut it never covers a
       button. */
    '<div class="tbm-dock" id="tb-dock">' +
      '<button type="button" class="tbm-grip" id="tb-grip" aria-expanded="false" ' +
        'aria-controls="tb-dockbody" aria-label="Open the rules">' + ico('book') +
        '<span>The rules, and why there are two</span>' +
        '<svg class="cv" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M6 14.6l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" ' +
          'stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<div class="tbm-body" id="tb-dockbody" hidden><div>' + rulesPanel() + '</div></div>' +
    '</div>' +
    '</div>';

  /* the dock: slide open on tap, remember the state in the UI-only key */
  const dock = el.querySelector('#tb-dock');
  const grip = el.querySelector('#tb-grip');
  const dbody = el.querySelector('#tb-dockbody');
  const setDock = (isOpen, quiet) => {
    dock.classList.toggle('open', isOpen);
    dbody.hidden = !isOpen;
    grip.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    grip.setAttribute('aria-label', isOpen ? 'Close the rules' : 'Open the rules');
    if (!quiet) sfx(isOpen ? 'ui.sheet' : 'ui.back');
    try { localStorage.setItem(UI_KEY + '.rules', isOpen ? '1' : '0'); } catch(e){}
  };
  grip.onclick = () => setDock(dbody.hidden);
  let was = false;
  try { was = localStorage.getItem(UI_KEY + '.rules') === '1'; } catch(e){}
  if (was) setDock(true, true);

  el.querySelector('#pt-back').onclick = () => P.hub();
  const rz = el.querySelector('#tb-resume');
  if (rz) rz.onclick = () => {
    const snap = T.savedSlot();
    if (!snap || !T.hooks.load(snap)) { menu(); return; }
    board();
    if (T.state().phase === 'play') T.runClock();
  };

  el.querySelectorAll('#tb-modes .pt-opt').forEach(b2 => b2.onclick = () => {
    sfx('ui.tap');
    const v = b2.dataset.v;
    if (v === 'rules'){ setDock(true); return; }
    if (v === 'online'){
      T.pref({ play:'online' });
      if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('tombla');
      return;
    }
    setupAI();               /* v === 'ai' */
  });
}

/* ═══════════════════════════════════════════════════════════════════
   1b · THE AI SETUP — one tap deeper, the second step.
   Everything that used to be the wall lives here now: which game (and so
   how much paper it deals you), who reads the numbers out, how many
   chairs, the read speed, how sharp the machine is, and the two
   accessibility toggles. Sensible defaults from T.DEFAULTS are chosen up
   front so Start is always right there. The rules stay folded at the
   foot in the same dock as the entry.
   ═══════════════════════════════════════════════════════════════════ */
function setupAI(){
  injectCSS();
  P.ui.sprite();
  P.show();
  const el = P.ui.screenEl();
  const p = T.pref();

  let rules = p.mode === 'ladder' ? 'ladder' : 'hall';
  let who   = p.caller === 'auto' ? 'auto' : 'manual';
  let seats = Math.max(2, Math.min(T.MAX_SEATS, p.seats || T.DEFAULTS.seats));
  let level = [1,2,3].indexOf(p.level) >= 0 ? p.level : 2;
  let speed = [1,2,3].indexOf(p.speed) >= 0 ? p.speed : 2;
  let auto  = !!p.auto;
  let hints = !!p.hints;

  el.innerHTML =
    '<div class="pt-wrap tbm">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="pt-back" aria-label="Back">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Play with AI</h2>' +
    '</div>' +
    '<div class="scroll">' +

      '<button class="btn primary" id="tb-start" style="margin:6px 0 14px"></button>' +

      '<div class="tiny pt-lbl">The game — and how much paper it deals you</div>' +
      /* THE MODE CARRIES THE SHEET, so the sheet is the headline. See
         WHICH GAME in the stylesheet for why this is not two chips. */
      '<div class="tb-modes" id="tb-rules">' +
        modeCard('ladder', 'Klassika', 1, 'One kartella',
                 'Five prizes: ambo, terna, kwaterna, ċinkwina, then tombla. ' +
                 'Fifteen numbers to watch, over in ten minutes.') +
        modeCard('hall', 'Tal-każin', 6, 'Six kartelli · il-ġog',
                 'Vers, then fatta. Every number that comes out is somewhere on your ' +
                 'sheet, so you mark ninety times. The game the każini play.') +
      '</div>' +
      setRow('tb-who', 'Who reads them out', 'Manual: you tap the bag and say it yourself. The app stays quiet.',
             [{ v:'manual', l:'A person' }, { v:'auto', l:'The phone' }], who) +
      stepRow('tb-seats', 'Chairs', 'Two to sixteen. Nobody ever waits for a turn.', seats) +
      '<div class="tb-chairs" id="tb-chairview"></div>' +
      '<div id="tb-speedrow">' +
      setRow('tb-speed', 'How fast the phone reads', 'Only when the phone is calling.',
             [{ v:1, l:'Slow' }, { v:2, l:'Normal' }, { v:3, l:'Quick' }], speed) +
      '</div>' +
      '<div id="tb-lvlrow">' +
      setRow('tb-lvl', 'The others', LEVELS[level - 1] ? LEVELS[level - 1].note : '',
             LEVELS.map(l => ({ v:l.k, l:l.name })), level) +
      '</div>' +
      setRow('tb-hints', 'Ring the called number', 'Accessibility. Shows you where it is; you still tap it.',
             [{ v:0, l:'Off' }, { v:1, l:'On' }], hints ? 1 : 0) +
      setRow('tb-auto', 'Mark for me', 'Accessibility. The phone marks everything. It is not the game.',
             [{ v:0, l:'Off' }, { v:1, l:'On' }], auto ? 1 : 0) +

      '<button class="btn primary" id="tb-start2" style="margin:14px 0 24px"></button>' +
    '</div>' +
    /* the rules live at the foot, folded — same dock as the entry. */
    '<div class="tbm-dock" id="tb-dock">' +
      '<button type="button" class="tbm-grip" id="tb-grip" aria-expanded="false" ' +
        'aria-controls="tb-dockbody" aria-label="Open the rules">' + ico('book') +
        '<span>The rules, and why there are two</span>' +
        '<svg class="cv" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M6 14.6l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" ' +
          'stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<div class="tbm-body" id="tb-dockbody" hidden><div>' + rulesPanel() + '</div></div>' +
    '</div>' +
    '</div>';

  const seg = (id, set) => el.querySelectorAll('#' + id + ' .tb-sq').forEach(b2 => {
    b2.onclick = () => { sfx('ui.tap'); set(b2.dataset.v); sync(); };
  });
  const sync = () => {
    const mark = (id, v) => el.querySelectorAll('#' + id + ' .tb-sq').forEach(b2 =>
      b2.classList.toggle('on', b2.dataset.v === String(v)));
    mark('tb-rules', rules); mark('tb-who', who);
    mark('tb-speed', speed); mark('tb-lvl', level);
    mark('tb-hints', hints ? 1 : 0); mark('tb-auto', auto ? 1 : 0);
    el.querySelector('#tb-seats .val').textContent = seats;
    el.querySelector('#tb-seats button[data-d="-1"]').disabled = seats <= 2;
    el.querySelector('#tb-seats button[data-d="1"]').disabled = seats >= T.MAX_SEATS;
    /* the chairs, drawn. Sixteen chips reads as a room; "16" does not. */
    let ch = '';
    for (let i = 0; i < seats; i++) ch += '<i class="' + (i ? 'on' : 'me') + '"></i>';
    el.querySelector('#tb-chairview').innerHTML = ch;
    el.querySelector('#tb-speedrow').hidden = (who !== 'auto');
    el.querySelector('#tb-lvl').previousElementSibling &&
      (el.querySelector('#tb-lvlrow .lab i').textContent = LEVELS[level - 1] ? LEVELS[level - 1].note : '');
    const lbl = ilb('play', 'Deal the ġogs');
    el.querySelector('#tb-start').innerHTML = lbl;
    el.querySelector('#tb-start2').innerHTML = lbl;
  };

  seg('tb-rules', v => { rules = v; });
  seg('tb-who',   v => { who = v; });
  seg('tb-speed', v => { speed = +v; });
  seg('tb-lvl',   v => { level = +v; });
  seg('tb-hints', v => { hints = v === '1'; });
  seg('tb-auto',  v => { auto  = v === '1'; });
  el.querySelectorAll('#tb-seats button').forEach(b2 => b2.onclick = () => {
    seats = Math.max(2, Math.min(T.MAX_SEATS, seats + (+b2.dataset.d)));
    sfx('ui.note', { rate: 0.9 + seats / 20 });
    sync();
  });

  /* the dock: slide open on tap, remember the state in the UI-only key */
  { const dock = el.querySelector('#tb-dock');
    const grip = el.querySelector('#tb-grip');
    const dbody = el.querySelector('#tb-dockbody');
    const setDock = (isOpen, quiet) => {
      dock.classList.toggle('open', isOpen);
      dbody.hidden = !isOpen;
      grip.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      grip.setAttribute('aria-label', isOpen ? 'Close the rules' : 'Open the rules');
      if (!quiet) sfx(isOpen ? 'ui.sheet' : 'ui.back');
      try { localStorage.setItem(UI_KEY + '.rules', isOpen ? '1' : '0'); } catch(e){}
    };
    grip.onclick = () => setDock(dbody.hidden);
    let was = false;
    try { was = localStorage.getItem(UI_KEY + '.rules') === '1'; } catch(e){}
    if (was) setDock(true, true);
  }
  sync();

  el.querySelector('#pt-back').onclick = () => menu();
  const start = () => {
    T.pref({ play:'ai', mode:rules, caller:who, seats, level, speed, auto, hints });
    /* no `cards` — optsOf() takes it off the mode, and it is the only
       thing in the app allowed to decide it */
    newGame({ mode:rules, caller:who, seats, level, speed, auto });
  };
  el.querySelector('#tb-start').onclick = start;
  el.querySelector('#tb-start2').onclick = start;
}

/* ═══════════════════════════════════════════════════════════════════
   2 · THE LOBBY
   Everybody arrives, everybody says they are ready, the host starts.
   That is the shape js/mp.js's rooms are being built in, so it is the
   shape offline uses too — one code path, and the online build gets a
   lobby that has already been played on a phone.
   ═══════════════════════════════════════════════════════════════════ */
function newGame(opts){
  T.startMatch(opts);
  board();
  /* the machine seats wander in and say they are ready, one at a time,
     because sixteen names all going green on the same frame looks like
     a spreadsheet rather than a room filling up. Staggered tighter at a
     big table so a full room does not take half a minute to sit down. */
  const st = T.state();
  const n = st.seats.filter(x => x.own === 'ai').length;
  const gap = n > 8 ? 110 : 260;
  let d = 320;
  for (let i = 0; i < st.seats.length; i++){
    if (st.seats[i].own !== 'ai') continue;
    d += gap + ((i * 977) % (gap * 2));
    soon(() => { T.doMove(i, { t:'ready', v:true }, 'ai'); sfx('ui.toggle'); render(); }, d);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   3 · THE TABLE
   ═══════════════════════════════════════════════════════════════════ */
function board(){
  injectCSS();
  P.ui.sprite();
  const st = T.state();
  if (!st) { menu(); return; }
  const hall = st.opts.mode === 'hall';
  /* one sheet or the whole ġog — and now that the mode decides it (see
     optsOf() in js/tombla.js) this is exactly "is this tal-każin" */
  const gog  = st.opts.cards > 1;

  const ctx = P.ui.frame({
    title: hall ? 'Tombla tal-każin' : 'Tombla',
    onBack: () => { leave(); menu(); },
    leave,
    barCls: 'tb-bar',
    buttons: [
      { id:'tb-claim', label:'', icon:'star', cls:'ghost' },
      { id:'tb-pause', label:'', icon:'lock',  cls:'ghost sq' },
      { id:'tb-more',  label:'', icon:'menu',  cls:'ghost sq' }
    ]
  });
  /* party.js's frame is built round a chessboard and sizes an 8x8
     square into the host. A ġog is not a square, so we take the square
     sizer off and put our own stack in its place. */
  if (ctx.stopFit) ctx.stopFit();
  ctx.host.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'tb' + (gog ? ' gog' : '');
  ctx.host.appendChild(root);
  /* six kartelli need the turn strip's forty-nine pixels more than the
     turn strip needs them; everything it said moves into the caller bar */
  if (gog) ctx.root.classList.add('tbgog');
  /* A MARKER FOR OUR OWN BOARD, BOTH MODES. The landscape block below
     hides .pt-turn — and .pt-turn is js/party.js's SHARED turn strip,
     which chess, gin and GĦARRAQHOM draw too. Unqualified, that rule
     leaked: open a tombla once and chess lost "Your move" in landscape
     for the rest of the session, because our stylesheet is injected
     into the document head and never comes out. .pt-wrap is rebuilt by
     frame() on every screen, so this class cannot outlive our board. */
  ctx.root.classList.add('tbboard');
  /* and the pane gives up its reading margins for as long as a ġog is on
     it — see .tb-edge in the stylesheet. On the screen element rather
     than on ours because the margins are the screen's, and taken off
     again by leave(), which every way out of this board goes through. */
  try { if (gog) P.ui.screenEl().classList.add('tb-edge'); } catch(e){}

  U = {
    ctx, root, gog,
    seat: localSeat(),
    peek: localSeat(),
    timers: [], sheets: [],
    lastN: 0, railN: 0, ending: 0, shownCheck: 0, busy: 0, ran: 0,
    net: null, off: null
  };
  U.peek = U.seat;
  U.off = T.onState(ev => onState(ev));

  /* ── SWITCH THE ANUNZJATUR ON, OR LEAVE IT OFF ───────────────────
     T.callerSpeaks() is the single gate every caller sound in this file
     passes through, and this hands the same answer to the voice module
     so it can refuse a play on its own account too. The caller mode is
     fixed for the life of a match (it is in opts), so once here is
     enough — and switching a match off, in leave() below, stops
     whatever is talking mid-word. */
  try {
    if (window.KARTI_CALLER) window.KARTI_CALLER.setEnabled(T.callerSpeaks(st));
  } catch(e){}

  ctx.btn('tb-pause').onclick = () => onPause();
  ctx.btn('tb-more').onclick  = () => moreSheet();
  ctx.btn('tb-claim').onclick = () => onClaim();

  render();
  watchFit();
  requestAnimationFrame(fitCards);
}

/* ── what the engine just did ─────────────────────────────────────
   A call repaints the CHROME only. Nothing on a kartella changes when
   a number comes out — there is no highlight to draw and no counter to
   move — so rebuilding a hundred and sixty-two squares ninety times a
   game would be ninety repaints nobody could see. A mark repaints one
   square. The cards are only rebuilt when they are actually a
   different set of cards. */
function onState(ev){
  if (!U) return;
  const st = T.state();
  if (!st) return;
  const m = ev && ev.reason === 'move' ? ev.move : null;
  if (m){
    if (m.t === 'call'){ onCall(ev.res && ev.res.n); return; }
    if (m.t === 'mark' || m.t === 'unmark'){ touchCell(m.s, m.c, m.i); paintClaim(st); return; }
    if (m.t === 'claim'){ onShout(st); return; }
  }
  if (st.phase === 'lobby'){ render(); return; }
  /* THE CLOCK STARTS WHEN THE GAME DOES, wherever the start came from.
     It used to be started by the lobby's own START button, which is
     fine until the start arrives from somewhere else — a relayed
     {t:'start'} from the host online, or a resumed snapshot — and then
     the phone sits there with a full bag and no caller. runClock() is
     a no-op in manual and a no-op if it is already running, so asking
     twice costs nothing. */
  if (st.phase === 'play' && !U.ran){ U.ran = 1; render(); T.runClock(); return; }
  paintChrome(st);
  /* ── NOT OVER THE READ-BACK ──────────────────────────────────────
     A fatta ends the game, so the state says `done` while the winning
     kartella is still being read out number by number — and the AI
     seats have marks still landing behind it, each of which brings us
     back in here with no move on the event. This branch then put the
     RESULT SCREEN up 700ms in, measured: on a fatta the tally and its
     ticks started 1326ms BEFORE the verdict, on top of the shout, over
     the one moment of the game everybody is listening to.
     U.busy is already the flag for "a kartella is being read back" —
     onPause() has honoured it since the halt was built — and onShout()
     already ends by calling finish() itself once the box comes down.
     So while it is busy this simply stands aside; nothing is lost and
     the ending arrives on the beat it was written for. */
  if (st.phase === 'done' && !U.ending && !U.busy){ U.ending = 1; soon(finish, 700); }
}

function onCall(n){
  if (!U || !n) return;
  const st = T.state();
  U.lastN = n;
  /* ── THE PHONE ONLY SPEAKS WHEN IT IS THE ONE CALLING ────────────
     In manual a person is holding the bag and reading the number out
     to the room in Maltese. A phone talking over them is not
     atmosphere, it is a second caller, so every caller sound is gated
     on the one flag and there is exactly one place to gate it. When
     the recorded ninety land, they hook in here. */
  if (T.callerSpeaks(st)){
    sfx('tombla.call', { force:true });
    sfx('ui.note', { force:true, rate: 0.78 + (n / 90) * 0.95 });
  }
  paintChrome(st);
  const ball = U.root.querySelector('.tb-ball');
  if (ball){ ball.classList.remove('pop'); void ball.offsetWidth; ball.classList.add('pop'); }
  /* ── AND NOW THE VOICE ───────────────────────────────────────────
     AFTER the repaint, never before, and AFTER THE BAG. The number is
     on the glass first and the voice is decoration — js/tombla-caller.js
     is fire-and-forget, returns nothing, throws nothing, and is silent
     if audio/call/ is not there at all. It is gated on the same
     T.callerSpeaks() every other caller sound goes through, so manual
     mode stays completely quiet: a person is reading the numbers out
     and the phone does not talk over them.

     THE 340 IS THE POINT. It used to say the number in the same
     millisecond as the bag rattle, so the first syllable of every
     single call in the game was under 300ms of noise — the one word
     the whole screen exists to deliver, mixed into the sound of the
     token. It waits for the bag now. The wait is a tracked timer, so
     leaving the table takes it with everything else, and it checks
     that this is still the number on the ball: a call that has already
     been overtaken says nothing rather than talking over its
     successor.

     The warm() is prefetch FROM THE PAST — two numbers still in the
     bag, chosen at random. Never the next ball: view() hides the
     undrawn bag on purpose and warming the future would put call 38 in
     the network panel for an online opponent to read. See §9.4 of
     docs/TOMBLA_CALLER.md, and the module's own header. */
  if (T.callerSpeaks(st)) soon(() => {
    if (!U || U.lastN !== n) return;         /* overtaken — stay quiet */
    try {
      if (window.KARTI_CALLER){
        window.KARTI_CALLER.say(n);
        window.KARTI_CALLER.warm(st.called);
      }
    } catch(e){}
  }, SAY_AFTER_BAG);
}

/* ═══════════════════════════════════════════════════════════════════
   4 · PAINTING
   ═══════════════════════════════════════════════════════════════════ */
function render(){
  if (!U) return;
  const st = T.state();
  if (!st) return;
  if (st.phase === 'lobby'){ paintLobby(st); return; }
  paintTable(st);
}

/* ── the lobby ──────────────────────────────────────────────────
   Sixteen chairs is a list, so it scrolls INSIDE its own panel and
   never the page. Every seat that is a person on this phone is a
   button: round one phone all sixteen are, and if only the first could
   say it was ready the START button would never light. */
const initialOf = n => String(n || '?').trim().charAt(0).toUpperCase() || '?';

function paintLobby(st){
  U.ctx.root.classList.remove('tbplay');
  const me = U.seat;
  const all = st.seats.every(s => s.ready);
  const host = st.host === me;
  const manual = st.opts.caller === 'manual';
  U.root.innerHTML =
    '<div class="tb-lob">' +
      '<div class="tb-lobhead">' +
        '<h3>' + (st.opts.mode === 'hall' ? 'Vers u fatta' : 'Ambo sat-tombla') + '</h3>' +
        '<p>' + esc(st.opts.seats) + ' playing, ' +
          (st.opts.cards === 6 ? 'a full ġog of six kartelli' :
           st.opts.cards + ' kartell' + (st.opts.cards === 1 ? 'a' : 'i')) + ' each. ' +
          (manual ? esc(st.seats[st.caller].name) + ' reads the numbers out; the phone stays quiet.'
                  : 'The phone reads the numbers out.') + '</p>' +
      '</div>' +
      '<div class="tb-lobseats">' +
        st.seats.map((s, i) => {
          const mine = isLocalSeat(i);
          const tag = i === st.caller ? 'Calling'
                    : mine ? (s.ready ? 'Ready' : 'Tap when ready')
                           : (s.ready ? 'Ready' : 'Waiting');
          const body =
            '<span class="tb-av">' + esc(initialOf(s.name)) + '</span>' +
            '<b>' + esc(s.name) + (i === me ? ' (you)' : '') + '</b>' +
            '<span class="tb-tag">' + tag + '</span>';
          const cls = 'tb-lseat' + (s.ready ? ' rdy' : '') + (i === me ? ' me' : '');
          return mine
            ? '<button class="' + cls + '" data-s="' + i + '" aria-pressed="' + !!s.ready + '">' + body + '</button>'
            : '<div class="' + cls + '">' + body + '</div>';
        }).join('') +
      '</div>' +
    '</div>';

  U.root.querySelectorAll('button.tb-lseat').forEach(btn => {
    btn.onclick = () => {
      const i = +btn.dataset.s;
      const cur = T.state().seats[i].ready;
      sfx(cur ? 'ui.untoggle' : 'ui.toggle');
      T.doMove(i, { t:'ready', v: !cur }, 'tap');
      render();
    };
  });

  P.ui.setTurn(U.ctx, {
    cls:'', who: all ? 'Everybody is ready' : 'Waiting for the table',
    note: st.seats.filter(s => s.ready).length + '/' + st.seats.length
  });
  U.ctx.badge.textContent = st.opts.mode === 'hall' ? 'KAŻIN' : 'KLASSIKA';

  const claim = U.ctx.btn('tb-claim');
  const meReady = st.seats[me].ready;
  claim.className = 'btn sm ' + (all && host ? 'armed' : 'ghost');
  claim.innerHTML = (all && host)
    ? 'Start<span class="tb-sub">' + (manual ? 'then tap the bag' : 'the phone starts calling') + '</span>'
    : (meReady ? 'Not ready' : 'I am ready') +
      '<span class="tb-sub">' + (meReady ? 'changed your mind' : 'tap when you are') + '</span>';
  claim.onclick = () => {
    const s2 = T.state();
    if (s2.seats.every(x => x.ready) && s2.host === me){
      sfx('duel.start', { force:true });
      T.doMove(me, { t:'start' }, 'tap');
      T.runClock();                       /* does nothing at all in manual */
      render();
      requestAnimationFrame(fitCards);
      return;
    }
    sfx(s2.seats[me].ready ? 'ui.untoggle' : 'ui.toggle');
    T.doMove(me, { t:'ready', v: !s2.seats[me].ready }, 'tap');
    render();
  };
  const pb = U.ctx.btn('tb-pause'), mb = U.ctx.btn('tb-more');
  if (pb){ pb.disabled = true; pb.style.opacity = '.4'; pb.innerHTML = mark('tb-hold', 'Stop'); }
  if (mb) mb.innerHTML = ico('menu', 'More');
}

/* a small word over the board — never a modal, never a telling-off */
function toast(msg, bad){
  if (!U) return;
  const old = U.ctx.root.querySelector('.tb-toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'tb-toast' + (bad ? ' bad' : '');
  t.setAttribute('role', 'status');
  t.textContent = msg;
  U.ctx.root.appendChild(t);
  soon(() => { if (t.parentNode) t.remove(); }, 1750);
}

function paintTable(st){
  /* THE SIDEWAYS COMPOSITION IS FOR THE TABLE, NOT FOR THE LOBBY. Turned
     sideways .tb becomes a three-column grid and the title bar goes, and
     both of those are nonsense over a list of sixteen chairs — the lobby
     has room to spare and wants its heading. One class, put on when the
     cartelli are on screen and taken off when they are not, because the
     rules that need to know live on .pt-wrap, above us. */
  U.ctx.root.classList.add('tbplay');
  U.root.innerHTML =
    '<div class="tb-call" id="tb-callbar"></div>' +
    '<button class="tb-rail" id="tb-rail" aria-label="What has come out. Tap for the whole board."></button>' +
    '<div class="tb-cards" id="tb-cardhost"></div>' +
    '<button class="tb-mini" id="tb-mini" aria-label="the board"></button>' +
    '<div class="tb-lad" id="tb-ladder"></div>' +
    '<div class="tb-seats" id="tb-seatstrip"></div>';
  /* ONE listener for a hundred and sixty-two squares. It used to be a
     handler bound per square, which was fine for one kartella and is
     fourteen thousand bindings a game for six. */
  const host = U.root.querySelector('#tb-cardhost');
  host.onclick = e => {
    const b = e.target && e.target.closest ? e.target.closest('.tb-c[data-i]') : null;
    if (!b || !host.contains(b)) return;
    onCell(+b.dataset.c, +b.dataset.i, b);
  };
  U.root.querySelector('#tb-mini').onclick = () => { sfx('ui.sheet'); tabellone(); };
  U.root.querySelector('#tb-rail').onclick = () => { sfx('ui.sheet'); tabellone(); };
  paintCards(st);
  paintChrome(st);
  /* synchronously AND on the next frame. The rAF alone is the correct
     time to measure — the browser has laid the new stack out by then —
     but a phone that throttles frames leaves the cards at their CSS
     fallback height, which for six kartelli is a sixth one hanging off
     the bottom. Measuring twice costs nothing and cannot be skipped. */
  fitCards();
  requestAnimationFrame(fitCards);
}

/* the six kartelli */
function paintCards(st){
  const host = U.root.querySelector('#tb-cardhost');
  if (!host) return;
  const seat = st.seats[U.peek] ? U.peek : U.seat;
  const s = st.seats[seat];
  const canTap = isLocalSeat(seat) && st.phase === 'play';
  host.innerHTML = s.cards.map((cells, ci) =>
    cardHTML(st, seat, ci, cells, s.marks[ci], canTap)).join('');
  host.dataset.seat = seat;
}

/* one kartella — and NOTHING on it that tells you anything */
function cardHTML(st, seat, ci, cells, marks, canTap){
  const hint = T.pref().hints && U.lastN && st.phase === 'play';
  let out = '<div class="tb-card' + (seat !== U.seat ? ' peek' : '') +
            '" data-card="' + ci + '"><div class="tb-grid">';
  for (let i = 0; i < 27; i++){
    const n = cells[i];
    if (!n){ out += '<span class="tb-c e"></span>'; continue; }
    const on = !!marks[i];
    const ring = hint && !on && n === U.lastN;
    const cls = 'tb-c' + (on ? ' on' : '') + (ring ? ' hint' : '');
    out += canTap
      ? '<button class="' + cls + '" data-c="' + ci + '" data-i="' + i + '" ' +
        'aria-pressed="' + on + '" aria-label="' + n + (on ? ', marked' : '') + '">' +
        '<span class="tb-n">' + n + '</span></button>'
      : '<span class="' + cls + '"><span class="tb-n">' + n + '</span></span>';
  }
  return out + '</div></div>';
}

/* one square, in place — the whole of a mark's repaint */
function touchCell(seat, ci, i){
  if (!U) return;
  const host = U.root.querySelector('#tb-cardhost');
  if (!host || +host.dataset.seat !== seat) return;
  const st = T.state();
  const el = host.querySelector('.tb-c[data-c="' + ci + '"][data-i="' + i + '"]');
  if (!el) return;
  const on = !!st.seats[seat].marks[ci][i];
  el.classList.toggle('on', on);
  el.setAttribute('aria-pressed', String(on));
  if (on){ el.classList.remove('just'); void el.offsetWidth; el.classList.add('just'); }
}

/* everything that is not a kartella */
function paintChrome(st){
  if (!U) return;
  const rungs = T.rungsOf(st);
  const call = T.callOf(st, U.lastN || 0, st.calls);
  const manual = st.opts.caller === 'manual';
  const mine = st.caller === U.seat && isLocalSeat(U.seat);
  const paused = st.paused >= 0;
  const canDraw = manual && mine && !paused && st.phase === 'play' && st.bag.length;

  /* ── the bag ─────────────────────────────────────────────────────
     In manual it is the draw button; in auto it is a token; and when
     the ninetieth ball is out it becomes TEMM, for the host.

     THE EMPTY BAG NO LONGER ENDS THE GAME BY ITSELF — see finishIfDone()
     in js/tombla.js. One game in six the last of somebody's fifteen IS
     the ninetieth ball, and ending on the call that produced it took
     the tombla off them before they could put the counter down. So the
     numbers simply run out, everybody marks the last one and whoever
     has it shouts. This button is how the night finishes if nobody
     does. */
  const dry = T.bagDry(st);
  const ballIn = U.lastN ? '<b>' + U.lastN + '</b>'
                         : '<b>' + (canDraw ? 'IĠBED' : 'WAIT') + '</b>';
  const ball = canDraw
    ? '<button class="tb-ball draw" id="tb-draw" aria-label="Draw the next number">' +
      (U.lastN ? '<b>' + U.lastN + '</b>' : '<b>IĠBED</b>') + '</button>'
    : (dry && st.host === U.seat && isLocalSeat(U.seat))
      ? '<button class="tb-ball draw" id="tb-done" aria-label="The bag is empty. Finish the game.">' +
        '<b>TEMM</b></button>'
      : '<div class="tb-ball' + (U.lastN ? '' : ' none') + '">' + ballIn + '</div>';

  U.root.querySelector('#tb-callbar').innerHTML =
    ball +
    '<div class="tb-say">' +
      '<div class="tb-mt">' + esc(U.lastN ? call.mt : (canDraw ? 'tap the bag' : 'eyes down')) + '</div>' +
      '<div class="tb-laqam">' + (dry
          ? '<i>the bag is empty — mark the last one and shout</i>'
          : call.laqam
            ? esc(call.laqam) + ' <i>&middot; ' + esc(call.gloss) + '</i>'
            : '<i>' + esc(U.lastN ? 'number ' + U.lastN : 'nothing out yet') + '</i>') + '</div>' +
      '<div class="tb-joke">' + esc(dry ? 'Ninety out of ninety. Anybody?' : (call.say || '')) + '</div>' +
      statusHTML(st) +
    '</div>';
  const dr = U.root.querySelector('#tb-draw');
  if (dr) dr.onclick = () => onDraw();
  const dn = U.root.querySelector('#tb-done');
  if (dn) dn.onclick = () => {
    const r = T.doMove(U.seat, { t:'end' }, 'tap');
    if (!r.ok){ sfx('ui.error'); toast(r.why || 'No.', true); return; }
    T.stopClock();
    if (!U.ending){ U.ending = 1; finish(); }
  };

  /* ── THE RAIL ─────────────────────────────────────────────────────
     Everything that has come out, oldest on the left, NEWEST ON THE
     RIGHT, and the newest one gold. The overflow falls off the left
     edge and is clipped by the stylesheet, so it shows exactly as many
     as fit on this phone in this orientation and there is no number
     here to keep in step with a screen size.

     THE ONE JUST CALLED IS IN IT. It used to be left out — the strip
     said "before that" and started at the number before the ball —
     which meant that a number called while something else was on
     screen, a check being read back most of all, was never anywhere a
     player could see it. It was on the ball, behind an opaque overlay,
     for four seconds, and then gone. That is the number he could not
     find. It is in the rail now, and it stays there. */
  const seen = st.called.slice(-24);
  const newest = seen.length ? seen[seen.length - 1] : 0;
  const fresh = newest && U.railN !== newest;
  U.railN = newest;
  U.root.querySelector('#tb-rail').innerHTML = seen.length
    ? seen.map((n, k) =>
        '<span' + (k === seen.length - 1 ? ' class="now' + (fresh ? ' just' : '') + '"' : '') +
        '>' + n + '</span>').join('')
    : '<em>nothing out of the bag yet</em>';

  /* the board, in miniature */
  const out = {};
  for (const n of st.called) out[n] = 1;
  const last = st.called[st.called.length - 1];
  let g = '';
  for (let n = 1; n <= 90; n++) g += '<i class="' + (out[n] ? (n === last ? 'l' : 'o') : '') + '"></i>';
  U.root.querySelector('#tb-mini').innerHTML = g;

  /* the ladder */
  const lad = U.root.querySelector('#tb-ladder');
  lad.className = 'tb-lad n' + rungs.length;
  lad.innerHTML = rungs.map(k => rungHTML(st, k)).join('');

  /* the room (hidden in ġog mode — there is no room for it) */
  const strip = U.root.querySelector('#tb-seatstrip');
  strip.innerHTML = st.seats.map((x, i) =>
    '<button class="tb-seat' + (i === U.seat ? ' you' : '') + (x.won.length ? ' hasw' : '') +
      (i === U.peek && U.peek !== U.seat ? ' peeking' : '') + '" data-s="' + i + '">' +
      '<span class="tb-pip"></span><b>' + esc(x.name) + '</b>' +
      '<em>' + (x.won.length ? x.pts : '-') + '</em></button>').join('');
  strip.querySelectorAll('.tb-seat').forEach(b => {
    b.onclick = () => { sfx('ui.tap'); peekAt(+b.dataset.s); };
  });

  /* the frame */
  U.ctx.badge.textContent = st.calls + '/90';
  if (!U.gog) P.ui.setTurn(U.ctx, {
    cls:'', who: U.peek !== U.seat ? ('Looking at ' + st.seats[U.peek].name)
                                   : 'Call ' + st.calls + ' of 90',
    note: paused ? 'STOPPED' : (90 - st.calls) + ' left',
    alert: paused
  });
  paintHold(st);
  paintClaim(st);
  paintControls(st);
}

/* the status line — facts the anunzjatur says out loud anyway */
function statusHTML(st){
  const c = st.seats[st.caller];
  const bits = [];
  bits.push('<b>' + st.calls + '</b>/90');
  bits.push((90 - st.calls) + ' left');
  if (st.opts.caller === 'manual')
    bits.push('<span class="' + (st.caller === U.seat ? 'on' : '') + '">' +
      (st.caller === U.seat ? 'you are calling' : esc(c ? c.name : '?') + ' is calling') + '</span>');
  if (U.peek !== U.seat)
    bits.push('<span class="on">' + esc(st.seats[U.peek].name) + '’s ' +
              (st.opts.cards > 1 ? 'ġog' : 'kartella') + '</span>');
  if (st.paused >= 0) bits.push('<span class="hot">stopped</span>');
  return '<div class="tb-stat">' + bits.join('<span>&middot;</span>') + '</div>';
}

/* ── the paused banner ────────────────────────────────────────────
   A stalled caller must never read as a bug, and there are now two
   reasons it can be stalled. The banner says which:

     the host stopped it   "Stopped by Karm · keep marking"
     a shout stopped it    "Rita shouted VERS · the host starts us
                            again" — because after the kartella has
                            been read back the room is looking at a
                            screen that has gone quiet on purpose, and
                            the one thing everybody needs to know is
                            who is going to start it again and that
                            nothing is broken.

   They are playing for chips. A number that arrived while a prize was
   being decided is a number somebody missed, and that is worth more
   than the four seconds it costs. */
function paintHold(st){
  const old = U.ctx.root.querySelector('.tb-hold');
  if (st.paused < 0){ if (old) old.remove(); return; }
  const by = st.seats[st.paused];
  const host = st.seats[st.host];
  let txt;
  if (st.hold === 'claim'){
    const v = st.check;
    const nm = v ? T.prizeName(st, v.prize) : '';
    txt = (st.paused === U.seat ? 'You' : (by ? by.name : 'Somebody')) +
          ' shouted' + (nm ? ' ' + nm : '') + ' · ' +
          (st.host === U.seat ? 'start us again when the room is ready'
                              : (host ? host.name : 'the host') + ' starts us again');
  } else {
    txt = 'Stopped by ' + (st.paused === U.seat ? 'you' : (by ? by.name : 'the host')) +
          ' · keep marking';
  }
  if (old){ old.textContent = txt; return; }
  const el = document.createElement('div');
  el.className = 'tb-hold';
  el.setAttribute('role', 'status');
  el.textContent = txt;
  U.ctx.root.appendChild(el);
}

function peekAt(i){
  if (!U) return;
  U.peek = i;
  paintCards(T.state());
  paintChrome(T.state());
  fitCards();
  requestAnimationFrame(fitCards);
}

/* one rung of the ladder */
function rungHTML(st, k){
  const pz = st.prizes[k];
  const nm = T.prizeName(st, k);
  let cls = 'tb-rung', who = T.prizeAt(k).need ? (T.prizeAt(k).need + ' on a row') : 'all 15';
  if (pz.done){
    const s = st.seats[pz.seat];
    cls += ' won' + (pz.seat === U.seat ? ' mine' : '');
    who = pz.seat === U.seat ? 'YOU' : s.name;
  } else if (pz.void){ cls += ' void'; who = 'nobody'; }
  else cls += ' live';
  return '<div class="' + cls + '"><b>' + esc(nm) + '</b><i>' + esc(who) + '</i></div>';
}

/* ── the shout button ─────────────────────────────────────────────
   It arms on YOUR OWN COUNTERS, not on the truth. If you have put five
   on a row then as far as your kartella is concerned you have a
   ċinkwina and you are entitled to shout — and if one of them never
   came out, the room will tell you in front of everybody. An engine
   that armed only on a true claim would be doing your checking for
   you, and the check is the best moment in the game. */
function claimState(st, seat){
  const s = st.seats[seat];
  if (!s || st.phase !== 'play') return null;
  for (const k of T.rungsOf(st)){
    const pz = st.prizes[k];
    if (pz.off || pz.done || pz.void) continue;
    for (let c = 0; c < s.cards.length; c++)
      if (T.holds(s.cards[c], s.marks[c], k) >= 0) return { ready:true, key:k, card:c };
  }
  for (const k of T.rungsOf(st)){
    const pz = st.prizes[k];
    if (pz.off || pz.done || pz.void) continue;
    return { ready:false, key:k };
  }
  return null;
}

function paintClaim(st){
  const b = U.ctx.btn('tb-claim');
  if (!b) return;
  b.onclick = () => onClaim();
  const seat = isLocalSeat(U.peek) ? U.peek : U.seat;
  const cs = claimState(st, seat);
  if (!cs){
    b.className = 'btn sm ghost idle';
    b.innerHTML = 'Waiting<span class="tb-sub">the game is over</span>';
    return;
  }
  const nm = T.prizeName(st, cs.key);
  if (cs.ready){
    b.className = 'btn sm armed';
    b.innerHTML = esc(nm) + '!<span class="tb-sub">shout it before somebody else does</span>';
  } else {
    /* NO DISTANCE. "three to go" was a helper and it is gone; this
       only names the rung that is up for grabs, which the ladder
       strip above says anyway. */
    b.className = 'btn sm ghost idle';
    b.innerHTML = esc(nm) + '<span class="tb-sub">not yet</span>';
  }
}

/* ── the taps ───────────────────────────────────────────────────── */
function tapSeat(){ return isLocalSeat(U.peek) ? U.peek : U.seat; }

function onCell(ci, i, el){
  const st = T.state();
  if (!st || st.phase !== 'play') return;
  const seat = tapSeat();
  const on = !!st.seats[seat].marks[ci][i];
  const r = T.doMove(seat, { t: on ? 'unmark' : 'mark', c:ci, i }, 'tap');
  if (!r.ok){ sfx('ui.error'); return; }
  /* the quietest sound in the registry, and NOT forced — a mark now
     happens ninety times a game instead of fifteen, and the dedupe
     window is exactly what stops a fast hand turning it into a rattle */
  sfx(on ? 'ui.untoggle' : 'tombla.mark');
  /* onState repaints the one square; nothing else on screen moves */
}

function onDraw(){
  const st = T.state();
  if (!st || st.phase !== 'play') return;
  const r = T.drawOne(st.caller);
  if (!r.ok){ sfx('ui.error'); toast(r.why || 'Not now.', true); }
}

function onPause(){
  const st = T.state();
  if (!st || st.phase !== 'play') return;
  /* NOT WHILE A KARTELLA IS BEING READ BACK. The check overlay does not
     take taps (pointer-events:none, so the board underneath keeps its
     scroll), which leaves this button live behind it — and a host who
     taps GO in the middle of a read-back sends the next number out over
     a prize that has not been settled. The whole point of the halt is
     that nothing moves until it is proven. */
  if (U.busy){
    sfx('ui.error');
    toast('Wait — the kartella is being read back.', true);
    return;
  }
  /* THE PAUSE BELONGS TO WHOEVER IS CALLING, and to the host. They are
     the two people who can actually stop the numbers: the caller
     because they are the one who has stopped talking, the host because
     it is their room and a caller who wanders off must be stoppable.
     END and TRANSFER stay with the host alone — they are decisions
     about the game rather than about its tempo. */
  const me = U.seat;
  if (me !== st.host && me !== st.caller){
    sfx('ui.error');
    toast('Only whoever is calling can stop the game.', true);
    return;
  }
  const r = T.setPaused(me, st.paused < 0);
  if (!r.ok){ sfx('ui.error'); return; }
  sfx(T.isPaused() ? 'ui.untoggle' : 'ui.toggle');
  paintChrome(T.state());
}

function paintControls(st){
  const pb = U.ctx.btn('tb-pause');
  const mb = U.ctx.btn('tb-more');
  if (!pb || !mb) return;
  const me = U.seat;
  const may = (me === st.host || me === st.caller) && st.phase === 'play';
  pb.className = 'btn sm ghost sq' + (st.paused >= 0 ? ' on' : '');
  pb.innerHTML = mark(st.paused >= 0 ? 'tb-go' : 'tb-hold',
                      st.paused >= 0 ? 'Carry on' : 'Stop the caller');
  pb.disabled = !may;
  pb.style.opacity = may ? '' : '.4';
  mb.innerHTML = ico('menu', 'More');
}

/* ── MORE: everything that is not wanted in a hurry ───────────────
   One tap deeper, in a bottom sheet the thumb can reach and dismiss
   without moving, and it never costs the ġog a pixel because it is not
   on the board at all. */
function sheet(title, rows){
  if (!U) return null;
  closeSheets();
  const box = document.createElement('div');
  box.className = 'tb-sheet pt-over';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', title);
  box.innerHTML = '<div class="tb-sheetbox"><h4>' + esc(title) + '</h4>' +
    rows.map((r, k) => r.sep ? '<div class="sep"></div>' :
      '<button class="tb-item' + (r.cls ? ' ' + r.cls : '') + '" data-k="' + k + '">' +
        ico(r.icon || 'arrow-right') + '<b>' + esc(r.label) + '</b>' +
        (r.note ? '<i>' + esc(r.note) + '</i>' : '') + '</button>').join('') +
    '</div>';
  U.ctx.root.appendChild(box);
  U.sheets.push(box);
  box.onclick = e => { if (e.target === box) closeSheets(); };
  box.querySelectorAll('.tb-item').forEach(btn => {
    btn.onclick = () => {
      const r = rows[+btn.dataset.k];
      sfx('ui.tap');
      if (!r.keep) closeSheets();
      if (r.go) r.go();
    };
  });
  return box;
}
function closeSheets(){
  if (!U) return;
  for (const b of U.sheets) if (b.parentNode) b.remove();
  U.sheets = [];
}

function moreSheet(){
  const st = T.state();
  if (!st) return;
  sfx('ui.sheet');
  const me = U.seat;
  const rows = [
    { label:'It-tabellone', note:st.called.length + ' of 90 out', icon:'book', go:tabellone },
    { label:'Min hu magħna', note:st.seats.length + ' playing', icon:'users', go:roomSheet }
  ];
  /* the ball is only a thing you can give away when a PERSON is
     reading the numbers out. In auto the phone is calling and there is
     nothing to hand over, so it is hidden rather than greyed. */
  if (st.opts.caller === 'manual' && (me === st.host || me === st.caller))
    rows.push({ label:'Agħti l-ballun', icon:'arrow-right',
                note: st.caller === me ? 'you are calling' : st.seats[st.caller].name,
                go: ballSheet });
  if (me === st.host){
    rows.push({ sep:true });
    rows.push({ label:'Temm il-logħba', note:'end it for everybody', icon:'close', cls:'bad',
                go: confirmEnd });
  }
  sheet('More', rows);
}

function roomSheet(){
  const st = T.state();
  const tab = T.table(st);
  sheet('Min hu magħna', tab.map(r => ({
    label: r.name + (r.seat === U.seat ? ' (you)' : ''),
    note: r.won.length ? r.won.map(k => T.prizeName(st, k)).join(', ').toLowerCase() : '-',
    icon: r.seat === st.caller ? 'star' : 'users',
    cls: r.seat === U.seat ? 'on' : '',
    go: () => peekAt(r.seat)
  })));
}

/* ── handing the ball on ───────────────────────────────────────── */
function ballSheet(){
  const st = T.state();
  const rows = st.seats.map((x, i) => ({
    label: x.name + (i === U.seat ? ' (you)' : ''),
    note: i === st.caller ? 'holding it' : (isLocalSeat(i) ? 'on this phone' : ''),
    icon: i === st.caller ? 'star' : 'users',
    cls: i === st.caller ? 'on' : '',
    /* a machine seat cannot read numbers out to a room, so it is not
       offered the ball. The ENGINE allows it — `own` is transport
       metadata and is not in the move log, so a rule that read it would
       refuse on replay what it allowed live — which is why the keeping
       of the ball away from a machine is done here, on the screen. */
    go: () => {
      if (!isLocalSeat(i) && st.seats[i].own === 'ai'){
        sfx('ui.error'); toast('The machine cannot read them out to you.', true); return;
      }
      const r = T.hooks.setCaller(U.seat, i);
      if (!r.ok){ sfx('ui.error'); toast(r.why || 'No.', true); return; }
      sfx('ui.toggle');
      toast(i === U.seat ? 'You have the ball.' : st.seats[i].name + ' has the ball.');
      paintChrome(T.state());
    }
  }));
  sheet('Who reads them out', rows);
}

function confirmEnd(){
  P.ui.confirm(U.ctx, {
    head:'End the tombla?',
    why:'Nobody wins. It stops for everybody at the table.',
    yes:'End it', no:'No, carry on',
    go: () => {
      const r = T.doMove(U.seat, { t:'end' }, 'tap');
      if (!r.ok){ sfx('ui.error'); toast(r.why || 'No.', true); return; }
      T.stopClock();
      if (!U.ending){ U.ending = 1; finish(); }
    }
  });
}

/* ── the shout ───────────────────────────────────────────────────── */
function onClaim(){
  const st = T.state();
  if (!st || st.phase !== 'play' || U.busy) return;
  const seat = tapSeat();
  const cs = claimState(st, seat);
  if (!cs) return;
  if (!cs.ready){
    /* NOT an engine call. A thumb landing on the wrong button must
       never cost a real player the lockout — that rule is there for a
       modified client hammering the wire, not for a mis-tap. */
    sfx('ui.error');
    toast('Mhux għadu. Not yet.', true);
    return;
  }
  const r = T.doMove(seat, { t:'claim', c:cs.card, p:cs.key }, 'tap');
  if (!r.ok){ sfx('ui.error'); toast(r.why || 'Refused.', true); }
}

/* ═══════════════════════════════════════════════════════════════════
   THE CHECK — the room goes quiet
   ───────────────────────────────────────────────────────────────────
   Somebody shouts and the caller reads their kartella back, number by
   number, while everybody waits. That pause is the best thing in
   tombla and it is the only reason free marking is worth having.

   EVERY PHONE PLAYS IT. The verdict is in the state, computed by each
   phone from the same call history, so all sixteen watch the same card
   get read back and see the same answer land. A check only the
   claimant sees is not drama, it is a private argument.

   THE TIMING, chosen by playing it rather than by taste:
     350ms   the name goes up and the room shuts up
     150ms   per number for a line — five numbers is three quarters of
             a second, which is about how fast a person reads them out
      95ms   per number for a tombla, because fifteen at 150 is four
             seconds and by number nine you want it over
     1500ms  the verdict, held long enough to read and to enjoy
   A line runs about 2.6s and a tombla about 3.3s. Two seconds felt
   like a loading spinner; four felt like being told off.

   IT PLAYS IN BOTH CALLING MODES. Manual silences the ANUNZJATUR
   because a person is doing that job — but nobody in the room is
   adjudicating, the game is, so the check speaks for itself either
   way. `tombla.near`, which lost its job when the one-away nag was
   taken out, is the suspense sting here: it is a held rising tension
   note and this is exactly the moment it was made for.
   ═══════════════════════════════════════════════════════════════════ */
/* which of the seven shout files this rung is, in this mode. The same
   swap js/tombla.js's shoutOf() makes on screen, so the voice and the
   caption can never name the prize two different things. */
function shoutKey(st, key){
  if (st.opts.mode !== 'hall') return key;
  if (key === 'cinkwina') return 'vers';
  if (key === 'tombla')   return 'fatta';
  return key;
}

function onShout(st){
  const v = st.check;
  if (!U || !v || v.id === U.shownCheck) { paintChrome(st); return; }
  U.shownCheck = v.id;
  U.busy = 1;

  const who = st.seats[v.seat];
  const mine = v.seat === U.seat;
  const nm = T.prizeName(st, v.prize);
  const read = v.read || [];
  const ghosts = {};
  for (const n of (v.ghosts || [])) ghosts[n] = 1;
  const step = v.prize === 'tombla' ? 95 : 150;

  /* if the card being read back is on screen, ring it */
  const card = U.root.querySelector('.tb-card[data-card="' + v.card + '"]');
  if (card && U.peek === v.seat) card.classList.add('reading');

  const box = document.createElement('div');
  box.className = 'tb-chk';
  box.setAttribute('role', 'status');
  /* WHICH OF THE SIX. A prize is always ON ONE CARTELLA — a row of that
     one, or that one filled — and with a ġog in front of you the first
     question anybody asks is "which ticket?". The engine has always
     known (st.check.card); it was simply never said. On one kartella
     there is nothing to say, so nothing is said. */
  const total = st.seats[v.seat] ? st.seats[v.seat].cards.length : 1;
  /* ON ITS OWN LINE. All of it on one was forty-seven characters of
     spaced caps running the whole width of the phone and butting into
     the numbers underneath — and the one word in it anybody needs, the
     KARTELLA NUMBER, was at the far end of it. */
  const which = total > 1 ? '<i>kartella ' + (v.card + 1) + ' ta\' ' + total + '</i>' : '';
  box.innerHTML =
    '<div class="who">Checking <b>' + esc(mine ? 'your' : who.name + '’s') + '</b> kartella' +
      ' &middot; ' + esc(nm) + which + '</div>' +
    '<div class="read">' + read.map(n => '<span data-n="' + n + '">' + n + '</span>').join('') +
      (read.length ? '' : '<span class="ghost">-</span>') + '</div>' +
    '<div class="say" id="tb-say"></div>' +
    '<div class="sub" id="tb-sub"></div>';
  U.ctx.root.appendChild(box);
  sfx('tombla.near', { force:true });

  const chips = [].slice.call(box.querySelectorAll('.read span[data-n]'));
  chips.forEach((c, k) => soon(() => {
    const n = +c.dataset.n;
    c.classList.add(ghosts[n] ? 'ghost' : 'lit');
    if (ghosts[n]) sfx('ui.error');
    else sfx('ui.note', { force:true, gain:0.5, rate: 0.9 + (k / Math.max(1, chips.length)) * 0.7 });
  }, 350 + k * step));

  const done = 350 + chips.length * step + 260;
  soon(() => {
    const say = box.querySelector('#tb-say'), sub = box.querySelector('#tb-sub');
    if (v.ok){
      say.className = 'say';
      say.textContent = nm + (mine ? ' — YOU' : ' — ' + who.name.toUpperCase());
      sub.textContent = v.line;
      sfx('tombla.shout', { force:true });
      /* the anunzjatur shouts the prize too, under the same gate and by
         its MODE NAME: a każin hears VERS and FATTA, and the seven
         shout files carry both sets. Silent in manual — a person is
         doing the shouting, and they are already halfway out of their
         chair.
         AFTER THE STING, not on top of it: the sting is 450ms of body
         and the shout is one word, and played together they were one
         noise in which neither could be made out. Sting, then the word.
         See SAY_AFTER_STING. */
      if (T.callerSpeaks(st)) soon(() => {
        try {
          if (window.KARTI_CALLER) window.KARTI_CALLER.shout(shoutKey(st, v.prize));
        } catch(e){}
      }, SAY_AFTER_STING);
      /* and the fanfare last, and only for the fatta. At 300 it started
         inside both the sting and the word — a two-and-a-quarter second
         file laid over the half second the whole game is building to.
         At 1000 its body runs 1000-1900, which lands its last note on
         the result screen going up. */
      if (v.prize === 'tombla')
        soon(() => sfx(mine ? 'duel.win' : 'duel.lose', { force:true }), FANFARE_AFTER_SAY);
    } else {
      say.className = 'say no';
      say.textContent = 'LE';
      sub.textContent = v.line;
      sfx('ui.error', { force:true });
    }
  }, done);

  soon(() => {
    if (box.parentNode) box.remove();
    if (card) card.classList.remove('reading');
    U.busy = 0;
    const s2 = T.state();
    if (!s2) return;
    paintChrome(s2);
    if (s2.phase === 'done' && !U.ending){ U.ending = 1; soon(finish, 400); }
  }, done + 1500);
}

/* ── it-tabellone: all ninety, and what has gone ─────────────────── */
function tabellone(){
  if (!U) return;
  const st = T.state();
  const old = U.ctx.root.querySelector('.tb-board');
  if (old){ old.remove(); return; }
  const out = {};
  for (const n of st.called) out[n] = 1;
  const last = st.called[st.called.length - 1];
  let g = '';
  for (let n = 1; n <= 90; n++)
    g += '<span class="tb-b' + (out[n] ? (n === last ? ' out last' : ' out') : '') + '">' + n + '</span>';
  const box = document.createElement('div');
  /* pt-over as well as tb-board, and not for the look: js/party.js's
     one Escape handler closes the topmost `.pt-over` before it reaches
     for the back arrow. Without that class, Escape (and a hardware
     back) walked out of the whole game to close a panel. Our own rules
     are injected after party.js's, so the look is still ours. */
  box.className = 'tb-board pt-over';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'The board, one to ninety');
  box.innerHTML =
    '<h3>It-tabellone</h3>' +
    '<p>' + st.called.length + ' out, ' + (90 - st.called.length) + ' still in the bag. ' +
      'The last one is the gold one.</p>' +
    '<div class="tb-bgrid">' + g + '</div>' +
    '<button class="btn ghost" id="tb-bclose">' + ilb('close', 'Back to the kartella') + '</button>';
  U.ctx.root.appendChild(box);
  const shut = () => { sfx('ui.back'); box.remove(); };
  box.querySelector('#tb-bclose').onclick = shut;
  /* tapping the dark part shuts it too — the panel is a glance, not a
     screen, and making somebody find a button to stop glancing is how
     you get people who never open it again */
  box.onclick = e => { if (e.target === box) shut(); };
}

/* ═══════════════════════════════════════════════════════════════════
   5 · THE END
   ═══════════════════════════════════════════════════════════════════ */
function finish(){
  if (!U) return;
  closeSheets();
  if (U.overDone) return;                                /* rebbieħ already up */
  if (U.ctx.root.querySelector('.pt-over')) return;      /* already shown */
  const st = T.state();
  const o = T.over(st);
  if (!o) return;
  T.stopClock();
  const me = st.seats[U.seat];
  const wonTombla = st.prizes.tombla.done && st.prizes.tombla.seat === U.seat;
  const tone = wonTombla ? 'win' : (me.won.length ? 'draw' : 'lose');
  const winner = st.seats[o.seat];

  /* ── WHICH SCREEN, AND WHO PAYS ──────────────────────────────────
     A night with a REBBIEĦ on it — somebody shouted TOMBLA, or the bag
     ran flat with real points on the table — finishes into the shared
     winner screen: sixteen ġogs ranked is exactly the podium's game.
     A night the HOST CALLED OFF keeps the plain card ("nobody wins" is
     not a ceremony), and so does a flat bag where nobody took anything.

     THE MONEY MUST MOVE EXACTLY ONCE. Today's funnel is the record book:
     KARTI_STATS.record below carries the match id into progress.js and
     pays under it. On the REBBIEĦ path we call awardPlay FIRST, under
     the SAME match id — so the record book's own payment lands on
     'already' (progress.js remembers ids across reloads) while the book
     still counts the game and the streak — and we get the figures back
     to draw. The P.ui.result wrapper never fires on this path, which
     also retires its id-less echo. On the CARD path nothing changes.
     `ranked` is true only when mp.js says a real pot is on the table.
     U.overDone above is the once-only latch for this whole block. */
  const R2 = window.KARTI_REBBIEH;
  const topPts = st.seats.reduce((m, s) => Math.max(m, s.pts | 0), 0);
  const useReb = !!(R2 && R2.show) &&
                 (o.end === 'tombla' || (o.end === 'flat' && topPts > 0));
  const MPX = window.KARTI_MP;
  const staked = !!(MPX && MPX.MP && MPX.MP.stakeLive);
  let pay = null;
  if (useReb){
    U.overDone = true;
    if (window.KARTI_XP && KARTI_XP.awardPlay){
      try {
        const r = KARTI_XP.awardPlay({
          game:'tombla', won: tone === 'win', draw: tone === 'draw',
          id: T.hooks.matchId(), ranked: staked
        });
        if (r && r.counted) pay = r;
      } catch(e){}
    }
  }

  /* ── THE LEDGER AND THE STREAK ──────────────────────────────────
     A WIN is the tombla and nothing else — which is what makes the
     streak worth having. js/stats.js counts consecutive wins (cs) and
     the best run ever (bs), and a draw or a loss resets it, so a
     tombla streak means "I took the whole kartella N games running"
     rather than "I turned up N times". At sixteen ġogs that is a hard
     number to move and it should be.

     A "draw" is a night where you took something off the table but not
     the big one. That is a real, common and perfectly respectable
     result in tombla and it is recorded as itself rather than filed as
     a loss — you can see it on the record book as `drawn`.

     stats.js accepts an id it has never heard of and gives it its own
     row with sig:'streak', so the streak surfaces on the record book
     with nothing in that file changed. */
  T.record(tone === 'win' ? 'w' : tone === 'draw' ? 'd' : 'l');
  try {
    if (window.KARTI_STATS) KARTI_STATS.record('tombla', {
      result: tone === 'win' ? 'win' : tone === 'draw' ? 'draw' : 'loss',
      id: T.hooks.matchId(),
      moves: st.calls,
      score: me.pts
    });
  } catch(e){}
  T.saveSlot(null);

  if (useReb){ showRebbieh(st, o, tone, wonTombla, winner, pay, staked); return; }

  let streak = 0, best = 0;
  try {
    const sx = window.KARTI_STATS && KARTI_STATS.stats ? KARTI_STATS.stats('tombla') : null;
    if (sx){ streak = sx.streak || 0; best = sx.bestStreak || 0; }
  } catch(e){}

  const board = st.seats.slice().sort((a, b) => b.pts - a.pts)
    .filter(s => s.pts > 0).slice(0, 4)
    .map(s => s.name + ' ' + s.pts).join('  ·  ');

  const head = o.end === 'ended' ? 'Called off'
             : o.end === 'flat'  ? 'The bag is empty'
             : wonTombla ? (st.opts.mode === 'hall' ? 'FATTA' : 'TOMBLA')
             : 'Somebody else';
  const why = o.end === 'ended' ? 'The host ended it. Nobody wins.'
            : o.end === 'flat'  ? 'Ninety numbers and nobody shouted.'
            : wonTombla ? 'You filled the kartella on call ' + o.at + '.'
            : (winner ? winner.name : 'Somebody') + ' filled the kartella on call ' + o.at + '.';

  let quip;
  if (wonTombla && streak > 1) quip = streak + ' tombli in a row. ' + (board || '');
  else if (me.won.length) quip = 'You took ' + me.won.map(k => T.prizeName(st, k)).join(', ').toLowerCase() +
    '.' + (board ? ' ' + board : '');
  else if (me.wrong) quip = 'Nothing, and you shouted ' + me.wrong +
    (me.wrong === 1 ? ' time' : ' times') + ' when you did not have it. It happens.';
  else quip = 'Nothing at all. Somebody at this table was not looking at their ġog.';
  if (best > 1) quip += '  Best run: ' + best + '.';

  P.ui.result(U.ctx, {
    tone, head, why, quip,
    buttons: [
      { label:'Again', icon:'refresh', cls:'primary',
        go: () => { const o2 = st.opts; leave(); newGame(o2); } },
      { label:'Back', icon:'back', cls:'ghost', go: () => { leave(); menu(); } }
    ]
  });
}

/* ═══════════════════════════════════════════════════════════════════
   IR-REBBIEĦ — the shared winner screen, the best fit in the box:
   tombla is the one table that seats sixteen, and sixteen ġogs ranked
   by points IS a podium. The screen's strings are bilingual through
   KARTI_LANG (RT, because T is the engine in this file).
   ═══════════════════════════════════════════════════════════════════ */
const RT = (en, mt) => (window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en);

function showRebbieh(st, o, tone, wonTombla, winner, pay, staked){
  const R2 = window.KARTI_REBBIEH;
  if (!R2 || !R2.show || !U) return;
  const hall = st.opts.mode === 'hall';

  /* ── THE POT, when the room played for chips ─────────────────────
     Settled through mp.js's own idempotent door — the same stakeSettle()
     its wrapped P.ui.result would have reached — with the same tone
     mapping its ceremony uses, so the wallet arithmetic is identical on
     both screens: the tombla takes the pot, a lesser prize ('draw')
     brings the ante home, an empty night pays it to the winner. */
  let potRes = null;
  const MPX = window.KARTI_MP;
  if (staked && MPX && MPX.stakeSettle){
    try { potRes = MPX.stakeSettle(tone === 'win' ? 'win' : tone === 'draw' ? 'draw' : 'lose'); }
    catch(e){}
  }

  /* ── THE STANDINGS: every seat, ranked by points, the kartella's
     winner pinned first whatever the arithmetic says (ten points for
     the tombla makes that pin a formality, but a pin is honest and a
     tie is not). The score column carries WHAT each seat actually took
     — the prize names — falling back to bare points, so the list reads
     like the night: TOMBLA at the top, an AMBO here, a ĊINKWINA there.
     Avatars stay null so rebbieħ draws its initials tile. */
  const BORDER = ['gold', 'jade', 'ruby', 'ice', 'neon', 'fire', 'silver', 'bronze'];
  const tomblaSeat = (o.end === 'tombla' && winner) ? o.seat : -1;
  const rows = st.seats.map((s, i) => ({
    seat: i,
    name: s.name,
    you: i === U.seat,
    bot: s.own === 'ai',
    pts: s.pts | 0,
    prizes: (s.won || []).map(k => T.prizeName(st, k))
  }));
  rows.sort((a, b) => {
    if (a.seat === tomblaSeat) return -1;
    if (b.seat === tomblaSeat) return 1;
    if (a.pts !== b.pts) return b.pts - a.pts;
    return a.seat - b.seat;                     /* stable: ties keep seat order */
  });
  rows.forEach((r, i) => { r.place = i + 1; });

  /* the shared screen's XP block from awardPlay's figures; bar fractions
     are progress.js's private business, so the house near-full trick. */
  const xp = pay ? { level: pay.level, gained: pay.xp, leveledUp: !!pay.levelled,
                     before: 0, after: pay.levelled ? 1 : 0.7 } : null;

  /* the title is the SHOUT; the subtitle is what happened, and when the
     table played for chips the pot's landing is said here OUT LOUD as
     well as handed to the reward block, so the ceremony survives an
     older rebbieħ build that does not draw `reward` yet */
  const title = o.end === 'flat' ? RT('The bag is empty', 'Il-borża vojta')
              : wonTombla ? (hall ? 'FATTA!' : 'TOMBLA!')
              : (winner ? winner.name : RT('Somebody else', 'Ħaddieħor'));
  let sub = o.end === 'flat'
    ? RT('Ninety numbers and nobody shouted', 'Disgħin numru u ħadd ma għajjat')
    : (wonTombla ? RT('You filled the kartella on call ', 'Imlejt il-kartella fis-sejħa ') + o.at
                 : RT('Filled the kartella on call ', 'Imla l-kartella fis-sejħa ') + o.at);
  if (potRes){
    sub = potRes.kind === 'win'
      ? RT('The pot is yours: +' + potRes.pot + ' chips', 'Il-pot tiegħek: +' + potRes.pot + ' ċips')
      : potRes.kind === 'draw'
        ? RT('Your ante came home: +' + potRes.ante + ' chips', 'L-ante tiegħek ġie lura: +' + potRes.ante + ' ċips')
        : RT('Your ante went to the winner: −' + potRes.ante + ' chips',
             'L-ante tiegħek mar għand ir-rebbieħ: −' + potRes.ante + ' ċips');
  }

  /* ONLINE both doors go back to the rooms — the same exit the stop card
     uses — because a finished room rematches from its lobby. LOCAL keeps
     the card's own pair: Again re-deals the same opts, Leave is the
     tombla door. */
  const n = U.net;
  const backOnline = () => { leave(); if (n && n.onLeave) n.onLeave(); else menu(); };
  const opts2 = st.opts;

  R2.show({
    lang: (window.KARTI_LANG ? KARTI_LANG.lang() : 'en'),
    /* no `reduced` flag on purpose: rebbieħ reads body.reduced and the
       media query live by itself, the same two doors this file's own
       animations honour */
    title,
    subtitle: sub,
    rows: rows.map(r => ({
      name: r.name, place: r.place, you: r.you, bot: r.bot,
      score: r.prizes.length ? r.prizes.join(' · ') : String(r.pts),
      border: BORDER[r.seat % BORDER.length]
    })),
    xp,
    /* the reward block: all plain POSITIVE numbers per rebbieħ's contract —
       `staked` is the ante that left this wallet (rebbieħ captions it),
       `pot` only lands on the tombla (an ante refunded or lost is told in
       the subtitle; the block draws prizes, not punishments) */
    reward: (pay || potRes) ? {
      xp: pay ? pay.xp : 0,
      chips: pay ? (pay.chips | 0) + (pay.chipsLevel | 0) : 0,
      wonBonus: pay ? pay.wonBonus : 0,
      staked: potRes ? potRes.ante : 0,
      pot: (potRes && potRes.kind === 'win') ? potRes.pot : 0
    } : undefined,
    sound: id => sfx(id, { gain:0.6 }),
    playAgainLabel: n ? RT('Back to the rooms', 'Lura għall-kmamar')
                      : RT('Again', 'Erġa’'),
    onPlayAgain: n ? backOnline : () => { leave(); newGame(opts2); },
    onLeave: n ? backOnline : () => { leave(); menu(); }
  });
}

/* ═══════════════════════════════════════════════════════════════════
   6 · THE ONLINE CONTROLLER
   js/mp.js is the only caller. The shape is js/chess.js's, widened to
   N seats: start() puts a room's game on the screen, remote() takes a
   packet, note()/stop() are the two things the transport may say
   through the board screen.

   The one thing tombla adds is `callsAllowed`: exactly ONE phone in
   the room runs the clock and emits {t:'call'}. Everybody else
   receives them and checks them against their own bag.
   ═══════════════════════════════════════════════════════════════════ */
function onlineStart(cfg){
  /* cfg: {opts, seed, seats:[{name,own}], you, host, net} */
  cfg = cfg || {};
  /* THE HOST'S MODE, TRANSLATED BEFORE THE DEAL.
     js/mp.js hands the room's chosen variant straight through as
     opts.mode — but that is the ROOM'S word ('klassika' / 'kazin'), and
     js/tombla.js's optsOf() only knows the engine's ('ladder' / 'hall')
     and folds anything it does not recognise into klassika. So a każin
     room would deal one kartella. Turn the net word into the engine's
     here, once, before startMatch touches optsOf. A cfg with no mode, or
     one already in the engine's own words, is left exactly as it was. */
  const opts = Object.assign({}, cfg.opts || {});
  if (typeof opts.mode === 'string') opts.mode = netToMode(opts.mode);
  /* ── AUTO-MARK NEVER PLAYS ONLINE ─────────────────────────────────
     apply()'s auto-mark branch marks only the seats THIS phone owns
     ('me'/'hot') — per-client accessibility, correct offline. Online,
     the same {t:'call'} would then mutate a DIFFERENT seat's marks on
     every phone and the room drifts apart on the first number. mp.js
     never sends `auto`, but a cfg that ever carried it would desync
     sixteen phones at once, so it is forced off here, once, where the
     room's opts become the engine's. */
  opts.auto = false;
  /* ── THE SHARED SEED, ALWAYS ──────────────────────────────────────
     startMatch() falls back to newSeed() — Math.random, PER PHONE —
     when its seed is null. Offline that is the right deal; online it
     is sixteen different games wearing the same room. The relay's
     seed is the only seed, so coerce whatever arrived to one shared
     uint32 (absent/garbage → 0, the SAME 0 on every phone) and the
     per-client fallback can never fire from here. */
  T.startMatch(opts, cfg.seed >>> 0);
  const st = T.state();
  (cfg.seats || []).forEach((s, i) => {
    if (!st.seats[i]) return;
    T.hooks.setOwner(i, i === cfg.you ? 'me' : (s && s.own ? s.own : 'net'));
    if (s && s.name) T.hooks.setName(i, s.name);
  });
  if (typeof cfg.host === 'number') st.host = cfg.host;
  /* the ball starts with whoever the room says is calling, and falls
     back to the chair. Relayed after this as a {t:'caller'} move. */
  st.caller = (typeof cfg.caller === 'number' && st.seats[cfg.caller]) ? cfg.caller : st.host;
  /* ONLINE, THE SHARED LOBBY *IS* THE LOBBY. mp.js has already filled the
     seats, taken everyone's ready, and the host's Start button is THIS call.
     The engine's fresh seats read un-ready, so a relayed {t:'start'} would be
     refused ("somebody is not ready") and the table would hang in tombla's own
     lobby forever — the "online won't start" bug. Every phone runs onlineStart
     with the same cfg+seed, so mark the seats ready and deal straight into play
     deterministically here instead of waiting on a start move that never lands. */
  st.seats.forEach(s => { if (s) s.ready = true; });
  if (st.phase === 'lobby') st.phase = 'play';
  board();
  U.net = cfg.net || null;
  T.hooks.attachNet(cfg.net || null);
  render();
  return T.snapshot();
}
function onlineRemote(seat, move){
  if (!U) return { ok:false, why:'no tombla on the table' };
  return T.hooks.apply(seat, move);
}
function onlineNote(text, tone){ if (U) P.ui.setNet(U.ctx, text || '', tone || ''); }
function onlineStop(why, tone){
  if (!U) return;
  T.stopClock();
  P.ui.setNet(U.ctx, '', '');
  P.ui.result(U.ctx, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? 'No deal' : 'Cut off',
    why: why || 'The tombla stopped.',
    quip: 'Nothing was awarded. Nobody lost anything for a bad line.',
    buttons: [{ label:'Back to the rooms', icon:'back', cls:'primary',
                go: () => { const n = U && U.net; leave(); if (n && n.onLeave) n.onLeave(); else menu(); } }]
  });
}

P.online = P.online || {};
P.online.tombla = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  live: () => !!(U && T.hooks.live()),
  hooks: T.hooks
};

/* ═══════════════════════════════════════════════════════════════════
   6b · THE LOBBY CONTRACT
   ───────────────────────────────────────────────────────────────────
   The transport above shipped first, so js/mp.js has been able to CARRY
   a tombla for a while — but it had to guess at everything it puts on
   the screen BEFORE the first number comes out of the bag, and it
   guessed from its own fallbacks: two-to-eight chairs (the table seats
   SIXTEEN) and "Gentle / Normal / Ruthless" (the machine at this table
   is Nofs rieqda, Tal-każin and In-nanna, and it always was). Those
   three are people at a każin, not slider positions, and inventing
   English for them was the one visible downgrade in the online build.

   This is the same object IL-KIRI publishes, filled in for tombla.
   Nothing here is new mechanism — every number in it was already a
   constant in js/tombla.js or a name in the setup sheet above; all
   that was missing was saying so out loud.
   ═══════════════════════════════════════════════════════════════════ */
/* ── THE MODE, AS THE LOBBY'S WORD ────────────────────────────────
   js/tombla.js knows two modes and spells them 'ladder' (klassika, one
   kartella) and 'hall' (tal-każin, the full ġog). The shared room list
   wants a NET word per flavour and hands the host's pick straight back
   as the game's `mode` — so the net word a każin publishes must be one
   optsOf() will not silently fold into the wrong game. optsOf() reads
   'hall' as hall and EVERYTHING ELSE as ladder, which is exactly the
   trap: a net word of 'kazin' would deal klassika. So the two words the
   room speaks are kept SEPARATE from the two the engine deals, and the
   pair of one-line maps below is the only bridge between them. The room
   says 'klassika' / 'kazin' on the wire (and gets them straight back
   from applyVariant, which is what mp.js stores as MP.variant); the
   engine is only ever handed 'ladder' / 'hall', because onlineStart
   translates the net word before it can reach optsOf(). */
const NET_TO_MODE = { klassika:'ladder', kazin:'hall' };
const MODE_TO_NET = { ladder:'klassika', hall:'kazin' };
const netToMode = net => NET_TO_MODE[net] || (net === 'hall' || net === 'ladder' ? net : 'hall');
const modeToNet = mode => MODE_TO_NET[mode] || (mode === 'kazin' || mode === 'klassika' ? mode : 'kazin');

/* the mode the host has settled the online room on, as a NET word. It
   starts on the table's own default (tal-każin, T.DEFAULTS.mode) and is
   moved only by applyVariant() below — the host tapping the shared Rules
   button. currentVariant() is the fallback the room reads before anybody
   has touched it; once the host picks, mp.js's own MP.variant is the
   authority and this is left as the record of the last local choice. */
let roomVariant = modeToNet(T.DEFAULTS.mode);

const LOBBY = {
  id:'tombla',
  name:'TOMBLA',
  mt:'It-tombla',

  /* SEATS. Two to sixteen, and the sixteen is the point.
     Nobody in tombla waits for a turn — every phone marks its own ġog
     against the same number — so the table costs nothing to widen and
     gets better as it does: a ċinkwina among sixteen ġogs is a race,
     among three it is a formality. Sixteen is T.MAX_SEATS in
     js/tombla.js and it is what the relay seats; two is the floor
     because somebody has to be shouting at somebody. */
  minSeats: 2,
  maxSeats: T.MAX_SEATS,

  /* the machine, by name. These are the three from the setup sheet
     above, shared rather than copied, so the room list and the offline
     screen can never call the same player two different things. */
  levels: LEVELS.map(L => ({ level:L.k, name:L.name, note:L.note })),
  defaultLevel: T.DEFAULTS.level,

  /* an AI seat is ready the instant it exists and never holds a table up */
  isReady: seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,

  /* why this table cannot go yet, in words that can be put straight on
     the screen */
  canStart(seatList){
    const n = (seatList || []).length;
    if (n < 2) return { ok:false, why:'Somebody has to be shouting at somebody.' };
    if (n > T.MAX_SEATS)
      return { ok:false, why:'Sixteen ġogs is as many as one bag can feed.' };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready)
      return { ok:false, why:unready + (unready > 1 ? ' people are' : ' person is') +
                             ' not ready yet.' };
    return { ok:true, why:'' };
  },

  rulesHTML: rulesPanel,
  blurb:'A ġog of six kartelli, ninety numbers, and you mark every one yourself. ' +
        'Up to sixteen of you at once, and nobody ever waits for a turn.',

  /* THE HOST-CHANGEABLE MODE, ON THE SHARED RULES BUTTON.
     Publishing this list is all it takes for js/mp.js to grow the Rules
     button in the room and let the host swap KLASSIKA for TAL-KAŻIN in
     place — the każin/klassika choice the setup sheet makes offline,
     made online without a settings wall. The net words are the room's
     ('klassika' / 'kazin'); the engine only ever sees 'ladder' / 'hall',
     because onlineStart translates them (see netToMode). The order is
     tal-każin first because it is the table's default and the game Malta
     actually plays. */
  variants: [
    { net:'klassika', label:{ en:'Klassika',  mt:'Klassika'  } },
    { net:'kazin',    label:{ en:'Tal-każin', mt:'Tal-każin' } }
  ],
  /* which flavour the room is on, as the room's word. mp.js prefers its
     own MP.variant once the host has picked; this is the fallback before
     anybody has, and it is the table's default (tal-każin). */
  currentVariant(){ return roomVariant; },
  /* the host picked one. Remember it and hand the SAME net word back —
     mp.js stores that as MP.variant and puts it on the wire, and
     onlineStart turns it into the engine's real mode at deal time. */
  applyVariant(net){
    if (net === 'klassika' || net === 'kazin') roomVariant = net;
    return { variant: roomVariant };
  },

  /* the offline twin of the room, for anything that wants to open a
     tombla from a seat list rather than from the setup sheet */
  start(seats, opts){
    const o = Object.assign({}, T.DEFAULTS, opts || {});
    o.seats = Math.max(2, Math.min(T.MAX_SEATS, (seats || []).length || o.seats));
    const lv = (seats || []).map(s => s && s.level).find(v => v);
    if (lv) o.level = lv;
    return newGame(o);
  },

  /* THE NAME IS NEVER ASKED FOR. He is signed in and the app already knows
     who he is. A guest is "You" rather than the word "Guest", which reads
     like a bug on a results board. Same rule as IL-KIRI's myName(). */
  myName(){
    try {
      const n = K && K.displayName && K.displayName();
      if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
        return String(n).trim().slice(0, 14);
    } catch(e){}
    return 'You';
  },

  /* HOW A TOMBLA MOVE FOLDS ONTO THE RELAY'S FIVE FIELDS.
     js/mp.js carries this list in a table of its own with a comment
     saying it belongs here instead. It does. Same order, so a phone on
     the old build and a phone on this one still understand each other
     byte for byte — the codec is positional and reordering it would
     silently swap two fields on the wire.
     js/tombla.js "THE MOVES": ready{s,v} start{} call{k,n} mark{s,c,i}
     unmark{s,c,i} claim{s,c,p} quit{s} caller{s,to} pause{s,v}. */
  wire: { fields: ['s', 'v', 'k', 'n', 'c', 'i', 'p', 'to'] },

  /* NO TAKEBACK, AND THAT IS A RULE RATHER THAN AN OMISSION.
     There is nothing to take back. A counter on the wrong square is
     yours alone until you shout on it — unmark is a legal move, it is
     instant, it is private, and nobody else's screen so much as
     flickers. Asking sixteen people for permission to un-tap your own
     square would be the worst button in the app. */
  takeback: false,
};

/* ═══════════════════════════════════════════════════════════════════
   7 · ON THE SHELF
   The tile carries the lobby contract too, so js/mp.js can read the
   seat range, the machine's names and the rules panel straight off the
   shelf without knowing this file exists.
   ═══════════════════════════════════════════════════════════════════ */
P.register({
  id:'tombla', order:25, kind:'board', cat:'board',
  name:'TOMBLA', mt:'It-tombla', sprite:'tb-mark', status:'live',
  get tag(){
    return 'A ġog of six kartelli, ninety numbers, and you mark every one yourself. ' +
      'Up to sixteen of you at once, and nobody ever waits for a turn.' +
      (T.savedSlot() ? ' There is one half-called.' : '');
  },
  open: menu,
  seats: { min: LOBBY.minSeats, max: LOBBY.maxSeats },
  levels: LOBBY.levels,
  rulesHTML: rulesPanel,
  start: (seatList, o) => LOBBY.start(seatList, o)
});

/* js/mp.js looks for the contract on window.KARTI_TOMBLA — which is the
   ENGINE's object, published by js/tombla.js. The lobby is a screen
   concern and its words live in this file, so it is hung on there from
   here rather than moved. */
T.lobby = LOBBY;

window.KARTI_TOMBLA_UI = { open: menu, board, leave, injectCSS };
T.open = menu;                    /* KARTI_TOMBLA.open() — the asked-for entry point */

/* the shelf is painted by js/party.js before anything of ours has been
   on screen, and its tile references our mark by id, so the symbol
   sheet has to be in the document from the moment this file loads */
if (document.body) injectSprite();
else document.addEventListener('DOMContentLoaded', injectSprite);

/* nothing else at the foot of this file — the caller module's safety
   net lives beside injectCSS(), which is the one thing both the setup
   sheet and the board call before they draw anything. */

/* ── test hooks — inert unless the page is opened with ?pttest ──── */
try {
  if (String(location.search).indexOf('pttest') >= 0){
    window.__TB_UI = {
      U: () => U,
      menu, board, newGame, render, finish,
      seat: () => (U ? U.seat : -1),
      peek: n => { if (U){ U.peek = n; render(); } },
      cell: (ci, i) => { if (!U) return;
        const el = U.root.querySelector('.tb-c[data-c="' + ci + '"][data-i="' + i + '"]');
        onCell(ci, i, el); },
      claim: () => onClaim(),
      draw: () => onDraw(),
      pause: () => onPause(),
      more: moreSheet, ball: ballSheet, room: roomSheet, endGame: confirmEnd,
      peekAt,
      claimState: () => { const st = T.state(); return st ? claimState(st, U.seat) : null; },
      tabellone,
      fit: fitCards
    };
  }
} catch(e){}

})();

/* ═══════════════════════════════════════════════════════════════════
   TOMBLA — THE KIT SHELF (purely cosmetic, always)
   Ticket papers, markers and caller's balls, declared through
   KARTI_XP.register() and applied one scope down from the stock
   palette: a ticket is a re-declaration of the paper variables on
   #app #scr-party .tb, a marker overrides the bean variables plus the
   one hardcoded highlight in the disc's ::before, and a ball redraws
   the caller's sphere — carefully scoped :not(.none):not(.draw) so
   the empty socket and the DRAW button keep their own dress. The
   style node is re-appended on every change so it always lands after
   injectCSS()'s sheet; an empty shelf is an empty sheet: stock.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ink stays at or past 7:1 on paper — the numbers are the game */
var TICKETS = {
  'tombla.ticket.bahar':   { paper:'#DCEBF5', paper2:'#C8DDEC', blank:'#B4CFE2',
                             ink:'#0E2A44', rule:'#2E6EA0', rule2:'#1D4A70' },
  'tombla.ticket.ward':    { paper:'#F5DCE3', paper2:'#EBC9D4', blank:'#DFB4C3',
                             ink:'#3A0F26', rule:'#A83258', rule2:'#7B1F3E' },
  'tombla.ticket.menta':   { paper:'#DCF0E2', paper2:'#C8E4D1', blank:'#B2D6BE',
                             ink:'#0D3324', rule:'#1E7A52', rule2:'#135A3A' },
  'tombla.ticket.lavanja': { paper:'#2E3442', paper2:'#262B38', blank:'#1D222D',
                             ink:'#F2F5FA', rule:'#8FA2C4', rule2:'#6C7FA0' },
  /* MALTESE SUMMER. A beach towel is bold stripes on a bleached
     ground, so the stripes are the ones nothing is ever written on:
     paper2 (the 2px gutter and the pad around the grid) carries the
     turquoise, blank (an empty square, never a number) carries the
     coral, and the header band runs coral over burnt coral. The
     squares that DO hold numbers stay bleached cream with a petrol
     ink at 14.4:1 — a towel you can still play tombla on. */
  'tombla.ticket.xugaman': { paper:'#FFF7E8', paper2:'#0F8C8C', blank:'#E8623C',
                             ink:'#14282C', rule:'#F07A3C', rule2:'#B8412A' }
};
/* hi/bean/bean2 are the disc's radial; tx is the knocked-out number */
var MARKERS = {
  'tombla.marker.fazola':  { hi:'#E4573C', bean:'#C1361F', bean2:'#8E2412', tx:'#FFF3DC' },
  'tombla.marker.zebbuga': { hi:'#8FAE3E', bean:'#5F7A22', bean2:'#3A4C12', tx:'#F4F8E0' },
  'tombla.marker.hgieg':   { hi:'#6FCDBB', bean:'#23796B', bean2:'#124940', tx:'#EAFBF7' },
  'tombla.marker.tapp':    { hi:'#5C9FE0', bean:'#2F6BB0', bean2:'#16406E', tx:'#F0F7FF' },
  'tombla.marker.munita':  { hi:'#FFDD7A', bean:'#D9A62E', bean2:'#97690F', tx:'#3A2A05' },
  /* MALTESE SUMMER. Lemon ice with the syrup run round the rim: the
     radial goes pale ice, lemon at 58%, syrup red at the edge. The
     number sits dead centre, which is lemon, so the ink is a burnt
     dark that reads 10.7:1 there and still holds 3.3:1 if a glyph's
     corner ever strays onto the syrup. */
  'tombla.marker.granita': { hi:'#FFF4B8', bean:'#F0CE3E', bean2:'#D8253C', tx:'#3A1206' }
};
/* hi/mid/lo are the ball's radial; ink is the big number on it */
var DRUMS = {
  'tombla.drum.zebbug': { hi:'#E8C89A', mid:'#C09058', lo:'#7A5024', ink:'#33200A' },
  'tombla.drum.ram':    { hi:'#FFE9A8', mid:'#E0B85C', lo:'#9C7420', ink:'#3A2A05' },
  'tombla.drum.festa':  { hi:'#9A78D8', mid:'#6B46AC', lo:'#392060', ink:'#FFD98A' },
  /* MALTESE SUMMER. A murtal caught mid-burst: white-gold spark at
     the top left, the red of the shell through the middle, the night
     it was fired into at the bottom. Burnt-dark number, 14.9:1 on the
     spark and still 4.3:1 where the red takes over. */
  'tombla.drum.nar':    { hi:'#FFF0B4', mid:'#E8452F', lo:'#2E1052', ink:'#3A0C06' }
};

function sheet(){
  var st = document.getElementById('tbx-kit-css');
  if (!st){ st = document.createElement('style'); st.id = 'tbx-kit-css'; }
  /* appendChild MOVES an existing node to the end, so this sheet is
     always later than #tb-runtime-css and its rules win. The #app
     prefix out-specifies the stock #scr-party rules. */
  document.head.appendChild(st);
  return st;
}

function apply(){
  var XP = window.KARTI_XP;
  if (!XP) return;
  var css = '';
  var t = TICKETS[XP.equipped('ticket', 'tombla') || ''];
  if (t) css += '#app #scr-party .tb{--paper:' + t.paper + ';--paper2:' + t.paper2 +
                ';--blank:' + t.blank + ';--ink:' + t.ink +
                ';--rule:' + t.rule + ';--rule2:' + t.rule2 + '}';
  var m = MARKERS[XP.equipped('marker', 'tombla') || ''];
  if (m) css += '#app #scr-party .tb{--bean:' + m.bean + ';--bean2:' + m.bean2 +
                ';--beanTx:' + m.tx + '}' +
                /* the stock disc hardcodes its #E4573C highlight, so the
                   whole gradient is restated — box-shadow, size and the
                   gog clamp all come from the stock rules untouched */
                '#app #scr-party .tb .tb-c.on::before{background:radial-gradient(' +
                'circle at 36% 28%,' + m.hi + ',' + m.bean + ' 58%,' + m.bean2 + ')}';
  var d = DRUMS[XP.equipped('drum', 'tombla') || ''];
  if (d) css += /* .none (empty socket) and .draw (the button) keep their
                   own faces — this rule must never reach them */
                '#app #scr-party .tb .tb-ball:not(.none):not(.draw){' +
                'background:radial-gradient(circle at 34% 26%,' + d.hi + ',' +
                d.mid + ' 52%,' + d.lo + ')}' +
                '#app #scr-party .tb .tb-ball:not(.none):not(.draw) b{color:' + d.ink + '}';
  sheet().textContent = css;
}

/* previews — a ticket is a little grid with real blanks, a marker is
   the disc with its number knocked out, a drum is the ball itself */
function ticketPv(t){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style',
      'display:grid;grid-template-columns:repeat(3,1fr);gap:2px;box-sizing:border-box;' +
      'width:' + s + 'px;height:' + s + 'px;padding:3px;border-radius:8px;' +
      'background:' + t.paper2 + ';border:2px solid ' + t.rule);
    var nums = ['7', '', '42', '19', '88', '', '3', '61', '90'];
    var blanks = { 1:1, 5:1 };
    for (var i = 0; i < 9; i++){
      var c = document.createElement('span');
      c.setAttribute('style',
        'display:flex;align-items:center;justify-content:center;border-radius:2px;' +
        'background:' + (blanks[i] ? t.blank : t.paper) + ';' +
        'color:' + t.ink + ';font-weight:900;font-size:7px;line-height:1');
      if (!blanks[i]) c.textContent = nums[i];
      el.appendChild(c);
    }
    return el;
  };
}

function markerPv(m){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style', 'display:flex;align-items:center;justify-content:center;' +
      'width:' + s + 'px;height:' + s + 'px');
    var d = Math.round(s * .74), disc = document.createElement('span');
    disc.setAttribute('style',
      'display:flex;align-items:center;justify-content:center;border-radius:50%;' +
      'width:' + d + 'px;height:' + d + 'px;' +
      'background:radial-gradient(circle at 36% 28%,' + m.hi + ',' + m.bean +
      ' 58%,' + m.bean2 + ');' +
      'box-shadow:inset 0 -3px 7px rgba(0,0,0,.34),inset 0 0 0 2px rgba(255,255,255,.16),' +
      '0 2px 4px rgba(0,0,0,.3);' +
      'color:' + m.tx + ';font-weight:900;font-size:' + Math.round(d * .42) + 'px;line-height:1');
    disc.textContent = '33';
    el.appendChild(disc);
    return el;
  };
}

function drumPv(d){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style', 'display:flex;align-items:center;justify-content:center;' +
      'width:' + s + 'px;height:' + s + 'px');
    var b = Math.round(s * .8), ball = document.createElement('span');
    ball.setAttribute('style',
      'display:flex;align-items:center;justify-content:center;border-radius:50%;' +
      'width:' + b + 'px;height:' + b + 'px;' +
      'background:radial-gradient(circle at 34% 26%,' + d.hi + ',' + d.mid +
      ' 52%,' + d.lo + ');' +
      'box-shadow:inset 0 -4px 7px rgba(0,0,0,.28),inset 0 0 0 2px rgba(255,255,255,.4),' +
      '0 3px 8px rgba(0,0,0,.45);' +
      'color:' + d.ink + ';font-weight:900;font-size:' + Math.round(b * .44) + 'px;line-height:1');
    ball.textContent = '90';
    el.appendChild(ball);
    return el;
  };
}

function boot(tries){
  var XP = window.KARTI_XP;
  if (!XP){ if (tries < 40) setTimeout(function(){ boot(tries + 1); }, 500); return; }
  var KIT = XP.forGame('tombla');
  KIT.register([
    { slot:'ticket', id:'tombla.ticket.bahar',   level:2,  name:'Karta tal-Baħar',
      blurb:'Sea-washed paper. The numbers float; your luck sinks.',
      preview:ticketPv(TICKETS['tombla.ticket.bahar']) },
    { slot:'ticket', id:'tombla.ticket.xugaman', level:6,  name:'Xugaman tax-Xatt',
      set:'summer',
      blurb:'The towel, laid flat and played on. Shake the sand out first.',
      preview:ticketPv(TICKETS['tombla.ticket.xugaman']) },
    { slot:'ticket', id:'tombla.ticket.ward',    level:11, name:'Karta tal-Ward',
      blurb:'Rose paper, plum ink. The nanna table expects manners.',
      preview:ticketPv(TICKETS['tombla.ticket.ward']) },
    { slot:'ticket', id:'tombla.ticket.menta',   level:26, name:'Menta Friska',
      blurb:'Mint fresh. The only clean sheet you will keep all night.',
      preview:ticketPv(TICKETS['tombla.ticket.menta']) },
    { slot:'ticket', id:'tombla.ticket.lavanja', level:44, name:'Lavanja tal-Lejl',
      blurb:'Slate with chalk-white numbers. School rules: no shouting. Ha.',
      preview:ticketPv(TICKETS['tombla.ticket.lavanja']) },

    { slot:'marker', id:'tombla.marker.fazola',  level:0,  name:'Il-Fażola',
      blurb:'The bean your nanna used. Do not eat the counters.',
      preview:markerPv(MARKERS['tombla.marker.fazola']) },
    { slot:'marker', id:'tombla.marker.granita', level:2,  name:'Granita tal-Lumi',
      set:'summer',
      blurb:'Lemon ice, red syrup on the rim. It is water by the third line.',
      preview:markerPv(MARKERS['tombla.marker.granita']) },
    { slot:'marker', id:'tombla.marker.zebbuga', level:5,  name:'Żebbuġa',
      blurb:'A green olive on every number. The brine is your problem.',
      preview:markerPv(MARKERS['tombla.marker.zebbuga']) },
    { slot:'marker', id:'tombla.marker.hgieg',   level:14, name:'Ħġieġ tal-Baħar',
      blurb:'Sea glass off the rocks. Somebody’s bottle, now your fortune.',
      preview:markerPv(MARKERS['tombla.marker.hgieg']) },
    { slot:'marker', id:'tombla.marker.tapp',    level:22, name:'Tapp Blu',
      blurb:'A bottle cap off the crate. Kinnie not included.',
      preview:markerPv(MARKERS['tombla.marker.tapp']) },
    { slot:'marker', id:'tombla.marker.munita',  level:35, name:'Munita tad-Deheb',
      blurb:'A gold coin on every number. Rich until the ticket loses.',
      preview:markerPv(MARKERS['tombla.marker.munita']) },

    { slot:'drum',   id:'tombla.drum.zebbug',    level:8,  name:'Injam taż-Żebbuġ',
      blurb:'Olive-wood numbers, polished by ninety years of thumbs.',
      preview:drumPv(DRUMS['tombla.drum.zebbug']) },
    { slot:'drum',   id:'tombla.drum.ram',       level:20, name:'Ram Ileqq',
      blurb:'Polished brass. The caller can see his face in it, poor man.',
      preview:drumPv(DRUMS['tombla.drum.ram']) },
    { slot:'drum',   id:'tombla.drum.nar',       level:22, name:'Blalen tan-Nar',
      set:'summer',
      blurb:'Firework colours. Every number sounds louder than it is.',
      preview:drumPv(DRUMS['tombla.drum.nar']) },
    { slot:'drum',   id:'tombla.drum.festa',     level:48, name:'Vjola tal-Festa',
      blurb:'Festa violet with gilded numbers. The band follows every draw.',
      preview:drumPv(DRUMS['tombla.drum.festa']) }
  ]);
  KIT.onChange(apply);
  apply();
}
boot(0);

})();
