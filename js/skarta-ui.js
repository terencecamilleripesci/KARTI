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

/* THE MACHINE, BY NAME. Named once here because two screens want the
   same three words: the setup sheet below, and js/mp.js's shared lobby
   through KARTI_SKARTA.lobby.levels (§10). A difficulty that is called
   one thing offline and another in a room is a bug you only ever find
   on somebody else's phone. */
const LV = [
  { k: 1, n: 'EASY',  note: 'Plays whatever is legal and forgets to shout. You will win.' },
  { k: 2, n: 'FAIR',  note: 'Sheds its expensive cards and keeps its wilds back.' },
  { k: 3, n: 'NASTY', note: 'Watches which suit you keep running from. Then it uses it.' },
];

/* ═══════════════════════════════════════════════════════════════════
   OUR OWN CORNER OF localStorage
   Not karti_save_*, not karti_party_v1. A shedding game is not part of
   anybody's duel profile and must survive a profile switch.
   ═══════════════════════════════════════════════════════════════════ */
const STORE = 'karti_skarta_v1';
let ST = { rec: { w: 0, l: 0 },
           pref: { seats: 3, level: 3, kinds: ['you', 'ai', 'ai', 'ai'], sort: false },
           save: null };          /* ONE table in progress, or null */
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object') {
    if (j.rec && typeof j.rec === 'object') ST.rec = { w: j.rec.w | 0, l: j.rec.l | 0 };
    if (j.pref && typeof j.pref === 'object') Object.assign(ST.pref, j.pref);
    if (j.save && typeof j.save === 'object' && j.save.snap) ST.save = j.save;
  }
} catch (e) {}
function persist() {
  try { localStorage.setItem(STORE, JSON.stringify(ST)); return true; }
  catch (e) { return false; }
}

/* ── THE CRASH NET ──────────────────────────────────────────────────
   The engine has no hidden state — E.snapshot(S) IS the table — so the
   whole game is written after every repaint and on the tab going away,
   exactly the way js/kiri-ui.js does it. A finished table is never
   written (the slot is binned the moment S.over is seen), and a table
   that came off the relay never touches the slot: the other chairs are
   not in the room any more, so it is not resumable from here. */
let saveMoaned = false;
function stash() {
  if (!G || G.dead || G.net || G.noSave) return;
  if (G.S.over) { clearSlot(); return; }
  ST.save = { v: 1, at: Date.now(), snap: E.snapshot(G.S) };
  if (!persist() && !saveMoaned) {
    saveMoaned = true;
    toast('⚠ The phone is not letting SKARTA save. Closing the app will lose this table.');
  }
}
function clearSlot() { if (ST.save) { ST.save = null; persist(); } }

function resumeSaved() {
  const sv = ST.save;
  if (!sv || !sv.snap) return false;
  let S = null;
  try { S = E.load(sv.snap); } catch (e) { S = null; }
  if (!S || S.over) { clearSlot(); return false; }
  openTable(S, null);
  return true;
}

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
    /* Up to nine of these have to fit above the felt without pushing the hand
       off the phone, so it is a wrapping grid rather than a flex row that
       squeezes every chip to nothing. .big drops the pip strip and tightens
       everything once there are more than four opponents. */
    '#scr-party .sk-opps{flex:0 0 auto;display:grid;gap:5px;' +
      'grid-template-columns:repeat(auto-fit,minmax(78px,1fr))}' +
    '#scr-party .sk-opps.big{grid-template-columns:repeat(auto-fit,minmax(62px,1fr));gap:4px}' +
    '#scr-party .sk-opp{position:relative;min-width:0;' +
      'display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px 5px;' +
      'border-radius:12px;background:rgba(255,255,255,.045);border:1px solid var(--line);' +
      'transition:border-color .18s,background .18s}' +
    '#scr-party .sk-opps.big .sk-opp{padding:4px 3px 3px;border-radius:10px}' +
    '#scr-party .sk-opps.big .sk-mini{display:none}' +
    '#scr-party .sk-opps.big .sk-opp-n{font-size:9px}' +
    '#scr-party .sk-opps.big .sk-tagline{display:none}' +
    '#scr-party .sk-opps.big .sk-opp.now .sk-tagline{display:block;font-size:8px}' +
    '#scr-party .sk-opps.big .sk-opp-c b{font-size:13px}' +
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
    /* ── THE RULES DOCK ───────────────────────────────────────────
       Scoped under .sk-wrap so it cannot reach another game's menu —
       the lesson tombla taught today, where one unscoped rule cost
       chess its turn strip for a whole session. */
    '#scr-party .sk-wrap .sk-dock{flex:0 0 auto;margin:0 0 24px;border-radius:15px;' +
      'overflow:hidden;border:1px solid var(--line2);' +
      'background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02))}' +
    '#scr-party .sk-wrap .sk-grip{display:flex;align-items:center;gap:10px;width:100%;' +
      'min-height:48px;padding:8px 14px;border:0;background:none;color:var(--dim);' +
      'text-align:left;cursor:pointer;font:900 11px/1.3 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase}' +
    '#scr-party .sk-wrap .sk-grip .ico{width:17px;height:17px;flex:0 0 auto}' +
    '#scr-party .sk-wrap .sk-grip .cv{margin-left:auto;width:17px;height:17px;flex:0 0 auto;' +
      'transition:transform .2s var(--ease)}' +
    '#scr-party .sk-wrap .sk-dock.open{border-color:rgba(255,197,66,.4)}' +
    '#scr-party .sk-wrap .sk-dock.open .sk-grip{color:var(--gold)}' +
    '#scr-party .sk-wrap .sk-dock.open .cv{transform:rotate(180deg)}' +
    '#scr-party .sk-wrap .sk-dockbody{max-height:min(38vh,300px);overflow-y:auto;' +
      'padding:0 14px 10px}' +
    '#scr-party .sk-wrap .sk-dockbody[hidden]{display:none}' +
    '#scr-party .sk-wrap .sk-dockbody>div{animation:skDockUp .22s var(--ease)}' +
    '#scr-party .sk-wrap .sk-dockbody h3{display:none}' +   /* the grip already says it */
    '@keyframes skDockUp{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}' +
    /* motion is a flourish; the fold must still work without it */
    '@media (prefers-reduced-motion:reduce){' +
      '#scr-party .sk-wrap .sk-dockbody>div{animation:none}' +
      '#scr-party .sk-wrap .sk-grip .cv{transition:none}}' +
    '.reduced #scr-party .sk-wrap .sk-dockbody>div{animation:none}' +
    '.reduced #scr-party .sk-wrap .sk-grip .cv{transition:none}' +

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

    /* ── the entry screen: three big choices, nothing else ──────────────
       The house UX standard the newer games (ludu/kanun/bomba) set: screen
       one is HOW you want to play, not a wall of settings. The chairs, the
       who-is-a-machine grid and the difficulty all moved one tap deeper into
       setup(), reached only once a mode is picked. */
    '#scr-party .sk-modes{display:flex;flex-direction:column;gap:10px;margin:4px 0 8px}' +
    '#scr-party .sk-mode{-webkit-appearance:none;appearance:none;border:0;text-align:left;' +
      'display:flex;align-items:center;gap:12px;padding:15px 15px;border-radius:16px;color:var(--txt);' +
      'background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px var(--line);cursor:pointer;' +
      'touch-action:manipulation}' +
    '#scr-party .sk-mode:active{transform:translateY(1px)}' +
    '#scr-party .sk-mode .sk-mi{width:40px;height:40px;flex:0 0 auto;border-radius:12px;' +
      'display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.07);' +
      'color:var(--dim)}' +
    '#scr-party .sk-mode .sk-mi .ico{width:23px;height:23px}' +
    '#scr-party .sk-mode .sk-mt{flex:1;min-width:0}' +
    '#scr-party .sk-mode .sk-mt b{display:block;font-family:var(--disp);font-weight:900;' +
      'font-size:15px;line-height:1.1;letter-spacing:.02em}' +
    '#scr-party .sk-mode .sk-mt i{display:block;font-style:normal;font-size:11px;line-height:1.3;' +
      'color:var(--dim);margin-top:3px}' +
    '#scr-party .sk-mode .sk-mchev{flex:0 0 auto;opacity:.5;color:var(--dim)}' +
    '#scr-party .sk-mode .sk-mchev svg{width:18px;height:18px;fill:none;stroke:currentColor;' +
      'stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}' +
    '#scr-party .sk-mode.primary{background:linear-gradient(120deg,rgba(255,197,66,.2),' +
      'rgba(232,69,44,.12));box-shadow:inset 0 0 0 1px rgba(255,197,66,.5)}' +
    '#scr-party .sk-mode.primary .sk-mi{background:rgba(255,197,66,.22);color:var(--gold)}' +
    '#scr-party .sk-mode.primary .sk-mt b{color:var(--gold)}' +

    /* ── the chairs on the setup sheet ────────────────────────────────── */
    /* a stepper, not a row of buttons: 2/3/4 does not become 2..10 */
    '#scr-party .sk-step{display:flex;align-items:center;gap:10px}' +
    '#scr-party .sk-stepb{flex:0 0 auto;width:46px;height:44px;border-radius:13px;' +
      'font-size:22px;line-height:1;cursor:pointer;color:var(--txt);' +
      'border:1.5px solid var(--line);background:rgba(255,255,255,.06)}' +
    '#scr-party .sk-stepb:disabled{opacity:.3;cursor:default}' +
    '#scr-party .sk-stepb:active:not(:disabled){background:rgba(255,255,255,.14)}' +
    '#scr-party .sk-stepn{flex:1 1 auto;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;min-height:44px;border-radius:13px;' +
      'border:1.5px solid rgba(255,197,66,.45);background:rgba(255,197,66,.12)}' +
    '#scr-party .sk-stepn b{font-family:var(--disp);font-weight:900;font-size:19px;' +
      'line-height:1;color:var(--gold)}' +
    '#scr-party .sk-stepn i{font-style:normal;font-size:9px;letter-spacing:.09em;' +
      'text-transform:uppercase;color:var(--dim2);margin-top:2px}' +
    /* nobody taps nine chairs one at a time */
    '#scr-party .sk-lblrow{display:flex;align-items:flex-end;justify-content:space-between;gap:8px}' +
    '#scr-party .sk-bulk{display:flex;gap:5px;flex:0 0 auto;padding-bottom:8px}' +
    '#scr-party .sk-bulkb{font-size:9.5px;letter-spacing:.04em;padding:5px 8px;border-radius:8px;' +
      'cursor:pointer;color:var(--dim);border:1px solid var(--line);background:rgba(255,255,255,.05)}' +
    '#scr-party .sk-bulkb:active{background:rgba(255,255,255,.13);color:var(--txt)}' +
    /* the chairs wrap instead of shrinking to nothing */
    '#scr-party .sk-who{display:grid;gap:6px;' +
      'grid-template-columns:repeat(auto-fill,minmax(60px,1fr))}' +
    '#scr-party .sk-chair{min-width:0;display:flex;flex-direction:column;' +
      'align-items:center;gap:2px;padding:8px 3px;border-radius:12px;cursor:pointer;' +
      'border:1.5px solid var(--line);background:rgba(255,255,255,.05);color:var(--txt)}' +
    '#scr-party .sk-chair.human{border-color:rgba(61,220,132,.5);background:rgba(61,220,132,.10)}' +
    '#scr-party .sk-chair.bot{border-color:rgba(138,92,255,.45);background:rgba(138,92,255,.11)}' +
    '#scr-party .sk-chair.locked{opacity:.9;cursor:default}' +
    '#scr-party .sk-chair .ico{width:17px;height:17px;color:var(--dim)}' +
    '#scr-party .sk-chair.human .ico{color:var(--ok)}' +
    '#scr-party .sk-chair.bot .ico{color:var(--neon)}' +
    '#scr-party .sk-chair-n{font-family:var(--disp);font-weight:900;font-size:9px;' +
      'letter-spacing:.05em;max-width:100%;overflow:hidden;text-overflow:ellipsis;' +
      'white-space:nowrap}' +
    '#scr-party .sk-sub{font-weight:400;letter-spacing:0;text-transform:none;color:var(--dim2)}' +
    '#scr-party .sk-note{font-size:11px;line-height:1.45;color:var(--dim);margin:8px 0 0}' +

    /* the commentary must never squeeze out whose go it is */
    '#scr-party .sk-wrap .pt-who{flex:0 0 auto;overflow:visible}' +
    '#scr-party .sk-wrap .pt-note{flex:1 1 auto;min-width:0;overflow:hidden;' +
      'text-overflow:ellipsis;white-space:nowrap}' +

    /* ── the sheets: name a suit, choose a charge, read the rules ──── */
    '#scr-party .sk-sheet{position:absolute;inset:0;z-index:40;display:flex;align-items:flex-end;' +
      'justify-content:center;background:rgba(6,4,12,.72);padding:12px;' +
      'padding-bottom:calc(12px + var(--skhand,0px))}' +
    /* the panel may only use the room ABOVE the hand, or a long one grows
       back down over the very cards this was meant to uncover */
    '#scr-party .sk-sheet .sk-panel{width:100%;max-width:420px;' +
      'max-height:calc(100% - var(--skhand,0px));overflow-y:auto;' +
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
  try { E.onEvent(null); } catch (e) {}   /* stop feeding js/sfx.js */
  G.dead = true;
  clearTimeout(G.t); clearTimeout(G.catchT);
  if (G.ctx && G.ctx.stopFit) { try { G.ctx.stopFit(); } catch (e) {} }
  G = null;
  /* the room this table came out of, if any, goes with it. The move
     subscription itself is js/mp.js's to drop — it holds the unsubscribe
     onMove() handed back — and everything of ours is guarded on G. */
  NET = null;
}

/* the two lifecycle events iOS actually fires on a swipe-away. stash()
   already rides every repaint; this catches a tab dying mid-thought. */
document.addEventListener('visibilitychange', () => { if (document.hidden) stash(); });
window.addEventListener('pagehide', () => stash());

/* ═══════════════════════════════════════════════════════════════════
   1. THE SETUP SHEET
   party.js's shared setup() asks "who is playing / how hard / which
   side", which is the wrong set of questions for a four-hander. So
   SKARTA asks its own three.
   ═══════════════════════════════════════════════════════════════════ */
/* THE RULES DOCK, wired the same way on the entry screen and on the setup
   step. It reads the same UI-only key both games remember, so the fold's
   state carries between the two steps and never lands in the game save. */
function wireDock(el) {
  const dock  = el.querySelector('#sk-dock');
  const grip  = el.querySelector('#sk-grip');
  const dbody = el.querySelector('#sk-dockbody');
  if (!dock || !grip || !dbody) return;
  const setDock = open => {
    dock.classList.toggle('open', open);
    dbody.hidden = !open;
    grip.setAttribute('aria-expanded', open ? 'true' : 'false');
    grip.setAttribute('aria-label', open ? 'Close the house rules' : 'Open the house rules');
    try { localStorage.setItem('karti_skarta_ui_v1.rules', open ? '1' : '0'); } catch(e){}
  };
  grip.onclick = () => setDock(dbody.hidden);
  try { if (localStorage.getItem('karti_skarta_ui_v1.rules') === '1') setDock(true); } catch(e){}
}

/* the sliding rules fold, in the flow at the foot of a screen — never a
   modal over it. The same markup on both steps, so it looks identical. */
function dockHTML() {
  return '<div class="sk-dock" id="sk-dock">' +
    '<button type="button" class="sk-grip" id="sk-grip" aria-expanded="false" ' +
      'aria-controls="sk-dockbody" aria-label="Open the house rules">' +
      ico('book') + '<span>How to play</span>' +
      '<svg class="cv" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M6 14.6l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '</button>' +
    '<div class="sk-dockbody" id="sk-dockbody" hidden><div>' +
      rulesBody(false) + '</div></div>' +
  '</div>';
}

const CHEV_MODE = '<span class="sk-mchev"><svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M9 6l6 6-6 6"/></svg></span>';

/* ── THE ENTRY SCREEN — the house UX standard the newer games set ──────
   Screen one is HOW you want to play, not a wall of settings. Three big
   choices and the rules a tap away underneath; chairs, who-is-a-machine
   and difficulty all live one step deeper in setup(), reached only once a
   mode is chosen. All three modes are real: PLAY ONLINE walks to the
   shared lobby (the KARTI_MP.openFor door that was a buried ghost button),
   PLAY WITH AI and PASS THE PHONE both go to setup() with the right
   default kinds already chosen, so Deal is always right there. */
function menu() {
  injectCSS();
  P.show();
  teardown();
  detectArt(() => {});
  const el = P.ui.screenEl();
  const canOnline = !!(window.KARTI_MP && window.KARTI_MP.openFor);

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
      (ST.save && ST.save.snap
        ? '<button class="btn primary" id="sk-carry" style="margin:2px 0 12px">' +
            ilb('play', 'Carry on with the saved table') + '</button>'
        : '') +
      '<div class="sk-modes">' +
        (canOnline
          ? '<button class="sk-mode primary" id="sk-m-online">' +
              '<span class="sk-mi">' + ico('users') + '</span>' +
              '<span class="sk-mt"><b>PLAY ONLINE</b>' +
                '<i>Everyone on their own phone.</i></span>' + CHEV_MODE +
            '</button>'
          : '') +
        '<button class="sk-mode' + (canOnline ? '' : ' primary') + '" id="sk-m-ai">' +
          '<span class="sk-mi">' + ico('coach') + '</span>' +
          '<span class="sk-mt"><b>PLAY WITH AI</b>' +
            '<i>You against the machine.</i></span>' + CHEV_MODE +
        '</button>' +
        '<button class="sk-mode" id="sk-m-pass">' +
          '<span class="sk-mi">' + ico('cards') + '</span>' +
          '<span class="sk-mt"><b>PASS THE PHONE</b>' +
            '<i>Two or more of you, one phone.</i></span>' + CHEV_MODE +
        '</button>' +
      '</div>' +
      (ST.rec.w + ST.rec.l
        ? '<p class="pt-ledger">At this table so far: <b>' + ST.rec.w + '</b> won, <b>' +
          ST.rec.l + '</b> lost.</p>' : '') +
      dockHTML() +
    '</div></div>';

  el.querySelector('#sk-back').onclick = () => { teardown(); P.hub(); };
  { const cb = el.querySelector('#sk-carry');
    if (cb) cb.onclick = () => { if (!resumeSaved()) menu(); }; }
  const on = el.querySelector('#sk-m-online');
  /* PLAY ONLINE — the transport half (KARTI_PARTY.online.skarta) has always
     worked; this is simply the door to it. The lobby takes it from here. */
  if (on) on.onclick = () => window.KARTI_MP.openFor('skarta');
  el.querySelector('#sk-m-ai').onclick   = () => setup('ai');
  el.querySelector('#sk-m-pass').onclick = () => setup('pass');
  wireDock(el);
}

/* ── THE SETUP STEP — one tap deeper, the deliberate path ──────────────
   Reached only after a mode is picked. `mode` decides the default seating:
   AI seats you against machines, PASS THE PHONE seats a table of people on
   one phone — but every chair is still a switch you can flip, and the count
   is a stepper, exactly as before. Difficulty only shows when a machine is
   actually at the table. Deal fills the same ST.pref the lobby contract
   reads — kinds[] (you/ai) + seats + level, first kind always 'you'. */
function setup(mode) {
  injectCSS();
  P.show();
  teardown();
  detectArt(() => {});
  const el = P.ui.screenEl();
  const p = ST.pref;
  const MAXS = E.RULES.MAX_SEATS, MINS = E.RULES.MIN_SEATS;
  let seats = Math.min(MAXS, Math.max(MINS, p.seats | 0 || 3));
  let level = [1, 2, 3].indexOf(p.level | 0) >= 0 ? (p.level | 0) : 3;

  /* WHO IS IN EACH CHAIR. Chair one is you and never toggles — somebody has
     to be holding the phone. The mode seeds the rest: AI fills them with
     machines, PASS THE PHONE fills them with people. From there every chair
     is a tap, so a mixed table (some people, some machines) is still one tap
     away from either mode. */
  let kinds = ['you'];
  for (let i = 1; i < MAXS; i++) kinds.push(mode === 'pass' ? 'you' : 'ai');

  el.innerHTML =
    '<div class="pt-wrap sk-wrap">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="sk-back" aria-label="Back">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + (mode === 'pass' ? 'PASS THE PHONE' : 'PLAY WITH AI') + '</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<button class="btn primary" id="sk-go" style="margin:6px 0 14px">' +
        ilb('play', 'Deal') + '</button>' +
      '<div class="tiny pt-lbl">How many chairs</div>' +
      '<div class="sk-step">' +
        '<button class="sk-stepb" id="sk-less" aria-label="Fewer chairs">&minus;</button>' +
        '<span class="sk-stepn"><b id="sk-count">' + seats + '</b><i id="sk-countl"></i></span>' +
        '<button class="sk-stepb" id="sk-more" aria-label="More chairs">+</button>' +
      '</div>' +
      '<div class="sk-lblrow">' +
        '<span class="tiny pt-lbl">Who is in them <span class="sk-sub">— tap to switch</span></span>' +
        '<span class="sk-bulk">' +
          '<button class="sk-bulkb" id="sk-allai">All machines</button>' +
          '<button class="sk-bulkb" id="sk-allyou">All people</button>' +
        '</span>' +
      '</div>' +
      '<div class="sk-who" id="sk-who"></div>' +
      '<p class="sk-note" id="sk-mix"></p>' +
      '<div id="sk-lvlwrap">' +
        '<div class="tiny pt-lbl">How hard is the machine</div>' +
        '<div class="pt-opts" id="sk-lvl">' +
          LV.map(l => '<button class="pt-opt" data-v="' + l.k + '">' + ico('diff-' + l.k) +
            '<b>' + l.n + '</b><i>' + esc(l.note) + '</i></button>').join('') +
        '</div>' +
      '</div>' +
      dockHTML() +
    '</div></div>';

  const sync = () => {
    const box = el.querySelector('#sk-who');
    box.innerHTML = kinds.slice(0, seats).map((k, i) => {
      const you = i === 0;
      const human = k === 'you';
      return '<button class="sk-chair' + (human ? ' human' : ' bot') + (you ? ' locked' : '') +
        '" data-i="' + i + '"' + (you ? ' aria-disabled="true"' : '') +
        ' aria-label="Chair ' + (i + 1) + ': ' + (you ? 'you' : human ? 'a person' : 'the machine') + '">' +
        '<span class="sk-chair-i">' + ico(human ? 'users' : 'coach') + '</span>' +
        '<span class="sk-chair-n">' + (you ? 'YOU' : human ? 'P' + (i + 1) : esc(BOTS[i - 1])) +
        '</span></button>';
    }).join('');
    box.querySelectorAll('.sk-chair').forEach(b => {
      const i = +b.dataset.i;
      if (i === 0) return;
      b.onclick = () => { kinds[i] = kinds[i] === 'ai' ? 'you' : 'ai'; sync(); };
    });
    el.querySelector('#sk-count').textContent = seats;
    el.querySelector('#sk-countl').textContent =
      seats === 2 ? 'heads-up' : seats >= 9 ? 'a proper crowd' : seats >= 6 ? 'a big table' : 'chairs';
    el.querySelector('#sk-less').disabled = seats <= MINS;
    el.querySelector('#sk-more').disabled = seats >= MAXS;
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
  el.querySelector('#sk-less').onclick = () => { if (seats > MINS) { seats--; sync(); } };
  el.querySelector('#sk-more').onclick = () => { if (seats < MAXS) { seats++; sync(); } };
  el.querySelector('#sk-allai').onclick  = () => { for (let i = 1; i < MAXS; i++) kinds[i] = 'ai'; sync(); };
  el.querySelector('#sk-allyou').onclick = () => { for (let i = 1; i < MAXS; i++) kinds[i] = 'you'; sync(); };
  el.querySelectorAll('#sk-lvl .pt-opt').forEach(b =>
    b.onclick = () => { level = +b.dataset.v; sync(); });
  sync();

  /* Back returns to the entry screen, never a confirmation popup. */
  el.querySelector('#sk-back').onclick = () => menu();
  wireDock(el);
  el.querySelector('#sk-go').onclick = () => {
    ST.pref = { seats, level, kinds: kinds.slice(), sort: ST.pref.sort }; persist();
    start(ST.pref);
  };
}

/* ═══════════════════════════════════════════════════════════════════
   2. THE TABLE
   ═══════════════════════════════════════════════════════════════════ */
const BOTS = ['Ċikku', 'Ġuża', 'Salvu', 'Doris', 'Wenzu', 'Pawlu',
              'Rita', 'Toni', 'Karmnu', 'Manwela'];

function start(cfg) {
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
  return openTable(E.newGame({ seats: list }), { humans, seats });
}

/* THE TABLE ITSELF, once somebody has decided who is in it.
   Split out of start() so the online half (§10) can put a relayed deal on
   exactly the same screen rather than growing a second one. `o.seat` is
   which chair this phone is looking out of — 0 offline, and whatever the
   room gave us online. */
function openTable(S, o) {
  injectCSS();
  /* Offline we arrived through menu(), which has already done this. Online we
     arrived from the room list on another screen entirely, and party.js's
     screen has to be the one that is on before a frame is built into it. */
  P.show();
  const seats = S.players.length;
  const humans = (o && o.humans != null)
    ? o.humans : S.players.filter(p => E.isLocal(p)).length;
  const mySeat = Math.max(0, Math.min(seats - 1, (o && o.seat) | 0));

  /* borrow party.js's frame for the title bar, the turn strip and the
     button bar — then take the square-board sizer straight back off it,
     because a card table is not a chessboard. */
  /* Two buttons, not three. "Nice small, not take the screen": the hand and
     the table are the game, and a row of chrome across the bottom of a 894px
     phone is 46px that the cards are not getting. Rules and the sort switch
     moved up into the thin strip above the hand as icons. */
  const ctx = P.ui.frame({
    /* THE ONLINE BACK DOOR LEAVES THE ROOM — teardown()+menu() alone kept
       the SOCKET SEATED: the relay never heard a 'leave', so the other
       phones were never told and a 1v1 stayer never got the win the
       confirm sheet had just promised the leaver. Same net-leave door the
       result screen's own buttons already use (goBack in showResult). */
    title: 'SKARTA',
    onBack: () => {
      const n = (G && G.net) ? NET : null;
      teardown();
      if (n && n.onLeave) n.onLeave(); else menu();
    },
    leave: teardown,
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
    view: mySeat,          /* whose hand is face-up on this phone */
    mySeat,                /* ...and, online, the ONLY one it may ever be */
    net: null,             /* set by §10 when this table came off the relay */
    /* §10 sets G.net a moment AFTER this table is opened, and the first
       tick lands in that gap — this flag keeps a relayed deal out of the
       offline save slot from the very first paint */
    noSave: !!(o && o.net),
    armed: false,          /* LAST ONE pressed early — fires the moment you hit one card */
    t: null, catchT: null, catchOn: null, callAt: 0,
    sort: !!ST.pref.sort,   /* opt-in: it must never rearrange a hand you arranged */
    drag: null,
    curtain: false,
  };

  /* js/sfx.js built a SKARTA dispatcher and asked the engine to feed it.
     The engine has no idea what a speaker is, so the translation lives here:
     'over' is win-or-lose from THIS seat, which is the one thing the rules
     cannot know. Guarded on every side — no sound layer, no problem. */
  E.onEvent((type, info) => {
    const SFX = window.KARTI_SFX;
    if (!SFX || typeof SFX.skarta !== 'function' || !G || G.dead) return;
    if (type === 'over') { SFX.skarta('over', { win: info.winner === G.view }); return; }
    SFX.skarta(type, info);
  });

  ctx.btn('sk-draw').onclick  = onDraw;
  ctx.btn('sk-ahhar').onclick = onAhhar;
  ctx.root.querySelector('#sk-help').onclick = () => rulesSheet(ctx.root, ctx);
  ctx.root.querySelector('#sk-sort').onclick = onSort;
  ctx.root.querySelector('#sk-deckbtn').onclick = onDraw;

  tick();
  return G;
}

/* Does THIS phone drive the machines? Offline, always. Online, only the
   host's, and that is not a nicety: every phone in the room runs the same
   engine off the same seed, so if two of them ran the machine's turn the
   same move would be made twice — once locally and once off the wire — and
   the tables would part company on the very first bot go. One phone thinks;
   the rest are told. See §10. */
function iDrive() { return !G || !G.net || G.net.host; }

/* the loop: paint, then either wait for a tap or let the machine move */
function tick() {
  if (!G || G.dead) return;
  const S = G.S;
  stash();     /* the curtain path below returns without a repaint */
  if (S.over) { render(); return void showResult(); }
  const p = S.players[S.turn];

  const ai = E.isAI(p);
  /* ONLINE THERE IS NOTHING TO PASS. The curtain exists for several people
     round one phone; over a relay every player has their own, and this one
     only ever looks out of its own chair. */
  if (G.net) G.view = G.mySeat;
  else if (!ai && S.turn !== G.view && G.humans > 1) { curtain(S.turn); return; }
  else if (!ai) G.view = S.turn;
  render();
  watchCall();
  /* the machine waits out the rest of anybody's call window before moving:
     if it played on, the engine would shut the window and a player who was
     reaching for the button would silently get away with it */
  if (ai && iDrive()) G.t = setTimeout(aiStep, PACE + windowLeft());
  /* a chair the relay freed for good: EVERY phone plays it out locally,
     identically — see goneStep() */
  else if (!ai && G.net && NET && NET.gone && NET.gone[S.turn])
    G.t = setTimeout(goneStep, PACE + windowLeft());
}

/* ── A CHAIR THE RELAY FREED MID-HAND ───────────────────────────────
   Without this the turn parked on the empty chair forever: only that
   phone may move for the chair, and it is not coming back. The fix is
   a policy so simple every phone computes it identically with nothing
   on the wire: the empty chair TAKES a chain owed to it, KEEPS a card
   it just drew, and otherwise DRAWS ONE and says nothing. No AI, no
   clock, no choice — the same three rules in the same order on every
   phone, applied through the same engine gate as every other move,
   with src 'net' so nothing is re-broadcast. The seat still gets
   caught on LAST ONE like anybody else; it just never shouts. */
function goneStep() {
  if (!G || G.dead || !NET) return;
  const S = G.S;
  if (S.over) return;
  const g = S.turn;
  if (!NET.gone || !NET.gone[g] || E.isAI(S.players[g])) return;
  let done = false;
  if (S.chain && S.chain.n > 0) done = E.apply(S, g, { t: 'take' }, 'net').ok;
  else if (S.pending && S.pending.type === 'drawn' && S.pending.pid === g)
    done = E.apply(S, g, { t: 'pass' }, 'net').ok;
  else {
    /* play the FIRST card the engine accepts, in hand order — same hand,
       same order, same answer on every phone. Choice-bearing cards refuse
       themselves (a wild needs a suit, a Kaxxa needs a charge) and are
       simply skipped: the empty chair never makes a choice, but it does
       keep shedding, so a heads-up hand against it can still end. */
    const hand = (S.players[g] && S.players[g].hand) || [];
    for (let i = 0; i < hand.length && !done; i++)
      done = E.apply(S, g, { t: 'play', uid: hand[i].uid }, 'net').ok;
    if (!done) done = E.apply(S, g, { t: 'draw' }, 'net').ok;
  }
  void done;
  render();
  if (S.over) { showResult(); return; }
  tick();
}

/* milliseconds still owed to a HUMAN sitting on one card and saying nothing */
function windowLeft() {
  if (!G) return 0;
  /* only a HUMAN needs real time to reach for the button */
  if (!E.openCalls(G.S).some(pid => !E.isAI(G.S.players[pid]))) return 0;
  return Math.max(0, callWindow() - (Date.now() - (G.callAt || 0)));
}

/* A bigger table needs a slightly longer real-time window: there are more
   chips to scan before you spot the one sitting on a single card. The
   engine's own window (callPlies) is what actually decides whether a catch
   is legal — this only stops the machine moving before you can react. */
function callWindow() {
  if (!G) return CALL_WINDOW;
  return Math.min(3200, CALL_WINDOW + Math.max(0, G.S.players.length - 4) * 110);
}

function aiStep() {
  if (!G || G.dead || G.S.over) { if (G && !G.dead) tick(); return; }
  const S = G.S;
  if (!E.isAI(S.players[S.turn]) || !iDrive()) { tick(); return; }
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
  /* more than one seat can be sitting on a single card at a big table, so
     this watches the SET rather than one slot */
  const open = E.openCalls(S).filter(pid => !E.isAI(S.players[pid]));
  const key = open.join(',');
  if (!open.length) {
    if (G.catchOn !== null) { clearTimeout(G.catchT); G.catchT = null; G.catchOn = null; }
    return;
  }
  if (G.catchOn === key) return;
  clearTimeout(G.catchT);
  G.catchOn = key;
  G.callAt = Date.now();
  G.catchT = setTimeout(() => {
    if (!G || G.dead) return;
    G.catchOn = null;
    /* aiCatch() MAKES A MOVE, so it obeys the same one-phone rule the rest of
       the machine does: online, only the host's copy shouts CAUGHT, and the
       other phones are told about it like any other move. */
    if (!iDrive()) return;
    const c = E.aiCatch(G.S);
    if (c) { toast(G.S.players[c.by].name + ': "' + E.RULES.CATCH + '" — ' +
                   G.S.players[c.target].name + ' takes ' + E.RULES.PENALTY + '.'); render(); }
  }, callWindow());
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
  opps.className = 'sk-opps' + (v.opponents.length > 4 ? ' big' : '');
  opps.innerHTML = v.opponents.map(o => {
    const n = Math.min(o.cards, 5);
    let mini = ''; for (let i = 0; i < n; i++) mini += '<i></i>';
    /* the count is the thing that matters; at a big table the pips are cut
       by CSS and the number carries it alone */
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
  /* data-sfx="own" tells js/sfx.js's delegated tap layer to keep its hands off
     these: a card in this hand already makes card.throw (or ui.error when it
     is refused) through the engine's own event stream, and without the marker
     every single card tap ALSO got a generic ui.tap on top of it. The layer
     skips `.card`, which is what the duel's cards are called — ours are
     `.sk-h`, so the class-name list never covered them. Measured by tapping
     real cards: card.throw + ui.tap on every play, until this landed. */
  hand.innerHTML = me.hand.map((c, i) =>
    '<button data-sfx="own" data-i="' + i + '" data-uid="' + esc(c.uid) + '" class="sk-h' +
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

  /* every repaint follows a state change, so the crash net rides on it —
     stash() itself refuses finished, dead and relayed tables */
  stash();
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
  if (!c || !E.canPlay(S, c)) {
    if (window.KARTI_SFX && KARTI_SFX.skarta) KARTI_SFX.skarta('illegal', {});
    return;
  }
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
  /* SIT ABOVE THE HAND, NOT ON TOP OF IT.
     The sheet is bottom-anchored, which is right for a thumb — but the hand
     is at the bottom too, so the panel landed straight over the cards. For
     the suit picker that is backwards: naming a suit is a decision ABOUT the
     cards you are holding, and it was being asked with them hidden. It is
     why that sheet prints a count of each suit you hold — a caption standing
     in for the thing itself, which you can now simply look at.

     Measured rather than assumed, because the hand's height moves with the
     card size and the phone; measured BEFORE the sheet enters the document,
     so the reading cannot include the sheet itself; and zero when there is
     no hand on screen, which leaves every other sheet exactly as it was. */
  const handEl = root.querySelector('.sk-hand');
  /* THE LIFT IS TO THE HAND'S TOP, NOT ITS HEIGHT. Measured the obvious way
     first — the hand is 124px tall, so lift by 124 — and it still covered
     the cards, because the hand is not flush to the bottom: on a 390x844
     phone it ends 65px up, above the safe-area inset. The distance that
     matters is from the bottom of the box the sheet lives in to the TOP of
     the hand, which is the only reading that does not depend on what else
     the layout has put underneath. */
  let lift = 0;
  if (handEl){
    const rr = root.getBoundingClientRect();
    const hr = handEl.getBoundingClientRect();
    lift = Math.max(0, Math.round(rr.bottom - hr.top));
  }
  if (lift) s.style.setProperty('--skhand', lift + 'px');
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
/* THE RULES, ONCE. The in-game sheet and the menu's dock both draw from
   here — SKARTA was the screen every other game's menu was copied from,
   and it ended up the only one still opening its rules in a modal. Two
   copies of the same rules is how they start disagreeing. */
function rulesBody(withDone) {
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
    (withDone
      ? '<button class="btn primary" id="sk-x" style="margin-top:14px;width:100%">Right, got it</button>'
      : '');
  return html;
}

function rulesSheet(root, ctx) {
  const html = rulesBody(true);

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

/* ── the shared winner screen (js/rebbieh.js), and its till ──────────
   The felt's own voice in this file is English by design, but the shared
   podium is bilingual in every other game in the box, so the few strings
   this section adds carry both tongues through the house helper. */
const TW = (en, mt) => (window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en);
const KR_BORDER = ['jade', 'ruby', 'ice', 'gold', 'neon', 'fire', 'ice', 'silver'];

/* Is this table a staked room right now? Read off js/mp.js's own pot
   record, exactly the way progress.js reads it for the ranked rate. */
function stakedNow() {
  try { return !!(window.KARTI_MP && KARTI_MP.MP && KARTI_MP.MP.stakeLive); }
  catch (e) { return false; }
}
/* Settle the pot by name. mp.js's own ceremony hangs off
   KARTI_PARTY.ui.result, which the podium path never calls, so the podium
   asks for the settle itself. Idempotent twice over — mp.js's settled flag
   and progress.js's id guard — and a friendly or offline table has no
   stakeLive record, so this returns null and not a chip moves. */
function settleStake(tone) {
  try {
    const MPX = window.KARTI_MP;
    if (MPX && MPX.MP && MPX.MP.stakeLive && MPX.stakeSettle) return MPX.stakeSettle(tone);
  } catch (e) {}
  return null;
}
/* the reward block rebbieh animates: this game's own pay, and the pot */
function rewardOf(pay, stk) {
  const r = {};
  if (pay && pay.counted) { r.xp = pay.xp; r.chips = pay.chips; r.wonBonus = pay.wonBonus; }
  if (stk) { r.staked = stk.ante; if (stk.kind === 'win') r.pot = stk.pot; }
  return (r.xp || r.chips || r.staked) ? r : null;
}

function showResult() {
  if (!G || G.dead) return;
  const S = G.S, ctx = G.ctx;
  clearSlot();   /* a finished table must never turn up offering a resume */
  clearTimeout(G.catchT); G.catchT = null;
  const w = S.over.winner;
  const humanWin = !E.isAI(S.players[w]);
  /* DID *I* WIN? Online it is MY CHAIR and nobody else's. The offline
     shorthand below ("one human at this table, and a human won — that
     is you") was also true on EVERY phone of an online room, where
     humans is 1 by construction — so every phone crowned itself and,
     on a staked table, every phone paid itself the WHOLE pot. Two
     wallets up 115 chips from a 50-chip pot, caught by the pre-party
     verification. Online asks the only honest question instead. */
  const iWon = G.net ? (w === G.mySeat)
                     : (w === G.view || (G.humans === 1 && humanWin));
  ST.rec[iWon ? 'w' : 'l']++; persist();

  /* ONE decision, up here, because the money follows the screen. On the
     podium path the pay goes through KARTI_XP.awardPlay by hand — the wrap
     progress.js hangs on P.ui.result never fires when P.ui.result is never
     called, and a game that forgot that would quietly stop paying. On the
     card path the old wiring still does the paying, untouched. */
  const R2 = window.KARTI_REBBIEH;
  const useR2 = !!(R2 && R2.show && window.KARTI_XP && KARTI_XP.awardPlay);

  /* The pay must speak BEFORE the record book below: both carry this same
     match id into the ladder and the first one in is the one that pays —
     awardPlay going first is what lets it hand back the figures the
     podium animates. */
  let pay = null;
  if (useR2) {
    try {
      pay = KARTI_XP.awardPlay({ game: 'skarta', won: iWon,
                                 id: S.gid, ranked: stakedNow() });
    } catch (e) {}
  }
  /* SKARTA kept its own tally and reported to nothing else, so it was the
     one game absent from BOTH the party ledger and the record book. Guarded:
     stats.js is optional and a fault there must not take down a finished
     game. The match id makes it idempotent, since showResult() is reachable
     from more than one place. */
  try {
    if (window.KARTI_STATS && KARTI_STATS.record)
      KARTI_STATS.record('skarta', { result: iWon ? 'win' : 'loss',
                                     id: (G && G.S && G.S.gid) || undefined });
  } catch (e) {}

  if (useR2) {
    /* a 1v1 walk-out settled the pot in mp.js before this ran (the
       sole-win hook stashed it on G); settleStake is a no-op then and
       the stashed record is what the podium paints — once */
    const stk = settleStake(iWon ? 'win' : 'lose') ||
                (iWon && G.solePot ? G.solePot : null);
    G.solePot = null;
    const goBack = () => { const n = NET; teardown();
                          if (n && n.onLeave) n.onLeave(); else P.hub(); };
    const rows = S.over.scores.slice()
      /* the winner first (empty hand), then the rest by how little they
         were caught holding — same ranking the old card printed */
      .sort((a, b) => (a.id === w ? -1 : b.id === w ? 1 : a.points - b.points))
      .map((s2, i) => ({
        name: s2.name, place: i + 1,
        you: s2.id === G.view,
        bot: E.isAI(S.players[s2.id]),
        score: s2.id === w
          ? TW('out', 'barra')
          : s2.cards + ' ' + TW(s2.cards === 1 ? 'card' : 'cards', 'karti') +
            (s2.points ? ' (' + s2.points + ')' : ''),
        border: KR_BORDER[s2.id % KR_BORDER.length]
      }));
    R2.show({
      lang: window.KARTI_LANG ? KARTI_LANG.lang() : 'en',
      title: iWon ? TW('You win', 'Rebaħt')
                  : S.players[w].name + ' ' + TW('takes it', 'jeħodha'),
      subtitle: TW('Skarta kollox — first to an empty hand.',
                   'Skarta kollox — l-ewwel wieħed b’idejh vojta.'),
      rows,
      xp: pay && pay.counted
        ? { level: pay.level, gained: pay.xp, leveledUp: !!pay.levelled,
            /* fractions unknown to us; a satisfying near-full bar */
            before: 0, after: pay.levelled ? 1 : 0.7 }
        : null,
      reward: rewardOf(pay, stk),
      sound: id => { const SFX = window.KARTI_SFX;
                     if (SFX && SFX.play) { try { SFX.play(id, { gain: 0.6 }); } catch (e) {} } },
      /* A ROOM IS NOT DEALT AGAIN FROM HERE — same law as the card below:
         online, the only honest button is the one back to the room list. */
      playAgainLabel: G.net ? TW('Back to the rooms', 'Lura lejn il-kmamar')
                            : TW('Deal again', 'Erġa’ qassam'),
      onPlayAgain: G.net ? goBack : () => { const p = ST.pref; teardown(); start(p); },
      onLeave: G.net ? goBack : () => { teardown(); P.hub(); }
    });
    return;
  }

  const table = S.over.scores.slice().sort((a, b) => a.points - b.points)
    .map(s => s.name + ' — ' + s.cards + (s.cards === 1 ? ' card' : ' cards') +
              (s.points ? ' (' + s.points + ')' : '')).join(' · ');

  P.ui.result(ctx, {
    tone: iWon ? 'win' : 'lose',
    head: S.players[w].name + (humanWin && G.humans === 1 && iWon ? ' — out!' : ' takes it'),
    why: 'Empty hand. ' + table,
    quip: (iWon ? QUIP_WIN : QUIP_LOSE)[Math.floor(Math.random() * 3)],
    /* A ROOM IS NOT DEALT AGAIN FROM HERE. Offline "Deal again" is this
       phone's business; online it is nine other people's, and the way back
       is the room list. So the online table offers the one button that is
       actually true. */
    buttons: G.net
      ? [{ label: 'Back to the rooms', icon: 'back', cls: 'primary',
           go: () => { const n = NET; teardown();
                       if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
      : [
          { label: 'Deal again', icon: 'refresh', cls: 'primary',
            go: () => { const p = ST.pref; teardown(); start(p); } },
          { label: 'The shelf', icon: 'back', cls: 'ghost',
            go: () => { teardown(); P.hub(); } },
        ],
  });
}

/* ═══════════════════════════════════════════════════════════════════
   8b. THE SHORT RULES, FOR A STRANGER IN A ROOM
   The sheet above is the full house rules and it is a sheet — it takes
   the screen, it has a Got it button, and it is the wrong object to
   drop into somebody else's lobby. This is the thirty-second version
   that folds open in place, and it is read off the same E.RULES block
   so it cannot drift away from the sheet or from the engine.
   ═══════════════════════════════════════════════════════════════════ */
function rulesPanel() {
  const R = E.RULES;
  return '<p>Match the <b>suit</b> or match the <b>number</b>. If you cannot, you draw one — ' +
      'and you may play it straight away or keep it. First to an empty hand takes it.</p>' +
    '<p>Four suits, ' + R.HAND + ' cards each off a deck of 108. Miss-a-go, turn-round and ' +
      'take-two do what they say. A wild names the suit. The <b>Kaxxa Infernali</b> names the ' +
      'suit and then charges ' + R.KAXXA_SMALL + ' or ' + R.KAXXA_BIG + ' — the big one takes ' +
      'you with it and you miss your own next turn.</p>' +
    '<p>Draw cards <b>stack</b> and pass on, growing as they go; at ' + R.CHAIN_CAP + ' the ' +
      'chain shuts and whoever is holding it takes the lot.</p>' +
    '<p>Down to one card you shout <b>' + esc(R.CALL) + '</b>. Stay quiet until the next ' +
      'player has finished and anybody may shout <b>' + esc(R.CATCH) + '</b> — and you take ' +
      R.PENALTY + '.</p>';
}

/* ═══════════════════════════════════════════════════════════════════
   10. ONLINE
   ───────────────────────────────────────────────────────────────────
   Two halves, and js/mp.js owns both ends of them.

   THE LOBBY HALF is window.KARTI_SKARTA.lobby: how many chairs, what
   the machine is called, what the rules are, and how a table is
   started. It is read before a single card exists, to paint a room
   list, and IL-KIRI's is the reference — this is the same object with
   SKARTA's numbers in it.

   THE TRANSPORT HALF is KARTI_PARTY.online.skarta: start a table the
   room has already agreed the terms of, take a packet, say a line, and
   stop. Tombla's is the model, because tombla is the other one that
   seats more than two.

   THE THREE THINGS THAT MAKE THIS SAFE, all of which the engine was
   already built for:

   1. NOTHING BUT MOVES CROSSES. The deal is (seed, seat list) and
      every phone builds it for itself; the relay carries {a,i,j,s,n,k}
      and never a card. A client is never SENT the state, so there is
      no snapshot on the wire to read a hand out of. What this phone
      draws on screen is E.view(S, mySeat) and always was — see
      render() — which is the same redaction the engine asserts.
   2. A PACKET GOES THROUGH THE DOOR A TAP GOES THROUGH. remote() ends
      in E.apply(), the same call onCard() makes, so an out-of-turn
      play or a card that is not in that seat's hand is REFUSED and
      said out loud rather than absorbed. Nothing else in this file can
      change the state.
   3. THE SEAT IS THE RELAY'S, NEVER THE SENDER'S. The move on the
      wire carries no seat at all — it is stripped on the way out —
      and remote() is told which chair it came from by js/mp.js, which
      got it from the Pi. A phone cannot play as somebody else because
      it has nowhere to say that it is.
   ═══════════════════════════════════════════════════════════════════ */

/* ── the codec ────────────────────────────────────────────────────
   The relay's table payload is five bounded fields and one short name:
   {a, i, j, s, n, k[]}, every number 0..255. A SKARTA move is not that
   shape — it names a card by uid ('c73') and a suit by key ('bajtra')
   — so it is translated HERE, in the game, rather than in js/mp.js,
   which is what `lobby.wire` is for and what the comment over
   WIRE_FIELDS in that file asks for.

   The uid is the only interesting one and it is free: buildDeck()
   numbers the deck positionally, so 'c73' is the same card on every
   phone that has ever built it, and the integer 73 is the whole of it.
   Nothing is hashed and nothing is looked up. */
const WIRE_FIELDS = ['c', 'p', 'n', 'j'];

function encMove(m) {
  if (!m || typeof m.t !== 'string') return null;
  const w = { t: m.t };
  if (m.t === 'play') {
    if (typeof m.uid !== 'string' || m.uid[0] !== 'c') return null;
    const c = parseInt(m.uid.slice(1), 10);
    if (!(c >= 0 && c <= 255)) return null;
    w.c = c;
    if (m.suit) {
      const p = E.SUIT_KEYS.indexOf(m.suit);
      if (p < 0) return null;
      w.p = p;
    }
    if (m.charge) w.n = m.charge | 0;
  } else if (m.t === 'catch') {
    w.j = m.target | 0;
  }
  return w;
}

function decMove(w) {
  if (!w || typeof w.t !== 'string') return null;
  switch (w.t) {
    case 'draw': case 'take': case 'pass': case 'call':
      return { t: w.t };
    case 'play': {
      const c = w.c | 0;
      if (!(c >= 0 && c < 108)) return null;
      const m = { t: 'play', uid: 'c' + c };
      if (w.p !== undefined) {
        const s = E.SUIT_KEYS[w.p | 0];
        if (!s) return null;
        m.suit = s;
      }
      if (w.n !== undefined) m.charge = w.n | 0;
      return m;
    }
    case 'catch': {
      const j = w.j | 0;
      if (!(j >= 0 && j < E.RULES.MAX_SEATS)) return null;
      return { t: 'catch', target: j };
    }
    default: return null;                     /* a name we do not make */
  }
}

/* ── the room's chairs, and ours ──────────────────────────────────
   A room is opened at the game's MAXIMUM so it reads as a table
   filling up, and people sit in it from chair 0 up — but machines are
   put in chairs the host picked, so the chairs that are actually
   playing are not necessarily 0..n-1. The relay stamps a move with the
   ROOM chair; the engine deals n hands numbered 0..n-1. Two numbering
   systems, so there is a map, built once at start from the seat list
   the lobby hands us and never guessed at afterwards. */
let NET = null;      /* {send, seat, seats, host, onLeave, toGame[], toRoom[]} */

function onlineStart(cfg) {
  cfg = cfg || {};
  const chairs = (cfg.seats || []).filter(Boolean);
  if (chairs.length < E.RULES.MIN_SEATS) throw new Error('SKARTA: not enough chairs');
  if (chairs.length > E.RULES.MAX_SEATS) throw new Error('SKARTA: too many chairs');

  const toGame = {}, toRoom = [];
  chairs.forEach((s, g) => {
    const room = (typeof s.seat === 'number') ? s.seat : g;
    toGame[room] = g;
    toRoom[g] = room;
  });
  const mySeat = (toGame[cfg.you] !== undefined) ? toGame[cfg.you] : 0;
  /* THE HOST DRIVES THE MACHINES. Chair 0 is the host at the relay and
     js/mp.js passes it as `host`; every phone works out the same answer
     from the same two numbers. See iDrive(). */
  const iAmHost = (cfg.you === (cfg.host | 0));

  /* Owners are IDENTICAL on every phone — a machine is 'ai' everywhere,
     not 'ai' on the host and 'net' on the rest. That is deliberate: the
     owner is what the table LABEL is read off and what openCalls() uses
     to decide who needs a beat to shout, so if it differed between
     phones the same table would look and behave two different ways. Who
     THINKS is a separate question and iDrive() answers it. */
  const list = chairs.map((s, g) => ({
    name: String(s.name || ('Player ' + (g + 1))).slice(0, 14),
    owner: g === mySeat ? 'me' : (s.kind === 'cpu' ? 'ai' : 'net'),
    level: s.level || 3,
  }));

  teardown();
  const S = E.newGame({ seed: cfg.seed >>> 0, seats: list });
  openTable(S, { humans: 1, seats: list.length, seat: mySeat, net: true });

  NET = Object.assign({}, cfg.net, {
    host: iAmHost, toGame, toRoom,
    room: (cfg.net && typeof cfg.net.seat === 'number') ? cfg.net.seat : cfg.you,
  });
  G.net = NET;
  tick();
  return E.snapshot(S);      /* for a caller that wants to post it; never sent */
}

/* A move from another chair. `seat` is the RELAY's stamp and the packet
   carries no seat of its own, so there is nothing here to spoof. */
function onlineRemote(seat, wire) {
  if (!G || G.dead || !NET) return { ok: false, why: 'no skarta on the table' };
  const g = NET.toGame[seat];
  if (g === undefined) return { ok: false, why: 'a move from a chair that is not at this table' };
  const mv = decMove(wire);
  if (!mv) return { ok: false, why: 'a move this table does not know how to make' };
  const r = E.apply(G.S, g, mv, 'net');
  if (!r.ok) {
    /* REFUSED, NOT ABSORBED. The engine has not touched the state, and
       the reason is the engine's own — put into words js/mp.js can show
       somebody without a code in it. */
    return { ok: false, why: refusal(r.err, mv, g) };
  }
  render();
  if (G.S.over) { showResult(); return null; }
  tick();
  return null;
}

/* the engine's error ids, said out loud. A player is told what happened,
   never 'not-your-turn'. */
const REFUSE = {
  'no-move':      'an empty move',
  'no-seat':      'a move for a chair that is not at this table',
  'unknown-move': 'a move this game does not have',
  'not-turn':     'a move out of turn',
  'not-yours':    'a card that is not in their hand',
  'no-card':      'a card that is not in their hand',
  'illegal':      'a card that does not match the suit or the number',
  'bad-suit':     'a suit that is not one of the four',
  'bad-charge':   'a Kaxxa charged at something that is not on the card',
  'chain-open':   'a draw when there is a chain on the table',
  'no-chain':     'taking a chain that is not there',
  'no-pending':   'playing on when there is nothing in the air',
  'over':         'a move after the game had already finished',
  'nothing-to-call': 'shouting ' + E.RULES.CALL + ' without one card',
  'no-catch':     'shouting ' + E.RULES.CATCH + ' at somebody who is not open',
};
function refusal(err, mv, g) {
  const who = (G && G.S.players[g]) ? G.S.players[g].name : 'that chair';
  return (REFUSE[err] || ('a move the rules refused (' + String(err || 'refused') + ')')) +
         ' from ' + who;
}

function onlineNote(text, tone) {
  if (G && G.ctx) P.ui.setNet(G.ctx, text || '', tone || '');
}

function onlineStop(why, tone) {
  if (!G || G.dead) return;
  const ctx = G.ctx;
  clearTimeout(G.t); clearTimeout(G.catchT);
  G.t = G.catchT = null;
  P.ui.setNet(ctx, '', '');
  P.ui.result(ctx, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? 'No deal' : 'Cut off',
    why: why || 'The table stopped.',
    quip: 'Nothing was recorded. Nobody loses a hand over a dropped connection.',
    buttons: [{ label: 'Back to the rooms', icon: 'back', cls: 'primary',
                go: () => { const n = NET; teardown();
                            if (n && n.onLeave) n.onLeave(); else P.hub(); } }],
  });
}

/* ── what js/mp.js drives the wire with ───────────────────────────
   Read off the shelf BEFORE start() is called, so it is a static object
   over module state rather than something start() builds. */
const HOOKS = {
  live:      () => !!(G && !G.dead && !G.S.over),
  phase:     () => (!G || G.dead) ? 'idle' : (G.S.over ? 'over' : 'play'),
  seed:      () => (G ? G.S.seed : null),
  gameId:    () => (G ? G.S.gid : null),
  turn:      () => (G && NET) ? (NET.toRoom[G.S.turn] != null ? NET.toRoom[G.S.turn] : -1) : -1,
  over:      () => (G ? G.S.over : null),
  moveCount: () => (G ? G.S.moves.length : 0),
  /* the agreement check. Two phones that have applied the same moves in
     the same order from the same seed print the same five characters. */
  check:     () => (G ? E.checksum(G.S) : ''),
  /* NEVER snapshot() over the wire — see the header. This is the one
     shape a client may be handed, and the engine asserts what it strips. */
  view:      seat => (G && NET && NET.toGame[seat] !== undefined)
                       ? E.view(G.S, NET.toGame[seat]) : null,
  /* every move this phone applied, in the relay's shape, with the ROOM
     chair on it and where it came from. js/mp.js forwards the ones that
     were made here and drops the ones it delivered itself. */
  onMove: fn => E.onMove((rec, info) => {
    if (!G || G.dead || !NET) return;
    const w = encMove(rec);
    if (!w) return;
    const room = NET.toRoom[info.seat];
    fn(w, { seat: (room == null ? info.seat : room), src: info.src });
  }),
  apply: (seat, wire) => onlineRemote(seat, wire),
  /* a seat gone FOR GOOD (deliberate leave, or the relay freeing a
     dropped chair): mark it and let goneStep() play it out — the same
     deterministic draw-and-say-nothing on every phone, so the turn can
     never park on an empty chair. */
  seatGone: room => {
    if (!G || G.dead || !NET || G.S.over) return;
    const g = NET.toGame[room];
    if (g === undefined || !G.S.players[g] || E.isAI(G.S.players[g])) return;
    NET.gone = NET.gone || {};
    if (NET.gone[g]) return;
    NET.gone[g] = 1;
    clearTimeout(G.t);
    tick();
  },
  /* THE 1v1 WALK-OUT IS A WIN. goneStep()'s ghost-plays-on answer is right
     for a big table and absurd for two: the leave sheet promised the
     leaver that the stayer takes it, not that a ghost keeps discarding at
     them. js/mp.js calls this only when the match BEGAN with exactly two
     seats and the OTHER chair left for good (held drops never come here),
     with the pot already settled there (idempotent; a friendly table moves
     nothing) — it rides in as `pot` for showResult() to paint. S.over is
     laid down exactly the way the engine's own finish() builds it, and
     showResult() then runs the ordinary ceremony: the same podium, one
     id-guarded award under S.gid. The S.over gate above me makes a second
     call a no-op. */
  soleWin: (room, pot) => {
    if (!G || G.dead || !NET || G.S.over) return;
    const S = G.S;
    const g = NET.toGame[room];
    if (g === undefined || !S.players[g]) return;
    clearTimeout(G.t); G.t = null;
    NET.gone = NET.gone || {};
    NET.gone[g] = 1;
    S.over = {
      winner: G.mySeat,
      scores: S.players.map(p => ({
        id: p.id, name: p.name, cards: p.hand.length,
        points: p.hand.reduce((n, c) => n + E.cardPoints(c), 0),
      })),
    };
    G.solePot = pot || null;
    render();
    showResult();
  },
};

P.online = P.online || {};
P.online.skarta = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  live: () => HOOKS.live(),
  hooks: HOOKS,
};

/* ── the lobby contract ───────────────────────────────────────────
   IL-KIRI's shape, SKARTA's numbers. js/mp.js reads it off
   window.KARTI_SKARTA.lobby and off the hub tile, and never guesses. */
const LOBBY = {
  id: 'skarta',
  name: 'SKARTA',
  mt: 'Skarta kollox',

  /* SEATS. Two to ten, and the ten is arithmetic rather than taste:
     108 cards, ' + HAND + ' each and one turned up, so the stock after
     an eleventh hand stops being able to pay for the game. Both numbers
     are E.RULES', so this can never drift away from what deals. */
  minSeats: E.RULES.MIN_SEATS,
  maxSeats: E.RULES.MAX_SEATS,

  /* the machine, by name, from the setup sheet above — one array, two
     screens, so the room list and the offline table agree */
  levels: LV.map(L => ({ level: L.k, name: L.n, note: L.note })),
  defaultLevel: 3,

  isReady: seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu')
    ? Object.assign({}, seat, { ready: true }) : seat,

  canStart(seatList) {
    const n = (seatList || []).length;
    if (n < E.RULES.MIN_SEATS)
      return { ok: false, why: 'There is nobody to skarta onto yet.' };
    if (n > E.RULES.MAX_SEATS)
      return { ok: false, why: 'Ten is as many hands as 108 cards will pay for.' };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready)
      return { ok: false, why: unready + (unready > 1 ? ' people are' : ' person is') +
                               ' not ready yet.' };
    return { ok: true, why: '' };
  },

  rulesHTML: rulesPanel,
  blurb: 'Get rid of your hand before the rest of the table gets rid of theirs. Matching ' +
         'suits, matching numbers, and a Kaxxa Infernali that ruins somebody\'s evening.',

  /* the offline twin, from a seat list rather than the setup sheet */
  start(seats, opts) {
    const list = (seats || []).slice(0, E.RULES.MAX_SEATS);
    const level = (list.map(s => s && s.level).find(v => v)) || 3;
    return start({
      seats: Math.max(E.RULES.MIN_SEATS, list.length),
      level,
      kinds: list.map(s => (s && s.kind === 'cpu') ? 'ai' : 'you'),
      sort: ST.pref.sort,
    });
  },

  myName() {
    try {
      const n = K.displayName && K.displayName();
      if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
        return String(n).trim().slice(0, 14);
    } catch (e) {}
    return 'You';
  },

  wire: { fields: WIRE_FIELDS },

  /* NO TAKEBACK, AND IT IS A RULE RATHER THAN AN OMISSION.
     Three reasons, in order of weight:

     1. IT CANNOT BE UNSEEN. E.rollbackTo() puts the CARDS back
        perfectly — it re-deals from the seed and replays the log, so
        the state is exact. It cannot put back what the other nine
        people saw. A player who lays the wrong card and takes it back
        has shown the table a card out of their hand and been given
        another go with it. That is worse than the misclick.
     2. UNANIMITY DOES NOT SCALE. P.ui.takeback needs every other
        player to agree inside thirty seconds. At two that is a
        courtesy; at seven it is a thirty-second freeze ending in
        "nobody answered".
     3. THE ONE IRREVERSIBLE TAP ALREADY HAS ITS OWN UNDO, and it is
        instant and private: a drawn card is held in S.pending until
        you say play-or-keep, so the tap that costs you the game is
        already a two-step. So is LAST ONE, which can be armed before
        the card lands.

     A card laid is a card played. That is the game in every każin in
     Malta and it is the game here. */
  takeback: false,
};

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
  /* the tile carries the lobby contract too, so js/mp.js can read the seat
     range, the machine's names and the short rules straight off the shelf
     without knowing this file exists — the same way IL-KIRI's does */
  seats: { min: E.RULES.MIN_SEATS, max: E.RULES.MAX_SEATS },
  levels: LOBBY.levels,
  rulesHTML: rulesPanel,
  start: (seatList, o) => LOBBY.start(seatList, o),
});

/* the entry point the hub tile and anything else needs */
window.KARTI_SKARTA = {
  open: menu, close: () => { teardown(); P.hub(); },
  engine: E, cardHTML, backHTML, injectCSS,
  lobby: LOBBY,
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

/* ═══════════════════════════════════════════════════════════════════
   SKARTA — THE KIT SHELF (purely cosmetic, always)
   The table-edge trims only. The felts and card backs that used to be
   declared here were retired when the ONE shared deck arrived — every
   card game now wears the same back and felt, registered under game
   'karti' in js/deck-kit.js (which restates each design in SKARTA's
   own CSS terms, and migrated anything a player owned or wore from
   this shelf). The trims stay: an edge is furniture, not the deck.
   Unequipping empties the sheet and the stock look is simply what is
   underneath. The style node is re-appended on every change so it
   always lands after the game's own sheet.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* e the felt border, r a 1px inset ring just inside it */
var TRIMS = {
  'skarta.trim.deheb': { e:'rgba(255,197,66,.5)',  r:'rgba(255,197,66,.28)' },
  'skarta.trim.fidda': { e:'rgba(214,222,236,.5)', r:'rgba(214,222,236,.22)' },
  'skarta.trim.ram':   { e:'rgba(232,140,120,.55)', r:'rgba(232,140,120,.25)' }
};

function sheet(){
  var st = document.getElementById('skx-kit-css');
  if (!st){ st = document.createElement('style'); st.id = 'skx-kit-css'; }
  /* appendChild MOVES an existing node to the end, so this sheet is
     always later than sk-runtime-css and equal rules would win — and
     the #app prefix out-specifies them anyway. */
  document.head.appendChild(st);
  return st;
}

function apply(){
  var XP = window.KARTI_XP;
  if (!XP) return;
  var css = '';
  var t = TRIMS[XP.equipped('trim', 'skarta') || ''];
  if (t) css += '#app #scr-party .sk-wrap .sk-felt{border-color:' + t.e +
    ';box-shadow:inset 0 0 0 1px ' + t.r + '}';
  sheet().textContent = css;
}

/* ── preview: the trim as the edge itself, on the stock felt ─────── */
var STOCK_FELT = 'radial-gradient(120% 90% at 50% 30%,#20323A 0%,#101A20 72%,#0B1216 100%)';

function trimPv(t){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style', 'display:flex;align-items:center;justify-content:center;' +
      'width:' + s + 'px;height:' + s + 'px');
    el.innerHTML = '<span style="display:block;width:' + s + 'px;height:' +
      Math.round(s * .7) + 'px;border-radius:10px;box-sizing:border-box;' +
      'border:2px solid ' + t.e + ';box-shadow:inset 0 0 0 2px ' + t.r + ';' +
      'background:' + STOCK_FELT + '"></span>';
    return el;
  };
}

function boot(tries){
  var XP = window.KARTI_XP;
  if (!XP){ if (tries < 40) setTimeout(function(){ boot(tries + 1); }, 500); return; }
  var KIT = XP.forGame('skarta');
  KIT.register([
    { slot:'trim', id:'skarta.trim.deheb', level:15, name:'Xifer tad-Deheb',
      blurb:'A quiet gold line around the felt. The table dressed for the festa.', preview:trimPv(TRIMS['skarta.trim.deheb']) },
    { slot:'trim', id:'skarta.trim.fidda', level:27, name:'Xifer tal-Fidda',
      blurb:'Silver edge. The good cutlery of table edges.', preview:trimPv(TRIMS['skarta.trim.fidda']) },
    { slot:'trim', id:'skarta.trim.ram',   level:46, name:'Ram Aħmar',
      blurb:'A copper ring, polished by forty years of elbows.', preview:trimPv(TRIMS['skarta.trim.ram']) }
  ]);
  KIT.onChange(apply);
  apply();
}
boot(0);

})();
