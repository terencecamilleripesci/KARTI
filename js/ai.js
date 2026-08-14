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
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
if (!K) return;

/* ───────────────────────── difficulty ───────────────────────── */
const LEVELS = {
  tourist: {
    key:'tourist', name:'Tourist', e:'🦞',
    blurb:'Sunburnt and confident. Misplays about a third of the time.',
    slip:.35,            /* chance to take a deliberately worse line */
    counters:false,      /* does it plan around the attribute ring? */
    readFD:false,        /* does it assume a face-down might be big? */
    lethal:false,        /* does it count for game? */
    trapHold:0,          /* 0 = fires traps at anything */
    healAt:2200, removeAt:2400, tributeEdge:100
  },
  regular: {
    key:'regular', name:'Regular', e:'🍺',
    blurb:'Plays the ring, trades properly, will punish a lazy attack.',
    slip:.06, counters:true, readFD:true, lethal:true,
    trapHold:1, healAt:3200, removeAt:1900, tributeEdge:350
  },
  nanna: {
    key:'nanna', name:'Nanna', e:'👵',
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

/* ───────────────────────── summoning ───────────────────────── */
/* Tribute rule of thumb: you are spending bodies, so the thing you get
   back has to be clearly better than what you fed it — and you must not
   hand the board over while doing it. */
function bestSummon(pi, L){
  const D = K.D, P = D.p[pi], oi = 1 - pi;
  const lean = enemyLean(oi);
  const enemyBest = biggestEnemy(oi, L);
  const enemyCount = mine(oi).length;
  let best = null;
  const cand = [];

  P.hand.forEach((id, hi) => {
    const c = cardOf(id);
    if (!c || c.t !== 'monster') return;
    const info = K.summonInfo(pi, hi);
    if (!info.ok) return;

    const need = info.need;
    let tributes = [], cost = 0;
    if (need){
      /* feed it the least useful bodies: face-down and small first,
         and never eat your own taunt if you can avoid it */
      const pool = mine(pi).slice().sort((a, b) => {
        const ta = a.m.card.fx === 'taunt' ? 1 : 0, tb = b.m.card.fx === 'taunt' ? 1 : 0;
        return (ta - tb) || (value(a.m) - value(b.m));
      });
      if (pool.length < need) return;
      tributes = pool.slice(0, need).map(x => x.i);
      cost = pool.slice(0, need).reduce((a, x) => a + value(x.m), 0);

      const gain = c.atk + countersLean(c, lean, L) + (c.fx ? 300 : 0);
      if (gain < cost + L.tributeEdge) return;           /* not worth the bodies */
      /* don't strip your own board bare while they still have one up */
      const after = mine(pi).length - need + 1;
      if (after < 1) return;
      if (enemyCount >= after + 1 && c.atk <= enemyBest + 200) return;
    } else if (K.freeZone(pi, 'm') < 0) return;

    let score = c.atk + countersLean(c, lean, L) - cost;
    if (c.fx) score += 260;
    if (c.fx === 'taunt' && enemyCount) score += 260;
    if (c.atk > enemyBest) score += 320;                 /* it can actually beat something */
    score -= need * 120;
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
      /* tuck it away face-down if it cannot win a fight but can hold a wall */
      const defensive = best.need === 0 && best.c.atk < enemyBest && best.c.def > best.c.atk;
      K.summon(pi, best.hi, zi < 0 ? 0 : zi, defensive ? 'def' : 'atk', defensive, best.tributes);
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

window.KARTI_AI = { step, pickTrap, LEVELS, ALIAS, level, value, bestSummon, attackPlan };

})();
