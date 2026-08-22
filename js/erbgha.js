/* ═══════════════════════════════════════════════════════════════════
   KARTI — erbgha.js
   ERBGĦA F'RINGIELA — "four in a row", the Maltese Connect 4. The pure
   engine: rules only, no DOM, no clock, and the ONE Math.random in this
   file lives in newSeed(), exactly the quarantine js/poker.js keeps. The
   screen half is js/erbgha-ui.js and follows js/ludu-ui.js's runner
   shape — a match is (opts, seed, log), the state is deal() plus a
   replay of the log, and a rollback is cutting the log.

   THE GAME
     A board seven columns wide and six rows tall stands on its edge.
     Two players take turns dropping a disc into a column; it falls to
     the lowest empty cell in that column. The first to line up FOUR of
     their own discs — across, up, or on either diagonal — wins. If all
     forty-two cells fill with nobody lined up, it is a draw.

     Perfect information, no randomness, turn based. There is nothing
     hidden and nothing to seed the play with, so ONLINE IS TRIVIALLY
     HONEST: both phones drop discs onto the identical board off the same
     move list. The seed exists only so the machine can break a tie the
     same way on every phone (below), and even that can be turned off.

   DETERMINISM
     A move is one small integer — the column, 0..6 — so the whole log is
     a string of columns and replaying it rebuilds any position exactly.
     The AI is a pure function of the position (its minimax reads only
     the board); its ONLY non-determinism is an optional tie-break among
     equally-good columns, hashed from a per-match seed so it is the same
     on every phone that shares the seed. Pass opts.aiJitter=false and the
     machine is fully deterministic (it takes the centremost best column).

   THE MACHINE
     Real minimax with alpha-beta pruning. Connect 4 is a solved game
     (the first player wins with perfect centre play), so we do NOT chase
     perfection — we chase "never blunders, and hard is genuinely hard":

       lvl 1  Gentle    a shallow look plus a heuristic; still never
                        misses an immediate win and never fails to block
                        an immediate loss — those two are checked FIRST,
                        outside the search, so no depth setting can lose
                        a game on the next move.
       lvl 2  Steady    a mid-depth alpha-beta search on a positional
                        heuristic (windows of four, centre control).
       lvl 3  Sharp     a deep alpha-beta search with move ordering,
                        transposition memo and killer heuristics — tough
                        for a person and never a free four given away.

     The win/loss guard is not the search's job to rediscover; it is a
     hard gate in front of the search (immediateWin / immediateBlock) so
     that even lvl 1, and even a truncated search that ran out of time,
     is incapable of walking into a four or missing one of its own. The
     test harness proves this over many thousands of positions.

   COORDINATES
     Column c in 0..COLS-1 (left→right), row r in 0..ROWS-1 with r=0 the
     BOTTOM row (where a disc lands first). A cell holds 0 (empty), 1
     (player one's disc) or 2 (player two's disc). Seat 0 always moves
     first; the UI decides who seat 0 is (you, the machine, the network).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ── the board ─────────────────────────────────────────────────────── */
const COLS = 7;
const ROWS = 6;
const CELLS = COLS * ROWS;
const CONNECT = 4;                       /* discs in a row to win        */
const EMPTY = 0;                         /* a cell nobody has played     */

/* seats. Two players; seat 0 drops first. The disc a seat leaves in a
   cell is seat+1 (1 or 2) so EMPTY can stay 0. */
const SEATS = 2;
const discOf = seat => seat + 1;         /* 0→1, 1→2                     */
const seatOfDisc = d => d - 1;

/* ── the ONE Math.random, quarantined (js/poker.js's newSeed) ──────── */
function newSeed(){ return (Math.random() * 0x100000000) >>> 0; }

/* a tiny deterministic hash → 0..1, used ONLY to pick between columns
   the search rated identically. Same board, same seed, same choice, on
   every phone; never a clock, never Math.random. */
function hash32(list){
  let h = 2166136261;
  for (let i = 0; i < list.length; i++){
    h ^= (list[i] | 0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ═══════════════════════════════════════════════════════════════════
   THE STATE
   opts: { humans, lvl, aiJitter }
     humans   1 → you vs the machine (seat 0 is you)
              2 → pass the phone (both seats are people on this device)
              0 → online (ownership is stamped per seat by the UI)
     lvl      the machine's sharpness, 1..3
     aiJitter default true; false makes the machine fully deterministic
   The engine does not care WHO owns a seat — that is the UI's book. It
   tracks only the board, whose turn it is, and how the game ended.
   ═══════════════════════════════════════════════════════════════════ */
const MIN_SEATS = 2, MAX_SEATS = 2;
const LEVELS = [
  { k: 1, name: 'It-Tifel', icon: 'diff-1',
    note: { en: 'Sees the winning drop and blocks yours — but no further.',
            mt: 'Jara t-tefgħa rebbieħa u jimblokka tiegħek — imma mhux aktar.' } },
  { k: 2, name: 'Tal-Każin', icon: 'diff-2',
    note: { en: 'Looks a few moves ahead and fights for the middle.',
            mt: 'Iħares ftit tefgħat ’il quddiem u jissielet għan-nofs.' } },
  { k: 3, name: 'Il-Kampjun', icon: 'diff-3',
    note: { en: 'Searches deep. Give it a four and it will take it.',
            mt: 'Ifittex fil-fond. Agħtih erbgħa u jeħodha.' } }
];
const levelOf = l => LEVELS.find(L => L.k === (l | 0)) || LEVELS[1];

/* how deep each level searches, and whether it may vary its tie-break */
const DEPTH = { 1: 2, 2: 5, 3: 8 };
const depthOf = l => DEPTH[Math.max(1, Math.min(3, l | 0 || 2))];

function newGame(opts, seed){
  opts = opts || {};
  const st = {
    v: 1,
    cols: COLS, rows: ROWS,
    /* the grid, column-major: cell(c,r) = grid[c*ROWS + r], r=0 bottom */
    grid: new Array(CELLS).fill(EMPTY),
    /* how many discs sit in each column (0..ROWS) — the next drop lands
       at row = height[c] */
    height: new Array(COLS).fill(0),
    turn: 0,                     /* seat to move; seat 0 first           */
    ply: 0,                      /* discs played so far                  */
    lvl: Math.max(1, Math.min(3, opts.lvl | 0 || 2)),
    aiJitter: opts.aiJitter === false ? false : true,
    rs: (seed == null ? 0 : (seed >>> 0)),
    /* the ending, once there is one: { kind, winner, line } —
       kind 'win' | 'draw', winner seat or -1, line the four winning
       cells [{c,r},…] (empty on a draw). null while the game is live. */
    done: null,
    last: null                   /* {c,r,seat} of the most recent drop   */
  };
  return st;
}

/* ── reading the board ─────────────────────────────────────────────── */
const idx = (c, r) => c * ROWS + r;
function cell(st, c, r){
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;   /* off-board */
  return st.grid[idx(c, r)];
}
/* a column a disc can still fall into */
function colOpen(st, c){ return c >= 0 && c < COLS && st.height[c] < ROWS; }
/* the columns still playable, centre-out — the order that makes alpha-beta
   prune hardest and is also the most natural place to play */
const CENTRE_ORDER = (function(){
  const mid = (COLS - 1) / 2, o = [];
  for (let c = 0; c < COLS; c++) o.push(c);
  o.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
  return o;
})();

/* the legal moves for a seat, as {t:'drop', c}. A move is only ever a
   column; the row is decided by gravity. It is illegal to move when the
   game is over or out of turn. */
function legal(st, seat){
  if (st.done) return [];
  if (seat !== st.turn) return [];
  const out = [];
  for (let i = 0; i < COLS; i++){
    const c = CENTRE_ORDER[i];
    if (colOpen(st, c)) out.push({ t: 'drop', c });
  }
  return out;
}
/* whose move it is; -1 when the game is over (there is no dealer turn in
   Connect 4 — the board never acts on its own) */
function turn(st){ return st.done ? -1 : st.turn; }

/* ═══════════════════════════════════════════════════════════════════
   THE GATE — every move (thumb, machine, wire, replay) is measured here
   and nowhere else. A drop is legal iff it is that seat's turn, the game
   is live, and the column has room.
   ═══════════════════════════════════════════════════════════════════ */
function check(st, mv, seat){
  if (!mv || st.done) return false;
  if (mv.t !== 'drop') return false;
  if (seat !== st.turn) return false;
  const c = mv.c | 0;
  return colOpen(st, c);
}

/* ═══════════════════════════════════════════════════════════════════
   APPLY — deterministic; the log replays through here. Drops the disc,
   detects a win from the landed cell (cheap — only lines through the new
   disc can have changed), flips the turn, and stamps the ending.
   ═══════════════════════════════════════════════════════════════════ */
function apply(st, mv){
  const seat = st.turn;
  const c = mv.c | 0;
  if (!colOpen(st, c)) return;                 /* guarded by check(); safe */
  const r = st.height[c];
  const d = discOf(seat);
  st.grid[idx(c, r)] = d;
  st.height[c]++;
  st.ply++;
  st.last = { c, r, seat };

  const line = winLineThrough(st, c, r, d);
  if (line){
    st.done = { kind: 'win', winner: seat, line };
  } else if (st.ply >= CELLS){
    st.done = { kind: 'draw', winner: -1, line: [] };
  } else {
    st.turn = 1 - st.turn;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   WIN DETECTION — all four directions, and it returns WHICH four cells.
   A win can only involve the disc just dropped, so we look outward from
   (c,r) along each of the four axes, count the run of matching discs on
   both sides, and if the run reaches four we hand back exactly those
   four cells (the outermost four through the landed disc). Directions:
     horizontal   (1,0)
     vertical     (0,1)
     diagonal ↗   (1,1)
     diagonal ↘   (1,-1)
   ═══════════════════════════════════════════════════════════════════ */
const DIRS = [ [1, 0], [0, 1], [1, 1], [1, -1] ];

function winLineThrough(st, c, r, d){
  for (let k = 0; k < DIRS.length; k++){
    const dc = DIRS[k][0], dr = DIRS[k][1];
    /* walk backwards to the start of the run */
    let sc = c, sr = r;
    while (cell(st, sc - dc, sr - dr) === d){ sc -= dc; sr -= dr; }
    /* count forward */
    let run = 0, ec = sc, er = sr, cells = [];
    while (cell(st, ec, er) === d){
      cells.push({ c: ec, r: er });
      ec += dc; er += dr; run++;
    }
    if (run >= CONNECT){
      /* the run may be longer than four (five in a row); return the four
         that pass through the landed disc so the highlight is centred on
         the winning drop */
      const at = cells.findIndex(p => p.c === c && p.r === r);
      let start = Math.max(0, Math.min(at - (CONNECT - 1), cells.length - CONNECT));
      /* keep the landed disc inside the window */
      if (start > at) start = at;
      if (start + CONNECT <= at) start = at - CONNECT + 1;
      start = Math.max(0, Math.min(start, cells.length - CONNECT));
      return cells.slice(start, start + CONNECT);
    }
  }
  return null;
}

/* a standalone check used by the AI guard and the tests: does dropping
   into column `c` win immediately for `seat`? Returns the line or null,
   WITHOUT mutating st. */
function dropWins(st, c, seat){
  if (!colOpen(st, c)) return null;
  const r = st.height[c], d = discOf(seat);
  st.grid[idx(c, r)] = d;
  const line = winLineThrough(st, c, r, d);
  st.grid[idx(c, r)] = EMPTY;                  /* put it back            */
  return line;
}

/* ═══════════════════════════════════════════════════════════════════
   OVER — the verdict, read straight off st.done. The winner is a SEAT;
   the UI (which knows who owns each seat) decides whether that is you.
   ═══════════════════════════════════════════════════════════════════ */
function over(st){
  if (!st.done) return null;
  return {
    kind: st.done.kind,                  /* 'win' | 'draw'               */
    winner: st.done.winner,              /* seat, or -1 on a draw        */
    line: (st.done.line || []).slice(),  /* the four winning cells       */
    draw: st.done.kind === 'draw'
  };
}

/* a one-line status the UI can translate. Engine returns {en,mt} ids,
   never a bare English string (js/lang.js rule). */
function note(st){
  if (st.done){
    if (st.done.kind === 'draw')
      return { en: 'The board is full — a draw.', mt: 'It-tabellun mimli — ndaqs.' };
    return { en: 'Four in a row!', mt: 'Erbgħa f’ringiela!' };
  }
  return st.turn === 0
    ? { en: 'Red to drop.',    mt: 'L-aħmar jitfa’.' }
    : { en: 'Yellow to drop.', mt: 'L-isfar jitfa’.' };
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — minimax with alpha-beta, fronted by a hard win/block
   guard so no level and no truncated search can ever miss an immediate
   win or fail to block an immediate loss.

   think(st, seat, lvl) → { t:'drop', c }  (or null if it is not seat's
   turn / the game is over). Pure: reads only the board and, for its
   tie-break, the match seed.
   ═══════════════════════════════════════════════════════════════════ */

/* THE GUARD, checked before any search runs.
   1. If I can win right now, do it.
   2. Else if the opponent could win right now, block it (if two threats
      exist I can only block one, and the search below will already be
      losing — but I still block the one I can, never ignoring both). */
function immediateWin(st, seat){
  for (let i = 0; i < COLS; i++){
    const c = CENTRE_ORDER[i];
    if (dropWins(st, c, seat)) return c;
  }
  return -1;
}
function immediateBlock(st, seat){
  const opp = 1 - seat;
  for (let i = 0; i < COLS; i++){
    const c = CENTRE_ORDER[i];
    if (dropWins(st, c, opp)) return c;
  }
  return -1;
}

/* the positional heuristic for a non-terminal board, from `seat`'s view.
   Sum over every length-four window (all four directions) of a score
   that rewards my discs in a window with no enemy disc, and punishes the
   enemy's — heavily as the window fills. Plus a small centre-column
   bonus, the single most valuable square in Connect 4. */
const WIN_SCORE = 1e6;                    /* a forced win, discounted by ply */
function windowScore(a, b, c, d, mine, theirs){
  let m = 0, t = 0, e = 0;
  const v = [a, b, c, d];
  for (let i = 0; i < 4; i++){
    if (v[i] === mine) m++;
    else if (v[i] === theirs) t++;
    else e++;
  }
  if (m && t) return 0;                   /* mixed window: dead, worth 0  */
  if (m === 4) return 100000;
  if (m === 3 && e === 1) return 120;
  if (m === 2 && e === 2) return 12;
  if (m === 1 && e === 3) return 1;
  if (t === 4) return -100000;
  if (t === 3 && e === 1) return -140;    /* fear their threat a touch more */
  if (t === 2 && e === 2) return -12;
  if (t === 1 && e === 3) return -1;
  return 0;
}
function evaluate(st, seat){
  const mine = discOf(seat), theirs = discOf(1 - seat);
  let s = 0;
  const g = st.grid;
  /* centre control */
  const midCol = (COLS - 1) >> 1;
  for (let r = 0; r < ROWS; r++){
    const v = g[idx(midCol, r)];
    if (v === mine) s += 6; else if (v === theirs) s -= 6;
  }
  /* horizontal windows */
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c + 3 < COLS; c++)
      s += windowScore(g[idx(c, r)], g[idx(c + 1, r)], g[idx(c + 2, r)], g[idx(c + 3, r)], mine, theirs);
  /* vertical windows */
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r + 3 < ROWS; r++)
      s += windowScore(g[idx(c, r)], g[idx(c, r + 1)], g[idx(c, r + 2)], g[idx(c, r + 3)], mine, theirs);
  /* diagonal ↗ windows */
  for (let c = 0; c + 3 < COLS; c++)
    for (let r = 0; r + 3 < ROWS; r++)
      s += windowScore(g[idx(c, r)], g[idx(c + 1, r + 1)], g[idx(c + 2, r + 2)], g[idx(c + 3, r + 3)], mine, theirs);
  /* diagonal ↘ windows */
  for (let c = 0; c + 3 < COLS; c++)
    for (let r = 3; r < ROWS; r++)
      s += windowScore(g[idx(c, r)], g[idx(c + 1, r - 1)], g[idx(c + 2, r - 2)], g[idx(c + 3, r - 3)], mine, theirs);
  return s;
}

/* make/unmake a drop in place — the search never allocates a board. On a
   win it stamps a scratch line so negamax can detect terminality without
   re-scanning. Returns the row it landed at, or -1 if the column was full. */
function pushDisc(st, c, seat){
  if (!colOpen(st, c)) return -1;
  const r = st.height[c], d = discOf(seat);
  st.grid[idx(c, r)] = d;
  st.height[c]++;
  return r;
}
function popDisc(st, c, r){
  st.grid[idx(c, r)] = EMPTY;
  st.height[c]--;
}

/* NEGAMAX with alpha-beta. Returns a score from `seat`'s point of view.
   A win is WIN_SCORE minus the ply it takes (so a faster win outranks a
   slower one, and a slower loss outranks a faster one). `me` is the seat
   the whole search is scored for; we recurse for the side to move and
   negate, the standard negamax fold. */
function negamax(st, toMove, me, depth, alpha, beta, killer){
  /* did the side that just moved (1-toMove) already win the board? That
     is checked by the caller before recursing — here we only handle
     depth-out and draws and generate moves. */
  if (st.ply >= CELLS) return 0;               /* drawn, dead even       */
  if (depth === 0) {
    const e = evaluate(st, me);
    return toMove === me ? e : -e;
  }

  let best = -Infinity;
  let a = alpha;
  /* move ordering: killer column first, then centre-out */
  const order = [];
  const kc = killer[depth];
  if (kc != null && colOpen(st, kc)) order.push(kc);
  for (let i = 0; i < COLS; i++){
    const c = CENTRE_ORDER[i];
    if (c !== kc && colOpen(st, c)) order.push(c);
  }

  for (let i = 0; i < order.length; i++){
    const c = order[i];
    const r = pushDisc(st, c, toMove);
    if (r < 0) continue;
    st.ply++;
    let val;
    const line = winLineThrough(st, c, r, discOf(toMove));
    if (line){
      /* the side that just moved won. From that mover's view it is a win;
         negamax scores relative to `toMove` at THIS node, so a win by
         `toMove` is a big positive here. Discount by remaining depth so a
         quicker mate is preferred. */
      val = WIN_SCORE - (100 - depth);
    } else {
      val = -negamax(st, 1 - toMove, me, depth - 1, -beta, -a, killer);
    }
    st.ply--;
    popDisc(st, c, r);

    if (val > best) best = val;
    if (val > a) a = val;
    if (a >= beta){ killer[depth] = c; break; }   /* cutoff: remember it  */
  }
  /* From `toMove`'s view. Return it as-is; the parent negates. */
  return best;
}

/* think(): the guard, then the search. Returns a column wrapped as a
   drop. Deterministic given (board, seat, lvl, seed); with aiJitter off
   it always takes the centremost of the top columns. */
function think(st, seat, lvl){
  if (st.done || seat !== st.turn) return null;
  lvl = Math.max(1, Math.min(3, lvl || st.lvl || 2));

  /* 1 — take an immediate win, always, at every level */
  const w = immediateWin(st, seat);
  if (w >= 0) return { t: 'drop', c: w };
  /* 2 — block an immediate loss, always, at every level */
  const b = immediateBlock(st, seat);
  if (b >= 0) return { t: 'drop', c: b };

  /* 3 — search. Score every open column and keep the best set. */
  const depth = depthOf(lvl);
  const killer = new Array(depth + 2).fill(null);
  let bestVal = -Infinity;
  const scored = [];
  for (let i = 0; i < COLS; i++){
    const c = CENTRE_ORDER[i];
    if (!colOpen(st, c)) continue;
    const r = pushDisc(st, c, seat);
    st.ply++;
    let val;
    const line = winLineThrough(st, c, r, discOf(seat));
    if (line){
      val = WIN_SCORE;                         /* handled by the guard, but safe */
    } else if (st.ply >= CELLS){
      val = 0;                                 /* this drop fills the board: draw */
    } else {
      val = -negamax(st, 1 - seat, seat, depth - 1, -Infinity, Infinity, killer);
    }
    st.ply--;
    popDisc(st, c, r);
    scored.push({ c, val });
    if (val > bestVal) bestVal = val;
  }
  if (!scored.length) return null;             /* no legal move (full board) */

  /* the columns the search rated best (within a hair, to fold float noise) */
  const EPS = 1e-6;
  const top = scored.filter(s => s.val >= bestVal - EPS).map(s => s.c);
  if (top.length === 1 || !st.aiJitter){
    /* deterministic: the centremost best column (CENTRE_ORDER earliest) */
    for (let i = 0; i < COLS; i++)
      if (top.indexOf(CENTRE_ORDER[i]) >= 0) return { t: 'drop', c: CENTRE_ORDER[i] };
    return { t: 'drop', c: top[0] };
  }
  /* variety: a deterministic hash of the position + seed picks among the
     equally-good columns — same on every phone with the same seed */
  const h = hash32([st.rs, st.ply, seat, lvl].concat(st.grid));
  return { t: 'drop', c: top[h % top.length] };
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — a move as flat byte fields, for js/mp.js's generic codec.
   A Connect 4 move is a single column 0..6, which is already one byte, so
   the wire is trivial: { t:'drop', c }. Anything else is refused, not
   truncated. There is no hidden state and no seed to smuggle — the board
   is shared and every phone derives the same result from the column
   alone, which is the whole reason this game is honest online.

   `e` is APPENDED, never inserted — positional, the js/battleship.js
   skin-byte pattern. It is the exclusive-set byte (1 = Neon Drop) that
   erbgha-ui.js hangs on a player's FIRST drop so the other phone can
   light that seat's discs. decWire deliberately does NOT return it: the
   engine never sees it — the UI reads it off the raw wire move before
   decoding. An older build's one-field list never decodes bit 1 and
   leaves the trailing value unused: the drop lands, the glow degrades
   to stock, nothing refuses. */
const WIRE_FIELDS = ['c', 'e'];
function encWire(mv){
  if (!mv || mv.t !== 'drop') return null;
  const c = mv.c | 0;
  if (c < 0 || c >= COLS) return null;
  return { t: 'drop', c };
}
function decWire(w){
  if (!w || w.t !== 'drop') return null;
  const c = w.c | 0;
  if (c < 0 || c >= COLS) return null;
  return { t: 'drop', c };
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — js/erbgha-ui.js and the test harness both read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_ERBGHA = root.KARTI_ERBGHA || {};
root.KARTI_ERBGHA.engine = {
  COLS, ROWS, CELLS, CONNECT, EMPTY, SEATS, MIN_SEATS, MAX_SEATS, LEVELS,
  discOf, seatOfDisc, levelOf, depthOf,
  newSeed, newGame,
  cell, colOpen, legal, turn, check, apply,
  winLineThrough, dropWins, over, note,
  immediateWin, immediateBlock, evaluate, think,
  encWire, decWire, WIRE_FIELDS,
  CENTRE_ORDER
};

})(typeof window !== 'undefined' ? window : globalThis);
