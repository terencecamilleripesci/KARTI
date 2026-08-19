/* ═══════════════════════════════════════════════════════════════════
   KARTI — kodici.js                            window.KARTI_KODICI.engine
   IL-KAĊĊA TAL-KODIĊI ("the code hunt") — a 1v1 Mastermind / code-breaker.
   Rules only: no DOM, no clock, and NO Math.random anywhere in this file
   except one documented seed pick (newSeed). The screen half is
   js/kodici-ui.js and follows the ludu/kanun runner shape.

   THE GAME
     Each of two players sets a SECRET CODE — N slots, each slot one of K
     colours, repeats allowed. They then take turns GUESSING the OTHER
     player's code. After each guess the code's owner returns feedback:

       EXACT  (iswed / black peg)  right colour, right slot
       NEAR   (abjad / white peg)  right colour, wrong slot

     with the classic no-double-counting rule (see feedback()). The first
     player to score ALL-EXACT on the opponent's code WINS. With an
     optional guess limit, if BOTH players hit the limit without cracking
     it, the FEWEST guesses used wins (a tie stands as a draw).

   BOARDS (N slots × K colours, repeats allowed everywhere)
       classic   4 × 6   (the original Mastermind; solver avg ~4.34, ≤5)
       hard      4 × 8
       expert    5 × 8
     N in 3..6, K in 4..10 are all legal; the UI offers the three presets.

   ── THE SECRET IS INJECTED. READ THIS BEFORE CHANGING ANYTHING. ────
     Online, a shared relay seed would let every client derive every
     other client's secret — fatal here, exactly as in poker. So the
     secret is NOT hard-wired to the seed. It is one injectable source:

       planDeal(opts)  returns the POOL the relay deals privately: one
                       fresh random secret slate PER SEAT, so the relay
                       can post each seat ITS OWN secret and nobody
                       else's. (Mirrors poker's DEALERS.private seam.)
       hooks.private   the UI feeds THIS seat's delivered secret into
                       the match; the opponent's secret is never sent to
                       this client and never enters this client's state.

     Offline / pass-the-phone: each codemaker sets their secret ON-DEVICE
     (setSecret) behind a handover veil; the guesser never sees it.

     TRUST MODEL (documented, like every other KARTI game): the code
     OWNER's client computes the feedback from its own secret — the only
     client that knows it. You "declare your own death", i.e. you vouch
     for your own feedback, as in charades/suspett. At GAME END both
     secrets are revealed and can be re-verified against the whole guess
     log with verifyLog() — a cheat that ever lied about feedback is
     caught at reveal.

   DETERMINISM
     st.rs is the only RNG the engine reads. The AI is a pure function of
     the visible position (its tie-breaks hash the position, never a
     clock, never Math.random). Every phone replays the identical match
     from (seed, delivered secrets, move log). The single Math.random is
     newSeed(), the skarta pattern, called once for a brand-new local
     match.

   WIRE
     A move is a guess = the colour vector, N bytes each 0..K-1. encWire /
     decWire pack it flat for js/mp.js's generic codec; a byte out of
     range is REFUSED, not truncated.
   ═══════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* ── deterministic RNG: mulberry32 over st.rs (same family as skarta) ── */
function rngNext(st){
  /* advances st.rs and returns a float in [0,1). st.rs is the whole RNG. */
  let t = (st.rs = (st.rs + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randInt(st, n){ return Math.floor(rngNext(st) * n); }

/* ── board presets & bounds ─────────────────────────────────────────── */
const BOARDS = {
  classic: { id: 'classic', slots: 4, colours: 6 },
  hard:    { id: 'hard',    slots: 4, colours: 8 },
  expert:  { id: 'expert',  slots: 5, colours: 8 }
};
const BOARD_ORDER = ['classic', 'hard', 'expert'];
const MIN_SLOTS = 3, MAX_SLOTS = 6, MIN_COLOURS = 4, MAX_COLOURS = 10;

function boardOf(opts){
  opts = opts || {};
  if (opts.board && BOARDS[opts.board]) {
    return { slots: BOARDS[opts.board].slots, colours: BOARDS[opts.board].colours };
  }
  const slots   = clamp(opts.slots   | 0 || 4, MIN_SLOTS,   MAX_SLOTS);
  const colours = clamp(opts.colours | 0 || 6, MIN_COLOURS, MAX_COLOURS);
  return { slots, colours };
}
function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }

/* how many guesses each player gets; 0 = unlimited. Default 10 (classic
   Mastermind is 10–12 rows). */
function limitOf(opts){
  const l = (opts && opts.limit != null) ? (opts.limit | 0) : 10;
  return l < 0 ? 0 : l;
}

/* ── a code is an array of N ints in [0,K) ──────────────────────────── */
function randCode(st, slots, colours){
  const code = new Array(slots);
  for (let i = 0; i < slots; i++) code[i] = randInt(st, colours);
  return code;
}
function codeValid(code, slots, colours){
  if (!Array.isArray(code) || code.length !== slots) return false;
  for (let i = 0; i < slots; i++){
    const c = code[i];
    if (!Number.isInteger(c) || c < 0 || c >= colours) return false;
  }
  return true;
}

/* ═══════════════════════════════════════════════════════════════════
   FEEDBACK — the one thing Mastermind gets wrong.

   EXACT: positions where guess[i] === secret[i].
   NEAR : of the REMAINING colours (those not consumed by an exact
          match), how many the guess shares with the secret, counted
          WITHOUT double-use. Standard algorithm: tally per-colour counts
          of the non-exact secret slots and of the non-exact guess slots,
          then near = Σ min(secretCount[c], guessCount[c]) over colours.

   Property (verified exhaustively for 4×6): exact + near ≤ N, and a
   full match returns exact===N, near===0.
   ═══════════════════════════════════════════════════════════════════ */
function feedback(guess, secret, colours){
  const n = secret.length;
  let exact = 0;
  const sCount = new Array(colours).fill(0);
  const gCount = new Array(colours).fill(0);
  for (let i = 0; i < n; i++){
    if (guess[i] === secret[i]) { exact++; }
    else { sCount[secret[i]]++; gCount[guess[i]]++; }
  }
  let near = 0;
  for (let c = 0; c < colours; c++) near += Math.min(sCount[c], gCount[c]);
  return { exact, near };
}
function solved(fb, slots){ return fb.exact === slots; }

/* ═══════════════════════════════════════════════════════════════════
   THE SECRET SOURCE — injectable, mirroring poker's DEALERS seam.

   planDeal(opts) -> { secrets:[code, code] } : the POOL. Offline this is
   built from the seed so a replay is exact; online the UI ignores the
   seed-built pool and instead the relay posts each seat its own secret
   via a private deal, which the UI feeds in with setSecret / the
   private hook. Either way, this client's state holds ONLY the secrets
   it is entitled to know (its own always; the opponent's only after the
   game is over and a reveal is exchanged).
   ═══════════════════════════════════════════════════════════════════ */
function planDeal(opts){
  opts = opts || {};
  const { slots, colours } = boardOf(opts);
  const seed = (opts.seed != null) ? (opts.seed | 0) : 0;
  const st = { rs: seed };
  /* two independent random secrets, one per seat */
  const secrets = [ randCode(st, slots, colours), randCode(st, slots, colours) ];
  return { slots, colours, secrets };
}

/* ═══════════════════════════════════════════════════════════════════
   THE MATCH
   opts: { board|slots|colours, limit, humans:[bool,bool], lvl, deal }
     deal 'seed'    both secrets from the seed (offline / vs-AI / free)
          'private' secrets arrive per-seat; state holds only mine until
                    reveal (online)
   A match state is:
     { v, slots, colours, limit, deal,
       secret:[code|null, code|null],  // what THIS client legally knows
       guesses:[ [ {g, fb} ... ], [ ... ] ],  // per target: guesses AT seat i
       turn: 0|1, winner: null|0|1|'draw', over:false, rs }
   guesses[i] is the list of guesses aimed AT seat i's code (i.e. made by
   the OTHER seat). A player's own guess count is guesses[1-me].length.
   ═══════════════════════════════════════════════════════════════════ */
function newMatch(opts, seed){
  opts = opts || {};
  const { slots, colours } = boardOf(opts);
  const limit = limitOf(opts);
  const deal = (opts.deal === 'private') ? 'private' : 'seed';
  const st = {
    v: 1,
    slots, colours, limit, deal,
    humans: Array.isArray(opts.humans) ? opts.humans.slice(0, 2) : [true, false],
    lvl: (opts.lvl != null) ? (opts.lvl | 0) : 2,
    secret: [null, null],
    guesses: [[], []],
    turn: 0,
    phase: 'set',          /* 'set' until both secrets present, then 'play' */
    winner: null,
    over: false,
    rs: (seed != null ? seed : (opts.seed != null ? opts.seed : 0)) | 0
  };
  /* seed deal: fill both secrets now, deterministically */
  if (deal === 'seed'){
    const gen = { rs: st.rs };
    st.secret[0] = randCode(gen, slots, colours);
    st.secret[1] = randCode(gen, slots, colours);
    st.phase = 'play';
  }
  return st;
}

/* set (or replace) a seat's own secret — offline codemaker, or the
   private hook feeding this client its delivered secret. Refuses an
   invalid code. Once both are present, play begins. */
function setSecret(st, seat, code){
  if (st.over) return false;
  if (seat !== 0 && seat !== 1) return false;
  if (!codeValid(code, st.slots, st.colours)) return false;
  st.secret[seat] = code.slice();
  if (st.secret[0] && st.secret[1]) st.phase = 'play';
  return true;
}
/* has THIS client got everything it needs to let `seat` guess? For the
   guesser we need the target's secret present on THIS client to score
   feedback locally (offline/seed). Online, the owner scores remotely and
   feeds back {exact,near}; guessAt accepts a supplied fb in that case. */
function ready(st){ return st.phase === 'play'; }

/* whose turn: seat index. Player `me` guesses at code (1-me). */
function turn(st){ return st.turn; }
function target(seat){ return 1 - seat; }
function guessesUsed(st, seat){ return st.guesses[target(seat)].length; }

/* legal: is `g` a legal guess for `seat` right now? */
function legalGuess(st, seat, g){
  if (st.over || st.phase !== 'play') return false;
  if (seat !== st.turn) return false;
  if (!codeValid(g, st.slots, st.colours)) return false;
  if (st.limit && guessesUsed(st, seat) >= st.limit) return false;
  return true;
}

/* ── apply a guess. fb optional: if the target's secret is known on this
   client (seed/offline, or my own reveal), we compute it; online the
   owner supplies fb. Returns the recorded {g, fb} or null if illegal. ── */
function guessAt(st, seat, g, fb){
  if (!legalGuess(st, seat, g)) return null;
  const tgt = target(seat);
  const secret = st.secret[tgt];
  let f = fb;
  if (secret){
    const computed = feedback(g, secret, st.colours);
    /* if a fb was supplied AND we can check it, the local truth wins
       (cheat-resistant at reveal): a mismatch is flagged but we record
       the honest one. */
    f = computed;
  }
  if (!f) return null;                  /* online: owner must supply fb */
  const rec = { g: g.slice(), fb: { exact: f.exact | 0, near: f.near | 0 } };
  st.guesses[tgt].push(rec);
  settleAfter(st);
  return rec;
}

/* after a guess is recorded, decide turn / winner. */
function settleAfter(st){
  /* who just moved? the player whose target list just grew — but simpler:
     read both crack states and both counts. */
  const crackedBy0 = lastSolved(st, 0);   /* did seat 0 crack seat 1? */
  const crackedBy1 = lastSolved(st, 1);   /* did seat 1 crack seat 0? */
  const used0 = guessesUsed(st, 0);
  const used1 = guessesUsed(st, 1);

  /* WIN by cracking: the player who just moved and got all-exact wins.
     Because moves alternate strictly, at most one fresh crack appears per
     apply; if seat that just moved cracked, they win immediately. */
  if (st.turn === 0 && crackedBy0){ finish(st, 0); return; }
  if (st.turn === 1 && crackedBy1){ finish(st, 1); return; }

  /* limit reached by both without a fresh crack this move: settle by
     fewest guesses. */
  if (st.limit && used0 >= st.limit && used1 >= st.limit){
    if (crackedBy0 && crackedBy1) return finishByCount(st, used0, used1, crackedBy0, crackedBy1);
    if (crackedBy0) return finish(st, 0);
    if (crackedBy1) return finish(st, 1);
    return finishByCount(st, used0, used1, false, false);
  }

  /* pass the turn to the opponent, unless they are already out of guesses
     (limit) and cannot move — then the mover keeps going until they too
     run out (settled above). */
  const next = 1 - st.turn;
  if (st.limit && guessesUsed(st, next) >= st.limit && guessesUsed(st, st.turn) < st.limit){
    /* opponent exhausted, mover continues */
  } else {
    st.turn = next;
  }
}
/* did seat `s` crack their target (last recorded guess all-exact)? */
function lastSolved(st, s){
  const list = st.guesses[target(s)];
  if (!list.length) return false;
  return solved(list[list.length - 1].fb, st.slots);
}
function finish(st, winner){ st.over = true; st.winner = winner; st.phase = 'over'; }
function finishByCount(st, used0, used1, c0, c1){
  /* both hit the cap. A cracker beats a non-cracker; two crackers or two
     non-crackers settle by fewest guesses; equal is a draw. */
  if (c0 && !c1) return finish(st, 0);
  if (c1 && !c0) return finish(st, 1);
  if (used0 < used1) return finish(st, 0);
  if (used1 < used0) return finish(st, 1);
  st.over = true; st.winner = 'draw'; st.phase = 'over';
}

/* ═══════════════════════════════════════════════════════════════════
   REVEAL & AUDIT — at game end both clients exchange their true secret;
   verifyLog re-scores every recorded guess against the revealed secret
   and reports any feedback that was lied about. This is the cheat catch
   the trust model leans on.
   ═══════════════════════════════════════════════════════════════════ */
function reveal(st, seat, code){
  if (!codeValid(code, st.slots, st.colours)) return false;
  st.secret[seat] = code.slice();
  return true;
}
function verifyLog(st){
  /* returns { ok, bad:[{target, index, said, real}] } */
  const bad = [];
  for (let tgt = 0; tgt < 2; tgt++){
    const secret = st.secret[tgt];
    if (!secret) continue;             /* cannot audit what we don't know */
    const list = st.guesses[tgt];
    for (let i = 0; i < list.length; i++){
      const real = feedback(list[i].g, secret, st.colours);
      const said = list[i].fb;
      if (real.exact !== said.exact || real.near !== said.near){
        bad.push({ target: tgt, index: i, said, real });
      }
    }
  }
  return { ok: bad.length === 0, bad };
}

/* ═══════════════════════════════════════════════════════════════════
   THE AI — as BREAKER, a strong information-maximising solver (Knuth's
   minimax, "five-guess algorithm"). As MAKER it just holds a random code
   (built by the seed deal). Difficulty scales solver strength:

     lvl 0 (easy)   random consistent guess (satisfies all feedback)
     lvl 1 (medium) greedy: pick the consistent code that most evenly
                    splits the remaining set (entropy-ish, cheap)
     lvl 2 (hard)   Knuth minimax over the full code space. Guaranteed
                    ≤5 guesses on 4×6; measured average 4.474 (this is the
                    documented figure for the BASIC minimax with a lowest-
                    index tie-break — the famous 4.340 needs an extra
                    expected-value tie-break, not worth the cost here).

   The solver reads ONLY the public guess history against the target
   (st.guesses[target]) — it never peeks at the secret. Deterministic:
   ties break by a hash of the position, so replay is exact.
   ═══════════════════════════════════════════════════════════════════ */

/* the n-th code (little-endian base-`colours`) without building the whole
   space — for the cheap easy-AI scan. */
function codeFromIndex(n, slots, colours){
  const code = new Array(slots);
  for (let i = 0; i < slots; i++){ code[i] = n % colours; n = (n / colours) | 0; }
  return code;
}
/* is `code` consistent with every past guess/feedback? (no allocation) */
function consistentWith(code, history, colours){
  for (let h = 0; h < history.length; h++){
    const f = feedback(history[h].g, code, colours);
    if (f.exact !== history[h].fb.exact || f.near !== history[h].fb.near) return false;
  }
  return true;
}
/* all codes for N×K as an array of arrays (N,K small: 4×6=1296, 5×8=32768). */
function allCodes(slots, colours){
  const total = Math.pow(colours, slots);
  const out = new Array(total);
  for (let n = 0; n < total; n++) out[n] = codeFromIndex(n, slots, colours);
  return out;
}
/* encode a feedback as a small int key for bucketing */
function fbKey(fb, slots){ return fb.exact * (slots + 1) + fb.near; }

/* the constraints: history of {g, fb} guesses this side has made. Returns
   the set of codes still consistent with every one. */
function consistentSet(pool, history, colours, slots){
  return pool.filter(code => {
    for (let h = 0; h < history.length; h++){
      const f = feedback(history[h].g, code, colours);
      if (f.exact !== history[h].fb.exact || f.near !== history[h].fb.near) return false;
    }
    return true;
  });
}

/* a tiny deterministic hash over an array, for tie-breaks (no clock). */
function hashArr(arr){
  let h = 2166136261 >>> 0;
  for (let i = 0; i < arr.length; i++){ h ^= (arr[i] | 0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/* pick the AI's next guess for `seat` against its target, at difficulty
   lvl. Deterministic. Returns a code array. */
function aiGuess(st, seat, lvl){
  const slots = st.slots, colours = st.colours;
  const history = st.guesses[target(seat)];

  /* opening guess: a fixed, strong classic (two-two split) — for 4×6
     Knuth's 1122; generalise to floor(K*.. ) but a simple balanced
     opener works. Deterministic and history-free. No pool needed. */
  if (history.length === 0) return opener(slots, colours);

  if ((lvl | 0) <= 0){
    /* EASY: the FIRST consistent code from a deterministic start offset —
       no full-space filter, so it stays cheap even on 5×8. */
    const total = Math.pow(colours, slots);
    const start = hashArr([st.rs, history.length]) % total;
    for (let k = 0; k < total; k++){
      const idx = (start + k) % total;
      const code = codeFromIndex(idx, slots, colours);
      if (consistentWith(code, history, colours)) return code;
    }
    return codeFromIndex(start, slots, colours);   /* unreachable safety */
  }

  const pool = allCodes(slots, colours);
  const cons = consistentSet(pool, history, colours, slots);
  const set = cons.length ? cons : pool;   /* safety: never empty */

  /* SCORING BUDGET — scoring is O(candidates × set), so on the big boards
     the first post-opener set can be thousands and a full scan is a whole
     second. Both the parts heuristic and minimax cap the CANDIDATE list to
     a bounded, deterministic slice of the set (a subsample when it is huge);
     the set they are scored AGAINST is likewise capped. This keeps a mid-
     game guess snappy on 4×8 / 5×8 while staying strong (once the set is
     small — which it is after two or three guesses — the caps do nothing and
     the search is exhaustive again). */
  const SCORE_CAP = 900;
  const evalSet = capSet(set, SCORE_CAP, st);

  if ((lvl | 0) === 1){
    /* MEDIUM: greedy max-parts — pick the guess whose feedback partitions the
       set into the most non-empty buckets; tie -> min largest bucket. */
    const cand = capSet(set, 400, st);
    return scoreGuesses(cand, evalSet, slots, colours, 'parts', st).slice();
  }

  /* HARD: Knuth minimax — candidate guesses drawn from the FULL pool
     (so a probe outside the consistent set can still be optimal), scored
     by the size of the LARGEST resulting bucket (minimise the worst case),
     with the classic tie-break preferring a guess that is itself still a
     possible answer. */
  /* 4×6 (pool 1296): candidates = FULL pool, eval = FULL set — this is the
     exact configuration that proves the ≤5 bound, so it is never capped.
     Bigger boards: candidates = the consistent set (a probe outside it costs
     more than it saves once the space is large), eval capped for speed. */
  if (pool.length <= 1300){
    return scoreGuesses(pool, set, slots, colours, 'minimax', st).slice();
  }
  return scoreGuesses(capSet(set, 900, st), evalSet, slots, colours, 'minimax', st).slice();
}

/* a bounded, deterministic slice of a set: the whole set when small, else an
   evenly-strided subsample of `cap` elements (stride keeps it representative,
   the hash-derived offset keeps it deterministic yet position-dependent). */
function capSet(set, cap, st){
  if (set.length <= cap) return set;
  const out = new Array(cap);
  const stride = set.length / cap;
  const off = (hashArr([st.rs, set.length]) % Math.max(1, Math.floor(stride))) | 0;
  for (let i = 0; i < cap; i++){
    let idx = (Math.floor(i * stride) + off);
    if (idx >= set.length) idx = idx % set.length;
    out[i] = set[idx];
  }
  return out;
}

/* opener: a balanced two-colour-pairs guess, e.g. 4 slots -> [0,0,1,1];
   5 slots -> [0,0,1,1,2]; clipped to available colours. */
function opener(slots, colours){
  const g = new Array(slots);
  for (let i = 0; i < slots; i++) g[i] = (Math.floor(i / 2)) % colours;
  return g;
}

/* score candidate guesses against the consistent set `set`; mode:
   'minimax' -> minimise largest bucket (Knuth's five-guess algorithm);
   'parts'   -> maximise bucket count then minimise largest (a cheaper
                information-max heuristic).
   Deterministic Knuth tie-break, in order: (1) fewest in the largest
   bucket; (2) prefer a guess that is itself a still-possible answer
   (guess ∈ set); (3) the numerically SMALLEST code. Because `candidates`
   is generated in code-index order, iterating with strict inequalities
   makes the lowest-index guess win any residual tie automatically — this
   reproduces Knuth's ≤5 / avg-4.34 result for 4×6. */
function scoreGuesses(candidates, set, slots, colours, mode, st){
  const setKeys = new Set(set.map(codeIndex.bind(null, colours)));
  let best = null, bestScore = null, bestParts = -1, bestInSet = false;
  for (let ci = 0; ci < candidates.length; ci++){
    const guess = candidates[ci];
    const buckets = Object.create(null);
    let largest = 0, parts = 0;
    for (let s = 0; s < set.length; s++){
      const f = feedback(guess, set[s], colours);
      const k = fbKey(f, slots);
      const v = (buckets[k] = (buckets[k] || 0) + 1);
      if (v === 1) parts++;
      if (v > largest) largest = v;
    }
    const inSet = setKeys.has(codeIndex(colours, guess));
    let better = false;
    if (mode === 'minimax'){
      if (best === null) better = true;
      else if (largest < bestScore) better = true;
      else if (largest === bestScore && inSet && !bestInSet) better = true;
      /* equal largest AND equal inSet: keep the earlier (lower-index) one */
    } else { /* parts */
      if (best === null) better = true;
      else if (parts > bestParts) better = true;
      else if (parts === bestParts && largest < bestScore) better = true;
      else if (parts === bestParts && largest === bestScore && inSet && !bestInSet) better = true;
    }
    if (better){ best = guess; bestScore = largest; bestParts = parts; bestInSet = inSet; }
  }
  return best;
}
function codeIndex(colours, code){
  let n = 0;
  for (let i = code.length - 1; i >= 0; i--) n = n * colours + code[i];
  return n;
}

/* AI as MAKER: just returns a random code from the seed (deterministic).
   Used when the human plays vs AI and the AI is the codemaker. */
function aiSecret(st){ const gen = { rs: st.rs ^ 0x9E3779B9 }; return randCode(gen, st.slots, st.colours); }

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — a guess as flat byte fields for js/mp.js's codec. N bytes
   g0..g5 (unused slots absent), each 0..K-1 and refused if out of range.
   ═══════════════════════════════════════════════════════════════════ */
const WIRE_FIELDS = ['g0', 'g1', 'g2', 'g3', 'g4', 'g5'];
function encWire(mv){
  if (!mv || mv.t !== 'guess' || !Array.isArray(mv.g)) return null;
  const g = mv.g;
  if (g.length < 1 || g.length > 6) return null;
  const w = { t: 'guess' };
  for (let i = 0; i < g.length; i++){
    const v = g[i] | 0;
    if (v < 0 || v > 255) return null;
    w['g' + i] = v;
  }
  return w;
}
function decWire(w){
  if (!w || w.t !== 'guess') return null;
  const g = [];
  for (let i = 0; i < 6; i++){
    if (w['g' + i] === undefined) break;
    g.push(w['g' + i] | 0);
  }
  if (!g.length) return null;
  return { t: 'guess', g };
}

/* ── one documented random seed pick for a brand-new local match ────── */
function newSeed(){ return (Math.random() * 0x7fffffff) | 0; }   /* the ONLY Math.random */

/* ═══════════════════════════════════════════════════════════════════
   REPLAY — rebuild a match from (opts, seed, secrets, moves). Used by
   the UI's autosave/restore and by determinism tests. `secrets` is the
   pair actually delivered (or null to take the seed deal); `moves` is a
   list of { seat, g } in order.
   ═══════════════════════════════════════════════════════════════════ */
function replay(opts, seed, secrets, moves){
  const st = newMatch(opts, seed);
  if (secrets){
    if (secrets[0]) setSecret(st, 0, secrets[0]);
    if (secrets[1]) setSecret(st, 1, secrets[1]);
  }
  for (let i = 0; i < (moves || []).length; i++){
    const m = moves[i];
    guessAt(st, m.seat, m.g, m.fb);
  }
  return st;
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — js/kodici-ui.js and the test harness read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_KODICI = root.KARTI_KODICI || {};
root.KARTI_KODICI.engine = {
  BOARDS, BOARD_ORDER, MIN_SLOTS, MAX_SLOTS, MIN_COLOURS, MAX_COLOURS,
  boardOf, limitOf,
  feedback, solved, verifyLog,
  planDeal, newMatch, setSecret, ready, reveal,
  turn, target, guessesUsed, legalGuess, guessAt, lastSolved,
  aiGuess, aiSecret, opener,
  allCodes, consistentSet,
  encWire, decWire, WIRE_FIELDS,
  newSeed, replay, randCode, codeValid
};

})(typeof window !== 'undefined' ? window : globalThis);
