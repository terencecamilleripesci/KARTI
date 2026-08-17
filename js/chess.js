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

/* WHICH WAY UP ARE THE TABLES. Index 0 is a8, so row 0 of every table above
   is rank 8 and row 7 is rank 1 — which means the tables as written are
   WHITE's, read straight off the index, and it is BLACK that has to be
   mirrored. They were the other way round, and the numbers said so out loud:

     white pawn on e2, at home        150      white pawn on e7, one square
     white king on g1, castled        -20      from queening               80
     white king on g8, up a ladder      0

   Every level was quietly being paid to leave its pawns at home and walk its
   king up the board, and it cost the DEEPEST search the most, because it
   believed the table hardest: In-nanna answered 1.e4 with 1...Na6, every
   time, and over twenty-five games against Tal-każin she could only manage
   seven wins and sixteen draws — the top of the ladder was barely above the
   middle of it. Right way up she opens 1...Nc6 and the ladder separates.

   The move generator was never in this. perft(4) from the start position is
   197281 before and after, and Kiwipete perft(3) is 97862 before and after.
   It is one index, in the scoring, and nothing else was touched. */
const pstAt = (p, i) => isB(p) ? MIRROR(i) : i;

/* score from the side-to-move's point of view */
function evaluate(st){
  const b = st.b;
  let s = 0, heavy = 0, wb = 0, bb = 0;
  for (let i = 0; i < 64; i++){
    const p = b[i]; if (!p) continue;
    const t = typ(p);
    if (t === QUEEN || t === ROOK) heavy++;
    if (t === BISHOP){ if (isB(p)) bb++; else wb++; }
    const v = VAL[t] + (t === KING ? 0 : PST[t][pstAt(p, i)]);
    s += isB(p) ? -v : v;
  }
  /* king safety early, king activity late */
  const endgame = heavy <= 2;
  for (let i = 0; i < 64; i++){
    const p = b[i]; if (typ(p) !== KING) continue;
    const tb = endgame ? KING_END : PST[6];
    s += (isB(p) ? -1 : 1) * tb[pstAt(p, i)];
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

/* the three levels, named once. js/party.js writes the level into its own
   prefs as a STRING, so every read of it goes through +.  */
const LVL = {
  1: { name:'It-turist', note:'Sees one move ahead, and forgets half of those.', icon:'diff-1',
       badge:'Turist' },
  2: { name:'Tal-każin', note:'Plays every Sunday at the club. Will take your queen.', icon:'diff-2',
       badge:'Każin' },
  3: { name:'In-nanna',  note:'Five moves ahead and she has never lost at anything.', icon:'diff-3',
       badge:'Nanna' }
};
const lvlOf = n => LVL[+n] || LVL[2];

/* ── this file's own stylesheet ────────────────────────────────────
   js/party.js owns the shared board CSS and is not ours to edit, so the
   chess-only chrome — the door screen, the two player plates, the glide a
   piece makes when it lands — is injected from here, once, and scoped hard
   to #scr-party so it cannot reach a rule anywhere else. Every rule that
   touches a class js/dama.js also uses — .pt-sq, .pt-rail, .pt-board, the
   frame itself — is written through a `.ch` that only a chess board ever
   carries (paint() adds it), which both scopes it away from dama AND gives
   it the extra class of specificity it needs to beat the party.js rule it is
   overriding. Nothing here is a bare .pt-* selector. */
function chessCSS(){
  if (document.getElementById('ch-css')) return;
  const st = document.createElement('style');
  st.id = 'ch-css';
  st.textContent =
    /* ── the door: one screen, no scrolling, and the opponent IS the start ── */
    '#scr-party .ch-doors{display:grid;gap:9px;margin-bottom:2px}' +
    '#scr-party .ch-door{display:grid;grid-template-columns:26px 1fr 16px;column-gap:12px;' +
      'row-gap:1px;align-items:center;text-align:left;width:100%;min-height:62px;' +
      'padding:10px 13px;border-radius:15px;color:var(--txt);' +
      'background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.035));' +
      'border:1px solid var(--line2);transition:background .15s,border-color .15s}' +
    /* every child gets an EXPLICIT column. Two of them span both rows, and a
       grid places every definite-row item before it places any auto one — so
       left to itself the chevron took column 2 and the words were squeezed
       into the 16px column, one letter per line. */
    '#scr-party .ch-door>.ico:first-child{grid-column:1;grid-row:1/3;width:24px;height:24px;' +
      'color:var(--gold)}' +
    '#scr-party .ch-door>.ch-chev{grid-column:3;grid-row:1/3;width:16px;height:16px;' +
      'color:var(--dim2)}' +
    '#scr-party .ch-door b{grid-column:2;grid-row:1;font-family:var(--disp);font-size:13px;' +
      'letter-spacing:.06em;text-transform:uppercase;line-height:1.2}' +
    '#scr-party .ch-door i{grid-column:2;grid-row:2;font-style:normal;font-size:11.5px;' +
      'line-height:1.35;color:var(--dim)}' +
    '#scr-party .ch-door:active{background:rgba(255,197,66,.16);border-color:rgba(255,197,66,.55)}' +
    '#scr-party .ch-door.hero{background:linear-gradient(180deg,rgba(255,197,66,.16),' +
      'rgba(255,197,66,.06));border-color:rgba(255,197,66,.45)}' +
    '#scr-party .ch-door.off{opacity:.5}' +
    '#scr-party .ch-chips{display:flex;gap:7px}' +
    '#scr-party .ch-chip{flex:1 1 0;min-width:0;min-height:46px;padding:6px 4px;border-radius:13px;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;' +
      'color:var(--txt);background:rgba(255,255,255,.04);border:1px solid var(--line);' +
      'font-family:var(--disp);font-weight:900;font-size:11px;letter-spacing:.05em;' +
      'text-transform:uppercase;transition:background .15s,border-color .15s}' +
    '#scr-party .ch-chip.on{background:rgba(255,197,66,.15);border-color:rgba(255,197,66,.55);' +
      'color:var(--gold)}' +
    '#scr-party .ch-chip:active{background:rgba(255,255,255,.1)}' +
    '#scr-party .ch-chip .pt-swatch{width:16px;height:16px;border-width:1.5px}' +
    '#scr-party .ch-chip .ico{width:17px;height:17px;color:var(--dim)}' +
    '#scr-party .ch-chip.on .ico{color:var(--gold)}' +
    '#scr-party .ch-note{font-size:11.5px;line-height:1.45;color:var(--dim);margin:7px 3px 0;' +
      'text-transform:none;letter-spacing:0;min-height:17px}' +
    '#scr-party .ch-setup .pt-lbl{margin:15px 0 7px}' +
    '#scr-party .ch-setup .blurb{margin-bottom:2px}' +

    /* ── the table the board is standing on ──
       A square board on a portrait phone is width-limited, so there is always
       slack above and below it that no amount of arithmetic will fill. Left
       flat it reads as a board floating in a void; one soft pool of light
       under it and the same pixels read as a table with a lamp over it. */
    '#scr-party .pt-wrap.ch .pt-host{background:radial-gradient(112% 58% at 50% 50%,' +
      'rgba(255,214,120,.105),rgba(255,197,66,.038) 46%,rgba(0,0,0,0) 74%)}' +

    /* ── the two player plates, one above the board and one below ──
       They carry four things at once: which colour you are, what you have
       taken off them, who is up on material, and — the glow — whose move it
       is. That last one is why the plates are worth the pixels. */
    '#scr-party .pt-wrap.ch .pt-rail{min-height:38px;gap:5px;padding:3px 9px;border-radius:11px;' +
      'background:rgba(255,255,255,.035);border:1px solid transparent;margin:3px 0}' +
    '#scr-party .pt-wrap.ch .pt-rail.live{background:rgba(255,197,66,.10);' +
      'border-color:rgba(255,197,66,.34)}' +
    '#scr-party .ch .pt-rail .ch-nm{font-family:var(--disp);font-weight:900;font-size:10.5px;' +
      'letter-spacing:.09em;text-transform:uppercase;color:var(--dim);white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis;max-width:44%;flex:0 0 auto}' +
    '#scr-party .ch .pt-rail.live .ch-nm{color:var(--txt)}' +
    '#scr-party .ch .pt-rail .ch-took{display:flex;align-items:center;gap:1px;margin-left:auto;' +
      'flex:0 1 auto;overflow:hidden;min-width:0}' +
    '#scr-party .pt-wrap.ch .pt-rail .pt-mini{width:16px;height:16px}' +
    '#scr-party .ch .pt-rail .pt-edge{margin-left:5px;flex:0 0 auto}' +
    '#scr-party .ch .pt-rail .ch-thinks{margin-left:auto;flex:0 0 auto;font:700 9.5px/1 var(--disp);' +
      'letter-spacing:.12em;text-transform:uppercase;color:var(--gold);opacity:.9;' +
      'animation:chPulse 1.1s ease-in-out infinite}' +
    '@keyframes chPulse{0%,100%{opacity:.35}50%{opacity:1}}' +

    /* ── the turn strip, chess\'s own ── */
    '#scr-party .ch .ch-last{margin-left:auto;flex:0 0 auto;display:flex;align-items:center;gap:6px;' +
      'font:700 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em;' +
      'color:var(--dim);max-width:52%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}' +
    '#scr-party .ch .ch-last b{color:var(--txt);font-weight:700}' +
    '#scr-party .ch .pt-turn.alert .ch-last{color:#FFB3BC}' +
    '#scr-party .ch .pt-turn.alert .ch-last b{color:#FFD1D6}' +
    '#scr-party .ch .ch-badge-btn{cursor:pointer}' +
    /* "nothing to do here just now" — dimmed, but still a real button that
       answers when you press it. Nothing on this board is ever inert. */
    '#scr-party .ch .pt-bar .btn.off{opacity:.42}' +

    /* ── the board itself ──
       A real board has a rim you can see. The squares get one more step of
       contrast than they had, because "which one is dark" has to survive
       sunlight on a phone held at arm\'s length. */
    '#scr-party .pt-wrap.ch .pt-board{border-width:3px;border-color:#1A0E2A;' +
      'box-shadow:0 0 0 2px rgba(255,197,66,.16),0 14px 34px rgba(0,0,0,.6)}' +
    /* The men are silhouettes with a rim, and the rim is what makes them
       readable: a cream piece on a cream square and a near-black piece on a
       dark square are both about 1.5:1 against their own square, so all the
       separation comes from the outline. At 45px a square on a 660-tall phone
       that outline is under two pixels, so it gets a little more, and the
       piece itself gets 4% more of the square to stand in. */
    '#scr-party .pt-wrap.ch .pt-pc{inset:6%}' +
    '#scr-party .pt-wrap.ch .pt-pcs{stroke-width:1.25}' +
    '#scr-party .pt-wrap.ch .pt-sq .pt-co{font-size:9px;font-weight:800;opacity:.62}' +
    '#scr-party .pt-wrap.ch .pt-sq.d .pt-co{color:#C9B6E8}' +
    '#scr-party .pt-wrap.ch .pt-sq .pt-co.f{right:3px;bottom:2px}' +
    '#scr-party .pt-wrap.ch .pt-sq .pt-co.r{left:3px;top:2px}' +
    /* the square a piece is standing on while it slides has to sit ABOVE its
       neighbours, or the piece travels underneath them */
    '#scr-party .ch .pt-sq.ch-fly{z-index:6}' +
    '#scr-party .ch .pt-sq .pt-pc.ch-glide{will-change:transform}' +
    /* where the check is coming FROM — the answer to "yes, but from what?" */
    '#scr-party .ch .pt-sq.ch-from::after{content:"";position:absolute;inset:0;' +
      'box-shadow:inset 0 0 0 3px rgba(255,84,104,.75)}' +
    /* the mated king does not just sit there red — it throbs */
    '#scr-party .ch .pt-board.ch-mate .pt-sq.chk::after{animation:chMate .85s ease-in-out infinite}' +
    '@keyframes chMate{0%,100%{box-shadow:inset 0 0 0 3px var(--danger)}' +
      '50%{box-shadow:inset 0 0 0 7px var(--danger)}}' +
    /* WHERE THE LAST MOVE WENT. A flat amber wash reads as bright amber on a
       dark square and as a coffee stain on a light one — the two ends of the
       same move did not look like the same thing. A ring is the same ring on
       both, so the pair reads as a pair. */
    '#scr-party .ch .pt-sq.last::before{background:rgba(255,197,66,.13);' +
      'box-shadow:inset 0 0 0 3px rgba(255,197,66,.78)}' +
    /* selecting a piece: the square lifts a little rather than only outlining.
       Deliberately AFTER the .last rule — same specificity, so a piece picked
       up on the square it just came from reads as picked up, not as history. */
    '#scr-party .ch .pt-sq.sel::before{content:"";position:absolute;inset:0;' +
      'background:rgba(61,220,132,.24);box-shadow:none}' +
    /* A CAPTURE LANDS WITH A THUMP YOU CAN SEE. Last of the three, and that
       ordering is the whole rule: .last, .sel and this all paint the SAME
       ::before, they all carry one class, so whichever is written last wins.
       The square a capture happens on is always also the square the last move
       landed on — written any earlier, the crunch came out gold. */
    '#scr-party .ch .pt-sq.ch-hit::before{content:"";position:absolute;inset:0;' +
      'background:radial-gradient(circle at 50% 50%,rgba(255,84,104,.9),rgba(255,84,104,0) 70%);' +
      'box-shadow:none;animation:chHit .34s var(--ease) both}' +
    '@keyframes chHit{0%{opacity:0;transform:scale(.4)}35%{opacity:1}100%{opacity:0;transform:scale(1.25)}}' +
    /* the legal-move dots are the single most useful thing on the board, so
       they are bigger and brighter than they were */
    '#scr-party .pt-wrap.ch .pt-mark{width:34%;height:34%;margin:-17% 0 0 -17%;' +
      'box-shadow:0 0 0 1px rgba(0,0,0,.35),0 2px 5px rgba(0,0,0,.4)}' +
    '#scr-party .pt-wrap.ch .pt-mark.cap{width:90%;height:90%;margin:-45% 0 0 -45%;' +
      'box-shadow:inset 0 0 0 5px var(--hint)}' +

    /* ── promotion: a strip that lands over the board, not a form to fill in ── */
    '#scr-party .ch .ch-promo-head{font-size:12px;line-height:1.5;color:var(--dim);margin:8px 2px 0}' +

    /* ── short phones: the board is still the point, so the plates shrink ── */
    '@media (max-height:700px){' +
      '#scr-party .pt-wrap.ch .pt-rail{min-height:30px;margin:2px 0}' +
      '#scr-party .pt-wrap.ch .pt-rail .pt-mini{width:13px;height:13px}' +
      '#scr-party .ch-door{min-height:56px}' +
      '#scr-party .ch-setup .pt-lbl{margin:11px 0 6px}}' +
    /* ── tall phones have room to spare, so the plates take some of it ── */
    '@media (min-height:820px){' +
      '#scr-party .pt-wrap.ch .pt-rail{min-height:50px;padding:5px 11px;margin:5px 0}' +
      '#scr-party .pt-wrap.ch .pt-rail .pt-mini{width:20px;height:20px}' +
      '#scr-party .ch .pt-rail .ch-nm{font-size:11.5px}}' +
    '@media (prefers-reduced-motion:reduce){' +
      '#scr-party .ch .pt-sq .pt-pc{transition:none!important}' +
      '#scr-party .ch .pt-board.ch-mate .pt-sq.chk::after{animation:none}' +
      '#scr-party .ch .pt-rail .ch-thinks{animation:none;opacity:.9}}' +

    /* ══ THE DOOR SCREEN\'S OWN DRESS ═══════════════════════════════════
       Scoped under .chm — the wrapper the menu (and only the menu) puts
       on — so none of it can reach the board, dama, or anything else that
       shares this screen. The colours are the BOARD\'s own two woods, so
       the door and the game it opens are recognisably one object. */
    '#scr-party .chm{--chm-l:#E7D6AC;--chm-d:#4B3369}' +

    /* ── the identity piece: five squares off the board, men stood on them ──
       The same tiles, the same silhouettes and the same rims the game
       itself draws, fanned the way SKARTA fans its cards. The king is the
       centre and stands taller, because the king is the game. */
    '#scr-party .chm-hero{position:relative;display:flex;justify-content:center;' +
      'align-items:center;padding:12px 0 16px}' +
    '#scr-party .chm-hero::before{content:"";position:absolute;left:8%;right:8%;top:0;bottom:4px;' +
      'background:radial-gradient(55% 78% at 50% 60%,rgba(255,197,66,.16),' +
      'rgba(75,51,105,.22) 52%,transparent 78%);pointer-events:none}' +
    '#scr-party .chm-tile{position:relative;width:54px;aspect-ratio:1;flex:0 0 auto;' +
      'margin-left:-7px;border-radius:9px;display:grid;place-items:center;' +
      'background:linear-gradient(165deg,#5A3F7E,var(--chm-d) 60%,#31204A);' +
      'box-shadow:inset 0 0 0 2px rgba(255,255,255,.14),0 7px 16px rgba(0,0,0,.55)}' +
    '#scr-party .chm-tile.l{background:linear-gradient(165deg,#F2E4C0,var(--chm-l) 60%,#C7B287);' +
      'box-shadow:inset 0 0 0 2px rgba(58,34,16,.28),0 7px 16px rgba(0,0,0,.55)}' +
    '#scr-party .chm-tile:first-child{margin-left:0}' +
    '#scr-party .chm-tile:nth-child(1){transform:rotate(-9deg) translateY(7px)}' +
    '#scr-party .chm-tile:nth-child(2){transform:rotate(-4deg) translateY(1px)}' +
    '#scr-party .chm-tile:nth-child(4){transform:rotate(4deg) translateY(1px)}' +
    '#scr-party .chm-tile:nth-child(5){transform:rotate(9deg) translateY(7px)}' +
    '#scr-party .chm-tile.k{width:66px;z-index:2;transform:translateY(-7px);border-radius:11px;' +
      'box-shadow:inset 0 0 0 2px rgba(58,34,16,.28),0 0 0 2px rgba(255,197,66,.75),' +
      '0 9px 20px rgba(0,0,0,.6)}' +
    /* a fatter rim than the board wears: at 44-66px on the door these men
       have no square-colour convention helping them, so the outline is
       doing all the separating */
    '#scr-party .chm-tile .pt-pcs{width:76%;height:76%;stroke-width:1.7}' +
    '#scr-party .chm-tile.pw .pt-pcs{fill:var(--pcw);stroke:var(--rimw)}' +
    '#scr-party .chm-tile.pb .pt-pcs{fill:var(--pcb);stroke:var(--rimb)}' +

    /* ── the house rules, at the foot, folded ──────────────────────────
       A dock, not a modal: it sits in the flow UNDER the scroll, so open
       or shut it can never cover a door or the difficulty. The slide is
       transform-and-opacity on the content only — layout snaps, the
       words glide in. */
    '#scr-party .chm-dock{flex:0 0 auto;margin-top:8px;border-radius:15px;overflow:hidden;' +
      'border:1px solid var(--line2);' +
      'background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02))}' +
    '#scr-party .chm-grip{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;' +
      'padding:8px 14px;border:0;background:none;color:var(--dim);text-align:left;cursor:pointer;' +
      'font:900 11px/1.3 var(--disp);letter-spacing:.1em;text-transform:uppercase}' +
    '#scr-party .chm-grip .ico{width:17px;height:17px;flex:0 0 auto}' +
    '#scr-party .chm-grip .cv{margin-left:auto;width:17px;height:17px;flex:0 0 auto;' +
      'transition:transform .2s var(--ease)}' +
    '#scr-party .chm-dock.open{border-color:rgba(255,197,66,.4)}' +
    '#scr-party .chm-dock.open .chm-grip{color:var(--gold)}' +
    '#scr-party .chm-dock.open .cv{transform:rotate(180deg)}' +
    '#scr-party .chm-body{max-height:min(38vh,300px);overflow-y:auto;padding:0 14px 8px}' +
    '#scr-party .chm-body[hidden]{display:none}' +
    '#scr-party .chm-body>div{animation:chmUp .22s var(--ease)}' +
    '@keyframes chmUp{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}' +
    /* one rule: a piece, a name, a sentence */
    '#scr-party .chm-rule{display:grid;grid-template-columns:26px 1fr;column-gap:11px;row-gap:2px;' +
      'padding:9px 0;border-top:1px solid var(--line)}' +
    '#scr-party .chm-rule:first-child{border-top:0}' +
    '#scr-party .chm-rule .pt-pcs{grid-row:1/3;width:24px;height:24px;fill:var(--gold);' +
      'stroke:none;margin-top:2px}' +
    '#scr-party .chm-rule b{font:900 11px/1.35 var(--disp);letter-spacing:.07em;' +
      'text-transform:uppercase;color:var(--txt)}' +
    '#scr-party .chm-rule i{font-style:normal;font-size:11px;line-height:1.45;color:var(--dim)}' +
    /* sideways, the hero gives a little so the doors keep the room */
    '@media (orientation:landscape) and (max-height:480px){' +
      '#scr-party .chm-hero{padding:4px 0 8px}' +
      '#scr-party .chm-tile{width:44px}' +
      '#scr-party .chm-tile.k{width:52px}}' +
    '@media (prefers-reduced-motion:reduce){' +
      '#scr-party .chm-body>div{animation:none}' +
      '#scr-party .chm-grip .cv{transition:none}}' +
    'body.reduced #scr-party .chm-body>div{animation:none}' +
    'body.reduced #scr-party .chm-grip .cv{transition:none}';
  document.head.appendChild(st);
}

let G = null;   /* the live game, or null */

/* EVERY GAME GETS A NUMBER, and every callback that comes back later carries
   the number of the game it was started for. Without it, "New" (or Rematch,
   or Change opponent) tapped while the phone is thinking leaves a timer in
   flight that wakes up, finds a perfectly healthy G — the NEW one — and plays
   the old game's move onto the new board. Reproduced: tap New 300 ms after
   1.e4 against It-turist and the fresh game opens with 1...e5 already on it
   and Black still to move. leave() cannot cover this, because start() swaps
   the game without going through it. */
let GEN = 0;
const gen = () => (G ? G.gen : -1);
/* is the game this callback was made for still the game on the table? */
const same = g => !!(G && !G.dead && G.gen === g);

/* ── THE CRASH NET ──────────────────────────────────────────────────
   The same shape as js/kiri-ui.js: the board is written after every
   committed move and on the tab going away, so a phone that dies
   mid-game comes back to it. What is saved is not the position — it is
   the MOVE LOG, the (opts, log) pattern the card games use, replayed
   through the engine's own commit() on the way back in. That keeps the
   save tiny (~20 bytes a move), gives the resumed game its full history
   (undo, repetition counts, the turn strip) and costs nothing the rules
   did not already pay. A FINISHED game is never written: finish() bins
   the save the moment the game ends, and saveGame() refuses a G.over
   board, so a game you already won can never turn up offering to be
   carried on. Online games are never written — a room is not resumable
   from here and must not eat the offline slot. */
const SAVE_KEY = 'karti_chess_v1';
/* UI preferences only — the rules dock's open/shut state lives here and
   never in the game save. Same pattern as karti_kiri_ui_v1.dock. */
const UI_KEY = 'karti_chess_ui_v1';
let saveMoaned = false;
function saveGame(){
  if (!G || G.dead || G.over || online()) return;
  if (!G.wlog || !G.wlog.length){ clearSave(); return; }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(
      { v:1, at: Date.now(), mode: G.mode, level: G.level, human: G.human, log: G.wlog }));
  } catch(e){
    /* a write that did not happen must be SAID — see lsSet in js/game.js */
    if (!saveMoaned){
      saveMoaned = true;
      try { nudge('The phone is not letting chess save. Closing the app will lose this board.'); } catch(_){}
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

/* Rebuild the saved board by replaying its log through commit() — the one
   path every move already takes — with the noise, paint and glide held
   back until the end. If any entry no longer parses (a save from another
   build), the save is binned and a fresh board dealt instead of half of one. */
function restoreSaved(){
  const sv = loadSave();
  if (!sv) return false;
  newGame({ mode: sv.mode, level: sv.level, side: sv.human, replay: true });
  for (const w of sv.log){
    const m = fromWire(w);
    if (!m){
      clearSave();
      newGame({ mode: sv.mode, level: sv.level, side: sv.human });
      return false;
    }
    commit(m, true);
  }
  render();
  saveGame();
  maybeAI();
  return true;
}

function newGame(opts){
  if (G){ G.dead = true; clearTimeout(G.endTimer); }
  /* starting a FRESH offline board is choosing it over the saved one —
     the resume door was right there. A replay rebuild keeps its save. */
  if (opts.mode !== 'online' && !opts.replay) clearSave();
  G = {
    gen: ++GEN,
    wlog: [],                         /* the committed moves, on the wire shape */
    mode: opts.mode,                  /* 'pnp' | 'ai' | 'online' */
    level: +opts.level || 2,
    human: opts.side === 'b' ? 'b' : 'w',   /* your colour vs the phone OR online */
    /* online only: the pipe back to js/mp.js, and the two names */
    net: opts.net || null,
    me: opts.me || 'YOU', foe: opts.foe || 'THEM', netNote: '',
    st: startPos(),
    hist: [],                         /* {st, move, san} before each move */
    keys: {},                         /* posKey -> times seen */
    sel: -1, marks: [], last: null, lastSan: '', lastWho: '',
    over: null, thinking: false, ctx: null, dead: false, endTimer: 0
  };
  G.keys[posKey(G.st)] = 1;
  paint();
  if (!opts.replay) maybeAI();
}

function online(){ return G.mode === 'online'; }
/* your own men are always at the bottom, whoever you are playing */
function flipped(){ return (G.mode === 'ai' || G.mode === 'online') && G.human === 'b'; }
/* screen row/col -> board index */
function sqAt(row, col){ return flipped() ? SQ(7 - col, 7 - row) : SQ(col, row); }

function paint(){
  chessCSS();
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
  /* every chess-only rule in this file's stylesheet hangs off this class, so
     nothing here can reach js/dama.js, which shares the same frame */
  ctx.root.classList.add('ch');

  /* 64 buttons, built once; render() only changes their innards */
  const board = ctx.board;
  board.innerHTML = '';
  G.board = board;
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
  ctx.btn('ch-resign').onclick = () => G.over
    ? nudge('It is already finished — nothing left to resign.')
    : P.ui.confirm(ctx, {
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
  /* the badge is not decoration — offline it is the way back to the door
     without finishing the game you are in, which is the only place the level
     and the colour can be changed once you are sat down */
  if (!net && ctx.badge){
    ctx.badge.className = 'pt-badge ch-badge-btn';
    ctx.badge.setAttribute('role', 'button');
    ctx.badge.setAttribute('tabindex', '0');
    ctx.badge.title = 'Change opponent';
    ctx.badge.onclick = () => P.ui.confirm(ctx, {
      head: 'Change opponent?',
      why: 'This game goes in the bin and you pick again — who you are playing, ' +
           'how hard, and which colour.',
      yes: 'Yes, pick again', no: 'No, carry on',
      go: () => menu()
    });
  }
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

/* screen row / column of a board index, once flipped() has had its say */
const scrRow = i => flipped() ? 7 - RANK(i) : RANK(i);
const scrCol = i => flipped() ? 7 - FILE(i) : FILE(i);

/* every square the side to move is being checked FROM. "Check" on its own is
   half an answer on a small screen — the other half is which piece, and the
   only honest way to show that is to ring the square it is standing on. */
function checkers(st){
  const k = kingSq(st.b, st.black);
  if (k < 0) return [];
  const foe = clone(st);
  foe.black = !st.black; foe.ep = -1;
  const out = [];
  for (const m of genPseudo(foe))
    if (m.to === k && !(m.fl & (F_CK | F_CQ)) && out.indexOf(m.from) < 0) out.push(m.from);
  return out;
}

function render(){
  const st = G.st, cells = G.cells;
  const checked = inCheck(st);
  const chkSq = checked ? kingSq(st.b, st.black) : -1;
  const from = (checked && !G.over) || (G.over && G.over.end === 'mate') ? checkers(st) : [];

  for (let i = 0; i < 64; i++){
    const el = cells[i];
    if (!el) continue;
    const p = st.b[i];
    let cls = 'pt-sq' + (((FILE(i) + RANK(i)) & 1) ? ' d' : '');
    if (G.last && (i === G.last.from || i === G.last.to)) cls += ' last';
    if (i === G.sel) cls += ' sel';
    if (i === chkSq) cls += ' chk';
    if (from.indexOf(i) >= 0) cls += ' ch-from';
    el.className = cls;

    const mark = G.marks.find(m => m.to === i);
    const row = scrRow(i), col = scrCol(i);
    el.innerHTML =
      (row === 7 ? '<span class="pt-co f">' + 'abcdefgh'[FILE(i)] + '</span>' : '') +
      (col === 0 ? '<span class="pt-co r">' + (8 - RANK(i)) + '</span>' : '') +
      (p ? '<span class="pt-pc ' + (isB(p) ? 'pt-b' : 'pt-w') + '">' +
           U.pieceSVG(SYM[typ(p)]) + '</span>' : '') +
      (mark ? '<span class="pt-mark' + (mark.cap ? ' cap' : '') + '"></span>' : '');
    /* a screen reader gets the same three facts a sighted player gets from
       the colours: what is here, and what this tap would do */
    el.setAttribute('aria-label',
      NAME(i) + (p ? ', ' + (isB(p) ? 'black ' : 'white ') + PNAME[typ(p)] : ', empty') +
      (mark ? (mark.cap ? ', take it' : ', you can move here') : '') +
      (i === G.sel ? ', picked up' : '') +
      (i === chkSq ? ', in check' : ''));
  }
  if (G.board) G.board.classList.toggle('ch-mate', !!(G.over && G.over.end === 'mate'));
  plates();
  strip();
  /* NOT disabled, ever. A greyed button is a tap that goes nowhere and says
     nothing; these two answer in words instead — see undo() and resign. */
  const u = G.ctx.btn('ch-undo');
  if (u) u.classList.toggle('off', !G.hist.length || G.thinking || !!G.over);
}
const PNAME = { 1:'pawn', 2:'knight', 3:'bishop', 4:'rook', 5:'queen', 6:'king' };

/* ── the two player plates ─────────────────────────────────────────
   One above the board and one below, each belonging to the player whose men
   start on that side. A plate carries four things at once: which colour that
   player is, what they have taken off the other one, who is up on material,
   and — the glow — whose move it is. A player who has looked away can pick
   the game back up from the plates alone. */
function whoName(black){
  const c = black ? 'b' : 'w';
  if (G.mode === 'pnp') return black ? 'Black' : 'White';
  if (online()) return c === G.human ? (G.me || 'You') : (G.foe || 'Them');
  return c === G.human ? 'You' : 'The phone · ' + lvlOf(G.level).badge;
}

function plates(){
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
  const wLost = gone('w'), bLost = gone('b');
  const diff = score('b') - score('w');    /* positive = white is up */
  const turnBlack = G.st.black;

  /* `black` is the colour of the player this plate belongs to; the pieces on
     it are the ones they have TAKEN, which are the other colour's losses. */
  const fill = (el, black) => {
    if (!el) return;
    const took = black ? wLost : bLost;
    const edge = black ? (diff < 0 ? Math.round(-diff / 100) : 0)
                       : (diff > 0 ? Math.round(diff / 100) : 0);
    const mine = black ? 'w' : 'b';       /* the taken men are the other colour */
    const live = (turnBlack === black) && !G.over;
    const think = live && G.thinking;
    el.className = 'pt-rail' + (live ? ' live' : '');
    el.innerHTML =
      '<span class="pt-dot ' + (black ? 'b' : 'w') + '"></span>' +
      '<span class="ch-nm">' + esc(whoName(black)) + '</span>' +
      (think ? '<span class="ch-thinks">Thinking</span>' : '') +
      '<span class="ch-took">' +
        took.map(t => '<svg class="pt-mini ' + (mine === 'w' ? 'pt-w' : 'pt-b') +
          '" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + SYM[t] + '"></use></svg>').join('') +
      '</span>' +
      (edge > 0 ? '<span class="pt-edge">+' + edge + '</span>' : '');
  };
  /* the plate above the board belongs to whoever is sitting at the top, and
     your own men are always at the bottom */
  const topIsBlack = !flipped();
  fill(G.ctx.railTop, topIsBlack);
  fill(G.ctx.railBot, !topIsBlack);
}

function whoLabel(black){
  if (G.mode === 'pnp') return black ? 'Black to move' : 'White to move';
  const mine = (black ? 'b' : 'w') === G.human;
  if (online()) return mine ? 'Your move' : G.foe + ' to move';
  return mine ? 'Your move' : 'The phone is thinking';
}

/* ── the turn strip ────────────────────────────────────────────────
   The single most important line on the screen, so chess writes its own
   rather than take the shared two-field one: whose move it is on the left,
   and on the right the thing that just happened — the move in notation, or
   where the check is coming from. Ten seconds of looking away should cost
   nobody a guess. */
function strip(){
  const st = G.st, ctx = G.ctx;
  const check = inCheck(st) && !G.over;
  let right = '';
  if (check){
    const cs = checkers(st).map(NAME);
    right = '<b>Check</b>' + (cs.length ? '<span>from ' + esc(cs.join(', ')) + '</span>' : '');
  } else if (G.lastSan){
    right = '<span>' + esc(G.lastWho || '') + '</span><b>' + esc(G.lastSan) + '</b>';
  }
  ctx.turn.className = 'pt-turn' + (check ? ' alert' : '');
  ctx.turn.innerHTML =
    '<span class="pt-dot ' + (st.black ? 'b' : 'w') + '"></span>' +
    '<span class="pt-who">' + esc(G.over ? overWord() : whoLabel(st.black)) + '</span>' +
    (right ? '<span class="ch-last">' + right + '</span>' : '');
  ctx.badge.textContent = online() ? (G.human === 'w' ? 'Online · White' : 'Online · Black')
    : G.mode === 'pnp' ? 'Two players'
    : lvlOf(G.level).badge + ' · ' + (G.human === 'w' ? 'White' : 'Black');
}
function overWord(){
  const e = G.over && G.over.end;
  return e === 'mate' ? 'Checkmate'
       : e === 'resign' ? 'Resigned'
       : e === 'stalemate' ? 'Stalemate'
       : e === 'stopped' ? 'Stopped' : 'Drawn';
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

/* ── a refusal is a sentence, never a tap that does nothing ────────
   Everything on this board that will not do what you asked says so out loud.
   Throttled, because the answer to eight impatient taps is one line, not
   eight. ⚠ is the app-wide marker for bad news: js/sfx.js reads it off the
   toast and gives it the blunt "no" instead of the bell. */
let nudgeAt = 0;
function nudge(text){
  const now = Date.now();
  if (now - nudgeAt < 700) return;
  nudgeAt = now;
  const S = SFX(); if (S) S.boardIllegal({});
  if (K && K.toast) K.toast('⚠ ' + text);
}

/* why the board is not listening, in the player's words */
function whyLocked(){
  if (G.over) return 'That game is finished. Rematch, or pick a new opponent.';
  if (G.thinking) return 'Hold on — the phone is still thinking.';
  if (G.tb && G.tb.busy()) return 'You have asked for a takeback. Nothing moves until they answer.';
  if (G.mode === 'ai') return 'Not your turn yet.';
  if (online()) return 'It is ' + (G.foe || 'their') + ' move. Sit tight.';
  return 'It is ' + (G.st.black ? 'Black' : 'White') + ' to move — hand the phone over.';
}

function tap(i){
  if (!myTurn()){ nudge(whyLocked()); return; }
  const st = G.st;
  const mark = G.marks.find(m => m.to === i);
  if (mark){ choose(mark); return; }
  const p = st.b[i];
  if (p && ((isB(p) ? 'b' : 'w') === (st.black ? 'b' : 'w'))){
    if (G.sel === i){ G.sel = -1; G.marks = []; SFX() && SFX().boardCancel(); }
    else {
      G.sel = i;
      SFX() && SFX().boardPick('chess');
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
      if (!G.marks.length){
        /* and say WHY it cannot move, which is nearly always the king */
        nudge(inCheck(st)
          ? 'Your king is in check — that ' + PNAME[typ(p)] + ' cannot help.'
          : 'That ' + PNAME[typ(p)] + ' has nowhere to go.');
      }
    }
    render();
    return;
  }
  /* a tap on a square the picked-up piece cannot reach. Deselecting silently
     is the same gesture as putting it back down, so the piece IS put back
     down — but the player is told which of the two just happened. */
  if (G.sel >= 0){
    const what = PNAME[typ(st.b[G.sel])] || 'piece';
    nudge(p ? 'Your ' + what + ' cannot take on ' + NAME(i) + '.'
            : 'Your ' + what + ' cannot reach ' + NAME(i) + '.');
    G.sel = -1; G.marks = [];
    render();
    return;
  }
  if (p) nudge('That one is theirs. Tap one of yours.');
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
    '<p class="pt-why">The pawn walked the whole board. Tap what it comes back as.</p>' +
    '<div class="pt-promo">' +
      [QUEEN, ROOK, BISHOP, KNIGHT].map(t =>
        '<button type="button" data-t="' + t + '" aria-label="Promote to ' + PNAME[t] + '">' +
        '<span class="pt-pc ' + (black ? 'pt-b' : 'pt-w') + '" style="position:static;display:block;' +
        'width:100%;height:100%">' + U.pieceSVG(SYM[t]) + '</span></button>').join('') +
    '</div>' +
    '<p class="ch-promo-head">Queen, rook, bishop, knight. Take the queen unless you ' +
      'have a very good reason.</p>' +
    /* THE WAY OUT. Four choices and no fifth is a modal you can only leave by
       committing to a move you may have tapped by accident — on a phone, with
       no Escape key, that is a corner. Backing out simply puts the pawn down
       again with its dots still on. */
    '<button type="button" class="btn ghost" id="ch-promo-no" ' +
      'style="margin-top:14px;width:100%;min-height:46px;font-size:12px">' +
      'No, put it back</button></div>';
  over.querySelectorAll('.pt-promo button').forEach(b => b.onclick = () => {
    const t = +b.dataset.t;
    over.remove();
    const m = alts.find(x => typ(x.promo) === t) || alts[0];
    play(m);
  });
  const back = () => { over.remove(); const S = SFX(); if (S) S.boardCancel(); render(); };
  over.querySelector('#ch-promo-no').onclick = back;
  /* tapping the dark outside the card is the same thing, because everybody
     tries it before they look for a button */
  over.onclick = e => { if (e.target === over) back(); };
  ctx.root.appendChild(over);
  over.querySelector('.pt-promo button').focus();
}

/* ── sound ────────────────────────────────────────────────────────────────
   js/sfx.js owns the noises; this file only says WHAT happened. Everything
   is optional: with sfx.js absent, or the player's sound off, every call
   below is a no-op. Board squares are deliberately excluded from the
   delegated auto-wire layer precisely so a move can have its own sound
   instead of a generic UI tap, which is why these calls have to exist. */
const SFX = () => window.KARTI_SFX || null;
/* TIMED AGAINST THE FILES, not against the code. Measured onsets, at 8 kHz,
   of the three that matter here:

     piece-slide.mp3    starts at   0 ms, body ends at 170 ms
     piece-place.mp3    starts at 120 ms  (that much of it is silence)
     piece-capture.mp3  starts at  30 ms

   js/sfx.js plays the slide immediately and the knock 75 ms later, so a quiet
   move is actually HEARD as a scrape from 0 to 170 ms and a knock at 195 ms.
   That is why the glide below is 170 ms: the piece comes to rest and the wood
   knocks, in that order, the way it does on a real table.

   A capture goes through the same after(75) but its file has almost no lead-in,
   so the crunch would land at 105 ms — 65 ms before the piece has arrived, and
   you hear it as a sound that belongs to nothing. Held back by 60 ms here it
   lands at 165 ms, on the piece. js/sfx.js is not this file's to edit, so the
   compensation lives on this side of the call. */
function sfxMove(st, m){
  const S = SFX(); if (!S) return;
  const o = { game:'chess', capture: !!m.cap, castle: !!(m.fl & (F_CK | F_CQ)),
              promo: !!m.promo };
  if (o.capture && !o.castle) setTimeout(() => { const s = SFX(); if (s) s.boardMove(o); }, 60);
  else S.boardMove(o);
}
function sfxCheck(st){
  const S = SFX(); if (!S) return;
  try { if (inCheck(st)) S.boardCheck(); } catch(e){}
}

/* who just moved, in two words or fewer, for the turn strip */
function shortName(black){
  if (G.mode === 'pnp') return black ? 'Black' : 'White';
  if (online()) return (black ? 'b' : 'w') === G.human ? 'You' : (G.foe || 'Them');
  return (black ? 'b' : 'w') === G.human ? 'You' : 'Phone';
}

/* ── the piece lands, it does not teleport ─────────────────────────
   Purely cosmetic and deliberately incapable of blocking anything: the
   position, the sound and the turn have all already changed by the time this
   runs. It puts the arriving piece back where it came from and lets one CSS
   transition carry it home, so a move you did not make is a thing you SAW
   rather than a board that is suddenly different. Castling is one motion
   because both men glide together. */
const GLIDE_MS = 170;
function animate(m){
  if (!G || !G.cells || !m) return;
  let sq = 0;
  try { sq = G.cells[m.to].getBoundingClientRect().width; } catch(e){ return; }
  if (!sq) return;
  const glide = (from, to) => {
    const cell = G.cells[to];
    const el = cell && cell.querySelector('.pt-pc');
    if (!el) return;
    const dx = (scrCol(from) - scrCol(to)) * sq;
    const dy = (scrRow(from) - scrRow(to)) * sq;
    if (!dx && !dy) return;
    cell.classList.add('ch-fly');
    el.classList.add('ch-glide');
    el.style.transition = 'none';
    el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    void el.offsetWidth;                       /* commit the start frame */
    el.style.transition = 'transform ' + GLIDE_MS + 'ms cubic-bezier(.2,.7,.35,1)';
    el.style.transform = 'translate(0,0)';
    setTimeout(() => {
      if (!cell) return;
      cell.classList.remove('ch-fly');
      el.classList.remove('ch-glide');
      el.style.transition = ''; el.style.transform = '';
    }, GLIDE_MS + 40);
  };
  glide(m.from, m.to);
  /* the rook comes with the king, in the same breath */
  if (m.fl & F_CK) glide(isB(m.p) ? 7  : 63, isB(m.p) ? 5 : 61);
  if (m.fl & F_CQ) glide(isB(m.p) ? 0  : 56, isB(m.p) ? 3 : 59);
  /* a capture leaves a mark on the square it happened on */
  if (m.capSq >= 0 && G.cells[m.capSq]){
    const hit = G.cells[m.capSq];
    hit.classList.add('ch-hit');
    setTimeout(() => hit.classList.remove('ch-hit'), 360);
  }
}

/* everything that has to happen when a move goes on the board, from either
   hand. ONE path, so the human, the phone and the other player's phone can
   never drift apart. */
function commit(m, quiet){
  const st = G.st;
  const text = san(st, m);
  const who = shortName(st.black);
  if (!quiet) sfxMove(st, m);
  G.hist.push({ st: clone(st), last: G.last, lastSan: G.lastSan,
                lastWho: G.lastWho, keys: Object.assign({}, G.keys) });
  G.st = applied(st, m);
  G.last = { from:m.from, to:m.to };
  G.lastSan = text; G.lastWho = who;
  G.sel = -1; G.marks = [];
  if (G.wlog) G.wlog.push(wireOf(m));
  const key = posKey(G.st);
  G.keys[key] = (G.keys[key] || 0) + 1;
  if (!quiet){ render(); animate(m); }
  const s = status(G.st, G.keys[key]);
  /* the crash net: every committed move that did not just END the game is
     on disk before the next thing happens. A move that did end it is
     finish()'s to bin. Quiet replays save once, at the end. */
  if (!quiet && !s.end) saveGame();
  return s;
}

function play(m, fromNet){
  const st = G.st;
  /* moving on withdraws any takeback question that was still in the air */
  if (online() && !fromNet && G.tb) G.tb.cancel(true);
  /* the checksum is the PRE-move board, so the receiver compares it against
     the position it is about to play the move on */
  if (online() && !fromNet && G.net) G.net.send('move', wireOf(m), fingerprint(st));
  const s = commit(m);
  if (s.end){ finish(s); return; }
  sfxCheck(G.st);
  maybeAI();
}

/* It-turist answers in about twenty milliseconds, and an opponent that
   replies before your own piece has finished landing does not read as an
   opponent at all — it reads as the board arguing with you. So the phone is
   never allowed to answer faster than this after your move has settled. It
   costs the strong levels nothing (they are already slower than it) and it
   gives the weak one the beat it needs to look like somebody sitting there. */
const MIN_THINK = 280;

function maybeAI(){
  if (G.mode !== 'ai' || G.over) return;
  if ((G.st.black ? 'b' : 'w') === G.human) return;
  /* the board is locked from THIS line, not from the repaint below — myTurn()
     reads the flag, so nothing can be tapped in the meantime */
  G.thinking = true;
  /* NO render() HERE. render() rewrites all sixty-four squares' innerHTML,
     which throws away the very element the player's own piece is gliding on
     and strips the class that lifts it above its neighbours — so calling it
     on this line silently killed the human's animation and left only the
     phone's. Everything below waits for the glide to be over. */
  /* the game these three nested waits belong to. Every one of them checks it
     before touching anything — see the note on GEN. */
  const g = gen();
  setTimeout(() => {
    if (!same(g) || G.over) return;
    render();                       /* now the plate can say "Thinking" */
    /* and one more turn of the loop so that paint actually reaches the
       screen: bestMove() below blocks this thread for up to 1.2 s at
       In-nanna, and a "Thinking" that is drawn after the thinking has
       finished is worse than none at all */
    setTimeout(() => {
      if (!same(g) || G.over) return;
      const t0 = Date.now();
      let m = null;
      try { m = bestMove(G.st, G.level); } catch(e){ m = null; }
      const rest = Math.max(0, MIN_THINK - (Date.now() - t0));
      const land = () => {
        if (!same(g) || G.over) return;
        G.thinking = false;
        if (!m){ render(); return; }
        const s = commit(m);
        if (s.end) return finish(s);
        sfxCheck(G.st);
      };
      if (rest) setTimeout(land, rest); else land();
    }, 30);
  }, GLIDE_MS + 40);
}

/* take n plies off this board and nothing else. Both clients call this with
   the same n, off identical histories, so both land on the same position. */
function rollback(n){
  /* the board going backwards has its own sound, and it has to be made here:
     Undo disables ITSELF on the last ply, and a button that is already
     disabled by the time the click bubbles reads as a dead tap. */
  { const S = SFX(); if (S && G.hist.length) S.takeback('undo'); }
  for (let i = 0; i < n && G.hist.length; i++){
    const h = G.hist.pop();
    G.st = h.st; G.last = h.last; G.lastSan = h.lastSan; G.lastWho = h.lastWho;
    G.keys = h.keys;
    if (G.wlog && G.wlog.length) G.wlog.pop();
  }
  G.sel = -1; G.marks = []; G.over = null;
  saveGame();                     /* the shorter game is the game now */
  clearTimeout(G.endTimer); G.endTimer = 0;
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
  /* the three ways this button can say no, all of them out loud */
  if (G.over){ nudge('The game is over — Rematch starts a fresh one.'); return; }
  if (G.thinking){ nudge('Let it finish thinking, then take it back.'); return; }
  if (!G.hist.length){ nudge('Nothing has been played yet.'); return; }
  /* vs the phone, one tap should hand YOU the move back, not the phone */
  const two = (G.mode === 'ai' && G.hist.length > 1 &&
               (G.hist[G.hist.length - 1].st.black ? 'b' : 'w') !== G.human);
  rollback(two ? 2 : 1);
}

/* ONLINE: undo is a request, not a button. How far back is not a slider —
   it is however many plies it takes to hand the move back to the asker. */
function askTakeback(){
  if (!G || !G.tb) return;
  if (G.over){ nudge('The game is finished. There is nothing left to take back.'); return; }
  if (G.thinking){ nudge('Give it a second.'); return; }
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
  clearSave();                    /* a finished game must never resurrect */
  G.sel = -1; G.marks = []; G.thinking = false;
  if (G.tb) G.tb.cancel(true);          /* no takeback survives the full stop */

  /* A game that ends on a MOVE deserves to be watched. The board used to be
     covered by the result card in the same frame the mating piece landed, so
     nobody ever saw the mate happen. The board is locked the instant G.over
     is set above — this delay costs the player nothing and buys them the one
     moment the whole game was for: the piece glides in, the king throbs red,
     the king topples, and only then does the card come down. */
  const played = s.end === 'mate' || s.end === 'stalemate' ||
                 s.end === 'fifty' || s.end === 'repeat' || s.end === 'material';
  const wait = played ? 820 : 0;
  const g = gen();
  clearTimeout(G.endTimer);
  /* The repaint is held back for exactly the same reason the card is: it
     rewrites all sixty-four squares, and the mating piece is in the middle of
     gliding onto one of them. The board is already showing the finished
     position — commit() painted it — and G.over above has locked the input,
     so all this repaint adds is the red throb on the king and the ring round
     the piece delivering it. Those land as the piece does. */
  if (played) setTimeout(() => { if (same(g) && G.over === s) render(); }, GLIDE_MS + 40);
  else render();
  { const S = SFX();
    if (S){ const meW = (G.mode === 'pnp') ? null : (G.human === 'w');
      const o = { mate: s.end === 'mate', draw: !s.win,
                  win: s.win && meW !== null ? ((s.win === 'w') === meW) : false };
      if (played) setTimeout(() => { if (same(g) && G.over === s) S.boardEnd(o); }, 340);
      else S.boardEnd(o); } }

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

  const card = online()
    ? { tone, head, why, quip,
        buttons: [
          { label:'Back to the rooms', icon:'back', cls:'primary',
            go: () => { if (G && G.net) G.net.onLeave(); } }
        ] }
    : { tone, head, why, quip,
        buttons: [
          { label:'Rematch, same opponent', icon:'play', cls:'primary', go: () => start() },
          { label:'Change opponent', icon:'users', go: () => menu() },
          { label:'Back to party games', icon:'back', go: () => { leave(); P.hub(); } }
        ] };
  if (online() && G.net && G.net.onEnd) G.net.onEnd(s);
  if (!wait){ P.ui.result(G.ctx, card); return; }
  G.endTimer = setTimeout(() => {
    if (!same(g) || G.over !== s) return;
    G.endTimer = 0;
    P.ui.result(G.ctx, card);
  }, wait);
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
    /* A takeback question arriving from the other phone is the one thing in an
       online game that happens with no input from this one, so it is the one
       thing that most needs a noise. Saying no gets the blunt "no" as it is
       sent; saying yes needs nothing here, because rollback() below already
       plays the board going backwards. */
    ask: (info, yes, no) => {
      const S = SFX(); if (S) S.takeback('ask');
      return P.ui.confirm(G.ctx, {
        head: G.foe + ' asks for a takeback',
        why: 'They want the last ' + info.n + (info.n === 1 ? ' move' : ' moves') +
             ' back. Say no and nothing at all happens — they are not told off for asking.',
        yes: 'Allow it', no: 'No, play on', go: yes,
        onNo: () => { const s = SFX(); if (s) s.takeback('no'); return no && no(); }
      });
    }
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
  /* a result card that was still on its way down must not land on top of this
     one — the match stopping outranks whatever it was about to say */
  clearTimeout(G.endTimer); G.endTimer = 0;
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
/* "Rematch, same opponent" means exactly that: the board that is on screen,
   played again. Prefs are only the fallback for a cold start. */
function start(){
  const p = P.pref('chess');
  const o = (G && G.mode !== 'online')
    ? { mode: G.mode, level: G.level, side: G.human }
    : { mode: (p.mode === 'pnp' ? 'pnp' : 'ai'), level: p.level || 2, side: p.side || 'w' };
  newGame(o);
}

/* ═══════════════════════════════════════════════════════════════════
   THE DOOR
   ───────────────────────────────────────────────────────────────────
   The shared sheet in js/party.js asks four questions and then makes you
   press Start, and it does it inside a scrolling column — so on a 660-tall
   phone, choosing "You vs the phone" grows the sheet and pushes Start clean
   off the bottom of the screen. MEASURED: at 390x660 the Start button sits at
   y=767 in a 660px window. The tap lands on nothing, and the game looks like
   it refuses to open. That is the worst bug a game can have, because it is
   the door.

   So chess owns its own door, and it is built on one rule: THE OPPONENT IS
   THE START. There is no separate Start button to fall off anything — you
   tap who you are playing and you are playing them. Difficulty and colour
   are not questions you have to answer to get in; they sit underneath with
   sensible defaults, they are one tap each to change, they say what they are
   doing in the door above them, and they can be changed from the board
   afterwards by tapping the badge. Two taps from the shelf to a moving
   board, down from three, and nothing on this screen scrolls at 390x660.
   ═══════════════════════════════════════════════════════════════════ */
function menu(){
  leave();
  P.ui.css();
  chessCSS();
  const el = P.ui.screenEl();
  const p = P.pref('chess');
  const M = window.KARTI_MP;
  const canOnline = !!(M && M.openFor);
  /* the owner's own phones cannot reach the relay while Tailscale is on, so
     if the last presence poll failed we say it in words rather than send
     somebody through a door that does not open */
  const relayDown = !!(canOnline && M.PR && M.PR.tried && M.PR.err);
  let level = LVL[+p.level] ? String(+p.level) : '2';
  let side  = (p.side === 'b') ? 'b' : 'w';
  const r = P.recOf ? P.recOf('chess') : { w:0, l:0, d:0 };
  const played = r.w + r.l + r.d;
  /* a board that was walked away from mid-game gets first billing */
  const sv = loadSave();
  const svLine = sv
    ? (sv.mode === 'ai' ? 'You vs the phone' : 'Pass the phone') + ' — ' +
      sv.log.length + (sv.log.length === 1 ? ' move' : ' moves') + ' in.'
    : '';

  const door = (v, icon, name, sub, cls) =>
    '<button type="button" class="ch-door' + (cls ? ' ' + cls : '') + '" data-go="' + v + '">' +
      ico(icon) + '<b>' + esc(name) + '</b><i id="ch-sub-' + v + '">' + esc(sub) + '</i>' +
      '<svg class="ico ch-chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<use href="#i-arrow-right"></use></svg>' +
    '</button>';

  /* the identity piece: five of the game's own tiles with five of its own
     men stood on them, fanned the way SKARTA fans its cards. Drawn from the
     same sprite and the same rim rules as the board, so the door and the
     game are one object. Decoration to a screen reader. */
  const tile = (cls, sym) =>
    '<span class="chm-tile ' + cls + '">' + U.pieceSVG(sym) + '</span>';
  const hero =
    '<div class="chm-hero" aria-hidden="true">' +
      tile('l pw', 'pt-p-r') + tile('pb', 'pt-p-n') + tile('l k pw', 'pt-p-k') +
      tile('pb', 'pt-p-q') + tile('l pw', 'pt-p-b') +
    '</div>';

  /* the house rules, for the dock at the foot: a piece, a name, a sentence */
  const rrow = (sym, name, text) =>
    '<div class="chm-rule">' + U.pieceSVG(sym) + '<b>' + esc(name) + '</b><i>' +
    esc(text) + '</i></div>';
  const rulesRows =
    rrow('pt-p-r', 'Castling, both ways',
      'The king steps two squares towards his rook and the rook jumps over. Not out of ' +
      'check, not through it, not into it — and neither piece may have moved.') +
    rrow('pt-p-p', 'En passant',
      'A pawn that double-steps past yours can be taken as if it had stepped once. ' +
      'On the very next move only; after that the moment is gone.') +
    rrow('pt-p-q', 'Promotion',
      'A pawn on the far rank comes back as a queen, rook, bishop or knight. ' +
      'Your choice, every time it happens.') +
    rrow('pt-p-k', 'The king',
      'No move may leave your own king in check. Out of moves entirely: checkmate if he ' +
      'is attacked, stalemate if not — and stalemate is a draw, not a win.') +
    rrow('pt-p-n', 'The draws',
      'Fifty moves each with no capture and no pawn moved, the same position three ' +
      'times over, or nobody with the wood left to mate. Nobody pays.');

  el.innerHTML =
    '<div class="pt-wrap chm">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="pt-back" aria-label="Back to party games">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Chess</h2>' +
      (played ? '<span class="pt-badge">' + r.w + 'W ' + r.l + 'L ' + r.d + 'D</span>' : '') +
    '</div>' +
    '<div class="scroll ch-setup">' +
      hero +
      '<p class="blurb">The proper thing — castling, en passant, and the pawn that walks all ' +
        'the way and comes back a queen. Pick who you are playing and you are playing.</p>' +
      '<div class="tiny pt-lbl">Who are you playing</div>' +
      '<div class="ch-doors">' +
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
      '<div class="ch-chips" id="ch-lvl">' +
        [1, 2, 3].map(k => '<button type="button" class="ch-chip" data-v="' + k + '">' +
          ico(LVL[k].icon) + esc(LVL[k].name) + '</button>').join('') +
      '</div>' +
      '<p class="ch-note" id="ch-lvl-note"></p>' +
      '<div class="tiny pt-lbl">And you play</div>' +
      '<div class="ch-chips" id="ch-side">' +
        '<button type="button" class="ch-chip" data-v="w">' +
          '<span class="pt-swatch w"></span>White</button>' +
        '<button type="button" class="ch-chip" data-v="b">' +
          '<span class="pt-swatch b"></span>Black</button>' +
      '</div>' +
      (played
        ? '<p class="pt-ledger">Against the phone so far: <b>' + r.w + '</b> won, <b>' + r.l +
          '</b> lost, <b>' + r.d + '</b> drawn.</p>'
        : '') +
      '<p class="pt-foot">None of this is a decision you are stuck with. Once you are ' +
        'sitting at the board, the pill in the top corner brings you straight back here.</p>' +
    '</div>' +
    /* the rules live at the foot, folded. In the flow, not over it: open or
       shut, the dock can never cover a door. */
    '<div class="chm-dock" id="ch-dock">' +
      '<button type="button" class="chm-grip" id="ch-grip" aria-expanded="false" ' +
        'aria-controls="ch-dockbody" aria-label="Open the house rules">' +
        ico('book') + '<span>The house rules</span>' +
        '<svg class="cv" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M6 14.6l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" ' +
          'stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<div class="chm-body" id="ch-dockbody" hidden><div>' + rulesRows + '</div></div>' +
    '</div>' +
    '</div>';

  /* the dock remembers whether you left it open — a UI preference, in a
     UI-only key, never in the game save. Same pattern as kiri's dock. */
  const dock = el.querySelector('#ch-dock');
  const grip = el.querySelector('#ch-grip');
  const dbody = el.querySelector('#ch-dockbody');
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

  const sync = () => {
    el.querySelectorAll('#ch-lvl .ch-chip').forEach(b =>
      b.classList.toggle('on', b.dataset.v === String(level)));
    el.querySelectorAll('#ch-side .ch-chip').forEach(b =>
      b.classList.toggle('on', b.dataset.v === side));
    const L = lvlOf(level);
    el.querySelector('#ch-lvl-note').textContent = L.note;
    /* the door says exactly what it is about to do */
    const sub = el.querySelector('#ch-sub-ai');
    if (sub) sub.textContent = L.name + ' · you are ' + (side === 'w' ? 'White, and you go first'
                                                                     : 'Black, and it goes first');
  };
  el.querySelectorAll('#ch-lvl .ch-chip').forEach(b =>
    b.onclick = () => { level = b.dataset.v; sync(); });
  el.querySelectorAll('#ch-side .ch-chip').forEach(b =>
    b.onclick = () => { side = b.dataset.v; sync(); });
  sync();

  el.querySelectorAll('.ch-door').forEach(b => b.onclick = () => {
    const go = b.dataset.go;
    if (go === 'resume'){ restoreSaved(); return; }
    P.pref('chess', { mode: go, level: level, side: side });
    if (go === 'online'){
      if (!canOnline){ nudge('Online is not built into this copy.'); return; }
      M.openFor('chess');
      return;
    }
    newGame({ mode: go, level: level, side: side });
  });
  el.querySelector('#pt-back').onclick = () => P.hub();
}
/* Called for every way OUT of the board, including the app navigating out from
   under us. Online that has to reach js/mp.js — a player who taps Home mid-game
   has left the room, and the other one must be told. */
function leave(){
  if (!G){ return; }
  saveGame();                     /* every way out writes the board first */
  const net = online() ? G.net : null;
  G.dead = true;
  clearTimeout(G.endTimer);
  if (G.ctx && G.ctx.stopFit) G.ctx.stopFit();
  G = null;
  if (net && net.onGone) net.onGone();
}

/* iOS does not fire unload and cannot be trusted with beforeunload; the
   events that actually happen when somebody swipes away are these two.
   saveGame() refuses finished, dead and online boards on its own. */
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
window.addEventListener('pagehide', () => saveGame());

P.register({
  id:'chess', order:10, kind:'board', name:'CHESS', mt:'Iċ-ċess', sprite:'pt-p-k', status:'live',
  tag:'Sixteen each, one king, and no luck to blame. Somebody online, the machine, ' +
      'or the two of you passing one phone.',
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

/* ═══════════════════════════════════════════════════════════════════
   CHESS — THE KIT SHELF (purely cosmetic, always)
   Boards and piece sets, declared through KARTI_XP.register() and
   applied as CSS custom properties scoped to the chess wrap (.ch).
   party.js already reads --lite/--dark for the squares and
   --pcw/--pcb/--rimw/--rimb for the pieces, so a theme here is
   nothing but a re-declaration of those variables one scope down —
   not one rule, deal or move is touched, and unequipping simply
   falls back to the stock board. The style node is re-appended on
   every change so it always lands after the game's own sheet.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var BOARDS = {
  'chess.board.kazin':  { l:'#E9E4CF', d:'#3F6B4F', f:'#12281A' },
  'chess.board.gewz':   { l:'#E7CFA3', d:'#6B4326', f:'#2A1608' },
  'chess.board.franka': { l:'#F2E5C4', d:'#B5905A', f:'#4A3416' },
  'chess.board.port':   { l:'#D9E6F0', d:'#2E5E86', f:'#0E2438' },
  'chess.board.roza':   { l:'#F6DCE4', d:'#8A3A5E', f:'#38101F' },
  'chess.board.festa':  { l:'#F5E7C8', d:'#4A2C72', f:'#FFC542' },
  'chess.board.lejl':   { l:'#9AA2B8', d:'#262C40', f:'#07080F' },
  /* MALTESE SUMMER */
  'chess.board.xemx':   { l:'#FFF9E4', d:'#F0A81E', f:'#8A5406' }
};
var PIECES = {
  'chess.pieces.fuhhar':  { w:'#F6D9B5', rw:'#7A4018', b:'#B0492B', rb:'#FFD9A8' },
  'chess.pieces.ram':     { w:'#ECECF2', rw:'#3A3F55', b:'#C98A3E', rb:'#FFE9C0' },
  'chess.pieces.ghawdex': { w:'#D8EEE4', rw:'#1E5E4A', b:'#23557A', rb:'#A8D8F0' },
  'chess.pieces.karnival':{ w:'#FFD9E8', rw:'#8A2A55', b:'#279A8A', rb:'#C8F5EE' },
  'chess.pieces.indurat': { w:'#FFE9B0', rw:'#6B4A00', b:'#241134', rb:'#FFC542' },
  'chess.pieces.lejla':   { w:'#E8E4F5', rw:'#241134', b:'#120B20', rb:'#8A5CFF' },
  /* MALTESE SUMMER */
  'chess.pieces.granita': { w:'#FCFBDA', rw:'#A8880C', b:'#D0203F', rb:'#FFDFE6' }
};

function sheet(){
  var st = document.getElementById('chx-kit-css');
  if (!st){ st = document.createElement('style'); st.id = 'chx-kit-css'; }
  /* appendChild MOVES an existing node to the end, so this sheet is
     always later than the game's own and its equal-specificity rules
     win. The #app prefix out-specifies party.js's #scr-party rules. */
  document.head.appendChild(st);
  return st;
}

function apply(){
  var XP = window.KARTI_XP;
  if (!XP) return;
  var css = '', b = BOARDS[XP.equipped('board', 'chess') || ''];
  if (b) css += '#app #scr-party .ch{--lite:' + b.l + ';--dark:' + b.d + '}' +
                '#app #scr-party .pt-wrap.ch .pt-board{border-color:' + b.f + '}';
  var p = PIECES[XP.equipped('pieces', 'chess') || ''];
  if (p) css += '#app #scr-party .ch{--pcw:' + p.w + ';--rimw:' + p.rw +
                ';--pcb:' + p.b + ';--rimb:' + p.rb + '}';
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

/* a real knight and a real king off party.js's own sprite, wearing the
   set's fills — the sprite is injected by the party kit, so make sure
   it exists before asking for it. Falls back to two turned pawns drawn
   as discs if the sprite is somehow absent. */
function piecePv(t){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style', 'display:flex;align-items:center;justify-content:center;' +
      'gap:2px;width:' + s + 'px;height:' + s + 'px');
    try { if (window.KARTI_PARTY && KARTI_PARTY.ui && KARTI_PARTY.ui.css) KARTI_PARTY.ui.css(); } catch (e){}
    function one(fill, rim){
      if (document.getElementById('pt-sprite'))
        return '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:' + Math.floor(s * .46) +
               'px;height:' + Math.floor(s * .46) + 'px;fill:' + fill + ';stroke:' + rim +
               ';paint-order:stroke fill;stroke-width:1.1;stroke-linejoin:round">' +
               '<use href="#pt-p-n"></use></svg>';
      return '<span style="width:' + Math.floor(s * .34) + 'px;height:' + Math.floor(s * .34) +
             'px;border-radius:50%;background:' + fill + ';box-shadow:0 0 0 2px ' + rim + '"></span>';
    }
    el.innerHTML = one(t.w, t.rw) + one(t.b, t.rb);
    return el;
  };
}

function boot(tries){
  var XP = window.KARTI_XP;
  if (!XP){ if (tries < 40) setTimeout(function(){ boot(tries + 1); }, 500); return; }
  var KIT = XP.forGame('chess');
  KIT.register([
    { slot:'board', id:'chess.board.kazin',  level:0,  name:'Tal-Każin',
      blurb:'The baize off the club table, cigarette burns steamed out.', preview:boardPv(BOARDS['chess.board.kazin']) },
    { slot:'board', id:'chess.board.gewz',   level:2,  name:'Ġewż',
      blurb:'Walnut, waxed by forty years of winning arguments.', preview:boardPv(BOARDS['chess.board.gewz']) },
    { slot:'board', id:'chess.board.franka', level:6,  name:'Franka',
      blurb:'Cut from the same limestone as every wall you have ever leaned on.', preview:boardPv(BOARDS['chess.board.franka']) },
    { slot:'board', id:'chess.board.port',   level:11, name:'Il-Port',
      blurb:'Harbour water and morning haze. The ferry is late.', preview:boardPv(BOARDS['chess.board.port']) },
    { slot:'board', id:'chess.board.roza',   level:17, name:'Oleandra',
      blurb:'Oleander pink and wine. The prettiest thing you will lose on.', preview:boardPv(BOARDS['chess.board.roza']) },
    { slot:'board', id:'chess.board.festa',  level:26, name:'Lejl tal-Festa',
      blurb:'Velvet purple with a gilded rim. The band is tuning up.', preview:boardPv(BOARDS['chess.board.festa']) },
    { slot:'board', id:'chess.board.lejl',   level:34, name:'Nofsillejl',
      blurb:'Slate on slate. For people who finish games after 2am.', preview:boardPv(BOARDS['chess.board.lejl']) },
    { slot:'board', id:'chess.board.xemx',   level:5,  name:'Xemx tat-Tmienja', set:'summer',
      blurb:'Eight in the morning and everything is already white and gold. Sit on the other side.', preview:boardPv(BOARDS['chess.board.xemx']) },

    { slot:'pieces', id:'chess.pieces.fuhhar',  level:4,  name:'Fuħħar',
      blurb:'Terracotta out of a Rabat kiln, still warm.', preview:piecePv(PIECES['chess.pieces.fuhhar']) },
    { slot:'pieces', id:'chess.pieces.ram',     level:9,  name:'Fidda u Ram',
      blurb:'Silver against brass. The good drawer, the one that sticks.', preview:piecePv(PIECES['chess.pieces.ram']) },
    { slot:'pieces', id:'chess.pieces.ghawdex', level:14, name:'Ta’ Għawdex',
      blurb:'Sea glass and deep channel blue, straight off the ferry rail.', preview:piecePv(PIECES['chess.pieces.ghawdex']) },
    { slot:'pieces', id:'chess.pieces.karnival',level:22, name:'Karnival',
      blurb:'Rose against lagoon. Nadur would approve and never admit it.', preview:piecePv(PIECES['chess.pieces.karnival']) },
    { slot:'pieces', id:'chess.pieces.indurat', level:30, name:'Indurat',
      blurb:'Gilded like the titular statue. Handle with cotton gloves.', preview:piecePv(PIECES['chess.pieces.indurat']) },
    { slot:'pieces', id:'chess.pieces.lejla',   level:40, name:'Tal-Lejla',
      blurb:'Moonstone and a violet so deep it is nearly a rumour.', preview:piecePv(PIECES['chess.pieces.lejla']) },
    { slot:'pieces', id:'chess.pieces.granita', level:11, name:'Granita tal-Lumi', set:'summer',
      blurb:'Lemon ice against crushed red syrup. Play fast, it is already melting.', preview:piecePv(PIECES['chess.pieces.granita']) }
  ]);
  KIT.onChange(apply);
  apply();
}
boot(0);

})();
