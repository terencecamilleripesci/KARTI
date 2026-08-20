/* ═══════════════════════════════════════════════════════════════════
   KARTI — progress-faces.js
   THE TWENTY-SIX FACES, and the medallion they sit in.

   Templates, not uploads. A drawn face costs nothing, cannot be
   obscene on a shared leaderboard, and is on-brand in a way a
   thumbnail of somebody's cat is not.

   THE IDIOM IS js/artkit.js's, deliberately and to the letter:
     · every mark is a FILLED silhouette, painted with
       `paint-order:stroke fill` and a warm near-black rim (#150C22) —
       the art bible's "thick uniform black ink outline" as vector;
     · two shadow tones and no more: the same colour at fill-opacity
       .42 (behind) and .72 (the mass), with the feature at 1;
     · one frame — the same rounded-square medallion at the same
       radius ratio as an artkit emblem, so a face and a game emblem
       sit on the same shelf without a seam.
   That is why this is not a second visual language: it is the same
   one, with a sprite of its own because js/artkit.js is not ours to
   add symbols to.

   NO EMOJI. Every face is a path in a private sprite, for the same
   reason the rest of this app draws its own icons: a unicode
   pictograph is emoji on one phone and tofu on the next.

   Loaded before js/progress-ui.js, which is the only caller.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

if (window.KARTI_FACES) return;

/* ── two helpers, so the geometry below stays readable ────────────── */
/* a hole in a filled path, for an eye or a lens: same subpath idiom
   js/artkit.js uses for the pips on its die */
function hole(cx, cy, r){
  return 'M' + (cx - r) + ' ' + cy +
         'a' + r + ' ' + r + ' 0 1 0 ' + (r * 2) + ' 0' +
         'a' + r + ' ' + r + ' 0 1 0 ' + (-r * 2) + ' 0';
}

/* the bust every human face is cropped into by the medallion */
var BUST = '<path d="M1.4 24c0-4.3 4.8-6.6 10.6-6.6S22.6 19.7 22.6 24Z" fill-opacity=".42"/>';
var HEAD = '<ellipse cx="12" cy="10.6" rx="6.1" ry="6.7" fill-opacity=".72"/>';

/* a flat cap peak / a hat brim, reused by four of them */
function brim(y, x1, x2){
  return '<path d="M' + x1 + ' ' + y + 'h' + (x2 - x1) + 'c.62 0 1.05.42 1.05 1.02 0 .86-.78 1.45-1.8 1.45H' +
         (x1 - .25) + 'c-1.02 0-1.8-.59-1.8-1.45 0-.6.43-1.02 1.05-1.02Z"/>';
}

/* ═══════════════════════════════════════════════════════════════════
   THE SET
   Eight free, eighteen on the ladder. Every one of them is somebody
   you have actually met on this island, and the silhouettes are chosen
   to be told apart at 34px — a headscarf, a flat cap, a peaked cap, a
   diamond, three waves, a beard, a sun hat, a shutter, a hull, two
   ears, eight arms, a plume, a helmet, a top hat, a slipper, a fuse,
   a wreath — and for the women, a front-knotted scarf with hoops, a
   crown of curlers, a high bun with cat-eyes, scalloped set curls, a
   side chignon, a veil, a booth grille, a hair sweep with a mic, and
   a bob over a chain of office. No two of them are the same shape.
   ═══════════════════════════════════════════════════════════════════ */
var F = {};

/* ── IN-NANNA — headscarf and the glasses ── */
F.nanna =
  BUST + HEAD +
  '<path d="M12 2.6c4.5 0 7.5 3.3 7.5 7.9 0 2.8-.6 5.1-1.7 6.9l-2.2-1.3c.8-1.4 1.3-3.1 1.3-5.3 0-3.1-2.1-5.4-4.9-5.4S7.1 7.7 7.1 10.8c0 2.2.5 3.9 1.3 5.3l-2.2 1.3c-1.1-1.8-1.7-4.1-1.7-6.9 0-4.6 3-7.9 7.5-7.9Z"/>' +
  '<path fill-rule="evenodd" d="M6.5 10.3h11v1.1h-1.1a2.1 2.1 0 0 1-4.2.3h-.4a2.1 2.1 0 0 1-4.2-.3H6.5Z' +
    hole(9.4, 11.3, 1.35) + hole(14.6, 11.3, 1.35) + '"/>';

/* ── TAL-KAŻIN — the flat cap and the moustache ── */
F.kazin =
  BUST + HEAD +
  '<path d="M5.1 8.8c0-3.5 3-5.9 6.9-5.9s6.9 2.4 6.9 5.9v.7H5.1Z"/>' +
  '<path d="M3.4 9.5h6.2c.66 0 1.08.55.95 1.2-.24 1.15-1.2 1.85-2.6 1.85H4.1c-.95 0-1.6-.6-1.6-1.4 0-.9.75-1.65 1.9-1.65Z"/>' +
  /* a moustache is a shadow on a face, not a highlight on one: at .95
     it was the same value as the head and vanished into it at 34px.
     Dropped to the kit's recessed tone and widened past the cheeks so
     the ink outline has somewhere to be. */
  '<path d="M6.6 13.6c1.3 0 1.9.75 3.2.75h4.4c1.3 0 1.9-.75 3.2-.75 1.15 0 1.8.72 1.8 1.6 0 1.25-1.25 2.1-2.75 2.1-1.95 0-2.7-1-3.95-1s-2 1-3.95 1c-1.5 0-2.75-.85-2.75-2.1 0-.88.65-1.6 1.8-1.6Z" fill-opacity=".42"/>' +
  '<circle cx="9.6" cy="10.6" r=".95" fill-opacity=".42"/><circle cx="14.4" cy="10.6" r=".95" fill-opacity=".42"/>';

/* ── TAL-LINJA — peaked cap and the shades ── */
F.linja =
  BUST + HEAD +
  '<path d="M5.6 8.4c0-3.4 2.8-5.6 6.4-5.6s6.4 2.2 6.4 5.6v.8H5.6Z"/>' +
  brim(9.2, 3.6, 20.4) +
  '<path d="M6.7 13.3h10.6v1.1c0 1.6-1.1 2.6-2.65 2.6-1.35 0-2.25-.68-2.55-1.85h-.2c-.3 1.17-1.2 1.85-2.55 1.85C7.8 17 6.7 16 6.7 14.4Z" fill-opacity=".95"/>';

/* ── IL-PASTIZZ — no head at all, and that is the joke ── */
F.pastizz =
  '<path d="M12 3.6 22.4 12 12 20.4 1.6 12Z" fill-opacity=".72"/>' +
  '<path d="M12 7.2 17.4 12 12 16.8 6.6 12Z" fill-opacity=".55"/>' +
  '<path d="M12 9.9 14.4 12 12 14.1 9.6 12Z"/>';

/* ── IL-BAĦAR — the sun and three swells ── */
F.bahar =
  '<circle cx="17.4" cy="6.4" r="3.4" fill-opacity=".72"/>' +
  '<path d="M1 13.2c2.1 0 2.1-1.5 4.2-1.5s2.1 1.5 4.2 1.5 2.1-1.5 4.2-1.5 2.1 1.5 4.2 1.5 2.1-1.5 4.2-1.5v2.9c-2.1 0-2.1 1.5-4.2 1.5s-2.1-1.5-4.2-1.5-2.1 1.5-4.2 1.5-2.1-1.5-4.2-1.5-2.1 1.5-4.2 1.5Z"/>' +
  '<path d="M1 18.4c2.1 0 2.1-1.4 4.2-1.4s2.1 1.4 4.2 1.4 2.1-1.4 4.2-1.4 2.1 1.4 4.2 1.4 2.1-1.4 4.2-1.4V24H1Z" fill-opacity=".45"/>';

/* ── IS-SAJJIED — the beard does the work ── */
F.sajjied =
  BUST + HEAD +
  /* the beard must break the HEAD's outline or it is an invisible
     shape inside another shape — so it is wider than the jaw and
     hangs below it, and it is the recessed tone, not a lighter one */
  '<path d="M5.3 10.8c0 1.9 3 3.1 6.7 3.1s6.7-1.2 6.7-3.1c0 4.2-.6 7-1.9 8.6-1.2 1.5-2.8 2.2-4.8 2.2s-3.6-.7-4.8-2.2c-1.3-1.6-1.9-4.4-1.9-8.6Z" fill-opacity=".42"/>' +
  '<circle cx="9.7" cy="10.2" r=".9" fill-opacity=".42"/><circle cx="14.3" cy="10.2" r=".9" fill-opacity=".42"/>' +
  brim(8.6, 4.4, 19.6) +
  '<path d="M7.2 8.6c0-3.3 2.15-5.5 4.8-5.5s4.8 2.2 4.8 5.5Z"/>';

/* ── IT-TURIST — brim, shades, and a face the colour of a lobster ── */
F.turist =
  BUST +
  '<ellipse cx="12" cy="12.2" rx="5.7" ry="6.2" fill-opacity=".72"/>' +
  brim(8.4, 2.2, 21.8) +
  '<path d="M7.7 8.4c0-2.9 1.85-4.9 4.3-4.9s4.3 2 4.3 4.9Z"/>' +
  '<path d="M7.6 12.6h8.8v1c0 1.5-1 2.45-2.4 2.45-1.2 0-2-.6-2.25-1.7h-.2c-.25 1.1-1.05 1.7-2.25 1.7-1.4 0-2.4-.95-2.4-2.45Z" fill-opacity=".95"/>' +
  '<path d="M9.6 20.2h4.8v2.4H9.6Z" fill-opacity=".95"/>';

/* ── IL-ĠAR — a persjana with one eye behind it ── */
F.gar =
  '<rect x="2.4" y="2.4" width="19.2" height="19.2" rx="1.8" fill-opacity=".42"/>' +
  '<path d="M4.2 4.2h15.6v2.3H4.2Zm0 3.6h15.6v2.3H4.2Zm0 10.1h15.6v2.3H4.2Zm0-3.6h15.6v2.3H4.2Z" fill-opacity=".72"/>' +
  '<path fill-rule="evenodd" d="M12 8.5c2.3 0 4.4 1.5 5.5 3.5-1.1 2-3.2 3.5-5.5 3.5S7.6 14 6.5 12c1.1-2 3.2-3.5 5.5-3.5Z' +
    hole(12, 12, 1.7) + '"/>';

/* ── IL-LUZZU — the hull and the eye that has always watched ── */
F.luzzu =
  '<path d="M2.2 13.6h19.6c0 4.2-3.9 7-9.8 7s-9.8-2.8-9.8-7Z" fill-opacity=".72"/>' +
  /* the raised prow is what says luzzu and nothing else — the first
     draft's stub read as the heel of a shoe. It now rises clear of the
     hull and the stern answers it, which is the shape of the boat from
     the quay at Marsaxlokk. */
  '<path d="M2.2 13.6 4.9 3.4c.25-.95 1.5-1.05 1.9-.15L8.6 6.9v6.7Z"/>' +
  '<path d="M21.8 13.6 19.6 7.2c-.2-.7-1.1-.75-1.4-.1l-1.4 3v3.5Z" fill-opacity=".55"/>' +
  '<path fill-rule="evenodd" d="M15 10.2c2 0 3.7 1.1 4.4 2.5-.7 1.4-2.4 2.5-4.4 2.5s-3.7-1.1-4.4-2.5c.7-1.4 2.4-2.5 4.4-2.5Z' +
    hole(15, 12.7, 1.2) + '"/>' +
  '<path d="M2.6 21.4h18.8v2.2H2.6Z" fill-opacity=".42"/>';

/* ── IL-KELB TAL-BEJT — two ears and a grievance ── */
F.kelb =
  '<path d="M6.9 8.2 3.6 3.4c-.5-.75.1-1.7 1-1.55l4.9 1Z" fill-opacity=".72"/>' +
  '<path d="M17.1 8.2 20.4 3.4c.5-.75-.1-1.7-1-1.55l-4.9 1Z" fill-opacity=".72"/>' +
  '<path d="M12 5.4c3.5 0 6 2.5 6 5.9 0 3.8-2.5 6.8-6 6.8s-6-3-6-6.8c0-3.4 2.5-5.9 6-5.9Z"/>' +
  '<path fill-rule="evenodd" d="M9.4 13.6h5.2c0 2.1-1.05 3.3-2.6 3.3s-2.6-1.2-2.6-3.3Z' +
    hole(12, 14.4, .95) + '"/>' +
  '<path d="M20.4 24H3.6c0-3.1 3.75-4.9 8.4-4.9s8.4 1.8 8.4 4.9Z" fill-opacity=".42"/>';

/* ── IL-QARNITA — eight arms, one rock pool ── */
F.qarnita =
  '<path d="M12 3.4c4 0 6.9 3.1 6.9 7.3 0 1.8-.4 3.3-1.1 4.6H6.2c-.7-1.3-1.1-2.8-1.1-4.6 0-4.2 2.9-7.3 6.9-7.3Z" fill-opacity=".72"/>' +
  '<path fill-rule="evenodd" d="M6.4 12.4h11.2v1.6H6.4Z' + hole(9.4, 10.4, 1.5) + hole(14.6, 10.4, 1.5) + '"/>' +
  '<path d="M6.2 15.3h2.5c0 3.4-.5 5.6-1.4 6.7-.6.7-1.7.6-2.1-.2-.4-.8 0-1.5.5-2.2.5-.8.5-2.3.5-4.3Z" fill-opacity=".9"/>' +
  '<path d="M9.7 15.3h2.5c0 4-.3 6.6-1.1 7.9-.5.8-1.7.8-2.1 0-.4-.7-.1-1.5.3-2.4.4-1.1.4-3 .4-5.5Z" fill-opacity=".9"/>' +
  '<path d="M11.8 15.3h2.5c0 2.5 0 4.4.4 5.5.4.9.7 1.7.3 2.4-.4.8-1.6.8-2.1 0-.8-1.3-1.1-3.9-1.1-7.9Z" fill-opacity=".9"/>' +
  '<path d="M15.3 15.3h2.5c0 2 0 3.5.5 4.3.5.7.9 1.4.5 2.2-.4.8-1.5.9-2.1.2-.9-1.1-1.4-3.3-1.4-6.7Z" fill-opacity=".9"/>';

/* ── IL-BANDIST — the plume, and a bell coming in late ── */
F.bandist =
  BUST + HEAD +
  '<path d="M6.1 8.7c0-3.2 2.6-5.3 5.9-5.3s5.9 2.1 5.9 5.3v.8H6.1Z"/>' +
  brim(9.5, 4.6, 19.4) +
  /* the plume is the whole silhouette. The first draft had a 2px tuft
     and a trumpet bell in the corner: at 34px that was a smudge beside
     a smudge, and the cap alone then read as tal-linja's. One tall
     feather breaking the top of the frame is unmistakable and is what
     you actually see coming down the street. */
  '<path d="M12.6 3.4c-.4-2.5.5-4.6 2.8-6.2-.6 2.2-.6 3.9-.2 5.2.5 1.6.4 2.9-.4 3.9Z"/>' +
  '<path d="M6.5 6.2h11v1.7h-11Z" fill-opacity=".42"/>' +
  '<path d="M9.2 12.9h5.6v1.5H9.2Z" fill-opacity=".42"/>';

/* ── IL-KUNTRATTUR — a helmet, and it is still not finished ── */
F.kuntrat =
  BUST + HEAD +
  brim(9.6, 2.6, 21.4) +
  '<path d="M7 9.6c0-3.3 2.2-5.5 5-5.5s5 2.2 5 5.5Z"/>' +
  '<path d="M11.2 4.2h1.6v5.4h-1.6Z" fill-opacity=".45"/>' +
  '<path d="M7 14.2c1.2 0 1.75.7 2.95.7h4.1c1.2 0 1.75-.7 2.95-.7 1.05 0 1.65.66 1.65 1.48 0 1.16-1.15 1.94-2.55 1.94-1.8 0-2.5-.92-3.65-.92s-1.85.92-3.65.92c-1.4 0-2.55-.78-2.55-1.94 0-.82.6-1.48 1.65-1.48Z" fill-opacity=".42"/>' +
  '<circle cx="9.6" cy="11.6" r=".95" fill-opacity=".42"/><circle cx="14.4" cy="11.6" r=".95" fill-opacity=".42"/>';

/* ── IL-MINISTRU — a top hat, and a promise ── */
F.ministru =
  BUST + HEAD +
  '<path d="M6.1 9.4h11.8c.55 0 .95.4.95.95 0 .78-.68 1.3-1.6 1.3H6.75c-.92 0-1.6-.52-1.6-1.3 0-.55.4-.95.95-.95Z"/>' +
  '<path d="M8.2 9.4V3.5c0-.6.5-1.05 1.1-1.05h5.4c.6 0 1.1.45 1.1 1.05v5.9Z"/>' +
  '<path d="M8.2 6.4h7.6v1.7H8.2Z" fill-opacity=".45"/>' +
  '<path d="M12 18.6 15.2 20.4 14.4 24H9.6l-.8-3.6Z" fill-opacity=".95"/>';

/* ── IL-PAPOĊĊ — accurate from ten metres ── */
F.papocc =
  /* a slipper from the SIDE. Two earlier drafts drew it from above and
     both read as a pink cloud — a shape with a hole in it is not a
     slipper unless you already know it is one. From the side the sole,
     the toe cap and the open heel are three unmistakable pieces, and
     the whole thing still works at 30px on a seat plate. */
  '<path d="M1.8 18.4h20.4c0 2.4-1.8 3.9-4.8 3.9H6.6c-3 0-4.8-1.5-4.8-3.9Z" fill-opacity=".42"/>' +
  '<path d="M1.8 18.4c0-5 3.2-8.3 7.9-8.3 3.5 0 5.9 1.8 7 5l1.2 3.3Z" fill-opacity=".72"/>' +
  '<path d="M4.6 18.4c.3-3.2 2.4-5.2 5.4-5.2 2.1 0 3.7 1.1 4.6 3.1l.8 2.1Z"/>';

/* ── IL-PETARDIST — louder than the band ── */
F.petard =
  '<path d="M8.4 9.6h7.2v10.6c0 1.5-1.3 2.6-3.6 2.6s-3.6-1.1-3.6-2.6Z" fill-opacity=".72"/>' +
  '<path d="M8.4 11.8h7.2v2.4H8.4Z" fill-opacity=".45"/>' +
  '<path d="M10.9 9.6V7.4c0-1.7 1.3-2.9 3-2.9v2.2c-.5 0-.9.3-.9.8v2.1Z"/>' +
  '<path d="M13.9 4.5 12.6 1.4l3 1.2 2.5-1.6-.7 3 2.4 1.2-3 .5-.6 2.8-1.6-2.3-2.9.6Z"/>';

/* ── IL-KAMPJUN — the wreath, and the cross in the middle ── */
F.kampjun =
  '<path d="M11 21.8c-4.6-.5-7.8-4.2-7.8-8.9 0-3.1 1.3-5.7 3.3-7.3l1.6 2c-1.5 1.2-2.5 3.1-2.5 5.3 0 3.5 2.4 6.2 5.9 6.6Z" fill-opacity=".72"/>' +
  '<path d="M13 21.8c4.6-.5 7.8-4.2 7.8-8.9 0-3.1-1.3-5.7-3.3-7.3l-1.6 2c1.5 1.2 2.5 3.1 2.5 5.3 0 3.5-2.4 6.2-5.9 6.6Z" fill-opacity=".72"/>' +
  '<path d="M10.6 3.2h2.8v4.4h4.4v2.8h-4.4v7.2h-2.8v-7.2H6.2V7.6h4.4Z"/>';

/* ── TAS-SUQ — the scarf knots at the FRONT, and the hoops ── */
F.suq =
  BUST + HEAD +
  /* nanna's scarf ties under the chin; this one is a working wrap,
     knotted on top of the forehead with the two ends standing up.
     The hoops break the head's outline on both sides, which is what
     carries the face at 34px. */
  '<path d="M12 2.9c4.2 0 7 2.7 7 6.6v.9H5v-.9c0-3.9 2.8-6.6 7-6.6Z"/>' +
  '<path d="M11.6 3.8 9 1Q8.4.3 9.2.3l3.2 1.3Z"/>' +
  '<path d="M12.4 3.8 15 1q.6-.7-.2-.7l-3.2 1.3Z"/>' +
  '<path fill-rule="evenodd" d="M3.7 15a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0Z' +
    hole(5.6, 15, 1) +
    'M16.5 15a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0Z' + hole(18.4, 15, 1) + '"/>' +
  '<circle cx="9.7" cy="12" r=".9" fill-opacity=".42"/><circle cx="14.3" cy="12" r=".9" fill-opacity=".42"/>';

/* ── IL-PARRUKKIERA — three curlers across the crown, a battlement ── */
F.parrukkiera =
  BUST + HEAD +
  '<rect x="4.9" y="1.8" width="4" height="4.6" rx="1.7"/>' +
  '<rect x="10" y="1" width="4" height="4.6" rx="1.7"/>' +
  '<rect x="15.1" y="1.8" width="4" height="4.6" rx="1.7"/>' +
  '<circle cx="6.9" cy="4.1" r=".8" fill-opacity=".42"/>' +
  '<circle cx="12" cy="3.3" r=".8" fill-opacity=".42"/>' +
  '<circle cx="17.1" cy="4.1" r=".8" fill-opacity=".42"/>' +
  '<path d="M5.6 7.2c1.5.9 3.9 1.4 6.4 1.4s4.9-.5 6.4-1.4v1.9H5.6Z" fill-opacity=".42"/>' +
  '<circle cx="9.6" cy="11.4" r=".9" fill-opacity=".42"/><circle cx="14.4" cy="11.4" r=".9" fill-opacity=".42"/>';

/* ── TAL-ĦANUT — the high bun and the cat-eye glasses ── */
F.talhanut =
  BUST + HEAD +
  '<circle cx="12" cy="3" r="2.6"/>' +
  '<path d="M12 3.6c3.6 0 6 2.4 6.2 6l-2.1-.5c-.3-2.2-1.8-3.5-4.1-3.5S8.2 6.9 7.9 9.1l-2.1.5c.2-3.6 2.6-6 6.2-6Z"/>' +
  /* the lenses sweep UP at the outer corner — that wing is the whole
     difference between these and nanna's rounds */
  '<path fill-rule="evenodd" d="M5.2 9.6 11.2 11v2.6H6.9c-1 0-1.6-.6-1.8-1.6Z' +
    hole(8.5, 11.9, 1.15) +
    'M18.8 9.6 12.8 11v2.6h4.3c1 0 1.6-.6 1.8-1.6Z' + hole(15.5, 11.9, 1.15) +
    'M11.2 11.2h1.6v1h-1.6Z"/>';

/* ── IŻ-ŻIJA — set curls all round, and one eyebrow already up ── */
F.zija =
  BUST + HEAD +
  '<path d="M5.3 9.6c0-4.1 2.9-6.6 6.7-6.6s6.7 2.5 6.7 6.6v1.1H5.3Z"/>' +
  /* seven curls scallop the outline the way a fresh set does — the
     silhouette is a cog, and no other face has one */
  '<circle cx="5.3" cy="9.6" r="1.9"/><circle cx="6.1" cy="6.2" r="1.9"/>' +
  '<circle cx="8.6" cy="3.9" r="1.9"/><circle cx="12" cy="3.1" r="1.9"/>' +
  '<circle cx="15.4" cy="3.9" r="1.9"/><circle cx="17.9" cy="6.2" r="1.9"/>' +
  '<circle cx="18.7" cy="9.6" r="1.9"/>' +
  '<path d="M7.9 9.7h2.9v1H7.9Z"/>' +
  '<path d="M13.2 8.9c.6-1 1.8-1.5 3-1.2l-.25 1.05c-.9-.2-1.7.1-2.2.8Z"/>' +
  '<circle cx="9.4" cy="11.6" r=".9" fill-opacity=".42"/><circle cx="14.6" cy="11.6" r=".9" fill-opacity=".42"/>';

/* ── IS-SURMASTRA — the chignon, and the glasses you were sent to ── */
F.surmastra =
  BUST + HEAD +
  '<path d="M12 3.1c4 0 6.7 2.7 6.7 6.6l-.1 1.6-2-.6.1-1c0-2.9-1.9-4.8-4.7-4.8S7.3 6.8 7.3 9.7l.1 1-2 .6-.1-1.6c0-3.9 2.7-6.6 6.7-6.6Z"/>' +
  /* the chignon is a SOLID knot — a first draft gave it a swirl dot
     and at 34px the dot became a hole and the bun became a wheel */
  '<circle cx="19.3" cy="14" r="2.7"/>' +
  /* narrow rectangles, not rounds: a slit to be looked over, which is
     how she has always used them */
  '<path fill-rule="evenodd" d="M6.3 10.5h4.6v2.8H6.3ZM7.1 11.25h3v1.3h-3Z' +
    'M13.1 10.5h4.6v2.8h-4.6ZM13.9 11.25h3v1.3h-3Z' +
    'M10.9 11.2h2.2v.9h-2.2Z"/>';

/* ── L-GĦARUSA — the veil IS the silhouette ── */
F.gharusa =
  /* no BUST: the veil falls past where the bust would be, edge to
     edge, and the medallion crops it — a pale triangle of tulle with
     a face in it, which nothing else in the set resembles */
  '<path d="M12 2.2c5.3 0 8.9 3.8 9.7 9.5.4 3.4.5 7.5.5 12.3H1.8c0-4.8.1-8.9.5-12.3C3.1 6 6.7 2.2 12 2.2Z" fill-opacity=".42"/>' +
  '<path d="M4.9 8.6C3.8 11.8 3.4 16.7 3.4 24h1.9c0-6.9.4-11.5 1.3-14.5Z" fill-opacity=".72"/>' +
  '<path d="M19.1 8.6c1.1 3.2 1.5 8.1 1.5 15.4h-1.9c0-6.9-.4-11.5-1.3-14.5Z" fill-opacity=".72"/>' +
  HEAD +
  '<path d="M8.5 4.9 9.7 1.8l1.1 2L12 1.2l1.2 2.6 1.1-2 1.2 3.1Z"/>' +
  '<circle cx="9.6" cy="10.8" r=".9" fill-opacity=".42"/><circle cx="14.4" cy="10.8" r=".9" fill-opacity=".42"/>' +
  '<path d="M10.4 13.6c.5.5 1.1.75 1.6.75s1.1-.25 1.6-.75l.7.8c-.6.7-1.4 1.05-2.3 1.05s-1.7-.35-2.3-1.05Z" fill-opacity=".42"/>';

/* ── TAL-LOTTU — the face is behind the grille, where it has
       always been ── */
F.lottu =
  BUST + HEAD +
  '<path d="M12 3.2c3.9 0 6.5 2.4 6.8 6l-2.1-.7c-.4-2-2.1-3.2-4.7-3.2S7.7 6.5 7.3 8.5l-2.1.7c.3-3.6 2.9-6 6.8-6Z"/>' +
  '<circle cx="12" cy="2.5" r="1.4"/>' +
  '<circle cx="9.6" cy="10.6" r=".9" fill-opacity=".42"/><circle cx="14.4" cy="10.6" r=".9" fill-opacity=".42"/>' +
  /* the booth window: a rail and five bars over the lower face, in
     the recessed tone — she is not hidden, she is FILED */
  '<path d="M4.9 12.3h14.2v1.1H4.9Zm1.1 1.1h1.3V24H6Zm3.2 0h1.3V24H9.2Zm3.2 0h1.3V24h-1.3Zm3.2 0h1.3V24h-1.3Zm3.2 0h1.3V24h-1.3Z" fill-opacity=".42"/>';

/* ── IL-KANTANTA — the hair goes one way, the voice goes every way ── */
F.kantanta =
  BUST + HEAD +
  /* one big sweep over the crown and down her left, past the jaw —
     asymmetry is the read: every other head in the set is level */
  '<path d="M10.9 2.7c5-.9 8.9 2 9.5 7 .3 2.9-.3 5.5-1.8 7.6l-2-1.3c1.2-1.7 1.7-3.7 1.4-5.9-.4-3.2-2.7-5.1-5.9-4.8-2.6.2-4.3 1.7-4.9 4.2l-2.2-.5c.7-3.5 3-5.8 5.9-6.3Z"/>' +
  '<circle cx="9.2" cy="10.9" r=".9" fill-opacity=".42"/><circle cx="13.8" cy="10.9" r=".9" fill-opacity=".42"/>' +
  '<circle cx="11.2" cy="14.4" r="1.25" fill-opacity=".42"/>' +
  /* the mic points AT HER — ball up by the jaw, handle running down
     into the corner. The first draft put the handle on the far side
     and the whole thing read as a magnifying glass at 34px. */
  '<circle cx="5.4" cy="18.6" r="2.9"/>' +
  '<path d="M3.4 20.7 6.3 19.6 5.5 24H2.4Z"/>' +
  '<path d="M2.7 17.6c.6-1.1 1.7-1.8 3-1.8l.1 1.1c-1 0-1.8.5-2.2 1.3Z" fill-opacity=".42"/>';

/* ── IS-SINDKU — the bob, the chain, the nine votes ── */
F.sindku =
  BUST + HEAD +
  '<path d="M12 2.8c4.4 0 7.3 2.9 7.3 7.3 0 2.5-.5 4.7-1.4 6.4l-2.2-.7c.5-1.4.8-3.1.8-5 0-.7-.1-1.4-.2-2-1.1.9-2.6 1.4-4.3 1.4s-3.2-.5-4.3-1.4c-.1.6-.2 1.3-.2 2 0 1.9.3 3.6.8 5l-2.2.7c-.9-1.7-1.4-3.9-1.4-6.4 0-4.4 2.9-7.3 7.3-7.3Z"/>' +
  '<circle cx="9.7" cy="11.4" r=".9" fill-opacity=".42"/><circle cx="14.3" cy="11.4" r=".9" fill-opacity=".42"/>' +
  /* the chain of office: a recessed band across the bust and four
     discs at full value riding it — regalia survives 34px where
     ornament does not, because it is COUNTABLE */
  '<path d="M5.2 18.2c1.8 1.6 4.1 2.4 6.8 2.4s5-.8 6.8-2.4l.9 1.1c-2 1.8-4.6 2.7-7.7 2.7s-5.7-.9-7.7-2.7Z" fill-opacity=".42"/>' +
  '<circle cx="6.9" cy="19.6" r="1.3"/><circle cx="10.3" cy="20.9" r="1.3"/>' +
  '<circle cx="13.7" cy="20.9" r="1.3"/><circle cx="17.1" cy="19.6" r="1.3"/>';

/* ═══════════════════════════════════════════════════════════════════
   THE SPRITE AND THE FRAME
   One sprite for the whole app, appended to <body> the way js/party.js
   appends its piece sprite and js/artkit.js appends its marks. The
   medallion below is artkit's, value for value, so the two families
   are one family. No transform, no filter, no backdrop-filter:
   this is drawn a few pixels from a position:fixed tab bar.
   ═══════════════════════════════════════════════════════════════════ */
var INK = '#150C22';

function injectSprite(){
  if (document.getElementById('kx-sprite') || !document.body) return;
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'kx-sprite';
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  var s = '', k;
  for (k in F) if (Object.prototype.hasOwnProperty.call(F, k))
    s += '<symbol id="kx-f-' + k + '" viewBox="0 0 24 24">' + F[k] + '</symbol>';
  svg.innerHTML = s;
  document.body.appendChild(svg);
}

function injectCSS(){
  if (document.getElementById('kx-face-css') || !document.head) return;
  var st = document.createElement('style');
  st.id = 'kx-face-css';
  st.textContent =
    /* the medallion — artkit's .ka + .ka-avatar, to the value */
    '.kx-av{--kx-size:38px;--kx-ax:#FFC542;position:relative;display:inline-grid;place-items:center;' +
      'flex:0 0 auto;width:var(--kx-size);height:var(--kx-size);overflow:hidden;' +
      'border-radius:calc(var(--kx-size) * .27);' +
      'background-image:' +
        'radial-gradient(115% 115% at 26% 16%,rgba(255,238,200,.22),rgba(255,238,200,0) 56%),' +
        'repeating-linear-gradient(135deg,rgba(255,255,255,.035) 0 1px,rgba(255,255,255,0) 1px 3px),' +
        'linear-gradient(158deg,color-mix(in srgb,var(--kx-ax) 36%,#150F26),#140E24 76%);' +
      'border:1px solid color-mix(in srgb,var(--kx-ax) 42%,transparent);' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.13),' +
        'inset 0 calc(var(--kx-size) * -.14) calc(var(--kx-size) * .2) ' +
          'calc(var(--kx-size) * -.14) rgba(0,0,0,.72);' +
      '-webkit-user-select:none;user-select:none}' +
    /* color-mix is young; anything that does not know it gets the flat
       panel colour, which still reads correctly */
    '@supports not (background:color-mix(in srgb,red 50%,blue)){' +
      '.kx-av{background-image:linear-gradient(158deg,#241A3E,#140E24 76%);' +
      'border-color:rgba(255,255,255,.18)}}' +
    '.kx-av>svg{display:block;width:88%;height:88%;margin-top:6%;color:var(--kx-ax);' +
      'fill:currentColor;stroke:' + INK + ';stroke-width:1.4;stroke-linejoin:round;' +
      'paint-order:stroke fill;overflow:visible}' +
    '.kx-av[data-sm="1"]>svg{stroke-width:1}' +
    /* the declarative box js/progress-ui.js fills. It holds exactly one
       medallion, so it is a transparent grid the medallion sits in —
       and when the box is js/game.js's old gold .avatar chip, the gold
       goes: the medallion IS the avatar now, and a gold rim peeking out
       at the corners would be a border nobody equipped. (With the XP
       modules missing the rule is never injected and the chip stays a
       gold square wearing an initial, which is the honest fallback.) */
    '[data-kx-av]{display:inline-grid;place-items:center;line-height:0}' +
    '.avatar[data-kx-av]{background:none}' +

    /* ── the player's own photograph ──────────────────────────────
       Same medallion, same frame, so a photo and a drawn face are the
       same object at every size. object-fit:cover finishes the crop
       the canvas already did, so a picture can never letterbox. */
    '.kx-av>img.kx-ph{display:block;width:100%;height:100%;object-fit:cover;' +
      'border-radius:inherit}' +
    /* THE PHOTOGRAPH AND THE DRAWN FACE MUST SHARE ONE CELL.
       .kx-av is an inline-grid, and a grid with no template puts each
       child in its OWN ROW — so the photo was not covering the face, it
       was sitting underneath it in a second row and being clipped away by
       the medallion's own size. Everything else was working perfectly:
       the file was on the Pi, the phone had a copy, it was worn, and the
       image decoded. It was simply drawn somewhere you cannot see.
       Pinning both to cell 1/1 makes them overlap, which is what
       place-items:center was always assuming. */
    '.kx-av>svg,.kx-av>img.kx-ph{grid-area:1/1}' +

    /* ═══════════════════════════════════════════════════════════
       BORDERS
       A ring sits OVER the medallion, so one border works over a
       drawn face and over a photograph without knowing which it is.

       WHAT SURVIVES 30px. Ornament does not — at a leaderboard row a
       laurel and a knurl are the same grey smudge. COLOUR and
       THICKNESS do. So every border in the ladder is separated by
       hue first, and the pattern is texture that only resolves when
       the same ring is 96px on the profile. That is why the plain
       early ones are not a lesser version of the fancy ones: at the
       size they are seen most, they are equally legible.

       Thickness is a fraction of the frame with a 2px floor, so one
       rule covers a 26px leaderboard face and a 96px picker tile. */
    '.kx-ring{position:absolute;inset:0;border-radius:inherit;pointer-events:none;' +
      '--kx-bw:max(2px,calc(var(--kx-size,38px) * .075));--kx-fb:rgba(255,255,255,.5)}' +
    '.kx-av>.kx-ring{z-index:2}' +
    /* THE LEVEL SITS INSIDE THE RING, and this is why it has to.

       The medallion is `overflow:hidden` — it has to be, or a photograph
       would spill out of the rounded corners it was cropped to. So a badge
       hung BELOW the bottom edge does not hang, it is guillotined: the
       first version used bottom:-6% and every level on every one of the
       twelve borders came out sliced flat across the digits. It read as a
       rendering fault rather than as a badge.

       Sitting it just inside the edge costs nothing — it still overlaps
       the band, so it still reads as part of the border — and it cannot be
       cut, because there is no longer anything of it outside the box doing
       the cutting. Sized entirely from --kx-size, so one rule covers a
       44px seat plate and a 96px picker tile. */
    '.kx-av>.kx-lvb{position:absolute;z-index:3;left:50%;bottom:calc(var(--kx-size,38px) * .022);' +
      'transform:translateX(-50%);min-width:calc(var(--kx-size,38px) * .34);' +
      'height:calc(var(--kx-size,38px) * .26);padding:0 calc(var(--kx-size,38px) * .07);' +
      'border-radius:999px;display:grid;place-items:center;' +
      'font-family:var(--disp);font-weight:900;line-height:1;' +
      'font-size:calc(var(--kx-size,38px) * .19);letter-spacing:.02em;' +
      'background:linear-gradient(180deg,#FFD873,#F0A81E);color:#2A1B0C;' +
      'border:calc(var(--kx-size,38px) * .028) solid ' + INK + ';' +
      'box-shadow:0 1px 3px rgba(0,0,0,.6)}' +

    /* ── THE LEVEL-BOX LADDER ──────────────────────────────────────
       Each of these is a background and two colours over the base rule
       above, which already owns the geometry. That is the entire
       mechanism: a slot with ten entries and not one extra element,
       render path or measurement anywhere in the app.

       Every one keeps DARK TEXT ON A LIGHT BOX. It is tempting to do a
       black box with white digits for variety, and it is wrong — this
       thing sits on top of a border, and the borders run from white
       hairline to pure black, so a dark box disappears on Tempesta and
       a light one is legible on all twelve. The variety has to come
       from hue, and the contrast has to stay put. */
    /* EVERY ONE OF THESE IS WRITTEN .kx-av>.kx-lvb.kx-b-x, NOT .kx-b-x.
       The base rule above is `.kx-av>.kx-lvb`, which is two classes and
       beats a single class on specificity — written the short way, the
       whole ladder rendered and every single box came out plain gold,
       because `background` was being won by the rule underneath. */
    '.kx-av>.kx-lvb.kx-b-ink{background:linear-gradient(180deg,#F6F3FF,#C9C2DE);' +
      'color:#15102A;border-color:#15102A}' +
    '.kx-av>.kx-lvb.kx-b-copper{background:linear-gradient(180deg,#F2C08A,#C2703A);' +
      'color:#33170A}' +
    '.kx-av>.kx-lvb.kx-b-sea{background:linear-gradient(180deg,#CDEEFF,#4FA9E8);' +
      'color:#0A2E47}' +
    '.kx-av>.kx-lvb.kx-b-stone{background:linear-gradient(180deg,#F3EBD5,#CBBE9C);' +
      'color:#3A3222}' +
    '.kx-av>.kx-lvb.kx-b-neon{background:linear-gradient(180deg,#DCC9FF,#8A5CFF);' +
      'color:#1B0B3A;box-shadow:0 0 calc(var(--kx-size,38px) * .13) rgba(138,92,255,.75)}' +
    '.kx-av>.kx-lvb.kx-b-festa{background:linear-gradient(180deg,#FFD979,#E8452C);' +
      'color:#3A0D06}' +
    '.kx-av>.kx-lvb.kx-b-chrome{background:linear-gradient(180deg,#FBF6E8,#9C8A5E 52%,#EFE3C2);' +
      'color:#2A2416}' +

    /* The two that move. Same discipline as the borders: the animated
       property is a transform on a pseudo-element inside a clip, so it
       is one composited layer and nothing repaints. `overflow:hidden`
       plus the base rule's border-radius is what keeps the shine
       inside the pill. */
    '.kx-av>.kx-lvb{overflow:hidden;isolation:isolate}' +
    '.kx-av>.kx-lvb.kx-b-kampjun{background:linear-gradient(180deg,#FFE9B0,#E8A81E);' +
      'color:#2A1B0C}' +
    /* THE SHINE IS AN OVERLAY, NOT A BACKDROP. It was z-index:-1 first,
       which puts a child behind its own parent's background — and the
       parent's background is an opaque gradient, so the animation ran
       perfectly and was never once visible. It now sits ON TOP, at an
       opacity low enough that the digits read straight through it,
       which is also how gloss on a real enamel badge behaves. */
    '.kx-b-kampjun::before{content:"";position:absolute;inset:-60%;z-index:1;' +
      'pointer-events:none;' +
      'background:linear-gradient(75deg,rgba(255,255,255,0) 38%,' +
        'rgba(255,255,255,.72) 50%,rgba(255,255,255,0) 62%);' +
      'animation:kxShine 2.8s ease-in-out infinite}' +
    '@keyframes kxShine{0%{transform:translateX(-115%)}' +
      '55%,100%{transform:translateX(115%)}}' +
    /* the admin's: the storm, in a box the size of a thumbnail. It
       reuses the border's own flicker timeline so the two are visibly
       the same weather rather than two effects that happen to be
       violet. */
    '.kx-av>.kx-lvb.kx-b-tempesta{background:linear-gradient(180deg,#E4D6FF,#9B6BFF);' +
      'color:#160B2E;border-color:#2A0F4E;' +
      'box-shadow:0 0 calc(var(--kx-size,38px) * .14) rgba(155,107,255,.9)}' +
    '.kx-b-tempesta::before{content:"";position:absolute;inset:-70%;z-index:1;' +
      'pointer-events:none;' +
      'background:conic-gradient(from 0turn,rgba(255,255,255,0) 0turn,' +
        'rgba(255,255,255,.85) .12turn,rgba(255,255,255,0) .26turn,' +
        'rgba(255,255,255,0) .62turn,rgba(235,220,255,.7) .72turn,' +
        'rgba(255,255,255,0) .84turn,rgba(255,255,255,0) 1turn);' +
      'animation:kxStorm 5.6s linear infinite,kxArc 2.3s steps(1,end) infinite}' +
    '@media (prefers-reduced-motion:reduce){' +
      '.kx-b-kampjun::before,.kx-b-tempesta::before{animation:none;opacity:.85;' +
        'transform:none}}' +
    '.reduced .kx-b-kampjun::before,.reduced .kx-b-tempesta::before{' +
      'animation:none;opacity:.85;transform:none}' +

    /* the patterned ones are ONE technique: a full-bleed background
       masked down to the band. Unsupported engines never see the mask
       — they get a solid ring in the same colour from the border
       below, which is the whole point of declaring it first. */
    '.kx-ring.pat{border:var(--kx-bw) solid var(--kx-fb)}' +
    '@supports ((-webkit-mask-composite:xor) or (mask-composite:exclude)){' +
      '.kx-ring.pat{border:0;padding:var(--kx-bw);background-image:var(--kx-pat);' +
        '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);' +
        '-webkit-mask-composite:xor;' +
        'mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);' +
        'mask-composite:exclude}}' +

    /* ── the plain ones. Box-shadow, not border, so the ring sits
         inside the frame and never changes the avatar's size ── */
    '.kx-r-hairline{box-shadow:inset 0 0 0 max(1px,calc(var(--kx-size,38px) * .04)) rgba(255,255,255,.78)}' +
    '.kx-r-twine{box-shadow:inset 0 0 0 var(--kx-bw) #C99A5B,' +
      'inset 0 0 0 calc(var(--kx-bw) * 1.9) rgba(90,58,25,.75)}' +
    '.kx-r-brass{box-shadow:inset 0 0 0 var(--kx-bw) #E0A94A,' +
      'inset 0 0 0 1px rgba(255,240,200,.55),' +
      'inset 0 0 0 calc(var(--kx-bw) + 1px) rgba(90,58,0,.55)}' +
    '.kx-r-stone{box-shadow:inset 0 0 0 var(--kx-bw) #EFE6CE,' +
      'inset 0 0 0 calc(var(--kx-bw) * 1.8) #6E6350}' +
    /* Sea Glass is a GRADIENT, so it cannot be a box-shadow — and the
       padding-box/border-box two-layer trick does not work here
       either: the layer that hides the middle has to be opaque, and
       over a photograph there is nothing opaque to hide it with. (It
       was tried, and it painted a solid blue tile over the face.) So
       it goes through the same masked band as the patterned ones. */
    '.kx-r-sea{--kx-fb:#4FA9E8;--kx-pat:linear-gradient(150deg,#BFE7FA,#4FA9E8 52%,#12557F)}' +
    '.kx-r-neon{box-shadow:inset 0 0 0 var(--kx-bw) #8A5CFF,' +
      '0 0 calc(var(--kx-size,38px) * .18) rgba(138,92,255,.55)}' +

    /* ── the patterned ones. repeating-conic-gradient in the band:
         no image, no SVG, one paint, and it scales to any size ── */
    '.kx-r-milled{--kx-fb:#D8C79B;--kx-pat:repeating-conic-gradient(from 0deg,' +
      '#EFE3C2 0deg 5.6deg,#9C8A5E 5.6deg 11.25deg)}' +
    '.kx-r-festa{--kx-fb:#FF9E2C;--kx-pat:repeating-conic-gradient(from 0deg,' +
      '#FFD979 0deg 11.25deg,#E8452C 11.25deg 22.5deg)}' +
    '.kx-r-streak{--kx-fb:#3DDC84;--kx-pat:repeating-conic-gradient(from -90deg,' +
      '#5CFFA8 0deg 25.2deg,rgba(20,60,38,.85) 25.2deg 36deg)}' +
    '.kx-r-story{box-shadow:inset 0 0 0 var(--kx-bw) #C0384A,' +
      'inset 0 0 0 calc(var(--kx-bw) * 1.75) #FFC542}' +

    /* ═══ THE TOP OF THE LADDER, AND THE ONLY THING THAT MOVES ═══
       One border in the whole set is animated, deliberately: motion
       stops meaning anything the moment two things have it. A slow
       highlight travels the ring — a conic gradient on a rotating
       pseudo-element, masked to the band by the same rule as every
       other pattern above.

       WHY THIS IS CHEAP. The animated property is `transform` and
       nothing else, so the paint happens once and every frame after
       that is the compositor turning an already-rasterised layer.
       There is no JavaScript timer, no per-avatar state, and nothing
       to tear down: twenty-five of these on a leaderboard cost one
       composited transform each. No will-change — twenty-five
       promoted layers would trade a cost nobody can measure for
       memory anybody can. */
    '.kx-r-gold{--kx-fb:#FFC542;overflow:hidden}' +
    '@supports ((-webkit-mask-composite:xor) or (mask-composite:exclude)){' +
      '.kx-r-gold::before{content:"";position:absolute;inset:-45%;' +
        'background:conic-gradient(from 0turn,' +
          'rgba(176,126,18,.85) 0turn,rgba(255,197,66,.9) .07turn,' +
          '#FFE9B0 .12turn,#FFFDF2 .15turn,#FFE9B0 .18turn,' +
          'rgba(255,197,66,.9) .24turn,rgba(176,126,18,.85) .34turn,' +
          'rgba(176,126,18,.85) 1turn);' +
        'animation:kxSweep 4.2s linear infinite}}' +
    '@keyframes kxSweep{from{transform:rotate(0turn)}to{transform:rotate(1turn)}}' +

    /* Somebody who has asked for less movement gets a BEAUTIFUL still
       version, not a disabled one: the sweep parks at the angle where
       the highlight sits top-left, which is where the key light is on
       every other surface in this app. Both switches are honoured —
       the phone's, and the app's own Reduce motion in Settings. */
    '@media (prefers-reduced-motion:reduce){' +
      '.kx-r-gold::before{animation:none;transform:rotate(-.12turn)}}' +
    '.reduced .kx-r-gold::before{animation:none;transform:rotate(-.12turn)}' +

    /* ═══ TEMPESTA — THE ONE THAT IS NOT FOR SALE ═══════════════════
       Gold is the top of the ladder and it glows warm; this one had to
       be unmistakably NOT that, at a glance, on a 44px seat plate,
       across a room. So it inverts every choice gold makes: the band is
       near-black instead of bright, the highlight is a pair of thin
       cold spikes instead of one broad warm sweep, and it does not
       rotate smoothly — it stutters.

       WHY THE STUTTER IS THE WHOLE TRICK. Lightning is not a moving
       light, it is a still light that stops existing. A conic gradient
       turning at a constant rate reads as a polished chrome sweep, which
       is gold's job. Rotating it and flickering the opacity on a
       `steps()` timeline — two spikes at .35 opacity, then one frame at
       full, then dark — reads as a storm, and the two animations are on
       `transform` and `opacity` ONLY, so it is still nothing but the
       compositor moving a layer it already rasterised. No timer, no
       JavaScript, no per-avatar state. Same cost as gold.

       The aura is a drop-shadow on the MEDALLION, not on the ring:
       .kx-ring.pat is mask-composited down to the band, and a mask
       clips an outer shadow away completely (this was tried — the glow
       simply never appeared). The parent is not masked, so the glow
       survives there. :has() is guarded; an engine without it gets the
       storm without the halo, which is still the right border. */
    '.kx-r-tempesta{--kx-fb:#7B4BD8;' +
      '--kx-pat:conic-gradient(from 0turn,#0A0611 0turn,#1A0F33 .12turn,' +
        '#0A0611 .2turn,#5B2FB0 .235turn,#C9A6FF .25turn,#FFFFFF .258turn,' +
        '#C9A6FF .266turn,#5B2FB0 .28turn,#0A0611 .34turn,' +
        '#0A0611 .68turn,#7B4BD8 .73turn,#EBDCFF .75turn,#7B4BD8 .77turn,' +
        '#0A0611 .82turn,#0A0611 1turn);' +
      'overflow:hidden}' +
    '@supports ((-webkit-mask-composite:xor) or (mask-composite:exclude)){' +
      '.kx-r-tempesta{background-image:none}' +
      '.kx-r-tempesta::before{content:"";position:absolute;inset:-45%;' +
        'background:var(--kx-pat);' +
        'animation:kxStorm 5.6s linear infinite,kxArc 2.3s steps(1,end) infinite}}' +
    '@keyframes kxStorm{from{transform:rotate(0turn)}to{transform:rotate(1turn)}}' +
    /* dark for most of the cycle, one hot frame, then dark again */
    '@keyframes kxArc{0%,58%{opacity:.34}60%{opacity:1}64%{opacity:.5}' +
      '66%{opacity:1}72%,100%{opacity:.34}}' +
    '@supports selector(:has(*)){' +
      '.kx-av:has(>.kx-r-tempesta){' +
        'filter:drop-shadow(0 0 calc(var(--kx-size,38px) * .1) rgba(123,75,216,.9))' +
        ' drop-shadow(0 0 calc(var(--kx-size,38px) * .22) rgba(90,40,180,.55))}}' +
    /* Still, it is a black ring with the arc parked where the key light
       falls on everything else in this app — not a disabled one. */
    '@media (prefers-reduced-motion:reduce){' +
      '.kx-r-tempesta::before{animation:none;transform:rotate(-.12turn);opacity:1}}' +
    '.reduced .kx-r-tempesta::before{animation:none;transform:rotate(-.12turn);opacity:1}' +

    /* ═══ BETA-TESTER FRAMES — pure bling. A fast bright metal sweep, a
       sparkle layer that twinkles across it, and a coloured halo on the
       medallion. Gold for one tester, silver for the other. ═══ */
    '@keyframes kxTwinkle{0%,100%{opacity:.2;transform:rotate(0)}50%{opacity:1;transform:rotate(8deg)}}' +
    '.kx-r-betagold{--kx-fb:#FFD23F;--kx-pat:conic-gradient(from 0turn,' +
      '#7A560E 0turn,#FFC542 .05turn,#FFF6CE .09turn,#FFFFFF .12turn,#FFF6CE .15turn,' +
      '#FFC542 .19turn,#7A560E .3turn,#B8860B .5turn,#FFE9A8 .55turn,#FFFFFF .59turn,' +
      '#FFE9A8 .63turn,#B8860B .72turn,#7A560E .82turn,#7A560E 1turn);overflow:hidden}' +
    '.kx-r-betasilver{--kx-fb:#DCE3EF;--kx-pat:conic-gradient(from 0turn,' +
      '#5C6472 0turn,#C6CEDA .05turn,#F4F8FF .09turn,#FFFFFF .12turn,#F4F8FF .15turn,' +
      '#C6CEDA .19turn,#5C6472 .3turn,#8A93A3 .5turn,#E9EEF6 .55turn,#FFFFFF .59turn,' +
      '#E9EEF6 .63turn,#8A93A3 .72turn,#5C6472 .82turn,#5C6472 1turn);overflow:hidden}' +
    '@supports ((-webkit-mask-composite:xor) or (mask-composite:exclude)){' +
      '.kx-r-betagold,.kx-r-betasilver{background-image:none}' +
      '.kx-r-betagold::before,.kx-r-betasilver::before{content:"";position:absolute;inset:-45%;' +
        'background:var(--kx-pat);animation:kxSweep 2.6s linear infinite}' +
      '.kx-r-betagold::after,.kx-r-betasilver::after{content:"";position:absolute;inset:-1px;' +
        'border-radius:inherit;pointer-events:none;mix-blend-mode:screen;' +
        'background:radial-gradient(circle at 28% 18%,rgba(255,255,255,.95),transparent 34%),' +
        'radial-gradient(circle at 78% 74%,rgba(255,255,255,.8),transparent 30%),' +
        'radial-gradient(circle at 60% 30%,rgba(255,255,255,.7),transparent 22%);' +
        'animation:kxTwinkle 2.2s ease-in-out infinite}}' +
    '@supports selector(:has(*)){' +
      '.kx-av:has(>.kx-r-betagold){filter:' +
        'drop-shadow(0 0 calc(var(--kx-size,38px)*.1) rgba(255,197,66,.95))' +
        ' drop-shadow(0 0 calc(var(--kx-size,38px)*.26) rgba(255,170,30,.6))}' +
      '.kx-av:has(>.kx-r-betasilver){filter:' +
        'drop-shadow(0 0 calc(var(--kx-size,38px)*.1) rgba(220,227,239,.95))' +
        ' drop-shadow(0 0 calc(var(--kx-size,38px)*.26) rgba(170,185,205,.6))}}' +
    '@media (prefers-reduced-motion:reduce){' +
      '.kx-r-betagold::before,.kx-r-betasilver::before{animation:none;transform:rotate(-.12turn)}' +
      '.kx-r-betagold::after,.kx-r-betasilver::after{animation:none;opacity:.7}}' +
    '.reduced .kx-r-betagold::before,.reduced .kx-r-betasilver::before{animation:none;transform:rotate(-.12turn)}' +
    '.reduced .kx-r-betagold::after,.reduced .kx-r-betasilver::after{animation:none;opacity:.7}';
  document.head.appendChild(st);
}

/* ── THE LADDER, in one place ──────────────────────────────────────
   Nine on levels, two earned, and the animated one at the very top.
   `earn` is a plain english sentence; js/progress.js owns the test.
   Ordered as the inventory lists them. */
var BORDERS = [
  { id:'none',     name:'No Border',        lvl:0,  blurb:'The frame on its own. Nothing to prove.' },
  { id:'hairline', name:'Hairline',         lvl:0,  blurb:'One clean line. Free, and it always looked right.' },
  { id:'twine',    name:'Twine',            lvl:2,  blurb:'Off the same roll as everything else in the drawer.' },
  { id:'brass',    name:'Brass',            lvl:4,  blurb:'Polished once, in 1974, by somebody who cared.' },
  { id:'stone',    name:'Limestone',        lvl:7,  blurb:'Cut from the same rock as every wall on this island.' },
  { id:'sea',      name:'Sea Glass',        lvl:10, blurb:'Ten years in the water to get that edge.' },
  { id:'neon',     name:'Neon Sign',        lvl:13, blurb:'Buzzes faintly. Nobody has fixed it. Nobody will.' },
  { id:'milled',   name:'Milled Metal',     lvl:16, blurb:'Knurled all the way round, the way a good coin is.' },
  { id:'festa',    name:'Festa Burst',      lvl:20, blurb:'Every colour the square goes on the last night.' },
  { id:'streak',   name:'Ten In A Row',     lvl:0,  earn:'streak',
    blurb:'Ten wins on the trot in one game. No excuses accepted.' },
  { id:'story',    name:'Village Champion', lvl:0,  earn:'story',
    blurb:'All eight bosses. The village is yours, apparently.' },
  { id:'gold',     name:'Kampjun Gold',     lvl:25, anim:true,
    blurb:'It moves. Everyone in the lobby will see that it moves.' },
  /* ONE OF ONE. Not the top of the ladder — off the ladder entirely.
     It has no level, because no amount of play reaches it, and that is
     the point: everything else in this list is a promise to the player
     that grinding gets them there, and this is the single thing in the
     app that is honest about not being for sale. It belongs to the man
     whose game it is. See EARN_TEST.admin in js/progress.js. */
  { id:'tempesta', name:'Tempesta',         lvl:0,  earn:'admin', anim:true, solo:true,
    blurb:'Black, and there is lightning in it. One of these exists.' },
  /* BETA-TESTER FRAMES. Off the ladder, not for sale, worn by account name
     (see betaRing() in js/progress.js). A thank-you in gold and silver, dripping. */
  { id:'betagold',   name:'Beta — Gold',   lvl:0, earn:'betagold',   anim:true, solo:true,
    blurb:'Solid gold, dripping bling. A thank-you for a beta tester — wear it or don’t.' },
  { id:'betasilver', name:'Beta — Silver', lvl:0, earn:'betasilver', anim:true, solo:true,
    blurb:'Cold silver, all shimmer. A thank-you for a beta tester — wear it or don’t.' }
];
var B_BY = {};
for (var bi = 0; bi < BORDERS.length; bi++) B_BY[BORDERS[bi].id] = BORDERS[bi];

/* which borders are painted as a masked band rather than as an inset
   box-shadow — the gradients and the patterns */
var B_PAT = { sea:1, milled:1, festa:1, streak:1, gold:1, tempesta:1, betagold:1, betasilver:1 };

/* ═══════════════════════════════════════════════════════════════════
   THE LEVEL BOX
   The number in the bottom of the ring is now a slot of its own, and
   the reason is grind: a border changes what the medallion looks like
   from across the room, but the level box is the one thing on it that
   is about YOUR NUMBER, so it is the piece a player most wants to make
   theirs — and it is cheap to want, because there is a new one every
   few levels rather than every ten.

   Deliberately a SEPARATE ladder from the borders, on a tighter
   spacing. The two ladders interleave, so there is nearly always
   something four or five levels away rather than a fifteen-level
   desert between border unlocks.

   Every one of these is a background and two colours. No new element,
   no second render path — lvHTML just adds a class. */
var BADGES = [
  { id:'gold',     name:'Klassika',      lvl:0,
    blurb:'The one everybody starts with. It was always fine.' },
  { id:'ink',      name:'Linka',         lvl:3,
    blurb:'Black and white. Reads at any size, which is the whole trick.' },
  { id:'copper',   name:'Ram',           lvl:6,
    blurb:'The colour of every door knocker in Valletta.' },
  { id:'sea',      name:'Baħar',         lvl:9,
    blurb:'Blue, and lit from the top like water is.' },
  { id:'stone',    name:'Ġebla',         lvl:12,
    blurb:'Globigerina. The whole island is made of this colour.' },
  { id:'neon',     name:'Neon',          lvl:16,
    blurb:'Violet, with the buzz around it.' },
  { id:'festa',    name:'Festa',         lvl:20,
    blurb:'Red and gold, the way the bandstand is painted.' },
  { id:'chrome',   name:'Kroma',         lvl:24,
    blurb:'Milled, like the edge of a proper coin.' },
  { id:'kampjun',  name:'Kampjun',       lvl:30, anim:true,
    blurb:'It shines, and it keeps shining. The last one on the ladder.' },
  /* the admin's. Same rule as Tempesta: off the ladder, not for sale. */
  { id:'tempesta', name:'Tempesta',      lvl:0, earn:'admin', anim:true, solo:true,
    blurb:'Lightning, in a box the size of a thumbnail. One of these exists.' }
];
var BG_BY = {};
for (var gi = 0; gi < BADGES.length; gi++) BG_BY[BADGES[gi].id] = BADGES[gi];
var BG_RE = /^[a-z0-9_-]{1,24}$/;
var B_RE = /^[a-z]{2,12}$/;
function ringHTML(id){
  if (!id || id === 'none' || !B_RE.test(id) || !B_BY[id]) return '';
  var pat = B_PAT[id] ? ' pat' : '';
  return '<span class="kx-ring' + pat + ' kx-r-' + id + '"></span>';
}

function ready(){
  injectCSS();
  injectSprite();
  if (!document.getElementById('kx-sprite'))
    document.addEventListener('DOMContentLoaded', injectSprite);
}

/* the bare mark, for a caller that has its own box */
function markHTML(id, cls){
  ready();
  if (!F[id]) return '';
  return '<svg class="' + (cls || 'kx-in') + '" viewBox="0 0 24 24" aria-hidden="true" ' +
         'focusable="false"><use href="#kx-f-' + id + '"></use></svg>';
}

function q(s){ return String(s == null ? '' : s).replace(/"/g, '&quot;'); }

/* The whole thing: medallion, mark, ring.

   THE DRAWN FACE IS ALWAYS IN THE MARKUP, even when a photograph is
   coming. js/progress.js mounts the <img> over it only once a real
   load event has fired — the probe-then-mount rule js/artkit.js and
   js/stats.js already work by — so there is no code path anywhere in
   this app that can show a broken-image glyph, and a relay that is
   unreachable (which is most of the time from his own phone) simply
   leaves the drawn face showing, which was never wrong. */
/* THE LEVEL, SITTING IN THE BOTTOM OF THE RING.
   It rides with the border rather than being a separate chip beside the face,
   so it follows a player everywhere their face goes — the profile, the record
   book, a seat plate — without every caller having to remember it.
   Suppressed below 40px: at 26 on a leaderboard row the digits would be two
   or three pixels tall, which is not a number, it is grit on the ring. */
function lvHTML(lv, size, box){
  lv = lv | 0;
  if (!lv || (size | 0) < 40) return '';
  /* an unknown or missing box is the plain gold one, never a missing
     class — the number must render whatever else has gone wrong */
  var b = (box && BG_RE.test(box) && BG_BY[box] && box !== 'gold') ? ' kx-b-' + box : '';
  return '<span class="kx-lvb' + b + '" aria-hidden="true">' + lv + '</span>';
}

function frameHTML(id, opts){
  ready();
  var o = opts || {};
  var sz = o.size || 38;
  var ax = o.accent || '#FFC542';
  var st = '--kx-size:' + sz + 'px;--kx-ax:' + ax + (o.style ? ';' + o.style : '');
  return '<span class="kx-av' + (o.cls ? ' ' + o.cls : '') + '"' +
         (sz < 30 ? ' data-sm="1"' : '') +
         (o.pic ? ' data-kx-pic="' + q(o.pic) + '"' : '') +
         ' style="' + st + '"' +
         (o.label ? ' role="img" aria-label="' + q(o.label) + '"' : ' aria-hidden="true"') + '>' +
         markHTML(id, '') + ringHTML(o.border) + lvHTML(o.lv, sz, o.lvb) + '</span>';
}

window.KARTI_FACES = {
  ids: function(){ var a = [], k; for (k in F) a.push(k); return a; },
  has: function(id){ return !!F[id]; },
  mark: markHTML,
  frame: frameHTML,
  ready: ready,
  INK: INK,
  /* the border ladder. ring() is frame()'s own ingredient, exported for
     completeness — nothing should draw a ring around a box that did not
     come out of frame(), because that is how a ring ends up the wrong
     size for the face it circles (it happened: 38px ring, 32px chip). */
  BORDERS: BORDERS,
  border: function(id){ return B_BY[id] || null; },
  ring: ringHTML,
  /* the level-box ladder, on the same terms as the borders */
  BADGES: BADGES,
  badge: function(id){ return BG_BY[id] || null; },
  lv: lvHTML
};

})();
