/* ═══════════════════════════════════════════════════════════════════
   KARTI — kaxxi.js
   IL-KAXXI — "PUNTINI U KAXXI" (dots & boxes), the classic pencil-and-
   paper game given a Maltese name. The pure engine: rules only, no DOM,
   no clock, and the ONE Math.random in this file lives in newSeed(),
   exactly the quarantine js/erbgha.js keeps. The screen half is
   js/kaxxi-ui.js and follows the same (opts, seed, log) runner shape.

   THE GAME
     A rectangular grid of dots. On your turn you draw ONE edge between
     two adjacent dots — horizontal or vertical. If your edge completes
     the FOURTH side of a 1×1 box, you CAPTURE that box (it is filled
     with your colour and your mark) AND YOU MOVE AGAIN. A single edge
     can close TWO boxes at once (the shared wall between them) — you
     take both and still move once more. If your edge closes no box,
     the turn passes to the next seat. Play ends when every edge is
     drawn; the player with the most boxes wins. Ties share the place.

     Perfect information, no randomness, turn based. Nothing is hidden
     and nothing is dealt, so ONLINE IS TRIVIALLY HONEST: every phone
     draws the same edges onto the identical board off the same move
     list and each derives the capture / extra-turn / whose-turn result
     the same way. The seed exists only so the machine breaks a tie the
     same way on every phone (below), and even that can be turned off.

   DETERMINISM
     A move is three small integers — dir (0=h,1=v), row, col — so the
     whole log is a string of edges and replaying it rebuilds any
     position exactly. The AI is a pure function of the position; its
     ONLY non-determinism is an optional tie-break among equally-good
     edges, hashed from a per-match seed so it is the same on every
     phone that shares the seed. Pass opts.aiJitter=false and the
     machine is fully deterministic.

   THE MACHINE — three strengths, and this game has real strategy:
       lvl 1  Greedy      takes any free box; else a "safe" edge (one
                          that does not hand a box away) chosen
                          deterministically; else gives away the
                          SMALLEST chain. Never draws the third side of
                          a box carelessly if a safe edge exists.
       lvl 2  Steady      greedy on free boxes, prefers safe edges, and
                          when forced to open, opens the smallest chain —
                          but does NOT keep control (no double-cross).
       lvl 3  Sharp       proper CHAIN STRATEGY. Completes free boxes,
                          avoids third sides, counts chains and applies
                          the LONG-CHAIN PARITY rule to choose which
                          chain to open, and in the endgame keeps control
                          with the DOUBLE-CROSS (all-but-two) sacrifice:
                          when eating a chain it leaves the last two boxes
                          for the opponent so they must open the next
                          chain. This is what lets a strong player keep
                          the long chains and beat a greedy one.

     The "take every free box" and "never draw a third side when a safe
     edge exists" rules are HARD GATES in front of any search, so no
     level ever wastes a free box or needlessly opens a chain when a
     neutral move is available. Only when EVERY remaining edge opens a
     chain does the chain logic decide which to sacrifice.

   COORDINATES
     boxRows × boxCols boxes. Dots form a (boxRows+1) × (boxCols+1)
     lattice. An edge is identified by { dir, r, c }:
       dir 0 (horizontal): the top edge of dot-row r, spanning cols
         c..c+1. r in 0..boxRows, c in 0..boxCols-1.
       dir 1 (vertical): the left edge of dot-col c, spanning rows
         r..r+1. r in 0..boxRows-1, c in 0..boxCols.
     Box (br,bc) has four edges:
       top    = {0, br,   bc}
       bottom = {0, br+1, bc}
       left   = {1, br,   bc}
       right  = {1, br,   bc+1}
     Seat 0 moves first; the UI decides who seat 0 is.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ── the ONE Math.random, quarantined ──────────────────────────────── */
function newSeed(){ return (Math.random() * 0x100000000) >>> 0; }

/* a tiny deterministic hash → uint32, used ONLY to pick between edges the
   machine rated identically. Same board, same seed, same choice, on every
   phone; never a clock, never Math.random. */
function hash32(list){
  let h = 2166136261;
  for (let i = 0; i < list.length; i++){
    h ^= (list[i] | 0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ═══════════════════════════════════════════════════════════════════
   BOARD SIZES — offered on the settings step. Rows/cols are BOXES.
   Default is Medium (5×5 boxes), comfortable on a phone. For 3–4
   players a bigger board gives everyone meaningful play, but the size
   is the host's choice, not forced by player count.
   ═══════════════════════════════════════════════════════════════════ */
const SIZES = [
  { id:'s', boxRows:4, boxCols:4, name:{ en:'Small',  mt:'Żgħir'  } },
  { id:'m', boxRows:5, boxCols:5, name:{ en:'Medium', mt:'Medju'  } },
  { id:'l', boxRows:6, boxCols:8, name:{ en:'Large',  mt:'Kbir'   } }
];
const sizeOf = id => SIZES.find(s => s.id === id) || SIZES[1];

/* ── seats: 2..4, seat 0 first ─────────────────────────────────────── */
const MIN_SEATS = 2, MAX_SEATS = 4;

/* ── the machine's strengths ───────────────────────────────────────── */
const LEVELS = [
  { k: 1, name: 'It-Tifel', icon: 'diff-1',
    note: { en: 'Grabs free boxes and plays safe — but gives no thought to chains.',
            mt: 'Jaqbad kaxxi bla ħlas u jilgħab bil-galbu — imma ma jaħsibx fil-katini.' } },
  { k: 2, name: 'Tal-Każin', icon: 'diff-2',
    note: { en: 'Safe play, and when forced to open it opens the smallest chain.',
            mt: 'Jilgħab bil-galbu, u meta jkun imġiegħel jiftaħ, jiftaħ l-iżgħar katina.' } },
  { k: 3, name: 'Il-Kampjun', icon: 'diff-3',
    note: { en: 'Counts the chains and keeps control with the double-cross. Hard.',
            mt: 'Jgħodd il-katini u jżomm il-kontroll bid-double-cross. Iebes.' } }
];
const levelOf = l => LEVELS.find(L => L.k === (l | 0)) || LEVELS[1];

/* ═══════════════════════════════════════════════════════════════════
   THE STATE
   opts: { seats, sizeId, lvl, aiJitter }
     seats   2..4 (default 2)
     sizeId  's' | 'm' | 'l' (default 'm')
     lvl     the machine's sharpness, 1..3 (a fallback; per-seat levels
             live in the UI's meta)
     aiJitter default true; false makes the machine fully deterministic
   ═══════════════════════════════════════════════════════════════════ */
function newGame(opts, seed){
  opts = opts || {};
  const size = sizeOf(opts.sizeId || 'm');
  const boxRows = size.boxRows, boxCols = size.boxCols;
  const seats = Math.max(MIN_SEATS, Math.min(MAX_SEATS, opts.seats | 0 || 2));

  /* edge storage: two flat bit arrays.
     H[r*boxCols + c]  horizontal edge, r in 0..boxRows, c in 0..boxCols-1
     V[r*(boxCols+1)+c] vertical edge, r in 0..boxRows-1, c in 0..boxCols
     0 = not drawn, 1 = drawn. */
  const nH = (boxRows + 1) * boxCols;
  const nV = boxRows * (boxCols + 1);

  const st = {
    v: 1,
    boxRows, boxCols, seats,
    sizeId: size.id,
    H: new Uint8Array(nH),
    V: new Uint8Array(nV),
    /* which seat owns each captured box, -1 = uncaptured. box(br,bc)=owner[br*boxCols+bc] */
    owner: new Int8Array(boxRows * boxCols).fill(-1),
    /* how many of the four sides of each box are drawn, 0..4 */
    sides: new Uint8Array(boxRows * boxCols),
    turn: 0,                    /* seat to move; seat 0 first             */
    scores: new Array(seats).fill(0),
    edgesLeft: nH + nV,         /* undrawn edges remaining                */
    boxesLeft: boxRows * boxCols,
    lvl: Math.max(1, Math.min(3, opts.lvl | 0 || 2)),
    aiJitter: opts.aiJitter === false ? false : true,
    rs: (seed == null ? 0 : (seed >>> 0)),
    done: null,                 /* {kind:'win', winners:[seat,…], scores} */
    last: null                  /* {dir,r,c,seat,captured:[{br,bc}…]}     */
  };
  return st;
}

/* ── indexing helpers ──────────────────────────────────────────────── */
const hIdx = (st, r, c) => r * st.boxCols + c;
const vIdx = (st, r, c) => r * (st.boxCols + 1) + c;
const bIdx = (st, br, bc) => br * st.boxCols + bc;

function hDrawn(st, r, c){
  if (r < 0 || r > st.boxRows || c < 0 || c >= st.boxCols) return true; /* off-board = "solid" */
  return st.H[hIdx(st, r, c)] === 1;
}
function vDrawn(st, r, c){
  if (r < 0 || r >= st.boxRows || c < 0 || c > st.boxCols) return true;
  return st.V[vIdx(st, r, c)] === 1;
}
/* is edge {dir,r,c} a valid, undrawn edge on this board? */
function edgeValid(st, dir, r, c){
  if (dir === 0){
    if (r < 0 || r > st.boxRows || c < 0 || c >= st.boxCols) return false;
    return st.H[hIdx(st, r, c)] === 0;
  } else {
    if (r < 0 || r >= st.boxRows || c < 0 || c > st.boxCols) return false;
    return st.V[vIdx(st, r, c)] === 0;
  }
}

/* the boxes an edge {dir,r,c} borders — one or two {br,bc}. Off-board
   sides are skipped, so a rim edge borders exactly one box. */
function boxesOfEdge(st, dir, r, c){
  const out = [];
  if (dir === 0){
    /* horizontal edge at dot-row r: the box above (br=r-1) and below (br=r) */
    if (r - 1 >= 0)          out.push({ br: r - 1, bc: c });
    if (r < st.boxRows)      out.push({ br: r,     bc: c });
  } else {
    /* vertical edge at dot-col c: the box left (bc=c-1) and right (bc=c) */
    if (c - 1 >= 0)          out.push({ br: r, bc: c - 1 });
    if (c < st.boxCols)      out.push({ br: r, bc: c });
  }
  return out;
}

/* how many of a box's four sides are currently drawn (reads the arrays) */
function sidesOfBox(st, br, bc){
  let n = 0;
  if (hDrawn(st, br,     bc)) n++;   /* top    */
  if (hDrawn(st, br + 1, bc)) n++;   /* bottom */
  if (vDrawn(st, br,     bc)) n++;   /* left   */
  if (vDrawn(st, br, bc + 1)) n++;   /* right  */
  return n;
}

/* ═══════════════════════════════════════════════════════════════════
   READING THE BOARD — the legal moves, whose turn, the verdict.
   ═══════════════════════════════════════════════════════════════════ */

/* every undrawn edge, as {t:'edge', dir, r, c}. A stable order (all
   horizontals row-major, then all verticals) so the AI and tests see the
   same sequence on every phone. */
function legal(st, seat){
  if (st.done) return [];
  if (seat != null && seat !== st.turn) return [];
  const out = [];
  for (let r = 0; r <= st.boxRows; r++)
    for (let c = 0; c < st.boxCols; c++)
      if (st.H[hIdx(st, r, c)] === 0) out.push({ t:'edge', dir:0, r, c });
  for (let r = 0; r < st.boxRows; r++)
    for (let c = 0; c <= st.boxCols; c++)
      if (st.V[vIdx(st, r, c)] === 0) out.push({ t:'edge', dir:1, r, c });
  return out;
}
function turn(st){ return st.done ? -1 : st.turn; }

/* ═══════════════════════════════════════════════════════════════════
   THE GATE — every move (thumb, machine, wire, replay) is measured here
   and nowhere else. An edge is legal iff it is that seat's turn, the
   game is live, and the edge is a real undrawn edge on this board.
   ═══════════════════════════════════════════════════════════════════ */
function check(st, mv, seat){
  if (!mv || st.done) return false;
  if (mv.t !== 'edge') return false;
  if (seat !== st.turn) return false;
  const dir = mv.dir | 0, r = mv.r | 0, c = mv.c | 0;
  if (dir !== 0 && dir !== 1) return false;
  return edgeValid(st, dir, r, c);
}

/* ═══════════════════════════════════════════════════════════════════
   APPLY — deterministic; the log replays through here. Draws the edge,
   captures any box it completes (0, 1 or 2), and either grants the same
   seat another turn (a box was captured) or passes to the next seat.
   Stamps the ending when the last edge is drawn.
   ═══════════════════════════════════════════════════════════════════ */
function nextSeat(st, seat){ return (seat + 1) % st.seats; }

function apply(st, mv){
  const seat = st.turn;
  const dir = mv.dir | 0, r = mv.r | 0, c = mv.c | 0;
  if (!edgeValid(st, dir, r, c)) return;         /* guarded by check(); safe */

  if (dir === 0) st.H[hIdx(st, r, c)] = 1;
  else           st.V[vIdx(st, r, c)] = 1;
  st.edgesLeft--;

  const touched = boxesOfEdge(st, dir, r, c);
  const captured = [];
  for (let i = 0; i < touched.length; i++){
    const b = touched[i];
    const s = sidesOfBox(st, b.br, b.bc);
    st.sides[bIdx(st, b.br, b.bc)] = s;
    if (s === 4 && st.owner[bIdx(st, b.br, b.bc)] < 0){
      st.owner[bIdx(st, b.br, b.bc)] = seat;
      st.scores[seat]++;
      st.boxesLeft--;
      captured.push({ br: b.br, bc: b.bc });
    }
  }
  st.last = { dir, r, c, seat, captured };

  if (st.edgesLeft <= 0){
    finishGame(st);
    return;
  }
  /* capture ⇒ move again; no capture ⇒ pass */
  if (captured.length === 0) st.turn = nextSeat(st, seat);
  /* else st.turn unchanged: the same seat moves again */
}

function finishGame(st){
  let best = -1;
  for (let s = 0; s < st.seats; s++) if (st.scores[s] > best) best = st.scores[s];
  const winners = [];
  for (let s = 0; s < st.seats; s++) if (st.scores[s] === best) winners.push(s);
  st.done = {
    kind: 'win',
    winners,                                 /* tie ⇒ more than one seat  */
    scores: st.scores.slice(),
    draw: winners.length > 1
  };
}

/* ═══════════════════════════════════════════════════════════════════
   OVER — the verdict, read straight off st.done. winners is a list of
   SEATS; the UI (which knows who owns each seat) decides whether one is
   you. On a solo winner winners=[seat]; on a tie winners has them all.
   ═══════════════════════════════════════════════════════════════════ */
function over(st){
  if (!st.done) return null;
  return {
    kind: st.done.kind,
    winners: st.done.winners.slice(),
    winner: st.done.winners.length === 1 ? st.done.winners[0] : -1,
    scores: st.done.scores.slice(),
    draw: !!st.done.draw
  };
}

/* a one-line status the UI can translate — {en,mt} ids, never bare English. */
function note(st){
  if (st.done){
    if (st.done.draw) return { en: 'A tie — the boxes split.', mt: 'Ndaqs — il-kaxxi nqasmu.' };
    return { en: 'All the boxes are taken.', mt: 'Il-kaxxi kollha ttieħdu.' };
  }
  return { en: 'Draw an edge.', mt: 'Iġbed xifer.' };
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE
   ───────────────────────────────────────────────────────────────────
   Dots & boxes strategy is about CHAINS, not lookahead depth. The three
   levels share the same two hard gates and differ only in how they pick
   when forced to open a chain, and whether they keep control.

   VOCABULARY (computed from the CURRENT board, no search):
     free box     a box with 3 sides drawn — the 4th side captures it.
     safe edge    an edge that leaves EVERY box it touches at ≤2 sides,
                  i.e. does not create a free box for the opponent.
     open a chain drawing the 3rd side of some box (hands a box away).
     chain        a maximal run of boxes connected through their shared
                  undrawn walls, where each box currently has exactly two
                  sides drawn (a "corridor"). Its length is the number of
                  boxes the opponent can eat in one visit.
     loop         a chain that closes on itself (even length, costs the
                  taker 4 boxes to keep control, not 2).

   THE GATES (all levels):
     1. If a free box exists, take it (complete a box, move again). This
        never wastes a capture and is always correct.
     2. Else if a SAFE edge exists, play one (never open a chain while a
        neutral move remains).
     3. Else every edge opens a chain: the OPENING decision (below).

   THE OPENING DECISION:
     lvl 1  open the SMALLEST chain, plainly (deterministic pick).
     lvl 2  open the smallest chain (same as lvl1 here — the difference
            shows in the eating phase, see below).
     lvl 3  LONG-CHAIN PARITY: count the long chains (length ≥ 3). The
            player who is forced to open the FIRST long chain usually
            loses control, and control is decided by parity of long
            chains vs. who moves. Sharp opens the smallest available
            chain too, but it eats differently.

   THE EATING DECISION (when a free box exists AND taking it would open
   the NEXT chain — i.e. you are midway through eating a chain):
     lvl 1 / lvl 2  always take every box (greedy) — so after eating a
                    chain they are forced to open the next one and hand
                    control to the opponent.
     lvl 3  DOUBLE-CROSS (all-but-two): when the chain you are eating is
            a long chain and there is more than one chain left, stop two
            boxes short and play the "hard-hearted handback" — draw the
            edge that declines the last two boxes and forces the opponent
            to open the next chain. On a loop, decline four. This is the
            single move that keeps control of the long chains, and it is
            what makes lvl 3 beat lvl 1/2 consistently.

   All three are PURE functions of the position; the only non-determinism
   is the seeded tie-break among equally-rated edges (aiJitter).
   ═══════════════════════════════════════════════════════════════════ */

/* would drawing edge {dir,r,c} complete at least one box right now? */
function edgeCaptures(st, dir, r, c){
  const bs = boxesOfEdge(st, dir, r, c);
  for (let i = 0; i < bs.length; i++)
    if (sidesOfBox(st, bs[i].br, bs[i].bc) === 3) return bs.length; /* how many it would take */
  return 0;
}
/* the number of boxes edge {dir,r,c} would capture immediately (0,1,2) */
function captureCount(st, dir, r, c){
  const bs = boxesOfEdge(st, dir, r, c);
  let n = 0;
  for (let i = 0; i < bs.length; i++)
    if (sidesOfBox(st, bs[i].br, bs[i].bc) === 3) n++;
  return n;
}
/* is edge {dir,r,c} SAFE — does it leave every box it touches at ≤2 sides?
   (drawing it must not create a 3-sided box for the opponent, and must
   not itself complete a box — that is the capture case handled first) */
function edgeSafe(st, dir, r, c){
  const bs = boxesOfEdge(st, dir, r, c);
  for (let i = 0; i < bs.length; i++){
    const s = sidesOfBox(st, bs[i].br, bs[i].bc);
    if (s >= 2) return false;   /* would become 3 (or complete) → unsafe   */
  }
  return true;
}

/* a canonical numeric key for an edge, for deterministic ordering */
function edgeKey(dir, r, c){ return (dir << 20) | (r << 10) | c; }
function edgeCmp(a, b){ return edgeKey(a.dir, a.r, a.c) - edgeKey(b.dir, b.r, b.c); }

/* list every currently-free box (3 sides drawn, uncaptured) and the edge
   that completes it */
function freeBoxEdges(st){
  const out = [];
  for (let br = 0; br < st.boxRows; br++){
    for (let bc = 0; bc < st.boxCols; bc++){
      if (st.owner[bIdx(st, br, bc)] >= 0) continue;
      if (sidesOfBox(st, br, bc) !== 3) continue;
      /* find the one undrawn side */
      let e = null;
      if (!hDrawn(st, br, bc))          e = { dir:0, r:br,     c:bc };
      else if (!hDrawn(st, br + 1, bc)) e = { dir:0, r:br + 1, c:bc };
      else if (!vDrawn(st, br, bc))     e = { dir:1, r:br,     c:bc };
      else if (!vDrawn(st, br, bc + 1)) e = { dir:1, r:br,     c:bc + 1 };
      if (e) out.push({ box:{ br, bc }, edge:e });
    }
  }
  return out;
}

/* ── CHAIN ANALYSIS ────────────────────────────────────────────────
   Build the graph of boxes, connecting two boxes through a shared
   UNDRAWN wall. We only walk boxes with ≤2 sides drawn (a box already
   captured or with 3 sides is a terminal). A connected run of boxes
   each having exactly two drawn sides, linked by their single shared
   open wall, is a "chain" or a "loop". This is used by lvl 3 to reason
   about which chain to open and when to double-cross.
   We identify chains among the boxes that are NOT yet capturable so the
   opener knows the cost of each opening. */

/* neighbours of box (br,bc) reachable through an UNDRAWN shared wall */
function openNeighbours(st, br, bc){
  const out = [];
  if (!hDrawn(st, br,     bc) && br - 1 >= 0)          out.push({ br: br - 1, bc });      /* up    */
  if (!hDrawn(st, br + 1, bc) && br + 1 < st.boxRows)  out.push({ br: br + 1, bc });      /* down  */
  if (!vDrawn(st, br,     bc) && bc - 1 >= 0)          out.push({ br, bc: bc - 1 });      /* left  */
  if (!vDrawn(st, br, bc + 1) && bc + 1 < st.boxCols)  out.push({ br, bc: bc + 1 });      /* right */
  return out;
}

/* Group all still-open boxes (owner<0) into connected components through
   undrawn walls. For each component classify it as a CHAIN (a path: every
   box has ≤2 open neighbours and at most two ends) or a LOOP, and give its
   length (box count). Boxes with 3 sides are excluded here — they are
   "free" and handled by the gate. Returns { chains:[{len,loop,boxes}] }. */
function analyseChains(st){
  const R = st.boxRows, C = st.boxCols;
  const seen = new Uint8Array(R * C);
  const comps = [];
  for (let br = 0; br < R; br++){
    for (let bc = 0; bc < C; bc++){
      const id = bIdx(st, br, bc);
      if (seen[id]) continue;
      if (st.owner[id] >= 0){ seen[id] = 1; continue; }
      if (sidesOfBox(st, br, bc) >= 3){ seen[id] = 1; continue; } /* free/terminal */
      /* flood fill this component */
      const stack = [{ br, bc }];
      seen[id] = 1;
      const boxes = [];
      let edgesInside = 0;
      while (stack.length){
        const b = stack.pop();
        boxes.push(b);
        const ns = openNeighbours(st, b.br, b.bc);
        for (let k = 0; k < ns.length; k++){
          const nid = bIdx(st, ns[k].br, ns[k].bc);
          if (st.owner[nid] >= 0) continue;
          if (sidesOfBox(st, ns[k].br, ns[k].bc) >= 3) continue;
          edgesInside++;
          if (!seen[nid]){ seen[nid] = 1; stack.push({ br: ns[k].br, bc: ns[k].bc }); }
        }
      }
      /* edgesInside double-counts each internal wall (once per endpoint) */
      const internal = edgesInside / 2;
      const loop = internal >= boxes.length && boxes.length >= 2; /* cycle */
      comps.push({ len: boxes.length, loop, boxes });
    }
  }
  return { chains: comps };
}

/* the smallest chain's length among components (used by lvl1/2 to open) */
function smallestOpening(st){
  const { chains } = analyseChains(st);
  let best = Infinity;
  for (const ch of chains) if (ch.len < best) best = ch.len;
  return best === Infinity ? 0 : best;
}

/* ═══════════════════════════════════════════════════════════════════
   THINK — the guard, then the level-specific choice. Returns an edge
   move {t:'edge',dir,r,c} or null if it is not seat's turn / game over.
   Deterministic given (board, seat, lvl, seed).

   TWO PHASES:
     · SAFE phase — some edge leaves every box it touches at ≤2 sides.
       No box is handed over. All levels simply play a safe edge (the
       seeded tie-break gives variety). Who runs OUT of safe edges first
       is decided by the neutral-move parity, which no heuristic changes.
     · CHAIN phase — a free box exists, or every remaining edge opens a
       chain. THIS is where the game is won or lost, and where the levels
       differ. lvl 3 runs an exact recursive solver over the chain moves
       (take vs. double-cross vs. which chain to open) and maximises its
       net box lead; lvl 1/2 eat greedily and open the smallest chain,
       which loses control against a solver.
   ═══════════════════════════════════════════════════════════════════ */
function think(st, seat, lvl){
  if (st.done || seat !== st.turn) return null;
  lvl = Math.max(1, Math.min(3, lvl || st.lvl || 2));

  const frees = freeBoxEdges(st);
  const all = legal(st, seat);
  const safe = all.filter(m => edgeSafe(st, m.dir, m.r, m.c));

  /* ── SAFE phase (only when there is nothing free to take) ────────── */
  if (!frees.length && safe.length){
    return pickSeeded(st, seat, lvl, safe);
  }

  /* ── CHAIN phase ─────────────────────────────────────────────────
     The exact endgame SOLVER is the source of real strength. Both lvl 2
     and lvl 3 use it, but with different reach:
       lvl 2  solves only SMALL endgames (few edges / boxes left). Beyond
              that it eats greedily and opens the smallest chain — so it
              converts the last few boxes correctly but does not keep
              long-range control.
       lvl 3  solves LARGER endgames, and beyond the cap uses the
              double-cross HEURISTIC to keep control on a big board.
     lvl 1 never solves — pure greedy — and is the weakest.
     Each cap keeps a move well under a phone frame. */
  if (lvl >= 2){
    const cap = (lvl >= 3)
      ? (st.edgesLeft <= SOLVE_EDGE_CAP && st.boxesLeft <= SOLVE_BOX_CAP)
      : (st.edgesLeft <= SOLVE_EDGE_CAP_L2 && st.boxesLeft <= SOLVE_BOX_CAP_L2);
    if (cap){
      solveNodes = 0;
      const best = solveChain(st, seat, 0);
      if (best && best.move && solveNodes < SOLVE_NODE_CAP)
        return { t:'edge', dir:best.move.dir, r:best.move.r, c:best.move.c };
      /* budget blown or bailed → fall through to the heuristic */
    }
    if (lvl >= 3 && frees.length){
      /* HEURISTIC lvl 3 beyond the solver cap: double-cross to keep control. */
      const dc = doubleCrossMove(st, seat);
      if (dc) return dc;
    }
    /* else fall through to the greedy eater / smallest-chain opener below */
  }

  /* GREEDY eater + smallest-chain opener — the fallback for lvl 1 always,
     and for lvl 2 / lvl 3 above their solver cap (lvl 3 having first tried
     the double-cross heuristic). */
  if (frees.length){
    /* dedupe capturing edges; prefer a double capture (never split a domino) */
    const capMap = {};
    for (const f of frees) capMap[edgeKey(f.edge.dir, f.edge.r, f.edge.c)] = f.edge;
    const capEdges = Object.keys(capMap).map(k => capMap[k]);
    for (const e of capEdges) if (captureCount(st, e.dir, e.r, e.c) === 2)
      return { t:'edge', dir:e.dir, r:e.r, c:e.c };
    capEdges.sort(edgeCmp);
    const e = capEdges[0];
    return { t:'edge', dir:e.dir, r:e.r, c:e.c };
  }
  /* must open — smallest chain */
  let best = Infinity; const scored = [];
  for (const m of all){ const sz = openingCost(st, m.dir, m.r, m.c); scored.push({ m, sz }); if (sz < best) best = sz; }
  const set = scored.filter(s => s.sz === best).map(s => s.m);
  return pickSeeded(st, seat, lvl, set.length ? set : all);
}

/* ═══════════════════════════════════════════════════════════════════
   THE CHAIN SOLVER (lvl 3) — an exact negamax over the endgame, scored
   in NET BOXES (my captures minus everyone else's, from `root`'s view).
   Branching is tiny because we only ever consider a handful of moves at
   each node:
     · every distinct CAPTURING edge (take a free box / domino), AND
     · for the box currently being eaten, the DOUBLE-CROSS handback that
       declines the last two (or, on a loop, the last four) — the move
       that keeps control, AND
     · when nothing is free, one representative OPENING edge per distinct
       chain/loop (open the short end), because opening two chains of the
       same length is equivalent.
   Depth is bounded by the boxes remaining, and the safe phase never
   reaches here, so the tree stays small (endgame only). Two players are
   scored me-vs-them; for 3–4 players the same recursion scores
   me-vs-best-other, which still drives control correctly.
   ═══════════════════════════════════════════════════════════════════ */
/* the exact solver runs only in a small endgame; above these caps lvl 3
   uses its heuristic. Tuned so the worst case stays a few ms on a phone. */
const SOLVE_EDGE_CAP = 26;   /* undrawn edges left (lvl 3) */
const SOLVE_BOX_CAP  = 16;   /* boxes left          (lvl 3) */
const SOLVE_EDGE_CAP_L2 = 14;/* lvl 2 solves only smaller endgames */
const SOLVE_BOX_CAP_L2  = 9;
const SOLVE_NODE_CAP = 120000;
let solveNodes = 0;

function solveChain(st, root, depth){
  const r = negChain(st, depth);
  return { val: r.val, move: r.move };
}
/* NEGAMAX over the chain endgame. Returns { val, move } where `val` is the
   net box lead (side-to-move's boxes − the other side's boxes) that the
   side to move can guarantee from here under optimal play. Because a capture
   grants the SAME seat another move, we do not blindly negate: after a move
   we look at whose turn it now is. If the turn stayed with the mover we add
   the child's value directly (same perspective); if it passed to the other
   side we subtract it (their gain is our loss, 2-seat zero-sum). The base
   score at a terminal is read from the final box scores. This exactly models
   "take vs. double-cross vs. which chain to open" for two sides; for 3–4
   players it treats "the field" as one opponent, which still keeps the
   control/parity play correct. */
function negChain(st, depth){
  if (st.done || depth > 240 || ++solveNodes > SOLVE_NODE_CAP){
    return { val: leafNet(st, st.done ? -1 : st.turn), move: null };
  }
  const mover = st.turn;
  const cands = chainCandidates(st, mover);
  if (!cands.length){
    const any = legal(st, mover);
    if (!any.length) return { val: leafNet(st, mover), move: null };
    cands.push(any[0]);
  }
  let bestVal = -Infinity, bestMove = null;
  for (const mv of cands){
    const snap = snapForSolve(st);
    const gained = st.scores[mover] || 0;
    applyForSolve(st, mv);
    const stillMine = (!st.done && st.turn === mover);
    const got = (st.scores[mover] || 0) - gained;    /* boxes this edge took */
    const child = negChain(st, depth + 1);
    /* child.val is from the NEW side-to-move's perspective. If that is still
       me, it already includes my future boxes: my net = got + child.val.
       If it passed to the opponent, my net = got − child.val. At a terminal
       the child returns the final net for whoever's "turn" it is; leafNet is
       written to always report from the mover we ask about. */
    let val;
    if (st.done){
      /* the move ended the game: net is simply my final lead */
      val = leafNet(st, mover);
    } else if (stillMine){
      val = got + child.val;
    } else {
      val = got - child.val;
    }
    restoreForSolve(st, snap);
    if (val > bestVal){ bestVal = val; bestMove = mv; }
  }
  return { val: bestVal, move: bestMove };
}
/* net box lead for `seat` (its boxes − best other). seat<0 (game over from
   nobody's turn) falls back to seat 0's lead, but callers pass a real seat. */
function leafNet(st, seat){
  if (seat < 0) seat = 0;
  let mine = st.scores[seat] || 0, other = -Infinity;
  for (let s = 0; s < st.seats; s++) if (s !== seat && st.scores[s] > other) other = st.scores[s];
  if (other === -Infinity) other = 0;
  return mine - other;
}

/* the chain-phase candidate moves for the side to move */
function chainCandidates(st, seat){
  const out = [];
  const seen = {};
  function add(e){ const k = edgeKey(e.dir, e.r, e.c); if (!seen[k]){ seen[k] = 1; out.push({ t:'edge', dir:e.dir, r:e.r, c:e.c }); } }

  const frees = freeBoxEdges(st);
  if (frees.length){
    /* the greedy TAKE(s): prefer a double capture, else one single-capture edge */
    const capMap = {};
    for (const f of frees) capMap[edgeKey(f.edge.dir, f.edge.r, f.edge.c)] = f.edge;
    const capEdges = Object.keys(capMap).map(k => capMap[k]);
    let dbl = null;
    for (const e of capEdges){ if (captureCount(st, e.dir, e.r, e.c) === 2){ dbl = e; break; } }
    if (dbl) add(dbl);
    else { capEdges.sort(edgeCmp); add(capEdges[0]); }

    /* the DOUBLE-CROSS handback(s) that decline the last two of a chain */
    for (const f of frees){
      const hb = handbackEdge(st, f.box.br, f.box.bc);
      if (hb) add(hb);
    }
    return out;
  }

  /* nothing free: one OPENING edge per distinct chain size — open the short
     end of each chain, and a middle-cut of each loop, so the search sees the
     meaningfully-different openings without exploding. */
  const { chains } = analyseChains(st);
  const bySize = {};
  const all = legal(st, seat);
  for (const m of all){
    const cost = openingCost(st, m.dir, m.r, m.c);
    const key = cost + (opensLoop(st, m) ? 'L' : 'C');
    if (!bySize[key]){ bySize[key] = 1; add(m); }
  }
  if (!out.length && all.length) add(all[0]);
  return out;
}
/* does this opening edge cut into a loop? (a box whose component is a loop) */
function opensLoop(st, m){
  const bs = boxesOfEdge(st, m.dir, m.r, m.c);
  for (const b of bs){
    if (sidesOfBox(st, b.br, b.bc) === 2){
      const { chains } = analyseChains(st);
      for (const ch of chains) if (ch.loop && ch.boxes.some(x => x.br === b.br && x.bc === b.bc)) return true;
    }
  }
  return false;
}

/* make/unmake for the solver — snapshot the mutable fields, apply a move
   through the SAME engine apply() (so capture / extra-turn / turn logic is
   identical to real play), then restore. */
function snapForSolve(st){
  return {
    H: st.H.slice(), V: st.V.slice(), owner: st.owner.slice(), sides: st.sides.slice(),
    scores: st.scores.slice(), turn: st.turn, edgesLeft: st.edgesLeft,
    boxesLeft: st.boxesLeft, done: st.done, last: st.last
  };
}
function applyForSolve(st, mv){ apply(st, mv); }
function restoreForSolve(st, s){
  st.H.set(s.H); st.V.set(s.V); st.owner.set(s.owner); st.sides.set(s.sides);
  st.scores = s.scores; st.turn = s.turn; st.edgesLeft = s.edgesLeft;
  st.boxesLeft = s.boxesLeft; st.done = s.done; st.last = s.last;
}

/* the size of the smallest chain an opening edge exposes — the number of
   boxes the opponent can immediately run off after this edge is drawn. */
function openingCost(st, dir, r, c){
  const bs = boxesOfEdge(st, dir, r, c);
  let cost = Infinity;
  for (const b of bs){
    const s = sidesOfBox(st, b.br, b.bc);
    if (s === 2){ const sz = componentSizeThrough(st, b.br, b.bc); if (sz < cost) cost = sz; }
  }
  return cost === Infinity ? 1 : cost;
}
/* size of the open component containing box (br,bc) */
function componentSizeThrough(st, br, bc){
  const seen = {}; const stack = [{ br, bc }]; seen[bIdx(st, br, bc)] = 1; let n = 0;
  while (stack.length){
    const b = stack.pop();
    if (st.owner[bIdx(st, b.br, b.bc)] >= 0) continue;
    n++;
    const ns = openNeighbours(st, b.br, b.bc);
    for (const nb of ns){ const id = bIdx(st, nb.br, nb.bc); if (seen[id] || st.owner[id] >= 0) continue; seen[id] = 1; stack.push(nb); }
  }
  return n;
}

/* ── THE DOUBLE-CROSS handback ──────────────────────────────────────
   Given a free box at a chain head, the "all-but-two" move: draw the FAR
   wall of the next corridor box, sealing a clean 2-box domino for the
   opponent and declining to take, so the opponent is forced to open the
   next chain. Returns the handback edge, or null when no clean domino
   hand-back exists here (e.g. the chain is a single box, or the far side
   leads on into more boxes). The SOLVER decides whether playing it is
   actually best — this only offers it as a candidate. */
function handbackEdge(st, br, bc){
  let open = null;
  if (!hDrawn(st, br, bc))          open = { dir:0, r:br,     c:bc,     nbr: br - 1, nbc: bc };
  else if (!hDrawn(st, br + 1, bc)) open = { dir:0, r:br + 1, c:bc,     nbr: br + 1, nbc: bc };
  else if (!vDrawn(st, br, bc))     open = { dir:1, r:br,     c:bc,     nbr: br,     nbc: bc - 1 };
  else if (!vDrawn(st, br, bc + 1)) open = { dir:1, r:br,     c:bc + 1, nbr: br,     nbc: bc + 1 };
  if (!open) return null;
  const nbr = open.nbr, nbc = open.nbc;
  if (nbr < 0 || nbr >= st.boxRows || nbc < 0 || nbc >= st.boxCols) return null;
  if (st.owner[bIdx(st, nbr, nbc)] >= 0) return null;
  if (sidesOfBox(st, nbr, nbc) !== 2) return null;
  const nOpen = [];
  if (!hDrawn(st, nbr, nbc))     nOpen.push({ dir:0, r:nbr,     c:nbc,     f:{ br: nbr - 1, bc: nbc } });
  if (!hDrawn(st, nbr + 1, nbc)) nOpen.push({ dir:0, r:nbr + 1, c:nbc,     f:{ br: nbr + 1, bc: nbc } });
  if (!vDrawn(st, nbr, nbc))     nOpen.push({ dir:1, r:nbr,     c:nbc,     f:{ br: nbr, bc: nbc - 1 } });
  if (!vDrawn(st, nbr, nbc + 1)) nOpen.push({ dir:1, r:nbr,     c:nbc + 1, f:{ br: nbr, bc: nbc + 1 } });
  if (nOpen.length !== 2) return null;
  let far = null;
  for (const w of nOpen){ if (w.dir === open.dir && w.r === open.r && w.c === open.c) continue; far = w; }
  if (!far) return null;
  const fbr = far.f.br, fbc = far.f.bc;
  const deadEnd = (fbr < 0 || fbr >= st.boxRows || fbc < 0 || fbc >= st.boxCols) ||
                  (st.owner[bIdx(st, fbr, fbc)] >= 0) || (sidesOfBox(st, fbr, fbc) >= 3);
  if (!deadEnd) return null;
  if (captureCount(st, far.dir, far.r, far.c) > 0) return null;
  return { dir: far.dir, r: far.r, c: far.c };
}
/* kept for the public face / tests: does a double-cross candidate exist? */
function doubleCrossMove(st, seat){
  if (st.turn !== seat) return null;
  const frees = freeBoxEdges(st);
  if (!frees.length) return null;
  if (st.boxesLeft <= 2) return null;
  for (const f of frees){
    const chainLen = componentSizeThrough(st, f.box.br, f.box.bc);
    if (chainLen < 2) continue;
    if (st.boxesLeft - chainLen < 1) continue;      /* last chain → just eat */
    const hb = handbackEdge(st, f.box.br, f.box.bc);
    if (hb) return { t:'edge', dir:hb.dir, r:hb.r, c:hb.c };
  }
  return null;
}

/* deterministic pick among equally-rated edges. aiJitter off → smallest
   edge key; on → a seeded hash over the position (same on every phone). */
function pickSeeded(st, seat, lvl, set){
  if (!set.length) return null;
  const arr = set.slice().sort(edgeCmp);
  if (arr.length === 1 || !st.aiJitter){
    const e = arr[0]; return { t:'edge', dir:e.dir, r:e.r, c:e.c };
  }
  const key = [st.rs, seat, lvl, st.edgesLeft];
  for (let i = 0; i < st.H.length; i++) key.push(st.H[i]);
  for (let i = 0; i < st.V.length; i++) key.push(st.V[i]);
  const h = hash32(key);
  const e = arr[h % arr.length];
  return { t:'edge', dir:e.dir, r:e.r, c:e.c };
}


/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — a move as flat fields, for js/mp.js's generic codec. An
   edge is three small integers, already bytes. No hidden state, no seed
   to smuggle: the board is shared and every phone derives the same
   capture / turn result from (dir,r,c) alone.
   ═══════════════════════════════════════════════════════════════════ */
const WIRE_FIELDS = ['dir', 'r', 'c'];
function encWire(mv){
  if (!mv || mv.t !== 'edge') return null;
  const dir = mv.dir | 0, r = mv.r | 0, c = mv.c | 0;
  if (dir !== 0 && dir !== 1) return null;
  if (r < 0 || c < 0 || r > 63 || c > 63) return null;
  return { t:'edge', dir, r, c };
}
function decWire(w){
  if (!w || w.t !== 'edge') return null;
  const dir = w.dir | 0, r = w.r | 0, c = w.c | 0;
  if (dir !== 0 && dir !== 1) return null;
  if (r < 0 || c < 0) return null;
  return { t:'edge', dir, r, c };
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — js/kaxxi-ui.js and the test harness both read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_KAXXI = root.KARTI_KAXXI || {};
root.KARTI_KAXXI.engine = {
  MIN_SEATS, MAX_SEATS, SIZES, LEVELS, sizeOf, levelOf,
  newSeed, newGame,
  hIdx, vIdx, bIdx, hDrawn, vDrawn, edgeValid, boxesOfEdge, sidesOfBox,
  legal, turn, check, apply, nextSeat, over, note,
  captureCount, edgeSafe, edgeCaptures, freeBoxEdges, analyseChains,
  componentSizeThrough, smallestOpening,
  think, doubleCrossMove, handbackEdge,
  encWire, decWire, WIRE_FIELDS
};

})(typeof window !== 'undefined' ? window : globalThis);
