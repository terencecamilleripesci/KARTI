/* ═══════════════════════════════════════════════════════════════════
   KARTI — serp.js
   SERP — the engine. Rules only: no DOM, no clock, no rAF, and NO
   Math.random anywhere in the SIM PATH. The screen half is js/serp-ui.js
   and follows js/poker-ui.js's shape: the engine is pure, the UI owns
   the clock, the wire and the paint.

   THE GAME  (rebuilt: a modern arena snake, slither-style)
     A BIG scrolling world, many times larger than the screen. A camera
     follows your snake's head. You are always gliding forward and you
     STEER — you point where you want the head to arc toward, and it
     turns at a limited rate, so it curves rather than snapping to a
     grid. You EAT glowing pellets scattered across the map (and the
     remains of dead snakes) to get longer and a touch wider. Two to
     eight snakes plus machine snakes fill the arena, hunting pellets
     and each other.

     THE WALL DOES NOT KILL YOU. The world WRAPS: glide off one edge and
     you reappear on the opposite one. You die only by ramming your head
     into ANOTHER snake's body — or your own, past a short neck grace.
     Last snake alive wins the round; a round timer guarantees it ends,
     and if it runs out the LONGEST snake takes it.

   ── WHY THIS ENGINE LOOKS NOTHING LIKE THE CARD ENGINES ────────────
     Every other engine in this app is LOCKSTEP: one shared log, one
     move at a time, every phone replaying the identical list. That is
     correct for rummy, where a turn takes four seconds and nobody
     notices a hundred milliseconds. It is WRONG here: a snake moves
     EVERY tick and a phone's round trip on a 5G radio is 50–100ms and
     JITTERS inside one session. Waiting for eight phones to agree before
     anybody may move means stalling on most ticks, forever.

     So SERP is built on one structural decision:

     ┌─────────────────────────────────────────────────────────────┐
     │  EVERY SNAKE IS AN INDEPENDENT SIMULATION, AND ITS OWNER IS  │
     │  THE ONLY CLIENT ALLOWED TO ADVANCE, TURN, BOOST OR KILL IT. │
     └─────────────────────────────────────────────────────────────┘

     Snakes only touch each other through COLLISION, and collision is
     resolved by the victim: when your head meets a body, YOU say so and
     you broadcast it. Nobody else's phone may kill your snake. There is
     no host authority and no server state — a late message about snake A
     can never invalidate snake B, so re-simulating one snake is O(one
     snake). That is what makes it cheap enough for a phone and honest
     enough to run without a referee. The cost, said plainly: a player
     who edits this file can decline to die. For a free party game among
     friends that trade is right, and it is written here, not hidden.

   ── EVERYTHING IS A TICK, NEVER A TIMESTAMP ────────────────────────
     st.step is FIXED for the whole match (a snake never speeds up
     mid-round as it eats; BOOST is a bounded multiplier the owner
     applies deterministically, not a drift). So tick N happens at
     T0 + N*step, and an event is stamped {tick, what}. A message that
     arrives 180ms late still names its exact tick, so the receiver
     applies it RETROACTIVELY: rewind that one snake to the last settled
     snapshot, replay its own event list forward. No interpolation
     guesswork. ev(sn) is that list; sn.snap is the snapshot at
     st.horizon, and anything before the horizon is refused (see plan()).

   ── CONTINUOUS, FIXED-POINT, NO FLOATING TRIG IN THE SIM ───────────
     Positions are INTEGER sub-units (fu, FP fractional bits). Heading is
     an INTEGER angle 0..ANG-1. cos/sin come from PRECOMPUTED integer
     tables (TCOS/TSIN), built ONCE at load — the ONLY place this file
     calls Math.cos/Math.sin, and it is documented right there. The sim
     path itself contains no Math.sin/cos/tan/sqrt/pow and no
     Math.random: every per-tick number is an integer add / multiply /
     shift or a table lookup, so the whole match is bit-reproducible from
     (seed, inputs). Distances are compared SQUARED, so sqrt is never
     needed either.

   ── FOOD WITHOUT A REFEREE ─────────────────────────────────────────
     pellet(seed, i) is a pure function: pellet number i is at the same
     world point on all eight phones, forever, derived from the shared
     seed the way skarta derives a shuffle. Nobody sends a position; they
     send "I ate #47". Two snakes claiming one pellet at ~100ms apart is
     resolved by settle() as a pure fold over the claim list, sorted by
     (tick, seat, index): EARLIER TICK WINS; same tick, LOWER SEAT wins.
     The loser's phone reaches the same verdict and RETRACTS. Dead snakes
     also scatter DROP pellets (seeded from seat+dieTick) that anyone can
     eat — same court, different index range.

   ── DETERMINISM ────────────────────────────────────────────────────
     st.seed is the entire RNG. Bots are a pure function of state and a
     hash of (seed, tick, seat) — never a clock, never Math.random — so a
     host-owned bot broadcasts the turns every phone would have predicted
     anyway. The one place a brand-new local match picks a seed is
     js/serp-ui.js's newSeed(), skarta's and poker's pattern.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ── seats ───────────────────────────────────────────────────────── */
const MIN_SEATS = 2;
const MAX_SEATS = 8;

/* ═══════════════════════════════════════════════════════════════════
   FIXED-POINT WORLD
   FP fractional bits: 1 world-unit = (1<<FP) fu (fixed sub-units).
   The world is a square WORLD_U units on a side; it WRAPS at the edges.
   ═══════════════════════════════════════════════════════════════════ */
const FP    = 8;                 /* 256 sub-units per world unit         */
const ONE   = 1 << FP;
const WORLD_U = 200;             /* world side, in units                 */
const WORLD = WORLD_U << FP;     /* world side, in fu                    */

/* THE ANGLE TABLE. ANG steps make a full turn; TCOS/TSIN are cos/sin
   scaled by (1<<TRIG). Built ONCE, here, at load — this Math.cos/sin is
   the documented exception and it never runs again. From here the sim
   reads only the tables. */
const ANG  = 256;
const TRIG = 14;
const TUNIT = 1 << TRIG;
const TCOS = new Int32Array(ANG);
const TSIN = new Int32Array(ANG);
(function buildTrig(){
  const TWO_PI = Math.PI * 2;
  for (let a = 0; a < ANG; a++){
    const r = (a / ANG) * TWO_PI;
    TCOS[a] = Math.round(Math.cos(r) * TUNIT);
    TSIN[a] = Math.round(Math.sin(r) * TUNIT);
  }
})();
const angWrap = a => ((a % ANG) + ANG) % ANG;
/* the signed shortest way from a to b, in [-ANG/2 .. ANG/2] */
function angDelta(a, b){
  let d = (b - a) % ANG;
  if (d < -ANG / 2) d += ANG;
  if (d >  ANG / 2) d -= ANG;
  return d;
}

/* ── MOVEMENT CONSTANTS (all integers; the whole feel lives here) ──
   SPD_FU  : fu the head advances per tick at cruise.
   TURN    : max angle-steps the heading may change per tick (arc, not snap).
   BODY_R  : body radius in fu (collision + paint). Grows slightly w/ length.
   HEAD_R  : head radius in fu for the collision test.
   SEG_TICKS_START : body length, measured in TICKS of head-path, at birth.
   GROW_TICKS      : ticks of length one pellet adds.
   The body is the head's path over the last `bodyTicks` ticks: exactly
   one sample per tick, SPD_FU apart, which makes the trail dense enough
   that a swept head-vs-body test never tunnels. */
const SPEEDS = [
  { id:'kalm',   step:70, spd:1.7 },
  { id:'normal', step:55, spd:2.0 },
  { id:'mignun', step:42, spd:2.4 }
];
function spdFu(sp){ return Math.max(1, Math.round(sp.spd * ONE)); }
const speedOf = id => SPEEDS.find(s => s.id === id) || SPEEDS[1];

const TURN        = 8;                 /* ang-steps/tick (~11.25°/tick)   */
const BOOST_TURN  = 6;                 /* a little less nimble at sprint  */
const BODY_R0     = Math.round(1.55 * ONE);
const HEAD_R      = Math.round(1.35 * ONE);
const SEG_START   = 34;                /* body ticks at birth             */
const GROW_TICKS  = 7;                 /* body ticks per pellet           */
const MIN_TICKS   = 20;                /* never shorter than this         */
const NECK_GRACE  = 10;                /* body ticks near the head that
                                          cannot self-kill (a normal arc) */

/* BOOST: a bounded multiplier, applied by the owner, deterministic.
   Every BOOST_DROP ticks of boosting sheds one body-tick and drops a
   pellet behind — length is the fuel, exactly the genre staple. */
const BOOST_MUL_N = 17, BOOST_MUL_D = 10;  /* ×1.7 speed while boosting   */
const BOOST_DROP  = 5;                      /* shed 1 length every N ticks */

/* how wide the body radius gets as a snake lengthens (in fu, capped) */
function bodyR(bodyTicks){
  const extra = Math.min(ONE, ((bodyTicks - SEG_START) * 6) | 0);
  return BODY_R0 + Math.max(0, extra);
}

/* how many pellets float on the map at once, and how big the world feels */
function foodFor(n){ return 60 + n * 14; }

/* pellet index ranges. Field pellets are indices [0 .. issued]; drop
   pellets (from deaths) live in a HIGH range so their seeded positions
   never collide with field pellets. */
const DROP_BASE = 1 << 20;

/* HOW FAR BACK THE PAST CAN BE REWRITTEN — snapshots older than this are
   gone, so a message stamped before it is refused (see plan()). ~4s. */
const HORIZON = 48;

/* the round always ends: last snake alive, or, at the timer, the longest */
function roundTicks(st){ return Math.round(150000 / st.step); }  /* ~150s   */

/* causes of death, small integers because the wire is bytes */
const CAUSE = { OTHER:0, SELF:1, HEADON:2, GONE:3, TIME:4 };

/* ═══════════════════════════════════════════════════════════════════
   SEEDED RANDOMNESS — the same mulberry-ish hash every KARTI engine
   uses. Never called from a clock and never with Math.random; only
   pellet() and the opening touch it, as pure functions of (seed,index).
   ═══════════════════════════════════════════════════════════════════ */
function hash32(a, b, c){
  let h = (a ^ 0x9E3779B9) >>> 0;
  h = Math.imul(h ^ (b + 0x85EBCA6B), 0xC2B2AE35) >>> 0;
  h = Math.imul(h ^ (c + 0x27D4EB2F), 0x165667B1) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2545F491) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/* PELLET NUMBER i, on every phone, forever. Field pellets tile the world
   uniformly; DROP pellets (index >= DROP_BASE) are seeded from the death
   that spawned them so their positions agree everywhere without a wire.
   Returns fu coordinates. A pellet's "worth" is 1 length unit; drops are
   worth a touch more so eating a corpse pays. */
function pellet(st, i){
  i = i | 0;
  if (i >= DROP_BASE){
    const h = hash32(st.seed >>> 0, i * 2 + 1, 0xD30F);
    const j = hash32(st.seed >>> 0, i * 2 + 2, 0xD31F);
    return { x: h % WORLD, y: j % WORLD, i, drop:1 };
  }
  const h = hash32(st.seed >>> 0, i * 2 + 1, 0x5F5E1);
  const j = hash32(st.seed >>> 0, i * 2 + 2, 0xC0FFEE);
  return { x: h % WORLD, y: j % WORLD, i, drop:0 };
}

/* ═══════════════════════════════════════════════════════════════════
   THE OPENING
   Snakes are born spread evenly around a ring in the middle third of the
   world, each heading outward-ish, so nobody opens inside anybody. The
   seat's angle around the ring is rotated by the seed so the same four
   friends do not open in the same spots every round.
   ═══════════════════════════════════════════════════════════════════ */
function bornAt(st, seat){
  const n = st.n;
  const rot = hash32(st.seed >>> 0, 0x51, 0x11) % ANG;
  const a = angWrap(((seat * ANG / n) | 0) + rot);
  const rad = ((WORLD_U * 0.28) | 0) << FP;         /* ring radius, in fu  */
  const cx = WORLD / 2, cy = WORLD / 2;
  const hx = angWrapFu(cx + ((TCOS[a] * rad) >> TRIG));
  const hy = angWrapFu(cy + ((TSIN[a] * rad) >> TRIG));
  /* face along the ring (tangential), which keeps a snake from driving
     straight at the centre pile-up on tick one */
  const dir = angWrap(a + ANG / 4);
  /* the body trails BEHIND the head: a straight tail pointing backward */
  const back = angWrap(dir + ANG / 2);
  const path = [];
  const spd = spdFu(speedOf(st.speed));
  for (let k = 0; k < SEG_START; k++){
    path.push({
      x: angWrapFu(hx + ((TCOS[back] * spd) >> TRIG) * k),
      y: angWrapFu(hy + ((TSIN[back] * spd) >> TRIG) * k)
    });
  }
  return { hx, hy, dir, path };
}
function angWrapFu(v){ v = v % WORLD; if (v < 0) v += WORLD; return v | 0; }

/* ═══════════════════════════════════════════════════════════════════
   deal(opts, seed) -> st
   opts: { seats, speed, lvl, names } — everything a phone can know before
   a tick has happened, and nothing that needs a network.
   ═══════════════════════════════════════════════════════════════════ */
function deal(opts, seed){
  opts = opts || {};
  const n = Math.max(MIN_SEATS, Math.min(MAX_SEATS, opts.seats | 0 || 2));
  const sp = speedOf(opts.speed);

  const st = {
    v: 2,
    seed: seed >>> 0,
    n,
    world: WORLD, worldU: WORLD_U, fp: FP,
    step: sp.step,
    speed: sp.id,
    spd: spdFu(sp),
    lvl: Math.max(1, Math.min(3, opts.lvl | 0 || 2)),
    food: foodFor(n),
    snakes: [],
    claims: [],          /* every "I ate #k" heard, sorted (t,seat,i)    */
    live: [],            /* pellet indices on the floor right now         */
    issued: 0,           /* highest FIELD pellet index issued             */
    drops: [],           /* live DROP pellet indices (from deaths)        */
    horizon: 0,
    top: 0,
    over: false,
    winner: -1
  };

  for (let s = 0; s < n; s++){
    const b = bornAt(st, s);
    st.snakes.push({
      seat: s,
      own: 'net',
      alive: true,
      ang: b.dir,               /* current heading, integer 0..ANG-1      */
      aim: b.dir,               /* the heading the owner is steering toward */
      boost: 0,                 /* 1 while sprinting                       */
      hx: b.hx, hy: b.hy,       /* head, in fu                            */
      path: b.path,             /* body samples, [0]=head-side .. tail    */
      bodyTicks: SEG_START,     /* target body length in ticks            */
      grow: 0,                  /* pending growth, in ticks               */
      score: 0,                 /* pellets eaten                          */
      tick: 0,
      evs: [],                  /* {t,k,...} — its own history, sorted    */
      eats: [],                 /* accepted eat ticks, from settle()      */
      dieAt: null, dieWhy: null,
      coast: null,              /* a dropped player: tick it stops         */
      snap: null, snapAt: 0
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
    ang: sn.ang, aim: sn.aim, boost: sn.boost,
    hx: sn.hx, hy: sn.hy,
    path: sn.path.map(p => ({ x:p.x, y:p.y })),
    bodyTicks: sn.bodyTicks, grow: sn.grow,
    alive: sn.alive, dieAt: sn.dieAt, dieWhy: sn.dieWhy
  };
  sn.snapAt = atTick;
}
function restore(sn){
  const s = sn.snap;
  sn.ang = s.ang; sn.aim = s.aim; sn.boost = s.boost;
  sn.hx = s.hx; sn.hy = s.hy;
  sn.path = s.path.map(p => ({ x:p.x, y:p.y }));
  sn.bodyTicks = s.bodyTicks; sn.grow = s.grow;
  sn.alive = s.alive; sn.dieAt = s.dieAt; sn.dieWhy = s.dieWhy;
  sn.tick = sn.snapAt;
}

/* ═══════════════════════════════════════════════════════════════════
   THE EVENT LIST — the only way a snake ever changes
   ───────────────────────────────────────────────────────────────────
   Four words, and the tick each belongs to:
     aim   a   the heading the owner is steering toward, from tick t on
     boost b   sprint on/off, from tick t on
     eat   n   after the move at tick t, this head is on pellet n
     die   n   the move at tick t killed it, and n says how
   plan() is the single door: it refuses anything before the horizon,
   keeps the list sorted, drops a duplicate of the same (tick,kind), and
   marks a rewind when the event lands behind where the snake has already
   simulated to (the ordinary case off the wire).
   ═══════════════════════════════════════════════════════════════════ */
function plan(st, sn, ev){
  const t = ev.t | 0;
  if (t <= st.horizon) return false;
  if (t > st.top + 900) return false;
  for (let i = sn.evs.length - 1; i >= 0; i--){
    const e = sn.evs[i];
    if (e.t < t) break;
    if (e.t === t && e.k === ev.k) return false;   /* duplicate delivery  */
  }
  sn.evs.push({ t, k: ev.k, a: ev.a, b: ev.b, n: ev.n });
  sn.evs.sort((x, y) => x.t - y.t || (x.k < y.k ? -1 : x.k > y.k ? 1 : 0));
  if (t <= sn.tick){ restore(sn); simTo(st, sn, st.top, null); }
  return true;
}

/* ── apply any aim / boost events stamped at exactly tick t ──────── */
function applyInputs(sn, t){
  for (let i = 0; i < sn.evs.length; i++){
    const e = sn.evs[i];
    if (e.t > t) break;
    if (e.t !== t) continue;
    if (e.k === 'aim')   sn.aim = angWrap(e.a | 0);
    if (e.k === 'boost') sn.boost = e.b ? 1 : 0;
  }
}

/* ── one step of one snake ───────────────────────────────────────── */
function stepOne(st, sn, t, world){
  applyInputs(sn, t);

  /* a dropped player COASTS: keeps its heading and keeps gliding, then
     is gone — the arena does not change shape under everyone at once */
  if (sn.coast != null && t > sn.coast){
    sn.alive = false;
    if (sn.dieAt == null){ sn.dieAt = t; sn.dieWhy = CAUSE.GONE; }
    return;
  }
  if (sn.coast != null) sn.boost = 0;   /* a leaving snake never sprints  */

  /* STEER: turn the heading toward the aim, at most TURN steps this tick */
  const cap = sn.boost ? BOOST_TURN : TURN;
  const d = angDelta(sn.ang, sn.aim);
  if (d > cap) sn.ang = angWrap(sn.ang + cap);
  else if (d < -cap) sn.ang = angWrap(sn.ang - cap);
  else sn.ang = sn.aim;

  /* GROWTH is DERIVED from the accepted eat list, never a wire flag */
  for (let i = 0; i < sn.eats.length; i++)
    if (sn.eats[i] === t){ sn.grow += GROW_TICKS; break; }

  /* MOVE: advance the head along the heading; wrap at the world edge */
  let spd = st.spd;
  if (sn.boost){
    spd = (spd * BOOST_MUL_N / BOOST_MUL_D) | 0;
    /* sprint burns length; the shed segment becomes a drop pellet (the
       drop index is a pure function of seat+tick, so every phone agrees) */
    if ((t % BOOST_DROP) === 0 && sn.bodyTicks > MIN_TICKS + 2){
      sn.bodyTicks--;
    }
  }
  sn.hx = angWrapFu(sn.hx + ((TCOS[sn.ang] * spd) >> TRIG));
  sn.hy = angWrapFu(sn.hy + ((TSIN[sn.ang] * spd) >> TRIG));

  /* push the new head sample; grow or trim the trail to bodyTicks */
  sn.path.unshift({ x: sn.hx, y: sn.hy });
  if (sn.grow > 0){ sn.grow--; sn.bodyTicks++; }
  const cap2 = Math.max(MIN_TICKS, sn.bodyTicks) + 1;
  while (sn.path.length > cap2) sn.path.pop();

  /* the death stamped at this tick. The OWNER put it there; everyone
     else is only replaying what it was told. */
  for (let i = 0; i < sn.evs.length; i++){
    const e = sn.evs[i];
    if (e.t > t) break;
    if (e.t === t && e.k === 'die'){ sn.alive = false; sn.dieAt = t; sn.dieWhy = e.n | 0; }
  }
  if (world) world.dirty = true;
}

/* simTo — advance ONE snake to a tick. The whole simulation. O(ticks) for
   one snake and nothing else in the arena can make it re-run. */
function simTo(st, sn, toTick, world){
  let guard = 0;
  while (sn.tick < toTick && guard++ < 8192){
    if (!sn.alive){ sn.tick = toTick; break; }
    sn.tick++;
    stepOne(st, sn, sn.tick, world);
  }
  if (sn.tick > st.top) st.top = sn.tick;
  return sn;
}

/* ═══════════════════════════════════════════════════════════════════
   TOROIDAL GEOMETRY — all integer, all squared (no sqrt in the sim)
   ═══════════════════════════════════════════════════════════════════ */
function wrapDelta(d){                          /* shortest signed wrap    */
  if (d >  WORLD / 2) d -= WORLD;
  if (d < -WORLD / 2) d += WORLD;
  return d;
}
/* squared toroidal distance between two fu points */
function dist2(ax, ay, bx, by){
  const dx = wrapDelta(ax - bx), dy = wrapDelta(ay - by);
  return dx * dx + dy * dy;
}
/* squared distance from point P to segment AB, toroidal.
   All three points are first shifted into A's local frame by wrapDelta so
   the segment never straddles the seam, then it is the textbook
   point-to-segment: project P onto AB, clamp to the segment, measure.

   The projection uses ONE IEEE-754 division ((ex*t)/len2). That is not
   Math.sin/cos/tan/sqrt/pow/random — it is a plain divide, and IEEE-754
   division is bit-exact and identical on every JS engine, so the result
   is still perfectly reproducible (the 1000x replay proof exercises this
   path on every collision). No square root is taken: the distance is
   returned SQUARED, which is all the caller ever compares. */
function segDist2(px, py, ax, ay, bx, by){
  const ex = wrapDelta(bx - ax), ey = wrapDelta(by - ay);      /* A->B     */
  const wx = wrapDelta(px - ax), wy = wrapDelta(py - ay);      /* A->P     */
  const len2 = ex * ex + ey * ey;
  if (len2 > 0){
    let t = wx * ex + wy * ey;                 /* projection numerator     */
    if (t <= 0) t = 0;
    else if (t >= len2) t = len2;
    const cx = wx - (ex * t) / len2;           /* P - closest-point        */
    const cy = wy - (ey * t) / len2;
    return cx * cx + cy * cy;
  }
  return wx * wx + wy * wy;
}

/* ═══════════════════════════════════════════════════════════════════
   WHAT IS IN THE WAY
   Every remote snake is read AT WHATEVER TICK IT HAS BEEN SIMULATED TO —
   js/serp-ui.js runs your snake to `now` and every remote to
   `now - buffer` — so a collision is always tested against a body this
   phone was actually TOLD about, never one it guessed. You cannot die to
   a prediction.
   ═══════════════════════════════════════════════════════════════════ */

/* SWEPT head-vs-body. The head moved from (fromX,fromY) to (sn.hx,sn.hy)
   this tick. We test that swept head capsule against every body segment
   of every OTHER snake, and against our own body past NECK_GRACE. Because
   body samples are one-per-tick and SPD_FU apart, and the head sweep is
   itself a segment, no fast head can skip through a thin body between
   ticks. Returns a CAUSE or null. Called ONLY by the snake's owner. */
function hitTest(st, sn, fromX, fromY){
  const rHit = HEAD_R + BODY_R0;            /* head radius + a body radius */
  const rr = rHit * rHit;
  /* our own head-sweep as a segment */
  const hx = sn.hx, hy = sn.hy;

  for (let s = 0; s < st.snakes.length; s++){
    const o = st.snakes[s];
    if (!o.alive) continue;
    const self = (o.seat === sn.seat);
    const p = o.path;
    const start = self ? NECK_GRACE : 0;
    for (let i = start; i + 1 < p.length; i++){
      const a = p[i], b = p[i + 1];
      /* distance between two segments (head sweep vs body seg), squared.
         We approximate the segment-segment distance by the minimum of the
         four endpoint-to-segment tests — exact enough at these radii and
         fully integer/deterministic. */
      let m = segDist2(hx, hy, a.x, a.y, b.x, b.y);
      const m2 = segDist2(fromX, fromY, a.x, a.y, b.x, b.y);
      if (m2 < m) m = m2;
      const m3 = segDist2(a.x, a.y, fromX, fromY, hx, hy);
      if (m3 < m) m = m3;
      const m4 = segDist2(b.x, b.y, fromX, fromY, hx, hy);
      if (m4 < m) m = m4;
      if (m <= rr) return self ? CAUSE.SELF : CAUSE.OTHER;
    }
  }
  return null;
}

/* which live pellet is under this head, or -1. Field pellets and drops
   are both eligible; the head just has to be within a pellet radius. */
const PELLET_R = Math.round(1.1 * ONE);
function pelletUnder(st, sn){
  const rr = (HEAD_R + PELLET_R) * (HEAD_R + PELLET_R);
  for (let i = 0; i < st.live.length; i++){
    const p = pellet(st, st.live[i]);
    if (dist2(sn.hx, sn.hy, p.x, p.y) <= rr) return st.live[i];
  }
  for (let i = 0; i < st.drops.length; i++){
    const p = pellet(st, st.drops[i]);
    if (dist2(sn.hx, sn.hy, p.x, p.y) <= rr) return st.drops[i];
  }
  return -1;
}

/* ═══════════════════════════════════════════════════════════════════
   settle() — THE PELLET COURT
   A pure fold over every claim, in one order every phone computes the
   same way: (tick, seat, index). The first claim to reach a pellet still
   on the floor WINS it; a fresh field pellet replaces an eaten field
   pellet, while an eaten DROP simply disappears. Every later claim on the
   same pellet is not there — the loser runs the identical fold and takes
   its length back. Nothing here asks who is host. O(claims).
   ═══════════════════════════════════════════════════════════════════ */
function settle(st){
  const before = st.snakes.map(sn => sn.eats.join(','));
  st.claims.sort((a, b) => a.t - b.t || a.s - b.s || a.i - b.i);

  const live = new Set();
  for (let i = 0; i < st.food; i++) live.add(i);
  const drops = new Set(st.drops0 || []);   /* the drops seeded at deaths  */
  let issued = st.food - 1;
  const eats = st.snakes.map(() => []);
  const score = st.snakes.map(() => 0);

  for (let c = 0; c < st.claims.length; c++){
    const cl = st.claims[c];
    if (!st.snakes[cl.s]) continue;
    const isDrop = cl.i >= DROP_BASE;
    if (isDrop){
      if (!drops.has(cl.i)) continue;
      drops.delete(cl.i);
    } else {
      if (!live.has(cl.i)) continue;
      live.delete(cl.i);
      issued++; live.add(issued);           /* a fresh field pellet drops  */
    }
    eats[cl.s].push(cl.t);
    score[cl.s]++;
    cl.ok = 1;
  }
  for (let c = 0; c < st.claims.length; c++)
    if (st.claims[c].ok !== 1) st.claims[c].ok = 0;

  st.live = Array.from(live).sort((a, b) => a - b);
  st.drops = Array.from(drops).sort((a, b) => a - b);
  st.issued = issued;

  const redo = [];
  for (let s = 0; s < st.snakes.length; s++){
    const sn = st.snakes[s];
    sn.eats = eats[s];
    sn.score = score[s];
    if (before[s] !== sn.eats.join(',')) redo.push(sn);
  }
  return redo;
}

/* when a snake dies its body scatters DROP pellets — a pure function of
   (seat, dieTick) so every phone spawns the identical set with no wire.
   Registered in st.drops0 (the master list) and st.drops (still live). */
function scatterDrops(st, sn){
  if (sn.dieAt == null) return;
  const key = (sn.seat + 1) * 131 + sn.dieAt;
  const count = Math.max(3, Math.min(24, (sn.bodyTicks / 4) | 0));
  if (!st.drops0) st.drops0 = [];
  for (let k = 0; k < count; k++){
    const idx = DROP_BASE + key * 32 + k;
    if (st.drops0.indexOf(idx) < 0){ st.drops0.push(idx); st.drops.push(idx); }
  }
}

/* Advance the settled horizon: freeze everything before it. Snapshots
   move up, event and claim lists are pruned. The only garbage collection
   in the game and the only thing keeping a long round bounded. */
function advanceHorizon(st, toTick){
  const h = Math.max(0, Math.min(toTick, st.top - 1));
  if (h <= st.horizon) return;
  for (let s = 0; s < st.snakes.length; s++){
    const sn = st.snakes[s];
    if (sn.tick < h) continue;
    const want = sn.tick;
    restore(sn);
    simTo(st, sn, h, null);
    snapshot(sn, h);
    simTo(st, sn, want, null);
    sn.evs = sn.evs.filter(e => e.t > h);
  }
  /* CLAIMS ARE NOT PRUNED. settle() rebuilds the live-set and every score
     from the whole claim list, so dropping an old claim would silently
     un-eat a pellet and walk a score backward. A 150s round makes at most
     a couple of thousand tiny {i,s,t} records — bounded and cheap — so the
     court keeps the full history and stays exactly correct. */
  st.horizon = h;
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE
   A bot must feel FAIR: it sees the same buffered arena a person sees,
   it is slow to change its mind (re-decides on its own beat), and it
   makes deterministic mistakes at a rate set by its level. It hunts the
   nearest pellet, but it steers AWAY when a body is close ahead — and a
   good one leans to CUT OFF an opponent whose head is near, without
   diving into walls (there are none) or suiciding.

   The bot outputs an AIM angle (0..ANG-1). Steering, not a grid turn.
   ═══════════════════════════════════════════════════════════════════ */
const REACT = { 1:5, 2:3, 3:2 };       /* ticks between re-decisions       */
const SLIP  = { 1:26, 2:12, 3:4 };     /* wobble added to aim, in ang, /100*/
const LOOK  = Math.round(11 * ONE);    /* how far ahead the bot feels, fu  */

/* is a body within `LOOK` in the direction `a` from the head? returns the
   nearest squared distance found, or a big number */
function feel(st, sn, a){
  const spd = st.spd;
  const steps = 4;
  let worst = 1e18;
  for (let k = 1; k <= steps; k++){
    const fx = angWrapFu(sn.hx + ((TCOS[a] * spd * k) >> TRIG) * (LOOK / (steps * spd) | 0 || 1));
    const fy = angWrapFu(sn.hy + ((TSIN[a] * spd * k) >> TRIG) * (LOOK / (steps * spd) | 0 || 1));
    for (let s = 0; s < st.snakes.length; s++){
      const o = st.snakes[s];
      if (!o.alive) continue;
      const p = o.path;
      const start = (o.seat === sn.seat) ? NECK_GRACE : 0;
      /* sample every few body points — enough to feel a wall of body */
      for (let i = start; i < p.length; i += 3){
        const d2 = dist2(fx, fy, p[i].x, p[i].y);
        if (d2 < worst) worst = d2;
      }
    }
  }
  return worst;
}

/* the aim this bot wants for tick t, or null to keep the current aim */
function bot(st, sn, t, lvl){
  lvl = Math.max(1, Math.min(3, lvl | 0 || 2));
  if (!sn.alive) return null;
  const react = REACT[lvl];
  if ((t % react) !== (sn.seat % react)) return null;   /* its own beat    */

  const danger = (bodyR(sn.bodyTicks) + BODY_R0 + LOOK) *
                 (bodyR(sn.bodyTicks) + BODY_R0 + LOOK);

  /* candidate aims: straight on and a fan to either side */
  const fan = [0, TURN, -TURN, TURN * 2, -TURN * 2, TURN * 3, -TURN * 3, ANG / 2];
  /* the target: nearest pellet by squared toroidal distance */
  let best = null, bd = 1e18;
  const scan = st.live;
  for (let i = 0; i < scan.length; i++){
    const p = pellet(st, scan[i]);
    const d2 = dist2(sn.hx, sn.hy, p.x, p.y);
    if (d2 < bd){ bd = d2; best = p; }
  }
  for (let i = 0; i < st.drops.length; i++){
    const p = pellet(st, st.drops[i]);
    const d2 = dist2(sn.hx, sn.hy, p.x, p.y);
    if (d2 < bd){ bd = d2; best = p; }
  }

  let want = sn.ang;
  if (best){
    const dx = wrapDelta(best.x - sn.hx), dy = wrapDelta(best.y - sn.hy);
    want = angOf(dx, dy);
  }

  /* score each candidate: prefer clear room, then heading toward food */
  let bestA = sn.ang, bestV = -1e18;
  for (let f = 0; f < fan.length; f++){
    const a = angWrap(sn.ang + fan[f]);
    const room = feel(st, sn, a);            /* bigger = clearer            */
    let v = Math.min(room, 4e9);             /* room dominates              */
    if (room < danger) v -= 5e9;             /* something close ahead: avoid*/
    /* alignment with the wanted (food) direction, 0..1 in ang terms */
    const align = (ANG / 2 - Math.abs(angDelta(a, want)));
    v += align * 3e6;
    if (v > bestV){ bestV = v; bestA = a; }
  }

  /* CUT-OFF (level 3, sometimes 2): if an opponent head is near and
     roughly ahead, steer to arc across its path rather than to food */
  if (lvl >= 2){
    let vx = null, vd = 1e18;
    for (let s = 0; s < st.snakes.length; s++){
      const o = st.snakes[s];
      if (o.seat === sn.seat || !o.alive) continue;
      const d2 = dist2(sn.hx, sn.hy, o.hx, o.hy);
      if (d2 < vd){ vd = d2; vx = o; }
    }
    const near = (WORLD_U * 0.10 * ONE) * (WORLD_U * 0.10 * ONE);
    if (vx && vd < near && (lvl === 3 || (hash32(st.seed, t, sn.seat) & 1))){
      /* aim a little AHEAD of the victim's head */
      const lead = 3;
      const tx = angWrapFu(vx.hx + ((TCOS[vx.ang] * st.spd * lead) >> TRIG));
      const ty = angWrapFu(vx.hy + ((TSIN[vx.ang] * st.spd * lead) >> TRIG));
      const ca = angOf(wrapDelta(tx - sn.hx), wrapDelta(ty - sn.hy));
      /* only if that direction is not itself into a body */
      if (feel(st, sn, ca) >= danger) bestA = ca;
    }
  }

  /* the deliberate wobble: a small deterministic aim error by level */
  const slip = SLIP[lvl];
  if (slip){
    const r = (hash32(st.seed, t * 7 + 3, sn.seat + 101) % 200) - 100;   /* -100..99 */
    bestA = angWrap(bestA + ((r * slip) / 100) | 0);
  }
  return angWrap(bestA);
}

/* integer atan2 -> ang index, from the table (no Math in the sim path):
   pick the ang whose direction best matches (dx,dy) by maximizing the dot
   product with the table — O(ANG) but ANG is 256 and this runs a few
   times per bot decision, not per tick per snake. Fully deterministic. */
function angOf(dx, dy){
  /* scale down to keep the dot product inside 32 bits */
  let sx = dx, sy = dy;
  while (Math.abs(sx) > 4096 || Math.abs(sy) > 4096){ sx >>= 1; sy >>= 1; }
  let bestA = 0, bestDot = -1e18;
  for (let a = 0; a < ANG; a++){
    const dot = TCOS[a] * sx + TSIN[a] * sy;
    if (dot > bestDot){ bestDot = dot; bestA = a; }
  }
  return bestA;
}

/* ═══════════════════════════════════════════════════════════════════
   THE ROUND
   ═══════════════════════════════════════════════════════════════════ */
const aliveCount = st => st.snakes.reduce((a, s) => a + (s.alive ? 1 : 0), 0);

function over(st){
  if (st.over) return true;
  if (st.top >= roundTicks(st)) return true;      /* the timer always ends  */
  return aliveCount(st) <= (st.n > 1 ? 1 : 0);
}

/* Final standings. A snake still alive outranks a dead one; among the
   dead, later death beats earlier; ties break on length, then score,
   then seat. At a TIME end, everyone is "alive" so it falls straight to
   length — the longest wins. Pure, so every phone prints the same board. */
function standings(st){
  return st.snakes.map(sn => ({
    seat: sn.seat,
    score: sn.score,
    len: sn.bodyTicks,
    alive: sn.alive,
    dieAt: sn.alive ? Infinity : (sn.dieAt == null ? 0 : sn.dieAt),
    why: sn.dieWhy
  })).sort((a, b) => b.dieAt - a.dieAt || b.len - a.len ||
                     b.score - a.score || a.seat - b.seat);
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE
   js/mp.js's generic codec carries `a` (the action) plus a bitmask and
   one byte per declared field. Every number here is 0..255; a tick, which
   outlives a byte after a few seconds, travels as two.

     aim   {t:'aim',   tick, ang}   -> i,j=tick, s=ang 0..255
     boost {t:'boost', tick, on}    -> i,j=tick, n=on 0/1
     eat   {t:'eat',   tick, idx}   -> i,j=tick, n,c=idx (drops need 3 bytes)
     die   {t:'die',   tick, why}   -> i,j=tick, s=cause 0..4
     again {t:'again', on}          -> v

   Drop-pellet indices are large (>= 1<<20). They travel as a small OFFSET
   in the same (n,c) pair by sending (idx - DROP_BASE) tagged with s=1;
   field pellets send the raw index with s=0. WIRE_FIELDS is published on
   the lobby, which mp.js prefers over its own table.
   ═══════════════════════════════════════════════════════════════════ */
const WIRE_FIELDS = ['i', 'j', 's', 'n', 'c', 'v'];

const lo = v => (v | 0) & 255;
const hi = v => ((v | 0) >> 8) & 255;
const un = (l, h) => ((h | 0) << 8) | (l | 0);

function encWire(mv){
  if (!mv) return null;
  if (mv.t === 'aim')   return { t:'aim',   i:lo(mv.tick), j:hi(mv.tick), s:(mv.ang | 0) & 255 };
  if (mv.t === 'boost') return { t:'boost', i:lo(mv.tick), j:hi(mv.tick), n:(mv.on ? 1 : 0) };
  if (mv.t === 'eat'){
    const drop = mv.idx >= DROP_BASE;
    const raw = drop ? (mv.idx - DROP_BASE) : mv.idx;
    return { t:'eat', i:lo(mv.tick), j:hi(mv.tick), n:lo(raw), c:hi(raw), s:(drop ? 1 : 0) };
  }
  if (mv.t === 'die')   return { t:'die',   i:lo(mv.tick), j:hi(mv.tick), s:Math.max(0, Math.min(4, mv.why | 0)) };
  if (mv.t === 'again') return { t:'again', v: mv.on ? 1 : 0 };
  return null;
}
function decWire(w){
  if (!w || typeof w !== 'object') return null;
  const t = w.t || w.a;
  if (t === 'aim')   return { t:'aim',   tick: un(w.i, w.j), ang: (w.s | 0) & 255 };
  if (t === 'boost') return { t:'boost', tick: un(w.i, w.j), on: !!(w.n | 0) };
  if (t === 'eat'){
    const raw = un(w.n, w.c);
    return { t:'eat', tick: un(w.i, w.j), idx: (w.s ? DROP_BASE + raw : raw) };
  }
  if (t === 'die')   return { t:'die',   tick: un(w.i, w.j), why: (w.s | 0) };
  if (t === 'again') return { t:'again', on: !!w.v };
  return null;
}

/* ── the agreement line, for a bug report and for the determinism proof.
   Hashes the whole settled world state to a short string. ─────────── */
function check(st){
  const parts = ['serp2', st.seed, st.top, st.live.length, st.drops.length];
  for (let s = 0; s < st.snakes.length; s++){
    const x = st.snakes[s];
    parts.push(x.seat + ':' + x.hx + ',' + x.hy + ':' + x.ang + ':' +
               x.bodyTicks + ':' + x.score + ':' + (x.alive ? 'a' : 'd' + x.dieAt));
  }
  const s = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

root.KARTI_SERP = {
  engine: {
    MIN_SEATS, MAX_SEATS, CAUSE, SPEEDS, HORIZON,
    FP, ONE, WORLD, WORLD_U, ANG, TURN,
    BODY_R0, HEAD_R, SEG_START, GROW_TICKS, DROP_BASE,
    TCOS, TSIN, WIRE_FIELDS,
    angWrap, angDelta, angOf, wrapDelta, wrapFu: angWrapFu, dist2, segDist2, bodyR,
    speedOf, foodFor, roundTicks,
    deal, plan, simTo, snapshot, restore, advanceHorizon,
    hitTest, pellet, pelletUnder, settle, scatterDrops,
    bot, over, aliveCount, standings, hash32,
    encWire, decWire, check
  }
};

})(typeof window !== 'undefined' ? window : globalThis);
