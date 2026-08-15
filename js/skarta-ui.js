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
let ST = { rec: { w: 0, l: 0 },
           pref: { seats: 3, level: 3, kinds: ['you', 'ai', 'ai', 'ai'], sort: false } };
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
      'font-size:calc(var(--cw)*.112);letter-spacing:0;line-height:1;max-width:96%;' +
      'text-align:center;white-space:nowrap}' +
    /* the little cards coming your way — see pips() above */
    '#scr-party .sk-pips{display:flex;gap:calc(var(--cw)*.028);margin-top:calc(var(--cw)*.02)}' +
    '#scr-party .sk-pips i{width:calc(var(--cw)*.082);height:calc(var(--cw)*.118);' +
      'border-radius:calc(var(--cw)*.022);background:var(--s2);' +
      'box-shadow:0 0 0 1px rgba(255,255,255,.55)}' +
    '#scr-party .sk-pips i.gh{background:transparent;' +
      'box-shadow:inset 0 0 0 1.5px var(--s2),0 0 0 1px rgba(255,255,255,.35)}' +
    '#scr-party .sk-card.k-wild .sk-pips i,#scr-party .sk-card.k-kaxxa .sk-pips i{background:#1A1230}' +
    '#scr-party .sk-card.k-kaxxa .sk-pips i.gh{background:transparent;' +
      'box-shadow:inset 0 0 0 1.5px #1A1230,0 0 0 1px rgba(255,255,255,.45)}' +
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
    '#scr-party .sk-hand button.yes{transform:translateY(-9px)}' +
    '#scr-party .sk-hand button.dragging.yes{transform:none}' +
    '#scr-party .sk-hand button.yes .sk-card{box-shadow:inset 0 0 0 2px #FFF,' +
      'inset 0 0 0 3px rgba(0,0,0,.28),0 0 0 2px var(--gold),0 6px 16px rgba(0,0,0,.55)}' +
    '#scr-party .sk-hand button:active{transform:translateY(-14px)}' +
    '#scr-party .sk-hand button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}' +
    /* ── the thin strip above the hand: the running hint, and the two
       controls that used to be full-width buttons eating the bottom of the
       screen. 26px total instead of 46 + 14. ─────────────────────────── */
    '#scr-party .sk-tools{display:flex;align-items:center;gap:6px;padding:0 8px 1px}' +
    '#scr-party .sk-hint{flex:1 1 auto;min-width:0;font-size:10.5px;color:var(--dim2);' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#scr-party .sk-tool{flex:0 0 auto;width:30px;height:26px;display:flex;align-items:center;' +
      'justify-content:center;border-radius:8px;border:1px solid var(--line);cursor:pointer;' +
      'background:rgba(255,255,255,.05);color:var(--dim)}' +
    '#scr-party .sk-tool .ico{width:15px;height:15px}' +
    '#scr-party .sk-tool.on{background:rgba(255,197,66,.16);border-color:rgba(255,197,66,.55);' +
      'color:var(--gold)}' +
    '#scr-party .sk-tool:active{background:rgba(255,255,255,.12)}' +

    /* ── the bottom bar: two buttons, shorter, and the label gives before
       the tap target does — "LAST ONE" is two words and the button is the
       one you hit under time pressure. ──────────────────────────────── */
    '#scr-party .sk-wrap .pt-bar{gap:8px;padding-top:6px}' +
    '#scr-party .sk-wrap .pt-bar .btn{min-height:44px;font-size:12px;letter-spacing:.04em;' +
      'padding:4px 4px}' +
    '#scr-party .sk-wrap .pt-bar .btn .bl{gap:6px;min-width:0}' +
    '#scr-party .sk-wrap .pt-bar .btn .bl span{overflow:hidden;text-overflow:ellipsis;' +
      'white-space:nowrap}' +
    '#scr-party .sk-wrap #sk-ahhar{font-family:var(--disp);font-weight:900;letter-spacing:.08em}' +
    /* one card left and silent: it should be impossible to miss */
    '#scr-party .sk-wrap #sk-ahhar.due{animation:skDue .7s ease-in-out infinite}' +
    '@keyframes skDue{0%,100%{box-shadow:0 0 0 0 rgba(255,84,104,.55)}' +
      '50%{box-shadow:0 0 0 7px rgba(255,84,104,0)}}' +

    /* ── a card being dragged out of the hand ─────────────────────────── */
    '#scr-party .sk-hand button.dragging{z-index:9;position:relative;transition:none;' +
      'touch-action:none}' +
    '#scr-party .sk-hand button.dragging .sk-card{box-shadow:inset 0 0 0 2px #FFF,' +
      '0 0 0 2px var(--gold),0 12px 26px rgba(0,0,0,.65)}' +
    '#scr-party .sk-hand.sorting button{transition:margin .13s var(--ease)}' +
    '#scr-party .sk-hand.sorting button.slot{margin-left:24px}' +
    '#scr-party .sk-hand button.no{opacity:.42}' +
    '#scr-party .sk-hand button{touch-action:pan-x}' +

    /* ── the chairs on the setup sheet ────────────────────────────────── */
    '#scr-party .sk-who{display:flex;gap:7px}' +
    '#scr-party .sk-chair{flex:1 1 0;min-width:0;display:flex;flex-direction:column;' +
      'align-items:center;gap:2px;padding:9px 4px;border-radius:13px;cursor:pointer;' +
      'border:1.5px solid var(--line);background:rgba(255,255,255,.05);color:var(--txt)}' +
    '#scr-party .sk-chair.human{border-color:rgba(61,220,132,.5);background:rgba(61,220,132,.10)}' +
    '#scr-party .sk-chair.bot{border-color:rgba(138,92,255,.45);background:rgba(138,92,255,.11)}' +
    '#scr-party .sk-chair.locked{opacity:.9;cursor:default}' +
    '#scr-party .sk-chair .ico{width:17px;height:17px;color:var(--dim)}' +
    '#scr-party .sk-chair.human .ico{color:var(--ok)}' +
    '#scr-party .sk-chair.bot .ico{color:var(--neon)}' +
    '#scr-party .sk-chair-n{font-family:var(--disp);font-weight:900;font-size:9.5px;' +
      'letter-spacing:.07em}' +
    '#scr-party .sk-chair-s{font-size:8.5px;color:var(--dim2);max-width:100%;overflow:hidden;' +
      'text-overflow:ellipsis;white-space:nowrap}' +
    '#scr-party .sk-sub{font-weight:400;letter-spacing:0;text-transform:none;color:var(--dim2)}' +
    '#scr-party .sk-note{font-size:11px;line-height:1.45;color:var(--dim);margin:8px 0 0}' +

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
    '#scr-party .sk-chg{display:grid;grid-template-columns:68px 1fr;column-gap:10px;row-gap:2px;' +
      'align-items:center;padding:11px 12px;border-radius:15px;cursor:pointer;text-align:left;' +
      'border:2px solid var(--line2);background:rgba(255,255,255,.05);color:var(--txt)}' +
    '#scr-party .sk-chg b{font-size:15px;letter-spacing:.1em}' +
    '#scr-party .sk-cost.good{color:var(--ok)}' +
    '#scr-party .sk-fine{font-size:10.5px;line-height:1.45;color:var(--dim2);margin:10px 0 0}' +
    '#scr-party .sk-chg:active{transform:scale(.98)}' +
    /* a real little heap of cards, fanned, at the size they land in a hand */
    '#scr-party .sk-heap{grid-row:1/4;position:relative;width:60px;height:44px;align-self:center}' +
    '#scr-party .sk-heap i{position:absolute;top:calc(var(--i)*2px);left:calc(var(--i)*7px);' +
      'width:18px;height:27px;border-radius:4px;background:linear-gradient(150deg,#5A4790,#241A3E);' +
      'box-shadow:0 0 0 1.5px rgba(255,255,255,.7),0 2px 4px rgba(0,0,0,.45)}' +
    '#scr-party .sk-chg.big .sk-heap i{background:linear-gradient(150deg,#FF7A5E,#8E1B0E)}' +
    '#scr-party .sk-chg.small .sk-heap i{background:linear-gradient(150deg,#5FE3A1,#12603B)}' +
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
/* Short enough to FIT. The first pass said MISS A GO / TURN ROUND / PICK A
   SUIT and every one of them was clipped mid-word on a 70px card, which is
   worse than the Maltese it replaced. These are the longest forms that fit. */
const SHORT = { skip: 'MISS GO', reverse: 'U-TURN', draw2: 'TAKE 2',
                wild: 'PICK SUIT', kaxxa: 'TAKE 4-7' };

/* ── SHOWING WHAT A CARD DOES TO YOU ────────────────────────────────────────
   "4/7" was the whole problem: two numerals and a slash are arithmetic, and a
   player halfway through a turn does not do arithmetic — they pattern-match.
   So a draw card now shows THE CARDS COMING AT YOU. Four little cards means
   four little cards. The Kaxxa shows four solid and three outlined, which
   reads as "four, or seven" without anybody having to be told, and the
   choice sheet then shows the two piles side by side at full size.
   Same instinct everywhere else: the captions became plain English verbs
   (MISS A GO, TURN ROUND, TAKE TWO) instead of Maltese card names, because
   the name is flavour and the effect is the thing you need mid-turn. */
function pips(n, ghost) {
  let h = '<span class="sk-pips">';
  for (let i = 0; i < n; i++) h += '<i></i>';
  for (let i = 0; i < (ghost || 0); i++) h += '<i class="gh"></i>';
  return h + '</span>';
}
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
    const n = c.kind === 'draw2' ? pips(2) :
              c.kind === 'kaxxa' ? pips(4, 3) : '';
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
let PACE = 780;            /* how long the machine "thinks" */
/* How long you have to shout LAST ONE before somebody notices. The engine
   shuts its window once the next player has finished their go, so this MUST be
   shorter than a machine turn — and the machine is held back by exactly this
   long (see tick) so the window can never expire unused. */
let CALL_WINDOW = 1800;

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
  let seats = Math.min(4, Math.max(2, p.seats | 0 || 3));
  let level = [1, 2, 3].indexOf(p.level | 0) >= 0 ? (p.level | 0) : 3;

  /* WHO IS IN EACH CHAIR.
     It used to be two number pickers — "how many at the table" and "how many
     of them are in the room" — and you had to do the subtraction yourself to
     work out how many machines you had just agreed to. So now every chair is
     a switch you can see and tap. Nobody has to be a machine; a table of four
     people passing one phone is two taps away, and so is playing entirely
     alone against three. Chair one is you and does not toggle, because
     somebody has to be holding the phone. */
  let kinds = Array.isArray(p.kinds) ? p.kinds.slice(0, 4) : ['you', 'ai', 'ai', 'ai'];
  while (kinds.length < 4) kinds.push('ai');
  kinds[0] = 'you';

  const LV = [
    { k: 1, n: 'EASY',  note: 'Plays whatever is legal and forgets to shout. You will win.' },
    { k: 2, n: 'FAIR',  note: 'Sheds its expensive cards and keeps its wilds back.' },
    { k: 3, n: 'NASTY', note: 'Watches which suit you keep running from. Then it uses it.' },
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
      '<p class="blurb">Match the suit or match the number, and empty your hand before ' +
      'the rest of the table empties theirs. Down to your last card you shout ' +
      '<b>LAST ONE</b> — and if you forget, somebody will notice.</p>' +
      '<div class="tiny pt-lbl">How many chairs</div>' +
      '<div class="sk-seats" id="sk-seats">' +
        [2, 3, 4].map(n => '<button class="sk-seatbtn" data-v="' + n + '"><b>' + n + '</b>' +
          '<i>' + (n === 2 ? 'HEADS-UP' : n === 3 ? 'THREE' : 'FULL TABLE') + '</i></button>').join('') +
      '</div>' +
      '<div class="tiny pt-lbl">Who is in them <span class="sk-sub">— tap to switch</span></div>' +
      '<div class="sk-who" id="sk-who"></div>' +
      '<p class="sk-note" id="sk-mix"></p>' +
      '<div id="sk-lvlwrap">' +
        '<div class="tiny pt-lbl">How hard is the machine</div>' +
        '<div class="pt-opts" id="sk-lvl">' +
          LV.map(l => '<button class="pt-opt" data-v="' + l.k + '">' + ico('diff-' + l.k) +
            '<b>' + l.n + '</b><i>' + esc(l.note) + '</i></button>').join('') +
        '</div>' +
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
    const box = el.querySelector('#sk-who');
    box.innerHTML = kinds.slice(0, seats).map((k, i) => {
      const you = i === 0;
      const human = k === 'you';
      return '<button class="sk-chair' + (human ? ' human' : ' bot') + (you ? ' locked' : '') +
        '" data-i="' + i + '"' + (you ? ' aria-disabled="true"' : '') + '>' +
        '<span class="sk-chair-i">' + ico(human ? 'users' : 'coach') + '</span>' +
        '<span class="sk-chair-n">' + (you ? 'YOU' : human ? 'PERSON' : 'MACHINE') + '</span>' +
        '<span class="sk-chair-s">' + (you ? 'this phone' : human ? 'passes the phone' : BOTS[i - 1]) +
        '</span></button>';
    }).join('');
    box.querySelectorAll('.sk-chair').forEach(b => {
      const i = +b.dataset.i;
      if (i === 0) return;
      b.onclick = () => { kinds[i] = kinds[i] === 'ai' ? 'you' : 'ai'; sync(); };
    });
    el.querySelectorAll('#sk-seats .sk-seatbtn').forEach(b =>
      b.classList.toggle('on', +b.dataset.v === seats));
    el.querySelectorAll('#sk-lvl .pt-opt').forEach(b =>
      b.classList.toggle('on', +b.dataset.v === level));

    const bots = kinds.slice(0, seats).filter(k => k === 'ai').length;
    const people = seats - bots;
    el.querySelector('#sk-mix').textContent = bots
      ? (people > 1
          ? people + ' of you sharing this phone, ' + bots + ' played by the machine.'
          : 'You against ' + bots + ' machine' + (bots > 1 ? 's' : '') + '.')
      : 'No machines at all — all ' + people + ' of you passing this one phone round.';
    el.querySelector('#sk-lvlwrap').hidden = !bots;
  };
  el.querySelectorAll('#sk-seats .sk-seatbtn').forEach(b =>
    b.onclick = () => { seats = +b.dataset.v; sync(); });
  el.querySelectorAll('#sk-lvl .pt-opt').forEach(b =>
    b.onclick = () => { level = +b.dataset.v; sync(); });
  sync();

  el.querySelector('#sk-back').onclick = () => { teardown(); P.hub(); };
  el.querySelector('#sk-rules').onclick = () => rulesSheet(el.querySelector('.sk-wrap'), null);
  el.querySelector('#sk-go').onclick = () => {
    ST.pref = { seats, level, kinds: kinds.slice(), sort: ST.pref.sort }; persist();
    start(ST.pref);
  };
}

/* ═══════════════════════════════════════════════════════════════════
   2. THE TABLE
   ═══════════════════════════════════════════════════════════════════ */
const BOTS = ['Ċikku', 'Ġuża', 'Salvu', 'Doris', 'Wenzu', 'Pawlu'];

function start(cfg) {
  injectCSS();
  const seats = cfg.seats, level = cfg.level;
  const kinds = cfg.kinds.slice(0, seats);
  const humans = kinds.filter(k => k === 'you').length;
  /* owner, not a boolean: 'me' is the phone's owner, 'hot' is somebody else
     in the room taking a turn on it, 'ai' is the machine. The transport can
     later flip any of these to 'net' with E.setOwner and nothing else in
     here has to know. */
  const list = kinds.map((k, i) =>
    k === 'you'
      ? { name: humans === 1 ? 'You' : (i === 0 ? 'You' : 'Player ' + (i + 1)),
          owner: i === 0 ? 'me' : 'hot' }
      : { name: BOTS[i - 1] || BOTS[i % BOTS.length], owner: 'ai', level });
  const S = E.newGame({ seats: list });

  /* borrow party.js's frame for the title bar, the turn strip and the
     button bar — then take the square-board sizer straight back off it,
     because a card table is not a chessboard. */
  /* Two buttons, not three. "Nice small, not take the screen": the hand and
     the table are the game, and a row of chrome across the bottom of a 894px
     phone is 46px that the cards are not getting. Rules and the sort switch
     moved up into the thin strip above the hand as icons. */
  const ctx = P.ui.frame({
    title: 'SKARTA', onBack: () => { teardown(); menu(); }, leave: teardown,
    barCls: 'two',
    buttons: [
      { id: 'sk-ahhar', label: 'LAST ONE', icon: 'warn', cls: 'hot' },
      { id: 'sk-draw',  label: 'Draw', icon: 'plus' },
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
        '<div class="sk-tools">' +
          '<span class="sk-hint" id="sk-hint"></span>' +
          '<button class="sk-tool" id="sk-sort" aria-pressed="false" ' +
            'aria-label="Keep my hand sorted">' + ico('refresh') + '</button>' +
          '<button class="sk-tool" id="sk-help" aria-label="House rules">' + ico('book') + '</button>' +
        '</div>' +
        '<div class="sk-hand" id="sk-hand"></div>' +
      '</div>' +
    '</div>';

  G = {
    S, ctx, dead: false, humans, seats,
    view: 0,               /* whose hand is face-up on this phone */
    armed: false,          /* LAST ONE pressed early — fires the moment you hit one card */
    t: null, catchT: null, catchOn: null, callAt: 0,
    sort: !!ST.pref.sort,   /* opt-in: it must never rearrange a hand you arranged */
    drag: null,
    curtain: false,
  };

  ctx.btn('sk-draw').onclick  = onDraw;
  ctx.btn('sk-ahhar').onclick = onAhhar;
  ctx.root.querySelector('#sk-help').onclick = () => rulesSheet(ctx.root, ctx);
  ctx.root.querySelector('#sk-sort').onclick = onSort;
  ctx.root.querySelector('#sk-deckbtn').onclick = onDraw;

  tick();
}

/* the loop: paint, then either wait for a tap or let the machine move */
function tick() {
  if (!G || G.dead) return;
  const S = G.S;
  if (S.over) { render(); return void showResult(); }
  const p = S.players[S.turn];

  const ai = E.isAI(p);
  if (!ai && S.turn !== G.view && G.humans > 1) { curtain(S.turn); return; }
  if (!ai) G.view = S.turn;
  render();
  watchCall();
  /* the machine waits out the rest of anybody's call window before moving:
     if it played on, the engine would shut the window and a player who was
     reaching for the button would silently get away with it */
  if (ai) G.t = setTimeout(aiStep, PACE + windowLeft());
}

/* milliseconds still owed to a HUMAN sitting on one card and saying nothing */
function windowLeft() {
  if (!G || !G.S.call) return 0;
  if (E.isAI(G.S.players[G.S.call.pid])) return 0;
  return Math.max(0, CALL_WINDOW - (Date.now() - (G.callAt || 0)));
}

function aiStep() {
  if (!G || G.dead || G.S.over) { if (G && !G.dead) tick(); return; }
  const S = G.S;
  if (!E.isAI(S.players[S.turn])) { tick(); return; }
  E.aiTurn(S);          /* it calls LAST ONE for itself — see maybeCall() */
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
  if (target === null || E.isAI(S.players[target])) {
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
  /* if they asked for it, keep it tidy as cards arrive — but never mid-drag */
  if (G.sort && !G.drag) E.sortHand(S, seat);
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
              : o.singed ? 'SINGED' : (o.ai ? ['', 'EASY', 'FAIR', 'NASTY'][o.level]
                 : o.owner === 'net' ? 'ONLINE' : 'IN THE ROOM');
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
    const r = E.apply(S, seat, { t: 'catch', target: +b.dataset.catch });
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
    ? 'MAXED OUT — SOMEBODY TAKES ' + v.chain.n
    : v.chain.n + ' TO TAKE — PASS IT ON OR EAT IT';
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
  /* NOTE the cards are never `disabled`: a disabled button swallows pointer
     events, and you must still be able to pick up a card you cannot play in
     order to move it somewhere else in your hand. Playability is carried by
     aria-disabled and the dimmed class, and onCard() refuses illegal plays. */
  hand.innerHTML = me.hand.map((c, i) =>
    '<button data-i="' + i + '" data-uid="' + esc(c.uid) + '" class="sk-h' +
    (mine ? (legal.indexOf(i) >= 0 ? ' yes' : ' no') : '') + '"' +
    (mine && legal.indexOf(i) < 0 ? ' aria-disabled="true"' : '') +
    ' aria-label="' + esc(E.cardLabel(c)) + '">' + cardHTML(c) + '</button>').join('');
  hand.querySelectorAll('button').forEach(b => wireCard(b));

  /* view() only hands us an index when the pending card is OURS — another
     seat's drawn card is visible as a fact but not as a card we can play.
     Declared HERE, above the hint that reads it: it used to sit further down
     next to the draw button and every render threw on the temporal dead zone. */
  const pending = !!(v.pending && v.pending.type === 'drawn' && v.pending.idx >= 0);

  /* — the line under the hand: what the game wants from you — */
  const hint = ctx.root.querySelector('#sk-hint');
  hint.textContent =
    S.over ? '' :
    !mine ? 'Watching ' + who.name + '.' :
    pending
      ? 'You drew ' + E.cardLabel(me.hand[v.pending.idx]) + ' — put it down, or keep it and pass.' :
    v.chain.n ? (v.chain.closed
      ? 'Twelve on the pile. Nothing answers that — tap the deck and take them.'
      : 'A draw card is pointed at you. Answer it, or tap the deck and take ' + v.chain.n + '.') :
    legal.length ? 'Match ' + (suit ? suit.n : '') +
      (v.top && v.top.kind === 'number' ? ' or ' + v.top.num : '') + '.' :
      'Nothing goes. Tap the deck.';

  /* — the toolbar — */
  const sb = ctx.root.querySelector('#sk-sort');
  if (sb) { sb.classList.toggle('on', !!G.sort); sb.setAttribute('aria-pressed', G.sort ? 'true' : 'false'); }

  /* — the buttons — */
  const dbtn2 = ctx.btn('sk-draw');
  dbtn2.disabled = !mine;
  dbtn2.innerHTML = ilb(pending ? 'check' : 'plus',
    pending ? 'Keep it' : v.chain.n ? 'Take ' + v.chain.n : 'Draw');
  const ab = ctx.btn('sk-ahhar');
  ab.disabled = S.over || me.hand.length > 2 || me.said;
  ab.className = 'btn sm ' + (G.armed || me.said ? 'primary' : 'hot') +
                 (me.hand.length === 1 && !me.said && !S.over ? ' due' : '');
  ab.innerHTML = ilb('warn', me.said ? 'Called' : G.armed ? 'Armed' : E.RULES.CALL);
}

function lastLine(S) {
  for (let i = S.log.length - 1; i >= 0; i--) if (S.log[i].text) return S.log[i].text;
  return '';
}

/* ═══════════════════════════════════════════════════════════════════
   4. WHAT A TAP DOES
   ═══════════════════════════════════════════════════════════════════ */
/* ── PICKING A CARD UP ──────────────────────────────────────────────────────
   One gesture, two meanings, decided by how far you move: a tap plays, a drag
   rearranges. Pointer events rather than mouse or touch events, because they
   are the only ones that give the same code path on a phone and on a desktop,
   and setPointerCapture is what stops the drag dying the moment your thumb
   leaves the little card it started on.

   DRAG_SLOP is the whole trick. Fingers are not precise and a "tap" on a phone
   almost always travels three or four pixels; anything under the threshold is
   still a tap, so rearranging never steals a play. */
const DRAG_SLOP = 9;

function wireCard(b) {
  b.onclick = () => { if (!G || !G.dragged) onCard(+b.dataset.i); };
  b.addEventListener('pointerdown', ev => {
    if (!G || G.dead) return;
    if (ev.button !== undefined && ev.button !== 0) return;
    const hand = G.ctx.root.querySelector('#sk-hand');
    G.drag = { b, from: +b.dataset.i, x0: ev.clientX, y0: ev.clientY, live: false,
               left: hand.scrollLeft };
    G.dragged = false;
    try { b.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  b.addEventListener('pointermove', ev => {
    const d = G && G.drag;
    if (!d || d.b !== b) return;
    if (!d.live) {
      if (Math.abs(ev.clientX - d.x0) + Math.abs(ev.clientY - d.y0) < DRAG_SLOP) return;
      d.live = true; G.dragged = true;
      b.classList.add('dragging');
      G.ctx.root.querySelector('#sk-hand').classList.add('sorting');
    }
    ev.preventDefault();
    b.style.transform = 'translate(' + (ev.clientX - d.x0) + 'px,' +
                        Math.max(-40, Math.min(20, ev.clientY - d.y0)) + 'px) scale(1.06)';
    const to = slotAt(ev.clientX, d.from);
    if (to !== d.to) { d.to = to; markSlot(to); }
  });
  const finish = ev => {
    const d = G && G.drag;
    if (!d || d.b !== b) return;
    G.drag = null;
    b.style.transform = '';
    b.classList.remove('dragging');
    const hand = G.ctx.root.querySelector('#sk-hand');
    if (hand) { hand.classList.remove('sorting'); markSlot(-1); }
    if (!d.live) { G.dragged = false; return; }
    if (d.to !== undefined && d.to !== d.from) {
      E.moveCard(G.S, G.view, d.from, d.to);
      /* you have arranged it by hand, so stop rearranging it for them */
      if (G.sort) { G.sort = false; ST.pref.sort = false; persist(); }
      render();
    } else render();
    setTimeout(() => { if (G) G.dragged = false; }, 0);
  };
  b.addEventListener('pointerup', finish);
  b.addEventListener('pointercancel', finish);
}

/* which slot is under this x, given the card is currently at `from` */
function slotAt(x, from) {
  const hand = G.ctx.root.querySelector('#sk-hand');
  const els = [...hand.querySelectorAll('button')];
  let to = 0;
  for (let i = 0; i < els.length; i++) {
    const r = els[i].getBoundingClientRect();
    if (x > r.left + r.width / 2) to = i;
  }
  return Math.max(0, Math.min(els.length - 1, to));
}

function markSlot(to) {
  const hand = G && G.ctx && G.ctx.root.querySelector('#sk-hand');
  if (!hand) return;
  hand.querySelectorAll('button').forEach((el, i) => el.classList.toggle('slot', i === to));
}

/* ── KEEP MY HAND SORTED ────────────────────────────────────────────────────
   Off by default and it stays off once you have moved a card yourself. "Toggle
   or no": a sort that fights the arrangement you just made by hand is worse
   than no sort at all, so this one gets out of the way the moment you drag. */
function onSort() {
  if (!G || G.dead) return;
  G.sort = !G.sort;
  ST.pref.sort = G.sort; persist();
  if (G.sort) E.sortHand(G.S, G.view);
  render();
}

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
  /* through apply(), by uid — the identical door a move off the relay uses,
     so a local tap can never do something a remote player could not */
  const card = S.players[seat].hand[i];
  if (!card) { render(); return; }
  const r = E.apply(S, seat, Object.assign({ t: 'play', uid: card.uid }, opts));
  if (!r.ok) { render(); return; }
  /* armed early: the call goes out the instant the card lands */
  if (G.armed && S.players[seat].hand.length === 1) E.apply(S, seat, { t: 'call' });
  G.armed = false;
  if (r.won) { render(); showResult(); return; }
  tick();
}

function onDraw() {
  if (!G || G.dead) return;
  const S = G.S, seat = G.view;
  if (S.turn !== seat || S.over) return;
  if (S.pending && S.pending.type === 'drawn') { E.apply(S, seat, { t: 'pass' }); tick(); return; }
  if (E.chainLive(S)) { E.apply(S, seat, { t: 'take' }); tick(); return; }
  const r = E.apply(S, seat, { t: 'draw' });
  if (!r.ok) return;
  if (r.playable) { render(); return; }   /* it is still your go until you say */
  tick();
}

function onAhhar() {
  if (!G || G.dead) return;
  const S = G.S, seat = G.view, me = S.players[seat];
  if (me.hand.length === 1) { E.apply(S, seat, { t: 'call' }); toast(E.RULES.CALL); render(); return; }
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
  /* THE POINT OF THIS SHEET: you should be able to choose without reading it.
     Four cards on the left, seven on the right, drawn at the size they will
     actually land in somebody's hand — the difference is a picture, not a sum.
     The words underneath are for the second time you see it, not the first. */
  const heap = n => {
    let h = '<span class="sk-heap">';
    for (let i = 0; i < n; i++) h += '<i style="--i:' + i + '"></i>';
    return h + '</span>';
  };
  sheet(
    '<h3>HOW MUCH OF THE BOX?</h3>' +
    '<p>Suit is <b>' + esc(E.suitOf(suitK).n) + '</b>. It lands on <b>' + esc(victim.name) +
    '</b>, holding <b>' + victim.hand.length + '</b>.</p>' +
    '<div class="sk-charge">' +
      '<button class="sk-chg small" data-c="4">' +
        heap(4) +
        '<b>FOUR</b>' +
        '<i>' + esc(victim.name) + ' takes four and misses a go.</i>' +
        '<span class="sk-cost good">You keep the lead</span></button>' +
      '<button class="sk-chg big" data-c="7">' +
        heap(7) +
        '<b>SEVEN</b>' +
        '<i>' + esc(victim.name) + ' takes seven.</i>' +
        '<span class="sk-cost">You miss your own next turn' +
        (nP > 2 ? ' — ' + (nP - 1) + ' others play first' : '') + '</span></button>' +
    '</div>' +
    '<p class="sk-fine">Three more cards, or a whole turn. Bury somebody about to go out; ' +
    'otherwise the turn is worth more. You are singed either way.</p>' +
    '<button class="btn ghost sm" id="sk-x" style="margin-top:8px;width:100%">Put it back</button>',
    (s2, close) => {
      s2.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { close(); then(+b.dataset.c); });
      s2.querySelector('#sk-x').onclick = close;
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
    /* headings say what the card DOES, in plain English; the Maltese name is
       kept as the joke underneath, which is where flavour belongs */
    rule('sk-a-skip', 'MISS A GO',
      esc(E.KINDS.skip.eff), '“' + esc(E.KINDS.skip.mt) + '” — ' + esc(E.KINDS.skip.txt)) +
    rule('sk-a-reverse', 'TURN ROUND',
      esc(E.KINDS.reverse.eff), '“' + esc(E.KINDS.reverse.mt) + '” — ' + esc(E.KINDS.reverse.txt)) +
    rule('sk-a-draw2', 'TAKE TWO',
      esc(E.KINDS.draw2.eff), '“' + esc(E.KINDS.draw2.mt) + '” — ' + esc(E.KINDS.draw2.txt)) +
    rule('sk-a-wild', 'PICK A SUIT',
      esc(E.KINDS.wild.eff), '“' + esc(E.KINDS.wild.mt) + '” — ' + esc(E.KINDS.wild.txt)) +
    rule('sk-a-kaxxa', 'TAKE ' + R.KAXXA_SMALL + ' OR ' + R.KAXXA_BIG,
      'Name the suit, then choose. <b>' + R.KAXXA_SMALL + '</b> and play carries on. ' +
      '<b>' + R.KAXXA_BIG + '</b> and it does not: the blast takes you as well and you miss ' +
      'your own next turn. Three cards, or a turn. That is the whole card.',
      'You are singed the moment you light it — stacking it away does not save you.') +
    rule('sk-a-draw2', 'STACKING',
      'A draw card can be answered by another and passed on, growing as it goes. ' +
      'A take-two answers a take-two; the big one answers anything; a take-two may not be ' +
      'dropped on the big one.',
      'THE CAP: at ' + R.CHAIN_CAP + ' the chain is shut and whoever is holding it takes ' +
      'the lot. That is what stops it going round the table forever.') +
    rule('sk-a-wild', esc(R.CALL),
      'Down to one card you shout it. Stay quiet until the next player has finished their ' +
      'go and anybody can shout ' + esc(R.CATCH) + ' — and you take ' + R.PENALTY + '.',
      'Tap the button on two cards to arm it, and it goes out the moment the card lands.') +
    rule('sk-a-reverse', 'YOUR HAND, YOUR ORDER',
      'Drag a card sideways to move it. The sort switch above the hand keeps it tidy for ' +
      'you, and turns itself off the moment you rearrange one yourself.') +
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
  const humanWin = !E.isAI(S.players[w]);
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
        go: () => { const p = ST.pref; teardown(); start(p); } },
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
};

/* ── test harness hook ────────────────────────────────────────────────────
   Driven by the UI test suite and by nothing else, and INERT unless the page
   is opened with ?pttest — the same gate js/chess.js and js/dama.js use.
   setPace exists so a headless run can play a 140-move game inside a sane
   timeout without the assertions being loosened to "it probably finished".
   Gated rather than merely unused, because a shipped hook that can slow or
   speed the call window is a way to cheat the LAST ONE timing. */
if (String(location.search).indexOf('pttest') >= 0){
  window.KARTI_SKARTA._ui = {
    start, render, onCard, onDraw, onAhhar, onSort, tick, wireCard,
    setPace(p, w) { PACE = p; if (w !== undefined) CALL_WINDOW = w; },
    pace() { return { PACE, CALL_WINDOW }; },
    get G() { return G; },
  };
}

})();
