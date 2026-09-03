/* ═══════════════════════════════════════════════════════════════════
   GRID — the shape of a screen, shared by the world and by combat.

   THE MISTAKE THIS FILE CORRECTS. A map used to be a w x h rectangle of
   tiles. Project that isometrically and you always get a DIAMOND, and the
   diamond's aspect is fixed at TW:TH — 62:46 — whatever the tile count is.
   A diamond of aspect 1.35 inside a 2.2:1 phone held sideways covers at
   most a third of it, so two thirds of the screen could never be walked
   on. More tiles did not help; 14x14 measured the identical fraction.
   The owner reported it three times, in three different words, and each
   time it was answered with paint. It was never a painting problem.

   WHAT DOFUS ACTUALLY DOES, which is not what we assumed. Its grid is not
   one big diamond — it is a RECTANGLE of small diamonds, staggered row by
   row like brickwork, running to all four corners of the map area. The
   cells in the corners are real cells. The outer ones are usually blocked
   scenery, which is why it reads as "the world continues past the frame",
   but the playfield itself is the whole screen. That is the entire trick.

        even row   ◇ ◇ ◇ ◇ ◇ ◇ ◇     13 cells   u even
        odd row     ◇ ◇ ◇ ◇ ◇ ◇      12 cells   u odd      <- half-offset
        even row   ◇ ◇ ◇ ◇ ◇ ◇ ◇                <- fills a RECTANGLE

   THE COORDINATES DO NOT CHANGE, and that is the point of doing it this
   way. Every rule in the game — A*, the eight step deltas, Manhattan
   range, line of sight, painter's-algorithm draw order — keeps working in
   (c,r) exactly as before. All that changes is WHICH (c,r) are on the map:
   instead of a rectangle in tile space it is now a rectangle in SCREEN
   space. Two derived axes say it:

        u = c - r     half-tiles across   (screen x = u * TW/2)
        v = c + r     half-tiles down     (screen y = v * TH/2)

   so a screen-rectangle is simply a range on u and a range on v. Cells are
   still stored in a square (c,r) array — the bounding box — and the cells
   of that box which fall outside the rectangle are VOID: never drawn,
   never walkable, never picked. They cost memory and nothing else.

   ONE SIZE FOR EVERY MAP, as before ("the map always same size like
   dofus"): the camera is static, a map is framed whole, and walking off an
   edge swaps screens. C and V are chosen so the rectangle is 806x368 board
   pixels — 2.19:1, which is a phone held sideways almost exactly.

   V IS ODD ON PURPOSE. Screens overlap by one line, so the vertical stride
   is V-1, and the shared line only lands on the same parity of row in both
   screens if V-1 is even. V=16 would tear every north/south seam.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const GRID = (() => {

  /* ── the one tile, unchanged from combat so every sprite still fits ── */
  const TW = 62, TH = 46;

  /* ── the one screen ─────────────────────────────────────────────── */
  /* WHY 15 x 13 AND NOT 13 x 15. The first cut was 806x368 — 2.19:1, the
     shape of a phone held sideways — and it still left a strip of scenery
     down the left and right that the player could see and not walk on.
     The reason is the BAR: it takes 74px off the height, so the box the
     map is framed into is about 2.67:1, not 2.19, and a 2.19 rectangle
     inside it is bound by height and stops short of the sides.

     So the rectangle is made WIDER THAN ANY PHONE — 930x322, 2.89:1 —
     which means it is always bound by width and always reaches the left
     and right edges. What is left over goes top and bottom, where the
     surround covers it. Measured across three landscape phones:

        851x319   fills 100% of the width, 57px tile
        740x286   fills 100% of the width, 49px tile
        667x301   fills 100% of the width, 44px tile   <- the floor

     44px is a fingertip, so C cannot usefully grow past this: 17x15 gave
     248 cells but a 39px tile on the smallest phone. 189 cells is also
     what 13x15 held, so nothing was lost to buy the full width. */
  const C = 15;                 /* cells on an even row (odd rows: C-1)  */
  const V = 13;                 /* rows of half-tile height; MUST be odd */

  const UMAX = C - 1;           /* 12 — outermost column, even rows      */
  const OFF  = UMAX / 2;        /* 6  — shift that keeps c,r >= 0        */
  const N     = (UMAX + V - 1) / 2 + OFF + 1;   /* 20 — bbox side        */

  /* stride between neighbouring screens: they SHARE their edge line, so
     east is 2*(C-1) half-tiles across and south is V-1 rows down. */
  const DU = 2 * (C - 1);       /* 24 */
  const DV = V - 1;             /* 14 */

  /* ── (c,r) <-> (u,v). The OFF cancels out of u, which is why the array
     can be shifted into positive indices for free. ─────────────────── */
  function u_of(c, r){ return c - r; }
  function v_of(c, r){ return c + r - 2 * OFF; }
  function cOf(u, v){ return (u + v) / 2 + OFF; }
  function rOf(u, v){ return (v - u) / 2 + OFF; }

  /* how far out row v reaches. Parity needs no test: u+v = 2c-2*OFF is
     always even, so u and v always share parity by construction. */
  function span(v){ return UMAX - (v & 1); }

  /* ── membership ─────────────────────────────────────────────────── */
  function has(c, r){
    if (c < 0 || r < 0 || c >= N || r >= N) return false;
    const v = v_of(c, r);
    if (v < 0 || v >= V) return false;
    return Math.abs(u_of(c, r)) <= span(v);
  }

  /* every cell of the screen, in draw order (back to front = by v) */
  const CELLS = (() => {
    const out = [];
    for (let v = 0; v < V; v++)
      for (let u = -span(v); u <= span(v); u += 2)
        out.push({ c: cOf(u, v), r: rOf(u, v), u: u, v: v });
    return out;
  })();

  /* ── the rectangle, in the board pixels world.js/tactics.js already use
     (x = (c-r)*TW/2, y = (c+r)*TH/2). Half a tile of bleed on each side,
     because a cell centre sits half a diamond in from the edge. ────── */
  const RECT = {
    x: -C * TW / 2,                       /* -403 */
    y: OFF * TH - TH / 2,                 /*  253 */
    w: C * TW,                            /*  806 */
    h: (V - 1) * TH / 2 + TH              /*  368 */
  };
  RECT.cx = RECT.x + RECT.w / 2;          /*    0 */
  RECT.cy = RECT.y + RECT.h / 2;          /*  437 */

  /* ── edges ───────────────────────────────────────────────────────
     Which side of the SCREEN a cell sits on — 'n','e','s','w' or null.
     A cell can be on two (the corners), so this returns the first in a
     fixed order, matching the old edgeDir contract. */
  function edgeOf(c, r){
    for (const d of ['n', 'e', 's', 'w']) if (edgeSide(c, r, d)) return d;
    return null;
  }
  /* is this cell on THAT side? A corner is on two, so the question has to
     be askable one side at a time as well. */
  function edgeSide(c, r, dir){
    if (!has(c, r)) return false;
    const u = u_of(c, r), v = v_of(c, r);
    if (dir === 'n') return v === 0;
    if (dir === 's') return v === V - 1;
    if (dir === 'e') return u === span(v);
    if (dir === 'w') return u === -span(v);
    return false;
  }

  /* A STEP THAT LEAVES THE SCREEN — which neighbour it lands in, and
     where. Walking east off the u=+12 column arrives one step INSIDE the
     next screen (its u=-11 column) because the two screens share the
     column you just left; that is what makes the lattice continuous
     across a seam instead of dead-ending on it.
     Returns null when the step leaves the screen diagonally at a corner
     — there is no map to hand it to, so it is simply not a legal step. */
  function exitOf(c, r){
    if (has(c, r)) return null;
    const u = u_of(c, r), v = v_of(c, r);
    let dir = null;
    if (v < 0)            dir = 'n';
    else if (v >= V)      dir = 's';
    else if (u >  span(v)) dir = 'e';
    else if (u < -span(v)) dir = 'w';
    if (!dir) return null;
    const du = dir === 'e' ? DU : dir === 'w' ? -DU : 0;
    const dv = dir === 's' ? DV : dir === 'n' ? -DV : 0;
    const nu = u - du, nv = v - dv;
    const nc = cOf(nu, nv), nr = rOf(nu, nv);
    return has(nc, nr) ? { dir: dir, c: nc, r: nr } : null;
  }

  /* the cells along one edge, in a stable order — seam checking */
  function edgeCells(dir){
    return CELLS.filter(x => {
      if (dir === 'n') return x.v === 0;
      if (dir === 's') return x.v === V - 1;
      if (dir === 'e') return x.u === span(x.v);
      return x.u === -span(x.v);
    });
  }

  /* the same strip of world seen from the neighbour: the cell in screen
     `dir` that IS this cell. Only the shared line has one. */
  function twin(c, r, dir){
    const du = dir === 'e' ? DU : dir === 'w' ? -DU : 0;
    const dv = dir === 's' ? DV : dir === 'n' ? -DV : 0;
    const nc = cOf(u_of(c, r) - du, v_of(c, r) - dv);
    const nr = rOf(u_of(c, r) - du, v_of(c, r) - dv);
    return has(nc, nr) ? { c: nc, r: nr } : null;
  }

  /* an empty bbox array, VOID everywhere (fill = what a void cell holds) */
  function blank(fill){
    const g = [];
    for (let r = 0; r < N; r++) g.push(new Array(N).fill(fill));
    return g;
  }

  return { TW, TH, C, V, N, UMAX, OFF, DU, DV, CELLS, RECT,
           u_of, v_of, cOf, rOf, span, has, edgeOf, edgeSide, exitOf,
           edgeCells, twin, blank,
           W: N, H: N, COUNT: CELLS.length };
})();

if (typeof window !== 'undefined') window.GRID = GRID;
if (typeof module !== 'undefined' && module.exports) module.exports = GRID;
