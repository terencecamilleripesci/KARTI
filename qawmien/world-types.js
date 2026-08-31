/* ═══════════════════════════════════════════════════════════════════
   WORLD-TYPES — window.WT, the shared vocabulary of the explore layer.

   Everything here is defined ONCE, per WORLD_SPEC.md. world.js, quest.js,
   panels.js and every maps/<id>.js use these — never a local copy. Pure
   constants and pure functions only: no DOM at load time, no state.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const WT = (() => {

  /* ── geometry: copied from combat, the same diamond ─────────────── */
  const TW = 62, TH = 46;            /* on-board tile size (tactics.js)  */

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
     centre lands on the diamond's BOTTOM vertex, so the 124x92 footprint
     maps exactly onto the 62x46 board diamond and tall art rises above. */
  function drawTile(g, img, i, x, y){
    if (!i) return;                          /* 0 = empty, draws nothing */
    const a = atlasRect(i), k = SCALE;
    g.imageSmoothingEnabled = false;
    g.drawImage(img, a.sx, a.sy, a.sw, a.sh,
      x - (TILE_PX / 2) * k, y + TH / 2 - TILE_PX * k,
      TILE_PX * k, TILE_PX * k);
  }

  /* ── walkability ────────────────────────────────────────────────── */
  function inMap(map, c, r){ return c >= 0 && r >= 0 && c < map.w && r < map.h; }
  function tileAt(map, layer, c, r){ return inMap(map, c, r) ? map[layer][r][c] : 0; }
  function isWalkable(map, c, r){ return inMap(map, c, r) && map.block[r][c] === 0; }
  /* a diagonal may not cut a corner: both flanking orthogonals must be open */
  function canStep(map, c, r, dc, dr){
    if (!isWalkable(map, c + dc, r + dr)) return false;
    if (dc && dr)
      return isWalkable(map, c + dc, r) && isWalkable(map, c, r + dr);
    return true;
  }

  /* which declared-neighbour edge is this tile on? order n,e,s,w — fixed */
  function edgeDir(map, c, r){
    const nb = map.neighbours || {};
    if (r === 0 && nb.n) return 'n';
    if (c === map.w - 1 && nb.e) return 'e';
    if (r === map.h - 1 && nb.s) return 's';
    if (c === 0 && nb.w) return 'w';
    return null;
  }
  /* where an edge transfer lands in neighbour map `nmap` */
  function edgeTarget(dir, c, r, nmap){
    if (dir === 'e') return { c: 0, r: r };
    if (dir === 'w') return { c: nmap.w - 1, r: r };
    if (dir === 'n') return { c: c, r: nmap.h - 1 };
    return { c: c, r: 0 };                                        /* 's' */
  }

  function markerAt(map, c, r){
    const ms = map.markers || [];
    for (let i = 0; i < ms.length; i++)
      if (ms[i].c === c && ms[i].r === r) return ms[i];
    return null;
  }

  /* ── the seam invariant, as a runnable check (verifier uses this) ─ */
  function seamErrors(A, B, dir){
    const errs = [], along = (dir === 'e' || dir === 'w');
    if (!A || !B) return ['missing map object'];
    if ((A.neighbours || {})[dir] !== B.id)
      errs.push(A.id + '.neighbours.' + dir + ' !== ' + B.id);
    if ((B.neighbours || {})[OPP[dir]] !== A.id)
      errs.push(B.id + '.neighbours.' + OPP[dir] + ' !== ' + A.id + ' (not reciprocal)');
    if (along ? A.h !== B.h : A.w !== B.w)
      errs.push(A.id + '/' + B.id + ' size mismatch across ' + dir + ' seam');
    else {
      const n = along ? A.h : A.w;
      let open = false;
      for (let i = 0; i < n; i++){
        /* the two coordinates that face each other across the seam */
        const ac = dir === 'e' ? A.w - 1 : dir === 'w' ? 0 : i;
        const ar = dir === 's' ? A.h - 1 : dir === 'n' ? 0 : i;
        const bc = dir === 'e' ? 0 : dir === 'w' ? B.w - 1 : i;
        const br = dir === 's' ? 0 : dir === 'n' ? B.h - 1 : i;
        for (const L of LAYERS)
          if (A[L][ar][ac] !== B[L][br][bc])
            errs.push(dir + ' seam ' + L + ' mismatch at index ' + i +
                      ': ' + A.id + '=' + A[L][ar][ac] + ' ' + B.id + '=' + B[L][br][bc]);
        if (A.block[ar][ac] === 0) open = true;
      }
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

  return { TW, TH, TILE_PX, ATLAS_COLS, ATLAS_SRC, FOOT_W, FOOT_H, FOOT_TOP,
           SCALE, WALK_MS, DIAG_MS, SPR_SCALE, FOOT_Y, LAYERS, TILES, DIRS8, OPP,
           fieldId, parseFieldId, isoX, isoY, boardToTile, atlasRect, drawTile,
           inMap, tileAt, isWalkable, canStep, edgeDir, edgeTarget, markerAt,
           seamErrors, makePlayer };
})();

if (typeof window !== 'undefined') window.WT = WT;
