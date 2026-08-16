/* ═══════════════════════════════════════════════════════════════════
   KARTI — battleship.js   ·   PARTY GAMES: GĦARRAQHOM! — the engine

   Sea-battle for a table of friends, under a name of our own:
   "Għarraqhom!" — sink them / ruin them — is what you shout across a
   każin table, and it is nobody's trademark. Two modes:

     · KLASSIKA — the game your uncle knows. Standard fleet, one shot
       a turn, hit / miss / sunk, last fleet standing wins.
     · KARTI TAL-KANUN — every turn you DRAW A SHOT CARD, in front of
       everybody, and the card decides how you fire that turn: one
       shell, a row, an H, a scattergun, a sniper's peek. The reveal
       is public and simultaneous on every phone, so nobody can lie
       about what they drew.

   WHAT THIS FILE IS
     · the whole rules engine: grids, fleets, placement, the shot
       cards, turn order, elimination, the win.
     · the machine opponents, three levels, integer-deterministic.
     · NO DOM, NO SOUND, NO NETWORK. js/battleship-ui.js draws it and
       js/mp.js carries it. This file must also load under node for
       the simulator, which is why the export at the bottom is dual.

   DETERMINISM IS THE DESIGN. Online play is N phones running this
   same engine in lockstep (the house pattern — see js/tombla.js).
   Every random thing — bot placement, bot moves, the card drawn each
   turn, the scattergun's cells — comes out of ONE shared PRNG seeded
   by the relay, advanced only inside apply(). Apply the same moves in
   the same order and every phone lands on the same state, including
   the machine seats, which therefore never need the wire at all.

   HIDDEN INFORMATION, HONESTLY STATED. When a player locks their
   fleet, the placement crosses the wire (that is the {t:'place'}
   move) and every phone holds every fleet, exactly the way the card
   duel's host deals both decks (docs/ONLINE.md §7). The UI hides
   them; devtools would not. For a private table of friends that is
   the accepted bargain, and it buys total lockstep: every phone
   scores every shot itself, so nobody can lie about a hit, a miss,
   or what they drew — which for THIS game is the cheat that matters,
   because it is the one the living-room version actually suffers.

   THE WIRE SHAPE. Every move is {t, ...small ints 0–255}, folded by
   js/mp.js's generic codec onto the relay's bounded table payload.
   The field order lives in the lobby contract in battleship-ui.js
   and MUST match WIRE_FIELDS there:

     mode  {t:'mode',  o}                 host picks the mode, seat 0 only
     place {t:'place', p0..p9}            5 ships × (anchor, dir)
     fire  {t:'fire',  g,c,o,w,x,u,z}     g target seat, c anchor,
                                          o orient, w card id (crosscheck),
                                          x second cell (PAR / SNAJPER)
     auto  {t:'auto',  g,u,z}             play a gone player's turn for them
     quit  {t:'quit'}                     leave the battle for good

   u is the turn counter's low byte (staleness guard), z the state
   fingerprint's low byte (desync tripwire). A stale `auto` is ignored
   quietly; a current-turn fire with the wrong z stops the game
   honestly rather than let two tables drift.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

/* ── the board ─────────────────────────────────────────────────────── */
var W = 10, H = 10, CELLS = 100;
var MIN_SEATS = 2, MAX_SEATS = 6;

/* the fleet — five boats, seventeen cells, every name a boat you have
   actually queued behind in Malta */
var FLEET = [
  { id:0, len:5, name:'Il-Vapur t’Għawdex', short:'VAPUR'  },
  { id:1, len:4, name:'Il-Patrol tal-AFM',            short:'PATROL' },
  { id:2, len:3, name:'Il-Luzzu',                     short:'LUZZU'  },
  { id:3, len:3, name:'Tal-Lampuki',                  short:'LAMPUKI'},
  { id:4, len:2, name:'Id-Dgħajsa tal-Pass',     short:'DGHAJSA'}
];
var FLEET_CELLS = 17;

/* ── the shot cards ────────────────────────────────────────────────
   Weighted, not a depleting deck: the reveal is the theatre, the
   weights are the balance. Many modest cards, few big ones — a card
   that clears a row every turn ends the game in four turns, so IL-
   LINJA is a 1.8% event you remember, not a strategy. The weights
   below were TUNED BY SIMULATION (scripts in the build report):
   fun-mode games land close to klassika length with far higher
   variance, which is the party feel being aimed at. */
var PATTERNS = [
  { id:0,  key:'spara',    name:'SPARA!',          w:16, big:0,
    mt:'Kanunata waħda', how:'One shell, one square. Il-klassika.' },
  { id:1,  key:'doppju',   name:'DOPPJU',          w:14, big:0,
    mt:'Tnejn ħdejn xulxin', how:'Two squares in a line. Aim, rotate, fire.' },
  { id:2,  key:'tlieta',   name:'TLIETA F’RIGA', w:11, big:0,
    mt:'Tliet kanuni f’daqqa', how:'Three squares in a line.' },
  { id:3,  key:'par',      name:'PAR ĦIELES',  w:10, big:0,
    mt:'Tnejn fejn trid',   how:'Two shells, ANY two squares. Finish two boats at once.' },
  { id:4,  key:'djagonali',name:'DJAGONALI',       w:8,  big:0,
    mt:'Erbgħa mixja',  how:'Four squares on the diagonal.' },
  { id:5,  key:'snajper',  name:'IS-SNAJPER',      w:8,  big:1,
    mt:'Ara qabel tispara',  how:'Peek at one square — told hit or splash BEFORE you commit — then fire your shell anywhere.' },
  { id:6,  key:'sonar',    name:'IS-SONAR',        w:7,  big:0,
    mt:'Smajt xi ħaġa...', how:'No shell. Ping a 3×3 box and everybody hears how many boat squares are inside.' },
  { id:7,  key:'xita',     name:'XITA ĊOMB',  w:7,  big:0,
    mt:'Fejn jiġi jiġi', how:'Three squares, picked by the sea, not by you.' },
  { id:8,  key:'salib',    name:'IS-SALIB',        w:6,  big:1,
    mt:'Ħames kanuni',  how:'Five squares in a cross.' },
  { id:9,  key:'kaxxa',    name:'IL-KAXXA',        w:6,  big:1,
    mt:'Erbgħa kwadru', how:'A 2×2 box.' },
  { id:10, key:'granata',  name:'IL-GRANATA',      w:5,  big:1,
    mt:'Titfa’ u titlob', how:'A 3×3 box — but only four of the nine squares actually land.' },
  { id:11, key:'bahar',    name:'SPARA ’L BAĦAR', w:5, big:0,
    mt:'Il-qawl antik',      how:'The dud. One shell, and THE SEA aims it. Good luck.' },
  { id:12, key:'acca',     name:'L-AĊĊA',  w:3,  big:2,
    mt:'Ittra kbira',        how:'Seven squares in a big H. The table goes quiet when this turns over.' },
  { id:13, key:'linja',    name:'IL-LINJA',        w:2,  big:2,
    mt:'Riga sħiħa', how:'A WHOLE row or column. Ten squares. Somebody is about to have a very bad day.' }
];
var DECK_TOTAL = 0;
for (var pi = 0; pi < PATTERNS.length; pi++) DECK_TOTAL += PATTERNS[pi].w;
var P_SPARA = 0, P_PAR = 3, P_SNAJPER = 5, P_SONAR = 6, P_XITA = 7,
    P_GRANATA = 10, P_BAHAR = 11, P_LINJA = 13;

/* ── PRNG — mulberry32, integer in, integer out ───────────────────── */
function rndStep(s){ /* s uint32 -> [next s, uint32 value] */
  s = (s + 0x6D2B79F5) >>> 0;
  var t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  t = (t ^ (t >>> 14)) >>> 0;
  return [s, t];
}
/* draw 0..n-1 from the SHARED stream, advancing st.rng */
function draw(st, n){
  var r = rndStep(st.rng);
  st.rng = r[0];
  return n > 0 ? (r[1] % n) : 0;
}

/* ── geometry ─────────────────────────────────────────────────────── */
function CX(c){ return c % W; }
function CY(c){ return (c / W) | 0; }
function AT(x, y){ return y * W + x; }
function inb(x, y){ return x >= 0 && x < W && y >= 0 && y < H; }
function cellName(c){ return 'ABCDEFGHIJ'[CY(c)] + (CX(c) + 1); }

/* The footprint of a card, before randomness: a list of [dx,dy] from
   the anchor, or null when the card aims itself (xita/bahar) or is a
   pure ping (sonar's box IS geometric). o = 0 across, 1 down. */
function shape(p, o){
  switch (p){
    case 0:  return [[0,0]];
    case 1:  return o ? [[0,0],[0,1]] : [[0,0],[1,0]];
    case 2:  return o ? [[0,0],[0,1],[0,2]] : [[0,0],[1,0],[2,0]];
    case 4:  return o ? [[0,0],[1,1],[2,2],[3,3]] : [[0,0],[1,-1],[2,-2],[3,-3]];
    case 8:  return [[0,0],[1,0],[-1,0],[0,1],[0,-1]];
    case 9:  return [[0,0],[1,0],[0,1],[1,1]];
    case 12: return o
      ? [[-1,-1],[0,-1],[1,-1],[0,0],[-1,1],[0,1],[1,1]]      /* H on its side */
      : [[-1,-1],[-1,0],[-1,1],[0,0],[1,-1],[1,0],[1,1]];     /* upright H */
    default: return null;
  }
}
/* every anchor is legal — the footprint is CLIPPED at the rail rather
   than refused, so a cross in the corner is simply a smaller cross.
   That is a rule, not a shortcut: it keeps the corners worth aiming at
   and it means there is no "illegal anchor" state to argue about. */
function geomCells(p, anchor, o){
  var sh = shape(p, o), out = [], ax = CX(anchor), ay = CY(anchor), i, x, y;
  if (!sh) return out;
  for (i = 0; i < sh.length; i++){
    x = ax + sh[i][0]; y = ay + sh[i][1];
    if (inb(x, y)) out.push(AT(x, y));
  }
  return out;
}
function box9(anchor){
  var out = [], ax = CX(anchor), ay = CY(anchor), dx, dy;
  for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++)
    if (inb(ax + dx, ay + dy)) out.push(AT(ax + dx, ay + dy));
  return out;
}

/* ── seats and state ──────────────────────────────────────────────── */
function mkSeat(def, i){
  return {
    i: i,
    name: (def && def.name) || ('Seat ' + (i + 1)),
    kind: (def && def.kind) === 'cpu' ? 'cpu' : 'human',
    level: Math.max(1, Math.min(3, (def && def.level) | 0 || 2)),
    own: (def && def.own) || 'local',          /* 'me' | 'net' | 'ai' | 'local' */
    placed: false,
    out: false,                                 /* eliminated or quit */
    quit: false,
    ships: null,                                /* [{id,len,cells[],hit[],sunk}] */
    shot: null,                                 /* Int8Array(100): 0 clean, 1 miss, 2 hit */
    left: FLEET_CELLS                           /* un-hit ship cells remaining */
  };
}

/* opts: { mode:'klassika'|'karti'|null, seats:[{name,kind,level,own}], seed } */
function newMatch(opts){
  opts = opts || {};
  var defs = (opts.seats || []).slice(0, MAX_SEATS);
  while (defs.length < MIN_SEATS) defs.push({ name:'Seat ' + (defs.length + 1) });
  var st = {
    v: 1,
    mode: (opts.mode === 'klassika' || opts.mode === 'karti') ? opts.mode : null,
    seats: defs.map(mkSeat),
    phase: opts.mode ? 'place' : 'mode',
    turn: 0,
    tcount: 0,
    drawn: -1,               /* fun mode: the card the turn-holder is holding */
    rng: (opts.seed >>> 0) || 1,
    winner: -1,
    ended: null
  };
  for (var i = 0; i < st.seats.length; i++){
    var s = st.seats[i];
    s.shot = zeroGrid();
    if (s.kind === 'cpu'){ setShips(s, placeRandom(st)); }
  }
  return st;
}
function zeroGrid(){
  var g = new Array(CELLS), i;
  for (i = 0; i < CELLS; i++) g[i] = 0;
  return g;
}

/* ── placement ────────────────────────────────────────────────────── */
function shipCells(anchor, dir, len){
  var out = [], x = CX(anchor), y = CY(anchor), i;
  for (i = 0; i < len; i++){
    var nx = dir ? x : x + i, ny = dir ? y + i : y;
    if (!inb(nx, ny)) return null;
    out.push(AT(nx, ny));
  }
  return out;
}
/* placement = [a0,d0, a1,d1, ...] in FLEET order. Returns why-string or null. */
function badPlacement(p){
  if (!p || p.length !== FLEET.length * 2) return 'wrong fleet';
  var used = {}, i, j;
  for (i = 0; i < FLEET.length; i++){
    var a = p[i * 2] | 0, d = p[i * 2 + 1] ? 1 : 0;
    if (a < 0 || a >= CELLS) return 'off the board';
    var cs = shipCells(a, d, FLEET[i].len);
    if (!cs) return 'a boat is hanging off the board';
    for (j = 0; j < cs.length; j++){
      if (used[cs[j]]) return 'two boats on one square';
      used[cs[j]] = 1;
    }
  }
  return null;
}
function setShips(seat, p){
  seat.ships = FLEET.map(function(f, i){
    var cs = shipCells(p[i * 2] | 0, p[i * 2 + 1] ? 1 : 0, f.len);
    return { id:f.id, len:f.len, cells:cs, hit:cs.map(function(){ return false; }), sunk:false };
  });
  seat.placed = true;
  seat.left = FLEET_CELLS;
}
/* a random legal placement, from WHICHEVER rng is handed in: the shared
   stream for machine seats (every phone must deal the same boats), a
   local throwaway for the human's shuffle button. `rngOwner` is any
   object with an .rng property. */
function placeRandom(rngOwner){
  for (;;){
    var p = [], used = {}, ok = true, i, j;
    for (i = 0; i < FLEET.length; i++){
      var fit = false, tries = 0;
      while (!fit && tries++ < 200){
        var d = draw(rngOwner, 2);
        var a = draw(rngOwner, CELLS);
        var cs = shipCells(a, d, FLEET[i].len);
        if (!cs) continue;
        var clash = false;
        for (j = 0; j < cs.length; j++) if (used[cs[j]]){ clash = true; break; }
        if (clash) continue;
        for (j = 0; j < cs.length; j++) used[cs[j]] = 1;
        p.push(a, d);
        fit = true;
      }
      if (!fit){ ok = false; break; }
    }
    if (ok && !badPlacement(p)) return p;
  }
}

/* ── reading a seat's public grid (what opponents know) ───────────── */
function shipAt(seat, c){
  if (!seat.ships) return null;
  for (var i = 0; i < seat.ships.length; i++){
    var at = seat.ships[i].cells.indexOf(c);
    if (at >= 0) return { ship: seat.ships[i], at: at };
  }
  return null;
}

/* ── the fingerprint ──────────────────────────────────────────────── */
function fingerprint(st){
  var h = 2166136261 >>> 0, i, j;
  function mix(v){ h = Math.imul(h ^ (v >>> 0), 16777619) >>> 0; }
  mix(st.rng); mix(st.tcount); mix(st.turn);
  mix(st.phase === 'play' ? 3 : st.phase === 'place' ? 2 : st.phase === 'done' ? 4 : 1);
  mix(st.drawn + 2);
  for (i = 0; i < st.seats.length; i++){
    var s = st.seats[i];
    mix((s.placed ? 64 : 0) + (s.out ? 128 : 0) + s.left);
    for (j = 0; j < CELLS; j++) if (s.shot[j]) mix(j * 4 + s.shot[j]);
  }
  return h >>> 0;
}

/* ── turn machinery ───────────────────────────────────────────────── */
function aliveSeats(st){
  var out = [], i;
  for (i = 0; i < st.seats.length; i++) if (!st.seats[i].out) out.push(i);
  return out;
}
function nextAlive(st, from){
  for (var k = 1; k <= st.seats.length; k++){
    var i = (from + k) % st.seats.length;
    if (!st.seats[i].out) return i;
  }
  return from;
}
/* everybody placed? then the shooting starts */
function maybeBegin(st, ev){
  if (st.phase !== 'place') return;
  for (var i = 0; i < st.seats.length; i++)
    if (!st.seats[i].out && !st.seats[i].placed) return;
  st.phase = 'play';
  st.turn = aliveSeats(st)[0];
  st.tcount = 1;
  ev.push({ e:'phase', phase:'play' });
  beginTurn(st, ev);
}
function beginTurn(st, ev){
  if (st.mode === 'karti'){
    /* THE DRAW. Weighted, from the shared stream, at the moment the
       turn starts — which on every phone is the arrival of the same
       previous move, so every screen flips the same card together. */
    var roll = draw(st, DECK_TOTAL), acc = 0, p = 0, i;
    for (i = 0; i < PATTERNS.length; i++){
      acc += PATTERNS[i].w;
      if (roll < acc){ p = i; break; }
    }
    st.drawn = p;
    ev.push({ e:'draw', s: st.turn, p: p });
  } else {
    st.drawn = P_SPARA;
  }
  ev.push({ e:'turn', s: st.turn, n: st.tcount });
}
function passTurn(st, ev){
  st.turn = nextAlive(st, st.turn);
  st.tcount++;
  beginTurn(st, ev);
}

/* ── resolving a shot ─────────────────────────────────────────────── */
/* returns the cells a fire move actually covers, CONSUMING shared rng
   for the sea-aimed cards. target = seat object. */
function fireCells(st, p, target, anchor, o){
  var cells, pool, i, c;
  if (p === P_XITA || p === P_BAHAR){
    /* the sea aims: only un-shot squares are in the pool, so the dud
       is a real shot, not a guaranteed splash on an old crater */
    pool = [];
    for (c = 0; c < CELLS; c++) if (!target.shot[c]) pool.push(c);
    var want = p === P_XITA ? Math.min(3, pool.length) : Math.min(1, pool.length);
    cells = [];
    for (i = 0; i < want; i++){
      var at = draw(st, pool.length);
      cells.push(pool[at]);
      pool.splice(at, 1);
    }
    return cells;
  }
  if (p === P_GRANATA){
    pool = box9(anchor);
    cells = [];
    var want2 = Math.min(4, pool.length);
    for (i = 0; i < want2; i++){
      var at2 = draw(st, pool.length);
      cells.push(pool[at2]);
      pool.splice(at2, 1);
    }
    return cells;
  }
  if (p === P_LINJA) return lineCells(anchor, o);
  return geomCells(p, anchor, o);
}

function landShot(st, shooter, target, cells, ev){
  /* one 'shot' event carries the whole volley so the UI can pace it */
  var res = [], sunk = [], i, c;
  for (i = 0; i < cells.length; i++){
    c = cells[i];
    if (target.shot[c]){ res.push({ c:c, r:'old' }); continue; }   /* wasted on a crater */
    var hit = shipAt(target, c);
    if (hit){
      target.shot[c] = 2;
      hit.ship.hit[hit.at] = true;
      target.left--;
      var down = hit.ship.hit.every(function(b){ return b; });
      if (down && !hit.ship.sunk){
        hit.ship.sunk = true;
        sunk.push(hit.ship.id);
      }
      res.push({ c:c, r:'hit' });
    } else {
      target.shot[c] = 1;
      res.push({ c:c, r:'miss' });
    }
  }
  var out = { e:'shot', s: shooter.i, g: target.i, p: st.drawn, cells: res, sunk: sunk };
  if (target.left <= 0 && !target.out){
    target.out = true;
    out.dead = target.i;
  }
  ev.push(out);
  return out;
}

function checkEnd(st, ev){
  if (st.phase === 'done') return true;
  var alive = aliveSeats(st);
  if (alive.length <= 1){
    st.phase = 'done';
    st.winner = alive.length ? alive[0] : -1;
    st.ended = { why:'gharqu' };
    ev.push({ e:'end', winner: st.winner });
    return true;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE
   Integer-deterministic on purpose: online, every phone computes a
   bot's turn from the same state and the same stream and gets the
   same shot, so machine seats cost the wire nothing.

   Level 1 — It-turist tal-lido.  Mostly random, half-hearted follow-up.
   Level 2 — Tal-moll.            Hunt with parity, then bracket the hit.
   Level 3 — Il-Kaptan.           Full placement-count heatmap.
   ═══════════════════════════════════════════════════════════════════ */

/* how many un-sunk placements cover each cell of `target`, given what
   the shooter can see. Standard battleship density, integers only. */
function heat(target){
  var hm = new Array(CELLS), i, c, d, a;
  for (i = 0; i < CELLS; i++) hm[i] = 0;
  var lens = [];
  if (target.ships){
    for (i = 0; i < target.ships.length; i++)
      if (!target.ships[i].sunk) lens.push(target.ships[i].len);
  } else lens = FLEET.map(function(f){ return f.len; });
  /* hits that are not yet part of a sunk ship pull hard */
  var openHit = [];
  for (c = 0; c < CELLS; c++) if (target.shot[c] === 2 && !sunkCell(target, c)) openHit.push(c);
  for (var li = 0; li < lens.length; li++){
    var len = lens[li];
    for (d = 0; d < 2; d++){
      for (a = 0; a < CELLS; a++){
        var cs = shipCells(a, d, len);
        if (!cs) continue;
        var ok = true, touch = 0;
        for (i = 0; i < cs.length; i++){
          var sc = target.shot[cs[i]];
          if (sc === 1 || (sc === 2 && sunkCell(target, cs[i]))){ ok = false; break; }
          if (sc === 2) touch++;
        }
        if (!ok) continue;
        var wgt = 1 + touch * 40;                 /* riding known hits is gold */
        for (i = 0; i < cs.length; i++)
          if (!target.shot[cs[i]]) hm[cs[i]] += wgt;
      }
    }
  }
  /* if there are open hits, everything not adjacent-in-line to one cools off */
  if (openHit.length){
    for (c = 0; c < CELLS; c++){
      if (!hm[c]) continue;
      var near = false;
      for (i = 0; i < openHit.length; i++){
        var dx = Math.abs(CX(c) - CX(openHit[i])), dy = Math.abs(CY(c) - CY(openHit[i]));
        if ((dx === 0 && dy <= 3) || (dy === 0 && dx <= 3)){ near = true; break; }
      }
      if (!near) hm[c] = (hm[c] / 8) | 0;
    }
  }
  return hm;
}
function sunkCell(target, c){
  var s = shipAt(target, c);
  return !!(s && s.ship.sunk);
}

/* pick the hottest legal anchor/orientation for the drawn card.
   Deterministic: ties break to the lowest index. */
function aimPattern(st, target, p, hm){
  var bestScore = -1, bestA = 0, bestO = 0, a, o;
  var oo = (p === 1 || p === 2 || p === 4 || p === 12 || p === P_LINJA) ? 2 : 1;
  for (o = 0; o < oo; o++){
    for (a = 0; a < CELLS; a++){
      var cs = p === P_GRANATA ? box9(a)
             : p === P_LINJA ? lineCells(a, o)
             : geomCells(p, a, o);
      if (!cs.length) continue;
      var sc = 0, i;
      for (i = 0; i < cs.length; i++) if (!target.shot[cs[i]]) sc += hm[cs[i]] + 1;
      if (p === P_GRANATA) sc = (sc * 4 / 9) | 0;      /* only 4 of 9 land */
      if (sc > bestScore){ bestScore = sc; bestA = a; bestO = o; }
    }
  }
  return { a: bestA, o: bestO };
}
function lineCells(anchor, o){
  var out = [], i;
  if (o){ var x = CX(anchor); for (i = 0; i < H; i++) out.push(AT(x, i)); }
  else  { var y = CY(anchor); for (i = 0; i < W; i++) out.push(AT(i, y)); }
  return out;
}

/* the whole machine turn -> a fire move (fields only, no u/z) */
function aiFire(st, seat){
  var me = st.seats[seat];
  /* target: the opponent closest to sinking. Ties are broken from the
     SHARED stream, not by seat number — an early sim had the machine
     always piling onto the lowest chair on a tie, and seat order
     decided 84% of four-player games. Deterministic everywhere,
     because the draw comes off the same stream on every phone. */
  var opp = [], i;
  for (i = 0; i < st.seats.length; i++)
    if (i !== seat && !st.seats[i].out) opp.push(i);
  if (!opp.length) return null;
  var g;
  if (me.level === 1){
    g = opp[draw(st, opp.length)];       /* the turist shoots whoever */
  } else {
    var bestLeft = 999;
    for (i = 0; i < opp.length; i++)
      if (st.seats[opp[i]].left < bestLeft) bestLeft = st.seats[opp[i]].left;
    var ties = [];
    for (i = 0; i < opp.length; i++)
      if (st.seats[opp[i]].left === bestLeft) ties.push(opp[i]);
    g = ties.length > 1 ? ties[draw(st, ties.length)] : ties[0];
  }
  var target = st.seats[g];
  var p = st.drawn;
  var hm = heat(target);

  /* level flavour: 1 flattens the map to almost-noise, 2 keeps hits
     hot but hunts on parity only, 3 uses it whole */
  var c;
  if (me.level === 1){
    for (c = 0; c < CELLS; c++) hm[c] = target.shot[c] === 2 && !sunkCell(target, c) ? hm[c] : 1;
    /* even the turist half-remembers a hit... unless the rum says no */
    if (draw(st, 4) === 0) for (c = 0; c < CELLS; c++) hm[c] = 1;
  } else if (me.level === 2){
    var open = false;
    for (c = 0; c < CELLS; c++) if (target.shot[c] === 2 && !sunkCell(target, c)) open = true;
    if (!open) for (c = 0; c < CELLS; c++) if (((CX(c) + CY(c)) & 1) === 1) hm[c] = (hm[c] / 3) | 0;
  }

  if (p === P_XITA || p === P_BAHAR) return { t:'fire', g:g, c:0, o:0, w:p };
  if (p === P_SONAR){
    var am = aimPattern(st, target, P_GRANATA, hm);   /* best 3x3 by heat */
    return { t:'fire', g:g, c:am.a, o:0, w:p };
  }
  if (p === P_PAR || p === P_SNAJPER){
    /* two hottest distinct cells; the sniper peeks the hottest and
       shoots it if true, else the runner-up */
    var c1 = -1, c2 = -1, v1 = -1, v2 = -1;
    for (c = 0; c < CELLS; c++){
      if (target.shot[c]) continue;
      var v = hm[c];
      if (v > v1){ v2 = v1; c2 = c1; v1 = v; c1 = c; }
      else if (v > v2){ v2 = v; c2 = c; }
    }
    if (c1 < 0) c1 = 0;
    if (c2 < 0) c2 = c1;
    if (p === P_PAR) return { t:'fire', g:g, c:c1, o:0, w:p, x:c2 };
    var peekHit = !!shipAt(target, c1);
    return { t:'fire', g:g, c: peekHit ? c1 : c2, o:0, w:p, x:c1 };
  }
  var aim = aimPattern(st, target, p, hm);
  return { t:'fire', g:g, c:aim.a, o:aim.o, w:p };
}

/* run machine turns until a human holds the ball or the game ends.
   Called at the tail of apply(); every phone runs it identically. */
function runBots(st, ev, guard){
  guard = guard || 0;
  while (st.phase === 'play' && guard++ < 500){
    var s = st.seats[st.turn];
    if (s.kind !== 'cpu') return;
    var mv = aiFire(st, st.turn);
    if (!mv){ passTurn(st, ev); continue; }
    doFire(st, st.turn, mv, ev);
    if (checkEnd(st, ev)) return;
    passTurn(st, ev);
  }
}

/* ── the one gate every fire goes through ─────────────────────────── */
function doFire(st, seat, mv, ev){
  var shooter = st.seats[seat];
  var target = st.seats[mv.g];
  var p = st.drawn;
  if (p === P_SONAR){
    var cs = box9(mv.c), n = 0, i;
    for (i = 0; i < cs.length; i++) if (shipAt(target, cs[i])) n++;
    ev.push({ e:'sonar', s: seat, g: mv.g, c: mv.c, n: n });
    return null;
  }
  var cells;
  if (p === P_PAR){
    cells = [mv.c];
    if (mv.x !== undefined && mv.x !== mv.c) cells.push(mv.x);
  } else if (p === P_SNAJPER){
    var peekHit = !!shipAt(target, mv.x);
    ev.push({ e:'peek', s: seat, g: mv.g, c: mv.x, hit: peekHit });
    cells = [mv.c];
  } else {
    cells = fireCells(st, p, target, mv.c, mv.o ? 1 : 0);
  }
  return landShot(st, shooter, target, cells, ev);
}

/* ═══════════════════════════════════════════════════════════════════
   APPLY — the single door. Every move from every source (a tap here, a
   packet from the relay, the machine) goes through this and nothing
   else mutates the match. Returns {ok, why?, stale?, desync?, ev[]}.
   ═══════════════════════════════════════════════════════════════════ */
function apply(st, seat, mv){
  var ev = [];
  if (!st || !mv || typeof mv !== 'object') return { ok:false, why:'no move', ev:ev };
  var t = mv.t;
  seat = seat | 0;
  if (seat < 0 || seat >= st.seats.length) return { ok:false, why:'no such seat', ev:ev };
  if (st.phase === 'done') return { ok:true, stale:true, ev:ev };

  /* staleness / desync guards, when the move carries them */
  var stale = (mv.u !== undefined && mv.u !== (st.tcount & 255));
  if (t === 'auto' && stale) return { ok:true, stale:true, ev:ev };

  if (t === 'mode'){
    if (st.phase !== 'mode') return { ok:true, stale:true, ev:ev };
    /* the picker is the lowest seat still IN, not literally seat 0. If
       the host walks out during the pick (a real online sequence: tap
       Leave on the KLASSIKA/KARTI question), the chair passes — the old
       hard-coded 0 left a table where nobody alive was allowed to pick
       the mode, which is a table that can never start and never end. */
    var picker = aliveSeats(st)[0];
    if (seat !== picker) return { ok:false, why:'only the host picks the mode', ev:ev };
    st.mode = mv.o ? 'karti' : 'klassika';
    st.phase = 'place';
    ev.push({ e:'phase', phase:'place' });
    return { ok:true, ev:ev };
  }

  if (t === 'place'){
    if (st.phase !== 'place') return { ok:false, why:'not the moment to place boats', ev:ev };
    var s = st.seats[seat];
    if (s.placed) return { ok:true, stale:true, ev:ev };
    var p = [], i;
    for (i = 0; i < FLEET.length * 2; i++){
      var v = mv['p' + i];
      if (v === undefined) return { ok:false, why:'half a fleet', ev:ev };
      p.push(v | 0);
    }
    var bad = badPlacement(p);
    if (bad) return { ok:false, why:'a fleet the rules do not allow (' + bad + ')', ev:ev };
    setShips(s, p);
    ev.push({ e:'placed', s: seat });
    maybeBegin(st, ev);
    runBots(st, ev);
    checkEnd(st, ev);
    return { ok:true, ev:ev };
  }

  if (t === 'fire'){
    if (st.phase !== 'play') return { ok:false, why:'no battle on', ev:ev };
    if (seat !== st.turn){
      if (stale) return { ok:true, stale:true, ev:ev };
      return { ok:false, why:'a shot out of turn', ev:ev };
    }
    if (mv.z !== undefined && !stale && mv.z !== (fingerprint(st) & 255))
      return { ok:false, why:'the two tables have drifted apart', desync:true, ev:ev };
    if (mv.w !== undefined && mv.w !== st.drawn)
      return { ok:false, why:'a shot from a card that was not drawn', ev:ev };
    var g = mv.g | 0;
    if (g === seat || g < 0 || g >= st.seats.length || st.seats[g].out)
      return { ok:false, why:'no such target', ev:ev };
    var c = mv.c | 0;
    if (c < 0 || c >= CELLS) return { ok:false, why:'off the board', ev:ev };
    if (mv.x !== undefined && ((mv.x | 0) < 0 || (mv.x | 0) >= CELLS))
      return { ok:false, why:'off the board', ev:ev };
    doFire(st, seat, mv, ev);
    if (!checkEnd(st, ev)){
      passTurn(st, ev);
      runBots(st, ev);
      checkEnd(st, ev);
    }
    return { ok:true, ev:ev };
  }

  if (t === 'auto'){
    /* somebody is playing a GONE seat's ball so the table is not held
       hostage. Deterministic on every phone: the placement or the shot
       comes off the shared stream / the level-2 machine. */
    var gs = mv.g | 0;
    if (gs < 0 || gs >= st.seats.length || st.seats[gs].out)
      return { ok:true, stale:true, ev:ev };
    if (st.phase === 'place'){
      var s2 = st.seats[gs];
      if (s2.placed) return { ok:true, stale:true, ev:ev };
      setShips(s2, placeRandom(st));
      ev.push({ e:'placed', s: gs, auto:true });
      maybeBegin(st, ev);
      runBots(st, ev);
      checkEnd(st, ev);
      return { ok:true, ev:ev };
    }
    if (st.phase !== 'play' || gs !== st.turn) return { ok:true, stale:true, ev:ev };
    var was = st.seats[gs].level;
    st.seats[gs].level = 2;
    var amv = aiFire(st, gs);
    st.seats[gs].level = was;
    if (amv){
      ev.push({ e:'autoplay', s: gs });
      doFire(st, gs, amv, ev);
    }
    if (!checkEnd(st, ev)){
      passTurn(st, ev);
      runBots(st, ev);
      checkEnd(st, ev);
    }
    return { ok:true, ev:ev };
  }

  if (t === 'quit'){
    var q = st.seats[seat];
    if (q.out) return { ok:true, stale:true, ev:ev };
    q.out = true; q.quit = true;
    ev.push({ e:'out', s: seat });
    if (st.phase === 'place'){ maybeBegin(st, ev); }
    if (!checkEnd(st, ev) && st.phase === 'play' && st.turn === seat){
      passTurn(st, ev);
      runBots(st, ev);
      checkEnd(st, ev);
    }
    return { ok:true, ev:ev };
  }

  return { ok:false, why:'a move GĦARRAQHOM does not have', ev:ev };
}

/* ── save / restore (offline continues; online never uses this) ───── */
function snapshot(st){
  return JSON.stringify({
    v:1, mode: st.mode, phase: st.phase, turn: st.turn, tcount: st.tcount,
    drawn: st.drawn, rng: st.rng, winner: st.winner, ended: st.ended,
    seats: st.seats.map(function(s){
      return { name:s.name, kind:s.kind, level:s.level, own:s.own,
               placed:s.placed, out:s.out, quit:s.quit, left:s.left,
               shot:s.shot.join(''),
               ships: s.ships ? s.ships.map(function(sh){
                 return { id:sh.id, len:sh.len, cells:sh.cells.slice(),
                          hit:sh.hit.map(function(b){ return b ? 1 : 0; }), sunk:sh.sunk };
               }) : null };
    })
  });
}
function restore(json){
  var j;
  try { j = JSON.parse(json); } catch(e){ return null; }
  if (!j || j.v !== 1 || !Array.isArray(j.seats)) return null;
  var st = {
    v:1, mode:j.mode, phase:j.phase, turn:j.turn | 0, tcount:j.tcount | 0,
    drawn:j.drawn | 0, rng:j.rng >>> 0, winner:j.winner, ended:j.ended,
    seats: j.seats.map(function(s, i){
      var seat = mkSeat(s, i);
      seat.placed = !!s.placed; seat.out = !!s.out; seat.quit = !!s.quit;
      seat.left = s.left | 0;
      seat.shot = String(s.shot || '').split('').map(function(ch){ return ch | 0; });
      while (seat.shot.length < CELLS) seat.shot.push(0);
      seat.ships = s.ships ? s.ships.map(function(sh){
        return { id:sh.id | 0, len:sh.len | 0, cells:(sh.cells || []).map(Number),
                 hit:(sh.hit || []).map(function(b){ return !!b; }), sunk:!!sh.sunk };
      }) : null;
      return seat;
    })
  };
  return st;
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — browser global and node export, same object.
   ═══════════════════════════════════════════════════════════════════ */
var ENGINE = {
  W: W, H: H, CELLS: CELLS, MIN_SEATS: MIN_SEATS, MAX_SEATS: MAX_SEATS,
  FLEET: FLEET, FLEET_CELLS: FLEET_CELLS,
  PATTERNS: PATTERNS, DECK_TOTAL: DECK_TOTAL,
  P: { SPARA:P_SPARA, PAR:P_PAR, SNAJPER:P_SNAJPER, SONAR:P_SONAR,
       XITA:P_XITA, GRANATA:P_GRANATA, BAHAR:P_BAHAR, LINJA:P_LINJA },
  CX: CX, CY: CY, AT: AT, cellName: cellName,
  shape: shape, geomCells: geomCells, box9: box9, lineCells: lineCells,
  shipCells: shipCells, badPlacement: badPlacement, placeRandom: placeRandom,
  newMatch: newMatch, apply: apply, fingerprint: fingerprint,
  heat: heat, aiFire: aiFire, shipAt: shipAt, aliveSeats: aliveSeats,
  snapshot: snapshot, restore: restore
};

if (typeof window !== 'undefined') window.KARTI_BSHIP = ENGINE;
if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;

})();
