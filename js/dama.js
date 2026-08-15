/* ═══════════════════════════════════════════════════════════════════
   KARTI — dama.js   ·   PARTY GAMES: DAMA

   Draughts, 8x8, English rules — the game everybody in Malta calls
   dama and everybody plays slightly wrong. This one plays it right:

     · twelve stones each, on the dark squares only
     · men step one square diagonally FORWARD
     · TAKING IS COMPULSORY. If a jump exists you take, and the app
       will not let you do anything else
     · a jump that can continue MUST continue — the whole chain is one
       move, and you cannot stop halfway because you fancy the view
     · reach the far row and you are crowned. A king moves and takes
       backwards as well as forwards
     · crowning ENDS the move. A man that jumps into the back row is
       kinged and sits down, even if the new king could jump again.
       That is the English rule and it is the one people argue about
     · run out of legal moves — no stones, or every one of them boxed
       in — and you have lost. Nothing to do with who has more men

   Draws: forty moves each without a capture and without a man moving,
   or the same position three times over.

   Board indexing is identical to js/chess.js: index = r*8+f, row 0 at
   the top. A square is playable when (file + row) is odd, which is the
   same set as the dark squares of a chessboard with a1 dark.

   Pieces: 1 white man, 2 white king, 9 black man, 10 black king.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const P = window.KARTI_PARTY;
if (!P) return;
const K = window.KARTI;
const U = P.ui, esc = U.esc, ico = U.ico;

/* ═══════════════════════════════════════════════════════════════════
   1. THE ENGINE
   ═══════════════════════════════════════════════════════════════════ */
const MAN = 1, KING = 2, BLACK = 8;
const WM = 1, WK = 2, BM = 9, BK = 10;

const typ  = p => p & 7;
const isBk = p => (p & BLACK) !== 0;
const FILE = i => i & 7;
const RANK = i => i >> 3;
const SQ   = (f, r) => r * 8 + f;
const NAME = i => 'abcdefgh'[FILE(i)] + (8 - RANK(i));
const FROM_NAME = s => SQ('abcdefgh'.indexOf(s[0]), 8 - parseInt(s[1], 10));
const playable = i => ((FILE(i) + RANK(i)) & 1) === 1;

const D4 = [[-1,-1],[1,-1],[-1,1],[1,1]];
const D_W = [[-1,-1],[1,-1]];        /* white walks up the board  */
const D_B = [[-1,1],[1,1]];          /* black walks down          */

const QUIET_DRAW = 80;               /* 40 moves each, no capture, no man moved */

function startPos(){
  const b = new Int8Array(64);
  for (let i = 0; i < 64; i++){
    if (!playable(i)) continue;
    const r = RANK(i);
    if (r <= 2) b[i] = BM;
    else if (r >= 5) b[i] = WM;
  }
  return { b, black:false, quiet:0 };
}
function clone(st){ return { b: st.b.slice(), black: st.black, quiet: st.quiet }; }
function posKey(st){
  let s = '';
  for (let i = 0; i < 64; i++) s += st.b[i];
  return s + (st.black ? 'b' : 'w');
}
/* a compact text board, for tests and for saying what happened out loud:
   '.' empty, 'w'/'b' men, 'W'/'B' kings, read from row 0 down */
function toText(st){
  let out = '';
  for (let r = 0; r < 8; r++){
    for (let f = 0; f < 8; f++){
      const p = st.b[SQ(f, r)];
      out += p === WM ? 'w' : p === WK ? 'W' : p === BM ? 'b' : p === BK ? 'B' : '.';
    }
    out += '\n';
  }
  return out;
}
function fromText(text, black){
  const b = new Int8Array(64);
  const rows = String(text).trim().split('\n').map(s => s.replace(/\s/g, ''));
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++){
      const c = (rows[r] || '')[f];
      b[SQ(f, r)] = c === 'w' ? WM : c === 'W' ? WK : c === 'b' ? BM : c === 'B' ? BK : 0;
    }
  return { b, black: !!black, quiet:0 };
}

function dirsFor(p){
  return typ(p) === KING ? D4 : (isBk(p) ? D_B : D_W);
}

/* ── jumps ─────────────────────────────────────────────────────────
   Depth-first over the board itself: a jump is applied, recursed on,
   then taken back. A captured stone is lifted at once and cannot be
   jumped a second time in the same chain — that falls out of removing
   it from the board rather than from keeping a list.

   A sequence is only emitted when it CANNOT go further. That is what
   makes finishing a multi-jump compulsory: half a chain is not a move,
   it does not exist. */
function jumpsFrom(b, cur, p, path, caps, out){
  let went = false;
  const f = FILE(cur), r = RANK(cur), black = isBk(p), king = typ(p) === KING;
  for (const [df, dr] of dirsFor(p)){
    const mf = f + df, mr = r + dr, lf = f + 2 * df, lr = r + 2 * dr;
    if (lf < 0 || lf > 7 || lr < 0 || lr > 7) continue;
    const mid = SQ(mf, mr), land = SQ(lf, lr);
    const q = b[mid];
    if (!q || isBk(q) === black) continue;     /* must be an enemy stone */
    if (b[land]) continue;                      /* and a clear place to land */
    went = true;

    const crown = !king && lr === (black ? 7 : 0);
    const np = crown ? (black ? BK : WK) : p;
    b[cur] = 0; b[mid] = 0; b[land] = np;
    path.push(land); caps.push(mid);

    if (crown){
      /* crowned mid-chain: English rules stop the move dead here */
      out.push({ path: path.slice(), caps: caps.slice() });
    } else if (!jumpsFrom(b, land, np, path, caps, out)){
      out.push({ path: path.slice(), caps: caps.slice() });
    }

    path.pop(); caps.pop();
    b[land] = 0; b[mid] = q; b[cur] = p;
  }
  return went;
}

function genJumps(st){
  const out = [], b = st.b;
  for (let i = 0; i < 64; i++){
    const p = b[i];
    if (!p || isBk(p) !== st.black) continue;
    jumpsFrom(b, i, p, [i], [], out);
  }
  return out;
}
function genSteps(st){
  const out = [], b = st.b;
  for (let i = 0; i < 64; i++){
    const p = b[i];
    if (!p || isBk(p) !== st.black) continue;
    const f = FILE(i), r = RANK(i);
    for (const [df, dr] of dirsFor(p)){
      const nf = f + df, nr = r + dr;
      if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
      const to = SQ(nf, nr);
      if (!b[to]) out.push({ path:[i, to], caps:[] });
    }
  }
  return out;
}
/* THE forced-capture rule, in one line: if there is a jump anywhere,
   nothing else is a move. */
function genMoves(st){
  const j = genJumps(st);
  return j.length ? j : genSteps(st);
}

function applied(st, m){
  const n = clone(st);
  const from = m.path[0], to = m.path[m.path.length - 1];
  const p = n.b[from];
  n.b[from] = 0;
  for (const c of m.caps) n.b[c] = 0;
  const black = isBk(p);
  const crowned = typ(p) === MAN && RANK(to) === (black ? 7 : 0);
  n.b[to] = crowned ? (black ? BK : WK) : p;
  /* the draw clock: reset by a capture or by a MAN moving. Two kings
     shuffling about forever is exactly what it is there to stop. */
  n.quiet = (m.caps.length || typ(p) === MAN) ? 0 : n.quiet + 1;
  n.black = !n.black;
  n.crowned = crowned && typ(p) === MAN;
  return n;
}

function counts(b){
  const c = { wm:0, wk:0, bm:0, bk:0 };
  for (let i = 0; i < 64; i++){
    const p = b[i];
    if (p === WM) c.wm++; else if (p === WK) c.wk++;
    else if (p === BM) c.bm++; else if (p === BK) c.bk++;
  }
  return c;
}

function status(st, reps){
  const moves = genMoves(st);
  /* No move = you have lost. Not "fewest stones", not "most kings" —
     boxed in with twelve men on the board is still a loss. */
  if (!moves.length) return { end:'blocked', win: st.black ? 'w' : 'b', moves };
  if (st.quiet >= QUIET_DRAW) return { end:'quiet',  win:null, moves };
  if ((reps || 0) >= 3)       return { end:'repeat', win:null, moves };
  return { end:null, win:null, moves };
}

/* human-readable move, the way a draughts board is written:
   11-15 for a step, 23x14x7 for a chain */
function notate(m){
  return m.path.map(NAME).join(m.caps.length ? 'x' : '-');
}

/* ═══════════════════════════════════════════════════════════════════
   2. THE OPPONENT
   Branching here is tiny — usually under ten moves, and one when a
   take is forced — so plain negamax goes deep without any tricks.
   ═══════════════════════════════════════════════════════════════════ */
const V_MAN = 100, V_KING = 175;
/* a man is worth more the closer it gets to the back row, and stones
   sitting on your OWN back row are worth a little because they stop
   the other side crowning. Edges are safe but useless; the middle is
   where games are won. */
const ADV = [0, 2, 5, 9, 14, 20, 28, 0];

function evaluate(st){
  const b = st.b;
  let s = 0, wn = 0, bn = 0;
  for (let i = 0; i < 64; i++){
    const p = b[i]; if (!p) continue;
    const black = isBk(p), king = typ(p) === KING;
    let v = king ? V_KING : V_MAN;
    if (!king) v += ADV[black ? RANK(i) : 7 - RANK(i)];
    const f = FILE(i);
    if (f === 0 || f === 7) v -= 4;                 /* stuck on the rail */
    else if (f >= 2 && f <= 5) v += 3;
    if (!black && RANK(i) === 7) v += 6;            /* home row guard */
    if (black && RANK(i) === 0) v += 6;
    if (black){ s -= v; bn++; } else { s += v; wn++; }
  }
  /* when you are ahead, trade down; when behind, keep the board busy */
  if (wn !== bn) s += (wn - bn) * 8 * (24 - wn - bn) / 24;
  return st.black ? -s : s;
}

const WIN = 90000;
let dNodes = 0, dDeadline = 0, dAborted = false;

function order(moves){
  for (const m of moves) m._s = m.caps.length * 100 + (m.path.length > 2 ? 10 : 0);
  moves.sort((a, b) => b._s - a._s);
  return moves;
}

function search(st, depth, alpha, beta, ply){
  dNodes++;
  if ((dNodes & 511) === 0 && Date.now() > dDeadline){ dAborted = true; return alpha; }
  const moves = genMoves(st);
  if (!moves.length) return -WIN + ply;          /* boxed in: I have lost */
  if (st.quiet >= QUIET_DRAW) return 0;
  /* a forced single capture costs nothing to follow, so do not spend a
     ply on it — that is what keeps this thing sharp in a jump-fest */
  if (depth <= 0 && !(moves.length === 1 && moves[0].caps.length)) return evaluate(st);
  order(moves);
  let best = -Infinity;
  for (const m of moves){
    const v = -search(applied(st, m), depth - 1, -beta, -alpha, ply + 1);
    if (dAborted) return best === -Infinity ? alpha : best;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

const LEVELS = {
  1: { depth:2, ms:120,  noise:45 },
  2: { depth:5, ms:600,  noise:12 },
  3: { depth:9, ms:1000, noise:0  }
};

function bestMove(st, level){
  const L = LEVELS[level] || LEVELS[2];
  const root = genMoves(st);
  if (!root.length) return null;
  if (root.length === 1) return root[0];       /* forced: no thinking needed */
  dNodes = 0; dAborted = false;
  dDeadline = Date.now() + L.ms;
  let best = root[0];

  for (let d = 1; d <= L.depth; d++){
    let localBest = null, localScore = -Infinity;
    for (const m of root){
      /* full window at the root — same reason as in js/chess.js: the
         difficulty wobble must be added to a real score, never to an
         alpha-beta bound */
      let v = -search(applied(st, m), d - 1, -Infinity, Infinity, 1);
      if (dAborted) break;
      if (L.noise && Math.abs(v) < WIN - 1000)
        v += Math.floor((Math.random() * 2 - 1) * L.noise);
      if (v > localScore){ localScore = v; localBest = m; }
    }
    if (localBest && !dAborted) best = localBest;
    if (dAborted || Date.now() > dDeadline) break;
    if (localScore > WIN - 1000) break;
  }
  return best;
}

const ENGINE = {
  WM, WK, BM, BK, MAN, KING, BLACK,
  typ, isBk, FILE, RANK, SQ, NAME, FROM_NAME, playable,
  startPos, clone, posKey, toText, fromText, applied, counts,
  genJumps, genSteps, genMoves, status, notate, evaluate, bestMove, LEVELS,
  QUIET_DRAW
};

/* ═══════════════════════════════════════════════════════════════════
   3. THE GAME ON SCREEN
   ═══════════════════════════════════════════════════════════════════ */
const QUIP_WIN = [
  'Twelve stones, no cards, no excuses. That one counts.',
  'Somebody put the kettle on, the champion is not moving.',
  'You boxed it in. It has nothing to say for itself.'
];
const QUIP_LOSE = [
  'It took three in one go. You saw it coming and went anyway.',
  'That is what a forced take does to a man.',
  'It will be here tomorrow. So will the same trap.'
];
const QUIP_DRAW = [
  'Two kings going round and round. Somebody had to call it.',
  'Nobody won. Nobody is admitting that either.',
  'Forty moves and not one stone taken. That is not dama, that is a queue.'
];
const pick = a => a[Math.floor(Math.random() * a.length)];

let G = null;

function newGame(opts){
  G = {
    mode: opts.mode, level: +opts.level || 2,
    human: opts.side === 'b' ? 'b' : 'w',
    st: startPos(),
    hist: [], keys: {},
    sel: -1, marks: [], chain: null, last: null, lastText: '',
    over: null, thinking: false, ctx: null, dead: false
  };
  G.keys[posKey(G.st)] = 1;
  paint();
  maybeAI();
}

function flipped(){ return G.mode === 'ai' && G.human === 'b'; }
function sqAt(row, col){ return flipped() ? SQ(7 - col, 7 - row) : SQ(col, row); }

function paint(){
  const ctx = P.ui.frame({
    title: 'Dama',
    onBack: () => { leave(); P.hub(); },
    leave,
    buttons: [
      { id:'dm-undo',   label:'Undo',   icon:'refresh' },
      { id:'dm-resign', label:'Resign', icon:'flag' },
      { id:'dm-new',    label:'New',    icon:'play' }
    ]
  });
  G.ctx = ctx;
  const board = ctx.board;
  board.innerHTML = '';
  G.cells = [];
  for (let row = 0; row < 8; row++){
    for (let col = 0; col < 8; col++){
      const i = sqAt(row, col);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pt-sq' + (playable(i) ? ' d' : '');
      b.dataset.i = i;
      if (!playable(i)) b.disabled = true;      /* light squares are scenery */
      b.onclick = () => tap(i);
      board.appendChild(b);
      G.cells[i] = b;
    }
  }
  ctx.btn('dm-undo').onclick   = undo;
  ctx.btn('dm-resign').onclick = () => P.ui.confirm(ctx, {
    head:'Resign?', why:'You hand them the game and there is no taking it back.',
    yes:'Yes, I resign', go: () => finish({ end:'resign', win: G.st.black ? 'w' : 'b' })
  });
  ctx.btn('dm-new').onclick    = () => P.ui.confirm(ctx, {
    head:'Start again?', why:'Twelve fresh stones each and we say no more about it.',
    yes:'Yes, new game', go: () => start()
  });
  render();
}

function stoneHTML(p){
  const king = typ(p) === KING;
  return '<span class="pt-stone ' + (isBk(p) ? 'b' : 'w') + '"' +
         (king ? ' data-k="1"' : '') + '>' +
         (king ? U.pieceSVG('pt-crown') : '') + '</span>';
}

function render(){
  const st = G.st, cells = G.cells;
  for (let i = 0; i < 64; i++){
    const el = cells[i]; if (!el) continue;
    const p = st.b[i];
    let cls = 'pt-sq' + (playable(i) ? ' d' : '');
    if (G.last && G.last.indexOf(i) >= 0) cls += ' last';
    if (i === G.sel) cls += ' sel';
    el.className = cls;
    const mark = G.marks.find(m => m.to === i);
    const row = flipped() ? 7 - RANK(i) : RANK(i);
    const col = flipped() ? 7 - FILE(i) : FILE(i);
    el.innerHTML =
      (row === 7 ? '<span class="pt-co f">' + 'abcdefgh'[FILE(i)] + '</span>' : '') +
      (col === 0 ? '<span class="pt-co r">' + (8 - RANK(i)) + '</span>' : '') +
      (p ? stoneHTML(p) : '') +
      (mark ? '<span class="pt-mark' + (mark.cap ? ' cap' : '') + '"></span>' : '');
    el.setAttribute('aria-label', NAME(i) + (p
      ? ', ' + (isBk(p) ? 'black ' : 'white ') + (typ(p) === KING ? 'king' : 'man')
      : ', empty'));
  }
  rails();
  strip();
  const u = G.ctx.btn('dm-undo');
  if (u) u.disabled = !G.hist.length || G.thinking || !!G.over || !!G.chain;
}

function rails(){
  const c = counts(G.st.b);
  const dot = (side, king) =>
    '<span class="pt-stone ' + side + '" style="position:relative;inset:auto;width:15px;' +
    'height:15px;display:inline-grid;margin-right:2px">' +
    (king ? U.pieceSVG('pt-crown') : '') + '</span>';
  const bar = (side, men, kings, lost) =>
    Array(men).fill(dot(side, false)).join('') +
    Array(kings).fill(dot(side, true)).join('') +
    (lost ? '<span class="pt-edge">-' + lost + '</span>' : '');
  const w = bar('w', c.wm, c.wk, 12 - c.wm - c.wk);
  const b = bar('b', c.bm, c.bk, 12 - c.bm - c.bk);
  const topIsBlack = !flipped();
  G.ctx.railTop.innerHTML = topIsBlack ? b : w;
  G.ctx.railBot.innerHTML = topIsBlack ? w : b;
}

function whoLabel(black){
  if (G.mode === 'pnp') return black ? 'Black to move' : 'White to move';
  return (black ? 'b' : 'w') === G.human ? 'Your move' : 'The phone is thinking';
}

function strip(){
  const st = G.st;
  const forced = !G.over && !G.thinking && genJumps(st).length > 0;
  let note = '';
  if (G.thinking) note = 'Thinking';
  else if (G.chain) note = 'Keep jumping';
  else if (forced) note = 'You must take';
  else if (G.lastText) note = G.lastText;
  P.ui.setTurn(G.ctx, {
    cls: st.black ? 'r' : 'w',
    who: G.over ? 'Game over' : whoLabel(st.black),
    note, alert: (forced || !!G.chain) && !G.over
  });
  G.ctx.badge.textContent = G.mode === 'pnp' ? 'Two players'
    : ['', 'Turist', 'Kazin', 'Nanna'][G.level] || 'Phone';
}

function myTurn(){
  if (G.over || G.thinking) return false;
  if (G.mode === 'pnp') return true;
  return (G.st.black ? 'b' : 'w') === G.human;
}

/* ── input ─────────────────────────────────────────────────────────
   A multi-jump is one move to the engine but several taps to a human.
   G.chain holds the half-finished one: the square the stone is stood
   on right now, the hops already made, and the full sequences still
   compatible with them. Nothing is committed to the game until only
   one of those is left and it has run out of hops. */
function tap(i){
  if (!myTurn()) return;

  if (G.chain){
    const mark = G.marks.find(m => m.to === i);
    if (mark) advance(i);
    return;                       /* mid-chain you may not do anything else */
  }

  const mark = G.marks.find(m => m.to === i);
  if (mark){ begin(mark); return; }

  const st = G.st, p = st.b[i];
  if (p && isBk(p) === st.black){
    if (G.sel === i){ G.sel = -1; G.marks = []; render(); return; }
    const mine = genMoves(st).filter(m => m.path[0] === i);
    G.sel = i;
    G.marks = firstHops(mine);
    if (!mine.length)
      K.toast && K.toast(genJumps(st).length
        ? 'There is a take on the board. You have to take it.'
        : 'That one is not going anywhere.');
    render();
    return;
  }
  G.sel = -1; G.marks = [];
  render();
}

/* the distinct squares this set of moves could hop to next */
function firstHops(moves, step){
  const at = step || 1, seen = {}, out = [];
  for (const m of moves){
    const to = m.path[at];
    if (to === undefined || seen[to]) continue;
    seen[to] = 1;
    out.push({ to, cap: m.caps.length > 0, moves: moves.filter(x => x.path[at] === to) });
  }
  return out;
}

function begin(mark){
  const set = mark.moves;
  if (set.length === 1 && set[0].path.length === 2){ play(set[0]); return; }
  if (set.every(m => m.path.length === 2)){ play(set[0]); return; }
  /* a chain: walk the first hop on screen and ask for the next */
  G.chain = { moves:set, at:1, from:G.sel };
  G.sel = mark.to;
  G.marks = firstHops(set, 2);
  render();
}

function advance(to){
  const c = G.chain;
  const at = c.at + 1;
  const set = c.moves.filter(m => m.path[at] === to);
  const done = set.filter(m => m.path.length === at + 1);
  if (done.length && set.length === done.length){ play(done[0]); return; }
  c.moves = set; c.at = at;
  G.sel = to;
  G.marks = firstHops(set, at + 1);
  render();
}

function play(m){
  const st = G.st;
  G.hist.push({ st: clone(st), last: G.last, lastText: G.lastText,
                keys: Object.assign({}, G.keys) });
  const text = notate(m);
  G.st = applied(st, m);
  G.last = m.path.slice();
  G.lastText = text;
  G.sel = -1; G.marks = []; G.chain = null;
  const key = posKey(G.st);
  G.keys[key] = (G.keys[key] || 0) + 1;
  render();
  const s = status(G.st, G.keys[key]);
  if (s.end){ finish(s); return; }
  maybeAI();
}

function maybeAI(){
  if (G.mode !== 'ai' || G.over) return;
  if ((G.st.black ? 'b' : 'w') === G.human) return;
  G.thinking = true;
  strip(); render();
  setTimeout(() => {
    if (!G || G.dead || G.over) return;
    let m = null;
    try { m = bestMove(G.st, G.level); } catch(e){ m = null; }
    G.thinking = false;
    if (!m){ render(); return; }
    G.hist.push({ st: clone(G.st), last: G.last, lastText: G.lastText,
                  keys: Object.assign({}, G.keys) });
    G.lastText = notate(m);
    G.st = applied(G.st, m);
    G.last = m.path.slice();
    const key = posKey(G.st);
    G.keys[key] = (G.keys[key] || 0) + 1;
    render();
    const s = status(G.st, G.keys[key]);
    if (s.end) finish(s);
  }, 60);
}

function undo(){
  if (!G.hist.length || G.thinking || G.over) return;
  const back = () => {
    const h = G.hist.pop();
    G.st = h.st; G.last = h.last; G.lastText = h.lastText; G.keys = h.keys;
  };
  back();
  if (G.mode === 'ai' && G.hist.length && (G.st.black ? 'b' : 'w') !== G.human) back();
  G.sel = -1; G.marks = []; G.chain = null; G.over = null;
  const over = G.ctx.root.querySelector('.pt-over'); if (over) over.remove();
  render();
}

function finish(s){
  G.over = s;
  G.sel = -1; G.marks = []; G.chain = null;
  render();

  const wname = G.mode === 'pnp' ? 'White' : (G.human === 'w' ? 'You' : 'The phone');
  const bname = G.mode === 'pnp' ? 'Black' : (G.human === 'b' ? 'You' : 'The phone');
  const winner = s.win ? (s.win === 'w' ? wname : bname) : null;
  const loser  = s.win ? (s.win === 'w' ? bname : wname) : null;
  let head, why, tone = 'draw';

  if (s.end === 'blocked'){
    const c = counts(G.st.b);
    const lost = s.win === 'w' ? (c.bm + c.bk) : (c.wm + c.wk);
    head = lost === 0 ? 'Wiped out' : 'Boxed in';
    why = lost === 0
      ? winner + ' took every last stone.'
      : winner + ' won it — ' + loser.toLowerCase() + ' still had ' + lost +
        ' on the board and not one legal move between them.';
  } else if (s.end === 'resign'){
    head = 'Resigned'; why = winner + ' won it. The other one had seen enough.';
  } else if (s.end === 'quiet'){
    head = 'Nothing doing';
    why = 'Forty moves each, nothing taken, no man moved. That is a draw.';
  } else {
    head = 'Three times over';
    why = 'The same position for the third time. Draw, before the table wears out.';
  }

  let quip = pick(QUIP_DRAW);
  if (s.win){
    if (G.mode === 'pnp'){ tone = 'win'; quip = 'Set them up again. Best of three, always.'; }
    else if (s.win === G.human){ tone = 'win'; quip = pick(QUIP_WIN); P.record('dama', 'w'); }
    else { tone = 'lose'; quip = pick(QUIP_LOSE); P.record('dama', 'l'); }
  } else if (G.mode === 'ai') P.record('dama', 'd');

  P.ui.result(G.ctx, {
    tone, head, why, quip,
    buttons: [
      { label:'Play again', icon:'play', cls:'primary', go: () => start() },
      { label:'Change opponent', icon:'users', go: () => menu() },
      { label:'Back to party games', icon:'back', go: () => { leave(); P.hub(); } }
    ]
  });
}

function start(){
  const p = P.pref('dama');
  newGame({ mode: p.mode || 'ai', level: p.level || 2, side: p.side || 'w' });
}
function menu(){
  leave();
  P.ui.setup({
    id:'dama',
    title:'Dama',
    blurb:'Twelve stones each on the dark squares. If there is a take you TAKE it — ' +
          'the app will not let you wriggle out of it, same as your uncle would not. ' +
          'Get to the far side and you come back a king.',
    levels: [
      { k:1, name:'It-turist', note:'Will hand you three stones and smile.', icon:'diff-1' },
      { k:2, name:'Tal-kazin', note:'Sets traps. Small ones, but traps.',    icon:'diff-2' },
      { k:3, name:'In-nanna',  note:'Nine moves deep. Do not take the bait.', icon:'diff-3' }
    ],
    sides: [
      { k:'w', name:'Gbejniet', cls:'w', note:'The cream ones. You go first.' },
      { k:'b', name:'Bajtar',   cls:'r', note:'The red ones. It goes first.' }
    ],
    onStart: o => newGame(o),
    onBack: () => P.hub()
  });
}
function leave(){
  if (G){ G.dead = true; if (G.ctx && G.ctx.stopFit) G.ctx.stopFit(); }
  G = null;
}

P.register({
  id:'dama', order:20, name:'DAMA', mt:'Id-dama', sprite:'pt-crown', status:'live',
  tag:'Draughts, done properly: if there is a take on the board you take it, and ' +
      'you finish the chain. No wriggling out.',
  open: menu
});

P.engines = P.engines || {};
P.engines.dama = ENGINE;

/* ── TEST HOOKS — see the same block in js/chess.js.
   Inert unless the page is opened with ?pttest. */
try {
  if (String(location.search).indexOf('pttest') >= 0){
    window.__PT_DAMA = {
      force(text, black, quiet){
        if (!G) return;
        G.st = fromText(text, black);
        G.st.quiet = quiet || 0;
        G.hist = []; G.keys = {}; G.keys[posKey(G.st)] = 1;
        G.sel = -1; G.marks = []; G.chain = null; G.last = null; G.lastText = '';
        G.over = null; G.thinking = false;
        const o = G.ctx.root.querySelector('.pt-over'); if (o) o.remove();
        render();
      },
      text(){ return G ? toText(G.st) : null; },
      state(){ return G ? clone(G.st) : null; }
    };
  }
} catch(e){}

})();
