#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   KARTI — IL-KIRI PROMPT BUILDER

   Writes the art list for the property game:
     art/kiri-prompts.jsonl   same shape as art/prompts.jsonl — feeds
                              scripts/runpod_batch.py unchanged
     art/party-kiri.json      the flatter {id,file,w,h,alpha,out,purpose,subject}
                              shape the party-games art run merges
     art/kiri-prompts.txt     human-readable, skim it before renting the GPU

   Usage
     node scripts/make_kiri_prompts.js
     node scripts/make_kiri_prompts.js --check      counts + token report only

   ┌───────────────────────────────────────────────────────────────────────┐
   │  WE GENERATE THE ART WINDOW ONLY. NEVER A FINISHED BOARD TILE.        │
   │  Property names, prices, rents, the colour band, the ownership ring   │
   │  and every number on this board are drawn by js/kiri-ui.js in CSS on  │
   │  top. That is what lets a property be renamed, repriced or rejoked    │
   │  without another GPU rental — and on a PROPERTY game, where every     │
   │  square carries a name and a price, it is the difference between one  │
   │  rental and a rental every time the rents are rebalanced.             │
   └───────────────────────────────────────────────────────────────────────┘

   Style source of truth : docs/ART_STYLE_BIBLE.md
   Prompt mechanics      : scripts/make_prompts.js (fitPrompt, the 77-token wall)
   Party-run conventions : docs/RUNPOD_PARTY.md
   The brief             : docs/KIRI_ART.md
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const ART_DIR = path.join(ROOT, 'art');

/* ───────────────────────────────────────────────────────────────────────────
   THE 77-TOKEN WALL — copied deliberately, not imported.
   scripts/make_prompts.js is the source of truth and is owned by the card
   game; this file must never be able to change it. If the style block there
   changes, change it here by hand and regenerate BOTH — a mixed batch looks
   like two different games.
   ─────────────────────────────────────────────────────────────────────────── */
const TOKEN_BUDGET = 74;
const estTokens = s =>
  Math.ceil(String(s).trim().split(/\s+/).filter(Boolean).length * 1.35) +
  (String(s).match(/,/g) || []).length;

function fitPrompt(required, optional = []) {
  const req = required.filter(Boolean).map(s => String(s).trim());
  let used = req.reduce((n, s) => n + estTokens(s) + 1, 0);
  while (used > TOKEN_BUDGET) {
    let idx = 0;
    for (let i = 1; i < req.length; i++) if (estTokens(req[i]) > estTokens(req[idx])) idx = i;
    const words = req[idx].split(/\s+/);
    if (words.length <= 4) break;
    req[idx] = words.slice(0, words.length - 2).join(' ').replace(/[\s,]+$/, '');
    used = req.reduce((n, s) => n + estTokens(s) + 1, 0);
  }
  const out = [...req];
  for (const seg of optional) {
    if (!seg) continue;
    const cost = estTokens(seg) + 1;
    if (used + cost > TOKEN_BUDGET) continue;
    out.push(String(seg).trim());
    used += cost;
  }
  return out.join(', ');
}

const STYLE_LEAD =
  'funny colourful cartoon comic illustration, thick black outline, flat bright colours, cel shaded';
const STYLE_FUNNY = 'exaggerated goofy comic expression, humorous caricature';

const NEGATIVE_SHORT = [
  'photorealistic','photograph','3d render','oil painting',
  'framed picture','poster on a wall','picture frame','border',
  'monochrome','black and white','pencil sketch',
  'text','letters','numbers','watermark','signature','logo',
  'blurry','cluttered','deformed hands','extra fingers','bad anatomy',
  'nsfw','nude','gore',
].join(', ');

/* A board is made of straight lines and a property game draws its own on top.
   Anything linear in a background wash lands exactly where the CSS band goes. */
const NEG_ENV  = NEGATIVE_SHORT + ', path, road stripe, divider, seam, tiling, grid, rectangle outline';
const NEG_CUT  = NEGATIVE_SHORT + ', shadow on the ground, ground plane, scenery, background objects';

/* framing per kind — one line each, and never "goofy" on a texture */
const FRAME = {
  env:   { lead:'wide establishing background illustration, no central subject', funny:false },
  scene: { lead:'a single wide comic moment', funny:true },
  cut:   { lead:'one object centred, isolated on pure flat black background', funny:false },
  chara: { lead:'one character centred, isolated on pure flat black background', funny:true },
};

const GEN = { w:1024, h:1024 };

/* ═══════════════════════════════════════════════════════════════════════════
   THE LIST
   33 images. Every one of them is REUSED:
     6 locality washes cover all 16 properties (one per colour group)
     7 fate illustrations cover all 36 cards (two deck faces + five outcomes)
   That is the whole trick. A weak picture per square would be 32 images
   nobody looks at twice; six strong ones are a place.
   ═══════════════════════════════════════════════════════════════════════════ */
const ASSETS = [

  /* ── 1. THE SIX COLOUR GROUPS ──────────────────────────────────────────
     Used as a soft wash behind the property sheet header and behind the
     group heading in the DEEDS list. The property NAME, price and rent
     table are CSS on top — never generated. */
  { id:'kiri-loc-marsa', kind:'env', p:'P1', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Wash behind the two Marsa properties (the garage, the scrap yard shed) — cheapest group.',
    subject:'a concrete lock-up garage yawning open on an oily back street, a sagging sofa and old fridge inside, one bored dog' },

  { id:'kiri-loc-hamrun', kind:'env', p:'P1', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Wash behind the three Ħamrun properties (the shop always closing down, the flat above the bakery, the house with damp).',
    subject:'a narrow terrace of tired townhouses over a bakery, washing strung across the street, one shutter half down' },

  { id:'kiri-loc-birgu', kind:'env', p:'P1', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Wash behind the three Birgu properties (the well in the kitchen, the house of character, the converted stable).',
    subject:'an old harbour lane of honey limestone houses, crooked green doors, a stone well, wooden boats behind' },

  { id:'kiri-loc-swieqi', kind:'env', p:'P1', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Wash behind the three Swieqi properties (the block with no permit, the mate\'s maisonette, the penthouse with sea views).',
    subject:'a half finished bare concrete apartment block in scaffolding, a yellow crane leaning over it, a cement mixer' },

  { id:'kiri-loc-sliema', kind:'env', p:'P1', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Wash behind the three Sliema properties — the seafront flats nobody on the island can afford.',
    subject:'glass seafront apartment towers rising over one tiny old townhouse squeezed between them, bright blue sea' },

  { id:'kiri-loc-belt', kind:'env', p:'P1', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Wash behind the two most expensive properties (the Valletta palazzo, the Mdina house nobody lives in).',
    subject:'a baroque limestone palazzo front with enclosed wooden balconies, silent walled city lane at dusk' },

  /* ── 2. THE SQUARES THAT ARE NOT PROPERTY ─────────────────────────────── */
  { id:'kiri-sq-start', kind:'scene', p:'P1', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Il-Bidu, the corner you collect your money passing. Shown on the square sheet.',
    subject:'a village street under strings of festa bunting, a tiny nanna pressing a folded wad of banknotes into a grown man\'s hand' },

  { id:'kiri-sq-queue', kind:'scene', p:'P1', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Il-Kju — the queue at counter four, this game\'s jail. Shown on the square sheet and when a player is stuck there.',
    subject:'one bored clerk behind glass at a dismal counter, a long snake of resigned people waiting' },

  { id:'kiri-sq-pjazza', kind:'scene', p:'P1', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Il-Pjazza — the safe corner where nothing at all happens.',
    subject:'four old men on plastic chairs round a tiny coffee table in a sunny village square, church dome behind' },

  { id:'kiri-sq-junction', kind:'scene', p:'P1', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Marsa Junction — the corner that sends you straight to the queue.',
    subject:'a road junction jammed solid with cars in every lane under a tangle of traffic lights, heat haze' },

  { id:'kiri-sq-transport', kind:'scene', p:'P2', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Shared by all four transport squares (Gozo ferry, Valletta terminus, karozzin, airport taxi).',
    subject:'a crowded car ferry and a battered orange bus nose to nose at a quayside, gulls wheeling' },

  { id:'kiri-sq-services', kind:'scene', p:'P2', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Shared by both service squares (the water bowser and the generator).',
    subject:'a water tanker lorry beside a roaring diesel generator on a hot back street, cables everywhere' },

  { id:'kiri-sq-tax', kind:'scene', p:'P2', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Shared by both tax squares (It-Taxxa and Iċ-Ċens, the ground rent that never dies).',
    subject:'a fat brown envelope with a wax seal on a doormat, a hand recoiling from it, gloomy hallway' },

  /* ── 3. THE FATE CARDS ──────────────────────────────────────────────────
     Two deck faces plus five outcomes. Every one of the 36 cards maps to
     one of these seven by its ACTION, so the picture always fits the joke
     and a new card written next week needs no new art. */
  { id:'kiri-fate-ghajdut', kind:'scene', p:'P1', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Face of the GĦAJDUT (gossip) deck. Behind the card sheet for any of its 18 cards.',
    subject:'two women on adjacent balconies whispering furiously, a third listening from a doorway below' },

  { id:'kiri-fate-gvern', kind:'scene', p:'P1', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Face of the TAL-GVERN (government) deck. Behind the card sheet for any of its 18 cards.',
    subject:'a towering filing shelf buckling under folders, one tiny clerk calmly stamping a single page' },

  { id:'kiri-fate-get', kind:'scene', p:'P2', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Any card that pays the player money (get / getEach). 10 cards use it.',
    subject:'a delighted man on a doorstep cradling a fistful of banknotes, a cat round his ankles' },

  { id:'kiri-fate-pay', kind:'scene', p:'P2', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Any card that takes money off the player (pay / payEach). 12 cards use it.',
    subject:'a defeated man emptying his wallet onto a kitchen table, one more bill drifting down' },

  { id:'kiri-fate-queue', kind:'scene', p:'P2', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Any card that sends the player to the queue, or hands out a Skip The Queue.',
    subject:'a calm officer steering a protesting driver towards a grim grey waiting room door' },

  { id:'kiri-fate-move', kind:'scene', p:'P2', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'Any card that moves the player somewhere else on the ring.',
    subject:'a tiny old car tearing down a narrow lane scattering chickens, a suitcase strapped to its roof' },

  { id:'kiri-fate-repairs', kind:'scene', p:'P2', out:{ w:768, h:768, fmt:'jpg', fit:'cover' },
    purpose:'The two repair cards that charge per floor and per penthouse you own.',
    subject:'builders and scaffolding on a roof above a skip overflowing with rubble, thick dust' },

  /* ── 4. THE FOUR TOKENS ─────────────────────────────────────────────────
     Alpha cut-outs. Shipped small — they are drawn at 26 points on the turn
     strip and 8 points on a board square. */
  { id:'kiri-tok-key', kind:'cut', p:'P1', alpha:true, out:{ w:256, h:256, fmt:'png', fit:'contain' },
    purpose:'Player token 1, Il-Muftieħ (The Key). Turn strip, table list, result screen.',
    subject:'a huge ornate iron door key with a small blank paper tag on its ring' },

  { id:'kiri-tok-scooter', kind:'cut', p:'P1', alpha:true, out:{ w:256, h:256, fmt:'png', fit:'contain' },
    purpose:'Player token 2, Il-Mutur (The Scooter).',
    subject:'a battered delivery scooter side on, square food box bolted behind the seat, mirrors askew' },

  { id:'kiri-tok-brick', kind:'cut', p:'P1', alpha:true, out:{ w:256, h:256, fmt:'png', fit:'contain' },
    purpose:'Player token 3, Il-Ġebla (The Brick).',
    subject:'a chipped honey limestone building block with a trowel of wet mortar on top' },

  { id:'kiri-tok-goat', kind:'chara', p:'P1', alpha:true, out:{ w:256, h:256, fmt:'png', fit:'contain' },
    purpose:'Player token 4, Il-Mogħża (The Goat).',
    subject:'a stubborn brown Maltese goat standing square on, chewing, one ear flopped' },

  /* tokens 5-8 — the table seats EIGHT, and eight is set by how many
     token colours stay apart at 9 points on a board square. Give these
     four genuinely different SILHOUETTES and that ceiling can be
     raised; make them four more round blobs and it cannot. */
  { id:'kiri-tok-luzzu', kind:'cut', p:'P2', alpha:true, out:{ w:256, h:256, fmt:'png', fit:'contain' },
    purpose:'Player token 5, Il-Luzzu (The Luzzu).',
    subject:'a small painted Maltese fishing boat side on, high curved prow with a painted eye on it' },

  { id:'kiri-tok-pastizz', kind:'cut', p:'P2', alpha:true, out:{ w:256, h:256, fmt:'png', fit:'contain' },
    purpose:'Player token 6, Il-Pastizz (The Pastizz).',
    subject:'one golden flaky diamond shaped pastry with one corner bitten off, crumbs falling' },

  { id:'kiri-tok-bandiera', kind:'cut', p:'P2', alpha:true, out:{ w:256, h:256, fmt:'png', fit:'contain' },
    purpose:'Player token 7, Il-Bandiera (The Banner). Cloth MUST come back blank.',
    subject:'a small festa banner of plain blank cloth on a short pole, hanging in a lazy curl' },

  { id:'kiri-tok-bajtra', kind:'cut', p:'P2', alpha:true, out:{ w:256, h:256, fmt:'png', fit:'contain' },
    purpose:'Player token 8, Il-Bajtra (The Prickly Pear).',
    subject:'a fat prickly pear cactus paddle with three ripe orange fruit along its rim' },

  /* ── 5. THE BUILD LADDER ────────────────────────────────────────────────
     Floors and a penthouse, not houses and hotels. Drawn at 15 points as a
     badge on a board square and full size on the property sheet. */
  { id:'kiri-build-floor', kind:'cut', p:'P1', alpha:true, out:{ w:256, h:256, fmt:'png', fit:'contain' },
    purpose:'One SULAR (floor). Up to four go on a property before the penthouse.',
    subject:'one square concrete storey with two shuttered windows and a small balcony, slight angle' },

  { id:'kiri-build-pent', kind:'cut', p:'P1', alpha:true, out:{ w:256, h:256, fmt:'png', fit:'contain' },
    purpose:'IL-PENTHOUSE, the top of the build ladder.',
    subject:'a flashy rooftop penthouse box with huge glass doors, a timber pergola, one satellite dish' },

  /* ── 6. SURFACES AND UI ─────────────────────────────────────────────────
     The hub tile (logo-kiri) and the money (coin-face / coin-back) are
     already in docs/RUNPOD_PARTY.md and are NOT repeated here. */
  { id:'kiri-board-felt', kind:'env', p:'P2', out:{ w:1024, h:1024, fmt:'jpg', fit:'cover' },
    purpose:'The surface the 32-square ring sits on. Must stay quiet in the middle — the dice and the current square are drawn there.',
    subject:'a worn dark green card table cloth from above, faint ring stains, a scatter of pale dust' },

  { id:'kiri-hero', kind:'env', p:'P1', out:{ w:900, h:900, fmt:'jpg', fit:'cover' },
    purpose:'Background for the IL-KIRI menu and the result screen. Buttons and the winner\'s name sit on top in CSS, so keep the centre calm.',
    subject:'a hillside of packed Maltese houses and construction cranes at golden hour across the water' },

  { id:'kiri-deed', kind:'cut', p:'P2', alpha:true, out:{ w:512, h:512, fmt:'png', fit:'contain' },
    purpose:'Behind the property sheet header — the title deed itself. Surface MUST come back blank; the name, price and rent table are CSS on top.',
    subject:'an old folded deed of blank aged paper, a red wax seal, a faded ribbon, nothing written on it' },
];

/* ═══════════════════════════════════════════════════════════════════════════
   BUILD
   ═══════════════════════════════════════════════════════════════════════════ */
function seedOf(id){
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++){ h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) % 2147483647;
}

function build(a){
  const F = FRAME[a.kind] || FRAME.scene;
  const prompt = fitPrompt(
    [ STYLE_LEAD, F.funny ? STYLE_FUNNY : null, F.lead + ', ' + a.subject ],
    [ a.kind === 'env'
        ? 'flat even light, calm empty middle'
        : 'centred, generous empty margin, simple uncluttered background' ]
  );
  const ext = a.out.fmt;
  return {
    id: a.id,
    kind: 'ui',
    file: 'art/ui/' + a.id + '.' + ext,
    raw:  'art/raw/' + a.id + '.png',
    prompt,
    negative: a.kind === 'env' ? NEG_ENV : (a.alpha ? NEG_CUT : NEGATIVE_SHORT),
    seed: seedOf(a.id),
    width: GEN.w, height: GEN.h,
    out: Object.assign({}, a.out, { alpha: !!a.alpha }),
    priority: a.p || 'P2',
    meta: { purpose: a.purpose, uiKind: a.kind, alpha: !!a.alpha, game: 'kiri', subject: a.subject },
  };
}

const entries = ASSETS.map(build);

/* ── integrity, and the token report the runbook asks for ───────────────── */
const ids = entries.map(e => e.id);
const files = entries.map(e => e.file);
const dupId = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
const dupFile = [...new Set(files.filter((v, i) => files.indexOf(v) !== i))];
const over = entries.filter(e => estTokens(e.prompt) > TOKEN_BUDGET);
const badId = entries.filter(e => !/^[a-z0-9][a-z0-9-]*$/.test(e.id));
/* the one thing that gets an image rejected on this project */
const TEXTY = /\b(text|letters?|words?|writing|sign(age)?|label|name(plate)?|number|price|logo|wordmark)\b/i;
const texty = entries.filter(e => TEXTY.test(e.prompt) && !/nothing written|BLANK|blank/i.test(e.prompt));
/* fitPrompt trims the longest segment when it must, and a subject cut off
   halfway ("...one bored dog on") gives the model a fragment to illustrate.
   Nothing here is allowed to be trimmed: shorten the subject instead. */
const cut = entries.filter(e => e.prompt.indexOf(e.meta.subject) < 0);

const L = [];
L.push('═══════════════════════════════════════════════════════════════');
L.push('  IL-KIRI — ART PROMPTS');
L.push('═══════════════════════════════════════════════════════════════');
L.push('  images            : ' + entries.length);
L.push('  P1 / P2           : ' + entries.filter(e => e.priority === 'P1').length +
       ' / ' + entries.filter(e => e.priority === 'P2').length);
L.push('  alpha cut-outs    : ' + entries.filter(e => e.out.alpha).length);
L.push('  unique ids        : ' + (dupId.length ? 'DUPLICATE ' + dupId.join(',') : 'OK'));
L.push('  unique filenames  : ' + (dupFile.length ? 'COLLISION ' + dupFile.join(',') : 'OK'));
L.push('  filename-safe ids : ' + (badId.length ? 'BAD ' + badId.map(e => e.id).join(',') : 'OK'));
L.push('  over 74 tokens    : ' + (over.length ? 'OVER ' + over.map(e => e.id).join(',') : 'OK — nothing is being binned'));
L.push('  asks for lettering: ' + (texty.length ? 'RISK ' + texty.map(e => e.id).join(',') : 'OK'));
L.push('  subject trimmed   : ' + (cut.length ? 'TRIMMED ' + cut.map(e => e.id).join(',') : 'OK — every subject survives whole'));
L.push('  longest prompt    : ' + Math.max.apply(null, entries.map(e => estTokens(e.prompt))) + ' tokens');
L.push('');
entries.forEach(e => {
  L.push('── ' + e.id + '  [' + e.priority + ']  ' + e.file + '  (' + estTokens(e.prompt) + ' tok)');
  L.push('   ' + e.meta.purpose);
  L.push('   ' + e.prompt);
  L.push('');
});
const report = L.join('\n');

if (process.argv.indexOf('--check') >= 0){
  console.log(report);
  process.exit(over.length || dupId.length || dupFile.length || badId.length || cut.length ? 1 : 0);
}

fs.mkdirSync(ART_DIR, { recursive: true });
fs.writeFileSync(path.join(ART_DIR, 'kiri-prompts.jsonl'),
  entries.map(e => JSON.stringify(e)).join('\n') + '\n');
fs.writeFileSync(path.join(ART_DIR, 'kiri-prompts.txt'), report);
/* the flatter shape the party-games art run merges */
fs.writeFileSync(path.join(ART_DIR, 'party-kiri.json'),
  JSON.stringify(ASSETS.map(a => ({
    id: a.id,
    file: 'art/ui/' + a.id + '.' + a.out.fmt,
    w: GEN.w, h: GEN.h,
    alpha: !!a.alpha,
    out: { w: a.out.w, h: a.out.h },
    purpose: a.purpose,
    subject: a.subject,
  })), null, 2) + '\n');

console.log(report);
console.log('wrote art/kiri-prompts.jsonl, art/kiri-prompts.txt, art/party-kiri.json');
