/* ═══════════════════════════════════════════════════════════════════
   KARTI — tombla.js
   TOMBLA — the engine.

   Malta's Christmas game. Ninety numbers in a bag, a card of fifteen
   in front of you, and a room of people who all go quiet the second
   somebody is one away.

   ───────────────────────────────────────────────────────────────────
   WHAT GAME THIS ACTUALLY IS
   Tombla is the Maltese cousin of the Italian TOMBOLA. It is NOT
   American bingo (75 balls, a 5x5 card with a free centre). Beyond
   that the research turned up something we did not expect and which
   changed the shape of this file, so it is written out in full in the
   RULES block below rather than buried: MALTA AND ITALY DO NOT PLAY
   THE SAME LADDER, and Malta's is in the statute book. We therefore
   ship BOTH, each under its own name, and neither is dressed up as
   the other.

   WHAT THIS FILE IS
     · the rules, and nothing else. Card generation, the bag, the
       ladder of prizes, and the one function that decides whether a
       claim is real.
     · a match runner built the same way js/klabb.js builds its one:
       a match is (gid, opts, seed, log) and every byte of state is a
       pure function of those four. The RNG state lives INSIDE the
       state; no line in here calls Math.random except newSeed().
     · the lobby: seats arrive, mark themselves ready, the host starts.
     · the hooks js/mp.js needs to run the whole thing over a wire.

   WHAT IT IS NOT
     · it draws nothing. js/tombla-ui.js owns every pixel.

   HOUSE RULES THIS FILE OBEYS
     · index.html and css/ belong to other parts of the build, so the
       stylesheet is injected at runtime (in the UI file) the way
       js/mp.js and js/party.js do it.
     · persistence lives in karti_tombla_v1 and nowhere else.
     · no unicode pictographs anywhere. Every mark on screen is drawn
       geometry or a number.

   ═══════════════════════════════════════════════════════════════════
   THE RULES WE IMPLEMENTED  ·  and the reasoning behind each choice
   ───────────────────────────────────────────────────────────────────
   THE BAG.        90 numbers, 1 to 90, each drawn exactly once, never
                   put back. Well attested everywhere in the family and
                   not in dispute.

   THE CARD.       3 rows x 9 columns. 15 numbers, FIVE PER ROW, so
                   twelve of the twenty-seven cells are blank. Each
                   column carries between one and three numbers, and
                   the numbers inside a column run downwards in order.

   THE COLUMNS.    Column 1 holds 1-9, column 2 holds 10-19, ... ,
                   column 8 holds 70-79, and column 9 holds 80-90.
                   9 + (7 x 10) + 11 = 90.
                   ── THE DISAGREEMENT ──
                   Some sources describe the columns as 1-10, 11-20,
                   ... , 81-90. That reading is tidier to say out loud
                   but it does not survive contact with the object: a
                   traditional tombola SET is six cartelle which
                   between them carry all ninety numbers exactly once,
                   and that only partitions if the first column is nine
                   wide and the last is eleven. It is also the layout
                   the whole 90-ball family uses (Italian tombola, UK
                   bingo, housie). We follow the family. Changing it is
                   one edit to COLS below and nothing else.

   ───────────────────────────────────────────────────────────────────
   THE LADDER — AND THE THING THE RESEARCH TURNED UP

   We went looking for a Maltese divergence worth honouring the way
   Bixkla diverges from Briscola. There is one, it is bigger than
   expected, and it is written into Maltese law.

   ITALY plays a ladder of five (six, counting the decina):
     AMBO 2 · TERNO 3 · QUATERNA 4 · CINQUINA 5 · [DECINA: two whole
     rows] · TOMBOLA: all fifteen.  All of 2/3/4/5 must be ON THE SAME
     ROW of the same cartella ("sulla stessa riga") — not adjacent,
     just the same row. Each prize goes to the FIRST player to reach
     it and then play carries on for the next one.

   MALTA does not. The Lotteries and Other Games Act, Cap. 438, art. 2
   defines a "tombola game" — "also known as bingo" — as won by the
   player who first marks
       the LINE  — all five numbers on one horizontal row, or
       the HOUSE — all fifteen numbers on the scorecard.
   That is the whole ladder. No ambo, no terna, no kwaterna as prize
   tiers. The Malta Gaming Authority describes commercial bingo as
   "also known as 'tombola' in Malta … line, house, or snowball", and
   the National Lottery's own 90-ball product sells exactly Line and
   House (plus a jackpot). Malta's ladder is in fact SHORTER than UK
   bingo's — there is not even a standard "two lines" tier.
   And where Italy calls ambo/terno/quaterna, Malta uses those words
   for IL-LOTTU, not for tombla: għanbu, tern, kwatern, ċinkwina all
   appear in Maltese dictionaries under the lottery, not the tombla.

   So: shipping the Italian ladder and calling it Maltese would have
   been exactly the invented variant we were told never to write.

   WHAT WE DID INSTEAD — two named modes, both real, neither disguised:

     'ladder'  TOMBLA KLASSIKA — the Italian tombola ladder, five
               prizes, ambo → terna → kwaterna → ċinkwina → tombla.
               THE DEFAULT, because it is the better game: five prizes
               means nobody is out of it after two minutes, and the
               laddering is the whole tension. Labelled on screen as
               the classic/Italian rules, which is what it is.
     'hall'    TAL-KAŻIN — Malta's own: VERS (the line, five on one
               row) then FATTA (the house, all fifteen). This is the
               game the band clubs, the parishes and the halls actually
               play, and it is the one the word "tombla" denotes in
               Maltese law.

   Both use the identical card, bag and claim machinery. 'hall' is the
   same PRIZES table with three rungs switched off.

   WHAT WE LEFT OUT, ON PURPOSE, AND WHY
     · DECINA / RAMPAZZO (two whole rows on one card) — a genuine
       Italian sixth tier. Left out because five rungs already fill a
       game and a sixth makes the ladder strip unreadable on a phone.
       Adding it is one row in PRIZES plus a case in holds().
     · TOMBOLINO — a real attested prize for the SECOND card to
       complete. Left out because the game is over at the tombla and a
       consolation round after the big shout is an anticlimax.
     · The "a row that has already won cannot win the next tier up"
       house rule. It.wikipedia states it and then explicitly rejects
       it ("non trova riscontro nelle regole ufficiali"), and there is
       no governing body to appeal to. Default OFF, and not
       implemented, rather than picked at random.
     · MARKERS. Italian sources are full of beans, chickpeas, lentils
       and orange peel. We found NO Maltese source for any of it and no
       Maltese word for a tombla marker, so nothing in this game is
       presented as a Maltese marker tradition.

   ───────────────────────────────────────────────────────────────────
   THE MALTESE THAT IS REAL, AND IS IN HERE
     kartella / kartelli   the scorecard(s)
     ġog                   the sheet of six kartelli
     vers                  the line
     anunzjatur            the caller
     fatta!                what you shout when the card is full
     laqmijiet             the number nicknames — Malta has its own,
                           independent of the Neapolitan Smorfia, and
                           they are attested in Il-Miklem and in the
                           published 1-90 lists. Il-pastizz is 53.
                           Ix-xiħa is 90. See LAQAM below: the sourced
                           nickname is separated from KARTI's own joke
                           so nobody can mistake one for the other.
     Numbers are called in MALTESE AND ENGLISH at a real Maltese
     tombla, because half the room is hard of hearing. We do the same.
     Tombla in Malta is played ALL YEAR, not only at Christmas — that
     is the Neapolitan half of the story, not the Maltese one.

   ───────────────────────────────────────────────────────────────────
   THE THREE RULINGS WE HAD TO MAKE  (a phone has no caller to argue
   with, so these are decided in code, and they are decided out loud)

   1. A MARK IS A MOVE, AND A MOVE IS CHECKED.
      You may only mark a cell whose number has ALREADY BEEN CALLED.
      That is enforced in apply(), which is the same gate a tap goes
      through and the same gate a packet from another phone goes
      through. It has two consequences and we wanted both:
        · missing a number is real. Until you tap it, you have not got
          it, and you cannot claim on it.
        · a claim is provable from the state alone. There is no
          "trust the client" anywhere in a tombla claim.

   2. A LATE CLAIM IS GOOD, A DEAD ONE IS DEAD.
      You are not forced to claim on the exact call that completed it.
      Realising two numbers later and lunging for the button is the
      best moment in the game and we are not taking it away. BUT the
      moment a HIGHER prize is claimed, every lower prize still unclaimed
      is CLOSED — nobody ever wins it. Snooze on your ambo until
      somebody shouts terna and the ambo is gone for good.
      (At a real table the caller adjudicates this by feel. We had to
      pick something, and this is the reading that keeps the ladder
      moving instead of letting a forgotten ambo be cashed in after the
      tombla.)

   3. A FALSE CLAIM COSTS YOU.
      Tap AMBO without one and the claim is refused and that seat is
      locked out of claiming for a few seconds. Otherwise the optimal
      strategy is to hammer every button every call, which is not a
      game, and online it is a denial-of-service with a party hat on.

   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
if (!K || !P) return;

/* ═══════════════════════════════════════════════════════════════════
   RANDOMNESS THAT CAN BE REPLAYED
   Identical to the block at the top of js/klabb.js, and identical for
   the same reason: the entire RNG state is one integer living inside
   the game state, so (seed, log) replays to a bit-identical position.

   In tombla that rule is not a nicety, it is the whole product. Eight
   phones must agree that call 37 was the number 61. They agree because
   they each ran the same mulberry32 from the same seed over the same
   Fisher-Yates, not because a server told them so.
   ═══════════════════════════════════════════════════════════════════ */
function rnd(st){
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

/* A pure, stateless hash. The machine players decide things with this
   rather than with rnd(), because their decisions happen on a wall
   clock and must not be allowed to advance the RNG that the bag came
   out of. Same inputs, same answer, on every phone, forever. */
function hash32(a, b, c){
  let h = (a ^ 0x9E3779B9) >>> 0;
  h = Math.imul(h ^ (b + 0x85EBCA6B), 0xCC9E2D51) >>> 0;
  h = Math.imul(h ^ (c + 0xC2B2AE35), 0x1B873593) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2545F491) >>> 0; h ^= h >>> 13;
  return h >>> 0;
}
const hashF = (a, b, c) => hash32(a, b, c) / 4294967296;

/* ═══════════════════════════════════════════════════════════════════
   THE CARD (il-kartuna)
   Stored as ONE FLAT ARRAY OF 27 SMALL INTEGERS, row-major:
       index = row * 9 + col      0 means an empty cell
   Flat because the whole state is JSON-cloned for the log and pushed
   down a socket, and because "row 1" is then cells 0..8 with no
   nesting to get wrong.
   ═══════════════════════════════════════════════════════════════════ */
const ROWS = 3, COLS = 9, PER_ROW = 5, ON_CARD = 15;

/* Column j holds LO[j] .. HI[j]. See THE COLUMNS in the header for why
   the first column is nine wide and the last is eleven. */
const LO = [ 1, 10, 20, 30, 40, 50, 60, 70, 80];
const HI = [ 9, 19, 29, 39, 49, 59, 69, 79, 90];
const colOf = n => (n <= 9 ? 0 : n >= 80 ? 8 : Math.floor(n / 10));

/* ── how many numbers each column gets ─────────────────────────────
   Every column carries at least one (a card with a whole empty column
   looks broken and is not what a cartella looks like), at most three
   (three is the whole height), and they sum to fifteen. Start at one
   each — that is nine — and hand out the remaining six. */
function colCounts(st){
  const c = [1,1,1,1,1,1,1,1,1];
  let extra = ON_CARD - COLS;                 /* 6 */
  let guard = 0;
  while (extra > 0 && guard++ < 400){
    const j = rint(st, COLS);
    if (c[j] < ROWS){ c[j]++; extra--; }
  }
  return c;
}

/* ── which rows those numbers sit in ───────────────────────────────
   A 3x9 grid of 0/1 with the column sums above and every row summing
   to exactly five. This is a bipartite degree sequence, and the
   Havel-Hakimi rule builds one whenever one exists: take the columns
   in descending order of how many they need, and give each of them to
   the rows with the most room left. Gale-Ryser guarantees a solution
   exists for these two sequences, so this never fails — but it is
   checked anyway, because "never fails" is a thing people write in a
   comment above the bug. */
function occupancy(st, c){
  const order = [];
  for (let j = 0; j < COLS; j++) order.push(j);
  /* shuffle first so that ties inside the descending sort break
     randomly rather than always favouring the left of the card */
  shuffle(st, order);
  order.sort((a, b) => c[b] - c[a]);

  const rem = [PER_ROW, PER_ROW, PER_ROW];
  const grid = new Array(ROWS * COLS).fill(0);
  for (const j of order){
    const rows = [0, 1, 2];
    shuffle(st, rows);                         /* random among equals */
    rows.sort((a, b) => rem[b] - rem[a]);
    for (let k = 0; k < c[j]; k++){
      const r = rows[k];
      if (rem[r] <= 0) return null;            /* cannot happen; see above */
      grid[r * COLS + j] = 1;
      rem[r]--;
    }
  }
  if (rem[0] || rem[1] || rem[2]) return null;
  return grid;
}

/* ── the finished cartella ─────────────────────────────────────────
   Numbers inside a column run downwards, which is how a printed one
   reads and how your eye finds a number in a hurry. */
function makeCard(st){
  for (let attempt = 0; attempt < 40; attempt++){
    const c = colCounts(st);
    const grid = occupancy(st, c);
    if (!grid) continue;
    const cells = new Array(ROWS * COLS).fill(0);
    for (let j = 0; j < COLS; j++){
      const pool = [];
      for (let n = LO[j]; n <= HI[j]; n++) pool.push(n);
      shuffle(st, pool);
      const picked = pool.slice(0, c[j]).sort((a, b) => a - b);
      let at = 0;
      for (let r = 0; r < ROWS; r++){
        if (grid[r * COLS + j]) cells[r * COLS + j] = picked[at++];
      }
    }
    return cells;
  }
  return null;
}

/* Is this thing a legal cartella? Used by the test harness, and by
   load() before it will accept a snapshot off the wire — a card that
   arrives from another phone is not trusted any more than a claim is. */
function cardIsLegal(cells){
  if (!Array.isArray(cells) || cells.length !== ROWS * COLS) return false;
  const seen = {};
  let total = 0;
  for (let r = 0; r < ROWS; r++){
    let inRow = 0;
    for (let j = 0; j < COLS; j++){
      const n = cells[r * COLS + j];
      if (n === 0) continue;
      if (!Number.isInteger(n) || n < LO[j] || n > HI[j]) return false;
      if (seen[n]) return false;
      seen[n] = 1; inRow++; total++;
    }
    if (inRow !== PER_ROW) return false;
  }
  if (total !== ON_CARD) return false;
  for (let j = 0; j < COLS; j++){
    let last = 0, cnt = 0;
    for (let r = 0; r < ROWS; r++){
      const n = cells[r * COLS + j];
      if (!n) continue;
      cnt++;
      if (n <= last) return false;               /* must run downwards */
      last = n;
    }
    if (cnt < 1 || cnt > ROWS) return false;
  }
  return true;
}

/* ═══════════════════════════════════════════════════════════════════
   THE LADDER
   `need` is how many marks ON ONE ROW the prize wants. TOMBLA is the
   odd one out and wants the whole card, which is why it carries
   need:0 and is handled by name.
   ═══════════════════════════════════════════════════════════════════ */
const PRIZES = [
  { k:'ambo',     need:2, name:'AMBO',     hall:'',      pts:1,
    line:'Two on one row.' },
  { k:'terna',    need:3, name:'TERNA',    hall:'',      pts:2,
    line:'Three on one row.' },
  { k:'kwaterna', need:4, name:'KWATERNA', hall:'',      pts:3,
    line:'Four on one row.' },
  /* the same rung under both names. In the klassika it is the
     ċinkwina; in a każin it is the VERS, and it is the first prize of
     the night rather than the fourth. */
  { k:'cinkwina', need:5, name:'ĊINKWINA', hall:'VERS',  pts:5,
    line:'A whole row of five.' },
  { k:'tombla',   need:0, name:'TOMBLA',   hall:'FATTA', pts:10,
    line:'All fifteen. The lot.' }
];
const PRIZE_KEYS = PRIZES.map(p => p.k);
const prizeAt = k => PRIZES[PRIZE_KEYS.indexOf(k)];
const prizeRank = k => PRIZE_KEYS.indexOf(k);

/* which rungs are in play. 'hall' is Malta's statutory pair; 'ladder'
   is the Italian five. Everything else in the engine reads this and
   nothing else, so a third rule set is one line here. */
const LADDERS = {
  ladder: ['ambo','terna','kwaterna','cinkwina','tombla'],
  hall:   ['cinkwina','tombla']
};
const rungsOf = st => LADDERS[(st && st.opts && st.opts.mode) || 'ladder'] || LADDERS.ladder;
const inLadder = (st, k) => rungsOf(st).indexOf(k) >= 0;
/* what this rung is CALLED in the mode being played */
function prizeName(st, k){
  const p = prizeAt(k);
  if (!p) return String(k).toUpperCase();
  const hall = (st && st.opts && st.opts.mode) === 'hall';
  return (hall && p.hall) ? p.hall : p.name;
}

/* how many of a row are marked, and how many of the whole card */
function rowMarks(marks, r){
  let n = 0;
  for (let j = 0; j < COLS; j++) if (marks[r * COLS + j]) n++;
  return n;
}
function cardMarks(marks){
  let n = 0;
  for (let i = 0; i < ROWS * COLS; i++) if (marks[i]) n++;
  return n;
}

/* Does this exact card, as it is actually marked right now, hold this
   prize? The ONE function a claim is decided by, on every phone, with
   nothing but the state in front of it.
   Returns the row it is on (0..2) for the line prizes, 3 for a tombla,
   or -1 for no. */
function holds(cells, marks, key){
  if (key === 'tombla') return cardMarks(marks) === ON_CARD ? 3 : -1;
  const need = prizeAt(key) ? prizeAt(key).need : 0;
  if (!need) return -1;
  let best = -1, bestN = -1;
  for (let r = 0; r < ROWS; r++){
    const n = rowMarks(marks, r);
    if (n >= need && n > bestN){ bestN = n; best = r; }
  }
  return best;
}

/* How far off is this card from the next thing it could win? Used for
   the "one away" strip, and by the machine players to decide how hard
   to concentrate. Returns {key, away, row} for the nearest LIVE prize. */
function nearest(st, cells, marks){
  let out = null;
  for (const p of PRIZES){
    const pz = st.prizes[p.k];
    if (!pz || pz.off || pz.done || pz.void) continue;
    if (p.k === 'tombla'){
      const away = ON_CARD - cardMarks(marks);
      if (away >= 0 && (!out || away < out.away)) out = { key:p.k, away, row:3 };
      continue;
    }
    let bestAway = 99, bestRow = -1;
    for (let r = 0; r < ROWS; r++){
      const a = p.need - rowMarks(marks, r);
      if (a >= 0 && a < bestAway){ bestAway = a; bestRow = r; }
    }
    if (bestRow >= 0 && (!out || bestAway < out.away)) out = { key:p.k, away:bestAway, row:bestRow };
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   THE STATE
   Everything below is JSON-safe, and everything below is a pure
   function of (opts, seed, log).

     rs        the RNG, mid-stream
     phase     'lobby' | 'play' | 'done'
     seats[]   { own, name, ready, cards[][27], marks[][27], won[], pts,
                 lock (call index this seat may claim again from) }
     bag[]     the remaining draw, in order. HIDDEN in view(seat) —
               see the note on view() at the foot of this file.
     called[]  every number called so far, in order. THE public record.
     prizes    { ambo:{done,seat,card,row,at} | {done:false} , ... }
               `void:true` means the ladder moved past it and nobody
               ever won it. See ruling 2 in the header.
   ═══════════════════════════════════════════════════════════════════ */
const DEFAULTS = {
  /* 'ladder' = the Italian five-rung tombola (the default; the better
     game). 'hall'  = Malta's own vers-then-fatta. See THE LADDER in
     the header — these are two real rule sets, not a difficulty. */
  mode: 'ladder',
  seats: 4,          /* 2..8 */
  cards: 1,          /* 1..2 cards each — see the note in the UI file  */
  speed: 2,          /* 1 slow · 2 the real thing · 3 quick            */
  level: 2,          /* how sharp the machine players are, 1..3        */
  auto: false        /* auto-mark. OFF. It is an accessibility option
                        and it is never the default — see the note on
                        markAll() below.                               */
};

function optsOf(o){
  o = o || {};
  const n = v => (typeof v === 'number' && isFinite(v)) ? v : null;
  const clampi = (v, a, b, d) => { const x = n(v); return x == null ? d : Math.max(a, Math.min(b, Math.round(x))); };
  return {
    mode: (o.mode === 'hall' ? 'hall' : 'ladder'),
    seats: clampi(o.seats, 2, 8, DEFAULTS.seats),
    cards: clampi(o.cards, 1, 2, DEFAULTS.cards),
    speed: clampi(o.speed, 1, 3, DEFAULTS.speed),
    level: clampi(o.level, 1, 3, DEFAULTS.level),
    auto:  !!o.auto
  };
}

const SEAT_NAMES = [
  'Int',            /* seat 0 is always you when there is a you       */
  'Rita',  'Ġanni', 'Doris', 'Karm',
  'Marija','Toni',  'Pawlu'
];

function deal(opts, seed){
  const o = optsOf(opts);
  const st = {
    v: 1,
    rs: (seed >>> 0) | 0,
    seed: seed >>> 0,
    opts: o,
    phase: 'lobby',
    host: 0,
    seats: [],
    bag: [],
    called: [],
    calls: 0,
    prizes: {},
    ended: null
  };
  const rungs = LADDERS[o.mode] || LADDERS.ladder;
  for (const p of PRIZES)
    st.prizes[p.k] = { done:false, void:false, off: rungs.indexOf(p.k) < 0,
                       seat:-1, card:-1, row:-1, at:-1 };

  for (let i = 0; i < o.seats; i++){
    const cards = [], marks = [];
    for (let c = 0; c < o.cards; c++){
      const cells = makeCard(st);
      cards.push(cells);
      marks.push(new Array(ROWS * COLS).fill(0));
    }
    st.seats.push({
      own: i === 0 ? 'me' : 'ai',
      name: SEAT_NAMES[i] || ('Seat ' + (i + 1)),
      ready: false,
      cards, marks,
      won: [],                  /* prize keys, in the order they landed */
      pts: 0,
      lock: -1,                 /* refused-claim lockout, in call index */
      missed: 0                 /* numbers on the card, called, not marked */
    });
  }

  /* the bag, shuffled once, here, and never touched again */
  const bag = [];
  for (let n = 1; n <= 90; n++) bag.push(n);
  shuffle(st, bag);
  st.bag = bag;

  return st;
}

/* ═══════════════════════════════════════════════════════════════════
   THE MOVES
   Every one of them is a small JSON object with a `t`. apply() is the
   only thing in this file that changes a state, it is deterministic,
   and it refuses anything it does not like rather than half-doing it.

     {t:'ready',  s, v}          a seat says it is ready (lobby only)
     {t:'start'}                 the host starts (lobby, all ready)
     {t:'call',   k, n}          the next number comes out of the bag
     {t:'mark',   s, c, i}       a seat marks cell i of its card c
     {t:'unmark', s, c, i}       ... and takes it back
     {t:'claim',  s, c, p}       a seat claims prize p on card c
     {t:'quit',   s}             a seat walks out

   `s` is always the SEAT the move belongs to. apply() never infers it,
   because a packet that arrives claiming to be from seat 3 has to be
   checked against the seat the transport says it came from — that
   check is in applyFrom(), and it is the same check a tap goes
   through.
   ═══════════════════════════════════════════════════════════════════ */

/* the number a call move is for, straight out of the bag. Returns 0 if
   the bag is empty or hidden. */
function bagPeek(st){
  return (st.bag && st.bag.length) ? st.bag[0] : 0;
}

function apply(st, mv){
  if (!mv || typeof mv !== 'object') return { ok:false, why:'no move' };
  const t = mv.t;

  if (t === 'ready'){
    if (st.phase !== 'lobby') return { ok:false, why:'the game has already started' };
    const s = st.seats[mv.s|0];
    if (!s) return { ok:false, why:'no such seat' };
    s.ready = !!mv.v;
    return { ok:true };
  }

  if (t === 'start'){
    if (st.phase !== 'lobby') return { ok:false, why:'already started' };
    if (!st.seats.every(s => s.ready)) return { ok:false, why:'somebody is not ready' };
    st.phase = 'play';
    return { ok:true };
  }

  if (t === 'call'){
    if (st.phase !== 'play') return { ok:false, why:'nothing is being played' };
    /* idempotent: a call that has already happened is a no-op, not an
       error. Online, the same call can arrive twice from two paths and
       the second one must not shove the bag along. */
    if (typeof mv.k === 'number' && mv.k < st.calls) return { ok:true, dup:true };
    if (typeof mv.k === 'number' && mv.k > st.calls)
      return { ok:false, why:'a call out of order', desync:true };

    let n = mv.n | 0;
    if (st.bag && st.bag.length){
      const want = st.bag[0];
      /* the move may carry the number (online, where the bag is hidden
         from the clients) — but if THIS state still holds the bag, the
         two have to agree or somebody is on a different game */
      if (n && n !== want) return { ok:false, why:'a number from another bag', desync:true };
      n = want;
      st.bag.shift();
    }
    if (!n || n < 1 || n > 90) return { ok:false, why:'the bag is empty' };
    if (st.called.indexOf(n) >= 0) return { ok:false, why:'that number is already out', desync:true };
    st.called.push(n);
    st.calls++;

    /* who has this number and has not tapped it yet — the only reason
       this is counted here is so the UI can nag ("you have missed 2")
       without walking every card on every frame */
    recount(st);

    /* auto-mark, when a seat has asked for it. It is applied HERE, in
       apply(), rather than by the UI firing mark moves — otherwise the
       marks would not exist on a replay of the log, and a rejoining
       phone would come back with a blank card. */
    if (st.opts.auto){
      for (let i = 0; i < st.seats.length; i++){
        const s = st.seats[i];
        if (s.own !== 'me' && s.own !== 'hot') continue;
        markNumber(st, i, n);
      }
    }
    if (!st.bag.length && st.called.length >= 90) finishIfDone(st);
    return { ok:true, n };
  }

  if (t === 'mark' || t === 'unmark'){
    if (st.phase !== 'play') return { ok:false, why:'nothing is being played' };
    const s = st.seats[mv.s|0];
    if (!s) return { ok:false, why:'no such seat' };
    const cells = s.cards[mv.c|0], marks = s.marks[mv.c|0];
    if (!cells) return { ok:false, why:'no such card' };
    const i = mv.i|0;
    if (i < 0 || i >= ROWS * COLS) return { ok:false, why:'no such square' };
    const n = cells[i];
    if (!n) return { ok:false, why:'that square is empty' };
    if (t === 'mark'){
      /* THE GATE. You cannot mark a number that has not been called.
         Everything else in this engine leans on this one line. */
      if (st.called.indexOf(n) < 0) return { ok:false, why:'that number has not come out' };
      marks[i] = 1;
    } else {
      marks[i] = 0;
    }
    recount(st);
    return { ok:true, n };
  }

  if (t === 'claim'){
    if (st.phase !== 'play') return { ok:false, why:'nothing is being played' };
    const si = mv.s|0;
    const s = st.seats[si];
    if (!s) return { ok:false, why:'no such seat' };
    if (s.lock >= st.calls) return { ok:false, why:'wait for the next number', locked:true };
    const key = String(mv.p || '');
    const pz = st.prizes[key];
    if (!pz) return { ok:false, why:'no such prize' };
    if (pz.off) return { ok:false, why:'that one is not played in these rules' };
    if (pz.done) return { ok:false, why:'that one has gone already' };
    if (pz.void) return { ok:false, why:'that one is closed — the game moved on' };

    /* ── the whole of the anti-cheat, in four lines ──────────────────
       The claim is decided by the cards and the calls that are in the
       state, and by nothing the claimant said. A packet cannot claim
       a tombla it does not hold, because holds() is looking at the
       marks, and every one of those marks had to get past the gate in
       the mark branch above. */
    const ci = mv.c|0;
    const cells = s.cards[ci], marks = s.marks[ci];
    if (!cells) return { ok:false, why:'no such card' };
    const row = holds(cells, marks, key);
    if (row < 0){
      /* refused. A false claim is not free — see ruling 3. */
      s.lock = st.calls + LOCK_CALLS;
      return { ok:false, why:'you have not got it', refused:true, lock:s.lock };
    }

    pz.done = true; pz.seat = si; pz.card = ci; pz.row = row; pz.at = st.calls;
    s.won.push(key);
    s.pts += prizeAt(key).pts;

    /* ruling 2: everything below this rung is now shut. */
    const rank = prizeRank(key);
    for (const p of PRIZES){
      const z = st.prizes[p.k];
      if (!z.off && prizeRank(p.k) < rank && !z.done) z.void = true;
    }

    finishIfDone(st);
    return { ok:true, prize:key, row, seat:si };
  }

  if (t === 'quit'){
    const s = st.seats[mv.s|0];
    if (!s) return { ok:false, why:'no such seat' };
    s.out = true;
    if (st.seats.every(x => x.out)) { st.phase = 'done'; st.ended = { why:'everybody left' }; }
    return { ok:true };
  }

  return { ok:false, why:'a move tombla does not have' };
}

/* how long a refused claim shuts you out for, in CALLS rather than
   seconds — seconds are wall clock and wall clock is not replayable */
const LOCK_CALLS = 2;

/* mark one number wherever it appears on a seat's cards. Used by
   auto-mark and by the machine players; never a shortcut past the
   gate, because it only ever marks numbers it has checked are out. */
function markNumber(st, seat, n){
  const s = st.seats[seat];
  if (!s || st.called.indexOf(n) < 0) return 0;
  let hit = 0;
  for (let c = 0; c < s.cards.length; c++){
    const cells = s.cards[c];
    for (let i = 0; i < cells.length; i++){
      if (cells[i] === n && !s.marks[c][i]){ s.marks[c][i] = 1; hit++; }
    }
  }
  return hit;
}

/* the "you have missed some" counter, per seat */
function recount(st){
  const out = {};
  for (const n of st.called) out[n] = 1;
  for (const s of st.seats){
    let miss = 0;
    for (let c = 0; c < s.cards.length; c++){
      const cells = s.cards[c], marks = s.marks[c];
      for (let i = 0; i < cells.length; i++){
        if (cells[i] && out[cells[i]] && !marks[i]) miss++;
      }
    }
    s.missed = miss;
  }
}

function finishIfDone(st){
  if (st.phase === 'done') return;
  if (st.prizes.tombla.done){
    st.phase = 'done';
    st.ended = { why:'tombla', seat: st.prizes.tombla.seat };
    return;
  }
  if (st.called.length >= 90){
    /* cannot really happen — fifteen numbers on a card and ninety out
       of the bag means every card is complete — but a game that ends
       because the bag emptied must still end tidily rather than sit
       there forever waiting for a claim nobody is going to make. */
    st.phase = 'done';
    st.ended = { why:'bag empty', seat:-1 };
  }
}

/* ═══════════════════════════════════════════════════════════════════
   WHAT A SEAT MAY DO RIGHT NOW
   legal() is not used to build a menu — tombla has no menu of moves,
   it has a card you tap. It exists so the transport can ask the same
   question a tap asks, and so the harness can drive a whole game
   without knowing anything about the screen.
   ═══════════════════════════════════════════════════════════════════ */
function legal(st, seat){
  const out = [];
  const s = st.seats[seat];
  if (!s || s.out) return out;
  if (st.phase === 'lobby'){
    out.push({ t:'ready', s:seat, v: !s.ready });
    if (seat === st.host && st.seats.every(x => x.ready)) out.push({ t:'start' });
    return out;
  }
  if (st.phase !== 'play') return out;
  for (let c = 0; c < s.cards.length; c++){
    const cells = s.cards[c], marks = s.marks[c];
    for (let i = 0; i < cells.length; i++){
      if (!cells[i]) continue;
      if (!marks[i] && st.called.indexOf(cells[i]) >= 0) out.push({ t:'mark', s:seat, c, i });
      else if (marks[i]) out.push({ t:'unmark', s:seat, c, i });
    }
    if (s.lock < st.calls){
      for (const p of PRIZES){
        const pz = st.prizes[p.k];
        if (pz.off || pz.done || pz.void) continue;
        if (holds(cells, marks, p.k) >= 0) out.push({ t:'claim', s:seat, c, p:p.k });
      }
    }
  }
  return out;
}

/* Tombla has no turns. Everybody plays at once — which is exactly why
   it is the right game for eight seats and why nobody is ever sitting
   there waiting for somebody else's phone. -1 means nobody's move. */
function turn(){ return -1; }

function over(st){
  if (st.phase !== 'done') return null;
  const t = st.prizes.tombla;
  if (t.done){
    const s = st.seats[t.seat];
    return {
      end:'tombla', seat:t.seat,
      head:'TOMBLA',
      why:(s ? s.name : 'Somebody') + ' filled the card on call ' + t.at + '.',
      at:t.at
    };
  }
  return { end:'flat', seat:-1, head:'The bag is empty', why:'Ninety numbers and nobody shouted.' };
}

/* the scoreboard: every seat, best first */
function table(st){
  return st.seats.map((s, i) => ({
    seat:i, name:s.name, own:s.own, pts:s.pts, won:s.won.slice(),
    missed:s.missed, ready:s.ready
  })).sort((a, b) => b.pts - a.pts || a.seat - b.seat);
}

/* a cheap fingerprint of the position. Two phones comparing these
   after every call is how a desync is caught on the call it happens
   rather than four calls later when somebody claims. */
function fingerprint(st){
  let h = 2166136261 >>> 0;
  const bite = v => { h = Math.imul(h ^ (v & 255), 16777619) >>> 0; h = Math.imul(h ^ ((v >>> 8) & 255), 16777619) >>> 0; };
  bite(st.calls);
  for (const n of st.called) bite(n);
  for (const s of st.seats){
    for (const m of s.marks) for (let i = 0; i < m.length; i++) if (m[i]) bite(i + 1);
    bite(s.pts);
  }
  for (const p of PRIZES){ const z = st.prizes[p.k]; bite(z.done ? z.seat + 2 : (z.void ? 1 : 0)); }
  return (h >>> 0).toString(36);
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE PLAYERS
   A machine seat is a person who is not very good at this, which is
   the only kind worth playing against. It does not read the bag and it
   cannot: aiPlan() is handed the state and decides, per call, whether
   that seat NOTICED the number. When it does not, the number sits
   there unmarked exactly like yours does, and it can lose a prize it
   was holding all along.

   Every decision is hash32(seed, seat, call) — pure, so two phones
   running the same match agree about what Rita did without a single
   byte going over the wire about it.
   ═══════════════════════════════════════════════════════════════════ */
/* chance a seat spots the number on the call it is read out */
const SHARP = { 1:0.62, 2:0.80, 3:0.93 };
/* chance it goes back and picks up something it missed, per call */
const CATCHUP = { 1:0.20, 2:0.38, 3:0.66 };

function aiSpots(st, seat, call){
  const p = SHARP[st.opts.level] || SHARP[2];
  return hashF(st.seed ^ 0x5EED, seat, call) < p;
}
function aiCatchesUp(st, seat, call){
  const p = CATCHUP[st.opts.level] || CATCHUP[2];
  return hashF(st.seed ^ 0xCA7C, seat, call) < p;
}
/* how long, in call-ticks of the UI clock, before it lunges for a
   prize it can see. Never zero: a machine that claims on the same
   millisecond as the call is not a player, it is a wall. */
function aiClaimDelay(st, seat, call){
  const base = [0, 900, 620, 380][st.opts.level] || 620;
  return base + Math.floor(hashF(st.seed ^ 0xC1A1, seat, call) * base);
}

/* The moves a machine seat wants to make right now, in order. The
   runner feeds them through the SAME apply() a tap goes through. */
function aiMoves(st, seat){
  const s = st.seats[seat];
  const out = [];
  if (!s || s.out) return out;
  if (st.phase === 'lobby'){
    if (!s.ready) out.push({ t:'ready', s:seat, v:true });
    return out;
  }
  if (st.phase !== 'play') return out;

  const call = st.calls;
  const last = st.called[st.called.length - 1];

  /* 1 — did it spot the number just called? */
  if (last && aiSpots(st, seat, call)){
    for (let c = 0; c < s.cards.length; c++){
      const cells = s.cards[c];
      for (let i = 0; i < cells.length; i++)
        if (cells[i] === last && !s.marks[c][i]) out.push({ t:'mark', s:seat, c, i });
    }
  }
  /* 2 — does it go back for one it fumbled? One at a time, oldest
     first, exactly the way a person scans back up the card. */
  if (s.missed > 0 && aiCatchesUp(st, seat, call)){
    outer:
    for (const n of st.called){
      for (let c = 0; c < s.cards.length; c++){
        const cells = s.cards[c];
        for (let i = 0; i < cells.length; i++){
          if (cells[i] === n && !s.marks[c][i]){ out.push({ t:'mark', s:seat, c, i }); break outer; }
        }
      }
    }
  }
  return out;
}

/* what a machine seat would claim, if anything. Kept separate from
   aiMoves() because the runner delays it — the pause between a card
   being complete and somebody shouting is most of the drama. */
function aiClaim(st, seat){
  const s = st.seats[seat];
  if (!s || s.out || st.phase !== 'play') return null;
  if (s.lock >= st.calls) return null;
  for (let pi = PRIZES.length - 1; pi >= 0; pi--){    /* the big one first */
    const p = PRIZES[pi];
    const pz = st.prizes[p.k];
    if (pz.off || pz.done || pz.void) continue;
    for (let c = 0; c < s.cards.length; c++){
      if (holds(s.cards[c], s.marks[c], p.k) >= 0) return { t:'claim', s:seat, c, p:p.k };
    }
  }
  return null;
}
/* ═══════════════════════════════════════════════════════════════════
   THE ANUNZJATUR — how a number gets said out loud
   ───────────────────────────────────────────────────────────────────
   At a real Maltese tombla the numbers are announced IN MALTESE AND
   IN ENGLISH — "dawn ikunu annunzjati kemm bil-Malti kif ukoll
   bl-Ingliż" — because a good half of the room is elderly and hard of
   hearing and nobody wants an argument. So that is what this does.

   THREE LAYERS, AND THEY ARE KEPT APART ON PURPOSE:

     mtNum(n)  the number in Maltese. Plain arithmetic, not folklore.

     LAQAM     THE NICKNAMES. Malta has its own set of laqmijiet,
               independent of the Neapolitan Smorfia — 53 is il-pastizz,
               11 is il-knisja tax-Naxxar, 90 is ix-xiħa. These are
               ATTESTED: the published 1-90 list, the Kelma Kelma set,
               and Il-Miklem's dictionary entries under "lotteriji,
               tombla, lottu". Every entry below is one of those, with
               a plain English gloss beside it. NOTHING IN LAQAM IS
               OURS. Where two sources disagreed about which number a
               nickname belongs to (iċ-ċavetta 18 vs 21, ir-rixa 57 vs
               75, it-tabib 21 vs 27) the number is simply left out
               rather than guessed at.

     JOKE      KARTI'S OWN COMEDY, and clearly labelled as such. These
               are written for this game and are not presented as
               anything traditional. They land after the number, never
               instead of it.

   Not every number gets a joke, on purpose. A caller with a line for
   all ninety is exhausting; one every few numbers is a caller.
   ═══════════════════════════════════════════════════════════════════ */

const MT_ONES = ['', 'wieħed', 'tnejn', 'tlieta', 'erbgħa', 'ħamsa',
                 'sitta', 'sebgħa', 'tmienja', 'disgħa'];
const MT_TEEN = ['għaxra', 'ħdax', 'tnax', 'tlettax', 'erbatax', 'ħmistax',
                 'sittax', 'sbatax', 'tmintax', 'dsatax'];
const MT_TENS = ['', '', 'għoxrin', 'tletin', 'erbgħin', 'ħamsin',
                 'sittin', 'sebgħin', 'tmenin', 'disgħin'];
function mtNum(n){
  n = n | 0;
  if (n < 1 || n > 90) return '';
  if (n < 10) return MT_ONES[n];
  if (n < 20) return MT_TEEN[n - 10];
  const t = (n / 10) | 0, u = n % 10;
  return u ? (MT_ONES[u] + ' u ' + MT_TENS[t]) : MT_TENS[t];
}

/* ── THE LAQMIJIET — sourced, not ours ──────────────────────────────
   [ the Maltese nickname, a plain English gloss ] */
const LAQAM = {
  1:  ['iż-żgħir',                  'the little one'],
  5:  ['ċinku',                     'the five'],
  7:  ['il-pipa',                   'the pipe'],
  10: ['ta\' San Pawl',             'Saint Paul\'s'],
  11: ['il-knisja tax-Naxxar',      'the church at Naxxar'],
  12: ['tużżana',                   'a dozen'],
  13: ['ta\' Ġuda',                 'Judas\''],
  15: ['Santa Marija',              'Our Lady of the Assumption'],
  19: ['San Ġużepp',                'Saint Joseph'],
  22: ['is-sorijiet għarkupptejhom','the nuns on their knees'],
  25: ['il-Milied',                 'Christmas'],
  29: ['tal-Imnarja',               'the Imnarja feast'],
  33: ['l-età ta\' Kristu',         'the age of Christ'],
  44: ['il-patrijiet',              'the friars'],
  48: ['il-mejjet',                 'the dead man'],
  50: ['in-nofs qantar',            'half a hundredweight'],
  53: ['il-pastizz',                'the pastizz'],
  55: ['il-fniek',                  'the rabbits'],
  57: ['il-ħut',                    'the fish'],
  63: ['l-għarusa',                 'the bride'],
  66: ['iż-żejżiet',                'the little ones'],
  69: ['il-maqlubin',               'the upside-down pair'],
  77: ['zpapen',                    'the two walking sticks'],
  81: ['il-ħotbi',                  'the hunchback'],
  84: ['il-knisja',                 'the church'],
  88: ['bajd u bajd',               'eggs and eggs'],
  89: ['ir-ruħ',                    'the soul'],
  90: ['ix-xiħa',                   'the old woman']
};

/* ── KARTI'S OWN LINES — ours, and only ours ────────────────────── */
const JOKE = {
  1:  'The first one out and somebody has already lost their pen.',
  2:  'You, and the person you are not speaking to.',
  8:  'Eight of you round a table built for four.',
  9:  'Nine at Mass, nine at the klabb, same nine.',
  10: 'A perfect ten, according to him.',
  14: 'The queue at the Post Office. Still moving.',
  16: 'Old enough to answer back.',
  18: 'Finally allowed in here.',
  20: 'Twenty euro, and it is still not enough.',
  21: 'Key of the door, and no idea what to do with it.',
  23: 'The bus you wanted. It is not coming.',
  26: 'Still living at home. No shame in it.',
  27: 'The rent went up again.',
  30: 'Thirty in the shade and the aircon is broken.',
  31: 'Last day of the year, and the fireworks start early.',
  35: 'Halfway, and your nanna is winning.',
  36: 'Three dozen ġbejniet and the fridge will not shut.',
  38: 'The size he says he is.',
  39: 'One under. One under is the worst place to be.',
  40: 'Life begins. Allegedly.',
  41: 'And the back has started making that noise.',
  43: 'Somebody has just marked the wrong square.',
  45: 'Halfway house. Nobody has won anything yet.',
  47: 'The bus that actually came.',
  49: 'Almost fifty, and pretending not to mind.',
  51: 'One over the half. It is getting serious now.',
  52: 'One for every week he said he would fix the roof.',
  56: 'Eyes down. This is where it turns.',
  58: 'Somebody has an ambo and has not noticed.',
  59: 'Check your kartella. Go on. Check it.',
  60: 'The pension is in sight and so is the tombla.',
  62: 'He still has the same shirt.',
  64: 'Will you still need me. Will you still feed me.',
  65: 'Retired, and busier than ever.',
  67: 'The year somebody at this table was born.',
  68: 'Nearly the maqlubin. Nearly.',
  70: 'Three score and ten, and still shouting at the football.',
  71: 'Nineteen to go and the room has gone quiet.',
  72: 'Two ladies of a certain age, and neither is your aunt.',
  74: 'Somebody is one away. Somebody is always one away.',
  75: 'Fifteen left. Somebody is sweating.',
  76: 'The bottom of the kartella is filling up.',
  78: 'Nearly there. Nobody breathe.',
  79: 'One off the end of the row.',
  80: 'Nanna is eighty and Nanna is winning.',
  82: 'Deep in the last column now.',
  83: 'Getting thin at the bottom of the bag.',
  85: 'Five to go and everybody is lying about their kartella.',
  86: 'Do not tell me you missed that one.',
  87: 'Steady. Steady.'
};

/* said when a number has neither a laqam nor a joke — the anunzjatur
   is still a person, so it varies, and it varies DETERMINISTICALLY */
const PLAIN = [
  'On its own.', 'And another one.', 'Eyes down.', 'Keep up.',
  'Anybody?', 'Nothing? Right.', 'Next.', 'Mark it, mark it.',
  'Do not tell me you missed that.', 'That is out.'
];

/* the whole call, in the three pieces the screen lays out separately:
     mt    the number in Maltese      ("tlieta u ħamsin")
     laqam the nickname + gloss, or null
     say   the line under it — the joke, or the plain filler   */
function callOf(st, n, call){
  const L = LAQAM[n] || null;
  return {
    n,
    mt: mtNum(n),
    laqam: L ? L[0] : '',
    gloss: L ? L[1] : '',
    say: JOKE[n] || (L ? '' : PLAIN[hash32(st.seed, n, call) % PLAIN.length])
  };
}
/* one flat line, for the aria-live region and for anything that only
   has room for a sentence */
function patter(st, n, call){
  const c = callOf(st, n, call);
  const bits = [c.mt];
  if (c.laqam) bits.push(c.laqam);
  if (c.say) bits.push(c.say);
  return bits.join(' — ');
}

/* what the anunzjatur shouts when a rung goes. `hall` mode says the
   Maltese name of the prize, because that is the name it has in a
   każin: the line is the VERS and the full card is FATTA. */
const SHOUT = {
  ambo:     ['AMBO!',     'Two on a row. The rest of you, carry on.'],
  terna:    ['TERNA!',    'Three. It is moving now.'],
  kwaterna: ['KWATERNA!', 'Four. One short of the row.'],
  cinkwina: ['ĊINKWINA!', 'A whole row. Only the kartella is left.'],
  tombla:   ['TOMBLA!',   'That is the lot. Everybody put your pen down.']
};
const SHOUT_HALL = {
  cinkwina: ['VERS!',  'The line has gone. Now it is the fatta.'],
  tombla:   ['FATTA!', 'Fifteen. That is the kartella. Finished.']
};
function shoutOf(st, key){
  const hall = (st && st.opts && st.opts.mode) === 'hall';
  return (hall && SHOUT_HALL[key]) || SHOUT[key] || [String(key).toUpperCase(), ''];
}

/* ═══════════════════════════════════════════════════════════════════
   OUR CORNER OF localStorage
   pref : the last setup sheet answered
   rec  : {w,l,d} — the ledger party.js's shelf reads
   save : ONE snapshot, so a game abandoned on call 34 is still on call
          34 tomorrow morning.
   ═══════════════════════════════════════════════════════════════════ */
const STORE = 'karti_tombla_v1';
let ST = { v:1, pref:{}, rec:{ w:0, l:0, d:0 }, save:null };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object'){
    if (j.pref && typeof j.pref === 'object') ST.pref = j.pref;
    if (j.rec  && typeof j.rec  === 'object') ST.rec  = Object.assign(ST.rec, j.rec);
    if (j.save && typeof j.save === 'object') ST.save = j.save;
  }
} catch(e){}
let persistPending = 0;
function persist(){
  if (persistPending) return;
  persistPending = setTimeout(() => {
    persistPending = 0;
    try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){}
  }, 0);
}
function pref(patch){ if (patch){ Object.assign(ST.pref, patch); persist(); } return ST.pref; }
function record(outcome){
  if (outcome === 'w' || outcome === 'l' || outcome === 'd') ST.rec[outcome]++;
  persist();
  return ST.rec;
}
function recOf(){ return ST.rec; }
function saveSlot(snap){ ST.save = snap || null; persist(); }
function savedSlot(){ return ST.save; }

/* ═══════════════════════════════════════════════════════════════════
   THE MATCH RUNNER
   One match. It owns:
     · st     the live state
     · seed   the seed the bag came out of
     · log    every move ever applied, in order
   and NOTHING ELSE, because (opts, seed, log) is the whole game and
   anything kept outside it is a thing that can go out of step.

   REPLAY IS THE ONLY WAY BACK, exactly as in js/klabb.js: rebuild()
   deals from the seed and re-applies the log.
   ═══════════════════════════════════════════════════════════════════ */
let M = null;
let FAST = false;                    /* the harness turns the clocks off */
const moveSubs = [];
const stateSubs = [];
function fire(list, a, b){ for (const f of list.slice()){ try { f(a, b); } catch(e){} } }

function buildState(opts, seed, log){
  const st = deal(opts, seed >>> 0);
  for (let i = 0; i < log.length; i++) apply(st, log[i]);
  return st;
}

function startMatch(opts, seed, log){
  stopClock();
  M = {
    gid:'tombla',
    opts: optsOf(opts),
    seed: (seed == null ? newSeed() : seed) >>> 0,
    log: log ? clone(log) : [],
    st: null,
    ctx: null,
    view: 0,                  /* whose card is on screen                */
    dead: false,
    net: null,                /* the online controller, when there is one */
    clock: 0,
    pend: [],                 /* timers we own and must be able to kill  */
    started: Date.now(),
    mid: 'tb' + Date.now().toString(36) + '-' + ((Math.random() * 1e6) | 0).toString(36)
  };
  M.st = buildState(M.opts, M.seed, M.log);
  M.view = M.st.seats.findIndex(s => s.own === 'me');
  if (M.view < 0) M.view = 0;
  return M;
}

function snapshot(){
  if (!M) return null;
  return { v:1, gid:'tombla', opts: clone(M.opts), seed: M.seed, log: clone(M.log) };
}
function autosave(){
  if (!M || M.net) return;             /* an online game is not ours to save */
  if (M.st.phase === 'done') { saveSlot(null); return; }
  saveSlot(snapshot());
}
function resume(snap){
  if (!snap || snap.gid !== 'tombla') return null;
  const m = startMatch(snap.opts, snap.seed, snap.log);
  return m;
}

/* ── the ONE way a move ever gets in ───────────────────────────────
   Local tap, machine player, or a packet off the wire: all three come
   through here, and here is where the seat a move CLAIMS to be from is
   checked against the seat it is ALLOWED to be from.  */
function doMove(seat, mv, src){
  if (!M || M.dead) return { ok:false, why:'no game' };
  const st = M.st;
  const move = Object.assign({}, mv);
  if (move.t !== 'start' && move.t !== 'call') move.s = seat;

  /* a remote seat may only move its own seat, and may never call the
     bag — the bag belongs to whoever the transport made the authority */
  if (src === 'net'){
    if (move.t === 'call' && !(M.net && M.net.callsAllowed)) return { ok:false, why:'that phone does not hold the bag' };
    if (move.t === 'start' && seat !== st.host) return { ok:false, why:'only the host starts' };
  }
  if (src === 'tap' && !isLocal(seat) && move.t !== 'call' && move.t !== 'start')
    return { ok:false, why:'not your seat' };

  const r = apply(st, move);
  if (!r.ok) return r;
  if (r.dup) return r;

  M.log.push(move);
  autosave();
  fire(moveSubs, move, { src, seat, res:r });
  fire(stateSubs, { reason:'move', move, res:r });
  return r;
}

function rollbackTo(n){
  if (!M) return false;
  n = Math.max(0, Math.min(M.log.length, n | 0));
  M.log = M.log.slice(0, n);
  M.st = buildState(M.opts, M.seed, M.log);
  fire(stateSubs, { reason:'rollback' });
  return true;
}

function ownerOf(i){
  if (!M) return 'ai';
  const s = M.st.seats[i];
  return s && s.own ? s.own : 'ai';
}
const isLocal = i => { const o = ownerOf(i); return o === 'me' || o === 'hot'; };

/* ═══════════════════════════════════════════════════════════════════
   THE CLOCK
   The rhythm of the whole game: a number, a gap, a number. The gap is
   the tension. Too quick and marking is a panic; too slow and the
   table starts talking about somebody's operation.

   The clock is a UI concern, not a rules concern — the state does not
   know what time it is — but it lives here because online the call has
   to come from exactly ONE place, and that place is whoever the
   transport nominated. `M.net.callsAllowed` decides whether this phone
   is that place. Offline it always is.
   ═══════════════════════════════════════════════════════════════════ */
const GAP = { 1:5200, 2:3800, 3:2600 };

function callsHere(){
  if (!M) return false;
  if (!M.net) return true;
  return !!M.net.callsAllowed;
}

function stopClock(){
  if (!M) return;
  if (M.clock){ clearTimeout(M.clock); M.clock = 0; }
  for (const t of M.pend) clearTimeout(t);
  M.pend = [];
}
function later(fn, ms){
  if (!M) return;
  if (FAST){ fn(); return; }
  const t = setTimeout(() => {
    const i = M ? M.pend.indexOf(t) : -1;
    if (i >= 0) M.pend.splice(i, 1);
    if (M && !M.dead) fn();
  }, ms);
  M.pend.push(t);
}

function runClock(){
  if (!M || M.dead || M.st.phase !== 'play') return;
  if (M.clock) return;
  if (!callsHere()) return;
  const gap = FAST ? 0 : (GAP[M.opts.speed] || GAP[2]);
  M.clock = setTimeout(() => {
    M.clock = 0;
    if (!M || M.dead || M.st.phase !== 'play') return;
    const n = bagPeek(M.st);
    if (!n) return;
    doMove(-1, { t:'call', k:M.st.calls, n }, 'clock');
    tickMachines();
    runClock();
  }, gap);
}

/* the machine seats react to the number that just came out */
function tickMachines(){
  if (!M || M.dead || M.st.phase !== 'play') return;
  const st = M.st;
  for (let i = 0; i < st.seats.length; i++){
    if (st.seats[i].own !== 'ai') continue;
    const seat = i;
    const moves = aiMoves(st, seat);
    /* the marks land spread through the gap, not all on the tick —
       eight seats snapping at once looks like a machine, and it is the
       one thing that would give away that Rita is not real */
    moves.forEach((mv, k) => {
      later(() => {
        if (!M || M.dead) return;
        doMove(seat, mv, 'ai');
        fire(stateSubs, { reason:'ai' });
      }, 200 + k * 140 + Math.floor(hashF(st.seed, seat, st.calls * 7 + k) * 900));
    });
    /* and then, after a beat, it looks at what it has got */
    later(() => {
      if (!M || M.dead || M.st.phase !== 'play') return;
      const c = aiClaim(M.st, seat);
      if (!c) return;
      const r = doMove(seat, c, 'ai');
      if (r.ok) fire(stateSubs, { reason:'claim', seat, prize:c.p, res:r });
    }, aiClaimDelay(st, seat, st.calls));
  }
}

/* ═══════════════════════════════════════════════════════════════════
   THE PUBLIC FACE
   js/tombla-ui.js drives all of this. js/mp.js drives `hooks`.
   ═══════════════════════════════════════════════════════════════════ */
const API = {
  /* — the rules, for anybody who wants to reason about a card — */
  ROWS, COLS, PER_ROW, ON_CARD, LO, HI, colOf,
  PRIZES, PRIZE_KEYS, prizeAt, prizeRank,
  makeCard, cardIsLegal, holds, nearest, rowMarks, cardMarks,
  deal, apply, legal, turn, over, table, fingerprint,
  optsOf, DEFAULTS, GAP,
  patter, callOf, mtNum, LAQAM, JOKE, PLAIN, SHOUT, SHOUT_HALL, shoutOf,
  LADDERS, rungsOf, inLadder, prizeName,
  aiMoves, aiClaim, aiClaimDelay,
  buildState, newSeed, clone,

  /* — the match — */
  match: () => M,
  state: () => (M ? M.st : null),
  startMatch, snapshot, resume, rollbackTo, doMove, ownerOf, isLocal,
  runClock, stopClock, tickMachines, callsHere,
  end(){ if (M){ stopClock(); M.dead = true; M = null; } },
  fast(on){ FAST = !!on; },

  /* — the ledger — */
  pref, record, recOf, saveSlot, savedSlot, STORE,

  /* — subscriptions — */
  onMove:  f => { moveSubs.push(f);  return () => { const i = moveSubs.indexOf(f);  if (i >= 0) moveSubs.splice(i, 1); }; },
  onState: f => { stateSubs.push(f); return () => { const i = stateSubs.indexOf(f); if (i >= 0) stateSubs.splice(i, 1); }; },

  /* ═════════════════════════════════════════════════════════════════
     HOOKS — everything js/mp.js needs and nothing it does not
     ─────────────────────────────────────────────────────────────────
     THE SHAPE OF AN ONLINE TOMBLA

     1. THE LOBBY. The room fills. Every phone calls begin(opts, seed)
        with the SAME opts and the SAME seed — one number, agreed once
        by the host — and every phone then has eight identical cards in
        an identical order. Nothing else is ever sent about the deal.
     2. READY UP. Each seat sends {t:'ready',v:true}; the transport
        forwards it; every phone applies it. When they are all ready
        the host sends {t:'start'}.
     3. THE BAG. ONE phone holds the clock. Set callsAllowed:true in
        attachNet() on that phone only. It emits {t:'call',k,n} and the
        transport forwards it verbatim. Every other phone applies it.
        Because the bag came from the seed, a forwarded call is
        CHECKED, not trusted: apply() refuses a number that is not the
        one at the front of that phone's own bag, with desync:true.
        (If you would rather the clients could not see what is coming,
        send them view(seat) instead of state() at join time — that
        strips the bag, and the n on the wire is then the only source.
        Both work; the check simply relaxes to "is it already out".)
     4. MARKS AND CLAIMS. Forward them verbatim. apply() gates a mark
        on the number having been called and a claim on the card
        actually holding it, so a modified client can shout TOMBLA all
        night and the other seven phones will all refuse it.
     5. DROP AND REJOIN. snapshot() is {opts, seed, log} — a few
        hundred bytes even at call 80. load(snap) rebuilds the phone
        into exactly the same game. Nothing to reconcile.

     WHAT TOMBLA DOES NOT NEED: turn order (there is none — turn()
     always returns -1), takeback (there is nothing to take back; a
     misclick is fixed with unmark, which is a legal move), and a
     hidden-hand view (nobody has a hand).
     ═════════════════════════════════════════════════════════════════ */
  hooks: {
    live:      () => !!(M && !M.dead),
    gameId:    () => (M ? M.gid : null),
    matchId:   () => (M ? M.mid : null),
    seed:      () => (M ? M.seed : null),
    opts:      () => (M ? clone(M.opts) : null),
    seats:     () => (M ? M.st.seats.map((s, i) => ({ seat:i, name:s.name, own:s.own, ready:s.ready, pts:s.pts, won:s.won.slice(), out:!!s.out })) : []),
    phase:     () => (M ? M.st.phase : null),
    host:      () => (M ? M.st.host : 0),
    turn:      () => -1,
    over:      () => (M ? over(M.st) : null),
    table:     () => (M ? table(M.st) : []),
    calls:     () => (M ? M.st.calls : 0),
    called:    () => (M ? M.st.called.slice() : []),
    prizes:    () => (M ? clone(M.st.prizes) : null),
    check:     () => (M ? fingerprint(M.st) : ''),

    /* the whole truth, bag and all. For the phone holding the clock. */
    state:     () => (M ? clone(M.st) : null),
    /* the same state with THE FUTURE REMOVED. The only secret in
       tombla is what has not come out of the bag yet, so this is the
       one thing view() has to do. Give this to a seat that must not be
       able to see call 38 coming. */
    view: seat => {
      if (!M) return null;
      const st = clone(M.st);
      st.bagLeft = st.bag.length;
      st.bag = [];
      st.youAre = seat;
      return st;
    },

    legal:  seat => legal(M.st, seat),
    /* apply a move that arrived from another phone. SAME GATE as a
       tap. A refusal comes back with a reason and the caller is
       expected to shout about it rather than swallow it — a refused
       packet is either a bug or somebody trying it on, and both of
       those are things you want to see. */
    apply: (seat, move) => doMove(seat, move, 'net'),

    moveLog:   () => (M ? clone(M.log) : []),
    moveCount: () => (M ? M.log.length : 0),
    snapshot,
    load: snap => {
      const m = resume(snap);
      if (m) fire(stateSubs, { reason:'load' });
      return !!m;
    },
    rollbackTo,

    onMove:  f => API.onMove(f),
    onState: f => API.onState(f),

    /* who is behind each seat. 'me' and 'hot' are people on this
       phone, 'ai' is the machine, 'net' is somebody else's phone. */
    setOwner: (seat, own) => {
      if (!M || !M.st.seats[seat]) return false;
      M.st.seats[seat].own = own;
      fire(stateSubs, { reason:'owner' });
      return true;
    },
    setName: (seat, name) => {
      if (!M || !M.st.seats[seat]) return false;
      M.st.seats[seat].name = String(name || '').slice(0, 14) || M.st.seats[seat].name;
      fire(stateSubs, { reason:'name' });
      return true;
    },
    /* {onMove, onGone, callsAllowed}. callsAllowed is the whole of the
       authority question: exactly one phone in the room gets true. */
    attachNet: net => {
      if (!M) return false;
      M.net = net || null;
      stopClock();
      if (M.st.phase === 'play') runClock();
      fire(stateSubs, { reason:'net' });
      return true;
    },
    /* start a match the transport has already agreed the terms of.
       Returns the snapshot so the caller can post it to latecomers. */
    begin: (opts, seed) => {
      startMatch(opts, seed);
      fire(stateSubs, { reason:'begin' });
      return snapshot();
    }
  }
};

window.KARTI_TOMBLA = API;
P.engines = P.engines || {};
P.engines.tombla = API;

/* ── test hooks — inert unless the page is opened with ?pttest ──── */
try {
  if (String(location.search).indexOf('pttest') >= 0){
    window.__TB_TEST = {
      M: () => M,
      st: () => (M ? M.st : null),
      api: API,
      rnd, rint, shuffle, hash32, occupancy, colCounts, makeCard,
      markNumber, recount, aiMoves, aiClaim
    };
  }
} catch(e){}

})();
