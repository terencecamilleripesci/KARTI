/* ═══════════════════════════════════════════════════════════════════
   SPRITE — frame animation, the simple road.

   No bones, no rigging, no placement. A sheet is a grid of cells; an
   animation is a row of that grid; playing it is swapping which cell you
   draw. That is the whole engine, and it is why sprites ship faster.

   WHAT YOU GIVE UP, said plainly so nobody is surprised later: a frame is
   BAKED. Gear cannot be swapped onto a sprite the way it can onto a bone,
   so a character wearing different armour is a different sheet. That is
   exactly why Dofus is skeletal — and exactly why, if your characters
   have a fixed look, none of that complexity is worth paying for.

   THE SHEET CONTRACT — deliberately dull, so any source can meet it:
     · a grid of equal cells, `cols` across
     · one ROW per animation, frames left to right
     · the character centred in its cell, standing on the cell's bottom
   Generated art, a bought pack and PixelLab output all fit this.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const SPRITE = (() => {

/* rows of the sheet, in order, and how each behaves */
const CLIPS = {
  idle:   { row:0, frames:4, fps:6,  loop:true  },
  walk:   { row:1, frames:6, fps:8,  loop:true  },
  attack: { row:2, frames:5, fps:12, loop:false },
  hit:    { row:3, frames:2, fps:10, loop:false, from:0 },
  die:    { row:3, frames:4, fps:8,  loop:false, from:2, hold:true }
};

/* ── FOUR FACINGS FROM TWO DRAWINGS ────────────────────────────────
   An isometric board has four directions of travel, and they are the
   DIAGONALS of the screen, not up/down/left/right. The saving is that
   they pair off as mirror images: walking down-right and down-left are
   the same drawing flipped, and so are the two away from the camera.
   So a character needs TWO drawn angles — one coming toward you, one
   going away — and the other two are free.

   This is the same economy Dofus works on: rig it once at authoring
   time, bake the frames, and let the runtime do nothing but pick a cell
   and maybe flip it.

     SE = toward the viewer, to the right   front, no flip
     SW = toward the viewer, to the left    front, flipped
     NE = away from the viewer, to the right back,  no flip
     NW = away from the viewer, to the left  back,  flipped               */
/* ── EIGHT FACINGS FROM FIVE DRAWINGS ──────────────────────────────
   The board's own axes give four directions; adding the diagonals gives
   eight. The saving is that a figure and its mirror image are the same
   drawing, so only the RIGHT-hand half has to exist:

     drawn : S (front)  SE  E (profile)  NE  N (back)
     free  : SW = SE flipped, W = E flipped, NW = NE flipped

   `row` is the row of the 5-row walk sheet, `flip` whether to mirror it.
   Five drawings, eight facings, one walk cycle authored once. */
/* FOUR DRAWN ANGLES, NOT FIVE — decided by what the art tool can actually
   produce. A 5-row sheet means 204px cells, and every 5-row sheet came back
   with the creature drawn ~256px tall, overflowing into its neighbour: 30
   of 30 cells failed the check. The 4-row / 256px format has passed every
   time. So: S, SE, E and NE are drawn, their mirrors give SW, W and NW, and
   N borrows the back-diagonal. Seven true angles and one near-miss beats
   eight broken ones, and the shortcut is here in the open rather than
   discovered later as a bug. */
const DIR = {
  S : { row:0, flip:false }, SE: { row:1, flip:false },
  E : { row:2, flip:false }, NE: { row:3, flip:false },
  N : { row:3, flip:false },
  SW: { row:1, flip:true  }, W : { row:2, flip:true  },
  NW: { row:3, flip:true  }
};
/* the older two-angle sheet still answers "am I showing his back?" */
const BACKS = { N:true, NE:true, NW:true };

/* WHICH OF THE EIGHT IS A GRID DELTA?
   Screen x is (c - r) and screen y is (c + r), so a grid step maps to a
   SCREEN direction, and that is what the art has to match — a unit moving
   +c is heading down-right on screen, not "east". */
function dirOf(dc, dr){
  if (!dc && !dr) return null;
  const x = dc - dr, y = dc + dr;          /* into screen space */
  const ang = Math.atan2(y, x) * 180 / Math.PI;   /* 0 = right, 90 = down */
  const oct = ((Math.round(ang / 45) % 8) + 8) % 8;
  return ['E','SE','S','SW','W','NW','N','NE'][oct];
}

/* the 5-row walk sheet: one clip per drawn angle */
/* a DRAWN idle, one clip per angle — a standing pose that breathes,
   rather than a walk frame held still. Four frames, slow. */
const CLIPS_IDLE = {
  'idle.0': { row:0, frames:4, fps:4, loop:true },
  'idle.1': { row:1, frames:4, fps:4, loop:true },
  'idle.2': { row:2, frames:4, fps:4, loop:true },
  'idle.3': { row:3, frames:4, fps:4, loop:true }
};

const CLIPS_DIR = {
  /* 8fps, not 10 — matched to the slower 210ms tile so the legs land
     roughly with the steps instead of racing ahead of them */
  'walk.0': { row:0, frames:6, fps:8, loop:true },
  'walk.1': { row:1, frames:6, fps:8, loop:true },
  'walk.2': { row:2, frames:6, fps:8, loop:true },
  'walk.3': { row:3, frames:6, fps:8, loop:true }
};


/* ── WHICH FRAME HAS BOTH FEET ON THE GROUND ───────────────────────
   Holding frame 0 of a walk cycle as a standing pose is what made every
   character look like it was hovering: in a walk, frame 0 is a CONTACT
   pose with one foot in the air. A standing figure needs both feet down.

   Rather than hand-pick a frame per sheet — which would be wrong the
   moment any sheet is regenerated — measure it. Count the opaque pixels
   in the bottom sliver of each cell: the frame with the MOST material
   touching the ground line is the one standing on two feet. It is a
   cheap, one-off scan at load, and it is right for art nobody has seen
   yet. */
function standingFrames(im, cols, rows, cw, ch){
  const out = [];
  try {
    const cv = document.createElement('canvas');
    cv.width = im.width; cv.height = im.height;
    const g = cv.getContext('2d', { willReadFrequently:true });
    g.drawImage(im, 0, 0);
    const band = Math.max(4, Math.round(ch * 0.10));   /* the feet zone */
    for (let r = 0; r < rows; r++){
      let best = 0, bestN = -1;
      for (let c = 0; c < cols; c++){
        const d = g.getImageData(c*cw, r*ch + ch - band, cw, band).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 60) n++;
        if (n > bestN){ bestN = n; best = c; }
      }
      out.push(best);
    }
  } catch (e){ /* a tainted canvas just means we fall back to frame 0 */ }
  return out;
}

function make(src, opts){
  opts = opts || {};
  const s = {
    img: null, ready: false,
    cols: opts.cols || 6, rows: opts.rows || 4,
    cw: 0, ch: 0,
    clips: opts.clips || CLIPS,
    clip: 'idle', t: 0, frame: 0, done: false
  };
  const im = new Image();
  im.onload = () => {
    s.img = im;
    /* the cell size is DERIVED, never hard-coded — swap in a bigger sheet
       and nothing else has to change */
    s.cw = Math.floor(im.width / s.cols);
    s.ch = Math.floor(im.height / s.rows);
    s.stand = standingFrames(im, s.cols, s.rows, s.cw, s.ch);
    s.ready = true;
    if (opts.onready) opts.onready(s);
  };
  im.onerror = () => { if (opts.onerror) opts.onerror(); };
  im.src = src;
  return s;
}

/* A second actor on the SAME sheet. The image is loaded once and shared;
   only the playhead is per-unit. Four units on screen must not mean four
   downloads of the same picture, and they must not share a frame counter
   either — one walking while another swings is the normal case. */
function spawn(sheet, extra){
  const s = Object.create(sheet);
  s.clip = 'idle'; s.t = 0; s.frame = 0; s.done = false;
  if (extra) for (const k in extra) s[k] = extra[k];
  return s;
}

function play(s, name, restart){
  if (!s.clips[name]) return;
  if (s.clip === name && !restart) return;
  s.clip = name; s.t = 0; s.frame = 0; s.done = false;
}

function step(s, dt){
  const c = s.clips[s.clip];
  if (!c || s.done) return;
  s.t += dt;
  const n = Math.floor(s.t / (1000 / c.fps));
  if (c.loop){
    s.frame = n % c.frames;
  } else if (n >= c.frames - 1){
    s.frame = c.frames - 1;
    /* `hold` freezes on the last frame (death); everything else reports
       done so the caller can drop back to idle */
    s.done = true;
  } else {
    s.frame = n;
  }
}

/* draw the current frame with its FEET at (x,y) — the same contract the
   rig used, so a sprite and a rigged character are interchangeable to
   whatever is drawing the board */
function draw(g, s, x, y, scale, flip){
  if (!s.ready) return false;
  const c = s.clips[s.clip];
  /* returning false here is what lets the caller fall back to another
     sheet instead of drawing an empty tile — a clip name that does not
     exist on this sheet is a bug, not an empty frame */
  if (!c) return false;
  const col = (c.from || 0) + s.frame;
  const sx = col * s.cw, sy = c.row * s.ch;
  const k = scale || 1;
  const w = s.cw * k, h = s.ch * k;
  g.save();
  g.translate(x, y);
  if (flip) g.scale(-1, 1);
  /* pixel art must NOT be smoothed — the whole look is hard edges */
  g.imageSmoothingEnabled = false;
  g.drawImage(s.img, sx, sy, s.cw, s.ch, -w / 2, -h, w, h);
  g.restore();
  return true;
}

return { CLIPS, CLIPS_DIR, CLIPS_IDLE, DIR, BACKS, dirOf, make, spawn, play, step, draw };
})();

if (typeof window !== 'undefined') window.SPRITE = SPRITE;
