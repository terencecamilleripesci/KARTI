/* ═══════════════════════════════════════════════════════════════════
   KARTI — bomba.js
   IL-BOMBA — a Bomberman-style arena. PURE ENGINE. Rules only: no DOM,
   no canvas, no rendering, no registration, no wall-clock. The screen
   half (js/bomba-ui.js, not in this file) draws state and drives ticks.

   (Maltese: "bomba" = bomb. It is also the everyday Maltese word for
   "brilliant / a knockout", which is the tone we want for the mode —
   so the name does double duty. Kept over "splużjoni"/"blast".)

   THE GAME
     A rectangular grid. Two to eight players spawn in the corners /
     edges. Free cells you walk through, PILLARS you never can, and
     destructible BLOCKS you blow up. You drop a BOMB, it counts down,
     then throws a cross-shaped BLAST that reaches R cells up/down/left/
     right — stopped dead by a pillar, and stopped AFTER eating one
     block. A blast that reaches another bomb sets it off NOW (a chain).
     Caught in a blast, you die. Under some blocks sit POWER-UPS: an
     extra bomb, a longer blast, more speed, the ability to KICK a bomb.
     Last player alive wins. A round that will not end gets SUDDEN
     DEATH: the arena walls in, ring by ring, until it does.

   ── WHY THIS FILE EXISTS AT ALL: THE NETWORK MODEL ────────────────
     Bomberman is UNFORGIVING about timing. "Did I get out of the
     blast in time?" is a precise yes/no, decided on one tick. If two
     phones each simulate locally and reconcile afterwards, they WILL
     disagree about a death — and a death you saw that the other phone
     did not is the worst bug this genre has. So we do not reconcile.

     We run INPUT-DELAY LOCKSTEP over a fixed simulation tick.

       * Fixed tick: SIM_HZ = 16 ticks/sec (62.5 ms/tick). Justified
         below. The engine NEVER reads a clock — a tick happens when the
         UI calls step(); the UI paces those calls off requestAnimation-
         Frame, but the ENGINE is a pure function of (seed, map, inputs).

       * A player's input sampled for tick N is not applied at tick N.
         It is scheduled for tick N + D, where D is the INPUT DELAY in
         ticks. Every phone therefore has all players' inputs for tick
         N + D in hand BEFORE it simulates tick N + D, so every phone
         computes the identical world. Nobody ever disagrees about a
         death, because everybody ran the same function on the same
         bytes.

       * D is adaptive to RTT. delayTicks(rttMs) picks D so that one
         round trip fits inside D ticks with a small margin (see the
         function). js/mp.js's pingStats()/measure() feed it; the ENGINE
         just takes D as a number and never measures anything itself.

       THE TRADE, STATED PLAINLY: your own move does not happen the
       instant you press. It happens D ticks later — with D≈3 at 16Hz
       that is ~190 ms of local input lag, and up to ~200 ms on a bad
       5G link (D=3–4). That lag is the PRICE of never disagreeing about
       a death, and in this genre it is the right trade: a consistent
       190 ms feel beats an occasional "but I escaped!" every time.

       * A LATE OR MISSING input is handled DETERMINISTICALLY: repeat
         that player's last input (predictInput()). So if one phone is
         slow, everybody repeats its last stick direction identically
         and everybody STALLS THE SAME WAY — the sim never diverges, it
         just briefly plays a stale input on every phone at once. A slow
         phone slows the room; it never forks it. (The UI decides when
         to actually block waiting for a real input vs. run predicted;
         that is a policy knob, not an engine fact — see step().)

   DETERMINISM — the whole point, enforced not hoped
     * NO Math.random anywhere, except ONE documented seed pick for a
       fresh LOCAL match (freshSeed(), mirroring poker-ui's newSeed()).
       Online, the seed arrives from the relay.
     * NO Math.sin/cos/sqrt/pow/hypot ANYWHERE. Checked: grid movement,
       blast crosses and AI pathing are all integer/Manhattan work, so
       none of it is needed. (grep this file — you will find none.)
     * Positions are INTEGER grid cells plus FIXED-POINT sub-cell
       offset. SUB = 256 units per cell. A player at (col,row) with
       sub-offset moves `speed` fixed units per tick. Never a float.
     * Bomb timers, chain reactions and blast propagation resolve in a
       DEFINED, documented order every tick (see step()). Simultaneous
       events have written tiebreaks (see TIEBREAKS below), each tested.
     * The whole match is reproducible from (seed, map, ordered inputs).
       hashState() folds the world to one 32-bit integer; the harness
       replays 1000× and asserts bit-identical.

   ── TIEBREAKS (simultaneous events, all tested) ───────────────────
     T1  Two bombs due the SAME tick: they detonate in a fixed order —
         ascending by (row*cols + col) cell index. Because a detonation
         only ADDS to the set of exploding cells this tick (chains are
         resolved to a fixed point before anyone dies), the order does
         not change WHICH cells burn, only the loop order; but we fix it
         anyway so logs and any per-bomb bookkeeping are identical.
     T2  Chain reactions resolve to a FIXED POINT before deaths: we
         compute the full set of blast cells for this tick by repeatedly
         detonating every bomb whose cell is already burning, until no
         new bomb is added. Order-independent by construction (it is a
         set union), so two chains that meet produce one identical blast
         field on every phone.
     T3  Player and blast arriving on the same cell the same tick: the
         player DIES. Blast is resolved AFTER movement within a tick, and
         a player standing on a burning cell at the death check dies.
         (You cannot outrun a blast by arriving "just as" it does.)
     T4  Two players entering the SAME empty cell the same tick: BOTH
         move in (players do not collide with each other — only with
         walls, blocks and bombs). Bomberman players pass through each
         other; this removes an entire class of order-dependence.
     T5  Two players wanting to drop a bomb on the same cell same tick:
         the lower SEAT INDEX wins the cell; the other's drop is void
         (their bomb count is refunded). Deterministic by seat order.
     T6  A player pushing (kicking) a bomb into a cell another kicked
         bomb wants: bombs are moved in ascending cell-index order and a
         bomb that would enter an occupied/blocked cell simply stops.
     T7  Power-up under a block destroyed the same tick a player stands
         there: the block is removed and the item revealed this tick;
         pickup happens on the NEXT tick when the player is checked
         against a revealed item (a player never stands "inside" a
         standing block, so this case only arises via kick/spawn — the
         item still resolves deterministically by the pickup pass order).

   MAPS
     A map is a compact newline string (see MAPS below). Legend:
       #  indestructible pillar     .  free cell
       *  destructible block        1..8 spawn point for that seat
     parseMap() turns it into {cols,rows,pillar[],block[],spawns[]}. A
     VALIDATOR (validateMap) runs over every shipped map: every spawn
     reachable from every other, no spawn boxed in, and symmetry where a
     map declares itself symmetric.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ═══════════════════════════════════════════════════════════════════
   FIXED-POINT + CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */
const SUB      = 256;          /* fixed-point units per cell               */
const SIM_HZ   = 16;           /* simulation ticks per second (62.5ms)     */
/* Why 16Hz: grid movement does not need 60Hz — a cell crossing at base
   speed takes several ticks and reads smooth once the UI interpolates
   sub-cell offset. 16Hz keeps the input stream tiny (one packed byte per
   player per tick), makes input-delay D a small integer (2–4), and keeps
   the ~D-tick input lag inside the 150–200ms budget the header promised.
   8Hz felt mushy for dodging; 30Hz doubled the packets for no dodge
   benefit at these speeds. 16 is the knee. */

/* base movement speed in fixed units/tick. One cell = SUB = 256 units.
   BASE 48 => 256/48 = 5.33 => the snap-to-centre clamp lands EXACTLY on a
   cell every 6 ticks (~2.7 cells/sec at 16Hz). This is the SLOWER, more
   forgiving base the brief asked for: the old BASE 64 was 4 ticks/cell,
   4 cells/sec — a scramble; 48 is 33% calmer, so a new player can read the
   arena and dodge, yet it stays in the "clean escape budget" band the AI's
   flee model was tuned for (a swept comparison showed 48 keeps AI self-
   kills LOWER than the old 64, while 40/44/52 made the AI misjudge escapes
   — 48 is the knee). Each SPEED power-up adds SPEED_STEP, ramping back UP
   toward a fast late-round, so the calm start still powers up. The snap-at-
   centre clamp in moveActor keeps every landing exactly on a cell centre
   regardless of speed, so grid logic stays integer with no float drift. */
const BASE_SPEED  = 48;        /* 6 ticks per cell (calm)                 */
const SPEED_STEP  = 12;        /* each SPEED power-up: +12 fixed units    */
const MAX_SPEED   = 108;       /* ~3 ticks per cell cap (fast finish)     */

/* NOTE on divisor cleanliness: 256 / speed must be an integer so a
   player snaps to centre. Legal speeds are therefore 64,128 only among
   power-of-two, but we also allow 80/96/... by SNAPPING at cell centre
   (see moveActor): when a step would cross a centre, we clamp to the
   centre exactly, so alignment is exact regardless of speed. That keeps
   grid logic integer and centre-aligned while allowing fine speed. */

const BOMB_FUSE   = 48;        /* ticks from drop to detonation (3.0s) —  */
                               /* longer than the old 2.5s so a slower    */
                               /* player still has time to read and flee. */
const BLAST_LIFE  = 9;         /* ticks a blast cell stays lethal (~0.56s)*/
const START_BOMBS = 1;
const START_RANGE = 1;
const MAX_RANGE   = 9;
const MAX_BOMBS   = 8;

/* power-up kinds. The classic four (BOMB, RANGE, SPEED, KICK) plus four
   that earn their place and give a round a real scale-up feel:
     REMOTE  — hold your bombs; a second tap detonates them ALL now.
     PIERCE  — your blast passes THROUGH blocks, destroying a whole line up
               to your full range instead of stopping at the first one.
     SHIELD  — a one-hit ward: the next blast that would kill you is eaten
               and the shield is spent. Survive one mistake.
     MEGA    — the next bomb you drop is a MEGA: +2 range over your normal
               and it detonates on a shorter fuse. Consumed on drop, so it
               is a burst of power you spend, not a permanent stat.
   Every one is a deterministic integer flag on the player or bomb — no
   floats, no clock, folded into hashState — so they never fork lockstep. */
const PU = { BOMB:1, RANGE:2, SPEED:3, KICK:4, REMOTE:5, PIERCE:6, SHIELD:7, MEGA:8 };
const PU_KINDS = [PU.BOMB, PU.RANGE, PU.SPEED, PU.KICK, PU.REMOTE, PU.PIERCE, PU.SHIELD, PU.MEGA];

/* a MEGA bomb: +2 range over the player's normal, shorter fuse. */
const MEGA_BONUS  = 2;
const MEGA_FUSE   = 32;

/* directions: index-stable order used everywhere (up,down,left,right).
   dc/dr are column/row deltas. */
const DIRS = [
  { dc: 0, dr: -1 },   /* 0 up    */
  { dc: 0, dr:  1 },   /* 1 down  */
  { dc: -1, dr: 0 },   /* 2 left  */
  { dc:  1, dr: 0 }    /* 3 right */
];

/* an input for one player for one tick: a move direction (0..3) or -1
   for "no move", plus a bomb-drop bit. Packed to one byte on the wire:
   bit0..2 = dir+1 (0=none,1..4=dirs), bit3 = drop. */
const NO_DIR = -1;

/* ═══════════════════════════════════════════════════════════════════
   SEEDED RNG — same generator as poker.js/mp.js (mulberry32 family).
   The whole RNG is st.rs. Used ONLY for: choosing which power-up hides
   under a block, and AI tie-breaking. Never for physics.
   ═══════════════════════════════════════════════════════════════════ */
function rnd(st){
  st.rs = (st.rs + 0x6D2B79F5) | 0;
  let t = st.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rndInt(st, n){ return n <= 0 ? 0 : Math.floor(rnd(st) * n) % n; }

/* ONE documented seed pick for a fresh LOCAL match. Mirrors poker-ui's
   newSeed(): Math.random is legal HERE and nowhere else in the file. */
function freshSeed(){
  return (Math.floor(Math.random() * 0x7fffffff)) | 0;   /* eslint-disable-line */
}

/* a stable non-random hash, for AI "coins" and state hashing */
function hash32(list){
  let h = 2166136261;
  for (let i = 0; i < list.length; i++){
    h ^= (list[i] | 0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ═══════════════════════════════════════════════════════════════════
   MAPS — compact strings. Legend in the header. Rows are newline-split.
   A trailing `~sym` marker declares expected symmetry (see validator).
   ═══════════════════════════════════════════════════════════════════ */
const MAPS = {
  /* ══ SMALL / MEDIUM — 2 to 4 players ══════════════════════════════ */

  /* DUEL — small, 2-player, mirror. The tightest arena. */
  duell: {
    id: 'duell', sym: 'mirrorH', seats: 2, size: 'S',
    grid:
      '1.*.*.2\n' +
      '.#*#*#.\n' +
      '*.*.*.*\n' +
      '.#*#*#.\n' +
      '*.*.*.*\n' +
      '.#*#*#.\n' +
      '..*.*..'
  },
  /* OPEN — classic four-corner, now bigger (11x11) and brick-dense so
     there is plenty to blast through before players meet. */
  arena: {
    id: 'arena', sym: 'rot4', seats: 4, size: 'M',
    grid:
      '1.*...*...2\n' +
      '.#*#*#*#*#.\n' +
      '*****.*****\n' +
      '*#.#*#*#.#*\n' +
      '*.*.*.*.*.*\n' +
      '.#*#*.*#*#.\n' +
      '*.*.*.*.*.*\n' +
      '*#.#*#*#.#*\n' +
      '*****.*****\n' +
      '.#*#*#*#*#.\n' +
      '4.*...*...3'
  },
  /* MAZE — dense blocks, tight lanes. Blast-through country. */
  labirint: {
    id: 'labirint', sym: 'rot4', seats: 4, size: 'M',
    grid:
      '1.*.*.*.2\n' +
      '.#*#*#*#.\n' +
      '*.*.*.*.*\n' +
      '*#*#*#*#*\n' +
      '*.*.#.*.*\n' +
      '*#*#*#*#*\n' +
      '*.*.*.*.*\n' +
      '.#*#*#*#.\n' +
      '4.*.*.*.3'
  },
  /* CORRIDORS — long horizontal lanes divided by pillar walls, packed
     with blocks so a lane is a dig, not a sprint. */
  kurituri: {
    id: 'kurituri', sym: 'mirrorH', seats: 4, size: 'M',
    grid:
      '1..*.*.*.*..2\n' +
      '#.#.#.#.#.#.#\n' +
      '*.*.*.*.*.*.*\n' +
      '#.#.#.#.#.#.#\n' +
      '*.*.*.*.*.*.*\n' +
      '#.#.#.#.#.#.#\n' +
      '4..*.*.*.*..3'
  },
  /* ASYMMETRIC — deliberately NOT fair; a proving ground for the
     validator's "sym:none" path and for maps that just want variety. */
  gzira: {
    id: 'gzira', sym: 'none', seats: 4, size: 'M',
    grid:
      '1**.*.*....\n' +
      '.####.#.##.\n' +
      '.*.**.*.**.\n' +
      '.#.##.#.#..\n' +
      '**.*.**.**2\n' +
      '.##.#.##.#.\n' +
      '3*.**.**..*\n' +
      '.#.#.####..\n' +
      '..*.**..*.4'
  },
  /* CROSS — a pillar cross quarters the arena; four corners, medium.
     rot4-symmetric (90° about centre), brick-dense with clear pockets. */
  salib: {
    id: 'salib', sym: 'rot4', seats: 4, size: 'M',
    grid:
      '1.*****.2\n' +
      '.**#*#**.\n' +
      '*********\n' +
      '*#*#*#*#*\n' +
      '****#****\n' +
      '*#*#*#*#*\n' +
      '*********\n' +
      '.**#*#**.\n' +
      '4.*****.3'
  },

  /* ══ LARGE — 5 to 8 players. Bigger cells, more spawns, still fair. ══ */

  /* BIG ARENA — 15x13 open, eight edge spawns. The "more than 4" default. */
  gzejjer: {
    id: 'gzejjer', sym: 'mirrorH', seats: 8, size: 'L',
    grid:
      '1..*.*.5.*.*..2\n' +
      '.#*#*#*#*#*#*#.\n' +
      '*.*.*.*.*.*.*.*\n' +
      '*#*#*#*#*#*#*#*\n' +
      '*.*.*.*.*.*.*.*\n' +
      '7#*#*#*.*#*#*#8\n' +
      '*.*.*.*.*.*.*.*\n' +
      '*#*#*#*#*#*#*#*\n' +
      '*.*.*.*.*.*.*.*\n' +
      '.#*#*#*#*#*#*#.\n' +
      '4..*.*.6.*.*..3'
  },
  /* BIG MAZE — 15x13 dense labyrinth, eight spawns, lots to break. */
  katakombi: {
    id: 'katakombi', sym: 'mirrorH', seats: 8, size: 'L',
    grid:
      '1.*.*.5.*.*.*.2\n' +
      '.#*#*#*#*#*#*#.\n' +
      '*.*.*.*.*.*.*.*\n' +
      '*#.#*#*#*#*#.#*\n' +
      '*.*.*.*.*.*.*.*\n' +
      '7*#*#*.*.*#*#*8\n' +
      '*.*.*.*.*.*.*.*\n' +
      '*#.#*#*#*#*#.#*\n' +
      '*.*.*.*.*.*.*.*\n' +
      '.#*#*#*#*#*#*#.\n' +
      '4.*.*.6.*.*.*.3'
  },
  /* GRAND CORRIDORS — 19x11 long lanes for eight, pillar rows between. */
  kurituri_kbir: {
    id: 'kurituri_kbir', sym: 'mirrorH', seats: 8, size: 'L',
    grid:
      '1..*.*.*.5.*.*.*..2\n' +
      '#.#.#.#.#.#.#.#.#.#\n' +
      '*.*.*.*.*.*.*.*.*.*\n' +
      '7.*.*.*.*.*.*.*.*.8\n' +
      '*.*.*.*.*.*.*.*.*.*\n' +
      '#.#.#.#.#.#.#.#.#.#\n' +
      '*.*.*.*.*.*.*.*.*.*\n' +
      '*.*.*.*.*.*.*.*.*.*\n' +
      '*.*.*.*.*.*.*.*.*.*\n' +
      '#.#.#.#.#.#.#.#.#.#\n' +
      '4..*.*.*.6.*.*.*..3'
  }
};

/* the shipped map ids in menu order: small first, then medium, then the
   three large arenas for 5–8. The UI reads this so the picker and the
   online variant list stay in sync with the engine. */
const MAP_IDS = ['duell', 'arena', 'labirint', 'kurituri', 'gzira', 'salib',
                 'gzejjer', 'katakombi', 'kurituri_kbir'];
/* which maps are LARGE (5–8 players). Everything else caps at its spawn
   count (2 for duell, 4 for the rest). */
const LARGE_MAPS = ['gzejjer', 'katakombi', 'kurituri_kbir'];

/* how many seats a map can spawn (its declared spawn digit count). */
function mapSeats(id){
  const m = MAPS[id]; if (!m) return MAX_SEATS;
  try { return parseMap(m).spawns.length; } catch(e){ return MAX_SEATS; }
}

/* pick a fair map for a seat count, keeping the CURRENTLY chosen map if it
   already fits. More than 4 players demands a LARGE arena, so if the chosen
   map cannot seat everyone we upgrade to the first large map that can. This
   is the "if MORE THAN 4 players use a BIGGER map" rule, made deterministic
   and reachable from both the solo picker and the online lobby. */
function mapForSeats(id, seats){
  seats = Math.max(MIN_SEATS, Math.min(MAX_SEATS, seats | 0 || MIN_SEATS));
  if (MAPS[id] && mapSeats(id) >= seats) return id;
  for (const big of LARGE_MAPS) if (mapSeats(big) >= seats) return big;
  return LARGE_MAPS[0];
}

/* parse a map string to structured form. Cells are indexed r*cols+c. */
function parseMap(m){
  const grid = (typeof m === 'string') ? m : m.grid;
  const sym  = (typeof m === 'string') ? 'none' : (m.sym || 'none');
  const id   = (typeof m === 'string') ? 'custom' : (m.id || 'custom');
  const rows = grid.split('\n').filter(r => r.length > 0);
  const cols = rows.reduce((a, r) => Math.max(a, r.length), 0);
  const nr = rows.length;
  const pillar = new Array(cols * nr).fill(false);
  const block  = new Array(cols * nr).fill(false);
  const spawns = [];      /* spawns[seat] = {col,row}, seat 0-based       */
  for (let r = 0; r < nr; r++){
    const line = rows[r];
    for (let c = 0; c < cols; c++){
      const ch = c < line.length ? line[c] : '.';
      const i = r * cols + c;
      if (ch === '#') pillar[i] = true;
      else if (ch === '*') block[i] = true;
      else if (ch >= '1' && ch <= '8'){
        spawns[(+ch) - 1] = { col: c, row: r };
      }
    }
  }
  return { id, sym, cols, rows: nr, pillar, block, spawns: spawns.filter(Boolean) };
}

const idx = (mp, c, r) => r * mp.cols + c;
const inBounds = (mp, c, r) => c >= 0 && r >= 0 && c < mp.cols && r < mp.rows;

/* ═══════════════════════════════════════════════════════════════════
   MAP VALIDATOR
   Returns { ok, reasons:[], reachable, boxed:[], symOk }.
   Checks: (a) every spawn reachable from spawn 0 (so the whole live
   area is one connected component ignoring destructible blocks — a
   player can always dig to another); (b) no spawn boxed in (it must
   have at least one non-pillar neighbour to move/place into); (c) if
   the map declares symmetry, spawn positions match that symmetry.
   ═══════════════════════════════════════════════════════════════════ */
function validateMap(m){
  const mp = (m && m.cols) ? m : parseMap(m);
  const reasons = [];
  if (!mp.spawns.length){ return { ok: false, reasons: ['no spawns'], reachable: false, boxed: [], symOk: false }; }

  /* reachability: flood fill over cells that are NOT pillars (blocks are
     diggable, so they do not partition the arena for THIS test — a
     spawn behind blocks is still reachable). Spawn cells must connect. */
  const N = mp.cols * mp.rows;
  const seen = new Array(N).fill(false);
  const start = idx(mp, mp.spawns[0].col, mp.spawns[0].row);
  const stack = [start]; seen[start] = true;
  while (stack.length){
    const cur = stack.pop();
    const c = cur % mp.cols, r = (cur / mp.cols) | 0;
    for (let d = 0; d < 4; d++){
      const nc = c + DIRS[d].dc, nr2 = r + DIRS[d].dr;
      if (!inBounds(mp, nc, nr2)) continue;
      const ni = idx(mp, nc, nr2);
      if (seen[ni] || mp.pillar[ni]) continue;
      seen[ni] = true; stack.push(ni);
    }
  }
  let reachable = true;
  for (const s of mp.spawns){
    if (!seen[idx(mp, s.col, s.row)]){ reachable = false; break; }
  }
  if (!reachable) reasons.push('a spawn is unreachable');

  /* spawn on a pillar/block is illegal */
  for (let i = 0; i < mp.spawns.length; i++){
    const s = mp.spawns[i];
    const si = idx(mp, s.col, s.row);
    if (mp.pillar[si]) reasons.push('spawn ' + (i + 1) + ' on a pillar');
    if (mp.block[si])  reasons.push('spawn ' + (i + 1) + ' on a block');
  }

  /* boxed-in: a spawn with no free (non-pillar, non-block) neighbour and
     no diggable neighbour has nowhere to go — a death trap. We require at
     least one neighbour that is not a pillar (blocks can be dug). */
  const boxed = [];
  for (let i = 0; i < mp.spawns.length; i++){
    const s = mp.spawns[i];
    let open = 0;
    for (let d = 0; d < 4; d++){
      const nc = s.col + DIRS[d].dc, nr2 = s.row + DIRS[d].dr;
      if (inBounds(mp, nc, nr2) && !mp.pillar[idx(mp, nc, nr2)]) open++;
    }
    if (open === 0){ boxed.push(i); reasons.push('spawn ' + (i + 1) + ' is boxed in'); }
  }

  /* symmetry: rot4 = 90° rotational about centre; mirrorH = left-right
     mirror. We check the PILLAR layout is invariant and that spawns map
     onto spawns. 'none' skips. */
  let symOk = true;
  if (mp.sym === 'rot4' || mp.sym === 'mirrorH'){
    const map4 = (c, r) => (mp.sym === 'rot4')
      ? { c: mp.rows - 1 - r, r: c }              /* 90° for square grids */
      : { c: mp.cols - 1 - c, r: r };             /* horizontal mirror    */
    if (mp.sym === 'rot4' && mp.cols !== mp.rows){
      symOk = false; reasons.push('rot4 needs a square grid');
    } else {
      for (let r = 0; r < mp.rows && symOk; r++){
        for (let c = 0; c < mp.cols && symOk; c++){
          const t = map4(c, r);
          if (!inBounds(mp, t.c, t.r) || mp.pillar[idx(mp, c, r)] !== mp.pillar[idx(mp, t.c, t.r)]){
            symOk = false;
          }
        }
      }
      if (!symOk) reasons.push('pillars are not ' + mp.sym + ' symmetric');
    }
  }

  return {
    ok: reachable && boxed.length === 0 &&
        !reasons.some(x => /on a pillar|on a block/.test(x)) && symOk,
    reasons, reachable, boxed, symOk
  };
}

/* ═══════════════════════════════════════════════════════════════════
   THE STATE + SPAWN
   opts: { map, seats, humans, lvl, seed, delay }
   ═══════════════════════════════════════════════════════════════════ */
const MIN_SEATS = 2, MAX_SEATS = 8;

function newMatch(opts, seed){
  opts = opts || {};
  const mapDef = opts.map || MAPS.arena;
  const mp = (mapDef && mapDef.cols) ? mapDef : parseMap(mapDef);
  const n = Math.max(MIN_SEATS, Math.min(MAX_SEATS, opts.seats | 0 || Math.min(mp.spawns.length, 4)));

  const st = {
    v: 1,
    rs: (seed | 0),
    tick: 0,
    map: mp,
    /* live destructible-block grid, mutated as blocks blow up */
    block: mp.block.slice(),
    /* items[cell] = PU kind or 0; hidden until the block over it dies */
    hidden: new Array(mp.cols * mp.rows).fill(0),
    item:   new Array(mp.cols * mp.rows).fill(0),
    bombs: [],            /* {col,row,seat,fuse,range,moving:dir|-1}      */
    blasts: [],           /* {col,row,life}                              */
    players: [],
    delay: Math.max(1, Math.min(8, opts.delay | 0 || 3)),
    /* sudden death */
    sd: { active: false, next: 0, ring: 0 },
    winner: null,         /* seat index, -1 for draw, null while running */
    done: false
  };

  /* hide power-ups under a deterministic fraction of blocks (seeded) */
  seedItems(st);

  const humans = Math.max(1, Math.min(n, opts.humans | 0 || 1));
  for (let i = 0; i < n; i++){
    const sp = mp.spawns[i] || mp.spawns[i % mp.spawns.length] || { col: 1, row: 1 };
    st.players.push({
      seat: i,
      own: i < humans ? (i === 0 ? 'me' : 'hot') : 'ai',
      lvl: Math.max(1, Math.min(3, opts.lvl | 0 || 2)),
      col: sp.col, row: sp.row,
      /* sub-cell offset from cell centre, in fixed units, per axis.
         A player is always "on" cell (col,row); ox/oy is the visual
         offset toward the next cell they are walking into. */
      ox: 0, oy: 0,
      dir: 1,             /* facing, for kick direction                  */
      moving: NO_DIR,     /* the direction actually being walked this tick */
      alive: true,
      bombs: START_BOMBS, /* max simultaneous bombs                      */
      live: 0,            /* bombs currently on the field for this player */
      range: START_RANGE,
      speed: BASE_SPEED,
      kick: false,
      remote: false,      /* hold bombs; a drop-press with none to place detonates all */
      pierce: false,      /* blast passes through blocks; kicked bombs roll through */
      shield: 0,          /* one-hit wards banked (0 or more)                        */
      mega: 0,            /* MEGA bombs banked; the next drop spends one             */
      diedTick: -1,
      /* AI memory: last input we synthesised, for prediction/repeat */
      lastIn: 0,
      /* SMOOTHER CONTROLS: a one-tick buffered direction. When a player
         presses a way while still crossing a cell, we remember it and act
         on it the instant they re-centre — no dropped press, crisp turns. */
      buf: NO_DIR
    });
    /* a spawn tile and its orthogonal neighbours must be clear of blocks
       so nobody starts entombed (validator guarantees pillars are fine;
       this clears blocks so the opening move is never a wall). */
    clearSpawnPocket(st, sp.col, sp.row);
  }
  st.sd.next = suddenDeathStart(st);
  return st;
}

/* clear blocks on a spawn and its 4 neighbours (pockets), so the first
   two moves are always possible. Deterministic, no RNG. */
function clearSpawnPocket(st, c, r){
  const mp = st.map;
  const cells = [[c, r], [c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]];
  for (const [cc, rr] of cells){
    if (inBounds(mp, cc, rr)){
      const i = idx(mp, cc, rr);
      st.block[i] = false; st.hidden[i] = 0;
    }
  }
}

/* which blocks hide a power-up, and which kind. Deterministic from the
   seed: walk every block cell in index order and roll. Roughly 40% of
   blocks carry an item, split across the four kinds by fixed weights. */
function seedItems(st){
  const mp = st.map;
  const N = mp.cols * mp.rows;
  /* weighted bag. The staples (BOMB, RANGE, SPEED) are common so a round
     ramps steadily; KICK/REMOTE/PIERCE are the toys; SHIELD and MEGA are
     the rare, exciting finds. ~48% of blocks carry SOMETHING, so a dense
     map showers a digging player with progression — the "powering up"
     feel the brief asked for — while the staples keep it from being a
     lottery. Deterministic: driven only by st.rs. */
  const bag = [
    PU.BOMB,  PU.BOMB,  PU.BOMB,  PU.BOMB,
    PU.RANGE, PU.RANGE, PU.RANGE, PU.RANGE,
    PU.SPEED, PU.SPEED, PU.SPEED,
    PU.KICK,  PU.KICK,
    PU.REMOTE,
    PU.PIERCE,
    PU.SHIELD,
    PU.MEGA
  ];
  for (let i = 0; i < N; i++){
    if (!st.block[i]) continue;
    if (rnd(st) < 0.48){
      st.hidden[i] = bag[rndInt(st, bag.length)];
    }
  }
}

/* when does sudden death begin? A generous fraction of the fuse-scaled
   arena size, so ordinary rounds finish first. Fixed, no clock. */
function suddenDeathStart(st){
  const cells = st.map.cols * st.map.rows;
  /* ~ (cells) ticks, floored to a sane band: gives roughly 30-90s */
  return Math.max(SIM_HZ * 30, Math.min(SIM_HZ * 90, cells * 6));
}

/* ═══════════════════════════════════════════════════════════════════
   INPUT
   An input is a small object { dir: -1..3, drop: bool }. On the wire it
   is ONE byte. The engine consumes a full FRAME: one input per living
   player for a tick, in seat order.
   ═══════════════════════════════════════════════════════════════════ */
function encodeInput(inp){
  if (!inp) return 0;
  const d = (inp.dir | 0);
  const dir = (d >= 0 && d <= 3) ? d + 1 : 0;
  return (dir & 7) | (inp.drop ? 8 : 0);
}
function decodeInput(byte){
  byte = byte | 0;
  const dir = (byte & 7);
  return { dir: dir === 0 ? NO_DIR : dir - 1, drop: !!(byte & 8) };
}

/* the deterministic late/missing-input rule: repeat this player's last
   input byte (predictInput). A stalled phone therefore replays its last
   stick direction on every phone identically. */
function predictInput(pl){ return pl.lastIn | 0; }

/* ═══════════════════════════════════════════════════════════════════
   INPUT DELAY — D from RTT. Pure arithmetic, integer, no clock, no
   trig. Given round-trip ms, choose D ticks so a round trip plus a
   margin fits inside D tick-periods. tickMs = 1000/SIM_HZ = 62.5ms.
     needed = ceil((rtt + jitterMargin) / tickMs)
   Clamped to [2, 8]. The UI calls this with pingStats().med/worst.
   ═══════════════════════════════════════════════════════════════════ */
function delayTicks(rttMs, jitterMs){
  const tickMs = 1000 / SIM_HZ;                 /* 62.5 */
  const total = (rttMs | 0) + (jitterMs | 0 || 30);
  /* integer ceil without Math.ceil-on-float surprises */
  let d = (total + tickMs - 1) / tickMs;
  d = Math.floor(d);
  if (d * tickMs < total) d++;                  /* guard the fixed-point */
  if (d < 2) d = 2;
  if (d > 8) d = 8;
  return d;
}

/* ═══════════════════════════════════════════════════════════════════
   THE TICK — step(st, frame). frame is an array of input BYTES, one per
   player in seat order (living or not; dead players' bytes are ignored).
   A missing/short frame is padded with predicted inputs (repeat last).

   ORDER WITHIN A TICK (documented, deterministic, tested):
     1. resolve inputs -> per-player {dir,drop}; remember lastIn.
     2. MOVE every living player (ascending seat). Movement is sub-cell
        fixed-point; a player only "commits" to a new cell when centred.
        Players collide with pillars, standing blocks and bombs — never
        with each other (T4).
     3. DROP bombs requested this tick (ascending seat; T5 cell contest).
     4. KICK: advance any moving (kicked) bombs one step (ascending cell
        index; T6).
     5. TICK bomb fuses; collect bombs due (fuse<=0) this tick.
     6. DETONATE to a FIXED POINT: build the blast-cell set from all due
        bombs, chaining into any bomb whose cell is burning, until stable
        (T1/T2). Destroy blocks (revealing items), spawn blast cells.
     7. AGE blasts; drop expired ones.
     8. DEATHS: any living player standing on a burning cell dies (T3).
     9. PICKUPS: a living player centred on a revealed item takes it.
    10. SUDDEN DEATH: if past the threshold, drop the next ring of
        pillars inward on schedule; a player caught under one dies.
    11. WIN CHECK: 0 or 1 players alive -> match done.
   ═══════════════════════════════════════════════════════════════════ */
function step(st, frame){
  if (st.done) return st;
  frame = frame || [];
  const players = st.players;

  /* 1. resolve inputs */
  const ins = [];
  for (let i = 0; i < players.length; i++){
    let byte = (i < frame.length && frame[i] != null) ? (frame[i] | 0) : predictInput(players[i]);
    players[i].lastIn = byte;
    ins[i] = decodeInput(byte);
  }

  /* 2. move */
  for (let i = 0; i < players.length; i++){
    const pl = players[i];
    if (!pl.alive) continue;
    moveActor(st, pl, ins[i]);
  }

  /* 3. drop bombs (seat order, cell contest T5). REMOTE: a drop-press when
     the player has bombs LIVE and none left to place instead detonates all
     their live bombs NOW (added to `due` below). Otherwise a drop places a
     bomb — a MEGA one if the player has any banked (spends one). */
  const wantDrop = {};      /* cell -> seat that claimed it */
  const remoteFire = [];    /* bombs a remote-press set off this tick        */
  for (let i = 0; i < players.length; i++){
    const pl = players[i];
    if (!pl.alive || !ins[i].drop) continue;

    /* REMOTE detonation: pressing drop with your bombs held (remote on) and
       nothing left to place tips off everything you own, at once. */
    if (pl.remote && pl.live >= pl.bombs && pl.live > 0){
      for (const b of st.bombs) if (b.seat === pl.seat) remoteFire.push(b);
      continue;
    }

    if (pl.ox !== 0 || pl.oy !== 0) continue;         /* only when centred */
    if (pl.live >= pl.bombs) continue;
    const cell = idx(st.map, pl.col, pl.row);
    if (bombAt(st, pl.col, pl.row)) continue;         /* already a bomb here */
    if (wantDrop[cell] !== undefined) continue;       /* lower seat already won (T5) */
    wantDrop[cell] = pl.seat;
    /* a MEGA drop: +MEGA_BONUS range, shorter fuse, pierces; spends a bank. */
    const useMega = pl.mega > 0;
    if (useMega) pl.mega--;
    st.bombs.push({
      col: pl.col, row: pl.row, seat: pl.seat,
      fuse: useMega ? MEGA_FUSE : BOMB_FUSE,
      range: Math.min(MAX_RANGE + MEGA_BONUS, pl.range + (useMega ? MEGA_BONUS : 0)),
      moving: NO_DIR,
      /* a bomb remembers its owner's pierce so its blast eats a line */
      pierce: pl.pierce || useMega
    });
    pl.live++;
  }

  /* 4. advance kicked bombs one step, ascending cell index (T6) */
  moveBombs(st);

  /* 5. fuses */
  const due = [];
  for (const b of st.bombs){
    b.fuse--;
    if (b.fuse <= 0) due.push(b);
  }
  /* remote-fired bombs join the due set this tick (dedup by identity) */
  for (const b of remoteFire) if (b.fuse > 0 && due.indexOf(b) < 0) due.push(b);

  /* 6. detonate to a fixed point (chains T1/T2) */
  if (due.length) detonate(st, due);

  /* 7. age blasts */
  const keep = [];
  for (const bl of st.blasts){
    bl.life--;
    if (bl.life > 0) keep.push(bl);
  }
  st.blasts = keep;

  /* 8. deaths (T3). SHIELD: a banked ward eats the killing blast and is
     spent; the player lives THIS tick. Deterministic — checked in seat
     order, one ward per lethal tick. (A player standing in blast on the
     tick AFTER, with no ward left, dies as normal.) */
  for (const pl of players){
    if (!pl.alive) continue;
    if (burningAt(st, pl.col, pl.row)){
      if (pl.shield > 0){ pl.shield--; continue; }
      pl.alive = false; pl.diedTick = st.tick;
    }
  }

  /* 9. pickups */
  for (const pl of players){
    if (!pl.alive || pl.ox !== 0 || pl.oy !== 0) continue;
    const i = idx(st.map, pl.col, pl.row);
    if (st.item[i]){ applyItem(pl, st.item[i]); st.item[i] = 0; }
  }

  /* 10. sudden death */
  suddenDeath(st);

  /* 11. win check */
  st.tick++;
  const alive = players.filter(p => p.alive);
  if (alive.length <= 1){
    st.winner = alive.length === 1 ? alive[0].seat : -1;   /* -1 = draw */
    st.done = true;
  }
  return st;
}

/* ── movement — SMOOTHER CONTROLS (audited) ────────────────────────
   Sub-cell fixed point. A player centred on a cell (ox=oy=0) may start
   walking in a direction if the target cell is passable. Once walking,
   they accumulate `speed` units toward the target; on reaching SUB they
   snap onto the new cell (exactly, integer) and re-centre. A player is
   only ever between the cell they left and the one they entered.

   THE OLD FEEL, AND WHY IT WASN'T SMOOTH:
     · the old code moved AT MOST one cell-crossing per tick and, on the
       tick it landed a centre, set moving=NO_DIR and did NO more work —
       so a held direction lost the speed left over that tick and RE-
       STARTED next tick. At a fast speed that is a visible hitch at every
       cell boundary: walk, micro-stall, walk. Buttery it was not.
     · a direction pressed a hair before re-centring was simply dropped —
       the tick sampled NO_DIR (or the old direction) and you "missed" the
       turn, having to press again. That is the "not smooth to move" the
       brief reports.

   THE FIX (still integer, centre-aligned, deterministic — no trig):
     1. CARRY-OVER. We move in a small loop: consume the player's whole
        `speed` budget this tick, crossing a centre and CONTINUING in the
        chosen direction with the leftover if it is still held/buffered
        and passable. Continuous holding now walks continuously — no per-
        cell stall — while every landing is still EXACTLY a centre.
     2. BUFFERED TURN. A direction that arrives mid-cell is remembered in
        pl.buf and applied THE INSTANT we re-centre — the press is never
        dropped, so cornering is crisp: aim at the corner, tap the turn a
        little early, and you slide around it instead of stopping dead.
     3. A pad press IS a direction with no recognition lag: at a centre we
        act on `dir` immediately; the loop keeps momentum after. */
function moveActor(st, pl, inp){
  const dir = inp.dir;

  /* Remember a fresh press as the buffered intent. At a centre we act on
     it now; mid-cell we hold it for the coming re-centre (crisp turns). */
  if (dir !== NO_DIR) pl.buf = dir;

  /* the direction we WANT to commit at the next centre: the live press if
     there is one, else whatever we buffered earlier (so an early turn is
     honoured), else keep coasting the way we were going. */
  let budget = pl.speed;
  let guard = 0;                          /* loop bound: cannot exceed a few cells/tick */

  while (budget > 0 && guard++ < 8){
    if (pl.ox === 0 && pl.oy === 0){
      /* at a centre: choose a direction. Priority: a live press, then the
         buffered intent, then NO_DIR (stop). Held movement re-enters here
         with dir still set, so it just keeps walking. */
      let want = (dir !== NO_DIR) ? dir : pl.buf;
      if (want === NO_DIR){ pl.moving = NO_DIR; return; }
      pl.dir = want;
      const d = DIRS[want];
      const nc = pl.col + d.dc, nr = pl.row + d.dr;
      if (!passable(st, nc, nr, pl)){
        /* blocked: kick a bomb ahead if we can, then stop. Clear the buffer
           so we do not keep re-trying a wall every tick. */
        if (pl.kick && bombAt(st, nc, nr)){
          const b = bombAt(st, nc, nr);
          if (canBombMove(st, nc + d.dc, nr + d.dr)) b.moving = want;
        }
        pl.moving = NO_DIR;
        if (pl.buf === want) pl.buf = NO_DIR;
        return;
      }
      pl.moving = want;
    }

    /* advance along the committed axis by as much of the budget as fits to
       the target centre; clamp so we land EXACTLY on the centre. */
    const d = DIRS[pl.moving];
    if (d.dc !== 0){
      const target = d.dc * SUB;
      const remaining = target - pl.ox;         /* signed, toward target   */
      let step = budget;
      const mag = d.dc > 0 ? remaining : -remaining;   /* positive distance left */
      if (step > mag) step = mag;
      pl.ox += d.dc > 0 ? step : -step;
      budget -= step;
      if (pl.ox === target){ pl.col += d.dc; pl.ox = 0; pl.moving = NO_DIR; }
    } else {
      const target = d.dr * SUB;
      const remaining = target - pl.oy;
      let step = budget;
      const mag = d.dr > 0 ? remaining : -remaining;
      if (step > mag) step = mag;
      pl.oy += d.dr > 0 ? step : -step;
      budget -= step;
      if (pl.oy === target){ pl.row += d.dr; pl.oy = 0; pl.moving = NO_DIR; }
    }
    /* if we did not just re-centre, the budget is spent inside this cell;
       loop exits. If we DID re-centre with budget left, loop continues and
       re-chooses a direction (carry-over) for buttery continuous walking. */
    if (pl.moving !== NO_DIR) break;
  }
}

/* can a player step onto cell (c,r)? Free of pillar, standing block and
   bomb. Players pass through each other (T4). */
function passable(st, c, r, pl){
  const mp = st.map;
  if (!inBounds(mp, c, r)) return false;
  const i = idx(mp, c, r);
  if (mp.pillar[i]) return false;
  if (st.block[i]) return false;
  if (bombAt(st, c, r)) return false;
  return true;
}

function bombAt(st, c, r){
  for (const b of st.bombs) if (b.col === c && b.row === r) return b;
  return null;
}
function burningAt(st, c, r){
  for (const bl of st.blasts) if (bl.col === c && bl.row === r) return true;
  return false;
}
/* a bomb may move into (c,r) if it is in bounds, not a pillar/block, and
   not already holding a bomb (T6). Players do not block a kicked bomb —
   if it rolls into a player, the player will die when it detonates. */
function canBombMove(st, c, r){
  const mp = st.map;
  if (!inBounds(mp, c, r)) return false;
  const i = idx(mp, c, r);
  if (mp.pillar[i] || st.block[i]) return false;
  if (bombAt(st, c, r)) return false;
  return true;
}

/* advance kicked bombs one cell, ascending cell index so two kicked
   bombs resolve identically everywhere (T6). A bomb centred and moving
   tries to advance; if blocked it stops (moving=-1). */
function moveBombs(st){
  const ordered = st.bombs.slice().sort((a, b) =>
    (a.row * st.map.cols + a.col) - (b.row * st.map.cols + b.col));
  for (const b of ordered){
    if (b.moving === NO_DIR) continue;
    const d = DIRS[b.moving];
    const nc = b.col + d.dc, nr = b.row + d.dr;
    if (canBombMove(st, nc, nr)){ b.col = nc; b.row = nr; }
    else b.moving = NO_DIR;
  }
}

/* ── detonation to a fixed point ───────────────────────────────────
   Given the bombs due this tick, compute the full set of burning cells,
   chaining into any bomb whose CELL becomes burning, until no new bomb
   is added. Order-independent (a set union), so identical everywhere.
   Then destroy blocks (reveal items) and materialise blast cells. */
function detonate(st, due){
  const mp = st.map;
  const burning = {};                /* cell -> true                    */
  const exploded = {};               /* bomb identity by cell -> true   */
  const queue = due.slice();
  /* mark all due bombs' cells so chained bombs are found by position */
  const bombByCell = {};
  for (const b of st.bombs) bombByCell[b.row * mp.cols + b.col] = b;

  while (queue.length){
    const b = queue.shift();
    const key = b.row * mp.cols + b.col;
    if (exploded[key]) continue;
    exploded[key] = true;
    /* centre */
    addBurn(st, burning, b.col, b.row);
    /* four arms, blocked by pillar. A normal arm eats ONE block and stops;
       a PIERCE arm destroys the block and keeps going to full range. */
    for (let dd = 0; dd < 4; dd++){
      const d = DIRS[dd];
      for (let k = 1; k <= b.range; k++){
        const c = b.col + d.dc * k, r = b.row + d.dr * k;
        if (!inBounds(mp, c, r)) break;
        const i = idx(mp, c, r);
        if (mp.pillar[i]) break;                 /* pillar always stops it */
        addBurn(st, burning, c, r);
        if (st.block[i]){                         /* a destructible block   */
          destroyBlock(st, i);
          if (!b.pierce) break;                   /* normal: stop after one */
          continue;                               /* pierce: burn through   */
        }
        /* chain: a bomb sitting on this cell joins the detonation */
        const nb = bombByCell[r * mp.cols + c];
        if (nb && !exploded[r * mp.cols + c]) queue.push(nb);
      }
    }
  }

  /* remove exploded bombs, refund their owners, materialise blasts */
  const survivors = [];
  for (const b of st.bombs){
    const key = b.row * mp.cols + b.col;
    if (exploded[key]){
      const owner = st.players[b.seat];
      if (owner && owner.live > 0) owner.live--;
    } else survivors.push(b);
  }
  st.bombs = survivors;

  for (const k in burning){
    const cell = +k;
    const c = cell % mp.cols, r = (cell / mp.cols) | 0;
    /* refresh life if a blast cell already exists here */
    let found = false;
    for (const bl of st.blasts) if (bl.col === c && bl.row === r){ bl.life = BLAST_LIFE; found = true; break; }
    if (!found) st.blasts.push({ col: c, row: r, life: BLAST_LIFE });
  }
}

function addBurn(st, burning, c, r){ burning[r * st.map.cols + c] = true; }

function destroyBlock(st, i){
  if (!st.block[i]) return;
  st.block[i] = false;
  if (st.hidden[i]){ st.item[i] = st.hidden[i]; st.hidden[i] = 0; }
}

const MAX_SHIELD = 3;      /* how many wards a player may bank */
const MAX_MEGA   = 5;      /* how many mega charges a player may bank */
function applyItem(pl, kind){
  if (kind === PU.BOMB && pl.bombs < MAX_BOMBS) pl.bombs++;
  else if (kind === PU.RANGE && pl.range < MAX_RANGE) pl.range++;
  else if (kind === PU.SPEED && pl.speed < MAX_SPEED) pl.speed = Math.min(MAX_SPEED, pl.speed + SPEED_STEP);
  else if (kind === PU.KICK) pl.kick = true;
  else if (kind === PU.REMOTE) pl.remote = true;
  else if (kind === PU.PIERCE) pl.pierce = true;
  else if (kind === PU.SHIELD && pl.shield < MAX_SHIELD) pl.shield++;
  else if (kind === PU.MEGA && pl.mega < MAX_MEGA) pl.mega++;
}

/* ── sudden death: ring-by-ring indestructible collapse ────────────
   Once past st.sd.next, on a fixed cadence drop the next inward ring of
   pillars. A ring is the border of the shrinking rectangle. A player or
   bomb caught under a new pillar dies / is destroyed. Deterministic
   spiral: top row L->R, right col T->B, bottom R->L, left B->T, one cell
   per SD tick, spiralling inward. */
const SD_CADENCE = 6;      /* one pillar every 6 ticks once active */
function suddenDeath(st){
  if (st.tick < st.sd.next){ return; }
  if (!st.sd.active){ st.sd.active = true; st.sd.seq = spiralOrder(st.map); st.sd.i = 0; st.sd.acc = 0; }
  st.sd.acc++;
  if (st.sd.acc < SD_CADENCE) return;
  st.sd.acc = 0;
  if (st.sd.i >= st.sd.seq.length) return;
  const cell = st.sd.seq[st.sd.i++];
  const mp = st.map;
  const c = cell % mp.cols, r = (cell / mp.cols) | 0;
  if (mp.pillar[cell]) return;                 /* already sealed */
  mp.pillar[cell] = true;
  st.block[cell] = false; st.item[cell] = 0;
  /* a blast never sits on a pillar (invariant): clear any blast here */
  st.blasts = st.blasts.filter(bl => !(bl.col === c && bl.row === r));
  /* crush anything on it */
  for (const b of st.bombs.slice()) if (b.col === c && b.row === r){
    const o = st.players[b.seat]; if (o && o.live > 0) o.live--;
    st.bombs.splice(st.bombs.indexOf(b), 1);
  }
  /* crush any player whose cell OR whose in-progress destination is now
     sealed. A mid-move player has committed to `moving`; if the cell it
     is walking into just became a pillar it is entombed — kill it and
     stop it so it never lands `col,row` inside a wall. */
  for (const pl of st.players){
    if (!pl.alive) continue;
    let hit = (pl.col === c && pl.row === r);
    if (!hit && pl.moving !== NO_DIR){
      const d = DIRS[pl.moving];
      if (pl.col + d.dc === c && pl.row + d.dr === r) hit = true;
    }
    if (hit){ pl.alive = false; pl.diedTick = st.tick; pl.moving = NO_DIR; }
  }
}

/* the inward clockwise spiral of interior cells (skip the outer border,
   which is usually already pillar in these maps but harmless if not). */
function spiralOrder(mp){
  const out = [];
  let top = 0, bottom = mp.rows - 1, left = 0, right = mp.cols - 1;
  while (top <= bottom && left <= right){
    for (let c = left; c <= right; c++) out.push(top * mp.cols + c);
    for (let r = top + 1; r <= bottom; r++) out.push(r * mp.cols + right);
    if (top < bottom) for (let c = right - 1; c >= left; c--) out.push(bottom * mp.cols + c);
    if (left < right) for (let r = bottom - 1; r > top; r--) out.push(r * mp.cols + left);
    top++; bottom--; left++; right--;
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — AI. One pure brain, three sharpnesses. Returns an input
   BYTE for a seat, a pure function of the state (its "randomness" is a
   hash of the position + st.rs, never a clock, never Math.random). So
   an AI move replays identically on every phone.

     lvl 1  Gentle    wanders, drops bombs near blocks, weak dodging
     lvl 2  Normal    hunts blocks/items, dodges its own and others'
                      blasts, will not walk onto a lethal cell
     lvl 3  Ruthless  as 2 + hunts the nearest enemy and traps them

   THE CARDINAL RULE: an AI never steps onto a cell that will be burning
   when it arrives, and never drops a bomb it cannot then escape. That is
   what keeps self-kill rates low; the harness measures them by level.
   ═══════════════════════════════════════════════════════════════════ */

/* a danger map: for each cell, the earliest tick it becomes lethal (or
   Infinity). Accounts for every bomb's future blast (range + fuse),
   CHAIN reactions (a bomb whose cell is in another's cross detonates no
   later than that other), and currently-burning cells. Pure integer,
   no trig. This is what keeps AI self-kills low: it must model that a
   bomb three cells away setting off the one next to me kills me EARLY.

   We iterate the chain to a fixed point: start each bomb's effective
   onset at its own fuse (0 for already-burning cells), then repeatedly
   lower any bomb's onset to the min onset of any bomb whose cross covers
   its cell, until stable. Then paint each bomb's cross at its onset. */
function bombOnsets(st){
  const mp = st.map;
  const bs = st.bombs;
  const onset = bs.map(b => b.fuse);
  /* precompute each bomb's cross cells (blocked by pillar, stop after a
     block) so chain detection is a cell membership test */
  const cross = bs.map(b => {
    const cells = [b.row * mp.cols + b.col];
    for (let dd = 0; dd < 4; dd++){
      const d = DIRS[dd];
      for (let k = 1; k <= b.range; k++){
        const c = b.col + d.dc * k, r = b.row + d.dr * k;
        if (!inBounds(mp, c, r)) break;
        const i = idx(mp, c, r);
        if (mp.pillar[i]) break;
        cells.push(i);
        if (st.block[i] && !b.pierce) break;   /* pierce burns through blocks */
      }
    }
    return cells;
  });
  const cellOf = bs.map(b => b.row * mp.cols + b.col);
  /* fixed point: bomb j's onset <= onset of any bomb i whose cross hits
     bomb j's cell */
  let changed = true, guard = 0;
  while (changed && guard++ < bs.length + 2){
    changed = false;
    for (let i = 0; i < bs.length; i++){
      for (let j = 0; j < bs.length; j++){
        if (i === j) continue;
        if (cross[i].indexOf(cellOf[j]) >= 0 && onset[i] < onset[j]){
          onset[j] = onset[i]; changed = true;
        }
      }
    }
  }
  return { onset, cross };
}
function dangerMap(st){
  const mp = st.map;
  const N = mp.cols * mp.rows;
  const danger = new Array(N).fill(Infinity);
  /* currently burning: lethal now */
  for (const bl of st.blasts) danger[bl.row * mp.cols + bl.col] = 0;
  const { onset, cross } = bombOnsets(st);
  for (let b = 0; b < st.bombs.length; b++){
    const t = onset[b];
    for (const cell of cross[b]) if (t < danger[cell]) danger[cell] = t;
  }
  return danger;
}
function setDanger(danger, mp, c, r, t){
  const i = r * mp.cols + c;
  if (t < danger[i]) danger[i] = t;
}

/* passable for AI planning: not pillar, not block, not bomb. */
function walkable(st, c, r){
  const mp = st.map;
  if (!inBounds(mp, c, r)) return false;
  const i = idx(mp, c, r);
  return !mp.pillar[i] && !st.block[i] && !bombAt(st, c, r);
}

/* BFS from a cell over walkable cells, returning dist[] and a parent[]
   for path reconstruction. Distances in CELLS (not ticks). */
function bfs(st, sc, sr){
  const mp = st.map, N = mp.cols * mp.rows;
  const dist = new Array(N).fill(-1);
  const par = new Array(N).fill(-1);
  const q = [sr * mp.cols + sc];
  dist[sr * mp.cols + sc] = 0;
  let head = 0;
  while (head < q.length){
    const cur = q[head++];
    const c = cur % mp.cols, r = (cur / mp.cols) | 0;
    for (let d = 0; d < 4; d++){
      const nc = c + DIRS[d].dc, nr = r + DIRS[d].dr;
      if (!inBounds(mp, nc, nr)) continue;
      const ni = nr * mp.cols + nc;
      if (dist[ni] >= 0) continue;
      if (!walkable(st, nc, nr)) continue;
      dist[ni] = dist[cur] + 1; par[ni] = cur;
      q.push(ni);
    }
  }
  return { dist, par };
}

/* ticks it takes this player to cross one cell */
function ticksPerCell(pl){
  /* ceil(SUB / speed) — integer */
  let t = (SUB + pl.speed - 1) / pl.speed;
  return Math.floor(t) + ((Math.floor(t) * pl.speed < SUB) ? 1 : 0);
}

/* first-step direction from (sc,sr) toward the nearest cell satisfying
   want(cell) using BFS parents. Returns dir 0..3 or NO_DIR. */
function stepToward(st, sc, sr, want){
  const mp = st.map;
  const { dist, par } = bfs(st, sc, sr);
  let best = -1, bestD = Infinity;
  for (let i = 0; i < dist.length; i++){
    if (dist[i] < 0) continue;
    if (want(i, dist[i]) && dist[i] < bestD){ bestD = dist[i]; best = i; }
  }
  if (best < 0 || bestD === 0) return NO_DIR;
  /* walk parents back to the first step out of the start cell */
  let cur = best, prev = par[cur];
  const startCell = sr * mp.cols + sc;
  while (prev !== startCell && prev >= 0){ cur = prev; prev = par[cur]; }
  if (prev !== startCell) return NO_DIR;
  const c = cur % mp.cols, r = (cur / mp.cols) | 0;
  const dc = c - sc, dr = r - sr;
  for (let d = 0; d < 4; d++) if (DIRS[d].dc === dc && DIRS[d].dr === dr) return d;
  return NO_DIR;
}

/* is a cell safe to STEP ONTO at arriveTick? A cell that never burns is
   always safe. Otherwise it must not be burning at (or before) the tick
   I arrive — with a one-tick margin so the arrival/detonation ordering
   inside a tick (movement before blast) cannot catch me. Conservative on
   purpose: over-caution costs a wasted step; under-caution costs a life,
   which is exactly the self-kill we are driving to zero. */
function cellSafe(st, danger, c, r, arriveTick){
  const i = r * st.map.cols + c;
  const dt = danger[i];
  if (dt === Infinity) return true;
  return dt > arriveTick + 1;           /* onset strictly later, +1 margin */
}
/* a cell fit to REST on (stop and wait): it must not become lethal for a
   good while — at least until well after any current bomb could have gone
   off and its blast faded. Infinity is ideal; anything sooner we treat as
   not a resting place. */
function restSafe(st, danger, c, r){
  return danger[r * st.map.cols + c] === Infinity;
}

/* the first step of the safest flee from (pl.col,pl.row). BFS over cells
   reachable by SAFE-ON-ARRIVAL steps; the goal is the nearest REST-safe
   cell. Returns the first-move direction, or NO_DIR if none reachable.
   If no rest-safe cell is reachable, returns the neighbour that buys the
   most time (latest onset) among safe-on-arrival steps — never a step
   onto a cell that burns before we get there. */
function fleeStep(st, pl, danger, tpc){
  const mp = st.map, N = mp.cols * mp.rows;
  const start = pl.row * mp.cols + pl.col;
  const dist = new Array(N).fill(-1);
  const first = new Array(N).fill(NO_DIR);   /* first move that reaches cell */
  dist[start] = 0;
  const q = [start]; let head = 0;
  let bestDir = NO_DIR, bestOnset = danger[start];   /* current onset here */
  while (head < q.length){
    const cur = q[head++];
    const cc = cur % mp.cols, rr = (cur / mp.cols) | 0;
    if (cur !== start && restSafe(st, danger, cc, rr)) return first[cur];
    for (let d = 0; d < 4; d++){
      const nc = cc + DIRS[d].dc, nr = rr + DIRS[d].dr;
      if (!inBounds(mp, nc, nr)) continue;
      const ni = nr * mp.cols + nc;
      if (dist[ni] >= 0) continue;
      if (!walkable(st, nc, nr)) continue;
      const arrive = (dist[cur] + 1) * tpc;
      if (!cellSafe(st, danger, nc, nr, arrive)) continue;
      dist[ni] = dist[cur] + 1;
      first[ni] = (cur === start) ? d : first[cur];
      q.push(ni);
      /* track the deepest-onset reachable cell as a fallback goal */
      const on = danger[ni];
      if (on > bestOnset){ bestOnset = on; bestDir = first[ni]; }
    }
  }
  return bestDir;
}

/* can the AI, from (c,r), reach ANY cell that is safe once a bomb with
   `range` is dropped here (i.e. an escape exists after dropping)? Used
   so it never self-traps. Simulates the drop's danger cross plus current
   danger, then BFS for a reachable non-lethal cell within the fuse. */
function hasEscape(st, pl, c, r, range){
  const mp = st.map;
  /* danger of the world INCLUDING the bomb we are about to drop. We add
     that bomb to the list, recompute chain-aware onsets, then BFS for a
     REST-safe cell reachable strictly inside the fuse window with every
     step safe on arrival. The dropped bomb blocks its own cell, so the
     BFS routes around it (it must — you cannot stand where you dropped). */
  const dropped = { col: c, row: r, seat: pl.seat, fuse: BOMB_FUSE, range, moving: NO_DIR };
  st.bombs.push(dropped);
  const danger = dangerMap(st);
  st.bombs.pop();

  const tpc = ticksPerCell(pl);
  /* the escape must be reached before the dropped bomb (and any it
     chains) goes off. Use the actual onset of OUR cell as the deadline. */
  const deadline = danger[r * mp.cols + c];
  const N = mp.cols * mp.rows;
  const dist = new Array(N).fill(-1);
  const start = r * mp.cols + c;
  const q = [start]; dist[start] = 0;
  let head = 0;
  while (head < q.length){
    const cur = q[head++];
    const cc = cur % mp.cols, rr = (cur / mp.cols) | 0;
    /* a rest-safe cell (never burns) that is NOT our bomb's cell and is
       reached in time is a genuine escape */
    if (cur !== start && restSafe(st, danger, cc, rr)) return true;
    for (let d = 0; d < 4; d++){
      const nc = cc + DIRS[d].dc, nr = rr + DIRS[d].dr;
      if (!inBounds(mp, nc, nr)) continue;
      const ni = nr * mp.cols + nc;
      if (dist[ni] >= 0) continue;
      if (nc === c && nr === r) continue;               /* our own bomb */
      if (!walkable(st, nc, nr)) continue;
      const arriveN = (dist[cur] + 1) * tpc;
      if (arriveN >= deadline) continue;                /* too slow */
      if (!cellSafe(st, danger, nc, nr, arriveN)) continue;
      dist[ni] = dist[cur] + 1;
      q.push(ni);
    }
  }
  return false;
}

/* the AI move: returns an input byte for this seat. */
function aiInput(st, seat){
  const pl = st.players[seat];
  if (!pl || !pl.alive) return 0;
  const mp = st.map;
  const lvl = pl.lvl;
  const danger = dangerMap(st);
  const here = pl.row * mp.cols + pl.col;

  /* only decide at a cell centre; mid-cell keep walking the same way so
     we do not stutter (deterministic). */
  if (pl.ox !== 0 || pl.oy !== 0){
    return pl.lastIn & 7;   /* keep last direction, never re-drop */
  }

  const tpc = ticksPerCell(pl);

  /* 1. SURVIVE. If my cell is or will become lethal, flee. This
     dominates everything. We BFS a SAFE-ONLY graph (every edge lands on
     a cell that is safe on arrival) toward the nearest REST-safe cell,
     and take the first step of that path. If no rest-safe cell is
     reachable safely, take the step that BUYS THE MOST TIME (highest
     onset), which strictly beats standing on a fuse. */
  if (danger[here] !== Infinity){
    const flee = fleeStep(st, pl, danger, tpc);
    if (flee !== NO_DIR) return encodeInput({ dir: flee, drop: false });
    return 0;   /* truly trapped: do not sprint into an earlier blast */
  }

  /* 2. ATTACK / DIG. lvl decides ambition. Consider dropping a bomb if:
     an enemy is adjacent (lvl>=2), or a block is adjacent, AND we have a
     bomb spare AND an escape exists. */
  const wantBomb = pl.live < pl.bombs;
  if (wantBomb){
    let adjEnemy = false, adjBlock = false;
    for (let d = 0; d < 4; d++){
      const nc = pl.col + DIRS[d].dc, nr = pl.row + DIRS[d].dr;
      if (!inBounds(mp, nc, nr)) continue;
      const i = idx(mp, nc, nr);
      if (st.block[i]) adjBlock = true;
      for (const o of st.players)
        if (o.alive && o.seat !== seat && o.col === nc && o.row === nr) adjEnemy = true;
    }
    /* also enemy on our own cell (rare, pass-through) */
    for (const o of st.players)
      if (o.alive && o.seat !== seat && o.col === pl.col && o.row === pl.row) adjEnemy = true;

    const aggressive = (lvl >= 2 && adjEnemy) || adjBlock || (lvl === 1 && adjBlock);
    if (aggressive && hasEscape(st, pl, pl.col, pl.row, pl.range)){
      return encodeInput({ dir: NO_DIR, drop: true });
    }
  }

  /* 3. SEEK. Path to the nearest item, else nearest block-adjacent cell,
     else (lvl3) the nearest enemy. When NOT fleeing we hold to a higher
     bar than mere arrival-safety: the next cell must be REST-safe (never
     in any live bomb's cross). Stepping into a blast lane "because the
     fuse is long" is exactly how an AI wanders into its own bomb — so we
     forbid it outright while seeking. */
  const seek = (want) => {
    const dir = stepToward(st, pl.col, pl.row, want);
    if (dir === NO_DIR) return NO_DIR;
    const d = DIRS[dir];
    if (!restSafe(st, danger, pl.col + d.dc, pl.row + d.dr)) return NO_DIR;
    return dir;
  };

  /* nearest visible item */
  let dir = seek((cell) => st.item[cell] !== 0);
  if (dir !== NO_DIR) return encodeInput({ dir, drop: false });

  /* lvl3: hunt the nearest enemy (get adjacent to a block/enemy) */
  if (lvl >= 3){
    dir = seek((cell) => {
      const c = cell % mp.cols, r = (cell / mp.cols) | 0;
      for (const o of st.players)
        if (o.alive && o.seat !== seat){
          const md = (o.col > c ? o.col - c : c - o.col) + (o.row > r ? o.row - r : r - o.row);
          if (md === 1) return true;
        }
      return false;
    });
    if (dir !== NO_DIR) return encodeInput({ dir, drop: false });
  }

  /* nearest cell adjacent to a standing block (to dig toward items) */
  dir = seek((cell) => {
    const c = cell % mp.cols, r = (cell / mp.cols) | 0;
    for (let d = 0; d < 4; d++){
      const nc = c + DIRS[d].dc, nr = r + DIRS[d].dr;
      if (inBounds(mp, nc, nr) && st.block[idx(mp, nc, nr)]) return true;
    }
    return false;
  });
  if (dir !== NO_DIR) return encodeInput({ dir, drop: false });

  /* nothing to do: a deterministic wander using st.rs + position, never
     into danger. Picks the lowest-index safe neighbour biased by hash so
     it does not oscillate on one cell forever. */
  const h = hash32([st.rs, seat, st.tick >> 3, pl.col, pl.row]);
  for (let k = 0; k < 4; k++){
    const d = (h + k) & 3;
    const nc = pl.col + DIRS[d].dc, nr = pl.row + DIRS[d].dr;
    if (walkable(st, nc, nr) && restSafe(st, danger, nc, nr))
      return encodeInput({ dir: d, drop: false });
  }
  return 0;
}

/* build a full input frame: human bytes as given (map seat->byte), AI
   seats filled by aiInput. The UI passes human inputs; this is a
   convenience for local play and the test harness. */
function aiFrame(st, humanBytes){
  humanBytes = humanBytes || {};
  const frame = [];
  for (const pl of st.players){
    if (!pl.alive){ frame.push(0); continue; }
    if (pl.own === 'ai') frame.push(aiInput(st, pl.seat));
    else frame.push(humanBytes[pl.seat] != null ? (humanBytes[pl.seat] | 0) : predictInput(pl));
  }
  return frame;
}

/* ═══════════════════════════════════════════════════════════════════
   STATE HASH — fold the whole world to one 32-bit int for determinism
   testing. Everything that can differ between phones is folded in.
   ═══════════════════════════════════════════════════════════════════ */
function hashState(st){
  const acc = [st.tick, st.winner === null ? 999 : st.winner, st.done ? 1 : 0, st.rs];
  for (const p of st.players)
    acc.push(p.seat, p.col, p.row, p.ox, p.oy, p.alive ? 1 : 0,
             p.bombs, p.live, p.range, p.speed, p.kick ? 1 : 0, p.dir, p.moving,
             p.buf, p.remote ? 1 : 0, p.pierce ? 1 : 0, p.shield | 0, p.mega | 0);
  /* bombs and blasts in cell order so array order cannot leak in */
  const bs = st.bombs.slice().sort((a, b) => (a.row * st.map.cols + a.col) - (b.row * st.map.cols + b.col));
  for (const b of bs) acc.push(1000 + b.col, b.row, b.seat, b.fuse, b.range, b.moving, b.pierce ? 1 : 0);
  const bl = st.blasts.slice().sort((a, b) => (a.row * st.map.cols + a.col) - (b.row * st.map.cols + b.col));
  for (const x of bl) acc.push(2000 + x.col, x.row, x.life);
  const N = st.map.cols * st.map.rows;
  for (let i = 0; i < N; i++){ if (st.block[i]) acc.push(3000 + i); if (st.item[i]) acc.push(4000 + i, st.item[i]); if (st.map.pillar[i]) acc.push(5000 + i); }
  return hash32(acc);
}

/* invariants — the test harness asserts these EVERY tick. Returns an
   array of violation strings (empty = clean). */
function invariants(st){
  const bad = [];
  const mp = st.map;
  /* no player inside a wall/pillar/standing block */
  for (const p of st.players){
    if (!p.alive) continue;
    const i = idx(mp, p.col, p.row);
    if (mp.pillar[i]) bad.push('player ' + p.seat + ' in pillar');
    if (st.block[i]) bad.push('player ' + p.seat + ' in block');
    if (!inBounds(mp, p.col, p.row)) bad.push('player ' + p.seat + ' out of bounds');
    if (p.ox < -SUB || p.ox > SUB || p.oy < -SUB || p.oy > SUB) bad.push('player ' + p.seat + ' sub-cell overflow');
  }
  /* no two bombs on one cell; no negative timers */
  const seen = {};
  for (const b of st.bombs){
    const k = b.row * mp.cols + b.col;
    if (seen[k]) bad.push('two bombs on cell ' + k);
    seen[k] = true;
    if (b.fuse < 0) bad.push('negative fuse');
    if (mp.pillar[idx(mp, b.col, b.row)]) bad.push('bomb in pillar');
  }
  /* blasts never sit on a pillar (a blast never passes a pillar) */
  for (const bl of st.blasts){
    if (bl.life < 0) bad.push('negative blast life');
    if (mp.pillar[idx(mp, bl.col, bl.row)]) bad.push('blast on pillar');
  }
  return bad;
}

/* ═══════════════════════════════════════════════════════════════════
   OVER — the verdict, relative to the local player. Text is left to the
   UI's T() (lang.js rule: engines do not author player-visible strings);
   this returns a structured result the UI phrases.
   ═══════════════════════════════════════════════════════════════════ */
function meSeat(st){
  const i = st.players.findIndex(p => p.own === 'me' || p.own === 'hot');
  return i < 0 ? 0 : i;
}
function over(st){
  if (!st.done) return null;
  const me = meSeat(st);
  const iWon = st.winner === me;
  return {
    tone: iWon ? 'win' : (st.winner === -1 ? 'draw' : 'lose'),
    winner: st.winner,           /* seat index, or -1 for a mutual death */
    ticks: st.tick
  };
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — js/bomba-ui.js and the test harness both read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_BOMBA = root.KARTI_BOMBA || {};
root.KARTI_BOMBA.engine = {
  /* tuning constants (UI needs SUB, SIM_HZ for interpolation/pacing) */
  SUB, SIM_HZ, BASE_SPEED, SPEED_STEP, MAX_SPEED, BOMB_FUSE, BLAST_LIFE,
  MEGA_BONUS, MEGA_FUSE, MAX_RANGE, MAX_BOMBS, MAX_SHIELD, MAX_MEGA,
  PU, PU_KINDS, DIRS, NO_DIR,
  MIN_SEATS, MAX_SEATS,
  /* maps + validation */
  MAPS, MAP_IDS, LARGE_MAPS, mapSeats, mapForSeats, parseMap, validateMap, idx, inBounds,
  /* match lifecycle */
  newMatch, step, over, meSeat,
  /* network model */
  delayTicks, encodeInput, decodeInput, predictInput, aiInput, aiFrame,
  /* introspection for UI + tests */
  bombAt, burningAt, dangerMap, hashState, invariants,
  /* seed pick for a fresh local match (the one Math.random) */
  freshSeed
};

})(typeof window !== 'undefined' ? window : globalThis);
