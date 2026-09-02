'use strict';
/* minimap.js — window.MINIMAP (HUD_SPEC.md §5, extended)
   Two faces of the same world map, both DERIVED from the map data:

   1. THE CORNER INDICATOR (#mmap, fixed top-left, 132x64 — same box and
      id as ever, quest.js measures its rect). No longer a spreadsheet of
      boxes: it stitches every field map's ground[] into one global tile
      grid (the maps are cut from a single world with a one-tile overlap,
      so gluing them back gives the real island, coastline and all) and
      draws that fragment — sea, meadow, roads, the ruin wing. Visited
      screens are revealed in their true terrain colours, unvisited ones
      sit under fog, and the current screen carries a gold ring + dot.
      Redrawn ONLY when the current map changes (no rAF, no per-frame
      work). It is now a BUTTON: tapping it (or Enter/Space) opens…

   2. THE FULL WORLD MAP (#wmap, modal, built fresh on each open): an
      arcane-chart rendering of the same stitched grid at readable size —
      graticule and compass over deep sea, the island painted tile by
      tile, an inked coastline, the pond, the Old Ruin drawn as a
      location off the west causeway, region names from HUDT.mapLabel(),
      fog-of-the-unknown over unexplored screens, and a gold pin at
      WORLD.playerAt(). Nothing here is an image asset; if the maps
      change, this map changes with them.

   States never ride on colour alone: fog is darker AND hatched, the
   current position is a ring AND a dot AND named in the aria-label.

   Behaviour: MINIMAP.init() builds the DOM, loads the visited set from
   localStorage (HUDT.KEYS.VISITED, a JSON array of map ids), then POLLS
   WORLD._map.id every HUDT.MMAP.POLL_MS — polling on purpose: the single
   WORLD.onExit callback slot belongs to world.html's glue and must not
   be stolen. MINIMAP.setCurrent(id) is the public/test path; open() /
   close() drive the overlay.

   Owns only: #mmap, #wmap, #minimap-css. Reads HUDT + MAPS + MAP_INDEX +
   WORLD._map.id / WORLD.playerAt(). Geometry/palette from window.HUDT. */
window.MINIMAP = (function () {

  const HT = window.HUDT;
  if (!HT) {                                  /* contract file missing —  */
    return { init: function () {}, setCurrent: function () {},
             open: function () {}, close: function () {} };
  }
  const M = HT.MMAP, C = HT.C;

  /* ── layout (CSS px inside the indicator; PAD margin all round) ──── */
  const BOX_W = M.W + M.PAD * 2;              /* 132                      */
  const BOX_H = M.H + M.PAD * 2;              /* 64                       */
  const WING_W = M.RUIN_CELL * 2 + M.GAP;     /* 26 — the two ruin rooms  */

  /* ── the chart palette (fits #0E0B1A / gold / violet, ≥3:1 on sea) ── */
  const SEA       = '#111737';                /* open water               */
  const SEA_DEEP  = '#0C1028';
  const SHALLOW   = 'rgba(46,62,122,.55)';    /* coast-hugging band       */
  const INK       = 'rgba(216,183,112,.78)';  /* coastline pen line       */
  const INK_GLOW  = 'rgba(216,183,112,.14)';
  const FOG_FILL  = '#0E0B1D';                /* unexplored — opaque: what
                                                 you have not seen stays
                                                 genuinely unknown        */
  const FOG_HATCH = 'rgba(255,255,255,.05)';
  const FOG_EDGE  = 'rgba(138,92,255,.30)';   /* fog / revealed boundary  */
  const STONE     = '#3E4560';                /* ruin masonry             */
  const STONE_LN  = 'rgba(216,183,112,.6)';
  const LABEL_INK = 'rgba(238,222,178,.92)';
  const GRASS = ['#2C5A38', '#316140', '#295433', '#2E5D3B'];
  const TINT = {                              /* ground id → paint        */
    16: null, 17: null,                       /* grass — shade by hash    */
    18: null,                                 /* grass + flower dot       */
    19: '#6E5138',                            /* dirt                     */
    20: '#957A57',                            /* stone path               */
    22: '#5C657D',                            /* cliff                    */
    23: '#7A5A3A'                             /* bridge                   */
  };
  const WATER_ID = 21;
  function isLand(t) { return t > 0 && t !== WATER_ID; }
  function hash(x, y) {                       /* deterministic shade pick */
    let h = (x * 73856093) ^ (y * 19349663);
    h = (h ^ (h >> 13)) >>> 0;
    return h;
  }
  function tilePaint(t, x, y) {
    if (t === 18) return GRASS[hash(x, y) % 4];      /* flower dot later */
    const fixed = TINT[t];
    if (fixed) return fixed;
    return GRASS[hash(x, y) % 4];
  }

  /* ── the stitched world (built once from MAPS + MAP_INDEX) ─────────
     Field maps are slices of ONE global grid with a one-tile overlap
     (see maps/field-0-0.js), so map (gx,gy) local (c,r) is global
     (gx·(w−1)+c, gy·(h−1)+r). Gluing them back recovers the actual
     island — the coastline below is real data, not decoration. */
  let WG = null;
  function worldGrid() {
    if (WG) return WG;
    const IX = window.MAP_INDEX, MS = window.MAPS;
    if (!IX || !IX.fieldGrid || !MS) return null;
    const grid = IX.fieldGrid;
    const rows = grid.length, cols = grid[0].length;
    const m0 = MS[grid[0][0]];
    if (!m0 || !m0.ground) return null;
    const mw = m0.w, mh = m0.h, sx = mw - 1, sy = mh - 1;
    const W = cols * sx + 1, H = rows * sy + 1;
    const t = [];
    for (let y = 0; y < H; y++) t.push(new Array(W).fill(0));
    for (let gy = 0; gy < rows; gy++)
      for (let gx = 0; gx < cols; gx++) {
        const m = MS[grid[gy][gx]];
        if (!m || !m.ground) continue;
        for (let r = 0; r < mh; r++)
          for (let c = 0; c < mw; c++)
            t[gy * sy + r][gx * sx + c] = m.ground[r][c];
      }
    /* where does the ruin wing attach? the exit marker that leaves the
       field grid for a non-field map is the causeway (fallback: row 6) */
    /* THE RUIN WING IS NOT "EVERY MAP THAT IS NOT A FIELD". It was written
       that way while the ruin was the only thing off the grid; the moment the
       two dungeons landed, all eight of their rooms joined the ruin wing and
       the chart tried to draw a two-room wing containing ten rooms.
       A dungeon is anything reachable through a GATED exit — data, not a name,
       so a third dungeon classifies itself. Dungeons are deliberately absent
       from the chart: they are interiors, and the world map draws the world. */
    let anchor = { x: 0, y: 6 }, ruinIds = [];
    const dungeon = {};
    (function () {
      const q = [];
      for (const id in MS)
        for (const mk of (MS[id].markers || []))
          if (mk.type === 'exit' && mk.need && MS[mk.to] && !dungeon[mk.to]) {
            dungeon[mk.to] = 1; q.push(mk.to);
          }
      while (q.length) {                       /* follow the doors inward */
        const id = q.pop();
        for (const mk of (MS[id].markers || []))
          if (mk.type === 'exit' && MS[mk.to] && !dungeon[mk.to] &&
              !/^field-/.test(mk.to)) { dungeon[mk.to] = 1; q.push(mk.to); }
      }
    })();
    for (let i = 0; i < (IX.list || []).length; i++)
      if (!/^field-/.test(IX.list[i]) && !dungeon[IX.list[i]])
        ruinIds.push(IX.list[i]);
    /* the CAUSEWAY anchor must be the way to the ruin, not a dungeon mouth.
       This took the first off-grid exit it found, which after the dungeons
       landed could be a mouth — and the wing would then be drawn hanging off
       a crypt door on the wrong side of the island. */
    outer:
    for (let gy = 0; gy < rows; gy++)
      for (let gx = 0; gx < cols; gx++) {
        const m = MS[grid[gy][gx]];
        const mks = (m && m.markers) || [];
        for (let k = 0; k < mks.length; k++)
          if (mks[k].type === 'exit' && mks[k].to && !mks[k].need &&
              !/^field-/.test(mks[k].to)) {
            anchor = { x: gx * sx + mks[k].c, y: gy * sy + mks[k].r };
            break outer;
          }
      }
    WG = { w: W, h: H, cols: cols, rows: rows, sx: sx, sy: sy, mw: mw, mh: mh,
           t: t, anchor: anchor, ruins: ruinIds.length ? ruinIds : ['ruin-01', 'ruin-02'],
           ids: grid };
    return WG;
  }
  function regionName(id) {                   /* "The Fields" / "Old Ruin" */
    return String(HT.mapLabel(id)).split(',')[0];
  }

  /* ── state ─────────────────────────────────────────────────────────── */
  let visited = loadVisited();                /* Set of map ids           */
  let cur = null;                             /* current map id or null   */
  let box = null, cv = null, ctx = null, dpr = 1, pollT = null;
  let wmap = null, wcv = null, wclose = null, wsub = null;   /* overlay  */
  let lastFocus = null, resizeT = null;

  function loadVisited() {
    try {
      const d = JSON.parse(localStorage.getItem(HT.KEYS.VISITED));
      if (Array.isArray(d))
        return new Set(d.filter(function (x) { return typeof x === 'string'; }));
    } catch (e) {}
    return new Set();
  }
  function saveVisited() {
    try {
      localStorage.setItem(HT.KEYS.VISITED, JSON.stringify(Array.from(visited)));
    } catch (e) {}
  }

  /* ── DOM + CSS (indicator button and modal overlay) ────────────────── */
  const CSS = [
    /* the corner indicator — now a real button */
    '#mmap{position:fixed;',
    ' top:calc(8px + env(safe-area-inset-top,0px));',
    ' left:calc(8px + env(safe-area-inset-left,0px));',
    ' z-index:' + HT.Z.HUD + ';',
    ' width:' + BOX_W + 'px;height:' + BOX_H + 'px;',
    ' padding:0;border:0;display:block;cursor:pointer;',
    ' background:rgba(23,19,49,.88);',
    ' box-shadow:inset 0 0 0 1px ' + C.line + ',0 4px 14px rgba(0,0,0,.35);',
    ' border-radius:10px;overflow:hidden;',
    ' touch-action:manipulation;-webkit-tap-highlight-color:transparent;',
    ' -webkit-user-select:none;user-select:none}',
    '#mmap:focus-visible{outline:2px solid ' + C.gold + ';outline-offset:2px}',
    '#mmap:active{transform:scale(.97)}',
    '#mmap canvas{display:block;width:' + BOX_W + 'px;height:' + BOX_H + 'px;',
    ' pointer-events:none}',
    /* the world-map overlay */
    '#wmap{position:fixed;inset:0;z-index:' + HT.Z.PANELS + ';',
    ' display:flex;align-items:center;justify-content:center;',
    ' padding:calc(14px + env(safe-area-inset-top,0px))',
    '  calc(14px + env(safe-area-inset-right,0px))',
    '  calc(14px + env(safe-area-inset-bottom,0px))',
    '  calc(14px + env(safe-area-inset-left,0px))}',
    '#wmap[hidden]{display:none}',
    '#wmap .wm-scrim{position:absolute;inset:0;background:rgba(7,5,16,.78);',
    ' animation:wmFade .18s ease-out}',
    '#wmap .wm-card{position:relative;width:min(100%,560px);max-height:100%;',
    ' overflow:auto;overscroll-behavior:contain;border-radius:16px;',
    ' background:linear-gradient(180deg,#1D1745,#131030);',
    ' box-shadow:0 0 0 1px rgba(255,197,66,.22),0 24px 60px rgba(0,0,0,.55),',
    '  inset 0 1px 0 rgba(255,255,255,.06);',
    ' padding:14px;animation:wmIn .22s ' + HT.BAR.EASE + '}',
    /* arcane-chart corner brackets */
    '#wmap .wm-card::before,#wmap .wm-card::after{content:"";position:absolute;',
    ' width:16px;height:16px;pointer-events:none;',
    ' border:2px solid rgba(255,197,66,.45)}',
    '#wmap .wm-card::before{top:6px;left:6px;border-right:0;border-bottom:0;',
    ' border-top-left-radius:10px}',
    '#wmap .wm-card::after{bottom:6px;right:6px;border-left:0;border-top:0;',
    ' border-bottom-right-radius:10px}',
    '#wmap header{display:flex;align-items:flex-start;gap:10px;margin:0 2px}',
    '#wmap .wm-tt{flex:1;min-width:0}',
    '#wmap .wm-over{margin:0;font-size:10px;font-weight:800;',
    ' letter-spacing:.42em;text-indent:.02em;color:#B9A8F5}',
    '#wmap h2{margin:2px 0 0;font-size:17px;font-weight:900;',
    ' letter-spacing:.14em;color:' + C.gold + ';text-transform:uppercase}',
    '#wmap .wm-sub{margin:3px 0 0;font-size:12px;color:' + C.dim + '}',
    '#wmap .wm-x{flex:none;width:44px;height:44px;padding:0;border:0;',
    ' border-radius:12px;background:rgba(255,255,255,.06);cursor:pointer;',
    ' box-shadow:inset 0 0 0 1px ' + C.line + ';color:' + C.ink + ';',
    ' display:flex;align-items:center;justify-content:center;',
    ' touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
    '#wmap .wm-x:focus-visible{outline:2px solid ' + C.gold + ';outline-offset:2px}',
    '#wmap .wm-x:active{transform:scale(.94)}',
    '#wmap canvas{display:block;width:100%;border-radius:10px;margin-top:12px;',
    ' box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}',
    '#wmap .wm-leg{display:flex;flex-wrap:wrap;gap:6px 14px;margin:10px 2px 0;',
    ' font-size:11px;font-weight:600;color:' + C.dim + '}',
    '#wmap .wm-leg span{display:inline-flex;align-items:center;gap:6px}',
    '#wmap .wm-leg i{width:11px;height:11px;border-radius:3px;flex:none}',
    '@keyframes wmIn{from{opacity:0;transform:scale(.96) translateY(8px)}',
    ' to{opacity:1;transform:none}}',
    '@keyframes wmFade{from{opacity:0}to{opacity:1}}',
    '@media (prefers-reduced-motion:reduce){',
    ' #wmap .wm-card,#wmap .wm-scrim{animation:none}',
    ' #mmap:active,#wmap .wm-x:active{transform:none}}'
  ].join('');

  function ensureDom() {
    if (box || !document.body) return;
    const st = document.createElement('style');
    st.id = 'minimap-css'; st.textContent = CSS;
    document.head.appendChild(st);
    box = document.createElement('button');
    box.id = 'mmap'; box.type = 'button';
    box.setAttribute('aria-haspopup', 'dialog');
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv = document.createElement('canvas');
    cv.width = Math.round(BOX_W * dpr);
    cv.height = Math.round(BOX_H * dpr);
    cv.setAttribute('aria-hidden', 'true');
    box.appendChild(cv);
    box.addEventListener('click', openMap);
    document.body.appendChild(box);
    ctx = cv.getContext('2d');
    draw();
  }

  /* ── shared painters ───────────────────────────────────────────────── */
  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  /* land tiles + flower dots; X/Y map tile coords → css px, s = tile px */
  function paintLand(g, wg, X, Y, s, dots) {
    const o = s * 0.25;                       /* seam-hiding overlap      */
    for (let y = 0; y < wg.h; y++)
      for (let x = 0; x < wg.w; x++) {
        const t = wg.t[y][x];
        if (!isLand(t)) continue;
        g.fillStyle = tilePaint(t, x, y);
        g.fillRect(X(x) - o / 2, Y(y) - o / 2, s + o, s + o);
      }
    if (dots)
      for (let y = 0; y < wg.h; y++)
        for (let x = 0; x < wg.w; x++)
          if (wg.t[y][x] === 18) {            /* flowers                  */
            g.fillStyle = (hash(y, x) & 1) ? '#E4C878' : '#C88CC8';
            g.beginPath();
            g.arc(X(x) + s / 2, Y(y) + s / 2, Math.max(0.6, s * 0.14), 0, 7);
            g.fill();
          }
  }
  /* the shallow band + inked coastline: every land↔water edge, one path */
  function paintCoast(g, wg, X, Y, s, lw) {
    g.fillStyle = SHALLOW;                    /* water touching land      */
    for (let y = 0; y < wg.h; y++)
      for (let x = 0; x < wg.w; x++) {
        if (isLand(wg.t[y][x])) continue;
        let near = false;
        for (let d = -1; d <= 1 && !near; d++)
          for (let e = -1; e <= 1; e++) {
            const yy = y + d, xx = x + e;
            if (yy >= 0 && yy < wg.h && xx >= 0 && xx < wg.w &&
                isLand(wg.t[yy][xx])) { near = true; break; }
          }
        if (near) g.fillRect(X(x), Y(y), s + 0.5, s + 0.5);
      }
    g.beginPath();
    for (let y = 0; y < wg.h; y++)
      for (let x = 0; x < wg.w; x++) {
        if (!isLand(wg.t[y][x])) continue;
        const wat = function (yy, xx) {
          return yy < 0 || yy >= wg.h || xx < 0 || xx >= wg.w ||
                 !isLand(wg.t[yy][xx]);
        };
        if (wat(y - 1, x)) { g.moveTo(X(x), Y(y)); g.lineTo(X(x) + s, Y(y)); }
        if (wat(y + 1, x)) { g.moveTo(X(x), Y(y) + s); g.lineTo(X(x) + s, Y(y) + s); }
        if (wat(y, x - 1)) { g.moveTo(X(x), Y(y)); g.lineTo(X(x), Y(y) + s); }
        if (wat(y, x + 1)) { g.moveTo(X(x) + s, Y(y)); g.lineTo(X(x) + s, Y(y) + s); }
      }
    g.lineCap = 'round';
    g.strokeStyle = INK_GLOW; g.lineWidth = lw * 3; g.stroke();
    g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
  }
  /* fog over every unvisited field screen: ONE merged fill (no interior
     seams — the unknown reads as one mass, not boxes), hatch clipped to
     it, then a dashed edge only where fog meets ground already seen */
  function paintFog(g, wg, X, Y, s, hatch) {
    const unv = [];
    for (let gy = 0; gy < wg.rows; gy++)
      for (let gx = 0; gx < wg.cols; gx++)
        if (!visited.has(wg.ids[gy][gx])) unv.push([gx, gy]);
    if (!unv.length) return;
    const rect = function (u) {
      return [X(u[0] * wg.sx), Y(u[1] * wg.sy), wg.mw * s, wg.mh * s];
    };
    g.beginPath();
    for (let i = 0; i < unv.length; i++) {
      const r = rect(unv[i]);
      g.rect(r[0], r[1], r[2], r[3]);
    }
    g.fillStyle = FOG_FILL;
    if (hatch) {                              /* feathered edge: the fog  */
      g.save();                               /* blooms past its rects so */
      g.shadowColor = FOG_FILL;               /* the unknown reads as     */
      g.shadowBlur = s * 1.6 * dpr;           /* mist, not cut-out boxes  */
      g.fill(); g.fill();
      g.restore();
    }
    g.fill();
    if (hatch) {
      g.save(); g.clip();
      g.strokeStyle = FOG_HATCH; g.lineWidth = 1;
      const W = X(wg.w) + s * 4, H0 = Y(0) - s * 2, H1 = Y(wg.h) + s * 2;
      g.beginPath();
      for (let x = X(0) - (H1 - H0); x < W; x += 7) {
        g.moveTo(x, H1); g.lineTo(x + (H1 - H0), H0);
      }
      g.stroke(); g.restore();
    }
    g.strokeStyle = FOG_EDGE; g.lineWidth = 1;
    g.setLineDash([4, 3]);
    g.beginPath();
    for (let i = 0; i < unv.length; i++) {
      const gx = unv[i][0], gy = unv[i][1], r = rect(unv[i]);
      const seen = function (xx, yy) {
        return yy >= 0 && yy < wg.rows && xx >= 0 && xx < wg.cols &&
               visited.has(wg.ids[yy][xx]);
      };
      if (seen(gx, gy - 1)) { g.moveTo(r[0], r[1]); g.lineTo(r[0] + r[2], r[1]); }
      if (seen(gx, gy + 1)) { g.moveTo(r[0], r[1] + r[3]); g.lineTo(r[0] + r[2], r[1] + r[3]); }
      if (seen(gx - 1, gy)) { g.moveTo(r[0], r[1]); g.lineTo(r[0], r[1] + r[3]); }
      if (seen(gx + 1, gy)) { g.moveTo(r[0] + r[2], r[1]); g.lineTo(r[0] + r[2], r[1] + r[3]); }
    }
    g.stroke();
    g.setLineDash([]);
  }
  function goldDot(g, x, y, r) {
    g.save();
    g.shadowColor = C.gold; g.shadowBlur = r * 3 * dpr;
    g.fillStyle = C.gold;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
  }

  /* ── the corner indicator ──────────────────────────────────────────── */
  function draw() {
    if (!ctx) return;
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = SEA;
    g.fillRect(0, 0, BOX_W, BOX_H);
    const wg = worldGrid();
    if (wg) drawFragment(g, wg);
    else drawFallback(g);                     /* harness without maps/    */
    if (box)
      box.setAttribute('aria-label', (cur
        ? 'Map — you are in ' + HT.mapLabel(cur) + '.'
        : 'Map.') + ' Opens the world map');
  }
  function drawFragment(g, wg) {
    const x0 = M.PAD + WING_W + M.RUIN_GAP;   /* island area starts here  */
    const aw = BOX_W - x0 - M.PAD, ah = M.H;
    const s = Math.min(aw / wg.w, ah / wg.h);
    const ox = x0 + (aw - wg.w * s) / 2, oy = M.PAD + (ah - wg.h * s) / 2;
    const X = function (x) { return ox + x * s; };
    const Y = function (y) { return oy + y * s; };
    paintLand(g, wg, X, Y, s, false);
    paintCoast(g, wg, X, Y, s, 0.75);
    paintFog(g, wg, X, Y, s, false);
    /* the ruin wing: two little rooms joined to the causeway row */
    const ay = Y(wg.anchor.y + 0.5);
    const ry = Math.max(M.PAD, Math.min(BOX_H - M.PAD - M.RUIN_CELL,
                                        ay - M.RUIN_CELL / 2));
    g.strokeStyle = STONE_LN; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(M.PAD + WING_W, ay); g.lineTo(X(wg.anchor.x) + s, ay);
    g.stroke();
    drawRuinRoom(g, wg.ruins[0], M.PAD, ry, M.RUIN_CELL);
    drawRuinRoom(g, wg.ruins[1], M.PAD + M.RUIN_CELL + M.GAP, ry, M.RUIN_CELL);
    /* the current screen: gold ring + centre dot (shape + glow, not
       colour alone; ruin rooms handle their own ring) */
    if (cur && !/^field-/.test(cur)) return;
    for (let gy = 0; gy < wg.rows; gy++)
      for (let gx = 0; gx < wg.cols; gx++)
        if (wg.ids[gy][gx] === cur) {
          const rx = X(gx * wg.sx), ry2 = Y(gy * wg.sy),
                rw = wg.mw * s, rh = wg.mh * s;
          g.strokeStyle = C.gold; g.lineWidth = 1.5;
          rrect(g, rx + 0.75, ry2 + 0.75, rw - 1.5, rh - 1.5, 3);
          g.stroke();
          goldDot(g, rx + rw / 2, ry2 + rh / 2, 2.4);
        }
  }
  function drawRuinRoom(g, id, x, y, sz) {
    if (id && visited.has(id)) {
      g.fillStyle = STONE;
      rrect(g, x, y, sz, sz, 2.5); g.fill();
      g.strokeStyle = STONE_LN; g.lineWidth = 1;
      rrect(g, x + 0.5, y + 0.5, sz - 1, sz - 1, 2.5); g.stroke();
    } else {
      g.fillStyle = FOG_FILL;
      rrect(g, x, y, sz, sz, 2.5); g.fill();
      g.strokeStyle = FOG_EDGE; g.lineWidth = 1;
      rrect(g, x + 0.5, y + 0.5, sz - 1, sz - 1, 2.5); g.stroke();
    }
    if (id === cur) {
      g.strokeStyle = C.gold; g.lineWidth = 1.5;
      rrect(g, x + 0.75, y + 0.75, sz - 1.5, sz - 1.5, 2.5); g.stroke();
      goldDot(g, x + sz / 2, y + sz / 2, 2.2);
    }
  }
  /* no MAPS on the page (test harness): the honest old grid of cells */
  function drawFallback(g) {
    const STEP = M.CELL + M.GAP, gx0 = M.PAD + WING_W + M.RUIN_GAP;
    const one = function (id, x, y, sz) {
      if (id === cur) {
        g.fillStyle = C.gold;
        rrect(g, x, y, sz, sz, 3); g.fill();
      } else if (visited.has(id)) {
        g.fillStyle = '#2A2450';
        rrect(g, x, y, sz, sz, 3); g.fill();
      } else {
        g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1;
        rrect(g, x + 0.5, y + 0.5, sz - 1, sz - 1, 3); g.stroke();
      }
    };
    one('ruin-01', M.PAD, M.PAD, M.RUIN_CELL);
    one('ruin-02', M.PAD + M.RUIN_CELL + M.GAP, M.PAD, M.RUIN_CELL);
    for (let ry = 0; ry < M.GRID_H; ry++)
      for (let cx = 0; cx < M.GRID_W; cx++)
        one('field-' + cx + '-' + ry, gx0 + cx * STEP, M.PAD + ry * STEP, M.CELL);
  }

  /* ── the full world map (modal; built on open, never held live) ────── */
  function ensureMapDom() {
    if (wmap) return;
    wmap = document.createElement('div');
    wmap.id = 'wmap';
    wmap.setAttribute('role', 'dialog');
    wmap.setAttribute('aria-modal', 'true');
    wmap.setAttribute('aria-label', 'World map');
    wmap.hidden = true;
    wmap.innerHTML =
      '<div class="wm-scrim"></div>' +
      '<div class="wm-card">' +
      '<header>' +
      '<div class="wm-tt">' +
      '<p class="wm-over">IL-QAWMIEN</p>' +
      '<h2 id="wmap-h">World Map</h2>' +
      '<p class="wm-sub" id="wmap-sub"></p>' +
      '</div>' +
      '<button class="wm-x" id="wmap-x" type="button" aria-label="Close map">' +
      '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg>' +
      '</button>' +
      '</header>' +
      '<canvas id="wmap-cv" role="img"></canvas>' +
      '<div class="wm-leg" aria-hidden="true">' +
      '<span><i style="background:#2E5D3B"></i>Meadow</span>' +
      '<span><i style="background:#957A57"></i>Road</span>' +
      '<span><i style="background:' + SEA + ';box-shadow:inset 0 0 0 1px ' +
        'rgba(216,183,112,.5)"></i>Water</span>' +
      '<span><i style="background:' + STONE + '"></i>Ruin</span>' +
      '<span><i style="background:repeating-linear-gradient(45deg,#0D0A1A 0 3px,' +
        '#1A1530 3px 4px)"></i>Unexplored</span>' +
      '<span><i style="background:' + C.gold + ';border-radius:50%"></i>You</span>' +
      '</div></div>';
    wmap.setAttribute('aria-labelledby', 'wmap-h');
    wmap.removeAttribute('aria-label');
    document.body.appendChild(wmap);
    wcv = wmap.querySelector('#wmap-cv');
    wclose = wmap.querySelector('#wmap-x');
    wsub = wmap.querySelector('#wmap-sub');
    wclose.addEventListener('click', closeMap);
    wmap.querySelector('.wm-scrim').addEventListener('click', closeMap);
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); closeMap(); }
    else if (e.key === 'Tab') { e.preventDefault(); wclose.focus(); }
  }
  function onResize() {
    if (resizeT) clearTimeout(resizeT);
    resizeT = setTimeout(function () { if (wmap && !wmap.hidden) paintMap(); }, 120);
  }
  function openMap() {
    ensureDom(); ensureMapDom();
    lastFocus = document.activeElement;
    wmap.hidden = false;
    paintMap();
    wclose.focus();
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
  }
  function closeMap() {
    if (!wmap || wmap.hidden) return;
    wmap.hidden = true;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    /* iOS Safari never focuses a tapped button, so lastFocus is usually
       <body>; send focus to the indicator then, not into the void */
    if (lastFocus && lastFocus !== document.body && lastFocus.focus &&
        document.contains(lastFocus)) lastFocus.focus();
    else if (box) box.focus();
  }

  function paintMap() {
    if (!wcv) return;
    const wg = worldGrid();
    const cssW = wcv.clientWidth ||
      Math.min(532, (window.innerWidth || 360) - 56);
    /* layout in tile units: west wing for the ruin, sea margin around */
    const WING = 9, MARG = 2;
    const tw = wg ? wg.w : 46, th = wg ? wg.h : 28;
    const totW = WING + tw + MARG, totH = th + MARG * 2;
    const s = cssW / totW, cssH = Math.round(totH * s);
    wcv.style.height = cssH + 'px';
    wcv.width = Math.round(cssW * dpr);
    wcv.height = Math.round(cssH * dpr);
    const g = wcv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const X = function (x) { return (WING + x) * s; };
    const Y = function (y) { return (MARG + y) * s; };

    /* deep sea + a faint chart graticule and compass ring */
    const cxp = X(tw / 2), cyp = Y(th / 2);
    const grad = g.createRadialGradient(cxp, cyp, s * 6, cxp, cyp, cssW * 0.62);
    grad.addColorStop(0, '#141B3E');
    grad.addColorStop(1, SEA_DEEP);
    g.fillStyle = grad; g.fillRect(0, 0, cssW, cssH);
    g.strokeStyle = 'rgba(255,255,255,.045)'; g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x < totW; x += 5) { g.moveTo(x * s, 0); g.lineTo(x * s, cssH); }
    for (let y = 0; y < totH; y += 5) { g.moveTo(0, y * s); g.lineTo(cssW, y * s); }
    g.stroke();
    g.strokeStyle = 'rgba(138,92,255,.10)';
    g.beginPath(); g.arc(cxp, cyp, tw * 0.62 * s, 0, 7); g.stroke();
    g.beginPath(); g.arc(cxp, cyp, tw * 0.74 * s, 0, 7); g.stroke();
    /* little wave strokes in open water (deterministic, land-checked) */
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const px = (hash(i, 7) % (totW * 20)) / 20, py = (hash(3, i) % (totH * 20)) / 20;
      const txx = Math.floor(px - WING), tyy = Math.floor(py - MARG);
      if (wg && txx >= -1 && txx <= tw && tyy >= -1 && tyy <= th &&
          isLand((wg.t[tyy] || [])[txx] || 0)) continue;
      const wx = px * s, wy = py * s;
      g.beginPath();
      g.moveTo(wx - s, wy); g.quadraticCurveTo(wx - s * 0.4, wy - s * 0.5, wx, wy);
      g.quadraticCurveTo(wx + s * 0.4, wy + s * 0.5, wx + s, wy);
      g.stroke();
    }

    let exploredN = 0, totalN = 17;
    if (wg) {
      /* the island itself — every tile from the real map data */
      paintLand(g, wg, X, Y, s, s > 4);
      paintCoast(g, wg, X, Y, s, Math.max(1, s * 0.18));
      /* the Old Ruin — a located place off the west causeway */
      drawRuinPlace(g, wg, X, Y, s);
      paintFog(g, wg, X, Y, s, true);
      /* region name over the meadow, cartographer's italic */
      const anyField = wg.ids.some(function (row) {
        return row.some(function (id) { return visited.has(id); });
      });
      if (anyField) {
        g.font = 'italic 600 ' + Math.max(13, s * 2.6) + 'px Georgia,serif';
        try { g.letterSpacing = '2px'; } catch (e) {}
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = 'rgba(0,0,0,.55)';
        g.fillText(regionName(wg.ids[0][0]), cxp + 1, Y(th * 0.36) + 1);
        g.fillStyle = LABEL_INK;
        g.fillText(regionName(wg.ids[0][0]), cxp, Y(th * 0.36));
        try { g.letterSpacing = '0px'; } catch (e) {}
      }
      /* the gold pin — the hero's real tile when WORLD is live */
      drawPin(g, wg, X, Y, s);
      const IX = window.MAP_INDEX;
      const all = (IX && IX.list) || [];
      totalN = all.length || totalN;
      for (let i = 0; i < all.length; i++)
        if (visited.has(all[i])) exploredN++;
    } else {
      g.fillStyle = LABEL_INK;
      g.font = '600 13px system-ui,sans-serif';
      g.textAlign = 'center';
      g.fillText('Uncharted waters', cssW / 2, cssH / 2);
      exploredN = visited.size;
    }

    /* compass rose, top-right sea corner */
    const nx = cssW - s * 2.8, ny = s * 3.1, nr = Math.max(8, s * 1.4);
    g.strokeStyle = 'rgba(216,183,112,.55)'; g.lineWidth = 1;
    g.beginPath(); g.arc(nx, ny, nr, 0, 7); g.stroke();
    g.fillStyle = C.gold;
    g.beginPath();
    g.moveTo(nx, ny - nr * 0.85); g.lineTo(nx + nr * 0.3, ny);
    g.lineTo(nx, ny + nr * 0.5); g.lineTo(nx - nr * 0.3, ny);
    g.closePath(); g.fill();
    g.fillStyle = LABEL_INK;
    g.font = '700 ' + Math.max(8, s * 1.2) + 'px Georgia,serif';
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText('N', nx, ny - nr - 3);

    /* words for what the picture says */
    const here = cur ? HT.mapLabel(cur) : 'parts unknown';
    if (wsub) wsub.textContent =
      'You are in ' + here + ' — ' + exploredN + ' of ' + totalN + ' areas explored';
    wcv.setAttribute('aria-label', 'World map. You are in ' + here + '. ' +
      exploredN + ' of ' + totalN + ' areas explored.');
  }
  function drawRuinPlace(g, wg, X, Y, s) {
    const ay = Y(wg.anchor.y + 0.5);
    const rw = s * 3.2, rh = s * 2.7, gap = s * 0.35;
    const bx = X(-1.6) - rw * 2 - gap;        /* block sits west of coast */
    const seen = wg.ruins.some(function (id) { return visited.has(id); });
    /* dashed way from the ruin door to the causeway */
    g.strokeStyle = STONE_LN; g.lineWidth = Math.max(1, s * 0.16);
    g.setLineDash([s * 0.5, s * 0.45]);
    g.beginPath();
    g.moveTo(bx + rw * 2 + gap, ay); g.lineTo(X(wg.anchor.x + 0.5), ay);
    g.stroke();
    g.setLineDash([]);
    const room = function (id, x) {
      if (seen) {
        g.fillStyle = STONE;
        rrect(g, x, ay - rh / 2, rw, rh, s * 0.4); g.fill();
        g.strokeStyle = STONE_LN; g.lineWidth = 1;
        rrect(g, x + 0.5, ay - rh / 2 + 0.5, rw - 1, rh - 1, s * 0.4); g.stroke();
        /* broken-column marks */
        g.strokeStyle = 'rgba(255,255,255,.28)';
        g.beginPath();
        g.moveTo(x + rw * 0.3, ay - rh * 0.22); g.lineTo(x + rw * 0.3, ay + rh * 0.25);
        g.moveTo(x + rw * 0.7, ay - rh * 0.25); g.lineTo(x + rw * 0.7, ay + rh * 0.1);
        g.stroke();
      } else {
        g.fillStyle = FOG_FILL;
        rrect(g, x, ay - rh / 2, rw, rh, s * 0.4); g.fill();
        g.strokeStyle = FOG_EDGE; g.lineWidth = 1;
        g.setLineDash([3, 3]);
        rrect(g, x + 0.5, ay - rh / 2 + 0.5, rw - 1, rh - 1, s * 0.4); g.stroke();
        g.setLineDash([]);
      }
      if (id === cur) {
        g.strokeStyle = C.gold; g.lineWidth = 1.5;
        rrect(g, x + 0.75, ay - rh / 2 + 0.75, rw - 1.5, rh - 1.5, s * 0.4);
        g.stroke();
      }
    };
    room(wg.ruins[0], bx);
    room(wg.ruins[1], bx + rw + gap);
    if (seen) {
      g.font = 'italic 600 ' + Math.max(10, s * 1.55) + 'px Georgia,serif';
      g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.fillText(regionName(wg.ruins[0]), bx + rw + gap / 2 + 1, ay + rh / 2 + s * 0.6 + 1);
      g.fillStyle = LABEL_INK;
      g.fillText(regionName(wg.ruins[0]), bx + rw + gap / 2, ay + rh / 2 + s * 0.6);
    }
  }
  function drawPin(g, wg, X, Y, s) {
    let px = null, py = null;
    if (cur && /^field-/.test(cur)) {
      for (let gy = 0; gy < wg.rows; gy++)
        for (let gx = 0; gx < wg.cols; gx++)
          if (wg.ids[gy][gx] === cur) {
            let c = wg.mw / 2, r = wg.mh / 2;
            try {
              const W = window.WORLD, at = W && W.playerAt && W.playerAt();
              if (at && W._map && W._map.id === cur) { c = at.c + 0.5; r = at.r + 0.5; }
            } catch (e) {}
            px = X(gx * wg.sx + c); py = Y(gy * wg.sy + r);
          }
    } else if (cur) {                         /* in a ruin room           */
      const ay = Y(wg.anchor.y + 0.5);
      const rw = s * 3.2, gap = s * 0.35;
      const bx = X(-1.6) - rw * 2 - gap;
      const i = wg.ruins.indexOf(cur);
      if (i >= 0) { px = bx + rw * (i + 0.5) + (i > 0 ? gap : 0); py = ay; }
    }
    if (px === null) return;
    g.save();
    g.strokeStyle = 'rgba(255,197,66,.4)'; g.lineWidth = 2;
    g.beginPath(); g.arc(px, py, 8, 0, 7); g.stroke();
    g.restore();
    goldDot(g, px, py, 4);
  }

  /* ── current-map tracking ──────────────────────────────────────────── */
  function setCurrent(id) {
    if (!id || typeof id !== 'string') return;
    const known = visited.has(id);
    if (id === cur && known) return;          /* nothing changed          */
    cur = id;
    if (!known) { visited.add(id); saveVisited(); }
    ensureDom();
    draw();
    if (wmap && !wmap.hidden) paintMap();     /* keep an open chart true  */
  }
  function tick() {
    const W = window.WORLD;
    const id = W && W._map && W._map.id;
    if (id && id !== cur) setCurrent(id);
  }
  function init() {
    ensureDom();
    visited = loadVisited();                  /* re-read on explicit init */
    tick();                                   /* catch an already-loaded map */
    if (pollT) clearInterval(pollT);
    pollT = setInterval(tick, M.POLL_MS);
  }

  /* boot on load — minimap.js is only ever a world.html (explore) script;
     init() stays idempotent so glue may also call it */
  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);

  return { init: init, setCurrent: setCurrent, open: openMap, close: closeMap };
})();
