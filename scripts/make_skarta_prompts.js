#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SKARTA — PROMPT BUILDER
   Writes art/skarta-prompts.jsonl (and a human-readable .txt) in exactly the
   shape scripts/runpod_batch.py and scripts/postprocess.py already consume,
   so the SKARTA pack is a second, small run of the SAME pipeline:

     python3 scripts/runpod_batch.py  --prompts art/skarta-prompts.jsonl
     python3 scripts/postprocess.py   --prompts art/skarta-prompts.jsonl

   Usage
     node scripts/make_skarta_prompts.js          # write the files
     node scripts/make_skarta_prompts.js --check  # dry run: budgets + report

   ┌───────────────────────────────────────────────────────────────────────┐
   │  THE THREE LESSONS THIS FILE EXISTS TO OBEY                           │
   │                                                                       │
   │  1. CLIP TAKES 77 TOKENS AND BINS THE REST, SILENTLY.                 │
   │     So the style leads — it is the one thing that must survive — and  │
   │     every prompt is assembled segment by segment against a hard       │
   │     budget by fitPrompt(). The first KARTI smoke test came back as    │
   │     oil paintings because the style sat past token 77.                │
   │                                                                       │
   │  2. NEVER ASK FOR TEXT, NUMBERS, LETTERS OR A LOGO.                   │
   │     Models render them as garbage and a misspelt word baked into a    │
   │     JPEG is unfixable. Every numeral, card name and the word SKARTA   │
   │     itself is CSS text in js/skarta-ui.js, drawn ON TOP of the art.   │
   │     We generate the ART WINDOW only. Never a whole card.              │
   │                                                                       │
   │  3. ONE FRAMING PER FAMILY.                                           │
   │     All five action subjects share a framing and all four face        │
   │     windows share a framing, so the pack normalises to two sizes and  │
   │     the cards look like one deck rather than eleven separate jobs.    │
   └───────────────────────────────────────────────────────────────────────┘

   Style source of truth: docs/ART_STYLE_BIBLE.md. The constants below are
   copies of the ones in scripts/make_prompts.js and are CHECKED against the
   live art/prompts.jsonl at build time — if that pipeline moves on and this
   file does not, the build fails loudly instead of shipping two visually
   different games.
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'art');
const CHECK = process.argv.includes('--check');

/* ── THE LOCKED LOOK (copy of scripts/make_prompts.js) ──────────────────── */
const STYLE_LEAD =
  'funny colourful cartoon comic illustration, thick black outline, flat bright colours, cel shaded';
const STYLE_FUNNY = 'exaggerated goofy comic expression, humorous caricature';
const NEGATIVE_SHORT = [
  'photorealistic', 'photograph', '3d render', 'oil painting',
  'framed picture', 'poster on a wall', 'picture frame', 'border',
  'monochrome', 'black and white', 'pencil sketch',
  'text', 'letters', 'numbers', 'watermark', 'signature', 'logo',
  'blurry', 'cluttered', 'deformed hands', 'extra fingers', 'bad anatomy',
  'nsfw', 'nude', 'gore',
].join(', ');

/* ── THE 77-TOKEN WALL (copy of scripts/make_prompts.js) ────────────────── */
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

/* deterministic per-id seed, same function the card pipeline uses */
function seedOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

/* ── DRIFT GUARD ────────────────────────────────────────────────────────── */
function assertStyleInSync() {
  const f = path.join(ART, 'prompts.jsonl');
  if (!fs.existsSync(f)) { console.log('! art/prompts.jsonl absent — style not cross-checked'); return; }
  const first = JSON.parse(fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)[0]);
  if (first.negative !== NEGATIVE_SHORT)
    throw new Error('STYLE DRIFT: the negative prompt in art/prompts.jsonl no longer matches ' +
                    'the copy in this file. Re-sync both against docs/ART_STYLE_BIBLE.md ' +
                    'before generating, or SKARTA will not match the card game.');
  if (first.prompt.indexOf(STYLE_LEAD) !== 0)
    throw new Error('STYLE DRIFT: STYLE_LEAD no longer leads the card prompts.');
  console.log('style cross-check against art/prompts.jsonl : OK');
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE PACK — eleven images, two framings
   ═══════════════════════════════════════════════════════════════════════════
   Every subject below is a THING TO DRAW. Nothing asks for a word, a number,
   a suit symbol shaped like a letter, or the game's name. The card numerals,
   the +2, the 4/7 and every card name are CSS in js/skarta-ui.js.

   Card ratio is 59:86, so the card-shaped generations are 832x1216 (the
   nearest SDXL-native portrait bucket) and are cropped to 590x860.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Framing comes in two halves, and the split is the whole point.

     must — goes in the REQUIRED list and is never dropped, only trimmed.
     nice — goes in the optional tail and is the first thing sacrificed.

   The first cut of this file put all of it in the tail, and every prompt over
   sixty tokens silently lost it. For a JPEG that costs a little composition.
   For an alpha PNG it costs the ASSET: scripts/postprocess.py keys the cut-out
   from a pure black background, so "isolated on pure flat black background" is
   not a stylistic wish, it is the thing that makes the file work. It is
   required on every alpha asset in this pack. */

/* framing 1 — a card-shaped painted window behind a CSS numeral, so the
   middle third is deliberately empty. Used for the four number-card faces. */
const CARD_GEN = { w: 832, h: 1216 };
const CARD_OUT = { w: 590, h: 860, fmt: 'jpg', fit: 'cover', alpha: false };
const CARD_FRAME = { must: 'empty quiet middle', nice: 'tall upright composition, detail only at the top and bottom edges' };

/* framing 1b — the back. Same size, opposite instruction: no quiet middle,
   it is a repeating pattern and it should fill the card. */
const BACK_FRAME = { must: 'dense pattern edge to edge', nice: 'tall upright composition, perfectly symmetrical' };

/* framing 2 — a single cut-out subject on flat black, keyed to alpha. */
const CUT_GEN = { w: 1024, h: 1024 };
const CUT_OUT = { w: 512, h: 512, fmt: 'png', fit: 'contain', alpha: true };
const CUT_FRAME = { must: 'isolated on pure flat black background', nice: 'one subject centred, generous even margin' };



const PACK = [];
const add = o => PACK.push(o);

/* ── 1. THE BACK ─────────────────────────────────────────────────────────
   The one image every player sees a hundred times a game, and the sentinel
   js/skarta-ui.js probes to decide whether the pack exists at all. */
add({
  id: 'sk-back', file: 'art/skarta/back.jpg', gen: CARD_GEN, out: CARD_OUT,
  frame: BACK_FRAME, funny: false, priority: 'P1',
  purpose: 'The card back. ALSO THE SENTINEL — js/skarta-ui.js loads this to decide ' +
           'whether art/skarta/ exists. If this one file is missing the whole pack is ' +
           'ignored and the game falls back to its CSS cards.',
  subject: 'an ornate symmetrical playing card back pattern, a Maltese eight-pointed ' +
           'cross woven into a repeating tile of festa fireworks and prickly pear ' +
           'paddles, deep indigo and warm gold, dense even ornament edge to edge',
});

/* ── 2. NO SUIT MARKS ────────────────────────────────────────────────────
   Deliberately absent. The four suit marks are SVG in js/skarta-ui.js, because
   the size that decides the game is 13px in a card corner and a 512px raster
   scaled down to 13 is worse there and no better in the picker. Chess and dama
   generate nothing at all for the same reason (docs/RUNPOD_PARTY.md §2), and
   filler costs GPU time and makes the pack harder to judge. */

/* ── 3. THE FOUR NUMBER-CARD WINDOWS ─────────────────────────────────────
   One scene per suit, shared by all twenty-five cards of that suit. The
   numeral is CSS on top, dead centre — so the centre of every one of these
   is deliberately empty. That is not a compromise, it is the framing. */
const FACES = [
  { k: 'festa', label: 'FESTA',
    subject: 'a Maltese village square at night from below, a lit church facade far at ' +
             'the top, fireworks bursting along the top edge, festoon lights strung ' +
             'across the bottom, wide empty dark sky through the middle' },
  { k: 'bahar', label: 'BAĦAR',
    subject: 'a bright Mediterranean bay from above, painted luzzu boats along the top ' +
             'edge, rocks and a swimmer at the bottom edge, wide flat empty turquoise ' +
             'water through the middle' },
  { k: 'razzett', label: 'RAŻŻETT',
    subject: 'a sunlit Maltese farm terrace, a low rubble wall and a carob tree along ' +
             'the top edge, a dozing dog and a bucket at the bottom, wide empty ochre ' +
             'field through the middle' },
  { k: 'bajtra', label: 'BAJTRA',
    subject: 'a hot Maltese roadside in summer, tall prickly pear cactus paddles along ' +
             'the top edge, a crate of picked fruit at the bottom, wide empty pale sky ' +
             'through the middle' },
];
for (const f of FACES) add({
  id: 'sk-face-' + f.k, file: 'art/skarta/face-' + f.k + '.jpg',
  gen: CARD_GEN, out: CARD_OUT, frame: CARD_FRAME, funny: false, priority: 'P1',
  purpose: 'The painted window behind every ' + f.label + ' number card. SECOND SENTINEL — ' +
           'face-festa.jpg is the other file js/skarta-ui.js probes, so a half-uploaded ' +
           'folder cannot half-skin the game. The numeral is CSS dead centre: keep the ' +
           'middle third empty.',
  subject: f.subject,
});

/* ── 4. THE FIVE ACTION SUBJECTS ─────────────────────────────────────────
   Cut-outs on flat black, dropped onto the suit-coloured card by CSS. That
   is why there are five and not twenty: the same Kunjata appears on all four
   suits, wearing whichever colour the card already is. */
const ACTS = [
  { id: 'act-skip', name: 'ERĠA\' EJJA GĦADA (skip)',
    subject: 'a grumpy government clerk slamming a service window shutter down on a ' +
             'despairing man\'s paperwork, papers flying, one rubber stamp mid-air' },
  { id: 'act-reverse', name: 'DAWRA TA\' MARSA (reverse)',
    subject: 'two little cartoon cars nose to nose on a roundabout both swinging into ' +
             'the same u-turn, tyres smoking, one driver throwing both hands up' },
  { id: 'act-draw2', name: 'IL-KUNJATA (draw two)',
    subject: 'a tiny fierce Maltese grandmother marching in with an enormous shopping ' +
             'bag under each arm, chin up, entirely unstoppable' },
  { id: 'act-kazin', name: 'IL-KAŻIN (wild)',
    subject: 'a crowded village band club bar counter seen head on, four different ' +
             'club scarves hung side by side above it, glasses everywhere' },
  { id: 'act-kaxxa', name: 'IL-KAXXA INFERNALI (the choice card)',
    subject: 'a huge wooden festa firework crate erupting in one enormous ground burst, ' +
             'sparks in every direction, a man sprinting away from it clutching his hat' },
];
for (const a of ACTS) add({
  id: 'sk-' + a.id, file: 'art/skarta/' + a.id + '.png',
  gen: CUT_GEN, out: CUT_OUT, frame: CUT_FRAME, funny: true, priority: 'P1',
  purpose: a.name + ' — one cut-out subject, laid over whichever suit colour the card ' +
           'already carries. The card name and the +2 / 4-7 stay CSS text underneath it.',
  subject: a.subject,
});

/* ── 5. THE TABLE ────────────────────────────────────────────────────────
   The felt. Two cards and a chain badge sit in the middle of it, so the
   middle is empty on purpose. */
add({
  id: 'sk-table', file: 'art/skarta/table.jpg',
  gen: { w: 1216, h: 832 }, out: { w: 1200, h: 820, fmt: 'jpg', fit: 'cover', alpha: false },
  frame: { must: 'plain empty middle', nice: 'wide flat top-down texture, no central subject' },
  funny: false, priority: 'P1',
  purpose: 'The felt behind the draw pile and the discard pile. The cards sit dead centre ' +
           'and the chain badge sits along the top, so keep the middle plain.',
  subject: 'a worn dark green baize card table top seen from directly above, faint ring ' +
           'stains and old cigarette scorches around the outer edge, a scattering of ' +
           'pistachio shells in the far corners, plain empty felt through the centre',
});

/* ── 6. NO HUB EMBLEM HERE ───────────────────────────────────────────────
   art/ui/logo-skarta.png is real and is currently 404ing, but it belongs to
   docs/RUNPOD_PARTY.md §1, which already lists it alongside the other four
   tile emblems so the whole shelf is generated in one consistent batch. It is
   not duplicated here — two prompts for one filename is how you end up with
   a shelf where one tile does not match the rest. */

/* ═══════════════════════════════════════════════════════════════════════════
   BUILD
   ═══════════════════════════════════════════════════════════════════════════ */
function build(a) {
  /* Priority order, highest first — fitPrompt drops from the tail. Style and
     subject always survive; the framing note is sacrificed before they are. */
  const prompt = fitPrompt(
    [STYLE_LEAD, a.funny ? STYLE_FUNNY : null, a.subject, a.frame.must].filter(Boolean),
    [a.frame.nice]
  );
  return {
    id: a.id,
    kind: 'ui',                     /* postprocess.py sizes 'card' vs everything else */
    file: a.file,
    raw: 'art/raw/' + a.id + '.png',
    prompt,
    negative: NEGATIVE_SHORT,
    seed: seedOf(a.id),
    width: a.gen.w, height: a.gen.h,
    out: a.out,
    priority: a.priority,
    meta: { game: 'skarta', purpose: a.purpose, subject: a.subject,
            uiKind: a.out.alpha ? 'object' : 'env', alpha: !!a.out.alpha },
  };
}

assertStyleInSync();
const rows = PACK.map(build);

/* ── the budget report: this is the check that was paid for the hard way ── */
let over = 0;
console.log('\n  id                 tok  size        file');
console.log('  ' + '-'.repeat(66));
for (const r of rows) {
  const t = estTokens(r.prompt);
  if (t > 77) over++;
  console.log('  ' + r.id.padEnd(18) + ' ' + String(t).padStart(3) + (t > 77 ? '!' : ' ') +
              ' ' + (r.width + 'x' + r.height).padEnd(11) + ' ' + r.file);
}
/* THE CHECK THAT MATTERS: every alpha asset must still be asking for a black
   background after fitPrompt has had its way with the prompt. Without it
   scripts/postprocess.py keys the cut-out off whatever the model felt like
   painting and the PNG comes back with a rectangle of scenery in it. */
const lostBlack = rows.filter(r => r.out.alpha && r.prompt.indexOf('black background') < 0);
const lostFrame = rows.filter(r => r.prompt.indexOf(PACK.find(p => p.id === r.id).frame.must) < 0);
const banned = /\b(text|letter|letters|word|words|number|numeral|logo|wordmark|title|caption|label|sign|writing|typography)\b/i;
const withText = rows.filter(r => banned.test(r.meta.subject));
const ids = new Set(rows.map(r => r.id));
const files = new Set(rows.map(r => r.file));

console.log('\n  images                       : ' + rows.length);
console.log('  over the 77-token wall       : ' + over + (over ? '   <-- FIX BEFORE RENTING' : '   OK'));
console.log('  subjects asking for lettering: ' + withText.length +
            (withText.length ? '   <-- ' + withText.map(r => r.id).join(', ') : '   OK'));
console.log('  unique ids / filenames       : ' +
            (ids.size === rows.length && files.size === rows.length ? 'OK' : 'CLASH'));
console.log('  alpha cut-outs               : ' + rows.filter(r => r.out.alpha).length +
            '   black-background clause ' + (lostBlack.length ? 'LOST on ' + lostBlack.map(r => r.id).join(', ') : 'intact on all'));
console.log('  required framing survived    : ' +
            (lostFrame.length ? 'LOST on ' + lostFrame.map(r => r.id).join(', ') : 'all'));
console.log('  framings                     : ' +
            [...new Set(rows.map(r => r.width + 'x' + r.height))].join(', '));

if (over || withText.length || lostBlack.length || lostFrame.length ||
    ids.size !== rows.length) process.exitCode = 1;
if (CHECK) { console.log('\n  --check: nothing written.\n'); return; }

fs.mkdirSync(ART, { recursive: true });
fs.writeFileSync(path.join(ART, 'skarta-prompts.jsonl'),
  rows.map(r => JSON.stringify(r)).join('\n') + '\n');
fs.writeFileSync(path.join(ART, 'skarta-prompts.txt'),
  rows.map(r =>
    '# ' + r.id + '   ->  ' + r.file + '   seed ' + r.seed +
    '   ' + r.width + 'x' + r.height + ' -> ' + r.out.w + 'x' + r.out.h + '.' + r.out.fmt +
    (r.out.alpha ? ' (alpha)' : '') +
    '\n' + r.meta.purpose + '\n\n' + r.prompt + '\n'
  ).join('\n' + '-'.repeat(78) + '\n\n') + '\n');
console.log('\n  wrote art/skarta-prompts.jsonl and art/skarta-prompts.txt\n');
