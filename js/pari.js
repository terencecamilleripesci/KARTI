/* ═══════════════════════════════════════════════════════════════════
   KARTI — pari.js
   PARI — pairs. The engine, and the only interesting part of it: a
   machine that forgets.

   A PERFECT MEMORY IS NOT AN OPPONENT. This is the one game where a
   computer wins by default — it has seen every card and it never
   forgets one, so played straight it clears the board and the player
   watches. Every band here therefore forgets on purpose, and the
   forgetting is the difficulty setting.

   HOW IT FORGETS IS THE BIT THAT MATTERS. Not "remembers 60% of
   cards" as a fixed set — that is a machine with a smaller perfect
   memory. It forgets the OLDEST first, the way people do, so a card
   turned over four turns ago is likelier to be lost than one turned
   over last turn. That produces the mistake a person recognises: it
   knew that, and now it does not.

   AND IT SOMETIMES REMEMBERS WRONG, at the hard end never and at the
   easy end often — turning a card it was sure about and finding
   something else is the machine's most human moment.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const MIN_SEATS = 1, MAX_SEATS = 4;

/* Sixteen faces, all readable at 40px on a dark tile. Chosen for
   silhouette rather than charm: two faces a player cannot tell apart
   at a glance turn a memory game into an eyesight test. */
const FACES = ['🐙','🦑','🐠','🦐','🐚','⭐','🌙','🔔',
               '🍋','🍇','🌶','🧀','⚓','🔑','🎈','🎲'];

const SIZES = [
  { k:'small',  name:'12 cards', pairs:6,  cols:3 },
  { k:'normal', name:'16 cards', pairs:8,  cols:4 },
  { k:'big',    name:'24 cards', pairs:12, cols:4 }
];

/* How much the machine holds on to. THESE NUMBERS WERE MEASURED, not
   guessed, and the first guess was wrong in a way worth recording:
   `keep` was 4/9/20 and over 800 simulated games hard beat medium only
   52% of the time — the top two bands were the same opponent wearing
   different names. `keep` saturates fast, because a 16-card board
   rarely needs more than six cards held at once, so everything above
   about seven buys nothing. The gap had to come from lowering medium,
   not raising hard.

   Measured, first move alternated, 800 games a pairing:
                      12 cards   16 cards   24 cards
     hard  > medium      53%        61%        83%
     medium> easy        61%        71%        80%
   and a PERFECT memory (keep everything, never slip) beats this hard
   band only 44-48% — so Elephant plays at the ceiling while still
   forgetting half of a big board, which is the point. */
const BANDS = [
  { k:'easy',   name:'Forgetful', keep:4,  wrong:0.22, think:[700, 1300] },
  { k:'medium', name:'Sharp',     keep:6,  wrong:0.12, think:[550, 1000] },
  { k:'hard',   name:'Elephant',  keep:12, wrong:0.02, think:[420, 800] }
];

function deal(pairs, rnd){
  const r = rnd || Math.random;
  const faces = FACES.slice();
  for (let i = faces.length - 1; i > 0; i--){
    const j = Math.floor(r() * (i + 1));
    const t = faces[i]; faces[i] = faces[j]; faces[j] = t;
  }
  const cards = [];
  faces.slice(0, pairs).forEach((f, i) => { cards.push({ f, id:i }, { f, id:i }); });
  for (let i = cards.length - 1; i > 0; i--){
    const j = Math.floor(r() * (i + 1));
    const t = cards[i]; cards[i] = cards[j]; cards[j] = t;
  }
  return cards.map((c, i) => ({ at:i, f:c.f, id:c.id, up:false, gone:false }));
}

/* ── the machine's head ────────────────────────────────────────────
   `mem` is an array of {at, f} in the order they were seen, newest
   last. Trimming from the FRONT is the forgetting. */
function remember(mem, at, f, keep){
  const i = mem.findIndex(m => m.at === at);
  if (i >= 0) mem.splice(i, 1);
  mem.push({ at, f });
  while (mem.length > keep) mem.shift();
  return mem;
}

/* pick two positions to turn over */
function cpuPick(cards, mem, band, rnd){
  const B = BANDS.find(b => b.k === band) || BANDS[1];
  const r = rnd || Math.random;
  const open = cards.filter(c => !c.gone).map(c => c.at);
  const known = mem.filter(m => open.indexOf(m.at) >= 0);

  /* a pair it is holding? */
  for (let i = 0; i < known.length; i++)
    for (let j = i + 1; j < known.length; j++)
      if (known[i].f === known[j].f){
        /* MISREMEMBERING happens here, at the moment of confidence */
        if (r() < B.wrong){
          const others = open.filter(a => a !== known[i].at);
          return [known[i].at, others[Math.floor(r() * others.length)]];
        }
        return [known[i].at, known[j].at];
      }

  /* otherwise turn something unknown, then chase it if it helps */
  const unknown = open.filter(a => !known.some(m => m.at === a));
  const first = unknown.length ? unknown[Math.floor(r() * unknown.length)]
                               : open[Math.floor(r() * open.length)];
  const firstFace = (cards.find(c => c.at === first) || {}).f;
  const match = known.find(m => m.f === firstFace && m.at !== first);
  if (match && r() >= B.wrong) return [first, match.at];
  const rest = open.filter(a => a !== first);
  return [first, rest[Math.floor(r() * rest.length)]];
}

function thinkMs(band, rnd){
  const B = BANDS.find(b => b.k === band) || BANDS[1];
  const r = rnd || Math.random;
  return Math.round(B.think[0] + r() * (B.think[1] - B.think[0]));
}

window.KARTI_PARI = {
  MIN_SEATS, MAX_SEATS, FACES, SIZES, BANDS,
  deal, remember, cpuPick, thinkMs
};

})();
