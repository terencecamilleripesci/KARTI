/* ═══════════════════════════════════════════════════════════════════
   KARTI — lewwel.js
   L-EWWEL — the engine. Reaction times, rounds, the machine's hand.
   No DOM here; js/lewwel-ui.js owns the screen.

   THE WHOLE GAME IS ONE NUMBER: milliseconds between the signal and
   your thumb. Everything else is arithmetic around that, and the
   arithmetic has one job — stop a single lucky tap deciding it.

   WHY BEST-OF-FIVE AND NOT ONE TAP. Human reaction time is noisy:
   the same person over five goes swings 60-80ms either side of their
   own average. One tap is a coin toss between two players who are
   the same speed, and a coin toss is not a game. Five goes, and the
   BEST one counts rather than the mean, because a player who fumbles
   one go has still shown you what they can do.

   FALSE STARTS COST THE GO, NOT THE MATCH. Jumping the signal is the
   interesting decision in this game — the whole tension is leaning
   forward without falling over — so it has to be punishable without
   being fatal. A false start burns that go and nothing more.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;

const GOES      = 5;        /* attempts each                            */
const WAIT_MIN  = 1200;     /* shortest hold before the signal          */
const WAIT_MAX  = 4200;     /* longest                                  */
const FALSE     = -1;       /* a go that jumped the gun                 */
const TIMEOUT   = 2000;     /* slower than this and the go is spent     */
const MIN_SEATS = 1, MAX_SEATS = 6;

/* THE HOLD IS RANDOM AND THE RANGE IS WIDE ON PURPOSE. Anything under
   about a second and a bit can be beaten by tapping on rhythm; a fixed
   hold can be memorised in three goes. 1.2s to 4.2s is long enough that
   counting does not help and short enough that waiting is not boring. */
function holdMs(rnd){
  const r = rnd || Math.random;
  return Math.round(WAIT_MIN + r() * (WAIT_MAX - WAIT_MIN));
}

/* ── THE MACHINE ───────────────────────────────────────────────────
   Real numbers, because this is the one game where the player can
   feel a lie. A quick human is about 200ms, an average one 250, and
   anything under 150 is a guess rather than a reaction — so the top
   band sits at 185 and never dips below 160. A machine that reacted
   in 80ms would be unbeatable and obviously fake.

   It false-starts too, rarely, for the same reason it misses
   questions in the quiz: an opponent that never makes a mistake is
   scenery, not an opponent. */
const BANDS = [
  { k:'easy',   name:T('Sleepy','Bi ngħas'),      mean:430, jitter:90, slip:0.03 },
  { k:'medium', name:T('Awake','Imqajjem'),       mean:285, jitter:55, slip:0.05 },
  { k:'hard',   name:T('Twitchy','Idejh ħfief'),  mean:196, jitter:34, slip:0.08 }
];

function cpuGo(band, rnd){
  const B = BANDS.find(b => b.k === band) || BANDS[1];
  const r = rnd || Math.random;
  if (r() < B.slip) return FALSE;                 /* it jumped too */
  /* two draws averaged: one flat roll gives a rectangular spread and
     real reaction times bunch around the middle */
  const n = (r() + r() - 1);                      /* -1..1, centre-weighted */
  return Math.max(160, Math.round(B.mean + n * B.jitter));
}

/* ── scoring ───────────────────────────────────────────────────────
   The BEST go is the score, and a lower number wins. A seat with
   nothing but false starts has no score at all, which is exactly
   what it deserves. */
function best(goes){
  const real = (goes || []).filter(g => g > 0);
  return real.length ? Math.min.apply(null, real) : null;
}
function rank(seats){
  return seats.map((s, i) => ({ i, s, b: best(s.goes) }))
              .sort((a, b) => {
                if (a.b === null && b.b === null) return 0;
                if (a.b === null) return 1;        /* no score sinks */
                if (b.b === null) return -1;
                return a.b - b.b;                  /* lower is better */
              });
}

/* how a time reads to a human — the number alone means little */
function verdict(ms){
  if (ms === FALSE) return T('Too soon','Kmieni wisq');
  if (ms === null)  return T('No time','Bla ħin');
  if (ms < 200) return T('Lightning','Berqa');
  if (ms < 260) return T('Sharp','Jaqta\'');
  if (ms < 340) return T('Steady','Sod');
  if (ms < 450) return T('Late','Tard');
  return T('Asleep','Rieqed');
}

window.KARTI_LEWWEL = {
  GOES, WAIT_MIN, WAIT_MAX, FALSE, TIMEOUT, MIN_SEATS, MAX_SEATS,
  BANDS, holdMs, cpuGo, best, rank, verdict
};

})();
