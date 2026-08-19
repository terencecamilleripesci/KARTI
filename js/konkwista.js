/* ═══════════════════════════════════════════════════════════════════
   KARTI — konkwista.js
   IL-KONKWISTA — "the conquest". A Risk-style TERRITORY CONQUEST game
   for TWO to SIX players over an ORIGINAL Mediterranean-archipelago map.
   The conquest MECHANIC (reinforce → attack → fortify, dice combat,
   region bonuses, elimination, last-one-standing) is public-domain; the
   MAP, the names, the numbers and the code are all ours. No Hasbro, no
   "Risk" mark, no real political world map.

   This file is the PURE ENGINE: rules only, no DOM, no clock. It follows
   the house shape of js/erbgha.js and js/aqleb.js exactly —
   window.KARTI_KONKWISTA = { engine:{…} }, a state that is newGame() plus
   a replay of a move log, a hard check() gate every move passes through,
   an apply() that is the ONLY mutator, a pure AI think(), and a flat
   encWire/decWire for js/mp.js's generic codec. The screen half is
   js/konkwista-ui.js.

   ───────────────────────────────────────────────────────────────────
   THE MAP  (see MAP below — the single source of truth)
     ~27 TERRITORIES grouped into SIX REGIONS ("continents"), each region
     worth a reinforcement bonus if you own ALL of it. Every territory is
     an SVG polygon (points in a 1000×720 viewBox) with a centroid for its
     army badge. The ADJACENCY list includes overland borders and a few
     documented SEA ROUTES between islands. The graph is proven CONNECTED
     and every edge SYMMETRIC by the harness (mapCheck()).

   THE TURN  (three signposted phases, standard conquest)
     1 REINFORCE  you receive armies = max(3, floor(T/3)) + Σ region bonus
        for every region you fully own, where T is the number of
        territories you hold. Place them, one or many at a time, on any of
        YOUR territories. You must place them all before you may attack.
     2 ATTACK  repeatedly: pick one of YOUR territories with >1 army that
        borders an ENEMY territory, and attack that enemy. The attacker
        rolls up to 3 dice (needs ≥2 armies to roll; max dice = armies-1,
        capped at 3); the defender rolls up to 2 (min(2, defenderArmies)).
        Sort both descending, compare highest-vs-highest and (if both have
        a second die) second-vs-second. Each comparison the DEFENDER wins
        or TIES costs the attacker one army; otherwise the defender loses
        one. If the defender reaches 0 the attacker CAPTURES the territory
        and MUST move in at least (number of attacker dice rolled) armies,
        leaving ≥1 behind on the source. Attack as often as you like, then
        stop. (One attack = one exchange of dice, the classic "blitz"-free
        single roll; the UI can auto-repeat, but each roll is its own move
        so online replays identically.)
     3 FORTIFY  optionally ONCE: move any number of armies (leaving ≥1
        behind) from one of your territories to ANOTHER of your
        territories that is CONNECTED to it THROUGH A CHAIN OF YOUR OWN
        territories (connected-path fortify, the common "Fortify" rule).
        Then END TURN. Skipping fortify is legal.

     ELIMINATION  a player holding zero territories is OUT; their podium
     place is fixed by the ORDER they were eliminated (first out = last
     place). WIN = the last player standing (owns the whole map, or every
     rival is eliminated). A safety TURN-CAP (default 40 full rounds) ends
     any game that will not resolve: survivors are then ranked by
     territories held, then by total armies. The harness proves a game can
     neither deadlock nor run forever.

   DETERMINISM  (the whole reason online + pass-the-phone are honest)
     Combat dice are NOT Math.random. Each die is derived from the shared
     game SEED and a monotonic ROLL COUNTER through an integer hash
     (splitmix32 → 1..6). The seed is the ONLY quarantined Math.random in
     this file (newSeed(), the same quarantine erbgha/aqleb/poker keep).
     So two independent clients that apply the same move sequence reach a
     BYTE-IDENTICAL board, and pass-the-phone replays identically — no
     client has to trust the roller. The AI is likewise pure: it reads the
     board and, for tie-breaks, a per-seat hash of the state; there is no
     shared PRNG a human could read ahead.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ── seats: 2..6 players ─────────────────────────────────────────────
   A territory's owner is a seat index 0..5, or -1 while unowned during
   the deal. Seat 0 opens. */
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

/* a small integer hash (FNV-1a) over a list of ints → 0..0xffffffff.
   Used for AI tie-breaks (never a clock, never Math.random). */
function hash32(list){
  let h = 2166136261;
  for (let i = 0; i < list.length; i++){
    h ^= (list[i] | 0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* splitmix32: a stateless integer mixer. rollDie(seed, counter) → 1..6,
   uniform (proven by the harness over millions of draws). The (seed,
   counter) pair is the ONLY input, so every client that has replayed the
   same moves computes the identical die. */
function mix32(x){
  x = (x + 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0;
  return (x ^ (x >>> 15)) >>> 0;
}
function rollDie(seed, counter){
  /* combine seed and counter, mix, then reduce to 1..6 with a rejection
     step so the modulo bias (2^32 % 6 != 0) does not skew the low faces.
     2^32 = 4294967296; the largest multiple of 6 not exceeding it is
     4294967292, so we reject the top 4 values and re-mix. */
  let s = (seed >>> 0);
  let c = (counter >>> 0);
  let x = mix32((s ^ Math.imul(c, 0x85ebca77)) >>> 0);
  let guard = 0;
  while (x >= 4294967292 && guard < 8){ x = mix32(x); guard++; }
  return (x % 6) + 1;
}

/* ═══════════════════════════════════════════════════════════════════
   THE MAP — L-ARĊIPELAGU. Six regions, 27 territories. Coordinates are
   in a PORTRAIT 660×1160 viewBox (the map is drawn tall so it fills a
   phone in one glance — no pan needed); `poly` is the SVG polygon (flat
   [x,y,…]) and `c` is the centroid where the army badge sits. The cells
   are a proper Voronoi tiling: they never overlap, they tile the box, and
   every centroid sits inside its own cell (so a tap is pixel-exact and the
   badge always lands on the right land). `adj` is symmetric and the whole
   graph is connected (proven by mapCheck()). Region ids and their
   full-ownership bonus live in REGIONS.

   The six regions, west→east, form a stylised Mediterranean archipelago:
     GRIZBAR  (the western reach)      bonus 3
     QALB     (the central heartland)  bonus 5
     XLOKK    (the south-east shore)   bonus 4
     TRAMUNTANA (the northern isles)   bonus 3
     LVANT    (the eastern cape)       bonus 4
     GZEJJER  (the scattered isles)    bonus 2
   ═══════════════════════════════════════════════════════════════════ */
const REGIONS = [
  { id:'grizbar',    bonus:3, hex:'#7c5cff', name:{ en:'Griżbar Reach',   mt:'Ġibla ta’ Griżbar' } },
  { id:'qalb',       bonus:5, hex:'#e6b422', name:{ en:'The Heartland',   mt:'Il-Qalba' } },
  { id:'xlokk',      bonus:4, hex:'#e8752a', name:{ en:'Xlokk Shore',     mt:'Xatt Xlokk' } },
  { id:'tramuntana', bonus:3, hex:'#2b9dd9', name:{ en:'Tramuntana Isles',mt:'Gżejjer Tramuntana' } },
  { id:'lvant',      bonus:4, hex:'#2fa34d', name:{ en:'Lvant Cape',      mt:'Ras il-Lvant' } },
  { id:'gzejjer',    bonus:2, hex:'#e05a9c', name:{ en:'Scattered Isles', mt:'Il-Gżejjer Mbegħdin' } }
];
const regionOf = id => REGIONS.find(r => r.id === id) || REGIONS[0];

/* Each territory: id, region, name{en,mt}, c:[cx,cy] centroid, poly:[…].
   The polygons are a Voronoi tiling of the 660×1160 portrait viewBox —
   generated, then verified to (a) never overlap, (b) tile the whole box
   with no gaps, and (c) hold their own centroid inside the cell so the tap
   target and the army badge always sit on the right land. The identity is
   decorative, the topology (ADJ_PAIRS below) is the truth; a handful of
   engine edges are "sea routes" whose cells needn't visually touch. */
const TERRITORIES = [
  /* ── GRIŻBAR REACH (west) — 5 territories ── */
  { id:'gr1', region:'grizbar', name:{ en:'Marsalforn', mt:'Marsalforn' }, c:[99,86], poly:[221,44,128,184,8,174,8,8,219,8] },
  { id:'gr2', region:'grizbar', name:{ en:'Żebbuġ Head', mt:'Ras iż-Żebbuġ' }, c:[83,276], poly:[144,368,8,374,8,174,128,184,181,259] },
  { id:'gr3', region:'grizbar', name:{ en:'Wied il-Mielaħ', mt:'Wied il-Mielaħ' }, c:[230,170], poly:[328,167,306,245,181,259,128,184,221,44] },
  { id:'gr4', region:'grizbar', name:{ en:'Dwejra', mt:'Id-Dwejra' }, c:[92,464], poly:[186,417,170,547,156,560,8,554,8,374,144,368] },
  { id:'gr5', region:'grizbar', name:{ en:'Ċittadella', mt:'Iċ-Ċittadella' }, c:[86,651], poly:[145,746,8,742,8,554,156,560,174,708] },

  /* ── THE HEARTLAND (centre) — 5 territories ── */
  { id:'qb1', region:'qalb', name:{ en:'Rabat', mt:'Ir-Rabat' }, c:[248,332], poly:[352,312,320,402,186,417,144,368,181,259,306,245] },
  { id:'qb2', region:'qalb', name:{ en:'Mdina', mt:'L-Imdina' }, c:[248,631], poly:[351,656,321,703,174,708,156,560,170,547,318,566] },
  { id:'qb3', region:'qalb', name:{ en:'Attard', mt:'Ħ’Attard' }, c:[264,484], poly:[367,480,318,566,170,547,186,417,320,402] },
  { id:'qb4', region:'qalb', name:{ en:'Ħamrun', mt:'Il-Ħamrun' }, c:[249,780], poly:[348,812,291,872,177,842,145,746,174,708,321,703] },
  { id:'qb5', region:'qalb', name:{ en:'Qormi', mt:'Ħal Qormi' }, c:[212,933], poly:[172,1020,103,944,177,842,291,872,308,987] },

  /* ── XLOKK SHORE (south-east) — 4 territories ── */
  { id:'xl1', region:'xlokk', name:{ en:'Żejtun', mt:'Iż-Żejtun' }, c:[411,1069], poly:[324,1000,464,978,495,1011,487,1152,333,1152] },
  { id:'xl2', region:'xlokk', name:{ en:'Marsaxlokk', mt:'Marsaxlokk' }, c:[573,1079], poly:[495,1011,652,997,652,1152,487,1152] },
  { id:'xl3', region:'xlokk', name:{ en:'Birżebbuġa', mt:'Birżebbuġa' }, c:[385,907], poly:[474,838,482,849,464,978,324,1000,308,987,291,872,348,812] },
  { id:'xl4', region:'xlokk', name:{ en:'Delimara', mt:'Delimara' }, c:[248,1079], poly:[172,1020,308,987,324,1000,333,1152,149,1152] },

  /* ── TRAMUNTANA ISLES (north) — 4 territories ── */
  { id:'tr1', region:'tramuntana', name:{ en:'Mellieħa', mt:'Il-Mellieħa' }, c:[409,223], poly:[474,304,352,312,306,245,328,167,447,119,510,190] },
  { id:'tr2', region:'tramuntana', name:{ en:'Ċirkewwa', mt:'Iċ-Ċirkewwa' }, c:[555,93], poly:[510,190,447,119,459,8,652,8,652,176] },
  { id:'tr3', region:'tramuntana', name:{ en:'St Paul’s', mt:'San Pawl' }, c:[419,392], poly:[472,483,367,480,320,402,352,312,474,304,520,366] },
  { id:'tr4', region:'tramuntana', name:{ en:'Baħar iċ-Ċ.', mt:'Baħar iċ-Ċ.' }, c:[574,275], poly:[520,366,474,304,510,190,652,176,652,367] },

  /* ── LVANT CAPE (east) — 5 territories ── */
  { id:'lv1', region:'lvant', name:{ en:'Valletta', mt:'Il-Belt' }, c:[415,568], poly:[475,653,351,656,318,566,367,480,472,483,513,540] },
  { id:'lv2', region:'lvant', name:{ en:'Sliema', mt:'Tas-Sliema' }, c:[573,455], poly:[513,540,472,483,520,366,652,367,652,540] },
  { id:'lv3', region:'lvant', name:{ en:'Cospicua', mt:'Bormla' }, c:[417,738], poly:[513,705,474,838,348,812,321,703,351,656,475,653] },
  { id:'lv4', region:'lvant', name:{ en:'Kalkara', mt:'Il-Kalkara' }, c:[572,623], poly:[513,705,475,653,513,540,652,540,652,703] },
  { id:'lv5', region:'lvant', name:{ en:'Fort St E.', mt:'Sant’Iermu' }, c:[560,931], poly:[495,1011,464,978,482,849,652,866,652,997] },

  /* ── SCATTERED ISLES (far corners, sea-linked) — 4 territories ── */
  { id:'gz1', region:'gzejjer', name:{ en:'Kemmuna', mt:'Kemmuna' }, c:[80,839], poly:[103,944,8,944,8,742,145,746,177,842] },
  { id:'gz2', region:'gzejjer', name:{ en:'Filfla', mt:'Filfla' }, c:[81,1052], poly:[8,944,103,944,172,1020,149,1152,8,1152] },
  { id:'gz3', region:'gzejjer', name:{ en:'Fungus Rk', mt:'Il-Ġebla' }, c:[348,70], poly:[447,119,328,167,221,44,219,8,459,8] },
  { id:'gz4', region:'gzejjer', name:{ en:'St Julian’s', mt:'San Ġiljan' }, c:[573,784], poly:[482,849,474,838,513,705,652,703,652,866] }
];
const T_INDEX = (function(){ const m = {}; TERRITORIES.forEach((t,i)=>{ m[t.id]=i; }); return m; })();
const N_TERR = TERRITORIES.length;
const terrIndex = id => (id in T_INDEX ? T_INDEX[id] : -1);
const terrById  = id => TERRITORIES[terrIndex(id)] || null;

/* ADJACENCY — declared once per undirected edge; symmetrised below.
   Overland borders plus a handful of documented SEA ROUTES (marked). */
const ADJ_PAIRS = [
  /* Griżbar internal */
  ['gr1','gr2'],['gr1','gr3'],['gr2','gr3'],['gr2','gr5'],['gr3','gr4'],
  ['gr4','gr5'],['gr2','gr4'],
  /* Griżbar → Scattered / Heartland (sea + land) */
  ['gr3','qb1'],['gr4','qb1'],['gr4','gz1'],['gr5','gz1'],['gr5','gz2'],
  /* Heartland internal */
  ['qb1','qb2'],['qb2','qb3'],['qb2','qb5'],['qb3','qb4'],['qb4','qb5'],
  ['qb2','qb4'],['qb1','qb3'],
  /* Heartland → Tramuntana / Xlokk / Lvant */
  ['qb1','tr1'],['qb3','tr1'],['qb3','tr3'],['qb4','xl1'],['qb4','xl3'],
  ['qb5','xl4'],['qb4','lv1'],['qb5','gz2'],
  /* Xlokk internal */
  ['xl1','xl2'],['xl1','xl3'],['xl2','xl3'],['xl1','xl4'],['xl2','gz4'],
  ['xl3','lv1'],['xl2','lv3'],
  /* Tramuntana internal */
  ['tr1','tr2'],['tr2','tr3'],['tr2','tr4'],['tr3','tr4'],['tr1','tr3'],
  /* Tramuntana → Lvant */
  ['tr3','lv1'],['tr4','lv1'],['tr4','lv2'],
  /* Lvant internal */
  ['lv1','lv2'],['lv1','lv3'],['lv2','lv3'],['lv2','lv4'],['lv3','lv4'],
  ['lv3','lv5'],['lv4','lv5'],['lv1','gz4'],['lv3','gz4'],['lv5','xl2'],
  /* Scattered isles: sea routes stitch them into the graph */
  ['gz1','gz2'],['gz1','qb2'],['gz3','qb1'],['gz3','gr3'],['gz4','xl2']
];

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

/* region → member territory indices */
const REGION_MEMBERS = (function(){
  const m = {};
  REGIONS.forEach(r => { m[r.id] = []; });
  TERRITORIES.forEach((t, i) => { (m[t.region] = m[t.region] || []).push(i); });
  return m;
})();

/* ═══════════════════════════════════════════════════════════════════
   MAP CHECK — proves the graph is fully connected and symmetric. Called
   by the harness (and cheaply at newGame in dev). Returns
   { connected, symmetric, ok, unreachable:[…], asym:[…] }.
   ═══════════════════════════════════════════════════════════════════ */
function mapCheck(){
  /* symmetry */
  const asym = [];
  for (let i = 0; i < N_TERR; i++)
    for (const j of adjOf(i))
      if (adjOf(j).indexOf(i) < 0) asym.push([TERRITORIES[i].id, TERRITORIES[j].id]);
  /* connectivity (BFS from 0) */
  const seen = new Array(N_TERR).fill(false);
  const q = [0]; seen[0] = true; let cnt = 1;
  while (q.length){
    const u = q.pop();
    for (const v of adjOf(u)) if (!seen[v]){ seen[v] = true; cnt++; q.push(v); }
  }
  const unreachable = [];
  for (let i = 0; i < N_TERR; i++) if (!seen[i]) unreachable.push(TERRITORIES[i].id);
  const connected = cnt === N_TERR;
  const symmetric = asym.length === 0;
  return { connected, symmetric, ok: connected && symmetric, count: cnt, total: N_TERR, unreachable, asym };
}

/* ═══════════════════════════════════════════════════════════════════
   PHASES
   ═══════════════════════════════════════════════════════════════════ */
const PH_REINFORCE = 0, PH_ATTACK = 1, PH_FORTIFY = 2;
/* the two OPENING phases (real-Risk setup), before normal play. Numbered
   above the play phases so they never collide with a PHASES[] index. */
const PH_CLAIM = 3, PH_DEPLOY = 4;
const PHASES = ['reinforce','attack','fortify'];

/* ═══════════════════════════════════════════════════════════════════
   LEVELS — the machine's three sharpnesses (js/erbgha.js's shape). */
const LEVELS = [
  { k: 1, name: 'Il-Milizja', icon: 'diff-1',
    note: { en: 'Greedy: piles up and swings at the nearest enemy.',
            mt: 'Rgħib: jgeddes u jolqot lill-eqreb għadu.' } },
  { k: 2, name: 'Il-Kaptan', icon: 'diff-2',
    note: { en: 'Guards borders, takes only fights it should win.',
            mt: 'Iħares il-fruntieri, jieħu biss glied li għandu jirbaħ.' } },
  { k: 3, name: 'Il-Ġeneral', icon: 'diff-3',
    note: { en: 'Completes regions, presses odds, never overextends.',
            mt: 'Ilesti reġjuni, jagħfas l-odds, qatt ma jinfirex żżejjed.' } }
];
const levelOf = l => LEVELS.find(L => L.k === (l | 0)) || LEVELS[1];

/* ═══════════════════════════════════════════════════════════════════
   THE STATE
   opts: { seats, humans, lvl, aiJitter, turnCap }
     seats    2..6 (default 3)
     lvl      machine sharpness 1..3
     aiJitter default true; false makes the machine fully deterministic
     turnCap  full-round safety cap (default 40)
   The engine tracks: per-territory owner + army count, whose turn, the
   phase, reinforcements left to place this turn, whether fortify is spent,
   the roll counter (drives the deterministic dice), the elimination order,
   the round counter, and the ending.
   ═══════════════════════════════════════════════════════════════════ */
const DEFAULT_TURN_CAP = 40;

/* ── THE OPENING (real-Risk SETUP): the map starts EMPTY and the players
   PICK it, exactly like the tabletop.

   ARMY BUDGET (scaled by player count, classic-style — fewer players get
   more armies each so 2p and 6p both open dense enough to fight):
        2p 40 · 3p 35 · 4p 30 · 5p 25 · 6p 20  armies per player.
   These armies are spent in TWO setup steps and then normal play begins:

     1 CLAIM   with EVERY territory neutral, seats take turns (seat order)
               tapping one EMPTY territory to claim it, placing 1 army as
               they do (that army comes out of their budget). This continues
               round the table until no neutral territory is left. With 27
               territories the claims do not divide evenly, so some seats
               claim one more than others — the classic "odd map" opening.

     2 DEPLOY  each seat still has (budget − territoriesClaimed) armies left.
               Seats take turns placing ONE of those armies at a time on any
               territory they already OWN, until everyone's setup armies are
               spent (seats that finish early are skipped).

   Only then does REINFORCE → ATTACK → FORTIFY begin, seat 0 to move.

   Every step is a relayed, gated move (claim / deploy) that replays from the
   log — no shared PRNG, fully deterministic, identical on every client. */
function startingArmies(seats){
  const table = { 2:40, 3:35, 4:30, 5:25, 6:20 };
  return table[seats] || 30;
}

/* set up the EMPTY board and open the CLAIM phase. Nothing is owned; each
   seat carries its full army budget in setupLeft; seat 0 claims first. */
function beginSetup(st){
  const seats = st.seats;
  for (let t = 0; t < N_TERR; t++){ st.owner[t] = UNOWNED; st.army[t] = 0; }
  const per = startingArmies(seats);
  st.setupLeft = new Array(seats).fill(per);
  st.phase = PH_CLAIM;
  st.turn = 0;
  st.rollCtr = 1;
}

/* how many neutral (unowned) territories remain */
function neutralCount(st){ let n = 0; for (let t = 0; t < N_TERR; t++) if (st.owner[t] === UNOWNED) n++; return n; }
/* total setup armies still to be placed across all seats */
function setupArmiesLeft(st){ let n = 0; if (st.setupLeft) for (let s = 0; s < st.seats; s++) n += st.setupLeft[s]; return n; }
/* is the game still in its opening (claim or deploy)? */
function inSetup(st){ return st.phase === PH_CLAIM || st.phase === PH_DEPLOY; }

/* advance the setup turn: from `seat`, hand to the next seat that still has
   a legal setup action; flip claim→deploy when the map fills; end setup when
   all budgets are spent. */
function advanceSetup(st){
  if (st.phase === PH_CLAIM){
    if (neutralCount(st) === 0){
      /* map is full — move to DEPLOY (or straight to play if nobody has
         armies left, which cannot happen with these budgets but is safe). */
      st.phase = PH_DEPLOY;
    }
  }
  if (st.phase === PH_CLAIM){
    /* next seat in order that still has budget to claim (all do until the
       map fills). Everyone alive has budget ≥1 during claim. */
    for (let i = 1; i <= st.seats; i++){
      const s = (st.turn + i) % st.seats;
      if (st.setupLeft[s] > 0){ st.turn = s; return; }
    }
    /* no one has budget — jump to deploy/end */
    st.phase = PH_DEPLOY;
  }
  if (st.phase === PH_DEPLOY){
    if (setupArmiesLeft(st) === 0){ endSetup(st); return; }
    for (let i = 1; i <= st.seats; i++){
      const s = (st.turn + i) % st.seats;
      if (st.setupLeft[s] > 0){ st.turn = s; return; }
    }
    /* current seat is the only one with armies left — keep it */
    if (st.setupLeft[st.turn] > 0) return;
    endSetup(st);
  }
}

/* close the opening and start normal play: seat 0, reinforce. */
function endSetup(st){
  st.phase = PH_REINFORCE;
  st.turn = 0;
  st.round = 1;
  st.turnsThisRound = 0;
  st.setupLeft = null;
  st.reinf = reinforcementsFor(st, st.turn);
}
/* a full 32-bit deterministic draw */
function rollBig(seed, counter){
  let x = mix32(((seed >>> 0) ^ Math.imul((counter >>> 0), 0x85ebca77)) >>> 0);
  return x >>> 0;
}

function newGame(opts, seed){
  opts = opts || {};
  const seats = Math.max(MIN_SEATS, Math.min(MAX_SEATS, opts.seats | 0 || 3));
  const st = {
    v: 1,
    seats,
    n: N_TERR,
    owner: new Array(N_TERR).fill(UNOWNED),
    army:  new Array(N_TERR).fill(0),
    turn: 0,                       /* seat to move                          */
    phase: PH_CLAIM,               /* the opening starts in the CLAIM phase */
    setupLeft: null,               /* per-seat setup armies left (opening)  */
    reinf: 0,                      /* reinforcements left to place this turn */
    fortified: false,              /* fortify spent this turn?              */
    lvl: Math.max(1, Math.min(3, opts.lvl | 0 || 2)),
    aiJitter: opts.aiJitter === false ? false : true,
    turnCap: opts.turnCap | 0 || DEFAULT_TURN_CAP,
    seed: (seed == null ? 0 : (seed >>> 0)),
    rollCtr: 1,                    /* monotonic; drives deterministic dice  */
    round: 1,                      /* full rounds elapsed (safety cap)      */
    turnsThisRound: 0,
    alive: new Array(seats).fill(true),
    elimOrder: [],                 /* seats in the order they were knocked out */
    /* the ending: { kind:'over', winner, ranking:[seat,…] } | null        */
    done: null,
    /* the last combat, for the UI's dice + arrow animation:
       { from, to, seat, defSeat, atkDice:[…], defDice:[…], atkLoss, defLoss,
         captured:bool, movedIn } | null                                    */
    lastBattle: null,
    last: null                     /* { t, … } the most recent applied move */
  };
  beginSetup(st);                  /* EMPTY board → the CLAIM phase opens   */
  return st;
}

/* ═══════════════════════════════════════════════════════════════════
   READING THE BOARD
   ═══════════════════════════════════════════════════════════════════ */
function territoriesOf(st, seat){
  const out = [];
  for (let t = 0; t < N_TERR; t++) if (st.owner[t] === seat) out.push(t);
  return out;
}
function countTerr(st, seat){ let n = 0; for (let t = 0; t < N_TERR; t++) if (st.owner[t] === seat) n++; return n; }
function countArmies(st, seat){ let n = 0; for (let t = 0; t < N_TERR; t++) if (st.owner[t] === seat) n += st.army[t]; return n; }
function ownsRegion(st, seat, regionId){
  const mem = REGION_MEMBERS[regionId] || [];
  for (const t of mem) if (st.owner[t] !== seat) return false;
  return mem.length > 0;
}
function regionsOwned(st, seat){
  const out = [];
  for (const r of REGIONS) if (ownsRegion(st, seat, r.id)) out.push(r.id);
  return out;
}

/* reinforcements a seat receives at the start of its REINFORCE phase:
   max(3, floor(territories/3)) + Σ bonus of every fully-owned region. */
function reinforcementsFor(st, seat){
  const t = countTerr(st, seat);
  let base = Math.max(3, Math.floor(t / 3));
  for (const r of REGIONS) if (ownsRegion(st, seat, r.id)) base += r.bonus;
  return base;
}

/* a seat's territories that can ATTACK (own, >1 army, border an enemy) */
function attackSources(st, seat){
  const out = [];
  for (let t = 0; t < N_TERR; t++){
    if (st.owner[t] !== seat || st.army[t] < 2) continue;
    for (const v of adjOf(t)) if (st.owner[v] !== seat){ out.push(t); break; }
  }
  return out;
}
/* the enemy neighbours a source can attack */
function attackTargets(st, src){
  const seat = st.owner[src];
  const out = [];
  for (const v of adjOf(src)) if (st.owner[v] !== seat) out.push(v);
  return out;
}
/* is there any legal attack for `seat` right now? */
function canAttack(st, seat){ return attackSources(st, seat).length > 0; }

/* max attacker dice for a source: min(3, army-1) */
function maxAtkDice(army){ return Math.max(0, Math.min(3, army - 1)); }
/* defender dice: min(2, army) */
function maxDefDice(army){ return Math.min(2, army); }

/* ── FORTIFY reachability: is `to` reachable from `from` through a chain
   of the SAME seat's territories (connected-path fortify)? BFS over own
   territories. */
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
/* does `seat` have ANY legal fortify move? (a source with >1 army that can
   reach another own territory) */
function canFortify(st, seat){
  if (st.fortified) return false;
  for (let t = 0; t < N_TERR; t++){
    if (st.owner[t] !== seat || st.army[t] < 2) continue;
    /* any own neighbour reachable means a fortify exists */
    const seen = new Array(N_TERR).fill(false);
    const q = [t]; seen[t] = true; let found = false;
    while (q.length && !found){
      const u = q.pop();
      for (const v of adjOf(u)){
        if (st.owner[v] !== seat || seen[v]) continue;
        found = true; break;
      }
    }
    if (found) return true;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   THE MOVE VOCABULARY  (all flat, for the wire)
     { t:'place',   to, n }             REINFORCE: put n armies on `to`
     { t:'attack',  from, to }          ATTACK: one dice exchange
     { t:'advance', n }                 after a capture: move n armies in
     { t:'fortify', from, to, n }       FORTIFY: move n armies
     { t:'endphase' }                   leave the current phase
     { t:'endturn' }                    end the whole turn (skips fortify)
   `advance` is a distinct move so a capture that requires a player choice
   (how many to move in, ≥ dice rolled) replays deterministically online.
   When no choice is needed the UI may send it immediately; the engine
   still gates the minimum.
   ═══════════════════════════════════════════════════════════════════ */

/* whose move it is; -1 when the game is over */
function turn(st){ return st.done ? -1 : st.turn; }
function phase(st){ return st.done ? -1 : st.phase; }

/* is the state mid-capture, waiting for an advance choice? */
function pendingAdvance(st){ return st._pending || null; }

/* ═══════════════════════════════════════════════════════════════════
   THE GATE — check(st, mv, seat). Every move passes here and nowhere
   else. Returns true iff legal for `seat` right now.
   ═══════════════════════════════════════════════════════════════════ */
function check(st, mv, seat){
  if (!mv || st.done) return false;
  if (seat !== st.turn) return false;
  const t = mv.t;
  /* ── THE OPENING: only claim (CLAIM phase) / deploy (DEPLOY phase) ── */
  if (st.phase === PH_CLAIM){
    if (t !== 'claim') return false;
    const to = mv.to | 0;
    if (to < 0 || to >= N_TERR) return false;
    if (st.owner[to] !== UNOWNED) return false;          /* must be empty     */
    if (!st.setupLeft || st.setupLeft[seat] < 1) return false;
    return true;
  }
  if (st.phase === PH_DEPLOY){
    if (t !== 'deploy') return false;
    const to = mv.to | 0;
    if (to < 0 || to >= N_TERR) return false;
    if (st.owner[to] !== seat) return false;             /* must be your land */
    if (!st.setupLeft || st.setupLeft[seat] < 1) return false;
    return true;
  }
  /* claim/deploy are never legal once normal play has begun */
  if (t === 'claim' || t === 'deploy') return false;
  /* while a capture-advance is pending, ONLY an advance is legal */
  if (st._pending){
    if (t !== 'advance') return false;
    const n = mv.n | 0;
    const p = st._pending;
    return n >= p.min && n <= p.max;
  }
  if (t === 'place'){
    if (st.phase !== PH_REINFORCE) return false;
    const to = mv.to | 0, n = mv.n | 0;
    if (to < 0 || to >= N_TERR) return false;
    if (st.owner[to] !== seat) return false;
    if (n < 1 || n > st.reinf) return false;
    return true;
  }
  if (t === 'attack'){
    if (st.phase !== PH_ATTACK) return false;
    if (st.reinf > 0) return false;                 /* must place all first  */
    const from = mv.from | 0, to = mv.to | 0;
    if (from < 0 || from >= N_TERR || to < 0 || to >= N_TERR) return false;
    if (st.owner[from] !== seat) return false;
    if (st.owner[to] === seat) return false;
    if (st.army[from] < 2) return false;
    if (!areAdjacent(from, to)) return false;
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
    if (st.phase === PH_REINFORCE) return st.reinf === 0; /* can't skip placing */
    if (st.phase === PH_ATTACK) return true;
    return false;                                         /* fortify ends via endturn */
  }
  if (t === 'endturn'){
    /* only from ATTACK (skip fortify) or FORTIFY */
    if (st.phase === PH_REINFORCE) return false;
    return true;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   APPLY — the ONLY mutator. Deterministic; the log replays through here.
   ═══════════════════════════════════════════════════════════════════ */
function apply(st, mv){
  if (st.done) return;
  const seat = st.turn;
  const t = mv.t;

  if (t === 'claim'){
    const to = mv.to | 0;
    st.owner[to] = seat;
    st.army[to] = 1;
    st.setupLeft[seat] -= 1;
    st.last = { t:'claim', to, seat };
    advanceSetup(st);
    return;
  }

  if (t === 'deploy'){
    const to = mv.to | 0;
    st.army[to] += 1;
    st.setupLeft[seat] -= 1;
    st.last = { t:'deploy', to, seat };
    advanceSetup(st);
    return;
  }

  if (t === 'place'){
    const to = mv.to | 0, n = mv.n | 0;
    st.army[to] += n;
    st.reinf -= n;
    st.last = { t, to, n, seat };
    if (st.reinf === 0){ st.phase = PH_ATTACK; }
    return;
  }

  if (t === 'attack'){
    resolveAttack(st, mv.from | 0, mv.to | 0);
    return;
  }

  if (t === 'advance'){
    const p = st._pending;
    if (!p) return;
    const n = Math.max(p.min, Math.min(p.max, mv.n | 0));
    st.army[p.from] -= n;
    st.army[p.to]   += n;
    st._pending = null;
    st.last = { t, from:p.from, to:p.to, n, seat };
    /* the capture may have eliminated a player / ended the game */
    postCapture(st, seat, p.to);
    return;
  }

  if (t === 'fortify'){
    const from = mv.from | 0, to = mv.to | 0, n = mv.n | 0;
    st.army[from] -= n;
    st.army[to]   += n;
    st.fortified = true;
    st.last = { t, from, to, n, seat };
    endTurn(st);
    return;
  }

  if (t === 'endphase'){
    if (st.phase === PH_REINFORCE && st.reinf === 0){ st.phase = PH_ATTACK; st.last = { t:'endphase', seat }; return; }
    if (st.phase === PH_ATTACK){ st.phase = PH_FORTIFY; st.last = { t:'endphase', seat };
      /* auto-advance a phase with no legal action */
      if (!canFortify(st, seat)) endTurn(st);
      return; }
    return;
  }

  if (t === 'endturn'){
    st.last = { t:'endturn', seat };
    endTurn(st);
    return;
  }
}

/* ── one dice exchange ──────────────────────────────────────────────── */
function resolveAttack(st, from, to){
  const seat = st.owner[from];
  const defSeat = st.owner[to];
  const nAtk = maxAtkDice(st.army[from]);          /* 1..3                  */
  const nDef = maxDefDice(st.army[to]);            /* 1..2                  */
  const atk = [], def = [];
  for (let i = 0; i < nAtk; i++) atk.push(rollDie(st.seed, st.rollCtr++));
  for (let i = 0; i < nDef; i++) def.push(rollDie(st.seed, st.rollCtr++));
  atk.sort((a,b)=>b-a); def.sort((a,b)=>b-a);
  const cmp = Math.min(atk.length, def.length);
  let atkLoss = 0, defLoss = 0;
  for (let i = 0; i < cmp; i++){
    if (atk[i] > def[i]) defLoss++;                /* attacker wins strictly */
    else atkLoss++;                                /* tie goes to defender   */
  }
  st.army[from] -= atkLoss;
  st.army[to]   -= defLoss;

  let captured = false;
  if (st.army[to] <= 0){
    captured = true;
    st.army[to] = 0;
    /* CAPTURE: ownership flips; the attacker must move in ≥ nAtk armies
       (but leaving ≥1 behind on the source). Because we needed ≥2 to
       attack and just spent atkLoss, the source has army[from] ≥ 1. The
       max we can move is army[from]-1; the min is nAtk, clamped to that
       max. If the max is < nAtk (can happen after heavy losses) we move
       the max, which is ≥1. */
    st.owner[to] = seat;
    const maxMove = Math.max(1, st.army[from] - 1);
    const minMove = Math.min(nAtk, maxMove);
    st._pending = { from, to, min: minMove, max: maxMove, nAtk };
  }
  st.lastBattle = { from, to, seat, defSeat, atkDice: atk.slice(), defDice: def.slice(),
                    atkLoss, defLoss, captured };
  st.last = { t:'attack', from, to, seat, atkLoss, defLoss, captured };
  /* if not captured, nothing else to do — attacker may attack again or end.
     if captured, the advance move (auto or chosen) finishes it. */
}

/* after an advance completes a capture: check for an eliminated defender
   and the win condition. */
function postCapture(st, seat, capturedTerr){
  const defSeat = st.lastBattle ? st.lastBattle.defSeat : -1;
  if (defSeat >= 0 && st.alive[defSeat] && countTerr(st, defSeat) === 0){
    st.alive[defSeat] = false;
    st.elimOrder.push(defSeat);
    st.last = { t:'attack', from: st.lastBattle.from, to: capturedTerr, seat,
                atkLoss: st.lastBattle.atkLoss, defLoss: st.lastBattle.defLoss,
                captured:true, eliminated: defSeat };
  }
  checkWin(st);
}

/* end the whole game if only one seat remains alive */
function checkWin(st){
  let aliveCount = 0, lastAlive = -1;
  for (let s = 0; s < st.seats; s++) if (st.alive[s]){ aliveCount++; lastAlive = s; }
  if (aliveCount <= 1){ finishGame(st, lastAlive); return true; }
  return false;
}

/* the ranking on game end: winner first, then survivors by territory then
   armies, then the eliminated in REVERSE elimination order (last out ranks
   above first out). */
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
  /* eliminated: last knocked out ranks higher */
  for (let i = st.elimOrder.length - 1; i >= 0; i--) ranking.push(st.elimOrder[i]);
  st.done = { kind:'over', winner: winner >= 0 ? winner : (ranking[0] != null ? ranking[0] : -1), ranking, capped: st._capped || false };
}

/* END TURN — advance to the next living seat, reset its phase, hand it its
   reinforcements. Enforces the turn-cap. */
function endTurn(st){
  if (st.done) return;
  st.fortified = false;
  st._pending = null;
  st.turnsThisRound++;
  /* find the next living seat after the current one */
  let next = -1;
  for (let i = 1; i <= st.seats; i++){
    const s = (st.turn + i) % st.seats;
    if (st.alive[s]){ next = s; break; }
  }
  if (next < 0){ checkWin(st); return; }
  /* a new round when we wrap past the highest living seat back to the
     lowest — simplest robust rule: when next <= turn (wrapped). */
  if (next <= st.turn){
    st.round++;
    st.turnsThisRound = 0;
    if (st.round > st.turnCap){
      /* safety cap: rank survivors, end the game. Winner = strongest. */
      st._capped = true;
      /* pick the strongest living seat as "winner" for the header */
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
  st.reinf = reinforcementsFor(st, next);
  st.fortified = false;
  /* a fresh reinforce phase always has a legal action (you always own ≥1
     territory if alive), so no auto-advance is needed here. */
}

/* ═══════════════════════════════════════════════════════════════════
   OVER — the verdict, read straight off st.done.
   ═══════════════════════════════════════════════════════════════════ */
function over(st){
  if (!st.done) return null;
  return {
    kind: st.done.kind,
    winner: st.done.winner,
    ranking: (st.done.ranking || []).slice(),
    capped: !!st.done.capped
  };
}

/* a one-line status the UI can translate ({en,mt} ids, never a bare
   English string — js/lang.js rule). */
function note(st){
  if (st.done){
    if (st.done.capped) return { en: 'The turn limit was reached.', mt: 'Intlaħaq il-limitu tad-dawriet.' };
    return { en: 'The map is conquered.', mt: 'Il-mappa ġiet mirbuħa.' };
  }
  if (st.phase === PH_CLAIM)     return { en: 'Claim a territory.', mt: 'Ħu territorju.' };
  if (st.phase === PH_DEPLOY)    return { en: 'Place your armies.', mt: 'Poġġi l-armati tiegħek.' };
  if (st.phase === PH_REINFORCE) return { en: 'Place your armies.', mt: 'Poġġi l-armati tiegħek.' };
  if (st.phase === PH_ATTACK)    return { en: 'Attack, or move on.', mt: 'Attakka, jew kompli.' };
  return { en: 'Move armies, or end your turn.', mt: 'Ċaqlaq l-armati, jew temmu d-dawra.' };
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — three sharpnesses, real conquest strategy, PURE and
   deterministic. Each level is a policy over the three phases:

     lvl 1  Greedy militia. Reinforce the single strongest border pile;
            attack the weakest reachable enemy whenever army-1 ≥ 2; no
            odds check beyond "I outnumber you"; fortify toward the front
            crudely.
     lvl 2  Captain. Reinforce threatened borders and toward a region it
            can complete; attack only when the WIN ODDS favour it
            (precomputed single-exchange win probability ≥ 0.55, and only
            when it will not strip a border bare); take a region when a
            cheap capture completes it; fortify from a safe interior to
            the most-threatened border.
     lvl 3  General. The Captain, plus: a light ONE-CAPTURE lookahead that
            prefers moves finishing a region bonus or eliminating a player;
            attacks are ordered by expected army-swing; it presses a chain
            of favourable captures in one phase (bounded) but stops the
            moment the next fight is unfavourable, so it never overextends.

   think(st, seat, lvl) returns the NEXT single move for `seat` (place /
   attack / advance / fortify / endphase / endturn), or null if it is not
   this seat's turn / the game is over. The UI calls it repeatedly until it
   returns an endturn (or the turn passes). Every returned move is legal by
   construction and re-gated by check(); an attack loop is bounded so no AI
   turn can spin forever (proven by the harness).
   ═══════════════════════════════════════════════════════════════════ */

/* single-exchange win-probability table P[atkDice][defDice] that the
   ATTACKER loses NO armies (a rough "this exchange goes my way") — used as
   a cheap odds gate. Values are the standard Risk single-roll defender-loss
   expectations; we key on "attacker inflicts ≥ defender" as a proxy. To
   keep the engine self-contained and exact we compute the odds by full
   enumeration once and memoise. */
const ODDS_CACHE = {};
function attackOdds(nAtk, nDef){
  /* returns { pAtkGood } = probability the attacker's net army change this
     single exchange is ≥ 0 (loses no more than the defender). Full
     enumeration over 6^(nAtk+nDef). Cheap and exact; memoised. */
  const key = nAtk + 'x' + nDef;
  if (ODDS_CACHE[key]) return ODDS_CACHE[key];
  let good = 0, total = 0, sumDef = 0, sumAtk = 0;
  const atk = new Array(nAtk).fill(1), def = new Array(nDef).fill(1);
  function faces(arr, i, cb){
    if (i === arr.length){ cb(); return; }
    for (let v = 1; v <= 6; v++){ arr[i] = v; faces(arr, i + 1, cb); }
  }
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

/* a per-seat deterministic coin from the state (no shared PRNG) */
function aiCoin(st, seat, salt){
  return hash32([st.seed, st.rollCtr, seat, salt, st.round].concat(st.owner).concat(st.army));
}

/* border pressure on a territory t owned by `seat`: total enemy armies on
   adjacent enemy cells (how hard it is to hold). */
function borderPressure(st, seat, t){
  let p = 0;
  for (const v of adjOf(t)) if (st.owner[v] !== seat) p += st.army[v];
  return p;
}
/* is t a frontier (borders an enemy)? */
function isFrontier(st, seat, t){
  for (const v of adjOf(t)) if (st.owner[v] !== seat) return true;
  return false;
}

/* which region (if any) `seat` is one capture away from completing, and a
   specific (src,target) that would take a needed territory. Returns
   {region, from, to} or null. */
function regionOpportunity(st, seat){
  for (const r of REGIONS){
    const mem = REGION_MEMBERS[r.id];
    let missing = [];
    for (const t of mem) if (st.owner[t] !== seat) missing.push(t);
    if (missing.length !== 1) continue;             /* only "one away"       */
    const need = missing[0];
    /* find one of my adjacent territories with an army to spare */
    let best = -1, bestArmy = 1;
    for (const v of adjOf(need)) if (st.owner[v] === seat && st.army[v] > bestArmy){ best = v; bestArmy = st.army[v]; }
    if (best >= 0) return { region: r.id, from: best, to: need, bonus: r.bonus };
  }
  return null;
}

/* ── OPENING STRATEGY (deterministic, no shared PRNG) ────────────────────
   CLAIM: score every empty territory and take the best. The machine grabs
   toward COMPLETING regions and building a solid block:
     · a big pull toward regions it is already invested in (finish the bonus);
     · prefer smaller regions (easier to complete outright);
     · prefer cells adjacent to land it already owns (a connected front);
     · a mild pull to deny a region a rival is close to completing;
     · a per-seat STATE HASH breaks exact ties — pure, reproducible, and not
       a shared PRNG a human could read ahead.
   All three levels use this same sensible opening (the sharpness differences
   are in the war, not the deal); it never stalls (there is always an empty
   cell while in CLAIM). */
function thinkClaim(st, seat, lvl){
  let best = -1, bestScore = -Infinity;
  for (let t = 0; t < N_TERR; t++){
    if (st.owner[t] !== UNOWNED) continue;
    const rid = TERRITORIES[t].region;
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
    /* finish what we started: the more of this region we hold, the better,
       and small regions (2–3 cells) are worth chasing to completion. */
    score += mine * 30;
    score += (6 - mem.length) * 6;                 /* smaller region = easier */
    /* a connected front: reward adjacency to our own land */
    let adjMine = 0, adjRival = 0;
    for (const v of adjOf(t)){
      if (st.owner[v] === seat) adjMine++;
      else if (st.owner[v] !== UNOWNED) adjRival++;
    }
    score += adjMine * 10;
    /* deny a rival that is close to owning this region */
    score += rivalMax * 8;
    /* don't wade into a cell hemmed by rivals with no own support */
    score -= (adjMine === 0 ? adjRival * 3 : 0);
    /* deterministic tie-break: per-seat hash of the state + the cell */
    score += (hash32([st.seed, seat, t, st.round, mine, neutral].concat(st.owner)) % 100) / 100;
    if (score > bestScore){ bestScore = score; best = t; }
  }
  if (best < 0){
    /* safety: no scored pick (shouldn't happen while empties exist) — take
       the first empty so the AI never stalls. */
    for (let t = 0; t < N_TERR; t++) if (st.owner[t] === UNOWNED){ best = t; break; }
  }
  return best >= 0 ? { t:'claim', to: best } : null;
}

/* DEPLOY: drop the setup army where it matters most — reinforce the most
   threatened frontier (border pressure minus own strength), preferring a
   cell that helps hold a region we own. Deterministic tie-break by hash. */
function thinkDeploy(st, seat, lvl){
  let best = -1, bestScore = -Infinity;
  for (let t = 0; t < N_TERR; t++){
    if (st.owner[t] !== seat) continue;
    let score = 0;
    if (isFrontier(st, seat, t)) score += 20 + borderPressure(st, seat, t) - st.army[t] * 2;
    else score -= st.army[t];                       /* interior: only if no front */
    /* keep whole regions strong */
    if (ownsRegion(st, seat, TERRITORIES[t].region)) score += 4;
    score += (hash32([st.seed, seat, t, st.setupLeft ? st.setupLeft[seat] : 0].concat(st.army)) % 100) / 100;
    if (score > bestScore){ bestScore = score; best = t; }
  }
  if (best < 0){ for (let t = 0; t < N_TERR; t++) if (st.owner[t] === seat){ best = t; break; } }
  return best >= 0 ? { t:'deploy', to: best } : null;
}

function think(st, seat, lvl){
  if (st.done || seat !== st.turn) return null;
  lvl = Math.max(1, Math.min(3, lvl || st.lvl || 2));

  /* ── THE OPENING ── the machine picks and deploys too. */
  if (st.phase === PH_CLAIM)  return thinkClaim(st, seat, lvl);
  if (st.phase === PH_DEPLOY) return thinkDeploy(st, seat, lvl);

  /* a pending capture-advance is answered first, always. */
  if (st._pending){
    const p = st._pending;
    /* move in a healthy garrison: most of the source if the captured cell
       is itself a frontier (it needs to hold / push on), else the minimum
       to keep the source strong. The General pushes harder (0.7) to sustain
       an attacking chain; the Captain a touch less (0.55); the militia the
       minimum, leaving thin captured cells behind. */
    const frontierTo = isFrontier(st, seat, p.to);
    const frac = lvl >= 3 ? 0.62 : lvl === 2 ? 0.55 : 0.4;
    let n = frontierTo ? Math.min(p.max, Math.max(p.min, Math.ceil(p.max * frac)))
                       : p.min;
    n = Math.max(p.min, Math.min(p.max, n));
    return { t:'advance', n };
  }

  if (st.phase === PH_REINFORCE) return thinkReinforce(st, seat, lvl);
  if (st.phase === PH_ATTACK)    return thinkAttack(st, seat, lvl);
  return thinkFortify(st, seat, lvl);
}

function thinkReinforce(st, seat, lvl){
  if (st.reinf <= 0) return { t:'endphase' };
  const mine = territoriesOf(st, seat);
  if (!mine.length) return { t:'endphase' };        /* shouldn't happen alive */

  /* lvl 1 MILITIA: spreads its reinforcements THIN — it dumps them on
     whichever frontier cell it happens to pick by a per-seat hash, one
     lump, without weighing the threat. Sometimes that is a border already
     safe while a weak one is left exposed. Cheap and careless on purpose. */
  if (lvl === 1){
    const front = mine.filter(t => isFrontier(st, seat, t));
    const list = front.length ? front : mine;
    const h = hash32([st.seed, st.rollCtr, seat, st.round]) % list.length;
    return { t:'place', to: list[h], n: st.reinf };
  }

  /* lvl 2/3: prefer completing/holding a region, else the most-threatened
     frontier. Place in one lump on the chosen cell (fewer moves, same
     result; online replays it identically). */
  const opp = (lvl >= 2) ? regionOpportunity(st, seat) : null;
  if (opp && st.owner[opp.from] === seat){
    /* stack the attacker cell that will take the region */
    return { t:'place', to: opp.from, n: st.reinf };
  }
  /* score frontiers by pressure minus own strength; reinforce the worst. */
  let best = -1, bestScore = -1e9;
  for (const t of mine){
    if (!isFrontier(st, seat, t)) continue;
    const score = borderPressure(st, seat, t) - st.army[t];
    if (score > bestScore){ bestScore = score; best = t; }
  }
  if (best < 0){
    /* no frontier at all (rare) — reinforce a cell adjacent to the front,
       else the biggest pile. */
    best = mine[0];
    for (const t of mine) if (st.army[t] > st.army[best]) best = t;
  }
  return { t:'place', to: best, n: st.reinf };
}

/* ── a POSITIONAL evaluator for the General's one-ply lookahead ───────
   Scores the board from `seat`'s view: territories held, army count,
   progress toward each region (a strong pull to finish the bonus), and a
   penalty for exposed thin borders. Pure and cheap. Higher is better. */
function evalPosition(st, seat){
  const myT = countTerr(st, seat), myA = countArmies(st, seat);
  let score = myT * 10 + myA * 1.0;
  /* region progress: reward being close to owning a whole region, and the
     bonus itself heavily once complete. */
  for (const r of REGIONS){
    const mem = REGION_MEMBERS[r.id];
    let mine = 0; for (const t of mem) if (st.owner[t] === seat) mine++;
    if (mine === mem.length) score += r.bonus * 12;         /* own the bonus */
    else score += (mine / mem.length) * r.bonus * 4;        /* progress pull */
  }
  /* thin-border penalty: a frontier cell with 1 army is a liability */
  for (let t = 0; t < N_TERR; t++){
    if (st.owner[t] !== seat) continue;
    if (st.army[t] <= 1 && isFrontier(st, seat, t)) score -= 4;
  }
  /* strongest rival's territory count drags us down (relative race) */
  let rivalT = 0;
  for (let s = 0; s < st.seats; s++) if (s !== seat && countTerr(st, s) > rivalT) rivalT = countTerr(st, s);
  score -= rivalT * 3;
  return score;
}
/* project the EXPECTED board after an attack candidate resolves the
   favourable way (attacker wins, captures if defender would fall) and
   score it. Non-destructive: we snapshot and restore owner/army. */
function projectAttackScore(st, seat, c){
  const fromA = st.army[c.from], toA = st.army[c.to], toO = st.owner[c.to];
  /* expected losses this single exchange (rounded) */
  const od = attackOdds(c.nAtk, c.nDef);
  const eAtk = Math.round(od.eAtk), eDef = Math.round(od.eDef);
  st.army[c.from] = Math.max(1, fromA - eAtk);
  let capd = false;
  if (toA - eDef <= 0){
    capd = true;
    st.owner[c.to] = seat;
    const moveIn = Math.min(Math.max(1, st.army[c.from] - 1), Math.max(c.nAtk, 2));
    st.army[c.from] -= moveIn;
    st.army[c.to] = moveIn;
  } else {
    st.army[c.to] = toA - eDef;
  }
  const s = evalPosition(st, seat) + (capd ? 6 : 0);
  /* restore */
  st.army[c.from] = fromA; st.army[c.to] = toA; st.owner[c.to] = toO;
  return s;
}

function thinkAttack(st, seat, lvl){
  const srcs = attackSources(st, seat);
  if (!srcs.length) return { t:'endphase' };

  /* enumerate candidate (from,to) attacks with their odds. */
  const cands = [];
  for (const from of srcs){
    const nAtk = maxAtkDice(st.army[from]);
    for (const to of attackTargets(st, from)){
      const nDef = maxDefDice(st.army[to]);
      const od = attackOdds(nAtk, nDef);
      const completesRegion = completesRegionIfTaken(st, seat, to);
      const eliminates = wouldEliminate(st, seat, to);
      cands.push({ from, to, nAtk, nDef, odds: od.pAtkGood, swing: od.eDef - od.eAtk,
                   completesRegion, eliminates, defArmy: st.army[to], srcArmy: st.army[from] });
    }
  }
  if (!cands.length) return { t:'endphase' };

  if (lvl === 1){
    /* MILITIA — reckless. It attacks from any pile of ≥3 armies (2+ dice)
       at the weakest neighbour, WITHOUT checking whether it truly has the
       edge: it will throw itself at even fights and sometimes lose the
       war of attrition. It keeps swinging while any 3+ pile borders an
       enemy, so it expands fast but bleeds armies on bad fights and leaves
       thin borders behind. That recklessness is what the Captain punishes. */
    let pick = null;
    for (const c of cands){
      if (c.srcArmy < 3) continue;                 /* wants 2 dice, but no odds sense */
      if (!pick || c.defArmy < pick.defArmy ||
          (c.defArmy === pick.defArmy && c.srcArmy > pick.srcArmy)) pick = c;
    }
    if (!pick){
      /* fall back to any legal attack so it does not stall */
      for (const c of cands){ if (!pick || c.defArmy < pick.defArmy) pick = c; }
    }
    if (!pick) return { t:'endphase' };
    return { t:'attack', from: pick.from, to: pick.to };
  }

  /* CAPTAIN / GENERAL — aggressive but disciplined. It attacks EVERY fight
     it is likely to win, prioritising captures that complete a region or
     eliminate a rival; it declines only genuinely unfavourable fights and
     refuses to strip a border it needs to hold. Because it keeps taking
     good fights (it does not stop early) AND banks region bonuses, it
     out-expands the militia without the attrition losses. */
  const REGION_HUNT = lvl >= 3;                    /* general presses harder */
  let pool = cands.filter(c => {
    if (c.eliminates) return c.odds >= 0.30;        /* almost always worth it */
    if (c.completesRegion) return c.odds >= 0.42;   /* a region bonus is huge  */
    /* an ordinary fight: take it when odds favour us. The Captain's bar is
       0.50 (a fair-or-better fight); the General is a touch bolder at 0.47
       because it presses chains and lookahead covers the risk. */
    const bar = REGION_HUNT ? 0.47 : 0.50;
    if (c.odds < bar) return false;
    /* keep enough behind: never attack from a pile that a neighbour could
       overrun next turn unless we clearly dominate this target */
    if (borderPressure(st, seat, c.from) > st.army[c.from] + 2 && c.srcArmy <= c.defArmy + 2) return false;
    return true;
  });
  if (!pool.length) return { t:'endphase' };

  if (REGION_HUNT){
    /* GENERAL — a one-ply POSITIONAL lookahead. Each favourable candidate is
       scored by the projected board AFTER it resolves the expected way
       (territories, region progress, army safety, rival pressure), so the
       General prefers the capture that most advances a region or removes a
       rival — not merely the best local odds. This deeper read is what puts
       it above the Captain. */
    const now = evalPosition(st, seat);
    let best = null, bestScore = -Infinity;
    for (const c of pool){
      let s = projectAttackScore(st, seat, c);
      if (c.eliminates) s += 1000;               /* winning the war dominates */
      if (c.completesRegion) s += 60;
      s += c.odds * 8;                            /* break ties toward safety  */
      if (s > bestScore){ bestScore = s; best = c; }
    }
    /* anti-overextension: if the best available fight is EXPECTED to leave
       the General worse off than standing pat (and it is not an
       elimination/region grab), it stops attacking and keeps its armies
       rather than bleeding into a reckless counter. */
    if (best && !best.eliminates && !best.completesRegion && bestScore < now - 2){
      return { t:'endphase' };
    }
    return { t:'attack', from: best.from, to: best.to };
  }

  /* CAPTAIN — local ranking only: eliminations, region completions, odds,
     then the biggest local army advantage. Solid, but it does not read the
     projected position the way the General does, so it takes a good fight
     when a slightly better one was one square over. */
  pool.sort((a,b) => {
    if (a.eliminates !== b.eliminates) return a.eliminates ? -1 : 1;
    if (a.completesRegion !== b.completesRegion) return a.completesRegion ? -1 : 1;
    if (Math.abs(b.odds - a.odds) > 0.03) return b.odds - a.odds;
    return (b.srcArmy - b.defArmy) - (a.srcArmy - a.defArmy);
  });
  const pick = pool[0];
  return { t:'attack', from: pick.from, to: pick.to };
}

/* would taking `to` complete a region for `seat`? */
function completesRegionIfTaken(st, seat, to){
  const rid = TERRITORIES[to].region;
  const mem = REGION_MEMBERS[rid];
  for (const t of mem){ if (t === to) continue; if (st.owner[t] !== seat) return false; }
  return true;
}
/* would taking `to` eliminate its owner (it is their last territory)? */
function wouldEliminate(st, seat, to){
  const o = st.owner[to];
  if (o === seat || o < 0) return false;
  return countTerr(st, o) === 1;
}

function thinkFortify(st, seat, lvl){
  if (st.fortified || !canFortify(st, seat)) return { t:'endturn' };
  /* move armies from the safest interior pile with a surplus to the most
     threatened reachable frontier. lvl 1 does a crude version. */
  const mine = territoriesOf(st, seat);
  /* candidate sources: own cells with >1 army */
  let bestFrom = -1, bestTo = -1, bestGain = 0, bestN = 0;
  for (const from of mine){
    if (st.army[from] < 2) continue;
    const surplus = isFrontier(st, seat, from)
      ? st.army[from] - 1 - borderPressure(st, seat, from)   /* keep enough to hold */
      : st.army[from] - 1;                                    /* interior: move all but one */
    if (surplus < 1) continue;
    /* find the most threatened reachable frontier target */
    const reach = reachableOwn(st, seat, from);
    for (const to of reach){
      if (to === from) continue;
      if (!isFrontier(st, seat, to)) continue;
      const need = borderPressure(st, seat, to) - st.army[to];
      const gain = need;                                      /* how badly it needs help */
      if (gain > bestGain){
        bestGain = gain; bestFrom = from; bestTo = to;
        bestN = Math.min(surplus, st.army[from] - 1);
      }
    }
  }
  if (bestFrom < 0 || bestN < 1) return { t:'endturn' };
  return { t:'fortify', from: bestFrom, to: bestTo, n: bestN };
}
/* the set of own territories reachable from `from` through own chain */
function reachableOwn(st, seat, from){
  const seen = new Array(N_TERR).fill(false);
  const q = [from]; seen[from] = true; const out = [];
  while (q.length){
    const u = q.pop();
    for (const v of adjOf(u)){
      if (st.owner[v] !== seat || seen[v]) continue;
      seen[v] = true; out.push(v); q.push(v);
    }
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — flat fields for js/mp.js's generic codec. Every move type is
   a small object of ints; encWire/decWire validate shape and clamp ranges.
   The dice are NOT on the wire — they are recomputed from (seed, rollCtr)
   on every client, which is what makes the relay honest without trusting
   the roller.
   ═══════════════════════════════════════════════════════════════════ */
const WIRE_FIELDS = ['k','a','b','n'];   /* k=type code, a/b=cells, n=count */
const T_CODE = { place:1, attack:2, advance:3, fortify:4, endphase:5, endturn:6, claim:7, deploy:8 };
const CODE_T = { 1:'place', 2:'attack', 3:'advance', 4:'fortify', 5:'endphase', 6:'endturn', 7:'claim', 8:'deploy' };
function encWire(mv){
  if (!mv || !T_CODE[mv.t]) return null;
  const w = { k: T_CODE[mv.t] };
  if (mv.t === 'place'){ w.a = mv.to | 0; w.n = mv.n | 0; }
  else if (mv.t === 'attack'){ w.a = mv.from | 0; w.b = mv.to | 0; }
  else if (mv.t === 'advance'){ w.n = mv.n | 0; }
  else if (mv.t === 'fortify'){ w.a = mv.from | 0; w.b = mv.to | 0; w.n = mv.n | 0; }
  else if (mv.t === 'claim' || mv.t === 'deploy'){ w.a = mv.to | 0; }
  return w;
}
function decWire(w){
  if (!w) return null;
  const t = CODE_T[w.k | 0];
  if (!t) return null;
  if (t === 'place')   return { t, to: w.a | 0, n: w.n | 0 };
  if (t === 'attack')  return { t, from: w.a | 0, to: w.b | 0 };
  if (t === 'advance') return { t, n: w.n | 0 };
  if (t === 'fortify') return { t, from: w.a | 0, to: w.b | 0, n: w.n | 0 };
  if (t === 'claim')   return { t, to: w.a | 0 };
  if (t === 'deploy')  return { t, to: w.a | 0 };
  if (t === 'endphase')return { t };
  if (t === 'endturn') return { t };
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — js/konkwista-ui.js and the harness read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_KONKWISTA = root.KARTI_KONKWISTA || {};
root.KARTI_KONKWISTA.engine = {
  /* constants */
  MIN_SEATS, MAX_SEATS, UNOWNED, N_TERR, DEFAULT_TURN_CAP,
  PH_REINFORCE, PH_ATTACK, PH_FORTIFY, PH_CLAIM, PH_DEPLOY, PHASES,
  COLOURS, colourOf, LEVELS, levelOf,
  /* map */
  TERRITORIES, REGIONS, REGION_MEMBERS, ADJ, mapCheck,
  terrIndex, terrById, adjOf, areAdjacent, regionOf,
  /* rng */
  newSeed, rollDie, mix32, hash32,
  /* lifecycle */
  newGame, beginSetup,
  /* reading */
  turn, phase, over, note, pendingAdvance,
  inSetup, neutralCount, setupArmiesLeft, startingArmies,
  territoriesOf, countTerr, countArmies, ownsRegion, regionsOwned,
  reinforcementsFor, attackSources, attackTargets, canAttack, canFortify,
  fortifyReachable, maxAtkDice, maxDefDice, isFrontier, borderPressure,
  /* the gate + mutator */
  check, apply,
  /* the machine */
  think, attackOdds,
  /* the wire */
  encWire, decWire, WIRE_FIELDS
};

})(typeof window !== 'undefined' ? window : globalThis);
