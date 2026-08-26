/* ═══════════════════════════════════════════════════════════════════
   KARTI — il-forka.js
   IL-FORKA ("the gallows") — Hangman, 2–8 players, party scoring. The
   pure engine: rules only, no DOM, no clock, nothing random in anything
   that decides state. The screen half is js/il-forka-ui.js.

   THE GAME
     A hidden word. Players take turns calling a letter. A letter that is
     IN the word is revealed everywhere and scores its caller a point per
     square it fills; a letter that is NOT adds one piece to the gallows
     and passes the turn. Reveal the whole word and the last caller takes
     the round; let the man hang (MAX_WRONG misses) and the SETTER takes
     it. Rotate the setter, play a few rounds, most points wins.

   WHO KNOWS THE WORD — the referee model that keeps online honest
     Exactly one seat is the SETTER each round and the setter does not
     guess. Offline the setter is the machine (or the person passing the
     phone); ONLINE the setter's own phone holds the word and referees:
     a guesser sends a bare letter on the wire, the setter's phone checks
     it against the word it holds and broadcasts the RESULT (which squares
     the letter fills, and whether it was a miss). Nobody else's phone
     ever receives the word, so there is nothing to read out of the
     traffic — the same reason minhu/kodici keep a secret. The engine
     therefore runs in two skins: a REFEREE copy that holds st.word and
     rules on guesses, and BLIND copies that only apply the rulings.

   THE WIRE — numbers only (mp.js's codec refuses anything else):
     guess : {t:'guess',  l}                 a guesser calls letter l
     reveal: {t:'reveal', l, m0,m1,m2, w}    the setter's ruling: letter l
              fills the squares in the 24-bit mask (m0=bits0-7, m1=8-15,
              m2=16-23), w=1 if it was a miss. Word length is capped at 24
              so the mask fits three bytes.
     Both are flat integer fields — WIRE_FIELDS below, append-only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const MIN_SEATS = 2, MAX_SEATS = 8;
const MAX_WRONG = 6;                    /* head, torso, 2 arms, 2 legs   */
const MAX_LEN   = 24;                   /* mask fits three wire bytes     */
const WIRE_FIELDS = ['l', 'm0', 'm1', 'm2', 'w'];

/* THE ALPHABET — English A–Z plus the four Maltese letters that carry a
   diaqua, so a Maltese word is spelt honestly. Index 0..29; a guess and a
   letter on the wire is this index. Kept as a flat string so codeOf/letOf
   are O(1) and identical on every phone. */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZĊĠĦŻ';
const NLET = LETTERS.length;            /* 30 */
const codeOf = ch => LETTERS.indexOf(ch);
const letOf  = i => LETTERS[i] || '';

/* fold a raw character to a LETTERS index: upper-case, map the Maltese
   forms, and treat a plain c/g/h/z as their plain selves (the accented
   ones are their own letters). Returns -1 for spaces/punctuation, which
   are shown pre-revealed. */
function foldChar(ch){
  ch = String(ch || '').toUpperCase();
  const i = LETTERS.indexOf(ch);
  return i;                              /* -1 for anything not a letter */
}

/* ── the bundled word banks — common, recognisable words the machine sets
   when you play it. Split by language so the player can pick English,
   Maltese, or both at the start; pickWord() reads the chosen one. */
const BANK_EN = [
  'ISLAND','HARBOUR','SUMMER','FIESTA','BALCONY','LANTERN','ORANGE','GALLERY',
  'THUNDER','MARKET','CAPTAIN','DIAMOND','JOURNEY','KITCHEN','LIBRARY','MACHINE',
  'NETWORK','OCTOPUS','PUZZLE','QUARTER','RAINBOW','SANDALS','TREASURE','VILLAGE',
  'WHISPER','FACTORY','GARDEN','HAMMER','JACKET','KETTLE','LADDER','MIRROR',
  'PARROT','ROCKET','SADDLE','TUNNEL','WALNUT','ANCHOR','BRIDGE','CANDLE'
];
const BANK_MT = [
  'GĦASEL','ĦOBŻ','QAMAR','XEMX','BAĦAR','TIĠIEĠA','KELB','QATTUS','FJURA',
  'TIFEL','TIFLA','MARA','RAĠEL','DAR','TRIQ','KNISJA','FESTA','LOGĦBA',
  'KARTI','ĦANUT','MEJDA','SIĠĠU','FTIRA','ĠELAT','PASTIZZ','QARNITA','ĊAVETTA',
  'ĠARDIN','ŻARBUN','ĦAJT','XITWA','SAJF','GĦAJN','ĦUTA','ĠOBON','ĦALIB'
];
const BANK = BANK_EN.concat(BANK_MT);
function bankFor(lang){ return lang === 'en' ? BANK_EN : lang === 'mt' ? BANK_MT : BANK; }

/* codes for a spelt word: LETTERS index per position, -1 for a space. */
function spell(word){
  const s = String(word || '').toUpperCase();
  const out = [];
  for (let i = 0; i < s.length && out.length < MAX_LEN; i++){
    out.push(foldChar(s[i]));           /* -1 = space/punct, shown free */
  }
  return out;
}

/* is a proposed setter word usable? at least MIN_WORD real letters, all
   in the alphabet, within length. Returns '' if ok else a reason key. */
const MIN_WORD = 3;
function checkWord(word){
  const codes = spell(word);
  const real = codes.filter(c => c >= 0).length;
  if (real < MIN_WORD) return 'short';
  if (spell(word).length !== String(word || '').toUpperCase().slice(0, MAX_LEN).length && String(word||'').length > MAX_LEN) return 'long';
  return '';
}

/* ── a round ─────────────────────────────────────────────────────────
   opts: { seats, setter, word?, blind? }
     seats  : how many chairs (all of them; one is the setter)
     setter : which seat sets this round (does not guess)
     word   : the spelt word — REFEREE only; blind copies omit it
     blind  : true on a guesser's phone; it is told only the length */
function newRound(opts){
  opts = opts || {};
  const seats = Math.max(MIN_SEATS, Math.min(MAX_SEATS, (opts.seats | 0) || 2));
  const setter = ((opts.setter | 0) % seats + seats) % seats;
  const word = opts.word ? spell(opts.word) : null;
  const len = word ? word.length : Math.max(1, Math.min(MAX_LEN, opts.len | 0));
  const st = {
    seats, setter, len,
    word,                               /* null on a blind (guesser) copy */
    slots: new Array(len).fill(-1),     /* -1 hidden, else letter code, spaces pre-filled */
    guessed: new Array(NLET).fill(false),
    wrong: 0,
    turn: firstGuesser(setter, seats),  /* first non-setter seat          */
    scores: opts.scores ? opts.scores.slice() : new Array(seats).fill(0),
    done: null,                         /* {winner, reason:'solved'|'hanged'} */
    last: null                          /* {seat, l, hit, gained} for the UI */
  };
  /* spaces/punctuation are never hidden */
  if (word) for (let i = 0; i < len; i++) if (word[i] < 0) st.slots[i] = -2; /* -2 = gap */
  return st;
}
function firstGuesser(setter, seats){
  for (let h = 1; h <= seats; h++){ const s = (setter + h) % seats; if (s !== setter) return s; }
  return setter;
}
function nextGuesser(st){
  for (let h = 1; h <= st.seats; h++){
    const s = (st.turn + h) % st.seats;
    if (s !== st.setter) return s;
  }
  return st.turn;
}

/* how many squares a letter fills, and the 24-bit mask of which — REFEREE
   only (needs st.word). Returns {mask, count}. */
function positionsOf(st, code){
  let mask = 0, count = 0;
  if (!st.word) return { mask:0, count:0 };
  for (let i = 0; i < st.len; i++){
    if (st.word[i] === code){ mask |= (1 << i); count++; }
  }
  return { mask, count };
}

/* a letter is legal to call if the round is live, it's this seat's turn,
   the seat is a guesser, and the letter has not been called. */
function canGuess(st, code, seat){
  if (st.done || seat !== st.turn || seat === st.setter) return false;
  if (code < 0 || code >= NLET) return false;
  return !st.guessed[code];
}

/* REFEREE: resolve a guess against the held word. Returns the ruling
   {l, mask, count, wrong} which becomes the wire 'reveal', and MUTATES st.
   Scoring: a hit scores the caller `count` points; a miss adds a piece. */
function referee(st, code, seat){
  if (!canGuess(st, code, seat)) return null;
  const { mask, count } = positionsOf(st, code);
  applyRuling(st, seat, code, mask, count > 0 ? 0 : 1);
  return { l: code, mask, count, wrong: count > 0 ? 0 : 1 };
}

/* EVERY copy (referee re-applies its own ruling too, so state is one
   codepath) folds a ruling in: reveal the squares, mark the letter,
   score, advance the gallows or the turn, and test the end. */
function applyRuling(st, seat, code, mask, wrongFlag){
  if (st.done || st.guessed[code]) return false;
  st.guessed[code] = true;
  let gained = 0;
  if (!wrongFlag){
    for (let i = 0; i < st.len; i++) if (mask & (1 << i)){ st.slots[i] = code; gained++; }
    st.scores[seat] += gained;
  } else {
    st.wrong++;
  }
  st.last = { seat, l: code, hit: !wrongFlag, gained };
  /* end tests: solved (no hidden real square left) or hanged */
  if (solved(st)){
    st.scores[seat] += SOLVE_BONUS;
    st.done = { winner: seat, reason: 'solved' };
  } else if (st.wrong >= MAX_WRONG){
    st.scores[st.setter] += HANG_BONUS;
    st.done = { winner: st.setter, reason: 'hanged' };
  } else if (wrongFlag){
    st.turn = nextGuesser(st);          /* a miss passes; a hit plays on */
  }
  return true;
}
const SOLVE_BONUS = 3;                   /* finishing the word           */
const HANG_BONUS  = 4;                   /* the setter's reward           */

function solved(st){
  for (let i = 0; i < st.len; i++) if (st.slots[i] === -1) return false;
  return true;
}

/* BLIND copy applies a wire reveal it cannot verify (it has no word). The
   setter is authoritative; a guesser trusts the ruling and renders it. */
function applyReveal(st, wire, seat){
  const code = wire.l | 0;
  const mask = (wire.m0 | 0) | ((wire.m1 | 0) << 8) | ((wire.m2 | 0) << 16);
  return applyRuling(st, seat, code, mask, wire.w ? 1 : 0);
}

/* the man's state, 0..MAX_WRONG, for the UI to draw the gallows. */
const gallows = st => Math.min(MAX_WRONG, st.wrong);

/* reveal the whole word at round end (the setter tells everyone) — used
   only to SHOW the answer; scoring already happened. */
function fillAnswer(st, codes){
  for (let i = 0; i < st.len && i < codes.length; i++)
    if (st.slots[i] === -1) st.slots[i] = codes[i];
}

/* THE MACHINE — as a GUESSER (offline vs-computer where you are setter is
   not a thing; the machine sets, you guess). This is the machine picking
   the SETTER's word, deterministically from a seed, and — if a bot ever
   guesses — a frequency-ordered letter it has not tried. No Math.random. */
const FREQ = 'EAIOTNSRLĦUDGĠCMPBŻKFĊVWXYJQZ';   /* rough EN+MT letter frequency */
function botLetter(st){
  for (let k = 0; k < FREQ.length; k++){
    const c = LETTERS.indexOf(FREQ[k]);
    if (c >= 0 && !st.guessed[c]) return c;
  }
  for (let c = 0; c < NLET; c++) if (!st.guessed[c]) return c;
  return 0;
}
/* deterministic word pick: index into the chosen language bank from a
   seed + round number. lang: 'en' | 'mt' | anything else = both. */
function pickWord(seed, round, lang){
  const bank = bankFor(lang);
  const i = (((seed >>> 0) + (round | 0) * 2654435761) >>> 0) % bank.length;
  return bank[i];
}

const encWire = mv => {
  if (mv.t === 'reveal') return { t:'reveal', l: mv.l | 0,
      m0: (mv.mask | 0) & 255, m1: ((mv.mask | 0) >> 8) & 255, m2: ((mv.mask | 0) >> 16) & 255,
      w: mv.wrong ? 1 : 0 };
  if (mv.t === 'setword') return { t:'setword', l: mv.l | 0 };   /* l = word length */
  return { t:'guess', l: mv.l | 0 };
};
const decWire = mv => {
  if (!mv) return null;
  if (mv.t === 'guess')   return { t:'guess',   l: mv.l | 0 };
  if (mv.t === 'setword') return { t:'setword', l: mv.l | 0 };
  if (mv.t === 'reveal')  return { t:'reveal', l: mv.l | 0, m0: mv.m0 | 0, m1: mv.m1 | 0, m2: mv.m2 | 0, w: mv.w ? 1 : 0 };
  return null;
};

window.KARTI_ILFORKA = window.KARTI_ILFORKA || {};
window.KARTI_ILFORKA.engine = {
  MIN_SEATS, MAX_SEATS, MAX_WRONG, MAX_LEN, WIRE_FIELDS,
  LETTERS, NLET, codeOf, letOf, foldChar, spell, checkWord, BANK, BANK_EN, BANK_MT, bankFor,
  newRound, referee, applyRuling, applyReveal, positionsOf, canGuess,
  nextGuesser, firstGuesser, solved, gallows, fillAnswer,
  botLetter, pickWord, encWire, decWire,
  SOLVE_BONUS, HANG_BONUS
};

})();
