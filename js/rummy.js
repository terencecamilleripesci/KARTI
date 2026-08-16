/* ═══════════════════════════════════════════════════════════════════
   KARTI — rummy.js
   RUMMY — the engine. Rules only: no DOM, no clock, no Math.random.

   This file is the half that can be run headless — the simulation
   harness loads it in Node with a bare `window` stub and plays
   thousands of hands through exactly the code the phones run. The
   screen half lives in js/rummy-ui.js and follows js/klabb.js's
   runner shape: a match is (opts, seed, log), the state is always
   deal() plus a replay of the log, and rollback is cutting the log.

   THE GAME, AS THE OWNER PLAYS IT — his words, three of them:
     "when u have 4 3 3 u call rummy and win"
     "in rummy as well when u match 4 and 3 u win"
     "only gin rummy u have to match for 45 points then put ur cards
      out. u made rummy like the gin rummy. fix it."

   So: RUMMY IS ONE GAME, AND IT HAS NO POINTS.
     · Deal SEVEN cards — or TEN, the option (GĦAXRA, Maltese for
       ten). The hand size is the only knob the rules have.
     · Draw one — off the stock or the top of the pile — then throw
       one. Never the card you have just taken off the pile.
     · NOTHING GOES ON THE TABLE. You hold everything; nobody melds
       down, nobody lays off on anybody. (That machinery is gin's and
       classic-American rummy's, and it is exactly what this file used
       to have wrong.)
     · The moment your whole hand is melds — one four and one three
       at seven cards, one four and two threes at ten — you CALL
       RUMMY, show the hand, and YOU HAVE WON. No deadwood count, no
       doubling, no score to settle. The call is the win.
     · Stock empty: the pile (all but its top card) is shuffled back
       in — the seeded RNG lives in the state, so every phone
       reshuffles identically. Twice per hand. The THIRD time the
       stock runs dry the hand is DEAD: nobody won it, the cards go
       back in, and the same table is simply dealt a fresh hand.
       (No "lowest hand wins" — that would be counting, and there is
       no counting in this game.)
     · After a win the table votes: every seat says PLAY AGAIN or
       LEAVES. The stayers are re-dealt at the same table — the book
       (st.book) keeps every hand's result, which is where the
       table's tally of hands won and win-streaks comes from. Fewer
       than two stayers and the table breaks up; that is the only way
       a match actually ends.

   A MELD is what it always is: a set (same rank, suits all
   different) or a run (same suit, ranks in a row, ace LOW only —
   A-2-3 yes, Q-K-A no). Never more than four cards, because the
   winning shapes only ever ask for a four and threes.

   THE TABLE-SIZE RULE (measured, not guessed — scripts run the sim)
     Ten cards a head eats far more of the box than seven, so the two
     hand sizes carry different pack mandates; see deckRule() for the
     numbers and the measured dead-hand rates behind them.

   DUPLICATE CARDS, DECIDED AND WRITTEN DOWN
     With two or three packs there are two or three of every card.
     · In a SET the suits must all be different, so two identical
       cards can never sit in one set and a set never grows past 4.
     · In a RUN the ranks are strictly consecutive, so two identical
       cards cannot sit in one run by construction.

   JOKERS (a setting — some tables want them, some spit)
     · Two per deck, always — 2, 4 or 6 in the box, never an odd
       house count nobody can verify.
     · A joker stands in for a card inside a meld, and in any meld
       the jokers must be OUTNUMBERED by real cards.

   CARDS AS INTEGERS
     c = copy*54 + f. f 0..51 is klabb's own face id (suit*13+rank-1);
     f 52 and 53 are the two jokers. copy is which pack it came from.
     Five decks top out at 269, and the relay's wire carries bytes, so
     a single-card move sends FACE and PACK as two small fields.

   COMPATIBILITY, SAID PLAINLY
     · The wire move for the winning call is still `t:'out'` — the
       word predates the vocabulary fix and phones already speak it.
     · The mode ids are still 'classic' (= seven cards) and 'ghaxra'
       (= ten): the live relay whitelists exactly those two variant
       strings and the relay is not ours to touch mid-party.
     · The vote moves 'stay'/'go' are new. An older build receiving
       one refuses it and mp.js stops the table honestly — a mixed
       room fails loudly, it never drifts.
     · Old SAVES are from the scored, melds-on-the-table game and
       cannot replay through these rules; js/rummy-ui.js version-
       gates them (snapshot v:2) and quietly drops v:1.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ── the cards ───────────────────────────────────────────────────── */
const PER_DECK = 54;                 /* 52 faces + 2 jokers            */
const faceOf  = c => c % PER_DECK;
const isJoker = c => faceOf(c) >= 52;
const suitOf  = c => (faceOf(c) / 13) | 0;          /* junk for jokers */
const rankOf  = c => (faceOf(c) % 13) + 1;          /* 1=A … 13=K      */

/* ── seeded randomness — the whole RNG state is st.rs ────────────── */
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
   THE ONE OPTION — hand size, carried as the room "variant" because
   that is the word the live relay already whitelists:
     'classic'  seven cards, win on 4+3
     'ghaxra'   ten cards,   win on 4+3+3
   The ids are wire vocabulary and MUST NOT change; what they mean on
   screen ("Seven" / "Għaxra — ten") lives in js/rummy-ui.js.
   ═══════════════════════════════════════════════════════════════════ */
const MODES = ['classic', 'ghaxra'];
const modeOf = m => (MODES.indexOf(m) >= 0 ? m : 'classic');
const isGhaxra = st => st.mode === 'ghaxra';
const handSize = mode => (modeOf(mode) === 'ghaxra' ? 10 : 7);
/* the winning shape, as data — the check, the AI and the rules card
   all read the same numbers */
const outShape = mode => (modeOf(mode) === 'ghaxra' ? [4, 3, 3] : [4, 3]);
const shapeName = mode => outShape(mode).join('+');

const MAX_RECYCLE = 2;               /* third exhaustion kills the hand */
const MAX_MELD = 4;                  /* the shapes never ask for more   */
const MAX_DECKS = 5;

/* ── THE TABLE-SIZE RULE, as one function everybody asks ──────────
   Measured against THIS engine — 400 hands a cell at seven cards,
   300 at ten, AI level 2, "dead" = the stock died a third time with
   nobody calling RUMMY. The mandate is the smallest pack count that
   keeps a cell under 5% dead.

   SEVEN CARDS (4+3), dead-hand % on the minimum:
     jokers   1 pack to 5p (5p: 4.3) · 2 packs to 10p (10p: 1.5)
              · 3 packs 11–12p (12p: 0.0). One pack at 6p died 39.8%.
     none     1 pack to 4p (4p: 4.0; 5p ran 29.8) · 2 packs to 9p
              (9p: 4.8; 10p ran 21.3) · 3 packs 10–12p (12p: 0.3).

   TEN CARDS (4+3+3), the harder shape:
     jokers   1 pack to 3p (4p ran 6.7) · 2 packs to 8p (8p: 3.7;
              9p ran 34.3) · 3 packs to 12p (12p: 1.0).
     none     1 pack to 3p (3p: 0.7) · 2 packs to 6p (7p ran 5.3)
              · 3 packs to 10p (11p ran 5.0) · 4 packs 11–12p.
   So at ten cards a purist no-joker table pays extra packs from
   seven players up — a full 4+3+3 with no wilds eats the stock. */
function deckRule(n, mode, jokers){
  const cap = v => Math.min(MAX_DECKS, v);
  const dealt = n * handSize(mode);
  const jok = jokers !== false;
  let min, why;
  if (modeOf(mode) === 'ghaxra'){
    if (n <= 3){
      min = 1;
      why = n + ' at ten cards each can play off one pack; a second makes it looser.';
    } else if (n <= (jok ? 8 : 6)){
      min = 2;
      why = n + ' players at ten cards each need two packs — one deals ' + dealt +
            ' cards before the stock exists at all.' +
            (jok ? '' : ' Two hold it with no jokers at this size; more heads would not.');
    } else if (n <= (jok ? 12 : 10)){
      min = 3;
      why = n + ' players at ten cards each need three packs — on two, a table this ' +
            'size ran a third of its hands into a dead stock. Measured, not guessed.' +
            (jok ? '' : ' No jokers makes the full 4+3+3 harder still, so the third pack ' +
                        'arrives earlier than it would with them.');
    } else {
      min = 4;
      why = n + ' players at ten cards, no jokers, need four packs — a full 4+3+3 with ' +
            'no wilds eats three packs dry one hand in four. Measured.';
    }
  } else {
    if (n <= (jok ? 5 : 4)){
      min = 1;
      why = n + ' at seven cards each play off one pack; a second makes it looser.';
    } else if (n <= (jok ? 10 : 9)){
      min = 2;
      why = n + ' players at seven cards each need two packs — one deals ' + dealt +
            ' of its cards and the stock dies under the table. Measured.';
    } else {
      min = 3;
      why = n + ' players at seven cards each need three packs — on two, a table this ' +
            'size ran one hand in five into a dead stock. Measured, not guessed.';
    }
  }
  min = cap(min);
  return { min, max: cap(min + 1), why };
}

/* ═══════════════════════════════════════════════════════════════════
   MELDS
   A set  {k:'s', r, cards[], suits[]}  suits = the natural suits in it
   A run  {k:'r', s, lo, cards[]}       cards[i] represents rank lo+i
   ═══════════════════════════════════════════════════════════════════ */

/* Try to read `cards` (from one hand, order irrelevant) as ONE valid
   meld. Returns the meld object or null. Deterministic: spare jokers
   extend a run at the TOP first, then the bottom. */
function readMeld(cards){
  const n = cards.length;
  if (n < 3 || n > MAX_MELD) return null;
  /* no duplicates of the same physical card */
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
    if (cards[i] === cards[j]) return null;
  const joks = cards.filter(isJoker);
  const nats = cards.filter(c => !isJoker(c));
  if (joks.length >= nats.length) return null;      /* jokers stay a minority */

  /* SET: every natural the same rank, suits all different, four at most */
  if (nats.every(c => rankOf(c) === rankOf(nats[0]))){
    const suits = nats.map(suitOf);
    for (let i = 0; i < suits.length; i++)
      if (suits.indexOf(suits[i]) !== i) return null;   /* twin suit — see header */
    return { k:'s', r: rankOf(nats[0]), cards: nats.concat(joks), suits };
  }

  /* RUN: naturals one suit, ranks distinct, jokers fill the gaps */
  const s = suitOf(nats[0]);
  if (!nats.every(c => suitOf(c) === s)) return null;
  const sorted = nats.slice().sort((a, b) => rankOf(a) - rankOf(b));
  let gaps = 0;
  for (let i = 1; i < sorted.length; i++){
    const d = rankOf(sorted[i]) - rankOf(sorted[i - 1]);
    if (d === 0) return null;                      /* twin rank — never in one run */
    gaps += d - 1;
  }
  if (gaps > joks.length) return null;
  let extra = joks.length - gaps;
  let lo = rankOf(sorted[0]), hi = rankOf(sorted[sorted.length - 1]);
  while (extra > 0 && hi < 13){ hi++; extra--; }   /* top first — deterministic */
  while (extra > 0 && lo > 1){ lo--; extra--; }    /* ace stays LOW; no wrap    */
  if (extra > 0) return null;
  /* lay the physical cards out in rank order, jokers into the holes */
  const byRank = {};
  sorted.forEach(c => { byRank[rankOf(c)] = c; });
  const out = [];
  let jat = 0;
  for (let r = lo; r <= hi; r++)
    out.push(byRank[r] !== undefined ? byRank[r] : joks[jat++]);
  return { k:'r', s, lo, cards: out };
}

/* ═══════════════════════════════════════════════════════════════════
   THE PARTITION SEARCH — the whole game, and the one piece of this
   file that is not allowed to be approximately right.

   "The app says my hand is not valid when it is" is unforgivable, so
   nothing here is greedy and nothing here takes the first answer it
   finds. The search is EXHAUSTIVE, and it is exhaustive cheaply
   because of one fact about a valid meld:

     every meld's NATURAL cards are either all the same rank (a set)
     or all the same suit (a run) — there is no third kind.

   So instead of walking all subsets of a hand, we walk only the
   subsets INSIDE each rank group and each suit group, each widened by
   the jokers (which may join anything). Those groups are a few cards
   long, so the candidate list is tiny — and it provably contains
   every meld the hand can make, because a meld outside every such
   group would need naturals of two ranks AND two suits, which
   readMeld() refuses by definition.

   readMeld() stays the only authority on whether a candidate is
   legal. This function decides only WHICH candidates are worth asking
   about. Verified against a brute-force partitioner at BOTH hand
   sizes, with jokers and without — the numbers are in the report.
   ═══════════════════════════════════════════════════════════════════ */

/* every valid meld of size lo..hi that is a subset of `hand`, as
   {mask, size}. mask is a bitmask over hand positions. */
function meldMasks(hand, lo, hi){
  const n = hand.length;
  hi = Math.min(hi, n);
  const jok = [];                      /* positions of the jokers */
  const byRank = {}, bySuit = {};
  for (let i = 0; i < n; i++){
    const c = hand[i];
    if (isJoker(c)){ jok.push(i); continue; }
    (byRank[rankOf(c)] || (byRank[rankOf(c)] = [])).push(i);
    (bySuit[suitOf(c)] || (bySuit[suitOf(c)] = [])).push(i);
  }
  const seen = {}, out = [];
  /* every subset of `pool` of size lo..hi, offered to readMeld */
  function sweep(pool){
    const L = pool.length;
    if (L < lo) return;
    const total = 1 << L;
    for (let bits = 1; bits < total; bits++){
      let size = 0;
      for (let b = bits; b; b >>= 1) size += (b & 1);
      if (size < lo || size > hi) continue;
      let mask = 0;
      const cards = [];
      for (let k = 0; k < L; k++){
        if (!(bits & (1 << k))) continue;
        const i = pool[k];
        mask |= (1 << i);
        cards.push(hand[i]);
      }
      if (seen[mask]) continue;
      if (!readMeld(cards)) { seen[mask] = 2; continue; }
      seen[mask] = 1;
      out.push({ mask, size });
    }
  }
  for (const r in byRank) sweep(byRank[r].concat(jok));
  for (const s in bySuit) sweep(bySuit[s].concat(jok));
  return out;
}

/* CAN THIS HAND CALL RUMMY? Exact. `hand` must be exactly the mode's
   hand size, and the answer is a partition into the mode's shape —
   one 4 and one 3 at seven cards, one 4 and two 3s at ten — covering
   every card. Returns the melds, or null.

   It searches the FOUR first and then the threes out of what is
   left — and it keeps searching if a promising four leads nowhere,
   which is precisely where a greedy answer goes wrong: the widest
   meld in the hand is often the one that must be broken up. */
function outCheck(hand, mode){
  const shape = outShape(mode);
  const total = shape.reduce((a, b) => a + b, 0);
  if (!Array.isArray(hand) || hand.length !== total) return null;
  const full = (1 << total) - 1;
  const ms = meldMasks(hand, 3, 4);
  const four = ms.filter(m => m.size === 4);
  const three = ms.filter(m => m.size === 3);
  const built = mk => {
    const cards = [];
    for (let i = 0; i < total; i++) if (mk & (1 << i)) cards.push(hand[i]);
    return readMeld(cards);
  };
  for (let a = 0; a < four.length; a++){
    const A = four[a].mask;
    if (shape.length === 2){                     /* 4+3 — seven cards */
      const need = full & ~A;
      for (let b = 0; b < three.length; b++)
        if (three[b].mask === need) return [A, need].map(built);
      continue;
    }
    for (let b = 0; b < three.length; b++){      /* 4+3+3 — ten cards */
      const B = three[b].mask;
      if (A & B) continue;
      const need = full & ~(A | B);
      for (let c = b + 1; c < three.length; c++){
        if (three[c].mask !== need) continue;
        return [A, B, need].map(built);
      }
    }
  }
  return null;
}

/* HOW CLOSE IS THIS HAND? The arrangement that fits the MOST cards
   into disjoint melds, and what is left over. This is the AI's whole
   compass and the hand-organiser the felt draws — it is NOT a score,
   nothing here is worth points, and outCheck() above stays the only
   authority on whether a call is legal. */
function bestCover(hand){
  const n = hand.length;
  const ms = meldMasks(hand, 3, 4);
  const full = (1 << n) - 1;
  const best = new Int32Array(full + 1).fill(-1);
  const via = new Int32Array(full + 1).fill(-1);
  best[0] = 0;
  for (let used = 0; used <= full; used++){
    if (best[used] < 0) continue;
    for (let k = 0; k < ms.length; k++){
      const m = ms[k];
      if (used & m.mask) continue;
      const nx = used | m.mask;
      if (best[nx] < best[used] + m.size){ best[nx] = best[used] + m.size; via[nx] = k; }
    }
  }
  let top = 0, at = 0;
  for (let used = 0; used <= full; used++) if (best[used] > top){ top = best[used]; at = used; }
  const melds = [];
  for (let u = at; u > 0; ){
    const k = via[u];
    if (k < 0) break;
    const m = ms[k];
    const cards = [];
    for (let i = 0; i < n; i++) if (m.mask & (1 << i)) cards.push(hand[i]);
    melds.push(readMeld(cards));
    u &= ~m.mask;
  }
  const loose = [];
  for (let i = 0; i < n; i++) if (!(at & (1 << i))) loose.push(hand[i]);
  return { covered: top, melds, loose, mask: at };
}

/* ═══════════════════════════════════════════════════════════════════
   THE DEAL
   opts: { seats, decks, jokers, humans, lvl, mode }
   No target and no scoring — the match runs hand after hand until the
   table itself breaks up.
   ═══════════════════════════════════════════════════════════════════ */
function deal(opts, seed){
  const n = Math.max(2, Math.min(12, opts.seats | 0 || 2));
  const mode = modeOf(opts.mode);
  const rule = deckRule(n, mode, opts.jokers !== false);
  let decks = opts.decks | 0;
  if (decks < rule.min) decks = rule.min;          /* the mandate is enforced */
  if (decks > rule.max) decks = rule.max;
  /* the simulation harness measures OUTSIDE the mandate on purpose —
     that is where the mandate's numbers came from. Nothing on a phone
     sets this. */
  if (opts.force) decks = Math.max(1, Math.min(MAX_DECKS, opts.decks | 0));
  const jokers = opts.jokers !== false;
  /* THE FLOOR NOTHING MAY GO UNDER. The mandate above is about a game
     that plays well; this is about a game that can be DEALT at all.
     Even a forced harness run cannot go below it. */
  const need = n * handSize(mode) + 2;
  while (decks * (jokers ? 54 : 52) < need && decks < MAX_DECKS) decks++;
  const st = {
    v:2, n, decks, mode, jokers,
    rs: seed | 0,
    seats: [], dealer: 0, handNo: 1,
    stock: [], disc: [],
    turn: 0, phase: 'draw',
    tookDisc: -1, recycles: 0,
    book: [],            /* one row per finished hand — the table's tally */
    done: null,
    show: null           /* the winning melds, shown on the RUMMY call   */
  };
  const humans = Math.max(1, Math.min(n, opts.humans | 0 || 1));
  for (let i = 0; i < n; i++)
    st.seats.push({
      name: i < humans ? (humans === 1 ? 'You' : 'Player ' + (i + 1)) : 'MAKNA ' + (i + 1 - humans),
      own:  i < humans ? (i === 0 ? 'me' : 'hot') : 'ai',
      lvl:  opts.lvl | 0 || 2,
      hand: [], gone: false, vote: null
    });
  dealHand(st);
  return st;
}

/* the seats still at the table */
function liveIdx(st){
  const out = [];
  for (let i = 0; i < st.n; i++) if (!st.seats[i].gone) out.push(i);
  return out;
}
function nextLive(st, from){
  for (let k = 1; k <= st.n; k++){
    const i = (from + k) % st.n;
    if (!st.seats[i].gone) return i;
  }
  return from;
}

function dealHand(st){
  const cards = [];
  for (let d = 0; d < st.decks; d++)
    for (let f = 0; f < (st.jokers ? 54 : 52); f++) cards.push(d * PER_DECK + f);
  shuffle(st, cards);
  const hs = handSize(st.mode);
  st.seats.forEach(s => { s.hand = s.gone ? [] : cards.splice(0, hs); s.vote = null; });
  st.disc = [cards.pop()];
  st.stock = cards;
  st.show = null;
  st.turn = nextLive(st, st.dealer);
  st.phase = 'draw';
  st.tookDisc = -1;
  st.recycles = 0;
}

/* ═══════════════════════════════════════════════════════════════════
   TURN ORDER — seat -1 is the table itself (the beat between hands
   and the dead-stock verdict), exactly klabb's convention. During the
   play-again vote the "turn" is the lowest-numbered seat that has not
   answered yet: votes go one at a time, in seat order, because the
   wire carries one move at a time and every phone must agree on whose
   move it was.
   ═══════════════════════════════════════════════════════════════════ */
function stockDead(st){
  return !st.stock.length && !(st.disc.length > 1 && st.recycles < MAX_RECYCLE);
}
function turn(st){
  if (st.done) return -2;
  if (st.phase === 'handover') return -1;
  if (st.phase === 'vote'){
    for (let i = 0; i < st.n; i++)
      if (!st.seats[i].gone && st.seats[i].vote === null) return i;
    return -1;
  }
  if (st.phase === 'draw' && stockDead(st)) return -1;   /* dead — table calls it */
  return st.turn;
}

function legal(st, seat){
  if (st.done) return [];
  if (seat === -1){
    if (st.phase === 'handover') return [{ t:'next' }];
    if (st.phase === 'draw' && stockDead(st)) return [{ t:'block' }];
    return [];
  }
  if (turn(st) !== seat) return [];
  const me = st.seats[seat];
  const out = [];
  if (st.phase === 'vote') return [{ t:'stay' }, { t:'go' }];
  if (st.phase === 'draw'){
    out.push({ t:'draw', p:0 });
    if (st.disc.length) out.push({ t:'draw', p:1 });
    return out;
  }
  /* act: throw one away, or CALL RUMMY — the call is a discard that
     happens to leave a hand of exactly the winning shape behind it */
  me.hand.forEach(c => {
    if (c === st.tookDisc) return;         /* never the card just taken */
    const rest = me.hand.slice();
    pull(rest, c);
    if (outCheck(rest, st.mode)) out.push({ t:'out', c });
    out.push({ t:'disc', c });
  });
  return out;
}

/* THE gate. Every move — thumb, machine, wire — is measured here.
   The RUMMY call is checked by the exhaustive partition search —
   never by the AI's opinion of the hand and never by whatever the
   client believed. */
function check(st, mv, seat){
  if (!mv || st.done) return false;
  if (turn(st) !== seat) return false;
  if (seat === -1)
    return (mv.t === 'next' && st.phase === 'handover') ||
           (mv.t === 'block' && st.phase === 'draw' && stockDead(st));
  const me = st.seats[seat];
  if (!me || me.gone) return false;
  if (st.phase === 'vote')
    return (mv.t === 'stay' || mv.t === 'go') && me.vote === null;
  const inHand = c => me.hand.indexOf(c) >= 0;
  if (st.phase === 'draw')
    return mv.t === 'draw' && (mv.p === 0 || (mv.p === 1 && st.disc.length > 0));
  if (st.phase !== 'act') return false;
  if (mv.t === 'disc')
    return inHand(mv.c) && mv.c !== st.tookDisc;
  if (mv.t === 'out'){
    if (!inHand(mv.c) || mv.c === st.tookDisc) return false;
    const rest = me.hand.slice();
    pull(rest, mv.c);
    return !!outCheck(rest, st.mode);
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   APPLY — deterministic; the log replays through here.
   ═══════════════════════════════════════════════════════════════════ */
function pull(hand, c){ const i = hand.indexOf(c); if (i >= 0) hand.splice(i, 1); }

function apply(st, mv){
  const seat = mv.seat;
  if (seat === -1){
    if (mv.t === 'next'){
      st.dealer = nextLive(st, st.dealer);
      st.handNo++;
      dealHand(st);
    } else if (mv.t === 'block'){
      /* the stock died a third time: a DEAD hand. Nobody won, nobody
         is counted — the cards go back in the box and the same table
         is dealt again. (A dead hand does not break anybody's
         streak, for the same reason: nobody beat anybody.) */
      st.book.push({ hand: st.handNo, winner: -1, kind:'dead' });
      st.phase = 'handover';
    }
    return;
  }
  const me = st.seats[seat];
  if (mv.t === 'draw'){
    if (mv.p === 1){
      const c = st.disc.pop();
      me.hand.push(c);
      st.tookDisc = c;
    } else {
      if (!st.stock.length && st.disc.length > 1 && st.recycles < MAX_RECYCLE){
        /* the pile, all but its face, shuffled back — see header */
        const top = st.disc.pop();
        st.stock = shuffle(st, st.disc);
        st.disc = [top];
        st.recycles++;
      }
      me.hand.push(st.stock.pop());
    }
    st.phase = 'act';
    return;
  }
  /* the RUMMY call — the winning move, and the whole game. The spare
     card goes on the pile exactly like any discard, the hand behind
     it is shown as the melds it is, and the hand is WON on the spot.
     check() has already proved the partition; outCheck is called once
     more only to HOLD it, so the table has something to draw. Then
     the table goes to the vote: play again, or leave. */
  if (mv.t === 'out'){
    pull(me.hand, mv.c);
    st.disc.push(mv.c);
    st.show = { seat, melds: outCheck(me.hand, st.mode) };
    st.book.push({ hand: st.handNo, winner: seat, kind:'rummy' });
    st.seats.forEach(s => { s.vote = null; });
    st.phase = 'vote';
    return;
  }
  if (mv.t === 'disc'){
    pull(me.hand, mv.c);
    st.disc.push(mv.c);
    st.turn = nextLive(st, seat);
    st.phase = 'draw';
    st.tookDisc = -1;
    return;
  }
  /* the play-again vote. One answer per seat, in seat order; the last
     answer resolves the table, deterministically, inside this same
     apply — no timer and no second source of truth. */
  if (mv.t === 'stay' || mv.t === 'go'){
    me.vote = mv.t;
    for (let i = 0; i < st.n; i++)
      if (!st.seats[i].gone && st.seats[i].vote === null) return;   /* still voting */
    /* everybody has answered: the leavers leave */
    st.seats.forEach(s => { if (!s.gone && s.vote === 'go'){ s.gone = true; s.hand = []; } });
    const alive = liveIdx(st);
    if (alive.length >= 2){
      st.phase = 'handover';                       /* beat, then 'next' re-deals */
    } else {
      st.done = { kind:'folded', left: alive };
      st.phase = 'done';
    }
    return;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   THE TABLE'S TALLY — hands won and streaks, read straight off the
   book. This is the ONLY source of truth for the scoreboard: it is
   part of the replayed state, so every phone at an online table
   derives the identical tally from the identical log, and a reload
   mid-session rebuilds it from the autosave. Dead hands neither score
   nor break a streak.
   ═══════════════════════════════════════════════════════════════════ */
function tally(st){
  const t = st.seats.map(() => ({ won: 0, streak: 0, best: 0 }));
  let run = -1, len = 0;
  st.book.forEach(row => {
    if (row.kind !== 'rummy') return;              /* dead hands don't count */
    const w = row.winner;
    t[w].won++;
    if (w === run) len++; else { run = w; len = 1; }
    if (len > t[w].best) t[w].best = len;
  });
  st.seats.forEach((s, i) => { t[i].streak = (i === run) ? len : 0; });
  return t;
}

/* ═══════════════════════════════════════════════════════════════════
   OVER — the verdict, read relative to the local player. The only
   ending is the table breaking up (fewer than two stayed); a WON HAND
   is not an ending, it is a vote.
   ═══════════════════════════════════════════════════════════════════ */
function over(st){
  if (!st.done) return null;
  let me = st.seats.findIndex(s => s.own === 'me' || s.own === 'hot');
  if (me < 0) me = 0;
  const t = tally(st);
  const hands = st.book.filter(r => r.kind === 'rummy').length;
  const most = Math.max.apply(null, t.map(x => x.won));
  const tops = st.seats.map((s, i) => i).filter(i => t[i].won === most && most > 0);
  const iTop = tops.indexOf(me) >= 0;
  const tone = !hands ? 'draw' : (iTop ? (tops.length > 1 ? 'draw' : 'win') : 'lose');
  const why = !hands
    ? 'The table broke up before anybody called RUMMY.'
    : hands + (hands === 1 ? ' hand' : ' hands') + ' played. ' +
      (tops.length === 1
        ? st.seats[tops[0]].name + ' took ' + most + ' of them' +
          (t[tops[0]].best > 1 ? ' — best streak ' + t[tops[0]].best + '.' : '.')
        : tops.map(i => st.seats[i].name).join(' and ') + ' shared the top on ' + most + '.');
  return {
    tone,
    head: tone === 'win' ? 'The table was yours'
        : tone === 'draw' ? 'The table breaks up'
        : st.seats[tops[0]].name + ' owned the table',
    why,
    quip: tone === 'win' ? 'They left because of you. Wear it.'
        : tone === 'lose' ? 'You can always say you were letting them win.'
        : 'Nobody won the argument. That IS rummy.'
  };
}

function note(st){
  if (st.done || st.phase === 'handover' || st.phase === 'vote') return '';
  return shapeName(st.mode) + ' · Stock ' + st.stock.length +
         (st.book.length ? ' · hand ' + st.handNo : '');
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — one brain for both hand sizes, because it is one
   game. The measure is the LOOSE CARDS — the ones bestCover() cannot
   fit into a meld — and every decision is "which choice leaves me
   holding the fewest". Not points: progress toward the shape.

     draw   take the pile card only if it actually joins a meld
            (lvl 3 also takes it when it merely joins a pair it can
            still use), otherwise the stock
     out    call RUMMY THE MOMENT it is legal — never sit on a made
            hand, checked over every possible throw
     throw  the loose card doing the least for the melds that are
            half-built; a joker never, obviously
     vote   the machine always stays. It has nowhere better to be.
   ═══════════════════════════════════════════════════════════════════ */
function usefulness(st, hand, c, lvl){
  if (isJoker(c)) return 99;                      /* never throw a joker */
  let u = 0;
  for (const o of hand){
    if (o === c || isJoker(o)) continue;
    if (rankOf(o) === rankOf(c) && suitOf(o) !== suitOf(c)) u += 3;
    if (suitOf(o) === suitOf(c)){
      const d = Math.abs(rankOf(o) - rankOf(c));
      if (d === 1) u += 3; else if (d === 2) u += 1;
    }
  }
  if (lvl >= 3 && u > 0){
    /* how much of what completes this is already face up and gone? */
    let dead = 0;
    for (const g of st.disc){
      if (isJoker(g)) continue;
      if (rankOf(g) === rankOf(c) && suitOf(g) !== suitOf(c)) dead++;
      if (suitOf(g) === suitOf(c) && Math.abs(rankOf(g) - rankOf(c)) <= 2) dead++;
    }
    u = Math.max(0, u - dead);
  }
  return u;
}

function think(st, seat, lvl){
  lvl = lvl || 2;
  const me = st.seats[seat];
  if (st.phase === 'vote') return { t:'stay' };
  if (st.phase === 'draw'){
    const top = st.disc[st.disc.length - 1];
    if (top !== undefined){
      const now = bestCover(me.hand).loose.length;
      const after = bestCover(me.hand.concat([top])).loose.length;
      /* the pile card is only worth taking if it lands in a meld —
         "no worse" is not the same thing, because you must throw
         something back anyway */
      if (after < now) return { t:'draw', p:1 };
      if (lvl >= 3 && !isJoker(top) && usefulness(st, me.hand, top, lvl) >= 3)
        return { t:'draw', p:1 };
    }
    return { t:'draw', p:0 };
  }
  /* CALL RUMMY if the hand is there. Exhaustive, so this is never a
     guess, and it is checked over every possible throw. */
  const cov = bestCover(me.hand);
  if (cov.loose.length <= 1){
    for (const c of me.hand){
      if (c === st.tookDisc) continue;
      const rest = me.hand.slice();
      pull(rest, c);
      if (outCheck(rest, st.mode)) return { t:'out', c };
    }
  }
  /* otherwise throw the loose card doing the least. Level 1 does not
     look at half-built melds at all — it throws the first dead card
     it sees. */
  const loose = cov.loose.filter(c => c !== st.tookDisc);
  const pool = loose.length ? loose : me.hand.filter(c => c !== st.tookDisc);
  let pick = null, key = 1e9;
  for (const c of pool){
    const k = (lvl === 1) ? (isJoker(c) ? 999 : 0)
                          : usefulness(st, me.hand, c, lvl) + (isJoker(c) ? 999 : 0);
    if (k < key){ key = k; pick = c; }
  }
  if (pick == null) pick = me.hand[0];
  return { t:'disc', c: pick };
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — a move as flat byte fields, for js/mp.js's generic
   codec. The relay carries bytes: every field is bounded 0..255 on
   the Pi and a value over that is REFUSED, not truncated. A card id
   is copy*54 + face and five packs reaches 269, so a single-card move
   sends the FACE (0..53) and the PACK (0..4) as two small fields and
   the far side multiplies them back.

   The winning call rides as `t:'out'` — the wire word predates the
   vocabulary fix and is left alone so phones keep agreeing. The vote
   moves 'stay'/'go' carry no fields at all. WIRE_FIELDS keeps the old
   full list (m, c1..c11 are no longer sent but a published contract
   is cheaper to leave wide than to shrink under an old peer).

   GĦAXRA note: the RUMMY call is ONE card on the wire — the cards
   behind it are already in every phone's copy of that seat's hand,
   and each phone re-runs the exhaustive outCheck itself before
   accepting it. A client cannot call RUMMY on a hand it does not
   hold.
   ═══════════════════════════════════════════════════════════════════ */
const WIRE_FIELDS = ['p', 'm', 'd', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5',
                     'c6', 'c7', 'c8', 'c9', 'c10', 'c11'];
const copyOf = c => (c / PER_DECK) | 0;
const byteOK = v => v >= 0 && v <= 255;

function encWire(mv){
  if (!mv) return null;
  if (mv.t === 'draw') return { t:'draw', p: mv.p ? 1 : 0 };
  if (mv.t === 'stay' || mv.t === 'go') return { t: mv.t };
  if (mv.t === 'disc' || mv.t === 'out'){
    const c = mv.c | 0;
    if (c < 0) return null;
    const w = { t: mv.t, c0: faceOf(c), d: copyOf(c) };
    return (byteOK(w.c0) && byteOK(w.d)) ? w : null;
  }
  return null;                                     /* table beats never travel */
}
function decWire(w){
  if (!w || typeof w.t !== 'string') return null;
  if (w.t === 'draw') return { t:'draw', p: w.p ? 1 : 0 };
  if (w.t === 'stay' || w.t === 'go') return { t: w.t };
  if (w.t === 'disc' || w.t === 'out'){
    if (w.c0 === undefined) return null;
    return { t: w.t, c: (w.d | 0) * PER_DECK + (w.c0 | 0) };
  }
  /* 'meld' and 'lay' were the old scored game's moves. A peer still
     sending them is running that build; refusing here makes mp.js
     stop the table honestly instead of letting two rule books drift. */
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — the UI file and the sim harness both read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_RUMMY = root.KARTI_RUMMY || {};
root.KARTI_RUMMY.engine = {
  PER_DECK, faceOf, isJoker, suitOf, rankOf,
  deckRule, handSize, outShape, shapeName, MAX_RECYCLE, MAX_DECKS,
  MODES, modeOf, isGhaxra,
  deal, legal, check, apply, turn, over, note, tally, liveIdx,
  readMeld, think,
  meldMasks, outCheck, bestCover,
  encWire, decWire, WIRE_FIELDS
};

})(typeof window !== 'undefined' ? window : globalThis);
