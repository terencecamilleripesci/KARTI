/* ═══════════════════════════════════════════════════════════════════
   KARTI — spy.js   ·   L-ISPJUN — the engine

   The hidden-role word game: everybody at the table gets the same
   secret word except the spies, who get nothing and have to bluff
   their way through the questions. The rules live here, pure and
   screen-free; js/spy-ui.js draws them.

   WHAT LIVES HERE
     · the no-repeat bag — a session never deals the same word twice
       until it has dealt every other word in the chosen themes
     · spy assignment (with the hard ceiling: spies must always be
       outnumbered by people who know the word)
     · the deterministic online deal — same seed, same round number,
       same word and same spies on every phone, without one byte of
       the secret ever crossing the wire
     · the decoy grid the spy guesses from
     · verdict + scoring
     · a light veil over the saved secret, so the word and the spy
       list are not sitting in localStorage in plain text for anybody
       who idly opens the save. It is a veil, not a vault — the DOM
       discipline in spy-ui.js is the real secrecy.

   No sockets, no DOM, no timers. `node --check`s clean and can be
   driven headless by the test harness.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const W = () => window.KARTI_SPY_WORDS || null;

/* ── PRNG — the same one the rest of the app's games use ──────────── */
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, rnd){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* ── the pool ──────────────────────────────────────────────────────
   A word id is 'themeId:index' — stable across sessions as long as
   nobody reorders spy-words.js, which is why the bag can live in
   localStorage. */
function themes(){
  const w = W();
  return w ? w.themes : [];
}
function poolFor(themeIds){
  const ids = [];
  const want = themeIds && themeIds.length ? themeIds : themes().map(t => t.id);
  for (const t of themes()){
    if (want.indexOf(t.id) < 0) continue;
    for (let i = 0; i < t.words.length; i++) ids.push(t.id + ':' + i);
  }
  return ids;
}
function entryOf(id){
  const at = String(id).indexOf(':');
  if (at < 0) return null;
  const t = (W() && W().theme(String(id).slice(0, at))) || null;
  const w = t && t.words[Number(String(id).slice(at + 1))];
  return w ? { theme: t, mt: w[0], en: w[1] } : null;
}
function wordOf(id, lang){
  const e = entryOf(id);
  return e ? (lang === 'en' ? e.en : e.mt) : '';
}
function themeOf(id){
  const e = entryOf(id);
  return e ? e.theme : null;
}

/* ── THE NO-REPEAT BAG ─────────────────────────────────────────────
   `used` is a map of word ids this SESSION has already dealt. A draw
   picks uniformly from the ids not yet used, which is exactly the
   shuffled-bag guarantee: nothing repeats until the pool for the
   chosen themes is exhausted, and only then does the bag refill.
   The map is part of the saved session, so it survives a reload. */
function drawWord(pool, used, rnd){
  rnd = rnd || Math.random;
  let fresh = pool.filter(id => !used[id]);
  if (!fresh.length){                       /* the bag is empty: refill */
    for (const id of pool) delete used[id];
    fresh = pool.slice();
  }
  const id = fresh[Math.floor(rnd() * fresh.length)];
  used[id] = 1;
  return id;
}

/* ── SPIES ─────────────────────────────────────────────────────────
   The ceiling is the rule that keeps the game a game: the people who
   KNOW the word must always outnumber the people who do not, or there
   is nobody left to catch anybody. floor((n-1)/2) enforces exactly
   that. Auto scales the way the table actually wants: one spy is the
   classic hunt, two is the better game once the table is big enough
   that one spy drowns. The two spies DO NOT know each other — see
   the design note in spy-ui.js. */
function maxSpies(n){ return Math.max(1, Math.floor((n - 1) / 2)); }
function autoSpies(n){ return n >= 12 ? 3 : n >= 8 ? 2 : 1; }
function spyCount(n, setting){
  const want = (setting | 0) > 0 ? (setting | 0) : autoSpies(n);
  return Math.min(want, maxSpies(n));
}
function pickSpies(n, count, rnd){
  rnd = rnd || Math.random;
  const seats = shuffled(Array.from({ length: n }, (_, i) => i), rnd);
  return seats.slice(0, count).sort((a, b) => a - b);
}

/* ── THE DECOY GRID ────────────────────────────────────────────────
   When a spy guesses, an open guess against a pool of hundreds is no
   guess at all — the printed game solves this with a reference card
   of every location, and this is our equivalent: twelve words from
   the same theme, one of them real, same grid on every phone that
   needs it because it is seeded. */
const GRID = 12;
function decoyGrid(wordId, seed){
  const t = themeOf(wordId);
  if (!t) return [wordId];
  const rnd = mulberry32((seed >>> 0) ^ 0xD0C0FE);
  const rest = [];
  for (let i = 0; i < t.words.length; i++){
    const id = t.id + ':' + i;
    if (id !== wordId) rest.push(id);
  }
  const picks = shuffled(rest, rnd).slice(0, GRID - 1);
  picks.push(wordId);
  return shuffled(picks, rnd);
}

/* ── THE DETERMINISTIC ONLINE DEAL ─────────────────────────────────
   Every phone holds the same words file and the same seed, so every
   phone can deal the same round without the secret ever crossing the
   wire: the word order is one seeded shuffle of the pool, round r
   takes entry (r-1) mod length — no repeats until the pool is spent —
   and the spies are a second seeded pick folded with the round number
   so they change every round. */
function onlineDeal(seed, round, themeIds, nSeats, spySetting){
  const pool = poolFor(themeIds);
  if (!pool.length) return null;
  const order = shuffled(pool, mulberry32((seed >>> 0) ^ 0x5EED));
  const wordId = order[(Math.max(1, round | 0) - 1) % order.length];
  const rr = mulberry32(((seed >>> 0) ^ Math.imul(round | 0, 2654435761)) >>> 0);
  const spies = pickSpies(nSeats, spyCount(nSeats, spySetting), rr);
  const askFirst = Math.floor(rr() * nSeats);
  return { wordId, spies, askFirst,
           gridSeed: ((seed >>> 0) ^ Math.imul(round | 0, 40503)) >>> 0 };
}

/* ── VERDICT + SCORE ───────────────────────────────────────────────
   One vocabulary for every path a round can end by:
     'caught'   the table pointed at a spy and the spy's last-chance
                guess (if taken) was wrong          → table wins
     'stolen'   a spy was pointed at, or gave up, and GUESSED THE
                WORD                                → spies win
     'wrong'    the table pointed at an innocent    → spies win
     'escaped'  the clock ran out with no decision  → spies win
     'flopped'  a spy gave up and guessed wrong     → table wins
   Points: a spy win pays 3 to every spy; a table win pays 1 to every
   non-spy. Asymmetric on purpose — the spy is outnumbered and playing
   the harder game, and over an evening the scores stay interesting. */
const SPY_WIN = { stolen:1, wrong:1, escaped:1 };
function spiesWin(outcome){ return !!SPY_WIN[outcome]; }
function applyScore(scores, players, spies, outcome){
  const win = spiesWin(outcome);
  for (let i = 0; i < players.length; i++){
    const isSpy = spies.indexOf(i) >= 0;
    const pts = win ? (isSpy ? 3 : 0) : (isSpy ? 0 : 1);
    if (!pts) continue;
    const k = players[i];
    scores[k] = (scores[k] || 0) + pts;
  }
  return scores;
}

/* ── THE VEIL over the saved secret ────────────────────────────────
   XOR with a per-save nonce, then base64. Enough that the word is not
   legible in a casual look at localStorage; not sold as more. */
function veil(obj, nonce){
  try {
    const s = JSON.stringify(obj);
    const r = mulberry32(nonce >>> 0);
    let out = '';
    for (let i = 0; i < s.length; i++)
      out += String.fromCharCode(s.charCodeAt(i) ^ (Math.floor(r() * 256) & 0x7F));
    return btoa(unescape(encodeURIComponent(out)));
  } catch(e){ return null; }
}
function unveil(b64, nonce){
  try {
    const s = decodeURIComponent(escape(atob(b64)));
    const r = mulberry32(nonce >>> 0);
    let out = '';
    for (let i = 0; i < s.length; i++)
      out += String.fromCharCode(s.charCodeAt(i) ^ (Math.floor(r() * 256) & 0x7F));
    return JSON.parse(out);
  } catch(e){ return null; }
}

/* ── VOTE TALLY (online) ───────────────────────────────────────────
   votes: {seat:target}, target -1 = "nobody". Plurality convicts; a
   tie or a "nobody" plurality convicts no one — the table had its
   chance and could not agree, which is a spy win. Returns the seat
   convicted, or -1. */
function tally(votes, nSeats){
  const count = {};
  let cast = 0;
  for (let s = 0; s < nSeats; s++){
    const t = votes[s];
    if (t === undefined) continue;
    cast++;
    if (t >= 0 && t < nSeats) count[t] = (count[t] || 0) + 1;
  }
  let best = -1, bestN = 0, tie = false;
  for (const k in count){
    if (count[k] > bestN){ best = Number(k); bestN = count[k]; tie = false; }
    else if (count[k] === bestN) tie = true;
  }
  if (best < 0 || tie || bestN * 2 <= cast) return -1;   /* needs a real plurality */
  return best;
}

window.KARTI_SPY_ENG = {
  mulberry32, shuffled,
  themes, poolFor, entryOf, wordOf, themeOf,
  drawWord, decoyGrid, GRID,
  maxSpies, autoSpies, spyCount, pickSpies,
  onlineDeal, tally,
  spiesWin, applyScore,
  veil, unveil
};

})();
