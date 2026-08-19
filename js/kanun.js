/* ═══════════════════════════════════════════════════════════════════
   KARTI — kanun.js
   IL-KANUN — the engine for the throwing game. Rules and physics only:
   no DOM, no canvas, no clock, no registration. The screen half is a
   later job and will read exactly the face at the bottom of this file.

   The name: il-kanun is Maltese for the cannon. It reads well next to
   klabb / skarta / tombla and it is what the players will call it.
   (Considered and dropped: `raft.js` — English, and this is not a
   raft; `tefgha.js` — "throw", but that is what the MOVE is called
   here, and a file should not be named after one of its own fields.)

   THE GAME  (the reference is RAFT WARS, played Maltese)
     Two castles face each other across a moat. Three of your lot in
     each courtyard, a wall and a tower and a parapet in front of
     them, and a ruined pillar in the middle of the moat that is
     there to be banked off. You take turns throwing things at each
     other, and BETWEEN throws you spend what you have earned on
     better things to throw and better things to hide behind.
     Whoever is still standing when the other side is in the moat,
     wins.

   ── AIMING IS A DRAG, NOT TWO SLIDERS ─────────────────────────────
     You pull back from your character and let go. THE DRAG VECTOR IS
     THE SHOT. So a move is not {angle, power} — it is

         { w, dx, dy }        w = weapon id, dx/dy = the drag,
                              two SIGNED BYTES, -127..127

     and the launch velocity is exactly (dx/64, dy/64) cells per step.
     Dividing by 64 is exact in binary floating point, so the velocity
     a phone starts with is bit-for-bit the velocity every other phone
     starts with. Quantising happens on INPUT — the finger gives a
     float, `dragOf()` rounds it to the two bytes, and from that
     instant on nothing in the simulation has ever seen a float that
     did not come out of arithmetic on those bytes.

     Note what this buys: THE LAUNCH PATH NEEDS NO TRIGONOMETRY AT
     ALL. There is no angle to take a sine of. See DETERMINISM.

   ── THE SHOTS BOUNCE. THIS IS THE GAME. ───────────────────────────
     A shot ricochets off crates, off barrels, off the rock, and it
     SKIPS off the water like a flat stone if it comes in shallow
     enough. Banking a pastizz off the middle rock into somebody
     hiding behind sandbags is the shot people will replay.

     Two things make bouncing safe to do deterministically:

     1. THE WORLD IS A GRID OF CELLS, so every surface normal is
        axis-aligned. A reflection is therefore

            hit an X face:  vx = -vx * restitution;  vy = vy * friction
            hit a Y face:   vy = -vy * restitution;  vx = vx * friction

        There is NO normal to normalise and therefore NO SQUARE ROOT.
        This is the whole reason the terrain is a grid and not polygons.
     2. COLLISION IS SWEPT, NEVER SAMPLED. `march()` is an
        Amanatides–Woo voxel walk: it visits EVERY cell the segment
        passes through, in order, and reports which face was crossed.
        A shot cannot tunnel through a one-cell wall no matter how
        fast it is going — the walk is over cells, not over time.
        (Point-sampling per timestep is the classic way to lose a
        trick shot through a wall, and it is not used anywhere here.)

     Every shot carries a bounce budget and a step cap, so no shot can
     rattle around forever. A shot that runs out of either dies where
     it is.

   ── DETERMINISM. THE HARDEST REQUIREMENT IN THE FILE. ─────────────
     Every phone simulates the same throw from the same three bytes
     and MUST land in the same cell. If it does not, two people watch
     different crates fall and the match has silently forked.

     + - * / on IEEE-754 doubles are correctly rounded and therefore
     identical on every conforming engine. Math.sin, Math.cos,
     Math.tan, Math.sqrt, Math.pow, Math.hypot, Math.atan2 ARE NOT —
     they are library code and they differ in the last bits between
     V8, JavaScriptCore and SpiderMonkey. So:

       · NONE of them appear anywhere in this file. Not in the
         simulation, not in the setup, not even in building the
         tables. Grep it: the only Math.* used are floor, abs, min,
         max and imul, all of which are exactly specified.
       · The sine/cosine table (3600 entries, 0.1° per entry) is built
         by TAYLOR SERIES in plain arithmetic — see `sinIdx()`. Not by
         calling Math.sin. If it were built from Math.sin, a one-ulp
         difference in one phone's libm would poison the table and
         every phone after it. Built from + - * only, the table is
         provably identical everywhere.
       · The table is only needed in ONE place in the simulation: a
         bajtra splitting into spines, which ROTATES the parent
         velocity by fixed angles. Rotation by a table angle is
         exact arithmetic. Nothing else needs an angle.
       · Distances are compared SQUARED, always. `d2 <= r*r`, never
         `d(x) <= r`. Blast falloff is linear in d², which is both
         sqrt-free and a perfectly good falloff curve.
       · Fixed timestep. One step is one step. There is no dt, no
         performance.now(), no Date, no requestAnimationFrame, and no
         frame rate anywhere in this file.
       · Math.random appears EXACTLY ONCE, in `newSeed()`, which picks
         the seed for a brand-new local match and is never called by
         the simulation. Same quarantine as js/poker.js. Wind, world
         layout and every scatter come from the seeded PRNG or from a
         pure hash of the position.

     The consequence, which is the point: A MATCH IS (seed, opts,
     moves). `replay()` rebuilds it exactly, and `fingerprint()` is
     the 32-bit tripwire two phones compare.

   ── ONE INTEGER, BIGGER IS BETTER ─────────────────────────────────
     Every number a player or the AI has to reason about is an
     integer and bigger is better:
       character hp      0..100
       cover integrity   0..1000 permille of what the side started with
       coins / xp        whole numbers, from earnings()
     Nothing downstream has to interpret a float.

   ── THE ENGINE NEVER TOUCHES THE PLAYER'S WALLET ──────────────────
     `earnings(st, seat)` REPORTS what a match was worth. It does not
     call KARTI_XP.grant, it does not read the coin balance, it does
     not know one exists. The UI decides whether to pay out. A pure
     engine that writes to a wallet is a pure engine that duplicates
     a payout on every replay.

   ── STRINGS ───────────────────────────────────────────────────────
     Per js/lang.js: engine-authored text is never bare English.
     Everything player-visible here is {id, en, mt} — a stable id for
     code to switch on, and both languages for the UI to pick from
     with KARTI_LANG.t(x.en, x.mt). The Maltese wants a native read
     before it ships; it is marked in the report, not in the code.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ═══════════════════════════════════════════════════════════════════
   1. THE DETERMINISM KIT
   Everything in this section is exact integer or exactly-rounded
   double arithmetic. If you add anything here, it must be too.
   ═══════════════════════════════════════════════════════════════════ */

/* mulberry32, the same generator js/poker.js and js/rummy.js use, so
   a seed means the same thing across KARTI. The whole RNG state is
   one int32 that lives in the match state and is replayed with it. */
function rnd(st){
  st.rs = (st.rs + 0x6D2B79F5) | 0;
  let t = st.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/* an integer in [lo, hi] from the seeded stream */
function rint(st, lo, hi){
  const n = hi - lo + 1;
  return lo + (Math.floor(rnd(st) * n) % n);
}

/* FNV-1a. Used for the fingerprint AND as the machine's "coin": where
   a person would be unpredictable the AI hashes the position instead,
   so its scatter is a pure function of state and every phone predicts
   the same throw. Never Math.random. */
function hash32(list){
  let h = 2166136261 >>> 0;
  for (let i = 0; i < list.length; i++){
    h = (h ^ ((list[i] | 0) >>> 0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/* round-half-up, exactly specified, negatives included */
function iround(v){ return Math.floor(v + 0.5); }
function clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }

/* ── THE TRIG TABLE, BUILT WITHOUT Math.sin ────────────────────────
   Range-reduce into [0, 45°] by the two symmetries sin(180+x)=-sin(x)
   and sin(180-x)=sin(x), then evaluate Taylor to x^15 (sine) or x^14
   (cosine). Over |x| <= PI/4 the first dropped term is below 1e-16,
   i.e. under the resolution of a double, so this IS Math.sin to the
   last bit or one off it — and unlike Math.sin it is the SAME to the
   last bit on every engine, because it is nothing but * and +.

   The factorial denominators are written as integer literals divided
   at load: every one of them is under 2^53, so each division is
   exactly rounded and the coefficients are identical everywhere. */
const PI = 3.141592653589793;
const K10 = PI / 1800;                    /* one tenth of a degree, in radians */

const S3 = -1/6, S5 = 1/120, S7 = -1/5040, S9 = 1/362880,
      S11 = -1/39916800, S13 = 1/6227020800, S15 = -1/1307674368000;
const C2 = -1/2, C4 = 1/24, C6 = -1/720, C8 = 1/40320,
      C10 = -1/3628800, C12 = 1/479001600, C14 = -1/87178291200;

function sinCore(x){                       /* |x| <= PI/4 */
  const z = x * x;
  return x * (1 + z*(S3 + z*(S5 + z*(S7 + z*(S9 + z*(S11 + z*(S13 + z*S15)))))));
}
function cosCore(x){                       /* |x| <= PI/4 */
  const z = x * x;
  return 1 + z*(C2 + z*(C4 + z*(C6 + z*(C8 + z*(C10 + z*(C12 + z*C14))))));
}
/* sin of i tenths of a degree, i any integer */
function sinIdx(i){
  i = ((i % 3600) + 3600) % 3600;
  let sign = 1;
  if (i >= 1800){ i -= 1800; sign = -1; }          /* sin(180+x) = -sin(x) */
  if (i > 900) i = 1800 - i;                       /* sin(180-x) =  sin(x) */
  const v = (i <= 450) ? sinCore(i * K10) : cosCore((900 - i) * K10);
  return sign * v;
}
const DEG = 3600;
const SIN = new Float64Array(DEG);
for (let i = 0; i < DEG; i++) SIN[i] = sinIdx(i);
/* the two lookups the rest of the file uses. Integer index only: the
   simulation never asks for a fractional angle, so there is no
   interpolation error to carry. sinLerp is for the UI, which draws
   a smooth aiming arc and does not feed anything back into state. */
function sinT(i){ return SIN[((i % DEG) + DEG) % DEG]; }
function cosT(i){ return SIN[(((i + 900) % DEG) + DEG) % DEG]; }
function sinLerp(f){
  const i = Math.floor(f), t = f - i;
  return sinT(i) + (sinT(i + 1) - sinT(i)) * t;
}
function cosLerp(f){ return sinLerp(f + 900); }

/* ═══════════════════════════════════════════════════════════════════
   2. THE MATERIALS
   Toughness is hp. `pen` is what a drill pays to bore through a cell.
   `bounce` and `grip` are what make the cover interesting to shoot
   at rather than just something in the way: a steel barrel throws a
   pastizz right back at you, a sandbag wall eats it. Bank off steel,
   die in sand.
   ═══════════════════════════════════════════════════════════════════ */
const AIR = 0, GLASS = 1, WOOD = 2, SAND = 3, BRICK = 4,
      CONCRETE = 5, STEEL = 6, ROCK = 7, HULL = 8;
const NMAT = 9;
const HARD = 60000;                        /* "you are not breaking this" */

const MAT = [
  { id:AIR,      key:'AIR',      hp:0,     pen:0,   bounce:0,    grip:1,
    solid:false, name:{ id:'m.air',      en:'Air',      mt:'Arja' } },
  { id:GLASS,    key:'GLASS',    hp:12,    pen:1,   bounce:0.30, grip:0.92,
    solid:true,  name:{ id:'m.glass',    en:'Glass',    mt:'Ħġieġ' } },
  { id:WOOD,     key:'WOOD',     hp:38,    pen:3,   bounce:0.46, grip:0.86,
    solid:true,  name:{ id:'m.wood',     en:'Wood',     mt:'Injam' } },
  { id:SAND,     key:'SAND',     hp:64,    pen:5,   bounce:0.06, grip:0.42,
    solid:true,  name:{ id:'m.sand',     en:'Sandbag',  mt:'Sakkitta' } },
  { id:BRICK,    key:'BRICK',    hp:86,    pen:7,   bounce:0.40, grip:0.84,
    solid:true,  name:{ id:'m.brick',    en:'Brick',    mt:'Briks' } },
  { id:CONCRETE, key:'CONCRETE', hp:170,   pen:13,  bounce:0.36, grip:0.88,
    solid:true,  name:{ id:'m.concrete', en:'Concrete', mt:'Konkrit' } },
  { id:STEEL,    key:'STEEL',    hp:300,   pen:24,  bounce:0.82, grip:0.96,
    solid:true,  name:{ id:'m.steel',    en:'Barrel',   mt:'Landa' } },
  { id:ROCK,     key:'ROCK',     hp:HARD,  pen:999, bounce:0.62, grip:0.90,
    solid:true,  name:{ id:'m.rock',     en:'Rock',     mt:'Blata' } },
  { id:HULL,     key:'GROUND',   hp:HARD,  pen:999, bounce:0.44, grip:0.82,
    solid:true,  name:{ id:'m.ground',   en:'Bedrock',  mt:'Blat' } }
];
/* flat lookups — the simulation reads these, never MAT[m].x, so the
   hot path is one typed-array index and not a property chase */
const M_HP     = new Int32Array(NMAT);
const M_PEN    = new Int32Array(NMAT);
const M_BOUNCE = new Float64Array(NMAT);
const M_GRIP   = new Float64Array(NMAT);
const M_SOLID  = new Uint8Array(NMAT);
const M_TOUGH  = new Uint8Array(NMAT);     /* 1 = damage never removes it */
for (const m of MAT){
  M_HP[m.id] = m.hp; M_PEN[m.id] = m.pen;
  M_BOUNCE[m.id] = m.bounce; M_GRIP[m.id] = m.grip;
  M_SOLID[m.id] = m.solid ? 1 : 0;
  M_TOUGH[m.id] = (m.hp >= HARD) ? 1 : 0;
}

/* ═══════════════════════════════════════════════════════════════════
   3. THE WORLD, AND EVERY TUNING NUMBER IN ONE PLACE
   Cells are 1 unit. Y GROWS DOWNWARD, which is the screen's
   convention, so a throw goes UP with a NEGATIVE dy — same sign the
   finger gives when it drags upward. One less place to flip a sign.
   ═══════════════════════════════════════════════════════════════════ */
const W = 200, H = 100, N = W * H;
const WATER_Y  = 78;            /* the moat, in cell units               */
const GROUND_Y = 72;            /* the courtyard: the crew stand on this */
const HULL_BOT = 79;            /* rows 73..79 are the rock it is cut into */
const L_X0 = 16, L_X1 = 60;     /* the left castle                       */
const R_X0 = W - 61, R_X1 = W - 17;
const ROCK_X0 = 94, ROCK_X1 = 105;

const T = {
  G:          0.0180,   /* gravity, cells per step per step             */
  WIND_A:     0.000026, /* wind accel per unit of wind (wind is ±100)   */
  DRAG_MAX:   127,      /* a drag component, signed byte                */
  DRAG_R2:    127 * 127,/* and the round cap on the whole vector        */
  VQ:         64,       /* drag units per cell/step. A power of two on  */
                        /* purpose: dx/64 is EXACT in binary.           */
  STEPS:      1400,     /* hard cap on one projectile's flight          */
  SUBHIT:     6,        /* contacts resolved inside a single step       */
  MARCH:      96,       /* hard cap on cells walked in one segment      */
  EPS:        1 / 256,  /* push-out after a contact. Exact in binary.   */
  DEAD_V2:    0.0009,   /* below this speed² a shot has come to rest    */
  SKIP_K:     9,        /* water skips while vy² * K <= vx²             */
  WATER_REST: 0.62,     /* how much a skip keeps                        */
  WATER_GRIP: 0.90,
  OUT_X:      60,       /* cells outside the world before a shot is out */
  OUT_Y:      -600,     /* how high a shot may go before it is gone     */

  CH_W:       2,        /* a character's box                            */
  CH_H:       5,
  CH_HP:      100,
  CH_REST:    0.28,     /* they bounce when you launch them             */
  CH_GRIP:    0.62,
  CH_STEPS:   900,      /* cap on the ragdoll after one shot            */
  CH_DEAD_V2: 0.0016,
  FALL_V:     0.95,     /* landing faster than this hurts               */
  FALL_K:     70,
  CH_SPLASH:  0.55,     /* a person takes less from a splash than a      */
                        /* crate does — they are small and they duck     */
  CH_SPEED:   0.22,     /* what the speed of a direct hit is worth       */

  FALL_DMG:   16,       /* per row a piece of cover falls               */
  CRUSH:      5,        /* onto whatever it lands on                    */
  SETTLE:     4,        /* hard cap on collapse passes                  */

  MAX_TURNS:  40,       /* per side. The match cannot outlive this.     */
  WIND_STEP:  34,       /* how far the wind may drift in one turn       */
  WIND_MAX:   100
};

/* ── the grid ─────────────────────────────────────────────────────── */
function idx(x, y){ return y * W + x; }
function inWorld(x, y){ return x >= 0 && x < W && y >= 0 && y < H; }
function matAt(st, x, y){
  return inWorld(x, y) ? st.g.mat[idx(x, y)] : AIR;
}
function hpAt(st, x, y){
  return inWorld(x, y) ? st.g.hp[idx(x, y)] : 0;
}
function solidAt(st, x, y){
  if (x < 0 || x >= W || y < 0) return 0;
  if (y >= H) return 0;
  return M_SOLID[st.g.mat[idx(x, y)]];
}

/* which side owns a column — cover ownership is by column, and cover
   only ever falls straight down, so ownership never changes hands and
   the integrity totals can be kept incrementally instead of recounted */
function ownerOf(x){
  if (x >= L_X0 && x <= L_X1) return 0;
  if (x >= R_X0 && x <= R_X1) return 1;
  return -1;
}

function put(st, x, y, m){
  if (!inWorld(x, y)) return;
  const i = idx(x, y);
  const old = st.g.mat[i];
  if (M_SOLID[old]) creditCell(st, x, -st.g.hp[i], -1);
  st.g.mat[i] = m;
  st.g.hp[i] = M_HP[m];
  if (M_SOLID[m]) creditCell(st, x, M_HP[m], 1);
}
/* every change to a cell goes through here, so the per-side totals are
   arithmetic and not a periodic recount that could drift */
function creditCell(st, x, dHp, dCount){
  st.g.cells += dCount;
  const o = ownerOf(x);
  if (o < 0) return;
  const s = st.sides[o];
  s.coverHp += dHp;
  s.coverCells += dCount;
  if (s.coverHp < 0) s.coverHp = 0;
}

/* ═══════════════════════════════════════════════════════════════════
   4. BUILDING THE WORLD FROM THE SEED
   Two castles, a pillar in the middle of the moat, and three
   whose shape comes out of the PRNG — so no two matches present the
   same problem, and both phones build the identical problem.

   The layout is MIRRORED: the left side's cover is reflected onto the
   right. A throwing game that hands one seat better cover than the
   other is not a game, it is a coin toss with extra steps.
   ═══════════════════════════════════════════════════════════════════ */
/* ── THE DEFENCES ────────────────────────────────────────────────
   Three slots a side, each with four tiers, and the tiers are NOT
   the same number painted darker — each one changes how the thing
   BEHAVES, because a defence you cannot feel is a defence nobody
   buys:

     WALL     the front face. Wood splinters; brick holds; concrete
              swallows a murtal; STEEL at tier 3 has bounce 0.82,
              which means it throws the shot BACK at whoever sent it.
              A steel wall is not a tougher wall, it is a different
              problem for the attacker.
     TOWER    tall and narrow. Its tiers mostly buy HEIGHT, and
              height is geometry: a tier-3 tower is fifteen cells of
              nothing-goes-through and forces the enemy into a lob,
              which is slower, which the wind gets a longer go at.
     PARAPET  the low screen right in front of your crew. Tier 0 is
              SANDBAGS, bounce 0.06 — it eats a ricochet dead. Every
              upgrade above it is tougher but BOUNCIER, so a shot
              that used to die on your sandbags now skips off your
              nice brick parapet and into the man behind it. The
              parapet ladder is a genuine trade and it is the one
              players will argue about.

   All of it is table data. Nothing about a tier is written in code.
   ═══════════════════════════════════════════════════════════════════ */
const DEFS = [
  { id:0, key:'WALL', back:6, w:6,
    name:{ id:'d.wall', en:'Wall', mt:'Ħajt' },
    tiers:[
      { mat:WOOD,     h:5,  cost:0,
        name:{ id:'d.wall.0', en:'Palisade',   mt:'Lasta tal-injam' },
        note:{ id:'d.wall.0n', en:'It is a fence. It will do until it does not.',
               mt:'Huwa ċint. Jagħmilha sakemm ma jagħmilhiex.' } },
      { mat:BRICK,    h:7,  cost:150,
        name:{ id:'d.wall.1', en:'Stone wall',  mt:'Ħajt tal-ġebel' },
        note:{ id:'d.wall.1n', en:'Two cells thicker and it stops caring about balloons.',
               mt:'Żewġ ċelloli oħxon u ma jibqax jimpurtah mill-blalen.' } },
      { mat:CONCRETE, h:9,  cost:330,
        name:{ id:'d.wall.2', en:'Reinforced',  mt:'Imsaħħaħ' },
        note:{ id:'d.wall.2n', en:'A murtal now takes a bite out of it instead of a hole through it.',
               mt:'Murtal issa jieħu gidma minnu minflok toqba minn ġewwa.' } },
      { mat:STEEL,    h:10, cost:620,
        name:{ id:'d.wall.3', en:'Steel-faced', mt:'Miksi bl-azzar' },
        note:{ id:'d.wall.3n', en:'Bounces what hits it straight back down the field. Aim carefully.',
               mt:'Jitfa’ lura dak li jolqtu. Immira sew.' } }
    ] },
  { id:1, key:'TOWER', back:16, w:6,
    name:{ id:'d.tower', en:'Tower', mt:'Torri' },
    tiers:[
      { mat:WOOD,     h:8,  cost:0,
        name:{ id:'d.tower.0', en:'Scaffold',    mt:'Armar' },
        note:{ id:'d.tower.0n', en:'Tall enough to be in the way, short enough to lob over.',
               mt:'Għoli biżżejjed biex ifixkel, baxx biżżejjed biex taqbeż fuqu.' } },
      { mat:BRICK,    h:11, cost:180,
        name:{ id:'d.tower.1', en:'Stone tower', mt:'Torri tal-ġebel' },
        note:{ id:'d.tower.1n', en:'Three cells more sky to get over.',
               mt:'Tliet ċelloli sema’ oħra x’taqsam.' } },
      { mat:CONCRETE, h:14, cost:380,
        name:{ id:'d.tower.2', en:'Keep',        mt:'Mastru' },
        note:{ id:'d.tower.2n', en:'Now they have to lob, and the wind gets a longer go at it.',
               mt:'Issa jridu jitfgħu fl-għoli, u r-riħ jieħu aktar ħin fuqha.' } },
      { mat:STEEL,    h:15, cost:700,
        name:{ id:'d.tower.3', en:'Iron keep',   mt:'Mastru tal-ħadid' },
        note:{ id:'d.tower.3n', en:'Fifteen cells of nothing gets through, and it kicks back.',
               mt:'Ħmistax-il ċellola li ma jgħaddi xejn minnhom, u tirfes lura.' } }
    ] },
  { id:2, key:'PARAPET', back:27, w:8,
    name:{ id:'d.par', en:'Parapet', mt:'Parapett' },
    tiers:[
      { mat:SAND,     h:3, cost:0,
        name:{ id:'d.par.0', en:'Sandbags',  mt:'Sakkitti' },
        note:{ id:'d.par.0n', en:'Soft. Kills a ricochet stone dead. Do not be too quick to replace it.',
               mt:'Ratba. Toqtol rimbalz fil-post. Toqgħodx tgħaġġel biex tibdilha.' } },
      { mat:WOOD,     h:4, cost:120,
        name:{ id:'d.par.1', en:'Board screen', mt:'Skrin tal-injam' },
        note:{ id:'d.par.1n', en:'Taller and tougher — and bouncier, which is not always a gift.',
               mt:'Ogħla u aktar b’saħħtu — u jaqbeż aktar, li mhux dejjem rigal.' } },
      { mat:BRICK,    h:5, cost:280,
        name:{ id:'d.par.2', en:'Brick screen', mt:'Skrin tal-briks' },
        note:{ id:'d.par.2n', en:'Holds a murtal. Skips a pastizz over the top into your own man.',
               mt:'Iżomm murtal. Iqabbeż pastizz minn fuq għal fuq ir-raġel tiegħek stess.' } },
      { mat:CONCRETE, h:6, cost:480,
        name:{ id:'d.par.3', en:'Blast screen', mt:'Skrin tal-konkrit' },
        note:{ id:'d.par.3n', en:'The last word in standing behind something.',
               mt:'L-aħħar kelma fl-oqgħod wara xi ħaġa.' } }
    ] }
];
const NDEF = DEFS.length, NTIER = 4;

/* where slot `d` sits on seat `seat`, in world columns */
function slotSpan(seat, d){
  const D = DEFS[d];
  if (seat === 0){ const f = L_X1 - D.back; return { x0: f, x1: f + D.w - 1 }; }
  const f = R_X0 + D.back;
  return { x0: f - D.w + 1, x1: f };
}
function slotFull(d, tier){
  return DEFS[d].w * DEFS[d].tiers[tier].h * M_HP[DEFS[d].tiers[tier].mat];
}

/* raise (or repair) one slot. `frac` is the hp the new cells come up
   with, in 256ths — an upgrade builds at full, a repair at less, and
   the difference is what makes repairing a choice rather than a
   formality. */
function rebuildSlot(st, seat, d, frac){
  const D = DEFS[d];
  const s = st.sides[seat];
  const tier = s.tier[d];
  const t = D.tiers[tier];
  const sp = slotSpan(seat, d);
  for (let x = sp.x0; x <= sp.x1; x++){
    for (let y = GROUND_Y - t.h + 1; y <= GROUND_Y; y++){
      if (y < 0) continue;
      put(st, x, y, t.mat);
      if (frac < 256){
        const i = idx(x, y);
        const full = st.g.hp[i];
        const want = Math.max(1, (full * frac / 256) | 0);
        creditCell(st, x, want - full, 0);
        st.g.hp[i] = want;
      }
    }
  }
  /* and clear anything left standing above the new top, so a repair
     does not leave last round's rubble hovering */
  for (let x = sp.x0; x <= sp.x1; x++)
    for (let y = 0; y < GROUND_Y - t.h + 1; y++)
      if (M_SOLID[st.g.mat[idx(x, y)]]) hurtCell(st, x, y, 99999, null);
}

function defFullOf(st, seat){
  let n = 0;
  for (let d = 0; d < NDEF; d++) n += slotFull(d, st.sides[seat].tier[d]);
  return n;
}

function makeWorld(st){
  const g = st.g;
  g.mat.fill(AIR); g.hp.fill(0);
  g.cells = 0;
  for (let sd = 0; sd < 2; sd++){
    st.sides[sd].coverHp = 0; st.sides[sd].coverCells = 0;
  }

  /* the two rock shelves the castles are cut into, and the moat
     between them. Neither shelf can be destroyed — the castle stands
     on Malta, and Malta stays. */
  ground(st, L_X0, L_X1);
  ground(st, R_X0, R_X1);

  /* the ruined pillar in the middle of the moat: indestructible, and
     the single most useful thing on the board, because everything
     bounces off it */
  const rockTop = rint(st, 50, 62);
  for (let x = ROCK_X0; x <= ROCK_X1; x++){
    const inset = Math.abs(x - ((ROCK_X0 + ROCK_X1) >> 1));
    for (let y = rockTop + inset; y <= WATER_Y + 2; y++) put(st, x, y, ROCK);
  }

  for (let sd = 0; sd < 2; sd++)
    for (let d = 0; d < NDEF; d++) rebuildSlot(st, sd, d, 256);

  /* a handful of loose crates and barrels, from the seed, so no two
     matches present quite the same problem */
  for (let sd = 0; sd < 2; sd++){
    const n = rint(st, 2, 4);
    for (let i = 0; i < n; i++){
      const off = rint(st, 2, 20);
      const m = rint(st, 0, 2) === 0 ? STEEL : WOOD;
      const hgt = rint(st, 2, 4);
      const bx = sd === 0 ? (L_X0 + off) : (R_X1 - off);
      for (let ax = 0; ax < 2; ax++)
        for (let ay = 0; ay < hgt; ay++){
          const x = bx + ax;
          if (ownerOf(x) !== sd) continue;
          put(st, x, GROUND_Y - ay, m);
        }
    }
  }
  st.rockTop = rockTop;
}

function ground(st, x0, x1){
  for (let x = x0; x <= x1; x++)
    for (let y = GROUND_Y + 1; y <= HULL_BOT; y++) put(st, x, y, HULL);
}

/* ═══════════════════════════════════════════════════════════════════
   5. THE CHARACTERS
   Three a side. They are the target — the cover is cover, not the
   objective. A character is a point at the FEET plus a box that
   reaches up from it, which keeps standing, falling and being
   launched into the sea all one piece of arithmetic.
   ═══════════════════════════════════════════════════════════════════ */
const CH_PER_SIDE = 3;

function boxOf(c){
  return { x0: c.x - T.CH_W / 2, y0: c.y - T.CH_H, x1: c.x + T.CH_W / 2, y1: c.y };
}
function groundUnder(st, x, y){
  /* the first solid row at or below y in this column, or -1 */
  const cx = Math.floor(x);
  for (let yy = Math.max(0, Math.floor(y)); yy < H; yy++)
    if (solidAt(st, cx, yy)) return yy;
  return -1;
}

function makeCrew(st){
  const names = CREW_NAMES;
  for (let seat = 0; seat < 2; seat++){
    const s = st.sides[seat];
    const x0 = seat === 0 ? L_X0 : R_X0, x1 = seat === 0 ? L_X1 : R_X1;
    s.crew = [];
    for (let k = 0; k < CH_PER_SIDE; k++){
      /* stand them at the BACK of the courtyard, behind the parapet,
         mirrored so neither seat is closer to the enemy */
      const off = 4 + k * 4;
      const x = seat === 0 ? (x0 + 2 + off) : (x1 - 2 - off);
      const gy = groundUnder(st, x, GROUND_Y - 40);
      s.crew.push({
        id: seat * 8 + k, seat, k,
        x: Math.floor(x) + 0.5,
        y: (gy < 0 ? GROUND_Y : gy) - 0.0,
        vx: 0, vy: 0,
        hp: T.CH_HP, alive: true, air: false, wet: false,
        name: names[seat][k]
      });
    }
  }
}

/* the crew. Six Maltese nicknames you have queued behind. */
const CREW_NAMES = [
  [ { id:'c.l0', en:'Ġanni',   mt:'Ġanni'   },
    { id:'c.l1', en:'Toni',    mt:'Toni'    },
    { id:'c.l2', en:'Sunta',   mt:'Sunta'   } ],
  [ { id:'c.r0', en:'Ċikku',   mt:'Ċikku'   },
    { id:'c.r1', en:'Rita',    mt:'Rita'    },
    { id:'c.r2', en:'Grezz',   mt:'Grezz'   } ]
];

/* ═══════════════════════════════════════════════════════════════════
   6. THE THINGS YOU THROW
   A ladder, not a menu. Tier 0 is free and unlimited so nobody can
   ever be unable to take a turn; everything above it is bought
   between rounds with what earnings() says the last round was worth.

   Each one exists for a reason you can say in one line:

     BALLUN      free, endless, bouncy, barely hurts. The ranging shot.
     PASTIZZ     greasy — skips off the water four times. The bank shot.
     QUBBAJT     sticky — does NOT bounce, sticks and goes off on a
                 fuse. The answer to a target you can hit directly.
     PPAPOĊĊ     twelve bounces and no manners. The answer to somebody
                 hiding in a corner you cannot see into.
     BAJTRA      splits at the top of its arc into five spines. The
                 answer to a spread-out crew.
     MURTAL      slow, heavy, enormous bang. The answer to cover.
     TRIVELLA    bores through cover before it goes off. The answer to
                 somebody who has stacked concrete in front of them.
     KARRETTUN   does not bounce, does not care, and throws whatever
                 it touches into the sea. The answer to everything,
                 for two shots, at a price.

   `rest` and `fric` are the shot's OWN half of a bounce; the cell it
   hits supplies the other half (M_BOUNCE / M_GRIP). A ppapoċċ on a
   steel barrel is 0.86 * 0.82; the same slipper in sandbags is
   0.86 * 0.06 and it stops dead. That product is the whole feel of
   the game and it is two multiplications.
   ═══════════════════════════════════════════════════════════════════ */
const WEAPONS = [
  { id:0, key:'BALLUN', tier:0, cost:0, ammo:-1, cool:0,
    vmul:1.00, wind:1.55, rest:0.72, fric:0.90, bounces:2,
    skips:1, skipK:9, pen:0, fuse:0, split:0, sticky:false,
    dmg:9,  r:4.0, peak:12, knock:1.05, mass:0.55,
    name:{ id:'w.ballun.n', en:'Water balloon', mt:'Ballun tal-ilma' },
    blurb:{ id:'w.ballun.b',
      en:'Free and endless. Will not hurt anybody much, but it will send them somewhere they did not plan to be.',
      mt:'B’xejn u qatt ma jispiċċa. Ma jweġġaħ lil ħadd wisq, imma jibagħtu fejn ma kienx bi ħsiebu jmur.' } },

  { id:1, key:'PASTIZZ', tier:1, cost:120, ammo:8, cool:0,
    vmul:1.06, wind:0.95, rest:0.68, fric:0.94, bounces:5,
    skips:4, skipK:4, pen:0, fuse:0, split:0, sticky:false,
    dmg:19, r:5.0, peak:24, knock:0.80, mass:0.85,
    name:{ id:'w.pastizz.n', en:'Pastizz', mt:'Pastizz' },
    blurb:{ id:'w.pastizz.b',
      en:'Greasy enough to skip off the water four times. This is the one you bank off the rock.',
      mt:'Biżżejjed żejtni biex jaqbeż fuq l-ilma erba’ darbiet. Dan hu dak li tferra‘ mal-blata.' } },

  { id:2, key:'QUBBAJT', tier:1, cost:180, ammo:6, cool:1,
    vmul:0.98, wind:0.80, rest:0.00, fric:0.00, bounces:0,
    skips:0, skipK:0, pen:0, fuse:26, split:0, sticky:true,
    dmg:32, r:6.0, peak:36, knock:0.62, mass:1.00,
    name:{ id:'w.qubbajt.n', en:'Nougat bomb', mt:'Qubbajt' },
    blurb:{ id:'w.qubbajt.b',
      en:'Sticks where it lands and goes off a moment later. No bounce, no second chance, no escaping it either.',
      mt:'Jeħel fejn jinżel u jaqbad ftit wara. L-ebda qbiż, l-ebda ċans ieħor, u lanqas ħarba.' } },

  { id:3, key:'PPAPOCC', tier:2, cost:260, ammo:5, cool:1,
    vmul:1.02, wind:1.30, rest:0.86, fric:0.97, bounces:12,
    skips:2, skipK:7, pen:0, fuse:0, split:0, sticky:false,
    dmg:14, r:3.2, peak:16, knock:0.72, mass:0.60,
    name:{ id:'w.ppapocc.n', en:'The slipper', mt:'Il-Ppapoċċ' },
    blurb:{ id:'w.ppapocc.b',
      en:'Twelve bounces. It will find whoever is hiding behind the barrels, the way it always has.',
      mt:'Tnax-il qabża. Isib lil min qed jinħeba wara l-landi, kif dejjem għamel.' } },

  { id:4, key:'BAJTRA', tier:2, cost:340, ammo:4, cool:1,
    vmul:1.00, wind:1.10, rest:0.50, fric:0.88, bounces:1,
    skips:1, skipK:9, pen:0, fuse:0, split:5, sticky:false,
    dmg:13, r:3.4, peak:15, knock:0.66, mass:0.70,
    name:{ id:'w.bajtra.n', en:'Prickly pear', mt:'Bajtra tax-xewk' },
    blurb:{ id:'w.bajtra.b',
      en:'Splits at the top of the arc into five spines. Covers ground rather than digging a hole.',
      mt:'Tinqasam fl-ogħla punt f’ħames xewkiet. Tifrex minflok ma tħaffer.' } },

  { id:5, key:'MURTAL', tier:3, cost:520, ammo:3, cool:2,
    vmul:0.90, wind:0.55, rest:0.20, fric:0.70, bounces:1,
    skips:0, skipK:0, pen:0, fuse:0, split:0, sticky:false,
    dmg:46, r:9.0, peak:56, knock:1.25, mass:1.60,
    name:{ id:'w.murtal.n', en:'Festa firework', mt:'Murtal' },
    blurb:{ id:'w.murtal.b',
      en:'Slow, heavy and far too loud. It does not go round cover, it removes it.',
      mt:'Bil-mod, tqil u wisq storbjuż. Ma jdurx mal-kenn, ineħħih.' } },

  { id:6, key:'TRIVELLA', tier:3, cost:640, ammo:2, cool:3,
    vmul:1.14, wind:0.42, rest:0.15, fric:0.70, bounces:1,
    skips:0, skipK:0, pen:62, fuse:0, split:0, sticky:false,
    dmg:42, r:6.2, peak:52, knock:0.90, mass:1.40,
    name:{ id:'w.trivella.n', en:'The drill', mt:'It-Trivella' },
    blurb:{ id:'w.trivella.b',
      en:'Bores straight through the crates and goes off on the far side, where they are standing.',
      mt:'Tħaffer dritt mill-kaxxi u taqbad fuq in-naħa l-oħra, fejn qegħdin huma.' } },

  { id:7, key:'KARRETTUN', tier:4, cost:900, ammo:2, cool:3,
    vmul:0.84, wind:0.30, rest:0.06, fric:0.55, bounces:1,
    skips:0, skipK:0, pen:0, fuse:0, split:0, sticky:false,
    dmg:58, r:7.4, peak:64, knock:2.30, mass:2.40,
    name:{ id:'w.karrettun.n', en:'Barrow of cement', mt:'Karrettun tas-siment' },
    blurb:{ id:'w.karrettun.b',
      en:'It does not bounce and it does not stop. Whatever it touches goes in the moat.',
      mt:'La jaqbeż u lanqas jieqaf. Kull ma jmiss jispiċċa fil-foss.' } }
];
const NW = WEAPONS.length;
const weaponOf = w => WEAPONS[w | 0] || null;
/* the default loadout of a fresh match: everything, at listed ammo.
   The UI narrows it with opts.own when the shop is wired up. */
function fullLoadout(){ return WEAPONS.map(w => w.ammo); }
function starterLoadout(){ return WEAPONS.map(w => w.tier === 0 ? w.ammo : 0); }

/* ── difficulty ───────────────────────────────────────────────────
   The levels differ in TWO things only: how fast the machine walks a
   shot onto you, and how much it fumbles. A machine that is handed
   the answer is not a difficulty setting, it is a wall. */
const LEVELS = [
  null,
  { lvl:1, gain:0.34, bracket:false, windFF:0.0, jitter:9, tierCap:1,
    name:{ id:'d.1', en:'Green',  mt:'Ġdid'   } },
  { lvl:2, gain:0.62, bracket:false, windFF:0.5, jitter:5, tierCap:2,
    name:{ id:'d.2', en:'Steady', mt:'Sod'    } },
  { lvl:3, gain:0.86, bracket:true,  windFF:0.9, jitter:2, tierCap:3,
    name:{ id:'d.3', en:'Sharp',  mt:'Jaqta’' } },
  { lvl:4, gain:1.00, bracket:true,  windFF:1.0, jitter:1, tierCap:4,
    name:{ id:'d.4', en:'Deadly', mt:'Qattiel' } }
];

/* ═══════════════════════════════════════════════════════════════════
   7. SWEPT COLLISION — the part that must not be got wrong
   ═══════════════════════════════════════════════════════════════════ */

/* march(): Amanatides–Woo. Walk the cells the segment (x0,y0)→(x0+dx,
   y0+dy) actually passes through, in order, and stop at the first one
   `hitFn` calls a hit. Returns { t, cx, cy, ax } where ax is 0 if an
   X-facing wall was crossed and 1 if a Y-facing one — that IS the
   surface normal, and it is why nothing here needs a square root.

   NOT a per-step position sample. The walk is over CELLS, so a shot
   travelling forty cells in one step still visits all forty and
   cannot pass through a one-cell wall. Verified in the harness with
   grazing angles and with speeds far beyond anything DRAG_MAX can
   produce.

   Ties (an exact corner, tMaxX === tMaxY) resolve to the X face.
   Arbitrary, documented, and the same on every phone — which is the
   only property that matters. */
function march(x0, y0, dx, dy, hitFn){
  let ix = Math.floor(x0), iy = Math.floor(y0);
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  let tMaxX, tDX, tMaxY, tDY;
  if (sx === 0){ tMaxX = Infinity; tDX = Infinity; }
  else if (sx > 0){ tDX = 1 / dx;  tMaxX = (ix + 1 - x0) / dx; }
  else            { tDX = -1 / dx; tMaxX = (ix - x0) / dx; }
  if (sy === 0){ tMaxY = Infinity; tDY = Infinity; }
  else if (sy > 0){ tDY = 1 / dy;  tMaxY = (iy + 1 - y0) / dy; }
  else            { tDY = -1 / dy; tMaxY = (iy - y0) / dy; }

  for (let n = 0; n < T.MARCH; n++){
    let t, ax;
    if (tMaxX <= tMaxY){
      if (tMaxX > 1) return null;
      t = tMaxX; ix += sx; ax = 0; tMaxX += tDX;
    } else {
      if (tMaxY > 1) return null;
      t = tMaxY; iy += sy; ax = 1; tMaxY += tDY;
    }
    if (hitFn(ix, iy)) return { t, cx:ix, cy:iy, ax };
  }
  return null;
}

/* segment against an axis-aligned box — the slab test. Returns the
   entry t in [0,1] or -1. No sqrt, no normal needed: a character is
   soft and does not reflect anything. */
function segBox(x0, y0, dx, dy, bx0, by0, bx1, by1){
  let tmin = 0, tmax = 1;
  if (dx === 0){ if (x0 < bx0 || x0 > bx1) return -1; }
  else {
    let t1 = (bx0 - x0) / dx, t2 = (bx1 - x0) / dx;
    if (t1 > t2){ const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (dy === 0){ if (y0 < by0 || y0 > by1) return -1; }
  else {
    let t1 = (by0 - y0) / dy, t2 = (by1 - y0) / dy;
    if (t1 > t2){ const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}

/* ═══════════════════════════════════════════════════════════════════
   8. DAMAGE
   Every cell change lands here. Nothing anywhere else writes g.mat.
   ═══════════════════════════════════════════════════════════════════ */
function hurtCell(st, x, y, d, rep){
  if (!inWorld(x, y)) return 0;
  const i = idx(x, y);
  const m = st.g.mat[i];
  if (!M_SOLID[m] || M_TOUGH[m]) return 0;
  d = d | 0;
  if (d <= 0) return 0;
  const h = st.g.hp[i];
  const o = ownerOf(x);
  if (d >= h){
    st.g.mat[i] = AIR; st.g.hp[i] = 0;
    creditCell(st, x, -h, -1);
    if (rep){ rep.broke++; if (o >= 0) rep.cover[o] += h; }
    return 1;
  }
  st.g.hp[i] = h - d;
  creditCell(st, x, -d, 0);
  if (rep && o >= 0) rep.cover[o] += d;
  return 0;
}

/* the blast. Falloff is LINEAR IN d², which is sqrt-free and, as it
   happens, a better-feeling curve than linear in distance: it holds
   near-full damage in the middle and drops off sharply at the rim. */
function blast(st, cx, cy, r, peak, knock, seat, rep){
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.floor(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.floor(cy + r));
  for (let y = y0; y <= y1; y++){
    for (let x = x0; x <= x1; x++){
      const ddx = (x + 0.5) - cx, ddy = (y + 0.5) - cy;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 > r2) continue;
      hurtCell(st, x, y, (peak * (r2 - d2) / r2) | 0, rep);
    }
  }
  /* and the people. Always seat 0's crew before seat 1's, in index
     order — a fixed order is the whole requirement. */
  for (let sd = 0; sd < 2; sd++){
    const crew = st.sides[sd].crew;
    for (let k = 0; k < crew.length; k++){
      const c = crew[k];
      if (!c.alive) continue;
      const ddx = c.x - cx, ddy = (c.y - T.CH_H / 2) - cy;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 > r2) continue;
      const f = (r2 - d2) / r2;
      hurtChar(st, c, (peak * f * T.CH_SPLASH) | 0, seat, rep, 'blast');
      /* knockback away from the bang. Dividing the offset by r gives a
         direction of roughly unit length WITHOUT normalising it —
         |offset| <= r by construction, so offset/r is in the unit
         disc. That is the sqrt we do not take. */
      const imp = knock * f * 0.055;
      c.vx += (ddx / r) * imp * 22;
      c.vy += (ddy / r) * imp * 22 - imp * 8;   /* a bang always lifts */
      c.air = true;
    }
  }
}

function hurtChar(st, c, d, byS, rep, how){
  if (!c.alive) return;
  d = d | 0;
  if (d < 0) d = 0;
  c.hp -= d;
  if (rep && d > 0){
    rep.hurt.push({ id:c.id, seat:c.seat, k:c.k, d, how });
    if (byS >= 0 && byS !== c.seat) rep.dealt += d;
    else if (byS >= 0) rep.own += d;
  }
  if (c.hp <= 0){
    c.hp = 0; c.alive = false; c.air = false; c.vx = 0; c.vy = 0;
    if (rep) rep.downed.push({ id:c.id, seat:c.seat, k:c.k, how });
  }
}

/* ═══════════════════════════════════════════════════════════════════
   9. THE FLIGHT
   All live projectiles advance ONE fixed step together, resolved in
   projectile-id order inside the step. Lockstep, so a bajtra's five
   spines fall together on screen; fixed order, so the damage lands in
   the same sequence on every phone.

   Collapse is NOT run here. Blasts land immediately, cover settles
   once at the end of the whole throw. That bounds it and takes the
   ordering question off the table entirely.
   ═══════════════════════════════════════════════════════════════════ */
function newProj(st, id, parent, w, x, y, vx, vy){
  const W_ = WEAPONS[w];
  return {
    id, parent, w, x, y, vx, vy,
    bounces: W_.bounces, skips: W_.skips, pen: W_.pen,
    fuse: 0, stuck: false, split: W_.split > 0, alive: true,
    born: st.step | 0,
    pts: [x, y]
  };
}

function boom(st, p, seat, rep, why){
  const W_ = WEAPONS[p.w];
  p.alive = false;
  rep.ev.push({ t:'boom', id:p.id, w:p.w, x:p.x, y:p.y, r:W_.r, why });
  blast(st, p.x, p.y, W_.r, W_.peak, W_.knock, seat, rep);
}

/* a direct hit on a person: the listed damage plus what the speed is
   worth. v² again, never |v|. */
function directHit(st, p, c, seat, rep){
  const W_ = WEAPONS[p.w];
  const v2 = p.vx * p.vx + p.vy * p.vy;
  const bonus = (W_.dmg * v2 * T.CH_SPEED) | 0;
  hurtChar(st, c, W_.dmg + bonus, seat, rep, 'direct');
  rep.ev.push({ t:'thump', id:p.id, ch:c.id, x:p.x, y:p.y });
  /* knockback is the projectile's own velocity times its mass. No
     direction to normalise — the velocity IS the direction. */
  const k = W_.knock * W_.mass * 0.62;
  c.vx += p.vx * k;
  c.vy += p.vy * k - 0.18 * W_.knock;
  c.air = true;
  rep.direct++;
}

/* fire one throw. Mutates the world. Returns nothing; everything the
   UI needs is written into `rep`. */
function throwIt(st, seat, mv, rep, opts){
  const W_ = WEAPONS[mv.w];
  const s = st.sides[seat];
  const thrower = firstUp(s);
  if (!thrower) return;

  const face = seat === 0 ? 1 : -1;
  const vx0 = (mv.dx / T.VQ) * W_.vmul * face;
  const vy0 = (mv.dy / T.VQ) * W_.vmul;
  /* leave the hand two cells along the throw so nobody hits their own
     shoulder. Two cells scaled by the drag, not by a normalised
     direction — again, no sqrt. */
  const lead = 3.2 / (Math.abs(mv.dx) + Math.abs(mv.dy) + 1);
  const px = thrower.x + (mv.dx * face) * lead;
  const py = (thrower.y - T.CH_H) + mv.dy * lead;

  const live = [ newProj(st, 0, -1, mv.w, px, py, vx0, vy0) ];
  const wa = st.wind * T.WIND_A * W_.wind;
  let nextId = 1;
  const noDmg = !!(opts && opts.noDamage);

  rep.ev.push({ t:'throw', seat, w:mv.w, x:px, y:py, vx:vx0, vy:vy0 });

  for (let step = 0; step < T.STEPS; step++){
    let any = false;
    for (let q = 0; q < live.length; q++){
      const p = live[q];
      if (!p.alive) continue;
      any = true;

      /* stuck things do not move; they count down and go off */
      if (p.stuck){
        if (--p.fuse <= 0){ if (!noDmg) boom(st, p, seat, rep, 'fuse'); else p.alive = false; }
        continue;
      }

      p.vy += T.G;
      p.vx += wa;

      /* the bajtra opens at the top of its arc — the one moment the
         trig table is needed, to rotate the parent velocity by five
         fixed angles */
      if (p.split && p.vy >= 0 && live.length < 16){
        p.split = false;
        rep.ev.push({ t:'split', id:p.id, x:p.x, y:p.y, n:W_.split });
        const SPREAD = [-240, -120, 0, 120, 240];
        for (let f = 0; f < W_.split; f++){
          /* a little seeded scatter so five spines are not a comb.
             Pure hash of replayable state — no rs mutation, so a
             preview and the real throw agree exactly. */
          const j = (hash32([st.seed, st.turnNo, seat, p.id, f]) % 61) - 30;
          const a = SPREAD[f % SPREAD.length] + j;
          const ca = cosT(a), sa = sinT(a);
          const nvx = p.vx * ca - p.vy * sa;
          const nvy = p.vx * sa + p.vy * ca;
          const sc = 0.86 + (f % 3) * 0.06;
          const kid = newProj(st, nextId++, p.id, p.w, p.x, p.y, nvx * sc, nvy * sc);
          kid.split = false;
          kid.bounces = 1;
          live.push(kid);
        }
        p.alive = false;
        continue;
      }

      /* ── the step, resolved against everything it might touch ── */
      let rem = 1;
      for (let sub = 0; sub < T.SUBHIT && rem > 0 && p.alive; sub++){
        const dx = p.vx * rem, dy = p.vy * rem;
        if (dx === 0 && dy === 0) break;

        /* (1) a person. Earliest t wins; seat/index order breaks ties. */
        let tc = 2, hitCh = null;
        for (let sd = 0; sd < 2; sd++){
          const crew = st.sides[sd].crew;
          for (let k = 0; k < crew.length; k++){
            const c = crew[k];
            if (!c.alive) continue;
            const b = boxOf(c);
            const t = segBox(p.x, p.y, dx, dy, b.x0, b.y0, b.x1, b.y1);
            if (t >= 0 && t < tc){ tc = t; hitCh = c; }
          }
        }
        /* (2) the water surface, crossed downward */
        let tw = 2;
        if (dy > 0 && p.y < WATER_Y && p.y + dy >= WATER_Y) tw = (WATER_Y - p.y) / dy;
        /* (3) the world */
        const hit = march(p.x, p.y, dx, dy, (cx, cy) =>
          (cx >= 0 && cx < W && cy >= 0 && cy < H) ? M_SOLID[st.g.mat[cy * W + cx]] === 1 : 0);
        const tg = hit ? hit.t : 2;

        const t = Math.min(tc, tw, tg);
        if (t > 1){ p.x += dx; p.y += dy; rem = 0; break; }

        p.x += dx * t; p.y += dy * t;
        rem = rem * (1 - t);

        if (t === tc && hitCh){
          if (!noDmg) directHit(st, p, hitCh, seat, rep);
          /* it goes off on the person, or carries on through if it is
             a slipper with bounces to burn */
          if (W_.bounces > 4 && p.bounces > 1){
            p.bounces--;
            p.vx = -p.vx * 0.42; p.vy = -p.vy * 0.42;
            p.x += p.vx * T.EPS * 8; p.y += p.vy * T.EPS * 8;
          } else {
            if (!noDmg) boom(st, p, seat, rep, 'direct'); else p.alive = false;
          }
          continue;
        }

        if (t === tw){
          /* SKIP OR SPLASH. Shallow enough and it skips like a stone;
             steep and the sea keeps it. vy² * K <= vx², no roots. */
          const shallow = (p.vy * p.vy) * W_.skipK <= (p.vx * p.vx);
          if (p.skips > 0 && shallow && W_.skips > 0){
            p.skips--;
            p.vy = -p.vy * T.WATER_REST;
            p.vx = p.vx * T.WATER_GRIP;
            p.y = WATER_Y - T.EPS;
            rep.ev.push({ t:'skip', id:p.id, x:p.x, y:WATER_Y });
          } else {
            p.alive = false;
            rep.ev.push({ t:'splash', id:p.id, x:p.x, y:WATER_Y });
          }
          continue;
        }

        /* the world. Drill first: it pays its way through. */
        const m = st.g.mat[hit.cy * W + hit.cx];
        if (p.pen > 0 && !M_TOUGH[m]){
          p.pen -= M_PEN[m];
          if (!noDmg) hurtCell(st, hit.cx, hit.cy, 99999, rep);
          rep.ev.push({ t:'bore', id:p.id, x:hit.cx, y:hit.cy });
          /* step past the face we just crossed and keep going */
          if (hit.ax === 0) p.x += (p.vx > 0 ? T.EPS : -T.EPS);
          else              p.y += (p.vy > 0 ? T.EPS : -T.EPS);
          if (p.pen <= 0){ if (!noDmg) boom(st, p, seat, rep, 'bore'); else p.alive = false; }
          continue;
        }

        if (W_.sticky){
          p.stuck = true; p.fuse = W_.fuse; p.vx = 0; p.vy = 0;
          rep.ev.push({ t:'stick', id:p.id, x:p.x, y:p.y });
          break;
        }

        if (p.bounces <= 0){
          if (!noDmg) boom(st, p, seat, rep, 'spent'); else p.alive = false;
          continue;
        }
        p.bounces--;
        const rest = W_.rest * M_BOUNCE[m];
        const fric = W_.fric * M_GRIP[m];
        if (hit.ax === 0){
          p.vx = -p.vx * rest; p.vy = p.vy * fric;
          p.x += p.vx >= 0 ? T.EPS : -T.EPS;
        } else {
          p.vy = -p.vy * rest; p.vx = p.vx * fric;
          p.y += p.vy >= 0 ? T.EPS : -T.EPS;
        }
        rep.ev.push({ t:'bounce', id:p.id, x:p.x, y:p.y, ax:hit.ax, m });

        /* come to rest: too slow to matter, sitting on something */
        if (p.vx * p.vx + p.vy * p.vy < T.DEAD_V2){
          if (!noDmg) boom(st, p, seat, rep, 'rest'); else p.alive = false;
        }
      }

      if (p.alive){
        if (p.pts.length < 4000){ p.pts.push(p.x, p.y); }
        if (p.x < -T.OUT_X || p.x > W + T.OUT_X || p.y < T.OUT_Y || p.y > H + 12){
          p.alive = false;
          rep.ev.push({ t:'gone', id:p.id, x:p.x, y:p.y });
        }
      }
    }
    if (!any) break;
    /* the last living projectile ran out of steps: let it go off where
       it is, so a throw always resolves */
    if (step === T.STEPS - 1){
      for (const p of live) if (p.alive){
        if (!noDmg) boom(st, p, seat, rep, 'timeout'); else p.alive = false;
      }
    }
  }

  rep.tracks = live.map(p => ({ id:p.id, parent:p.parent, w:p.w, pts:p.pts }));
  /* the first thing the throw touched — this is the AI's error signal
     and the only number it is ever told about its own miss */
  for (const e of rep.ev){
    if (e.t === 'bounce' || e.t === 'thump' || e.t === 'splash' ||
        e.t === 'stick'  || e.t === 'bore'  || e.t === 'boom'){
      rep.firstX = e.x; rep.firstY = e.y; break;
    }
  }
}

function firstUp(s){
  for (const c of s.crew) if (c.alive) return c;
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   10. COVER FALLING DOWN
   Deliberately small. The reference game is about the throw, not
   about a demolition simulator, so this is one honest rule run a
   bounded number of times:

     a cell is SUPPORTED if it connects, four-ways through solid
     cells, to something that cannot fall (the hull, the rock);
     anything else drops straight down its own column onto whatever
     settles below it, takes damage for the drop, and crushes what it
     lands on a little.

   Bounded twice over: at most T.SETTLE passes, and a pass that moves
   nothing stops it. It also cannot loop even without the cap — cells
   only ever move DOWN and only ever get destroyed, so the sum of
   their row numbers strictly increases on any pass that does
   anything, and that sum has a ceiling.

   The flood is restricted to a column window, which is safe here
   because the two castles and the pillar are separated by the moat:
   support cannot cross the gap, so a window that covers a whole
   castle covers the whole of any structure inside it.
   ═══════════════════════════════════════════════════════════════════ */
function windowFor(xlo, xhi){
  let lo = xlo, hi = xhi;
  if (lo <= L_X1 && hi >= L_X0){ lo = Math.min(lo, L_X0); hi = Math.max(hi, L_X1); }
  if (lo <= R_X1 && hi >= R_X0){ lo = Math.min(lo, R_X0); hi = Math.max(hi, R_X1); }
  if (lo <= ROCK_X1 && hi >= ROCK_X0){ lo = Math.min(lo, ROCK_X0); hi = Math.max(hi, ROCK_X1); }
  return { lo: Math.max(0, lo - 1), hi: Math.min(W - 1, hi + 1) };
}

function settle(st, xlo, xhi, rep){
  const g = st.g, sup = g.sup, stk = g.stk;
  const win = windowFor(xlo, xhi);
  let moved = 0, lost = 0;

  for (let pass = 0; pass < T.SETTLE; pass++){
    /* clear only the window */
    for (let y = 0; y < H; y++)
      for (let x = win.lo; x <= win.hi; x++) sup[y * W + x] = 0;

    /* seed: everything that cannot fall */
    let sp = 0;
    for (let y = 0; y < H; y++)
      for (let x = win.lo; x <= win.hi; x++){
        const i = y * W + x;
        if (M_SOLID[g.mat[i]] && M_TOUGH[g.mat[i]]){ sup[i] = 1; stk[sp++] = i; }
      }
    /* flood four ways through solid cells */
    while (sp > 0){
      const i = stk[--sp];
      const x = i % W, y = (i / W) | 0;
      if (x > win.lo && !sup[i - 1] && M_SOLID[g.mat[i - 1]]){ sup[i - 1] = 1; stk[sp++] = i - 1; }
      if (x < win.hi && !sup[i + 1] && M_SOLID[g.mat[i + 1]]){ sup[i + 1] = 1; stk[sp++] = i + 1; }
      if (y > 0     && !sup[i - W] && M_SOLID[g.mat[i - W]]){ sup[i - W] = 1; stk[sp++] = i - W; }
      if (y < H - 1 && !sup[i + W] && M_SOLID[g.mat[i + W]]){ sup[i + W] = 1; stk[sp++] = i + W; }
    }

    let did = 0;
    const crush = [];
    for (let x = win.lo; x <= win.hi; x++){
      let floor = H - 1;
      for (let y = H - 1; y >= 0; y--){
        const i = y * W + x;
        const m = g.mat[i];
        if (!M_SOLID[m]) continue;
        if (sup[i]){ floor = y - 1; continue; }
        const fall = floor - y;
        if (fall <= 0){ floor = y - 1; continue; }
        /* it drops. Below the waterline it is simply gone — the sea
           does not stack crates. */
        const h = g.hp[i];
        const dmg = fall * T.FALL_DMG;
        g.mat[i] = AIR; g.hp[i] = 0;
        creditCell(st, x, -h, -1);
        did++; moved++;
        if (dmg >= h || floor >= WATER_Y){
          lost++;
          continue;                                   /* destroyed / sunk */
        }
        const j = floor * W + x;
        g.mat[j] = m; g.hp[j] = h - dmg;
        creditCell(st, x, h - dmg, 1);
        if (floor + 1 < H) crush.push([x, floor + 1, fall * T.CRUSH]);
        floor--;
      }
    }
    /* crush damage is applied AFTER the column walk, so nothing the
       walk is standing on changes underneath it mid-pass */
    for (const c of crush) hurtCell(st, c[0], c[1], c[2], rep);
    if (!did) break;
  }
  if (moved && rep) rep.ev.push({ t:'settle', moved, lost });
  return { moved, lost };
}

/* ═══════════════════════════════════════════════════════════════════
   11. THE RAGDOLL
   Getting launched is the joke, so it has to look like something.
   Same integrator, same swept collision, same axis-aligned bounce as
   a projectile — one collider in the file, not two. Capped in steps,
   and force-settled if it ever hits the cap.
   ═══════════════════════════════════════════════════════════════════ */
function standing(st, c){
  /* feet on something solid and not moving up */
  const y = Math.floor(c.y);
  return c.vy >= 0 && (solidAt(st, Math.floor(c.x - 0.4), y) ||
                       solidAt(st, Math.floor(c.x + 0.4), y));
}

function ragdoll(st, seat, rep){
  /* anybody whose floor has just been taken away starts falling */
  for (let sd = 0; sd < 2; sd++)
    for (const c of st.sides[sd].crew)
      if (c.alive && !c.air && !standing(st, c)) c.air = true;

  for (let step = 0; step < T.CH_STEPS; step++){
    let any = false;
    for (let sd = 0; sd < 2; sd++){
      const crew = st.sides[sd].crew;
      for (let k = 0; k < crew.length; k++){
        const c = crew[k];
        if (!c.alive || !c.air) continue;
        any = true;
        c.vy += T.G;
        c.vx += st.wind * T.WIND_A * 0.35;

        let rem = 1;
        for (let sub = 0; sub < T.SUBHIT && rem > 0; sub++){
          const dx = c.vx * rem, dy = c.vy * rem;
          if (dx === 0 && dy === 0) break;
          let tw = 2;
          if (dy > 0 && c.y < WATER_Y && c.y + dy >= WATER_Y) tw = (WATER_Y - c.y) / dy;
          const hit = march(c.x, c.y, dx, dy, (cx, cy) =>
            (cx >= 0 && cx < W && cy >= 0 && cy < H) ? M_SOLID[st.g.mat[cy * W + cx]] === 1 : 0);
          const tg = hit ? hit.t : 2;
          const t = Math.min(tw, tg);
          if (t > 1){ c.x += dx; c.y += dy; rem = 0; break; }
          c.x += dx * t; c.y += dy * t;
          rem = rem * (1 - t);
          if (t === tw){
            /* IN THE DRINK. Nobody comes back out. */
            c.alive = false; c.air = false; c.wet = true; c.hp = 0;
            c.y = WATER_Y; c.vx = 0; c.vy = 0;
            rep.downed.push({ id:c.id, seat:c.seat, k:c.k, how:'water' });
            rep.ev.push({ t:'overboard', ch:c.id, x:c.x, y:WATER_Y });
            if (c.seat !== seat) rep.dealt += 40; else rep.own += 40;
            break;
          }
          const m = st.g.mat[hit.cy * W + hit.cx];
          const rest = T.CH_REST * M_BOUNCE[m];
          if (hit.ax === 0){
            c.vx = -c.vx * rest; c.vy = c.vy * T.CH_GRIP;
            c.x += c.vx >= 0 ? T.EPS : -T.EPS;
          } else {
            /* landing hurts if you came down hard. v² again. */
            if (c.vy > T.FALL_V){
              const over = c.vy * c.vy - T.FALL_V * T.FALL_V;
              hurtChar(st, c, (over * T.FALL_K) | 0, -1, rep, 'fall');
              rep.ev.push({ t:'thud', ch:c.id, x:c.x, y:c.y });
            }
            c.vy = -c.vy * rest; c.vx = c.vx * T.CH_GRIP;
            c.y += c.vy >= 0 ? T.EPS : -T.EPS;
          }
          if (!c.alive) break;
        }
        if (!c.alive) continue;
        if (c.x < -4 || c.x > W + 4){
          c.alive = false; c.air = false; c.wet = true; c.hp = 0;
          rep.downed.push({ id:c.id, seat:c.seat, k:c.k, how:'water' });
          continue;
        }
        if (c.vx * c.vx + c.vy * c.vy < T.CH_DEAD_V2 && standing(st, c)){
          c.air = false; c.vx = 0; c.vy = 0;
          c.y = Math.floor(c.y);
        }
      }
    }
    if (!any) break;
  }
  /* the cap. Put everybody down where they stand rather than leave a
     body mid-air holding state that the next turn would resume. */
  for (let sd = 0; sd < 2; sd++)
    for (const c of st.sides[sd].crew){
      if (!c.alive || !c.air) continue;
      c.air = false; c.vx = 0; c.vy = 0;
      if (c.y >= WATER_Y){
        c.alive = false; c.wet = true; c.hp = 0;
        rep.downed.push({ id:c.id, seat:c.seat, k:c.k, how:'water' });
      } else {
        const gy = groundUnder(st, c.x, c.y);
        c.y = gy < 0 ? WATER_Y : gy;
        if (c.y >= WATER_Y){ c.alive = false; c.wet = true; c.hp = 0;
          rep.downed.push({ id:c.id, seat:c.seat, k:c.k, how:'water' }); }
      }
    }
}

/* ═══════════════════════════════════════════════════════════════════
   12. THE MATCH
   A match IS (seed, opts, moves). Everything below is a function of
   those three and nothing else.
   ═══════════════════════════════════════════════════════════════════ */

/* THE ONE PLACE Math.random IS ALLOWED IN THIS FILE.
   It picks the seed for a brand-new LOCAL match and is never called
   by the simulation, by apply(), by replay() or by the AI. An online
   match takes its seed from the relay instead and never comes here.
   Same quarantine as js/poker.js's newSeed(). */
function newSeed(){
  return (Math.random() * 0x7FFFFFFF) | 0;
}

function blankSide(seat){
  return {
    seat, crew: [],
    coverHp: 0, coverCells: 0, coverHp0: 1,
    ammo: null, cool: null, tier: [0, 0, 0],
    /* THE LEDGER. coins is never read from or written to anything
       outside this file — see earnings(). The three numbers are kept
       separately so the invariant coins === purse0 + earned - spent
       can be asserted after every single move, which the harness
       does. */
    coins: 0, earned: 0, spent: 0, purse0: 0,
    buys: [], boost: 0,
    shots: 0, hits: 0, downs: 0, dealt: 0,
    mem: null
  };
}

function newMatch(seed, opts){
  opts = opts || {};
  const st = {
    v: 1,
    seed: seed | 0,
    rs: seed | 0,
    opts: {
      lvl: [ (opts.lvl && opts.lvl[0]) | 0, (opts.lvl && opts.lvl[1]) | 0 ],
      own: opts.own ? [ (opts.own[0] || []).slice(), (opts.own[1] || []).slice() ] : null,
      maxTurns: opts.maxTurns ? (opts.maxTurns | 0) : T.MAX_TURNS,
      purse: opts.purse != null ? (opts.purse | 0) : PAY.purse,
      first: (opts.first | 0) === 1 ? 1 : 0
    },
    g: {
      W, H,
      mat: new Uint8Array(N),
      hp: new Uint16Array(N),
      sup: new Uint8Array(N),
      stk: new Int32Array(N),
      cells: 0
    },
    sides: [ blankSide(0), blankSide(1) ],
    turn: 0, turnNo: 0, wind: 0,
    log: [], last: null, done: null
  };
  st.turn = st.opts.first;
  st.sides[0].tier = [0, 0, 0];
  st.sides[1].tier = [0, 0, 0];

  makeWorld(st);
  makeCrew(st);

  for (let sd = 0; sd < 2; sd++){
    const s = st.sides[sd];
    s.ammo = st.opts.own ? normLoadout(st.opts.own[sd]) : starterLoadout();
    s.cool = new Array(NW).fill(0);
    s.mem = {};
    /* the loose crates are cover too, so they count towards integrity,
       but they are not part of any slot and are never rebuilt */
    s.loose0 = Math.max(0, s.coverHp - defFullOf(st, sd));
    s.coverHp0 = s.coverHp;
    s.purse0 = st.opts.purse;
    s.coins = st.opts.purse;
    s.earned = 0; s.spent = 0;
  }
  rollWind(st);
  return st;
}

/* a loadout the UI hands in is clamped: tier 0 is always there and
   always unlimited, so a match can never deadlock on empty pockets */
function normLoadout(list){
  const out = new Array(NW).fill(0);
  for (let i = 0; i < NW; i++){
    const v = (list && list[i] != null) ? (list[i] | 0) : 0;
    out[i] = WEAPONS[i].tier === 0 ? -1 : Math.max(0, Math.min(99, v));
  }
  return out;
}

/* the wind DRIFTS rather than jumping, so it is something a player
   can learn inside one match instead of a fresh coin toss every turn */
function rollWind(st){
  const d = rint(st, -T.WIND_STEP, T.WIND_STEP);
  st.wind = clamp(st.wind + d, -T.WIND_MAX, T.WIND_MAX);
}

/* ── reading the state ────────────────────────────────────────────── */
function turnOf(st){ return st.done ? -1 : st.turn; }
function aliveCrew(st, seat){
  let n = 0;
  for (const c of st.sides[seat].crew) if (c.alive) n++;
  return n;
}
function crewHp(st, seat){
  let n = 0;
  for (const c of st.sides[seat].crew) if (c.alive) n += c.hp;
  return n;
}
/* ONE INTEGER, BIGGER IS BETTER: permille of the cover this side
   started the match with that is still standing. */
function integrity(st, seat){
  const s = st.sides[seat];
  if (s.coverHp0 <= 0) return 0;
  return clamp(Math.floor(s.coverHp * 1000 / s.coverHp0), 0, 1000);
}
function ammoOf(st, seat, w){ return st.sides[seat].ammo[w | 0]; }
function coolOf(st, seat, w){ return st.sides[seat].cool[w | 0]; }

/* ── the move ─────────────────────────────────────────────────────
   dragOf() is where the finger's float becomes the match's integers.
   Call it ONCE, on input, and never let a raw float reach apply(). */
function dragOf(fx, fy, maxPull){
  const s = maxPull > 0 ? (T.DRAG_MAX / maxPull) : 1;
  let dx = iround(fx * s), dy = iround(fy * s);
  dx = clamp(dx, -T.DRAG_MAX, T.DRAG_MAX);
  dy = clamp(dy, -T.DRAG_MAX, T.DRAG_MAX);
  /* the round cap, tested squared */
  let d2 = dx * dx + dy * dy;
  while (d2 > T.DRAG_R2){
    dx = (dx * 15 / 16) | 0; dy = (dy * 15 / 16) | 0;
    d2 = dx * dx + dy * dy;
  }
  return { dx, dy };
}

const WHY = {
  turn:   { id:'no.turn',   en:'Not your throw.',                 mt:'Mhux it-tefgħa tiegħek.' },
  over:   { id:'no.over',   en:'The match is finished.',          mt:'Il-partita spiċċat.' },
  weapon: { id:'no.weapon', en:'No such thing to throw.',         mt:'M’hemmx x’titfa’ hekk.' },
  ammo:   { id:'no.ammo',   en:'You are out of those.',           mt:'Spiċċawlek dawk.' },
  cool:   { id:'no.cool',   en:'Not ready yet.',                  mt:'Għadu mhux lest.' },
  drag:   { id:'no.drag',   en:'Pull back further than that.',    mt:'Iġbed lura aktar minn hekk.' },
  dead:   { id:'no.dead',   en:'Nobody left to throw it.',        mt:'Ma fadal ħadd biex jitfagħha.' }
};

function legal(st, mv){
  if (st.done) return { ok:false, why:WHY.over };
  if (!mv || mv.seat !== st.turn) return { ok:false, why:WHY.turn };
  if (mv.t === 'quit') return { ok:true };
  const w = mv.w | 0;
  if (!(w >= 0 && w < NW)) return { ok:false, why:WHY.weapon };
  const s = st.sides[mv.seat];
  if (s.ammo[w] === 0) return { ok:false, why:WHY.ammo };
  if (s.cool[w] > 0) return { ok:false, why:WHY.cool };
  if (!firstUp(s)) return { ok:false, why:WHY.dead };
  const dx = mv.dx | 0, dy = mv.dy | 0;
  if (Math.abs(dx) > T.DRAG_MAX || Math.abs(dy) > T.DRAG_MAX) return { ok:false, why:WHY.drag };
  if (dx * dx + dy * dy > T.DRAG_R2) return { ok:false, why:WHY.drag };
  if (dx * dx + dy * dy < 16) return { ok:false, why:WHY.drag };
  return { ok:true };
}

function blankReport(st, seat, mv){
  return {
    seat, mv: { w:mv.w | 0, dx:mv.dx | 0, dy:mv.dy | 0 },
    turnNo: st.turnNo, wind: st.wind,
    ev: [], tracks: [], hurt: [], downed: [],
    broke: 0, direct: 0, dealt: 0, own: 0,
    cover: [0, 0], coins: 0,
    firstX: null, firstY: null,
    before: [ integrity(st, 0), integrity(st, 1) ],
    after: null, crew: null
  };
}

/* ── APPLY. The log replays through here and nowhere else. ───────── */
function apply(st, mv){
  if (st.done) return null;
  if (mv.t === 'quit'){
    st.log.push({ seat:mv.seat, t:'quit' });
    st.done = {
      winner: mv.seat === 0 ? 1 : 0, loser: mv.seat,
      why: { id:'end.quit', en:'Walked off the wall.', mt:'Telaq mill-ħajt.' }
    };
    return null;
  }
  if (mv.t === 'buy'){
    const done = doBuy(st, mv.seat, mv.it);
    if (done) st.log.push({ seat:mv.seat, t:'buy', it:mv.it | 0 });
    return done;
  }
  const chk = legal(st, mv);
  if (!chk.ok) return null;

  const seat = mv.seat, s = st.sides[seat];
  const w = mv.w | 0;
  const rep = blankReport(st, seat, mv);

  /* the cells that could have moved — the window the settle uses */
  const lo0 = Math.min(L_X0, R_X0), hi0 = Math.max(L_X1, R_X1);

  throwIt(st, seat, { w, dx: mv.dx | 0, dy: mv.dy | 0 }, rep, null);
  settle(st, lo0, hi0, rep);
  ragdoll(st, seat, rep);
  /* cover knocked loose by a body landing on it, once more, bounded */
  settle(st, lo0, hi0, rep);

  if (s.ammo[w] > 0) s.ammo[w]--;
  for (let i = 0; i < NW; i++) if (s.cool[i] > 0) s.cool[i]--;
  s.cool[w] = WEAPONS[w].cool;
  s.shots++;
  if (rep.dealt > 0) s.hits++;
  s.dealt += rep.dealt;
  for (const d of rep.downed) if (d.seat !== seat) s.downs++;

  /* the ledger. Earned and held move together and are never touched
     anywhere else, which is what makes the conservation check real. */
  const pay = payFor(st, seat, rep) + PAY.stipend;
  s.earned += pay;
  s.coins += pay;
  rep.coins = pay;
  rep.purse = [ st.sides[0].coins, st.sides[1].coins ];
  s.buys = [];
  remember(st, seat, w, rep);

  rep.after = [ integrity(st, 0), integrity(st, 1) ];
  rep.crew = snapCrew(st);
  st.last = rep;
  st.log.push({ seat, w, dx: mv.dx | 0, dy: mv.dy | 0 });
  st.turnNo++;

  checkOver(st);
  if (!st.done){
    st.turn = seat === 0 ? 1 : 0;
    rollWind(st);
  }
  return rep;
}

function snapCrew(st){
  const out = [];
  for (let sd = 0; sd < 2; sd++)
    for (const c of st.sides[sd].crew)
      out.push({ id:c.id, seat:c.seat, k:c.k, x:c.x, y:c.y,
                 hp:c.hp, alive:c.alive, wet:c.wet });
  return out;
}

const END = {
  swept: { id:'end.swept', en:'Every last one of them in the moat.',
           mt:'Kollha kemm huma fil-foss.' },
  lastL: { id:'end.last',  en:'Nobody left standing in that courtyard.',
           mt:'Ħadd ma baqa’ wieqaf f’dak il-bitħa.' },
  count: { id:'end.count', en:'Out of throws. The fuller courtyard wins.',
           mt:'Spiċċaw it-tefgħat. Tirbaħ il-bitħa l-aktar mimlija.' },
  draw:  { id:'end.draw',  en:'Out of throws, and dead level.',
           mt:'Spiċċaw it-tefgħat, u ndaqs.' }
};

function checkOver(st){
  const a = aliveCrew(st, 0), b = aliveCrew(st, 1);
  if (a === 0 && b === 0){
    st.done = { winner:-1, loser:-1, why:END.draw };
    return;
  }
  if (b === 0){ st.done = { winner:0, loser:1, why: END.swept }; return; }
  if (a === 0){ st.done = { winner:1, loser:0, why: END.swept }; return; }
  if (st.turnNo >= st.opts.maxTurns * 2){
    /* the tie-break ladder, in order and stated: people first, then
       the health those people are carrying, then the cover behind
       them. Ties all the way down is a draw and says so. */
    const ka = [ a, crewHp(st, 0), integrity(st, 0) ];
    const kb = [ b, crewHp(st, 1), integrity(st, 1) ];
    for (let i = 0; i < 3; i++){
      if (ka[i] !== kb[i]){
        const wn = ka[i] > kb[i] ? 0 : 1;
        st.done = { winner:wn, loser:wn === 0 ? 1 : 0, why:END.count };
        return;
      }
    }
    st.done = { winner:-1, loser:-1, why:END.draw };
  }
}

/* a preview arc for the UI's aiming line: the same flight, with every
   write to the world switched off. Bit-identical to the real throw up
   to the first thing it breaks, which is all an aiming line shows. */
function preview(st, mv){
  if (!mv) return null;
  const rep = blankReport(st, mv.seat != null ? mv.seat : st.turn, mv);
  const seat = mv.seat != null ? mv.seat : st.turn;
  throwIt(st, seat, { w: mv.w | 0, dx: mv.dx | 0, dy: mv.dy | 0 }, rep, { noDamage:true });
  return rep;
}

/* ═══════════════════════════════════════════════════════════════════
   13. THE LEDGER AND THE SHOP

   The engine keeps the coins because coins DECIDE THE MATCH — what
   the other castle bought changes what it throws and what you have to
   throw through, so both phones must agree on it to the last coin.
   Every purchase is therefore a MOVE in the same log as a throw, and
   (seed, opts, moves) still rebuilds the match exactly, purchases and
   all.

   THE ENGINE DOES NOT TOUCH THE PLAYER'S WALLET. These coins are
   MATCH coins. It never reads KARTI's balance, never calls
   KARTI_XP.grant, never requires js/progress.js to exist. At the end,
   earnings() REPORTS what the round was worth and the UI decides
   whether to bank it. A pure engine that writes to a wallet is a pure
   engine that pays out again on every replay.

   The whole balance is the table below. It is going to be tuned
   repeatedly and none of it should ever be in code.
   ═══════════════════════════════════════════════════════════════════ */
const PAY = {
  purse:    260,   /* what both sides start the match holding          */
  stipend:  55,    /* every turn, so a bad throw is not a dead round   */
  perHp:    2,     /* per point of damage put on the enemy crew        */
  perCover: 14,    /* coins per THIS MANY points of enemy cover broken */
  perHit:   18,    /* for landing anything at all                      */
  perDown:  130,   /* for putting one of them in the moat              */
  win:      400
};

/* ── the shop, flat and index-addressed so a purchase is ONE byte ── */
const IT_AMMO = 0, IT_UP = 1, IT_FIX = 2, IT_ONE = 3;
const ONE_SHOTS = [
  { key:'SAKKITTA', cost:95,
    name:{ id:'s.bag.n', en:'Emergency sandbags', mt:'Sakkitti tal-emerġenza' },
    blurb:{ id:'s.bag.b',
      en:'Four cells of sand dropped in front of your lot, right now. Soft, so it kills a ricochet dead.',
      mt:'Erba’ ċelloli ramel jinżlu quddiem in-nies tiegħek, issa. Ratba, u għalhekk toqtol rimbalz.' } },
  { key:'TEA', cost:175,
    name:{ id:'s.tea.n', en:'A cup of tea', mt:'Tazza te’' },
    blurb:{ id:'s.tea.b',
      en:'Everybody still standing gets twenty-five back. It is Malta; tea fixes people.',
      mt:'Kull min għadu wieqaf jieħu ħamsa u għoxrin lura. Din Malta; it-te’ jsewwi n-nies.' } }
];

const SHOP = [];
(function buildShop(){
  for (const w of WEAPONS){
    if (w.tier === 0) continue;
    SHOP.push({ kind:IT_AMMO, w:w.id, n:Math.max(2, w.ammo), cost:w.cost,
                tier:w.tier, name:w.name, blurb:w.blurb });
  }
  for (let d = 0; d < NDEF; d++)
    for (let t = 1; t < NTIER; t++)
      SHOP.push({ kind:IT_UP, d, to:t, cost:DEFS[d].tiers[t].cost,
                  tier:t, name:DEFS[d].tiers[t].name, blurb:DEFS[d].tiers[t].note });
  for (let d = 0; d < NDEF; d++)
    SHOP.push({ kind:IT_FIX, d, cost:0, tier:0,
                name:{ id:'s.fix.' + d, en:'Repair the ' + DEFS[d].name.en.toLowerCase(),
                       mt:'Sewwi l-' + DEFS[d].name.mt.toLowerCase() },
                blurb:{ id:'s.fix.b',
                  en:'Rebuild what is left of it. Cheaper than upgrading, and it does not make it any tougher.',
                  mt:'Erġa’ ibni dak li fadal minnu. Irħas mit-titjib, u ma jagħmlu xejn aktar b’saħħtu.' } });
  for (let i = 0; i < ONE_SHOTS.length; i++)
    SHOP.push({ kind:IT_ONE, one:i, cost:ONE_SHOTS[i].cost, tier:1,
                name:ONE_SHOTS[i].name, blurb:ONE_SHOTS[i].blurb });
})();

/* a repair's price depends on the tier being repaired, not on how
   broken it is — so sitting on damage to get a cheap repair does not
   work, and the decision stays "mend it or save for the next tier" */
function fixCost(st, seat, d){
  const tier = st.sides[seat].tier[d];
  return 45 + ((DEFS[d].tiers[tier].cost * 40 / 100) | 0);
}
function costOf(st, seat, it){
  const S = SHOP[it | 0];
  if (!S) return -1;
  if (S.kind === IT_FIX) return fixCost(st, seat, S.d);
  return S.cost;
}

const NOBUY = {
  item:  { id:'nb.item',  en:'No such thing in the shop.',      mt:'M’hemmx dan fil-ħanut.' },
  coins: { id:'nb.coins', en:'You cannot afford that.',         mt:'Ma tiflaħx għaliha.' },
  tier:  { id:'nb.tier',  en:'That is not the next one up.',    mt:'Dik mhix li jmiss.' },
  maxed: { id:'nb.maxed', en:'That is as good as it gets.',     mt:'Aħjar minn hekk ma jsirx.' },
  full:  { id:'nb.full',  en:'You are carrying enough of those.', mt:'Qed iġġorr biżżejjed minn dawk.' },
  many:  { id:'nb.many',  en:'One shopping trip a turn is plenty.', mt:'Xirja waħda kull dawra biżżejjed.' }
};

function canBuy(st, seat, it){
  if (st.done) return { ok:false, why:WHY.over };
  if (seat !== st.turn) return { ok:false, why:WHY.turn };
  const S = SHOP[it | 0];
  if (!S) return { ok:false, why:NOBUY.item };
  const s = st.sides[seat];
  if (s.buys.length >= 12) return { ok:false, why:NOBUY.many };
  const c = costOf(st, seat, it);
  if (c > s.coins) return { ok:false, why:NOBUY.coins };
  if (S.kind === IT_UP){
    const cur = s.tier[S.d];
    if (cur >= NTIER - 1) return { ok:false, why:NOBUY.maxed };
    if (S.to !== cur + 1) return { ok:false, why:NOBUY.tier };
  }
  if (S.kind === IT_AMMO && s.ammo[S.w] >= 24) return { ok:false, why:NOBUY.full };
  return { ok:true, cost:c };
}

function doBuy(st, seat, it){
  const chk = canBuy(st, seat, it);
  if (!chk.ok) return null;
  const S = SHOP[it], s = st.sides[seat];
  s.coins -= chk.cost;
  s.spent += chk.cost;
  s.buys.push(it);
  const out = { seat, it, kind:S.kind, cost:chk.cost, name:S.name };

  if (S.kind === IT_AMMO){
    s.ammo[S.w] = Math.min(24, (s.ammo[S.w] < 0 ? 0 : s.ammo[S.w]) + S.n);
    out.w = S.w; out.ammo = s.ammo[S.w];
  } else if (S.kind === IT_UP){
    s.tier[S.d] = S.to;
    rebuildSlot(st, seat, S.d, 256);
    s.coverHp0 = defFullOf(st, seat) + s.loose0;
    out.d = S.d; out.to = S.to;
  } else if (S.kind === IT_FIX){
    rebuildSlot(st, seat, S.d, 256);
    out.d = S.d;
  } else {
    const one = ONE_SHOTS[S.one];
    if (one.key === 'SAKKITTA'){
      const sp = slotSpan(seat, 2);
      const bx = seat === 0 ? sp.x1 + 2 : sp.x0 - 3;
      for (let ax = 0; ax < 2; ax++)
        for (let ay = 0; ay < 4; ay++)
          if (ownerOf(bx + ax) === seat) put(st, bx + ax, GROUND_Y - ay, SAND);
      s.coverHp0 = defFullOf(st, seat) + s.loose0;
    } else {
      for (const c of s.crew) if (c.alive) c.hp = Math.min(T.CH_HP, c.hp + 25);
    }
    out.one = one.key;
  }
  return out;
}

/* what the throw just taken was worth to the thrower */
function payFor(st, seat, rep){
  const foe = seat === 0 ? 1 : 0;
  let c = 0;
  c += rep.dealt * PAY.perHp;
  c += ((rep.cover[foe] / PAY.perCover) | 0);
  if (rep.dealt > 0 || rep.cover[foe] > 0) c += PAY.perHit;
  for (const d of rep.downed) if (d.seat === foe) c += PAY.perDown;
  return c | 0;
}

/* what the WHOLE MATCH was worth, for the UI to hand to KARTI's own
   economy if it decides to. Reporting only — nothing is written. */
function earnings(st, seat){
  const s = st.sides[seat];
  const won = !!(st.done && st.done.winner === seat);
  const coins = s.earned + (won ? PAY.win : 0);
  return {
    coins,
    xp: (coins / 4) | 0,
    breakdown: {
      damage: s.dealt, hits: s.hits, shots: s.shots, downs: s.downs,
      rounds: Math.ceil(st.turnNo / 2), spent: s.spent, held: s.coins,
      won, winBonus: won ? PAY.win : 0
    },
    line: won
      ? { id:'earn.win',  en:'The other castle is empty. Take the lot.',
          mt:'Il-kastell l-ieħor vojt. Ħu kollox.' }
      : { id:'earn.lose', en:'You still get paid for what you knocked down.',
          mt:'Xorta titħallas ta’ dak li waqqajt.' }
  };
}

/* ═══════════════════════════════════════════════════════════════════
   14. THE MACHINE
   It is NOT handed the answer. It gets what a player gets: where its
   last throw FIRST touched something. From that it walks the next one
   in.

     lvl 1  Green    barely corrects, fumbles by nine drag units
     lvl 2  Steady   corrects properly, half-allows for the wind
     lvl 3  Sharp    brackets a straddle and interpolates
     lvl 4  Deadly   the same, tight, and shops well

   Two things it computes that a player computes by feel:
     · an OPENING GUESS from the flat-range formula. That needs one
       square root, and Math.sqrt is NOT guaranteed bit-identical
       across engines, so `isqrt()` below is an integer Newton
       iteration written out in full. Integers only, exact, therefore
       identical on every phone. THIS IS THE ONLY SQUARE ROOT IN THE
       FILE, it is in the AI's opening guess, and it is never in the
       flight path.
     · a TRANSFER when it changes weapon: it keeps the solution it
       walked in and rescales it by the ratio of muzzle speeds, which
       is what a gunner does and is two multiplications.

   Everything else is the observed miss. Its "randomness" is a hash of
   the position, exactly as js/poker.js's jitter() is, so every phone
   predicts the identical throw.
   ═══════════════════════════════════════════════════════════════════ */
function isqrt(n){
  n = n | 0;
  if (n <= 0) return 0;
  if (n < 4) return 1;
  let x = n, y = ((x + 1) / 2) | 0;
  for (let i = 0; i < 48 && y < x; i++){
    x = y;
    y = ((x + ((n / x) | 0)) / 2) | 0;
  }
  return x;
}

function foeTargetX(st, seat){
  const foe = seat === 0 ? 1 : 0;
  let sum = 0, n = 0;
  for (const c of st.sides[foe].crew) if (c.alive){ sum += c.x; n++; }
  if (!n) return foe === 0 ? (L_X0 + L_X1) / 2 : (R_X0 + R_X1) / 2;
  return sum / n;
}
function memOf(st, seat, w){
  const s = st.sides[seat];
  if (!s.mem[w]) s.mem[w] = { scale:0, hist:[], ratio:1.0 };
  return s.mem[w];
}

/* the opening guess: a drag d such that a 45° throw carries R cells.
   R = 2 * (d/VQ * vmul)² / G   =>   d² = R * G * VQ² / (2 * vmul²) */
function openGuess(st, seat, w){
  const W_ = WEAPONS[w];
  const thrower = firstUp(st.sides[seat]);
  const R = Math.abs(foeTargetX(st, seat) - (thrower ? thrower.x : 0));
  const q = (R * T.G * T.VQ * T.VQ / (2 * W_.vmul * W_.vmul)) | 0;
  return clamp(isqrt(q), 20, T.DRAG_MAX);
}

/* fold the result of a throw into the machine's memory. Called from
   apply(), NOT from think() — so the memory is part of the replayed
   state and think() stays a pure read of it. */
function remember(st, seat, w, rep){
  if (rep.firstX == null) return;
  const m = memOf(st, seat, w);
  const face = seat === 0 ? 1 : -1;
  const err = (rep.firstX - foeTargetX(st, seat)) * face;   /* + = too far */
  m.hist.push({ scale:m.scale, err, wind:rep.wind });
  if (m.hist.length > 4) m.hist.shift();
}

function think(st, seat, lvl){
  if (st.done || st.turn !== seat) return null;
  const L = LEVELS[clamp(lvl | 0, 1, 4)];
  const s = st.sides[seat];
  if (!firstUp(s)) return null;

  /* ── which one to throw ──────────────────────────────────────── */
  const usable = [];
  for (let i = 0; i < NW; i++){
    if (WEAPONS[i].tier > L.tierCap) continue;
    if (s.ammo[i] === 0 || s.cool[i] > 0) continue;
    usable.push(i);
  }
  if (!usable.length) usable.push(0);
  /* the ranging shot is the free one. Only cash in with something
     expensive once the free one is landing where it is aimed. */
  const rm = memOf(st, seat, 0);
  const dialled = rm.hist.length && Math.abs(rm.hist[rm.hist.length - 1].err) <= 7;
  let w = 0;
  if (dialled){
    let best = -1, bestScore = -1;
    for (const i of usable){
      if (i === 0) continue;
      const W_ = WEAPONS[i];
      const sc = W_.dmg + W_.peak + W_.r * 4;
      if (sc > bestScore){ bestScore = sc; best = i; }
    }
    if (best >= 0) w = best;
  }
  const W_ = WEAPONS[w];
  const m = memOf(st, seat, w);

  /* ── how hard ────────────────────────────────────────────────── */
  let scale = m.scale;
  if (!scale){
    scale = openGuess(st, seat, w);
    let src = null;
    for (let i = 0; i < NW; i++){
      const o = s.mem[i];
      if (o && o.scale && o.hist.length){ src = { m:o, w:i }; break; }
    }
    if (src) scale = clamp(src.m.scale * WEAPONS[src.w].vmul / W_.vmul, 20, T.DRAG_MAX);
  }

  const thrower = firstUp(s);
  const R = Math.max(8, Math.abs(foeTargetX(st, seat) - thrower.x));
  const h = m.hist;
  if (h.length){
    const last = h[h.length - 1];
    let done = false;
    /* BRACKETING: two past throws that straddle the target are worth
       more than any amount of proportional nudging */
    if (L.bracket && h.length >= 2){
      for (let i = h.length - 2; i >= 0; i--){
        const a = h[i], b = last;
        if ((a.err < 0) !== (b.err < 0) && a.err !== b.err && a.scale !== b.scale){
          scale = a.scale + (b.scale - a.scale) * (0 - a.err) / (b.err - a.err);
          done = true;
          break;
        }
      }
    }
    if (!done){
      /* d(range)/d(scale) = 2 * range / scale, so this much scale moves
         the landing point by that much. Pure arithmetic; the gain IS
         the difficulty setting. */
      scale = scale - last.err * L.gain * scale / (2 * R);
    }
    if (L.windFF > 0) scale -= (st.wind - last.wind) * 0.010 * L.windFF * W_.wind;
  }
  scale = clamp(scale, 20, T.DRAG_MAX);
  m.scale = scale;

  /* ── the drag ─────────────────────────────────────────────────── */
  const j = hash32([st.seed, st.turnNo, seat, w, 7]);
  const jx = (j % (2 * L.jitter + 1)) - L.jitter;
  const jy = ((j >>> 8) % (2 * L.jitter + 1)) - L.jitter;
  let dx = clamp(iround(scale) + jx, 12, T.DRAG_MAX);
  let dy = clamp(iround(scale * m.ratio) + jy, 12, T.DRAG_MAX);
  while (dx * dx + dy * dy > T.DRAG_R2){
    const nx = (dx * 31 / 32) | 0, ny = (dy * 31 / 32) | 0;
    if (nx <= 12 || ny <= 12){ dx = Math.min(dx, 88); dy = Math.min(dy, 88); break; }
    dx = nx; dy = ny;
  }
  return { seat, w, dx, dy: -dy };
}

/* ── spending. These exist so the balance harness can put them
   against each other; they also read as bot personalities, which is
   what the UI will use them as. ── */
const SPEND = ['OFF', 'DEF', 'BAL', 'RUSH', 'HOARD'];
const SPEND_NAME = {
  OFF:   { id:'sp.off',   en:'All out',             mt:'Kollox għall-attakk' },
  DEF:   { id:'sp.def',   en:'Turtle',              mt:'Fekruna' },
  BAL:   { id:'sp.bal',   en:'Balanced',            mt:'Bilanċjat' },
  RUSH:  { id:'sp.rush',  en:'Straight to the top', mt:'Dritt fil-quċċata' },
  HOARD: { id:'sp.hoard', en:'Save it up',          mt:'Iffranka' }
};

/* returns the buy moves it wants AND applies them, so think() then
   aims at the world it has just paid for */
function shopFor(st, seat, strat, lvl){
  const s = st.sides[seat];
  const out = [];
  const L = LEVELS[clamp(lvl | 0, 1, 4)];
  const round = Math.ceil((st.turnNo + 1) / 2);
  if (strat === 'HOARD' && round < 5 && s.coins < 900) return out;

  const off = strat === 'OFF' ? 1 : strat === 'DEF' ? 0
            : strat === 'RUSH' ? 0.8 : strat === 'HOARD' ? 0.8 : 0.5;

  for (let guard = 0; guard < 6; guard++){
    let best = null;
    for (let it = 0; it < SHOP.length; it++){
      const S = SHOP[it];
      const ok = canBuy(st, seat, it);
      if (!ok.ok) continue;
      let want = 0;
      if (S.kind === IT_AMMO){
        if (S.tier > L.tierCap) continue;
        want = off * (S.tier + 1) * 10;
        if (strat === 'RUSH' || strat === 'HOARD') want += S.tier * 26;
        if (s.ammo[S.w] > 4) want -= 25;
      } else if (S.kind === IT_UP){
        if (strat === 'OFF') continue;
        want = (1.4 - off) * 26 + S.to * 6;
        if (strat === 'RUSH') want += S.to * 16;
      } else if (S.kind === IT_FIX){
        if (strat === 'OFF') continue;
        const inte = integrity(st, seat);
        if (inte > 620) continue;
        want = (700 - inte) / 12;
      } else {
        want = strat === 'DEF' ? 12 : strat === 'BAL' ? 9 : 4;
        if (S.one === 1 && crewHp(st, seat) < 140) want += 30;
        if (S.one === 0 && integrity(st, seat) < 400) want += 12;
      }
      if (want <= 0) continue;
      const tb = hash32([st.seed, st.turnNo, seat, it]) % 7;
      const score = want * 100 - ok.cost / 4 + tb;
      if (!best || score > best.score || (score === best.score && it < best.it))
        best = { it, score };
    }
    if (!best) break;
    /* RUSH holds its money for the next tier rather than dribbling it */
    if (strat === 'RUSH' && s.coins < 640 && SHOP[best.it].tier < 3) break;
    out.push({ seat, t:'buy', it: best.it });
    doBuy(st, seat, best.it);
    if (out.length >= 3) break;
  }
  return out;
}

/* the whole of one machine turn: what it buys, then what it throws.
   The buys have ALREADY been applied to `st` by shopFor(), so what
   comes back is for the LOG and for the wire, not for re-application.
   `shot` still has to be run through apply(). */
function aiTurn(st, seat, lvl, strat){
  const buys = shopFor(st, seat, strat || 'BAL', lvl);
  for (const b of buys) st.log.push({ seat, t:'buy', it:b.it });
  return { buys, shot: think(st, seat, lvl) };
}

/* ═══════════════════════════════════════════════════════════════════
   15. THE WIRE
   js/mp.js's codec wants flat fields in 0..255 and REFUSES anything
   over rather than truncating it into a different move. A throw is
   three bytes; a purchase is one.

     throw     { t:'f', w, x, y }   x = dx+128, y = dy+128
     purchase  { t:'b', i }
     forfeit   { t:'q' }
   ═══════════════════════════════════════════════════════════════════ */
const WIRE_FIELDS = ['w', 'x', 'y', 'i'];
const byteOK = v => v >= 0 && v <= 255;

function encWire(mv){
  if (!mv) return null;
  if (mv.t === 'quit') return { t:'q' };
  if (mv.t === 'buy'){
    const i = mv.it | 0;
    return (i >= 0 && i < SHOP.length) ? { t:'b', i } : null;
  }
  const w = mv.w | 0, x = (mv.dx | 0) + 128, y = (mv.dy | 0) + 128;
  if (!(w >= 0 && w < NW) || !byteOK(x) || !byteOK(y)) return null;
  return { t:'f', w, x, y };
}
function decWire(o, seat){
  if (!o || typeof o.t !== 'string') return null;
  if (o.t === 'q') return { seat, t:'quit' };
  if (o.t === 'b'){
    const i = o.i | 0;
    return (i >= 0 && i < SHOP.length) ? { seat, t:'buy', it:i } : null;
  }
  if (o.t === 'f'){
    const w = o.w | 0, x = o.x | 0, y = o.y | 0;
    if (!(w >= 0 && w < NW) || !byteOK(x) || !byteOK(y)) return null;
    return { seat, w, dx: x - 128, dy: y - 128 };
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   16. REPLAY AND THE TRIPWIRE
   A match IS (seed, opts, moves). replay() proves it; fingerprint()
   is the 32-bit number two phones swap to find out EARLY that they
   have stopped agreeing, instead of finding out three turns later
   when somebody's wall falls the other way.
   ═══════════════════════════════════════════════════════════════════ */
function replay(seed, opts, moves){
  const st = newMatch(seed, opts);
  for (const mv of (moves || [])){
    if (st.done) break;
    apply(st, mv.t === 'buy'  ? { seat:mv.seat, t:'buy', it:mv.it }
           : mv.t === 'quit' ? { seat:mv.seat, t:'quit' }
           : { seat:mv.seat, w:mv.w, dx:mv.dx, dy:mv.dy });
  }
  return st;
}

const _fbuf = new Float64Array(1);
const _ibuf = new Int32Array(_fbuf.buffer);

function fingerprint(st){
  let h = 2166136261 >>> 0;
  const mix = v => { h = Math.imul((h ^ ((v | 0) >>> 0)) >>> 0, 16777619) >>> 0; };
  const bits = v => { _fbuf[0] = v; mix(_ibuf[0]); mix(_ibuf[1]); };
  mix(st.seed); mix(st.rs); mix(st.turn); mix(st.turnNo); mix(st.wind);
  mix(st.done ? (st.done.winner + 2) * 31 : 1);
  const g = st.g;
  for (let i = 0; i < N; i++){
    const m = g.mat[i];
    if (!m) continue;
    mix(i); mix(m * 65536 + g.hp[i]);
  }
  for (let sd = 0; sd < 2; sd++){
    const s = st.sides[sd];
    mix(s.coins); mix(s.earned); mix(s.spent);
    mix(s.coverHp); mix(s.coverCells); mix(s.coverHp0);
    for (let d = 0; d < NDEF; d++) mix(s.tier[d]);
    for (let i = 0; i < NW; i++){ mix(s.ammo[i] + 2); mix(s.cool[i]); }
    for (const c of s.crew){
      /* positions are doubles, so hash their BITS and not a rounded
         copy — a one-ulp divergence must show up HERE */
      mix(c.hp); mix(c.alive ? 1 : 0); mix(c.wet ? 1 : 0);
      bits(c.x); bits(c.y); bits(c.vx); bits(c.vy);
    }
  }
  return h >>> 0;
}

/* the save: a match is its seed and its moves, so that is what a save
   is. Rejoining, resuming and auditing all go through replay(); there
   is deliberately no second representation of the world that could
   drift away from this one. */
function snapshot(st){
  return {
    v: 1, seed: st.seed,
    opts: { lvl: st.opts.lvl.slice(), maxTurns: st.opts.maxTurns,
            first: st.opts.first, purse: st.opts.purse,
            own: st.opts.own ? [ st.opts.own[0].slice(), st.opts.own[1].slice() ] : null },
    log: st.log.map(m => m.t === 'buy' ? { seat:m.seat, t:'buy', it:m.it }
                       : m.t === 'quit' ? { seat:m.seat, t:'quit' }
                       : { seat:m.seat, w:m.w, dx:m.dx, dy:m.dy })
  };
}
function restore(o){
  if (!o || o.v !== 1) return null;
  return replay(o.seed | 0, o.opts || {}, o.log || []);
}

/* ═══════════════════════════════════════════════════════════════════
   17. WHAT THE SCREEN READS
   A frame is: the grid, the crew, the tracks from the last report,
   and the ledger. Nothing in this section mutates anything.
   ═══════════════════════════════════════════════════════════════════ */
function view(st){
  return {
    W, H, waterY: WATER_Y, groundY: GROUND_Y,
    span: [ { x0:L_X0, x1:L_X1 }, { x0:R_X0, x1:R_X1 } ],
    mat: st.g.mat, hp: st.g.hp,
    wind: st.wind, turn: turnOf(st), turnNo: st.turnNo,
    round: Math.ceil((st.turnNo + 1) / 2), maxRounds: st.opts.maxTurns,
    done: st.done,
    sides: [0, 1].map(sd => {
      const s = st.sides[sd];
      return {
        seat: sd, coins: s.coins, tier: s.tier.slice(),
        ammo: s.ammo.slice(), cool: s.cool.slice(),
        integrity: integrity(st, sd), alive: aliveCrew(st, sd),
        crew: s.crew.map(c => ({ id:c.id, k:c.k, x:c.x, y:c.y, hp:c.hp,
                                 alive:c.alive, wet:c.wet, name:c.name }))
      };
    }),
    last: st.last
  };
}
/* the shop as the screen wants it: every row with its live price, and
   whether it can be bought right now, and why not if not */
function shopView(st, seat){
  return SHOP.map((S, it) => {
    const ok = canBuy(st, seat, it);
    return {
      it, kind:S.kind, name:S.name, blurb:S.blurb,
      cost: costOf(st, seat, it),
      w: S.w != null ? S.w : null, d: S.d != null ? S.d : null,
      to: S.to != null ? S.to : null,
      one: S.one != null ? ONE_SHOTS[S.one].key : null,
      can: ok.ok, why: ok.ok ? null : ok.why
    };
  });
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — js/kanun-ui.js and the test harness both read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_KANUN = root.KARTI_KANUN || {};
root.KARTI_KANUN.engine = {
  /* the world */
  W, H, WATER_Y, GROUND_Y, L_X0, L_X1, R_X0, R_X1, ROCK_X0, ROCK_X1, T,
  MAT, AIR, GLASS, WOOD, SAND, BRICK, CONCRETE, STEEL, ROCK, HULL,
  matAt, hpAt, solidAt, ownerOf, idx, slotSpan, DEFS, NDEF, NTIER,
  /* the things you throw, and the shop */
  WEAPONS, NW, weaponOf, LEVELS, SHOP, ONE_SHOTS, PAY, SPEND, SPEND_NAME,
  costOf, canBuy, shopView, earnings, fixCost,
  /* a match */
  newSeed, newMatch, legal, apply, preview, replay, snapshot, restore,
  turnOf, integrity, aliveCrew, crewHp, ammoOf, coolOf, view, fingerprint,
  dragOf, firstUp,
  /* the machine */
  think, shopFor, aiTurn, foeTargetX, openGuess, isqrt,
  /* the wire */
  encWire, decWire, WIRE_FIELDS,
  /* exposed for the harness and for the UI's own hit-testing: these
     are the two bits of geometry the screen would otherwise be
     tempted to rewrite slightly differently, which is how a UI and an
     engine start disagreeing about where a wall is */
  march, segBox, sinT, cosT, sinLerp, cosLerp, hash32
};
if (typeof module !== 'undefined' && module.exports) module.exports = root.KARTI_KANUN;

})(typeof window !== 'undefined' ? window : globalThis);
