/* ═══════════════════════════════════════════════════════════════════
   KARTI — gin.js
   GIN RUMMY, THE HOUSE GAME — the engine, and nothing but the engine.

   THIS IS NOT HOYLE'S GIN. It is the owner's own game, built from his
   own sentences, and the final telling came with a worked example:

     "2-9 is 5 points, 10 j q k 10 points, 1 is 15 points"
     "every turn in gin rummy u need to pick a new card, only first
      turn can pick last discarded card"  — and, asked to choose:
      "Always a new card off the deck."
     "when 45 points u throw down those cards out, everybody will see"
     "i have 3 A thats 45 points. if someone have 1 2 3 4 diamonds
      etc thats 30, then they put clubs 5 6 7 thats 45. those two
      players they can lay their hand on other opponents out cards.
      example if the second guy in his turn have A and i have 3 he
      can close my ace pile and take 15 points direct to his table"
     "everyone can make point. the winner will get 50 extra points
      for finishing it with no cards in hand. if no one finishes the
      pile will be re-decked and shuffled"
     "If u dont put down the cards it will count to -"

   So, precisely:
     · CARD PRICES — 2..9 are 5, ten and the courts are 10, the ACE
       is 15. His own example checks out against them: three aces
       are 45 on the nose; A-2-3-4 of diamonds is 30 and clubs 5-6-7
       is 15, together 45. The 45 is a TOTAL ACROSS MELDS, not one
       meld's worth (and the solver's meldValOf() is exactly that
       total).
     · THE TURN DEPENDS ON WHETHER YOU ARE OPEN, and this is the
       thing the build got wrong twice before the owner settled it
       with a screenshot of a real hand:

         "if u can see in that table i'm out, and in discard pile
          there is 3 Q. i can take from queen of spades and match
          the 3 Q there is in the table and put them out in my pile.
          all so extra cards will go on my hand so i can put them on
          table or other people. all so have to discard because i
          picked from discard pile because i had 45 out"

       — NOT OPEN: DRAW FROM THE DECK, THEN DISCARD. The one
         exception: on the FIRST turn of a hand the player to move
         may take the last discarded card instead of drawing.
       - OPEN: each turn you CHOOSE. Either draw off the deck, or
         REACH INTO THE SPREAD — name any card in it and you take
         that card AND EVERY CARD TO ITS RIGHT (the rest of its row,
         then all rows below; the spread reads left-to-right, top to
         bottom, oldest to newest). The card you reached for is the
         one you wanted; the rest of the sweep lands in your hand,
         where it may be melded, laid onto your own table or onto
         anybody else's, or simply held. THEN DISCARD ONE, always —
         "also have to discard because i picked from discard pile".

       His first telling of the game said exactly this ("when u put
       45 u have option to pick from any card that is in discard but
       have to take all right cards, or draw from deck"); a later
       question that failed to separate the open case from the
       closed one got "always a new card off the deck", which is the
       CLOSED half only. Both are now in force, each on its own side
       of the 45. THE SWEEP IS A REAL MOVE AND IS ON THE WIRE.
     · THE SPREAD IS A RECORD UNTIL YOU ARE OPEN, AND A RESOURCE
       AFTER. Discards are laid out face up, left to right in the
       order thrown, row under row, so everyone can see what has
       gone. A closed player may never take from it (bar the
       first-turn upcard). An open player may, by the rule above.
     · MATCH 45 AND PUT THEM DOWN: when the melds in your hand total
       45 or more you may put them out, face up on the table, in one
       go. That OPENS you. It does NOT end the hand.
     · OPEN PLAYERS CONTROL THE TABLE: on their turn, after drawing,
       they may put down further melds and lay single cards from
       their hand onto ANY meld on the table — their own or the
       other side's — and every card laid scores for WHOEVER LAID
       IT. The fourth ace on somebody's three aces takes 15 points
       "direct to his table". A set closes at four of its rank; a
       run grows off either end (ace low).
     · THE HAND ENDS when somebody's discard leaves their hand
       EMPTY. They collect OUT_BONUS (50) on top. Then the count:
       every point you LAID counts plus; everything still IN a hand
       counts minus — open or not, melds or not, because "if u dont
       put down the cards it will count to -".
     · NOBODY OUT, DECK DRY: the spread (all but its newest card) is
       shuffled straight back into the deck and play continues.
       Backstops for the truly pathological table are at the
       constants below.
     · THE MATCH is first to +TARGET — or first THROUGH THE FLOOR at
       -TARGET, who loses it. Measured numbers at SIZES.

   ── DECISIONS THE OWNER HAS NOT RULED ON — one place, each
      flippable (the constants sit together below) ──
     · FIRST_TAKE_PLY: "only first turn can pick last discarded
       card" is read as the FIRST TURN OF THE HAND (the non-dealer's
       opening turn, classic gin's upcard offer with no pass-around).
       Raise the constant to 2 to give each player's first turn the
       option instead.
     · OUT_BONUS = 50 (he typed "59"; 50 confirmed). One constant.
     · LAY_ON_FOE = true: laying off onto the OTHER side's melds is
       what his fourth-ace example does. false walls the tables off.
     · OPENING IS ATOMIC AND SOLVER-ARRANGED: {t:'down',c} discards
       c and lays the best arrangement of the rest in one move. You
       cannot hold a meld back while opening; on LATER turns you
       hold cards back simply by not laying them. Keeps the wire
       tiny and the two phones bit-identical.
     · THE UPCARD YOU TOOK may not bounce straight back (classic
       rule, and without it the first turn can be a null move). One
       exception: if it is the last card in your hand.

   WHAT SURVIVED FROM THE LAST BUILD: the deck shape, the seeded RNG
   whose whole state is one integer in st.rs, the meld solver with
   its memo (with a branch-and-bound that makes the big hands a
   sweep produces instant and changes no answer), and the replay
   discipline: (opts, seed, log) rebuilds the match to the bit, so
   undo, autosave and two phones in lockstep are all the same
   operation. What DIED in this pass: laying down ending the hand
   (it OPENS you now), knocking's whole family (long gone), and the
   up0/up1 take-or-pass ritual (the first-turn take is one plain
   option in 'main').

   Loads in the browser (window.KARTI_GIN.E) and in Node
   (module.exports), so the simulation harness drives the exact code
   that ships.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function (root) {

/* ── the deck ──────────────────────────────────────────────────────
   A card is one integer 0..51: suit*13 + (rank-1), the same shape
   js/klabb.js uses, so the two files can share drawing code.
   suit 0 Spades · 1 Hearts · 2 Diamonds · 3 Clubs, rank 1=A .. 13=K */
const suitOf = c => (c / 13) | 0;
const rankOf = c => (c % 13) + 1;
const mk = (s, r) => s * 13 + (r - 1);
/* THE HOUSE PRICES, in the owner's words: "2-9 is 5 points,
   10 j q k 10 points, 1 is 15 points". The ace is the dear one. */
const pts = c => { const r = rankOf(c); return r === 1 ? 15 : r >= 10 ? 10 : 5; };
const handPts = cards => cards.reduce((a, c) => a + pts(c), 0);

/* ── seeded randomness, whole state one integer ─────────────────── */
function rnd(st) {
  st.rs = (st.rs + 0x6D2B79F5) | 0;
  let t = st.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(st, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(st) * (i + 1)) % (i + 1);
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
const clone = o => JSON.parse(JSON.stringify(o));

/* ═══════════════════════════════════════════════════════════════════
   THE MELD SOLVER
   Every meld a hand could contain — every set of three or four of a
   rank, every run of three or more in a suit INCLUDING its sub-runs,
   because a card shared between a possible set and a possible run is
   exactly where sub-runs start to matter — then a search over
   disjoint combinations for the least loose VALUE. Minimising the
   value of the loose cards is the same thing as MAXIMISING THE VALUE
   OF THE MELDS (the hand's total is fixed), so the one search
   answers both "how much can I put down" and "how little will I be
   caught holding". Memoised, and carrying a branch-and-bound —
   candidates sorted dear-first, and a suffix bound (the value of
   every distinct card still reachable) prunes any line that can no
   longer beat the best. Pure in, pure out: the pruning and the
   cache change the time, never the answer.

   best(cards) -> { dw, melds:[[c,...],...], dead:[c,...] }
     dw is the VALUE of the loose cards at house prices; the meld
     value of the hand is handPts(cards) - dw.
   ═══════════════════════════════════════════════════════════════════ */
function candidates(cards) {
  const out = [];
  /* sets */
  const byRank = {};
  for (const c of cards) (byRank[rankOf(c)] = byRank[rankOf(c)] || []).push(c);
  for (const r in byRank) {
    const g = byRank[r];
    if (g.length >= 3) {
      if (g.length === 3) out.push(g.slice());
      else {                                   /* the 4, and every 3 of it */
        out.push(g.slice());
        for (let skip = 0; skip < 4; skip++)
          out.push(g.filter((_, i) => i !== skip));
      }
    }
  }
  /* runs, with sub-runs */
  for (let s = 0; s < 4; s++) {
    const ranks = cards.filter(c => suitOf(c) === s).map(rankOf).sort((a, b) => a - b);
    let i = 0;
    while (i < ranks.length) {
      let j = i;
      while (j + 1 < ranks.length && ranks[j + 1] === ranks[j] + 1) j++;
      const len = j - i + 1;
      if (len >= 3)
        for (let a = i; a <= j - 2; a++)
          for (let b = a + 2; b <= j; b++)
            out.push(ranks.slice(a, b + 1).map(r => mk(s, r)));
      i = j + 1;
    }
  }
  return out;
}

/* ── the memo ──────────────────────────────────────────────────────
   best() is called for every candidate discard, every dashboard
   repaint, every lay the machine weighs — thousands of times a
   match, millions across a simulation sweep. The answer depends on
   nothing but the multiset of cards, so it is cached on the sorted
   key. Bounded so a long session cannot grow it without limit. */
const MEMO = new Map();
const MEMO_MAX = 40000;
function memoKey(cards) {
  const s = cards.slice().sort((a, b) => a - b);
  let k = '';
  for (let i = 0; i < s.length; i++) k += (i ? ',' : '') + s[i];
  return k;
}

const MAX_ARR = 10;
function best(cards) {
  const key = memoKey(cards);
  const hit = MEMO.get(key);
  if (hit) return hit;
  const out = bestUncached(cards);
  if (MEMO.size >= MEMO_MAX) MEMO.clear();
  MEMO.set(key, out);
  return out;
}

function bestUncached(cards) {
  const cs = candidates(cards);
  /* dear melds first: better first answers, sharper pruning. sort()
     is stable, so equal-value ties keep generation order and the
     answer stays deterministic across phones. */
  cs.sort((a, b) => handPts(b) - handPts(a));
  /* suffix bound: the value of every DISTINCT card that appears in
     any candidate from i on — no line through cs[i..] can meld more
     than that, however the melds are chosen. */
  const bound = new Array(cs.length + 1).fill(0);
  {
    const seen = new Set();
    for (let i = cs.length - 1; i >= 0; i--) {
      bound[i] = bound[i + 1];
      for (const c of cs[i]) if (!seen.has(c)) { seen.add(c); bound[i] += pts(c); }
    }
  }
  const total = handPts(cards);
  let bestDw = total;                          /* i.e. best melded value 0 */
  let arrs = [[]];                             /* arrangements at bestDw */
  const used = new Set();

  function dfs(i, melds, melded) {
    if (melded.pts + bound[i] < total - bestDw) return;   /* cannot beat it */
    if (i >= cs.length) {
      const dw = total - melded.pts;
      if (dw < bestDw) { bestDw = dw; arrs = [melds.slice()]; }
      else if (dw === bestDw && arrs.length < MAX_ARR) arrs.push(melds.slice());
      return;
    }
    /* try taking meld i */
    const m = cs[i];
    let ok = true;
    for (const c of m) if (used.has(c)) { ok = false; break; }
    if (ok) {
      for (const c of m) used.add(c);
      melded.pts += handPts(m);
      melds.push(m);
      dfs(i + 1, melds, melded);
      melds.pop();
      melded.pts -= handPts(m);
      for (const c of m) used.delete(c);
    }
    dfs(i + 1, melds, melded);                /* and skipping it */
  }
  dfs(0, [], { pts: 0 });

  const shape = melds => {
    const inMeld = new Set();
    melds.forEach(m => m.forEach(c => inMeld.add(c)));
    return { dw: bestDw, melds: melds.map(m => m.slice()),
             dead: cards.filter(c => !inMeld.has(c)) };
  };
  return { dw: bestDw, arrs: arrs.map(shape),
           melds: arrs[0] ? shape(arrs[0]).melds : [],
           dead: shape(arrs[0] || []).dead };
}

/* the value the melds of this hand could be put down for */
function meldValOf(cards) { return handPts(cards) - best(cards).dw; }

/* the least loose VALUE this over-full hand can reach by discarding
   one card, and which discards reach it */
function bestDiscard(cards, banned) {
  let bd = Infinity;
  const picks = [];
  for (const c of cards) {
    if (banned != null && c === banned) continue;
    const rest = cards.filter(x => x !== c);
    const b = best(rest);
    if (b.dw < bd) { bd = b.dw; picks.length = 0; }
    if (b.dw === bd) picks.push({ c, dw: b.dw });
  }
  return { dw: bd, picks };
}

/* ── melds ON THE TABLE: shape tests the lay-offs need ──────────── */
function isSet(cs) {
  if (cs.length < 3 || cs.length > 4) return false;
  const r = rankOf(cs[0]);
  return cs.every(c => rankOf(c) === r);
}
function isRun(cs) {
  if (cs.length < 3) return false;
  const s = suitOf(cs[0]);
  if (!cs.every(c => suitOf(c) === s)) return false;
  const rs = cs.map(rankOf).sort((a, b) => a - b);
  for (let i = 1; i < rs.length; i++) if (rs[i] !== rs[i - 1] + 1) return false;
  return true;
}
function validMeld(cs) { return isSet(cs) || isRun(cs); }
/* may card c be laid on this table meld? A set CLOSES at four of its
   rank (his own words: the fourth ace "closes my ace pile"); a run
   grows off either end, ace low only, as in the solver. */
function canExtend(cs, c) {
  const r0 = rankOf(cs[0]);
  if (cs.every(x => rankOf(x) === r0)) {                  /* a set */
    return cs.length < 4 && rankOf(c) === r0;
  }
  if (suitOf(c) !== suitOf(cs[0])) return false;          /* a run */
  let lo = 14, hi = 0;
  for (const x of cs) { const r = rankOf(x); if (r < lo) lo = r; if (r > hi) hi = r; }
  return rankOf(c) === lo - 1 || rankOf(c) === hi + 1;
}
const meldSort = m => m.sort((a, b) => rankOf(a) - rankOf(b) || suitOf(a) - suitOf(b));

/* ═══════════════════════════════════════════════════════════════════
   THE CONSTANTS — and the flippable decisions, all in one place
   (the header explains each; change them HERE and nowhere else)
   ═══════════════════════════════════════════════════════════════════ */
const OPEN_MIN = 45;          /* meld points you must put down in one go to open */
const OUT_BONUS = 50;         /* "50 extra points for finishing with no cards in hand" */
const FIRST_TAKE_PLY = 1;     /* plies on which the upcard may be taken: the
                                 hand's first turn only. 2 = both players' first */
const LAY_ON_FOE = true;      /* open players may lay onto the other side's melds */
const TARGET = 300;           /* the default match, measured below */
const RECYCLE_MAX = 4;        /* re-decks before the hand is called off dead */
const PLIES_MAX = 240;        /* absolute backstop; machines never get near it */

/* ═══════════════════════════════════════════════════════════════════
   TWO HAND SIZES, ONE GATE — the measurements
   ───────────────────────────────────────────────────────────────────
   From the simulation harness driving THIS file (in-nannu against
   in-nannu, seeds shared, seats swapped; full workings in the
   report). The numbers are updated whenever the rules move:
     · TEN CARDS: the 45 goes down around ply 18 and the hand ends
       around ply 36 when the opener (usually) plays out — ~39 plies
       a hand, ~3% called off dead on the backstops. A hand is worth
       about +72 A SIDE on average: this scoring is POSITIVE-SUM
       (laid points and the out bonus outweigh caught hands), so
       measured matches end OVER THE TOP, essentially never at the
       floor. The floor stays as the mercy rule for a run of truly
       caught hands; the match itself is a race UP.
     · THIRTEEN CARDS: the gate falls at ~ply 13, hands end sooner
       (~ply 31), a hand is worth ~+95 a side, ~9% die on the
       backstop — the swingier, bigger-table game, same 45.
     · TARGET 300 = ~3.5 hands a match at ten cards; 150 = ~2 and
       ships as the quick one. (Sweep: 150/200/300/400/500 →
       1.9/2.5/3.5/4.6/5.9 hands.)
   ═══════════════════════════════════════════════════════════════════ */
const SIZES = {
  10: { hand: 10, open: OPEN_MIN, floor: 2, target: TARGET },
  13: { hand: 13, open: OPEN_MIN, floor: 2, target: TARGET }
};
function sizeOf(n) { return SIZES[n] || SIZES[10]; }

/* ═══════════════════════════════════════════════════════════════════
   THE STATE
   phases:
     main    the player to move picks up: the deck — or, on the
             hand's first turn only, the last discarded card
     act     they hold the pick: open / lay (if open) / always
             discard exactly one
     tally   seat -1: the hand is counted
     shuffle seat -1: the next hand is dealt
     over    somebody crossed the target — or sank to the floor
   The open game lives in: st.down[2] (who is open), st.laid[2]
   (points each side has put on the table), st.table (the melds
   down, in the order laid, each knowing who STARTED it), st.picked
   (the upcard just taken, which may not bounce straight back).
   ═══════════════════════════════════════════════════════════════════ */
function dealHand(st) {
  const d = [];
  for (let i = 0; i < 52; i++) d.push(i);
  shuffle(st, d);
  const nd = 1 - st.dealer;                    /* non-dealer */
  st.seats[0].hand = [];
  st.seats[1].hand = [];
  for (let i = 0; i < st.hs; i++) {            /* alternate, non-dealer first */
    st.seats[nd].hand.push(d.pop());
    st.seats[st.dealer].hand.push(d.pop());
  }
  st.discard = [d.pop()];                      /* the spread starts one card long */
  st.stock = d;
  st.turn = nd;
  st.phase = 'main';
  st.drew = null;
  st.picked = null;
  st.down = [false, false];
  st.laid = [0, 0];
  st.table = [];
  st.reveal = null;
  st.plies = 0;
  st.recycles = 0;
}

function deal(opts, seed) {
  opts = opts || {};
  /* THE HOUSE SETUP, AND IT IS PART OF THE STATE.
     hs/open/floor live in the state, so two phones that somehow
     disagreed about the table are caught by the very first move
     rather than drifting apart in silence. The overrides exist for
     the simulator, which sweeps the shipping code to CHOOSE the
     table's numbers; nothing in the app passes them. */
  const S = sizeOf(opts.hand | 0);
  const st = {
    rs: seed | 0,
    hs: S.hand,
    open: opts.open != null ? (opts.open | 0) : S.open,
    floor: opts.floor != null ? (opts.floor | 0) : S.floor,
    seats: [
      { name: opts.names ? opts.names[0] : 'You', own: 'me', hand: [], lvl: opts.lvl || 2 },
      { name: opts.names ? opts.names[1] : 'The machine', own: 'ai', hand: [], lvl: opts.lvl || 2 }
    ],
    dealer: 0,
    stock: [], discard: [],
    turn: 0, phase: 'main', drew: null, picked: null,
    down: [false, false], laid: [0, 0], table: [], reveal: null,
    handNo: 1, plies: 0, moves: 0, recycles: 0,
    match: { pts: [0, 0], boxes: [0, 0], book: [], target: opts.target || S.target },
    final: null
  };
  if (opts.humans === 2) st.seats[1].own = 'hot';
  if (opts.owns) { st.seats[0].own = opts.owns[0]; st.seats[1].own = opts.owns[1]; }
  /* Online the transport fixes the first dealer (seat 1), so the seat
     the colour draw called "you start" really does act first; offline
     the first deal is cut from the seed. */
  st.dealer = (opts.dealer != null) ? (opts.dealer & 1)
            : (Math.floor(rnd(st) * 2)) & 1;
  dealHand(st);
  return st;
}

function turn(st) {
  if (st.phase === 'tally' || st.phase === 'shuffle') return -1;
  if (st.phase === 'over') return -1;
  return st.turn;
}

function over(st) { return st.phase === 'over' ? st.final : null; }

function upTop(st) { return st.discard.length ? st.discard[st.discard.length - 1] : -1; }

/* the upcard-you-took ban, with its one exception (the last card may
   always be thrown — otherwise a hand of one could deadlock) */
function bannedOf(st, seat) {
  return (st.picked != null && st.seats[seat].hand.length > 1) ? st.picked : null;
}

/* THE ATTENTION PENALTY, the owner's rule in his own words: "someone
   can try to discard, but if discard can be put on someone, they
   will need to put other and they will have there card back, then
   next turn they can place it in that person. This is penalty for
   not paying attention."
   An OPEN player may not throw away a card that has a home on the
   table: the discard is refused and the card stays in their hand.
   Closed players are exempt (they are not allowed to lay off, so
   they cannot be punished for not doing it), and the LAST card in a
   hand always goes through (laying it is impossible — one card must
   remain to discard — so the turn must be allowed to end).
   The turn can always be completed: while the hand is 2+ and a card
   fits the table, LAYING that card is legal by the same test, so
   "put it where it belongs" is available whenever "throw it away"
   is refused. */
function discRefused(st, seat, c) {
  return !!(st.down[seat] && st.seats[seat].hand.length > 1 &&
            extendsTable(st, seat, c));
}

/* may the player to move take the last discarded card? Only on the
   hand's opening turn — before anybody is open, the spread is a
   record and this is the single exception to it. */
function canTakeUp(st) {
  return st.plies < FIRST_TAKE_PLY && st.discard.length > 0;
}

/* ── THE SWEEP ────────────────────────────────────────────────────
   The open player's alternative to the deck: name a card in the
   spread and take it with every card to its right. "have to take
   all right cards" — you cannot pick the one you want out of the
   middle and leave the rest, and that is the whole cost of the
   move: reach deep for a queen and you carry everything thrown
   after it, which is dead weight in your hand until you can place
   it, and minus points if the hand ends while you hold it.

   Gated on being OPEN, because that is the owner's condition —
   "because i had 45 out". A closed player reaching into the spread
   is refused here, in the engine, not merely hidden in the UI. */
function canSweep(st, seat) {
  return !!(st.down[seat] && st.discard.length > 0);
}

/* the run a sweep at i takes: that card and everything after it */
function sweepRun(st, i) {
  return (i >= 0 && i < st.discard.length) ? st.discard.slice(i) : [];
}

/* the best OPENING available to an over-full closed hand: the
   discard whose remaining melds are worth the most, if any reach
   the gate. The UI's button and the machine's decision both read
   this, so they can never disagree about what opening is worth. */
function bestOpen(st, cards) {
  let out = null;
  for (const c of cards) {
    const rest = cards.filter(x => x !== c);
    const b = best(rest);
    const mv = handPts(rest) - b.dw;
    if (mv < st.open) continue;
    if (!out || mv > out.mv || (mv === out.mv && (b.dw < out.dw ||
        (b.dw === out.dw && c < out.c))))
      out = { c, mv, dw: b.dw, net: mv - b.dw };
  }
  return out;
}

function legal(st, seat) {
  const t = turn(st);
  if (t !== seat) return [];
  switch (st.phase) {
    case 'main': {
      const out = [];
      if (st.stock.length) out.push({ t: 'draw' });
      if (canTakeUp(st)) out.push({ t: 'take' });
      /* the open player's reach into the spread: one move per card
         in it, each taking that card and all to its right */
      if (canSweep(st, seat))
        for (let i = 0; i < st.discard.length; i++) out.push({ t: 'sweep', i });
      return out;
    }
    case 'act': {
      const h = st.seats[seat].hand;
      const banned = bannedOf(st, seat);
      const out = [];
      for (const c of h)
        if (c !== banned && !discRefused(st, seat, c)) out.push({ t: 'disc', c });
      if (!st.down[seat]) {
        for (const c of h) {
          const rest = h.filter(x => x !== c);
          if (handPts(rest) - best(rest).dw >= st.open) out.push({ t: 'down', c });
        }
      } else {
        if (h.length >= 4) {
          const seen = new Set();
          for (const m of candidates(h)) {
            if (h.length - m.length < 1) continue;      /* keep one to discard */
            const k = memoKey(m);
            if (seen.has(k)) continue;
            seen.add(k);
            out.push({ t: 'meld', cs: m.slice() });
          }
        }
        if (h.length >= 2)
          for (const c of h)
            for (let ti = 0; ti < st.table.length; ti++)
              if ((LAY_ON_FOE || st.table[ti].by === seat) && canExtend(st.table[ti].cs, c))
                out.push({ t: 'lay', c, m: ti });
      }
      return out;
    }
    case 'tally': return [{ t: 'tally' }];
    case 'shuffle': return [{ t: 'next' }];
  }
  return [];
}

/* cheaper than enumerating legal(): is this one move allowed? */
function check(st, mv, seat) {
  if (!mv || typeof mv.t !== 'string') return false;
  const t = turn(st);
  if (t !== seat) return false;
  const h = st.seats[seat] ? st.seats[seat].hand : [];
  switch (st.phase) {
    case 'main':
      if (mv.t === 'draw') return st.stock.length > 0;
      if (mv.t === 'take') return canTakeUp(st);
      if (mv.t === 'sweep') {
        if (!canSweep(st, seat)) return false;
        const i = mv.i | 0;
        return i >= 0 && i < st.discard.length;
      }
      return false;
    case 'act': {
      if (mv.t === 'disc') {
        if (h.indexOf(mv.c) < 0) return false;
        if (mv.c === bannedOf(st, seat)) return false;
        return !discRefused(st, seat, mv.c);   /* the attention penalty */
      }
      if (mv.t === 'down') {
        if (st.down[seat] || h.indexOf(mv.c) < 0) return false;
        const rest = h.filter(x => x !== mv.c);
        return handPts(rest) - best(rest).dw >= st.open;
      }
      if (mv.t === 'meld') {
        if (!st.down[seat] || !Array.isArray(mv.cs) || mv.cs.length < 3) return false;
        if (h.length - mv.cs.length < 1) return false;      /* keep one to discard */
        const seen = new Set();
        for (const c of mv.cs) {
          if (h.indexOf(c) < 0 || seen.has(c)) return false;
          seen.add(c);
        }
        return validMeld(mv.cs);
      }
      if (mv.t === 'lay') {
        if (!st.down[seat] || h.indexOf(mv.c) < 0 || h.length < 2) return false;
        const tm = st.table[mv.m | 0];
        if (!tm) return false;
        if (!LAY_ON_FOE && tm.by !== seat) return false;
        return canExtend(tm.cs, mv.c);
      }
      return false;
    }
    case 'tally': return mv.t === 'tally';
    case 'shuffle': return mv.t === 'next';
  }
  return false;
}

/* the spread, all but its newest card, shuffled back into the deck —
   seeded, so both phones deal the same refill. "if no one finishes
   the pile will be re-decked and shuffled." */
function recycle(st) {
  const top = st.discard.pop();
  const back = st.discard;
  st.discard = [top];
  shuffle(st, back);
  for (const c of back) st.stock.push(c);
  st.recycles++;
}

/* every turn ends here, after the discard (or the opening, which
   carries its own discard): out? backstopped? refill the deck? */
function endTurn(st, seat) {
  if (st.seats[seat].hand.length === 0) {      /* played the hand EMPTY: out */
    st.reveal = { seat };
    st.phase = 'tally';
    return;
  }
  if (st.plies >= PLIES_MAX) {                 /* the absolute backstop */
    st.reveal = { dead: true };
    st.phase = 'tally';
    return;
  }
  if (st.stock.length <= st.floor && st.discard.length > 1) {
    if (st.recycles >= RECYCLE_MAX) {
      st.reveal = { dead: true };
      st.phase = 'tally';
      return;
    }
    recycle(st);
    st.last.recycled = true;
  }
  if (!st.stock.length) {                      /* nothing left to pick anywhere */
    st.reveal = { dead: true };
    st.phase = 'tally';
    return;
  }
  st.phase = 'main';
  st.turn = 1 - seat;
}

/* ── the count, once somebody has played their hand empty ─────────
   What you LAID counts plus — credited to whoever laid it, meld or
   lay-off — and the out player collects OUT_BONUS on top. What is
   still IN a hand counts minus, open or not, melds or not, because
   it was never put down. */
function settle(st) {
  const rv = st.reveal;
  const row = { hand: st.handNo, dealer: st.dealer };
  const held = [handPts(st.seats[0].hand), handPts(st.seats[1].hand)];
  const delta = [st.laid[0] - held[0], st.laid[1] - held[1]];
  if (rv.dead) {
    row.dead = true;
    row.win = -1;
  } else {
    delta[rv.seat] += OUT_BONUS;
    row.win = rv.seat;                         /* who went out */
    row.out = true;
    row.bonus = OUT_BONUS;
    st.match.boxes[rv.seat]++;
    st.dealer = rv.seat;                       /* who went out deals the next */
  }
  row.laid = st.laid.slice();
  row.held = held;
  row.delta = delta;
  st.match.pts[0] += delta[0];
  st.match.pts[1] += delta[1];
  st.match.book.push(row);

  /* the match: over the top, or through the floor — whichever first */
  const T = st.match.target, p = st.match.pts;
  let w = -1, how = '';
  if (p[0] >= T) { w = 0; how = 'up'; }
  else if (p[1] >= T) { w = 1; how = 'up'; }
  else if (p[0] <= -T && p[1] <= -T) {
    /* both through the floor on the same count: the deeper one loses;
       dead level, the match plays on */
    if (p[0] !== p[1]) { w = p[0] > p[1] ? 0 : 1; how = 'floor'; }
  }
  else if (p[0] <= -T) { w = 1; how = 'floor'; }
  else if (p[1] <= -T) { w = 0; how = 'floor'; }
  if (w >= 0) {
    st.final = {
      winner: w, how,
      raw: p.slice(),
      total: p.slice(),              /* no boxes-bonus arithmetic: these ARE the points */
      boxes: st.match.boxes.slice(),
      hands: st.match.book.filter(r => !r.dead).length
    };
  }
}

function apply(st, mv) {
  const seat = mv.seat != null ? mv.seat : st.turn;
  st.moves++;
  st.last = { t: mv.t, seat };
  switch (mv.t) {
    case 'take': {                             /* the first-turn upcard */
      const c = st.discard.pop();
      st.seats[seat].hand.push(c);
      st.picked = c;
      st.drew = { seat, from: 'pile', c };
      st.last.c = c;
      st.phase = 'act';
      st.turn = seat;
      break;
    }
    case 'draw': {
      const c = st.stock.pop();
      st.seats[seat].hand.push(c);
      st.picked = null;
      st.drew = { seat, from: 'stock', c };
      st.last.c = c;
      st.phase = 'act';
      st.turn = seat;
      break;
    }
    case 'sweep': {                            /* the open player's reach */
      const i = mv.i | 0;
      const run = st.discard.splice(i);        /* that card and all to its right */
      const want = run[0];
      for (const c of run) st.seats[seat].hand.push(c);
      /* the card you REACHED FOR is the one you may not throw
         straight back — same ban the first-turn take carries, and
         without it sweeping the newest card alone would be a free
         pass. The rest of the run is yours to throw at once if you
         want; carrying it is the price you already paid. */
      st.picked = want;
      st.drew = { seat, from: 'spread', c: want, n: run.length };
      st.last.c = want;
      st.last.n = run.length;
      st.last.i = i;
      st.phase = 'act';
      st.turn = seat;
      break;
    }
    case 'down': {                             /* the opening: discard + lay the 45 */
      const h = st.seats[seat].hand;
      h.splice(h.indexOf(mv.c), 1);
      st.discard.push(mv.c);
      const b = best(h);
      for (const m of b.melds) {
        const cs = meldSort(m.slice());
        st.table.push({ cs, by: seat });
        st.laid[seat] += handPts(cs);
        for (const c of cs) h.splice(h.indexOf(c), 1);
      }
      st.down[seat] = true;
      st.drew = null;
      st.picked = null;
      st.plies++;
      st.last.c = mv.c;
      st.last.n = st.laid[seat];
      endTurn(st, seat);
      break;
    }
    case 'meld': {                             /* an open player lays a new meld */
      const h = st.seats[seat].hand;
      const cs = meldSort(mv.cs.slice());
      for (const c of cs) h.splice(h.indexOf(c), 1);
      st.table.push({ cs, by: seat });
      st.laid[seat] += handPts(cs);
      st.last.n = handPts(cs);
      break;                                   /* still their turn: 'act' holds */
    }
    case 'lay': {                              /* one card onto a table meld */
      const h = st.seats[seat].hand;
      h.splice(h.indexOf(mv.c), 1);
      const tm = st.table[mv.m | 0];
      tm.cs.push(mv.c);
      meldSort(tm.cs);
      st.laid[seat] += pts(mv.c);
      st.last.c = mv.c;
      st.last.m = mv.m | 0;
      break;                                   /* still their turn */
    }
    case 'disc': {                             /* every turn ends with one */
      const h = st.seats[seat].hand;
      h.splice(h.indexOf(mv.c), 1);
      st.discard.push(mv.c);
      st.drew = null;
      st.picked = null;
      st.plies++;
      st.last.c = mv.c;
      endTurn(st, seat);
      break;
    }
    case 'tally': {
      settle(st);
      st.last.row = st.match.book[st.match.book.length - 1];
      st.phase = st.final ? 'over' : 'shuffle';
      break;
    }
    case 'next': {
      st.handNo++;
      dealHand(st);
      break;
    }
  }
}

/* a short honest fingerprint of the position — travels with every
   online move so drift is caught, not lied about. The open flags,
   the laid points and the table are all in it: a phone playing any
   earlier gin (knock-era, or the lay-down-ends-it build) can never
   quietly score a hand against this one. */
function fingerprint(st) {
  const s = [st.rs, st.moves, st.phase, st.turn, st.dealer, st.open,
    st.down.join(''), st.laid.join('/'), st.picked == null ? '' : st.picked,
    st.table.map(t => t.by + ':' + t.cs.join('.')).join(';'),
    st.seats[0].hand.slice().sort((a, b) => a - b).join(','),
    st.seats[1].hand.slice().sort((a, b) => a - b).join(','),
    st.stock.length, st.discard.join(','),
    st.match.pts.join('/'), st.match.boxes.join('/')].join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — three of them, all playing THIS game: race to put
   the 45 down, because open is where the points are; then feed the
   table every card that fits — the other side's melds very much
   included — and be the first hand empty, for the 50.

   MEASURED (the harness drives this exact file; seeds shared, seats
   swapped, 200 games a pairing; workings in the report):
     · OPEN EARLY. Against the tuned line (opens at net +15),
       opening the instant it is legal scored 50.0% — identical —
       but WAITING for net +30 scored 44.5%: patience past a small
       margin is pure loss, because a closed hand is pure liability
       while the table earns for the other side. Tal-każin waits
       for +30, and that is his flaw, measured.
     · HALF-MELDS AT HALF PRICE. protoW 0.5 beat protoW 0 (63.5%)
       AND protoW 1.0 (70%): under these rules you always need the
       NEXT meld — for the table, for going out — but pricing pairs
       at full still breaks made melds to chase maybes.
     · SHED DEAR. tieDear −1 beat +1 by 57% (and 65% in the
       pre-tune sweep): a loose ace is 15 against you at any exit.
     · KEEP THE KEY CARD: layW 0.5 vs 0 measured 53/47 — neutral to
       a whisker positive. Kept at 0.5 because the fourth ace held
       one extra turn is his own example of the game played well.
     · LAY EVERYTHING once open. No holding-back variant beat it;
       laid points are safe points and shedding is the out bonus.
   The chairs (measured): iż-żiju 25% against in-nannu, tal-każin
   45%, iż-żiju 27% against tal-każin — a clean staircase.
     1 Iż-żiju    hoards every shiny card, prices half-melds at
                  full, grabs a dear upcard on sight.
     2 Tal-każin  builds properly but sits on his 45 waiting for a
                  respectable net +30 — the patience that costs him
                  — and cannot bear to shed a dear card.
     3 In-nannu   opens at +15, lays everything, sheds dear loose
                  cards first, keeps the card that closes your
                  pile. The strongest line the simulator could find.
   Deterministic given the state, which keeps the simulations honest.
   ═══════════════════════════════════════════════════════════════════ */

/* the value of the loose cards that are HALF a meld — a pair, or two
   suited cards within touching distance. The material 45 is built
   from; also, at full price, a trap. */
function protoVal(dead) {
  let v = 0;
  for (let i = 0; i < dead.length; i++) {
    let live = false;
    for (let j = 0; j < dead.length && !live; j++) {
      if (i === j) continue;
      if (rankOf(dead[i]) === rankOf(dead[j])) live = true;
      else if (suitOf(dead[i]) === suitOf(dead[j]) &&
               Math.abs(rankOf(dead[i]) - rankOf(dead[j])) <= 2) live = true;
    }
    if (live) v += pts(dead[i]);
  }
  return v;
}

/* the three temperaments, as numbers:
   openNet — net (melds − loose) demanded before putting the 45 down
   layW    — how hard a card that fits the TABLE is held on to
   holdW   — how dearly the dead weight a SWEEP would strand in the
             hand is counted against the points it would place
   protoW/tieDear — the old discard temperament, unchanged */
function brain(lvl) {
  if (lvl === 1) return { openNet: -Infinity, layW: 0,   holdW: 0.3, protoW: 1.0, tieDear: +1 };
  if (lvl === 3) return { openNet: 15,        layW: 0.5, holdW: 0.8, protoW: 0.5, tieDear: -1 };
  return            { openNet: 30,        layW: 0.5, holdW: 0.8, protoW: 0.5, tieDear: +1 };
}
const OPEN_PLIES = 30;        /* past this, even tal-każin stops waiting */

/* the next lay an open player should make, or null when the hand is
   down to what it keeps: melds first (dear first, best()'s order),
   then single cards onto the table — always leaving one card back
   for the discard. Deterministic, so it can drive both phones. */
function nextLay(st, seat) {
  const h = st.seats[seat].hand;
  if (!st.down[seat]) return null;
  if (h.length >= 4) {
    const b = best(h);
    for (const m of b.melds)
      if (h.length - m.length >= 1) return { t: 'meld', cs: m.slice() };
  }
  if (h.length >= 2)
    for (const c of h)
      for (let ti = 0; ti < st.table.length; ti++)
        if ((LAY_ON_FOE || st.table[ti].by === seat) && canExtend(st.table[ti].cs, c))
          return { t: 'lay', c, m: ti };
  return null;
}

/* does this card fit anything on the table this seat may touch? */
function extendsTable(st, seat, c) {
  for (const t of st.table)
    if ((LAY_ON_FOE || t.by === seat) && canExtend(t.cs, c)) return true;
  return false;
}

/* how close this card is to being layable: 1 = fits a table meld
   right now, 0.4 = one card short of a run's end (the draw could
   open the door), 0 = nothing on the table wants it. This is what
   drains the endgame — a down hand that sheds its no-hopers and
   keeps its maybes goes out instead of stalling into the backstop. */
function layFit(st, seat, c) {
  let f = 0;
  for (const t of st.table) {
    if (!LAY_ON_FOE && t.by !== seat) continue;
    if (canExtend(t.cs, c)) return 1;
    const r0 = rankOf(t.cs[0]);
    if (t.cs.every(x => rankOf(x) === r0)) continue;   /* a set: now or never */
    if (suitOf(c) !== suitOf(t.cs[0])) continue;
    let lo = 14, hi = 0;
    for (const x of t.cs) { const r = rankOf(x); if (r < lo) lo = r; if (r > hi) hi = r; }
    const d = Math.min(Math.abs(rankOf(c) - (lo - 1)), Math.abs(rankOf(c) - (hi + 1)));
    if (d === 1) f = Math.max(f, 0.4);
  }
  return f;
}

function think(st, seat, lvl) {
  /* lvl may be a brain OBJECT — the simulation harness sweeps
     temperaments through here; the app only ever passes 1/2/3 */
  const B = (lvl && typeof lvl === 'object') ? lvl : brain(lvl || 2);
  const h = st.seats[seat].hand;
  const ph = st.phase;

  if (ph === 'main') {
    /* the one choice here is the hand's first turn: the upcard, or
       blind? Take it if it melds — or if it fits the table already
       down (it never is on ply 0, but FIRST_TAKE_PLY is a dial). */
    if (canTakeUp(st)) {
      const up = upTop(st);
      const now = handPts(h) - best(h).dw;
      let after = -1, melded = false;
      const eleven = h.concat([up]);
      for (const c of eleven) {
        if (c === up) continue;                /* may not throw it straight back */
        const rest = eleven.filter(x => x !== c);
        const b = best(rest);
        const mvv = handPts(rest) - b.dw;
        if (mvv > after) { after = mvv; melded = b.melds.some(m => m.indexOf(up) >= 0); }
      }
      const take = B.protoW >= 1 ? (melded || pts(up) >= 10)   /* iż-żiju's shiny-card eye */
                                 : (melded || after - now >= 10);
      if (take) return { t: 'take' };
    }

    /* THE SWEEP, weighed. Once open, reaching into the spread is
       worth it when what the run ADDS to the table beats what it
       leaves stranded in the hand. Every index is scored the same
       way and the best one runs against the deck:
         gain  = points this run can put down at once (melds it
                 completes in hand + cards that fit a table meld,
                 mine or theirs — a lay scores for whoever lays it)
         cost  = what is left over, at its face value, because that
                 is exactly what it costs if the hand ends on it
       Deep reaches are naturally rare: the further left you go the
       more dead weight you carry, and the arithmetic says so
       without needing a rule to forbid it. */
    if (canSweep(st, seat)) {
      let bestSweep = null;
      const L = st.discard.length;
      for (let i = 0; i < L; i++) {
        const run = st.discard.slice(i);
        const after2 = h.concat(run);
        const b2 = best(after2);
        /* what this hand could now put on a table, in one turn */
        const placeable = handPts(after2) - b2.dw;
        let fits = 0;
        for (const c of b2.dead) if (layFit(st, seat, c) === 1) fits += pts(c);
        const nowPts = handPts(h) - best(h).dw;
        const gain = (placeable - nowPts) + fits;
        const stranded = b2.dw - fits;         /* left holding, at face value */
        const score = gain - stranded * B.holdW;
        if (!bestSweep || score > bestSweep.score) bestSweep = { i, score, gain };
      }
      /* the deck is a free unknown card; the sweep has to beat it by
         a real margin or it is just hoarding */
      if (bestSweep && bestSweep.score >= 10 && bestSweep.gain > 0)
        return { t: 'sweep', i: bestSweep.i };
    }

    if (st.stock.length) return { t: 'draw' };
    const l = legal(st, seat);
    return l[0] || null;
  }

  if (ph === 'act') {
    if (!st.down[seat]) {
      /* THE RACE: open the moment it is legal (tal-każin's patience
         is his flaw, and it is measured as one) */
      const op = bestOpen(st, h);
      if (op && (op.net >= B.openNet || st.plies >= OPEN_PLIES))
        return { t: 'down', c: op.c };
    } else {
      /* LAY EVERYTHING (measured, not a mood — see the header) */
      const lm = nextLay(st, seat);
      if (lm) return lm;
    }
    /* the discard: keep the most meld value working; hold on to any
       card the table would take (the fourth ace is 15 points the
       moment you are open — and open players never reach here still
       holding one unless it is their kept-back last card) */
    const banned = bannedOf(st, seat);
    let pick = null, pickScore = -Infinity;
    for (const c of h) {
      if (c === banned) continue;
      if (discRefused(st, seat, c)) continue;  /* the machine obeys the penalty too */
      const rest = h.filter(x => x !== c);
      const b = best(rest);
      let score = (handPts(rest) - b.dw) + B.protoW * protoVal(b.dead);
      score += B.tieDear * pts(c) * 0.01;     /* the tie: shed dear, or hoard it */
      if (B.layW) score -= pts(c) * B.layW * layFit(st, seat, c);
      if (score > pickScore) { pickScore = score; pick = c; }
    }
    return pick != null ? { t: 'disc', c: pick } : (legal(st, seat)[0] || null);
  }

  const l = legal(st, seat);
  return l[0] || null;
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE
   ═══════════════════════════════════════════════════════════════════ */
const E = {
  suitOf, rankOf, mk, pts, handPts, meldValOf,
  rnd, shuffle, clone,
  deal, dealHand, legal, check, apply, turn, over, think,
  best, bestDiscard, bestOpen, fingerprint, upTop,
  isSet, isRun, validMeld, canExtend, canTakeUp, canSweep, sweepRun,
  bannedOf, discRefused,
  nextLay, extendsTable, layFit, brain,
  protoVal, SIZES, sizeOf,
  /* the gate of a particular table (always 45 in the app; the
     simulator may have swept it) */
  openOf: st => (st && st.open != null) ? st.open : OPEN_MIN,
  OPEN_MIN, OUT_BONUS, TARGET, RECYCLE_MAX, PLIES_MAX,
  FIRST_TAKE_PLY, LAY_ON_FOE
};

if (typeof module !== 'undefined' && module.exports) module.exports = E;
else {
  root.KARTI_GIN = root.KARTI_GIN || {};
  root.KARTI_GIN.E = E;
}

})(typeof window !== 'undefined' ? window : globalThis);
