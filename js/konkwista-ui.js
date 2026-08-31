/* ═══════════════════════════════════════════════════════════════════
   KARTI — konkwista-ui.js
   IL-KONKWISTA — the tappable conquest game on top of js/konkwista.js's
   pure engine (window.KARTI_KONKWISTA.engine). This file is the screen,
   the runner and the wire, and it follows js/erbgha-ui.js's shape
   deliberately: a match is (opts, seed, log), every move goes through one
   doMove() gate, and a rollback is cutting the log and replaying it.

   WHAT THIS FILE IS
     · the shelf tile and the MINIMAL entry menu — a themed hero, three
       big buttons (PLAY ONLINE / PLAY WITH AI / PASS THE PHONE) and a
       "How to play" that slides the rules up; players / difficulty /
       turn-cap live on a tiny SECOND step, never a settings wall on
       screen one;
     · the board: the ORIGINAL vector archipelago map drawn as ONE SVG
       (every territory a tappable <path>), army-count badges, a glowing
       highlight of the legal targets, an attack arrow and an animated
       DICE roll for combat, a colour-sweep on capture and a region
       flourish — all compositor-friendly, all reduced-motion aware;
     · the phase machine on screen: a big PHASE BANNER with a live
       reinforcement counter and a primary action button, so the player
       is never left wondering whose turn it is or what to tap;
     · the runner: log, seed, autosave (karti_konkwista_v1);
     · the online controller published on KARTI_PARTY.online.konkwista and
       the lobby contract on window.KARTI_KONKWISTA.lobby, both the exact
       shape js/mp.js reads (see js/erbgha-ui.js / js/ludu-ui.js).

   ONLINE IS HONEST BY CONSTRUCTION. Konkwista is perfect-information, and
   the combat dice are derived from the shared seed + a roll counter — no
   phone trusts the roller. So the online controller relays a flat move
   through encWire/decWire and the engine (the referee) gates it; every
   client recomputes the identical dice and reaches the identical board.
   A disconnected seat is CONTINUED BY THE AI so a table never deadlocks
   (documented on the controller below).

   HOUSE RULES OBEYED
     · borrows #scr-party through KARTI_PARTY, injects its own CSS once,
       never touches css/ or the tab bar's ancestors;
     · sounds only through KARTI_SFX ids that already exist (dice.roll for
       the roll, duel.hit/duel.destroy for losses/captures, piece.place
       for reinforcement drops, sea.horn for a region flourish, game.win
       for the finish) — never invents an id, never touches audio/;
     · every player-visible string is a T(en,mt) pair at its call site;
     · the back arrow goes BACK. It never asks "are you sure": the game is
       autosaved on every move and the menu offers it again at the top.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_KONKWISTA;
if (!K || !P || !R || !R.engine) return;

const E = R.engine;
const esc = (K && K.esc) || (s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');
const clone = o => JSON.parse(JSON.stringify(o));

/* ── the one language switch (js/lang.js) ────────────────────────── */
const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
const TE = pair => pair ? T(pair.en, pair.mt) : '';

/* ═══════════════════════════════════════════════════════════════════
   SEAT COLOURS — off the engine's COLOURS (ids match rebbieh borders).
   ═══════════════════════════════════════════════════════════════════ */
const COLOURS = E.COLOURS || [];
const colourOf = seat => E.colourOf(seat);
const seatColName = seat => TE(colourOf(seat).name);

/* ═══════════════════════════════════════════════════════════════════
   CONTINENT COLOURS — the LAND is filled by its CONTINENT so the six
   landmasses read as six colour families at a glance. Each territory takes
   a slightly different SHADE of its continent's colour (a deterministic
   ripple) so neighbouring lands within a continent are still tellable apart,
   while clearly sharing one family. Ownership is drawn on TOP as a seat-colour
   ring + a seat-tinted troop badge — so "which continent" (fill) and "who owns
   it" (ring/badge) never fight.
   ═══════════════════════════════════════════════════════════════════ */
function hexToRgb(h){ h = h.replace('#',''); if (h.length===3) h = h.split('').map(c=>c+c).join(''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function rgbToHex(r,g,b){ const f=v=>('0'+Math.max(0,Math.min(255,Math.round(v))).toString(16)).slice(-2); return '#'+f(r)+f(g)+f(b); }
function mix(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
function shade(hex, amt){ const c = hexToRgb(hex); const tgt = amt<0 ? [12,20,32] : [255,255,255]; return rgbToHex(...mix(c, tgt, Math.abs(amt))); }
/* ── CONT_HEX — the SCREEN's continent palette ─────────────────────────
   The engine ships a hex per continent, but a colour is a rendering
   decision, not a rule: nothing in js/konkwista.js reads it and no byte of
   it ever goes on the wire. So the palette is overridden HERE, and the
   engine's list stays the fallback for any continent this table forgets.

   WHY IT NEEDED OVERRIDING. Six continents means fifteen pairs, and in this
   game telling them apart is a MECHANIC: every turn you are judging how
   close you are to owning a whole one for its bonus. Under about deltaE 15
   (CIELAB) is a pair a player confuses at a glance. Measured from the
   source values through the real render chain — base hex -> the per-
   territory ripple shade -> the +0.28 paper lift -> konk-land.jpg
   multiplied at .28 — the shipped palette had one pair under the bar and
   it was under it badly:

     min deltaE over the 3x3 ripple shades of each pair, UNOWNED land with
     the paper (the CLAIM phase — every land is unowned and continent
     identity is the only thing you are choosing on):
                aurora  solmar  vantia  kessia norlund meridia
       aurora        -    41.3    32.7    19.7    36.9    16.0
       solmar     41.3       -  ->11.7<-  30.7    18.3    29.0
       vantia     32.7  ->11.7<-      -   27.3    22.6    18.5
       kessia     19.7    30.7    27.3       -    19.6    22.3
       norlund    36.9    18.3    22.6    19.6       -    31.3
       meridia    16.0    29.0    18.5    22.3    31.3       -

   SOLMAR/VANTIA at 11.7 — amber #e6b422 against orange #e8752a, two warm
   mid-tones 29 degrees apart in hue and 14 apart in L*. Muted for the claim
   phase they become khaki and tan and they are, plainly, the same colour.
   (11.7 is also where the ~11.2 in the .kq-paper note below came from: that
   figure was sampled off a screenshot of unclaimed land.)

   THE FIX IS ONE CONTINENT. Vantia drops from #e8752a to a burnt-oxide
   #bf5219 — same orange family, same story, but L* 61.7 -> 48.5 and hue
   56 -> 51, so it separates from Solmar's gold by LIGHTNESS as well as by
   hue and stops competing with the gold accent (--kq-gold #FFC542) for the
   eye. Deeper and dirtier is also the more noir of the two.
   Nothing else moves: every other pair already cleared the bar, and a
   palette rewritten wholesale is a different map.

   IT DOES NOT CLEAR 15 ON ITS OWN, and that is the second change below —
   see the unowned mute in TERR_SHADE. A search over the whole six-colour
   palette (L* 44..68, C* 38..72, hue within +-35 of home, so it stays a
   noir palette and Solmar stays gold) could not get the worst pair past
   16.0 while the mute stayed at 0.62 — and it only reached 16.0 by turning
   Solmar olive, which costs the continent its name. The mute was the
   binding constraint, not the palette.
   Re-measure with scratchpad/kq-lab.js, which computes from these values
   rather than sampling pixels: territories inside one continent carry
   different ripple shades, so a six-pixel screenshot sample is noisy and
   the min-pair figure it reports moves around. */
const CONT_HEX = {
  aurora:  '#7c5cff',      /* violet     — unchanged */
  solmar:  '#e6b422',      /* gold       — unchanged */
  vantia:  '#bf5219',      /* burnt oxide, was #e8752a */
  kessia:  '#2b9dd9',      /* cyan       — unchanged */
  norlund: '#2fa34d',      /* green      — unchanged */
  meridia: '#e05a9c'       /* rose       — unchanged */
};
/* the CONTINENT descriptor for a territory index: base colour + a per-terr
   land shade + an unowned (dim) shade, all cached. */
const CONT_INFO = (function(){
  const info = {};       /* contId -> { hex, land:[perTerr shade], dim } */
  E.CONTINENTS.forEach(c => { info[c.id] = { hex:CONT_HEX[c.id] || c.hex, name:c.name, bonus:c.bonus }; });
  return info;
})();
const contHex = cid => (CONT_INFO[cid] ? CONT_INFO[cid].hex : '#6a7a8a');
/* the fill for territory i given its owner: continent colour, brighter when
   owned (a live land), duller/greyer when unowned (open sea-frontier land). */
const TERR_SHADE = (function(){
  const arr = new Array(E.N_TERR);
  const lift = h => rgbToHex(...mix(hexToRgb(h), [255,255,255], 0.28));
  for (let i = 0; i < E.N_TERR; i++){
    const cid = E.TERRITORIES[i].cont;
    const base = contHex(cid);
    /* deterministic small ripple ±: index within continent */
    const mem = E.REGION_MEMBERS[cid];
    const k = mem.indexOf(i);
    const step = ((k % 3) - 1);          /* -1, 0, +1 */
    const owned   = shade(base, step === 0 ? 0.02 : (step * 0.11));    /* lively family shade */
    /* THE UNOWNED MUTE — .50, NOT .62. This is a distance dial, not just a
       mood one: dragging every continent 62% of the way to one slate drags
       them 62% of the way to EACH OTHER, and the claim phase — the one
       phase where all forty lands are unowned and picking a continent is
       the only decision on the table — was where the six families came
       closest to collapsing. Measured through the same render chain, worst
       pair over all fifteen pairs and all three ripple shades:
         mute   shipped palette   with Vantia = #bf5219
         0.62        11.7                14.7      both under the 15 bar
         0.55        13.7                17.2
         0.50        15.1              ->18.9<-    where it sits now
         0.45        16.4                20.6
       Either change alone leaves a pair a player confuses; together the
       tightest pair on the whole board clears 15 with room to spare in
       every state — owned flat 40.0, owned + paper 28.1, unowned flat 30.0,
       unowned + paper 18.9. .50 is still visibly muted against a live land
       (that contrast is what says "nobody has claimed this"), and ownership
       was never carried by the fill anyway — it is the seat-colour ring and
       the troop badge. */
    const unowned = rgbToHex(...mix(hexToRgb(base), [70,86,104], 0.50)); /* muted, greyed */
    /* the PAPER pair. konk-land.jpg is laid over the land with `multiply`, so
       the shade underneath has to start brighter for the result to come back
       out at the colour above. Used ONLY once the texture has really loaded —
       if it 404s the board keeps the flat shades it has always had, and a
       missing file can never bleach the map. */
    arr[i] = { owned, unowned, ownedTex: lift(owned), unownedTex: lift(unowned) };
  }
  return arr;
})();
/* filled in by the probe below, once LAND_TEX is known to exist. */
let landTexOk = false;

/* ═══════════════════════════════════════════════════════════════════
   THE TWO TEXTURES — an ENHANCEMENT, never a dependency.

   konk-sea.jpg is a dark painted ocean; konk-land.jpg is aged mid-tone paper
   meant to be tinted, not shown raw. Both are referenced by URL and both have
   a failure path that costs the board nothing:
     · the sea <img> falls back to the old art/ui/konkwista-bg.png and then to
       the CSS radial gradient that has always been under it;
     · the land paper is an SVG <pattern>, so a 404 paints NOTHING and the
       clipped rect above the land is simply invisible — the flat continent
       fills that shipped before are what remains.
   Neither path can throw, and neither is on the road between a tap and a move.
   ═══════════════════════════════════════════════════════════════════ */
const SEA_TEX  = 'art/konkwista/konk-sea.jpg';
const LAND_TEX = 'art/konkwista/konk-land.jpg';

/* Has the paper actually arrived? One probe, no throw, no wait: the board
   paints its flat shades straight away and repaints once — and only once — if
   the texture turns up. Nothing on the road between a tap and a move waits on
   this, and a 404 simply leaves the board looking exactly as it shipped. */
(function probeLandTex(){
  try {
    const im = new Image();
    im.onload  = () => { landTexOk = true; if (UI && M) paintMap(); };
    im.onerror = () => { landTexOk = false; };
    im.src = LAND_TEX;
  } catch(e){}
})();

/* the badge disc: the seat colour dragged most of the way to ink, so a white
   numeral clears WCAG-AA-large on every one of the six seats — amber included,
   which as a flat disc was the unreadable one. */
function badgeInk(hex){ return rgbToHex(...mix(hexToRgb(hex), [9, 19, 30], 0.72)); }

/* ═══════════════════════════════════════════════════════════════════
   OUR CORNER OF localStorage — save, prefs, record.
   ═══════════════════════════════════════════════════════════════════ */
const STORE  = 'karti_konkwista_v1';
const SAVE_V = 1;
let ST = { v:1, pref:{}, rec:{ w:0, l:0 }, save:null };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object'){
    ST.pref = (j.pref && typeof j.pref === 'object') ? j.pref : {};
    ST.rec  = (j.rec  && typeof j.rec  === 'object') ? j.rec  : ST.rec;
    ST.save = (j.save && j.save.v === SAVE_V) ? j.save : null;
  }
} catch(e){}
let persistPending = 0;
function persist(){
  if (persistPending) return;
  persistPending = setTimeout(() => {
    persistPending = 0;
    try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){}
  }, 0);
}
function persistNow(){
  if (persistPending){ clearTimeout(persistPending); persistPending = 0; }
  try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){}
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persistNow(); });
window.addEventListener('pagehide', persistNow);

function pref(patch){ if (patch){ Object.assign(ST.pref, patch); persist(); } return ST.pref; }
function saveSlot(snap){ ST.save = snap || null; persist(); }

const UIKEY = 'karti_konkwista_ui_v1';
let rulesOpen = false;
try { rulesOpen = localStorage.getItem(UIKEY + '.rules') === '1'; } catch(e){}
let seenTip = false;
try { seenTip = localStorage.getItem(UIKEY + '.tip') === '1'; } catch(e){}

/* the machine's sharpnesses, off the engine's LEVELS */
function levels(){ return (E.LEVELS || []).map(L => ({ level:L.k, name:L.name, note:L.note, icon:L.icon })); }
function levelName(k){ const L = levels().find(x => x.level === k); return (L && L.name) || 'MAKNA'; }
function levelNote(k){ const L = levels().find(x => x.level === k); return L ? TE(L.note) : ''; }

/* ═══════════════════════════════════════════════════════════════════
   THE THREE STEPS — ONE VOCABULARY, MAPPED OFF THE ENGINE'S OWN ARRAY.

   `E.PHASES` is ['reinforce','attack','fortify'] and its INDEX *is* `st.phase`
   (js/konkwista.js: PH_REINFORCE 0, PH_ATTACK 1, PH_FORTIFY 2). So this table
   is BUILT BY MAPPING OVER IT rather than hand-ordered: if the engine ever
   renames or reorders a step, the bar follows it instead of quietly labelling
   the wrong cell. The two OPENING phases (PH_CLAIM 3, PH_DEPLOY 4) are
   deliberately ABSENT — setup is not one of the three steps and the bar must
   never pretend it is; it renders all three locked and says so in words.

   ENGLISH SAYS "DRAFT", MALTESE KEEPS "RINFORZA" — the owner's call, and it
   is said HERE and in no other line of this file. Grep for 'Draft' and you
   should find exactly one hit.
   ═══════════════════════════════════════════════════════════════════ */
const PHASE_VOCAB = {
  reinforce: {
    icon:  'plus',
    label:  () => T('Draft', 'Rinforza'),
    mine:   () => T('Tap your land to place armies', 'Ikklikkja artek biex tqiegħed armati'),
    theirs: () => T('placing armies…', 'qed iqiegħed armati…')
  },
  attack: {
    icon:  'impact',
    label:  () => T('Attack', 'Attakka'),
    mine:   () => T('Tap a glowing land, then an enemy', 'Ikklikkja art tleqq, imbagħad għadu'),
    theirs: () => T('choosing a battle…', 'qed jagħżel battalja…')
  },
  fortify: {
    icon:  'shield',
    label:  () => T('Fortify', 'Fortifika'),
    mine:   () => T('Move armies once, or end your turn', 'Ċaqlaq l-armati darba, jew temm'),
    theirs: () => T('regrouping…', 'qed jerġa\' jiġġema\'…')
  }
};
const PHASE_STEPS = (E.PHASES || ['reinforce', 'attack', 'fortify']).map((key, index) => ({
  key, index, v: PHASE_VOCAB[key] || { icon:'flag', label:()=>key, mine:()=>'', theirs:()=>'' }
}));

/* A SCREEN-READER-ONLY WORD. The seat chips carry three icons; a picture of a
   flag is not the word "territories", so every count gets its word next to it,
   invisible on screen and read out loud. */
function sr(txt){ return '<span class="kq-sr">' + esc(txt) + '</span>'; }

/* ═══════════════════════════════════════════════════════════════════
   SOUND — existing ids only (js/sfx.js), through one gate so a fast run
   does not machine-gun the mixer.
     dice.roll      combat dice
     duel.attack    the attack launch
     duel.hit       an army lost in a fight
     duel.destroy   a captured territory
     piece.place    a reinforcement dropped
     sea.horn       a whole region taken (flourish)
     game.win       the finish
     ui.tap/back/sheet, move.illegal, game.start, mp.turn
   ═══════════════════════════════════════════════════════════════════ */
let cueAt = 0;
function cue(id, opts, big){
  const S = window.KARTI_SFX;
  if (!S) return;
  const now = Date.now();
  if (!big && now - cueAt < 45) return;
  cueAt = Math.max(cueAt, now);
  try { S.play(id, opts); } catch(e){}
}
function reduced(){
  try {
    if (document.body && document.body.classList.contains('reduced')) return true;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch(e){ return false; }
}

/* ── HAPTICS — the other half of "something just happened" ─────────────
   One line, next to the cue() that already marks the same moment, so a buzz
   and a click can never drift apart (js/misteru-ui.js's discipline). sfx.js
   owns the pattern, the player's switch and every no-op path; it can neither
   throw nor delay the tap that caused it.

   DELIBERATELY NOT GATED ON reduced() — that setting is about things MOVING
   on screen making people ill; a buzz in the hand is not motion and has its
   own switch. The MOMENT is what the player is told about, not the picture.

   THE ONE RULE: only ever for something the LOCAL player did. A machine's
   attack and a remote seat's attack animate exactly the same way on this
   screen, but the phone must stay still for them — a pocket that buzzes for
   five other people's turns is a phone you put down. Every combat call site
   below therefore carries a `mine` flag down from the caller that KNOWS
   whose thumb (or whose wire packet) started it. */
function buzz(kind){
  try { const S = window.KARTI_SFX; if (S && S.haptic) S.haptic(kind); } catch(e){}
}

/* ═══════════════════════════════════════════════════════════════════
   HONEST ODDS — ENUMERATED, NEVER REMEMBERED.

   The attack sheet promises the player real numbers, so we derive them from
   the same rule the engine applies rather than pasting a table off a wiki we
   cannot check: roll every possible pair of hands, sort both descending,
   compare the top min(nA,nD) pairs, ties to the defender, and count. The
   whole space is at most 6^3 x 6^2 = 7776 outcomes — a fraction of a
   millisecond, and cached per (nA,nD) so a dice-count tap is free.
   ═══════════════════════════════════════════════════════════════════ */
const oddsCache = Object.create(null);
function exchangeOdds(nA, nD){
  nA = Math.max(0, Math.min(3, nA | 0));
  nD = Math.max(0, Math.min(2, nD | 0));
  const key = nA + 'x' + nD;
  if (oddsCache[key]) return oddsCache[key];
  const cmp = Math.min(nA, nD);
  const counts = new Array(cmp + 1).fill(0);     /* counts[d] = defender loses d */
  const a = new Array(nA), d = new Array(nD);
  let total = 0;
  function rollD(j){
    if (j === nD){
      const as = a.slice().sort((x, y) => y - x);
      const ds = d.slice().sort((x, y) => y - x);
      let defLoss = 0;
      for (let k = 0; k < cmp; k++) if (as[k] > ds[k]) defLoss++;   /* ties: defender holds */
      counts[defLoss]++; total++;
      return;
    }
    for (let v = 1; v <= 6; v++){ d[j] = v; rollD(j + 1); }
  }
  function rollA(i){
    if (i === nA){ rollD(0); return; }
    for (let v = 1; v <= 6; v++){ a[i] = v; rollA(i + 1); }
  }
  rollA(0);
  const out = { cmp, total, counts, p: counts.map(c => (total ? c / total : 0)) };
  oddsCache[key] = out;
  return out;
}

/* the chance of eventually EMPTYING the target if the attacker keeps going
   with the most dice it can. Exact, by recursion over (attacker armies,
   defender armies) — each exchange always costs at least one army in total,
   so the recursion is finite and shallow. Memoised across the whole session. */
const conqCache = Object.create(null);
function conquerChance(a, d){
  if (d <= 0) return 1;
  if (a <= 1) return 0;
  const key = a + ',' + d;
  const hit = conqCache[key];
  if (hit != null) return hit;
  const o = exchangeOdds(Math.min(3, a - 1), Math.min(2, d));
  let p = 0;
  for (let dl = 0; dl <= o.cmp; dl++){
    const pr = o.p[dl];
    if (pr) p += pr * conquerChance(a - (o.cmp - dl), d - dl);
  }
  conqCache[key] = p;
  return p;
}
/* the same, but the FIRST exchange uses the dice count the player picked. */
function conquerChanceWith(a, d, n){
  if (d <= 0) return 1;
  if (a <= 1) return 0;
  const o = exchangeOdds(n, Math.min(2, d));
  let p = 0;
  for (let dl = 0; dl <= o.cmp; dl++){
    const pr = o.p[dl];
    if (pr) p += pr * conquerChance(a - (o.cmp - dl), d - dl);
  }
  return p;
}
/* Never let rounding tell a lie. 0.9994 is not certainty and 0.0004 is not
   impossible, and a player who reads "100%" and then loses stops believing
   any number on this screen. Only a true 1 or 0 gets to say so. */
function pct(p){
  const r = Math.round(p * 100);
  if (r >= 100 && p < 1) return 99;
  if (r <= 0 && p > 0) return 1;
  return r;
}
/* how many dice this army may throw — the engine's rule, with a local
   fallback so the picker still works if it is called before the engine's
   own pass has landed. */
function atkDiceMax(army){
  return E.maxAtkDice ? E.maxAtkDice(army) : Math.max(0, Math.min(3, (army | 0) - 1));
}
function defDiceMax(army){
  return E.maxDefDice ? E.maxDefDice(army) : Math.min(2, army | 0);
}

/* ═══════════════════════════════════════════════════════════════════
   THE RUNNER — (opts, seed, log) and one door for every move.
   ═══════════════════════════════════════════════════════════════════ */
let M = null;      /* the live match */
let UI = null;     /* the board's handles */
const moveSubs  = [];
const stateSubs = [];
function fireList(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }

function newSeed(){ return (E.newSeed ? E.newSeed() : (Math.random() * 0x100000000) | 0) >>> 0; }

function buildState(opts, seed, log){
  const st = E.newGame(opts, seed);
  for (let i = 0; i < log.length; i++){
    const mv = log[i];
    const seat = E.turn(st);
    if (seat < 0 || !E.check(st, mv, seat)) break;
    E.apply(st, mv);
    if (E.over(st)) break;
  }
  return st;
}

function startMatch(opts, seed, log){
  stopThinking();
  M = {
    opts: clone(opts || {}),
    seed: (seed == null ? newSeed() : (seed >>> 0)),
    log: log ? clone(log) : [],
    st: null, ctx: null,
    timer: 0, dead: false, finished: false,
    raf: 0, anim: null,
    recorded: false,
    net: null, meta: null,
    /* ONLINE, KNOWN BEFORE THE BOARD IS BUILT. `M.net` is only set moments
       before openBoard(), and openBoard has to decide whether the NEW button
       is even allowed to exist in the DOM — so onlineStart() raises this flag
       first and isOnlineMatch() reads either. Not serialised: snapshot() only
       carries opts/seed/log/meta, so the save format is untouched. */
    online: false,
    sel: -1,                 /* the selected own territory (attack/fortify src) */
    fsel: -1,                /* fortify: chosen source once a dest is being picked */
    place: 1,                /* reinforcement chunk size the +/- picks           */
    busy: false,             /* a battle animation is playing                    */
    picking: false,          /* the attack sheet is open — the map is deaf       */
    turnId: null,            /* 'round:seat' — changes exactly once per turn     */
    tradeThisTurn: 0,        /* armies won from card trades in THIS turn         */
    readoutDone: false       /* the turn readout has been shown for turnKey      */
  };
  M.st = buildState(M.opts, M.seed, M.log);
  applyMeta();
  return M;
}
function applyMeta(){
  if (!M || !M.meta || !M.st) return;
  M.meta.forEach((m, i) => { if (m) M.st['seat' + i] = m; });
}
function stopThinking(){ if (M && M.timer){ clearTimeout(M.timer); M.timer = 0; } }

/* IS THIS A LIVE ONLINE MATCH? Two sources on purpose: `M.online` is raised by
   onlineStart() BEFORE the board is built (openBoard needs the answer to decide
   whether the NEW button is written at all), and `M.net` is the transport that
   arrives at almost the same moment. Either one is enough; neither alone is
   early enough everywhere. */
function isOnlineMatch(){ return !!(M && (M.online || M.net)); }

/* ownership lives in the UI. meta[i] = { own:'me'|'hot'|'ai'|'net', name, lvl } */
function ownerOf(i){
  if (!M || !M.meta || !M.meta[i]) return 'ai';
  return M.meta[i].own || 'ai';
}
const isLocal = i => { const o = ownerOf(i); return o === 'me' || o === 'hot'; };
function seatLvl(i){ return (M && M.meta && M.meta[i] && M.meta[i].lvl) || 2; }
function seatName(i){
  if (!M || !M.meta || !M.meta[i]) return seatColName(i);
  const m = M.meta[i];
  if (m.own === 'me' || m.own === 'hot') return m.name || T('You', 'Int');
  if (m.own === 'ai') return levelName(m.lvl);
  return m.name || seatColName(i);
}
function firstLocalSeat(){ for (let i = 0; i < (M ? M.st.seats : 0); i++) if (isLocal(i)) return i; return -1; }

/* THE gate. Every move — thumb, machine, wire, replay — measured here. */
function doMove(seat, move, src){
  if (!M || M.dead) return { ok:false, err:'no game' };
  if (E.over(M.st)) return { ok:false, err:'game over' };
  const t = E.turn(M.st);
  if (t !== seat) return { ok:false, err:'not your turn' };
  if (!E.check(M.st, move, seat)) return { ok:false, err:'illegal move' };
  const rec = clone(move);
  const idx = M.log.length;
  M.log.push(rec);
  const before = { battle:null };
  E.apply(M.st, rec);
  autosave();
  fireList(moveSubs,  { seat, move:clone(move), index:idx, src:src || 'local', last:M.st.last, battle:M.st.lastBattle });
  fireList(stateSubs, { reason:'move', index:idx });
  return { ok:true, index:idx };
}

function snapshot(){
  if (!M) return null;
  return { v:SAVE_V, gid:'konkwista', opts:clone(M.opts), seed:M.seed, log:clone(M.log), meta:clone(M.meta || null) };
}
function autosave(){
  if (!M || M.net) return;
  if (E.over(M.st)){ saveSlot(null); return; }
  saveSlot(snapshot());
}

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party. A parchment-sea
   identity: a deep Mediterranean-blue cabinet, the vector islands in the
   seat colours, a brass phase banner. The map is one SVG; everything
   around it is DOM.
   ═══════════════════════════════════════════════════════════════════ */
let cssDone = false;
function injectCSS(){
  if (cssDone || document.getElementById('kq-runtime-css')){ cssDone = true; return; }
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'kq-runtime-css';
  st.textContent =
    '#scr-party{--kq-sea:#0f2a44;--kq-sea2:#0a1c30;--kq-gold:var(--gold,#FFC542);' +
      '--kq-ink:#0b1622;--kq-parch:#e9d7ad}' +

    '#scr-party .pt-host.kq-host{align-items:stretch;justify-content:stretch;overflow:visible}' +
    '#scr-party .kq-wrap{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;' +
      'gap:5px;padding:5px 0 6px;position:relative}' +

    /* A WORD FOR A SCREEN READER AND NOTHING FOR THE EYE. The seat chips read
       "12 flag 34 users" to a screen reader without these. */
    '#scr-party .kq-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;' +
      'overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}' +

    /* ══════════════════════════════════════════════════════════════════
       THE PHASE BAR — the strip that replaced the gold banner.

       WHY THE BANNER WENT. It was ~52px of chrome (plus a gap) whose entire
       job was a sentence, and this map is HEIGHT-BOUND: viewBox 660x1160 with
       preserveAspectRatio meet, so every pixel of chrome costs about 0.57px of
       map WIDTH. At 360x640 the map was drawing 215px wide. The bar below says
       everything the banner said and does it in the frame's OWN bottom bar,
       where the thumb already is, so the strip at the top of the board is gone
       and the map has it.

       IT HOLDS NO STATE. Every paint derives from E.turn / E.over / E.inSetup /
       st.phase, so a rollback, a replay or a wire packet cannot leave it saying
       something the engine does not agree with.
       ══════════════════════════════════════════════════════════════════ */
    /* ONE CONTROL ROW, ONE LINE OF WORDS — and that shape is a height budget,
       not a taste. The old chrome was a 52-93px banner INSIDE the board column
       plus a 46px button bar under it. Two full-height rows here would have
       spent the banner's savings and more, so the three steps and the primary
       action share a single 44px row and the sentence underneath is one line. */
    '#scr-party .pt-bar.kq-phasebar{display:block;grid-template-columns:none;margin-top:6px}' +
    '#scr-party .kq-prow{display:flex;align-items:stretch;gap:5px}' +
    /* `flex:1 1 auto`, NOT `1 1 0`. Equal thirds clipped the Maltese: "Rinforza"
       plus the armies count wants 46px in a 42px cell while FORTIFIKA's
       neighbour sits half empty. Basis-auto lets each cell start at its own
       words and share only the SLACK, so the longest label gets the room it
       needs and nothing is ellipsised into a syllable. */
    '#scr-party .kq-pstep{flex:1 1 auto;min-width:0;position:relative;display:flex;' +
      'align-items:center;justify-content:center;' +
      'gap:5px;min-height:44px;padding:4px;border:1px solid rgba(255,255,255,.12);border-radius:12px;' +
      'background:rgba(0,0,0,.30);color:rgba(255,255,255,.68);cursor:default;' +
      'font:900 10.5px/1.05 var(--disp);letter-spacing:.04em;text-transform:uppercase;' +
      'overflow:hidden;-webkit-tap-highlight-color:transparent;' +
      'transition:background .16s,border-color .16s,color .16s,opacity .16s}' +
    '#scr-party .kq-pstep .ico{font-size:14px;opacity:.92}' +
    '#scr-party .kq-pstep b{min-width:0;font-weight:900;white-space:nowrap;overflow:hidden;' +
      'text-overflow:ellipsis}' +
    /* the armies-to-place count, rehomed out of the banner and into the step it
       belongs to — a number nobody has to hunt for. */
    '#scr-party .kq-pstep .kq-pn{flex:0 0 auto;min-width:19px;text-align:center;padding:1px 4px;' +
      'border-radius:7px;font:900 12px/1.35 var(--disp);color:#fff;background:rgba(0,0,0,.42);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}' +
    /* BEHIND YOU — a tick, and out of the way. */
    '#scr-party .kq-pstep.done{color:rgba(255,255,255,.5);background:rgba(255,255,255,.05)}' +
    '#scr-party .kq-pstep.done .ico{color:#7CF29B;opacity:1}' +
    /* WHERE YOU ARE — the only gold thing on the bar. */
    '#scr-party .kq-pstep.now{color:#1a1205;border-color:transparent;' +
      'background:linear-gradient(180deg,#FFDD7A,#E9A81F);' +
      'box-shadow:0 2px 0 rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.5)}' +
    '#scr-party .kq-pstep.now .kq-pn{background:rgba(0,0,0,.30)}' +
    /* NEXT — the one step a tap may move you to, and the ONLY tappable cell.
       Forward one, never backwards, never skipping; and the engine refuses it
       anyway, so this is an affordance, not a gate. */
    '#scr-party .kq-pstep.next{cursor:pointer;color:#fff;border-color:rgba(255,197,66,.5);' +
      'background:rgba(255,197,66,.10)}' +
    '#scr-party .kq-pstep.next:active{transform:translateY(1px)}' +
    /* NOT YET — a padlock at 45%. */
    '#scr-party .kq-pstep.lock{opacity:.45}' +
    /* MUST TRADE FIRST — the one alert state the Draft step can be in. */
    '#scr-party .kq-pstep.alert{color:#fff;border-color:rgba(255,138,107,.8);' +
      'background:linear-gradient(180deg,#ff9d6b,#e8552a);box-shadow:0 2px 0 rgba(0,0,0,.35)}' +
    '#scr-party .kq-pstep.alert .kq-pn{background:rgba(0,0,0,.3)}' +
    /* NOT YOUR TURN — nothing may look tappable when it is not. Desaturated,
       no gold, no lift, and the action is a plain pill that is not a button. */
    /* the DESATURATION lands on the STEPS, not on the whole bar: the waiting
       pill carries the seat's colour dot, and a seat colour is a game rule
       here — greying it out to make a point about whose turn it is would take
       away the one thing that says WHOSE. */
    '#scr-party .kq-pb.inert{opacity:.76}' +
    '#scr-party .kq-pb.inert .kq-pstep{filter:saturate(.22);cursor:default}' +
    '#scr-party .kq-pb.inert .kq-pstep.now{color:#e6ebf1;border-color:rgba(255,255,255,.18);' +
      'background:rgba(255,255,255,.09);box-shadow:none}' +
    '#scr-party .kq-pb.over{filter:saturate(.15);opacity:.5}' +
    'body.reduced #scr-party .kq-pstep{transition:none}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .kq-pstep{transition:none}}' +

    /* the sentence: ONE line, and the ONLY live region on this bar. Do not add
       a second one anywhere — two polite regions on one strip read over each
       other and the player hears neither. */
    '#scr-party .kq-pline{display:block;margin-top:4px;min-height:14px;' +
      'font:600 10.5px/1.35 var(--body);color:rgba(255,255,255,.78);' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .kq-pline b{font:900 9.5px/1.35 var(--disp);letter-spacing:.07em;' +
      'text-transform:uppercase;color:var(--kq-gold)}' +
    '#scr-party .kq-pb.inert .kq-pline b{color:rgba(255,255,255,.62)}' +
    '#scr-party .kq-pline i{font-style:normal}' +
    /* NOT A BUTTON. A <span>, so nothing about it invites a thumb, and it sits
       exactly where the action button would be so the eye learns one place. */
    /* THE PILL AND THE LABELS CANNOT BOTH HAVE THE ROW. Uncapped, "WAITING FOR
       <NAME>" took half the strip and clipped the steps to "ATTA…" and "FORT…"
       — the three words the bar exists to say, ruined. So while the bar is
       inert the step LABELS go and their icons grow: at that moment the player
       is a spectator, the gold cell still shows where the turn is, and the line
       underneath names the phase in full ("IL-KAPTAN · choosing a battle…").
       This is the "icon-only when the row is tight" rule, keyed on the thing
       that actually makes it tight rather than on a guessed screen width. */
    '#scr-party .kq-pb.inert .kq-pstep b{display:none}' +
    '#scr-party .kq-pb.inert .kq-pstep .ico{font-size:16px}' +
    '#scr-party .kq-wait{flex:0 1 auto;min-width:0;max-width:56%;display:flex;align-items:center;gap:6px;' +
      'padding:9px 10px;border-radius:11px;font:900 9.5px/1.15 var(--disp);letter-spacing:.04em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.66);background:rgba(255,255,255,.06);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);cursor:default;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .kq-wait i{width:11px;height:11px;flex:0 0 auto;border-radius:50%;' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 1px 2px rgba(0,0,0,.5)}' +
    '#scr-party .kq-prow [hidden]{display:none}' +

    /* 44px is the smallest thing a thumb hits reliably — these are the controls
       a player uses EVERY turn. */
    '#scr-party .kq-act{flex:0 0 auto;border:0;cursor:pointer;font:900 11px/1 var(--disp);' +
      'letter-spacing:.05em;text-transform:uppercase;padding:9px 12px;border-radius:11px;' +
      'min-height:44px;min-width:44px;' +
      'color:#1a1205;background:linear-gradient(180deg,#FFDD7A,#E9A81F);' +
      'box-shadow:0 2px 0 rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.5);' +
      '-webkit-tap-highlight-color:transparent;white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis}' +
    /* in the phase row it shares the width with three steps, so it may shrink —
       but never below a thumb, and never past its own words. */
    '#scr-party .kq-prow .kq-act{flex:0 1 auto;min-width:0;max-width:46%}' +
    '#scr-party .kq-act:active{transform:translateY(1px)}' +
    '#scr-party .kq-act.ghost{color:#fff;background:rgba(255,255,255,.10);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}' +
    '#scr-party .kq-act[disabled]{opacity:.4;pointer-events:none}' +

    /* ══ THE CONTEXTUAL ROW — the two live controls the banner used to host ══
       The reinforcement stepper and the cards button are not decoration; they
       are how a player places armies in chunks and trades a set. They are IN
       THE LAYOUT ONLY while the engine says one of them is needed, so they cost
       the map nothing for most of a turn.

       IT CARRIES ITS OWN [hidden] RULE, and it must. The class rules below set
       `display:flex`, and a class rule outranks the browser's own
       `[hidden]{display:none}` — which is exactly why `el.hidden = true` did
       nothing inside the old banner and the cards button sat there as a dead
       cream slab from the first frame of every game. Move a control that is
       toggled with `hidden` and you must move this line with it. */
    '#scr-party .kq-ctx{flex:0 0 auto;display:flex;align-items:center;gap:8px;min-height:44px}' +
    '#scr-party .kq-ctx[hidden]{display:none}' +
    '#scr-party .kq-ctx [hidden]{display:none}' +

    /* ── the reinforcement stepper (± chunk) ── */
    '#scr-party .kq-step{flex:0 0 auto;display:flex;align-items:center;gap:4px}' +
    '#scr-party .kq-step .kq-slbl{flex:0 0 auto;margin-right:2px;font:900 9px/1.2 var(--disp);' +
      'letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.55)}' +
    '#scr-party .kq-step button{width:44px;height:44px;border-radius:11px;border:0;cursor:pointer;' +
      'font:900 18px/1 var(--disp);color:#fff;background:rgba(255,255,255,.12);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);-webkit-tap-highlight-color:transparent}' +
    '#scr-party .kq-step button:active{transform:translateY(1px)}' +
    '#scr-party .kq-step .kq-n{min-width:22px;text-align:center;font:900 15px/1 var(--disp);color:#fff}' +

    /* ══ THE SEAT ROW, and the two tools to the right of it ══
       RULES and NEW used to be a whole bar of their own at the bottom of the
       screen. The map cannot afford a row it does not need, and neither of them
       is pressed once a minute — so they are 44px icon buttons riding beside
       the seat strip, and the bar underneath belongs entirely to the turn. */
    '#scr-party .kq-top{flex:0 0 auto;display:flex;align-items:center;gap:6px;min-width:0}' +
    '#scr-party .kq-seats{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:5px;' +
      'overflow-x:auto;padding:1px;-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
    '#scr-party .kq-seats::-webkit-scrollbar{display:none}' +
    '#scr-party .kq-tools{flex:0 0 auto;display:flex;align-items:center;gap:4px}' +
    '#scr-party .kq-tool{width:44px;height:44px;flex:0 0 auto;padding:0;display:grid;place-items:center;' +
      'border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(255,255,255,.06);' +
      'color:#fff;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .kq-tool .ico{font-size:18px}' +
    '#scr-party .kq-tool:active{transform:translateY(1px)}' +

    '#scr-party .kq-chip{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:3px 8px 3px 4px;' +
      'border-radius:11px;background:rgba(0,0,0,.30);border:1px solid rgba(255,255,255,.09)}' +
    '#scr-party .kq-chip.on{background:rgba(255,197,66,.16);border-color:rgba(255,197,66,.6)}' +
    '#scr-party .kq-chip.dead{opacity:.34;filter:grayscale(.7)}' +
    /* THE FACE AND THE SEAT COLOUR, TOGETHER, NEVER INSTEAD OF EACH OTHER.
       The seat colour is a GAME RULE here — it is how ownership is drawn on the
       map — so a cosmetic may not overpaint it. The medallion sits inside a 2px
       inset ring in the seat colour and carries a corner pip of the same, which
       survives a photograph, a painted border and the greyscale of a dead seat.
       Name and face carry identity; the ring and pip carry the rule. */
    '#scr-party .kq-chip .kq-face{position:relative;flex:0 0 auto;width:28px;height:28px;' +
      'border-radius:50%;display:grid;place-items:center}' +
    '#scr-party .kq-chip .kq-face>[data-kx-av]{display:block}' +
    '#scr-party .kq-chip .kq-fring{position:absolute;inset:0;border-radius:50%;pointer-events:none;' +
      'box-shadow:inset 0 0 0 2px var(--sc,#fff),0 1px 3px rgba(0,0,0,.55)}' +
    '#scr-party .kq-chip .kq-pip{position:absolute;right:-1px;bottom:-1px;width:9px;height:9px;' +
      'border-radius:50%;pointer-events:none;background:var(--sc,#fff);' +
      'box-shadow:0 0 0 1.5px rgba(6,14,24,.92)}' +
    /* A MACHINE GETS NO HUMAN FACE. js/mp.js draws a plain medallion with the
       difficulty mark for a cpu chair; drawing a hashed stranger's portrait for
       something that is not a person is a small lie this screen will not tell. */
    '#scr-party .kq-chip .kq-bot{position:relative;flex:0 0 auto;width:28px;height:28px;' +
      'border-radius:50%;display:grid;place-items:center;color:#cfe2f0;' +
      'background:radial-gradient(circle at 34% 28%,rgba(255,255,255,.16),rgba(255,255,255,.05))}' +
    '#scr-party .kq-chip .kq-bot .ico{font-size:15px}' +
    '#scr-party .kq-chip .cn{display:flex;flex-direction:column;line-height:1.05;min-width:0}' +
    '#scr-party .kq-chip .cn b{font:900 9px/1.15 var(--disp);letter-spacing:.03em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.82);max-width:74px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .kq-chip.on .cn b{color:var(--kq-gold)}' +
    '#scr-party .kq-chip .cn i{display:flex;align-items:center;gap:5px;font:700 8.5px/1.2 var(--body);' +
      'color:rgba(255,255,255,.6);font-style:normal}' +
    '#scr-party .kq-chip .cn i em{display:inline-flex;align-items:center;gap:2px;font-style:normal}' +
    '#scr-party .kq-chip .cn i .ico{font-size:9.5px;opacity:.85}' +

    /* ── the map box holds the SVG, sized to fit ── */
    '#scr-party .kq-mapbox{flex:1 1 auto;min-height:0;position:relative;display:flex;' +
      'align-items:center;justify-content:center;overflow:hidden;border-radius:16px;' +
      'background:radial-gradient(130% 120% at 50% 15%,#164066 0%,var(--kq-sea) 55%,var(--kq-sea2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.05),inset 0 -14px 30px rgba(0,0,0,.42)}' +
    /* THE SEA. A painted-ocean photograph if art/konkwista/konk-sea.jpg is
       there, the old radial gradient underneath if it is not — the image is an
       ENHANCEMENT and its onerror hides it, so a 404 costs the board nothing.
       Opacity is high because the texture is already dark (~10% mean); the
       gradient below still supplies the centre-lit falloff. */
    '#scr-party .kq-mapbg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' +
      'opacity:.92;pointer-events:none}' +
    /* a depth vignette painted over the water, never over the UI */
    '#scr-party .kq-mapvig{position:absolute;inset:0;pointer-events:none;' +
      'background:radial-gradient(115% 95% at 50% 30%,rgba(30,90,140,.20) 0%,rgba(4,12,22,0) 46%,rgba(2,8,16,.62) 100%)}' +
    '#scr-party .kq-svg{position:relative;display:block;width:100%;height:100%;' +
      'touch-action:manipulation;-webkit-tap-highlight-color:transparent}' +
    /* THE LAND. Fill = the CONTINENT colour (set per-cell), so continent
       membership reads at a glance. The OWNER is a separate seat-colour RING
       (the .kq-ring overlay) + the troop badge tint — so "which continent" and
       "who owns it" are both legible without fighting each other.
       The land group ISOLATES so the paper texture's blend mode can only ever
       reach the land under it, never the sea behind it. */
    '#scr-party .kq-landg{isolation:isolate}' +
    /* territory seams INSIDE a continent stay thin and soft — the coast is the
       line that matters, and it is drawn by .kq-shelf/.kq-rim below. */
    '#scr-party .kq-terr{stroke:rgba(8,18,30,.5);stroke-width:1.1;cursor:pointer;' +
      'transition:filter .12s,opacity .12s}' +
    'body.reduced #scr-party .kq-terr{transition:none}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .kq-terr{transition:none}}' +
    /* ══════════════════════════════════════════════════════════════════
       THE SELECTION — the three states that must never be confused: the land
       you have PICKED, the lands you may reach FROM it, and everything else.

       TWO THINGS WERE STOPPING THAT FROM READING, and neither was the choice of
       colour:

       1 · AN SVG STROKE IS IN USER UNITS. This map is viewBox 660x1160 drawn
           about 215 CSS px wide on a 360px phone — a scale of 0.33. So the old
           `.kq-terr.target{stroke-width:3}` was rendering at ONE PHYSICAL PIXEL,
           on a coastline that is already ringed in pale sand. It was not a weak
           signal; it was a sub-pixel one, and it got weaker the smaller the
           phone. Every rule below therefore carries `vector-effect:non-scaling-
           stroke`, so the number IS screen pixels on every phone at every size.

       2 · THE OWNER RING TRACES THE SAME POLYGON AND IS PAINTED AFTER THE LAND.
           A 4.6-unit seat ring sat directly on top of the 3.5-unit gold
           selection stroke and hid it — measured, at both sizes: with a source
           selected, neither the picked land nor its targets could be found by
           eye. The highlight is its OWN layer now (.kq-hig, emitted after the
           rings), so nothing overpaints it.

       COLOUR IS NEVER THE ONLY SIGNAL. Picked = one heavy SOLID gold outline;
       a target = a MARCHING DASHED outline with a reticle stamped over it;
       everything else = dimmed AND desaturated. Solid vs dashed vs faded, plus
       a mark that is a shape, is legible with no colour vision at all.
       ══════════════════════════════════════════════════════════════════ */
    '#scr-party .kq-hi{fill:none;display:none;pointer-events:none;stroke-linejoin:round;' +
      'vector-effect:non-scaling-stroke}' +
    /* a land you MAY pick, before you have picked one */
    '#scr-party .kq-hi.pick{display:block;stroke:rgba(255,255,255,.94);stroke-width:2.2;' +
      'filter:drop-shadow(0 0 2px rgba(0,0,0,.95)) drop-shadow(0 0 5px rgba(255,255,255,.75))}' +
    /* the land you HAVE picked — gold, because gold means "you" everywhere here */
    '#scr-party .kq-hi.sel{display:block;stroke:var(--kq-gold);stroke-width:4;' +
      'filter:drop-shadow(0 0 3px rgba(0,0,0,.95)) drop-shadow(0 0 8px rgba(255,197,66,.95))}' +
    /* where that land can reach */
    '#scr-party .kq-hi.tgt{display:block;stroke:#fff;stroke-width:3.4;stroke-dasharray:7 5;' +
      'filter:drop-shadow(0 0 2.5px rgba(0,0,0,1)) drop-shadow(0 0 6px rgba(255,255,255,.9));' +
      'animation:kq-march 900ms linear infinite}' +
    '@keyframes kq-march{to{stroke-dashoffset:-24}}' +
    'body.reduced #scr-party .kq-hi.tgt{animation:none}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .kq-hi.tgt{animation:none}}' +
    /* the MARK over a target: a reticle when you are attacking, an arrow when
       you are moving armies. A shape, so the answer survives with no colour
       vision and even if the outline itself is lost against pale land. */
    '#scr-party .kq-mark{display:none;pointer-events:none}' +
    '#scr-party .kq-mark.on{display:block}' +
    '#scr-party .kq-mark circle{fill:rgba(6,14,24,.86);stroke:#fff;stroke-width:1.5;' +
      'vector-effect:non-scaling-stroke}' +
    '#scr-party .kq-mark path{fill:none;stroke:#fff;stroke-width:1.9;stroke-linecap:round;' +
      'stroke-linejoin:round;vector-effect:non-scaling-stroke}' +
    '#scr-party .kq-mark .mk-atk,#scr-party .kq-mark .mk-for{display:none}' +
    '#scr-party .kq-mark.atk .mk-atk{display:block}' +
    '#scr-party .kq-mark.for .mk-for{display:block}' +
    /* EVERYTHING ELSE RECEDES. Opacity alone was never going to do it: forty
       lands in six saturated colour families still shout at 90%, which is what
       `.dim{opacity:.9}` used to ask for — and paintMap never even applied it,
       so nothing on this map has ever stepped back for a selection. It steps
       back now, and it desaturates as well as dims so the six families stop
       competing with the three shapes that matter. */
    '#scr-party .kq-terr.dim{opacity:.30;filter:saturate(.18)}' +
    '#scr-party .kq-badge.dim{opacity:.24}' +
    '#scr-party .kq-tname.dim{opacity:.14}' +
    /* the softer version, for "you have not picked yet": the lands you COULD
       pick stay lit and the rest step back without vanishing. */
    '#scr-party .kq-terr.dim2{opacity:.60;filter:saturate(.45)}' +
    '#scr-party .kq-badge.dim2{opacity:.6}' +
    '#scr-party .kq-tname.dim2{opacity:.4}' +
    /* the old glows stay as a soft halo under the new outlines; the sub-pixel
       strokes that used to carry the job are gone. */
    '#scr-party .kq-terr.legal{filter:drop-shadow(0 0 5px rgba(255,255,255,.9))}' +
    '#scr-party .kq-terr.target{filter:drop-shadow(0 0 6px rgba(255,255,255,.9))}' +
    '#scr-party .kq-terr.sel{filter:drop-shadow(0 0 7px rgba(255,197,66,.95))}' +
    /* the aged-paper grain, one clipped rect over the whole landmass. If the
       texture 404s the pattern paints nothing and the rect is invisible. */
    /* .28, NOT .48. At .48 the paper ate the continents: measured off real
       screenshots, the two closest continent colours fell from 11.2 to 9.6
       CIELAB deltaE and mean saturation dropped 23%. Anything under about 15
       is a pair a player confuses at a glance, and in this game telling
       continents apart is not decoration — you are constantly judging how
       close you are to owning a whole one for its bonus. The grain still
       reads at .28; the six families stay six families.
       That 11.2 was the PALETTE's problem showing through the paper, not the
       paper's — Solmar and Vantia really were the same colour once muted.
       Both are fixed above (CONT_HEX, and the unowned mute in TERR_SHADE)
       and the tightest of the fifteen pairs now measures 18.9 through this
       multiply in the worst state and 28.1 on live land. If you raise this
       opacity again, re-run scratchpad/kq-lab.js — it computes the whole
       matrix from the source values instead of sampling pixels, and every
       pair has to stay over 15. */
    '#scr-party .kq-paper{pointer-events:none;mix-blend-mode:multiply;opacity:.28}' +
    /* THE COASTLINE — what makes land read as land. Two rings grown outward
       from the same polygons (geometry untouched): a near-black continental
       shelf carrying the drop shadow onto the water, and a pale sand rim just
       inside it. Both are painted, not moved. */
    '#scr-party .kq-shelf{stroke-linejoin:round;pointer-events:none}' +
    '#scr-party .kq-rim{stroke-linejoin:round;pointer-events:none}' +
    /* the seat-colour owner ring: a stroke-only path over the land.
       THE ACTIVE SEAT is the one at full strength; every other seat's ring is
       held back, so whose turn it is reads from across the room. */
    /* NON-SCALING, for the same reason as the highlight layer above: at 360x640
       the map draws about a third of its user units, so a 3-unit ring was
       rendering at ONE pixel and ownership — the game's most important read —
       was thinner than a hairline. In screen pixels it is the same weight on
       every phone. */
    '#scr-party .kq-ring{fill:none;stroke-width:2;pointer-events:none;stroke-linejoin:round;' +
      'vector-effect:non-scaling-stroke;opacity:.5;transition:opacity .18s,stroke-width .18s}' +
    'body.reduced #scr-party .kq-ring{transition:none}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .kq-ring{transition:none}}' +
    '#scr-party .kq-ring.act{stroke-width:3.2;opacity:1;animation:kq-rim 1.9s ease-in-out infinite}' +
    '@keyframes kq-rim{0%,100%{opacity:1}50%{opacity:.44}}' +
    'body.reduced #scr-party .kq-ring.act{animation:none;opacity:1}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .kq-ring.act{animation:none;opacity:1}}' +
    /* THE DIMMED RING LIVES HERE, NOT UP WITH THE REST OF THE SELECTION CSS,
       and the reason is the cascade: `.kq-ring.act` and `.kq-ring.dim` have
       identical specificity, so whichever is written LAST wins. Written with
       its siblings it lost — and since the active seat during your own turn is
       YOU, every land you were not choosing between kept a full-strength
       pulsing ring and the recede did half its job. */
    '#scr-party .kq-ring.dim,#scr-party .kq-ring.act.dim{opacity:.13;stroke-width:1.6;animation:none}' +
    '#scr-party .kq-ring.dim2,#scr-party .kq-ring.act.dim2{opacity:.3;stroke-width:2;animation:none}' +
    /* the badge disc is ALWAYS dark — a white numeral on an amber seat colour
       was the one unreadable combination. The seat colour survives as the disc's
       tint and its bright rim, so ownership still reads off the badge alone. */
    '#scr-party .kq-badge circle{stroke-width:2.2}' +
    '#scr-party .kq-badge text{font:900 14px/1 var(--disp);fill:#fff;text-anchor:middle;' +
      'dominant-baseline:central;paint-order:stroke;stroke:rgba(0,0,0,.75);stroke-width:3px}' +
    /* subtle per-territory name (small, on the land) — engraved, not floated */
    '#scr-party .kq-tname{font:800 8px/1 var(--body);fill:rgba(255,255,255,.58);text-anchor:middle;' +
      'pointer-events:none;letter-spacing:.02em;paint-order:stroke;stroke:rgba(6,14,24,.55);' +
      'stroke-width:2px}' +
    /* the SEA-ROUTE lanes between continents: a dark casing so the dashes
       survive the water texture, then the dashes themselves. A player who
       cannot see a sea route cannot plan around one. */
    '#scr-party .kq-lanecase{stroke:rgba(3,11,20,.62);stroke-width:6;stroke-linecap:round;' +
      'fill:none;pointer-events:none}' +
    '#scr-party .kq-lane{stroke:rgba(188,224,250,.9);stroke-width:2.6;stroke-dasharray:3.5 8;' +
      'stroke-linecap:round;fill:none;pointer-events:none}' +
    '#scr-party .kq-lanedot{fill:rgba(214,236,255,.92);stroke:rgba(3,11,20,.6);stroke-width:1.4;' +
      'pointer-events:none}' +
    /* the capture sweep host — the old colour sliding off a taken land */
    '#scr-party .kq-cap{pointer-events:none}' +
    /* the CONTINENT label plaque: NAME + BONUS on/near the landmass */
    '#scr-party .kq-clabel{pointer-events:none}' +
    '#scr-party .kq-clabel rect{rx:7}' +
    '#scr-party .kq-clabel .cl-nm{font:900 12px/1 var(--disp);letter-spacing:.06em;' +
      'text-transform:uppercase;text-anchor:middle;dominant-baseline:central;' +
      'paint-order:stroke;stroke:rgba(0,0,0,.55);stroke-width:3px}' +
    '#scr-party .kq-clabel .cl-bn{font:900 12px/1 var(--disp);fill:#fff;text-anchor:middle;' +
      'dominant-baseline:central;paint-order:stroke;stroke:rgba(0,0,0,.55);stroke-width:3px}' +

    /* ══ THE TURN HAND-OFF — a machine's turn should be legible, not a board
       that silently mutates. Transform + opacity only, pointer-events none, and
       it decorates a turn change that has ALREADY happened, so it delays and
       blocks nothing. Reduced motion gets the same plaque without the slide. ══ */
    '@keyframes kq-hand{0%{transform:translateY(-14px);opacity:0}' +
      '14%{transform:none;opacity:1}72%{transform:none;opacity:1}' +
      '100%{transform:translateY(-10px);opacity:0}}' +
    '#scr-party .kq-hand-off{position:absolute;left:0;right:0;top:8px;z-index:22;display:flex;' +
      'justify-content:center;pointer-events:none}' +
    '#scr-party .kq-hand-off span{display:inline-flex;align-items:center;gap:7px;max-width:86%;' +
      'padding:6px 12px 6px 8px;border-radius:12px;font:900 10.5px/1.2 var(--disp);' +
      'letter-spacing:.08em;text-transform:uppercase;color:#fff;white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis;' +
      'background:linear-gradient(180deg,rgba(23,64,106,.96),rgba(6,16,28,.96));' +
      'border:1px solid rgba(255,255,255,.18);box-shadow:0 8px 22px rgba(0,0,0,.55);' +
      'animation:kq-hand 1.25s var(--ease,ease) both}' +
    '#scr-party .kq-hand-off i{width:13px;height:13px;flex:0 0 auto;border-radius:50%;' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 1px 3px rgba(0,0,0,.5)}' +
    'body.reduced #scr-party .kq-hand-off span{animation:none}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .kq-hand-off span{animation:none}}' +

    /* ── first-run tip toast over the map ── */
    '#scr-party .kq-tip{position:absolute;left:8px;right:8px;bottom:8px;z-index:20;' +
      'padding:9px 12px;border-radius:12px;font:600 11.5px/1.4 var(--body);color:#1a1205;' +
      'background:linear-gradient(180deg,#FFE6A0,#F2C860);box-shadow:0 6px 18px rgba(0,0,0,.5);' +
      'display:flex;align-items:center;gap:9px}' +
    '#scr-party .kq-tip b{font-weight:900}' +
    '#scr-party .kq-tip button{margin-left:auto;flex:0 0 auto;border:0;background:rgba(0,0,0,.14);' +
      'color:#1a1205;font:900 10px/1 var(--disp);padding:6px 9px;border-radius:8px;cursor:pointer}' +

    /* ── rules panel (slide from the top) ── */
    '#scr-party .kq-rules{position:absolute;top:0;left:0;right:0;z-index:30;max-height:70%;' +
      'display:flex;flex-direction:column;border-radius:14px;overflow:hidden;' +
      'background:linear-gradient(180deg,#123452,#0a1c30);border:1px solid rgba(255,255,255,.16);' +
      'box-shadow:0 14px 30px rgba(0,0,0,.55);' +
      'transform:translateY(-108%);opacity:0;visibility:hidden;pointer-events:none;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease),visibility 0s .26s}' +
    '#scr-party .kq-rules.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease)}' +
    'body.reduced #scr-party .kq-rules{transition:none}' +
    '#scr-party .kq-rules-h{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:9px 4px 2px 14px}' +
    '#scr-party .kq-rules-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;text-transform:uppercase;color:var(--kq-gold)}' +
    '#scr-party .kq-rules-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;color:var(--txt);' +
      'cursor:pointer;display:grid;place-items:center;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .kq-rules-x svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round}' +
    '#scr-party .kq-rules-b{min-height:0;overflow-y:auto;padding:2px 14px 12px;-webkit-overflow-scrolling:touch}' +
    '#scr-party .kq-rules-b li{font-size:12px;line-height:1.55;color:var(--dim);margin:0 0 6px 14px}' +

    /* ── the combat dice themselves (laid out in pairs by .kq-fight below) ── */
    '#scr-party .kq-die{width:34px;height:34px;border-radius:8px;background:linear-gradient(160deg,#fff,#dfe4ea);' +
      'box-shadow:0 3px 8px rgba(0,0,0,.5),inset 0 -3px 5px rgba(0,0,0,.12);' +
      'display:grid;place-items:center;font:900 20px/1 var(--disp);color:#12202e;position:relative}' +
    '#scr-party .kq-die.atk{background:linear-gradient(160deg,#ffd9d9,#ff9d9d)}' +
    '#scr-party .kq-die.def{background:linear-gradient(160deg,#d9e6ff,#9dc0ff)}' +
    '#scr-party .kq-die.lose{opacity:.35;transform:scale(.82)}' +
    '#scr-party .kq-die.win{box-shadow:0 0 0 2px #FFC542,0 3px 8px rgba(0,0,0,.5)}' +
    '@keyframes kq-shake{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-3px) rotate(-8deg)}75%{transform:translateY(2px) rotate(8deg)}}' +
    '#scr-party .kq-die.roll{animation:kq-shake .12s linear infinite}' +
    'body.reduced #scr-party .kq-die.roll{animation:none}' +

    /* ── the entry menu face ── */
    '#scr-party .kq-menu .pt-lbl{color:#9ec5e8}' +
    '#scr-party .kq-menu .kq-hero{position:relative;display:flex;align-items:center;justify-content:center;' +
      'margin:2px 0 12px;padding:14px 8px;border-radius:16px;overflow:hidden;' +
      'background:radial-gradient(120% 130% at 50% 15%,#1a5080 0%,var(--kq-sea) 55%,var(--kq-sea2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.06),inset 0 -14px 26px rgba(0,0,0,.4)}' +
    '#scr-party .kq-menu .kq-hero svg{width:100%;max-width:280px;height:auto;display:block}' +
    '#scr-party .kq-menu .kq-hero-cap{position:absolute;right:11px;bottom:8px;font:900 9.5px/1 var(--disp);' +
      'letter-spacing:.18em;color:rgba(255,255,255,.34)}' +
    '#scr-party .kq-note{font-size:11.5px;line-height:1.6;margin:8px 2px 0;padding:9px 11px;border-radius:12px;' +
      'text-transform:none;letter-spacing:0;color:#cfe2f0;background:rgba(60,140,220,.10);border:1px solid rgba(60,140,220,.3)}' +

    /* ── the cards button (in the banner) + card sheet ── */
    '#scr-party .kq-cards{flex:0 0 auto;position:relative;border:0;cursor:pointer;' +
      'font:900 11px/1 var(--disp);letter-spacing:.03em;padding:8px 10px;border-radius:11px;' +
      'min-height:44px;min-width:44px;justify-content:center;' +
      'color:#1a1205;background:linear-gradient(180deg,#EFE3C4,#CBB884);' +
      'box-shadow:0 2px 0 rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.5);' +
      '-webkit-tap-highlight-color:transparent;display:flex;align-items:center;gap:5px;white-space:nowrap}' +
    '#scr-party .kq-cards:active{transform:translateY(1px)}' +
    '#scr-party .kq-cards .kq-cico{width:15px;height:15px;flex:0 0 auto;fill:none;' +
      'stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}' +
    '#scr-party .kq-cards b{font:900 13px/1 var(--disp)}' +
    '#scr-party .kq-cards.trade{background:linear-gradient(180deg,#FFDD7A,#E9A81F);animation:kq-cardpulse 1.4s ease-in-out infinite}' +
    '#scr-party .kq-cards.must{background:linear-gradient(180deg,#ff9d6b,#e8552a);color:#fff}' +
    '@keyframes kq-cardpulse{0%,100%{box-shadow:0 2px 0 rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.5)}50%{box-shadow:0 0 0 3px rgba(255,197,66,.5),0 2px 0 rgba(0,0,0,.35)}}' +
    'body.reduced #scr-party .kq-cards.trade{animation:none}' +

    /* the card SHEET (slides up from the bottom of the map) */
    '#scr-party .kq-sheet{position:absolute;inset:0;z-index:40;display:flex;align-items:flex-end;' +
      'justify-content:center;background:rgba(0,0,0,.5)}' +
    '#scr-party .kq-sheet-in{width:100%;max-width:460px;margin:0 6px 8px;max-height:86%;overflow-y:auto;' +
      '-webkit-overflow-scrolling:touch;padding:14px 13px 13px;border-radius:16px;' +
      'background:linear-gradient(180deg,#123452,#0a1c30);border:1px solid rgba(255,255,255,.16);' +
      'box-shadow:0 -8px 30px rgba(0,0,0,.55)}' +
    '#scr-party .kq-sheet-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}' +
    '#scr-party .kq-sheet-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.08em;text-transform:uppercase;color:var(--kq-gold)}' +
    '#scr-party .kq-sheet-x{width:36px;height:36px;margin:-8px -6px -8px 0;border:0;background:none;color:#fff;' +
      'cursor:pointer;display:grid;place-items:center;font:900 18px/1 var(--disp);-webkit-tap-highlight-color:transparent}' +
    '#scr-party .kq-hand{display:flex;flex-wrap:wrap;gap:7px;margin:2px 0 4px}' +
    '#scr-party .kq-card{flex:0 0 auto;width:70px;height:92px;border-radius:10px;position:relative;cursor:pointer;' +
      'background:linear-gradient(160deg,#fbf4e2,#e3d3a8);box-shadow:0 2px 6px rgba(0,0,0,.45);' +
      'border:2px solid transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;' +
      '-webkit-tap-highlight-color:transparent;overflow:hidden}' +
    '#scr-party .kq-card.sel{border-color:var(--kq-gold);box-shadow:0 0 0 2px var(--kq-gold),0 2px 6px rgba(0,0,0,.45)}' +
    '#scr-party .kq-card .sym{font-size:26px;line-height:1}' +
    '#scr-party .kq-card .nm{font:800 8px/1.1 var(--body);color:#3a2c12;text-align:center;padding:0 3px;max-width:100%}' +
    '#scr-party .kq-card .wild{font:900 9px/1 var(--disp);letter-spacing:.1em;color:#8a4bd0;text-transform:uppercase}' +
    '#scr-party .kq-card .dot{position:absolute;top:5px;left:5px;width:9px;height:9px;border-radius:50%;box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}' +
    '#scr-party .kq-trade-row{display:flex;gap:8px;align-items:center;margin-top:8px}' +
    '#scr-party .kq-trade-row .kq-act{flex:1}' +
    '#scr-party .kq-hint2{font:600 11px/1.4 var(--body);color:rgba(255,255,255,.72);margin:4px 0 2px}' +

    /* the continent-bonus legend */
    '#scr-party .kq-conts{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:4px}' +
    '#scr-party .kq-cont{display:flex;align-items:center;gap:6px;padding:5px 7px;border-radius:9px;' +
      'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}' +
    '#scr-party .kq-cont.mine{background:rgba(255,197,66,.16);border-color:rgba(255,197,66,.55)}' +
    '#scr-party .kq-cont .cs{width:12px;height:12px;flex:0 0 auto;border-radius:3px}' +
    '#scr-party .kq-cont .cnm{flex:1;min-width:0;font:800 10px/1.1 var(--disp);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .kq-cont .cbn{flex:0 0 auto;font:900 11px/1 var(--disp);color:var(--kq-gold)}' +
    '#scr-party .kq-cont.mine .cbn{color:#7CF29B}' +
    '#scr-party .kq-cont .ck{flex:0 0 auto;font:700 8px/1 var(--body);color:rgba(255,255,255,.5)}' +

    /* ══ THE TURN READOUT — "tell u how much u got troops" ══
       The single most important thing this screen says. It lands over the map
       at the top of the player's own Reinforce, unmissable and one tap away
       from gone. Every line is one reason he was given armies, and the total
       is the biggest number on the screen. */
    '@keyframes kq-pop{from{transform:scale(.9);opacity:0}to{transform:none;opacity:1}}' +
    '@keyframes kq-rise{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}' +
    '#scr-party .kq-turn{position:absolute;inset:0;z-index:46;display:flex;align-items:center;' +
      'justify-content:center;padding:10px;background:rgba(4,12,22,.66)}' +
    /* Column, not a blob: if the reasons ever outgrow the phone (six
       continents plus a trade) it is the REASONS that scroll — the total and
       the button that dismisses it stay pinned and reachable. A dialogue you
       cannot dismiss without scrolling is a dialogue that traps a turn. */
    '#scr-party .kq-turn-in{width:100%;max-width:330px;max-height:100%;display:flex;' +
      'flex-direction:column;padding:14px 14px 12px;border-radius:18px;' +
      'background:linear-gradient(180deg,#17406a,#0a1c30);border:1px solid rgba(255,197,66,.55);' +
      'box-shadow:0 18px 44px rgba(0,0,0,.62),inset 0 1px 0 rgba(255,255,255,.12);' +
      'animation:kq-pop .22s var(--ease,ease) both}' +
    '#scr-party .kq-turn-rows{flex:1 1 auto;min-height:0;overflow-y:auto;' +
      '-webkit-overflow-scrolling:touch}' +
    'body.reduced #scr-party .kq-turn-in{animation:none}' +
    '#scr-party .kq-turn-h{font:900 10px/1 var(--disp);letter-spacing:.14em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.55);margin-bottom:2px}' +
    '#scr-party .kq-turn-t{font:900 17px/1.1 var(--disp);color:var(--kq-gold);margin-bottom:9px}' +
    '#scr-party .kq-trow{display:flex;align-items:center;gap:8px;padding:6px 0;' +
      'border-bottom:1px solid rgba(255,255,255,.07)}' +
    '#scr-party .kq-trow .cs{width:11px;height:11px;flex:0 0 auto;border-radius:3px}' +
    '#scr-party .kq-trow .tl{flex:1;min-width:0;font:700 11.5px/1.35 var(--body);color:rgba(255,255,255,.88)}' +
    '#scr-party .kq-trow .tl i{display:block;font-style:normal;font-weight:600;font-size:9.5px;' +
      'color:rgba(255,255,255,.5)}' +
    '#scr-party .kq-trow .tv{flex:0 0 auto;font:900 16px/1 var(--disp);color:#7CF29B}' +
    '#scr-party .kq-ttot{display:flex;align-items:center;gap:9px;margin-top:10px;padding-top:9px;' +
      'border-top:2px solid rgba(255,197,66,.5)}' +
    '#scr-party .kq-ttot .tl{flex:1;font:900 10.5px/1.2 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--kq-gold)}' +
    '#scr-party .kq-ttot .tv{font:900 36px/1 var(--disp);color:#fff}' +
    '#scr-party .kq-turn-acts{display:grid;gap:8px;margin-top:12px}' +
    '#scr-party .kq-turn-acts .kq-act{width:100%;min-height:46px;font-size:12px}' +

    /* ══ THE ATTACK SHEET — a tap is never a strike ══ */
    '#scr-party .kq-atk{position:absolute;inset:0;z-index:44;display:flex;align-items:flex-end;' +
      'justify-content:center;background:rgba(4,12,22,.58)}' +
    /* Same shape as the readout, same reason: Attack and Cancel are PINNED.
       At 360x640 this sheet was taller than the map box and the two buttons
       that matter sat below the fold. Only the explanation may scroll. */
    '#scr-party .kq-atk-in{width:100%;max-width:440px;margin:0 6px 8px;max-height:98%;' +
      'display:flex;flex-direction:column;padding:10px 12px 11px;border-radius:18px;' +
      'background:linear-gradient(180deg,#17406a,#0a1c30);border:1px solid rgba(255,255,255,.18);' +
      'box-shadow:0 -10px 34px rgba(0,0,0,.6);animation:kq-rise .2s var(--ease,ease) both}' +
    '#scr-party .kq-atk-body{flex:1 1 auto;min-height:0;overflow-y:auto;' +
      '-webkit-overflow-scrolling:touch}' +
    'body.reduced #scr-party .kq-atk-in{animation:none}' +
    '#scr-party .kq-atk-h{font:900 11px/1 var(--disp);letter-spacing:.12em;text-transform:uppercase;' +
      'color:var(--kq-gold);margin-bottom:7px}' +
    '#scr-party .kq-vs{display:flex;align-items:stretch;gap:6px;margin-bottom:8px}' +
    '#scr-party .kq-vs .sd{flex:1 1 0;min-width:0;padding:6px 8px;border-radius:12px;' +
      'background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.10)}' +
    '#scr-party .kq-vs .sd .hd{display:flex;align-items:center;gap:5px}' +
    '#scr-party .kq-vs .sd .sw{width:12px;height:12px;flex:0 0 auto;border-radius:50%;' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}' +
    '#scr-party .kq-vs .sd .nm{flex:1;min-width:0;font:900 9.5px/1.2 var(--disp);letter-spacing:.04em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.72);white-space:nowrap;overflow:hidden;' +
      'text-overflow:ellipsis}' +
    '#scr-party .kq-vs .sd .ar{display:flex;align-items:baseline;gap:5px;margin-top:2px}' +
    '#scr-party .kq-vs .sd .ar b{font:900 23px/1 var(--disp);color:#fff}' +
    '#scr-party .kq-vs .sd .ar i{font:700 8.5px/1.1 var(--body);font-style:normal;' +
      'letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.55)}' +
    '#scr-party .kq-vs .mid{flex:0 0 auto;width:24px;display:grid;place-items:center}' +
    '#scr-party .kq-vs .mid svg{width:22px;height:22px;fill:none;stroke:var(--kq-gold);' +
      'stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}' +
    '#scr-party .kq-lbl{font:900 9.5px/1 var(--disp);letter-spacing:.1em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.6);margin:0 0 5px}' +
    '#scr-party .kq-dpick{display:flex;gap:7px;margin-bottom:9px}' +
    '#scr-party .kq-dpick button{flex:1 1 0;min-height:48px;border:0;border-radius:12px;cursor:pointer;' +
      'color:#fff;background:rgba(255,255,255,.09);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16);' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .kq-dpick button:active{transform:translateY(1px)}' +
    '#scr-party .kq-dpick button b{font:900 17px/1 var(--disp)}' +
    '#scr-party .kq-dpick button i{font:700 8px/1 var(--body);font-style:normal;opacity:.7;' +
      'letter-spacing:.06em;text-transform:uppercase}' +
    '#scr-party .kq-dpick button.on{color:#1a1205;background:linear-gradient(180deg,#FFDD7A,#E9A81F);' +
      'box-shadow:0 2px 0 rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.5)}' +
    '#scr-party .kq-dpick button.on i{opacity:.75}' +
    '#scr-party .kq-obar{display:flex;height:12px;border-radius:6px;overflow:hidden;' +
      'background:rgba(0,0,0,.4);margin-bottom:5px}' +
    '#scr-party .kq-obar span{display:block;height:100%}' +
    '#scr-party .kq-okey{display:flex;flex-wrap:wrap;gap:2px 9px;margin-bottom:7px}' +
    '#scr-party .kq-okey b{display:flex;align-items:center;gap:4px;font:700 9.5px/1.4 var(--body);' +
      'color:rgba(255,255,255,.85);white-space:nowrap}' +
    '#scr-party .kq-okey b em{width:8px;height:8px;flex:0 0 auto;border-radius:2px;font-style:normal}' +
    '#scr-party .kq-okey b u{text-decoration:none;font-weight:900;color:#fff}' +
    /* the two numbers a player actually decides on, as pills rather than prose:
       four lines of paragraph were what pushed the buttons off a 360px phone. */
    '#scr-party .kq-stats{display:flex;gap:7px;margin-bottom:6px}' +
    '#scr-party .kq-stats .st{flex:1 1 0;min-width:0;padding:6px 8px;border-radius:11px;' +
      'background:rgba(60,140,220,.13);border:1px solid rgba(60,140,220,.3)}' +
    '#scr-party .kq-stats .st b{display:block;font:900 19px/1 var(--disp);color:var(--kq-gold)}' +
    '#scr-party .kq-stats .st i{display:block;margin-top:2px;font:700 8.5px/1.25 var(--body);' +
      'font-style:normal;color:#cfe2f0}' +
    '#scr-party .kq-note{font:700 9px/1.35 var(--body);color:rgba(255,255,255,.6);margin-bottom:2px}' +
    '#scr-party .kq-atk-acts{flex:0 0 auto;display:grid;grid-template-columns:1fr 1.5fr;gap:9px;margin-top:9px}' +
    '#scr-party .kq-atk-acts .kq-act{width:100%;min-height:46px;font-size:12px}' +

    /* ══ THE FIGHT — dice paired highest against highest ══ */
    '#scr-party .kq-fight{position:absolute;inset:0;z-index:34;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(4,12,22,.44)}' +
    '#scr-party .kq-fight-in{padding:10px 14px 9px;border-radius:16px;' +
      'background:linear-gradient(180deg,rgba(23,64,106,.97),rgba(10,28,48,.97));' +
      'border:1px solid rgba(255,255,255,.18);box-shadow:0 12px 34px rgba(0,0,0,.62)}' +
    '#scr-party .kq-fhead{display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:7px}' +
    '#scr-party .kq-fhead .fn{font:900 9.5px/1.1 var(--disp);letter-spacing:.06em;text-transform:uppercase;' +
      'max-width:88px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .kq-fhead .fv{font:900 8.5px/1 var(--disp);color:rgba(255,255,255,.45);letter-spacing:.1em}' +
    '#scr-party .kq-pair{display:flex;align-items:center;justify-content:center;gap:8px;margin:5px 0}' +
    '#scr-party .kq-cmp{width:24px;height:24px;flex:0 0 auto;display:grid;place-items:center}' +
    '#scr-party .kq-cmp svg{width:19px;height:19px;fill:none;stroke:rgba(255,255,255,.3);' +
      'stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}' +
    '#scr-party .kq-cmp.a svg{stroke:#7CF29B}' +
    '#scr-party .kq-cmp.d svg{stroke:#ff8a6b}' +
    '#scr-party .kq-hole{width:34px;height:34px;flex:0 0 auto;border-radius:8px;' +
      'border:2px dashed rgba(255,255,255,.16)}' +
    '#scr-party .kq-floss{display:flex;gap:8px;justify-content:center;margin-top:8px}' +
    '#scr-party .kq-floss span{font:900 10.5px/1 var(--disp);letter-spacing:.05em;padding:6px 9px;' +
      'border-radius:9px;background:rgba(0,0,0,.36);color:rgba(255,255,255,.5)}' +
    '#scr-party .kq-floss span.hit{color:#fff;background:rgba(232,85,42,.62)}' +
    '#scr-party .kq-floss span.good{color:#0d2416;background:rgba(124,242,155,.88)}' +
    /* an army badge counting a loss off — and one counting a gain on */
    '#scr-party .kq-badge.tick text{fill:#ff8a6b}' +
    '#scr-party .kq-badge.gain text{fill:#7CF29B}' +

    /* ══ SHORT PHONES ══
       The map is HEIGHT-BOUND (viewBox 660x1160, preserveAspectRatio meet), so
       on a 360x640 phone every pixel of chrome costs about 0.57px of map WIDTH
       — and 360x640 is the size where the board was drawing barely 215px wide.
       So this block gives the map back everything that is not a thumb: padding,
       gaps, type size and the seat chips' bulk. NOT ONE CONTROL DROPS BELOW
       44px; the padding around them goes instead, which is the only honest way
       to spend height. */
    '@media (max-height:700px){' +
      '#scr-party .kq-wrap{gap:3px;padding:2px 0 3px}' +
      '#scr-party .pt-bar.kq-phasebar{margin-top:4px}' +
      '#scr-party .kq-prow{gap:4px}' +
      '#scr-party .kq-pstep{padding:2px;gap:3px;font-size:9px;letter-spacing:.01em}' +
      '#scr-party .kq-pstep .ico{font-size:12px}' +
      '#scr-party .kq-pstep .kq-pn{font-size:10.5px;min-width:16px;padding:0 3px}' +
      '#scr-party .kq-pline{margin-top:3px;font-size:9.5px;line-height:1.3}' +
      '#scr-party .kq-pline b{font-size:9px}' +
      '#scr-party .kq-act{padding:8px 9px;font-size:10px}' +
      '#scr-party .kq-wait{padding:8px 9px;font-size:9px}' +
      '#scr-party .kq-chip{padding:2px 6px 2px 3px;gap:5px}' +
      '#scr-party .kq-chip .kq-face,#scr-party .kq-chip .kq-bot{width:26px;height:26px}' +
      '#scr-party .kq-chip .cn b{font-size:8.5px;max-width:62px}' +
      '#scr-party .kq-chip .cn i{font-size:8px;gap:4px}' +
      '#scr-party .kq-tool{border-radius:11px}' +
      '#scr-party .kq-tool .ico{font-size:17px}' +
      '#scr-party .kq-ctx{min-height:44px;gap:6px}' +
    '}' +

    /* VERY NARROW PHONES — the labels go and the icons stay. Three words and a
       button do not fit across 320px at a size anybody can read, and a clipped
       word ("ATTA…") is worse than no word: the icon plus the gold "you are
       here" treatment still says which step you are on, and the line under the
       bar names it in full. */
    '@media (max-width:340px){' +
      '#scr-party .kq-pstep b{display:none}' +
      '#scr-party .kq-pstep .ico{font-size:16px}' +
      '#scr-party .kq-wait{max-width:46%}' +
    '}' +

    /* ── landscape ── */
    '@media (max-height:520px){' +
      '#scr-party .kq-wrap{padding:4px}' +
      /* landscape steals height from the map, never from the thumb: the phase
         bar loses its padding and its second row's slack, not its 44px cells. */
      '#scr-party .kq-pfoot{margin-top:3px}' +
      '#scr-party .kq-turn-in{max-width:420px;padding:10px 12px}' +
      '#scr-party .kq-ttot .tv{font-size:28px}' +
    '}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   THE FRAME + THE BOARD DOM
   ═══════════════════════════════════════════════════════════════════ */
function openBoard(onBack){
  /* NO BUTTONS IN THE FRAME'S BAR. `.pt-bar` is the strip under the board, and
     it used to hold RULES and NEW — a whole row for two things nobody presses
     once a minute, on a screen whose map is starved of height. The bar belongs
     to the TURN now (buildPhaseBar fills M.ctx.bar below), and the two tools
     ride beside the seat row as 44px icon buttons.
     ctx.btn(id) searches the whole .pt-wrap, so kq-rules / kq-new keep working
     exactly as before wherever they end up living. */
  M.ctx = P.ui.frame({
    title: T('Konkwista', 'Konkwista'),
    onBack,
    leave: () => leave(),
    barCls: 'kq-phasebar',
    buttons: []
  });
  if (M.ctx.stopFit) M.ctx.stopFit();     /* we size our own map */
  M.ctx.badge.textContent = isOnlineMatch() ? T('Online', 'Onlajn')
    : anyAI() ? T('vs Machine', 'kontra l-Magna')
    : T('Pass & play', 'Għaddi u lgħab');
  buildBoard();                            /* which also builds the phase bar */
  M.ctx.btn('kq-rules').onclick = () => setRules(!rulesOpen);
  /* ONLINE HAS NO "NEW". It is not disabled and it is not hidden — it is not
     in the DOM at all (buildBoard omits it), because a button that folds the
     map away has no meaning at a table of other people. The null guard below
     is what makes omitting it safe, and `if (M.net) return` stays inside the
     handler as belt-and-braces for any path that resurrects it. */
  const nb = M.ctx.btn('kq-new');
  if (nb) nb.onclick = () => {
    if (isOnlineMatch()) return;
    P.ui.confirm(M.ctx, {
      head: T('Start a fresh campaign?', 'Tibda kampanja ġdida?'),
      why:  T('This map is folded away and a new one is dealt.',
              'Din il-mappa titwarrab u tinqasam waħda ġdida.'),
      yes:  T('New campaign', 'Kampanja ġdida'),
      no:   T('No, carry on', 'Le, kompli'),
      go: () => setupSheet()
    });
  };
  paintRules();
}
function anyAI(){ if (!M) return false; for (let i=0;i<M.st.seats;i++) if (ownerOf(i)==='ai') return true; return false; }

function buildBoard(){
  const ctx = M.ctx;
  ctx.host.classList.add('kq-host');
  ctx.host.innerHTML =
    '<div class="kq-wrap" id="kq-wrap">' +
      /* the seat row, and the two tools that used to own a whole bar */
      '<div class="kq-top" id="kq-top">' +
        '<div class="kq-seats" id="kq-seats"></div>' +
        '<div class="kq-tools" id="kq-tools">' +
          '<button class="kq-tool" id="kq-rules" aria-label="' + esc(T('Rules', 'Regoli')) + '">' +
            ico('book') + '</button>' +
          /* NEW is ABSENT online — not disabled, not hidden. */
          (isOnlineMatch() ? '' :
            '<button class="kq-tool" id="kq-new" aria-label="' + esc(T('New campaign', 'Kampanja ġdida')) + '">' +
              ico('refresh') + '</button>') +
        '</div>' +
      '</div>' +
      /* the contextual row: in the layout ONLY while the engine wants one of
         these two. Its [hidden] rules are in the stylesheet above — without
         them `el.hidden = true` is a no-op, which is the bug the old banner
         shipped with. */
      '<div class="kq-ctx" id="kq-ctx" hidden>' +
        '<span class="kq-step" id="kq-step" hidden>' +
          '<span class="kq-slbl">' + esc(T('Place', 'Qiegħed')) + '</span>' +
          '<button id="kq-minus" aria-label="' + esc(T('Fewer','Inqas')) + '">−</button>' +
          '<span class="kq-n" id="kq-placen">1</span>' +
          '<button id="kq-plus" aria-label="' + esc(T('More','Aktar')) + '">+</button>' +
        '</span>' +
        '<button class="kq-cards" id="kq-cards" hidden aria-label="' + esc(T('Your cards','Il-karti tiegħek')) + '"></button>' +
      '</div>' +
      '<div class="kq-mapbox" id="kq-mapbox">' +
        '<img class="kq-mapbg" id="kq-mapbg" alt="" aria-hidden="true" ' +
          'src="' + SEA_TEX + '" ' +
          'onerror="this.onerror=null;this.src=\'art/ui/konkwista-bg.png\';' +
            'this.style.opacity=\'.5\';this.onerror=function(){this.style.display=\'none\'}">' +
        '<span class="kq-mapvig" aria-hidden="true"></span>' +
        '<svg class="kq-svg" id="kq-svg" viewBox="0 0 660 1160" preserveAspectRatio="xMidYMid meet" ' +
          'role="img" aria-label="' + esc(T('The conquest map','Il-mappa tal-konkwista')) + '"></svg>' +
      '</div>' +
      '<div class="kq-rules" id="kq-rulespanel" aria-hidden="true">' +
        '<div class="kq-rules-h"><h4 id="kq-rules-t"></h4>' +
          '<button class="kq-rules-x" id="kq-rules-x" aria-label="' + esc(T('Put the rules away','Warrab ir-regoli')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<div class="kq-rules-b" id="kq-rules-b"></div>' +
      '</div>' +
    '</div>';
  const root = ctx.host.querySelector('#kq-wrap');
  UI = {
    ctx, root,
    ctxrow: root.querySelector('#kq-ctx'),
    step:   root.querySelector('#kq-step'),
    placen: root.querySelector('#kq-placen'),
    cards:  root.querySelector('#kq-cards'),
    act:    null,                      /* built by buildPhaseBar into ctx.bar */
    seats:  root.querySelector('#kq-seats'),
    mapbox: root.querySelector('#kq-mapbox'),
    svg:    root.querySelector('#kq-svg'),
    rules:  root.querySelector('#kq-rulespanel'),
    seatSig: '',                       /* the structural signature of the chips */
    seatEls: [],
    terrEls: {}, badgeEls: {}, ringEls: {}, labelEls: {}, hiEls: {}, markEls: {}
  };
  buildSVG();

  root.querySelector('#kq-rules-x').addEventListener('click', () => setRules(false));
  ctx.root.addEventListener('pointerdown', e => {
    if (!rulesOpen || !UI || !UI.rules) return;
    const rb = ctx.btn && ctx.btn('kq-rules');
    if (!UI.rules.contains(e.target) && !(rb && rb.contains(e.target))) setRules(false);
  }, true);

  UI.cards.onclick = () => openCardSheet();
  root.querySelector('#kq-minus').onclick = () => bumpPlace(-1);
  root.querySelector('#kq-plus').onclick  = () => bumpPlace(1);

  /* BEFORE the first paintAll, not after: paintPhaseBar() no-ops until the bar
     exists, so building it later leaves one frame of empty strip under the
     board. */
  buildPhaseBar();
  buildSeats();
  paintAll();
  maybeTip();
}

/* ═══════════════════════════════════════════════════════════════════
   THE PHASE BAR — built once into the frame's own bottom bar, painted
   from the engine on every pass. It HOLDS NO STATE of its own.
   ═══════════════════════════════════════════════════════════════════ */
function buildPhaseBar(){
  const bar = M && M.ctx && M.ctx.bar;
  if (!bar) return;
  bar.innerHTML =
    '<div class="kq-pb" id="kq-pb">' +
      '<div class="kq-prow">' +
        PHASE_STEPS.map(s =>
          '<button type="button" class="kq-pstep" id="kq-ps' + s.index + '" data-ph="' + s.index + '">' +
            '<span class="kq-pico" id="kq-psi' + s.index + '"></span>' +
            '<b id="kq-psb' + s.index + '"></b>' +
            '<span class="kq-pn" id="kq-psn' + s.index + '" hidden></span>' +
          '</button>').join('') +
        '<span class="kq-wait" id="kq-pwait" hidden></span>' +
        '<button type="button" class="kq-act" id="kq-act" hidden></button>' +
      '</div>' +
      /* EXACTLY ONE live region on this bar. Do not add a second one anywhere:
         two polite regions on one strip read over each other and the player
         hears neither. */
      '<span class="kq-pline" id="kq-pline" role="status" aria-live="polite"></span>' +
    '</div>';
  UI.pb    = bar.querySelector('#kq-pb');
  UI.pline = bar.querySelector('#kq-pline');
  UI.pwait = bar.querySelector('#kq-pwait');
  UI.act   = bar.querySelector('#kq-act');
  UI.pstep = PHASE_STEPS.map(s => ({
    el:   bar.querySelector('#kq-ps'  + s.index),
    ico:  bar.querySelector('#kq-psi' + s.index),
    b:    bar.querySelector('#kq-psb' + s.index),
    n:    bar.querySelector('#kq-psn' + s.index),
    index: s.index
  }));
  UI.act.onclick = onAct;
  UI.pstep.forEach(s => { s.el.onclick = () => onPhaseStep(s.index); });
}

/* TAPPING A STEP GOES DOWN THE SAME ROAD THE BUTTON DOES.
   E.check first, then doMove() + afterLocal() — so the move is recorded in the
   log, relayed by the online controller identically to a button press, and an
   out-of-turn or out-of-order tap is refused BY THE ENGINE rather than by a CSS
   class somebody could forget to apply. Forward exactly one step: `want` must
   be st.phase + 1, and 'endphase' is the only move it ever makes. */
function onPhaseStep(want){
  if (!M || M.dead || M.busy || M.picking) return;
  const st = M.st;
  if (E.over(st) || st._pending || E.inSetup(st)) return;
  const seat = E.turn(st);
  if (seat < 0 || !isLocal(seat)) return;
  if (want !== st.phase + 1) return;                    /* never back, never skip */
  const mv = { t:'endphase' };
  if (!E.check(st, mv, seat)){ cue('move.illegal', { gain:0.6 }); return; }
  if (st.phase === E.PH_ATTACK) M.sel = -1;
  cue('ui.tap', { gain:0.7 });
  buzz('tick');
  doMove(seat, mv, 'local');
  afterLocal();
}

/* where a continent's NAME+BONUS plaque sits: the widest gap near the top of
   its landmass, clear of badges. We take the continent bbox and drop the label
   at the horizontal centre, a little below the top edge. */
function contLabelAnchor(cid){
  const mem = E.REGION_MEMBERS[cid];
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  mem.forEach(i => { const p = E.TERRITORIES[i].poly;
    for (let k=0;k<p.length;k+=2){ x0=Math.min(x0,p[k]); x1=Math.max(x1,p[k]); y0=Math.min(y0,p[k+1]); y1=Math.max(y1,p[k+1]); } });
  return { x:(x0+x1)/2, y:y0 - 12, x0, y0, x1, y1 };
}

/* the polygon's own points, as an SVG points attribute. ONE place builds this
   string, because the 40 polygons are the engine's proven geometry and every
   layer below must trace exactly the same vertices — a coastline that is a
   redrawn approximation of the land is a coastline that lies about adjacency. */
function ptsOf(i){
  return E.TERRITORIES[i].poly.reduce((a, v, k) => a + (k % 2 ? ',' : (k ? ' ' : '')) + v, '');
}

/* build the vector map: sea-route lanes, the continental shelf + sand coast,
   one polygon per territory (continent fill), the aged-paper grain, a
   seat-colour owner ring, an army badge, and the continent plaques. */
function buildSVG(){
  const svg = UI.svg;
  const T = E.TERRITORIES;
  let s = '';

  /* 0 · DEFS — the drop shadow the coast casts onto the water, the paper
     pattern, and the land clip that keeps that paper on the land. */
  s += '<defs>' +
    '<filter id="kq-coastsh" x="-12%" y="-12%" width="124%" height="124%">' +
      '<feDropShadow dx="0" dy="9" stdDeviation="7" flood-color="#000209" flood-opacity="0.8"/>' +
    '</filter>' +
    /* userSpaceOnUse so the grain keeps ONE scale across the whole map instead
       of stretching per shape. A missing image paints nothing at all. */
    '<pattern id="kq-paperpat" patternUnits="userSpaceOnUse" x="0" y="0" width="210" height="210">' +
      '<image href="' + esc(LAND_TEX) + '" xlink:href="' + esc(LAND_TEX) + '" ' +
        'x="0" y="0" width="210" height="210" preserveAspectRatio="xMidYMid slice"></image>' +
    '</pattern>' +
    '<clipPath id="kq-landclip">' +
      T.map((t, i) => '<polygon points="' + ptsOf(i) + '"></polygon>').join('') +
    '</clipPath>' +
    '<clipPath id="kq-capclip"><polygon points="0,0 0,0 0,0"></polygon></clipPath>' +
  '</defs>';

  /* 1 · SEA-ROUTE lanes UNDER the land (dashed lanes over the water), each on
     a dark casing so the dashes survive the ocean texture. They are drawn
     first and everything else covers them, so a lane reads as a crossing of
     OPEN water and stops at the shore of both ends. */
  (E.SEA_ROUTE_IDX || []).forEach(pair => {
    const a = T[pair[0]].c, b = T[pair[1]].c;
    const l = ' x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"';
    s += '<line class="kq-lanecase"' + l + '></line>' +
      '<line class="kq-lane"' + l + '></line>' +
      '<circle class="kq-lanedot" cx="' + ((a[0]+b[0])/2).toFixed(0) + '" cy="' + ((a[1]+b[1])/2).toFixed(0) + '" r="3.4"></circle>';
  });

  /* 2 · THE COAST. The single change that makes land stop being a diagram.
     Each CONTINENT's own polygons are redrawn twice underneath the land, GROWN
     OUTWARD by a stroke rather than by moving a vertex: a near-black shelf that
     carries a soft drop shadow onto the sea, then a pale sand rim inside it.
     Because the copies sit under the land layer, every seam INSIDE a continent
     is covered and only the outer boundary survives — a real coastline, from
     the engine's exact geometry, with nothing recomputed.

     STROKE ONLY, never a fill. The 40 polygons do not tile perfectly — a
     handful of small bays sit between lands of the same continent — and a
     FILLED shelf turned every one of those into a solid black rectangle.
     Stroking alone leaves the wider bays as ringed open water and closes the
     narrowest into a pale shoal; either reads as a feature of the coast rather
     than a hole in the board. */
  s += '<g class="kq-shelfg" filter="url(#kq-coastsh)" aria-hidden="true">';
  E.CONTINENTS.forEach(c => {
    E.REGION_MEMBERS[c.id].forEach(i => {
      s += '<polygon class="kq-shelf" points="' + ptsOf(i) + '" fill="none" ' +
        'stroke="#05192b" stroke-width="11"></polygon>';
    });
  });
  s += '</g>';
  s += '<g class="kq-rimg" aria-hidden="true">';
  E.CONTINENTS.forEach(c => {
    const sand = rgbToHex(...mix(hexToRgb(contHex(c.id)), [236, 222, 190], 0.60));
    E.REGION_MEMBERS[c.id].forEach(i => {
      s += '<polygon class="kq-rim" data-rim="' + i + '" points="' + ptsOf(i) + '" fill="none" ' +
        'stroke="' + sand + '" stroke-width="6"></polygon>';
    });
  });
  s += '</g>';

  /* 3 · the LAND — one polygon per territory, filled by its continent shade,
     with the aged-paper grain laid over the whole landmass in ONE clipped rect.
     The group isolates so that blend can never reach the water behind it. */
  s += '<g class="kq-landg">';
  T.forEach((t, i) => {
    s += '<polygon class="kq-terr" data-t="' + i + '" points="' + ptsOf(i) + '" ' +
      'fill="' + TERR_SHADE[i].unowned + '"></polygon>';
  });
  s += '<rect class="kq-paper" x="0" y="0" width="660" height="1160" ' +
    'fill="url(#kq-paperpat)" clip-path="url(#kq-landclip)"></rect>';
  s += '</g>';

  /* 3b · the capture-sweep host: empty until a land changes hands. */
  s += '<g class="kq-cap" id="kq-capg" aria-hidden="true"></g>';

  /* 4 · the OWNER RINGS — a stroke-only polygon on top, seat-coloured. */
  T.forEach((t, i) => {
    s += '<polygon class="kq-ring" data-r="' + i + '" points="' + ptsOf(i) + '" display="none"></polygon>';
  });

  /* 4b · THE HIGHLIGHT LAYER — ABOVE the owner rings, and that placement is the
     whole point of it. The rings trace the SAME polygons and used to be painted
     last, so the gold "you picked this" stroke and the white "you can hit this"
     stroke were drawn UNDERNEATH a seat ring of similar weight and simply did
     not exist on screen. Nothing here fills, nothing here takes a pointer, and
     every stroke is non-scaling so it is the same weight on a 360px phone as on
     a 430px one. */
  s += '<g class="kq-hig" aria-hidden="true">';
  T.forEach((t, i) => {
    s += '<polygon class="kq-hi" data-h="' + i + '" points="' + ptsOf(i) + '"></polygon>';
  });
  /* the MARK — a reticle for "you may attack here", an arrow for "you may move
     armies here". Sits just above the army badge so it never covers the number
     a player is deciding on. A SHAPE, not a colour, so the answer survives a
     colour-blind reading of the board. */
  T.forEach((t, i) => {
    s += '<g class="kq-mark" data-m="' + i + '" transform="translate(' + t.c[0] + ',' + (t.c[1] - 21) + ')">' +
      '<circle r="9"></circle>' +
      /* ATTACK — a gunsight: an inner ring with four ticks breaking the rim.
         Nothing else anywhere on this map is a circle inside a circle. */
      '<path class="mk-atk" d="M-3.8 0a3.8 3.8 0 1 0 7.6 0a3.8 3.8 0 1 0-7.6 0' +
        'M0 -7.4v2.4M0 7.4v-2.4M-7.4 0h2.4M7.4 0h-2.4"></path>' +
      /* FORTIFY — armies going INTO this land: an arrow pointing down at it. */
      '<path class="mk-for" d="M0 -5.2v8.2M-3.5 -0.3L0 3.2 3.5 -0.3"></path>' +
    '</g>';
  });
  s += '</g>';

  /* 5 · a subtle territory name on the land (helps read the board). */
  T.forEach((t, i) => {
    s += '<text class="kq-tname" data-n="' + i + '" x="' + t.c[0] + '" y="' + (t.c[1] + 20) + '">' +
      esc(TE(t.name)) + '</text>';
  });

  /* 6 · badges (drawn over the polygons). */
  T.forEach((t, i) => {
    s += '<g class="kq-badge" data-b="' + i + '">' +
      '<circle cx="' + t.c[0] + '" cy="' + t.c[1] + '" r="12.5"></circle>' +
      '<text x="' + t.c[0] + '" y="' + (t.c[1] + 1) + '">1</text></g>';
  });

  /* 7 · the CONTINENT plaques — NAME + BONUS on/near each landmass. */
  E.CONTINENTS.forEach(c => {
    const a = contLabelAnchor(c.id);
    const nm = TE(c.name).toUpperCase();
    const chW = 8.0;                                   /* rough glyph width */
    const bnW = 30;
    const w = Math.max(64, nm.length * chW + bnW + 24);
    const h = 22;
    let lx = a.x, ly = Math.max(14, a.y);
    lx = Math.max(w/2 + 4, Math.min(660 - w/2 - 4, lx));
    ly = Math.max(h/2 + 4, Math.min(1160 - h/2 - 4, ly));
    const nmX = lx - bnW/2 + 2;
    const bnX = lx + (w/2) - bnW/2 - 2;
    s += '<g class="kq-clabel" data-cl="' + c.id + '">' +
      '<rect x="' + (lx - w/2).toFixed(1) + '" y="' + (ly - h/2).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h + '" ' +
        'rx="7" fill="rgba(8,18,30,.72)" stroke="' + contHex(c.id) + '" stroke-width="1.5"></rect>' +
      '<text class="cl-nm" x="' + nmX.toFixed(1) + '" y="' + (ly).toFixed(1) + '" fill="' + shade(contHex(c.id), 0.42) + '">' + esc(nm) + '</text>' +
      '<rect x="' + (bnX - bnW/2 + 3).toFixed(1) + '" y="' + (ly - 9).toFixed(1) + '" width="' + (bnW-6) + '" height="18" rx="5" ' +
        'fill="' + contHex(c.id) + '"></rect>' +
      '<text class="cl-bn" x="' + bnX.toFixed(1) + '" y="' + (ly).toFixed(1) + '">+' + c.bonus + '</text>' +
    '</g>';
  });

  svg.innerHTML = s;
  UI.capg    = svg.querySelector('#kq-capg');
  UI.capclip = svg.querySelector('#kq-capclip');

  /* cache + wire taps */
  T.forEach((t, i) => {
    const el = svg.querySelector('.kq-terr[data-t="' + i + '"]');
    const rg = svg.querySelector('.kq-ring[data-r="' + i + '"]');
    const bg = svg.querySelector('.kq-badge[data-b="' + i + '"]');
    const nm = svg.querySelector('.kq-tname[data-n="' + i + '"]');
    UI.terrEls[i] = el;
    UI.ringEls[i] = rg;
    UI.badgeEls[i] = bg;
    UI.labelEls[i] = nm;
    UI.hiEls[i]   = svg.querySelector('.kq-hi[data-h="' + i + '"]');
    UI.markEls[i] = svg.querySelector('.kq-mark[data-m="' + i + '"]');
    if (el) el.addEventListener('pointerdown', ev => { ev.preventDefault(); onTerr(i); });
  });
}

/* ═══════════════════════════════════════════════════════════════════
   PAINTING — colours, badges, highlights, the phase bar.
   ═══════════════════════════════════════════════════════════════════ */
function paintAll(){
  if (!UI || !M) return;
  paintMap();
  paintSeats();
  /* a SIBLING of the two above on purpose. The bar has to keep telling the
     truth after E.over(st) — quiet and inert under the result overlay — so it
     must not hang off anything that early-returns on a finished game. */
  paintPhaseBar();
  turnWatch();
}

/* ═══════════════════════════════════════════════════════════════════
   THE TURN READOUT — "tell u how much u got troops"

   Every repaint asks one question: is this the first moment of a turn the
   LOCAL player is about to take? `round:seat` changes exactly once per turn,
   so it is the cheapest honest trigger there is — no hook into the engine, no
   second source of truth, and a replay/rollback re-derives it for free.

   It is shown, never hunted for; it is dismissed by tapping anywhere. It
   blocks nothing: it only ever appears on the local player's own turn, when
   the wire is waiting on him anyway, and it is torn down the moment the game
   ends or the board goes away.
   ═══════════════════════════════════════════════════════════════════ */
function turnWatch(){
  if (!M || !UI) return;
  const st = M.st;
  const turnId = st.round + ':' + st.turn;
  if (turnId !== M.turnId){
    M.turnId = turnId; M.tradeThisTurn = 0; M.readoutDone = false;
    /* a machine's turn should be LEGIBLE, not a board that silently mutates.
       The local player gets the readout card instead, so this plaque is only
       ever for a seat that is not his. */
    if (!E.over(st) && !isLocal(E.turn(st))) handOff(E.turn(st));
  }
  if (M.readoutDone || M.busy || M.picking) return;
  if (E.over(st) || st._pending) return;
  if (st.phase !== E.PH_REINFORCE) return;
  if (!isLocal(E.turn(st))) return;
  M.readoutDone = true;
  showTurnCard();
}

/* ── TURN HAND-OFF ────────────────────────────────────────────────────
   One plaque, one animation, torn down by its own timer. pointer-events:none,
   so it cannot eat the tap that lands under it; it decorates a turn change the
   engine has ALREADY made, so it never delays a move, a bot or the wire. No
   buzz: this is somebody else's turn, and a pocket that shakes for five other
   people is a phone you put down. */
let handOffT = 0;
function handOff(seat){
  if (!UI || !UI.mapbox || !M || M.dead) return;
  killCard('kq-handoff');
  if (handOffT){ clearTimeout(handOffT); handOffT = 0; }
  const col = colourOf(seat);
  const ov = document.createElement('div');
  ov.className = 'kq-hand-off';
  ov.id = 'kq-handoff';
  ov.setAttribute('aria-hidden', 'true');
  ov.innerHTML = '<span><i style="background:radial-gradient(circle at 35% 30%,' +
    col.hi + ',' + col.hex + ' 60%,' + col.lo + ')"></i>' +
    esc(seatName(seat) + ' — ' + T('their turn', 'imisshom')) + '</span>';
  UI.mapbox.appendChild(ov);
  handOffT = setTimeout(() => { handOffT = 0; killCard('kq-handoff'); }, reduced() ? 900 : 1250);
}

/* the WHY behind st.reinf, split into the lines a player can act on. Derived
   from the board (holdings cannot change during Reinforce) plus whatever this
   turn's card trades have already added, so it always sums to the counter in
   the banner. */
function reinforceBreakdown(st, seat){
  const terr = E.countTerr(st, seat);
  const base = Math.max(3, Math.floor(terr / 3));
  const conts = [];
  E.CONTINENTS.forEach(c => {
    if (E.ownsRegion(st, seat, c.id)) conts.push({ name: TE(c.name), bonus: c.bonus, hex: contHex(c.id) });
  });
  const contTotal = conts.reduce((a, c) => a + c.bonus, 0);
  const trade = M ? (M.tradeThisTurn | 0) : 0;
  return { terr, base, conts, contTotal, trade, total: base + contTotal + trade };
}

function killCard(id){
  if (!UI || !UI.root) return;
  const el = UI.root.querySelector('#' + id);
  if (el) el.remove();
}

function showTurnCard(){
  if (!M || !UI || !UI.mapbox) return;
  const st = M.st, seat = E.turn(st);
  if (!isLocal(seat)) return;
  killCard('kq-turncard');
  const b = reinforceBreakdown(st, seat);
  const col = colourOf(seat);

  let rows =
    '<div class="kq-trow">' +
      '<span class="cs" style="background:' + col.hex + '"></span>' +
      '<span class="tl">' + esc(b.terr + ' ' + T('territories held', 'territorji f’idejk')) +
        '<i>' + esc(T('one army per three lands, three at the very least',
                      'armata għal kull tliet artijiet, tlieta l-inqas')) + '</i></span>' +
      '<span class="tv">+' + b.base + '</span></div>';
  b.conts.forEach(c => {
    rows += '<div class="kq-trow">' +
      '<span class="cs" style="background:' + c.hex + '"></span>' +
      '<span class="tl">' + esc(c.name) +
        '<i>' + esc(T('whole continent held', 'kontinent sħiħ f’idejk')) + '</i></span>' +
      '<span class="tv">+' + c.bonus + '</span></div>';
  });
  if (!b.conts.length){
    rows += '<div class="kq-trow">' +
      '<span class="cs" style="background:rgba(255,255,255,.14)"></span>' +
      '<span class="tl" style="color:rgba(255,255,255,.55)">' +
        esc(T('No whole continent yet', 'Ebda kontinent sħiħ għadu')) +
        '<i>' + esc(T('hold every land of one for a bonus each turn',
                      'żomm kull art ta’ wieħed għal bonus kull dawra')) + '</i></span>' +
      '<span class="tv" style="color:rgba(255,255,255,.35)">+0</span></div>';
  }
  if (b.trade > 0){
    rows += '<div class="kq-trow">' +
      '<span class="cs" style="background:#EFE3C4"></span>' +
      '<span class="tl">' + esc(T('Cards traded', 'Karti mibdula')) +
        '<i>' + esc(T('a matched set of three', 'sett ta’ tlieta')) + '</i></span>' +
      '<span class="tv">+' + b.trade + '</span></div>';
  }

  const mustTrade = !!st.mustTrade;
  const canTrade  = E.hasTradeSet(st, seat);
  const ov = document.createElement('div');
  ov.className = 'kq-turn';
  ov.id = 'kq-turncard';
  ov.innerHTML =
    '<div class="kq-turn-in">' +
      '<div class="kq-turn-h">' + esc(T('Round', 'Rawnd') + ' ' + st.round + ' · ' + seatName(seat)) + '</div>' +
      '<div class="kq-turn-t">' + esc(T('Your new armies', 'L-armati ġodda tiegħek')) + '</div>' +
      '<div class="kq-turn-rows">' + rows + '</div>' +
      '<div class="kq-ttot">' +
        '<span class="tl">' + esc(T('To place this turn', 'X’tqiegħed din id-dawra')) + '</span>' +
        '<span class="tv">' + b.total + '</span>' +
      '</div>' +
      '<div class="kq-turn-acts">' +
        (mustTrade
          ? '<button class="kq-act" id="kq-tc-cards">' +
              esc(T('You hold 5+ cards — trade a set', 'Għandek 5+ karti — ibdel sett')) + '</button>'
          : '<button class="kq-act" id="kq-tc-go">' +
              esc(T('Place them', 'Qegħedhom')) + '</button>' +
            (canTrade
              ? '<button class="kq-act ghost" id="kq-tc-cards">' +
                  esc(T('Trade cards for more', 'Ibdel karti għal aktar')) + '</button>'
              : '')) +
      '</div>' +
    '</div>';
  UI.mapbox.appendChild(ov);
  cue('mp.turn', { gain:0.7 }, true);
  buzz('tap');                       /* the player's own turn opening — his moment */

  const close = () => { ov.remove(); };
  ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
  const go = ov.querySelector('#kq-tc-go');
  if (go) go.onclick = () => { cue('ui.tap', { gain:0.7 }); close(); };
  const cards = ov.querySelector('#kq-tc-cards');
  if (cards) cards.onclick = () => { close(); openCardSheet(); };
}

function paintMap(){
  const st = M.st;
  const legalSet = computeLegalSet();
  /* ── WHAT THE PLAYER IS BEING ASKED ──────────────────────────────────
     "Tap one of yours, then see where you can go" is a two-beat question, and
     the map has to answer whichever beat it is on. `picked` is the land already
     chosen (attack source or fortify source); `pickable` is the set you may
     choose from before that. Both come straight out of computeLegalSet(), which
     is the only thing on this screen allowed to decide what is legal — nothing
     below changes that answer, it only makes it visible.

     The hard recede is reserved for the SELECTION phases. In Claim / Deploy /
     Reinforce every land you own is a legal target, so dimming the rest would
     grey out most of the board for no decision. */
  const selPhase = (st.phase === E.PH_ATTACK || st.phase === E.PH_FORTIFY);
  const picked   = st.phase === E.PH_ATTACK ? M.sel
                 : st.phase === E.PH_FORTIFY ? M.fsel : -1;
  const marking  = st.phase === E.PH_ATTACK ? 'atk' : 'for';
  const live     = !E.over(st) && isLocal(E.turn(st)) && !M.busy && !st._pending;
  const hasPick  = selPhase && live && picked >= 0;
  const hasOffer = selPhase && live && !hasPick && legalSet.from.size > 0;
  /* WHOSE TURN IT IS, on the map itself. The seat to move owns the only rings
     at full strength (and, unless motion is refused, the only ones breathing);
     every other seat is held back to half. It is the cheapest possible read of
     "who is moving" and it needs no extra element and no extra paint pass. */
  const actSeat = E.over(st) ? -1 : E.turn(st);
  for (let i = 0; i < E.N_TERR; i++){
    const el = UI.terrEls[i], bg = UI.badgeEls[i], rg = UI.ringEls[i];
    if (!el) continue;
    const o = st.owner[i];
    /* FILL = the CONTINENT colour: lively when owned, muted when open land.
       The *Tex pair is the same colour pre-lit for the paper's multiply. */
    const shd = TERR_SHADE[i];
    el.setAttribute('fill', o >= 0 ? (landTexOk ? shd.ownedTex : shd.owned)
                                   : (landTexOk ? shd.unownedTex : shd.unowned));
    el.classList.toggle('sel', i === M.sel || i === M.fsel);
    el.classList.toggle('legal', legalSet.from.has(i));
    el.classList.toggle('target', legalSet.to.has(i));
    /* OWNER RING = the seat colour, drawn on top; hidden on open land. */
    if (rg){
      if (o < 0){ rg.setAttribute('display', 'none'); rg.classList.remove('act'); }
      else {
        rg.removeAttribute('display');
        rg.setAttribute('stroke', colourOf(o).hex);
        rg.classList.toggle('act', o === actSeat);
      }
    }
    /* badge — a DARK disc tinted with the owner's seat colour and rimmed in
       that seat's bright shade. Dark-always is deliberate: a white numeral on
       a flat amber or olive disc was the one combination a phone could not
       read. Hidden on UNOWNED land (the CLAIM opening). */
    if (bg){
      const c = bg.querySelector('circle'), tx = bg.querySelector('text');
      if (o < 0){
        bg.setAttribute('display', 'none');
      } else {
        bg.removeAttribute('display');
        const col = colourOf(o);
        if (c){ c.setAttribute('fill', badgeInk(col.hex)); c.setAttribute('stroke', col.hi); }
        if (tx) tx.textContent = st.army[i];
      }
    }

    /* ── THE THREE STATES, MADE UNMISTAKABLE ──────────────────────────
       Nothing here decides legality — `legalSet` already did. This only says
       it loudly enough to be read on a 360px phone. */
    const isSel = (i === picked && (hasPick || hasOffer));
    const isTgt = hasPick && legalSet.to.has(i);
    const isPick = hasOffer && legalSet.from.has(i);
    const hi = UI.hiEls[i], mk = UI.markEls[i];
    if (hi){
      hi.classList.toggle('sel', isSel);
      hi.classList.toggle('tgt', isTgt);
      hi.classList.toggle('pick', isPick);
    }
    if (mk){
      mk.classList.toggle('on',  isTgt);
      mk.classList.toggle('atk', marking === 'atk');
      mk.classList.toggle('for', marking === 'for');
    }
    /* everything that is not part of the decision steps back — hard once a
       land is picked, gently while you are still choosing one. */
    const inPlay = isSel || isTgt || isPick;
    const dim  = hasPick  && !inPlay;
    const dim2 = hasOffer && !inPlay;
    [el, bg, rg, UI.labelEls[i]].forEach(n => {
      if (!n) return;
      n.classList.toggle('dim',  dim);
      n.classList.toggle('dim2', dim2);
    });
  }
}

/* which territories should glow now (source set) and which are targets. */
function computeLegalSet(){
  const st = M.st;
  const from = new Set(), to = new Set();
  if (E.over(st)) return { from, to };
  const seat = E.turn(st);
  if (!isLocal(seat) || M.busy || st._pending) return { from, to };
  if (st.phase === E.PH_CLAIM){
    /* every EMPTY territory is claimable */
    for (let i = 0; i < E.N_TERR; i++) if (st.owner[i] === E.UNOWNED) from.add(i);
  } else if (st.phase === E.PH_DEPLOY){
    /* every OWN territory can take a setup army */
    for (let i = 0; i < E.N_TERR; i++) if (st.owner[i] === seat) from.add(i);
  } else if (st.phase === E.PH_REINFORCE){
    /* every own territory can take reinforcements */
    for (let i = 0; i < E.N_TERR; i++) if (st.owner[i] === seat) from.add(i);
  } else if (st.phase === E.PH_ATTACK){
    if (M.sel < 0){
      for (const s of E.attackSources(st, seat)) from.add(s);
    } else {
      for (const t of E.attackTargets(st, M.sel)) to.add(t);
    }
  } else if (st.phase === E.PH_FORTIFY){
    if (M.fsel < 0){
      for (let i = 0; i < E.N_TERR; i++)
        if (st.owner[i] === seat && st.army[i] > 1){
          /* has a reachable own neighbour? */
          for (const v of E.adjOf(i)) if (st.owner[v] === seat){ from.add(i); break; }
        }
    } else {
      /* reachable own territories from fsel */
      for (let i = 0; i < E.N_TERR; i++)
        if (i !== M.fsel && st.owner[i] === seat && E.fortifyReachable(st, seat, M.fsel, i)) to.add(i);
    }
  }
  return { from, to };
}

/* ═══════════════════════════════════════════════════════════════════
   THE SEAT ROW — BUILT RARELY, PAINTED OFTEN.

   It used to rewrite `UI.seats.innerHTML` on every paintAll(), which is every
   AI step — one every 140-200ms. With a face in each chip that is a flicker on
   every machine move AND it throws away progress-ui's `data-kx-done` stamp each
   time, so paintOne() would redraw forty medallions a second for nothing.

   So the markup is rebuilt only when its STRUCTURE changes, and the signature
   below is what decides that. It has to include the names and the owners, not
   just the seat count: hooks.setName() and hooks.setOwner() mutate both of
   those mid-match online (a chair changing hands, a player's name arriving
   after the roster), and a chip that never notices is a chip showing the wrong
   person for the rest of the game.
   ═══════════════════════════════════════════════════════════════════ */
function seatSig(){
  const st = M.st;
  let s = st.seats + '|';
  for (let i = 0; i < st.seats; i++){
    const m = (M.meta && M.meta[i]) || {};
    s += (m.own || 'ai') + '' + (m.name || '') + '' + (m.lvl || 0) + '' +
         (m.av || '') + '' + (m.pv || 0) + '' +
         (m.look ? [m.look.f, m.look.b, m.look.lb].join(',') : '') + '|';
  }
  return s;
}

/* THE FACE IN A CHIP. Declarative — the app's own `data-kx-av` span, exactly as
   js/game.js's renderHome() writes it — so this file owns no rendering logic of
   its own and cannot disagree with the rest of the app about what a player
   looks like.

   THREE RULES THAT ARE EASY TO GET WRONG:
     · a LOCAL seat is drawn from K.displayName(), NOT seatName(i). seatName
       returns the literal word 'You' / 'Int' for the player's own chair, and
       describe() would hash THAT into a stranger's face — the player would see
       somebody else in their own seat.
     · a MACHINE gets no human face at all. js/mp.js's seatAvatar() draws a cpu
       chair as a quiet medallion with the difficulty mark, and so do we.
     · the SEAT COLOUR SURVIVES either way. It is a game rule — it is how the
       map says who owns what — so it is an inset ring plus a corner pip around
       whatever face or medallion is inside, and a cosmetic can never take it.
*/
function seatFaceHTML(i, col){
  const m = (M.meta && M.meta[i]) || {};
  const rim = '<span class="kq-fring"></span><span class="kq-pip"></span>';
  const sty = ' style="--sc:' + esc(col.hex) + '"';
  if ((m.own || 'ai') === 'ai'){
    return '<span class="kq-bot"' + sty + ' aria-hidden="true">' +
      ico('diff-' + Math.max(1, Math.min(3, m.lvl || 2))) + rim + '</span>';
  }
  let nm = m.name || seatColName(i);
  if (m.own === 'me'){
    try {
      const d = K.displayName && K.displayName();
      if (d && String(d).trim()) nm = String(d).trim();
    } catch(e){}
  }
  let at = ' data-kx-av="' + esc(nm) + '" data-kx-size="24"';
  /* a remote seat's published look, snapshotted at the start of the match */
  if (m.own === 'net'){
    if (m.av) at += ' data-kx-who="' + esc(m.av) + '"';
    if (m.pv) at += ' data-kx-pv="' + (m.pv | 0) + '"';
    if (m.look){
      if (m.look.f)  at += ' data-kx-face="'   + esc(m.look.f)  + '"';
      if (m.look.b)  at += ' data-kx-border="' + esc(m.look.b)  + '"';
      if (m.look.lb) at += ' data-kx-lvb="'    + esc(m.look.lb) + '"';
    }
  }
  return '<span class="kq-face"' + sty + '><span class="avatar"' + at + '></span>' + rim + '</span>';
}

function buildSeats(){
  if (!UI || !UI.seats || !M) return;
  const sig = seatSig();
  if (sig === UI.seatSig) return;
  UI.seatSig = sig;
  const st = M.st;
  let html = '';
  for (let i = 0; i < st.seats; i++){
    html += '<div class="kq-chip" data-s="' + i + '">' + seatFaceHTML(i, colourOf(i)) +
      '<span class="cn"><b>' + esc(seatName(i)) + '</b><i data-cnt="' + i + '"></i></span></div>';
  }
  UI.seats.innerHTML = html;
  UI.seatEls = [];
  for (let i = 0; i < st.seats; i++){
    UI.seatEls[i] = {
      chip: UI.seats.querySelector('.kq-chip[data-s="' + i + '"]'),
      cnt:  UI.seats.querySelector('[data-cnt="' + i + '"]'),
      sig:  ''
    };
  }
  try { if (window.KARTI_XP && KARTI_XP.repaintAvatars) KARTI_XP.repaintAvatars(UI.seats); } catch(e){}
}

/* THE CHEAP PASS — classes and three numbers, nothing else. */
function paintSeats(){
  if (!UI || !UI.seats || !M) return;
  buildSeats();
  const st = M.st, turn = E.turn(st), over = E.over(st);
  for (let i = 0; i < st.seats; i++){
    const h = UI.seatEls[i];
    if (!h || !h.chip) continue;
    h.chip.classList.toggle('on', i === turn && !over);
    h.chip.classList.toggle('dead', !st.alive[i]);
    const terr = E.countTerr(st, i), army = E.countArmies(st, i), cards = E.handOf(st, i).length;
    const sig = terr + '/' + army + '/' + cards;
    if (h.sig === sig) continue;
    h.sig = sig;
    /* ICONS, NOT EMOJI, and a WORD for anything that cannot see them. A phone
       is not obliged to own a glyph, and a screen reader saying "12 black
       hexagon" is not a sentence. This reads "12 territories, 34 armies,
       3 cards". */
    h.cnt.innerHTML =
      '<em>' + ico('flag')  + terr + sr(' ' + T('territories', 'territorji')) + '</em>' +
      '<em>' + ico('users') + army + sr(' ' + T('armies', 'armati')) + '</em>' +
      (cards ? '<em>' + ico('cards') + cards + sr(' ' + T('cards', 'karti')) + '</em>' : '');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   THE PHASE BAR, PAINTED.

   Called from paintAll() as a SIBLING of paintMap/paintSeats, never from
   inside anything that early-returns when the game is over — the old banner
   painter bailed on `over` and a bar wired that way would freeze mid-sentence
   under the result overlay instead of going quiet.

   IT DERIVES EVERYTHING. E.turn / E.over / E.inSetup / st.phase / st.reinf /
   st.mustTrade, every pass. There is no cached "which step are we on".
   ═══════════════════════════════════════════════════════════════════ */
function paintPhaseBar(){
  if (!UI || !UI.pb || !M) return;
  const st = M.st, over = !!E.over(st);
  const seat = over ? -1 : E.turn(st);
  const mine = seat >= 0 && isLocal(seat);
  const setup = !over && E.inSetup(st);
  /* SETUP IS NOT ONE OF THE THREE STEPS. cur stays -1 through Claim and Deploy
     so all three render locked and the line says what is really happening. */
  const cur = (over || setup) ? -1 : st.phase;
  const busy = M.busy || M.picking || !!st._pending;

  UI.pb.classList.toggle('over', over);
  UI.pb.classList.toggle('inert', !over && !mine);
  UI.pb.setAttribute('aria-disabled', (over || !mine) ? 'true' : 'false');

  /* THE ONE STEP A TAP MAY MOVE YOU TO — asked of the engine, never assumed.
     endphase is illegal out of Fortify, and illegal in Draft while armies are
     unplaced or a set must be traded; a cell that offers what the gate would
     refuse is a cell that lies. */
  const nextOK = (!over && !setup && mine && !busy && seat >= 0 &&
                  E.check(st, { t:'endphase' }, seat)) ? cur + 1 : -1;

  UI.pstep.forEach(s => {
    const el = s.el;
    const done = cur >= 0 && s.index < cur;
    const now  = cur >= 0 && s.index === cur;
    const next = s.index === nextOK;
    el.classList.toggle('done', done);
    el.classList.toggle('now',  now);
    el.classList.toggle('next', next);
    el.classList.toggle('lock', !done && !now && !next);
    el.classList.toggle('alert', now && mine && s.index === E.PH_REINFORCE && !!st.mustTrade);
    if (now) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
    /* THE LABEL IS PAINTED, NOT BAKED. js/lang.js can flip the whole app to
       Maltese in the middle of a match (setupSheet's onChange calls paintAll),
       and a label written once at build time would sit there in the wrong
       language for the rest of the game. Guarded, so it is a string compare
       and not a DOM write on every AI step. */
    const lbl = PHASE_STEPS[s.index].v.label();
    if (s.b && s.b.textContent !== lbl) s.b.textContent = lbl;
    el.disabled = !next;
    /* the mark, written only when it CHANGES. paintAll runs every AI step
       (140-200ms) and three innerHTML writes a pass, forever, is a repaint
       nobody asked for. */
    const mk = done ? 'check' : next ? 'arrow-right' : now ? PHASE_STEPS[s.index].v.icon : 'lock';
    if (s.mk !== mk){ s.mk = mk; s.ico.innerHTML = ico(mk); }
    /* the armies-to-place count, rehomed from the gold banner into the step it
       is actually about. */
    const showN = now && mine && s.index === E.PH_REINFORCE;
    s.n.hidden = !showN;
    if (showN) s.n.textContent = st.reinf;
  });

  /* ── the foot: one sentence, and one control ── */
  let head = '', line = '', actLabel = '', actGhost = false, waitTxt = '';

  if (over){
    head = T('The map is settled', 'Il-mappa waslet fit-tmiem');
  } else if (setup){
    const left = (st.setupLeft && seat >= 0) ? st.setupLeft[seat] : 0;
    if (st.phase === E.PH_CLAIM && st.setupMode === 'random'){
      head = T('Random deal', 'Tqassim aleatorju');
      line = mine ? T('Deal the whole world at once', 'Aqsam id-dinja kollha f’daqqa')
                  : T('dealing the world…', 'qed jaqsam id-dinja…');
      if (mine) actLabel = T('Deal', 'Qassam');
    } else if (st.phase === E.PH_CLAIM){
      head = T('Claim', 'Ħu') + ' · ' + left + ' ' + T('left', 'baqa’');
      line = mine ? T('Tap an empty land to claim it', 'Ikklikkja art vojta biex teħodha')
                  : T('claiming land…', 'qed jieħu l-art…');
    } else {
      head = T('Deploy', 'Poġġi') + ' · ' + left + ' ' + T('left', 'baqa’');
      line = mine ? T('Tap your land to place an army', 'Ikklikkja artek biex tpoġġi armata')
                  : T('placing armies…', 'qed iqiegħed armati…');
    }
  } else {
    const step = PHASE_STEPS[cur] || PHASE_STEPS[0];
    head = mine ? T('Your turn', 'Imissek') : seatName(seat);
    if (!mine){
      line = step.v.theirs();
    } else if (cur === E.PH_REINFORCE){
      if (st.mustTrade){
        line = T('You hold five or more cards', 'Għandek ħames karti jew aktar');
        actLabel = T('Trade first', 'Ibdel sett');
      } else {
        line = step.v.mine();
        if (st.reinf === 0) actLabel = T('Done', 'Lest');
      }
    } else if (cur === E.PH_ATTACK){
      line = M.sel < 0 ? step.v.mine()
                       : T('Tap an enemy — you pick the dice next', 'Ikklikkja għadu — imbagħad tagħżel id-dadi');
      actLabel = T('End attack', 'Temm l-attakk'); actGhost = true;
    } else {
      line = M.fsel < 0 ? step.v.mine()
                        : T('Tap where to send them', 'Ikklikkja fejn tibgħathom');
      actLabel = T('End turn', 'Temm id-dawra');
    }
  }

  /* NOT YOUR TURN — a pill, not a button, so nothing invites a thumb. A remote
     human is WAITED FOR; a machine is THINKING. They are different sentences
     because they are different situations: one of them can be hurried along by
     asking, and the other cannot. */
  if (!over && !mine && seat >= 0){
    waitTxt = ownerOf(seat) === 'net'
      ? T('Waiting for', 'Qed nistennew') + ' ' + seatName(seat)
      : T('Machine thinking', 'Il-magna taħseb');
  }

  /* WRITTEN ONLY WHEN IT CHANGES, and this one is not an optimisation.
     #kq-pline is a `role="status" aria-live="polite"` region and paintAll runs
     on every AI step — 140-200ms apart. Rewriting it with the SAME sentence
     seven times a second re-announces it to a screen reader seven times a
     second, which is unusable. The guard is the whole reason it is bearable. */
  const lineHTML = '<b>' + esc(head) + '</b>' + (line ? '<i> · ' + esc(line) + '</i>' : '');
  if (UI.pline._h !== lineHTML){ UI.pline._h = lineHTML; UI.pline.innerHTML = lineHTML; }

  UI.pwait.hidden = !waitTxt;
  if (waitTxt){
    const col = colourOf(seat);
    const wHTML = '<i style="background:radial-gradient(circle at 35% 30%,' +
      esc(col.hi) + ',' + esc(col.hex) + ' 60%,' + esc(col.lo) + ')"></i>' + esc(waitTxt);
    if (UI.pwait._h !== wHTML){ UI.pwait._h = wHTML; UI.pwait.innerHTML = wHTML; }
  }

  if (actLabel && mine && !over){
    UI.act.hidden = false;
    if (UI.act.textContent !== actLabel) UI.act.textContent = actLabel;
    UI.act.classList.toggle('ghost', actGhost);
    UI.act.disabled = busy;
  } else {
    UI.act.hidden = true;
  }

  /* ── the contextual row, and the two controls that live in it ── */
  const showStep = mine && !over && !setup && cur === E.PH_REINFORCE && !st.mustTrade && st.reinf > 0;
  UI.step.hidden = !showStep;
  if (showStep){ clampPlace(); UI.placen.textContent = M.place; }
  paintCardsBtn(seat, mine && !over);
  /* the row is in the layout ONLY while one of them is wanted — a slim strip of
     nothing is still ~50px of map. */
  UI.ctxrow.hidden = UI.step.hidden && UI.cards.hidden;
}

/* the cards button in the contextual row: shows the local seat's hand size,
   glows gold when a set can be traded in the Draft step, and turns red when the
   player MUST trade (5+ cards). */
function paintCardsBtn(seat, mine){
  if (!UI || !UI.cards) return;
  if (seat < 0 || !mine){ UI.cards.hidden = true; return; }
  const st = M.st;
  const hand = E.handOf(st, seat);
  const canTrade = mine && st.phase === E.PH_REINFORCE && E.hasTradeSet(st, seat);
  if (!mine || !hand.length){ UI.cards.hidden = true; return; }
  UI.cards.hidden = false;
  UI.cards.classList.toggle('must', !!st.mustTrade);
  UI.cards.classList.toggle('trade', canTrade && !st.mustTrade);
  /* SVG, not an emoji: the glyph a phone actually has is not a thing this
     file may assume, and a blank cream button is worse than no button. */
  UI.cards.innerHTML =
    '<svg class="kq-cico" viewBox="0 0 24 24" aria-hidden="true">' +
      '<rect x="6.5" y="3.5" width="12" height="17" rx="2.5"></rect>' +
      '<path d="M4.6 6.6L2.9 8a2 2 0 00-.4 2.6l4.2 6.6"></path></svg>' +
    '<b>' + hand.length + '</b>' +
    (canTrade ? '<svg class="kq-cico" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M4 8h13l-3-3M20 16H7l3 3"></path></svg>' : '');
}

function clampPlace(){
  if (!M) return;
  M.place = Math.max(1, Math.min(M.place | 0 || 1, Math.max(1, M.st.reinf)));
}
function bumpPlace(d){
  clampPlace();
  M.place = Math.max(1, Math.min(M.place + d, Math.max(1, M.st.reinf)));
  cue('ui.tap', { gain:0.6 });
  if (UI) UI.placen.textContent = M.place;
}

/* ═══════════════════════════════════════════════════════════════════
   INPUT — one entry for a territory tap, one for the primary action.
   ═══════════════════════════════════════════════════════════════════ */
function onTerr(i){
  if (!M || M.dead || M.busy || M.picking) return;
  if (E.over(M.st)) return;
  const st = M.st, seat = E.turn(st);
  if (!isLocal(seat) || st._pending) return;
  if (rulesOpen){ setRules(false); return; }

  if (st.phase === E.PH_CLAIM){
    if (st.owner[i] !== E.UNOWNED){ cue('move.illegal', { gain:0.6 }); return; }
    doMove(seat, { t:'claim', to:i }, 'local');
    cue('piece.place', { gain:0.75 }, true);
    dropInBadge(i);
    afterLocal();
    return;
  }
  if (st.phase === E.PH_DEPLOY){
    if (st.owner[i] !== seat){ cue('move.illegal', { gain:0.6 }); return; }
    doMove(seat, { t:'deploy', to:i }, 'local');
    cue('piece.place', { gain:0.7 }, true);
    dropInBadge(i);
    afterLocal();
    return;
  }

  if (st.phase === E.PH_REINFORCE){
    if (st.owner[i] !== seat){ cue('move.illegal', { gain:0.6 }); return; }
    clampPlace();
    const n = Math.min(M.place, st.reinf);
    if (n < 1) return;
    const was = st.army[i];
    doMove(seat, { t:'place', to:i, n }, 'local');
    cue('piece.place', { gain:0.7 }, true);
    buzz('tick');                       /* his own armies landing */
    afterLocal();
    /* AFTER the repaint, so the count-up starts from what the player saw and
       finishes on the number the engine already wrote. */
    landArmies(i, was, M.st.army[i]);
    return;
  }

  if (st.phase === E.PH_ATTACK){
    if (M.sel < 0){
      if (st.owner[i] === seat && st.army[i] > 1 && E.attackTargets(st, i).length){
        M.sel = i; cue('move.select', { gain:0.7 }); paintAll();
      } else cue('move.illegal', { gain:0.6 });
      return;
    }
    /* a source is selected: tap an enemy neighbour to attack, or re-pick */
    if (i === M.sel){ M.sel = -1; cue('ui.back', { gain:0.6 }); paintAll(); return; }
    if (st.owner[i] === seat){
      /* re-select another own source */
      if (st.army[i] > 1 && E.attackTargets(st, i).length){ M.sel = i; cue('move.select', { gain:0.6 }); paintAll(); }
      else cue('move.illegal', { gain:0.6 });
      return;
    }
    if (E.areAdjacent(M.sel, i)){
      /* NOT a strike. A tap opens the sheet; the strike is a second, deliberate
         press with a dice count behind it. */
      openAttackSheet(seat, M.sel, i);
    } else cue('move.illegal', { gain:0.6 });
    return;
  }

  /* fortify */
  if (st.phase === E.PH_FORTIFY){
    if (M.fsel < 0){
      if (st.owner[i] === seat && st.army[i] > 1){
        let hasDest = false;
        for (const v of E.adjOf(i)) if (st.owner[v] === seat){ hasDest = true; break; }
        if (hasDest){ M.fsel = i; cue('move.select', { gain:0.7 }); paintAll(); }
        else cue('move.illegal', { gain:0.6 });
      } else cue('move.illegal', { gain:0.6 });
      return;
    }
    if (i === M.fsel){ M.fsel = -1; cue('ui.back', { gain:0.6 }); paintAll(); return; }
    if (st.owner[i] === seat && E.fortifyReachable(st, seat, M.fsel, i)){
      askFortifyAmount(seat, M.fsel, i);
    } else cue('move.illegal', { gain:0.6 });
    return;
  }
}

function onAct(){
  if (!M || M.dead || M.busy || M.picking) return;
  const st = M.st, seat = E.turn(st);
  if (!isLocal(seat) || E.over(st) || st._pending) return;

  if (st.phase === E.PH_CLAIM && st.setupMode === 'random'){
    doMove(seat, { t:'deal' }, 'local');
    cue('game.start', { gain:0.85 }, true);
    afterLocal(); return;
  }
  if (st.phase === E.PH_REINFORCE){
    /* the one case where the primary action is not a move: five or more cards
       in hand and the engine will refuse everything until a set is traded. The
       button says so; pressing it opens the hand rather than doing nothing. */
    if (st.mustTrade){ openCardSheet(); return; }
    if (st.reinf > 0) return;                  /* the button is not offered */
    doMove(seat, { t:'endphase' }, 'local'); afterLocal(); return;
  }
  if (st.phase === E.PH_ATTACK){
    M.sel = -1;
    doMove(seat, { t:'endphase' }, 'local'); afterLocal(); return;
  }
  /* fortify: End turn */
  M.fsel = -1;
  doMove(seat, { t:'endturn' }, 'local'); afterLocal();
}

/* ═══════════════════════════════════════════════════════════════════
   CARDS — the hand sheet + trade. A card shows a symbol (infantry /
   cavalry / artillery, or WILD), the territory it names (with the current
   owner's colour dot), and — during reinforce — a Trade action that shows
   the next escalating bonus. The continent-bonus legend lives here too, so
   the "take a continent → more units" reward is always visible.
   ═══════════════════════════════════════════════════════════════════ */
const SYM_GLYPH = ['🛡️', '🐎', '🎯'];   /* infantry, cavalry, artillery */
function symGlyph(sym){ return sym < 0 ? '★' : (SYM_GLYPH[sym] || '?'); }
function symName(sym){
  if (sym < 0) return T('Wild', 'Selvaġġ');
  return [T('Infantry','Infanterija'), T('Cavalry','Kavallerija'), T('Artillery','Artillerija')][sym] || '';
}
let cardSel = [];      /* the 0..3 selected card ids in the open sheet */

function openCardSheet(){
  if (!M || M.dead || !UI || !UI.mapbox) return;
  const st = M.st, seat = E.turn(st);
  const meSeat = firstLocalSeat();
  const viewSeat = (isLocal(seat)) ? seat : (meSeat >= 0 ? meSeat : seat);
  cardSel = [];
  const ov = document.createElement('div');
  ov.className = 'kq-sheet';
  ov.id = 'kq-cardsheet';
  UI.mapbox.appendChild(ov);
  const rebuild = () => paintCardSheet(ov, viewSeat);
  rebuild();
  ov._rebuild = rebuild;
  ov.addEventListener('pointerdown', e => { if (e.target === ov){ ov.remove(); cue('ui.back', { gain:0.6 }); } });
  cue('ui.sheet', { gain:0.8 });
}

function paintCardSheet(ov, viewSeat){
  const st = M.st;
  const turnSeat = E.turn(st);
  const isMyReinforce = viewSeat === turnSeat && isLocal(turnSeat) && st.phase === E.PH_REINFORCE && !st._pending && !M.busy && !E.over(st);
  const hand = E.handOf(st, viewSeat);
  /* validate current selection is still a set */
  const selValid = cardSel.length === 3 && E.isCardSet(cardSel[0], cardSel[1], cardSel[2]);
  const nextVal = E.nextTradeValue(st);

  let cardsHtml = '';
  if (!hand.length){
    cardsHtml = '<div class="kq-hint2">' + esc(T('You hold no cards yet. Capture at least one land in a turn to earn one.',
      'Għad m’għandek ebda karta. Aqbad mill-inqas art f’dawra biex taqla’ waħda.')) + '</div>';
  } else {
    cardsHtml = '<div class="kq-hand">';
    hand.forEach(cid => {
      const card = E.CARDS[cid];
      const sel = cardSel.indexOf(cid) >= 0 ? ' sel' : '';
      let inner;
      if (card.terr < 0){
        inner = '<span class="sym">★</span><span class="wild">' + esc(T('Wild','Selvaġġ')) + '</span>';
      } else {
        const o = st.owner[card.terr];
        const dot = o >= 0 ? colourOf(o).hex : '#3b4a5a';
        inner = '<span class="dot" style="background:' + dot + '"></span>' +
          '<span class="sym">' + symGlyph(card.sym) + '</span>' +
          '<span class="nm">' + esc(TE(E.TERRITORIES[card.terr].name)) + '</span>';
      }
      cardsHtml += '<button class="kq-card' + sel + '" data-cid="' + cid + '">' + inner + '</button>';
    });
    cardsHtml += '</div>';
  }

  /* trade row (only in the player's own reinforce) */
  let tradeHtml = '';
  if (isMyReinforce && hand.length >= 3){
    const auto = E.findSet(hand);
    tradeHtml =
      '<div class="kq-hint2">' + esc(st.mustTrade
        ? T('You hold 5+ cards — you must trade a set before placing.', 'Għandek 5+ karti — trid tibdel sett qabel tqiegħed.')
        : T('Pick three (a matched set) to trade for armies.', 'Agħżel tlieta (sett) biex tibdilhom għal armati.')) + '</div>' +
      '<div class="kq-trade-row">' +
        '<button class="kq-act ghost" id="kq-autoset"' + (auto ? '' : ' disabled') + '>' +
          esc(T('Pick a set', 'Agħżel sett')) + '</button>' +
        '<button class="kq-act" id="kq-dotrade"' + (selValid ? '' : ' disabled') + '>' +
          esc(T('Trade for', 'Ibdel għal')) + ' +' + nextVal + '</button>' +
      '</div>';
  } else if (hand.length >= 3){
    tradeHtml = '<div class="kq-hint2">' + esc(T('Trade a set of three during your ' + PHASE_VOCAB.reinforce.label() + ' step.',
      'Ibdel sett ta’ tlieta waqt ir-' + PHASE_VOCAB.reinforce.label() + ' tiegħek.')) + '</div>';
  }

  /* continent-bonus legend */
  let contHtml = '<div class="kq-hint2" style="margin-top:9px">' + esc(T('Continent bonuses — own every land of one for extra armies each turn:',
    'Bonus tal-kontinenti — żomm il-kontinent kollu għal armati żejda kull dawra:')) + '</div><div class="kq-conts">';
  E.CONTINENTS.forEach(c => {
    const mineWhole = E.ownsRegion(st, viewSeat, c.id);
    const mem = E.REGION_MEMBERS[c.id];
    let held = 0; mem.forEach(t => { if (st.owner[t] === viewSeat) held++; });
    contHtml += '<div class="kq-cont' + (mineWhole ? ' mine' : '') + '">' +
      '<span class="cs" style="background:' + contHex(c.id) + '"></span>' +
      '<span class="cnm">' + esc(TE(c.name)) + '</span>' +
      '<span class="ck">' + held + '/' + mem.length + '</span>' +
      '<span class="cbn">+' + c.bonus + (mineWhole ? ' ✓' : '') + '</span></div>';
  });
  contHtml += '</div>';

  ov.innerHTML =
    '<div class="kq-sheet-in">' +
      '<div class="kq-sheet-h"><h4>' + esc(T('Cards & continents', 'Karti u kontinenti')) + '</h4>' +
        '<button class="kq-sheet-x" id="kq-sheet-x" aria-label="' + esc(T('Close','Agħlaq')) + '">✕</button></div>' +
      cardsHtml + tradeHtml + contHtml +
    '</div>';

  ov.querySelector('#kq-sheet-x').onclick = () => { ov.remove(); cue('ui.back', { gain:0.6 }); };
  ov.querySelectorAll('.kq-card').forEach(b => {
    b.onclick = () => {
      if (!isMyReinforce) return;
      const cid = +b.dataset.cid;
      const i = cardSel.indexOf(cid);
      if (i >= 0) cardSel.splice(i, 1);
      else { if (cardSel.length >= 3) cardSel.shift(); cardSel.push(cid); }
      cue('ui.tap', { gain:0.6 });
      paintCardSheet(ov, viewSeat);
    };
  });
  const auto = ov.querySelector('#kq-autoset');
  if (auto) auto.onclick = () => { const set = E.findSet(hand); if (set){ cardSel = set.slice(); cue('move.select', { gain:0.7 }); paintCardSheet(ov, viewSeat); } };
  const go = ov.querySelector('#kq-dotrade');
  if (go) go.onclick = () => {
    if (cardSel.length !== 3 || !E.isCardSet(cardSel[0], cardSel[1], cardSel[2])) return;
    const seat = E.turn(st);
    const before = st.reinf;
    const res = doMove(seat, { t:'trade', x:cardSel[0], y:cardSel[1], z:cardSel[2] }, 'local');
    if (res.ok){
      cue('piece.place', { gain:0.85 }, true);
      buzz('tap');                              /* his own trade */
      /* remember what the trade was worth so the turn readout can name it */
      M.tradeThisTurn = (M.tradeThisTurn | 0) + Math.max(0, M.st.reinf - before);
      cardSel = [];
      paintAll();
      /* if still must trade (rare), rebuild; else close the sheet and show the
         readout AGAIN — the number he was given has just changed, and being
         told is the whole point of it. */
      if (M.st.mustTrade){ paintCardSheet(ov, viewSeat); }
      else { ov.remove(); showTurnCard(); }
    }
  };
}

/* a small pop on a badge when armies drop in */
function dropInBadge(i){
  if (reduced() || !UI) return;
  const bg = UI.badgeEls[i];
  if (!bg) return;
  const c = bg.querySelector('circle');
  if (!c) return;
  const r0 = 12.5;
  let t0 = performance.now();
  function f(now){
    const k = Math.min(1, (now - t0) / 220);
    const e = 1 + 0.5 * Math.sin(k * Math.PI) * (1 - k);
    c.setAttribute('r', (r0 * e).toFixed(2));
    if (k < 1) requestAnimationFrame(f); else c.setAttribute('r', r0);
  }
  requestAnimationFrame(f);
}

/* ═══════════════════════════════════════════════════════════════════
   FORTIFY AMOUNT — a tiny inline chooser (P.ui.confirm-style prompt).
   We reuse a small slider dialog rather than a settings wall.
   ═══════════════════════════════════════════════════════════════════ */
function askFortifyAmount(seat, from, to){
  const st = M.st;
  const max = st.army[from] - 1;
  if (max < 1){ M.fsel = -1; paintAll(); return; }
  let n = max;                                /* default: send the lot but one */
  const ov = document.createElement('div');
  ov.style.cssText = 'position:absolute;inset:0;z-index:40;display:flex;align-items:flex-end;' +
    'justify-content:center;background:rgba(0,0,0,.45)';
  ov.innerHTML =
    '<div style="width:100%;max-width:420px;margin:0 8px 10px;padding:14px;border-radius:16px;' +
      'background:linear-gradient(180deg,#123452,#0a1c30);border:1px solid rgba(255,255,255,.16);' +
      'box-shadow:0 -8px 30px rgba(0,0,0,.5)">' +
      '<div style="font:900 12px/1 var(--disp);letter-spacing:.08em;text-transform:uppercase;color:var(--gold,#FFC542);margin-bottom:10px">' +
        esc(T('Move how many armies?', 'Kemm armati tibgħat?')) + '</div>' +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<button id="kqf-minus" style="width:44px;height:44px;border-radius:11px;border:0;font:900 22px/1 var(--disp);' +
          'color:#fff;background:rgba(255,255,255,.12);cursor:pointer">−</button>' +
        '<div id="kqf-n" style="flex:1;text-align:center;font:900 34px/1 var(--disp);color:#fff">' + n + '</div>' +
        '<button id="kqf-plus" style="width:44px;height:44px;border-radius:11px;border:0;font:900 22px/1 var(--disp);' +
          'color:#fff;background:rgba(255,255,255,.12);cursor:pointer">+</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:14px">' +
        '<button id="kqf-cancel" class="kq-act ghost" style="width:100%">' + esc(T('Back','Lura')) + '</button>' +
        '<button id="kqf-go" class="kq-act" style="width:100%">' + esc(T('Move','Ċaqlaq')) + '</button>' +
      '</div>' +
    '</div>';
  UI.mapbox.appendChild(ov);
  const nEl = ov.querySelector('#kqf-n');
  const upd = () => { nEl.textContent = n; };
  ov.querySelector('#kqf-minus').onclick = () => { n = Math.max(1, n - 1); cue('ui.tap',{gain:0.5}); upd(); };
  ov.querySelector('#kqf-plus').onclick  = () => { n = Math.min(max, n + 1); cue('ui.tap',{gain:0.5}); upd(); };
  ov.querySelector('#kqf-cancel').onclick = () => { ov.remove(); };
  ov.querySelector('#kqf-go').onclick = () => {
    ov.remove();
    M.fsel = -1;
    doMove(seat, { t:'fortify', from, to, n }, 'local');
    cue('piece.slide', { gain:0.7 }, true);
    afterLocal();
  };
}

/* ═══════════════════════════════════════════════════════════════════
   COMBAT — the hero animation. We resolve the move through the engine
   FIRST (so the dice are the shared, deterministic ones), then replay
   the recorded battle as an animation: an arrow source→target, both
   sides' dice tumbling then settling on the real faces, army ticks, and
   a colour-sweep + region flourish on a capture.
   ═══════════════════════════════════════════════════════════════════ */
/* ── THE ATTACK SHEET — attacking is a decision, not a click ───────────
   Both sides' armies, how many dice you are prepared to throw, and what
   that actually costs you in probability. The dice count rides the move as
   `n` (the shared KONK contract); it is clamped by the engine, so a stale
   client that drops it simply throws the maximum, which is what this game
   has always done.

   THE DEFENDER DOES NOT CHOOSE. Real Risk lets them pick one die or two, but
   two is near-always right, and asking would put a second phone in the way of
   every single attack online. So the defender always throws the most it can
   and the sheet SAYS SO, out loud, rather than quietly omitting it. */
function openAttackSheet(seat, from, to){
  if (!M || M.dead || M.busy || M.picking || !UI || !UI.mapbox) return;
  const st = M.st;
  const maxN = atkDiceMax(st.army[from]);
  if (maxN < 1){ cue('move.illegal', { gain:0.6 }); return; }

  M.picking = true;
  /* the phase bar lives in the frame's own bar, OUTSIDE .kq-wrap, so this sheet
     does not cover it. onPhaseStep and onAct both refuse while M.picking, but a
     control that still LOOKS live under a modal is a control somebody will
     press — so repaint the bar into its busy state as the sheet opens, and back
     when it closes. */
  paintPhaseBar();
  let n = maxN;                                   /* the maximum, preselected */

  const ov = document.createElement('div');
  ov.className = 'kq-atk';
  ov.id = 'kq-atksheet';
  /* the WHOLE board area, not just the map box. On a 360x640 phone the map box
     is ~366px tall and this sheet wants more than that in Maltese; anchoring to
     the wrap buys the banner's height back. Covering the banner while a strike
     is being chosen is right anyway — it is a modal decision, and M.picking has
     already made the banner deaf. */
  UI.root.appendChild(ov);
  cue('ui.sheet', { gain:0.8 });

  const close = () => { M.picking = false; ov.remove(); paintPhaseBar(); };

  function paint(){
    const aArmy = st.army[from], dArmy = st.army[to];
    const nDef  = defDiceMax(dArmy);
    const o     = exchangeOdds(n, nDef);
    const aCol  = colourOf(seat);
    const dOwn  = st.owner[to];
    const dCol  = dOwn >= 0 ? colourOf(dOwn) : { hex:'#3b4a5a' };

    /* one segment per possible outcome of THIS exchange, best for you first */
    const segs = [];
    for (let dl = o.cmp; dl >= 0; dl--){
      const al = o.cmp - dl, p = o.p[dl];
      const label = (dl > 0 && al === 0) ? (T('They lose', 'Jitilfu') + ' ' + dl)
                  : (dl === 0 && al > 0) ? (T('You lose', 'Titlef') + ' ' + al)
                  : T('One each', 'Waħda kull wieħed');
      const hex = dl > al ? '#7CF29B' : (dl === al ? '#FFC542' : '#ff8a6b');
      segs.push({ p, label, hex });
    }
    /* the headline: you come out of this exchange ahead */
    let ahead = 0;
    for (let dl = 0; dl <= o.cmp; dl++) if (dl > o.cmp - dl) ahead += o.p[dl];
    const take = conquerChanceWith(aArmy, dArmy, n);

    ov.innerHTML =
      '<div class="kq-atk-in">' +
        '<div class="kq-atk-h">' + esc(T('Choose your attack', 'Agħżel l-attakk tiegħek')) + '</div>' +
        '<div class="kq-atk-body">' +

        '<div class="kq-vs">' +
          '<div class="sd"><div class="hd">' +
            '<span class="sw" style="background:' + aCol.hex + '"></span>' +
            '<span class="nm">' + esc(TE(E.TERRITORIES[from].name)) + '</span></div>' +
            '<div class="ar"><b>' + aArmy + '</b><i>' + esc(T('yours', 'tiegħek')) + '</i></div></div>' +
          '<div class="mid"><svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M4 12h15M13 6l6 6-6 6"/></svg></div>' +
          '<div class="sd"><div class="hd">' +
            '<span class="sw" style="background:' + dCol.hex + '"></span>' +
            '<span class="nm">' + esc(TE(E.TERRITORIES[to].name)) + '</span></div>' +
            '<div class="ar"><b>' + dArmy + '</b><i>' + esc(T('defending', 'jiddefendu')) + '</i></div></div>' +
        '</div>' +

        '<div class="kq-lbl">' + esc(T('How many dice do you throw?', 'Kemm-il dadu tarmi?')) + '</div>' +
        '<div class="kq-dpick" id="kq-dpick">' +
          (function(){ let h = '';
            for (let k = 1; k <= maxN; k++)
              h += '<button data-n="' + k + '" class="' + (k === n ? 'on' : '') + '">' +
                   '<b>' + k + '</b><i>' + esc(k === 1 ? T('die', 'dadu') : T('dice', 'dadi')) + '</i></button>';
            return h; })() +
        '</div>' +

        '<div class="kq-obar">' +
          segs.map(s => '<span style="width:' + (s.p * 100).toFixed(2) + '%;background:' + s.hex + '"></span>').join('') +
        '</div>' +
        '<div class="kq-okey">' +
          segs.map(s => '<b><em style="background:' + s.hex + '"></em>' + esc(s.label) +
                        ' <u>' + pct(s.p) + '%</u></b>').join('') +
        '</div>' +

        '<div class="kq-stats">' +
          '<div class="st"><b>' + pct(ahead) + '%</b><i>' +
            esc(T('you come out of this roll ahead', 'toħroġ rebbieħ minn din ir-rimja')) + '</i></div>' +
          '<div class="st"><b>' + pct(take) + '%</b><i>' +
            esc(T('you take this land if you keep pressing', 'tieħu din l-art jekk tibqa’ tagħfas')) + '</i></div>' +
        '</div>' +
        '<div class="kq-note">' +
          esc(T('The defender never chooses — it always throws the most it can, here ' + nDef +
                (nDef === 1 ? ' die.' : ' dice.'),
                'Id-difensur qatt ma jagħżel — dejjem jarmi kemm jista’, hawn ' + nDef +
                (nDef === 1 ? ' dadu.' : ' dadi.'))) +
        '</div>' +

        '</div>' +
        '<div class="kq-atk-acts">' +
          '<button class="kq-act ghost" id="kq-atk-no">' + esc(T('Cancel', 'Ikkanċella')) + '</button>' +
          '<button class="kq-act" id="kq-atk-go">' + esc(T('Attack', 'Attakka')) + ' · ' + n +
            (n === 1 ? esc(T(' die', ' dadu')) : esc(T(' dice', ' dadi'))) + '</button>' +
        '</div>' +
      '</div>';

    ov.querySelectorAll('#kq-dpick button').forEach(btn => {
      btn.onclick = () => {
        const v = +btn.dataset.n;
        if (v === n) return;
        n = v;
        cue('ui.tap', { gain:0.6 });
        buzz('tick');                        /* the player's own choice */
        paint();
      };
    });
    ov.querySelector('#kq-atk-no').onclick = () => { cue('ui.back', { gain:0.7 }); close(); };
    ov.querySelector('#kq-atk-go').onclick = () => {
      const pick = n;
      close();
      buzz('tap');                           /* the player's own commitment */
      launchAttack(seat, from, to, pick);
    };
  }

  ov.addEventListener('pointerdown', e => { if (e.target === ov){ cue('ui.back', { gain:0.6 }); close(); } });
  paint();
}

function launchAttack(seat, from, to, n){
  if (!M || M.busy) return;
  M.busy = true;
  M.sel = -1;
  const maxN = atkDiceMax(M.st.army[from]);
  /* clamp here as well as in the engine: a stale sheet must never send a
     count the board no longer supports. */
  n = Math.max(1, Math.min(maxN, n | 0 || maxN));
  cue('duel.attack', { gain:0.7 }, true);
  const res = doMove(seat, { t:'attack', from, to, n }, 'local');
  if (!res.ok){ M.busy = false; M.picking = false; paintAll(); return; }
  const battle = M.st.lastBattle;
  playBattle(battle, () => {
    /* the capture-advance (if any) is a distinct move; auto-resolve for the
       local player with a sensible garrison, or ask? Keep it friendly:
       auto-advance a good chunk so the human is not nagged every capture. */
    if (M.st._pending){
      const p = M.st._pending;
      const nMove = Math.max(p.min, Math.min(p.max, Math.ceil(p.max * 0.6)));
      doMove(seat, { t:'advance', n:nMove }, 'local');
      cue('duel.destroy', { gain:0.8 }, true);
      buzz('thud');                             /* HIS capture, in his hand */
      sweepCapture(battle.to, seat, () => { M.busy = false; afterLocal(); }, battle.from);
    } else {
      M.busy = false; afterLocal();
    }
  }, true);
}

/* set an army badge's number without a full repaint (so the animation can
   hold the PRE-battle count while the dice are still in the air). */
function setBadgeNum(i, v){
  if (!UI || !UI.badgeEls[i]) return;
  const tx = UI.badgeEls[i].querySelector('text');
  if (tx) tx.textContent = v;
}
/* every fight gets a generation number. A badge tick left over from a fight
   the player skipped must not scribble on the next one. */
let battleGen = 0;
/* count a badge from one number to another, one army at a time, then hand the
   badge back to paintMap. Purely cosmetic: the engine settled these numbers
   long ago, so a skip, a repaint or reduced motion lands on `to` at once and
   the board still agrees with every other phone. `cls` colours the numeral
   while it moves — red counting DOWN a loss, green counting UP a gain. */
function tickBadge(i, from, to, ms, gen, cls){
  const steps = Math.abs(from - to);
  const k1 = cls || 'tick';
  if (!UI || !UI.badgeEls[i] || steps === 0 || reduced()){ setBadgeNum(i, to); return; }
  const bg = UI.badgeEls[i];
  const per = Math.max(60, Math.round(ms / steps));
  let k = 0;
  bg.classList.add(k1);
  const step = () => {
    if (!M || M.dead || !UI || gen !== battleGen){ if (bg) bg.classList.remove(k1); return; }
    k++;
    setBadgeNum(i, from + (to > from ? k : -k));
    dropInBadge(i);
    if (k < steps) setTimeout(step, per);
    else bg.classList.remove(k1);
  };
  setTimeout(step, per);
}

/* armies LANDING on a territory: the badge counts up from what was there,
   so "+3" is something you watch arrive rather than a number that changed
   while you blinked. Called AFTER the repaint that already wrote the truth. */
function landArmies(i, before, after){
  if (!UI || reduced() || before === after){ dropInBadge(i); return; }
  const gen = ++battleGen;
  setBadgeNum(i, before);
  dropInBadge(i);
  tickBadge(i, before, after, 190, gen, 'gain');
}

/* ── THE FIGHT ─────────────────────────────────────────────────────────
   The engine decided this battle BEFORE a single pixel moved — `battle` is
   already-applied history. Everything below is decoration over a state
   change that has happened, so it can be skipped, shortened or refused
   without the board ever disagreeing with another phone.

   What it now shows that it did not before: the PAIRING. Risk is decided
   highest-against-highest, and a player who cannot see which die beat which
   cannot tell a fair loss from a cheat. So the dice are laid out in rows,
   one row per pair, with the winner arrowed; a spare attacker die that had
   nothing to face sits in an empty slot, doing nothing, visibly.

   `mine` is true only when the LOCAL player pressed Attack. It gates the
   haptics and nothing else — an AI's and a remote seat's fights animate
   identically, but the phone stays still for them.                         */
function playBattle(battle, done, mine){
  if (!UI || !battle){ if (done) done(); return; }
  const fromT = E.TERRITORIES[battle.from], toT = E.TERRITORIES[battle.to];
  /* the PRE-battle counts, recovered from the losses the engine recorded */
  const preFrom = M.st.army[battle.from] + battle.atkLoss;
  const preTo   = M.st.army[battle.to]   + battle.defLoss;
  const postFrom = M.st.army[battle.from];
  const postTo   = M.st.army[battle.to];

  drawArrow(fromT.c, toT.c);

  if (reduced()){
    /* no tumble, no wait: the result, at once. The haptics still fire —
       reduced motion is about the screen, not the hand. */
    cue('dice.roll', { gain:0.6 }, true);
    if (mine) buzz('roll');
    paintMap();
    if (battle.atkLoss || battle.defLoss) cue('duel.hit', { gain:0.7 });
    if (mine && battle.atkLoss) buzz('no');
    if (done) done();
    return;
  }

  const a  = battle.atkDice.slice().sort((x, y) => y - x);
  const dd = battle.defDice.slice().sort((x, y) => y - x);
  const rows = Math.max(a.length, dd.length);
  const cmp  = Math.min(a.length, dd.length);
  const aCol = colourOf(battle.seat);
  const dCol = battle.defSeat >= 0 ? colourOf(battle.defSeat) : { hex:'#3b4a5a' };

  const gen = ++battleGen;
  const overlay = document.createElement('div');
  overlay.className = 'kq-fight';
  overlay.id = 'kq-fight';
  let pairs = '';
  for (let i = 0; i < rows; i++){
    pairs += '<div class="kq-pair">' +
      (i < a.length ? '<div class="kq-die atk roll" data-a="' + i + '">?</div>' : '<div class="kq-hole"></div>') +
      '<div class="kq-cmp" data-c="' + i + '"><svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M6 12h12"/></svg></div>' +
      (i < dd.length ? '<div class="kq-die def roll" data-d="' + i + '">?</div>' : '<div class="kq-hole"></div>') +
    '</div>';
  }
  overlay.innerHTML =
    '<div class="kq-fight-in">' +
      '<div class="kq-fhead">' +
        '<span class="fn" style="color:' + aCol.hex + '">' + esc(TE(fromT.name)) + '</span>' +
        '<span class="fv">' + esc(T('VS', 'KONTRA')) + '</span>' +
        '<span class="fn" style="color:' + dCol.hex + '">' + esc(TE(toT.name)) + '</span>' +
      '</div>' + pairs +
      '<div class="kq-floss">' +
        '<span id="kq-la">' + esc(T('You', 'Int')) + ' 0</span>' +
        '<span id="kq-ld">' + esc(T('Them', 'Huma')) + ' 0</span>' +
      '</div>' +
    '</div>';
  UI.mapbox.appendChild(overlay);

  /* hold the pre-battle counts on the map while the dice are in the air */
  setBadgeNum(battle.from, preFrom);
  setBadgeNum(battle.to, preTo);

  const atkEls = Array.prototype.slice.call(overlay.querySelectorAll('[data-a]'));
  const defEls = Array.prototype.slice.call(overlay.querySelectorAll('[data-d]'));
  const cmpEls = Array.prototype.slice.call(overlay.querySelectorAll('[data-c]'));
  const lossA = overlay.querySelector('#kq-la'), lossD = overlay.querySelector('#kq-ld');

  cue('dice.roll', { gain:0.8 }, true);
  if (mine) buzz('roll');                     /* his dice, in his hand */

  /* 0 tumbling · 1 settled, counting armies off · 2 finished. Every step is
     idempotent, so a tap can jump the sequence forward without racing it. */
  let stage = 0, endT = 0;
  const CHEV_A = 'M6 5l7 7-7 7';              /* attacker took it: points right */
  const CHEV_D = 'M18 5l-7 7 7 7';            /* defender held:    points left  */

  function settle(){
    if (stage >= 1) return;
    stage = 1;
    if (M && M.raf){ cancelAnimationFrame(M.raf); M.raf = 0; }
    atkEls.forEach((el, i) => { el.classList.remove('roll'); el.textContent = a[i]; });
    defEls.forEach((el, i) => { el.classList.remove('roll'); el.textContent = dd[i]; });
    for (let i = 0; i < cmp; i++){
      const attWon = a[i] > dd[i];            /* ties go to the defender */
      const p = cmpEls[i].querySelector('path');
      if (p) p.setAttribute('d', attWon ? CHEV_A : CHEV_D);
      cmpEls[i].classList.add(attWon ? 'a' : 'd');
      if (attWon){ atkEls[i].classList.add('win'); defEls[i].classList.add('lose'); }
      else { defEls[i].classList.add('win'); atkEls[i].classList.add('lose'); }
    }
    if (lossA){ lossA.textContent = T('You', 'Int') + ' −' + battle.atkLoss;
                lossA.className = battle.atkLoss ? 'hit' : ''; }
    if (lossD){ lossD.textContent = T('Them', 'Huma') + ' −' + battle.defLoss;
                lossD.className = battle.defLoss ? 'good' : ''; }
    if (battle.atkLoss || battle.defLoss) cue('duel.hit', { gain:0.75 }, true);
    if (mine && battle.atkLoss) buzz('no');   /* HIS armies just died */
    /* count the losses off the two badges while the result is on screen */
    tickBadge(battle.from, preFrom, postFrom, 150, gen);
    tickBadge(battle.to,   preTo,   postTo,   150, gen);
    endT = setTimeout(finishNow, battle.captured ? 240 : 320);
  }
  function finishNow(){
    if (stage >= 2) return;
    stage = 2;
    battleGen++;                              /* orphan any pending badge tick */
    if (endT){ clearTimeout(endT); endT = 0; }
    if (M && M.raf){ cancelAnimationFrame(M.raf); M.raf = 0; }
    overlay.remove();
    paintMap();                               /* back to the engine's truth */
    if (done) done();
  }

  /* SKIPPABLE. One tap lands the dice (so the result is still readable), a
     second tap clears the fight away. */
  overlay.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (stage === 0) settle(); else finishNow();
  });

  const start = performance.now();
  const DUR = 430;                            /* ~430 tumble + ~150 tick + hold */
  function tumble(now){
    if (stage > 0) return;
    if (now - start >= DUR){ settle(); return; }
    const r = () => 1 + (Math.floor((now * 7) + Math.random() * 6) % 6);
    atkEls.forEach(d => { d.textContent = r(); });
    defEls.forEach(d => { d.textContent = r(); });
    M.raf = requestAnimationFrame(tumble);
  }
  M.raf = requestAnimationFrame(tumble);
}

/* an attack arrow on the SVG, fading */
function drawArrow(a, b){
  if (!UI || !UI.svg || reduced()) return;
  const ns = 'http://www.w3.org/2000/svg';
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', a[0]); line.setAttribute('y1', a[1]);
  line.setAttribute('x2', b[0]); line.setAttribute('y2', b[1]);
  line.setAttribute('stroke', '#fff');
  line.setAttribute('stroke-width', '5');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('opacity', '0.9');
  line.style.filter = 'drop-shadow(0 0 4px rgba(255,80,80,.9))';
  UI.svg.appendChild(line);
  const t0 = performance.now();
  function f(now){
    const k = Math.min(1, (now - t0) / 700);
    line.setAttribute('opacity', (0.9 * (1 - k)).toFixed(2));
    if (k < 1) requestAnimationFrame(f); else line.remove();
  }
  requestAnimationFrame(f);
}

/* ── THE CAPTURE SWEEP ────────────────────────────────────────────────
   A land does not blink to its new owner: the OLD colour is pushed off it,
   from the attacker's border across the shape, behind a bright leading edge.

   Decoration over a state change that has already happened — the engine
   settled this capture before a pixel moved, so the sweep may be skipped,
   shortened or refused (reduced motion) and no phone ever disagrees. It uses
   one clip path and one `transform` on a rect, so it stays on the compositor
   and costs nothing per frame. `fromIdx` is the ATTACKING land, which is what
   gives the sweep a direction a player can read as an invasion. */
let capGen = 0;
function sweepCapture(i, seat, done, fromIdx){
  if (!UI){ if (done) done(); return; }
  const wasHex = UI.terrEls[i] ? UI.terrEls[i].getAttribute('fill') : null;
  paintMap();
  const el = UI.terrEls[i];
  if (el && !reduced()){
    el.classList.add('sel');
    setTimeout(() => { if (el) el.classList.remove('sel'); }, 320);
    runSweep(i, fromIdx, wasHex, colourOf(seat).hi);
  }
  /* region flourish if the capture completed a region for this seat */
  const rid = E.TERRITORIES[i].region;
  if (E.ownsRegion(M.st, seat, rid)){
    cue('sea.horn', { gain:0.85 }, true);
    flashRegion(rid);
    setTimeout(() => { if (done) done(); }, reduced() ? 0 : 520);
    return;
  }
  setTimeout(() => { if (done) done(); }, reduced() ? 0 : 200);
}
/* the sweep itself. Clipped to the captured polygon (the engine's own points —
   nothing recomputed, nothing moved), a slab of the OLD colour slides out the
   far side behind a thin bright edge in the new owner's colour. */
function runSweep(i, fromIdx, oldHex, edgeHex){
  if (!UI || !UI.capg || !UI.capclip || !oldHex) return;
  const ns = 'http://www.w3.org/2000/svg';
  const poly = E.TERRITORIES[i].poly;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let k = 0; k < poly.length; k += 2){
    x0 = Math.min(x0, poly[k]); x1 = Math.max(x1, poly[k]);
    y0 = Math.min(y0, poly[k+1]); y1 = Math.max(y1, poly[k+1]);
  }
  const w = (x1 - x0) + 6, h = (y1 - y0) + 6;
  /* direction: away from the attacker, snapped to the dominant axis so the
     slab edge stays a clean line rather than a diagonal smear. */
  let dx = 1, dy = 0;
  const a = (fromIdx != null && E.TERRITORIES[fromIdx]) ? E.TERRITORIES[fromIdx].c : null;
  const b = E.TERRITORIES[i].c;
  if (a){
    const vx = b[0] - a[0], vy = b[1] - a[1];
    if (Math.abs(vy) > Math.abs(vx)){ dx = 0; dy = vy >= 0 ? 1 : -1; }
    else { dy = 0; dx = vx >= 0 ? 1 : -1; }
  }
  /* one clip, replaced each time: only ever one sweep is on screen. */
  const cp = UI.capclip.querySelector('polygon');
  if (cp) cp.setAttribute('points', ptsOf(i));

  const g = document.createElementNS(ns, 'g');
  g.setAttribute('clip-path', 'url(#kq-capclip)');
  const slab = document.createElementNS(ns, 'rect');
  slab.setAttribute('x', x0 - 3); slab.setAttribute('y', y0 - 3);
  slab.setAttribute('width', w);  slab.setAttribute('height', h);
  slab.setAttribute('fill', oldHex);
  const edge = document.createElementNS(ns, 'rect');
  const eThick = 5;
  edge.setAttribute('x', dx ? (dx > 0 ? x0 - 3 - eThick : x1 + 3) : x0 - 3);
  edge.setAttribute('y', dy ? (dy > 0 ? y0 - 3 - eThick : y1 + 3) : y0 - 3);
  edge.setAttribute('width',  dx ? eThick : w);
  edge.setAttribute('height', dy ? eThick : h);
  edge.setAttribute('fill', edgeHex || '#fff');
  g.appendChild(slab); g.appendChild(edge);
  UI.capg.innerHTML = '';
  UI.capg.appendChild(g);

  const gen = ++capGen;
  const span = (dx ? w : h) + eThick;
  const t0 = performance.now(), DUR = 400;
  function f(now){
    if (!UI || !UI.capg || gen !== capGen) return;
    const k = Math.min(1, (now - t0) / DUR);
    const e = 1 - Math.pow(1 - k, 3);                 /* ease-out */
    const off = span * e;
    g.setAttribute('transform', 'translate(' + (dx * off).toFixed(2) + ',' + (dy * off).toFixed(2) + ')');
    if (k < 1) requestAnimationFrame(f);
    else if (gen === capGen) UI.capg.innerHTML = '';
  }
  requestAnimationFrame(f);
}

function flashRegion(rid){
  if (!UI || reduced()) return;
  const mem = E.REGION_MEMBERS[rid];
  const t0 = performance.now();
  function f(now){
    const k = Math.min(1, (now - t0) / 700);
    const a = Math.sin(k * Math.PI);
    mem.forEach(t => {
      const el = UI.terrEls[t];
      if (el) el.style.filter = 'drop-shadow(0 0 ' + (10 * a).toFixed(1) + 'px rgba(255,197,66,' + (0.9 * a).toFixed(2) + '))';
    });
    if (k < 1) requestAnimationFrame(f);
    else mem.forEach(t => { const el = UI.terrEls[t]; if (el) el.style.filter = ''; });
  }
  requestAnimationFrame(f);
}

/* ═══════════════════════════════════════════════════════════════════
   AFTER A LOCAL MOVE — repaint, check the end, else auto-advance phases
   with no legal action, and let the machine think if it is its turn.
   ═══════════════════════════════════════════════════════════════════ */
function afterLocal(){
  if (!M || M.dead) return;
  paintAll();
  if (E.over(M.st)){ finish(); return; }
  autoAdvanceIfStuck();
  maybeThink();
}

/* if the local player's ATTACK phase has no legal attack, we do NOT
   auto-skip (they may want to just end); but a REINFORCE phase always has
   an action, and a FORTIFY with no move offers only End turn — handled by
   the banner. We DO auto-advance an AI-irrelevant dead phase for smoothness
   only when it belongs to a non-local seat (handled inside maybeThink). */
function autoAdvanceIfStuck(){
  if (!M || M.dead || M.busy) return;
  const st = M.st;
  if (E.over(st)) return;
  const seat = E.turn(st);
  if (!isLocal(seat)) return;
  /* attack phase with zero possible attacks → hint stays; offer auto-move
     on: nothing to do but End attack. We leave the button; no popup. */
}

function maybeThink(){
  if (!M || M.dead || M.timer || M.busy) return;
  const st = M.st;
  if (E.over(st)) return;
  const seat = E.turn(st);
  if (isLocal(seat)) return;
  if (ownerOf(seat) === 'net') return;         /* a live human elsewhere */
  if (M.net && !M.net.iAmHost) return;         /* online: host drives bots/disconnected */
  const delay = reduced() ? 30 : 300;
  M.timer = setTimeout(runAiStep, delay);
}

/* one AI step: think → the single move → apply (with battle animation for
   attacks). Then schedule the next step until the turn passes. Bounded by
   the engine (think always returns a terminating move; endturn passes). */
function runAiStep(){
  M.timer = 0;
  if (!M || M.dead || M.busy) { if (M) maybeThink(); return; }
  const st = M.st;
  if (E.over(st)){ paintAll(); finish(); return; }
  const seat = E.turn(st);
  if (isLocal(seat) || ownerOf(seat) === 'net'){ paintAll(); return; }
  const mv = E.think(st, seat, seatLvl(seat));
  if (!mv){ paintAll(); return; }
  if (mv.t === 'attack'){
    M.busy = true;
    const res = doMove(seat, mv, 'local');
    if (!res.ok){ M.busy = false; paintAll(); return; }
    const battle = M.st.lastBattle;
    /* the machine's fight animates exactly like a human's — but `mine` is
       FALSE, so not one buzz leaves the motor for a turn the player did not
       take. A pocket that shakes for five other seats is a phone put down. */
    playBattle(battle, () => {
      if (M.st._pending){
        const p = M.st._pending;
        const amv = E.think(M.st, seat, seatLvl(seat)) || { t:'advance', n:p.min };
        doMove(seat, amv.t === 'advance' ? amv : { t:'advance', n:p.min }, 'local');
        cue('duel.destroy', { gain:0.7 }, true);
        sweepCapture(battle.to, seat, () => { M.busy = false; continueAi(); }, battle.from);
      } else { M.busy = false; continueAi(); }
    }, false);
    return;
  }
  /* non-attack moves apply instantly */
  const res = doMove(seat, mv, 'local');
  if (!res.ok){ paintAll(); return; }
  if (mv.t === 'place' || mv.t === 'claim' || mv.t === 'deploy') dropInBadge(mv.to);
  paintAll();
  continueAi();
}
function continueAi(){
  if (!M || M.dead) return;
  paintAll();
  if (E.over(M.st)){ finish(); return; }
  const seat = E.turn(M.st);
  if (isLocal(seat) || ownerOf(seat) === 'net'){ return; }
  const setupPh = (M.st.phase === E.PH_CLAIM || M.st.phase === E.PH_DEPLOY);
  const delay = reduced() ? 12 : (setupPh ? 130 : (M.st.phase === E.PH_REINFORCE ? 140 : 200));
  M.timer = setTimeout(runAiStep, delay);
}

/* ═══════════════════════════════════════════════════════════════════
   THE END — into the shared AAA winner screen (js/rebbieh.js). One row
   per player, ranked by the engine's final ranking (survival, then
   territories then armies).
   ═══════════════════════════════════════════════════════════════════ */
function finish(){
  if (!M || M.finished) return;
  M.finished = true;
  stopThinking();
  const st = M.st;
  const ov = E.over(st);
  if (!ov) return;
  /* nothing of ours may be left floating over a finished map */
  killCard('kq-turncard'); killCard('kq-atksheet'); killCard('kq-fight'); killCard('kq-cardsheet');
  killCard('kq-handoff'); if (handOffT){ clearTimeout(handOffT); handOffT = 0; }
  M.picking = false;
  cue('game.win', { gain:0.95 }, true);

  const me = firstLocalSeat();
  const iWon = me >= 0 && ov.winner === me;
  if (iWon) buzz('win');                       /* the one long buzz, and only his */
  if (!M.net && !M.recorded){
    M.recorded = true;
    if (me >= 0){ if (iWon) ST.rec.w++; else ST.rec.l++; }
    persist();
  }
  saveSlot(null);

  const ranking = ov.ranking && ov.ranking.length ? ov.ranking : [ov.winner];
  const rows = ranking.map((seat, i) => {
    const isMe = isLocal(seat);
    const col = colourOf(seat);
    return {
      name: isMe ? T('You', 'Int')
        : ownerOf(seat) === 'ai' ? levelName(seatLvl(seat))
        : seatName(seat),
      place: i + 1,
      you: isMe,
      bot: ownerOf(seat) === 'ai',
      /* WORDS, NOT GLYPHS. rebbieh takes a plain STRING here, not markup, so
         there is no icon to put in it — and a phone that does not own ⬢ or ⚔
         prints two empty boxes on the winner screen. */
      score: E.countTerr(st, seat) + ' ' + T('lands', 'artijiet') + ' · ' +
             E.countArmies(st, seat) + ' ' + T('armies', 'armati'),
      border: col.id
    };
  });

  const net = M.net;
  const title = ov.capped ? T('Time called', 'Ħin mitmum')
    : iWon ? T('The map is yours!', 'Il-mappa hi tiegħek!')
    : (me >= 0) ? T('Conquered', 'Mirbuħ')
    : seatColName(ov.winner) + ' ' + T('rules all', 'jaħkem kollox');

  const show = window.KARTI_REBBIEH && window.KARTI_REBBIEH.show;
  if (!show){
    P.ui.result(M.ctx, {
      tone: iWon ? 'win' : 'lose',
      head: title,
      why: T('The banners are counted.', 'Il-bnadar jingħaddu.'),
      buttons: [
        { label:T('Play again', 'Erġa\' lgħab'), icon:'refresh', cls:'primary',
          go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else setupSheet(); } },
        { label:T('Leave', 'Oħroġ'), icon:'back', cls:'ghost',
          go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }
      ]
    });
    return;
  }
  /* ── THE PAYMENT (tombla-ui's funnel) — the podium path bypasses the
     wrapped P.ui.result that progress.js pays through, so pay here:
     awardPlay exactly once under a stable match id (progress.js dedups
     the id across re-renders and reloads), and the pot through mp.js's
     own idempotent stakeSettle door. `ranked` only when a real pot is
     on the table. The card fallback above still pays through the wrap,
     so nothing on that path changes and nothing pays twice. */
  const MPX = window.KARTI_MP;
  const staked = !!(net && MPX && MPX.MP && MPX.MP.stakeLive);
  const tone = iWon ? 'win' : 'lose';
  /* the match id, lifted out of the payment so the RECORD BOOK below can
     be told under exactly the same id */
  const mid = (net && MPX && MPX.MP && MPX.MP.code != null)
    ? 'konkwista:' + MPX.MP.code + ':' + ((MPX.MP.seed || 0) >>> 0)
    : (M.payId || (M.payId = 'konkwista:' + Date.now().toString(36) + '-' +
                              ((Math.random() * 1e6) | 0).toString(36)));
  let pay = null, potRes = null;
  if (window.KARTI_XP && KARTI_XP.awardPlay){
    try {
      const r = KARTI_XP.awardPlay({ game:'konkwista', won: tone === 'win',
                                     draw: false, id: mid, ranked: staked });
      if (r && r.counted) pay = r;
    } catch(e){}
  }
  /* ── THE RECORD BOOK (js/stats.js) — the profile row and the
     leaderboard. Konkwista reported to nobody, so a win here moved no
     W/L anywhere. AFTER awardPlay and under the SAME id on purpose:
     record() forwards a counted result into progress.js, whose fresh()
     has already stamped 'konkwista:<mid>', so the forward lands on
     'already' and the money still moves exactly once. */
  try {
    if (window.KARTI_STATS && KARTI_STATS.record)
      KARTI_STATS.record('konkwista', { result: tone === 'win' ? 'win' : 'loss', id: mid });
  } catch(e){}
  if (staked && MPX.stakeSettle){
    try { potRes = MPX.stakeSettle(tone); } catch(e){}
  }
  show({
    title,
    subtitle: ov.capped ? T('Most land at the bell', 'L-aktar art meta daqqet il-qanpiena')
                        : T('Last banner standing', 'L-aħħar bandiera weqfa'),
    rows,
    xp: pay ? { level: pay.level, gained: pay.xp, leveledUp: !!pay.levelled,
                before: 0, after: pay.levelled ? 1 : 0.7 } : null,
    reward: (pay || potRes) ? {
      xp: pay ? pay.xp : 0,
      chips: pay ? (pay.chips | 0) + (pay.chipsLevel | 0) : 0,
      wonBonus: pay ? pay.wonBonus : 0,
      staked: potRes ? potRes.ante : 0,
      pot: (potRes && potRes.kind === 'win') ? potRes.pot : 0
    } : undefined,
    reduced: reduced(),
    lang: (window.KARTI_LANG ? KARTI_LANG.lang() : 'en'),
    sound: id => cue(id, {}, true),
    playAgainLabel: net ? T('Back to the rooms', 'Lura fil-kmamar') : T('Play again', 'Erġa\' lgħab'),
    onPlayAgain: () => { leave(); if (net && net.onLeave) net.onLeave(); else setupSheet(); },
    onLeave:     () => { leave(); if (net && net.onLeave) net.onLeave(); else P.hub(); }
  });
}

function leave(){
  stopThinking();
  if (M && M.raf){ cancelAnimationFrame(M.raf); M.raf = 0; }
  battleGen++;                                 /* orphan any pending badge tick */
  killCard('kq-turncard'); killCard('kq-atksheet'); killCard('kq-fight'); killCard('kq-cardsheet');
  killCard('kq-handoff'); if (handOffT){ clearTimeout(handOffT); handOffT = 0; }
  if (M){ autosave(); persistNow(); M.dead = true; M.busy = false; M.picking = false; }
  M = null; UI = null;
}

/* ═══════════════════════════════════════════════════════════════════
   FIRST-RUN TIP
   ═══════════════════════════════════════════════════════════════════ */
function maybeTip(){
  if (seenTip || !UI || !UI.mapbox) return;
  const t = document.createElement('div');
  t.className = 'kq-tip';
  /* the cards icon INLINE, drawn from the sprite rather than typed as an emoji
     — the glyph a phone actually owns is not a thing this file may assume, and
     a tofu box in the one sentence that teaches the game is worse than nothing */
  const cardMark = ico('cards') + '';
  t.innerHTML = '<span>' + T('Share out the world, then ' + PHASE_VOCAB.reinforce.label().toLowerCase() + ', <b>attack</b>, fortify. Take a whole <b>continent</b> for a bonus, and <b>trade cards</b> for armies — tap ' + cardMark + ' to see your hand!',
    'Qassam id-dinja, imbagħad ' + PHASE_VOCAB.reinforce.label().toLowerCase() + ', <b>attakka</b>, fortifika. Ħu <b>kontinent</b> sħiħ għal bonus, u <b>ibdel il-karti</b> għal armati — ikklikkja ' + cardMark + ' biex tara l-karti!') +
    '</span><button id="kq-tipx">' + esc(T('Got it','Fhimt')) + '</button>';
  UI.mapbox.appendChild(t);
  t.querySelector('#kq-tipx').onclick = () => {
    t.remove(); seenTip = true;
    try { localStorage.setItem(UIKEY + '.tip', '1'); } catch(e){}
  };
}

/* ═══════════════════════════════════════════════════════════════════
   THE RULES CARD
   ═══════════════════════════════════════════════════════════════════ */
function rulesFor(){
  return [
    T('<b>The world</b> — forty territories in six <b>continents</b>. The opening is your host’s choice: ' +
      '<b>Claim</b> the lands in turn (an army on each), or a <b>Random deal</b> that shares the whole world ' +
      'out for you. Either way you then spread your remaining setup armies over your own land.',
      '<b>Id-dinja</b> — erbgħin territorju f’sitt <b>kontinenti</b>. Il-bidu jagħżlu min jospita: <b>Ħu</b> ' +
      'l-artijiet bir-rota (armata fuq kull waħda), jew <b>Tqassim aleatorju</b> li jqassam id-dinja kollha. ' +
      'Imbagħad ixxerred il-bqija tal-armati fuq artek.'),
    T('Then play begins. On your turn you take <b>three steps</b>.',
      'Imbagħad tibda l-logħba. F’dawra tiegħek tagħmel <b>tliet passi</b>.'),
    T('<b>1 · ' + PHASE_VOCAB.reinforce.label() + '</b> — armies = one per three lands (at least three) <b>plus every whole continent’s ' +
      'bonus</b> (Aurora 5, Meridia 5, others 2–3). You may also <b>trade a set of three cards</b> for a growing ' +
      'pile of armies (4, 6, 8, 10, 12, 15, then +5 each).',
      '<b>1 · ' + PHASE_VOCAB.reinforce.label() + '</b> — armati = waħda għal kull tliet artijiet (mill-inqas tlieta) <b>flimkien mal-bonus ' +
      'ta’ kull kontinent sħiħ</b>. Tista’ wkoll <b>tibdel sett ta’ tliet karti</b> għal armati (4, 6, 8, 10, 12, 15, imbagħad +5).'),
    T('<b>2 · Attack</b> — tap one of your lands, then a bordering enemy, and an <b>attack sheet</b> opens: ' +
      'both sides’ armies, <b>how many dice you throw</b> (one, two or three — never more than one fewer than ' +
      'the armies standing there) and the honest odds for that choice. Nothing is fired until you press Attack.',
      '<b>2 · Attakka</b> — ikklikkja waħda minn artek, imbagħad għadu maġenbek, u tinfetaħ <b>karta tal-attakk</b>: ' +
      'l-armati taż-żewġ naħat, <b>kemm-il dadu tarmi</b> (wieħed, tnejn jew tlieta — qatt aktar minn armata inqas ' +
      'minn dawk fuq l-art) u ċ-ċansijiet veri. Xejn ma jispara qabel tagħfas Attakka.'),
    T('The dice are compared <b>highest against highest</b>; the higher wins and <b>ties go to the defender</b>. ' +
      'Empty a land and it is <b>yours</b>, and you must move in at least as many armies as dice you threw. ' +
      'Capture at least one land in a turn and you <b>earn a card</b> at its end. ' +
      '<b>The defender never chooses</b> — it always throws the most dice it can, so a fight is never held up ' +
      'waiting on somebody else’s phone.',
      'Id-dadi jitqabblu <b>l-ogħla mal-ogħla</b>; l-ogħla jirbaħ u <b>l-indaqs imur għad-difensur</b>. ' +
      'Battal art u ssir <b>tiegħek</b>, u trid iddaħħal mill-inqas daqs kemm armejt dadi. Aqbad art f’dawra u ' +
      '<b>taqla’ karta</b>. <b>Id-difensur qatt ma jagħżel</b> — dejjem jarmi kemm jista’, biex ebda ġlieda ' +
      'ma tistenna telefon ieħor.'),
    T('<b>3 · Fortify</b> — move armies once between two of your connected lands, then end your turn.',
      '<b>3 · Fortifika</b> — ċaqlaq l-armati darba bejn żewġ artijiet tiegħek konnessi, imbagħad temm id-dawra.'),
    T('Take a rival’s last land and you <b>seize their cards</b>. Hold five or more and you <b>must trade</b>. ' +
      'Own the <b>whole world</b> — every territory — to win.',
      'Ħu l-aħħar art ta’ rivali u <b>taħtaf il-karti tiegħu</b>. Żomm ħamsa jew aktar u <b>trid tibdel</b>. ' +
      'Aħkem id-<b>dinja kollha</b> biex tirbaħ.')
  ];
}
function paintRules(){
  if (!UI || !UI.rules) return;
  UI.rules.querySelector('#kq-rules-t').textContent =
    T('Konkwista', 'Konkwista') + ' — ' + T('the rules', 'ir-regoli');
  UI.rules.querySelector('#kq-rules-b').innerHTML =
    '<ul style="margin:0;padding:0">' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul>';
  UI.rules.classList.toggle('open', rulesOpen);
  UI.rules.setAttribute('aria-hidden', rulesOpen ? 'false' : 'true');
}
function setRules(open){
  rulesOpen = !!open;
  try { localStorage.setItem(UIKEY + '.rules', rulesOpen ? '1' : '0'); } catch(e){}
  cue(rulesOpen ? 'ui.sheet' : 'ui.back', { gain:0.8 });
  paintRules();
}

/* ═══════════════════════════════════════════════════════════════════
   THE ENTRY SCREEN — MINIMAL. PLAY ONLINE / PLAY WITH AI / PASS THE PHONE
   + "How to play". Settings (players, difficulty, turn-cap) are a tiny
   SECOND step. Back goes to the hub with no confirm popup.
   ═══════════════════════════════════════════════════════════════════ */
function heroSVG(){
  /* a little archipelago badge in the seat colours — the game worn as a mark */
  let s = '<svg viewBox="0 0 280 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<defs><linearGradient id="kqh-sea" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#1a5080"/><stop offset="1" stop-color="#0a1c30"/></linearGradient></defs>' +
    '<rect x="0" y="0" width="280" height="150" rx="14" fill="url(#kqh-sea)"/>';
  const isles = [
    [40,50, '#d92b2b'], [95,38,'#2b6cd9'], [150,58,'#e6b422'],
    [205,42,'#2fa34d'], [70,100,'#e8752a'], [135,110,'#8a4bd0'], [215,100,'#d92b2b']
  ];
  isles.forEach(([x,y,c]) => {
    s += '<path d="M' + x + ' ' + y + ' q18 -12 34 2 q10 12 -4 22 q-18 10 -34 -2 q-10 -12 4 -22 z" ' +
      'fill="' + c + '" stroke="#0a1622" stroke-width="2"/>' +
      '<circle cx="' + (x+15) + '" cy="' + (y+10) + '" r="8" fill="rgba(0,0,0,.4)"/>' +
      '<text x="' + (x+15) + '" y="' + (y+14) + '" font-family="var(--disp)" font-weight="900" ' +
      'font-size="11" fill="#fff" text-anchor="middle">' + (Math.floor(Math.random()*4)+2) + '</text>';
  });
  return s + '</svg>';
}

function setupSheet(){
  injectCSS();
  P.show();
  stopThinking(); M = null; UI = null;
  const el = P.ui.screenEl();
  const online = canGoOnline();

  el.innerHTML =
    '<div class="pt-wrap kq-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="kq-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + esc(T('Konkwista', 'Konkwista')) + '</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="kq-hero" aria-hidden="true">' + heroSVG() +
        '<span class="kq-hero-cap">' + E.N_TERR + ' &middot; ' + E.REGIONS.length + '</span></div>' +
      '<p class="blurb">' +
        T('Share out the world, roll the dice, conquer every land. ' + PHASE_VOCAB.reinforce.label() + ', attack, fortify — hold a ' +
          'whole continent for a bonus, trade cards for armies, and be the last banner standing.',
          'Qassam id-dinja, armi d-dadi, aħkem kull art. ' + PHASE_VOCAB.reinforce.label() + ', attakka, fortifika — żomm kontinent ' +
          'sħiħ għal bonus, ibdel il-karti għal armati, u kun l-aħħar bandiera weqfa.') +
      '</p>' +

      (ST.save
        ? '<button class="btn primary" id="kq-res" style="margin:2px 0 12px">' +
          esc(T('Carry on the campaign', 'Kompli l-kampanja')) + '</button>'
        : '') +

      '<div class="kq-modes" style="display:grid;gap:9px;margin-top:4px">' +
        (online
          ? '<button class="btn primary" id="kq-online">' + ico('users') + ' ' +
            esc(T('Play online', 'Ilgħab onlajn')) + '</button>'
          : '') +
        '<button class="btn' + (online ? ' ghost' : ' primary') + '" id="kq-ai">' +
          ico('coach') + ' ' + esc(T('Play with the machine', 'Ilgħab mal-magna')) + '</button>' +
        '<button class="btn ghost" id="kq-pnp">' + ico('users') + ' ' +
          esc(T('Pass the phone', 'Għaddi t-telefon')) + '</button>' +
        '<button class="btn ghost" id="kq-rulesbtn">' + ico('book') + ' ' +
          esc(T('How to play', 'Kif tilgħab')) + '</button>' +
      '</div>' +

      (ST.rec.w + ST.rec.l
        ? '<p class="pt-ledger" style="margin-top:14px">' +
          T('So far: <b>' + ST.rec.w + '</b> won, <b>' + ST.rec.l + '</b> lost.',
            'S’issa: <b>' + ST.rec.w + '</b> rebħin, <b>' + ST.rec.l + '</b> mitlufin.') +
          '</p>'
        : '') +
    '</div>' +

    '<div class="kq-rules" id="kq-menurules" aria-hidden="true">' +
      '<div class="kq-rules-h"><h4>' + esc(T('Konkwista', 'Konkwista')) + ' — ' +
        esc(T('the rules', 'ir-regoli')) + '</h4>' +
        '<button class="kq-rules-x" id="kq-menurules-x" aria-label="' + esc(T('Close', 'Agħlaq')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="kq-rules-b"><ul style="margin:0;padding:0">' +
        rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul></div>' +
    '</div>' +
    '</div>';

  el.querySelector('#kq-back').onclick = () => { cue('ui.back'); P.hub(); };
  const on = el.querySelector('#kq-online');
  if (on) on.onclick = () => { if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('konkwista'); };
  el.querySelector('#kq-ai').onclick  = () => settingsStep('ai');
  el.querySelector('#kq-pnp').onclick = () => settingsStep('pnp');
  const rs = el.querySelector('#kq-res');
  if (rs) rs.onclick = () => { if (ST.save) newGame(null, ST.save); };

  const rules = el.querySelector('#kq-menurules');
  const openRules = o => {
    rules.classList.toggle('open', o);
    rules.setAttribute('aria-hidden', o ? 'false' : 'true');
    cue(o ? 'ui.sheet' : 'ui.back', { gain:0.8 });
  };
  el.querySelector('#kq-rulesbtn').onclick = () => openRules(!rules.classList.contains('open'));
  el.querySelector('#kq-menurules-x').onclick = () => openRules(false);

  if (window.KARTI_LANG && KARTI_LANG.onChange && !setupSheet._sub){
    setupSheet._sub = KARTI_LANG.onChange(() => {
      try { if (!M && el.isConnected && el.querySelector('#kq-ai')) setupSheet();
            else if (M && UI){ paintAll(); paintRules(); } } catch(e){}
    });
  }
}

/* the ONE tiny second step: players, difficulty, turn-cap. Not a wall. */
function settingsStep(mode){
  injectCSS();
  P.show();
  const el = P.ui.screenEl();
  const p = pref();
  let seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, p.seats || 3));
  let humans = mode === 'pnp' ? Math.max(2, Math.min(seats, p.humans || 2)) : 1;
  let lvl = p.lvl || 2;
  let cap = p.turnCap || E.DEFAULT_TURN_CAP;
  let setup = (p.setup === 'random') ? 'random' : 'claim';

  function paint(){
    if (mode === 'pnp') humans = Math.max(2, Math.min(seats, humans));
    el.innerHTML =
      '<div class="pt-wrap kq-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="kq-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(mode === 'pnp' ? T('Pass the phone', 'Għaddi t-telefon') : T('Play the machine', 'Ilgħab mal-magna')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +

        '<div class="tiny pt-lbl">' + esc(T('How many players', 'Kemm-il plejer')) + '</div>' +
        '<div class="pt-opts two" id="kq-seatpick" style="grid-template-columns:repeat(5,1fr)">' +
          [2,3,4,5,6].map(n =>
            '<button class="pt-opt' + (n === seats ? ' on' : '') + '" data-seats="' + n + '" style="min-width:0;text-align:center">' +
            '<b style="font-size:18px">' + n + '</b></button>').join('') +
        '</div>' +

        (mode === 'pnp'
          ? '<div class="tiny pt-lbl" style="margin-top:10px">' + esc(T('People on this phone', 'Nies fuq dan it-telefon')) + '</div>' +
            '<div class="pt-opts two" id="kq-humanpick" style="grid-template-columns:repeat(' + (seats-1) + ',1fr)">' +
              (function(){ let h=''; for(let n=2;n<=seats;n++){ h+='<button class="pt-opt'+(n===humans?' on':'')+'" data-humans="'+n+'" style="min-width:0;text-align:center"><b style="font-size:16px">'+n+'</b></button>'; } return h; })() +
            '</div>' +
            '<div class="tiny" style="opacity:.6;margin-top:5px">' + esc(T('Any empty seats are played by the machine.','Kwalunkwe siġġu vojt jilagħbu l-magna.')) + '</div>'
          : '') +

        (mode === 'ai' || (mode === 'pnp' && humans < seats)
          ? '<div class="tiny pt-lbl" style="margin-top:12px">' + esc(T('How sharp is the machine', 'Kemm hi taħraq il-magna')) + '</div>' +
            '<div class="pt-opts" id="kq-lvl">' + levels().map(o =>
              '<button class="pt-opt' + (o.level === lvl ? ' on' : '') + '" data-lvl="' + o.level + '">' +
              ico(o.icon || ('diff-' + Math.min(3, o.level))) +
              '<b>' + esc(o.name) + '</b><i>' + esc(TE(o.note)) + '</i></button>').join('') +
            '</div>'
          : '') +

        '<div class="tiny pt-lbl" style="margin-top:12px">' + esc(T('How the world is shared out', 'Kif titqassam id-dinja')) + '</div>' +
        '<div class="pt-opts two" id="kq-setup" style="grid-template-columns:repeat(2,1fr)">' +
          '<button class="pt-opt' + (setup === 'claim' ? ' on' : '') + '" data-setup="claim">' +
            '<b>' + esc(T('Claim','Ħu')) + '</b><i>' + esc(T('pick lands in turn','agħżel bir-rota')) + '</i></button>' +
          '<button class="pt-opt' + (setup === 'random' ? ' on' : '') + '" data-setup="random">' +
            '<b>' + esc(T('Random deal','Tqassim aleatorju')) + '</b><i>' + esc(T('dealt out for you','jitqassmu għalik')) + '</i></button>' +
        '</div>' +

        '<div class="tiny pt-lbl" style="margin-top:12px">' + esc(T('Safety turn limit', 'Limitu ta’ sigurtà')) + '</div>' +
        '<div class="pt-opts two" id="kq-cap" style="grid-template-columns:repeat(3,1fr)">' +
          [20,40,80].map(n =>
            '<button class="pt-opt' + (n === cap ? ' on' : '') + '" data-cap="' + n + '" style="min-width:0;text-align:center">' +
            '<b>' + n + '</b><i>' + esc(T('rounds','dawriet')) + '</i></button>').join('') +
        '</div>' +

        '<div class="pt-acts" style="margin-top:18px;display:grid;gap:9px">' +
          '<button class="btn primary" id="kq-go">' + esc(T('Start', 'Ibda')) + '</button>' +
        '</div>' +
      '</div></div>';

    el.querySelector('#kq-back').onclick = () => { cue('ui.back'); setupSheet(); };
    el.querySelectorAll('[data-seats]').forEach(b => b.onclick = () => { seats = +b.dataset.seats; if(mode==='pnp'&&humans>seats)humans=seats; cue('ui.tap',{gain:0.8},true); paint(); });
    el.querySelectorAll('[data-humans]').forEach(b => b.onclick = () => { humans = +b.dataset.humans; cue('ui.tap',{gain:0.8},true); paint(); });
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { lvl = +b.dataset.lvl; cue('ui.tap',{gain:0.8},true); paint(); });
    el.querySelectorAll('[data-cap]').forEach(b => b.onclick = () => { cap = +b.dataset.cap; cue('ui.tap',{gain:0.8},true); paint(); });
    el.querySelectorAll('[data-setup]').forEach(b => b.onclick = () => { setup = b.dataset.setup; cue('ui.tap',{gain:0.8},true); paint(); });
    el.querySelector('#kq-go').onclick = () => {
      pref({ seats, humans, lvl, turnCap:cap, setup });
      newGame({ seats, humans:(mode==='pnp'?humans:1), lvl, turnCap:cap, setup });
    };
  }
  paint();
}

function canGoOnline(){
  try {
    const MP = window.KARTI_MP;
    return !!(MP && MP.openFor && P.online && P.online.konkwista);
  } catch(e){ return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   START A LOCAL GAME. meta stamps who owns each seat. Empty seats (beyond
   `humans`) are the machine.
   ═══════════════════════════════════════════════════════════════════ */
function newGame(opts, snap){
  injectCSS();
  P.show();
  let meta;
  if (snap){
    if (!snap.opts){ setupSheet(); return; }
    startMatch(snap.opts, snap.seed, snap.log);
    meta = snap.meta || defaultMeta(snap.opts);
  } else {
    startMatch(opts, null);
    meta = defaultMeta(opts);
  }
  M.meta = meta;
  applyMeta();
  M.finished = false;
  openBoard(() => setupSheet());
  cue('game.start', { gain:0.9 }, true);
  paintAll();
  autoAdvanceIfStuck();
  maybeThink();      /* if the machine has the first seat, let it open */
}
function defaultMeta(opts){
  opts = opts || {};
  const seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, opts.seats | 0 || 3));
  const lvl = opts.lvl || 2;
  const humans = Math.max(1, Math.min(seats, opts.humans | 0 || 1));
  const meta = [];
  for (let i = 0; i < seats; i++){
    if (i === 0) meta.push({ own:'me', name: myName(), lvl });
    else if (i < humans) meta.push({ own:'hot', name: T('Player', 'Plejer') + ' ' + (i + 1), lvl });
    else meta.push({ own:'ai', name: levelName(lvl), lvl });
  }
  return meta;
}
function myName(){
  try {
    const n = K.displayName && K.displayName();
    if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
      return String(n).trim().slice(0, 14);
  } catch(e){}
  return T('You', 'Int');
}

/* ═══════════════════════════════════════════════════════════════════
   THE ONLINE CONTROLLER — KARTI_PARTY.online.konkwista. js/mp.js is the
   only caller. Turn-based move relay (NOT lockstep): a flat move is
   relayed and applied deterministically on every client; the seeded dice
   are recomputed identically, so all clients agree on the board and whose
   turn it is. A disconnected seat is CONTINUED BY THE AI (the host drives
   it) so the table never deadlocks.
   ═══════════════════════════════════════════════════════════════════ */
const hooks = {
  /* js/mp.js subscribes with (move, { seat, src }) while our own feed fires
     ONE {seat, move, index, src} event. Adapt here (same fix as aqleb-ui):
     without it, mp.js received the whole event object as the move, toWire()
     found no `t` on it, and the table was stopped on the FIRST local move. */
  onMove(fn){
    const f = ev => { if (ev) fn(ev.move, { seat: ev.seat, src: ev.src }); };
    moveSubs.push(f);
    return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); };
  },
  phase(){ return M ? 'play' : 'idle'; },
  apply(seat, move){ if (!M) return { ok:false, why:'no konkwista' }; return onlineRemote(seat, move); },
  attachNet(net){ if (M){ M.net = net || null; maybeThink(); } },
  setOwner(i, own){ if (M && M.meta && M.meta[i]){ M.meta[i].own = own; if (own === 'ai' && !M.meta[i].lvl) M.meta[i].lvl = 2; maybeThink(); } },
  setName(i, name){ if (M && M.meta && M.meta[i] && name){ M.meta[i].name = name; } },
  live(){ return !!(M && !M.dead && !E.over(M.st)); },
  /* A CHAIR THAT IS GONE FOR GOOD. No engine walkout exists and a seat
     turned 'ai' mid-game cannot ride the wire (mp.js only relays bot moves
     for seats in began.bots), so stop the table honestly (kodici's pattern)
     instead of parking the turn on an empty chair forever. The stop card's
     wrapped P.ui.result settles any stake as a draw — antes home. */
  seatGone(seat){
    if (!M || M.dead || !M.net || E.over(M.st)) return;
    const who = (M.meta && M.meta[seat] && M.meta[seat].name) || T('Somebody', 'Xi ħadd');
    onlineStop(who + ' ' + T('left the table — the map cannot be fought over an empty chair.',
                             'telaq mill-mejda — il-mappa ma tistax titkompla b’siġġu vojt.'));
  },
  seatBack(){ if (M){ paintAll(); } }
};

function onlineStart(cfg){
  cfg = cfg || {};
  injectCSS();
  P.show();
  const roomSeats = cfg.seats || [];
  const nSeats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, roomSeats.length || 3));
  /* DETERMINISM GUARD — online MUST run off the ONE shared relay seed. Never
     let startMatch fall back to newSeed() (a per-client Math.random), which
     would give every phone a different board/dice stream and desync the table.
     The relay broadcasts one numeric seed to all clients; coerce a missing one
     to 0 (still shared) rather than to a random per-client value. The opening
     is likewise pinned to the shared 'claim' setup so no client diverges on how
     the board is dealt. */
  const sharedSeed = (typeof cfg.seed === 'number') ? (cfg.seed >>> 0) : 0;
  startMatch({ seats:nSeats, lvl: 2, turnCap: (cfg.turnCap || E.DEFAULT_TURN_CAP), setup: 'claim' }, sharedSeed);
  M.meta = [];
  for (let i = 0; i < nSeats; i++){
    const s = roomSeats[i] || {};
    const own = (i === cfg.you) ? 'me' : (s.own === 'ai' || s.kind === 'cpu') ? 'ai' : 'net';
    M.meta.push({ own, name: s.name || seatColName(i), lvl: s.level || 2 });
  }
  /* ── WHAT THE OTHER PEOPLE LOOK LIKE ──────────────────────────────────
     A READ of what the relay already publishes — no new wire field, nothing
     added to the contract, nothing sent. KARTI_MP.rosterSeats() carries each
     chair's account key (`av`), photo version (`pv`) and the face/border/badge
     the player equipped (`look`), and the seat chips draw them through the
     app's own declarative avatar span.

     MATCHED BY .seat, NEVER BY ARRAY INDEX. rosterSeats() filter(Boolean)s its
     source, so a table with a gap in it hands back a SHORTER list and every
     position after the gap is somebody else — which would put one player's
     photograph on another player's chair, at a table where the seat is the
     game rule.

     SNAPSHOTTED ONCE, HERE. A face that changes mid-match is a face nobody can
     trust; the seat signature that decides when the chips are rebuilt reads
     these values, so freezing them also keeps the row still. */
  try {
    const MPX = window.KARTI_MP;
    if (MPX && MPX.rosterSeats){
      const rs = MPX.rosterSeats() || [];
      rs.forEach(r => {
        if (!r || r.seat == null) return;
        const m = M.meta[r.seat | 0];
        if (!m || m.own !== 'net') return;
        if (r.av) m.av = r.av;
        if (r.pv) m.pv = r.pv | 0;
        if (r.look) m.look = r.look;
      });
    }
  } catch(e){}
  applyMeta();
  /* raised BEFORE openBoard: buildBoard has to know whether the NEW button is
     written into the DOM at all, and M.net alone arrives on the next line. */
  M.online = true;
  M.net = cfg.net || null;
  M.finished = false;
  openBoard(() => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); });
  hooks.attachNet(cfg.net || null);
  paintAll();
  maybeThink();
  return snapshot();
}
function onlineRemote(seat, move){
  if (!M) return { ok:false, why:'no konkwista on the table' };
  if (E.over(M.st)) return { ok:false, why:'the game is over' };
  const dec = E.decWire ? (E.decWire(move) || move) : move;
  if (!E.check(M.st, dec, seat)) return { ok:false, why:'that move did not fit the rules' };
  /* a remote attack animates too, for parity */
  if (dec.t === 'attack'){
    M.busy = true;
    const res = doMove(seat, dec, 'net');
    if (!res.ok){ M.busy = false; return { ok:false, why: res.err || 'illegal' }; }
    const battle = M.st.lastBattle;
    /* a REMOTE seat's fight: animated for parity, silent in the hand. */
    playBattle(battle, () => {
      if (M.st._pending){ /* the advance arrives as its own relayed move */ }
      M.busy = false; paintAll();
      if (E.over(M.st)) finish();
    }, false);
    return { ok:true };
  }
  const res = doMove(seat, dec, 'net');
  if (!res.ok) return { ok:false, why: res.err || 'that move did not fit the rules' };
  if (dec.t === 'advance' && M.st.lastBattle && M.st.lastBattle.captured) sweepCapture(M.st.lastBattle.to, seat, () => {});
  if (dec.t === 'place' || dec.t === 'claim' || dec.t === 'deploy') dropInBadge(dec.to);
  paintAll();
  if (E.over(M.st)) finish();
  return { ok:true };
}
function onlineNote(text, tone){ if (M && M.ctx) P.ui.setNet(M.ctx, text || '', tone || ''); }
function onlineStop(why, tone){
  if (!M || !M.ctx) return;
  stopThinking();
  P.ui.setNet(M.ctx, '', '');
  P.ui.result(M.ctx, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? T('No result', 'Ebda riżultat') : T('Cut off', 'Inqata’'),
    why:  why || T('The game stopped.', 'Il-logħba waqfet.'),
    quip: T('The map is folded away.', 'Il-mappa tintwa.'),
    buttons: [{ label:T('Back to the rooms', 'Lura fil-kmamar'), icon:'back', cls:'primary',
                go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
  });
}

P.online = P.online || {};
P.online.konkwista = {
  start: onlineStart,
  remote: onlineRemote,
  note: onlineNote,
  stop: onlineStop,
  live: () => !!(M && !M.dead && hooks.live()),
  hooks
};

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — window.KARTI_KONKWISTA.lobby. Read by js/mp.js.
   Two to six seats. canStart refuses until the relay knows 'konkwista'
   (the integration must add it — noted in the report).
   ═══════════════════════════════════════════════════════════════════ */
const LOBBY = {
  id:'konkwista',
  name:'Konkwista',
  mt:'Konkwista',
  minSeats: E.MIN_SEATS,
  maxSeats: E.MAX_SEATS,
  levels: levels().map(L => ({ level:L.level, name:L.name, note:TE(L.note) })),
  defaultLevel: 2,
  variants: null,          /* one map / one mode for now; no variant wall */
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    const n = (seatList || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why: T('Konkwista needs at least two.', 'Konkwista trid mill-inqas tnejn.') };
    if (n > E.MAX_SEATS) return { ok:false, why: T('Up to six can play.', 'Sa sitta jistgħu jilagħbu.') };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready) return { ok:false, why: unready + (unready > 1
        ? T(' people are not ready yet.', ' persuni għadhom mhux lesti.')
        : T(' person is not ready yet.', ' persuna għadha mhux lesta.')) };
    return { ok:true, why:'' };
  },
  rulesHTML: () =>
    '<p>' + T('Two to six players carve up a world of forty lands in six continents. Each turn: ' + PHASE_VOCAB.reinforce.label().toLowerCase() + ', ' +
      'attack a neighbour with the dice, then fortify. Hold a whole continent for a bonus, and trade sets of cards for armies.',
      'Minn tnejn sa sitta jaqsmu dinja ta’ erbgħin art f’sitt kontinenti. Kull dawra: ' + PHASE_VOCAB.reinforce.label().toLowerCase() + ', attakka ġar bid-dadi, imbagħad fortifika. ' +
      'Żomm kontinent sħiħ għal bonus, u ibdel settijiet ta’ karti għal armati.') + '</p>' +
    '<p>' + T('Lose all your land and you are out; the last banner standing wins. Perfect information and ' +
      'shared dice make online as honest as across a table.',
      'Itlef artek kollha u toħroġ; l-aħħar bandiera tirbaħ. Informazzjoni sħiħa u dadi maqsuma jagħmlu ' +
      'l-onlajn onest daqs wiċċ imb wiċċ.') + '</p>',
  blurb: T('Share out the world, roll the dice, conquer every land.',
           'Qassam id-dinja, armi d-dadi, aħkem kull art.'),
  start(seats, opts){
    return newGame(Object.assign({ seats: Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, (seats||[]).length || 3)),
                                   humans:2, lvl:(pref().lvl || 2) }, opts || {}));
  },
  myName,
  wire: { fields: E.WIRE_FIELDS },
  takeback: false
};
R.lobby = LOBBY;

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF — one tile. kind:'board' puts it with the board games.
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'konkwista', order:29, kind:'board', cat:'board',
  name:'Konkwista', mt:'Konkwista', icon:'map', status:'live',
  get tag(){
    return T('Share out the world, roll the dice, conquer every land. A world conquest for ' +
             'two to six — ' + PHASE_VOCAB.reinforce.label().toLowerCase() + ', attack, fortify, trade cards, and hold a continent for a bonus.',
             'Qassam id-dinja, armi d-dadi, aħkem kull art. Konkwista tad-dinja għal tnejn sa sitta — ' +
             PHASE_VOCAB.reinforce.label().toLowerCase() + ', attakka, fortifika, ibdel karti, u żomm kontinent għal bonus.') +
           (ST.save ? ' ' + T('There is a campaign half-played.', 'Hemm kampanja nofsha milgħuba.') : '');
  },
  open: () => setupSheet(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: LOBBY.levels,
  rulesHTML: () => LOBBY.rulesHTML(),
  start: (seatList, o) => LOBBY.start(seatList, o)
};
R.shelfTile = TILE;
R.ui = { open: setupSheet, board: buildBoard, leave, injectCSS };
R.open  = () => setupSheet();
R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

/* ── test hooks — inert unless the page is opened with ?konkwistatest ── */
if (/[?&]konkwistatest\b/.test(location.search || '')){
  window.__KONKWISTA_TEST = {
    setupSheet, settingsStep, newGame, onTerr, onAct, launchAttack, paintAll,
    get M(){ return M; }, get UI(){ return UI; },
    engine: E, LOBBY, hooks, online: P.online.konkwista, leave,
    computeLegalSet, reduced,
    /* the revamp: the phase bar, the seat row and the online gate */
    onPhaseStep, paintPhaseBar, paintSeats, buildSeats, seatSig,
    PHASE_STEPS, PHASE_VOCAB, isOnlineMatch,
    /* the interactive pass: the picker, the readout and the odds behind them */
    openAttackSheet, showTurnCard, reinforceBreakdown,
    exchangeOdds, conquerChance, conquerChanceWith, atkDiceMax, defDiceMax,
    playBattle,
    /* drive the local seat through the REAL move gate (what a thumb triggers),
       then run the same post-move pipeline the UI runs. */
    doMove: (seat, move) => { const r = doMove(seat, move, 'local'); afterLocal(); return r; },
    afterLocal, finish
  };
}

})();
