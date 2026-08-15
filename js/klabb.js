/* ═══════════════════════════════════════════════════════════════════
   KARTI — klabb.js
   PLAYING CARDS — the ordinary deck, in the party-games drawer.

   One tile on the Party Games shelf, "Playing Cards", opens a menu of
   real games played with a real 52-card pack. Nothing here has
   anything to do with the KARTI duel: no collection, no rarity, no
   coins. Just the deck your nannu keeps in the drawer with the elastic
   band round it.

   WHAT THIS FILE IS
     · the deck itself — a 52-card pack drawn as SVG (see THE DECK)
     · the mode menu
     · the table furniture every game here borrows: the hand fan, the
       trick pool, the pass-the-phone veil, the scorebook sheet
     · the match runner: seats, turn order, the move log, undo, the
       autosave, and the hooks js/mp.js needs to roll a seat's move
       back over the wire

   WHAT IT IS NOT
     · it owns no rules. js/klabb-briscola.js, js/klabb-sette.js and
       js/klabb-cheat.js hold their own engines and register here.

   HOUSE RULES THIS FILE OBEYS
     · index.html and css/ belong to other parts of the build, so the
       stylesheet is injected at runtime the way js/mp.js and
       js/party.js do it.
     · we borrow js/party.js's screen (#scr-party) and its frame, so
       Escape, the back arrow and the "another screen took over"
       MutationObserver all keep working without being written twice.
     · persistence lives in karti_klabb_v1 and nowhere else. The card
       game's karti_save_* is not ours to touch, and neither is
       karti_party_v1 beyond the win/loss ledger party.js exposes.
     · NO unicode playing-card characters (U+1F0A1 and friends), and no
       ♠♥♦♣ in anything that has to be read. Some phones render that
       block as colour emoji and some render it as tofu; this project
       has already been bitten once by exactly that with the chess
       glyphs. Every pip and every court on screen is drawn geometry.

   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
if (!K || !P) return;

const esc = K.esc || (s => String(s == null ? '' : s));
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');

/* ═══════════════════════════════════════════════════════════════════
   OUR CORNER OF localStorage
   pref : {<gameId>:{...}}  — the last setup sheet answered
   rec  : {<gameId>:{w,l,d}} — results, ours as well as party.js's
   save : {<gameId>:<snapshot>} — ONE game in progress per mode, so
          closing the app mid-hand and coming back tomorrow picks the
          same hand up rather than dealing a new one.
   ═══════════════════════════════════════════════════════════════════ */
const STORE = 'karti_klabb_v1';
let ST = { v:1, pref:{}, rec:{}, save:{} };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object'){
    ST.pref = (j.pref && typeof j.pref === 'object') ? j.pref : {};
    ST.rec  = (j.rec  && typeof j.rec  === 'object') ? j.rec  : {};
    ST.save = (j.save && typeof j.save === 'object') ? j.save : {};
  }
} catch(e){}
let persistPending = 0;
function persist(){
  /* the runner saves after every single move; batching one frame of
     them keeps a fast AI round from writing localStorage six times */
  if (persistPending) return;
  persistPending = setTimeout(() => {
    persistPending = 0;
    try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){}
  }, 0);
}
function pref(id, patch){
  const p = ST.pref[id] || (ST.pref[id] = {});
  if (patch){ Object.assign(p, patch); persist(); }
  return p;
}
function record(id, outcome){
  const r = ST.rec[id] || (ST.rec[id] = { w:0, l:0, d:0 });
  if (outcome === 'w' || outcome === 'l' || outcome === 'd') r[outcome]++;
  persist();
  return r;
}
function recOf(id){ return ST.rec[id] || { w:0, l:0, d:0 }; }
function saveSlot(id, snap){
  if (snap) ST.save[id] = snap; else delete ST.save[id];
  persist();
}
function savedSlot(id){ return ST.save[id] || null; }

/* ═══════════════════════════════════════════════════════════════════
   RANDOMNESS THAT CAN BE REPLAYED
   Every shuffle in every game here draws from an RNG whose whole state
   is one integer living INSIDE the game state. Nothing else in any
   engine is allowed to call Math.random.

   That single rule is what makes undo honest. A move log plus the deal
   seed replays to a bit-identical state, so rolling a move back is not
   "put the card back and hope" — it is deal again, replay n-1 moves,
   and you are provably where you were. It is also what lets an online
   takeback be agreed by four people who each recompute the same board.
   ═══════════════════════════════════════════════════════════════════ */
function rnd(st){
  /* mulberry32 — small, fast, and good enough to shuffle a deck */
  st.rs = (st.rs + 0x6D2B79F5) | 0;
  let t = st.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rint(st, n){ return Math.floor(rnd(st) * n) % n; }
function shuffle(st, arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = rint(st, i + 1);
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
function newSeed(){ return (Math.random() * 0xFFFFFFFF) >>> 0; }
const clone = o => JSON.parse(JSON.stringify(o));

/* ═══════════════════════════════════════════════════════════════════
   THE DECK — the model
   A card is ONE SMALL INTEGER, 0..51:  id = suit*13 + (rank-1)
     suit 0 Spades · 1 Hearts · 2 Diamonds · 3 Clubs
     rank 1 Ace … 11 Jack · 12 Queen · 13 King
   Integers because the whole state is JSON-cloned on every move for
   the undo log, and because a move log of integers is a tiny thing to
   push down a socket.

   Malta plays with the international 52-card pack. The 40-card games
   here (Bixkla, Briscola, Sette e Mezzo) strip the 8s, 9s and 10s from
   that same pack — which is how the Maltese deck ends up with a Jack
   sitting in the Italian knight's chair. See js/klabb-briscola.js.
   ═══════════════════════════════════════════════════════════════════ */
const SUITS = [
  { k:'S', n:'Spades',   mt:'Spadi',  red:false },
  { k:'H', n:'Hearts',   mt:'Koppi',  red:true  },
  { k:'D', n:'Diamonds', mt:'Dinari', red:true  },
  { k:'C', n:'Clubs',    mt:'Mazzi',  red:false }
];
const RANK_SHORT = ['','A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RANK_LONG  = ['','Ace','Two','Three','Four','Five','Six','Seven','Eight',
                    'Nine','Ten','Jack','Queen','King'];
/* what a Maltese player calls the three court cards */
const RANK_MT = { 1:'ass', 11:'kavall', 12:'donna', 13:'sultan' };

const suitOf = c => (c / 13) | 0;
const rankOf = c => (c % 13) + 1;
const mk     = (s, r) => s * 13 + (r - 1);
const isRed  = c => SUITS[suitOf(c)].red;
const shortOf = c => RANK_SHORT[rankOf(c)] + SUITS[suitOf(c)].k;
const nameOf = c => RANK_LONG[rankOf(c)] + ' of ' + SUITS[suitOf(c)].n;

function deck52(){ const d = []; for (let i = 0; i < 52; i++) d.push(i); return d; }
/* the Maltese 40: the same pack with the 8s, 9s and 10s taken out */
function deck40(){ return deck52().filter(c => { const r = rankOf(c); return r < 8 || r > 10; }); }

/* ═══════════════════════════════════════════════════════════════════
   THE DECK — the drawing
   One hidden <svg> is appended to <body> holding a <symbol> per pip
   and the card back's lattice, exactly the way js/party.js parks its
   chess sprite. Every card face then costs four <use> references
   instead of four copies of a path, which matters when a hand of
   seventeen cards repaints on every tap.

   Geometry: a 100 × 140 box, which is 2.5in × 3.5in to within a
   rounding error, so the cards look like cards rather than tiles.
   ═══════════════════════════════════════════════════════════════════ */
const PIP_ART = {
  /* each drawn inside a 0..100 square, weighted so it reads at 12px */
  S: '<path d="M50 5C34 27 9 41 9 61c0 14 10 24 22 24 7 0 13-3 17-9-1 11-6 19-14 23h32' +
     'c-8-4-13-12-14-23 4 6 10 9 17 9 12 0 22-10 22-24C91 41 66 27 50 5Z"/>',
  /* every segment absolute and one curve per C: a heart is the pip most
     easily wrecked by clever path shorthand, and it is the one people
     spot instantly when it is wrong */
  H: '<path d="M50 92 C20 70 9 53 9 37 C9 23 19 13 32 13 C41 13 47 18 50 25' +
     ' C53 18 59 13 68 13 C81 13 91 23 91 37 C91 53 80 70 50 92 Z"/>',
  D: '<path d="M50 3 90 50 50 97 10 50Z"/>',
  C: '<circle cx="50" cy="29" r="20"/><circle cx="26" cy="62" r="20"/>' +
     '<circle cx="74" cy="62" r="20"/>' +
     '<path d="M46 58c0 19-4 31-12 38h32c-8-7-12-19-12-38Z"/>'
};

/* ── the shelf marks ───────────────────────────────────────────────
   Each of the four games gets its own tile on the Party Games shelf, so
   each needs its own mark. js/party.js draws a tile's mark by dropping
   <use href="#id"> into a 24x24 box and painting it flat gold with no
   stroke — that is the convention chess already uses and it is not ours
   to change — so these are pure fills on a 24 grid, told apart by their
   SILHOUETTE first and their pip second, because at thirty pixels an
   outline is all anybody actually reads.

     bixkla   a fan of three, spade on the front card
     briscola two cards crossed, diamond on the front one
     sette    one card and a stack of counters
     cheat    two cards, the front one face down

   Drawn, not generated: an emblem this small is sharper as geometry, and
   it cannot come back as tofu on a phone. */
function rr(x, y, w, h, r){
  const n = v => Math.round(v * 100) / 100;
  return 'M' + n(x+r) + ' ' + n(y) + 'H' + n(x+w-r) + 'A' + r + ' ' + r + ' 0 0 1 ' + n(x+w) + ' ' + n(y+r) +
         'V' + n(y+h-r) + 'A' + r + ' ' + r + ' 0 0 1 ' + n(x+w-r) + ' ' + n(y+h) +
         'H' + n(x+r) + 'A' + r + ' ' + r + ' 0 0 1 ' + n(x) + ' ' + n(y+h-r) +
         'V' + n(y+r) + 'A' + r + ' ' + r + ' 0 0 1 ' + n(x+r) + ' ' + n(y) + 'Z';
}
/* a card as a FRAME: outer rounded rect and inner rounded rect in one
   path, wound the same way, so evenodd cuts the middle out. No stroke
   involved, which is what lets it survive the tile's stroke:none. */
function cardFrame(x, y, w, h, t){
  return '<path fill-rule="evenodd" d="' + rr(x, y, w, h, 1.5) +
         rr(x + t, y + t, w - 2*t, h - 2*t, 0.8) + '"/>';
}
const mpip = (k, cx, cy, sz) =>
  '<use href="#kb-p-' + k + '" xlink:href="#kb-p-' + k + '" x="' + (cx - sz/2) +
  '" y="' + (cy - sz/2) + '" width="' + sz + '" height="' + sz + '"/>';

const TILE_MARKS = {
  bixkla:
    '<g transform="rotate(-27 12 20.5)">' + cardFrame(7.6, 6.8, 8.8, 13.7, 1.05) + '</g>' +
    '<g transform="rotate(27 12 20.5)">'  + cardFrame(7.6, 6.8, 8.8, 13.7, 1.05) + '</g>' +
    cardFrame(7.4, 5.8, 9.2, 14.7, 1.1) + mpip('S', 12, 13.1, 5.4),
  briscola:
    '<g transform="rotate(-38 12 13)">' + cardFrame(7.6, 4.6, 8.8, 16.8, 1.05) + '</g>' +
    '<g transform="rotate(26 12 13)">'  + cardFrame(7.6, 4.6, 8.8, 16.8, 1.05) +
      mpip('D', 12, 13, 5.4) + '</g>',
  sette:
    cardFrame(1.8, 4.2, 9.6, 15.6, 1.1) + mpip('H', 6.6, 12, 5.4) +
    '<ellipse cx="17.6" cy="16.7" rx="4.6" ry="1.9"/>' +
    '<ellipse cx="17.6" cy="12.5" rx="4.6" ry="1.9"/>' +
    '<ellipse cx="17.6" cy="8.3"  rx="4.6" ry="1.9"/>',
  cheat:
    '<g transform="rotate(-19 12 13)">' + cardFrame(7.8, 4.8, 8.6, 16.4, 1.05) + '</g>' +
    /* the front one is face DOWN: three bars of a card back rather than a
       pip. Bars, not a solid panel — a filled block goes to a blob at
       thirty pixels while the other three stay line-drawn, and a shelf
       where one mark is twice the weight of its neighbours looks like a
       mistake. */
    '<g transform="rotate(12 12 13)">'  + cardFrame(7.4, 4.4, 9.2, 17.2, 1.1) +
      '<path d="' + rr(9.5, 8.0, 5.0, 1.7, 0.6) +
                    rr(9.5, 11.6, 5.0, 1.7, 0.6) +
                    rr(9.5, 15.2, 5.0, 1.7, 0.6) + '"/></g>'
};

let defsDone = false;
function injectDefs(){
  if (defsDone || document.getElementById('kb-defs')) { defsDone = true; return; }
  defsDone = true;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', 'kb-defs');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('style',
    'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  let s = '';
  for (const k in PIP_ART)
    s += '<symbol id="kb-p-' + k + '" viewBox="0 0 100 100">' + PIP_ART[k] + '</symbol>';
  /* the card back: a lattice of thin diagonals with a Maltese cross on
     top. Drawn, not photographed, so it stays crisp on a 3x phone and
     weighs nothing. */
  s += '<pattern id="kb-lat" width="10" height="10" patternUnits="userSpaceOnUse" ' +
       'patternTransform="rotate(45)">' +
       '<rect width="10" height="10" fill="#7E1226"/>' +
       '<path d="M0 0H10M0 5H10" stroke="#A6203A" stroke-width="2.4"/>' +
       '</pattern>';
  /* eight-pointed cross, four arrowheads meeting at the middle */
  s += '<symbol id="kb-cross" viewBox="0 0 100 100">' +
       '<path d="M50 46 30 26 18 38l14 12-14 12 12 12 20-20 20 20 12-12-14-12 14-12' +
       '-12-12-20 20Z" transform="translate(0,0)"/></symbol>';
  for (const k in TILE_MARKS)
    s += '<symbol id="kb-t-' + k + '" viewBox="0 0 24 24">' + TILE_MARKS[k] + '</symbol>';
  svg.innerHTML = s;
  document.body.appendChild(svg);
}

/* the five classic pip grids, as [x, y, upsideDown] on the 100x140 box */
const COL = { l:31, m:50, r:69 };
const ROW = { a:33, b:52.3, c:70, d:87.7, e:107,   /* 5-row grid, 2..8 */
              p:33, q:58.7, s:81.3, t:107,          /* 4-row grid, 9 & 10 */
              u:45.8, v:94.2 };                     /* the 10's two extras */
const PIPS = {
  1:  [[COL.m, ROW.c, 0]],
  2:  [[COL.m, ROW.a, 0], [COL.m, ROW.e, 1]],
  3:  [[COL.m, ROW.a, 0], [COL.m, ROW.c, 0], [COL.m, ROW.e, 1]],
  4:  [[COL.l, ROW.a, 0], [COL.r, ROW.a, 0], [COL.l, ROW.e, 1], [COL.r, ROW.e, 1]],
  5:  [[COL.l, ROW.a, 0], [COL.r, ROW.a, 0], [COL.m, ROW.c, 0],
       [COL.l, ROW.e, 1], [COL.r, ROW.e, 1]],
  6:  [[COL.l, ROW.a, 0], [COL.r, ROW.a, 0], [COL.l, ROW.c, 0], [COL.r, ROW.c, 0],
       [COL.l, ROW.e, 1], [COL.r, ROW.e, 1]],
  7:  [[COL.l, ROW.a, 0], [COL.r, ROW.a, 0], [COL.m, ROW.b, 0],
       [COL.l, ROW.c, 0], [COL.r, ROW.c, 0], [COL.l, ROW.e, 1], [COL.r, ROW.e, 1]],
  8:  [[COL.l, ROW.a, 0], [COL.r, ROW.a, 0], [COL.m, ROW.b, 0],
       [COL.l, ROW.c, 0], [COL.r, ROW.c, 0], [COL.m, ROW.d, 1],
       [COL.l, ROW.e, 1], [COL.r, ROW.e, 1]],
  9:  [[COL.l, ROW.p, 0], [COL.r, ROW.p, 0], [COL.l, ROW.q, 0], [COL.r, ROW.q, 0],
       [COL.m, ROW.c, 0],
       [COL.l, ROW.s, 1], [COL.r, ROW.s, 1], [COL.l, ROW.t, 1], [COL.r, ROW.t, 1]],
  10: [[COL.l, ROW.p, 0], [COL.r, ROW.p, 0], [COL.m, ROW.u, 0],
       [COL.l, ROW.q, 0], [COL.r, ROW.q, 0],
       [COL.l, ROW.s, 1], [COL.r, ROW.s, 1], [COL.m, ROW.v, 1],
       [COL.l, ROW.t, 1], [COL.r, ROW.t, 1]]
};

function useP(k, cx, cy, size, flip){
  const x = (cx - size / 2).toFixed(2), y = (cy - size / 2).toFixed(2);
  return '<use href="#kb-p-' + k + '" xlink:href="#kb-p-' + k + '" x="' + x + '" y="' + y +
         '" width="' + size + '" height="' + size + '"' +
         (flip ? ' transform="rotate(180 ' + cx + ' ' + cy + ')"' : '') + '/>';
}

/* ── the court cards ───────────────────────────────────────────────
   Half a figure, drawn once and then rotated 180° about the middle of
   the panel — which is exactly how a real King is printed, and it is
   why a court card reads the same way up whichever way you hold it.
   The figures are deliberately plain: at 60px wide on a phone the
   corner index is what identifies the card, and a busy portrait just
   turns into grey mush. */
const COURT_HEAD = {
  11: /* Jack — the kavall. A soft cap with a feather. */
      '<path class="kb-ink" d="M37 33c0-11 6-15 13-15s13 4 13 15Z"/>' +
      '<path class="kb-ink" d="M62 27c8-6 13-4 17-10-3 11-9 15-17 17Z"/>',
  12: /* Queen — the donna. A round crown and hair to the shoulders. */
      '<path class="kb-ink" d="M37 33c0-10 6-14 13-14s13 4 13 14Z"/>' +
      '<circle class="kb-ink" cx="42" cy="17" r="3.4"/>' +
      '<circle class="kb-ink" cx="50" cy="14" r="3.8"/>' +
      '<circle class="kb-ink" cx="58" cy="17" r="3.4"/>' +
      '<path class="kb-ink" d="M37 36c-5 8-5 17-2 22l6-3c-2-5-2-12 1-17Z"/>' +
      '<path class="kb-ink" d="M63 36c5 8 5 17 2 22l-6-3c2-5 2-12-1-17Z"/>',
  13: /* King — is-sultan. Three points and a beard. */
      '<path class="kb-ink" d="M36 33V19l7 6 7-11 7 11 7-6v14Z"/>' +
      '<rect class="kb-ink" x="35" y="33" width="30" height="4.6" rx="1.4"/>' +
      '<path class="kb-ink" d="M40 45c1 12 5 17 10 17s9-5 10-17l4 2c-1 15-6 21-14 21' +
      's-13-6-14-21Z"/>'
};
function courtHalf(rank, suitK){
  return '<g>' +
    /* the little suit mark in the corner of the panel */
    useP(suitK, 28.5, 31, 13, 0) +
    COURT_HEAD[rank] +
    /* face */
    '<ellipse class="kb-face" cx="50" cy="43" rx="9.4" ry="10.4"/>' +
    '<circle class="kb-ink" cx="46.4" cy="42" r="1.3"/>' +
    '<circle class="kb-ink" cx="53.6" cy="42" r="1.3"/>' +
    /* shoulders */
    '<path class="kb-ink" d="M31 70V62c0-6 6-10 12-11h14c6 1 12 5 12 11v8Z"/>' +
    '<path class="kb-face" d="M43 51 50 62 57 51 50 55Z"/>' +
    '</g>';
}

/* ── one card face ────────────────────────────────────────────────
   Cached by id: the markup for the seven of hearts never changes, and
   a Cheat hand of seventeen cards would otherwise rebuild the same
   string on every render. */
const faceCache = new Map();
function cardFace(c){
  if (faceCache.has(c)) return faceCache.get(c);
  const s = suitOf(c), r = rankOf(c), sk = SUITS[s].k;
  const cls = SUITS[s].red ? 'kb-r' : 'kb-b';
  let body = '';
  if (r >= 11){
    body = '<rect class="kb-panel" x="20.5" y="22.5" width="59" height="95" rx="4"/>' +
           courtHalf(r, sk) +
           '<g transform="rotate(180 50 70)">' + courtHalf(r, sk) + '</g>' +
           '<path class="kb-hair" d="M20.5 70H79.5"/>';
  } else if (r === 1){
    body = useP(sk, 50, 70, 46, 0);
  } else {
    const size = (r >= 9) ? 19 : 21;
    body = PIPS[r].map(p => useP(sk, p[0], p[1], size, p[2])).join('');
  }
  const idx = RANK_SHORT[r];
  const wide = idx.length > 1;
  const corner =
    '<g class="kb-idx">' +
      '<text x="11.5" y="26.5" text-anchor="middle"' +
        (wide ? ' textLength="17" lengthAdjust="spacingAndGlyphs"' : '') + '>' + idx + '</text>' +
      useP(sk, 11.5, 39.5, 13, 0) +
    '</g>' +
    '<g class="kb-idx" transform="rotate(180 50 70)">' +
      '<text x="11.5" y="26.5" text-anchor="middle"' +
        (wide ? ' textLength="17" lengthAdjust="spacingAndGlyphs"' : '') + '>' + idx + '</text>' +
      useP(sk, 11.5, 39.5, 13, 0) +
    '</g>';
  const out =
    '<svg class="kb-svg ' + cls + '" viewBox="0 0 100 140" aria-hidden="true" focusable="false">' +
      '<rect class="kb-stock" x="1.25" y="1.25" width="97.5" height="137.5" rx="8.5"/>' +
      corner + body +
    '</svg>';
  faceCache.set(c, out);
  return out;
}

let backCache = '';
function cardBack(){
  if (backCache) return backCache;
  backCache =
    '<svg class="kb-svg kb-back" viewBox="0 0 100 140" aria-hidden="true" focusable="false">' +
      '<rect class="kb-stock" x="1.25" y="1.25" width="97.5" height="137.5" rx="8.5"/>' +
      '<rect x="5.5" y="5.5" width="89" height="129" rx="5.5" fill="url(#kb-lat)"/>' +
      '<rect x="5.5" y="5.5" width="89" height="129" rx="5.5" fill="none" ' +
        'stroke="#FFD98A" stroke-width="1.6" opacity=".75"/>' +
      '<use href="#kb-cross" xlink:href="#kb-cross" x="27" y="42" width="46" height="46" ' +
        'fill="#FFD98A" opacity=".92"/>' +
    '</svg>';
  return backCache;
}

/* the public drawing call. face:false gives the back. */
function cardEl(c, o){
  o = o || {};
  const face = o.face !== false;
  const tag = o.tap ? 'button' : 'span';
  const w = o.w || 62;
  let cls = 'kb-card' + (o.cls ? ' ' + o.cls : '');
  if (!face) cls += ' down';
  return '<' + tag + ' class="' + cls + '"' +
    (o.tap ? ' type="button"' : '') +
    (o.dis ? ' disabled aria-disabled="true"' : '') +
    ' data-c="' + (face ? c : -1) + '"' +
    (o.k != null ? ' data-k="' + o.k + '"' : '') +
    ' style="width:' + w + 'px;height:' + Math.round(w * 1.4) + 'px' +
      (o.left != null ? ';margin-left:' + o.left + 'px' : '') + '"' +
    (o.tap ? ' aria-label="' + esc(face ? nameOf(c) + (o.note ? '. ' + o.note : '') : 'Face-down card') + '"'
           : ' aria-hidden="true"') +
    '>' + (face ? cardFace(c) : cardBack()) + '</' + tag + '>';
}

/* ═══════════════════════════════════════════════════════════════════
   THE HAND FAN
   Real hands overlap, and a phone is 440px wide, so the arithmetic is
   done here once rather than guessed at in four engines: fit `n` cards
   into `wide` pixels, never letting a card get so narrow that the
   corner index stops being readable, and wrapping to a second row
   before that happens rather than squeezing.

   MIN_W is the number that matters. 44px is the width at which the
   rank still reads at arm's length on a 3x phone; below that a Cheat
   hand turns into a red-and-black smear.
   ═══════════════════════════════════════════════════════════════════ */
const MIN_W = 46, MAX_W = 92;
function fanPlan(n, wide, tall){
  if (n <= 0) return { rows:[], w:MIN_W, step:MIN_W };
  let rows = 1;
  for (;;){
    const per = Math.ceil(n / rows);
    /* the widest card that lets `per` of them sit in `wide` with at
       most 42% of each one covered by its neighbour */
    let w = Math.min(MAX_W, Math.floor((wide - 6) / (1 + (per - 1) * 0.58)));
    /* …and that still leaves room for `rows` rows of it */
    if (tall) w = Math.min(w, Math.floor((tall - (rows - 1) * 8) / (rows * 1.4)));
    if (w >= MIN_W || rows >= 3){
      w = Math.max(MIN_W, w);
      const step = per > 1 ? Math.min(w + 4, (wide - 6 - w) / (per - 1)) : w;
      const out = [];
      for (let i = 0; i < n; i += per) out.push([i, Math.min(n, i + per)]);
      return { rows:out, w, step:Math.max(14, step) };
    }
    rows++;
  }
}
function fanHTML(cards, plan, o){
  o = o || {};
  let h = '';
  plan.rows.forEach(seg => {
    h += '<div class="kb-fan-row">';
    for (let i = seg[0]; i < seg[1]; i++){
      const first = i === seg[0];
      h += cardEl(cards[i], {
        w: plan.w,
        left: first ? 0 : Math.round(plan.step - plan.w),
        face: o.face !== false,
        tap: !!o.tap,
        k: i,
        dis: o.dis ? o.dis(cards[i], i) : false,
        note: o.note ? o.note(cards[i], i) : '',
        cls: (o.cls ? o.cls(cards[i], i) : '')
      });
    }
    h += '</div>';
  });
  return h;
}

/* ═══════════════════════════════════════════════════════════════════
   TEXT HELPERS
   ═══════════════════════════════════════════════════════════════════ */
function suitWord(s){ return SUITS[s].n; }
function suitWordMt(s){ return SUITS[s].mt; }
function rankWord(r){ return RANK_LONG[r]; }
function cardWord(c){ return nameOf(c); }
function plural(n, one, many){ return n + ' ' + (n === 1 ? one : (many || one + 's')); }

/* exported so the engines and the tests share one vocabulary */
const DECK = {
  SUITS, RANK_SHORT, RANK_LONG, RANK_MT,
  suitOf, rankOf, mk, isRed, shortOf, nameOf,
  deck52, deck40, shuffle, rnd, rint, clone,
  cardEl, cardFace, cardBack, fanPlan, fanHTML,
  suitWord, suitWordMt, rankWord, cardWord, plural
};

/* ─── everything above is pure: no DOM, no clock, no Math.random.
       Everything below drives the screen. ─────────────────────────── */

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET
   Injected once, scoped to #scr-party because that is the screen we
   borrow. css/extra.css is not ours to edit, so this follows the same
   runtime pattern js/mp.js and js/party.js use.

   Nothing in here puts transform / filter / backdrop-filter /
   will-change on anything that could be an ancestor of .tabbar — the
   house rule the party screen already obeys.
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS(){
  injectDefs();
  if (document.getElementById('kb-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'kb-runtime-css';
  st.textContent =
    '#scr-party{--kb-felt:#123B2A;--kb-felt2:#0C2A1E;--kb-ivory:#FCF7EA;' +
      '--kb-red:#C7192B;--kb-blk:#17131B;--kb-edge:rgba(0,0,0,.4)}' +

    /* ── the card itself ── */
    '#scr-party .kb-card{position:relative;flex:0 0 auto;padding:0;border:0;background:none;' +
      'border-radius:7px;line-height:0;display:block;' +
      'box-shadow:0 2px 4px rgba(0,0,0,.5),0 6px 14px rgba(0,0,0,.35);' +
      'transition:margin-top .13s var(--ease),box-shadow .13s var(--ease)}' +
    '#scr-party button.kb-card{cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    /* THE FAN. Without this the cards are block elements and a hand of
       three lays itself out down the screen like a shopping list. */
    '#scr-party .kb-fan-row{display:flex;align-items:flex-end;justify-content:center;' +
      'width:100%;padding:14px 5px 0}' +
    '#scr-party .kb-fan-row+.kb-fan-row{margin-top:4px}' +
    '#scr-party .kb-svg{width:100%;height:100%;display:block;border-radius:7px;' +
      'overflow:hidden;font-family:var(--body),-apple-system,"Segoe UI",Roboto,Arial,sans-serif}' +
    '#scr-party .kb-stock{fill:var(--kb-ivory);stroke:rgba(0,0,0,.34);stroke-width:1.1}' +
    '#scr-party .kb-svg.kb-r{fill:var(--kb-red);color:var(--kb-red)}' +
    '#scr-party .kb-svg.kb-b{fill:var(--kb-blk);color:var(--kb-blk)}' +
    '#scr-party .kb-idx text{font-weight:800;font-size:25px;letter-spacing:-.02em;' +
      'fill:currentColor;stroke:none}' +
    '#scr-party .kb-panel{fill:#F4E7C6;stroke:currentColor;stroke-width:1.5}' +
    '#scr-party .kb-ink{fill:currentColor;stroke:none}' +
    '#scr-party .kb-face{fill:var(--kb-ivory);stroke:currentColor;stroke-width:1.5}' +
    '#scr-party .kb-hair{stroke:currentColor;stroke-width:1.1;opacity:.55;fill:none}' +
    /* legal / illegal / chosen */
    '#scr-party .kb-card.pick{margin-top:-14px;' +
      'box-shadow:0 0 0 3px var(--gold),0 8px 18px rgba(0,0,0,.5)}' +
    '#scr-party .kb-card.ok{box-shadow:0 0 0 2.5px rgba(61,220,132,.9),0 6px 14px rgba(0,0,0,.4)}' +
    '#scr-party .kb-card.no{filter:none;opacity:.42}' +
    '#scr-party .kb-card.no .kb-svg{filter:grayscale(1)}' +
    '#scr-party button.kb-card:not([disabled]):active{margin-top:-8px}' +
    '#scr-party .kb-card.tiny{box-shadow:0 1px 3px rgba(0,0,0,.45)}' +

    /* ── the table ── */
    '#scr-party .pt-host.kb-host{align-items:stretch;justify-content:stretch;overflow:visible}' +
    '#scr-party .kb-table{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;' +
      'gap:6px;padding:8px 7px;border-radius:16px;position:relative;' +
      'background:radial-gradient(120% 85% at 50% 8%,#1B5B3F 0%,var(--kb-felt) 45%,var(--kb-felt2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.07),' +
      'inset 0 -18px 34px rgba(0,0,0,.42)}' +
    '#scr-party .kb-top{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;' +
      'gap:6px;min-height:56px}' +
    '#scr-party .kb-seats{display:flex;align-items:flex-start;justify-content:center;' +
      'gap:8px;width:100%}' +
    '#scr-party .kb-mid{flex:1;min-height:96px;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:6px;position:relative}' +
    '#scr-party .kb-bot{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;' +
      'gap:6px;min-height:96px}' +

    /* ── a seat plate (name, cards left, points) ── */
    '#scr-party .kb-seat{display:flex;flex-direction:column;align-items:center;gap:3px;' +
      'min-width:0;max-width:33%}' +
    '#scr-party .kb-seat .kb-nm{font:900 9.5px/1.25 var(--disp);letter-spacing:.09em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.62);white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis;max-width:100%;padding:3px 7px;border-radius:999px;' +
      'background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.09)}' +
    '#scr-party .kb-seat.turn .kb-nm{color:#241800;background:var(--gold);' +
      'border-color:#FFE9B0}' +
    '#scr-party .kb-seat.mate .kb-nm{box-shadow:0 0 0 1.5px rgba(61,220,132,.55)}' +
    '#scr-party .kb-seat .kb-sub{font:700 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
      'letter-spacing:.05em;color:rgba(255,255,255,.5)}' +
    '#scr-party .kb-mini{display:flex;align-items:center;gap:0}' +
    '#scr-party .kb-mini .kb-card{margin-left:-13px;box-shadow:0 1px 3px rgba(0,0,0,.5)}' +
    '#scr-party .kb-mini .kb-card:first-child{margin-left:0}' +

    /* ── the trick pool ── */
    '#scr-party .kb-pool{display:flex;align-items:flex-end;justify-content:center;gap:5px;' +
      'min-height:92px;flex-wrap:wrap}' +
    '#scr-party .kb-play{display:flex;flex-direction:column;align-items:center;gap:3px}' +
    '#scr-party .kb-play .kb-who{font:700 8.5px/1 var(--disp);letter-spacing:.09em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.55);max-width:76px;overflow:hidden;' +
      'text-overflow:ellipsis;white-space:nowrap}' +
    '#scr-party .kb-play.win .kb-card{box-shadow:0 0 0 2.5px var(--gold),0 6px 14px rgba(0,0,0,.45)}' +
    '#scr-party .kb-play.win .kb-who{color:var(--gold)}' +
    '#scr-party .kb-empty{font:700 10.5px/1.5 var(--disp);letter-spacing:.11em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.3);text-align:center;padding:26px 10px}' +

    /* ── the stock and the trump card ── */
    '#scr-party .kb-stack{position:relative;display:flex;align-items:center;gap:2px}' +
    '#scr-party .kb-stack .kb-trump{margin-left:-34px;line-height:0}' +
    '#scr-party .kb-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;' +
      'border-radius:999px;background:rgba(0,0,0,.34);border:1px solid rgba(255,255,255,.12);' +
      'font:900 9.5px/1 var(--disp);letter-spacing:.09em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.78);white-space:nowrap}' +
    '#scr-party .kb-chip b{color:var(--gold)}' +
    '#scr-party .kb-chip .kb-pip{width:12px;height:12px;display:block}' +
    '#scr-party .kb-chip .kb-pip.r{fill:#FF6B7A}' +
    '#scr-party .kb-chip .kb-pip.b{fill:#EDE6FF}' +
    '#scr-party .kb-chips{display:flex;flex-wrap:wrap;gap:5px;justify-content:center}' +

    /* ── the prompt strip inside the felt ── */
    '#scr-party .kb-say{font:700 11px/1.45 var(--body);color:rgba(255,255,255,.8);' +
      'text-align:center;padding:0 8px;max-width:340px}' +
    '#scr-party .kb-say b{color:var(--gold);font-weight:900}' +

    /* ── inline action buttons on the felt (hit/stand/call cheat) ── */
    '#scr-party .kb-acts{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;' +
      'padding:2px 0}' +
    '#scr-party .kb-act{min-height:44px;padding:0 15px;border-radius:12px;' +
      'font:900 11px/1 var(--disp);letter-spacing:.08em;text-transform:uppercase;' +
      'color:#241800;background:linear-gradient(180deg,#FFD979,var(--gold));' +
      'border:1px solid #FFE9B0;box-shadow:0 3px 0 -1px rgba(0,0,0,.4)}' +
    '#scr-party .kb-act.ghost{color:var(--txt);background:rgba(255,255,255,.08);' +
      'border-color:rgba(255,255,255,.2);box-shadow:none}' +
    '#scr-party .kb-act.hot{color:#2A0700;background:linear-gradient(180deg,#FF7154,var(--hot));' +
      'border-color:#FFA894}' +
    '#scr-party .kb-act[disabled]{opacity:.4}' +
    '#scr-party .kb-act:not([disabled]):active{transform:translateY(2px);box-shadow:none}' +
    '#scr-party .kb-step{display:flex;align-items:center;gap:8px;justify-content:center}' +
    '#scr-party .kb-step .kb-n{font:900 20px/1 var(--disp);color:var(--gold);min-width:26px;' +
      'text-align:center}' +
    '#scr-party .kb-rnd{width:40px;height:40px;border-radius:11px;font:900 20px/1 var(--disp);' +
      'color:var(--txt);background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.2)}' +
    '#scr-party .kb-rnd[disabled]{opacity:.35}' +

    /* ── the pass-the-phone veil ──
       A hidden-hand game on one device is only a game if the hand is
       actually hidden. This sits over the felt between two humans. */
    '#scr-party .kb-veil{position:absolute;inset:0;z-index:12;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:14px;padding:22px;border-radius:16px;' +
      /* FULLY OPAQUE. At 97% you could still read the outgoing player's
         hand through it, which makes the whole thing decorative. */
      'text-align:center;background:linear-gradient(180deg,#0A0712,#150D24)}' +
    '#scr-party .kb-veil h4{font:900 15px/1.3 var(--disp);letter-spacing:.07em;' +
      'text-transform:uppercase;color:var(--gold);margin:0}' +
    '#scr-party .kb-veil p{font-size:12px;line-height:1.6;color:var(--dim);margin:0;max-width:280px}' +

    /* ── the scorebook ── */
    '#scr-party .kb-book{width:100%;border-collapse:collapse;margin-top:6px}' +
    '#scr-party .kb-book th,#scr-party .kb-book td{padding:6px 8px;text-align:left;' +
      'font-size:11.5px;border-bottom:1px solid var(--line)}' +
    '#scr-party .kb-book th{font:900 9.5px/1.3 var(--disp);letter-spacing:.09em;' +
      'text-transform:uppercase;color:var(--dim2)}' +
    '#scr-party .kb-book td.n{text-align:right;font:700 12px/1 ui-monospace,SFMono-Regular,' +
      'Menlo,monospace;color:var(--txt)}' +
    '#scr-party .kb-book tr.us td{color:var(--gold)}' +

    /* ── the mode menu ── */
    '#scr-party .kb-modes{display:grid;gap:10px;margin:4px 0 14px}' +
    '#scr-party .kb-mode{display:grid;grid-template-columns:auto 1fr;column-gap:12px;row-gap:3px;' +
      'align-items:center;text-align:left;width:100%;padding:12px 13px;border-radius:16px;' +
      'color:var(--txt);background:linear-gradient(180deg,var(--panel2),var(--panel));' +
      'border:1px solid var(--line2);box-shadow:0 5px 0 -2px rgba(0,0,0,.45)}' +
    '#scr-party .kb-mode:active{background:var(--panel2)}' +
    '#scr-party .kb-mode .kb-mini{grid-row:1/4;align-self:center}' +
    '#scr-party .kb-mode b{font:900 14px/1.15 var(--disp);letter-spacing:.06em;' +
      'text-transform:uppercase}' +
    '#scr-party .kb-mode i{font-style:normal;font-size:9.5px;letter-spacing:.13em;' +
      'font-weight:700;text-transform:uppercase;color:var(--gold)}' +
    '#scr-party .kb-mode s{text-decoration:none;font-size:11.5px;line-height:1.5;color:var(--dim)}' +
    '#scr-party .kb-mode .kb-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:4px}' +
    '#scr-party .kb-tag{font:700 9px/1 var(--disp);letter-spacing:.08em;text-transform:uppercase;' +
      'padding:4px 7px;border-radius:999px;color:var(--dim);background:rgba(255,255,255,.05);' +
      'border:1px solid var(--line)}' +
    '#scr-party .kb-tag.go{color:var(--ok);background:rgba(61,220,132,.14);' +
      'border-color:rgba(61,220,132,.34)}' +
    '#scr-party .kb-rules{margin:2px 2px 20px;padding:12px 14px;border-radius:14px;' +
      'background:rgba(255,255,255,.04);border:1px solid var(--line)}' +
    '#scr-party .kb-rules li{font-size:12px;line-height:1.65;color:var(--dim);margin:0 0 6px 16px}' +
    '#scr-party .kb-rules li b{color:var(--txt)}' +
    '#scr-party .kb-rules li:last-child{margin-bottom:0}' +
    '#scr-party .kb-rules h5{font:900 10px/1 var(--disp);letter-spacing:.11em;' +
      'text-transform:uppercase;color:var(--gold);margin:0 0 9px}' +

    /* ── very short phones ── */
    '@media (max-height:700px){' +
      '#scr-party .kb-table{gap:4px;padding:6px 6px}' +
      '#scr-party .kb-top{min-height:48px}' +
      '#scr-party .kb-mid{min-height:80px}}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   THE GAMES REGISTER
   Each engine file calls define() with a pure rules object plus the
   painting it wants. Nothing in an engine touches localStorage, the
   clock or Math.random.

   An engine is:
     id, name, mt, tag, order, cardCount, seats:[n,...]
     deal(opts, seed) -> st          the whole game state, JSON-safe
     legal(st, seat)  -> [move,...]  every move that seat may make now
     apply(st, move)  -> void        mutate st. MUST be deterministic.
     turn(st)         -> seat | -1   whose move it is (-1 = nobody)
     over(st)         -> null | {tone, head, why, quip}
     think(st, seat, level) -> move  the machine's choice
     paint(ui, st)    -> void        draw the felt
     rules            -> [html, ...] the rules card in the menu
   ═══════════════════════════════════════════════════════════════════ */
const GAMES = [];
const BY_ID = {};
function define(def){
  const at = GAMES.findIndex(g => g.id === def.id);
  if (at >= 0) GAMES[at] = def; else GAMES.push(def);
  BY_ID[def.id] = def;
  GAMES.sort((a, b) => (a.order || 99) - (b.order || 99));
  shelve(def);
}

/* ── ON THE SHELF ──────────────────────────────────────────────────
   Each game is its own tile under Card Games and tapping one deals.

   It used to be one tile called PLAYING CARDS which opened a menu of
   four. The owner's verdict on seeing it: "playing cards are in card
   games wtf" — and he was right twice. A tile named after the section
   it sits in tells you nothing, and it charged you an extra screen to
   learn nothing. Four tiles, four real names, one tap less. */
function shelve(def){
  P.register({
    /* THE ODD ONE OUT. js/party.js carries a placeholder tile of its own
       — {id:'klabb', name:'PLAYING CARDS', status:'soon'} — whose comment
       says it "turns real the moment its own file registers over the top
       of this entry with an open()". We are that file, and register()
       replaces by id, so taking the slot is the only way to retire it
       without editing a file another build is live in. Bixkla takes it,
       being the headline game.
       When that placeholder is deleted from js/party.js, this whole
       property goes and Bixkla registers under 'bixkla' like the rest. */
    id: def.shelfId || def.id,
    order: def.order,
    name: def.name,
    mt: def.mt,
    cat: 'cards',
    sprite: 'kb-t-' + def.id,
    icon: 'cards',
    status: 'live',
    /* a getter, not a string: the shelf is built fresh on every visit
       and this is the only way it can mention a hand left mid-deal
       without js/party.js having to know we exist. */
    get tag(){
      return def.tag + (savedSlot(def.id) ? ' There is a hand of this half-played.' : '');
    },
    open: () => setupSheet(def)
  });
}

/* ═══════════════════════════════════════════════════════════════════
   THE MATCH RUNNER
   One match at a time. It owns:
     · st       the live state
     · seed     the deal seed
     · log      every move ever applied, in order
     · seats    who is behind each seat: a human here, the machine, or
                (online) somebody else's phone

   REPLAY IS THE ONLY WAY BACK. rollbackTo(n) re-deals from `seed` and
   re-applies the first n moves. There is no "un-apply"; an engine
   never has to write one, and no engine can get undo subtly wrong.
   ═══════════════════════════════════════════════════════════════════ */
let M = null;
let FAST = false;                 /* the harness turns the clocks off */
const moveSubs = [];
const stateSubs = [];

function fire(list, a, b){
  for (const f of list.slice()){ try { f(a, b); } catch(e){} }
}

function buildState(gid, opts, seed, log){
  const def = BY_ID[gid];
  const st = def.deal(opts, seed >>> 0);
  for (let i = 0; i < log.length; i++) def.apply(st, log[i]);
  return st;
}

function startMatch(gid, opts, seed, log){
  const def = BY_ID[gid];
  if (!def) return null;
  stopThinking();
  M = {
    gid, def,
    opts: clone(opts || {}),
    seed: (seed == null ? newSeed() : seed) >>> 0,
    log: log ? clone(log) : [],
    st: null,
    ctx: null,
    tmp: {},          /* transient screen state: what you have picked up */
    timer: 0,
    veil: 0,          /* seat we are waiting to hand the phone to, or 0/false */
    dead: false,
    net: null         /* set by the online controller */
  };
  M.st = buildState(gid, M.opts, M.seed, M.log);
  return M;
}

function stopThinking(){
  if (M && M.timer){ clearTimeout(M.timer); M.timer = 0; }
}

/* who is behind seat i:  'me' | 'ai' | 'hot' (another human, this phone)
                        | 'net' (somebody else's phone) */
function ownerOf(i){
  if (!M) return 'ai';
  const s = M.st.seats[i];
  return s && s.own ? s.own : 'ai';
}
const isLocal = i => { const o = ownerOf(i); return o === 'me' || o === 'hot'; };

/* ── applying a move ──────────────────────────────────────────────
   Every move in the game goes through here, whoever made it: a tap, a
   machine, or a packet off the wire. One door means one place where
   legality is checked, one place the log grows, and one place the
   autosave and the subscribers are told. */
function legalFor(seat){
  /* seat -1 is THE TABLE and it is a real seat here: gathering a trick
     and turning the next hand are moves like any other, they go in the
     log, and they have to pass the same gate. An earlier `seat < 0`
     guard here quietly returned "nothing is legal" for the table, so
     every trick game stopped dead the moment a trick filled up. */
  if (!M || seat == null || seat < -1) return [];
  if (M.def.turn(M.st) !== seat) return [];
  return M.def.legal(M.st, seat) || [];
}
function sameMove(a, b){
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
  return true;
}
/* THE legality gate. Nothing reaches an engine's apply() that its own
   rules did not allow — which is how "you cannot renege" is enforced
   for the human, for the machine and for a remote peer with the same
   few lines of code.

   Most engines are checked against legal(): the list of moves IS the
   law. Cheat is the exception — "any one to four cards out of your
   hand" is a thousand-odd moves and enumerating them on every tap
   would be silly — so an engine may supply check(st, move) instead,
   which is then the authority. Where an engine has BOTH, legal() is
   what the machine chooses from and check() is what everything is
   measured against. Tests assert the two agree. */
function allowed(seat, move){
  if (M.def.check) return M.def.check(M.st, move, seat);
  return legalFor(seat).some(m => sameMove(m, move));
}
function doMove(seat, move, src){
  if (!M || M.dead) return { ok:false, err:'no game' };
  if (M.def.over(M.st)) return { ok:false, err:'game over' };
  const t = M.def.turn(M.st);
  if (t !== seat) return { ok:false, err:'not seat ' + seat + "'s turn (it is " + t + ')' };
  if (!allowed(seat, move)) return { ok:false, err:'illegal move' };
  /* the seat is stamped on AFTER the check, never before. legal() lists
     the table's own moves as bare {t:'gather'} — stamping seat:-1 on
     first made them fail the exact-match compare, so every trick game
     froze the moment a trick filled up. Log what was checked, plus who
     did it, and nothing else. */
  const rec = clone(move);
  rec.seat = seat;
  const idx = M.log.length;
  M.log.push(rec);
  M.def.apply(M.st, rec);
  autosave();
  fire(moveSubs, { seat, move:clone(move), index:idx, src:src || 'local' });
  fire(stateSubs, { reason:'move', index:idx });
  return { ok:true, index:idx };
}

/* ── deterministic rollback ───────────────────────────────────────
   The whole point of the seed/log discipline. Cutting the log at `n`
   and rebuilding is the same operation for a local undo and for an
   agreed online takeback, so the two can never drift apart. */
function rollbackTo(n){
  if (!M) return null;
  n = Math.max(0, Math.min(M.log.length, n | 0));
  stopThinking();
  M.log = M.log.slice(0, n);
  M.st = buildState(M.gid, M.opts, M.seed, M.log);
  M.tmp = {};
  autosave();
  fire(stateSubs, { reason:'rollback', index:n });
  return n;
}
/* the index the given seat's most recent move sits at — i.e. the
   number to hand rollbackTo() to un-play it. -1 if it has not moved. */
function lastMoveOf(seat){
  if (!M) return -1;
  for (let i = M.log.length - 1; i >= 0; i--) if (M.log[i].seat === seat) return i;
  return -1;
}
/* the local undo: back to just before the last thing a player sitting
   at THIS phone did, which drags any machine replies back with it. */
function undoPoint(){
  if (!M) return -1;
  for (let i = M.log.length - 1; i >= 0; i--)
    if (isLocal(M.log[i].seat)) return i;
  return -1;
}

/* ── the autosave ─────────────────────────────────────────────────
   A snapshot is {gid, opts, seed, log} and nothing else — four fields
   that rebuild the game exactly, instead of a serialised board that
   would rot the first time an engine gained a field. */
function snapshot(){
  if (!M) return null;
  return { v:1, gid:M.gid, opts:clone(M.opts), seed:M.seed, log:clone(M.log) };
}
function autosave(){
  if (!M || M.net) return;            /* online games are not ours to keep */
  if (M.def.over(M.st)) { saveSlot(M.gid, null); return; }
  saveSlot(M.gid, snapshot());
}
function resume(snap){
  if (!snap || !snap.gid || !BY_ID[snap.gid]) return null;
  try { return startMatch(snap.gid, snap.opts, snap.seed, snap.log); }
  catch(e){ return null; }
}

/* ═══════════════════════════════════════════════════════════════════
   THE TABLE
   The felt, and the loop that drives it.

   Seat -1 is THE TABLE ITSELF. When turn(st) returns -1 the engine is
   asking for a beat — gather the trick, turn the next hand — and the
   runner applies whatever legal(st,-1) offers after pace(st)
   milliseconds. Those beats go in the move log like everything else,
   so a replay lands on the same board and an undo does not stop
   halfway through a trick.
   ═══════════════════════════════════════════════════════════════════ */
let UI = null;

function table(){
  const ctx = M.ctx;
  ctx.host.classList.add('kb-host');
  ctx.host.innerHTML =
    '<div class="kb-table" id="kb-table">' +
      '<div class="kb-top" id="kb-top"></div>' +
      '<div class="kb-mid" id="kb-mid"></div>' +
      '<div class="kb-bot" id="kb-bot"></div>' +
    '</div>';
  const root = ctx.host.querySelector('#kb-table');
  UI = {
    ctx, root,
    top: root.querySelector('#kb-top'),
    mid: root.querySelector('#kb-mid'),
    bot: root.querySelector('#kb-bot'),
    D: DECK, esc, ico,
    /* how wide the hand row may be — measured, because a phone in a
       case and a phone in a browser are not the same width */
    wide: () => Math.max(240, root.clientWidth - 26),
    tall: () => Math.max(120, root.clientHeight),
    view: () => (M ? M.view : 0),
    /* the seat plate: name, a fan of backs, and a line of numbers */
    seat(i, o){
      o = o || {};
      const s = M.st.seats[i];
      const backs = o.backs || 0;
      let mini = '';
      if (backs > 0){
        mini = '<span class="kb-mini">';
        for (let n = 0; n < Math.min(backs, 6); n++)
          mini += cardEl(-1, { face:false, w:o.mw || 26, cls:'tiny' });
        mini += '</span>';
      }
      return '<div class="kb-seat' + (o.turn ? ' turn' : '') + (o.mate ? ' mate' : '') + '">' +
        '<span class="kb-nm">' + esc(s.name) + '</span>' + mini +
        (o.sub ? '<span class="kb-sub">' + esc(o.sub) + '</span>' : '') +
        '</div>';
    },
    chip(html){ return '<span class="kb-chip">' + html + '</span>'; },
    pip(s, size){
      return '<svg class="kb-pip ' + (SUITS[s].red ? 'r' : 'b') + '" viewBox="0 0 100 100" ' +
        'aria-hidden="true" style="width:' + (size || 12) + 'px;height:' + (size || 12) + 'px">' +
        '<use href="#kb-p-' + SUITS[s].k + '" xlink:href="#kb-p-' + SUITS[s].k + '"/></svg>';
    },
    /* a move button on the felt. mv is the move object; the delegated
       handler below turns a tap into doMove(). */
    act(label, mv, o){
      o = o || {};
      return '<button class="kb-act ' + (o.cls || '') + '" type="button"' +
        (o.dis ? ' disabled' : '') +
        (mv ? " data-mv='" + JSON.stringify(mv).replace(/'/g, '&#39;') + "'" : '') +
        (o.id ? ' data-id="' + esc(o.id) + '"' : '') +
        '>' + esc(label) + '</button>';
    },
    /* a button that only changes what is on screen — see data-tap */
    pick(label, id, o){
      o = o || {};
      return '<button class="kb-act ' + (o.cls || '') + '" type="button"' +
        (o.dis ? ' disabled' : '') + ' data-tap="' + esc(id) + '">' + esc(label) + '</button>';
    },
    card: cardEl, fan: fanHTML, plan: fanPlan,
    say(html){ return '<div class="kb-say">' + html + '</div>'; }
  };
  /* ONE delegated listener for the whole felt: every tappable thing an
     engine paints carries its move as JSON, so no engine ever wires a
     handler and no handler ever survives its element. */
  root.addEventListener('click', e => {
    if (!M || M.dead || M.veil) return;
    const t = e.target && e.target.closest && e.target.closest('[data-mv],[data-tap]');
    if (!t || t.disabled) return;
    e.preventDefault();
    /* data-tap changes only what is on the screen — which cards you have
       picked up off your own hand, say. It is NOT a move, it never
       enters the log, and it therefore cannot be undone or sent down a
       wire, which is exactly right for a selection. */
    if (t.hasAttribute('data-tap')){
      if (M.def.uiTap) { try { M.def.uiTap(UI, M.st, t.getAttribute('data-tap'), M.tmp); } catch(err){} }
      render();
      return;
    }
    let mv = null;
    try { mv = JSON.parse(t.getAttribute('data-mv')); } catch(err){ return; }
    if (!mv) return;
    const seat = (mv.seat != null) ? mv.seat : M.def.turn(M.st);
    if (!isLocal(seat)) return;
    mv.seat = seat;
    const r = doMove(seat, mv, 'tap');
    if (!r.ok){ if (K.toast) K.toast(nag(mv)); return; }
    if (M.net && M.net.onMove) { try { M.net.onMove(clone(mv), r.index); } catch(err){} }
    M.shown = seat;
    M.tmp = {};                       /* a move clears the selection */
    render();
  });
  return UI;
}

/* what the app says when you try something the rules will not have.
   Written per game where it matters; this is the fallback. */
function nag(){
  const lines = [
    'You cannot do that. Try one that is actually allowed.',
    'No. Nice try, but no.',
    'The rules said no. Take it up with the rules.'
  ];
  return lines[(Date.now() / 1000 | 0) % lines.length];
}

/* ── the veil ─────────────────────────────────────────────────────
   Two humans, one phone, hidden hands. Without this the game is just
   a very slow way of showing each other your cards. */
function veilHTML(seat){
  const s = M.st.seats[seat];
  return '<div class="kb-veil" id="kb-veil">' +
    '<h4>' + esc(s.name) + ', your turn</h4>' +
    '<p>Everyone else: look away, or at least pretend to. Tap when the phone is ' +
    'in the right hands.</p>' +
    '<button class="kb-act" type="button" data-id="lift">I am ' + esc(s.name) + '</button>' +
    '</div>';
}

function render(){
  if (!M || M.dead || !M.ctx) return;
  const st = M.st;
  const t = M.def.turn(st);
  const done = M.def.over(st);

  /* which hand is face-up right now */
  if (!done && t >= 0 && isLocal(t)) M.view = t;
  else if (M.view == null) M.view = st.seats.findIndex(s => s.own === 'me' || s.own === 'hot');
  if (M.view == null || M.view < 0) M.view = 0;

  /* pass-the-phone: only between two DIFFERENT humans on this device */
  const needVeil = !done && t >= 0 && ownerOf(t) === 'hot' &&
                   M.shown != null && M.shown !== t && !M.veil;
  if (needVeil){ M.veil = t; }

  M.def.paint(UI, st, { turn:t, view:M.view, done, tmp:M.tmp });
  paintTurn(t, done);
  paintBar();

  const old = UI.root.querySelector('#kb-veil');
  if (old) old.remove();
  if (M.veil){
    UI.root.insertAdjacentHTML('beforeend', veilHTML(M.veil));
    const b = UI.root.querySelector('#kb-veil [data-id="lift"]');
    if (b) b.onclick = () => { M.shown = M.veil; M.veil = 0; render(); };
    return;                      /* nothing else moves while the veil is up */
  }
  if (t >= 0 && isLocal(t)) M.shown = t;

  if (done){ finish(done); return; }
  step();
}

/* the beat between moves: the table gathering a trick, or the machine
   deciding. Both are timers, and both are cancelled by stopThinking()
   the moment the screen goes away. */
function step(){
  stopThinking();
  const st = M.st;
  const t = M.def.turn(st);
  if (t === -1){
    const ms = FAST ? 1 : (M.def.pace ? M.def.pace(st) : 850);
    M.timer = setTimeout(() => {
      M.timer = 0;
      if (!M || M.dead) return;
      const opts = M.def.legal(st, -1) || [];
      if (!opts.length) return;
      doMove(-1, opts[0], 'auto');
      M.tmp = {};
      render();
    }, ms);
    return;
  }
  if (t < 0 || isLocal(t)) return;         /* waiting for a person */
  if (ownerOf(t) === 'net') return;        /* waiting for the wire */
  /* the machine */
  M.timer = setTimeout(() => {
    M.timer = 0;
    if (!M || M.dead) return;
    if (M.def.turn(M.st) !== t) return;
    let mv = null;
    try { mv = M.def.think(M.st, t, M.st.seats[t].lvl || 2); } catch(e){ mv = null; }
    const legal = M.def.legal(M.st, t) || [];
    /* BELT AND BRACES. think() is an opinion; legal() is the law. If a
       machine ever returns something it may not play we take the first
       legal move instead of crashing the table — and the test harness
       counts every time it happens, so it cannot hide. */
    if (!mv || !allowed(t, mv)){
      if (window.__KB_TEST) window.__KB_TEST.badAI = (window.__KB_TEST.badAI || 0) + 1;
      mv = legal[0];
    }
    if (!mv) return;
    mv.seat = t;
    doMove(t, mv, 'ai');
    M.tmp = {};
    render();
  }, FAST ? 1 : (M.def.thinkMs || 620));
}

function paintTurn(t, done){
  const st = M.st;
  if (done){
    P.ui.setTurn(M.ctx, { cls:'', who:done.head, note:'' });
    return;
  }
  const who = t === -1 ? 'Gathering…' :
              isLocal(t) ? (ownerOf(t) === 'me' ? 'Your turn' : st.seats[t].name + ' — your turn')
                         : st.seats[t].name + ' is thinking…';
  P.ui.setTurn(M.ctx, {
    cls: t >= 0 ? (st.seats[t].team === 1 ? 'r' : 'w') : '',
    who,
    note: M.def.note ? M.def.note(st) : ''
  });
}

function paintBar(){
  const b = M.ctx.btn('kb-undo');
  if (b) b.disabled = !(undoPoint() >= 0) || !!M.net;
}

/* ═══════════════════════════════════════════════════════════════════
   THE END OF A GAME
   An honest full-stop: what the score was, why that ended it, and the
   two things you might want next. The ledger is only touched when a
   game with a machine in it actually finishes.
   ═══════════════════════════════════════════════════════════════════ */
function finish(done){
  if (M.finished) return;
  M.finished = true;
  stopThinking();
  saveSlot(M.gid, null);
  if (!M.net && done.tone){
    const o = done.tone === 'win' ? 'w' : done.tone === 'lose' ? 'l' : 'd';
    record(M.gid, o);
    /* and into js/party.js's own ledger through its public API, the way
       chess and dama do, so our tiles carry a W/L/D like theirs. Our
       copy in karti_klabb_v1 stays the one we read. */
    if (typeof P.record === 'function'){ try { P.record(M.gid, o); } catch(e){} }
  }
  P.ui.result(M.ctx, {
    tone: done.tone || 'draw',
    head: done.head,
    why:  done.why,
    quip: done.quip,
    buttons: [
      { label:'Deal again', icon:'refresh', cls:'primary',
        go: () => newGame(M.gid, M.opts) },
      { label:'Back to the shelf', icon:'back', cls:'ghost', go: () => P.hub() }
    ]
  });
}

/* ═══════════════════════════════════════════════════════════════════
   OPENING A GAME
   ═══════════════════════════════════════════════════════════════════ */
function newGame(gid, opts, snap){
  const def = BY_ID[gid];
  if (!def) return;
  injectCSS();
  P.show();
  const m = snap ? resume(snap) : startMatch(gid, opts);
  if (!m) return;
  M.view = M.st.seats.findIndex(s => s.own === 'me');
  if (M.view < 0) M.view = M.st.seats.findIndex(s => s.own === 'hot');
  if (M.view < 0) M.view = 0;
  M.shown = M.view;
  M.finished = false;
  M.ctx = P.ui.frame({
    title: def.name,
    /* the back arrow off a table goes to THAT game's setup sheet, not
       to the shelf — the thing you most often want next is another
       hand of the same game with different company */
    onBack: () => setupSheet(def),
    leave: () => leave(),
    buttons: [
      { id:'kb-undo',  label:'Undo',  icon:'back',    cls:'ghost' },
      { id:'kb-rules', label:'Rules', icon:'book',    cls:'ghost' },
      { id:'kb-quit',  label:'New',   icon:'refresh', cls:'ghost' }
    ]
  });
  /* party.js's frame sizes a square chessboard into the host; we do not
     want one, so its ResizeObserver is released and the square stack is
     replaced by the felt. */
  if (M.ctx.stopFit) M.ctx.stopFit();
  M.ctx.badge.textContent = def.mt || '';
  table();
  M.ctx.btn('kb-undo').onclick = () => {
    const n = undoPoint();
    if (n < 0) return;
    if (M.net){
      /* Online, undo is a REQUEST, not a right — js/mp.js runs the vote
         and calls back into KARTI_KLABB.hooks.rollbackTo() if every
         other seat agrees. We never roll our own board back here. */
      if (M.net.askUndo) M.net.askUndo(n);
      return;
    }
    M.veil = 0;
    rollbackTo(n);
    M.finished = false;
    const o = M.ctx.root.querySelector('.pt-over'); if (o) o.remove();
    render();
  };
  M.ctx.btn('kb-rules').onclick = () => rulesSheet(def);
  M.ctx.btn('kb-quit').onclick = () => {
    P.ui.confirm(M.ctx, {
      head:'Throw this hand in?',
      why:'The cards go back in the box and you deal fresh. Nothing is scored.',
      yes:'Deal again', no:'No, carry on',
      go: () => newGame(gid, M.opts)
    });
  };
  render();
}

function leave(){
  stopThinking();
  if (M){
    autosave();
    const net = M.net;
    M.dead = true;
    if (net && net.onGone) { try { net.onGone(); } catch(e){} }
  }
  M = null; UI = null;
}

/* ── the rules card ───────────────────────────────────────────────
   Over the felt, not a separate screen: you want it mid-hand, when
   somebody at the table has just said "no, the Jack beats the Queen". */
function rulesSheet(def){
  const ctx = M ? M.ctx : null;
  if (!ctx) return;
  const old = ctx.root.querySelector('.pt-ask'); if (old) old.remove();
  const ask = document.createElement('div');
  ask.className = 'pt-over pt-ask';
  ask.innerHTML =
    '<div class="pt-card" style="max-width:340px;text-align:left">' +
      '<h3 style="text-align:center">' + esc(def.name) + '</h3>' +
      '<div class="kb-rules" style="margin:12px 0 0"><ul>' +
        def.rules.map(r => '<li>' + r + '</li>').join('') +
      '</ul></div>' +
      '<div class="pt-acts"><button class="btn ghost" id="kb-rx">Right, got it</button></div>' +
    '</div>';
  ctx.root.appendChild(ask);
  ask.querySelector('#kb-rx').onclick = () => ask.remove();
  ask.querySelector('#kb-rx').focus();
}

/* ═══════════════════════════════════════════════════════════════════
   THE SETUP SHEET
   Who is at the table. Kept short on purpose: a card game people
   already know should be two taps from the shelf to the first trick.
   ═══════════════════════════════════════════════════════════════════ */
function setupSheet(def){
  P.show();
  stopThinking(); M = null; UI = null;
  const el = P.ui.screenEl();
  const p = pref(def.id);
  let seats = p.seats || def.seats[0];
  if (def.seats.indexOf(seats) < 0) seats = def.seats[0];
  let humans = Math.min(p.humans || 1, seats);
  let lvl = p.lvl || 2;

  function paint(){
    el.innerHTML =
      '<div class="tbar">' +
        '<button class="iconbtn" id="kb-back" aria-label="Back">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(def.name) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<p class="blurb">' + def.blurb + '</p>' +
        (def.seats.length > 1
          ? '<div class="tiny pt-lbl">How many at the table</div>' +
            '<div class="pt-opts">' + def.seats.map(n =>
              '<button class="pt-opt' + (n === seats ? ' on' : '') + '" data-seats="' + n + '">' +
                ico('users') + '<b>' + n + ' players</b><i>' + esc(def.seatNote[n] || '') + '</i>' +
              '</button>').join('') + '</div>'
          : '') +
        '<div class="tiny pt-lbl">Who is holding cards</div>' +
        '<div class="pt-opts">' +
          Array.from({ length: seats }, (_, i) => i + 1).map(n =>
            '<button class="pt-opt' + (n === humans ? ' on' : '') + '" data-h="' + n + '">' +
              ico('users') +
              '<b>' + (n === 1 ? 'Just me' : n + ' of us on this phone') + '</b>' +
              '<i>' + (n === seats ? 'No machine at all.'
                     : (seats - n) + ' seat' + (seats - n === 1 ? '' : 's') +
                       ' played by the app.') + '</i>' +
            '</button>').join('') +
        '</div>' +
        (humans < seats
          ? '<div class="tiny pt-lbl">How sharp is the machine</div>' +
            '<div class="pt-opts">' + [
              { k:1, n:'Iz-zijuh', d:'Plays whatever is nearest. Bless him.', i:'diff-1' },
              { k:2, n:'Tal-kazin', d:'Counts the trumps. Remembers what fell.', i:'diff-2' },
              { k:3, n:'In-nannu', d:'Knows what you have. He has been watching.', i:'diff-3' }
            ].map(o =>
              '<button class="pt-opt' + (o.k === lvl ? ' on' : '') + '" data-lvl="' + o.k + '">' +
                ico(o.i) + '<b>' + o.n + '</b><i>' + o.d + '</i></button>').join('') + '</div>'
          : '') +
        '<div class="pt-acts" style="margin-top:18px;display:grid;gap:9px">' +
          '<button class="btn primary" id="kb-go">Deal</button>' +
          (savedSlot(def.id)
            ? '<button class="btn ghost" id="kb-res">Carry on the saved hand</button>' : '') +
        '</div>' +
        '<div class="kb-rules"><h5>The rules, as we play them</h5><ul>' +
          def.rules.map(r => '<li>' + r + '</li>').join('') + '</ul></div>' +
      '</div>';
    el.querySelector('#kb-back').onclick = () => P.hub();
    el.querySelectorAll('[data-seats]').forEach(b => b.onclick = () => {
      seats = +b.dataset.seats; humans = Math.min(humans, seats); paint();
    });
    el.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { humans = +b.dataset.h; paint(); });
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { lvl = +b.dataset.lvl; paint(); });
    el.querySelector('#kb-go').onclick = () => {
      pref(def.id, { seats, humans, lvl });
      newGame(def.id, { seats, humans, lvl });
    };
    const r = el.querySelector('#kb-res');
    if (r) r.onclick = () => {
      const s = savedSlot(def.id);
      if (!s) return;
      newGame(def.id, s.opts, s);
    };
  }
  paint();
}

/* ═══════════════════════════════════════════════════════════════════
   THE WAY IN
   There is no menu of our own any more and that is the point: the four
   tiles ARE the menu, they sit on the Party Games shelf under Card
   Games next to SKARTA, and each one opens its own setup sheet. Two
   taps from the shelf to a dealt hand.

   define() above does the registering, so a fifth game would only have
   to call KARTI_KLABB.define() and it would appear on the shelf with
   the rest.
   ═══════════════════════════════════════════════════════════════════ */
function open(id){
  injectCSS();
  const def = id && BY_ID[id];
  if (def) setupSheet(def); else P.hub();
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE
   The engine files below use define(). js/mp.js uses hooks.
   ═══════════════════════════════════════════════════════════════════ */
window.KARTI_KLABB = {
  /* open() with no argument goes to the shelf; open('bixkla') goes
     straight to that game's setup sheet. */
  open, close: () => { leave(); P.hub(); },
  define, games: GAMES, engines: BY_ID,
  deck: DECK,

  /* ───────────────────────────────────────────────────────────────
     HOOKS — the surface js/mp.js drives.

     The contract, in one sentence: a match is (gid, opts, seed, log),
     and any state anybody needs is buildState() of those four. There
     is no other state, so two phones that agree on those four fields
     agree on the board, and rolling a move back is cutting the log.

     TAKEBACK, the flow the online build is putting together:
       1. a seat taps Undo → net.askUndo(n) is called with the index
          its last move sits at (hooks.undoIndexOf(seat) gives the
          same number to anybody who asks)
       2. mp.js collects a yes from EVERY other seat
       3. every client, including the one that asked, calls
          hooks.rollbackTo(n). Deterministic: same seed, same first n
          moves, same board on four phones.
       4. hooks.onState fires with {reason:'rollback'} so anything
          watching repaints.
     Nothing here rolls back on its own. A local Undo button is wired
     to net.askUndo the moment hooks.attachNet() has been called, so
     the offline instant-undo cannot leak into an online game.
     ─────────────────────────────────────────────────────────────── */
  hooks: {
    live:      () => !!(M && !M.dead),
    gameId:    () => M ? M.gid : null,
    seed:      () => M ? M.seed : null,
    opts:      () => M ? clone(M.opts) : null,
    seats:     () => M ? clone(M.st.seats) : [],
    turn:      () => M ? M.def.turn(M.st) : -2,
    over:      () => M ? M.def.over(M.st) : null,

    /* the whole truth. Every hand in it — a card game's shared state
       has to live somewhere, and the offline app is that somewhere.
       Online, hand this to ONE authority (the host) and give the other
       seats view(). */
    state:     () => M ? clone(M.st) : null,
    /* the same state with everybody else's hand replaced by a count,
       for a client that must not be able to read the table */
    view: seat => {
      if (!M) return null;
      const st = clone(M.st);
      st.seats.forEach((s, i) => {
        if (i !== seat && s.hand){ s.hidden = s.hand.length; s.hand = []; }
      });
      if (st.stock) st.stockLeft = st.stock.length, st.stock = [];
      return st;
    },

    legal:     seat => clone(legalFor(seat)),
    /* apply a move that arrived from another phone. Same gate as a tap:
       wrong seat or illegal card and it is refused, loudly, rather than
       corrupting a board four people are looking at. */
    apply: (seat, move) => {
      const r = doMove(seat, move, 'net');
      if (r.ok) render();
      return r;
    },

    moveLog:   () => M ? clone(M.log) : [],
    moveCount: () => M ? M.log.length : 0,
    snapshot,
    /* rebuild from a snapshot — how a reconnecting phone catches up */
    load: snap => { const m = resume(snap); if (m) { M.view = 0; render(); } return !!m; },

    /* ── the two calls a takeback is made of ── */
    undoIndexOf: seat => lastMoveOf(seat),
    rollbackTo,

    /* subscriptions. onMove fires for EVERY applied move with its
       source, so the transport can forward local ones and ignore the
       ones it delivered itself. */
    onMove:  f => { moveSubs.push(f);  return () => { const i = moveSubs.indexOf(f);  if (i >= 0) moveSubs.splice(i, 1); }; },
    onState: f => { stateSubs.push(f); return () => { const i = stateSubs.indexOf(f); if (i >= 0) stateSubs.splice(i, 1); }; },

    /* who is behind each seat. 'me' and 'hot' are people on this
       phone, 'ai' is the machine, 'net' is somebody else's phone. */
    setOwner: (seat, own) => {
      if (!M || !M.st.seats[seat]) return false;
      M.st.seats[seat].own = own;
      render();
      return true;
    },
    /* the online controller: {onMove, askUndo, onGone}. Setting it
       turns the Undo button into a request and stops the autosave. */
    attachNet: net => { if (M){ M.net = net || null; render(); } },
    render,
    /* start/join a match the transport has already agreed the terms of */
    begin: (gid, opts, seed) => { newGame(gid, opts, seed == null ? undefined : { v:1, gid, opts, seed, log:[] }); return snapshot(); }
  }
};

/* The shelf is painted by js/party.js before anything of ours has been
   on screen, and its four tiles reference our marks by id — so the
   symbol sheet has to be in the document from the moment this file
   loads, not from the first time somebody opens a game. */
if (document.body) injectDefs();
else document.addEventListener('DOMContentLoaded', injectDefs);

/* ── test hooks — inert unless the page is opened with ?pttest ──── */
try {
  if (String(location.search).indexOf('pttest') >= 0){
    window.__KB_TEST = {
      badAI: 0,
      M: () => M,
      st: () => (M ? M.st : null),
      def: id => BY_ID[id],
      start: (gid, opts, seed) => { newGame(gid, opts, seed == null ? undefined : { v:1, gid, opts, seed, log:[] }); return true; },
      fast: on => { FAST = !!on; },
      doMove, rollbackTo, undoPoint, buildState, snapshot, resume,
      deck: DECK, games: () => GAMES.map(g => g.id),
      store: () => ST
    };
  }
} catch(e){}

})();
