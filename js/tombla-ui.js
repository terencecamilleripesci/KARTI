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
  '#scr-party .tb-cards{flex:0 1 auto;display:flex;flex-direction:column;gap:10px;' +
    'justify-content:center;min-height:0}' +
  '#scr-party .tb-card{position:relative;padding:6px;border-radius:13px;' +
    'background:linear-gradient(180deg,var(--rule),var(--rule2));' +
    'box-shadow:0 7px 0 -3px rgba(0,0,0,.45),0 12px 26px rgba(0,0,0,.45)}' +
  '#scr-party .tb-card.peek{filter:saturate(.55);opacity:.9}' +
  '#scr-party .tb-grid{display:grid;grid-template-columns:repeat(9,1fr) 17px;' +
    'grid-auto-rows:var(--tbh,58px);gap:2px;background:var(--paper2);padding:2px;border-radius:8px}' +
  /* one cell */
  '#scr-party .tb-c{position:relative;display:grid;place-items:center;padding:0;border:0;' +
    'border-radius:4px;background:var(--paper);color:var(--ink);' +
    'font-family:var(--disp);font-weight:900;line-height:1;letter-spacing:-.02em;' +
    'font-size:min(26px,calc(var(--tbh,58px) * .45));' +
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
  /* the row gutter: how far along that row is. The ladder made visible
     one row at a time, which is where the "one away" feeling lives. */
  '#scr-party .tb-r{display:flex;flex-direction:column;gap:3px;align-items:center;' +
    'justify-content:center;border-radius:4px;' +
    'background:linear-gradient(180deg,rgba(123,36,21,.92),rgba(90,24,13,.92))}' +
  '#scr-party .tb-r i{width:8px;height:8px;border-radius:50%;background:rgba(255,243,220,.26);' +
    'display:block;box-shadow:inset 0 0 0 1px rgba(0,0,0,.3)}' +
  '#scr-party .tb-r i.f{background:var(--beanTx);box-shadow:0 0 5px rgba(255,243,220,.55)}' +
  '#scr-party .tb-card.near{box-shadow:0 0 0 2px var(--gold),0 7px 0 -3px rgba(0,0,0,.45),' +
    '0 12px 26px rgba(0,0,0,.45)}' +

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

  /* ══ the setup sheet's own bits ══ */
  '#scr-party .tb-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:6px}' +
  '#scr-party .tb-sq{min-height:46px;border-radius:12px;background:rgba(255,255,255,.04);' +
    'border:1px solid var(--line);color:var(--dim);font:900 13px/1 var(--disp);letter-spacing:.05em}' +
  '#scr-party .tb-sq.on{background:rgba(255,197,66,.14);border-color:rgba(255,197,66,.5);' +
    'color:var(--gold)}' +
  '#scr-party .tb-note{font-size:11px;line-height:1.55;color:var(--dim2);margin:7px 2px 0;' +
    'text-transform:none;letter-spacing:0}' +

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
  let used = 0;
  for (const el of stack.children){
    if (el.classList.contains('tb-cards')) continue;
    used += el.offsetHeight;
  }
  const gaps = 8 * (stack.children.length - 1) + 9 * (cards.length - 1);
  const slack = host.clientHeight - used - gaps;
  const per = Math.floor(slack / cards.length) - 8;      /* card padding + grid padding */
  /* never below 40 (unreadable) and never so tall that the cell stops
     looking like a printed box — a kartella cell is a shade wider than
     it is tall, and past 76 a 43px column does not read as one. The
     rest of the slack goes into centring the card, not stretching it. */
  /* Nine columns of a full-width card are about 43px each on a 440
     phone, so a cell that is 56 tall is a shade taller than it is wide
     — the proportion of a printed kartella box, and the proportion the
     counter has to be a circle inside. Never below 40 (unreadable).
     Slack above that goes into the gaps between blocks, not into
     stretching the card into letterboxes. */
  const h = Math.max(40, Math.min(58, Math.floor((per - 4) / 3)));
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
const MODES = [
  { k:'ladder', name:'Tombla klassika',
    note:'Five prizes: ambo, terna, kwaterna, ċinkwina, then the tombla. ' +
         'The Italian ladder — the game everybody stays in until the end.' },
  { k:'hall',   name:'Tal-każin',
    note:'Vers, then fatta. Two prizes, the way it is played in a band club — ' +
         'and the way Maltese law actually defines a tombla.' }
];
const LEVELS = [
  { k:1, name:'Nofs rieqda', note:'They are talking, not looking. They will miss things.', icon:'diff-1' },
  { k:2, name:'Tal-każin',   note:'Play every week. They rarely miss a number.', icon:'diff-2' },
  { k:3, name:'In-nanna',    note:'Six kartelli, one pen, and eyes like a hawk.', icon:'diff-3' }
];

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
     cleanGame() — so offering "People online" before mp.js has heard of
     tombla would send somebody to the wrong room list. We therefore ask
     mp.js rather than ourselves. The moment
        { k:'tombla', name:'Tombla', short:'TOMBLA', sym:'tb-mark',
          blurb:'Ninety numbers. Everybody at once.' }
     lands in that file's GAMES array this lights up on its own, and
     nothing in here has to change. */
  const M = window.KARTI_MP;
  const canOnline = !!(M && M.openFor && M.GAME_KEYS &&
                       M.GAME_KEYS.indexOf('tombla') >= 0 && P.online && P.online.tombla);
  const relayDown = !!(canOnline && M.PR && M.PR.tried && M.PR.err);
  let mode  = (p.play === 'pnp' || p.play === 'ai' || p.play === 'online')
                ? p.play : (canOnline ? 'online' : 'ai');
  if (mode === 'online' && (!canOnline || relayDown)) mode = 'ai';
  let rules = p.mode === 'hall' ? 'hall' : 'ladder';
  let seats = [2,3,4,6,8].indexOf(p.seats) >= 0 ? p.seats : 4;
  let level = [1,2,3].indexOf(p.level) >= 0 ? p.level : 2;
  let speed = [1,2,3].indexOf(p.speed) >= 0 ? p.speed : 2;
  let cards = p.cards === 2 ? 2 : 1;
  let auto  = !!p.auto;
  let hints = !!p.hints;

  const seg = (id, list, cur) =>
    '<div class="tb-seg" id="' + id + '">' + list.map(o =>
      '<button class="tb-sq' + (String(o.v) === String(cur) ? ' on' : '') + '" data-v="' +
      esc(o.v) + '">' + esc(o.l) + '</button>').join('') + '</div>';

  el.innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="pt-back" aria-label="Back to party games">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Tombla</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<p class="blurb">Ninety numbers in a bag, fifteen on your kartella, and a room that ' +
        'goes silent the second somebody is one away. <b>You mark your own numbers</b> — ' +
        'miss one and it sits there until you spot it. That is the game.</p>' +

      (saved ? '<p class="pt-ledger">There is a tombla half-played. ' +
        '<b>Call ' + esc(String((saved.log || []).filter(m => m.t === 'call').length)) +
        '</b> of ninety.</p>' +
        '<button class="btn primary" id="tb-resume" style="margin:10px 0 4px">' +
        ilb('play', 'Carry on with that one') + '</button>' : '') +

      '<div class="tiny pt-lbl">Who is playing</div>' +
      '<div class="pt-opts" id="tb-play">' +
        (canOnline
          ? '<button class="pt-opt" data-v="online">' + ico('users') +
            '<b>People online</b><i>Up to eight, everybody marking at once. Nobody waits ' +
            'for a turn — which is why this is the best game in here for a full room.</i></button>'
          : '') +
        '<button class="pt-opt" data-v="ai">' + ico('coach') +
          '<b>You and the phone</b><i>The rest of the table is the machine. It misses ' +
          'numbers too.</i></button>' +
        '<button class="pt-opt sub" data-v="pnp">' + ico('users') +
          '<b>One phone, everybody round it</b><i>Last resort. Tap your own name, mark your ' +
          'own kartella. Nothing is hidden in tombla, so nobody has to look away.</i></button>' +
      '</div>' +
      (relayDown
        ? '<p class="pt-warn">The KARTI server cannot be reached from this phone right now, ' +
          'so an online tombla would not get past the room list. <b>If Tailscale is on, turn ' +
          'it off.</b> Everything else here works with no internet at all.</p>'
        : '') +

      '<div class="tiny pt-lbl">Which rules</div>' +
      '<div class="pt-opts" id="tb-rules">' +
        MODES.map(m => '<button class="pt-opt" data-v="' + esc(m.k) + '">' +
          ico(m.k === 'hall' ? 'cross-malta' : 'star') + '<b>' + esc(m.name) + '</b><i>' +
          esc(m.note) + '</i></button>').join('') +
      '</div>' +

      '<div class="tiny pt-lbl">How many playing</div>' +
      seg('tb-seats', [2,3,4,6,8].map(v => ({ v, l:String(v) })), seats) +

      '<div class="tiny pt-lbl">How fast the anunzjatur reads</div>' +
      seg('tb-speed', [{ v:1, l:'Slow' }, { v:2, l:'Normal' }, { v:3, l:'Quick' }], speed) +
      '<p class="tb-note">Normal gives you about four seconds a number, which is roughly ' +
        'what a real caller leaves you.</p>' +

      '<div class="tiny pt-lbl">Kartelli each</div>' +
      seg('tb-cards', [{ v:1, l:'One' }, { v:2, l:'Two' }], cards) +
      '<p class="tb-note">Two is twice the chance and twice the panic. A full ġog is six, ' +
        'and six will not fit on a phone.</p>' +

      '<div id="tb-aibits">' +
        '<div class="tiny pt-lbl">How sharp the others are</div>' +
        '<div class="pt-opts" id="tb-lvl">' +
          LEVELS.map(l => '<button class="pt-opt" data-v="' + l.k + '">' + ico(l.icon) +
            '<b>' + esc(l.name) + '</b><i>' + esc(l.note) + '</i></button>').join('') +
        '</div>' +
      '</div>' +

      '<div class="tiny pt-lbl">Help</div>' +
      '<div class="pt-opts" id="tb-help">' +
        '<button class="pt-opt' + (hints ? ' on' : '') + '" data-v="hints">' + ico('search') +
          '<b>Ring the number that was called</b><i>Shows you where it is on your kartella. ' +
          'You still have to tap it. Off by default — finding it is half the game.</i></button>' +
        '<button class="pt-opt' + (auto ? ' on' : '') + '" data-v="auto">' + ico('check') +
          '<b>Mark for me</b><i>The phone marks everything. Here for anybody who cannot tap ' +
          'fast enough — it is not the game, and it is off by default.</i></button>' +
      '</div>' +

      (rec.w + rec.l + rec.d
        ? '<p class="pt-ledger">Tombla so far: <b>' + rec.w + '</b> won, <b>' + rec.d +
          '</b> with a prize, <b>' + rec.l + '</b> with nothing.</p>'
        : '') +

      '<button class="btn primary" id="tb-start" style="margin:16px 0 24px"></button>' +
    '</div>';

  const sync = () => {
    el.querySelectorAll('#tb-play .pt-opt').forEach(b => b.classList.toggle('on', b.dataset.v === mode));
    el.querySelectorAll('#tb-rules .pt-opt').forEach(b => b.classList.toggle('on', b.dataset.v === rules));
    el.querySelectorAll('#tb-lvl .pt-opt').forEach(b => b.classList.toggle('on', b.dataset.v === String(level)));
    const on = (id, v) => el.querySelectorAll('#' + id + ' .tb-sq').forEach(b =>
      b.classList.toggle('on', b.dataset.v === String(v)));
    on('tb-seats', seats); on('tb-speed', speed); on('tb-cards', cards);
    el.querySelector('#tb-aibits').hidden = (mode === 'online');
    const b = el.querySelector('#tb-start');
    b.innerHTML = ilb(mode === 'online' ? 'users' : 'play',
                      mode === 'online' ? 'Find a room' : 'Deal the kartelli');
  };
  const pick = (sel, set) => el.querySelectorAll(sel).forEach(b =>
    b.onclick = () => { sfx('ui.tap'); set(b.dataset.v); sync(); });
  pick('#tb-play .pt-opt',  v => { mode = v; });
  pick('#tb-rules .pt-opt', v => { rules = v; });
  pick('#tb-lvl .pt-opt',   v => { level = +v; });
  pick('#tb-seats .tb-sq',  v => { seats = +v; });
  pick('#tb-speed .tb-sq',  v => { speed = +v; });
  pick('#tb-cards .tb-sq',  v => { cards = +v; });
  el.querySelectorAll('#tb-help .pt-opt').forEach(b => b.onclick = () => {
    const k = b.dataset.v;
    if (k === 'auto'){ auto = !auto; b.classList.toggle('on', auto); }
    else { hints = !hints; b.classList.toggle('on', hints); }
    sfx(b.classList.contains('on') ? 'ui.toggle' : 'ui.untoggle');
  });
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
    T.pref({ play:mode, mode:rules, seats, level, speed, cards, auto, hints });
    if (mode === 'online'){ if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('tombla'); return; }
    newGame({ mode:rules, seats, level, speed, cards, auto }, mode === 'pnp');
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
     because eight names all going green on the same frame looks like a
     spreadsheet rather than a room filling up */
  const st = T.state();
  let d = 380;
  for (let i = 0; i < st.seats.length; i++){
    if (st.seats[i].own !== 'ai') continue;
    d += 260 + ((i * 977) % 520);
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

  const ctx = P.ui.frame({
    title: hall ? 'Tombla tal-każin' : 'Tombla',
    onBack: () => { leave(); menu(); },
    leave,
    barCls: 'tb-bar',
    buttons: [
      { id:'tb-claim', label:'', icon:'star', cls:'ghost' },
      { id:'tb-board', label:'1-90', icon:'book', cls:'ghost' }
    ]
  });
  /* party.js's frame is built round a chessboard and sizes an 8x8
     square into the host. A kartella is not a square, so we take the
     square sizer off and put our own stack in its place. */
  if (ctx.stopFit) ctx.stopFit();
  ctx.host.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'tb';
  ctx.host.appendChild(root);

  U = {
    ctx, root,
    seat: localSeat(),
    peek: localSeat(),
    timers: [],
    lastN: 0, lastCall: -1, ending: 0,
    just: {},              /* cell keys stamped on this repaint */
    wasAway: -1,           /* to fire the near-miss once, not every frame */
    net: null,
    off: null
  };
  U.peek = U.seat;
  U.off = T.onState(ev => onState(ev));

  ctx.btn('tb-board').onclick = () => { sfx('ui.sheet'); tabellone(); };
  ctx.btn('tb-claim').onclick = () => onClaim();

  render();
  watchFit();
  requestAnimationFrame(fitCards);
}

/* ── what the engine just did ─────────────────────────────────────── */
function onState(ev){
  if (!U) return;
  const st = T.state();
  if (!st) return;
  if (ev && ev.reason === 'move' && ev.move){
    const m = ev.move;
    if (m.t === 'call'){ onCall(ev.res && ev.res.n); return; }
    if (m.t === 'claim' && ev.res && ev.res.ok){ onPrize(m.s, m.p); return; }
    if (m.t === 'mark' && m.s === U.peek){ U.just[m.c + ':' + m.i] = 1; }
  }
  render();
  /* THE OTHER WAY A TOMBLA ENDS. onPrize() shows the result after the
     shout, but a game can also finish with the bag empty and nobody
     having claimed — which no claim move announces. Without this the
     board would simply sit there, finished, forever. */
  if (T.state().phase === 'done' && !U.ending){
    U.ending = 1;
    soon(finish, 900);
  }
}

function onCall(n){
  if (!U || !n) return;
  const st = T.state();
  U.lastN = n; U.lastCall = st.calls;
  /* the bag, then the number. Two sounds, because a real call is two
     sounds: the rummage and the read-out. The read-out is pitched by
     the number itself, so ninety walks up a scale over a whole game. */
  sfx('tombla.call', { force:true, gain:0.5 });
  sfx('ui.note',   { force:true, rate: 0.78 + (n / 90) * 0.95 });
  render();
  const ball = U.root.querySelector('.tb-ball');
  if (ball){ ball.classList.remove('pop'); void ball.offsetWidth; ball.classList.add('pop'); }
}

function onPrize(seat, key){
  if (!U) return;
  const st = T.state();
  const s = st.seats[seat];
  const sh = T.shoutOf(st, key);
  const mine = isLocalSeat(seat);
  sfx('tombla.shout', { force:true });
  if (key === 'tombla') soon(() => sfx(mine ? 'duel.win' : 'duel.lose', { force:true }), 260);
  const over = document.createElement('div');
  over.className = 'tb-shout' + (key === 'tombla' ? ' big' : '');
  over.setAttribute('role', 'status');
  over.innerHTML =
    '<b>' + esc(sh[0]) + '</b>' +
    '<u>' + esc(mine ? 'That is you' : s.name) + '</u>' +
    '<i>' + esc(sh[1]) + '</i>';
  U.ctx.root.appendChild(over);
  soon(() => { if (over.parentNode) over.remove(); }, 1560);
  render();
  if (st.phase === 'done' && !U.ending){ U.ending = 1; soon(finish, 1650); }
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

/* ── the lobby ──────────────────────────────────────────────────── */
function paintLobby(st){
  const me = U.seat;
  const all = st.seats.every(s => s.ready);
  const host = st.host === me;
  U.root.innerHTML =
    '<div class="tb-lob">' +
      '<div class="tb-lobhead">' +
        '<h3>' + (st.opts.mode === 'hall' ? 'Vers u fatta' : 'Ambo sat-tombla') + '</h3>' +
        '<p>' + esc(st.opts.seats) + ' playing, ' + esc(st.opts.cards) +
          ' kartell' + (st.opts.cards === 1 ? 'a' : 'i') + ' each. ' +
          'Everybody says they are ready, then the anunzjatur starts.</p>' +
      '</div>' +
      /* EVERY SEAT ON THIS PHONE IS TAPPABLE. Round one phone all four
         seats are people in the room, and if only seat one could say it
         was ready the START button would never light and the game could
         not begin at all. It shipped like that for one test run. */
      '<div class="tb-lobseats">' +
        st.seats.map((s, i) => {
          const mine = isLocalSeat(i);
          const tag = mine ? (s.ready ? 'Ready' : 'Tap when ready') : (s.ready ? 'Ready' : 'Waiting');
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
  claim.id = 'tb-claim';
  claim.innerHTML = (all && host)
    ? 'Start' + '<span class="tb-sub">the anunzjatur is waiting</span>'
    : (meReady ? 'Not ready' : 'I am ready') +
      '<span class="tb-sub">' + (meReady ? 'changed your mind' : 'tap when you are') + '</span>';
  claim.onclick = () => {
    const s2 = T.state();
    if (s2.seats.every(x => x.ready) && s2.host === me){
      sfx('duel.start', { force:true });
      T.doMove(me, { t:'start' }, 'tap');
      T.runClock();
      render();
      requestAnimationFrame(fitCards);
      return;
    }
    sfx(s2.seats[me].ready ? 'ui.untoggle' : 'ui.toggle');
    T.doMove(me, { t:'ready', v: !s2.seats[me].ready }, 'tap');
    render();
  };
  const bd = U.ctx.btn('tb-board');
  bd.disabled = true;
  bd.style.opacity = '.4';
}
const initialOf = n => String(n || '?').trim().charAt(0).toUpperCase() || '?';

/* ── the table ──────────────────────────────────────────────────── */
function paintTable(st){
  const seat = st.seats[U.peek] ? U.peek : U.seat;
  const s = st.seats[seat];
  const rungs = T.rungsOf(st);
  const call = T.callOf(st, U.lastN || 0, st.calls);
  const prev = st.called.slice(-9, -1).reverse();
  const out = {};
  for (const n of st.called) out[n] = 1;
  const last = st.called[st.called.length - 1];
  const canTap = isLocalSeat(seat) && st.phase === 'play';

  U.root.innerHTML =
    /* the anunzjatur */
    '<div class="tb-call">' +
      (U.lastN
        ? '<div class="tb-ball"><b>' + U.lastN + '</b></div>'
        : '<div class="tb-ball none"><b>WAIT</b></div>') +
      '<div class="tb-say">' +
        '<div class="tb-mt">' + esc(U.lastN ? call.mt : 'eyes down') + '</div>' +
        '<div class="tb-laqam">' + (call.laqam
            ? esc(call.laqam) + ' <i>&middot; ' + esc(call.gloss) + '</i>'
            : '<i>' + esc(U.lastN ? 'number ' + U.lastN : 'the first number is coming') + '</i>') + '</div>' +
        '<div class="tb-joke">' + esc(call.say || '') + '</div>' +
      '</div>' +
    '</div>' +

    '<div class="tb-prev">' +
      '<em>before that</em>' +
      (prev.length ? prev.map((n, k) => '<span' + (k > 1 ? ' class="old"' : '') + '>' + n + '</span>').join('')
                   : '<span class="old">-</span>') +
    '</div>' +

    /* THE KARTELLA */
    '<div class="tb-cards">' + s.cards.map((cells, ci) =>
        cardHTML(st, seat, ci, cells, s.marks[ci], canTap)).join('') + '</div>' +

    /* the wall chart, in miniature */
    '<button class="tb-mini" id="tb-mini" aria-label="' + st.called.length +
      ' of ninety out. Tap for the board.">' +
      (() => { let g = ''; for (let n = 1; n <= 90; n++)
                 g += '<i class="' + (out[n] ? (n === last ? 'l' : 'o') : '') + '"></i>';
               return g; })() +
    '</button>' +

    /* the ladder */
    '<div class="tb-lad n' + rungs.length + '">' + rungs.map(k => rungHTML(st, k)).join('') + '</div>' +

    /* the room */
    '<div class="tb-seats">' + st.seats.map((x, i) =>
        '<button class="tb-seat' + (i === U.seat ? ' you' : '') + (x.won.length ? ' hasw' : '') +
          (i === U.peek && U.peek !== U.seat ? ' peeking' : '') + '" data-s="' + i + '">' +
          '<span class="tb-pip"></span><b>' + esc(x.name) + '</b>' +
          '<em>' + (x.won.length ? x.pts : '-') + '</em></button>').join('') +
    '</div>';

  /* tapping a square is the entire game, so it is bound directly and
     not delegated: 27 buttons is nothing, and a delegated handler on a
     grid that repaints every call is a bug waiting to be written */
  if (canTap) U.root.querySelectorAll('.tb-c[data-i]').forEach(b => {
    b.onclick = () => onCell(seat, +b.dataset.c, +b.dataset.i);
  });
  const mini = U.root.querySelector('#tb-mini');
  if (mini) mini.onclick = () => { sfx('ui.sheet'); tabellone(); };
  U.root.querySelectorAll('.tb-seat').forEach(b => {
    b.onclick = () => { sfx('ui.tap'); U.peek = +b.dataset.s; render(); requestAnimationFrame(fitCards); };
  });
  U.just = {};
  /* the card just changed shape — one kartella or two, a peeked seat,
     a phone that rotated. Re-fit on the next frame, once the browser
     has laid the new stack out. */
  requestAnimationFrame(fitCards);

  /* the strip, the badge and the button */
  const near = bestNear(st, U.seat);
  const missed = st.seats[U.seat].missed;
  const peeking = U.peek !== U.seat;
  P.ui.setTurn(U.ctx, {
    cls:'',
    who: peeking ? ('Looking at ' + st.seats[U.peek].name)
                 : (near && near.away === 1 ? 'WIEĦED BISS - one away' : 'Call ' + st.calls + ' of 90'),
    note: peeking ? 'tap your own name' : (missed ? missed + ' not marked' : (90 - st.calls) + ' left'),
    alert: !peeking && !!(near && near.away === 1)
  });
  U.ctx.badge.textContent = st.calls + '/90';
  paintClaim(st);

  /* the near-miss sting, once per arrival at one-away and not again */
  const away = near ? near.away : -1;
  if (away === 1 && U.wasAway !== 1) sfx('tombla.near', { force:true });
  U.wasAway = away;

  const bd = U.ctx.btn('tb-board');
  bd.disabled = false; bd.style.opacity = '';
}

/* one kartella */
function cardHTML(st, seat, ci, cells, marks, canTap){
  const near = T.nearest(st, cells, marks);
  const hint = T.pref().hints && U.lastN && st.phase === 'play';
  let out = '<div class="tb-card' + (near && near.away === 1 ? ' near' : '') +
            (seat !== U.seat ? ' peek' : '') + '"><div class="tb-grid">';
  for (let r = 0; r < 3; r++){
    for (let j = 0; j < 9; j++){
      const i = r * 9 + j, n = cells[i];
      if (!n){ out += '<span class="tb-c e"></span>'; continue; }
      const on = !!marks[i];
      const ring = hint && !on && n === U.lastN;
      const cls = 'tb-c' + (on ? ' on' : '') + (ring ? ' hint' : '') +
                  (U.just[ci + ':' + i] ? ' just' : '');
      out += canTap
        ? '<button class="' + cls + '" data-c="' + ci + '" data-i="' + i + '" ' +
          'aria-pressed="' + on + '" aria-label="' + n + (on ? ', marked' : '') + '">' +
          '<span class="tb-n">' + n + '</span></button>'
        : '<span class="' + cls + '"><span class="tb-n">' + n + '</span></span>';
    }
    /* the row gutter: five pips, filled as the row fills */
    const got = T.rowMarks(marks, r);
    let pips = '';
    for (let k = 0; k < 5; k++) pips += '<i' + (k < got ? ' class="f"' : '') + '></i>';
    out += '<span class="tb-r" aria-label="row ' + (r + 1) + ', ' + got + ' of 5">' + pips + '</span>';
  }
  return out + '</div></div>';
}

/* one rung of the ladder */
function rungHTML(st, k){
  const pz = st.prizes[k];
  const nm = T.prizeName(st, k);
  let cls = 'tb-rung', who = T.prizeAt(k).need ? (T.prizeAt(k).need + ' on a row') : 'all 15';
  if (k === 'tombla') who = 'all 15';
  if (pz.done){
    const s = st.seats[pz.seat];
    cls += ' won' + (pz.seat === U.seat ? ' mine' : '');
    who = pz.seat === U.seat ? 'YOU' : s.name;
  } else if (pz.void){
    cls += ' void'; who = 'nobody';
  } else cls += ' live';
  return '<div class="' + cls + '"><b>' + esc(nm) + '</b><i>' + esc(who) + '</i></div>';
}

/* ── the claim button, which is the whole of the tension ─────────── */
function claimState(st, seat){
  const s = st.seats[seat];
  if (!s || st.phase !== 'play') return null;
  const rungs = T.rungsOf(st);
  /* THE LOWEST live rung you actually hold. Lowest, not highest: if
     you hold both the ambo and the terna, claiming the terna would
     void the ambo under our ruling 2 and cost you the points. Two
     taps, two shouts, and the right answer both times. */
  for (const k of rungs){
    const pz = st.prizes[k];
    if (pz.off || pz.done || pz.void) continue;
    for (let c = 0; c < s.cards.length; c++)
      if (T.holds(s.cards[c], s.marks[c], k) >= 0) return { ready:true, key:k, card:c };
  }
  const n = bestNear(st, seat);
  return n ? { ready:false, key:n.key, away:n.away } : null;
}
function bestNear(st, seat){
  const s = st.seats[seat];
  if (!s) return null;
  let best = null;
  for (let c = 0; c < s.cards.length; c++){
    const n = T.nearest(st, s.cards[c], s.marks[c]);
    if (n && (!best || n.away < best.away)) best = n;
  }
  return best;
}

function paintClaim(st){
  const b = U.ctx.btn('tb-claim');
  if (!b) return;
  /* REBIND, every time. The lobby put its own handler on this button
     (I AM READY / START) and the button itself survives the change of
     screen because it lives in party.js's frame, not in our stack —
     so without this line the first tap of the game runs the lobby's
     start handler and the claim silently does nothing. It shipped
     like that for about ten minutes and a full game caught it. */
  b.onclick = () => onClaim();
  const seat = isLocalSeat(U.peek) ? U.peek : U.seat;
  const cs = claimState(st, seat);
  b.disabled = false;
  if (!cs){
    b.className = 'btn sm ghost idle'; b.id = 'tb-claim';
    b.innerHTML = 'Waiting<span class="tb-sub">the game is over</span>';
    return;
  }
  const nm = T.prizeName(st, cs.key);
  if (cs.ready){
    b.className = 'btn sm armed'; b.id = 'tb-claim';
    b.innerHTML = esc(nm) + '!<span class="tb-sub">shout it before somebody else does</span>';
  } else if (cs.away === 1){
    b.className = 'btn sm ghost close'; b.id = 'tb-claim';
    b.innerHTML = 'One away<span class="tb-sub">one number off the ' + esc(nm) + '</span>';
  } else {
    b.className = 'btn sm ghost idle'; b.id = 'tb-claim';
    b.innerHTML = esc(nm) + '<span class="tb-sub">' + cs.away + ' to go</span>';
  }
}

/* ── the taps ───────────────────────────────────────────────────── */
function onCell(seat, ci, i){
  const st = T.state();
  if (!st || st.phase !== 'play') return;
  const on = !!st.seats[seat].marks[ci][i];
  const r = T.doMove(seat, { t: on ? 'unmark' : 'mark', c:ci, i }, 'tap');
  if (!r.ok){
    /* the one thing you are told off for: tapping a number that has
       not come out. It is not a mistake worth a modal, so it is a
       nudge and the square does not move. */
    sfx('ui.error');
    toast('Dak għadu fil-borża — that one is still in the bag.', true);
    return;
  }
  sfx(on ? 'ui.untoggle' : 'tombla.mark', { force:true });
  if (!on) U.just[ci + ':' + i] = 1;
  render();
}

function onClaim(){
  const st = T.state();
  if (!st) return;
  if (st.phase === 'lobby') return;           /* the lobby rebinds this button */
  const seat = isLocalSeat(U.peek) ? U.peek : U.seat;
  const cs = claimState(st, seat);
  if (!cs) return;
  if (!cs.ready){
    /* NOT an engine call. A fat finger must never cost a real player
       the claim lockout in apply() — that rule is there to stop a
       modified client hammering the wire, not to punish a thumb. */
    sfx('ui.error');
    toast(cs.away === 1
      ? 'Wieħed biss. Not yet — one more number.'
      : 'Mhux għadu. You are ' + cs.away + ' off the ' + T.prizeName(st, cs.key) + '.', true);
    return;
  }
  const r = T.doMove(seat, { t:'claim', c:cs.card, p:cs.key }, 'tap');
  if (!r.ok){ sfx('ui.error'); toast(r.why || 'Refused.', true); render(); }
}

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
  if (U.ctx.root.querySelector('.pt-over')) return;      /* already shown */
  const st = T.state();
  const o = T.over(st);
  if (!o) return;
  T.stopClock();
  const me = st.seats[U.seat];
  const wonTombla = st.prizes.tombla.done && st.prizes.tombla.seat === U.seat;
  const tone = wonTombla ? 'win' : (me.won.length ? 'draw' : 'lose');
  const winner = st.seats[o.seat];

  /* THE LEDGER. A win is the tombla. A "draw" is a night where you
     took something off the table but not the big one — which in this
     game is a real, common and perfectly respectable result, so it is
     recorded as itself rather than filed as a loss. */
  T.record(tone === 'win' ? 'w' : tone === 'draw' ? 'd' : 'l');
  /* ── js/stats.js: this is the one call, and it is here ──
     KARTI_STATS.record('tombla', {...}). stats.js accepts an id it has
     never heard of and gives it its own row, so nothing in that file
     has to change for this to count. See the note in the report for
     the optional shelf entry. */
  try {
    if (window.KARTI_STATS) KARTI_STATS.record('tombla', {
      result: tone === 'win' ? 'win' : tone === 'draw' ? 'draw' : 'loss',
      id: T.hooks.matchId(),
      moves: st.calls,
      score: me.pts
    });
  } catch(e){}
  T.saveSlot(null);

  const lines = st.seats.slice().sort((a, b) => b.pts - a.pts)
    .filter(s => s.pts > 0)
    .map(s => s.name + ' ' + s.pts)
    .slice(0, 4).join('  ·  ');

  P.ui.result(U.ctx, {
    tone,
    head: wonTombla ? (st.opts.mode === 'hall' ? 'FATTA' : 'TOMBLA')
                    : (o.end === 'flat' ? 'The bag is empty' : 'Somebody else'),
    why: o.end === 'flat'
      ? 'Ninety numbers and nobody shouted.'
      : (wonTombla ? 'You filled the kartella on call ' + o.at + '.'
                   : (winner ? winner.name : 'Somebody') + ' filled the kartella on call ' + o.at + '.'),
    quip: me.won.length
      ? 'You took ' + me.won.map(k => T.prizeName(st, k)).join(', ').toLowerCase() +
        '. ' + (lines ? lines : '')
      : 'Nothing at all. Somebody at this table was not looking at their kartella.',
    buttons: [
      { label:'Again', icon:'refresh', cls:'primary',
        go: () => { const o2 = st.opts; leave(); newGame(o2, st.seats.every(s => s.own === 'hot')); } },
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
    return 'Ninety numbers, fifteen on your kartella, and you mark your own. ' +
      'Up to eight of you at once, and nobody ever waits for a turn.' +
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
      cell: (ci, i) => { if (U) onCell(isLocalSeat(U.peek) ? U.peek : U.seat, ci, i); },
      claim: () => onClaim(),
      claimState: () => { const st = T.state(); return st ? claimState(st, U.seat) : null; },
      tabellone,
      fit: fitCards
    };
  }
} catch(e){}

})();
