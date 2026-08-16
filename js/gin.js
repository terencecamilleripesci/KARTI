/* ═══════════════════════════════════════════════════════════════════
   KARTI — gin.js
   GIN RUMMY, THE HOUSE GAME — the engine, and nothing but the engine.

   THIS IS NOT HOYLE'S GIN ANY MORE. The owner plays his own game and
   said so in three sentences, and this file is those three sentences
   made precise:

     "Only gin rummy u have to match for 45 points then put ur
      cards out"
     "If u dont put down the cards it will count to -"
     "2-9 is 5 points, 10 j q k 10 points, 1 is 15 points"

   So:
     · CARD PRICES — 2..9 are 5, ten and the courts are 10, the ACE
       is 15. Three aces are exactly 45; the values and the threshold
       were clearly designed together and are kept together here.
     · YOU MAY NOT PUT YOUR CARDS OUT until the melds you are putting
       out are worth 45 POINTS OR MORE. There is no knocking and no
       deadwood limit: 45 in melds is the one and only gate.
     · PUTTING THEM OUT ENDS THE HAND. The opener's melds count FOR
       them, and every card still in a hand — the opener's loose
       cards AND the other player's entire hand, melds or not —
       counts AGAINST whoever is holding it. "If u dont put down the
       cards it will count to -": nothing that stayed in a hand ever
       scores a point.
     · THE STOCK NEVER DIES. When it runs down the discard pile (all
       but its top card) is shuffled straight back in, because in
       this game somebody always gets to 45 — a hand that ends with
       nobody putting cards out is not a hand. (Backstop: after two
       full recycles the hand is called off and both sides count
       their hands minus, which the simulator has never once seen
       happen with either machine at the table.)
     · THE MATCH is first to +TARGET — or first to sink to −TARGET,
       who loses it, whichever comes first. The floor matters because
       the scoring is minus-heavy: the loser of a hand drops more
       than the winner gains, so most matches END at the floor. The
       measurements behind the number are below at SIZES.
     · No gin bonus, no undercut, no boxes, no game bonus. The owner
       named none of them and the scoring above already pays a clean
       sweep (everything melded, nothing loose) all it deserves.

   WHAT SURVIVED FROM THE OLD FILE, because it was never about
   Hoyle: the deck shape, the seeded RNG whose entire state is one
   integer in st.rs, the meld solver with its memo, and the
   deterministic replay discipline — (opts, seed, log) rebuilds the
   match to the bit, so undo, autosave and two phones in lockstep are
   all the same operation. What DIED: knocking, deadwood limits,
   lay-offs against the knocker, gin/undercut/box/game bonuses, and
   the whole tally of Hoyle's match arithmetic.

   TEN CARDS OR THIRTEEN. Ten stays the default; thirteen stays an
   option, with the SAME 45-point gate — see SIZES for why the gate
   does not move with the hand.

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
   exactly where sub-runs start to matter — then a straight search
   over disjoint combinations for the least deadwood VALUE. Under the
   house prices, minimising the value of the loose cards is the same
   thing as MAXIMISING THE VALUE OF THE MELDS (the hand's total is
   fixed), so the one search answers both "how much can I put out"
   and "how little will I be caught holding". The answer is memoised
   (see below), which is what keeps a big hand instant on a phone.

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
   best() is a small search, but it is called for every candidate
   discard of an over-full hand, on every turn, by the AI and the
   dashboard and the open test — thousands of times a match and
   millions across a simulation sweep. The answer depends on nothing
   but the multiset of cards, so it is cached on the sorted key. Pure
   in, pure out: the cache cannot change a single result, only the
   time it takes to get it. Bounded so a long session cannot grow it
   without limit. */
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
  let bestDw = handPts(cards);
  let arrs = [[]];                            /* arrangements at bestDw */
  const used = new Set();

  function dfs(i, melds, melded) {
    if (i >= cs.length) {
      const dw = handPts(cards) - melded.pts;
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

/* the value the melds of this hand can be put out for */
function meldValOf(cards) { return handPts(cards) - best(cards).dw; }

/* the least loose VALUE this over-full hand can reach by discarding
   one card, and which discards reach it (the dashboard's number) */
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

/* the best PUT-THEM-OUT available to an over-full hand: among the
   discards whose remaining melds reach the gate, the one that nets
   the most (melds minus loose). null if the gate is out of reach.
   The UI's button and the machine's decision both read this, so
   they can never disagree about what going out is worth. */
function bestDown(st, cards, banned) {
  let out = null;
  for (const c of cards) {
    if (banned != null && c === banned) continue;
    const rest = cards.filter(x => x !== c);
    const b = best(rest);
    const mv = handPts(rest) - b.dw;
    if (mv < st.open) continue;
    const net = mv - b.dw;
    if (!out || net > out.net || (net === out.net && c < out.c))
      out = { c, mv, dw: b.dw, net };
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   THE STATE
   phases:
     up0     non-dealer looks at the first upcard: take or pass
     up1     the dealer gets the same look after a pass
     draw1   both passed — the non-dealer MUST draw from the stock
     main    the player to move draws: stock or pile
     off     they hold one over the hand size and must put one back
     tally   seat -1: the hand is counted
     shuffle seat -1: the next hand is dealt
     over    somebody crossed the target — or sank to the floor
   ═══════════════════════════════════════════════════════════════════ */
const OPEN_MIN = 45;                /* melds you must show to put cards out */
const TARGET = 300;                 /* the default match, measured below */
const RECYCLE_MAX = 2;              /* backstop; simulated matches never hit it */

/* ═══════════════════════════════════════════════════════════════════
   TWO HAND SIZES, ONE GATE — the measurements
   ───────────────────────────────────────────────────────────────────
   From the simulation harness driving THIS file, tal-każin against
   tal-każin, 400 matches per setting (full workings in the report).
   Predictions made before the sweep and overturned by it are marked,
   because the temptation to "fix" these numbers later will come back:

     · TEN CARDS: a dealt hand averages 73 points. A hand is a SPRINT
       — ~7 plies and somebody is at 45 (the old knock game ran ~13).
       The opener puts out ~54 in melds holding ~18 loose (net ~+36);
       the caught hand counts ~-69. The stock recycle almost never
       fires against machines (0 backstop deaths in 4,219 hands) but
       stays: two hoarding HUMANS can still run the stock down.
     · THIRTEEN CARDS, SAME 45 GATE: more meld material, so the gate
       falls even sooner (~5 plies) and the caught hand is dearer
       (~-91). The gate is NOT raised to match: the owner's number is
       45, and thirteen is simply the faster, swingier table. The
       option copy says so.
     · TARGET 300, and the FLOOR is the game. Predicted: matches end
       at +300. Measured: essentially NO match ends over the top
       (1 in 300 at the loosest setting) — the loser of a hand drops
       roughly twice what the winner gains, so every match ends with
       somebody THROUGH THE FLOOR at −300. The match is a survival
       race and the rules card says so honestly. Swept 150/200/250/
       300/400 → 4.5/6.4/8.5/10.6/15.2 hands a match at ten cards:
       300 matches the old game's ~10-hand feel and ships as the
       default; 150 (~4 hands) ships as the quick one.
   ═══════════════════════════════════════════════════════════════════ */
const SIZES = {
  10: { hand: 10, open: OPEN_MIN, floor: 2, target: TARGET },
  13: { hand: 13, open: OPEN_MIN, floor: 2, target: TARGET }
};
function sizeOf(n) { return SIZES[n] || SIZES[10]; }

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
  st.discard = [d.pop()];
  st.stock = d;
  st.turn = nd;
  st.phase = 'up0';
  st.drew = null;
  st.taken = [[], []];                         /* pile cards each side took: public */
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
    turn: 0, phase: 'up0', drew: null, taken: [[], []], reveal: null,
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

function legal(st, seat) {
  const t = turn(st);
  if (t !== seat) return [];
  switch (st.phase) {
    case 'up0': case 'up1':
      return [{ t: 'take' }, { t: 'pass' }];
    case 'draw1':
      return [{ t: 'draw' }];
    case 'main':
      return [{ t: 'draw' }, { t: 'take' }];
    case 'off': {
      const h = st.seats[seat].hand;
      const banned = (st.drew && st.drew.from === 'pile') ? st.drew.c : null;
      const out = [];
      for (const c of h) {
        if (c === banned) continue;
        out.push({ t: 'disc', c });
        const rest = h.filter(x => x !== c);
        if (handPts(rest) - best(rest).dw >= st.open) out.push({ t: 'down', c });
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
  switch (st.phase) {
    case 'up0': case 'up1':
      return mv.t === 'take' || mv.t === 'pass';
    case 'draw1':
      return mv.t === 'draw';
    case 'main':
      return mv.t === 'draw' || mv.t === 'take';
    case 'off': {
      if (mv.t !== 'disc' && mv.t !== 'down') return false;
      const h = st.seats[seat].hand;
      if (h.indexOf(mv.c) < 0) return false;
      if (st.drew && st.drew.from === 'pile' && mv.c === st.drew.c) return false;
      if (mv.t === 'down') {
        const rest = h.filter(x => x !== mv.c);
        return handPts(rest) - best(rest).dw >= st.open;
      }
      return true;
    }
    case 'tally': return mv.t === 'tally';
    case 'shuffle': return mv.t === 'next';
  }
  return false;
}

/* the pile, all but its top card, shuffled back into the stock —
   seeded, so both phones deal the same refill */
function recycle(st) {
  const top = st.discard.pop();
  const back = st.discard;
  st.discard = [top];
  shuffle(st, back);
  for (const c of back) st.stock.push(c);
  st.recycles++;
}

/* ── the count, once somebody has put their cards out ─────────────
   Opener: melds count plus, their loose cards count minus.
   The other hand: EVERY card counts minus — melds included, because
   they were never put down, and "if u dont put down the cards it
   will count to -". No lay-offs: there is nothing to lay off onto,
   the hand is over. */
function settle(st) {
  const rv = st.reveal;
  const row = { hand: st.handNo, dealer: st.dealer };
  if (rv.dead) {
    /* the backstop: two full recycles and still nobody at 45.
       Everybody is holding cards nobody put down: both count minus. */
    const l0 = handPts(st.seats[0].hand), l1 = handPts(st.seats[1].hand);
    row.dead = true;
    row.loss = [l0, l1];
    row.win = -1;
    st.match.pts[0] -= l0;
    st.match.pts[1] -= l1;
    rv.kMelds = []; rv.kDead = [];
  } else {
    const k = rv.seat, d = 1 - k;
    const kb = best(st.seats[k].hand);
    const meld = handPts(st.seats[k].hand) - kb.dw;
    const loss = handPts(st.seats[d].hand);
    row.opener = k;
    row.win = k;
    row.meld = meld;                 /* what they put out */
    row.loose = kb.dw;               /* what they were still holding */
    row.gain = meld - kb.dw;         /* their score for the hand */
    row.loss = loss;                 /* the other hand, all of it, minus */
    row.out = kb.dw === 0;           /* the clean sweep: every card out */
    /* COPIES, not the solver's own arrays — best() is memoised and
       what it returns is shared with every caller of the same hand. */
    rv.kMelds = kb.melds.map(m => m.slice());
    rv.kDead = kb.dead.slice();
    rv.dHand = st.seats[d].hand.slice();
    st.match.pts[k] += row.gain;
    st.match.pts[d] -= loss;
    st.match.boxes[k]++;
    st.dealer = k;                   /* the winner of the hand deals the next */
  }
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
      total: p.slice(),              /* no bonuses: the totals ARE the points */
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
    case 'take': {
      const c = st.discard.pop();
      st.seats[seat].hand.push(c);
      st.drew = { seat, from: 'pile', c };
      st.taken[seat].push(c);
      st.last.c = c;
      st.phase = 'off';
      st.turn = seat;
      break;
    }
    case 'pass': {
      if (st.phase === 'up0') { st.phase = 'up1'; st.turn = st.dealer; }
      else { st.phase = 'draw1'; st.turn = 1 - st.dealer; }
      break;
    }
    case 'draw': {
      const c = st.stock.pop();
      st.seats[seat].hand.push(c);
      st.drew = { seat, from: 'stock', c };
      st.last.c = c;
      st.phase = 'off';
      st.turn = seat;
      break;
    }
    case 'disc': {
      const h = st.seats[seat].hand;
      h.splice(h.indexOf(mv.c), 1);
      st.discard.push(mv.c);
      st.drew = null;
      st.plies++;
      st.last.c = mv.c;
      if (st.stock.length <= st.floor) {
        if (st.recycles >= RECYCLE_MAX) {      /* the backstop */
          st.reveal = { dead: true };
          st.phase = 'tally';
          break;
        }
        recycle(st);
        st.last.recycled = true;
      }
      st.phase = 'main';
      st.turn = 1 - seat;
      break;
    }
    case 'down': {
      const h = st.seats[seat].hand;
      h.splice(h.indexOf(mv.c), 1);
      st.discard.push(mv.c);
      st.drew = null;
      st.plies++;
      st.last.c = mv.c;
      st.reveal = { seat };
      st.phase = 'tally';
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
   online move so drift is caught, not lied about. st.open is in it:
   a phone still playing the knock game can never quietly score a
   hand against one playing this game. */
function fingerprint(st) {
  const s = [st.rs, st.moves, st.phase, st.turn, st.dealer, st.open,
    st.seats[0].hand.slice().sort((a, b) => a - b).join(','),
    st.seats[1].hand.slice().sort((a, b) => a - b).join(','),
    st.stock.length, st.discard.join(','),
    st.match.pts.join('/'), st.match.boxes.join('/')].join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — three of them, all playing THIS game: the race is to
   45 points of melds, and the fear is being caught holding a hand.

   THE GAME IS A SPRINT, AND THE SIMULATOR PROVED IT THE HARD WAY.
   Every prediction about clever play was tested head-to-head over
   400 matches a pairing (seeds shared, seats swapped) and most of
   them LOST to the plain line:

     · PATIENCE LOSES. Holding a legal 45 back to build a better net
       was the obvious refinement and it is simply wrong: refusing to
       go out below net +15 won only 45.3% against going out at once;
       below +25, 30.3%; below +40, 14.0%. Another turn of building
       is worth ~10 points; the risk is the whole ~105-point swing of
       being caught instead. So patience is not a skill here — it is
       the MIDDLE CHAIR'S FLAW (tal-każin waits for net +20), and
       in-nannu refuses only a loss-making exit (net < 0, measured
       49.3% against going out at once: indistinguishable, and it is
       what a person would do).
     · HOARDING HALF-MELDS LOSES. Pricing pairs and near-runs at full
       value (so the machine holds a pair of aces as "half of 45")
       scored 26.3% against the plain maximiser — it breaks made
       melds to keep possibilities. At half price it is 51.3%: noise.
     · GUARDING YOUR DISCARDS LOSES. Steering discards away from
       ranks and suits the other player took off the pile — the
       heart of the old gin machine — scored 45.0%: in a sprint,
       slowing yourself down costs more than starving them.

   So the chairs are, honestly (shipped brains, 600 matches a
   pairing, seeds shared, seats swapped):
     1 Iż-żiju    the bad habits, all of them: grabs any dear card
                  that pairs something, hoards half-melds at full
                  price (he will break a made meld to keep two aces),
                  hangs on to his dear cards, and puts his cards out
                  the instant it is legal even at a net loss.
                  Measured: 23.2% against in-nannu, 33.3% against
                  tal-każin.
     2 Tal-każin  builds properly but cannot bear to throw a dear
                  card while a cheap one is in reach, prices
                  half-melds at half, and waits for a net +20 before
                  he shows you — the patience that costs him.
                  Measured: 44.0% against in-nannu.
     3 In-nannu   the clean maximiser: the discard that leaves the
                  most meld value on the table, dear ties shed first
                  (he knows a loose ace is 15 against him), out the
                  moment it pays. The strongest line the simulator
                  could find.
   Deterministic given the state, which keeps the simulations honest.

   WHY VALUE AND NOT DEADWOOD: minimising loose value equals
   maximising meld value (the hand's total is fixed), so best()
   already points the discard search at the real goal. A machine
   hunting the OLD game's low deadwood would be hunting the same
   number — what changed is everything around it: the prices, the
   gate test, and when to end the hand.
   ═══════════════════════════════════════════════════════════════════ */

/* the value of the loose cards that are HALF a meld — a pair, or two
   suited cards within touching distance. The material 45 is built
   from; also, at full price, a trap (see above). */
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

/* the three temperaments, as numbers */
function brain(lvl) {
  if (lvl === 1) return { protoW: 1.0, tieDear: +1, takeDearPair: true,  downNet: -Infinity };
  if (lvl === 3) return { protoW: 0,   tieDear: -1, takeDearPair: false, downNet: 0 };
  return            { protoW: 0.5, tieDear: +1, takeDearPair: false, downNet: 20 };
}
const DOWN_PLIES = 26;              /* past this, anybody legal goes */

function think(st, seat, lvl) {
  lvl = lvl || 2;
  const B = brain(lvl);
  const h = st.seats[seat].hand;
  const ph = st.phase;

  if (ph === 'up0' || ph === 'up1' || ph === 'main') {
    const up = upTop(st);
    const now = handPts(h) - best(h).dw;                  /* meld value held */
    /* the best keep-the-upcard line: value of melds after the best
       discard of the eleven */
    let after = -1, melded = false;
    const eleven = h.concat([up]);
    for (const c of eleven) {
      if (c === up) continue;                             /* may not throw it back */
      const rest = eleven.filter(x => x !== c);
      const b = best(rest);
      const mv = handPts(rest) - b.dw;
      if (mv > after) { after = mv; melded = b.melds.some(m => m.indexOf(up) >= 0); }
    }
    const gain = after - now;
    let take = lvl === 1 ? melded : (melded || gain >= 10);
    if (!take && B.takeDearPair)                          /* the shiny-card habit */
      take = pts(up) >= 10 && h.some(c => rankOf(c) === rankOf(up));
    if (ph === 'main') return take ? { t: 'take' } : { t: 'draw' };
    return take ? { t: 'take' } : { t: 'pass' };
  }
  if (ph === 'draw1') return { t: 'draw' };

  if (ph === 'off') {
    const banned = (st.drew && st.drew.from === 'pile') ? st.drew.c : null;

    /* FIRST: can we put them out, and should we? (see the sprint
       note: yes, almost always) */
    const down = bestDown(st, h, banned);
    if (down && (down.net >= B.downNet || st.plies >= DOWN_PLIES))
      return { t: 'down', c: down.c };

    /* otherwise: the discard that keeps the most meld VALUE working */
    let pick = null, pickScore = -Infinity;
    for (const c of h) {
      if (c === banned) continue;
      const rest = h.filter(x => x !== c);
      const b = best(rest);
      let score = (handPts(rest) - b.dw) + B.protoW * protoVal(b.dead);
      score += B.tieDear * pts(c) * 0.01;     /* the tie: shed dear, or hoard it */
      if (score > pickScore) { pickScore = score; pick = c; }
    }
    return { t: 'disc', c: pick };
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
  best, bestDiscard, bestDown, fingerprint, upTop,
  protoVal, SIZES, sizeOf,
  /* the gate of a particular table (always 45 in the app; the
     simulator may have swept it) */
  openOf: st => (st && st.open != null) ? st.open : OPEN_MIN,
  OPEN_MIN, TARGET, RECYCLE_MAX
};

if (typeof module !== 'undefined' && module.exports) module.exports = E;
else {
  root.KARTI_GIN = root.KARTI_GIN || {};
  root.KARTI_GIN.E = E;
}

})(typeof window !== 'undefined' ? window : globalThis);
