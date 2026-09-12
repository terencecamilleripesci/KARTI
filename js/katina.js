/* ═══════════════════════════════════════════════════════════════════
   KARTI — katina.js
   KATINA — the word chain. Each word starts with the last letter of
   the one before it. Engine only.

   CHECKABLE, WHICH IS WHY IT IS THIS GAME AND NOT FREE ASSOCIATION.
   "Say a word that goes with CAT" needs a judge, and a judge at a
   party table is an argument. "Say a word starting with T" needs a
   dictionary, and there is already one in this repo — 73,174 English
   words, loaded by Kelma. Nobody has to adjudicate anything.

   THE DICTIONARY IS LOADED ONCE FOR THE WHOLE APP. Kelma fetches the
   same 648KB and keeps it to itself; this puts the promise on window
   so the second game to ask gets the first game's copy instead of a
   second download.

   LIVES, NOT ELIMINATION ON THE FIRST MISS. Three each. Going out on
   your first blank in a game where the letters are luck of the draw
   is a game you stop playing, and the letters ARE luck: end on a Y
   and you are in trouble through no fault of your own.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const MIN_SEATS = 1, MAX_SEATS = 6;
const LIVES     = 3;
const TURN_MS   = 20000;
const MIN_LEN   = 3;          /* two-letter words make the chain trivial */

/* ── the shared dictionary ─────────────────────────────────────────
   One fetch for the whole app, whoever asks first. */
function dict(){
  if (window.__KARTI_DICT) return window.__KARTI_DICT;
  const grab = f => fetch('data/kelma/' + f)
    .then(r => r.ok ? r.text() : '')
    .catch(() => '');
  window.__KARTI_DICT = Promise.all([grab('words-en.txt'), grab('words-mt.txt')])
    .then(([en, mt]) => {
      const set = new Set();
      const add = txt => { for (const w of txt.split('\n')){ const s = w.trim().toLowerCase(); if (s) set.add(s); } };
      add(en); add(mt);
      /* BY FIRST LETTER, because the machine has to find a word
         starting with a given letter on every one of its turns and
         scanning 73,000 strings each time is a visible pause. */
      const by = {};
      for (const w of set){
        const c = w[0];
        (by[c] = by[c] || []).push(w);
      }
      return { set, by, size: set.size };
    });
  return window.__KARTI_DICT;
}

const tail = w => String(w || '').trim().toLowerCase().slice(-1);
const head = w => String(w || '').trim().toLowerCase()[0];

/* why a word is not allowed, or null if it is */
function reject(word, prev, used, D){
  const w = String(word || '').trim().toLowerCase();
  if (!w) return 'empty';
  if (!/^[a-zàèìòùġħżċ]+$/i.test(w)) return 'letters';
  if (w.length < MIN_LEN) return 'short';
  if (prev && head(w) !== tail(prev)) return 'letter';
  if (used && used.has(w)) return 'used';
  if (D && D.set && !D.set.has(w)) return 'unknown';
  return null;
}

/* ── THE MACHINE ───────────────────────────────────────────────────
   It has the whole dictionary, so playing perfectly is trivial and
   pointless — it would never miss and the game would be a formality.
   `find` is how often it bothers to look properly; when it does not,
   it fails its turn exactly as a person does.

   It also prefers SHORT, COMMON-LOOKING words at the easy end and
   awkward endings at the hard end, because handing you a word ending
   in X is the only real weapon in this game. */
const BANDS = [
  { k:'easy',   name:'Slow',   find:0.55, cruel:0.00, think:[2200, 4200] },
  { k:'medium', name:'Quick',  find:0.80, cruel:0.25, think:[1400, 3000] },
  { k:'hard',   name:'Cruel',  find:0.95, cruel:0.70, think:[900, 2000] }
];

const AWKWARD = 'xyzqjvkw';

function cpuWord(prev, used, D, band, rnd){
  const B = BANDS.find(b => b.k === band) || BANDS[1];
  const r = rnd || Math.random;
  if (r() > B.find) return null;                 /* it draws a blank too */
  const letter = prev ? tail(prev) : 'a';
  const pool = (D.by[letter] || []).filter(w => w.length >= MIN_LEN && !used.has(w));
  if (!pool.length) return null;
  /* be cruel: leave them a hard letter */
  if (r() < B.cruel){
    const mean = pool.filter(w => AWKWARD.indexOf(tail(w)) >= 0);
    if (mean.length) return mean[Math.floor(r() * mean.length)];
  }
  const easy = pool.filter(w => w.length <= 7);
  const from = easy.length ? easy : pool;
  return from[Math.floor(r() * from.length)];
}

function thinkMs(band, rnd){
  const B = BANDS.find(b => b.k === band) || BANDS[1];
  const r = rnd || Math.random;
  return Math.round(B.think[0] + r() * (B.think[1] - B.think[0]));
}

/* a word to open with: something with a friendly last letter */
function opener(D, rnd){
  const r = rnd || Math.random;
  const good = 'aeilnrst';
  const pool = (D.by[good[Math.floor(r() * good.length)]] || [])
    .filter(w => w.length >= 4 && w.length <= 6 && AWKWARD.indexOf(tail(w)) < 0);
  return pool.length ? pool[Math.floor(r() * pool.length)] : 'malta';
}

window.KARTI_KATINA = {
  MIN_SEATS, MAX_SEATS, LIVES, TURN_MS, MIN_LEN, BANDS,
  dict, reject, cpuWord, thinkMs, opener, tail, head
};

})();
