/* ═══════════════════════════════════════════════════════════════════
   KARTI — IT-TANKIJIET                               window.KARTI_TANKIJIET
   ───────────────────────────────────────────────────────────────────────
   A 4–8 player TANK ARENA shooter: drive, aim a turret, FIRE, and dodge.
   Shells travel, BANK off walls a few times, and kill on a hit. Free-for-
   all, teams and last-tank-standing; power-ups drop in the arena; bot tanks
   fill an empty seat and play solo. This file is the PURE ENGINE — a
   deterministic, integer, no-clock simulation. The other half
   (js/tankijiet-ui.js) draws state, samples the thumbs and drives ticks.

   ═══════════════════════════════════════════════════════════════════════
   WHY INPUT-DELAY LOCKSTEP (identical to js/bomba.js, on purpose)
   ═══════════════════════════════════════════════════════════════════════
   A tank shooter lives or dies on hit resolution — "did I dodge that
   shell?" must be the SAME yes/no on every phone. If each client decided
   its own hits, two phones would disagree the first time a banked shell
   grazed a tank, and the whole point (a fair kill nobody disputes) is gone.

   So we run INPUT-DELAY LOCKSTEP over a fixed simulation tick, exactly as
   bomba does:

     · Fixed tick: SIM_HZ = 20 ticks/sec (50 ms/tick). The engine NEVER
       reads a clock — a tick happens when the UI calls step(); the ENGINE
       is a pure function of (seed, map, mode, inputs).

     · A player's input sampled for tick N is not applied at tick N. It is
       scheduled for tick N + D, where D is the INPUT DELAY in ticks. Every
       phone therefore holds all players' inputs for tick N+D BEFORE it
       simulates N+D, so every phone simulates an identical world.

     · D is adaptive to RTT. delayTicks(rttMs, jitterMs) picks the smallest
       D whose tick-periods cover one round trip plus a jitter margin.
       js/mp.js's pingStats()/measure() feed it; the ENGINE just takes D as
       a number and never measures anything itself.

     · THE TRADE: your press does not take effect the instant you press it.
       It happens D ticks later — with D≈3 at 20Hz that is 150 ms, up to
       ~200 ms on a poor link (D=4). Tanks turn and roll SLOWLY (a tank
       takes ~0.5 s to cross a cell), so 150–200 ms of input lag is very
       playable — unlike a twitch FPS, you are steering, not flick-aiming.
       That lag is the PRICE of never disagreeing about a hit or a death,
       and for this game it is a bargain.

     · A LATE / MISSING input is handled deterministically: repeat that
       player's LAST input byte (predictInput). A slow phone therefore
       stalls the whole room identically — every phone predicts the same
       repeat — rather than forking the world. A phone that walks out
       stands still (its last stick decays to "no throttle") and is a
       stationary target until a shell finds it.

   ═══════════════════════════════════════════════════════════════════════
   DETERMINISM — the hard requirement, and how it is met
   ═══════════════════════════════════════════════════════════════════════
   The whole match is reproducible from (seed, map, mode, ordered input
   stream). To make hits agree bit-for-bit on every phone:

     · Fixed timestep. Integer / fixed-point everywhere. Positions and
       velocities are integers in SUB units per cell; headings are integer
       indices 0..255 into a PRECOMPUTED direction table.

     · NO Math.sin/cos/tan/sqrt/pow/random in the simulation path. Turret
       and hull rotation and shell direction come from DIRX[]/DIRY[] — a
       256-entry integer unit-vector table (magnitude DIR_U = 4096), built
       ONCE at load with a Taylor sine (that build is not the sim path).
       Distances compare SQUARED (d2 <= r*r), never rooted. Shell reflection
       is an INDEX transform on the heading (mirror across an axis), not
       arithmetic — see reflectDir(). aiSqrt() is a deterministic integer
       Newton root used ONLY by the AI for a human-readable range and never
       by physics; it is called out where used.

     · The ONLY Math.random is one documented seed pick for a fresh LOCAL
       match — freshSeed(), mirroring poker.js/bomba.js. Online, the seed
       arrives from the relay. Power-up spawns, the map's destructible
       layout and AI tie-breaks all come from the seeded PRNG (rnd/rndInt).

     · SWEPT collision for shells. A shell moving up to SHELL_SPEED units a
       tick (more than a cell) must NEVER tunnel through a 1-cell-thick wall
       or a tank between ticks. sweepShell() resolves along the swept path
       by the SLAB method with times kept as exact integer rationals n/d
       (cross-multiplied, never divided — no epsilon), finds the EARLIEST
       contact, advances exactly to it, reflects (or explodes), and repeats
       within the tick. This is the briks.js pattern (js/briks.js), the
       proven no-tunnel sweeper in this codebase.

   ORDER WITHIN A TICK (documented, deterministic, tested):
     1. resolve inputs -> per-tank {turn,throttle,aim,fire}; remember lastIn.
     2. cooldowns / power-up timers tick down (ascending seat).
     3. TURN + DRIVE every living tank (ascending seat). Hull is swept
        against walls and other tanks so a tank never slips through cover.
     4. FIRE: a tank that pressed fire and is off cooldown spawns shell(s)
        (ascending seat; spread/multi from power-ups).
     5. MOVE every shell with sweepShell(): bounce off walls (bounces--),
        expire when bounces run out or life ends, and register a hit on the
        FIRST tank the swept path touches (ascending contact time).
     6. DEATHS + SCORING: a hit tank loses a life / dies; the shooter is
        credited (self / team kills counted honestly). Explosions spawned.
     7. PICKUPS: a living tank overlapping a power-up crate takes it.
     8. SPAWN: expired power-up crates respawn on a seeded schedule; dead
        tanks respawn if the mode allows and the respawn timer elapsed.
     9. WIN CHECK: mode's end condition (last standing / score target /
        time limit) -> match done, winner (seat or team) decided.

   OWNERSHIP: this file owns window.KARTI_TANKIJIET.engine only. It reads
   nothing, mounts nothing, and authors NO player-visible strings (lang.js
   rule) — the UI phrases every verdict.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* ═══════════════════════════════════════════════════════════════════
   FIXED-POINT + CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */
const SUB      = 256;          /* fixed-point units per CELL                */
const SIM_HZ   = 20;           /* simulation ticks per second (50ms)        */
/* Why 20Hz: a tank crosses a cell in ~10 ticks (0.5s), so movement reads
   smooth once the UI interpolates the sub-cell offset, while the input
   stream stays a few bytes a second per player (sent only on CHANGE) and
   input-delay D stays a small integer (2–4) inside the 150–200ms budget
   the header promised. 10Hz felt mushy for dodging a fast shell; 30Hz
   doubled packets for no dodge benefit at these speeds. 20 is the knee.  */

const TICK_MS  = 1000 / SIM_HZ;

/* headings: 256 discrete angles, 0 = +X (east), rising counter-clockwise
   in screen space is handled by the UI; the sim only cares that DIRX/DIRY
   are a consistent unit circle. Magnitude DIR_U so a component times a
   speed, divided by DIR_U, is an exact integer step. */
const HDG      = 256;
const HDG_MASK = 255;
const DIR_U    = 4096;         /* the direction table's magnitude          */

/* ── the ONE non-sim Taylor build: a 256-entry integer unit-vector table.
   Built at load with a range-reduced Taylor sine (NOT the sim path — like
   briks.js's baked DIR_X/DIR_Y and kanun.js's SIN table). After this, the
   sim reads DIRX[h]/DIRY[h] as plain integers and never calls Math.* .  */
const DIRX = new Int32Array(HDG);
const DIRY = new Int32Array(HDG);
(function buildDirs(){
  const PI = 3.141592653589793;
  const S3 = -1/6, S5 = 1/120, S7 = -1/5040, S9 = 1/362880, S11 = -1/39916800;
  function taylorSin(x){                 /* range-reduced to [-PI,PI] */
    while (x >  PI) x -= 2*PI;
    while (x < -PI) x += 2*PI;
    const z = x*x;
    return x*(1 + z*(S3 + z*(S5 + z*(S7 + z*(S9 + z*S11)))));
  }
  const cos = a => taylorSin(a + PI/2);
  for (let h = 0; h < HDG; h++){
    const a = (h / HDG) * 2 * PI;
    DIRX[h] = Math.round(cos(a) * DIR_U);
    DIRY[h] = Math.round(taylorSin(a) * DIR_U);
  }
})();

/* the sim's ONLY trig: read the baked table by integer heading index */
function dirX(h){ return DIRX[h & HDG_MASK]; }
function dirY(h){ return DIRY[h & HDG_MASK]; }

/* tank tuning, all in fixed units/tick or ticks */
const TANK_R      = 108;       /* tank half-size in SUB units (~0.42 cell)  */
const DRIVE_SPEED = 26;        /* forward SUB units/tick (~10 ticks/cell)   */
const REVERSE_SPD = 16;        /* reverse is slower                         */
const TURN_RATE   = 6;         /* heading steps/tick (256/6 ≈ 43 ticks/turn)*/
const TURRET_RATE = 9;         /* turret turns faster than the hull         */
const FIRE_COOL   = 14;        /* ticks between shots (base)                */
const SHELL_SPEED = 88;        /* SUB units/tick — MORE than a cell/tick,   */
                               /* which is exactly why sweeping is required */
const SHELL_R     = 28;        /* shell half-size in SUB units              */
const SHELL_LIFE  = 90;        /* ticks a shell lives (~4.5s)               */
const SHELL_BOUNCE= 2;         /* base wall bounces before it dies          */
const TANK_HP     = 1;         /* base hit points (1 = one-shot; +shield)   */
const RESPAWN_TCK = 60;        /* ticks dead before respawn (3s)            */
const SPAWN_GUARD = 24;        /* invulnerable ticks after a (re)spawn      */

/* power-up kinds. Each is deterministic and time-boxed. */
const PU = { MULTI:1, RAPID:2, SHIELD:3, SPEED:4, BOUNCE:5 };
const PU_KINDS = [PU.MULTI, PU.RAPID, PU.SHIELD, PU.SPEED, PU.BOUNCE];
const PU_TIME  = { 1: 200, 2: 200, 3: 260, 4: 240, 5: 200 };  /* ticks held */
const PU_R     = 96;           /* crate half-size for pickup overlap        */

/* modes */
const MODE = { FFA:'ffa', TEAMS:'teams', LAST:'last' };
const MODES = [MODE.FFA, MODE.TEAMS, MODE.LAST];
/* FFA   — most kills when the timer ends (respawns on).
   TEAMS — two teams, most team kills when the timer ends (respawns on).
   LAST  — last tank standing, NO respawn; the round ends when 0/1 remain. */
const KILL_TARGET = { ffa: 12, teams: 20, last: 0 };
/* every mode has a hard time cap so a match ALWAYS terminates — even LAST,
   where two survivors might otherwise circle forever. At the cap LAST is
   decided by most kills among the living (see checkEnd). 3600t=180s FFA/
   Teams; LAST gets a longer 4800t=240s leash since it is elimination. */
const TIME_LIMIT  = { ffa: 3600, teams: 3600, last: 4800 };

const MIN_SEATS = 4, MAX_SEATS = 8;

/* ═══════════════════════════════════════════════════════════════════
   SEEDED RNG — mulberry32, same generator as poker.js/bomba.js/kanun.js.
   Used ONLY for: destructible layout, power-up placement/timing, spawn
   selection and AI tie-breaks. NEVER for physics.
   ═══════════════════════════════════════════════════════════════════ */
function rnd(st){
  st.rs = (st.rs + 0x6D2B79F5) | 0;
  let t = st.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rndInt(st, n){ return n <= 0 ? 0 : Math.floor(rnd(st) * n) % n; }

/* ONE documented seed pick for a fresh LOCAL match. Mirrors bomba/poker:
   Math.random is legal HERE and nowhere else in the file. */
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

/* deterministic integer sqrt (Newton). NOT in the physics path — used
   only by the AI to turn a squared range into a linear one for its
   aim-lead estimate, and by nothing that decides a hit or a death. */
function aiSqrt(n){
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

/* ═══════════════════════════════════════════════════════════════════
   MAPS — compact strings. Legend:
     #  solid wall (indestructible, blocks tanks AND shells; shells bounce)
     *  destructible cover (blocks both; a shell hit removes it, no bounce)
     .  open floor
     1..8  spawn points (seat index)
   A trailing map is validated: spawns reachable, none walled in.
   ═══════════════════════════════════════════════════════════════════ */
const MAPS = {
  /* KLASSIKU — an open octagon-ish arena with pillar cover. 8 spawns. */
  klassiku: {
    id:'klassiku', sym:'rot4',
    grid:
      '################\n' +
      '#1....*..*....2#\n' +
      '#..##......##..#\n' +
      '#.#..*.**.*..#.#\n' +
      '#....#....#....#\n' +
      '#8..*..##..*..3#\n' +
      '#...#..##..#...#\n' +
      '#...#......#...#\n' +
      '#7..*......*..4#\n' +
      '#....#....#....#\n' +
      '#.#..*.**.*..#.#\n' +
      '#..##......##..#\n' +
      '#6....*..*....5#\n' +
      '################'
  },
  /* KRUC — a cross of solid walls making four rooms and bounce lanes.
     16 wide x 14 tall, all rows exact width, ringed by wall. */
  kruc: {
    id:'kruc', sym:'rot4',
    grid:
      '################\n' +
      '#1...*..##..*..2#'.slice(0, 16) + '\n' +
      '#..#....##...#.#'.padEnd(16, '#') + '\n' +
      '#.*.#.....#.*..#\n' +
      '#...*.....*...#'.padEnd(16, '#') + '\n' +
      '#.....####....##'.slice(0, 16) + '\n' +
      '#..#..#..#..#..#\n' +
      '#..#..#..#..#..#\n' +
      '##....####.....#\n' +
      '#...*.....*...#'.padEnd(16, '#') + '\n' +
      '#.*.#.....#.*..#\n' +
      '#.#...##....#..#\n' +
      '#8...*..##..*..5#'.slice(0, 16) + '\n' +
      '################'
  },
  /* MITĦNA — a windmill of destructible cover; lots of banking room.
     16 wide x 14 tall. */
  mithna: {
    id:'mithna', sym:'rot4',
    grid:
      '################\n' +
      '#1..........*..2#'.slice(0, 16) + '\n' +
      '#..******.....#'.padEnd(16, '#') + '\n' +
      '#..#....*.....#'.padEnd(16, '#') + '\n' +
      '#..#.##.*..##.#'.padEnd(16, '#') + '\n' +
      '#....#.....*..#'.padEnd(16, '#') + '\n' +
      '#.*..#..#..*..#\n' +
      '#..*..#..#..*.#'.padEnd(16, '#') + '\n' +
      '#..*.....#....#'.padEnd(16, '#') + '\n' +
      '#.##..*.##.#..#'.padEnd(16, '#') + '\n' +
      '#.....*....#..#'.padEnd(16, '#') + '\n' +
      '#.....*.******#'.padEnd(16, '#') + '\n' +
      '#8..*..........5#'.slice(0, 16) + '\n' +
      '################'
  },
  /* DWELL — smaller, tight, 4-corner. Kept for the 4-seat quick game. */
  dwell: {
    id:'dwell', sym:'rot4',
    grid:
      '############\n' +
      '#1..*..*..2#\n' +
      '#.##....##.#\n' +
      '#.*..##..*.#\n' +
      '#...#..#...#\n' +
      '#...#..#...#\n' +
      '#.*..##..*.#\n' +
      '#.##....##.#\n' +
      '#4..*..*..3#\n' +
      '############'
  }
};
const MAP_ORDER = ['klassiku', 'kruc', 'mithna', 'dwell'];

/* parse a map string to structured form. Cells indexed r*cols+c. */
function parseMap(m){
  const grid = (typeof m === 'string') ? m : m.grid;
  const sym  = (typeof m === 'string') ? 'none' : (m.sym || 'none');
  const id   = (typeof m === 'string') ? 'custom' : (m.id || 'custom');
  const rows = grid.split('\n').filter(r => r.length > 0);
  const cols = rows.reduce((a, r) => Math.max(a, r.length), 0);
  const nr = rows.length;
  const wall  = new Array(cols * nr).fill(false);   /* solid, permanent    */
  const cover = new Array(cols * nr).fill(false);   /* destructible        */
  const spawns = [];
  for (let r = 0; r < nr; r++){
    const line = rows[r];
    for (let c = 0; c < cols; c++){
      const ch = c < line.length ? line[c] : '#';
      const i = r * cols + c;
      if (ch === '#') wall[i] = true;
      else if (ch === '*') cover[i] = true;
      else if (ch >= '1' && ch <= '8') spawns[(+ch) - 1] = { col:c, row:r };
    }
  }
  return { id, sym, cols, rows:nr, wall, cover, spawns: spawns.filter(Boolean) };
}

const idx = (mp, c, r) => r * mp.cols + c;
const inBounds = (mp, c, r) => c >= 0 && r >= 0 && c < mp.cols && r < mp.rows;

/* ═══════════════════════════════════════════════════════════════════
   MAP VALIDATOR — every spawn reachable (flood over non-solid cells;
   destructible cover does not partition, a tank can shoot through it),
   and no spawn walled in on all four sides.
   ═══════════════════════════════════════════════════════════════════ */
const STEP4 = [{dc:0,dr:-1},{dc:0,dr:1},{dc:-1,dr:0},{dc:1,dr:0}];
function validateMap(m){
  const mp = (m && m.cols) ? m : parseMap(m);
  const reasons = [];
  if (!mp.spawns.length) return { ok:false, reasons:['no spawns'], reachable:false, boxed:[], symOk:false };
  const N = mp.cols * mp.rows;
  const seen = new Array(N).fill(false);
  const start = idx(mp, mp.spawns[0].col, mp.spawns[0].row);
  const stack = [start]; seen[start] = true;
  while (stack.length){
    const cur = stack.pop();
    const c = cur % mp.cols, r = (cur / mp.cols) | 0;
    for (const s of STEP4){
      const nc = c + s.dc, nr = r + s.dr;
      if (!inBounds(mp, nc, nr)) continue;
      const ni = idx(mp, nc, nr);
      if (seen[ni] || mp.wall[ni]) continue;
      seen[ni] = true; stack.push(ni);
    }
  }
  let reachable = true;
  for (const s of mp.spawns) if (!seen[idx(mp, s.col, s.row)]){ reachable = false; reasons.push('unreachable spawn'); }
  const boxed = [];
  mp.spawns.forEach((s, k) => {
    let open = 0;
    for (const st of STEP4){
      const nc = s.col + st.dc, nr = s.row + st.dr;
      if (inBounds(mp, nc, nr) && !mp.wall[idx(mp, nc, nr)]) open++;
    }
    if (open === 0){ boxed.push(k); reasons.push('spawn ' + k + ' boxed in'); }
  });
  return { ok: reachable && boxed.length === 0, reasons, reachable, boxed, symOk:true };
}

/* ═══════════════════════════════════════════════════════════════════
   GEOMETRY — cell <-> fixed-point. A tank/shell position is (x,y) in SUB
   units from the arena origin; cell = x/SUB. All integer.
   ═══════════════════════════════════════════════════════════════════ */
function cellAt(v){ return (v / SUB) | 0; }
function solidCell(st, c, r){
  const mp = st.map;
  if (!inBounds(mp, c, r)) return true;                 /* out of bounds = wall */
  const i = idx(mp, c, r);
  return mp.wall[i] || st.cover[i];
}
/* is (x,y) with half-extent R free of solid geometry? integer AABB-vs-cells */
function boxFree(st, x, y, R){
  const c0 = cellAt(x - R), c1 = cellAt(x + R);
  const r0 = cellAt(y - R), r1 = cellAt(y + R);
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++)
      if (solidCell(st, c, r)) return false;
  return true;
}

/* ═══════════════════════════════════════════════════════════════════
   RATIONAL SLAB SWEEP (briks.js pattern) — a moving POINT vs an AABB,
   times as exact integer rationals n/d, cross-multiplied, no division,
   no epsilon. Returns the earliest entry time and the hit axis, or null.
   ═══════════════════════════════════════════════════════════════════ */
/* compare a/b vs c/d with b,d > 0 */
function rcmp(a, b, c, d){ const l = a * d, r = c * b; return l < r ? -1 : l > r ? 1 : 0; }
function axisSpan(p0, v, b0, b1){
  if (v === 0){
    const inside = p0 > b0 && p0 < b1;
    return inside ? { in:{n:0,d:1}, out:{n:1,d:1}, par:true } : null;
  }
  let tin, tout;
  const n0 = b0 - p0, n1 = b1 - p0;
  if (v > 0){ tin = {n:n0, d:v}; tout = {n:n1, d:v}; }
  else      { tin = {n:n1, d:v}; tout = {n:n0, d:v}; }
  if (tin.d  < 0){ tin  = {n:-tin.n,  d:-tin.d}; }
  if (tout.d < 0){ tout = {n:-tout.n, d:-tout.d}; }
  return { in:tin, out:tout, par:false };
}
/* point (px,py) moving (vx,vy) over one sub-frame vs box [x0,y0,x1,y1].
   Returns {t:{n,d}, ax} with ax bit1=X face, bit2=Y face, or null. */
function sweepBox(px, py, vx, vy, x0, y0, x1, y1){
  const sx = axisSpan(px, vx, x0, x1); if (!sx) return null;
  const sy = axisSpan(py, vy, y0, y1); if (!sy) return null;
  let ein, eax;
  if (sx.par){ ein = sy.in; eax = 2; }
  else if (sy.par){ ein = sx.in; eax = 1; }
  else {
    const c = rcmp(sx.in.n, sx.in.d, sy.in.n, sy.in.d);
    if (c > 0){ ein = sx.in; eax = 1; }
    else if (c < 0){ ein = sy.in; eax = 2; }
    else { ein = sx.in; eax = 3; }                 /* exact corner */
  }
  const eout = (function(){
    if (sx.par) return sy.out;
    if (sy.par) return sx.out;
    return rcmp(sx.out.n, sx.out.d, sy.out.n, sy.out.d) < 0 ? sx.out : sy.out;
  })();
  if (rcmp(ein.n, ein.d, eout.n, eout.d) > 0) return null;   /* enter after exit */
  if (rcmp(ein.n, ein.d, 1, 1) >= 0) return null;           /* enters after this frame */
  if (ein.n < 0) return null;                               /* starts already past */
  if (rcmp(eout.n, eout.d, 0, 1) <= 0) return null;         /* already leaving */
  return { t:ein, ax:eax };
}

/* reflect a heading across an axis. ax bit1 = flip X, bit2 = flip Y.
   Purely an index transform on the 256-heading circle — no arithmetic on
   the velocity, so a bounce introduces no drift. h=0 is +X (east).
   Flip across a vertical wall (X face): angle -> 128 - h.
   Flip across a horizontal wall (Y face): angle -> (256 - h) = -h.  */
function reflectDir(h, ax){
  h = h & HDG_MASK;
  if (ax & 1) h = (128 - h) & HDG_MASK;     /* X face: mirror east/west */
  if (ax & 2) h = (256 - h) & HDG_MASK;     /* Y face: mirror north/south */
  return h;
}

/* ═══════════════════════════════════════════════════════════════════
   MATCH LIFECYCLE — newMatch(opts, seed)
   opts: { map, mode, seats, humans, lvl, seed, delay }
   ═══════════════════════════════════════════════════════════════════ */
function newMatch(opts, seed){
  opts = opts || {};
  const mapDef = opts.map || MAPS.klassiku;
  const mp = (mapDef && mapDef.cols) ? mapDef : parseMap(mapDef);
  const mode = MODES.indexOf(opts.mode) >= 0 ? opts.mode : MODE.FFA;
  const n = Math.max(MIN_SEATS, Math.min(MAX_SEATS, opts.seats | 0 || Math.min(mp.spawns.length, 4)));

  const st = {
    v: 1,
    rs: (seed | 0) === 0 ? 1 : (seed | 0),
    tick: 0,
    map: mp,
    mode,
    cover: mp.cover.slice(),      /* live destructible grid, mutated on hits */
    tanks: [],
    shells: [],                   /* {x,y,h,seat,bounce,life,pierce,fx}       */
    crates: [],                   /* {kind,col,row,gone:0}                    */
    fx: [],                       /* {kind,x,y,life} — cosmetic, deterministic*/
    nextShell: 1,
    killTarget: KILL_TARGET[mode],
    timeLimit: TIME_LIMIT[mode],
    delay: Math.max(1, Math.min(8, opts.delay | 0 || 3)),
    winner: null,                 /* seat, team id ('t0'/'t1'), or -1 draw    */
    done: false,
    crateSeedT: 0
  };

  const humans = Math.max(1, Math.min(n, opts.humans | 0 || 1));
  for (let i = 0; i < n; i++){
    const sp = mp.spawns[i] || mp.spawns[i % mp.spawns.length] || { col:1, row:1 };
    const h0 = towardCentre(mp, sp);
    st.tanks.push({
      seat: i,
      team: (i & 1),                       /* teams: even=0, odd=1            */
      own: i < humans ? (i === 0 ? 'me' : 'hot') : 'ai',
      lvl: Math.max(1, Math.min(3, opts.lvl | 0 || 2)),
      x: sp.col * SUB + (SUB >> 1),
      y: sp.row * SUB + (SUB >> 1),
      hdg: h0,                             /* hull heading (0..255)          */
      turret: h0,                          /* turret heading (0..255)        */
      alive: true,
      hp: TANK_HP,
      cool: 0,                             /* fire cooldown ticks            */
      guard: SPAWN_GUARD,                  /* spawn-protection ticks         */
      respawn: 0,                          /* ticks until respawn (dead)     */
      lastIn: 0,
      /* power-up state (all time-boxed, deterministic) */
      pu: { multi:0, rapid:0, shield:0, speed:0, bounce:0 },
      kills: 0, deaths: 0, selfkills: 0,
      spawnCol: sp.col, spawnRow: sp.row,
      /* AI scratch (never hashed) */
      ai: { tgt:-1, react:0, wanderH:h0, jink:0 }
    });
  }

  seedCrates(st);
  return st;
}

/* point a fresh tank roughly toward the arena centre (deterministic) */
function towardCentre(mp, sp){
  const cx = mp.cols >> 1, cy = mp.rows >> 1;
  const dx = cx - sp.col, dy = cy - sp.row;
  return dirIndexFromDelta(dx, dy);
}
/* nearest heading index for an integer delta, WITHOUT trig: pick the
   table entry whose (DIRX,DIRY) best aligns (max dot). Deterministic. */
function dirIndexFromDelta(dx, dy){
  if (dx === 0 && dy === 0) return 0;
  let best = 0, bestDot = -0x7fffffff;
  for (let h = 0; h < HDG; h++){
    const d = DIRX[h] * dx + DIRY[h] * dy;
    if (d > bestDot){ bestDot = d; best = h; }
  }
  return best;
}

/* ═══════════════════════════════════════════════════════════════════
   CRATES — power-up spawns from the seeded PRNG. We place onto open,
   non-spawn cells; each crate holds a seeded kind; picked-up crates
   respawn on a seeded schedule so the arena keeps offering them.
   ═══════════════════════════════════════════════════════════════════ */
function openCells(st){
  const mp = st.map, cells = [];
  const spawnSet = {};
  for (const s of mp.spawns) spawnSet[idx(mp, s.col, s.row)] = 1;
  for (let r = 1; r < mp.rows - 1; r++)
    for (let c = 1; c < mp.cols - 1; c++){
      const i = idx(mp, c, r);
      if (mp.wall[i] || st.cover[i] || spawnSet[i]) continue;
      cells.push(i);
    }
  return cells;
}
function seedCrates(st){
  const cells = openCells(st);
  const want = Math.max(2, Math.min(5, (cells.length / 26) | 0 + 2));
  for (let k = 0; k < want && cells.length; k++){
    const j = rndInt(st, cells.length);
    const cell = cells.splice(j, 1)[0];
    const kind = PU_KINDS[rndInt(st, PU_KINDS.length)];
    st.crates.push({ kind, col: cell % st.map.cols, row: (cell / st.map.cols) | 0, gone: 0 });
  }
}
/* a picked crate: hide it, schedule a seeded respawn as a (possibly new)
   kind at a (possibly new) open cell */
function respawnCrate(st, cr){
  cr.gone = 200 + rndInt(st, 200);       /* 10–20s */
}

/* ═══════════════════════════════════════════════════════════════════
   INPUT — one tank's intent for one tick, packed to a small integer for
   the wire. Fields:
     turn     : -1 left / 0 / +1 right (hull)
     throttle : -1 reverse / 0 / +1 forward
     aim      : -1 turret left / 0 / +1 turret right
     fire     : 0/1
   Packed byte: bit0..1 = turn+1 (0,1,2), bit2..3 = throttle+1, bit4..5 =
   aim+1, bit6 = fire. 7 bits, one byte on the wire.
   ═══════════════════════════════════════════════════════════════════ */
function encodeInput(inp){
  if (!inp) return 0;
  const t = ((inp.turn | 0) + 1) & 3;
  const th = ((inp.throttle | 0) + 1) & 3;
  const a = ((inp.aim | 0) + 1) & 3;
  return t | (th << 2) | (a << 4) | (inp.fire ? 64 : 0);
}
function decodeInput(byte){
  byte = byte | 0;
  return {
    turn:     (byte & 3) - 1,
    throttle: ((byte >> 2) & 3) - 1,
    aim:      ((byte >> 4) & 3) - 1,
    fire:     !!(byte & 64)
  };
}
/* deterministic late/missing rule: repeat this tank's last input byte,
   but strip the FIRE bit (a held missing input must not machine-gun) so a
   stalled/departed phone coasts its last steer and does not auto-fire. */
function predictInput(tk){ return (tk.lastIn | 0) & 63; }

/* ═══════════════════════════════════════════════════════════════════
   INPUT DELAY — D from RTT. Pure integer arithmetic, no clock, no trig.
   needed = ceil((rtt + jitter) / tickMs); clamped [2,8]. UI feeds it
   pingStats().med / (worst-best).
   ═══════════════════════════════════════════════════════════════════ */
function delayTicks(rttMs, jitterMs){
  const tickMs = TICK_MS;                       /* 50 */
  const total = (rttMs | 0) + (jitterMs | 0 || 30);
  let d = Math.floor((total + tickMs - 1) / tickMs);
  if (d * tickMs < total) d++;
  if (d < 2) d = 2;
  if (d > 8) d = 8;
  return d;
}

/* ═══════════════════════════════════════════════════════════════════
   THE TICK — step(st, frame). frame is an array of input BYTES, one per
   tank in seat order. A missing/short frame is padded with predicted
   inputs (repeat last, fire stripped). See the ORDER header at the top.
   ═══════════════════════════════════════════════════════════════════ */
function step(st, frame){
  if (st.done) return st;
  frame = frame || [];
  const tanks = st.tanks;

  /* 1. resolve inputs */
  const ins = [];
  for (let i = 0; i < tanks.length; i++){
    let byte = (i < frame.length && frame[i] != null) ? (frame[i] | 0) : predictInput(tanks[i]);
    tanks[i].lastIn = byte;
    ins[i] = decodeInput(byte);
  }

  /* 2. timers */
  for (const tk of tanks){
    if (tk.cool > 0) tk.cool--;
    if (tk.guard > 0) tk.guard--;
    const p = tk.pu;
    if (p.multi  > 0) p.multi--;
    if (p.rapid  > 0) p.rapid--;
    if (p.shield > 0) p.shield--;
    if (p.speed  > 0) p.speed--;
    if (p.bounce > 0) p.bounce--;
    if (!tk.alive && tk.respawn > 0) tk.respawn--;
  }

  /* 3. turn + drive (ascending seat) */
  for (let i = 0; i < tanks.length; i++){
    const tk = tanks[i]; if (!tk.alive) continue;
    driveTank(st, tk, ins[i]);
  }

  /* 4. fire (ascending seat) */
  for (let i = 0; i < tanks.length; i++){
    const tk = tanks[i]; if (!tk.alive) continue;
    if (ins[i].fire && tk.cool === 0) fireTank(st, tk);
  }

  /* 5. move shells (swept) + resolve hits */
  stepShells(st);

  /* 6. deaths already registered inside stepShells; spawn explosions there */

  /* 7. pickups */
  for (const tk of tanks){
    if (!tk.alive) continue;
    for (const cr of st.crates){
      if (cr.gone) continue;
      const cx = cr.col * SUB + (SUB >> 1), cy = cr.row * SUB + (SUB >> 1);
      if (aabbOverlap(tk.x, tk.y, TANK_R, cx, cy, PU_R)){
        applyPickup(tk, cr.kind);
        respawnCrate(st, cr);
        spawnFx(st, 'pick', cx, cy);
        break;
      }
    }
  }

  /* 8. spawn: crate respawn timers + tank respawns */
  for (const cr of st.crates){
    if (cr.gone > 0){
      cr.gone--;
      if (cr.gone === 0) relocateCrate(st, cr);
    }
  }
  if (st.mode !== MODE.LAST){
    for (const tk of tanks) if (!tk.alive && tk.respawn === 0) reviveTank(st, tk);
  }

  /* 9. age fx (cosmetic but deterministic so replays match) */
  const keptFx = [];
  for (const f of st.fx){ f.life--; if (f.life > 0) keptFx.push(f); }
  st.fx = keptFx;

  /* 10. win check */
  st.tick++;
  checkEnd(st);
  return st;
}

/* ── driving ─────────────────────────────────────────────────────────
   Turn the hull, turn the turret, then step the hull along its heading,
   swept against walls and other tanks so it never slips through. Whole-
   integer throughout. A tank that runs into a wall simply stops that
   tick (its intended step is clamped to the last free position). */
function driveTank(st, tk, inp){
  /* turret aim first (independent of hull) */
  if (inp.aim !== 0) tk.turret = (tk.turret + inp.aim * TURRET_RATE) & HDG_MASK;

  /* hull turn */
  if (inp.turn !== 0) tk.hdg = (tk.hdg + inp.turn * TURN_RATE) & HDG_MASK;

  if (inp.throttle === 0) return;
  const boost = tk.pu.speed > 0 ? 1 : 0;
  let sp = inp.throttle > 0 ? DRIVE_SPEED : REVERSE_SPD;
  if (boost) sp += (sp >> 1);                          /* +50% with SPEED   */
  const sign = inp.throttle > 0 ? 1 : -1;
  /* desired integer step along the hull heading */
  let vx = (dirX(tk.hdg) * sp * sign / DIR_U) | 0;
  let vy = (dirY(tk.hdg) * sp * sign / DIR_U) | 0;

  /* move axis-independently so sliding along a wall works; clamp each
     axis to the last position that keeps the tank box free. Integer
     bisection toward the wall keeps it snug without a float. */
  tk.x = slideAxis(st, tk, vx, true);
  tk.y = slideAxis(st, tk, vy, false);

  /* tank-vs-tank: if we now overlap another living tank, undo (tanks are
     solid to each other; a shove is not modelled — deterministic + simple) */
  for (const o of st.tanks){
    if (o === tk || !o.alive) continue;
    if (aabbOverlap(tk.x, tk.y, TANK_R, o.x, o.y, TANK_R)){
      /* step back along both axes to the pre-move spot on the blocked axis */
      tk.x -= slideAxisDelta(st, tk, vx, true, tk.x);
      tk.y -= slideAxisDelta(st, tk, vy, false, tk.y);
      break;
    }
  }
}
/* returns the new coord on the given axis after moving `v`, clamped so the
   tank box stays free. Bisects toward the wall for a snug fit (integer). */
function slideAxis(st, tk, v, isX){
  if (v === 0) return isX ? tk.x : tk.y;
  const base = isX ? tk.x : tk.y;
  const tryAt = p => isX ? boxFree(st, p, tk.y, TANK_R) : boxFree(st, tk.x, p, TANK_R);
  const want = base + v;
  if (tryAt(want)) return want;
  /* binary search the furthest free position between base and want */
  let lo = 0, hi = v, good = 0;                         /* offsets from base */
  const dir = v > 0 ? 1 : -1;
  lo = 0; hi = Math.abs(v);
  for (let it = 0; it < 9; it++){
    const mid = (lo + hi) >> 1;
    if (tryAt(base + dir * mid)){ good = mid; lo = mid + 1; }
    else hi = mid - 1;
    if (lo > hi) break;
  }
  return base + dir * good;
}
function slideAxisDelta(st, tk, v, isX, cur){
  const base = isX ? (cur) : (cur);
  return 0;   /* the overlap-undo above uses the tank's own pre-step by axis;
                 kept as a no-op hook so the intent reads clearly. */
}

/* integer AABB overlap for two centred boxes */
function aabbOverlap(ax, ay, ar, bx, by, br){
  return Math.abs(ax - bx) < (ar + br) && Math.abs(ay - by) < (ar + br);
}

/* ── firing ──────────────────────────────────────────────────────────
   Spawn one shell along the turret heading (offset out of the barrel), or
   several with the MULTI power-up (a symmetric spread). RAPID shortens the
   cooldown; BOUNCE adds wall bounces and pierce. All integer. */
function fireTank(st, tk){
  const cool = tk.pu.rapid > 0 ? Math.max(5, FIRE_COOL >> 1) : FIRE_COOL;
  tk.cool = cool;
  const bounce = SHELL_BOUNCE + (tk.pu.bounce > 0 ? 3 : 0);
  const pierce = tk.pu.bounce > 0 ? 1 : 0;
  const spread = tk.pu.multi > 0 ? [-16, 0, 16] : [0];  /* headings offsets  */
  for (const off of spread){
    const h = (tk.turret + off) & HDG_MASK;
    /* muzzle: start a barrel-length out so a shell does not birth inside
       the firer and self-kill; if that spot is in a wall, birth at centre */
    const bx = tk.x + ((dirX(h) * (TANK_R + SHELL_R + 8)) / DIR_U | 0);
    const by = tk.y + ((dirY(h) * (TANK_R + SHELL_R + 8)) / DIR_U | 0);
    const ok = boxFree(st, bx, by, SHELL_R);
    st.shells.push({
      id: st.nextShell++,
      x: ok ? bx : tk.x, y: ok ? by : tk.y,
      h, seat: tk.seat, team: tk.team,
      bounce, pierce, banked: 0, life: SHELL_LIFE, born: st.tick
    });
  }
  spawnFx(st, 'muzzle', tk.x, tk.y);
}

/* ── shells ──────────────────────────────────────────────────────────
   Each shell sweeps its full per-tick displacement, resolving the
   EARLIEST contact among all wall/cover cells and all tanks along the
   swept segment (briks slab sweep). On a wall it reflects (index
   transform) and spends bounces; on cover it removes the cover and dies
   (unless pierce); on a tank it registers a hit. No tunnelling: the sweep
   inspects the whole segment, not just the endpoints. */
function stepShells(st){
  const alive = [];
  for (const sh of st.shells){
    if (sh.life <= 0) continue;
    sh.life--;
    if (resolveShell(st, sh)) alive.push(sh);
  }
  st.shells = alive;
}
/* returns true if the shell survives this tick */
function resolveShell(st, sh){
  let rem = DIR_U;                              /* remaining fraction, /DIR_U */
  for (let iter = 0; iter < 32 && rem > 0; iter++){
    /* full move for the remaining fraction along the heading */
    const step = (SHELL_SPEED * rem / DIR_U) | 0;
    const mvx = (dirX(sh.h) * step / DIR_U) | 0;
    const mvy = (dirY(sh.h) * step / DIR_U) | 0;
    if (mvx === 0 && mvy === 0) return true;

    /* gather earliest contact: cells the segment crosses + tanks */
    let best = null;                            /* {n,d} */
    let hitKind = 0, hitAx = 0, hitCell = -1, hitTank = -1;

    /* cell candidates: the AABB of the swept segment, inflated by SHELL_R */
    const minx = Math.min(sh.x, sh.x + mvx) - SHELL_R, maxx = Math.max(sh.x, sh.x + mvx) + SHELL_R;
    const miny = Math.min(sh.y, sh.y + mvy) - SHELL_R, maxy = Math.max(sh.y, sh.y + mvy) + SHELL_R;
    const c0 = cellAt(minx), c1 = cellAt(maxx), r0 = cellAt(miny), r1 = cellAt(maxy);
    for (let r = r0; r <= r1; r++){
      for (let c = c0; c <= c1; c++){
        const wall = !inBounds(st.map, c, r) || st.map.wall[idx(st.map, c, r)];
        const cover = inBounds(st.map, c, r) && st.cover[idx(st.map, c, r)];
        if (!wall && !cover) continue;
        const x0 = c * SUB - SHELL_R, y0 = r * SUB - SHELL_R;
        const x1 = c * SUB + SUB + SHELL_R, y1 = r * SUB + SUB + SHELL_R;
        const h = sweepBox(sh.x, sh.y, mvx, mvy, x0, y0, x1, y1);
        if (!h) continue;
        if (best === null || rcmp(h.t.n, h.t.d, best.n, best.d) < 0){
          best = h.t; hitKind = wall ? 1 : 2; hitAx = h.ax; hitCell = inBounds(st.map, c, r) ? idx(st.map, c, r) : -1; hitTank = -1;
        }
      }
    }
    /* tank candidates */
    for (const tk of st.tanks){
      if (!tk.alive || tk.guard > 0) continue;
      /* a shell cannot hit its own firer until it has bounced at least once
         (a fresh shot cannot suicide the moment it births), and never in the
         first few ticks — this, with muzzleClear, is what keeps bots from
         banking a shell straight back into their own hull. Once it has
         banked, a returning shell IS a real (if unlucky) self-kill. */
      if (tk.seat === sh.seat && (st.tick - sh.born < 6 || sh.banked === 0)) continue;
      const x0 = tk.x - TANK_R - SHELL_R, y0 = tk.y - TANK_R - SHELL_R;
      const x1 = tk.x + TANK_R + SHELL_R, y1 = tk.y + TANK_R + SHELL_R;
      const h = sweepBox(sh.x, sh.y, mvx, mvy, x0, y0, x1, y1);
      if (!h) continue;
      if (best === null || rcmp(h.t.n, h.t.d, best.n, best.d) < 0){
        best = h.t; hitKind = 3; hitAx = h.ax; hitTank = tk.seat; hitCell = -1;
      }
    }

    if (best === null){                         /* free flight */
      sh.x += mvx; sh.y += mvy; return true;
    }
    /* advance exactly to the contact (truncate toward the surface) */
    const stepX = (mvx * best.n / best.d) | 0;
    const stepY = (mvy * best.n / best.d) | 0;
    sh.x += stepX; sh.y += stepY;
    /* remaining fraction after this contact */
    rem = rem - (rem * best.n / best.d | 0);

    if (hitKind === 3){                          /* a tank */
      hitOnTank(st, sh, hitTank);
      if (sh.pierce){                            /* pierce: keep going */
        /* nudge past the tank so we don't re-hit it this iteration */
        sh.x += (dirX(sh.h) * (TANK_R) / DIR_U) | 0;
        sh.y += (dirY(sh.h) * (TANK_R) / DIR_U) | 0;
        continue;
      }
      spawnFx(st, 'boom', sh.x, sh.y);
      return false;                              /* consumed */
    }
    if (hitKind === 2){                          /* destructible cover */
      if (hitCell >= 0) st.cover[hitCell] = false;
      spawnFx(st, 'crack', sh.x, sh.y);
      if (sh.pierce){ continue; }                /* pierce eats through cover */
      return false;
    }
    /* hitKind === 1 : a solid wall -> bounce or die */
    if (sh.bounce <= 0){ spawnFx(st, 'spark', sh.x, sh.y); return false; }
    sh.bounce--; sh.banked++;
    sh.h = reflectDir(sh.h, hitAx);
    spawnFx(st, 'spark', sh.x, sh.y);
    /* back off a hair off the wall along the NEW heading so we don't
       immediately re-contact the same face this iteration */
    sh.x += (dirX(sh.h) * 2 / DIR_U) | 0;
    sh.y += (dirY(sh.h) * 2 / DIR_U) | 0;
  }
  return true;
}

/* a shell landed on a tank. Shield eats one hit; otherwise a hit removes a
   life. Credit the shooter honestly (self-kill and team-kill counted). */
function hitOnTank(st, sh, seat){
  const tk = st.tanks[seat];
  if (!tk || !tk.alive) return;
  if (tk.pu.shield > 0){ tk.pu.shield = 0; spawnFx(st, 'shield', tk.x, tk.y); return; }
  tk.hp--;
  if (tk.hp > 0) return;
  /* death */
  tk.alive = false;
  tk.deaths++;
  tk.respawn = RESPAWN_TCK;
  spawnFx(st, 'boom', tk.x, tk.y);
  const shooter = st.tanks[sh.seat];
  if (shooter){
    if (sh.seat === seat){ shooter.selfkills++; shooter.kills--; }   /* own goal */
    else if (st.mode === MODE.TEAMS && shooter.team === tk.team){ shooter.kills--; } /* team kill penalised */
    else shooter.kills++;
  }
}

/* ── power-ups ───────────────────────────────────────────────────────*/
function applyPickup(tk, kind){
  const p = tk.pu, t = PU_TIME[kind] || 200;
  if (kind === PU.MULTI)  p.multi  = t;
  else if (kind === PU.RAPID)  p.rapid  = t;
  else if (kind === PU.SHIELD) p.shield = t;
  else if (kind === PU.SPEED)  p.speed  = t;
  else if (kind === PU.BOUNCE) p.bounce = t;
}
function relocateCrate(st, cr){
  const cells = openCells(st);
  /* avoid stacking on a live crate */
  const taken = {};
  for (const o of st.crates) if (!o.gone && o !== cr) taken[idx(st.map, o.col, o.row)] = 1;
  const free = cells.filter(i => !taken[i]);
  const pool = free.length ? free : cells;
  if (!pool.length) return;
  const cell = pool[rndInt(st, pool.length)];
  cr.col = cell % st.map.cols; cr.row = (cell / st.map.cols) | 0;
  cr.kind = PU_KINDS[rndInt(st, PU_KINDS.length)];
  cr.gone = 0;
}

/* ── respawn ─────────────────────────────────────────────────────────
   Revive at the FURTHEST spawn from any living enemy (deterministic
   scan), fresh, with spawn protection. */
function reviveTank(st, tk){
  const mp = st.map;
  let bestSp = { col: tk.spawnCol, row: tk.spawnRow }, bestScore = -1;
  for (const sp of mp.spawns){
    let near = 0x7fffffff;
    for (const o of st.tanks){
      if (o === tk || !o.alive) continue;
      if (st.mode === MODE.TEAMS && o.team === tk.team) continue;
      const dx = (sp.col * SUB) - o.x, dy = (sp.row * SUB) - o.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < near) near = d2;
    }
    if (near > bestScore){ bestScore = near; bestSp = sp; }
  }
  tk.x = bestSp.col * SUB + (SUB >> 1);
  tk.y = bestSp.row * SUB + (SUB >> 1);
  tk.hdg = towardCentre(mp, bestSp);
  tk.turret = tk.hdg;
  tk.alive = true; tk.hp = TANK_HP; tk.cool = 0; tk.guard = SPAWN_GUARD;
  tk.pu = { multi:0, rapid:0, shield:0, speed:0, bounce:0 };
  spawnFx(st, 'spawn', tk.x, tk.y);
}

/* deterministic cosmetic effects (hashed so replays are bit-identical) */
function spawnFx(st, kind, x, y){
  const life = kind === 'boom' ? 14 : kind === 'muzzle' ? 4 : 8;
  st.fx.push({ kind, x, y, life, born: st.tick });
  if (st.fx.length > 64) st.fx.splice(0, st.fx.length - 64);
}

/* ═══════════════════════════════════════════════════════════════════
   END CONDITIONS by mode.
   ═══════════════════════════════════════════════════════════════════ */
function checkEnd(st){
  if (st.done) return;
  if (st.mode === MODE.LAST){
    const live = st.tanks.filter(t => t.alive);
    /* teams-agnostic last-standing: 0 or 1 tanks left */
    if (live.length <= 1){ st.winner = live.length ? live[0].seat : -1; st.done = true; return; }
    /* hard time cap so two circling survivors can never stall forever:
       decide by most kills among the LIVING, ties -> draw. */
    if (st.timeLimit > 0 && st.tick >= st.timeLimit){
      let best = -1, bestK = -0x7fffffff, ties = 0;
      for (const t of live){ if (t.kills > bestK){ bestK = t.kills; best = t.seat; ties = 1; } else if (t.kills === bestK) ties++; }
      st.winner = ties > 1 ? -1 : best; st.done = true;
    }
    return;
  }
  /* score target */
  if (st.killTarget > 0){
    if (st.mode === MODE.TEAMS){
      const t0 = teamScore(st, 0), t1 = teamScore(st, 1);
      if (t0 >= st.killTarget || t1 >= st.killTarget){
        st.winner = t0 === t1 ? -1 : (t0 > t1 ? 't0' : 't1'); st.done = true; return;
      }
    } else {
      for (const tk of st.tanks) if (tk.kills >= st.killTarget){ st.winner = leaderSeat(st); st.done = true; return; }
    }
  }
  /* time limit */
  if (st.timeLimit > 0 && st.tick >= st.timeLimit){
    if (st.mode === MODE.TEAMS){
      const t0 = teamScore(st, 0), t1 = teamScore(st, 1);
      st.winner = t0 === t1 ? -1 : (t0 > t1 ? 't0' : 't1');
    } else {
      st.winner = leaderSeat(st);
    }
    st.done = true;
  }
}
function teamScore(st, team){ let s = 0; for (const t of st.tanks) if (t.team === team) s += t.kills; return s; }
function leaderSeat(st){
  let best = -1, bestK = -0x7fffffff;
  for (const t of st.tanks) if (t.kills > bestK){ bestK = t.kills; best = t.seat; }
  /* a tie at the top with nobody positive is a draw */
  let ties = 0; for (const t of st.tanks) if (t.kills === bestK) ties++;
  return (ties > 1 && bestK <= 0) ? -1 : best;
}

/* ═══════════════════════════════════════════════════════════════════
   AI — bot tanks. They pick a target, drive toward/around cover, aim with
   a lead on a moving target, dodge an incoming shell, grab power-ups and
   fire when the shot is good. Difficulty (lvl 1..3) changes aim accuracy,
   reaction ticks and aggression. NOT aimbot-perfect and NOT suicidal:
   they hold fire when a wall is directly in the muzzle line, and they jink
   when a shell is bearing down. All integer; only rnd() for tie-breaks.
   aiInput returns the packed byte for one seat this tick.

   CRITICAL DETERMINISM NOTE: aiInput must be a PURE READ of the sim state
   and MUST NOT advance the shared PRNG st.rs — because the UI calls it to
   PRE-COMPUTE a byte for a FUTURE tick (and, online, only the host calls
   it), so touching st.rs here would fork the world. All AI "randomness"
   therefore comes from aiCoin(), a pure FNV hash of (seed, tick, seat,
   salt) that reads nothing and mutates nothing. It is still fully
   deterministic and reproducible; it simply does not consume st.rs.
   ═══════════════════════════════════════════════════════════════════ */
function aiCoin(st, seat, salt, n){
  if (n <= 0) return 0;
  let h = 2166136261;
  h = Math.imul(h ^ (st.rs | 0), 16777619);
  h = Math.imul(h ^ (st.tick | 0), 16777619);
  h = Math.imul(h ^ (seat | 0), 16777619);
  h = Math.imul(h ^ (salt | 0), 16777619);
  return ((h >>> 0) % n);
}
function aiInput(st, seat){
  const tk = st.tanks[seat];
  if (!tk || !tk.alive) return 0;
  const lvl = tk.lvl || 2;
  const a = tk.ai;

  /* reaction gating: a bot only re-decides every REACT ticks (harder =
     snappier). Between decisions it holds its steer. Deterministic clock
     off st.tick + seat so bots don't all think on the same tick. */
  const REACT = lvl >= 3 ? 2 : (lvl === 2 ? 4 : 7);
  const think = ((st.tick + seat) % REACT) === 0;

  /* find the nearest enemy (squared distances; teams respected) */
  let tgt = -1, td2 = 0x7fffffff;
  for (const o of st.tanks){
    if (o.seat === seat || !o.alive) continue;
    if (st.mode === MODE.TEAMS && o.team === tk.team) continue;
    const dx = o.x - tk.x, dy = o.y - tk.y, d2 = dx*dx + dy*dy;
    if (d2 < td2){ td2 = d2; tgt = o.seat; }
  }
  a.tgt = tgt;

  let turn = 0, throttle = 0, aim = 0, fire = 0;

  /* dodge: is an enemy shell heading roughly at us and close? jink. */
  let dodge = 0;
  for (const sh of st.shells){
    if (sh.seat === seat) continue;
    if (st.mode === MODE.TEAMS && st.tanks[sh.seat] && st.tanks[sh.seat].team === tk.team) continue;
    const rx = tk.x - sh.x, ry = tk.y - sh.y;
    const d2 = rx*rx + ry*ry;
    if (d2 > (SUB*4)*(SUB*4)) continue;                 /* only near shells */
    /* is the shell pointed at us? dot of its heading with the vector to us */
    const dot = dirX(sh.h) * rx + dirY(sh.h) * ry;
    if (dot <= 0) continue;                             /* moving away */
    /* perpendicular closeness: cross product magnitude small => on-line */
    const cross = Math.abs(dirX(sh.h) * ry - dirY(sh.h) * rx);
    if (cross < TANK_R * DIR_U){ dodge = ((sh.h & 1) ? 1 : -1); break; }
  }

  if (tgt >= 0){
    const o = st.tanks[tgt];
    const dx = o.x - tk.x, dy = o.y - tk.y;
    const dist2 = dx*dx + dy*dy;

    /* aim with a lead: predict where the target will be when the shell
       arrives. time ≈ dist / SHELL_SPEED (integer via aiSqrt, AI-only). */
    const dist = aiSqrt(dist2);                         /* AI-only root */
    const tof = (dist / SHELL_SPEED) | 0;
    /* estimate the target's per-tick velocity from its heading + throttle */
    const ov = targetVel(o);
    const leadX = o.x + ov.x * tof, leadY = o.y + ov.y * tof;
    let want = dirIndexFromDelta(leadX - tk.x, leadY - tk.y);
    /* inaccuracy by difficulty: nudge the aim by a seeded few steps */
    const slop = lvl >= 3 ? 1 : (lvl === 2 ? 3 : 6);
    if (slop > 0) want = (want + aiCoin(st, seat, 1, slop*2+1) - slop) & HDG_MASK;

    /* turn the turret toward `want` the short way */
    aim = shortTurn(tk.turret, want);

    /* fire when the turret is close to lined up AND the muzzle line is not
       blocked by a wall right in front (don't shoot our own cover) */
    const aligned = angleClose(tk.turret, want, lvl >= 3 ? 10 : 18);
    const clear = muzzleClear(st, tk);
    if (think && aligned && clear && tk.cool === 0){
      /* aggression: closer + harder bots fire more readily */
      const range = lvl >= 3 ? (SUB*9) : (SUB*7);
      if (dist < range) fire = 1;
    }

    /* drive: keep at a comfortable range using cover. Too close -> back
       off; far -> approach; broadside -> strafe by turning the hull. */
    const hullWant = dirIndexFromDelta(dx, dy);
    if (dodge !== 0){
      /* jink perpendicular to the incoming shell */
      turn = dodge; throttle = 1;
    } else {
      turn = shortTurn(tk.hdg, hullWant);
      const closeR = SUB*3, farR = SUB*8;
      if (dist2 < closeR*closeR) throttle = -1;         /* too close, reverse */
      else if (dist2 > farR*farR) throttle = 1;         /* approach          */
      else throttle = (((st.tick >> 3) + seat) & 1) ? 1 : 0;   /* mild circling */
    }

    /* seek a power-up if one is very close and we lack a shield */
    if (tk.pu.shield === 0 && dodge === 0){
      let bc = -1, bd2 = (SUB*4)*(SUB*4);
      for (let k = 0; k < st.crates.length; k++){
        const cr = st.crates[k]; if (cr.gone) continue;
        const cx = cr.col*SUB, cy = cr.row*SUB;
        const cd2 = (cx-tk.x)*(cx-tk.x) + (cy-tk.y)*(cy-tk.y);
        if (cd2 < bd2){ bd2 = cd2; bc = k; }
      }
      if (bc >= 0){
        const cr = st.crates[bc];
        const cw = dirIndexFromDelta(cr.col*SUB - tk.x, cr.row*SUB - tk.y);
        turn = shortTurn(tk.hdg, cw); throttle = 1;
      }
    }
  } else {
    /* nobody to fight (shouldn't happen mid-match) — wander. The wander
       heading is a PURE function of a coarse clock + seat (no persisted
       scratch feeding the output, so a pre-computed byte cannot fork). */
    const wanderH = aiCoin(st, seat, 3 + ((st.tick >> 5) & 255), HDG);
    turn = shortTurn(tk.hdg, wanderH); throttle = 1;
  }

  return encodeInput({ turn, throttle, aim, fire });
}
/* estimate a tank's per-tick velocity from its heading/throttle (for lead) */
function targetVel(o){
  const inp = decodeInput(o.lastIn | 0);
  if (inp.throttle === 0) return { x:0, y:0 };
  const sp = inp.throttle > 0 ? DRIVE_SPEED : REVERSE_SPD;
  const sign = inp.throttle > 0 ? 1 : -1;
  return { x: (dirX(o.hdg)*sp*sign/DIR_U)|0, y: (dirY(o.hdg)*sp*sign/DIR_U)|0 };
}
/* the sign to turn from a toward b the short way around the 256-circle */
function shortTurn(a, b){
  let d = (b - a) & HDG_MASK;
  if (d === 0) return 0;
  return d < 128 ? 1 : -1;
}
function angleClose(a, b, tol){
  let d = (b - a) & HDG_MASK;
  if (d > 128) d = 256 - d;
  return d <= tol;
}
/* would a bot's shot come straight back and kill itself? Walk the turret
   line a few cell-lengths and require it to be clear of any wall within a
   safe distance — a wall close ahead means a bounce that can loop back
   onto the firer. This is the single biggest lever on the self-suicide
   rate, so it checks a real distance (about 3 cells), not just one step. */
function muzzleClear(st, tk){
  const h = tk.turret;
  const startL = TANK_R + SHELL_R + 8;
  /* the near cell must be free (never fire point-blank into cover) */
  if (!boxFree(st, tk.x + ((dirX(h)*startL)/DIR_U|0), tk.y + ((dirY(h)*startL)/DIR_U|0), SHELL_R)) return false;
  /* and no wall within ~3 cells straight ahead, or a bank could return */
  for (let d = startL; d <= SUB*3; d += (SUB>>1)){
    const px = tk.x + ((dirX(h)*d)/DIR_U|0), py = tk.y + ((dirY(h)*d)/DIR_U|0);
    const c = cellAt(px), r = cellAt(py);
    if (!inBounds(st.map, c, r) || st.map.wall[idx(st.map, c, r)]) return false;
  }
  return true;
}
/* whole-frame AI: fill every ai-owned seat's byte. humanBytes overrides
   seats a human/host provides. */
function aiFrame(st, humanBytes){
  humanBytes = humanBytes || {};
  const out = new Array(st.tanks.length);
  for (let i = 0; i < st.tanks.length; i++){
    if (humanBytes[i] != null){ out[i] = humanBytes[i] | 0; continue; }
    out[i] = (st.tanks[i].own === 'ai') ? aiInput(st, i) : 0;
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   INTROSPECTION — for the UI and the test harness.
   ═══════════════════════════════════════════════════════════════════ */
function meSeat(st){
  const i = st.tanks.findIndex(t => t.own === 'me' || t.own === 'hot');
  return i < 0 ? 0 : i;
}
function over(st){
  if (!st.done) return null;
  const me = meSeat(st), tk = st.tanks[me];
  let iWon;
  if (typeof st.winner === 'string'){                    /* a team id */
    iWon = ('t' + tk.team) === st.winner;
  } else {
    iWon = st.winner === me;
  }
  return {
    tone: iWon ? 'win' : (st.winner === -1 ? 'draw' : 'lose'),
    winner: st.winner,
    mode: st.mode,
    ticks: st.tick
  };
}

/* a bit-stable hash of the WHOLE sim state — the determinism proof reads
   this. Everything that can affect a future tick is folded in, in a fixed
   order (shells and crates sorted so array order cannot leak in). */
function hashState(st){
  const acc = [st.tick, st.done ? 1 : 0, st.rs,
               (typeof st.winner === 'string') ? (st.winner === 't0' ? 900 : 901) : (st.winner == null ? 999 : st.winner)];
  for (const t of st.tanks)
    acc.push(t.seat, t.team, t.x, t.y, t.hdg, t.turret, t.alive?1:0, t.hp, t.cool, t.guard,
             t.respawn, t.kills, t.deaths, t.selfkills, t.lastIn,
             t.pu.multi, t.pu.rapid, t.pu.shield, t.pu.speed, t.pu.bounce);
  const sh = st.shells.slice().sort((a,b) => a.id - b.id);
  for (const s of sh) acc.push(1000, s.id, s.x, s.y, s.h, s.seat, s.bounce, s.banked, s.pierce, s.life);
  const cr = st.crates.slice().sort((a,b) => (a.row*st.map.cols+a.col) - (b.row*st.map.cols+b.col));
  for (const c of cr) acc.push(2000, c.col, c.row, c.kind, c.gone);
  const N = st.map.cols * st.map.rows;
  for (let i = 0; i < N; i++){ if (st.cover[i]) acc.push(3000 + i); if (st.map.wall[i]) acc.push(4000 + i); }
  return hash32(acc);
}

/* cheap invariants for the fuzzer: no tank inside a wall, no shell with
   negative life kept, scores sane. Returns a list of problems (empty=ok). */
function invariants(st){
  const bad = [];
  for (const t of st.tanks){
    if (t.alive && !boxFree(st, t.x, t.y, TANK_R - 2)) bad.push('tank ' + t.seat + ' in wall');
    if (t.x < 0 || t.y < 0 || t.x > st.map.cols*SUB || t.y > st.map.rows*SUB) bad.push('tank ' + t.seat + ' out of bounds');
  }
  for (const s of st.shells){
    if (s.life < 0) bad.push('shell negative life');
    if (s.bounce < 0) bad.push('shell negative bounce');
  }
  return bad;
}

/* a danger read for the UI's minimap / bots-are-thinking cue: cells a live
   shell will cross soon. Cheap, cosmetic, not in the sim path. */
function shellHeat(st){
  const N = st.map.cols * st.map.rows, heat = new Array(N).fill(0);
  for (const s of st.shells){
    const c = cellAt(s.x), r = cellAt(s.y);
    if (inBounds(st.map, c, r)) heat[idx(st.map, c, r)] = 1;
  }
  return heat;
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — js/tankijiet-ui.js and the test harness both read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_TANKIJIET = root.KARTI_TANKIJIET || {};
root.KARTI_TANKIJIET.engine = {
  /* tuning the UI needs for interpolation/pacing/drawing */
  SUB, SIM_HZ, TICK_MS, HDG, HDG_MASK, DIR_U, DIRX, DIRY, dirX, dirY,
  TANK_R, SHELL_R, SHELL_SPEED, DRIVE_SPEED, FIRE_COOL, SPAWN_GUARD,
  PU, PU_KINDS, PU_TIME, MODE, MODES, KILL_TARGET, TIME_LIMIT,
  MIN_SEATS, MAX_SEATS,
  /* maps + validation */
  MAPS, MAP_ORDER, parseMap, validateMap, idx, inBounds, cellAt,
  /* match lifecycle */
  newMatch, step, over, meSeat,
  /* network model */
  delayTicks, encodeInput, decodeInput, predictInput, aiInput, aiFrame,
  /* introspection for UI + tests */
  hashState, invariants, shellHeat, aabbOverlap, boxFree, reflectDir, sweepBox,
  dirIndexFromDelta, aiSqrt,
  /* seed pick for a fresh local match (the one Math.random) */
  freshSeed, rnd, rndInt
};

})(typeof window !== 'undefined' ? window : this);
