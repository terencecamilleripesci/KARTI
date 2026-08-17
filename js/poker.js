/* ═══════════════════════════════════════════════════════════════════
   KARTI — poker.js
   TEXAS HOLD'EM — the engine. Rules only: no DOM, no clock, and NO
   Math.random anywhere in this file. The screen half is js/poker-ui.js
   and follows js/rummy-ui.js's runner shape: a match is (opts, seed,
   log), the state is always deal() plus a replay of the log, and
   rollback is cutting the log.

   THE GAME
     Two to eight seats. Everybody starts on the same stack. Each hand:
     the button moves one seat left, the two seats after it post the
     small and big blind, everybody is dealt TWO cards face down, and
     the betting runs over four streets —

       PREFLOP   the two cards in your hand
       FLOP      three community cards
       TURN      a fourth
       RIVER     a fifth

     — with fold / check / call / bet / raise / all-in at each. Last
     one standing takes the pot; if two or more are still in after the
     river they show, and the best five cards out of the seven (two of
     yours plus the five in the middle) wins.

   ── THE DEAL IS INJECTED. READ THIS BEFORE CHANGING ANYTHING. ──────
     The relay broadcasts ONE shared seed to every seat, so a client
     that derives the deal from that seed can derive EVERY opponent's
     hole cards. That is harmless in rummy (a shared seed there deals a
     stock nobody can read ahead) and fatal in poker.

     So the deal is NOT hard-wired. It is one injectable source with
     two implementations and one interface — make(st) -> {holes, run}:

       DEALERS.seed     derives the whole deal from st.rs, exactly the
                        way skarta and rummy do today. This is what
                        FREE MODE uses, and it is honest there because
                        nothing is at stake but table chips.
       DEALERS.private  takes hole cards and the five community cards
                        delivered PER SEAT by the relay (st.given), and
                        leaves any seat it was not told about as null —
                        "this client does not know these two cards".
                        For COINS MODE, once the relay can deal
                        privately. Nothing else in this engine changes.

     Everything downstream of make() — betting, side pots, the
     evaluator, the AI, the wire — is identical between the two. That
     is the whole point: the seam is one function, and it is here.

     What `private` still needs from the relay before coins can ship:
     a SHOWDOWN REVEAL message (this client cannot score a hand it was
     never sent), and per-street board delivery. Both are relay work,
     and js/poker-ui.js's COINS_MODE_READY flag says so at the door.

   ── THE TWO THINGS POKER GETS WRONG, AND WHERE THEY LIVE HERE ──────
     1. THE EVALUATOR. score() reads five, six or seven cards and
        returns ONE comparable integer. It is verified by brute force
        against an independently written reference — exhaustively over
        all 2,598,960 five-card hands, and over hundreds of thousands
        of seven-card hands against the max of all 21 five-card
        subsets. The ace is HIGH (14) everywhere except the wheel,
        A-2-3-4-5, which straightHigh() handles by lighting bit 1 when
        bit 14 is set.
     2. SIDE POTS. pots() never reads a running total. It reads what
        each seat has PUT IN over the whole hand (s.committed) and
        slices the money into layers at each distinct commitment
        level, so a three-way all-in at three different stack sizes
        produces three pots and each is contested only by the seats
        who actually paid into it. Chip conservation is arithmetic,
        not hope: every seat's committed is sliced exactly once.

   DETERMINISM
     st.rs is the entire RNG. The AI is a pure function of the state
     (its "randomness" is a hash of the position, never a clock and
     never Math.random), so every phone replays every move to the
     identical table. The one place a brand-new local match picks a
     seed is js/poker-ui.js's newSeed(), which is skarta's pattern.

   CARDS
     Plain klabb face ids, 0..51: c = suit*13 + rank-1, rank 1=A…13=K.
     One pack, no jokers. That is what js/klabb.js's deck draws, so the
     pack on this felt is the pack on every other felt.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ── the cards ───────────────────────────────────────────────────── */
const suitOf = c => (c / 13) | 0;
const rankOf = c => (c % 13) + 1;                 /* 1=A … 13=K       */
/* the ace is HIGH in poker. The wheel is the one exception and it is
   handled inside straightHigh(), never by a second rank scale. */
const hiOf   = c => { const r = c % 13 + 1; return r === 1 ? 14 : r; };

/* ── seeded randomness — the whole RNG state is st.rs (rummy's) ──── */
function rnd(st){
  st.rs = (st.rs + 0x6D2B79F5) | 0;
  let t = st.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(st, a){
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(rnd(st) * (i + 1)) % (i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* ═══════════════════════════════════════════════════════════════════
   THE EVALUATOR
   score(cards) -> one integer. Bigger is better, equal is a tie, and
   a tie is a SPLIT POT — never a coin toss and never seat order.

   The value is the category and five kickers packed base-15 (no rank
   exceeds 14), so a single < compares two hands the way a dealer
   would: category first, then the ranks that decide it, in order.
   ═══════════════════════════════════════════════════════════════════ */
const CAT = { HIGH:0, PAIR:1, TWOPAIR:2, TRIPS:3, STRAIGHT:4,
              FLUSH:5, BOAT:6, QUADS:7, SFLUSH:8 };
const CAT_MAX = 8;
const BASE = 15;
const KICKS = 5;

function packed(cat, k){
  let v = cat;
  for (let i = 0; i < KICKS; i++) v = v * BASE + (k[i] | 0);
  return v;
}
/* read a packed score back apart — the UI names the hand, this file
   never writes player-visible text (see js/lang.js rule 5). */
function catOf(v){ return Math.floor(v / Math.pow(BASE, KICKS)); }
function kicksOf(v){
  const out = [];
  let r = v % Math.pow(BASE, KICKS);
  for (let i = KICKS - 1; i >= 0; i--){
    const p = Math.pow(BASE, i);
    out.push(Math.floor(r / p)); r = r % p;
  }
  return out;
}

/* the top of a straight inside a rank bitmask, or 0.
   THE WHEEL: an ace also plays as the 1 below the deuce, so A-2-3-4-5
   is a straight to the FIVE — the lowest one there is. Lighting bit 1
   off bit 14 is the whole trick, and it is why an ace-low straight can
   never outrank an ace-high one. */
function straightHigh(m){
  if (m & (1 << 14)) m |= (1 << 1);
  for (let hi = 14; hi >= 5; hi--)
    if (((m >> (hi - 4)) & 0x1F) === 0x1F) return hi;
  return 0;
}

function score(cards){
  const n = cards.length;
  const cnt = new Array(15).fill(0);
  const suited = [[], [], [], []];
  let mask = 0;
  for (let i = 0; i < n; i++){
    const c = cards[i], r = hiOf(c), s = suitOf(c);
    cnt[r]++; suited[s].push(r); mask |= (1 << r);
  }

  /* a flush needs five of one suit, and with seven cards only one suit
     can ever have them — so this loop finds at most one */
  let fs = -1;
  for (let s = 0; s < 4; s++) if (suited[s].length >= 5) fs = s;
  if (fs >= 0){
    let fm = 0;
    for (let i = 0; i < suited[fs].length; i++) fm |= (1 << suited[fs][i]);
    const sf = straightHigh(fm);
    if (sf) return packed(CAT.SFLUSH, [sf, 0, 0, 0, 0]);
  }

  /* ranks grouped by how many of them there are, each list descending */
  const by = [[], [], [], [], []];
  for (let r = 14; r >= 2; r--) if (cnt[r]) by[cnt[r]].push(r);

  if (by[4].length){
    const q = by[4][0];
    let k = 0;
    for (let r = 14; r >= 2; r--) if (r !== q && cnt[r]){ k = r; break; }
    return packed(CAT.QUADS, [q, k, 0, 0, 0]);
  }
  /* a full house can be trips+trips (seven cards do that) — the higher
     trips is the set, the lower one plays as the pair */
  if (by[3].length >= 2) return packed(CAT.BOAT, [by[3][0], by[3][1], 0, 0, 0]);
  if (by[3].length && by[2].length) return packed(CAT.BOAT, [by[3][0], by[2][0], 0, 0, 0]);

  if (fs >= 0){
    const top = suited[fs].slice().sort((a, b) => b - a).slice(0, 5);
    while (top.length < 5) top.push(0);
    return packed(CAT.FLUSH, top);
  }
  const sh = straightHigh(mask);
  if (sh) return packed(CAT.STRAIGHT, [sh, 0, 0, 0, 0]);

  if (by[3].length){
    const t = by[3][0], ks = [];
    for (let r = 14; r >= 2 && ks.length < 2; r--) if (r !== t && cnt[r]) ks.push(r);
    return packed(CAT.TRIPS, [t, ks[0] | 0, ks[1] | 0, 0, 0]);
  }
  if (by[2].length >= 2){
    const a = by[2][0], b = by[2][1];
    let k = 0;
    for (let r = 14; r >= 2; r--) if (r !== a && r !== b && cnt[r]){ k = r; break; }
    return packed(CAT.TWOPAIR, [a, b, k, 0, 0]);
  }
  if (by[2].length){
    const p = by[2][0], ks = [];
    for (let r = 14; r >= 2 && ks.length < 3; r--) if (r !== p && cnt[r]) ks.push(r);
    return packed(CAT.PAIR, [p, ks[0] | 0, ks[1] | 0, ks[2] | 0, 0]);
  }
  const hs = [];
  for (let r = 14; r >= 2 && hs.length < 5; r--) if (cnt[r]) hs.push(r);
  while (hs.length < 5) hs.push(0);
  return packed(CAT.HIGH, hs);
}

/* WHICH FIVE. Only the felt needs this — the winner's five cards, lit
   up under the seven they came from. Brute force over the 21 subsets,
   which is nothing at this size and cannot disagree with score() about
   the VALUE (the test harness proves max-over-subsets === score(7)). */
function best5(cards){
  const n = cards.length;
  if (n <= 5) return { v: score(cards), cards: cards.slice() };
  let bv = -1, bc = null;
  const idx = [0, 1, 2, 3, 4];
  const pick = [];
  (function walk(start, depth){
    if (depth === 5){
      const v = score(pick);
      if (v > bv){ bv = v; bc = pick.slice(); }
      return;
    }
    for (let i = start; i <= n - (5 - depth); i++){
      pick[depth] = cards[i];
      walk(i + 1, depth + 1);
    }
  })(0, 0);
  void idx;
  return { v: bv, cards: bc };
}

/* is this seat's best five actually the five in the middle? Then they
   are PLAYING THE BOARD and everybody still in shares the pot. Used by
   the machine, and by the felt to say so out loud. */
function playsBoard(hole, board){
  if (!hole || hole.length < 2 || board.length < 5) return false;
  return score(hole.concat(board)) <= score(board);
}

/* ═══════════════════════════════════════════════════════════════════
   THE DEAL — the injectable seam. See the header.
   make(st) -> { holes: [ [c,c] | null, … ], run: [c,c,c,c,c] }
     holes[i] === null   this client was not told that seat's cards
     run                 the five community cards, in the order they
                         will be turned. Fewer than five means the
                         source has not been told them yet.
   NOTHING ELSE in this file may deal a card.
   ═══════════════════════════════════════════════════════════════════ */
const DEALERS = {
  /* (a) THE SHARED SEED — skarta's and rummy's deal, unchanged. Every
     phone shuffles the identical pack out of st.rs, which is why an
     online table agrees without sending a single card. It is also why
     every phone can work out everybody else's hand, which is why this
     source is FREE MODE ONLY. No burn cards: a burn changes nothing
     about a shuffled pack and would only be ceremony in the log. */
  seed: {
    id: 'seed',
    make(st){
      const cards = [];
      for (let f = 0; f < 52; f++) cards.push(f);
      shuffle(st, cards);
      const holes = st.seats.map(s => (s.out ? null : [cards.pop(), cards.pop()]));
      const run = [cards.pop(), cards.pop(), cards.pop(), cards.pop(), cards.pop()];
      return { holes, run };
    }
  },
  /* (b) PER-SEAT DELIVERY — for COINS MODE, once the relay can post a
     seat its own two cards and nobody else's. st.given is whatever
     arrived for THIS hand: { holes:{seatIndex:[c,c]}, run:[…] }. A
     seat we were not told about comes back null and stays face down
     forever on this client, which is exactly right — and it is why a
     showdown here needs a reveal message from the relay before coins
     can ship. Same signature, same everything downstream. */
  private: {
    id: 'private',
    make(st){
      const g = st.given || {};
      const gh = g.holes || {};
      const holes = st.seats.map((s, i) => {
        if (s.out) return null;
        const h = gh[i];
        return (Array.isArray(h) && h.length === 2) ? h.slice() : null;
      });
      const run = Array.isArray(g.run) ? g.run.slice(0, 5) : [];
      return { holes, run };
    }
  }
};
const dealerOf = st => DEALERS[st.deal] || DEALERS.seed;

/* ═══════════════════════════════════════════════════════════════════
   THE TABLE
   opts: { seats, humans, lvl, mode, stack, sb, bb, deal }
     mode   'free'  table chips, and nothing else. The whole game.
            'coins' the same rules over KARTI coins — the settlement
                    lives in js/poker-ui.js behind COINS_MODE_READY,
                    because this file must not know about a wallet.
   ═══════════════════════════════════════════════════════════════════ */
const MIN_SEATS = 2, MAX_SEATS = 8;
const MODES = ['free', 'coins'];
const modeOf = m => (MODES.indexOf(m) >= 0 ? m : 'free');
const STREETS = ['pre', 'flop', 'turn', 'river'];
const SHOWN = [0, 3, 4, 5];            /* community cards up per street */

function deal(opts, seed){
  opts = opts || {};
  const n = Math.max(MIN_SEATS, Math.min(MAX_SEATS, opts.seats | 0 || 2));
  const bb = Math.max(2, opts.bb | 0 || 20);
  const sb = Math.max(1, Math.min(bb - 1, opts.sb | 0 || Math.floor(bb / 2)));
  /* the stack has a FLOOR of twenty big blinds: below that the table is
     not poker, it is a coin toss with extra steps */
  const stack = Math.max(bb * 20, opts.stack | 0 || bb * 50);
  const st = {
    v: 1, n, mode: modeOf(opts.mode),
    deal: (opts.deal === 'private') ? 'private' : 'seed',
    given: opts.given || null,          /* privateDeal's inbox         */
    sb, bb, stack,
    rs: seed | 0,
    seats: [], button: 0, handNo: 1,
    street: 0, board: [], run: [],
    betToMatch: 0, minRaiseTo: 0, lastRaise: 0,
    turn: 0, phase: 'bet',
    book: [],                           /* one row per finished hand   */
    show: null,                         /* the last showdown, for the felt */
    done: null
  };
  const humans = Math.max(1, Math.min(n, opts.humans | 0 || 1));
  for (let i = 0; i < n; i++)
    st.seats.push({
      name: i < humans ? (humans === 1 ? 'You' : 'Player ' + (i + 1)) : 'MAKNA ' + (i + 1 - humans),
      own:  i < humans ? (i === 0 ? 'me' : 'hot') : 'ai',
      lvl:  opts.lvl | 0 || 2,
      stack, bet: 0, committed: 0,
      hole: [], folded: false, allin: false,
      acted: false, mayRaise: true,
      out: false, gone: false
    });
  dealHand(st);
  return st;
}

/* seats with chips and not walked out — the ones a hand is dealt to */
function seated(st){
  const out = [];
  for (let i = 0; i < st.n; i++)
    if (!st.seats[i].gone && st.seats[i].stack > 0) out.push(i);
  return out;
}
/* seats in THIS hand and not folded */
function inHand(st){
  const out = [];
  for (let i = 0; i < st.n; i++){
    const s = st.seats[i];
    if (!s.out && !s.folded) out.push(i);
  }
  return out;
}
function nextSeat(st, from, ok){
  for (let k = 1; k <= st.n; k++){
    const i = (from + k) % st.n;
    if (ok(st.seats[i], i)) return i;
  }
  return -1;
}
const canAct = (st, i) => {
  const s = st.seats[i];
  return !s.out && !s.folded && !s.allin && s.stack > 0 &&
         (!s.acted || s.bet < st.betToMatch);
};
function nextAble(st, from){
  const i = nextSeat(st, from, (s, k) => canAct(st, k));
  return i < 0 ? from : i;
}
const potOf = st => st.seats.reduce((a, s) => a + s.committed, 0);
/* every chip in existence at this table: stacks plus what is on the
   felt. It never changes for the life of a match, and the test harness
   asserts exactly that after every single move. */
const chipsOn = st => st.seats.reduce((a, s) => a + s.stack + s.committed, 0);

/* ── the blinds ────────────────────────────────────────────────────
   HEADS-UP IS INVERTED and it is the single most-got-wrong rule in
   the game: with two players the BUTTON posts the small blind and
   acts FIRST before the flop, then acts LAST on every street after
   it. With three or more the button posts nothing, the seat to its
   left posts the small and the next the big.
   Either way the first seat to act preflop is the one after the BIG
   blind — which, heads-up, is the button itself. One rule, both
   table sizes, no special case downstream. ── */
function blinds(st){
  const live = seated(st);
  if (live.length === 2){
    const bbS = nextSeat(st, st.button, (s, i) => live.indexOf(i) >= 0);
    return { sb: st.button, bb: bbS };
  }
  const sbS = nextSeat(st, st.button, (s, i) => live.indexOf(i) >= 0);
  const bbS = nextSeat(st, sbS, (s, i) => live.indexOf(i) >= 0);
  return { sb: sbS, bb: bbS };
}
function put(s, a){
  a = Math.min(a, s.stack);
  s.stack -= a; s.bet += a; s.committed += a;
  if (s.stack <= 0){ s.stack = 0; s.allin = true; }
  return a;
}

function dealHand(st){
  const live = seated(st);
  st.seats.forEach((s, i) => {
    s.bet = 0; s.committed = 0; s.hole = [];
    s.folded = false; s.allin = false;
    s.acted = false; s.mayRaise = true;
    s.out = live.indexOf(i) < 0;      /* no chips, or walked out */
  });
  if (live.length < 2){
    st.done = { kind: 'table', left: live };
    st.phase = 'done';
    return;
  }
  /* the button must sit on somebody who is actually in the hand */
  if (st.seats[st.button].out)
    st.button = nextSeat(st, st.button, (s, i) => live.indexOf(i) >= 0);

  const got = dealerOf(st).make(st);
  st.seats.forEach((s, i) => {
    const h = got.holes[i];
    s.hole = (Array.isArray(h) && h.length === 2) ? h.slice() : [];
  });
  st.run = got.run.slice();
  st.board = [];
  st.street = 0;
  st.show = null;

  const b = blinds(st);
  put(st.seats[b.sb], st.sb);
  put(st.seats[b.bb], st.bb);
  /* the blinds are POSTED, not acted: the big blind still has its
     option to raise when the action comes back round, and that is what
     leaving acted=false buys. */
  st.betToMatch = st.bb;
  st.lastRaise = st.bb;
  st.minRaiseTo = st.bb * 2;
  st.blindSB = b.sb; st.blindBB = b.bb;
  st.phase = 'bet';
  st.turn = nextAble(st, b.bb);
}

/* ═══════════════════════════════════════════════════════════════════
   TURN ORDER — seat -1 is the table itself (turning a card, settling a
   pot, dealing the next hand), exactly klabb's and rummy's convention.
   ═══════════════════════════════════════════════════════════════════ */
function roundClosed(st){
  if (inHand(st).length <= 1) return true;
  for (let i = 0; i < st.n; i++) if (canAct(st, i)) return false;
  return true;
}
function turn(st){
  if (st.done) return -2;
  if (st.phase === 'handover') return -1;
  if (st.phase !== 'bet') return -1;
  if (roundClosed(st)) return -1;
  return st.turn;
}

/* WHAT THIS SEAT MAY DO. The amounts a bet may take are a RANGE, not a
   list, so the discrete moves are here (which is what the machine
   chooses between and what a test enumerates) and betRange() below is
   the range the thumb slides over. check() is the only authority. */
function betRange(st, seat){
  const s = st.seats[seat];
  if (!s || turn(st) !== seat) return { can: false, min: 0, max: 0 };
  if (!s.mayRaise) return { can: false, min: 0, max: 0 };
  const max = s.bet + s.stack;
  if (max <= st.betToMatch) return { can: false, min: 0, max: 0 };
  /* the minimum is a full raise, unless the whole stack is short of
     one — then the only legal size is the whole stack */
  const min = Math.min(st.minRaiseTo, max);
  return { can: true, min, max, allin: max };
}
function legal(st, seat){
  if (st.done) return [];
  if (seat === -1){
    if (st.phase === 'handover') return [{ t: 'next' }];
    if (st.phase === 'bet' && roundClosed(st)) return [{ t: 'street' }];
    return [];
  }
  if (turn(st) !== seat) return [];
  const s = st.seats[seat];
  const out = [{ t: 'fold' }];
  if (s.bet === st.betToMatch) out.push({ t: 'check' });
  else out.push({ t: 'call' });
  const r = betRange(st, seat);
  if (r.can){
    out.push({ t: 'bet', a: r.min });
    if (r.max > r.min) out.push({ t: 'bet', a: r.max });
  }
  return out;
}

/* THE gate. Every move — thumb, machine, wire — is measured here. */
function check(st, mv, seat){
  if (!mv || st.done) return false;
  /* QUIT never waits for a turn: a player walks out whenever they walk
     out. Deliberately commutative — it touches no card, no pot and
     never the RNG, so a quit racing somebody's turn lands on the same
     state whichever order the two arrive in. */
  if (mv.t === 'quit')
    return seat >= 0 && seat < st.n && !!st.seats[seat] && !st.seats[seat].gone;
  if (turn(st) !== seat) return false;
  if (seat === -1)
    return (mv.t === 'next' && st.phase === 'handover') ||
           (mv.t === 'street' && st.phase === 'bet' && roundClosed(st));
  const s = st.seats[seat];
  if (!s || s.out || s.folded || s.allin) return false;
  if (mv.t === 'fold') return true;
  if (mv.t === 'check') return s.bet === st.betToMatch;
  if (mv.t === 'call')  return s.bet < st.betToMatch;
  if (mv.t === 'bet'){
    const r = betRange(st, seat);
    if (!r.can) return false;
    const a = mv.a | 0;
    if (a > r.max) return false;
    /* a raise must be a full raise — the ONE exception being a seat
       whose whole stack is short of one, which may still shove it */
    if (a < r.min) return false;
    return a > st.betToMatch;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   APPLY — deterministic; the log replays through here.
   ═══════════════════════════════════════════════════════════════════ */
function apply(st, mv){
  const seat = mv.seat;
  if (seat === -1){
    if (mv.t === 'street') street(st);
    else if (mv.t === 'next') nextHand(st);
    return;
  }
  const s = st.seats[seat];
  if (mv.t === 'quit'){
    if (s.gone) return;                              /* idempotent */
    s.gone = true;
    /* a walk-out mid-hand folds the hand it was holding: the chips
       already in the pot stay in the pot, which is exactly what
       happens when somebody stands up at a real table */
    if (!s.out && !s.folded){
      s.folded = true; s.acted = true;
      if (st.phase === 'bet' && st.turn === seat) st.turn = nextAble(st, seat);
    }
    if (seated(st).length < 2 && !st.done){
      st.done = { kind: 'table', left: seated(st) };
      st.phase = 'done';
    }
    return;
  }
  if (mv.t === 'fold'){
    s.folded = true; s.acted = true;
    st.turn = nextAble(st, seat);
    return;
  }
  if (mv.t === 'check'){
    s.acted = true;
    st.turn = nextAble(st, seat);
    return;
  }
  if (mv.t === 'call'){
    put(s, st.betToMatch - s.bet);
    s.acted = true;
    st.turn = nextAble(st, seat);
    return;
  }
  if (mv.t === 'bet'){
    const a = mv.a | 0;
    put(s, a - s.bet);
    /* A FULL RAISE REOPENS THE ACTION. An all-in for LESS than a full
       raise does NOT — the seats that have already acted owe the extra
       chips but may only call or fold, which is what mayRaise=false
       says. Get this backwards and a short shove hands the table a
       free re-raise it never earned. */
    const full = s.bet >= st.minRaiseTo;
    const inc = s.bet - st.betToMatch;
    st.betToMatch = s.bet;
    if (full){
      st.lastRaise = inc;
      st.minRaiseTo = s.bet + inc;
      for (let i = 0; i < st.n; i++){
        const o = st.seats[i];
        if (i === seat || o.out || o.folded || o.allin) continue;
        o.acted = false; o.mayRaise = true;
      }
    } else {
      for (let i = 0; i < st.n; i++){
        const o = st.seats[i];
        if (i === seat || o.out || o.folded || o.allin) continue;
        if (o.acted){ o.acted = false; o.mayRaise = false; }
      }
    }
    s.acted = true;
    st.turn = nextAble(st, seat);
    return;
  }
}

/* the table's own beat: turn the next card, or settle. The bets on the
   felt do NOT move into a pot variable — the pot IS the sum of what
   everybody has committed, read fresh every time, so there is exactly
   one number and it cannot drift from the chips. */
function street(st){
  st.seats.forEach(s => { s.bet = 0; s.acted = false; s.mayRaise = true; });
  st.betToMatch = 0;
  st.lastRaise = st.bb;
  st.minRaiseTo = st.bb;
  const live = inHand(st);
  if (live.length <= 1 || st.street >= 3){ settle(st); return; }
  st.street++;
  st.board = st.run.slice(0, Math.min(SHOWN[st.street], st.run.length));
  st.turn = nextAble(st, st.button);
  st.phase = 'bet';
}

/* ═══════════════════════════════════════════════════════════════════
   THE POTS — the classic poker bug, written out once, carefully.

   Nothing here reads a running total. It reads what each seat has PUT
   IN over the whole hand and slices the money into LAYERS at every
   distinct commitment level. A seat pays into a layer only up to what
   it actually put in, and contests a layer only if it reached that
   level AND did not fold.

     A all-in 20 · B all-in 60 · C bets 200 · D calls 200
       layer 20   4 x 20  =  80   contested by A B C D
       layer 60   3 x 40  = 120   contested by   B C D
       layer 200  2 x 140 = 280   contested by     C D
                            ---
                            480 = 20 + 60 + 200 + 200   exactly

   Because every seat's committed is sliced exactly once, the layers
   always add up to the money on the table — chip conservation is
   arithmetic here, not a hope. The tests assert it hand after hand.
   ═══════════════════════════════════════════════════════════════════ */
function pots(st){
  const levels = [];
  for (let i = 0; i < st.n; i++){
    const c = st.seats[i].committed;
    if (c > 0 && levels.indexOf(c) < 0) levels.push(c);
  }
  levels.sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (let L = 0; L < levels.length; L++){
    const lvl = levels[L];
    let amount = 0;
    const elig = [];
    for (let i = 0; i < st.n; i++){
      const s = st.seats[i];
      const c = Math.min(s.committed, lvl);
      if (c > prev) amount += c - prev;
      if (s.committed >= lvl && !s.folded) elig.push(i);
    }
    if (amount > 0){
      /* A LAYER NOBODY LIVE PAID INTO can only happen when the seat
         that put the most in folded it. Those chips are not a pot of
         their own — they belong to the layer under them, where there
         is somebody to win them. Folding it downwards keeps the sum
         exact; dropping it would destroy chips. */
      if (!elig.length && out.length) out[out.length - 1].amount += amount;
      else out.push({ amount, elig });
    }
    prev = lvl;
  }
  return out;
}

/* ODD CHIPS. A pot that will not divide goes round from the button: the
   first seat to its left takes the extra. Deterministic, house rule,
   and the same on every phone — never a random winner. */
function oddOrder(st, seats){
  const out = [];
  for (let k = 1; k <= st.n; k++){
    const i = (st.button + k) % st.n;
    if (seats.indexOf(i) >= 0) out.push(i);
  }
  return out;
}

function settle(st){
  const live = inHand(st);
  const showdown = live.length > 1;
  /* the board runs out even when everybody is all-in, so by the time
     settle() is reached the five are already turned — except when the
     hand ended early on a fold, and then nobody's cards are shown */
  if (showdown) st.board = st.run.slice(0, Math.min(5, st.run.length));

  /* every live seat's hand, once. A seat this client was never dealt
     (privateDeal, no reveal yet) scores -1 and cannot win a pot — see
     the header: coins mode needs a reveal message before it ships. */
  const sc = st.seats.map((s, i) => {
    if (live.indexOf(i) < 0) return -1;
    if (!showdown) return 0;
    if (s.hole.length !== 2 || st.board.length < 5) return -1;
    return score(s.hole.concat(st.board));
  });

  const list = pots(st);
  const awards = [];
  for (let p = 0; p < list.length; p++){
    const pot = list[p];
    let win = pot.elig.slice();
    if (win.length > 1){
      let top = -1;
      for (const i of win) if (sc[i] > top) top = sc[i];
      win = win.filter(i => sc[i] === top);
    }
    if (!win.length) win = pot.elig.slice();          /* cannot happen; safe */
    const each = Math.floor(pot.amount / win.length);
    let odd = pot.amount - each * win.length;
    const order = oddOrder(st, win);
    const take = {};
    order.forEach(i => { take[i] = each + (odd-- > 0 ? 1 : 0); });
    order.forEach(i => { st.seats[i].stack += take[i]; });
    awards.push({ amount: pot.amount, elig: pot.elig.slice(), winners: order.slice(), take });
  }

  st.show = {
    board: st.board.slice(),
    showdown,
    /* whose cards go face up: at a showdown everybody still in, and on
       a fold-out nobody — a pot won without a call is won without
       showing, which is half the game */
    reveal: showdown ? live.slice() : [],
    scores: sc,
    pots: awards
  };
  const won = {};
  awards.forEach(a => a.winners.forEach(i => { won[i] = (won[i] | 0) + a.take[i]; }));
  st.book.push({
    hand: st.handNo, pot: potOf(st), showdown,
    winners: Object.keys(won).map(Number),
    won
  });
  /* THE CHIPS LEAVE THE TABLE ONLY ONCE. The pot IS the committed
     money — it was never copied into a second variable — so the moment
     it has been paid into the winners' stacks the commitments are
     cleared. Forgetting this line is how a table quietly mints chips:
     every hand the pot would be counted both as money on the felt and
     as money in a stack, and the total would climb hand after hand.
     The tests assert the total is constant, which is what caught it. */
  st.seats.forEach(s => { s.committed = 0; s.bet = 0; });
  st.phase = 'handover';
}

function nextHand(st){
  /* the busted stand up before the button moves, so it never lands on
     an empty chair */
  st.seats.forEach(s => { if (s.stack <= 0) s.out = true; });
  const live = seated(st);
  if (live.length < 2){
    st.done = { kind: 'table', left: live };
    st.phase = 'done';
    return;
  }
  st.button = nextSeat(st, st.button, (s, i) => live.indexOf(i) >= 0);
  st.handNo++;
  dealHand(st);
}

/* ═══════════════════════════════════════════════════════════════════
   THE TABLE'S TALLY — read straight off the book, never stored twice,
   so every phone derives the identical scoreboard from the identical
   log and a reload rebuilds it from the autosave.
   ═══════════════════════════════════════════════════════════════════ */
function tally(st){
  const t = st.seats.map(s => ({ won: 0, chips: s.stack, best: 0, streak: 0 }));
  let run = -1, len = 0;
  st.book.forEach(row => {
    (row.winners || []).forEach(w => {
      t[w].won++;
      if ((row.won[w] | 0) > t[w].best) t[w].best = row.won[w] | 0;
    });
    const solo = (row.winners || []).length === 1 ? row.winners[0] : -1;
    if (solo >= 0 && solo === run) len++; else { run = solo; len = solo >= 0 ? 1 : 0; }
  });
  st.seats.forEach((s, i) => { t[i].streak = (i === run) ? len : 0; });
  return t;
}

/* ═══════════════════════════════════════════════════════════════════
   OVER — the verdict, read relative to the local player. A hand is not
   an ending; the TABLE ending is. It ends when one seat has all the
   chips, or when the local player has none.
   ═══════════════════════════════════════════════════════════════════ */
function meSeat(st){
  let i = st.seats.findIndex(s => s.own === 'me' || s.own === 'hot');
  return i < 0 ? 0 : i;
}
function over(st){
  if (!st.done) return null;
  const me = meSeat(st);
  const left = st.done.left || seated(st);
  const iWon = left.length === 1 && left[0] === me;
  const hands = st.book.length;
  const tone = iWon ? 'win' : (left.indexOf(me) >= 0 ? 'draw' : 'lose');
  const who = left.length === 1 ? st.seats[left[0]].name : '';
  return {
    tone,
    head: iWon ? 'You broke the table'
        : tone === 'lose' ? 'You are out of chips'
        : 'The table breaks up',
    why: hands + (hands === 1 ? ' hand' : ' hands') + ' played. ' +
         (left.length === 1
           ? who + ' finished with every chip on the table.'
           : 'Not enough players left with chips to deal another hand.'),
    quip: iWon ? 'Nobody remembers the hands you folded.'
        : tone === 'lose' ? 'The chips were only ever borrowed.'
        : 'A table only ends one way, and this was it.',
    left
  };
}

function note(st){
  if (st.done) return '';
  const p = potOf(st);
  return STREETS[st.street].toUpperCase() + ' · pot ' + p +
         (st.book.length ? ' · hand ' + st.handNo : '');
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — one brain, three sharpnesses, and NOT ONE CALL TO
   Math.random. Where a person would be unpredictable the machine
   hashes the position instead: same table, same seat, same street,
   same decision, on every phone. That is what makes an AI move
   replayable at all.

     lvl 1  Gentle    calls too much, raises almost never
     lvl 2  Normal    plays pot odds, raises a good hand
     lvl 3  Ruthless  plays position, punishes weakness, bluffs

   The measure is one number, strength() in 0..1 — before the flop a
   Chen-style read of the two cards, after it the made hand plus the
   draws — and every decision is that number against the price.
   ═══════════════════════════════════════════════════════════════════ */
function hash32(list){
  let h = 2166136261;
  for (let i = 0; i < list.length; i++){
    h ^= (list[i] | 0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/* the machine's "coin", which is not a coin: a pure function of the
   position, in 0..1 */
function jitter(st, seat, salt){
  const s = st.seats[seat];
  return (hash32([st.handNo, seat, st.street, salt | 0,
                  s.hole[0] | 0, s.hole[1] | 0, st.board.length,
                  st.betToMatch, potOf(st)]) % 1000) / 1000;
}

/* before the flop: Bill Chen's arithmetic, normalised. High card value,
   doubled for a pair, plus two for suited, minus the gap. */
function preflopStrength(hole){
  if (!hole || hole.length !== 2) return 0;
  const a = Math.max(hiOf(hole[0]), hiOf(hole[1]));
  const b = Math.min(hiOf(hole[0]), hiOf(hole[1]));
  const hv = a === 14 ? 10 : a === 13 ? 8 : a === 12 ? 7 : a === 11 ? 6 : a / 2;
  let v;
  if (a === b) v = Math.max(5, hv * 2);
  else {
    v = hv;
    if (suitOf(hole[0]) === suitOf(hole[1])) v += 2;
    const gap = a - b - 1;
    v -= gap >= 4 ? 5 : gap === 3 ? 4 : gap;
    if (gap <= 1 && a < 12) v += 1;
  }
  return Math.max(0, Math.min(1, (v + 2) / 22));
}
/* after it: the made hand, the board it is standing on, and the draws */
function postflopStrength(hole, board){
  if (!hole || hole.length !== 2 || !board.length) return 0;
  const all = hole.concat(board);
  const mine = score(all);
  const cat = catOf(mine);
  const BAND = [0.10, 0.30, 0.50, 0.66, 0.76, 0.84, 0.92, 0.97, 0.995];
  let v = BAND[cat];
  /* the kicker inside the band, so ace-high beats seven-high */
  v += (kicksOf(mine)[0] / 14) * 0.04;
  /* PLAYING THE BOARD is not a hand: if the five in the middle already
     make what you have, everybody at the table has it too */
  if (board.length >= 5 && mine <= score(board)) v = Math.min(v, 0.22);
  /* draws, but only while there are cards to come */
  if (board.length < 5){
    const suits = [0, 0, 0, 0];
    let mask = 0;
    all.forEach(c => { suits[suitOf(c)]++; mask |= (1 << hiOf(c)); });
    if (mask & (1 << 14)) mask |= 2;
    if (Math.max.apply(null, suits) === 4) v += 0.14;      /* four to a flush */
    for (let hi = 14; hi >= 5; hi--){
      let miss = 0;
      for (let k = 0; k < 5; k++) if (!((mask >> (hi - 4 + k)) & 1)) miss++;
      if (miss === 1){ v += 0.09; break; }                 /* one card off a straight */
    }
  }
  return Math.max(0, Math.min(1, v));
}
function strength(st, seat){
  const s = st.seats[seat];
  return st.street === 0 ? preflopStrength(s.hole)
                         : postflopStrength(s.hole, st.board);
}

function think(st, seat, lvl){
  lvl = Math.max(1, Math.min(3, lvl || 2));
  const s = st.seats[seat];
  if (turn(st) !== seat) return null;
  const pot = potOf(st);
  const toCall = Math.max(0, st.betToMatch - s.bet);
  const r = betRange(st, seat);
  const v = strength(st, seat);
  const j = jitter(st, seat, 1);
  /* how loose the machine is with a marginal hand */
  const slack = lvl === 1 ? 0.72 : lvl === 2 ? 1.0 : 1.16;
  const bluff = lvl === 1 ? 0 : lvl === 2 ? 0.07 : 0.16;

  const raiseTo = frac => {
    if (!r.can) return null;
    const want = Math.round(st.betToMatch + Math.max(st.bb, frac * (pot + toCall)));
    const a = Math.max(r.min, Math.min(r.max, want));
    return { t: 'bet', a };
  };

  /* NOBODY HAS BET. Check it down, or take a stab at it. */
  if (toCall === 0){
    if (v > 0.80 && r.can) return raiseTo(0.75);
    if (v > 0.62 && r.can && j < 0.75) return raiseTo(0.55);
    if (r.can && j < bluff && v < 0.35) return raiseTo(0.5);   /* the stab */
    return { t: 'check' };
  }

  /* THERE IS A PRICE. The equity the call needs, and whether the hand
     is worth it — pot odds, which is the only arithmetic in poker
     that is not optional. */
  const need = toCall / (pot + toCall);
  const worth = v * slack;
  /* all-in for the last chips with anything decent rather than
     folding into a stack that is already mostly in the pot */
  const pot_committed = s.committed / (s.committed + s.stack || 1);

  if (worth > 0.86 && r.can && j < 0.85) return raiseTo(0.8);
  if (worth > 0.70 && r.can && j < 0.45) return raiseTo(0.6);
  if (worth >= need) return { t: 'call' };
  if (pot_committed > 0.55 && worth > need * 0.75) return { t: 'call' };
  if (r.can && j < bluff * 0.5 && st.street >= 2) return raiseTo(0.7);   /* the bluff */
  /* a free look is never folded */
  if (toCall === 0) return { t: 'check' };
  return { t: 'fold' };
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — a move as flat byte fields, for js/mp.js's generic codec.
   Every field on that wire is 0..255 and a value over it is REFUSED,
   not truncated — so a bet, which is a chip count and routinely runs
   into the thousands, travels as TWO bytes (h = high, l = low) and the
   far side multiplies them back. 65,535 is the ceiling, which is why
   deal() will not build a table whose chips could pass it.

   ONLINE IS NOT OPEN YET and js/poker-ui.js says so at the door: the
   shared seed makes every hole card readable by every client, which is
   a cheat vector even for table chips. The codec is written and
   tested now because it is part of the deal seam's story, not because
   anything calls it today.
   ═══════════════════════════════════════════════════════════════════ */
const WIRE_FIELDS = ['h', 'l'];
const byteOK = v => v >= 0 && v <= 255;

function encWire(mv){
  if (!mv) return null;
  if (mv.t === 'fold' || mv.t === 'check' || mv.t === 'call' || mv.t === 'quit')
    return { t: mv.t };
  if (mv.t === 'bet'){
    const a = mv.a | 0;
    if (a < 0 || a > 65535) return null;
    const w = { t: 'bet', h: (a >> 8) & 255, l: a & 255 };
    return (byteOK(w.h) && byteOK(w.l)) ? w : null;
  }
  return null;                                     /* table beats never travel */
}
function decWire(w){
  if (!w || typeof w.t !== 'string') return null;
  if (w.t === 'fold' || w.t === 'check' || w.t === 'call' || w.t === 'quit')
    return { t: w.t };
  if (w.t === 'bet'){
    if (w.h === undefined && w.l === undefined) return null;
    return { t: 'bet', a: ((w.h | 0) << 8) + (w.l | 0) };
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — js/poker-ui.js and the test harness both read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_POKER = root.KARTI_POKER || {};
root.KARTI_POKER.engine = {
  suitOf, rankOf, hiOf,
  CAT, CAT_MAX, score, best5, catOf, kicksOf, straightHigh, playsBoard,
  DEALERS, dealerOf,
  MIN_SEATS, MAX_SEATS, MODES, modeOf, STREETS, SHOWN,
  deal, legal, betRange, check, apply, turn, over, note, tally,
  seated, inHand, potOf, chipsOn, pots, blinds, roundClosed, meSeat,
  strength, preflopStrength, postflopStrength, think,
  encWire, decWire, WIRE_FIELDS
};

})(typeof window !== 'undefined' ? window : globalThis);
