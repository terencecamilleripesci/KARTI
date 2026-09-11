/* ═══════════════════════════════════════════════════════════════════
   KARTI — oghla.js
   OGĦLA JEW INQAS — higher or lower. The engine only.

   THE OLDEST GUESSING GAME THERE IS, and it survives because the
   decision is never quite free: a seven is a coin toss, a two is not,
   and the player who notices that is the player who wins.

   WHY EQUAL COUNTS AS RIGHT. On a 52-card deck a tie happens about
   once every fourteen turns, and losing a six-card streak to a tie
   feels like the game cheated. It is generous in the player's
   favour, which is the only direction generosity belongs.

   THE STREAK IS THE SCORE, not a multiplier on top of one. Card two
   is worth 1, card three 2, card four 3 — so a run of six is worth
   fifteen and a run of three is worth three. Quitting while ahead is
   therefore a real decision, and a real decision is the whole game.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;

const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const SUITS = ['S','H','D','C'];
const MIN_SEATS = 1, MAX_SEATS = 6;
const RUN_MAX   = 12;         /* a run longer than this is a chore     */

function deck(rnd){
  const r = rnd || Math.random;
  const d = [];
  for (let s = 0; s < 4; s++) for (let v = 0; v < RANKS.length; v++) d.push({ s, v });
  for (let i = d.length - 1; i > 0; i--){
    const j = Math.floor(r() * (i + 1));
    const t = d[i]; d[i] = d[j]; d[j] = t;
  }
  return d;
}

/* right, wrong, or a tie (which counts as right) */
function judge(prev, next, call){
  if (next.v === prev.v) return 'tie';
  const higher = next.v > prev.v;
  return (call === 'up') === higher ? 'right' : 'wrong';
}

/* points for reaching a streak of n: 0,1,2,3... so the run is triangular */
function runScore(n){ return n * (n - 1) / 2; }

/* ── THE ODDS, AND THE MACHINE THAT KNOWS THEM ─────────────────────
   A machine playing this properly is unbeatable at nothing — the
   right call on a 2 is obvious, so every band makes it. What
   separates the bands is what they do in the middle, where the
   decision is genuinely close to a coin toss and a human hesitates.

   `edge` is how often it takes the better side when there IS a better
   side. Below 1.0 it sometimes takes the worse one, which is what a
   distracted person does and what makes it beatable. */
const BANDS = [
  { k:'easy',   name:T('Guessing','Jaqta\''),       edge:0.62 },
  { k:'medium', name:T('Counting','Jgħodd'),        edge:0.82 },
  { k:'hard',   name:T('Card sharp','Jaf il-karti'), edge:0.96 }
];

/* the honest probability that the next card is higher than v, given a
   fresh deck — used by the machine and by the hint dots on screen */
function pHigher(v){
  const above = (RANKS.length - 1 - v) * 4;
  const below = v * 4;
  const total = above + below;
  return total ? above / total : 0.5;
}

function cpuCall(prev, band, rnd){
  const B = BANDS.find(b => b.k === band) || BANDS[1];
  const r = rnd || Math.random;
  const p = pHigher(prev.v);
  const better = p >= 0.5 ? 'up' : 'down';
  const worse  = better === 'up' ? 'down' : 'up';
  return r() < B.edge ? better : worse;
}

window.KARTI_OGHLA = {
  RANKS, SUITS, MIN_SEATS, MAX_SEATS, RUN_MAX, BANDS,
  deck, judge, runScore, pHigher, cpuCall,
  label: c => RANKS[c.v],
  suit:  c => SUITS[c.s]
};

})();
