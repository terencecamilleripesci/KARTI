/* ═══════════════════════════════════════════════════════════════════
   OVERWORLD — a top-down tile world, read straight from Tiled JSON.

   WHY TILED AND NOT A GENERATOR. The paused project drew its island from
   a Python script into arrays, which is checkable and fast but means no
   one ever draws a map by eye. For a Ruby-style world that is the wrong
   trade: the map IS the content. So maps are authored in Tiled
   (`apt install tiled`), exported as JSON, and this file consumes them.
   tools/mkmaps.py wrote the seed maps and then got out of the way.

   WHAT IT TAKES FROM THE MAP, AND WHAT IT REFUSES TO GUESS:
     · `ground`  tile layer, drawn under the player
     · `over`    tile layer, drawn OVER the player, so you walk behind
                 treetops and roof fronts. Top-down needs no depth sort —
                 one more thing the isometric engine needed and this does
                 not.
     · `objects` object layer: `spawn`, `warp` (to/tx/ty), `heal`.
   COLLISION COMES FROM THE TILESET, never from a parallel layer. A tile
   with `solid` blocks; one with `grass` rolls encounters. Drawing a tree
   and then drawing its blocker separately is two sources of truth, and
   they drift the first time a tree moves.

   THE CLOCK IS INJECTABLE AND SO IS THE RNG. `tick(dt)` is the whole
   update; nothing here calls requestAnimationFrame or performance.now
   on its own behalf. That is not tidiness — under a virtual clock both
   rAF and performance.now freeze, and a movement system that cannot be
   stepped by hand is a movement system that can only be tested by
   playing it. tools/checkmap.js walks the hero across real maps with
   this.

   GRID-LOCKED MOVEMENT, deliberately. The player occupies one tile and
   slides between tiles over WALK_MS; input during a slide is buffered,
   not dropped. Free 2D movement would make collision a rectangle problem
   and encounters ambiguous ("which tile am I in?"), and it is not what
   the genre feels like.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function (root) {

  const TS = 16;                       /* source tile size, px */
  const WALK_MS = 150;                 /* one tile; ~6.7 tiles/sec */
  const ENCOUNTER_CHANCE = 0.14;       /* per tall-grass tile entered */

  const DIRS = {
    down:  { dx: 0,  dy: 1,  row: 0 },
    left:  { dx: -1, dy: 0,  row: 1 },
    right: { dx: 1,  dy: 0,  row: 2 },
    up:    { dx: 0,  dy: -1, row: 3 }
  };

  /* ── loading ──────────────────────────────────────────────────────*/
  const maps = {};                     /* id -> parsed + indexed map */

  function index(raw, id) {
    const m = {
      id: id, w: raw.width, h: raw.height,
      tw: raw.tilewidth || TS, th: raw.tileheight || TS,
      ground: null, over: null, objects: [],
      props: {},                       /* gid -> {solid,grass,door} */
      tileset: null, spawn: { x: 1, y: 1 },
      zone: null
    };
    for (const p of raw.properties || [])
      if (p.name === 'zone') m.zone = p.value;

    /* gid -> properties, resolved through firstgid ONCE at load. Doing
       it per step would be a lookup per frame for data that never
       changes. */
    for (const ts of raw.tilesets || []) {
      m.tileset = ts;
      for (const t of ts.tiles || []) {
        const gid = ts.firstgid + t.id, o = {};
        for (const p of t.properties || []) o[p.name] = p.value;
        m.props[gid] = o;
      }
    }
    for (const L of raw.layers || []) {
      if (L.type === 'tilelayer' && L.name === 'ground') m.ground = L.data;
      else if (L.type === 'tilelayer' && L.name === 'over') m.over = L.data;
      else if (L.type === 'objectgroup') {
        for (const o of L.objects || []) {
          const p = {};
          for (const q of o.properties || []) p[q.name] = q.value;
          /* Tiled gives object pixel coords; points sit at tile centre */
          const e = { kind: o.type || o.name,
                      x: Math.floor(o.x / m.tw), y: Math.floor(o.y / m.th),
                      props: p };
          m.objects.push(e);
          if (e.kind === 'spawn') m.spawn = { x: e.x, y: e.y };
        }
      }
    }
    if (!m.ground) throw new Error(id + ': no "ground" tile layer');
    return m;
  }

  function put(id, raw) { maps[id] = index(raw, id); return maps[id]; }
  const known = () => Object.keys(maps);

  /* ── queries ──────────────────────────────────────────────────────*/
  function at(m, x, y) {
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return null;
    return m.ground[y * m.w + x];
  }
  function propAt(m, x, y) {
    const g = at(m, x, y);
    return g == null ? null : (m.props[g] || {});
  }
  /* OUT OF BOUNDS IS SOLID. A map edge must stop you, or the player
     walks into negative coordinates and the renderer reads undefined. */
  function solid(m, x, y) {
    const p = propAt(m, x, y);
    return p === null ? true : !!p.solid;
  }
  function grassy(m, x, y) {
    const p = propAt(m, x, y);
    return !!(p && p.grass);
  }
  function objectAt(m, x, y, kind) {
    for (const o of m.objects)
      if (o.x === x && o.y === y && (!kind || o.kind === kind)) return o;
    return null;
  }

  /* ── the live world ───────────────────────────────────────────────*/
  const W = {
    map: null, hero: { x: 1, y: 1, dir: 'down', step: null, buffer: null },
    rand: Math.random,
    onEncounter: null, onWarp: null, onHeal: null,
    paused: false
  };

  function enter(mapId, atXY) {
    const m = maps[mapId];
    if (!m) return false;
    W.map = m;
    const s = atXY || m.spawn;
    W.hero.x = s.x; W.hero.y = s.y;
    W.hero.step = null; W.hero.buffer = null;
    return true;
  }

  /* Ask to walk. Returns false if refused outright (blocked, or paused).
     A request DURING a slide is buffered so holding a direction walks
     continuously and a quick tap is never swallowed between frames. */
  function walk(dir) {
    if (W.paused || !W.map || !DIRS[dir]) return false;
    if (W.hero.step) { W.hero.buffer = dir; return true; }
    return begin(dir);
  }

  function begin(dir) {
    const d = DIRS[dir], h = W.hero;
    h.dir = dir;                        /* you turn even if blocked */
    const nx = h.x + d.dx, ny = h.y + d.dy;
    if (solid(W.map, nx, ny)) return false;
    h.step = { fx: h.x, fy: h.y, tx: nx, ty: ny, t: 0 };
    return true;
  }

  /* One update. dt in ms. Returns an event or null — the caller decides
     what a warp or an encounter MEANS, this only reports that one is
     due. Same split as battle.js: rules here, consequences outside. */
  function tick(dt) {
    const h = W.hero;
    if (!W.map || W.paused) return null;
    if (!h.step) {
      if (h.buffer) { const b = h.buffer; h.buffer = null; begin(b); }
      return null;
    }
    h.step.t += dt;
    if (h.step.t < WALK_MS) return null;

    /* the step completed: commit the tile, then test what is on it */
    h.x = h.step.tx; h.y = h.step.ty; h.step = null;

    const warp = objectAt(W.map, h.x, h.y, 'warp');
    if (warp) {
      const to = warp.props.to;
      /* A WARP TO A MAP THAT IS NOT LOADED IS IGNORED, never followed
         into a crash. checkmap.js proves none of them point at nothing,
         so this is the belt to that braces. */
      if (to && maps[to]) {
        const tx = warp.props.tx, ty = warp.props.ty;
        enter(to, (tx != null && ty != null) ? { x: tx, y: ty } : null);
        return { kind: 'warp', to: to };
      }
    }
    const heal = objectAt(W.map, h.x, h.y, 'heal');
    if (heal) return { kind: 'heal' };

    if (grassy(W.map, h.x, h.y) && W.rand() < ENCOUNTER_CHANCE)
      return { kind: 'encounter', zone: W.map.zone || 'route1' };

    if (h.buffer) { const b = h.buffer; h.buffer = null; begin(b); }
    return null;
  }

  /* interpolated position, in tiles — what the renderer draws at */
  function heroPos() {
    const h = W.hero;
    if (!h.step) return { x: h.x, y: h.y };
    const k = Math.min(1, h.step.t / WALK_MS);
    return { x: h.step.fx + (h.step.tx - h.step.fx) * k,
             y: h.step.fy + (h.step.ty - h.step.fy) * k };
  }

  /* ── drawing ──────────────────────────────────────────────────────
     INTEGER SCALE ONLY. A fractional scale on pixel art gives uneven
     tile seams — some rows of pixels doubled, some not — and it is the
     single most common way pixel art is ruined by a renderer. Aim for
     about 13 tiles across, then round DOWN to a whole number. */
  function scaleFor(cssW) {
    return Math.max(2, Math.floor(cssW / (13 * TS)));
  }

  function draw(g, cssW, cssH, dpr, sheet) {
    const m = W.map;
    if (!m) return;
    const s = scaleFor(cssW);
    const tp = TS * s;                            /* tile px on screen */
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0d1118';
    g.fillRect(0, 0, cssW, cssH);

    /* camera centres the hero and then CLAMPS to the map, so you never
       see past the edge into void */
    const p = heroPos();
    const viewW = cssW / tp, viewH = cssH / tp;
    let cx = p.x + 0.5 - viewW / 2, cy = p.y + 0.5 - viewH / 2;
    cx = m.w <= viewW ? (m.w - viewW) / 2 : Math.max(0, Math.min(m.w - viewW, cx));
    cy = m.h <= viewH ? (m.h - viewH) / 2 : Math.max(0, Math.min(m.h - viewH, cy));

    const cols = m.tileset ? m.tileset.columns : 8;
    const first = m.tileset ? m.tileset.firstgid : 1;

    const blit = (data) => {
      if (!data || !sheet || !sheet.ready) return;
      const x0 = Math.floor(cx), y0 = Math.floor(cy);
      const x1 = Math.min(m.w - 1, Math.ceil(cx + viewW));
      const y1 = Math.min(m.h - 1, Math.ceil(cy + viewH));
      for (let y = Math.max(0, y0); y <= y1; y++)
        for (let x = Math.max(0, x0); x <= x1; x++) {
          const gid = data[y * m.w + x];
          if (!gid) continue;
          const li = gid - first;
          g.drawImage(sheet.img, (li % cols) * TS, Math.floor(li / cols) * TS,
                      TS, TS,
                      Math.round((x - cx) * tp), Math.round((y - cy) * tp),
                      tp, tp);
        }
    };

    blit(m.ground);
    drawHero(g, p, cx, cy, tp, s);
    blit(m.over);
  }

  /* The hero. A shape until there is a walk sheet — same rule as the
     creature sprites: art is never on the critical path to judging
     movement. `dir` is shown by a nose so facing is legible without art. */
  function drawHero(g, p, cx, cy, tp, s) {
    const x = Math.round((p.x - cx) * tp), y = Math.round((p.y - cy) * tp);
    const d = DIRS[W.hero.dir] || DIRS.down;
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.beginPath();
    g.ellipse(x + tp / 2, y + tp * 0.92, tp * 0.34, tp * 0.14, 0, 0, 6.3);
    g.fill();
    g.fillStyle = '#e8ecf5';
    g.fillRect(x + tp * 0.22, y + tp * 0.10, tp * 0.56, tp * 0.80);
    g.fillStyle = '#f0803c';
    g.fillRect(x + tp * 0.22 + (tp * 0.56 / 2) + d.dx * tp * 0.26 - tp * 0.08,
               y + tp * 0.50 + d.dy * tp * 0.30 - tp * 0.08,
               tp * 0.16, tp * 0.16);
  }

  root.OVERWORLD = {
    TS, WALK_MS, DIRS, ENCOUNTER_CHANCE,
    put, known, enter, walk, tick, draw, heroPos, scaleFor,
    at, propAt, solid, grassy, objectAt,
    get maps() { return maps; },
    get state() { return W; },
    setRand(fn) { W.rand = fn || Math.random; },
    pause(v) { W.paused = !!v; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
