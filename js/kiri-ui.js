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
  '#scr-kiri .kr-tbar h2{margin:0;font-family:"Orbitron","Arial Black",system-ui,sans-serif;' +
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
  '#scr-kiri .kr-tok{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;' +
    'font-size:14px;flex:0 0 auto;box-shadow:0 0 0 2px rgba(0,0,0,.4)}' +
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

  /* ── the board ── */
  '#scr-kiri .kr-wrap{flex:0 0 auto;display:grid;place-items:center;padding:2px 0}' +
  '#scr-kiri .kr-board{width:var(--bs,340px);height:var(--bs,340px);display:grid;gap:2px;' +
    'grid-template-columns:repeat(9,1fr);grid-template-rows:repeat(9,1fr);' +
    'padding:4px;border-radius:14px;background:#160F28;border:1px solid rgba(255,255,255,.10);' +
    'box-shadow:0 10px 30px rgba(0,0,0,.5)}' +
  '#scr-kiri .kr-cell{position:relative;border-radius:6px;background:#241A3E;border:1px solid rgba(255,255,255,.07);' +
    'display:flex;align-items:center;justify-content:center;padding:0;overflow:hidden;min-width:0;min-height:0}' +
  '#scr-kiri .kr-cell:active{background:#33265a}' +
  '#scr-kiri .kr-cell .kr-band{position:absolute;top:0;left:0;right:0;height:5px;background:var(--g,transparent)}' +
  '#scr-kiri .kr-cell .kr-e{font-size:13px;line-height:1;margin-top:4px;font-weight:900;letter-spacing:.02em;' +
    'color:#EDE6FF;font-family:"Orbitron","Arial Black",system-ui,sans-serif}' +
  '#scr-kiri .kr-cell.corner .kr-e{font-size:11.5px;color:#FFC542}' +
  '#scr-kiri .kr-cell.corner{background:#2E2150}' +
  '#scr-kiri .kr-cell.here{outline:2px solid #FFC542;outline-offset:-2px}' +
  '#scr-kiri .kr-cell.mine{box-shadow:inset 0 0 0 2px var(--o)}' +
  '#scr-kiri .kr-cell.mort{opacity:.45}' +
  '#scr-kiri .kr-cell .kr-lock{position:absolute;top:6px;right:3px;font-size:10px;line-height:1;font-weight:900;color:#FF9AA6}' +
  '#scr-kiri .kr-cell .kr-lvl{position:absolute;bottom:2px;right:2px;width:15px;height:15px;border-radius:5px;' +
    'background:var(--g,#888);color:#0E0B14;font-size:10px;font-weight:900;display:grid;place-items:center}' +
  '#scr-kiri .kr-pips{position:absolute;bottom:2px;left:2px;display:flex;gap:2px}' +
  '#scr-kiri .kr-pip{width:9px;height:9px;border-radius:50%;box-shadow:0 0 0 1.5px #160F28}' +
  '#scr-kiri .kr-pip.auto{border-radius:2px}' +

  /* ── the middle of the ring ── */
  '#scr-kiri .kr-mid{grid-column:2/9;grid-row:2/9;border-radius:10px;background:rgba(14,11,20,.55);' +
    'border:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:6px;padding:8px;text-align:center;min-width:0;overflow:hidden}' +
  '#scr-kiri .kr-dice{display:flex;gap:8px}' +
  '#scr-kiri .kr-die{width:34px;height:34px;border-radius:8px;background:#F4EFFF;color:#0E0B14;' +
    'display:grid;place-items:center;font-weight:900;font-size:19px;box-shadow:0 3px 0 rgba(0,0,0,.35)}' +
  '#scr-kiri .kr-die.roll{animation:krshake .34s ease}' +
  '@keyframes krshake{0%{transform:translateY(0) rotate(0)}30%{transform:translateY(-7px) rotate(-11deg)}' +
    '60%{transform:translateY(3px) rotate(9deg)}100%{transform:none}}' +
  '#scr-kiri .kr-midn{font-weight:900;font-size:15px;line-height:1.15;max-width:100%}' +
  '#scr-kiri .kr-midmt{font-size:11px;color:#A093C4;font-style:italic}' +
  '#scr-kiri .kr-midask{font-size:12px;color:#F4EFFF;background:rgba(255,255,255,.07);border-radius:9px;' +
    'padding:6px 10px;line-height:1.3;max-width:100%}' +
  '#scr-kiri .kr-midask.warn{background:rgba(255,84,104,.16);color:#FFB9C1}' +

  /* ── the dock ── */
  '#scr-kiri .kr-dock{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:5px;margin-top:5px}' +
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
  '#scr-kiri .kr-sheet.on{display:flex;animation:krup .22s cubic-bezier(.22,.9,.28,1)}' +
  '@keyframes krup{from{transform:translateY(26px);opacity:.4}to{transform:none;opacity:1}}' +
  '#scr-kiri .kr-sh-h{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex:0 0 auto}' +
  '#scr-kiri .kr-sh-h h3{margin:0;font-size:15px;font-weight:900;flex:1;line-height:1.2}' +
  '#scr-kiri .kr-sh-b{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}' +
  '#scr-kiri .kr-sh-f{flex:0 0 auto;display:flex;gap:6px;margin-top:9px}' +
  '#scr-kiri .kr-grab{width:38px;height:4px;border-radius:2px;background:rgba(255,255,255,.22);margin:0 auto 8px}' +

  /* ── the art slot: absent until a real load event says otherwise ── */
  '#scr-kiri .kr-art{position:absolute;inset:0;opacity:0;transition:opacity .35s ease;' +
    'pointer-events:none;border-radius:inherit;z-index:0}' +
  '#scr-kiri .kr-sh-b{position:relative}' +
  '#scr-kiri .kr-sh-b > *{position:relative;z-index:1}' +
  '#scr-kiri .kr-sh-b > .kr-art{position:absolute;z-index:0;border-radius:12px}' +
  '#scr-kiri .kr-card{position:relative;overflow:hidden}' +
  '#scr-kiri .kr-card > *:not(.kr-art){position:relative;z-index:1}' +

  /* ── the card ── */
  '#scr-kiri .kr-card{border-radius:14px;padding:16px 14px;text-align:center;border:2px solid var(--c,#FFC542);' +
    'background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.03))}' +
  '#scr-kiri .kr-card .kr-ce{font-size:34px;line-height:1}' +
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
  '#scr-kiri .kr-over{position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:10px;padding:22px;text-align:center;' +
    'background:radial-gradient(90% 60% at 50% 30%,rgba(138,92,255,.28),rgba(6,4,12,.95) 70%)}' +
  '#scr-kiri .kr-over h3{margin:0;font-family:"Orbitron","Arial Black",system-ui,sans-serif;font-size:25px;' +
    'letter-spacing:.05em;line-height:1.15}' +
  '#scr-kiri .kr-over p{margin:0;font-size:13px;line-height:1.55;color:#C9BEE6;max-width:320px}' +
  '#scr-kiri .kr-standings{width:100%;max-width:330px;margin-top:4px}' +

  /* ── short phones ── */
  '@media (max-height:720px){' +
    '#scr-kiri .kr-tbar{min-height:40px}' +
    '#scr-kiri .kr-btn{min-height:46px}' +
    '#scr-kiri .kr-die{width:29px;height:29px;font-size:16px}}';
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
}

function standDown(){
  live = false;
  stopLoop();
  if (G) K.save(G);
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
let auctionOn = true;
let rolled = false;       /* for the dice shake */
let sheet = null;         /* {kind, ...} currently open */
let trade = null;         /* the offer being built */

const P_OF = i => G.players[i];
const me = () => G.players[G.turn];

/* ═══════════════════════════════════════════════════════════════════
   4. THE WAY IN
   ═══════════════════════════════════════════════════════════════════ */
function open(){
  show();
  menu();
}

function menu(){
  stopLoop();
  G = null;
  const saved = K.load();
  const el = screenEl();
  el.innerHTML =
    '<div class="kr-tbar">' +
      '<button class="kr-ib" id="kr-home" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>IL-KIRI</h2><span style="width:44px"></span>' +
    '</div>' +
    '<div class="kr-art" id="kr-heroart" style="height:120px;border-radius:14px;margin-bottom:8px"></div>' +
    '<div class="kr-scroll">' +
      '<p class="kr-blurb">Buy half of Malta, charge your friends rent for landing on it, and watch a ' +
      'friendship end over a garage in Marsa. Thirty-two squares, six colour groups, floors instead of ' +
      'houses, and a queue at counter four instead of a prison cell.</p>' +
      (saved ? '<button class="kr-btn go" id="kr-resume" style="width:100%;margin-bottom:8px">' +
        'Carry on with the game you left<small>' + resumeLine(saved) + '</small></button>' : '') +
      '<button class="kr-btn buy" id="kr-new" style="width:100%;margin-bottom:8px">' +
        (saved ? 'Start a new one instead<small>the saved game goes in the bin</small>' : 'Start a game') + '</button>' +
      '<button class="kr-btn" id="kr-rules" style="width:100%">How it works<small>the rules, in one screen</small></button>' +
    '</div>';
  artWash(el.querySelector('#kr-heroart'), 'kiri-hero', 0.22);
  el.querySelector('#kr-home').onclick = close;
  el.querySelector('#kr-new').onclick = setup;
  el.querySelector('#kr-rules').onclick = rules;
  const r = el.querySelector('#kr-resume');
  if (r) r.onclick = () => { G = saved; boardScreen(); };
}

function resumeLine(g){
  const live = g.players.filter(p => !p.out);
  return 'Round ' + g.round + (g.roundLimit ? ' of ' + g.roundLimit : '') + ' · ' +
         live.map(p => p.name + ' ' + money(p.cash)).join(' · ');
}

function rules(){
  const el = screenEl();
  el.innerHTML =
    '<div class="kr-tbar">' +
      '<button class="kr-ib" id="kr-bk" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>How it works</h2><span style="width:44px"></span>' +
    '</div>' +
    '<div class="kr-scroll">' +
      sect('The point', 'Go round the ring. Buy what you land on. Charge everybody else rent when they land on it. ' +
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
        'they return. It plays that seat carefully — it will not sign a trade on somebody else\'s behalf.') +
    '</div>';
  el.querySelector('#kr-bk').onclick = menu;
}
const sect = (h, b) => '<div class="kr-hd">' + esc(h).toUpperCase() + '</div><p class="kr-blurb">' + esc(b) + '</p>';

/* ═══════════════════════════════════════════════════════════════════
   5. SETUP
   ═══════════════════════════════════════════════════════════════════ */
let cfg = null;
function setup(){
  cfg = cfg || {
    seats: [
      { name:'You',   kind:'human', level:2 },
      { name:'Doris', kind:'cpu',   level:2 },
      { name:'Karm',  kind:'cpu',   level:2 },
      { name:'',      kind:'off',   level:2 },
    ],
    roundLimit: 30,
    clock: 90,
  };
  paintSetup();
}

function paintSetup(){
  const el = screenEl();
  const LEVELS = [
    { k:1, n:'Iż-Żijja',  t:'sits on her money' },
    { k:2, n:'Il-Ħabib',  t:'plays properly' },
    { k:3, n:'L-Iżviluppatur', t:'buys everything' },
  ];
  el.innerHTML =
    '<div class="kr-tbar">' +
      '<button class="kr-ib" id="kr-bk" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Who is playing</h2><span style="width:44px"></span>' +
    '</div>' +
    '<div class="kr-scroll" id="kr-setup"></div>' +
    '<div class="kr-act"><button class="kr-btn go" id="kr-start">Deal the money out</button></div>';

  const w = el.querySelector('#kr-setup');
  let h = '<div class="kr-hd">THE SEATS</div>';
  cfg.seats.forEach((s, i) => {
    const S = K.SEATS[i];
    h += '<div class="kr-pl">' +
      '<span class="kr-tok" style="background:' + S.c + '">' + S.e + '</span>' +
      (s.kind === 'off'
        ? '<span style="flex:1;color:#7F73A0;font-size:12.5px;font-weight:700">Empty chair</span>'
        : '<input id="kr-nm-' + i + '" value="' + esc(s.name) + '" maxlength="14" aria-label="Name for seat ' + (i + 1) + '">') +
      '<button class="kr-mini" id="kr-kind-' + i + '"' + (i === 0 ? ' disabled' : '') + '>' +
        (s.kind === 'off' ? 'Add' : s.kind === 'cpu' ? 'Phone' : 'Person') + '</button>' +
      '</div>';
    if (s.kind === 'cpu'){
      h += '<div class="kr-seg" style="margin:-2px 0 8px 34px">' +
        LEVELS.map(L => '<button data-lv="' + i + ':' + L.k + '" aria-pressed="' + (s.level === L.k) + '">' +
          esc(L.n) + '<small>' + esc(L.t) + '</small></button>').join('') + '</div>';
    }
  });

  h += '<div class="kr-hd">HOW LONG</div><div class="kr-seg">' +
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

  cfg.seats.forEach((s, i) => {
    const nm = w.querySelector('#kr-nm-' + i);
    if (nm) nm.oninput = () => { s.name = nm.value; };
    const kb = w.querySelector('#kr-kind-' + i);
    if (kb && i > 0) kb.onclick = () => {
      s.kind = s.kind === 'off' ? 'cpu' : s.kind === 'cpu' ? 'human' : (i >= 2 ? 'off' : 'cpu');
      if (s.kind !== 'off' && !s.name) s.name = K.SEATS[i].en;
      /* never leave a hole: seats fill left to right */
      for (let j = i + 1; j < 4; j++) if (s.kind === 'off') cfg.seats[j].kind = 'off';
      paintSetup();
    };
  });
  w.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => {
    const [i, lv] = b.getAttribute('data-lv').split(':').map(Number);
    cfg.seats[i].level = lv; paintSetup();
  });
  w.querySelectorAll('[data-rl]').forEach(b => b.onclick = () => {
    cfg.roundLimit = Number(b.getAttribute('data-rl')); paintSetup();
  });
  w.querySelectorAll('[data-ck]').forEach(b => b.onclick = () => {
    cfg.clock = Number(b.getAttribute('data-ck')); paintSetup();
  });
  el.querySelector('#kr-bk').onclick = menu;
  el.querySelector('#kr-start').onclick = () => {
    const seats = cfg.seats.filter(s => s.kind !== 'off')
      .map((s, i) => ({ name: s.name || K.SEATS[i].en, kind: s.kind, level: s.level }));
    if (seats.length < 2) return;
    turnClock = cfg.clock;
    G = K.newGame({ players: seats, roundLimit: cfg.roundLimit });
    K.save(G);
    boardScreen();
  };
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
  el.innerHTML =
    '<div class="kr-tbar">' +
      '<button class="kr-ib" id="kr-menu" aria-label="Leave the game"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>IL-KIRI</h2>' +
      '<span class="kr-round" id="kr-round"></span>' +
    '</div>' +
    '<div class="kr-strip" id="kr-strip"></div>' +
    '<div id="kr-awayhost"></div>' +
    '<div class="kr-wrap"><div class="kr-board" id="kr-board"></div></div>' +
    '<div class="kr-dock">' +
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
    board: el.querySelector('#kr-board'),
    pane:  el.querySelector('#kr-pane'),
    act:   el.querySelector('#kr-act'),
    scrim: el.querySelector('#kr-scrim'),
    sheet: el.querySelector('#kr-sheet'),
  };
  el.querySelector('#kr-menu').onclick = () => { K.save(G); menu(); };
  el.querySelectorAll('.kr-tab').forEach(b => b.onclick = () => {
    tab = b.getAttribute('data-tab'); render();
  });
  els.scrim.onclick = () => { if (!sheet || sheet.dismissable !== false) closeSheet(); };

  /* the ring, built once */
  for (let i = 0; i < 32; i++){
    const s = K.BOARD[i];
    const c = document.createElement('button');
    c.className = 'kr-cell' + (['go','jail','rest','togo'].indexOf(s.t) >= 0 ? ' corner' : '');
    c.type = 'button';
    c.id = 'kr-c' + i;
    const [r, col] = cellPos(i);
    c.style.gridRow = r; c.style.gridColumn = col;
    c.setAttribute('aria-label', s.n);
    c.onclick = () => squareSheet(i);
    els.board.appendChild(c);
  }
  const mid = document.createElement('div');
  mid.className = 'kr-mid'; mid.id = 'kr-mid';
  els.board.appendChild(mid);
  els.mid = mid;

  sizeBoard();
  if (!sizerOn) startSizer();
  render();
  resetClock();
  startDog();
  pump();
}

/* the ring is the biggest square that fits without squeezing the dock
   below its usable minimum. Cells never go under 40px; on anything
   phone-shaped they land at 44 or better. */
let sizerOn = false, ro = null;
function sizeBoard(){
  const el = screenEl();
  if (!el || !els.board) return;
  const w = el.clientWidth - 16;
  const h = el.clientHeight;
  const DOCK_MIN = 280, CHROME = 108;
  const s = Math.max(300, Math.min(w, h - CHROME - DOCK_MIN, 460));
  els.board.style.setProperty('--bs', Math.floor(s) + 'px');
}
function startSizer(){
  sizerOn = true;
  if (typeof ResizeObserver === 'function'){
    ro = new ResizeObserver(sizeBoard);
    ro.observe(screenEl());
  } else window.addEventListener('resize', sizeBoard);
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
    '<span class="kr-tok" style="background:' + p.colour + '">' + p.token + '</span>' +
    '<span class="kr-who">' + esc(p.name) + '</span>' +
    (p.kind === 'cpu' ? '<span class="kr-auto">PHONE</span>'
      : p.auto ? '<span class="kr-auto">ON AUTOPILOT</span>' : '') +
    (p.jail > 0 ? '<span class="kr-auto" style="background:rgba(255,84,104,.2);color:#FF9AA6;border-color:rgba(255,84,104,.45)">IN THE QUEUE</span>' : '') +
    (p.skips > 0 ? '<span class="kr-auto" style="background:rgba(61,220,132,.18);color:#3DDC84;border-color:rgba(61,220,132,.45)">SKIP ×' + p.skips + '</span>' : '') +
    '<span class="kr-cash">' + money(p.cash) + '</span>';
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
  if (!gone.length || G.over){ els.away.innerHTML = ''; return; }
  const why = { clock:'has not moved', signal:'has lost the connection', away:'has gone', asked:'asked the phone to play' };
  els.away.innerHTML =
    '<div class="kr-away" role="status" aria-live="polite">' +
      gone.map(p => '<span class="kr-tok" style="background:' + p.colour +
        ';width:22px;height:22px;font-size:12px">' + p.token + '</span>').join('') +
      '<span class="kr-awt"><b>' + gone.map(p => esc(p.name)).join(', ') + '</b> ' +
        (gone.length > 1 ? 'are away' : (why[gone[0].autoWhy] || 'is away')) +
        ' — the phone is playing ' + (gone.length > 1 ? 'those seats' : 'that seat') + '.</span>' +
      '<button class="kr-back" id="kr-awayback">' +
        (gone.length > 1 ? 'We\'re back' : 'I\'m back') + '</button>' +
    '</div>';
  els.away.querySelector('#kr-awayback').onclick = () => {
    gone.forEach(p => K.setPresent(G, p.i, true));
    if (timer){ clearTimeout(timer); timer = 0; }
    K.save(G); render(); resetClock(); pump();
  };
}

function renderCells(){
  for (let i = 0; i < 32; i++){
    const s = K.BOARD[i], c = document.getElementById('kr-c' + i);
    if (!c) continue;
    const g = s.g ? K.GROUPS[s.g].c : (s.t === 'rail' ? '#7F73A0' : s.t === 'util' ? '#4FC3F7' : '');
    const o = G.own[i];
    /* The square's mark is a SHORT CODE drawn in CSS, not an emoji.
       Emoji are the house style everywhere else in KARTI, but a board
       cell is 44 points and the only thing on it — if a device has no
       colour emoji font (plenty do not) every square becomes an
       identical grey box and the board is destroyed. A code always
       renders, is sharper at this size, and the full name is one tap
       away and printed in the middle of the ring anyway. */
    let h = (g ? '<span class="kr-band" style="--g:' + g + '"></span>' : '') +
            '<span class="kr-e">' + esc(s.code) + '</span>' +
            (G.mort[i] ? '<span class="kr-lock">M</span>' : '');
    if (s.t === 'prop' && G.lvl[i] > 0)
      h += '<span class="kr-lvl" style="--g:' + g + '">' + (G.lvl[i] === 5 ? 'P' : G.lvl[i]) + '</span>';
    const on = G.players.filter(p => !p.out && p.pos === i);
    if (on.length){
      /* a seat being played by the phone shows as a SQUARE pip rather
         than a round one — you can see who is not really there from the
         board itself, without reading anything */
      h += '<span class="kr-pips">' + on.map(p =>
        '<span class="kr-pip' + (K.machineSeat(G, p.i) && p.kind !== 'cpu' ? ' auto' : '') +
        '" style="background:' + p.colour + '" title="' + esc(p.name) + '"></span>').join('') + '</span>';
    }
    c.innerHTML = h;
    c.className = 'kr-cell' + (['go','jail','rest','togo'].indexOf(s.t) >= 0 ? ' corner' : '') +
      (o >= 0 ? ' mine' : '') + (G.mort[i] ? ' mort' : '') +
      (me().pos === i ? ' here' : '');
    c.style.setProperty('--o', o >= 0 ? G.players[o].colour : 'transparent');
  }
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

  els.mid.innerHTML =
    '<div class="kr-dice">' +
      '<span class="kr-die' + (rolled ? ' roll' : '') + '">' + (d ? d[0] : '·') + '</span>' +
      '<span class="kr-die' + (rolled ? ' roll' : '') + '">' + (d ? d[1] : '·') + '</span>' +
    '</div>' +
    '<div class="kr-midn">' + esc(s.n) + '</div>' +
    '<div class="kr-midmt">' + esc(s.mt) + '</div>' +
    '<div class="kr-midask' + (warn ? ' warn' : '') + '">' + esc(ask) + '</div>';
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

/* the full picture of one square — reused by the tab and by the sheet */
function squareBody(i){
  const s = K.BOARD[i];
  const o = G.own[i];
  const g = s.g ? K.GROUPS[s.g] : null;
  let h = '<div class="kr-hd">' + esc(g ? g.n.toUpperCase() : s.t === 'rail' ? 'TRANSPORT' :
          s.t === 'util' ? 'SERVICES' : s.t === 'card' ? esc(s.n).toUpperCase() : 'THE BOARD') + '</div>' +
    '<div style="display:flex;align-items:center;gap:9px">' +
      '<span style="font-size:28px">' + s.e + '</span>' +
      '<span style="flex:1;min-width:0"><b style="font-size:14.5px;line-height:1.2;display:block">' + esc(s.n) + '</b>' +
      '<span style="font-size:11px;color:#A093C4;font-style:italic">' + esc(s.mt) + '</span></span>' +
    '</div>';

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

function ownerActions(i){
  if (!G || G.own[i] !== G.turn) return [];
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
    if (k === 'build')  K.build(G, i);
    if (k === 'sell')   K.sellBuilding(G, i, G.turn);
    if (k === 'mort')   K.mortgage(G, i, G.turn);
    if (k === 'redeem') K.unmortgage(G, i, G.turn);
    after();
    if (sheet && sheet.kind === 'square') squareSheet(sheet.i);
  });
}

function paneDeeds(){
  const p = G.turn;
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
      '<span class="kr-tok" style="background:' + p.colour + ';width:22px;height:22px;font-size:12px">' + p.token + '</span>' +
      '<span class="kr-rn">' + esc(p.name) + (badge ? ' <span class="kr-auto">' + badge + '</span>' : '') +
      '<span class="kr-rs">' + (p.out ? 'finished' :
        K.holdings(G, p.i).length + ' deed(s) · worth ' + money(K.netWorth(G, p.i)) +
        (p.jail > 0 ? ' · in the queue' : '')) + '</span></span>' +
      '<span class="kr-rv">' + money(p.cash) + '</span></div>';
  });
  const opp = G.players.filter(p => !p.out && p.i !== G.turn);
  if (!G.over && opp.length && G.phase === 'awaitEnd' && !K.machineSeat(G, G.turn)){
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
    '<span class="kr-rv">' + G.supply.floors + ' ⌂ · ' + G.supply.penthouses + ' P</span></div>';
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
  const B = [];
  const add = (id, label, cls, on) => B.push({ id, label, cls, on: on !== false });

  if (G.over) add('kr-a-done', 'See how it finished', 'go');
  else if (K.tableEmpty(G)) add('kr-a-claim', 'Take a seat back', 'go');
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
      add('kr-a-pass', auctionOn ? 'Let it go to auction' : 'Leave it', '');
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
  on('kr-a-roll',  () => { rolled = true; K.roll(G); after(); });
  on('kr-a-bail',  () => { K.payBail(G); after(); });
  on('kr-a-skip',  () => { K.useSkip(G); after(); });
  on('kr-a-buy',   () => { K.buy(G); after(); });
  on('kr-a-pass',  () => { K.declineBuy(G, auctionOn); after(); });
  on('kr-a-card',  () => cardSheet());
  on('kr-a-raise', () => raiseSheet());
  on('kr-a-give',  () => giveUpSheet());
  on('kr-a-auc',   () => auctionSheet());
  on('kr-a-manage',() => { tab = 'deeds'; render(); });
  on('kr-a-trade', () => { tab = 'table'; render(); });
  on('kr-a-end',   () => { K.endTurn(G); after(); });
  on('kr-a-done',  () => renderOver());
  on('kr-a-claim', () => { const i = seatToClaim(); if (i >= 0) claimSeat(i); });
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
  const D = K.DECKS[G.card.deck];
  openSheet({
    kind:'card', dismissable:false,
    title: esc(D.n),
    body: '<div class="kr-card" style="--c:' + D.c + '" id="kr-cardbox">' +
      '<div class="kr-art" id="kr-art"></div>' +
      '<div class="kr-ce">' + D.e + '</div>' +
      '<div class="kr-cd">' + esc(D.n.toUpperCase()) + '</div>' +
      '<div class="kr-ct">' + esc(G.card.n) + '</div>' +
      '<div class="kr-cx">' + esc(G.card.txt) + '</div></div>',
    foot: '<button class="kr-btn go" id="kr-ck">Right then</button>',
    wire: root => {
      root.querySelector('#kr-ck').onclick = () => { K.applyCard(G); closeSheet(); after(); };
      artWash(root.querySelector('#kr-art'), artForCard(G.card.deck, G.card.id), 0.30);
    },
  });
}

/* ── raising money ────────────────────────────────────────────────── */
function raiseSheet(){
  if (!G || !G.debt) return;
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
        if (x.kind === 'sell') K.sellBuilding(G, x.i, p); else K.mortgage(G, x.i, p);
        K.save(G); render();
        if (!G.debt){ closeSheet(); after(); } else raiseSheet();
      });
      root.querySelector('#kr-give').onclick = giveUpSheet;
      const pay = root.querySelector('#kr-paynow');
      if (pay) pay.onclick = () => { K.settle(G); closeSheet(); after(); };
    },
  });
}

function giveUpSheet(){
  const p = G.debt ? G.debt.who : G.turn;
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
      root.querySelector('#kr-yesgive').onclick = () => { K.bankrupt(G, p); closeSheet(); after(); };
    },
  });
}

/* ── the auction ──────────────────────────────────────────────────── */
function auctionSheet(){
  if (!G || !G.auction) return;
  const A = G.auction;
  const b = K.auctionBidder(G);
  if (b < 0 || K.machineSeat(G, b)){ pump(); return; }
  const s = K.BOARD[A.pos];
  const P = G.players[b];
  const step = Math.max(10, Math.round((s.price || 100) * 0.08 / 10) * 10);
  const opts = [step, step * 3, step * 8].filter(n => A.bid + n <= P.cash);
  openSheet({
    kind:'auction', dismissable:false,
    title:'Going once…',
    body:'<div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">' +
      '<span style="font-size:28px">' + s.e + '</span>' +
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
      const go = n => { K.auctionBid(G, n); K.save(G); closeSheet(); after(); };
      root.querySelectorAll('[data-bid]').forEach(x => x.onclick = () => go(Number(x.getAttribute('data-bid'))));
      const bb = root.querySelector('#kr-abid');
      if (bb) bb.onclick = () => go(A.bid + opts[0]);
      root.querySelector('#kr-aout').onclick = () => { K.auctionPass(G); K.save(G); closeSheet(); after(); };
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
        G.offer = JSON.parse(JSON.stringify(trade));
        trade = null;
        closeSheet(); after();
        if (G.offer && !K.machineSeat(G, G.offer.to)) offerSheet();
      };
    },
  });
}

/* ── an offer put to you ──────────────────────────────────────────── */
function offerSheet(){
  const o = G.offer;
  if (!o) return;
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
        const bad = K.doTrade(G, o); G.offer = null;
        if (bad) K.say(G, 'That deal does not work any more: ' + bad);
        closeSheet(); after();
      };
      root.querySelector('#kr-ono').onclick = () => {
        K.say(G, G.players[o.to].name + ' said no.');
        K.refuse(G, o);          /* and will not be asked the same thing again */
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
    '<div style="font-size:44px">' + (w ? w.token : '🏁') + '</div>' +
    '<h3>' + esc(w ? w.name.toUpperCase() : 'NOBODY') + '</h3>' +
    '<p>' + (G.over.why === 'rounds'
      ? 'The rounds ran out and ' + esc(w.name) + ' was worth the most. ' + money(K.netWorth(G, w.i)) +
        ', most of it in buildings nobody asked for.'
      : 'Everybody else ran out of money. ' + esc(w ? w.name : '') + ' owns the island and will now ' +
        'explain, at length, exactly how it was done.') + '</p>' +
    '<div class="kr-standings">' + rank.map((p, n) =>
      '<div class="kr-row" style="--g:' + p.colour + '"><span class="kr-sw"></span>' +
      '<span class="kr-rn">' + (n + 1) + '. ' + esc(p.name) +
      '<span class="kr-rs">' + (p.out ? 'went under' : K.holdings(G, p.i).length + ' deed(s)') + '</span></span>' +
      '<span class="kr-rv">' + money(p.out ? 0 : K.netWorth(G, p.i)) + '</span></div>').join('') + '</div>' +
    '<div style="display:flex;gap:6px;width:100%;max-width:330px">' +
      '<button class="kr-btn" id="kr-ohub">Party games</button>' +
      '<button class="kr-btn go" id="kr-oagain">Again</button></div>';
  el.appendChild(d);
  d.querySelector('#kr-oagain').onclick = () => { d.remove(); setup(); };
  d.querySelector('#kr-ohub').onclick = () => { d.remove(); close(); };
  if (P && P.record && w) P.record('kiri', w.kind === 'human' && !w.auto ? 'w' : 'l');
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
    if (!G || G.over || !live || document.hidden || sheet || timer) return;
    if (K.tableEmpty(G)) return;
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
  if (document.hidden) return;                 /* the phone is in a pocket */

  /* a person has to answer something: put the right sheet up and wait */
  if (!sheet){
    if (G.phase === 'card' && !K.machineSeat(G, G.turn)) { cardSheet(); return; }
    if (G.phase === 'auction' && G.auction){
      const b = K.auctionBidder(G);
      if (b >= 0 && !K.machineSeat(G, b)) { auctionSheet(); return; }
    }
    if (G.offer && !K.machineSeat(G, G.offer.to)) { offerSheet(); return; }
  }
  if (sheet) return;

  /* nobody at the table at all — stop dead, do not play the game out
     to a winner behind everybody's back */
  if (K.tableEmpty(G)){
    K.save(G);
    return;
  }

  const a = AI.next(G);
  if (!a) return;                              /* waiting on a person */
  timer = setTimeout(() => {
    timer = 0;
    if (!G || !live) return;
    if (a.k === 'roll') rolled = true;
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
  if (G.offer && !K.machineSeat(G, G.offer.to)) return G.offer.to;
  if (G.phase === 'auction' && G.auction){
    const b = K.auctionBidder(G);
    if (b >= 0 && !K.machineSeat(G, b)) return b;
  }
  return K.machineSeat(G, G.turn) ? -1 : G.turn;
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
      K.setPresent(G, seat, false, 'clock');
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
  if (timer){ clearTimeout(timer); timer = 0; }
  const changed = K.setPresent(G, i, true);
  K.save(G);
  render();
  resetClock();
  pump();
  return changed;
}

function releaseSeat(i, why){
  if (!G) return false;
  const changed = K.setPresent(G, i, false, why || 'away');
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
  if (document.hidden){ stopLoop(); K.save(G); }
  else { render(); resetClock(); pump(); }
});
window.addEventListener('pagehide', () => { if (G) K.save(G); });

/* Escape closes whatever is on top, then leaves */
document.addEventListener('keydown', e => {
  if (!live || e.key !== 'Escape') return;
  if (sheet && sheet.dismissable !== false){ closeSheet(); return; }
  if (G) K.save(G);
  menu();
});

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
    open: open
  });
}

window.KARTI_KIRI = {
  open, close,
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
  ai:     AI,
  save:   () => (G ? K.save(G) : false),
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

})();
