/* ═══════════════════════════════════════════════════════════════════
   KARTI — skarta-ui.js
   SKARTA — the table, the hand, and every question the rules ask you.

   js/skarta.js holds the rules and knows nothing about a screen. This
   file holds the screen and knows nothing about the rules: it asks the
   engine what is legal, paints it, and hands the answers back.

   HOUSE RULES THIS FILE OBEYS
     · index.html, css/ and sw.js belong to other parts of the build, so
       the stylesheet and the suit sprite are injected at runtime — the
       same pattern as js/mp.js and js/party.js.
     · it lives on #scr-party, borrowed from js/party.js, which already
       has the MutationObserver that stands the screen down if anything
       else navigates the app. That is why every timer in here is held
       on G and killed by teardown().
     · its own key is karti_skarta_v1. karti_save_* and karti_party_v1
       are not ours to write.
     · IT SHIPS WITHOUT ART. Every card, every suit mark and the back are
       drawn in CSS and SVG. If art/skarta/*.jpg ever appears the same
       markup wears it instead — see detectArt() and docs/SKARTA_ART.md.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function () {

const K = window.KARTI;
const P = window.KARTI_PARTY;
const E = window.KARTI_SKARTA_ENGINE;
if (!K || !P || !E) return;

const esc  = K.esc || (s => String(s));
const ico  = (n, l) => (window.ICO ? window.ICO(n, l) : '');
const ilb  = (n, h) => (window.ILB ? window.ILB(n, h) : h);
const toast = (m) => { try { if (K.toast) K.toast(m); } catch (e) {} };

/* ═══════════════════════════════════════════════════════════════════
   OUR OWN CORNER OF localStorage
   Not karti_save_*, not karti_party_v1. A shedding game is not part of
   anybody's duel profile and must survive a profile switch.
   ═══════════════════════════════════════════════════════════════════ */
const STORE = 'karti_skarta_v1';
let ST = { rec: { w: 0, l: 0 }, pref: { seats: 3, humans: 1, level: 3 } };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object') {
    if (j.rec && typeof j.rec === 'object') ST.rec = { w: j.rec.w | 0, l: j.rec.l | 0 };
    if (j.pref && typeof j.pref === 'object') Object.assign(ST.pref, j.pref);
  }
} catch (e) {}
function persist() { try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch (e) {} }

/* ═══════════════════════════════════════════════════════════════════
   THE ART HOOK
   There is none yet, and the game does not care. If the pack from
   docs/SKARTA_ART.md is ever dropped into art/skarta/ the sentinel
   loads, .sk-art goes on the wrapper, and the CSS below swaps the flat
   suit fills for the painted windows. Nothing else changes.
   ═══════════════════════════════════════════════════════════════════ */
const ART = { on: false, tried: false };
const SENTINELS = ['art/skarta/back.jpg', 'art/skarta/face-festa.jpg'];
function detectArt(then) {
  if (ART.tried) { then(ART.on); return; }
  ART.tried = true;
  let left = SENTINELS.length, ok = true;
  const done = () => { if (--left) return; ART.on = ok; then(ok); };
  for (const src of SENTINELS) {
    const im = new Image();
    im.onload = done;
    im.onerror = () => { ok = false; done(); };
    im.src = src;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   THE SUIT SPRITE
   Four Maltese marks and five action glyphs, drawn here rather than
   typed as emoji: this app does not do emoji in its chrome, and an
   emoji suit would render as four different pictures across four
   phones — which in a game where you match by suit is not cosmetic.
   ═══════════════════════════════════════════════════════════════════ */
const SPRITE =
  /* FESTA — a firework going off over the square */
  '<symbol id="sk-s-festa" viewBox="0 0 24 24">' +
    '<path d="M12 1.2l1.9 4.6 4.6 1.9-4.6 1.9L12 14.2l-1.9-4.6L5.5 7.7l4.6-1.9z"/>' +
    '<circle cx="4.4" cy="14.1" r="1.7"/><circle cx="19.6" cy="14.1" r="1.7"/>' +
    '<circle cx="8.2" cy="20.4" r="1.4"/><circle cx="15.8" cy="20.4" r="1.4"/>' +
    '<circle cx="12" cy="17.6" r="1.1"/></symbol>' +
  /* BAĦAR — three sea swells */
  '<symbol id="sk-s-bahar" viewBox="0 0 24 24">' +
    '<path d="M1.2 7.4c2.4-2.6 4.9-2.6 7.3 0 2.4 2.6 4.9 2.6 7.3 0 2.4-2.6 4.9-2.6 7.3 0v3.4c-2.4-2.6-4.9-2.6-7.3 0-2.4 2.6-4.9 2.6-7.3 0-2.4-2.6-4.9-2.6-7.3 0z"/>' +
    '<path d="M1.2 14.4c2.4-2.6 4.9-2.6 7.3 0 2.4 2.6 4.9 2.6 7.3 0 2.4-2.6 4.9-2.6 7.3 0v3.4c-2.4-2.6-4.9-2.6-7.3 0-2.4 2.6-4.9 2.6-7.3 0-2.4-2.6-4.9-2.6-7.3 0z"/></symbol>' +
  /* RAŻŻETT — a rubble wall, built without a drop of cement */
  '<symbol id="sk-s-razzett" viewBox="0 0 24 24">' +
    '<path d="M2.1 4.6h8.6v4.6H2.1zM12.3 4.6h9.6v4.6h-9.6z"/>' +
    '<path d="M2.1 10.8h5.4v4.6H2.1zM9.1 10.8h11.2v4.6H9.1z"/>' +
    '<path d="M2.1 17h13.1v4.4H2.1zM16.8 17h5.1v4.4h-5.1z"/></symbol>' +
  /* BAJTRA — the prickly pear, spines and all */
  '<symbol id="sk-s-bajtra" viewBox="0 0 24 24">' +
    /* the spines have to survive being drawn at 13px in a card corner, so
       they are six fat wedges, not the dozen fine hairs a real one has */
    '<path d="M12 3.4c3.4 0 5.9 3.3 5.9 7.9s-2.5 7.9-5.9 7.9-5.9-3.3-5.9-7.9 2.5-7.9 5.9-7.9z"/>' +
    '<path d="M12 0l1.6 3.8h-3.2zM5.2 3.9l3.6 2.2-2.3 2.2zM18.8 3.9l-1.3 4.4-2.3-2.2z' +
      'M3.3 13.1l3.9.5-1.4 2.8zM20.7 13.1l-2.5 3.3-1.4-2.8zM12 24l-1.6-3.8h3.2z"/></symbol>' +
  /* ERĠA\' EJJA GĦADA — the shutter comes down on your form */
  '<symbol id="sk-a-skip" viewBox="0 0 24 24">' +
    '<path d="M12 1.6A10.4 10.4 0 1 0 12 22.4 10.4 10.4 0 0 0 12 1.6zm0 3a7.4 7.4 0 0 1 4.4 1.5L6.1 16.4A7.4 7.4 0 0 1 12 4.6zm0 14.8a7.4 7.4 0 0 1-4.4-1.5L17.9 7.6A7.4 7.4 0 0 1 12 19.4z"/></symbol>' +
  /* DAWRA TA\' MARSA — everybody suddenly going the other way */
  '<symbol id="sk-a-reverse" viewBox="0 0 24 24">' +
    '<path d="M7.6 2.4l4.6 4.3H8.9c-2.6 0-4.4 1.7-4.4 4.1v3.5H1.3v-3.5c0-4.1 3.2-7.2 7.6-7.2h3.3z"/>' +
    '<path d="M4.5 12.9l3.1 3.4-3.1 3.4-3.2-3.4z"/>' +
    '<path d="M16.4 21.6l-4.6-4.3h3.3c2.6 0 4.4-1.7 4.4-4.1V9.7h3.2v3.5c0 4.1-3.2 7.2-7.6 7.2h-3.3z"/>' +
    '<path d="M19.5 11.1l-3.1-3.4 3.1-3.4 3.2 3.4z"/></symbol>' +
  /* IL-KUNJATA — she brought two bags you did not ask for */
  '<symbol id="sk-a-draw2" viewBox="0 0 24 24">' +
    '<path d="M2.2 5.1h10.2v13.8H2.2z"/>' +
    '<path d="M13.9 2.4h7.9v16.5h-7.9z" opacity=".72"/></symbol>' +
  /* IL-KAŻIN — four clubs, one bar, pick your side */
  '<symbol id="sk-a-wild" viewBox="0 0 24 24">' +
    '<path d="M2.4 2.4h8.7v8.7H2.4z"/><path d="M12.9 2.4h8.7v8.7h-8.7z" opacity=".72"/>' +
    '<path d="M2.4 12.9h8.7v8.7H2.4z" opacity=".72"/><path d="M12.9 12.9h8.7v8.7h-8.7z"/></symbol>' +
  /* IL-KAXXA INFERNALI — the crate, and what comes out of it */
  '<symbol id="sk-a-kaxxa" viewBox="0 0 24 24">' +
    '<path d="M12 .4l1.5 3.9 3.6-2-1.4 3.9 4.1-.4-3.1 2.7 3.8 1.6-4 1 2.3 3.4-4-1.1.6 4.1-2.9-2.9-2.9 2.9.6-4.1-4 1.1 2.3-3.4-4-1 3.8-1.6L4.2 5.8l4.1.4L6.9 2.3l3.6 2z"/>' +
    '<path d="M4.6 19.2h14.8v4.4H4.6z"/></symbol>';

function injectSprite() {
  if (document.getElementById('sk-sprite')) return;
  const h = document.createElement('div');
  h.id = 'sk-sprite';
  h.setAttribute('aria-hidden', 'true');
  h.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  h.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><defs>' + SPRITE + '</defs></svg>';
  document.body.appendChild(h);
}
const glyph = (sym, cls) =>
  '<svg class="sk-g' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" ' +
  'focusable="false"><use href="#' + sym + '"></use></svg>';

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET
   Everything scoped under #scr-party .sk-wrap so it cannot reach a
   single rule in css/ or in the shell. Nothing here puts transform,
   filter, backdrop-filter or will-change on anything that could be an
   ancestor of .tabbar — that lives in #scr-home and we are a sibling.
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS() {
  injectSprite();
  if (document.getElementById('sk-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'sk-runtime-css';
  st.textContent =
    /* ── the four suits, as CSS variables so one line changes a suit ── */
    '#scr-party .sk-wrap{--sk-festa:#E8452C;--sk-festa2:#8E1B0E;' +
      '--sk-bahar:#2E9BE8;--sk-bahar2:#0E4A7A;' +
      '--sk-razzett:#49B44C;--sk-razzett2:#1C5E20;' +
      '--sk-bajtra:#F5A81C;--sk-bajtra2:#8A5300;' +
      '--sk-none:#5A5470;--sk-none2:#2A2440}' +

    /* ── the frame borrowed from party.js, re-purposed ────────────── */
    '#scr-party .sk-wrap .pt-host{display:block;align-items:stretch;padding:0;overflow:hidden}' +
    '#scr-party .sk-table{height:100%;display:flex;flex-direction:column;gap:6px;min-height:0}' +

    /* ── who else is at the table ──────────────────────────────────── */
    '#scr-party .sk-opps{flex:0 0 auto;display:flex;gap:6px;justify-content:center;flex-wrap:wrap}' +
    '#scr-party .sk-opp{position:relative;flex:1 1 0;min-width:0;max-width:132px;' +
      'display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px 5px;' +
      'border-radius:12px;background:rgba(255,255,255,.045);border:1px solid var(--line);' +
      'transition:border-color .18s,background .18s}' +
    '#scr-party .sk-opp.now{border-color:var(--gold);background:rgba(255,197,66,.14)}' +
    '#scr-party .sk-opp.singed{border-color:rgba(232,69,44,.55)}' +
    '#scr-party .sk-opp-n{font-family:var(--disp);font-weight:900;font-size:10px;letter-spacing:.07em;' +
      'max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--txt)}' +
    '#scr-party .sk-opp-c{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--dim)}' +
    '#scr-party .sk-opp-c b{font-family:var(--disp);font-size:14px;color:var(--txt)}' +
    '#scr-party .sk-mini{display:flex}' +
    '#scr-party .sk-mini i{width:7px;height:11px;border-radius:2px;margin-left:-3px;' +
      'background:linear-gradient(150deg,#4B3A78,#241A3E);border:1px solid rgba(255,255,255,.28)}' +
    '#scr-party .sk-mini i:first-child{margin-left:0}' +
    '#scr-party .sk-tagline{font-size:9px;letter-spacing:.06em;font-weight:800;' +
      'text-transform:uppercase;color:var(--dim2)}' +
    '#scr-party .sk-opp.said .sk-tagline{color:var(--ok)}' +
    '#scr-party .sk-opp.singed .sk-tagline{color:var(--hot)}' +
    '#scr-party .sk-catch{position:absolute;inset:0;border:0;border-radius:12px;cursor:pointer;' +
      'background:rgba(255,84,104,.92);color:#fff;font-family:var(--disp);font-weight:900;' +
      'font-size:10px;letter-spacing:.08em;animation:skPulse .8s ease-in-out infinite}' +
    '@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.55}}' +

    /* ── the felt ─────────────────────────────────────────────────── */
    '#scr-party .sk-felt{flex:1 1 auto;min-height:0;position:relative;display:flex;' +
      'align-items:center;justify-content:center;gap:14px;padding:8px;border-radius:16px;' +
      'background:radial-gradient(120% 90% at 50% 30%,#20323A 0%,#101A20 72%,#0B1216 100%);' +
      'border:1px solid var(--line);overflow:hidden}' +
    /* the suit in force, painted as a wash behind the pile so you cannot
       miss it after a Każin has changed it under you */
    '#scr-party .sk-felt::after{content:"";position:absolute;inset:-30%;pointer-events:none;' +
      'background:radial-gradient(closest-side,var(--sk-now,transparent) 0%,transparent 68%);' +
      'opacity:.30;transition:background .3s}' +
    '#scr-party .sk-slot{position:relative;z-index:1;display:flex;flex-direction:column;' +
      'align-items:center;gap:5px}' +
    '#scr-party .sk-pile{position:relative;display:grid}' +
    '#scr-party .sk-pile .sk-pl{grid-area:1/1;transform:rotate(var(--r))}' +
    '#scr-party .sk-pile .sk-pl:last-child{z-index:2}' +
    '#scr-party .sk-pile .sk-pl:not(:last-child) .sk-card{filter:brightness(.72)}' +
    '#scr-party .sk-slot-l{font-family:var(--disp);font-weight:900;font-size:8.5px;' +
      'letter-spacing:.12em;color:var(--dim2)}' +
    '#scr-party .sk-deck{position:relative;border:0;background:none;padding:0;cursor:pointer}' +
    '#scr-party .sk-deck:disabled{opacity:.5;cursor:default}' +
    '#scr-party .sk-deck .sk-card{box-shadow:0 4px 14px rgba(0,0,0,.5),' +
      '4px -4px 0 -1px #241A3E,4px -4px 0 0 rgba(255,255,255,.14),' +
      '8px -8px 0 -1px #241A3E,8px -8px 0 0 rgba(255,255,255,.10)}' +

    /* ── the chain, and the direction of play ─────────────────────── */
    '#scr-party .sk-chain{position:absolute;top:8px;left:0;right:0;z-index:2;text-align:center;' +
      'pointer-events:none}' +
    '#scr-party .sk-chain span{display:inline-block;padding:5px 11px;border-radius:99px;' +
      'font-family:var(--disp);font-weight:900;font-size:11px;letter-spacing:.08em;color:#2A0A05;' +
      'background:linear-gradient(180deg,#FFD36B,#F5A81C);box-shadow:0 3px 12px rgba(0,0,0,.5)}' +
    '#scr-party .sk-chain.shut span{background:linear-gradient(180deg,#FF8A7A,#E8452C);color:#FFF}' +
    '#scr-party .sk-dir{position:absolute;bottom:7px;right:9px;z-index:2;display:flex;' +
      'align-items:center;gap:5px;font-size:9px;font-weight:800;letter-spacing:.09em;' +
      'text-transform:uppercase;color:var(--dim2)}' +
    '#scr-party .sk-dir .sk-g{width:15px;height:15px;fill:var(--dim)}' +
    '#scr-party .sk-dir.rev .sk-g{transform:scaleX(-1)}' +

    /* ══ A CARD ═══════════════════════════════════════════════════════
       Not an oval on a colour: a tilted Maltese tile panel with the suit
       mark in two corners. Deliberately its own object, and it must stay
       that way — see the warning at the top of js/skarta.js.            */
    '#scr-party .sk-card{--cw:64px;--s1:var(--sk-none);--s2:var(--sk-none2);' +
      'position:relative;width:var(--cw);aspect-ratio:59/86;flex:0 0 auto;' +
      'border-radius:calc(var(--cw)/8);overflow:hidden;color:#fff;' +
      'background:linear-gradient(158deg,var(--s1),var(--s2));' +
      'box-shadow:inset 0 0 0 2px rgba(255,255,255,.9),inset 0 0 0 3px rgba(0,0,0,.28),' +
      '0 3px 9px rgba(0,0,0,.45)}' +
    '#scr-party .sk-card.s-festa{--s1:var(--sk-festa);--s2:var(--sk-festa2)}' +
    '#scr-party .sk-card.s-bahar{--s1:var(--sk-bahar);--s2:var(--sk-bahar2)}' +
    '#scr-party .sk-card.s-razzett{--s1:var(--sk-razzett);--s2:var(--sk-razzett2)}' +
    '#scr-party .sk-card.s-bajtra{--s1:var(--sk-bajtra);--s2:var(--sk-bajtra2)}' +
    /* the tile: a rotated rounded square, NOT an ellipse */
    '#scr-party .sk-card .sk-tile{position:absolute;left:11%;right:11%;top:17%;bottom:17%;' +
      'border-radius:calc(var(--cw)/7);background:rgba(255,255,255,.93);transform:rotate(-9deg);' +
      'box-shadow:0 1px 0 rgba(0,0,0,.18)}' +
    '#scr-party .sk-card .sk-mid{position:absolute;inset:0;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:1px}' +
    '#scr-party .sk-card .sk-num{font-family:var(--disp);font-weight:900;line-height:.9;' +
      'font-size:calc(var(--cw)*.52);color:var(--s2);' +
      'text-shadow:0 1px 0 rgba(255,255,255,.6)}' +
    '#scr-party .sk-card .sk-mid .sk-g{width:calc(var(--cw)*.42);height:calc(var(--cw)*.42);' +
      'fill:var(--s2)}' +
    '#scr-party .sk-card .sk-cap{font-family:var(--disp);font-weight:900;color:var(--s2);' +
      'font-size:calc(var(--cw)*.125);letter-spacing:0;line-height:1;max-width:94%;' +
      'text-align:center;white-space:nowrap}' +
    '#scr-party .sk-card .sk-cnr{position:absolute;width:calc(var(--cw)*.2);' +
      'height:calc(var(--cw)*.2);fill:rgba(255,255,255,.95)}' +
    '#scr-party .sk-card .sk-cnr.tl{top:4%;left:5%}' +
    '#scr-party .sk-card .sk-cnr.br{bottom:4%;right:5%;transform:rotate(180deg)}' +
    '#scr-party .sk-card .sk-pip{position:absolute;font-family:var(--disp);font-weight:900;' +
      'font-size:calc(var(--cw)*.19);line-height:1;color:rgba(255,255,255,.95)}' +
    '#scr-party .sk-card .sk-pip.tl{top:4.5%;left:calc(5% + var(--cw)*.23)}' +
    '#scr-party .sk-card .sk-pip.br{bottom:4.5%;right:calc(5% + var(--cw)*.23)}' +
    /* the two suitless cards get all four suits in the field */
    '#scr-party .sk-card.k-wild,#scr-party .sk-card.k-kaxxa{' +
      'background:conic-gradient(from 220deg,var(--sk-festa) 0 25%,var(--sk-bajtra) 0 50%,' +
      'var(--sk-razzett) 0 75%,var(--sk-bahar) 0)}' +
    '#scr-party .sk-card.k-wild .sk-num,#scr-party .sk-card.k-kaxxa .sk-num,' +
      '#scr-party .sk-card.k-wild .sk-cap,#scr-party .sk-card.k-kaxxa .sk-cap{color:#1A1230}' +
    '#scr-party .sk-card.k-wild .sk-mid .sk-g,#scr-party .sk-card.k-kaxxa .sk-mid .sk-g{fill:#1A1230}' +
    '#scr-party .sk-card.k-kaxxa{box-shadow:inset 0 0 0 2px #FFD36B,inset 0 0 0 3px rgba(0,0,0,.3),' +
      '0 3px 12px rgba(245,168,28,.4)}' +
    /* the back */
    '#scr-party .sk-card.back{background:linear-gradient(150deg,#4B3A78,#1A1230)}' +
    '#scr-party .sk-card.back .sk-tile{background:rgba(255,255,255,.06);' +
      'box-shadow:inset 0 0 0 2px rgba(255,197,66,.5)}' +
    '#scr-party .sk-card.back .sk-mid .sk-g{fill:var(--gold);opacity:.9}' +
    '#scr-party .sk-card.back .sk-cap{color:var(--gold);letter-spacing:.05em}' +

    /* ── your hand ────────────────────────────────────────────────── */
    '#scr-party .sk-handwrap{flex:0 0 auto;position:relative}' +
    /* "safe center" keeps a small hand centred and still lets a big one scroll
       without the first card being clipped somewhere unreachable */
    '#scr-party .sk-hand{display:flex;justify-content:safe center;' +
      'overflow-x:auto;overflow-y:hidden;padding:10px 10px 12px;' +
      'scrollbar-width:none;-webkit-overflow-scrolling:touch}' +
    '#scr-party .sk-hand::-webkit-scrollbar{display:none}' +
    '#scr-party .sk-hand button{border:0;background:none;padding:0;margin-left:-20px;' +
      'border-radius:9px;cursor:pointer;transition:transform .16s var(--ease),opacity .16s}' +
    '#scr-party .sk-hand button:first-child{margin-left:0}' +
    '#scr-party .sk-hand button .sk-card{--cw:70px}' +
    '#scr-party .sk-hand button.no{opacity:.4}' +
    '#scr-party .sk-hand button.yes{transform:translateY(-9px)}' +
    '#scr-party .sk-hand button.yes .sk-card{box-shadow:inset 0 0 0 2px #FFF,' +
      'inset 0 0 0 3px rgba(0,0,0,.28),0 0 0 2px var(--gold),0 6px 16px rgba(0,0,0,.55)}' +
    '#scr-party .sk-hand button:active{transform:translateY(-14px)}' +
    '#scr-party .sk-hand button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}' +
    '#scr-party .sk-hint{font-size:10.5px;color:var(--dim2);text-align:center;padding:0 8px 2px;' +
      'min-height:14px}' +

    /* the commentary must never squeeze out whose go it is */
    '#scr-party .sk-wrap .pt-who{flex:0 0 auto;overflow:visible}' +
    '#scr-party .sk-wrap .pt-note{flex:1 1 auto;min-width:0;overflow:hidden;' +
      'text-overflow:ellipsis;white-space:nowrap}' +

    /* ── the sheets: name a suit, choose a charge, read the rules ──── */
    '#scr-party .sk-sheet{position:absolute;inset:0;z-index:40;display:flex;align-items:flex-end;' +
      'justify-content:center;background:rgba(6,4,12,.72);padding:12px}' +
    '#scr-party .sk-sheet .sk-panel{width:100%;max-width:420px;max-height:100%;overflow-y:auto;' +
      'background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line2);' +
      'border-radius:18px;padding:15px 14px calc(15px + var(--sab,0px));' +
      'box-shadow:0 -8px 40px rgba(0,0,0,.6);animation:skUp .22s var(--ease)}' +
    '@keyframes skUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}' +
    '#scr-party .sk-sheet h3{font-family:var(--disp);font-weight:900;font-size:14px;' +
      'letter-spacing:.09em;margin:0 0 4px;color:var(--gold)}' +
    '#scr-party .sk-sheet p{font-size:12px;line-height:1.5;color:var(--dim);margin:0 0 12px}' +
    '#scr-party .sk-suits{display:grid;grid-template-columns:1fr 1fr;gap:9px}' +
    '#scr-party .sk-suitbtn{display:flex;align-items:center;gap:9px;padding:12px 11px;min-height:58px;' +
      'border-radius:14px;border:2px solid rgba(255,255,255,.2);cursor:pointer;color:#fff;' +
      'background:linear-gradient(150deg,var(--s1),var(--s2));text-align:left}' +
    '#scr-party .sk-suitbtn:active{transform:scale(.97)}' +
    '#scr-party .sk-suitbtn .sk-g{width:24px;height:24px;fill:#fff;flex:0 0 auto}' +
    '#scr-party .sk-suitbtn b{font-family:var(--disp);font-weight:900;font-size:12px;' +
      'letter-spacing:.08em;display:block}' +
    '#scr-party .sk-suitbtn i{font-style:normal;font-size:9.5px;opacity:.85;display:block}' +
    '#scr-party .sk-suitbtn .sk-have{margin-left:auto;font-family:var(--disp);font-size:11px;' +
      'font-weight:900;opacity:.9;flex:0 0 auto}' +
    /* the charge: two very different-looking buttons, because it is a
       real decision and must never look like a confirm dialog */
    '#scr-party .sk-charge{display:grid;gap:10px}' +
    '#scr-party .sk-chg{display:grid;grid-template-columns:auto 1fr;column-gap:12px;row-gap:3px;' +
      'align-items:center;padding:13px 13px;border-radius:15px;cursor:pointer;text-align:left;' +
      'border:2px solid var(--line2);background:rgba(255,255,255,.05);color:var(--txt)}' +
    '#scr-party .sk-chg:active{transform:scale(.98)}' +
    '#scr-party .sk-chg .sk-big{grid-row:1/3;font-family:var(--disp);font-weight:900;font-size:30px;' +
      'line-height:1;letter-spacing:-.02em}' +
    '#scr-party .sk-chg b{font-family:var(--disp);font-weight:900;font-size:12px;letter-spacing:.07em}' +
    '#scr-party .sk-chg i{font-style:normal;font-size:11px;line-height:1.4;color:var(--dim)}' +
    '#scr-party .sk-chg.small{border-color:rgba(61,220,132,.5);background:rgba(61,220,132,.10)}' +
    '#scr-party .sk-chg.small .sk-big{color:var(--ok)}' +
    '#scr-party .sk-chg.big{border-color:rgba(232,69,44,.55);background:rgba(232,69,44,.12)}' +
    '#scr-party .sk-chg.big .sk-big{color:var(--hot)}' +
    '#scr-party .sk-chg .sk-cost{grid-column:2;font-size:10px;font-weight:800;letter-spacing:.05em;' +
      'text-transform:uppercase;color:var(--hot)}' +
    '#scr-party .sk-chg.small .sk-cost{color:var(--ok)}' +

    /* ── the rules sheet ──────────────────────────────────────────── */
    '#scr-party .sk-rule{display:grid;grid-template-columns:34px 1fr;column-gap:11px;row-gap:2px;' +
      'padding:9px 0;border-top:1px solid var(--line)}' +
    '#scr-party .sk-rule:first-of-type{border-top:0}' +
    '#scr-party .sk-rule .sk-g{grid-row:1/4;width:28px;height:28px;fill:var(--gold);margin-top:2px}' +
    '#scr-party .sk-rule b{font-family:var(--disp);font-weight:900;font-size:11px;letter-spacing:.07em;' +
      'color:var(--txt)}' +
    '#scr-party .sk-rule i{font-style:normal;font-size:11px;line-height:1.45;color:var(--dim)}' +
    '#scr-party .sk-rule s{text-decoration:none;font-size:10.5px;line-height:1.45;color:var(--gold)}' +

    /* ── the handover curtain, for more than one human on one phone ── */
    '#scr-party .sk-curtain{position:absolute;inset:0;z-index:50;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;' +
      'background:radial-gradient(90% 60% at 50% 40%,#241A3E,#0E0B14 75%)}' +
    '#scr-party .sk-curtain h3{font-family:var(--disp);font-weight:900;font-size:20px;' +
      'letter-spacing:.1em;margin:0;color:var(--gold)}' +
    '#scr-party .sk-curtain p{font-size:12.5px;line-height:1.55;color:var(--dim);margin:0;max-width:290px}' +

    /* ── the setup sheet ──────────────────────────────────────────── */
    '#scr-party .sk-seats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}' +
    '#scr-party .sk-seatbtn{padding:11px 6px;border-radius:13px;border:1.5px solid var(--line);' +
      'background:rgba(255,255,255,.05);color:var(--txt);cursor:pointer;text-align:center}' +
    '#scr-party .sk-seatbtn b{display:block;font-family:var(--disp);font-weight:900;font-size:17px}' +
    '#scr-party .sk-seatbtn i{font-style:normal;font-size:9.5px;color:var(--dim);letter-spacing:.05em}' +
    '#scr-party .sk-seatbtn.on{border-color:var(--gold);background:rgba(255,197,66,.14)}' +
    '#scr-party .sk-seatbtn.on b{color:var(--gold)}' +
    '#scr-party .sk-seatbtn:disabled{opacity:.35;cursor:default}' +
    '#scr-party .sk-fan{display:flex;justify-content:center;padding:4px 0 2px}' +
    '#scr-party .sk-fan .sk-card{--cw:52px;margin-left:-16px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.9),' +
      'inset 0 0 0 3px rgba(0,0,0,.28),0 4px 12px rgba(0,0,0,.5)}' +
    '#scr-party .sk-fan .sk-card:first-child{margin-left:0}' +
    '#scr-party .sk-fan .sk-card:nth-child(1){transform:rotate(-9deg) translateY(3px)}' +
    '#scr-party .sk-fan .sk-card:nth-child(2){transform:rotate(-4deg)}' +
    '#scr-party .sk-fan .sk-card:nth-child(4){transform:rotate(4deg)}' +
    '#scr-party .sk-fan .sk-card:nth-child(5){transform:rotate(9deg) translateY(3px)}' +


    /* ══ THE ART PACK, IF IT EVER ARRIVES ═════════════════════════════
       docs/SKARTA_ART.md + art/skarta-prompts.jsonl generate sixteen
       files into art/skarta/. Nothing here REPLACES the placeholder look
       — every rule layers the generated image over it, so one missing
       file falls back to the CSS card instead of to a blank rectangle.
       .sk-art only goes on once TWO sentinels have decoded, so a
       half-uploaded folder cannot half-skin the game.

       There is deliberately NO generated suit mark. The four marks in the
       sprite above are SVG because the size that matters is 13px in a card
       corner, and a raster would be worse there and no better in the picker.
       Chess and dama generate nothing at all for the same reason.        */
    '#scr-party .sk-wrap.sk-art .sk-felt{' +
      'background-image:url("art/skarta/table.jpg"),' +
      'radial-gradient(120% 90% at 50% 30%,#20323A 0%,#101A20 72%,#0B1216 100%);' +
      'background-size:cover;background-position:center}' +
    /* the back */
    '#scr-party .sk-wrap.sk-art .sk-card.back{' +
      'background-image:url("art/skarta/back.jpg"),linear-gradient(150deg,#4B3A78,#1A1230);' +
      'background-size:cover;background-position:center}' +
    '#scr-party .sk-wrap.sk-art .sk-card.back .sk-tile,' +
      '#scr-party .sk-wrap.sk-art .sk-card.back .sk-mid{display:none}' +
    /* number cards: a painted window behind a numeral that must stay readable */
    '#scr-party .sk-wrap.sk-art .sk-card.k-number .sk-tile{background-size:cover;' +
      'background-position:center}' +
    '#scr-party .sk-wrap.sk-art .sk-card.k-number.s-festa .sk-tile{' +
      'background-image:url("art/skarta/face-festa.jpg")}' +
    '#scr-party .sk-wrap.sk-art .sk-card.k-number.s-bahar .sk-tile{' +
      'background-image:url("art/skarta/face-bahar.jpg")}' +
    '#scr-party .sk-wrap.sk-art .sk-card.k-number.s-razzett .sk-tile{' +
      'background-image:url("art/skarta/face-razzett.jpg")}' +
    '#scr-party .sk-wrap.sk-art .sk-card.k-number.s-bajtra .sk-tile{' +
      'background-image:url("art/skarta/face-bajtra.jpg")}' +
    '#scr-party .sk-wrap.sk-art .sk-card.k-number .sk-num{color:#FFF;' +
      'text-shadow:0 2px 5px rgba(0,0,0,.85),0 0 14px rgba(0,0,0,.7)}' +
    /* action cards: a cut-out subject dropped on the suit-coloured field */
    '#scr-party .sk-wrap.sk-art .sk-card.k-skip .sk-tile,' +
      '#scr-party .sk-wrap.sk-art .sk-card.k-reverse .sk-tile,' +
      '#scr-party .sk-wrap.sk-art .sk-card.k-draw2 .sk-tile,' +
      '#scr-party .sk-wrap.sk-art .sk-card.k-wild .sk-tile,' +
      '#scr-party .sk-wrap.sk-art .sk-card.k-kaxxa .sk-tile{' +
      'background-size:82% auto;background-position:center 42%;background-repeat:no-repeat}' +
    '#scr-party .sk-wrap.sk-art .sk-card.k-skip .sk-tile{' +
      'background-image:url("art/skarta/act-skip.png")}' +
    '#scr-party .sk-wrap.sk-art .sk-card.k-reverse .sk-tile{' +
      'background-image:url("art/skarta/act-reverse.png")}' +
    '#scr-party .sk-wrap.sk-art .sk-card.k-draw2 .sk-tile{' +
      'background-image:url("art/skarta/act-draw2.png")}' +
    '#scr-party .sk-wrap.sk-art .sk-card.k-wild .sk-tile{' +
      'background-image:url("art/skarta/act-kazin.png")}' +
    '#scr-party .sk-wrap.sk-art .sk-card.k-kaxxa .sk-tile{' +
      'background-image:url("art/skarta/act-kaxxa.png")}' +
    /* the painted subject stands in for the line glyph, but the CSS caption
       and the +2 / 4-7 text stay exactly where they were: no number, no word
       and no name is ever generated into an image. */
    '#scr-party .sk-wrap.sk-art .sk-card:not(.k-number) .sk-mid .sk-g{display:none}' +

    /* ── short phones: the hand is the thing that gives ───────────── */
    '@media (max-height:720px){' +
      '#scr-party .sk-hand button .sk-card{--cw:60px}' +
      '#scr-party .sk-hand{padding:7px 8px 8px}' +
      '#scr-party .sk-opp{padding:4px 4px 3px}}' +
    '@media (prefers-reduced-motion:reduce){' +
      '#scr-party .sk-catch{animation:none}' +
      '#scr-party .sk-sheet .sk-panel{animation:none}}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   DRAWING A CARD
   One function, used by the hand, the pile, the setup fan and the
   result screen — so a card can never look like two different things.
   ═══════════════════════════════════════════════════════════════════ */
const SHORT = { skip: 'EJJA GĦADA', reverse: 'DAWRA', draw2: 'KUNJATA', wild: 'KAŻIN', kaxxa: 'KAXXA' };
const AGLYPH = { skip: 'sk-a-skip', reverse: 'sk-a-reverse', draw2: 'sk-a-draw2',
                 wild: 'sk-a-wild', kaxxa: 'sk-a-kaxxa' };

function cardHTML(c, w) {
  const wide = w ? 'style="--cw:' + w + 'px"' : '';
  if (!c) return '<div class="sk-card back" ' + wide + '></div>';
  const suit = c.suit ? ' s-' + c.suit : '';
  const mark = c.suit ? glyph('sk-s-' + c.suit, 'sk-cnr tl') + glyph('sk-s-' + c.suit, 'sk-cnr br') : '';
  let mid, pip = '';
  if (c.kind === 'number') {
    mid = '<span class="sk-num">' + c.num + '</span>';
    pip = '<span class="sk-pip tl">' + c.num + '</span><span class="sk-pip br">' + c.num + '</span>';
  } else {
    /* The +2 and the charge are the numbers a player has to see at a
       glance, so they are drawn as CSS text over the glyph — never
       baked into an image. See RULE ZERO in docs/ART_STYLE_BIBLE.md. */
    const n = c.kind === 'draw2' ? '<span class="sk-num" style="font-size:calc(var(--cw)*.26)">+2</span>' :
              c.kind === 'kaxxa' ? '<span class="sk-num" style="font-size:calc(var(--cw)*.22)">4/7</span>' : '';
    mid = glyph(AGLYPH[c.kind]) + n + '<span class="sk-cap">' + SHORT[c.kind] + '</span>';
  }
  return '<div class="sk-card k-' + c.kind + suit + '" ' + wide + '>' +
         '<span class="sk-tile"></span>' + mark + pip +
         '<span class="sk-mid">' + mid + '</span></div>';
}

function backHTML(w) {
  return '<div class="sk-card back"' + (w ? ' style="--cw:' + w + 'px"' : '') + '>' +
    '<span class="sk-tile"></span><span class="sk-mid">' +
    glyph('sk-a-wild') + '<span class="sk-cap">SKARTA</span></span></div>';
}

/* ═══════════════════════════════════════════════════════════════════
   THE GAME IN PROGRESS
   One object. teardown() nulls it and kills every timer on it, which is
   what makes the MutationObserver in party.js safe for us: if the app
   navigates away mid-turn, the machine stops thinking.
   ═══════════════════════════════════════════════════════════════════ */
let G = null;
const PACE = 780;          /* how long the machine "thinks" */
/* How long you have to shout AĦĦAR WAĦDA before somebody notices. The engine
   shuts its window once the next player has finished their go, so this MUST be
   shorter than a machine turn — and the machine is held back by exactly this
   long (see tick) so the window can never expire unused. */
const CALL_WINDOW = 1800;

function teardown() {
  if (!G) return;
  G.dead = true;
  clearTimeout(G.t); clearTimeout(G.catchT);
  if (G.ctx && G.ctx.stopFit) { try { G.ctx.stopFit(); } catch (e) {} }
  G = null;
}

/* ═══════════════════════════════════════════════════════════════════
   1. THE SETUP SHEET
   party.js's shared setup() asks "who is playing / how hard / which
   side", which is the wrong set of questions for a four-hander. So
   SKARTA asks its own three.
   ═══════════════════════════════════════════════════════════════════ */
function menu() {
  injectCSS();
  P.show();
  teardown();
  detectArt(() => {});
  const el = P.ui.screenEl();
  const p = ST.pref;
  let seats  = Math.min(4, Math.max(2, p.seats | 0 || 3));
  let humans = Math.min(seats, Math.max(1, p.humans | 0 || 1));
  let level  = [1, 2, 3].indexOf(p.level | 0) >= 0 ? (p.level | 0) : 3;

  const LV = [
    { k: 1, n: 'ĦANIN', note: 'Plays whatever is legal and forgets to call. You will win.' },
    { k: 2, n: 'SERJU',  note: 'Sheds its expensive cards and keeps its Każin back.' },
    { k: 3, n: 'KATTIV', note: 'Watches which suit you keep running away from. Then it uses it.' },
  ];

  el.innerHTML =
    '<div class="pt-wrap sk-wrap">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="sk-back" aria-label="Back to party games">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>SKARTA</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="sk-fan">' +
        cardHTML({ suit: 'bahar', kind: 'number', num: 7 }) +
        cardHTML({ suit: 'razzett', kind: 'draw2' }) +
        cardHTML({ suit: null, kind: 'kaxxa' }) +
        cardHTML({ suit: 'festa', kind: 'number', num: 3 }) +
        cardHTML({ suit: 'bajtra', kind: 'skip' }) +
      '</div>' +
      '<p class="blurb">Match the suit or match the number, and get rid of your hand before ' +
      'the rest of the table gets rid of theirs. Down to your last card you shout ' +
      '<b>AĦĦAR WAĦDA</b> — and if you forget, somebody at this table will notice.</p>' +
      '<div class="tiny pt-lbl">How many at the table</div>' +
      '<div class="sk-seats" id="sk-seats">' +
        [2, 3, 4].map(n => '<button class="sk-seatbtn" data-v="' + n + '"><b>' + n + '</b>' +
          '<i>' + (n === 2 ? 'HEADS-UP' : n === 3 ? 'THREE' : 'FULL TABLE') + '</i></button>').join('') +
      '</div>' +
      '<div class="tiny pt-lbl">How many of them are in the room</div>' +
      '<div class="sk-seats" id="sk-humans"></div>' +
      '<p class="sk-hint" id="sk-mix"></p>' +
      '<div class="tiny pt-lbl">How nasty is the machine</div>' +
      '<div class="pt-opts" id="sk-lvl">' +
        LV.map(l => '<button class="pt-opt" data-v="' + l.k + '">' + ico('diff-' + l.k) +
          '<b>' + l.n + '</b><i>' + esc(l.note) + '</i></button>').join('') +
      '</div>' +
      (ST.rec.w + ST.rec.l
        ? '<p class="pt-ledger">At this table so far: <b>' + ST.rec.w + '</b> won, <b>' +
          ST.rec.l + '</b> lost.</p>' : '') +
      '<button class="btn ghost" id="sk-rules" style="margin:14px 0 0">' +
        ilb('book', 'The house rules') + '</button>' +
      '<button class="btn primary" id="sk-go" style="margin:9px 0 24px">' +
        ilb('play', 'Deal') + '</button>' +
    '</div></div>';

  const sync = () => {
    if (humans > seats) humans = seats;
    const hbox = el.querySelector('#sk-humans');
    hbox.innerHTML = [1, 2, 3, 4].filter(n => n <= seats).map(n =>
      '<button class="sk-seatbtn" data-v="' + n + '"><b>' + n + '</b><i>' +
      (n === 1 ? 'JUST YOU' : n + ' OF YOU') + '</i></button>').join('');
    hbox.querySelectorAll('.sk-seatbtn').forEach(b => {
      b.classList.toggle('on', +b.dataset.v === humans);
      b.onclick = () => { humans = +b.dataset.v; sync(); };
    });
    el.querySelectorAll('#sk-seats .sk-seatbtn').forEach(b =>
      b.classList.toggle('on', +b.dataset.v === seats));
    el.querySelectorAll('#sk-lvl .pt-opt').forEach(b =>
      b.classList.toggle('on', +b.dataset.v === level));
    const bots = seats - humans;
    el.querySelector('#sk-mix').textContent = bots
      ? humans + ' of you on this phone, ' + bots + ' played by the machine. ' +
        'It hides your hand and tells you when to pass the phone on.'
      : 'All ' + humans + ' of you on this one phone, passing it round the table.';
    el.querySelector('#sk-lvl').hidden = !bots;
    el.querySelectorAll('#sk-lvl .pt-opt').forEach(b => { b.disabled = !bots; });
  };
  el.querySelectorAll('#sk-seats .sk-seatbtn').forEach(b =>
    b.onclick = () => { seats = +b.dataset.v; if (humans > seats) humans = seats; sync(); });
  el.querySelectorAll('#sk-lvl .pt-opt').forEach(b =>
    b.onclick = () => { level = +b.dataset.v; sync(); });
  sync();

  el.querySelector('#sk-back').onclick = () => { teardown(); P.hub(); };
  el.querySelector('#sk-rules').onclick = () => rulesSheet(el.querySelector('.sk-wrap'), null);
  el.querySelector('#sk-go').onclick = () => {
    ST.pref = { seats, humans, level }; persist();
    start(seats, humans, level);
  };
}

/* ═══════════════════════════════════════════════════════════════════
   2. THE TABLE
   ═══════════════════════════════════════════════════════════════════ */
const BOTS = ['Ċikku', 'Ġuża', 'Salvu', 'Doris', 'Wenzu', 'Pawlu'];

function start(seats, humans, level) {
  injectCSS();
  const list = [];
  for (let i = 0; i < seats; i++) {
    if (i < humans) list.push({ name: humans === 1 ? 'You' : 'Player ' + (i + 1) });
    else list.push({ name: BOTS[(i - humans) % BOTS.length], ai: true, level });
  }
  const S = E.newGame({ seats: list });

  /* borrow party.js's frame for the title bar, the turn strip and the
     button bar — then take the square-board sizer straight back off it,
     because a card table is not a chessboard. */
  const ctx = P.ui.frame({
    title: 'SKARTA', onBack: () => { teardown(); menu(); }, leave: teardown,
    buttons: [
      { id: 'sk-ahhar', label: 'AĦĦAR!', icon: 'warn', cls: 'hot' },
      { id: 'sk-draw',  label: 'Draw',        icon: 'plus' },
      { id: 'sk-help',  label: 'Rules',       icon: 'book' },
    ],
  });
  if (ctx.stopFit) { ctx.stopFit(); ctx.stopFit = null; }
  ctx.root.classList.add('sk-wrap');
  if (ART.on) ctx.root.classList.add('sk-art');
  else detectArt(on => { if (on && G && G.ctx) G.ctx.root.classList.add('sk-art'); });

  const stack = ctx.root.querySelector('.pt-stack');
  if (stack) stack.remove();
  ctx.host.innerHTML =
    '<div class="sk-table">' +
      '<div class="sk-opps" id="sk-opps"></div>' +
      '<div class="sk-felt" id="sk-felt">' +
        '<div class="sk-chain" id="sk-chain" hidden><span></span></div>' +
        '<div class="sk-slot">' +
          '<button class="sk-deck" id="sk-deckbtn" aria-label="Draw a card">' +
            backHTML(104) + '</button>' +
          '<span class="sk-slot-l" id="sk-decklbl"></span>' +
        '</div>' +
        '<div class="sk-slot"><div id="sk-top"></div>' +
          '<span class="sk-slot-l" id="sk-toplbl"></span></div>' +
        '<div class="sk-dir" id="sk-dir">' + glyph('sk-a-reverse') + '<span>Order</span></div>' +
      '</div>' +
      '<div class="sk-handwrap">' +
        '<div class="sk-hint" id="sk-hint"></div>' +
        '<div class="sk-hand" id="sk-hand"></div>' +
      '</div>' +
    '</div>';

  G = {
    S, ctx, dead: false, humans, seats,
    view: 0,               /* whose hand is face-up on this phone */
    armed: false,          /* AĦĦAR pressed early, fires the moment you hit one card */
    t: null, catchT: null, catchOn: null, callAt: 0,
    curtain: false,
  };

  ctx.btn('sk-draw').onclick  = onDraw;
  ctx.btn('sk-help').onclick  = () => rulesSheet(ctx.root, ctx);
  ctx.btn('sk-ahhar').onclick = onAhhar;
  ctx.root.querySelector('#sk-deckbtn').onclick = onDraw;

  tick();
}

/* the loop: paint, then either wait for a tap or let the machine move */
function tick() {
  if (!G || G.dead) return;
  const S = G.S;
  if (S.over) { render(); return void showResult(); }
  const p = S.players[S.turn];

  if (!p.ai && S.turn !== G.view && G.humans > 1) { curtain(S.turn); return; }
  if (!p.ai) G.view = S.turn;
  render();
  watchCall();
  /* the machine waits out the rest of anybody's call window before moving:
     if it played on, the engine would shut the window and a player who was
     reaching for the button would silently get away with it */
  if (p.ai) G.t = setTimeout(aiStep, PACE + windowLeft());
}

/* milliseconds still owed to a HUMAN sitting on one card and saying nothing */
function windowLeft() {
  if (!G || !G.S.call) return 0;
  if (G.S.players[G.S.call.pid].ai) return 0;
  return Math.max(0, CALL_WINDOW - (Date.now() - (G.callAt || 0)));
}

function aiStep() {
  if (!G || G.dead || G.S.over) { if (G && !G.dead) tick(); return; }
  const S = G.S;
  if (!S.players[S.turn].ai) { tick(); return; }
  E.aiTurn(S);          /* it calls AĦĦAR WAĦDA for itself — see maybeCall() */
  render();
  if (S.over) { showResult(); return; }
  tick();
}

/* Somebody is sitting on one card and has not said anything. Everybody
   else at the table gets a beat to notice — a human by tapping their
   chip, the machine on this timer. */
function watchCall() {
  if (!G || G.dead) return;
  const S = G.S;
  const target = S.call ? S.call.pid : null;
  if (target === null || S.players[target].ai) {
    if (G.catchOn !== null) { clearTimeout(G.catchT); G.catchT = null; G.catchOn = null; }
    return;
  }
  if (G.catchOn === target) return;
  clearTimeout(G.catchT);
  G.catchOn = target;
  G.callAt = Date.now();
  G.catchT = setTimeout(() => {
    if (!G || G.dead) return;
    G.catchOn = null;
    const c = E.aiCatch(G.S);
    if (c) { toast(G.S.players[c.by].name + ': "' + E.RULES.CATCH + '" — ' +
                   G.S.players[c.target].name + ' takes ' + E.RULES.PENALTY + '.'); render(); }
  }, CALL_WINDOW);
}

/* ═══════════════════════════════════════════════════════════════════
   3. PAINT
   ═══════════════════════════════════════════════════════════════════ */
function render() {
  if (!G || G.dead) return;
  const S = G.S, ctx = G.ctx, seat = G.view;
  const v = E.view(S, seat);
  const me = S.players[seat];
  const mine = S.turn === seat && !S.over;
  const suit = E.suitOf(S.suit);

  /* the felt takes the colour of the suit in force */
  const felt = ctx.root.querySelector('#sk-felt');
  if (felt) felt.style.setProperty('--sk-now', suit ? suit.c : 'transparent');

  /* — the other seats — */
  const opps = ctx.root.querySelector('#sk-opps');
  opps.innerHTML = v.opponents.map(o => {
    const n = Math.min(o.cards, 5);
    let mini = ''; for (let i = 0; i < n; i++) mini += '<i></i>';
    const tag = o.cards === 1 ? (o.said ? E.RULES.CALL : '…quiet…')
              : o.singed ? 'SINGED' : (o.ai ? ['', 'ĦANIN', 'SERJU', 'KATTIV'][o.level] : 'IN THE ROOM');
    return '<div class="sk-opp' + (S.turn === o.id ? ' now' : '') +
      (o.singed ? ' singed' : '') + (o.cards === 1 && o.said ? ' said' : '') +
      '" data-id="' + o.id + '">' +
      '<span class="sk-opp-n">' + esc(o.name) + '</span>' +
      '<span class="sk-opp-c"><span class="sk-mini">' + mini + '</span><b>' + o.cards + '</b></span>' +
      '<span class="sk-tagline">' + esc(tag) + '</span>' +
      (v.canCatch.indexOf(o.id) >= 0
        ? '<button class="sk-catch" data-catch="' + o.id + '">' + esc(E.RULES.CATCH) + '</button>' : '') +
      '</div>';
  }).join('');
  opps.querySelectorAll('[data-catch]').forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    const r = E.catchOut(S, seat, +b.dataset.catch);
    if (r.ok) toast(esc(E.RULES.CATCH) + ' ' + S.players[+b.dataset.catch].name +
                    ' takes ' + r.drew + '.');
    render();
  });

  /* — the pile, the deck, the chain, the direction — */
  /* the pile is drawn as a pile: the two cards under the top one peek out at
     an angle, which is what stops the middle of the felt reading as two lonely
     cards floating in a void. Purely cosmetic — the rules never look at it. */
  const pile = S.discard.slice(-3);
  ctx.root.querySelector('#sk-top').innerHTML =
    '<div class="sk-pile">' + pile.map((c, i) =>
      '<div class="sk-pl" style="--r:' + [-11, 8, 0][pile.length - 1 - i] + 'deg">' +
      cardHTML(c, 104) + '</div>').join('') + '</div>';
  ctx.root.querySelector('#sk-toplbl').textContent = suit ? suit.n : '';
  ctx.root.querySelector('#sk-decklbl').textContent = v.deckLeft + ' left';
  const dbtn = ctx.root.querySelector('#sk-deckbtn');
  /* the deck is how you eat a chain, so it must NOT be disabled while one is
     live — the hint under the hand tells you to tap it */
  dbtn.disabled = !mine || !!v.pending;
  const ch = ctx.root.querySelector('#sk-chain');
  ch.hidden = !v.chain.n;
  ch.className = 'sk-chain' + (v.chain.closed ? ' shut' : '');
  ch.firstChild.textContent = v.chain.closed
    ? 'IL-LIMITU — TAKE ALL ' + v.chain.n
    : 'IL-KATINA · ' + v.chain.n + ' PENDING';
  const dir = ctx.root.querySelector('#sk-dir');
  dir.className = 'sk-dir' + (v.dir < 0 ? ' rev' : '');
  dir.lastChild.textContent = v.dir > 0 ? 'Round this way' : 'Turned around';

  /* — whose go is it — */
  const who = S.players[S.turn];
  P.ui.setTurn(ctx, {
    cls: S.turn === seat ? 'you' : 'them',
    who: S.over ? 'Over' : (S.turn === seat ? 'Your go' : who.name + ' is thinking'),
    note: lastLine(S),
    alert: v.chain.n > 0 && S.turn === seat,
  });
  ctx.badge.textContent = me.hand.length + (me.hand.length === 1 ? ' card' : ' cards');

  /* — your hand — */
  const hand = ctx.root.querySelector('#sk-hand');
  const legal = mine ? v.legal : [];
  hand.innerHTML = me.hand.map((c, i) =>
    '<button data-i="' + i + '" class="' + (mine ? (legal.indexOf(i) >= 0 ? 'yes' : 'no') : '') +
    '" ' + (mine && legal.indexOf(i) < 0 ? 'disabled' : '') +
    ' aria-label="' + esc(E.cardLabel(c)) + '">' + cardHTML(c) + '</button>').join('');
  hand.querySelectorAll('button').forEach(b => b.onclick = () => onCard(+b.dataset.i));

  /* — the line under the hand: what the game wants from you — */
  const hint = ctx.root.querySelector('#sk-hint');
  hint.textContent =
    S.over ? '' :
    !mine ? 'Watching ' + who.name + '.' :
    v.pending && v.pending.type === 'drawn'
      ? 'You drew ' + E.cardLabel(me.hand[v.pending.idx]) + ' — put it down, or keep it and pass.' :
    v.chain.n ? (v.chain.closed
      ? 'Twelve on the pile. Nothing answers that — tap the deck and take them.'
      : 'A draw card is pointed at you. Answer it, or tap the deck and take ' + v.chain.n + '.') :
    legal.length ? 'Match ' + (suit ? suit.n : '') +
      (v.top && v.top.kind === 'number' ? ' or ' + v.top.num : '') + '.' :
      'Nothing goes. Tap the deck.';

  /* — the buttons — */
  const dbtn2 = ctx.btn('sk-draw');
  const pending = v.pending && v.pending.type === 'drawn';
  dbtn2.disabled = !mine;
  dbtn2.innerHTML = ilb(pending ? 'check' : 'plus',
    pending ? 'Keep it' : v.chain.n ? 'Take ' + v.chain.n : 'Draw');
  const ab = ctx.btn('sk-ahhar');
  ab.disabled = S.over || me.hand.length > 2 || me.said;
  ab.className = 'btn sm ' + (G.armed || me.said ? 'primary' : 'hot');
  ab.innerHTML = ilb('warn', me.said ? 'Called' : G.armed ? 'Armed' : 'AĦĦAR!');
}

function lastLine(S) {
  for (let i = S.log.length - 1; i >= 0; i--) if (S.log[i].text) return S.log[i].text;
  return '';
}

/* ═══════════════════════════════════════════════════════════════════
   4. WHAT A TAP DOES
   ═══════════════════════════════════════════════════════════════════ */
function onCard(i) {
  if (!G || G.dead) return;
  const S = G.S, seat = G.view;
  if (S.turn !== seat) return;
  const c = S.players[seat].hand[i];
  if (!c || !E.canPlay(S, c)) return;
  if (E.isWild(c)) { suitSheet(c, s => (c.kind === 'kaxxa' ? chargeSheet(s, ch => commit(i, { suit: s, charge: ch })) : commit(i, { suit: s }))); return; }
  commit(i, {});
}

function commit(i, opts) {
  const S = G.S, seat = G.view;
  const r = E.play(S, seat, i, opts);
  if (!r.ok) { render(); return; }
  /* armed early: the call goes out the instant the card lands */
  if (G.armed && S.players[seat].hand.length === 1) E.sayAhhar(S, seat);
  G.armed = false;
  if (r.won) { render(); showResult(); return; }
  tick();
}

function onDraw() {
  if (!G || G.dead) return;
  const S = G.S, seat = G.view;
  if (S.turn !== seat || S.over) return;
  if (S.pending && S.pending.type === 'drawn') { E.pass(S, seat); tick(); return; }
  if (E.chainLive(S)) { E.takeChain(S, seat); tick(); return; }
  const r = E.drawOne(S, seat);
  if (!r.ok) return;
  if (r.playable) { render(); return; }   /* it is still your go until you say */
  tick();
}

function onAhhar() {
  if (!G || G.dead) return;
  const S = G.S, seat = G.view, me = S.players[seat];
  if (me.hand.length === 1) { E.sayAhhar(S, seat); toast(E.RULES.CALL); render(); return; }
  if (me.hand.length === 2) { G.armed = !G.armed; render(); }
}

/* ═══════════════════════════════════════════════════════════════════
   5. THE TWO QUESTIONS THE RULES ASK YOU
   ═══════════════════════════════════════════════════════════════════ */
function sheet(html, wire) {
  const root = G ? G.ctx.root : null;
  if (!root) return;
  const old = root.querySelector('.sk-sheet'); if (old) old.remove();
  const s = document.createElement('div');
  s.className = 'sk-sheet';
  s.setAttribute('role', 'dialog');
  s.setAttribute('aria-modal', 'true');
  s.innerHTML = '<div class="sk-panel">' + html + '</div>';
  root.appendChild(s);
  wire(s, () => s.remove());
  const f = s.querySelector('button'); if (f) f.focus();
  return s;
}

function suitSheet(card, then) {
  const S = G.S, mine = S.players[G.view].hand;
  const have = {}; for (const c of mine) if (c.suit) have[c.suit] = (have[c.suit] || 0) + 1;
  const k = E.KINDS[card.kind];
  sheet(
    '<h3>' + esc(k.mt) + '</h3>' +
    '<p>' + esc(k.txt) + ' <b>Name the suit.</b></p>' +
    '<div class="sk-suits">' + E.SUITS.map(s =>
      '<button class="sk-suitbtn" data-s="' + s.k + '" style="--s1:' + s.c + ';--s2:' + s.c2 + '">' +
      glyph('sk-s-' + s.k) + '<span><b>' + esc(s.n) + '</b><i>' + esc(s.mt) + '</i></span>' +
      '<span class="sk-have">' + (have[s.k] || 0) + '</span></button>').join('') + '</div>' +
    '<p style="margin:12px 0 0;font-size:10.5px">The number beside each one is how many of ' +
    'that suit you are still holding.</p>' +
    '<button class="btn ghost sm" id="sk-x" style="margin-top:10px;width:100%">Put it back</button>',
    (s, close) => {
      s.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { close(); then(b.dataset.s); });
      s.querySelector('#sk-x').onclick = close;
    });
}

function chargeSheet(suitK, then) {
  const S = G.S;
  const victim = S.players[E.nextSeat(S, G.view)];
  const nP = S.players.length;
  sheet(
    '<h3>' + esc(E.KINDS.kaxxa.mt) + '</h3>' +
    '<p>The suit is <b>' + esc(E.suitOf(suitK).n) + '</b>. Now decide how much of the box you light. ' +
    'It lands on <b>' + esc(victim.name) + '</b>, who is holding <b>' + victim.hand.length + '</b>.</p>' +
    '<div class="sk-charge">' +
      '<button class="sk-chg small" data-c="4"><span class="sk-big">4</span>' +
        '<b>NOFS KAXXA</b><i>Half the box. ' + esc(victim.name) + ' takes four and loses the go.</i>' +
        '<span class="sk-cost">And you carry straight on</span></button>' +
      '<button class="sk-chg big" data-c="7"><span class="sk-big">7</span>' +
        '<b>IL-KAXXA KOLLHA</b><i>The whole box. ' + esc(victim.name) + ' takes seven.</i>' +
        '<span class="sk-cost">The blast takes you too — you miss your own next turn' +
        (nP > 2 ? ', and ' + (nP - 1) + ' others play before you do' : '') + '</span></button>' +
    '</div>' +
    '<p style="margin:12px 0 0;font-size:10.5px">Three more cards, or a whole turn. ' +
    'Bury somebody who is about to go out; otherwise the turn is usually worth more. ' +
    'You are singed either way — even if somebody stacks the pile onward.</p>' +
    '<button class="btn ghost sm" id="sk-x" style="margin-top:10px;width:100%">Put it back</button>',
    (s, close) => {
      s.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { close(); then(+b.dataset.c); });
      s.querySelector('#sk-x').onclick = close;
    });
}

/* ═══════════════════════════════════════════════════════════════════
   6. THE HOUSE RULES, ON SCREEN
   Read straight off the engine's RULES block, so the sheet cannot drift
   away from what the code actually does.
   ═══════════════════════════════════════════════════════════════════ */
function rulesSheet(root, ctx) {
  const R = E.RULES;
  const rule = (g, name, body, note) =>
    '<div class="sk-rule">' + glyph(g) + '<b>' + name + '</b><i>' + body + '</i>' +
    (note ? '<s>' + note + '</s>' : '') + '</div>';
  const html =
    '<h3>SKARTA — THE HOUSE RULES</h3>' +
    '<p>Match the suit or match the number. First to an empty hand takes it.</p>' +
    rule('sk-s-festa', 'THE FOUR SUITS',
      'FESTA, BAĦAR, RAŻŻETT and BAJTRA. ' + R.HAND + ' cards each off a deck of 108.') +
    rule('sk-a-skip', esc(E.KINDS.skip.mt),
      esc(E.KINDS.skip.eff), esc(E.KINDS.skip.txt)) +
    rule('sk-a-reverse', esc(E.KINDS.reverse.mt),
      esc(E.KINDS.reverse.eff), esc(E.KINDS.reverse.txt)) +
    rule('sk-a-draw2', esc(E.KINDS.draw2.mt),
      esc(E.KINDS.draw2.eff), esc(E.KINDS.draw2.txt)) +
    rule('sk-a-wild', esc(E.KINDS.wild.mt),
      esc(E.KINDS.wild.eff), esc(E.KINDS.wild.txt)) +
    rule('sk-a-kaxxa', esc(E.KINDS.kaxxa.mt),
      'Name the suit, then choose. <b>' + R.KAXXA_SMALL + '</b> and play carries on. ' +
      '<b>' + R.KAXXA_BIG + '</b> and it does not: the blast takes you as well and you miss ' +
      'your own next turn. Three cards, or a turn. That is the whole card.',
      'You are singed the moment you light it — stacking it away does not save you.') +
    rule('sk-a-draw2', 'IL-KATINA',
      'A draw card can be answered by another and passed on, growing as it goes. ' +
      'A Kunjata answers a Kunjata; the Kaxxa answers anything; a Kunjata may not be ' +
      'dropped on a Kaxxa.',
      'IL-LIMITU: at ' + R.CHAIN_CAP + ' the chain is shut and whoever is holding it takes ' +
      'the lot. That is what stops it going round the table forever.') +
    rule('sk-a-wild', esc(R.CALL),
      'Down to one card you shout it. Stay quiet until the next player has finished their ' +
      'go and anybody can shout ' + esc(R.CATCH) + ' — and you take ' + R.PENALTY + '.',
      'Tap the button on two cards to arm it, and it goes out the moment the card lands.') +
    rule('sk-s-bahar', 'RUNNING DRY',
      'Deck finished? Everything but the top card is shuffled and dealt from again.') +
    '<button class="btn primary" id="sk-x" style="margin-top:14px;width:100%">Right, got it</button>';

  if (G && ctx) { sheet(html, (s, close) => { s.querySelector('#sk-x').onclick = close; }); return; }
  /* on the setup screen there is no G yet, so put it up by hand */
  const old = root.querySelector('.sk-sheet'); if (old) old.remove();
  const s = document.createElement('div');
  s.className = 'sk-sheet';
  s.style.position = 'fixed';
  s.setAttribute('role', 'dialog');
  s.innerHTML = '<div class="sk-panel">' + html + '</div>';
  root.appendChild(s);
  s.querySelector('#sk-x').onclick = () => s.remove();
  s.querySelector('#sk-x').focus();
}

/* ═══════════════════════════════════════════════════════════════════
   7. PASSING THE PHONE
   Only ever shown when two or more of you are on this one phone. With
   one human it never appears at all.
   ═══════════════════════════════════════════════════════════════════ */
function curtain(pid) {
  if (!G || G.dead) return;
  const S = G.S;
  const old = G.ctx.root.querySelector('.sk-curtain'); if (old) old.remove();
  const c = document.createElement('div');
  c.className = 'sk-curtain';
  c.innerHTML =
    backHTML(96) +
    '<h3>' + esc(S.players[pid].name) + '</h3>' +
    '<p>Pass the phone. Nobody looks until it is in the right hands — ' +
    'you are all holding ' + S.players.map(p => p.hand.length).join(', ') + ' cards.</p>' +
    '<button class="btn primary" id="sk-ready" style="min-width:190px">' +
      ilb('play', 'I am ' + esc(S.players[pid].name)) + '</button>';
  G.ctx.root.appendChild(c);
  c.querySelector('#sk-ready').onclick = () => {
    c.remove(); G.view = pid; G.armed = false; render(); watchCall();
  };
  c.querySelector('#sk-ready').focus();
}

/* ═══════════════════════════════════════════════════════════════════
   8. THE END OF IT
   ═══════════════════════════════════════════════════════════════════ */
const QUIP_WIN = [
  'Nobody saw that coming except you, apparently.',
  'Skarta kollox. Now put the kettle on.',
  'Won, and still nobody has moved to clear the table.',
];
const QUIP_LOSE = [
  'It was the Kaxxa. It is always the Kaxxa.',
  'You were one card away for eleven minutes.',
  'Somebody at this table has been counting your suits.',
];

function showResult() {
  if (!G || G.dead) return;
  const S = G.S, ctx = G.ctx;
  clearTimeout(G.catchT); G.catchT = null;
  const w = S.over.winner;
  const humanWin = !S.players[w].ai;
  const iWon = w === G.view || (G.humans === 1 && humanWin);
  ST.rec[iWon ? 'w' : 'l']++; persist();

  const table = S.over.scores.slice().sort((a, b) => a.points - b.points)
    .map(s => s.name + ' — ' + s.cards + (s.cards === 1 ? ' card' : ' cards') +
              (s.points ? ' (' + s.points + ')' : '')).join(' · ');

  P.ui.result(ctx, {
    tone: iWon ? 'win' : 'lose',
    head: S.players[w].name + (humanWin && G.humans === 1 && iWon ? ' — out!' : ' takes it'),
    why: 'Empty hand. ' + table,
    quip: (iWon ? QUIP_WIN : QUIP_LOSE)[Math.floor(Math.random() * 3)],
    buttons: [
      { label: 'Deal again', icon: 'refresh', cls: 'primary',
        go: () => { const p = ST.pref; teardown(); start(p.seats, p.humans, p.level); } },
      { label: 'The shelf', icon: 'back', cls: 'ghost',
        go: () => { teardown(); P.hub(); } },
    ],
  });
}

/* ═══════════════════════════════════════════════════════════════════
   9. ON THE SHELF
   register() replaces the placeholder party.js put there by id, so the
   COMING SOON tile becomes a Playable one with no edit to party.js.
   ═══════════════════════════════════════════════════════════════════ */
/* `kind:'card'` puts it on the CARD GAMES shelf rather than with the boards —
   party.js sorts the hub into two shelves and anything that forgets which it is
   lands on the board one by default. */
P.register({
  id: 'skarta', order: 30, kind: 'card', name: 'SKARTA', mt: 'Skarta kollox',
  icon: 'discard', status: 'live',
  tag: 'Get rid of your hand before the rest of the table gets rid of theirs. Matching suits, ' +
       'matching numbers, and a Kaxxa Infernali that ruins somebody\'s evening — possibly yours.',
  open: menu,
});

/* the entry point the hub tile and anything else needs */
window.KARTI_SKARTA = {
  open: menu, close: () => { teardown(); P.hub(); },
  engine: E, cardHTML, backHTML, injectCSS,
  get game() { return G ? G.S : null; },
  /* driven by the UI test harness, and by nothing else */
  _ui: { start, render, onCard, onDraw, onAhhar, tick, get G() { return G; } },
};

})();
