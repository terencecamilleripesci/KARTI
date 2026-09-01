'use strict';
/* minimap.js — window.MINIMAP (HUD_SPEC.md §5)
   "Which box you are on": a glanceable, display-only world map, fixed
   top-left. One small canvas, redrawn ONLY when the current map changes
   (no rAF, no per-frame work).

   Topology (maps/index.js): a 5x3 field grid plus two ruin rooms chained
   on as a separate wing — ruin-01 ─ ruin-02 ─connector─ field-0-0:

       [r1][r2]──[f00][f10][f20][f30][f40]
                 [f01][f11][f21][f31][f41]
                 [f02][f12][f22][f32][f42]

   Ruin cells are smaller (12px vs 16px), top-aligned with the grid's top
   row, and joined to field-0-0 by a visible 2px connector — honestly "a
   wing reached through a door", not a fake 6th grid column.

   States (fill + outline TOGETHER — meaning never rides on colour alone):
     current   filled --gold + 6px gold glow (the one lit box)
     visited   filled #2A2450 (panel-light)
     unvisited no fill, 1px outline rgba(255,255,255,.14)

   Behaviour: MINIMAP.init() builds the DOM, loads the visited set from
   localStorage (HUDT.KEYS.VISITED, a JSON array of map ids), then POLLS
   WORLD._map.id every HUDT.MMAP.POLL_MS — polling on purpose: the single
   WORLD.onExit callback slot belongs to world.html's glue and must not
   be stolen. MINIMAP.setCurrent(id) is the public/test path.

   Owns only: #mmap, #minimap-css. Reads HUDT + (optionally) MAP_INDEX +
   WORLD._map.id. Geometry/colours all from window.HUDT (the contract). */
window.MINIMAP = (function () {

  const HT = window.HUDT;
  if (!HT) {                                  /* contract file missing —  */
    return { init: function () {}, setCurrent: function () {} };
  }
  const M = HT.MMAP, C = HT.C;

  /* ── layout (CSS px inside the canvas; PAD margin all round) ────── */
  const BOX_W = M.W + M.PAD * 2;              /* 132 — glow room included */
  const BOX_H = M.H + M.PAD * 2;              /* 64                       */
  const STEP  = M.CELL + M.GAP;               /* 18px field-grid pitch    */
  const GRID_X = M.PAD + M.RUIN_CELL * 2 + M.GAP + M.RUIN_GAP; /* 38     */
  const RUIN2_X = M.PAD + M.RUIN_CELL + M.GAP;                 /* 20     */
  const UNVISITED_LINE = 'rgba(255,255,255,.14)';
  const VISITED_FILL = '#2A2450';

  /* map ids — prefer the real index, fall back to the naming scheme so a
     harness page without maps/ still draws the full topology */
  function fieldId(cx, ry) {
    const IX = window.MAP_INDEX;
    if (IX && IX.fieldGrid && IX.fieldGrid[ry] && IX.fieldGrid[ry][cx])
      return IX.fieldGrid[ry][cx];
    return 'field-' + cx + '-' + ry;
  }

  /* ── state ──────────────────────────────────────────────────────── */
  let visited = loadVisited();                /* Set of map ids           */
  let cur = null;                             /* current map id or null   */
  let box = null, cv = null, ctx = null, dpr = 1, pollT = null;

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

  /* ── DOM ────────────────────────────────────────────────────────── */
  const CSS = [
    '#mmap{position:fixed;',
    ' top:calc(8px + env(safe-area-inset-top,0px));',
    ' left:calc(8px + env(safe-area-inset-left,0px));',
    ' z-index:' + HT.Z.HUD + ';',
    ' width:' + BOX_W + 'px;height:' + BOX_H + 'px;',
    /* the 1px line is an inset shadow so the box stays exactly 132x64 */
    ' background:rgba(23,19,49,.88);',
    ' box-shadow:inset 0 0 0 1px ' + C.line + ';',
    ' border-radius:10px;overflow:hidden;',
    /* display-only chrome: never a tap target, never in the way */
    ' pointer-events:none;-webkit-user-select:none;user-select:none}',
    '#mmap canvas{display:block;width:' + BOX_W + 'px;height:' + BOX_H + 'px}'
  ].join('');

  function ensureDom() {
    if (box || !document.body) return;
    const st = document.createElement('style');
    st.id = 'minimap-css'; st.textContent = CSS;
    document.head.appendChild(st);
    box = document.createElement('div');
    box.id = 'mmap';
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', 'World map');
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv = document.createElement('canvas');
    cv.width = Math.round(BOX_W * dpr);       /* <= 264 x 128 at DPR 2    */
    cv.height = Math.round(BOX_H * dpr);
    cv.setAttribute('aria-hidden', 'true');
    box.appendChild(cv);
    document.body.appendChild(box);
    ctx = cv.getContext('2d');
    draw();
  }

  /* ── drawing (whole canvas, only ever on map change) ────────────── */
  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function cell(g, id, x, y, s) {
    const r = s < M.CELL ? 2.5 : 3;
    if (id === cur) {                         /* the one lit box          */
      g.save();
      g.shadowColor = C.gold;
      g.shadowBlur = 6 * dpr;                 /* blur ignores the scale   */
      g.fillStyle = C.gold;
      rrect(g, x, y, s, s, r); g.fill();
      g.restore();
    } else if (visited.has(id)) {
      g.fillStyle = VISITED_FILL;
      rrect(g, x, y, s, s, r); g.fill();
    } else {
      g.strokeStyle = UNVISITED_LINE;
      g.lineWidth = 1;
      rrect(g, x + 0.5, y + 0.5, s - 1, s - 1, r); g.stroke();
    }
  }
  function draw() {
    if (!ctx) return;
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, BOX_W, BOX_H);
    /* the connector first, so the door line sits under its two rooms */
    g.fillStyle = C.line;
    g.fillRect(GRID_X - M.RUIN_GAP, M.PAD + M.RUIN_CELL / 2 - 1, M.RUIN_GAP, 2);
    /* the ruin wing — smaller, top-aligned with the grid's top row */
    cell(g, 'ruin-01', M.PAD, M.PAD, M.RUIN_CELL);
    cell(g, 'ruin-02', RUIN2_X, M.PAD, M.RUIN_CELL);
    /* the 5x3 field grid */
    for (let ry = 0; ry < M.GRID_H; ry++)
      for (let cx = 0; cx < M.GRID_W; cx++)
        cell(g, fieldId(cx, ry), GRID_X + cx * STEP, M.PAD + ry * STEP, M.CELL);
    if (box)
      box.setAttribute('aria-label', cur
        ? 'World map — you are in ' + HT.mapLabel(cur)
        : 'World map');
  }

  /* ── current-map tracking ───────────────────────────────────────── */
  function setCurrent(id) {
    if (!id || typeof id !== 'string') return;
    const known = visited.has(id);
    if (id === cur && known) return;          /* nothing changed          */
    cur = id;
    if (!known) { visited.add(id); saveVisited(); }
    ensureDom();
    draw();
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

  return { init: init, setCurrent: setCurrent };
})();
