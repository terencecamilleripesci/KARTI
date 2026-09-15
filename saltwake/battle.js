/* ═══════════════════════════════════════════════════════════════════
   BATTLE — the rules, and nothing else. Saltwake, DESIGN.md §2 and §6.

   NO DOM, NO CANVAS, NO TIMERS, AND `Math.random` IS NEVER CALLED. The
   rng is injected, so every battle is reproducible and the whole engine
   can be driven by tools/checkbattle.js. Damage, capture and turn order
   are exactly where the bugs hide; randomness you cannot pin is
   randomness you cannot regression-test.

   ── THE THREE THINGS THAT MAKE THIS NOT A POKÉMON CLONE ──────────────

   1. **COMMITTED, VISIBLE ENEMY INTENT.** Before the player chooses,
      the foe's move is already picked and shown, and it cannot change.
      Guard, debuff and swap decisions become readable instead of a
      guessing game, which is what makes a six-exchange fight have
      decisions in it at all. `B.intent` is that promise.

   2. **A SHARED JOURNEY LEVEL.** The player has one level; every
      creature they own sits at it. A fresh catch is set to it and fully
      healed. This removes the "your new catch is eight levels behind so
      you will never use it" trap — the specific way collection loops
      die. Catching becomes a pure choice about role and matchup.

   3. **NO ACCURACY ROLLS.** A phone turn is never spent on a miss.

   ── CAPTURE IS THE FAUCET, SO IT IS THE MOST CAREFUL CODE HERE ───────
   `capture()` returns a result and NEVER touches the party or the save.
   The caller commits once, reserve-first, and saves immediately after.
   Losing or duplicating a newly caught creature is worse than any
   visual bug, and DESIGN.md calls ownership recovery a release blocker.

   `catchChance()` is the number the UI shows AND the number that is
   rolled — one function, so the displayed odds cannot drift from the
   real ones. The curve is anchored to the design: 8% at full health,
   ~60% at a quarter health, ~87% at 1 HP for a first-stage form. That
   is how the game teaches "weaken it first" without a tutorial line —
   the percentage moves while you watch.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function (root) {

  const D = root.DATA;

  /* ── rng ──────────────────────────────────────────────────────────*/
  function rng(seed) {
    let s = (seed | 0) || 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0;
      return ((s >>> 0) % 100000) / 100000;
    };
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const alive = c => !!c && c.hp > 0;

  /* ── a creature instance ──────────────────────────────────────────*/
  function statAt(base, level) {
    return Math.floor(base * (1 + level / 25)) + 2;
  }

  let nextId = 1;

  function make(speciesId, level) {
    const sp = D.SPECIES[speciesId];
    if (!sp) throw new Error('no such species: ' + speciesId);
    const lv = clamp(level | 0 || 1, 1, D.MAX_LEVEL);
    const lib = D.libraryFor(sp.type, lv);
    const c = {
      uid: nextId++,                 /* stable identity across evolution */
      species: speciesId, name: sp.name, type: sp.type, level: lv,
      hpMax: statAt(sp.base.hp, lv), hp: 0,
      atk: statAt(sp.base.atk, lv),
      def: statAt(sp.base.def, lv),
      spe: statAt(sp.base.spe, lv),
      library: lib,
      /* Basic is FIXED in slot one and always legal, so there is always
         a damaging action available even with every cooldown running */
      moves: equipDefault(lib),
      mod: { atk: 0, spe: 0 },
      cond: { settled: 0, exposed: 0, guard: 0, relayShield: 0 },
      cd: {}, mendUsed: false
    };
    c.hp = c.hpMax;
    return c;
  }

  function equipDefault(lib) {
    const basic = lib.filter(id => D.MOVES[id].slot === 'basic');
    const rest = lib.filter(id => D.MOVES[id].slot !== 'basic');
    return basic.concat(rest).slice(0, 4);
  }

  /* Re-derive stats for a new level, KEEPING damage already taken.
     A free heal on level-up would make levelling a combat resource and
     quietly break the rest point. */
  function relevel(c, level) {
    const sp = D.SPECIES[c.species];
    const lost = c.hpMax - c.hp;
    c.level = clamp(level | 0, 1, D.MAX_LEVEL);
    c.hpMax = statAt(sp.base.hp, c.level);
    c.atk = statAt(sp.base.atk, c.level);
    c.def = statAt(sp.base.def, c.level);
    c.spe = statAt(sp.base.spe, c.level);
    c.hp = Math.max(1, c.hpMax - lost);
    c.library = D.libraryFor(c.type, c.level);
    /* keep what they had equipped if it is still legal, top up from the
       library — a player's loadout should survive a level */
    const keep = c.moves.filter(id => c.library.indexOf(id) >= 0);
    for (const id of equipDefault(c.library))
      if (keep.length < 4 && keep.indexOf(id) < 0) keep.push(id);
    c.moves = keep.slice(0, 4);
    return c;
  }

  /* EVOLUTION PRESERVES IDENTITY. Same uid, same nickname if one is
     set, same legal equipped moves — DESIGN.md §4 is explicit that the
     creature is the same creature. Available at the threshold and never
     forced; the caller decides when to call this. */
  function canEvolve(c, journey) {
    const ev = D.SPECIES[c.species].evolve;
    return !!(ev && journey >= ev.at && D.SPECIES[ev.into]);
  }
  function evolve(c, journey) {
    if (!canEvolve(c, journey)) return null;
    const into = D.SPECIES[c.species].evolve.into, ns = D.SPECIES[into];
    const wasNamed = c.nickname ? true : false;
    c.species = into;
    if (!wasNamed) c.name = ns.name;
    c.type = ns.type;
    relevel(c, c.level);
    return ns.name;
  }

  /* ── effective stats ──────────────────────────────────────────────*/
  const stageMul = s => D.STAGE_MUL[String(clamp(s | 0, -1, 1))];
  function effStat(c, stat) {
    let v = c[stat] * stageMul(c.mod[stat] || 0);
    if (stat === 'def' && c.cond.exposed > 0) v *= 0.8;
    return Math.max(1, Math.floor(v));
  }

  /* ── damage ───────────────────────────────────────────────────────
     The repository formula, with the divisor at 25 (tuned by measuring
     a real playthrough: /50 gave a ten-turn slog because these stat
     lines are 10-22, not 50-150) and a NARROWER jitter than the
     prototype's, so a shown damage range is worth reading. */
  function damage(atkC, defC, moveId, rand) {
    const m = D.MOVES[moveId];
    if (!m || !m.power) return { dmg: 0, mult: 1 };
    const mult = D.effectiveness(m.type, defC.type);
    const a = effStat(atkC, 'atk'), d = effStat(defC, 'def');
    let base = Math.floor(((2 * atkC.level / 5 + 2) * m.power * a / d) / 25) + 2;
    let other = 1;
    if (m.ifSettled && defC.cond.settled > 0) other *= m.ifSettled;
    if (defC.cond.guard > 0) other *= 0.5;
    if (defC.cond.relayShield > 0) other *= 0.75;
    if (atkC.cond.settled > 0) other *= 0.85;        /* E6 on the attacker */
    const jitter = 0.90 + 0.10 * rand();
    let dmg = Math.max(1, Math.floor(base * mult * other * jitter));
    if (m.nonlethal) dmg = Math.min(dmg, Math.max(0, defC.hp - 1));
    return { dmg, mult };
  }

  /* the range the UI shows — same formula, jitter pinned to its ends */
  function damageRange(atkC, defC, moveId) {
    const lo = damage(atkC, defC, moveId, () => 0).dmg;
    const hi = damage(atkC, defC, moveId, () => 0.999).dmg;
    return { lo, hi, mult: damage(atkC, defC, moveId, () => 0.5).mult };
  }

  /* ── capture ──────────────────────────────────────────────────────
     ONE function for the shown number and the rolled number. Anchored
     to DESIGN.md §6: 8% at full health for a first-stage form, about
     60% at a quarter, about 87% at 1 HP. Settled adds a flat +0.15. */
  function catchChance(wild) {
    const sp = D.SPECIES[wild.species];
    const frac = clamp(wild.hp / wild.hpMax, 0, 1);
    const scale = (sp.catchRate || 190) / 190;
    let p = (0.08 + 0.82 * Math.pow(1 - frac, 1.6)) * scale;
    if (wild.cond && wild.cond.settled > 0) p += 0.15;
    return clamp(p, 0.02, 0.98);
  }

  function capture(wild, rand) {
    const p = catchChance(wild);
    return { caught: rand() < p, chance: p };
  }

  /* ── a battle ─────────────────────────────────────────────────────*/
  function startBattle(party, foes, opts) {
    const o = opts || {};
    const team = [].concat(foes);
    const B = {
      party: party, foeQueue: team.slice(1),
      mine: party.find(alive) || party[0],
      foe: team[0],
      wild: o.wild !== false,
      journey: o.journey || D.START_LEVEL,
      exchange: 0, over: 0,        /* 0 run 1 won -1 lost 2 caught 3 fled */
      rand: o.rand || rng(o.seed || 1),
      log: [], intent: null, actionId: 0, caught: null
    };
    for (const c of party.concat(team)) reset(c);
    B.intent = chooseIntent(B);
    return B;
  }

  function reset(c) {
    if (!c) return;
    c.mod = { atk: 0, spe: 0 };
    c.cond = { settled: 0, exposed: 0, guard: 0, relayShield: 0 };
    c.cd = {}; c.mendUsed = false;
  }
  /* leaving the active slot drops temporary state but KEEPS cooldowns
     and the once-per-encounter Mend — switching must not launder them */
  function onLeaveActive(c) {
    c.mod = { atk: 0, spe: 0 };
    c.cond.settled = 0; c.cond.exposed = 0;
    c.cond.guard = 0; c.cond.relayShield = 0;
  }

  const ready = (c, id) => !(c.cd[id] > 0);

  function legalMoves(c) {
    return c.moves.filter(id => {
      const m = D.MOVES[id];
      if (!m) return false;
      if (m.once && c.mendUsed) return false;
      return ready(c, id);
    });
  }

  /* ── the foe's committed intent ───────────────────────────────────
     Chosen at the START of an exchange and shown before the player
     acts. Prefers a super-effective hit so a bad matchup is punished —
     that is what makes the player want a different creature. Not
     random: a random foe would hide the signal Phase 0 measures. */
  function chooseIntent(B) {
    const f = B.foe;
    if (!alive(f)) return null;
    const opts = legalMoves(f);
    const pool = opts.length ? opts : [f.moves[0]];
    let best = pool[0], score = -1;
    for (const id of pool) {
      const m = D.MOVES[id];
      if (!m) continue;
      let s;
      if (m.power) {
        const r = damageRange(f, B.mine, id);
        s = (r.lo + r.hi) / 2;
        /* finish it if you can */
        if (r.lo >= B.mine.hp) s += 1000;
      } else s = 6;                 /* utility: taken, but not preferred */
      if (s > score) { score = s; best = id; }
    }
    const m = D.MOVES[best];
    return { move: best, name: m.name, power: m.power, effect: m.effect,
             heavy: m.slot === 'heavy',
             range: m.power ? damageRange(f, B.mine, best) : null };
  }

  /* ── applying one move ───────────────────────────────────────────*/
  function applyMove(B, actor, target, moveId, allyPick) {
    const m = D.MOVES[moveId];
    if (!m) return;
    if (m.cd) actor.cd[moveId] = m.cd + 1;   /* +1: ticked down this turn */

    switch (m.effect) {
      case 'E1': {
        const r = damage(actor, target, moveId, B.rand);
        target.hp = Math.max(0, target.hp - r.dmg);
        target.cond.guard = 0;                /* guard is consumed */
        target.cond.relayShield = 0;
        let line = actor.name + ' used ' + m.name + ' (' + r.dmg + ')';
        if (r.mult > 1) line += ' — strong';
        else if (r.mult < 1) line += ' — resisted';
        if (m.nonlethal && target.hp === 1) line += ', held back';
        B.log.push(line);
        break;
      }
      case 'E2':
        actor.cond.guard = 1;
        B.log.push(actor.name + ' used ' + m.name + ' — braced');
        break;
      case 'E3': case 'E4': {
        const who = m.target === 'own' ? actor : target;
        who.mod[m.stat] = clamp((who.mod[m.stat] || 0) + m.by, -1, 1);
        B.log.push(actor.name + ' used ' + m.name + ' — ' + who.name + '’s ' +
                   (m.stat === 'atk' ? 'force' : 'pace') +
                   (m.by > 0 ? ' rose' : ' fell'));
        break;
      }
      case 'E5': {
        const t = allyPick && alive(allyPick) ? allyPick : actor;
        const heal = Math.ceil(0.30 * t.hpMax);
        t.hp = Math.min(t.hpMax, t.hp + heal);
        actor.mendUsed = true;
        B.log.push(actor.name + ' used ' + m.name + ' — ' + t.name +
                   ' recovered ' + heal);
        break;
      }
      case 'E6':
        target.cond.settled = 2;
        B.log.push(actor.name + ' used ' + m.name + ' — ' + target.name +
                   ' is settled');
        break;
      case 'E7':
        target.cond.exposed = 2;
        B.log.push(actor.name + ' used ' + m.name + ' — ' + target.name +
                   ' is exposed');
        break;
      case 'E8': {
        const t = allyPick && alive(allyPick) ? allyPick : actor;
        if (t.mod.atk < 0) t.mod.atk = 0;
        if (t.mod.spe < 0) t.mod.spe = 0;
        t.cond.settled = 0; t.cond.exposed = 0;
        B.log.push(actor.name + ' used ' + m.name + ' — ' + t.name + ' is clear');
        break;
      }
      case 'E9': {
        const to = allyPick && alive(allyPick) && allyPick !== actor
          ? allyPick : null;
        if (!to) { B.log.push(actor.name + ' had nobody to hand off to'); break; }
        onLeaveActive(actor);
        B.mine = to;
        to.cond.relayShield = 1;
        B.log.push(actor.name + ' used ' + m.name + ' — ' + to.name +
                   ' stepped in covered');
        break;
      }
    }
  }

  /* ── one exchange ─────────────────────────────────────────────────
     action: {kind:'move', move, ally?} | {kind:'catch'} |
             {kind:'swap', to} | {kind:'run'}
     Returns B. Invalid input spends nothing — no rng, no cooldown, no
     turn — which is rule 1 of the design's resolution order. */
  function takeTurn(B, action) {
    if (B.over) return B;
    const a = action || { kind: 'move', move: B.mine.moves[0] };

    if (a.kind === 'move') {
      if (!a.move || legalMoves(B.mine).indexOf(a.move) < 0) {
        B.log.push('That move is not ready');
        return B;                         /* no turn spent */
      }
    }
    if (a.kind === 'swap') {
      if (!a.to || !alive(a.to) || a.to === B.mine ||
          B.party.indexOf(a.to) < 0) {
        B.log.push('Cannot send that one out');
        return B;
      }
    }
    if (a.kind === 'catch' && !B.wild) {
      B.log.push('You cannot catch another keeper’s creature');
      return B;
    }

    B.exchange++; B.actionId++;
    const intent = B.intent;                /* locked before input */

    /* 1. escape */
    if (a.kind === 'run') {
      B.over = 3; B.log.push('You slipped away');
      return B;
    }

    /* 2. a catch resolves BEFORE the foe's move; failure still eats it */
    if (a.kind === 'catch') {
      const res = capture(B.foe, B.rand);
      if (res.caught) {
        B.over = 2; B.caught = B.foe;
        B.log.push('Caught ' + B.foe.name + '!');
        return B;
      }
      B.log.push('The clasp sprang open (' +
                 Math.round(res.chance * 100) + '%)');
      foeActs(B, intent);
      return endOfExchange(B);
    }

    /* 3. swap and relay have early priority; the foe hits the arrival */
    if (a.kind === 'swap') {
      onLeaveActive(B.mine);
      B.mine = a.to;
      B.log.push('Go, ' + a.to.name + '!');
      foeActs(B, intent);
      return endOfExchange(B);
    }

    const mineMove = D.MOVES[a.move];
    const mineEarly = mineMove.effect === 'E2' || mineMove.effect === 'E9';
    const foeMove = intent ? D.MOVES[intent.move] : null;
    const foeEarly = foeMove && (foeMove.effect === 'E2' || foeMove.effect === 'E9');

    /* 4. early moves first, player before foe when both are early */
    if (mineEarly) applyMove(B, B.mine, B.foe, a.move, a.ally);
    if (foeEarly && alive(B.foe)) applyMove(B, B.foe, B.mine, intent.move);

    if (!alive(B.mine) || !alive(B.foe)) return endOfExchange(B);

    /* 5. the rest by pace. Exact ties ALTERNATE by exchange parity —
       no random tie roll, so order is predictable from what is shown. */
    const mineSpe = effStat(B.mine, 'spe'), foeSpe = effStat(B.foe, 'spe');
    const mineFirst = mineSpe > foeSpe ? true
                    : mineSpe < foeSpe ? false
                    : (B.exchange % 2 === 1);

    const doMine = () => { if (!mineEarly && alive(B.mine) && alive(B.foe))
      applyMove(B, B.mine, B.foe, a.move, a.ally); };
    const doFoe = () => { if (!foeEarly && intent && alive(B.foe) && alive(B.mine))
      applyMove(B, B.foe, B.mine, intent.move); };

    if (mineFirst) { doMine(); doFoe(); } else { doFoe(); doMine(); }
    return endOfExchange(B);
  }

  function foeActs(B, intent) {
    if (intent && alive(B.foe) && alive(B.mine))
      applyMove(B, B.foe, B.mine, intent.move);
  }

  /* ── end of exchange: knockouts, durations, next intent ──────────*/
  function endOfExchange(B) {
    /* the foe went down */
    if (!alive(B.foe)) {
      B.log.push(B.foe.name + ' is out');
      if (B.foeQueue.length) {
        B.foe = B.foeQueue.shift();
        B.log.push('The keeper sent out ' + B.foe.name + '!');
        tick(B); B.intent = chooseIntent(B);
        return B;
      }
      B.over = 1;
      return B;
    }
    /* mine went down — forced replacement costs no turn and gives the
       foe no extra attack, which is why it is resolved here and not as
       a new battle object */
    if (!alive(B.mine)) {
      B.log.push(B.mine.name + ' is out');
      const next = B.party.find(alive);
      if (!next) { B.over = -1; return B; }
      onLeaveActive(B.mine);
      B.mine = next;
      B.log.push('Go, ' + next.name + '!');
      tick(B); B.intent = chooseIntent(B);
      return B;
    }
    tick(B);
    B.intent = chooseIntent(B);
    return B;
  }

  function tick(B) {
    for (const c of B.party.concat([B.foe])) {
      if (!c) continue;
      for (const k of Object.keys(c.cd))
        if (c.cd[k] > 0) c.cd[k]--;
      if (c.cond.settled > 0) c.cond.settled--;
      if (c.cond.exposed > 0) c.cond.exposed--;
      c.cond.guard = 0;                 /* expires unused */
      c.cond.relayShield = 0;
    }
  }

  /* ── committing a catch: RESERVE FIRST, then promote ──────────────
     The design calls ownership recovery a release blocker, so the order
     matters: the creature is added to the roster BEFORE anything else
     can fail, it is set to the journey level and fully healed (a catch
     you cannot use is the trap this whole design exists to avoid), and
     the caller saves immediately after this returns. */
  function commitCatch(state, wild, journey) {
    reset(wild);
    relevel(wild, journey);
    wild.hp = wild.hpMax;
    state.reserves = state.reserves || [];
    if (state.party.length < 3) state.party.push(wild);
    else state.reserves.push(wild);
    state.caught = state.caught || {};
    state.caught[wild.species] = 1;
    return wild;
  }

  /* ── the journey level ────────────────────────────────────────────
     One level for the player. Everything they own is set to it, so
     there is no per-creature grind and a new catch is never behind. */
  const xpFor = lv => 10 * (lv - 1) * lv;

  function gainXp(state, amount) {
    const before = state.journey;
    state.xp = Math.max(0, (state.xp | 0) + Math.max(0, amount | 0));
    while (state.journey < D.MAX_LEVEL && state.xp >= xpFor(state.journey + 1))
      state.journey++;
    if (state.journey !== before)
      for (const c of state.party.concat(state.reserves || []))
        relevel(c, state.journey);
    return state.journey - before;
  }

  function xpFromWin(loser) { return Math.max(1, Math.floor(loser.level * 7)); }

  function healAll(state) {
    for (const c of state.party.concat(state.reserves || [])) {
      reset(c); c.hp = c.hpMax;
    }
    return state;
  }

  /* CAPPED TO THE JOURNEY LEVEL. DESIGN.md §7: "all wild levels are
     rolled in the listed interval then capped to the current journey
     level, so catching a high-area wild never forces a level
     reduction." Without the cap, wandering into a later area and
     catching something would hand you a creature ABOVE your journey
     level — and commitCatch sets a catch TO the journey level, so it
     would arrive weaker than it appeared. The cap keeps the shown level
     and the owned level the same number. */
  function rollEncounter(zone, rand, journey) {
    const table = D.ENCOUNTERS[zone];
    if (!table || !table.length) return null;
    const cap = journey || D.MAX_LEVEL;
    const pick = e => {
      const lv = e.min + Math.floor(rand() * (e.max - e.min + 1));
      return make(e.species, Math.max(1, Math.min(cap, lv)));
    };
    let total = 0;
    for (const e of table) total += e.weight;
    let x = rand() * total;
    for (const e of table) {
      if (x < e.weight) return pick(e);
      x -= e.weight;
    }
    return pick(table[table.length - 1]);
  }

  root.BATTLE = { rng, make, statAt, relevel, equipDefault,
                  canEvolve, evolve, effStat, stageMul,
                  damage, damageRange, catchChance, capture,
                  startBattle, takeTurn, chooseIntent, legalMoves,
                  commitCatch, xpFor, gainXp, xpFromWin, healAll,
                  rollEncounter, alive, reset };

})(typeof window !== 'undefined' ? window : globalThis);
