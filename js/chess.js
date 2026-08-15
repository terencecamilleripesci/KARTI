/* ═══════════════════════════════════════════════════════════════════
   KARTI — chess.js   ·   PARTY GAMES: CHESS

   A whole game of chess, not a board that lets you push wood about.
   The engine below generates only legal moves — castling (with every
   one of its conditions), en passant, promotion to any of the four
   pieces — and it knows when the game is over: checkmate, stalemate,
   the fifty-move rule, threefold repetition, and the dead positions
   where neither side owns enough material to mate anybody.

   HOW IT IS BUILT
     board   Int8Array(64). Index 0 is a8, 63 is h1, so index = r*8+f
             with r counted DOWN from rank 8 and f counted UP from the
             a-file. Every loop in here uses that and nothing else.
     piece   type in the low three bits (1 P, 2 N, 3 B, 4 R, 5 Q, 6 K)
             and bit 3 set for black. So 1 is a white pawn, 9 a black
             one, 0 an empty square.
     move    a plain object, and the search MUTATES the position with
             make() / unmake() rather than cloning a board per node —
             that is the only reason a four-ply search is comfortable
             on a phone.

   The engine is exported on KARTI_PARTY.engines.chess so it can be
   driven straight from a test harness (and so a future online mode
   could re-check an opponent's move without touching the UI).
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

const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
const BLACK = 8;                       /* colour bit */
const typ = p => p & 7;
const isB = p => (p & BLACK) !== 0;
const isW = p => p !== 0 && (p & BLACK) === 0;
const sameSide = (p, black) => p !== 0 && (((p & BLACK) !== 0) === black);

/* castling rights, one bit each */
const CR_WK = 1, CR_WQ = 2, CR_BK = 4, CR_BQ = 8;

/* move flags */
const F_DBL = 1, F_EP = 2, F_CK = 4, F_CQ = 8;

const FILE = i => i & 7;
const RANK = i => i >> 3;              /* 0 = rank 8 */
const SQ   = (f, r) => r * 8 + f;
const NAME = i => 'abcdefgh'[FILE(i)] + (8 - RANK(i));
const FROM_NAME = s => SQ('abcdefgh'.indexOf(s[0]), 8 - parseInt(s[1], 10));

const KN_D   = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
const DIAG_D = [[1,1],[1,-1],[-1,1],[-1,-1]];
const ORTH_D = [[1,0],[-1,0],[0,1],[0,-1]];
const ALL_D  = DIAG_D.concat(ORTH_D);

const FEN_CH = { 1:'P', 2:'N', 3:'B', 4:'R', 5:'Q', 6:'K',
                 9:'p', 10:'n', 11:'b', 12:'r', 13:'q', 14:'k' };
const CH_FEN = {}; Object.keys(FEN_CH).forEach(k => CH_FEN[FEN_CH[k]] = +k);

/* ── positions ─────────────────────────────────────────────────── */
function fromFEN(fen){
  const parts = String(fen).trim().split(/\s+/);
  const b = new Int8Array(64);
  let i = 0;
  for (const ch of parts[0]){
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8'){ i += +ch; continue; }
    b[i++] = CH_FEN[ch] || 0;
  }
  let c = 0;
  const rights = parts[2] || '-';
  if (rights.indexOf('K') >= 0) c |= CR_WK;
  if (rights.indexOf('Q') >= 0) c |= CR_WQ;
  if (rights.indexOf('k') >= 0) c |= CR_BK;
  if (rights.indexOf('q') >= 0) c |= CR_BQ;
  return {
    b, black: (parts[1] === 'b'), c,
    ep: (parts[3] && parts[3] !== '-') ? FROM_NAME(parts[3]) : -1,
    half: parts[4] ? +parts[4] : 0,
    full: parts[5] ? +parts[5] : 1
  };
}
function toFEN(st){
  let out = '', run = 0;
  for (let i = 0; i < 64; i++){
    if (i && i % 8 === 0){ if (run){ out += run; run = 0; } out += '/'; }
    if (st.b[i]) { if (run){ out += run; run = 0; } out += FEN_CH[st.b[i]]; }
    else run++;
  }
  if (run) out += run;
  let r = (st.c & CR_WK ? 'K' : '') + (st.c & CR_WQ ? 'Q' : '') +
          (st.c & CR_BK ? 'k' : '') + (st.c & CR_BQ ? 'q' : '');
  return out + ' ' + (st.black ? 'b' : 'w') + ' ' + (r || '-') + ' ' +
         (st.ep >= 0 ? NAME(st.ep) : '-') + ' ' + st.half + ' ' + st.full;
}
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const startPos = () => fromFEN(START_FEN);
function clone(st){
  return { b: st.b.slice(), black: st.black, c: st.c, ep: st.ep, half: st.half, full: st.full };
}
/* everything that makes two positions "the same" for repetition:
   men, side to move, castling rights, en-passant file. */
function posKey(st){
  let s = '';
  for (let i = 0; i < 64; i++) s += st.b[i] ? FEN_CH[st.b[i]] : '.';
  return s + (st.black ? 'b' : 'w') + st.c + ':' + st.ep;
}

/* ── is `sq` attacked by the given side? ───────────────────────────
   Scanned outwards from the square rather than by generating every
   enemy move: this is called once per node in the search, so it is
   the hottest thing in the file. */
function attacked(b, sq, byBlack){
  const f = FILE(sq), r = RANK(sq);

  /* pawns. A white pawn on (f±1, r+1) attacks (f, r); a black one sits
     on (f±1, r-1). Note the +1/-1 is in ROW index, which counts down
     from rank 8 — a white pawn is always on a HIGHER row index. */
  const pr = byBlack ? r - 1 : r + 1;
  if (pr >= 0 && pr < 8){
    const pawn = byBlack ? (PAWN | BLACK) : PAWN;
    if (f > 0 && b[SQ(f - 1, pr)] === pawn) return true;
    if (f < 7 && b[SQ(f + 1, pr)] === pawn) return true;
  }
  /* knights */
  const kn = byBlack ? (KNIGHT | BLACK) : KNIGHT;
  for (let i = 0; i < 8; i++){
    const nf = f + KN_D[i][0], nr = r + KN_D[i][1];
    if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
    if (b[SQ(nf, nr)] === kn) return true;
  }
  /* king */
  const kg = byBlack ? (KING | BLACK) : KING;
  for (let i = 0; i < 8; i++){
    const nf = f + ALL_D[i][0], nr = r + ALL_D[i][1];
    if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
    if (b[SQ(nf, nr)] === kg) return true;
  }
  /* sliders */
  for (let d = 0; d < 8; d++){
    const df = ALL_D[d][0], dr = ALL_D[d][1];
    const diagonal = d < 4;
    let nf = f + df, nr = r + dr;
    while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8){
      const p = b[SQ(nf, nr)];
      if (p){
        if (((p & BLACK) !== 0) === byBlack){
          const t = typ(p);
          if (t === QUEEN) return true;
          if (diagonal ? t === BISHOP : t === ROOK) return true;
        }
        break;
      }
      nf += df; nr += dr;
    }
  }
  return false;
}

function kingSq(b, black){
  const k = black ? (KING | BLACK) : KING;
  for (let i = 0; i < 64; i++) if (b[i] === k) return i;
  return -1;
}
function inCheck(st, black){
  const k = kingSq(st.b, black === undefined ? st.black : black);
  return k >= 0 && attacked(st.b, k, !(black === undefined ? st.black : black));
}

/* ── pseudo-legal generation ───────────────────────────────────────
   "Pseudo" because it happily leaves its own king en prise; genMoves()
   below filters those out by playing each one. Castling is the single
   exception: its check conditions are so specific that they are tested
   here, where the geometry is already to hand. */
function genPseudo(st, out){
  const b = st.b, black = st.black;
  out = out || [];
  for (let i = 0; i < 64; i++){
    const p = b[i];
    if (!p || ((p & BLACK) !== 0) !== black) continue;
    const f = FILE(i), r = RANK(i), t = typ(p);

    if (t === PAWN){
      const fwd = black ? 1 : -1;
      const startRow = black ? 1 : 6;
      const lastRow  = black ? 7 : 0;
      const r1 = r + fwd;
      if (r1 >= 0 && r1 < 8 && !b[SQ(f, r1)]){
        if (r1 === lastRow) pushPromos(out, i, SQ(f, r1), p, 0, -1);
        else {
          out.push({ from:i, to:SQ(f, r1), p, cap:0, capSq:-1, promo:0, fl:0 });
          const r2 = r + fwd * 2;
          if (r === startRow && !b[SQ(f, r2)])
            out.push({ from:i, to:SQ(f, r2), p, cap:0, capSq:-1, promo:0, fl:F_DBL });
        }
      }
      for (const df of [-1, 1]){
        const nf = f + df;
        if (nf < 0 || nf > 7 || r1 < 0 || r1 > 7) continue;
        const to = SQ(nf, r1), q = b[to];
        if (q && ((q & BLACK) !== 0) !== black){
          if (r1 === lastRow) pushPromos(out, i, to, p, q, to);
          else out.push({ from:i, to, p, cap:q, capSq:to, promo:0, fl:0 });
        } else if (!q && to === st.ep){
          /* en passant: the pawn taken is NOT on the square we land on */
          const capSq = SQ(nf, r);
          out.push({ from:i, to, p, cap:b[capSq], capSq, promo:0, fl:F_EP });
        }
      }
      continue;
    }

    if (t === KNIGHT){
      for (let d = 0; d < 8; d++) step(b, out, i, f + KN_D[d][0], r + KN_D[d][1], p, black);
      continue;
    }
    if (t === KING){
      for (let d = 0; d < 8; d++) step(b, out, i, f + ALL_D[d][0], r + ALL_D[d][1], p, black);
      continue;
    }
    const dirs = t === BISHOP ? DIAG_D : t === ROOK ? ORTH_D : ALL_D;
    for (const [df, dr] of dirs){
      let nf = f + df, nr = r + dr;
      while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8){
        const to = SQ(nf, nr), q = b[to];
        if (!q) out.push({ from:i, to, p, cap:0, capSq:-1, promo:0, fl:0 });
        else {
          if (((q & BLACK) !== 0) !== black)
            out.push({ from:i, to, p, cap:q, capSq:to, promo:0, fl:0 });
          break;
        }
        nf += df; nr += dr;
      }
    }
  }
  genCastles(st, out);
  return out;
}
function step(b, out, from, nf, nr, p, black){
  if (nf < 0 || nf > 7 || nr < 0 || nr > 7) return;
  const to = SQ(nf, nr), q = b[to];
  if (q && ((q & BLACK) !== 0) === black) return;
  out.push({ from, to, p, cap:q, capSq:q ? to : -1, promo:0, fl:0 });
}
function pushPromos(out, from, to, p, cap, capSq){
  const bit = p & BLACK;
  for (const t of [QUEEN, ROOK, BISHOP, KNIGHT])
    out.push({ from, to, p, cap, capSq, promo: t | bit, fl:0 });
}

/* Castling, all five conditions, spelled out:
   the right must survive, the king and rook must actually be there,
   the squares between must be empty, the king must not be in check,
   and it must not pass through or land on an attacked square. The
   rook's own path (b1 on a queenside castle) may be attacked — that
   is legal, and getting it wrong is the classic bug. */
function genCastles(st, out){
  const b = st.b, black = st.black;
  if (black){
    if ((st.c & CR_BK) && b[4] === (KING|BLACK) && b[7] === (ROOK|BLACK) &&
        !b[5] && !b[6] &&
        !attacked(b, 4, false) && !attacked(b, 5, false) && !attacked(b, 6, false))
      out.push({ from:4, to:6, p:KING|BLACK, cap:0, capSq:-1, promo:0, fl:F_CK });
    if ((st.c & CR_BQ) && b[4] === (KING|BLACK) && b[0] === (ROOK|BLACK) &&
        !b[1] && !b[2] && !b[3] &&
        !attacked(b, 4, false) && !attacked(b, 3, false) && !attacked(b, 2, false))
      out.push({ from:4, to:2, p:KING|BLACK, cap:0, capSq:-1, promo:0, fl:F_CQ });
  } else {
    if ((st.c & CR_WK) && b[60] === KING && b[63] === ROOK &&
        !b[61] && !b[62] &&
        !attacked(b, 60, true) && !attacked(b, 61, true) && !attacked(b, 62, true))
      out.push({ from:60, to:62, p:KING, cap:0, capSq:-1, promo:0, fl:F_CK });
    if ((st.c & CR_WQ) && b[60] === KING && b[56] === ROOK &&
        !b[57] && !b[58] && !b[59] &&
        !attacked(b, 60, true) && !attacked(b, 59, true) && !attacked(b, 58, true))
      out.push({ from:60, to:58, p:KING, cap:0, capSq:-1, promo:0, fl:F_CQ });
  }
}

/* ── make / unmake, in place ───────────────────────────────────────
   The undo record carries everything make() destroys. */
function make(st, m){
  const u = { c: st.c, ep: st.ep, half: st.half, full: st.full };
  const b = st.b;
  b[m.from] = 0;
  if (m.capSq >= 0) b[m.capSq] = 0;
  b[m.to] = m.promo || m.p;

  if (m.fl & F_CK){                         /* rook jumps the king */
    if (st.black){ b[7] = 0; b[5] = ROOK | BLACK; }
    else         { b[63] = 0; b[61] = ROOK; }
  } else if (m.fl & F_CQ){
    if (st.black){ b[0] = 0; b[3] = ROOK | BLACK; }
    else         { b[56] = 0; b[59] = ROOK; }
  }

  /* rights die when the king moves, when a rook leaves home, and —
     the one people forget — when a rook is CAPTURED on its home square */
  const t = typ(m.p);
  if (t === KING) st.c &= st.black ? ~(CR_BK | CR_BQ) : ~(CR_WK | CR_WQ);
  if (m.from === 63 || m.to === 63) st.c &= ~CR_WK;
  if (m.from === 56 || m.to === 56) st.c &= ~CR_WQ;
  if (m.from === 7  || m.to === 7)  st.c &= ~CR_BK;
  if (m.from === 0  || m.to === 0)  st.c &= ~CR_BQ;

  st.ep = (m.fl & F_DBL) ? ((m.from + m.to) >> 1) : -1;
  st.half = (t === PAWN || m.cap) ? 0 : st.half + 1;
  if (st.black) st.full++;
  st.black = !st.black;
  return u;
}
function unmake(st, m, u){
  const b = st.b;
  st.black = !st.black;
  st.c = u.c; st.ep = u.ep; st.half = u.half; st.full = u.full;
  b[m.to] = 0;
  b[m.from] = m.p;
  if (m.capSq >= 0) b[m.capSq] = m.cap;
  if (m.fl & F_CK){
    if (st.black){ b[5] = 0; b[7] = ROOK | BLACK; }
    else         { b[61] = 0; b[63] = ROOK; }
  } else if (m.fl & F_CQ){
    if (st.black){ b[3] = 0; b[0] = ROOK | BLACK; }
    else         { b[59] = 0; b[56] = ROOK; }
  }
}

/* ── legal moves ───────────────────────────────────────────────── */
function genMoves(st){
  const ps = genPseudo(st), out = [];
  for (const m of ps){
    const u = make(st, m);
    const bad = inCheck(st, !st.black);   /* the side that just moved */
    unmake(st, m, u);
    if (!bad) out.push(m);
  }
  return out;
}
/* apply a move to a COPY — what the UI and the tests use */
function applied(st, m){ const n = clone(st); make(n, m); return n; }

/* ── endings ───────────────────────────────────────────────────── */
function insufficient(b){
  let wb = 0, bb = 0, wn = 0, bn = 0, wbSq = -1, bbSq = -1, other = false;
  for (let i = 0; i < 64; i++){
    const p = b[i]; if (!p) continue;
    const t = typ(p);
    if (t === KING) continue;
    if (t === BISHOP){ if (isB(p)){ bb++; bbSq = i; } else { wb++; wbSq = i; } }
    else if (t === KNIGHT){ if (isB(p)) bn++; else wn++; }
    else other = true;
  }
  if (other) return false;
  const w = wb + wn, k = bb + bn;
  if (w === 0 && k === 0) return true;                       /* K v K       */
  if (w + k === 1) return true;                              /* K+minor v K */
  if (w === 1 && k === 1 && wb === 1 && bb === 1)            /* K+B v K+B,  */
    return ((FILE(wbSq) + RANK(wbSq)) & 1) === ((FILE(bbSq) + RANK(bbSq)) & 1);
  return false;
}

/* `reps` is the number of times the CURRENT position has appeared in
   the game so far (including now) — the controller keeps that count,
   because a position's history is a property of the game, not of the
   board in front of you. */
function status(st, reps){
  const moves = genMoves(st);
  if (!moves.length)
    return inCheck(st) ? { end:'mate',      win: st.black ? 'w' : 'b', moves }
                       : { end:'stalemate', win: null, moves };
  if (st.half >= 100)      return { end:'fifty',    win:null, moves };
  if ((reps || 0) >= 3)    return { end:'repeat',   win:null, moves };
  if (insufficient(st.b))  return { end:'material', win:null, moves };
  return { end:null, win:null, moves };
}

/* ── notation (display only) ───────────────────────────────────── */
const LET = { 2:'N', 3:'B', 4:'R', 5:'Q', 6:'K' };
function san(st, m){
  if (m.fl & F_CK) return '0-0' + suffix(st, m);
  if (m.fl & F_CQ) return '0-0-0' + suffix(st, m);
  const t = typ(m.p);
  let s;
  if (t === PAWN){
    s = m.cap ? 'abcdefgh'[FILE(m.from)] + 'x' + NAME(m.to) : NAME(m.to);
    if (m.promo) s += '=' + LET[typ(m.promo)];
  } else {
    /* disambiguate only when another same piece could also go there */
    let sameFile = false, sameRank = false, twin = false;
    for (const o of genMoves(st)){
      if (o.to === m.to && o.from !== m.from && typ(o.p) === t && o.p === m.p){
        twin = true;
        if (FILE(o.from) === FILE(m.from)) sameFile = true;
        if (RANK(o.from) === RANK(m.from)) sameRank = true;
      }
    }
    let dis = '';
    if (twin) dis = !sameFile ? 'abcdefgh'[FILE(m.from)]
                  : !sameRank ? String(8 - RANK(m.from))
                  : NAME(m.from);
    s = LET[t] + dis + (m.cap ? 'x' : '') + NAME(m.to);
  }
  return s + suffix(st, m);
}
function suffix(st, m){
  const n = applied(st, m);
  if (!inCheck(n)) return '';
  return genMoves(n).length ? '+' : '#';
}

/* ═══════════════════════════════════════════════════════════════════
   2. THE OPPONENT
   Negamax, alpha-beta, MVV-LVA ordering, and a quiescence search so
   it does not hang a queen on the horizon. Iterative deepening with a
   wall-clock budget, because a phone is a phone.
   ═══════════════════════════════════════════════════════════════════ */
const VAL = [0, 100, 320, 330, 500, 900, 20000];

const PST = {
  1:[  0,  0,  0,  0,  0,  0,  0,  0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
       5,  5, 10, 25, 25, 10,  5,  5,
       0,  0,  0, 20, 20,  0,  0,  0,
       5, -5,-10,  0,  0,-10, -5,  5,
       5, 10, 10,-20,-20, 10, 10,  5,
       0,  0,  0,  0,  0,  0,  0,  0],
  2:[-50,-40,-30,-30,-30,-30,-40,-50,
     -40,-20,  0,  0,  0,  0,-20,-40,
     -30,  0, 10, 15, 15, 10,  0,-30,
     -30,  5, 15, 20, 20, 15,  5,-30,
     -30,  0, 15, 20, 20, 15,  0,-30,
     -30,  5, 10, 15, 15, 10,  5,-30,
     -40,-20,  0,  5,  5,  0,-20,-40,
     -50,-40,-30,-30,-30,-30,-40,-50],
  3:[-20,-10,-10,-10,-10,-10,-10,-20,
     -10,  0,  0,  0,  0,  0,  0,-10,
     -10,  0,  5, 10, 10,  5,  0,-10,
     -10,  5,  5, 10, 10,  5,  5,-10,
     -10,  0, 10, 10, 10, 10,  0,-10,
     -10, 10, 10, 10, 10, 10, 10,-10,
     -10,  5,  0,  0,  0,  0,  5,-10,
     -20,-10,-10,-10,-10,-10,-10,-20],
  4:[  0,  0,  0,  0,  0,  0,  0,  0,
       5, 10, 10, 10, 10, 10, 10,  5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
       0,  0,  0,  5,  5,  0,  0,  0],
  5:[-20,-10,-10, -5, -5,-10,-10,-20,
     -10,  0,  0,  0,  0,  0,  0,-10,
     -10,  0,  5,  5,  5,  5,  0,-10,
      -5,  0,  5,  5,  5,  5,  0, -5,
       0,  0,  5,  5,  5,  5,  0, -5,
     -10,  5,  5,  5,  5,  5,  0,-10,
     -10,  0,  5,  0,  0,  0,  0,-10,
     -20,-10,-10, -5, -5,-10,-10,-20],
  6:[-30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -20,-30,-30,-40,-40,-30,-30,-20,
     -10,-20,-20,-20,-20,-20,-20,-10,
      20, 20,  0,  0,  0,  0, 20, 20,
      20, 30, 10,  0,  0, 10, 30, 20]
};
const KING_END =
    [-50,-40,-30,-20,-20,-30,-40,-50,
     -30,-20,-10,  0,  0,-10,-20,-30,
     -30,-10, 20, 30, 30, 20,-10,-30,
     -30,-10, 30, 40, 40, 30,-10,-30,
     -30,-10, 30, 40, 40, 30,-10,-30,
     -30,-10, 20, 30, 30, 20,-10,-30,
     -30,-30,  0,  0,  0,  0,-30,-30,
     -50,-30,-30,-30,-30,-30,-30,-50];
const MIRROR = i => (7 - RANK(i)) * 8 + FILE(i);

/* score from the side-to-move's point of view */
function evaluate(st){
  const b = st.b;
  let s = 0, heavy = 0, wb = 0, bb = 0;
  for (let i = 0; i < 64; i++){
    const p = b[i]; if (!p) continue;
    const t = typ(p);
    if (t === QUEEN || t === ROOK) heavy++;
    if (t === BISHOP){ if (isB(p)) bb++; else wb++; }
    const v = VAL[t] + (t === KING ? 0 : PST[t][isB(p) ? i : MIRROR(i)]);
    s += isB(p) ? -v : v;
  }
  /* king safety early, king activity late */
  const endgame = heavy <= 2;
  for (let i = 0; i < 64; i++){
    const p = b[i]; if (typ(p) !== KING) continue;
    const tb = endgame ? KING_END : PST[6];
    s += (isB(p) ? -1 : 1) * tb[isB(p) ? i : MIRROR(i)];
  }
  if (wb >= 2) s += 30;                      /* the pair is worth having */
  if (bb >= 2) s -= 30;
  return st.black ? -s : s;
}

const MATE = 100000;
let nodes = 0, deadline = 0, aborted = false;

function order(st, moves, best){
  for (const m of moves){
    let s = 0;
    if (best && m.from === best.from && m.to === best.to && m.promo === best.promo) s += 1e6;
    if (m.cap) s += 10 * VAL[typ(m.cap)] - VAL[typ(m.p)] + 5000;
    if (m.promo) s += 800 + VAL[typ(m.promo)];
    m._s = s;
  }
  moves.sort((a, b) => b._s - a._s);
  return moves;
}

/* Only captures and promotions, so the search never stops in the
   middle of a trade and calls the resulting mess "material up". */
function quiesce(st, alpha, beta){
  nodes++;
  if ((nodes & 1023) === 0 && Date.now() > deadline){ aborted = true; return alpha; }
  const stand = evaluate(st);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  const loud = genPseudo(st).filter(m => m.cap || m.promo);
  order(st, loud, null);
  for (const m of loud){
    const u = make(st, m);
    if (inCheck(st, !st.black)){ unmake(st, m, u); continue; }
    const v = -quiesce(st, -beta, -alpha);
    unmake(st, m, u);
    if (aborted) return alpha;
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function search(st, depth, alpha, beta, ply){
  /* CHECK EXTENSION, and it is not a refinement — it is the reason the
     thing can mate you at all. A leaf hands over to quiesce(), which
     stands pat on the evaluation and has no idea the side to move has
     run out of legal replies. Without this, a one-ply search happily
     played Kg2 with mate in one on the board. Never stop the search
     while somebody is in check: go one deeper and let the no-legal-
     moves branch below say the word. */
  const checked = inCheck(st);
  if (depth <= 0){
    if (!checked) return quiesce(st, alpha, beta);
    depth = 1;
  }
  nodes++;
  if ((nodes & 1023) === 0 && Date.now() > deadline){ aborted = true; return alpha; }
  const moves = order(st, genPseudo(st), null);
  let any = false;
  for (const m of moves){
    const u = make(st, m);
    if (inCheck(st, !st.black)){ unmake(st, m, u); continue; }
    any = true;
    const v = -search(st, depth - 1, -beta, -alpha, ply + 1);
    unmake(st, m, u);
    if (aborted) return alpha;
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  if (!any) return checked ? -MATE + ply : 0;   /* mated, or stalemated */
  return alpha;
}

/* levels: 1 tourist (one ply, and a wobbly hand), 2 club player,
   3 the grandmother who has never lost at anything */
const LEVELS = {
  1: { depth:1, ms:120,  noise:70 },
  2: { depth:3, ms:600,  noise:18 },
  3: { depth:5, ms:1200, noise:0  }
};

function bestMove(st, level){
  const L = LEVELS[level] || LEVELS[2];
  const root = genMoves(st);
  if (!root.length) return null;
  nodes = 0; aborted = false;
  deadline = Date.now() + L.ms;
  let best = root[0], bestScore = -Infinity;

  for (let d = 1; d <= L.depth; d++){
    order(st, root, best);
    let localBest = null, localScore = -Infinity;
    for (const m of root){
      const u = make(st, m);
      /* FULL WINDOW at the root, deliberately. Narrowing it to the best
         score so far is the usual trick, but then a move that merely
         fails high comes back as the bound `beta` rather than as its
         real score — and once the difficulty wobble below is added to
         that bound, a bound can out-score a genuine mate. It did: the
         easy levels walked past mate in one. The root has thirty-odd
         moves; exact scores there cost little and every cutoff inside
         the subtrees still applies. */
      let v = -search(st, d - 1, -Infinity, Infinity, 1);
      unmake(st, m, u);
      if (aborted) break;
      /* the wobble that makes an easy opponent easy — applied to a real
         score, never to a bound, and never big enough to hide a mate */
      if (L.noise && Math.abs(v) < MATE - 1000)
        v += Math.floor((Math.random() * 2 - 1) * L.noise);
      if (v > localScore){ localScore = v; localBest = m; }
    }
    if (localBest && !aborted){ best = localBest; bestScore = localScore; }
    if (aborted || Date.now() > deadline) break;
    if (bestScore > MATE - 100) break;          /* mate found, stop looking */
  }
  return best;
}

const ENGINE = {
  PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, BLACK,
  typ, isB, isW, NAME, FROM_NAME, SQ, FILE, RANK,
  fromFEN, toFEN, startPos, clone, posKey, START_FEN,
  genPseudo, genMoves, make, unmake, applied, attacked, inCheck, kingSq,
  status, insufficient, san, evaluate, bestMove, LEVELS,
  perft(st, d){                       /* the only honest test of move gen */
    if (d === 0) return 1;
    let n = 0;
    for (const m of genPseudo(st)){
      const u = make(st, m);
      if (!inCheck(st, !st.black)) n += this.perft(st, d - 1);
      unmake(st, m, u);
    }
    return n;
  }
};

/* ═══════════════════════════════════════════════════════════════════
   3. THE GAME ON SCREEN
   ═══════════════════════════════════════════════════════════════════ */
const SYM = { 1:'pt-p-p', 2:'pt-p-n', 3:'pt-p-b', 4:'pt-p-r', 5:'pt-p-q', 6:'pt-p-k' };

const QUIP_WIN = [
  'Go on, tell everyone. They will hear about it until Christmas anyway.',
  'That is one. The phone has all night and no wife calling it home.',
  'Beaten by a human. It will not mention this to the other apps.'
];
const QUIP_LOSE = [
  'It does not gloat. It just sits there, fully charged, waiting.',
  'You had it. You had it right up until you did not.',
  'Blame the small screen. Everybody does.'
];
const QUIP_DRAW = [
  'Nobody won, nobody paid for the coffee. Very Maltese.',
  'A draw. The most honest result there is, and the least fun.',
  'Two hours, no winner, and the bar is closing.'
];
const pick = a => a[Math.floor(Math.random() * a.length)];

let G = null;   /* the live game, or null */

function newGame(opts){
  G = {
    mode: opts.mode,                  /* 'pnp' | 'ai' | 'online' */
    level: +opts.level || 2,
    human: opts.side === 'b' ? 'b' : 'w',   /* your colour vs the phone OR online */
    /* online only: the pipe back to js/mp.js, and the two names */
    net: opts.net || null,
    me: opts.me || 'YOU', foe: opts.foe || 'THEM', netNote: '',
    st: startPos(),
    hist: [],                         /* {st, move, san} before each move */
    keys: {},                         /* posKey -> times seen */
    sel: -1, marks: [], last: null,
    over: null, thinking: false, ctx: null, dead: false
  };
  G.keys[posKey(G.st)] = 1;
  paint();
  maybeAI();
}

function online(){ return G.mode === 'online'; }
/* your own men are always at the bottom, whoever you are playing */
function flipped(){ return (G.mode === 'ai' || G.mode === 'online') && G.human === 'b'; }
/* screen row/col -> board index */
function sqAt(row, col){ return flipped() ? SQ(7 - col, 7 - row) : SQ(col, row); }

function paint(){
  const net = online();
  const ctx = P.ui.frame({
    title: 'Chess',
    /* online, walking away is leaving a ROOM, not closing a board — the back
       arrow has to go through js/mp.js so the other player is told */
    onBack: net ? () => askLeave() : () => { leave(); P.hub(); },
    leave,
    /* Online the Undo button is still here — it just has to be ASKED for.
       New game is not: that is not one player's to decide. */
    buttons: net
      ? [ { id:'ch-undo',   label:'Takeback', icon:'refresh' },
          { id:'ch-resign', label:'Resign',   icon:'flag' },
          { id:'ch-leave',  label:'Leave',    icon:'back' } ]
      : [ { id:'ch-undo',   label:'Undo',   icon:'refresh' },
          { id:'ch-resign', label:'Resign', icon:'flag' },
          { id:'ch-new',    label:'New',    icon:'play' } ]
  });
  G.ctx = ctx;

  /* 64 buttons, built once; render() only changes their innards */
  const board = ctx.board;
  board.innerHTML = '';
  G.cells = [];
  for (let row = 0; row < 8; row++){
    for (let col = 0; col < 8; col++){
      const i = sqAt(row, col);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pt-sq' + (((FILE(i) + RANK(i)) & 1) ? ' d' : '');
      b.dataset.i = i;
      b.setAttribute('aria-label', NAME(i));
      b.onclick = () => tap(i);
      board.appendChild(b);
      G.cells[i] = b;
    }
  }
  if (ctx.btn('ch-undo')) ctx.btn('ch-undo').onclick = undo;
  ctx.btn('ch-resign').onclick = () => P.ui.confirm(ctx, {
    head: 'Resign?', why: 'You hand them the game. There is no taking it back.',
    yes: 'Yes, I resign',
    /* offline the side to move resigns; online YOU resign, whoever's turn it is */
    go: () => {
      if (net){
        if (G.net) G.net.send('resign', null, null);
        finish({ end:'resign', win: G.human === 'w' ? 'b' : 'w' });
      } else finish({ end:'resign', win: G.st.black ? 'w' : 'b' });
    }
  });
  if (ctx.btn('ch-new')) ctx.btn('ch-new').onclick = () => P.ui.confirm(ctx, {
    head: 'Start again?', why: 'This board goes in the bin and a fresh one comes out.',
    yes: 'Yes, new game', go: () => start()
  });
  if (ctx.btn('ch-leave')) ctx.btn('ch-leave').onclick = askLeave;
  render();
}

/* Leaving an online game mid-play is a forfeit in everything but name, so it
   is asked out loud. Once the game is over it is just a door. */
function askLeave(){
  if (!G) return;
  if (G.over){ if (G.net) G.net.onLeave(); return; }
  P.ui.confirm(G.ctx, {
    head: 'Leave the game?',
    why: 'They are sat there waiting for your move. Walking out ends it for both of you.',
    yes: 'Yes, leave', no: 'No, carry on',
    go: () => { if (G && G.net) G.net.onLeave(); }
  });
}

function render(){
  const st = G.st, cells = G.cells;
  const chkSq = inCheck(st) ? kingSq(st.b, st.black) : -1;

  for (let i = 0; i < 64; i++){
    const el = cells[i];
    if (!el) continue;
    const p = st.b[i];
    let cls = 'pt-sq' + (((FILE(i) + RANK(i)) & 1) ? ' d' : '');
    if (G.last && (i === G.last.from || i === G.last.to)) cls += ' last';
    if (i === G.sel) cls += ' sel';
    if (i === chkSq) cls += ' chk';
    el.className = cls;

    const mark = G.marks.find(m => m.to === i);
    const row = flipped() ? 7 - RANK(i) : RANK(i);
    const col = flipped() ? 7 - FILE(i) : FILE(i);
    el.innerHTML =
      (row === 7 ? '<span class="pt-co f">' + 'abcdefgh'[FILE(i)] + '</span>' : '') +
      (col === 0 ? '<span class="pt-co r">' + (8 - RANK(i)) + '</span>' : '') +
      (p ? '<span class="pt-pc ' + (isB(p) ? 'pt-b' : 'pt-w') + '">' +
           U.pieceSVG(SYM[typ(p)]) + '</span>' : '') +
      (mark ? '<span class="pt-mark' + (mark.cap ? ' cap' : '') + '"></span>' : '');
    el.setAttribute('aria-label',
      NAME(i) + (p ? ', ' + (isB(p) ? 'black ' : 'white ') + PNAME[typ(p)] : ', empty'));
  }
  rails();
  strip();
  const u = G.ctx.btn('ch-undo');
  if (u) u.disabled = !G.hist.length || G.thinking || !!G.over;
  const r = G.ctx.btn('ch-resign');
  if (r) r.disabled = !!G.over;
}
const PNAME = { 1:'pawn', 2:'knight', 3:'bishop', 4:'rook', 5:'queen', 6:'king' };

/* what each side has taken off, and who is up on material */
function rails(){
  const start = { 1:8, 2:2, 3:2, 4:2, 5:1 };
  const have = { w:{}, b:{} };
  for (let i = 0; i < 64; i++){
    const p = G.st.b[i]; if (!p) continue;
    const s = isB(p) ? have.b : have.w;
    s[typ(p)] = (s[typ(p)] || 0) + 1;
  }
  const gone = side => {
    const out = [];
    for (const t of [5, 4, 3, 2, 1])
      for (let n = (start[t] || 0) - (have[side][t] || 0); n > 0; n--) out.push(+t);
    return out;
  };
  const score = side => gone(side).reduce((a, t) => a + VAL[t], 0);
  const bar = (lost, edge) =>
    lost.map(t => '<svg class="pt-mini ' + (edge.me === 'w' ? 'pt-w' : 'pt-b') +
      '" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + SYM[t] + '"></use></svg>').join('') +
    (edge.n > 0 ? '<span class="pt-edge">+' + edge.n + '</span>' : '');

  const wLost = gone('w'), bLost = gone('b');
  const diff = score('b') - score('w');    /* positive = white is up */
  const topIsBlack = !flipped();
  /* the rail above the board belongs to the player at the top */
  G.ctx.railTop.innerHTML = topIsBlack
    ? bar(wLost, { me:'w', n: diff < 0 ? Math.round(-diff / 100) : 0 })
    : bar(bLost, { me:'b', n: diff > 0 ? Math.round(diff / 100) : 0 });
  G.ctx.railBot.innerHTML = topIsBlack
    ? bar(bLost, { me:'b', n: diff > 0 ? Math.round(diff / 100) : 0 })
    : bar(wLost, { me:'w', n: diff < 0 ? Math.round(-diff / 100) : 0 });
}

function whoLabel(black){
  if (G.mode === 'pnp') return black ? 'Black to move' : 'White to move';
  const mine = (black ? 'b' : 'w') === G.human;
  if (online()) return mine ? 'Your move' : G.foe + ' to move';
  return mine ? 'Your move' : 'The phone is thinking';
}

function strip(){
  const st = G.st;
  const check = inCheck(st);
  let note = '';
  if (G.thinking) note = 'Thinking';
  else if (check) note = 'Check';
  else if (G.lastSan) note = G.lastSan;
  P.ui.setTurn(G.ctx, {
    cls: st.black ? 'b' : 'w',
    who: G.over ? 'Game over' : whoLabel(st.black),
    note, alert: check && !G.over
  });
  G.ctx.badge.textContent = online() ? (G.human === 'w' ? 'Online · White' : 'Online · Black')
    : G.mode === 'pnp' ? 'Two players'
    : ['', 'Turist', 'Kazin', 'Nanna'][G.level] || 'Phone';
}

/* ── input ─────────────────────────────────────────────────────── */
function myTurn(){
  if (G.over || G.thinking) return false;
  /* while a takeback of ours is in the air the board is LOCKED. That is not
     politeness: it is what stops us playing a move into a position the other
     phone has already rolled back out of. */
  if (G.tb && G.tb.busy()) return false;
  if (G.mode === 'pnp') return true;
  return (G.st.black ? 'b' : 'w') === G.human;
}
/* the fingerprint that travels with every move: if the two boards are not the
   same board, the duel stops rather than tell either of you a lie */
function fingerprint(st){ return posKey(st) + '/' + st.half; }

function tap(i){
  if (!myTurn()) return;
  const st = G.st;
  const mark = G.marks.find(m => m.to === i);
  if (mark){ choose(mark); return; }
  const p = st.b[i];
  if (p && ((isB(p) ? 'b' : 'w') === (st.black ? 'b' : 'w'))){
    if (G.sel === i){ G.sel = -1; G.marks = []; }
    else {
      G.sel = i;
      const all = genMoves(st).filter(m => m.from === i);
      /* the four promotion moves share one square — one mark each square */
      const seen = {};
      G.marks = [];
      for (const m of all){
        if (seen[m.to]) { seen[m.to].alts.push(m); continue; }
        const entry = { to:m.to, cap: !!m.cap, move:m, alts:[m] };
        seen[m.to] = entry;
        G.marks.push(entry);
      }
      if (!G.marks.length) K.toast && K.toast('That one has nowhere to go.');
    }
    render();
    return;
  }
  G.sel = -1; G.marks = [];
  render();
}

function choose(mark){
  if (mark.alts.length > 1 && mark.alts[0].promo){
    promoPicker(mark.alts);
    return;
  }
  play(mark.move);
}

function promoPicker(alts){
  const ctx = G.ctx;
  const old = ctx.root.querySelector('.pt-over'); if (old) old.remove();
  const over = document.createElement('div');
  over.className = 'pt-over';
  over.setAttribute('role', 'dialog');
  over.setAttribute('aria-modal', 'true');
  over.setAttribute('aria-label', 'Choose a promotion');
  const black = isB(alts[0].p);
  over.innerHTML =
    '<div class="pt-card"><h3>It made it</h3>' +
    '<p class="pt-why">The pawn walked the whole board. What does it come back as?</p>' +
    '<div class="pt-promo">' +
      [QUEEN, ROOK, BISHOP, KNIGHT].map(t =>
        '<button type="button" data-t="' + t + '" aria-label="' + PNAME[t] + '">' +
        '<span class="pt-pc ' + (black ? 'pt-b' : 'pt-w') + '" style="position:static;display:block;' +
        'width:100%;height:100%">' + U.pieceSVG(SYM[t]) + '</span></button>').join('') +
    '</div></div>';
  over.querySelectorAll('button').forEach(b => b.onclick = () => {
    const t = +b.dataset.t;
    over.remove();
    const m = alts.find(x => typ(x.promo) === t) || alts[0];
    play(m);
  });
  ctx.root.appendChild(over);
  over.querySelector('button').focus();
}

function play(m, fromNet){
  const st = G.st;
  /* moving on withdraws any takeback question that was still in the air */
  if (online() && !fromNet && G.tb) G.tb.cancel(true);
  /* the checksum is the PRE-move board, so the receiver compares it against
     the position it is about to play the move on */
  if (online() && !fromNet && G.net) G.net.send('move', wireOf(m), fingerprint(st));
  G.hist.push({ st: clone(st), last: G.last, lastSan: G.lastSan, keys: Object.assign({}, G.keys) });
  const text = san(st, m);
  G.st = applied(st, m);
  G.last = { from:m.from, to:m.to };
  G.lastSan = text;
  G.sel = -1; G.marks = [];
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
  strip();
  render();
  /* two frames of breathing room so the player's own move paints first */
  setTimeout(() => {
    if (!G || G.dead || G.over) return;
    let m = null;
    try { m = bestMove(G.st, G.level); } catch(e){ m = null; }
    G.thinking = false;
    if (!m){ render(); return; }
    const text = san(G.st, m);
    G.hist.push({ st: clone(G.st), last: G.last, lastSan: G.lastSan, keys: Object.assign({}, G.keys) });
    G.st = applied(G.st, m);
    G.last = { from:m.from, to:m.to };
    G.lastSan = text;
    const key = posKey(G.st);
    G.keys[key] = (G.keys[key] || 0) + 1;
    render();
    const s = status(G.st, G.keys[key]);
    if (s.end) finish(s);
  }, 60);
}

/* take n plies off this board and nothing else. Both clients call this with
   the same n, off identical histories, so both land on the same position. */
function rollback(n){
  for (let i = 0; i < n && G.hist.length; i++){
    const h = G.hist.pop();
    G.st = h.st; G.last = h.last; G.lastSan = h.lastSan; G.keys = h.keys;
  }
  G.sel = -1; G.marks = []; G.over = null;
  const over = G.ctx.root.querySelector('.pt-over'); if (over) over.remove();
  render();
}
/* the fingerprint of the position n plies back, or null if we cannot get
   there. This is what stops two boards rolling back to different places. */
function markBack(n){
  if (!G || n < 1 || G.hist.length < n) return null;
  return fingerprint(G.hist[G.hist.length - n].st);
}

function undo(){
  if (online()){ askTakeback(); return; }
  if (!G.hist.length || G.thinking || G.over) return;
  /* vs the phone, one tap should hand YOU the move back, not the phone */
  const two = (G.mode === 'ai' && G.hist.length > 1 &&
               (G.hist[G.hist.length - 1].st.black ? 'b' : 'w') !== G.human);
  rollback(two ? 2 : 1);
}

/* ONLINE: undo is a request, not a button. How far back is not a slider —
   it is however many plies it takes to hand the move back to the asker. */
function askTakeback(){
  if (!G || !G.tb || G.over || G.thinking) return;
  const mineNow = (G.st.black ? 'b' : 'w') === G.human;
  const n = Math.min(G.hist.length, mineNow ? 2 : 1);
  if (n < 1){ P.ui.setNet(G.ctx, 'Nothing to take back yet.', 'warn'); return; }
  P.ui.confirm(G.ctx, {
    head: 'Ask for a takeback?',
    why: 'They have to agree. Until they do, nothing moves on either board — and ' +
         'you cannot play a move while you are asking.',
    yes: 'Ask ' + G.foe, no: 'No, leave it',
    go: () => {
      const r = G.tb.request(n);
      if (!r.ok) P.ui.setNet(G.ctx, r.why, 'warn');
      render();
    }
  });
}

/* ── the full stop ─────────────────────────────────────────────── */
/* THE ONE PLACE A GAME OF CHESS IS RESOLVED. Every ending — mate, stalemate,
   the fifty-move rule, a resignation, a dead position — arrives here and
   nowhere else, so anything that wants to hear about a finished game (a stats
   module, a ledger, a leaderboard) has exactly one line to hook. */
function finish(s){
  G.over = s;
  G.sel = -1; G.marks = [];
  if (G.tb) G.tb.cancel(true);          /* no takeback survives the full stop */
  render();

  const them = online() ? G.foe : 'The phone';
  const wname = G.mode === 'pnp' ? 'White' : (G.human === 'w' ? 'You' : them);
  const bname = G.mode === 'pnp' ? 'Black' : (G.human === 'b' ? 'You' : them);
  const winner = s.win ? (s.win === 'w' ? wname : bname) : null;
  let head, why, tone = 'draw';

  if (s.end === 'mate'){ head = 'Checkmate'; why = winner + ' won. No move left, no way out, no argument.'; }
  else if (s.end === 'resign'){ head = 'Resigned'; why = winner + ' won it — the other one put their king down.'; }
  else if (s.end === 'stalemate'){ head = 'Stalemate'; why = 'Not in check, and not one legal move on the board. Draw.'; }
  else if (s.end === 'fifty'){ head = 'Fifty moves'; why = 'Fifty moves each with nothing taken and no pawn moved. Draw.'; }
  else if (s.end === 'repeat'){ head = 'Three times over'; why = 'The same position for the third time. Draw, before somebody falls asleep.'; }
  else { head = 'Dead position'; why = 'Nobody has the wood left to mate anybody. Draw.'; }

  /* The ledger is "how you get on against the phone" and nothing else — an
     online result is not written into it, because a stranger's board is not
     evidence about the machine. */
  let quip = pick(QUIP_DRAW);
  if (s.win){
    if (G.mode === 'pnp'){ tone = 'win'; quip = 'Shake hands. Then argue about move eleven.'; }
    else if (s.win === G.human){
      tone = 'win'; quip = online() ? 'Beaten a real person, on a real board. Say nothing, just nod.'
                                    : pick(QUIP_WIN);
      if (G.mode === 'ai') P.record('chess', 'w');
    } else {
      tone = 'lose'; quip = online() ? 'They had it. Ask for another one.' : pick(QUIP_LOSE);
      if (G.mode === 'ai') P.record('chess', 'l');
    }
  } else if (G.mode === 'ai'){ P.record('chess', 'd'); }

  if (online()){
    if (G.net && G.net.onEnd) G.net.onEnd(s);
    P.ui.result(G.ctx, {
      tone, head, why, quip,
      buttons: [
        { label:'Back to the rooms', icon:'back', cls:'primary',
          go: () => { if (G && G.net) G.net.onLeave(); } }
      ]
    });
    return;
  }

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
   4. THE SAME GAME, TWO PHONES
   js/mp.js owns the socket, the room and the lobby. It knows nothing
   about chess. This block is the whole of the contract between them:

     start(o)    put an online board up. o.colour is MY colour, drawn
                 by BOTH devices from a shared seed — see js/mp.js.
     remote(d)   a move (or a resignation) the other phone sent. It is
                 re-checked against OUR copy of the rules before it is
                 applied and refused if it is not in the legal list:
                 the relay is a dumb pipe and the peer may have
                 devtools open. Returns null when it was fine, or
                 {why, desync} when it was not, and mp.js ends the
                 match honestly rather than playing on.
     note(t)     one line about the connection, shown over the board.
     stop(why)   the match ended for a reason that is not a result.

   THERE IS NO UNDO ONLINE, on purpose. An undo would have to be a
   request the other phone agrees to, and the moment it exists you can
   see their reply, take your move back, and try something else. The
   two engines are in lockstep from move one; the honest buttons are
   Resign and Leave, and those are the two on the bar.
   ═══════════════════════════════════════════════════════════════════ */

/* a move on the wire: from, to, and what a pawn came back as */
function wireOf(m){ return { f: m.from, t: m.to, p: m.promo ? typ(m.promo) : 0 }; }

/* THE gate. Only a move the engine itself generated from OUR position can
   ever be applied — anything else is refused by name. */
function fromWire(w){
  if (!w || typeof w !== 'object') return null;
  const f = w.f, t = w.t, want = w.p ? (w.p & 7) : 0;
  if (typeof f !== 'number' || typeof t !== 'number') return null;
  const legal = genMoves(G.st);
  for (const m of legal)
    if (m.from === f && m.to === t && (m.promo ? typ(m.promo) : 0) === want) return m;
  return null;
}

function onlineStart(o){
  newGame({ mode:'online', side:o.colour, net:o, me:o.me, foe:o.foe });
  /* the shared takeback machinery. Chess seats one other player; the same
     object handles three or four for the games that seat that many. */
  G.tb = P.ui.takeback({
    peers: 1,
    send: (kind, body) => o.take(kind, body),
    rollback: rollback,
    mark: markBack,
    note: (t, tone) => P.ui.setNet(G.ctx, t, tone),
    after: () => render(),
    dismiss: () => { const q = G.ctx.root.querySelector('.pt-ask'); if (q) q.remove(); },
    ask: (info, yes, no) => P.ui.confirm(G.ctx, {
      head: G.foe + ' asks for a takeback',
      why: 'They want the last ' + info.n + (info.n === 1 ? ' move' : ' moves') +
           ' back. Say no and nothing at all happens — they are not told off for asking.',
      yes: 'Allow it', no: 'No, play on', go: yes, onNo: no
    })
  });
  P.ui.setNet(G.ctx, o.note || '', '');
}

function onlineRemote(d){
  if (!G || !online()) return { why:'a move with no game on the table' };
  if (G.over) return null;                        /* it is finished; let it lie */
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
  if (!m) return { why:'a move the rules of chess do not allow' };
  /* they played on instead of answering: the question is dead */
  if (G.tb) G.tb.cancel(true);
  play(m, true);
  return null;
}

/* a takeback message from the other phone */
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
  P.ui.result(G.ctx, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? 'No deal' : 'Cut off',
    why: why || 'The match stopped.',
    quip: 'Nothing was awarded. Nobody lost anything for a bad line.',
    buttons: [
      { label:'Back to the rooms', icon:'back', cls:'primary',
        go: () => { if (G && G.net) G.net.onLeave(); } }
    ]
  });
}

P.online = P.online || {};
P.online.chess = {
  start: onlineStart, remote: onlineRemote, take: onlineTake,
  note: onlineNote, stop: onlineStop,
  live: () => !!(G && online() && !G.dead)
};

/* ── wiring into the hub ───────────────────────────────────────── */
function start(){
  const p = P.pref('chess');
  newGame({ mode: p.mode || 'ai', level: p.level || 2, side: p.side || 'w' });
}
function menu(){
  leave();
  P.ui.setup({
    id: 'chess',
    title: 'Chess',
    blurb: 'The proper thing. Castling, en passant, the pawn that walks all the way and ' +
           'comes back a queen. It will not let you leave your own king in check either — ' +
           'try it and the square simply is not offered.',
    levels: [
      { k:1, name:'It-turist', note:'Sees one move. Sometimes not even that.', icon:'diff-1' },
      { k:2, name:'Tal-kazin', note:'Plays every Sunday. Will take your queen.', icon:'diff-2' },
      { k:3, name:'In-nanna',  note:'Thinks five moves ahead and never blinks.', icon:'diff-3' }
    ],
    sides: [
      { k:'w', name:'White', cls:'w', note:'You go first' },
      { k:'b', name:'Black', cls:'b', note:'It goes first' }
    ],
    onStart: o => newGame(o),
    onOnline: () => { if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('chess'); },
    onBack: () => P.hub()
  });
}
/* Called for every way OUT of the board, including the app navigating out from
   under us. Online that has to reach js/mp.js — a player who taps Home mid-game
   has left the room, and the other one must be told. */
function leave(){
  if (!G){ return; }
  const net = online() ? G.net : null;
  G.dead = true;
  if (G.ctx && G.ctx.stopFit) G.ctx.stopFit();
  G = null;
  if (net && net.onGone) net.onGone();
}

P.register({
  id:'chess', order:10, kind:'board', name:'CHESS', mt:'Iċ-ċess', sprite:'pt-p-k', status:'live',
  tag:'Sixteen each, one king, and no luck to blame. Two of you on one phone, or ' +
      'take on the machine.',
  open: menu
});

P.engines = P.engines || {};
P.engines.chess = ENGINE;

/* ── TEST HOOKS ────────────────────────────────────────────────────
   Completely inert unless the page is opened with ?pttest in the
   query string, which the live app never is. They exist so the UI
   harness can put a real castling / en-passant / mate position on the
   real board and then TAP it, instead of only ever testing the engine
   in isolation and hoping the screen agrees with it. */
try {
  if (String(location.search).indexOf('pttest') >= 0){
    window.__PT_CHESS = {
      force(fen){
        if (!G) return;
        G.st = fromFEN(fen);
        G.hist = []; G.keys = {}; G.keys[posKey(G.st)] = 1;
        G.sel = -1; G.marks = []; G.last = null; G.lastSan = '';
        G.over = null; G.thinking = false;
        const o = G.ctx.root.querySelector('.pt-over'); if (o) o.remove();
        render();
      },
      fen(){ return G ? toFEN(G.st) : null; },
      state(){ return G ? clone(G.st) : null; }
    };
  }
} catch(e){}

})();
