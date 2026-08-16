/* ═══════════════════════════════════════════════════════════════════
   KARTI — rummy.js
   RUMMY — the engine. Rules only: no DOM, no clock, no Math.random.

   This file is the half that can be run headless — the simulation
   harness loads it in Node with a bare `window` stub and plays
   thousands of hands through exactly the code the phones run. The
   screen half lives in js/rummy-ui.js and follows js/klabb.js's
   runner shape: a match is (opts, seed, log), the state is always
   deal() plus a replay of the log, and rollback is cutting the log.

   THE GAME, AS THIS TABLE PLAYS IT
     · Draw one — off the stock or the top of the discard pile.
     · Meld sets (same rank, suits all different) and runs (same suit,
       ranks in a row, ace LOW only — A-2-3 yes, Q-K-A no).
     · Lay off single cards onto any meld on the table, whoever laid it.
     · Discard one to end the turn. You may not throw back the card
       you just took off the pile — unless it is your last card,
       because going out is not stalling.
     · Out of cards = you win the hand, and you score the pip value of
       everything still in everybody else's hand. Court cards 10,
       ace 1, jokers 15. Going out in ONE turn, never having melded
       before — RUMMY — pays double.
     · Stock empty: the discard pile (all but its top card) is
       shuffled back in — the seeded RNG lives in the state, so every
       phone reshuffles it identically. Twice per hand. The THIRD time
       the stock runs dry the hand is BLOCKED: it ends, the lowest
       hand wins, and scores the differences.

   THE TABLE-SIZE RULE (the reason this game exists here)
     · 2–4 players: one 52-card deck. A second is optional.
     · 5–8 players: two decks MANDATORY. A third optional.
     · 9–12 players: three decks MANDATORY. A fourth optional.
       Measured, not guessed: at 12 players on two decks the stock
       after the deal is 104-84-1 = 19 cards — the first lap of the
       table eats it before anybody has seen a second turn, and the
       simulation harness (scripts/, run at 400 hands per size) had
       the pile recycling 4+ times a hand and blocking outright far
       above the 8-player rate. Three decks (162 cards, stock 77)
       brings 12 players back to the same shape as 8 on two.

   DUPLICATE CARDS, DECIDED AND WRITTEN DOWN
     With two or three packs there are two or three of every card.
     · In a SET the suits must all be different, so two identical
       cards can never sit in one set and a set never grows past 4.
       Allowing 9♠9♠9♥ would make sets trivially cheap at a table
       where dozens of duplicates circulate.
     · In a RUN the ranks are strictly consecutive, so two identical
       cards cannot sit in one run by construction.
     · The same card may appear in two DIFFERENT melds on the table —
       that is what owning three packs means.

   JOKERS (a setting — some tables want them, some spit)
     · Two per deck, always — 2, 4 or 6 in the box, never a odd house
       count nobody can verify.
     · A joker stands in for a card inside a NEW meld, and in any meld
       the jokers must be OUTNUMBERED by real cards.
     · A joker may not be laid off onto the table, and nobody swaps
       one out. It went down as a card; it stays the card it claimed.
     · Caught in your hand it costs 15.

   CARDS AS INTEGERS
     c = copy*54 + f. f 0..51 is klabb's own face id (suit*13+rank-1);
     f 52 and 53 are the two jokers. copy is which pack it came from.
     Three decks top out at 161, and the relay's wire carries bytes,
     so a card always fits.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ── the cards ───────────────────────────────────────────────────── */
const PER_DECK = 54;                 /* 52 faces + 2 jokers            */
const faceOf  = c => c % PER_DECK;
const isJoker = c => faceOf(c) >= 52;
const suitOf  = c => (faceOf(c) / 13) | 0;          /* junk for jokers */
const rankOf  = c => (faceOf(c) % 13) + 1;          /* 1=A … 13=K      */
const val     = c => isJoker(c) ? 15 : (rankOf(c) >= 11 ? 10 : rankOf(c));

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
   THE TWO MODES
     'classic'  seven cards (ten head to head), melds go on the table
                as you make them, you win by emptying your hand.
     'ghaxra'   GĦAXRA — ten cards to everybody, nothing goes on the
                table at all, and you win by DECLARING: one meld of
                four and two of three, exactly, all at once.
   The mode is part of the deal, so it is part of (opts, seed, log) and
   therefore part of what every phone in a room agrees on.
   ═══════════════════════════════════════════════════════════════════ */
const MODES = ['classic', 'ghaxra'];
const modeOf = m => (MODES.indexOf(m) >= 0 ? m : 'classic');
/* GĦAXRA's shape: 4 + 3 + 3 = 10. Written as data because the check,
   the AI and the rules card all read the same numbers. */
const OUT_SHAPE = [4, 3, 3];
const OUT_TOTAL = 10;

/* ── THE TABLE-SIZE RULE, as one function everybody asks ──────────
   Two modes, two answers, because GĦAXRA deals ten cards to every
   seat instead of seven and that is a different sum. Measured, not
   carried over: see the header of the sim numbers in the report and
   the note under each branch. */
function deckRule(n, mode, jokers){
  if (modeOf(mode) === 'ghaxra'){
    /* TEN CARDS A HEAD, so the sums are not the classic ones and were
       re-measured rather than carried over: twelve players is 120
       cards dealt before the stock exists at all, which two packs
       (108) cannot even do.

       AND JOKERS ARE PART OF THE TABLE SIZE HERE, which they are not
       in classic. Declaring a whole 4+3+3 with no wilds is so much
       harder that hands run roughly twice as long, and a longer hand
       eats the stock: measured at 200 hands a size, three players on
       one pack went from 2.5% dead hands with jokers to 23.5% without,
       six on two packs from 0% to 24.5%, ten on three from 0% to 28%.
       One extra pack puts every one of those back under 5%. So: no
       jokers costs a pack, and the sheet says so. */
    const noJok = (jokers === false) ? 1 : 0;
    const cap = v => Math.min(MAX_DECKS, v);
    const dealt = n * OUT_TOTAL;
    let base, why;
    if (n <= 3){
      base = 1;
      why = n + ' at ten cards each can play off one pack; a second makes it looser.';
    } else if (n <= 6){
      base = 2;
      why = n + ' players at ten cards each need two packs — one deals ' + dealt +
            ' cards and leaves a stock of ' + Math.max(0, 54 - dealt - 1) + '.';
    } else if (n <= 10){
      base = 3;
      why = n + ' players at ten cards each need three packs; two leaves ' +
            Math.max(0, 108 - dealt - 1) + ' cards of stock, which a table this size eats ' +
            'before everybody has drawn twice.';
    } else {
      base = 4;
      why = n + ' players need ' + dealt + ' cards dealt before the stock exists at all — ' +
            'two packs cannot deal it, three leaves it starving. Four packs. Measured.';
    }
    if (noJok)
      why += ' With no jokers a full 4+3+3 is much harder to finish, so this table takes ' +
             'one pack more — without it a quarter of the hands die undeclared.';
    const min = cap(base + noJok);
    return { min, max: cap(min + 1), why };
  }
  if (n <= 4) return { min:1, max:2,
    why: n + ' can play off one pack; add a second for a looser game.' };
  if (n <= 8) return { min:2, max:3,
    why: n + ' players need two packs — one deals ' + n + ' hands and leaves no stock. A third is optional.' };
  return { min:3, max:4,
    why: n + ' players need three packs. On two, the deal leaves under 20 cards of stock ' +
         'and the pile recycles itself ragged — measured, not guessed. A fourth is optional.' };
}
const handSize = (n, mode) => (modeOf(mode) === 'ghaxra' ? OUT_TOTAL : (n === 2 ? 10 : 7));
const MAX_RECYCLE = 2;               /* third exhaustion blocks the hand */
const MAX_MELD = 12;                 /* wire ceiling; a hand is 11 at most */
const MAX_DECKS = 5;

/* ═══════════════════════════════════════════════════════════════════
   MELDS
   A set  {k:'s', r, cards[], suits[]}  suits = the natural suits in it
   A run  {k:'r', s, lo, cards[]}       cards[i] represents rank lo+i
   ═══════════════════════════════════════════════════════════════════ */

/* Try to read `cards` (from one hand, order irrelevant) as ONE valid
   new meld. Returns the meld object or null. Deterministic: spare
   jokers extend a run at the TOP first, then the bottom. */
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
    if (n > 4) return null;
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

/* can card `c` be laid off onto meld `m`?  (jokers never lay off) */
function canLay(m, c){
  if (isJoker(c)) return false;
  if (m.k === 's')
    return rankOf(c) === m.r && m.cards.length < 4 && m.suits.indexOf(suitOf(c)) < 0;
  const hi = m.lo + m.cards.length - 1;
  if (suitOf(c) !== m.s) return false;
  return (rankOf(c) === m.lo - 1 && m.lo > 1) || (rankOf(c) === hi + 1 && hi < 13);
}
function layInto(m, c){                 /* mutate — caller checked canLay */
  if (m.k === 's'){ m.cards.push(c); m.suits.push(suitOf(c)); return; }
  if (rankOf(c) === m.lo - 1){ m.cards.unshift(c); m.lo--; }
  else m.cards.push(c);
}

/* ═══════════════════════════════════════════════════════════════════
   THE PARTITION SEARCH — GĦAXRA's whole game, and the one piece of
   this file that is not allowed to be approximately right.

   "The app says my hand is not valid when it is" is unforgivable, so
   nothing here is greedy and nothing here takes the first answer it
   finds. The search is EXHAUSTIVE, and it is exhaustive cheaply
   because of one fact about a valid meld:

     every meld's NATURAL cards are either all the same rank (a set)
     or all the same suit (a run) — there is no third kind.

   So instead of walking all 2^11 subsets of a hand, we walk only the
   subsets INSIDE each rank group and each suit group, each widened by
   the jokers (which may join anything). Those groups are three or
   four cards long, so the candidate list is tiny — and it provably
   contains every meld the hand can make, because a meld outside every
   such group would have to have naturals of two ranks AND two suits,
   which readMeld() refuses by definition.

   readMeld() stays the only authority on whether a candidate is legal.
   This function decides only WHICH candidates are worth asking about.
   ═══════════════════════════════════════════════════════════════════ */

/* every valid meld of size lo..hi that is a subset of `hand`, as
   {mask, size, val}. mask is a bitmask over hand positions. */
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
      let mask = 0, val = 0;
      const cards = [];
      for (let k = 0; k < L; k++){
        if (!(bits & (1 << k))) continue;
        const i = pool[k];
        mask |= (1 << i);
        val += val0(hand[i]);
        cards.push(hand[i]);
      }
      if (seen[mask]) continue;
      if (!readMeld(cards)) { seen[mask] = 2; continue; }
      seen[mask] = 1;
      out.push({ mask, size, val });
    }
  }
  for (const r in byRank) sweep(byRank[r].concat(jok));
  for (const s in bySuit) sweep(bySuit[s].concat(jok));
  return out;
}
const val0 = c => val(c);

/* CAN THIS HAND GO OUT? Exact. `hand` must be exactly ten cards, and
   the answer is a partition into one meld of four and two of three
   covering every card. Returns the three melds, or null.

   Note it searches the FOUR first and then two THREES out of what is
   left — and it keeps searching if a promising four leads nowhere,
   which is precisely where a greedy answer goes wrong: the widest
   meld in the hand is often the one that must be broken up. */
function outCheck(hand){
  if (!Array.isArray(hand) || hand.length !== OUT_TOTAL) return null;
  const full = (1 << OUT_TOTAL) - 1;
  const ms = meldMasks(hand, 3, 4);
  const four = ms.filter(m => m.size === 4);
  const three = ms.filter(m => m.size === 3);
  for (let a = 0; a < four.length; a++){
    const A = four[a].mask;
    for (let b = 0; b < three.length; b++){
      const B = three[b].mask;
      if (A & B) continue;
      const need = full & ~(A | B);
      for (let c = b + 1; c < three.length; c++){
        if (three[c].mask !== need) continue;
        /* rebuild the three melds as objects for the table to show */
        return [A, B, need].map(mk2 => {
          const cards = [];
          for (let i = 0; i < OUT_TOTAL; i++) if (mk2 & (1 << i)) cards.push(hand[i]);
          return readMeld(cards);
        });
      }
    }
  }
  return null;
}

/* HOW CLOSE IS THIS HAND? The most valuable set of disjoint melds it
   can make, and what is left over. Used for the blocked-hand score,
   for the AI's discard, and for the line under your hand that tells
   you how far off you are.

   Sizes 3..5 only: a longer run always splits into shorter ones, and
   a set stops at four, so nothing of value is missed — with one
   honest exception, a 6+ run carrying enough jokers that neither half
   can keep them outnumbered. That case can only ever make this
   REPORT slightly more deadwood than a human would score, never
   less, and it cannot affect whether a hand may go out (which is
   outCheck's exact job, above). */
function bestCover(hand){
  const n = hand.length;
  const ms = meldMasks(hand, 3, 5);
  const full = (1 << n) - 1;
  const best = new Int32Array(full + 1).fill(-1);
  const via = new Int32Array(full + 1).fill(-1);
  best[0] = 0;
  /* over every reachable set of used cards, in increasing order */
  for (let used = 0; used <= full; used++){
    if (best[used] < 0) continue;
    for (let k = 0; k < ms.length; k++){
      const m = ms[k];
      if (used & m.mask) continue;
      const nx = used | m.mask;
      if (best[nx] < best[used] + m.val){ best[nx] = best[used] + m.val; via[nx] = k; }
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
  let dead = 0;
  const loose = [];
  for (let i = 0; i < n; i++) if (!(at & (1 << i))){ dead += val(hand[i]); loose.push(hand[i]); }
  return { covered: top, deadwood: dead, melds, loose, mask: at };
}

/* ═══════════════════════════════════════════════════════════════════
   THE DEAL
   opts: { seats, decks, jokers, target, humans, lvl }
     target 0 = one decisive hand; otherwise first to that many points.
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
     that plays well; this is about a game that can be DEALT at all —
     ten cards to twelve seats is 120 cards before the stock exists,
     and a short deal would hand somebody four cards and call it a
     hand. Even a forced harness run cannot go below it. */
  const need = n * handSize(n, mode) + 2;
  while (decks * (jokers ? 54 : 52) < need && decks < MAX_DECKS) decks++;
  const st = {
    v:1, n, decks, mode,
    jokers,
    target: Math.max(0, opts.target | 0),
    rs: seed | 0,
    seats: [], dealer: 0, handNo: 1,
    stock: [], disc: [], melds: [],
    turn: 0, phase: 'draw',
    tookDisc: -1, laidThisTurn: 0, recycles: 0,
    blocked: false, book: [], done: null,
    show: null                        /* GĦAXRA: the declared 4+3+3 */
  };
  const humans = Math.max(1, Math.min(n, opts.humans | 0 || 1));
  for (let i = 0; i < n; i++)
    st.seats.push({
      name: i < humans ? (humans === 1 ? 'You' : 'Player ' + (i + 1)) : 'MAKNA ' + (i + 1 - humans),
      own:  i < humans ? (i === 0 ? 'me' : 'hot') : 'ai',
      lvl:  opts.lvl | 0 || 2,
      hand: [], score: 0, laid: false, turns: 0
    });
  dealHand(st);
  return st;
}

function dealHand(st){
  const cards = [];
  for (let d = 0; d < st.decks; d++)
    for (let f = 0; f < (st.jokers ? 54 : 52); f++) cards.push(d * PER_DECK + f);
  shuffle(st, cards);
  const hs = handSize(st.n, st.mode);
  st.seats.forEach(s => { s.hand = cards.splice(0, hs); s.laid = false; s.turns = 0; });
  st.disc = [cards.pop()];
  st.stock = cards;
  st.melds = [];
  st.show = null;
  st.turn = (st.dealer + 1) % st.n;
  st.phase = 'draw';
  st.tookDisc = -1; st.laidThisTurn = 0;
  st.recycles = 0; st.blocked = false;
}
const isGhaxra = st => st.mode === 'ghaxra';

/* ═══════════════════════════════════════════════════════════════════
   TURN ORDER — seat -1 is the table itself (a beat between hands, or
   the blocked verdict), exactly klabb's convention.
   ═══════════════════════════════════════════════════════════════════ */
function stockDead(st){
  return !st.stock.length && !(st.disc.length > 1 && st.recycles < MAX_RECYCLE);
}
function turn(st){
  if (st.done) return -2;
  if (st.phase === 'handover') return -1;
  if (st.phase === 'draw' && stockDead(st)) return -1;   /* blocked — table calls it */
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
  if (st.phase === 'draw'){
    out.push({ t:'draw', p:0 });
    if (st.disc.length) out.push({ t:'draw', p:1 });
    return out;
  }
  /* ── GĦAXRA: nothing goes on the table, so the only two things you
     can do are throw one away or DECLARE. A declaration is a discard
     that happens to leave a hand of exactly 4+3+3 behind it. ── */
  if (isGhaxra(st)){
    me.hand.forEach(c => {
      if (c === st.tookDisc) return;         /* never the card just taken */
      const rest = me.hand.slice();
      pull(rest, c);
      if (outCheck(rest)) out.push({ t:'out', c });
      out.push({ t:'disc', c });
    });
    return out;
  }
  /* act phase: melds (from the finder — check() is the real gate for a
     human's own combinations), layoffs, discards */
  findMelds(me.hand).forEach(m => out.push({ t:'meld', cards: m.slice() }));
  me.hand.forEach(c => st.melds.forEach((m, mi) => {
    if (canLay(m, c)) out.push({ t:'lay', c, m: mi });
  }));
  me.hand.forEach(c => {
    if (c === st.tookDisc && me.hand.length > 1) return;
    out.push({ t:'disc', c });
  });
  return out;
}

/* THE gate. Every move — thumb, machine, wire — is measured here. */
function check(st, mv, seat){
  if (!mv || st.done) return false;
  if (turn(st) !== seat) return false;
  if (seat === -1)
    return (mv.t === 'next' && st.phase === 'handover') ||
           (mv.t === 'block' && st.phase === 'draw' && stockDead(st));
  const me = st.seats[seat];
  if (!me) return false;
  const inHand = c => me.hand.indexOf(c) >= 0;
  if (st.phase === 'draw')
    return mv.t === 'draw' && (mv.p === 0 || (mv.p === 1 && st.disc.length > 0));
  if (st.phase !== 'act') return false;
  /* ── GĦAXRA's gate. Two moves only, and the declaration is checked
     by the exhaustive partition search — never by the AI's opinion of
     the hand and never by whatever the client believed. ── */
  if (isGhaxra(st)){
    if (mv.t === 'disc')
      return inHand(mv.c) && mv.c !== st.tookDisc;
    if (mv.t === 'out'){
      if (!inHand(mv.c) || mv.c === st.tookDisc) return false;
      const rest = me.hand.slice();
      pull(rest, mv.c);
      return !!outCheck(rest);
    }
    return false;
  }
  if (mv.t === 'meld'){
    if (!Array.isArray(mv.cards) || !mv.cards.every(inHand)) return false;
    return !!readMeld(mv.cards);
  }
  if (mv.t === 'lay'){
    const m = st.melds[mv.m | 0];
    return !!m && inHand(mv.c) && canLay(m, mv.c);
  }
  if (mv.t === 'disc'){
    if (!inHand(mv.c)) return false;
    return mv.c !== st.tookDisc || me.hand.length === 1;
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
    if (mv.t === 'next'){ st.dealer = (st.dealer + 1) % st.n; st.handNo++; dealHand(st); }
    else if (mv.t === 'block') endHand(st, -1);
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
  if (mv.t === 'meld'){
    const m = readMeld(mv.cards);
    mv.cards.forEach(c => pull(me.hand, c));
    st.melds.push(m);
    st.laidThisTurn++;
    if (!me.hand.length){ endHand(st, seat); return; }
    return;
  }
  if (mv.t === 'lay'){
    pull(me.hand, mv.c);
    layInto(st.melds[mv.m], mv.c);
    st.laidThisTurn++;
    if (!me.hand.length){ endHand(st, seat); return; }
    return;
  }
  /* ── GĦAXRA: the declaration. The discard goes on the pile exactly
     like any other, the ten cards behind it are shown as the three
     melds they are, and the hand is over. check() has already proved
     the partition; outCheck is called once more only to HOLD it, so
     the table has something to draw. ── */
  if (mv.t === 'out'){
    pull(me.hand, mv.c);
    st.disc.push(mv.c);
    st.show = { seat, melds: outCheck(me.hand) };
    me.turns++;
    endHand(st, seat);
    return;
  }
  if (mv.t === 'disc'){
    pull(me.hand, mv.c);
    st.disc.push(mv.c);
    me.turns++;
    if (!me.hand.length){ endHand(st, seat); return; }
    /* the turn passes */
    if (st.laidThisTurn) me.laid = true;
    st.turn = (seat + 1) % st.n;
    st.phase = 'draw';
    st.tookDisc = -1; st.laidThisTurn = 0;
  }
}

const handWorth = h => h.reduce((a, c) => a + val(c), 0);
/* WHAT A HAND IS WORTH AGAINST YOU AT THE END.
   Classic: everything you are still holding — your melds went on the
   table as you made them, so whatever is left is by definition junk.
   GĦAXRA: only the cards NOT in a valid meld. Nothing was ever laid
   down in that mode, so charging a player for a run they were holding
   would punish the exact thing the mode asks them to do. */
function deadOf(st, hand){
  return isGhaxra(st) ? bestCover(hand).deadwood : handWorth(hand);
}

/* the hand ends: `who` went out, or -1 = blocked */
function endHand(st, who){
  const dw = st.seats.map(s => deadOf(st, s.hand));
  let row;
  if (who >= 0){
    /* RUMMY, the double. Classic: everything laid in the one going-out
       turn, nothing before. GĦAXRA: declared on your very first turn of
       the hand, which is the same feat — the whole thing at once, out
       of the deal. */
    const rummy = isGhaxra(st) ? (st.seats[who].turns <= 1) : !st.seats[who].laid;
    let gain = 0;
    dw.forEach((v, i) => { if (i !== who) gain += v; });
    if (rummy) gain *= 2;
    st.seats[who].score += gain;
    row = { hand: st.handNo, winner: who, kind: rummy ? 'rummy' : 'out',
            gain, dw };
  } else {
    /* blocked: lowest hand wins the differences. Ties: nearest the
       dealer's left — deterministic, and said out loud in the book. */
    let min = Math.min.apply(null, dw), win = -1;
    for (let k = 1; k <= st.n; k++){
      const i = (st.dealer + k) % st.n;
      if (dw[i] === min){ win = i; break; }
    }
    let gain = 0;
    dw.forEach(v => { gain += v - min; });
    st.seats[win].score += gain;
    st.blocked = true;
    row = { hand: st.handNo, winner: win, kind:'blocked', gain, dw };
  }
  st.book.push(row);
  st.phase = 'handover';
  const top = Math.max.apply(null, st.seats.map(s => s.score));
  if (!st.target || top >= st.target){
    st.done = { row };
    st.phase = 'done';
  }
}

/* ═══════════════════════════════════════════════════════════════════
   OVER — the verdict, read relative to the local player.
   ═══════════════════════════════════════════════════════════════════ */
function over(st){
  if (!st.done) return null;
  let me = st.seats.findIndex(s => s.own === 'me' || s.own === 'hot');
  if (me < 0) me = 0;
  const top = Math.max.apply(null, st.seats.map(s => s.score));
  const winners = st.seats.map((s, i) => i).filter(i => st.seats[i].score === top);
  const row = st.done.row;
  const wname = st.seats[winners[0]].name;
  const iWon = winners.indexOf(me) >= 0;
  const tone = winners.length > 1 && iWon ? 'draw' : iWon ? 'win' : 'lose';
  const kind = row.kind === 'rummy'
                 ? (isGhaxra(st) ? 'RUMMY! Declared off the deal — double points.'
                                 : 'RUMMY! The whole hand in one go — double points.')
             : row.kind === 'blocked'
                 ? (isGhaxra(st) ? 'The stock ran dry three times and nobody could declare. ' +
                                   'Fewest loose cards takes it.'
                                 : 'The stock ran dry three times. Lowest hand takes it.')
             : '';
  const why = (st.book.length > 1 ? st.book.length + ' hands. ' : '') +
              (iWon ? 'You finish on ' + st.seats[me].score + '.'
                    : wname + ' finishes on ' + top + '; you made ' + st.seats[me].score + '.') +
              (kind ? ' ' + kind : '');
  return {
    tone,
    head: tone === 'win' ? 'Table’s yours' : tone === 'draw' ? 'Shared table' : wname + ' takes it',
    why,
    quip: tone === 'win'
      ? (row.kind === 'rummy' && row.winner === me
          ? 'One turn. They never saw a card of it coming.'
          : 'Deadwood is what other people hold.')
      : tone === 'lose'
      ? (row.kind === 'blocked' ? 'Nobody went out. You just went down slower than most... no, wait.'
                                : 'Every card in your hand just paid their bar bill.')
      : 'Split it and argue about it forever.'
  };
}

function note(st){
  if (st.done || st.phase === 'handover') return '';
  return (isGhaxra(st) ? '4+3+3 · ' : '') + 'Stock ' + st.stock.length +
         (st.target ? ' · to ' + st.target : '') +
         (st.book.length ? ' · hand ' + st.handNo : '');
}

/* ═══════════════════════════════════════════════════════════════════
   THE MELD FINDER — shared by the machine and the human's hint layer.
   Greedy, longest first: real runs, real sets, then joker-completed
   ones. Not optimal — optimal set-partitioning is not what MAKNA 2
   plays like — but it never returns an illegal meld.
   ═══════════════════════════════════════════════════════════════════ */
function findMelds(hand){
  const left = hand.slice();
  const out = [];
  for (;;){
    const m = bestMeldIn(left);
    if (!m) break;
    out.push(m);
    m.forEach(c => pull(left, c));
  }
  return out;
}
function bestMeldIn(cards){
  const nats = cards.filter(c => !isJoker(c));
  const joks = cards.filter(isJoker);
  let best = null;
  const take = m => { if (m && (!best || m.length > best.length)) best = m; };

  /* natural runs */
  for (let s = 0; s < 4; s++){
    const suit = nats.filter(c => suitOf(c) === s)
                     .sort((a, b) => rankOf(a) - rankOf(b))
                     .filter((c, i, a) => !i || rankOf(c) !== rankOf(a[i - 1]));
    let run = [];
    for (let i = 0; i <= suit.length; i++){
      if (i && i < suit.length && rankOf(suit[i]) === rankOf(suit[i - 1]) + 1){ run.push(suit[i]); continue; }
      if (run.length >= 3) take(run.slice(0, MAX_MELD));
      if (i < suit.length) run = [suit[i]];
    }
  }
  /* natural sets */
  for (let r = 1; r <= 13; r++){
    const set = [];
    for (const c of nats)
      if (rankOf(c) === r && !set.some(x => suitOf(x) === suitOf(c))) set.push(c);
    if (set.length >= 3) take(set.slice(0, 4));
  }
  if (best) return best;
  if (!joks.length) return null;

  /* one joker on a natural pair — gap runs first, then sets */
  for (let i = 0; i < nats.length; i++) for (let j = i + 1; j < nats.length; j++){
    const a = nats[i], b = nats[j];
    if (suitOf(a) === suitOf(b)){
      const d = Math.abs(rankOf(a) - rankOf(b));
      if (d === 1 || d === 2){
        const m = readMeld([a, b, joks[0]]);
        if (m) return [a, b, joks[0]];
      }
    }
    if (rankOf(a) === rankOf(b) && suitOf(a) !== suitOf(b)) return [a, b, joks[0]];
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE
   lvl 1  draws blind, melds what screams, throws the dearest card
   lvl 2  takes the pile when it completes something, lays off, keeps
          pairs and gap-runs
   lvl 3  as 2, and it has been watching the pile — a card whose
          neighbours are dead is worth less to hold
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
    const gone = st.disc.concat.apply(st.disc, st.melds.map(m => m.cards));
    for (const g of gone){
      if (isJoker(g)) continue;
      if (rankOf(g) === rankOf(c) && suitOf(g) !== suitOf(c)) dead++;
      if (suitOf(g) === suitOf(c) && Math.abs(rankOf(g) - rankOf(c)) <= 2) dead++;
    }
    u = Math.max(0, u - dead);
  }
  return u;
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE, PLAYING GĦAXRA
   A classic brain turned loose on this mode looks broken, and it
   looks broken in a specific way: it hunts one long meld, throws
   everything that is not in it, and NEVER DECLARES, because the
   classic goal (empty the hand) is unreachable here. So the whole
   objective is swapped.

   The measure is DEADWOOD — the cards bestCover() cannot fit into a
   meld — and every decision is "which choice leaves me holding the
   least junk". Called once per decision on an eleven-card hand, not
   once per candidate, which is what keeps a twelve-seat table quick.

     draw   take the pile card only if it actually lowers deadwood
            (lvl 3 also takes it when it merely joins a pair it can
            still use), otherwise the stock
     out    declare THE MOMENT it is legal — never sit on a made hand
     throw  the loose card that costs the most, deciding ties by how
            little it does for the melds that are half-built
   ═══════════════════════════════════════════════════════════════════ */
function thinkGhaxra(st, seat, lvl){
  const me = st.seats[seat];
  if (st.phase === 'draw'){
    const top = st.disc[st.disc.length - 1];
    if (top !== undefined){
      const now = bestCover(me.hand).deadwood;
      const after = bestCover(me.hand.concat([top])).deadwood;
      /* the pile card is only worth taking if it lands in a meld —
         "deadwood did not go up" is not the same thing, because you
         must throw something back anyway */
      if (after < now) return { t:'draw', p:1 };
      if (lvl >= 3 && !isJoker(top) && usefulness(st, me.hand, top, lvl) >= 3 &&
          val(top) <= 6) return { t:'draw', p:1 };
    }
    return { t:'draw', p:0 };
  }
  /* DECLARE if the hand is there. Exhaustive, so this is never a
     guess, and it is checked over every possible discard. */
  const cov = bestCover(me.hand);
  if (cov.loose.length <= 1){
    for (const c of me.hand){
      if (c === st.tookDisc) continue;
      const rest = me.hand.slice();
      pull(rest, c);
      if (outCheck(rest)) return { t:'out', c };
    }
  }
  /* otherwise throw the dearest loose card. Level 1 does not look at
     the melds at all — it simply sheds the most expensive junk. */
  const loose = cov.loose.filter(c => c !== st.tookDisc);
  const pool = loose.length ? loose : me.hand.filter(c => c !== st.tookDisc);
  let pick = null, key = -1;
  for (const c of pool){
    const k = (lvl === 1) ? val(c)
                          : val(c) * 2 - usefulness(st, me.hand, c, lvl) * 5;
    if (k > key){ key = k; pick = c; }
  }
  if (pick == null) pick = me.hand[0];
  return { t:'disc', c: pick };
}

function think(st, seat, lvl){
  lvl = lvl || 2;
  const me = st.seats[seat];
  if (isGhaxra(st)) return thinkGhaxra(st, seat, lvl);
  if (st.phase === 'draw'){
    const top = st.disc[st.disc.length - 1];
    if (top !== undefined && !isJoker(top)){
      const with2 = me.hand.concat([top]);
      const melds = findMelds(with2);
      const helps = melds.some(m => m.indexOf(top) >= 0) ||
                    (lvl >= 2 && st.melds.some(m => canLay(m, top)));
      if (helps) return { t:'draw', p:1 };
      if (lvl >= 3 && usefulness(st, me.hand, top, lvl) >= 3 && val(top) <= 5)
        return { t:'draw', p:1 };
    }
    return { t:'draw', p:0 };
  }
  /* meld everything the finder sees */
  const melds = findMelds(me.hand);
  if (melds.length) return { t:'meld', cards: melds[0] };
  /* lay off everything that fits — but never strand yourself with no discard */
  if (lvl >= 1){
    for (const c of me.hand){
      if (me.hand.length === 2 && c !== st.tookDisc){
        /* laying this off would leave only the pile card to throw — fine */
      }
      for (let mi = 0; mi < st.melds.length; mi++)
        if (canLay(st.melds[mi], c)) return { t:'lay', c, m: mi };
    }
  }
  /* discard: the dearest, least useful card the rules let go of */
  let pick = null, pickKey = -1;
  for (const c of me.hand){
    if (c === st.tookDisc && me.hand.length > 1) continue;
    const key = (lvl === 1 ? val(c)
                           : val(c) * 2 - usefulness(st, me.hand, c, lvl) * 7) +
                (isJoker(c) ? -999 : 0);
    if (key > pickKey){ pickKey = key; pick = c; }
  }
  if (pick == null) pick = me.hand[0];
  return { t:'disc', c: pick };
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — a move as flat byte fields, for js/mp.js's generic
   codec. Fields list published on the lobby contract; a meld's cards
   ride as c0..c11 (a hand is 11 cards at the very most).
   ═══════════════════════════════════════════════════════════════════ */
/* THE RELAY CARRIES BYTES — every field is bounded 0..255 on the Pi
   (MAX_MOVE_IDX in server/karti_server.py) and a value over that is
   not truncated, it is REFUSED. A card id is copy*54 + face, so at
   five packs it reaches 269 and would not fit. Five packs is real:
   GĦAXRA with no jokers at eleven or twelve seats needs them.

   So a single-card move sends the FACE (0..53) and the PACK (0..4)
   as two small fields and the far side multiplies them back. Melds
   are classic-only, classic caps at four packs, and 3*54+53 = 215
   fits — but the guard below refuses anything out of range anyway
   rather than letting a silent overflow become a desync. */
const WIRE_FIELDS = ['p', 'm', 'd', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5',
                     'c6', 'c7', 'c8', 'c9', 'c10', 'c11'];
const copyOf = c => (c / PER_DECK) | 0;
const byteOK = v => v >= 0 && v <= 255;

function encWire(mv){
  if (!mv) return null;
  if (mv.t === 'draw') return { t:'draw', p: mv.p ? 1 : 0 };
  if (mv.t === 'disc' || mv.t === 'out' || mv.t === 'lay'){
    const c = mv.c | 0;
    if (c < 0) return null;
    const w = { t: mv.t, c0: faceOf(c), d: copyOf(c) };
    if (mv.t === 'lay') w.m = mv.m | 0;
    return (byteOK(w.c0) && byteOK(w.d) && byteOK(w.m == null ? 0 : w.m)) ? w : null;
  }
  if (mv.t === 'meld'){
    if (!Array.isArray(mv.cards) || mv.cards.length > MAX_MELD) return null;
    const w = { t:'meld' };
    for (let i = 0; i < mv.cards.length; i++){
      const c = mv.cards[i] | 0;
      if (!byteOK(c)) return null;                 /* never send a truncated card */
      w['c' + i] = c;
    }
    return w;
  }
  return null;                                     /* table beats never travel */
}
function decWire(w){
  if (!w || typeof w.t !== 'string') return null;
  if (w.t === 'draw') return { t:'draw', p: w.p ? 1 : 0 };
  /* face + pack, back into one card id — see encWire. GĦAXRA's
     declaration is ONE card on the wire: the ten behind it are
     already in every phone's copy of that seat's hand, and each phone
     re-runs the exhaustive outCheck itself before accepting it. A
     client cannot declare a hand it does not hold. */
  if (w.t === 'disc' || w.t === 'out' || w.t === 'lay'){
    if (w.c0 === undefined) return null;
    const c = (w.d | 0) * PER_DECK + (w.c0 | 0);
    if (w.t === 'lay') return { t:'lay', c, m: w.m | 0 };
    return { t: w.t, c };
  }
  if (w.t === 'meld'){
    const cards = [];
    for (let i = 0; i < MAX_MELD; i++){
      if (w['c' + i] === undefined) break;
      cards.push(w['c' + i] | 0);
    }
    return cards.length >= 3 ? { t:'meld', cards } : null;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — the UI file and the sim harness both read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_RUMMY = root.KARTI_RUMMY || {};
root.KARTI_RUMMY.engine = {
  PER_DECK, faceOf, isJoker, suitOf, rankOf, val,
  deckRule, handSize, MAX_RECYCLE, MAX_MELD, MAX_DECKS,
  MODES, modeOf, OUT_SHAPE, OUT_TOTAL, isGhaxra,
  deal, legal, check, apply, turn, over, note,
  readMeld, canLay, findMelds, think, handWorth,
  meldMasks, outCheck, bestCover, deadOf,
  encWire, decWire, WIRE_FIELDS
};

})(typeof window !== 'undefined' ? window : globalThis);
