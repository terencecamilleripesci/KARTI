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

     Broken bricks drop power-ups, and the DEFENDER catches them (they
     fall from your own wall toward your own paddle). That is on
     purpose: the player who is losing bricks gets the help. It is the
     comeback valve.

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
const PAD_SPEED   = du(12);                /* per tick; 20 ticks a sweep*/

const SP_MIN   = du(5);                    /* 320  = 200 du/s          */
const SP_START = du(5.25) | 0;             /* 336                      */
const SP_MAX   = du(17.5) | 0;             /* 1120 = 700 du/s          */
const SP_HARD  = du(25) | 0;               /* ceiling incl. FAST boost */
const ESC_HIT  = 10;                       /* per paddle hit           */
const ESC_TICK = 3;                        /* per ESC_EVERY ticks      */
const ESC_EVERY = 20;

const MAX_BALLS = 6;
const HP_ROW  = [1, 1, 2, 3];              /* row 0 is the FRONT row   */
const TARGET  = 40;                        /* points to win the round  */
const BREAK_PTS = 2;                       /* a hit on their back edge */

const DROP_HW    = du(3);
const DROP_V     = du(4);
const DROP_RATE  = 220;                    /* per 1000 bricks broken   */
const WIDE_TICKS = 480;
const FAST_TICKS = 400;
const FAST_BOOST = du(2.5) | 0;
const SHIELD_TICKS = 900;

const DECAY_START = TICK_HZ * 60;
const DECAY_EVERY = TICK_HZ * 8;
const ROUND_MAX   = TICK_HZ * 300;

const TFP = 4096;                          /* sub-ticks in one tick    */
const MAX_ITER = 24;                       /* bounces resolved per tick*/

/* ── power-ups ───────────────────────────────────────────────────── */
const PU = { MULTI: 1, WIDE: 2, FAST: 3, SHIELD: 4 };
const PU_WEIGHT = [ [PU.MULTI, 3], [PU.WIDE, 3], [PU.FAST, 2], [PU.SHIELD, 3] ];
const PU_TOTAL  = 11;

/* ── the machine's three sharpnesses ─────────────────────────────── */
const AI = [
  null,
  { react: 10, err: du(22), spd: (PAD_SPEED * 6 / 10) | 0, mode: 0, aim: 0 },
  { react:  5, err: du(12), spd: (PAD_SPEED * 8 / 10) | 0, mode: 1, aim: 0 },
  { react:  2, err: du(5),  spd: PAD_SPEED,                mode: 2, aim: 1 }
];

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
  'ev.crumble':  { en: 'The walls crumble',  mt: 'Il-ħitan qed jiġġarrfu' },
  'ev.serve':    { en: 'Ball in play',       mt: 'Il-ballun fil-logħob' },
  'pu.1':        { en: 'Multi-ball',         mt: 'Aktar blalen' },
  'pu.2':        { en: 'Wider paddle',       mt: 'Raketta usa\'' },
  'pu.3':        { en: 'Ball speeds up',     mt: 'Il-ballun jgħaġġel' },
  'pu.4':        { en: 'Barrier up',         mt: 'Ħarsien imtella\'' },
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
    boost: 0, boostT: 0,
    decayN: 0,
    score: [0, 0],
    broke: [0, 0],
    pads: [], walls: [], balls: [], drops: [],
    nextBall: 0, nextDrop: 0,
    inp: [], ev: [], over: null, matchOver: null,
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
      spd: PAD_SPEED,
      bot: bots[i] | 0, lvl: clamp(lvls[i] | 0 || 2, 1, 3)
    });
    st.inp.push([]);
  }
  for (let s = 0; s < 2; s++) st.walls.push({ side: s, cells: [], max: [], shield: 0 });
  setupRound(st);
  return st;
}

/* build (or rebuild) the walls, park the paddles, put one ball up. */
function setupRound(st){
  st.tick = 0;
  st.boost = 0; st.boostT = 0; st.decayN = 0;
  st.score = [0, 0]; st.broke = [0, 0];
  st.balls = []; st.drops = [];
  st.nextBall = 0; st.nextDrop = 0;
  st.ev = []; st.over = null;
  st.stalls = 0; st.iterCap = 0;
  for (let i = 0; i < st.pads.length; i++){
    const p = st.pads[i];
    p.hw = PAD_HW; p.wideT = 0; p.vx = 0;
    p.spd = p.bot ? AI[p.lvl].spd : PAD_SPEED;
    p.x = (p.lo + p.hi) >> 1; p.tx = p.x;
    st.inp[i] = [];
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
  st.balls.push({ id: st.nextBall++, x: W >> 1, y: H >> 1, di: di, sp: SP_START, last: -1 });
  st.ev.push({ id: 'ev.serve' });
}

function newRound(st){
  st.roundNo++;
  setupRound(st);
  return st;
}

/* ══ MARKER_2 ══ */

})(typeof window !== 'undefined' ? window : globalThis);
