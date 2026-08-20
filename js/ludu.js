/* ═══════════════════════════════════════════════════════════════════
   KARTI — ludu.js
   LUDU — Ludo for FOUR, SIX or EIGHT seats. The engine. Rules only:
   no DOM, no canvas, no clock, no rendering, no game registration, and
   NO Math.random anywhere except newSeed(), which is documented below
   and which the engine itself never calls. The screen half is a
   separate file and follows the house runner shape: a match is
   (opts, seed, log), the state is always deal() plus a replay of the
   log, and rollback is cutting the log.

   THE GAME
     Every player has four tokens parked in a yard. A token leaves the
     yard only on a SIX. Once out it runs the whole ring anticlockwise,
     turns off into its own home column at the square just before its
     own entry, and must roll EXACTLY to step into home. Land on a
     lone opponent and that token goes all the way back to its yard.
     Safe squares shelter. Two of your own on one square is a block.
     First player with all four home wins.

   ── ONE BOARD, ANY NUMBER OF ARMS ──────────────────────────────────
     The classic board is four-sided and there is no six- or eight-
     sided Ludo board to copy, so this file does not hard-code three
     boards. It has ONE parameterised board and P is a knob.

       L = floor(26 / P)      squares in one rail of one sector
       A = 2L + 1             ring squares per sector (rail, corner, rail)
       R = P * A              the whole ring
       H = 6                  steps from the last ring square into HOME

     P=4 → L=6, A=13, R=52.  That is EXACTLY the classic board: 52
     squares, entries 13 apart, and the safe squares fall on
     0, 8, 13, 21, 26, 34, 39, 47 — the eight stars every Ludo board
     has ever had. The generalisation is checked against the real
     board at P=4 before it is trusted at P=6 and P=8.

     P=6 → L=4, A=9,  R=54.
     P=8 → L=3, A=7,  R=56.

     The point of L = floor(26/P) is that R = 2·P·floor(26/P) + P stays
     in a narrow band around 52 as arms are added: 52, 54, 56. Arms
     multiply, the lap does NOT get longer. An eight-player board with
     thirteen squares per sector would be a 104-square lap and each
     token would take twice as long to get home; this one is 8% longer
     than the classic, not 100%.

     Sector k, in travel order, is: L squares climbing OUTWARD along
     the leading side of arm k, one CORNER square at the tip between
     arm k and arm k+1, then L squares coming back INWARD along the
     trailing side of arm k+1. So sector k ends at the inner end of
     arm k+1's trailing rail and sector k+1 begins at the inner end of
     arm k+1's leading rail — the two squares that flank arm k+1's
     home column mouth. Player k+1 enters on one of them and turns off
     the ring on the other, exactly as on the cross-shaped board.
     layout() hands the UI polar coordinates built from the same
     numbers, so a 6- and an 8-arm rosette draw themselves.

   ── FAIRNESS, AND HOW IT IS PROVED ─────────────────────────────────
     The whole board is invariant under ONE rotation: ring index
     i → (i + A) mod R. That single fact carries everything.

       · seat k's entry  = k·A          = rot^k(seat 0's entry)
       · seat k's turnoff= k·A - 1 mod R = rot^k(seat 0's turnoff)
       · the safe set maps onto itself under rot
       · seat k's path length = R - 1 + H, the same integer for every
         seat at a given size: 57 at P=4, 59 at P=6, 61 at P=8
       · the steps from seat k's entry to seat j's entry is
         ((j-k) mod P)·A — a function of the DIFFERENCE only, so no
         seat is closer to, or further from, the pack than any other
       · the offsets of the safe squares measured from your own entry
         are the same list for every seat

     That is asserted for all three sizes in the test harness, not
     asserted here in prose. Going FIRST is still worth something —
     it is worth something in every race game — and the harness
     measures it rather than hiding it. See the report.

   ── THE DICE ARE INJECTED. READ THIS BEFORE CHANGING ANYTHING. ─────
     The relay broadcasts ONE shared seed to every phone. Anything
     derived from that seed is derivable by every phone. In a card
     game that leaks the opponents' hands; in Ludo it leaks EVERY
     FUTURE ROLL. A player with a browser console open can read the
     next forty dice and plan a perfect turn: come out exactly when a
     six is due, sit on a safe square exactly when a capture is
     coming. Nothing in the rules can detect it, because every move
     that player makes is legal. It is the same class of flaw as the
     shared-seed leak in the hidden-role games.

     So the dice are NOT hard-wired. They are one injectable source
     with one interface — roll(st, mv) -> 1..6:

       DICE.seed   derives the roll from st.rs, the way every other
                   KARTI game derives its shuffle. Deterministic,
                   replayable, needs no round trip — and PREDICTABLE
                   BY ANY CLIENT THAT KNOWS THE SEED. Correct for
                   solo play and for pass-the-phone. Honest but weak
                   for online play among strangers.
       DICE.given  takes the value from the move itself (mv.d) and
                   never touches st.rs at all. This is the seam a
                   FAIR source drops into: the relay, or a
                   commit-reveal between the seats, produces the
                   number and stamps it on the roll. DICE.fair is an
                   alias of this object reserved for that source, so
                   the day it lands nothing in this file changes.

     Everything downstream of roll() — legality, capture, blocks, the
     AI, the wire — is identical between the two. That is the whole
     point: the seam is one function, and it is here.

     What this file can promise and what it cannot: it can promise
     that a `given` match never reads st.rs for a die, so knowing the
     seed tells an attacker nothing about the dice. It cannot promise
     the numbers the relay hands it are fair. That is relay work.

     HOW TO MAKE THE DICE ACTUALLY FAIR — the recommendation.
     The house already has the pattern: chess and dama derive the
     colour draw from the XOR of two 32-bit nonces, each phone sending
     its half before it has seen the other's (js/mp.js, and the
     server's nonce-XOR comment). Neither side can steer an XOR it
     commits to blind, so the draw is fair without a trusted party.

     For dice there are two honest options, and they trade round trips
     against trust:

       (1) COMMIT-REVEAL PER ROLL. Before a roll, every live seat
           broadcasts H(nonce); once all commits are in, everyone
           reveals; the die is (XOR of nonces) mod 6 + 1. Nobody can
           bias a value they committed to blind, exactly like the
           colour draw — but this is a FULL ROUND TRIP OF ALL SEATS
           PER DIE. At two humans it is fine. At eight seats, with a
           six granting another roll and a turn often being three or
           four rolls, that is dozens of synchronous all-seat barriers
           per turn over a phone relay: too slow to be fun. NOT
           recommended at 8.

       (2) RELAY-SUPPLIED ROLL (recommended for 4/6/8). The relay —
           which is already the trusted broadcaster — draws each die
           with its OWN entropy (secrets, never the shared seed, the
           way js/mp.js already shuffles the private deal) and stamps
           it on the move as mv.d. One message, no barrier, no per-seat
           round trip. It is exactly DICE.given / DICE.fair as written
           here: the engine changes NOT ONE LINE. The trust you take on
           is that the relay is not colluding with a player — the same
           trust you already take for the private poker deal — and in
           return every seat is blind to future rolls, which is the
           whole attack this guards against.

     Bottom line: ship DICE.seed for solo and pass-the-phone (honest,
     needs no network), and DICE.given fed by the RELAY for online
     tables of any size. Reserve commit-reveal for a future
     trust-nobody 2-player mode where one extra round trip per roll is
     acceptable. The seam is one function; none of this touches the
     rules, the AI, replay, or the wire.

   DETERMINISM
     st.rs is the entire RNG and it is touched by exactly one thing,
     DICE.seed.roll(). The AI is a pure function of the state — its
     "randomness" is a hash of the position, never a clock and never
     Math.random — so every phone replays every move to the identical
     board. replay(opts, seed, log) rebuilds any state from scratch
     and hash(st) is a 32-bit fingerprint of it; the harness runs the
     same match a thousand times and compares the hash.

   TERMINATION
     A Ludo engine that can deadlock is a real risk: captures undo
     progress, so nothing about the game is monotone. This one cannot
     hang, and the reason is structural rather than statistical.
     Every turn ends in endTurn(), which increments st.turnNo. The
     only way to stay on the same turn is an extra roll, and extra
     rolls are capped at rules.maxRollsPerTurn. A roll with no legal
     move must still be answered with an explicit pass, which ends
     the turn. And rules.maxTurns is a hard ceiling on turnNo, after
     which the match is decided on progress. So the number of moves in
     a match is bounded by maxTurns · (2·maxRollsPerTurn + 1) before a
     single die is thrown.

   LANGUAGE
     This engine writes NO English into the state. It writes ids —
     st.why = 'threesixes' — and exports TEXT, a table of
     { en, mt } pairs the UI renders at display time. That is
     js/lang.js's rule for engine-authored text: shared state stays
     language-free and auditable, the screen does the translating.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ═══════════════════════════════════════════════════════════════════
   SEEDED RANDOMNESS — the whole RNG state is st.rs, mulberry32, the
   same generator js/poker.js and js/rummy.js use. Exactly one caller:
   DICE.seed.roll(). Nothing else in this file may consume it.
   ═══════════════════════════════════════════════════════════════════ */
function rnd(st){
  st.rs = (st.rs + 0x6D2B79F5) | 0;
  let t = st.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* THE ONE Math.random IN THIS FILE, and the engine never calls it.
   A brand-new LOCAL match needs a number from somewhere; online, the
   relay's seed arrives instead and this is not used. Kept here rather
   than in the UI so the whole "where does entropy enter" story is in
   one file. Any caller that wants a reproducible match passes its own
   seed to deal() and never touches this. */
function newSeed(){ return (Math.random() * 0x100000000) | 0; }

function hash32(list){
  let h = 2166136261;
  for (let i = 0; i < list.length; i++){
    h ^= (list[i] | 0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ═══════════════════════════════════════════════════════════════════
   THE BOARD — one function, P is a knob. See the header.
   Everything here is derived; nothing is a table of magic numbers.
   ═══════════════════════════════════════════════════════════════════ */
const MIN_SEATS = 2, MAX_SEATS = 8;
const SIZES = [4, 6, 8];              /* the sizes the UI offers       */
const HOME_LEN = 6;                   /* steps from last ring square into HOME */
const TOKENS = 4;

/* rail length. floor(26/P) reproduces the classic 52-square ring at
   P=4 and keeps the lap near 52 as arms are added. Floored at 2 so a
   two-player board still has a rail. */
const railOf  = P => Math.max(2, Math.floor(26 / P));
const armOf   = P => 2 * railOf(P) + 1;
const ringOfP = P => P * armOf(P);

/* SAFE SQUARES. Two per sector, at offsets 0 and L+2 from the sector's
   first square. Offset 0 is every player's own entry. Offset L+2 is
   the star: with L=6 that is 8, which puts the stars on 8, 21, 34, 47
   — the classic board's four stars, and with the four entries that is
   the classic eight. The set is built by rotating one sector's offsets
   P times, so it is invariant under rotation by A by construction and
   cannot favour a seat. */
const SAFE_OFFSETS = L => [0, L + 2];

const SAFE_MODES = ['stars', 'entries', 'none'];

/* ═══════════════════════════════════════════════════════════════════
   TEAMS — the partnership mode. OFF by default; nothing below changes
   a single-player-per-seat match, because with teams off teamOf(seat)
   is the seat itself and sameTeam() is only ever true for one seat
   against itself. That is deliberate: the teams code is ONE predicate
   threaded through capture, blocks, the finish and the machine, and
   with teams off the predicate collapses to the old behaviour exactly.

   THE PAIRINGS — teams[i] = i mod G, where G = seats / teamSize. That
   deals the seats round the table like cards, so a team's members are
   spread EVENLY round the board and, at teamSize 2, the two partners
   sit exactly OPPOSITE each other (seat i and seat i + n/2).

     4 seats, size 2  → 2v2      [0,1,0,1]      partners 0&2, 1&3
     6 seats, size 2  → 2v2v2    [0,1,2,0,1,2]  partners 0&3, 1&4, 2&5
     6 seats, size 3  → 3v3      [0,1,0,1,0,1]  0,2,4 vs 1,3,5
     8 seats, size 2  → 2v2v2v2  [0,1,2,3,...]  partners 0&4, 1&5, ...
     8 seats, size 4  → 4v4      [0,1,0,1,...]  0,2,4,6 vs 1,3,5,7

   THE TEAM RULES, in full and with the choice made rather than left
   open — every one of these is checked in the harness:
     · a partner is NEVER captured. Landing on a partner's token is
       legal and the two SHARE the square (the same way two of your own
       share it). It is not blocked and it is not a capture: the pair
       simply stands together. Chosen over "blocked" because a blocked
       square would let a partner accidentally jail you, which reads as
       a bug at the table rather than as a rule.
     · a partner's two tokens on one square are NOT a block against
       you: you may land on them and you may pass through them. They
       are still a block against everybody else.
     · a block is still two of ONE seat's own tokens. Two different
       partners standing together do not make a block — otherwise a
       four-handed team could wall the ring off with mixed pairs.
     · THE TEAM WINS when EVERY member of the team is home, that is
       when every seat on the team has all of its tokens home. A seat
       that walked out counts as settled (it can never come home) but a
       team needs at least one member actually home to win, so a team
       that walks out entirely does not win by forfeit.
     · the winner is a TEAM, and the placings are TEAM placings: the
       teams that got everybody home, in the order they did it, then
       the rest on summed progress.
   ═══════════════════════════════════════════════════════════════════ */
const TEAM_SIZES = { 4: [2], 6: [2, 3], 8: [2, 4] };
function teamSizeOf(n, size){
  const allowed = TEAM_SIZES[n] || [];
  const s = size | 0;
  if (allowed.indexOf(s) >= 0) return s;
  return allowed.length ? allowed[0] : 0;
}
function teamsOf(n, size){
  const s = teamSizeOf(n, size);
  if (!s || (n % s)) return null;
  const G = n / s;
  if (G < 2) return null;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = i % G;
  return out;
}
/* with teams OFF every seat is its own team, so every predicate below
   reads exactly as it did before the mode existed */
const teamOf   = (st, seat) => (st.teams ? st.teams[seat] : seat);
const sameTeam = (st, a, b) => (a === b) || (!!st.teams && st.teams[a] === st.teams[b]);
/* the seats on a team, in seat order */
function teamSeats(st, team){
  const out = [];
  if (!st.teams) { out.push(team); return out; }
  for (let i = 0; i < st.n; i++) if (st.teams[i] === team) out.push(i);
  return out;
}
const teamCount = st => (st.teams ? (st.n / st.teamSize) : st.n);

/* the board cache. st carries only the PARAMETERS (n, homeLen, safe
   mode) so a state is plain JSON and travels; the derived board is
   rebuilt on demand and memoised. Never put a typed array in st. */
const BOARDS = {};
function board(n, homeLen, safeMode){
  const key = n + '|' + homeLen + '|' + safeMode;
  if (BOARDS[key]) return BOARDS[key];
  const P = n;
  const L = railOf(P), A = armOf(P), R = P * A, H = homeLen;
  const safe = new Array(R).fill(0);
  if (safeMode !== 'none'){
    const offs = safeMode === 'entries' ? [0] : SAFE_OFFSETS(L);
    for (let k = 0; k < P; k++)
      for (const o of offs) safe[(k * A + o) % R] = 1;
  }
  const bd = {
    P, L, A, R, H,
    /* the path in positions: -1 yard, 0..R-1 ring, R..R+H-2 home
       column, R+H-1 HOME. Same integer for every seat. */
    HOME: R + H - 1,
    COL:  R,
    safe,
    entry:   k => (k % P) * A,
    turnoff: k => (((k % P) * A) + R - 1) % R,
    /* ring square under seat k's token at path position p */
    sq: (k, p) => ((k % P) * A + p) % R
  };
  BOARDS[key] = bd;
  return bd;
}
const bdOf = st => board(st.n, st.homeLen, st.safeMode);

/* ═══════════════════════════════════════════════════════════════════
   LAYOUT — polar coordinates for the UI, generated from the SAME
   numbers as the rules, so the picture cannot disagree with the board.
   Angles are TURNS (0..1, clockwise from the top), radii 0..1.
   A P=4 layout is a four-arm rosette, which is the classic cross
   board with rounded corners; a UI that would rather draw the real
   15x15 cross can ignore a/r and use ring[i].sector and ring[i].j.
   ═══════════════════════════════════════════════════════════════════ */
const R_YARD = 1.00, R_OUT = 0.86, R_IN = 0.34, R_COL = 0.27;

function layout(n, homeLen, safeMode){
  const bd = board(n, homeLen || HOME_LEN, safeMode || 'stars');
  const { P, L, A, R, H } = bd;
  const half = 0.5 / P;                  /* half a sector, in turns    */
  const lane = half * 0.34;              /* rail offset from the axis  */
  const step = L > 1 ? (R_OUT - R_IN) / (L - 1) : 0;
  const ring = [];
  for (let i = 0; i < R; i++){
    const k = Math.floor(i / A), j = i % A;
    const axis = k / P, next = (k + 1) / P;
    let role, a, r, jj;
    if (j < L){            role = 'out';    jj = j;         a = axis + lane;  r = R_IN + step * jj; }
    else if (j === L){     role = 'corner'; jj = 0;         a = axis + half;  r = R_OUT; }
    else {                 role = 'in';     jj = j - L - 1; a = next - lane;  r = R_OUT - step * jj; }
    ring.push({
      i, sector: k, role, j, jj, a: a % 1, r,
      safe: bd.safe[i] === 1,
      entryOf:   (i % A === 0) ? (i / A) : null,
      turnoffOf: ((i + 1) % A === 0) ? (((i + 1) / A) % P) : null
    });
  }
  const seats = [];
  for (let k = 0; k < P; k++){
    const axis = k / P;
    const col = [];
    for (let c = 0; c < H - 1; c++)
      col.push({ p: R + c, a: axis, r: R_COL - (R_COL / (H - 1)) * c * 0.82 });
    const yard = [];
    for (let t = 0; t < TOKENS; t++)
      yard.push({ a: (axis + (t % 2 ? lane : -lane)) % 1, r: R_YARD - (t > 1 ? 0.07 : 0) });
    seats.push({
      seat: k, axis, colour: COLOURS[k % COLOURS.length].id,
      entry: bd.entry(k), turnoff: bd.turnoff(k),
      col, yard, home: { p: bd.HOME, a: axis, r: 0 }
    });
  }
  return { P, L, A, R, H, HOME: bd.HOME, COL: bd.COL, ring, seats,
           xy: (a, r) => ({ x: r * Math.sin(a * 2 * Math.PI),
                            y: -r * Math.cos(a * 2 * Math.PI) }) };
}

/* ═══════════════════════════════════════════════════════════════════
   THE RULES — every one of these is a DECISION, and the default is
   the one the Maltese kitchen table actually plays. Each is an option
   because every household plays one of them differently.
   ═══════════════════════════════════════════════════════════════════ */
const RULES = {
  /* WHAT GETS A TOKEN OUT. [6] is the game; [1,6] is the common
     children's softening and makes matches about a fifth shorter. */
  entryRolls: [6],
  /* A SIX BUYS ANOTHER ROLL. Universal. Off makes the game a plod. */
  sixAgain: true,
  /* THREE SIXES IN ONE TURN FORFEITS IT. The third six is void: no
     move is made with it and the turn ends there. Without this a
     lucky streak has no ceiling, and — this matters more — the extra
     roll would have no bound at all. */
  threeSixes: true,
  /* the harsher variant: the third six ALSO sends the token that
     moved on the second six back to the yard. Off by default; it is
     a punishment for good luck and it plays badly with strangers. */
  threeSixesReturn: false,
  /* EXACT ROLL TO FINISH. A token four from home cannot use a five.
     Off means an overshoot simply lands on home (this file does NOT
     implement bounce-back: bounce makes the last stretch a lottery
     and doubles the length of the endgame). */
  exactFinish: true,
  /* CAPTURE SENDS A TOKEN ALL THE WAY BACK. 'yard' is Ludo. 'none'
     turns the game into a race with no interaction at all and exists
     only for a gentle mode for small children. */
  capture: 'yard',
  /* a capture buys another roll. Standard nearly everywhere, and it
     is what makes hunting worth the risk. */
  captureAgain: true,
  /* getting a token home buys another roll. Standard. */
  homeAgain: true,
  /* COMING OUT OF THE YARD CAPTURES. Your own entry square is safe,
     but a token stepping out of the yard onto it still throws an
     opponent off. Without this an opponent can camp on your entry
     forever and you can never come out at all — which is not a
     house rule, it is a soft lock. */
  entryCaptures: true,
  /* BLOCKS. Two of your own tokens on one ring square. */
  blocks: true,
  /* ...and whether a block stops PASSAGE as well as landing. On:
     nobody gets past you, which is the real Ludo weapon. Off: you
     can be jumped but not landed on. Landing on an opponent's block
     is illegal either way while blocks are on. */
  blockStopsPassage: true,
  /* SAFE SQUARES. 'stars' = the entries plus the stars, the classic
     eight at P=4. 'entries' = entries only, a nastier board.
     'none' = open season. */
  safe: 'stars',
  /* two different players may share a safe square. Off means a safe
     square occupied by anybody is simply barred to everyone else,
     which is a stronger and rarer reading. */
  safeShared: true,
  /* an extra roll is only earned by a move that actually HAPPENED. A
     six with nowhere to go ends the turn. This is not a taste
     decision: with it off, a player whose four tokens are all boxed
     in could roll sixes forever, and maxRollsPerTurn would be the
     only thing between this engine and a hang. */
  extraRollNeedsMove: true,
  /* the ceiling on rolls in one turn, whatever earned them. */
  maxRollsPerTurn: 12,
  /* 'first'  the match ends the moment somebody is all home.
     'all'    it runs on for the full placing order, second through
              last, which is what a party table wants. */
  endOn: 'first',
  /* the hard ceiling on turns. Nothing in Ludo is monotone — a
     capture undoes progress — so termination is guaranteed here, by
     arithmetic, and not left to the dice: the whole match is bounded
     by maxTurns·(2·maxRollsPerTurn+1) moves before a die is thrown.
     MEASURED with the shipped AI (thousands of matches, natural
     length with the cap lifted to 100000):
       4 players  median  ~480 turns, p99  ~910, longest seen ~1120
       6 players  median ~1060 turns, p99 ~1850, longest seen ~2310
       8 players  median ~1900 turns, p99 ~3410, longest seen ~4480
     So 4000 lets a 4- and 6-player match finish naturally ALWAYS (the
     cap is never the outcome there — it is a proof), and lets the vast
     majority of 8-player matches finish too. An 8-player match with the
     full four tokens each is GENUINELY long: 32 tokens capturing each
     other keep undoing progress, so the deepest ~1% of 8-player games
     still reach this ceiling and are decided on progress. That is not a
     bug in the engine — it always terminates — it is a property of
     eight-handed Ludo. The lever for a
     shorter, livelier 8-player table is FEWER TOKENS: opts.tokens=3
     brings the 8-player median to ~860 and nothing hits the cap;
     opts.tokens=2 to ~350. The UI should offer that for big tables.
     See the report. */
  maxTurns: 4000
};
function rulesOf(o){
  const r = {};
  for (const k in RULES) r[k] = RULES[k];
  if (o) for (const k in RULES) if (o[k] !== undefined) r[k] = o[k];
  /* sanitise the ones a bad wire could break */
  r.entryRolls = (Array.isArray(r.entryRolls) ? r.entryRolls : [6])
                   .map(x => x | 0).filter(x => x >= 1 && x <= 6);
  if (!r.entryRolls.length) r.entryRolls = [6];
  if (SAFE_MODES.indexOf(r.safe) < 0) r.safe = 'stars';
  if (r.capture !== 'none') r.capture = 'yard';
  if (r.endOn !== 'all') r.endOn = 'first';
  r.maxRollsPerTurn = Math.max(1, Math.min(60, r.maxRollsPerTurn | 0 || 12));
  r.maxTurns = Math.max(50, Math.min(100000, r.maxTurns | 0 || 2000));
  return r;
}

/* ═══════════════════════════════════════════════════════════════════
   THE DICE — the injectable seam. See the header. roll(st, mv) -> 1..6.
   NOTHING ELSE in this file may produce a die.
   ═══════════════════════════════════════════════════════════════════ */
const DICE = {
  /* (a) THE SHARED SEED. Every phone throws the identical dice out of
     st.rs, which is why an online table agrees without sending a
     number. It is also why every phone can read every future throw,
     which is why this source is for SOLO and PASS-THE-PHONE. */
  seed: {
    id: 'seed',
    needsValue: false,
    roll(st){ return 1 + (Math.floor(rnd(st) * 6) % 6); }
  },
  /* (b) SUPPLIED PER ROLL. The number arrives ON the move and st.rs is
     never touched, so the shared seed says nothing at all about the
     dice. Whoever fills mv.d — the relay, or a commit-reveal between
     the seats — decides whether the game is fair; this file only
     guarantees it did not leak. Same signature, same everything
     downstream. */
  given: {
    id: 'given',
    needsValue: true,
    roll(st, mv){ const d = (mv && mv.d) | 0; return (d >= 1 && d <= 6) ? d : 0; }
  }
};
/* reserved name for the fair source, so the day it lands the id in
   saved states and on the wire is already the right one. */
DICE.fair = DICE.given;
const diceOf = st => DICE[st.dice] || DICE.seed;

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE'S SHARPNESS. Names are names in both languages (see
   js/lang.js rule 3); the notes are pairs. The three levels differ in
   TWO ways, weights and a real lookahead, and both are visible below:
     1  no risk model at all, no blocks, and a lot of noise
     2  the full static read, mild noise, an approximate threat count
     3  the static read PLUS a genuine one-ply expectimax over the
        WHOLE resulting position (evalPos): it applies each candidate
        to a throwaway copy of the token positions and values the
        board that results, averaging the opponents' verified capture
        replies. This is why level 3 beats level 2 rather than merely
        differing from it — measured in the harness, no reweighting of
        the static reader alone made it reliably stronger, because a
        reweighted static reader is the same machine. The lookahead is
        pure (no rng, no clock) so a level-3 move is as replayable as
        any other. Head-to-head over thousands of games with seats
        swapped to cancel turn-order: L3 beats L2 ~55-57% at every
        size, and L2 beats L1 ~77-81%. See the report.
   ═══════════════════════════════════════════════════════════════════ */
const LEVELS = [
  { k: 1, name: 'It-Tifel tal-Ġirien', icon: 'diff-1',
    note: { en: 'Moves whichever token his hand lands on.',
            mt: 'Iċaqlaq liema biċċa jmiss idu.' } },
  { k: 2, name: 'Tal-Każin', icon: 'diff-2',
    note: { en: 'Takes the capture when he sees it, and hides on the stars.',
            mt: 'Jaqbad meta jara ċ-ċans, u jistaħba fuq l-istilel.' } },
  { k: 3, name: 'Iz-Zija Karmni', icon: 'diff-3',
    note: { en: 'Counts the six squares behind every token you own.',
            mt: 'Tgħodd is-sitt kwadri ta’ wara kull biċċa tiegħek.' } }
];
const TUNE = {
  1: { look: 0, noise: 1.40, W: {
         adv: 0.30, lead: 0.55, home: 3.0, col: 0.55, out: 2.20,
         cap: 2.00, safe: 0.15, risk: 0.00, relief: 0.00,
         block: 0.00, unblock: 0.00, chase: 0.00 } },
  2: { look: 0, noise: 0.32, W: {
         adv: 0.55, lead: 0.85, home: 5.0, col: 1.35, out: 2.60,
         cap: 4.20, safe: 0.95, risk: 2.30, relief: 1.00,
         block: 0.65, unblock: 0.55, chase: 0.35 } },
  3: { look: 1, noise: 0.04, W: {
         adv: 0.60, lead: 1.05, home: 7.0, col: 2.00, out: 3.00,
         cap: 5.80, safe: 1.35, risk: 3.60, relief: 1.55,
         block: 1.20, unblock: 0.95, chase: 0.75 } }
};
const tuneOf = l => TUNE[Math.max(1, Math.min(3, l | 0 || 2))];
/* the gain on the level-3 positional lookahead. evalPos returns a
   value roughly in [-n, +tokens]; this scales it onto the same axis as
   the summed move weights so neither swamps the other. Tuned by the
   L3-vs-L2 head-to-head in the harness. */
const HOME_LOOK = 6.0;

/* ═══════════════════════════════════════════════════════════════════
   COLOURS — a seat needs a name in both languages and a swatch. Eight,
   because eight is the biggest table. The hexes are a suggestion the
   UI may ignore; the ids are what state and stats should carry.
   ═══════════════════════════════════════════════════════════════════ */
const COLOURS = [
  { id: 'red',    hex: '#d92b2b', name: { en: 'Red',    mt: 'Aħmar'   } },
  { id: 'blue',   hex: '#2b6cd9', name: { en: 'Blue',   mt: 'Blu'     } },
  { id: 'yellow', hex: '#e6b422', name: { en: 'Yellow', mt: 'Isfar'   } },
  { id: 'green',  hex: '#2fa34d', name: { en: 'Green',  mt: 'Aħdar'   } },
  { id: 'orange', hex: '#e8752a', name: { en: 'Orange', mt: 'Oranġjo' } },
  { id: 'purple', hex: '#8a4bd0', name: { en: 'Purple', mt: 'Vjola'   } },
  { id: 'teal',   hex: '#1fa89b', name: { en: 'Teal',   mt: 'Turkin'  } },
  { id: 'pink',   hex: '#e05a9c', name: { en: 'Pink',   mt: 'Roża'    } }
];

/* ═══════════════════════════════════════════════════════════════════
   TEXT — every player-visible line this engine has an opinion about,
   as { en, mt } pairs. The STATE never carries any of these strings,
   only their ids (st.why, st.done.reason). See js/lang.js rule 5.
   ═══════════════════════════════════════════════════════════════════ */
const TEXT = {
  game:        { en: 'LUDU',                              mt: 'LUDU' },
  roll:        { en: 'Roll',                              mt: 'Itfa’ d-dadu' },
  yourturn:    { en: 'Your turn',                         mt: 'Imissek int' },
  pick:        { en: 'Pick a token',                      mt: 'Agħżel biċċa' },
  six:         { en: 'A six — roll again',                mt: 'Sitta — erġa’ itfa’' },
  threesixes:  { en: 'Three sixes — the turn is lost',    mt: 'Tliet sittiet — id-dawra ntilfet' },
  threesent:   { en: 'Three sixes — and that token goes back', mt: 'Tliet sittiet — u dik il-biċċa lura' },
  nomove:      { en: 'Nothing can move',                  mt: 'Xejn ma jista’ jiċċaqlaq' },
  entered:     { en: 'Out of the yard',                   mt: 'Barra mill-bitħa' },
  capture:     { en: 'Captured — back to the yard',       mt: 'Maqbud — lura fil-bitħa' },
  captureagain:{ en: 'A capture — roll again',            mt: 'Qabda — erġa’ itfa’' },
  column:      { en: 'Into the home column',              mt: 'Fil-kolonna tad-dar' },
  home:        { en: 'Home!',                             mt: 'Id-dar!' },
  homeagain:   { en: 'Home — roll again',                 mt: 'Id-dar — erġa’ itfa’' },
  blocked:     { en: 'Blocked',                           mt: 'Imblukkat' },
  needexact:   { en: 'You need the exact number',         mt: 'Trid in-numru eżatt' },
  safesq:      { en: 'Safe square',                       mt: 'Kwadru sikur' },
  yard:        { en: 'Yard',                              mt: 'Bitħa' },
  finished:    { en: 'All four home',                     mt: 'L-erbgħa kollha d-dar' },
  won:         { en: 'Wins',                              mt: 'Rebaħ' },
  quit:        { en: 'Walked out',                        mt: 'Telaq' },
  /* endings */
  end_first:   { en: 'All four home first',               mt: 'L-erbgħa d-dar l-ewwel' },
  end_all:     { en: 'Everybody is home',                 mt: 'Kulħadd wasal id-dar' },
  end_alone:   { en: 'Everybody else walked out',         mt: 'Kulħadd ieħor telaq' },
  end_cap:     { en: 'The turn limit ran out — decided on progress',
                 mt: 'Il-limitu tad-dawriet spiċċa — deċiż fuq kemm waslu' },
  end_team:    { en: 'A whole team is home first',
                 mt: 'Tim sħiħ wasal id-dar l-ewwel' },
  /* teams */
  teams:       { en: 'Teams',                             mt: 'Timijiet' },
  team:        { en: 'Team',                              mt: 'Tim' },
  partner:     { en: 'Partner',                           mt: 'Sieħeb' },
  teamfinished:{ en: 'The whole team is home',            mt: 'It-tim kollu wasal id-dar' },
  teamsafe:    { en: 'Your partner — you stand together', mt: 'Sieħbek — toqogħdu flimkien' },
  win_head_team: { en: 'Your team is home',               mt: 'It-tim tiegħek wasal id-dar' },
  lose_head_team:{ en: 'Beaten by the other team',        mt: 'Sabqukom it-tim l-ieħor' },
  win_quip_team: { en: 'Two of you, one lap, no mercy.',
                   mt: 'Tnejn minnkom, dawra waħda, ebda ħniena.' },
  lose_quip_team:{ en: 'They came home together. So does everybody, eventually.',
                   mt: 'Waslu d-dar flimkien. Kulħadd jasal, illum jew għada.' },
  /* verdicts, read relative to the local seat */
  win_head:    { en: 'You are home',                      mt: 'Wasalt id-dar' },
  lose_head:   { en: 'Beaten home',                       mt: 'Sabquk id-dar' },
  win_quip:    { en: 'Four tokens, one lap, no mercy.',   mt: 'Erba’ biċċiet, dawra waħda, ebda ħniena.' },
  lose_quip:   { en: 'The dice were never yours to argue with.',
                 mt: 'Id-dadu qatt ma kien tiegħek biex tiddiskuti miegħu.' }
};
const t = id => TEXT[id] || null;

/* ═══════════════════════════════════════════════════════════════════
   THE MATCH
   opts: { seats, humans, lvl, lvls, tokens, homeLen, rules, dice, given }
     seats    2..8. 4, 6 and 8 are the offered sizes.
     humans   how many of the first seats are people. The rest are
              machines; seat 0 is 'me' and 1..humans-1 are 'hot' (the
              pass-the-phone seats), exactly as js/poker.js does it.
     lvl      one level for every machine.
     lvls     per-seat override, so two humans and six machines at
              three different sharpnesses is one array.
     dice     'seed' | 'given'. See the header. Default 'seed'.
   ═══════════════════════════════════════════════════════════════════ */
function deal(opts, seed){
  opts = opts || {};
  const n = Math.max(MIN_SEATS, Math.min(MAX_SEATS, opts.seats | 0 || 4));
  const tokens = Math.max(1, Math.min(8, opts.tokens | 0 || TOKENS));
  const homeLen = Math.max(2, Math.min(12, opts.homeLen | 0 || HOME_LEN));
  const rules = rulesOf(opts.rules);
  const dice = (opts.dice === 'given' || opts.dice === 'fair') ? 'given' : 'seed';
  const humans = Math.max(0, Math.min(n, opts.humans === undefined ? 1 : opts.humans | 0));
  /* TEAMS. Part of the match tuple, so every phone that deals the same
     opts sits at the same partnership. teams=null is the old game. */
  const wantTeams = !!(opts.teams === true || opts.teams === 'on' ||
                       (typeof opts.teams === 'number' && opts.teams > 0));
  const teamSize = wantTeams ? teamSizeOf(n, opts.teamSize) : 0;
  const teams    = wantTeams ? teamsOf(n, teamSize) : null;
  const st = {
    v: 1,
    n, tokens, homeLen, safeMode: rules.safe,
    rules, dice,
    /* null, or an array of length n: teams[seat] = team index */
    teams, teamSize: teams ? teamSize : 0,
    /* the seed is kept so a saved match can be replayed from the log
       alone. It is NOT a secret and never was — see the header. */
    seed0: (seed === undefined || seed === null) ? newSeed() : (seed | 0),
    rs: 0,
    seats: [],
    turn: 0, phase: 'roll',
    die: 0, sixes: 0, rolls: 0, moved: false,
    turnNo: 0, rollNo: 0,
    lastMovedTok: -1,
    why: null,
    last: null,
    ranks: [],
    tranks: [],                 /* team finishing order (teams mode)     */
    done: null
  };
  st.rs = st.seed0 | 0;
  const lvls = Array.isArray(opts.lvls) ? opts.lvls : null;
  for (let i = 0; i < n; i++){
    const ai = i >= humans;
    st.seats.push({
      name: ai ? ('MAKNA ' + (i + 1 - humans))
               : (humans === 1 ? 'You' : 'Player ' + (i + 1)),
      own: ai ? 'ai' : (i === 0 ? 'me' : 'hot'),
      lvl: Math.max(1, Math.min(3, (lvls ? lvls[i] : opts.lvl) | 0 || 2)),
      colour: COLOURS[i % COLOURS.length].id,
      team: teams ? teams[i] : -1,
      toks: new Array(tokens).fill(-1),
      done: false, gone: false, rank: 0
    });
  }
  return st;
}

/* the seat the local player is sitting in — the same convention as
   js/poker.js: the first 'me' or 'hot' seat, 0 if there is none. */
function meSeat(st){
  let i = st.seats.findIndex(s => s.own === 'me' || s.own === 'hot');
  return i < 0 ? 0 : i;
}

/* ═══════════════════════════════════════════════════════════════════
   OCCUPANCY — who is standing where on the ring. Rebuilt per decision
   rather than maintained, because a maintained index is one missed
   capture away from a token being in two places at once, and this
   costs n·tokens (32 at the biggest table).
   ═══════════════════════════════════════════════════════════════════ */
function occOf(st){
  const bd = bdOf(st);
  const at = new Array(bd.R).fill(null);
  for (let s = 0; s < st.n; s++){
    const T = st.seats[s].toks;
    for (let k = 0; k < T.length; k++){
      const p = T[k];
      if (p < 0 || p > bd.R - 1) continue;
      const r = bd.sq(s, p);
      if (at[r]) at[r].push({ s, k }); else at[r] = [{ s, k }];
    }
  }
  return at;
}
/* how many tokens seat `s` has on ring square r */
function countAt(at, r, s){
  const h = at[r];
  if (!h) return 0;
  let c = 0;
  for (let i = 0; i < h.length; i++) if (h[i].s === s) c++;
  return c;
}
/* is ring square r barred to seat s — that is, does anybody ELSE have
   two or more tokens standing on it. `teams` is st.teams or null: a
   PARTNER's block is not a block against you, so a team can walk
   through its own wall (and only through its own). */
function barred(at, r, s, teams){
  const h = at[r];
  if (!h || h.length < 2) return false;
  const seen = {};
  for (let i = 0; i < h.length; i++){
    if (h[i].s === s) continue;
    if (teams && teams[h[i].s] === teams[s]) continue;
    seen[h[i].s] = (seen[h[i].s] || 0) + 1;
    if (seen[h[i].s] >= 2) return true;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   ONE CANDIDATE MOVE. Returns null when the move is not legal, or
   { k, d, from, to, ri, caps, why } when it is. This is the ONLY place
   in the file that knows what a legal Ludo move is; legal(), check(),
   apply() and the machine all read it, so they cannot disagree.
   ═══════════════════════════════════════════════════════════════════ */
function tryMove(st, seat, k, d, at){
  const bd = bdOf(st), R = bd.R, HOME = bd.HOME, r = st.rules;
  const S = st.seats[seat];
  if (!S || S.gone) return null;
  const p = S.toks[k];
  if (p === undefined || p === HOME) return null;

  let to, why = null;
  if (p < 0){
    /* OUT OF THE YARD. Only on an entry roll, and only if your own
       entry square is not held by an opponent's block. */
    if (r.entryRolls.indexOf(d) < 0) return null;
    to = 0;
    why = 'entered';
  } else {
    to = p + d;
    if (to > HOME){
      if (r.exactFinish) return null;      /* the exact-roll rule      */
      to = HOME;
    }
    /* PASSAGE. Only ring squares strictly between from and to, and
       only while blocks stop passage. The home column cannot be
       blocked: nobody else's token can ever stand in it. */
    if (r.blocks && r.blockStopsPassage){
      for (let q = p + 1; q < to; q++){
        if (q > R - 1) break;
        if (barred(at, bd.sq(seat, q), seat, st.teams)) return null;
      }
    }
  }

  const caps = [];
  let ri = -1;
  if (to <= R - 1){
    ri = bd.sq(seat, to);
    /* landing on an opponent's block is never legal while blocks are
       on, whatever blockStopsPassage says */
    if (r.blocks && barred(at, ri, seat, st.teams)) return null;
    const here = at[ri];
    if (here && here.length){
      const isSafe = bd.safe[ri] === 1;
      /* your own entry square is safe — but stepping out of the yard
         onto it still throws an opponent off, or they camp there and
         you never come out at all */
      const mayTake = (!isSafe || (p < 0 && r.entryCaptures)) && r.capture !== 'none';
      for (let i = 0; i < here.length; i++){
        const o = here[i];
        /* your own — and, in TEAMS, your partner's — tokens simply
           share the square. A partner is never captured, ever. */
        if (o.s === seat || (st.teams && st.teams[o.s] === st.teams[seat])) continue;
        if (mayTake){ caps.push(o); continue; }
        /* cannot take, so either shelter together or stay off */
        if (!r.safeShared) return null;
      }
    }
  }
  if (caps.length) why = 'capture';
  else if (to === HOME) why = 'home';
  else if (to > R - 1 && p <= R - 1) why = 'column';
  return { k, d, from: p, to, ri, caps, why };
}

/* every legal candidate for the seat on the clock, as rich objects */
function moves(st){
  if (st.done || st.phase !== 'move' || !st.die) return [];
  const at = occOf(st), seat = st.turn, out = [];
  const T = st.seats[seat].toks;
  for (let k = 0; k < T.length; k++){
    const m = tryMove(st, seat, k, st.die, at);
    if (m) out.push(m);
  }
  return out;
}

/* ── the public move list, in wire shape ─────────────────────────── */
function turn(st){
  if (st.done) return -2;
  return st.turn;
}
function legal(st, seat){
  if (st.done) return [];
  if (seat !== st.turn) return [];
  if (st.phase === 'roll'){
    /* a `given` source cannot roll on its own: the value has to
       arrive with the move. The engine offers the shape and the
       caller fills d. */
    return [diceOf(st).needsValue ? { t: 'roll', seat, d: 0 }
                                  : { t: 'roll', seat }];
  }
  if (st.phase === 'move'){
    const ms = moves(st);
    if (!ms.length) return [{ t: 'pass', seat }];
    return ms.map(m => ({ t: 'move', seat, k: m.k }));
  }
  return [];
}

/* THE gate. Every move — thumb, machine, wire, replay — is measured
   here and nowhere else. */
function check(st, mv, seat){
  if (!mv || st.done) return false;
  if (mv.t === 'quit')
    return seat >= 0 && seat < st.n && !!st.seats[seat] && !st.seats[seat].gone;
  if (seat !== st.turn) return false;
  const S = st.seats[seat];
  if (!S || S.gone || S.done) return false;
  if (mv.t === 'roll'){
    if (st.phase !== 'roll') return false;
    if (diceOf(st).needsValue){
      const d = mv.d | 0;
      return d >= 1 && d <= 6;
    }
    return true;
  }
  if (mv.t === 'move'){
    if (st.phase !== 'move' || !st.die) return false;
    const at = occOf(st);
    return !!tryMove(st, seat, mv.k | 0, st.die, at);
  }
  if (mv.t === 'pass'){
    if (st.phase !== 'move' || !st.die) return false;
    return moves(st).length === 0;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   APPLY — deterministic; the log replays through here and nothing
   else. Mutates st and returns it, the house convention.
   ═══════════════════════════════════════════════════════════════════ */
function apply(st, mv){
  if (!mv || st.done) return st;
  if (mv.t === 'quit')  return doQuit(st, mv);
  if (mv.t === 'roll')  return doRoll(st, mv);
  if (mv.t === 'move')  return doMove(st, mv);
  if (mv.t === 'pass')  return doPass(st, mv);
  return st;
}

function doRoll(st, mv){
  const seat = st.turn;
  const d = diceOf(st).roll(st, mv);
  if (!(d >= 1 && d <= 6)) return st;         /* nothing was supplied */
  st.rollNo++; st.rolls++;
  st.die = d;
  st.sixes = (d === 6) ? st.sixes + 1 : 0;
  st.last = { t: 'roll', seat, d };
  st.why = null;
  /* THREE SIXES. The third one is void: it buys no move and the turn
     ends on it. The optional harsher reading also sends the token
     that moved on the second six back to its yard. */
  if (st.rules.threeSixes && st.sixes >= 3){
    st.die = 0;
    st.why = 'threesixes';
    if (st.rules.threeSixesReturn && st.lastMovedTok >= 0){
      const S = st.seats[seat], p = S.toks[st.lastMovedTok];
      const bd = bdOf(st);
      if (p >= 0 && p <= bd.R - 1){ S.toks[st.lastMovedTok] = -1; st.why = 'threesent'; }
    }
    endTurn(st);
    return st;
  }
  st.phase = 'move';
  return st;
}

function doMove(st, mv){
  const bd = bdOf(st), seat = st.turn, S = st.seats[seat];
  const at = occOf(st);
  const m = tryMove(st, seat, mv.k | 0, st.die, at);
  if (!m) return st;                           /* check() said no      */

  S.toks[m.k] = m.to;
  for (let i = 0; i < m.caps.length; i++)
    st.seats[m.caps[i].s].toks[m.caps[i].k] = -1;

  st.last = {
    t: 'move', seat, k: m.k, from: m.from, to: m.to, d: st.die,
    caps: m.caps.map(c => ({ seat: c.s, tok: c.k }))
  };
  st.why = m.why;
  st.moved = true;
  st.lastMovedTok = m.k;

  const reachedHome = (m.to === bd.HOME);
  const took = m.caps.length > 0;
  const six = (st.die === 6);
  st.die = 0;

  /* all four home? */
  if (!S.done && S.toks.every(p => p === bd.HOME)){
    S.done = true;
    S.rank = st.ranks.length + 1;
    st.ranks.push(seat);
    st.why = 'finished';
    if (teamDone(st, seat)) st.why = 'teamfinished';
  }
  if (finishCheck(st)) return st;

  const extra = (six && st.rules.sixAgain) ||
                (took && st.rules.captureAgain) ||
                (reachedHome && st.rules.homeAgain);
  if (extra && !S.done && st.rolls < st.rules.maxRollsPerTurn){
    st.phase = 'roll';
    if (took) st.why = 'captureagain';
    else if (reachedHome) st.why = 'homeagain';
    else st.why = 'six';
    return st;
  }
  endTurn(st);
  return st;
}

function doPass(st, mv){
  st.last = { t: 'pass', seat: st.turn, d: st.die };
  st.why = 'nomove';
  st.die = 0;
  /* THE ONE RULE THAT KEEPS THIS ENGINE FROM HANGING. A six that
     could not be used buys nothing; the turn ends. With
     extraRollNeedsMove off it buys another roll, and only
     maxRollsPerTurn stops a boxed-in player rolling sixes forever. */
  if (!st.rules.extraRollNeedsMove && st.rules.sixAgain &&
      st.last.d === 6 && st.rolls < st.rules.maxRollsPerTurn){
    st.phase = 'roll';
    return st;
  }
  endTurn(st);
  return st;
}

/* QUIT never waits for a turn — a player walks out whenever they walk
   out. Their tokens leave the board entirely so nobody can capture a
   ghost, and if it was their turn the clock moves on. */
function doQuit(st, mv){
  const seat = mv.seat | 0;
  const S = st.seats[seat];
  if (!S || S.gone) return st;                 /* idempotent           */
  S.gone = true;
  S.toks = S.toks.map(() => -1);
  st.last = { t: 'quit', seat };
  st.why = 'quit';
  /* a walkout can COMPLETE a team whose other members were already
     home, so the team placings have to be re-read here too */
  teamDone(st, seat);
  if (finishCheck(st)) return st;
  if (st.turn === seat){ st.die = 0; endTurn(st); }
  return st;
}

/* ── the clock ───────────────────────────────────────────────────── */
function endTurn(st){
  st.sixes = 0; st.rolls = 0; st.die = 0; st.moved = false;
  st.lastMovedTok = -1;
  st.turnNo++;
  if (finishCheck(st)) return;
  if (st.turnNo >= st.rules.maxTurns){ finish(st, 'cap'); return; }
  let nx = -1;
  for (let i = 1; i <= st.n; i++){
    const s = (st.turn + i) % st.n;
    if (!st.seats[s].done && !st.seats[s].gone){ nx = s; break; }
  }
  if (nx < 0){ finish(st, st.ranks.length ? 'all' : 'alone'); return; }
  st.turn = nx;
  st.phase = 'roll';
}

/* ── TEAMS: has this seat's team got EVERYBODY home? ─────────────────
   Every member must be settled (all tokens home, or walked out) and at
   least one member must actually be home — a team that walks out does
   not win by forfeit. Records the team in st.tranks the first time,
   which is what makes the team placings deterministic. Returns true
   the moment the team is complete. With teams off this is never true
   and st.tranks stays empty, so nothing changes. */
function teamDone(st, seat){
  if (!st.teams) return false;
  const tm = st.teams[seat];
  if (st.tranks.indexOf(tm) >= 0) return true;
  let anyHome = false;
  for (let i = 0; i < st.n; i++){
    if (st.teams[i] !== tm) continue;
    const S = st.seats[i];
    if (S.done) { anyHome = true; continue; }
    if (S.gone) continue;
    return false;
  }
  if (!anyHome) return false;
  st.tranks.push(tm);
  return true;
}
/* the team's summed progress, for the placings when a match is decided
   on progress rather than on a team being home */
function teamProgress(st, team){
  let sum = 0;
  for (let i = 0; i < st.n; i++)
    if (teamOf(st, i) === team) sum += progressOf(st, i);
  return sum;
}

/* how far a seat has got, in steps, for the placings when a match is
   decided on progress rather than on somebody being home */
function progressOf(st, seat){
  const bd = bdOf(st), S = st.seats[seat];
  let sum = 0;
  for (let i = 0; i < S.toks.length; i++) sum += Math.max(0, S.toks[i] + 1);
  return sum;
}
const maxProgress = st => st.tokens * (bdOf(st).HOME + 1);

function finishCheck(st){
  if (st.done) return true;
  const live = [];
  for (let i = 0; i < st.n; i++)
    if (!st.seats[i].done && !st.seats[i].gone) live.push(i);
  /* TEAMS: one seat being home is NOT the end — the whole team has to
     be home. So the 'first' ending waits for a completed TEAM. */
  if (st.teams){
    if (st.rules.endOn === 'first' && st.tranks.length >= 1){ finish(st, 'team'); return true; }
    if (live.length === 0){ finish(st, st.tranks.length ? 'all' : 'alone'); return true; }
    /* only one team still has anybody live and somebody is home */
    let liveTeams = {};
    for (let i = 0; i < live.length; i++) liveTeams[st.teams[live[i]]] = 1;
    if (Object.keys(liveTeams).length <= 1 && st.tranks.length >= 1){ finish(st, 'all'); return true; }
    let gone = 0;
    for (let i = 0; i < st.n; i++) if (st.seats[i].gone) gone++;
    if (gone === st.n - 1 && st.n > 1){ finish(st, 'alone'); return true; }
    return false;
  }
  if (st.rules.endOn === 'first' && st.ranks.length >= 1){ finish(st, 'first'); return true; }
  if (live.length === 0){ finish(st, st.ranks.length ? 'all' : 'alone'); return true; }
  if (live.length === 1 && st.ranks.length >= 1){ finish(st, 'all'); return true; }
  if (live.length === 1 && st.n > 1){
    /* everybody else walked out */
    let gone = 0;
    for (let i = 0; i < st.n; i++) if (st.seats[i].gone) gone++;
    if (gone === st.n - 1){ finish(st, 'alone'); return true; }
  }
  return false;
}

function finish(st, reason){
  if (st.done) return;
  /* the placings: whoever got all their tokens home, in the order
     they did it, then everybody else on progress, then the walkouts.
     Deterministic to the last tie-break (seat index) so two phones
     print the same scoreboard. */
  const rest = [];
  for (let i = 0; i < st.n; i++)
    if (st.ranks.indexOf(i) < 0) rest.push(i);
  rest.sort((a, b) => {
    const ga = st.seats[a].gone ? 1 : 0, gb = st.seats[b].gone ? 1 : 0;
    if (ga !== gb) return ga - gb;
    const pa = progressOf(st, a), pb = progressOf(st, b);
    if (pa !== pb) return pb - pa;
    return a - b;
  });
  const ranks = st.ranks.concat(rest);
  ranks.forEach((s, i) => { st.seats[s].rank = i + 1; });
  st.done = {
    reason,
    winner: ranks.length ? ranks[0] : -1,
    ranks,
    turns: st.turnNo,
    rolls: st.rollNo
  };
  /* TEAMS: the placings that MATTER are the team placings — the teams
     that got everybody home in the order they did it, then the rest on
     summed progress, seat index as the last tie-break so two phones
     print the same scoreboard. The winner is then the first seat of
     the winning team, so every old reader still works. */
  if (st.teams){
    const G = st.n / st.teamSize;
    const restT = [];
    for (let g = 0; g < G; g++) if (st.tranks.indexOf(g) < 0) restT.push(g);
    restT.sort((a, b) => {
      const pa = teamProgress(st, a), pb = teamProgress(st, b);
      if (pa !== pb) return pb - pa;
      return a - b;
    });
    const tranks = st.tranks.concat(restT);
    st.done.teamRanks = tranks;
    st.done.team = tranks.length ? tranks[0] : -1;
    st.done.teamSize = st.teamSize;
    st.done.teamSeats = tranks.map(g => teamSeats(st, g));
    /* seat rank follows the team rank, and inside a team the seats that
       came home first lead */
    const seatRank = [];
    tranks.forEach(g => {
      const mem = teamSeats(st, g).slice().sort((a, b) => {
        const ra = st.ranks.indexOf(a), rb = st.ranks.indexOf(b);
        const ka = ra < 0 ? 9999 : ra, kb = rb < 0 ? 9999 : rb;
        if (ka !== kb) return ka - kb;
        const pa = progressOf(st, a), pb = progressOf(st, b);
        if (pa !== pb) return pb - pa;
        return a - b;
      });
      mem.forEach(s => seatRank.push(s));
    });
    seatRank.forEach((s, i) => { st.seats[s].rank = i + 1; });
    st.done.ranks = seatRank;
    st.done.winner = seatRank.length ? seatRank[0] : -1;
  }
  st.phase = 'done';
}

/* ═══════════════════════════════════════════════════════════════════
   READING THE STATE — what a screen needs and nothing it does not.
   ═══════════════════════════════════════════════════════════════════ */
/* every token, in one flat list, with everything a renderer wants */
function tokens(st){
  const bd = bdOf(st), out = [];
  for (let s = 0; s < st.n; s++){
    const S = st.seats[s];
    for (let k = 0; k < S.toks.length; k++){
      const p = S.toks[k];
      out.push({
        seat: s, tok: k, colour: S.colour, p,
        where: p < 0 ? 'yard' : p === bd.HOME ? 'home'
             : p > bd.R - 1 ? 'col' : 'ring',
        ring: (p >= 0 && p <= bd.R - 1) ? bd.sq(s, p) : -1,
        col:  (p > bd.R - 1 && p < bd.HOME) ? p - bd.R : -1,
        safe: (p >= 0 && p <= bd.R - 1) ? bd.safe[bd.sq(s, p)] === 1 : p > bd.R - 1
      });
    }
  }
  return out;
}
/* the scoreboard, derived, never stored twice */
function tally(st){
  const bd = bdOf(st);
  return st.seats.map((S, i) => ({
    seat: i, name: S.name, colour: S.colour, own: S.own, lvl: S.lvl,
    team: st.teams ? st.teams[i] : -1,
    home: S.toks.filter(p => p === bd.HOME).length,
    yard: S.toks.filter(p => p < 0).length,
    onBoard: S.toks.filter(p => p >= 0 && p < bd.HOME).length,
    progress: progressOf(st, i),
    pct: progressOf(st, i) / maxProgress(st),
    rank: S.rank, done: S.done, gone: S.gone
  }));
}
/* what the seat on the clock is being asked for */
function pending(st){
  if (st.done) return { seat: -2, phase: 'done', die: 0, moves: [] };
  return {
    seat: st.turn, phase: st.phase, die: st.die,
    sixes: st.sixes,
    moves: st.phase === 'move' ? moves(st) : [],
    why: st.why
  };
}
/* the one line under the board. An ID, never a sentence — TEXT has
   the two languages and the UI picks one. */
function note(st){
  if (st.done) return { id: 'end_' + st.done.reason, text: t('end_' + st.done.reason) };
  if (st.why) return { id: st.why, text: t(st.why) };
  return { id: st.phase === 'roll' ? 'roll' : 'pick',
           text: t(st.phase === 'roll' ? 'roll' : 'pick') };
}
/* the verdict, read relative to the local seat */
function over(st){
  if (!st.done) return null;
  const me = meSeat(st);
  /* TEAMS: you won if YOUR TEAM won, not if you personally came home
     first — the whole point of the mode */
  const won = st.teams ? (st.done.team === st.teams[me])
                       : (st.done.winner === me);
  return {
    tone: won ? 'win' : 'lose',
    head: won ? t(st.teams ? 'win_head_team' : 'win_head')
              : t(st.teams ? 'lose_head_team' : 'lose_head'),
    why:  t('end_' + st.done.reason),
    quip: won ? t(st.teams ? 'win_quip_team' : 'win_quip')
              : t(st.teams ? 'lose_quip_team' : 'lose_quip'),
    winner: st.done.winner,
    ranks: st.done.ranks,
    teams: st.teams || null,
    team: st.done.team === undefined ? -1 : st.done.team,
    teamRanks: st.done.teamRanks || null,
    teamSeats: st.done.teamSeats || null,
    turns: st.done.turns,
    reason: st.done.reason
  };
}
/* the team scoreboard, derived: one row per team in placing order when
   the match is over, in team index order while it runs */
function teamTally(st){
  if (!st.teams) return [];
  const bd = bdOf(st), G = st.n / st.teamSize;
  const order = (st.done && st.done.teamRanks) ? st.done.teamRanks
              : Array.from({ length: G }, (_, i) => i);
  return order.map((g, i) => {
    const seats = teamSeats(st, g);
    let home = 0, tot = 0;
    seats.forEach(s => {
      home += st.seats[s].toks.filter(p => p === bd.HOME).length;
      tot  += st.seats[s].toks.length;
    });
    return {
      team: g, seats,
      colours: seats.map(s => st.seats[s].colour),
      home, tokens: tot,
      progress: teamProgress(st, g),
      pct: teamProgress(st, g) / (maxProgress(st) * seats.length),
      done: st.tranks.indexOf(g) >= 0,
      rank: (st.done && st.done.teamRanks) ? i + 1 : 0
    };
  });
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — one brain, three sharpnesses, and NOT ONE CALL TO
   Math.random. Where a person would be unpredictable the machine
   hashes the position instead: same board, same seat, same turn, same
   decision, on every phone. That is what makes an AI move replayable.

   The read is a sum of features on the CANDIDATE MOVE rather than a
   search, because Ludo's branching factor is four and its horizon is
   a die roll: a deep search buys nothing a threat count does not
   already have, and it would cost a hundred times as much.

     advance   raw steps gained
     lead      how far the moved token now is — finish what you start
     home      stepping into home
     col       reaching the home column, where nothing can touch you
     out       getting a token out of the yard, worth more when the
               board is empty of yours
     cap       a capture, scaled by how far the victim had come
     safe      landing on a star or an entry
     risk      the chance somebody lands on you next turn
     relief    getting OUT of a square somebody could land on
     block     two of yours on one square
     unblock   breaking one up
     chase     sitting one to six behind an opponent
   ═══════════════════════════════════════════════════════════════════ */
function jitter(st, seat, salt){
  return (hash32([st.rs, st.turnNo, st.rollNo, seat, salt | 0, st.die]) % 1000) / 1000;
}

/* THE THREAT COUNT — the chance that ring square `ri` is landed on by
   somebody else before this seat moves again.
   deep=false  (level 2) counts opponent tokens one to six squares
               behind it, a sixth each. Cheap and roughly right.
   deep=true   (level 3) additionally VERIFIES the capture: that the
               opponent's path is not blocked, that the square is not
               safe for them, and that the token is actually on the
               ring. That is the one-ply reply search, restricted to
               captures — the only reply in Ludo that changes material.
               It also leans on whose turn comes next, because a
               threat from the seat about to roll is worth more than
               one from the seat five turns away. */
function threat(st, seat, ri, at, deep){
  const bd = bdOf(st);
  if (ri < 0) return 0;
  if (bd.safe[ri] === 1 && st.rules.safe !== 'none') return 0;
  let p = 0;
  for (let s = 0; s < st.n; s++){
    /* a PARTNER is never a threat — they cannot capture you */
    if (s === seat || sameTeam(st, s, seat)) continue;
    const S = st.seats[s];
    if (S.gone || S.done) continue;
    const soon = deep ? (1.25 - 0.05 * (((s - seat + st.n) % st.n) - 1)) : 1;
    const T = S.toks;
    for (let k = 0; k < T.length; k++){
      const q = T[k];
      if (q < 0 || q > bd.R - 1) continue;
      const d = (ri - bd.sq(s, q) + bd.R) % bd.R;
      if (d < 1 || d > 6) continue;
      if (q + d > bd.R - 1) continue;          /* they turn off first  */
      if (deep){
        const m = tryMove(st, s, k, d, at);
        if (!m || m.ri !== ri || !m.caps.length) continue;
      }
      p += soon / 6;
    }
    /* the yard threat: an opponent sitting in the yard comes out on a
       six and takes their own entry square with them */
    if (bd.entry(s) === ri && T.some(q => q < 0)) p += 1 / 6;
  }
  return Math.min(1.4, p);
}

function scoreMove(st, seat, m, at, W, deep){
  const bd = bdOf(st), HOME = bd.HOME, R = bd.R;
  const S = st.seats[seat];
  const fromP = Math.max(0, m.from), toP = m.to;
  let sc = 0;

  sc += W.adv  * ((toP - fromP) / HOME);
  sc += W.lead * (toP / HOME);

  if (toP === HOME) sc += W.home;
  else if (toP > R - 1) sc += W.col;

  if (m.from < 0){
    const onBoard = S.toks.filter(p => p >= 0 && p < HOME).length;
    sc += W.out * (1 - onBoard / S.toks.length);
  }
  for (let i = 0; i < m.caps.length; i++){
    const c = m.caps[i];
    const vp = st.seats[c.s].toks[c.k] / HOME;
    sc += W.cap * (0.35 + 0.65 * vp);
  }

  /* where it lands */
  if (m.ri >= 0){
    if (bd.safe[m.ri] === 1) sc += W.safe;
    else sc -= W.risk * threat(st, seat, m.ri, at, deep) * (0.35 + 0.65 * (toP / HOME));
    if (W.block && countAt(at, m.ri, seat) >= 1) sc += W.block;
    /* sitting one to six BEHIND an opponent is a live gun */
    if (W.chase){
      let guns = 0;
      for (let s = 0; s < st.n; s++){
        /* sitting behind a PARTNER is not a gun, it is friendly fire */
        if (s === seat || sameTeam(st, s, seat)) continue;
        const T = st.seats[s].toks;
        for (let k = 0; k < T.length; k++){
          const q = T[k];
          if (q < 0 || q > R - 1) continue;
          const tr = bd.sq(s, q);
          if (bd.safe[tr] === 1) continue;
          const d = (tr - m.ri + R) % R;
          if (d >= 1 && d <= 6) guns++;
        }
      }
      sc += W.chase * Math.min(3, guns) / 3;
    }
  }

  /* where it came from */
  if (m.from >= 0 && m.from <= R - 1){
    const fri = bd.sq(seat, m.from);
    if (bd.safe[fri] !== 1)
      sc += W.relief * threat(st, seat, fri, at, deep) * (0.35 + 0.65 * (fromP / HOME));
    if (W.unblock && countAt(at, fri, seat) >= 2) sc -= W.unblock;
  }
  return sc;
}

/* ── THE LOOKAHEAD — level 3 only. ───────────────────────────────────
   The static score above reads the moved token. It cannot see that a
   move which is fine for the piece that moved leaves ANOTHER of your
   pieces newly exposed, or that the resulting shape is better or worse
   as a whole. Tweaking the weights cannot fix that — measured: no
   weight set makes the static reader reliably beat the level-2 static
   reader, because they are the same machine with different numbers.

   So level 3 does something level 2 cannot: it applies the candidate
   to a throwaway copy of the token positions — positions ONLY, no rng,
   no clock, so it is pure and replayable — and reads the WHOLE
   resulting position. evalPos sums, over every one of the seat's own
   tokens: the progress it has made, minus what it stands to lose if an
   opponent lands on it next round (probability of a landing capture
   times the progress that token would forfeit). That is a real
   one-ply expectimax over the opponents' capture replies, the only
   reply in Ludo that changes material, and it is why level 3 beats
   level 2 rather than merely differing from it. It never touches
   st.rs and never calls Math.random, so a level-3 move is as
   replayable as any other. */
function cloneToks(st){
  const c = new Array(st.n);
  for (let s = 0; s < st.n; s++) c[s] = st.seats[s].toks.slice();
  return c;
}
/* the chance ring square ri (seat s's token there) is captured before
   s moves again — the opponents' landing threat, verified through the
   real move generator so a blocked or sheltered "threat" does not
   count. Reads a supplied token snapshot, not st, so it can score a
   hypothetical position. */
function threatIn(st, toks, s, ri){
  const bd = bdOf(st);
  if (ri < 0) return 0;
  if (bd.safe[ri] === 1 && st.rules.safe !== 'none') return 0;
  /* build occupancy from the snapshot */
  const at = new Array(bd.R).fill(null);
  for (let x = 0; x < st.n; x++)
    for (let k = 0; k < toks[x].length; k++){
      const p = toks[x][k];
      if (p < 0 || p > bd.R - 1) continue;
      const r = bd.sq(x, p);
      if (at[r]) at[r].push({ s: x, k }); else at[r] = [{ s: x, k }];
    }
  /* a bespoke tryMove that reads the snapshot for passage/blocks */
  const barredSnap = (r, self) => {
    const h = at[r];
    if (!h || h.length < 2) return false;
    const seen = {};
    for (let i = 0; i < h.length; i++){
      if (h[i].s === self) continue;
      if (st.teams && st.teams[h[i].s] === st.teams[self]) continue;
      seen[h[i].s] = (seen[h[i].s] || 0) + 1;
      if (seen[h[i].s] >= 2) return true;
    }
    return false;
  };
  let p = 0;
  for (let x = 0; x < st.n; x++){
    if (x === s || sameTeam(st, x, s)) continue;
    const X = st.seats[x];
    if (X.gone || X.done) continue;
    const soon = 1.25 - 0.05 * (((x - s + st.n) % st.n) - 1);
    for (let k = 0; k < toks[x].length; k++){
      const q = toks[x][k];
      if (q < 0 || q > bd.R - 1) continue;
      const d = (ri - bd.sq(x, q) + bd.R) % bd.R;
      if (d < 1 || d > 6) continue;
      if (q + d > bd.R - 1) continue;              /* they turn off first */
      /* verify the reply: not blocked in passage, lands exactly on ri,
         and ri is not safe for them either (it is not — checked above) */
      let blocked = false;
      if (st.rules.blocks && st.rules.blockStopsPassage)
        for (let z = q + 1; z < q + d; z++){
          if (z > bd.R - 1) break;
          if (barredSnap(bd.sq(x, z), x)){ blocked = true; break; }
        }
      if (blocked) continue;
      if (st.rules.blocks && barredSnap(ri, x)) continue;  /* our own block shields */
      p += soon / 6;
    }
    if (bd.entry(x) === ri && toks[x].some(q => q < 0)) p += 1 / 6;
  }
  return Math.min(1.4, p);
}
/* the value of a whole position to `seat`, from a token snapshot */
function evalPos(st, seat, toks){
  const bd = bdOf(st), HOME = bd.HOME, R = bd.R;
  let v = 0;
  for (let s = 0; s < st.n; s++){
    if (st.seats[s].gone) continue;
    /* TEAMS: a PARTNER's progress is the team's progress, so it counts
       POSITIVE — a shade under your own, so a machine still prefers to
       move its own piece when the two are otherwise equal, but enough
       that it will play for the team (shelter a partner's square,
       finish a partner's runner, take the opponent who is chasing
       them). Off-teams this is the old -0.45 for everybody. */
    const sign = (s === seat) ? 1 : (sameTeam(st, s, seat) ? 0.80 : -0.45);
    for (let k = 0; k < toks[s].length; k++){
      const p = toks[s][k];
      const prog = Math.max(0, p + 1) / (HOME + 1);
      let val = prog;
      if (p === HOME) val += 0.6;             /* home is worth a premium  */
      else if (p > R - 1) val += 0.25;        /* the column is shelter    */
      else if (p >= 0){
        /* exposure: what this token loses if it is landed on next round */
        const ri = bd.sq(s, p);
        if (!(bd.safe[ri] === 1 && st.rules.safe !== 'none')){
          const th = threatIn(st, toks, s, ri);
          val -= th * prog * 0.9;             /* expected forfeited progress */
        }
      }
      v += sign * val;
    }
  }
  return v;
}
/* apply a candidate move to a token snapshot — positions only, the same
   arithmetic doMove does, so the lookahead sees exactly what a real
   move would produce. Returns a NEW snapshot. */
function applyToks(st, seat, m){
  const toks = cloneToks(st);
  toks[seat][m.k] = m.to;
  for (let i = 0; i < m.caps.length; i++)
    toks[m.caps[i].s][m.caps[i].k] = -1;
  return toks;
}

function think(st, seat, lvl){
  if (st.done || seat !== st.turn) return null;
  if (st.phase === 'roll'){
    /* a machine cannot invent a die under the `given` source — the
       caller has to supply it. Under `seed` there is nothing to
       decide: roll. */
    return diceOf(st).needsValue ? null : { t: 'roll', seat };
  }
  if (st.phase !== 'move') return null;
  const ms = moves(st);
  if (!ms.length) return { t: 'pass', seat };
  if (ms.length === 1) return { t: 'move', seat, k: ms[0].k };

  const T = tuneOf(lvl === undefined ? st.seats[seat].lvl : lvl);
  const at = occOf(st);

  /* DEDUPE. Three tokens sitting in the yard are three identical
     moves, and a machine that picks between candidates would come out
     of the yard three times as often as it should for no reason at
     all. Collapse by (from, to). */
  const seen = {}, cand = [];
  for (let i = 0; i < ms.length; i++){
    const key = ms[i].from + ':' + ms[i].to;
    if (seen[key]) continue;
    seen[key] = 1; cand.push(ms[i]);
  }
  if (cand.length === 1) return { t: 'move', seat, k: cand[0].k };

  let best = cand[0], bestSc = -Infinity;
  for (let i = 0; i < cand.length; i++){
    const m = cand[i];
    let sc = scoreMove(st, seat, m, at, T.W, T.look > 0);
    /* level 3's one-ply expectimax over the whole resulting position.
       T.look is the weight the positional read carries next to the
       move-local score; 0 turns it off, which is levels 1 and 2. */
    if (T.look > 0)
      sc += T.look * HOME_LOOK * evalPos(st, seat, applyToks(st, seat, m));
    sc += T.noise * (jitter(st, seat, m.k * 7 + m.from) - 0.5);
    if (sc > bestSc){ bestSc = sc; best = m; }
  }
  return { t: 'move', seat, k: best.k };
}

/* ═══════════════════════════════════════════════════════════════════
   REPLAY AND FINGERPRINT — the whole determinism story in two
   functions. A match is (opts, seed, log) and nothing else; hash(st)
   is what two phones compare when they want to know they agree.
   ═══════════════════════════════════════════════════════════════════ */
function hash(st){
  const l = [st.n, st.tokens, st.homeLen, st.rs, st.turn, st.turnNo,
             st.rollNo, st.die, st.sixes, st.rolls,
             st.phase === 'roll' ? 1 : st.phase === 'move' ? 2 : 3];
  for (let s = 0; s < st.n; s++){
    const S = st.seats[s];
    l.push(S.lvl, S.done ? 1 : 0, S.gone ? 1 : 0, S.rank);
    for (let k = 0; k < S.toks.length; k++) l.push(S.toks[k] + 2);
  }
  for (let i = 0; i < st.ranks.length; i++) l.push(st.ranks[i] + 1);
  l.push(st.teamSize | 0);
  if (st.teams) for (let i = 0; i < st.teams.length; i++) l.push(st.teams[i] + 1);
  for (let i = 0; i < (st.tranks || []).length; i++) l.push(st.tranks[i] + 1);
  if (st.done) l.push(9001, st.done.winner + 1, st.done.turns,
                      (st.done.team === undefined ? -1 : st.done.team) + 1);
  return ('00000000' + hash32(l).toString(16)).slice(-8);
}

/* rebuild a state from nothing but (opts, seed, log). Every move in
   the log is re-gated through check(), so a log that does not fit the
   rules stops rather than silently producing a different board. */
function replay(opts, seed, log){
  const st = deal(opts, seed);
  const used = [];
  for (let i = 0; i < (log || []).length; i++){
    const mv = log[i];
    if (!mv) break;
    const seat = (mv.t === 'quit') ? (mv.seat | 0) : st.turn;
    if (!check(st, mv, seat)) return { st, ok: false, at: i, used };
    apply(st, Object.assign({}, mv, { seat }));
    used.push(mv);
    if (st.done) break;
  }
  return { st, ok: true, at: used.length, used };
}

/* run a whole match out with the machines playing every seat. The
   log it returns replays to the identical state — that is the
   contract, and the harness checks it. */
function autoplay(opts, seed, cap){
  const st = deal(opts, seed);
  const log = [];
  const lim = cap | 0 || 200000;
  while (!st.done && log.length < lim){
    const seat = st.turn;
    const mv = think(st, seat, st.seats[seat].lvl);
    if (!mv) break;                              /* a `given` table waits */
    if (!check(st, mv, seat)) break;             /* cannot happen; say so */
    log.push({ t: mv.t, k: mv.k, d: mv.d, seat });
    apply(st, mv);
  }
  return { st, log };
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — a move as flat byte fields, for js/mp.js's generic codec.
   Every field is 0..255 and a value over it is REFUSED, not truncated.
   A Ludo move is tiny: which token (k) and, under the `given` dice
   source, which number (d).
   ═══════════════════════════════════════════════════════════════════ */
const WIRE_FIELDS = ['k', 'd'];
const byteOK = v => v >= 0 && v <= 255;

function encWire(mv){
  if (!mv) return null;
  if (mv.t === 'pass' || mv.t === 'quit') return { t: mv.t };
  if (mv.t === 'roll'){
    const d = mv.d | 0;
    if (d === 0) return { t: 'roll' };
    return (d >= 1 && d <= 6) ? { t: 'roll', d } : null;
  }
  if (mv.t === 'move'){
    const k = mv.k | 0;
    return byteOK(k) ? { t: 'move', k } : null;
  }
  return null;
}
function decWire(w){
  if (!w || typeof w.t !== 'string') return null;
  if (w.t === 'pass' || w.t === 'quit') return { t: w.t };
  if (w.t === 'roll'){
    const d = w.d | 0;
    return d ? { t: 'roll', d } : { t: 'roll' };
  }
  if (w.t === 'move') return { t: 'move', k: w.k | 0 };
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — the UI layer and the test harness both read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_LUDU = root.KARTI_LUDU || {};
root.KARTI_LUDU.engine = {
  /* board */
  MIN_SEATS, MAX_SEATS, SIZES, HOME_LEN, TOKENS,
  railOf, armOf, ringOfP, board, bdOf, layout,
  /* rules */
  RULES, rulesOf, SAFE_MODES,
  /* teams */
  TEAM_SIZES, teamsOf, teamSizeOf, teamOf, sameTeam, teamSeats, teamCount,
  teamDone, teamProgress, teamTally,
  /* dice */
  DICE, diceOf, newSeed,
  /* match */
  deal, legal, check, apply, turn, moves, tryMove, occOf,
  meSeat, pending, tokens, tally, note, over,
  progressOf, maxProgress,
  /* machine */
  LEVELS, TUNE, tuneOf, think, scoreMove, threat, jitter,
  evalPos, threatIn, applyToks,
  /* determinism */
  hash, replay, autoplay,
  /* wire */
  encWire, decWire, WIRE_FIELDS,
  /* language */
  TEXT, t, COLOURS
};

})(typeof window !== 'undefined' ? window : globalThis);
