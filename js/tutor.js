/* ═══════════════════════════════════════════════════════════════════
   KARTI — tutor.js
   IT-TAĦRIĠ — the tutorial. Ziju Ċensu drags you through the rules on a
   REAL duel board: real engine, real cards, real damage. Nobody reads a
   manual, so there isn't one — you do every rule with your own thumb.

   Loads AFTER game.js. Owns nothing but window.KARTI_TUTOR and its own
   `.tut-` CSS, injected from here. Talks to the engine only through
   window.KARTI, parks the AI with window.KHOOK, and saves completion into
   the existing per-user save (S.tutorDone).

   TWO THINGS THIS FILE IS VERY CAREFUL ABOUT
   ------------------------------------------
   1. DETERMINISM. A lesson that says "your 1900 against their 1600" is a
      lie the moment the board is dealt differently. The engine's random
      numbers all go through KARTI.setRNG(), so the tutorial seeds it with
      a fixed seed on the way in and RESTORES it (setRNG(null)) on every
      way out — finish, skip, forfeit, error, or wandering off the screen.
      Leaving it seeded would make every later duel predictable and could
      break online lockstep, so every exit path goes through rngRestore().

   2. IT NEVER HARDCODES A NUMBER. The cards get rebalanced. So the lesson
      picks the cards it needs BY PROPERTY at runtime ("a Level ≤ 4 monster
      with no effect", "the biggest tribute monster", "a trap") and reads
      every ATK / DEF / Level / tribute cost / counter bonus straight out
      of the card data when the step is drawn. If nothing matches a role it
      shouts in the console instead of quietly teaching the wrong thing.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
if (!K) return;
const $ = K.$, $$ = K.$$, esc = K.esc;

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pause = ms => new Promise(r => setTimeout(r, REDUCED ? Math.min(ms, 30) : ms));
const slow  = ms => REDUCED ? Math.min(ms, 40) : ms;

const COACH = { i:'coach', n:'ZIJU ĊENSU' };
const ico = (n, label, cls) => (window.ICO ? window.ICO(n, label, cls) : '');
const ilb = (n, html, cls) => (window.ILB ? window.ILB(n, html, cls) : html);
const FOE_NAME = 'IL-PUPAZZ';

/* ── runtime state ── */
let live = false;          /* the tutorial is driving the board */
let si = 0;                /* current step index */
let timer = null;
let opts = {};
let ctx = {};              /* per-step scratch (baselines, zone indexes) */
let tuid = 90000;          /* instance uids kept well clear of the engine's */
let nudgeAt = 0, nudgeMsg = '';
let foeBusy = false;
let trapFired = '';        /* name of the trap the engine actually flipped */
let CAST = null;           /* the cards this run picked for each teaching role */

/* ═══════════════════════════════════════════════════════════════════
   1 — DETERMINISM
   mulberry32, self-contained. The seed is a constant, so run one and run
   fifty deal the identical board, the identical draws and the identical
   scripted opponent, and the coaching text can safely name cards.
   ═══════════════════════════════════════════════════════════════════ */
const TUT_SEED = 0x4B41525449 % 0xFFFFFFFF;   /* "KARTI", folded to 32 bits */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
let rngHeld = false;
function rngSeed(){
  if (typeof K.setRNG !== 'function') return;
  K.setRNG(mulberry32(TUT_SEED));
  rngHeld = true;
}
/* Give the engine its normal Math.random back. Idempotent on purpose — it is
   called from teardown, skip, bail, the finish screen and the error path, and
   calling it twice must be harmless. */
function rngRestore(){
  if (!rngHeld) return;
  rngHeld = false;
  if (typeof K.setRNG === 'function') K.setRNG(null);
}

/* ═══════════════════════════════════════════════════════════════════
   BOARD HELPERS — we write straight into KARTI.D, using the same
   instance shape the engine's summon() builds.
   ═══════════════════════════════════════════════════════════════════ */
function mkInst(cid, pos, fd, sumTurn){
  const card = K.cardById(cid);
  if (!card) return null;
  return {
    uid: ++tuid, cid, card, owner: 0,
    pos: pos || 'atk', fd: !!fd, mod:0, tempMod:0,
    atkCount:0, maxAtk: (card.fx === 'double' || card.fx === 'cleave') ? 2 : 1,
    monsterOnly: card.fx === 'cleave', shieldUsed:false,
    sumTurn: sumTurn === undefined ? -1 : sumTurn
  };
}
function setField(pi, list){
  const P = K.D.p[pi];
  P.mz = new Array(K.ZONES).fill(null);
  (list || []).forEach((s, i) => {
    if (!s) return;
    const inst = mkInst(s.cid, s.pos, s.fd, s.sumTurn);
    if (inst){ inst.owner = pi; P.mz[i] = inst; }
  });
}
const mine = () => K.D.p[0];
const them = () => K.D.p[1];
const monsters = pi => K.D.p[pi].mz.filter(Boolean);

/* deck filler — the hand is scripted for every lesson, the deck only has to
   exist so a draw never decks anybody out halfway through. */
function filler(n, ids){
  const out = [];
  const src = (ids || []).filter(Boolean);
  if (!src.length) return out;
  for (let i = 0; i < n; i++) out.push(src[i % src.length]);
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   2 — CASTING: pick the cards the lesson needs BY PROPERTY.
   Nothing below names a card id. The rebalance can move every ATK, retune
   the tribute curve, rename cards or cut starter decks and these roles
   still resolve — or shout in the console if they genuinely cannot.
   ═══════════════════════════════════════════════════════════════════ */
function loud(role, why){
  console.error('[tutor] no card matches the role "' + role + '" — ' + why +
                '. The lesson will fall back, check js/cards.js.');
}
const isMonster = c => c && c.t === 'monster';
const plain     = c => isMonster(c) && !c.fx;            /* no effect text to explain away */
const freeSum   = c => isMonster(c) && K.tributesFor(c.lvl) === 0;
const byAttr    = f => (K.CARDS || []).filter(c => isMonster(c) && c.f === f);
const maxBy     = (arr, f) => arr.reduce((a, b) => (a == null || f(b) > f(a) ? b : a), null);

/* the highest Level that still summons for nothing — read, never assumed */
function freeLevelCap(){
  let cap = 1;
  for (let lvl = 1; lvl <= 13; lvl++) if (K.tributesFor(lvl) === 0) cap = lvl;
  return cap;
}

/* every cycle in the counter map, so the ring panel describes the ring that
   actually exists (a triangle today, a triangle + a pair with set2 loaded) */
function ringChains(){
  const C = K.COUNTERS || {};
  const seen = Object.create(null), out = [];
  Object.keys(C).forEach(start => {
    if (seen[start]) return;
    const chain = [];
    let cur = start;
    for (let i = 0; i < 24 && cur && !seen[cur]; i++){
      seen[cur] = true; chain.push(cur); cur = C[cur];
    }
    if (chain.length > 1) out.push(chain);
  });
  return out;
}
function ringChain(){                                  /* kept for _dbg / callers */
  const all = ringChains();
  const mineF = CAST && CAST.attr;
  return (mineF && all.find(c => c.indexOf(mineF) >= 0)) || all[0] || [];
}

function castCards(){
  const C  = K.COUNTERS || {};
  const SD = K.STARTER_DECKS || {};
  const attrs = Object.keys(K.ATTR || {});
  const sdKeys = Object.keys(SD);

  /* Which deck do we hand the student? Never "festa" by name — the starters
     are being cut. Prefer one that sits on the counter ring AND whose victim
     also still has a deck, so the ring lesson has a real opponent. */
  let deckKey = sdKeys.find(k => C[k] && SD[C[k]])
             || sdKeys.find(k => C[k])
             || sdKeys[0] || null;
  if (!deckKey) loud('starter deck', 'STARTER_DECKS is empty');
  const attr = (deckKey && K.ATTR[deckKey]) ? deckKey : (attrs.find(f => C[f]) || attrs[0]);
  const beats = C[attr] || null;                      /* the side we get +BONUS against */
  const foeKey = (beats && SD[beats]) ? beats : (sdKeys.find(k => k !== deckKey) || deckKey);

  /* A "neutral" attribute for the pure-arithmetic battle lessons: it must not
     counter us and we must not counter it, so the maths on screen is only the
     maths, with no invisible +BONUS muddying it. */
  const neutral = attrs.find(f => f !== attr && C[f] !== attr && C[attr] !== f) || attr;

  const myPool  = byAttr(attr);
  const nPool   = byAttr(neutral);
  const myFree  = myPool.filter(c => plain(c) && freeSum(c) && c.atk > 0);
  const nFree   = nPool.filter(c => plain(c) && freeSum(c) && c.atk > 0);
  if (!myFree.length) loud('hero', 'no effect-free Level ≤ ' + freeLevelCap() + ' monster of ' + attr);
  if (!nFree.length)  loud('opponent body', 'no effect-free free-summon monster of ' + neutral);

  /* HERO — the card the student keeps seeing. Biggest free vanilla beater. */
  const hero = maxBy(myFree, c => c.atk) || maxBy(myPool, c => c.atk) || (K.CARDS || [])[0];

  /* FOE MID — smaller than the hero, but bigger than something of ours, so the
     same pair of cards can teach "you win" and "you lose". */
  let foeMid = null, small = null;
  nFree.slice().sort((a, b) => b.atk - a.atk).some(cand => {
    if (cand.atk >= hero.atk) return false;
    const under = myFree.filter(c => c.atk < cand.atk);
    if (!under.length) return false;
    /* the loss should sting without being silly — aim around 70% of theirs */
    const want = cand.atk * 0.7;
    small = under.reduce((a, b) => Math.abs(b.atk - want) < Math.abs(a.atk - want) ? b : a);
    foeMid = cand;
    return true;
  });
  if (!foeMid){ loud('foe mid body', 'nothing of ' + neutral + ' sits below the hero'); foeMid = maxBy(nFree, c => c.atk) || hero; }
  if (!small){ loud('weak attacker', 'nothing of ' + attr + ' sits below the foe body'); small = myFree[0] || hero; }

  /* FOE WALL — dies to the hero on DEF, so "beat a defence, nobody loses LP". */
  const walls = nFree.filter(c => c.def > 0 && c.def < hero.atk);
  const foeWall = maxBy(walls, c => c.def) || foeMid;
  if (!walls.length) loud('foe wall', 'no ' + neutral + ' monster with DEF under the hero ATK');

  /* MY WALL — something obviously worth setting face-down: DEF beats its ATK. */
  const myWalls = myFree.filter(c => c.def > c.atk);
  const wall = maxBy(myWalls, c => c.def) || small;
  if (!myWalls.length) loud('defensive card', 'no ' + attr + ' monster whose DEF beats its ATK');

  /* BIG — the most expensive thing this attribute can field, so the tribute
     lesson always demonstrates the top of whatever curve tributesFor() has. */
  const bad = { boom:1, kamikaze:1 };                 /* would blow up mid-lesson */
  const payable = myPool.filter(c => K.tributesFor(c.lvl) > 0 && !bad[c.fx]);
  const topCost = payable.reduce((a, c) => Math.max(a, K.tributesFor(c.lvl)), 0);
  const bigPool = payable.filter(c => K.tributesFor(c.lvl) === topCost);
  const big = maxBy(bigPool.filter(plain), c => c.atk) || maxBy(bigPool, c => c.atk) || hero;
  const bigCost = K.tributesFor(big.lvl);
  if (!payable.length) loud('tribute monster', 'nothing of ' + attr + ' costs a tribute at all');

  /* FODDER — the cheapest bodies we can bear to throw away. */
  const cheap = myFree.slice().sort((a, b) => a.atk - b.atk);
  const fodder = [];
  for (let i = 0; i < Math.max(bigCost, 1); i++) fodder.push((cheap[i] || cheap[0] || hero).id);

  /* SPELL — must resolve with no target, and must visibly do something. */
  const spells = (K.CARDS || []).filter(c => c.t === 'spell' && !K.spellNeedsTarget(c));
  const spell = spells.find(c => c.fx === 's_draw') || spells.find(c => c.fx === 's_draw1')
             || spells[0] || null;
  if (!spell) loud('spell', 'no spell resolves without a target');

  /* TRAP — prefer one whose effect is impossible to miss on screen. */
  const traps = (K.CARDS || []).filter(c => c.t === 'trap');
  const trap = ['t_destroy', 't_bounce', 't_negate', 't_burn', 't_mirror', 't_weaken']
                 .reduce((a, fx) => a || traps.find(c => c.fx === fx), null) || traps[0] || null;
  if (!trap) loud('trap', 'there are no trap cards at all');

  /* RING PAIR — ours must LOSE on paper and WIN once the bonus lands, or the
     whole point of the ring never actually appears on screen. */
  const bonus = K.COUNTER_BONUS || 0;
  const foeRingPool = beats ? byAttr(beats).filter(c => plain(c) && freeSum(c)) : [];
  let ringMe = null, ringFoe = null, ringScore = -1;
  myFree.forEach(a => foeRingPool.forEach(d => {
    const upset = d.atk - a.atk;                      /* how far down we start */
    const dmg   = a.atk + bonus - d.atk;              /* what they pay for it */
    if (upset <= 0 || dmg <= 0) return;
    const score = Math.min(upset, dmg);               /* both halves must be visible */
    if (score > ringScore){ ringScore = score; ringMe = a; ringFoe = d; }
  }));
  if (!ringMe){
    loud('ring pair', 'no ' + attr + ' attacker loses to a ' + (beats || '?') +
                      ' body by less than the +' + bonus + ' bonus');
    ringMe = small; ringFoe = maxBy(foeRingPool, c => c.atk) || foeMid;
  }

  return { deckKey, foeKey, attr, beats, neutral,
           hero, small, wall, big, bigCost, fodder,
           foeMid, foeWall, spell, trap, ringMe, ringFoe, bonus,
           freeCap: freeLevelCap() };
}

/* ── text helpers: every number on screen is read live, never typed ── */
const NM = c => '<b>' + esc(c ? c.n : '?') + '</b>';
const AT = c => '<b>' + (c ? c.atk : 0) + '</b>';
const DF = c => '<b>' + (c ? c.def : 0) + '</b>';
const LV = c => '<b>' + (c ? c.lvl : 0) + '</b>';
const NB = n => '<b>' + n + '</b>';
const effOf = c => (c && K.effText ? K.effText(c) : '') || '';

/* ── the ring panel, drawn from COUNTERS so it can never describe a ring
      that does not exist (it was calling a 3-way triangle "five-way") ── */
function ringHTML(hi){
  const chains = ringChains();
  if (!chains.length) return '';
  const rows = chains.map(chain => {
    const head = K.ATTR[chain[0]] || { n:'?' };
    return '<div class="tut-ring">' + chain.map((f, i) => {
      const a = K.ATTR[f] || { n:f, c:'#888' };
      const on = hi && hi.indexOf(f) >= 0;
      return '<span class="tut-node' + (on ? ' on' : '') + '" style="--nc:' + a.c + '">' +
               ico(K.ATTR_ICON[f]) + ' ' + esc(a.n) + '</span>' +
             (i < chain.length - 1 ? '<span class="tut-arw">›</span>' : '');
    }).join('') + '<span class="tut-arw">' + ico('refresh', 'and back to ' + head.n) + '</span></div>';
  }).join('');
  const big = chains[0];
  return rows +
    '<p class="tut-note">Read it left to right: each one <b>beats</b> the next, and the last loops ' +
    'back to the first — ' + NB(big.length) + ' sides going round. Attack a side you <b>beat</b> and ' +
    'that monster swings at <b>+' + (K.COUNTER_BONUS || 0) + ' ATK</b>, free, just for that one battle.</p>';
}

/* the tribute table, derived from the engine's own tributesFor — never guessed */
function tributeRows(){
  const rows = [];
  let cur = K.tributesFor(1), from = 1;
  for (let lvl = 2; lvl <= 13; lvl++){
    const t = K.tributesFor(lvl);
    if (t !== cur){ rows.push({ from, to: lvl - 1, t: cur }); from = lvl; cur = t; }
  }
  rows.push({ from, to: 12, t: cur, open:true });        /* the top band has no ceiling */
  return rows;
}
function tributeHTML(){
  return '<div class="tut-trrow">' + tributeRows().map(r =>
    '<span class="tut-tr"><b>LVL ' + r.from +
      (r.open ? '+' : r.to > r.from ? '–' + r.to : '') + '</b> ' +
    (r.t === 0 ? 'free' : r.t + ' tribute' + (r.t > 1 ? 's' : '')) + '</span>').join('') + '</div>';
}
/* a live stat readout for the cards the current step is talking about */
function facts(list){
  return '<div class="tut-facts">' + list.filter(Boolean).map(x =>
    '<span class="tut-fact"><b>' + esc(x.c.n) + '</b>' +
      (x.c.t === 'monster'
        ? '<i>LVL ' + x.c.lvl + '</i><i>' + x.c.atk + ' ATK</i><i>' + x.c.def + ' DEF</i>'
        : '<i>' + String(x.c.t).toUpperCase() + '</i>') +
      (x.tag ? '<u>' + esc(x.tag) + '</u>' : '') + '</span>').join('') + '</div>';
}

/* ═══════════════════════════════════════════════════════════════════
   3 — SHARED STEP PLUMBING
   ═══════════════════════════════════════════════════════════════════ */
/* battle lessons need a turn that is allowed to have a battle phase at all —
   the engine bans one on turn 1, and that rule is taught, not dodged */
function ensureBattleTurn(){
  if (K.D.turnCount < 2) K.D.turnCount = 2;
}
function battleSetup(my, foe, phase){
  const P = mine(), O = them();
  setField(0, my);
  setField(1, foe);
  P.hand = [];
  P.sz = new Array(K.ZONES).fill(null);
  O.sz = new Array(K.ZONES).fill(null);
  P.normalSummoned = true;
  P.noAttackTurn = -1; O.noAttackTurn = -1;
  K.D.turn = 0;
  ensureBattleTurn();
  K.D.phase = phase || 'battle';
  K.D.over = false;
  ctx.foeLp = O.lp;
  ctx.myLp = P.lp;
  K.resetUI();
}
/* what to point at during a battle step, as the state moves along */
function battleHl(zi){
  if (!K.D) return [];
  if (K.D.phase === 'main') return ['#actbar .btn.hot'];
  const U = K.UI;
  if (U && U.mode === 'attack'){
    const t = U.targets || [];
    if (t.indexOf(-1) >= 0) return ['#actbar .btn.hot'];
    return t.map(i => '.zone[data-side="1"][data-kind="m"][data-i="' + i + '"]');
  }
  return ['.zone[data-side="0"][data-kind="m"][data-i="' + zi + '"]'];
}
const HAND_HL = ['#me-hand .h'];

/* ═══════════════════════════════════════════════════════════════════
   4 — THE LESSONS
   Every step: t = title · say = the coach (string or function) ·
   info:true gives it a Next button instead of a job · setup() rebuilds the
   board · check() is polled and returns true (done) / a string (a nudge) /
   false. Nothing here types a stat: it all comes off CAST at draw time.
   ═══════════════════════════════════════════════════════════════════ */
const STEPS = [

/* 1 ─────────────────────────────────────────────────── what winning is */
{
  t:'L-għan — what you are actually trying to do',
  info:true,
  say:() =>
    'Oqgħod bilqiegħda. You both start on ' + NB(K.LP_START) + ' <b>life points</b> — the big number at ' +
    'the <b>bottom</b> is yours, the one at the <b>top</b> is the pupazz’s. Knock <b>theirs</b> to ' +
    '<b>zero</b> and you win. Let yours hit zero and I am telling the whole każin.',
  setup(){
    const P = mine(), O = them();
    P.hand = []; P.mz = new Array(K.ZONES).fill(null); P.sz = new Array(K.ZONES).fill(null);
    O.mz = new Array(K.ZONES).fill(null); O.sz = new Array(K.ZONES).fill(null);
    P.lp = K.LP_START; O.lp = K.LP_START;
    K.D.turn = 0; K.D.phase = 'main';
  },
  hl:() => ['#me-lp', '#ai-lp']
},

/* 2 ────────────────────────────────────────────────────────── the table */
{
  t:'Il-mejda — the table, and where cards live',
  info:true,
  say:() =>
    NB(K.ZONES) + ' <b>monster zones</b> and ' + NB(K.ZONES) + ' <b>spell/trap zones</b> each side — the ' +
    'two rows nearest you are yours. Your cards live in three places: the <b>deck</b> you draw from, the ' +
    '<b>hand</b> at the bottom that only you can see, and the <b>graveyard</b>. The badges by your name ' +
    'count all three.',
  hl:() => ['#me-mz', '#me-st', '#ai-mz', '#ai-st', '#me-info .badge']
},

/* 3 ──────────────────────────────────────────────────── a turn, in order */
{
  t:'Id-dawra — what happens in a turn',
  info:true,
  say:() =>
    'Every turn is the same four things, in order — the strip in the middle tells you where you are. ' +
    'Two rules everybody gets wrong: <b>one normal summon a turn</b>, and whoever goes <b>first gets no ' +
    'battle phase on turn one</b>. Otherwise going first would just be free damage and nobody would ever ' +
    'want to go second.',
  extra:() => '<div class="tut-trrow">' +
    ['<b>1 DRAW</b> take a card', '<b>2 MAIN</b> summon · set · cast',
     '<b>3 BATTLE</b> swing', '<b>4 END</b> their go']
      .map(x => '<span class="tut-tr">' + x + '</span>').join('') + '</div>',
  hl:() => ['#phase-lbl', '#actbar']
},

/* 4 ────────────────────────────────────────────────── the normal summon */
{
  t:'Is-sejħa — put a monster on the table',
  say:() =>
    'In your hand: ' + NM(CAST.hero) + ' — Level ' + LV(CAST.hero) + ', ' + AT(CAST.hero) + '/' +
    DF(CAST.hero) + '. Up to <b>Level ' + CAST.freeCap + '</b> walks on for nothing. Tap the card, ' +
    '<b>Summon face-up (ATK)</b>, then tap an empty monster zone. One summon a turn. One. Not ' +
    '“just one more, ħi”.',
  extra: tributeHTML,
  ok:() => 'Ara. Level ' + CAST.freeCap + ' and under costs you nothing but your one summon for the turn.',
  setup(){
    const P = mine();
    P.normalSummoned = false;
    P.mz = new Array(K.ZONES).fill(null);
    P.sz = new Array(K.ZONES).fill(null);
    P.hand = [CAST.hero.id];
    K.D.turn = 0; K.D.phase = 'main';
  },
  check(){
    const m = monsters(0)[0];
    if (!m) return false;
    if (m.fd || m.pos !== 'atk'){                 /* forgiving — they set it instead */
      m.fd = false; m.pos = 'atk';
      K.renderDuel();
      K.toast('Face-UP, in attack. We do the hiding in a minute.');
    }
    return true;
  },
  hl:() => HAND_HL
},

/* 5 ─────────────────────────────────── attack vs defence, and face-down */
{
  t:'Difiża — attack position, defence position, face-down',
  say:() =>
    'Two ways to stand. <b>ATTACK</b> — upright, can swing, its <b>ATK</b> counts. <b>DEFENCE</b> — ' +
    'lying down, cannot swing, its <b>DEF</b> counts instead. ' + NM(CAST.wall) + ' is ' + AT(CAST.wall) +
    '/' + DF(CAST.wall) + ', so standing it up would be daft. Tap it, <b>Set face-down (DEF)</b> — and ' +
    'now they cannot see what it is either.',
  extra:() => facts([{ c:CAST.hero, tag:'yours, attacking' }, { c:CAST.wall, tag:'set this one down' }]),
  ok:() => 'Lying there quietly, like your uncle at a wedding. They have no idea what it is.',
  setup(){
    const P = mine();
    P.normalSummoned = false;
    if (!monsters(0).length) setField(0, [{ cid:CAST.hero.id }]);
    P.hand = [CAST.wall.id];
    K.D.turn = 0; K.D.phase = 'main';
    if (K.freeZone(0, 'm') < 0) P.mz[K.ZONES - 1] = null;
  },
  check(){
    if (monsters(0).some(m => m.fd)) return true;
    const at = mine().mz.findIndex(m => m && m.cid === CAST.wall.id && !m.fd);
    if (at >= 0){                                 /* summoned it face-up — give it back */
      mine().mz[at] = null;
      mine().hand.push(CAST.wall.id);
      mine().normalSummoned = false;
      K.renderDuel();
      return 'Face-DOWN this time — the second option on the sheet.';
    }
    return false;
  },
  hl:() => HAND_HL
},

/* 6 ────────────────────────────────────────────────────────── tributes */
{
  t:'It-tributi — the big ones cost you bodies',
  say:() =>
    'Nothing good is free. ' + NM(CAST.big) + ' is <b>Level ' + CAST.big.lvl + '</b>, hits for ' +
    AT(CAST.big) + ', and costs <b>' + CAST.bigCost + ' tribute' + (CAST.bigCost > 1 ? 's' : '') +
    '</b> — and a tribute is <b>your own monster</b>, straight into your graveyard. Tap it, ' +
    '<b>Summon face-up</b>, tap ' + NB(CAST.bigCost) + ' of yours to feed it, then pick a zone.',
  extra: tributeHTML,
  ok:() => CAST.bigCost + ' gone, ' + esc(CAST.big.n) + ' standing. Now count the graveyard badge — that ' +
           'is where they went, and they are not coming back on their own.',
  delay:1300,
  setup(){
    const P = mine();
    P.normalSummoned = false;      /* the coach is letting you go twice. Say nothing. */
    P.hand = [CAST.big.id];
    setField(0, CAST.fodder.map(id => ({ cid:id })));
    K.D.turn = 0; K.D.phase = 'main';
    K.toast('I am letting you summon twice this turn. Do not tell the committee.');
  },
  check(){
    if (monsters(0).some(m => m.cid === CAST.big.id)) return true;
    if (monsters(0).length < CAST.bigCost)
      return 'You need ' + CAST.bigCost + ' of your own on the table before it comes anywhere.';
    return false;
  },
  hl:() => HAND_HL
},

/* 7 ──────────────────────────────────────────────────────────── spells */
{
  t:'Is-seħer — a spell fires now',
  say:() =>
    'A spell fires <b>out of your hand, on your turn</b>, does the job and drops into the ' +
    '<b>graveyard</b> immediately. No waiting. ' + NM(CAST.spell) + ' — “' + esc(effOf(CAST.spell)) +
    '”. Tap it, press <b>Activate</b>, and watch the hand and graveyard badges move.',
  extra:() => facts([{ c:CAST.spell, tag:'fires the moment you play it' }]),
  ok:() => 'Cards in hand, spell in the graveyard, and it is not even six in the morning.',
  setup(){
    const P = mine();
    P.hand = CAST.spell ? [CAST.spell.id] : [];
    if (P.deck.length < 6) P.deck = filler(20, [CAST.hero.id, CAST.wall.id, CAST.small.id]);
    K.D.turn = 0; K.D.phase = 'main';
  },
  check(){
    if (!CAST.spell) return true;
    if (mine().grave.indexOf(CAST.spell.id) >= 0) return true;
    const z = mine().sz.findIndex(s => s && s.cid === CAST.spell.id);
    if (z >= 0){                                  /* they set it — hand it back */
      mine().sz[z] = null;
      mine().hand.push(CAST.spell.id);
      K.renderDuel();
      return 'Not set — ACTIVATE it. A spell goes off there and then.';
    }
    return false;
  },
  hl:() => HAND_HL
},

/* 8 ───────────────────────────────────────────────────────────── traps */
{
  t:'In-nasba — a trap waits',
  say:() =>
    'A trap is the opposite animal: it does <b>nothing</b> from your hand. You <b>set</b> it face-down ' +
    'and it sulks there until the <b>opponent’s next turn</b> — set one and walk into it yourself the ' +
    'same turn and nothing happens, exactly like your father in 1994. Tap ' + NM(CAST.trap) + ' and ' +
    '<b>set</b> it.',
  extra:() => facts([{ c:CAST.trap, tag:'arms on THEIR next turn' }]),
  ok:() => 'Set. Now leave it alone. It wakes up on their turn, not a second before.',
  setup(){
    const P = mine();
    P.hand = CAST.trap ? [CAST.trap.id] : [];
    P.sz = new Array(K.ZONES).fill(null);
    setField(0, [{ cid:CAST.small.id }]);
    P.normalSummoned = true;
    K.D.turn = 0; K.D.phase = 'main';
  },
  check(){
    if (!CAST.trap) return true;
    return mine().sz.some(s => s && s.card.t === 'trap');
  },
  hl:() => HAND_HL
},

/* 9 ─────────────────────── end the turn — and watch the trap earn its keep */
{
  t:'Tmiem id-dawra — end turn, and watch',
  say:() =>
    'Press <b>End turn</b>. The pupazz will drop ' + NM(CAST.foeMid) + ' (' + AT(CAST.foeMid) +
    ') and swing at your ' + NM(CAST.small) + ' (' + AT(CAST.small) + ') — on paper that costs you ' +
    NB(Math.max(0, CAST.foeMid.atk - CAST.small.atk)) + '. But your trap was set <b>last</b> turn, so it ' +
    'is armed <b>now</b>. Sit on your hands and watch.',
  ok:() => trapFired
    ? esc(trapFired) + ' went off. Set a turn early, fires on their turn — that is the whole point of a ' +
      'trap, and why setting one and walking into it yourself does nothing.'
    : 'Their turn is done. Traps only arm from their turn onwards — remember that when you set one.',
  delay:1400,
  setup(){
    const P = mine();
    ctx.t0 = K.D.turnCount;
    ctx.foeAttacks = true;
    trapFired = '';
    if (!monsters(0).length) setField(0, [{ cid:CAST.small.id }]);
    if (CAST.trap && !P.sz.some(s => s && s.card.t === 'trap')){
      const z = Math.max(0, K.freeZone(0, 's'));
      P.sz[z] = { uid:++tuid, cid:CAST.trap.id, card:CAST.trap, setTurn:K.D.turnCount - 1, fd:true };
    }
    P.sz.forEach(s => { if (s) s.setTurn = Math.min(s.setTurn, K.D.turnCount); });
    P.hand = [];
    K.D.turn = 0; K.D.phase = 'main'; K.D.over = false;
  },
  check(){ return !foeBusy && K.D.turn === 0 && K.D.turnCount > ctx.t0; },
  hl:() => K.D.turn === 0 && !foeBusy ? ['#actbar .btn.ghost'] : []
},

/* 10 ──────────────────────────────────────── flip it, or turn it round */
{
  t:'Iddur — flip it, or turn it round',
  say:() =>
    'New turn, so that face-down can finally move. Tap it, choose <b>Flip face-up (ATK)</b>. The same ' +
    'tap swaps any monster between <b>ATTACK</b> and <b>DEFENCE</b> — allowed on any turn <b>except</b> ' +
    'the one it arrived on, and never after it has swung.',
  ok:() => 'Up it comes, chest out. Now everybody can see it — and everybody can hit it.',
  setup(){
    const P = mine();
    ensureBattleTurn();
    let z = P.mz.findIndex(m => m && m.fd);
    if (z < 0){
      z = K.freeZone(0, 'm');
      if (z < 0) z = 0;
      P.mz[z] = mkInst(CAST.wall.id, 'def', true, K.D.turnCount - 1);
    } else P.mz[z].sumTurn = K.D.turnCount - 1;
    P.mz[z].atkCount = 0;
    ctx.flipZone = z;
    P.hand = [];
    P.normalSummoned = true;
    K.D.turn = 0; K.D.phase = 'main'; K.D.over = false;
    K.resetUI();
  },
  check(){
    const m = mine().mz[ctx.flipZone];
    return !!m && !m.fd;
  },
  hl:() => ['.zone[data-side="0"][data-kind="m"][data-i="' + ctx.flipZone + '"]']
},

/* 11 ─────────────────────────────────────────── battle: you are bigger */
{
  t:'Il-battalja — the bigger ATK wins',
  say:() =>
    '<b>To battle</b>, tap your ' + NM(CAST.hero) + ', then tap their ' + NM(CAST.foeMid) + '. ' +
    AT(CAST.hero) + ' against ' + AT(CAST.foeMid) + ': theirs dies, and the <b>difference</b> — ' +
    CAST.hero.atk + ' − ' + CAST.foeMid.atk + ' = ' + NB(CAST.hero.atk - CAST.foeMid.atk) + ' — comes ' +
    'off <b>their</b> life points. That is the whole game, over and over, until somebody cries.',
  extra:() => facts([{ c:CAST.hero, tag:'yours' }, { c:CAST.foeMid, tag:'theirs' }]),
  ok:() => 'Dead, and ' + (CAST.hero.atk - CAST.foeMid.atk) + ' off the top. Bravu.',
  delay:1400,
  setup(){ battleSetup([{ cid:CAST.hero.id }], [{ cid:CAST.foeMid.id }], 'main'); },
  check(){ return them().lp < ctx.foeLp; },
  hl:() => battleHl(0)
},

/* 12 ────────────────────────────────────────── battle: you are smaller */
{
  t:'Meta titlef — attacking upwards hurts YOU',
  say:() =>
    'Now the other way round, once, so it stings. Your ' + NM(CAST.small) + ' has ' + AT(CAST.small) +
    '. Theirs has ' + AT(CAST.foeMid) + '. Swing anyway and <b>yours</b> dies and the difference — ' +
    CAST.foeMid.atk + ' − ' + CAST.small.atk + ' = ' + NB(CAST.foeMid.atk - CAST.small.atk) + ' — comes ' +
    'off <b>your</b> life points. Go on. Do it.',
  extra:() => facts([{ c:CAST.small, tag:'yours — too small' }, { c:CAST.foeMid, tag:'theirs' }]),
  ok:() => 'That is what that feels like. ' + (CAST.foeMid.atk - CAST.small.atk) + ' of your own life ' +
           'points, for nothing. Count the two numbers BEFORE you swing, next time.',
  delay:1400,
  setup(){ battleSetup([{ cid:CAST.small.id }], [{ cid:CAST.foeMid.id }], 'battle'); },
  check(){ return mine().lp < ctx.myLp; },
  hl:() => battleHl(0)
},

/* 13 ──────────────────────────────────────────────── battle: defence */
{
  t:'Kontra d-difiża — beat a wall, take nothing',
  say:() =>
    'Theirs is lying down in <b>DEFENCE</b>, so your ATK is measured against its <b>DEF</b> — ' +
    DF(CAST.foeWall) + ' — not its attack. Your ' + AT(CAST.hero) + ' breaks it and it dies, but ' +
    '<b>nobody loses a life point</b>: beating a defence never does damage. Only <b>pierce</b> pushes ' +
    'the extra through, and yours has not got it. Hit it anyway.',
  extra:() => facts([{ c:CAST.hero, tag:'yours, attacking' }, { c:CAST.foeWall, tag:'theirs, in DEFENCE' }]),
  ok:() => 'Dead, and not one life point moved on either side. Boring. That is the rule.',
  delay:1400,
  setup(){ battleSetup([{ cid:CAST.hero.id }], [{ cid:CAST.foeWall.id, pos:'def' }], 'battle'); },
  check(){ return monsters(1).length === 0; },
  hl:() => battleHl(0)
},

/* 14 ────────────────────────────────────────────────── direct attack */
{
  t:'Daqqa diretta — straight at their life points',
  say:() =>
    'Their side is empty, so nothing is in the way. With <b>no monsters</b> to stop it, yours walks past ' +
    'and hits <b>them</b> for its <b>full ATK</b> — ' + AT(CAST.hero) + ', no subtraction. That is how ' +
    'people lose in two turns. Tap your monster, then <b>Attack directly</b>.',
  ok:() => CAST.hero.atk + ' off the top, and no monster to blame it on.',
  delay:1400,
  setup(){ battleSetup([{ cid:CAST.hero.id }], [], 'battle'); },
  check(){ return them().lp < ctx.foeLp; },
  hl:() => battleHl(0)
},

/* 15 ───────────────────────────────────────────── the ring & the bonus */
{
  t:'Iċ-ċirku — the free bonus most people never notice',
  say:() =>
    'Last one, then I am going for a coffee. Every side <b>beats</b> one and <b>loses</b> to one — hit ' +
    'a side you beat and you swing at <b>+' + CAST.bonus + ' ATK</b>, free. Your ' + AT(CAST.ringMe) +
    ' against their ' + AT(CAST.ringFoe) + ': you are ' + NB(CAST.ringFoe.atk - CAST.ringMe.atk) +
    ' down and on paper you lose. Attack anyway.',
  extra:() => ringHTML([CAST.attr, CAST.beats].filter(Boolean)),
  ok:() => '+' + CAST.bonus + ' out of nowhere: ' + (CAST.ringMe.atk + CAST.bonus) + ' against ' +
           CAST.ringFoe.atk + ', and they pay the ' +
           (CAST.ringMe.atk + CAST.bonus - CAST.ringFoe.atk) + ' difference. Check the colours before you ' +
           'swing and half your battles are already won.',
  delay:1600,
  setup(){ battleSetup([{ cid:CAST.ringMe.id }], [{ cid:CAST.ringFoe.id }], 'battle'); },
  check(){
    if (them().lp < ctx.foeLp) return true;
    if (mine().lp < ctx.myLp || monsters(0).length === 0){   /* lost it somehow — rack them up again */
      battleSetup([{ cid:CAST.ringMe.id }], [{ cid:CAST.ringFoe.id }], 'battle');
      K.renderDuel();
      return 'Again — the +' + CAST.bonus + ' does the work for you. Just swing.';
    }
    return false;
  },
  hl:() => battleHl(0)
},

/* 16 ────────────────────────────────────────────────────── finish them */
{
  t:'Aqtagħhielhom — finish the job',
  say:() =>
    'They are on ' + NB(them() ? them().lp : CAST.hero.atk) + ' and nothing is standing in front of you. ' +
    'Your ' + NM(CAST.hero) + ' hits for ' + AT(CAST.hero) + '. You know exactly what to do. Tap it, ' +
    '<b>Attack directly</b>, and let us both go home.',
  delay:600,
  setup(){
    battleSetup([{ cid:CAST.hero.id }], [], 'battle');
    them().lp = Math.max(1, CAST.hero.atk);       /* exactly lethal — computed, never typed */
    ctx.foeLp = them().lp;
  },
  check(){ return !!K.D.over; },
  hl:() => battleHl(0)
}
];

/* ═══════════════════════════════════════════════════════════════════
   5 — THE COACH PANEL
   Pinned to the top so it never fights the hand, the action bar or the
   card sheet that slides up from the bottom.
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS(){
  if ($('#tut-css')) return;
  const st = document.createElement('style');
  st.id = 'tut-css';
  st.textContent = [
'body.tut-on #scr-duel{padding-top:calc(var(--sat) + var(--tut-h,150px) + 2px);padding-bottom:calc(var(--sab) + 2px)}',
/* the coach needs a strip of the screen, so the board gives a little back */
'body.tut-on .duel{--fw:min(56px,calc((100vw - 44px)/5));gap:2px}',
'body.tut-on .duel .mid{min-height:32px;padding:1px 2px}',
'body.tut-on .duel .hand{min-height:0;padding:5px 2px 6px}',
'body.tut-on .duel .hand .card{--cw:60px}',
'body.tut-on .duel .actbar .btn{min-height:44px}',
'body.tut-on .duel .pinfo{padding:1px 4px}',
'.tut-wrap{position:fixed;left:0;right:0;top:0;z-index:210;pointer-events:none;',
'  padding:calc(var(--sat) + 6px) calc(var(--sar) + 8px) 0 calc(var(--sal) + 8px)}',
'.tut-panel{pointer-events:auto;max-width:460px;margin:0 auto;border-radius:15px;',
'  background:linear-gradient(180deg,#2C2050,#160F28);border:1px solid var(--line2);',
'  border-left:4px solid var(--gold);box-shadow:0 16px 38px rgba(0,0,0,.65);',
'  display:flex;flex-direction:column;overflow:hidden;max-height:268px}',
'.tut-head{flex:0 0 auto;padding:9px 11px 0}',
'.tut-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 11px}',
'.tut-foot{flex:0 0 auto;padding:0 11px 9px;position:relative}',
'.tut-panel.scrolls .tut-foot::before{content:"";position:absolute;left:0;right:0;top:-15px;height:15px;',
'  pointer-events:none;background:linear-gradient(180deg,rgba(23,16,44,0),#1A1130)}',
'.tut-top{display:flex;align-items:center;gap:7px}',
'.tut-face{font-size:19px;line-height:1;flex:0 0 auto}',
'.tut-who{font-family:var(--disp);font-weight:900;font-size:9.5px;letter-spacing:.1em;color:var(--gold);',
'  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.tut-count{margin-left:auto;font-family:var(--disp);font-weight:900;font-size:9px;letter-spacing:.06em;',
'  color:var(--dim);background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:99px;',
'  padding:3px 8px;white-space:nowrap}',
'.tut-skip{flex:0 0 auto;background:none;border:1px solid var(--line2);color:var(--dim);border-radius:99px;',
'  font-size:10px;font-weight:700;padding:0 10px;min-height:30px;font-family:var(--body);cursor:pointer}',
'.tut-skip:active{background:rgba(255,255,255,.08)}',
'.tut-prog{height:4px;border-radius:99px;background:#2A1F42;overflow:hidden;margin:7px 0;',
'  border:1px solid var(--line)}',
'.tut-prog>i{display:block;height:100%;transform-origin:left;transition:transform .32s var(--ease);',
'  background:linear-gradient(90deg,var(--gold),var(--hot))}',
'.tut-title{font-family:var(--disp);font-weight:900;font-size:10.5px;letter-spacing:.07em;color:#FFF3CF;',
'  margin:0 0 4px;text-transform:uppercase}',
'.tut-say{font-size:12.5px;line-height:1.42;color:#E9E1FF;margin:0}',
'.tut-say b{color:var(--gold);font-weight:800}',
'.tut-say.good{color:#7EE0A0}',
'.tut-say.good b{color:#B6F2CB}',
'.tut-nudge{font-size:11.5px;line-height:1.4;color:var(--gold);margin:6px 0 0}',
'.tut-acts{display:flex;gap:7px;margin-top:8px}',
'.tut-acts .btn{flex:1;min-height:40px;font-size:11.5px}',
'.tut-wait{font-size:9.5px;letter-spacing:.09em;font-family:var(--disp);font-weight:900;color:var(--dim2);',
'  margin:8px 0 0;display:flex;align-items:center;gap:6px}',
'.tut-body::-webkit-scrollbar{width:4px}',
'.tut-body::-webkit-scrollbar-thumb{background:var(--line2);border-radius:4px}',
'.tut-wait i{width:7px;height:7px;border-radius:99px;background:var(--gold);display:block;flex:0 0 auto;',
'  animation:tutBlink 1.1s ease-in-out infinite}',
'@keyframes tutBlink{0%,100%{opacity:.25}50%{opacity:1}}',
'.tut-ring{display:flex;flex-wrap:wrap;align-items:center;gap:3px;margin-top:8px}',
'.tut-node{font-family:var(--disp);font-weight:900;font-size:8.5px;letter-spacing:.03em;padding:3px 6px;',
'  border-radius:99px;border:1px solid var(--nc);color:var(--nc);background:rgba(255,255,255,.04);',
'  white-space:nowrap}',
'.tut-node.on{background:var(--nc);color:#0B0812;box-shadow:0 0 12px var(--nc)}',
'.tut-arw{color:var(--dim2);font-size:12px;font-weight:900;line-height:1}',
'.tut-note{font-size:10.5px;line-height:1.45;color:var(--dim);margin:6px 0 0}',
'.tut-note b{color:var(--gold)}',
'.tut-trrow{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}',
'.tut-tr{font-size:10px;color:var(--dim);background:rgba(255,255,255,.05);border:1px solid var(--line);',
'  border-radius:8px;padding:3px 7px;white-space:nowrap}',
'.tut-tr b{color:#FFF3CF;font-family:var(--disp);font-size:9px;letter-spacing:.04em}',
/* live stat chips — read off the card data, so they can never go stale */
'.tut-facts{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}',
'.tut-fact{display:flex;align-items:center;flex-wrap:wrap;gap:4px;font-size:9.5px;color:var(--dim);',
'  background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:9px;padding:3px 7px}',
'.tut-fact b{color:#FFF3CF;font-size:10px}',
'.tut-fact i{font-style:normal;font-family:var(--disp);font-weight:900;font-size:8.5px;letter-spacing:.04em;',
'  color:var(--gold);background:rgba(255,197,66,.10);border-radius:5px;padding:1px 4px}',
'.tut-fact u{text-decoration:none;color:var(--dim2);font-size:9px}',
'.tut-hl{position:relative;z-index:9;outline:3px solid var(--gold);outline-offset:2px;border-radius:9px;',
'  animation:tutPulse 1.15s ease-in-out infinite}',
'@keyframes tutPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,197,66,.6)}50%{box-shadow:0 0 0 9px rgba(255,197,66,0)}}',
'@media (prefers-reduced-motion:reduce){',
'  .tut-hl{animation:none;box-shadow:0 0 0 4px rgba(255,197,66,.4)}',
'  .tut-wait i{animation:none}}',
'.tut-hero{text-align:center;padding:6px 0 10px}',
'.tut-hero .f{font-size:46px;line-height:1}',
'.tut-hero h3{font-size:17px;margin:6px 0 2px}',
'.tut-hero .s{font-family:var(--disp);font-weight:900;font-size:10px;letter-spacing:.14em;color:var(--gold)}',
'.tut-list{display:grid;gap:6px;margin:10px 0 14px;padding:0}',
'.tut-list li{list-style:none;font-size:12.5px;color:var(--dim);line-height:1.4;background:var(--panel);',
'  border:1px solid var(--line);border-radius:11px;padding:8px 10px}',
'.tut-list li b{color:var(--txt)}',
/* the coach and the ring are icons now, not emoji — give them a little air */
'.tut-node .ico{font-size:1.45em;vertical-align:-.26em;margin-right:1px}',
'.tut-arw .ico{font-size:12px;vertical-align:-.18em}',
'.tut-skip .ico{font-size:1.15em;vertical-align:-.18em;margin-left:2px}',
'.tut-nudge .ico,.tut-say .ico{font-size:1.15em;vertical-align:-.18em}',
'.tut-hero .f .ico,.tut-face .ico{color:var(--gold)}'
  ].join('\n');
  document.head.appendChild(st);
}

const val = (x, fb) => { try { return typeof x === 'function' ? x() : x; } catch(e){ console.warn('[tutor]', e); return fb || ''; } };

function mountPanel(){
  let w = $('#tut-wrap');
  if (!w){
    w = document.createElement('div');
    w.id = 'tut-wrap';
    w.className = 'tut-wrap';
    w.setAttribute('role', 'region');
    w.setAttribute('aria-label', 'Tutorial coach');
    document.body.appendChild(w);
  }
  w.style.display = '';
  return w;
}
function unmountPanel(){
  const w = $('#tut-wrap');
  if (w) w.remove();
  document.body.style.removeProperty('--tut-h');
}
function renderPanel(){
  const w = mountPanel();
  const s = STEPS[si];
  /* head and foot stay put; only the coach's mouth scrolls */
  w.innerHTML =
    '<div class="tut-panel">' +
      '<div class="tut-head">' +
        '<div class="tut-top">' +
          '<span class="tut-face" aria-hidden="true">' + ico(COACH.i) + '</span>' +
          '<span class="tut-who">' + esc(COACH.n) + '</span>' +
          '<span class="tut-count" id="tut-count">STEP ' + (si + 1) + ' / ' + STEPS.length + '</span>' +
          '<button class="tut-skip" id="tut-skip" type="button">Skip ' + ico('close') + '</button>' +
        '</div>' +
        '<div class="tut-prog"><i style="transform:scaleX(' +
          ((si + 1) / STEPS.length).toFixed(3) + ')"></i></div>' +
        '<p class="tut-title">' + esc(val(s.t)) + '</p>' +
      '</div>' +
      '<div class="tut-body">' +
        '<p class="tut-say" id="tut-say" role="status">' + val(s.say) + '</p>' +
        '<div id="tut-extra">' + (s.extra ? val(s.extra) : '') + '</div>' +
        '<p class="tut-nudge" id="tut-nudge" hidden></p>' +
      '</div>' +
      '<div class="tut-foot">' +
        (s.info
          ? '<div class="tut-acts"><button class="btn primary" id="tut-next" type="button">Ejja ›</button></div>'
          : '<p class="tut-wait"><i></i>YOUR MOVE — DO IT ON THE BOARD</p>') +
      '</div>' +
    '</div>';
  const sk = $('#tut-skip');
  if (sk) sk.onclick = skip;
  const nx = $('#tut-next');
  if (nx) nx.onclick = () => advance(true);
  measure();
}
/* The board, the hand and the action bar get their space first — whatever is
   left over is what the coach is allowed, and he scrolls inside it. Anything
   fixed here clipped the hand off the bottom of a 390x844 phone. */
function measure(){
  const set = () => {
    const el = $('#tut-wrap .tut-panel');
    if (!el) return;
    const duel = $('#duel-root');
    let cap = 268;
    if (duel && duel.children.length){
      /* .mid is the one flexible row — it soaks up whatever is left, so asking
         for its current height would just feed our own padding back to us. */
      let need = 0;
      Array.from(duel.children).forEach(c => {
        need += c.classList.contains('mid') ? 34 : c.offsetHeight;
      });
      need += 3 * (duel.children.length - 1);            /* .duel gap */
      cap = Math.max(96, Math.min(268, window.innerHeight - need - 18));
    }
    el.style.maxHeight = cap + 'px';
    /* the bottom fade is a "there is more below" hint — never let it dim a
       paragraph that already fits, which is how the last line looked cut off */
    const body = $('#tut-wrap .tut-body');
    if (body) el.classList.toggle('scrolls', body.scrollHeight > body.clientHeight + 2);
    document.body.style.setProperty('--tut-h', (el.offsetHeight + 8) + 'px');
  };
  set();
  requestAnimationFrame(set);
}
function coachSay(msg, good){
  const el = $('#tut-say');
  if (!el) return;
  el.innerHTML = (good ? ico('check', 'Done') + ' ' : '') + msg;
  el.classList.toggle('good', !!good);
  const ex = $('#tut-extra'); if (ex && good) ex.innerHTML = '';
  const nd = $('#tut-nudge'); if (nd){ nd.hidden = true; nd.textContent = ''; }
  measure();
}
function nudge(msg){
  if (!msg) return;
  const now = Date.now();
  if (msg === nudgeMsg && now - nudgeAt < 7000) return;
  nudgeMsg = msg; nudgeAt = now;
  const nd = $('#tut-nudge');
  if (nd){ nd.innerHTML = ico('arrow-right') + ' ' + esc(msg); nd.hidden = false; measure(); }
  K.toast(msg);
}

/* ── highlights: the duel UI repaints constantly, so re-apply every tick ── */
function wanted(){
  const s = STEPS[si];
  if (!s || !s.hl) return [];
  let sel = [];
  try { sel = s.hl() || []; } catch(e){ sel = []; }
  const out = [];
  sel.forEach(x => {
    if (!x) return;
    if (typeof x === 'string') $$(x).forEach(e => out.push(e));
    else out.push(x);
  });
  return out;
}
function applyHl(){
  const want = wanted();
  $$('.tut-hl').forEach(e => { if (want.indexOf(e) < 0) e.classList.remove('tut-hl'); });
  want.forEach(e => e.classList.add('tut-hl'));
}
function clearHl(){ $$('.tut-hl').forEach(e => e.classList.remove('tut-hl')); }

/* ═══════════════════════════════════════════════════════════════════
   6 — RUNNER
   ═══════════════════════════════════════════════════════════════════ */
function startPoll(){ stopPoll(); timer = setInterval(tick, 150); }
function stopPoll(){ if (timer){ clearInterval(timer); timer = null; } }

function tick(){
  if (!live || !K.D) return;
  /* Wandered off the duel screen (back button, forfeit, a stray K.go) — the
     tutorial must not keep the seeded RNG once it is no longer on screen. */
  const scr = $('#scr-duel');
  if (scr && !scr.classList.contains('on') && !$('#modal.on')){
    bail('Tutorial closed.');
    return;
  }
  applyHl();
  const s = STEPS[si];
  if (!s || s.info) return;
  let r = false;
  try { r = s.check(); } catch(e){ r = false; }
  if (r === true) advance();
  else if (typeof r === 'string') nudge(r);
}

function advance(fromButton){
  if (!live) return;
  const s = STEPS[si];
  stopPoll();
  clearHl();
  if (s.ok && !fromButton) coachSay(val(s.ok), true);
  const w = fromButton ? 0 : slow(s.delay || 950);
  const at = si;
  setTimeout(() => { if (live && si === at) goStep(at + 1); }, w);
}

function goStep(i){
  if (!live) return;
  if (i >= STEPS.length){ finishScreen(); return; }
  si = i;
  nudgeMsg = ''; nudgeAt = 0;
  ctx.foeAttacks = false;
  const s = STEPS[si];
  clearHl();
  try { if (s.setup) s.setup(); } catch(e){ console.warn('[tutor] setup', e); }
  if (K.D) K.renderDuel();
  renderPanel();
  applyHl();
  startPoll();
}

/* ── the pupazz takes its (entirely scripted) turn ──
      Everything it does is written here, so with the seeded RNG the opponent
      plays the identical cards in the identical order on every single run. */
async function foeTurn(){
  if (!live || !K.D) return;
  foeBusy = true;
  const wantAttack = !!ctx.foeAttacks;
  K.renderDuel();
  await pause(650);
  try {
    if (!live || !K.D || K.D.over) return;
    const O = K.D.p[1];
    if (!O.mz.some(Boolean) && CAST){
      O.hand = [CAST.foeMid.id];
      const z = Math.max(0, K.freeZone(1, 'm'));
      K.summon(1, 0, z, 'atk', false, []);
      K.renderDuel();
      await pause(800);
    }
    if (!live || !K.D || K.D.over) return;
    if (wantAttack && !K.noBattleYet()){
      K.D.phase = 'battle';
      const zi = K.D.p[1].mz.findIndex(Boolean);
      if (zi >= 0 && K.canAttack(1, zi)){
        const t = K.legalAttackTargets(1, zi);
        if (t.length){
          K.dlog(FOE_NAME + ' swings.');
          K.doAttack(1, zi, t[0]);
          K.renderDuel();
          await pause(900);
        }
      }
    }
    if (!live || !K.D || K.D.over) return;
    K.dlog(FOE_NAME + ' has nothing else to give. It is a dummy.');
    K.endTurn();
  } catch(e){
    console.warn('[tutor] foeTurn', e);
  } finally {
    foeBusy = false;
    if (live && K.D){
      if (K.UI) K.UI.busy = false;
      K.resetUI();
      K.renderDuel();
    }
  }
}

/* ── duel event stream, so the coach can report what really happened ── */
function tutEvent(ev){
  if (!live) return;
  if (ev.type === 'trap') trapFired = ev.name || 'The trap';
}

/* ═══════════════════════════════════════════════════════════════════
   7 — FINISH · SKIP · CLEAN UP
   Every exit from here goes through rngRestore(). If you add another one,
   route it through teardown()/bail() or the whole game stays seeded.
   ═══════════════════════════════════════════════════════════════════ */
function teardown(){
  live = false;
  foeBusy = false;
  stopPoll();
  clearHl();
  unmountPanel();
  document.body.classList.remove('tut-on');
  window.KHOOK = null;
  K.D = null;
  ctx = {};
  rngRestore();
}
function done(){
  const fn = opts && opts.onDone;
  opts = {};
  if (typeof fn === 'function') fn();
  else K.go('home');
}

function finishScreen(){
  stopPoll(); clearHl();
  /* the lessons are over — hand the engine its normal randomness back now,
     not when the player eventually taps a button */
  rngRestore();
  const w = $('#tut-wrap'); if (w) w.style.display = 'none';
  if (K.S){ K.S.tutorDone = true; K.S.tutorSkipped = false; K.save(); }
  K.openModal(
    '<div class="result">' +
      '<div class="big win">MELA</div>' +
      '<p class="tiny">Tutorial finished</p>' +
    '</div>' +
    '<div style="display:flex;gap:9px;align-items:flex-start;margin-top:12px">' +
      '<span style="font-size:30px;line-height:1" aria-hidden="true">' + ico(COACH.i) + '</span>' +
      '<p class="blurb" style="margin:0">“That is the lot. Draw, summon one, set what you cannot afford ' +
      'to show, keep a trap waiting, count <b>both</b> numbers <b>before</b> you swing, and check the ' +
      'colours for that free bonus. You are still going to lose — but from now on you will know exactly ' +
      'why, and so will everybody else.”</p>' +
    '</div>' +
    '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px">' +
      '<span class="pill">' + ico('check') + STEPS.length + '/' + STEPS.length + ' steps</span>' +
      '<span class="pill">' + ico(COACH.i) + esc(COACH.n) + ' approves</span>' +
    '</div>' +
    '<div style="display:grid;gap:9px;margin-top:14px">' +
      '<button class="btn hot" id="tut-fin" type="button">Ejja, let me play</button>' +
      '<button class="btn ghost" id="tut-redo" type="button">' +
        ilb('refresh', 'Run it again') + '</button>' +
    '</div>');
  const f = $('#tut-fin');
  if (f) f.onclick = () => { K.closeModal(); teardown(); done(); };
  const r = $('#tut-redo');
  if (r) r.onclick = () => { const o = opts; K.closeModal(); teardown(); start(o); };
}

function skip(){
  if (!live) return;
  if (K.S){ K.S.tutorSkipped = true; K.save(); }
  K.toast('Fine. Learn it the hard way, like everybody else.');
  teardown();
  done();
}

/* something ended the duel that was not the last lesson — a forfeit, most likely */
function bail(why){
  if (!live) return;
  if (K.S){ K.S.tutorSkipped = true; K.save(); }
  K.toast(why || 'Tutorial closed.');
  teardown();
  done();
}

/* ═══════════════════════════════════════════════════════════════════
   8 — ENTRY POINTS
   ═══════════════════════════════════════════════════════════════════ */
function start(o){
  injectCSS();
  if (live) teardown();
  opts = o || {};
  K.closeSheet(); K.closeModal();

  live = true;
  si = 0; ctx = {}; foeBusy = false; trapFired = '';
  nudgeMsg = ''; nudgeAt = 0;
  document.body.classList.add('tut-on');

  /* SEED FIRST. startCustomDuel shuffles both decks and deals ten cards before
     we get a look in, and the engine keeps rolling for discards and effects
     all the way through — all of it has to land the same way every run. */
  rngSeed();

  let D = null;
  try {
    CAST = castCards();

    /* the local AI must never get a look-in — every one of its moves is scripted */
    window.KHOOK = {
      afterEndTurn(){ foeTurn(); return true; },
      result(){
        if (!live) return false;
        if (si < STEPS.length - 1) setTimeout(() => bail('That is one way to end a lesson.'), 30);
        return true;                              /* a tutorial pays nothing out */
      }
    };

    const SD = K.STARTER_DECKS || {};
    const myDeck  = SD[CAST.deckKey];
    const foeDeck = SD[CAST.foeKey] || myDeck;
    if (!myDeck) throw new Error('no starter deck to run the tutorial with');

    K.startCustomDuel({
      myList: myDeck.list,
      myName: (K.displayName() || 'YOU').toUpperCase(),
      myKey: CAST.deckKey,
      foe: { name:FOE_NAME, list:(foeDeck || myDeck).list, deckKey:CAST.foeKey, isAI:true },
      mode:'tutor', diff:'tourist',
      first:'Training. ' + COACH.n + ' is watching, and he has opinions.'
    });
    D = K.D;
    D.on = ev => { K.onDuelEvent(ev); tutEvent(ev); };

    /* wipe the dealt opening — every lesson needs a board we already know */
    D.p[0].hand = [];  D.p[0].grave = [];
    D.p[1].hand = [];  D.p[1].grave = [];
    D.p[0].mz = new Array(K.ZONES).fill(null); D.p[0].sz = new Array(K.ZONES).fill(null);
    D.p[1].mz = new Array(K.ZONES).fill(null); D.p[1].sz = new Array(K.ZONES).fill(null);
    D.p[0].deck = filler(30, [CAST.hero.id, CAST.wall.id, CAST.small.id,
                              CAST.spell && CAST.spell.id, CAST.trap && CAST.trap.id]);
    D.p[1].deck = filler(30, [CAST.foeMid.id, CAST.foeWall.id, CAST.ringFoe.id]);
    D.p[0].normalSummoned = false;
    D.p[0].noAttackTurn = -1; D.p[1].noAttackTurn = -1;
    D.turn = 0; D.phase = 'main'; D.turnCount = 1;

    mountPanel();
    goStep(0);
  } catch(e){
    /* never walk out of here holding the engine's RNG */
    console.error('[tutor] could not start', e);
    teardown();
    K.toast('The tutorial could not start. The cards may have moved under it.');
    throw e;
  }
  return D;
}

/* ── the landing screen (#scr-tutor) ── */
function open(){
  injectCSS();
  window.KHOOK = null;
  const host = $('#scr-tutor');
  if (!host) return;
  let preview = null;
  try { preview = castCards(); } catch(e){ preview = null; }
  const bonus = K.COUNTER_BONUS || 0;
  host.innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="tut-back" aria-label="Back to home">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>How To Play</h2>' +
      (isDone() ? '<span class="pill">' + ico('check') + 'done</span>'
                : '<span class="pill">' + STEPS.length + ' steps</span>') +
    '</div>' +
    '<div class="scroll">' +
      '<div class="tut-hero">' +
        '<div class="f" aria-hidden="true">' + ico(COACH.i) + '</div>' +
        '<div class="s">' + esc(COACH.n) + ' WILL SHOW YOU</div>' +
        '<h3>Nobody reads the rules</h3>' +
      '</div>' +
      '<p class="blurb">So you are not going to either. You get a <b>real board</b>, a <b>real opponent</b> ' +
      '(he is a dummy — do not feel clever) and <b>' + STEPS.length + ' jobs</b> to do with your own thumb. ' +
      'Same cards, same board, every single time, so you can run it twice and it will not have moved. ' +
      'Five minutes. Walk out whenever you like and Ziju Ċensu will judge you quietly.</p>' +
      '<ul class="tut-list">' +
        '<li><b>How you win</b> — ' + K.LP_START + ' life points each, take theirs to zero</li>' +
        '<li><b>The table and the turn</b> — ' + K.ZONES + ' monster zones, ' + K.ZONES +
          ' spell/trap zones, draw → main → battle → end</li>' +
        '<li><b>Summoning</b> — one a turn, free up to Level ' + freeLevelCap() +
          ', and what the heavy ones cost you in tributes</li>' +
        '<li><b>Attack, defence, face-down</b> — and when you are allowed to turn them round</li>' +
        '<li><b>The maths</b> — who dies, who pays, and why beating a defence costs them nothing</li>' +
        '<li><b>Spells vs traps</b> — one fires now, the other waits for their turn</li>' +
        '<li><b>The ring</b> — the free <b>+' + bonus + ' ATK</b> most people never notice</li>' +
      '</ul>' +
      ringHTML(preview ? [preview.attr, preview.beats].filter(Boolean) : null) +
      '<div style="display:grid;gap:9px;margin:16px 0 24px">' +
        '<button class="btn hot" id="tut-go" type="button">' +
          (isDone() ? ilb('refresh', 'Run it again') : ilb('play', 'Start the tutorial')) + '</button>' +
        '<button class="btn ghost" id="tut-home" type="button">Not now</button>' +
      '</div>' +
    '</div>';
  const b = $('#tut-back'), h = $('#tut-home'), g = $('#tut-go');
  if (b) b.onclick = () => K.go('home');
  if (h) h.onclick = () => K.go('home');
  if (g) g.onclick = () => start({});
  K.go('tutor');
}

const isDone = () => !!(K.S && K.S.tutorDone);
function reset(){
  if (K.S){ K.S.tutorDone = false; K.S.tutorSkipped = false; K.save(); }
  return true;
}

/* ── home-screen entry ──
   index.html already ships a #btn-tutor and game.js wires it to open(); this
   only fills the gap if that button is ever dropped, and never re-wires one
   that already has a handler. */
function wire(){
  injectCSS();
  const have = $('#btn-tutor');
  if (have){ if (!have.onclick) have.onclick = open; return; }
  const host = document.querySelector('#scr-home .navrow') || document.querySelector('#scr-home .menu');
  if (!host) return;
  const b = document.createElement('button');
  b.className = 'btn ghost sm';
  b.id = 'btn-tutor';
  b.type = 'button';
  b.innerHTML = ilb('book', 'How to play');
  b.onclick = open;
  host.appendChild(b);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
else wire();

/* last line of defence: if the tab goes away mid-lesson, give the RNG back */
window.addEventListener('pagehide', rngRestore);

window.KARTI_TUTOR = {
  start, open, isDone, reset,
  steps: STEPS.length,
  /* surface for the headless verification harness */
  _dbg: {
    get live(){ return live; },
    get step(){ return si; },
    get ctx(){ return ctx; },
    get cast(){ return CAST; },
    get rngHeld(){ return rngHeld; },
    get trapFired(){ return trapFired; },
    STEPS, castCards, ringChain, ringChains, tributeRows, goStep, skip, finishScreen,
    mulberry32, TUT_SEED
  }
};

})();
