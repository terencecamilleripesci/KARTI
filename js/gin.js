/* ═══════════════════════════════════════════════════════════════════
   KARTI — gin.js
   GIN RUMMY — the engine, and nothing but the engine.

   Two players, ten cards, knock at ten deadwood or better, gin at
   none, and an undercut for a knocker who counted wrong. The whole
   file is pure: no DOM, no clock, no Math.random. Every shuffle draws
   from an RNG whose entire state is one integer INSIDE the game state
   (st.rs), which is the same discipline js/klabb.js runs on and it is
   what makes replay honest: (opts, seed, log) rebuilds the match to
   the bit, so undo, autosave and two phones in lockstep are all the
   same operation.

   THE SCORING VARIANT, WRITTEN DOWN SO NOBODY GUESSES LATER
     · match plays to 100 points
     · knock at 10 deadwood or less; the knocker scores the DIFFERENCE
     · GIN (no deadwood after the discard) scores 25 + all of the
       other hand's deadwood, and nothing may be laid off against it
     · UNDERCUT — the defender, after laying off, holding EQUAL or
       less deadwood than the knocker — scores the difference plus 25.
       Equal counts as an undercut: the knocker took the risk.
     · the defender's lay-offs onto the knocker's melds are computed
       for them, optimally, because tapping cards onto somebody
       else's melds on a phone screen is admin, not play
     · a hand that reaches TWO cards left in the stock without a
       knock is DEAD: no score, same dealer deals again
     · the winner of a hand deals the next (Hoyle); first deal is cut
       from the seed
     · match end: winner takes a 100 GAME BONUS, and both sides take
      25 a hand won (the BOX bonus). A shutout — the loser never won
       a hand's score — DOUBLES the winner's entire total, boxes,
       bonus and all. That is Hoyle's schneider and it is the fun one.

   This file also holds the machine (three levels) and the meld
   solver, because the UI, the AI and the scorer must all agree on
   what the best arrangement of a hand is, and three copies of that
   opinion would eventually be three opinions.

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
/* deadwood price of a card: ace 1, pips face value, tens and courts 10 */
const pts = c => Math.min(10, rankOf(c));
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
   Every meld a hand of up to eleven cards could contain — every set
   of three or four of a rank, every run of three or more in a suit
   INCLUDING its sub-runs, because a card shared between a possible
   set and a possible run is exactly where sub-runs start to matter —
   then a straight search over disjoint combinations for the least
   deadwood. Eleven cards give a couple of dozen candidate melds at
   the very worst; the search is nothing.

   best(cards) -> { dw, melds:[[c,...],...], dead:[c,...] }
   all optimal arrangements (capped) are kept because the DEFENDER's
   lay-off answer can differ between two arrangements with the same
   deadwood, and the defender is entitled to the best of them.
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

const MAX_ARR = 10;
function best(cards) {
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

/* the least deadwood this ELEVEN-card hand can reach by discarding
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

/* ── lay-offs ─────────────────────────────────────────────────────
   The defender's dead cards, pressed onto the knocker's declared
   melds. A fixpoint — a laid-off card can open the door for the
   next (6♠ onto a 3-4-5♠ run lets the 7♠ follow) — over EVERY
   optimal defender arrangement, keeping the one that leaves the
   least deadwood. Deterministic, so both phones agree. */
function layOff(defArr, knockMelds) {
  /* knocker melds as mutable frames */
  const frames = knockMelds.map(m => {
    const rr = m.map(rankOf);
    const set = m.length >= 2 && rankOf(m[0]) === rankOf(m[1]);
    return set
      ? { set: true, rank: rankOf(m[0]), n: m.length }
      : { set: false, suit: suitOf(m[0]), lo: Math.min.apply(null, rr), hi: Math.max.apply(null, rr) };
  });
  const laid = [];
  let dead = defArr.dead.slice().sort((a, b) => pts(b) - pts(a) || a - b);
  let moved = true;
  while (moved) {
    moved = false;
    for (let i = 0; i < dead.length; i++) {
      const c = dead[i], r = rankOf(c), s = suitOf(c);
      const f = frames.find(fr => fr.set
        ? (fr.rank === r && fr.n < 4)
        : (fr.suit === s && (r === fr.lo - 1 || r === fr.hi + 1)));
      if (!f) continue;
      if (f.set) f.n++;
      else if (r === f.lo - 1) f.lo = r; else f.hi = r;
      laid.push(c);
      dead.splice(i, 1);
      moved = true;
      break;
    }
  }
  return { dead, laid, dw: handPts(dead) };
}

function defenderAfterLayoff(defCards, knockMelds) {
  const b = best(defCards);
  let out = null;
  for (const arr of b.arrs) {
    const r = layOff(arr, knockMelds);
    if (!out || r.dw < out.dw) out = { melds: arr.melds, laid: r.laid, dead: r.dead, dw: r.dw };
  }
  return out || { melds: [], laid: [], dead: defCards.slice(), dw: handPts(defCards) };
}

/* ═══════════════════════════════════════════════════════════════════
   THE STATE
   phases:
     up0     non-dealer looks at the first upcard: take or pass
     up1     the dealer gets the same look after a pass
     draw1   both passed — the non-dealer MUST draw from the stock
     main    the player to move draws: stock or pile
     off     they hold eleven and must put one back: disc or knock
     tally   seat -1: the hand is counted (knock, gin, undercut, dead)
     shuffle seat -1: the next hand is dealt
     over    somebody passed 100 and the bonuses landed
   ═══════════════════════════════════════════════════════════════════ */
const TARGET = 100;
const KNOCK_MAX = 10;
const GIN_BONUS = 25;
const UNDERCUT_BONUS = 25;
const GAME_BONUS = 100;
const BOX_BONUS = 25;

function dealHand(st) {
  const d = [];
  for (let i = 0; i < 52; i++) d.push(i);
  shuffle(st, d);
  const nd = 1 - st.dealer;                    /* non-dealer */
  st.seats[0].hand = [];
  st.seats[1].hand = [];
  for (let i = 0; i < 10; i++) {               /* alternate, non-dealer first */
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
}

function deal(opts, seed) {
  opts = opts || {};
  const st = {
    rs: seed | 0,
    seats: [
      { name: opts.names ? opts.names[0] : 'You', own: 'me', hand: [], lvl: opts.lvl || 2 },
      { name: opts.names ? opts.names[1] : 'The machine', own: 'ai', hand: [], lvl: opts.lvl || 2 }
    ],
    dealer: 0,
    stock: [], discard: [],
    turn: 0, phase: 'up0', drew: null, taken: [[], []], reveal: null,
    handNo: 1, plies: 0, moves: 0,
    match: { pts: [0, 0], boxes: [0, 0], book: [], target: opts.target || TARGET },
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
        const b = best(h.filter(x => x !== c));
        if (b.dw <= KNOCK_MAX) out.push({ t: 'knock', c });
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
      if (mv.t !== 'disc' && mv.t !== 'knock') return false;
      const h = st.seats[seat].hand;
      if (h.indexOf(mv.c) < 0) return false;
      if (st.drew && st.drew.from === 'pile' && mv.c === st.drew.c) return false;
      if (mv.t === 'knock') return best(h.filter(x => x !== mv.c)).dw <= KNOCK_MAX;
      return true;
    }
    case 'tally': return mv.t === 'tally';
    case 'shuffle': return mv.t === 'next';
  }
  return false;
}

/* ── the count, once somebody has knocked (or the stock died) ────── */
function settle(st) {
  const rv = st.reveal;
  const row = { hand: st.handNo, dealer: st.dealer };
  if (rv.dead) {
    row.dead = true;
    row.score = 0;
    row.win = -1;
    st.match.book.push(row);
    return;                                    /* same dealer deals again */
  }
  const k = rv.seat, d = 1 - k;
  const kb = best(st.seats[k].hand);
  const gin = kb.dw === 0;
  const def = gin
    ? { melds: best(st.seats[d].hand).melds, laid: [],
        dead: best(st.seats[d].hand).dead, dw: best(st.seats[d].hand).dw }
    : defenderAfterLayoff(st.seats[d].hand, kb.melds);
  row.knocker = k;
  row.gin = gin;
  row.kdw = kb.dw;
  row.ddw = def.dw;
  row.laid = def.laid.length;
  rv.kMelds = kb.melds; rv.kDead = kb.dead;
  rv.dMelds = def.melds; rv.dDead = def.dead; rv.dLaid = def.laid;
  if (gin) {
    row.win = k; row.how = 'gin';
    row.score = GIN_BONUS + def.dw;
  } else if (def.dw <= kb.dw) {
    row.win = d; row.how = 'undercut';
    row.score = UNDERCUT_BONUS + (kb.dw - def.dw);
  } else {
    row.win = k; row.how = 'knock';
    row.score = kb.dw === def.dw ? 0 : def.dw - kb.dw;
  }
  st.match.pts[row.win] += row.score;
  st.match.boxes[row.win]++;
  st.match.book.push(row);
  st.dealer = row.win;                         /* the winner deals the next */

  if (st.match.pts[row.win] >= st.match.target) {
    const w = row.win, l = 1 - w;
    const shutout = st.match.pts[l] === 0;
    const fin = {
      winner: w,
      raw: st.match.pts.slice(),
      boxes: st.match.boxes.slice(),
      shutout,
      hands: st.match.book.filter(r => !r.dead).length,
      total: [0, 0]
    };
    fin.total[w] = st.match.pts[w] + GAME_BONUS + st.match.boxes[w] * BOX_BONUS;
    fin.total[l] = st.match.pts[l] + st.match.boxes[l] * BOX_BONUS;
    if (shutout) fin.total[w] *= 2;             /* Hoyle: the lot, doubled */
    st.final = fin;
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
      if (st.stock.length <= 2) {              /* the hand died on the vine */
        st.reveal = { dead: true };
        st.phase = 'tally';
      } else {
        st.phase = 'main';
        st.turn = 1 - seat;
      }
      break;
    }
    case 'knock': {
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
   online move so drift is caught, not lied about */
function fingerprint(st) {
  const s = [st.rs, st.moves, st.phase, st.turn, st.dealer,
    st.seats[0].hand.slice().sort((a, b) => a - b).join(','),
    st.seats[1].hand.slice().sort((a, b) => a - b).join(','),
    st.stock.length, st.discard.join(','),
    st.match.pts.join('/'), st.match.boxes.join('/')].join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — three of them
     1 Iż-żiju    takes the shiny card, knocks the moment he can, never
                  wonders what you are collecting
     2 Tal-każin  draws with a plan, discards what costs least
     3 In-nannu   watches what you take off the pile, keeps his
                  discards safe, and holds a good hand back for gin
   Deterministic given the state, which keeps the simulations honest.
   ═══════════════════════════════════════════════════════════════════ */
function wanted(st, foe) {
  /* ranks/suit-neighbourhoods the other player has SHOWN interest in:
     every card they took off the pile is public knowledge */
  return st.taken[foe] || [];
}
function dangerOf(c, wants) {
  let d = 0;
  for (const w of wants) {
    if (rankOf(w) === rankOf(c)) d += 3;
    if (suitOf(w) === suitOf(c) && Math.abs(rankOf(w) - rankOf(c)) <= 2) d += 2;
  }
  return d;
}

function think(st, seat, lvl) {
  lvl = lvl || 2;
  const h = st.seats[seat].hand;
  const ph = st.phase;

  if (ph === 'up0' || ph === 'up1' || ph === 'main') {
    const up = upTop(st);
    const now = best(h).dw;
    const withUp = bestDiscard(h.concat([up]), up);
    /* does the upcard actually sit in a meld once we keep it? */
    const restBest = best(h.concat([up]).filter(x => x !== withUp.picks[0].c));
    const melded = restBest.melds.some(m => m.indexOf(up) >= 0);
    const gain = now - withUp.dw;
    let take;
    if (lvl === 1) take = melded && pts(up) <= 8;
    else if (lvl === 2) take = melded || gain >= 3;
    else take = (melded && gain >= 1) || gain >= 3;
    if (ph === 'main') return take ? { t: 'take' } : { t: 'draw' };
    return take ? { t: 'take' } : { t: 'pass' };
  }
  if (ph === 'draw1') return { t: 'draw' };

  if (ph === 'off') {
    const banned = (st.drew && st.drew.from === 'pile') ? st.drew.c : null;
    const cand = [];
    for (const c of h) {
      if (c === banned) continue;
      const b = best(h.filter(x => x !== c));
      cand.push({ c, dw: b.dw });
    }
    cand.sort((a, b) => a.dw - b.dw || pts(b.c) - pts(a.c) || a.c - b.c);
    let pick = cand[0];
    if (lvl >= 3) {
      /* among discards within 2 points of the best, prefer the SAFE one */
      const wants = wanted(st, 1 - seat);
      const close = cand.filter(x => x.dw <= cand[0].dw + 2);
      close.sort((a, b) =>
        (a.dw + dangerOf(a.c, wants) * 1.5) - (b.dw + dangerOf(b.c, wants) * 1.5) ||
        pts(b.c) - pts(a.c));
      pick = close[0];
    }
    const dw = best(h.filter(x => x !== pick.c)).dw;
    if (dw === 0) return { t: 'knock', c: pick.c };
    if (dw <= KNOCK_MAX) {
      const knockNow =
        lvl === 1 ? true :
        lvl === 2 ? true :
        /* in-nannu holds a tight hand back early, hunting the gin */
        (dw <= 4 || st.plies >= 8);
      if (knockNow) return { t: 'knock', c: pick.c };
    }
    return { t: 'disc', c: pick.c };
  }

  const l = legal(st, seat);
  return l[0] || null;
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE
   ═══════════════════════════════════════════════════════════════════ */
const E = {
  suitOf, rankOf, mk, pts, handPts,
  rnd, shuffle, clone,
  deal, dealHand, legal, check, apply, turn, over, think,
  best, bestDiscard, defenderAfterLayoff, layOff, fingerprint, upTop,
  TARGET, KNOCK_MAX, GIN_BONUS, UNDERCUT_BONUS, GAME_BONUS, BOX_BONUS
};

if (typeof module !== 'undefined' && module.exports) module.exports = E;
else {
  root.KARTI_GIN = root.KARTI_GIN || {};
  root.KARTI_GIN.E = E;
}

})(typeof window !== 'undefined' ? window : globalThis);
