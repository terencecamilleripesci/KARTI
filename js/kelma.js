/* ═══════════════════════════════════════════════════════════════════
   KARTI — kelma.js
   KELMA ("word") — an ORIGINAL Maltese+English word-tile game, 2–4
   players. Its own board, its own tiles, its own values — the mechanic
   (place letter tiles for points) is free; nothing here copies a
   commercial set. The pure engine: board, bag, placement rules,
   word-forming, scoring. Dictionary-AGNOSTIC — it takes an isWord(str)
   predicate, so the 73k-word English list + the curated Maltese list
   live in the UI layer and this file stays small and testable.

   THE BOARD — 15×15, an ORIGINAL 4-fold-symmetric premium layout:
     '.' plain   d double-letter   t triple-letter
     D double-word   T triple-word   * centre (double-word, first move)

   THE TILES — the 30-letter bilingual alphabet: a–z (English) plus the
   four Maltese letters ċ ġ ħ ż, and two blanks. A blank plays as any
   letter but scores 0. Maltese digraphs (għ, ie) are spelt with their
   component tiles, so one bag serves both languages.

   A TURN places tiles from the rack onto empty cells, all in one line,
   contiguous and connected (through the centre on the first move). Every
   word the placement forms — the main line AND each cross word — must be
   in the dictionary. Score = letter values × letter/word premiums that
   the NEW tiles land on, +50 for using all seven (a "kelma sħiħa").

   THE WIRE — a move is a numeric list: for each placed tile {r,c,l,b}
   where l is the letter index 0..29 and b=1 for a blank. Packed by the
   UI into mp.js's codec (numbers only). Append-only fields.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const N = 15;
const MIN_SEATS = 2, MAX_SEATS = 4;
const RACK = 7;
const BINGO = 50;                       /* all seven tiles in one turn    */
const WIRE_FIELDS = ['r', 'c', 'l', 'b'];

const PREMIUM = (
  'T.d.t..T..t.d.T' + '.D.t.Dd.dD.t.D.' + 'd.D...t.t...D.d' + '.t.D...d...D.t.' +
  't...D.....D...t' + '.D...t...t...D.' + '.dt...d.d...td.' + 'T..d...*...d..T' +
  '.dt...d.d...td.' + '.D...t...t...D.' + 't...D.....D...t' + '.t.D...d...D.t.' +
  'd.D...t.t...D.d' + '.D.t.Dd.dD.t.D.' + 'T.d.t..T..t.d.T'
);
const premAt = (r, c) => PREMIUM[r * N + c];

/* the 30-letter alphabet + values. English-frequency values, with the
   Maltese letters priced by their rarity. Blank = '_' (value 0). */
const ALPHA = 'abċdefġghħijklmnopqrstuvwxyzż';   /* 28? — built explicitly below */
/* build the ordered alphabet and value/count tables ONCE */
const LETTERS = ['a','b','c','ċ','d','e','f','g','ġ','h','ħ','i','j','k','l','m',
                 'n','o','p','q','r','s','t','u','v','w','x','y','z','ż'];   /* 30 */
const NLET = LETTERS.length;
const IDX = {}; LETTERS.forEach((ch, i) => IDX[ch] = i);
const codeOf = ch => (ch === '_' ? 30 : (IDX[ch] == null ? -1 : IDX[ch]));
const letOf  = i => (i === 30 ? '_' : (LETTERS[i] || ''));

/* value per letter (index-aligned to LETTERS) */
const VALUE = {
  a:1,e:1,i:1,o:1,u:1,n:1,r:1,t:1,s:1,l:1,
  d:2,g:2,
  b:3,c:3,m:3,p:3,h:3,
  f:4,v:4,w:4,y:4,
  k:5,
  ġ:4,ħ:4,
  j:8,x:8,ċ:6,ż:6,
  q:10,z:10,
  _:0
};
const valueOf = ch => (VALUE[ch] == null ? 0 : VALUE[ch]);

/* the bag — counts per letter (~100 tiles), tuned for a bilingual set */
const COUNT = {
  a:9,e:11,i:9,o:8,u:4,n:6,r:6,t:6,s:5,l:4,
  d:4,g:3,b:2,c:2,m:2,p:2,h:2,f:2,v:2,w:2,y:2,
  k:1,ġ:2,ħ:2,j:1,x:1,ċ:1,ż:1,q:1,z:1,
  _:2
};

function buildBag(){
  const bag = [];
  for (const ch in COUNT) for (let k = 0; k < COUNT[ch]; k++) bag.push(ch === '_' ? '_' : ch);
  return bag;
}

/* ── deterministic shuffle from a seed (xorshift; NO Math.random) ────── */
function shuffle(arr, seed){
  let s = (seed >>> 0) || 1;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = arr.length - 1; i > 0; i--){ const j = (rnd() * (i + 1)) | 0; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}

function newGame(opts, seed){
  opts = opts || {};
  const seats = Math.max(MIN_SEATS, Math.min(MAX_SEATS, (opts.seats | 0) || 2));
  const bag = shuffle(buildBag(), seed >>> 0);
  const st = {
    seats, turn: 0, seed: seed >>> 0,
    board: new Array(N * N).fill(null),  /* each cell: null or {ch, blank} */
    bag,
    racks: [],                           /* racks[seat] = array of tile chars */
    scores: new Array(seats).fill(0),
    passes: 0, moves: 0, done: null,
    last: null                           /* {seat, cells:[{r,c}], words, score} */
  };
  for (let i = 0; i < seats; i++){
    const rack = [];
    for (let k = 0; k < RACK && bag.length; k++) rack.push(bag.pop());
    st.racks.push(rack);
  }
  return st;
}

const cellAt = (st, r, c) => st.board[r * N + c];
const inB = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
const empty = st => st.board.every(x => x == null);

/* remove the placed tiles from a rack (by char; a blank plays from a '_'
   tile). Returns the new rack, or null if the rack lacks the tiles. */
function useFromRack(rack, placed){
  const r = rack.slice();
  for (const p of placed){
    const want = p.blank ? '_' : p.ch;
    const i = r.indexOf(want);
    if (i < 0) return null;
    r.splice(i, 1);
  }
  return r;
}

/* validate the geometry of a placement (before words/dictionary):
   returns {ok, why, line:'row'|'col', cells:[{r,c,ch,blank}]} */
function checkPlacement(st, placed){
  if (!placed || !placed.length) return { ok:false, why:'empty' };
  for (const p of placed){
    if (!inB(p.r, p.c)) return { ok:false, why:'offboard' };
    if (cellAt(st, p.r, p.c)) return { ok:false, why:'occupied' };
  }
  /* one line */
  const rows = new Set(placed.map(p => p.r)), cols = new Set(placed.map(p => p.c));
  let line;
  if (rows.size === 1) line = 'row';
  else if (cols.size === 1) line = 'col';
  else return { ok:false, why:'notaline' };
  /* no duplicate cells */
  const seen = new Set();
  for (const p of placed){ const k = p.r * N + p.c; if (seen.has(k)) return { ok:false, why:'dup' }; seen.add(k); }
  /* contiguity along the line (existing tiles may fill gaps) */
  const fixed = line === 'row' ? placed[0].r : placed[0].c;
  const along = placed.map(p => line === 'row' ? p.c : p.r).sort((a, b) => a - b);
  for (let x = along[0]; x <= along[along.length - 1]; x++){
    const has = seen.has(line === 'row' ? fixed * N + x : x * N + fixed) ||
                cellAt(st, line === 'row' ? fixed : x, line === 'row' ? x : fixed);
    if (!has) return { ok:false, why:'gap' };
  }
  /* first move must cover the centre */
  const first = empty(st);
  if (first){
    const mid = (N - 1) / 2;
    if (!placed.some(p => p.r === mid && p.c === mid)) return { ok:false, why:'centre' };
  } else {
    /* must connect to an existing tile */
    let touch = false;
    for (const p of placed){
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
        if (inB(p.r+dr,p.c+dc) && cellAt(st, p.r+dr, p.c+dc)){ touch = true; break; }
      }
      if (touch) break;
    }
    if (!touch) return { ok:false, why:'disconnected' };
  }
  return { ok:true, line, cells: placed };
}

/* with `placed` laid on a scratch board, collect every word formed: the
   main line word plus each cross word. Returns [{cells:[{r,c,ch,blank,neu}], str}]
   where neu=true marks a newly placed tile (for premium scoring). */
function wordsFormed(st, placed, line){
  const at = (r, c) => {
    const p = placed.find(x => x.r === r && x.c === c);
    if (p) return { ch: p.ch, blank: p.blank, neu: true };
    const e = cellAt(st, r, c);
    return e ? { ch: e.ch, blank: e.blank, neu: false } : null;
  };
  const words = [];
  const runFrom = (r, c, dr, dc) => {
    /* back up to the start of the run */
    let sr = r, sc = c;
    while (inB(sr - dr, sc - dc) && at(sr - dr, sc - dc)){ sr -= dr; sc -= dc; }
    const cells = [];
    let cr = sr, cc = sc;
    while (inB(cr, cc) && at(cr, cc)){ const t = at(cr, cc); cells.push({ r:cr, c:cc, ch:t.ch, blank:t.blank, neu:t.neu }); cr += dr; cc += dc; }
    return cells;
  };
  /* the main word: along the line, if length > 1 */
  const mr = placed[0].r, mc = placed[0].c;
  const main = line === 'row' ? runFrom(mr, mc, 0, 1) : runFrom(mr, mc, 1, 0);
  if (main.length > 1) words.push({ cells: main, str: main.map(x => x.ch).join('') });
  /* cross words: for each placed tile, the perpendicular run if > 1 */
  for (const p of placed){
    const cross = line === 'row' ? runFrom(p.r, p.c, 1, 0) : runFrom(p.r, p.c, 0, 1);
    if (cross.length > 1) words.push({ cells: cross, str: cross.map(x => x.ch).join('') });
  }
  return words;
}

/* score one word: letter values with letter-premiums on NEW tiles, then
   word-premiums on NEW tiles multiply the whole word. */
function scoreWord(word){
  let sum = 0, mult = 1;
  for (const cell of word.cells){
    let v = cell.blank ? 0 : valueOf(cell.ch);
    if (cell.neu){
      const p = premAt(cell.r, cell.c);
      if (p === 'd') v *= 2;
      else if (p === 't') v *= 3;
      else if (p === 'D' || p === '*') mult *= 2;
      else if (p === 'T') mult *= 3;
    }
    sum += v;
  }
  return sum * mult;
}

/* the full legality + score of a candidate move. isWord(str) is the
   dictionary predicate the caller supplies. Returns
   {ok, why?, score?, words?, cells?}. Does NOT mutate st. */
function tryMove(st, seat, placed, isWord){
  if (st.done) return { ok:false, why:'over' };
  if (seat !== st.turn) return { ok:false, why:'turn' };
  const geo = checkPlacement(st, placed);
  if (!geo.ok) return geo;
  if (useFromRack(st.racks[seat], placed) == null) return { ok:false, why:'rack' };
  const words = wordsFormed(st, placed, geo.line);
  if (!words.length) return { ok:false, why:'noword' };
  for (const w of words){ if (!isWord(w.str)) return { ok:false, why:'badword', word: w.str }; }
  let score = 0;
  for (const w of words) score += scoreWord(w);
  if (placed.length === RACK) score += BINGO;
  return { ok:true, score, words: words.map(w => w.str), cells: placed, line: geo.line };
}

/* commit a validated move: lay tiles, score, refill the rack, advance. */
function apply(st, seat, placed, isWord){
  const res = tryMove(st, seat, placed, isWord);
  if (!res.ok) return res;
  for (const p of placed) st.board[p.r * N + p.c] = { ch: p.ch, blank: !!p.blank };
  st.racks[seat] = useFromRack(st.racks[seat], placed);
  while (st.racks[seat].length < RACK && st.bag.length) st.racks[seat].push(st.bag.pop());
  st.scores[seat] += res.score;
  st.passes = 0; st.moves++;
  st.last = { seat, cells: placed.map(p => ({ r:p.r, c:p.c })), words: res.words, score: res.score };
  endCheck(st, seat);
  if (!st.done) st.turn = (st.turn + 1) % st.seats;
  return res;
}

/* pass or swap. swap returns `drop` tiles to the bag and draws the same
   number (only if the bag has enough). Both advance the turn. */
function passOrSwap(st, seat, drop){
  if (st.done || seat !== st.turn) return { ok:false };
  if (drop && drop.length){
    if (st.bag.length < drop.length) return { ok:false, why:'bag' };
    const nr = useFromRack(st.racks[seat], drop.map(ch => ({ ch, blank: ch === '_' })));
    if (nr == null) return { ok:false, why:'rack' };
    st.racks[seat] = nr;
    for (const ch of drop) st.bag.unshift(ch);
    shuffle(st.bag, (st.seed ^ (st.moves * 2654435761)) >>> 0);
    while (st.racks[seat].length < RACK && st.bag.length) st.racks[seat].push(st.bag.pop());
    st.passes = 0;
  } else {
    st.passes++;
  }
  st.moves++;
  endCheck(st, seat);
  if (!st.done) st.turn = (st.turn + 1) % st.seats;
  return { ok:true };
}

/* the game ends when a rack empties with the bag empty (that player is
   out of tiles) or everyone passes twice around. Final tally subtracts
   the tiles left on each rack; the emptied rack gains the others' leftovers. */
function endCheck(st, lastSeat){
  const emptied = st.bag.length === 0 && st.racks[lastSeat].length === 0;
  const stalled = st.passes >= st.seats * 2;
  if (!emptied && !stalled) return;
  let leftover = 0;
  for (let i = 0; i < st.seats; i++){
    let v = 0; for (const ch of st.racks[i]) v += valueOf(ch);
    st.scores[i] -= v; leftover += v;
  }
  if (emptied) st.scores[lastSeat] += leftover;   /* the go-out bonus */
  let win = 0; for (let i = 1; i < st.seats; i++) if (st.scores[i] > st.scores[win]) win = i;
  st.done = { winner: win, reason: emptied ? 'out' : 'stalled' };
}

function turn(st){ return st.done ? -1 : st.turn; }
function over(st){ return st.done ? { winner: st.done.winner, winners:[st.done.winner], draw:false } : null; }

/* seat that left for good: freeze it (its tiles stay), skip its turns. */
function dropSeat(st, seat){
  if (!st || seat < 0 || seat >= st.seats) return;
  st._gone = st._gone || {};
  st._gone[seat] = 1;
  if (!st.done && st.turn === seat){
    for (let h = 1; h <= st.seats; h++){ const s = (seat + h) % st.seats; if (!st._gone[s]){ st.turn = s; break; } }
  }
}

/* ── the wire: a move is a flat list of placed tiles. The UI packs each
   {r,c,l,b} through mp.js; here we just encode/decode the list shape. */
const encWire = placed => placed.map(p => ({ r: p.r, c: p.c, l: codeOf(p.blank ? letOf(codeOf(p.ch)) : p.ch), b: p.blank ? 1 : 0 }));
const decWire = list => (Array.isArray(list) ? list : []).map(w => ({
  r: w.r | 0, c: w.c | 0, ch: letOf(w.l | 0), blank: !!w.b
})).filter(p => p.ch && inB(p.r, p.c));

window.KARTI_KELMA = window.KARTI_KELMA || {};
window.KARTI_KELMA.engine = {
  N, MIN_SEATS, MAX_SEATS, RACK, BINGO, WIRE_FIELDS, PREMIUM, premAt,
  LETTERS, NLET, codeOf, letOf, valueOf, COUNT, VALUE,
  buildBag, shuffle, newGame, cellAt, inB, empty,
  checkPlacement, wordsFormed, scoreWord, tryMove, apply, passOrSwap,
  turn, over, dropSeat, useFromRack, encWire, decWire
};

})();
