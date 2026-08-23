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

/* ── THE CRASH NET ──────────────────────────────────────────────────
   Same shape as js/chess.js and js/kiri-ui.js: the MOVE LOG is written
   after every stone that lands and on the tab going away, and replayed
   through play() — the one path a move already takes — on the way back
   in. A finished game is never written (finish() bins the save and
   saveGame() refuses a G.over board), and an online game never touches
   the offline slot. */
const SAVE_KEY = 'karti_dama_v1';
let saveMoaned = false;
let REPLAYING = false;    /* a rebuild makes no noise and kicks no AI */
function saveGame(){
  if (!G || G.dead || G.over || online()) return;
  if (!G.wlog || !G.wlog.length){ clearSave(); return; }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(
      { v:1, at: Date.now(), mode: G.mode, level: G.level, human: G.human, log: G.wlog }));
  } catch(e){
    if (!saveMoaned){
      saveMoaned = true;
      const K = window.KARTI;
      try { K && K.toast && K.toast('⚠ The phone is not letting dama save. Closing the app will lose this board.'); } catch(_){}
    }
  }
}
function loadSave(){
  try {
    const j = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!j || j.v !== 1 || !Array.isArray(j.log) || !j.log.length) return null;
    if (j.mode !== 'ai' && j.mode !== 'pnp') return null;
    return j;
  } catch(e){ return null; }
}
function clearSave(){ try { localStorage.removeItem(SAVE_KEY); } catch(e){} }

function restoreSaved(){
  const sv = loadSave();
  if (!sv) return false;
  REPLAYING = true;
  try {
    newGame({ mode: sv.mode, level: sv.level, side: sv.human, replay: true });
    for (const w of sv.log){
      const m = fromWire(w);
      if (!m){
        /* a save from a board this build does not agree with: bin it,
           deal fresh, say nothing — half a game is not a game */
        REPLAYING = false;
        clearSave();
        newGame({ mode: sv.mode, level: sv.level, side: sv.human });
        return false;
      }
      play(m, true);
    }
  } finally { REPLAYING = false; }
  render();
  saveGame();
  maybeAI();
  return true;
}

function newGame(opts){
  if (opts.mode !== 'online' && !opts.replay) clearSave();
  G = {
    mode: opts.mode, level: +opts.level || 2,   /* 'pnp' | 'ai' | 'online' */
    human: opts.side === 'b' ? 'b' : 'w',
    net: opts.net || null,
    me: opts.me || 'YOU', foe: opts.foe || 'THEM',
    st: startPos(),
    hist: [], keys: {}, wlog: [],
    sel: -1, marks: [], chain: null, last: null, lastText: '',
    over: null, thinking: false, ctx: null, dead: false
  };
  G.keys[posKey(G.st)] = 1;
  paint();
  maybeAI();
}

function online(){ return G.mode === 'online'; }
function flipped(){ return (G.mode === 'ai' || G.mode === 'online') && G.human === 'b'; }
function sqAt(row, col){ return flipped() ? SQ(7 - col, 7 - row) : SQ(col, row); }

function paint(){
  const net = online();
  const ctx = P.ui.frame({
    title: 'Dama',
    onBack: net ? () => askLeave() : () => { leave(); P.hub(); },
    leave,
    buttons: net
      ? [ { id:'dm-undo',   label:'Takeback', icon:'refresh' },
          { id:'dm-resign', label:'Resign',   icon:'flag' },
          { id:'dm-leave',  label:'Leave',    icon:'back' } ]
      : [ { id:'dm-undo',   label:'Undo',   icon:'refresh' },
          { id:'dm-resign', label:'Resign', icon:'flag' },
          { id:'dm-new',    label:'New',    icon:'play' } ]
  });
  G.ctx = ctx;
  ctx.root.classList.add('dm');          /* scope hook for the kit shelf (cosmetic only) */
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
  if (ctx.btn('dm-undo')) ctx.btn('dm-undo').onclick = undo;
  ctx.btn('dm-resign').onclick = () => P.ui.confirm(ctx, {
    head:'Resign?', why:'You hand them the game and there is no taking it back.',
    yes:'Yes, I resign',
    go: () => {
      if (net){
        if (G.net) G.net.send('resign', null, null);
        finish({ end:'resign', win: G.human === 'w' ? 'b' : 'w' });
      } else finish({ end:'resign', win: G.st.black ? 'w' : 'b' });
    }
  });
  if (ctx.btn('dm-new')) ctx.btn('dm-new').onclick = () => P.ui.confirm(ctx, {
    head:'Start again?', why:'Twelve fresh stones each and we say no more about it.',
    yes:'Yes, new game', go: () => start()
  });
  if (ctx.btn('dm-leave')) ctx.btn('dm-leave').onclick = askLeave;
  render();
}

function askLeave(){
  if (!G) return;
  if (G.over){ if (G.net) G.net.onLeave(); return; }
  P.ui.confirm(G.ctx, {
    head:'Leave the game?',
    why:'They are sat there waiting for your move. Walking out ends it for both of you.',
    yes:'Yes, leave', no:'No, carry on',
    go: () => { if (G && G.net) G.net.onLeave(); }
  });
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
  const r = G.ctx.btn('dm-resign');
  if (r) r.disabled = !!G.over;
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
  const mine = (black ? 'b' : 'w') === G.human;
  if (online()) return mine ? 'Your move' : G.foe + ' to move';
  return mine ? 'Your move' : 'The phone is thinking';
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
  G.ctx.badge.textContent = online() ? (G.human === 'w' ? 'Online · Ġbejniet' : 'Online · Bajtar')
    : G.mode === 'pnp' ? 'Two players'
    : ['', 'Turist', 'Kazin', 'Nanna'][G.level] || 'Phone';
}

function myTurn(){
  if (G.over || G.thinking) return false;
  /* locked while our own takeback is in the air — see js/chess.js */
  if (G.tb && G.tb.busy()) return false;
  if (G.mode === 'pnp') return true;
  return (G.st.black ? 'b' : 'w') === G.human;
}
/* board + side + the quiet clock: everything that makes two dama positions
   the same position. Travels with every move so the two boards cannot drift. */
function fingerprint(st){ return posKey(st) + '/' + st.quiet; }

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
    if (G.sel === i){ G.sel = -1; G.marks = []; SFX() && SFX().boardCancel(); render(); return; }
    const mine = genMoves(st).filter(m => m.path[0] === i);
    G.sel = i;
    SFX() && SFX().boardPick('dama');
    G.marks = firstHops(mine);
    if (!mine.length)
      { const forced = genJumps(st).length > 0;
        SFX() && SFX().boardIllegal({ forced });
        /* the ⚠ is not decoration: js/sfx.js reads it off the toast and plays
           the blunt "no" instead of the bell, which is the SAME ui.error that
           boardIllegal just fired — so the 40 ms dedupe window collapses the
           two into one sound. Without it you get a thud AND a chime on top of
           each other every time you pick up the wrong stone. */
        K.toast && K.toast(forced
          ? '⚠ There is a take on the board. You have to take it.'
          : '⚠ That one is not going anywhere.'); }
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

/* A multi-jump is played ONE TAP AT A TIME, and every one of those taps moves
   the stone on screen — so every one of them has to clack as it lands, not
   silently bank the noise until the chain is finished. `heard` is how many
   hops have already been sounded; play() passes it on so sfxPlay() fires only
   the ones the player has not heard yet. Without it a four-jump sweep is three
   silent taps and then four clacks at once, which is the wrong game entirely.
   The machine's own chains never come through here: they arrive at play() in
   one piece with heard = 0 and get the whole rising run, spaced out. */
function hop(n){ const S = SFX(); if (S) S.boardChain(n, 0); }

function begin(mark){
  const set = mark.moves;
  if (set.length === 1 && set[0].path.length === 2){ play(set[0]); return; }
  if (set.every(m => m.path.length === 2)){ play(set[0]); return; }
  /* a chain: walk the first hop on screen and ask for the next */
  G.chain = { moves:set, at:1, from:G.sel, heard:1 };
  hop(1);
  G.sel = mark.to;
  G.marks = firstHops(set, 2);
  render();
}

function advance(to){
  const c = G.chain;
  const at = c.at + 1;
  const set = c.moves.filter(m => m.path[at] === to);
  const done = set.filter(m => m.path.length === at + 1);
  if (done.length && set.length === done.length){ play(done[0], false, c.heard); return; }
  c.moves = set; c.at = at; c.heard = at;
  hop(at);
  G.sel = to;
  G.marks = firstHops(set, at + 1);
  render();
}

/* ── sound ────────────────────────────────────────────────────────────────
   js/sfx.js owns the noises; this file only reports what happened. All of it
   is optional and a no-op when sfx.js is absent or sound is off.
   The chain is the good one: boardChain() is called PER HOP, so a four-jump
   sweep rises 7% in pitch a hop with a pentatonic note climbing under it and
   announces itself as a four-jump sweep before you have finished counting. */
const SFX = () => window.KARTI_SFX || null;
function sfxPlay(st, m, heard){
  const S = SFX(); if (!S) return;
  const hops = (m.caps && m.caps.length) || 0;
  heard = Math.max(0, Math.min(hops, heard | 0));   /* hops already clacked */
  /* crowning is not a flag on the move: a man is crowned when it ENDS on the
     far rank, which is exactly the test applied() makes. Read it the same way
     rather than inventing a second source of truth that can drift. */
  let crowned = false;
  try {
    const from = m.path[0], to = m.path[m.path.length - 1];
    crowned = typ(st.b[from]) === MAN && RANK(to) === (st.black ? 7 : 0);
  } catch(e){ crowned = false; }

  if (hops > 0){
    /* one call per hop: the clack rises 7% each time and a pentatonic note
       climbs under it, so the board announces a four-jump sweep as a
       four-jump sweep. Spaced so they read as separate takes. */
    for (let h = heard + 1; h <= hops; h++)
      setTimeout(function(){ S.boardChain(h, hops); }, (h - heard - 1) * 150);
  } else {
    S.boardMove({ game: 'dama' });
  }
  if (crowned) setTimeout(function(){ S.boardCrown(); }, (hops - heard) * 150 + 120);
}

function play(m, fromNet, heard){
  const st = G.st;
  if (online() && !fromNet && G.tb) G.tb.cancel(true);
  if (online() && !fromNet && G.net)
    G.net.send('move', { p: m.path.slice(), c: m.caps.slice() }, fingerprint(st));
  G.hist.push({ st: clone(st), last: G.last, lastText: G.lastText,
                keys: Object.assign({}, G.keys) });
  const text = notate(m);
  if (!REPLAYING) sfxPlay(st, m, heard);
  G.st = applied(st, m);
  G.last = m.path.slice();
  G.lastText = text;
  G.sel = -1; G.marks = []; G.chain = null;
  if (G.wlog) G.wlog.push({ p: m.path.slice(), c: m.caps.slice() });
  const key = posKey(G.st);
  G.keys[key] = (G.keys[key] || 0) + 1;
  if (!REPLAYING) render();
  const s = status(G.st, G.keys[key]);
  if (s.end){ finish(s); return; }
  if (!REPLAYING) saveGame();
  maybeAI();
}

function maybeAI(){
  if (REPLAYING) return;
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
    sfxPlay(G.st, m);
    G.st = applied(G.st, m);
    G.last = m.path.slice();
    if (G.wlog) G.wlog.push({ p: m.path.slice(), c: m.caps.slice() });
    const key = posKey(G.st);
    G.keys[key] = (G.keys[key] || 0) + 1;
    render();
    const s = status(G.st, G.keys[key]);
    if (s.end) finish(s);
    else saveGame();
  }, 60);
}

/* n plies off this board and nothing else — see the same function in chess.js */
function rollback(n){
  /* The board going backwards is its own sound — a swipe and a stone set back
     down. It is also the one tap the delegated UI layer cannot make for us:
     Undo greys ITSELF out as it runs, and a button that is disabled by the
     time the click bubbles reads as a dead tap. */
  { const S = SFX(); if (S && G.hist.length) S.takeback('undo'); }
  for (let i = 0; i < n && G.hist.length; i++){
    const h = G.hist.pop();
    G.st = h.st; G.last = h.last; G.lastText = h.lastText; G.keys = h.keys;
    if (G.wlog && G.wlog.length) G.wlog.pop();
  }
  G.sel = -1; G.marks = []; G.chain = null; G.over = null;
  saveGame();                     /* the shorter game is the game now */
  const over = G.ctx.root.querySelector('.pt-over'); if (over) over.remove();
  render();
}
function markBack(n){
  if (!G || n < 1 || G.hist.length < n) return null;
  return fingerprint(G.hist[G.hist.length - n].st);
}

function undo(){
  if (online()){ askTakeback(); return; }
  if (!G.hist.length || G.thinking || G.over) return;
  const two = (G.mode === 'ai' && G.hist.length > 1 &&
               (G.hist[G.hist.length - 1].st.black ? 'b' : 'w') !== G.human);
  rollback(two ? 2 : 1);
}

function askTakeback(){
  if (!G || !G.tb || G.over || G.thinking || G.chain) return;
  const mineNow = (G.st.black ? 'b' : 'w') === G.human;
  const n = Math.min(G.hist.length, mineNow ? 2 : 1);
  if (n < 1){ P.ui.setNet(G.ctx, 'Nothing to take back yet.', 'warn'); return; }
  P.ui.confirm(G.ctx, {
    head:'Ask for a takeback?',
    why:'They have to agree. Until they do, nothing moves on either board — and you ' +
        'cannot play a move while you are asking.',
    yes:'Ask ' + G.foe, no:'No, leave it',
    go: () => {
      const r = G.tb.request(n);
      if (!r.ok) P.ui.setNet(G.ctx, r.why, 'warn');
      render();
    }
  });
}

/* THE ONE PLACE A GAME OF DAMA IS RESOLVED — boxed in, wiped out, resigned,
   or drawn. Every ending comes through here, so there is exactly one line to
   hook for anything that wants to record a finished game. */
function finish(s){
  clearSave();                    /* a finished game must never resurrect */
  { const S = SFX();
    if (S){ const meB = (G.mode === 'pnp') ? null : (G.human === 'b');
      S.boardEnd({ draw: !s.win,
                   win: s.win && meB !== null ? ((s.win === 'b') === meB) : false }); } }
  G.over = s;
  G.sel = -1; G.marks = []; G.chain = null;
  if (G.tb) G.tb.cancel(true);
  render();

  const them = online() ? G.foe : 'The phone';
  const wname = G.mode === 'pnp' ? 'White' : (G.human === 'w' ? 'You' : them);
  const bname = G.mode === 'pnp' ? 'Black' : (G.human === 'b' ? 'You' : them);
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
  } else if (s.end === 'left'){
    head = 'They left'; why = winner + ' won it — the other one walked out mid-game.';
  } else if (s.end === 'quiet'){
    head = 'Nothing doing';
    why = 'Forty moves each, nothing taken, no man moved. That is a draw.';
  } else {
    head = 'Three times over';
    why = 'The same position for the third time. Draw, before the table wears out.';
  }

  /* the ledger counts games against the PHONE and nothing else */
  let quip = pick(QUIP_DRAW);
  const outcome = s.win ? ((G.mode === 'pnp' || s.win === G.human) ? 'w' : 'l') : 'd';
  if (s.win){
    if (G.mode === 'pnp'){ tone = 'win'; quip = 'Set them up again. Best of three, always.'; }
    else if (s.win === G.human){
      tone = 'win';
      quip = online() ? 'A real opponent, boxed in. That one counts twice.' : pick(QUIP_WIN);
    } else {
      tone = 'lose';
      quip = online() ? 'They had the take and they took it. Run it back.' : pick(QUIP_LOSE);
    }
  }

  /* ── WHICH SCREEN, AND WHO PAYS ────────────────────────────────────
     A DECISIVE game finishes into ir-rebbieħ, the shared winner screen;
     a DRAW keeps the explanatory card — dama's two draws ("nothing
     doing", "three times over") are stories the card's `why` line tells
     and a podium cannot, and crowning somebody over a draw is a lie.

     THE MONEY MUST MOVE EXACTLY ONCE. On the CARD path nothing changes:
     P.record and the P.ui.result call are both wrapped by js/progress.js,
     which pays the first and swallows the echo. On the REBBIEĦ path the
     P.ui.result wrapper never fires, so awardPlay pays here instead —
     BEFORE P.record and WITHOUT a match id, on purpose: an id-less award
     is deduped by progress.js on (game|result) inside a ten-second
     window, so this payment seeds that window and P.record's own wrapped
     award (kept for the ledger, uneditable from here) lands on 'already'
     instead of paying twice. An id-carrying award would bypass that
     shared window and double-pay. finish() runs once per game — every
     caller is gated on G.over — so this cannot re-fire on a repaint. */
  const R2 = window.KARTI_REBBIEH;
  const useReb = !!(R2 && R2.show) && !!s.win;
  let pay = null;
  if (useReb && window.KARTI_XP && KARTI_XP.awardPlay){
    try {
      const r = KARTI_XP.awardPlay({ game:'dama', won: outcome === 'w', draw: outcome === 'd' });
      if (r && r.counted) pay = r;
    } catch(e){}
  }
  if (G.mode === 'ai') P.record('dama', outcome);

  if (online()){
    if (G.net && G.net.onEnd) G.net.onEnd(s);
    if (useReb){ showRebbieh(s, pay); return; }
    P.ui.result(G.ctx, {
      tone, head, why, quip,
      buttons: [
        { label:'Back to the rooms', icon:'back', cls:'primary',
          go: () => { if (G && G.net) G.net.onLeave(); } }
      ]
    });
    return;
  }

  if (useReb){ showRebbieh(s, pay); return; }
  P.ui.result(G.ctx, {
    tone, head, why, quip,
    buttons: [
      { label:'Play again', icon:'play', cls:'primary', go: () => start() },
      { label:'Change opponent', icon:'users', go: () => menu() },
      { label:'Back to party games', icon:'back', go: () => { leave(); P.hub(); } }
    ]
  });
}

/* ═══════════════════════════════════════════════════════════════════
   IR-REBBIEĦ — the shared winner screen, for a game somebody WON.
   ───────────────────────────────────────────────────────────────────
   The board's own words stay English like the rest of this file; the
   winner screen is the one surface every game shares, so its strings
   follow the app's bilingual rule through KARTI_LANG. */
const RT = (en, mt) => (window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en);

function showRebbieh(s, pay){
  if (!G || !G.ctx) return;
  const R2 = window.KARTI_REBBIEH;
  if (!R2 || !R2.show) return;
  const them = online() ? G.foe : 'The phone';
  const wname = G.mode === 'pnp' ? 'White' : (G.human === 'w' ? 'You' : them);
  const bname = G.mode === 'pnp' ? 'Black' : (G.human === 'b' ? 'You' : them);
  const iWon = G.mode !== 'pnp' && s.win === G.human;

  /* the REAL score of a dama board is the wood still standing on it:
     men + kings per side, counted off the finished position, so a wipe-
     out reads 8–0 and a squeak reads 3–2. Winner's row first. Border
     colours are the sets themselves — the pale ġbejniet framed silver,
     the dark bajtar framed ruby (ids rebbieħ already knows). Avatars
     stay null so rebbieħ draws its initials tile. */
  const c = counts(G.st.b);
  const seats = [
    { colour:'w', name: wname, left: c.wm + c.wk, border:'silver' },
    { colour:'b', name: bname, left: c.bm + c.bk, border:'ruby' }
  ];
  const rows = seats
    .sort((a, b) => (a.colour === s.win ? -1 : 1))
    .map((p, i) => ({
      name: p.name, place: i + 1,
      you: G.mode !== 'pnp' && p.name === 'You',
      bot: G.mode === 'ai' && p.name === 'The phone',
      score: p.left + ' ' + RT('left', 'baqa’'),
      border: p.border
    }));

  /* the shared screen's XP block from awardPlay's figures; bar fractions
     are progress.js's private business, so the house near-full trick. */
  const xp = pay ? { level: pay.level, gained: pay.xp, leveledUp: !!pay.levelled,
                     before: 0, after: pay.levelled ? 1 : 0.7 } : null;

  const endWord =
    s.end === 'resign'  ? RT('By resignation', 'B’riżenja') :
    s.end === 'left'    ? RT('Opponent walked out', 'L-avversarju telaq') :
    (seats.find(p => p.colour !== s.win) || {}).left === 0
                        ? RT('Wiped out', 'Meħuda kollha') :
                          RT('Boxed in', 'Imblukkat');
  const backToRooms = () => { if (G && G.net) G.net.onLeave(); };

  R2.show({
    lang: (window.KARTI_LANG ? KARTI_LANG.lang() : 'en'),
    /* no `reduced` flag on purpose: dama keeps no motion pref of its own,
       and rebbieħ reads body.reduced and the media query live by itself */
    title: G.mode === 'pnp'
      ? (s.win === 'w' ? RT('White wins', 'Rebaħ l-Abjad') : RT('Black wins', 'Rebaħ l-Iswed'))
      : (iWon ? RT('You win', 'Rebaħt') : RT('You lose', 'Tlift')),
    subtitle: endWord,
    rows,
    xp,
    /* the reward block: all plain positive numbers per rebbieħ's contract.
       Dama boards are never staked (the instant-pair rooms carry no pot),
       so there is no staked/pot figure to hand over. */
    reward: pay ? { xp: pay.xp, chips: (pay.chips | 0) + (pay.chipsLevel | 0),
                    wonBonus: pay.wonBonus } : undefined,
    sound: id => { const S = SFX(); if (S && S.play) try { S.play(id, { gain:0.6 }); } catch(e){} },
    /* ONLINE both doors go back to the rooms, exactly as the card's one
       button did. LOCAL keeps the card's semantics: primary is the
       rematch, Leave is the dama door (menu), where changing opponent
       and the way back to the party shelf both already live. */
    playAgainLabel: online() ? RT('Back to the rooms', 'Lura għall-kmamar')
                             : RT('Play again', 'Erġa’ lgħab'),
    playAgainCaption: online() ? null
      : RT('Leave goes to the dama door — change opponent or level there.',
           'Oħroġ imur għall-bieb tad-dama — ibdel l-avversarju jew il-livell hemm.'),
    onPlayAgain: online() ? backToRooms : () => start(),
    onLeave: online() ? backToRooms : () => menu()
  });
}

/* ═══════════════════════════════════════════════════════════════════
   THE SAME GAME, TWO PHONES
   The contract with js/mp.js, identical in shape to the one in
   js/chess.js — start / remote / note / stop. mp.js owns the socket
   and knows nothing about dama; this block knows nothing about
   sockets. No undo online, for the reason spelled out in chess.js.
   ═══════════════════════════════════════════════════════════════════ */
const asKey = a => (a || []).slice().sort((x, y) => x - y).join(',');

/* ONLY a move this engine generated from OUR board can be applied. That means
   the compulsory take and the whole jump chain are enforced against a remote
   move exactly as they are against a tap on the glass. */
function fromWire(w){
  if (!w || typeof w !== 'object' || !Array.isArray(w.p)) return null;
  const path = w.p.join(','), caps = asKey(w.c);
  for (const m of genMoves(G.st))
    if (m.path.join(',') === path && asKey(m.caps) === caps) return m;
  return null;
}

function onlineStart(o){
  newGame({ mode:'online', side:o.colour, net:o, me:o.me, foe:o.foe });
  G.tb = P.ui.takeback({
    peers: 1,
    send: (kind, body) => o.take(kind, body),
    rollback: rollback,
    mark: markBack,
    note: (t, tone) => P.ui.setNet(G.ctx, t, tone),
    after: () => render(),
    dismiss: () => { const q = G.ctx.root.querySelector('.pt-ask'); if (q) q.remove(); },
    /* see the same block in js/chess.js: a question arriving from the other
       phone is the one event here with no local input behind it, so it is the
       one that most needs announcing. Yes needs nothing — rollback() already
       plays the board going backwards. */
    ask: (info, yes, no) => {
      const S = SFX(); if (S) S.takeback('ask');
      return P.ui.confirm(G.ctx, {
        head: G.foe + ' asks for a takeback',
        why: 'They want the last ' + info.n + (info.n === 1 ? ' move' : ' moves') +
             ' back. Say no and nothing at all happens — they are not told off for asking.',
        yes:'Allow it', no:'No, play on', go: yes,
        onNo: () => { const s = SFX(); if (s) s.takeback('no'); return no && no(); }
      });
    }
  });
  P.ui.setNet(G.ctx, o.note || '', '');
}

function onlineRemote(d){
  if (!G || !online()) return { why:'a move with no game on the table' };
  if (G.over) return null;
  if (d.kind === 'resign'){
    if (G.tb) G.tb.cancel(true);
    finish({ end:'resign', win: G.human });
    return null;
  }
  if (d.kind !== 'move') return { why:'a move KARTI does not have' };
  if ((G.st.black ? 'b' : 'w') === G.human) return { why:'a move out of turn' };
  if (d.ck && d.ck !== fingerprint(G.st))
    return { why:'a move from a board that is not this one', desync:true };
  const m = fromWire(d.m);
  if (!m) return { why:'a move the rules of dama do not allow' };
  if (G.tb) G.tb.cancel(true);
  play(m, true);
  return null;
}

function onlineTake(d){
  if (!G || !online() || !G.tb) return;
  G.tb.incoming(d);
}

function onlineNote(text, tone){
  if (!G || !online()) return;
  P.ui.setNet(G.ctx, text || '', tone || '');
}

function onlineStop(why, tone){
  if (!G || !online()) return;
  if (!G.over){ G.over = { end:'stopped', win:null }; render(); }
  P.ui.setNet(G.ctx, '', '');
  /* THIS CARD CARRIES NO TONE, AND THE OMISSION IS LOAD-BEARING — the same
     fix, for the same reason, as onlineStop in js/chess.js: js/progress.js
     wraps P.ui.result and reads `tone` as a RESULT to pay for ('draw' paid a
     draw, anything else a loss), so a dropped line was being paid and counted
     like a finished game. An abandoned game is not a result: with no tone the
     wrapper pays nothing and writes nothing, and the card simply falls back
     to the neutral grey dress the ordinary cut-off wore anyway. */
  P.ui.result(G.ctx, {
    head: tone === 'cheat' ? 'No deal' : 'Cut off',
    why: why || 'The match stopped.',
    quip: 'Nothing was awarded. Nobody lost anything for a bad line.',
    buttons: [
      { label:'Back to the rooms', icon:'back', cls:'primary',
        go: () => { if (G && G.net) G.net.onLeave(); } }
    ]
  });
  /* the cheat card keeps its red dress: that colour was information, and the
     class is all the tone ever bought on screen. Painted by hand AFTER the
     call, so the paying wrapper never sees a tone to misread as a loss. */
  if (tone === 'cheat'){
    const over = G.ctx.root.querySelector('.pt-over');
    if (over){ over.classList.remove('draw'); over.classList.add('lose'); }
  }
}

/* THE 1v1 WALK-OUT IS A WIN, not a cut-off — the same hook, for the same
   reason, as onlineSoleWin in js/chess.js. Called by js/mp.js
   (boardSoleWin) only when the opponent LEFT for good mid-game; a held
   drop never comes here. Routes through finish(), the one place a game
   of dama is resolved, so the podium and the single awardPlay payment
   behave exactly as they do for a resignation. Gated on G.over like
   every other finish() caller, so a game cannot resolve twice. */
function onlineSoleWin(){
  if (!G || !online() || G.over) return;
  if (G.tb) G.tb.cancel(true);
  finish({ end:'left', win: G.human });
}

P.online = P.online || {};
P.online.dama = {
  start: onlineStart, remote: onlineRemote, take: onlineTake,
  note: onlineNote, stop: onlineStop, soleWin: onlineSoleWin,
  live: () => !!(G && online() && !G.dead)
};

function start(){
  const p = P.pref('dama');
  newGame({ mode: p.mode || 'ai', level: p.level || 2, side: p.side || 'w' });
}

/* ═══════════════════════════════════════════════════════════════════
   THE DOOR
   ───────────────────────────────────────────────────────────────────
   Dama used to borrow party.js's shared setup sheet, which is a form:
   pick a mode, pick a level, find Start. Chess's door screen showed the
   better shape — THE OPPONENT IS THE START — so dama now owns its door
   the same way, wearing its own colours: the cream and the terracotta
   of its own stones, not chess's purple and not tombla's paper.
   Everything below is scoped under .dmm and cannot reach the board.
   ═══════════════════════════════════════════════════════════════════ */
const UI_KEY = 'karti_dama_ui_v1';   /* UI preferences only — never a game save */

const DM_LVL = {
  1: { name:'It-turist', note:'Will hand you three stones and smile.', icon:'diff-1' },
  2: { name:'Tal-kazin', note:'Sets traps. Small ones, but traps.',    icon:'diff-2' },
  3: { name:'In-nanna',  note:'Nine moves deep. Do not take the bait.', icon:'diff-3' }
};

function damaCSS(){
  if (document.getElementById('dm-css')) return;
  const st = document.createElement('style');
  st.id = 'dm-css';
  st.textContent =
    /* the door's palette: the stones' own cream and terracotta */
    '#scr-party .dmm{--dm-cr:#E4D2AC;--dm-cr2:#B79E70;--dm-rd:#D93A20;--dm-rd2:#8C1E0C}' +

    /* ── the identity piece: a fan of the game's own stones ──────────
       The same discs the board draws — radial cream, radial terracotta,
       the crowned king in the middle standing taller, and two of them
       stacked the way counters sit at the side of a real table. */
    '#scr-party .dmm-hero{position:relative;display:flex;justify-content:center;' +
      'align-items:center;padding:14px 0 18px}' +
    '#scr-party .dmm-hero::before{content:"";position:absolute;left:8%;right:8%;top:0;bottom:4px;' +
      'background:radial-gradient(55% 78% at 50% 62%,rgba(217,58,32,.17),' +
      'rgba(228,210,172,.10) 52%,transparent 78%);pointer-events:none}' +
    '#scr-party .dmm-stone{position:relative;width:50px;height:50px;flex:0 0 auto;' +
      'margin-left:-9px;border-radius:50%;display:grid;place-items:center;' +
      'background:radial-gradient(circle at 34% 28%,#FFFCF2,var(--dm-cr) 58%,var(--dm-cr2));' +
      'box-shadow:inset 0 -4px 7px rgba(120,80,30,.35),inset 0 0 0 2px rgba(255,255,255,.4),' +
      '0 7px 14px rgba(0,0,0,.5)}' +
    '#scr-party .dmm-stone:first-child{margin-left:0}' +
    '#scr-party .dmm-stone.b{background:radial-gradient(circle at 34% 28%,#FF8A6B,' +
      'var(--dm-rd) 55%,var(--dm-rd2));' +
      'box-shadow:inset 0 -4px 7px rgba(60,10,4,.5),inset 0 0 0 2px rgba(255,255,255,.28),' +
      '0 7px 14px rgba(0,0,0,.5)}' +
    /* a stack: the same disc with one more of itself under it */
    '#scr-party .dmm-stone.st{box-shadow:inset 0 -4px 7px rgba(120,80,30,.35),' +
      'inset 0 0 0 2px rgba(255,255,255,.4),0 5px 0 -1px var(--dm-cr2),' +
      '0 6px 0 0 rgba(0,0,0,.35),0 12px 16px rgba(0,0,0,.5)}' +
    '#scr-party .dmm-stone.b.st{box-shadow:inset 0 -4px 7px rgba(60,10,4,.5),' +
      'inset 0 0 0 2px rgba(255,255,255,.28),0 5px 0 -1px var(--dm-rd2),' +
      '0 6px 0 0 rgba(0,0,0,.35),0 12px 16px rgba(0,0,0,.5)}' +
    '#scr-party .dmm-stone:nth-child(1){transform:rotate(-9deg) translateY(7px)}' +
    '#scr-party .dmm-stone:nth-child(2){transform:translateY(1px)}' +
    '#scr-party .dmm-stone:nth-child(4){transform:translateY(1px)}' +
    '#scr-party .dmm-stone:nth-child(5){transform:rotate(9deg) translateY(7px)}' +
    '#scr-party .dmm-stone.k{width:62px;height:62px;z-index:2;transform:translateY(-8px);' +
      'box-shadow:inset 0 -5px 8px rgba(60,10,4,.5),inset 0 0 0 2px rgba(255,255,255,.3),' +
      '0 0 0 2px rgba(255,197,66,.7),0 9px 18px rgba(0,0,0,.6)}' +
    '#scr-party .dmm-stone .pt-pcs{width:56%;height:56%;fill:#FFE9B0;stroke:none}' +

    /* ── the doors — same shape as chess's, dressed in dama's colours ── */
    '#scr-party .dm-doors{display:grid;gap:9px;margin-bottom:2px}' +
    '#scr-party .dm-door{display:grid;grid-template-columns:26px 1fr 16px;column-gap:12px;' +
      'row-gap:1px;align-items:center;text-align:left;width:100%;min-height:62px;' +
      'padding:10px 13px;border-radius:15px;color:var(--txt);' +
      'background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.035));' +
      'border:1px solid var(--line2);transition:background .15s,border-color .15s}' +
    '#scr-party .dm-door>.ico:first-child{grid-column:1;grid-row:1/3;width:24px;height:24px;' +
      'color:#FF9C7E}' +
    '#scr-party .dm-door>.dm-chev{grid-column:3;grid-row:1/3;width:16px;height:16px;' +
      'color:var(--dim2)}' +
    '#scr-party .dm-door b{grid-column:2;grid-row:1;font-family:var(--disp);font-size:13px;' +
      'letter-spacing:.06em;text-transform:uppercase;line-height:1.2}' +
    '#scr-party .dm-door i{grid-column:2;grid-row:2;font-style:normal;font-size:11.5px;' +
      'line-height:1.35;color:var(--dim)}' +
    '#scr-party .dm-door:active{background:rgba(217,58,32,.16);border-color:rgba(217,58,32,.5)}' +
    '#scr-party .dm-door.hero{background:linear-gradient(180deg,rgba(217,58,32,.17),' +
      'rgba(217,58,32,.06));border-color:rgba(217,58,32,.45)}' +
    '#scr-party .dm-door.off{opacity:.5}' +
    '#scr-party .dm-setup .pt-lbl{margin:15px 0 7px}' +
    '#scr-party .dm-setup .blurb{margin-bottom:2px}' +

    /* ── the rules dock at the foot — in the flow, never over anything ── */
    '#scr-party .dmm-dock{flex:0 0 auto;margin-top:8px;border-radius:15px;overflow:hidden;' +
      'border:1px solid var(--line2);' +
      'background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02))}' +
    '#scr-party .dmm-grip{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;' +
      'padding:8px 14px;border:0;background:none;color:var(--dim);text-align:left;cursor:pointer;' +
      'font:900 11px/1.3 var(--disp);letter-spacing:.1em;text-transform:uppercase}' +
    '#scr-party .dmm-grip .ico{width:17px;height:17px;flex:0 0 auto}' +
    '#scr-party .dmm-grip .cv{margin-left:auto;width:17px;height:17px;flex:0 0 auto;' +
      'transition:transform .2s var(--ease)}' +
    '#scr-party .dmm-dock.open{border-color:rgba(217,58,32,.5)}' +
    '#scr-party .dmm-dock.open .dmm-grip{color:#FF9C7E}' +
    '#scr-party .dmm-dock.open .cv{transform:rotate(180deg)}' +
    '#scr-party .dmm-body{max-height:min(38vh,300px);overflow-y:auto;padding:0 14px 8px}' +
    '#scr-party .dmm-body[hidden]{display:none}' +
    '#scr-party .dmm-body>div{animation:dmmUp .22s var(--ease)}' +
    '@keyframes dmmUp{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}' +
    /* one rule: a stone, a name, a sentence */
    '#scr-party .dmm-rule{display:grid;grid-template-columns:26px 1fr;column-gap:11px;' +
      'row-gap:2px;padding:9px 0;border-top:1px solid var(--line)}' +
    '#scr-party .dmm-rule:first-child{border-top:0}' +
    '#scr-party .dmm-ric{grid-row:1/3;width:22px;height:22px;margin-top:3px;border-radius:50%;' +
      'display:grid;place-items:center;' +
      'background:radial-gradient(circle at 34% 28%,#FFFCF2,var(--dm-cr) 58%,var(--dm-cr2));' +
      'box-shadow:inset 0 -2px 3px rgba(120,80,30,.35),0 2px 4px rgba(0,0,0,.4)}' +
    '#scr-party .dmm-ric.b{background:radial-gradient(circle at 34% 28%,#FF8A6B,' +
      'var(--dm-rd) 55%,var(--dm-rd2));box-shadow:inset 0 -2px 3px rgba(60,10,4,.5),' +
      '0 2px 4px rgba(0,0,0,.4)}' +
    '#scr-party .dmm-ric.x{background:rgba(255,255,255,.08);' +
      'box-shadow:inset 0 0 0 2px var(--line2)}' +
    '#scr-party .dmm-ric.d{background:linear-gradient(90deg,var(--dm-cr) 0 50%,' +
      'var(--dm-rd) 50%);box-shadow:inset 0 -2px 3px rgba(0,0,0,.3),0 2px 4px rgba(0,0,0,.4)}' +
    '#scr-party .dmm-ric .pt-pcs{width:64%;height:64%;fill:#FFE9B0;stroke:none}' +
    '#scr-party .dmm-rule b{font:900 11px/1.35 var(--disp);letter-spacing:.07em;' +
      'text-transform:uppercase;color:var(--txt)}' +
    '#scr-party .dmm-rule i{font-style:normal;font-size:11px;line-height:1.45;color:var(--dim)}' +
    /* sideways, the hero gives a little */
    '@media (orientation:landscape) and (max-height:480px){' +
      '#scr-party .dmm-hero{padding:6px 0 10px}' +
      '#scr-party .dmm-stone{width:42px;height:42px}' +
      '#scr-party .dmm-stone.k{width:50px;height:50px}}' +
    '@media (prefers-reduced-motion:reduce){' +
      '#scr-party .dmm-body>div{animation:none}' +
      '#scr-party .dmm-grip .cv{transition:none}}' +
    'body.reduced #scr-party .dmm-body>div{animation:none}' +
    'body.reduced #scr-party .dmm-grip .cv{transition:none}';
  document.head.appendChild(st);
}

function menu(){
  leave();
  P.ui.css();
  damaCSS();
  const el = P.ui.screenEl();
  const p = P.pref('dama');
  const M = window.KARTI_MP;
  const canOnline = !!(M && M.openFor);
  const relayDown = !!(canOnline && M.PR && M.PR.tried && M.PR.err);
  let level = DM_LVL[+p.level] ? String(+p.level) : '2';
  let side  = (p.side === 'b') ? 'b' : 'w';
  const r = P.recOf ? P.recOf('dama') : { w:0, l:0, d:0 };
  const played = r.w + r.l + r.d;
  const sv = loadSave();
  const svLine = sv
    ? (sv.mode === 'ai' ? 'You vs the phone' : 'Pass the phone') + ' — ' +
      sv.log.length + (sv.log.length === 1 ? ' move' : ' moves') + ' in.'
    : '';

  const door = (v, icon, name, sub, cls) =>
    '<button type="button" class="dm-door' + (cls ? ' ' + cls : '') + '" data-go="' + v + '">' +
      ico(icon) + '<b>' + esc(name) + '</b><i id="dm-sub-' + v + '">' + esc(sub) + '</i>' +
      '<svg class="ico dm-chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<use href="#i-arrow-right"></use></svg>' +
    '</button>';

  /* the identity piece: the game's own stones, fanned — a stack of cream,
     a bajtra, the crowned king standing tall, and back down the other side */
  const hero =
    '<div class="dmm-hero" aria-hidden="true">' +
      '<span class="dmm-stone st"></span>' +
      '<span class="dmm-stone b"></span>' +
      '<span class="dmm-stone b k">' + U.pieceSVG('pt-crown') + '</span>' +
      '<span class="dmm-stone"></span>' +
      '<span class="dmm-stone b st"></span>' +
    '</div>';

  const rrow = (cls, name, text, crown) =>
    '<div class="dmm-rule"><span class="dmm-ric ' + cls + '">' +
    (crown ? U.pieceSVG('pt-crown') : '') + '</span><b>' + esc(name) + '</b><i>' +
    esc(text) + '</i></div>';
  const rulesRows =
    rrow('b', 'Taking is compulsory',
      'If a jump is on the board, nothing else is a move. The app will not let you ' +
      'wriggle out of it, same as your uncle would not.') +
    rrow('', 'Finish the chain',
      'A jump that can carry on must carry on. The whole chain is one move — there is ' +
      'no stopping halfway because you fancy the view.') +
    rrow('b', 'Crowning',
      'Reach the far row and you come back a king, and a king moves and takes backwards ' +
      'too. Crowning ends the move on the spot, even if the new king could jump.', true) +
    rrow('x', 'How you lose',
      'Run out of legal moves. No stones left, or every one of them boxed in — twelve ' +
      'on the board with nowhere to go is still a loss.') +
    rrow('d', 'The draws',
      'Forty moves each with nothing taken and no man moved, or the same position three ' +
      'times over. Nobody pays.');

  el.innerHTML =
    '<div class="pt-wrap dmm">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="pt-back" aria-label="Back to party games">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Dama</h2>' +
      (played ? '<span class="pt-badge">' + r.w + 'W ' + r.l + 'L ' + r.d + 'D</span>' : '') +
    '</div>' +
    '<div class="scroll dm-setup">' +
      hero +
      '<p class="blurb">Twelve stones each on the dark squares. If there is a take you ' +
        '<b>TAKE</b> it — the app will not let you wriggle out of it. Get to the far side ' +
        'and you come back a king.</p>' +
      '<div class="tiny pt-lbl">Who are you playing</div>' +
      '<div class="dm-doors">' +
        (sv ? door('resume', 'play', 'Carry on with the saved board', svLine, 'hero') : '') +
        (canOnline ? door('online', 'users', 'Somebody online',
            relayDown ? 'The server cannot be reached from this phone.'
                      : 'Open a room, or take one that is waiting.',
            relayDown ? 'off' : '') : '') +
        door('ai', 'coach', 'You vs the phone', '', sv ? '' : 'hero') +
        door('pnp', 'users', 'Pass the phone', 'Two of you, one screen, no internet.') +
      '</div>' +
      (relayDown
        ? '<p class="pt-warn">The KARTI server cannot be reached from this phone right ' +
          'now, so an online game would not get past the room list. <b>If Tailscale is ' +
          'on, turn it off.</b> The phone and pass-the-phone both work with no internet ' +
          'at all.</p>'
        : '') +
      '<div class="tiny pt-lbl">How hard is the phone</div>' +
      '<div class="pt-opts" id="dm-lvl">' +
        [1, 2, 3].map(k => '<button class="pt-opt" data-v="' + k + '">' +
          ico(DM_LVL[k].icon) + '<b>' + esc(DM_LVL[k].name) + '</b><i>' +
          esc(DM_LVL[k].note) + '</i></button>').join('') +
      '</div>' +
      '<div class="tiny pt-lbl">And you play</div>' +
      '<div class="pt-opts two" id="dm-side">' +
        '<button class="pt-opt" data-v="w"><span class="pt-swatch w"></span>' +
          '<b>Ġbejniet</b><i>The cream ones. You go first.</i></button>' +
        '<button class="pt-opt" data-v="b"><span class="pt-swatch r"></span>' +
          '<b>Bajtar</b><i>The red ones. It goes first.</i></button>' +
      '</div>' +
      (played
        ? '<p class="pt-ledger">Against the phone so far: <b>' + r.w + '</b> won, <b>' + r.l +
          '</b> lost, <b>' + r.d + '</b> drawn.</p>'
        : '') +
      '<p class="pt-foot">Nothing here is a contract. Undo takes a move back, New deals ' +
        'twelve fresh stones — and the house rules sit at the bottom if anybody argues.</p>' +
    '</div>' +
    '<div class="dmm-dock" id="dm-dock">' +
      '<button type="button" class="dmm-grip" id="dm-grip" aria-expanded="false" ' +
        'aria-controls="dm-dockbody" aria-label="Open the house rules">' +
        ico('book') + '<span>The house rules</span>' +
        '<svg class="cv" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M6 14.6l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" ' +
          'stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<div class="dmm-body" id="dm-dockbody" hidden><div>' + rulesRows + '</div></div>' +
    '</div>' +
    '</div>';

  const sync = () => {
    el.querySelectorAll('#dm-lvl .pt-opt').forEach(b =>
      b.classList.toggle('on', b.dataset.v === String(level)));
    el.querySelectorAll('#dm-side .pt-opt').forEach(b =>
      b.classList.toggle('on', b.dataset.v === side));
    const L = DM_LVL[+level] || DM_LVL[2];
    const sub = el.querySelector('#dm-sub-ai');
    if (sub) sub.textContent = L.name + ' · you take the ' +
      (side === 'w' ? 'Ġbejniet, and you go first' : 'Bajtar, and it goes first');
  };
  el.querySelectorAll('#dm-lvl .pt-opt').forEach(b =>
    b.onclick = () => { level = b.dataset.v; sync(); });
  el.querySelectorAll('#dm-side .pt-opt').forEach(b =>
    b.onclick = () => { side = b.dataset.v; sync(); });
  sync();

  el.querySelectorAll('.dm-door').forEach(b => b.onclick = () => {
    const go = b.dataset.go;
    if (go === 'resume'){ restoreSaved(); return; }
    P.pref('dama', { mode: go, level: level, side: side });
    if (go === 'online'){
      if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('dama');
      return;
    }
    newGame({ mode: go, level: level, side: side });
  });
  el.querySelector('#pt-back').onclick = () => P.hub();

  /* the dock remembers whether you left it open — a UI preference, in a
     UI-only key, never in the game save. Same pattern as kiri's dock. */
  const dock = el.querySelector('#dm-dock');
  const grip = el.querySelector('#dm-grip');
  const dbody = el.querySelector('#dm-dockbody');
  const setDock = open => {
    dock.classList.toggle('open', open);
    dbody.hidden = !open;
    grip.setAttribute('aria-expanded', open ? 'true' : 'false');
    grip.setAttribute('aria-label', open ? 'Close the house rules' : 'Open the house rules');
    try { localStorage.setItem(UI_KEY + '.rules', open ? '1' : '0'); } catch(e){}
  };
  grip.onclick = () => setDock(dbody.hidden);
  let dockOpen = false;
  try { dockOpen = localStorage.getItem(UI_KEY + '.rules') === '1'; } catch(e){}
  if (dockOpen) setDock(true);
}
function leave(){
  if (!G) return;
  saveGame();                     /* every way out writes the board first */
  const net = online() ? G.net : null;
  G.dead = true;
  if (G.ctx && G.ctx.stopFit) G.ctx.stopFit();
  G = null;
  if (net && net.onGone) net.onGone();
}

/* the two lifecycle events iOS actually fires on a swipe-away — see chess.js */
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
window.addEventListener('pagehide', () => saveGame());

P.register({
  id:'dama', order:20, kind:'board', name:'DAMA', mt:'Id-dama', sprite:'pt-crown', status:'live',
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

/* ═══════════════════════════════════════════════════════════════════
   DAMA — THE KIT SHELF (purely cosmetic, always)
   Boards and stone sets, declared through KARTI_XP.register() and
   applied as CSS scoped to the dama wrap (.dm). party.js reads
   --lite/--dark for the squares, and the stones are plain CSS
   circles, so a theme here is only a re-declaration of colours one
   scope down — not one rule, take or chain is touched, and
   unequipping simply falls back to the stock board. The style node
   is re-appended on every change so it always lands after the
   game's own sheet. */
(function(){
'use strict';

var BOARDS = {
  'dama.board.tapit': { l:'#E8E3CC', d:'#41684C', f:'#102418' },
  'dama.board.gewza': { l:'#E9CFA0', d:'#69411F', f:'#291505' },
  'dama.board.moll':  { l:'#DCE8F1', d:'#31618A', f:'#0F2740' },
  'dama.board.festa': { l:'#F4E6C6', d:'#4C2D75', f:'#FFC642' },
  /* MALTESE SUMMER */
  'dama.board.ghajn': { l:'#EDA97A', d:'#1F9BB0', f:'#8A3A18' }
};
var STONES = {
  'dama.stones.zebbug': { w:['#F7EAC2','#D8BC7E','#9C7B45'], b:['#4A4A30','#33301E','#1A180E'], cw:'#5C4A14', cb:'#D8D2A0' },
  'dama.stones.hgieg':  { w:['#EDFAF2','#B8E0CC','#7FB59A'], b:['#4A90C2','#235E8C','#0F3350'], cw:'#1E5E4A', cb:'#BFE4F5' },
  'dama.stones.kwarz':  { w:['#FBEAEF','#EFC3D0','#C98FA4'], b:['#7C4066','#55254A','#2E1030'], cw:'#7A3A52', cb:'#F2CFE4' },
  'dama.stones.hadid':  { w:['#F7E4A8','#D2A748','#8F6A1E'], b:['#9AA0A8','#5C636C','#2C3138'], cw:'#5C4408', cb:'#E8ECF2' },
  'dama.stones.faham':  { w:['#F4FFC8','#C6F23E','#7FA818'], b:['#4A4E52','#2A2D30','#131416'], cw:'#3E5A00', cb:'#D8F566' },
  'dama.stones.qamar':  { w:['#F4F4FC','#CBCBE4','#9494B8'], b:['#3A3E68','#1E2144','#0A0B1E'], cw:'#3C3C6E', cb:'#9A8CFF' },
  /* MALTESE SUMMER */
  'dama.stones.lampuki':{ w:['#FFF0A8','#5AD3A2','#12798C'], b:['#68787A','#3C4B4E','#1A2529'], cw:'#0B3E46', cb:'#FFD46A' }
};

function sheet(){
  var st = document.getElementById('dmx-kit-css');
  if (!st){ st = document.createElement('style'); st.id = 'dmx-kit-css'; }
  /* appendChild MOVES an existing node to the end, so this sheet is
     always later than the game's own and its equal-specificity rules
     win. The #app prefix out-specifies party.js's #scr-party rules. */
  document.head.appendChild(st);
  return st;
}

/* the stock stone shadows, restated verbatim so the depth survives */
var SHW = 'inset 0 -3px 5px rgba(0,0,0,.28),0 2px 4px rgba(0,0,0,.45),0 0 0 2px rgba(58,34,16,.55)';
var SHB = 'inset 0 -3px 5px rgba(0,0,0,.42),0 2px 4px rgba(0,0,0,.5),0 0 0 2px rgba(42,7,0,.5)';

function grad(c){ return 'radial-gradient(circle at 34% 28%,' + c[0] + ',' + c[1] + ' ' + c[3] + ',' + c[2] + ')'; }
function gw(t){ return grad([t.w[0], t.w[1], t.w[2], '58%']); }
function gb(t){ return grad([t.b[0], t.b[1], t.b[2], '55%']); }

function apply(){
  var XP = window.KARTI_XP;
  if (!XP) return;
  var css = '', b = BOARDS[XP.equipped('board', 'dama') || ''];
  if (b) css += '#app #scr-party .dm{--lite:' + b.l + ';--dark:' + b.d + '}' +
                '#app #scr-party .pt-wrap.dm .pt-board{border-color:' + b.f + '}';
  var s = STONES[XP.equipped('stones', 'dama') || ''];
  if (s) css += '#app #scr-party .dm .pt-stone.w{background:' + gw(s) + ';box-shadow:' + SHW + '}' +
                '#app #scr-party .dm .pt-stone.b{background:' + gb(s) + ';box-shadow:' + SHB + '}' +
                '#app #scr-party .dm .pt-stone.w .pt-pcs{fill:' + s.cw + '}' +
                '#app #scr-party .dm .pt-stone.b .pt-pcs{fill:' + s.cb + '}';
  sheet().textContent = css;
}

/* the preview is the thing doing its job: four ranks of real squares */
function boardPv(t){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style',
      'display:block;width:' + s + 'px;height:' + s + 'px;border-radius:8px;' +
      'border:3px solid ' + t.f + ';box-sizing:border-box;' +
      'background:conic-gradient(' + t.d + ' 90deg,' + t.l + ' 0 180deg,' +
      t.d + ' 0 270deg,' + t.l + ' 0);background-size:50% 50%');
    return el;
  };
}

/* two stones side by side, wearing the set's actual gradients */
function stonePv(t){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style', 'display:flex;align-items:center;justify-content:center;' +
      'gap:3px;width:' + s + 'px;height:' + s + 'px');
    function one(bg, ring){
      var d = Math.floor(s * .38);
      return '<span style="width:' + d + 'px;height:' + d + 'px;border-radius:50%;' +
             'background:' + bg + ';box-shadow:0 0 0 2px ' + ring + '"></span>';
    }
    el.innerHTML = one(gw(t), 'rgba(58,34,16,.55)') + one(gb(t), 'rgba(42,7,0,.5)');
    return el;
  };
}

function boot(tries){
  var XP = window.KARTI_XP;
  if (!XP){ if (tries < 40) setTimeout(function(){ boot(tries + 1); }, 500); return; }
  var KIT = XP.forGame('dama');
  KIT.register([
    { slot:'board', id:'dama.board.tapit', level:3,  name:'Tapit tal-Boċċi',
      blurb:'The green cloth off the boċċi pitch, argued over nightly.', preview:boardPv(BOARDS['dama.board.tapit']) },
    { slot:'board', id:'dama.board.gewza', level:8,  name:'Ġewża tan-Nannu',
      blurb:'The nannu’s walnut table. Do not put a glass on it.', preview:boardPv(BOARDS['dama.board.gewza']) },
    { slot:'board', id:'dama.board.moll',  level:19, name:'Il-Moll',
      blurb:'Quay water and painted hulls. Mind the gap.', preview:boardPv(BOARDS['dama.board.moll']) },
    { slot:'board', id:'dama.board.festa', level:28, name:'Festa Vjola',
      blurb:'Purple velvet in a gilded rim. Somewhere a march is starting.', preview:boardPv(BOARDS['dama.board.festa']) },
    { slot:'board', id:'dama.board.ghajn', level:15, name:'Għajn Tuffieħa', set:'summer',
      blurb:'Red sand and shallow water. Two hundred steps down, two thousand back up.', preview:boardPv(BOARDS['dama.board.ghajn']) },

    { slot:'stones', id:'dama.stones.zebbug', level:0,  name:'Żebbuġ',
      blurb:'Olive wood against black olives. Somebody will try to eat one.', preview:stonePv(STONES['dama.stones.zebbug']) },
    { slot:'stones', id:'dama.stones.hgieg',  level:5,  name:'Ħġieġ tal-Baħar',
      blurb:'Sea glass against channel blue, smoothed by forty winters.', preview:stonePv(STONES['dama.stones.hgieg']) },
    { slot:'stones', id:'dama.stones.kwarz',  level:12, name:'Kwarz u Għanbaqar',
      blurb:'Rose quartz against plum, off the shelf nobody is allowed to touch.', preview:stonePv(STONES['dama.stones.kwarz']) },
    { slot:'stones', id:'dama.stones.hadid',  level:21, name:'Ram u Ħadid',
      blurb:'Brass against iron, straight off the dockyard bench.', preview:stonePv(STONES['dama.stones.hadid']) },
    { slot:'stones', id:'dama.stones.faham',  level:33, name:'Lumi u Faħam',
      blurb:'Electric lime against charcoal. Visible from Sicily.', preview:stonePv(STONES['dama.stones.faham']) },
    { slot:'stones', id:'dama.stones.qamar',  level:44, name:'Qamar u Lejl',
      blurb:'Moonstone against midnight. The last game before somebody yawns first.', preview:stonePv(STONES['dama.stones.qamar']) },
    { slot:'stones', id:'dama.stones.lampuki',level:7,  name:'Lampuki', set:'summer',
      blurb:'Straight off the boat and still flashing gold. By Sunday it is a pie.', preview:stonePv(STONES['dama.stones.lampuki']) }
  ]);
  KIT.onChange(apply);
  apply();
}
boot(0);

})();
