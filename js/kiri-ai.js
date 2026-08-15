/* ═══════════════════════════════════════════════════════════════════
   KARTI — kiri-ai.js
   IL-KIRI · THE MACHINE PLAYER, AND THE AUTOPILOT

   Two jobs in one file, because they are the same brain wearing two
   different hats.

   1. THE OPPONENT. A machine seat you would actually choose to play
      against: it values a deed by what it does to a SET rather than
      by its price tag, it holds cash back against the biggest rent
      currently standing on the board, it builds to three floors
      before it builds to four, and it will come and ask you for the
      one property it is short of.

   2. THE AUTOPILOT. When a human seat goes quiet — closed tab, dead
      signal, phone in a pocket — the same brain plays that seat so
      the table never stalls. But it plays it in CONSERVATIVE mode,
      because coming back to find the machine mortgaged your Sliema
      set and swapped your Mdina house for a garage is worse than the
      game having simply waited. In that mode it:
        · never proposes a trade
        · declines every trade offered to it, without exception
        · keeps a much larger cash cushion before buying
        · never bids over the face price at auction
        · still builds, still pays its debts, still rolls its dice

   FAIR PLAY. The only hidden information in IL-KIRI is the order of
   the two card decks. This file never reads G.deck[*].order — search
   it if you like. Everything else on the table is face up to every
   player, so the machine is looking at exactly what you are.

   No DOM in here either. It returns an ACTION and, if asked, applies
   it; js/kiri-ui.js decides how long to take over each one.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KIRI;
if (!K) return;

const B = K.BOARD, G_ROUPS = K.GROUPS;

/* ═══════════════════════════════════════════════════════════════════
   1. HOW MUCH IS A DEED WORTH TO ME
   Not its price. Its price is what the bank charges; its VALUE is
   what it does to the sets I am trying to finish and the sets I am
   trying to stop somebody else finishing.

   score() is the whole engine of the AI's judgement: hand it a
   hypothetical ownership array and it says what the table is worth to
   one player. Buying, bidding, trading and liquidating are all just
   "which choice makes score() biggest".
   ═══════════════════════════════════════════════════════════════════ */

/* a colour set is worth far more than the sum of its parts, and the
   curve is deliberately steep at the top: two of three is nice, three
   of three is the game */
function setMult(mine, len){
  if (len <= 0) return 1;
  const f = mine / len;
  return 1 + 1.6 * f * f;
}
const RAIL_MULT = [1, 1.05, 1.35, 1.8, 2.4];      /* by how many of the four */

function score(G, p, own, lvl, mort, cash){
  own  = own  || G.own;
  lvl  = lvl  || G.lvl;
  mort = mort || G.mort;
  cash = (cash == null ? G.players[p].cash : cash);
  let s = cash;

  /* how many of each set does everybody hold, in this hypothetical */
  const seen = {};
  for (let i = 0; i < B.length; i++){
    if (own[i] !== p) continue;
    const sq = B[i];
    const price = sq.price || 0;
    let v = price;

    if (sq.t === 'prop'){
      const set = G_ROUPS[sq.g].props;
      const mine = set.filter(x => own[x] === p).length;
      v = price * setMult(mine, set.length);
      /* denial: holding one square of a set an opponent otherwise owns
         is worth more than the square. That is the whole reason people
         refuse to sell you the brown one. */
      const others = set.filter(x => own[x] >= 0 && own[x] !== p);
      if (mine < set.length && others.length === set.length - mine){
        const who = own[others[0]];
        if (others.every(x => own[x] === who)) v += price * 0.55;
      }
      if (lvl[i] > 0) v += (lvl[i] === 5 ? 5 : lvl[i]) * G_ROUPS[sq.g].build * 1.5;
    } else if (sq.t === 'rail'){
      const mine = K.RAILS.filter(x => own[x] === p).length;
      v = price * RAIL_MULT[Math.min(4, mine)];
    } else if (sq.t === 'util'){
      const mine = K.UTILS.filter(x => own[x] === p).length;
      v = price * (mine >= 2 ? 1.55 : 0.95);
    }
    if (mort[i]) v = v * 0.45;      /* a mortgaged deed earns nothing today */
    s += v;
    seen[i] = 1;
  }
  return s;
}

/* what would owning square i be worth to p, right now */
function gainOf(G, p, i){
  const before = score(G, p);
  const own = G.own.slice();
  own[i] = p;
  return score(G, p, own) - before;
}

/* ═══════════════════════════════════════════════════════════════════
   2. HOW MUCH CASH TO SIT ON
   The single most common way a machine player embarrasses itself is
   spending its last euro on a garage and then landing on a built
   Sliema flat. So the reserve is the biggest rent currently standing
   on the board that somebody else could charge it.
   ═══════════════════════════════════════════════════════════════════ */
function danger(G, p){
  let worst = 0;
  for (let i = 0; i < B.length; i++){
    const o = G.own[i];
    if (o < 0 || o === p || G.mort[i]) continue;
    const r = K.rentOf(G, i, 7);
    if (r > worst) worst = r;
  }
  return worst;
}

/* THE THREE LEVELS
     1  Iż-Żijuwa  — your aunt. Sits on her money, waits for the right
                     one to come up, and it never does. She hoards, she
                     under-builds and she says yes to almost any trade.
     2  Il-Ħabib   — plays properly, no flair.
     3  L-Iżviluppatur — buys early, buys everything, builds to three
                     floors on every set it finishes, and comes and
                     asks you for the square it needs.
   Cash reserve is the main dial: too big and you never own anything,
   which is exactly how a cautious player loses this game. */
function reserve(G, p){
  const P = G.players[p];
  const lvl = P.level == null ? 2 : P.level;
  const d = danger(G, p);
  let r;
  if (lvl <= 1) r = 320 + Math.round(d * 1.2);      /* hoards, buys late, loses */
  else if (lvl === 2) r = 110 + Math.round(d * 0.7);
  else r = 70 + Math.round(d * 0.55);
  if (P.auto) r = Math.max(r, 250) + 150;    /* autopilot sits on its hands */
  return Math.min(r, lvl <= 1 ? 1200 : 900);
}

const conservative = P => !!P.auto;

/* ═══════════════════════════════════════════════════════════════════
   3. THE DECISIONS
   ═══════════════════════════════════════════════════════════════════ */

/* ── buy or let it go to auction ─────────────────────────────────── */
function wantsBuy(G, p){
  const P = G.players[p];
  const i = P.pos, sq = B[i];
  if (!sq.price || G.own[i] >= 0 || P.cash < sq.price) return false;
  const after = P.cash - sq.price;
  const res = reserve(G, p);
  const gain = gainOf(G, p, i);
  const lvl = P.level == null ? 2 : P.level;

  /* the opening: land grab. Everything worth having is unowned and the
     rents are pennies, so the only mistake is being slow. Your aunt
     does not believe in this and it is why she never wins. */
  if (!conservative(P) && lvl >= 2 && G.round <= (lvl >= 3 ? 5 : 3) && after >= 60) return true;

  if (after >= res) return true;
  /* a deed that finishes or blocks a set is worth going a bit thin for */
  if (lvl >= 2 && gain > sq.price * 1.6 && after >= Math.round(res * 0.35)) return true;
  return false;
}

/* ── the auction ─────────────────────────────────────────────────── */
function bidTo(G, p, i){
  const P = G.players[p];
  const sq = B[i];
  const gain = gainOf(G, p, i);
  const res = reserve(G, p);
  let cap = Math.min(P.cash - Math.round(res * 0.5), Math.round(gain * 0.85));
  if (conservative(P)) cap = Math.min(cap, sq.price);            /* never over the odds */
  const lvl = P.level == null ? 2 : P.level;
  if (lvl <= 1) cap = Math.round(cap * 0.8);
  return Math.max(0, Math.min(cap, P.cash));
}

function bid(G, p, i, current){
  const cap = bidTo(G, p, i);
  const step = Math.max(10, Math.round((B[i].price || 100) * 0.08 / 10) * 10);
  const next = (current || 0) + step;
  if (next > cap) return 0;
  return next;
}

/* ── the queue ───────────────────────────────────────────────────── */
function jailPlan(G, p){
  const P = G.players[p];
  /* Late on, with the board built out, the queue is the safest room in
     the country: you cannot land on anybody's penthouse while you are
     in it. Early on, get out and buy things. */
  const built = G.own.reduce((n, o, i) => n + ((o >= 0 && o !== p && G.lvl[i] > 0) ? 1 : 0), 0);
  const hide = built >= 3 && P.jail < 3;
  const lvl = P.level == null ? 2 : P.level;
  if (hide && lvl >= 2) return 'roll';
  if (P.skips > 0) return 'skip';
  if (P.cash >= K.BAIL + reserve(G, p)) return 'bail';
  return 'roll';
}

/* ── building ────────────────────────────────────────────────────── */
/* the classic shape of a good build: get every set you own to three
   floors before you take any of them to four, because three floors is
   where the rent curve stops being polite. */
function nextBuild(G, p){
  const P = G.players[p];
  const lvl = P.level == null ? 2 : P.level;
  const spare = P.cash - reserve(G, p) - (conservative(P) ? 200 : 0) - (lvl <= 1 ? 250 : 0);
  if (spare <= 0) return -1;
  let best = -1, bestScore = -1;
  for (const key of Object.keys(G_ROUPS)){
    const set = G_ROUPS[key].props;
    if (!set.every(x => G.own[x] === p)) continue;
    for (const i of set){
      if (!K.canBuild(G, p, i)) continue;
      const cost = K.buildCost(i);
      if (cost > spare) continue;
      const now = K.rentOf(G, i, 7);
      const then = B[i].rent[G.lvl[i] + 1];
      let sc = (then - now) / cost;                 /* extra rent per euro spent */
      if (G.lvl[i] < 3) sc *= 1.6;                  /* the three-floor rule */
      if (G.lvl[i] === 4) sc *= 0.75;               /* penthouses are a luxury */
      if (sc > bestScore){ bestScore = sc; best = i; }
    }
  }
  return best;
}

/* ── clearing mortgages when flush ───────────────────────────────── */
function nextUnmortgage(G, p){
  const P = G.players[p];
  const spare = P.cash - reserve(G, p) - 250;
  if (spare <= 0) return -1;
  let best = -1, bestV = 0;
  for (let i = 0; i < B.length; i++){
    if (G.own[i] !== p || !G.mort[i]) continue;
    const c = K.unmortgageCost(i);
    if (c > spare) continue;
    /* clear the ones that unlock a buildable set first */
    const sq = B[i];
    let v = sq.price;
    if (sq.t === 'prop' && K.ownsSet(G, p, i)) v *= 3;
    if (v > bestV){ bestV = v; best = i; }
  }
  return best;
}

/* ═══════════════════════════════════════════════════════════════════
   4. TRADING
   The part that makes the genre work, and the part machine players
   are usually hopeless at. Two halves: judging an offer somebody puts
   in front of it, and finding one worth making.
   ═══════════════════════════════════════════════════════════════════ */

/* apply an offer to a copy of the ownership array */
function afterTrade(G, o){
  const own = G.own.slice();
  (o.propsFrom || []).forEach(i => { own[i] = o.to; });
  (o.propsTo   || []).forEach(i => { own[i] = o.from; });
  return own;
}

/* what an offer does to one player's position, in that player's own
   currency of judgement */
function delta(G, p, o){
  const cashFrom = Math.round(o.cashFrom || 0), cashTo = Math.round(o.cashTo || 0);
  const myCash = G.players[p].cash + (p === o.from ? (cashTo - cashFrom) : (cashFrom - cashTo));
  const own = afterTrade(G, o);
  return score(G, p, own, G.lvl, G.mort, myCash) - score(G, p);
}

/* Does this offer hand somebody else a finished colour set? That is
   not a normal cost, it is a different kind of cost, and it needs
   paying for separately. */
function completesFor(G, o, who){
  const own = afterTrade(G, o);
  for (const key of Object.keys(G_ROUPS)){
    const set = G_ROUPS[key].props;
    const had = set.every(x => G.own[x] === who);
    const has = set.every(x => own[x] === who);
    if (has && !had) return key;
  }
  return null;
}

function judge(G, p, o){
  const P = G.players[p];
  /* AUTOPILOT: no. Not "probably not" — no. A seat being played for
     somebody who is not here does not sign anything. */
  if (conservative(P)) return { ok:false, why:'That seat is on autopilot and is not signing anything.' };

  const me = delta(G, p, o);
  const them = delta(G, p === o.from ? o.to : o.from, o);
  const other = (p === o.from ? o.to : o.from);
  const lvl = P.level == null ? 2 : P.level;

  /* cash sanity — never trade down to nothing */
  const outgoing = (p === o.from ? (o.cashFrom || 0) : (o.cashTo || 0));
  if (outgoing > P.cash - Math.round(reserve(G, p) * 0.5))
    return { ok:false, why:'Not with that much cash out of the door.' };

  if (me <= 0) return { ok:false, why:'That is worse for me than doing nothing.' };

  const gift = completesFor(G, o, other);
  if (gift){
    /* handing over the last square of somebody's set: they must be
       paying most of what it is worth to them */
    const need = them * (lvl >= 3 ? 0.85 : lvl === 2 ? 0.65 : 0.45);
    if (me < need) return { ok:false, why:'You want ' + G_ROUPS[gift].n + ' finished. That costs more.' };
  }

  const margin = lvl >= 3 ? 0.12 : lvl === 2 ? 0.05 : -0.05;
  const basis = Math.max(120, Math.abs(them));
  if (me < basis * margin) return { ok:false, why:'Close. Not close enough.' };
  return { ok:true, why:'Done.' };
}

/* find an offer worth making. The machine only ever asks for the ONE
   square it is short of, and pays for it in a deed the other side
   wants plus cash — which is exactly how a real trade at a real table
   gets done. */
function proposeTrade(G, p){
  const P = G.players[p];
  if (conservative(P)) return null;               /* autopilot proposes nothing */
  if (G.stat.trades > 40) return null;

  let best = null, bestGain = 0;
  for (const key of Object.keys(G_ROUPS)){
    const set = G_ROUPS[key].props;
    const mine = set.filter(x => G.own[x] === p);
    const missing = set.filter(x => G.own[x] >= 0 && G.own[x] !== p);
    if (mine.length !== set.length - 1 || missing.length !== 1) continue;
    if (set.some(x => G.lvl[x] > 0)) continue;
    const want = missing[0];
    const other = G.own[want];
    if (G.players[other].out) continue;
    if (G.players[other].auto) continue;          /* do not lean on an empty seat */

    /* what can I put on the table: a deed they are short of, or one
       that is doing nothing for me */
    const givables = K.holdings(G, p)
      .filter(i => set.indexOf(i) < 0 && !(B[i].t === 'prop' && G_ROUPS[B[i].g].props.some(x => G.lvl[x] > 0)))
      .sort((a, b) => gainOf(G, other, b) - gainOf(G, other, a));

    for (let n = 0; n <= Math.min(2, givables.length); n++){
      const give = givables.slice(0, n);
      /* cash to make up the difference, from THEIR point of view */
      for (const extra of [0, 60, 140, 240, 360, 500]){
        if (extra > P.cash - reserve(G, p)) break;
        const o = { from:p, to:other, propsFrom:give, propsTo:[want], cashFrom:extra, cashTo:0 };
        if (K.tradeLegal(G, o)) continue;         /* illegal → skip (returns a reason string) */
        if (K.wasRefused(G, o)) continue;         /* they have already said no to this */
        const mine2 = delta(G, p, o);
        if (mine2 <= 0) continue;
        const verdict = judge(G, other, o);
        if (!verdict.ok) continue;
        if (mine2 > bestGain){ bestGain = mine2; best = o; }
        break;                                    /* cheapest acceptable extra wins */
      }
    }
  }
  return best;
}

/* ═══════════════════════════════════════════════════════════════════
   5. RAISING MONEY
   Follows K.liquidationList() top to bottom — floors off the cheapest
   group first, then deeds that are not part of a set, then the rest,
   cheapest first. Exactly the same order the RAISE MONEY sheet offers
   a human, so the machine is not using a secret method.
   ═══════════════════════════════════════════════════════════════════ */
function raiseStep(G, p){
  const need = G.debt ? G.debt.amt : 0;
  if (G.players[p].cash >= need) return null;
  const list = K.liquidationList(G, p);
  if (!list.length) return null;
  return list[0];
}

/* ═══════════════════════════════════════════════════════════════════
   6. THE ONE ACTION IT WANTS TO TAKE NEXT
   The UI calls next(), applies it with perform(), draws, waits a beat
   and calls next() again. Stateless, so a reload mid-machine-turn
   simply picks the thread back up.
   ═══════════════════════════════════════════════════════════════════ */
function next(G){
  if (G.over) return null;
  const p = G.turn;
  const P = G.players[p];
  if (P.out) return { k:'end' };

  /* an auction can be waiting on ANY seat, not just whoever's turn it is */
  if (G.phase === 'auction' && G.auction){
    const bidder = K.auctionBidder(G);
    if (bidder < 0) return null;
    if (!K.machineSeat(G, bidder)) return null;           /* a human must answer */
    const n = bid(G, bidder, G.auction.pos, G.auction.bid);
    return n > 0 ? { k:'bid', seat:bidder, n } : { k:'auctionPass', seat:bidder };
  }

  /* a trade offer on the table. If a machine seat has to answer it,
     answer it; if a PERSON has to answer it, everything stops until
     they do — an offer must never be quietly stepped over by the
     proposer ending their own turn. */
  if (G.offer){
    if (!K.machineSeat(G, G.offer.to)) return null;
    const v = judge(G, G.offer.to, G.offer);
    return { k: v.ok ? 'acceptTrade' : 'declineTrade', why: v.why };
  }

  if (!K.machineSeat(G, p)) return null;

  switch (G.phase){
    case 'card':
      return { k:'card' };

    case 'awaitRoll': {
      if (P.jail > 0){
        const plan = jailPlan(G, p);
        if (plan === 'skip' && P.skips > 0) return { k:'skip' };
        if (plan === 'bail' && P.cash >= K.BAIL) return { k:'bail' };
      }
      return { k:'roll' };
    }

    case 'awaitBuy':
      return wantsBuy(G, p) ? { k:'buy' } : { k:'pass' };

    case 'debt': {
      const need = G.debt ? G.debt.amt : 0;
      if (P.cash >= need) return { k:'settle' };
      const step = raiseStep(G, p);
      if (!step) return { k:'bankrupt' };
      return step.kind === 'sell' ? { k:'sell', i:step.i } : { k:'mortgage', i:step.i };
    }

    case 'awaitEnd': {
      const b = nextBuild(G, p);
      if (b >= 0) return { k:'build', i:b };
      const u = nextUnmortgage(G, p);
      if (u >= 0) return { k:'unmortgage', i:u };
      /* one attempt per turn — see G.tradeTries in js/kiri.js */
      if (!G.offer && !(G.tradeTries > 0)){
        const o = proposeTrade(G, p);
        if (o) return { k:'offer', offer:o };
      }
      return { k:'end' };
    }
  }
  return null;
}

/* apply an action through the engine — never around it */
function perform(G, a){
  if (!a) return false;
  switch (a.k){
    case 'roll':        return !!K.roll(G);
    case 'card':        K.applyCard(G); return true;
    case 'buy':         return K.buy(G);
    case 'pass':        return K.declineBuy(G, true);
    case 'bid':         return K.auctionBid(G, a.n);
    case 'auctionPass': return K.auctionPass(G);
    case 'build':       return K.build(G, a.i);
    case 'unmortgage':  return K.unmortgage(G, a.i, G.turn);
    case 'mortgage':    return K.mortgage(G, a.i, G.turn);
    case 'sell':        return K.sellBuilding(G, a.i, G.turn);
    case 'settle':      return K.settle(G);
    case 'bail':        return K.payBail(G);
    case 'skip':        return K.useSkip(G);
    case 'bankrupt':    return K.bankrupt(G, G.turn);
    case 'end':         return K.endTurn(G);
    case 'offer':       G.offer = a.offer; G.tradeTries = (G.tradeTries || 0) + 1; return true;
    case 'acceptTrade': {
      const o = G.offer;
      if (!o) return false;
      const bad = K.doTrade(G, o);
      G.offer = null;
      return !bad;
    }
    case 'declineTrade':
      if (G.offer){ K.say(G, G.players[G.offer.to].name + ' said no. ' + (a.why || '')); K.refuse(G, G.offer); }
      return true;
  }
  return false;
}

window.KIRI_AI = {
  score, gainOf, danger, reserve,
  wantsBuy, bidTo, bid, jailPlan, nextBuild, nextUnmortgage,
  judge, proposeTrade, delta, completesFor,
  raiseStep, next, perform,
};

})();
