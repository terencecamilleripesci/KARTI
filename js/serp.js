/* ═══════════════════════════════════════════════════════════════════
   KARTI — serp.js
   SERP — the engine. Rules only: no DOM, no clock, no rAF, and NO
   Math.random anywhere in this file. The screen half is js/serp-ui.js
   and follows js/poker-ui.js's shape: the engine is pure, the UI owns
   the clock, the wire and the paint.

   THE GAME
     Two to eight snakes in one walled arena. You are always moving.
     You turn, you eat, you get longer, and the moment your head meets
     a wall, your own tail, or somebody else's body, you are out. Last
     snake moving wins the round; if everybody dies in the same breath
     the longest one takes it.

   ── WHY THIS ENGINE LOOKS NOTHING LIKE THE CARD ENGINES ────────────
     Every other engine in this app is LOCKSTEP: one shared log, one
     move at a time, every phone replaying the identical list. That is
     correct for rummy, where a turn takes four seconds and nobody
     notices a hundred milliseconds.

     It is WRONG here, and measurably so. A player's round trip on a 5G
     radio is 50–100ms and it JITTERS inside one session — not a stable
     50, not a stable 100. A snake steps every 120ms. Waiting for eight
     phones to agree before anybody's snake may move means stalling on
     most steps, every step, forever.

     So SERP is built on one structural decision, and everything else
     in this file falls out of it:

     ┌─────────────────────────────────────────────────────────────┐
     │  EVERY SNAKE IS AN INDEPENDENT SIMULATION, AND ITS OWNER IS  │
     │  THE ONLY CLIENT ALLOWED TO ADVANCE, TURN OR KILL IT.        │
     └─────────────────────────────────────────────────────────────┘

     Snakes only touch each other through COLLISION, and collision is
     resolved by the victim: when your head meets something, YOU say so
     and you broadcast it. Nobody else's phone may kill your snake.

     That is the whole referee. There is no host authority, no server
     state, no rollback cascade — because a late message about snake A
     can never invalidate snake B. Re-simulating one snake is O(one
     snake). This is the property that makes the whole thing cheap
     enough to run on a phone and honest enough to run without a
     referee.

     WHAT IT COSTS, said plainly rather than glossed: a player who
     edits this file can decline to die. There is no cryptography here
     and no server check, and adding either would mean the relay
     holding game state, which is the one thing this app's design
     refuses. For a free party game between friends on one island that
     trade is right, and it is written here rather than hidden.

   ── EVERYTHING IS A TICK, NEVER A TIMESTAMP ────────────────────────
     st.step is FIXED for the whole match (it is chosen on the setup
     sheet and never changes mid-round — a snake that speeds up as it
     eats would make tick<->time a non-affine map and every remote
     event would need a clock negotiation to place). So:

         tick N of this match happens at T0 + N*step

     and an event can be stamped {tick, what} instead of {when, what}.
     A message that arrives 180ms late still says exactly which step it
     belonged to, so the receiver applies it RETROACTIVELY — rewind
     that one snake to the last settled snapshot, replay its own event
     list forward. No interpolation guesswork, no "close enough".

     ev(sn) is that list. sn.snap is the snapshot at st.horizon, and
     anything stamped before the horizon is refused rather than applied
     to a past nobody can reach any more (see plan()).

   ── FOOD WITHOUT A REFEREE ─────────────────────────────────────────
     pellet(seed, i) is a pure function: pellet number i is at the same
     cell on all eight phones, forever, derived from the relay's shared
     seed exactly the way skarta and rummy derive a shuffle. Nobody
     sends a pellet position; they send "I ate number 47".

     A pellet may land inside a snake. It is left there — moving it
     would need global state and would therefore need a referee. It is
     eaten by whoever's head next crosses it, which is what a player
     expects anyway.

     TWO SNAKES CLAIMING ONE PELLET is the interesting case, and it is
     not rare at 100ms. settle() resolves it as a pure fold over the
     claim list, sorted by (tick, seat, pellet):

         · EARLIER TICK WINS. It is the same tick on every phone.
         · SAME TICK -> LOWER SEAT INDEX WINS. Arbitrary, stated once,
           identical everywhere, and that is the entire requirement.

     The loser's own phone reaches the same verdict from the same list
     and RETRACTS: it gives back the score and the two segments. That
     is the one place a client accepts an outside correction to its own
     snake, and it is safe precisely because it is not an outside
     correction — it is a pure function of a list the loser also holds.

   ── DETERMINISM ────────────────────────────────────────────────────
     st.seed is the entire RNG. The bots are a pure function of the
     state and a hash of (seed, tick, seat) — never a clock, never
     Math.random — so a bot that is host-owned online broadcasts the
     same turns every other phone would have predicted anyway. The one
     place a brand-new local match picks a seed is js/serp-ui.js's
     newSeed(), which is skarta's and poker's pattern.

   ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────
     There is no build-password hello (js/rummy-ui.js's `houseq1`) and
     no bail-on-unknown-move. Those exist because a lockstep table that
     mishears one move is silently wrong for the rest of the evening.
     SERP has no shared log to drift: an action this build does not
     know is an action about SOMEBODY ELSE'S snake, and ignoring it
     costs at worst one stale snake on one phone. Stopping eight
     people's game over it would be the cure killing the patient.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ── the arena ───────────────────────────────────────────────────── */
const MIN_SEATS = 2;
const MAX_SEATS = 8;

/* Up, right, down, left. The reverse of d is (d + 2) & 3, which is the
   only thing the turn rule needs to know. */
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const back = d => (d + 2) & 3;

/* How big the walls are, by how many are inside them. A two-hander in a
   26-square arena is two people looking for each other; eight in a
   20-square arena is a pile-up in four seconds. Derived from the seat
   count, which every phone already agrees about, so it needs no wire. */
function gridFor(n){ return n <= 2 ? 20 : n <= 4 ? 23 : 26; }

/* how many pellets are on the floor at once */
function foodFor(n){ return Math.max(3, Math.min(6, 2 + Math.ceil(n / 2))); }

const START_LEN = 4;      /* segments a snake is born with              */
const GROW      = 2;      /* segments one pellet is worth               */
const INSET     = 4;      /* how far off the wall a snake is born       */

/* THE SPEEDS. One of these for the whole match — see the header on why
   a snake in SERP never speeds up mid-round. */
const SPEEDS = [
  { id:'kalm',   step:150 },
  { id:'normal', step:120 },
  { id:'mignun', step:95  }
];
const speedOf = id => SPEEDS.find(s => s.id === id) || SPEEDS[1];

/* HOW FAR BACK THE PAST CAN BE REWRITTEN. A message stamped more than
   this many ticks behind the newest tick anybody has reached is refused
   — not because it is wrong, but because the snapshot it would need was
   thrown away, and a game that can be rewritten indefinitely can be
   rewritten by anybody who waits long enough. 32 ticks is about four
   seconds, which is ~40x the worst honest round trip. */
const HORIZON = 32;

/* the causes of death, as small integers because the wire is bytes */
const CAUSE = { WALL:0, SELF:1, OTHER:2, HEADON:3, GONE:4 };

/* ═══════════════════════════════════════════════════════════════════
   SEEDED RANDOMNESS
   The same mulberry32 every other KARTI engine uses. It is never
   called from a clock and never called during play — only pellet()
   and the opening rotation touch it, both as pure functions of the
   seed and an index.
   ═══════════════════════════════════════════════════════════════════ */
function hash32(a, b, c){
  let h = (a ^ 0x9E3779B9) >>> 0;
  h = Math.imul(h ^ (b + 0x85EBCA6B), 0xC2B2AE35) >>> 0;
  h = Math.imul(h ^ (c + 0x27D4EB2F), 0x165667B1) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2545F491) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/* PELLET NUMBER i, on every phone, forever. Two independent draws off
   one hash so x and y do not correlate on small grids. */
function pellet(st, i){
  const g = st.grid;
  const h = hash32(st.seed >>> 0, (i | 0) * 2 + 1, 0x5F5E1);
  const j = hash32(st.seed >>> 0, (i | 0) * 2 + 2, 0xC0FFEE);
  return { x: h % g, y: j % g, i: i | 0 };
}

/* ═══════════════════════════════════════════════════════════════════
   THE OPENING
   Eight start slots round the arena, each facing along its own wall so
   nothing is born pointing at masonry or at a neighbour's flank. The
   slot a seat gets is rotated by the seed so the same four friends do
   not open in the same corners every round; the rotation is a
   permutation of disjoint slots, so it cannot collide however it lands.
   ═══════════════════════════════════════════════════════════════════ */
function slots(g){
  const m = INSET, f = g - 1 - m, h = g >> 1;
  return [
    { x:m, y:m, d:1 },   /* top-left,     heading right */
    { x:f, y:f, d:3 },   /* bottom-right, heading left  */
    { x:f, y:m, d:2 },   /* top-right,    heading down  */
    { x:m, y:f, d:0 },   /* bottom-left,  heading up    */
    { x:h, y:m, d:1 },   /* top-middle,   heading right */
    { x:h, y:f, d:3 },   /* bottom-middle, heading left */
    { x:m, y:h, d:2 },   /* left-middle,  heading down  */
    { x:f, y:h, d:0 }    /* right-middle, heading up    */
  ];
}

function bornAt(g, slot){
  const cells = [{ x:slot.x, y:slot.y }];
  const rev = DIRS[back(slot.d)];
  for (let i = 1; i < START_LEN; i++)
    cells.push({ x: slot.x + rev[0] * i, y: slot.y + rev[1] * i });
  return cells;
}

/* ═══════════════════════════════════════════════════════════════════
   deal(opts, seed) -> st
   opts: { seats, speed, lvl, names }  — everything a phone can know
   before a tick has happened, and nothing that needs a network.
   ═══════════════════════════════════════════════════════════════════ */
function deal(opts, seed){
  opts = opts || {};
  const n = Math.max(MIN_SEATS, Math.min(MAX_SEATS, opts.seats | 0 || 2));
  const g = gridFor(n);
  const sp = speedOf(opts.speed);
  const sl = slots(g);
  const rot = hash32(seed >>> 0, 0x51, 0x11) % 8;

  const st = {
    v: 1,
    seed: seed >>> 0,
    n, grid: g,
    step: sp.step,
    speed: sp.id,
    lvl: Math.max(1, Math.min(3, opts.lvl | 0 || 2)),
    food: foodFor(n),
    snakes: [],
    claims: [],          /* every "I ate #k" heard, sorted (t, seat, i)  */
    live: [],            /* pellet indices on the floor right now        */
    issued: 0,           /* highest pellet index ever put on the floor   */
    horizon: 0,          /* nothing before this tick may be rewritten    */
    top: 0,              /* the newest tick any snake has reached        */
    over: false
  };

  for (let s = 0; s < n; s++){
    const slot = sl[(s + rot) % 8];
    st.snakes.push({
      seat: s,
      own: 'net',              /* the UI overwrites: 'me' | 'ai' | 'net' */
      alive: true,
      dir: slot.d,
      cells: bornAt(g, slot),
      grow: 0,
      score: 0,
      tick: 0,                 /* this snake is simulated up to here     */
      evs: [],                 /* {t, k, d|n} — its own history, sorted  */
      eats: [],                /* accepted eat ticks, from settle()      */
      dieAt: null,
      dieWhy: null,
      rank: 0,                 /* filled in as snakes go out             */
      coast: null,             /* a dropped player: tick it stops moving */
      /* the snapshot the whole rewind story rests on. Kept AT the
         horizon, so a rewind is always short and always possible. */
      snap: null,
      snapAt: 0
    });
    snapshot(st.snakes[s], 0);
  }

  for (let i = 0; i < st.food; i++) st.live.push(i);
  st.issued = st.food - 1;
  return st;
}

/* ── the snapshot a rewind restores from ─────────────────────────── */
function snapshot(sn, atTick){
  sn.snap = {
    dir: sn.dir,
    cells: sn.cells.map(c => ({ x:c.x, y:c.y })),
    grow: sn.grow,
    alive: sn.alive,
    dieAt: sn.dieAt,
    dieWhy: sn.dieWhy
  };
  sn.snapAt = atTick;
}
function restore(sn){
  const s = sn.snap;
  sn.dir = s.dir;
  sn.cells = s.cells.map(c => ({ x:c.x, y:c.y }));
  sn.grow = s.grow;
  sn.alive = s.alive;
  sn.dieAt = s.dieAt;
  sn.dieWhy = s.dieWhy;
  sn.tick = sn.snapAt;
}

/* ═══════════════════════════════════════════════════════════════════
   THE EVENT LIST — the only way a snake ever changes
   ───────────────────────────────────────────────────────────────────
   Three words, and the tick each belongs to:

     turn  d   the direction used for the MOVE at tick t
     eat   n   after the move at tick t, this head is on pellet n
     die   n   the move at tick t killed it, and n says how

   plan() is the single door. It refuses anything before the horizon
   (that past is gone), keeps the list sorted, and marks the snake for
   a rewind if the new event lands behind where it has already been
   simulated to — which is the ordinary case for anything off the wire.
   ═══════════════════════════════════════════════════════════════════ */
function plan(st, sn, ev){
  const t = ev.t | 0;
  if (t <= st.horizon) return false;          /* too late to matter     */
  if (t > st.top + 600) return false;         /* absurdly far ahead     */
  /* one turn per tick per snake: a second one for the same tick is a
     duplicate delivery, not a second decision */
  for (let i = sn.evs.length - 1; i >= 0; i--){
    const e = sn.evs[i];
    if (e.t < t) break;
    if (e.t === t && e.k === ev.k) return false;
  }
  sn.evs.push({ t, k: ev.k, d: ev.d, n: ev.n });
  sn.evs.sort((a, b) => a.t - b.t || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  if (t <= sn.tick){ restore(sn); simTo(st, sn, st.top, null); }
  return true;
}

/* ── one step of one snake ───────────────────────────────────────── */
function stepOne(st, sn, t, world){
  /* the turn stamped at this tick decides the direction of this move */
  for (let i = 0; i < sn.evs.length; i++){
    const e = sn.evs[i];
    if (e.t > t) break;
    if (e.t === t && e.k === 'turn' && e.d !== back(sn.dir)) sn.dir = e.d;
  }
  /* a dropped player COASTS: it keeps the direction it had and keeps
     moving, so the arena does not suddenly change shape under everyone
     — and then it is gone. Nothing else in here needs to know. */
  if (sn.coast != null && t > sn.coast){
    sn.alive = false;
    if (sn.dieAt == null){ sn.dieAt = t; sn.dieWhy = CAUSE.GONE; }
    return;
  }
  const d = DIRS[sn.dir];
  const h = sn.cells[0];
  const nh = { x: h.x + d[0], y: h.y + d[1] };
  sn.cells.unshift(nh);
  /* growth is DERIVED from the accepted eat list, never from a flag the
     wire could lose — see settle() */
  let grew = false;
  for (let i = 0; i < sn.eats.length; i++)
    if (sn.eats[i] === t){ grew = true; break; }
  if (grew) sn.grow += GROW;
  if (sn.grow > 0) sn.grow--;
  else sn.cells.pop();

  /* the death stamped at this tick. The OWNER put it there; every other
     phone is only replaying what it was told. */
  for (let i = 0; i < sn.evs.length; i++){
    const e = sn.evs[i];
    if (e.t > t) break;
    if (e.t === t && e.k === 'die'){
      sn.alive = false;
      sn.dieAt = t;
      sn.dieWhy = e.n | 0;
    }
  }
  if (world) world.dirty = true;
}

/* simTo — advance ONE snake to a tick. This is the whole simulation.
   It is O(ticks x length) for one snake and nothing else in the arena
   can make it re-run, which is the point of the design. */
function simTo(st, sn, toTick, world){
  let guard = 0;
  while (sn.tick < toTick && guard++ < 4096){
    if (!sn.alive){ sn.tick = toTick; break; }
    sn.tick++;
    stepOne(st, sn, sn.tick, world);
  }
  if (sn.tick > st.top) st.top = sn.tick;
  return sn;
}

/* ═══════════════════════════════════════════════════════════════════
   WHAT IS IN THE WAY
   occupancy() reads every snake AT WHATEVER TICK IT HAS BEEN SIMULATED
   TO, and that is deliberate rather than sloppy: js/serp-ui.js runs its
   own snake up to `now` and every remote snake up to `now - buffer`.
   So a collision is always tested against a remote body this phone has
   actually been TOLD about, never against one it guessed. You cannot
   die to a prediction. See the jitter-buffer note in js/serp-ui.js.
   ═══════════════════════════════════════════════════════════════════ */
function occupancy(st, skipSeat){
  const g = st.grid, occ = new Set();
  for (let s = 0; s < st.snakes.length; s++){
    const sn = st.snakes[s];
    if (s === skipSeat || !sn.alive) continue;
    for (let i = 0; i < sn.cells.length; i++){
      const c = sn.cells[i];
      occ.add(c.y * g + c.x);
    }
  }
  return occ;
}

/* Did the head that just moved to (h) hit anything? Returns a CAUSE or
   null. The caller is ALWAYS the snake's owner — nothing else in this
   file ever calls it for a snake it does not own. */
function hitTest(st, sn, occ){
  const g = st.grid, h = sn.cells[0];
  if (h.x < 0 || h.y < 0 || h.x >= g || h.y >= g) return CAUSE.WALL;
  for (let i = 1; i < sn.cells.length; i++)
    if (sn.cells[i].x === h.x && sn.cells[i].y === h.y) return CAUSE.SELF;
  if (occ && occ.has(h.y * g + h.x)) return CAUSE.OTHER;
  return null;
}

/* which live pellet is under this head, or -1 */
function pelletUnder(st, sn){
  const h = sn.cells[0];
  for (let i = 0; i < st.live.length; i++){
    const p = pellet(st, st.live[i]);
    if (p.x === h.x && p.y === h.y) return st.live[i];
  }
  return -1;
}

/* ═══════════════════════════════════════════════════════════════════
   settle() — THE PELLET COURT
   A pure fold over every claim anybody has made, in one order every
   phone computes the same way:  (tick, seat, pellet index).

     · the first claim to reach a pellet that is still on the floor
       WINS it: the pellet comes off the floor and a fresh one is put
       down in its place;
     · every later claim on that same pellet is simply not there. The
       loser's phone runs the identical fold, reaches the identical
       verdict, and takes its own two segments back.

   Nothing in here asks who is host and nothing in here asks the relay.
   Re-run it whenever the claim list changes; it is O(claims).
   ═══════════════════════════════════════════════════════════════════ */
function settle(st){
  const before = st.snakes.map(sn => sn.eats.join(','));
  st.claims.sort((a, b) => a.t - b.t || a.s - b.s || a.i - b.i);

  const live = new Set();
  for (let i = 0; i < st.food; i++) live.add(i);
  let issued = st.food - 1;
  const eats = st.snakes.map(() => []);
  const score = st.snakes.map(() => 0);

  for (let c = 0; c < st.claims.length; c++){
    const cl = st.claims[c];
    if (!live.has(cl.i)) continue;            /* somebody was quicker    */
    if (!st.snakes[cl.s]) continue;
    live.delete(cl.i);
    issued++;
    live.add(issued);
    eats[cl.s].push(cl.t);
    score[cl.s]++;
    cl.ok = 1;
  }
  for (let c = 0; c < st.claims.length; c++)
    if (st.claims[c].ok !== 1) st.claims[c].ok = 0;

  st.live = Array.from(live).sort((a, b) => a - b);
  st.issued = issued;

  /* a snake whose accepted list changed has to be re-run: its length at
     every tick since is different from what it was drawing a moment ago */
  const redo = [];
  for (let s = 0; s < st.snakes.length; s++){
    const sn = st.snakes[s];
    sn.eats = eats[s];
    sn.score = score[s];
    if (before[s] !== sn.eats.join(',')) redo.push(sn);
  }
  return redo;
}

/* Advance the settled horizon. Everything before it is frozen: the
   snapshots move up, the event and claim lists are pruned, and a
   straggler arriving from before it is refused by plan(). This is the
   only garbage collection in the game and the only thing stopping a
   long round from growing without bound. */
function advanceHorizon(st, toTick){
  const h = Math.max(0, Math.min(toTick, st.top - 1));
  if (h <= st.horizon) return;
  for (let s = 0; s < st.snakes.length; s++){
    const sn = st.snakes[s];
    if (sn.tick < h) continue;
    /* re-run from the old snapshot to exactly h, then keep THAT */
    const want = sn.tick;
    restore(sn);
    simTo(st, sn, h, null);
    snapshot(sn, h);
    simTo(st, sn, want, null);
    sn.evs = sn.evs.filter(e => e.t > h);
  }
  st.claims = st.claims.filter(c => c.t > h - HORIZON * 2);
  st.horizon = h;
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE
   A bot must feel FAIR, which means three things and only three:
     · it sees exactly what a person sees — the same buffered arena,
       through the same occupancy() every human collision uses. It has
       no private knowledge of where anybody is about to go.
     · it is SLOW to change its mind. It re-decides every `react` ticks
       (3 / 2 / 1 by level), so a person can out-manoeuvre it, which is
       the whole pleasure of playing one.
     · it makes MISTAKES, on purpose, at a rate set by its level — and
       the mistakes are a hash of (seed, tick, seat), so they are the
       same mistakes on every phone and a host-owned bot never drifts.

   The scoring is: never walk into something; then take the option with
   the most room behind it (a capped flood fill — a full one is both
   too slow and too good); then, as a tie-break only, lean towards the
   nearest pellet. Room first, food second, is what stops a bot from
   diving into a pocket after a pellet like a beginner.
   ═══════════════════════════════════════════════════════════════════ */
const REACT = { 1:4, 2:2, 3:1 };
const SLIP  = { 1:0.30, 2:0.12, 3:0.03 };
const FILL_CAP = 90;

function roomAt(st, occ, sx, sy){
  const g = st.grid;
  if (sx < 0 || sy < 0 || sx >= g || sy >= g) return 0;
  if (occ.has(sy * g + sx)) return 0;
  const seen = new Set([sy * g + sx]);
  const q = [sy * g + sx];
  let n = 0;
  while (q.length && n < FILL_CAP){
    const k = q.shift(); n++;
    const x = k % g, y = (k / g) | 0;
    for (let d = 0; d < 4; d++){
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= g || ny >= g) continue;
      const nk = ny * g + nx;
      if (seen.has(nk) || occ.has(nk)) continue;
      seen.add(nk); q.push(nk);
    }
  }
  return n;
}

/* the direction this bot wants for the move at tick t, or null to keep
   going straight. Pure: same inputs, same answer, on every phone. */
function bot(st, sn, t, lvl){
  lvl = Math.max(1, Math.min(3, lvl | 0 || 2));
  if (!sn.alive) return null;
  const react = REACT[lvl];
  const h = sn.cells[0];
  const occ = occupancy(st, sn.seat);
  /* its own body is in the way too — all of it but the tail cell, which
     will have moved on by the time the head arrives */
  for (let i = 0; i < sn.cells.length - 1; i++)
    occ.add(sn.cells[i].y * st.grid + sn.cells[i].x);

  const straight = { x: h.x + DIRS[sn.dir][0], y: h.y + DIRS[sn.dir][1] };
  const safeAhead = roomAt(st, occ, straight.x, straight.y) >= Math.min(sn.cells.length + 2, FILL_CAP);
  /* only re-think on its own beat — UNLESS it is about to die, because
     a bot that drives into a wall on purpose is not "fair", it is broken */
  if (safeAhead && (t % react) !== (sn.seat % react)) return null;

  /* the nearest pellet, by plain city-block distance */
  let best = null, bd = 1e9;
  for (let i = 0; i < st.live.length; i++){
    const p = pellet(st, st.live[i]);
    const d = Math.abs(p.x - h.x) + Math.abs(p.y - h.y);
    if (d < bd){ bd = d; best = p; }
  }

  const opts = [];
  for (let d = 0; d < 4; d++){
    if (d === back(sn.dir)) continue;
    const nx = h.x + DIRS[d][0], ny = h.y + DIRS[d][1];
    const room = roomAt(st, occ, nx, ny);
    if (!room) continue;
    let want = 0;
    if (best){
      const now = Math.abs(best.x - h.x) + Math.abs(best.y - h.y);
      const nxt = Math.abs(best.x - nx) + Math.abs(best.y - ny);
      want = nxt < now ? 1 : 0;
    }
    /* room dominates; food only separates equals; straight on breaks a
       remaining tie so a bot does not shimmy for no reason */
    opts.push({ d, v: room * 100 + want * 9 + (d === sn.dir ? 3 : 0) });
  }
  if (!opts.length) return null;               /* boxed in — go straight and die like anyone else */
  opts.sort((a, b) => b.v - a.v || a.d - b.d);

  /* the deliberate mistake: take the second-best instead. Deterministic,
     so a host-owned bot's blunders replay identically everywhere. */
  const r = (hash32(st.seed, t * 7 + 1, sn.seat + 101) % 1000) / 1000;
  const pick = (opts.length > 1 && r < SLIP[lvl]) ? opts[1] : opts[0];
  return pick.d === sn.dir ? null : pick.d;
}

/* ═══════════════════════════════════════════════════════════════════
   THE ROUND
   ═══════════════════════════════════════════════════════════════════ */
const aliveCount = st => st.snakes.reduce((a, s) => a + (s.alive ? 1 : 0), 0);

function over(st){
  if (st.over) return true;
  /* one snake alone is a winner; nobody left is a round that ended in a
     pile-up. A solo player against nothing is neither — it ends when
     they die, which the first branch already covers at n>=2. */
  return aliveCount(st) <= (st.n > 1 ? 1 : 0);
}

/* Final standings. Later death beats earlier death; among snakes that
   died on the SAME tick — a head-on, which is common — the longer one
   is placed first, and the lower seat breaks what is left. Pure, so
   eight phones print the same scoreboard. */
function standings(st){
  return st.snakes.map(sn => ({
    seat: sn.seat,
    score: sn.score,
    len: sn.cells.length,
    alive: sn.alive,
    dieAt: sn.alive ? Infinity : (sn.dieAt == null ? 0 : sn.dieAt),
    why: sn.dieWhy
  })).sort((a, b) => b.dieAt - a.dieAt || b.score - a.score ||
                     b.len - a.len || a.seat - b.seat);
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE
   js/mp.js's generic codec carries `a` (the action) plus a bitmask and
   one byte per declared field. So every number here is 0..255 and a
   tick — which outlives a byte after thirty seconds — travels as two.

     turn  {t:'turn', i,j = tick, s = direction 0..3}
     eat   {t:'eat',  i,j = tick, n,c = pellet number}
     die   {t:'die',  i,j = tick, s = cause 0..4}
     again {t:'again', v = play on}

   WIRE_FIELDS is published on the lobby as `wire.fields`, which is what
   mp.js prefers over its own table — the field list is this game's
   business, and mp.js's header says so itself.
   ═══════════════════════════════════════════════════════════════════ */
const WIRE_FIELDS = ['i', 'j', 's', 'n', 'c', 'v'];

const lo = v => (v | 0) & 255;
const hi = v => ((v | 0) >> 8) & 255;
const un = (l, h) => ((h | 0) << 8) | (l | 0);

function encWire(mv){
  if (!mv) return null;
  if (mv.t === 'turn') return { t:'turn', i:lo(mv.tick), j:hi(mv.tick), s:(mv.dir | 0) & 3 };
  if (mv.t === 'eat')  return { t:'eat',  i:lo(mv.tick), j:hi(mv.tick), n:lo(mv.idx), c:hi(mv.idx) };
  if (mv.t === 'die')  return { t:'die',  i:lo(mv.tick), j:hi(mv.tick), s:Math.max(0, Math.min(4, mv.why | 0)) };
  if (mv.t === 'again')return { t:'again', v: mv.on ? 1 : 0 };
  return null;
}
function decWire(w){
  if (!w || typeof w !== 'object') return null;
  const t = w.t || w.a;
  if (t === 'turn')  return { t:'turn', tick: un(w.i, w.j), dir: (w.s | 0) & 3 };
  if (t === 'eat')   return { t:'eat',  tick: un(w.i, w.j), idx: un(w.n, w.c) };
  if (t === 'die')   return { t:'die',  tick: un(w.i, w.j), why: (w.s | 0) };
  if (t === 'again') return { t:'again', on: !!w.v };
  return null;                                  /* ignored, never fatal */
}

/* ── the agreement line, for a bug report ────────────────────────── */
function check(st){
  const s = ['serp', st.seed, st.grid, st.top, st.live.join('.'),
             st.snakes.map(x => x.seat + ':' + x.score + ':' + x.cells.length +
                                (x.alive ? 'a' : 'd' + x.dieAt)).join(',')].join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

root.KARTI_SERP = {
  engine: {
    MIN_SEATS, MAX_SEATS, DIRS, CAUSE, SPEEDS, HORIZON, GROW, START_LEN,
    WIRE_FIELDS,
    back, gridFor, foodFor, speedOf,
    deal, plan, simTo, snapshot, restore, advanceHorizon,
    occupancy, hitTest, pellet, pelletUnder, settle,
    bot, over, aliveCount, standings, hash32,
    encWire, decWire, check
  }
};

})(typeof window !== 'undefined' ? window : globalThis);
