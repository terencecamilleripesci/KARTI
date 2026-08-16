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
       and your melds-towards-45 are counted live under the hand,
       with the price of your loose cards beside them.
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

/* ── our corner of localStorage ──────────────────────────────────
   SAVE VERSION 2. The rules changed under this game — house prices,
   the 45 gate, minus scoring — so a v1 save is a log of moves that
   THIS engine would replay into a different match. It is refused,
   with a message on the setup sheet, never silently re-scored. */
const STORE = 'karti_gin_v1';
const SAVE_V = 2;
let oldSaveDropped = false;
let ST = { v: 1, pref: {}, save: null, netArr: null };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object') {
    ST.pref = (j.pref && typeof j.pref === 'object') ? j.pref : {};
    ST.save = (j.save && typeof j.save === 'object') ? j.save : null;
    ST.netArr = (j.netArr && typeof j.netArr === 'object') ? j.netArr : null;
    if (ST.save && ST.save.v !== SAVE_V) { ST.save = null; oldSaveDropped = true; }
    /* old prefs pointed at the knock game's targets (50/100) */
    if (ST.pref.target !== 150 && ST.pref.target !== 300) delete ST.pref.target;
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
  { k: 1, n: 'Iż-żiju',   d: 'Hoards every shiny card he sees. Goes out even at a loss.', i: 'diff-1' },
  { k: 2, n: 'Tal-każin', d: 'Builds properly, but waits to show you a proper score.',    i: 'diff-2' },
  { k: 3, n: 'In-nannu',  d: 'Counts only what is made. Out the moment it pays.',         i: 'diff-3' }
];
const levelName = k => (LEVELS.find(l => l.k === k) || LEVELS[1]).n;

/* the rules card — THE HOUSE GAME, in the owner's own three
   sentences made long enough to play by */
function rulesFor(hand, target) {
  const h = hand === 13 ? 13 : 10;
  const t = target === 150 ? 150 : 300;
  return RULES.map(r => r
    .replace(/\{H\}/g, String(h))
    .replace(/\{T\}/g, String(t)));
}
const RULES = [
  '<b>{H} cards each.</b> Melds are three or four of a rank, or runs of three or more in one suit.',
  'The prices: <b>2 to 9 are worth 5</b> each, <b>10, J, Q and K are worth 10</b>, and the <b>ace is worth 15</b>. Three aces alone are 45.',
  'On your turn <b>take the top discard or draw blind</b> from the stock, then throw one card back. You may not throw back the discard you just took.',
  'You may not put anything down until the melds in your hand are worth <b>45 points or more</b>. That is the whole game: <b>match 45, then put your cards out</b>.',
  'Putting them out <b>ends the hand</b>. Your melds count <b>for</b> you; your loose cards count <b>against</b> you — and the other hand, every card of it, melds included, counts <b>against them</b>. Cards not put down always count minus.',
  'The stock never runs dry: when it is down to its last two cards the pile is shuffled straight back in. <b>Somebody always gets there.</b>',
  'Scores run plus and minus. Sink to <b>−{T}</b> and you have lost the match; reach <b>+{T}</b> and you have won it outright. The floor is the one to watch — the loser of a hand falls about twice what the winner climbs.',
  'At <b>thirteen cards</b> the gate is the same 45 with more cards to build it from — the hand ends sooner, and a caught hand costs half as much again.'
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
    '#scr-party .gn-hand{position:relative;width:100%;flex:0 0 auto;box-sizing:content-box;' +
      '-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}' +
    /* positioned from the TOP, because the rail may be two rows deep at
       thirteen cards and a row has to be able to sit under another one */
    '#scr-party .gn-card{position:absolute;top:0;padding:0;border:0;background:none;line-height:0;' +
      'border-radius:6px;cursor:grab;touch-action:none;-webkit-tap-highlight-color:transparent;' +
      '-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;' +
      'box-shadow:0 2px 4px rgba(0,0,0,.5),0 6px 14px rgba(0,0,0,.35);' +
      'transition:left .16s var(--ease),top .16s var(--ease),transform .16s var(--ease),' +
        'box-shadow .16s var(--ease)}' +
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
  return { v: SAVE_V, seed: M.seed, opts: E.clone(M.opts), log: E.clone(M.log), arr: M.arr.slice() };
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
/* NOTE 'knock' is gone from this list on purpose: a peer still on
   the old build who knocks is refused by name, not humoured. */
const WIRE_OK = { take: 1, pass: 1, draw: 1, disc: 1, down: 1 };
function moveFromWire(d) {
  if (!d || typeof d.a !== 'string' || !WIRE_OK[d.a]) return null;
  const mv = { t: d.a };
  if (d.i != null) {
    const c = d.i | 0;
    if (c < 0 || c > 51) return null;
    mv.c = c;
  }
  if ((mv.t === 'disc' || mv.t === 'down') && mv.c == null) return null;
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
    case 'disc':
      cue('card.throw', { gain: mine ? 0.8 : 0.6, rate: mine ? 1 : 0.95 });
      /* the pile going back into the stock — rare, and worth hearing */
      if (M.st.last && M.st.last.recycled)
        setTimeout(() => cue('card.shuffle', { gain: 0.8 }), FAST ? 1 : 200);
      break;
    case 'down':
      /* the cards going OUT — gin.knock's new home. It used to be the
         knuckle rap of the knock; knocking is gone from this game, and
         two hard raps on heavy timber is exactly the sound of a hand
         being slapped down on the każin table. */
      cue('card.throw', { gain: 0.7 });
      setTimeout(() => cue('gin.knock', { gain: 0.95 }), FAST ? 1 : 180);
      break;
    case 'tally': {
      const row = M.st.match.book[M.st.match.book.length - 1];
      if (!row) break;
      cueRun('pack.tally', 3, 120, { gain: 0.85 });
      if (row.dead) {
        setTimeout(() => cue('money.pay', { gain: 0.8 }), FAST ? 1 : 520);
      } else {
        const won = row.win === M.mySeat;
        const t = FAST ? 1 : 520;
        if (row.out) setTimeout(() => cue('ui.reward', { gain: 0.95 }), t);
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
  M.ctx.badge.textContent = M.st.hs === 13 ? 'Il-Ġin · 13' : 'Il-Ġin';
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
  if (M && M.houseTimer) { clearTimeout(M.houseTimer); M.houseTimer = 0; }
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
  const nb = Math.min(foeS.hand.length, st.hs);
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
  const ready = houseReady();
  const canTake = myGo && ready && (ph === 'up0' || ph === 'up1' || ph === 'main');
  const canDraw = myGo && ready && (ph === 'main' || ph === 'draw1');
  const throwing = myGo && ph === 'off';
  const banned = (st.drew && st.drew.from === 'pile') ? st.drew.c : null;

  let say;
  if (!houseReady()) say = 'Agreeing the house rules with ' + esc(st.seats[1 - me].name) + '…';
  else if (!myGo && t >= 0) say = 'Waiting on ' + esc(st.seats[1 - me].name) + '…';
  else if (ph === 'up0' || ph === 'up1')
    say = 'First card up: <b>' + esc(nameOfCard(up)) + '</b>. Take it, or pass.';
  else if (ph === 'draw1') say = 'Both passed — you <b>draw blind</b> from the stock.';
  else if (ph === 'main') say = 'Take the <b>' + esc(nameOfCard(up)) + '</b>, or draw blind.';
  else if (throwing) {
    say = M.sel != null
      ? (M.sel === banned
          ? 'Not that one — you only just took it off the pile.'
          : 'Throw the <b>' + esc(nameOfCard(M.sel)) + '</b> on the pile' +
            (downFor(M.sel) ? ', or put your cards out' : '') + '.')
      : 'One card too many. <b>Tap one</b> to throw it back — or drag it straight onto the pile.';
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
  if (myGo && houseReady() && (ph === 'up0' || ph === 'up1')) {
    h += '<button type="button" class="gn-act tapme" data-a="take">Take it</button>';
    h += '<button type="button" class="gn-act ghost tapme" data-a="pass">Pass</button>';
  }
  if (throwing && houseReady() && M.sel != null && M.sel !== banned) {
    h += '<button type="button" class="gn-act ghost tapme" data-a="disc">Throw it</button>';
    const dn = downFor(M.sel);
    if (dn)
      h += '<button type="button" class="gn-act hot tapme" data-a="down">' +
        (dn.dw === 0 ? 'ALL OUT · +' + dn.mv
                     : 'Put them out · ' + (dn.net >= 0 ? '+' : '') + dn.net) + '</button>';
  }
  acts.innerHTML = h;
  acts.querySelectorAll('[data-a]').forEach(b => {
    b.onclick = () => act(b.getAttribute('data-a'));
  });
  $id('gn-stock').onclick = () => {
    if (!M || M.dead || !houseReady()) return;
    const stx = M.st, tt = E.turn(stx);
    if (tt !== M.mySeat) return;
    if (stx.phase === 'up0' || stx.phase === 'up1') { nag('Take the upcard or pass — the stock waits.'); return; }
    act('draw');
  };
  $id('gn-pile').onclick = () => {
    if (!M || M.dead || !houseReady()) return;
    const stx = M.st, tt = E.turn(stx);
    if (tt !== M.mySeat) return;
    if (stx.phase === 'off') { if (M.sel != null) act('disc'); return; }
    act('take');
  };
}

/* Online, the hand size is agreed before anything is touched — see
   THE HOUSE SETUP. Offline there is nothing to agree and this is
   always true. */
function houseReady() { return !(M && M.house && !M.house.settled); }

/* what putting the cards out with THIS discard would look like:
   {mv, dw, net} if the 45 gate is open, null if it is not */
function downFor(c) {
  const st = M.st;
  const h = st.seats[M.mySeat].hand;
  if (h.length !== st.hs + 1) return null;
  const rest = h.filter(x => x !== c);
  const b = E.best(rest);
  const mv = E.handPts(rest) - b.dw;
  return mv >= st.open ? { mv, dw: b.dw, net: mv - b.dw } : null;
}

function act(a) {
  if (!M || M.dead) return;
  if (!houseReady()) return;
  const me = M.mySeat;
  let mv = null;
  if (a === 'take') mv = { t: 'take' };
  else if (a === 'pass') mv = { t: 'pass' };
  else if (a === 'draw') mv = { t: 'draw' };
  else if (a === 'disc' || a === 'down') {
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

/* ── the dashboard: melds towards 45, loose cost, sort, nudge ─────
   The number that runs the game is the VALUE OF YOUR MELDS against
   the 45 gate, so that is the number on the dash — with the price
   of your loose cards beside it, because that is what you are
   caught holding. Over-full it shows the best throw's version. */
function dashNums() {
  const st = M.st, hand = st.seats[M.mySeat].hand;
  if (hand.length === st.hs + 1) {
    const banned = (st.drew && st.drew.from === 'pile') ? st.drew.c : null;
    let mv = -1, dw = 0;
    for (const c of hand) {
      if (c === banned) continue;
      const rest = hand.filter(x => x !== c);
      const b = E.best(rest);
      const m = E.handPts(rest) - b.dw;
      if (m > mv || (m === mv && b.dw < dw)) { mv = m; dw = b.dw; }
    }
    return { mv, dw };
  }
  const b = E.best(hand);
  return { mv: E.handPts(hand) - b.dw, dw: b.dw };
}

function paintDash() {
  const st = M.st;
  const n = dashNums();
  const line =
    '<span class="gn-chip' + (n.mv >= st.open ? ' hot' : '') +
      '" aria-label="Your melds are worth ' + n.mv + ' of the ' + st.open + ' you need.">' +
      'Melds <b>' + n.mv + '</b>&thinsp;/&thinsp;' + st.open + '</span>' +
    '<span class="gn-chip" aria-label="Your loose cards would count ' + n.dw + ' against you.">' +
      'Loose <b>&minus;' + n.dw + '</b></span>';
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

/* ── how the hand is laid out ─────────────────────────────────────
   ONE ROW UNTIL A THUMB WOULD SUFFER, THEN TWO.

   The exposed width of a card in a single row is (W - w) / (n - 1),
   and that is the only part of it a thumb can actually land on —
   everything else is under the next card. At ten cards on a 390 the
   sum comes out around 32px, which is fine. At THIRTEEN on a 360 it
   is 24px, and 24px of a 63px-tall card is a target people miss.

   So the rail wraps, the way js/klabb.js's fan does rather than
   squeezing: two rows of seven give 44px of exposed card instead of
   24, nearly double the target for no loss of readability.

   IT ONLY WRAPS IF THE REST OF THE FELT CAN SPARE THE HEIGHT, and
   that is measured rather than assumed. A first attempt allowed two
   rows whenever they fitted in "half the host", and on a 360x640 the
   result was two rows of 101px cards sitting straight on top of the
   discard pile — the rows fitted, and nothing else did. So the
   budget is worked out from what is actually on the felt: the seat
   line and the dashboard as they measure right now, and enough left
   for the two piles and their prompt, which is the one part of the
   screen the game cannot be played without.

   Held sideways the felt is a two-column grid and the hand keeps one
   row, because a landscape rail has width to spare and no height at
   all to give away. */
const MIN_SHOW = 30;         /* px of card that must stay uncovered */
const MIN_TWO_W = 44;        /* below this a second row is not worth it */

function handMetrics() {
  const rail = $id('gn-hand');
  const W = Math.max(200, rail.clientWidth - 8);
  const n = Math.max(1, M.arr.length);
  const hostH = M.ctx.host.clientHeight || 400;
  const gap = 4;
  const lift = hostH < 260 ? 18 : 26;         /* room for a chosen card to rise */

  /* What the rail may actually have, once the felt has been served.
     The middle is MEASURED — the piles, the prompt and the buttons
     really in it, added up — rather than allowed a guessed constant.
     The guess (a pile plus 62px) is how the first attempt put TAKE
     IT and PASS straight on top of the deadwood chip on a 360. */
  const hOf = id => { const el = $id(id); return el ? el.offsetHeight : 0; };
  const mid = $id('gn-mid');
  let minMid = 170;
  if (mid && mid.children.length) {
    let need = 0;
    for (let i = 0; i < mid.children.length; i++) need += mid.children[i].offsetHeight;
    need += 7 * (mid.children.length - 1);            /* the flex gaps */
    /* capped, so that a wordy prompt can never starve the hand */
    minMid = Math.min(Math.max(need, 96), hostH * 0.55);
  }
  /* …and the felt's OWN overhead — its padding and the flex gaps
     between its three bands — measured off the box rather than
     guessed at, because guessing it is what left the prompt sitting
     on the dashboard by a dozen pixels. */
  const felt = $id('gn-felt');
  let chrome = 30;
  if (felt) {
    const cs = getComputedStyle(felt);
    chrome = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) +
             (parseFloat(cs.rowGap) || parseFloat(cs.gap) || 0) * 2 + 6;
  }
  const budget = Math.max(96, hostH - hOf('gn-top') - hOf('gn-dash') - minMid - chrome);

  const plan = rows => {
    const per = Math.ceil(n / rows);
    let w = Math.min(72, Math.floor((W - 4) / (1 + (per - 1) * 0.52)));
    const vCap = (budget - lift - (rows - 1) * gap) / (rows * 1.4);
    w = Math.max(36, Math.min(w, Math.floor(vCap)));
    const h = Math.round(w * 1.4);
    const step = per > 1 ? Math.min(w + 4, (W - 4 - w) / (per - 1)) : 0;
    return { w, h, step, per, rows, x0: 4, gap, lift,
             show: per > 1 ? step : w,
             height: h * rows + (rows - 1) * gap };
  };

  const one = plan(1);
  if (one.show >= MIN_SHOW || n < 8 || hostH < 260) return one;
  const two = plan(2);
  /* a second row of postage stamps is worse than one row of real cards */
  if (two.w < MIN_TWO_W || two.height + lift > budget) return one;
  return two;
}

/* where card `i` sits, in the rail's own coordinates */
function slotXY(m, i) {
  const r = Math.floor(i / m.per);
  const c = i - r * m.per;
  return { x: m.x0 + c * m.step, y: r * (m.h + m.gap) };
}
/* …and the reverse: which slot is under this point */
function slotAt(m, x, y) {
  const r = m.rows > 1
    ? Math.max(0, Math.min(m.rows - 1, Math.floor(y / (m.h + m.gap))))
    : 0;
  const c = m.step > 0 ? Math.round((x - m.x0) / m.step) : 0;
  const n = M.arr.length;
  return Math.max(0, Math.min(n - 1, r * m.per + Math.max(0, Math.min(m.per - 1, c))));
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
      (inMeld ? '. In a meld.' : '. Loose — ' + E.pts(c) + ' against you.') +
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

/* THE FIRST PLACEMENT IS NOT A MOVE, AND MUST NOT ANIMATE.
   paintHand() rebuilds the rail on every render, so every card is a
   brand-new element sitting at the stylesheet's left:0 / top:0 — and
   with left and top both transitioned, each one then SLID into place
   over 160ms. Two things were wrong with that: at thirteen cards the
   second row visibly swept down out of the first on every repaint,
   and for those 160ms a card was not where the layout said it was,
   so a drag begun inside that window measured from the wrong place.
   A cross-row drag test caught it; on a phone it would have been a
   thumb picking up the wrong card.

   So a NEW card is put down with transitions off, one reflow is
   forced for the whole rail, and then they are handed back. Cards
   already on the rail — the ones previewOrder() shuffles about mid
   drag — go on animating, which is the only place the animation was
   ever wanted. */
function layoutHand() {
  const rail = $id('gn-hand');
  if (!rail) return;
  const m = handMetrics();
  /* THE LIFT GOES ABOVE THE CARDS, NOT BELOW THEM. A chosen card
     rises 16px (.gn-card.sel), and with the spare height parked at
     the bottom of the rail it rose straight over the deadwood chip
     and the SORT button. As padding it is room the cards are placed
     BELOW, so the lift has somewhere to go. content-box so the two
     numbers stay independent of the app's global box-sizing. */
  rail.style.boxSizing = 'content-box';
  rail.style.paddingTop = m.lift + 'px';
  rail.style.height = m.height + 'px';
  const els = [];
  rail.querySelectorAll('.gn-card').forEach(el => els.push(el));
  const fresh = els.filter(el => !el.dataset.placed);
  fresh.forEach(el => { el.style.transition = 'none'; });
  els.forEach(el => {
    const p = slotXY(m, +el.dataset.i);
    el.style.width = m.w + 'px';
    el.style.height = m.h + 'px';
    if (!el.classList.contains('drag')) {
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
    }
  });
  if (fresh.length) {
    void rail.offsetWidth;                 /* one flush, not one per card */
    fresh.forEach(el => { el.style.transition = ''; el.dataset.placed = '1'; });
  }
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
      x0: ev.clientX, y0: ev.clientY,
      left0: parseFloat(el.style.left) || 0,
      top0: parseFloat(el.style.top) || 0,
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
    const dy = ev.clientY - d.y0;
    /* the card follows the thumb. In two rows it follows it VERTICALLY
       too, because moving a card between rows is the whole point of
       having them; in one row it only lifts, as it always did. */
    if (d.m.rows > 1) {
      el.style.left = (d.left0 + dx) + 'px';
      el.style.top = (d.top0 + dy) + 'px';
      el.style.transform = 'scale(1.05)';
    } else {
      el.style.left = (d.left0 + dx) + 'px';
      el.style.transform = 'translateY(' +
        Math.max(-46, Math.min(26, dy)) + 'px) scale(1.05)';
    }
    /* where would it land? Measured from the card's own centre in the
       rail's coordinates, so the answer is the same in either layout. */
    const to = slotAt(d.m, d.left0 + dx, d.top0 + dy + d.m.h / 2);
    if (to !== d.to) { d.to = to; previewOrder(d); }
    /* …or onto the pile? */
    const pile = $id('gn-pile');
    if (pile) {
      const r = pile.getBoundingClientRect();
      const over = ev.clientX >= r.left - 8 && ev.clientX <= r.right + 8 &&
                   ev.clientY >= r.top - 8 && ev.clientY <= r.bottom + 8;
      d.onPile = over && houseReady() &&
                 M.st.phase === 'off' && E.turn(M.st) === M.mySeat;
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
    const p = slotXY(d.m, order.indexOf(+el.dataset.c));
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
  });
}

/* ── the hand-end verdict ────────────────────────────────────────── */
function verdictWords(row, me) {
  if (row.dead) return {
    head: 'Nobody got there', bad: true,
    body: 'The pile went round twice and neither of you reached 45. Everything still in a ' +
      'hand counts minus: <b>−' + row.loss[me] + '</b> you, <b>−' + row.loss[1 - me] +
      '</b> them. Somebody deal better.'
  };
  const kName = seatName(row.opener), dName = seatName(1 - row.opener);
  const meWin = row.win === me;
  let head, body;
  if (row.out) {
    head = meWin ? 'ALL OUT!' : 'All out. Theirs.';
    body = '<b>' + esc(kName) + '</b> put out the whole hand — <b>+' + row.meld +
      '</b>, nothing held back. <b>' + esc(dName) + '</b> put down nothing, so the lot counts ' +
      'minus: <b>−' + row.loss + '</b>.';
  } else {
    head = meWin ? 'Cards out' : 'Caught holding';
    body = '<b>' + esc(kName) + '</b> matched 45 and put out <b>' + row.meld +
      '</b> in melds, holding ' + row.loose + ' loose: <b>' +
      (row.gain >= 0 ? '+' : '') + row.gain + '</b>. <b>' + esc(dName) +
      '</b> put down nothing — the whole hand counts minus: <b>−' + row.loss + '</b>.';
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
  const why = 'Points ' + fin.raw[me] + ' to ' + fin.raw[1 - me] +
    ' after ' + fin.hands + ' hand' + (fin.hands === 1 ? '' : 's') +
    (fin.how === 'floor'
      ? ' — ' + (won ? 'they' : 'you') + ' went through the floor at −' + M.st.match.target + '.'
      : ' — over the top at +' + M.st.match.target + '.');
  const quip = won
    ? (fin.how === 'up' ? 'Over the top. Nobody even does that. Frame it.'
                        : 'You did not win so much as watch them sink. Still counts.')
    : (fin.how === 'floor' ? 'Every card you did not put down, counted. That was the deal.'
                           : 'They went over the top. On you, that is practically art.');
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
      '<h3 style="text-align:center">GIN RUMMY' +
        (M && M.st.hs === 13 ? ' · 13' : '') + '</h3>' +
      '<div class="kb-rules" style="margin:12px 0 0;padding:12px 14px;border-radius:14px;' +
        'background:rgba(255,255,255,.04);border:1px solid var(--line)"><ul style="margin:0">' +
        rulesFor(M ? M.st.hs : 10, M ? M.st.match.target : 300)
          .map(r => '<li style="font-size:12px;line-height:1.65;color:var(--dim);margin:0 0 6px 16px">' + r + '</li>').join('') +
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
    hand: opts.hand === 13 ? 13 : 10,
    target: (opts.target === 150 || opts.target === 300) ? opts.target : 300,
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
  let target = (prevOpts && prevOpts.target) || p.target || 300;
  if (target !== 150 && target !== 300) target = 300;
  let hand = ((prevOpts && prevOpts.hand) || p.hand) === 13 ? 13 : 10;

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
        '<p class="blurb">The house game: match <b>45 points of melds</b>, then put your ' +
        'cards out. Aces are 15, courts and tens are 10, the rest are 5 — and every card ' +
        'you are caught still holding <b>counts against you</b>. On your own phone, or ' +
        '<b>each of you on your own</b>.</p>' +
        (oldSaveDropped
          ? '<p class="pt-warn">Your half-played match was under the old knock-and-deadwood ' +
            'rules. The game has changed to the house rules — match 45, put them out — so ' +
            'that save was retired rather than counted wrongly.</p>'
          : '') +
        (online
          ? '<div class="pt-opts" style="margin-bottom:10px">' +
              '<button class="pt-opt" id="gn-online">' + ico('users') +
              '<b>Somebody online</b><i>Open a gin room, or take one that is waiting. ' +
              'The player who opens the room sets the hand size.</i></button>' +
            '</div>'
          : '<p class="pt-warn">Online gin needs the KARTI server to learn the word "gin" — ' +
            'until then it is you against the machine here.</p>') +
        '<div class="tiny pt-lbl">The hand</div>' +
        '<div class="pt-opts" id="gn-hand-opt">' +
          [[10, 'Ten cards', 'The house game as it comes. Match 45, put them out.'],
           [13, 'Thirteen cards', 'More to build 45 from — hands end sooner and a caught hand costs half as much again.']].map(o =>
            '<button class="pt-opt' + (o[0] === hand ? ' on' : '') + '" data-hand="' + o[0] + '">' +
              ico('cards') + '<b>' + o[1] + '</b><i>' + o[2] + '</i></button>').join('') +
        '</div>' +
        '<div class="tiny pt-lbl">The machine</div>' +
        '<div class="pt-opts" id="gn-lvl">' +
          LEVELS.map(o => '<button class="pt-opt' + (o.k === lvl ? ' on' : '') + '" data-lvl="' + o.k + '">' +
            ico(o.i) + '<b>' + esc(o.n) + '</b><i>' + esc(o.d) + '</i></button>').join('') +
        '</div>' +
        '<div class="tiny pt-lbl">The match</div>' +
        '<div class="pt-opts two" id="gn-tgt" style="grid-template-columns:repeat(2,minmax(0,1fr))">' +
          [[150, 'Quick one', 'Sunk at −150. About four hands.'],
           [300, 'The proper game', 'Sunk at −300. About ten.']].map(o =>
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
          rulesFor(hand, target).map(r => '<li style="font-size:12px;line-height:1.65;color:var(--dim);margin:0 0 6px 16px">' + r + '</li>').join('') +
        '</ul></div>' +
      '</div>';
    el.querySelector('#gn-back').onclick = () => P.hub();
    el.querySelectorAll('[data-hand]').forEach(b => b.onclick = () => { hand = +b.dataset.hand; paint(); });
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { lvl = +b.dataset.lvl; paint(); });
    el.querySelectorAll('[data-tgt]').forEach(b => b.onclick = () => { target = +b.dataset.tgt; paint(); });
    el.querySelector('#gn-go').onclick = () => {
      ST.pref.lvl = lvl; ST.pref.target = target; ST.pref.hand = hand; persist();
      newGame({ lvl, target, hand });
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
      ST.pref.lvl = lvl; ST.pref.target = target; ST.pref.hand = hand; persist();
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
function iAmRoomHost() {
  try { return !!window.KARTI_MP.MP.host; } catch (e) { return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   THE HOUSE SETUP — how two phones agree they are playing THE SAME
   GAME, and then on the hand size
   ───────────────────────────────────────────────────────────────────
   The rules of gin CHANGED on this build (the 45 game, house prices,
   minus scoring). The mechanics of the early moves — take, draw,
   throw — are byte-identical to the old build's, so two mismatched
   phones would agree fingerprints right up until one of them scored
   a hand the other refuses to understand. That is the silent-drift
   shape the fingerprint exists to prevent, so it is prevented at the
   door instead:

   1. BOTH PHONES SAY THE NEW WORD FIRST. Every board opens by
      sending {a:'house45', i:hand} — the host with its hand size,
      the guest with 0 as a plain ack. An OLD build receiving
      'house45' refuses it by name ("a move gin rummy does not know
      how to make") and stops the room honestly before a card is
      touched. An old build's own hello — {a:'house'}, or silence —
      is refused here just as honestly (below). Two new builds pass
      each other in the night and play.
   2. THE ROOM'S OPENER IS THE HOUSE. Whoever opened the room plays
      their own setup sheet's hand size; the guest deals ten, waits
      for the hello, and re-deals if the house said thirteen —
      re-dealing is free while the log is empty: same seed, same
      everything, one field different.
   3. THE GUEST DOES NOT TOUCH A CARD UNTIL IT KNOWS. houseReady()
      keeps its thumbs off the felt until the hello has landed. If
      nothing lands, the hello is said once more, and then the board
      stops with the truth: the other phone is on the old rules.
   4. AND THE FINGERPRINT IS THE BACKSTOP. hs and the 45 gate are
      inside it, so even a phone that somehow lied through the hello
      is refused on its very first scored move.
   ═══════════════════════════════════════════════════════════════════ */
const HOUSE_WAIT = 2500;

function onlineStart(o) {
  const seed = netSeed();
  const mySeat = o.colour === 'w' ? 0 : 1;
  const names = mySeat === 0 ? [o.me, o.foe] : [o.foe, o.me];
  const owns = mySeat === 0 ? ['me', 'net'] : ['net', 'me'];
  const host = iAmRoomHost();
  const myHand = ST.pref.hand === 13 ? 13 : 10;
  const hand = host ? myHand : 10;
  startMatch({ lvl: 2, target: 300, names, owns, dealer: 1, hand }, seed);
  M.mySeat = mySeat;
  M.net = o;
  M.house = { settled: host, host, want: hand, tries: 0 };
  M.arr = (ST.netArr && ST.netArr.seed === seed && Array.isArray(ST.netArr.arr))
    ? ST.netArr.arr.slice() : [];
  openBoard();
  P.ui.setNet(M.ctx, o.note || '', '');

  /* the hello — both phones, always (rule 1) */
  try { o.send('move', { a: 'house45', i: host ? hand : 0 }, null); } catch (e) {}
  if (!host) houseClock();
}

function houseClock() {
  M.houseTimer = setTimeout(() => {
    if (!M || M.dead || !M.house || M.house.settled) return;
    M.houseTimer = 0;
    if (M.house.tries++ < 1) {
      /* once more, in case the first hello crossed the join */
      try { M.net.send('move', { a: 'house45', i: 0 }, null); } catch (e) {}
      houseClock();
      return;
    }
    onlineStop('The other phone never said the new hello, which means it is still on ' +
      'the old gin — knocking and deadwood. This build plays the house game: match 45, ' +
      'put them out. Update both phones and deal again. Nothing was scored.', 'cheat');
  }, HOUSE_WAIT);
}

/* the hello, arriving. The host hears an ack; the guest hears the
   hand size and re-deals if the house plays thirteen. */
function houseHello(n) {
  if (!M || !M.house) return { why: 'a house rule with no table under it' };
  if (M.house.host) return null;               /* the guest's ack: nothing to set */
  const want = n === 13 ? 13 : 10;
  if (M.house.settled) return (M.st.hs === want) ? null
    : { why: 'a change of hand size after the deal had started', desync: true };
  if (M.log.length) return { why: 'a change of hand size after the deal had started', desync: true };
  clearTimeout(M.houseTimer); M.houseTimer = 0;
  if (M.st.hs !== want) {
    const o = E.clone(M.opts);
    o.hand = want;
    const seat = M.mySeat, net = M.net, arr = M.arr.slice(), ctx = M.ctx, ro = M.stopRO;
    startMatch(o, M.seed, []);
    M.mySeat = seat; M.net = net; M.arr = arr; M.ctx = ctx; M.stopRO = ro;
  }
  M.house = { settled: true, host: false, want, tries: 0 };
  render();
  return null;
}

function onlineRemote(d) {
  if (!M || M.dead || !M.net) return { why: 'a move with no game on the table' };
  if (E.over(M.st)) return null;                 /* finished; let it lie */
  if (d.kind === 'resign') {
    theyResigned();
    return null;
  }
  if (d.kind !== 'move') return { why: 'a move gin rummy does not have' };

  /* THE HOUSE SETUP FIRST, before the fingerprint is looked at — the
     whole point of the hello is that the two boards do not match yet */
  if (d.m && d.m.a === 'house45') return houseHello(d.m.i | 0);
  /* the OLD build's house packet: a thirteen-card room from the
     knock-game era. Refused by name, not humoured. */
  if (d.m && d.m.a === 'house')
    return { why: 'a gin hand under the OLD rules — knocking and deadwood. This build ' +
      'plays the house game (match 45, put them out): update both phones' };

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
    quip: 'Sometimes the bravest cards are the ones you never put down.',
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
    return 'The house rules: match 45 points of melds, put your cards out, and every card ' +
      'they are still holding counts against them. Aces are 15 — and so is being caught with one.' +
      (ST.save ? ' There is a ' + (ST.save.opts && ST.save.opts.hand === 13 ? 'thirteen-card ' : '') +
                 'match of this half-played.' : '');
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
    blurb: 'Match 45. Put them out.' });
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
  rulesHTML: () => '<p>Gin rummy, house rules: aces 15, courts and tens 10, the rest 5. ' +
    'Match 45 points of melds, then put your cards out — everything still in a hand counts ' +
    'minus. Sunk at \u2212300 loses the match.</p>',
  blurb: 'Match 45. Put them out.',
  myName,
  start: () => { newGame({ lvl: ST.pref.lvl || 2, target: ST.pref.target || 300,
                          hand: ST.pref.hand === 13 ? 13 : 10 }); return true; },
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
      open: o => { setupSheet(); newGame(o || { lvl: 2, target: 300 }); },
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
