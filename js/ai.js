/* ═══════════════════════════════════════════════════════════════════
   KARTI — ai.js
   The thinking opponent. Loads AFTER game.js and takes over from the
   simple fallback AI inside it (game.js calls KARTI_AI.step / .pickTrap
   when this file is present).

   It plays by exactly the same rules as you: same 40-card deck, one
   normal summon a turn, no peeking at your hand. What changes with
   difficulty is how well it *thinks*, never what it is allowed to do.

     tourist  — knows the rules, forgets them regularly
     regular  — plays properly, respects the counter ring
     nanna    — counts your set cards, holds her traps, and waits

   Everything is read through window.KARTI, so this file never touches
   engine internals directly.

   The summon evaluation (bodyWorth / boardTotal / bestSummon) is the part
   that has been measured hardest. It replaced a "net ATK, minus what the
   tributes were worth" formula that priced a body at max(ATK,DEF) plus a flat
   premium for having any effect at all. That formula charged a Level 8 the
   full retail price of two bodies it was about to eat, so it summoned them
   0.018 times per copy in a deck — effectively never. Scoring the BOARD AFTER
   the play instead, on one scale for every candidate, put that at 0.086 and
   won 53.2% against the old brain over 16,170 games.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
if (!K) return;

/* ───────────────────────── difficulty ───────────────────────── */
const LEVELS = {
  tourist: {
    key:'tourist', name:'Tourist', i:'diff-1',
    blurb:'Sunburnt and confident. Misplays about a third of the time.',
    slip:.35,            /* chance to take a deliberately worse line */
    counters:false,      /* does it plan around the attribute ring? */
    readFD:false,        /* does it assume a face-down might be big? */
    lethal:false,        /* does it count for game? */
    trapHold:0,          /* 0 = fires traps at anything */
    healAt:2200, removeAt:2400, tributeEdge:100
  },
  regular: {
    key:'regular', name:'Regular', i:'diff-2',
    blurb:'Plays the ring, trades properly, will punish a lazy attack.',
    slip:.06, counters:true, readFD:true, lethal:true,
    trapHold:1, healAt:3200, removeAt:1900, tributeEdge:350
  },
  nanna: {
    key:'nanna', name:'Nanna', i:'diff-3',
    blurb:'Counts your set cards, holds her slipper, and waits for the moment.',
    /* strictly better play than 'regular' — never misplays, times her traps
       better. Deliberately NOT more cautious: extra caution measured WORSE,
       because a trap you never spend is worth nothing. */
    slip:0, counters:true, readFD:true, lethal:true,
    trapHold:2, healAt:3800, removeAt:1700, tributeEdge:350
  }
};
const ALIAS = { easy:'tourist', normal:'regular', hard:'nanna', tourist:'tourist', regular:'regular', nanna:'nanna' };
/* D.diff sets the brain for the duel; D.diffs = [seat0, seat1] can give the two
   seats different brains (used to measure one level against another). */
function level(pi){
  const D = K.D;
  if (!D) return LEVELS.regular;
  const d = (pi != null && D.diffs && D.diffs[pi]) || D.diff || 'regular';
  return LEVELS[ALIAS[d] || d] || LEVELS.regular;
}
const slip = L => L.slip > 0 && Math.random() < L.slip;

/* ───────────────────────── board reading ───────────────────────── */
const mine = pi => K.fieldMonsters(pi);
const cardOf = id => K.cardById(id);

/* ───────────────────────── tunables ─────────────────────────
   Everything the summon evaluation is made of, in one place, so it can be swept
   headlessly instead of guessed at. Every number below was measured over
   ~7,000-game AI-vs-AI batches; the model is flat around them (moving any one
   knob to either extreme costs under half a point of win rate), so nothing here
   is knife-edge. What they collectively decide is whether a big tribute monster
   ever gets to see the table. */
const T = {
  outclassed: .55,   /* ATK a body is worth once it cannot beat their biggest */
  wallWorth:  .40,   /* DEF a body is worth as a blocker — it soaks one hit */
  extraBody:  .45,   /* a body they can still block is worth this much of itself */
  extraOpen:  .90,   /* a body they have no blocker left for swings for real */
  theirNext:  1,     /* they get a summon too — count one more blocker than they
                        have now, or a wide board looks better than it plays */
  punchFloor: 1500,  /* ...and assume that summon can hit for at least this */
  beats:      300,   /* it can actually take their biggest down */
  survives:   400,   /* nothing they have on the table kills it in a fight */
  surviveMul: .30,   /* ...and the bigger it is, the more that is worth per turn */
  taunt:      260,   /* taunt is worth more while they have a board */
  exposed:    .30,   /* per attacker my board can no longer block */
  setup:      320    /* a cheap body now unlocks the big one in hand next turn */
};

/* ── what an effect is worth ──
   Split in two, because the old single number was wrong in both directions.
   Most monster effects fire ONCE, when it lands: a Sunday Rabbit that already
   healed is a plain 1000 ATK body, so paying a premium to keep it is nonsense.
   The rest tick every turn and really are worth keeping. */
function fxKeep(m, atk){
  switch (m && m.card.fx){
    case 'taunt':  return 300;
    case 'shield': return m.shieldUsed ? 0 : 400;
    case 'double': return atk * .55;                 /* it swings twice a turn */
    case 'cleave': return atk * .30;                 /* twice, but only at monsters */
    case 'pierce': return 250;
    case 'leech':  return atk * .25;
    case 'grow':   return 350;
    case 'grow2':  return 500;
    case 'healall':return 400;
    case 'discard':return 350;
    case 'thorns': return 200;
    case 'boom':   return 100;
    case 'kamikaze': return -150;
    default: return 0;
  }
}
/* the one-off swing you get the moment it hits the table face-up */
function fxPlay(c, enemyCount){
  switch (c.fx){
    case 'heal':   return 300;
    case 'heal8':  return 450;
    case 'burn':   return 500;
    case 'snipe':  return enemyCount ? 500 : 0;
    case 'weaken': return Math.min(enemyCount, 2) * 250;
    case 'drain':  return enemyCount ? 300 : 0;
    case 'stun':   return enemyCount ? 400 : 0;
    case 'revive': return 350;
    case 'peek':   return 60;
    default: return 0;
  }
}

/* what a monster is worth to its owner, roughly, in ATK-equivalent points */
function value(m){
  if (!m) return 0;
  const c = m.card;
  let v = Math.max(K.effAtk(m), K.effDef(m));
  const fx = c.fx;
  if (fx === 'taunt') v += 500;
  if (fx === 'shield' && !m.shieldUsed) v += 500;
  if (fx === 'double' || fx === 'cleave') v += 450;
  if (fx === 'grow' || fx === 'grow2') v += 350;
  if (fx === 'healall' || fx === 'discard' || fx === 'leech') v += 400;
  if (fx === 'thorns') v += 200;
  if (fx === 'pierce') v += 250;
  return v;
}

/* how strong the enemy board looks. Face-downs are the interesting bit:
   a careful AI assumes the worst, a careless one assumes it is nothing. */
function facing(m, L){
  if (m.fd) return L.readFD ? Math.max(m.card.atk, m.card.def) : m.card.atk;
  return m.pos === 'atk' ? K.effAtk(m) : K.effDef(m);
}
function biggestEnemy(oi, L){
  return mine(oi).reduce((a, x) => Math.max(a, facing(x.m, L)), 0);
}
/* the hardest they can hit back — a face-down flips up and swings next turn */
function enemyPunch(oi, L){
  const raw = mine(oi).reduce((a, x) => {
    const m = x.m;
    return Math.max(a, m.fd ? (L.readFD ? m.card.atk : 0) : K.effAtk(m));
  }, 0);
  return Math.max(raw, T.punchFloor);      /* they get a summon too */
}
/* face-down spell/traps that are already armed — the reason to be careful */
function armedSetCards(pi){
  const D = K.D;
  return D.p[pi].sz.filter(s => s && s.fd && s.setTurn < D.turnCount).length;
}
/* the attribute the enemy leans on, so we can favour cards that counter it */
function enemyLean(oi){
  const D = K.D;
  const tally = {};
  mine(oi).forEach(x => { const f = x.m.card.f; if (f) tally[f] = (tally[f] || 0) + 1; });
  let best = null, n = 0;
  Object.keys(tally).forEach(f => { if (tally[f] > n){ n = tally[f]; best = f; } });
  if (best) return best;
  const key = D.p[oi].deckKey;
  const sd = key && K.STARTER_DECKS[key];
  return (sd && sd.f) || key || null;
}
function countersLean(card, lean, L){
  if (!L.counters || !card.f || !lean) return 0;
  return K.COUNTERS[card.f] === lean ? K.COUNTER_BONUS : 0;
}

/* ───────────────────────── summoning ─────────────────────────
   What a body on MY side is still doing for me. This is NOT value(): value()
   is what a monster is worth to keep, and it is the wrong number when you are
   about to eat it for a tribute. DEF on a body you are tributing away never
   blocks anything, and an attacker that cannot get past the biggest thing they
   have is not attacking. Pricing both at face value is exactly why two mid
   bodies always "out-valued" one big one and Level 8s never hit the table. */
function bodyWorth(m, punch, wall){
  const a = K.effAtk(m), d = K.effDef(m);
  let v = a > wall ? a : a * T.outclassed;          /* can it still win a fight? */
  v = Math.max(v, Math.min(d, punch) * T.wallWorth); /* or it soaks one hit, once */
  /* A body nothing on the table can kill is not worth what it hits for once —
     it hits for that EVERY turn. This is the whole case for one big monster
     over two mid ones, and the old formula had no term for it at all. */
  if (a > punch) v += T.survives + a * T.surviveMul;
  return v + fxKeep(m, a);                          /* only what it still DOES */
}
/* A board is not the sum of its bodies. You cannot attack face while they hold
   ANY monster, so past their blocker count the extra bodies stop converting —
   and the single biggest body is the one that decides what you can kill. That
   is the whole reason one 3000 can be worth more than two 1200s. */
function boardTotal(ws, blockers){
  const s = ws.slice().sort((a, b) => b - a);
  let t = 0;
  for (let i = 0; i < s.length; i++){
    t += s[i] * (i === 0 ? 1 : (i >= blockers ? T.extraOpen : T.extraBody));
  }
  return t;
}

/* Every candidate summon is scored as "what my board is worth after it", on one
   scale, so a free Level 4 and a two-tribute Level 8 are compared like for like
   instead of the big one being charged the full price of the bodies it eats. */
function bestSummon(pi, L){
  const D = K.D, P = D.p[pi], oi = 1 - pi;
  const lean = enemyLean(oi);
  const enemyBest = biggestEnemy(oi, L);
  const punch = enemyPunch(oi, L);
  const enemyCount = mine(oi).length;
  const board = mine(pi).map(x => ({ i:x.i, w: bodyWorth(x.m, punch, enemyBest) }));
  const blockers = enemyCount + T.theirNext;
  const before = boardTotal(board.map(b => b.w), blockers);
  let best = null;
  const cand = [];

  P.hand.forEach((id, hi) => {
    const c = cardOf(id);
    if (!c || c.t !== 'monster') return;
    const info = K.summonInfo(pi, hi);
    if (!info.ok) return;

    const need = info.need;
    let tributes = [], keep = board;
    if (need){
      /* feed it the bodies that are doing the least, and never eat your own
         taunt if there is anything else on the table to eat */
      const pool = board.slice().sort((a, b) => {
        const ta = P.mz[a.i].card.fx === 'taunt' ? 1 : 0;
        const tb = P.mz[b.i].card.fx === 'taunt' ? 1 : 0;
        return (ta - tb) || (a.w - b.w);
      });
      if (pool.length < need) return;
      tributes = pool.slice(0, need).map(x => x.i);
      keep = board.filter(b => tributes.indexOf(b.i) < 0);
    } else if (K.freeZone(pi, 'm') < 0) return;

    let w = c.atk + countersLean(c, lean, L) + fxKeep({ card:c }, c.atk);
    if (c.atk > enemyBest) w += T.beats;                 /* it can actually beat something */
    if (c.atk > punch) w += T.survives + c.atk * T.surviveMul;  /* and nothing kills it back */
    if (c.fx === 'taunt' && enemyCount) w += T.taunt;

    let score = boardTotal(keep.map(b => b.w).concat(w), blockers) + fxPlay(c, enemyCount);
    /* every attacker my board can no longer block gets a free swing at me */
    const open = Math.max(0, enemyCount - (keep.length + 1));
    score -= open * Math.min(punch, 1600) * T.exposed;
    /* One-turn plan, and the only one short games have room for: a big monster
       in hand that is one body short is a reason to put a cheap body down now
       instead of eating the board for something smaller. Without this the AI
       tributes away the very bodies its Level 8 was waiting for. */
    if (need === 0 && P.hand.some((oid, oi2) => {
      if (oi2 === hi) return false;
      const o = cardOf(oid);
      return o && o.t === 'monster' && o.atk > c.atk && K.tributesFor(o.lvl) === board.length + 1;
    })) score += T.setup;
    /* the bodies have to be worth more in the new one than where they are now */
    if (need && score < before + L.tributeEdge) return;
    cand.push({ hi, c, need, tributes, score });
    if (!best || score > best.score) best = cand[cand.length - 1];
  });
  /* A weaker brain does not pick the best body in hand — it picks a body. This
     is the single biggest measurable difference between the levels. */
  if (cand.length > 1 && slip(L)) return cand[Math.floor(Math.random() * cand.length)];
  return best;
}

/* ───────────────────────── attacking ───────────────────────── */
function attackPlan(pi, L){
  const D = K.D, oi = 1 - pi, O = D.p[oi];
  const attackers = mine(pi).filter(x => K.canAttack(pi, x.i));
  if (!attackers.length) return null;
  const armed = armedSetCards(oi);
  const plans = [];

  attackers.forEach(x => {
    const targets = K.legalAttackTargets(pi, x.i);
    targets.forEach(t => {
      const a = K.effAtk(x.m) + (t >= 0 && O.mz[t] ? K.counterBonus(x.m.card, O.mz[t].card) : 0);
      if (t < 0){
        /* straight to the face */
        let s = a * 1.15;
        if (L.lethal && a >= O.lp) s += 100000;
        plans.push({ zi:x.i, t, score:s, a });
        return;
      }
      const dm = O.mz[t];
      if (!dm) return;
      const face = facing(dm, L);
      const kills = a > face;
      const dies  = !dm.fd && dm.pos === 'atk' && a < K.effAtk(dm);
      const evenTrade = !dm.fd && dm.pos === 'atk' && a === K.effAtk(dm);
      let s = 0;
      if (dies) s = -900 - value(dm) * .2;
      else if (evenTrade) s = value(dm) - value(x.m);
      else if (kills){
        s = 700 + value(dm);
        if (!dm.fd && dm.pos === 'atk') s += (a - K.effAtk(dm)) * .6;   /* battle damage */
        if (dm.card.fx === 'pierce' || x.m.card.fx === 'pierce') s += 120;
      } else {
        /* bounces off a wall — only worth it to clear a taunt, never otherwise */
        s = dm.card.fx === 'taunt' ? -140 : -320;
        if (!dm.fd && dm.pos === 'def') s -= (face - a) * .2;
      }
      if (dm.card.fx === 'thorns' && !dm.fd) s -= 420;
      /* Respect what they are hiding — but only respect it a bit. Measured over
         mirror matches, scaling this with the attacker's value made the careful
         AI refuse profitable attacks and lose the race, so it is a flat nudge
         that a good trade still beats. */
      if (armed && L.trapHold){
        s -= Math.min(armed, 2) * 130;
        if (L.lethal && a >= O.lp) s += 100000;
      }
      plans.push({ zi:x.i, t, score:s, a });
    });
  });
  if (!plans.length) return null;
  plans.sort((p, q) => q.score - p.score);
  if (slip(L) && plans.length > 1) return plans[1 + Math.floor(Math.random() * (plans.length - 1))];
  return plans[0].score > 0 ? plans[0] : null;
}

/* ───────────────────────── spells ───────────────────────── */
const handIdxOf = (P, fx) => P.hand.findIndex(id => { const c = cardOf(id); return c && c.fx === fx; });
const handIdxAny = (P, list) => P.hand.findIndex(id => {
  const c = cardOf(id); return c && list.indexOf(c.fx) >= 0;
});

function mainPhase(pi, L){
  const D = K.D, P = D.p[pi], O = D.p[1 - pi], oi = 1 - pi;
  D.ai.setThisTurn = D.ai.setThisTurn || 0;

  /* 1 — stay alive */
  const healIdx = handIdxOf(P, 's_heal');
  if (P.lp <= L.healAt && healIdx >= 0 && K.canActivateSpell(pi, cardOf(P.hand[healIdx]))){
    K.activateSpell(pi, healIdx); return true;
  }

  /* 2 — remove a genuine problem */
  const destIdx = handIdxOf(P, 's_destroy');
  if (destIdx >= 0){
    const threats = mine(oi).filter(x => !x.m.fd).sort((a, b) => value(b.m) - value(a.m));
    if (threats.length && value(threats[0].m) >= L.removeAt && !slip(L)){
      K.activateSpell(pi, destIdx, { side:oi, i:threats[0].i }); return true;
    }
  }

  /* 3 — dig when the hand is running dry */
  const drawIdx = handIdxAny(P, ['s_draw','s_draw1','s_search']);
  if (P.hand.length <= 4 && drawIdx >= 0 && K.canActivateSpell(pi, cardOf(P.hand[drawIdx]))){
    K.activateSpell(pi, drawIdx); return true;
  }

  /* 4 — the summon for the turn */
  if (!P.normalSummoned){
    const best = bestSummon(pi, L);
    if (best){
      const enemyBest = biggestEnemy(oi, L);
      const zi = K.freeZone(pi, 'm');
      /* ── which way up ──
         Duck only behind a body that is actually a wall. Ducking whenever the
         thing is outclassed was measured and it is a disaster (-13 points of
         win rate): you stop attacking, they do not, and you lose the race. */
      const defensive = best.need === 0 && best.c.atk < enemyBest && best.c.def > best.c.atk;
      /* face-down while it is not fighting: it hides the number and dodges the
         targeted removal, which only ever picks on what it can see. An effect
         monster stays face-up — face-down means the effect never fires, and
         keeping those up measured worth about half a point of win rate. */
      const setDown = defensive && !best.c.fx;
      K.summon(pi, best.hi, zi < 0 ? 0 : zi, defensive ? 'def' : 'atk', setDown, best.tributes);
      return true;
    }
  }

  /* 5 — a pump, but only when it actually wins something */
  const buffIdx = handIdxAny(P, ['s_buff']);
  if (buffIdx >= 0 && D.phase === 'main'){
    const mineAtk = mine(pi).filter(x => !x.m.fd && x.m.pos === 'atk' && K.canAttack(pi, x.i) === false)
      .concat(mine(pi).filter(x => !x.m.fd && x.m.pos === 'atk'));
    const seen = {};
    const list = mineAtk.filter(x => seen[x.i] ? false : (seen[x.i] = true));
    const enemy = mine(oi).sort((a, b) => facing(b.m, L) - facing(a.m, L));
    for (const x of list){
      const lethalNow = L.lethal && !enemy.length && K.effAtk(x.m) + 700 >= O.lp;
      const wins = enemy.length && K.effAtk(x.m) <= facing(enemy[0].m, L)
        && K.effAtk(x.m) + 700 + K.counterBonus(x.m.card, enemy[0].m.card) > facing(enemy[0].m, L);
      if (lethalNow || wins){ K.activateSpell(pi, buffIdx, { side:pi, i:x.i }); return true; }
    }
  }
  const allIdx = handIdxOf(P, 's_buffall');
  if (allIdx >= 0 && mine(pi).filter(x => !x.m.fd && x.m.pos === 'atk').length >= 2
      && K.canActivateSpell(pi, cardOf(P.hand[allIdx]))){
    K.activateSpell(pi, allIdx); return true;
  }

  /* 6 — free damage / free information */
  const discIdx = handIdxOf(P, 's_discard');
  if (discIdx >= 0 && O.hand.length){ K.activateSpell(pi, discIdx); return true; }
  const stealIdx = handIdxOf(P, 's_steal');
  if (stealIdx >= 0 && K.canActivateSpell(pi, cardOf(P.hand[stealIdx]))){
    const grab = mine(oi).filter(x => !x.m.fd).sort((a, b) => K.effAtk(b.m) - K.effAtk(a.m))[0];
    if (grab && K.effAtk(grab.m) >= 1500){ K.activateSpell(pi, stealIdx, { side:oi, i:grab.i }); return true; }
  }

  /* 7 — arm the back row (never dump the whole hand in one turn) */
  const trapIdx = P.hand.findIndex(id => { const c = cardOf(id); return c && c.t === 'trap'; });
  const setCap = 3;
  if (trapIdx >= 0 && K.freeZone(pi, 's') >= 0 && D.ai.setThisTurn < setCap && !slip(L)){
    D.ai.setThisTurn++;
    K.setST(pi, trapIdx, K.freeZone(pi, 's'));
    return true;
  }

  /* 8 — flip a face-down that is now the biggest thing on the table */
  const enemyBest = biggestEnemy(oi, L);
  const fd = mine(pi).find(x => x.m.fd && x.m.sumTurn < D.turnCount && K.effAtk(x.m) > enemyBest);
  if (fd && K.changePosition(pi, fd.i)) return true;

  /* 9 — sit down behind the wall when you are outgunned */
  if (L.trapHold >= 1){
    const duck = mine(pi).find(x => !x.m.fd && x.m.pos === 'atk' && x.m.sumTurn < D.turnCount
      && x.m.atkCount === 0 && K.effAtk(x.m) < enemyBest && K.effDef(x.m) > K.effAtk(x.m));
    if (duck && K.changePosition(pi, duck.i)) return true;
  }

  D.ai.stage = 'battle';
  D.ai.setThisTurn = 0;
  K.toBattle();
  return true;
}

/* ───────────────────────── one decision per call ─────────────────────────
   game.js drives this in a loop with animation waits between calls, so each
   call must do exactly one visible thing and then return. */
function step(pi){
  const D = K.D;
  if (!D || D.over) return false;
  if (pi == null) pi = 1;
  if (D.turn !== pi) return false;
  const L = level(pi);

  if (D.ai.stage === 'main') return mainPhase(pi, L);

  if (D.ai.stage === 'battle'){
    const plan = attackPlan(pi, L);
    if (plan){ K.doAttack(pi, plan.zi, plan.t); return true; }
    D.ai.stage = 'done';
    return true;
  }

  /* turn is finished — hand it back the same way a player would, so
     pass-and-play and online hooks still fire when this drives seat 0 */
  D.ai.setThisTurn = 0;
  if (pi === 0) K.playerEndTurn();
  else K.endTurn();
  return false;
}

/* ───────────────────────── traps ─────────────────────────
   game.js asks this which face-down trap (if any) to flip when an attack is
   declared. The whole point of a difficulty setting is right here: a good
   player does NOT burn "Where Were You?" on a 900 ATK poke. */
function pickTrap(ready, ctx){
  const D = K.D;
  const L = level(ctx.defPi);
  const DEF = D.p[ctx.defPi];
  const burn = ready.find(x => x.s.card.fx === 't_burn');

  /* what this attack actually costs us if we let it through */
  let incoming = 0, losing = 0;
  if (ctx.defZone < 0) incoming = ctx.atk;
  else if (ctx.target){
    if (!ctx.target.fd && ctx.target.pos === 'atk'){
      if (ctx.atk > K.effAtk(ctx.target)){ incoming = ctx.atk - K.effAtk(ctx.target); losing = value(ctx.target); }
    } else {
      const d = ctx.target.fd ? ctx.target.card.def : K.effDef(ctx.target);
      if (ctx.atk > d){
        losing = value(ctx.target);
        if (ctx.attacker.card.fx === 'pierce') incoming = ctx.atk - d;
      }
    }
  }
  const lethal = incoming >= DEF.lp;

  /* lethal is lethal — throw everything at it, hardest counter first */
  if (lethal){
    const stop = ready.find(x => ['t_mirror','t_destroy','t_bounce','t_negate'].indexOf(x.s.card.fx) >= 0);
    if (stop) return stop;
    if (ready.find(x => x.s.card.fx === 't_weaken') && ctx.atk - 800 < DEF.lp)
      return ready.find(x => x.s.card.fx === 't_weaken');
    return ready[0];
  }

  /* the burn trap is pure profit — no reason to ever sit on it */
  if (burn && (!L.trapHold || incoming === 0 && losing === 0)) return burn;

  if (!L.trapHold) return ready[0];        /* tourist: fires at anything that moves */

  /* "Real threat" — worth spending a card on. Holding a trap forever is worth
     nothing, so once the life total is getting thin anything that connects
     counts. */
  const real = losing >= (L.trapHold >= 2 ? 1600 : 1400)
            || incoming >= (L.trapHold >= 2 ? 1100 : 900)
            || (DEF.lp <= 3500 && incoming > 0);
  if (!real) return burn || undefined;     /* hold the good ones back */

  const big = K.effAtk(ctx.attacker) >= 2000;
  const order = big
    ? ['t_destroy','t_mirror','t_bounce','t_negate','t_weaken']
    : ['t_weaken','t_negate','t_bounce','t_destroy','t_mirror'];
  for (const fx of order){
    const hit = ready.find(x => x.s.card.fx === fx);
    /* weaken only helps if it actually turns the fight around */
    if (hit && fx === 't_weaken' && ctx.defZone >= 0 && ctx.target && !ctx.target.fd
        && ctx.atk - 800 >= K.effAtk(ctx.target)) continue;
    if (hit) return hit;
  }
  return burn || undefined;
}

window.KARTI_AI = { step, pickTrap, LEVELS, ALIAS, level, value, bestSummon, attackPlan, TUNE:T };

})();
