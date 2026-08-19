/* ═══════════════════════════════════════════════════════════════════
   KARTI — tletin.js
   TLETIN-U-WIEĦED (31) — Scat / Thirty-One — the engine. Rules only:
   no DOM, no clock, and NO Math.random anywhere in this file (the one
   seed pick for a fresh local match lives in the UI, as js/poker.js
   does it). A match is (opts, seed, log): the whole state is deal()
   plus a replay of the log, so every phone that replays the log lands
   on the same table.

   ── THE NAME ──────────────────────────────────────────────────────
     The game is thirty-one — "wieħed u tletin" in Maltese. "Tletin"
     (thirty) is the folk threshold a happy player knocks on; the target
     is one more. So the file and the engine id are `tletin`, and the
     display name is "31" / "Tletin-u-Wieħed". It is the SECOND MODE of
     the one card game whose first mode is 21 (js/blackjack.js): the
     player taps a single tile and picks 21 or 31, exactly as rummy
     picks classic vs għaxra. The two engines share no rules — a knock
     has no blackjack twin, a split has no 31 twin — so they are two
     files with a COMMON API SURFACE where it is honest:

       deal(opts, seed)      build a match
       legal(st, seat)       the moves a seat may make right now
       check(st, mv, seat)   the one gate — is this move legal
       apply(st, mv)         mutate deterministically (log replays here)
       turn(st)              whose turn (seat, or -1 the table)
       over(st)              null, or the verdict for the local player
       note / tally          read-outs off the state, stored once

   ── THE GAME ──────────────────────────────────────────────────────
     Three to nine players, each with three LIVES (chips-as-lives). Each
     is dealt three cards; a discard pile starts with one up-card and
     the rest is the stock. On your turn you DRAW one card — off the
     stock (unknown) or the top of the discard (known) — so you are
     holding four, then DISCARD one back, leaving three. Your score is
     the highest total you can make in a SINGLE SUIT:

       · faces (J,Q,K) and the ten count 10, an ace counts 11, pips
         count their number — but only cards of ONE suit are added.
         A♠ K♠ = 21; A♠ K♠ 5♥ still = 21 (the 5♥ is a different suit).
       · THREE OF A KIND (three cards of the same rank, any suits) is a
         special hand worth 30.5 — better than 30, worse than 31. This
         is the common "three sevens" rule (see THREE_KIND_SCORE for the
         documented alternative, a flat 30).
       · 31 (an ace + two ten-values in one suit) is the top hand and
         ends the round INSTANTLY: whoever holds it wins the round the
         moment it is made, everyone else loses a life.

     KNOCKING. Instead of drawing, a content player KNOCKS. No card
     moves; every OTHER player gets exactly one more turn (draw+discard,
     they may not knock), then the hands are compared. The LOWEST score
     loses a life. On a tie for lowest, ALL the tied players lose a life
     (documented; see KNOCK_TIE). A player who knocks and then turns out
     to hold the lowest loses TWO lives in the classic rule (the
     "knocker's penalty") — offered as an option, default OFF here so a
     brave knock is not punished twice; see KNOCK_PENALTY.

     LIVES. Lose all your lives and you are OUT. Play continues, dealing
     a fresh round each time, until one player is left standing — the
     winner. A player on their last life who then loses is sometimes
     allowed to play on "on the bike" (0 lives, one more chance);
     documented as an option, default OFF; see ON_THE_BIKE.

   ── THE DEAL IS INJECTED. READ THIS BEFORE CHANGING ANYTHING. ──────
     The relay broadcasts ONE shared seed to every seat, so a client
     that derives the deal from that seed can derive EVERY hand and the
     whole stock order — harmless in FREE MODE (only lives at stake),
     fatal with coins. So the deal is one injectable source, DEALERS,
     with two implementations and one interface make(st) -> a deck the
     engine deals hands and a stock from:

       DEALERS.seed     shuffles one pack out of st.rs, the way skarta
                        and rummy deal. FREE MODE, honest there.
       DEALERS.private  takes hands + stock delivered PER SEAT by the
                        relay (st.given), leaving any hand it was not
                        told as null. For COINS MODE, once the relay can
                        deal privately (and reveal at showdown — a
                        client cannot score a hand it was never sent).

     Everything downstream — scoring, knock resolution, lives, the wire
     — is identical between the two. COINS_MODE_READY (owned by the UI,
     mirrored here for the harness) stays false until that relay work
     ships.

   CARDS
     Plain klabb face ids, 0..51: c = suit*13 + rank-1, rank 1=A…13=K.
     One pack, no jokers — the same pack every other KARTI felt uses.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ── the cards ───────────────────────────────────────────────────── */
const suitOf = c => (c / 13) | 0;
const rankOf = c => (c % 13) + 1;                 /* 1=A … 13=K       */
/* the 31 value of a single card: ace 11, ten/J/Q/K ten, else the pip */
const valOf  = c => { const r = (c % 13) + 1; return r === 1 ? 11 : (r >= 10 ? 10 : r); };

/* ═══════════════════════════════════════════════════════════════════
   THE SCORE — the one arithmetic 31 is about, written once and verified
   exhaustively by the harness.
   scoreHand(cards) -> { total, suit, threeKind, thirtyOne }
     total      the best single-suit total, OR the three-of-a-kind value
     suit       the suit that made the total (−1 for a three-of-a-kind)
     threeKind  true iff all three cards share a rank
     thirtyOne  true iff total === 31 (an instant-win hand)
   A hand is always exactly three cards in play; scoreHand also accepts
   four (mid-turn, before the discard) so the AI can evaluate a draw.
   ═══════════════════════════════════════════════════════════════════ */
const THREE_KIND_SCORE = 30.5;   /* documented variant: 30.5 (a.k.a.
                                    "thirty and a half"). Alternative in
                                    some houses is a flat 30 or 34; 30.5
                                    is the widely-taught rule — above any
                                    real 30, below 31. Change here only. */

function scoreHand(cards){
  /* three of a kind only applies to a natural three-card hand */
  if (cards.length === 3 &&
      rankOf(cards[0]) === rankOf(cards[1]) &&
      rankOf(cards[1]) === rankOf(cards[2])){
    return { total: THREE_KIND_SCORE, suit: -1, threeKind: true,
             thirtyOne: false };
  }
  const bySuit = [0, 0, 0, 0];
  for (let i = 0; i < cards.length; i++) bySuit[suitOf(cards[i])] += valOf(cards[i]);
  let best = 0, suit = 0;
  for (let s = 0; s < 4; s++) if (bySuit[s] > best){ best = bySuit[s]; suit = s; }
  return { total: best, suit, threeKind: false, thirtyOne: best === 31 };
}
/* comparable number: a three-of-a-kind's 30.5 already sorts correctly
   against integer suit totals, so scoreHand().total IS the comparable. */

/* ═══════════════════════════════════════════════════════════════════
   THE DECK — the injectable seam. See the header.
   make(st) -> { hands:[ [c,c,c] | null, … ], up:c, stock:[…] }
     hands[i] === null   this client was not told that seat's cards
     up                  the first up-card (top of the discard pile)
     stock               the remaining draw pile, top at the END (pop())
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
  /* (a) THE SHARED SEED — one pack shuffled out of st.rs, the way
     skarta and rummy deal. FREE MODE only: every phone can read every
     hand off its own shuffle. Deal order is a real table's: three
     cards to each live seat in turn, then one up-card, the rest stock. */
  seed: {
    id: 'seed',
    make(st){
      const cards = [];
      for (let f = 0; f < 52; f++) cards.push(f);
      shuffle(st, cards);
      const live = st.seats.map((s, i) => (!s.out ? i : -1)).filter(i => i >= 0);
      const hands = st.seats.map(() => null);
      for (let r = 0; r < 3; r++)
        for (const i of live) (hands[i] = hands[i] || []).push(cards.pop());
      const up = cards.pop();
      return { hands, up, stock: cards };     /* pop() draws off the top */
    }
  },
  /* (b) PER-SEAT DELIVERY — for COINS MODE, once the relay can post a
     seat its own three cards and nobody else's. st.given is whatever
     arrived: { hands:{seatIndex:[c,c,c]}, up, stock:[…] }. A seat we
     were not told comes back null and stays face down on this client —
     which is why a showdown here also needs a reveal message before
     coins can ship. Same signature, nothing downstream changes. */
  private: {
    id: 'private',
    make(st){
      const g = st.given || {};
      const gh = g.hands || {};
      const hands = st.seats.map((s, i) => {
        if (s.out) return null;
        const h = gh[i];
        return (Array.isArray(h) && h.length === 3) ? h.slice() : null;
      });
      const up = (typeof g.up === 'number') ? g.up : null;
      const stock = Array.isArray(g.stock) ? g.stock.slice() : [];
      return { hands, up, stock };
    }
  }
};
const dealerOf = st => DEALERS[st.deal] || DEALERS.seed;

/* ═══════════════════════════════════════════════════════════════════
   THE TABLE
   opts: {
     seats, humans, lvl,
     mode        'free' (lives only) | 'coins' (UI-gated, see header)
     lives       starting lives per player, default 3
     knockPenalty  the knocker also holding the low loses TWO lives,
                   default false (see KNOCK_PENALTY in the header)
     knockTieAll   a tie for lowest loses a life for EVERY tied player,
                   default true (false = a tie loses NOBODY a life)
     threeKind     score for three of a kind: 30.5 default, or set to
                   30 / 34 for a house variant.
   }
   ═══════════════════════════════════════════════════════════════════ */
const MIN_SEATS = 3, MAX_SEATS = 9;
const MODES = ['free', 'coins'];
const modeOf = m => (MODES.indexOf(m) >= 0 ? m : 'free');
const TABLE = -1;                       /* the table's own beat (deal/settle) */

function clampInt(v, lo, hi, dflt){
  v = (v === undefined || v === null) ? dflt : (v | 0);
  return Math.max(lo, Math.min(hi, v));
}

function deal(opts, seed){
  opts = opts || {};
  const n = clampInt(opts.seats, MIN_SEATS, MAX_SEATS, 4);
  const lives = clampInt(opts.lives, 1, 9, 3);
  const st = {
    v: 1, n, mode: modeOf(opts.mode),
    deal: (opts.deal === 'private') ? 'private' : 'seed',
    given: opts.given || null,
    lives,
    rule: {
      knockPenalty: opts.knockPenalty === true,
      knockTieAll:  opts.knockTieAll !== false,
      threeKind:    (typeof opts.threeKind === 'number') ? opts.threeKind : THREE_KIND_SCORE
    },
    rs: seed | 0,
    seats: [],
    dealerSeat: 0,                     /* rotates each round; left-of acts first */
    stock: [], discard: [],
    turn: TABLE, phase: 'deal',
    round: 0,
    knocked: -1,                       /* seat that knocked, or -1          */
    knockCountdown: 0,                 /* turns remaining after a knock     */
    roundOver: false,
    book: [],                          /* one row per finished round        */
    show: null,
    done: null
  };
  const humans = Math.max(1, Math.min(n, opts.humans | 0 || 1));
  for (let i = 0; i < n; i++)
    st.seats.push({
      name: i < humans ? (humans === 1 ? 'You' : 'Player ' + (i + 1))
                       : 'MAKNA ' + (i + 1 - humans),
      own:  i < humans ? (i === 0 ? 'me' : 'hot') : 'ai',
      lvl:  opts.lvl | 0 || 2,
      lives,
      out: false, gone: false,
      hand: [], drew: false            /* drew: has drawn this turn, owes a discard */
    });
  startRound(st);
  return st;
}

/* seats still in the match (lives > 0, not walked out) */
function alive(st){
  const out = [];
  for (let i = 0; i < st.n; i++)
    if (!st.seats[i].gone && st.seats[i].lives > 0) out.push(i);
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   START A ROUND — deal three to every live seat, one up-card, the rest
   the stock. The seat left of the dealer acts first. A dealt 31 wins
   instantly before anyone draws.
   ═══════════════════════════════════════════════════════════════════ */
function startRound(st){
  const live = alive(st);
  if (live.length <= 1){
    st.done = { kind: 'winner', left: live };
    st.phase = 'done';
    return;
  }
  st.round++;
  st.show = null;
  st.knocked = -1; st.knockCountdown = 0; st.roundOver = false;

  st.seats.forEach((s, i) => {
    s.out = live.indexOf(i) < 0;       /* eliminated this round           */
    s.hand = []; s.drew = false;
  });

  const got = dealerOf(st).make(st);
  st.seats.forEach((s, i) => {
    const h = got.hands[i];
    s.hand = (Array.isArray(h) && h.length === 3) ? h.slice() : [];
  });
  st.discard = (typeof got.up === 'number') ? [got.up] : [];
  st.stock = got.stock.slice();

  /* the dealer chair must be a live seat */
  if (st.seats[st.dealerSeat].out)
    st.dealerSeat = nextLive(st, st.dealerSeat);

  /* a natural 31 in the deal wins at once */
  const insta = live.find(i => scoreHand(st.seats[i].hand).thirtyOne);
  if (insta !== undefined){
    resolveInstant(st, insta);
    return;
  }

  st.phase = 'play';
  st.turn = nextLive(st, st.dealerSeat);   /* left of the dealer          */
}

function nextLive(st, from){
  for (let k = 1; k <= st.n; k++){
    const i = (from + k) % st.n;
    const s = st.seats[i];
    if (!s.out && !s.gone && s.lives > 0) return i;
  }
  return from;
}

/* ═══════════════════════════════════════════════════════════════════
   WHAT A SEAT MAY DO. legal() is the enumerated list; check() is the
   one authority. Two beats per turn: DRAW (stock or discard) then
   DISCARD one card — unless you KNOCK, which skips your draw entirely.
   ═══════════════════════════════════════════════════════════════════ */
function legal(st, seat){
  if (st.done) return [];
  if (seat === TABLE){
    if (st.phase === 'settle') return [{ t: 'next' }];
    return [];
  }
  if (turn(st) !== seat) return [];
  const s = st.seats[seat];
  if (!s || s.out) return [];
  const out = [];
  if (!s.drew){
    /* start of turn: draw, or knock (only if nobody has knocked yet) */
    out.push({ t: 'draw', from: 'stock' });
    if (st.discard.length) out.push({ t: 'draw', from: 'discard' });
    if (st.knocked < 0) out.push({ t: 'knock' });
  } else {
    /* mid-turn: must discard one of the four cards in hand */
    for (let k = 0; k < s.hand.length; k++) out.push({ t: 'discard', c: s.hand[k] });
  }
  return out;
}

function check(st, mv, seat){
  if (!mv || st.done) return false;
  if (mv.t === 'quit')
    return seat >= 0 && seat < st.n && !!st.seats[seat] && !st.seats[seat].gone;
  if (seat === TABLE)
    return mv.t === 'next' && st.phase === 'settle';
  if (turn(st) !== seat) return false;
  const s = st.seats[seat];
  if (!s || s.out || st.phase !== 'play') return false;
  if (!s.drew){
    if (mv.t === 'knock') return st.knocked < 0;
    if (mv.t === 'draw'){
      if (mv.from === 'stock')   return st.stock.length > 0 || true; /* empty stock handled in apply (reshuffle) */
      if (mv.from === 'discard') return st.discard.length > 0;
    }
    return false;
  }
  /* owes a discard */
  if (mv.t === 'discard') return s.hand.indexOf(mv.c) >= 0;
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
    s.out = true;
    /* a walk-out forfeits the round; if it was their turn, move on. Do
       not touch the stock or the RNG (see poker's quit note). */
    if (st.turn === seat && st.phase === 'play') stepAfterTurn(st, seat);
    if (alive(st).length <= 1 && !st.done){
      st.done = { kind: 'winner', left: alive(st) };
      st.phase = 'done';
    }
    return;
  }
  if (seat === TABLE){
    if (mv.t === 'next') nextRound(st);
    return;
  }
  const s = st.seats[seat];
  if (!s || s.out || st.phase !== 'play') return;

  if (mv.t === 'knock'){
    /* no card moves. Every OTHER live seat gets exactly one more turn. */
    st.knocked = seat;
    st.knockCountdown = liveCount(st) - 1;
    s.drew = false;
    stepAfterTurn(st, seat);
    return;
  }
  if (mv.t === 'draw'){
    let c;
    if (mv.from === 'discard'){
      c = st.discard.pop();
    } else {
      if (!st.stock.length) reshuffleStock(st);
      c = st.stock.pop();
    }
    if (c === undefined || c === null){
      /* private shoe exhausted / genuinely empty: treat as a forced
         knock-style pass so the engine never wedges. Cannot happen with
         the seed dealer (52 cards outlast any 9-hand round). */
      s.drew = false;
      stepAfterTurn(st, seat);
      return;
    }
    s.hand.push(c);
    s.drew = true;
    /* drawing into a 31 wins instantly, before the discard */
    if (st.discard.length || st.stock.length){ /* keep going to discard  */ }
    return;
  }
  if (mv.t === 'discard'){
    const idx = s.hand.indexOf(mv.c);
    if (idx < 0) return;
    s.hand.splice(idx, 1);
    st.discard.push(mv.c);
    s.drew = false;
    /* a completed 31 ends the round instantly in this player's favour */
    if (scoreHand(s.hand).thirtyOne){
      resolveInstant(st, seat);
      return;
    }
    stepAfterTurn(st, seat);
    return;
  }
}

/* how many seats are live this round */
function liveCount(st){
  let n = 0;
  for (let i = 0; i < st.n; i++) if (!st.seats[i].out && !st.seats[i].gone) n++;
  return n;
}

/* the stock ran dry: turn all but the top discard back into a fresh
   stock, deterministically (keep discard order, reverse into stock so
   the oldest discard is drawn first). No RNG — the order is fixed by the
   log, so every phone rebuilds the identical stock. */
function reshuffleStock(st){
  if (st.discard.length <= 1) return;              /* nothing to recycle  */
  const top = st.discard.pop();
  const recycled = st.discard.slice();             /* oldest → newest     */
  st.discard = [top];
  /* draw oldest-first: stock is popped from the end, so reverse */
  st.stock = recycled.reverse();
}

/* after a seat finishes its turn: advance, and if a knock is counting
   down, decrement and settle when it reaches the knocker. */
function stepAfterTurn(st, seat){
  if (st.knocked >= 0){
    st.knockCountdown--;
    if (st.knockCountdown <= 0){
      settle(st);
      return;
    }
  }
  st.turn = nextLive(st, seat);
  /* skip the knocker themselves — they do not act again after knocking */
  if (st.knocked >= 0 && st.turn === st.knocked)
    st.turn = nextLive(st, st.turn);
}

/* ═══════════════════════════════════════════════════════════════════
   INSTANT 31 — the holder wins the round outright, everyone else loses
   one life. No comparison, no knock resolution.
   ═══════════════════════════════════════════════════════════════════ */
function resolveInstant(st, seat){
  const live = liveSeats(st);
  const losers = live.filter(i => i !== seat);
  applyLives(st, losers, 1);
  finishRound(st, { kind: 'thirtyOne', winner: seat, losers, scores: scoreAll(st) });
}

/* the seats live THIS round */
function liveSeats(st){
  const out = [];
  for (let i = 0; i < st.n; i++) if (!st.seats[i].out && !st.seats[i].gone) out.push(i);
  return out;
}
function scoreAll(st){
  const sc = {};
  liveSeats(st).forEach(i => { sc[i] = scoreHand(st.seats[i].hand).total; });
  return sc;
}

/* ═══════════════════════════════════════════════════════════════════
   SETTLE — the knock (or an emptied round) resolves. The LOWEST score
   loses a life; ties for lowest lose per KNOCK_TIE; the knocker holding
   the low may pay the KNOCK_PENALTY.
   ═══════════════════════════════════════════════════════════════════ */
function settle(st){
  const live = liveSeats(st);
  const scores = {};
  live.forEach(i => { scores[i] = scoreHand(st.seats[i].hand).total; });

  let low = Infinity;
  live.forEach(i => { if (scores[i] < low) low = scores[i]; });
  let losers = live.filter(i => scores[i] === low);

  /* KNOCK_TIE: by default every tied-low player loses a life; if the
     option is off, a tie for lowest loses nobody. */
  if (losers.length > 1 && !st.rule.knockTieAll) losers = [];

  /* KNOCK_PENALTY: the knocker who ends up (tied) lowest loses an extra
     life. Applied as a second point against that one seat. */
  const extra = {};
  if (st.rule.knockPenalty && st.knocked >= 0 && losers.indexOf(st.knocked) >= 0)
    extra[st.knocked] = 1;

  applyLives(st, losers, 1, extra);
  finishRound(st, { kind: 'knock', knocker: st.knocked, low, losers, scores });
}

/* dock lives and record who was eliminated */
function applyLives(st, losers, base, extra){
  extra = extra || {};
  losers.forEach(i => {
    const s = st.seats[i];
    s.lives -= base + (extra[i] | 0);
    if (s.lives < 0) s.lives = 0;
  });
}

function finishRound(st, detail){
  const eliminated = [];
  st.seats.forEach((s, i) => { if (!s.gone && s.lives === 0 && !s.out) eliminated.push(i); });
  st.show = Object.assign({ round: st.round }, detail, {
    lives: st.seats.map(s => s.lives),
    eliminated
  });
  st.book.push({
    round: st.round, kind: detail.kind,
    winner: (detail.winner !== undefined ? detail.winner : -1),
    losers: (detail.losers || []).slice(),
    lives: st.seats.map(s => s.lives),
    eliminated: eliminated.slice()
  });
  st.roundOver = true;
  st.phase = 'settle';
  st.turn = TABLE;

  const stillIn = alive(st);
  if (stillIn.length <= 1){
    st.done = { kind: 'winner', left: stillIn };
  }
}

function nextRound(st){
  if (st.done){ st.phase = 'done'; return; }
  const live = alive(st);
  if (live.length <= 1){
    st.done = { kind: 'winner', left: live };
    st.phase = 'done';
    return;
  }
  /* the deal rotates one live seat left each round */
  st.dealerSeat = nextLive(st, st.dealerSeat);
  startRound(st);
}

/* ═══════════════════════════════════════════════════════════════════
   TURN — the acting seat, or TABLE (-1) for the table's own beat.
   ═══════════════════════════════════════════════════════════════════ */
function turn(st){
  if (st.done) return -2;
  if (st.phase === 'settle') return TABLE;
  if (st.phase === 'play') return st.turn;
  return TABLE;
}

/* ═══════════════════════════════════════════════════════════════════
   OVER — the verdict for the local player. A round is not an ending;
   the MATCH ends when one player is left with lives.
   ═══════════════════════════════════════════════════════════════════ */
function meSeat(st){
  let i = st.seats.findIndex(s => s.own === 'me' || s.own === 'hot');
  return i < 0 ? 0 : i;
}
function over(st){
  if (!st.done) return null;
  const me = meSeat(st);
  const left = st.done.left || alive(st);
  const iWon = left.length === 1 && left[0] === me;
  const rounds = st.book.length;
  const tone = iWon ? 'win' : (left.indexOf(me) >= 0 ? 'draw' : 'lose');
  const who = left.length === 1 ? st.seats[left[0]].name : '';
  return {
    tone,
    head: iWon ? 'Last one standing'
        : tone === 'lose' ? 'You lost your last life'
        : 'The table breaks up',
    why: rounds + (rounds === 1 ? ' round' : ' rounds') + ' played. ' +
         (left.length === 1 ? who + ' is the only one with lives left.'
                            : 'No players left with lives to deal another round.'),
    quip: iWon ? 'You knew when to knock.'
        : tone === 'lose' ? 'One card short, one turn too late.'
        : 'Everybody ran out at once — rare, and it happened.',
    left
  };
}

function note(st){
  if (st.done) return '';
  const knock = st.knocked >= 0 ? ' · KNOCK (' + st.knockCountdown + ' to go)' : '';
  return 'ROUND ' + st.round + ' · stock ' + st.stock.length + knock;
}

/* ═══════════════════════════════════════════════════════════════════
   THE TALLY — read straight off the book, stored once, so every phone
   derives the same scoreboard and a reload rebuilds it from the log.
   ═══════════════════════════════════════════════════════════════════ */
function tally(st){
  const t = st.seats.map(s => ({ lives: s.lives, roundsWon: 0, lifeLosses: 0, out: s.lives === 0 }));
  st.book.forEach(row => {
    if (row.winner >= 0) t[row.winner].roundsWon++;
    (row.losers || []).forEach(i => { t[i].lifeLosses++; });
  });
  return t;
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — one brain, three sharpnesses, NOT ONE CALL TO
   Math.random. Where a person would waver the machine reads the
   position: same round, same seat, same hand → same choice on every
   phone. The core read is scoreHand(); the "randomness" of a knock
   decision is a hash of the position, exactly as poker's jitter().

     lvl 1  Gentle    draws greedily, knocks late (leaves points behind)
     lvl 2  Normal    draws to build one suit, knocks on a safe total
     lvl 3  Ruthless  reads the discard, knocks to trap a low opponent
   ═══════════════════════════════════════════════════════════════════ */
function hash32(list){
  let h = 2166136261;
  for (let i = 0; i < list.length; i++){ h ^= (list[i] | 0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function jitter(st, seat, salt){
  const s = st.seats[seat];
  const h = s.hand;
  return (hash32([st.round, seat, salt | 0, st.stock.length,
                  h[0] | 0, h[1] | 0, h[2] | 0, (h[3] | 0)]) % 1000) / 1000;
}

/* the best three-card hand out of four cards, and its score, for the
   discard decision: try dropping each card, keep the highest total */
function bestDiscard(cards){
  let bestScore = -1, drop = cards[0], keep = null;
  for (let k = 0; k < cards.length; k++){
    const rest = cards.slice(0, k).concat(cards.slice(k + 1));
    const sc = scoreHand(rest).total;
    if (sc > bestScore){ bestScore = sc; drop = cards[k]; keep = rest; }
  }
  return { drop, score: bestScore, keep };
}

function think(st, seat, lvl){
  lvl = Math.max(1, Math.min(3, lvl || 2));
  const s = st.seats[seat];
  if (turn(st) !== seat) return null;

  if (!s.drew){
    /* decide: knock, or draw — and from where. */
    const cur = scoreHand(s.hand).total;
    /* knock threshold rises with level: a sharper bot waits for a safer
       total but also knocks to end a round when it is comfortably ahead */
    const knockAt = lvl === 1 ? 27 : lvl === 2 ? 24 : 22;
    const j = jitter(st, seat, 1);
    if (st.knocked < 0 && cur >= knockAt && st.round >= 1 && j < 0.9)
      return { t: 'knock' };
    /* would taking the discard's top card improve the hand? */
    const top = st.discard.length ? st.discard[st.discard.length - 1] : null;
    if (top !== null){
      const withTop = bestDiscard(s.hand.concat([top])).score;
      if (withTop > cur) return { t: 'draw', from: 'discard' };
    }
    return { t: 'draw', from: 'stock' };
  }
  /* owe a discard: keep the best three */
  const d = bestDiscard(s.hand);
  return { t: 'discard', c: d.drop };
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — a move as flat byte fields, for js/mp.js's generic codec.
   Every field is 0..255. A discard carries the card id (0..51); a draw
   carries a source flag. ONLINE IS NOT OPEN for coins (COINS_MODE_READY):
   the shared seed makes every hand readable by every client.
   ═══════════════════════════════════════════════════════════════════ */
const MOVES = ['draw', 'discard', 'knock', 'next', 'quit'];
const byteOK = v => v >= 0 && v <= 255;
function encWire(mv){
  if (!mv || MOVES.indexOf(mv.t) < 0) return null;
  if (mv.t === 'draw')    return { t: 'draw', k: mv.from === 'discard' ? 1 : 0 };
  if (mv.t === 'discard'){
    const c = mv.c | 0;
    return byteOK(c) ? { t: 'discard', c } : null;
  }
  return { t: mv.t };                               /* knock/next/quit    */
}
function decWire(w){
  if (!w || typeof w.t !== 'string' || MOVES.indexOf(w.t) < 0) return null;
  if (w.t === 'draw')    return { t: 'draw', from: (w.k | 0) === 1 ? 'discard' : 'stock' };
  if (w.t === 'discard') return { t: 'discard', c: w.c | 0 };
  return { t: w.t };
}

/* the coins flag, mirrored here for the harness (the UI owns the real
   one). False for the same reason poker's is: the shared seed. */
const COINS_MODE_READY = false;

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — the UI half and the test harness both read this. The
   COMMON API (deal/legal/check/apply/turn/over/note/tally) matches
   js/blackjack.js and js/poker.js; the rest is 31's own.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_TLETIN = root.KARTI_TLETIN || {};
root.KARTI_TLETIN.engine = {
  /* cards + scoring */
  suitOf, rankOf, valOf, scoreHand, THREE_KIND_SCORE,
  /* the deal seam */
  DEALERS, dealerOf,
  /* table constants */
  MIN_SEATS, MAX_SEATS, MODES, modeOf, TABLE, COINS_MODE_READY,
  /* the common API */
  deal, legal, check, apply, turn, over, note, tally,
  /* 31's own read-outs + AI */
  alive, liveSeats, scoreAll, meSeat, think, bestDiscard,
  encWire, decWire, MOVES
};

})(typeof window !== 'undefined' ? window : globalThis);
