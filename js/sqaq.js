/* ═══════════════════════════════════════════════════════════════════
   KARTI — sqaq.js
   IS-SQAQ ("the alley") — the wall-maze race, 2–4 players. The pure
   engine: rules only, no DOM, no clock, and NOTHING random anywhere —
   not even a quarantined newSeed(), because nothing in this game wants
   one: no dice, no deal, and even the machine's play is a deterministic
   function of the position. Every phone computes the identical state
   from the identical move list. The screen half is js/sqaq-ui.js.

   THE GAME
     A nine-by-nine board. Each player starts mid-edge on their own side
     and races to reach ANY cell of the OPPOSITE edge. On your turn you
     either STEP your pawn one square (up/down/left/right), or SPEND one
     of your walls: a wall is two squares long, sits in the groove
     BETWEEN squares, and may not overlap or cross another wall.

     JUMPS: a pawn standing right next to you is stepped OVER if the
     square behind it is open; if a wall or the edge is behind it, you
     step DIAGONALLY around it instead.

     THE ONE RULE THAT MAKES THE GAME: a wall may NEVER leave any player
     with no route at all to their goal edge. You may make the route
     long, mean and humiliating — you may not seal it. Every placement
     is checked here with a flood-fill for EVERY pawn before it is
     allowed, and the check ignores pawns (pawns move; walls do not).

     WALLS: 10 each for two players, 7 each for three, 5 each for four.
     First pawn to touch its goal edge wins; there is no draw.

   SEATS AND GOALS (board row 0 is drawn at the top)
     seat 0 starts (8,4), wins on row 0        seat 1 starts (0,4), row 8
     seat 2 starts (4,0), wins on column 8     seat 3 starts (4,8), col 0

   WALL COORDINATES
     A wall is {r,c,o}: o:'h' lies in the horizontal groove UNDER row r,
     covering columns c and c+1 (0 ≤ r ≤ 7, 0 ≤ c ≤ 7); o:'v' lies in
     the vertical groove RIGHT of column c, covering rows r and r+1.
     Two walls conflict when they share a groove segment, or when an 'h'
     and a 'v' cross at the same anchor.

   THE WIRE — {t,r,c,o}: t:'go' steps to (r,c); t:'wall' spends a wall
   at (r,c,o). Flat, five short fields, nothing else ever added mid-set.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const N = 9;                       /* cells per side */
const MIN_SEATS = 2, MAX_SEATS = 4;
const WALLS_FOR = { 2:10, 3:7, 4:5 };
/* what rides the relay beside the action: NUMBERS ONLY (the codec packs
   0..255 ints; a string would be refused and stop the table). The move's
   `t` travels as the action itself, and orientation travels as 0=h 1=v. */
const WIRE_FIELDS = ['r', 'c', 'o'];

const START = [ { r:8, c:4 }, { r:0, c:4 }, { r:4, c:0 }, { r:4, c:8 } ];
/* goalOf(seat)(r,c) — true on the winning edge */
const GOAL = [
  (r, c) => r === 0,
  (r, c) => r === N - 1,
  (r, c) => c === N - 1,
  (r, c) => c === 0
];

const DIRS = [ [-1,0], [1,0], [0,-1], [0,1] ];   /* up, down, left, right */

function newGame(opts){
  opts = opts || {};
  const seats = Math.max(MIN_SEATS, Math.min(MAX_SEATS, (opts.seats | 0) || 2));
  const st = {
    seats,
    turn: 0,
    pawns: [], left: [],
    walls: [],                     /* [{r,c,o}] in placement order */
    gone: {},                      /* seats that left for good; skipped */
    winner: -1,
    last: null,                    /* the previous move, for the UI marker */
    moves: 0
  };
  for (let i = 0; i < seats; i++){
    st.pawns.push({ r: START[i].r, c: START[i].c });
    st.left.push(WALLS_FOR[seats]);
  }
  return st;
}

function inBoard(r, c){ return r >= 0 && r < N && c >= 0 && c < N; }

/* is the edge between (r,c) and the adjacent cell one step in (dr,dc)
   closed by a wall? Scans the wall list — at most 20 entries, and the
   scan keeps the state a plain replayable list with nothing derived. */
function blocked(st, r, c, dr, dc){
  const W = st.walls;
  for (let i = 0; i < W.length; i++){
    const w = W[i];
    if (w.o === 'h'){
      if (dr === -1 && w.r === r - 1 && (w.c === c || w.c === c - 1)) return true;
      if (dr ===  1 && w.r === r     && (w.c === c || w.c === c - 1)) return true;
    } else {
      if (dc === -1 && w.c === c - 1 && (w.r === r || w.r === r - 1)) return true;
      if (dc ===  1 && w.c === c     && (w.r === r || w.r === r - 1)) return true;
    }
  }
  return false;
}

function pawnAt(st, r, c){
  for (let i = 0; i < st.seats; i++){
    const p = st.pawns[i];
    if (p.r === r && p.c === c) return i;
  }
  return -1;
}

/* every square the seat's pawn may step to right now — plain steps,
   straight jumps, and the diagonal side-step when the jump is blocked.
   Deterministic order (DIRS order, diagonals in DIRS order too). */
function legalSteps(st, seat){
  const out = [];
  const me = st.pawns[seat];
  const seen = {};
  const add = (r, c) => { const k = r * N + c; if (!seen[k]){ seen[k] = 1; out.push({ r, c }); } };
  for (let d = 0; d < 4; d++){
    const dr = DIRS[d][0], dc = DIRS[d][1];
    const nr = me.r + dr, nc = me.c + dc;
    if (!inBoard(nr, nc) || blocked(st, me.r, me.c, dr, dc)) continue;
    const who = pawnAt(st, nr, nc);
    if (who < 0){ add(nr, nc); continue; }
    /* an adjacent pawn: try the straight jump first */
    const br = nr + dr, bc = nc + dc;
    if (inBoard(br, bc) && !blocked(st, nr, nc, dr, dc) && pawnAt(st, br, bc) < 0){
      add(br, bc);
      continue;
    }
    /* jump blocked (wall, edge, or a second pawn) → the two side-steps */
    for (let q = 0; q < 4; q++){
      const qr = DIRS[q][0], qc = DIRS[q][1];
      if (qr === dr && qc === dc) continue;
      if (qr === -dr && qc === -dc) continue;
      const gr = nr + qr, gc = nc + qc;
      if (inBoard(gr, gc) && !blocked(st, nr, nc, qr, qc) && pawnAt(st, gr, gc) < 0)
        add(gr, gc);
    }
  }
  return out;
}

/* shortest wall-respecting distance from the seat's pawn to its goal
   edge, IGNORING pawns (they move; walls do not) — or -1 for "sealed",
   which is precisely what wallOK exists to forbid. Plain flood fill. */
function pathLen(st, seat){
  const goal = GOAL[seat];
  const start = st.pawns[seat];
  if (goal(start.r, start.c)) return 0;
  const dist = new Array(N * N).fill(-1);
  const q = [start.r * N + start.c];
  dist[q[0]] = 0;
  for (let head = 0; head < q.length; head++){
    const k = q[head], r = (k / N) | 0, c = k % N;
    for (let d = 0; d < 4; d++){
      const dr = DIRS[d][0], dc = DIRS[d][1];
      const nr = r + dr, nc = c + dc;
      if (!inBoard(nr, nc) || blocked(st, r, c, dr, dc)) continue;
      const nk = nr * N + nc;
      if (dist[nk] >= 0) continue;
      dist[nk] = dist[k] + 1;
      if (goal(nr, nc)) return dist[nk];
      q.push(nk);
    }
  }
  return -1;
}

/* may this wall be placed? bounds, stock, overlap/cross — and then THE
   RULE: with the wall down, every pawn still reaches its goal. */
function wallOK(st, seat, r, c, o){
  if (st.left[seat] <= 0) return false;
  if (o !== 'h' && o !== 'v') return false;
  if (!(r >= 0 && r <= N - 2 && c >= 0 && c <= N - 2)) return false;
  for (let i = 0; i < st.walls.length; i++){
    const w = st.walls[i];
    if (w.o === o){
      if (o === 'h' && w.r === r && Math.abs(w.c - c) <= 1) return false;
      if (o === 'v' && w.c === c && Math.abs(w.r - r) <= 1) return false;
    } else if (w.r === r && w.c === c) return false;         /* crossing */
  }
  st.walls.push({ r, c, o });                 /* try it on, then decide */
  let ok = true;
  for (let i = 0; i < st.seats; i++){
    if (st.gone[i]) continue;                 /* a gone pawn needs no route */
    if (pathLen(st, i) < 0){ ok = false; break; }
  }
  st.walls.pop();
  return ok;
}

/* every legal wall right now — the UI paints these as tappable slots */
function legalWalls(st, seat, o){
  const out = [];
  if (st.left[seat] <= 0) return out;
  for (let r = 0; r <= N - 2; r++)
    for (let c = 0; c <= N - 2; c++)
      if (wallOK(st, seat, r, c, o)) out.push({ r, c, o });
  return out;
}

function turn(st){ return st.winner >= 0 ? -1 : st.turn; }

function nextTurn(st){
  for (let hop = 1; hop <= st.seats; hop++){
    const i = (st.turn + hop) % st.seats;
    if (!st.gone[i]) return i;
  }
  return st.turn;
}

function check(st, mv, seat){
  if (!mv || st.winner >= 0 || seat !== st.turn || st.gone[seat]) return false;
  if (mv.t === 'go'){
    const r = mv.r | 0, c = mv.c | 0;
    const steps = legalSteps(st, seat);
    for (let i = 0; i < steps.length; i++)
      if (steps[i].r === r && steps[i].c === c) return true;
    return false;
  }
  if (mv.t === 'wall') return wallOK(st, seat, mv.r | 0, mv.c | 0, mv.o);
  return false;
}

/* apply() trusts nothing: it re-checks, exactly like the games it
   follows — the engine is the referee, whatever the source. */
function apply(st, mv){
  const seat = st.turn;
  if (!check(st, mv, seat)) return false;
  if (mv.t === 'go'){
    st.pawns[seat].r = mv.r | 0;
    st.pawns[seat].c = mv.c | 0;
    if (GOAL[seat](st.pawns[seat].r, st.pawns[seat].c)) st.winner = seat;
  } else {
    st.walls.push({ r: mv.r | 0, c: mv.c | 0, o: mv.o });
    st.left[seat]--;
  }
  st.last = { seat, t: mv.t, r: mv.r | 0, c: mv.c | 0, o: mv.o || '' };
  st.moves++;
  if (st.winner < 0) st.turn = nextTurn(st);
  return true;
}

function over(st){
  if (st.winner < 0) return null;
  return { winner: st.winner, winners: [st.winner], draw: false };
}

/* a seat that left for good: its pawn freezes where it stands (an
   obstacle, exactly as if its owner refused to move) and its turns are
   skipped. Called identically on every phone off the same relay event,
   so the states cannot disagree. */
function dropSeat(st, seat){
  if (seat < 0 || seat >= st.seats || st.gone[seat]) return;
  st.gone[seat] = 1;
  if (st.winner < 0 && st.turn === seat) st.turn = nextTurn(st);
}

/* THE MACHINE — a deterministic function of the position, no seed, no
   dice. Step along your shortest route; but when a rival is closing in
   faster than you and you still hold walls, spend one where it hurts
   them most. lvl 1 never walls, lvl 2 walls when behind, lvl 3 walls
   when behind or level. Tie-breaks are fixed scan order, so every
   phone that ever asks gets the same answer. */
function aiMove(st, seat, lvl){
  lvl = lvl || 2;
  const myLen = pathLen(st, seat);
  let rival = -1, rivalLen = Infinity;
  for (let i = 0; i < st.seats; i++){
    if (i === seat || st.gone[i]) continue;
    const L = pathLen(st, i);
    if (L >= 0 && L < rivalLen){ rivalLen = L; rival = i; }
  }
  const wantWall = lvl >= 2 && rival >= 0 && st.left[seat] > 0 &&
    (rivalLen < myLen || (lvl >= 3 && rivalLen === myLen));
  if (wantWall){
    /* only bother near the rival's pawn — a 5x5 window, both grooves */
    let best = null, bestGain = 0;
    const p = st.pawns[rival];
    for (let r = Math.max(0, p.r - 2); r <= Math.min(N - 2, p.r + 2); r++){
      for (let c = Math.max(0, p.c - 2); c <= Math.min(N - 2, p.c + 2); c++){
        for (let k = 0; k < 2; k++){
          const o = k ? 'v' : 'h';
          if (!wallOK(st, seat, r, c, o)) continue;
          st.walls.push({ r, c, o });
          const gain = (pathLen(st, rival) - rivalLen) - (pathLen(st, seat) - myLen);
          st.walls.pop();
          if (gain > bestGain){ bestGain = gain; best = { t:'wall', r, c, o }; }
        }
      }
    }
    if (best && bestGain >= 2) return best;
  }
  /* step: pick the legal step that leaves the shortest remaining route */
  const steps = legalSteps(st, seat);
  let best = null, bestLen = Infinity;
  const keep = { r: st.pawns[seat].r, c: st.pawns[seat].c };
  for (let i = 0; i < steps.length; i++){
    st.pawns[seat].r = steps[i].r; st.pawns[seat].c = steps[i].c;
    const L = pathLen(st, seat);
    st.pawns[seat].r = keep.r; st.pawns[seat].c = keep.c;
    if (L >= 0 && L < bestLen){ bestLen = L; best = { t:'go', r: steps[i].r, c: steps[i].c }; }
  }
  return best || (steps.length ? { t:'go', r: steps[0].r, c: steps[0].c } : null);
}

const encWire = mv => mv.t === 'wall'
  ? { t:'wall', r: mv.r | 0, c: mv.c | 0, o: mv.o === 'v' ? 1 : 0 }
  : { t:'go',   r: mv.r | 0, c: mv.c | 0 };
const decWire = mv => {
  if (!mv || (mv.t !== 'go' && mv.t !== 'wall')) return null;
  if (mv.t === 'go') return { t:'go', r: mv.r | 0, c: mv.c | 0 };
  return { t:'wall', r: mv.r | 0, c: mv.c | 0,
           o: (mv.o === 'v' || (mv.o | 0) === 1) ? 'v' : 'h' };
};

window.KARTI_SQAQ = window.KARTI_SQAQ || {};
window.KARTI_SQAQ.engine = {
  N, MIN_SEATS, MAX_SEATS, WALLS_FOR, WIRE_FIELDS, START, GOAL,
  newGame, turn, check, apply, over,
  legalSteps, legalWalls, wallOK, pathLen, dropSeat, aiMove,
  encWire, decWire, pawnAt, blocked
};

})();
