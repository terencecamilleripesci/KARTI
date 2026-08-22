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

/* ── THE SPREAD'S SHAPE ───────────────────────────────────────────
   The owner, having played it: "discard pile is nice and u can
   overlap them, middle only show the corner top, and when click it
   will show full card".

   So the thrown cards are laid the way cards really are laid on a
   table: each one covering most of the card before it, with only its
   TOP-LEFT CORNER — the rank and the suit pip — showing. That corner
   is the whole of what anybody reads off a discard pile, and it is
   why the corner is printed there in the first place.

   The numbers come off js/klabb.js's own card art rather than a
   guess. Its face is a 100x140 viewBox whose corner block is the
   rank text centred at x=11.5 (up to 17 wide, so it ends by x=20)
   with the suit pip beneath at y=39.5, 13 across. The left 20% of a
   card therefore carries everything, and the sliver left on show is
   30% — half again as much as is strictly needed, because a thumb
   is not a caliper.

   The gain is the point. At 390 wide the old grid of whole minis fit
   SEVEN to a row and cut them off at that; the same strip now holds
   FOURTEEN with the cards BIGGER than they were. The last card of a
   run sits whole, so the newest throw — the one that matters — is
   always fully readable at the end of it.

   And any card can be tapped for the full face, because a corner
   under a thumb is occasionally ambiguous and reading this pile is
   the whole game. Nothing about the RULES moves: it is still a
   record, and still nobody's to pick up. */
const SPREAD_SHOW = 0.30;    /* the fraction of each card left uncovered */
const SPREAD_ROWS_MAX = 3;   /* rows on show before the spread scrolls */
/* the Tables sheet: piles as ROWS up to this many, a GRID past it —
   his own number ("if more than 5 out make it as table") */
const SPEC_ROWS_MAX = 5;

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

/* ── UI-only preference, in its OWN key (rummy's dock rule): how you
   keep the setup sheet's rules folded is not the game, so it must
   never ride in karti_gin_v1 where binning a save could forget it.
   CLOSED by default — the sheet's job is dealing. ─────────────────── */
const UIKEY = 'karti_gin_ui_v1';
let setupOpen = false;
try { setupOpen = localStorage.getItem(UIKEY + '.setup') === '1'; } catch (e) {}
function setSetupOpen(open) {
  setupOpen = !!open;
  try { localStorage.setItem(UIKEY + '.setup', setupOpen ? '1' : '0'); } catch (e) {}
}

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
    /* ── THE FELT ──────────────────────────────────────────────────
       A surface cards are played ON, the way js/skarta-ui.js's
       .sk-felt is a surface: a lit centre falling off to dark
       corners, a hairline rail inside the edge, and a soft wash
       under the middle where the deck and the spread sit. It is all
       paint — no layout, nothing that moves — so it costs the phone
       one gradient and can never push a control anywhere. ── */
    /* justify-content:space-between is how the leftover height is
       spent. Pinning the hand to the bottom (margin-top:auto) put
       ALL of it in one 190px band under your table — the owner's
       "a lot of space" with a different postcode. Spread evenly
       between the four bands it stops being a hole and becomes the
       spacing of a laid-out table: the seats breathe, the deck and
       the spread sit clear of both, and your cards are not crammed
       under your melds. */
    '#scr-party .gn-felt{--gn-felt:#1A2E4A;--gn-felt2:#0E1B2D;flex:1;min-height:0;width:100%;' +
      'display:flex;flex-direction:column;justify-content:space-between;gap:5px;' +
      'padding:8px 7px 6px;border-radius:16px;position:relative;' +
      'overflow:hidden;' +
      'background:radial-gradient(115% 78% at 50% 30%,#2B4C74 0%,var(--gn-felt) 46%,var(--gn-felt2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.07),' +
      'inset 0 0 0 1px rgba(255,255,255,.045),inset 0 -22px 40px rgba(0,0,0,.45);' +
      'overscroll-behavior:none}' +
    /* the wash under the play area — pure decoration, behind everything */
    '#scr-party .gn-felt::before{content:"";position:absolute;left:6%;right:6%;top:12%;height:44%;' +
      'z-index:0;pointer-events:none;border-radius:50%;' +
      'background:radial-gradient(closest-side,rgba(120,180,255,.10),transparent 72%)}' +
    '#scr-party .gn-felt > *{position:relative;z-index:1}' +

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

    /* ── the middle band: deck + the spread, the prompt, the buttons.
       flex:0 0 auto ON PURPOSE. It used to be flex:1 with its
       contents centred, which is exactly what put a band of empty
       felt above and below the prompt — the owner's "a lot of
       space". The middle now takes only what it needs and the SLACK
       GOES TO YOUR TABLE, which is the thing that grows all game. ── */
    '#scr-party .gn-mid{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:flex-start;gap:6px;position:relative;width:100%}' +
    '#scr-party .gn-piles{display:flex;align-items:flex-start;justify-content:center;gap:9px;' +
      'width:100%;min-height:0}' +
    '#scr-party .gn-pilebox{display:flex;flex-direction:column;align-items:center;gap:3px;flex:0 0 auto}' +
    '#scr-party .gn-pilelbl{font:900 8.5px/1 var(--disp);letter-spacing:.14em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.45)}' +
    /* the strip says which of the two games you are in, and the half
       that changes when your 45 goes down is the half that lights */
    '#scr-party .gn-pilelbl b{color:#3DDC84}' +
    /* the deck reads as a DECK: klabb's own stacked-edge trick, so it
       has thickness instead of being one lonely card */
    '#scr-party .gn-pilebtn{position:relative;display:block;width:min(66px,11.6vh);height:min(92px,16.2vh);' +
      'padding:0;border:0;border-radius:7px;background:none;line-height:0;cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent;' +
      'box-shadow:0 4px 12px rgba(0,0,0,.5),3px -3px 0 -1px #16283F,3px -3px 0 0 rgba(255,255,255,.13),' +
        '6px -6px 0 -1px #16283F,6px -6px 0 0 rgba(255,255,255,.09);' +
      'transition:box-shadow .15s var(--ease),opacity .15s}' +
    '#scr-party .gn-pilebtn.can{box-shadow:0 0 0 2.5px rgba(61,220,132,.85),0 6px 14px rgba(0,0,0,.45),' +
      '3px -3px 0 -1px #16283F,6px -6px 0 -1px #16283F}' +
    '#scr-party .gn-pilebtn.dim{opacity:.5;cursor:default}' +
    '#scr-party .gn-pilebtn .gn-count{position:absolute;right:-7px;top:-7px;z-index:2;min-width:20px;height:20px;' +
      'padding:0 5px;border-radius:999px;display:grid;place-items:center;font:900 9.5px/1 var(--disp);' +
      'color:#241800;background:var(--gold);border:1px solid #FFE9B0;line-height:20px}' +

    /* THE SPREAD — overlapped, corner-out, wrapping into rows. Each
       row is a flex line of cards pulled left onto each other by a
       negative margin, so only SPREAD_SHOW of each is uncovered and
       the last of a run sits whole. position:relative and nothing
       else does the stacking: positioned siblings paint in document
       order, so every card lands on top of the one it was thrown
       after — which is the right way round for a pile. */
    '#scr-party .gn-sprbox{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px;' +
      'align-items:stretch}' +
    '#scr-party .gn-spread{display:flex;flex-direction:column;gap:4px;width:100%;' +
      'overflow-y:auto;overscroll-behavior:contain;border-radius:9px;padding:5px 6px;' +
      'background:linear-gradient(180deg,rgba(0,0,0,.30),rgba(0,0,0,.16));' +
      'border:1px solid rgba(255,255,255,.09);box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}' +
    '#scr-party .gn-sprow{display:flex;align-items:flex-start;flex:0 0 auto}' +
    '#scr-party .gn-dcard{position:relative;flex:0 0 auto;border-radius:4px;line-height:0;padding:0;' +
      'border:0;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent;' +
      'box-shadow:-1px 0 2px rgba(0,0,0,.55),0 2px 5px rgba(0,0,0,.4);' +
      'transition:transform .14s var(--ease)}' +
    '#scr-party .gn-dcard:first-child{box-shadow:0 2px 5px rgba(0,0,0,.4)}' +
    /* the newest throw, whole and ringed: the one card anybody hunts for */
    '#scr-party .gn-dcard.new{box-shadow:0 0 0 2px rgba(255,197,66,.75),0 2px 6px rgba(0,0,0,.5)}' +
    '#scr-party .gn-dcard.up{box-shadow:0 0 0 2.5px rgba(61,220,132,.9),0 2px 6px rgba(0,0,0,.5)}' +
    '#scr-party .gn-dcard.peek{transform:translateY(-3px);z-index:5}' +
    /* THE RUN YOU ARE ABOUT TO CARRY OFF — lit whole, before you
       commit, with everything you would leave behind dimmed. The
       card you reached for is ringed brightest because it is the one
       you actually wanted; the rest is the price. */
    '#scr-party .gn-dcard.run{box-shadow:0 0 0 2px rgba(61,220,132,.9),0 3px 8px rgba(0,0,0,.5);' +
      'transform:translateY(-4px);z-index:4}' +
    '#scr-party .gn-dcard.want{box-shadow:0 0 0 3px var(--gold),0 4px 12px rgba(0,0,0,.55);' +
      'transform:translateY(-7px);z-index:6}' +
    '#scr-party .gn-dcard.faded{filter:brightness(.5) saturate(.6)}' +
    '#scr-party .gn-spread.aim{border-color:rgba(61,220,132,.5);' +
      'background:linear-gradient(180deg,rgba(61,220,132,.12),rgba(0,0,0,.2))}' +
    '#scr-party .gn-spread.drop{border-color:var(--gold);' +
      'background:linear-gradient(180deg,rgba(255,197,66,.16),rgba(255,197,66,.06))}' +
    '#scr-party .gn-sprempty{display:grid;place-items:center;min-height:44px;' +
      'font:900 9px/1.4 var(--disp);letter-spacing:.11em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.32);text-align:center}' +

    /* the full card, on tap. Lives inside the middle band like the
       spectator sheet does, so it can never reach the hand. */
    '#scr-party .gn-zoom{position:absolute;inset:0;z-index:13;display:flex;align-items:center;' +
      'justify-content:center;gap:12px;padding:8px;border-radius:12px;background:rgba(7,5,14,.9);' +
      'border:1px solid rgba(255,255,255,.14);animation:gn-pop .16s var(--ease)}' +
    '@keyframes gn-pop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}' +
    '#scr-party .gn-zoom .gn-zc{width:min(96px,19vh);flex:0 0 auto;line-height:0;border-radius:8px;' +
      'box-shadow:0 10px 24px rgba(0,0,0,.6)}' +
    '#scr-party .gn-zoom .gn-zt{display:flex;flex-direction:column;gap:7px;align-items:flex-start;' +
      'min-width:0}' +
    '#scr-party .gn-zoom .gn-zt b{font:900 13px/1.2 var(--disp);color:var(--gold)}' +
    '#scr-party .gn-zoom .gn-zt i{font:700 11px/1.45 var(--body);font-style:normal;color:var(--dim)}' +

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

    /* ── YOUR TABLE — the band that TAKES THE SLACK ────────────────
       It grows all game and it is the thing you are proudest of, so
       it gets the felt's spare height rather than the gaps did. Held
       shut it is not hidden — an empty table is still your table, so
       it says so, with the one number that opens it. ── */
    /* flex:0 1 auto — it sizes to the melds it holds and SHRINKS
       (its meld tray scrolling) when the felt is tight, but it never
       inflates to fill space it has nothing to put in. An empty
       table that had taken the slack was 250px of blue nothing at
       390 — the owner's complaint moved, not fixed. Where the slack
       actually goes is the note on .gn-me. */
    '#scr-party .gn-tbl{flex:0 1 auto;min-height:60px;display:flex;align-items:stretch;gap:8px;' +
      'width:100%;padding:6px 7px;border-radius:12px;position:relative;overflow:hidden;' +
      'background:radial-gradient(120% 140% at 12% 0%,rgba(61,220,132,.10) 0%,rgba(0,0,0,.26) 55%,' +
        'rgba(0,0,0,.32) 100%);' +
      'border:1px solid rgba(255,255,255,.11);box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}' +
    '#scr-party .gn-tbl.shut{border-style:dashed;border-color:rgba(255,255,255,.14);' +
      'background:rgba(0,0,0,.18)}' +
    '#scr-party .gn-tbl .gn-tlbl{flex:0 0 auto;display:flex;flex-direction:column;gap:3px;' +
      'justify-content:center;font:900 8.5px/1.2 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.5)}' +
    '#scr-party .gn-tbl .gn-tlbl b{color:#3DDC84;font:900 14px/1 var(--disp)}' +
    '#scr-party .gn-melds{display:flex;flex-wrap:wrap;gap:7px 10px;align-content:flex-start;' +
      'flex:1 1 auto;min-width:0;overflow-y:auto;overscroll-behavior:contain}' +
    /* the deliberate empty table: a place waiting for cards, saying
       what puts them there. Not a hole, and not filler either. */
    '#scr-party .gn-tblwait{flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;' +
      'gap:3px;min-width:0;font:700 11px/1.45 var(--body);color:rgba(255,255,255,.5)}' +
    '#scr-party .gn-tblwait b{color:var(--gold);font-weight:900}' +
    '#scr-party .gn-tblbar{height:5px;border-radius:99px;background:rgba(255,255,255,.09);' +
      'overflow:hidden;margin-top:2px}' +
    '#scr-party .gn-tblbar i{display:block;height:100%;border-radius:99px;' +
      'background:linear-gradient(90deg,var(--gold),#3DDC84);transform-origin:left center;' +
      'transition:transform .3s var(--ease)}' +
    '#scr-party .gn-meld{display:flex;padding:0;border:0;background:none;line-height:0;cursor:pointer;' +
      'border-radius:5px;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .gn-meld .gn-mc{width:31px;height:43px;margin-left:-17px;border-radius:3.5px;' +
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

    /* ── the Tables sheet: who is out, then every pile by name ──── */
    '#scr-party .gn-who{display:flex;flex-direction:column;gap:4px}' +
    '#scr-party .gn-whorow{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;' +
      'padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.04);' +
      'border-left:3px solid rgba(255,255,255,.14)}' +
    '#scr-party .gn-whorow.out{border-left-color:#3DDC84;background:rgba(61,220,132,.08)}' +
    '#scr-party .gn-whorow b{font:900 11.5px/1.2 var(--disp);color:var(--txt)}' +
    '#scr-party .gn-whorow i{font:700 10px/1.3 var(--body);font-style:normal;color:var(--dim)}' +
    '#scr-party .gn-whorow i b{font:900 10px/1.3 var(--disp);color:#3DDC84}' +
    /* rows while the piles are few… */
    '#scr-party .gn-tabs{display:flex;flex-direction:column;gap:6px}' +
    /* …and a real table once there are more than five of them */
    '#scr-party .gn-tabs.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));' +
      'gap:6px 8px;align-items:start}' +
    '#scr-party .gn-trow{display:flex;align-items:center;gap:8px;min-width:0;' +
      'padding:5px 7px;border-radius:9px;background:rgba(0,0,0,.26);' +
      'border:1px solid rgba(255,255,255,.09)}' +
    '#scr-party .gn-trow.mine{border-color:rgba(61,220,132,.4);background:rgba(61,220,132,.07)}' +
    '#scr-party .gn-tname{flex:0 0 auto;max-width:34%;overflow:hidden;text-overflow:ellipsis;' +
      'white-space:nowrap;font:900 9px/1.2 var(--disp);letter-spacing:.08em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.62)}' +
    '#scr-party .gn-trow.mine .gn-tname{color:#3DDC84}' +
    '#scr-party .gn-trow .gn-meld{flex:1 1 auto;min-width:0;justify-content:flex-start}' +
    '#scr-party .gn-tval{flex:0 0 auto;margin-left:auto;font:900 10px/1 var(--disp);' +
      'color:var(--gold)}' +
    /* in grid mode the cards must give way, not the layout */
    '#scr-party .gn-tabs.grid .gn-meld .gn-mc{width:25px;height:35px;margin-left:-14px}' +
    '#scr-party .gn-tabs.grid .gn-tname{max-width:100%;font-size:8.5px}' +

    /* THE MIDDLE GROWS FOR IT. "the middle needs to grow that space":
       while the sheet is open it is the most important thing on the
       felt, so the middle band claims the felt's slack and your own
       table strip stands down — the sheet lists YOUR piles too, so
       nothing is lost by it and the sheet gets the room. The hand is
       untouched: handMetrics reserves the table's minimum whether it
       is on screen or not, precisely so this cannot move it. */
    '#scr-party .gn-felt.specing .gn-mid{flex:1 1 auto;min-height:0}' +
    '#scr-party .gn-felt.specing .gn-tbl{display:none}' +
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

    /* ── my side: the dashboard and the hand ──────────────────────
       margin-top:auto is where the felt's spare height goes, and it
       is the one honest answer. The deck and the spread belong at
       the top of a table, your melds under them, your hand at the
       near edge — so the slack collects in ONE band between your
       table and your dashboard, which is precisely where a real
       table has bare felt — but ALL of it in that one band was still
       a hole, so the felt spreads it between every pair of rows
       instead (see .gn-felt's justify-content). ── */
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
      '#scr-party .gn-tbl{min-height:56px;padding:5px 6px}' +
      '#scr-party .gn-tblwait{font-size:10px;line-height:1.35}' +
      '#scr-party .gn-meld .gn-mc{width:27px;height:38px;margin-left:-15px}}' +
    /* SIDEWAYS — both orientations are first-class here. The felt
       becomes a two-column grid: the seats, your table and your hand
       on the left; the deck, the spread, the prompt and the buttons
       in a column on the right. Spectator mode still opens over the
       right column only, so the hand stays live. */
    '@media (max-height:480px){' +
      /* the TABLE row takes the slack here too — middle row minmax(0,1fr),
         with the seats above it and the hand below at their own heights */
      '#scr-party .gn-felt{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);' +
        'grid-template-rows:auto minmax(0,1fr) auto;gap:4px 10px;padding:6px 8px 5px;' +
        'grid-template-areas:"top mid" "tbl mid" "me mid";align-items:stretch}' +
      '#scr-party .gn-felt::before{top:6%;height:52%}' +
      '#scr-party .gn-top{grid-area:top;min-height:22px;gap:6px;justify-content:flex-start;' +
        'align-items:center}' +
      '#scr-party .gn-mid{grid-area:mid;gap:5px;align-self:stretch;justify-content:flex-start;' +
        'padding-top:2px}' +
      '#scr-party .gn-tbl{grid-area:tbl;align-self:stretch;min-height:46px}' +
      '#scr-party .gn-tblwait{font-size:10px;line-height:1.35}' +
      '#scr-party .gn-me{grid-area:me;gap:2px;align-self:end}' +
      '#scr-party .gn-backs .gn-b{width:14px;height:20px;margin-left:-8px}' +
      '#scr-party .gn-pilelbl{display:none}' +
      '#scr-party .gn-pilebtn{width:min(50px,13vh);height:min(70px,18.2vh);' +
        'box-shadow:0 3px 8px rgba(0,0,0,.5),2px -2px 0 -1px #16283F,2px -2px 0 0 rgba(255,255,255,.12),' +
        '4px -4px 0 -1px #16283F,4px -4px 0 0 rgba(255,255,255,.08)}' +
      '#scr-party .gn-pilebtn .gn-count{min-width:17px;height:17px;line-height:17px;font-size:9px}' +
      '#scr-party .gn-piles{gap:6px}' +
      '#scr-party .gn-say{max-width:none;font-size:10px;line-height:1.4}' +
      '#scr-party .gn-acts{gap:5px}' +
      '#scr-party .gn-dash{min-height:22px;justify-content:flex-start}' +
      '#scr-party .gn-meld .gn-mc{width:25px;height:35px;margin-left:-14px}' +
      '#scr-party .gn-zoom{gap:9px}' +
      '#scr-party .gn-zoom .gn-zc{width:min(62px,17vh)}' +
      '#scr-party .gn-zoom .gn-zt i{font-size:10px;line-height:1.35}' +
      '#scr-party .gn-act{min-height:30px;font-size:10px;padding:0 10px}' +
      '#scr-party .pt-turn.pt-turn{min-height:28px;margin-bottom:4px;padding:3px 10px}}' +

    /* ══ THE SETUP SHEET'S OWN FACE — scoped to .gn-menu ══
       The identity piece is THE 45 ITSELF, because the 45 is what this
       game is about: a meld laid FACE UP on the lit steel-blue felt —
       three aces, 15 each — priced with the gold seal and answered by
       the green OPEN chip. Nothing fanned, nothing held: cards lying
       on a table is the picture of gin, exactly as a hand fanned into
       melds is the picture of rummy next door. */
    /* klabb's face rules, restated under this scope: the felt's copy
       only lives under .gn-felt and the menu is not inside it */
    '#scr-party .gn-menu .kb-svg{width:100%;height:100%;display:block;border-radius:5px;' +
      'overflow:hidden;font-family:var(--body),-apple-system,"Segoe UI",Roboto,Arial,sans-serif}' +
    '#scr-party .gn-menu .kb-stock{fill:#FCF7EA;stroke:rgba(0,0,0,.34);stroke-width:1.1}' +
    '#scr-party .gn-menu .kb-svg.kb-r{fill:#C7192B;color:#C7192B}' +
    '#scr-party .gn-menu .kb-svg.kb-b{fill:#17131B;color:#17131B}' +
    '#scr-party .gn-menu .kb-idx text{font-weight:800;font-size:25px;letter-spacing:-.02em;' +
      'fill:currentColor;stroke:none}' +
    '#scr-party .gn-menu .kb-panel{fill:#F4E7C6;stroke:currentColor;stroke-width:1.5}' +
    '#scr-party .gn-menu .kb-ink{fill:currentColor;stroke:none}' +
    '#scr-party .gn-menu .kb-face{fill:#FCF7EA;stroke:currentColor;stroke-width:1.5}' +
    '#scr-party .gn-menu .kb-hair{stroke:currentColor;stroke-width:1.1;opacity:.55;fill:none}' +

    '#scr-party .gn-menu .pt-lbl{color:#9FD8B8}' +
    '#scr-party .gn-menu .gn-hero{position:relative;display:flex;align-items:center;' +
      'justify-content:center;gap:9px;margin:2px 0 12px;padding:18px 10px 17px;' +
      'border-radius:16px;overflow:hidden;' +
      'background:radial-gradient(115% 130% at 50% 0%,#2B4C74 0%,#1A2E4A 50%,#0E1B2D 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.07),' +
      'inset 0 -14px 26px rgba(0,0,0,.4)}' +
    /* the felt's own wash, so the sheet and the table are one place */
    '#scr-party .gn-menu .gn-hero::before{content:"";position:absolute;left:8%;right:8%;' +
      'top:12%;height:56%;pointer-events:none;border-radius:50%;' +
      'background:radial-gradient(closest-side,rgba(120,180,255,.10),transparent 72%)}' +
    '#scr-party .gn-menu .gn-hero>*{position:relative}' +
    '#scr-party .gn-menu .gn-hero-m{display:flex;flex:0 0 auto}' +
    /* the meld lies as the spread lies: corner-out, left to right */
    '#scr-party .gn-menu .gn-mcard{display:block;flex:0 0 auto;width:46px;height:64px;' +
      'border-radius:5px;line-height:0;margin-left:-27px;' +
      'box-shadow:-1px 0 2px rgba(0,0,0,.55),0 2px 5px rgba(0,0,0,.4)}' +
    '#scr-party .gn-menu .gn-mcard:first-child{margin-left:0;box-shadow:0 2px 5px rgba(0,0,0,.4)}' +
    '#scr-party .gn-menu .gn-hero-eq{font:900 18px/1 var(--disp);font-style:normal;' +
      'color:rgba(255,255,255,.5)}' +
    /* the price, as a coin — gold, because points are the whole game here */
    '#scr-party .gn-menu .gn-hero-tag{display:grid;place-items:center;flex:0 0 auto;' +
      'width:46px;height:46px;border-radius:50%;font:900 17px/1 var(--disp);color:#241800;' +
      'background:linear-gradient(180deg,#FFD979,#FFC542);border:1px solid #FFE9B0;' +
      'box-shadow:0 3px 8px rgba(0,0,0,.5)}' +
    '#scr-party .gn-menu .gn-hero-open{flex:0 0 auto;font:900 9px/1.35 var(--disp);' +
      'letter-spacing:.09em;text-transform:uppercase;text-align:center;color:#BFF3D6;' +
      'background:rgba(61,220,132,.16);border:1px solid rgba(61,220,132,.45);' +
      'border-radius:11px;padding:6px 8px;max-width:86px}' +
    '#scr-party .gn-menu .gn-hero-cap{position:absolute;right:11px;bottom:7px;' +
      'font:900 9.5px/1 var(--disp);letter-spacing:.18em;color:rgba(255,255,255,.30)}' +
    '@media (max-height:520px){#scr-party .gn-menu .gn-hero{padding:12px 10px 13px}}' +

    /* ── the rules FOLD on the setup sheet — rummy's slide, restated
       under this scope: grid-rows 0fr→1fr for the height, transform +
       opacity on the list inside, instant under reduced motion ── */
    '#scr-party .gn-fold-h{display:flex;align-items:center;gap:10px;width:100%;text-align:left;' +
      'border:0;background:none;padding:2px 0;margin:0;color:var(--txt);cursor:pointer;' +
      'min-height:44px;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .gn-fold-h span{flex:1;min-width:0}' +
    '#scr-party .gn-fold-h b{display:block;font:900 10px/1.4 var(--disp);letter-spacing:.11em;' +
      'text-transform:uppercase;color:var(--gold,#FFC542)}' +
    '#scr-party .gn-fold-h i{display:block;font-style:normal;font-size:10.5px;line-height:1.4;' +
      'color:var(--dim);margin-top:3px;text-transform:none;letter-spacing:0}' +
    '#scr-party .gn-fold-h em{flex:0 0 auto;width:24px;height:24px;display:grid;' +
      'place-items:center;color:var(--dim)}' +
    '#scr-party .gn-fold-h em svg{width:15px;height:15px;stroke:currentColor;fill:none;' +
      'stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;transform:rotate(90deg);' +
      'transition:transform .22s var(--ease)}' +
    '#scr-party .gn-fold-h[aria-expanded="true"] em svg{transform:rotate(-90deg)}' +
    '#scr-party .gn-fold-b{display:grid;grid-template-rows:0fr;' +
      'transition:grid-template-rows .28s var(--ease)}' +
    '#scr-party .gn-fold-b.open{grid-template-rows:1fr}' +
    '#scr-party .gn-fold-i{overflow:hidden;min-height:0}' +
    '#scr-party .gn-fold-i ul{transform:translateY(-10px);opacity:0;' +
      'transition:transform .28s var(--ease),opacity .28s var(--ease)}' +
    '#scr-party .gn-fold-b.open .gn-fold-i ul{transform:none;opacity:1}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .gn-fold-b,#scr-party .gn-fold-i ul,' +
      '#scr-party .gn-fold-h em svg{transition:none}}' +
    'body.reduced #scr-party .gn-fold-b,body.reduced #scr-party .gn-fold-i ul,' +
    'body.reduced #scr-party .gn-fold-h em svg{transition:none}' +

    /* ── THE ENTRY MODE PICKER — screen one. Big, few, clean (bomba's
       shape, restated in this game's green scope). ── */
    '#scr-party .gn-menu .gn-modes{display:flex;flex-direction:column;gap:11px;margin:6px 0 8px}' +
    '#scr-party .gn-menu .gn-mode{-webkit-appearance:none;appearance:none;border:0;text-align:left;' +
      'width:100%;display:flex;align-items:center;gap:13px;padding:16px 16px;border-radius:16px;' +
      'background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);' +
      'color:#fff;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .gn-menu .gn-mode .gn-mi{flex:0 0 auto;width:40px;height:40px;display:flex;' +
      'align-items:center;justify-content:center;border-radius:12px;' +
      'background:rgba(255,255,255,.07)}' +
    '#scr-party .gn-menu .gn-mode .gn-mi svg{width:24px;height:24px;stroke:currentColor;fill:none;' +
      'stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}' +
    '#scr-party .gn-menu .gn-mode .gn-mt{display:flex;flex-direction:column;gap:2px;min-width:0}' +
    '#scr-party .gn-menu .gn-mode .gn-mt b{font:900 15px/1.1 var(--disp);letter-spacing:.04em}' +
    '#scr-party .gn-menu .gn-mode .gn-mt i{font:600 11.5px/1.35 var(--body);color:var(--dim);' +
      'font-style:normal}' +
    '#scr-party .gn-menu .gn-mode.primary{background:linear-gradient(180deg,rgba(255,197,66,.2),' +
      'rgba(255,197,66,.06));box-shadow:inset 0 0 0 1px rgba(255,197,66,.42),' +
      '0 8px 20px rgba(255,197,66,.14)}' +
    '#scr-party .gn-menu .gn-mode.primary .gn-mi{background:rgba(255,197,66,.2);color:var(--gold,#FFC542)}' +
    '#scr-party .gn-menu .gn-mode.primary .gn-mt b{color:var(--gold,#FFC542)}' +
    '#scr-party .gn-menu .gn-mode:active{transform:translateY(1px)}' +
    '#scr-party .gn-menu .gn-mchev{margin-left:auto;flex:0 0 auto;color:var(--dim2)}' +
    '#scr-party .gn-menu .gn-mchev svg{width:18px;height:18px;stroke:currentColor;fill:none;' +
      'stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}' +

    /* ── the menu rules sheet — the same slide-down panel, reused for
       screen one. Fixed to the screen so it slides over the modes. ── */
    '#scr-party .gn-msheet{position:fixed;top:0;left:0;right:0;z-index:40;max-height:70%;' +
      'display:flex;flex-direction:column;background:rgba(12,18,14,.97);' +
      'border-bottom:1px solid rgba(255,255,255,.12);border-radius:0 0 16px 16px;' +
      'box-shadow:0 14px 34px rgba(0,0,0,.6);transform:translateY(-102%);opacity:0;' +
      'visibility:hidden;pointer-events:none;' +
      'transition:transform .3s var(--ease),opacity .3s var(--ease),visibility 0s .3s}' +
    '#scr-party .gn-msheet.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .3s var(--ease),opacity .3s var(--ease),visibility 0s 0s}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .gn-msheet{transition:none}}' +
    'body.reduced #scr-party .gn-msheet{transition:none}' +
    '#scr-party .gn-msheet-h{flex:0 0 auto;display:flex;align-items:center;' +
      'justify-content:space-between;gap:8px;padding:12px 14px 6px}' +
    '#scr-party .gn-msheet-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--gold,#FFC542)}' +
    '#scr-party .gn-msheet-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;' +
      'color:var(--dim);display:flex;align-items:center;justify-content:center;cursor:pointer}' +
    '#scr-party .gn-msheet-x svg{width:16px;height:16px;stroke:currentColor;fill:none;' +
      'stroke-width:2.2;stroke-linecap:round}' +
    '#scr-party .gn-msheet-b{min-height:0;overflow-y:auto;padding:2px 14px 16px;' +
      '-webkit-overflow-scrolling:touch}' +
    '#scr-party .gn-msheet-b ul{margin:0;padding:0}' +
    '#scr-party .gn-msheet-b li{font-size:12px;line-height:1.6;color:var(--dim);' +
      'list-style:none;margin:0 0 7px;padding:0 0 0 13px;position:relative}' +
    '#scr-party .gn-msheet-b li:before{content:"";position:absolute;left:0;top:7px;width:5px;' +
      'height:5px;border-radius:2px;background:var(--gold,#FFC542);opacity:.75}' +
    '#scr-party .gn-msheet-b b{color:#fff}';
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
    zoom: null,                       /* the thrown card being read whole */
    pick: null,                       /* the spread index a sweep is AIMED at */
    spm: null,                        /* the spread's measured geometry */
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
  else if (mv.t === 'sweep') w.i = mv.i | 0;    /* WHERE in the spread, not which card */
  else if (mv.c != null) w.i = mv.c | 0;
  return w;
}
/* 'sweep' is BACK, and it travels as an INDEX into the spread, not as
   a card: the run it takes is "this one and everything right of it",
   which is a position, and both phones hold the identical spread in
   the identical order (the fingerprint carries st.discard, so if they
   ever did not, the move is refused before it lands rather than
   silently taking the wrong cards).
   NOTE what is NOT in this list, on purpose: 'knock' (the knock game
   died two builds ago). A peer still on it is refused by name. */
const WIRE_OK = { take: 1, draw: 1, disc: 1, down: 1, meld: 1, lay: 1, sweep: 1 };
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
  } else if (d.a === 'sweep') {
    if (d.i == null) return null;
    const i = d.i | 0;
    if (i < 0 || i > 255) return null;         /* E.check bounds it to the real spread */
    mv.i = i;
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
    case 'sweep': {
      /* a fistful of cards coming off the felt: the flip, then a
         short run of deals whose length IS the size of the reach, so
         a big sweep sounds like one without anybody being told */
      cue('pack.flip', { gain: mine ? 0.95 : 0.75 });
      const n = Math.min((M.st.last && M.st.last.n) || 1, 6);
      if (n > 1) cueRun('card.deal', n, FAST ? 1 : 55, { gain: mine ? 0.7 : 0.5 });
      break;
    }
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
  paintZoom();
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
    M.zoom = null;                  /* one sheet over the middle at a time */
    M.pick = null;                  /* and no reach left aimed behind it */
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
    /* the prompt has to tell the truth about WHICH game you are in:
       closed, the deck is the whole of it; open, the spread is a
       second place to draw and the strip must say so */
    const canSw = E.canSweep(st, me) && myGo;
    if (M.pick != null && canSw) {
      const run = E.sweepRun(st, M.pick);
      say = 'Take the <b>' + esc(nameOfCard(run[0])) + '</b>' +
        (run.length > 1
          ? ' and the <b>' + (run.length - 1) + '</b> thrown after it — ' +
            '<b>' + run.length + '</b> cards into your hand'
          : ' — the newest card') + '?';
    } else if (canUp) {
      say = 'First turn: take the <b>' + esc(nameOfCard(E.upTop(st))) + '</b> — or draw blind.';
    } else if (canSw) {
      say = 'Draw off the <b>deck</b> — or <b>reach into the spread</b>: tap any card to take it ' +
        'and everything right of it.';
    } else {
      say = 'Draw your card off the <b>deck</b>. The spread is not yours until your <b>45</b> is down.';
    }
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

  const L = st.discard.length;
  $id('gn-mid').innerHTML =
    '<div class="gn-piles">' +
      '<div class="gn-pilebox"><span class="gn-pilelbl">Deck</span>' +
        '<button type="button" class="gn-pilebtn tapme' + (canDraw ? ' can' : (myGo && ph === 'act' ? ' dim' : '')) + '" id="gn-stock" ' +
          'aria-label="Draw a blind card from the deck. ' + st.stock.length + ' left."' +
          (canDraw ? '' : ' aria-disabled="true"') + '>' +
          backHTML() + '<span class="gn-count">' + st.stock.length + '</span></button></div>' +
      '<div class="gn-sprbox"><span class="gn-pilelbl">' +
        (E.canSweep(st, me)
          ? 'Thrown · ' + L + ' · take any card <b>and everything right of it</b>'
          : 'Thrown · ' + L + ' · not yours until your 45 is down') + '</span>' +
        '<div class="gn-spread" id="gn-pile" aria-label="The thrown cards, ' + L +
          ' of them, oldest first. ' +
          (E.canSweep(st, me)
            ? 'Your 45 is down, so you may take any of them together with every card thrown after it.'
            : 'A record only: nobody takes from here until their 45 is down.') + '">' +
        '</div></div>' +
    '</div>' +
    '<div class="gn-say" id="gn-say" role="status" aria-live="polite">' + say + '</div>' +
    '<div class="gn-acts" id="gn-acts"></div>';

  paintSpread(canUp);

  /* the action row: honest buttons under the same taps */
  const acts = $id('gn-acts');
  let h = '';
  /* THE AIMED SWEEP — the second, deliberate press. Nothing has left
     the spread until this is hit, and the run it would take is lit
     on the felt behind it while the player reads the number. */
  if (M.pick != null && canSweepNow()) {
    const run = E.sweepRun(st, M.pick);
    h += '<button type="button" class="gn-act hot tapme" data-a="sweep">Take ' +
      (run.length === 1 ? 'this card' : 'these ' + run.length) + '</button>';
    h += '<button type="button" class="gn-act ghost tapme" data-a="peek">See it whole</button>';
    h += '<button type="button" class="gn-act ghost tapme" data-a="unpick">Cancel</button>';
  } else if (canUp) {
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
}

/* ── THE SPREAD, laid out ─────────────────────────────────────────
   Measured, not guessed: the card size comes off the width the box
   really has and the height the felt can really spare, and the
   number to a row falls out of the two. Everything here is computed
   layout — offsetWidth/clientWidth and inline styles — with nothing
   read back off a painted rect, because painted rects are exactly
   what a headless render cannot be trusted about. */
function spreadMetrics(boxW, hostH) {
  /* wide enough to read at arm's length, short enough that three
     rows of them never eat the hand's budget */
  let w = Math.round(Math.min(58, Math.max(34, boxW * 0.19)));
  w = Math.min(w, Math.round(Math.max(44, hostH * 0.15) / 1.4));
  const h = Math.round(w * 1.4);
  const step = Math.max(10, Math.round(w * SPREAD_SHOW));   /* the sliver on show */
  const per = Math.max(1, Math.floor((boxW - w) / step) + 1);
  return { w, h, step, per };
}

function paintSpread(canUp) {
  const st = M.st;
  const box = $id('gn-pile');
  if (!box) return;
  const cs = getComputedStyle(box);
  const boxW = Math.max(60, box.clientWidth -
    (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0));
  const hostH = M.ctx.host.clientHeight || 500;
  const m = spreadMetrics(boxW, hostH);
  M.spm = m;

  const L = st.discard.length;
  if (!L) {
    box.innerHTML = '<span class="gn-sprempty">Nothing thrown yet</span>';
    box.style.maxHeight = '';
    return;
  }
  const pick = (M.pick != null && M.pick >= 0 && M.pick < L && canSweepNow()) ? M.pick : null;
  if (M.pick != null && pick == null) M.pick = null;      /* the spread moved on */

  const pull = -(m.w - m.step);            /* how far each card sits ON the last */
  let html = '';
  for (let i = 0; i < L; i += m.per) {
    html += '<div class="gn-sprow">';
    const end = Math.min(i + m.per, L);
    for (let j = i; j < end; j++) {
      const c = st.discard[j];
      const newest = j === L - 1;
      const first = j === i;
      /* the run this tap would carry off, lit before it is committed */
      const inRun = pick != null && j >= pick;
      html += '<button type="button" class="gn-dcard tapme' +
        (newest ? (canUp ? ' up' : ' new') : '') +
        (inRun ? (j === pick ? ' run want' : ' run') : (pick != null ? ' faded' : '')) +
        '" data-di="' + j + '" data-c="' + c + '" ' +
        'style="width:' + m.w + 'px;height:' + m.h + 'px' +
        (first ? '' : ';margin-left:' + pull + 'px') + '" ' +
        'aria-label="' + esc(nameOfCard(c)) + ', thrown ' + (j + 1) + ' of ' + L +
        (newest ? ', the newest' : '') + '. Tap to see it whole.">' +
        faceHTML(c) + '</button>';
    }
    html += '</div>';
  }
  box.innerHTML = html;
  box.classList.toggle('aim', pick != null);

  /* the height it may occupy, and the newest rows kept in view */
  /* THE CAP IS A SHARE OF THE FELT, NOT A NUMBER OF ROWS. Sizing it
     at "three rows of whatever the cards happen to be" made it swing
     with the card size and, once reserved, swung the hand with it —
     on a 360 it drove the hand into two rows and off the bottom of
     the felt. A flat share of the host is steady in every state, and
     the row ceiling is left on top of it as a sanity bound. */
  const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const cap = Math.round(Math.min(
    m.h * SPREAD_ROWS_MAX + 4 * (SPREAD_ROWS_MAX - 1) + pad,
    Math.max(m.h + pad + 6, hostH * 0.26)));
  box.style.maxHeight = cap + 'px';
  box.scrollTop = box.scrollHeight;
  /* THE HAND MUST NOT MOVE WHEN A CARD IS THROWN. The spread grows a
     row at a time as the hand goes on, and if the hand's budget were
     measured off the spread AS IT STANDS, every card thrown would
     shave the player's own cards a little. So the cap is published
     here and handMetrics reserves the FULL cap from the start — the
     spread then grows into room already set aside for it, and the
     hand is the same size on the last throw as on the first. */
  M.spm.cap = cap;
  M.spm.h = box.offsetHeight;

  box.querySelectorAll('.gn-dcard').forEach(el => {
    el.onclick = () => {
      if (!M || M.dead) return;
      const i = +el.dataset.di;
      /* ── LOOKING IS NEVER TAKING ────────────────────────────────
         When a sweep is on the table this tap AIMS it and nothing
         more: the run lights up, the strip says what it would cost,
         and the take is a separate, labelled press. A player must
         never carry off half the pile because they wanted to squint
         at a corner — so the destructive move is the one that needs
         the second thumb, and the harmless one (a plain look) is
         still a single tap when there is nothing to take. */
      if (canSweepNow()) {
        M.pick = (M.pick === i) ? null : i;     /* tap again to call it off */
        M.zoom = null;
        cue('ui.tap', { gain: 0.7 });
      } else {
        M.zoom = { c: +el.dataset.c, i };
        M.pick = null;
        cue('ui.tap', { gain: 0.7 });
      }
      render();
    };
  });
}

/* is reaching into the spread available to me, right now? */
function canSweepNow() {
  if (!M || M.dead || !houseReady()) return false;
  const st = M.st;
  return E.turn(st) === M.mySeat && st.phase === 'main' && E.canSweep(st, M.mySeat);
}

/* ── the full card, on tap ────────────────────────────────────────
   "when click it will show full card". It opens inside the middle
   band — never over the hand — says where in the run the card sits,
   and carries the one action that card could ever have (the hand's
   first turn, and only then). Any tap closes it. */
function paintZoom() {
  const mid = $id('gn-mid');
  if (!mid) return;
  const old = mid.querySelector('.gn-zoom');
  if (old) old.remove();
  if (!M.zoom) return;
  const st = M.st;
  const { c, i } = M.zoom;
  if (st.discard[i] !== c) { M.zoom = null; return; }    /* the pile moved on */
  const L = st.discard.length;
  const newest = i === L - 1;
  const takeable = newest && E.turn(st) === M.mySeat && st.phase === 'main' &&
                   houseReady() && E.canTakeUp(st);
  const sweepable = canSweepNow();
  const run = sweepable ? E.sweepRun(st, i) : [];
  const div = document.createElement('div');
  div.className = 'gn-zoom';
  div.innerHTML =
    '<span class="gn-zc">' + faceHTML(c) + '</span>' +
    '<span class="gn-zt">' +
      '<b>' + esc(nameOfCard(c)) + '</b>' +
      '<i>Thrown <b>' + (i + 1) + '</b> of ' + L + (newest ? ' — the newest' : '') + '.<br>' +
        'Worth ' + E.pts(c) + ' if it is caught in a hand.' +
        (sweepable
          ? '<br>Reaching here takes <b>' + run.length + '</b> card' +
            (run.length === 1 ? '' : 's') + ' — this one and everything right of it.'
          : '') + '</i>' +
      (takeable
        ? '<button type="button" class="gn-act tapme" id="gn-ztake">Take it</button>'
        : sweepable
          ? '<button type="button" class="gn-act hot tapme" id="gn-zsweep">Take ' +
              (run.length === 1 ? 'this card' : 'these ' + run.length) + '</button>'
          : '<i>Thrown cards stay thrown until your 45 is down — until then the deck ' +
            'is the only place to draw.</i>') +
      '<button type="button" class="gn-act ghost tapme" id="gn-zx">Close</button>' +
    '</span>';
  mid.appendChild(div);
  const shut = () => { M.zoom = null; render(); };
  div.onclick = ev => { if (ev.target === div) shut(); };
  div.querySelector('#gn-zx').onclick = () => { cue('ui.tap', { gain: 0.6 }); shut(); };
  const tk = div.querySelector('#gn-ztake');
  if (tk) tk.onclick = () => { M.zoom = null; act('take'); };
  const sw = div.querySelector('#gn-zsweep');
  if (sw) sw.onclick = () => { M.zoom = null; M.pick = i; act('sweep'); };
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
  else if (a === 'sweep') {
    if (M.pick == null || !canSweepNow()) return;
    mv = { t: 'sweep', i: M.pick };
  } else if (a === 'unpick') { M.pick = null; cue('ui.tap', { gain: 0.6 }); render(); return; }
  else if (a === 'peek') {
    /* the look, from the aimed state: the card you are reaching for,
       shown whole, WITHOUT taking anything */
    if (M.pick == null) return;
    M.zoom = { c: M.st.discard[M.pick], i: M.pick, aimed: true };
    cue('ui.tap', { gain: 0.7 });
    render();
    return;
  }
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
  M.sel = null;
  if (mv.t === 'sweep') M.pick = null;         /* the reach is spent */
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

/* ── YOUR TABLE — the melds you have down ─────────────────────────
   It is never hidden any more. Held shut it is still your table, so
   it says what would open it and shows how near you are; the moment
   you go down it fills with the cards and keeps filling all game.
   That is what the felt's spare height is FOR — the old build parked
   the slack in the middle as empty blue, which is the thing the
   owner complained about. */
function paintTable() {
  const st = M.st, me = M.mySeat;
  const box = $id('gn-tbl');
  if (!box) return;
  box.style.display = '';
  const mine = [];
  st.table.forEach((t, ti) => { if (t.by === me) mine.push(ti); });

  if (!st.down[me] && !mine.length) {
    /* the deliberate empty table: what it is, and the one number
       that puts cards on it, drawn as progress towards 45 */
    const n = dashNums();
    const mv = n.open ? st.open : n.mv;
    const frac = Math.max(0, Math.min(1, mv / (st.open || 45)));
    box.className = 'gn-tbl shut';
    box.innerHTML =
      '<span class="gn-tlbl">Your<br>table</span>' +
      '<span class="gn-tblwait">' +
        'Nothing down yet. Match <b>45</b> in melds and put them here — ' +
        'then the table is yours to feed.' +
        '<span class="gn-tblbar" role="img" aria-label="' + mv + ' of ' + st.open + ' towards opening">' +
          '<i style="transform:scaleX(' + frac.toFixed(3) + ')"></i></span>' +
      '</span>';
    return;
  }

  box.className = 'gn-tbl';
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
  const feltEl = $id('gn-felt');
  if (feltEl) feltEl.classList.remove('specing');
  if (!M.spec) return;
  const st = M.st, me = M.mySeat, foe = 1 - me;
  if (!st.down[me]) { M.spec = false; return; }   /* the gate re-checks itself */

  /* ── EVERY TABLE, BY NAME ─────────────────────────────────────
     The owner: "Tables tab can make dynamic — show name who's are
     out — and we need to make it with row. And if more than 5 out
     make it as table, and the middle needs to grow that space."

     So this is no longer just a peek at the other chair. It is the
     whole felt: every pile that has been put out, each carrying the
     NAME of whoever put it there — which is the thing you actually
     need, because a lay scores for whoever lays it and every pile on
     the table is somewhere your cards may go, yours included.
     One pile per ROW while they are few; past five the rows become
     a GRID, because a sixth row of one meld each is a scroll where a
     table would have been. */
  let body = '';
  const piles = st.table.map((t, ti) => ({ t, ti }));

  /* who is where, in one line each — the "who's are out" */
  body += '<div class="gn-who">';
  for (const s of [me, foe]) {
    const n = st.table.filter(t => t.by === s).length;
    body += '<span class="gn-whorow' + (st.down[s] ? ' out' : '') + '">' +
      '<b>' + esc(st.seats[s].name) +
        (s === me && !/^you$/i.test(st.seats[s].name) ? ' (you)' : '') + '</b>' +
      (st.down[s]
        ? '<i>out · ' + n + ' pile' + (n === 1 ? '' : 's') + ' · <b>+' + st.laid[s] + '</b> laid · ' +
          st.seats[s].hand.length + ' in hand</i>'
        : '<i>not out yet · ' + st.seats[s].hand.length + ' in hand</i>') +
      '</span>';
  }
  body += '</div>';

  if (piles.length) {
    /* past five piles this stops being a list and becomes a table */
    body += '<div class="gn-tabs' + (piles.length > SPEC_ROWS_MAX ? ' grid' : '') + '">';
    for (const p of piles) {
      const mine = p.t.by === me;
      body += '<div class="gn-trow' + (mine ? ' mine' : '') + '">' +
        '<span class="gn-tname">' + esc(seatName(p.t.by)) + '</span>' +
        meldHTML(p.t, p.ti) +
        '<span class="gn-tval">+' + E.handPts(p.t.cs) + '</span>' +
        '</div>';
    }
    body += '</div>';
  } else {
    body += '<div class="gn-note">Nothing is out yet. The first 45 opens the table.</div>';
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

  const felt = $id('gn-felt');
  if (felt) felt.classList.add('specing');
  const div = document.createElement('div');
  div.className = 'gn-spec';
  div.innerHTML =
    '<h4><span>The tables · ' + st.table.length + ' out</span>' +
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
    let need = 0, inFlow = 0;
    for (let i = 0; i < mid.children.length; i++) {
      const el = mid.children[i];
      /* the spectator sheet and the zoomed card are absolute overlays
         ON the middle band, not rows IN it — counting them would
         reserve their height twice and starve the hand */
      if (el.classList && (el.classList.contains('gn-spec') ||
                           el.classList.contains('gn-zoom'))) continue;
      need += el.offsetHeight;
      inFlow++;
    }
    need += 6 * Math.max(0, inFlow - 1);
    /* …plus the room the spread has NOT grown into yet (see the cap
       note in paintSpread): reserved from the first throw, so the
       hand never shifts as the pile builds up */
    if (M.spm && M.spm.cap) need += Math.max(0, M.spm.cap - (M.spm.h || 0));
    minMid = Math.min(Math.max(need, 96), hostH * 0.55);
  }
  const felt = $id('gn-felt');
  let chrome = 34;
  if (felt) {
    const cs = getComputedStyle(felt);
    chrome = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) +
             (parseFloat(cs.rowGap) || parseFloat(cs.gap) || 0) * 3 + 6;
  }
  /* YOUR TABLE is the band that takes the felt's slack (flex:1), so
     what it MEASURES is whatever was left over — feed that back into
     the hand's budget and the two would chase each other, the hand
     shrinking every time a meld went down. It is reserved at its
     MINIMUM instead, which is the only part of it the hand actually
     has to make way for; the table keeps the rest by growing into
     what the hand does not take. */
  const TBL_MIN = 64;                                 /* matches .gn-tbl min-height */
  const tblH = Math.min(hOf('gn-tbl') || TBL_MIN, TBL_MIN);
  const budget = Math.max(90, hostH - hOf('gn-top') - hOf('gn-dash') - tblH - minMid - chrome);

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

/* ── the shared winner screen (js/rebbieh.js), and its till ──────────
   This file's own voice is English by design; the shared podium is
   bilingual everywhere else in the box, so the few strings this section
   adds carry both tongues through the house helper. */
const TW = (en, mt) => (window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en);

/* Is this table a staked room right now? Read off js/mp.js's own pot
   record, exactly the way progress.js reads it for the ranked rate. */
function stakedNow() {
  try { return !!(window.KARTI_MP && KARTI_MP.MP && KARTI_MP.MP.stakeLive); }
  catch (e) { return false; }
}
/* Settle the pot by name. mp.js's ceremony hangs off KARTI_PARTY.ui.result,
   which the podium path never calls, so the podium asks for the settle
   itself. Idempotent twice over — mp.js's settled flag and progress.js's
   id guard — and a friendly or offline table has no stakeLive record, so
   this returns null and not a chip moves. */
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

/* THE PAY, podium path only. When P.ui.result is never called, the wrap
   progress.js hangs on it never fires — so the podium pays through the one
   door built for it, KARTI_XP.awardPlay, with the match seed as the id: a
   resign and a finish for the same match share the id, so however many of
   these paths fire, the wallet moves once. The record book (offline only,
   the same gate P.record had) is told under the SAME id, so its own
   forward into the ladder is refused as already paid. */
function payMatch(tone) {
  const id = 'g' + M.seed.toString(36);
  let pay = null;
  try {
    pay = KARTI_XP.awardPlay({ game: 'gin', won: tone === 'win',
                               draw: tone === 'draw', id, ranked: stakedNow() });
  } catch (e) {}
  if (!M.net) {
    try {
      if (window.KARTI_STATS && KARTI_STATS.record)
        KARTI_STATS.record('gin', { result: tone === 'win' ? 'w' : tone === 'draw' ? 'd' : 'l', id });
    } catch (e) {}
  }
  return pay;
}

/* ONE predicate for "the podium will take this result", asked by finish()
   BEFORE it touches the ledger: on the podium path payMatch() is the whole
   economy, and P.record firing beside it would pay the same match twice
   with no id to refuse it by. */
function podiumUp() {
  const R2 = window.KARTI_REBBIEH;
  return !!(R2 && R2.show && window.KARTI_XP && KARTI_XP.awardPlay);
}

/* The podium itself — a heads-up table, so two columns on a stand built
   for three, winner in the middle. Returns false when rebbieh is not on
   the page and the caller puts its own card up instead: that fallback is
   not decoration, it is the screen a stripped build actually shows. */
function winnerScreen(o) {
  const R2 = window.KARTI_REBBIEH;
  if (!podiumUp()) return false;
  const me = M.mySeat;
  const pay = payMatch(o.tone);
  const stk = settleStake(o.tone);
  const order = o.tone === 'win' ? [me, 1 - me] : [1 - me, me];
  const rows = order.map((s, i) => ({
    name: M.st.seats[s].name,
    place: i + 1,
    you: s === me,
    bot: !M.net && s !== me,
    score: o.pts[s] + ' ' + TW('pts', 'punti'),
    border: i === 0 ? 'gold' : 'ruby'
  }));
  const back = () => { const n = M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); };
  R2.show({
    lang: window.KARTI_LANG ? KARTI_LANG.lang() : 'en',
    title: o.title, subtitle: o.subtitle, rows,
    xp: pay && pay.counted
      ? { level: pay.level, gained: pay.xp, leveledUp: !!pay.levelled,
          /* fractions unknown to us; a satisfying near-full bar */
          before: 0, after: pay.levelled ? 1 : 0.7 }
      : null,
    reward: rewardOf(pay, stk),
    sound: id => cue(id, { gain: 0.6 }),
    /* A ROOM IS NOT DEALT AGAIN FROM HERE — same law as the card below:
       online, the only honest button is the one back to the room list. */
    playAgainLabel: M.net ? TW('Back to the rooms', 'Lura lejn il-kmamar')
                          : TW('Deal again', 'Erġa’ qassam'),
    onPlayAgain: M.net ? back : () => { const op = M.opts; leave(); newGame(op); },
    onLeave: M.net ? back : () => { leave(); P.hub(); }
  });
  return true;
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
    /* the party ledger only on the card path: the podium path's whole
       economy is payMatch() (awardPlay + the record book under one id),
       and P.record beside it would pay this same match a second time */
    /* The podium path pays itself (payMatch: awardPlay + the record book under
       one id), so `record` - which progress.js wraps to pay - must not fire
       beside it. `tally` is the same shelf ledger with no award attached, so
       the W-L badge under the Gin tile keeps counting either way. */
    try {
      if (podiumUp()) P.tally && P.tally('gin', won ? 'w' : 'l');
      else P.record('gin', won ? 'w' : 'l');
    } catch (e) {}
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
  if (winnerScreen({
    tone: won ? 'win' : 'lose',
    title: won ? TW('Match yours', 'Il-partita tiegħek')
               : TW('Match theirs', 'Il-partita tagħhom'),
    subtitle: why,
    pts: fin.raw
  })) return;
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

  /* the fold header's one line says what the rules below will say —
     hand and target — so the fold explains itself while shut */
  const foldHint = () =>
    (hand === 13 ? 'Thirteen' : 'Ten') + ' cards, first to ' + target + ' — tap to ' +
    (setupOpen ? 'fold them away.' : 'read them.');

  /* ── the hero, shared by both screens — the 45 laid face up. Decoration
     only (aria-hidden). Card indices are klabb's suit*13+(rank-1):
     0 = A of spades, 13 = A of hearts, 26 = A of diamonds. ── */
  const heroHTML =
    '<div class="gn-hero" aria-hidden="true">' +
      '<span class="gn-hero-m">' +
        '<span class="gn-mcard">' + faceHTML(0) + '</span>' +
        '<span class="gn-mcard">' + faceHTML(13) + '</span>' +
        '<span class="gn-mcard">' + faceHTML(26) + '</span>' +
      '</span>' +
      '<i class="gn-hero-eq">=</i>' +
      '<b class="gn-hero-tag">45</b>' +
      '<span class="gn-hero-open">The table is open</span>' +
      '<span class="gn-hero-cap">IL-45</span>' +
    '</div>';

  const CHEV = '<span class="gn-mchev"><svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M9 6l6 6-6 6"/></svg></span>';

  /* ═══════════════════════════════════════════════════════════════
     SCREEN ONE — the entry. Hero, one line, and the big choices:
     PLAY ONLINE, PLAY WITH AI, HOW TO PLAY. No settings here — the
     hand/level/target wall lives on screen two, after PLAY WITH AI,
     so starting a game is one tap. The rules read as a sliding sheet,
     bomba's shape, restated in this game's scope.
     ═══════════════════════════════════════════════════════════════ */
  let msheetOpen = false;
  function menuRulesSheet() {
    let sheet = el.querySelector('#gn-msheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.className = 'gn-msheet';
      sheet.id = 'gn-msheet';
      sheet.setAttribute('aria-hidden', 'true');
      sheet.innerHTML =
        '<div class="gn-msheet-h"><h4>GIN RUMMY — the rules</h4>' +
          '<button class="gn-msheet-x" id="gn-msheet-x" aria-label="Put the rules away">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button></div>' +
        '<div class="gn-msheet-b"><ul>' +
          rulesFor(10, 300).map(r => '<li>' + r + '</li>').join('') + '</ul></div>';
      el.appendChild(sheet);
      sheet.querySelector('#gn-msheet-x').onclick = () => toggleMenuRules(false);
    }
    return sheet;
  }
  function toggleMenuRules(open) {
    const sheet = menuRulesSheet();
    msheetOpen = (open == null) ? !msheetOpen : !!open;
    sheet.classList.toggle('open', msheetOpen);
    sheet.setAttribute('aria-hidden', msheetOpen ? 'false' : 'true');
    try { sheet.style.maxHeight = Math.max(160, Math.floor(window.innerHeight * 0.7)) + 'px'; } catch (e) {}
    cue(msheetOpen ? 'ui.sheet' : 'ui.back', { gain: 0.7 });
  }

  function paintMenu() {
    msheetOpen = false;
    el.innerHTML =
      '<div class="pt-wrap gn-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="gn-back" aria-label="Back">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>GIN RUMMY</h2>' +
      '</div>' +
      '<div class="scroll">' +
        heroHTML +
        '<p class="blurb">The house game: match <b>45 points of melds</b> and put them down ' +
        '<b>face up</b> — that opens you, and the hand carries on. First hand played empty takes ' +
        '<b>+' + E.OUT_BONUS + '</b>; whatever stays in a hand counts <b>against</b> it.</p>' +
        (oldSaveDropped
          ? '<p class="pt-warn">Your half-played match was under the old rules, where putting ' +
            'your cards down ended the hand. The game has grown — going down now <b>opens</b> you, ' +
            'the table is live, and there is a bonus for going out — so that save was retired ' +
            'rather than counted wrongly.</p>'
          : '') +
        /* a half-played match comes FIRST, gold — on a return visit the
           likeliest tap should be the top one */
        (ST.save
          ? '<button class="btn primary" id="gn-res" style="margin:2px 0 12px">' +
            'Carry on the saved match</button>'
          : '') +
        '<div class="gn-modes">' +
          (online
            ? '<button class="gn-mode primary" id="gn-m-online">' +
                '<span class="gn-mi"><svg viewBox="0 0 24 24" aria-hidden="true">' +
                  '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>' +
                '</svg></span>' +
                '<span class="gn-mt"><b>Play online</b>' +
                  '<i>Open a gin room, or take one that is waiting. The player who opens sets the hand size.</i></span>' +
                CHEV +
              '</button>'
            : '') +
          '<button class="gn-mode' + (online ? '' : ' primary') + '" id="gn-m-ai">' +
            '<span class="gn-mi"><svg viewBox="0 0 24 24" aria-hidden="true">' +
              '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4M9 4h6"/>' +
              '<circle cx="9.5" cy="13" r="1"/><circle cx="14.5" cy="13" r="1"/></svg></span>' +
            '<span class="gn-mt"><b>Play with AI</b>' +
              '<i>You against the machine. Pick the hand, the level and the target.</i></span>' +
            CHEV +
          '</button>' +
          '<button class="gn-mode" id="gn-m-rules">' +
            '<span class="gn-mi"><svg viewBox="0 0 24 24" aria-hidden="true">' +
              '<path d="M4 5h9a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H4zM20 5h-9a3 3 0 0 0-3 3"/></svg></span>' +
            '<span class="gn-mt"><b>How to play</b>' +
              '<i>The rules, in a minute.</i></span>' +
            CHEV +
          '</button>' +
        '</div>' +
        (online
          ? ''
          : '<p class="pt-warn" style="margin-top:2px">Online gin needs the KARTI server to learn the ' +
            'word "gin" — until then it is you against the machine here.</p>') +
        '<div style="height:16px"></div>' +
      '</div></div>';

    el.querySelector('#gn-back').onclick = () => P.hub();
    el.querySelector('#gn-m-ai').onclick = () => paintSetup();
    el.querySelector('#gn-m-rules').onclick = () => toggleMenuRules(true);
    const on = el.querySelector('#gn-m-online');
    if (on) on.onclick = () => { try { MPX.openFor('gin'); } catch (e) {} };
    const r = el.querySelector('#gn-res');
    if (r) r.onclick = () => {
      const s = ST.save;
      if (!s) return;
      startMatch(s.opts, s.seed, s.log);
      M.arr = Array.isArray(s.arr) ? s.arr.slice() : [];
      openBoard();
    };
    /* a tap outside the rules sheet puts it away */
    el.addEventListener('pointerdown', e => {
      if (!msheetOpen) return;
      const sheet = el.querySelector('#gn-msheet');
      if (sheet && !sheet.contains(e.target)) toggleMenuRules(false);
    }, true);
  }

  /* ═══════════════════════════════════════════════════════════════
     SCREEN TWO — the AI setup. Reached only from PLAY WITH AI. The
     hand/level/target/hints wall, Deal, and the folded rules — with
     the defaults already chosen from ST.pref so Deal is right there.
     Back here returns to screen one, no popup.
     ═══════════════════════════════════════════════════════════════ */
  function paintSetup() {
    el.innerHTML =
      '<div class="pt-wrap gn-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="gn-back" aria-label="Back">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>PLAY WITH AI</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<button class="btn primary" id="gn-go" style="margin:6px 0 14px">Deal</button>' +
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
        /* ── the rules, FOLDED, at the bottom — rummy's slide, this
           game's words. Closed by default, remembered in the UI-only
           key, and the text follows the hand size and target above. ── */
        '<div class="kb-rules" style="margin:16px 2px 20px;padding:2px 14px;border-radius:14px;' +
          'background:rgba(255,255,255,.04);border:1px solid var(--line)">' +
          '<button type="button" class="gn-fold-h" id="gn-srules-h" aria-controls="gn-srules-b"' +
            ' aria-expanded="' + (setupOpen ? 'true' : 'false') + '">' +
            '<span><b>The rules, as we play them</b>' +
            '<i id="gn-srules-i">' + foldHint() + '</i></span>' +
            '<em aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></em>' +
          '</button>' +
          '<div class="gn-fold-b' + (setupOpen ? ' open' : '') + '" id="gn-srules-b">' +
            '<div class="gn-fold-i"><ul style="margin:6px 0 12px;padding:0">' +
              rulesFor(hand, target).map(r => '<li style="font-size:12px;line-height:1.65;' +
                'color:var(--dim);margin:0 0 6px 16px">' + r + '</li>').join('') +
            '</ul></div></div>' +
        '</div>' +
      '</div></div>';
    el.querySelector('#gn-back').onclick = () => paintMenu();
    el.querySelectorAll('[data-hand]').forEach(b => b.onclick = () => { hand = +b.dataset.hand; paintSetup(); });
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { lvl = +b.dataset.lvl; paintSetup(); });
    el.querySelectorAll('[data-tgt]').forEach(b => b.onclick = () => { target = +b.dataset.tgt; paintSetup(); });
    el.querySelectorAll('[data-hints]').forEach(b => b.onclick = () => {
      ST.pref.hints = !ST.pref.hints; persist(); paintSetup();
    });
    el.querySelector('#gn-go').onclick = () => {
      ST.pref.lvl = lvl; ST.pref.target = target; ST.pref.hand = hand; persist();
      newGame({ lvl, target, hand });
    };
    /* the fold toggles WITHOUT repainting, so the slide actually
       slides; changing the hand or target above repaints and brings
       the right words into whatever state the fold is in */
    const sh = el.querySelector('#gn-srules-h');
    if (sh) sh.onclick = () => {
      setSetupOpen(!setupOpen);
      sh.setAttribute('aria-expanded', setupOpen ? 'true' : 'false');
      const b = el.querySelector('#gn-srules-b');
      if (b) b.classList.toggle('open', setupOpen);
      const hint = el.querySelector('#gn-srules-i');
      if (hint) hint.textContent = foldHint();
      cue(setupOpen ? 'ui.sheet' : 'ui.back', { gain: 0.8 });
    };
  }

  paintMenu();
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
      sending {a:'house45s', i:hand} — the host with its hand size,
      the guest with 0 as a plain ack. An OLD build receiving
      'house45s' refuses it by name ("a move gin rummy does not know
      how to make") and stops the room honestly before a card is
      touched. The older builds' own hellos are refused here just as
      honestly, each with its own truthful message: 'house45o' (the
      spread-is-only-a-record build — the dangerous one, because it
      agrees about everything EXCEPT the sweep and would desync
      mid-hand with points already scored), 'house45' (the
      45-ends-it build) and 'house' (the knock build).
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
/* THE WORD CHANGES WHENEVER THE RULES DO, and restoring the sweep is
   exactly that. The build before this one also said 'house45o' but
   played the spread as a pure record: pair the two and they would
   shake hands happily, agree a hand size, and run in step until the
   first time somebody reached into the spread — at which point one
   phone has seven more cards than the other and the fingerprint
   catches it mid-hand, with points already on the board. Refusing at
   the door instead costs nobody a scored hand. */
const HELLO = 'house45s';                        /* s for the SWEEP game */

function onlineStart(o) {
  o = o || {};
  const sharedLobby = Array.isArray(o.seats) && o.net;
  const seed = sharedLobby ? ((o.seed >>> 0) || 1) : netSeed();
  let mySeat, names, host, net;
  if (sharedLobby) {
    const chairs = o.seats.filter(Boolean);
    if (chairs.length !== 2) throw new Error('GIN: exactly two seats are required');
    const hostAtZero = (seed & 1) === 0;
    const roomToGame = roomSeat => roomSeat === (o.host | 0)
      ? (hostAtZero ? 0 : 1) : (hostAtZero ? 1 : 0);
    mySeat = roomToGame(o.you | 0);
    names = ['', ''];
    chairs.forEach((s, i) => {
      const roomSeat = typeof s.seat === 'number' ? s.seat : i;
      names[roomToGame(roomSeat)] = s.name || ('Player ' + (i + 1));
    });
    host = (o.you | 0) === (o.host | 0);
    const roomNet = o.net;
    net = Object.assign({}, roomNet, {
      send: (kind, m, ck) => roomNet.send({ kind, m: m || null, ck: ck || null })
    });
  } else {
    mySeat = o.colour === 'w' ? 0 : 1;
    names = mySeat === 0 ? [o.me, o.foe] : [o.foe, o.me];
    host = iAmRoomHost();
    net = o;
  }
  const owns = mySeat === 0 ? ['me', 'net'] : ['net', 'me'];
  const myHand = ST.pref.hand === 13 ? 13 : 10;
  const hand = host ? myHand : 10;
  startMatch({ lvl: 2, target: 300, names, owns, dealer: 1, hand }, seed);
  M.mySeat = mySeat;
  M.net = net;
  M.house = { settled: host, host, want: hand, tries: 0 };
  M.arr = (ST.netArr && ST.netArr.seed === seed && Array.isArray(ST.netArr.arr))
    ? ST.netArr.arr.slice() : [];
  openBoard();
  P.ui.setNet(M.ctx, net.note || '', '');

  /* the hello — both phones, always (rule 1) */
  try { net.send('move', { a: HELLO, i: host ? hand : 0 }, null); } catch (e) {}
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
      'gin. This build plays the open game: put the 45 down, then each turn take the deck ' +
      'OR reach into the spread for any card and everything right of it, lay on anybody, ' +
      'first hand empty wins +' + E.OUT_BONUS + '. Update both phones and deal again. ' +
      'Nothing was scored.', 'cheat');
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
  if (d.m && d.m.a === 'house45o')
    return { why: 'a gin hand from the build where the discard pile was only a record. ' +
      'In this one, once your 45 is down you may take any card in the spread and ' +
      'everything right of it. Update both phones' };
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
  if (winnerScreen({
    tone: 'win',
    title: TW('They resigned', 'Huma ċedew'),
    subtitle: TW('The match is yours. Score at the walk-out: ',
                 'Il-partita tiegħek. Il-punti mat-tluq: ') +
              M.st.match.pts[M.mySeat] + '–' + M.st.match.pts[1 - M.mySeat] + '.',
    pts: M.st.match.pts
  })) { if (M.net && M.net.onEnd) { try { M.net.onEnd({ resign: true }); } catch (e) {} } return; }
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
  if (winnerScreen({
    tone: 'lose',
    title: TW('You resigned', 'Int ċedejt'),
    subtitle: TW('The match goes to ', 'Il-partita tmur għand ') +
              M.st.seats[1 - M.mySeat].name + '.',
    pts: M.st.match.pts
  })) { if (M.net && M.net.onEnd) { try { M.net.onEnd({ resign: true }); } catch (e) {} } return; }
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

/* the lobby contract used by the shared two-seat ready room */
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
  /* THE HOST'S ONE DIAL — the shared lobby's Rules button. Gin's
     host-changeable rule is the HAND SIZE: ten cards or thirteen. Each
     variant carries the relay's word and a bilingual label; the host
     picks, mp.js sends {t:'setvariant'}, the relay re-broadcasts, and
     every seat repaints. applyVariant writes ST.pref.hand so the online
     start()'s `hand: ST.pref.hand === 13 ? 13 : 10` reaches the deal. */
  variants: [
    { net: 'g10', label: { en: 'Gin · ten cards',      mt: 'Gin · għaxra'  } },
    { net: 'g13', label: { en: 'Gin · thirteen cards', mt: 'Gin · tlettax' } }
  ],
  currentVariant: () => (ST.pref.hand === 13 ? 'g13' : 'g10'),
  applyVariant: net => {
    ST.pref.hand = (net === 'g13') ? 13 : 10;
    persist();
    return { variant: (net === 'g13') ? 'g13' : 'g10' };
  },
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
      menu: () => setupSheet(),
      resume: () => { const s = ST.save; if (!s) return false;
        startMatch(s.opts, s.seed, s.log); M.arr = (s.arr || []).slice(); openBoard(); return true; },
      store: () => ST,
      fast: on => { FAST = !!on; },
      spec: on => { if (M) { M.spec = !!on; render(); } },
      doMove, render, E,
      wireOf, moveFromWire,
      /* the whole match rebuilt from (opts, seed, log) — the same
         operation undo and the two phones use, exposed so a test can
         prove a log containing sweeps still replays to the bit */
      rebuild: () => buildState(M.opts, M.seed, M.log),
      net: { start: onlineStart, remote: onlineRemote }
    };
  }
} catch (e) {}

})();

/* ═══════════════════════════════════════════════════════════════════
   GIN — THE KIT SHELF (purely cosmetic, always)
   The table-edge trims only. The felts and card backs that used to be
   declared here were retired when the ONE shared deck arrived — every
   card game now wears the same back and felt, registered under game
   'karti' in js/deck-kit.js, which also migrated anything a player
   owned or wore from this shelf. The trims stay: an edge is furniture,
   not the deck. Unequipped = empty sheet = stock. The style node is
   re-appended on every change so it always lands after gn-runtime-css.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var TRIMS = {
  'gin.trim.deheb': { e:'rgba(255,197,66,.5)',   r:'rgba(255,197,66,.26)' },
  'gin.trim.ram':   { e:'rgba(222,138,110,.55)', r:'rgba(222,138,110,.25)' }
};

function sheet(){
  var st = document.getElementById('gnx-kit-css');
  if (!st){ st = document.createElement('style'); st.id = 'gnx-kit-css'; }
  /* appendChild MOVES an existing node to the end — always after the
     game's own sheet, and #app out-specifies it besides */
  document.head.appendChild(st);
  return st;
}

function apply(){
  var XP = window.KARTI_XP;
  if (!XP) return;
  var css = '';
  var t = TRIMS[XP.equipped('trim', 'gin') || ''];
  /* the ring stands in for the stock 1px white liner but the depth
     shadows stay — dropping them would flatten the whole felt */
  if (t) css += '#app #scr-party .gn-felt{border-color:' + t.e +
    ';box-shadow:inset 0 0 0 1px ' + t.r +
    ',inset 0 2px 0 rgba(255,255,255,.07),inset 0 -22px 40px rgba(0,0,0,.45)}';
  sheet().textContent = css;
}

var STOCK_FELT = 'radial-gradient(115% 78% at 50% 30%,#2B4C74 0%,#1A2E4A 46%,#0E1B2D 100%)';

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
  if (!XP || !document.body){
    if (tries < 40) setTimeout(function(){ boot(tries + 1); }, 500);
    return;
  }
  var KIT = XP.forGame('gin');
  KIT.register([
    { slot:'trim', id:'gin.trim.deheb', level:28, name:'Faxxa tad-Deheb',
      blurb:'A gold band around the felt. Knock politely.', preview:trimPv(TRIMS['gin.trim.deheb']) },
    { slot:'trim', id:'gin.trim.ram',   level:47, name:'Faxxa tar-Ram',
      blurb:'Copper edging. This far in, you have earned the good table.', preview:trimPv(TRIMS['gin.trim.ram']) }
  ]);
  KIT.onChange(apply);
  apply();
}
boot(0);

})();
