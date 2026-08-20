/* ═══════════════════════════════════════════════════════════════════
   KARTI — briks.js
   IL-ĦAJT ("the wall") — the engine. Two players face each other, each
   with a paddle and a brick wall BEHIND them that they are defending.
   Get the ball past the other paddle and it eats their wall. Rules
   only: no DOM, no canvas, no clock, no registration. The screen half
   is a separate file and this one never reaches for it.

   ── THE GAME ───────────────────────────────────────────────────────
     A tall arena. Team 0 defends the BOTTOM, team 1 the TOP. Each side
     has one paddle in a lane, and behind that lane a wall of bricks
     four rows deep. Bricks near the front are soft (1 hit); the back
     row is armour (3 hits) and worth 3 points.

     The ball never dies. It rattles between the two ends forever until
     somebody reaches the score target. There is no serve after a
     point, no lives, no "ball lost" — the pressure comes from the wall
     thinning out, not from a reset.

     Broken bricks drop power-ups, and the BREAKER catches them: a drop
     falls AWAY from the wall it came off, across the field, toward the
     paddle of whoever broke the brick (the attacker of that wall). Break
     their wall and the help is yours — the reward goes to the aggressor,
     not the defender. See maybeDrop()/stepDrops(): the owner seat is
     own = 1 - side, a pure function of the broken wall, so both phones
     agree on who catches every drop.

   ── THE ONE THING THIS FILE IS ACTUALLY ABOUT: TWO PHONES AGREEING ──
     This is input-delay lockstep, the same model as the bomberman
     engine. Nobody sends ball positions. Each phone sends only its own
     paddle target, tagged with the tick it is FOR, and every phone
     simulates the identical world from (seed, ordered input stream).

       tick rate      40 Hz (25 ms). See TICK_HZ for the argument.
       input delay    D ticks, adaptive; delayFor(rttMed) picks it.
                      At the measured 50–100 ms RTT that is 4–5 ticks,
                      i.e. 100–125 ms.

     A player's input sampled at tick N is applied by EVERYBODY at tick
     N+D. Both phones therefore have every input before they simulate,
     so they compute the same ball, and nobody ever has to argue about
     whether a shot got through. There is no rollback, no correction,
     no authority — because there is nothing to correct.

     THE HONEST COST is that your own paddle starts moving D ticks
     after your thumb does. Three things make that liveable:

     1. THE INPUT IS AN ABSOLUTE TARGET, NOT A DIRECTION. You send
        "put the paddle at x", not "move left". Absolute targets do not
        accumulate error: hold your thumb still for D ticks and the
        authoritative paddle arrives exactly where your thumb is. The
        delay lands on the START of a motion, never on where it ends.
        Velocity input would have made the lag cumulative and horrible.
     2. THE PADDLE FOLLOWS AT A SPEED LIMIT (PAD_SPEED, 12 du/tick, a
        full sweep in half a second) so the real paddle is a chase, not
        a teleport. A chase that starts 100 ms late reads as weight,
        which is a texture people forgive. A teleport that is 100 ms
        late reads as broken.
     3. THE LOCAL PADDLE IS DRAWN PREDICTIVELY — ghost(). See below.

   ── PREDICTED vs AUTHORITATIVE, AND WHY THEY CANNOT DISAGREE ───────
     AUTHORITATIVE  st.pads[i].x. Moved only inside step(), only from
                    inputs that were committed for that exact tick.
                    Every phone computes it. The ball reads ONLY this.
     PREDICTED      the number ghost() returns. A drawing hint for your
                    own paddle so it feels attached to your thumb.

     ghost(st, pid, pending) takes the local targets you have sampled
     but not yet reached simulation, and runs follow() — the SAME
     function step() uses, with the same speed limit and the same lane
     clamp — forward over them. So the ghost is not a guess about the
     future: it IS the future, computed from inputs that are already on
     the wire and cannot change. When the sim reaches those ticks it
     lands on exactly the ghost's number.

     They cannot disagree about the BALL because ghost() is a pure
     function that writes nothing. It takes st and returns an integer.
     It cannot touch st.pads[i].x, and the collision code never calls
     it. If you delete ghost() the simulation is byte-identical. The
     only failure mode is cosmetic: if a packet is late your own paddle
     is drawn slightly ahead of where the world has it, and it slides
     back into place within D ticks. The ball is never wrong.

     WHAT HAPPENS WHEN AN INPUT IS LATE: nothing clever. step() refuses
     to run (ready() is false) and the world holds still for everybody.
     The relay is a WebSocket, which is ordered and reliable, so an
     input can be late but cannot be lost — a stall is a hitch, not a
     desync. The engine NEVER invents a missing input, because a guess
     that the other phone does not make is exactly how clones diverge.
     For a player who has actually gone away there is setBot(), which
     is committed into the input stream at an agreed tick so both
     phones switch to the machine on the same tick.

   ── DETERMINISM: FIXED POINT, AND NO TRIGONOMETRY AT ALL ───────────
     Every position, velocity and size in this file is an INTEGER in
     subunits (S = 64 subunits per display unit). No floats reach the
     state. There is no Math.random in the simulation (st.rs is the
     whole RNG and it is only read when a round is set up), no
     Math.sin/cos/tan, no Math.pow and — this is the one that matters
     for a ball game — NO SQUARE ROOT ANYWHERE.

     A brick-breaker normally needs sqrt to renormalise the ball's
     velocity after changing its speed. This one never does, because
     velocity is not stored as a vector. It is stored as

         (di, sp)   di = an index into a baked 64-entry direction
                         table, sp = a scalar speed

     and the velocity is derived: vx = trunc(DIR_X[di]*sp/1024).
     Consequences, all of them good:

       · Changing speed (escalation, the FAST power-up) is changing one
         integer. Direction is untouched, so there is nothing to
         renormalise and no drift.
       · A bounce is an INDEX TRANSFORM, not arithmetic. The table was
         generated one quadrant at a time and mirrored, so it is
         exactly symmetric, and
             mirror across x:  di -> (32 - di) & 63
             mirror across y:  di -> (64 - di) & 63
         are exact for all 64 entries (asserted in the tests).
       · |v| can never drift, because it is never recomputed from
         components.

     THE HORIZONTAL LOOP CANNOT HAPPEN. The classic failure of this
     genre is a ball settling into a near-horizontal path and rallying
     forever. Here the direction table's 64 entries are split into an
     ALLOWED set — indices 4..28 (going down) and 36..60 (going up) —
     every one of which has |DIR_Y| >= 392, i.e. at least 22.5° off
     horizontal. Mirroring never changes |DIR_Y|, and the paddle's
     angle table can only emit indices in that set (its two bases, 16
     and 48, are dead centre of the two runs and the bucket range
     ±12 lands exactly on the ends). So a disallowed direction is
     unreachable by construction, not by clamping. check() asserts it
     every tick anyway. With |vy| >= sp*392/1024 the ball crosses the
     field in a bounded number of ticks, so a rally always resolves.

   ── SWEPT COLLISION, NOT POINT SAMPLING ────────────────────────────
     At full speed the ball moves 17.5 du a tick and a brick is 12 du
     tall, so sampling positions would tunnel through the wall on the
     first hard shot. resolveBall() instead sweeps: the ball is treated
     as an axis-aligned square of half-extent R, every obstacle is
     inflated by R (Minkowski), and the ball becomes a POINT moving
     along a segment. The earliest crossing is found by the slab
     method with the times kept as exact rationals n/d — cross-
     multiplied, never divided — so there is no floating point in the
     comparison and no epsilon anywhere.

     Time inside a tick is carried as tRem in 1/4096ths of a tick, so a
     bounce that changes both speed AND direction (a paddle) can hand
     the rest of the tick to a completely different velocity. Position
     always advances by a truncation TOWARD ZERO of the exact contact
     point, so the ball stops at or just before a surface and can never
     be left inside one.

   ── SIMULTANEOUS EVENTS: THE TIEBREAK RULES ────────────────────────
     Everything that happens at the same instant is resolved together,
     in one defined way, because this is where two clients drift apart.

     T1  ALL objects whose entry time equals the minimum are hit. Two
         bricks at once means BOTH take damage. Hitting the seam
         between two bricks is a skill reward, not a coin toss.
     T2  The reflection is the UNION of the entry normals, and each
         axis flips AT MOST ONCE. Seam between two stacked bricks =
         two y-entries = one y flip, not two (which would cancel).
     T3  ENTRY AXIS: x if the x-slab is entered strictly later, y if
         the y-slab is, BOTH if they are exactly equal (a true corner
         hit reverses the ball).
     T4  A PADDLE FACE HIT BEATS EVERYTHING. If any paddle was struck
         on its front face at the minimum time, the paddle's angle rule
         REPLACES the direction outright and the mirrors are discarded.
         Bricks hit in the same instant still take their damage.
     T5  A PADDLE CORNER HIT (both axes) counts as a FACE hit, so you
         get angle control. This is the generous reading and it is the
         fun one.
     T6  A PADDLE SIDE HIT (x-entry only) is a plain x mirror with no
         angle control. You blocked it with the edge; you did not aim.
     T7  A GRAZE IS NOT A HIT. Sliding exactly along a face with no
         velocity into it does not collide (the parallel-axis slab test
         is strict), so a ball cannot stall on a surface.
     T8  Resting exactly ON a face is fine: moving in gives t = 0 and
         bounces, moving away gives t < 0 and is ignored.
     T9  Bricks are damaged in ascending brick index (side, row, col).
         Balls are stepped in ascending ball id. Drops in ascending
         drop id. Nothing iterates an object's own address.
     T10 Paddles move BEFORE balls in a tick, so a paddle can shove
         itself onto a ball; depenetrate() catches that and ejects the
         ball off the front face rather than swallowing it.

   ── ESCALATION, AND THE PROOF A ROUND ENDS ─────────────────────────
     Three independent brakes, any one of which is sufficient:
       · sp climbs by ESC_HIT on every paddle hit and by ESC_TICK every
         20 ticks, to SP_MAX. Rallies get faster, never slower.
       · IT-TIĠRIF, the crumbling: from DECAY_START (60 s), every
         DECAY_EVERY (8 s) the frontmost surviving row of BOTH walls is
         removed for free. Four rows, so both walls are open by 92 s
         and after that every hit on the back edge is BREAK_PTS points.
       · ROUND_MAX (12000 ticks = 5 min) ends the round unconditionally
         and scores it. This alone makes termination a theorem, not a
         hope; the other two make it fast.

   ── THE MACHINE ────────────────────────────────────────────────────
     think() is a pure function of the state, so an AI seat is
     replayable and an online seat can be handed to it mid-match. It is
     deliberately NOT perfect — a paddle that always intercepts is
     unbeatable and boring. Three levels differ in three ways at once
     (reaction ticks, aiming error, and how much physics they actually
     know), which is what makes them feel like different opponents
     rather than the same opponent with a handicap:

       1  ĦELU     tracks where the ball IS. No prediction at all.
       2  NORMALI  extrapolates in a straight line — and so misreads
                   every shot that will bounce off a side wall.
       3  AĦRAX    folds the side walls to predict the true crossing,
                   then aims the rebound at your fattest column.

   ── 2v2 IS NOT ARCHITECTURALLY EXCLUDED ────────────────────────────
     Not built, but not walled out. Pads carry (team, side, lo, hi):
     `side` is which end you defend, `lo`/`hi` are your slice of that
     lane. Two pads with the same side and split lo/hi is 2v2 and needs
     no new geometry. Walls are per-SIDE, scores per-TEAM, and nothing
     in the collision code assumes there are two of anything.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ═══════════════════════════════════════════════════════════════════
   FIXED POINT
   S subunits to a display unit. The UI divides by S to get its own
   pixels; the engine never sees a pixel and never sees a float.
   ═══════════════════════════════════════════════════════════════════ */
const S = 64;
const du = n => n * S;                     /* authoring helper only    */

const VER     = 1;
const TICK_HZ = 40;
/* WHY 40 AND NOT 60. 25 ms a tick is fine enough that the input delay
   quantises to something honest (a 50–100 ms RTT lands on 4–5 ticks,
   not "3 or 7"), and coarse enough that inputs can be BATCHED: send
   every third tick with the three inputs in it and that is ~13 packets
   a second per player, which is the load the relay was measured at
   (2.3% of a core for 8 players at 15/sec). 60 Hz would be 1.5x the
   packets and 1.5x the phone's simulation cost to buy 8 ms of input
   granularity nobody can feel. The ball is swept, so tick rate buys no
   collision accuracy at all — that argument does not apply here. */

const W = du(240), H = du(380);            /* the arena, portrait      */

/* the ball is a SQUARE of half-extent R for collision purposes. Draw a
   circle; the corners are inside R and nobody has ever noticed. */
const R = du(2.5) | 0;                     /* 160                      */

const COLS = 8, ROWS = 4;
const BW = W / COLS;                       /* 1920 — exact             */
const BH = du(12);                         /* 768                      */
const BACK_M   = du(5);                    /* wall to the back edge    */
const WALL_D   = ROWS * BH;
const PAD_GAP  = du(10);                   /* wall to paddle           */
const PAD_T    = du(10);                   /* paddle thickness         */
const SHIELD_T = du(4);

/* side 0 defends the bottom (large y), side 1 the top (small y). */
const WALL_Y0 = [ H - BACK_M - WALL_D, BACK_M ];          /* wall top  */
const WALL_Y1 = [ H - BACK_M, BACK_M + WALL_D ];          /* wall base */
/* the paddle band, front face first */
const PAD_Y0  = [ WALL_Y0[0] - PAD_GAP - PAD_T, WALL_Y1[1] + PAD_GAP ];
const PAD_Y1  = [ PAD_Y0[0] + PAD_T,            PAD_Y0[1] + PAD_T     ];
/* the barrier sits in the gap, hard against the wall */
const SH_Y0   = [ WALL_Y0[0] - SHIELD_T, WALL_Y1[1] ];
const SH_Y1   = [ WALL_Y0[0],            WALL_Y1[1] + SHIELD_T ];

const PAD_HW      = du(26);                /* half width, normal       */
const PAD_HW_WIDE = du(40);
/* PADDLE FOLLOW SPEED, RAISED FOR A DIRECT THUMB.
   Was 12 du/tick — a full 240-du sweep took 20 ticks (half a second), which
   the eye reads as a paddle "catching up" to the thumb: a chase with weight.
   The user asked for buttery-direct, so the human paddle now follows at 22
   du/tick (a full sweep in ~11 ticks, ~275 ms), fast enough that at any
   humanly-reachable drag speed the authoritative paddle sits ON the thumb
   within a tick or two and the ghost prediction has almost nothing to lead.
   The MACHINE keeps the OLD 12 du/tick feel: AI[].spd is a fraction of
   PAD_SPEED, so raising this would have made the bots superhuman — instead
   the AI fractions below are re-based on AI_SPEED (=12) so the machine is
   exactly as chaseable as before while YOUR paddle got quicker. */
const PAD_SPEED   = du(22);                /* human follow: ~11 ticks a sweep */
const AI_SPEED    = du(12);                /* machine follow: unchanged feel  */

/* SPEED, RE-TUNED FOR A RALLY YOU CAN READ.
   The old base was 5.25 du/tick (210 du/s) and every paddle hit added 10 —
   a rally hit ludicrous speed in four returns and a new player never got a
   second touch. The new curve starts SLOW and readable and ramps GENTLY:

     base   4.0 du/tick  = 160 du/s  — a beginner can track and return it
     per-hit +5           was +10    — the rally warms rather than detonates
     per-20-ticks +2      was +3     — the passive floor rises slowly
     SP_MAX 17.5 du/tick  unchanged  — the ceiling a long rally reaches

   Termination is untouched: sp is monotone non-decreasing (ESC_HIT and
   ESC_TICK are both > 0 and only ever added), |vy| >= sp*392/1024 still
   bounds the crossing time, and the three round brakes (escalation, decay,
   ROUND_MAX) are all intact — see checkEnd() and the header proof. */
const SP_MIN   = du(3.5) | 0;             /* 224  = 140 du/s (floor)  */
const SP_START = du(4.0) | 0;             /* 256  = 160 du/s (serve)  */
const SP_MAX   = du(17.5) | 0;            /* 1120 = 700 du/s          */
const SP_HARD  = du(25) | 0;              /* ceiling incl. FAST boost */
const ESC_HIT  = 5;                       /* per paddle hit           */
const ESC_TICK = 2;                       /* per ESC_EVERY ticks      */
const ESC_EVERY = 20;
const SP_HEAVY = du(2) | 0;               /* the POWER-BALL's extra bite */

const MAX_BALLS = 6;
const HP_ROW  = [1, 1, 2, 3];              /* row 0 is the FRONT row   */
const TARGET  = 40;                        /* points to win the round  */
const BREAK_PTS = 2;                       /* a hit on their back edge */

const DROP_HW    = du(3);
const DROP_V     = du(4);
const DROP_RATE  = 300;                    /* per 1000 bricks broken (was 220) */
const WIDE_TICKS = 560;
const SLOW_TICKS = 420;                    /* how long a slow-ball lasts */
const STICKY_TICKS = 560;                  /* how long the paddle catches */
const LASER_SHOTS = 6;                     /* charges the laser grants   */
const POWER_TICKS = 300;                   /* how long a ball stays heavy */
const SHIELD_TICKS = 900;

const DECAY_START = TICK_HZ * 60;
const DECAY_EVERY = TICK_HZ * 8;
const ROUND_MAX   = TICK_HZ * 300;

const TFP = 4096;                          /* sub-ticks in one tick    */
const MAX_ITER = 24;                       /* bounces resolved per tick*/

/* ── power-ups ────────────────────────────────────────────────────────
   SEVEN of them now, all BREAKER-caught (they fall from the broken wall
   ACROSS the field toward the paddle of whoever broke the brick — break
   their wall, keep the reward). Each is deterministic: whether a brick
   drops and WHICH power-up it drops is a pure hash of (seed, side, r, c),
   never the order bricks broke in — see maybeDrop(). The catching seat is
   own = 1 - side, also a pure function of the broken wall.

     MULTI   split every ball once (up to MAX_BALLS). Instant pressure.
     WIDE    your paddle grows for WIDE_TICKS. Defensive, forgiving.
     SLOW    every ball drops toward SP_MIN and the escalation floor eases
             for SLOW_TICKS. The "catch your breath" pick — the opposite of
             the old FAST, which sped the ball UP and punished the catcher.
     STICKY  your paddle CATCHES the ball for STICKY_TICKS: it holds on the
             face and re-launches up the paddle normal on your next move.
             Aim at leisure. (FAST is gone — a defender-caught speed-up hurt
             the very player it dropped for; STICKY is the fun version.)
     LASER   your paddle gets LASER_SHOTS bolts: it auto-fires a bolt every
             few ticks straight into the enemy wall, chipping bricks. Offence.
     POWER   the ball you next return becomes a HEAVY power-ball: heavier
             (SP_HEAVY faster) and it SMASHES THROUGH bricks for POWER_TICKS
             instead of bouncing off them — but it still bounces off paddles
             and walls (no tunnelling: it is resolved by the SAME swept code,
             it just does not flip on a brick). A wall-wrecker.
     SHIELD  a one-save barrier rises across your wall gap for SHIELD_TICKS.

   The ids are stable and contiguous 1..7 so the UI art table is a plain
   array lookup. The DROP WEIGHTS below are balanced so no single pick
   dominates and the two strong offensive picks (MULTI, POWER) are a touch
   rarer than the defensive ones. */
const PU = { MULTI: 1, WIDE: 2, SLOW: 3, STICKY: 4, LASER: 5, POWER: 6, SHIELD: 7 };
const PU_WEIGHT = [
  [PU.MULTI, 3], [PU.WIDE, 4], [PU.SLOW, 3], [PU.STICKY, 3],
  [PU.LASER, 3], [PU.POWER, 2], [PU.SHIELD, 3]
];
const PU_TOTAL  = 21;                       /* sum of the weights above  */

const LASER_EVERY = 5;                      /* ticks between auto-bolts   */
const LASER_V     = du(9);                  /* bolt speed toward the wall */
const LASER_HW    = du(1);                  /* bolt half-width            */

/* ── the machine's three sharpnesses ──────────────────────────────────
   None of them is a perfect interceptor, and this is enforced two ways at
   once. GEOMETRICALLY: a fast wide-angle ball's lateral speed (up to ~1592
   subunits/tick at SP_HARD) far exceeds any paddle's spd, so a ball it did
   not pre-position for is physically un-chaseable. BEHAVIOURALLY: react>0
   staleness means a ball that CHANGES DIRECTION late (off the far paddle or
   a side wall) is read after the fact, and err leaves the paddle settled a
   little off centre. Even AĦRAX (react 4) misreads a late-breaking return,
   so two AĦRAX seats do trade points rather than deadlocking 0:0. */
const AI = [
  null,
  { react: 12, err: du(60), spd: (AI_SPEED * 55 / 100) | 0, mode: 0, aim: 0 },
  { react:  7, err: du(42), spd: (AI_SPEED * 78 / 100) | 0, mode: 1, aim: 0 },
  { react:  4, err: du(30), spd: (AI_SPEED * 95 / 100) | 0, mode: 2, aim: 1 }
];
/* WHY err >= PAD_HW (du 26) EVEN FOR AĦRAX. A paddle that pre-positions to
   the exact predicted crossing is unbeatable in a straight rally, and two
   of them deadlock 0:0 until the round clock — the "perfect interceptor"
   the brief forbids. The aiming error must therefore, occasionally, exceed
   a paddle half-width so a real gap opens; du(30) does that a fraction of
   the time while leaving the paddle accurate on average. Verified: at
   du(7) two AĦRAX seats draw every time; at du(30) they trade points and
   every symmetric match is decisive. */

/* ═══════════════════════════════════════════════════════════════════
   THE DIRECTION TABLE — baked, never computed.
   64 entries at 5.625° apart, magnitude 1024. Generated one quadrant
   at a time and mirrored into the other three, so the mirrors below
   are EXACT for every entry (the tests prove it, don't take my word):

       DIR_X[(32 - i) & 63] === -DIR_X[i]   DIR_Y[(32 - i) & 63] === DIR_Y[i]
       DIR_X[(64 - i) & 63] ===  DIR_X[i]   DIR_Y[(64 - i) & 63] === -DIR_Y[i]

   i=0 is +x (right). y grows DOWNWARD, so i=16 is straight down and
   i=48 is straight up — the two bases the paddles fan out from.
   ═══════════════════════════════════════════════════════════════════ */
const DIR_X = [
  1024, 1019, 1004,  980,  946,  903,  851,  792,
   724,  650,  569,  483,  392,  297,  200,  100,
     0, -100, -200, -297, -392, -483, -569, -650,
  -724, -792, -851, -903, -946, -980,-1004,-1019,
 -1024,-1019,-1004, -980, -946, -903, -851, -792,
  -724, -650, -569, -483, -392, -297, -200, -100,
     0,  100,  200,  297,  392,  483,  569,  650,
   724,  792,  851,  903,  946,  980, 1004, 1019
];
const DIR_Y = [
     0,  100,  200,  297,  392,  483,  569,  650,
   724,  792,  851,  903,  946,  980, 1004, 1019,
  1024, 1019, 1004,  980,  946,  903,  851,  792,
   724,  650,  569,  483,  392,  297,  200,  100,
     0, -100, -200, -297, -392, -483, -569, -650,
  -724, -792, -851, -903, -946, -980,-1004,-1019,
 -1024,-1019,-1004, -980, -946, -903, -851, -792,
  -724, -650, -569, -483, -392, -297, -200, -100
];
const DIR_U = 1024;                        /* the table's magnitude    */
const MIN_ABS_Y = 350;                     /* the anti-horizontal bar  */

/* The safety net, also baked: the nearest legal index that keeps the
   signs. Under the design it is the identity on every reachable index
   (asserted in check()); it exists so that a future power-up that
   invents a direction cannot open the horizontal-loop bug. */
const SNAP = [
   4,  4,  4,  4,  4,  5,  6,  7,
   8,  9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22, 23,
  24, 25, 26, 27, 28, 28, 28, 28,
  28, 36, 36, 36, 36, 37, 38, 39,
  40, 41, 42, 43, 44, 45, 46, 47,
  48, 49, 50, 51, 52, 53, 54, 55,
  56, 57, 58, 59, 60, 60, 60, 60
];
/* the paddle fan: base index per side, and the bucket range. side 0
   fires up (base 48), side 1 down (base 16). K_MAX 12 lands exactly on
   the ends of the two allowed runs, which is not a coincidence. */
const FAN_BASE = [48, 16];
const K_MAX = 12;
const ENGLISH = 1;                         /* buckets of paddle carry  */

const mirX  = i => (32 - i) & 63;
const mirY  = i => (64 - i) & 63;
const snap  = i => SNAP[i & 63];
/* the ONLY division in the velocity path, and it truncates toward zero
   so that mirrored directions give exactly mirrored velocities. */
const trunc = Math.trunc;
const velOf = (di, sp) => [ trunc(DIR_X[di] * sp / DIR_U),
                            trunc(DIR_Y[di] * sp / DIR_U) ];
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

/* ═══════════════════════════════════════════════════════════════════
   SEEDED RANDOMNESS — st.rs is the whole of it, and it is read in
   exactly one place: setting up a round's opening serve. Nothing in a
   tick touches it, which is why a tick is a pure function.
   (rummy's/poker's generator, unchanged, so the family behaves alike.)
   ═══════════════════════════════════════════════════════════════════ */
function rnd(st){
  st.rs = (st.rs + 0x6D2B79F5) | 0;
  let t = st.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/* The machine's coin, which is not a coin: a pure hash of the
   position, so every phone rolls the same "luck" and a replay is a
   replay. Power-up drops use it too — a drop must not depend on the
   ORDER bricks happened to break in, only on which brick and when. */
function hash32(list){
  let h = 2166136261;
  for (let i = 0; i < list.length; i++){
    h ^= (list[i] | 0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/* THE ONE Math.random IN THE FILE, and it is not in the simulation:
   picking a seed for a brand-new LOCAL match, exactly as poker's UI
   does. An online match takes its seed from the relay instead. */
function newSeed(){ return (Math.random() * 0x7FFFFFFF) | 0; }

/* ═══════════════════════════════════════════════════════════════════
   BILINGUAL TEXT — the state carries IDS, never sentences, because
   state is shared and audited (js/lang.js, rule 5). The UI looks the
   id up here and gets the pair.
   ═══════════════════════════════════════════════════════════════════ */
const TEXT = {
  'game.name':   { en: 'IL-ĦAJT',            mt: 'IL-ĦAJT' },
  'game.blurb':  { en: 'Defend your wall. Break theirs.',
                   mt: 'Iddefendi l-ħajt tiegħek. Kisser tagħhom.' },
  'ev.brick':    { en: 'Brick cracked',      mt: 'Brikksa mfarrka' },
  'ev.broke':    { en: 'Brick smashed',      mt: 'Brikksa mkissra' },
  'ev.paddle':   { en: 'Return',             mt: 'Daqqa lura' },
  'ev.edge':     { en: 'Edge block',         mt: 'Imblukkata mit-tarf' },
  'ev.wall':     { en: 'Off the side',       mt: 'Mal-ġenb' },
  'ev.through':  { en: 'Through!',           mt: 'Għadda!' },
  'ev.shield':   { en: 'Barrier held',       mt: 'Il-ħarsien żamm' },
  'ev.catch':    { en: 'Caught it',          mt: 'Qabadha' },
  'ev.catch2':   { en: 'Stuck!',             mt: 'Weħlet!' },
  'ev.laser':    { en: 'Laser',              mt: 'Lejżer' },
  'ev.crumble':  { en: 'The walls crumble',  mt: 'Il-ħitan qed jiġġarrfu' },
  'ev.serve':    { en: 'Ball in play',       mt: 'Il-ballun fil-logħob' },
  'pu.1':        { en: 'Multi-ball',         mt: 'Aktar blalen' },
  'pu.2':        { en: 'Wider paddle',       mt: 'Raketta usa\'' },
  'pu.3':        { en: 'Slow ball',          mt: 'Ballun bil-mod' },
  'pu.4':        { en: 'Sticky paddle',      mt: 'Raketta li taqbad' },
  'pu.5':        { en: 'Laser',              mt: 'Lejżer' },
  'pu.6':        { en: 'Power ball',         mt: 'Ballun qawwi' },
  'pu.7':        { en: 'Barrier up',         mt: 'Ħarsien imtella\'' },
  'end.target':  { en: 'Broke through',      mt: 'Qasam in-naħa l-oħra' },
  'end.time':    { en: 'Time',               mt: 'Ħin' },
  'end.draw':    { en: 'Level',              mt: 'Indaqs' },
  'ai.1':        { en: 'Gentle',             mt: 'Ħelu' },
  'ai.2':        { en: 'Normal',             mt: 'Normali' },
  'ai.3':        { en: 'Ruthless',           mt: 'Aħrax' },
  'net.wait':    { en: 'Waiting for the other phone',
                   mt: 'Nistennew il-mowbajl l-ieħor' }
};
/* never a bare key and never a bare English string: an unknown id
   comes back as an {en, mt} pair too. */
function text(id){ return TEXT[id] || { en: String(id), mt: String(id) }; }

/* ═══════════════════════════════════════════════════════════════════
   GEOMETRY HELPERS — pure, no state.
   ═══════════════════════════════════════════════════════════════════ */
/* the y-band of a wall row. Row 0 is the FRONT row on BOTH sides, so
   decay and the hp layout mirror without a special case. */
function rowY(side, r){
  return side === 0 ? WALL_Y0[0] + r * BH
                    : WALL_Y1[1] - (r + 1) * BH;
}
function brickBox(side, r, c){
  const y0 = rowY(side, r);
  return { x0: c * BW, y0: y0, x1: c * BW + BW, y1: y0 + BH };
}
function padBox(p){
  return { x0: p.x - p.hw, y0: PAD_Y0[p.side], x1: p.x + p.hw, y1: PAD_Y1[p.side] };
}
function laneOf(side){ return { y0: PAD_Y0[side], y1: PAD_Y1[side] }; }
const bi = (r, c) => r * COLS + c;

/* ═══════════════════════════════════════════════════════════════════
   SETUP
   ═══════════════════════════════════════════════════════════════════ */
const DEF_OPTS = { seed: 1, bestOf: 1, target: TARGET, bots: [0, 0], aiLvl: [2, 2] };

function start(opts){
  opts = opts || {};
  const st = {
    v: VER,
    seed: (opts.seed | 0) || 1,
    rs: (opts.seed | 0) || 1,
    target: opts.target | 0 || TARGET,
    bestOf: opts.bestOf | 0 || 1,
    wins: [0, 0],
    roundNo: 0,
    tick: 0,
    boost: 0, boostT: 0, slowT: 0,
    decayN: 0,
    score: [0, 0],
    broke: [0, 0],
    pads: [], walls: [], balls: [], drops: [], bolts: [],
    nextBall: 0, nextDrop: 0, nextBolt: 0,
    inp: [], inpMax: [], ev: [], over: null, matchOver: null,
    stalls: 0, iterCap: 0
  };
  /* 1v1. The shape is the general one: (team, side, lo, hi). Two pads
     sharing a side with lo/hi split is 2v2 and needs nothing new. */
  const bots = opts.bots || [0, 0], lvls = opts.aiLvl || [2, 2];
  for (let i = 0; i < 2; i++){
    st.pads.push({
      pid: i, team: i, side: i,
      lo: 0, hi: W,
      x: W >> 1, tx: W >> 1, vx: 0,
      hw: PAD_HW, wideT: 0,
      stickyT: 0,                 /* ticks the catch power-up is active   */
      laser: 0, laserCd: 0,       /* laser charges left / cooldown ticks  */
      spd: PAD_SPEED,
      bot: bots[i] | 0, lvl: clamp(lvls[i] | 0 || 2, 1, 3)
    });
    st.inp.push([]);
    st.inpMax.push(-1);
  }
  for (let s = 0; s < 2; s++) st.walls.push({ side: s, cells: [], max: [], shield: 0 });
  setupRound(st);
  return st;
}

/* build (or rebuild) the walls, park the paddles, put one ball up. */
function setupRound(st){
  st.tick = 0;
  st.boost = 0; st.boostT = 0; st.slowT = 0; st.decayN = 0;
  st.score = [0, 0]; st.broke = [0, 0];
  st.balls = []; st.drops = []; st.bolts = [];
  st.nextBall = 0; st.nextDrop = 0; st.nextBolt = 0;
  st.ev = []; st.over = null;
  st.stalls = 0; st.iterCap = 0;
  for (let i = 0; i < st.pads.length; i++){
    const p = st.pads[i];
    p.hw = PAD_HW; p.wideT = 0; p.vx = 0;
    p.stickyT = 0; p.laser = 0; p.laserCd = 0;
    p.spd = p.bot ? AI[p.lvl].spd : PAD_SPEED;
    p.x = (p.lo + p.hi) >> 1; p.tx = p.x;
    p.aiAim = (p.lo + p.hi) >> 1; p.aiSeen = -1;
    st.inp[i] = [];
    if (!st.inpMax) st.inpMax = [];
    st.inpMax[i] = -1;
  }
  for (let s = 0; s < st.walls.length; s++){
    const w = st.walls[s];
    w.cells = []; w.max = []; w.shield = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++){ w.cells.push(HP_ROW[r]); w.max.push(HP_ROW[r]); }
  }
  serve(st);
}

/* THE ONLY read of st.rs. One ball, dead centre, fired at one of the
   two sides at a legal angle. */
function serve(st){
  const down = rnd(st) < 0.5 ? 1 : 0;                /* 1 = toward side 0 */
  const k = (trunc(rnd(st) * (2 * K_MAX + 1)) % (2 * K_MAX + 1)) - K_MAX;
  const di = snap((FAN_BASE[down ? 1 : 0] + (down ? -k : k) + 64) & 63);
  st.balls.push({ id: st.nextBall++, x: W >> 1, y: H >> 1, di: di, sp: SP_START,
                  last: -1, heavy: 0, stuck: 0, stuckPid: -1, stuckOff: 0 });
  st.ev.push({ id: 'ev.serve' });
}

function newRound(st){
  st.roundNo++;
  setupRound(st);
  return st;
}

/* ═══════════════════════════════════════════════════════════════════
   INPUT-DELAY LOCKSTEP — the wire plumbing.

   A COMMITTED input is an absolute paddle target x, tagged with the tick
   it is FOR (not the tick it was sampled on). st.inp[pid] is a sparse
   array indexed by that target tick. commit() writes it; ready() asks
   whether every seat has an input at or before the tick we are about to
   run; step() refuses to run until it does. The ball reads nothing here.

   delayFor(rttMed) turns a measured RTT into D ticks. One-way is ~RTT/2;
   we need the input to arrive before the far phone simulates its tick, so
   D must cover one-way latency PLUS a jitter margin PLUS the batching
   period, expressed in ticks (25 ms each), clamped to [D_MIN, D_MAX].
   ═══════════════════════════════════════════════════════════════════ */
const TICK_MS = (1000 / TICK_HZ) | 0;             /* 25                   */
const D_MIN = 2, D_MAX = 12;
const JITTER_MS = 30;                             /* headroom over median */
const BATCH_TICKS = 3;                            /* inputs sent in 3s    */

function delayFor(rttMed){
  const rtt = (rttMed | 0) > 0 ? (rttMed | 0) : 100;
  /* one-way + jitter, in ms, then to ticks, then + the batch period so a
     batched packet still lands ahead of use. Integer math only. */
  const ms = ((rtt / 2) | 0) + JITTER_MS;
  let d = ((ms + TICK_MS - 1) / TICK_MS | 0) + BATCH_TICKS;
  return clamp(d, D_MIN, D_MAX);
}

/* Commit one seat's target for a specific FUTURE tick. Absolute target in
   subunits, clamped to the seat's lane so a hostile packet cannot park a
   paddle out of bounds. Idempotent: re-committing the same (pid,tick) with
   the same value is a no-op; a DIFFERENT value for a tick already run or
   already committed is refused (that is a desync attempt, not input). */
function commit(st, pid, forTick, tx){
  const p = st.pads[pid];
  if (!p) return false;
  if (forTick < st.tick) return false;            /* the past is fixed    */
  /* Clamp to the STATIC lane only, never by p.hw. hw is time-varying
     (the WIDE power-up), and a committed input must be the same number
     on every phone — but the local phone commits at sample time and the
     far phone at arrival time, so an hw-dependent clamp stored DIFFERENT
     values for the same wire input whenever WIDE expired in between:
     the input stream itself diverged. movePads() re-clamps p.tx with the
     live hw on the tick it is used, identically on every phone. */
  tx = clamp(tx | 0, p.lo, p.hi);
  const have = st.inp[pid][forTick];
  if (have !== undefined && have !== tx) return false;
  st.inp[pid][forTick] = tx;
  /* the seat's INPUT HORIZON: the highest tick this seat has an input
     committed FOR. ready() gates on it — see there for why. */
  if (!st.inpMax) st.inpMax = [];
  if (forTick > (st.inpMax[pid] | 0) || st.inpMax[pid] === undefined)
    st.inpMax[pid] = forTick;
  return true;
}

/* Convenience for a live seat: sample now, apply after D. Returns the tick
   the input was filed for, which the UI feeds ghost() as `upto`. */
function sample(st, pid, tx, D){
  const forTick = st.tick + (D | 0);
  commit(st, pid, forTick, tx);
  return forTick;
}

/* Hand a seat to the machine, committed at an agreed tick so both phones
   flip on the same tick. bot=0 restores the human. */
function setBot(st, pid, on, atTick){
  const p = st.pads[pid];
  if (!p) return false;
  atTick = Math.max(atTick | 0, st.tick);
  if (!p.botAt) p.botAt = [];
  p.botAt.push({ t: atTick, on: on ? 1 : 0 });
  return true;
}
function applyBotFlips(st){
  for (const p of st.pads){
    if (!p.botAt) continue;
    for (let i = p.botAt.length - 1; i >= 0; i--){
      if (p.botAt[i].t === st.tick){ p.bot = p.botAt[i].on; p.botAt.splice(i, 1); }
    }
  }
}

/* The most recent committed target at or before `tick`. A live seat holds
   its last target until a fresh one arrives — this is what makes an
   absolute target forgiving of a dropped batch: you keep aiming where you
   last said, never snapping to zero. */
function targetAt(st, pid, tick){
  const row = st.inp[pid];
  for (let t = tick; t >= 0; t--){ if (row[t] !== undefined) return row[t]; }
  return st.pads[pid].tx;                          /* the parked position  */
}

/* Are all NON-BOT seats resolved for the tick we are about to run? Bots
   generate their own input inside step(), so they never gate.

   THE GATE IS THE INPUT HORIZON, NOT "ANY INPUT AT OR BEFORE t". A live
   seat files one absolute target per tick, monotonically (forTick =
   its tick + D), over an ORDERED wire. Gating on inpMax[pid] >= t means:
   we do not run tick t until we have seen an input committed FOR a tick
   at or past t — at which point, by ordering, every input this seat will
   EVER have for ticks <= t has already arrived, and targetAt(t)'s
   hold-last is the same number on every phone.

   The old gate ("some input exists at k <= t") let a phone whose clock
   ran ahead simulate tick t with hold-last while the other phone's REAL
   input for t was still in flight; when it arrived, commit() refused it
   as the fixed past and the two simulations had permanently diverged —
   the classic "starts, then breaks". Now the fast phone STALLS (a hitch,
   never a desync), exactly what the header promises.

   A seat with a pending hand-to-the-machine flip (setBot on) stops
   gating: its human's stream has ended, the flip tick is agreed, and
   hold-last carries the seat to the flip. */
function ready(st){
  const t = st.tick;
  for (const p of st.pads){
    if (p.bot) continue;
    if (p.botAt && p.botAt.length){
      let pending = false;
      for (const f of p.botAt) if (f.on){ pending = true; break; }
      if (pending) continue;
    }
    const mx = (st.inpMax && st.inpMax[p.pid] !== undefined) ? st.inpMax[p.pid] : -1;
    if (mx < t) return false;
  }
  return true;
}

/* ═══════════════════════════════════════════════════════════════════
   THE PADDLE FOLLOW — the SAME function step() and ghost() both use.
   A chase toward tx at PAD_SPEED, clamped to the lane. Pure in its
   arithmetic; returns the new x. No floats, no trig.
   ═══════════════════════════════════════════════════════════════════ */
function follow(x, tx, spd, lo, hi){
  let dx = tx - x;
  if (dx > spd) dx = spd; else if (dx < -spd) dx = -spd;
  x += dx;
  const lc = lo, hc = hi;
  if (x < lc) x = lc; else if (x > hc) x = hc;
  return x;
}

/* PREDICTED paddle for the LOCAL seat only. Runs follow() forward from the
   authoritative x over the targets already committed but not yet reached
   by the sim, up to `upto` (the last tick you have filed). Writes NOTHING.
   Delete it and the simulation is byte-identical; the ball never reads it.
   Returns an integer x — a drawing hint, nothing more. */
function ghost(st, pid, upto){
  const p = st.pads[pid];
  const lo = p.lo + p.hw, hi = p.hi - p.hw;
  let x = p.x;
  const end = Math.min(upto | 0, st.tick + D_MAX);
  for (let t = st.tick; t < end; t++){
    x = follow(x, targetAt(st, pid, t), p.spd, lo, hi);
  }
  return x;
}

/* ═══════════════════════════════════════════════════════════════════
   SWEPT COLLISION.
   The ball is a square of half-extent R. Every obstacle is inflated by R
   (Minkowski) and the ball is a POINT swept along (x,y)->(x+vx,y+vy) over
   the remaining fraction of the tick. Entry/exit times are kept as exact
   rationals n/d (d>0), cross-multiplied, never divided. No epsilon.

   slabEnter/slabExit return the [enter,exit] times a moving point spends
   inside an inflated box on ONE axis, as rationals over the shared
   denominator d = the axis velocity magnitude. We normalise all axes to a
   common positive denominator TFP-worth of sub-tick so the two axes and
   several boxes are directly comparable with plain integer cross-multiply.
   ═══════════════════════════════════════════════════════════════════ */

/* rational compare a/b ? c/d with b>0,d>0 : returns sign of (a/b - c/d) */
function rcmp(a, b, c, d){
  const l = a * d, r = c * b;                      /* b,d > 0 so safe      */
  return l < r ? -1 : l > r ? 1 : 0;
}

/* One axis. p0 is the point's start, v its velocity over the whole
   remaining fraction (which we treat as the sub-tick unit); [b0,b1] is the
   inflated box on this axis. Returns { tin, tout, hit } where times are
   fractions of the remaining move in [0,1], as {n,d}. A PARALLEL axis
   (v===0) is inside for all t iff strictly between the faces — a graze
   exactly on a face does NOT count (strict), which is tiebreak T7. */
function axisSpan(p0, v, b0, b1){
  if (v === 0){
    const inside = p0 > b0 && p0 < b1;
    return inside ? { in: {n:0,d:1}, out: {n:1,d:1}, par: true }
                  : null;
  }
  let n0 = b0 - p0, n1 = b1 - p0;                  /* over denominator v   */
  let tin, tout;
  if (v > 0){ tin = {n:n0, d:v}; tout = {n:n1, d:v}; }
  else       { tin = {n:n1, d:v}; tout = {n:n0, d:v}; }
  /* make denominators positive */
  if (tin.d < 0){ tin = {n:-tin.n, d:-tin.d}; }
  if (tout.d < 0){ tout = {n:-tout.n, d:-tout.d}; }
  return { in: tin, out: tout, par: false };
}

/* Swept test of the point (px,py) moving by (vx,vy) against inflated box
   [x0,x1,y0,y1]. Returns null (miss) or:
     { t:{n,d}, ax } where ax is bit1=x-entry, bit2=y-entry (T3), t the
     entry time in [0,1]. Entry = max(xin,yin), exit = min(xout,yout);
     a hit needs enter <= exit AND enter in [0,1) AND exit > 0 (T8). */
function sweepBox(px, py, vx, vy, x0, y0, x1, y1){
  const sx = axisSpan(px, vx, x0, x1);
  if (!sx) return null;
  const sy = axisSpan(py, vy, y0, y1);
  if (!sy) return null;
  /* enter = later of the two ins; exit = earlier of the two outs */
  let ein, eax;
  if (sx.par){ ein = sy.in; eax = 2; }
  else if (sy.par){ ein = sx.in; eax = 1; }
  else {
    const c = rcmp(sx.in.n, sx.in.d, sy.in.n, sy.in.d);
    if (c > 0){ ein = sx.in; eax = 1; }
    else if (c < 0){ ein = sy.in; eax = 2; }
    else { ein = sx.in; eax = 3; }                 /* exact corner (T3)    */
  }
  const eout = (function(){
    if (sx.par) return sy.out;
    if (sy.par) return sx.out;
    return rcmp(sx.out.n, sx.out.d, sy.out.n, sy.out.d) < 0 ? sx.out : sy.out;
  })();
  /* enter <= exit ? */
  if (rcmp(ein.n, ein.d, eout.n, eout.d) > 0) return null;
  /* enter < 1 (strictly, so a hit exactly at t=1 is next tick's problem)
     and enter >= 0, and exit > 0 (moving away, T8). */
  if (rcmp(ein.n, ein.d, 1, 1) >= 0) return null;
  if (ein.n < 0) return null;                       /* d>0 so sign is n     */
  if (rcmp(eout.n, eout.d, 0, 1) <= 0) return null;
  return { t: ein, ax: eax };
}

/* ═══════════════════════════════════════════════════════════════════
   RESOLVE ONE BALL for one tick. Iterated swept resolution:
   find the earliest contact among all inflated obstacles, advance the
   ball to it (truncating toward the surface so it never lands inside),
   apply the reflection per the tiebreak rules, spend the sub-tick, repeat
   until no contact remains or MAX_ITER is hit. Returns a list of events.
   ═══════════════════════════════════════════════════════════════════ */
function resolveBall(st, ball){
  const events = [];
  let [vx, vy] = velOf(ball.di, ball.sp);
  let px = ball.x, py = ball.y;
  let rem = TFP;                                    /* sub-ticks left       */
  /* ONE BREAKTHROUGH PER BALL PER TICK. The contract in this file (see the
     heavy-ball note below and the back-edge comment) is that a single pass
     behind the paddle scores AT MOST ONCE, then the ball flies back for a
     fair rally. But resolveBall iterates up to MAX_ITER swept contacts in a
     tick, and at full speed a ball can (a) cross the huge inflated back-edge
     half-plane on two consecutive iterations, or (b) break the LAST armour
     brick and then reach the freshly-opened back edge in the same tick —
     either way scoreHit fired twice and the score raced up 2x ("the wall
     auto-goes"). This latch makes every scoring route below idempotent for
     the tick: the FIRST breakthrough (a back-row break OR a back-edge bounce)
     scores; any further ones this tick only bounce. Pure per-ball local
     state, no Math, no float — bit-identical on both phones. */
  let scored = false;

  for (let iter = 0; iter < MAX_ITER; iter++){
    /* the move for the whole remaining fraction */
    const mvx = trunc(vx * rem / TFP);
    const mvy = trunc(vy * rem / TFP);
    if (mvx === 0 && mvy === 0) break;

    /* gather every obstacle whose entry time equals the minimum (T1) */
    let best = null;                                /* {n,d} of min entry   */
    const hits = [];                                /* {kind,...,ax,t}      */

    const consider = (x0, y0, x1, y1, kind, meta) => {
      const h = sweepBox(px, py, mvx, mvy, x0 - R, y0 - R, x1 + R, y1 + R);
      if (!h) return;
      if (best === null || rcmp(h.t.n, h.t.d, best.n, best.d) < 0){
        best = h.t; hits.length = 0; hits.push({ kind, meta, ax: h.ax, t: h.t });
      } else if (rcmp(h.t.n, h.t.d, best.n, best.d) === 0){
        hits.push({ kind, meta, ax: h.ax, t: h.t });
      }
    };

    /* arena side walls (x only). Inflate as vertical half-planes. */
    consider(-du(1000), -du(1000), 0, H + du(1000), 'wall', { axis: 'x' });
    consider(W, -du(1000), W + du(1000), H + du(1000), 'wall', { axis: 'x' });
    /* arena top/bottom are the BACK edges behind each wall; a ball only
       reaches them once a wall is gone. They are plain y mirrors. */
    /* the two arena ends double as BACK EDGES. A ball reaches one only once
       the wall in front of it has crumbled/broken away, and hitting it is a
       breakthrough that scores for the attacker (backSide = whose wall it is). */
    consider(-du(1000), -du(1000), W + du(1000), 0, 'wall', { axis: 'y', backSide: 1 });
    consider(-du(1000), H, W + du(1000), H + du(1000), 'wall', { axis: 'y', backSide: 0 });

    /* bricks — ascending brick index within each side (T9) */
    for (let s = 0; s < st.walls.length; s++){
      const w = st.walls[s];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++){
        if (w.cells[bi(r, c)] <= 0) continue;
        const b = brickBox(s, r, c);
        consider(b.x0, b.y0, b.x1, b.y1, 'brick', { side: s, r, c });
      }
    }
    /* shields (barriers) */
    for (let s = 0; s < st.walls.length; s++){
      if (st.walls[s].shield <= 0) continue;
      consider(0, SH_Y0[s], W, SH_Y1[s], 'shield', { side: s });
    }
    /* paddles */
    for (const p of st.pads){
      const pb = padBox(p);
      consider(pb.x0, pb.y0, pb.x1, pb.y1, 'paddle', { pid: p.pid });
    }

    if (best === null){                             /* free flight         */
      px += mvx; py += mvy;
      break;
    }

    /* advance to the contact point, truncating toward the surface. The
       contact fraction is best = n/d of this remaining move. We advance by
       trunc(mv * n / d) which lands AT or JUST BEFORE the face. */
    const stepX = trunc(mvx * best.n / best.d);
    const stepY = trunc(mvy * best.n / best.d);
    px += stepX; py += stepY;

    /* combine reflection: union of entry axes, each axis flips at most
       once (T2). paddle FACE hit overrides direction (T4/T5/T6). */
    let flipX = false, flipY = false;
    let paddleFace = null, paddleSide = null;
    for (const h of hits){
      if (h.kind === 'brick'){
        const w = st.walls[h.meta.side];
        const k = bi(h.meta.r, h.meta.c);
        /* a POWER-BALL smashes clean through: it takes the WHOLE brick out in
           one contact (not one hp) and does NOT reflect off it. It still
           bounces off paddles and walls, so it can never tunnel out of the
           arena — only bricks stop stopping it.

           THE BACK ROW IS EXEMPT FROM THE SMASH (the fix for the "wall with
           the ball destroys you automatically" bug). Row ROWS-1 is the armour
           row that guards the goal, and it is the ONLY row whose break scores.
           If the heavy ball ploughed through it too, a single breakthrough
           behind the paddle drained a point PER back-row brick in one
           uninterrupted pass — the ball never bounced, so the defender had no
           chance to return it and lost a fistful of points with zero
           counterplay. Making the back row REFLECT the heavy ball (and take
           normal 1-hp damage) restores the contract the non-heavy ball already
           honours: one breakthrough = at most one scoring bounce, then the ball
           flies back toward the paddle for a fair rally. The front rows still
           get ploughed, so the wall-wrecker keeps its satisfying smash. */
        const backRow = (h.meta.r === ROWS - 1);
        const smash = ball.heavy > 0 && !backRow;
        if (w.cells[k] > 0){
          w.cells[k] = smash ? 0 : (w.cells[k] - 1);
          st.broke[h.meta.side] += 1;
          if (w.cells[k] <= 0){
            events.push({ id: 'ev.broke', side: h.meta.side, r: h.meta.r, c: h.meta.c, smash: smash ? 1 : 0 });
            maybeDrop(st, h.meta.side, h.meta.r, h.meta.c);
            /* a hit on the back row scores for the ATTACKER (other team), but
               only the FIRST breakthrough this ball makes this tick (latch). */
            if (backRow && !scored){ scoreHit(st, h.meta.side); scored = true; }
          } else {
            events.push({ id: 'ev.brick', side: h.meta.side, r: h.meta.r, c: h.meta.c });
          }
        }
        /* smash = no reflection off the brick (plough straight on). The back
           row is never smashed, so a heavy ball always bounces off it. */
        if (!smash){
          if (h.ax & 1) flipX = true;
          if (h.ax & 2) flipY = true;
        }
      } else if (h.kind === 'wall'){
        if (h.meta.axis === 'x') flipX = true; else flipY = true;
        /* a back-edge hit scores for the attacker, but only the FIRST
           breakthrough this ball makes this tick (the once-per-tick latch —
           a fast ball can otherwise re-cross the inflated back-edge half-plane
           on a second sweep iteration and score twice), and only when the wall
           in front is actually open (so a ball can never reach it while bricks
           stand — but guard anyway). */
        if (h.meta.backSide !== undefined && !scored &&
            wallLive(st, h.meta.backSide) === 0){
          scoreHit(st, h.meta.backSide);
          scored = true;
        }
      } else if (h.kind === 'shield'){
        const w = st.walls[h.meta.side];
        if (w.shield > 0){ /* barrier absorbs a y-mirror; it is one-shot per hit tick */
          events.push({ id: 'ev.shield', side: h.meta.side });
        }
        if (h.ax & 1) flipX = true;
        if (h.ax & 2) flipY = true;
      } else if (h.kind === 'paddle'){
        const pp = st.pads[h.meta.pid];
        /* a FRONT-face hit is a y-entry FROM THE FRONT: side 0's front is
           its top (small y) so the ball must be moving DOWN (vy>0); side 1's
           front is its bottom so the ball must be moving UP (vy<0). A y-entry
           from BEHIND (the ball overtook the paddle) is NOT angle control —
           it is a plain y mirror, which also ejects the ball back out and
           prevents the t=0 re-hit loop. */
        const yEntry = (h.ax & 2) !== 0;
        const fromFront = pp.side === 0 ? vy > 0 : vy < 0;
        if (yEntry && fromFront){
          paddleFace = h.meta.pid; paddleSide = pp.side;
        } else {
          if (h.ax & 1) flipX = true;               /* side hit = x mirror T6 */
          if (yEntry)   flipY = true;               /* back-face bump: y mirror */
        }
      }
    }

    /* apply the direction change */
    let di = ball.di;
    if (paddleFace !== null){
      const pp = st.pads[paddleFace];
      /* STICKY: the paddle CATCHES the ball on its face instead of returning
         it. We record the catch offset (where on the face) so the re-launch
         later reproduces exactly the angle that offset would have given —
         deterministic, no float. The ball then rides the paddle until the
         owner moves (see releaseStuck / movePads). */
      if (pp.stickyT > 0 && ball.stuck === 0){
        ball.stuck = 1; ball.stuckPid = paddleFace;
        ball.stuckOff = clamp(px - pp.x, -pp.hw, pp.hw);
        ball.last = paddleFace;
        /* park the ball on the front face and stop it dead this tick. px/py
           carry to the ball write below; depenetrate() skips a stuck ball. */
        py = pp.side === 0 ? PAD_Y0[0] - R : PAD_Y1[1] + R;
        events.push({ id: 'ev.catch2', pid: paddleFace });
        rem = 0;
        break;
      }
      /* T4: paddle angle rule REPLACES direction. */
      di = paddleAngle(st, paddleFace, px);
      ball.last = paddleFace;
      escalateHit(st, ball);
      events.push({ id: 'ev.paddle', pid: paddleFace });
    } else {
      if (flipX) di = mirX(di);
      if (flipY) di = mirY(di);
    }
    di = snap(di);                                  /* anti-horizontal net  */
    ball.di = di;
    [vx, vy] = velOf(di, ball.sp);

    /* spend the sub-tick consumed and continue with the rest */
    const spent = trunc(rem * best.n / best.d);
    rem -= spent;
    if (rem <= 0) break;
  }

  ball.x = px; ball.y = py;

  /* depenetrate: a paddle may have been shoved onto the ball this tick
     (paddles move first, T10). If the ball centre is inside a paddle box
     (inflated by R), eject it out the front face along y. */
  depenetrate(st, ball);
  return events;
}

/* T10 — eject a ball a paddle swept onto. Push it just off the front face
   in the defender's outward direction, and mirror vy if it was heading in.
   Deterministic: no search, a single clamp. */
function depenetrate(st, ball){
  if (ball.stuck) return;                    /* a caught ball rides its paddle */
  for (const p of st.pads){
    const pb = padBox(p);
    if (ball.x > pb.x0 - R && ball.x < pb.x1 + R &&
        ball.y > pb.y0 - R && ball.y < pb.y1 + R){
      /* side 0 defends bottom: its front face is the TOP (small y) of the
         paddle, so the ball must be pushed to y < front. side 1 opposite. */
      if (p.side === 0){
        ball.y = pb.y0 - R - 1;
        if (DIR_Y[ball.di] > 0) ball.di = snap(mirY(ball.di));
      } else {
        ball.y = pb.y1 + R + 1;
        if (DIR_Y[ball.di] < 0) ball.di = snap(mirY(ball.di));
      }
    }
  }
}

/* THE PADDLE ANGLE RULE. Where on the face you hit selects an index from
   the fan around the side's base. Contact offset from paddle centre maps
   to a bucket in [-K_MAX,K_MAX]; the ball's incoming lateral drift adds a
   little ENGLISH. Pure integer, no trig. side 0 fires up (base 48),
   side 1 down (base 16). The result is always in the allowed run because
   FAN_BASE±K_MAX are the run ends by construction. */
function paddleAngle(st, pid, ballX){
  const p = st.pads[pid];
  let off = ballX - p.x;                            /* -hw..+hw            */
  /* bucket = off scaled into [-K_MAX,K_MAX] by integer division */
  let k = trunc(off * K_MAX / p.hw);
  if (k > K_MAX) k = K_MAX; else if (k < -K_MAX) k = -K_MAX;
  const base = FAN_BASE[p.side];
  /* side 0 up: increasing k should push toward +x directions; side 1 down
     mirrors. Direction indices increase counter-clockwise from +x, and
     up-run is 36..60 (index up = away from vertical toward the sides). */
  let di;
  if (p.side === 0) di = (base + k + 64) & 63;      /* around 48 (straight up) */
  else               di = (base - k + 64) & 63;     /* around 16 (straight down)*/
  return snap(di);
}

/* ═══════════════════════════════════════════════════════════════════
   ESCALATION, SCORING, POWER-UPS
   ═══════════════════════════════════════════════════════════════════ */
function escalateHit(st, ball){
  const cap = SP_MAX + st.boost;
  ball.sp = clamp(ball.sp + ESC_HIT, SP_MIN, Math.min(cap, SP_HARD));
}
function escalateTick(st){
  if (st.tick % ESC_EVERY !== 0) return;
  /* while a SLOW power-up is active the passive floor does NOT rise, so the
     breather actually lasts; it resumes when slowT expires. Monotone-safe:
     we simply skip the add, never subtract, so termination is unaffected. */
  if (st.slowT > 0) return;
  const cap = Math.min(SP_MAX + st.boost, SP_HARD);
  for (const b of st.balls) b.sp = clamp(b.sp + ESC_TICK, SP_MIN, cap);
}

/* an attacker (the OTHER team) scored on `side`'s back edge. */
function scoreHit(st, side){
  const attacker = side === 0 ? 1 : 0;
  st.score[attacker] += BREAK_PTS;
  st.ev.push({ id: 'ev.through', side: side });
}

/* Deterministic drop: whether a broken brick drops a power-up is a pure
   hash of (seed, side, r, c) against DROP_RATE/1000 — never the order
   bricks broke in. */
function maybeDrop(st, side, r, c){
  const roll = hash32([st.seed, side, r, c, 0x9E3779B9]) % 1000;
  if (roll >= DROP_RATE) return;
  const puRoll = hash32([st.seed, side, r, c, 0x51ED270B]) % PU_TOTAL;
  let acc = 0, kind = PU.MULTI;
  for (const [k, wt] of PU_WEIGHT){ acc += wt; if (puRoll < acc){ kind = k; break; } }
  const b = brickBox(side, r, c);
  const cx = (b.x0 + b.x1) >> 1, cy = (b.y0 + b.y1) >> 1;
  /* THE BREAKER GETS THE POWER-UP. A brick on wall `side` is the DEFENDER's
     wall; it is broken by the ATTACKER, whose paddle sits on the OTHER side
     (own = 1 - side). The drop therefore falls AWAY from the broken wall,
     across the field, toward the breaker's own paddle, and is caught by that
     paddle (see stepDrops). Deterministic: own is a pure function of side, so
     both clients agree. side 0's paddle is above its wall (smaller y) and
     side 1's below. side 0's paddle sits at the BOTTOM (large y) and side 1's
     at the TOP (small y). The drop spawns on the OPPOSITE wall (the one the
     breaker attacked) and must travel ACROSS the field to the breaker's own
     paddle, so a drop owned by side 0 falls DOWN (+y, toward the bottom paddle)
     and one owned by side 1 rises UP (−y, toward the top paddle). */
  const own = side === 0 ? 1 : 0;
  const vy = own === 0 ? DROP_V : -DROP_V;
  st.drops.push({ id: st.nextDrop++, side, own, kind, x: cx, y: cy, vy });
}

function stepDrops(st){
  for (let i = st.drops.length - 1; i >= 0; i--){
    const d = st.drops[i];
    d.y += d.vy;
    /* caught by the BREAKER's paddle — the seat that broke the brick (d.own =
       the attacker of the broken wall), NOT the defender whose wall it was. */
    let caught = false, lost = false;
    for (const p of st.pads){
      if (p.side !== d.own) continue;
      const pb = padBox(p);
      if (d.x >= pb.x0 - DROP_HW && d.x <= pb.x1 + DROP_HW &&
          d.y >= pb.y0 - DROP_HW && d.y <= pb.y1 + DROP_HW){
        applyPowerUp(st, p, d.kind); caught = true; break;
      }
    }
    if (d.y < 0 || d.y > H) lost = true;
    if (caught || lost) st.drops.splice(i, 1);
  }
}

function newBall(st, x, y, di, sp, last){
  return { id: st.nextBall++, x, y, di, sp, last,
           heavy: 0, stuck: 0, stuckPid: -1, stuckOff: 0 };
}

function applyPowerUp(st, pad, kind){
  st.ev.push({ id: 'ev.catch', pid: pad.pid, pu: kind });
  st.ev.push({ id: 'pu.' + kind });
  if (kind === PU.WIDE){
    pad.hw = PAD_HW_WIDE; pad.wideT = WIDE_TICKS;
    /* a wider paddle has a narrower lane; re-clamp so a pad caught near an
       edge does not end the tick out of its (now tighter) bounds. */
    pad.x = clamp(pad.x, pad.lo + pad.hw, pad.hi - pad.hw);
    pad.tx = clamp(pad.tx, pad.lo + pad.hw, pad.hi - pad.hw);
  }
  else if (kind === PU.SLOW){
    /* pull every ball back toward the floor and hold the escalation floor
       down for a while, so the catcher gets a breather. Never below SP_MIN. */
    st.slowT = SLOW_TICKS;
    for (const b of st.balls) b.sp = clamp(SP_MIN + ((b.sp - SP_MIN) >> 1), SP_MIN, SP_MAX);
  }
  else if (kind === PU.STICKY){ pad.stickyT = STICKY_TICKS; }
  else if (kind === PU.LASER){ pad.laser = LASER_SHOTS; pad.laserCd = 0; }
  else if (kind === PU.SHIELD){ st.walls[pad.side].shield = SHIELD_TICKS; }
  else if (kind === PU.POWER){
    /* the ball this defender will next RETURN becomes heavy. Mark the ball
       currently heading at this pad (or, if none, all of them briefly) so
       the effect is immediate and legible. Heavy = smashes bricks. */
    let marked = 0;
    for (const b of st.balls){
      const toward = pad.side === 0 ? DIR_Y[b.di] > 0 : DIR_Y[b.di] < 0;
      if (toward){ b.heavy = POWER_TICKS; b.sp = clamp(b.sp + SP_HEAVY, SP_MIN, SP_HARD); marked++; }
    }
    if (!marked) for (const b of st.balls){ b.heavy = POWER_TICKS; b.sp = clamp(b.sp + SP_HEAVY, SP_MIN, SP_HARD); }
  }
  else if (kind === PU.MULTI){
    /* split up to MAX_BALLS: each existing ball spawns a mirror-x twin */
    const cur = st.balls.slice();
    for (const b of cur){
      if (st.balls.length >= MAX_BALLS) break;
      st.balls.push(newBall(st, b.x, b.y, snap(mirX(b.di)), b.sp, b.last));
      const tw = st.balls[st.balls.length - 1];
      tw.heavy = b.heavy;              /* a twin of a power-ball is one too   */
    }
  }
}

/* A CAUGHT ball rides its owner's paddle. It launches the instant the owner
   MOVES the paddle (paddle vx != 0 this tick) — a deliberate flick — or when
   the sticky timer runs out. Launch angle is the paddleAngle of the recorded
   catch offset, so "catch, slide, release" is a precise aim, all integer. */
function rideStuck(st, ball){
  const p = st.pads[ball.stuckPid];
  if (!p || p.stickyT <= 0){ launchStuck(st, ball, p); return; }
  /* track the paddle face. CLAMP TO [R, W-R], NOT [p.lo, p.hi] (=[0,W]) — the
     side-wall escape fix. A paddle sitting at the edge of its lane with a ball
     caught at its far corner (stuckOff = ±hw) would otherwise park the ball at
     x≈0, i.e. INSIDE the left/right wall's Minkowski box (the wall is inflated
     by R for the swept test). When it then launched, the ball started already
     penetrating the wall, so the sweep's entry time was < 0 and the collision
     was skipped — the ball tunnelled clean out the side. Keeping the ball
     centre at least R from each wall means it can never be launched from inside
     one; the sweep always catches the bounce. Pure integer clamp, deterministic. */
  ball.x = clamp(p.x + ball.stuckOff, R, W - R);
  ball.y = p.side === 0 ? PAD_Y0[0] - R : PAD_Y1[1] + R;
  /* a flick releases it: the owner moved the paddle this tick */
  if (p.vx !== 0) launchStuck(st, ball, p);
}
function launchStuck(st, ball, p){
  ball.stuck = 0;
  if (!p){ ball.stuckPid = -1; return; }
  const di = paddleAngle2(st, p, ball.x, ball.stuckOff);
  ball.di = di; ball.stuckPid = -1;
  ball.last = p.pid;
  escalateHit(st, ball);
  st.ev.push({ id: 'ev.paddle', pid: p.pid });
}
/* the angle of a catch, from the stored offset — same rule as paddleAngle. */
function paddleAngle2(st, p, ballX, off){
  let k = trunc(off * K_MAX / p.hw);
  if (k > K_MAX) k = K_MAX; else if (k < -K_MAX) k = -K_MAX;
  const base = FAN_BASE[p.side];
  let di = p.side === 0 ? (base + k + 64) & 63 : (base - k + 64) & 63;
  return snap(di);
}

/* LASER: a paddle with charges auto-fires a bolt toward the enemy wall every
   LASER_EVERY ticks. Bolts are deterministic sprites that travel straight and
   chip one hp off the first live brick they cross. They never touch the ball
   (they are their own object) so determinism/tunnelling of the ball is
   untouched — a bolt is a simple point stepped and range-tested each tick. */
function fireLasers(st){
  for (const p of st.pads){
    if (p.laser <= 0){ p.laserCd = 0; continue; }
    if (p.laserCd > 0){ p.laserCd--; continue; }
    p.laser--; p.laserCd = LASER_EVERY;
    /* toward the ENEMY wall: side 0 shoots up (−y), side 1 down (+y) */
    const vy = p.side === 0 ? -LASER_V : LASER_V;
    const y0 = p.side === 0 ? PAD_Y0[0] : PAD_Y1[1];
    st.bolts.push({ id: st.nextBolt++, side: p.side, x: p.x, y: y0, vy });
    st.ev.push({ id: 'ev.laser', pid: p.pid });
  }
}
function stepBolts(st){
  for (let i = st.bolts.length - 1; i >= 0; i--){
    const bo = st.bolts[i];
    bo.y += bo.vy;
    let done = (bo.y < 0 || bo.y > H);
    /* the enemy wall is the OTHER side. chip the first live brick it is in. */
    const enemy = bo.side === 0 ? 1 : 0;
    if (!done){
      const w = st.walls[enemy];
      for (let r = 0; r < ROWS && !done; r++) for (let c = 0; c < COLS; c++){
        const k = bi(r, c);
        if (w.cells[k] <= 0) continue;
        const bb = brickBox(enemy, r, c);
        if (bo.x >= bb.x0 - LASER_HW && bo.x <= bb.x1 + LASER_HW &&
            bo.y >= bb.y0 && bo.y <= bb.y1){
          w.cells[k] -= 1; st.broke[enemy] += 1;
          if (w.cells[k] <= 0){
            st.ev.push({ id: 'ev.broke', side: enemy, r, c });
            maybeDrop(st, enemy, r, c);
            if (r === ROWS - 1) scoreHit(st, enemy);
          } else st.ev.push({ id: 'ev.brick', side: enemy, r, c });
          done = true; break;
        }
      }
    }
    if (done) st.bolts.splice(i, 1);
  }
}

/* IT-TIĠRIF — the crumbling. From DECAY_START, every DECAY_EVERY remove
   the frontmost surviving row of BOTH walls. Deterministic and free. */
function decayStep(st){
  if (st.tick < DECAY_START) return;
  const due = ((st.tick - DECAY_START) / DECAY_EVERY | 0) + 1;
  if (due <= st.decayN) return;
  st.decayN = due;
  let any = false;
  for (const w of st.walls){
    for (let r = 0; r < ROWS; r++){
      let live = false;
      for (let c = 0; c < COLS; c++) if (w.cells[bi(r, c)] > 0){ live = true; break; }
      if (live){ for (let c = 0; c < COLS; c++) w.cells[bi(r, c)] = 0; any = true; break; }
    }
  }
  if (any) st.ev.push({ id: 'ev.crumble' });
}

function decayTimers(st){
  for (const p of st.pads){
    if (p.wideT > 0 && --p.wideT === 0){
      p.hw = PAD_HW;
      p.x = clamp(p.x, p.lo + p.hw, p.hi - p.hw);
      p.tx = clamp(p.tx, p.lo + p.hw, p.hi - p.hw);
    }
    if (p.stickyT > 0) p.stickyT--;
  }
  if (st.boostT > 0 && --st.boostT === 0) st.boost = 0;
  if (st.slowT > 0) st.slowT--;
  for (const b of st.balls){ if (b.heavy > 0) b.heavy--; }
  for (const w of st.walls){ if (w.shield > 0) w.shield--; }
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE. Pure function of the state. Never a perfect interceptor:
   reaction ticks stale the read, aiming error jitters the target, and the
   three levels differ in how much physics they know (mode). Its "jitter"
   is a hash of the state, so it is replayable and desync-proof.
   ═══════════════════════════════════════════════════════════════════ */
function think(st, pid){
  const p = st.pads[pid];
  const cfg = AI[p.lvl] || AI[2];
  const lo = p.lo + p.hw, hi = p.hi - p.hw;

  /* REACTION LATENCY, done deterministically and without a history buffer:
     the AI only RECOMPUTES its aim once every `react` ticks, and holds the
     stale aim in between (p.aiAim, part of state, so a replay is a replay).
     A ball that changes direction mid-window is therefore read late — the
     paddle chases a target that is already wrong, which is exactly what a
     slow human does. This is what stops even AĦRAX from being a wall: a
     hard-angled return arrives before the next recompute and beats it. */
  if (p.aiAim === undefined){ p.aiAim = (p.lo + p.hi) >> 1; p.aiSeen = -1; }
  const react = cfg.react > 0 ? cfg.react : 1;
  if (((st.tick + pid) % react) !== 0) return clamp(p.aiAim, lo, hi);

  /* pick the ball threatening THIS side: the nearest one heading toward us */
  let target = null, bestDist = 1 << 30;
  for (const b of st.balls){
    const towardUs = p.side === 0 ? DIR_Y[b.di] > 0 : DIR_Y[b.di] < 0;
    if (!towardUs) continue;
    const face = PAD_Y0[p.side] + (p.side === 0 ? 0 : PAD_T);
    const d = p.side === 0 ? (face - b.y) : (b.y - face);
    if (d < 0) continue;
    if (d < bestDist){ bestDist = d; target = b; }
  }
  if (!target){
    /* no incoming ball: drift toward centre of our lane */
    p.aiAim = (p.lo + p.hi) >> 1;
    return clamp(p.aiAim, lo, hi);
  }
  let aimX;
  const [vx, vy] = velOf(target.di, target.sp);
  if (cfg.mode === 0){
    aimX = target.x;                                /* ĦELU: where it IS   */
  } else {
    /* time to the paddle face at current vy (guard vy sign) */
    const face = PAD_Y0[p.side] + (p.side === 0 ? 0 : PAD_T);
    const dy = p.side === 0 ? (face - target.y) : (target.y - face);
    const speedY = Math.abs(vy) || 1;
    const tt = Math.max(0, (dy * TFP / speedY) | 0);   /* sub-ticks         */
    let projX = target.x + trunc(vx * tt / TFP);
    if (cfg.mode >= 2){
      /* AĦRAX: fold the side walls so the projection is the TRUE crossing.
         NORMALI (mode 1) does NOT fold, so it misreads every ball that will
         bounce off a side wall — a real, exploitable weakness, not a knob. */
      projX = foldX(projX);
    }
    aimX = projX;
  }
  /* aiming error: a deterministic jitter, but keyed to the RECOMPUTE window
     (not the raw tick) so it does NOT average out to zero over the chase —
     the paddle actually settles a little off, and a ball aimed at that gap
     gets through. */
  if (cfg.err > 0){
    const win = (st.tick / react) | 0;
    const j = (hash32([st.seed, win, pid, target.id]) % (2 * cfg.err + 1)) - cfg.err;
    aimX += j;
  }
  p.aiAim = clamp(aimX, lo, hi);
  return p.aiAim;
}
/* reflect an out-of-arena x back into [0,W] as many times as needed —
   the "unfolding" of side-wall bounces. Integer, no loop-forever. */
function foldX(x){
  const span = W;
  if (span <= 0) return 0;
  let m = x % (2 * span); if (m < 0) m += 2 * span;
  return m <= span ? m : 2 * span - m;
}

/* ═══════════════════════════════════════════════════════════════════
   THE TICK. Order matters and is fixed (T9/T10):
     1  bot flips committed for this tick
     2  paddles move (bots think; humans follow committed targets)
     3  balls resolve, ascending id (swept)
     4  drops fall / are caught
     5  escalation, decay, timers
     6  end conditions
     7  advance st.tick
   ═══════════════════════════════════════════════════════════════════ */
function movePads(st){
  for (const p of st.pads){
    const lo = p.lo + p.hw, hi = p.hi - p.hw;
    let tx;
    if (p.bot) tx = think(st, p.pid);
    else       tx = targetAt(st, p.pid, st.tick);
    p.tx = clamp(tx, lo, hi);
    const nx = follow(p.x, p.tx, p.spd, lo, hi);
    p.vx = nx - p.x;
    p.x = nx;
  }
}

function step(st){
  if (st.over) return st;
  if (!ready(st)){ st.stalls++; return st; }        /* hold for input      */

  applyBotFlips(st);
  movePads(st);

  st.ev = [];
  st.balls.sort((a, b) => a.id - b.id);
  for (const b of st.balls){
    /* a CAUGHT ball rides its paddle and does not sweep until it releases */
    if (b.stuck){ rideStuck(st, b); continue; }
    const evs = resolveBall(st, b);
    for (const e of evs) st.ev.push(e);
  }
  stepDrops(st);
  stepBolts(st);
  fireLasers(st);

  escalateTick(st);
  decayStep(st);
  decayTimers(st);

  checkEnd(st);

  st.tick++;
  st.iterCap = st.iterCap;                          /* (updated inside)    */
  return st;
}

function checkEnd(st){
  /* SCORE TARGET is the win. Once a wall is open every back-edge hit scores
     BREAK_PTS, so an exposed side loses fast — the wall thinning IS the
     pressure, but it is expressed through the score, never through a sudden
     KO that would race the decay into a hollow 0:0 draw. */
  for (let t = 0; t < 2; t++){
    if (st.score[t] >= st.target){ endRound(st, t, 'end.target'); return; }
  }
  /* the unconditional clock: whoever is ahead on points when it rings. This
     alone makes termination a theorem. */
  if (st.tick >= ROUND_MAX){
    const w = st.score[0] === st.score[1] ? -1 : (st.score[0] > st.score[1] ? 0 : 1);
    endRound(st, w, w < 0 ? 'end.draw' : 'end.time');
  }
}
function wallLive(st, side){
  const c = st.walls[side].cells; let n = 0;
  for (let i = 0; i < c.length; i++) if (c[i] > 0) n++;
  return n;
}
function endRound(st, winner, reason){
  st.over = { winner, reason };
  if (winner >= 0) st.wins[winner]++;
  const need = (st.bestOf >> 1) + 1;
  if (st.wins[0] >= need) st.matchOver = { winner: 0 };
  else if (st.wins[1] >= need) st.matchOver = { winner: 1 };
}

/* ═══════════════════════════════════════════════════════════════════
   INVARIANTS — check() asserts them every tick in tests. Cheap enough to
   leave callable in production behind a flag.
   ═══════════════════════════════════════════════════════════════════ */
function check(st){
  const errs = [];
  const cap = Math.min(SP_MAX + st.boost, SP_HARD);
  for (const b of st.balls){
    if (b.x < -R || b.x > W + R || b.y < -R || b.y > H + R)
      errs.push('ball OOB ' + b.id + ' ' + b.x + ',' + b.y);
    if (b.sp < SP_MIN || b.sp > SP_HARD) errs.push('ball speed ' + b.sp);
    if (Math.abs(DIR_Y[b.di]) < MIN_ABS_Y) errs.push('ball near-horizontal di=' + b.di);
    if (snap(b.di) !== b.di) errs.push('ball di not snapped ' + b.di);
  }
  for (const w of st.walls) for (const h of w.cells) if (h < 0) errs.push('neg brick hp');
  for (const p of st.pads){
    if (p.x < p.lo + p.hw - 1 || p.x > p.hi - p.hw + 1) errs.push('pad OOB ' + p.pid);
  }
  if (st.balls.length > MAX_BALLS) errs.push('too many balls');
  return errs;
}

/* ═══════════════════════════════════════════════════════════════════
   REPRODUCIBILITY — a stable hash of the whole simulation state, for the
   determinism proof. Order every collection so the hash is canonical.
   ═══════════════════════════════════════════════════════════════════ */
function snapshot(st){
  const a = [ st.tick, st.rs, st.boost, st.boostT, st.slowT, st.decayN,
              st.score[0], st.score[1], st.broke[0], st.broke[1],
              st.nextBall, st.nextDrop, st.nextBolt, st.wins[0], st.wins[1] ];
  const balls = st.balls.slice().sort((x, y) => x.id - y.id);
  for (const b of balls)
    a.push(b.id, b.x, b.y, b.di, b.sp, b.last, b.heavy, b.stuck, b.stuckPid, b.stuckOff);
  a.push(0x7fffffff);
  for (const p of st.pads.slice().sort((x, y) => x.pid - y.pid))
    a.push(p.pid, p.x, p.tx, p.vx, p.hw, p.wideT, p.stickyT, p.laser, p.laserCd, p.bot);
  a.push(0x7ffffffe);
  for (const w of st.walls){ a.push(w.shield); for (const h of w.cells) a.push(h); }
  a.push(0x7ffffffd);
  for (const d of st.drops.slice().sort((x, y) => x.id - y.id))
    a.push(d.id, d.side, d.own, d.kind, d.x, d.y, d.vy);
  a.push(0x7ffffffc);
  for (const bo of st.bolts.slice().sort((x, y) => x.id - y.id))
    a.push(bo.id, bo.side, bo.x, bo.y, bo.vy);
  a.push(st.over ? (st.over.winner + 2) : 0);
  return hash32(a);
}

/* ═══════════════════════════════════════════════════════════════════
   WIRE — a paddle input is a target x for a tick. 16-bit target fits the
   arena (W = 15360 subunits < 65535). poker.js's byte-splitting shape.
   ═══════════════════════════════════════════════════════════════════ */
const WIRE_FIELDS = ['t', 'k', 'h', 'l'];           /* type, tick, hi, lo   */
function encWire(mv){
  if (!mv) return null;
  if (mv.t === 'bot') return { t: 'bot', k: mv.forTick | 0, on: mv.on ? 1 : 0 };
  if (mv.t === 'tx'){
    const x = clamp(mv.tx | 0, 0, W), tk = mv.forTick | 0;
    return { t: 'tx', k: tk, h: (x >> 8) & 255, l: x & 255 };
  }
  return null;
}
function decWire(w){
  if (!w || typeof w.t !== 'string') return null;
  if (w.t === 'bot') return { t: 'bot', forTick: w.k | 0, on: w.on ? 1 : 0 };
  if (w.t === 'tx') return { t: 'tx', forTick: w.k | 0,
                             tx: ((w.h | 0) << 8) + (w.l | 0) };
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — js/briks-ui.js and the test harness read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_BRIKS = root.KARTI_BRIKS || {};
root.KARTI_BRIKS.engine = {
  /* lifecycle */
  start, setupRound, newRound, serve, step,
  /* lockstep / input */
  delayFor, commit, sample, setBot, ready, ghost, follow, targetAt,
  /* ai */
  think,
  /* introspection for the UI */
  check, snapshot, text, laneOf, padBox, brickBox, rowY, foldX, paddleAngle,
  /* wire */
  encWire, decWire, WIRE_FIELDS,
  /* helpers exposed for the UI's own predictive draw / geometry */
  velOf, DIR_X, DIR_Y, mirX, mirY, snap,
  /* constants the UI needs to lay out the arena */
  consts: {
    S, W, H, R, COLS, ROWS, BW, BH, TICK_HZ, TICK_MS,
    PAD_HW, PAD_HW_WIDE, PAD_T, PAD_Y0, PAD_Y1,
    WALL_Y0, WALL_Y1, SH_Y0, SH_Y1, SP_MIN, SP_MAX, SP_HARD,
    TARGET, HP_ROW, PU, PU_WEIGHT, MAX_BALLS, LASER_HW, D_MIN, D_MAX, VER
  }
};

})(typeof window !== 'undefined' ? window : globalThis);
