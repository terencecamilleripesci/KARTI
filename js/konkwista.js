/* ═══════════════════════════════════════════════════════════════════
   KARTI — konkwista.js
   IL-KONKWISTA — "the conquest". A faithful RISK-style WORLD-CONQUEST
   game for TWO to SIX players over an ORIGINAL world map of FORTY
   territories grouped into SIX CONTINENTS. The conquest MECHANICS
   (claim → deploy → reinforce → attack → fortify, dice combat, continent
   bonuses, territory CARDS with escalating set-trades, elimination,
   whole-world victory) are public-domain; the MAP, the names, the
   numbers and the code are all ours. No Hasbro board, no "Risk" mark,
   no real political world map.

   This file is the PURE ENGINE: rules only, no DOM, no clock. It follows
   the house shape of js/erbgha.js and js/aqleb.js exactly —
   window.KARTI_KONKWISTA = { engine:{…} }, a state that is newGame() plus
   a replay of a move log, a hard check() gate every move passes through,
   an apply() that is the ONLY mutator, a pure AI think(), and a flat
   encWire/decWire for js/mp.js's generic codec. The screen half is
   js/konkwista-ui.js.

   ───────────────────────────────────────────────────────────────────
   THE WORLD MAP  (see MAP below — the single source of truth)
     FORTY TERRITORIES grouped into SIX CONTINENTS, each continent worth
     a reinforcement BONUS if you own ALL of it (Aurora 5 · Solmar 3 ·
     Vantia 3 · Kessia 3 · Norlund 2 · Meridia 5). This is a classic
     RISK-style board: the six continents are SEPARATE LANDMASSES laid out
     across a 660×1160 portrait viewBox with SEA between them — Aurora NW,
     Solmar NE, Vantia W-mid, Norlund E-mid, Kessia SW, Meridia S/SE — each
     a distinct organic silhouette (its bounding box does not overlap any
     other continent's). Every territory is an SVG polygon with a centroid
     for its army badge. WITHIN a continent, territories share land borders;
     the continents are joined by a handful of SEA ROUTES (SEA_ROUTES, drawn
     as dashed sea lanes over the water) — each sea route IS a real
     adjacency edge. The whole ADJACENCY graph is proven CONNECTED and every
     edge SYMMETRIC by the harness (mapCheck()); each continent is internally
     connected and the CONTINENT graph is connected too, so every continent
     is reachable.

   THE TURN  (three signposted phases, standard conquest)
     1 REINFORCE  you receive armies = max(3, floor(T/3)) + Σ continent
        bonus for every continent you fully own + any CARD-SET you trade.
        You may (and, holding 5+ cards, MUST) trade a matching set of three
        cards for bonus armies on an escalating scale. Place them all
        before you may attack.
     2 ATTACK  repeatedly: pick one of YOUR territories with >1 army that
        borders an ENEMY territory, and attack. The attacker CHOOSES how
        many dice to roll — `n`, from 1 up to maxAtkDice(army) = min(3,
        army-1). This is a real decision, not a detail: more dice win the
        exchange more often, but you can only LOSE as many armies in one
        exchange as the SMALLER of the two dice counts, and on a capture you
        are FORCED to move `n` armies into the new land — so three dice can
        gut the very border you were standing on. The DEFENDER does not
        choose: they always roll maxDefDice(army) = min(2, army). Rolling
        two is near-always right for a defender, and asking would put a
        second phone in the way of every attack online, so it is a stated
        design choice (and the rules screen says so), not a silent omission.
        Sort both descending, compare highest-vs-highest and (if both have a
        second die) second-vs-second. Each comparison the DEFENDER wins or
        TIES costs the attacker one army; otherwise the defender loses one.
        If the defender reaches 0 the attacker CAPTURES and MUST move in at
        least (attacker dice rolled) armies, leaving ≥1 behind. If you
        captured AT LEAST ONE territory this turn you EARN one card at the
        end of your turn (max one per turn).

        `n` MISSING, zero, or out of range is CLAMPED to the legal maximum —
        never refused. That is what makes the dice choice a purely additive
        change: every OLD saved game and every OLD move log carries no `n`
        at all, and "no n" means "max", which is exactly what the engine did
        before the choice existed. Old logs therefore replay byte-identically
        (proven by a golden replay against a frozen copy of the old engine).
     3 FORTIFY  optionally ONCE: move any number of armies (leaving ≥1
        behind) from one of your territories to ANOTHER of your
        territories CONNECTED to it THROUGH A CHAIN OF YOUR OWN
        territories. Then END TURN.

     CARDS  each card carries a symbol (infantry / cavalry / artillery)
     and, for non-wild cards, a territory; two WILD cards match anything.
     A valid SET is three-of-a-kind or one-of-each (wilds substitute for
     any symbol). Trading a set grants armies on the ESCALATING schedule
     4,6,8,10,12,15, then +5 for every set thereafter (documented in
     tradeValue()). Owning cards that show a territory YOU hold at trade
     time is a small bonus on the tabletop; we keep the trade value pure
     (schedule only) so it is fully deterministic and needs no board read.

     ELIMINATION  a player holding zero territories is OUT; the CONQUEROR
     TAKES their CARDS (and, if that pushes the conqueror to 6+ cards,
     must trade down at the start of their reinforce). Podium place is
     fixed by the ORDER of elimination. WIN = own the WHOLE WORLD (every
     territory / the last player standing). A safety TURN-CAP ends any game
     that will not resolve; survivors are ranked by territories then armies.

   THE OPENING  two setups the host chooses between:
     CLAIM  the classic pick — with the map empty, seats take turns tapping
       an empty territory (1 army each) until the map fills, then DEPLOY
       their remaining setup armies one at a time on their own land.
     RANDOM DEAL  the deck deals every territory out round-robin (seeded,
       deterministic) with 1 army each, then each seat's remaining setup
       armies are auto-scattered across their land (seeded). One move
       ('deal') performs the whole deal so it relays and replays as a unit.

   DETERMINISM  (the whole reason online + pass-the-phone are honest)
     Combat dice, the shuffled CARD DECK order, and the random deal are all
     derived from the shared game SEED through an integer hash — never
     Math.random. The seed is the ONLY quarantined Math.random (newSeed()).
     Two independent clients that apply the same move sequence reach a
     BYTE-IDENTICAL board — including every card draw, because the deck is a
     seeded shared list and each draw is the deterministic next card. Risk
     cards are low-secrecy (knowing the deck order is a slim edge and the
     game is otherwise perfect-information), so a seeded SHARED deck every
     client can compute is the correct, simplest honest choice; a player's
     UI still only shows THAT player's own hand.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ── seats: 2..6 players ───────────────────────────────────────────── */
const MIN_SEATS = 2, MAX_SEATS = 6;
const UNOWNED = -1;

/* the six seat colours (ids match js/rebbieh.js borders and js/ludu.js). */
const COLOURS = [
  { id:'red',    hex:'#d92b2b', hi:'#ff6d6d', lo:'#8f1414', name:{ en:'Crimson', mt:'Aħmar'   } },
  { id:'blue',   hex:'#2b6cd9', hi:'#6fa8ff', lo:'#153f8f', name:{ en:'Azure',   mt:'Blu'     } },
  { id:'yellow', hex:'#e6b422', hi:'#ffdf74', lo:'#9a7300', name:{ en:'Amber',   mt:'Isfar'   } },
  { id:'green',  hex:'#2fa34d', hi:'#77d98f', lo:'#186b30', name:{ en:'Olive',   mt:'Aħdar'   } },
  { id:'orange', hex:'#e8752a', hi:'#ffa96b', lo:'#9c4711', name:{ en:'Ochre',   mt:'Oranġjo' } },
  { id:'purple', hex:'#8a4bd0', hi:'#c199ff', lo:'#5a2b93', name:{ en:'Tyrian',  mt:'Vjola'   } }
];
const colourOf = seat => COLOURS[((seat % COLOURS.length) + COLOURS.length) % COLOURS.length];

/* ── the ONE Math.random, quarantined (js/erbgha.js's newSeed) ──────── */
function newSeed(){ return (Math.random() * 0x100000000) >>> 0; }

/* a small integer hash (FNV-1a) over a list of ints → 0..0xffffffff. */
function hash32(list){
  let h = 2166136261;
  for (let i = 0; i < list.length; i++){ h ^= (list[i] | 0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* splitmix32: a stateless integer mixer. rollDie(seed, counter) → 1..6. */
function mix32(x){
  x = (x + 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0;
  return (x ^ (x >>> 15)) >>> 0;
}
function rollDie(seed, counter){
  let s = (seed >>> 0), c = (counter >>> 0);
  let x = mix32((s ^ Math.imul(c, 0x85ebca77)) >>> 0);
  let guard = 0;
  while (x >= 4294967292 && guard < 8){ x = mix32(x); guard++; }
  return (x % 6) + 1;
}
/* a full 32-bit deterministic draw from (seed, counter) */
function rollBig(seed, counter){
  return mix32(((seed >>> 0) ^ Math.imul((counter >>> 0), 0x85ebca77)) >>> 0) >>> 0;
}

/* ═══════════════════════════════════════════════════════════════════
   THE WORLD MAP. Six CONTINENTS, forty TERRITORIES. Coordinates are in a
   PORTRAIT 660×1160 viewBox (drawn tall to fill a phone in one glance);
   `poly` is the territory's SVG polygon (flat [x,y,…]) and `c` is the
   centroid where the army badge sits. The territories of each continent form
   ONE separate landmass (a tight organic cluster) with SEA (empty viewBox)
   around it, so the six continents read as six distinct shapes at a glance;
   every centroid sits inside its own polygon (a tap is pixel-exact, the badge
   lands on the right land) and no two badges collide. `ADJ_PAIRS` is the
   land-border adjacency WITHIN each continent, plus `SEA_ROUTES` the few
   inter-continent bridges; both are symmetrised below and the whole graph is
   CONNECTED with each continent internally connected (proven by mapCheck()).
   Each continent's full-ownership bonus lives in CONTINENTS.
   ═══════════════════════════════════════════════════════════════════ */
const CONTINENTS = [
  { id:'aurora', bonus:5, hex:'#7c5cff', name:{ en:'Aurora', mt:'Awrora' } },
  { id:'solmar', bonus:3, hex:'#e6b422', name:{ en:'Solmar', mt:'Solmar' } },
  { id:'vantia', bonus:3, hex:'#e8752a', name:{ en:'Vantia', mt:'Vantja' } },
  { id:'kessia', bonus:3, hex:'#2b9dd9', name:{ en:'Kessia', mt:'Kessja' } },
  { id:'norlund', bonus:2, hex:'#2fa34d', name:{ en:'Norlund', mt:'Norlund' } },
  { id:'meridia', bonus:5, hex:'#e05a9c', name:{ en:'Meridia', mt:'Meridja' } },
];

const TERRITORIES = [
  /* aurora */
  { id:'au1', cont:'aurora', name:{ en:'Aldgate', mt:'Aldgate' }, c:[85,122], poly:[63,44,129,42,129,192,29,190,24,97,61,86] },
  { id:'au2', cont:'aurora', name:{ en:'Brindle', mt:'Brindle' }, c:[179,109], poly:[129,42,249,45,242,96,207,95,212,187,129,192] },
  { id:'au3', cont:'aurora', name:{ en:'Corvane', mt:'Corvane' }, c:[261,116], poly:[249,45,317,48,314,142,282,144,275,192,212,187,207,95,242,96] },
  /* solmar */
  { id:'so1', cont:'solmar', name:{ en:'Sunreach', mt:'Sunreach' }, c:[452,119], poly:[428,60,497,56,498,167,394,175,395,94,432,92] },
  { id:'so2', cont:'solmar', name:{ en:'Thornwick', mt:'Thornwick' }, c:[562,110], poly:[497,56,598,60,605,101,638,98,632,134,605,138,605,174,534,169,536,130,502,129] },
  /* aurora */
  { id:'au4', cont:'aurora', name:{ en:'Draymoor', mt:'Draymoor' }, c:[62,259], poly:[29,190,95,192,99,328,26,328] },
  { id:'au5', cont:'aurora', name:{ en:'Eastfell', mt:'Eastfell' }, c:[157,265], poly:[129,192,212,187,208,325,99,328,100,232,132,234] },
  { id:'au6', cont:'aurora', name:{ en:'Farholt', mt:'Farholt' }, c:[255,259], poly:[212,187,275,192,281,280,310,280,311,333,246,332,238,282,213,278] },
  /* solmar */
  { id:'so3', cont:'solmar', name:{ en:'Ambergate', mt:'Ambergate' }, c:[430,228], poly:[394,175,462,174,464,287,399,284] },
  { id:'so4', cont:'solmar', name:{ en:'Willowmere', mt:'Willowmere' }, c:[556,228], poly:[498,167,638,167,633,283,567,281,569,251,533,245,537,280,464,287,467,208,504,209] },
  /* aurora */
  { id:'au7', cont:'aurora', name:{ en:'Grimsby', mt:'Grimsby' }, c:[74,402], poly:[60,336,129,326,132,375,98,373,104,468,26,475,24,377,60,377] },
  { id:'au8', cont:'aurora', name:{ en:'Holloway', mt:'Holloway' }, c:[166,396], poly:[129,326,246,332,246,376,208,379,207,474,169,476,175,431,130,428,139,476,104,468,98,373,132,375] },
  { id:'au9', cont:'aurora', name:{ en:'Ironvale', mt:'Ironvale' }, c:[261,409], poly:[246,332,311,333,315,373,285,378,274,427,322,425,312,469,207,474,208,379,246,376] },
  /* solmar */
  { id:'so5', cont:'solmar', name:{ en:'Highmark', mt:'Highmark' }, c:[427,334], poly:[399,284,464,287,462,356,432,362,430,400,394,397] },
  { id:'so6', cont:'solmar', name:{ en:'Oakhurst', mt:'Oakhurst' }, c:[550,338], poly:[496,282,633,283,634,362,600,363,602,397,565,397,568,362,538,364,532,400,461,393,469,321,500,322] },
  /* vantia */
  { id:'va1', cont:'vantia', name:{ en:'Ravensford', mt:'Ravensford' }, c:[75,544], poly:[28,496,122,499,116,596,28,596] },
  { id:'va2', cont:'vantia', name:{ en:'Blackmoor', mt:'Blackmoor' }, c:[213,544], poly:[122,499,208,495,208,524,256,522,249,492,294,496,300,596,163,589,167,555,123,558] },
  { id:'va3', cont:'vantia', name:{ en:'Duskwater', mt:'Duskwater' }, c:[70,636], poly:[28,596,116,596,122,664,75,656,69,691,33,692] },
  /* norlund */
  { id:'no1', cont:'norlund', name:{ en:'Capewind', mt:'Capewind' }, c:[462,506], poly:[440,440,523,434,520,534,486,529,478,573,404,575,406,478,439,478] },
  { id:'no2', cont:'norlund', name:{ en:'Seacrag', mt:'Seacrag' }, c:[567,506], poly:[523,434,593,438,597,478,632,478,638,524,595,529,595,575,524,577] },
  /* vantia */
  { id:'va4', cont:'vantia', name:{ en:'Emberfall', mt:'Emberfall' }, c:[206,646], poly:[116,596,209,591,204,621,258,629,251,588,300,596,302,692,119,695] },
  { id:'va5', cont:'vantia', name:{ en:'Redhollow', mt:'Redhollow' }, c:[75,742], poly:[33,692,119,695,116,788,28,791] },
  { id:'va6', cont:'vantia', name:{ en:'Ashcombe', mt:'Ashcombe' }, c:[217,742], poly:[119,695,161,690,165,725,206,731,212,688,302,692,298,791,159,794,162,761,116,755] },
  /* norlund */
  { id:'no3', cont:'norlund', name:{ en:'Farstrand', mt:'Farstrand' }, c:[439,637], poly:[404,575,478,573,486,674,448,673,438,716,402,715] },
  { id:'no4', cont:'norlund', name:{ en:'Tidepoint', mt:'Tidepoint' }, c:[564,650], poly:[524,577,638,574,638,717,480,718,476,626,524,625] },
  /* kessia */
  { id:'ke1', cont:'kessia', name:{ en:'Frostmere', mt:'Frostmere' }, c:[73,861], poly:[29,806,124,806,121,919,24,913] },
  { id:'ke2', cont:'kessia', name:{ en:'Icebrook', mt:'Icebrook' }, c:[219,861], poly:[171,807,264,811,264,842,308,848,301,915,264,918,258,878,209,883,213,910,163,918,163,875,122,878,125,848,169,838] },
  /* meridia */
  { id:'me1', cont:'meridia', name:{ en:'Marrowvale', mt:'Marrowvale' }, c:[389,823], poly:[365,768,441,760,447,845,406,847,411,878,332,888,334,805,375,801] },
  { id:'me2', cont:'meridia', name:{ en:'Sablewood', mt:'Sablewood' }, c:[485,823], poly:[441,760,558,760,558,808,527,797,525,880,411,878,406,847,447,845] },
  { id:'me3', cont:'meridia', name:{ en:'Dunmere', mt:'Dunmere' }, c:[581,823], poly:[558,760,637,766,632,837,601,840,603,882,525,880,527,797,558,808] },
  /* kessia */
  { id:'ke3', cont:'kessia', name:{ en:'Winterhold', mt:'Winterhold' }, c:[73,967], poly:[24,913,121,919,121,1019,25,1022] },
  { id:'ke4', cont:'kessia', name:{ en:'Glacier', mt:'Glacier' }, c:[210,963], poly:[121,919,213,910,212,949,257,946,264,918,301,915,305,980,256,987,257,1015,162,1019,168,987,116,987] },
  /* meridia */
  { id:'me4', cont:'meridia', name:{ en:'Sunfallow', mt:'Sunfallow' }, c:[383,945], poly:[332,888,411,878,413,962,450,970,446,1008,370,1001,373,968,330,968] },
  { id:'me5', cont:'meridia', name:{ en:'Greenmarsh', mt:'Greenmarsh' }, c:[485,950], poly:[443,889,525,880,518,962,564,963,556,1011,446,1008,450,970,413,962,413,923,441,926] },
  { id:'me6', cont:'meridia', name:{ en:'Reedwash', mt:'Reedwash' }, c:[600,945], poly:[567,886,638,889,639,1009,556,1011] },
  /* kessia */
  { id:'ke5', cont:'kessia', name:{ en:'Hoarfrost', mt:'Hoarfrost' }, c:[68,1080], poly:[25,1022,74,1026,68,1060,121,1054,120,1126,30,1128] },
  { id:'ke6', cont:'kessia', name:{ en:'Palefen', mt:'Palefen' }, c:[215,1069], poly:[121,1019,209,1023,208,1057,258,1050,257,1015,302,1019,308,1122,262,1126,258,1089,218,1091,218,1122,164,1123,167,1085,123,1093] },
  /* meridia */
  { id:'me7', cont:'meridia', name:{ en:'Loamfield', mt:'Loamfield' }, c:[374,1059], poly:[330,1007,411,1000,413,1127,367,1125,366,1092,331,1088] },
  { id:'me8', cont:'meridia', name:{ en:'Bramble', mt:'Bramble' }, c:[461,1062], poly:[411,1000,518,1011,519,1083,491,1090,485,1130,413,1127] },
  { id:'me9', cont:'meridia', name:{ en:'Southgale', mt:'Southgale' }, c:[581,1073], poly:[556,1011,639,1009,633,1046,599,1051,602,1087,640,1092,638,1122,529,1126,518,1043,561,1045] },
];

const ADJ_PAIRS = [
  ['au1','au2'],['au1','au4'],['au2','au3'],['au2','au5'],['au3','so1'],['au3','au6'],
  ['so1','so2'],['so1','so3'],['so2','so4'],['au4','au5'],['au4','au7'],['au5','au6'],
  ['au5','au7'],['au5','au8'],['au6','au9'],['au6','so5'],['so3','so4'],['so3','so5'],
  ['so4','so6'],['au7','au8'],['au7','va1'],['au8','au9'],['au9','va3'],['so5','so6'],
  ['so5','no1'],['so6','no2'],['va1','va2'],['va1','va3'],['va2','va4'],['va3','no1'],
  ['va3','va4'],['va3','va5'],['no1','no2'],['no1','no3'],['no2','no4'],['va4','va6'],
  ['va4','ke1'],['va5','va6'],['va6','me1'],['no3','no4'],['no3','me2'],['no4','me3'],
  ['ke1','ke2'],['ke1','ke3'],['ke2','me1'],['ke2','ke4'],['me1','me2'],['me1','me4'],
  ['me2','me3'],['me2','me5'],['me3','me6'],['ke3','ke4'],['ke3','ke5'],['ke4','me4'],
  ['ke4','ke6'],['me4','me5'],['me4','me7'],['me4','me8'],['me5','me6'],['me5','me8'],
  ['me6','me9'],['ke5','ke6'],['ke6','me7'],['me7','me8'],['me8','me9'],
];

/* SEA_ROUTES: the inter-continent bridges (drawn as dashed sea lanes). */
const SEA_ROUTES = [
  ['au3','so1'],['au6','so5'],['au7','va1'],['au9','va3'],
  ['so5','no1'],['so6','no2'],['va3','no1'],['va4','ke1'],
  ['va6','me1'],['no4','me3'],['no3','me2'],['ke2','me1'],
  ['ke4','me4'],['ke6','me7'],
];

/* REGIONS is an alias for CONTINENTS (kept so the UI + harness can read
   either name); every territory carries `region` = its continent id too. */
const REGIONS = CONTINENTS;
TERRITORIES.forEach(t => { t.region = t.cont; });
const continentOf = id => CONTINENTS.find(r => r.id === id) || CONTINENTS[0];
const regionOf = continentOf;

const T_INDEX = (function(){ const m = {}; TERRITORIES.forEach((t,i)=>{ m[t.id]=i; }); return m; })();
const N_TERR = TERRITORIES.length;
const terrIndex = id => (id in T_INDEX ? T_INDEX[id] : -1);
const terrById  = id => TERRITORIES[terrIndex(id)] || null;

/* build the symmetric adjacency as index-sets */
const ADJ = (function(){
  const a = [];
  for (let i = 0; i < N_TERR; i++) a.push([]);
  const add = (u, v) => { if (a[u].indexOf(v) < 0) a[u].push(v); };
  for (const p of ADJ_PAIRS){
    const u = terrIndex(p[0]), v = terrIndex(p[1]);
    if (u < 0 || v < 0 || u === v) continue;
    add(u, v); add(v, u);
  }
  for (let i = 0; i < N_TERR; i++) a[i].sort((x,y)=>x-y);
  return a;
})();
const adjOf = i => ADJ[i] || [];
const areAdjacent = (i, j) => adjOf(i).indexOf(j) >= 0;

/* SEA_ROUTES as index pairs (the inter-continent links the UI draws as dashed
   sea lanes over the water). Every sea route is also a real adjacency edge. */
const SEA_ROUTE_IDX = (function(){
  const out = [];
  for (const p of SEA_ROUTES){
    const u = terrIndex(p[0]), v = terrIndex(p[1]);
    if (u >= 0 && v >= 0 && u !== v) out.push([u, v]);
  }
  return out;
})();
const isSeaRoute = (i, j) => {
  for (const [u, v] of SEA_ROUTE_IDX) if ((u === i && v === j) || (u === j && v === i)) return true;
  return false;
};

/* continent → member territory indices */
const REGION_MEMBERS = (function(){
  const m = {};
  CONTINENTS.forEach(r => { m[r.id] = []; });
  TERRITORIES.forEach((t, i) => { (m[t.cont] = m[t.cont] || []).push(i); });
  return m;
})();
const CONTINENT_MEMBERS = REGION_MEMBERS;

/* ═══════════════════════════════════════════════════════════════════
   MAP CHECK — proves the territory graph AND the continent graph are
   connected, adjacency is symmetric, every centroid sits inside its own
   cell, and no two badges collide. Returns a rich report the harness prints.
   ═══════════════════════════════════════════════════════════════════ */
function pointInPoly(px, py, poly){
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2){
    const xi = poly[i], yi = poly[i+1], xj = poly[j], yj = poly[j+1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function mapCheck(){
  /* symmetry */
  const asym = [];
  for (let i = 0; i < N_TERR; i++)
    for (const j of adjOf(i))
      if (adjOf(j).indexOf(i) < 0) asym.push([TERRITORIES[i].id, TERRITORIES[j].id]);
  /* territory connectivity (BFS from 0) */
  const seen = new Array(N_TERR).fill(false);
  const q = [0]; seen[0] = true; let cnt = 1;
  while (q.length){ const u = q.pop(); for (const v of adjOf(u)) if (!seen[v]){ seen[v] = true; cnt++; q.push(v); } }
  const unreachable = [];
  for (let i = 0; i < N_TERR; i++) if (!seen[i]) unreachable.push(TERRITORIES[i].id);
  const connected = cnt === N_TERR;
  const symmetric = asym.length === 0;
  /* continent graph connectivity: contract each continent to a node */
  const cids = CONTINENTS.map(c => c.id);
  const cadj = {}; cids.forEach(c => cadj[c] = new Set());
  for (let i = 0; i < N_TERR; i++)
    for (const j of adjOf(i)){
      const ci = TERRITORIES[i].cont, cj = TERRITORIES[j].cont;
      if (ci !== cj){ cadj[ci].add(cj); cadj[cj].add(ci); }
    }
  const cseen = new Set([cids[0]]); const cq = [cids[0]];
  while (cq.length){ const u = cq.pop(); for (const v of cadj[u]) if (!cseen.has(v)){ cseen.add(v); cq.push(v); } }
  const contConnected = cseen.size === cids.length;
  /* each continent internally connected */
  const contInternal = [];
  let contInternalOk = true;
  for (const c of CONTINENTS){
    const mem = REGION_MEMBERS[c.id];
    const sv = new Set([mem[0]]); const qq = [mem[0]];
    while (qq.length){ const u = qq.pop(); for (const v of adjOf(u)) if (TERRITORIES[v].cont === c.id && !sv.has(v)){ sv.add(v); qq.push(v); } }
    const ok = sv.size === mem.length;
    if (!ok) contInternalOk = false;
    contInternal.push({ id: c.id, size: mem.length, ok });
  }
  /* geometry: centroid inside own cell; badge collisions (min centroid dist) */
  const centOut = [];
  for (let i = 0; i < N_TERR; i++)
    if (!pointInPoly(TERRITORIES[i].c[0], TERRITORIES[i].c[1], TERRITORIES[i].poly)) centOut.push(TERRITORIES[i].id);
  let minCentDist = Infinity, badgePair = null;
  for (let i = 0; i < N_TERR; i++) for (let j = i + 1; j < N_TERR; j++){
    const dx = TERRITORIES[i].c[0] - TERRITORIES[j].c[0], dy = TERRITORIES[i].c[1] - TERRITORIES[j].c[1];
    const dd = Math.sqrt(dx*dx + dy*dy);
    if (dd < minCentDist){ minCentDist = dd; badgePair = [TERRITORIES[i].id, TERRITORIES[j].id]; }
  }
  const badgesOk = minCentDist >= 28;   /* two r≈13 badges never touch */
  const geomOk = centOut.length === 0 && badgesOk;
  return {
    connected, symmetric, contConnected, contInternalOk, geomOk,
    ok: connected && symmetric && contConnected && contInternalOk && geomOk,
    count: cnt, total: N_TERR, unreachable, asym,
    continents: CONTINENTS.length, contInternal,
    centroidsOutside: centOut, minCentDist: Math.round(minCentDist * 10) / 10, badgePair,
    edges: (function(){ let e = 0; for (let i = 0; i < N_TERR; i++) e += adjOf(i).length; return e / 2; })()
  };
}

/* ═══════════════════════════════════════════════════════════════════
   TERRITORY CARDS — the Risk card mechanic.
   Each of the 40 territories has ONE card; two WILD cards are added → a
   deck of 42. A card's symbol cycles infantry(0)/cavalry(1)/artillery(2)
   across the territory list so the three symbols are evenly spread; wilds
   carry symbol -1 and territory -1. The deck ORDER is a seeded shuffle
   (deckOrder(seed)) — a shared list every client computes identically, so
   card draws are deterministic and honest online. A "draw counter" on the
   state indexes the next card; drawing is simply deck[drawn++ % 42].
   ═══════════════════════════════════════════════════════════════════ */
const CARD_SYMBOLS = ['infantry', 'cavalry', 'artillery'];
const N_WILD = 2;
const DECK_SIZE = N_TERR + N_WILD;                 /* 42 */
/* the fixed card list (index 0..41): 0..39 territory cards, 40..41 wilds. */
const CARDS = (function(){
  const list = [];
  for (let i = 0; i < N_TERR; i++) list.push({ terr: i, sym: i % 3 });
  for (let w = 0; w < N_WILD; w++) list.push({ terr: -1, sym: -1 });
  return list;
})();
/* a seeded Fisher–Yates order of [0..41] using rollBig(seed, k). Pure. */
function deckOrder(seed){
  const order = [];
  for (let i = 0; i < DECK_SIZE; i++) order.push(i);
  for (let i = DECK_SIZE - 1; i > 0; i--){
    const j = rollBig(seed, 0x9c00 + i) % (i + 1);
    const t = order[i]; order[i] = order[j]; order[j] = t;
  }
  return order;
}
/* the card id drawn at draw-index k for this seed */
function cardAtDraw(seed, k){
  const order = deckOrder(seed);
  return order[k % DECK_SIZE];
}
/* the ESCALATING trade schedule: the n-th set traded (n counted across the
   WHOLE game, 1-based) is worth 4,6,8,10,12,15, then +5 each thereafter. */
function tradeValue(n){
  const table = [4, 6, 8, 10, 12, 15];
  if (n <= table.length) return table[n - 1];
  return 15 + (n - table.length) * 5;
}
/* is [a,b,c] (card ids) a valid set? three-of-a-kind or one-of-each,
   wilds (sym -1) match anything. */
function isCardSet(a, b, c){
  const s = [CARDS[a].sym, CARDS[b].sym, CARDS[c].sym];
  const wild = s.filter(x => x < 0).length;
  const real = s.filter(x => x >= 0);
  if (wild >= 1) return true;                       /* a wild completes any set */
  /* three of a kind */
  if (real[0] === real[1] && real[1] === real[2]) return true;
  /* one of each */
  if (real[0] !== real[1] && real[1] !== real[2] && real[0] !== real[2]) return true;
  return false;
}
/* find the FIRST valid 3-card set in a hand (array of card ids), or null. */
function findSet(hand){
  const n = hand.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++)
    if (isCardSet(hand[i], hand[j], hand[k])) return [hand[i], hand[j], hand[k]];
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   PHASES
   ═══════════════════════════════════════════════════════════════════ */
const PH_REINFORCE = 0, PH_ATTACK = 1, PH_FORTIFY = 2;
/* the two OPENING phases (setup) live above the play indices. */
const PH_CLAIM = 3, PH_DEPLOY = 4;
const PHASES = ['reinforce', 'attack', 'fortify'];

/* ═══════════════════════════════════════════════════════════════════
   LEVELS — the machine's three sharpnesses.
   ═══════════════════════════════════════════════════════════════════ */
const LEVELS = [
  { k: 1, name: 'Il-Milizja', icon: 'diff-1',
    note: { en: 'Greedy: piles up and swings at the nearest enemy.',
            mt: 'Rgħib: jgeddes u jolqot lill-eqreb għadu.' } },
  { k: 2, name: 'Il-Kaptan', icon: 'diff-2',
    note: { en: 'Guards borders, takes only fights it should win, trades cards.',
            mt: 'Iħares il-fruntieri, jieħu biss glied li għandu jirbaħ, ibiddel karti.' } },
  { k: 3, name: 'Il-Ġeneral', icon: 'diff-3',
    note: { en: 'Completes continents, presses odds, banks cards, never overextends.',
            mt: 'Ilesti kontinenti, jagħfas l-odds, jgeddes karti, qatt ma jinfirex.' } }
];
const levelOf = l => LEVELS.find(L => L.k === (l | 0)) || LEVELS[1];

/* ═══════════════════════════════════════════════════════════════════
   THE STATE
   opts: { seats, humans, lvl, aiJitter, turnCap, setup:'claim'|'random' }
   ═══════════════════════════════════════════════════════════════════ */
const DEFAULT_TURN_CAP = 40;

function startingArmies(seats){
  const table = { 2:40, 3:35, 4:30, 5:25, 6:20 };
  return table[seats] || 30;
}

/* set up the EMPTY board and open the CLAIM phase (or, if setup==='random',
   the deal is done by a single 'deal' move in the DEPLOY-less flow below). */
function beginSetup(st){
  const seats = st.seats;
  for (let t = 0; t < N_TERR; t++){ st.owner[t] = UNOWNED; st.army[t] = 0; }
  const per = startingArmies(seats);
  st.setupLeft = new Array(seats).fill(per);
  st.phase = PH_CLAIM;
  st.turn = 0;
  st.rollCtr = 1;
}

function neutralCount(st){ let n = 0; for (let t = 0; t < N_TERR; t++) if (st.owner[t] === UNOWNED) n++; return n; }
function setupArmiesLeft(st){ let n = 0; if (st.setupLeft) for (let s = 0; s < st.seats; s++) n += st.setupLeft[s]; return n; }
function inSetup(st){ return st.phase === PH_CLAIM || st.phase === PH_DEPLOY; }

/* advance the setup turn (claim → deploy → play). */
function advanceSetup(st){
  if (st.phase === PH_CLAIM){
    if (neutralCount(st) === 0) st.phase = PH_DEPLOY;
  }
  if (st.phase === PH_CLAIM){
    for (let i = 1; i <= st.seats; i++){
      const s = (st.turn + i) % st.seats;
      if (st.setupLeft[s] > 0){ st.turn = s; return; }
    }
    st.phase = PH_DEPLOY;
  }
  if (st.phase === PH_DEPLOY){
    if (setupArmiesLeft(st) === 0){ endSetup(st); return; }
    for (let i = 1; i <= st.seats; i++){
      const s = (st.turn + i) % st.seats;
      if (st.setupLeft[s] > 0){ st.turn = s; return; }
    }
    if (st.setupLeft[st.turn] > 0) return;
    endSetup(st);
  }
}

/* RANDOM DEAL — a single deterministic move that fills the whole board:
   territories dealt round-robin (in deck order for variety), 1 army each,
   then each seat's remaining setup armies scattered across its own land by
   a seeded walk. Ends setup straight into play. */
function doRandomDeal(st){
  const order = deckOrder(st.seed);              /* reuse the seeded shuffle    */
  /* deal territories round-robin among seats in shuffled order */
  let seat = 0;
  const terrOrder = order.filter(c => c < N_TERR); /* the 40 territory-card ids map 1:1 to territory indices */
  for (const tIdx of terrOrder){
    st.owner[tIdx] = seat;
    st.army[tIdx] = 1;
    st.setupLeft[seat] -= 1;
    seat = (seat + 1) % st.seats;
  }
  /* scatter the rest of each seat's armies over its own territories */
  for (let s = 0; s < st.seats; s++){
    const mine = [];
    for (let t = 0; t < N_TERR; t++) if (st.owner[t] === s) mine.push(t);
    let k = 0;
    while (st.setupLeft[s] > 0 && mine.length){
      const pick = mine[rollBig(st.seed, 0x5a00 + s * 97 + k) % mine.length];
      st.army[pick] += 1;
      st.setupLeft[s] -= 1;
      k++;
    }
  }
  endSetup(st);
}

/* close the opening and start normal play: seat 0, reinforce. */
function endSetup(st){
  st.phase = PH_REINFORCE;
  st.turn = 0;
  st.round = 1;
  st.turnsThisRound = 0;
  st.setupLeft = null;
  st.mustTrade = mustTrade(st, 0);
  st.reinf = reinforcementsFor(st, 0);
}

function newGame(opts, seed){
  opts = opts || {};
  const seats = Math.max(MIN_SEATS, Math.min(MAX_SEATS, opts.seats | 0 || 3));
  const setupMode = (opts.setup === 'random') ? 'random' : 'claim';
  const st = {
    v: 2,
    seats,
    n: N_TERR,
    setupMode,                     /* 'claim' | 'random'                     */
    owner: new Array(N_TERR).fill(UNOWNED),
    army:  new Array(N_TERR).fill(0),
    turn: 0,
    phase: PH_CLAIM,
    setupLeft: null,
    reinf: 0,
    fortified: false,
    lvl: Math.max(1, Math.min(3, opts.lvl | 0 || 2)),
    aiJitter: opts.aiJitter === false ? false : true,
    turnCap: opts.turnCap | 0 || DEFAULT_TURN_CAP,
    seed: (seed == null ? 0 : (seed >>> 0)),
    rollCtr: 1,
    round: 1,
    turnsThisRound: 0,
    alive: new Array(seats).fill(true),
    elimOrder: [],
    /* CARDS — a live FINITE deck (seeded order) + a discard pile, so no
       card id is ever in two places. Draw pops the deck's top; when the deck
       empties the discard is reshuffled (deterministically) back into it. */
    hands: (function(){ const h = []; for (let s = 0; s < seats; s++) h.push([]); return h; })(),
    deck: deckOrder(seed == null ? 0 : (seed >>> 0)),  /* remaining cards, top = last */
    discard: [],                   /* traded cards waiting to be reshuffled   */
    drawn: 0,                      /* total cards drawn (for stats/replays)   */
    setsTraded: 0,                 /* game-wide count (drives escalation)    */
    capturedThisTurn: false,       /* earned a card at end of turn?          */
    mustTrade: false,              /* seat must trade (5+ cards) before place */
    done: null,
    lastBattle: null,
    lastCard: null,                /* {seat, card} the last card earned      */
    lastTrade: null,               /* {seat, cards, armies} the last trade   */
    last: null
  };
  beginSetup(st);
  return st;
}

/* ═══════════════════════════════════════════════════════════════════
   READING THE BOARD
   ═══════════════════════════════════════════════════════════════════ */
function territoriesOf(st, seat){ const out = []; for (let t = 0; t < N_TERR; t++) if (st.owner[t] === seat) out.push(t); return out; }
function countTerr(st, seat){ let n = 0; for (let t = 0; t < N_TERR; t++) if (st.owner[t] === seat) n++; return n; }
function countArmies(st, seat){ let n = 0; for (let t = 0; t < N_TERR; t++) if (st.owner[t] === seat) n += st.army[t]; return n; }
function ownsRegion(st, seat, regionId){
  const mem = REGION_MEMBERS[regionId] || [];
  for (const t of mem) if (st.owner[t] !== seat) return false;
  return mem.length > 0;
}
const ownsContinent = ownsRegion;
function regionsOwned(st, seat){ const out = []; for (const r of CONTINENTS) if (ownsRegion(st, seat, r.id)) out.push(r.id); return out; }
const continentsOwned = regionsOwned;
/* total continent bonus a seat currently earns */
function continentBonus(st, seat){ let b = 0; for (const r of CONTINENTS) if (ownsRegion(st, seat, r.id)) b += r.bonus; return b; }

/* base reinforcements (no card trade): max(3, floor(T/3)) + Σ continent bonus. */
function reinforcementsFor(st, seat){
  const t = countTerr(st, seat);
  return Math.max(3, Math.floor(t / 3)) + continentBonus(st, seat);
}

/* ── CARDS: hand helpers ── */
function handOf(st, seat){ return (st.hands && st.hands[seat]) || []; }
/* you MUST trade at 5+ cards — but only if a valid set actually exists in
   the hand (it always does with 5 distinct cards over 3 symbols + wilds; the
   set check keeps the rule airtight against any odd finite-deck hand). */
function mustTrade(st, seat){ const h = handOf(st, seat); return h.length >= 5 && !!findSet(h); }
/* the value the NEXT traded set would grant (for the UI). */
function nextTradeValue(st){ return tradeValue(st.setsTraded + 1); }
/* does this seat hold a tradeable set right now? */
function hasTradeSet(st, seat){ return !!findSet(handOf(st, seat)); }

/* a deterministic reshuffle of the discard pile back into the deck. Uses a
   seed salted by how many reshuffles have happened, so it is reproducible
   and order-independent (we sort the ids first to erase splice-order). */
function reshuffleDiscard(st){
  const cards = st.discard.slice().sort((a, b) => a - b);
  st.discard = [];
  const salt = (0xd15c + st.drawn) >>> 0;
  for (let i = cards.length - 1; i > 0; i--){
    const j = rollBig(st.seed ^ salt, 0x7000 + i) % (i + 1);
    const t = cards[i]; cards[i] = cards[j]; cards[j] = t;
  }
  st.deck = cards;
}
/* draw the next card to `seat` (deterministic, from the live finite deck). */
function drawCard(st, seat){
  if (st.deck.length === 0){
    if (st.discard.length === 0) return;             /* every card is in a hand */
    reshuffleDiscard(st);
    if (st.deck.length === 0) return;
  }
  const cid = st.deck.pop();
  st.drawn += 1;
  st.hands[seat].push(cid);
  st.lastCard = { seat, card: cid };
}

/* ── attack helpers ── */
function attackSources(st, seat){
  const out = [];
  for (let t = 0; t < N_TERR; t++){
    if (st.owner[t] !== seat || st.army[t] < 2) continue;
    for (const v of adjOf(t)) if (st.owner[v] !== seat){ out.push(t); break; }
  }
  return out;
}
function attackTargets(st, src){
  const seat = st.owner[src]; const out = [];
  for (const v of adjOf(src)) if (st.owner[v] !== seat) out.push(v);
  return out;
}
function canAttack(st, seat){ return attackSources(st, seat).length > 0; }
function maxAtkDice(army){ return Math.max(0, Math.min(3, army - 1)); }
function maxDefDice(army){ return Math.min(2, army); }

/* clampAtkDice — the ONE place the attacker's dice-count rule lives, so the
   gate, the resolver, the machine and the screen can never disagree about it.
   Anything that cannot be read as a count in 1..max — undefined, null, 0, -3,
   9, 'x', NaN — becomes the MAXIMUM. A fraction is TRUNCATED first (2.7 -> 2,
   1.5 -> 1) and only then range-checked, because `| 0` is exactly what the
   wire codec does to it and the gate must never disagree with the bytes.
   That is deliberate and load-bearing: every move
   log and save file written before the attacker could choose carries no `n`,
   and they must keep replaying exactly as they always did. So "no n" MUST
   mean "max", and a bad `n` is corrected rather than refused (a refusal would
   stop a whole online table dead over a field an older build never sent). */
function clampAtkDice(army, n){
  const max = maxAtkDice(army);
  const v = (typeof n === 'number' && isFinite(n)) ? (n | 0) : 0;
  return (v >= 1 && v <= max) ? v : max;
}

function fortifyReachable(st, seat, from, to){
  if (from === to) return false;
  if (st.owner[from] !== seat || st.owner[to] !== seat) return false;
  const seen = new Array(N_TERR).fill(false);
  const q = [from]; seen[from] = true;
  while (q.length){
    const u = q.pop();
    for (const v of adjOf(u)){
      if (st.owner[v] !== seat || seen[v]) continue;
      if (v === to) return true;
      seen[v] = true; q.push(v);
    }
  }
  return false;
}
function canFortify(st, seat){
  if (st.fortified) return false;
  for (let t = 0; t < N_TERR; t++){
    if (st.owner[t] !== seat || st.army[t] < 2) continue;
    for (const v of adjOf(t)) if (st.owner[v] === seat) return true;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   THE MOVE VOCABULARY  (all flat, for the wire)
     { t:'claim',   to }                CLAIM: take an empty territory
     { t:'deploy',  to }                DEPLOY: add a setup army to own land
     { t:'deal' }                       RANDOM setup: deal the whole board
     { t:'trade',   x, y, z }           REINFORCE: trade a card set (card ids)
     { t:'place',   to, n }             REINFORCE: put n armies on `to`
     { t:'attack',  from, to, n }       ATTACK: one dice exchange, n = the
                                        attacker's dice count (1..maxAtkDice).
                                        Missing / out of range CLAMPS to max,
                                        which is what every pre-choice log
                                        carries and how it used to behave.
     { t:'advance', n }                 after a capture: move n armies in
     { t:'fortify', from, to, n }       FORTIFY: move n armies
     { t:'endphase' }                   leave the current phase
     { t:'endturn' }                    end the whole turn
   ═══════════════════════════════════════════════════════════════════ */
function turn(st){ return st.done ? -1 : st.turn; }
function phase(st){ return st.done ? -1 : st.phase; }
function pendingAdvance(st){ return st._pending || null; }

/* ═══════════════════════════════════════════════════════════════════
   THE GATE — check(st, mv, seat).
   ═══════════════════════════════════════════════════════════════════ */
function check(st, mv, seat){
  if (!mv || st.done) return false;
  if (seat !== st.turn) return false;
  const t = mv.t;
  /* ── THE OPENING ── */
  if (st.phase === PH_CLAIM){
    if (st.setupMode === 'random'){
      /* random setup: the ONLY legal opening move is a single 'deal' by
         seat 0 (which fills the board and starts play). */
      if (t !== 'deal') return false;
      if (seat !== 0) return false;
      if (neutralCount(st) !== N_TERR) return false;
      return true;
    }
    if (t !== 'claim') return false;
    const to = mv.to | 0;
    if (to < 0 || to >= N_TERR) return false;
    if (st.owner[to] !== UNOWNED) return false;
    if (!st.setupLeft || st.setupLeft[seat] < 1) return false;
    return true;
  }
  if (st.phase === PH_DEPLOY){
    if (t !== 'deploy') return false;
    const to = mv.to | 0;
    if (to < 0 || to >= N_TERR) return false;
    if (st.owner[to] !== seat) return false;
    if (!st.setupLeft || st.setupLeft[seat] < 1) return false;
    return true;
  }
  if (t === 'claim' || t === 'deploy' || t === 'deal') return false;
  /* while a capture-advance is pending, ONLY an advance is legal */
  if (st._pending){
    if (t !== 'advance') return false;
    const n = mv.n | 0; const p = st._pending;
    return n >= p.min && n <= p.max;
  }
  if (t === 'trade'){
    if (st.phase !== PH_REINFORCE) return false;
    const a = mv.x | 0, b = mv.y | 0, c = mv.z | 0;
    if (a === b || b === c || a === c) return false;
    const hand = handOf(st, seat);
    if (hand.indexOf(a) < 0 || hand.indexOf(b) < 0 || hand.indexOf(c) < 0) return false;
    if (!isCardSet(a, b, c)) return false;
    return true;
  }
  if (t === 'place'){
    if (st.phase !== PH_REINFORCE) return false;
    if (st.mustTrade) return false;                 /* must trade the set first */
    const to = mv.to | 0, n = mv.n | 0;
    if (to < 0 || to >= N_TERR) return false;
    if (st.owner[to] !== seat) return false;
    if (n < 1 || n > st.reinf) return false;
    return true;
  }
  if (t === 'attack'){
    if (st.phase !== PH_ATTACK) return false;
    if (st.reinf > 0) return false;
    const from = mv.from | 0, to = mv.to | 0;
    if (from < 0 || from >= N_TERR || to < 0 || to >= N_TERR) return false;
    if (st.owner[from] !== seat) return false;
    if (st.owner[to] === seat) return false;
    if (st.army[from] < 2) return false;
    if (!areAdjacent(from, to)) return false;
    /* `n` — the attacker's dice count — is VALIDATED against maxAtkDice but is
       never a reason to refuse: clampAtkDice() corrects it. An older client
       (and every log written before the choice existed) sends no `n` at all,
       and a refusal here would freeze that table for good. mv.n is left alone;
       resolveAttack() does the clamping, so check() stays side-effect free. */
    return true;
  }
  if (t === 'fortify'){
    if (st.phase !== PH_FORTIFY) return false;
    if (st.fortified) return false;
    const from = mv.from | 0, to = mv.to | 0, n = mv.n | 0;
    if (from < 0 || from >= N_TERR || to < 0 || to >= N_TERR) return false;
    if (st.owner[from] !== seat || st.owner[to] !== seat) return false;
    if (n < 1 || n > st.army[from] - 1) return false;
    if (!fortifyReachable(st, seat, from, to)) return false;
    return true;
  }
  if (t === 'endphase'){
    if (st.phase === PH_REINFORCE) return st.reinf === 0 && !st.mustTrade;
    if (st.phase === PH_ATTACK) return true;
    return false;
  }
  if (t === 'endturn'){
    if (st.phase === PH_REINFORCE) return false;
    return true;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   LEGAL — every move `seat` may make right now, as flat move objects that
   check() accepts. The attack dice count is a MENU (one, two or three, and
   the screen draws it as three buttons), so attacks are enumerated ONCE PER
   LEGAL `n`. The other counts — how many armies to place, advance or
   fortify — are a SLIDER, not a menu, so they are offered at their useful
   extremes (1 and the maximum) rather than exhaustively; enumerating every
   army count would return thousands of moves nobody reads and would tempt a
   caller into treating the list as a menu it is not.
   ═══════════════════════════════════════════════════════════════════ */
function legal(st, seat){
  const out = [];
  if (!st || st.done) return out;
  if (seat == null) seat = st.turn;
  if (seat !== st.turn) return out;

  /* a capture-advance outranks everything else */
  if (st._pending){
    const p = st._pending;
    for (let n = p.min; n <= p.max; n++) out.push({ t:'advance', n });
    return out;
  }
  if (st.phase === PH_CLAIM){
    if (st.setupMode === 'random'){
      if (seat === 0 && neutralCount(st) === N_TERR) out.push({ t:'deal' });
      return out;
    }
    for (let t = 0; t < N_TERR; t++) if (st.owner[t] === UNOWNED) out.push({ t:'claim', to:t });
    return out;
  }
  if (st.phase === PH_DEPLOY){
    for (let t = 0; t < N_TERR; t++) if (st.owner[t] === seat) out.push({ t:'deploy', to:t });
    return out;
  }
  if (st.phase === PH_REINFORCE){
    const hand = handOf(st, seat);
    for (let i = 0; i < hand.length; i++)
      for (let j = i + 1; j < hand.length; j++)
        for (let k = j + 1; k < hand.length; k++)
          if (isCardSet(hand[i], hand[j], hand[k])) out.push({ t:'trade', x:hand[i], y:hand[j], z:hand[k] });
    if (!st.mustTrade && st.reinf > 0)
      for (let t = 0; t < N_TERR; t++){
        if (st.owner[t] !== seat) continue;
        out.push({ t:'place', to:t, n: st.reinf });
        if (st.reinf > 1) out.push({ t:'place', to:t, n: 1 });
      }
    if (st.reinf === 0 && !st.mustTrade) out.push({ t:'endphase' });
    return out;
  }
  if (st.phase === PH_ATTACK){
    if (st.reinf === 0)
      for (const from of attackSources(st, seat)){
        const max = maxAtkDice(st.army[from]);
        for (const to of attackTargets(st, from))
          for (let n = 1; n <= max; n++) out.push({ t:'attack', from, to, n });
      }
    out.push({ t:'endphase' });
    out.push({ t:'endturn' });
    return out;
  }
  /* PH_FORTIFY */
  if (!st.fortified)
    for (let from = 0; from < N_TERR; from++){
      if (st.owner[from] !== seat || st.army[from] < 2) continue;
      for (const to of reachableOwn(st, seat, from)){
        if (to === from) continue;
        out.push({ t:'fortify', from, to, n: st.army[from] - 1 });
        if (st.army[from] - 1 > 1) out.push({ t:'fortify', from, to, n: 1 });
      }
    }
  out.push({ t:'endturn' });
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   APPLY — the ONLY mutator.
   ═══════════════════════════════════════════════════════════════════ */
function apply(st, mv){
  if (st.done) return;
  const seat = st.turn;
  const t = mv.t;

  if (t === 'deal'){ st.last = { t:'deal', seat }; doRandomDeal(st); return; }

  if (t === 'claim'){
    const to = mv.to | 0;
    st.owner[to] = seat; st.army[to] = 1; st.setupLeft[seat] -= 1;
    st.last = { t:'claim', to, seat };
    advanceSetup(st);
    return;
  }
  if (t === 'deploy'){
    const to = mv.to | 0;
    st.army[to] += 1; st.setupLeft[seat] -= 1;
    st.last = { t:'deploy', to, seat };
    advanceSetup(st);
    return;
  }
  if (t === 'trade'){
    const a = mv.x | 0, b = mv.y | 0, c = mv.z | 0;
    const hand = st.hands[seat];
    [a, b, c].forEach(cid => { const i = hand.indexOf(cid); if (i >= 0) hand.splice(i, 1); st.discard.push(cid); });
    st.setsTraded += 1;
    const armies = tradeValue(st.setsTraded);
    st.reinf += armies;
    st.lastTrade = { seat, cards: [a, b, c], armies };
    st.mustTrade = mustTrade(st, seat);             /* still 5+? must trade again */
    st.last = { t:'trade', seat, armies };
    return;
  }
  if (t === 'place'){
    const to = mv.to | 0, n = mv.n | 0;
    st.army[to] += n; st.reinf -= n;
    st.last = { t, to, n, seat };
    if (st.reinf === 0) st.phase = PH_ATTACK;
    return;
  }
  if (t === 'attack'){ resolveAttack(st, mv.from | 0, mv.to | 0, mv.n); return; }
  if (t === 'advance'){
    const p = st._pending; if (!p) return;
    const n = Math.max(p.min, Math.min(p.max, mv.n | 0));
    st.army[p.from] -= n; st.army[p.to] += n;
    st._pending = null;
    st.last = { t, from:p.from, to:p.to, n, seat };
    postCapture(st, seat, p.to);
    return;
  }
  if (t === 'fortify'){
    const from = mv.from | 0, to = mv.to | 0, n = mv.n | 0;
    st.army[from] -= n; st.army[to] += n; st.fortified = true;
    st.last = { t, from, to, n, seat };
    endTurn(st);
    return;
  }
  if (t === 'endphase'){
    if (st.phase === PH_REINFORCE && st.reinf === 0 && !st.mustTrade){ st.phase = PH_ATTACK; st.last = { t:'endphase', seat }; return; }
    if (st.phase === PH_ATTACK){
      st.phase = PH_FORTIFY; st.last = { t:'endphase', seat };
      if (!canFortify(st, seat)) endTurn(st);
      return;
    }
    return;
  }
  if (t === 'endturn'){ st.last = { t:'endturn', seat }; endTurn(st); return; }
}

/* ── one dice exchange ──
   `n` is the ATTACKER'S CHOICE of dice count, clamped to 1..maxAtkDice; a
   missing or out-of-range `n` means the maximum, so a pre-choice log rolls
   exactly the dice it always rolled and consumes exactly the same rollCtr
   counters. The defender never chooses — always maxDefDice. Everything below
   the dice count (sort descending, compare pairs, ties to the defender,
   capture, the advance window) is untouched; but note that _pending.min is
   min(nAtk, maxMove), i.e. YOU MUST MOVE IN AS MANY ARMIES AS DICE YOU
   ROLLED — with the choice in place that minimum now genuinely varies, and
   is the real cost of swinging with three dice. */
function resolveAttack(st, from, to, n){
  const seat = st.owner[from];
  const defSeat = st.owner[to];
  const nAtk = clampAtkDice(st.army[from], n);
  const nDef = maxDefDice(st.army[to]);
  const atk = [], def = [];
  for (let i = 0; i < nAtk; i++) atk.push(rollDie(st.seed, st.rollCtr++));
  for (let i = 0; i < nDef; i++) def.push(rollDie(st.seed, st.rollCtr++));
  atk.sort((a,b)=>b-a); def.sort((a,b)=>b-a);
  const cmp = Math.min(atk.length, def.length);
  let atkLoss = 0, defLoss = 0;
  for (let i = 0; i < cmp; i++){ if (atk[i] > def[i]) defLoss++; else atkLoss++; }
  st.army[from] -= atkLoss; st.army[to] -= defLoss;
  let captured = false;
  if (st.army[to] <= 0){
    captured = true; st.army[to] = 0; st.owner[to] = seat;
    const maxMove = Math.max(1, st.army[from] - 1);
    const minMove = Math.min(nAtk, maxMove);
    st._pending = { from, to, min: minMove, max: maxMove, nAtk };
  }
  st.lastBattle = { from, to, seat, defSeat, atkDice: atk.slice(), defDice: def.slice(), atkLoss, defLoss, captured };
  st.last = { t:'attack', from, to, seat, atkLoss, defLoss, captured };
}

/* after an advance completes a capture: mark the card-earn, check
   elimination (take cards) and the win. */
function postCapture(st, seat, capturedTerr){
  st.capturedThisTurn = true;                       /* earns a card at end of turn */
  const defSeat = st.lastBattle ? st.lastBattle.defSeat : -1;
  if (defSeat >= 0 && st.alive[defSeat] && countTerr(st, defSeat) === 0){
    st.alive[defSeat] = false;
    st.elimOrder.push(defSeat);
    /* the conqueror TAKES the eliminated player's cards */
    const taken = st.hands[defSeat].slice();
    st.hands[defSeat] = [];
    for (const c of taken) st.hands[seat].push(c);
    st.mustTrade = mustTrade(st, seat);
    st.last = { t:'attack', from: st.lastBattle.from, to: capturedTerr, seat,
                atkLoss: st.lastBattle.atkLoss, defLoss: st.lastBattle.defLoss,
                captured:true, eliminated: defSeat, tookCards: taken.length };
  }
  checkWin(st);
}

function checkWin(st){
  let aliveCount = 0, lastAlive = -1;
  for (let s = 0; s < st.seats; s++) if (st.alive[s]){ aliveCount++; lastAlive = s; }
  if (aliveCount <= 1){ finishGame(st, lastAlive); return true; }
  return false;
}

function finishGame(st, winner){
  const ranking = [];
  const alive = [];
  for (let s = 0; s < st.seats; s++) if (st.alive[s]) alive.push(s);
  alive.sort((a,b) => {
    const ta = countTerr(st,a), tb = countTerr(st,b);
    if (tb !== ta) return tb - ta;
    const aa = countArmies(st,a), ab = countArmies(st,b);
    if (ab !== aa) return ab - aa;
    return a - b;
  });
  for (const s of alive) ranking.push(s);
  for (let i = st.elimOrder.length - 1; i >= 0; i--) ranking.push(st.elimOrder[i]);
  st.done = { kind:'over', winner: winner >= 0 ? winner : (ranking[0] != null ? ranking[0] : -1), ranking, capped: st._capped || false };
}

/* END TURN — earn a card if warranted, advance to the next living seat. */
function endTurn(st){
  if (st.done) return;
  /* earn ONE card if the seat captured ≥1 territory this turn */
  if (st.capturedThisTurn && st.alive[st.turn]) drawCard(st, st.turn);
  st.capturedThisTurn = false;
  st.fortified = false;
  st._pending = null;
  st.turnsThisRound++;
  let next = -1;
  for (let i = 1; i <= st.seats; i++){
    const s = (st.turn + i) % st.seats;
    if (st.alive[s]){ next = s; break; }
  }
  if (next < 0){ checkWin(st); return; }
  if (next <= st.turn){
    st.round++;
    st.turnsThisRound = 0;
    if (st.round > st.turnCap){
      st._capped = true;
      let best = -1, bestScore = -1;
      for (let s = 0; s < st.seats; s++){
        if (!st.alive[s]) continue;
        const score = countTerr(st,s) * 1000 + countArmies(st,s);
        if (score > bestScore){ bestScore = score; best = s; }
      }
      finishGame(st, best);
      return;
    }
  }
  st.turn = next;
  st.phase = PH_REINFORCE;
  st.mustTrade = mustTrade(st, next);
  st.reinf = reinforcementsFor(st, next);
  st.fortified = false;
}

/* ═══════════════════════════════════════════════════════════════════
   OVER + NOTE
   ═══════════════════════════════════════════════════════════════════ */
function over(st){
  if (!st.done) return null;
  return { kind: st.done.kind, winner: st.done.winner, ranking: (st.done.ranking || []).slice(), capped: !!st.done.capped };
}
function note(st){
  if (st.done){
    if (st.done.capped) return { en: 'The turn limit was reached.', mt: 'Intlaħaq il-limitu tad-dawriet.' };
    return { en: 'The world is conquered.', mt: 'Id-dinja ġiet mirbuħa.' };
  }
  if (st.phase === PH_CLAIM && st.setupMode === 'random') return { en: 'Deal the world.', mt: 'Aqsam id-dinja.' };
  if (st.phase === PH_CLAIM)     return { en: 'Claim a territory.', mt: 'Ħu territorju.' };
  if (st.phase === PH_DEPLOY)    return { en: 'Place your armies.', mt: 'Poġġi l-armati tiegħek.' };
  if (st.phase === PH_REINFORCE) return { en: 'Trade cards or place your armies.', mt: 'Biddel il-karti jew poġġi l-armati.' };
  if (st.phase === PH_ATTACK)    return { en: 'Attack, or move on.', mt: 'Attakka, jew kompli.' };
  return { en: 'Move armies, or end your turn.', mt: 'Ċaqlaq l-armati, jew temmu d-dawra.' };
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — three sharpnesses. Pure and deterministic. Continent-aware
   (prioritises completing/holding a continent), trades cards sensibly, and
   plays the dice odds.
   ═══════════════════════════════════════════════════════════════════ */
const ODDS_CACHE = {};
function attackOdds(nAtk, nDef){
  const key = nAtk + 'x' + nDef;
  if (ODDS_CACHE[key]) return ODDS_CACHE[key];
  let good = 0, total = 0, sumDef = 0, sumAtk = 0;
  const atk = new Array(nAtk).fill(1), def = new Array(nDef).fill(1);
  function faces(arr, i, cb){ if (i === arr.length){ cb(); return; } for (let v = 1; v <= 6; v++){ arr[i] = v; faces(arr, i + 1, cb); } }
  faces(atk, 0, () => faces(def, 0, () => {
    total++;
    const a = atk.slice().sort((x,y)=>y-x), d = def.slice().sort((x,y)=>y-x);
    const cmp = Math.min(a.length, d.length);
    let al = 0, dl = 0;
    for (let i = 0; i < cmp; i++){ if (a[i] > d[i]) dl++; else al++; }
    sumDef += dl; sumAtk += al;
    if (dl >= al) good++;
  }));
  const res = { pAtkGood: good / total, eDef: sumDef / total, eAtk: sumAtk / total };
  ODDS_CACHE[key] = res;
  return res;
}
function aiCoin(st, seat, salt){ return hash32([st.seed, st.rollCtr, seat, salt, st.round].concat(st.owner).concat(st.army)); }
function borderPressure(st, seat, t){ let p = 0; for (const v of adjOf(t)) if (st.owner[v] !== seat) p += st.army[v]; return p; }
function isFrontier(st, seat, t){ for (const v of adjOf(t)) if (st.owner[v] !== seat) return true; return false; }

/* which continent (if any) `seat` is one capture away from completing. */
function regionOpportunity(st, seat){
  for (const r of CONTINENTS){
    const mem = REGION_MEMBERS[r.id];
    let missing = [];
    for (const t of mem) if (st.owner[t] !== seat) missing.push(t);
    if (missing.length !== 1) continue;
    const need = missing[0];
    let best = -1, bestArmy = 1;
    for (const v of adjOf(need)) if (st.owner[v] === seat && st.army[v] > bestArmy){ best = v; bestArmy = st.army[v]; }
    if (best >= 0) return { region: r.id, from: best, to: need, bonus: r.bonus };
  }
  return null;
}

/* ── OPENING STRATEGY ── */
function thinkClaim(st, seat, lvl){
  /* random setup: seat 0 issues the single deal */
  if (st.setupMode === 'random') return { t:'deal' };
  let best = -1, bestScore = -Infinity;
  for (let t = 0; t < N_TERR; t++){
    if (st.owner[t] !== UNOWNED) continue;
    const rid = TERRITORIES[t].cont;
    const mem = REGION_MEMBERS[rid];
    let mine = 0, rivalMax = 0, neutral = 0;
    const rivalCnt = new Array(st.seats).fill(0);
    for (const m of mem){
      const o = st.owner[m];
      if (o === seat) mine++;
      else if (o === UNOWNED) neutral++;
      else { rivalCnt[o]++; if (rivalCnt[o] > rivalMax) rivalMax = rivalCnt[o]; }
    }
    let score = 0;
    score += mine * 30;
    score += (10 - mem.length) * 5;                  /* smaller continent = easier */
    let adjMine = 0, adjRival = 0;
    for (const v of adjOf(t)){
      if (st.owner[v] === seat) adjMine++;
      else if (st.owner[v] !== UNOWNED) adjRival++;
    }
    score += adjMine * 10;
    score += rivalMax * 8;
    score -= (adjMine === 0 ? adjRival * 3 : 0);
    score += (hash32([st.seed, seat, t, st.round, mine, neutral].concat(st.owner)) % 100) / 100;
    if (score > bestScore){ bestScore = score; best = t; }
  }
  if (best < 0){ for (let t = 0; t < N_TERR; t++) if (st.owner[t] === UNOWNED){ best = t; break; } }
  return best >= 0 ? { t:'claim', to: best } : null;
}
function thinkDeploy(st, seat, lvl){
  let best = -1, bestScore = -Infinity;
  for (let t = 0; t < N_TERR; t++){
    if (st.owner[t] !== seat) continue;
    let score = 0;
    if (isFrontier(st, seat, t)) score += 20 + borderPressure(st, seat, t) - st.army[t] * 2;
    else score -= st.army[t];
    if (ownsRegion(st, seat, TERRITORIES[t].cont)) score += 4;
    score += (hash32([st.seed, seat, t, st.setupLeft ? st.setupLeft[seat] : 0].concat(st.army)) % 100) / 100;
    if (score > bestScore){ bestScore = score; best = t; }
  }
  if (best < 0){ for (let t = 0; t < N_TERR; t++) if (st.owner[t] === seat){ best = t; break; } }
  return best >= 0 ? { t:'deploy', to: best } : null;
}

function think(st, seat, lvl){
  if (st.done || seat !== st.turn) return null;
  lvl = Math.max(1, Math.min(3, lvl || st.lvl || 2));
  if (st.phase === PH_CLAIM)  return thinkClaim(st, seat, lvl);
  if (st.phase === PH_DEPLOY) return thinkDeploy(st, seat, lvl);
  if (st._pending){
    const p = st._pending;
    const frontierTo = isFrontier(st, seat, p.to);
    const frac = lvl >= 3 ? 0.62 : lvl === 2 ? 0.55 : 0.4;
    let n = frontierTo ? Math.min(p.max, Math.max(p.min, Math.ceil(p.max * frac))) : p.min;
    n = Math.max(p.min, Math.min(p.max, n));
    return { t:'advance', n };
  }
  if (st.phase === PH_REINFORCE) return thinkReinforce(st, seat, lvl);
  if (st.phase === PH_ATTACK)    return thinkAttack(st, seat, lvl);
  return thinkFortify(st, seat, lvl);
}

/* CARD POLICY: trade when forced (mustTrade), and — for lvl≥2 — trade a set
   whenever holding one (banking armies now beats sitting on cards, and it
   avoids ever being forced later). lvl1 only trades when forced. */
function thinkTrade(st, seat, lvl){
  const hand = handOf(st, seat);
  const set = findSet(hand);
  if (!set) return null;
  if (st.mustTrade) return { t:'trade', x:set[0], y:set[1], z:set[2] };
  if (lvl >= 2) return { t:'trade', x:set[0], y:set[1], z:set[2] };
  return null;
}

function thinkReinforce(st, seat, lvl){
  /* CARD trade first (forced, or by policy). */
  const tr = thinkTrade(st, seat, lvl);
  if (tr) return tr;
  if (st.mustTrade) return { t:'endphase' };         /* cannot happen: forced set always exists at 5+? guard */
  if (st.reinf <= 0) return { t:'endphase' };
  const mine = territoriesOf(st, seat);
  if (!mine.length) return { t:'endphase' };

  if (lvl === 1){
    const front = mine.filter(t => isFrontier(st, seat, t));
    const list = front.length ? front : mine;
    const h = hash32([st.seed, st.rollCtr, seat, st.round]) % list.length;
    return { t:'place', to: list[h], n: st.reinf };
  }
  const opp = (lvl >= 2) ? regionOpportunity(st, seat) : null;
  if (opp && st.owner[opp.from] === seat) return { t:'place', to: opp.from, n: st.reinf };
  let best = -1, bestScore = -1e9;
  for (const t of mine){
    if (!isFrontier(st, seat, t)) continue;
    const score = borderPressure(st, seat, t) - st.army[t];
    if (score > bestScore){ bestScore = score; best = t; }
  }
  if (best < 0){ best = mine[0]; for (const t of mine) if (st.army[t] > st.army[best]) best = t; }
  return { t:'place', to: best, n: st.reinf };
}

function evalPosition(st, seat){
  const myT = countTerr(st, seat), myA = countArmies(st, seat);
  let score = myT * 10 + myA * 1.0;
  for (const r of CONTINENTS){
    const mem = REGION_MEMBERS[r.id];
    let mine = 0; for (const t of mem) if (st.owner[t] === seat) mine++;
    if (mine === mem.length) score += r.bonus * 12;
    else score += (mine / mem.length) * r.bonus * 4;
  }
  for (let t = 0; t < N_TERR; t++){ if (st.owner[t] !== seat) continue; if (st.army[t] <= 1 && isFrontier(st, seat, t)) score -= 4; }
  let rivalT = 0;
  for (let s = 0; s < st.seats; s++) if (s !== seat && countTerr(st, s) > rivalT) rivalT = countTerr(st, s);
  score -= rivalT * 3;
  return score;
}
function projectAttackScore(st, seat, c){
  const fromA = st.army[c.from], toA = st.army[c.to], toO = st.owner[c.to];
  const od = attackOdds(c.nAtk, c.nDef);
  const eAtk = Math.round(od.eAtk), eDef = Math.round(od.eDef);
  st.army[c.from] = Math.max(1, fromA - eAtk);
  let capd = false;
  if (toA - eDef <= 0){
    capd = true; st.owner[c.to] = seat;
    const moveIn = Math.min(Math.max(1, st.army[c.from] - 1), Math.max(c.nAtk, 2));
    st.army[c.from] -= moveIn; st.army[c.to] = moveIn;
  } else st.army[c.to] = toA - eDef;
  const s = evalPosition(st, seat) + (capd ? 6 : 0);
  st.army[c.from] = fromA; st.army[c.to] = toA; st.owner[c.to] = toO;
  return s;
}
/* THE ODDS BAR — how good an attack has to look before the machine makes it.
   Pulled out of the filter so that the DICE TRIM below can be held to the very
   same bar; when these two disagree the machine stops attacking altogether. */
function attackBar(c, regionHunt){
  if (c.eliminates) return 0.30;
  if (c.completesRegion) return 0.42;
  return regionHunt ? 0.47 : 0.50;
}

/* HOW MANY DICE THE MACHINE WOULD LIKE TO ROLL.
   This is a WISH, not the answer — chooseAtkDice() below has the last word.

   The reason to take fewer than the maximum is THE FORCED MOVE-IN: on a
   capture you must move at least `n` armies into the taken land, so swinging
   with three from a square that is itself under pressure strips that square of
   three armies precisely WHEN YOU WIN. The dice count is therefore capped by
   what the square can spare once it has answered the enemies leaning on it.

   What this deliberately does NOT do is cut to one die against a two-die
   defender to "bleed slowly". One die against two wins 55/216 ≈ 25%, which is
   below even the lowest bar above (0.30), so that trim could never survive
   chooseAtkDice() — writing it here would be a comment that lies about what
   the code does.

   Pure: state, seat, level. No Math.random, no clock, no rollCtr read (so the
   choice cannot smuggle the dice stream into the decision). */
function aiAtkDice(st, seat, from, to, lvl){
  const max = maxAtkDice(st.army[from]);
  if (max <= 1) return max;                       /* no choice to make        */
  if (lvl <= 1) return max;                       /* the militia always swings */
  const src   = st.army[from];
  const press = borderPressure(st, seat, from);   /* enemy armies on this square */
  /* what this square can give up and still answer its own border */
  const spare = src - 1 - Math.ceil(press / 2);
  return Math.max(1, Math.min(max, spare < max ? spare : max));
}

/* CHOOSE THE DICE — and never let caution turn a yes into a no.
   The attack has ALREADY been judged worth making, on the odds at the FULL
   dice count, which is the attack's real potential and exactly what the engine
   judged before the dice became a choice. A trim is only honoured if the
   TRIMMED odds still clear the same bar that admitted the attack. Otherwise
   the machine rolls the maximum and makes the attack it decided to make.

   This is the whole regression, written down: judging the candidate on the
   trimmed odds and then filtering on a fixed bar meant one attacker die vs a
   two-die defender (~25%) failed every bar, every candidate was filtered out,
   and lvl 2 and lvl 3 stopped attacking entirely — every game ran to the
   40-round cap. Caution must never be able to become pacifism. */
function chooseAtkDice(st, seat, c, lvl, regionHunt){
  const want = aiAtkDice(st, seat, c.from, c.to, lvl);
  if (want >= c.nAtk) return c.nAtk;              /* no trim wanted           */
  if (attackOdds(want, c.nDef).pAtkGood >= attackBar(c, regionHunt)) return want;
  return c.nAtk;                                  /* the trim would kill it   */
}

function thinkAttack(st, seat, lvl){
  const srcs = attackSources(st, seat);
  if (!srcs.length) return { t:'endphase' };
  const cands = [];
  for (const from of srcs){
    /* JUDGE AT FULL DICE. `nAtk` here is the maximum — the attack's real
       potential — and every odds figure below (the bar, the projection, the
       sort) is computed from it, exactly as the engine did before the dice
       were a choice. How many dice actually get rolled is decided AFTER the
       attack has been chosen, by chooseAtkDice(). */
    const nAtk = maxAtkDice(st.army[from]);
    for (const to of attackTargets(st, from)){
      const nDef = maxDefDice(st.army[to]);
      const od = attackOdds(nAtk, nDef);
      cands.push({ from, to, nAtk, nDef, odds: od.pAtkGood, swing: od.eDef - od.eAtk,
                   completesRegion: completesRegionIfTaken(st, seat, to),
                   eliminates: wouldEliminate(st, seat, to),
                   defArmy: st.army[to], srcArmy: st.army[from] });
    }
  }
  if (!cands.length) return { t:'endphase' };
  if (lvl === 1){
    let pick = null;
    for (const c of cands){
      if (c.srcArmy < 3) continue;
      if (!pick || c.defArmy < pick.defArmy || (c.defArmy === pick.defArmy && c.srcArmy > pick.srcArmy)) pick = c;
    }
    if (!pick){ for (const c of cands){ if (!pick || c.defArmy < pick.defArmy) pick = c; } }
    if (!pick) return { t:'endphase' };
    return { t:'attack', from: pick.from, to: pick.to, n: pick.nAtk };
  }
  const REGION_HUNT = lvl >= 3;
  let pool = cands.filter(c => {
    if (c.odds < attackBar(c, REGION_HUNT)) return false;
    if (c.eliminates || c.completesRegion) return true;
    if (borderPressure(st, seat, c.from) > st.army[c.from] + 2 && c.srcArmy <= c.defArmy + 2) return false;
    return true;
  });
  if (!pool.length) return { t:'endphase' };
  if (REGION_HUNT){
    const now = evalPosition(st, seat);
    let best = null, bestScore = -Infinity;
    for (const c of pool){
      let s = projectAttackScore(st, seat, c);
      if (c.eliminates) s += 1000;
      if (c.completesRegion) s += 60;
      s += c.odds * 8;
      if (s > bestScore){ bestScore = s; best = c; }
    }
    if (best && !best.eliminates && !best.completesRegion && bestScore < now - 2) return { t:'endphase' };
    return { t:'attack', from: best.from, to: best.to, n: chooseAtkDice(st, seat, best, lvl, REGION_HUNT) };
  }
  pool.sort((a,b) => {
    if (a.eliminates !== b.eliminates) return a.eliminates ? -1 : 1;
    if (a.completesRegion !== b.completesRegion) return a.completesRegion ? -1 : 1;
    if (Math.abs(b.odds - a.odds) > 0.03) return b.odds - a.odds;
    return (b.srcArmy - b.defArmy) - (a.srcArmy - a.defArmy);
  });
  const pick = pool[0];
  return { t:'attack', from: pick.from, to: pick.to, n: chooseAtkDice(st, seat, pick, lvl, REGION_HUNT) };
}
function completesRegionIfTaken(st, seat, to){
  const rid = TERRITORIES[to].cont;
  const mem = REGION_MEMBERS[rid];
  for (const t of mem){ if (t === to) continue; if (st.owner[t] !== seat) return false; }
  return true;
}
function wouldEliminate(st, seat, to){
  const o = st.owner[to];
  if (o === seat || o < 0) return false;
  return countTerr(st, o) === 1;
}
function thinkFortify(st, seat, lvl){
  if (st.fortified || !canFortify(st, seat)) return { t:'endturn' };
  const mine = territoriesOf(st, seat);
  let bestFrom = -1, bestTo = -1, bestGain = 0, bestN = 0;
  for (const from of mine){
    if (st.army[from] < 2) continue;
    const surplus = isFrontier(st, seat, from) ? st.army[from] - 1 - borderPressure(st, seat, from) : st.army[from] - 1;
    if (surplus < 1) continue;
    const reach = reachableOwn(st, seat, from);
    for (const to of reach){
      if (to === from || !isFrontier(st, seat, to)) continue;
      const gain = borderPressure(st, seat, to) - st.army[to];
      if (gain > bestGain){ bestGain = gain; bestFrom = from; bestTo = to; bestN = Math.min(surplus, st.army[from] - 1); }
    }
  }
  if (bestFrom < 0 || bestN < 1) return { t:'endturn' };
  return { t:'fortify', from: bestFrom, to: bestTo, n: bestN };
}
function reachableOwn(st, seat, from){
  const seen = new Array(N_TERR).fill(false);
  const q = [from]; seen[from] = true; const out = [];
  while (q.length){ const u = q.pop(); for (const v of adjOf(u)){ if (st.owner[v] !== seat || seen[v]) continue; seen[v] = true; out.push(v); q.push(v); } }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — js/mp.js's generic codec folds a RAW move onto a bounded set of
   named integer fields (WIRE_FIELDS), carrying the move's `t` name separately.
   So WIRE_FIELDS lists the RAW field names our moves actually use, chosen to
   avoid mp.js's reserved carriers (`t` and `a`): territory endpoints `to`/
   `from`, a count `n`, and three card ids `x`/`y`/`z` for a trade. The dice
   AND the card draws are NOT on the wire — they are recomputed from (seed,
   counters) on every client. A 'deal' carries no fields (it is fully seeded).
     place   { to, n }         attack  { from, to, n }  advance { n }
     fortify { from, to, n }   claim   { to }           deploy  { to }
     trade   { x, y, z }       deal / endphase / endturn { }
   encWire/decWire below are a self-contained mirror (used by the UI's remote
   fallback and the harness); they keep the same RAW field names so a move that
   round-trips through either codec is identical.

   THE ATTACK DICE COUNT RIDES `n`. WIRE_FIELDS is UNCHANGED: `n` was already
   declared (place / advance / fortify use it) and `attack` simply did not,
   so there is NO new field to be undeclared and no build can stop on "this
   build does not know how to put undefined on the wire" — the repo's
   documented safest option. Known and accepted: an OLDER client sends an
   attack with no `n`, which clamps to max, so a mixed table diverges. Every
   attack consumes rollCtr, so that divergence shows up immediately in army
   counts instead of festering. This is a forced-update release.
   ═══════════════════════════════════════════════════════════════════ */
const WIRE_FIELDS = ['to', 'from', 'n', 'x', 'y', 'z'];
function encWire(mv){
  if (!mv || !mv.t) return null;
  const w = { t: mv.t };
  if (mv.t === 'place'){ w.to = mv.to | 0; w.n = mv.n | 0; }
  /* attack carries the dice count on the already-declared `n`. A move built
     without one (old code, a replayed old log) encodes as n:0 — a NUMBER, so
     never "undefined on the wire" — and 0 is the sentinel the resolver reads
     as "roll the maximum", which is what it always did. */
  else if (mv.t === 'attack'){ w.from = mv.from | 0; w.to = mv.to | 0; w.n = mv.n | 0; }
  else if (mv.t === 'advance'){ w.n = mv.n | 0; }
  else if (mv.t === 'fortify'){ w.from = mv.from | 0; w.to = mv.to | 0; w.n = mv.n | 0; }
  else if (mv.t === 'claim' || mv.t === 'deploy'){ w.to = mv.to | 0; }
  else if (mv.t === 'trade'){ w.x = mv.x | 0; w.y = mv.y | 0; w.z = mv.z | 0; }
  else if (mv.t === 'deal' || mv.t === 'endphase' || mv.t === 'endturn'){ /* no fields */ }
  else return null;
  return w;
}
function decWire(w){
  if (!w || !w.t) return null;
  const t = w.t;
  if (t === 'place')   return { t, to: w.to | 0, n: w.n | 0 };
  /* an OLD packet has no `n` at all → 0 → clampAtkDice() rolls the maximum. */
  if (t === 'attack')  return { t, from: w.from | 0, to: w.to | 0, n: w.n | 0 };
  if (t === 'advance') return { t, n: w.n | 0 };
  if (t === 'fortify') return { t, from: w.from | 0, to: w.to | 0, n: w.n | 0 };
  if (t === 'claim')   return { t, to: w.to | 0 };
  if (t === 'deploy')  return { t, to: w.to | 0 };
  if (t === 'trade')   return { t, x: w.x | 0, y: w.y | 0, z: w.z | 0 };
  if (t === 'deal')    return { t };
  if (t === 'endphase')return { t };
  if (t === 'endturn') return { t };
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_KONKWISTA = root.KARTI_KONKWISTA || {};
root.KARTI_KONKWISTA.engine = {
  MIN_SEATS, MAX_SEATS, UNOWNED, N_TERR, DEFAULT_TURN_CAP,
  PH_REINFORCE, PH_ATTACK, PH_FORTIFY, PH_CLAIM, PH_DEPLOY, PHASES,
  COLOURS, colourOf, LEVELS, levelOf,
  /* map */
  TERRITORIES, REGIONS, CONTINENTS, REGION_MEMBERS, CONTINENT_MEMBERS, ADJ, mapCheck,
  SEA_ROUTES, SEA_ROUTE_IDX, isSeaRoute,
  terrIndex, terrById, adjOf, areAdjacent, regionOf, continentOf,
  /* cards */
  CARDS, CARD_SYMBOLS, DECK_SIZE, N_WILD, deckOrder, cardAtDraw, tradeValue,
  isCardSet, findSet, handOf, mustTrade, nextTradeValue, hasTradeSet,
  /* rng */
  newSeed, rollDie, rollBig, mix32, hash32,
  /* lifecycle */
  newGame, beginSetup,
  /* reading */
  turn, phase, over, note, pendingAdvance,
  inSetup, neutralCount, setupArmiesLeft, startingArmies,
  territoriesOf, countTerr, countArmies, ownsRegion, ownsContinent, regionsOwned, continentsOwned,
  reinforcementsFor, continentBonus, attackSources, attackTargets, canAttack, canFortify,
  fortifyReachable, maxAtkDice, maxDefDice, clampAtkDice, isFrontier, borderPressure,
  /* the gate + mutator */
  check, legal, apply,
  /* the machine */
  think, attackOdds,
  /* the wire */
  encWire, decWire, WIRE_FIELDS
};

})(typeof window !== 'undefined' ? window : globalThis);
