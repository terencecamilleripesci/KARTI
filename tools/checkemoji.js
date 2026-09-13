#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   checkemoji.js — the contract for js/emoji.js's clue bank.

   WHY THIS EXISTS: this Pi has no emoji font (`fc-list | grep emoji`
   returns nothing), so a headless screenshot renders every clue as a
   tofu box and CANNOT tell a good emoji from one that does not exist
   on the player's phone. The eye is not available here, so the check
   has to be on codepoints.

   The rule: nothing newer than Unicode 12 (2019). Anything later is
   tofu on a phone a few years old — and the whole game is looking at
   the picture. 🫏 (U15) and 🧌 (U14) both shipped in the first draft
   of the bank and would have been two blank squares.

   Run: node tools/checkemoji.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const window = {}; global.window = window;
eval(fs.readFileSync(path.join(root, 'js/emoji.js'), 'utf8'));
const E = window.KARTI_EMOJI;

let bad = 0;
const fail = (...m) => { console.log('  FAIL', ...m); bad++; };

/* THE BAR IS UNICODE 13 (2020) AND OLDER. Six years of phones have it;
   Unicode 14 (2021) and 15 (2022) are still missing from plenty of
   handsets in a pocket today, and a missing clue is not a hard clue,
   it is a blank square.

   A first pass at this check used whole blocks and was WRONG in both
   directions — it flagged 🧀 (Unicode 8) and 🧊 (Unicode 11) as new
   while the actual offenders sat elsewhere. So these are the real
   Unicode 14 and 15 additions, listed as ranges. Extend, never
   shorten, and add the version in the note. */
const TOO_NEW = [
  [0x1F9CC, 0x1F9CC, 'troll (U14)'],
  [0x1FA75, 0x1FA77, 'light/dark/blue hearts (U15)'],
  [0x1FA7C, 0x1FA7C, 'crutch (U15)'],
  [0x1FA88, 0x1FA88, 'flute (U15)'],
  [0x1FAA9, 0x1FAAC, 'mirror ball, disco, hamsa (U14)'],
  [0x1FAB7, 0x1FABD, 'lotus, coral, wing, bird (U14-15)'],
  [0x1FABF, 0x1FABF, 'goose (U15)'],
  [0x1FAC3, 0x1FAC5, 'pregnant man/person, khanda (U14)'],
  [0x1FACE, 0x1FACF, 'moose, donkey (U15)'],
  [0x1FAD7, 0x1FAD9, 'pouring liquid, jar (U14)'],
  [0x1FADA, 0x1FADB, 'ginger, pea pod (U15)'],
  [0x1FAE0, 0x1FAE8, 'melting/saluting/shaking faces (U14-15)'],
  [0x1FAF0, 0x1FAF8, 'hand gestures (U14-15)']
];
const ALLOW = new Set();

console.log('EMOJI BANK');
for (const p of E.BANK){
  for (const clue of p.e){
    for (const ch of clue){
      const cp = ch.codePointAt(0);
      if (ALLOW.has(cp)) continue;
      for (const [lo, hi, why] of TOO_NEW)
        if (cp >= lo && cp <= hi)
          fail(p.en, '— clue', JSON.stringify(clue),
               'U+' + cp.toString(16).toUpperCase(), 'is', why);
    }
  }
}

/* ── shape ──────────────────────────────────────────────────────── */
const seen = new Set();
for (const p of E.BANK){
  if (!p.e || p.e.length < 3) fail(p.en, 'needs at least three clues');
  if (p.e && p.e.length > E.PTS.length)
    fail(p.en, 'has', p.e.length, 'clues but only', E.PTS.length, 'point steps');
  if (!p.en || !p.mt) fail(p.en || '?', 'is missing a language');
  const k = E.norm(p.en);
  if (seen.has(k)) fail('duplicate answer:', p.en);
  seen.add(k);
  if (!E.CATS[p.k]) fail(p.en, 'has unknown category', p.k);
}

/* ── the matcher ────────────────────────────────────────────────── */
for (const p of E.BANK){
  for (const a of [p.en, p.mt].concat(p.alt || []))
    if (!E.accept(a, p)) fail(p.en, 'rejects its own answer', JSON.stringify(a));
  for (const q of E.BANK){
    if (p === q) continue;
    if (E.accept(q.en, p) || E.accept(q.mt, p))
      fail(p.en, 'also accepts', q.en, '— two puzzles, one answer');
  }
}

/* ── the machine never buzzes before a clue is showing ──────────── */
for (const b of E.BANDS)
  for (let i = 0; i < 400; i++){
    const at = E.cpuAt(b.k, 3);
    if (at < 0 || at > 3) fail('band', b.k, 'buzzes at clue', at, 'on a 3-clue puzzle');
  }

console.log('  ' + E.BANK.length + ' puzzles, ' +
  Object.keys(E.CATS).map(k => k + '=' + E.BANK.filter(p => p.k === k).length).join(' '));
console.log(bad ? 'CHECKEMOJI: ' + bad + ' FAILED' : 'CHECKEMOJI: ALL PASS');
process.exit(bad ? 1 : 0);
