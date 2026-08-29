/* ═══════════════════════════════════════════════════════════════════
   KARTI — tapp.js
   IT-TAPP — "the cap". Flicking bottle caps across a table is a real
   Mediterranean kids' game; this is that game played as football, the
   way SOCCER STARS / SOCCER CAPS play it: soccer on top, BILLIARDS
   underneath. Round caps, elastic collisions, momentum carried through
   a chain, friction bringing the table to rest, walls that bounce, and
   a lighter faster puck of a ball.

   The pure engine: rules and physics only. No DOM, no clock, no sound.
   The ONE Math.random in this file lives in newSeed(), the same
   quarantine js/aqleb.js, js/sqaq.js and js/hajja.js keep. The screen
   half is js/tapp-ui.js.

   THE GAME
     Two to four players. Each has a set of caps of their colour on the
     pitch and there is ONE shared ball. Each player defends the goal
     mouth on their own wall. On your turn you flick exactly ONE of your
     caps — a slingshot: you drag BACK from the cap and let go, and the
     cap fires along the opposite line, hard as you pulled. It slides,
     it strikes other caps and the ball, everything slides on and comes
     to rest, and only THEN does the turn pass. Put the ball through
     somebody else's mouth and you have scored. First to GOAL_TARGET
     goals takes it.

   TURN BASED ON PURPOSE — this is load-bearing
     One flick per turn means one small move on the wire ({cap, angle,
     power}) and BOTH phones run the identical simulation from it. The
     relay never sees the physics. CLAUDE.md's budget is 25 msg/s per
     connection; a turn-based table sends one message per THINK, not 25
     per second, so IT-TAPP costs the relay less than a card game.

   DETERMINISM — the whole reason online is honest
     Every coordinate, every velocity, every radius is an INTEGER in
     "subunits". Nothing in the simulation is a float that accumulates:
     every scale is an integer multiply followed by Math.trunc, the
     directions come from a BAKED quarter-table (never Math.cos), and
     every square root is an exact integer isqrt that refines its own
     seed so it cannot depend on the platform's Math.sqrt rounding.
     Same seed + same flicks ⇒ byte-identical positions on every phone,
     which is what makes a replay a replay and an online table honest.
     (js/ballun.js does the same with its fixed-point sub-positions;
     this file borrows its technique and its direction-table trick.)

   WHAT IS DELIBERATELY APPROXIMATE (say it out loud)
     · Collisions are resolved at sub-step granularity, not by solving
       the exact time of impact. The sub-step count is derived from the
       fastest body on the table, so a fast cap is stepped finely enough
       that it can never tunnel through another cap.
     · Every impulse truncates toward zero, so the table always LOSES a
       little energy at a contact and never gains any. Truncation is the
       friend of stability here.
     · A goal mouth is a gap in a flat wall, not two round posts: the
       ball passes only when it is fully inside the mouth, otherwise it
       bounces off the wall. Caps never pass — the mouth is solid for
       them, so a cap can never be lost off the pitch.

   COORDINATES
     x grows right, y grows DOWN. The pitch is W × H subunits.
     Edge 0 = BOTTOM (y = H), edge 1 = TOP (y = 0), edge 2 = LEFT
     (x = 0), edge 3 = RIGHT (x = W). Seat k defends edge k, so a table
     of two uses bottom/top only and the other two walls are solid.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ── the pitch ─────────────────────────────────────────────────────────
   TWO seats get a PORTRAIT pitch with the two mouths at the ends, which
   is the shape of a phone and the shape of the game. THREE or FOUR get a
   SQUARE one, because then there is a mouth on every wall and a portrait
   pitch would quietly hand the two seats on the long walls a shorter
   pitch to shoot across than the two on the short walls. Square means a
   90° rotation maps every seat onto the next — the same congruence
   argument js/aqleb.js makes for its opening. */
const PITCH_2 = { W: 6400, H: 9600 };
const PITCH_N = { W: 8000, H: 8000 };
function pitchOf(seats){ return seats <= 2 ? PITCH_2 : PITCH_N; }

const CAP_R = 260;                 /* a cap's radius                     */
const BALL_R = 190;                /* the ball is smaller…               */
const CAP_M = 3, BALL_M = 1;       /* …and lighter, so it flies          */
const GOAL_W = 1000;               /* the mouth, centred on its wall     */

const MIN_SEATS = 2, MAX_SEATS = 4;
const GOAL_TARGET = 3;             /* first to three                     */

/* how many caps a seat gets. The reference plays five a side head to
   head; more seats would silt the pitch up, so it scales down. */
function capsPerSeat(seats){ return seats <= 2 ? 5 : seats === 3 ? 4 : 3; }

/* ── the physics constants, all integer ratios over 256 ────────────── */
const FRICT = 238;                 /* v *= 238/256 each tick (~0.930)    */
const REST_W = 205;                /* wall bounce, 205/256 (~0.80)       */
const REST_B = 218;                /* body bounce e, 218/256 (~0.85)     */
const REST_B1 = 256 + REST_B;      /* (1+e) in 1/256ths                  */
const STOP_V = 26;                 /* below this a body is at rest       */
const STOP_V2 = STOP_V * STOP_V;
const MAX_SUBSTEP = 150;           /* no body may move further per step  */
const MAX_SUB = 12;                /* …and never more than 12 sub-steps  */
const MAX_TICKS = 400;             /* a settle is ~50 ticks; this is the
                                      hard floor under any pathology     */

/* the flick. angle is an index 0..255 into the direction table, power a
   1..64 notch. Both are one byte on the wire. */
const ANG_N = 256;
const POW_MIN = 1, POW_MAX = 64;
const SPD_MIN = 120, SPD_STEP = 13;   /* pow 1..64 → 120..939 per tick   */
const speedOf = p => SPD_MIN + (clampInt(p, POW_MIN, POW_MAX) - 1) * SPD_STEP;

function clampInt(v, lo, hi){ v = v | 0; return v < lo ? lo : v > hi ? hi : v; }
const trunc = Math.trunc;

/* ═══════════════════════════════════════════════════════════════════
   THE DIRECTION TABLE — baked, never computed. QUAD[i] is
   round(1024 · cos(2πi/256)) for i in 0..64; the other three quadrants
   are its exact mirrors (verified: the mirrored table reproduces
   round(1024·cos) and round(1024·sin) for all 256 indices with zero
   error). Math.cos is "implementation-approximated" in the spec, so it
   may not be bit-identical on every phone — this table is.
   ═══════════════════════════════════════════════════════════════════ */
const QUAD = [
   1024,  1024,  1023,  1021,  1019,  1016,  1013,  1009,
   1004,   999,   993,   987,   980,   972,   964,   955,
    946,   936,   926,   915,   903,   891,   878,   865,
    851,   837,   822,   807,   792,   775,   759,   742,
    724,   706,   688,   669,   650,   630,   610,   590,
    569,   548,   526,   505,   483,   460,   438,   415,
    392,   369,   345,   321,   297,   273,   249,   224,
    200,   175,   150,   125,   100,    75,    50,    25,
      0
];
const DIR_U = 1024;
function dirX(i){
  i = ((i % ANG_N) + ANG_N) % ANG_N;
  if (i <= 64)  return QUAD[i];
  if (i <= 128) return -QUAD[128 - i];
  if (i <= 192) return -QUAD[i - 128];
  return QUAD[256 - i];
}
function dirY(i){ return dirX(i + 192); }   /* sin(θ) = cos(θ − 90°)     */

/* the table index closest to a vector, by scanning all 256 — exact,
   cheap and free of Math.atan2 (which is also only "approximated"). */
function angleOf(dx, dy){
  dx = trunc(dx); dy = trunc(dy);
  if (dx === 0 && dy === 0) return 0;
  let best = 0, bestDot = -Infinity;
  for (let i = 0; i < ANG_N; i++){
    const d = dirX(i) * dx + dirY(i) * dy;
    if (d > bestDot){ bestDot = d; best = i; }
  }
  return best;
}

/* ── exact integer square root; refines whatever seed it is given, so
      the platform's Math.sqrt rounding cannot change the answer ────── */
function isqrt(n){
  n = trunc(n);
  if (n <= 0) return 0;
  let x = Math.floor(Math.sqrt(n));
  if (!isFinite(x)) x = 0;
  while (x > 0 && x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}
function dist(ax, ay, bx, by){
  const dx = ax - bx, dy = ay - by;
  return isqrt(dx * dx + dy * dy);
}

/* ── the ONE Math.random, quarantined (js/aqleb.js's newSeed) ───────── */
function newSeed(){ return (Math.random() * 0x100000000) >>> 0; }

/* a pure FNV hash of integers — the machine's tie-break, so every phone
   breaks a tie the same way. Never a clock, never Math.random. */
function hash32(list){
  let h = 2166136261;
  for (let i = 0; i < list.length; i++){
    h ^= (list[i] | 0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ═══════════════════════════════════════════════════════════════════
   LEVELS — the machine's three sharpnesses (js/aqleb.js's shape).
   ═══════════════════════════════════════════════════════════════════ */
const LEVELS = [
  { k: 1, name: 'It-Tifel', icon: 'diff-1',
    note: { en: 'Belts the nearest cap at the ball and hopes.',
            mt: 'Jisplodi l-eqreb tapp fuq il-ballun u jittama.' } },
  { k: 2, name: 'Tal-Każin', icon: 'diff-2',
    note: { en: 'Lines the shot up through the ball, towards your mouth.',
            mt: 'Jillinja l-botta mill-ballun, lejn il-lasta tiegħek.' } },
  { k: 3, name: 'Il-Kampjun', icon: 'diff-3',
    note: { en: 'Plays the whole table — chains, rebounds and the angle.',
            mt: 'Jilgħab il-mejda kollha — katini, rimbalzi u l-angolu.' } }
];
const levelOf = l => LEVELS.find(L => L.k === (l | 0)) || LEVELS[1];

/* ═══════════════════════════════════════════════════════════════════
   THE KICK-OFF FORMATION
   Positions are given relative to a seat's OWN wall: `a` is the offset
   along the wall from its centre, `d` a depth away from the goal line
   as a fraction (over 1000) of the pitch dimension perpendicular to
   that wall — so a side goal's formation is not squashed by the pitch
   being taller than it is wide.
   ═══════════════════════════════════════════════════════════════════ */
/* The shape was MEASURED, not chosen. With the caps spread wide and a
   2400-wide mouth the sharpest bot scored straight from the KICK-OFF in
   essentially every match — a table nobody would ever get a turn at.
   Pulling the two backs in beside the keeper so the three of them span
   the mouth, and narrowing the mouth to GOAL_W, took the kick-off goal
   rate over 30 seeds to:
       2 seats   IT-TIFEL 0%   TAL-KAŻIN 10%   IL-KAMPJUN 30%
       4 seats   IT-TIFEL 0%   TAL-KAŻIN  ~7%  IL-KAMPJUN 20%
   and a bot-vs-bot match to ~28 flicks at the top level, ~33 in the
   middle, every one of them reaching an ending. Change these numbers
   and RE-MEASURE — the harness is three lines around think()+apply(). */
const DEPTH = [45, 150, 330];       /* keeper, backs, forwards (/1000)   */
const SHAPE = {
  5: [ [0,0], [-750,1], [750,1], [-1900,2], [1900,2] ],
  4: [ [0,0], [-750,1], [750,1], [0,2] ],
  3: [ [0,0], [-800,1], [800,1] ]
};
function homeSpot(edge, a, di, dOff, W, H){
  let d = (edge <= 1 ? trunc(H * DEPTH[di] / 1000) : trunc(W * DEPTH[di] / 1000)) + (dOff | 0);
  if (d < CAP_R + 40) d = CAP_R + 40;
  if (edge === 0) return { x: trunc(W / 2) + a, y: H - d };
  if (edge === 1) return { x: trunc(W / 2) - a, y: d };
  if (edge === 2) return { x: d,                y: trunc(H / 2) - a };
  return               { x: W - d,              y: trunc(H / 2) + a };
}
/* THE KICK-OFF IS NOT IDENTICAL EVERY TIME — and it must not be. The
   simulation is deterministic and so is the machine, so a fixed kick-off
   means a bot that finds one scoring flick repeats it for ever and every
   match is the same five moves (measured: it was). The scatter below is
   derived from the match SEED and the kick-off number, so every phone
   lays the caps out identically, and it is applied to the SLOT — cap 2
   of every seat gets the very same nudge in its own wall's frame — so
   all seats keep congruent formations and nobody is handed an edge. */
const JIT_A = 260, JIT_D = 190;      /* along the wall / in depth        */
function jitter(rs, kick, slot, salt, span){
  const h = hash32([rs | 0, kick | 0, slot | 0, salt]);
  return (h % (2 * span + 1)) - span;
}
function layout(seats, rs, kick){
  const n = capsPerSeat(seats);
  const shape = SHAPE[n];
  const p0 = pitchOf(seats);
  const caps = [];
  const off = [];
  for (let i = 0; i < n; i++)
    off.push([ jitter(rs, kick, i, 0x5A5A, JIT_A), jitter(rs, kick, i, 0xA5A5, JIT_D) ]);
  for (let s = 0; s < seats; s++)
    for (let i = 0; i < n; i++){
      const p = homeSpot(s, shape[i][0] + off[i][0], shape[i][1], off[i][1], p0.W, p0.H);
      caps.push({ s, x: p.x, y: p.y, vx: 0, vy: 0 });
    }
  return caps;
}
/* put every cap and the ball back on its kick-off spot, at rest */
function resetPitch(st){
  st.kick = (st.kick | 0) + 1;
  const caps = layout(st.seats, st.rs, st.kick);
  for (let i = 0; i < st.caps.length; i++){
    st.caps[i].x = caps[i].x; st.caps[i].y = caps[i].y;
    st.caps[i].vx = 0; st.caps[i].vy = 0;
  }
  st.ball.x = trunc(st.W / 2); st.ball.y = trunc(st.H / 2);
  st.ball.vx = 0; st.ball.vy = 0;
}

/* ═══════════════════════════════════════════════════════════════════
   THE STATE
   opts: { seats, humans, lvl, target }
     seats   2..4 (default 2)
     humans  how many seats are people on this device — the UI's book,
             stashed and otherwise unread by the engine
     lvl     the machine's sharpness 1..3
     target  goals to win (default GOAL_TARGET)
   ═══════════════════════════════════════════════════════════════════ */
function newGame(opts, seed){
  opts = opts || {};
  const seats = clampInt(opts.seats || 2, MIN_SEATS, MAX_SEATS);
  const rs = (seed == null ? 0 : (seed >>> 0));
  const p0 = pitchOf(seats);
  const st = {
    v: 1,
    W: p0.W, H: p0.H, seats,
    per: capsPerSeat(seats),
    kick: 0,
    caps: layout(seats, rs, 0),
    ball: { x: trunc(p0.W / 2), y: trunc(p0.H / 2), vx: 0, vy: 0 },
    turn: 0,
    ply: 0,
    score: new Array(seats).fill(0),
    target: clampInt(opts.target || GOAL_TARGET, 1, 9),
    lvl: clampInt(opts.lvl || 2, 1, 3),
    rs,
    lastTouch: -1,
    done: null,          /* { kind:'over', score:[…], winners:[…] }      */
    last: null           /* the last flick + its film, for the screen    */
  };
  return st;
}

/* the caps a seat owns, in its own 0..per-1 order */
function capIndex(st, seat, k){ return seat * st.per + k; }
function capOf(st, seat, k){ return st.caps[capIndex(st, seat, k)]; }
function seatOfCap(st, i){ return st.caps[i].s; }

/* ── goals ─────────────────────────────────────────────────────────── */
function hasGoal(seats, edge){ return edge >= 0 && edge < seats; }
function goalCentre(edge, W, H){
  if (edge === 0) return { x: trunc(W / 2), y: H };
  if (edge === 1) return { x: trunc(W / 2), y: 0 };
  if (edge === 2) return { x: 0, y: trunc(H / 2) };
  return { x: W, y: trunc(H / 2) };
}
/* the ball may only pass a mouth when it is FULLY inside it */
const MOUTH = trunc(GOAL_W / 2) - BALL_R;
function inMouthX(x, W){ const c = trunc(W / 2); return (x - c) <= MOUTH && (c - x) <= MOUTH; }
function inMouthY(y, H){ const c = trunc(H / 2); return (y - c) <= MOUTH && (c - y) <= MOUTH; }

/* ═══════════════════════════════════════════════════════════════════
   THE SIMULATION
   A simulation state is the flat little object cloneSim() makes; the
   match state IS one, plus its bookkeeping. runSettle() advances it
   until everything is at rest or the ball is through a mouth, and is
   the ONLY place physics happens — apply() and the machine's search
   call the identical function, so what the bot rehearses is exactly
   what the table gets.
   ═══════════════════════════════════════════════════════════════════ */
function cloneSim(st){
  const caps = new Array(st.caps.length);
  for (let i = 0; i < st.caps.length; i++){
    const c = st.caps[i];
    caps[i] = { s: c.s, x: c.x, y: c.y, vx: c.vx, vy: c.vy };
  }
  return {
    W: st.W, H: st.H, seats: st.seats, per: st.per, caps,
    ball: { x: st.ball.x, y: st.ball.y, vx: st.ball.vx, vy: st.ball.vy },
    lastTouch: st.lastTouch
  };
}

/* one body's wall pass. Returns the edge it went THROUGH (ball only), or
   -1. Anything that does not go through is reflected and clamped. */
function walls(sim, b, r, isBall){
  const W = sim.W, H = sim.H;
  let through = -1;
  /* LEFT, edge 2 */
  if (b.x < r){
    if (isBall && hasGoal(sim.seats, 2) && inMouthY(b.y, H)){ if (b.x < 0) through = 2; }
    else { b.x = r; if (b.vx < 0) b.vx = -trunc(b.vx * REST_W / 256); }
  }
  /* RIGHT, edge 3 */
  if (b.x > W - r){
    if (isBall && hasGoal(sim.seats, 3) && inMouthY(b.y, H)){ if (b.x > W) through = 3; }
    else { b.x = W - r; if (b.vx > 0) b.vx = -trunc(b.vx * REST_W / 256); }
  }
  /* TOP, edge 1 */
  if (b.y < r){
    if (isBall && hasGoal(sim.seats, 1) && inMouthX(b.x, W)){ if (b.y < 0) through = 1; }
    else { b.y = r; if (b.vy < 0) b.vy = -trunc(b.vy * REST_W / 256); }
  }
  /* BOTTOM, edge 0 */
  if (b.y > H - r){
    if (isBall && hasGoal(sim.seats, 0) && inMouthX(b.x, W)){ if (b.y > H) through = 0; }
    else { b.y = H - r; if (b.vy > 0) b.vy = -trunc(b.vy * REST_W / 256); }
  }
  return through;
}

/* elastic contact between two circles, integer throughout. `a` is the
   body with radius ra and mass ma. Separates the overlap first, then
   exchanges momentum along the contact normal with restitution REST_B.
   Every division truncates toward zero, so a contact can only ever take
   energy out of the table.
   Returns 0 (no overlap), 1 (overlapping but already separating — only
   pushed apart) or 2 (a real STRIKE, momentum changed hands). Only a 2
   counts as "who touched the ball last": a ball merely resting against
   a cap must not steal the credit for the goal from the cap that
   actually hit it. */
function contact(a, ra, ma, b, rb, mb){
  let dx = b.x - a.x, dy = b.y - a.y;
  let d2 = dx * dx + dy * dy;
  const rr = ra + rb;
  if (d2 >= rr * rr) return 0;
  let d = isqrt(d2);
  if (d === 0){ dx = rr; dy = 0; d = rr; d2 = rr * rr; }   /* dead centre */

  /* push apart along the normal, half each — integer, symmetric */
  const ov = rr - d;
  if (ov > 0){
    const px = trunc(ov * dx / (2 * d)), py = trunc(ov * dy / (2 * d));
    a.x -= px; a.y -= py;
    b.x += px; b.y += py;
  }

  /* approach speed along the normal (still un-normalised: /d comes out
     in the divisor below) */
  const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
  const dot = dvx * dx + dvy * dy;
  if (dot <= 0) return 1;                 /* already separating           */

  const den = 256 * d2 * (ma + mb);
  a.vx -= trunc(REST_B1 * dot * mb * dx / den);
  a.vy -= trunc(REST_B1 * dot * mb * dy / den);
  b.vx += trunc(REST_B1 * dot * ma * dx / den);
  b.vy += trunc(REST_B1 * dot * ma * dy / den);
  return 2;
}

function moving(sim){
  const b = sim.ball;
  if (b.vx || b.vy) return true;
  for (let i = 0; i < sim.caps.length; i++){ const c = sim.caps[i]; if (c.vx || c.vy) return true; }
  return false;
}
function fastest(sim){
  let m = Math.abs(sim.ball.vx);
  if (Math.abs(sim.ball.vy) > m) m = Math.abs(sim.ball.vy);
  for (let i = 0; i < sim.caps.length; i++){
    const c = sim.caps[i];
    if (Math.abs(c.vx) > m) m = Math.abs(c.vx);
    if (Math.abs(c.vy) > m) m = Math.abs(c.vy);
  }
  return m;
}
function frameOf(sim){
  const f = new Array(2 + sim.caps.length * 2);
  f[0] = sim.ball.x; f[1] = sim.ball.y;
  for (let i = 0; i < sim.caps.length; i++){ f[2 + i * 2] = sim.caps[i].x; f[3 + i * 2] = sim.caps[i].y; }
  return f;
}

/* run the table to rest. Returns { ticks, frames, goal } where goal is
   { edge, scorer } or null. `frames` is the film for the screen, and is
   only built when asked for (the machine's search never builds one). */
function runSettle(sim, wantFrames){
  const frames = wantFrames ? [frameOf(sim)] : null;
  let goal = null, ticks = 0;

  for (let t = 0; t < MAX_TICKS && moving(sim) && !goal; t++){
    ticks++;
    /* how finely this tick must be stepped so nothing can tunnel */
    const fast = fastest(sim);
    let sub = trunc(fast / MAX_SUBSTEP) + 1;
    if (sub > MAX_SUB) sub = MAX_SUB;

    /* the per-tick velocity is frozen for the whole tick's stepping, so
       the sub-steps of an undisturbed body sum EXACTLY to it */
    const b = sim.ball;
    let bvx = b.vx, bvy = b.vy;
    const cvx = new Array(sim.caps.length), cvy = new Array(sim.caps.length);
    for (let i = 0; i < sim.caps.length; i++){ cvx[i] = sim.caps[i].vx; cvy[i] = sim.caps[i].vy; }

    for (let s = 0; s < sub && !goal; s++){
      const f0 = s, f1 = s + 1;
      b.x += trunc(bvx * f1 / sub) - trunc(bvx * f0 / sub);
      b.y += trunc(bvy * f1 / sub) - trunc(bvy * f0 / sub);
      for (let i = 0; i < sim.caps.length; i++){
        const c = sim.caps[i];
        c.x += trunc(cvx[i] * f1 / sub) - trunc(cvx[i] * f0 / sub);
        c.y += trunc(cvy[i] * f1 / sub) - trunc(cvy[i] * f0 / sub);
      }

      /* walls */
      const through = walls(sim, b, BALL_R, true);
      if (through >= 0){ goal = { edge: through, scorer: -1 }; break; }
      for (let i = 0; i < sim.caps.length; i++) walls(sim, sim.caps[i], CAP_R, false);

      /* contacts — ball against every cap, then cap against cap, always
         in index order so every phone resolves the same chain */
      for (let i = 0; i < sim.caps.length; i++){
        if (contact(b, BALL_R, BALL_M, sim.caps[i], CAP_R, CAP_M) === 2) sim.lastTouch = sim.caps[i].s;
      }
      for (let i = 0; i < sim.caps.length; i++)
        for (let j = i + 1; j < sim.caps.length; j++)
          contact(sim.caps[i], CAP_R, CAP_M, sim.caps[j], CAP_R, CAP_M);

      /* a contact may have changed a velocity: carry the new one into
         the remaining sub-steps of this tick */
      bvx = b.vx; bvy = b.vy;
      for (let i = 0; i < sim.caps.length; i++){ cvx[i] = sim.caps[i].vx; cvy[i] = sim.caps[i].vy; }
    }

    /* friction, once per tick, and the rest threshold */
    b.vx = trunc(b.vx * FRICT / 256); b.vy = trunc(b.vy * FRICT / 256);
    if (b.vx * b.vx + b.vy * b.vy < STOP_V2){ b.vx = 0; b.vy = 0; }
    for (let i = 0; i < sim.caps.length; i++){
      const c = sim.caps[i];
      c.vx = trunc(c.vx * FRICT / 256); c.vy = trunc(c.vy * FRICT / 256);
      if (c.vx * c.vx + c.vy * c.vy < STOP_V2){ c.vx = 0; c.vy = 0; }
    }
    if (frames) frames.push(frameOf(sim));
  }

  /* the hard floor: nothing may still be moving when the turn passes */
  sim.ball.vx = 0; sim.ball.vy = 0;
  for (let i = 0; i < sim.caps.length; i++){ sim.caps[i].vx = 0; sim.caps[i].vy = 0; }
  if (goal) goal.scorer = sim.lastTouch;
  return { ticks, frames, goal };
}

/* ═══════════════════════════════════════════════════════════════════
   THE GATE — every move (thumb, machine, wire, replay) is measured here
   and nowhere else. A flick is legal iff the game is live, it is that
   seat's turn, the cap index names one of that seat's caps, and the
   angle and power are in range.
   ═══════════════════════════════════════════════════════════════════ */
function check(st, mv, seat){
  if (!mv || st.done) return false;
  if (mv.t !== 'flick') return false;
  if (seat !== st.turn) return false;
  const k = mv.k | 0, a = mv.a | 0, p = mv.p | 0;
  if (k < 0 || k >= st.per) return false;
  if (a < 0 || a >= ANG_N) return false;
  if (p < POW_MIN || p > POW_MAX) return false;
  return true;
}

/* the "legal moves" of a flick game are its flickable CAPS — the angle
   and the power are free inside their ranges, so listing them all would
   be 81,920 entries. One entry per cap, documented. */
function legal(st, seat){
  if (st.done || seat !== st.turn) return [];
  const out = [];
  for (let k = 0; k < st.per; k++) out.push({ t:'flick', k });
  return out;
}
function turn(st){ return st.done ? -1 : st.turn; }

/* ═══════════════════════════════════════════════════════════════════
   APPLY — deterministic; the log replays through here. Launches the
   cap, runs the whole settle SYNCHRONOUSLY (so the state is final the
   instant the move is real — js/aqleb-ui.js learned the hard way that a
   move which waits for its animation goes out of step with the wire),
   and hangs the film on st.last for the screen to play back.
   ═══════════════════════════════════════════════════════════════════ */
function apply(st, mv, opts){
  const seat = st.turn;
  const k = mv.k | 0, a = ((mv.a | 0) % ANG_N + ANG_N) % ANG_N, p = clampInt(mv.p, POW_MIN, POW_MAX);
  const wantFrames = !(opts && opts.frames === false);

  const cap = capOf(st, seat, k);
  const sp = speedOf(p);
  cap.vx = trunc(dirX(a) * sp / DIR_U);
  cap.vy = trunc(dirY(a) * sp / DIR_U);
  st.lastTouch = seat;               /* a chain overrides this on contact */

  const res = runSettle(st, wantFrames);
  st.ply++;

  let scored = -1, conceded = -1;
  if (res.goal){
    conceded = res.goal.edge;
    const tch = res.goal.scorer;
    if (tch >= 0 && tch !== conceded) scored = tch;
    else if (st.seats === 2) scored = 1 - conceded;   /* an own goal, 1v1 */
    /* 3–4 seats: an own goal counts for nobody. Documented in the rules
       so nobody has to guess, and it needs no arbitrary tie-break. */
    if (scored >= 0) st.score[scored]++;
    resetPitch(st);
    st.lastTouch = -1;
  }

  st.last = {
    seat, k, a, p,
    ticks: res.ticks,
    frames: res.frames || null,
    goal: res.goal ? { edge: conceded, scorer: scored } : null
  };

  if (scored >= 0 && st.score[scored] >= st.target){
    st.done = { kind:'over', score: st.score.slice(), winners: [scored] };
    return;
  }
  /* the seat that conceded restarts; otherwise the turn simply passes */
  st.turn = conceded >= 0 ? conceded : (seat + 1) % st.seats;
}

/* ── the verdict ───────────────────────────────────────────────────── */
function counts(st){ return st.score.slice(); }
function over(st){
  if (!st.done) return null;
  const winners = st.done.winners.slice();
  return {
    kind: st.done.kind,
    score: st.done.score.slice(),
    counts: st.done.score.slice(),
    winners,
    winner: winners.length === 1 ? winners[0] : -1,
    draw: winners.length > 1
  };
}
function note(st){
  if (st.done) return { en: 'Full time.', mt: 'Ħin kollu.' };
  return { en: 'Drag back off one of your caps and let go.',
           mt: 'Iġbed lura minn tapp tiegħek u itilqu.' };
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — three sharpnesses. think(st, seat, lvl) returns a
   { t:'flick', k, a, p } or null.

   It is a REHEARSAL bot: it builds a small set of candidate flicks,
   plays each one on a clone through the SAME runSettle() the table
   uses, and keeps the best-scoring outcome. Because the simulation is
   deterministic, what it rehearses is exactly what happens — no
   estimation, no drift, and its choice is a pure function of the
   position (plus the match seed, which only breaks a tie).

     lvl 1  IT-TIFEL — takes the cap nearest the ball, aims straight at
            the ball, belts it at full power and does not look past the
            first contact. Two candidate angles, both greedy.
     lvl 2  TAL-KAŻIN — the billiards aim: it lines the shot up through
            the GHOST BALL (the spot the cap must reach so the ball
            leaves towards the mouth), over every cap and a small fan.
     lvl 3  IL-KAMPJUN — the same, wider: more caps, more angles, three
            powers, and an evaluation that also cares where the ball is
            LEFT (near your mouth good, near its own bad).
   ═══════════════════════════════════════════════════════════════════ */

/* which mouth this seat is shooting at: the nearest one that is not its
   own. Deterministic (lowest edge wins a tie). */
function targetEdge(st, seat){
  let best = -1, bestD = Infinity;
  for (let e = 0; e < st.seats; e++){
    if (e === seat) continue;
    const g = goalCentre(e, st.W, st.H);
    const d = dist(st.ball.x, st.ball.y, g.x, g.y);
    if (d < bestD){ bestD = d; best = e; }
  }
  return best;
}

/* the ghost-ball aim point: stand the cap here and the ball leaves along
   cap→ball, which we want to be ball→goal. */
function ghostAim(st, tgt){
  const g = goalCentre(tgt, st.W, st.H);
  const dx = g.x - st.ball.x, dy = g.y - st.ball.y;
  const d = isqrt(dx * dx + dy * dy) || 1;
  const back = CAP_R + BALL_R;
  return { x: st.ball.x - trunc(dx * back / d), y: st.ball.y - trunc(dy * back / d) };
}

/* score the table AFTER a rehearsed flick, from `seat`'s point of view.
   `before` is the snapshot taken before the flick and `tgt` the mouth
   this seat was shooting at — both fixed, so the "did the ball move
   towards it" term compares like with like. */
function evalAfter(sim, seat, before, tgt, res, lvl){
  if (res.goal){
    const conceded = res.goal.edge, tch = res.goal.scorer;
    const mine = (tch >= 0 && tch !== conceded) ? tch : (sim.seats === 2 ? 1 - conceded : -1);
    if (mine === seat) return 1000000 - res.ticks;   /* the quicker the better */
    return -1000000;                                  /* into my own, or nobody's */
  }

  const g = goalCentre(tgt, sim.W, sim.H);
  const own = goalCentre(seat, sim.W, sim.H);
  const dNow = dist(sim.ball.x, sim.ball.y, g.x, g.y);
  let s = (before.dTarget - dNow) * 4;         /* carried it forward       */
  if (sim.ball.x === before.bx && sim.ball.y === before.by) s -= 40000;  /* a whiff */
  if (lvl >= 2) s += trunc(dist(sim.ball.x, sim.ball.y, own.x, own.y) / 2);
  if (lvl >= 3){
    /* keep caps between the ball and your own mouth */
    const dOwnBall = dist(sim.ball.x, sim.ball.y, own.x, own.y);
    let cover = 0;
    for (let i = 0; i < sim.caps.length; i++){
      const c = sim.caps[i];
      if (c.s !== seat) continue;
      if (dist(c.x, c.y, own.x, own.y) < dOwnBall) cover++;
    }
    s += cover * 300;
  }
  return s;
}

function think(st, seat, lvl){
  if (st.done || seat !== st.turn) return null;
  lvl = clampInt(lvl || st.lvl || 2, 1, 3);
  const tgt = targetEdge(st, seat);
  if (tgt < 0) return { t:'flick', k:0, a:0, p:POW_MAX };

  const g = goalCentre(tgt, st.W, st.H);
  const before = {
    bx: st.ball.x, by: st.ball.y,
    dTarget: dist(st.ball.x, st.ball.y, g.x, g.y)
  };
  const ghost = ghostAim(st, tgt);

  /* which of my caps to consider, nearest the ball first */
  const mine = [];
  for (let k = 0; k < st.per; k++){
    const c = capOf(st, seat, k);
    mine.push({ k, d: dist(c.x, c.y, st.ball.x, st.ball.y) });
  }
  mine.sort((a, b) => a.d - b.d || a.k - b.k);

  const capN  = lvl === 1 ? 1 : lvl === 2 ? Math.min(3, st.per) : st.per;
  const fan   = lvl === 1 ? [0] : lvl === 2 ? [0, -3, 3, -7, 7] : [0, -2, 2, -5, 5, -9, 9, -14, 14];
  const pows  = lvl === 1 ? [POW_MAX] : lvl === 2 ? [POW_MAX, 44] : [POW_MAX, 50, 34];

  let best = null, bestVal = -Infinity;
  const ties = [];
  for (let mi = 0; mi < capN; mi++){
    const k = mine[mi].k;
    const c = capOf(st, seat, k);
    /* the two lines worth trying from this cap: straight at the ball,
       and through the ghost-ball spot (the billiards aim) */
    const bases = [ angleOf(st.ball.x - c.x, st.ball.y - c.y) ];
    if (lvl >= 2) bases.push(angleOf(ghost.x - c.x, ghost.y - c.y));
    for (let bi = 0; bi < bases.length; bi++)
      for (let fi = 0; fi < fan.length; fi++)
        for (let pi = 0; pi < pows.length; pi++){
          const a = ((bases[bi] + fan[fi]) % ANG_N + ANG_N) % ANG_N;
          const p = pows[pi];
          const sim = cloneSim(st);
          const cc = sim.caps[capIndex(st, seat, k)];
          const sp = speedOf(p);
          cc.vx = trunc(dirX(a) * sp / DIR_U);
          cc.vy = trunc(dirY(a) * sp / DIR_U);
          sim.lastTouch = seat;
          const res = runSettle(sim, false);
          const val = evalAfter(sim, seat, before, tgt, res, lvl);
          if (val > bestVal){ bestVal = val; best = { t:'flick', k, a, p }; ties.length = 0; ties.push(best); }
          else if (val === bestVal) ties.push({ t:'flick', k, a, p });
        }
  }
  if (!best) return { t:'flick', k:0, a: angleOf(st.ball.x - capOf(st, seat, 0).x,
                                                 st.ball.y - capOf(st, seat, 0).y), p: POW_MAX };
  if (ties.length > 1){
    /* a deterministic hash of the position + seed picks among equals —
       identical on every phone with the same seed */
    const key = [st.rs, st.ply, seat, lvl, st.ball.x, st.ball.y];
    for (let i = 0; i < st.caps.length; i++){ key.push(st.caps[i].x); key.push(st.caps[i].y); }
    const h = hash32(key);
    return ties[h % ties.length];
  }
  return best;
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — a flick as flat fields, for js/mp.js's generic codec.
   A move is three small integers: k (which of my caps, 0..4), a (the
   angle, 0..255) and p (the power notch, 1..64) — three bytes, once a
   turn. Every phone runs the identical simulation from them, which is
   the whole reason this game is honest online.

   THE FIELD LIST IS APPEND-ONLY. Never insert into it, never rename an
   entry: an older build that meets an undeclared field stops the whole
   table dead ("this build does not know how to put undefined on the
   wire"). If IT-TAPP ever needs another number, PUSH it on the end.
   ═══════════════════════════════════════════════════════════════════ */
const WIRE_FIELDS = ['k', 'a', 'p'];
function encWire(mv){
  if (!mv || mv.t !== 'flick') return null;
  const k = mv.k | 0, a = mv.a | 0, p = mv.p | 0;
  if (k < 0 || k > 7) return null;
  if (a < 0 || a >= ANG_N) return null;
  if (p < POW_MIN || p > POW_MAX) return null;
  return { t:'flick', k, a, p };
}
function decWire(w){
  if (!w || w.t !== 'flick') return null;
  const k = w.k | 0, a = w.a | 0, p = w.p | 0;
  if (k < 0 || k > 7) return null;
  if (a < 0 || a >= ANG_N) return null;
  if (p < POW_MIN || p > POW_MAX) return null;
  return { t:'flick', k, a, p };
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — js/tapp-ui.js and the test harness both read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_TAPP = root.KARTI_TAPP || {};
root.KARTI_TAPP.engine = {
  PITCH_2, PITCH_N, pitchOf, CAP_R, BALL_R, GOAL_W, MOUTH, CAP_M, BALL_M,
  MIN_SEATS, MAX_SEATS, GOAL_TARGET, LEVELS,
  ANG_N, POW_MIN, POW_MAX, DIR_U, MAX_TICKS,
  newSeed, hash32, isqrt, dist, dirX, dirY, angleOf, speedOf,
  capsPerSeat, capIndex, capOf, seatOfCap, layout, homeSpot, resetPitch,
  goalCentre, hasGoal, inMouthX, inMouthY, targetEdge, ghostAim,
  newGame, legal, turn, check, apply, counts, over, note, think,
  levelOf, cloneSim, runSettle,
  encWire, decWire, WIRE_FIELDS
};

})(typeof window !== 'undefined' ? window : globalThis);
