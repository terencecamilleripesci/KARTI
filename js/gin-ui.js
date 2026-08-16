/* ═══════════════════════════════════════════════════════════════════
   KARTI — gin-ui.js
   GIN RUMMY, THE HOUSE GAME — the table, the thumbs, and the wire.

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
     · the card faces are js/klabb.js's own SVG deck (KARTI_KLABB
       .deck); the handful of CSS rules those faces need are
       re-declared here under our own scope.
     · persistence lives in karti_gin_v1 and nowhere else.
     · sounds are asked of js/sfx.js by id; audio/ is never touched.

   THE SCREEN, WHICH WAS THE OWNER'S WORRY ("I think it's impossible
   to display all player cards in the field plus the outside pile").
   The answer, in his own words once he found it: "Discard pile
   always available and ur table any time, but there is a spectator
   mode to view other tables." So the MAIN SCREEN carries exactly
   three things, always visible, never covered:
     1. THE SPREAD — every discard, face up, left to right in the
        order thrown, wrapping into rows. It is a RECORD: deck-only
        draws mean nothing in it is ever picked up (the one
        exception, the hand's first turn, lights the newest card
        up). It scrolls when it grows tall, newest rows in view.
     2. YOUR TABLE — your melds, face up, any time.
     3. YOUR HAND — drag to arrange, nothing re-sorts behind your
        back, SORT is a button.
   Everything belonging to the OTHER side lives in SPECTATOR MODE
   (the button says "Tables"), a place you go and leave: it opens
   over the middle band only — your dashboard, your table and your
   hand stay live below it — and you can LAY OFF from inside it,
   because looking at their table and playing onto it is one motion
   ("when u play i need to view all players what card put so u can
   get points and try to empty ur hands"). It is GATED: until your
   own 45 is down you may not look, and the closed door says why.

   HINTS ARE A SETTING, OFF BY DEFAULT. The owner is explicit:
   "dont add help like 'a card can go on terence pile' — those are
   optional for beginners, make it on and off." With hints off the
   tables are shown and nothing is pointed at; reading them is the
   game. The attention penalty (engine rule: an open player may not
   throw away a card that fits the table) is announced honestly when
   it bites — but WHERE the card fits is only ever said with hints
   ON.
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

/* the spread's shape: SEVEN cards a row, the same on every phone, so
   two players looking at their own screens see the same picture.
   Chosen from the real card size: at 360px wide the seven minis are
   still ~40px cards, comfortably readable and never tappable-small
   (they are a record, not buttons). */
const PER_ROW = 7;

/* ── our corner of localStorage ──────────────────────────────────
   SAVE VERSION 3. The rules changed under this game AGAIN — going
   down now OPENS you instead of ending the hand, lay-offs and the
   out bonus exist — so a v1/v2 save is a log of moves this engine
   would replay into a different match. Refused with a message on
   the setup sheet, never silently re-scored. */
const STORE = 'karti_gin_v1';
const SAVE_V = 3;
let oldSaveDropped = false;
let ST = { v: 1, pref: {}, save: null, netArr: null };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object') {
    ST.pref = (j.pref && typeof j.pref === 'object') ? j.pref : {};
    ST.save = (j.save && typeof j.save === 'object') ? j.save : null;
    ST.netArr = (j.netArr && typeof j.netArr === 'object') ? j.netArr : null;
    if (ST.save && ST.save.v !== SAVE_V) { ST.save = null; oldSaveDropped = true; }
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

const hintsOn = () => !!ST.pref.hints;        /* beginner aid, OFF by default */

/* ── the machine, by name — the same three chairs the każin keeps ── */
const LEVELS = [
  { k: 1, n: 'Iż-żiju',   d: 'Hoards every shiny card and calls a pair a plan.',            i: 'diff-1' },
  { k: 2, n: 'Tal-każin', d: 'Builds properly, but sits on his 45 waiting for better.',     i: 'diff-2' },
  { k: 3, n: 'In-nannu',  d: 'Down the moment it pays, and nothing he holds ever fits your table.', i: 'diff-3' }
];
const levelName = k => (LEVELS.find(l => l.k === k) || LEVELS[1]).n;

/* the rules card — THE HOUSE GAME, in the owner's own sentences made
   long enough to play by */
function rulesFor(hand, target) {
  const h = hand === 13 ? 13 : 10;
  const t = target === 150 ? 150 : 300;
  return RULES.map(r => r
    .replace(/\{H\}/g, String(h))
    .replace(/\{T\}/g, String(t))
    .replace(/\{B\}/g, String(E.OUT_BONUS)));
}
const RULES = [
  '<b>{H} cards each.</b> Melds are three or four of a rank, or runs of three or more in one suit.',
  'The prices: <b>2 to 9 are 5</b>, <b>10, J, Q and K are 10</b>, the <b>ace is 15</b>. Three aces are 45 on the nose — so is A-2-3-4 of diamonds with 5-6-7 of clubs.',
  'Every turn: <b>one new card off the deck</b>, then <b>always throw one</b> out. Only the first turn of a hand may take the last thrown card instead.',
  'The thrown cards lie <b>face up, left to right, row under row</b> — a record everyone can read. Nobody picks them up.',
  'Match <b>45 points of melds</b> and put them down, face up, in one go. That <b>opens</b> you — and the hand carries on.',
  'Open players may keep laying: new melds, or single cards onto <b>any meld on the table, theirs or yours</b> — and the points go to <b>whoever laid the card</b>. The fourth ace on their three is your 15.',
  'Open players may also go and <b>look at the other tables</b>; closed players may not. And an open player may <b>not throw away a card that fits the table</b> — the throw is refused. Pay attention.',
  'First hand played <b>empty</b> ends it, and earns <b>+{B}</b>. Everything laid counts <b>for</b> whoever laid it; everything still in a hand counts <b>against</b> its owner — open or not.',
  'Deck dry with nobody out? The thrown cards are shuffled straight back in and it carries on.',
  'First to <b>+{T}</b> takes the match; sink to <b>−{T}</b> and you have lost it on the spot.'
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

    /* ── the other chair: one thin honest line ── */
    '#scr-party .gn-top{flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:6px;' +
      'min-height:34px;flex-wrap:wrap}' +
    '#scr-party .gn-nm{font:900 10px/1.2 var(--disp);letter-spacing:.09em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.72);padding:4px 9px;border-radius:999px;background:rgba(0,0,0,.28);' +
      'border:1px solid rgba(255,255,255,.09);max-width:32%;overflow:hidden;text-overflow:ellipsis;' +
      'white-space:nowrap}' +
    '#scr-party .gn-nm.turn{color:#241800;background:var(--gold);border-color:#FFE9B0}' +
    '#scr-party button.gn-nm{cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    /* the beginner badge: a live count riding the name (hints ON only) */
    '#scr-party .gn-fitn{display:inline-grid;place-items:center;min-width:16px;height:16px;' +
      'margin-left:5px;padding:0 4px;border-radius:999px;font:900 9.5px/1 var(--disp);' +
      'color:#04230F;background:#3DDC84;border:1px solid #8FF0BC;vertical-align:middle}' +
    '#scr-party .gn-backs{display:flex;align-items:center}' +
    '#scr-party .gn-backs .gn-b{width:17px;height:24px;margin-left:-10px;border-radius:3px;' +
      'box-shadow:0 1px 3px rgba(0,0,0,.5);line-height:0}' +
    '#scr-party .gn-backs .gn-b:first-child{margin-left:0}' +
    '#scr-party .gn-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;' +
      'background:rgba(0,0,0,.34);border:1px solid rgba(255,255,255,.12);font:900 9.5px/1 var(--disp);' +
      'letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.78);white-space:nowrap}' +
    '#scr-party .gn-chip b{color:var(--gold);font:inherit}' +
    '#scr-party .gn-chip.hot b{color:#FF8A9B}' +
    '#scr-party .gn-chip.open{background:rgba(61,220,132,.16);border-color:rgba(61,220,132,.45);' +
      'color:#BFF3D6}' +
    '#scr-party .gn-chip.open b{color:#3DDC84}' +
    '#scr-party .gn-specbtn{min-height:28px;padding:0 11px;border-radius:999px;cursor:pointer;' +
      'font:900 9.5px/1 var(--disp);letter-spacing:.1em;text-transform:uppercase;color:var(--txt);' +
      'background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.24);' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .gn-specbtn.locked{opacity:.55}' +

    /* ── the middle band: deck + the spread, the prompt, the buttons ── */
    '#scr-party .gn-mid{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:6px;position:relative;width:100%}' +
    '#scr-party .gn-piles{display:flex;align-items:flex-start;justify-content:center;gap:10px;' +
      'width:100%;min-height:0}' +
    '#scr-party .gn-pilebox{display:flex;flex-direction:column;align-items:center;gap:3px;flex:0 0 auto}' +
    '#scr-party .gn-pilelbl{font:900 8.5px/1 var(--disp);letter-spacing:.14em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.45)}' +
    '#scr-party .gn-pilebtn{position:relative;display:block;width:min(58px,10.5vh);height:min(81px,14.7vh);' +
      'padding:0;border:0;border-radius:7px;background:none;line-height:0;cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent;box-shadow:0 3px 6px rgba(0,0,0,.5),0 8px 18px rgba(0,0,0,.35);' +
      'transition:box-shadow .15s var(--ease),opacity .15s}' +
    '#scr-party .gn-pilebtn.can{box-shadow:0 0 0 2.5px rgba(61,220,132,.85),0 6px 14px rgba(0,0,0,.45)}' +
    '#scr-party .gn-pilebtn.dim{opacity:.5;cursor:default}' +
    '#scr-party .gn-pilebtn .gn-count{position:absolute;right:-7px;top:-7px;z-index:2;min-width:20px;height:20px;' +
      'padding:0 5px;border-radius:999px;display:grid;place-items:center;font:900 9.5px/1 var(--disp);' +
      'color:#241800;background:var(--gold);border:1px solid #FFE9B0;line-height:20px}' +

    /* THE SPREAD — every discard, face up, in the order thrown, seven
       a row, wrapping downward. A record, not a control: the only
       card that is ever a button is the newest one, on the hand's
       first turn. Grows to ~2.4 rows then scrolls, newest in view. */
    '#scr-party .gn-sprbox{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px;' +
      'align-items:stretch}' +
    '#scr-party .gn-spread{display:grid;grid-template-columns:repeat(' + PER_ROW + ',minmax(0,1fr));' +
      'gap:3px;width:100%;overflow-y:auto;overscroll-behavior:contain;border-radius:8px;' +
      'padding:3px;background:rgba(0,0,0,.22);border:1px dashed rgba(255,255,255,.14)}' +
    '#scr-party .gn-dcard{position:relative;aspect-ratio:5/7;border-radius:4px;line-height:0;padding:0;' +
      'border:0;background:none;box-shadow:0 1px 3px rgba(0,0,0,.45)}' +
    '#scr-party button.gn-dcard{cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .gn-dcard.up{box-shadow:0 0 0 2px rgba(61,220,132,.85),0 2px 6px rgba(0,0,0,.5)}' +
    '#scr-party .gn-dcard.drop{box-shadow:0 0 0 2px var(--gold),0 2px 6px rgba(0,0,0,.5)}' +
    '#scr-party .gn-spread:empty{min-height:34px}' +
    '#scr-party .gn-spread.drop{border-color:var(--gold);background:rgba(255,197,66,.08)}' +

    '#scr-party .gn-say{font:700 11.5px/1.5 var(--body);color:rgba(255,255,255,.85);text-align:center;' +
      'padding:0 10px;max-width:360px;min-height:17px}' +
    '#scr-party .gn-say b{color:var(--gold);font-weight:900}' +
    '#scr-party .gn-acts{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;min-height:0}' +
    '#scr-party .gn-act{min-height:42px;padding:0 15px;border-radius:12px;font:900 11px/1 var(--disp);' +
      'letter-spacing:.08em;text-transform:uppercase;color:#241800;' +
      'background:linear-gradient(180deg,#FFD979,var(--gold));border:1px solid #FFE9B0;' +
      'box-shadow:0 3px 0 -1px rgba(0,0,0,.4);cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .gn-act.ghost{color:var(--txt);background:rgba(255,255,255,.08);' +
      'border-color:rgba(255,255,255,.2);box-shadow:none}' +
    '#scr-party .gn-act.hot{color:#2A0700;background:linear-gradient(180deg,#FF7154,var(--hot));' +
      'border-color:#FFA894}' +
    '#scr-party .gn-act[disabled]{opacity:.4;cursor:default}' +
    '#scr-party .gn-act:not([disabled]):active{transform:translateY(2px);box-shadow:none}' +

    /* ── YOUR TABLE — always on screen once you are open ── */
    '#scr-party .gn-tbl{flex:0 0 auto;display:flex;align-items:center;gap:7px;width:100%;' +
      'padding:4px 5px;border-radius:10px;background:rgba(0,0,0,.2);' +
      'border:1px solid rgba(255,255,255,.09)}' +
    '#scr-party .gn-tbl .gn-tlbl{flex:0 0 auto;display:flex;flex-direction:column;gap:2px;' +
      'font:900 8.5px/1.2 var(--disp);letter-spacing:.1em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.5)}' +
    '#scr-party .gn-tbl .gn-tlbl b{color:#3DDC84;font:900 12px/1 var(--disp)}' +
    '#scr-party .gn-melds{display:flex;flex-wrap:wrap;gap:6px 9px;align-items:center;flex:1 1 auto;' +
      'min-width:0;max-height:96px;overflow-y:auto;overscroll-behavior:contain}' +
    '#scr-party .gn-meld{display:flex;padding:0;border:0;background:none;line-height:0;cursor:pointer;' +
      'border-radius:5px;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .gn-meld .gn-mc{width:27px;height:38px;margin-left:-15px;border-radius:3.5px;' +
      'box-shadow:0 1px 3px rgba(0,0,0,.5);line-height:0;background:#FCF7EA}' +
    '#scr-party .gn-meld .gn-mc:first-child{margin-left:0}' +
    '#scr-party .gn-meld.fit{box-shadow:0 0 0 2.5px rgba(61,220,132,.9);border-radius:6px}' +
    '#scr-party .gn-meld.closed{opacity:.88}' +
    '#scr-party .gn-meld.flash{animation:gn-flash .5s var(--ease)}' +
    '@keyframes gn-flash{0%{transform:scale(1)}35%{transform:scale(1.12)}100%{transform:scale(1)}}' +

    /* ── SPECTATOR MODE — over the middle band only: your dash, your
       table and your hand stay live below it ── */
    '#scr-party .gn-spec{position:absolute;inset:0;z-index:12;display:flex;flex-direction:column;' +
      'gap:6px;padding:8px;border-radius:12px;' +
      'background:linear-gradient(180deg,#151024 0%,#0D0918 100%);' +
      'border:1px solid rgba(255,255,255,.16);box-shadow:0 14px 34px rgba(0,0,0,.6)}' +
    '#scr-party .gn-spec h4{margin:0;font:900 11px/1.3 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--gold);display:flex;align-items:center;gap:8px;' +
      'justify-content:space-between}' +
    '#scr-party .gn-spec .gn-sphead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
    '#scr-party .gn-spec .gn-spbody{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;' +
      'display:flex;flex-direction:column;gap:8px}' +
    '#scr-party .gn-spec .gn-melds{max-height:none}' +
    '#scr-party .gn-spec .gn-meld .gn-mc{width:34px;height:48px;margin-left:-17px}' +
    '#scr-party .gn-spec .gn-meld .gn-mc:first-child{margin-left:0}' +
    '#scr-party .gn-spec .gn-note{font:700 11px/1.5 var(--body);color:var(--dim)}' +
    '#scr-party .gn-spec .gn-note b{color:var(--txt)}' +
    '#scr-party .gn-hintchip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;' +
      'border-radius:999px;background:rgba(61,220,132,.14);border:1px solid rgba(61,220,132,.4);' +
      'font:900 10px/1 var(--disp);letter-spacing:.06em;color:#BFF3D6;cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent}' +

    /* the refused throw: a shake, not a modal */
    '#scr-party .gn-card.deny{animation:gn-deny .4s var(--ease)}' +
    '@keyframes gn-deny{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}' +
      '55%{transform:translateX(6px)}80%{transform:translateX(-3px)}}' +

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
    /* price tag on loose cards */
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

    /* short phones: the same felt, tightened */
    '@media (max-height:640px){' +
      '#scr-party .gn-top{min-height:26px}' +
      '#scr-party .gn-mid{gap:4px}' +
      '#scr-party .gn-say{font-size:10.5px;min-height:0}' +
      '#scr-party .gn-act{min-height:36px;padding:0 12px}' +
      '#scr-party .gn-melds{max-height:52px}' +
      '#scr-party .gn-meld .gn-mc{width:23px;height:32px;margin-left:-13px}}' +
    /* SIDEWAYS — both orientations are first-class here. The felt
       becomes a two-column grid: the seats, your table and your hand
       on the left; the deck, the spread, the prompt and the buttons
       in a column on the right. Spectator mode still opens over the
       right column only, so the hand stays live. */
    '@media (max-height:480px){' +
      '#scr-party .gn-felt{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);' +
        'grid-template-rows:auto auto minmax(0,1fr);gap:4px 10px;padding:6px 8px 5px;' +
        'grid-template-areas:"top mid" "tbl mid" "me mid";align-items:center}' +
      '#scr-party .gn-top{grid-area:top;min-height:22px;gap:6px;justify-content:flex-start}' +
      '#scr-party .gn-mid{grid-area:mid;gap:5px;align-self:stretch;justify-content:flex-start;' +
        'padding-top:2px}' +
      '#scr-party .gn-tbl{grid-area:tbl;align-self:start}' +
      '#scr-party .gn-me{grid-area:me;gap:2px;align-self:end}' +
      '#scr-party .gn-backs .gn-b{width:14px;height:20px;margin-left:-8px}' +
      '#scr-party .gn-pilelbl{display:none}' +
      '#scr-party .gn-pilebtn{width:min(46px,12vh);height:min(64px,16.8vh)}' +
      '#scr-party .gn-pilebtn .gn-count{min-width:17px;height:17px;line-height:17px;font-size:9px}' +
      '#scr-party .gn-piles{gap:6px}' +
      '#scr-party .gn-say{max-width:none;font-size:10px;line-height:1.4}' +
      '#scr-party .gn-acts{gap:5px}' +
      '#scr-party .gn-dash{min-height:22px;justify-content:flex-start}' +
      '#scr-party .gn-melds{max-height:44px}' +
      '#scr-party .gn-act{min-height:30px;font-size:10px;padding:0 10px}' +
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
    spec: false,                      /* spectator mode open? */
    timer: 0, dead: false, finished: false, net: null
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
  if (mv.t === 'meld') w.k = mv.cs.slice();
  else if (mv.t === 'lay') { w.i = mv.c | 0; w.j = mv.m | 0; }
  else if (mv.c != null) w.i = mv.c | 0;
  return w;
}
/* NOTE what is NOT in this list, on purpose: 'knock' (the knock game
   died two builds ago) and the sweep-era indexed take. A peer still
   on either build is refused by name, not humoured. */
const WIRE_OK = { take: 1, draw: 1, disc: 1, down: 1, meld: 1, lay: 1 };
function moveFromWire(d) {
  if (!d || typeof d.a !== 'string' || !WIRE_OK[d.a]) return null;
  const mv = { t: d.a };
  if (d.a === 'meld') {
    if (!Array.isArray(d.k) || d.k.length < 3 || d.k.length > 13) return null;
    const cs = [];
    for (const x of d.k) {
      const c = x | 0;
      if (c < 0 || c > 51) return null;
      cs.push(c);
    }
    mv.cs = cs;
  } else if (d.a === 'lay') {
    if (d.i == null || d.j == null) return null;
    const c = d.i | 0, m = d.j | 0;
    if (c < 0 || c > 51 || m < 0 || m > 255) return null;
    mv.c = c; mv.m = m;
  } else if (d.a === 'disc' || d.a === 'down') {
    if (d.i == null) return null;
    const c = d.i | 0;
    if (c < 0 || c > 51) return null;
    mv.c = c;
  }
  return mv;
}

/* offline undo: back to just before the last thing I did (repeat
   presses walk back through a lay chain one placement at a time) */
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
      /* the spread going back into the deck — worth hearing */
      if (M.st.last && M.st.last.recycled)
        setTimeout(() => cue('card.shuffle', { gain: 0.8 }), FAST ? 1 : 200);
      break;
    case 'down':
      /* the 45 hitting the table — gin.knock's home: two hard raps
         on heavy timber is exactly a hand being slapped down open */
      cue('card.throw', { gain: 0.7 });
      setTimeout(() => cue('gin.knock', { gain: 0.95 }), FAST ? 1 : 180);
      break;
    case 'meld':
      cue('card.throw', { gain: mine ? 0.7 : 0.55 });
      break;
    case 'lay':
      /* a single card finding its home — somebody just made points,
         possibly off somebody else's meld */
      cue('card.deal', { gain: mine ? 0.8 : 0.6, rate: 1.05 });
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
        setTimeout(() => cue('ui.reward', { gain: 0.9 }), t);
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
  /* the machine. A lay chain gets a quicker beat than a decision, so
     laying four cards reads as placing them one after another. */
  const laying = st.phase === 'act' && st.down[t];
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
  }, FAST ? 1 : (laying ? 420 : 650) + Math.floor(Math.random() * (laying ? 200 : 500)));
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
      '<div class="gn-tbl" id="gn-tbl" aria-label="Your table" style="display:none"></div>' +
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

  paintTop();
  paintMid();
  paintTable();
  paintDash();
  paintHand();
  paintSpec();
  paintVerdict();

  if (ov) { finish(); return; }
  step();
}

/* ── the other chair: name, cards, open state, the door to their
   table. Their MELDS are not here — they are in spectator mode,
   which is the point of it. ── */
function paintTop() {
  const st = M.st, me = M.mySeat, foe = 1 - me;
  const t = E.turn(st);
  const foeS = st.seats[foe];
  let backs = '';
  const nb = Math.min(foeS.hand.length, 14);
  for (let i = 0; i < nb; i++) backs += '<span class="gn-b" aria-hidden="true">' + backHTML() + '</span>';
  /* THE BEGINNER BADGE, his own design: "it will show a popup on
     player name… when click it will show. this mode is for
     beginners. But dont leave it default." Hints ON and you are
     open: the name carries a live count of YOUR cards that fit
     THEIR melds — recomputed every paint, so it can never go stale.
     Zero shows nothing. Hints OFF (the default, the real game):
     never a badge; reading the table is your job, and the discard
     refusal is what enforces it. Same calculation either way — the
     toggle only decides whether it is shown. */
  let fitBadge = '';
  if (hintsOn() && st.down[me]) {
    let nFit = 0;
    for (const c of st.seats[me].hand)
      if (layTargets(c).some(ti => st.table[ti].by === foe)) nFit++;
    if (nFit > 0)
      fitBadge = ' <b class="gn-fitn" aria-label="' + nFit + ' of your cards fit their melds. ' +
        'Tap to see.">' + nFit + '</b>';
  }
  $id('gn-top').innerHTML =
    '<button type="button" class="gn-nm tapme' + (t === foe ? ' turn' : '') + '" id="gn-foenm" ' +
      'aria-label="' + esc(foeS.name) + '. Tap to look at their table.">' +
      esc(foeS.name) + fitBadge + '</button>' +
    '<span class="gn-backs" aria-label="' + foeS.hand.length + ' cards in their hand">' + backs + '</span>' +
    (st.down[foe]
      ? '<span class="gn-chip open" aria-label="They are open with ' + st.laid[foe] +
          ' points laid.">Open <b>+' + st.laid[foe] + '</b></span>'
      : '<span class="gn-chip" aria-label="They have not put their 45 down.">Closed</span>') +
    '<span class="gn-chip" aria-label="Match score: you ' + st.match.pts[me] + ', them ' +
      st.match.pts[foe] + '">You <b>' + st.match.pts[me] + '</b> · them <b>' +
      st.match.pts[foe] + '</b></span>' +
    '<button type="button" class="gn-specbtn tapme' + (st.down[me] ? '' : ' locked') + '" id="gn-spec-btn" ' +
      'aria-label="' + (st.down[me] ? 'Look at the other tables.'
        : 'Locked. Put your 45 down to see the other tables.') + '">Tables</button>';
  const goSpec = () => {
    if (!M) return;
    /* THE GATE, in one honest line: no table for closed eyes */
    if (!M.st.down[M.mySeat]) {
      cue('ui.error', { gain: 0.7 });
      const say = $id('gn-say');
      if (say) say.innerHTML = 'Put your <b>45 down</b> first — then you may go and look at the other tables.';
      return;
    }
    M.spec = !M.spec;
    cue('ui.tap', { gain: 0.8 });
    render();
  };
  $id('gn-spec-btn').onclick = goSpec;
  $id('gn-foenm').onclick = goSpec;              /* the badge's click-to-see */
}

/* ── the middle band: the deck, the spread, the prompt, the acts ── */
function paintMid() {
  const st = M.st, me = M.mySeat;
  const t = E.turn(st);
  const myGo = t === me;
  const ph = st.phase;
  const ready = houseReady();
  const canDraw = myGo && ready && ph === 'main' && st.stock.length > 0;
  const canUp = myGo && ready && ph === 'main' && E.canTakeUp(st);
  const acting = myGo && ready && ph === 'act';
  const banned = E.bannedOf(st, me);
  const iDown = st.down[me];

  let say;
  if (!ready) say = 'Agreeing the house rules with ' + esc(st.seats[1 - me].name) + '…';
  else if (!myGo && t >= 0) say = 'Waiting on ' + esc(st.seats[1 - me].name) + '…';
  else if (ph === 'main') {
    say = canUp
      ? 'First turn: take the <b>' + esc(nameOfCard(E.upTop(st))) + '</b> — or draw blind. After this, the deck only.'
      : 'Draw your card off the <b>deck</b>.';
  } else if (acting) {
    if (M.sel != null) {
      if (M.sel === banned) say = 'Not that one — you only just took it. Throw another.';
      else {
        const dn = !iDown ? downFor(M.sel) : null;
        say = 'Throw the <b>' + esc(nameOfCard(M.sel)) + '</b>' +
          (dn ? ' — or put your <b>45 down</b> with it out' : '') +
          (iDown ? ' — or tap a meld to lay it there' : '') + '.';
      }
    } else {
      say = iDown
        ? 'Lay what you can — melds down, cards onto any table — then <b>throw one</b>.'
        : 'Now <b>throw one back</b>. Tap a card' + (bestOpenNow() ? ' — your <b>45 is ready</b>' : '') + '.';
    }
  } else say = '';

  /* the spread, oldest top-left, newest last. Only the newest card is
     ever a button, and only on the hand's first turn. */
  let spread = '';
  const L = st.discard.length;
  for (let i = 0; i < L; i++) {
    const c = st.discard[i];
    const newest = i === L - 1;
    if (newest && canUp)
      spread += '<button type="button" class="gn-dcard up tapme" id="gn-upbtn" ' +
        'aria-label="Take the ' + esc(nameOfCard(c)) + ' — first turn only.">' + faceHTML(c) + '</button>';
    else
      spread += '<span class="gn-dcard" aria-hidden="true">' + faceHTML(c) + '</span>';
  }

  $id('gn-mid').innerHTML =
    '<div class="gn-piles">' +
      '<div class="gn-pilebox"><span class="gn-pilelbl">Deck</span>' +
        '<button type="button" class="gn-pilebtn tapme' + (canDraw ? ' can' : (myGo && ph === 'act' ? ' dim' : '')) + '" id="gn-stock" ' +
          'aria-label="Draw a blind card from the deck. ' + st.stock.length + ' left."' +
          (canDraw ? '' : ' aria-disabled="true"') + '>' +
          backHTML() + '<span class="gn-count">' + st.stock.length + '</span></button></div>' +
      '<div class="gn-sprbox"><span class="gn-pilelbl">Thrown · oldest to newest · nobody picks these up</span>' +
        '<div class="gn-spread" id="gn-pile" aria-label="The thrown cards, ' + L + ' of them, in the order they went.">' +
        spread + '</div></div>' +
    '</div>' +
    '<div class="gn-say" id="gn-say" role="status" aria-live="polite">' + say + '</div>' +
    '<div class="gn-acts" id="gn-acts"></div>';

  /* the spread scrolls to its newest rows, and its height is capped
     so it can never push the hand off the felt */
  const sp = $id('gn-pile');
  if (sp) {
    const cardH = (sp.clientWidth / PER_ROW) * 1.4;
    const hostH = M.ctx.host.clientHeight || 500;
    sp.style.maxHeight = Math.max(46, Math.min(cardH * 2.4, hostH * 0.28)) + 'px';
    sp.scrollTop = sp.scrollHeight;
  }

  /* the action row: honest buttons under the same taps */
  const acts = $id('gn-acts');
  let h = '';
  if (canUp) {
    h += '<button type="button" class="gn-act tapme" data-a="take">Take it</button>';
    h += '<button type="button" class="gn-act ghost tapme" data-a="draw">Draw blind</button>';
  }
  if (acting) {
    if (!iDown) {
      const op = M.sel != null ? downFor(M.sel) : null;
      if (M.sel != null && M.sel !== banned)
        h += '<button type="button" class="gn-act ghost tapme" data-a="disc">Throw it</button>';
      if (op)
        h += '<button type="button" class="gn-act hot tapme" data-a="down">Put the 45 down · +' + op.mv + '</button>';
      else if (M.sel == null && bestOpenNow())
        h += '<button type="button" class="gn-act hot tapme" data-a="downbest">Put the 45 down</button>';
    } else {
      const meldable = meldsInHand();
      if (meldable.pts > 0)
        h += '<button type="button" class="gn-act tapme" data-a="meldall">Melds down · +' + meldable.pts + '</button>';
      if (M.sel != null && M.sel !== banned)
        h += '<button type="button" class="gn-act ghost tapme" data-a="disc">Throw it</button>';
      if (hintsOn() && M.sel != null && layTargets(M.sel).length)
        h += '<button type="button" class="gn-act hot tapme" data-a="layhint">Lay it · +' + E.pts(M.sel) + '</button>';
    }
  }
  acts.innerHTML = h;
  acts.querySelectorAll('[data-a]').forEach(b => {
    b.onclick = () => act(b.getAttribute('data-a'));
  });
  $id('gn-stock').onclick = () => {
    if (!M || M.dead || !houseReady()) return;
    const stx = M.st, tt = E.turn(stx);
    if (tt !== M.mySeat) return;
    if (stx.phase === 'act') { nag('You have your card — now throw one.'); return; }
    act('draw');
  };
  const upb = $id('gn-upbtn');
  if (upb) upb.onclick = () => act('take');
}

/* Online, the hand size is agreed before anything is touched — see
   THE HOUSE SETUP. Offline there is nothing to agree and this is
   always true. */
function houseReady() { return !(M && M.house && !M.house.settled); }

/* what OPENING with THIS discard would put down: {mv, dw} if the 45
   gate is open with it, null if not */
function downFor(c) {
  const st = M.st;
  if (st.down[M.mySeat]) return null;
  const h = st.seats[M.mySeat].hand;
  const rest = h.filter(x => x !== c);
  const b = E.best(rest);
  const mv = E.handPts(rest) - b.dw;
  return mv >= st.open ? { mv, dw: b.dw } : null;
}
function bestOpenNow() {
  const st = M.st;
  if (st.phase !== 'act' || st.down[M.mySeat]) return null;
  return E.bestOpen(st, st.seats[M.mySeat].hand);
}

/* every full meld sitting in my hand right now (the ones "Melds
   down" would lay), and their worth */
function meldsInHand() {
  const st = M.st, h = st.seats[M.mySeat].hand;
  if (!st.down[M.mySeat] || h.length < 4) return { melds: [], pts: 0 };
  const b = E.best(h);
  const melds = b.melds.filter(m => h.length - m.length >= 1);
  let pts = 0;
  /* they are laid one after another; re-solve the shrinking hand so
     the promise matches what the button will actually do */
  let rest = h.slice(), out = [];
  for (;;) {
    const bb = E.best(rest);
    const m = bb.melds.find(x => rest.length - x.length >= 1);
    if (!m) break;
    out.push(m);
    pts += E.handPts(m);
    const S = new Set(m);
    rest = rest.filter(c => !S.has(c));
  }
  return { melds: out, pts };
}

/* table melds this card could go onto, as st.table indices */
function layTargets(c) {
  const st = M.st, me = M.mySeat;
  const out = [];
  for (let ti = 0; ti < st.table.length; ti++)
    if ((E.LAY_ON_FOE || st.table[ti].by === me) && E.canExtend(st.table[ti].cs, c))
      out.push(ti);
  return out;
}

function act(a) {
  if (!M || M.dead) return;
  if (!houseReady()) return;
  const me = M.mySeat;
  let mv = null;
  if (a === 'take') mv = { t: 'take' };
  else if (a === 'draw') mv = { t: 'draw' };
  else if (a === 'disc') {
    if (M.sel == null) return;
    mv = { t: 'disc', c: M.sel };
  } else if (a === 'down') {
    if (M.sel == null) return;
    mv = { t: 'down', c: M.sel };
  } else if (a === 'downbest') {
    const op = bestOpenNow();
    if (!op) return;
    mv = { t: 'down', c: op.c };
  } else if (a === 'meldall') {
    /* the whole chain, one honest button: every full meld goes down */
    let n = 0;
    for (;;) {
      const lm = E.nextLay(M.st, me);
      if (!lm || lm.t !== 'meld') break;
      if (!doMove(me, lm, 'tap').ok) break;
      n++;
      if (n > 20) break;
    }
    if (n) { M.sel = null; render(); }
    return;
  } else if (a === 'layhint') {
    /* hints ON only: lay the chosen card on the first place it fits */
    if (M.sel == null) return;
    const ts = layTargets(M.sel);
    if (!ts.length) return;
    mv = { t: 'lay', c: M.sel, m: ts[0] };
  }
  if (!mv) return;
  const r = doMove(me, mv, 'tap');
  if (!r.ok) {
    denySay(mv);
    return;
  }
  if (mv.t !== 'lay') M.sel = null;
  else M.sel = null;
  render();
}

/* the honest refusal: WHY was that not allowed? The attention
   penalty is announced but never located (unless hints are on —
   finding the spot is the game). */
function denySay(mv) {
  cue('ui.error', { gain: 0.9 });
  const st = M.st, me = M.mySeat;
  if (mv.t === 'disc' && mv.c != null && E.discRefused(st, me, mv.c)) {
    shakeCard(mv.c);
    if (hintsOn()) {
      const ts = layTargets(mv.c);
      const t0 = ts.length ? st.table[ts[0]] : null;
      nag('That card fits ' + (t0 ? (t0.by === me ? 'your own' : esc(st.seats[t0.by].name) + '’s') : 'a') +
        ' meld — lay it, you cannot throw it away.');
    } else {
      nag('Refused: that card has a home on the table. Find it — or throw something else.');
    }
    return;
  }
  if (mv.t === 'disc' && mv.c === E.bannedOf(st, me)) {
    nag('You cannot throw back the card you just took.');
    return;
  }
  if (mv.t === 'lay') { nag('It does not fit there.'); return; }
  nag(null);
}

function shakeCard(c) {
  const el = M.ctx.host.querySelector('.gn-card[data-c="' + c + '"]');
  if (!el) return;
  el.classList.remove('deny');
  void el.offsetWidth;
  el.classList.add('deny');
}

function nag(text) {
  if (K.toast) K.toast('⚠ ' + (text || 'The rules said no. Take it up with the rules.'));
}

/* ── YOUR TABLE — the melds you have down, always visible ───────── */
function paintTable() {
  const st = M.st, me = M.mySeat;
  const box = $id('gn-tbl');
  if (!box) return;
  const mine = [];
  st.table.forEach((t, ti) => { if (t.by === me) mine.push(ti); });
  if (!st.down[me] && !mine.length) { box.style.display = 'none'; return; }
  box.style.display = '';
  let h = '<span class="gn-tlbl">Your<br>table<b>+' + st.laid[me] + '</b></span>' +
    '<div class="gn-melds" id="gn-mymelds">';
  for (const ti of mine) h += meldHTML(st.table[ti], ti);
  h += '</div>';
  box.innerHTML = h;
  wireMeldTaps(box);
}

function meldHTML(t, ti) {
  const closed = t.cs.length === 4 && E.isSet(t.cs);
  let cards = '';
  for (const c of t.cs) cards += '<span class="gn-mc">' + faceHTML(c) + '</span>';
  const fit = hintsOn() && M.sel != null && E.canExtend(t.cs, M.sel) &&
              (E.LAY_ON_FOE || t.by === M.mySeat);
  return '<button type="button" class="gn-meld tapme' + (closed ? ' closed' : '') +
    (fit ? ' fit' : '') + '" data-ti="' + ti + '" aria-label="' +
    esc(t.cs.map(nameOfCard).join(', ')) + (closed ? '. Closed.' : '') + '">' + cards + '</button>';
}

/* tapping a meld with a card chosen tries to LAY it there — the
   attempt is always allowed; the rules answer. With hints off
   nothing is highlighted first: reading the table is the game. */
function wireMeldTaps(root) {
  root.querySelectorAll('.gn-meld').forEach(el => {
    el.onclick = () => {
      if (!M || M.dead || !houseReady()) return;
      const st = M.st, me = M.mySeat;
      const ti = +el.dataset.ti;
      if (M.sel == null) {
        if (E.turn(st) === me && st.phase === 'act' && st.down[me])
          nag('Pick the card in your hand first, then tap where it goes.');
        return;
      }
      if (E.turn(st) !== me || st.phase !== 'act' || !st.down[me]) {
        nag(st.down[me] ? 'Not now — finish your pick first.' : 'You are not open yet.');
        return;
      }
      const mv = { t: 'lay', c: M.sel, m: ti };
      const r = doMove(me, mv, 'tap');
      if (!r.ok) { denySay(mv); return; }
      M.sel = null;
      const again = M.ctx.host.querySelector('.gn-meld[data-ti="' + ti + '"]');
      if (again) { again.classList.add('flash'); }
      render();
    };
  });
}

/* ── SPECTATOR MODE — the other tables, and the thumb that plays
   onto them. Opens over the middle band only. ── */
function paintSpec() {
  const mid = $id('gn-mid');
  if (!mid) return;
  const old = mid.querySelector('.gn-spec');
  if (old) old.remove();
  if (!M.spec) return;
  const st = M.st, me = M.mySeat, foe = 1 - me;
  if (!st.down[me]) { M.spec = false; return; }   /* the gate re-checks itself */

  const foeMelds = [];
  st.table.forEach((t, ti) => { if (t.by === foe) foeMelds.push(ti); });

  let body = '';
  body += '<div class="gn-note"><b>' + esc(st.seats[foe].name) + '</b> — ' +
    (st.down[foe] ? ('open, <b>+' + st.laid[foe] + '</b> laid, ' + st.seats[foe].hand.length + ' cards in hand.')
                  : 'not open yet: nothing on their table.') + '</div>';
  if (foeMelds.length) {
    body += '<div class="gn-melds">';
    for (const ti of foeMelds) body += meldHTML(st.table[ti], ti);
    body += '</div>';
  }
  /* the beginner aid, and ONLY with hints on: what of yours fits
     where. With hints off the tables are shown and nothing more. */
  if (hintsOn()) {
    const plays = [];
    for (const c of st.seats[me].hand)
      for (const ti of layTargets(c))
        plays.push({ c, ti });
    if (E.turn(st) === me && st.phase === 'act') {
      body += plays.length
        ? '<div class="gn-note">You could lay: ' + plays.map(p =>
            '<button type="button" class="gn-hintchip tapme" data-hc="' + p.c + '" data-hti="' + p.ti +
            '">' + esc(txtOf(p.c)) + ' → ' + esc(seatName(st.table[p.ti].by)) + '</button>').join(' ') + '</div>'
        : '<div class="gn-note">Nothing of yours fits any table right now.</div>';
    }
  }

  const div = document.createElement('div');
  div.className = 'gn-spec';
  div.innerHTML =
    '<h4><span>The tables</span>' +
      '<button type="button" class="gn-specbtn tapme" id="gn-spec-x">Back</button></h4>' +
    '<div class="gn-spbody">' + body + '</div>';
  mid.appendChild(div);
  div.querySelector('#gn-spec-x').onclick = () => { M.spec = false; cue('ui.tap', { gain: 0.7 }); render(); };
  wireMeldTaps(div);
  div.querySelectorAll('[data-hc]').forEach(b => {
    b.onclick = () => {
      const mv = { t: 'lay', c: +b.dataset.hc, m: +b.dataset.hti };
      const r = doMove(M.mySeat, mv, 'tap');
      if (!r.ok) { denySay(mv); return; }
      M.sel = null;
      render();                                  /* updates in place; mode stays open */
    };
  });
}

/* ── the dashboard: the numbers that run the game ────────────────
   Closed: your melds against the 45 gate, and the price of your
   loose cards. Open: what you have laid, against what you are still
   holding (which is what counts minus if somebody goes out). */
function dashNums() {
  const st = M.st, hand = st.seats[M.mySeat].hand;
  if (st.down[M.mySeat]) return { open: true, laid: st.laid[M.mySeat], held: E.handPts(hand) };
  if (st.phase === 'act' && E.turn(st) === M.mySeat) {
    /* over-full: show the best throw's version */
    let mv = -1, dw = 0;
    for (const c of hand) {
      const rest = hand.filter(x => x !== c);
      const b = E.best(rest);
      const m = E.handPts(rest) - b.dw;
      if (m > mv || (m === mv && b.dw < dw)) { mv = m; dw = b.dw; }
    }
    return { open: false, mv, dw };
  }
  const b = E.best(hand);
  return { open: false, mv: E.handPts(hand) - b.dw, dw: b.dw };
}

function paintDash() {
  const st = M.st;
  const n = dashNums();
  const line = n.open
    ? '<span class="gn-chip open" aria-label="You are open with ' + n.laid + ' points laid.">' +
        'Laid <b>+' + n.laid + '</b></span>' +
      '<span class="gn-chip" aria-label="The cards still in your hand would count ' + n.held +
        ' against you.">Hand <b>&minus;' + n.held + '</b></span>'
    : '<span class="gn-chip' + (n.mv >= st.open ? ' hot' : '') +
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
   ONE ROW UNTIL A THUMB WOULD SUFFER, THEN TWO. The exposed width of
   a card in one row is (W - w)/(n - 1); below MIN_SHOW the rail
   wraps to two rows instead of squeezing. It only wraps if the rest
   of the felt can spare the height, and that is MEASURED — the seat
   line, the dashboard, your table strip and the real contents of the
   middle band as they stand — not assumed. Held sideways the felt is
   a two-column grid and the hand keeps one row. */
const MIN_SHOW = 30;         /* px of card that must stay uncovered */
const MIN_TWO_W = 44;        /* below this a second row is not worth it */

function handMetrics() {
  const rail = $id('gn-hand');
  const W = Math.max(200, rail.clientWidth - 8);
  const n = Math.max(1, M.arr.length);
  const hostH = M.ctx.host.clientHeight || 400;
  const gap = 4;
  const lift = hostH < 260 ? 18 : 26;         /* room for a chosen card to rise */

  const hOf = id => { const el = $id(id); return el ? el.offsetHeight : 0; };
  const mid = $id('gn-mid');
  let minMid = 150;
  if (mid && mid.children.length) {
    let need = 0;
    for (let i = 0; i < mid.children.length; i++) {
      const el = mid.children[i];
      if (el.classList && el.classList.contains('gn-spec')) continue;  /* overlay, not flow */
      need += el.offsetHeight;
    }
    need += 6 * (mid.children.length - 1);
    minMid = Math.min(Math.max(need, 96), hostH * 0.55);
  }
  const felt = $id('gn-felt');
  let chrome = 34;
  if (felt) {
    const cs = getComputedStyle(felt);
    chrome = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) +
             (parseFloat(cs.rowGap) || parseFloat(cs.gap) || 0) * 3 + 6;
  }
  const budget = Math.max(90, hostH - hOf('gn-top') - hOf('gn-dash') - hOf('gn-tbl') - minMid - chrome);

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

/* THE FIRST PLACEMENT IS NOT A MOVE, AND MUST NOT ANIMATE — a new
   card is put down with transitions off, one reflow is forced for
   the whole rail, and then they are handed back. Cards already on
   the rail (the ones previewOrder() shuffles about mid-drag) go on
   animating, which is the only place the animation was ever wanted. */
function layoutHand() {
  const rail = $id('gn-hand');
  if (!rail) return;
  const m = handMetrics();
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

/* ── PICKING A CARD UP — Pointer Events, capture, slop ──────────── */
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
    if (d.m.rows > 1) {
      el.style.left = (d.left0 + dx) + 'px';
      el.style.top = (d.top0 + dy) + 'px';
      el.style.transform = 'scale(1.05)';
    } else {
      el.style.left = (d.left0 + dx) + 'px';
      el.style.transform = 'translateY(' +
        Math.max(-46, Math.min(26, dy)) + 'px) scale(1.05)';
    }
    const to = slotAt(d.m, d.left0 + dx, d.top0 + dy + d.m.h / 2);
    if (to !== d.to) { d.to = to; previewOrder(d); }
    /* …or onto the spread? Dragging a card up to the thrown cards is
       the discard gesture. */
    const pile = $id('gn-pile');
    if (pile) {
      const r = pile.getBoundingClientRect();
      const over = ev.clientX >= r.left - 8 && ev.clientX <= r.right + 8 &&
                   ev.clientY >= r.top - 8 && ev.clientY <= r.bottom + 8;
      d.onPile = over && houseReady() &&
                 M.st.phase === 'act' && E.turn(M.st) === M.mySeat;
      pile.classList.toggle('drop', !!d.onPile);
    }
  });
  const finishDrag = ev => {
    const d = M && M.drag;
    if (!d || d.el !== el) return;
    M.drag = null;
    el.classList.remove('drag');
    el.style.transform = '';
    const pile = $id('gn-pile');
    if (pile) pile.classList.remove('drop');
    if (!d.live) { M.dragJust = false; return; }
    if (d.onPile) {
      const mv = { t: 'disc', c: d.c };
      const r = doMove(M.mySeat, mv, 'tap');
      if (!r.ok) {
        denySay(mv);
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
  el.addEventListener('pointerup', finishDrag);
  el.addEventListener('pointercancel', finishDrag);
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
  const you = row.delta[me], them = row.delta[1 - me];
  const fmt = v => (v >= 0 ? '+' : '−') + Math.abs(v);
  if (row.dead) return {
    head: 'Nobody got out', bad: you < them,
    body: 'The deck went round ' + (E.RECYCLE_MAX + 1) + ' times and nobody played their hand empty. ' +
      'What was laid counts, what was held counts against: <b>' + fmt(you) + '</b> you, <b>' +
      fmt(them) + '</b> them.'
  };
  const kName = seatName(row.win), meWin = row.win === me;
  return {
    head: meWin ? 'OUT — hand yours' : 'They played out',
    bad: !meWin,
    body: '<b>' + esc(kName) + '</b> played the last card out of ' + (meWin ? 'your' : 'their') +
      ' hand: <b>+' + row.bonus + '</b> on top of the table. Laid counts plus, held counts minus: ' +
      '<b>' + fmt(you) + '</b> you, <b>' + fmt(them) + '</b> them.'
  };
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
      : ' — first over the top at +' + M.st.match.target + '.');
  const quip = won
    ? (fin.how === 'up' ? 'Your table did the talking. As it should.'
                        : 'You did not win so much as watch them sink. Still counts.')
    : (fin.how === 'floor' ? 'Every card you never put down, counted. That was the deal.'
                           : 'They fed the table faster. Painful to watch, honestly.');
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
        '<p class="blurb">The house game: match <b>45 points of melds</b> and put them down ' +
        '<b>face up</b> — that opens you, and the hand carries on. Open players lay onto ' +
        '<b>anybody’s</b> melds and the points go to them; first hand played empty takes ' +
        '<b>+' + E.OUT_BONUS + '</b>. Whatever stays in a hand counts <b>against</b> it.</p>' +
        (oldSaveDropped
          ? '<p class="pt-warn">Your half-played match was under the old rules, where putting ' +
            'your cards down ended the hand. The game has grown — going down now <b>opens</b> you, ' +
            'the table is live, and there is a bonus for going out — so that save was retired ' +
            'rather than counted wrongly.</p>'
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
          [[10, 'Ten cards', 'The house game as it comes.'],
           [13, 'Thirteen cards', 'More to build 45 from — the gate falls sooner and the table gets bigger.']].map(o =>
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
          [[150, 'Quick one', 'First to 150. About two hands.'],
           [300, 'The proper game', 'First to 300. About four.']].map(o =>
            '<button class="pt-opt' + (o[0] === target ? ' on' : '') + '" data-tgt="' + o[0] + '">' +
              ico('coach') + '<b>' + o[1] + '</b><i>' + o[2] + '</i></button>').join('') +
        '</div>' +
        '<div class="tiny pt-lbl">Help</div>' +
        '<div class="pt-opts" id="gn-hints">' +
          '<button class="pt-opt' + (p.hints ? ' on' : '') + '" data-hints="1">' + ico('book') +
          '<b>Beginner hints ' + (p.hints ? 'on' : 'off') + '</b><i>For beginners, and off unless you ask: ' +
          'a badge on a player’s name counts your cards that fit their melds — tap it to see where. ' +
          'Off, the game expects you to look — and it <b>refuses</b> a throw the table would have taken ' +
          'either way.</i></button>' +
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
    el.querySelectorAll('[data-hints]').forEach(b => b.onclick = () => {
      ST.pref.hints = !ST.pref.hints; persist(); paint();
    });
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
   Both phones deal the same match from the room's shared seed; only
   small named payloads ever cross, and every incoming move is
   re-checked by OUR copy of the rules and refused by name if it
   does not fit.
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
   The rules of gin have now changed TWICE on this table (knock-era →
   45-ends-it → the open game). The early moves — draw, throw — are
   byte-identical across builds, so two mismatched phones would agree
   fingerprints right up until one of them scored a hand the other
   refuses to understand. Prevented at the door instead:

   1. BOTH PHONES SAY THE NEW WORD FIRST. Every board opens by
      sending {a:'house45o', i:hand} — the host with its hand size,
      the guest with 0 as a plain ack. An OLD build receiving
      'house45o' refuses it by name ("a move gin rummy does not know
      how to make") and stops the room honestly before a card is
      touched. The old builds' own hellos — 'house45' (the
      45-ends-it build) and 'house' (the knock build) — are refused
      here just as honestly, each with its own truthful message.
      Two new builds pass each other in the night and play.
   2. THE ROOM'S OPENER IS THE HOUSE: their setup sheet's hand size
      plays. The guest deals ten, waits for the hello, and re-deals
      if the house said thirteen — free while the log is empty.
   3. THE GUEST DOES NOT TOUCH A CARD UNTIL IT KNOWS. houseReady()
      keeps thumbs off the felt until the hello lands; said once
      more if it does not, then the board stops with the truth.
   4. AND THE FINGERPRINT IS THE BACKSTOP: down/laid/table are all
      inside it, so even a phone that lied through the hello is
      refused on its very first scored move.
   ═══════════════════════════════════════════════════════════════════ */
const HOUSE_WAIT = 2500;
const HELLO = 'house45o';                        /* o for the OPEN game */

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
  try { o.send('move', { a: HELLO, i: host ? hand : 0 }, null); } catch (e) {}
  if (!host) houseClock();
}

function houseClock() {
  M.houseTimer = setTimeout(() => {
    if (!M || M.dead || !M.house || M.house.settled) return;
    M.houseTimer = 0;
    if (M.house.tries++ < 1) {
      try { M.net.send('move', { a: HELLO, i: 0 }, null); } catch (e) {}
      houseClock();
      return;
    }
    onlineStop('The other phone never said the new hello, which means it is on an older ' +
      'gin. This build plays the open game: put the 45 down, lay on anybody, first hand ' +
      'empty wins +' + E.OUT_BONUS + '. Update both phones and deal again. Nothing was scored.', 'cheat');
  }, HOUSE_WAIT);
}

/* the hello, arriving. The host hears an ack; the guest hears the
   hand size and re-deals if the house plays thirteen. */
function houseHello(n) {
  if (!M || !M.house) return { why: 'a house rule with no table under it' };
  if (M.house.host) {
    /* the guest's ack. Answer it with the hello AGAIN: if our first
       hello raced the guest's board opening and was refused into the
       void, this one lands. Idempotent — the guest settles once and
       ignores repeats that agree — and bounded, because acks are. */
    try { M.net.send('move', { a: HELLO, i: M.st.hs }, null); } catch (e) {}
    return null;
  }
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
  if (d.m && d.m.a === HELLO) return houseHello(d.m.i | 0);
  /* the previous builds' hellos: refused by name, not humoured */
  if (d.m && d.m.a === 'house45')
    return { why: 'a gin hand under the PREVIOUS rules, where putting your cards down ' +
      'ended the hand. This build plays the open game: update both phones' };
  if (d.m && d.m.a === 'house')
    return { why: 'a gin hand under the OLD rules — knocking and deadwood. This build ' +
      'plays the open game: update both phones' };

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
    return 'The house game: match 45, put it down face up, then feed the table — lay on ' +
      'anybody’s melds and the points are yours. First hand played empty takes +' +
      E.OUT_BONUS + '; whatever you are still holding counts against you.' +
      (ST.save ? ' There is a ' + (ST.save.opts && ST.save.opts.hand === 13 ? 'thirteen-card ' : '') +
                 'match of this half-played.' : '');
  },
  open: () => setupSheet()
});

/* js/mp.js exports its game registry LIVE, precisely so a game file
   can introduce itself without anybody editing mp.js. The relay must
   also know the id — one word in server/karti_server.py — and until
   it does, opening a gin room fails with mp.js's own honest "that
   server cannot host…" message rather than anything worse. */
(function teachLobby() {
  const MPX = window.KARTI_MP;
  if (!MPX || !Array.isArray(MPX.GAMES) || !Array.isArray(MPX.GAME_KEYS)) return;
  if (MPX.GAME_KEYS.indexOf('gin') >= 0) return;
  MPX.GAMES.push({ k: 'gin', name: 'Gin Rummy', short: 'GIN', icon: 'cards',
    blurb: 'Match 45. Open the table.' });
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
    'Match 45 points of melds and put them down face up — that opens you, and the hand ' +
    'carries on. Open players lay onto any meld on the table and the points go to whoever ' +
    'laid the card; first hand played empty takes +' + E.OUT_BONUS + '. Whatever stays in ' +
    'a hand counts minus. First to +300 takes the match.</p>',
  blurb: 'Match 45. Open the table.',
  myName,
  start: () => { newGame({ lvl: ST.pref.lvl || 2, target: ST.pref.target || 300,
                          hand: ST.pref.hand === 13 ? 13 : 10 }); return true; },
  wire: { fields: ['i', 'j', 'k'] },
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
      spec: on => { if (M) { M.spec = !!on; render(); } },
      doMove, render, E,
      net: { start: onlineStart, remote: onlineRemote }
    };
  }
} catch (e) {}

})();
