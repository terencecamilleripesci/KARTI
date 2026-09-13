/* ═══════════════════════════════════════════════════════════════════
   KARTI — ritmu.js
   RITMU — keep the beat. Engine only.

   THE ONE THING THAT KILLS RHYTHM GAMES ON PHONES IS LATENCY, and it
   is not a bug you can fix — it is the hardware. A phone's audio
   output runs 40-200ms behind the code that scheduled it, and the
   touchscreen adds its own 20-80ms on the way back. A player tapping
   perfectly in time with what they HEAR produces taps that arrive
   late by an amount this game cannot know and cannot measure.

   SO THIS GAME DOES NOT JUDGE WHETHER YOU ARE ON THE BEAT. It judges
   whether you are STEADY — the spread of your taps around your own
   average offset, not the offset itself. A player who is consistently
   90ms late is not late, they are on a phone; a player who is 20ms
   early then 70ms late then 10ms early is not keeping time. Every
   constant delay in the chain cancels out of a variance, exactly, and
   for free. That is the whole design and everything else follows.

   IT ALSO MEANS THE GAME IS HONEST ABOUT WHAT IT CANNOT SEE. There is
   no "PERFECT ±20ms" badge here, because ±20ms of WHAT is not a
   question this hardware can answer.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const MIN_SEATS = 1, MAX_SEATS = 6;
const LEAD_IN   = 4;      /* free beats before anything is judged */
const MIN_TAPS  = 6;      /* below this a "spread" means nothing */

/* Each level is a pattern of beats per bar and a tempo that steps up.
   The bars are what the player follows; the CLIMB is what beats them. */
const BANDS = [
  { k:'easy',   name:'Walk',  bpm:76,  step:4,  cap:132, allow:78 },
  { k:'medium', name:'March', bpm:92,  step:6,  cap:164, allow:58 },
  { k:'hard',   name:'Run',   bpm:108, step:8,  cap:200, allow:42 }
];

/* The patterns. 1 = tap, 0 = rest. A rest you must NOT tap through is
   what stops this being a metronome-holding contest — you have to be
   counting, not just repeating. */
const PATTERNS = [
  { n:'Straight', p:[1,1,1,1] },
  { n:'Backbeat', p:[1,0,1,0] },
  { n:'Waltz',    p:[1,1,0] },
  { n:'Limp',     p:[1,0,1,1] },
  { n:'Skip',     p:[1,1,0,1] },
  { n:'Clave',    p:[1,0,0,1,0,0,1,0] }
];

const msPerBeat = bpm => 60000 / bpm;

/* the tempo of round `r`, climbing and then held at the cap */
function tempoAt(band, r){
  const B = BANDS.find(b => b.k === band) || BANDS[1];
  return Math.min(B.cap, B.bpm + B.step * Math.max(0, r));
}

function allowOf(band){
  const B = BANDS.find(b => b.k === band) || BANDS[1];
  return B.allow;
}

/* ── THE JUDGEMENT ─────────────────────────────────────────────────
   `offs` is one signed offset per judged beat: tap time minus the
   time the beat was due, in ms. Latency is a constant hiding in all
   of them, so:

     mean   = the player's personal delay. Thrown away, deliberately.
     spread = the mean absolute deviation FROM that mean. This is the
              score, and it is what "steady" means.

   Mean absolute deviation rather than standard deviation because one
   fumbled tap should cost roughly one tap's worth — squaring makes a
   single 300ms stumble outweigh twenty clean beats, which does not
   match what the player feels happened. */
function judge(offs){
  const n = offs.length;
  if (n < 1) return { n:0, mean:0, spread:Infinity, ok:false };
  let sum = 0;
  for (const o of offs) sum += o;
  const mean = sum / n;
  let dev = 0;
  for (const o of offs) dev += Math.abs(o - mean);
  return { n, mean, spread: dev / n, ok: n >= MIN_TAPS };
}

/* Did this round survive? A round is lost by DRIFTING, not by one bad
   tap — and by missing beats, which `n` catches, and by tapping
   through the rests, which `strays` catches. The rests are the reason
   this is not a metronome-holding contest, so ignoring taps that land
   in them would throw away the half of the game that needs counting. */
function survived(offs, expected, band, strays){
  const j = judge(offs);
  if (j.n < Math.ceil(expected * 0.7)) return false;   /* too many missed */
  if ((strays | 0) > 2) return false;                  /* played over the rests */
  return j.spread <= allowOf(band);
}

/* a star rating for the round, purely for the face of it */
function stars(spread, band){
  const a = allowOf(band);
  if (spread <= a * 0.35) return 3;
  if (spread <= a * 0.65) return 2;
  if (spread <= a) return 1;
  return 0;
}

/* ── the machine ───────────────────────────────────────────────────
   It plays with a fixed personal delay (its "latency") and a wobble.
   The wobble is the difficulty: the machine is beaten by being
   steadier than it, which is the same thing the player is being
   asked to do. */
const CPU = {
  easy:   { wobble:52, lose:0.30 },
  medium: { wobble:34, lose:0.16 },
  hard:   { wobble:19, lose:0.06 }
};

function cpuSpread(band, rnd){
  const c = CPU[band] || CPU.medium;
  const r = rnd || Math.random;
  /* two draws averaged: a centre-weighted spread rather than a flat
     one, so the machine has a typical night and an occasional bad one */
  const w = c.wobble * ((r() + r()) / 2) * 1.6;
  return Math.max(4, w);
}

function cpuSurvives(band, rnd){
  const c = CPU[band] || CPU.medium;
  return (rnd || Math.random)() > c.lose;
}

function patternFor(r, rnd){
  const R = rnd || Math.random;
  /* the first two rounds are always straight — learn the tap, then
     learn the counting */
  if (r < 2) return PATTERNS[0];
  const pool = PATTERNS.slice(0, Math.min(PATTERNS.length, 2 + r));
  return pool[Math.floor(R() * pool.length)];
}

window.KARTI_RITMU = {
  MIN_SEATS, MAX_SEATS, LEAD_IN, MIN_TAPS, BANDS, PATTERNS, CPU,
  msPerBeat, tempoAt, allowOf, judge, survived, stars,
  cpuSpread, cpuSurvives, patternFor
};

})();
