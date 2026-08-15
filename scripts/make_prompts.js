#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   KARTI — PROMPT BUILDER
   Reads js/cards.js (+ js/set2.js, js/set3.js … whatever exists) and writes one
   prompt per card, plus every UI asset, ready for the RunPod batch run.

   ┌───────────────────────────────────────────────────────────────────────┐
   │  WE GENERATE THE ART-WINDOW IMAGE ONLY. NEVER A WHOLE CARD.           │
   │  No frame, no border, no nameplate, no stat boxes, no rarity gem,     │
   │  no level stars, no text of any kind. css/cards.css draws all of      │
   │  that in HTML on top. Art and data stay decoupled so a card can be    │
   │  nerfed, renamed or re-joked without regenerating a single image.     │
   └───────────────────────────────────────────────────────────────────────┘

   Usage
     node scripts/make_prompts.js            # write art/prompts.{jsonl,txt} + MANIFEST.md
     node scripts/make_prompts.js --check    # dry-run report: counts + content-filter flags
     node scripts/make_prompts.js --p1-only  # only P1 assets (short-on-time run)

   Outputs (all under art/)
     prompts.jsonl  {id,file,prompt,negative,seed,width,height,priority,...}
     prompts.txt    human-readable, skim it before renting the GPU
     MANIFEST.md    live inventory table (card art + UI), regenerated every run

   Style source of truth: docs/ART_STYLE_BIBLE.md — keep them in sync by hand.
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT    = path.resolve(__dirname, '..');
const ART_DIR = path.join(ROOT, 'art');
const JS_DIR  = path.join(ROOT, 'js');

/* ───────────────────────────────────────────────────────────────────────────
   1. THE LOCKED STYLE  (docs/ART_STYLE_BIBLE.md §2)
   Every prompt ends with this. Never edit one prompt's copy in isolation.
   ─────────────────────────────────────────────────────────────────────────── */
const STYLE = [
  'bold-outline stylised cartoon caricature illustration',
  'thick uniform black ink outline',
  'flat cel shading with exactly two shadow tones and one hot rim highlight',
  'no gradients inside shapes',
  'limited flat colour palette, maximum five hues',
  'warm Mediterranean midday sunlight from the upper left',
  'crisp graphic shapes, subtle paper grain',
  'animated series key art, silkscreen poster look',
  'high contrast, strong readable silhouette',
].join(', ');

/* ── THE 77-TOKEN WALL ─────────────────────────────────────────────────────
   CLIP takes 77 tokens and silently bins the rest. The full STYLE + COMPOSITION
   + ART_ONLY blocks run past 150, so on the first smoke test everything after
   the subject was discarded and the model fell back to its default look — it
   returned oil paintings and photographs instead of flat cartoons.
   So: style leads (it is the one thing that must survive), and the prompt is
   assembled segment by segment against a hard budget. Same for the negative,
   which was also far over the limit — the "photorealistic" ban sat past token
   77 and never reached the model at all.                                     */
const TOKEN_BUDGET = 74;

/* CLIP splits on punctuation and sub-words, so a word averages ~1.35 tokens.
   Deliberately pessimistic: undershooting costs a few words, overshooting
   silently drops whatever matters least — which is what just bit us. */
const estTokens = s =>
  Math.ceil(String(s).trim().split(/\s+/).filter(Boolean).length * 1.35) +
  (String(s).match(/,/g) || []).length;

/* `required` is never dropped — only trimmed. An early version merely skipped any
   segment that did not fit, which silently binned the entire subject on the long
   UI prompts: the playmat prompt came back as style words alone and the model,
   left with "cartoon caricature" and nothing to draw, produced a man's face
   instead of a grass field. Optional segments are still dropped from the tail. */
function fitPrompt(required, optional = []) {
  const req = required.filter(Boolean).map(s => String(s).trim());
  let used = req.reduce((n, s) => n + estTokens(s) + 1, 0);

  /* over budget: trim words off the longest required segment until it fits */
  while (used > TOKEN_BUDGET) {
    let idx = 0;
    for (let i = 1; i < req.length; i++) {
      if (estTokens(req[i]) > estTokens(req[idx])) idx = i;
    }
    const words = req[idx].split(/\s+/);
    if (words.length <= 4) break;                 // nothing meaningful left to cut
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

/* The irreducible look. Must always survive — hence first, and kept short so it
   never crowds out the subject. No "poster"/"silkscreen": those made the model
   render a framed print hanging on a wall rather than the artwork itself. */
const STYLE_LEAD =
  'funny colourful cartoon comic illustration, thick black outline, flat bright colours, cel shaded';

/* Characters get the comedy dialled up; a playmat or a texture must not. */
const STYLE_FUNNY = 'exaggerated goofy comic expression, humorous caricature';

/* Trimmed to the bans that actually change the output. Ordered by damage done:
   wrong medium first, then card furniture, then anatomy. */
const NEGATIVE_SHORT = [
  'photorealistic','photograph','3d render','oil painting',
  'framed picture','poster on a wall','picture frame','border',
  'monochrome','black and white','pencil sketch',
  'text','letters','numbers','watermark','signature','logo',
  'blurry','cluttered','deformed hands','extra fingers','bad anatomy',
  'nsfw','nude','gore',
].join(', ');

/* Stated positively as well as in the negative — the model listens to both. */
const ART_ONLY =
  'standalone illustration artwork only, full bleed edge to edge, ' +
  'no card frame, no border, no nameplate, no text, no numbers, no logo, no watermark';

const NEGATIVE = [
  // text / card-game furniture — the #1 rejection reason
  'text','letters','words','writing','typography','caption','subtitle','signage','numbers','digits',
  'watermark','signature','artist name','logo','brand','speech bubble','meme text',
  'border','frame','card frame','trading card','card layout','card template','ornate border',
  'picture frame','vignette ring','nameplate','name banner','title bar','stat box','stat bar',
  'attack points','defense points','level stars','rarity gem','mana symbol','set symbol',
  'ui','hud','interface','button','icon overlay','tooltip',
  // wrong medium
  'photorealistic','photograph','photo','realistic skin texture','hyperrealism','3d render',
  'octane render','cgi','dslr','film still',
  'anime','manga','chibi','waifu','sketch','unfinished lineart','rough draft','doodle',
  'soft gradient shading','airbrush','blurry','out of focus','depth of field','bokeh',
  'low contrast','washed out','muddy colours','oversaturated neon',
  // anatomy
  'extra limbs','extra fingers','extra arms','extra heads','missing limbs','fused fingers',
  'deformed hands','malformed','mutated','disfigured','bad anatomy','long neck','cross eyed',
  'cropped head','out of frame','cut off',
  // safety
  'nsfw','nude','nudity','naked','topless','lingerie','underwear','cleavage','suggestive',
  'sexual','erotic','fetish',
  'gore','blood','wound','injury','corpse','death','violence','weapon pointed at viewer',
  'horror','scary','creepy','disturbing',
  'real person','celebrity','politician likeness','portrait of a real individual',
  // composition
  'cluttered background','busy background','crowd','many people','collage','multiple panels',
  'tiling','seamless pattern','duplicate subject','mirrored',
].join(', ');

/* ─── palette per attribute (ART_STYLE_BIBLE §3, locked to ATTR.c) ───────── */
const ATTR_ART = {
  festa:   { label:'FESTA',   hex:'#E8452C',
    pal:'hot vermilion red and orange, deep indigo night sky, gold and white spark highlights, warm firelight glow',
    env:'a village festa square at night, church dome silhouette, strings of festoon lights' },
  razzett: { label:'FARM',    hex:'#4CAF50',
    pal:'olive and grass green, terracotta orange, straw yellow, dusty warm earth tones, bright dry daylight',
    env:'dry Maltese farmland, rubble walls, prickly pear silhouette, hard noon sun' },
  belt:    { label:'CITY',    hex:'#9C27B0',
    pal:'violet and magenta, honey limestone beige, cool concrete grey, long dramatic shadows',
    env:'a narrow limestone street, enclosed wooden balconies, long late-afternoon shadows' },
  bahar:   { label:'SEA',     hex:'#2196F3',
    pal:'azure and turquoise blue, bleached white limestone, sun glare on water, bright airy light',
    env:'blinding blue Mediterranean water, white limestone rocks, painted luzzu boat silhouette' },
  hazen:   { label:'TROUBLE', hex:'#37474F',
    pal:'slate blue grey, sickly yellow green, muted desaturated tones, cold overcast light, one small warm accent',
    env:'a grey overcast street, unfinished concrete block, cold flat light' },
};
/* spells and traps have f:null — they get their frame colour instead */
const NOATTR_ART = {
  spell: { label:'SPELL', hex:'#189A70',
    pal:'emerald and jade green, warm cream, gold accents, clean bright light',
    env:'clean simple emerald green background, soft radial glow' },
  trap:  { label:'TRAP',  hex:'#BE3E9B',
    pal:'magenta and hot pink, deep purple shadow, cold blue rim light, tense dramatic lighting',
    env:'clean simple magenta background, deep purple shadow, tense mood' },
};

/* ─── rarity = light + angle + air, never colour (ART_STYLE_BIBLE §6) ────── */
const RARITY_ART = {
  komuni:      { label:'Common',
    art:'simple flat background, plain even lighting, everyday casual pose, no special effects',
    obj:'simple flat background, plain even lighting, no special effects' },
  rari:        { label:'Rare',
    art:'slightly dramatic lighting, one accent glow, subtle motion lines, confident dynamic pose',
    obj:'slightly dramatic lighting, one accent glow, subtle motion lines' },
  epiku:       { label:'Epic',
    art:'dramatic rim lighting, glowing energy accents, dynamic low angle hero pose, swirling debris and sparks, strong shadow contrast',
    obj:'dramatic rim lighting, glowing energy accents, low angle hero shot, swirling debris and sparks, strong shadow contrast' },
  leggendarju: { label:'Legendary',
    art:'epic dramatic hero shot, powerful low angle, brilliant golden god rays from behind, glowing aura, flying embers and swirling debris, deep dark background, intense cinematic contrast, awe inspiring presence' },
};
RARITY_ART.leggendarju.obj = RARITY_ART.leggendarju.art;   // already pose-free

/* ─── framing per card type (ART_STYLE_BIBLE §5) ─────────────────────────── */
const TYPE_ART = {
  monster: { lead:'chest-up three-quarter caricature portrait of',
             comp:'single character centred, eyeline at 45 percent from the top, big expressive features' },
  spell:   { lead:'a single hero object representing',
             comp:'one object centred and floating, slight low angle, clean empty background' },
  trap:    { lead:'a single dramatic object or moment representing',
             comp:'one object centred, tense dramatic staging, clean empty background' },
};

/* ─── the safe-zone instruction, on every card prompt ─────────────────────── */
/* The art ships square but the card's art window is ~1.35 wide, so `object-fit: cover`
   keeps only the central 74% of the height. A subject filling 70% leaves 4 points of
   margin — one bad composition and the crown gets cropped. 65% buys a comfortable 9. */
const COMPOSITION =
  'square composition, subject centred, subject fills 55 to 65 percent of the frame height, ' +
  'generous empty margin on all four sides, nothing important within 15 percent of any edge, ' +
  'simple uncluttered background, one flat colour field with at most one silhouette shape, ' +
  'soft dark vignette at the corners';

/* ═══════════════════════════════════════════════════════════════════════════
   2. SET METADATA — one booster pack per set, plus one per attribute
   Cards get their set from an explicit `s` field if the data has one, else
   from which file they were loaded out of. New files need one line here.
   ═══════════════════════════════════════════════════════════════════════════ */
const SET_META = {
  set1: { file:'cards.js', code:'KRT-01', name:'Il-Bidu',      en:'The Beginning',
          art:'a village festa square at dusk, church dome, first firework going up' },
  set2: { file:'set2.js',  code:'KRT-02', name:'Sajf',         en:'Summer',
          art:'blinding blue summer sea, painted luzzu boat, sun glare, heat haze' },
  set3: { file:'set3.js',  code:'KRT-03', name:'Festa Kbira',  en:'The Big Feast',
          art:'the sky completely full of exploding fireworks over a lit church facade at night' },
  set4: { file:'set4.js',  code:'KRT-04', name:'Set 4',        en:'',
          art:'a dramatic Maltese scene at golden hour' },
  set5: { file:'set5.js',  code:'KRT-05', name:'Set 5',        en:'',
          art:'a dramatic Maltese scene at blue hour' },
};
const SET_ORDER = Object.keys(SET_META);

/* ═══════════════════════════════════════════════════════════════════════════
   3. SUBJECT OVERRIDES
   The auto-derived subject is good for ~90% of cards. Anything that would
   generate badly — or trip a safety filter — gets a hand-written subject here.
   Terence: skim art/prompts.txt, and anything that reads wrong, drop in here.
   These are SUBJECTS ONLY. Style, palette, rarity and negatives are appended.
   ═══════════════════════════════════════════════════════════════════════════ */
const SUBJECT_OVERRIDES = {
  // --- softened so the safety checker never sees the trigger word ---
  bandist:   'a cheerful red-faced brass band trumpeter in uniform, cap crooked, cheeks puffed, playing confidently off-key',
  briju:     'a jubilant festa reveller throwing a plastic cup of golden liquid into the air, arms up, confetti',
  kazin:     'a crowded old village band club bar counter, marble top, arguing regulars gesturing',
  fenek:     'a rustic clay pot of slow-cooked rabbit stew steaming on a checked tablecloth',
  imnarja:   'a full moon over a rustic wooden feast table with a steaming pot and a folk singer mid-verse',
  kaccatur:  'a stout Maltese hunter in a flat cap and green jacket squinting up at the sky, binoculars raised',
  nannu:     'a wiry old grandfather in a flat cap gripping a woodcutting axe, mid-anecdote, very pleased with himself',
  nannaslip: 'a grandmother mid-throw, one rubber sandal flying through the air toward the viewer, comic motion lines',
  hangover:  'a queasy green-tinged young man in sunglasses clutching his head and a bottle of water, wincing at daylight',
  kelb:      'a scruffy farm dog on a rubble wall barking furiously at nothing, ears back, comic bark lines',
  pulizija:  'a shiny police car arriving with its light bar flashing, comic screech marks, no officers visible',
  valletta:  'a dense slow-moving line of shoppers on a narrow limestone shopping street, all shuffling, one exasperated face',
  dghajsa:   'a crowded party speedboat in swimwear, arms in the air, huge speaker on the deck, spray everywhere',

  // --- too abstract to draw from the joke alone: given a concrete object ---
  kont:      'a long unfurling paper utility bill scroll with a lightning bolt crackling across it, one shocked eye peeking over the top',
  cisk:      'two frosty green bottles of ice-cold lager clinking together, condensation running down, sparkle highlights',
  lampuka:   'a single gleaming iridescent dorado fish leaping, blue and gold scales, water droplets flying',
  qarnita:   'a cheerful cartoon octopus with all eight arms tangled in different chaotic tasks at once, exasperated expression',

  // ─── SET 3 · Festa Kbira ───────────────────────────────────────────────
  // safety-word reroutes
  dielja:    'a gnarled old grapevine heavy with purple grapes over a sunlit yard, one dusty unlabelled bottle of dark red on the wall below',
  mahzen:    'a cluttered farm shed doorway, hanging hand tools, jerry cans, a humming old fridge, warm dusty shaft of light',
  mistura:   'a small corked apothecary bottle of golden syrup with a lemon and a honey dipper beside it, faint magical shimmer',
  xalata:    'a packed vintage coach tilting round a bend, forty delighted pensioners waving out of the windows, one very calm driver',
  whisky:    'an ornate duty-free bottle of amber spirit still in its airport gift tin, a festive ribbon coming loose',
  // too abstract to draw from the joke alone
  kummissjoni: 'a long committee table strewn with paperwork and budget sheets, four men mid-argument pointing in four different directions',
  armar:     'an ornate gilded carved street pedestal statue draped in red velvet and gold leaf, glowing under festoon lights',
  narmarina: 'a floating fireworks barge out at sea at night launching a huge burst, silhouetted against the water',
  granita:   'a tall paper cup of crushed ice granita melting fast, bright syrup running over a sticky hand, sunlit stone steps',
  tea:       'an enormous mug of over-milked tea with a mountain of sugar cubes piled beside it, spoon standing bolt upright in it',
  hass:      'a swimmer in the sea grabbing a cramped calf with a comic pained grimace, motion lines, one lightning zigzag on the leg',
};

/* The bulk of the subjects live in art/overrides-*.json, written per-slice so the
   hand-tuned ones above stay readable. A card's joke is narrative ("nobody believes
   it, everybody accepts it") and gives the model nothing to draw — every card needs
   a written visual subject or it generates an abstract blob. Files loaded in sorted
   order; the literals above win, so a fix here is never silently overwritten. */
(function loadOverrideFiles() {
  const dir = path.join(__dirname, '..', 'art');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter(f => /^overrides-.*\.json$/.test(f)).sort();
  } catch (_) { return; }
  let added = 0;
  for (const f of files) {
    let obj;
    try { obj = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { console.error(`  ! ${f} is not valid JSON — skipped (${e.message})`); continue; }
    for (const [id, v] of Object.entries(obj)) {
      if (SUBJECT_OVERRIDES[id]) continue;           // hand-tuned literal wins
      SUBJECT_OVERRIDES[id] = v;
      added++;
    }
  }
  if (files.length) console.error(`  · ${added} subjects loaded from ${files.join(', ')}`);
})();

/* Words that make an SDXL safety checker return a black image, or just render
   badly. --check flags them; SUBJECT_OVERRIDES above is the fix. */
const RISKY_WORDS = {
  'drunk':'red-faced / merry',      'beer':'golden drink in a cup', 'booze':'drinks',
  'wine':'jug of red',              'whisky':'drink',              'hangover':'queasy, wincing',
  'naked':'in swimwear',            'topless':'in swimwear',       'nude':'in swimwear',
  'sexy':'glamorous',               'bikini':'swimwear',           'lingerie':'—',
  'shoot':'aim / point at',         'shoots':'aims at',            'shooting':'aiming',
  'gun':'shotgun broken open, unloaded', 'rifle':'—',              'weapon':'tool',
  'kill':'defeat',                  'killed':'defeated',           'dead':'motionless',
  'death':'the end',                'blood':'—',                   'gore':'—',
  'corpse':'—',                     'knife':'kitchen knife on a board',
  'axe':'woodcutting axe',          'punch':'shove',               'fight':'argument',
  'beat':'scold',                   'slap':'scold',                'smack':'scold',
  'drug':'—',                       'cigarette':'—',               'smoking':'steaming',
  'priest':'a robed figure seen from behind', 'nun':'a robed figure',
  'police':'a police car, no officers', 'arrest':'—',
};

/* ═══════════════════════════════════════════════════════════════════════════
   4. UI / MENU ART  (see docs/ASSET_LIST.md)
   Raw illustration only — never a mock-up with baked-in text. Wordmarks and
   all lettering are CSS/SVG, done separately, not generated.
   kind: 'char' | 'env' | 'object' | 'pack'
   alpha:true  → generated on flat black, luminance-keyed to alpha in postprocess
   ═══════════════════════════════════════════════════════════════════════════ */
function uiAssets() {
  const A = [];
  const add = o => A.push(Object.assign({ kind:'object', alpha:false, priority:'P1' }, o));

  /* ---------- identity ---------- */
  add({ id:'emblem', file:'art/ui/emblem.png', priority:'P1', w:1024, h:1024, alpha:true,
    out:{ w:1024, h:1024, fmt:'png' },
    purpose:'Master emblem/crest. Source for the app icons, favicon and the OG image. The KARTI wordmark is CSS text set NEXT to this — never generated.',
    kind:'object',
    subject:'a bold circular heraldic emblem crest, a Maltese eight-pointed cross fused with two crossed playing cards and a firework burst behind it, thick black outline, flat red gold and indigo, centred, symmetrical, no lettering of any kind, isolated on pure flat black background' });

  /* ---------- screens ---------- */
  add({ id:'home-bg', file:'art/ui/home-bg.jpg', priority:'P1', w:768, h:1344,
    out:{ w:900, h:1600, fmt:'jpg' }, kind:'env',
    purpose:'Home / main-menu background, phone portrait. Buttons and the wordmark sit on top in CSS, so the middle must stay quiet.',
    subject:'wide vertical establishing scene, a Maltese village square at night seen from below, illuminated church facade far in the background, fireworks in the upper sky, festoon lights, empty quiet space through the centre of the frame for interface elements, no people in the centre' });

  add({ id:'board', file:'art/ui/board.jpg', priority:'P1', w:832, h:1216,
    out:{ w:828, h:1210, fmt:'jpg' }, kind:'env',
    purpose:'Duel playmat, phone portrait. The 5 monster + 5 spell/trap zones per side are drawn as CSS boxes ON TOP — do NOT generate zone rectangles or any layout.',
    subject:'uniform seamless mown grass texture, even short green turf, same all over, fine blade detail, soft even sunlight, very slightly darker at the edges' });

  add({ id:'board-wide', file:'art/ui/board-wide.jpg', priority:'P2', w:1344, h:768,
    out:{ w:1600, h:914, fmt:'jpg' }, kind:'env',
    purpose:'Landscape playmat variant for tablet / desktop.',
    subject:'a lush green grass field seen from directly above, soft mown turf with gentle stripes, warm pool of sunlight in the centre, deep green vignetted edges, completely empty ground, no markings, no buildings' });

  /* ---------- alternate playmat themes ----------
     One unlockable field per theme. Same top-down empty-surface rule as `board`:
     the 5+5 zone boxes are CSS on top, so the art must never contain a rectangle. */
  const FIELDS = {
    'board-sand':  'uniform seamless golden sand texture, fine even grain, same all over, soft light, slightly deeper amber at the edges',
    'board-night': 'uniform seamless deep blue starfield texture, small scattered stars evenly spread, faint nebula haze, darker at the edges',
    'board-stone': 'uniform seamless dark slate texture, fine even mineral speckle, same all over, soft sheen, darker at the edges',
    'board-sea':   'uniform seamless turquoise water texture, small even ripples all over, soft caustic sparkle, deeper blue at the edges',
    'board-lava':  'uniform seamless black volcanic rock texture, fine even crackle glowing faint orange, same all over, darker at the edges',
  };
  for (const [id, look] of Object.entries(FIELDS)) {
    add({ id, file:`art/ui/${id}.jpg`, priority:'P1', w:832, h:1216,
      out:{ w:828, h:1210, fmt:'jpg' }, kind:'env',
      purpose:'Alternate duel playmat, phone portrait. Zones are CSS boxes on top — never generate rectangles or layout.',
      /* "no path/track/edging" earns its place: the first green field came back as a
         sports pitch ringed by a running track, which would fight the CSS zone boxes. */
      subject:`${look}, flat overhead texture filling the whole frame, no objects` });
  }

  /* ---------- board furniture ----------
     Deck, graveyard and banished piles sit beside the zones. Cut out on black so
     they drop onto any of the six playmats without a background seam. */
  add({ id:'pile-deck', file:'art/ui/pile-deck.png', priority:'P1', w:1024, h:1024, alpha:true,
    out:{ w:512, h:512, fmt:'png' }, kind:'object',
    subject:'a neat squared-off stack of face-down playing cards seen at a three-quarter angle, ornate dark indigo and gold patterned backs, crisp clean edges, thick black outline, isolated on pure flat black background' });

  add({ id:'pile-grave', file:'art/ui/pile-grave.png', priority:'P1', w:1024, h:1024, alpha:true,
    out:{ w:512, h:512, fmt:'png' }, kind:'object',
    subject:'an untidy leaning stack of spent face-down cards at a three-quarter angle, corners bent and scuffed, dull grey and faded violet backs, a wisp of pale smoke curling from the top, thick black outline, isolated on pure flat black background' });

  add({ id:'pile-banish', file:'art/ui/pile-banish.png', priority:'P1', w:1024, h:1024, alpha:true,
    out:{ w:512, h:512, fmt:'png' }, kind:'object',
    subject:'a small stack of cards at a three-quarter angle dissolving into drifting cold blue embers at its upper edge, frost pale backs, thick black outline, isolated on pure flat black background' });

  add({ id:'zone-monster', file:'art/ui/zone-monster.png', priority:'P1', w:1024, h:1024, alpha:true,
    out:{ w:400, h:560, fmt:'png' }, kind:'object',
    subject:'an ornate empty upright rectangular card slot frame, thin engraved amber gold border with small corner flourishes and a faint crossed-swords motif centred inside, hollow and completely empty in the middle, thick black outline, isolated on pure flat black background' });

  add({ id:'zone-spell', file:'art/ui/zone-spell.png', priority:'P1', w:1024, h:1024, alpha:true,
    out:{ w:400, h:560, fmt:'png' }, kind:'object',
    subject:'an ornate empty upright rectangular card slot frame, thin engraved emerald green border with small corner flourishes and a faint spiral rune motif centred inside, hollow and completely empty in the middle, thick black outline, isolated on pure flat black background' });

  add({ id:'cardback', file:'art/ui/cardback.jpg', priority:'P1', w:832, h:1216,
    out:{ w:590, h:860, fmt:'jpg' }, kind:'object',
    purpose:'Face-down card back (.card--face-down). 59:86 to match the card frame exactly.',
    subject:'an ornate symmetrical card back pattern, a Maltese eight-pointed cross medallion in the centre surrounded by radiating festa firework rays and filigree, deep indigo and gold and red, thick black outline, perfectly symmetrical, full bleed pattern to all four edges, no lettering' });

  add({ id:'victory', file:'art/ui/victory.jpg', priority:'P1', w:832, h:1216,
    out:{ w:828, h:1210, fmt:'jpg' }, kind:'env',
    purpose:'Win screen background. "REBAH / YOU WIN" is CSS text on top.',
    subject:'a triumphant burst of golden fireworks over a lit church dome at night, confetti and streamers falling, warm gold and red, radiant light from the centre, empty space in the middle third for interface text' });

  add({ id:'defeat', file:'art/ui/defeat.jpg', priority:'P1', w:832, h:1216,
    out:{ w:828, h:1210, fmt:'jpg' }, kind:'env',
    purpose:'Loss screen background.',
    subject:'a grey rainy empty village square at dawn, one broken deflated balloon in a puddle, spent firework casings, cold desaturated slate blue, melancholy, empty space in the middle third for interface text' });

  add({ id:'vs-splash', file:'art/ui/vs-splash.jpg', priority:'P2', w:832, h:1216,
    out:{ w:828, h:1210, fmt:'jpg' }, kind:'env',
    purpose:'Pre-duel splash behind the two portraits.',
    subject:'a dramatic diagonal split background, hot red light clashing with cold blue light, radiating speed lines from the centre, sparks, high contrast, empty centre' });

  add({ id:'loading', file:'art/ui/loading.jpg', priority:'P2', w:832, h:1216,
    out:{ w:828, h:1210, fmt:'jpg' }, kind:'env',
    purpose:'Loading / transition background.',
    subject:'a calm empty Maltese limestone alley at golden hour, long shadows, warm honey light, very simple, mostly empty frame' });

  /* ---------- booster packs, one per attribute ---------- */
  for (const [k, a] of Object.entries(ATTR_ART)) {
    add({ id:`pack-${k}`, file:`art/ui/pack-${k}.png`, priority:'P1', w:832, h:1216, alpha:true,
      out:{ w:620, h:900, fmt:'png' }, kind:'pack',
      purpose:`Sealed ${a.label} booster pack. Pack name text is CSS on top — none baked in.`,
      subject:`a sealed glossy foil trading card pack standing upright, blank front with no lettering, dominant colour ${a.pal}, a single bold graphic emblem in the centre of the wrapper, crimped serrated top edge, soft foil sheen, isolated on pure flat black background` });
  }

  /* ---------- booster packs, one per SET (grows with the game) ---------- */
  for (const key of SET_ORDER) {
    const m = SET_META[key];
    add({ id:`pack-${key}`, file:`art/ui/pack-${key}.png`, priority: key === 'set1' || key === 'set2' || key === 'set3' ? 'P1' : 'P2',
      w:832, h:1216, alpha:true, out:{ w:620, h:900, fmt:'png' }, kind:'pack',
      purpose:`Sealed booster pack for set ${m.code} "${m.name}"${m.en ? ` (${m.en})` : ''}. Set name is CSS text on top.`,
      subject:`a sealed glossy foil trading card pack standing upright, blank wrapper with absolutely no lettering, the artwork on the wrapper shows ${m.art}, crimped serrated top edge, soft foil sheen, isolated on pure flat black background` });
  }

  add({ id:'pack-starter', file:'art/ui/pack-starter.png', priority:'P2', w:832, h:1216, alpha:true,
    out:{ w:620, h:900, fmt:'png' }, kind:'pack',
    purpose:'Neutral / starter pack.',
    subject:'a sealed glossy foil trading card pack standing upright, blank cream and gold wrapper with no lettering, a simple Maltese cross emblem centred, crimped serrated top edge, isolated on pure flat black background' });

  /* ---------- effects (generated on black, keyed to alpha) ---------- */
  add({ id:'burst', file:'art/ui/burst.png', priority:'P1', w:1024, h:1024, alpha:true,
    out:{ w:1024, h:1024, fmt:'png' }, kind:'object',
    purpose:'Pack-tear burst, played over the pack-opening animation.',
    subject:'an explosive radial burst of white and gold light rays with flying confetti sparks and star shapes radiating from the centre, symmetrical, on pure flat black background' });

  const glows = { rare:['cool blue','#2196F3'], epic:['violet purple','#9C27B0'], legendary:['brilliant gold','#FFB300'] };
  for (const [r, [hue]] of Object.entries(glows)) {
    add({ id:`glow-${r}`, file:`art/ui/glow-${r}.png`, priority:'P1', w:1024, h:1024, alpha:true,
      out:{ w:1024, h:1024, fmt:'png' }, kind:'object',
      purpose:`${r[0].toUpperCase()+r.slice(1)} rarity reveal glow, composited over the card on pull.`,
      subject:`a soft radial ${hue} energy glow with rising sparks and light motes, bright at the centre fading to nothing at the edges, symmetrical, on pure flat black background` });
  }

  /* ---------- icons ---------- */
  add({ id:'icon-coin', file:'art/ui/icon-coin.png', priority:'P1', w:1024, h:1024, alpha:true,
    out:{ w:256, h:256, fmt:'png' }, kind:'object',
    purpose:'Soft-currency icon (coins).',
    subject:'a single chunky gold coin at a three-quarter angle with a small stack behind it, an eight-pointed Maltese cross embossed on the face, no lettering or numerals, thick black outline, flat gold and amber, isolated on pure flat black background' });

  add({ id:'icon-dust', file:'art/ui/icon-dust.png', priority:'P1', w:1024, h:1024, alpha:true,
    out:{ w:256, h:256, fmt:'png' }, kind:'object',
    purpose:'Crafting-dust icon (card disenchant currency).',
    subject:'a small swirling pile of glowing violet crystal dust with floating sparkling motes rising from it, thick black outline, flat violet and white, isolated on pure flat black background' });

  add({ id:'btn-stone', file:'art/ui/btn-stone.png', priority:'P2', w:1024, h:1024, alpha:false,
    out:{ w:512, h:512, fmt:'jpg' }, kind:'object',
    purpose:'Button / panel texture, sliced with CSS border-image. Label text is CSS.',
    subject:'a flat seamless warm honey Maltese limestone surface texture, fine even grain, soft top-left light, completely blank and even, no objects, no lettering, no edges' });

  add({ id:'btn-brass', file:'art/ui/btn-brass.png', priority:'P2', w:1024, h:1024, alpha:false,
    out:{ w:512, h:512, fmt:'jpg' }, kind:'object',
    purpose:'Primary-button / accent texture.',
    subject:'a flat brushed brass and gold metal surface texture, soft warm sheen, even lighting, completely blank, no objects, no lettering' });

  add({ id:'panel-parchment', file:'art/ui/panel-parchment.png', priority:'P2', w:1024, h:1024, alpha:false,
    out:{ w:512, h:512, fmt:'jpg' }, kind:'object',
    purpose:'Dialog / panel background texture.',
    subject:'a flat aged cream parchment paper texture, subtle fibre grain, very slight warm mottling, completely blank, no lettering, no edges, no curl' });

  /* ---------- story-mode boss portraits ---------- */
  const bosses = {
    festa:   'a towering imperious village festa committee chairman in a sash, arms folded, fireworks behind him',
    razzett: 'a colossal weather-beaten farmer standing on a tractor, pitchfork over one shoulder, sun behind him',
    belt:    'a smug enormous property developer in a sharp suit holding rolled building plans, cranes behind him',
    bahar:   'a mighty sun-scorched old fisherman at the tiller of a painted luzzu, storm sea behind him',
    hazen:   'a monumental disapproving grandmother in black, arms folded, one eyebrow raised, storm clouds behind her',
  };
  for (const [k, s] of Object.entries(bosses)) {
    const a = ATTR_ART[k];
    add({ id:`boss-${k}`, file:`art/ui/boss-${k}.png`, priority:'P2', w:832, h:1216, alpha:true,
      out:{ w:620, h:900, fmt:'png' }, kind:'char',
      purpose:`Story-mode ${a.label} boss portrait, composited over the vs-splash.`,
      subject:`full figure heroic low angle caricature of ${s}, ${a.pal}, dramatic rim lighting, isolated on pure flat black background` });
  }
  add({ id:'boss-final', file:'art/ui/boss-final.png', priority:'P2', w:832, h:1216, alpha:true,
    out:{ w:620, h:900, fmt:'png' }, kind:'char',
    purpose:'Final story boss.',
    subject:'full figure heroic low angle caricature of a monumental terrifying mother-in-law in black seated on a throne of stacked plastic patio chairs, wooden spoon held like a sceptre, golden god rays behind her, deep indigo and gold, isolated on pure flat black background' });

  /* ── party-game emblems ─────────────────────────────────────────────────
     EMBLEMS ONLY. The game names are CSS text set beside these, never generated:
     image models render lettering as convincing garbage. Same rule as the KARTI
     emblem, and the reason every prompt here bans text outright. */
  const PARTY_LOGOS = {
    party:  'a battered Maltese bar table seen from above with a deck of cards, two dice and a bottle cap arranged on it, warm overhead light',
    chess:  'a single carved limestone chess knight in three-quarter view, chipped and old, a faint Maltese cross cut into its base, dramatic side light',
    dama:   'three stacked draughts pieces in olive green and terracotta, the top one crowned, at a low angle on a worn wooden board',
    skarta: 'a fan of four bold blank playing cards thrown down hard, one landing face up, motion lines and a small puff of dust',
    kiri:   'a small honey limestone Maltese townhouse with an enclosed wooden balcony, a signpost with a completely blank face, a construction crane looming behind',
  };
  for (const [id, subj] of Object.entries(PARTY_LOGOS)) {
    add({ id:`logo-${id}`, file:`art/ui/logo-${id}.png`, priority:'P1', w:1024, h:1024, alpha:true,
      out:{ w:512, h:512, fmt:'png' }, kind:'object',
      purpose:`Party-games emblem for ${id}. Wordmark is CSS text — never generated.`,
      subject:`${subj}, centred, generous empty margin, isolated on pure flat black background` });
  }

  /* ── one portrait per story boss ─────────────────────────────────────────
     The attribute-keyed portraits above only cover 5 factions, but story mode
     has 8 named bosses — so doris/kuntrattur, kunjata/vat and guzi/nanna were
     each wearing another character's face. js/story.js looks for
     art/ui/boss-<id>.png first and falls back to the attribute portrait. */
  const STORY_BOSSES = {
    cikku:      'a red-faced merry old man at a village band club bar, four empty glasses in front of him, sleeves rolled up, holding a fan of cards far too confidently',
    doris:      'a stern council clerk woman behind a counter window, glasses on a chain, one hand flat on a stack of blank forms, the shutter half pulled down',
    guzi:       'a weathered Maltese farmer in a flat cap standing in front of his tractor, arms folded, two scruffy dogs at his boots, absolutely immovable',
    salvu:      'a grizzled old sea captain with a white beard and a heavy knitted jumper, pipe clamped in his teeth, squinting at a storm nobody else can see',
    kunjata:    'a monumental grandmother in black, arms folded, one eyebrow arched, judging you from a lifetime of collected evidence',
    kuntrattur: 'a smug building contractor in a hard hat and gold chain, arms spread wide over a half-finished wall, a cement mixer idling behind him',
    vat:        'a thin implacable tax inspector in a grey suit, sleeves rolled, standing beside a waist-high avalanche of blank receipts, all afternoon free',
    nanna:      'a tiny beaming grandmother holding out an enormous plate of food with both hands, apron on, entirely in charge of everything',
  };
  for (const [id, s] of Object.entries(STORY_BOSSES)) {
    add({ id:`boss-${id}`, file:`art/ui/boss-${id}.png`, priority:'P1', w:832, h:1216, alpha:true,
      out:{ w:620, h:900, fmt:'png' }, kind:'char',
      purpose:`Story boss portrait for ${id} — one face per character.`,
      subject:`full figure heroic low angle caricature of ${s}, dramatic rim lighting, isolated on pure flat black background` });
  }

  /* The city/bureaucracy set shipped wearing pack-set3's festa church — right
     colour, wrong joke entirely. */
  add({ id:'pack-eeg', file:'art/ui/pack-eeg.png', priority:'P1', w:832, h:1216,
    out:{ w:620, h:900, fmt:'png' }, kind:'pack',
    purpose:'Pack face for EEG — ERĠA\' EJJA GĦADA (come back tomorrow).',
    subject:'a sealed glossy foil trading card pack standing upright, violet and magenta, showing a shuttered government counter window with a long queue of tiny figures snaking away from it and a crane looming behind, no lettering' });

  return A;
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. LOAD CARD DATA
   cards.js declares CARDS with `const`; set2.js does `CARDS.push(...SET2)`.
   They must therefore run in ONE script scope. We concatenate, then export.
   ═══════════════════════════════════════════════════════════════════════════ */
function runCardScripts(files) {
  /* All files must share ONE script scope: cards.js declares `const CARDS`,
     set2.js does `CARDS.push(...SET2)`. Concatenate, run, export. */
  const src = files.map(f => `\n/* ==== ${f} ==== */\n` + fs.readFileSync(path.join(JS_DIR, f), 'utf8'))
                   .join('\n')
            + '\n;globalThis.__out = CARDS;\n';
  const sandbox = { console: { log(){}, warn(){}, error(){} } };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'karti-carddata.js' });
  return sandbox.__out;
}

function loadCards() {
  const present = SET_ORDER.filter(k => fs.existsSync(path.join(JS_DIR, SET_META[k].file)));
  if (!present.length) throw new Error('No card data found in ' + JS_DIR);

  /* Run cumulatively (cards.js, then cards+set2, …) and diff the LENGTHS, so we
     know which file each card came from even though later sets push into the
     same CARDS array. Only a handful of files, so the cost is irrelevant.
     Note: each pass returns a fresh array of fresh objects, so we must collect
     the boundaries first and stamp them onto the FINAL array afterwards. */
  const files = present.map(k => SET_META[k].file);
  const bounds = present.map((key, i) => ({ key, len: runCardScripts(files.slice(0, i + 1)).length }));
  const cards = runCardScripts(files);

  let from = 0;
  for (const b of bounds) {
    for (let j = from; j < b.len && j < cards.length; j++) cards[j].__set = b.key;
    from = b.len;
  }

  /* an explicit `s` / `set` field on a card always wins over the file it was in */
  cards.forEach(c => { c.__set = c.s || c.set || c.__set || 'set1'; });
  return { cards, loaded: present };
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. SUBJECT DERIVATION
   Card name + the visual half of the joke, with all game mechanics stripped.
   Hard-capped at 20 words so the style block always dominates (BIBLE §2).
   ═══════════════════════════════════════════════════════════════════════════ */
const MECHANIC_RE = new RegExp(
  '\\b(atk|def|lp|hp|summon|summoned|destroy|destroyed|discard|damage|heal|healed|' +
  'turn|turns|opponent|deck|graveyard|hand|tribute|attack|attacks|negate|negated|' +
  'draw|draws|effect|taunt|gains?|loses?|target|phase|player|monster|card|cards|' +
  'this|copy|copies|once|instead|activate)\\b', 'i');

/* A monster is not always a person — "The Sign Facing The Wall" and "Ticket Number 84"
   are objects, and a chest-up portrait of a ticket is nonsense. An override may declare
   its own framing: {s:'...', framing:'portrait'|'object'|'scene'}. */
const FRAMING = {
  portrait: { lead:'chest-up three-quarter caricature portrait of',
              comp:'single character centred, eyeline at 45 percent from the top, big expressive features' },
  object:   { lead:'a single hero object,',
              comp:'one object centred, slight low angle, clean empty background' },
  scene:    { lead:'a single wide comic moment,',
              comp:'one clear focal point, staged like a stage set, clean empty background' },
};

function cleanSubject(card) {
  const ov = SUBJECT_OVERRIDES[card.id];
  if (ov) {
    const text = typeof ov === 'string' ? ov : ov.s;
    return { text, overridden: true, framing: typeof ov === 'string' ? null : ov.framing };
  }

  let name = card.n || card.id;
  if (name === name.toUpperCase()) name = name.toLowerCase();   // "THE KUNJATA" → "the kunjata"

  /* keep only the sentences of the joke that describe something you can draw */
  const hint = String(card.txt || '')
    .replace(/[""'']/g, '')                 // no quoted dialogue → no text in image
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim() && !MECHANIC_RE.test(s))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '')
    .trim();

  let text = hint ? `${name}, ${hint.toLowerCase()}` : name;
  /* Cut at a clause boundary, never mid-sentence: a dangling "...it is now daylight and"
     gives the model a fragment to illustrate and it draws nothing coherent. */
  const words = text.split(/\s+/);
  if (words.length > 20) {
    const kept = words.slice(0, 20).join(' ');
    const clause = kept.lastIndexOf(',');
    text = clause > 12 ? kept.slice(0, clause) : kept;
  }
  text = text.replace(/[\s,]+(and|or|but|the|a|an|of|on|in|to|is|was|it|that|with)$/i, '')
             .replace(/[\s,]+$/, '');
  return { text, overridden: false };
}

/* deterministic seed from the card id — same card, same picture, forever */
function seedOf(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) % 2147483647;
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. BUILD
   ═══════════════════════════════════════════════════════════════════════════ */
const GEN = { w: 1024, h: 1024 };          // SDXL native square (BIBLE §5)
const OUT = { w: 768,  h: 768, fmt: 'jpg' }; // shipped card art

function cardPrompt(card) {
  const type  = TYPE_ART[card.t] || TYPE_ART.monster;
  const attr  = card.f ? ATTR_ART[card.f] : (NOATTR_ART[card.t] || NOATTR_ART.spell);
  const rar   = RARITY_ART[card.r] || RARITY_ART.komuni;
  const { text: subject, overridden, framing } = cleanSubject(card);
  const frame = (framing && FRAMING[framing]) || type;

  /* Priority order, highest first — fitPrompt drops from the tail. Style and
     subject always survive; the rarity flourish is the first thing sacrificed. */
  const isChar = framing ? framing === 'portrait' : card.t === 'monster';
  const prompt = fitPrompt(
    [ STYLE_LEAD, STYLE_FUNNY, `${frame.lead} ${subject}` ],
    [ 'centred, generous empty margin, simple uncluttered background',
      attr.pal,
      isChar ? rar.art : (rar.obj || rar.art) ]   // objects have no "pose"
  );

  return {
    id: card.id,
    kind: 'card',
    file: `art/${card.id}.${OUT.fmt}`,
    raw:  `art/raw/${card.id}.png`,
    prompt,
    negative: NEGATIVE_SHORT,
    seed: seedOf(card.id),
    width: GEN.w, height: GEN.h,
    out: { ...OUT, fit: 'cover' },
    priority: 'P1',
    meta: {
      name: card.n, type: card.t, attr: card.f || null, attrLabel: attr.label,
      rarity: card.r, rarityLabel: rar.label, set: card.__set,
      setCode: (SET_META[card.__set] || {}).code || 'KRT-01',
      subject, overridden,
    },
  };
}

function uiPrompt(a) {
  const styleFor = {
    env:    'wide establishing illustration, no central subject, background art only',
    char:   'full figure character illustration, centred, generous margin on all sides',
    object: 'single object centred, generous margin on all sides',
    pack:   'single product illustration centred, generous margin on all sides',
  };
  /* A playmat or a flat texture must not be told to look "goofy" — that is what
     turned the grass field into a cartoon face. Only characters get the comedy. */
  const prompt = fitPrompt(
    [ STYLE_LEAD, a.kind === 'char' ? STYLE_FUNNY : null, a.subject ],
    [ styleFor[a.kind] || styleFor.object ]
  );

  return {
    id: a.id,
    kind: 'ui',
    file: a.file,
    raw:  `art/raw/${a.id}.png`,
    prompt,
    /* Playmats keep coming back with something running through the middle — first a
       running track around the pitch, then a path down the centre. Anything linear
       lands exactly where the zone boxes go, so ban it explicitly. */
    negative: a.kind === 'env'
      ? NEGATIVE_SHORT + ', path, road, river, trail, stripe, divider, horizon, seam'
      : NEGATIVE_SHORT,
    seed: seedOf(a.id),
    width: a.w, height: a.h,
    out: { ...a.out, fit: a.kind === 'env' ? 'cover' : 'contain', alpha: !!a.alpha },
    priority: a.priority,
    meta: { purpose: a.purpose, uiKind: a.kind, alpha: !!a.alpha },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. CHECK MODE
   ═══════════════════════════════════════════════════════════════════════════ */
function riskScan(card) {
  const hay = [card.n, card.txt, card.eff].filter(Boolean).join(' ').toLowerCase();
  const hits = [];
  for (const w of Object.keys(RISKY_WORDS)) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(hay)) hits.push(w);
  }
  return hits;
}

function report(entries, cards, loaded) {
  const cardEntries = entries.filter(e => e.kind === 'card');
  const uiEntries   = entries.filter(e => e.kind === 'ui');
  const tally = (arr, fn) => arr.reduce((m, x) => (m[fn(x)] = (m[fn(x)] || 0) + 1, m), {});
  const line  = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])
                   .map(([k, v]) => `${k}=${v}`).join('  ');

  const L = [];
  L.push('═══════════════════════════════════════════════════════════════');
  L.push('  KARTI — PROMPT CHECK');
  L.push('═══════════════════════════════════════════════════════════════');
  L.push(`  data files loaded : ${loaded.map(k => SET_META[k].file).join(', ')}`);
  L.push('');
  L.push(`  TOTAL PROMPTS     : ${entries.length}`);
  L.push(`    card art        : ${cardEntries.length}`);
  L.push(`    UI art          : ${uiEntries.length}`);
  L.push(`  priority  P1      : ${entries.filter(e => e.priority === 'P1').length}`);
  L.push(`            P2      : ${entries.filter(e => e.priority === 'P2').length}`);
  L.push('');
  L.push(`  by attribute      : ${line(tally(cardEntries, e => e.meta.attrLabel))}`);
  L.push(`  by rarity         : ${line(tally(cardEntries, e => e.meta.rarityLabel))}`);
  L.push(`  by type           : ${line(tally(cardEntries, e => e.meta.type))}`);
  L.push(`  by set            : ${line(tally(cardEntries, e => e.meta.setCode))}`);
  L.push(`  UI by priority    : ${line(tally(uiEntries, e => e.priority))}`);
  L.push('');

  /* collision + coverage integrity */
  const files = entries.map(e => e.file);
  const dupFiles = [...new Set(files.filter((f, i) => files.indexOf(f) !== i))];
  const ids = entries.map(e => e.id);
  const dupIds = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  L.push('  ── integrity ─────────────────────────────────────────────────');
  L.push(`  unique ids        : ${new Set(ids).size} / ${ids.length}   ${dupIds.length ? 'DUPLICATE: ' + dupIds.join(',') : 'OK'}`);
  L.push(`  unique filenames  : ${new Set(files).size} / ${files.length}   ${dupFiles.length ? 'COLLISION: ' + dupFiles.join(',') : 'OK'}`);
  L.push(`  cards -> art files: ${cards.length} cards -> ${cardEntries.length} files   ${cards.length === cardEntries.length ? 'OK 1:1' : 'MISMATCH'}`);
  const badId = entries.filter(e => !/^[a-z0-9][a-z0-9_-]*$/.test(e.id));
  L.push(`  filename-safe ids : ${badId.length ? 'BAD: ' + badId.map(e => e.id).join(',') : 'OK'}`);
  L.push('');

  /* content-filter flags */
  const flagged = cards.map(c => ({ c, hits: riskScan(c) })).filter(x => x.hits.length);
  const unfixed = flagged.filter(x => !SUBJECT_OVERRIDES[x.c.id]);
  L.push('  ── content-filter flags ──────────────────────────────────────');
  L.push(`  cards containing risky words : ${flagged.length}`);
  L.push(`  already hand-overridden      : ${flagged.length - unfixed.length}`);
  L.push(`  STILL NEEDING A LOOK         : ${unfixed.length}`);
  if (unfixed.length) {
    L.push('');
    for (const { c, hits } of unfixed) {
      L.push(`   ! ${c.id.padEnd(14)} "${c.n}"`);
      L.push(`       words  : ${hits.map(w => `${w} -> ${RISKY_WORDS[w]}`).join(' ; ')}`);
      L.push(`       subject: ${cleanSubject(c).text}`);
      L.push(`       fix    : add '${c.id}' to SUBJECT_OVERRIDES in scripts/make_prompts.js`);
    }
  } else {
    L.push('   all clear — every risky card has a hand-written subject.');
  }
  L.push('');

  /* prompts that look weak */
  const thin = cardEntries.filter(e => e.meta.subject.split(/\s+/).length < 7 && !e.meta.overridden);
  L.push('  ── weak subjects (too short / too abstract to draw) ──────────');
  L.push(`  count: ${thin.length}`);
  thin.slice(0, 25).forEach(e => L.push(`   ? ${e.id.padEnd(14)} ${e.meta.subject}`));
  if (thin.length) L.push('     fix: add these ids to SUBJECT_OVERRIDES with a concrete object to draw.');
  L.push(`  hand-written subjects in use : ${cardEntries.filter(e => e.meta.overridden).length}`);
  L.push('');

  /* run estimate */
  const SPI = 5.0;
  const p1 = entries.filter(e => e.priority === 'P1').length;
  const fmt = s => `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  L.push('  ── GPU estimate @ 5.0 s/image (RTX 4090, SDXL 1024, 30 steps) ─');
  L.push(`  P1 only    : ${p1} imgs -> ${fmt(p1 * SPI)}`);
  L.push(`  everything : ${entries.length} imgs -> ${fmt(entries.length * SPI)}`);
  L.push(`  x2 variants: ${entries.length * 2} imgs -> ${fmt(entries.length * 2 * SPI)}`);
  L.push(`  throughput : ~${Math.round(3600 / SPI)} images per GPU hour`);
  L.push('═══════════════════════════════════════════════════════════════');
  return L.join('\n');
}

/* ═══════════════════════════════════════════════════════════════════════════
   9. WRITERS
   ═══════════════════════════════════════════════════════════════════════════ */
function writeTxt(entries) {
  const L = [];
  L.push('KARTI — GENERATION PROMPTS (human-readable)');
  L.push('Generated by scripts/make_prompts.js — do not edit this file, edit the script.');
  L.push('');
  L.push('ART-WINDOW IMAGES ONLY. No card frames, no borders, no text, no stat boxes.');
  L.push('The game draws the whole card in HTML/CSS on top of these — so stats, names,');
  L.push('jokes and effects can all be changed later without regenerating any art.');
  L.push('');
  L.push('If a prompt below would clearly generate rubbish, add that card id to');
  L.push('SUBJECT_OVERRIDES in scripts/make_prompts.js and re-run. Do it BEFORE the pod.');
  L.push('');
  L.push(`NEGATIVE (identical for every image):\n  ${NEGATIVE}`);
  L.push('');
  L.push('='.repeat(100));

  for (const grp of ['card', 'ui']) {
    const es = entries.filter(e => e.kind === grp);
    if (!es.length) continue;
    L.push('');
    L.push(`### ${grp === 'card' ? 'CARD ART' : 'UI / MENU ART'} — ${es.length} images`);
    L.push('='.repeat(100));
    for (const e of es) {
      L.push('');
      L.push(`[${e.priority}] ${e.id}   ->  ${e.file}   (${e.width}x${e.height} -> ${e.out.w}x${e.out.h} ${e.out.fmt})  seed ${e.seed}`);
      if (e.kind === 'card') {
        L.push(`      ${e.meta.name}  ·  ${e.meta.attrLabel} / ${e.meta.type} / ${e.meta.rarityLabel} / ${e.meta.setCode}${e.meta.overridden ? '  [hand-written subject]' : ''}`);
      } else {
        L.push(`      ${e.meta.purpose}`);
      }
      L.push(`      PROMPT: ${e.prompt}`);
    }
  }
  fs.writeFileSync(path.join(ART_DIR, 'prompts.txt'), L.join('\n') + '\n');
}

function writeManifest(entries) {
  const L = [];
  L.push('# KARTI — ASSET MANIFEST (generated)');
  L.push('');
  L.push('Regenerated by `node scripts/make_prompts.js`. Do not hand-edit.');
  L.push('');
  L.push('**Every image here is an art-window illustration only** — no frame, no border,');
  L.push('no text. `css/cards.css` renders the card around it.');
  L.push('');
  const p1 = entries.filter(e => e.priority === 'P1').length;
  L.push(`Total **${entries.length}** images — P1 **${p1}**, P2 **${entries.length - p1}**.`);
  L.push('');
  for (const grp of ['card', 'ui']) {
    const es = entries.filter(e => e.kind === grp);
    if (!es.length) continue;
    L.push(`## ${grp === 'card' ? 'Card art' : 'UI / menu art'} (${es.length})`);
    L.push('');
    L.push('| Pri | id | file | gen px | ship px | fmt | notes |');
    L.push('|---|---|---|---|---|---|---|');
    for (const e of es) {
      const note = grp === 'card'
        ? `${e.meta.attrLabel} · ${e.meta.rarityLabel} · ${e.meta.setCode}`
        : e.meta.purpose.replace(/\|/g, '/');
      L.push(`| ${e.priority} | \`${e.id}\` | \`${e.file}\` | ${e.width}x${e.height} | ${e.out.w}x${e.out.h} | ${e.out.fmt.toUpperCase()}${e.out.alpha ? ' (alpha)' : ''} | ${note} |`);
    }
    L.push('');
  }
  fs.writeFileSync(path.join(ART_DIR, 'MANIFEST.md'), L.join('\n') + '\n');
}

/* ═══════════════════════════════════════════════════════════════════════════
   10. MAIN
   ═══════════════════════════════════════════════════════════════════════════ */
function main() {
  const argv    = process.argv.slice(2);
  const check   = argv.includes('--check');
  const p1Only  = argv.includes('--p1-only');

  const { cards, loaded } = loadCards();
  let entries = [...cards.map(cardPrompt), ...uiAssets().map(uiPrompt)];
  if (p1Only) entries = entries.filter(e => e.priority === 'P1');
  /* P1 before P2 so a short run still yields a complete-looking game */
  entries.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'P1' ? -1 : 1));

  console.log(report(entries, cards, loaded));

  if (check) {
    console.log('\n--check: nothing written. Drop --check to write the files.');
    return;
  }

  fs.mkdirSync(ART_DIR, { recursive: true });
  fs.writeFileSync(path.join(ART_DIR, 'prompts.jsonl'),
    entries.map(e => JSON.stringify(e)).join('\n') + '\n');
  writeTxt(entries);
  writeManifest(entries);

  console.log('\nwrote  art/prompts.jsonl');
  console.log('wrote  art/prompts.txt');
  console.log('wrote  art/MANIFEST.md');
}

main();
