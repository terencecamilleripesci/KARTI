/* ═══════════════════════════════════════════════════════════════════
   KARTI — deck-kit.js — THE ONE DECK (purely cosmetic, always)

   "For the card games they should have ONE theme, not each per set —
   it's too much. They all use the same playing cards. Just add more
   details."

   So: ONE card back and ONE table felt for EVERY card game, registered
   under game 'karti' — the same app-wide shelf the themes and scenes
   of build 205 live on — through the same KARTI_XP.register() pipeline,
   so ownership, levels, the store, the wardrobe and equipping all come
   for free. The per-game shelves that used to duplicate each other
   (five separate każin greens, four separate rozas…) are retired; this
   file also carries the MIGRATION that walks a player's old per-game
   choices and purchases over to the shared ones, once, idempotently.

   WHERE IT PAINTS — every card table in the box:
     · klabb's four games      #app #scr-party .kb-table   (bixkla,
                               briscola, sette, cheat — one selector,
                               because it is one deck now)
     · poker                   #app #scr-party .pk-table
     · rummy                   #app #scr-party .rm-table
     · gin                     #app #scr-party .gn-felt
     · skarta                  #app #scr-party .sk-wrap:not(.sk-art)
     · IL-KIRI's mid felt      #app #scr-kiri .kr-mid  (the old 'table'
                               slot — the shared felt tints its scrim)

   HOW A BACK IS PAINTED. The face-down card everywhere except SKARTA
   is klabb's shared SVG: a body rect, a rect filled from a <pattern>,
   the same rect stroked #FFD98A as the frame, and a Maltese-cross
   <use>. Patterns cannot be recoloured from CSS, so a hidden defs-only
   svg (#kdx-pats) holds one RICH pattern per back — guilloche waves,
   damask petals, herringbone, festa bunting, luzzu strakes — and three
   attribute-selector rules point fill/stroke at it. That is the "just
   add more details": the old shelves were all the same 45° lattice in
   different inks; these are actual patterns, distinct at thumbnail
   size. SKARTA draws its own CSS back, so each design also carries a
   small `sk` block restating itself in skarta's terms.

   HOW A FELT IS PAINTED. Each game keeps its own stock radial GEOMETRY
   (proven shapes, one per table) — only the three colour stops change,
   plus two hairline weave layers so the cloth reads as cloth and not
   as a gradient. Unequipped (or 'klassiku') = empty sheet = stock:
   every game keeps its own house colours.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

/* ── the felts ─────────────────────────────────────────────────────
   a/b/c: the three stops. ring: the accent used for IL-KIRI's inset
   ring and the preview's inner liner. sheen: an extra soft top light
   for the plush ones. klassiku carries no colours at all — it IS the
   stock look, so equipping it writes nothing. */
var FELTS = {
  'felt.klassiku':  {},
  'felt.kazin':     { a:'#2A7A50', b:'#175238', c:'#082A1B', ring:'#FFD98A' },
  'felt.bahar':     { a:'#2E6E9C', b:'#1B4568', c:'#0A2136', ring:'#A8D8F5' },
  /* the standing house rule: the feminine options are NEVER gated high */
  'felt.roza':      { a:'#F2B9CF', b:'#C97FA2', c:'#8A4E70', ring:'#FFE6F0', sheen:1 },
  'felt.lapsi':     { a:'#6FE3D6', b:'#1FA0B6', c:'#0A5C7C', ring:'#D8FFF6' },
  'felt.imbid':     { a:'#8A3348', b:'#551C2C', c:'#2A0D16', ring:'#F6C9CE' },
  'felt.vjola':     { a:'#5A3E8E', b:'#34205C', c:'#150C2E', ring:'#C4AEFF' },
  'felt.qahwa':     { a:'#8A6234', b:'#543A1E', c:'#29190C', ring:'#F0D9A0' },
  'felt.lejl':      { a:'#38405C', b:'#1B2130', c:'#0A0D16', ring:'#C9D2E4' },
  'felt.franka':    { a:'#D9C49A', b:'#B39868', c:'#7A5F33', ring:'#FFF3D8' },
  'felt.bellus':    { a:'#3A1E4E', b:'#22102F', c:'#0D0616', ring:'#E8C7FF', sheen:1 }
};

/* ── the backs ─────────────────────────────────────────────────────
   pat: the #kdx-pat-<pat> tile (drawn in pats() below). edge: the
   frame rect's stroke. cross: the Maltese cross. sk: the same design
   said in SKARTA's own words — bg (the whole back), ring (the tile
   inset), cap (glyph + caption), g2 (the dark the draw pile fakes its
   stack from). klassiku is the stock crimson: registered so the shelf
   has a first rung, applied as nothing at all. */
var BACKS = {
  'back.klassiku': { pat:'klassiku', stock:1, edge:'#FFD98A', cross:'#FFD98A',
    sk:null },
  'back.kazin':    { pat:'kazin',    edge:'#FFD98A', cross:'#FFD98A',
    sk:{ bg:'linear-gradient(150deg,#2E6B42,#0F2A18)', g2:'#0F2A18',
         ring:'rgba(255,217,138,.55)', cap:'#FFD98A' } },
  'back.bahar':    { pat:'bahar',    edge:'#BFE0F5', cross:'#BFE0F5',
    sk:{ bg:'linear-gradient(150deg,#2A5A8A,#0E2238)', g2:'#0E2238',
         ring:'rgba(168,216,240,.55)', cap:'#A8D8F0' } },
  'back.roza':     { pat:'roza',     edge:'#A84C77', cross:'#A84C77',
    sk:{ bg:'linear-gradient(150deg,#F0AECB,#B4638F)', g2:'#9A537B',
         ring:'rgba(255,255,255,.75)', cap:'#FFF0F7' } },
  'back.xugaman':  { pat:'xugaman',  edge:'#8E2E1C', cross:'#FFF6E4',
    sk:{ bg:'repeating-linear-gradient(150deg,#E8452C 0 9px,#F5E7C8 9px 15px,' +
            '#1B5F7A 15px 24px,#F5E7C8 24px 30px,#F2BE3D 30px 36px)',
         g2:'#1B5F7A', ring:'rgba(255,255,255,.78)', cap:'#FFF6E4' } },
  'back.linka':    { pat:'linka',    edge:'#C9D2E4', cross:'#C9D2E4',
    sk:{ bg:'linear-gradient(150deg,#33384A,#0E1018)', g2:'#0E1018',
         ring:'rgba(214,222,236,.5)', cap:'#D6DEEC' } },
  'back.luzzu':    { pat:'luzzu',    edge:'#FFF6E4', cross:'#FFF6E4',
    sk:{ bg:'repeating-linear-gradient(180deg,#155FA0 0 14px,#FFF6E4 14px 16px,' +
            '#F2B33D 16px 24px,#FFF6E4 24px 26px,#C4402A 26px 34px)',
         g2:'#123A5A', ring:'rgba(255,246,228,.7)', cap:'#FFF6E4' } },
  'back.gelat':    { pat:'gelat',    edge:'#A82843', cross:'#A82843',
    sk:{ bg:'linear-gradient(150deg,#F58BA4,#C2385A)', g2:'#A82843',
         ring:'rgba(255,232,240,.7)', cap:'#FFE8F0' } },
  'back.weraq':    { pat:'weraq',    edge:'#9FE8C4', cross:'#FFD98A',
    sk:{ bg:'linear-gradient(150deg,#1E5A42,#08281B)', g2:'#0A2E1E',
         ring:'rgba(159,232,196,.55)', cap:'#C9F2DD' } },
  'back.demm':     { pat:'demm',     edge:'#FFE9B0', cross:'#FFC542',
    sk:{ bg:'linear-gradient(150deg,#711B26,#2A070C)', g2:'#2A070C',
         ring:'rgba(255,197,66,.6)', cap:'#FFE9B0' } },
  'back.maskra':   { pat:'maskra',   edge:'#C4AEFF', cross:'#C4AEFF',
    sk:{ bg:'linear-gradient(150deg,#4A3178,#1A102E)', g2:'#1A102E',
         ring:'rgba(196,174,255,.55)', cap:'#D8CCFF' } },
  'back.hgieg':    { pat:'hgieg',    edge:'#A8F0E8', cross:'#A8F0E8',
    sk:{ bg:'linear-gradient(150deg,#1D6A72,#082A2E)', g2:'#082A2E',
         ring:'rgba(168,240,232,.55)', cap:'#C8F8F2' } },
  'back.zebbug':   { pat:'zebbug',   edge:'#F0D9A0', cross:'#F0D9A0',
    sk:{ bg:'linear-gradient(150deg,#55642C,#1C240E)', g2:'#1C240E',
         ring:'rgba(240,217,160,.6)', cap:'#F5E8C0' } },
  'back.ivorju':   { pat:'ivorju',   edge:'#7A5A22', cross:'#7A5A22',
    sk:{ bg:'linear-gradient(150deg,#EFE5CC,#C9B183)', g2:'#9C845A',
         ring:'rgba(122,90,34,.55)', cap:'#6E5222' } },
  'back.faham':    { pat:'faham',    edge:'#FFC542', cross:'#FFC542',
    sk:{ bg:'linear-gradient(150deg,#2A2E36,#0C0E12)', g2:'#0C0E12',
         ring:'rgba(255,197,66,.55)', cap:'#FFD979' } },
  'back.deheb':    { pat:'deheb',    edge:'#FFF7E4', cross:'#FFF7E4',
    sk:{ bg:'linear-gradient(150deg,#B8891F,#4E3608)', g2:'#4E3608',
         ring:'rgba(255,247,228,.75)', cap:'#FFF7E4' } }
};

/* ── the pattern tiles — the actual "more details" ────────────────
   Each is a small SVG tile; richer than the one stock lattice but
   still a handful of paths, so the payload stays text. */
var TILES = {
  /* the stock crimson lattice, restated so the klassiku preview can
     show the real thing (apply() never uses it) */
  klassiku:
    '<pattern id="kdx-pat-klassiku" width="10" height="10" ' +
    'patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="10" height="10" fill="#7E1226"/>' +
    '<path d="M0 0H10M0 5H10" stroke="#A6203A" stroke-width="2.4"/></pattern>',
  /* club green: the old lattice, but double-milled with a gold pinline
     and a stud where the rails cross */
  kazin:
    '<pattern id="kdx-pat-kazin" width="12" height="12" ' +
    'patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="12" height="12" fill="#14502F"/>' +
    '<path d="M0 0H12M0 6H12" stroke="#227E46" stroke-width="2.2"/>' +
    '<path d="M0 3H12M0 9H12" stroke="rgba(255,217,138,.45)" stroke-width=".7"/>' +
    '<circle cx="3" cy="6" r=".9" fill="#FFD98A" opacity=".8"/>' +
    '<circle cx="9" cy="0" r=".9" fill="#FFD98A" opacity=".8"/></pattern>',
  /* harbour guilloche: two interlaced waves and a stud, the engraving
     on the back of a banknote */
  bahar:
    '<pattern id="kdx-pat-bahar" width="16" height="16" patternUnits="userSpaceOnUse">' +
    '<rect width="16" height="16" fill="#123E63"/>' +
    '<path d="M0 8Q4 1 8 8T16 8" fill="none" stroke="#2E6E9C" stroke-width="1.3"/>' +
    '<path d="M0 8Q4 15 8 8T16 8" fill="none" stroke="#5FA8D8" stroke-width=".8"/>' +
    '<circle cx="8" cy="8" r="1" fill="rgba(191,224,245,.85)"/></pattern>',
  /* baby-pink damask: a petal drop and its echo, corner studs */
  roza:
    '<pattern id="kdx-pat-roza" width="14" height="14" patternUnits="userSpaceOnUse">' +
    '<rect width="14" height="14" fill="#F2C4D8"/>' +
    '<path d="M7 2C9.4 4.4 9.4 6.8 7 9C4.6 6.8 4.6 4.4 7 2Z" fill="#D98BB0" opacity=".8"/>' +
    '<path d="M7 9.6V12" stroke="#C2719C" stroke-width=".8"/>' +
    '<circle cx="0" cy="0" r="1" fill="#B45F8C"/>' +
    '<circle cx="14" cy="0" r="1" fill="#B45F8C"/>' +
    '<circle cx="0" cy="14" r="1" fill="#B45F8C"/>' +
    '<circle cx="14" cy="14" r="1" fill="#B45F8C"/></pattern>',
  /* festa bunting: candy stripes with white piping and a pennant row */
  xugaman:
    '<pattern id="kdx-pat-xugaman" width="18" height="18" patternUnits="userSpaceOnUse">' +
    '<rect width="18" height="18" fill="#F5E7C8"/>' +
    '<rect x="0" width="5" height="18" fill="#E8452C"/>' +
    '<rect x="9" width="5" height="18" fill="#1B5F7A"/>' +
    '<rect x="5" width="1" height="18" fill="#FFFDF6"/>' +
    '<rect x="14" width="1" height="18" fill="#FFFDF6"/>' +
    '<path d="M0 0H18V1.2H0Z" fill="#F2BE3D"/>' +
    '<path d="M2 1.2L4.5 1.2L3.25 4.4Z" fill="#F2BE3D"/>' +
    '<path d="M11 1.2L13.5 1.2L12.25 4.4Z" fill="#F2BE3D"/></pattern>',
  /* ink and silver: the fine engine-turned pinstripe of a notary's pen */
  linka:
    '<pattern id="kdx-pat-linka" width="10" height="10" ' +
    'patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="10" height="10" fill="#14161D"/>' +
    '<path d="M0 0H10M0 5H10" stroke="#2B303E" stroke-width="2"/>' +
    '<path d="M0 2.5H10M0 7.5H10" stroke="rgba(201,210,228,.4)" stroke-width=".5"/></pattern>',
  /* the luzzu: hull strakes — blue, yellow, red, white piping between */
  luzzu:
    '<pattern id="kdx-pat-luzzu" width="16" height="16" patternUnits="userSpaceOnUse">' +
    '<rect width="16" height="16" fill="#155FA0"/>' +
    '<rect y="6" width="16" height="1" fill="#FFF6E4"/>' +
    '<rect y="7" width="16" height="4" fill="#F2B33D"/>' +
    '<rect y="11" width="16" height="1" fill="#FFF6E4"/>' +
    '<rect y="12" width="16" height="4" fill="#C4402A"/></pattern>',
  /* strawberry and cream, with the thin berry piping of a good gelat */
  gelat:
    '<pattern id="kdx-pat-gelat" width="12" height="12" ' +
    'patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="12" height="12" fill="#F0748F"/>' +
    '<rect y="7" width="12" height="5" fill="#FFE8DC"/>' +
    '<rect y="6.4" width="12" height=".6" fill="#C2385A"/></pattern>',
  /* vine and leaf on bottle green, one gold vein */
  weraq:
    '<pattern id="kdx-pat-weraq" width="16" height="16" patternUnits="userSpaceOnUse">' +
    '<rect width="16" height="16" fill="#103828"/>' +
    '<path d="M2 14Q8 10 8 4Q8 10 14 8" fill="none" stroke="#1E5A42" stroke-width="1.4"/>' +
    '<path d="M8 4C10 5.6 10 8 8 9.4C6 8 6 5.6 8 4Z" fill="#2E8C64" opacity=".9"/>' +
    '<path d="M8 4V9.4" stroke="rgba(255,217,138,.55)" stroke-width=".5"/></pattern>',
  /* ox-blood with a gold quatrefoil grid inside hairline diamonds */
  demm:
    '<pattern id="kdx-pat-demm" width="12" height="12" patternUnits="userSpaceOnUse">' +
    '<rect width="12" height="12" fill="#4A0F16"/>' +
    '<path d="M6 0L12 6L6 12L0 6Z" fill="none" stroke="rgba(255,197,66,.28)" stroke-width=".5"/>' +
    '<circle cx="6" cy="4.6" r="1.1" fill="#A9762A"/>' +
    '<circle cx="4.6" cy="6" r="1.1" fill="#A9762A"/>' +
    '<circle cx="7.4" cy="6" r="1.1" fill="#A9762A"/>' +
    '<circle cx="6" cy="7.4" r="1.1" fill="#A9762A"/></pattern>',
  /* the mask: violet damask drop with lit tips */
  maskra:
    '<pattern id="kdx-pat-maskra" width="14" height="14" patternUnits="userSpaceOnUse">' +
    '<rect width="14" height="14" fill="#2E1E52"/>' +
    '<path d="M7 2C9 4 9 6.2 7 8.2C5 6.2 5 4 7 2Z" fill="#543C86"/>' +
    '<path d="M7 8.8V11.4" stroke="#543C86" stroke-width="1"/>' +
    '<circle cx="7" cy="12.2" r=".9" fill="#C4AEFF" opacity=".85"/></pattern>',
  /* sea glass: overlapping filigree rings, tide-smoothed */
  hgieg:
    '<pattern id="kdx-pat-hgieg" width="16" height="16" patternUnits="userSpaceOnUse">' +
    '<rect width="16" height="16" fill="#0E3E44"/>' +
    '<circle cx="8" cy="8" r="5" fill="none" stroke="#1D6A72" stroke-width="1"/>' +
    '<circle cx="0" cy="0" r="5" fill="none" stroke="#2E8C94" stroke-width=".7"/>' +
    '<circle cx="16" cy="16" r="5" fill="none" stroke="#2E8C94" stroke-width=".7"/>' +
    '<circle cx="8" cy="8" r=".9" fill="#A8F0E8"/></pattern>',
  /* olive herringbone with one gold thread */
  zebbug:
    '<pattern id="kdx-pat-zebbug" width="12" height="12" patternUnits="userSpaceOnUse">' +
    '<rect width="12" height="12" fill="#3E4A1E"/>' +
    '<path d="M0 2L6 8L12 2" fill="none" stroke="#55642C" stroke-width="2"/>' +
    '<path d="M0 8L6 14L12 8" fill="none" stroke="#55642C" stroke-width="2"/>' +
    '<path d="M0 5L6 11L12 5" fill="none" stroke="rgba(240,217,160,.45)" stroke-width=".6"/></pattern>',
  /* antique ivory guilloche in old brown ink */
  ivorju:
    '<pattern id="kdx-pat-ivorju" width="16" height="16" patternUnits="userSpaceOnUse">' +
    '<rect width="16" height="16" fill="#E8DCC2"/>' +
    '<path d="M0 8Q4 3 8 8T16 8" fill="none" stroke="#B99F6E" stroke-width="1"/>' +
    '<path d="M0 8Q4 13 8 8T16 8" fill="none" stroke="#CFBF9C" stroke-width="1"/>' +
    '<circle cx="8" cy="8" r=".8" fill="#7A5A22"/></pattern>',
  /* charcoal milled pinstripe, one gold thread in three */
  faham:
    '<pattern id="kdx-pat-faham" width="8" height="8" patternUnits="userSpaceOnUse">' +
    '<rect width="8" height="8" fill="#1B1E24"/>' +
    '<rect x="0" width="1.2" height="8" fill="#3A3E46"/>' +
    '<rect x="4" width=".5" height="8" fill="rgba(255,197,66,.5)"/></pattern>',
  /* gold and white filigree: a scroll, a cross-hatch breath, a stud */
  deheb:
    '<pattern id="kdx-pat-deheb" width="16" height="16" patternUnits="userSpaceOnUse">' +
    '<rect width="16" height="16" fill="#B8891F"/>' +
    '<path d="M0 0L16 16M16 0L0 16" stroke="rgba(255,247,228,.22)" stroke-width=".5"/>' +
    '<path d="M4 12Q2 8 5 6Q9 3.6 8.4 7.4Q8 10.6 12 10" fill="none" ' +
      'stroke="#FFF7E4" stroke-width="1" opacity=".9"/>' +
    '<circle cx="12.6" cy="4" r="1" fill="#FFF7E4" opacity=".85"/></pattern>'
};

/* klabb's eight-pointed cross, restated for the previews */
var CROSS_D = 'M50 46 30 26 18 38l14 12-14 12 12 12 20-20 20 20 12-12-14-12 14-12' +
              '-12-12-20 20Z';

/* the cloth: two hairline weaves laid over every dressed felt */
var WEAVE = 'repeating-linear-gradient(45deg,rgba(255,255,255,.02) 0 1px,transparent 1px 5px),' +
            'repeating-linear-gradient(-45deg,rgba(0,0,0,.05) 0 1px,transparent 1px 5px),';

function hexRgba(hex, a){
  var h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  var n = parseInt(h, 16);
  if (!isFinite(n)) return 'rgba(0,0,0,' + a + ')';
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

/* ── the hidden pattern shelf ─────────────────────────────────────── */
function pats(){
  if (document.getElementById('kdx-pats') || !document.body) return;
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'kdx-pats';
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('style',
    'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  var s = '', k;
  for (k in TILES) if (Object.prototype.hasOwnProperty.call(TILES, k)) s += TILES[k];
  svg.innerHTML = s;
  document.body.appendChild(svg);
}

function sheet(){
  var st = document.getElementById('kdx-kit-css');
  if (!st){ st = document.createElement('style'); st.id = 'kdx-kit-css'; }
  /* appendChild MOVES an existing node to the end — always after every
     game's own runtime sheet, and the #app prefix out-specifies them */
  document.head.appendChild(st);
  return st;
}

/* ── one apply for every table in the box ─────────────────────────── */
function apply(){
  var XP = window.KARTI_XP;
  if (!XP) return;
  pats();
  var css = '';

  var f = FELTS[XP.equipped('felt', 'karti') || ''];
  if (f && f.a){
    var sheen = f.sheen
      ? 'radial-gradient(70% 45% at 50% 14%,rgba(255,255,255,.05),transparent 70%),' : '';
    var top = sheen + WEAVE;
    css +=
      '#app #scr-party .pk-table{background:' + top +
        'radial-gradient(120% 85% at 50% 34%,' + f.a + ' 0%,' + f.b + ' 46%,' + f.c + ' 100%)}' +
      '#app #scr-party .rm-table{background:' + top +
        'radial-gradient(120% 85% at 50% 8%,' + f.a + ' 0%,' + f.b + ' 45%,' + f.c + ' 100%)}' +
      '#app #scr-party .kb-table{background:' + top +
        'radial-gradient(120% 85% at 50% 8%,' + f.a + ' 0%,' + f.b + ' 45%,' + f.c + ' 100%)}' +
      '#app #scr-party .gn-felt{background:' + top +
        'radial-gradient(115% 78% at 50% 30%,' + f.a + ' 0%,' + f.b + ' 46%,' + f.c + ' 100%)}' +
      '#app #scr-party .sk-wrap:not(.sk-art) .sk-felt{background:' + top +
        'radial-gradient(120% 90% at 50% 30%,' + f.a + ' 0%,' + f.b + ' 72%,' + f.c + ' 100%)}' +
      /* IL-KIRI's mid felt is a translucent scrim over artkit's cloth,
         so the shared felt arrives as a tint, not a coat of paint */
      '#app #scr-kiri .kr-mid{box-shadow:inset 0 0 0 1px ' + hexRgba(f.ring, .32) +
        ',inset 0 2px 10px rgba(0,0,0,.55),inset 0 -16px 30px rgba(0,0,0,.45)}' +
      '#app #scr-kiri .kr-mid::before{background:radial-gradient(120% 90% at 50% 0%,' +
        hexRgba(f.b, .42) + ',' + hexRgba(f.c, .75) + ' 80%)}';
  }

  var b = BACKS[XP.equipped('back', 'karti') || ''];
  if (b && !b.stock){
    var hosts = ['.pk-table', '.rm-table', '.gn-felt', '.kb-table'], i;
    for (i = 0; i < hosts.length; i++){
      var sc = '#app #scr-party ' + hosts[i] + ' .kb-back ';
      css += sc + 'rect[fill^="url"]{fill:url(#kdx-pat-' + b.pat + ')}' +
             sc + 'rect[stroke="#FFD98A"]{stroke:' + b.edge + '}' +
             sc + 'use{fill:' + b.cross + '}';
    }
    if (b.sk) css +=
      '#app #scr-party .sk-wrap:not(.sk-art) .sk-card.back{background:' + b.sk.bg + '}' +
      '#app #scr-party .sk-wrap:not(.sk-art) .sk-card.back .sk-tile{' +
        'background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 2px ' + b.sk.ring + '}' +
      '#app #scr-party .sk-wrap:not(.sk-art) .sk-card.back .sk-mid .sk-g{fill:' + b.sk.cap + '}' +
      '#app #scr-party .sk-wrap:not(.sk-art) .sk-card.back .sk-cap{color:' + b.sk.cap + '}' +
      '#app #scr-party .sk-wrap:not(.sk-art) .sk-deck .sk-card{' +
        'box-shadow:0 4px 14px rgba(0,0,0,.5),' +
        '4px -4px 0 -1px ' + b.sk.g2 + ',4px -4px 0 0 rgba(255,255,255,.14),' +
        '8px -8px 0 -1px ' + b.sk.g2 + ',8px -8px 0 0 rgba(255,255,255,.10)}';
  }

  sheet().textContent = css;
}

/* ── previews ──────────────────────────────────────────────────────
   The back preview is the REAL card: same body, same pattern (via the
   shared #kdx-pats shelf), same frame, same cross — plus a sweep of
   top light so the shelf reads as printed card, not flat swatch. */
function backPv(id){
  var b = BACKS[id];
  return function(size){
    var s = size || 62, h = Math.round(s * .92), w = Math.round(h * 100 / 140);
    var el = document.createElement('span');
    el.setAttribute('style', 'display:flex;align-items:center;justify-content:center;' +
      'width:' + s + 'px;height:' + s + 'px');
    el.innerHTML =
      '<svg width="' + w + '" height="' + h + '" viewBox="0 0 100 140" aria-hidden="true" ' +
        'style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))">' +
      '<rect x="1.25" y="1.25" width="97.5" height="137.5" rx="8.5" ' +
        'fill="#F2ECDA" stroke="rgba(0,0,0,.34)" stroke-width="1.1"/>' +
      '<rect x="5.5" y="5.5" width="89" height="129" rx="5.5" fill="url(#kdx-pat-' + b.pat + ')"/>' +
      '<rect x="5.5" y="5.5" width="89" height="129" rx="5.5" fill="none" ' +
        'stroke="' + b.edge + '" stroke-width="1.6" opacity=".75"/>' +
      '<rect x="10.5" y="10.5" width="79" height="119" rx="3.5" fill="none" ' +
        'stroke="' + b.edge + '" stroke-width=".7" opacity=".4" stroke-dasharray="2.2 1.8"/>' +
      '<g transform="translate(28,48) scale(.44)"><path d="' + CROSS_D + '" ' +
        'fill="' + b.cross + '" opacity=".92"/></g>' +
      '<path d="M5.5 34C34 26 66 26 94.5 16V11a5.5 5.5 0 0 0-5.5-5.5H11A5.5 5.5 0 0 0 5.5 11Z" ' +
        'fill="rgba(255,255,255,.09)"/>' +
      '</svg>';
    return el;
  };
}

function feltPv(id){
  var t = FELTS[id];
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style', 'display:flex;align-items:center;justify-content:center;' +
      'width:' + s + 'px;height:' + s + 'px');
    /* klassiku: the four house tables in one quadrant swatch — "each
       game keeps its own colours" said as a picture */
    var bg = t.a
      ? WEAVE + 'radial-gradient(120% 90% at 50% 22%,' + t.a + ' 0%,' + t.b + ' 55%,' + t.c + ' 100%)'
      : 'conic-gradient(from 45deg,#1E7A50 0 25%,#28437A 0 50%,#20323A 0 75%,#2B4C74 0 100%)';
    var ring = t.ring ? 'inset 0 0 0 2px ' + hexRgba(t.ring, .38) + ',' : '';
    el.innerHTML = '<span style="display:block;width:' + s + 'px;height:' +
      Math.round(s * .72) + 'px;border-radius:10px;border:1px solid rgba(0,0,0,.55);' +
      'box-sizing:border-box;box-shadow:' + ring +
      'inset 0 2px 0 rgba(255,255,255,.06),inset 0 -8px 14px rgba(0,0,0,.3);' +
      'background:' + bg + '"></span>';
    return el;
  };
}

/* ── the shelf itself ─────────────────────────────────────────────── */
function defs(){
  function bk(id, level, name, blurb, set, sort){
    var d = { slot:'back', id:id, level:level, name:name, blurb:blurb, preview:backPv(id) };
    if (set) d.set = set;
    if (typeof sort === 'number') d.sort = sort;
    return d;
  }
  function ft(id, level, name, blurb, set, sort){
    var d = { slot:'felt', id:id, level:level, name:name, blurb:blurb, preview:feltPv(id) };
    if (set) d.set = set;
    if (typeof sort === 'number') d.sort = sort;
    return d;
  }
  return [
    /* THE BACKS — one ladder, no duplicates, every rung distinct at
       thumbnail size. Pink sits LOW on purpose; the house rule. */
    bk('back.klassiku', 0, 'Il-Klassiku',
       'The house crimson. The deck every game was born with.', '', -1),
    bk('back.kazin', 0, 'Aħdar tal-Każin',
       'Club green, double-milled, a gold stud where the rails cross. Committee approved.'),
    bk('back.bahar', 0, 'Baħar Miftuħ',
       'Harbour guilloche — two waves interlaced like the engraving on an old banknote.'),
    bk('back.roza', 2, 'Roża Ħelwa',
       'Baby-pink damask, petal by petal. Pretty enough that they forget to count your cards.'),
    bk('back.xugaman', 3, 'Bandalori tal-Festa',
       'Bunting over candy stripes. The whole street is dressed and so is your deck.', 'summer'),
    bk('back.linka', 4, 'Linka u Fidda',
       'Ink pinstripe with a silver thread. Gives away exactly nothing.'),
    bk('back.luzzu', 5, 'Strieki tal-Luzzu',
       'Hull strakes — blue, yellow, red, white piping between. The eye stays open.', 'summer'),
    bk('back.gelat', 6, 'Ġelat tal-Frawla',
       'Strawberry and cream with a thin berry piping. Deal before it melts.', 'summer'),
    bk('back.weraq', 7, 'Weraq u Deheb',
       'A vine over bottle green, one gold vein to a leaf. Nobody has ever read a hedge.'),
    bk('back.demm', 6, 'Demm u Deheb',
       'Ox-blood under a gold quatrefoil grid. Traditional, and slightly threatening.'),
    bk('back.maskra', 10, 'Il-Maskra',
       'Violet damask with lit tips, for cards with something to hide. All of them.'),
    bk('back.hgieg', 13, 'Ħġieġ tal-Baħar',
       'Filigree rings in sea-glass teal, smoothed by the tide.'),
    bk('back.zebbug', 14, 'Żebbuġ u Deheb',
       'Olive herringbone with one gold thread in three. Respectable to a fault.'),
    bk('back.ivorju', 18, 'Ivorju Antik',
       'Old ivory, engine-turned in brown ink. From the drawer nobody is allowed to open.'),
    bk('back.faham', 24, 'Faħam Indurat',
       'Charcoal milled fine, a gold pinstripe every third rail. Funeral-grade elegance.'),
    bk('back.deheb', 38, 'Deheb u Abjad',
       'White filigree on beaten gold. The deck is dressed better than anyone holding it.'),

    /* THE FELTS — the same cloth on every table in the box */
    ft('felt.klassiku', 0, 'Tal-Logħba',
       'No cloth at all: every game keeps its own house table.', '', -1),
    ft('felt.kazin', 0, 'Feltru tal-Każin',
       'Club green under a bare bulb. Where every bad decision on this island was taken.'),
    ft('felt.bahar', 0, 'Il-Port',
       'Harbour water over the rail. Things dropped here are not coming back.'),
    ft('felt.roza', 2, 'Sema Roża',
       'Baby pink, plush as a good evening. You will still be knocked on, but gently.'),
    ft('felt.lapsi', 5, 'Ilma ta’ Għar Lapsi',
       'Turquoise no photograph has ever got right. Your discards are visible from the boat.', 'summer'),
    ft('felt.imbid', 3, 'Inbid tad-Dar',
       'House-wine red. Spills are absorbed discreetly.'),
    ft('felt.vjola', 6, 'Vjola Rjali',
       'Royal purple, for playing your worst hand with a certain dignity.'),
    ft('felt.qahwa', 8, 'Kafè u Tabakk',
       'Tobacco brown, coffee rings included at no extra charge.'),
    ft('felt.lejl', 15, 'Wara Nofsillejl',
       'The colour a room goes when nobody has mentioned the time in two hours.'),
    ft('felt.franka', 16, 'Ġebla Franka',
       'Limestone in daylight. Every game played on it counts as heritage.'),
    ft('felt.bellus', 33, 'Bellus tal-Lejl',
       'Midnight velvet with a breath of sheen. The good room, finally unlocked.')
  ];
}

/* ═══════════════════════════════════════════════════════════════════
   THE MIGRATION — nobody is stranded.

   The old shelves were per-game ids ('poker.back.deheb'…). Three ways
   a player could hold one, three answers:

   · OWNED BY LEVEL. Ownership of a levelled cosmetic was never written
     down — owns() derives it from the ladder — so it carries by
     ARITHMETIC, not by code: every shared design unlocks at or below
     the LOWEST level of every legacy design it replaces (checked by
     hand against all 76 retired ids). Reach any old rung and the new
     rung is already under your feet. Nothing to migrate.

   · BOUGHT IN THE STORE. A purchase is the one thing written into
     own[], so those keys are read here and the shared equivalent is
     granted through KARTI_XP.grant() — the same door the till uses.
     grant() is idempotent by construction (already-owned returns
     {already:true} with no write), so this loop is free on every boot
     after the first.

   · EQUIPPED. The old eq keys ('poker.back', 'kiri.table'…) are read
     raw, mapped, granted (so the look stays even if the shared rung
     sits higher than the player), equipped on the shared slot — the
     first game in priority order wins when two games wore different
     backs — and then the legacy key is DELETED through unequip(),
     which is what makes the whole pass self-erasing: the second boot
     finds no legacy keys and does nothing at all.
   ═══════════════════════════════════════════════════════════════════ */
var MAP = {
  /* felts */
  'poker.felt.kazin':'felt.kazin',  'poker.felt.borgo':'felt.imbid',
  'poker.felt.tabakk':'felt.qahwa', 'poker.felt.lejl':'felt.lejl',
  'poker.felt.lapsi':'felt.lapsi',
  'rummy.felt.kazin':'felt.kazin',  'rummy.felt.bordo':'felt.imbid',
  'rummy.felt.roza':'felt.roza',    'rummy.felt.lejl':'felt.lejl',
  'rummy.felt.comino':'felt.lapsi',
  'skarta.felt.xatt':'felt.bahar',  'skarta.felt.kazin':'felt.kazin',
  'skarta.felt.imbid':'felt.imbid', 'skarta.felt.roza':'felt.roza',
  'skarta.felt.vjola':'felt.vjola', 'skarta.felt.nofsinhar':'felt.lapsi',
  'gin.felt.kazin':'felt.kazin',    'gin.felt.qahwa':'felt.qahwa',
  'gin.felt.roza':'felt.roza',      'gin.felt.vjola':'felt.vjola',
  'gin.felt.lapsi':'felt.lapsi',
  'bixkla.felt.buskett':'felt.kazin',   'bixkla.felt.laguna':'felt.bahar',
  'bixkla.felt.ghabex':'felt.roza',     'bixkla.felt.kazin':'felt.kazin',
  'briscola.felt.port':'felt.bahar',    'briscola.felt.fond':'felt.lejl',
  'briscola.felt.franka':'felt.franka',
  'sette.felt.inbid':'felt.imbid',      'sette.felt.deheb':'felt.franka',
  'sette.felt.irham':'felt.franka',     'sette.felt.granita':'felt.qahwa',
  'cheat.felt.vjola':'felt.vjola',      'cheat.felt.buganvilla':'felt.vjola',
  'cheat.felt.ram':'felt.qahwa',
  'kiri.table.qiegh':'felt.bahar',      'kiri.table.inbid':'felt.imbid',
  'kiri.table.vjola':'felt.vjola',      'kiri.table.ambra':'felt.qahwa',
  'cards2131.felt.inbid':'felt.imbid',  'cards2131.felt.port':'felt.bahar',
  'cards2131.felt.franka':'felt.franka',
  /* backs */
  'poker.back.kazin':'back.kazin',   'poker.back.linka':'back.linka',
  'poker.back.demm':'back.demm',     'poker.back.ivorju':'back.ivorju',
  'poker.back.deheb':'back.deheb',   'poker.back.umbrel':'back.xugaman',
  'rummy.back.bahar':'back.bahar',   'rummy.back.kazin':'back.kazin',
  'rummy.back.linka':'back.linka',   'rummy.back.roza':'back.roza',
  'rummy.back.deheb':'back.deheb',   'rummy.back.gelat':'back.gelat',
  'skarta.back.bahar':'back.bahar',  'skarta.back.kazin':'back.kazin',
  'skarta.back.skur':'back.linka',   'skarta.back.roza':'back.roza',
  'skarta.back.indurat':'back.deheb','skarta.back.xugaman':'back.xugaman',
  'gin.back.bahar':'back.bahar',     'gin.back.zebbug':'back.zebbug',
  'gin.back.roza':'back.roza',       'gin.back.iswed':'back.faham',
  'gin.back.kannoli':'back.gelat',
  'bixkla.back.weraq':'back.weraq',  'bixkla.back.menta':'back.weraq',
  'bixkla.back.faham':'back.faham',
  'briscola.back.moll':'back.bahar', 'briscola.back.fanal':'back.bahar',
  'briscola.back.luzzu':'back.luzzu','briscola.back.luzzuxemx':'back.luzzu',
  'sette.back.indurat':'back.demm',  'sette.back.demm':'back.demm',
  'sette.back.fliexken':'back.weraq',
  'cheat.back.maskra':'back.maskra', 'cheat.back.gidba':'back.roza',
  'cheat.back.hgieg':'back.hgieg',   'cheat.back.harqa':'back.xugaman',
  'cards2131.back.salib':'back.demm','cards2131.back.bahar':'back.bahar',
  'cards2131.back.roza':'back.roza'
};

/* the games whose slots are walked for old equips, in the order whose
   first hit dresses the shared slot */
var LEGACY_SLOTS = [
  { game:'skarta',   slots:['felt', 'back'] },
  { game:'poker',    slots:['felt', 'back'] },
  { game:'rummy',    slots:['felt', 'back'] },
  { game:'gin',      slots:['felt', 'back'] },
  { game:'bixkla',   slots:['felt', 'back'] },
  { game:'briscola', slots:['felt', 'back'] },
  { game:'sette',    slots:['felt', 'back'] },
  { game:'cheat',    slots:['felt', 'back'] },
  { game:'kiri',     slots:['table'] },
  { game:'cards2131',slots:['felt', 'back'] }
];

function migrate(){
  var XP = window.KARTI_XP;
  if (!XP || typeof XP._state !== 'function') return;
  var st;
  try { st = XP._state(); } catch (e){ return; }
  if (!st || !st.eq || !st.own) return;
  var lid;
  /* purchases carry over */
  for (lid in MAP) if (Object.prototype.hasOwnProperty.call(MAP, lid) && st.own[lid]){
    try { XP.grant(MAP[lid]); } catch (e){}
  }
  /* the equipped look carries over, then the legacy key is erased */
  for (var i = 0; i < LEGACY_SLOTS.length; i++){
    var row = LEGACY_SLOTS[i];
    for (var j = 0; j < row.slots.length; j++){
      var slot = row.slots[j];
      var worn = st.eq[row.game + '.' + slot];
      if (!worn) continue;
      /* only a RETIRED id is migrated and erased; the earn-only
         exclusive sets keep their per-game slots untouched */
      var shared = MAP[worn];
      if (!shared){ continue; }
      var wearSlot = (slot === 'back') ? 'back' : 'felt';   /* kiri.table → felt */
      try { XP.grant(shared); } catch (e){}
      try {
        if (!XP._state().eq['karti.' + wearSlot]) XP.equip('', shared);
      } catch (e){}
      try { XP.unequip(slot, row.game); } catch (e){}
    }
  }
}

/* ── boot ─────────────────────────────────────────────────────────── */
function boot(tries){
  var XP = window.KARTI_XP;
  if (!XP || !document.body){
    if (tries < 40) setTimeout(function(){ boot(tries + 1); }, 500);
    return;
  }
  pats();
  var KIT = XP.forGame('karti');
  KIT.register(defs());
  migrate();
  KIT.onChange(apply);
  apply();
}
boot(0);

/* test hooks only */
try {
  if (typeof window !== 'undefined') window.KARTI_DECK = {
    _map: MAP, _migrate: migrate, _apply: apply,
    _felts: FELTS, _backs: BACKS
  };
} catch (e){}

})();
