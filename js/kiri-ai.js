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

/* loaded twice — a stale service worker, a duplicated <script> — is a
   real way to end up with two sets of listeners on one board. */
if (window.KIRI_AI) return;


const K = window.KIRI;
if (!K) return;

const B = K.BOARD, G_ROUPS = K.GROUPS;
/* G_ROUPS is for NUMBERS -- build costs, membership. Anything a PLAYER reads
   has to come from the active theme, or a fantasy board explains itself in
   Maltese. */
const gname = k => (K.groupNameOf ? K.groupNameOf(k) : (G_ROUPS[k] || {}).n) || '';

/* ═══════════════════════════════════════════════════════════════════
   0. THE BOARD'S OWN SCALE — WHY THERE ARE NO BARE NUMBERS BELOW
   This file used to be full of them: a 60 in the buy rule, a 250 in
   the build rule, a 120 in the trade rule, a cash ladder that ran
   60/140/240/360/500. Every one of those was a judgement about a board
   with 32 squares, 16 properties and six colours. That board is gone —
   it is the canonical 40 / 22 / 8 now, with Monopoly's own price and
   rent ladders — and on the new one there are 28 lots to buy instead
   of 22, 29% more capital to find, and a lap is 40 squares long
   instead of 32, so the same wage buys 20% less per roll. The numbers
   did not follow. Measured over 400 games: auctions that closed with a
   bidder still in the room who wanted the lot went from 3 to 22, and
   the whole difficulty ladder had turned upside down — see §2.

   So nothing below is typed as a quantity of money. Everything is a
   multiple of something the board itself states, and the next time
   somebody moves a square this file moves with it.
   ═══════════════════════════════════════════════════════════════════ */
const DEEDS = B.filter(s => s.price > 0);            /* every lot with a price: 28 */
const PROPS = B.filter(s => s.t === 'prop');         /* the buildable ones: 22 */
const NSQ   = B.length;                              /* 40 */
/* the middling lot. The unit for anything that is "about the price of
   a property" — trade change, the smallest interesting margin. */
const AVG   = Math.round(DEEDS.reduce((n, s) => n + s.price, 0) / DEEDS.length);
const CHEAP = DEEDS.reduce((m, s) => Math.min(m, s.price), Infinity);
/* one lap of wages. The unit for anything that is a CUSHION, because a
   cushion is measured in how long it takes to earn it back. */
const SAL   = K.SALARY || 200;
/* rolls to get round once — 7 is the mean of two dice. Every "for the
   first N rounds" rule is really "for the first so-many laps", and a
   lap got 25% longer. */
const LAP   = NSQ / 7;
/* the smallest bid worth the breath, in the same coin as the cheapest
   lot on the board */
const TICK  = Math.max(5, Math.round(CHEAP * 0.15 / 5) * 5);

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
                     under-builds, she lets an auction go to somebody
                     else for a tenner, and she says yes to almost any
                     trade.
     2  Il-Ħabib   — plays properly, no flair.
     3  L-Iżviluppatur — buys early, buys everything, builds to three
                     floors on every set it finishes, and comes and
                     asks you for the square it needs.

   One table, so the ladder can be read as a ladder instead of being
   hunted for down six functions. Everything here is a MULTIPLIER; the
   quantity it multiplies comes from §0.

     res    reserve floor, in laps of wages
     dgr    and how much of the biggest rent standing on the board it
            adds to that
     cap    the most it will ever sit on, in laps of wages
     grab   the opening land-grab, in laps
     thin   how far under the reserve it will go for a deed that
            finishes or blocks a set (0 = never)
     bid    what fraction of its own valuation it will actually bid
     bank   extra cushion it wants before it lays a floor, in laps —
            NEGATIVE means it will dip into the reserve to build, which
            is what "L-Iżviluppatur" is for. It costs it about three
            points of win rate and it doubles the houses on the board,
            and a machine that never lays a floor is not worth playing.
     snipe  the share of the asking price below which it would rather
            let the lot go under the hammer and win it there (0 = off)
     tier   how many whole tiers of a set it wants to be able to pay
            for before it lays the first floor of one (0 = no discipline)
     clock  how much tighter that cushion gets as the buzzer nears
     three  how hard it pushes every set to three floors first
     marg   the margin it wants on a trade
     gift   the share of YOUR gain it charges for finishing YOUR set  */
const DIAL = {
  1: { res:1.60, dgr:1.20, cap:6.0, grab:0,    thin:0,    bid:0.40, bank: 1.25, tier:0, snipe:0,    clock:0,   three:1.35, marg:-0.05, gift:0.45 },
  2: { res:0.60, dgr:0.70, cap:4.5, grab:0.70, thin:0.35, bid:1.00, bank:-0.40, tier:1, snipe:0,    clock:0.5, three:1.60, marg: 0.05, gift:0.65 },
  3: { res:0.75, dgr:0.70, cap:4.5, grab:1.10, thin:0.25, bid:1.00, bank:-0.80, tier:1, snipe:1.00, clock:3.0, three:1.85, marg: 0.12, gift:0.85 },
};
const levelOf = P => (P.level == null ? 2 : (P.level < 1 ? 1 : P.level > 3 ? 3 : P.level));
const dialOf  = P => DIAL[levelOf(P)];

/* how far through a TIMED game we are, 0 at the first roll and 1 at the
   buzzer — and flat 0 for ever when there is no buzzer at all, because
   in a to-the-end game net worth is not the prize and a mortgage you
   can redeem in twenty rounds' time is not a permanent hole. */
function runOut(G){
  const end = G.roundLimit > 0 ? G.roundLimit : 0;
  if (!end) return 0;
  return Math.min(1, Math.max(0, G.round / end));
}

function reserve(G, p){
  const P = G.players[p];
  const D = dialOf(P);
  const d = danger(G, p);
  /* AND IT READS THE CLOCK. On a round limit the winner is whoever is
     worth the most at the buzzer, and a floor sold back to the bank at
     half price is a permanent hole in that number — early there are
     laps enough to earn it back and near the buzzer there are not. So
     the cushion tightens as a timed game runs down, and does nothing at
     all in a to-the-end one, where the way to win is still to build
     until somebody cannot pay. The round counter is on screen from the
     first turn; this is the clock everybody at the table is reading. */
  let r = Math.round(SAL * D.res * (1 + D.clock * runOut(G)) + d * D.dgr);
  if (P.auto) r = Math.max(r, Math.round(SAL * 1.25)) + Math.round(SAL * 0.75);
  return Math.min(r, Math.round(SAL * D.cap));
}

const conservative = P => !!P.auto;

/* ── THE FLOOR IT WILL ACTUALLY KEEP ──────────────────────────────
   TWO BUGS LIVED HERE, and both of them were about this number being
   used inconsistently.

   FIRST: a reserve bigger than the money in your hand is not caution,
   it is paralysis. It stopped the machine buying the lot AND stopped
   it bidding ten euro for the same lot at the auction that followed,
   so the lot ended up belonging to nobody. Every single one of the 63
   auctions that closed unsold in a 400-game sweep was cash-bound, not
   value-bound. So the floor can never be more than a share of the cash
   that is actually there.

   SECOND, and much worse: buying used the WHOLE reserve and bidding
   used HALF of it. That made declining to buy strictly better than
   buying — decline, let it go under the hammer, then win it back for a
   tenner because everybody else is broke too. It was worth 911 a game
   in free equity, it was the biggest single term in the score, and it
   was the hoarder who collected it: level 1 beat level 3 sixty-two
   times in a hundred with the ladder pointing the wrong way. One floor
   now, for both decisions, so a seat that would not pay the price
   cannot bid the price either.                                       */
const FLOOR_SHARE = 0.75;

function cashFloor(G, p, i){
  const P = G.players[p];
  let r = reserve(G, p);
  /* a deed that finishes or blocks a set is worth going a bit thin for */
  const D = dialOf(P), sq = (i == null ? null : B[i]);
  if (!conservative(P) && D.thin > 0 && sq && sq.price &&
      gainOf(G, p, i) > sq.price * 1.6) r = Math.round(r * D.thin);
  return Math.min(r, Math.round(P.cash * FLOOR_SHARE));
}

/* ═══════════════════════════════════════════════════════════════════
   3. THE DECISIONS
   ═══════════════════════════════════════════════════════════════════ */

/* ── buy or let it go to auction ─────────────────────────────────── */
function wantsBuy(G, p){
  const P = G.players[p];
  const i = P.pos, sq = B[i];
  if (!sq.price || G.own[i] >= 0 || P.cash < sq.price) return false;
  const after = P.cash - sq.price;
  const D = dialOf(P);

  /* the opening: land grab. Everything worth having is unowned and the
     rents are pennies, so the only mistake is being slow. Measured in
     LAPS, not rounds — the board got eight squares longer and a rule
     written as "the first three rounds" quietly became two thirds of
     the opening it was meant to be. Your aunt does not believe in any
     of this and it is why she never wins. */
  if (!conservative(P) && D.grab > 0 && G.round <= Math.round(LAP * D.grab) &&
      after >= Math.max(CHEAP, Math.round(danger(G, p) * 0.35))) return true;

  if (after < cashFloor(G, p, i)) return false;

  /* THE LOT YOU CAN HAVE FOR LESS BY NOT BUYING IT.
     Declining sends it under the hammer, and a hammer only ever asks
     for one step more than the best of the other wallets in the room.
     Those wallets are face up on the table — this is the same
     arithmetic anybody sitting there could do, and it reads no card
     order. If nobody else can get anywhere near the asking price, then
     paying the asking price is paying the bank a premium for being in
     a hurry, and the difference is pure equity: the round limit values
     a deed at its face whatever you paid for it.
     Level 3 only. It is the sharpest thing on the table and it is what
     "L-Iżviluppatur" is supposed to feel like from the other side. */
  if (D.snipe > 0 && !conservative(P)){
    const cheaper = Math.round(sq.price * D.snipe);
    if (topRival(G, p, i) + TICK <= cheaper && bidTo(G, p, i) > cheaper) return false;
  }
  return true;
}

/* the deepest pocket at this table other than mine, for this one lot.
   Cash is public; so is every deed and every floor on it. */
function topRival(G, p, i){
  let best = 0;
  for (const q of G.players){
    if (q.out || q.i === p) continue;
    const c = Math.min(q.cash, Math.round(gainOf(G, q.i, i) * 0.85));
    if (c > best) best = c;
  }
  return best;
}

/* ── the auction ─────────────────────────────────────────────────── */
function bidTo(G, p, i){
  const P = G.players[p];
  const sq = B[i];
  const gain = gainOf(G, p, i);
  /* the SAME floor the buy decision uses, so declining is not a way of
     getting the lot cheaper off itself */
  let cap = Math.min(P.cash - cashFloor(G, p, i), Math.round(gain * 0.85));
  if (conservative(P)) cap = Math.min(cap, sq.price);            /* never over the odds */
  cap = Math.round(cap * dialOf(P).bid);
  return Math.max(0, Math.min(cap, P.cash));
}

function bid(G, p, i, current){
  const cap = bidTo(G, p, i);
  const at = current || 0;
  if (cap <= at) return 0;
  /* THE STEP MUST NEVER BE THE REASON NOBODY BIDS. It used to add a
     fixed increment and pass if that overshot the cap, so a seat whose
     cap was 15 on a lot whose step was 20 said nothing at all and the
     lot went unsold — 19 of the 63 unsold auctions in the sweep. Walk
     up in steps, but if the next step is over the top, bid the top. */
  const step = Math.max(TICK, Math.round((B[i].price || AVG) * 0.08 / TICK) * TICK);
  return Math.min(cap, at + step);
}

/* ── the queue ───────────────────────────────────────────────────── */
function jailPlan(G, p){
  const P = G.players[p];
  /* Late on, with the board built out, the queue is the safest room in
     the country: you cannot land on anybody's penthouse while you are
     in it. Early on, get out and buy things. */
  const built = G.own.reduce((n, o, i) => n + ((o >= 0 && o !== p && G.lvl[i] > 0) ? 1 : 0), 0);
  /* "three built squares" was a fifth of the old board's sixteen
     properties. It is a fifth of twenty-two that matters now. */
  const hide = built >= Math.max(2, Math.round(PROPS.length * 0.19)) && P.jail < 3;
  if (hide && levelOf(P) >= 2) return 'roll';
  if (P.skips > 0) return 'skip';
  if (P.cash >= K.BAIL + reserve(G, p)) return 'bail';
  return 'roll';
}

/* ── building ────────────────────────────────────────────────────── */
/* the classic shape of a good build: get every set you own to three
   floors before you take any of them to four, because three floors is
   where the rent curve stops being polite.

   AND DO NOT START WHAT YOU CANNOT FINISH. This is the change that
   turned the ladder back the right way up. The engine makes you build
   EVENLY, so one floor on one square of a three-square set is one
   third of a tier and one third of a tier buys almost nothing: on the
   new board Il-Mosta goes 18 → 90 for the first floor and 90 → 700
   for the third. A machine that laid single floors whenever it had
   the change for one spent its whole game in the flat part of the
   rent curve, and then had to sell those floors back to the bank at
   half price the first time somebody's Sliema flat came up. Measured
   over 300 games: it sold 2.2 floors a game and lost more in the
   selling than the floors had ever earned.

   So `tier` is how many complete tiers of a set it wants to be able to
   pay for before it lays the first floor of one. The developer commits
   or it waits; your aunt still buys one brick at a time. */
function nextBuild(G, p){
  const P = G.players[p];
  const D = dialOf(P);
  /* an empty seat never digs into its own reserve to put a floor up:
     it builds, but only out of money the person would not miss */
  const bank = conservative(P) ? 1.0 : D.bank;
  const spare = P.cash - reserve(G, p) - Math.round(SAL * bank);
  if (spare <= 0) return -1;
  let best = -1, bestScore = -1;
  for (const key of Object.keys(G_ROUPS)){
    const set = G_ROUPS[key].props;
    if (!set.every(x => G.own[x] === p)) continue;
    /* what it would take to raise this whole set by D.tier tiers */
    if (D.tier > 0){
      const low = set.reduce((m, x) => Math.min(m, G.lvl[x]), 5);
      const want = set.reduce((n, x) => n + Math.max(0, low + D.tier - G.lvl[x]), 0);
      if (want * G_ROUPS[key].build > spare) continue;
    }
    for (const i of set){
      if (!K.canBuild(G, p, i)) continue;
      const cost = K.buildCost(i);
      if (cost > spare) continue;
      const now = K.rentOf(G, i, 7);
      const then = B[i].rent[G.lvl[i] + 1];
      let sc = (then - now) / cost;                 /* extra rent per euro spent */
      if (G.lvl[i] < 3) sc *= D.three;              /* the three-floor rule */
      if (G.lvl[i] === 4) sc *= 0.75;               /* penthouses are a luxury */
      if (sc > bestScore){ bestScore = sc; best = i; }
    }
  }
  return best;
}

/* ── clearing mortgages when flush ───────────────────────────────── */
function nextUnmortgage(G, p){
  const P = G.players[p];
  const spare = P.cash - reserve(G, p) - Math.round(SAL * 1.25);
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
  /* THE REASON TRAVELS AS A NUMBER. Every one of these lines is
     REFUSAL_LINES[code] in js/kiri.js, so the machine's own words come
     out of the engine on every phone in the room rather than out of
     this file on one of them. `gi` names a colour group by one of its
     squares, for the only line that has a group in it. */
  if (conservative(P)) return { ok:false, code:1, why:'That seat is on autopilot and is not signing anything.' };

  const me = delta(G, p, o);
  const them = delta(G, p === o.from ? o.to : o.from, o);
  const other = (p === o.from ? o.to : o.from);
  const D = dialOf(P);

  /* cash sanity — never trade down to nothing */
  const outgoing = (p === o.from ? (o.cashFrom || 0) : (o.cashTo || 0));
  if (outgoing > P.cash - Math.round(cashFloor(G, p, null) * 0.5))
    return { ok:false, code:2, why:'Not with that much cash out of the door.' };

  if (me <= 0) return { ok:false, code:3, why:'That is worse for me than doing nothing.' };

  const gift = completesFor(G, o, other);
  if (gift){
    /* handing over the last square of somebody's set: they must be
       paying most of what it is worth to them */
    if (me < them * D.gift) return { ok:false, code:4, gi:G_ROUPS[gift].props[0],
                            why:'You want ' + gname(gift) + ' finished. That costs more.' };
  }

  /* the smallest margin worth signing for is a fraction of a lot, not a
     fraction of a number somebody typed in 2026 */
  const basis = Math.max(Math.round(AVG * 0.6), Math.abs(them));
  if (me < basis * D.marg) return { ok:false, code:5, why:'Close. Not close enough.' };
  return { ok:true, code:0, why:'Done.' };
}

/* find an offer worth making. The machine only ever asks for the ONE
   square it is short of, and pays for it in a deed the other side
   wants plus cash — which is exactly how a real trade at a real table
   gets done. */
function proposeTrade(G, p){
  const P = G.players[p];
  if (conservative(P)) return null;               /* autopilot proposes nothing */
  /* a table where every lot has changed hands one and a half times has
     had enough dealing for one evening */
  if (G.stat.trades > Math.round(DEEDS.length * 1.5)) return null;

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

    /* the change it is prepared to put on top, as a share of what it is
       asking for. A fixed 60/140/240/360/500 ladder was change for a
       middling lot on the old board and an insult for the Mdina house
       on this one. */
    const ladder = [0, 0.3, 0.7, 1.2, 1.8, 2.5]
      .map(f => Math.round((B[want].price || AVG) * f / TICK) * TICK);

    for (let n = 0; n <= Math.min(2, givables.length); n++){
      const give = givables.slice(0, n);
      /* cash to make up the difference, from THEIR point of view */
      for (const extra of ladder){
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
    return { k: v.ok ? 'acceptTrade' : 'declineTrade', why: v.why, code: v.code, gi: v.gi };
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

/* ═══════════════════════════════════════════════════════════════════
   7. TAKING THE ACTION — THROUGH THE DOOR, NEVER AROUND IT
   ───────────────────────────────────────────────────────────────────
   This used to call the engine's mutators directly, which was fine
   while the only thing that could move a piece was this phone. It is
   not fine now: js/kiri.js §20 has one door, apply(G, seat, move),
   and a move that does not go through it is a move the transport
   never sees — so a machine seat the host is playing would move on
   the host's screen and nowhere else.

   So next() still decides WHAT, and this turns it into the engine's
   own move object and hands it in. Nothing here mutates G.
   ═══════════════════════════════════════════════════════════════════ */

/* next()'s action -> the engine's move, and the chair making it */
function toMove(G, a){
  switch (a.k){
    case 'roll':        return { t:'roll' };
    case 'card':        return { t:'card' };
    case 'buy':         return { t:'buy' };
    case 'pass':        return { t:'decline' };
    case 'bid':         return { t:'bid', n:a.n };
    case 'auctionPass': return { t:'pass' };
    case 'build':       return { t:'build', i:a.i };
    case 'unmortgage':  return { t:'unmortgage', i:a.i };
    case 'mortgage':    return { t:'mortgage', i:a.i };
    case 'sell':        return { t:'sell', i:a.i };
    case 'settle':      return { t:'settle' };
    case 'bail':        return { t:'bail' };
    case 'skip':        return { t:'skip' };
    case 'bankrupt':    return { t:'bankrupt' };
    case 'end':         return { t:'end' };
    case 'offer': {
      const o = a.offer || {};
      return { t:'offer', to:o.to, propsFrom:o.propsFrom, propsTo:o.propsTo,
               cashFrom:o.cashFrom, cashTo:o.cashTo,
               skipsFrom:o.skipsFrom, skipsTo:o.skipsTo };
    }
    case 'acceptTrade':  return { t:'accept' };
    case 'declineTrade': {
      const m = { t:'refuse', n: a.code == null ? 0 : a.code };
      if (a.gi != null) m.i = a.gi;
      return m;
    }
  }
  return null;
}

/* the chair this action belongs to. actorOf() is the engine's own
   answer to that question, so the machine and a finger and a packet
   all get it from the same place. */
function seatFor(G, a){
  const mv = toMove(G, a);
  if (!mv) return -1;
  if (a.seat != null) return a.seat;
  return K.actorOf(G, mv.t);
}

function perform(G, a, src){
  if (!a) return false;
  const mv = toMove(G, a);
  if (!mv) return false;
  const seat = (a.seat != null) ? a.seat : K.actorOf(G, mv.t);
  if (seat < 0) return false;
  return K.apply(G, seat, mv, src || 'ai').ok;
}

window.KIRI_AI = {
  DIAL, levelOf, cashFloor,
  score, gainOf, danger, reserve,
  wantsBuy, bidTo, bid, jailPlan, nextBuild, nextUnmortgage,
  judge, proposeTrade, delta, completesFor,
  raiseStep, next, perform, toMove, seatFor,
};

})();
