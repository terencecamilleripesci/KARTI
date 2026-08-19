/* ═══════════════════════════════════════════════════════════════════
   KARTI — blackjack.js
   TWENTY-ONE (21) — the engine. Rules only: no DOM, no clock, and NO
   Math.random anywhere in this file (the one seed pick for a fresh
   local match lives in the UI, exactly as js/poker.js does it). The
   screen half is a separate file; this one follows js/poker.js's shape:
   a match is (opts, seed, log), the whole state is deal() plus a replay
   of the log, and every phone that replays the log lands on the same
   table.

   THIS IS ONE OF TWO MODES OF ONE CARD GAME. The player taps a single
   tile and picks 21 (this file, "blackjack") or 31 (js/tletin.js,
   "wieħed-u-tletin"), the way rummy picks classic vs għaxra. The two
   engines SHARE NOTHING in their rules — a knock has no blackjack
   twin, a split has no 31 twin — so they are two files, but they carry
   a COMMON API SURFACE where it is honest to (see the export block at
   the foot of both):

       deal(opts, seed)      build a match
       legal(st, seat)       the moves a seat may make right now
       check(st, mv, seat)   the one gate — is this move legal
       apply(st, mv)         mutate deterministically (log replays here)
       turn(st)              whose turn (seat, or -1 the dealer/table)
       over(st)              null, or the verdict for the local player
       note / tally          read-outs off the state, stored once

   Distinct where the games genuinely differ: 21 has hit / stand /
   double / split / surrender / insurance and a fixed-policy DEALER;
   31 has draw / discard / knock and lives. A thin honest seam beats a
   fake uniform one.

   ── THE DEAL IS INJECTED. READ THIS BEFORE CHANGING ANYTHING. ──────
     Same story as poker. The relay broadcasts ONE shared seed to every
     seat, so a client that derives the shoe from that seed can derive
     the dealer's HOLE CARD and every future card — fatal the moment
     coins are on it. So the deal is not hard-wired; it is one
     injectable source, DEALERS, with two implementations and one
     interface make(st) -> a shoe object the engine draws from:

       DEALERS.seed     shuffles the whole multi-deck shoe out of st.rs,
                        the way skarta and rummy deal. FREE MODE uses
                        this and it is honest there — nothing is at
                        stake but table chips.
       DEALERS.private  takes cards delivered PER SEAT / PER DRAW by the
                        relay (st.given) and hands them out in order,
                        leaving anything it was not told about as a
                        face-down unknown. For COINS MODE, once the
                        relay can deal privately.

     Everything downstream of make() — the totals, the dealer policy,
     splits, payouts, the wire — is identical between the two. The seam
     is one function and it is here. COINS_MODE_READY (in the UI, and
     the constant re-exported here for the harness) stays false until
     the relay's private per-seat deal is deployed and wired.

   CARDS
     Plain klabb face ids, 0..51: c = suit*13 + rank-1, rank 1=A…13=K.
     A shoe is `decks` copies of that pack. Value: ace 11 (soft) or 1
     (hard), ten/J/Q/K all 10, everything else its pip. Suit is carried
     but never scored — 21 does not care about suit; it is kept only so
     the felt can draw a real card.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ── the cards ───────────────────────────────────────────────────── */
const suitOf = c => (c / 13) | 0;
const rankOf = c => (c % 13) + 1;                 /* 1=A … 13=K       */
/* the HARD pip value: ace counts 1 here, and softness is decided by
   handValue() below by lighting an ace back up to 11 when it fits. */
const pipOf = c => { const r = (c % 13) + 1; return r >= 10 ? 10 : r; };
const isAce = c => (c % 13) === 0;

/* ═══════════════════════════════════════════════════════════════════
   THE TOTAL — the one arithmetic 21 is about, written once.
   handValue(cards) -> { total, soft, bust, blackjack, pairRank }
     total      the best total <= 21 if one exists, else the bust total
     soft       true iff an ace is still counting as 11 (a "soft" hand)
     bust       total > 21
     blackjack  a NATURAL: exactly two cards, an ace and a ten-value.
                A 21 built from three or more cards is NOT a blackjack
                and loses to one — that rule lives right here.
     pairRank   if the hand is exactly two cards of equal RANK, that
                rank (1..13); else 0. Split reads this. Note two tens of
                different rank (say a 10 and a K) are NOT a pair by rank
                — a common house choice; see SPLIT_ANY_TEN below.
   ═══════════════════════════════════════════════════════════════════ */
function handValue(cards){
  let total = 0, aces = 0;
  for (let i = 0; i < cards.length; i++){
    total += pipOf(cards[i]);
    if (isAce(cards[i])) aces++;
  }
  /* every ace was counted as 1 above; promote as many as fit to 11 */
  let soft = false;
  if (aces > 0 && total + 10 <= 21){ total += 10; soft = true; }
  const bust = total > 21;
  const blackjack = cards.length === 2 && total === 21;
  let pairRank = 0;
  if (cards.length === 2 && rankOf(cards[0]) === rankOf(cards[1]))
    pairRank = rankOf(cards[0]);
  return { total, soft, bust, blackjack, pairRank };
}

/* ═══════════════════════════════════════════════════════════════════
   THE SHOE — the injectable seam. See the header.
   A source is make(st) -> { cards:[…], i, size }, and the engine only
   ever draws through draw(shoe): it pops the next card and advances i.
   The CUT CARD lives at cutAt: once i passes it, the shoe is flagged to
   reshuffle at the start of the NEXT round (never mid-round — you
   finish the shoe you started, exactly as a pit does).
   ═══════════════════════════════════════════════════════════════════ */

/* ── seeded randomness — the whole RNG state is st.rs (poker's) ───── */
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

const DEALERS = {
  /* (a) THE SHARED SEED — one multi-deck shoe shuffled out of st.rs.
     Every phone builds the identical shoe, which is why an online table
     agrees on every card without the relay sending one — and exactly
     why this source is FREE MODE ONLY (every phone can read the
     dealer's hole card off its own shoe). No burn card: a burn changes
     nothing about a shuffled shoe. */
  seed: {
    id: 'seed',
    make(st){
      const cards = [];
      for (let d = 0; d < st.decks; d++)
        for (let f = 0; f < 52; f++) cards.push(f);
      shuffle(st, cards);
      return { cards, i: 0, size: cards.length };
    }
  },
  /* (b) PER-SEAT / PER-DRAW DELIVERY — for COINS MODE, once the relay
     can post each card to only the seat entitled to see it. st.given is
     whatever arrived: { cards:[…] } consumed in draw order, and a draw
     past the end of what we were told returns null — a face-down
     unknown this client cannot value, which is exactly right and is why
     coins mode also needs a REVEAL message (the dealer's hole card, and
     any card dealt to a seat this client is not) before it can settle.
     Same signature; nothing downstream changes. */
  private: {
    id: 'private',
    make(st){
      const g = st.given || {};
      const cards = Array.isArray(g.cards) ? g.cards.slice() : [];
      return { cards, i: 0, size: cards.length, partial: true };
    }
  }
};
const dealerOf = st => DEALERS[st.deal] || DEALERS.seed;

/* draw one card off the shoe, or null if a private shoe is exhausted.
   THE ONLY PLACE A CARD LEAVES THE SHOE. Every deal, hit, split card
   and dealer card comes through here, so the count is exact by
   construction and the tests assert it. */
function draw(st){
  const sh = st.shoe;
  if (sh.i >= sh.cards.length) return null;      /* private: unknown  */
  return sh.cards[sh.i++];
}

/* ═══════════════════════════════════════════════════════════════════
   THE TABLE
   opts: {
     seats, humans, lvl,
     mode        'free' (table chips) | 'coins' (UI-gated, see header)
     decks       shoe size, default 6
     pen         PENETRATION 0..1: fraction dealt before the cut card,
                 default 0.75. Below it the count is skewed; a real pit
                 cuts a six-deck shoe around here.
     h17         DEALER HITS SOFT 17. false = stands on all 17 (S17),
                 the player-friendlier and the KARTI default; true =
                 hits soft 17 (H17), the casino's. Worth ~+0.2% to the
                 house — an OPTION, and the harness proves the engine
                 moves the edge the right way when it flips.
     bjPay       BLACKJACK PAYOUT, numerator/denominator on the bet.
                 [3,2] ships. [6,5] is the casino's thumb on the scale
                 — it turns a ~0.5% game into a ~1.9% one on a $10 bet
                 — offered as an option and labelled as what it is.
     das         DOUBLE AFTER SPLIT allowed, default true.
     resplit     MAX HANDS a split may grow to, default 4 (i.e. up to
                 three splits). Split aces are the exception below.
     splitAcesOneCard  after splitting aces each ace gets exactly ONE
                 card and stands, default true. A ten on a split ace is
                 21 but NOT a blackjack (handValue already refuses it).
     resplitAces allow re-splitting aces, default false.
     surrender   LATE surrender allowed (give up half after the dealer
                 checks for blackjack), default true.
     splitAnyTen split any two ten-VALUE cards, not only equal rank,
                 default false (KARTI splits by rank; see pairRank).
     bet         the flat bet each seat posts per round, default 10.
     stack       starting table chips per seat, default bet*100.
   }
   ═══════════════════════════════════════════════════════════════════ */
const MIN_SEATS = 1, MAX_SEATS = 6;   /* players; the dealer is not a seat */
const MODES = ['free', 'coins'];
const modeOf = m => (MODES.indexOf(m) >= 0 ? m : 'free');
const DEALER = -1;                     /* the fixed-policy dealer/table    */

/* the settled outcome of one player hand, as a signed multiple of its
   bet: +1.5 natural (at 3:2), +1 win, 0 push, -0.5 surrender, -1 loss */
const OUT = { BJ: 'bj', WIN: 'win', PUSH: 'push', LOSE: 'lose', SURR: 'surr' };

function clampInt(v, lo, hi, dflt){
  v = (v === undefined || v === null) ? dflt : (v | 0);
  return Math.max(lo, Math.min(hi, v));
}

function deal(opts, seed){
  opts = opts || {};
  const n = clampInt(opts.seats, MIN_SEATS, MAX_SEATS, 1);
  const decks = clampInt(opts.decks, 1, 8, 6);
  const bet = Math.max(1, opts.bet | 0 || 10);
  const stack = Math.max(bet * 4, opts.stack | 0 || bet * 100);
  const st = {
    v: 1, n, mode: modeOf(opts.mode),
    deal: (opts.deal === 'private') ? 'private' : 'seed',
    given: opts.given || null,
    decks,
    pen: (typeof opts.pen === 'number') ? Math.max(0.5, Math.min(0.95, opts.pen)) : 0.75,
    rule: {
      h17:        opts.h17 === true,
      bjPay:      Array.isArray(opts.bjPay) && opts.bjPay.length === 2
                    ? [opts.bjPay[0] | 0, opts.bjPay[1] | 0] : [3, 2],
      das:        opts.das !== false,
      resplit:    clampInt(opts.resplit, 1, 4, 4),
      splitAcesOneCard: opts.splitAcesOneCard !== false,
      resplitAces:      opts.resplitAces === true,
      surrender:  opts.surrender !== false,
      splitAnyTen: opts.splitAnyTen === true
    },
    bet, stack,
    rs: seed | 0,
    shoe: null, cutAt: 0, reshuffle: false,
    seats: [],                         /* players only, 0..n-1             */
    dealer: null,                      /* { cards, hole:bool } the house    */
    turn: DEALER, phase: 'deal',
    round: 0,
    book: [],                          /* one row per finished round        */
    show: null,                        /* the last round's settlement       */
    done: null
  };
  const humans = Math.max(1, Math.min(n, opts.humans | 0 || 1));
  for (let i = 0; i < n; i++)
    st.seats.push({
      name: i < humans ? (humans === 1 ? 'You' : 'Player ' + (i + 1))
                       : 'MAKNA ' + (i + 1 - humans),
      own:  i < humans ? (i === 0 ? 'me' : 'hot') : 'ai',
      lvl:  opts.lvl | 0 || 2,
      stack,
      gone: false,
      hands: [],                       /* one or more (splits) per round    */
      active: 0,                        /* which of hands[] is acting        */
      insurance: 0, tookIns: false, insOffered: false
    });
  buildShoe(st);
  startRound(st);
  return st;
}

function buildShoe(st){
  st.shoe = dealerOf(st).make(st);
  st.cutAt = Math.floor(st.shoe.size * st.pen);
  st.reshuffle = false;
}

/* every chip in existence at this table — starting stacks are constant,
   and every bet is a loan from a stack that comes back at settlement, so
   this number never changes for the life of the match. The harness
   asserts exactly that after every move (add back any bets currently on
   the felt). */
function chipsOn(st){
  let total = 0;
  for (const s of st.seats){
    total += s.stack;
    total += s.insurance;                          /* insurance on the felt */
    for (const h of s.hands) total += h.bet;       /* main bet on the felt   */
  }
  return total;
}

/* seats that can still post a bet (have chips, not walked out) */
function seated(st){
  const out = [];
  for (let i = 0; i < st.n; i++)
    if (!st.seats[i].gone && st.seats[i].stack >= st.bet) out.push(i);
  return out;
}

/* ── a fresh player hand ────────────────────────────────────────── */
function newHand(bet){
  return {
    cards: [], bet, done: false, bust: false,
    doubled: false, surrendered: false,
    fromSplit: false, splitAce: false,
    stood: false, out: null, ret: 0
  };
}

/* ═══════════════════════════════════════════════════════════════════
   START A ROUND — post one flat bet per seat, deal two cards each and
   two to the dealer (one down), then offer insurance if the up-card is
   an ace. The order is the pit's: a card to every player, one to the
   dealer, a second to every player, the dealer's hole card.
   ═══════════════════════════════════════════════════════════════════ */
function startRound(st){
  if (st.reshuffle) buildShoe(st);
  const live = seated(st);
  if (live.length < 1){
    st.done = { kind: 'broke' };
    st.phase = 'done';
    return;
  }
  st.round++;
  st.show = null;
  st.dealer = { cards: [], hole: true };

  st.seats.forEach((s, i) => {
    s.hands = []; s.active = 0;
    s.insurance = 0; s.tookIns = false; s.insOffered = false;
    if (live.indexOf(i) >= 0){
      const h = newHand(st.bet);
      s.stack -= st.bet;                 /* the bet leaves the stack now */
      s.hands.push(h);
    }
  });

  /* first card to each active seat */
  for (let i = 0; i < st.n; i++)
    if (st.seats[i].hands.length) st.seats[i].hands[0].cards.push(draw(st));
  st.dealer.cards.push(draw(st));        /* the UP card                  */
  for (let i = 0; i < st.n; i++)
    if (st.seats[i].hands.length) st.seats[i].hands[0].cards.push(draw(st));
  st.dealer.cards.push(draw(st));        /* the HOLE card, face down     */

  /* INSURANCE: offered only when the up-card is an ace, before anyone
     plays. If the up-card is a ten-value the dealer PEEKS for blackjack
     silently (no even-money offer in this ruleset) — handled at reveal. */
  st.dealer.upAce = isAce(st.dealer.cards[0]);
  if (st.dealer.upAce){
    st.phase = 'insurance';
    st.turn = firstUndecidedIns(st);
    if (st.turn === DEALER){ closeInsurance(st); }
  } else {
    beginPlay(st);
  }
}

/* first seat that still owes an insurance decision, or DEALER if none */
function firstUndecidedIns(st){
  for (let i = 0; i < st.n; i++){
    const s = st.seats[i];
    if (s.hands.length && !s.insOffered) return i;
  }
  return DEALER;
}

/* once every seat has answered insurance, check the hole card */
function closeInsurance(st){
  const hv = handValue(st.dealer.cards);
  const dealerBJ = hv.blackjack;
  /* pay or take insurance: it pays 2:1, and it is a SEPARATE bet from
     the hand. A seat that took insurance and the dealer has blackjack
     gets 2x its insurance back (its stake + 2x) — net +2x its stake —
     while it still loses the main bet (unless it too has a natural). */
  st.seats.forEach(s => {
    if (!s.hands.length) return;
    if (s.tookIns){
      if (dealerBJ) s.stack += s.insurance * 3;   /* stake back + 2:1 */
      /* else the insurance stake is simply lost (already removed) */
    }
    /* the insurance bet is now resolved — it leaves the felt, so it must
       stop being counted by chipsOn() (win paid it into the stack, loss
       forfeited it). Clearing it here keeps the total exact. */
    s.insurance = 0;
  });
  if (dealerBJ){
    st.dealer.hole = false;
    settle(st);                                    /* round ends now   */
  } else {
    beginPlay(st);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   PEEK. When the up-card is a ten-value the dealer checks the hole for
   an ace (silent, no insurance step). A dealer blackjack ends the round
   before anyone acts — a player with a natural pushes, everyone else
   loses their bet. When the up-card is anything 2..9, no peek is
   possible and play begins normally.
   ═══════════════════════════════════════════════════════════════════ */
function beginPlay(st){
  const up = st.dealer.cards[0];
  const upTen = pipOf(up) === 10 && !isAce(up);
  if (upTen && handValue(st.dealer.cards).blackjack){
    st.dealer.hole = false;
    settle(st);
    return;
  }
  st.phase = 'play';
  st.turn = firstToAct(st);
  if (st.turn === DEALER) dealerPlay(st);
}

/* the first seat with a hand still needing a decision */
function firstToAct(st){
  for (let i = 0; i < st.n; i++){
    const s = st.seats[i];
    for (let h = 0; h < s.hands.length; h++)
      if (!s.hands[h].done){ s.active = h; return i; }
  }
  return DEALER;
}

/* advance within a seat's split hands, then to the next seat, then the
   dealer. Also auto-resolves any hand that is done the instant it is
   dealt (a 21, a split ace's one card, a bust). */
function advance(st){
  st.turn = firstToAct(st);
  if (st.turn === DEALER && st.phase === 'play') dealerPlay(st);
}

/* the acting hand of the acting seat, or null */
function actingHand(st){
  if (st.turn < 0 || st.turn >= st.n) return null;
  const s = st.seats[st.turn];
  return s.hands[s.active] || null;
}

/* mark a hand finished if it can no longer act */
function closeIfDone(h){
  const hv = handValue(h.cards);
  if (hv.bust){ h.bust = true; h.done = true; }
  else if (hv.total === 21){ h.done = true; h.stood = true; }
  else if (h.splitAce){ h.done = true; h.stood = true; }
  else if (h.doubled){ h.done = true; }
}

/* ═══════════════════════════════════════════════════════════════════
   WHAT A SEAT MAY DO. legal() is the enumerated list (what the machine
   chooses between and what a test walks); check() is the one authority.
   ═══════════════════════════════════════════════════════════════════ */
function canSplit(st, s, h){
  if (h.cards.length !== 2) return false;
  if (s.hands.length >= st.rule.resplit) return false;
  const hv = handValue(h.cards);
  const pair = st.rule.splitAnyTen
    ? (pipOf(h.cards[0]) === pipOf(h.cards[1]))   /* any two tens        */
    : (hv.pairRank > 0);                          /* equal rank          */
  if (!pair) return false;
  /* split aces: allowed once; re-splitting them only if the rule says */
  const acePair = isAce(h.cards[0]) && isAce(h.cards[1]);
  if (acePair && h.fromSplit && !st.rule.resplitAces) return false;
  if (s.stack < h.bet) return false;              /* needs a matching bet */
  return true;
}
function canDouble(st, s, h){
  if (h.cards.length !== 2) return false;
  if (h.splitAce) return false;                   /* one card only        */
  if (h.fromSplit && !st.rule.das) return false;
  if (s.stack < h.bet) return false;
  return true;
}
function canSurrender(st, s, h){
  /* LATE surrender: only on the opening two cards, never after a hit,
     split or double, and never once the dealer has a checked blackjack
     (that ended the round). Not on split hands. */
  if (!st.rule.surrender) return false;
  if (h.cards.length !== 2 || h.fromSplit) return false;
  if (s.hands.length !== 1) return false;
  return true;
}
function legal(st, seat){
  if (st.done) return [];
  if (seat === DEALER){
    if (st.phase === 'settle') return [{ t: 'next' }];
    return [];
  }
  if (turn(st) !== seat) return [];
  const s = st.seats[seat];
  if (st.phase === 'insurance'){
    /* even a seat with no ten-value showing may decline; a natural
       declines automatically at closeInsurance if never asked, but we
       still offer the choice for symmetry */
    return [{ t: 'ins', take: false }, { t: 'ins', take: true }];
  }
  if (st.phase !== 'play') return [];
  const h = s.hands[s.active];
  if (!h || h.done) return [];
  const out = [{ t: 'hit' }, { t: 'stand' }];
  if (canDouble(st, s, h))    out.push({ t: 'double' });
  if (canSplit(st, s, h))     out.push({ t: 'split' });
  if (canSurrender(st, s, h)) out.push({ t: 'surrender' });
  return out;
}

/* THE gate. Every move — thumb, machine, wire — is measured here. */
function check(st, mv, seat){
  if (!mv || st.done) return false;
  if (mv.t === 'quit')
    return seat >= 0 && seat < st.n && !!st.seats[seat] && !st.seats[seat].gone;
  if (seat === DEALER)
    return mv.t === 'next' && st.phase === 'settle';
  if (turn(st) !== seat) return false;
  const s = st.seats[seat];
  if (!s || !s.hands.length) return false;
  if (st.phase === 'insurance') return mv.t === 'ins';
  if (st.phase !== 'play') return false;
  const h = s.hands[s.active];
  if (!h || h.done) return false;
  if (mv.t === 'hit' || mv.t === 'stand') return true;
  if (mv.t === 'double')    return canDouble(st, s, h);
  if (mv.t === 'split')     return canSplit(st, s, h);
  if (mv.t === 'surrender') return canSurrender(st, s, h);
  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   APPLY — deterministic; the log replays through here.
   ═══════════════════════════════════════════════════════════════════ */
function apply(st, mv){
  const seat = mv.seat;
  if (mv.t === 'quit'){
    const s = st.seats[seat];
    if (!s || s.gone) return;                      /* idempotent */
    s.gone = true;
    /* a walk-out forfeits any live hands this round: the bet stays
       lost, exactly as standing up at a real table. Do not touch the
       shoe or the RNG (see poker's quit note). */
    if (s.hands.length){
      s.hands.forEach(h => { if (!h.done){ h.done = true; h.surrendered = false; h.stood = true; } });
    }
    if (st.turn === seat) advance(st);
    if (seated(st).length < 1 && !st.done && st.phase !== 'settle'){
      /* let the current round finish; if nobody can post next round the
         round-end will mark the table done */
    }
    return;
  }
  if (seat === DEALER){
    if (mv.t === 'next') nextRound(st);
    return;
  }
  const s = st.seats[seat];
  if (st.phase === 'insurance' && mv.t === 'ins'){
    s.insOffered = true;
    if (mv.take){
      /* insurance costs half the main bet and pays 2:1 */
      const half = Math.floor(st.bet / 2);
      if (s.stack >= half){ s.stack -= half; s.insurance = half; s.tookIns = true; }
    }
    const nxt = firstUndecidedIns(st);
    st.turn = nxt;
    if (nxt === DEALER) closeInsurance(st);
    return;
  }
  const h = s.hands[s.active];
  if (!h || h.done) return;

  if (mv.t === 'stand'){
    h.stood = true; h.done = true;
    advance(st);
    return;
  }
  if (mv.t === 'surrender'){
    h.surrendered = true; h.done = true;
    advance(st);
    return;
  }
  if (mv.t === 'hit'){
    h.cards.push(draw(st));
    closeIfDone(h);
    if (h.done) advance(st);
    return;
  }
  if (mv.t === 'double'){
    /* match the bet, take exactly one card, and stand */
    s.stack -= h.bet; h.bet *= 2; h.doubled = true;
    h.cards.push(draw(st));
    h.done = true;
    advance(st);
    return;
  }
  if (mv.t === 'split'){
    /* move the second card into a NEW hand and deal each a fresh card.
       Split aces each get one card and stand (unless resplitAces made a
       new ace pair, which is handled next round of firstToAct). */
    const moved = h.cards.pop();
    s.stack -= h.bet;                              /* the matching bet    */
    const nh = newHand(h.bet);
    nh.fromSplit = true; h.fromSplit = true;
    nh.cards.push(moved);
    const ace = isAce(h.cards[0]);
    h.cards.push(draw(st));
    nh.cards.push(draw(st));
    if (ace){
      h.splitAce = true; nh.splitAce = true;
      /* re-split aces produces another pair to act on; otherwise each
         ace-hand is one card and done */
      if (!(st.rule.resplitAces && handValue(h.cards).pairRank === 1)) closeIfDone(h);
      if (!(st.rule.resplitAces && handValue(nh.cards).pairRank === 1)) closeIfDone(nh);
    } else {
      closeIfDone(h); closeIfDone(nh);
    }
    /* insert the new hand right after the current one so splits play
       left-to-right like a real table */
    s.hands.splice(s.active + 1, 0, nh);
    advance(st);
    return;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   THE DEALER — a PURE FIXED-POLICY RULE, not a judging opponent. It
   reveals the hole card and draws by exactly one rule: hit while the
   total is under 17; on 17, hit only a SOFT 17 and only if h17 is on;
   stand otherwise. No choice, no read of the players, the same on every
   phone. If every player already busted or surrendered the dealer does
   NOT draw (there is nothing to beat) — but it still reveals.
   ═══════════════════════════════════════════════════════════════════ */
function dealerPlay(st){
  st.dealer.hole = false;
  st.phase = 'dealer';
  const anyLive = st.seats.some(s =>
    s.hands.some(h => !h.bust && !h.surrendered));
  if (anyLive){
    for (;;){
      const hv = handValue(st.dealer.cards);
      if (hv.total < 17){ st.dealer.cards.push(draw(st)); continue; }
      if (hv.total === 17 && hv.soft && st.rule.h17){ st.dealer.cards.push(draw(st)); continue; }
      break;
    }
  }
  settle(st);
}

/* ═══════════════════════════════════════════════════════════════════
   SETTLE — pay every hand against the dealer. Written once, carefully:
     · a player BUST always loses, even if the dealer busts too (the
       player acted first — that first-to-bust rule is the house edge).
     · a NATURAL beats a dealer 21 made of three+ cards, and pushes only
       another natural. It pays bjPay (3:2).
     · surrender returns half the bet.
     · otherwise higher total wins, equal totals push, dealer bust pays
       every standing hand.
   Every payout returns the ORIGINAL bet plus winnings into the stack,
   so chip conservation is arithmetic: a hand's stack delta is exactly
   ret - bet, and the felt is emptied.
   ═══════════════════════════════════════════════════════════════════ */
function settle(st){
  const dhv = handValue(st.dealer.cards);
  const dealerBJ = dhv.blackjack;
  const dealerBust = dhv.bust;
  const [num, den] = st.rule.bjPay;

  const rows = [];
  st.seats.forEach((s, si) => {
    s.hands.forEach((h, hi) => {
      const phv = handValue(h.cards);
      let ret = 0, outc;
      if (h.surrendered){
        ret = h.bet / 2; outc = OUT.SURR;
      } else if (phv.bust){
        ret = 0; outc = OUT.LOSE;
      } else if (phv.blackjack && !dealerBJ){
        ret = h.bet + h.bet * num / den; outc = OUT.BJ;
      } else if (phv.blackjack && dealerBJ){
        ret = h.bet; outc = OUT.PUSH;
      } else if (dealerBJ){
        ret = 0; outc = OUT.LOSE;              /* player 21 (3-card) loses */
      } else if (dealerBust){
        ret = h.bet * 2; outc = OUT.WIN;
      } else if (phv.total > dhv.total){
        ret = h.bet * 2; outc = OUT.WIN;
      } else if (phv.total === dhv.total){
        ret = h.bet; outc = OUT.PUSH;
      } else {
        ret = 0; outc = OUT.LOSE;
      }
      h.ret = ret; h.out = outc;
      s.stack += ret;                          /* bet + winnings back home */
      rows.push({ seat: si, hand: hi, bet: h.bet, ret, out: outc,
                  total: phv.total, bust: phv.bust, bj: phv.blackjack });
    });
  });

  st.show = {
    dealer: st.dealer.cards.slice(),
    dealerTotal: dhv.total, dealerBust, dealerBJ,
    rows
  };
  st.book.push({
    round: st.round, dealerTotal: dhv.total, dealerBJ, dealerBust,
    rows: rows.map(r => ({ seat: r.seat, out: r.out, bet: r.bet, ret: r.ret }))
  });

  /* the cut card: if we passed it this round, reshuffle before the next */
  if (st.shoe.i >= st.cutAt) st.reshuffle = true;

  st.phase = 'settle';
  st.turn = DEALER;
}

function nextRound(st){
  st.seats.forEach(s => { if (s.stack < st.bet) { /* keeps its chair but sits out */ } });
  const live = seated(st);
  if (live.length < 1){
    st.done = { kind: 'broke' };
    st.phase = 'done';
    return;
  }
  startRound(st);
}

/* ═══════════════════════════════════════════════════════════════════
   TURN — which seat is to act, or DEALER (-1) for the table's own beat
   (revealing, settling, dealing the next round). Mirrors poker's turn().
   ═══════════════════════════════════════════════════════════════════ */
function turn(st){
  if (st.done) return -2;
  if (st.phase === 'settle') return DEALER;
  if (st.phase === 'insurance' || st.phase === 'play') return st.turn;
  return DEALER;
}

/* ═══════════════════════════════════════════════════════════════════
   OVER — the verdict for the local player. A round is not an ending;
   the TABLE ending is. It ends when the local player can no longer post
   a bet, or when everybody has walked out. (A never-ending money faucet
   is not a game; a session ends when your chips do.)
   ═══════════════════════════════════════════════════════════════════ */
function meSeat(st){
  let i = st.seats.findIndex(s => s.own === 'me' || s.own === 'hot');
  return i < 0 ? 0 : i;
}
function over(st){
  if (!st.done) return null;
  const me = meSeat(st);
  const s = st.seats[me];
  const broke = !s || s.stack < st.bet;
  const rounds = st.book.length;
  const tone = broke ? 'lose' : 'draw';
  return {
    tone,
    head: broke ? 'You are out of chips' : 'The table closes',
    why: rounds + (rounds === 1 ? ' round' : ' rounds') + ' played.',
    quip: broke ? 'The house always has more chairs than you have chips.'
                : 'You leave with your stack — that is a win at this table.',
    left: seated(st)
  };
}

function note(st){
  if (st.done) return '';
  return 'ROUND ' + st.round + ' · shoe ' + (st.shoe.size - st.shoe.i) +
         '/' + st.shoe.size + ' left';
}

/* ═══════════════════════════════════════════════════════════════════
   THE TALLY — read straight off the book, stored once, so every phone
   derives the same scoreboard and a reload rebuilds it from the log.
   net = signed chips won across the match (ret - bet per hand).
   ═══════════════════════════════════════════════════════════════════ */
function tally(st){
  const t = st.seats.map(s => ({ chips: s.stack, net: 0, wins: 0, losses: 0, pushes: 0, bjs: 0, rounds: 0 }));
  st.book.forEach(row => {
    const seen = {};
    row.rows.forEach(r => {
      t[r.seat].net += (r.ret - r.bet);
      if (r.out === OUT.WIN || r.out === OUT.BJ) t[r.seat].wins++;
      else if (r.out === OUT.PUSH) t[r.seat].pushes++;
      else t[r.seat].losses++;
      if (r.out === OUT.BJ) t[r.seat].bjs++;
      seen[r.seat] = 1;
    });
    Object.keys(seen).forEach(k => t[k].rounds++);
  });
  return t;
}

/* ═══════════════════════════════════════════════════════════════════
   BASIC STRATEGY — the correct play for the CONFIGURED rules, used by
   (a) the AI for the other seats so the game plays solo, and (b) the
   test harness, which plays it over millions of hands and measures the
   house edge against the published figure. It is a pure function of the
   hand, the dealer up-card and the rule flags — no clock, no random.

   This is the standard 6-deck chart. It reads the player total, the
   dealer up-value (ace = 11), and returns one of hit/stand/double/
   split/surrender; the caller downgrades a move the rules forbid
   (e.g. double when only two cards may be doubled, surrender off).
   ═══════════════════════════════════════════════════════════════════ */
const A = 'hit', S = 'stand', D = 'double', P = 'split', R = 'surrender';
const upVal = c => isAce(c) ? 11 : pipOf(c);      /* dealer up 2..11      */

function basicStrategy(st, s, h){
  const rule = st.rule;
  const up = upVal(st.dealer.cards[0]);
  const hv = handValue(h.cards);
  const canDbl = canDouble(st, s, h);
  const canSpl = canSplit(st, s, h);
  const canSur = canSurrender(st, s, h);
  /* a "double, else X" cell: if the double is illegal (3+ cards, or DAS
     off on a split), play X — and X is NOT always hit. A soft 18 doubled
     against a 6 that cannot double must STAND, not hit; a hard 11 that
     cannot double must hit. Passing the correct fallback per cell is what
     the earlier one-size fallback got wrong (it hit soft 18, bleeding
     ~0.1% to the player). */
  const dblOr = (cond, other) => (cond && canDbl) ? D : other;

  /* PAIRS first (only on the opening two, and only if a split is legal) */
  if (canSpl){
    const r = hv.pairRank === 1 ? 11 : (hv.pairRank >= 10 ? 10 : hv.pairRank);
    switch (r){
      case 11: return P;                                   /* A,A always  */
      case 10: return S;                                   /* T,T never   */
      case 9:  return (up === 7 || up === 10 || up === 11) ? S : P;
      case 8:  return P;                                   /* 8,8 always  */
      case 7:  return up <= 7 ? P : A;
      case 6:  return up <= 6 ? P : A;
      case 5:  return dblOr(up <= 9, A);                   /* play as 10  */
      case 4:  return (up === 5 || up === 6) ? P : A;
      case 3:  return up <= 7 ? P : A;
      case 2:  return up <= 7 ? P : A;
    }
  }

  /* SOFT totals (an ace still counting 11). Double cells fall back to
     STAND for soft 18/19 (double-or-stand) and to HIT for soft 13-17
     (double-or-hit) — the fallback differs by row, which dblOr carries. */
  if (hv.soft && h.cards.length >= 1){
    const t = hv.total;                                    /* 13..21      */
    if (t >= 20) return S;                                 /* A,9 / A,8 stand */
    if (t === 19) return dblOr(rule.h17 && up === 6, S);   /* A,8: H17 doubles vs 6, else stand */
    if (t === 18){
      if (up >= 3 && up <= 6) return dblOr(true, S);       /* double, else STAND */
      if (up === 2 || up === 7 || up === 8) return S;
      return A;                                            /* 9,10,A: hit */
    }
    if (t === 17) return dblOr(up >= 3 && up <= 6, A);     /* double, else HIT */
    if (t === 16 || t === 15) return dblOr(up >= 4 && up <= 6, A);
    if (t === 14 || t === 13) return dblOr(up >= 5 && up <= 6, A);
    return A;                                              /* soft 13+ min */
  }

  /* HARD totals */
  const t = hv.total;
  /* late surrender (only the opening two cards) */
  if (canSur){
    if (t === 16 && (up === 9 || up === 10 || up === 11)) return R;
    if (t === 15 && up === 10) return R;
    if (rule.h17 && t === 15 && up === 11) return R;
    if (rule.h17 && t === 17 && up === 11) return R;
  }
  if (t >= 17) return S;
  if (t >= 13 && t <= 16) return up <= 6 ? S : A;
  if (t === 12) return (up >= 4 && up <= 6) ? S : A;
  if (t === 11) return dblOr(true, A);
  if (t === 10) return dblOr(up <= 9, A);
  if (t === 9)  return dblOr(up >= 3 && up <= 6, A);
  return A;                                                /* 8 or less   */
}

/* the AI: play basic strategy, downgrading any move the rules forbid.
   lvl is accepted for parity with poker's think() but 21 has no
   profitable "level" — a fixed-policy dealer means the only correct
   play is basic strategy, so gentler levels just play looser insurance
   (never take it — insurance is a sucker bet without a count). */
function think(st, seat, lvl){
  void lvl;
  const s = st.seats[seat];
  if (turn(st) !== seat) return null;
  if (st.phase === 'insurance') return { t: 'ins', take: false };
  const h = s.hands[s.active];
  if (!h || h.done) return null;
  let m = basicStrategy(st, s, h);
  if (m === D && !canDouble(st, s, h)) m = A;
  if (m === P && !canSplit(st, s, h)) m = basicHardFallback(st, s, h);
  if (m === R && !canSurrender(st, s, h)) m = basicHardFallback(st, s, h);
  const map = { hit: 'hit', stand: 'stand', double: 'double', split: 'split', surrender: 'surrender' };
  return { t: map[m] };
}
/* if a split/surrender the chart wanted is illegal, play the hand as a
   plain hard/soft total instead */
function basicHardFallback(st, s, h){
  const hv = handValue(h.cards);
  const up = upVal(st.dealer.cards[0]);
  if (hv.soft){ return (hv.total >= 18) ? S : A; }
  const t = hv.total;
  if (t >= 17) return S;
  if (t >= 13 && t <= 16) return up <= 6 ? S : A;
  if (t === 12) return (up >= 4 && up <= 6) ? S : A;
  return A;
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — a move as flat byte fields, for js/mp.js's generic codec.
   21's moves are tiny: a type and, for insurance, a boolean. Every
   field is 0..255. ONLINE IS NOT OPEN for coins (see COINS_MODE_READY):
   the shared seed makes the dealer's hole card readable by every
   client. The codec is written and tested as part of the seam's story.
   ═══════════════════════════════════════════════════════════════════ */
const MOVES = ['hit', 'stand', 'double', 'split', 'surrender', 'ins', 'next', 'quit'];
function encWire(mv){
  if (!mv || MOVES.indexOf(mv.t) < 0) return null;
  const w = { t: mv.t };
  if (mv.t === 'ins') w.k = mv.take ? 1 : 0;
  return w;
}
function decWire(w){
  if (!w || typeof w.t !== 'string' || MOVES.indexOf(w.t) < 0) return null;
  const mv = { t: w.t };
  if (w.t === 'ins') mv.take = !!w.k;
  return mv;
}

/* the coins flag, mirrored here for the harness (the UI owns the real
   one). It is false for the same reason poker's is: the shared seed. */
const COINS_MODE_READY = false;

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — the UI half and the test harness both read this. The
   COMMON API (deal/legal/check/apply/turn/over/note/tally) matches
   js/tletin.js and js/poker.js; the rest is 21's own.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_BLACKJACK = root.KARTI_BLACKJACK || {};
root.KARTI_BLACKJACK.engine = {
  /* cards + totals */
  suitOf, rankOf, pipOf, isAce, handValue,
  /* the deal seam */
  DEALERS, dealerOf, draw,
  /* table constants */
  MIN_SEATS, MAX_SEATS, MODES, modeOf, DEALER, OUT, COINS_MODE_READY,
  /* the common API */
  deal, legal, check, apply, turn, over, note, tally,
  /* 21's own read-outs + policy */
  seated, chipsOn, meSeat, dealerPlay,
  basicStrategy, think,
  encWire, decWire, MOVES
};

})(typeof window !== 'undefined' ? window : globalThis);
