/* ═══════════════════════════════════════════════════════════════════
   KARTI — progress-faces.js
   THE SEVENTEEN FACES, and the medallion they sit in.

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
   Five free, twelve on the ladder. Every one of them is somebody you
   have actually met on this island, and the silhouettes are chosen to
   be told apart at 34px — a headscarf, a flat cap, a peaked cap, a
   diamond, three waves, a beard, a sun hat, a shutter, a hull, two
   ears, eight arms, a plume, a helmet, a top hat, a slipper, a fuse
   and a wreath. No two of them are the same shape.
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
    /* the face dropped straight into somebody else's round chip
       (js/game.js's .avatar) — no frame of ours, just the mark */
    '.avatar>svg.kx-in{display:block;width:100%;height:100%;fill:currentColor;' +
      'stroke:' + INK + ';stroke-width:1.5;stroke-linejoin:round;paint-order:stroke fill}' +

    /* ── the player's own photograph ──────────────────────────────
       Same medallion, same frame, so a photo and a drawn face are the
       same object at every size. object-fit:cover finishes the crop
       the canvas already did, so a picture can never letterbox. */
    '.kx-av>img.kx-ph{display:block;width:100%;height:100%;object-fit:cover;' +
      'border-radius:inherit}' +
    '.avatar>img.kx-ph{display:block;width:100%;height:100%;object-fit:cover;border-radius:inherit}' +

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
    '.kx-av>.kx-ring,.avatar>.kx-ring{z-index:2}' +

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
    '.reduced .kx-r-gold::before{animation:none;transform:rotate(-.12turn)}';
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
    blurb:'It moves. Everyone in the lobby will see that it moves.' }
];
var B_BY = {};
for (var bi = 0; bi < BORDERS.length; bi++) B_BY[BORDERS[bi].id] = BORDERS[bi];

/* which borders are painted as a masked band rather than as an inset
   box-shadow — the gradients and the patterns */
var B_PAT = { sea:1, milled:1, festa:1, streak:1, gold:1 };
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
         markHTML(id, '') + ringHTML(o.border) + '</span>';
}

window.KARTI_FACES = {
  ids: function(){ var a = [], k; for (k in F) a.push(k); return a; },
  has: function(id){ return !!F[id]; },
  mark: markHTML,
  frame: frameHTML,
  ready: ready,
  INK: INK,
  /* the border ladder, and the ring on its own for a caller with a
     box of its own (js/game.js's round .avatar chip) */
  BORDERS: BORDERS,
  border: function(id){ return B_BY[id] || null; },
  ring: ringHTML
};

})();
