/* ═══════════════════════════════════════════════════════════════════
   KARTI — artkit.js
   THE SHARED VISUAL TEMPLATE. One design language, drawn in CSS+SVG,
   with every picture treated as a SLOT rather than a dependency.

   ── the idea ──────────────────────────────────────────────────────
   Every visual in this app is finished BEFORE any image exists. The
   procedural version is the real thing; the generated png is an
   upgrade that fades in on top of it. So:
     · a missing file is invisible, never a broken-image glyph
     · a deploy with no art pack still looks designed
     · tomorrow's GPU run replaces slots one at a time, no rewrite

   ── how the upgrade happens ───────────────────────────────────────
   PROBE, THEN MOUNT. The <img> is never put in the document until a
   plain `new Image()` has actually decoded the file. One probe per
   SLOT for the whole app, not one per instance — twenty chess tiles
   cost one request. When a probe succeeds every live host for that
   slot gets its <img> appended, at opacity 0, promoted to 1 by the
   real load event. There is literally no code path that can show a
   broken image, because a failed slot never gets an element at all.
   (js/stats.js proved the pattern; this generalises it.)

   ── the look ──────────────────────────────────────────────────────
   Taken from docs/ART_STYLE_BIBLE.md and the tokens already on :root
   in index.html — nothing here invents a new palette. The three
   things that make the family read as one set:
     1. THE INK OUTLINE. Every mark is a FILLED silhouette painted
        with `paint-order:stroke fill` and a near-black stroke. That
        is the bible's "thick uniform black ink outline" expressed as
        vector, so a procedural emblem and a generated one sit on the
        same shelf without a seam.
     2. TWO TONES, ONE LIGHT. Recessed parts of a mark are the same
        colour at fill-opacity .45–.75 (the bible's "exactly two
        shadow tones"), and every surface carries one warm key light
        from the upper left.
     3. ONE FRAME. Emblems, tiles and avatars all sit in the same
        rounded-square medallion at the same radius ratio, with the
        same hairline, the same grain and the same engraved edge.

   ── rules this file obeys ─────────────────────────────────────────
   · NO EMOJI, EVER. Unicode pictographs render as emoji or tofu on
     some phones — it has bitten this project twice already. Every
     mark here is a path in a private sprite.
   · NO `filter`, NO `backdrop-filter`, NO `transform` on anything
     that could parent a position:fixed element. Depth is box-shadow
     and gradients only. (A transform makes a containing block and
     has moved this app's tab bar before.)
   · Cheap. Gradients, not images. No animation except one 250ms
     opacity fade when a real picture arrives.
   · Nothing here writes to another module's DOM or CSS. The prefix
     is `ka-` throughout and the stylesheet is injected from here.

   ── what to read next ─────────────────────────────────────────────
   docs/ART_SLOTS.md — the registry below, written out long-hand with
   the generation brief for every slot. That document and the SLOTS
   object in this file are the same thing; keep them in step.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

if (window.KARTI_ART) return;

/* ═══════════════════════════════════════════════════════════════════
   0. THE PALETTE AND THE TYPE SCALE
   EXTRACTED, not invented. Every value below already exists in
   index.html's :root or css/extra.css; naming them here means a game
   can ask the kit for "the gold" instead of pasting #FFC542 again.
   ═══════════════════════════════════════════════════════════════════ */
var PALETTE = {
  /* the shell */
  bg:'#0E0B14', panel:'#1B1430', panel2:'#241A3E',
  line:'rgba(255,255,255,.10)', line2:'rgba(255,255,255,.18)',
  txt:'#F4EFFF', dim:'#A093C4', dim2:'#7F73A0',
  /* the five brand hues */
  gold:'#FFC542', hot:'#E8452C', neon:'#8A5CFF', ok:'#3DDC84', bad:'#FF5468',
  /* the ink. Every silhouette is stroked with this, and it is the one
     colour in the kit that is NOT on :root — the bible's black outline
     is a warm near-black, not #000, so it sits in the same night as
     the rest of the app instead of punching a hole in it. */
  ink:'#150C22',
  /* materials — surfaces are mixed from these */
  stone:'#E7D6AC',      /* honey limestone, the light chess square    */
  stoneDark:'#B79E70',
  felt:'#123B2A',       /* the kazin card table                       */
  feltLit:'#1B5B3F',
  wood:'#6B4423',       /* worn bar top                               */
  woodDark:'#3A2413',
  night:'#1B1038',      /* festa sky                                  */
  paper:'#F2E4C4',      /* deed / parchment                           */
  /* per-game accents. These are the ones js/stats.js already ships,
     so a game's colour is the same on the profile as on its own screen. */
  aKarti:'#8A5CFF', aParty:'#FFC542', aChess:'#D8C79B', aDama:'#3DDC84',
  aSkarta:'#FF5468', aKiri:'#FFC542', aKlabb:'#E8452C',
  aBixkla:'#8A5CFF', aBriscola:'#3DDC84', aSette:'#E8452C', aCheat:'#FF5468'
};

/* The type scale, in the sizes this app actually uses. Display face is
   Orbitron (var(--disp)) for anything shouted; body is the system face.
   Sizes are px because the shell is a fixed 440-wide phone and rem
   would only add a layer of indirection over the same numbers. */
var SCALE = {
  micro:'9.5px',   /* uppercase label under a number      ls .14em */
  label:'10.5px',  /* uppercase section label             ls .12em */
  small:'11.5px',  /* chip, pill, seat name               ls .06em */
  body:'12.5px',   /* running text                        ls 0     */
  read:'13.5px',   /* a paragraph someone reads           ls 0     */
  sub:'15px',      /* card / tile title                   ls .06em */
  title:'17px',    /* screen title                        ls .04em */
  hero:'clamp(21px,7vw,30px)'
};

/* ═══════════════════════════════════════════════════════════════════
   1. THE MARKS
   Filled silhouettes on the same 24x24 grid as index.html's sprite,
   drawn so they survive the size they are actually seen at (30-40px
   on a tile, 17px on a rail). Holes are cut with fill-rule="evenodd"
   rather than by painting the background colour over the top, so a
   mark works on limestone and on night sky without being redrawn.

   Sub-shapes at fill-opacity .45/.75 are the two shadow tones. The
   stroke is applied by CSS on the <svg>, so it inherits into <use>.
   ═══════════════════════════════════════════════════════════════════ */

/* The eight-pointed cross, four arrowheads meeting in the middle.
   Same construction as #i-cross-malta in index.html (which is a
   single arm rotated four times) so the shape is literally the app's
   own cross at any size. */
function crossArms(r, cx, cy){
  var a = (0.617 * r).toFixed(2), b = (0.468 * r).toFixed(2), R = r.toFixed(2);
  var arm = 'M0 0L-' + a + ' -' + R + 'L0 -' + b + 'L' + a + ' -' + R + 'Z';
  var out = '', i;
  for (i = 0; i < 4; i++)
    out += '<path d="' + arm + '" transform="translate(' + cx + ' ' + cy + ') rotate(' + (i * 90) + ')"/>';
  return out;
}

/* a circle as a path, so it can be an evenodd hole inside another path */
function ring(cx, cy, r){
  return 'M' + (cx - r) + ' ' + cy +
         'a' + r + ' ' + r + ' 0 1 0 ' + (r * 2) + ' 0' +
         'a' + r + ' ' + r + ' 0 1 0 ' + (-r * 2) + ' 0Z';
}

/* one stacked draughts disc: the side wall, then the face on top of it */
function disc(cy){
  return '<path d="M4.6 ' + cy + 'h14.8v2.1a7.4 2.9 0 0 1-14.8 0z"/>' +
         '<ellipse cx="12" cy="' + cy + '" rx="7.4" ry="2.9"/>';
}

var MARKS = {

  /* ── the brand ──────────────────────────────────────────────── */
  /* KARTI: two cards thrown back, the cross struck over them */
  karti:
    '<rect x="3.6" y="5" width="10.4" height="14.6" rx="1.8" fill-opacity=".45" ' +
      'transform="rotate(-16 8.8 12.3)"/>' +
    '<rect x="10" y="5" width="10.4" height="14.6" rx="1.8" fill-opacity=".45" ' +
      'transform="rotate(16 15.2 12.3)"/>' +
    crossArms(7.4, 12, 12.4),

  /* ── party games ────────────────────────────────────────────── */
  /* the hub: a die and a card. Six card games hang off this shelf and
     four of the eleven marks in the set are already cards, so the HUB
     had to be the one thing none of its children are — the die is the
     only silhouette here that is not a rectangle, which is what makes
     it findable at 34px in a grid of tiles. */
  party:
    '<rect x="1.4" y="3.6" width="9" height="13" rx="1.6" fill-opacity=".45" ' +
      'transform="rotate(-18 5.9 10.1)"/>' +
    '<path fill-rule="evenodd" transform="rotate(-8 14.2 14.2)" ' +
      'd="M9.4 7h9.6a2.4 2.4 0 0 1 2.4 2.4V19a2.4 2.4 0 0 1-2.4 2.4H9.4A2.4 2.4 0 0 1 7 19V9.4' +
      'A2.4 2.4 0 0 1 9.4 7z' +
      ring(10.2, 10.2, 1.5) + ring(18.2, 10.2, 1.5) + ring(14.2, 14.2, 1.5) +
      ring(10.2, 18.2, 1.5) + ring(18.2, 18.2, 1.5) + '"/>',

  /* chess: the knight. The exact silhouette js/party.js already puts
     on the board, so the emblem and the piece are the same animal. */
  chess:
    '<path d="M9 19.2h9.4c.3-5.2-.4-8.7-2.4-11-1.1-1.3-2.4-2-3-3l1.6-2.4-2-1.3-.9 1.4' +
      '-1.7-2.3-1.7 1.2.8 2.5-2.9 3.7c-.9 1.1-.8 2.4.2 3.1.9.7 2.2.4 2.9-.5l1.2-1.4' +
      'c.3.9 0 1.8-.9 2.6-1.8 1.8-3.7 3.1-3.9 5.4z"/>' +
    '<path d="M5.4 19.4h13.2v3.1H5.4z"/>',

  /* dama: three stacked stones, the top one crowned */
  dama:
    disc(17.2) + disc(13.6) + disc(10) +
    '<path d="M8.4 10.9l-.8-3.7 2.2 1.6L12 6.2l2.2 2.6 2.2-1.6-.8 3.7z"/>',

  /* SKARTA: four cards thrown down hard, one face-up, dust behind */
  skarta:
    '<rect x="2.4" y="7.4" width="9" height="12.6" rx="1.6" fill-opacity=".45" ' +
      'transform="rotate(-30 6.9 13.7)"/>' +
    '<rect x="5.4" y="6.2" width="9" height="12.6" rx="1.6" fill-opacity=".65" ' +
      'transform="rotate(-13 9.9 12.5)"/>' +
    '<path fill-rule="evenodd" d="M10.8 5.6h8.4a1.7 1.7 0 0 1 1.7 1.7v9.6a1.7 1.7 0 0 1' +
      '-1.7 1.7h-8.4a1.7 1.7 0 0 1-1.7-1.7V7.3a1.7 1.7 0 0 1 1.7-1.7z' +
      'M15 8.1l1.1 2.5 2.5 1.1-2.5 1.1-1.1 2.5-1.1-2.5-2.5-1.1 2.5-1.1z" ' +
      'transform="rotate(8 15 12.1)"/>' +
    '<path d="M1.6 4.4h3.4v1.5H1.6zM.9 8.2h2.4v1.5H.9z" fill-opacity=".55"/>',

  /* IL-KIRI: a townhouse with the enclosed balcony. The gallarija is
     the whole point — a plain house reads as any board game. */
  kiri:
    /* flat parapet roof, not a pitch — a Maltese townhouse has no
       gable, and the flat top is half of what makes this read as
       Malta rather than as any board game about houses */
    '<path d="M2.4 4.6h19.2v2.8H2.4z"/>' +
    '<path fill-rule="evenodd" d="M4.2 7.4h15.6v14.8H4.2zM10.4 22.2v-4.2h3.2v4.2z"/>' +
    /* the gallarija: the enclosed wooden balcony, with its corbel sill
       standing proud of the wall. This is the whole emblem. */
    '<path fill-rule="evenodd" d="M6.2 9h11.6v7.4H6.2zM8.2 10.8h7.6v3.8H8.2z"/>' +
    '<path d="M5.2 16.4h13.6v1.5H5.2z"/>',

  /* the ordinary pack: a stack with a pip cut out of the top card */
  klabb:
    '<path d="M5.4 19.4h13.2v1.8H5.4z" fill-opacity=".45"/>' +
    '<path d="M4.9 16.8h14.2v1.8H4.9z" fill-opacity=".7"/>' +
    '<path fill-rule="evenodd" d="M6.4 3.2h11.2a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2H6.4' +
      'a2 2 0 0 1-2-2V5.2a2 2 0 0 1 2-2zM12 6.3 15.4 9.6 12 12.9 8.6 9.6z"/>',

  /* bixkla: a hand held up in a fan — the game is what you are holding */
  bixkla:
    '<rect x="7.6" y="4.6" width="8.8" height="13" rx="1.5" fill-opacity=".5" ' +
      'transform="rotate(-30 12 21)"/>' +
    '<rect x="7.6" y="4.6" width="8.8" height="13" rx="1.5" fill-opacity=".5" ' +
      'transform="rotate(30 12 21)"/>' +
    '<path fill-rule="evenodd" d="M9.1 4.2h5.8a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1' +
      '-1.5 1.5H9.1a1.5 1.5 0 0 1-1.5-1.5v-10a1.5 1.5 0 0 1 1.5-1.5z' +
      'M12 7.4 14.5 10.7 12 14 9.5 10.7z"/>',

  /* briscola: the trump laid crosswise under the stock. Nothing else
     in card games looks like this, which is why it works at 30px. */
  briscola:
    /* the trump has to stick out from UNDER the stock at both ends and
       below it — a card crossed dead-centre just reads as a plus sign */
    /* both rectangles are a real 5:7 card, one of them turned on its
       side — get the proportion wrong and the trump reads as a plinth */
    '<rect x="2" y="9.4" width="20" height="12.8" rx="1.9" fill-opacity=".5"/>' +
    '<path fill-rule="evenodd" d="M10.1 1.6h3.8a1.6 1.6 0 0 1 1.6 1.6v9.6a1.6 1.6 0 0 1' +
      '-1.6 1.6h-3.8a1.6 1.6 0 0 1-1.6-1.6V3.2a1.6 1.6 0 0 1 1.6-1.6z' +
      'M12 5.2 14.1 8 12 10.8 9.9 8z"/>',

  /* sette e mezzo: the money game — a coin over the cards */
  /* sette e mezzo: the money game — a struck coin on the cards. The
     coin is a rim ring with the cross inside it, the same two marks
     the coin slot itself is built from, so the emblem and the currency
     are visibly the same object. A plain ring just read as a letter O. */
  sette:
    '<rect x="1.6" y="4.6" width="10.4" height="14.6" rx="1.7" fill-opacity=".45" ' +
      'transform="rotate(-16 6.8 11.9)"/>' +
    '<rect x="4.6" y="3.8" width="10.4" height="14.6" rx="1.7" fill-opacity=".65" ' +
      'transform="rotate(-4 9.8 11.1)"/>' +
    '<path fill-rule="evenodd" d="' + ring(15.8, 15, 7) + ring(15.8, 15, 5.4) + '"/>' +
    crossArms(4.1, 15.8, 15),

  /* il-gidba, the lie: the mask over the card you are not showing */
  cheat:
    '<rect x="6.2" y="4.4" width="11.6" height="16" rx="1.9" fill-opacity=".5" ' +
      'transform="rotate(-8 12 12.4)"/>' +
    '<path fill-rule="evenodd" d="M2.8 11.2c0-1.6 1.3-2.6 3.2-2.6h12c1.9 0 3.2 1 3.2 2.6 ' +
      '0 3-2 5.6-4.7 5.6-2 0-3.4-1.2-4.5-2.9-1.1 1.7-2.5 2.9-4.5 2.9C4.8 16.8 2.8 14.2 2.8 11.2z' +
      ring(6.8, 12, 1.8) + ring(17.2, 12, 1.8) + '"/>',

  /* ── coins ──────────────────────────────────────────────────── */
  /* the obverse mark, for the blank middle of the coin */
  coin: crossArms(6.6, 12, 12),
  /* the reverse: the eye painted on a luzzu's prow */
  luzzu:
    '<path fill-rule="evenodd" d="M1.8 12c3.2-4.9 6.6-7.3 10.2-7.3S19 7.1 22.2 12' +
      'c-3.2 4.9-6.6 7.3-10.2 7.3S5 16.9 1.8 12z' + ring(12, 12, 4.1) + '"/>' +
    '<circle cx="12" cy="12" r="2"/>',

  /* ── board / token furniture ────────────────────────────────── */
  /* the pawn, used as a player token everywhere */
  token:
    '<circle cx="12" cy="5.6" r="2.9"/>' +
    '<path d="M9.4 8.6c-1 .9-1.6 2-1.6 3.2 0 1.7 1.1 3.1 2.6 3.9l-1 4.1h5.2l-1-4.1' +
      'c1.5-.8 2.6-2.2 2.6-3.9 0-1.2-.6-2.3-1.6-3.2z"/>' +
    '<path d="M6.4 19.4h11.2v3.1H6.4z"/>',
  /* the crown a kinged stone wears, and the penthouse marker */
  crown:
    '<path d="M3.4 6.6l3.9 3.1L12 3.4l4.7 6.3 3.9-3.1-1.7 10.1H5.1z"/>' +
    '<path d="M5.4 18.9h13.2v2.4H5.4z"/>',
  /* a plain house — one floor built on a KIRI square */
  house:
    '<path fill-rule="evenodd" d="M3.6 20.8v-9.4L12 5.2l8.4 6.2v9.4z' +
      'M10.4 20.8v-4.4h3.2v4.4z"/>',

  /* ── the civic set ───────────────────────────────────────────────
     The IL-KIRI board is 32 squares and every one of them is still an
     emoji today (see docs/ART_SLOTS.md §6). These are the marks that
     cover the recurring kinds of square, so the emoji can come out in
     one pass rather than thirty-two. They are deliberately blunt: at
     26px on a board cell, a silhouette is all that survives. */
  ferry:
    '<path d="M2.6 15.4h18.8l-2.4 5.4H5z"/>' +
    '<path d="M6.4 8.6h11.2l1.4 5.4H5z"/>' +
    '<path d="M11 2.4h2v5.4h-2z"/>',
  bus:
    '<path fill-rule="evenodd" d="M5 3.6h14a2 2 0 0 1 2 2v10.8a2 2 0 0 1-2 2H5' +
      'a2 2 0 0 1-2-2V5.6a2 2 0 0 1 2-2zM5.4 6.4h13.2v5H5.4z"/>' +
    '<path d="M4.6 18.2h3v2.4h-3zM16.4 18.2h3v2.4h-3z"/>',
  water:
    '<path d="M12 1.8c4.4 5.2 6.8 9 6.8 12.1A6.8 6.8 0 1 1 5.2 13.9C5.2 10.8 7.6 7 12 1.8z"/>',
  power:
    '<path d="M13.6 1.6 5.2 13.4h5.1l-1.5 8.6 9.1-12.4h-5.5z"/>',
  shop:
    '<path d="M3.4 3.4h17.2l1.4 5.2H2z"/>' +
    '<path fill-rule="evenodd" d="M4.4 9.8h15.2v11H4.4zM9.4 12.6h5.2v8.2H9.4z"/>',
  /* a TOWER crane: counterweight, jib, mast, hoist line and hook. The
     first draft was a mast and a jib only and read as a capital T. */
  crane:
    '<path d="M2.6 1.4h4v2.2h-4z"/>' +
    '<path d="M2.2 3.6h19.4v2.3H2.2z"/>' +
    '<path d="M9.4 5.9h3.1v14.3H9.4z"/>' +
    '<path d="M17.6 5.9h1.3v4.9h-1.3z"/>' +
    '<path d="M16 10.6h4.5v2.7H16z"/>' +
    '<path d="M5.4 20.2h11.2v2.5H5.4z"/>',
  gate:
    '<path fill-rule="evenodd" d="M4.4 21.4V8.6L12 3l7.6 5.6v12.8z' +
      'M9 21.4v-6.6a3 3 0 0 1 6 0v6.6z"/>',
  gavel:
    '<path d="M13.4 2.2 21 9.8l-3.1 3.1-7.6-7.6z"/>' +
    '<path d="M8.6 8.2 12 11.6 5.4 18.2 2 14.8z"/>' +
    '<path d="M13.4 18.8h8.4v3H13.4z"/>',
  coffee:
    '<path fill-rule="evenodd" d="M3.4 6.6h13.2v6.2a6.6 6.6 0 0 1-13.2 0z' +
      'M17.6 8h1.8a2.8 2.8 0 0 1 0 5.6h-1.8z"/>' +
    '<path d="M3 19.4h14v2.6H3z"/>',
  key:
    '<path fill-rule="evenodd" d="M7.6 4.2a5.6 5.6 0 1 1 0 11.2 5.6 5.6 0 0 1 0-11.2z' +
      ring(7.6, 9.8, 2.1) + '"/>' +
    '<path d="M12.4 8.6h9.2v2.4h-9.2z"/>' +
    '<path d="M17.4 11h2v3.4h-2zM20.4 11h1.9v2.6h-1.9z"/>',
  wrench:
    '<path d="M20.4 3.2a6.4 6.4 0 0 1-8.2 8.2L5.6 18a2.6 2.6 0 0 1-3.6-3.6l6.6-6.6' +
      'a6.4 6.4 0 0 1 8.2-8.2l-3.4 3.4 2.8 2.8z"/>',
  eye:
    '<path fill-rule="evenodd" d="M1.8 12c3.2-4.9 6.6-7.3 10.2-7.3S19 7.1 22.2 12' +
      'c-3.2 4.9-6.6 7.3-10.2 7.3S5 16.9 1.8 12z' + ring(12, 12, 4.1) + '"/>' +
    '<circle cx="12" cy="12" r="2"/>'
};

/* ═══════════════════════════════════════════════════════════════════
   2. THE REGISTRY — THE HANDOVER
   Every slot the app can ask for: what it looks like today, and what
   file replaces it tomorrow. `brief` is the subject line for the
   generation prompt; the style suffix and the negative come from
   docs/ART_STYLE_BIBLE.md §2 and are NOT repeated per slot.

   kind:
     'emblem'  — a game mark in the standard medallion. One future png.
     'object'  — coin, card back: a drawn object with a future png.
     'surface' — a CSS material. The future file is an optional TILING
                 texture, so these can ship forever without one.
     'shape'   — vector FOREVER. Tokens and pieces. Do not generate:
                 SVG is sharper at every size and weighs nothing, and
                 unicode versions render as emoji on some phones.
   ═══════════════════════════════════════════════════════════════════ */
var SLOTS = {

  /* ── emblems ────────────────────────────────────────────────── */
  'emblem': { kind:'emblem', file:'art/ui/emblem.png', mark:'karti', accent:PALETTE.aKarti,
    mono:'KA', name:'KARTI',
    brief:'the KARTI mark: two thrown playing cards behind an eight-pointed Maltese cross' },
  'logo-party': { kind:'emblem', file:'art/ui/logo-party.png', mark:'party', accent:PALETTE.aParty,
    mono:'PT', name:'Party Games',
    brief:'a battered Maltese bar table seen from above with a deck of cards, two dice and a bottle cap on it, warm overhead light' },
  'logo-chess': { kind:'emblem', file:'art/ui/logo-chess.png', mark:'chess', accent:PALETTE.aChess,
    mono:'CH', name:'Chess',
    brief:'a single carved limestone chess knight in three-quarter view, chipped and old, a Maltese cross faintly cut into its base' },
  'logo-dama': { kind:'emblem', file:'art/ui/logo-dama.png', mark:'dama', accent:PALETTE.aDama,
    mono:'DA', name:'Dama',
    brief:'three stacked draughts pieces in olive green and terracotta, the top one crowned, low angle on a worn wooden board' },
  'logo-skarta': { kind:'emblem', file:'art/ui/logo-skarta.png', mark:'skarta', accent:PALETTE.aSkarta,
    mono:'SK', name:'SKARTA',
    brief:'a fan of four bold blank playing cards thrown down hard, one landing face-up, motion lines and a small dust puff' },
  'logo-kiri': { kind:'emblem', file:'art/ui/logo-kiri.png', mark:'kiri', accent:PALETTE.aKiri,
    mono:'KI', name:'IL-KIRI',
    brief:'a small honey-limestone Maltese townhouse with an enclosed wooden balcony, a for-rent post with a BLANK face, a crane behind' },
  'logo-klabb': { kind:'emblem', file:'art/ui/logo-klabb.png', mark:'klabb', accent:PALETTE.aKlabb,
    mono:'KB', name:'Playing Cards',
    brief:'a worn deck of ordinary playing cards squared up on a green felt table, top card face down, one card slipping off the stack' },
  'logo-bixkla': { kind:'emblem', file:'art/ui/logo-bixkla.png', mark:'bixkla', accent:PALETTE.aBixkla,
    mono:'BX', name:'Bixkla',
    brief:'a hand of three blank playing cards held up in a tight fan, seen from the player side, warm lamp light' },
  'logo-briscola': { kind:'emblem', file:'art/ui/logo-briscola.png', mark:'briscola', accent:PALETTE.aBriscola,
    mono:'BR', name:'Briscola',
    brief:'a face-down deck squared on felt with one blank card laid crosswise underneath it as the trump' },
  'logo-sette': { kind:'emblem', file:'art/ui/logo-sette.png', mark:'sette', accent:PALETTE.aSette,
    mono:'SM', name:'Sette e Mezzo',
    brief:'two blank playing cards with a worn gold coin resting on top of them, small stack of coins behind' },
  'logo-cheat': { kind:'emblem', file:'art/ui/logo-cheat.png', mark:'cheat', accent:PALETTE.aCheat,
    mono:'GD', name:'Il-Gidba',
    brief:'a black domino mask lying across a face-down playing card, one card being slipped underneath the pile' },

  /* ── objects ────────────────────────────────────────────────── */
  /* The coin obverse is minted with a BLANK middle on purpose so
     art/ui/emblem.png composites into it (docs/RUNPOD_PARTY.md §1b).
     Until it exists the coin is struck entirely in CSS and the cross
     is the vector mark — the same shape the png will carry. */
  'coin-face': { kind:'object', file:'art/ui/coin-face.png', mark:'coin', accent:PALETTE.gold,
    name:'Coin, obverse',
    brief:'worn gold coin face on, rim ringed with tiny Maltese crosses, centre a smooth BLANK disc, no design in the middle' },
  'coin-back': { kind:'object', file:'art/ui/coin-back.png', mark:'luzzu', accent:PALETTE.gold,
    name:'Coin, reverse',
    brief:'worn gold coin face on, a luzzu with the painted eye on its prow in relief, laurel wreath inside the rim' },
  'cardback': { kind:'object', file:'art/ui/cardback.jpg', mark:'karti', accent:PALETTE.neon,
    name:'KARTI card back',
    brief:'card back pattern: deep indigo field, fine gold diagonal lattice, a gold Maltese cross medallion centred, double gold rule inset' },
  'cardback-klabb': { kind:'object', file:'art/ui/cardback-klabb.png', mark:'karti', accent:PALETTE.hot,
    name:'Playing-card back',
    brief:'card back pattern: deep red field, fine cream diagonal lattice, a cream Maltese cross medallion centred' },

  /* ── surfaces ───────────────────────────────────────────────── */
  /* All six ship complete without a file. The future png is a small
     SEAMLESS TILE laid over the gradient at low opacity, never a
     full-bleed photograph — a tile is 30 KB and never crops wrong. */
  'tex-felt': { kind:'surface', file:'art/ui/tex-felt.png', surface:'felt',
    name:'Card-table felt',
    brief:'seamless tiling texture, fine woven billiard felt, dark green, flat even lighting, no objects' },
  'tex-limestone': { kind:'surface', file:'art/ui/tex-limestone.png', surface:'limestone',
    name:'Maltese limestone',
    brief:'seamless tiling texture, honey-coloured Maltese globigerina limestone block face, shallow tool marks, flat even lighting' },
  'tex-wood': { kind:'surface', file:'art/ui/tex-wood.png', surface:'wood',
    name:'Worn bar wood',
    brief:'seamless tiling texture, worn dark bar-top wood grain, ring stains, flat even lighting, no objects' },
  'tex-night': { kind:'surface', file:'art/ui/tex-night.png', surface:'night',
    name:'Festa night sky',
    brief:'seamless tiling texture, deep indigo night sky with faint stars and a little firework smoke, no ground, no buildings' },
  'tex-paper': { kind:'surface', file:'art/ui/tex-paper.png', surface:'paper',
    name:'Deed parchment',
    brief:'seamless tiling texture, aged cream paper, soft fibre grain, faint foxing, flat even lighting, no writing' },
  'tex-bar': { kind:'surface', file:'art/ui/tex-bar.png', surface:'bar',
    name:'Kazin table top',
    brief:'seamless tiling texture, scratched dark varnished club table top, warm overhead light pool, no objects' },

  /* ── shapes: vector forever ─────────────────────────────────── */
  'token': { kind:'shape', mark:'token', name:'Player token',
    note:'A pawn silhouette in the seat colour. Never generated: it is tinted per player at runtime.' },
  'avatar': { kind:'shape', name:'Player avatar',
    note:'Monogram in the accent medallion. Optional future file art/ui/avatar-<n>.png per preset.',
    file:'art/ui/avatar-1.png' },
  'tile-deed': { kind:'shape', name:'Property tile',
    note:'Limestone tile with a group colour band. The BAND is data, so this can never be an image.' },
  'crown': { kind:'shape', mark:'crown', name:'King / penthouse marker' },
  'house': { kind:'shape', mark:'house', name:'Built floor marker' }
};

/* friendly aliases, so a game can ask for 'chess' rather than 'logo-chess' */
var ALIAS = {
  karti:'emblem', party:'logo-party', chess:'logo-chess', dama:'logo-dama',
  skarta:'logo-skarta', kiri:'logo-kiri', klabb:'logo-klabb', bixkla:'logo-bixkla',
  briscola:'logo-briscola', sette:'logo-sette', cheat:'logo-cheat',
  coin:'coin-face', 'cards-solo':'emblem', 'cards-mp':'emblem', 'cards-story':'emblem'
};
function resolve(id){ return ALIAS[id] || id; }

/* ═══════════════════════════════════════════════════════════════════
   3. THE SPRITE
   Private, appended to <body>, never touching #karti-sprite — that
   one belongs to index.html and two other modules already append to
   it. Same 24x24 grid and same currentColor rule, so a ka- mark and
   an i- icon can sit side by side in the same line of text.
   ═══════════════════════════════════════════════════════════════════ */
var spriteDone = false;
function injectSprite(){
  if (spriteDone || document.getElementById('ka-sprite')){ spriteDone = true; return; }
  if (!document.body) return;
  spriteDone = true;
  var ns = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('id', 'ka-sprite');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  var s = '', k;
  for (k in MARKS)
    if (Object.prototype.hasOwnProperty.call(MARKS, k))
      s += '<symbol id="ka-m-' + k + '" viewBox="0 0 24 24">' + MARKS[k] + '</symbol>';
  /* the coin rim: twelve tiny crosses struck round the edge. Built in
     a loop rather than typed out, and only once for the whole app. */
  var rim = '', i, a, x, y;
  for (i = 0; i < 12; i++){
    a = i * Math.PI / 6 - Math.PI / 2;
    x = (12 + Math.cos(a) * 9.5).toFixed(2);
    y = (12 + Math.sin(a) * 9.5).toFixed(2);
    rim += crossArms(1.55, x, y);
  }
  s += '<symbol id="ka-m-coinrim" viewBox="0 0 24 24">' + rim + '</symbol>';
  svg.innerHTML = s;
  document.body.appendChild(svg);
}

function mark(name, cls){
  if (!MARKS[name] && name !== 'coinrim') return '';
  return '<svg class="ka-g' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" ' +
         'aria-hidden="true" focusable="false"><use href="#ka-m-' + name + '"></use></svg>';
}

/* ═══════════════════════════════════════════════════════════════════
   4. THE STYLESHEET
   Injected from here (the js/mp.js pattern) so this file owns its own
   look and nothing has to be added to css/extra.css. Scoped by the
   `ka-` prefix rather than by a screen id, because the kit is used on
   every screen there is.
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS(){
  if (document.getElementById('ka-runtime-css')) return;
  if (!document.head) return;
  var st = document.createElement('style');
  st.id = 'ka-runtime-css';
  st.textContent =

    /* ── the shared frame ──────────────────────────────────────────
       Everything in the kit that is a "thing in a box" uses this, at
       the same radius ratio, so a chess emblem and a KIRI tile and a
       player avatar are visibly the same object family.
       No transform anywhere: this is often near the fixed tab bar. */
    '.ka{--ka-size:48px;--ka-ax:' + PALETTE.gold + ';--ka-ink:' + PALETTE.ink + ';' +
      'position:relative;display:inline-grid;place-items:center;flex:0 0 auto;' +
      'width:var(--ka-size);height:var(--ka-size);overflow:hidden;' +
      'border-radius:calc(var(--ka-size) * .27);' +
      'font-family:var(--disp),"Arial Black",system-ui,sans-serif;' +
      '-webkit-user-select:none;user-select:none}' +

    /* the medallion: warm key light upper-left, paper grain, accent
       wash, engraved edge. Four gradients and a box-shadow — no
       filter, no image, no repaint cost worth measuring. */
    '.ka-emblem,.ka-avatar{' +
      'background-image:' +
        'radial-gradient(115% 115% at 26% 16%,rgba(255,238,200,.22),rgba(255,238,200,0) 56%),' +
        'repeating-linear-gradient(135deg,rgba(255,255,255,.035) 0 1px,rgba(255,255,255,0) 1px 3px),' +
        'linear-gradient(158deg,color-mix(in srgb,var(--ka-ax) 36%,#150F26),#140E24 76%);' +
      'border:1px solid color-mix(in srgb,var(--ka-ax) 42%,transparent);' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.13),' +
        'inset 0 calc(var(--ka-size) * -.14) calc(var(--ka-size) * .2) ' +
          'calc(var(--ka-size) * -.14) rgba(0,0,0,.72),' +
        '0 2px 0 -1px rgba(0,0,0,.5),0 6px 14px rgba(0,0,0,.4)}' +
    /* color-mix is young. Without it the medallion falls back to the
       flat panel colour, which still reads as a finished tile. */
    '@supports not (background:color-mix(in srgb,red 50%,blue)){' +
      '.ka-emblem,.ka-avatar{background-image:' +
        'radial-gradient(115% 115% at 26% 16%,rgba(255,238,200,.2),rgba(255,238,200,0) 56%),' +
        'linear-gradient(158deg,#2A1F46,#140E24 76%);border-color:rgba(255,255,255,.18)}}' +

    /* THE INK OUTLINE — the one thing that makes the whole set a set.
       paint-order:stroke fill draws the stroke first and the fill over
       it, so the outline sits OUTSIDE the silhouette instead of eating
       half of it. Same trick js/party.js uses for the chess pieces. */
    '.ka-g{display:block;width:100%;height:100%;fill:currentColor;' +
      'stroke:var(--ka-ink);stroke-width:1.5;stroke-linejoin:round;' +
      'paint-order:stroke fill;overflow:visible}' +
    '.ka-fig{position:relative;z-index:1;display:block;line-height:0;color:var(--ka-ax);' +
      'width:calc(var(--ka-size) * .62);height:calc(var(--ka-size) * .62)}' +
    /* thinner ink on the small sizes, or the mark closes up */
    '.ka[data-sm="1"] .ka-g{stroke-width:1}' +

    /* a mark on its own, no medallion: for a board cell, a rail, a
       button — the same silhouette and the same ink, nothing round it */
    '.ka-bare{background:none;border:0;box-shadow:none;overflow:visible;' +
      'border-radius:0;color:var(--ka-ax)}' +
    '.ka-bare .ka-fig{width:100%;height:100%}' +

    /* the two-letter tag, for when several rows share one emblem */
    /* the tag eats the bottom sixth of the frame, so the mark moves up
       out of it rather than being sliced in half by it */
    '.ka.has-mono .ka-fig{margin-bottom:calc(var(--ka-size) * .15);' +
      'width:calc(var(--ka-size) * .56);height:calc(var(--ka-size) * .56)}' +
    '.ka-mono{position:absolute;left:0;right:0;bottom:0;z-index:3;padding:1px 0 2px;' +
      'text-align:center;font-weight:900;line-height:1.2;' +
      'font-size:calc(var(--ka-size) * .17);letter-spacing:.13em;color:#FFF0C8;' +
      'background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.72) 60%)}' +

    /* ── the upgrade layer ─────────────────────────────────────────
       Never in the document until the file has decoded. `.ok` is set
       one frame later so the fade actually runs. */
    '.ka-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:2;' +
      'opacity:0;transition:opacity .25s var(--ease,ease)}' +
    '.ka-img.ok{opacity:1}' +
    /* once the picture is up, the drawn version underneath is dead
       weight — but it stays in the DOM so a cache eviction mid-session
       cannot leave an empty box. */
    '.ka.has-art .ka-fig,.ka.has-art .ka-cb-mark,.ka.has-art .ka-coin-rim{opacity:0}' +

    /* ── the coin ──────────────────────────────────────────────────
       Struck, not drawn: a radial gold body, a ring of tiny crosses
       round the rim, and a raised middle that holds either a letter
       or the KARTI emblem. That middle is deliberately empty in the
       generated obverse too, so the same composite works either way. */
    '.ka-coin{border-radius:50%;' +
      'background:radial-gradient(circle at 33% 26%,#FFF0C4,#FFC542 40%,#B07E12 76%,#6E4B06);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.38),' +
        'inset 0 calc(var(--ka-size) * -.1) calc(var(--ka-size) * .16) rgba(93,60,0,.5),' +
        '0 2px 0 -1px rgba(0,0,0,.55),0 6px 14px rgba(0,0,0,.45)}' +
    '.ka-coin-rim{position:absolute;inset:0;z-index:1;display:block;line-height:0;' +
      'color:rgba(120,78,4,.55)}' +
    '.ka-coin-rim .ka-g{stroke:none;stroke-width:0}' +
    '.ka-coin-mid{position:absolute;left:22%;top:22%;width:56%;height:56%;z-index:3;' +
      'border-radius:50%;display:grid;place-items:center;overflow:hidden;' +
      'background:radial-gradient(circle at 36% 30%,#FFE7A8,#E6AE2C 66%,#C08D14);' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 1px 2px rgba(93,60,0,.5)}' +
    '.ka-coin-ch{font-weight:900;line-height:1;color:#6B4700;' +
      'font-size:calc(var(--ka-size) * .34);text-shadow:0 1px 0 rgba(255,255,255,.45)}' +
    '.ka-coin-mid .ka-fig{width:74%;height:74%;color:#8A5C00}' +
    '.ka-coin-mid .ka-g{stroke:rgba(90,58,0,.55);stroke-width:.9}' +
    /* the emblem composited into the blank middle of the real coin */
    '.ka-coin-emb{position:absolute;inset:12%;width:76%;height:76%;object-fit:contain;' +
      'border-radius:50%;z-index:4;opacity:0;transition:opacity .25s var(--ease,ease)}' +
    '.ka-coin-emb.ok{opacity:1}' +
    '.ka-coin-emb.ok~.ka-coin-mid .ka-coin-ch,.ka-coin-emb.ok~.ka-coin-mid .ka-fig{opacity:0}' +
    '.ka-coin.has-art .ka-coin-mid{background:none;box-shadow:none}' +

    /* ── the card back ─────────────────────────────────────────────
       A lattice made of two crossed repeating gradients, a double
       rule inset from the edge, and the cross medallion in the middle.
       Aspect-ratio, so a caller sets one number and gets a card. */
    '.ka-cardback{--ka-size:74px;width:var(--ka-size);height:auto;aspect-ratio:5/7;' +
      'border-radius:calc(var(--ka-size) * .09);' +
      'background-color:#241247;' +
      'background-image:' +
        'repeating-linear-gradient(45deg,rgba(255,217,138,.16) 0 1px,rgba(255,217,138,0) 1px 7px),' +
        'repeating-linear-gradient(-45deg,rgba(255,217,138,.16) 0 1px,rgba(255,217,138,0) 1px 7px),' +
        'radial-gradient(110% 80% at 50% 12%,#3A1F6B,#1A0E33 78%);' +
      'border:1px solid rgba(0,0,0,.55);' +
      'box-shadow:inset 0 0 0 1px rgba(255,217,138,.14),0 3px 8px rgba(0,0,0,.5)}' +
    '.ka-cardback.red{background-color:#59101F;' +
      'background-image:' +
        'repeating-linear-gradient(45deg,rgba(255,236,208,.15) 0 1px,rgba(255,236,208,0) 1px 7px),' +
        'repeating-linear-gradient(-45deg,rgba(255,236,208,.15) 0 1px,rgba(255,236,208,0) 1px 7px),' +
        'radial-gradient(110% 80% at 50% 12%,#8E1A2E,#3F0A16 78%)}' +
    '.ka-cb-rule{position:absolute;inset:7%;z-index:1;border-radius:calc(var(--ka-size) * .05);' +
      'border:1px solid rgba(255,217,138,.5);' +
      'box-shadow:inset 0 0 0 2px rgba(0,0,0,.25),inset 0 0 0 3px rgba(255,217,138,.22)}' +
    '.ka-cardback.red .ka-cb-rule{border-color:rgba(255,236,208,.5);' +
      'box-shadow:inset 0 0 0 2px rgba(0,0,0,.25),inset 0 0 0 3px rgba(255,236,208,.22)}' +
    '.ka-cb-mark{position:relative;z-index:1;display:block;line-height:0;' +
      'width:46%;height:46%;color:#FFD98A}' +
    '.ka-cardback.red .ka-cb-mark{color:#FFECD0}' +
    '.ka-cb-mark .ka-g{stroke:rgba(0,0,0,.45);stroke-width:.9}' +

    /* ── the property tile ─────────────────────────────────────────
       Limestone, because IL-KIRI is about Maltese buildings and the
       whole board should feel cut out of the same rock. The colour
       band is DATA (which group the square is in), which is exactly
       why this can never be a generated image. */
    '.ka-tile{--ka-size:64px;width:var(--ka-size);height:calc(var(--ka-size) * 1.28);' +
      'border-radius:calc(var(--ka-size) * .12);' +
      'display:flex;flex-direction:column;align-items:center;justify-content:flex-start;' +
      'padding:0;color:#4A3316;' +
      'background-image:' +
        'radial-gradient(120% 90% at 24% 10%,rgba(255,255,255,.5),rgba(255,255,255,0) 62%),' +
        'repeating-linear-gradient(0deg,rgba(120,88,40,.09) 0 1px,rgba(120,88,40,0) 1px 11px),' +
        'linear-gradient(168deg,#EFE0BC,#CDB388 100%);' +
      'border:1px solid rgba(90,64,24,.45);' +
      'box-shadow:inset 0 -3px 6px rgba(120,88,40,.28),0 3px 7px rgba(0,0,0,.42)}' +
    '.ka-tile-band{flex:0 0 auto;width:100%;height:26%;' +
      'background:linear-gradient(180deg,color-mix(in srgb,var(--ka-ax) 88%,white),var(--ka-ax));' +
      'box-shadow:inset 0 -1px 0 rgba(0,0,0,.35)}' +
    '@supports not (background:color-mix(in srgb,red 50%,blue)){' +
      '.ka-tile-band{background:var(--ka-ax)}}' +
    '.ka-tile .ka-fig{width:38%;height:38%;margin-top:7%;color:#6B4A18}' +
    '.ka-tile .ka-g{stroke:rgba(74,51,22,.5);stroke-width:1}' +
    /* a Maltese place name is long ("Cirkewwa", "Marsaxlokk") and the
       tile is 62px wide, so the caption wraps to two lines and clamps
       rather than running off the stone */
    '.ka-tile-cap{margin-top:auto;width:100%;padding:0 5% 6%;font-weight:900;line-height:1.1;' +
      'font-size:calc(var(--ka-size) * .15);letter-spacing:.02em;text-align:center;' +
      'color:#4A3316;text-transform:uppercase;overflow:hidden;overflow-wrap:anywhere;' +
      'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}' +

    /* ── the token ─────────────────────────────────────────────────
       A pawn in the seat colour on a dark disc, so four of them read
       apart on a busy board. Vector forever. */
    '.ka-token{--ka-size:26px;border-radius:50%;' +
      'background:radial-gradient(circle at 34% 26%,rgba(255,255,255,.28),rgba(0,0,0,.34) 72%),' +
        'var(--ka-ax);' +
      'box-shadow:inset 0 0 0 1px rgba(0,0,0,.4),0 1px 3px rgba(0,0,0,.55)}' +
    '.ka-token .ka-fig{width:70%;height:70%;color:rgba(0,0,0,.62)}' +
    '.ka-token .ka-g{stroke:rgba(255,255,255,.45);stroke-width:.9}' +

    /* ── the avatar ────────────────────────────────────────────────
       The same medallion as an emblem, with a monogram instead of a
       mark, so "a person" and "a game" are obviously the same system. */
    '.ka-av-ch{position:relative;z-index:1;font-weight:900;line-height:1;' +
      'font-size:calc(var(--ka-size) * .42);letter-spacing:.02em;color:#FFF2D2;' +
      'text-shadow:0 1px 0 rgba(0,0,0,.55)}' +

    /* ── surfaces ──────────────────────────────────────────────────
       Materials, not pictures. Each one is a base colour, one warm
       key light and one cheap repeating pattern; each also reads a
       --ka-tex-* custom property that stays `none` until the optional
       seamless tile is probed and found. Nothing 404s in the meantime. */
    ':root{--ka-tex-felt:none;--ka-tex-limestone:none;--ka-tex-wood:none;' +
      '--ka-tex-night:none;--ka-tex-paper:none;--ka-tex-bar:none}' +

    /* felt: a real weave is a crosshatch, so it is two 2px repeats at
       right angles — one light, one dark — over a lit-from-above body.
       At 2px the pair reads as nap rather than as stripes. */
    '.ka-s-felt{background-color:' + PALETTE.felt + ';background-image:var(--ka-tex-felt),' +
      'repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0 1px,rgba(255,255,255,0) 1px 2px),' +
      'repeating-linear-gradient(0deg,rgba(0,0,0,.11) 0 1px,rgba(0,0,0,0) 1px 2px),' +
      'radial-gradient(125% 88% at 50% 4%,#26744F 0%,' + PALETTE.feltLit + ' 26%,' +
        PALETTE.felt + ' 62%,#071A11 100%)}' +

    /* limestone: courses across, joints down, and the joints on a much
       longer period than the courses so the eye reads blocks rather
       than graph paper. Both are the same warm brown at low alpha,
       because a grey joint in honey stone looks like dirt. */
    '.ka-s-limestone{background-color:' + PALETTE.stone + ';background-image:var(--ka-tex-limestone),' +
      'repeating-linear-gradient(0deg,rgba(126,92,38,.26) 0 1px,rgba(126,92,38,.07) 1px 2px,' +
        'rgba(126,92,38,0) 2px 21px),' +
      'repeating-linear-gradient(90deg,rgba(126,92,38,.16) 0 1px,rgba(126,92,38,0) 1px 37px),' +
      'repeating-linear-gradient(118deg,rgba(126,92,38,.05) 0 1px,rgba(126,92,38,0) 1px 4px),' +
      'radial-gradient(115% 84% at 26% 6%,#FCF2DA 0%,#F0E1BE 34%,' + PALETTE.stone + ' 62%,' +
        PALETTE.stoneDark + ' 100%)}' +

    '.ka-s-wood{background-color:' + PALETTE.wood + ';background-image:var(--ka-tex-wood),' +
      'repeating-linear-gradient(92deg,rgba(0,0,0,.13) 0 2px,rgba(0,0,0,0) 2px 5px,' +
        'rgba(255,255,255,.045) 5px 6px,rgba(0,0,0,0) 6px 13px),' +
      'radial-gradient(120% 85% at 30% 8%,#8A5A2E 0%,' + PALETTE.wood + ' 52%,' + PALETTE.woodDark + ' 100%)}' +

    /* the stars are eight fixed radial dots, not an image and not a
       loop — enough to read as sky, cheap enough to paint on a phone */
    '.ka-s-night{background-color:' + PALETTE.night + ';background-image:var(--ka-tex-night),' +
      'radial-gradient(1.4px 1.4px at 18% 22%,rgba(255,245,214,.9),rgba(255,245,214,0)),' +
      'radial-gradient(1.2px 1.2px at 74% 14%,rgba(255,245,214,.75),rgba(255,245,214,0)),' +
      'radial-gradient(1.6px 1.6px at 46% 36%,rgba(255,245,214,.8),rgba(255,245,214,0)),' +
      'radial-gradient(1.2px 1.2px at 88% 44%,rgba(255,245,214,.7),rgba(255,245,214,0)),' +
      'radial-gradient(1.3px 1.3px at 32% 62%,rgba(255,245,214,.6),rgba(255,245,214,0)),' +
      'radial-gradient(1.1px 1.1px at 62% 74%,rgba(255,245,214,.55),rgba(255,245,214,0)),' +
      'radial-gradient(90% 60% at 50% 108%,rgba(232,69,44,.4),rgba(232,69,44,0) 70%),' +
      'linear-gradient(180deg,#0D0722 0%,' + PALETTE.night + ' 58%,#2A1550 100%)}' +

    '.ka-s-paper{background-color:' + PALETTE.paper + ';background-image:var(--ka-tex-paper),' +
      'repeating-linear-gradient(118deg,rgba(150,116,58,.05) 0 1px,rgba(150,116,58,0) 1px 4px),' +
      'radial-gradient(120% 90% at 22% 6%,#FBF3DE 0%,' + PALETTE.paper + ' 55%,#DCC79A 100%)}' +

    '.ka-s-bar{background-color:#2A1B10;background-image:var(--ka-tex-bar),' +
      'repeating-linear-gradient(92deg,rgba(0,0,0,.16) 0 2px,rgba(0,0,0,0) 2px 7px),' +
      'radial-gradient(70% 46% at 50% 0%,rgba(255,205,120,.24),rgba(255,205,120,0) 72%),' +
      'linear-gradient(180deg,#3B2617 0%,#2A1B10 55%,#160D07 100%)}' +

    /* every surface gets the same edge treatment, so a felt table and
       a limestone board are obviously two cuts of one system */
    '.ka-s-felt,.ka-s-limestone,.ka-s-wood,.ka-s-night,.ka-s-paper,.ka-s-bar{' +
      'background-size:cover;background-position:center;background-repeat:repeat;' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.08),inset 0 -14px 26px rgba(0,0,0,.3)}' +

    /* ── rows and rails ────────────────────────────────────────────
       The one composite the kit ships: emblem + name + sub, which is
       the shape every game-select list in this app already wants. */
    '.ka-row{display:flex;align-items:center;gap:11px;min-width:0}' +
    '.ka-row-t{min-width:0;flex:1}' +
    '.ka-row-t b{display:block;font-family:var(--disp),"Arial Black",sans-serif;font-weight:900;' +
      'font-size:' + SCALE.small + ';letter-spacing:.06em;text-transform:uppercase;color:var(--txt,#F4EFFF);' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.ka-row-t i{display:block;font-style:normal;margin-top:2px;font-size:' + SCALE.body + ';' +
      'line-height:1.35;color:var(--dim,#A093C4);' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}';

  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   5. PROBE, THEN MOUNT
   ═══════════════════════════════════════════════════════════════════ */
var state = {};        /* slot -> 'ok' | 'no' | 'try' */

function probe(slot){
  var def = SLOTS[slot];
  if (!def || !def.file || state[slot]) return;
  state[slot] = 'try';
  var im = new Image();
  im.onload = function(){
    if (!im.naturalWidth){ state[slot] = 'no'; return; }
    state[slot] = 'ok';
    if (def.kind === 'surface' && def.surface) applyTexture(def);
    else mountAll(slot);
  };
  im.onerror = function(){ state[slot] = 'no'; };
  im.decoding = 'async';
  im.src = def.file;
}

/* a probed texture becomes a custom property, exactly the way
   js/game.js turns art/ui/board.jpg into --art-playmat. Absolute,
   because a relative url() inside a custom property resolves against
   the stylesheet that USES it, not the document. */
function applyTexture(def){
  try {
    var abs = new URL(def.file, location.href).href;
    document.documentElement.style.setProperty('--ka-tex-' + def.surface,
      'url("' + abs + '")');
  } catch (e){}
}

function imgFor(slot){
  var def = SLOTS[slot];
  var im = document.createElement('img');
  im.className = 'ka-img';
  im.alt = '';
  im.setAttribute('aria-hidden', 'true');
  im.decoding = 'async';
  im.src = def.file;
  return im;
}

/* put the picture into every host that is asking for this slot and
   has not been given one yet. Cheap: it only ever runs once per slot. */
function mountAll(slot){
  var hosts, i, host, im;
  try { hosts = document.querySelectorAll('.ka[data-slot="' + slot + '"]:not(.has-art)'); }
  catch (e){ return; }
  for (i = 0; i < hosts.length; i++){
    host = hosts[i];
    im = imgFor(slot);
    host.appendChild(im);
    host.classList.add('has-art');
    /* one frame later, so the transition actually has two values */
    (function(el){ requestAnimationFrame(function(){ el.classList.add('ok'); }); })(im);
  }
  /* the coin composites the emblem into its blank middle */
  if (slot === 'emblem' || slot === 'coin-face') mountCoinEmblems();
}

/* The obverse is minted with a blank middle so our own emblem can be
   composited into it. Two coins must NOT get it: the reverse (which
   carries the luzzu, not the crest) and any coin the caller has put a
   letter in — a player's initial is the point of that coin, and
   burying it under the crest turns four players into four identical
   discs. Hence the selector is deliberately narrow. */
function mountCoinEmblems(){
  /* BOTH files have to be there. The blank centre only exists on the
     generated obverse — dropping a square emblem into the middle of
     the CSS coin puts a picture with its own background on top of a
     struck disc, which looks like a sticker. Until coin-face.png
     lands, the coin's crest is the vector cross it is struck with. */
  if (state['emblem'] !== 'ok' || state['coin-face'] !== 'ok') return;
  var hosts, i, host, im;
  try { hosts = document.querySelectorAll('.ka-coin[data-slot="coin-face"][data-crest="1"]:not([data-emb])'); }
  catch (e){ return; }
  for (i = 0; i < hosts.length; i++){
    host = hosts[i];
    host.setAttribute('data-emb', '1');
    im = document.createElement('img');
    im.className = 'ka-coin-emb';
    im.alt = '';
    im.setAttribute('aria-hidden', 'true');
    im.decoding = 'async';
    im.src = SLOTS['emblem'].file;
    host.insertBefore(im, host.firstChild);
    (function(el){ requestAnimationFrame(function(){ el.classList.add('ok'); }); })(im);
  }
}

/* Anything built as an HTML string has to say so once it is in the
   DOM. This is the whole of the wiring contract: KARTI_ART.wire(root). */
function wire(root){
  injectSprite();
  var hosts, i, host, slot;
  try { hosts = (root || document).querySelectorAll('.ka[data-slot]'); }
  catch (e){ return; }
  for (i = 0; i < hosts.length; i++){
    host = hosts[i];
    slot = host.getAttribute('data-slot');
    if (!SLOTS[slot]) continue;
    if (state[slot] === 'ok' && !host.classList.contains('has-art')){
      host.appendChild(imgFor(slot));
      host.classList.add('has-art');
      host.lastChild.classList.add('ok');
    } else if (!state[slot]) probe(slot);
  }
  if (state['emblem'] === 'ok') mountCoinEmblems();
}

/* A probe that failed is retried when the network comes back, or when
   the app is restored from the back/forward cache — a first launch
   made offline would otherwise never see the art pack at all. CAPPED,
   and deliberately not wired to a bare pageshow: an uncapped re-arm on
   every pageshow means the phone re-requests thirty missing files on
   every single navigation, which is exactly the cost this file exists
   to avoid. Four goes is plenty; the next cold start gets four more. */
var tries = {};
var REARM_MAX = 4;
function rearm(){
  var k;
  for (k in SLOTS)
    if (Object.prototype.hasOwnProperty.call(SLOTS, k) && state[k] === 'no'){
      tries[k] = (tries[k] || 0) + 1;
      if (tries[k] > REARM_MAX) continue;
      state[k] = 0;
      probe(k);
    }
}

/* ═══════════════════════════════════════════════════════════════════
   6. BUILDING THE THINGS
   Two ways in, deliberately:
     html(id, o)  a string, for the modules that build innerHTML — then
                  call wire(root) once after inserting it;
     el(id, o)    a live element, already wired.
   ═══════════════════════════════════════════════════════════════════ */
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
  });
}

function open(cls, slot, o, extra){
  var st = '--ka-size:' + (o.size || 48) + 'px';
  if (o.accent) st += ';--ka-ax:' + o.accent;
  if (o.ink) st += ';--ka-ink:' + o.ink;
  if (o.style) st += ';' + o.style;
  return '<span class="ka ' + cls + (o.cls ? ' ' + esc(o.cls) : '') + '"' +
    (slot ? ' data-slot="' + esc(slot) + '"' : '') +
    ((o.size || 48) < 30 ? ' data-sm="1"' : '') +
    (extra || '') +
    ' style="' + esc(st) + '"' +
    (o.label ? ' role="img" aria-label="' + esc(o.label) + '"' : ' aria-hidden="true"') + '>';
}

function html(id, opts){
  injectSprite();
  injectCSS();
  var slot = resolve(id), def = SLOTS[slot], o = opts || {};
  if (!def) return '';
  if (!state[slot]) probe(slot);

  var accent = o.accent || def.accent || PALETTE.gold;
  var oo = { size:o.size, accent:accent, ink:o.ink, cls:o.cls, style:o.style, label:o.label };

  /* ── coin ── */
  if (slot === 'coin-face' || slot === 'coin-back'){
    oo.size = o.size || 62;
    var crest = (slot === 'coin-face' && (o.text == null || o.text === ''));
    if (crest) probe('emblem');
    return open('ka-coin', slot, oo, crest ? ' data-crest="1"' : '') +
      '<span class="ka-coin-rim">' + mark('coinrim') + '</span>' +
      '<span class="ka-coin-mid">' +
        (o.text != null && o.text !== ''
          ? '<span class="ka-coin-ch">' + esc(o.text) + '</span>'
          : '<span class="ka-fig">' + mark(def.mark) + '</span>') +
      '</span></span>';
  }

  /* ── card back ── */
  if (slot === 'cardback' || slot === 'cardback-klabb'){
    oo.size = o.size || 74;
    oo.cls = (oo.cls ? oo.cls + ' ' : '') + (slot === 'cardback-klabb' ? 'red' : '');
    return open('ka-cardback', slot, oo) +
      '<span class="ka-cb-rule"></span>' +
      '<span class="ka-cb-mark">' + mark('karti') + '</span>' +
      '</span>';
  }

  /* ── property tile ── */
  if (slot === 'tile-deed'){
    oo.size = o.size || 64;
    return open('ka-tile', null, oo) +
      '<span class="ka-tile-band"></span>' +
      (o.mark ? '<span class="ka-fig">' + mark(o.mark) + '</span>' : '') +
      (o.text ? '<span class="ka-tile-cap">' + esc(o.text) + '</span>' : '') +
      '</span>';
  }

  /* ── token ── */
  if (slot === 'token'){
    oo.size = o.size || 26;
    return open('ka-token', null, oo) +
      '<span class="ka-fig">' + mark(o.mark || 'token') + '</span></span>';
  }

  /* ── avatar ── */
  if (slot === 'avatar'){
    oo.size = o.size || 38;
    return open('ka-avatar', null, oo) +
      '<span class="ka-av-ch">' + esc(String(o.text || '?').slice(0, 2).toUpperCase()) + '</span>' +
      '</span>';
  }

  /* ── bare marks: crown, house ── */
  if (def.kind === 'shape' && def.mark && !SLOTS[slot].file){
    oo.size = o.size || 24;
    return open('ka-bare', null, oo) +
      '<span class="ka-fig">' + mark(def.mark) + '</span></span>';
  }

  /* ── emblem (the default) ── */
  oo.size = o.size || 48;
  if (o.mono && def.mono) oo.cls = (oo.cls ? oo.cls + ' ' : '') + 'has-mono';
  return open('ka-emblem', slot, oo) +
    '<span class="ka-fig">' + mark(def.mark) + '</span>' +
    (o.mono && def.mono ? '<span class="ka-mono">' + esc(def.mono) + '</span>' : '') +
    '</span>';
}

function el(id, opts){
  var wrap = document.createElement('span');
  wrap.innerHTML = html(id, opts);
  var node = wrap.firstChild;
  if (node) wire(wrap);
  return node;
}

/* a whole row: emblem, name, one line under it */
function row(id, opts){
  var o = opts || {}, def = SLOTS[resolve(id)] || {};
  return '<span class="ka-row">' + html(id, o) +
    '<span class="ka-row-t"><b>' + esc(o.name || def.name || '') + '</b>' +
    (o.sub ? '<i>' + esc(o.sub) + '</i>' : '') + '</span></span>';
}

/* surfaces are a class, not an element — a caller paints its own box */
function surfaceClass(name){
  return SLOTS['tex-' + name] ? 'ka-s-' + name : '';
}
function paint(node, name){
  if (!node) return node;
  injectCSS();
  var c = surfaceClass(name);
  if (!c) return node;
  node.classList.add(c);
  probe('tex-' + name);
  return node;
}

/* ═══════════════════════════════════════════════════════════════════
   7. THE SURFACE OTHER MODULES SEE
   ═══════════════════════════════════════════════════════════════════ */
window.KARTI_ART = {
  /* build */
  html:html, el:el, row:row, wire:wire,
  /* materials */
  surface:surfaceClass, paint:paint,
  /* raw marks, for callers that want the glyph on its own (a board
     cell, a rail, a button) without the medallion round it */
  mark:function(name, cls){ injectSprite(); injectCSS(); return mark(name, cls); },
  marks:function(){ var a = [], k; for (k in MARKS) a.push(k); return a.sort(); },
  /* the registry, and what it knows */
  SLOTS:SLOTS, PALETTE:PALETTE, SCALE:SCALE,
  path:function(id){ var d = SLOTS[resolve(id)]; return d && d.file || null; },
  status:function(id){ return state[resolve(id)] || 'none'; },
  list:function(kind){
    var a = [], k;
    for (k in SLOTS)
      if (Object.prototype.hasOwnProperty.call(SLOTS, k) && (!kind || SLOTS[k].kind === kind)) a.push(k);
    return a;
  },
  /* housekeeping */
  css:injectCSS, sprite:injectSprite, rearm:rearm,
  version:1
};

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', function(){ injectSprite(); injectCSS(); });
else { injectSprite(); injectCSS(); }

window.addEventListener('online', rearm);
window.addEventListener('pageshow', function(e){ if (e && e.persisted) rearm(); });

})();
