/* ═══════════════════════════════════════════════════════════════════
   TINT — swap a key-coloured sprite sheet to real hair, skin and eyes.
                                                        window.TINT

   THE PROBLEM, and why the art is drawn in absurd colours.

   Customisable hair needs the hair pixels to be findable. Generated art
   does not oblige: the first warden sheet drew brown hair and tan skin out
   of one family of browns, and quantising it returned the SAME colours for
   the crown of the head and the face. The information needed to tell them
   apart was not in the image, so no amount of cleverness could recover it.

   So the sheets are drawn with regions that CANNOT be confused:

       magenta  #FF00FF / #A000A0    hair
       green    #00FF00 / #00A000    skin
       cyan     #00FFFF              eyes

   Nothing in cloth, leather or stone is ever that colour, which turns
   classification from a guess into a fact. tools/recolour.py does the same
   swap at build time; this does it at load so the player's own choice
   applies live.

   SHADING SURVIVES. Each band carries a light and a dark tone, and the swap
   scales the chosen colour by the key pixel's own brightness — so a shadow
   stays a shadow instead of flattening into one flat blob. That is the
   whole reason the briefs ask for two tones per band.

   The player never sees a magenta-haired warrior: recolouring happens
   before the sheet is ever drawn.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const TINT = (() => {

/* Defaults, used before the player has chosen and by anything that draws a
   generic character (the Caretaker's summoning circle preview, say). */
const DEFAULTS = { hair: '#6B4022', skin: '#E0B088', eyes: '#3A6EA8',
                   cloth: '#C8C4BA' };   /* undyed, until a class says otherwise */

/* PRESETS the picker offers. Deliberately a short list: a colour wheel is a
   worse experience than eight good choices, and every extra option is one
   more thing to scroll past on a phone before the game starts. */
const HAIR = ['#1E1A18', '#4A2F1D', '#6B4022', '#8A5A2B',
              '#B98A3C', '#D9C08A', '#7E2E22', '#5A5560'];
const SKIN = ['#F2D3B8', '#E0B088', '#C98F63', '#A56A42',
              '#7A4A2C', '#5A3320', '#E8C6A0', '#8A5A3C'];
const EYES = ['#3A6EA8', '#3E8E5A', '#7A5230', '#5B4B8A',
              '#2E6E6E', '#8A3A3A', '#4A4A4A', '#9A7B2E'];

function hex(c) {
  const v = String(c || '').replace('#', '');
  return [parseInt(v.slice(0, 2), 16) | 0,
          parseInt(v.slice(2, 4), 16) | 0,
          parseInt(v.slice(4, 6), 16) | 0];
}

/* The three tests. Deliberately generous: the generator does not hit exact
   hex values, it renders NEAR them, so these accept a family rather than a
   colour. Cyan is checked FIRST because it overlaps green's test — an iris
   is a small target and losing it to the skin band would be invisible until
   someone looked closely at a face. */
/* EYES ARE ALMOST PURE CYAN — r near zero. The first rule allowed red up
   to 62% of green, which swallowed the tidebinder's pale blue dress
   (#5a9cb5, r=90): 64,961 pixels of frock classified as iris, so choosing
   an eye colour repainted the whole gown. The real eyes were 81 pixels of
   #00ffff. An iris is a tiny target and clothing is a huge one, so the
   test has to be strict or the big thing wins. */
function isCyan(r, g, b)    { return r < 100 && g > 150 && b > 150 && r < g * 0.45; }
function isMagenta(r, g, b) { return r > 110 && b > 110 && g < Math.max(60, r * 0.55); }
function isGreen(r, g, b)   { return g > 100 && r < g * 0.72 && b < g * 0.72; }

/* CLOTH is what is left over. The base sheets wear a plain off-white
   undergarment and nothing else, so every pixel that is not hair, skin or
   eyes is either that garment or the black ink outline — and the two are
   far apart in brightness (measured: outline under 70 luminance, garment
   over 160). So cloth is 'not a key colour, and light enough to be fabric'.

   THIS IS WHAT MAKES ONE POSE SERVE TEN CLASSES. Rather than drawing ten
   characters and hoping their poses match — which failed: five of ten
   drifted, and shifting them mechanically helped some and harmed others —
   the game ships TWO base sheets and paints the class onto them. The poses
   are then identical by construction rather than by inspection, which is
   the only version of this that gear can be built on. */
function lum(r, g, b) { return (r * 299 + g * 587 + b * 114) / 1000; }
function isCloth(r, g, b) {
  return lum(r, g, b) > 90 && !isCyan(r, g, b) &&
         !isMagenta(r, g, b) && !isGreen(r, g, b);
}

/* how dark this pixel was drawn, 0.35..1, from the key's own brightness */
function litness(r, g, b) {
  const m = Math.max(r, g, b) || 255;
  return Math.max(0.35, Math.min(1, m / 255));
}

/* ── the swap ──────────────────────────────────────────────────────
   Returns a CANVAS, not an image: sprite.js draws from either, and a
   canvas costs no encode/decode round trip. */
function recolour(img, choice) {
  const c = Object.assign({}, DEFAULTS, choice || {});
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0);

  let d;
  try { d = g.getImageData(0, 0, cv.width, cv.height); }
  catch (e) { return cv; }        /* tainted canvas — draw it untinted */

  const px = d.data;
  const hairC = hex(c.hair), skinC = hex(c.skin), eyesC = hex(c.eyes);
  const clothC = c.cloth ? hex(c.cloth) : null;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 40) continue;
    const r = px[i], gg = px[i + 1], b = px[i + 2];
    let t = null;
    if (isCyan(r, gg, b)) t = eyesC;
    else if (isMagenta(r, gg, b)) t = hairC;
    else if (isGreen(r, gg, b)) t = skinC;
    else if (clothC && isCloth(r, gg, b)) t = clothC;
    if (!t) continue;
    const f = litness(r, gg, b);
    px[i]     = Math.min(255, t[0] * f) | 0;
    px[i + 1] = Math.min(255, t[1] * f) | 0;
    px[i + 2] = Math.min(255, t[2] * f) | 0;
  }
  g.putImageData(d, 0, 0);
  return cv;
}

/* Is this sheet key-coloured at all? Sheets drawn before the key-colour
   scheme have no magenta in them, and running the swap on one would do
   nothing — but ASKING is what lets both kinds coexist while the ten are
   redrawn, instead of needing a flag day. */
function isKeyed(img) {
  try {
    const cv = document.createElement('canvas');
    const w = cv.width = Math.min(64, img.width);
    const h = cv.height = Math.min(64, img.height);
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, img.width, img.height, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    let key = 0, ink = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 40) continue;
      ink++;
      if (isMagenta(px[i], px[i + 1], px[i + 2])) key++;
    }
    return ink > 0 && key / ink > 0.02;      /* any real magenta at all */
  } catch (e) { return false; }
}

/* ── GEAR: LAYERS ON THE SAME GRID ─────────────────────────────────
   A piece of gear is a sheet with the SAME 6x4 grid as the body, drawn on
   the same pose, transparent everywhere it does not cover. Wearing it is
   then just drawing it over the body, cell for cell — no offsets, no
   per-frame maths, nothing to get wrong.

   That is the whole reason the ten separately-drawn class sheets were
   abandoned for two shared bases: gear can only be this simple when every
   character stands in the same place. One drawing per item per gender,
   fitting every class and every race that shares the frame.

   Gear is tinted too, so a bronze helm and an iron one are one drawing and
   two colours. */
function dress(baseCanvas, layers) {
  if (!layers || !layers.length) return baseCanvas;
  const cv = document.createElement('canvas');
  cv.width = baseCanvas.width; cv.height = baseCanvas.height;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(baseCanvas, 0, 0);
  for (const L of layers) {
    if (!L || !L.img) continue;
    /* a layer that is not the same size is a layer drawn for a different
       body — refuse it rather than stretch it into place, because a
       stretched helmet looks like a bug and a missing one looks like art
       that has not arrived yet */
    if (L.img.width !== cv.width || L.img.height !== cv.height) continue;
    const src = L.tint ? recolour(L.img, L.tint) : L.img;
    g.drawImage(src, 0, 0);
  }
  return cv;
}

return { DEFAULTS, HAIR, SKIN, EYES, recolour, isKeyed, dress };
})();

if (typeof window !== 'undefined') window.TINT = TINT;
