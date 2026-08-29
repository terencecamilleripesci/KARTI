/* ═══════════════════════════════════════════════════════════════════
   KARTI — hajja.js
   IL-ĦAJJA — "the life". A Maltese take on the spin-and-move life board
   game, for TWO to SIX players. This is the PURE ENGINE: rules only, no
   DOM, no clock, no sound, and the one Math.random in the file lives in
   newSeed(), the same quarantine js/aqleb.js and js/sqaq.js keep.
   The screens are js/hajja-ui.js.

   THE GAME IT IS BASED ON, and what was kept
     The classic is: spin a wheel, drive a car full of peg people along a
     winding road, take a job, get married, have children, collect your
     pay every time you pass a payday, and retire. Most money at the end
     wins. Those are the bones and they are not anybody's property — what
     IS somebody's property is that board, its artwork and its wording,
     so none of it is copied. The road here is ours: the squares are a
     Maltese life, the careers are Maltese jobs, and the money is euro.

   THE SHAPE OF A TURN
     1. SPIN — 1..10, from the seeded stream, never Math.random.
     2. MOVE — step forward one space at a time. Stepping ONTO a payday
        pays; you are paid for PASSING one too, which is what makes the
        long way round worth taking.
     3. RESOLVE — the square you finish on does its thing. A STOP square
        halts you even if you had spin left, which is how marriage, the
        house and retirement stay unmissable.
     4. Next player, unless the square gave you another go.

   THE FORK, which is the only real decision in the game
     Space 0 sends you to UNIVERSITY or STRAIGHT TO WORK. University
     costs two loans and a longer road before you earn anything, and pays
     for itself with the degree careers — Tabib, Avukat, Perit. Work now
     starts your salary immediately on a shorter, poorer road. Neither is
     strictly better: that is the point, and the AI weighs it by level.

   DETERMINISM
     Every table with the same seed and the same moves reaches the same
     state — spins, card draws and the AI all read one xorshift stream
     seeded from the match. Nothing in here looks at a clock. That is
     what makes an online table honest and a replay exact.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function (root) {

/* ── table size ────────────────────────────────────────────────────── */
var MIN_SEATS = 2, MAX_SEATS = 6;

/* ── the one Math.random, quarantined ──────────────────────────────── */
function newSeed(){ return (Math.random() * 0x100000000) >>> 0; }

/* xorshift32: small, fast, and identical on every phone */
function rnd(st){
  var x = st.rs >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;  x >>>= 0;
  st.rs = x;
  return x / 4294967296;
}
function pick(st, n){ return Math.floor(rnd(st) * n) % n; }

/* ── money ─────────────────────────────────────────────────────────
   Everything is in whole euro thousands. Keeping it integral means no
   float drift over a long game and no rounding argument at the end. */
var LOAN = 20;          /* what the bank hands you                    */
var LOAN_BACK = 25;     /* what it wants back — the interest, flat     */
var START_CASH = 10;

/* ── the careers ───────────────────────────────────────────────────
   `deg` marks the ones that need the university road. Salary is what a
   payday pays. `tax` is what you hand over on a TAXXA square — the
   better paid you are, the more the VAT man enjoys your company. */
var CAREERS = [
  { id:'tabib',    n:'Tabib',            mt:'Tabib',            deg:1, pay:22, tax:9 },
  { id:'avukat',   n:'Avukat',           mt:'Avukat',           deg:1, pay:20, tax:8 },
  { id:'perit',    n:'Perit',            mt:'Perit',            deg:1, pay:18, tax:7 },
  { id:'ghalliem', n:'Għalliem',         mt:'Għalliem',         deg:1, pay:14, tax:4 },
  { id:'kuntrat',  n:'Kuntrattur',       mt:'Kuntrattur',       deg:0, pay:16, tax:7 },
  { id:'sewwieq',  n:'Sewwieq tat-taxi', mt:'Sewwieq tat-taxi', deg:0, pay:11, tax:3 },
  { id:'bidwi',    n:'Bidwi',            mt:'Bidwi',            deg:0, pay:10, tax:2 },
  { id:'bar',      n:'Tal-bar',          mt:'Tal-bar',          deg:0, pay:9,  tax:2 }
];
var careerById = function (id){
  for (var i = 0; i < CAREERS.length; i++) if (CAREERS[i].id === id) return CAREERS[i];
  return null;
};

/* ── the houses ────────────────────────────────────────────────────
   Bought on the HOUSE stop, sold back at the end. `sell` is deliberately
   a spread around `cost`: the flat in Sliema is the safe money and the
   farmhouse is the gamble, decided by one spin at the end. */
var HOUSES = [
  { id:'garaxx',   n:'A garage in Marsa',        cost:20,  low:15,  high:35 },
  { id:'appart',   n:'Apartment in Ħamrun',      cost:45,  low:40,  high:70 },
  { id:'terrace',  n:'Terraced house, Mosta',    cost:80,  low:70,  high:120 },
  { id:'sliema',   n:'Flat in Sliema',           cost:120, low:115, high:160 },
  { id:'razzett',  n:'Farmhouse in Gozo',        cost:150, low:100, high:260 },
  { id:'penthouse',n:'Penthouse, Tas-Sliema',    cost:220, low:180, high:330 }
];
var houseById = function (id){
  for (var i = 0; i < HOUSES.length; i++) if (HOUSES[i].id === id) return HOUSES[i];
  return null;
};

/* ── the squares ───────────────────────────────────────────────────
   k: kind. One letter so the wire payload stays tiny.
     'S' start fork      'P' payday          'L' ħajja tile
     'E' event (pay/get) 'C' career change   'B' baby
     'X' STOP (marry / house / retire)       '.' plain road
   v: the money it moves, negative is out of your pocket.
   t: english label. m: maltese. stop: which stop it is.
   The two roads join at JOIN; university is the longer, later entry. */
var UNI_LEN = 12;                       /* spaces on the university spur */
var ROAD = [
  /* — the shared road, from the join onward — */
  { k:'P', t:'PAYDAY' },
  { k:'.', t:'You start work. Everyone tells you it goes quickly.' },
  { k:'E', v:-3,  t:'Car breaks down on the Coast Road.' },
  { k:'L', t:'You learn to make a decent ftira.' },
  { k:'E', v:4,   t:'Nanna slips you something at Sunday lunch.' },
  { k:'X', stop:'marry', t:'GET MARRIED' },
  { k:'E', v:-6,  t:'The wedding was “small”.' },
  { k:'P', t:'PAYDAY' },
  { k:'E', v:-4,  t:'A permit you did not know you needed.' },
  { k:'L', t:'You find a parking space in Valletta.' },
  { k:'C', t:'Career change — the office was not it.' },
  { k:'E', v:5,   t:'You sell the old Punto for more than it is worth.' },
  { k:'X', stop:'house', t:'BUY A HOUSE' },
  { k:'P', t:'PAYDAY' },
  { k:'B', t:'A baby. Congratulations, you are tired now.' },
  { k:'E', v:-5,  t:'School books, uniform, and the trip.' },
  { k:'L', t:'The festa goes perfectly. You were on the committee.' },
  { k:'E', v:-7,  t:'The VAT inspector has a few questions.', tax:1 },
  { k:'P', t:'PAYDAY' },
  { k:'E', v:6,   t:'A cousin pays back a loan from 2009.' },
  { k:'B', t:'Another baby. The car is now full.' },
  { k:'E', v:-4,  t:'The block is doing the roof. Your share.' },
  { k:'L', t:'You finally learn to swim properly.' },
  { k:'P', t:'PAYDAY' },
  { k:'E', v:-8,  t:'Development next door. Windows shut all summer.' },
  { k:'C', t:'Career change — a friend needs a partner.' },
  { k:'E', v:7,   t:'You win something small at the każin tombla.' },
  { k:'L', t:'The mother-in-law says something kind.' },
  { k:'P', t:'PAYDAY' },
  { k:'E', v:-6,  t:'Both cars need a service in the same week.' },
  { k:'E', v:9,   t:'A field you forgot about gets rezoned.' },
  { k:'L', t:'Grandchildren. All of them at once, every Sunday.' },
  { k:'P', t:'PAYDAY' },
  { k:'X', stop:'retire', t:'RETIRE' }
];
/* the university spur: expensive, slow, and worth it if you last */
var UNI = [
  { k:'T', t:'Tuition. The first loan.' },
  { k:'.', t:'Lectures at nine. You are never awake for them.' },
  { k:'L', t:'You pass a year nobody thought you would.' },
  { k:'E', v:-4,  t:'Books, and a laptop that dies in June.' },
  { k:'.', t:'A summer job that teaches you nothing.' },
  { k:'T', t:'Final year. The second loan.' },
  { k:'L', t:'You graduate. Somebody cries.' },
  { k:'.', t:'Six months of applying to everything.' },
  { k:'C', t:'You get a real job.' },
  { k:'.', t:'It starts on Monday.' },
  { k:'.', t:'The road joins the main one here.' },
  { k:'.', t:'' }
];
/* the short road for anyone who started work at sixteen */
var WORK = [
  { k:'C', t:'You take the first job going.' },
  { k:'P', t:'PAYDAY' },
  { k:'E', v:-2, t:'Boots, and a van that is not yours.' },
  { k:'.', t:'The road joins the main one here.' }
];

/* one flat array, so a position is a single integer on the wire.
   0 is the fork itself; then the university spur, then the work spur,
   then the shared road they both feed into. */
function buildBoard(){
  var b = [{ k:'S', t:'UNIVERSITY, OR STRAIGHT TO WORK?' }], i;
  var uniAt = b.length;
  for (i = 0; i < UNI.length; i++)  b.push(UNI[i]);
  var workAt = b.length;
  for (i = 0; i < WORK.length; i++) b.push(WORK[i]);
  var joinAt = b.length;
  for (i = 0; i < ROAD.length; i++) b.push(ROAD[i]);
  return { sq: b, uniAt: uniAt, workAt: workAt, joinAt: joinAt,
           uniEnd: uniAt + UNI.length, workEnd: workAt + WORK.length };
}
var BOARD = buildBoard();
var END = BOARD.sq.length - 1;                   /* the RETIRE square */

/* Where you go from `at` after one step. The two spurs are dead ends
   that hand you to the shared road, which is the whole reason a
   position can stay one number instead of a lane plus an offset. */
function nextSpace(at){
  if (at === BOARD.uniEnd - 1)  return BOARD.joinAt;
  if (at === BOARD.workEnd - 1) return BOARD.joinAt;
  return at + 1;
}

/* ── the machine's three sharpnesses ───────────────────────────────── */
var LEVELS = [
  { level:1, name:'Il-Bużż',  note:{ en:'Takes the short road and hopes.',
                                     mt:'Jaqbad it-triq qasira u jittama.' } },
  { level:2, name:'Tal-Każin', note:{ en:'Borrows when it has to, not before.',
                                      mt:'Jissellef meta jrid, mhux qabel.' } },
  { level:3, name:'In-Nanna',  note:{ en:'Goes to university and counts everything.',
                                      mt:'Tmur l-università u tgħodd kollox.' } }
];

/* ── a player ──────────────────────────────────────────────────────── */
function newPlayer(i){
  return {
    seat: i,
    at: 0,                 /* index into BOARD.sq                        */
    done: false,           /* retired                                    */
    cash: START_CASH,
    loans: 0,              /* how many times you went to the bank        */
    career: null,          /* career id                                  */
    house: null,           /* house id                                   */
    pegs: 1,               /* you, then spouse, then children            */
    married: false,
    kids: 0,
    tiles: 0,              /* ĦAJJA tiles collected                      */
    uni: false,            /* took the university road                   */
    sold: 0                /* what the house fetched at the end          */
  };
}

/* ═══════════════════════ THE STATE ═══════════════════════ */
function newGame(opts, seed){
  opts = opts || {};
  var seats = Math.max(MIN_SEATS, Math.min(MAX_SEATS, (opts.seats | 0) || 2));
  var st = {
    v: 1,
    seats: seats,
    players: [],
    turn: 0,
    rs: (seed == null ? 0 : (seed >>> 0)) || 0x9E3779B9,
    lvl: Math.max(1, Math.min(3, (opts.lvl | 0) || 2)),
    phase: 'fork',        /* 'fork' | 'spin' | 'choose' | 'over'         */
    spin: 0,              /* the last number spun                        */
    pending: null,        /* a decision the current player owes us       */
    log: [],              /* [{seat,t,v}] — the UI's ticker              */
    done: null            /* { counts:[], winners:[] } once it is over   */
  };
  for (var i = 0; i < seats; i++) st.players.push(newPlayer(i));
  return st;
}

var player = function (st, i){ return st.players[i]; };
var cur = function (st){ return st.players[st.turn]; };
function alive(st){
  var n = 0;
  for (var i = 0; i < st.seats; i++) if (!st.players[i].done) n++;
  return n;
}

/* ── money helpers ─────────────────────────────────────────────────
   A player may go negative; the bank does not stop you, it just means
   you are losing. Borrowing is a CHOICE, never automatic, because a
   forced loan would make the end score a formality. */
function give(st, p, v, why){
  p.cash += v;
  st.log.push({ seat: p.seat, t: why || '', v: v });
  if (st.log.length > 60) st.log.shift();
}
function borrow(st, p){
  p.loans++;
  give(st, p, LOAN, 'Loan from the bank');
  return true;
}

/* ── the spinner ───────────────────────────────────────────────────── */
function spinWheel(st){ return 1 + pick(st, 10); }

/* ═══════════════════════ RESOLVING A SQUARE ═══════════════════════ */
function payday(st, p){
  var c = careerById(p.career);
  if (c) give(st, p, c.pay, 'PAYDAY — ' + c.n);
}

/* what a square does when you FINISH on it. Returns a pending decision,
   or null when the turn simply ends. */
function land(st, p){
  var sq = BOARD.sq[p.at];
  if (!sq) return null;
  switch (sq.k){
    case 'P':
      payday(st, p);
      return null;
    case 'L':
      p.tiles++;
      st.log.push({ seat: p.seat, t: sq.t, v: 0 });
      return null;
    case 'B':
      p.kids++; p.pegs++;
      st.log.push({ seat: p.seat, t: sq.t, v: 0 });
      return null;
    case 'T':
      /* Tuition is BORROWED, the way it is in life. Paying it in cash left
         the student broke at the house stop while the school-leaver bought
         a garage every game — the debt is meant to bite at the END, on the
         scoreboard, not to lock them out of the board halfway round. */
      borrow(st, p);
      st.log.push({ seat: p.seat, t: sq.t, v: 0 });
      return null;
    case 'C':
      return { kind:'career', seat: p.seat, options: careerOptions(st, p) };
    case 'E': {
      var v = sq.v || 0;
      if (sq.tax){
        var c = careerById(p.career);
        v = -(c ? c.tax : 3);
      }
      give(st, p, v, sq.t);
      return null;
    }
    case 'X':
      if (sq.stop === 'marry'){
        if (!p.married){ p.married = true; p.pegs++; st.log.push({ seat:p.seat, t:'You get married.', v:0 }); }
        return null;
      }
      if (sq.stop === 'house') return { kind:'house', seat:p.seat, options: houseOptions(st, p) };
      if (sq.stop === 'retire'){ retire(st, p); return null; }
      return null;
    default:
      if (sq.t) st.log.push({ seat: p.seat, t: sq.t, v: 0 });
      return null;
  }
}

/* the careers you may be offered: two at random from the pool your road
   qualifies you for, plus the option to keep what you have */
function careerOptions(st, p){
  var pool = [], i;
  for (i = 0; i < CAREERS.length; i++)
    if (!CAREERS[i].deg || p.uni) pool.push(CAREERS[i].id);
  var out = [];
  while (out.length < 2 && pool.length){
    var j = pick(st, pool.length);
    out.push(pool[j]); pool.splice(j, 1);
  }
  return out;
}
/* every house you could actually pay for, cheapest first, plus 'skip' */
function houseOptions(st, p){
  var out = [], i;
  for (i = 0; i < HOUSES.length; i++) if (HOUSES[i].cost <= p.cash) out.push(HOUSES[i].id);
  return out;
}

function retire(st, p){
  p.done = true;
  /* the house is sold on one spin: high half the time, low the other.
     The farmhouse swings hardest, which is the risk you took buying it. */
  if (p.house){
    var h = houseById(p.house);
    var hi = rnd(st) < 0.5;
    p.sold = hi ? h.high : h.low;
    give(st, p, p.sold, 'Sold ' + h.n);
  }
  st.log.push({ seat: p.seat, t: 'RETIRED', v: 0 });
}

/* ═══════════════════════ SCORING ═══════════════════════
   Cash, plus what the house fetched (already in cash), plus the tiles,
   minus what the bank is owed. Tiles are worth a flat 10 each: they are
   the "you had a life" counterweight to pure salary, and a flat value
   keeps the end readable instead of a second scoring minigame. */
var TILE_VALUE = 10;
function scoreOf(p){ return p.cash + p.tiles * TILE_VALUE - p.loans * LOAN_BACK; }

function endGame(st){
  var counts = [], i, best = -Infinity;
  for (i = 0; i < st.seats; i++){
    var s = scoreOf(st.players[i]);
    counts.push(s);
    if (s > best) best = s;
  }
  var winners = [];
  for (i = 0; i < st.seats; i++) if (counts[i] === best) winners.push(i);
  st.done = { counts: counts, winners: winners };
  st.phase = 'over';
}

/* ═══════════════════════ THE TURN ═══════════════════════ */
function nextTurn(st){
  if (alive(st) === 0){ endGame(st); return; }
  var n = st.seats, i = 0;
  do { st.turn = (st.turn + 1) % n; i++; }
  while (st.players[st.turn].done && i <= n);
  st.phase = st.players[st.turn].at === 0 ? 'fork' : 'spin';
}

/* move `n` spaces, paying every payday PASSED on the way, and stopping
   dead on a STOP square even with steps left */
function walk(st, p, n){
  var i;
  for (i = 0; i < n; i++){
    if (p.at >= END) break;
    p.at = nextSpace(p.at);
    var sq = BOARD.sq[p.at];
    if (!sq) break;
    if (p.at >= END) break;
    if (i < n - 1){
      /* Passing through: paydays pay, and anything that CHANGES YOUR LIFE
         halts you even with steps left. A career square used to be plain
         road, so a big spin sailed past graduation and that player never
         took a job at all — they finished the whole game on no salary,
         which is why the university road was losing to the short one. */
      if (sq.k === 'P') payday(st, p);
      if (sq.k === 'X' || sq.k === 'C' || sq.k === 'T') break;
    }
  }
}

/* ── the ONE way the world changes ─────────────────────────────────
   Every move an online table sends comes through here, so both phones
   run the identical rules off the identical stream.
     { t:'fork', v:'uni'|'work' }
     { t:'spin' }
     { t:'career', v:<careerId>|'' }
     { t:'house',  v:<houseId>|''  }
     { t:'loan' }
   Returns { ok:true } or { ok:false, err }. */
function apply(st, seat, mv){
  if (!st || st.phase === 'over') return { ok:false, err:'the game is over' };
  if (seat !== st.turn) return { ok:false, err:'not your go' };
  var p = cur(st);
  if (p.done) return { ok:false, err:'you have retired' };
  mv = mv || {};

  if (mv.t === 'loan'){
    borrow(st, p);
    return { ok:true };
  }

  if (st.phase === 'fork'){
    if (mv.t !== 'fork') return { ok:false, err:'choose a road first' };
    if (mv.v === 'uni'){
      p.uni = true;
      p.at = BOARD.uniAt;
    } else {
      p.at = BOARD.workAt;
    }
    var pend = land(st, p);
    st.pending = pend;
    st.phase = pend ? 'choose' : 'spin';
    if (!pend) nextTurn(st);
    return { ok:true };
  }

  if (st.phase === 'choose'){
    var pd = st.pending;
    if (!pd) { st.phase = 'spin'; return { ok:false, err:'nothing to choose' }; }
    if (pd.kind === 'career'){
      if (mv.t !== 'career') return { ok:false, err:'pick a job' };
      if (mv.v && pd.options.indexOf(mv.v) < 0) return { ok:false, err:'not on offer' };
      if (mv.v){ p.career = mv.v; st.log.push({ seat:p.seat, t:'Now a ' + careerById(mv.v).n, v:0 }); }
      st.pending = null; st.phase = 'spin'; nextTurn(st);
      return { ok:true };
    }
    if (pd.kind === 'house'){
      if (mv.t !== 'house') return { ok:false, err:'buy or pass' };
      if (mv.v){
        if (pd.options.indexOf(mv.v) < 0) return { ok:false, err:'you cannot afford that' };
        var h = houseById(mv.v);
        p.house = mv.v;
        give(st, p, -h.cost, 'Bought ' + h.n);
      }
      st.pending = null; st.phase = 'spin'; nextTurn(st);
      return { ok:true };
    }
    return { ok:false, err:'unknown decision' };
  }

  if (st.phase === 'spin'){
    if (mv.t !== 'spin') return { ok:false, err:'spin first' };
    st.spin = spinWheel(st);
    walk(st, p, st.spin);
    if (p.at >= END){ retire(st, p); st.pending = null; nextTurn(st); return { ok:true }; }
    var pend2 = land(st, p);
    st.pending = pend2;
    if (pend2){ st.phase = 'choose'; return { ok:true }; }
    nextTurn(st);
    return { ok:true };
  }
  return { ok:false, err:'nothing to do' };
}

function over(st){ return st && st.done ? st.done : null; }
function turn(st){ return st && st.phase !== 'over' ? st.turn : -1; }

/* ═══════════════════════ THE MACHINE ═══════════════════════
   Three sharpnesses, and every one of them is a pure function of the
   position — no clock, no Math.random, so a machine seat replays exactly.
     lvl 1  takes the short road, never borrows, buys the first house it
            can afford. A beginner playing on instinct.
     lvl 2  goes to work, borrows only to reach a STOP it must pay for,
            buys the best house it can afford outright.
     lvl 3  goes to UNIVERSITY (the degree careers out-earn the road),
            takes the best salary offered, and buys the house with the
            best expected sale rather than the dearest. */
function aiMove(st, seat, lvl){
  lvl = Math.max(1, Math.min(3, lvl || st.lvl || 2));
  if (!st || st.phase === 'over' || seat !== st.turn) return null;
  var p = st.players[seat];
  if (p.done) return null;

  if (st.phase === 'fork')
    return { t:'fork', v: lvl >= 3 ? 'uni' : 'work' };

  if (st.phase === 'choose'){
    var pd = st.pending;
    if (!pd) return { t:'spin' };
    if (pd.kind === 'career'){
      var best = '', bestPay = -1, i;
      for (i = 0; i < pd.options.length; i++){
        var c = careerById(pd.options[i]);
        if (c && c.pay > bestPay){ bestPay = c.pay; best = c.id; }
      }
      /* the beginner takes whichever was offered first */
      return { t:'career', v: lvl === 1 ? (pd.options[0] || '') : best };
    }
    if (pd.kind === 'house'){
      if (!pd.options.length) return { t:'house', v:'' };
      if (lvl === 1) return { t:'house', v: pd.options[0] };
      var pickId = '', bestV = -Infinity;
      for (var j = 0; j < pd.options.length; j++){
        var h = houseById(pd.options[j]);
        /* lvl 2 buys the dearest it can hold; lvl 3 buys the best
           expected return on the money it ties up */
        var v = lvl >= 3 ? ((h.low + h.high) / 2 - h.cost) : h.cost;
        if (v > bestV){ bestV = v; pickId = h.id; }
      }
      return { t:'house', v: pickId };
    }
  }
  return { t:'spin' };
}

/* ═══════════════════════ THE WIRE ═══════════════════════
   APPEND ONLY. js/mp.js decodes against this published list, and a field
   inserted rather than appended is how a table stops dead on a build
   that has not been updated. */
var WIRE_FIELDS = ['t', 'v'];
function encWire(mv){
  if (!mv || !mv.t) return null;
  var o = { t: mv.t };
  if (mv.v != null) o.v = mv.v;
  return o;
}
function decWire(w){
  if (!w || !w.t) return null;
  return { t: w.t, v: w.v };
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — js/hajja-ui.js and the harness both read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_HAJJA = root.KARTI_HAJJA || {};
root.KARTI_HAJJA.engine = {
  MIN_SEATS: MIN_SEATS, MAX_SEATS: MAX_SEATS, LEVELS: LEVELS,
  CAREERS: CAREERS, HOUSES: HOUSES, BOARD: BOARD, END: END,
  LOAN: LOAN, LOAN_BACK: LOAN_BACK, TILE_VALUE: TILE_VALUE,
  newSeed: newSeed, newGame: newGame,
  player: player, cur: cur, turn: turn, over: over,
  apply: apply, aiMove: aiMove, scoreOf: scoreOf,
  careerById: careerById, houseById: houseById,
  careerOptions: careerOptions, houseOptions: houseOptions,
  nextSpace: nextSpace,
  WIRE_FIELDS: WIRE_FIELDS, encWire: encWire, decWire: decWire
};

})(typeof window !== 'undefined' ? window : globalThis);
