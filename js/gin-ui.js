/* ═══════════════════════════════════════════════════════════════════
   KARTI — gin-ui.js
   GIN RUMMY — the table, the thumbs, and the wire.

   js/gin.js holds the rules and holds no DOM; this file holds
   everything else: the tile on the Party Games shelf, the setup
   sheet, the felt, the drag-to-arrange hand, the machine's clock,
   the autosave, and the online controller js/mp.js drives.

   HOUSE RULES THIS FILE OBEYS
     · index.html gets ONE loader line for each of the two gin files
       and nothing else. No <section> is added: we borrow
       js/party.js's #scr-party screen exactly the way js/klabb.js
       does, so Escape, the back arrow and the "another screen took
       over" watcher all keep working without being written twice.
     · js/party.js, js/klabb.js, js/mp.js are READ, never edited.
       Registration is done entirely through their public faces:
       KARTI_PARTY.register() for the tile, KARTI_PARTY.online.gin
       for the transport, and — because js/mp.js exports its GAMES /
       GAME_KEYS / SEATS_FALLBACK structures live — the lobby learns
       the word "gin" by us appending to those, not by anybody
       editing mp.js.
     · the card faces are js/klabb.js's own SVG deck (KARTI_KLABB
       .deck), so a seven of hearts here is the same seven of hearts
       it is at the bixkla table. The handful of CSS rules those
       faces need are re-declared here under our own scope, because
       klabb only injects its stylesheet when a klabb game opens.
     · persistence lives in karti_gin_v1 and nowhere else.
     · sounds are asked of js/sfx.js by id; audio/ is never touched.

   THE INTERACTION, WHICH IS THE POINT
     · the hand is YOURS. Drag a card and the others step aside; the
       order you leave is kept, across turns, across a reload,
       across the app being killed in the background. Nothing ever
       re-sorts it behind your back — SORT is a button, and pressing
       it is the only thing that sorts.
     · dragging is Pointer Events + setPointerCapture, with
       touch-action:none on the cards themselves, which is what stops
       iOS Safari deciding mid-drag that you meant to scroll. The
       felt screen has no scroller of its own, so there is nothing
       above the hand to steal the gesture either.
     · a small move is a tap (DRAG_SLOP, same trick as js/skarta-ui),
       so picking a card to throw never accidentally rearranges.
     · the stock and the pile are two fat buttons side by side —
       blind card on the left, the face-up discard on the right —
       and your deadwood is counted live under the hand as you look.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function () {

const K = window.KARTI;
const P = window.KARTI_PARTY;
const GINNS = window.KARTI_GIN;
if (!K || !P || !GINNS || !GINNS.E) return;
const E = GINNS.E;
const DK = (window.KARTI_KLABB && window.KARTI_KLABB.deck) || null;

const esc = K.esc || (s => String(s == null ? '' : s));
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');
const SFX = () => window.KARTI_SFX || null;
function cue(id, opts) { const S = SFX(); if (S) { try { S.play(id, opts); } catch (e) {} } }
function cueRun(id, n, gap, opts) { const S = SFX(); if (S) { try { S.run(id, n, gap, opts); } catch (e) {} } }

/* ── our corner of localStorage ──────────────────────────────────── */
const STORE = 'karti_gin_v1';
let ST = { v: 1, pref: {}, save: null, netArr: null };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object') {
    ST.pref = (j.pref && typeof j.pref === 'object') ? j.pref : {};
    ST.save = (j.save && typeof j.save === 'object') ? j.save : null;
    ST.netArr = (j.netArr && typeof j.netArr === 'object') ? j.netArr : null;
  }
} catch (e) {}
let persistPending = 0;
function persist() {
  if (persistPending) return;
  persistPending = setTimeout(() => {
    persistPending = 0;
    try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch (e) {}
  }, 0);
}
/* iOS swipes the app away between the move and the setTimeout; flush. */
function persistNow() {
  if (!persistPending) return;
  clearTimeout(persistPending);
  persistPending = 0;
  try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persistNow(); });
window.addEventListener('pagehide', persistNow);

/* ── the machine, by name — the same three chairs the każin keeps ── */
const LEVELS = [
  { k: 1, n: 'Iż-żiju',   d: 'Knocks the moment he can. Tells you it is skill.', i: 'diff-1' },
  { k: 2, n: 'Tal-każin', d: 'Draws with a plan and throws what costs least.',   i: 'diff-2' },
  { k: 3, n: 'In-nannu',  d: 'Watches every card you take. Sits on gin. Waits.', i: 'diff-3' }
];
const levelName = k => (LEVELS.find(l => l.k === k) || LEVELS[1]).n;

const RULES = [
  '<b>Ten cards each.</b> Melds are three or four of a rank, or runs of three or more in one suit.',
  'On your turn <b>take the top discard or draw blind</b> from the stock, then throw one card back. You may not throw back the discard you just took.',
  'Loose cards are <b>deadwood</b> — ace 1, pips face value, tens and courts 10. At <b>10 or less</b> you may <b>KNOCK</b>: throw your last card and show your hand.',
  '<b>GIN</b> — every card melded — pays <b>25 extra</b> and nothing may be laid off against it.',
  'After a knock the other hand <b>lays off</b> what fits on your melds. If they finish with <b>the same or less</b> deadwood, that is an <b>UNDERCUT</b>: they take the difference plus 25, and you will hear about it for a week.',
  'First to <b>100</b>. The winner adds a <b>100 game bonus</b> and both sides add <b>25 a hand won</b>. Lose without winning a single hand and the lot is <b>doubled</b>.',
  'Two cards left in the stock and nobody has knocked? The hand is <b>dead</b> — no score, same dealer deals again.'
];

/* ═══════════════════════════════════════════════════════════════════
   CARD DRAWING — klabb's deck, our buttons
   ═══════════════════════════════════════════════════════════════════ */
function faceHTML(c) { return DK ? DK.cardFace(c) : ('<span class="gn-flat">' + esc(txtOf(c)) + '</span>'); }
function backHTML() { return DK ? DK.cardBack() : '<span class="gn-flat">▮</span>'; }
function nameOfCard(c) { return DK ? DK.nameOf(c) : txtOf(c); }
function txtOf(c) {
  const R = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  return R[E.rankOf(c)] + 'SHDC'[E.suitOf(c)];
}

/* ── the shelf mark: one upright card, knuckles rapping it ───────── */
function rr(x, y, w, h, r) {
  const n = v => Math.round(v * 100) / 100;
  return 'M' + n(x + r) + ' ' + n(y) + 'H' + n(x + w - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + n(x + w) + ' ' + n(y + r) +
    'V' + n(y + h - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + n(x + w - r) + ' ' + n(y + h) +
    'H' + n(x + r) + 'A' + r + ' ' + r + ' 0 0 1 ' + n(x) + ' ' + n(y + h - r) +
    'V' + n(y + r) + 'A' + r + ' ' + r + ' 0 0 1 ' + n(x + r) + ' ' + n(y) + 'Z';
}
function cardFrame(x, y, w, h, t) {
  return '<path fill-rule="evenodd" d="' + rr(x, y, w, h, 1.5) +
    rr(x + t, y + t, w - 2 * t, h - 2 * t, 0.8) + '"/>';
}
function injectDefs() {
  if (document.getElementById('gn-defs')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', 'gn-defs');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  /* two cards squared off a little apart — the knock — and three short
     rap-lines where the knuckle lands. Silhouette-first, like the
     other card tiles, so it reads at thirty pixels. */
  svg.innerHTML =
    '<symbol id="gn-t-gin" viewBox="0 0 24 24">' +
    '<g transform="rotate(-14 9 14)">' + cardFrame(4.6, 6.2, 8.8, 14, 1.05) + '</g>' +
    cardFrame(9.6, 5.2, 9.4, 15.2, 1.1) +
    '<use href="#kb-p-C" xlink:href="#kb-p-C" x="11.6" y="10.1" width="5.4" height="5.4"/>' +
    '<path d="M19.2 2.2l2.2 1.5-1 1.4-2.2-1.5zM21.4 5.8l2 .9-.6 1.5-2.1-.9zM16.6 1l1 2.2-1.5.7-1-2.3z"/>' +
    '</symbol>';
  document.body.appendChild(svg);
}
if (document.body) injectDefs();
else document.addEventListener('DOMContentLoaded', injectDefs);

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party .gn-*
   Nothing here puts transform/filter on an ancestor of .tabbar; the
   only transforms are on the little cards themselves.
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS() {
  if (document.getElementById('gn-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'gn-runtime-css';
  st.textContent =
    '#scr-party .gn-felt{--gn-felt:#1A2E4A;--gn-felt2:#101F33;flex:1;min-height:0;width:100%;' +
      'display:flex;flex-direction:column;gap:5px;padding:8px 7px 6px;border-radius:16px;position:relative;' +
      'background:radial-gradient(120% 85% at 50% 8%,#274468 0%,var(--gn-felt) 45%,var(--gn-felt2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.07),' +
      'inset 0 -18px 34px rgba(0,0,0,.42);overscroll-behavior:none}' +

    /* klabb's card faces, restated under our scope (klabb only injects
       its sheet when a klabb table opens) */
    '#scr-party .gn-felt .kb-svg{width:100%;height:100%;display:block;border-radius:6px;overflow:hidden;' +
      'font-family:var(--body),-apple-system,"Segoe UI",Roboto,Arial,sans-serif}' +
    '#scr-party .gn-felt .kb-stock{fill:#FCF7EA;stroke:rgba(0,0,0,.34);stroke-width:1.1}' +
    '#scr-party .gn-felt .kb-svg.kb-r{fill:#C7192B;color:#C7192B}' +
    '#scr-party .gn-felt .kb-svg.kb-b{fill:#17131B;color:#17131B}' +
    '#scr-party .gn-felt .kb-idx text{font-weight:800;font-size:25px;letter-spacing:-.02em;' +
      'fill:currentColor;stroke:none}' +
    '#scr-party .gn-felt .kb-panel{fill:#F4E7C6;stroke:currentColor;stroke-width:1.5}' +
    '#scr-party .gn-felt .kb-ink{fill:currentColor;stroke:none}' +
    '#scr-party .gn-felt .kb-face{fill:#FCF7EA;stroke:currentColor;stroke-width:1.5}' +
    '#scr-party .gn-felt .kb-hair{stroke:currentColor;stroke-width:1.1;opacity:.55;fill:none}' +

    /* ── the other chair ── */
    '#scr-party .gn-top{flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:8px;' +
      'min-height:40px;flex-wrap:wrap}' +
    '#scr-party .gn-nm{font:900 10px/1.2 var(--disp);letter-spacing:.09em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.72);padding:4px 9px;border-radius:999px;background:rgba(0,0,0,.28);' +
      'border:1px solid rgba(255,255,255,.09);max-width:38%;overflow:hidden;text-overflow:ellipsis;' +
      'white-space:nowrap}' +
    '#scr-party .gn-nm.turn{color:#241800;background:var(--gold);border-color:#FFE9B0}' +
    '#scr-party .gn-backs{display:flex;align-items:center}' +
    '#scr-party .gn-backs .gn-b{width:22px;height:31px;margin-left:-12px;border-radius:4px;' +
      'box-shadow:0 1px 3px rgba(0,0,0,.5);line-height:0}' +
    '#scr-party .gn-backs .gn-b:first-child{margin-left:0}' +
    '#scr-party .gn-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;' +
      'background:rgba(0,0,0,.34);border:1px solid rgba(255,255,255,.12);font:900 9.5px/1 var(--disp);' +
      'letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.78);white-space:nowrap}' +
    '#scr-party .gn-chip b{color:var(--gold);font:inherit}' +
    '#scr-party .gn-chip.hot b{color:#FF8A9B}' +

    /* ── the two piles: the whole middle of the game ── */
    '#scr-party .gn-mid{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:7px}' +
    '#scr-party .gn-piles{display:flex;align-items:flex-end;justify-content:center;gap:22px}' +
    '#scr-party .gn-pilebox{display:flex;flex-direction:column;align-items:center;gap:4px}' +
    '#scr-party .gn-pilelbl{font:900 8.5px/1 var(--disp);letter-spacing:.14em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.45)}' +
    /* sized against the viewport HEIGHT so a phone held sideways gets
       piles that fit instead of piles that sit on top of the hand */
    '#scr-party .gn-pilebtn{position:relative;display:block;width:min(74px,13vh);height:min(104px,18.2vh);' +
      'padding:0;border:0;' +
      'border-radius:8px;background:none;line-height:0;cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent;box-shadow:0 3px 6px rgba(0,0,0,.5),0 8px 18px rgba(0,0,0,.35);' +
      'transition:box-shadow .15s var(--ease),opacity .15s}' +
    '#scr-party .gn-pilebtn.can{box-shadow:0 0 0 2.5px rgba(61,220,132,.85),0 6px 14px rgba(0,0,0,.45)}' +
    '#scr-party .gn-pilebtn.drop{box-shadow:0 0 0 3px var(--gold),0 6px 16px rgba(0,0,0,.5)}' +
    '#scr-party .gn-pilebtn.dim{opacity:.45;cursor:default}' +
    '#scr-party .gn-pilebtn .gn-count{position:absolute;right:-7px;top:-7px;z-index:2;min-width:22px;height:22px;' +
      'padding:0 5px;border-radius:999px;display:grid;place-items:center;font:900 10px/1 var(--disp);' +
      'color:#241800;background:var(--gold);border:1px solid #FFE9B0;line-height:22px}' +
    '#scr-party .gn-empty{width:100%;height:100%;border-radius:8px;border:2px dashed rgba(255,255,255,.22);' +
      'display:grid;place-items:center;color:rgba(255,255,255,.3);font:900 9px/1.3 var(--disp);' +
      'letter-spacing:.1em;text-transform:uppercase}' +

    '#scr-party .gn-say{font:700 11.5px/1.5 var(--body);color:rgba(255,255,255,.85);text-align:center;' +
      'padding:0 10px;max-width:340px;min-height:17px}' +
    '#scr-party .gn-say b{color:var(--gold);font-weight:900}' +
    '#scr-party .gn-acts{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;min-height:0}' +
    '#scr-party .gn-act{min-height:44px;padding:0 16px;border-radius:12px;font:900 11px/1 var(--disp);' +
      'letter-spacing:.08em;text-transform:uppercase;color:#241800;' +
      'background:linear-gradient(180deg,#FFD979,var(--gold));border:1px solid #FFE9B0;' +
      'box-shadow:0 3px 0 -1px rgba(0,0,0,.4);cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .gn-act.ghost{color:var(--txt);background:rgba(255,255,255,.08);' +
      'border-color:rgba(255,255,255,.2);box-shadow:none}' +
    '#scr-party .gn-act.hot{color:#2A0700;background:linear-gradient(180deg,#FF7154,var(--hot));' +
      'border-color:#FFA894}' +
    '#scr-party .gn-act[disabled]{opacity:.4;cursor:default}' +
    '#scr-party .gn-act:not([disabled]):active{transform:translateY(2px);box-shadow:none}' +

    /* ── my side: the dashboard and the hand ── */
    '#scr-party .gn-me{flex:0 0 auto;display:flex;flex-direction:column;gap:4px}' +
    '#scr-party .gn-dash{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;' +
      'min-height:26px}' +
    '#scr-party .gn-sortbtn,#scr-party .gn-nudge{min-height:26px;padding:0 10px;border-radius:999px;' +
      'font:900 9.5px/1 var(--disp);letter-spacing:.09em;text-transform:uppercase;color:var(--txt);' +
      'background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .gn-nudge{min-width:34px;font-size:12px}' +
    '#scr-party .gn-nudge[disabled]{opacity:.35}' +

    /* THE HAND. position:relative rail, absolutely placed cards, and
       touch-action:none on each card — that line is the iOS fix: the
       browser is told the gesture is ours before it starts, so the
       page never scrolls out from under a drag. */
    '#scr-party .gn-hand{position:relative;width:100%;flex:0 0 auto;' +
      '-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}' +
    '#scr-party .gn-card{position:absolute;bottom:2px;padding:0;border:0;background:none;line-height:0;' +
      'border-radius:6px;cursor:grab;touch-action:none;-webkit-tap-highlight-color:transparent;' +
      '-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;' +
      'box-shadow:0 2px 4px rgba(0,0,0,.5),0 6px 14px rgba(0,0,0,.35);' +
      'transition:left .16s var(--ease),transform .16s var(--ease),box-shadow .16s var(--ease)}' +
    '#scr-party .gn-card .kb-svg{pointer-events:none}' +
    '#scr-party .gn-card.sel{transform:translateY(-16px);' +
      'box-shadow:0 0 0 3px var(--gold),0 10px 20px rgba(0,0,0,.5)}' +
    '#scr-party .gn-card.drag{transition:none;z-index:30;cursor:grabbing;' +
      'box-shadow:0 0 0 2px rgba(255,255,255,.5),0 14px 28px rgba(0,0,0,.6)}' +
    '#scr-party .gn-card.fresh{box-shadow:0 0 0 2.5px rgba(61,220,132,.9),0 8px 16px rgba(0,0,0,.5)}' +
    /* meld ribbons: same meld, same colour, wherever the cards sit */
    '#scr-party .gn-card .gn-rib{position:absolute;left:8%;right:8%;bottom:3px;height:4px;border-radius:2px;' +
      'display:none;pointer-events:none}' +
    '#scr-party .gn-card.m0 .gn-rib{display:block;background:#FFC542}' +
    '#scr-party .gn-card.m1 .gn-rib{display:block;background:#3DDC84}' +
    '#scr-party .gn-card.m2 .gn-rib{display:block;background:#8A5CFF}' +
    '#scr-party .gn-card.m3 .gn-rib{display:block;background:#FF5468}' +
    /* deadwood price tag on loose cards */
    '#scr-party .gn-card .gn-dwtag{position:absolute;right:2px;top:2px;min-width:15px;height:15px;' +
      'border-radius:999px;display:none;place-items:center;font:900 9px/15px var(--disp);text-align:center;' +
      'color:#FFD98A;background:rgba(20,10,30,.85);border:1px solid rgba(255,197,66,.5);pointer-events:none}' +
    '#scr-party .gn-card.loose .gn-dwtag{display:grid}' +

    /* the hand-end verdict, laid over the felt */
    '#scr-party .gn-verdict{position:absolute;inset:0;z-index:14;display:flex;align-items:center;' +
      'justify-content:center;padding:18px;border-radius:16px;background:rgba(8,5,15,.82)}' +
    '#scr-party .gn-vcard{width:100%;max-width:310px;padding:18px 16px 14px;border-radius:18px;' +
      'text-align:center;background:linear-gradient(180deg,var(--panel2),var(--panel));' +
      'border:1px solid var(--line2);box-shadow:0 16px 40px rgba(0,0,0,.6)}' +
    '#scr-party .gn-vcard h4{font:900 16px/1.25 var(--disp);letter-spacing:.06em;text-transform:uppercase;' +
      'margin:0 0 7px;color:var(--gold)}' +
    '#scr-party .gn-vcard.bad h4{color:var(--bad)}' +
    '#scr-party .gn-vcard p{font-size:12px;line-height:1.6;color:var(--dim);margin:0 0 4px}' +
    '#scr-party .gn-vcard p b{color:var(--txt)}' +
    '#scr-party .gn-vscore{display:flex;justify-content:center;gap:14px;margin:10px 0 12px}' +
    '#scr-party .gn-vscore .gn-vs{display:flex;flex-direction:column;gap:2px}' +
    '#scr-party .gn-vscore .gn-vs i{font:700 9px/1 var(--disp);letter-spacing:.12em;font-style:normal;' +
      'text-transform:uppercase;color:var(--dim2)}' +
    '#scr-party .gn-vscore .gn-vs b{font:900 22px/1 var(--disp);color:var(--txt)}' +
    '#scr-party .gn-vcard .gn-act{width:100%}' +

    /* short phones and landscape: the same felt, tightened */
    '@media (max-height:640px){' +
      '#scr-party .gn-top{min-height:28px}' +
      '#scr-party .gn-mid{gap:4px}' +
      '#scr-party .gn-say{font-size:10.5px;min-height:0}' +
      '#scr-party .gn-act{min-height:38px;padding:0 12px}}' +
    /* SIDEWAYS. There is not enough height to stack the piles on top
       of the hand, so the felt becomes a two-column grid: the hand and
       the seats on the left, the piles with their prompt and buttons
       in a column on the right. Nothing overlaps because nothing has
       to fit a column taller than the phone is. */
    '@media (max-height:480px){' +
      '#scr-party .gn-felt{display:grid;grid-template-columns:minmax(0,1fr) auto;' +
        'grid-template-rows:auto minmax(0,1fr);gap:4px 10px;padding:6px 8px 5px;' +
        'grid-template-areas:"top mid" "me mid";align-items:center}' +
      '#scr-party .gn-top{grid-area:top;min-height:22px;gap:6px;justify-content:flex-start}' +
      '#scr-party .gn-mid{grid-area:mid;flex-direction:column;gap:6px;min-width:170px;' +
        'align-self:center}' +
      '#scr-party .gn-me{grid-area:me;gap:2px;align-self:end}' +
      '#scr-party .gn-backs .gn-b{width:15px;height:21px;margin-left:-9px}' +
      '#scr-party .gn-pilelbl{display:none}' +
      '#scr-party .gn-pilebtn{width:min(74px,15vh);height:min(104px,21vh)}' +
      '#scr-party .gn-pilebtn .gn-count{min-width:18px;height:18px;line-height:18px;font-size:9px}' +
      '#scr-party .gn-piles{gap:10px}' +
      '#scr-party .gn-say{max-width:180px;font-size:10px;line-height:1.4}' +
      '#scr-party .gn-acts{gap:5px}' +
      '#scr-party .gn-dash{min-height:22px;justify-content:flex-start}' +
      '#scr-party .gn-act{min-height:30px;font-size:10px;padding:0 10px}' +
      /* the shared turn strip above the felt is party.js's element; one
         scoped, sideways-only squeeze, doubled-class to outrank party's
         own short-phone rule whichever stylesheet landed last */
      '#scr-party .pt-turn.pt-turn{min-height:28px;margin-bottom:4px;padding:3px 10px}}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   THE MATCH RUNNER — one match at a time, replay is the only way back
   ═══════════════════════════════════════════════════════════════════ */
let M = null;
let FAST = false;

function buildState(opts, seed, log) {
  const st = E.deal(opts, seed >>> 0);
  for (let i = 0; i < log.length; i++) E.apply(st, log[i]);
  return st;
}

function startMatch(opts, seed, log) {
  stopClocks();
  M = {
    opts: E.clone(opts || {}),
    seed: (seed == null ? (Math.random() * 0xFFFFFFFF) >>> 0 : seed) >>> 0,
    log: log ? E.clone(log) : [],
    st: null, ctx: null,
    mySeat: 0, arr: [], sel: null, drag: null, dragJust: false,
    fresh: null,                      /* the card just drawn, ringed once */
    timer: 0, dead: false, finished: false, net: null,
    handSeen: 0
  };
  M.st = buildState(M.opts, M.seed, M.log);
  return M;
}

function stopClocks() { if (M && M.timer) { clearTimeout(M.timer); M.timer = 0; } }

function isMine(seat) { return M && seat === M.mySeat; }

function snapshot() {
  if (!M) return null;
  return { v: 1, seed: M.seed, opts: E.clone(M.opts), log: E.clone(M.log), arr: M.arr.slice() };
}
function autosave() {
  if (!M) return;
  if (M.net) {                        /* online: keep only the arrangement */
    ST.netArr = { seed: M.seed, arr: M.arr.slice() };
    persist();
    return;
  }
  ST.save = E.over(M.st) ? null : snapshot();
  persist();
}

/* every move goes through this one door: a thumb, the machine, the
   table's own beats, and a packet off the wire */
function doMove(seat, mv, src) {
  if (!M || M.dead) return { ok: false, err: 'no game' };
  if (E.over(M.st)) return { ok: false, err: 'game over' };
  if (E.turn(M.st) !== seat) return { ok: false, err: 'not their turn' };
  if (!E.check(M.st, mv, seat)) return { ok: false, err: 'illegal move' };
  const fpBefore = M.net ? E.fingerprint(M.st) : null;
  const rec = E.clone(mv);
  rec.seat = seat;
  M.log.push(rec);
  E.apply(M.st, rec);
  if (mv.t === 'take' || mv.t === 'draw') {
    if (isMine(seat)) M.fresh = M.st.last.c;
  }
  autosave();
  sound(rec, seat, src);
  if (M.net && src === 'tap') {
    try { M.net.send('move', wireOf(rec), fpBefore); } catch (e) {}
  }
  return { ok: true };
}

function wireOf(mv) {
  const w = { a: mv.t };
  if (mv.c != null) w.i = mv.c | 0;
  return w;
}
const WIRE_OK = { take: 1, pass: 1, draw: 1, disc: 1, knock: 1 };
function moveFromWire(d) {
  if (!d || typeof d.a !== 'string' || !WIRE_OK[d.a]) return null;
  const mv = { t: d.a };
  if (d.i != null) {
    const c = d.i | 0;
    if (c < 0 || c > 51) return null;
    mv.c = c;
  }
  if ((mv.t === 'disc' || mv.t === 'knock') && mv.c == null) return null;
  return mv;
}

/* offline undo: back to just before the last thing I did */
function undoPoint() {
  if (!M) return -1;
  for (let i = M.log.length - 1; i >= 0; i--) if (M.log[i].seat === M.mySeat) return i;
  return -1;
}
function rollbackTo(n) {
  if (!M) return;
  stopClocks();
  M.log = M.log.slice(0, Math.max(0, n));
  M.st = buildState(M.opts, M.seed, M.log);
  M.sel = null; M.fresh = null; M.finished = false;
  autosave();
}

/* ── the sound of it ─────────────────────────────────────────────── */
function sound(mv, seat, src) {
  const mine = isMine(seat);
  switch (mv.t) {
    case 'draw': cue('card.deal', { gain: mine ? 0.9 : 0.7 }); break;
    case 'take': cue('pack.flip', { gain: mine ? 0.9 : 0.7 }); break;
    case 'disc': cue('card.throw', { gain: mine ? 0.8 : 0.6, rate: mine ? 1 : 0.95 }); break;
    case 'knock':
      cue('card.throw', { gain: 0.7 });
      /* the knuckle on the table — see the report: a real knock sample
         is wanted here; call.bell is the stand-in */
      setTimeout(() => cue('call.bell', { gain: 0.95 }), FAST ? 1 : 180);
      break;
    case 'tally': {
      const row = M.st.match.book[M.st.match.book.length - 1];
      if (!row) break;
      cueRun('pack.tally', 3, 120, { gain: 0.85 });
      if (!row.dead) {
        const won = row.win === M.mySeat;
        const t = FAST ? 1 : 520;
        if (row.how === 'gin') setTimeout(() => cue('ui.reward', { gain: 0.95 }), t);
        else if (row.how === 'undercut') setTimeout(() => cue('duel.trap', { gain: 0.9 }), t);
        setTimeout(() => cue(won ? 'ui.coin' : 'money.pay', { gain: won ? 0.95 : 0.7 }), FAST ? 2 : 820);
      }
      break;
    }
    case 'next':
      cue('card.shuffle', { gain: 0.85 });
      setTimeout(() => cueRun('card.deal', 6, 90, { gain: 0.5 }), FAST ? 1 : 220);
      break;
  }
}

/* ── the beats and the machine ───────────────────────────────────── */
function pace() {
  if (FAST) return 1;
  if (!M) return 800;
  if (M.st.phase === 'tally') return 850;
  if (M.st.phase === 'shuffle') return 4200;     /* the verdict gets read */
  return 800;
}

function step() {
  stopClocks();
  if (!M || M.dead) return;
  const st = M.st;
  if (E.over(st)) { finish(); return; }
  const t = E.turn(st);
  if (t === -1) {
    M.timer = setTimeout(() => {
      M.timer = 0;
      if (!M || M.dead) return;
      const opts = E.legal(M.st, -1);
      if (!opts.length) return;
      doMove(-1, opts[0], 'auto');
      render();
    }, pace());
    return;
  }
  if (isMine(t)) return;
  const own = st.seats[t].own;
  if (own === 'net') return;                     /* their phone, their clock */
  /* the machine */
  M.timer = setTimeout(() => {
    M.timer = 0;
    if (!M || M.dead) return;
    if (E.turn(M.st) !== t) return;
    let mv = null;
    try { mv = E.think(M.st, t, M.st.seats[t].lvl || 2); } catch (e) { mv = null; }
    if (!mv || !E.check(M.st, mv, t)) mv = E.legal(M.st, t)[0];
    if (!mv) return;
    doMove(t, mv, 'ai');
    render();
  }, FAST ? 1 : 650 + Math.floor(Math.random() * 500));
}

/* ═══════════════════════════════════════════════════════════════════
   THE FELT
   ═══════════════════════════════════════════════════════════════════ */
function openBoard() {
  injectCSS();
  P.show();
  M.finished = false;
  M.ctx = P.ui.frame({
    title: 'GIN RUMMY',
    onBack: () => {
      if (M && M.net) { confirmLeaveOnline(); return; }
      const opts = M ? M.opts : null;
      leave();
      setupSheet(opts);
    },
    leave: () => leave(),
    barCls: M && M.net ? 'two' : '',
    buttons: M && M.net
      ? [{ id: 'gn-resign', label: 'Resign', icon: 'flag', cls: 'ghost' },
         { id: 'gn-rules', label: 'Rules', icon: 'book', cls: 'ghost' }]
      : [{ id: 'gn-undo', label: 'Undo', icon: 'back', cls: 'ghost' },
         { id: 'gn-rules', label: 'Rules', icon: 'book', cls: 'ghost' },
         { id: 'gn-new', label: 'New', icon: 'refresh', cls: 'ghost' }]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();
  M.ctx.badge.textContent = 'Il-Ġin';
  M.ctx.host.classList.add('kb-host');
  M.ctx.host.style.alignItems = 'stretch';
  M.ctx.host.style.justifyContent = 'stretch';
  M.ctx.host.innerHTML =
    '<div class="gn-felt tapme" id="gn-felt">' +
      '<div class="gn-top" id="gn-top"></div>' +
      '<div class="gn-mid" id="gn-mid"></div>' +
      '<div class="gn-me">' +
        '<div class="gn-dash" id="gn-dash"></div>' +
        '<div class="gn-hand" id="gn-hand" aria-label="Your hand. Drag to arrange."></div>' +
      '</div>' +
    '</div>';

  const undo = M.ctx.btn('gn-undo');
  if (undo) undo.onclick = () => {
    const n = undoPoint();
    if (n < 0) return;
    rollbackTo(n);
    const o = M.ctx.root.querySelector('.pt-over'); if (o) o.remove();
    render();
  };
  M.ctx.btn('gn-rules').onclick = rulesSheet;
  const nb = M.ctx.btn('gn-new');
  if (nb) nb.onclick = () => P.ui.confirm(M.ctx, {
    head: 'Throw the match in?',
    why: 'The whole match — the score too. You deal fresh from nothing.',
    yes: 'Deal fresh', no: 'No, carry on',
    go: () => { const o = M.opts; leave(); ST.save = null; persist(); newGame(o); }
  });
  const rs = M.ctx.btn('gn-resign');
  if (rs) rs.onclick = () => P.ui.confirm(M.ctx, {
    head: 'Resign the match?',
    why: 'They take the win. There is no shame in it. Some, but not much.',
    yes: 'Resign', no: 'No, play on',
    go: () => resignOnline()
  });

  /* keep the hand laid out when the phone turns over */
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => { if (M && !M.dead) layoutHand(); });
    ro.observe(M.ctx.host);
    M.stopRO = () => ro.disconnect();
  }
  render();
  cue('game.start', { gain: 0.9 });
}

function leave() {
  stopClocks();
  if (M) {
    autosave();
    persistNow();
    if (M.stopRO) { try { M.stopRO(); } catch (e) {} }
    const net = M.net;
    M.dead = true;
    if (net && net.onGone) { try { net.onGone(); } catch (e) {} }
  }
  M = null;
}

/* ── keeping the player's arrangement ────────────────────────────── */
function reconcileArr() {
  const hand = M.st.seats[M.mySeat].hand;
  const inHand = new Set(hand);
  const arr = M.arr.filter(c => inHand.has(c));
  const have = new Set(arr);
  for (const c of hand) if (!have.has(c)) arr.push(c);   /* new cards on the right */
  M.arr = arr;
}

/* SORT is a button. It groups the best melds first (each its own
   block), then the loose cards by rank. It runs when pressed and at
   no other time. */
function sortArr() {
  const hand = M.st.seats[M.mySeat].hand;
  const b = E.best(hand);
  const out = [];
  b.melds.forEach(m => {
    m.slice().sort((a, x) => E.rankOf(a) - E.rankOf(x) || E.suitOf(a) - E.suitOf(x))
      .forEach(c => out.push(c));
  });
  b.dead.slice().sort((a, x) => E.rankOf(a) - E.rankOf(x) || E.suitOf(a) - E.suitOf(x))
    .forEach(c => out.push(c));
  M.arr = out;
  autosave();
  cue('ui.tap', { gain: 0.9 });
  render();
}

/* ═══ RENDER ══════════════════════════════════════════════════════ */
function $id(id) { return M && M.ctx ? M.ctx.host.querySelector('#' + id) : null; }

function render() {
  if (!M || M.dead || !M.ctx) return;
  const st = M.st;
  const t = E.turn(st);
  const me = M.mySeat, foe = 1 - me;
  const ov = E.over(st);
  reconcileArr();

  /* the turn strip up top */
  if (ov) P.ui.setTurn(M.ctx, { cls: '', who: ov.winner === me ? 'Match yours' : 'Match theirs' });
  else P.ui.setTurn(M.ctx, {
    cls: t === me ? 'w' : t === foe ? 'r' : '',
    who: t === -1 ? 'Counting…'
      : t === me ? 'Your turn'
      : st.seats[foe].name + (st.seats[foe].own === 'ai' ? ' is thinking…' : '’s turn'),
    note: 'Hand ' + st.handNo
  });

  /* the other chair */
  const foeS = st.seats[foe];
  let backs = '';
  const nb = Math.min(foeS.hand.length, 10);
  for (let i = 0; i < nb; i++) backs += '<span class="gn-b" aria-hidden="true">' + backHTML() + '</span>';
  $id('gn-top').innerHTML =
    '<span class="gn-nm' + (t === foe ? ' turn' : '') + '">' + esc(foeS.name) + '</span>' +
    '<span class="gn-backs" aria-label="' + foeS.hand.length + ' cards in their hand">' + backs + '</span>' +
    '<span class="gn-chip" aria-label="Match score: you ' + st.match.pts[me] + ', them ' +
      st.match.pts[foe] + '">You <b>' + st.match.pts[me] + '</b> · them <b>' +
      st.match.pts[foe] + '</b></span>';

  paintMid();
  paintDash();
  paintHand();
  paintVerdict();

  if (ov) { finish(); return; }
  step();
}

function paintMid() {
  const st = M.st, me = M.mySeat;
  const t = E.turn(st);
  const myGo = t === me;
  const ph = st.phase;
  const up = E.upTop(st);
  const canTake = myGo && (ph === 'up0' || ph === 'up1' || ph === 'main');
  const canDraw = myGo && (ph === 'main' || ph === 'draw1');
  const throwing = myGo && ph === 'off';
  const banned = (st.drew && st.drew.from === 'pile') ? st.drew.c : null;

  let say;
  if (!myGo && t >= 0) say = 'Waiting on ' + esc(st.seats[1 - me].name) + '…';
  else if (ph === 'up0' || ph === 'up1')
    say = 'First card up: <b>' + esc(nameOfCard(up)) + '</b>. Take it, or pass.';
  else if (ph === 'draw1') say = 'Both passed — you <b>draw blind</b> from the stock.';
  else if (ph === 'main') say = 'Take the <b>' + esc(nameOfCard(up)) + '</b>, or draw blind.';
  else if (throwing) {
    say = M.sel != null
      ? (M.sel === banned
          ? 'Not that one — you only just took it off the pile.'
          : 'Throw the <b>' + esc(nameOfCard(M.sel)) + '</b> on the pile' +
            (knockDwFor(M.sel) != null ? ', or knock with it' : '') + '.')
      : 'Eleven cards. <b>Tap one</b> to throw it back — or drag it straight onto the pile.';
  } else say = '';

  const pileInner = up < 0
    ? '<span class="gn-empty">empty</span>'
    : faceHTML(up);
  $id('gn-mid').innerHTML =
    '<div class="gn-piles">' +
      '<div class="gn-pilebox"><span class="gn-pilelbl">Stock</span>' +
        '<button type="button" class="gn-pilebtn tapme' + (canDraw ? ' can' : (myGo && (ph === 'up0' || ph === 'up1') ? ' dim' : '')) + '" id="gn-stock" ' +
          'aria-label="Draw a blind card from the stock. ' + st.stock.length + ' left."' +
          (canDraw ? '' : ' aria-disabled="true"') + '>' +
          backHTML() + '<span class="gn-count">' + st.stock.length + '</span></button></div>' +
      '<div class="gn-pilebox"><span class="gn-pilelbl">Discards</span>' +
        '<button type="button" class="gn-pilebtn tapme' + (canTake || (throwing && M.sel != null && M.sel !== banned) ? ' can' : '') + '" id="gn-pile" ' +
          'aria-label="' + (up < 0 ? 'The discard pile is empty.'
            : throwing ? 'Throw your chosen card on the pile.'
            : 'Take the ' + nameOfCard(up) + ' from the discards.') + '">' +
          pileInner + '</button></div>' +
    '</div>' +
    '<div class="gn-say" id="gn-say" role="status" aria-live="polite">' + say + '</div>' +
    '<div class="gn-acts" id="gn-acts"></div>';

  /* the action row: honest buttons under the same taps */
  const acts = $id('gn-acts');
  let h = '';
  if (myGo && (ph === 'up0' || ph === 'up1')) {
    h += '<button type="button" class="gn-act tapme" data-a="take">Take it</button>';
    h += '<button type="button" class="gn-act ghost tapme" data-a="pass">Pass</button>';
  }
  if (throwing && M.sel != null && M.sel !== banned) {
    h += '<button type="button" class="gn-act ghost tapme" data-a="disc">Throw it</button>';
    const kd = knockDwFor(M.sel);
    if (kd != null)
      h += '<button type="button" class="gn-act hot tapme" data-a="knock">' +
        (kd === 0 ? 'GIN' : 'Knock · ' + kd) + '</button>';
  }
  acts.innerHTML = h;
  acts.querySelectorAll('[data-a]').forEach(b => {
    b.onclick = () => act(b.getAttribute('data-a'));
  });
  $id('gn-stock').onclick = () => {
    if (!M || M.dead) return;
    const stx = M.st, tt = E.turn(stx);
    if (tt !== M.mySeat) return;
    if (stx.phase === 'up0' || stx.phase === 'up1') { nag('Take the upcard or pass — the stock waits.'); return; }
    act('draw');
  };
  $id('gn-pile').onclick = () => {
    if (!M || M.dead) return;
    const stx = M.st, tt = E.turn(stx);
    if (tt !== M.mySeat) return;
    if (stx.phase === 'off') { if (M.sel != null) act('disc'); return; }
    act('take');
  };
}

function knockDwFor(c) {
  const h = M.st.seats[M.mySeat].hand;
  if (h.length !== 11) return null;
  const dw = E.best(h.filter(x => x !== c)).dw;
  return dw <= E.KNOCK_MAX ? dw : null;
}

function act(a) {
  if (!M || M.dead) return;
  const me = M.mySeat;
  let mv = null;
  if (a === 'take') mv = { t: 'take' };
  else if (a === 'pass') mv = { t: 'pass' };
  else if (a === 'draw') mv = { t: 'draw' };
  else if (a === 'disc' || a === 'knock') {
    if (M.sel == null) return;
    mv = { t: a, c: M.sel };
  }
  if (!mv) return;
  const r = doMove(me, mv, 'tap');
  if (!r.ok) {
    cue('ui.error', { gain: 0.9 });
    nag(r.err === 'illegal move' && mv.t === 'disc'
      ? 'You cannot throw back the card you just took.' : null);
    return;
  }
  M.sel = null;
  render();
}

function nag(text) {
  if (K.toast) K.toast('⚠ ' + (text || 'The rules said no. Take it up with the rules.'));
}

/* ── the dashboard: live deadwood, sort, nudge ───────────────────── */
function paintDash() {
  const st = M.st, me = M.mySeat;
  const hand = st.seats[me].hand;
  const b = E.best(hand);
  let line;
  if (hand.length === 11) {
    const bd = E.bestDiscard(hand, (st.drew && st.drew.from === 'pile') ? st.drew.c : null);
    line = '<span class="gn-chip' + (bd.dw <= E.KNOCK_MAX ? ' hot' : '') + '">Deadwood after best throw <b>' + bd.dw + '</b></span>';
  } else {
    line = '<span class="gn-chip' + (b.dw <= E.KNOCK_MAX ? ' hot' : '') + '">Deadwood <b>' + b.dw + '</b></span>';
  }
  const selAt = M.sel != null ? M.arr.indexOf(M.sel) : -1;
  $id('gn-dash').innerHTML =
    line +
    '<button type="button" class="gn-sortbtn tapme" id="gn-sort" ' +
      'aria-label="Sort the hand, melds first. Only sorts when you press it.">' + 'Sort</button>' +
    '<button type="button" class="gn-nudge tapme" id="gn-left" aria-label="Move the chosen card left"' +
      (selAt > 0 ? '' : ' disabled') + '>&#8249;</button>' +
    '<button type="button" class="gn-nudge tapme" id="gn-right" aria-label="Move the chosen card right"' +
      (selAt >= 0 && selAt < M.arr.length - 1 ? '' : ' disabled') + '>&#8250;</button>';
  $id('gn-sort').onclick = sortArr;
  $id('gn-left').onclick = () => nudge(-1);
  $id('gn-right').onclick = () => nudge(1);
}

function nudge(dir) {
  if (M.sel == null) return;
  const i = M.arr.indexOf(M.sel);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= M.arr.length) return;
  const t = M.arr[i]; M.arr[i] = M.arr[j]; M.arr[j] = t;
  autosave();
  cue('ui.tap', { gain: 0.7 });
  render();
}

/* ── the hand itself ─────────────────────────────────────────────── */
const DRAG_SLOP = 9;

function handMetrics() {
  const rail = $id('gn-hand');
  const W = Math.max(200, rail.clientWidth - 8);
  const n = Math.max(1, M.arr.length);
  const hostH = M.ctx.host.clientHeight || 400;
  const cap = hostH < 260 ? 0.30 : 0.34;      /* sideways: shorter cards */
  let w = Math.min(72, Math.floor((W - 4) / (1 + (n - 1) * 0.52)));
  w = Math.max(36, Math.min(w, Math.floor((hostH * cap) / 1.4)));
  const step = n > 1 ? Math.min(w + 4, (W - 4 - w) / (n - 1)) : 0;
  return { w, h: Math.round(w * 1.4), step, x0: 4, lift: hostH < 260 ? 18 : 26 };
}

function paintHand() {
  const st = M.st, me = M.mySeat;
  const rail = $id('gn-hand');
  const b = E.best(st.seats[me].hand);
  const meldOf = {};
  b.melds.forEach((m, i) => m.forEach(c => { meldOf[c] = i % 4; }));
  let h = '';
  M.arr.forEach((c, i) => {
    const inMeld = meldOf[c] !== undefined;
    const lbl = nameOfCard(c) +
      (inMeld ? '. In a meld.' : '. Loose — worth ' + E.pts(c) + '.') +
      ' Drag to arrange.';
    h += '<button type="button" class="gn-card tapme' +
      (inMeld ? ' m' + meldOf[c] : ' loose') +
      (M.sel === c ? ' sel' : '') +
      (M.fresh === c ? ' fresh' : '') +
      '" data-c="' + c + '" data-i="' + i + '" aria-label="' + esc(lbl) + '">' +
      faceHTML(c) +
      '<span class="gn-rib"></span>' +
      '<span class="gn-dwtag">' + E.pts(c) + '</span>' +
      '</button>';
  });
  rail.innerHTML = h;
  layoutHand();
  rail.querySelectorAll('.gn-card').forEach(wireCard);
}

function layoutHand() {
  const rail = $id('gn-hand');
  if (!rail) return;
  const m = handMetrics();
  rail.style.height = (m.h + m.lift) + 'px';
  rail.querySelectorAll('.gn-card').forEach(el => {
    const i = +el.dataset.i;
    el.style.width = m.w + 'px';
    el.style.height = m.h + 'px';
    if (!el.classList.contains('drag')) el.style.left = (m.x0 + i * m.step) + 'px';
  });
}

/* ── PICKING A CARD UP — Pointer Events, capture, slop ────────────
   The same shape js/skarta-ui.js proved on the phone: pointerdown
   remembers, movement past DRAG_SLOP makes it a drag, capture keeps
   the stream when the thumb leaves the little card, and anything
   under the slop is still a tap. touch-action:none on the card (see
   the stylesheet) is what keeps iOS Safari's scroller out of it. */
function wireCard(el) {
  el.onclick = () => {
    if (!M || M.dragJust) return;
    const c = +el.dataset.c;
    M.sel = (M.sel === c) ? null : c;
    M.fresh = null;
    cue('ui.tap', { gain: 0.8 });
    render();
  };
  el.addEventListener('pointerdown', ev => {
    if (!M || M.dead) return;
    if (ev.button !== undefined && ev.button !== 0) return;
    const m = handMetrics();
    M.drag = {
      el, c: +el.dataset.c, from: +el.dataset.i,
      x0: ev.clientX, y0: ev.clientY, left0: parseFloat(el.style.left) || 0,
      live: false, to: +el.dataset.i, m
    };
    M.dragJust = false;
    try { el.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  el.addEventListener('pointermove', ev => {
    const d = M && M.drag;
    if (!d || d.el !== el) return;
    if (!d.live) {
      if (Math.abs(ev.clientX - d.x0) + Math.abs(ev.clientY - d.y0) < DRAG_SLOP) return;
      d.live = true; M.dragJust = true;
      el.classList.add('drag');
    }
    ev.preventDefault();
    const dx = ev.clientX - d.x0;
    const dy = Math.max(-46, Math.min(26, ev.clientY - d.y0));
    el.style.left = (d.left0 + dx) + 'px';
    el.style.transform = 'translateY(' + dy + 'px) scale(1.05)';
    /* where would it land? */
    const centre = d.left0 + dx + d.m.w / 2;
    let to = d.m.step > 0 ? Math.round((centre - d.m.x0 - d.m.w / 2) / d.m.step) : 0;
    to = Math.max(0, Math.min(M.arr.length - 1, to));
    if (to !== d.to) { d.to = to; previewOrder(d); }
    /* …or onto the pile? */
    const pile = $id('gn-pile');
    if (pile) {
      const r = pile.getBoundingClientRect();
      const over = ev.clientX >= r.left - 8 && ev.clientX <= r.right + 8 &&
                   ev.clientY >= r.top - 8 && ev.clientY <= r.bottom + 8;
      d.onPile = over && M.st.phase === 'off' && E.turn(M.st) === M.mySeat;
      pile.classList.toggle('drop', !!d.onPile);
    }
  });
  const finish = ev => {
    const d = M && M.drag;
    if (!d || d.el !== el) return;
    M.drag = null;
    el.classList.remove('drag');
    el.style.transform = '';
    const pile = $id('gn-pile');
    if (pile) pile.classList.remove('drop');
    if (!d.live) { M.dragJust = false; return; }
    if (d.onPile) {
      const r = doMove(M.mySeat, { t: 'disc', c: d.c }, 'tap');
      if (!r.ok) {
        cue('ui.error', { gain: 0.9 });
        nag('You cannot throw back the card you just took.');
        render();
      } else { M.sel = null; render(); }
    } else {
      if (d.to !== d.from) {
        const arr = M.arr.slice();
        arr.splice(d.from, 1);
        arr.splice(d.to, 0, d.c);
        M.arr = arr;
        autosave();
        cue('ui.tap', { gain: 0.6 });
      }
      render();
    }
    setTimeout(() => { if (M) M.dragJust = false; }, 0);
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
}

/* while dragging, the others step aside to show the landing slot */
function previewOrder(d) {
  const rail = $id('gn-hand');
  if (!rail) return;
  const order = M.arr.slice();
  order.splice(d.from, 1);
  order.splice(d.to, 0, d.c);
  rail.querySelectorAll('.gn-card').forEach(el => {
    if (el === d.el) return;
    const at = order.indexOf(+el.dataset.c);
    el.style.left = (d.m.x0 + at * d.m.step) + 'px';
  });
}

/* ── the hand-end verdict ────────────────────────────────────────── */
function verdictWords(row, me) {
  if (row.dead) return {
    head: 'Dead hand', bad: false,
    body: 'Two cards left and nobody knocked. No score — the same dealer deals it again.'
  };
  const kName = seatName(row.knocker), dName = seatName(1 - row.knocker);
  const meWin = row.win === me;
  let head, body;
  if (row.how === 'gin') {
    head = row.knocker === me ? 'GIN!' : 'Gin. Theirs.';
    body = '<b>' + esc(kName) + '</b> went gin — every card melded. 25 plus ' +
      row.ddw + ' deadwood: <b>' + row.score + ' points</b>.';
  } else if (row.how === 'undercut') {
    head = meWin ? 'UNDERCUT!' : 'Undercut. Ouch.';
    body = '<b>' + esc(kName) + '</b> knocked with ' + row.kdw + ' — but <b>' + esc(dName) +
      '</b>' + (row.laid ? ' laid off ' + row.laid + ' and' : '') + ' finished on ' + row.ddw +
      '. The knock backfires: <b>' + row.score + ' points</b> the other way.';
  } else {
    head = meWin ? 'Your hand' : 'Their hand';
    body = '<b>' + esc(kName) + '</b> knocked with ' + row.kdw + ' against ' + row.ddw +
      (row.laid ? ' after ' + row.laid + ' laid off' : '') +
      ': <b>' + row.score + ' points</b>.';
  }
  return { head, bad: !meWin, body };
}
function seatName(s) { return M.st.seats[s].own === 'me' ? 'You' : M.st.seats[s].name; }

function paintVerdict() {
  const felt = $id('gn-felt');
  const old = felt.querySelector('.gn-verdict');
  if (old) old.remove();
  const st = M.st;
  if (st.phase !== 'shuffle') return;
  const row = st.match.book[st.match.book.length - 1];
  if (!row) return;
  const w = verdictWords(row, M.mySeat);
  const div = document.createElement('div');
  div.className = 'gn-verdict';
  div.innerHTML =
    '<div class="gn-vcard' + (w.bad ? ' bad' : '') + '" role="status">' +
      '<h4>' + w.head + '</h4>' +
      '<p>' + w.body + '</p>' +
      '<div class="gn-vscore">' +
        '<span class="gn-vs"><i>You</i><b>' + st.match.pts[M.mySeat] + '</b></span>' +
        '<span class="gn-vs"><i>' + esc(st.seats[1 - M.mySeat].name) + '</i><b>' +
          st.match.pts[1 - M.mySeat] + '</b></span>' +
      '</div>' +
      '<button type="button" class="gn-act tapme" id="gn-nexthand">Deal the next hand</button>' +
    '</div>';
  felt.appendChild(div);
  div.querySelector('#gn-nexthand').onclick = () => {
    /* the beat the timer was going to make, made now. Deterministic,
       so making it early can never disagree with the other phone. */
    stopClocks();
    const opts = E.legal(M.st, -1);
    if (opts.length) { doMove(-1, opts[0], 'auto'); render(); }
  };
}

/* ── the end of the match ────────────────────────────────────────── */
function finish() {
  if (!M || M.finished) return;
  const fin = E.over(M.st);
  if (!fin) return;
  M.finished = true;
  stopClocks();
  const me = M.mySeat;
  const won = fin.winner === me;
  setTimeout(() => cue(won ? 'game.win' : 'game.lose', { gain: 1 }), FAST ? 1 : 300);
  if (!M.net) {
    ST.save = null; persist();
    try { P.record('gin', won ? 'w' : 'l'); } catch (e) {}
  }
  const l = 1 - fin.winner;
  const why = 'Points ' + fin.raw[me] + '–' + fin.raw[1 - me] +
    ', boxes ' + fin.boxes[me] + '–' + fin.boxes[1 - me] +
    (fin.shutout ? ', and a shutout — everything doubled' : '') +
    '. Full total ' + fin.total[me] + '–' + fin.total[1 - me] + '.';
  const quip = won
    ? (fin.shutout ? 'A schneider. They will be paying for the pastizzi until Santa Marija.'
                   : 'Knock knock. Who is there? A hundred points, that is who.')
    : (fin.shutout ? 'Not one hand. Statistically impressive, in its way.'
                   : 'The cards were against you. The cards, and every choice you made.');
  if (M.net && M.net.onEnd) { try { M.net.onEnd(fin); } catch (e) {} }
  P.ui.result(M.ctx, {
    tone: won ? 'win' : 'lose',
    head: won ? 'MATCH YOURS' : 'MATCH THEIRS',
    why, quip,
    buttons: M.net
      ? [{ label: 'Back to the rooms', icon: 'back', cls: 'primary',
           go: () => { const n = M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
      : [
          { label: 'Deal again', icon: 'refresh', cls: 'primary',
            go: () => { const o = M.opts; leave(); newGame(o); } },
          { label: 'Back to the shelf', icon: 'back', cls: 'ghost',
            go: () => { leave(); P.hub(); } }
        ]
  });
}

/* ── the rules card, over the felt ───────────────────────────────── */
function rulesSheet() {
  const ctx = M ? M.ctx : null;
  if (!ctx) return;
  const old = ctx.root.querySelector('.pt-ask'); if (old) old.remove();
  const ask = document.createElement('div');
  ask.className = 'pt-over pt-ask';
  ask.innerHTML =
    '<div class="pt-card" style="max-width:340px;text-align:left">' +
      '<h3 style="text-align:center">GIN RUMMY</h3>' +
      '<div class="kb-rules" style="margin:12px 0 0;padding:12px 14px;border-radius:14px;' +
        'background:rgba(255,255,255,.04);border:1px solid var(--line)"><ul style="margin:0">' +
        RULES.map(r => '<li style="font-size:12px;line-height:1.65;color:var(--dim);margin:0 0 6px 16px">' + r + '</li>').join('') +
      '</ul></div>' +
      '<div class="pt-acts"><button class="btn ghost" id="gn-rx">Right, got it</button></div>' +
    '</div>';
  ctx.root.appendChild(ask);
  ask.querySelector('#gn-rx').onclick = () => ask.remove();
  ask.querySelector('#gn-rx').focus();
}

/* ═══════════════════════════════════════════════════════════════════
   STARTING GAMES
   ═══════════════════════════════════════════════════════════════════ */
function myName() {
  try {
    const n = K.displayName && K.displayName();
    if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
      return String(n).trim().slice(0, 14);
  } catch (e) {}
  return 'You';
}

function newGame(opts, snap) {
  opts = opts || {};
  const lvl = opts.lvl || 2;
  const full = {
    lvl,
    target: opts.target || 100,
    names: [myName(), levelName(lvl)],
    owns: ['me', 'ai']
  };
  startMatch(full, snap ? snap.seed : undefined, snap ? snap.log : undefined);
  M.arr = snap && Array.isArray(snap.arr) ? snap.arr.slice() : [];
  openBoard();
}

/* ── the setup sheet ─────────────────────────────────────────────── */
function setupSheet(prevOpts) {
  injectCSS();
  P.show();
  stopClocks(); M = null;
  const el = P.ui.screenEl();
  const p = ST.pref;
  let lvl = (prevOpts && prevOpts.lvl) || p.lvl || 2;
  let target = (prevOpts && prevOpts.target) || p.target || 100;

  /* has the online lobby learned the word "gin" on this build? We
     teach it ourselves below, so normally yes — but say so honestly
     if mp.js is missing altogether. */
  const MPX = window.KARTI_MP;
  const online = !!(MPX && MPX.openFor && MPX.GAME_KEYS && MPX.GAME_KEYS.indexOf('gin') >= 0);

  function paint() {
    el.innerHTML =
      '<div class="tbar">' +
        '<button class="iconbtn" id="gn-back" aria-label="Back">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>GIN RUMMY</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<p class="blurb">Ten cards, a straight face, and one knuckle on the table. ' +
        'Draw, arrange, and knock before they do — <b>each of you on your own phone</b>.</p>' +
        (online
          ? '<div class="pt-opts" style="margin-bottom:10px">' +
              '<button class="pt-opt" id="gn-online">' + ico('users') +
              '<b>Somebody online</b><i>Open a gin room, or take one that is waiting.</i></button>' +
            '</div>'
          : '<p class="pt-warn">Online gin needs the KARTI server to learn the word "gin" — ' +
            'until then it is you against the machine here.</p>') +
        '<div class="tiny pt-lbl">The machine</div>' +
        '<div class="pt-opts" id="gn-lvl">' +
          LEVELS.map(o => '<button class="pt-opt' + (o.k === lvl ? ' on' : '') + '" data-lvl="' + o.k + '">' +
            ico(o.i) + '<b>' + esc(o.n) + '</b><i>' + esc(o.d) + '</i></button>').join('') +
        '</div>' +
        '<div class="tiny pt-lbl">The match</div>' +
        '<div class="pt-opts two" id="gn-tgt" style="grid-template-columns:repeat(2,minmax(0,1fr))">' +
          [[50, 'Quick one', 'First to 50.'], [100, 'The proper game', 'First to 100.']].map(o =>
            '<button class="pt-opt' + (o[0] === target ? ' on' : '') + '" data-tgt="' + o[0] + '">' +
              ico('coach') + '<b>' + o[1] + '</b><i>' + o[2] + '</i></button>').join('') +
        '</div>' +
        '<div class="pt-acts" style="margin-top:18px;display:grid;gap:9px">' +
          '<button class="btn primary" id="gn-go">Deal</button>' +
          (ST.save
            ? '<button class="btn ghost" id="gn-res">Carry on the saved match</button>' : '') +
        '</div>' +
        '<div class="kb-rules" style="margin:16px 2px 20px;padding:12px 14px;border-radius:14px;' +
          'background:rgba(255,255,255,.04);border:1px solid var(--line)">' +
          '<h5 style="font:900 10px/1 var(--disp);letter-spacing:.11em;text-transform:uppercase;' +
            'color:var(--gold);margin:0 0 9px">The rules, as we play them</h5><ul style="margin:0">' +
          RULES.map(r => '<li style="font-size:12px;line-height:1.65;color:var(--dim);margin:0 0 6px 16px">' + r + '</li>').join('') +
        '</ul></div>' +
      '</div>';
    el.querySelector('#gn-back').onclick = () => P.hub();
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { lvl = +b.dataset.lvl; paint(); });
    el.querySelectorAll('[data-tgt]').forEach(b => b.onclick = () => { target = +b.dataset.tgt; paint(); });
    el.querySelector('#gn-go').onclick = () => {
      ST.pref.lvl = lvl; ST.pref.target = target; persist();
      newGame({ lvl, target });
    };
    const r = el.querySelector('#gn-res');
    if (r) r.onclick = () => {
      const s = ST.save;
      if (!s) return;
      startMatch(s.opts, s.seed, s.log);
      M.arr = Array.isArray(s.arr) ? s.arr.slice() : [];
      openBoard();
    };
    const on = el.querySelector('#gn-online');
    if (on) on.onclick = () => {
      ST.pref.lvl = lvl; ST.pref.target = target; persist();
      try { MPX.openFor('gin'); } catch (e) {}
    };
  }
  paint();
}

/* ═══════════════════════════════════════════════════════════════════
   ONLINE — the chess-shaped controller js/mp.js drives for a
   two-seat room: start(o) / remote(d) / note / stop / live.
   Both phones deal the same match from the room's shared seed and
   only {a, i} ever crosses; every incoming move is re-checked by OUR
   copy of the rules and refused by name if it does not fit.
   ═══════════════════════════════════════════════════════════════════ */
function netSeed() {
  try { return (window.KARTI_MP.MP.seed >>> 0) || 1; } catch (e) { return 1; }
}

function onlineStart(o) {
  const seed = netSeed();
  const mySeat = o.colour === 'w' ? 0 : 1;
  const names = mySeat === 0 ? [o.me, o.foe] : [o.foe, o.me];
  const owns = mySeat === 0 ? ['me', 'net'] : ['net', 'me'];
  startMatch({ lvl: 2, target: 100, names, owns, dealer: 1 }, seed);
  M.mySeat = mySeat;
  M.net = o;
  M.arr = (ST.netArr && ST.netArr.seed === seed && Array.isArray(ST.netArr.arr))
    ? ST.netArr.arr.slice() : [];
  openBoard();
  P.ui.setNet(M.ctx, o.note || '', '');
}

function onlineRemote(d) {
  if (!M || M.dead || !M.net) return { why: 'a move with no game on the table' };
  if (E.over(M.st)) return null;                 /* finished; let it lie */
  if (d.kind === 'resign') {
    theyResigned();
    return null;
  }
  if (d.kind !== 'move') return { why: 'a move gin rummy does not have' };

  /* the table's own beats first: their phone may already have counted
     the hand its timer was still sitting on here */
  let guard = 0;
  while (E.turn(M.st) === -1 && guard++ < 6) {
    const opts = E.legal(M.st, -1);
    if (!opts.length) break;
    if (!doMove(-1, opts[0], 'auto').ok) break;
  }
  if (d.ck && d.ck !== E.fingerprint(M.st))
    return { why: 'a move from a board that is not this one', desync: true };
  const mv = moveFromWire(d.m);
  if (!mv) return { why: 'a move gin rummy does not know how to make' };
  const seat = 1 - M.mySeat;
  const r = doMove(seat, mv, 'net');
  if (!r.ok) return { why: 'a move the rules of gin do not allow (' + r.err + ')' };
  render();
  return null;
}

function theyResigned() {
  if (!M || M.finished) return;
  M.finished = true;
  stopClocks();
  cue('game.win', { gain: 1 });
  P.ui.setNet(M.ctx, '', '');
  P.ui.result(M.ctx, {
    tone: 'win',
    head: 'They resigned',
    why: 'The match is yours. Score at the walk-out: ' +
      M.st.match.pts[M.mySeat] + '–' + M.st.match.pts[1 - M.mySeat] + '.',
    quip: 'The dignified exit. It fools nobody.',
    buttons: [{ label: 'Back to the rooms', icon: 'back', cls: 'primary',
      go: () => { const n = M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
  });
  if (M.net && M.net.onEnd) { try { M.net.onEnd({ resign: true }); } catch (e) {} }
}

function resignOnline() {
  if (!M || !M.net || M.finished) return;
  try { M.net.send('resign', null, null); } catch (e) {}
  M.finished = true;
  stopClocks();
  cue('game.lose', { gain: 0.9 });
  P.ui.result(M.ctx, {
    tone: 'lose',
    head: 'You resigned',
    why: 'The match goes to ' + esc(M.st.seats[1 - M.mySeat].name) + '.',
    quip: 'Sometimes the bravest knock is the door on the way out.',
    buttons: [{ label: 'Back to the rooms', icon: 'back', cls: 'primary',
      go: () => { const n = M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
  });
  if (M.net && M.net.onEnd) { try { M.net.onEnd({ resign: true }); } catch (e) {} }
}

function confirmLeaveOnline() {
  P.ui.confirm(M.ctx, {
    head: 'Leave the table?',
    why: 'Leaving mid-match hands them the room. The match is not scored.',
    yes: 'Leave', no: 'Stay',
    go: () => { const n = M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); }
  });
}

function onlineNote(text, tone) {
  if (!M || !M.net || !M.ctx) return;
  P.ui.setNet(M.ctx, text || '', tone || '');
}

function onlineStop(why, tone) {
  if (!M || !M.net || !M.ctx) return;
  stopClocks();
  M.finished = true;
  P.ui.setNet(M.ctx, '', '');
  P.ui.result(M.ctx, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? 'No deal' : 'Cut off',
    why: why || 'The match stopped.',
    quip: 'Nothing was scored. Nobody loses a match over a bad line.',
    buttons: [{ label: 'Back to the rooms', icon: 'back', cls: 'primary',
      go: () => { const n = M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
  });
}

P.online = P.online || {};
P.online.gin = {
  start: onlineStart, remote: onlineRemote,
  note: onlineNote, stop: onlineStop,
  live: () => !!(M && M.net && !M.dead)
};

/* ═══════════════════════════════════════════════════════════════════
   REGISTRATION — the shelf tile, and teaching the lobby the word
   ═══════════════════════════════════════════════════════════════════ */
P.register({
  id: 'gin', order: 34, kind: 'card', name: 'GIN RUMMY', mt: 'Il-Ġin',
  sprite: 'gn-t-gin', icon: 'cards', status: 'live',
  get tag() {
    return 'Draw, arrange, knock. The politest way to rob your uncle blind — and an ' +
      'undercut if he was not bluffing.' +
      (ST.save ? ' There is a match of this half-played.' : '');
  },
  open: () => setupSheet()
});

/* js/mp.js exports its game registry LIVE, precisely so a game file
   can introduce itself without anybody editing mp.js. cleanGame()
   and gameMeta() close over these same arrays. The relay must also
   know the id — see the report: one word in server/karti_server.py
   — and until it does, opening a gin room fails with mp.js's own
   honest "that server cannot host…" message rather than anything
   worse. */
(function teachLobby() {
  const MPX = window.KARTI_MP;
  if (!MPX || !Array.isArray(MPX.GAMES) || !Array.isArray(MPX.GAME_KEYS)) return;
  if (MPX.GAME_KEYS.indexOf('gin') >= 0) return;
  MPX.GAMES.push({ k: 'gin', name: 'Gin Rummy', short: 'GIN', icon: 'cards',
    blurb: 'Ten cards. Knock first.' });
  MPX.GAME_KEYS.push('gin');
  if (MPX.SEATS_FALLBACK) MPX.SEATS_FALLBACK.gin = [2, 2, 2];
})();

/* the lobby contract, published for completeness (the 2-seat board
   path never reads it, but lobbyReport() deserves an honest answer) */
window.KARTI_GIN.lobby = {
  id: 'gin', name: 'Gin Rummy', mt: 'Il-Ġin',
  minSeats: 2, maxSeats: 2, defaultLevel: 2,
  levels: LEVELS.map(L => ({ level: L.k, name: L.n, note: L.d })),
  isReady: s => !!(s && (s.kind === 'cpu' || s.ready)),
  autoReady: s => (s && s.kind === 'cpu') ? Object.assign({}, s, { ready: true }) : s,
  canStart: list => (list || []).length === 2
    ? { ok: true, why: '' } : { ok: false, why: 'Gin is a game for exactly two.' },
  rulesHTML: () => '<p>Gin rummy: ten cards each, meld sets and runs, knock at ten ' +
    'deadwood or less, gin for the lot. First to 100, boxes and bonuses counted properly.</p>',
  blurb: 'Ten cards. Knock first.',
  myName,
  start: () => { newGame({ lvl: ST.pref.lvl || 2, target: ST.pref.target || 100 }); return true; },
  wire: { fields: ['i'] },
  takeback: false
};
window.KARTI_GIN.open = () => setupSheet();

/* ── test hooks — inert unless the page is opened with ?pttest ──── */
try {
  if (String(location.search).indexOf('pttest') >= 0) {
    window.__GIN_TEST = {
      M: () => M,
      st: () => (M ? M.st : null),
      arr: () => (M ? M.arr.slice() : null),
      open: o => { setupSheet(); newGame(o || { lvl: 2, target: 100 }); },
      resume: () => { const s = ST.save; if (!s) return false;
        startMatch(s.opts, s.seed, s.log); M.arr = (s.arr || []).slice(); openBoard(); return true; },
      store: () => ST,
      fast: on => { FAST = !!on; },
      doMove, render, E,
      net: { start: onlineStart, remote: onlineRemote }
    };
  }
} catch (e) {}

})();
