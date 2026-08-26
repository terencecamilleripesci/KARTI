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

   ── A SCALABLE WORLD, STILL FULLY DETERMINISTIC ────────────────────
   WORLD_U/WORLD are no longer frozen constants: the arena grows with the
   snake count so a full table of long snakes has room to move (snake.io
   reads badly in a cramped world). worldFor(n) is a PURE function of the
   seated count, so it is part of the match tuple exactly like the seed —
   every phone that builds `deal(opts, seed)` with the same `seats` builds
   the identical world, in lockstep, with nothing on the wire. deal() sets
   these module lets ONCE, before any tick runs; the geometry helpers
   (wrapDelta / angWrapFu / dist2 / segDist2) and pellet() all read the
   live value, so a bigger world wraps, tiles food and measures distance at
   the new size with no other change. The export object exposes WORLD /
   WORLD_U as getters so the screen always paints the current match's size
   (bounds, minimap, hero caps). */
const FP    = 8;                 /* 256 sub-units per world unit         */
const ONE   = 1 << FP;
const WORLD_MIN_U = 200;         /* the floor: a 2–3 snake arena         */
let WORLD_U = WORLD_MIN_U;       /* world side, in units (per match)     */
let WORLD   = WORLD_U << FP;     /* world side, in fu   (per match)      */

/* the arena side, in units, for a seated count. Grows with the table so
   more/longer snakes still have room; capped so it never gets so vast that
   snakes never meet. PURE — the same n gives the same size on every phone. */
function worldFor(n){
  n = Math.max(MIN_SEATS, Math.min(MAX_SEATS, n | 0 || 2));
  /* 200 at 2 snakes, +38 units per extra snake → 428 at a full 8-snake
     table. A long snake is ~a hundred body-ticks ≈ 200 units of trail, so
     even the big arena stays a place where paths cross. */
  return WORLD_MIN_U + Math.max(0, n - 2) * 38;
}
/* set the live world size for the match about to be dealt. Called once by
   deal(), before any geometry or tick — this is what keeps it deterministic. */
function setWorld(n){
  WORLD_U = worldFor(n);
  WORLD   = WORLD_U << FP;
}

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

/* TURN is the whole "feel" of the steering. It was 8 (~11.25°/tick → a 90°
   turn took 8 ticks / 440ms, which read as floaty and laggy). Raised to 12
   (~16.9°/tick → a 90° turn is 6 ticks / ~330ms) so the head chases the
   thumb noticeably faster. It is still a CAP, not a snap: a 180° reversal
   takes ANG/2 / TURN = ~11 ticks, and NECK_GRACE body-ticks at the head are
   exempt from the self-kill test, so the tighter arc still cannot curl back
   onto your own neck in one move. Determinism-critical (it changes the hash
   on purpose vs the old build) — re-proved by the 1000× replay. */
const TURN        = 12;                /* ang-steps/tick (~16.9°/tick)    */
const BOOST_TURN  = 9;                 /* a little less nimble at sprint  */
const BODY_R0     = Math.round(1.55 * ONE);
const HEAD_R      = Math.round(1.35 * ONE);
/* SNAKE.IO RAMP: everyone is BORN TINY and grows by eating, exactly like
   slither.io / snake.io. SEG_START is a short starter snake (a few body
   ticks), and each pellet adds GROW_TICKS so length ACCUMULATES over the
   match — a fed player becomes a long snake, a fresh/respawned one is small
   again. These are the deterministic SIM baseline (they change the hash on
   purpose vs the old long-start build, but stay self-consistent). */
const SEG_START   = 5;                 /* body ticks at birth — a SMALL snake */
/* Halved from 4: at 4 a decent run ballooned a snake so fast the body
   filled the screen in a couple of minutes, and the length race was over
   before anybody had to fight for it. At 2 the growth curve is a climb,
   not a rocket — you EARN a long body. (Engine constant: both phones in a
   room must share it, which the sw cache bump enforces on next open.) */
const GROW_TICKS  = 2;                 /* body ticks each pellet adds         */
const MIN_TICKS   = 4;                 /* never shorter than this (< start)   */
const NECK_GRACE  = 5;                 /* body ticks near the head that
                                          cannot self-kill. One more than the
                                          old 4 to keep the tighter TURN=12
                                          arc from ever clipping its own neck. */

/* ── LIVES ──────────────────────────────────────────────────────────
   Each snake starts with LIVES_DEFAULT lives. Ramming a body costs ONE
   life and RESPAWNS the snake small at a deterministically-chosen empty
   spot; at zero it is OUT (eliminated). The count is DERIVED, never a wire
   flag: a snake's remaining lives = LIVES − (accepted deaths so far), read
   off its own die-event history exactly the way growth is read off the eat
   list — so a late `die` message rewinds and re-counts to the same answer
   on every phone. LIVES travels in opts (part of the match tuple). */
const LIVES_DEFAULT = 3;
const LIVES_MAX     = 5;

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

/* how many pellets float on the map at once. Scales with the ARENA AREA so
   a bigger (more-snakes) world does not read as empty: the base density is
   the old 200×200 feel, multiplied by how much bigger this match's world is.
   Pure in (n → worldFor(n)), so it is identical on every phone. */
function foodFor(n){
  const base = 60 + n * 14;
  const areaMul = (worldFor(n) * worldFor(n)) / (WORLD_MIN_U * WORLD_MIN_U);
  return Math.round(base * areaMul);
}

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
   uniformly; DROP pellets (index >= DROP_BASE) DRIP ALONG THE DEAD SNAKE —
   they cluster around WHERE IT FELL, not at a random point across the map, so
   killing or outliving a snake leaves a satisfying pile to eat right there
   (real snake.io). The death's head position is recorded per drop-block in
   st.dropOrigin at scatter time (a pure function of the deterministic death),
   and the pellet is placed in a small seeded scatter around it — so every
   phone still agrees with no wire. A block with no recorded origin (e.g. a
   stale index) falls back to the old uniform hash so nothing ever breaks.
   Returns fu coordinates. Drops are worth a touch more so eating a corpse pays. */
function pellet(st, i){
  i = i | 0;
  if (i >= DROP_BASE){
    const block = ((i - DROP_BASE) / 64) | 0;
    const org = st.dropOrigin && st.dropOrigin[block];
    if (org){
      /* a seeded offset within ~a body-length of the fall, per pellet */
      const spread = ((WORLD_U * 0.06) | 0) << FP;    /* cluster radius, fu   */
      const ox = (hash32(st.seed >>> 0, i * 2 + 1, 0xD30F) % (spread * 2)) - spread;
      const oy = (hash32(st.seed >>> 0, i * 2 + 2, 0xD31F) % (spread * 2)) - spread;
      return { x: angWrapFu(org.x + ox), y: angWrapFu(org.y + oy), i, drop:1 };
    }
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
/* build a fresh SMALL snake body around a head at (hx,hy) facing `dir`. Used
   by both the opening and a respawn, so a reborn snake is exactly a newborn:
   SEG_START ticks of straight tail behind the head. */
function freshBody(st, hx, hy, dir){
  const back = angWrap(dir + ANG / 2);
  const path = [];
  const spd = spdFu(speedOf(st.speed));
  for (let k = 0; k < SEG_START; k++){
    path.push({
      x: angWrapFu(hx + ((TCOS[back] * spd) >> TRIG) * k),
      y: angWrapFu(hy + ((TSIN[back] * spd) >> TRIG) * k)
    });
  }
  return path;
}

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
  return { hx, hy, dir, path: freshBody(st, hx, hy, dir) };
}
function angWrapFu(v){ v = v % WORLD; if (v < 0) v += WORLD; return v | 0; }

/* ── a deterministic SAFE respawn spot ──────────────────────────────
   A snake that has a life left comes back small. Where it comes back MUST be
   a PURE function of (seed, seat, dieTick, deaths) — no wire, no clock, no
   Math.random — because every phone re-derives it locally when it replays
   the die event, and a rewind (a late message, or advanceHorizon's walk)
   re-derives it AGAIN later.

   THE OLD BUG, so it is never re-made: this used to probe seeded candidates
   and keep the first one "clear of every living body" — but "every living
   body" is st.snakes[*].path AT WHATEVER TICK THIS PHONE HAS SIMULATED EACH
   SNAKE TO. Remote snakes run behind a per-client jitter buffer, so every
   phone (and every rewind on the SAME phone) saw different bodies, picked a
   different candidate, and the respawned head diverged — the classic
   "starts fine then breaks" desync, proved by the staggered-client harness.

   Now the choice reads NOTHING live: probe the same seeded candidates and
   take the one FARTHEST (squared, toroidal) from where the snake fell. The
   fall point (sn.hx/hy at the die tick) is a pure function of the snake's
   own event history, so every phone — at any replay time — lands on the
   identical spot. Far-from-the-fall is also decent play: you died where the
   bodies are, so you come back away from the pile (and away from your own
   fresh drop pellets). Integer/squared only, fully deterministic. */
function respawnAt(st, sn){
  const key = (sn.seat + 1) * 977 + (sn.dieAt | 0) * 131 + (sn.deaths | 0);
  let bestX = WORLD / 2, bestY = WORLD / 2, bestDir = 0, bestFar = -1;
  for (let c = 0; c < 12; c++){
    const h = hash32(st.seed >>> 0, key, c * 2 + 1);
    const j = hash32(st.seed >>> 0, key, c * 2 + 2);
    const hx = h % WORLD, hy = j % WORLD;
    /* squared toroidal distance from the fall point — pure per-snake data */
    const far = dist2(hx, hy, sn.hx, sn.hy);
    if (far > bestFar){
      bestFar = far; bestX = hx; bestY = hy;
      bestDir = (hash32(st.seed >>> 0, key, c * 2 + 99) % ANG);
    }
  }
  return { hx: bestX, hy: bestY, dir: bestDir };
}

/* respawn a snake in place: small again, lives-1 already counted by the die
   fold. Called deterministically from stepOne when a non-final death lands. */
function doRespawn(st, sn){
  const r = respawnAt(st, sn);
  sn.hx = r.hx; sn.hy = r.hy;
  sn.ang = r.dir; sn.aim = r.dir;
  sn.boost = 0;
  sn.bodyTicks = SEG_START;
  sn.grow = 0;
  sn.path = freshBody(st, r.hx, r.hy, r.dir);
  sn.alive = true;
  sn.dieAt = null; sn.dieWhy = null;
}

/* ═══════════════════════════════════════════════════════════════════
   deal(opts, seed) -> st
   opts: { seats, speed, lvl, names } — everything a phone can know before
   a tick has happened, and nothing that needs a network.
   ═══════════════════════════════════════════════════════════════════ */
function deal(opts, seed){
  opts = opts || {};
  const n = Math.max(MIN_SEATS, Math.min(MAX_SEATS, opts.seats | 0 || 2));
  const sp = speedOf(opts.speed);

  /* SIZE THE WORLD FIRST — a pure function of the seated count, set before
     any geometry runs, so the whole match (opening ring, food tiling, wrap)
     is built at the identical size on every phone. Part of the match tuple. */
  setWorld(n);

  /* LIVES for this match: default 3, clamped, carried in opts (match tuple). */
  const lives = Math.max(1, Math.min(LIVES_MAX,
                  (opts.lives == null ? LIVES_DEFAULT : opts.lives | 0) || LIVES_DEFAULT));

  const st = {
    v: 2,
    seed: seed >>> 0,
    n,
    world: WORLD, worldU: WORLD_U, fp: FP,
    step: sp.step,
    speed: sp.id,
    spd: spdFu(sp),
    lvl: Math.max(1, Math.min(3, opts.lvl | 0 || 2)),
    lives,                /* lives every snake starts with (match config)   */
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
      lives: st.lives,          /* remaining lives — DERIVED, kept in sync */
      deaths: 0,                /* accepted deaths so far (=> lives spent) */
      out: false,               /* eliminated: 0 lives left                */
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
    alive: sn.alive, dieAt: sn.dieAt, dieWhy: sn.dieWhy,
    lives: sn.lives, deaths: sn.deaths, out: sn.out
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
  sn.lives = s.lives; sn.deaths = s.deaths; sn.out = s.out;
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

  /* the death stamped at this tick. The OWNER put it there; everyone else is
     only replaying what it was told. LIVES: a death spends one. `deaths` is
     recomputed from the whole event list up to t (a rewind must re-count, not
     accumulate), so lives = st.lives − deaths is exact on every phone. With a
     life still in hand the snake RESPAWNS SMALL, right now, at a seeded safe
     spot; at zero it is OUT — dead for good. Respawn position is a pure
     function of (seed, seat, dieTick, deaths) so nobody sends it. */
  /* find a die stamped at EXACTLY this tick (there is at most one — plan()
     dedupes (tick,kind)). We do NOT recount the whole list: sn.deaths is a
     PERSISTENT counter that survives horizon pruning (the snapshot carries it
     and restore() puts it back), and each forward pass applies each die tick
     exactly once. Recounting from sn.evs would be wrong the moment an old die
     event is pruned past the horizon — the count would silently reset. */
  let dieWhy = null;
  for (let i = 0; i < sn.evs.length; i++){
    const e = sn.evs[i];
    if (e.t > t) break;
    if (e.t === t && e.k === 'die'){ dieWhy = e.n | 0; break; }
  }
  if (dieWhy !== null){
    sn.deaths = (sn.deaths | 0) + 1;                 /* incremental, prune-safe */
    sn.lives  = Math.max(0, st.lives - sn.deaths);
    sn.dieAt = t; sn.dieWhy = dieWhy;
    /* DRIP FOOD: the body scatters into pellets, keyed on (seat, dieTick,
       deaths) so every phone spawns the identical set with no wire. Done here,
       from the PRE-respawn length, so the amount matches the snake that just
       fell — killing/outliving a long snake is a real feeding opportunity. */
    scatterDrops(st, sn, sn.bodyTicks, sn.deaths);
    if (sn.lives > 0){
      /* a life in hand: come back tiny at a seeded clear spot */
      doRespawn(st, sn);
    } else {
      sn.out = true; sn.alive = false;
    }
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
   (seat, dieTick, deaths) so every phone spawns the identical set with no
   wire. `len` is the PRE-respawn length so the drip matches the fallen snake;
   `deaths` keeps each of a snake's several deaths on its own key. Registered
   in st.drops0 (the master list) and st.drops (still live). The amount is
   generous — roughly one pellet per ~2.5 body-ticks, capped — so outliving or
   killing a big snake leaves a satisfying pile to eat. Called ENGINE-INTERNAL
   from stepOne when a death lands, so it is derived from the die fold and can
   never be double-counted by a rewind (the idx-dedupe guarantees it). */
function scatterDrops(st, sn, len, deaths){
  const dieAt = sn.dieAt;
  if (dieAt == null) return;
  const count = Math.max(4, Math.min(48, ((len | 0) * 2 / 5) | 0));
  /* The drop OFFSET (idx − DROP_BASE) must fit the 16-bit (n,c) wire pair, so
     each death gets a seeded 64-slot BLOCK inside [0..65535]. The block is a
     hash of (seed, seat, dieTick, deaths) → 0..1023, times 64. Two deaths that
     land on the same block share positions — harmless and still deterministic
     — but with 1024 blocks over a 150s round that is vanishingly rare. */
  const block = hash32(st.seed >>> 0, (sn.seat + 1) * 131 + dieAt, deaths | 0) & 1023;
  if (!st.drops0) st.drops0 = [];
  /* record WHERE the snake fell so pellet() drips this block's drops around it
     (deterministic: the head position at a deterministic death is itself
     deterministic). Idempotent under a rewind — the same block, same origin. */
  if (!st.dropOrigin) st.dropOrigin = {};
  st.dropOrigin[block] = { x: sn.hx, y: sn.hy };
  for (let k = 0; k < count; k++){
    const idx = DROP_BASE + block * 64 + k;            /* ≤ 1023·64+47 < 65536 */
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

  /* CUT-OFF — the aggressive move, and the thing that made AI a RUNAWAY:
     it used to fire at level 3 EVERY decision and at level 2 half the time,
     so the machines spent the opening lunging at each other, the arena
     emptied in ~12s, and one or two survivors ballooned on the corpses while
     a (more cautious) human was long dead. Now it is:
       · level 3 ONLY (a Ruthless bot still hunts; Normal/Gentle just play);
       · a THROTTLED chance (~1 in 4 decisions), not every beat;
       · only when the victim is genuinely CLOSE and only into clear space.
     A human can out-survive this instead of being cut off on tick one. */
  if (lvl >= 3){
    let vx = null, vd = 1e18;
    for (let s = 0; s < st.snakes.length; s++){
      const o = st.snakes[s];
      if (o.seat === sn.seat || !o.alive) continue;
      const d2 = dist2(sn.hx, sn.hy, o.hx, o.hy);
      if (d2 < vd){ vd = d2; vx = o; }
    }
    const near = (WORLD_U * 0.08 * ONE) * (WORLD_U * 0.08 * ONE);
    const wantsCut = (hash32(st.seed, t, sn.seat + 7) & 3) === 0;   /* ~1/4    */
    if (vx && vd < near && wantsCut){
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
/* on the board right now (may still respawn) */
const aliveCount = st => st.snakes.reduce((a, s) => a + (s.alive ? 1 : 0), 0);
/* STILL IN THE MATCH: has a life left. Elimination is `out`, and the round
   is over when at most one snake is not out. */
const inCount = st => st.snakes.reduce((a, s) => a + (s.out ? 0 : 1), 0);

function over(st){
  if (st.over) return true;
  if (st.top >= roundTicks(st)) return true;      /* the timer always ends  */
  return inCount(st) <= (st.n > 1 ? 1 : 0);
}

/* Final standings with LIVES. A snake still IN (not out) outranks an
   eliminated one; more lives left beats fewer; among the eliminated, later
   elimination beats earlier; ties break on length, then score, then seat. At
   a TIME end everyone still in is ranked by lives-then-length, so the last
   survivors are read correctly. Pure, so every phone prints the same board. */
function standings(st){
  return st.snakes.map(sn => ({
    seat: sn.seat,
    score: sn.score,
    len: sn.bodyTicks,
    lives: sn.lives,
    out: sn.out,
    alive: sn.alive && !sn.out,
    /* eliminated snakes rank by WHEN they were eliminated (later = better);
       snakes still in outrank all of them */
    dieAt: sn.out ? (sn.dieAt == null ? 0 : sn.dieAt) : Infinity,
    why: sn.dieWhy
  })).sort((a, b) => b.dieAt - a.dieAt || b.lives - a.lives ||
                     b.len - a.len || b.score - a.score || a.seat - b.seat);
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
     skin  {t:'skin',  v}           -> v  (exclusive-set byte, 1 = The
           Silver Dream; sent once near match start so every phone can
           dress that seat's snake. Reuses the declared `v` field — the
           field list does NOT grow — and an older build's decWire
           returns null on the unknown action and simply ignores it.)

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
  if (mv.t === 'skin')  return { t:'skin',  v: (mv.v | 0) & 255 };
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
  if (t === 'skin')  return { t:'skin',  v: (w.v | 0) & 255 };
  return null;
}

/* ── the agreement line, for a bug report and for the determinism proof.
   Hashes the whole settled world state to a short string. ─────────── */
function check(st){
  const parts = ['serp3', st.seed, st.worldU, st.lives, st.top,
                 st.live.length, st.drops.length];
  for (let s = 0; s < st.snakes.length; s++){
    const x = st.snakes[s];
    parts.push(x.seat + ':' + x.hx + ',' + x.hy + ':' + x.ang + ':' +
               x.bodyTicks + ':' + x.score + ':' + x.lives + ':' +
               (x.out ? 'o' + x.dieAt : x.alive ? 'a' : 'd' + x.dieAt));
  }
  const s = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

const engine = {
    MIN_SEATS, MAX_SEATS, CAUSE, SPEEDS, HORIZON,
    FP, ONE, ANG, TURN,
    BODY_R0, HEAD_R, SEG_START, GROW_TICKS, DROP_BASE,
    LIVES_DEFAULT, LIVES_MAX, WORLD_MIN_U, worldFor,
    TCOS, TSIN, WIRE_FIELDS,
    angWrap, angDelta, angOf, wrapDelta, wrapFu: angWrapFu, dist2, segDist2, bodyR,
    speedOf, foodFor, roundTicks, inCount,
    deal, plan, simTo, snapshot, restore, advanceHorizon,
    hitTest, pellet, pelletUnder, settle, scatterDrops,
    bot, over, aliveCount, standings, hash32,
    encWire, decWire, check
};
/* WORLD / WORLD_U are per-match (they scale with the seated count), so the
   screen must always read the CURRENT match's size. Getters keep every
   E.WORLD / E.WORLD_U reader (bounds, minimap, hero caps) live rather than
   frozen at load. */
Object.defineProperty(engine, 'WORLD',   { get(){ return WORLD; },   enumerable:true });
Object.defineProperty(engine, 'WORLD_U', { get(){ return WORLD_U; }, enumerable:true });
root.KARTI_SERP = { engine };

})(typeof window !== 'undefined' ? window : globalThis);
