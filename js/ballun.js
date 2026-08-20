/* ═══════════════════════════════════════════════════════════════════
   KARTI — ballun.js
   IL-BALLUN ("the ball") — the engine. A square festa-square arena. Up
   to four players, one to an edge, each with a paddle that slides ALONG
   their edge and a GOAL mouth cut into the wall behind them. One or more
   balls rattle around; a ball that gets past your paddle and into your
   goal costs you a life. Last paddle standing wins. Empty edges are
   AI-controlled by default (a full four-corner brawl even solo), or can
   be sealed as plain walls.

   Rules only — no DOM, no canvas, no clock, no registration. The screen
   half is js/ballun-ui.js and this file never reaches for it.

   THIS FILE IS THE SIBLING OF js/briks.js. It inherits, deliberately and
   almost line-for-line, the three hard things briks got right:
     · FIXED POINT + A BAKED DIRECTION TABLE, so there is no float and no
       trigonometry and — the ball-game trap — NO SQUARE ROOT anywhere in
       the sim. Velocity is (di, sp): an index into a 64-entry direction
       table and a scalar speed. A bounce is an INDEX TRANSFORM, never a
       renormalise, so |v| can never drift.
     · SWEPT COLLISION over exact rationals n/d, so a max-speed ball can
       never tunnel a thin paddle, wall or goal mouth. Same slab method,
       same tiebreak rules, no epsilon.
     · INPUT-DELAY LOCKSTEP over absolute paddle targets committed for a
       future tick N+D, so every phone simulates the identical arena and
       nobody disputes a goal. Same commit/ready/ghost machinery.

   WHAT IS NEW HERE, AND WHY
     briks is a 1v1 on ONE axis (both paddles slide left-right, both goals
     are the top and bottom edges). IL-BALLUN generalises to FOUR edges:
     TOP and BOTTOM paddles slide in X; LEFT and RIGHT paddles slide in Y.
     So a paddle's lane axis, its goal wall, and its deflection fan all
     depend on which edge it owns. The four edges are indexed:

         EDGE 0 = BOTTOM (large y) — slides X, defends the y=H wall
         EDGE 1 = TOP    (small y) — slides X, defends the y=0 wall
         EDGE 2 = LEFT   (small x) — slides Y, defends the x=0 wall
         EDGE 3 = RIGHT  (large x) — slides Y, defends the x=W wall

     briks scored by chipping a brick wall; IL-BALLUN scores by LIVES. A
     ball crossing your goal mouth line, past your paddle, is −1 life and
     the ball is re-served from centre. At zero lives your edge SEALS into
     a plain wall (your paddle vanishes, the goal closes) and play goes on
     among the survivors. Last edge with lives left wins the round. This
     is Warlords/4-way-pong scoring, chosen because it terminates cleanly
     (a life only ever decreases) and reads instantly on a phone.

   ── DETERMINISM: THE SAME PROMISE AS briks ─────────────────────────────
     Every position, velocity and size is an INTEGER in subunits
     (S = 64 subunits per display unit). No float reaches the state. The
     ONLY Math.random is newSeed() for a brand-new LOCAL match; an online
     match takes its seed from the relay. Inside a tick there is NO
     Math.random, NO Math.sin/cos/tan, NO Math.pow, and NO SQUARE ROOT.
     Grep the file: the sim path uses trunc (integer divide toward zero),
     the baked DIR_X/DIR_Y tables, and hash32 (a pure FNV of integers).

     THE ANTI-HORIZONTAL / ANTI-VERTICAL BAR. briks only had to forbid a
     near-horizontal loop because its walls were top/bottom. Here BOTH
     axes have goals, so a ball must stay clear of BOTH horizontal AND
     vertical — a ball drifting almost-straight-up would rally forever
     between the top and bottom paddles without ever threatening left or
     right, and vice-versa. The direction table is therefore split into an
     ALLOWED set that is at least DIAG_MIN off EVERY axis: the four
     diagonal runs, indices 3..13, 19..29, 35..45, 51..61. Every allowed
     index has |DIR_X| >= 297 AND |DIR_Y| >= 297 (that is >= ~16.7° off
     both axes). Mirroring (di -> (32-i)&63 across x, (64-i)&63 across y)
     never leaves the allowed set, and the paddle fans and the serve only
     ever emit allowed indices, so a disallowed direction is unreachable
     by construction. snap() is the safety net and check() asserts it.

     With |vx| >= sp*297/1024 AND |vy| >= sp*297/1024 the ball makes real
     progress on BOTH axes every tick, so it cannot orbit one pair of
     edges forever — it crosses the arena corner-to-corner in a bounded
     number of ticks. A round therefore always resolves; see below.

   ── SWEPT COLLISION, THE GOAL MOUTH, AND TUNNELLING ────────────────────
     Identical machinery to briks: the ball is a square of half-extent R,
     obstacles are inflated by R (Minkowski), the ball is a point swept
     along the segment, entry/exit times are exact rationals cross-
     multiplied, position advances by a truncation toward the surface so
     the ball never lands inside one.

     THE GOAL is NOT an obstacle. Each edge wall is drawn as TWO solid
     jamb segments with a GAP in the middle — the goal mouth — exactly the
     paddle's own travel range. The ball bounces off the two jambs (which
     ARE swept obstacles) but the mouth is empty space. A ball that
     reaches the mouth line past the paddle is a GOAL: detected by a swept
     crossing of the (thin) goal LINE segment inside the mouth span, which
     cannot be tunnelled because it too is resolved along the swept path,
     not point-sampled. So a full-speed ball fired dead at the mouth
     either (a) is deflected by the paddle, (b) hits a jamb, or (c) crosses
     the mouth line and scores — never passes through a jamb or through the
     paddle's body.

   ── PADDLE DEFLECTION (THE SKILL, LIKE briks) ──────────────────────────
     Where the ball strikes the paddle FACE selects the rebound direction
     from a fan of indices around the edge's "straight out" base. The four
     bases are the four axis directions; the fan opens ±K_MAX buckets, and
     K_MAX lands exactly on the ends of that edge's allowed diagonal run,
     so a face hit is always a legal, non-degenerate direction. Contact
     offset from the paddle centre picks the bucket; incoming lateral
     drift adds a little ENGLISH. Pure integer, no trig. A centre hit goes
     nearly straight across; an edge hit cuts hard toward a neighbour's
     goal — which is how you attack.

     A SIDE hit (the paddle's short end) is a plain mirror with no angle
     control: you blocked with the edge, you did not aim (briks T6). A
     paddle a tick shoved onto the ball is depenetrated out its front face
     (briks T10).

   ── ESCALATION, AND THE PROOF A ROUND ENDS ─────────────────────────────
     Three independent brakes, any one sufficient — same shape as briks:
       · sp climbs by ESC_HIT on every paddle hit and by ESC_TICK every
         ESC_EVERY ticks, up to SP_MAX (+FAST boost, to SP_HARD). Rallies
         only ever get faster.
       · MULTI ESCALATION: from BALL_ADD_START, every BALL_ADD_EVERY a new
         ball is served from centre (up to MAX_BALLS) unless the mode caps
         it. More balls ⇒ more goals ⇒ lives fall faster.
       · ROUND_MAX (5 min of ticks) ends the round unconditionally: the
         edge with the most lives (fewest goals conceded) wins, ties on a
         documented tiebreak. This ALONE makes termination a theorem.
     And structurally: a life only ever decreases, and a goal is scored in
     a bounded number of ticks because the ball makes bounded progress on
     both axes every tick (the DIAG_MIN bar above). Rounds cannot stall.

   ── THE MACHINE ────────────────────────────────────────────────────────
     think() is a pure function of the state, so an AI edge is replayable
     and an online edge can be handed to it mid-match. It is NOT a perfect
     interceptor (that is unbeatable and boring). Three levels differ in
     three ways at once — reaction latency, aiming error, and how much
     physics they know:
       1  ĦELU     tracks where the nearest incoming ball IS. No predict.
       2  NORMALI  extrapolates in a straight line, so it misreads any
                   ball that will bounce off a side wall before reaching
                   it (a real, exploitable weakness).
       3  AĦRAX    folds the perpendicular walls to predict the true
                   crossing along its lane, and aims the rebound toward
                   the opponent with the most lives (the biggest target).
     The jitter is a hash of the state, so it is replayable and desync-
     proof, and it is keyed to the recompute window so it does NOT average
     to zero — the paddle settles a little off and a ball aimed at the gap
     gets through. Even two AĦRAX edges trade goals rather than deadlock.

   ── LOCKSTEP: THE SAME MODEL AS bomba / briks ──────────────────────────
     Nobody sends ball positions. Each edge sends only its own paddle
     target (an absolute position along its lane), tagged with the tick it
     is FOR, and every phone simulates the identical world from (seed,
     ordered inputs). A target sampled at tick N is applied by EVERYBODY
     at N+D; D adapts to RTT via delayFor(). A late input STALLS the world
     (ready() is false) rather than being guessed — a hitch, not a desync;
     a player who left is handed to the machine at an agreed tick. The
     honest cost is D ticks of input lag on your own paddle, hidden by the
     predictive ghost() (a pure drawing hint that writes nothing — delete
     it and the sim is byte-identical). The whole match is reproducible
     from (seed, inputs); snapshot() hashes the canonical state for the
     replay proof.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ═══════════════════════════════════════════════════════════════════
   FIXED POINT.  S subunits to a display unit; the UI divides by S for
   its own pixels and the engine never sees a pixel or a float.
   ═══════════════════════════════════════════════════════════════════ */
const S = 64;
const du = n => (n * S) | 0;

const VER     = 1;
const TICK_HZ = 40;                        /* 25 ms a tick, as briks/bomba */
const TICK_MS = (1000 / TICK_HZ) | 0;      /* 25                           */

const W = du(300), H = du(300);            /* a SQUARE arena               */

/* the ball is a SQUARE of half-extent R for collision. Draw a circle. */
const R = du(2.6) | 0;

/* ── edges ─────────────────────────────────────────────────────────────
   0 BOTTOM  1 TOP  2 LEFT  3 RIGHT.  A pad's `axis` is which coordinate it
   slides along: 'x' for TOP/BOTTOM, 'y' for LEFT/RIGHT.  `out` is the sign
   of its OUTWARD normal (toward its own goal wall): +1 for BOTTOM/RIGHT
   (large coordinate), −1 for TOP/LEFT (small coordinate).                */
const N_EDGES = 4;
const EDGE_AXIS = ['x', 'x', 'y', 'y'];    /* per edge                     */
const EDGE_OUT  = [ +1,  -1,  -1,  +1 ];   /* toward the goal wall         */

const WALL_M  = du(9);                     /* wall inset from the arena rim */
const PAD_T   = du(9);                     /* paddle thickness (toward mouth)*/
const PAD_GAP = du(5);                     /* paddle front to the goal line  */

/* the GOAL LINE for each edge (the plane the ball crosses to score) sits
   at the wall inset. The paddle's front face is PAD_GAP in front of it. */
const GOAL_COORD = [ H - WALL_M, WALL_M, WALL_M, W - WALL_M ]; /* per edge */
/* the paddle's fixed cross-lane coordinate (the axis it does NOT slide on):
   PAD_GAP in front of the goal line, on the arena side. */
const PAD_COORD = [
  (H - WALL_M) - PAD_GAP - (PAD_T >> 1),   /* BOTTOM: below-centre y        */
  (WALL_M) + PAD_GAP + (PAD_T >> 1),       /* TOP                           */
  (WALL_M) + PAD_GAP + (PAD_T >> 1),       /* LEFT: x                       */
  (W - WALL_M) - PAD_GAP - (PAD_T >> 1)    /* RIGHT                         */
];

/* the mouth (and thus the paddle's travel) spans the middle of each edge,
   leaving a solid JAMB of MOUTH_M at each corner so the corners always
   rebound and two adjacent paddles never overlap at the corner. */
const MOUTH_M     = du(30);                 /* jamb length at each corner    */
const LANE_LO     = MOUTH_M;                /* paddle-centre travel min      */
const LANE_HI_X   = W - MOUTH_M;
const LANE_HI_Y   = H - MOUTH_M;

const PAD_HW      = du(26);                 /* half length of the paddle     */
const PAD_HW_WIDE = du(40);
const PAD_SPEED   = du(11);                 /* per tick                      */

const SP_MIN   = du(4.75) | 0;
const SP_START = du(5) | 0;
const SP_MAX   = du(15) | 0;
const SP_HARD  = du(22) | 0;               /* ceiling incl. FAST boost      */
const ESC_HIT  = 11;
const ESC_TICK = 3;
const ESC_EVERY = 20;

/* the Ballistix score: each player starts on START_LIVES points and LOSES one
   each time a ball is scored INTO their goal; at 0 they are OUT and their edge
   seals. 15 matches the original Crash Bash "Crashball" starting score — last
   standing wins, and escalation (faster + more balls) always resolves it. */
const START_LIVES = 15;
const MAX_BALLS   = 5;

/* multi-ball escalation timing — starts sooner and adds faster than briks'
   crumble because IL-BALLUN has no wall to thin; the extra balls ARE the
   pressure that keeps a 4-way rally from stalling. */
const BALL_ADD_START = TICK_HZ * 14;       /* first extra ball at 14 s      */
const BALL_ADD_EVERY = TICK_HZ * 11;       /* another every 11 s            */

const ROUND_MAX = TICK_HZ * 150;           /* 2.5 min hard cap              */

/* power-ups: dropped from centre on a timer, drift to a random edge, and
   the FIRST paddle to touch them takes them. Deterministic throughout. */
const PU = { WIDE: 1, SLOW: 2, MULTI: 3, SHIELD: 4 };
const PU_WEIGHT = [ [PU.WIDE, 3], [PU.SLOW, 2], [PU.MULTI, 2], [PU.SHIELD, 3] ];
const PU_TOTAL  = 10;
const PU_START   = TICK_HZ * 12;
const PU_EVERY   = TICK_HZ * 16;
const PU_HW      = du(3);
const PU_V       = du(3);
const WIDE_TICKS = 520;
const SLOW_TICKS = 360;
const SLOW_NUM = 6, SLOW_DEN = 10;         /* ×0.6 on the ball speeds       */
const SHIELD_HITS = 1;                     /* saves one goal                */

/* ── POST-GOAL SERVE DELAY + SMOOTH ENTRY ──────────────────────────────
   A goal no longer re-serves instantly.  Every serve becomes a PENDING
   SERVE held in st.serves for a deterministic count of ticks, drawn by the
   UI as a pulsing marker + an ARROW at the origin pointing the exact launch
   direction, THEN the ball enters play.  The ball also EASES in: for its
   first BALL_EASE ticks its move is scaled up from ENTER_NUM/ENTER_DEN to
   full, so it accelerates out of the origin instead of teleporting to full
   speed.  All tick counts are fixed integers → identical on every client. */
const SERVE_DELAY  = 30;                    /* ticks a post-goal serve waits (0.75 s @40Hz) */
const SERVE_DELAY0 = 20;                    /* round-start / multi-ball wait (0.5 s)        */
const BALL_EASE    = 8;                     /* ticks the entering ball accelerates          */
const ENTER_NUM = 4, ENTER_DEN = 10;        /* ball starts at ×0.4 speed, ramps to ×1.0     */

/* ── BASH / PUSH ability (the Crash-Bash "push") ───────────────────────
   A committed per-seat input (rides the SAME lockstep as the paddle target:
   a bash for tick N is applied by everyone at N+D).  On bash the paddle
   LUNGES forward BASH_LUNGE subunits toward the arena for BASH_LUNGE_T ticks
   (its collision box reaches out, so a ball just in front is caught), and any
   ball inside BASH_RANGE in FRONT of the paddle face and within BASH_HALF of
   the paddle span is POWER-HIT: its speed jumps by BASH_BOOST (clamped to the
   engine ceiling) and its direction is set to the paddle's own outward fan,
   deflected away from the paddle.  A bash off cooldown always consumes the
   cooldown (a whiff still costs it).  Deterministic integer math throughout. */
const BASH_CD      = 60;                    /* cooldown ticks (~1.5 s @40Hz)                */
const BASH_LUNGE   = du(10);                /* forward reach of the lunge (subunits)        */
const BASH_LUNGE_T = 6;                     /* ticks the lunge is extended                  */
const BASH_RANGE   = du(22);               /* how far in front a ball is catchable         */
const BASH_HALF    = du(30);               /* lateral half-span the bash covers            */
const BASH_BOOST   = du(6) | 0;            /* speed added to a bashed ball                 */
const BASH_AI_CD   = 60;                    /* AI shares the same cooldown                   */

const TFP = 4096;                          /* sub-ticks in one tick         */
const MAX_ITER = 24;                       /* bounces resolved per tick     */

/* ── the machine's three sharpnesses ───────────────────────────────────
   As briks: react>0 staleness plus an aiming error that exceeds a paddle
   half-width a fraction of the time, so a real gap opens and even AĦRAX
   is beatable. Speeds under PAD_SPEED so a fast wide-angle ball it did not
   pre-position for is physically un-chaseable. */
const AI = [
  null,
  { react: 11, err: du(58), spd: (PAD_SPEED * 55 / 100) | 0, mode: 0, aim: 0 },
  { react:  7, err: du(40), spd: (PAD_SPEED * 78 / 100) | 0, mode: 1, aim: 0 },
  { react:  4, err: du(28), spd: (PAD_SPEED * 96 / 100) | 0, mode: 2, aim: 1 }
];

/* ═══════════════════════════════════════════════════════════════════
   THE DIRECTION TABLE — baked, never computed.  64 entries 5.625° apart,
   magnitude 1024, generated one quadrant and mirrored so these are EXACT
   for every entry (the tests prove it):

       DIR_X[(32 - i)&63] === -DIR_X[i]   DIR_Y[(32 - i)&63] === DIR_Y[i]
       DIR_X[(64 - i)&63] ===  DIR_X[i]   DIR_Y[(64 - i)&63] === -DIR_Y[i]

   i=0 is +x (right); y grows DOWNWARD, so i=16 is straight down, i=32 is
   −x, i=48 is straight up.  The four AXIS indices (0,16,32,48) are the
   paddle bases; a face hit fans ±K_MAX around them.
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
const DIR_U = 1024;                         /* the table's magnitude        */
/* BOTH axes must stay clear this far — the anti-horizontal AND anti-
   vertical bar.  Every ALLOWED index has |DIR_X| >= 297 AND |DIR_Y| >= 297. */
const DIAG_MIN = 297;

/* The ALLOWED set: the four diagonal runs, each K_MAX either side of a
   diagonal centre (8,24,40,56).  SNAP maps ANY index to the nearest legal
   one keeping its signs — the identity on every reachable index (check()
   asserts it), a net against a future power-up inventing a direction. */
const SNAP = [
   3,  3,  3,  3,  4,  5,  6,  7,   /*  0.. 7 -> up into run 3..13         */
   8,  9, 10, 11, 12, 13, 13, 13,   /*  8..15                             */
  19, 19, 19, 19, 20, 21, 22, 23,   /* 16..23 -> run 19..29               */
  24, 25, 26, 27, 28, 29, 29, 29,   /* 24..31                             */
  35, 35, 35, 35, 36, 37, 38, 39,   /* 32..39 -> run 35..45               */
  40, 41, 42, 43, 44, 45, 45, 45,   /* 40..47                             */
  51, 51, 51, 51, 52, 53, 54, 55,   /* 48..55 -> run 51..61               */
  56, 57, 58, 59, 60, 61, 61, 61    /* 56..63                             */
];

/* paddle fan: base index and the bucket half-range per edge.  Bases are the
   four axis directions of the OUTWARD REBOUND (away from the goal wall):
     BOTTOM defends large-y, so it fires UP  -> base 48 (straight up)
     TOP    defends small-y, so it fires DOWN-> base 16 (straight down)
     LEFT   defends small-x, so it fires RIGHT-> base 0  (+x)
     RIGHT  defends large-x, so it fires LEFT -> base 32 (−x)
   K_MAX lands exactly on the ends of each base's allowed diagonal run. */
const FAN_BASE = [48, 16, 0, 32];           /* per edge                     */
const K_MAX = 5;                            /* run half-width (3..13 etc.)  */
const ENGLISH = 1;

const mirX  = i => (32 - i) & 63;
const mirY  = i => (64 - i) & 63;
const snap  = i => SNAP[i & 63];
const trunc = Math.trunc;
const velOf = (di, sp) => [ trunc(DIR_X[di] * sp / DIR_U),
                            trunc(DIR_Y[di] * sp / DIR_U) ];
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

/* ═══════════════════════════════════════════════════════════════════
   SEEDED RANDOMNESS — st.rs is the whole of it and is read only when a
   round is set up or a ball/drop is spawned (never inside collision).
   The same generator as rummy/poker/briks so the family behaves alike.
   ═══════════════════════════════════════════════════════════════════ */
function rnd(st){
  st.rs = (st.rs + 0x6D2B79F5) | 0;
  let t = st.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/* a pure FNV hash of integers — the machine's "luck" and the drop rolls,
   so every phone rolls the same and a replay is a replay. */
function hash32(list){
  let h = 2166136261;
  for (let i = 0; i < list.length; i++){
    h ^= (list[i] | 0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/* THE ONE Math.random IN THE FILE, and it is NOT in the simulation: a seed
   for a brand-new LOCAL match, exactly as poker/briks. Online takes its
   seed from the relay. */
function newSeed(){ return (Math.random() * 0x7FFFFFFF) | 0; }

/* ═══════════════════════════════════════════════════════════════════
   BILINGUAL TEXT — state carries IDS, never sentences (lang.js rule).
   ═══════════════════════════════════════════════════════════════════ */
const TEXT = {
  'game.name':  { en: 'IL-BALLUN', mt: 'IL-BALLUN' },
  'game.blurb': { en: 'Guard your goal. Bounce the ball into theirs.',
                  mt: 'Ħares il-lasti tiegħek. Aqbeż il-ballun f\'tagħhom.' },
  'ev.hit':     { en: 'Return',        mt: 'Daqqa lura' },
  'ev.wall':    { en: 'Off the jamb',  mt: 'Mal-ġenb' },
  'ev.goal':    { en: 'GOAL!',         mt: 'GOL!' },
  'ev.shield':  { en: 'Shield held',   mt: 'It-tarka żammet' },
  'ev.serve':   { en: 'Ball in play',  mt: 'Il-ballun fil-logħob' },
  'ev.multi':   { en: 'Another ball!', mt: 'Ballun ieħor!' },
  'ev.out':     { en: 'Knocked out',   mt: 'Barra' },
  'ev.catch':   { en: 'Grabbed it',    mt: 'Qabadha' },
  'ev.bash':    { en: 'Bash!',         mt: 'Daqqa!' },
  'ev.bashwhiff':{ en: 'Whiff',        mt: 'Fl-arja' },
  'pu.1':       { en: 'Wider paddle',  mt: 'Raketta usa\'' },
  'pu.2':       { en: 'Slow ball',     mt: 'Ballun bil-mod' },
  'pu.3':       { en: 'Multi-ball',    mt: 'Aktar blalen' },
  'pu.4':       { en: 'Shield',        mt: 'Tarka' },
  'end.win':    { en: 'Last standing', mt: 'L-aħħar wieqaf' },
  'end.time':   { en: 'Time',          mt: 'Ħin' },
  'end.draw':   { en: 'Level',         mt: 'Indaqs' },
  'ai.1':       { en: 'Gentle',        mt: 'Ħelu' },
  'ai.2':       { en: 'Normal',        mt: 'Normali' },
  'ai.3':       { en: 'Ruthless',      mt: 'Aħrax' },
  'mode.lives': { en: 'Last standing', mt: 'L-aħħar wieqaf' },
  'mode.timed': { en: 'Two minutes',   mt: 'Żewġ minuti' },
  'net.wait':   { en: 'Waiting for the other phone',
                  mt: 'Nistennew il-mowbajl l-ieħor' }
};
function text(id){ return TEXT[id] || { en: String(id), mt: String(id) }; }

/* ═══════════════════════════════════════════════════════════════════
   GEOMETRY — pure, no state.  A paddle box, a jamb box, a goal-line box.
   Everything is derived from the edge index so there is one code path for
   all four edges.
   ═══════════════════════════════════════════════════════════════════ */
function laneRange(edge){
  const hi = EDGE_AXIS[edge] === 'x' ? LANE_HI_X : LANE_HI_Y;
  return { lo: LANE_LO, hi };
}
/* the current forward LUNGE reach of a paddle, in subunits.  Zero unless a
   bash is in progress; peaks the tick the bash lands and retracts linearly over
   BASH_LUNGE_T ticks.  Pure integer, in the snapshot via p.lungeT. */
function lungeReach(p){
  if (!p.lungeT || p.lungeT <= 0) return 0;
  return trunc(BASH_LUNGE * p.lungeT / BASH_LUNGE_T);
}
/* the paddle's axis-aligned box.  `pos` is its slide coordinate (centre).  A
   lunging paddle's FRONT face (toward the arena) reaches out by lungeReach(p),
   so a bash physically extends the paddle into the play area as a swept
   obstacle — a ball just in front is caught by the ordinary paddle collision. */
function padBox(p){
  const c = PAD_COORD[p.edge], t = PAD_T >> 1;
  const reach = lungeReach(p);
  /* front is toward the arena = opposite the outward (goal-wall) normal */
  const front = -EDGE_OUT[p.edge] * reach;
  if (EDGE_AXIS[p.edge] === 'x'){
    const y0 = EDGE_OUT[p.edge] > 0 ? c - t + Math.min(0, front) : c - t;
    const y1 = EDGE_OUT[p.edge] > 0 ? c + t : c + t + Math.max(0, front);
    return { x0: p.pos - p.hw, x1: p.pos + p.hw, y0, y1 };
  }
  const x0 = EDGE_OUT[p.edge] > 0 ? c - t + Math.min(0, front) : c - t;
  const x1 = EDGE_OUT[p.edge] > 0 ? c + t : c + t + Math.max(0, front);
  return { x0, x1, y0: p.pos - p.hw, y1: p.pos + p.hw };
}
/* the two solid jambs of an edge: the corner blocks either side of the
   mouth.  Returned as [box0, box1].  These ARE swept obstacles. */
function jambBoxes(edge){
  const g = GOAL_COORD[edge], jt = du(6);   /* jamb thickness into arena    */
  if (EDGE_AXIS[edge] === 'x'){
    const y0 = EDGE_OUT[edge] > 0 ? g - jt : g, y1 = EDGE_OUT[edge] > 0 ? g : g + jt;
    return [ { x0: 0, x1: MOUTH_M, y0, y1 },
             { x0: W - MOUTH_M, x1: W, y0, y1 } ];
  }
  const x0 = EDGE_OUT[edge] > 0 ? g - jt : g, x1 = EDGE_OUT[edge] > 0 ? g : g + jt;
  return [ { x0, x1, y0: 0, y1: MOUTH_M },
           { x0, x1, y0: H - MOUTH_M, y1: H } ];
}
/* the GOAL-LINE box (thin) spanning the mouth, used to detect a score by a
   swept crossing.  A ball entering this box has beaten the paddle. */
function goalBox(edge){
  const g = GOAL_COORD[edge], t = 1;        /* one subunit thick line       */
  if (EDGE_AXIS[edge] === 'x')
    return { x0: MOUTH_M, x1: W - MOUTH_M, y0: g - t, y1: g + t };
  return { x0: g - t, x1: g + t, y0: MOUTH_M, y1: H - MOUTH_M };
}
/* is this edge still a live goal (a paddle with lives), or sealed to wall? */
const alive = p => p.lives > 0;

/* ═══════════════════════════════════════════════════════════════════
   SETUP
   ═══════════════════════════════════════════════════════════════════ */
const DEF_OPTS = { seed: 1, players: 4, mode: 'lives', bots: [1,1,1,1],
                   aiLvl: [2,2,2,2], me: 0, sealEmpty: false };

/* which edges are in play for N players.  We seat opposite edges first so a
   2-player game is a face-off (BOTTOM vs TOP), then LEFT, then RIGHT. */
const SEAT_ORDER = [0, 1, 2, 3];            /* BOTTOM, TOP, LEFT, RIGHT      */

function start(opts){
  opts = opts || {};
  const nPlayers = clamp(opts.players | 0 || 4, 2, 4);
  const mode = opts.mode === 'timed' ? 'timed' : 'lives';
  const st = {
    v: VER,
    seed: (opts.seed | 0) || 1,
    rs: (opts.seed | 0) || 1,
    mode,
    tick: 0,
    boost: 0, boostT: 0,
    slowT: 0,
    nPlayers,
    pads: [],
    balls: [], drops: [],
    nextBall: 0, nextDrop: 0,
    ballAddN: 0, puN: 0,
    inp: [], binp: [],
    serves: [],                            /* pending serves (telegraph + arrow) */
    cornerCd: [0, 0, 0, 0],                /* per-corner debounce after a strike-trigger */
    ev: [], over: null,
    stalls: 0, iterCap: 0,
    sealEmpty: !!opts.sealEmpty
  };
  const bots  = opts.bots  || [1,1,1,1];
  const lvls  = opts.aiLvl || [2,2,2,2];
  /* seat the first nPlayers edges; the rest are either AI paddles or, if
     sealEmpty, plain walls (no paddle, no goal). */
  for (let s = 0; s < N_EDGES; s++){
    const edge = SEAT_ORDER[s];
    const inPlay = s < nPlayers || !st.sealEmpty;
    const isBot = s >= nPlayers ? 1 : (bots[s] | 0);
    const { lo, hi } = laneRange(edge);
    st.pads.push({
      pid: s, edge,
      lo, hi,
      pos: (lo + hi) >> 1, tpos: (lo + hi) >> 1, vpos: 0,
      hw: PAD_HW, wideT: 0,
      spd: isBot ? AI[clamp(lvls[s] | 0 || 2, 1, 3)].spd : PAD_SPEED,
      lives: inPlay ? START_LIVES : 0,       /* 0 lives = sealed wall        */
      inPlay,
      shield: 0,
      bashCd: 0, lungeT: 0,                  /* bash cooldown + lunge timer  */
      bot: isBot, lvl: clamp(lvls[s] | 0 || 2, 1, 3),
      aiAim: (lo + hi) >> 1, aiSeen: -1,
      goals: 0                               /* goals conceded (for tiebreak)*/
    });
    st.inp.push([]);
    st.binp.push([]);
  }
  setupRound(st);
  return st;
}

function setupRound(st){
  st.tick = 0;
  st.boost = 0; st.boostT = 0; st.slowT = 0;
  st.balls = []; st.drops = []; st.serves = [];
  st.cornerCd = [0, 0, 0, 0];
  st.nextBall = 0; st.nextDrop = 0;
  st.ballAddN = 0; st.puN = 0;
  st.ev = []; st.over = null;
  st.stalls = 0; st.iterCap = 0;
  for (const p of st.pads){
    const { lo, hi } = laneRange(p.edge);
    p.lo = lo; p.hi = hi;
    p.hw = PAD_HW; p.wideT = 0; p.vpos = 0; p.shield = 0;
    p.bashCd = 0; p.lungeT = 0;
    p.lives = p.inPlay ? START_LIVES : 0;
    p.goals = 0;
    p.pos = (lo + hi) >> 1; p.tpos = p.pos;
    p.spd = p.bot ? AI[p.lvl].spd : PAD_SPEED;
    p.aiAim = (lo + hi) >> 1; p.aiSeen = -1;
    st.inp[p.pid] = [];
    st.binp[p.pid] = [];
  }
  serve(st, -1);
}

/* the four diagonal-run centres, indexed by quadrant q = which quarter of the
   arena the ball is launched INTO:  0 = down-right, 1 = down-left, 2 = up-left,
   3 = up-right (y grows downward).  Each centre is a legal, off-BOTH-axes
   direction; snap() keeps the ±K_MAX fan inside its run, so a serve can NEVER
   emit an axis-parallel (stuck-rally) or near-zero direction. */
const SERVE_CENTRE = [8, 24, 40, 56];

/* the two quadrants that fire AWAY from an edge's own goal wall (i.e. into
   open play, never straight back into the goal that just conceded).  Indexed
   by edge; each pair is the two SERVE_CENTRE quadrants whose direction points
   into the arena from that edge. */
const AWAY_QUADS = [
  [2, 3],   /* BOTTOM (defends large y): fire UP   -> up-left(2), up-right(3) */
  [0, 1],   /* TOP    (defends small y): fire DOWN -> down-right(0), down-left(1) */
  [0, 3],   /* LEFT   (defends small x): fire RIGHT-> down-right(0), up-right(3) */
  [1, 2]    /* RIGHT  (defends large x): fire LEFT -> down-left(1), up-left(2)  */
];

/* ── CRASH-BASH "BALLISTIX" CORNER SPAWNER ──────────────────────────────
   Balls emerge from the CORNERS, not the centre.  A quadrant q maps to the
   corner OPPOSITE the fire direction, so the ball literally comes OUT of a
   corner heading INWARD along its diagonal:

     q0 down-right(+x,+y) -> TOP-LEFT     corner (0,0)
     q1 down-left (-x,+y) -> TOP-RIGHT    corner (W,0)
     q2 up-left   (-x,-y) -> BOTTOM-RIGHT corner (W,H)
     q3 up-right  (+x,-y) -> BOTTOM-LEFT  corner (0,H)

   Each corner is inset by CORNER_INSET along BOTH axes from the true corner so
   the ball (radius R) starts clear of the corner jamb and travels its diagonal
   into open play.  CORNER_INSET = MOUTH_M puts the origin just inside the jamb
   corner; a serve then eases out of it exactly like a centre serve did.
   CORNERS is indexed by quadrant q (== the corner index), so CORNERS[q] is the
   spawn point for a serve chosen to fire into quadrant q.  Pure integers, in
   the hash via the pending-serve origin — no float, no trig. */
const CORNER_INSET = MOUTH_M;
const CORNERS = [
  { x: CORNER_INSET,     y: CORNER_INSET     },  /* 0 TOP-LEFT     (fires down-right q0) */
  { x: W - CORNER_INSET, y: CORNER_INSET     },  /* 1 TOP-RIGHT    (fires down-left  q1) */
  { x: W - CORNER_INSET, y: H - CORNER_INSET },  /* 2 BOTTOM-RIGHT (fires up-left    q2) */
  { x: CORNER_INSET,     y: H - CORNER_INSET }   /* 3 BOTTOM-LEFT  (fires up-right   q3) */
];
/* the corner a ball is IN when it strikes near it — detected by proximity in
   resolveBall.  A strike triggers a NEW telegraphed serve FROM that same corner
   (its inward diagonal), one per corner at a time, debounced by a per-corner
   cooldown so a single bounce cannot enqueue a swarm. */
const CORNER_ZONE   = MOUTH_M;                 /* strike radius (per axis) of a corner */
const CORNER_SPAWN_DELAY = 24;                 /* telegraph delay for a corner-triggered serve */
const CORNER_CD     = 40;                       /* per-corner debounce after a trigger  */

/* which corner (0..3) a point is within CORNER_ZONE of on BOTH axes, or -1.
   Pure integer box test around each inset corner — no distance, no sqrt. */
function cornerAt(x, y){
  for (let c = 0; c < 4; c++){
    const cc = CORNERS[c];
    if (Math.abs(x - cc.x) <= CORNER_ZONE && Math.abs(y - cc.y) <= CORNER_ZONE) return c;
  }
  return -1;
}
/* a ball struck corner `c` this tick: enqueue ANOTHER telegraphed serve FROM
   that corner (its inward diagonal, seeded ±K fan) after CORNER_SPAWN_DELAY
   ticks, IF room remains (live balls + pending serves < MAX_BALLS) AND no serve
   is already pending FROM that corner AND that corner is off its debounce
   cooldown.  Emits ev.cornerHit for the UI flash.  Deterministic: reads st.rs
   only through serve(), sets a hashed cooldown, and the "already pending"
   guard makes a repeat bounce a no-op.  The struck ball keeps bouncing
   normally — this trigger is ADDITIONAL. */
function triggerCornerSpawn(st, c){
  if (c < 0 || c > 3) return;
  if (st.cornerCd[c] > 0) return;                 /* debounced                    */
  st.ev.push({ id: 'ev.cornerHit', corner: c });  /* UI flash regardless          */
  st.cornerCd[c] = CORNER_CD;
  if (st.balls.length + st.serves.length >= MAX_BALLS) return;   /* respect the cap */
  for (const s of st.serves) if (s.corner === c) return;         /* one per corner  */
  /* serve() picks the quadrant by its own seeded roll; force the corner's own
     inward quadrant by biasing avoidEdge to nothing and passing the corner's
     serverPid as -1, then override the origin to this corner.  Simplest + fully
     deterministic: call serve with a fixed inward direction for THIS corner. */
  serveFromCorner(st, c);
}
/* serve a fresh ball straight out of corner `c` along its inward diagonal, ±K
   seeded fan, after CORNER_SPAWN_DELAY ticks.  Mirrors serve() but pins the
   quadrant to the corner so the ball always heads into open play from it. */
function serveFromCorner(st, c){
  const q = c & 3;                                /* corner c fires quadrant q    */
  const centre = SERVE_CENTRE[q];
  const k = (trunc(rnd(st) * (2 * K_MAX + 1))) - K_MAX;
  const di = snap((centre + k + 64) & 63);
  const ox = CORNERS[c].x, oy = CORNERS[c].y;
  st.serves.push({ originX: ox, originY: oy, dirX: DIR_X[di], dirY: DIR_Y[di],
                   di, sp: SP_START, corner: c, last: -1, ticksLeft: CORNER_SPAWN_DELAY });
  st.ev.push({ id: 'ev.serve' });
}

/* serve ONE ball toward a legal diagonal.  `avoidEdge` (a pid or −1) biases the
   launch AWAY from re-serving straight at the edge that just conceded.
   `serverPid` (a pid or −1): if a valid live seat, the ball is SERVED FROM that
   player's side (their paddle position), fired into open play; otherwise it is
   served from the arena CENTRE (round start / multi-ball spawn).  Reads st.rs —
   the only randomness, so every client serves the identical ball.
   GUARANTEE: every served ball leaves at full serve speed on a valid
   anti-axis-safe diagonal, so it always makes real progress on BOTH axes and
   can never be parked in the middle. */
function serve(st, avoidEdge, serverPid, delay){
  serverPid = (serverPid === undefined) ? -1 : serverPid;
  const fromSeat = serverPid >= 0 && serverPid < N_EDGES && alive(st.pads[serverPid]);

  let q;
  if (fromSeat){
    /* fire AWAY from the server's OWN goal wall (into open play), picking one
       of that edge's two open quadrants by a seeded roll. */
    const opts = AWAY_QUADS[st.pads[serverPid].edge];
    q = opts[trunc(rnd(st) * opts.length) % opts.length];
  } else {
    q = trunc(rnd(st) * 4) & 3;                /* one of four diagonal runs  */
  }
  /* bias away from firing back into the goal that just conceded: if the picked
     quadrant heads toward that edge, rotate to the opposite quadrant. Purely
     integer + deterministic (no new randomness), so every client agrees. */
  if (avoidEdge >= 0 && avoidEdge < N_EDGES){
    const cen = SERVE_CENTRE[q];
    const towardConceder =
      EDGE_AXIS[avoidEdge] === 'x'
        ? (EDGE_OUT[avoidEdge] > 0 ? DIR_Y[cen] > 0 : DIR_Y[cen] < 0)
        : (EDGE_OUT[avoidEdge] > 0 ? DIR_X[cen] > 0 : DIR_X[cen] < 0);
    if (towardConceder) q = (q + 2) & 3;       /* fire into the opposite quad */
  }
  const centre = SERVE_CENTRE[q];              /* diagonal centre index      */
  const k = (trunc(rnd(st) * (2 * K_MAX + 1))) - K_MAX;
  const di = snap((centre + k + 64) & 63);     /* always a legal diagonal    */
  /* SP_START is well above SP_MIN and every allowed di has |DIR_X|,|DIR_Y| >=
     DIAG_MIN, so velOf(di, SP_START) is non-zero on BOTH axes by construction. */
  /* BALLISTIX: the ball emerges from the CORNER opposite the fire direction
     (== quadrant q), heading INWARD along its diagonal.  This replaces the old
     centre origin; the seat-served / round-start / multi-ball paths all now come
     out of a corner.  CORNERS[q] is inset by CORNER_INSET so the ball starts
     clear of the jamb.  The chosen corner is carried on the pending serve so the
     UI lights THAT corner and the debounce keys off it. */
  const corner = q & 3;
  let ox = CORNERS[corner].x, oy = CORNERS[corner].y;
  const dirX = DIR_X[di], dirY = DIR_Y[di];
  const dl = (delay === undefined)
    ? (avoidEdge >= 0 ? SERVE_DELAY : SERVE_DELAY0)   /* post-goal waits longer */
    : (delay | 0);
  /* `last` is seeded to the server so a serve directly into a goal still
     credits a scorer; a fresh corner serve has no owner (-1). */
  st.serves.push({ originX: ox, originY: oy, dirX, dirY, di, sp: SP_START,
                   corner, last: fromSeat ? serverPid : -1, ticksLeft: dl < 0 ? 0 : dl });
  st.ev.push({ id: 'ev.serve' });
}
/* actually put a pending serve's ball into play — it enters with an EASE
   countdown so it accelerates out of the origin instead of teleporting to
   full speed.  Pure integer, deterministic. */
function spawnServe(st, s){
  st.balls.push({ id: st.nextBall++, x: s.originX, y: s.originY,
                  di: s.di, sp: s.sp, last: s.last, ease: BALL_EASE });
}
/* tick down every pending serve; spawn the ones whose telegraph has run out.
   Order is by insertion (deterministic) and index-stable via a rebuild. */
function stepServes(st){
  if (!st.serves.length) return;
  const keep = [];
  for (const s of st.serves){
    if (s.ticksLeft > 0){ s.ticksLeft--; keep.push(s); }
    else { if (st.balls.length < MAX_BALLS) spawnServe(st, s); /* else drop it */ }
  }
  st.serves = keep;
}

/* PICK THE SERVER for a post-goal re-serve.  The rule the user asked for:
   the ball comes from a seeded-RANDOM live player's side, and the player who
   SCORED (deflected the ball into the goal) shoots again.  We reconcile the two
   deterministically:
     · the SCORER is `conceded.last` — the pid that last touched the ball before
       it crossed a goal line.  If that seat is still live, the SCORER SERVES
       (they "shoot again"), exactly as asked.
     · if there is no valid scorer (the ball went in untouched, or the scorer is
       now out), fall back to a SEEDED-RANDOM live player — `rnd(st)` over the
       live seats — so a server always exists and every client agrees.
   Returns a pid, or −1 if no live seat can serve (round is ending anyway). */
function pickServer(st, conceded){
  const scorer = conceded ? conceded.last : -1;
  if (scorer >= 0 && scorer < N_EDGES && alive(st.pads[scorer]) &&
      scorer !== conceded.dead) return scorer;   /* the scorer shoots again   */
  /* seeded-random live player */
  const live = [];
  for (const p of st.pads) if (alive(p)) live.push(p.pid);
  if (!live.length) return -1;
  return live[trunc(rnd(st) * live.length) % live.length];
}

function newRound(st){ setupRound(st); return st; }

/* ═══════════════════════════════════════════════════════════════════
   INPUT-DELAY LOCKSTEP — identical plumbing to briks.  A committed input
   is an absolute paddle target along the lane, tagged with the tick it is
   FOR.  st.inp[pid] is sparse by that tick.  The ball reads nothing here.
   ═══════════════════════════════════════════════════════════════════ */
const D_MIN = 2, D_MAX = 12;
const JITTER_MS = 30;
const BATCH_TICKS = 3;

function delayFor(rttMed, jitMs){
  const rtt = (rttMed | 0) > 0 ? (rttMed | 0) : 100;
  const jm = (jitMs | 0) > 0 ? (jitMs | 0) : JITTER_MS;
  const ms = ((rtt / 2) | 0) + jm;
  let d = ((ms + TICK_MS - 1) / TICK_MS | 0) + BATCH_TICKS;
  return clamp(d, D_MIN, D_MAX);
}
/* the offline / minimum delay, so solo feels identical to online. */
function delayTicks(rttMed, jitMs){
  if (!(rttMed | 0) && !(jitMs | 0)) return D_MIN;
  return delayFor(rttMed, jitMs);
}

function commit(st, pid, forTick, tpos){
  const p = st.pads[pid];
  if (!p) return false;
  if (forTick < st.tick) return false;
  tpos = clamp(tpos | 0, p.lo + p.hw, p.hi - p.hw);
  const have = st.inp[pid][forTick];
  if (have !== undefined && have !== tpos) return false;
  st.inp[pid][forTick] = tpos;
  return true;
}
function sample(st, pid, tpos, D){
  const forTick = st.tick + (D | 0);
  commit(st, pid, forTick, tpos);
  return forTick;
}
/* THE BASH INPUT — rides the SAME lockstep as the paddle target.  A bash for
   tick N is committed here and applied by EVERYONE at N (the UI commits it for
   the current tick + D exactly like the paddle target), so online and offline
   are identical and the ball never reads a local/immediate bash.  st.binp[pid]
   is sparse by tick and holds a 1 at every tick that seat requested a bash.
   Committing is a no-op if a bash is already filed for that (pid,tick). */
function commitBash(st, pid, forTick){
  const p = st.pads[pid];
  if (!p) return false;
  if (forTick < st.tick) return false;
  st.binp[pid][forTick] = 1;
  return true;
}
function sampleBash(st, pid, D){
  const forTick = st.tick + (D | 0);
  commitBash(st, pid, forTick);
  return forTick;
}
/* did seat `pid` commit a bash FOR exactly tick `tick`? (bashes do not persist
   like a target — a bash is a single-tick edge, not a held state). */
function bashAt(st, pid, tick){
  const row = st.binp[pid];
  return row && row[tick] === 1;
}
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
function targetAt(st, pid, tick){
  const row = st.inp[pid];
  for (let t = tick; t >= 0; t--){ if (row[t] !== undefined) return row[t]; }
  return st.pads[pid].tpos;
}
/* all NON-BOT, LIVE seats resolved for the tick about to run?  Bots and
   sealed edges never gate (they produce input internally or none). */
function ready(st){
  const t = st.tick;
  for (const p of st.pads){
    if (p.bot || !alive(p)) continue;
    let found = false;
    const row = st.inp[p.pid];
    for (let k = t; k >= 0; k--){ if (row[k] !== undefined){ found = true; break; } }
    if (!found) return false;
  }
  return true;
}

/* the paddle chase toward tpos at spd, clamped to the lane. SAME function
   step() and ghost() both use. Pure integer, no trig. */
function follow(x, tx, spd, lo, hi){
  let dx = tx - x;
  if (dx > spd) dx = spd; else if (dx < -spd) dx = -spd;
  x += dx;
  if (x < lo) x = lo; else if (x > hi) x = hi;
  return x;
}
/* PREDICTED paddle for the LOCAL seat only — a drawing hint. Writes NOTHING;
   delete it and the sim is byte-identical. */
function ghost(st, pid, upto){
  const p = st.pads[pid];
  const lo = p.lo + p.hw, hi = p.hi - p.hw;
  let x = p.pos;
  const end = Math.min(upto | 0, st.tick + D_MAX);
  for (let t = st.tick; t < end; t++)
    x = follow(x, targetAt(st, pid, t), p.spd, lo, hi);
  return x;
}

/* ═══════════════════════════════════════════════════════════════════
   SWEPT COLLISION — exact rationals, no epsilon.  Verbatim shape of
   briks: axisSpan / sweepBox over cross-multiplied n/d.
   ═══════════════════════════════════════════════════════════════════ */
function rcmp(a, b, c, d){
  const l = a * d, r = c * b;
  return l < r ? -1 : l > r ? 1 : 0;
}
function axisSpan(p0, v, b0, b1){
  if (v === 0){
    const inside = p0 > b0 && p0 < b1;
    return inside ? { in: {n:0,d:1}, out: {n:1,d:1}, par: true } : null;
  }
  let n0 = b0 - p0, n1 = b1 - p0;
  let tin, tout;
  if (v > 0){ tin = {n:n0, d:v}; tout = {n:n1, d:v}; }
  else       { tin = {n:n1, d:v}; tout = {n:n0, d:v}; }
  if (tin.d < 0){ tin = {n:-tin.n, d:-tin.d}; }
  if (tout.d < 0){ tout = {n:-tout.n, d:-tout.d}; }
  return { in: tin, out: tout, par: false };
}
function sweepBox(px, py, vx, vy, x0, y0, x1, y1){
  const sx = axisSpan(px, vx, x0, x1);
  if (!sx) return null;
  const sy = axisSpan(py, vy, y0, y1);
  if (!sy) return null;
  let ein, eax;
  if (sx.par){ ein = sy.in; eax = 2; }
  else if (sy.par){ ein = sx.in; eax = 1; }
  else {
    const c = rcmp(sx.in.n, sx.in.d, sy.in.n, sy.in.d);
    if (c > 0){ ein = sx.in; eax = 1; }
    else if (c < 0){ ein = sy.in; eax = 2; }
    else { ein = sx.in; eax = 3; }
  }
  const eout = (function(){
    if (sx.par) return sy.out;
    if (sy.par) return sx.out;
    return rcmp(sx.out.n, sx.out.d, sy.out.n, sy.out.d) < 0 ? sx.out : sy.out;
  })();
  if (rcmp(ein.n, ein.d, eout.n, eout.d) > 0) return null;
  if (rcmp(ein.n, ein.d, 1, 1) >= 0) return null;
  if (ein.n < 0) return null;
  if (rcmp(eout.n, eout.d, 0, 1) <= 0) return null;
  return { t: ein, ax: eax };
}

/* ═══════════════════════════════════════════════════════════════════
   RESOLVE ONE BALL for one tick — iterated swept resolution.  Same as
   briks: earliest contact among all inflated obstacles, advance to it
   truncating toward the surface, reflect per the tiebreak rules, spend
   the sub-tick, repeat.  Returns a list of events.  A GOAL-LINE crossing
   is recorded (not reflected) and applied by the caller so the ball is
   removed and re-served deterministically.
   ═══════════════════════════════════════════════════════════════════ */
/* the ball's effective per-tick velocity for a direction, applying the SLOW
   power-up AND the serve EASE ramp (both scale the MOVE only, never the stored
   speed, so they are reversible and drift-free).  A ball with ease>0 leaves the
   origin at ENTER_NUM/ENTER_DEN of full and ramps linearly to full over
   BALL_EASE ticks, so it accelerates into play. */
function ballVel(st, ball, di){
  let [vx, vy] = velOf(di, ball.sp);
  if (st.slowT > 0){ vx = trunc(vx * SLOW_NUM / SLOW_DEN); vy = trunc(vy * SLOW_NUM / SLOW_DEN); }
  if (ball.ease > 0){
    /* ease counts down BALL_EASE..1; `grown` counts up 1..BALL_EASE so the
       scale climbs ENTER_NUM/ENTER_DEN → 1 over the ramp (integer, no float). */
    const grown = (BALL_EASE - ball.ease) + 1;           /* 1..BALL_EASE       */
    const sc = ENTER_NUM + trunc((ENTER_DEN - ENTER_NUM) * grown / BALL_EASE);
    vx = trunc(vx * sc / ENTER_DEN); vy = trunc(vy * sc / ENTER_DEN);
  }
  return [vx, vy];
}
function resolveBall(st, ball){
  const events = [];
  let [vx, vy] = ballVel(st, ball, ball.di);
  let px = ball.x, py = ball.y;
  const startX = ball.x, startY = ball.y;      /* for the anti-park floor      */
  let rem = TFP;
  let cornerStruck = -1;                        /* corner hit this tick, or -1  */

  for (let iter = 0; iter < MAX_ITER; iter++){
    const mvx = trunc(vx * rem / TFP);
    const mvy = trunc(vy * rem / TFP);
    if (mvx === 0 && mvy === 0) break;
    if (iter === MAX_ITER - 1) st.iterCap++;

    let best = null;
    const hits = [];
    const consider = (x0, y0, x1, y1, kind, meta) => {
      const h = sweepBox(px, py, mvx, mvy, x0 - R, y0 - R, x1 + R, y1 + R);
      if (!h) return;
      if (best === null || rcmp(h.t.n, h.t.d, best.n, best.d) < 0){
        best = h.t; hits.length = 0; hits.push({ kind, meta, ax: h.ax, t: h.t });
      } else if (rcmp(h.t.n, h.t.d, best.n, best.d) === 0){
        hits.push({ kind, meta, ax: h.ax, t: h.t });
      }
    };

    /* for every edge: if it is a live goal, its two jambs are obstacles and
       its mouth is a goal line; if it is a sealed wall, the WHOLE edge is a
       solid obstacle (the mouth is filled). */
    for (let e = 0; e < N_EDGES; e++){
      const p = st.pads[e];
      const sealed = !alive(p);
      if (sealed){
        /* the whole wall, as one solid slab flush with the goal line */
        const g = GOAL_COORD[e], jt = du(6);
        if (EDGE_AXIS[e] === 'x'){
          const y0 = EDGE_OUT[e] > 0 ? g - jt : g, y1 = EDGE_OUT[e] > 0 ? g : g + jt;
          consider(0, y0, W, y1, 'wall', { edge: e });
        } else {
          const x0 = EDGE_OUT[e] > 0 ? g - jt : g, x1 = EDGE_OUT[e] > 0 ? g : g + jt;
          consider(x0, 0, x1, H, 'wall', { edge: e });
        }
      } else {
        const jb = jambBoxes(e);
        consider(jb[0].x0, jb[0].y0, jb[0].x1, jb[0].y1, 'wall', { edge: e });
        consider(jb[1].x0, jb[1].y0, jb[1].x1, jb[1].y1, 'wall', { edge: e });
        const gl = goalBox(e);
        /* a goal line is a ZERO-bounce trigger: recorded, then handled */
        consider(gl.x0, gl.y0, gl.x1, gl.y1, 'goal', { edge: e });
      }
    }
    /* paddles (only live edges have one) */
    for (const p of st.pads){
      if (!alive(p)) continue;
      const pb = padBox(p);
      consider(pb.x0, pb.y0, pb.x1, pb.y1, 'paddle', { pid: p.pid });
    }

    if (best === null){ px += mvx; py += mvy; break; }

    /* did the EARLIEST contact set include a GOAL? A goal ends this ball's
       tick immediately (it is removed), so we advance to the line and stop. */
    let goalEdge = -1;
    for (const h of hits) if (h.kind === 'goal'){ goalEdge = h.meta.edge; break; }
    const stepX = trunc(mvx * best.n / best.d);
    const stepY = trunc(mvy * best.n / best.d);
    px += stepX; py += stepY;
    if (goalEdge >= 0){
      const saved = applyShield(st, goalEdge);
      if (saved){
        /* the shield ate the goal: reflect off the wall instead of scoring */
        events.push({ id: 'ev.shield', edge: goalEdge });
        if (EDGE_AXIS[goalEdge] === 'x') ball.di = snap(mirY(ball.di));
        else                             ball.di = snap(mirX(ball.di));
        [vx, vy] = ballVel(st, ball, ball.di);
        const spent = trunc(rem * best.n / best.d);
        rem -= spent; if (rem <= 0) break; else continue;
      }
      ball.x = px; ball.y = py;
      events.push({ id: 'ev.goal', edge: goalEdge, ballId: ball.id });
      ball.dead = goalEdge;                 /* the caller scores + removes    */
      return events;
    }

    /* reflect: union of entry axes, each axis flips at most once (briks T2).
       a paddle FACE hit overrides direction (T4/T5/T6). */
    let flipX = false, flipY = false, paddleFace = null;
    for (const h of hits){
      if (h.kind === 'wall'){
        if (h.ax & 1) flipX = true;
        if (h.ax & 2) flipY = true;
        events.push({ id: 'ev.wall', edge: h.meta.edge });
        /* BALLISTIX: a jamb/wall hit inside a corner zone is a CORNER STRIKE —
           record the corner (the trigger fires ONCE after the tick resolves, so
           one bounce cannot enqueue a swarm). px,py is the contact point. */
        const cc = cornerAt(px, py);
        if (cc >= 0) cornerStruck = cc;
      } else if (h.kind === 'paddle'){
        const pp = st.pads[h.meta.pid];
        /* a FRONT-face hit is an entry on the paddle's NORMAL axis, coming
           from the arena side (moving toward the goal wall). TOP/BOTTOM face
           on y; LEFT/RIGHT face on x. A hit from behind (the ball overtook
           the paddle) is a plain mirror that also ejects it. */
        const faceAxis = EDGE_AXIS[pp.edge] === 'x' ? 2 : 1;   /* normal axis */
        const onFace = (h.ax & faceAxis) !== 0;
        const towardGoal = EDGE_AXIS[pp.edge] === 'x'
          ? (EDGE_OUT[pp.edge] > 0 ? vy > 0 : vy < 0)
          : (EDGE_OUT[pp.edge] > 0 ? vx > 0 : vx < 0);
        if (onFace && towardGoal){
          paddleFace = h.meta.pid;
        } else {
          if (h.ax & 1) flipX = true;
          if (h.ax & 2) flipY = true;
        }
      }
    }

    let di = ball.di;
    if (paddleFace !== null){
      di = paddleAngle(st, paddleFace, px, py);
      ball.last = paddleFace;
      escalateHit(st, ball);
      events.push({ id: 'ev.hit', pid: paddleFace });
    } else {
      if (flipX) di = mirX(di);
      if (flipY) di = mirY(di);
    }
    di = snap(di);
    ball.di = di;
    [vx, vy] = ballVel(st, ball, di);

    const spent = trunc(rem * best.n / best.d);
    rem -= spent;
    if (rem <= 0) break;
  }

  ball.x = px; ball.y = py;
  depenetrate(st, ball);
  containBall(st, ball, events);

  /* THE ANTI-PARK FLOOR.  The swept resolver is exact and, in every reachable
     state, always advances the ball; but a pathological wedge (a ball caught
     resolving at sub-tick t=0 against two surfaces until MAX_ITER is spent)
     could otherwise leave a live ball at ZERO net displacement for the tick —
     i.e. parked in place.  Guarantee forward progress: if a still-live ball did
     not move this tick, its speed is floored to SP_MIN and it is nudged one
     guaranteed step along its (always-valid, off-both-axes) direction, then
     re-contained.  Deterministic integer math, identical on every client; it
     is a NO-OP in all reachable rallies, so the lockstep hash is unchanged
     there and a ball can never be stuck in the middle. */
  if (ball.dead === undefined && ball.x === startX && ball.y === startY){
    if (ball.sp < SP_MIN) ball.sp = SP_MIN;
    ball.di = snap(ball.di);
    let [nx, ny] = velOf(ball.di, ball.sp);
    if (st.slowT > 0){ nx = trunc(nx * SLOW_NUM / SLOW_DEN); ny = trunc(ny * SLOW_NUM / SLOW_DEN); }
    /* velOf on any allowed di at >= SP_MIN is non-zero on both axes, but floor
       the step to at least one subunit per axis as a belt-and-braces guard. */
    if (nx === 0) nx = DIR_X[ball.di] > 0 ? 1 : -1;
    if (ny === 0) ny = DIR_Y[ball.di] > 0 ? 1 : -1;
    ball.x += nx; ball.y += ny;
    st.stalls++;                               /* count it for the test proof */
    depenetrate(st, ball);
    containBall(st, ball, events);
  }

  /* BALLISTIX CORNER TRIGGER — fire ONCE per tick per ball if it struck a corner
     (a swept jamb hit inside a corner zone), OR if a wall event fired this tick
     and the ball came to rest inside a corner zone (the containBall reflection
     path).  The ball is still alive here (a goal returned earlier), so a corner
     strike never coincides with a score.  Deterministic + debounced inside
     triggerCornerSpawn; a no-op when the corner is on cooldown or the arena is
     already full. */
  if (ball.dead === undefined){
    let c = cornerStruck;
    if (c < 0){
      let wall = false;
      for (const e of events) if (e.id === 'ev.wall'){ wall = true; break; }
      if (wall) c = cornerAt(ball.x, ball.y);
    }
    if (c >= 0) triggerCornerSpawn(st, c);
  }
  return events;
}

/* THE HARD FLOOR against tunnelling.  The swept test is exact, but a ball
   that ends a tick resting AT or just inside a jamb / sealed-wall corner
   (a truncation landing on the surface, or a paddle shove) would, next
   tick, find no swept ENTRY (it is already inside) and pass through.  So
   after every resolve we CONTAIN the ball: for each edge, if the ball has
   crossed that edge's goal-line coordinate but is NOT within the mouth
   span, it is behind solid geometry — snap it back to the inner face and
   mirror the perpendicular direction.  A ball inside the mouth span that
   crossed the line was already scored above (b.dead) and removed, so this
   only ever fires on a jamb/wall, never on a legitimate goal.  Pure
   integer, no search: at most four cheap comparisons. */
function containBall(st, ball, events){
  if (ball.dead !== undefined) return;
  for (let e = 0; e < N_EDGES; e++){
    const p = st.pads[e];
    const g = GOAL_COORD[e];
    const inMouth = EDGE_AXIS[e] === 'x'
      ? (ball.x > MOUTH_M - R && ball.x < W - MOUTH_M + R)
      : (ball.y > MOUTH_M - R && ball.y < H - MOUTH_M + R);
    /* the ball is "past" the line if it reached the goal-wall side of it */
    const axisX = EDGE_AXIS[e] === 'x';
    const coord = axisX ? ball.y : ball.x;
    const past = EDGE_OUT[e] > 0 ? (coord > g - R) : (coord < g + R);
    if (!past) continue;
    if (alive(p) && inMouth){
      /* a REAL goal the swept line-test missed (the ball began the tick
         already past the line, so there was no entry to catch).  Score it
         here so the ball can never sit behind an open mouth OOB.  The
         shield still gets its save. */
      if (applyShield(st, e)){
        /* bounce off the goal plane instead of scoring */
        if (axisX){ ball.y = EDGE_OUT[e] > 0 ? (g - R - 1) : (g + R + 1);
                    if ((EDGE_OUT[e] > 0) === (DIR_Y[ball.di] > 0)) ball.di = snap(mirY(ball.di)); }
        else       { ball.x = EDGE_OUT[e] > 0 ? (g - R - 1) : (g + R + 1);
                    if ((EDGE_OUT[e] > 0) === (DIR_X[ball.di] > 0)) ball.di = snap(mirX(ball.di)); }
        events.push({ id: 'ev.shield', edge: e });
        continue;
      }
      events.push({ id: 'ev.goal', edge: e, ballId: ball.id });
      ball.dead = e;
      return;
    }
    /* behind a JAMB or a SEALED wall — reflect back to the inner face. */
    if (axisX){
      ball.y = EDGE_OUT[e] > 0 ? (g - R - 1) : (g + R + 1);
      if ((EDGE_OUT[e] > 0) === (DIR_Y[ball.di] > 0)){
        ball.di = snap(mirY(ball.di));
        events.push({ id: 'ev.wall', edge: e });
      }
    } else {
      ball.x = EDGE_OUT[e] > 0 ? (g - R - 1) : (g + R + 1);
      if ((EDGE_OUT[e] > 0) === (DIR_X[ball.di] > 0)){
        ball.di = snap(mirX(ball.di));
        events.push({ id: 'ev.wall', edge: e });
      }
    }
  }
}

/* briks T10 — eject a ball a paddle swept onto, out its front face. */
function depenetrate(st, ball){
  for (const p of st.pads){
    if (!alive(p)) continue;
    const pb = padBox(p);
    if (ball.x > pb.x0 - R && ball.x < pb.x1 + R &&
        ball.y > pb.y0 - R && ball.y < pb.y1 + R){
      if (EDGE_AXIS[p.edge] === 'x'){
        /* front face is toward the arena (away from the goal wall) */
        if (EDGE_OUT[p.edge] > 0){ ball.y = pb.y0 - R - 1; if (DIR_Y[ball.di] > 0) ball.di = snap(mirY(ball.di)); }
        else                     { ball.y = pb.y1 + R + 1; if (DIR_Y[ball.di] < 0) ball.di = snap(mirY(ball.di)); }
      } else {
        if (EDGE_OUT[p.edge] > 0){ ball.x = pb.x0 - R - 1; if (DIR_X[ball.di] > 0) ball.di = snap(mirX(ball.di)); }
        else                     { ball.x = pb.x1 + R + 1; if (DIR_X[ball.di] < 0) ball.di = snap(mirX(ball.di)); }
      }
    }
  }
}

/* THE PADDLE ANGLE RULE.  Where on the FACE the ball hits selects an index
   from the fan around the edge's outward base.  Contact offset from paddle
   centre (along the slide axis) → a bucket in [-K_MAX,K_MAX]; incoming
   lateral drift adds a little ENGLISH.  Pure integer, no trig.  The result
   is always in the allowed diagonal run (FAN_BASE±K_MAX are the run ends). */
function paddleAngle(st, pid, bx, by){
  const p = st.pads[pid];
  const slide = EDGE_AXIS[p.edge] === 'x' ? bx : by;   /* contact along lane */
  let off = slide - p.pos;                              /* -hw..+hw           */
  let k = trunc(off * K_MAX / p.hw);
  if (k > K_MAX) k = K_MAX; else if (k < -K_MAX) k = -K_MAX;
  /* a touch of english from the ball's incoming drift along the lane */
  const [dvx, dvy] = velOf(st.balls.length ? st.balls[0].di : 0, 1024);
  const lateral = EDGE_AXIS[p.edge] === 'x' ? dvx : dvy;
  if (lateral > 200) k = clamp(k + ENGLISH, -K_MAX, K_MAX);
  else if (lateral < -200) k = clamp(k - ENGLISH, -K_MAX, K_MAX);

  const base = FAN_BASE[p.edge];
  /* index increases counter-clockwise from +x.  For each base, growing the
     slide offset should steer the rebound toward larger slide coordinate;
     the sign per edge is baked so all four fans open consistently. */
  let di;
  switch (p.edge){
    case 0: di = (base + k + 64) & 63; break;   /* BOTTOM, base 48 (up)      */
    case 1: di = (base - k + 64) & 63; break;   /* TOP,    base 16 (down)    */
    case 2: di = (base - k + 64) & 63; break;   /* LEFT,   base 0  (+x)      */
    default:di = (base + k + 64) & 63; break;   /* RIGHT,  base 32 (−x)      */
  }
  return snap(di);
}

/* ═══════════════════════════════════════════════════════════════════
   THE BASH — a committed per-seat push, applied AFTER paddles move and
   BEFORE the balls resolve so the lunge box is a live obstacle this tick.
   Runs for every seat in pid order (deterministic).  A live, off-cooldown
   seat that requested a bash for THIS tick lunges and power-hits; the bash
   always consumes the cooldown even on a whiff.
   ═══════════════════════════════════════════════════════════════════ */
/* does the machine want to bash this tick?  Deterministic rule: off cooldown,
   and a ball heading toward this edge is within BASH_RANGE in front and within
   BASH_HALF laterally.  Pure function of the state → replays bit-identical. */
function aiWantsBash(st, p){
  if (p.bashCd > 0) return false;
  const c = PAD_COORD[p.edge], axisX = EDGE_AXIS[p.edge] === 'x';
  for (const b of st.balls){
    const along = axisX ? b.x : b.y;
    const into  = axisX ? b.y : b.x;
    if (Math.abs(along - p.pos) > BASH_HALF + p.hw) continue;
    /* distance in front of the face, on the arena side */
    const front = EDGE_OUT[p.edge] > 0 ? (c - into) : (into - c);
    if (front < 0 || front > BASH_RANGE) continue;
    /* only bash a ball actually coming AT us (else let it fly past) */
    const toward = axisX
      ? (EDGE_OUT[p.edge] > 0 ? DIR_Y[b.di] > 0 : DIR_Y[b.di] < 0)
      : (EDGE_OUT[p.edge] > 0 ? DIR_X[b.di] > 0 : DIR_X[b.di] < 0);
    if (toward) return true;
  }
  return false;
}
/* apply one seat's bash if it fired one this tick and is off cooldown. */
function bashPad(st, p){
  const fire = p.bot ? aiWantsBash(st, p) : bashAt(st, p.pid, st.tick);
  if (!fire || p.bashCd > 0) return;
  p.bashCd = p.bot ? BASH_AI_CD : BASH_CD;
  p.lungeT = BASH_LUNGE_T;
  const c = PAD_COORD[p.edge], axisX = EDGE_AXIS[p.edge] === 'x';
  const cap = Math.min(SP_MAX + st.boost, SP_HARD);
  let hitAny = false;
  for (const b of st.balls){
    if (b.dead !== undefined) continue;
    const along = axisX ? b.x : b.y;
    const into  = axisX ? b.y : b.x;
    if (Math.abs(along - p.pos) > BASH_HALF + p.hw) continue;
    const front = EDGE_OUT[p.edge] > 0 ? (c - into) : (into - c);
    if (front < -R || front > BASH_RANGE) continue;      /* not in front / range */
    /* POWER-HIT: boost speed (clamped to the ceiling) and re-aim OUTWARD via
       the paddle's own fan, so the ball is knocked away from the paddle toward
       open play — never back through the paddle. */
    b.sp = clamp(b.sp + BASH_BOOST, SP_MIN, cap);
    b.di = paddleAngle(st, p.pid, b.x, b.y);
    b.last = p.pid;                          /* credit the basher for a re-serve  */
    b.ease = 0;                              /* a bashed ball flies at full speed */
    hitAny = true;
  }
  st.ev.push({ id: hitAny ? 'ev.bash' : 'ev.bashwhiff', pid: p.pid });
}
function bashPads(st){
  for (const p of st.pads){ if (alive(p)) bashPad(st, p); }
}

/* ═══════════════════════════════════════════════════════════════════
   ESCALATION, SCORING, POWER-UPS
   ═══════════════════════════════════════════════════════════════════ */
function escalateHit(st, ball){
  const cap = Math.min(SP_MAX + st.boost, SP_HARD);
  ball.sp = clamp(ball.sp + ESC_HIT, SP_MIN, cap);
}
function escalateTick(st){
  if (st.tick % ESC_EVERY !== 0) return;
  const cap = Math.min(SP_MAX + st.boost, SP_HARD);
  for (const b of st.balls) b.sp = clamp(b.sp + ESC_TICK, SP_MIN, cap);
}

/* a ball crossed edge `e`'s goal.  −1 life; if that empties it, seal the
   edge and emit ev.out.  Returns nothing; the caller removes the ball and
   re-serves. */
function scoreGoal(st, e){
  const p = st.pads[e];
  if (!alive(p)) return;
  p.lives -= 1;
  p.goals += 1;
  if (p.lives <= 0){
    p.lives = 0;
    st.ev.push({ id: 'ev.out', edge: e });
  }
}
/* the SHIELD saves one goal: consumed here, returns true if it ate it. */
function applyShield(st, e){
  const p = st.pads[e];
  if (p && p.shield > 0){ p.shield -= 1; return true; }
  return false;
}

/* a power-up drops from centre on a timer and drifts to a pseudo-random
   edge; the first paddle it touches takes it. */
function maybeSpawnPU(st){
  if (st.tick < PU_START) return;
  const due = ((st.tick - PU_START) / PU_EVERY | 0) + 1;
  if (due <= st.puN) return;
  st.puN = due;
  const roll = hash32([st.seed, st.tick, 0x9E3779B9]) % PU_TOTAL;
  let acc = 0, kind = PU.WIDE;
  for (const [k, wt] of PU_WEIGHT){ acc += wt; if (roll < acc){ kind = k; break; } }
  /* pick a live target edge deterministically, drift toward it */
  const live = st.pads.filter(alive);
  if (!live.length) return;
  const tgt = live[hash32([st.seed, st.tick, 0x51ED270B]) % live.length];
  const bx = W >> 1, by = H >> 1;
  const gx = EDGE_AXIS[tgt.edge] === 'x' ? tgt.pos : PAD_COORD[tgt.edge];
  const gy = EDGE_AXIS[tgt.edge] === 'x' ? PAD_COORD[tgt.edge] : tgt.pos;
  /* unit-ish integer velocity toward the target (baked, no sqrt): use the
     dominant axis so it drifts sensibly without normalising. */
  let vx = 0, vy = 0;
  const dx = gx - bx, dy = gy - by;
  if (Math.abs(dx) >= Math.abs(dy)){ vx = dx > 0 ? PU_V : -PU_V; vy = dx !== 0 ? trunc(dy * PU_V / Math.abs(dx)) : 0; }
  else { vy = dy > 0 ? PU_V : -PU_V; vx = dy !== 0 ? trunc(dx * PU_V / Math.abs(dy)) : 0; }
  st.drops.push({ id: st.nextDrop++, kind, x: bx, y: by, vx, vy });
}
function stepDrops(st){
  for (let i = st.drops.length - 1; i >= 0; i--){
    const d = st.drops[i];
    d.x += d.vx; d.y += d.vy;
    let done = false;
    for (const p of st.pads){
      if (!alive(p)) continue;
      const pb = padBox(p);
      if (d.x >= pb.x0 - PU_HW && d.x <= pb.x1 + PU_HW &&
          d.y >= pb.y0 - PU_HW && d.y <= pb.y1 + PU_HW){
        applyPowerUp(st, p, d.kind); done = true; break;
      }
    }
    if (d.x < 0 || d.x > W || d.y < 0 || d.y > H) done = true;
    if (done) st.drops.splice(i, 1);
  }
}
function applyPowerUp(st, pad, kind){
  st.ev.push({ id: 'ev.catch', pid: pad.pid, pu: kind });
  st.ev.push({ id: 'pu.' + kind });
  if (kind === PU.WIDE){
    pad.hw = PAD_HW_WIDE; pad.wideT = WIDE_TICKS;
    pad.pos = clamp(pad.pos, pad.lo + pad.hw, pad.hi - pad.hw);
    pad.tpos = clamp(pad.tpos, pad.lo + pad.hw, pad.hi - pad.hw);
  } else if (kind === PU.SLOW){
    st.slowT = SLOW_TICKS;
  } else if (kind === PU.SHIELD){
    pad.shield = SHIELD_HITS;
  } else if (kind === PU.MULTI){
    if (st.balls.length < MAX_BALLS){
      const src = st.balls.length ? st.balls[0] : { x: W>>1, y: H>>1, di: 8, sp: SP_START };
      /* the split ball mirrors the source across x — snap() keeps it inside the
         allowed diagonal set (never an axis), and the speed is floored to
         SP_MIN, so the extra ball always has non-zero motion on both axes. */
      const di = snap(mirX(src.di));
      const sp = clamp(src.sp | 0, SP_MIN, SP_HARD) || SP_START;
      st.balls.push({ id: st.nextBall++, x: src.x, y: src.y, di, sp, last: -1 });
      st.ev.push({ id: 'ev.multi' });
    }
  }
}

/* multi-ball escalation over time, so a round cannot stalemate. */
function maybeAddBall(st){
  if (st.tick < BALL_ADD_START) return;
  const due = ((st.tick - BALL_ADD_START) / BALL_ADD_EVERY | 0) + 1;
  if (due <= st.ballAddN) return;
  st.ballAddN = due;
  if (st.balls.length + st.serves.length >= MAX_BALLS) return;
  serve(st, -1);
  st.ev.push({ id: 'ev.multi' });
}

function decayTimers(st){
  for (const p of st.pads){
    if (p.wideT > 0 && --p.wideT === 0){
      p.hw = PAD_HW;
      p.pos = clamp(p.pos, p.lo + p.hw, p.hi - p.hw);
      p.tpos = clamp(p.tpos, p.lo + p.hw, p.hi - p.hw);
    }
    if (p.bashCd > 0) p.bashCd--;            /* bash cooldown counts down         */
    if (p.lungeT > 0) p.lungeT--;            /* the lunge retracts                */
  }
  if (st.boostT > 0 && --st.boostT === 0) st.boost = 0;
  if (st.slowT > 0) st.slowT--;
  /* corner-strike debounce cooldowns count down (deterministic, hashed) */
  for (let c = 0; c < 4; c++) if (st.cornerCd[c] > 0) st.cornerCd[c]--;
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — pure function of the state, never a perfect interceptor.
   ═══════════════════════════════════════════════════════════════════ */
function think(st, pid){
  const p = st.pads[pid];
  if (!alive(p)) return p.pos;
  const cfg = AI[p.lvl] || AI[2];
  const lo = p.lo + p.hw, hi = p.hi - p.hw;
  if (p.aiAim === undefined){ p.aiAim = (p.lo + p.hi) >> 1; p.aiSeen = -1; }

  const react = cfg.react > 0 ? cfg.react : 1;
  if (((st.tick + pid) % react) !== 0) return clamp(p.aiAim, lo, hi);

  /* pick the nearest ball heading toward THIS edge's goal */
  let target = null, bestDist = 1 << 30;
  const face = PAD_COORD[p.edge];
  for (const b of st.balls){
    let toward, d;
    if (EDGE_AXIS[p.edge] === 'x'){
      toward = EDGE_OUT[p.edge] > 0 ? DIR_Y[b.di] > 0 : DIR_Y[b.di] < 0;
      d = EDGE_OUT[p.edge] > 0 ? (face - b.y) : (b.y - face);
    } else {
      toward = EDGE_OUT[p.edge] > 0 ? DIR_X[b.di] > 0 : DIR_X[b.di] < 0;
      d = EDGE_OUT[p.edge] > 0 ? (face - b.x) : (b.x - face);
    }
    if (!toward || d < 0) continue;
    if (d < bestDist){ bestDist = d; target = b; }
  }
  if (!target){
    p.aiAim = (p.lo + p.hi) >> 1;
    return clamp(p.aiAim, lo, hi);
  }

  let [vx, vy] = velOf(target.di, target.sp);
  if (st.slowT > 0){ vx = trunc(vx * SLOW_NUM / SLOW_DEN); vy = trunc(vy * SLOW_NUM / SLOW_DEN); }
  const alongV = EDGE_AXIS[p.edge] === 'x' ? vx : vy;   /* motion along lane  */
  const intoV  = EDGE_AXIS[p.edge] === 'x' ? vy : vx;   /* motion toward us   */
  const alongP = EDGE_AXIS[p.edge] === 'x' ? target.x : target.y;
  const intoP  = EDGE_AXIS[p.edge] === 'x' ? target.y : target.x;

  let aimX;
  if (cfg.mode === 0){
    aimX = alongP;                                       /* ĦELU: where it IS */
  } else {
    const dInto = EDGE_OUT[p.edge] > 0 ? (face - intoP) : (intoP - face);
    const speedInto = Math.abs(intoV) || 1;
    const tt = Math.max(0, (dInto * TFP / speedInto) | 0);
    let projX = alongP + trunc(alongV * tt / TFP);
    if (cfg.mode >= 2){
      const span = EDGE_AXIS[p.edge] === 'x' ? W : H;
      projX = foldSpan(projX, span);                     /* fold the walls    */
    }
    aimX = projX;
  }
  if (cfg.err > 0){
    const win = (st.tick / react) | 0;
    const j = (hash32([st.seed, win, pid, target.id]) % (2 * cfg.err + 1)) - cfg.err;
    aimX += j;
  }
  p.aiAim = clamp(aimX, lo, hi);
  return p.aiAim;
}
function foldSpan(x, span){
  if (span <= 0) return 0;
  let m = x % (2 * span); if (m < 0) m += 2 * span;
  return m <= span ? m : 2 * span - m;
}
/* input the UI's owned-AI path commits: an AI returns its target directly. */
function aiTarget(st, pid){ return think(st, pid); }

/* ═══════════════════════════════════════════════════════════════════
   THE TICK.  Order is fixed (briks T9/T10):
     1 bot flips   2 paddles move   3 balls resolve (ascending id, swept)
     4 goals scored + balls re-served   5 drops   6 escalation/timers/PU
     7 end conditions   8 advance tick
   ═══════════════════════════════════════════════════════════════════ */
function movePads(st){
  for (const p of st.pads){
    if (!alive(p)) continue;
    const lo = p.lo + p.hw, hi = p.hi - p.hw;
    let tx = p.bot ? think(st, p.pid) : targetAt(st, p.pid, st.tick);
    p.tpos = clamp(tx, lo, hi);
    const nx = follow(p.pos, p.tpos, p.spd, lo, hi);
    p.vpos = nx - p.pos;
    p.pos = nx;
  }
}
function step(st){
  if (st.over) return st;
  if (!ready(st)){ st.stalls++; return st; }

  applyBotFlips(st);
  movePads(st);

  st.ev = [];
  bashPads(st);              /* commit bashes: lunge the paddle + power-hit balls */
  st.balls.sort((a, b) => a.id - b.id);
  const scored = [];
  for (const b of st.balls){
    const evs = resolveBall(st, b);
    for (const e of evs) st.ev.push(e);
    if (b.dead !== undefined) scored.push(b);
    else if (b.ease > 0) b.ease--;         /* ramp: this ball just moved a tick */
  }
  /* apply goals, remove the scored balls, then RE-SERVE per Ballistix: the
     scorer (who deflected it in) shoots again, from a seeded-random live side
     if there is no valid scorer. We re-serve exactly one ball per conceded
     goal so the arena stays populated, capped at MAX_BALLS, and always keep at
     least one ball in play. */
  if (scored.length){
    for (const b of scored){ scoreGoal(st, b.dead); }
    st.balls = st.balls.filter(b => b.dead === undefined);
    /* re-serve in id order for determinism; pickServer reads st.rs each time.
       Each re-serve is now a DELAYED, telegraphed PENDING SERVE (SERVE_DELAY
       ticks) so the ball does not snap back to centre instantly — the player
       sees the arrow and where it comes from before it enters. The cap counts
       live balls PLUS already-pending serves so we never over-queue. */
    for (const b of scored){
      if (st.balls.length + st.serves.length >= MAX_BALLS) break;
      const server = pickServer(st, b);
      serve(st, b.dead, server);           /* SERVE_DELAY (post-goal) telegraph  */
    }
    /* keep at least one ball IN FLIGHT OR ON THE WAY */
    if (st.balls.length === 0 && st.serves.length === 0)
      serve(st, scored[0].dead, pickServer(st, scored[0]));
  }

  stepServes(st);            /* spawn any telegraphed serve whose timer ran out  */
  stepDrops(st);
  escalateTick(st);
  maybeAddBall(st);
  maybeSpawnPU(st);
  decayTimers(st);
  checkEnd(st);

  st.tick++;
  return st;
}

function livingEdges(st){ return st.pads.filter(alive).length; }

function checkEnd(st){
  if (st.mode === 'timed'){
    const cap = TICK_HZ * 120;                 /* two minutes                 */
    if (st.tick >= cap){ finishByLives(st, 'end.time'); return; }
  } else {
    /* LAST STANDING: down to one live edge (of the seated ones) ends it. */
    const started = st.pads.filter(p => p.inPlay).length;
    if (started >= 2 && livingEdges(st) <= 1){ finishByLives(st, 'end.win'); return; }
  }
  if (st.tick >= ROUND_MAX){ finishByLives(st, 'end.time'); }
}
/* winner = the seated edge with the MOST lives; ties broken by FEWEST goals
   conceded, then lowest pid. Deterministic, total order. */
function finishByLives(st, reason){
  let best = null;
  for (const p of st.pads){
    if (!p.inPlay) continue;
    if (best === null) { best = p; continue; }
    if (p.lives > best.lives) best = p;
    else if (p.lives === best.lives){
      if (p.goals < best.goals) best = p;
      else if (p.goals === best.goals && p.pid < best.pid) best = p;
    }
  }
  /* a genuine draw (all seated equal on lives AND goals) reports −1 */
  let tie = true;
  for (const p of st.pads){
    if (!p.inPlay || p === best) continue;
    if (p.lives !== best.lives || p.goals !== best.goals){ tie = false; break; }
  }
  const seated = st.pads.filter(p => p.inPlay).length;
  const winner = (tie && seated > 1) ? -1 : (best ? best.pid : -1);
  st.over = { winner, reason };
}

/* ═══════════════════════════════════════════════════════════════════
   INVARIANTS — check() asserts them every tick in tests.
   ═══════════════════════════════════════════════════════════════════ */
function check(st){
  const errs = [];
  const cap = Math.min(SP_MAX + st.boost, SP_HARD);
  for (const b of st.balls){
    if (b.x < -R * 2 || b.x > W + R * 2 || b.y < -R * 2 || b.y > H + R * 2)
      errs.push('ball OOB ' + b.id + ' ' + b.x + ',' + b.y);
    if (b.sp < SP_MIN || b.sp > SP_HARD) errs.push('ball speed ' + b.sp);
    if (Math.abs(DIR_X[b.di]) < DIAG_MIN || Math.abs(DIR_Y[b.di]) < DIAG_MIN)
      errs.push('ball near-axis di=' + b.di);
    if (snap(b.di) !== b.di) errs.push('ball di not snapped ' + b.di);
  }
  for (const p of st.pads){
    if (p.lives < 0) errs.push('neg lives ' + p.pid);
    if (alive(p) && (p.pos < p.lo + p.hw - 1 || p.pos > p.hi - p.hw + 1))
      errs.push('pad OOB ' + p.pid);
  }
  if (st.balls.length > MAX_BALLS) errs.push('too many balls');
  return errs;
}

/* ═══════════════════════════════════════════════════════════════════
   REPRODUCIBILITY — a canonical hash of the whole state for the proof.
   ═══════════════════════════════════════════════════════════════════ */
function snapshot(st){
  const a = [ st.tick, st.rs, st.boost, st.boostT, st.slowT,
              st.ballAddN, st.puN, st.nextBall, st.nextDrop ];
  const balls = st.balls.slice().sort((x, y) => x.id - y.id);
  /* b.ease is part of the sim (it scales the move), so it must be hashed */
  for (const b of balls) a.push(b.id, b.x, b.y, b.di, b.sp, b.last, b.ease | 0);
  a.push(0x7fffffff);
  /* p.bashCd and p.lungeT are sim state (cooldown gates the bash, lunge grows
     the collision box), so they are hashed — a desync in either is detectable. */
  for (const p of st.pads.slice().sort((x, y) => x.pid - y.pid))
    a.push(p.pid, p.pos, p.tpos, p.vpos, p.hw, p.wideT, p.lives, p.goals, p.shield, p.bot,
           p.bashCd | 0, p.lungeT | 0);
  a.push(0x7ffffffe);
  for (const d of st.drops.slice().sort((x, y) => x.id - y.id))
    a.push(d.id, d.kind, d.x, d.y, d.vx, d.vy);
  /* PENDING SERVES — the telegraph is engine state (its timer counts down in
     the sim and the spawn is deterministic), so hash it for desync detection. */
  a.push(0x7ffffffd);
  for (const s of st.serves)
    a.push(s.originX, s.originY, s.dirX, s.dirY, s.di, s.sp, s.last, s.ticksLeft, s.corner | 0);
  /* BALLISTIX corner-strike debounce cooldowns are sim state (they gate the next
     corner-triggered spawn), so hash them — a desync in any is detectable. */
  a.push(0x7ffffffc);
  for (let c = 0; c < 4; c++) a.push(st.cornerCd[c] | 0);
  a.push(st.over ? (st.over.winner + 2) : 0);
  return hash32(a);
}

/* ═══════════════════════════════════════════════════════════════════
   WIRE — a paddle input is an absolute lane target for a tick.  Target
   fits the arena (W = H = 19200 subunits < 65535) so it is two bytes,
   poker.js's byte-splitting shape.
   ═══════════════════════════════════════════════════════════════════ */
const WIRE_FIELDS = ['t', 'k', 'h', 'l'];
function encWire(mv){
  if (!mv) return null;
  if (mv.t === 'bot') return { t: 'bot', k: mv.forTick | 0, on: mv.on ? 1 : 0 };
  if (mv.t === 'tx'){
    const x = clamp(mv.tpos | 0, 0, Math.max(W, H)), tk = mv.forTick | 0;
    return { t: 'tx', k: tk, h: (x >> 8) & 255, l: x & 255 };
  }
  /* the BASH: a single-bit input for a tick, tagged with the tick it is FOR —
     the same commit/apply-at-N shape as a target move. */
  if (mv.t === 'bx') return { t: 'bx', k: mv.forTick | 0 };
  return null;
}
function decWire(w){
  if (!w || typeof w.t !== 'string') return null;
  if (w.t === 'bot') return { t: 'bot', forTick: w.k | 0, on: w.on ? 1 : 0 };
  if (w.t === 'tx') return { t: 'tx', forTick: w.k | 0,
                             tpos: ((w.h | 0) << 8) + (w.l | 0) };
  if (w.t === 'bx') return { t: 'bx', forTick: w.k | 0 };
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — js/ballun-ui.js and the test harness read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_BALLUN = root.KARTI_BALLUN || {};
root.KARTI_BALLUN.engine = {
  /* lifecycle */
  start, setupRound, newRound, serve, step,
  /* lockstep / input */
  delayFor, delayTicks, commit, sample, setBot, ready, ghost, follow, targetAt,
  commitBash, sampleBash, bashAt,
  /* ai */
  think, aiTarget,
  /* introspection for the UI */
  check, snapshot, text, padBox, jambBoxes, goalBox, laneRange, paddleAngle,
  livingEdges, alive, lungeReach,
  /* wire */
  encWire, decWire, WIRE_FIELDS,
  /* helpers for the UI's predictive draw / geometry */
  velOf, DIR_X, DIR_Y, mirX, mirY, snap, foldSpan,
  /* constants the UI needs to lay out the arena */
  consts: {
    S, W, H, R, TICK_HZ, TICK_MS, N_EDGES, EDGE_AXIS, EDGE_OUT,
    GOAL_COORD, PAD_COORD, MOUTH_M, PAD_HW, PAD_HW_WIDE, PAD_T, PAD_GAP,
    WALL_M, LANE_LO, LANE_HI_X, LANE_HI_Y,
    SP_MIN, SP_START, SP_MAX, SP_HARD, START_LIVES, MAX_BALLS,
    PU, D_MIN, D_MAX, VER, SEAT_ORDER,
    SERVE_DELAY, SERVE_DELAY0, BALL_EASE, BASH_CD, BASH_RANGE, BASH_HALF, BASH_LUNGE
  },
  /* seat range for the lobby */
  MIN_SEATS: 2, MAX_SEATS: 4
};

})(typeof window !== 'undefined' ? window : globalThis);
