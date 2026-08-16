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
function injectCSS(){
  try { P.ui.css(); } catch(e){}
  injectSprite();
  if (document.getElementById('tb-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'tb-runtime-css';
  st.textContent =

  /* ── the palette, in one place ── */
  '#scr-party .tb{--paper:#F6E9CC;--paper2:#EBDBB6;--blank:#DCC79C;' +
    '--ink:#2A1B0C;--rule:#A8321E;--rule2:#7B2415;' +
    '--bean:#C1361F;--bean2:#8E2412;--beanTx:#FFF3DC;' +
    '--ball:#FFF6E2;--live:#3DDC84;--warn:#FF5468}' +

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

  /* the last few out of the bag, smallest first */
  '#scr-party .tb-prev{flex:0 0 auto;display:flex;gap:5px;align-items:center;' +
    'justify-content:flex-end;height:32px;overflow:hidden}' +
  '#scr-party .tb-prev span{flex:0 0 auto;min-width:32px;height:30px;padding:0 6px;border-radius:8px;' +
    'display:grid;place-items:center;font:900 14px/1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'color:#3A2408;background:linear-gradient(180deg,#EFE0BC,#CFB98A);' +
    'box-shadow:0 2px 0 -1px rgba(0,0,0,.4)}' +
  '#scr-party .tb-prev span.old{opacity:.42}' +
  '#scr-party .tb-prev em{font-style:normal;font-size:9.5px;font-weight:900;letter-spacing:.12em;' +
    'text-transform:uppercase;color:var(--dim2);margin-right:auto;white-space:nowrap}' +

  /* ══ THE KARTELLA ══ */
  /* the kartella block takes ALL the slack and centres itself in it. A
     phone with room to spare must not end up with two hundred dead
     pixels under the seats — the card floats in the middle of the
     space instead, which is where the eye already is. */
  /* ── WHEN SIX WILL NOT FIT ───────────────────────────────────────
     On an 894 phone a ġog fits exactly. On a 660 one it cannot be made
     to: six kartelli in 472 pixels is a row of twenty-one, which is
     not a small number, it is an unreadable one. So the FLOOR wins and
     this one block scrolls. The house rule is that the PAGE never
     scrolls, and it does not; a panel may, and this is the panel. It
     is also what you do with a paper ġog that will not fit on the
     table — you move it. */
  '#scr-party .tb-cards{flex:1 1 auto;display:flex;flex-direction:column;gap:10px;' +
    'justify-content:center;min-height:0;overflow-y:auto;overflow-x:hidden;' +
    '-webkit-overflow-scrolling:touch;overscroll-behavior:contain}' +
  '#scr-party .tb.gog .tb-cards{justify-content:flex-start}' +
  '#scr-party .tb-card{position:relative;padding:6px;border-radius:13px;' +
    'background:linear-gradient(180deg,var(--rule),var(--rule2));' +
    'box-shadow:0 7px 0 -3px rgba(0,0,0,.45),0 12px 26px rgba(0,0,0,.45)}' +
  '#scr-party .tb-card.peek{filter:saturate(.55);opacity:.9}' +
  '#scr-party .tb-grid{display:grid;grid-template-columns:repeat(9,1fr);' +
    'grid-auto-rows:var(--tbh,58px);gap:2px;background:var(--paper2);padding:2px;border-radius:8px}' +
  /* one cell */
  '#scr-party .tb-c{position:relative;display:grid;place-items:center;padding:0;border:0;' +
    'border-radius:4px;background:var(--paper);color:var(--ink);' +
    'font-family:var(--disp);font-weight:900;line-height:1;letter-spacing:-.02em;' +
    'font-size:min(26px,calc(var(--tbh,58px) * .56));' +
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
     inline, the "before that" strip and the room strip disappear
     entirely, the ladder halves, and js/party.js's turn strip is
     hidden because everything it said now lives in the caller bar.
     The kartelli take all of it. Nothing else on this screen is
     allowed to cost a cartella a pixel — including the two host
     controls, which live inside the button bar that was already
     there. */
  '#scr-party .pt-wrap.tbgog .pt-turn{display:none}' +
  '#scr-party .tb.gog{gap:6px}' +
  '#scr-party .tb.gog .tb-cards{gap:5px}' +
  '#scr-party .tb.gog .tb-card{padding:3px;border-radius:9px;box-shadow:0 4px 0 -2px rgba(0,0,0,.45),' +
    '0 8px 16px rgba(0,0,0,.4)}' +
  '#scr-party .tb.gog .tb-grid{gap:2px;padding:2px;border-radius:6px}' +
  '#scr-party .tb.gog .tb-c{border-radius:3px}' +
  /* a ġog cell is 41 wide and 26 tall, so a counter sized as a circle
     off the WIDTH overflows the row and the six kartelli start to look
     like they are bleeding into one another. Sized to the box it lands
     in it is a slightly squashed disc — which is what a dried bean
     looks like anyway. */
  '#scr-party .tb.gog .tb-c.on::before{width:94%;height:90%;aspect-ratio:auto}' +
  '#scr-party .tb.gog .tb-call{padding:6px 9px;gap:9px}' +
  '#scr-party .tb.gog .tb-ball{width:58px;height:58px}' +
  '#scr-party .tb.gog .tb-ball b{font-size:25px}' +
  '#scr-party .tb.gog .tb-ball.none b{font-size:10px}' +
  '#scr-party .tb.gog .tb-mt{font-size:13px}' +
  '#scr-party .tb.gog .tb-laqam{font-size:11px}' +
  '#scr-party .tb.gog .tb-joke{display:none}' +
  '#scr-party .tb.gog .tb-prev,#scr-party .tb.gog .tb-seats,' +
  '#scr-party .tb.gog .tb-mini{display:none}' +
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
  '#scr-party .tb-chk{position:absolute;inset:0;z-index:25;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:14px;padding:24px;pointer-events:none;' +
    'background:radial-gradient(circle at 50% 42%,rgba(255,197,66,.16),rgba(6,4,12,.965) 62%)}' +
  '#scr-party .tb-chk .who{font:900 12px/1.4 var(--disp);letter-spacing:.14em;' +
    'text-transform:uppercase;color:var(--txt);text-align:center;opacity:.85}' +
  '#scr-party .tb-chk .who b{color:var(--gold)}' +
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

  /* ══ THE CLAIM BUTTON ══ */
  '#scr-party .pt-bar.tb-bar{grid-template-columns:1fr 62px}' +
  '#scr-party .pt-bar.tb-bar .btn{min-height:56px}' +
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
    '#scr-party .tb-prev{height:22px}' +
    '#scr-party .pt-bar.tb-bar .btn{min-height:50px}}' +
  '@media (max-height:660px){' +
    '#scr-party .tb-seats{display:none}' +
    '#scr-party .tb-call{padding:6px 9px}}';

  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   HOW BIG IS A CELL
   The kartella must never be the thing that gets squeezed, so the
   cell HEIGHT is computed from whatever vertical slack is left after
   the caller, the ladder, the seats and the button bar have had
   theirs — clamped so it can never go below 40px (unreadable) or
   above 74px (silly). Width takes care of itself: nine equal columns
   of a full-width card, which on a 440 phone is about 43px each.

   Recomputed on resize because a phone that rotates, or an iOS
   keyboard that opens and closes, changes the slack under us.
   ═══════════════════════════════════════════════════════════════════ */
function fitCards(){
  if (!U || !U.root || !U.root.isConnected) return;
  const cards = U.root.querySelectorAll('.tb-grid');
  if (!cards.length) return;
  const host = U.ctx.host;
  const stack = U.root;
  /* ── MEASURED, NOT GUESSED ───────────────────────────────────────
     The first version of this added up hard-coded paddings and gaps
     and was wrong twice: it counted the flex gap of blocks that were
     display:none (a ġog hides three of them), and it guessed a card's
     own chrome. Both errors pushed the sixth kartella off the bottom
     of a host that CLIPS, so the card did not get smaller, it
     disappeared, and nothing anywhere said so.

     So: count only the blocks that are actually on screen, and read a
     card's chrome straight out of the DOM by subtracting the three
     rows it is currently drawing. Self-correcting, and it cannot drift
     when the stylesheet changes. */
  const vis = [];
  for (const el of stack.children) if (el.offsetHeight > 0) vis.push(el);
  const gStack = U.gog ? 6 : 8, gCard = U.gog ? 5 : 10;
  let used = 0;
  for (const el of vis) if (!el.classList.contains('tb-cards')) used += el.offsetHeight;
  const gaps = gStack * Math.max(0, vis.length - 1) + gCard * (cards.length - 1);

  const curH = parseFloat(cards[0].style.getPropertyValue('--tbh')) ||
               parseFloat(getComputedStyle(cards[0]).getPropertyValue('--tbh')) || 58;
  const chrome = Math.max(0, (cards[0].parentNode.offsetHeight || 0) - curH * 3);
  const avail = host.clientHeight - used - gaps;
  /* ── 26 IS THE FLOOR, NOT 40 ─────────────────────────────────────
     A ġog is six kartelli and eighteen rows of them. A floor set high
     enough for a single card is a floor that loses a kartella. Small
     and legible beats absent. 76 stays the ceiling so one or two cards
     do not stretch into letterboxes. */
  const h = Math.max(26, Math.min(76,
    Math.floor((avail - cards.length * chrome) / (cards.length * 3))));
  /* written only when it actually changes: this runs off a
     ResizeObserver and off every repaint, and a style write that says
     the same thing is a layout the phone did not need. */
  for (const g of cards)
    if (g.style.getPropertyValue('--tbh') !== h + 'px') g.style.setProperty('--tbh', h + 'px');
}

let fitRO = null;
function watchFit(){
  stopFit();
  if (typeof ResizeObserver !== 'function'){
    window.addEventListener('resize', fitCards);
    fitRO = { disconnect(){ window.removeEventListener('resize', fitCards); } };
    return;
  }
  fitRO = new ResizeObserver(() => fitCards());
  if (U && U.ctx && U.ctx.host) fitRO.observe(U.ctx.host);
}
function stopFit(){ if (fitRO){ try { fitRO.disconnect(); } catch(e){} fitRO = null; } }

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
function stepRow(id, label, note, val){
  return '<div class="tb-set"><span class="lab"><b>' + esc(label) + '</b>' +
    (note ? '<i>' + esc(note) + '</i>' : '') + '</span>' +
    '<div class="tb-step" id="' + id + '">' +
      '<button data-d="-1" aria-label="one fewer">&minus;</button>' +
      '<span class="val">' + val + '</span>' +
      '<button data-d="1" aria-label="one more">+</button>' +
    '</div></div>';
}

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
  let play  = (p.play === 'pnp' || p.play === 'ai' || p.play === 'online')
                ? p.play : (canOnline ? 'online' : 'ai');
  if (play === 'online' && (!canOnline || relayDown)) play = 'ai';
  let rules = p.mode === 'hall' ? 'hall' : 'ladder';
  let who   = p.caller === 'auto' ? 'auto' : 'manual';
  let seats = Math.max(2, Math.min(T.MAX_SEATS, p.seats || T.DEFAULTS.seats));
  let level = [1,2,3].indexOf(p.level) >= 0 ? p.level : 2;
  let speed = [1,2,3].indexOf(p.speed) >= 0 ? p.speed : 2;
  let cards = [1,2,3,6].indexOf(p.cards) >= 0 ? p.cards : 6;
  let auto  = !!p.auto;
  let hints = !!p.hints;
  let open  = false;

  el.innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="pt-back" aria-label="Back to party games">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Tombla</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<p class="blurb">Ninety numbers in a bag and a <b>ġog</b> of six kartelli in front of you — ' +
        'so every number called is on your sheet somewhere. You mark your own, and nobody ' +
        'checks a thing until somebody shouts.</p>' +

      (saved ? '<button class="btn primary" id="tb-resume" style="margin:2px 0 10px">' +
        ilb('play', 'Carry on — call ' +
          ((saved.log || []).filter(m => m.t === 'call').length) + ' of 90') + '</button>' : '') +

      '<div class="tiny pt-lbl">Who is playing</div>' +
      '<div class="pt-opts" id="tb-play">' +
        (canOnline
          ? '<button class="pt-opt" data-v="online">' + ico('users') +
            '<b>People online</b><i>Up to sixteen, everybody marking at once.</i></button>'
          : '') +
        '<button class="pt-opt" data-v="ai">' + ico('coach') +
          '<b>You and the phone</b><i>The rest of the table is the machine.</i></button>' +
        '<button class="pt-opt sub" data-v="pnp">' + ico('users') +
          '<b>One phone, everybody round it</b><i>Tap your own name, mark your own ġog.</i></button>' +
      '</div>' +
      (relayDown
        ? '<p class="pt-warn">The KARTI server cannot be reached from this phone right now. ' +
          '<b>If Tailscale is on, turn it off.</b> Everything else here works with no internet.</p>'
        : '') +

      '<div class="tiny pt-lbl">The game</div>' +
      setRow('tb-rules', 'Rules', 'Klassika is the five-rung ladder. Tal-każin is vers, then fatta.',
             [{ v:'ladder', l:'Klassika' }, { v:'hall', l:'Tal-każin' }], rules) +
      setRow('tb-who', 'Who reads them out', 'Manual: you tap the bag and say it yourself. The app stays quiet.',
             [{ v:'manual', l:'A person' }, { v:'auto', l:'The phone' }], who) +
      stepRow('tb-seats', 'Chairs', 'Two to sixteen. Nobody ever waits for a turn.', seats) +
      '<div class="tb-chairs" id="tb-chairview"></div>' +
      setRow('tb-cards', 'Kartelli each', 'Six is a whole ġog — all ninety numbers on your sheet.',
             [{ v:1, l:'1' }, { v:2, l:'2' }, { v:3, l:'3' }, { v:6, l:'Ġog' }], cards) +
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

      '<div class="tb-fold"><button id="tb-foldb">' + ico('book') +
        '<span>The rules, and why there are two</span><span class="cv">+</span></button>' +
        '<div class="body" id="tb-foldbody" hidden>' +
          '<p><b>Tombla klassika</b> is the Italian ladder: <b>ambo</b> two on one row, ' +
            '<b>terna</b> three, <b>kwaterna</b> four, <b>ċinkwina</b> the whole row of five, ' +
            'then <b>TOMBLA</b> — all fifteen on one kartella. Each is won once and the game ' +
            'carries on for the next, which is why nobody leaves the table.</p>' +
          '<p><b>Tal-każin</b> is Malta\'s own. The Lotteries and Other Games Act defines a ' +
            'tombla as won by the <b>vers</b> — five on one row — or the <b>fatta</b>, all ' +
            'fifteen. No ambo, no terna. That is the game the band clubs and the parishes ' +
            'play, and with a full ġog in front of everybody it is the better paced of the ' +
            'two: an ambo among sixteen ġogs is gone by the third number.</p>' +
          '<p>Both are here under their own names. Neither is invented.</p>' +
        '</div></div>' +

      (rec.w + rec.l + rec.d
        ? '<p class="pt-ledger">Tombla so far: <b>' + rec.w + '</b> won, <b>' + rec.d +
          '</b> with a prize, <b>' + rec.l + '</b> with nothing.</p>'
        : '') +

      '<button class="btn primary" id="tb-start" style="margin:14px 0 24px"></button>' +
    '</div>';

  const seg = (id, get, set) => el.querySelectorAll('#' + id + ' .tb-sq').forEach(b2 => {
    b2.onclick = () => { sfx('ui.tap'); set(b2.dataset.v); sync(); };
  });
  const sync = () => {
    el.querySelectorAll('#tb-play .pt-opt').forEach(b2 => b2.classList.toggle('on', b2.dataset.v === play));
    const mark = (id, v) => el.querySelectorAll('#' + id + ' .tb-sq').forEach(b2 =>
      b2.classList.toggle('on', b2.dataset.v === String(v)));
    mark('tb-rules', rules); mark('tb-who', who); mark('tb-cards', cards);
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
    el.querySelector('#tb-lvlrow').hidden = (play === 'online');
    el.querySelector('#tb-lvl').previousElementSibling &&
      (el.querySelector('#tb-lvlrow .lab i').textContent = LEVELS[level - 1] ? LEVELS[level - 1].note : '');
    const b2 = el.querySelector('#tb-start');
    b2.innerHTML = ilb(play === 'online' ? 'users' : 'play',
                       play === 'online' ? 'Find a room' : 'Deal the ġogs');
  };

  el.querySelectorAll('#tb-play .pt-opt').forEach(b2 => b2.onclick = () => {
    sfx('ui.tap'); play = b2.dataset.v;
    /* in one room a PERSON calls; from different houses the phone has
       to. Follow the choice unless the player has overridden it. */
    if (play === 'online' && p.caller == null) who = 'auto';
    sync();
  });
  seg('tb-rules', 0, v => { rules = v; });
  seg('tb-who',   0, v => { who = v; });
  seg('tb-cards', 0, v => { cards = +v; });
  seg('tb-speed', 0, v => { speed = +v; });
  seg('tb-lvl',   0, v => { level = +v; });
  seg('tb-hints', 0, v => { hints = v === '1'; });
  seg('tb-auto',  0, v => { auto  = v === '1'; });
  el.querySelectorAll('#tb-seats button').forEach(b2 => b2.onclick = () => {
    seats = Math.max(2, Math.min(T.MAX_SEATS, seats + (+b2.dataset.d)));
    sfx('ui.note', { rate: 0.9 + seats / 20 });
    sync();
  });
  el.querySelector('#tb-foldb').onclick = () => {
    open = !open;
    sfx(open ? 'ui.sheet' : 'ui.back');
    el.querySelector('#tb-foldbody').hidden = !open;
    el.querySelector('#tb-foldb .cv').textContent = open ? '−' : '+';
  };
  sync();

  el.querySelector('#pt-back').onclick = () => P.hub();
  const rz = el.querySelector('#tb-resume');
  if (rz) rz.onclick = () => {
    const snap = T.savedSlot();
    if (!snap || !T.hooks.load(snap)) { menu(); return; }
    T.pref({ hints, auto });
    board();
    if (T.state().phase === 'play') T.runClock();
  };
  el.querySelector('#tb-start').onclick = () => {
    T.pref({ play, mode:rules, caller:who, seats, level, speed, cards, auto, hints });
    if (play === 'online'){ if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('tombla'); return; }
    newGame({ mode:rules, caller:who, seats, level, speed, cards, auto }, play === 'pnp');
  };
}

/* ═══════════════════════════════════════════════════════════════════
   2 · THE LOBBY
   Everybody arrives, everybody says they are ready, the host starts.
   That is the shape js/mp.js's rooms are being built in, so it is the
   shape offline uses too — one code path, and the online build gets a
   lobby that has already been played on a phone.
   ═══════════════════════════════════════════════════════════════════ */
function newGame(opts, pnp){
  T.startMatch(opts);
  if (pnp) for (let i = 0; i < opts.seats; i++) T.hooks.setOwner(i, 'hot');
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
  const gog  = st.opts.cards >= 3;

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

  U = {
    ctx, root, gog,
    seat: localSeat(),
    peek: localSeat(),
    timers: [], sheets: [],
    lastN: 0, ending: 0, shownCheck: 0, busy: 0, ran: 0,
    net: null, off: null
  };
  U.peek = U.seat;
  U.off = T.onState(ev => onState(ev));

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
  if (st.phase === 'done' && !U.ending){ U.ending = 1; soon(finish, 700); }
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
  U.root.innerHTML =
    '<div class="tb-call" id="tb-callbar"></div>' +
    '<div class="tb-prev" id="tb-prev"></div>' +
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

  /* the bag. In manual it is the draw button; in auto it is a token. */
  const ballIn = U.lastN ? '<b>' + U.lastN + '</b>'
                         : '<b>' + (canDraw ? 'IĠBED' : 'WAIT') + '</b>';
  const ball = canDraw
    ? '<button class="tb-ball draw" id="tb-draw" aria-label="Draw the next number">' +
      (U.lastN ? '<b>' + U.lastN + '</b>' : '<b>IĠBED</b>') + '</button>'
    : '<div class="tb-ball' + (U.lastN ? '' : ' none') + '">' + ballIn + '</div>';

  U.root.querySelector('#tb-callbar').innerHTML =
    ball +
    '<div class="tb-say">' +
      '<div class="tb-mt">' + esc(U.lastN ? call.mt : (canDraw ? 'tap the bag' : 'eyes down')) + '</div>' +
      '<div class="tb-laqam">' + (call.laqam
          ? esc(call.laqam) + ' <i>&middot; ' + esc(call.gloss) + '</i>'
          : '<i>' + esc(U.lastN ? 'number ' + U.lastN : 'nothing out yet') + '</i>') + '</div>' +
      '<div class="tb-joke">' + esc(call.say || '') + '</div>' +
      statusHTML(st) +
    '</div>';
  const dr = U.root.querySelector('#tb-draw');
  if (dr) dr.onclick = () => onDraw();

  /* before that */
  const prev = st.called.slice(-9, -1).reverse();
  U.root.querySelector('#tb-prev').innerHTML =
    '<em>before that</em>' +
    (prev.length ? prev.map((n, k) => '<span' + (k > 1 ? ' class="old"' : '') + '>' + n + '</span>').join('')
                 : '<span class="old">-</span>');

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
  if (U.peek !== U.seat) bits.push('<span class="on">' + esc(st.seats[U.peek].name) + '’s ġog</span>');
  if (st.paused >= 0) bits.push('<span class="hot">stopped</span>');
  return '<div class="tb-stat">' + bits.join('<span>&middot;</span>') + '</div>';
}

/* the paused banner: a stalled caller must never read as a bug */
function paintHold(st){
  const old = U.ctx.root.querySelector('.tb-hold');
  if (st.paused < 0){ if (old) old.remove(); return; }
  const by = st.seats[st.paused];
  const txt = 'Stopped by ' + (st.paused === U.seat ? 'you' : (by ? by.name : 'the host')) +
              ' · keep marking';
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
  box.innerHTML =
    '<div class="who">Checking <b>' + esc(mine ? 'your' : who.name + '’s') + '</b> kartella' +
      ' &middot; ' + esc(nm) + '</div>' +
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
      if (v.prize === 'tombla') soon(() => sfx(mine ? 'duel.win' : 'duel.lose', { force:true }), 300);
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
  if (U.ctx.root.querySelector('.pt-over')) return;      /* already shown */
  const st = T.state();
  const o = T.over(st);
  if (!o) return;
  T.stopClock();
  const me = st.seats[U.seat];
  const wonTombla = st.prizes.tombla.done && st.prizes.tombla.seat === U.seat;
  const tone = wonTombla ? 'win' : (me.won.length ? 'draw' : 'lose');
  const winner = st.seats[o.seat];

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
        go: () => { const o2 = st.opts; const p = st.seats.every(s => s.own === 'hot');
                    leave(); newGame(o2, p); } },
      { label:'Back', icon:'back', cls:'ghost', go: () => { leave(); menu(); } }
    ]
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
  T.startMatch(cfg.opts || {}, cfg.seed);
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
   7 · ON THE SHELF
   ═══════════════════════════════════════════════════════════════════ */
P.register({
  id:'tombla', order:25, kind:'board', cat:'board',
  name:'TOMBLA', mt:'It-tombla', sprite:'tb-mark', status:'live',
  get tag(){
    return 'A ġog of six kartelli, ninety numbers, and you mark every one yourself. ' +
      'Up to sixteen of you at once, and nobody ever waits for a turn.' +
      (T.savedSlot() ? ' There is one half-called.' : '');
  },
  open: menu
});

window.KARTI_TOMBLA_UI = { open: menu, board, leave, injectCSS };
T.open = menu;                    /* KARTI_TOMBLA.open() — the asked-for entry point */

/* the shelf is painted by js/party.js before anything of ours has been
   on screen, and its tile references our mark by id, so the symbol
   sheet has to be in the document from the moment this file loads */
if (document.body) injectSprite();
else document.addEventListener('DOMContentLoaded', injectSprite);

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
