/* ═══════════════════════════════════════════════════════════════════
   WORLD-TYPES — window.WT, the shared vocabulary of the explore layer.

   Everything here is defined ONCE, per WORLD_SPEC.md. world.js, quest.js,
   panels.js and every maps/<id>.js use these — never a local copy. Pure
   constants and pure functions only: no DOM at load time, no state.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const WT = (() => {

  /* ── geometry: the SCREEN RECTANGLE, defined once in grid.js ──────
     A map is no longer a w x h rectangle of tiles (which always
     projects to a diamond covering a third of a phone held sideways).
     It is a rectangle ON SCREEN made of staggered cells — grid.js
     explains the whole change. Coordinates are unchanged: still (c,r),
     still isoX/isoY, still eight step deltas. What changed is which
     (c,r) exist. The cells of the square bounding box that fall
     outside the rectangle are VOID: ground 0, block 1, drawn by
     nobody, walked by nobody. */
  const G = (typeof GRID !== 'undefined') ? GRID
          : (typeof require === 'function' ? require('./grid.js') : null);

  const TW = G.TW, TH = G.TH;        /* on-board tile size (tactics.js)  */

  /* ── the atlas: art/world.png, 1024x512 ─────────────────────────── */
  const TILE_PX    = 128;            /* square atlas cell                */
  const ATLAS_COLS = 8;              /* index = row*8 + col; 0 reserved  */
  const ATLAS_SRC  = 'art/world.png';
  const FOOT_W = 124, FOOT_H = 92;   /* ground diamond inside the cell:  */
  const FOOT_TOP = TILE_PX - FOOT_H; /* x in [2,126], y in [36,128]      */
  const SCALE = TW / FOOT_W;         /* 0.5 — cell px -> board px        */

  /* ── movement ───────────────────────────────────────────────────── */
  const WALK_MS = 160;               /* per orthogonal tile              */
  const DIAG_MS = 226;               /* per diagonal tile (~160·√2)      */

  /* ── sprites (match tactics.js exactly) ─────────────────────────── */
  const SPR_SCALE = 0.30;            /* SPRITE.draw scale                */
  const FOOT_Y = 3;                  /* feet sink: draw at tileY + 3     */

  const LAYERS = ['ground', 'decor', 'block'];

  /* named atlas indices — use these, not raw numbers */
  const TILES = {
    EMPTY: 0,
    /* rows 0-1: the ruin set */
    RUIN_FLOOR: 1, RUIN_FLOOR2: 2, RUIN_CRACK: 3, RUIN_RUG: 4, RUIN_RUBBLEFLR: 5,
    RUIN_WALL: 8, RUIN_WALLCRK: 9, RUIN_PILLAR: 10, RUIN_ARCH: 11,
    RUIN_BRAZIER: 12, RUIN_CRATE: 13, RUIN_BARREL: 14, RUIN_RUBBLE: 15,
    /* rows 2-3: the outdoor set */
    GRASS: 16, GRASS2: 17, GRASS_FLOWER: 18, DIRT: 19, PATH_STONE: 20,
    WATER: 21, CLIFF: 22, BRIDGE: 23,
    TREE: 24, BUSH: 25, ROCK: 26, FENCE: 27, SIGNPOST: 28,
    STUMP: 29, FLOWERS_TALL: 30, PORTAL_GLOW: 31
  };

  /* the eight step deltas, and the opposite of each edge */
  const DIRS8 = [
    { dc: 1, dr: 0 }, { dc: -1, dr: 0 }, { dc: 0, dr: 1 }, { dc: 0, dr: -1 },
    { dc: 1, dr: 1 }, { dc: 1, dr: -1 }, { dc: -1, dr: 1 }, { dc: -1, dr: -1 }
  ];
  const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };

  /* ── map ids ────────────────────────────────────────────────────── */
  function fieldId(gx, gy){ return 'field-' + gx + '-' + gy; }
  function parseFieldId(id){
    const m = /^field-(-?\d+)-(-?\d+)$/.exec(id || '');
    return m ? { gx: +m[1], gy: +m[2] } : null;
  }

  /* ── board space (NO origin, NO camera — camera is a transform) ─── */
  function isoX(c, r){ return (c - r) * (TW / 2); }
  function isoY(c, r){ return (c + r) * (TH / 2); }
  function boardToTile(bx, by){
    const dx = bx / (TW / 2), dy = by / (TH / 2);
    return { c: Math.round((dy + dx) / 2), r: Math.round((dy - dx) / 2) };
  }

  /* ── atlas drawing ──────────────────────────────────────────────── */
  function atlasRect(i){
    return { sx: (i % ATLAS_COLS) * TILE_PX,
             sy: Math.floor(i / ATLAS_COLS) * TILE_PX,
             sw: TILE_PX, sh: TILE_PX };
  }
  /* (x,y) = tile centre in board space (isoX/isoY). The cell's bottom-
     centre lands on the diamond's BOTTOM vertex, so the footprint maps
     onto the board diamond and tall art rises above it.

     THE ART WAS DRAWN FOR A 1.35:1 DIAMOND AND THE GRID IS 2:1 NOW, so
     the two no longer agree by construction and something has to give
     until the tiles are redrawn (they are procedural — tools/mkatlas.py —
     so that is a regeneration, not a repaint, and it is queued behind the
     visual pass the owner wants anyway).

     Until then the two layers are treated differently, because they fail
     differently:
       GROUND is squashed to the exact 2:1 footprint. A floor tile that
       does not match the cell is a floor with seams and overlaps in it —
       misalignment is the one thing a floor cannot survive, and a
       squashed pebble is still a pebble.
       DECOR keeps its proportions (uniform scale, base on the same
       bottom vertex). A tree squashed by a third reads as a broken
       drawing rather than a shorter tree, and props are allowed to
       overhang their cell — they always did. */
  function drawTile(g, img, i, x, y, tall){
    if (!i) return;                          /* 0 = empty, draws nothing */
    const a = atlasRect(i);
    const kx = TW / FOOT_W;                  /* across: always exact      */
    const ky = tall ? kx : (TH / FOOT_H);    /* down: exact for the floor */
    g.imageSmoothingEnabled = false;
    g.drawImage(img, a.sx, a.sy, a.sw, a.sh,
      x - (TILE_PX / 2) * kx, y + TH / 2 - TILE_PX * ky,
      TILE_PX * kx, TILE_PX * ky);
  }

  /* ── walkability ──────────────────────────────────────────────────
     inMap is now the REGION test, not the array-bounds test. A cell
     inside the array but outside the screen rectangle is void: it is
     not part of the map, so nothing may stand on it, walk through it
     or be picked on it. Everything downstream (isWalkable, canStep,
     A*, the flood fills in the checkers) inherits that for free. */
  function inMap(map, c, r){
    return c >= 0 && r >= 0 && c < map.w && r < map.h && G.has(c, r);
  }
  function tileAt(map, layer, c, r){ return inMap(map, c, r) ? map[layer][r][c] : 0; }
  function isWalkable(map, c, r){ return inMap(map, c, r) && map.block[r][c] === 0; }
  /* a diagonal may not cut a corner: both flanking orthogonals must be open */
  function canStep(map, c, r, dc, dr){
    if (!isWalkable(map, c + dc, r + dr)) return false;
    if (dc && dr)
      return isWalkable(map, c + dc, r) && isWalkable(map, c, r + dr);
    return true;
  }

  /* WHICH DECLARED-NEIGHBOUR EDGE IS THIS TILE ON? Order n,e,s,w — fixed,
     because a corner cell sits on two and the caller must get the same
     answer every time.

     Screens OVERLAP BY ONE LINE, exactly as they always have: the map's
     east column IS the neighbour's west column, the same strip of world
     drawn twice. So a tile transfers only if that shared line reaches
     the neighbour — G.twin says whether it does. On a staggered grid the
     odd rows are half a tile short of the rectangle's side (the notch
     Dofus leaves too), so their outermost cells are the map's own and do
     not transfer; the outermost EVEN column is the seam. The player walks
     into it without ever knowing which of the two he is on. */
  function edgeDir(map, c, r){
    const nb = map.neighbours || {};
    for (const d of ['n', 'e', 's', 'w'])
      if (nb[d] && G.edgeSide(c, r, d) && G.twin(c, r, d)) return d;
    return null;
  }
  /* where an edge transfer lands in the neighbour: the SAME world cell,
     seen from the other screen. Every map is the same shape, so nmap is
     no longer needed — kept in the signature so callers do not change. */
  function edgeTarget(dir, c, r, nmap){
    return G.twin(c, r, dir);
  }

  function markerAt(map, c, r){
    const ms = map.markers || [];
    for (let i = 0; i < ms.length; i++)
      if (ms[i].c === c && ms[i].r === r) return ms[i];
    return null;
  }

  /* ── the seam invariant, as a runnable check (verifier uses this) ─ */
  function seamErrors(A, B, dir){
    const errs = [];
    if (!A || !B) return ['missing map object'];
    if ((A.neighbours || {})[dir] !== B.id)
      errs.push(A.id + '.neighbours.' + dir + ' !== ' + B.id);
    if ((B.neighbours || {})[OPP[dir]] !== A.id)
      errs.push(B.id + '.neighbours.' + OPP[dir] + ' !== ' + A.id + ' (not reciprocal)');
    if (A.w !== B.w || A.h !== B.h)
      errs.push(A.id + '/' + B.id + ' size mismatch across ' + dir + ' seam');
    else {
      /* THE SHARED LINE, cell by cell: every cell of A's `dir` edge that
         also exists in B is the same cell of the world, so all three
         layers must agree on it. G.twin is the only thing that knows
         which those are — on a staggered grid an east seam shares its
         even rows and notches past the odd ones. */
      let open = false, shared = 0;
      for (const cell of G.edgeCells(dir)){
        const t = G.twin(cell.c, cell.r, dir);
        if (!t) continue;                      /* the notch: A's own cell */
        shared++;
        for (const L of LAYERS)
          if (A[L][cell.r][cell.c] !== B[L][t.r][t.c])
            errs.push(dir + ' seam ' + L + ' mismatch at u' + cell.u + ' v' + cell.v +
                      ': ' + A.id + '=' + A[L][cell.r][cell.c] +
                      ' ' + B.id + '=' + B[L][t.r][t.c]);
        if (A.block[cell.r][cell.c] === 0) open = true;
      }
      if (!shared) errs.push(dir + ' seam ' + A.id + '/' + B.id + ' shares no cell');
      if (!open) errs.push(dir + ' seam ' + A.id + '/' + B.id + ' has no walkable tile');
    }
    return errs;
  }

  /* ── the player object — the single shape everyone shares ─────────
     NO CURRENCY FIELD, deliberately. This game ships INSIDE KARTI, which
     already owns the only wallet the player has. A second currency here
     would either become a fake number that buys nothing, or — worse — a
     parallel economy that has to be reconciled with the real one at
     integration time. Anything purchasable is priced in KARTI's coins,
     read through KARTI's own API when this is embedded. */
  function makePlayer(){
    return { name: 'Hero', level: 1, xp: 0,
             hp: 100, hpMax: 100, ap: 6, mp: 3, items: [] };
  }

  return { GRID: G, TW, TH, TILE_PX, ATLAS_COLS, ATLAS_SRC, FOOT_W, FOOT_H, FOOT_TOP,
           SCALE, WALK_MS, DIAG_MS, SPR_SCALE, FOOT_Y, LAYERS, TILES, DIRS8, OPP,
           fieldId, parseFieldId, isoX, isoY, boardToTile, atlasRect, drawTile,
           inMap, tileAt, isWalkable, canStep, edgeDir, edgeTarget, markerAt,
           seamErrors, makePlayer };
})();

if (typeof window !== 'undefined') window.WT = WT;
