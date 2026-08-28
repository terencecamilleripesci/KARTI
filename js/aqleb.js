/* ═══════════════════════════════════════════════════════════════════
   KARTI — aqleb.js
   AQLEB — "flip it", the Maltese Reversi/Othello, generalised to TWO,
   THREE or FOUR players. The pure engine: rules only, no DOM, no clock,
   and the ONE Math.random in this file lives in newSeed(), the same
   quarantine js/erbgha.js and js/poker.js keep. The screen half is
   js/aqleb-ui.js and follows the erbgha/ludu runner shape — a match is
   (opts, seed, log), the state is newGame() plus a replay of the log, and
   a rollback is cutting the log.

   THE GAME
     An eight-by-eight board of dark felt. On your turn you place ONE disc
     of your colour on an EMPTY cell such that, in at least one of the
     eight straight directions, a contiguous run of OTHER players' discs is
     bounded at the far end by one of YOUR OWN discs. Every disc in every
     such flanked run FLIPS to your colour. A move is legal only if it
     flips at least one disc. If you have no legal move you PASS (the UI
     does this for you). The game ends when the board is full OR nobody can
     move. WINNER = whoever owns the most discs (ties share a place).

     Perfect information, no randomness, turn based. There is nothing
     hidden and nothing to seed the play with, so ONLINE IS TRIVIALLY
     HONEST: every phone applies the identical deterministic flip from the
     same list of {r,c} placements. The seed exists only so the machine
     breaks a tie between equally-rated moves the same way on every phone,
     and even that can be turned off (aiJitter:false).

   GENERALISING OTHELLO TO 2–4 PLAYERS
     The flip rule is the standard Othello rule with "the opponent" read as
     "ANY other player": a run you flank may contain a mix of the other
     colours, and all of it becomes yours. This is the well-known and
     public-domain multi-player Reversi rule; it keeps the game a pure
     capture race with no player-count-specific special cases.

   THE START POSITION (documented for fairness — see seedFor())
     2 players → the classic Othello centre: the 2×2 middle holds P0 on one
       diagonal and P1 on the other. Perfectly symmetric; the canonical
       fair opening the whole world plays.
     3 players → a symmetric ring of THREE around the centre 2×2: the four
       centre cells would give one player a free extra disc, so instead we
       seed three of the four centre cells, one disc per player, in seat
       order, and leave the fourth centre cell EMPTY. Rotating the board
       120° in spirit maps each player onto the next, so no seat begins
       able to out-flank the others; every player also starts with an
       identical count (one disc) and an identical set of legal openings by
       symmetry of the vacant fourth cell.
     4 players → the centre 2×2, one disc per player, placed rotationally
       (P0 top-left, P1 top-right, P2 bottom-right, P3 bottom-left). A 90°
       rotation maps seat k onto seat k+1, so the four openings are
       congruent: nobody can instantly dominate.

   COORDINATES
     Row r in 0..7 (top→bottom), column c in 0..7 (left→right). A cell
     holds 0 (empty) or seat+1 (1..4). Seat 0 moves first; the UI decides
     who seat 0 is (you, the machine, the network).

   DETERMINISM
     A move is one small pair {r,c}. Replaying the log through apply()
     rebuilds any position exactly. The AI is a pure function of the
     position; its ONLY non-determinism is an optional tie-break among
     equally-rated moves, hashed from the match seed so it is identical on
     every phone that shares the seed. aiJitter:false makes it fully
     deterministic (it takes the lowest-index best cell).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ── the board ─────────────────────────────────────────────────────── */
const N = 8;                              /* board is N×N                  */
const CELLS = N * N;
const EMPTY = 0;                          /* a cell nobody has played      */

/* seats: 2..4 players. The disc a seat leaves in a cell is seat+1 (1..4)
   so EMPTY can stay 0. */
const MIN_SEATS = 2, MAX_SEATS = 4;
const discOf = seat => seat + 1;          /* 0→1 … 3→4                     */
const seatOfDisc = d => d - 1;

/* the eight straight directions [dr,dc] */
const DIRS = [
  [-1,-1],[-1,0],[-1,1],
  [ 0,-1],       [ 0,1],
  [ 1,-1],[ 1,0],[ 1,1]
];

/* ── the ONE Math.random, quarantined (js/erbgha.js's newSeed) ──────── */
function newSeed(){ return (Math.random() * 0x100000000) >>> 0; }

/* a tiny deterministic hash → 0..0xffffffff, used ONLY to pick between
   moves the search rated identically. Same board, same seed, same choice,
   on every phone; never a clock, never Math.random. */
function hash32(list){
  let h = 2166136261;
  for (let i = 0; i < list.length; i++){
    h ^= (list[i] | 0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ═══════════════════════════════════════════════════════════════════
   LEVELS — the machine's three sharpnesses (js/erbgha.js's shape).
   ═══════════════════════════════════════════════════════════════════ */
const LEVELS = [
  { k: 1, name: 'It-Tifel', icon: 'diff-1',
    note: { en: 'Grabs the most discs it can this turn — and no more.',
            mt: 'Jaqbad l-aktar diski li jista’ din id-darba — u xejn aktar.' } },
  { k: 2, name: 'Tal-Każin', icon: 'diff-2',
    note: { en: 'Plays the corners and the good squares, keeps its options open.',
            mt: 'Jilgħab l-irkejjen u l-kaxxi t-tajba, iżomm l-għażliet miftuħa.' } },
  { k: 3, name: 'Il-Kampjun', icon: 'diff-3',
    note: { en: 'Looks ahead. Give it a corner and it will take it.',
            mt: 'Iħares ’il quddiem. Agħtih rokna u jeħodha.' } }
];
const levelOf = l => LEVELS.find(L => L.k === (l | 0)) || LEVELS[1];

/* how deep the strongest level searches. Two players: a small look-ahead
   is cheap on 8×8 and genuinely sharp. Three or four players: a single
   ply of look-ahead only (a full multi-player minimax explodes and, with
   more seats, one player's plan is quickly undone by the others anyway) —
   so the strong bot for 3–4p is positional-greedy over one reply layer.
   Documented in the header and proven by the harness. */
const DEPTH_2P = { 1: 0, 2: 1, 3: 3 };    /* plies of look-ahead, 2 players */
const DEPTH_NP = { 1: 0, 2: 0, 3: 1 };    /* plies of look-ahead, 3–4 players */
function depthOf(lvl, seats){
  lvl = Math.max(1, Math.min(3, lvl | 0 || 2));
  return (seats <= 2 ? DEPTH_2P : DEPTH_NP)[lvl];
}

/* ═══════════════════════════════════════════════════════════════════
   THE STATE
   opts: { seats, humans, lvl, aiJitter }
     seats    2..4 players (default 2)
     humans   how many seats are people on this device (UI's book, unused
              by the engine except to stash on the state)
     lvl      the machine's sharpness, 1..3
     aiJitter default true; false makes the machine fully deterministic
   The engine does not care WHO owns a seat — that is the UI's book. It
   tracks the board, the seat count, whose turn it is, and how it ended.
   ═══════════════════════════════════════════════════════════════════ */
function seedFor(seats){
  /* returns [{r,c,seat}, …] for the opening discs. See the header for the
     fairness argument behind each. Centre 2×2 is rows/cols 3 and 4. */
  const a = 3, b = 4;
  if (seats <= 2){
    /* classic Othello: P0 on one diagonal, P1 on the other */
    return [
      { r:a, c:a, seat:0 }, { r:b, c:b, seat:0 },
      { r:a, c:b, seat:1 }, { r:b, c:a, seat:1 }
    ];
  }
  if (seats === 3){
    /* three of the four centre cells, one per player; the fourth stays
       empty so the opening is rotationally balanced (no free 4th disc) */
    return [
      { r:a, c:a, seat:0 },
      { r:a, c:b, seat:1 },
      { r:b, c:a, seat:2 }
      /* (b,b) left EMPTY on purpose */
    ];
  }
  /* four players: the centre 2×2, one disc each, placed rotationally */
  return [
    { r:a, c:a, seat:0 }, { r:a, c:b, seat:1 },
    { r:b, c:b, seat:2 }, { r:b, c:a, seat:3 }
  ];
}

function newGame(opts, seed){
  opts = opts || {};
  const seats = Math.max(MIN_SEATS, Math.min(MAX_SEATS, opts.seats | 0 || 2));
  const st = {
    v: 1,
    n: N, cells: CELLS,
    seats,
    /* the grid, row-major: cell(r,c) = grid[r*N + c] */
    grid: new Array(CELLS).fill(EMPTY),
    turn: 0,                     /* seat to move; seat 0 first             */
    ply: 0,                      /* placements made so far                 */
    passes: 0,                   /* consecutive passes (== seats → over)   */
    lvl: Math.max(1, Math.min(3, opts.lvl | 0 || 2)),
    aiJitter: opts.aiJitter === false ? false : true,
    rs: (seed == null ? 0 : (seed >>> 0)),
    /* the ending once there is one: { kind:'over', counts:[…], winners:[…] }
       null while the game is live */
    done: null,
    /* the most recent placement + the cells it flipped, for the UI's
       animation and last-move marker */
    last: null                   /* { r, c, seat, flips:[{r,c,from}] }     */
  };
  /* seed the centre */
  const s = seedFor(seats);
  for (let i = 0; i < s.length; i++){
    st.grid[idx(s[i].r, s[i].c)] = discOf(s[i].seat);
    st.ply++;
  }
  /* seat 0 always opens; but be safe and advance to the first seat that
     actually has a legal move (all seeds above leave every seat a move) */
  st.turn = firstMover(st, 0);
  if (st.turn < 0) endGame(st);
  return st;
}

/* ── reading the board ─────────────────────────────────────────────── */
const idx = (r, c) => r * N + c;
const onBoard = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
function cell(st, r, c){
  if (!onBoard(r, c)) return -1;             /* off-board                 */
  return st.grid[idx(r, c)];
}

/* ═══════════════════════════════════════════════════════════════════
   THE FLIP MATH — the single source of truth for legality AND for the
   discs a placement turns over. flipsFor(st, r, c, seat) returns the FULL
   list of cells that a disc of `seat` at (r,c) would flip; a placement is
   legal iff that list is non-empty (and the cell is empty and on-board).
   Along each of the eight directions we walk over a run of OTHER players'
   discs; if that run is non-empty and is closed by one of OUR OWN discs,
   the whole run flips. A run that reaches the edge or an empty cell first
   flips nothing. This is exactly the Othello rule with "other" meaning
   "any colour that is not mine and not empty".
   ═══════════════════════════════════════════════════════════════════ */
function flipsFor(st, r, c, seat){
  if (!onBoard(r, c)) return [];
  if (st.grid[idx(r, c)] !== EMPTY) return [];
  const mine = discOf(seat);
  const out = [];
  for (let k = 0; k < DIRS.length; k++){
    const dr = DIRS[k][0], dc = DIRS[k][1];
    let rr = r + dr, cc = c + dc;
    const run = [];
    /* walk over a contiguous run of discs that are NOT mine and NOT empty */
    while (onBoard(rr, cc)){
      const v = st.grid[idx(rr, cc)];
      if (v === EMPTY) { run.length = 0; break; }   /* open end: nothing   */
      if (v === mine)  break;                        /* closed by me: flip  */
      run.push({ r: rr, c: cc, from: v });           /* an other-colour disc*/
      rr += dr; cc += dc;
    }
    /* flip only if we broke out on OUR OWN disc (not the edge) with a run */
    if (run.length && onBoard(rr, cc) && st.grid[idx(rr, cc)] === mine){
      for (let i = 0; i < run.length; i++) out.push(run[i]);
    }
  }
  return out;
}

/* does `seat` have any legal move on the current board? */
function hasMove(st, seat){
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++){
      if (st.grid[idx(r, c)] !== EMPTY) continue;
      /* cheap early-out flip probe */
      if (probeAny(st, r, c, seat)) return true;
    }
  return false;
}
/* a fast boolean version of flipsFor — stops at the first flanked run */
function probeAny(st, r, c, seat){
  const mine = discOf(seat);
  for (let k = 0; k < DIRS.length; k++){
    const dr = DIRS[k][0], dc = DIRS[k][1];
    let rr = r + dr, cc = c + dc, cnt = 0;
    while (onBoard(rr, cc)){
      const v = st.grid[idx(rr, cc)];
      if (v === EMPTY) { cnt = 0; break; }
      if (v === mine)  break;
      cnt++; rr += dr; cc += dc;
    }
    if (cnt && onBoard(rr, cc) && st.grid[idx(rr, cc)] === mine) return true;
  }
  return false;
}

/* the legal moves for a seat, as {t:'place', r, c}. Illegal to move out of
   turn or after the game is over. */
function legal(st, seat){
  if (st.done) return [];
  if (seat !== st.turn) return [];
  const out = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++){
      if (st.grid[idx(r, c)] !== EMPTY) continue;
      if (probeAny(st, r, c, seat)) out.push({ t:'place', r, c });
    }
  return out;
}

/* whose move it is; -1 when the game is over */
function turn(st){ return st.done ? -1 : st.turn; }

/* the first seat at or after `from` (wrapping once round) that has a legal
   move. Returns -1 if NO seat can move. */
function firstMover(st, from){
  for (let i = 0; i < st.seats; i++){
    const s = (from + i) % st.seats;
    if (hasMove(st, s)) return s;
  }
  return -1;
}

/* ═══════════════════════════════════════════════════════════════════
   THE GATE — every move (thumb, machine, wire, replay) is measured here
   and nowhere else. A placement is legal iff it is that seat's turn, the
   game is live, the cell is empty and on-board, and it flips ≥1 disc.
   ═══════════════════════════════════════════════════════════════════ */
function check(st, mv, seat){
  if (!mv || st.done) return false;
  if (mv.t !== 'place') return false;
  if (seat !== st.turn) return false;
  const r = mv.r | 0, c = mv.c | 0;
  if (!onBoard(r, c)) return false;
  if (st.grid[idx(r, c)] !== EMPTY) return false;
  return probeAny(st, r, c, seat);
}

/* ═══════════════════════════════════════════════════════════════════
   APPLY — deterministic; the log replays through here. Places the disc,
   flips every flanked run, records the flips for the animation, then
   advances to the next seat that can move. If no seat can move (or the
   board is full) the game ends. PASSES are automatic: the engine never
   asks a seat with no move to act — apply() only ever runs for a legal
   placement, and turn-advance skips seats that cannot move.
   ═══════════════════════════════════════════════════════════════════ */
function apply(st, mv){
  const seat = st.turn;
  const r = mv.r | 0, c = mv.c | 0;
  const flips = flipsFor(st, r, c, seat);
  if (!flips.length) return;                   /* guarded by check(); safe */
  const d = discOf(seat);
  st.grid[idx(r, c)] = d;
  for (let i = 0; i < flips.length; i++) st.grid[idx(flips[i].r, flips[i].c)] = d;
  st.ply++;
  st.passes = 0;
  st.last = { r, c, seat, flips };

  if (st.ply >= CELLS){ endGame(st); return; }

  /* advance to the next seat that can move; count skipped seats as passes
     purely so a "whole table passed" round ends the game. */
  const next = firstMover(st, (seat + 1) % st.seats);
  if (next < 0){ endGame(st); return; }
  /* how many seats we skipped (had no move) between seat+1 and next */
  st.turn = next;
}

/* ═══════════════════════════════════════════════════════════════════
   COUNTING + THE ENDING
   ═══════════════════════════════════════════════════════════════════ */
function counts(st){
  const out = new Array(st.seats).fill(0);
  for (let i = 0; i < st.grid.length; i++){
    const v = st.grid[i];
    if (v !== EMPTY) out[v - 1]++;
  }
  return out;
}
function countDiscs(st, seat){
  const d = discOf(seat); let n = 0;
  for (let i = 0; i < st.grid.length; i++) if (st.grid[i] === d) n++;
  return n;
}
function endGame(st){
  const cs = counts(st);
  let best = -1;
  for (let i = 0; i < cs.length; i++) if (cs[i] > best) best = cs[i];
  const winners = [];
  for (let i = 0; i < cs.length; i++) if (cs[i] === best) winners.push(i);
  st.done = { kind:'over', counts: cs, winners };
}

/* the verdict, read straight off st.done. winners is a seat list (one, or
   several on a tie); counts[i] is seat i's disc count. */
function over(st){
  if (!st.done) return null;
  const cs = st.done.counts.slice();
  const winners = st.done.winners.slice();
  return {
    kind: st.done.kind,               /* 'over'                          */
    counts: cs,
    winners,
    winner: winners.length === 1 ? winners[0] : -1,   /* -1 on a shared top */
    draw: winners.length > 1
  };
}

/* a one-line status the UI can translate. Engine returns {en,mt} ids. */
function note(st){
  if (st.done){
    const ov = over(st);
    if (ov.draw) return { en: 'The board is full — a shared top.', mt: 'It-tabellun mimli — quċċata maqsuma.' };
    return { en: 'The board is settled.', mt: 'It-tabellun issetiljat.' };
  }
  return { en: 'Place a disc to flip.', mt: 'Poġġi diska biex taqleb.' };
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — Othello positional play, three sharpnesses.

   think(st, seat, lvl) → { t:'place', r, c }  (or null if it is not
   seat's turn / the game is over / no legal move). Pure: reads only the
   board and, for its tie-break, the match seed.

     lvl 1  greedy: place where it flips the MOST discs this turn (the
            classic beginner blunder — early disc-count means nothing).
     lvl 2  positional: score each move by the SQUARE it lands on (corners
            huge, X/C squares next to empty corners poison), by how many
            discs it flips a little, and by MOBILITY (keeping your own
            options open and denying the opponents theirs).
     lvl 3  positional + look-ahead: the lvl-2 score, but searched a few
            plies for 2 players / one reply layer for 3–4, minimising the
            best reply the other seats have.
   ═══════════════════════════════════════════════════════════════════ */

/* the classic Othello square-values (corners best, the diagonal-adjacent
   "X" squares and the edge-adjacent "C" squares near an unheld corner are
   the worst). 8×8, symmetric. */
const SQUARE_W = [
  120,-20, 20,  5,  5, 20,-20,120,
  -20,-40, -5, -5, -5, -5,-40,-20,
   20, -5, 15,  3,  3, 15, -5, 20,
    5, -5,  3,  3,  3,  3, -5,  5,
    5, -5,  3,  3,  3,  3, -5,  5,
   20, -5, 15,  3,  3, 15, -5, 20,
  -20,-40, -5, -5, -5, -5,-40,-20,
  120,-20, 20,  5,  5, 20,-20,120
];
const CORNERS = [ [0,0],[0,7],[7,0],[7,7] ];

/* the positional value of the whole board from `seat`'s point of view:
   sum of my square-weights minus the max any single OTHER seat has. Corners
   already owned are counted heavily by SQUARE_W; on top we add a mobility
   term (my legal-move count minus the best opponent's). */
function positional(st, seat){
  let mineW = 0;
  const otherW = new Array(st.seats).fill(0);
  const g = st.grid;
  for (let i = 0; i < CELLS; i++){
    const v = g[i];
    if (v === EMPTY) continue;
    const s = v - 1;
    if (s === seat) mineW += SQUARE_W[i];
    else otherW[s] += SQUARE_W[i];
  }
  let bestOther = -1e9;
  for (let s = 0; s < st.seats; s++) if (s !== seat && otherW[s] > bestOther) bestOther = otherW[s];
  if (bestOther === -1e9) bestOther = 0;
  return mineW - bestOther;
}

/* make/unmake a placement in place — the search never allocates a board.
   Returns an undo record (the placed cell + the flipped cells) so it can
   be reverted exactly. */
function pushMove(st, r, c, seat){
  const flips = flipsFor(st, r, c, seat);
  const d = discOf(seat);
  st.grid[idx(r, c)] = d;
  for (let i = 0; i < flips.length; i++) st.grid[idx(flips[i].r, flips[i].c)] = d;
  return { r, c, flips };
}
function popMove(st, u){
  st.grid[idx(u.r, u.c)] = EMPTY;
  for (let i = 0; i < u.flips.length; i++)
    st.grid[idx(u.flips[i].r, u.flips[i].c)] = u.flips[i].from;
}

/* a full static score of a move for `seat`, WITHOUT recursion: the square
   it lands on + a small reward for discs flipped + a mobility term. Used
   by lvl 2 directly and as the leaf of lvl 3's look-ahead. */
function moveScore(st, r, c, seat){
  const flips = flipsFor(st, r, c, seat);
  const u = pushMove(st, r, c, seat);
  let s = SQUARE_W[idx(r, c)] + flips.length * 2;
  /* mobility: my next-turn options minus the strongest opponent's */
  let myMob = countMoves(st, seat), oppMob = 0;
  for (let o = 0; o < st.seats; o++) if (o !== seat){ const m = countMoves(st, o); if (m > oppMob) oppMob = m; }
  s += (myMob - oppMob) * 3;
  popMove(st, u);
  return s;
}
function countMoves(st, seat){
  let n = 0;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      if (st.grid[idx(r, c)] === EMPTY && probeAny(st, r, c, seat)) n++;
  return n;
}

/* a full LEAF evaluation from `me`'s point of view: the positional square
   score plus a mobility term (my next-turn options minus the strongest
   opponent's). Corners/edges dominate through SQUARE_W; mobility keeps the
   machine from filling the board early and handing over free corners. */
function leafEval(st, me){
  let s = positional(st, me);
  let myMob = countMoves(st, me), oppMob = 0;
  for (let o = 0; o < st.seats; o++) if (o !== me){ const m = countMoves(st, o); if (m > oppMob) oppMob = m; }
  s += (myMob - oppMob) * 6;
  return s;
}

/* ── lvl 3, TWO players: real negamax with alpha-beta on leafEval ──────
   Standard 2-player Othello search. `me` is the seat we score for; we
   recurse for the side to move and negate (negamax). A seat with no move
   PASSES (we recurse for the other seat without placing); if NEITHER can
   move the board is settled and we score by final disc DIFFERENCE (the
   real objective at the end), scaled up so a won endgame outranks any
   positional score. Deterministic and bounded by `depth`. */
function negamax2(st, toMove, me, depth, alpha, beta){
  const myMoves = movesList(st, toMove);
  if (!myMoves.length){
    const opp = 1 - toMove;
    if (!movesList(st, opp).length){
      /* terminal: score by disc difference from `me`'s side */
      const cs = counts(st);
      const diff = cs[me] - cs[1 - me];
      const term = 100000 + Math.abs(diff);
      const signed = diff >= 0 ? term : -term;
      return toMove === me ? signed : -signed;
    }
    /* pass: same depth, other side moves (a pass is not a ply spent) */
    return -negamax2(st, opp, me, depth, -beta, -alpha);
  }
  if (depth <= 0){
    const e = leafEval(st, me);
    return toMove === me ? e : -e;
  }
  let best = -Infinity, a = alpha;
  /* move ordering: corners first sharpen the pruning */
  myMoves.sort((p, q) => SQUARE_W[idx(q.r, q.c)] - SQUARE_W[idx(p.r, p.c)]);
  for (let i = 0; i < myMoves.length; i++){
    const m = myMoves[i];
    const u = pushMove(st, m.r, m.c, toMove);
    const val = -negamax2(st, 1 - toMove, me, depth - 1, -beta, -a);
    popMove(st, u);
    if (val > best) best = val;
    if (val > a) a = val;
    if (a >= beta) break;
  }
  return best;
}
function movesList(st, seat){
  const out = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      if (st.grid[idx(r, c)] === EMPTY && probeAny(st, r, c, seat)) out.push({ r, c });
  return out;
}

/* ── lvl 3, THREE/FOUR players: paranoid one-reply-layer look-ahead ────
   A full multi-player minimax explodes and, with more seats, any single
   plan is quickly undone by the others — so the strong bot for 3–4p plays
   its move, lets each OTHER seat take its best positional reply once (in
   turn order, skipping seats with no move), and scores the board from its
   own view. Bounded and always terminating. */
function lookaheadNp(st, r, c, seat, depth){
  const u = pushMove(st, r, c, seat);
  const val = replyChain(st, (seat + 1) % st.seats, seat, depth);
  popMove(st, u);
  return val;
}
function replyChain(st, toMove, me, budget){
  let s = -1;
  for (let i = 0; i < st.seats; i++){
    const cand = (toMove + i) % st.seats;
    if (countMoves(st, cand) > 0){ s = cand; break; }
  }
  if (s < 0 || budget <= 0 || s === me) return leafEval(st, me);
  let bestV = -1e9, br = -1, bc = -1;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++){
      if (st.grid[idx(r, c)] !== EMPTY || !probeAny(st, r, c, s)) continue;
      const v = SQUARE_W[idx(r, c)] + flipsFor(st, r, c, s).length;
      if (v > bestV){ bestV = v; br = r; bc = c; }
    }
  if (br < 0) return leafEval(st, me);
  const u = pushMove(st, br, bc, s);
  const val = replyChain(st, (s + 1) % st.seats, me, budget - 1);
  popMove(st, u);
  return val;
}

function think(st, seat, lvl){
  if (st.done || seat !== st.turn) return null;
  lvl = Math.max(1, Math.min(3, lvl || st.lvl || 2));
  const moves = legal(st, seat);
  if (!moves.length) return null;               /* caller/UI handles a pass */

  const depth = depthOf(lvl, st.seats);
  const scored = [];
  let bestVal = -Infinity;
  for (let i = 0; i < moves.length; i++){
    const m = moves[i];
    let val;
    if (lvl === 1){
      /* IT-TIFEL — the kid, and he plays like one. Grabbing the biggest pile
         is already a poor Othello strategy, but this used to ALSO nudge him
         towards corners (+5), which are the one thing that actually wins the
         game — so the beginner setting was quietly taught the best move on
         the board.

         Inverting SQUARE_W does the whole job with the table we already have:
         a corner (120) becomes a 180-point deterrent he takes only when he
         has nothing else, and the X and C squares beside a corner (-40, -20)
         become a temptation, which is exactly the mistake that hands YOU the
         corner. Big pile, worst square, no idea why he is losing.
         The 0.3 is measured, not chosen: swept against a random player at
         0, 0.3, 0.6, 1.0 and 1.5, the machine wins 50%, 30%, 10%, 8% and
         18%. Anything from 0.6 up loses to RANDOM nine times in ten, which
         stops looking like a weak player and starts looking like one that is
         throwing. 0.3 loses about two games in three — beatable by anybody
         paying attention, without being insulting. */
      val = flipsFor(st, m.r, m.c, seat).length * 10 - SQUARE_W[idx(m.r, m.c)] * 0.3;
    } else if (lvl === 3 && st.seats <= 2 && depth > 0){
      /* real negamax alpha-beta for the two-player endgame-aware search */
      const u = pushMove(st, m.r, m.c, seat);
      val = -negamax2(st, 1 - seat, seat, depth - 1, -Infinity, Infinity);
      popMove(st, u);
    } else if (depth > 0){
      /* 3–4 players: paranoid one-reply-layer look-ahead */
      val = lookaheadNp(st, m.r, m.c, seat, depth);
    } else {
      /* lvl 2: static positional score of the move */
      val = moveScore(st, m.r, m.c, seat);
    }
    scored.push({ m, val });
    if (val > bestVal) bestVal = val;
  }

  const EPS = 1e-6;
  const top = scored.filter(s => s.val >= bestVal - EPS).map(s => s.m);
  if (top.length === 1 || !st.aiJitter){
    /* deterministic: the lowest-index (row-major first) best cell */
    return { t:'place', r: top[0].r, c: top[0].c };
  }
  /* variety: a deterministic hash of the position + seed picks among the
     equally-good cells — identical on every phone with the same seed */
  const h = hash32([st.rs, st.ply, seat, lvl].concat(st.grid));
  const pick = top[h % top.length];
  return { t:'place', r: pick.r, c: pick.c };
}
function isCorner(r, c){ return (r === 0 || r === N - 1) && (c === 0 || c === N - 1); }

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — a move as flat fields, for js/mp.js's generic codec. An
   AQLEB move is a cell {r,c}, each 0..7, already one byte apiece. There is
   no hidden state and no seed to smuggle — the board is shared and every
   phone derives the identical flip from the cell alone, which is the whole
   reason this game is honest online.
   ═══════════════════════════════════════════════════════════════════ */
const WIRE_FIELDS = ['r', 'c'];
function encWire(mv){
  if (!mv || mv.t !== 'place') return null;
  const r = mv.r | 0, c = mv.c | 0;
  if (r < 0 || r >= N || c < 0 || c >= N) return null;
  return { t:'place', r, c };
}
function decWire(w){
  if (!w || w.t !== 'place') return null;
  const r = w.r | 0, c = w.c | 0;
  if (r < 0 || r >= N || c < 0 || c >= N) return null;
  return { t:'place', r, c };
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — js/aqleb-ui.js and the test harness both read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_AQLEB = root.KARTI_AQLEB || {};
root.KARTI_AQLEB.engine = {
  N, CELLS, EMPTY, MIN_SEATS, MAX_SEATS, LEVELS, DIRS,
  discOf, seatOfDisc, levelOf, depthOf, seedFor,
  newSeed, newGame,
  cell, onBoard, legal, turn, check, apply,
  flipsFor, hasMove, firstMover,
  counts, countDiscs, over, note,
  positional, moveScore, think,
  encWire, decWire, WIRE_FIELDS,
  SQUARE_W, CORNERS
};

})(typeof window !== 'undefined' ? window : globalThis);
