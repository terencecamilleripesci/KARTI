/* ═══════════════════════════════════════════════════════════════════
   DATA — Saltwake's types, moves and creatures.

   Implements DESIGN.md §3 (six types), §5 (36 moves from 9 effects) and
   §4 (the roster). The Phase 0 SLICE is built here: all six types and
   all 36 move records exist, because the type chart and the effect
   vocabulary are what the rules are written against — but only the
   creatures Phase 0 needs are present. Adding the other 22 forms is
   filling this table in, not changing any code.

   ── WHY SIX TYPES FIXED WHAT SOFTER MULTIPLIERS DID NOT ──────────────
   The first prototype had a three-type cycle at 2.0/0.5, and measured
   over 200 seeded battles per pairing the favoured side won 100% and the
   unfavoured 0%. I assumed the multipliers were too harsh, softened them
   to 1.5/0.75, and measured again: still 100/0.

   The multiplier was never the problem. A THREE-node ring has only three
   neutral cells in the whole chart — every cross-type fight is a hard
   counter. A SIX-node ring has **24 neutral, 6 strong, 6 resisted**, so
   most fights are neutral and are decided by role, stat template and
   move choice instead of by the type you happened to bring.

   So the ring stays at 1.5/0.75 deliberately. A fourfold contrast would
   make swapping into a visible enemy intent too punishing and damage
   estimates too brittle for a six-exchange fight. And note what is NOT
   required of the chart: a disadvantaged equal-level damage-only duel is
   *meant* to be a loss. Recoverability comes from levels, swapping and
   utility — not from making the matrix look fair.

   NO NEUTRAL DAMAGE MOVE EXISTS. Every damaging move belongs to its
   owner's type, so there is no universal fallback that would let one
   creature answer everything and erase the reason to change the team.

   ORIGINAL EXPRESSION ONLY. Names, creatures and the island are
   invented; the setting is a fictional Maltese island. Nothing here is
   derived from another game's creatures, names or move list.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function (root) {

  /* ── the six types, as a ring ─────────────────────────────────────
     brine → kiln → rootlace → cutstone → bell → hush → brine
     An arrow is 1.5x; its reverse is 0.75x; everything else is 1x.
     The island's mnemonic: brine cools kilns, kilns char woven roots,
     roots split cut stone, stone muffles bells, bells disturb hush,
     hush stills brine. Fictional material logic, not chemistry. */
  const TYPES = ['brine', 'kiln', 'rootlace', 'cutstone', 'bell', 'hush'];

  const BEATS = { brine: 'kiln', kiln: 'rootlace', rootlace: 'cutstone',
                  cutstone: 'bell', bell: 'hush', hush: 'brine' };

  const STRONG = 1.5, RESIST = 0.75;

  /* No immunities. A 0x would mean a creature a sixth of the roster
     simply cannot fight, and a resisted hit still deals at least 1. */
  function effectiveness(moveType, defType) {
    if (!moveType || !defType) return 1;
    if (BEATS[moveType] === defType) return STRONG;
    if (BEATS[defType] === moveType) return RESIST;
    return 1;
  }

  /* ── the nine effect operations (DESIGN.md §2) ────────────────────
     Every one of the 36 moves is one of these nine with parameters.
     Nine bounded operations rather than per-move code is what keeps 36
     moves from becoming 36 special cases — and it is what lets
     checkbattle assert across the whole move list. */
  const EFFECTS = {
    E1: 'strike',   /* damage; opt nonlethal, opt ifSettled 1.4        */
    E2: 'guard',    /* early; next damaging hit x0.5; cd 1             */
    E3: 'force',    /* own +1 or foe -1; stages -1..+1; cd 2           */
    E4: 'pace',     /* own +1 or foe -1; affects next exchange; cd 2   */
    E5: 'mend',     /* heal 30% of a living party member; ONCE/caster  */
    E6: 'settle',   /* foe damage x0.85, capture +0.15, 2 actions; cd2 */
    E7: 'expose',   /* foe DEF x0.8 for 2 actions; cd 2                */
    E8: 'clear',    /* strip negatives from an ally; cd 2              */
    E9: 'relay'     /* early; swap in a reserve, -25% incoming; cd 2   */
  };

  const STAGE_MUL = { '-1': 0.8, '0': 1, '1': 1.25 };

  /* ── all 36 moves ─────────────────────────────────────────────────
     `slot` is which of a type's six this is. Basic is power 45 and
     always available — it guarantees a legal damaging action after
     healing is spent and cooldowns are running, so a turn can never be
     wasted on nothing. Heavy is 65 on cooldown 2. Precision is either
     25 and nonlethal (leaves the target on 1 HP, for safe capture) or
     35 with x1.4 into a Settled target.

     NO ACCURACY FIELD. Removing accuracy rolls means a phone turn is
     never spent on a miss — the prototype had them and DESIGN.md §2
     cuts them deliberately. */
  const MOVES = {};
  function mv(id, name, type, slot, power, eff, o) {
    MOVES[id] = Object.assign({ id, name, type, slot, power: power || 0,
                                effect: eff }, o || {});
  }

  /* brine — the salt pans */
  mv('panrush',        'Panrush',          'brine', 'basic',     45, 'E1', { target: 'foe' });
  mv('cistern_break',  'Cistern Break',    'brine', 'heavy',     65, 'E1', { target: 'foe', cd: 2 });
  mv('measured_rill',  'Measured Rill',    'brine', 'precision', 25, 'E1', { target: 'foe', nonlethal: true });
  mv('pan_shelter',    'Pan Shelter',      'brine', 'a',          0, 'E2', { target: 'own', cd: 1 });
  mv('cistern_share',  'Cistern Share',    'brine', 'b',          0, 'E5', { target: 'ally', once: true });
  mv('silted_step',    'Silted Step',      'brine', 'c',          0, 'E4', { target: 'foe', stat: 'spe', by: -1, cd: 2 });

  /* kiln — the limekilns */
  mv('kilnspit',         'Kilnspit',         'kiln', 'basic',     45, 'E1', { target: 'foe' });
  mv('furnace_unlace',   'Furnace Unlace',   'kiln', 'heavy',     65, 'E1', { target: 'foe', cd: 2 });
  mv('afterheat_stitch', 'Afterheat Stitch', 'kiln', 'precision', 35, 'E1', { target: 'foe', ifSettled: 1.4 });
  mv('hearth_fold',      'Hearth Fold',      'kiln', 'a',          0, 'E2', { target: 'own', cd: 1 });
  mv('stoke_measure',    'Stoke Measure',    'kiln', 'b',          0, 'E3', { target: 'own', stat: 'atk', by: 1, cd: 2 });
  mv('ash_unburden',     'Ash Unburden',     'kiln', 'c',          0, 'E8', { target: 'ally', cd: 2 });

  /* rootlace — the caper braid */
  mv('caper_lash',      'Caper Lash',      'rootlace', 'basic',     45, 'E1', { target: 'foe' });
  mv('rootwork_crush',  'Rootwork Crush',  'rootlace', 'heavy',     65, 'E1', { target: 'foe', cd: 2 });
  mv('careful_tendril', 'Careful Tendril', 'rootlace', 'precision', 25, 'E1', { target: 'foe', nonlethal: true });
  mv('caper_poultice',  'Caper Poultice',  'rootlace', 'a',          0, 'E5', { target: 'ally', once: true });
  mv('burden_braid',    'Burden Braid',    'rootlace', 'b',          0, 'E3', { target: 'foe', stat: 'atk', by: -1, cd: 2 });
  mv('woven_handoff',   'Woven Handoff',   'rootlace', 'c',          0, 'E9', { target: 'reserve', cd: 2 });

  /* cutstone — the dry-stone courses */
  mv('quoin_knock',     'Quoin Knock',     'cutstone', 'basic',     45, 'E1', { target: 'foe' });
  mv('archfall_weight', 'Archfall Weight', 'cutstone', 'heavy',     65, 'E1', { target: 'foe', cd: 2 });
  mv('masons_measure',  "Mason's Measure", 'cutstone', 'precision', 25, 'E1', { target: 'foe', nonlethal: true });
  mv('limestone_set',   'Limestone Set',   'cutstone', 'a',          0, 'E2', { target: 'own', cd: 1 });
  mv('mortar_rattle',   'Mortar Rattle',   'cutstone', 'b',          0, 'E7', { target: 'foe', cd: 2 });
  mv('loose_course',    'Loose Course',    'cutstone', 'c',          0, 'E4', { target: 'own', stat: 'spe', by: 1, cd: 2 });

  /* bell — the bronze rings */
  mv('clapper_arc',     'Clapper Arc',     'bell', 'basic',     45, 'E1', { target: 'foe' });
  mv('belfry_cascade',  'Belfry Cascade',  'bell', 'heavy',     65, 'E1', { target: 'foe', cd: 2 });
  mv('aftertone_pin',   'Aftertone Pin',   'bell', 'precision', 35, 'E1', { target: 'foe', ifSettled: 1.4 });
  mv('offbeat_toll',    'Offbeat Toll',    'bell', 'a',          0, 'E4', { target: 'foe', stat: 'spe', by: -1, cd: 2 });
  mv('evening_peal',    'Evening Peal',    'bell', 'b',          0, 'E6', { target: 'foe', cd: 2 });
  mv('passing_chime',   'Passing Chime',   'bell', 'c',          0, 'E9', { target: 'reserve', cd: 2 });

  /* hush — the still places */
  mv('hemlash',         'Hemlash',         'hush', 'basic',     45, 'E1', { target: 'foe' });
  mv('deepfold_press',  'Deepfold Press',  'hush', 'heavy',     65, 'E1', { target: 'foe', cd: 2 });
  mv('quiet_seam',      'Quiet Seam',      'hush', 'precision', 35, 'E1', { target: 'foe', ifSettled: 1.4 });
  mv('folded_truce',    'Folded Truce',    'hush', 'a',          0, 'E6', { target: 'foe', cd: 2 });
  mv('quiet_mantle',    'Quiet Mantle',    'hush', 'b',          0, 'E2', { target: 'own', cd: 1 });
  mv('soft_departure',  'Soft Departure',  'hush', 'c',          0, 'E9', { target: 'reserve', cd: 2 });

  /* ── stat templates (DESIGN.md §2) ────────────────────────────────
     HP / ATK / DEF / SPE. A creature's numbers come from its ROLE, not
     from a hand-tuned line per species: four templates x two stages is
     eight stat lines for thirty forms, which is why thirty forms is a
     table-filling job and not a balancing project. */
  const ROLES = {
    bulky:   { first: { hp: 50, atk: 11, def: 14, spe: 9  },
               mature: { hp: 60, atk: 14, def: 18, spe: 12 } },
    fast:    { first: { hp: 42, atk: 13, def: 10, spe: 17 },
               mature: { hp: 51, atk: 17, def: 13, spe: 22 } },
    hitter:  { first: { hp: 44, atk: 16, def: 10, spe: 10 },
               mature: { hp: 54, atk: 21, def: 13, spe: 13 } },
    support: { first: { hp: 47, atk: 10, def: 12, spe: 14 },
               mature: { hp: 57, atk: 13, def: 16, spe: 18 } }
  };

  /* WHEN EACH OF A TYPE'S SIX MOVES IS KNOWN. Shared by every family,
     so a starter at journey level 5 knows exactly four — Basic, A,
     Precision, Heavy — which is one full loadout with nothing to
     choose yet. B and C arrive later and turn the loadout into a
     decision. */
  const LEARN_AT = { basic: 1, a: 1, precision: 3, heavy: 5, b: 7, c: 9 };

  function libraryFor(type, level) {
    const out = [];
    for (const id of Object.keys(MOVES)) {
      const m = MOVES[id];
      if (m.type !== type) continue;
      if (LEARN_AT[m.slot] <= level) out.push(id);
    }
    /* Basic first, then the order a player meets them in */
    const order = ['basic', 'a', 'precision', 'heavy', 'b', 'c'];
    return out.sort((x, y) => order.indexOf(MOVES[x].slot) -
                              order.indexOf(MOVES[y].slot));
  }

  /* ── the roster: the Phase 0 slice ────────────────────────────────
     Three families, two stages each, plus two FIXTURES.

     `fixture: true` means shapes only — present so the onboarding path
     can be tested, with no art commissioned yet. DESIGN.md's phase 0
     is explicit that test fixtures are separate from the shipping
     content manifest, so they are flagged rather than quietly mixed in.

     Shalisk is Cutstone on purpose: it is NEUTRAL against Salip and
     Wickit and loses to Capplet, so the first catch is a genuinely new
     option rather than a hard counter handed to you. */
  const SPECIES = {};
  function sp(id, name, type, role, stage, o) {
    SPECIES[id] = Object.assign({
      id, name, type, role, stage,
      base: ROLES[role][stage],
      catchRate: stage === 'first' ? 190 : 90
    }, o || {});
  }

  sp('salip',     'Salip',     'brine',    'bulky',   'first',  { evolve: { at: 10, into: 'saltress' }, family: 'F01' });
  sp('saltress',  'Saltress',  'brine',    'bulky',   'mature', { family: 'F01' });
  sp('wickit',    'Wickit',    'kiln',     'fast',    'first',  { evolve: { at: 10, into: 'wickiloom' }, family: 'F04' });
  sp('wickiloom', 'Wickiloom', 'kiln',     'fast',    'mature', { family: 'F04' });
  sp('capplet',   'Capplet',   'rootlace', 'support', 'first',  { evolve: { at: 10, into: 'capparbor' }, family: 'F07' });
  sp('capparbor', 'Capparbor', 'rootlace', 'support', 'mature', { family: 'F07' });

  sp('shalisk',   'Shalisk',   'cutstone', 'fast',    'first',  { family: 'F11', fixture: true });
  sp('clinkid',   'Clinkid',   'bell',     'hitter',  'first',  { family: 'F13', fixture: true });

  const STARTERS = ['salip', 'wickit', 'capplet'];

  /* ── placeholder shapes, by TYPE not by species ───────────────────
     What the UI draws when a creature's sprite is not on disk yet.
     Keyed by type so a new form needs no entry: adding the other 22
     costs one table row and still renders. The real sprites replace
     these silently (game.js paintMons), which is what keeps art off
     the critical path to judging the loop. Hues follow DESIGN.md §10's
     palette anchors. */
  const ART = {
    brine:    { shape: 'round', hue: 190 },
    kiln:     { shape: 'spike', hue: 22  },
    rootlace: { shape: 'leaf',  hue: 95  },
    cutstone: { shape: 'block', hue: 38  },
    bell:     { shape: 'round', hue: 45  },
    hush:     { shape: 'leaf',  hue: 270 }
  };

  /* ── where things are ─────────────────────────────────────────────
     A02 Salt Road is the first habitat: the design puts Shalisk there
     at level 4 as the first catch, and the unchosen starters become
     catchable so a player is never locked out of a role. */
  const AREAS = {
    /* DESIGN.md §7: "A02 Salt Road — Lv4-6: Salip 50%, Shalisk 50%".
       Only those two, and that is load-bearing rather than flavour.
       My first version put all four starters in this table, and a
       Capplet player promptly met a level-6 Wickit — kiln counters
       rootlace, so the game's FIRST fight was an unwinnable one against
       a hard counter with a party of one. The unchosen starters become
       catchable in A03, by which point the player has a second creature
       and somewhere to swap to. */
    /* A01 has NO wild roster on purpose — it is where you choose a
       starter, learn to interact and rest, and where the ending returns
       to. A first area with encounters in it would teach the player to
       fear walking around before they own anything. */
    a01: { id: 'a01', name: 'Harbour Steps', zone: null, table: [] },

    a02: { id: 'a02', name: 'Salt Road', zone: 'a02',
           table: [{ species: 'shalisk', min: 4, max: 6, weight: 1 },
                   { species: 'salip',   min: 4, max: 6, weight: 1 }] },

    /* A03 is where the two starters you did NOT choose become
       catchable, so no role is locked away by the opening decision.
       Bulburr (F08) and the rest of its deck are Phase 2 — this is the
       Phase 0 slice, so the table holds only forms that exist. */
    a03: { id: 'a03', name: 'Caper Terraces', zone: 'a03',
           table: [{ species: 'wickit',  min: 6, max: 9, weight: 3 },
                   { species: 'capplet', min: 6, max: 9, weight: 3 },
                   { species: 'clinkid', min: 6, max: 9, weight: 2 }] }
  };
  /* the overworld's zone names map onto areas; the seed maps still say
     route1 until they are re-authored as A01-A03 in Tiled */
  const ENCOUNTERS = {};
  for (const k of Object.keys(AREAS)) ENCOUNTERS[k] = AREAS[k].table;

  const TRAINERS = {
    keeper: {
      id: 'keeper', name: 'Pan Keeper Sciberras',
      /* Bell + Cutstone: Clinkid is answered by Shalisk (cutstone beats
         bell), which is exactly the creature the route just gave you.
         The fight is the instrument that asks whether the player will
         use it. */
      team: [{ species: 'clinkid', level: 6 }, { species: 'shalisk', level: 6 }]
    }
  };

  /* SHARED JOURNEY LEVEL. The player has one level; every creature they
     own sits at it, and a fresh catch is set to it and fully healed.
     This is the single most important number in the design: it removes
     the "your new catch is eight levels behind, so you will never use
     it" trap that kills collection loops. Catching is then a pure
     choice about role and matchup. */
  const START_LEVEL = 5;
  const MAX_LEVEL = 50;

  root.DATA = { TYPES, BEATS, STRONG, RESIST, effectiveness, ART,
                EFFECTS, STAGE_MUL, MOVES, ROLES, LEARN_AT, libraryFor,
                SPECIES, STARTERS, AREAS, ENCOUNTERS, TRAINERS,
                START_LEVEL, MAX_LEVEL };

})(typeof window !== 'undefined' ? window : globalThis);
