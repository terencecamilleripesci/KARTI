/* ═══════════════════════════════════════════════════════════════════
   CLASSES — the five playable classes. Pure data + pure helpers.
   Contract lives in CLASSES_SPEC.md; if that file and this one
   disagree, fix this one.

   Spell fields id/name/ap/min/max/los/dmg/cd/hint/aoe/push mean
   EXACTLY what tactics.js's SPELLS mean. Extension fields (elem, pull,
   heal, tp, trap, summon, swap, shield) are defined in the spec §4 and
   implemented at integration time — this file never touches tactics.js.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

window.CLASSES = (function () {

  /* which stat scales which element (spec §1) */
  const STAT_OF_ELEM = { earth: 'str', fire: 'int', water: 'cha', air: 'agi' };

  /* ── formulas (spec §2) ──────────────────────────────────────── */
  /* ── THE XP CURVE, levels 1 to 30 ────────────────────────────────
     There was no curve at all: panels.js carried a hardcoded `level * 100`
     placeholder and nothing ever levelled anyone up, so XP accumulated
     forever and the number on the character sheet meant nothing.

     Shape: xpFor(L) = round(60 * L^1.45). Gentle at the start so the first
     few levels arrive quickly while the player is still learning which end
     of the spell bar to hold, then steepening so 30 is an achievement
     rather than an afternoon. The cap is 200, so the beginner island (1-30)
     is the first stretch of a much longer game, not the whole of it.

     TUNING NOTE for whoever builds the encounters: the curve is the fixed
     thing and MOB XP is the dial. Set each zone's XP so a player following
     the intended route arrives at each zone at roughly the right level —
     then check it by adding up a real route, not by feel. */
  const XP_BASE = 60, XP_POW = 1.45, MAX_LEVEL = 200;

  /* ── SPELL RANKS (Dofus's rule, and the owner's) ──────────────────
     A spell is LEARNED at a level and then RAISED with spell points, one
     point earned per level. Raising to rank R costs R-1 points, so a spell
     taken all the way to 6 costs 1+2+3+4+5 = 15 — the whole reason a build
     is a choice: 199 points over a full career is thirteen maxed spells out
     of a book of twenty, not all of them.

     THE SIXTH POINT NEEDS LEVEL 100. That is the rule as asked for, and it
     is worth keeping literal: rank 6 is not "expensive", it is GATED, so no
     amount of hoarding points buys it early.

     What a rank buys is deliberately plain, because a player has to be able
     to predict it: +12% on the roll per rank, one more tile of range at 3,
     and a turn off the cooldown at 5. */
  const SPELL = {
    MAX_RANK: 6,
    RANK6_LEVEL: 100,
    POINTS_PER_LEVEL: 1,
    DMG_PER_RANK: 0.12,
    /* THE BOOK SIZE IS A BALANCE NUMBER, not decoration. A career pays 199
       points and mastering one spell costs 15, so 13 spells can be maxed.
       A book of 20 therefore cannot be finished — which is the whole point:
       what you raise is the build. At 13 or fewer the points stop being a
       choice and become a formality. */
    BOOK: 20,
    RANGE_AT: 3,
    CD_AT: 5
  };
  /* points EARNED by level 1 -> none; every level after pays one */
  function spellPointsAt(level) {
    return Math.max(0, (Math.min(MAX_LEVEL, level | 0) - 1) * SPELL.POINTS_PER_LEVEL);
  }
  /* what it costs to go from rank-1 to `rank` */
  function rankCost(rank) {
    let n = 0;
    for (let r = 2; r <= rank; r++) n += r - 1;
    return n;
  }
  function maxRankAt(level) {
    return (level | 0) >= SPELL.RANK6_LEVEL ? SPELL.MAX_RANK : SPELL.MAX_RANK - 1;
  }
  /* the spells a character of this level has actually LEARNED. `at` is the
     level the spell arrives; anything without one has been there from the
     start, so an existing character never loses a spell to this. */
  function learned(cls, level) {
    if (!cls) return [];
    return cls.spells.filter(s => (s.at || 1) <= (level | 0));
  }
  /* a spell AS CAST at a given rank. Returns a copy — the class table is
     shared by every character on the device and must never be mutated. */
  function atRank(sp, rank) {
    rank = Math.max(1, Math.min(SPELL.MAX_RANK, rank | 0 || 1));
    if (rank === 1) return sp;
    const k = 1 + SPELL.DMG_PER_RANK * (rank - 1);
    const out = Object.assign({}, sp, { rank });
    const scale = a => [Math.round(a[0] * k), Math.round(a[1] * k)];
    if (Array.isArray(sp.dmg))  out.dmg  = scale(sp.dmg);
    if (Array.isArray(sp.heal)) out.heal = scale(sp.heal);
    if (sp.field && Array.isArray(sp.field.dmg))
      out.field = Object.assign({}, sp.field, { dmg: scale(sp.field.dmg) });
    /* range only for spells that ALREADY have reach. Handing +1 tile to a
       melee spell at rank 3 quietly turns the Warden into a ranged class,
       which is not a buff, it is a different game. */
    if (rank >= SPELL.RANGE_AT && typeof sp.max === 'number' && sp.max > 1)
      out.max = sp.max + 1;
    if (rank >= SPELL.CD_AT && sp.cd) out.cd = Math.max(0, sp.cd - 1);
    return out;
  }

  function xpFor(level) {                    /* to go from `level` to +1  */
    const L = Math.max(1, level | 0);
    return L >= MAX_LEVEL ? Infinity : Math.round(XP_BASE * Math.pow(L, XP_POW));
  }
  function xpTotal(level) {                  /* cumulative, 1 -> `level` */
    let t = 0;
    for (let L = 1; L < Math.max(1, level | 0); L++) t += xpFor(L);
    return t;
  }

  function maxHp(cls, stats, level) {
    return cls.base.hp + (stats.vit | 0) + cls.growth.hp * (Math.max(1, level | 0) - 1);
  }
  function initiative(s) {
    return Math.floor((s.vit | 0) / 4) + (s.wis | 0) + (s.str | 0) +
           (s.int | 0) + (s.cha | 0) + (s.agi | 0);
  }
  function dodgeChance(myAgi, theirAgi) {
    return Math.max(10, Math.min(90, 50 + 2 * ((myAgi | 0) - (theirAgi | 0))));
  }
  function scaleDamage(roll, sp, stats) {
    const st = sp && sp.elem ? STAT_OF_ELEM[sp.elem] : null;
    return st ? Math.round(roll * (1 + (stats[st] | 0) / 100)) : roll;
  }
  /* HEALS SCALE OFF INTELLIGENCE, the way they do in Dofus. This read `cha`,
     which conflated two different jobs: Chance is PROSPECTING — how much loot
     falls out of a thing you killed (see GEAR.prospect) — and Intelligence is
     what makes a heal land harder. Wearing +chance gear was quietly making a
     Tidebinder a better healer while doing nothing for her loot. */
  function scaleHeal(roll, stats) {
    return Math.round(roll * (1 + ((stats.int | 0)) / 100));
  }

  /* PROSPECTING, also from Dofus: Chance is the stat that decides how often
     something drops. 100 chance doubles the base rate; it is deliberately
     linear and capped, because a stat that multiplies drops without limit
     turns every other stat into a mistake. */
  function prospect(stats) {
    const cha = Math.max(0, (stats && stats.cha) | 0);
    return Math.min(3, 1 + cha / 100);
  }

  /* ── summons (spec §5.5) — reuses the existing sheep art ─────── */
  const SUMMONS = {
    ram: {
      id: 'ram', name: 'Ram', hp: 40, ap: 4, mp: 4,
      sheet: 'sheep',                    /* art/sheep-sheet.png + sheep-dir8.png */
      actsAfterOwner: true, maxAlivePerCaster: 1,
      spells: [
        { id: 'ramhorn', name: 'Ram', ap: 3, min: 1, max: 1, los: false,
          dmg: [8, 12], cd: 0, elem: 'earth', scalesOffOwner: true,
          hint: 'The flock defends its own.' }
      ]
    },
    /* THE BABY SCUBI — small, quick, and it drains like its mother. It is a
       body between her and the fight as much as a source of damage: she is
       the frailest thing on the board until she has hit something. */
    scublet: {
      id: 'scublet', name: 'Scublet', hp: 34, ap: 4, mp: 4,
      sheet: 'scublet',                  /* art/scublet-sheet.png + -dir8.png */
      actsAfterOwner: true, maxAlivePerCaster: 1,
      spells: [
        { id: 'nip', name: 'Nip', ap: 3, min: 1, max: 1, los: false,
          dmg: [7, 11], cd: 0, elem: 'water', scalesOffOwner: true,
          drain: 0.5,
          hint: 'It bites, and it keeps half of what it takes.' }
      ]
    }
  };

  /* ── the five classes (spec §3, §5, §7) ──────────────────────── */
  const LIST = [

    { id: 'warden', cloth: '#6E7A63', name: 'Warden', element: 'earth', secondary: null,
      role: 'melee bruiser',
      tagline: 'The wall that walks.',
      desc: 'Slowest to act, hardest to kill. Drags enemies into reach and breaks them there.',
      base: { hp: 95, ap: 6, mp: 3 },
      growth: { hp: 6, statPoints: 5, suggest: ['str', 'vit'], apAt: [10, 100], mpAt: [20, 200] },
      stats: { vit: 20, wis: 2, str: 14, int: 0, cha: 0, agi: 4 },
      spells: [
        { id: 'maul', name: 'Stonemaul', ap: 3, min: 1, max: 1, los: false,
          dmg: [16, 22], cd: 0, elem: 'earth',
          hint: 'Next to you. Cheap, certain, twice a turn.' },
        { id: 'rootgrasp', name: 'Rootgrasp', ap: 2, min: 2, max: 4, los: true,
          dmg: [4, 7], cd: 2, elem: 'earth', pull: 3,
          hint: 'Stone hands drag them toward you. Then hit them.' },
        { id: 'quake', name: 'Fault Line', ap: 4, min: 1, max: 3, los: true,
          dmg: [12, 16], cd: 2, elem: 'earth', aoe: 1,
          hint: 'Cracks the target tile and everything beside it.' },
        { id: 'crush', name: 'Crag Crush', ap: 5, min: 1, max: 1, los: false,
          dmg: [26, 34], cd: 2, elem: 'earth',
          hint: 'The whole turn in one swing.' },
        { id: 'bulwark', name: 'Bulwark', ap: 2, min: 0, max: 0, los: false,
          cd: 3, elem: 'earth', shield: [10, 14],
          hint: 'Brace. Absorbs damage until your next turn.' },
        /* ── learned on the way up ─────────────────────────────────
           Fifteen more, so the book reaches twenty and the spell points
           become a build rather than a formality (199 points masters
           thirteen). Every one uses a verb the engine ALREADY has —
           push, pull, shield, field, trap, tp, apLoss, aoe — because a
           spell that needs new combat code is a spell that ships broken,
           and there are ninety-four of these to write.

           The Warden is the wall that walks: he has no ranged game to
           speak of and should not grow one. Gravelshot and Boulder are
           deliberately his only real reach, both weak for their cost —
           what he gets instead is ways to CLOSE (Grapnel), to stop them
           leaving (Sunder), and to be immovable when he arrives. */
        { id: 'gravelshot', name: 'Gravelshot', at: 3, ap: 3, min: 2, max: 4,
          los: true, dmg: [7, 10], cd: 0, elem: 'earth',
          hint: 'A fistful of scree. Weak — he is not an archer.' },
        { id: 'shoulder', name: 'Shoulder', at: 6, ap: 2, min: 1, max: 1,
          los: false, dmg: [9, 12], cd: 1, elem: 'earth', push: 2,
          hint: 'Puts his weight through them. They give ground.' },
        { id: 'tremor', name: 'Tremor', at: 9, ap: 3, min: 1, max: 3,
          los: true, dmg: [9, 13], cd: 3, elem: 'earth', aoe: 1, apLoss: 1,
          hint: 'The ground kicks. Hard to keep your feet, harder to act.' },
        { id: 'ironroot', name: 'Ironroot', at: 13, ap: 3, min: 0, max: 0,
          los: false, cd: 4, elem: 'earth', shield: [18, 24],
          hint: 'Brace deeper. Costs a turn you wanted to swing with.' },
        { id: 'boulder', name: 'Boulder', at: 17, ap: 4, min: 3, max: 6,
          los: true, dmg: [18, 24], cd: 2, elem: 'earth',
          hint: 'He picks up something enormous and throws it.' },
        { id: 'grapnel', name: 'Grapnel', at: 22, ap: 2, min: 3, max: 7,
          los: true, dmg: [5, 8], cd: 3, elem: 'earth', pull: 4,
          hint: 'Reaches further than Rootgrasp and drags harder.' },
        { id: 'fissure', name: 'Fissure', at: 27, ap: 4, min: 1, max: 4,
          los: true, cd: 4, elem: 'earth',
          field: { dmg: [9, 13], aoe: 1, turns: 3 },
          hint: 'Splits the ground. It keeps splitting for three turns.' },
        { id: 'millstone', name: 'Millstone', at: 33, ap: 5, min: 1, max: 1,
          los: false, dmg: [30, 38], cd: 3, elem: 'earth',
          hint: 'Both hands, all his weight, once.' },
        { id: 'rockfall', name: 'Rockfall', at: 39, ap: 5, min: 2, max: 5,
          los: true, dmg: [16, 22], cd: 4, elem: 'earth', aoe: 2,
          hint: 'Brings the cliff down on five tiles at once.' },
        { id: 'sunder', name: 'Sunder', at: 45, ap: 3, min: 1, max: 1,
          los: false, dmg: [14, 19], cd: 2, elem: 'earth', apLoss: 1,
          hint: 'Breaks the guard. What they meant to cast, they do not.' },
        { id: 'landslide', name: 'Landslide', at: 52, ap: 5, min: 1, max: 4,
          los: true, dmg: [15, 20], cd: 4, elem: 'earth', aoe: 1, push: 3,
          hint: 'Sweeps the tile and everything beside it three tiles back.' },
        { id: 'earthenstep', name: 'Earthen Step', at: 60, ap: 2, min: 1, max: 4,
          los: false, cd: 3, elem: 'earth', tp: true,
          hint: 'Steps through the stone instead of round it.' },
        { id: 'cairn', name: 'Cairn', at: 70, ap: 4, min: 1, max: 3,
          los: false, cd: 4, elem: 'earth', trap: { dmg: [26, 34], aoe: 1 },
          hint: 'A stack of stones on an empty tile. It falls on whoever comes.' },
        { id: 'bedrock', name: 'Bedrock', at: 85, ap: 3, min: 0, max: 0,
          los: false, cd: 5, elem: 'earth', shield: [34, 44],
          hint: 'The wall stops walking and simply is a wall.' },
        { id: 'tectonic', name: 'Tectonic', at: 100, ap: 6, min: 1, max: 5,
          los: true, dmg: [34, 44], cd: 5, elem: 'earth', aoe: 2,
          hint: 'The island moves. Everything within two tiles goes down.' }
      ],
      look: {
        m: { sheet: 'warden-m',
             hook: 'Tower shield as tall as his shoulders, stone maul over the shoulder, horned flat-top great helm — a shield with legs.',
             palette: ['#6b7280', '#5a7d4a', '#3a3f4a', '#f2e6c8'] },
        f: { sheet: 'warden-f',
             hook: 'No shield: oversized twin stone gauntlets, huge round pauldrons, buckler disc on her back, war-braid — shoulders-and-fists.',
             palette: ['#6b7280', '#5a7d4a', '#3a3f4a', '#f2e6c8'] }
      } },

    { id: 'stormfletch', cloth: '#C9D2BC', name: 'Stormfletch', element: 'air', secondary: null,
      role: 'ranged attacker',
      tagline: 'Never where the arrow came from.',
      desc: 'Longest reach in the game and fragile up close. Keeping space is the whole class.',
      base: { hp: 82, ap: 6, mp: 3 },
      growth: { hp: 4, statPoints: 5, suggest: ['agi', 'vit'], apAt: [10, 100], mpAt: [20, 200] },
      stats: { vit: 8, wis: 4, str: 4, int: 0, cha: 0, agi: 24 },
      spells: [
        { id: 'dart', name: 'Gale Dart', ap: 3, min: 2, max: 6, los: true,
          dmg: [12, 17], cd: 0, elem: 'air',
          hint: 'Needs 2 tiles of space and a clear line. Twice a turn.' },
        { id: 'pierce', name: 'Spiral Pierce', ap: 4, min: 3, max: 8, los: true,
          dmg: [19, 26], cd: 1, elem: 'air',
          hint: 'The long shot. Useless if they close on you.' },
        { id: 'gust', name: 'Gustshot', ap: 3, min: 1, max: 4, los: true,
          dmg: [7, 10], cd: 1, elem: 'air', push: 2,
          hint: 'Blows them back. Into a wall, it hurts more.' },
        { id: 'windstep', name: 'Wind Step', ap: 2, min: 1, max: 3, los: false,
          cd: 3, elem: 'air', tp: true,
          hint: 'Vanish to an empty tile — walls don\'t matter.' },
        /* ── learned on the way up ─────────────────────────────────
           She is never where the arrow came from, so her sixteen are REACH
           and distance-keeping: the longest ranges in the game, a second
           blink, a pull that repositions THEM, and shields that are only
           wind holding still. Her area work stays thin — gusts, not the
           Cindermancer's furnaces. */
        { id: 'splitshot', name: 'Splitshot', at: 3, ap: 3, min: 2, max: 5,
          los: true, dmg: [9, 13], cd: 1, elem: 'air', aoe: 1,
          hint: 'One draw, three arrows. Thin, but it covers ground.' },
        { id: 'hook', name: 'Hook Shot', at: 6, ap: 2, min: 3, max: 6,
          los: true, dmg: [5, 8], cd: 2, elem: 'air', pull: 2,
          hint: 'Drags them two tiles closer to something worse.' },
        { id: 'updraft', name: 'Updraft', at: 9, ap: 2, min: 0, max: 0,
          los: false, cd: 3, elem: 'air', shield: [12, 16],
          hint: 'Wind held still around her. Not armour; enough.' },
        { id: 'keening', name: 'Keening', at: 13, ap: 3, min: 2, max: 6,
          los: true, dmg: [10, 14], cd: 3, elem: 'air', apLoss: 1,
          hint: 'Takes their breath, and an action with it.' },
        /* stronger than Pierce, which it is learned nine levels after, but
           it reaches a tile less far and rests a turn longer — checkspells
           caught the first version being beaten by Pierce on every axis at
           once, which makes reaching level 17 feel like nothing happened. */
        { id: 'volley', name: 'Volley', at: 17, ap: 4, min: 3, max: 7,
          los: true, dmg: [22, 29], cd: 2, elem: 'air',
          hint: 'Four in the air before the first one lands.' },
        { id: 'tripwire', name: 'Tripwire', at: 22, ap: 3, min: 1, max: 4,
          los: false, cd: 3, elem: 'air', trap: { dmg: [20, 28], aoe: 1 },
          hint: 'A line at ankle height, on a tile they have to cross.' },
        { id: 'cyclone', name: 'Cyclone', at: 27, ap: 4, min: 2, max: 5,
          los: true, dmg: [13, 18], cd: 3, elem: 'air', aoe: 1, push: 2,
          hint: 'Turns them, then throws them two tiles out.' },
        { id: 'longshot', name: 'Longshot', at: 33, ap: 4, min: 5, max: 10,
          los: true, dmg: [20, 27], cd: 2, elem: 'air',
          hint: 'Ten tiles. Nothing else in the game reaches this far.' },
        { id: 'stormfield', name: 'Stormfield', at: 39, ap: 4, min: 1, max: 4,
          los: true, cd: 4, elem: 'air',
          field: { dmg: [8, 12], aoe: 1, turns: 3 },
          hint: 'Cutting air over five tiles, for three turns.' },
        { id: 'shear', name: 'Shear', at: 45, ap: 3, min: 1, max: 1,
          los: false, dmg: [17, 23], cd: 2, elem: 'air', push: 3,
          hint: 'Point blank — and then they are three tiles away.' },
        { id: 'skydance', name: 'Skydance', at: 52, ap: 2, min: 1, max: 5,
          los: false, cd: 2, elem: 'air', tp: true,
          hint: 'Wind Step, further and oftener.' },
        { id: 'pinion', name: 'Pinion', at: 60, ap: 4, min: 2, max: 8,
          los: true, dmg: [18, 25], cd: 3, elem: 'air', apLoss: 1,
          hint: 'Pins the arm. The spell they meant to cast does not come.' },
        { id: 'galeburst', name: 'Galeburst', at: 70, ap: 5, min: 2, max: 6,
          los: true, dmg: [19, 26], cd: 4, elem: 'air', aoe: 2,
          hint: 'Everything within two tiles goes over.' },
        { id: 'tailwind', name: 'Tailwind', at: 80, ap: 2, min: 0, max: 0,
          los: false, cd: 4, elem: 'air', shield: [24, 32],
          hint: 'The air at her back, holding.' },
        { id: 'rake', name: 'Raking Fire', at: 90, ap: 5, min: 3, max: 9,
          los: true, dmg: [28, 37], cd: 3, elem: 'air',
          hint: 'She empties the quiver down one line.' },
        { id: 'tempest', name: 'Tempest', at: 100, ap: 6, min: 2, max: 6,
          los: true, dmg: [30, 40], cd: 5, elem: 'air', aoe: 2, push: 2,
          hint: 'The sky comes down. Nothing standing stays standing.' }
      ],
      look: {
        m: { sheet: 'stormfletch-m',
             hook: 'Recurve longbow taller than he is, grounded like a staff; deep hood with one long orange feather, half-cape — the vertical line.',
             palette: ['#2fa6a0', '#8f9bab', '#f4f7f7', '#e8622d'] },
        f: { sheet: 'stormfletch-f',
             hook: 'Bow carried ACROSS the shoulders, wrists hooked over it; windsock ponytail streaming sideways, wind-wrap skirt — the horizontal bar.',
             palette: ['#2fa6a0', '#8f9bab', '#f4f7f7', '#e8622d'] }
      } },

    { id: 'cindermancer', cloth: '#7A6A62', name: 'Cindermancer', element: 'fire', secondary: null,
      role: 'area caster',
      tagline: 'The ground itself is a weapon.',
      desc: 'Weakest HP in the game and worth it: hits groups, and owns tiles before anyone stands on them.',
      base: { hp: 78, ap: 6, mp: 3 },
      growth: { hp: 4, statPoints: 5, suggest: ['int', 'wis'], apAt: [10, 100], mpAt: [20, 200] },
      stats: { vit: 7, wis: 6, str: 0, int: 24, cha: 0, agi: 3 },
      spells: [
        { id: 'cinder', name: 'Cinder Bolt', ap: 3, min: 2, max: 5, los: true,
          dmg: [13, 18], cd: 0, elem: 'fire',
          hint: 'The bread-and-butter ember. Twice a turn.' },
        { id: 'pyre', name: 'Pyre Burst', ap: 5, min: 2, max: 4, los: true,
          dmg: [15, 21], cd: 2, elem: 'fire', aoe: 1,
          hint: 'Hits the target and everything beside it.' },
        { id: 'snare', name: 'Ember Snare', ap: 3, min: 1, max: 4, los: false,
          cd: 3, elem: 'fire', trap: { dmg: [18, 26], aoe: 1 },
          hint: 'Lob a mine onto an empty tile. First to step there burns.' },
        { id: 'flashburn', name: 'Flashburn', ap: 2, min: 1, max: 1, los: false,
          dmg: [8, 12], cd: 1, elem: 'fire', push: 1,
          hint: 'Point-blank flash. Buys you one tile of air.' },
        /* ── learned on the way up ─────────────────────────────────
           The ground itself is the weapon, so his sixteen lean on the TILE
           rather than the target: two more fields, a heavier mine, the widest
           areas in the game. His single-target damage stays behind the
           Warden's on purpose — he is paid in coverage, not in blows. */
        { id: 'spark', name: 'Spark', at: 3, ap: 2, min: 2, max: 4,
          los: true, dmg: [8, 11], cd: 0, elem: 'fire',
          hint: 'Cheap and endless. Fills the turns the big ones cool.' },
        { id: 'scorch', name: 'Scorch', at: 6, ap: 3, min: 1, max: 3,
          los: true, dmg: [11, 15], cd: 2, elem: 'fire', aoe: 1,
          hint: 'A close burst, for when they have crowded him.' },
        { id: 'emberveil', name: 'Emberveil', at: 9, ap: 2, min: 0, max: 0,
          los: false, cd: 3, elem: 'fire', shield: [11, 15],
          hint: 'Heat haze. The thinnest shield in the game, and the cheapest.' },
        { id: 'cinderfield', name: 'Cinderfield', at: 13, ap: 4, min: 1, max: 4,
          los: true, cd: 4, elem: 'fire',
          field: { dmg: [9, 13], aoe: 1, turns: 3 },
          hint: 'Ground that goes on burning for three turns.' },
        { id: 'blaze', name: 'Blaze', at: 17, ap: 4, min: 2, max: 5,
          los: true, dmg: [17, 23], cd: 1, elem: 'fire',
          hint: 'His one honest single-target spell.' },
        { id: 'backdraft', name: 'Backdraft', at: 22, ap: 3, min: 1, max: 2,
          los: true, dmg: [12, 16], cd: 2, elem: 'fire', push: 3,
          hint: 'Blows them three tiles clear. Room to work.' },
        { id: 'firemine', name: 'Firemine', at: 27, ap: 4, min: 1, max: 5,
          los: false, cd: 4, elem: 'fire', trap: { dmg: [26, 34], aoe: 1 },
          hint: 'A heavier snare, thrown further.' },
        { id: 'conflagrate', name: 'Conflagrate', at: 33, ap: 5, min: 2, max: 5,
          los: true, dmg: [18, 24], cd: 3, elem: 'fire', aoe: 2,
          hint: 'Two tiles in every direction catch.' },
        { id: 'drawflame', name: 'Drawflame', at: 39, ap: 2, min: 3, max: 6,
          los: true, dmg: [6, 9], cd: 3, elem: 'fire', pull: 3,
          hint: 'Pulls them onto whatever he has already lit.' },
        { id: 'immolate', name: 'Immolate', at: 45, ap: 4, min: 1, max: 4,
          los: true, dmg: [20, 27], cd: 3, elem: 'fire', apLoss: 1,
          hint: 'Burning is distracting. They act one time fewer.' },
        { id: 'emberstep', name: 'Emberstep', at: 52, ap: 2, min: 1, max: 5,
          los: false, cd: 3, elem: 'fire', tp: true,
          hint: 'Out of his own fire, which is usually where he is.' },
        { id: 'pyroclasm', name: 'Pyroclasm', at: 60, ap: 5, min: 2, max: 6,
          los: true, dmg: [22, 30], cd: 3, elem: 'fire', aoe: 1,
          hint: 'The shape of Pyre, grown up.' },
        { id: 'ashfall', name: 'Ashfall', at: 70, ap: 4, min: 1, max: 5,
          los: true, cd: 5, elem: 'fire',
          field: { dmg: [13, 18], aoe: 2, turns: 3 },
          hint: 'Thirteen tiles of falling ash, for three turns.' },
        { id: 'forgeheart', name: 'Forgeheart', at: 80, ap: 3, min: 0, max: 0,
          los: false, cd: 4, elem: 'fire', shield: [26, 34],
          hint: 'He banks the fire inward instead of throwing it.' },
        { id: 'wildfire', name: 'Wildfire', at: 90, ap: 5, min: 2, max: 6,
          los: true, dmg: [26, 35], cd: 4, elem: 'fire', aoe: 2, push: 1,
          hint: 'It spreads, and it shoves.' },
        { id: 'sunfall', name: 'Sunfall', at: 100, ap: 6, min: 2, max: 5,
          los: true, dmg: [34, 45], cd: 5, elem: 'fire', aoe: 2,
          hint: 'He brings a piece of the sun down onto the board.' }
      ],
      look: {
        m: { sheet: 'cindermancer-m',
             hook: 'Ragged ankle-length robe flaring to a cone, wide pointed hat, staff topped with a caged glowing ember — the cone and the lantern.',
             palette: ['#e8622d', '#9a938c', '#2e2a28', '#f2c14e'] },
        f: { sheet: 'cindermancer-f',
             hook: 'No hat: twin high buns trailing smoke, a swinging ember censer chained in EACH hand, off-shoulder ash cloak — the chains.',
             palette: ['#e8622d', '#9a938c', '#2e2a28', '#f2c14e'] }
      } },

    { id: 'tidebinder', cloth: '#8FA9B8', name: 'Tidebinder', element: 'water', secondary: null,
      role: 'support / healer',
      tagline: 'The tide takes, the tide gives back.',
      desc: 'Middling damage, the only healing in the game, and a wave to keep bruisers off your back.',
      base: { hp: 85, ap: 6, mp: 3 },
      growth: { hp: 5, statPoints: 5, suggest: ['cha', 'vit'], apAt: [10, 100], mpAt: [20, 200] },
      stats: { vit: 12, wis: 6, str: 0, int: 0, cha: 22, agi: 0 },
      spells: [
        { id: 'lash', name: 'Tide Lash', ap: 3, min: 1, max: 4, los: true,
          dmg: [11, 15], cd: 0, elem: 'water',
          hint: 'A whip of water. Reliable at any range you hold.' },
        { id: 'mend', name: 'Mending Spring', ap: 3, min: 0, max: 4, los: true,
          cd: 1, elem: 'water', heal: [16, 22],
          hint: 'Restores a unit — yourself included.' },
        { id: 'wavebreak', name: 'Wavebreak', ap: 2, min: 1, max: 3, los: true,
          dmg: [6, 9], cd: 1, elem: 'water', push: 2,
          hint: 'A breaker. Knocks them back; walls hurt.' },
        { id: 'blessing', name: 'Spring Blessing', ap: 4, min: 0, max: 3, los: true,
          cd: 3, elem: 'water', heal: [10, 14], aoe: 1,
          hint: 'Heals the target and every friend beside it.' },
        /* ── learned on the way up ─────────────────────────────────
           The tide takes and gives back, so hers is the only book with
           heals all the way up it — and the only one outside the Scubi
           that drains. Her damage is the lowest in the game per point of
           AP; what she buys instead is that a party does not die. */
        { id: 'spray', name: 'Spray', at: 3, ap: 2, min: 1, max: 4,
          los: true, dmg: [7, 10], cd: 0, elem: 'water',
          hint: 'Small and constant. Something to do while mending.' },
        { id: 'tidewall', name: 'Tidewall', at: 6, ap: 3, min: 0, max: 0,
          los: false, cd: 3, elem: 'water', shield: [14, 19],
          hint: 'Water standing up. It comes down when she does.' },
        { id: 'riptide', name: 'Riptide', at: 9, ap: 3, min: 2, max: 5,
          los: true, dmg: [9, 13], cd: 2, elem: 'water', pull: 3,
          hint: 'Drags them three tiles out of wherever they wanted to be.' },
        { id: 'wellspring', name: 'Wellspring', at: 13, ap: 3, min: 0, max: 5,
          los: true, cd: 2, elem: 'water', heal: [20, 27],
          hint: 'Deeper than Mending Spring, and it reaches further.' },
        { id: 'brine', name: 'Brine', at: 17, ap: 4, min: 1, max: 5,
          los: true, dmg: [15, 20], cd: 2, elem: 'water', drain: 1,
          hint: 'Salt takes the water out of them and puts it in her.' },
        { id: 'swell', name: 'Swell', at: 22, ap: 3, min: 1, max: 3,
          los: true, dmg: [10, 14], cd: 3, elem: 'water', aoe: 1, push: 2,
          hint: 'Lifts everything beside it and sets it down further away.' },
        { id: 'saltmire', name: 'Saltmire', at: 27, ap: 4, min: 1, max: 4,
          los: true, cd: 4, elem: 'water',
          field: { dmg: [8, 12], aoe: 1, turns: 3 },
          hint: 'Ground that will not let go, for three turns.' },
        { id: 'deepmend', name: 'Deep Mending', at: 33, ap: 4, min: 0, max: 4,
          los: true, cd: 3, elem: 'water', heal: [28, 38], aoe: 1,
          hint: 'The whole party, if they have the sense to stand together.' },
        { id: 'chill', name: 'Chill', at: 39, ap: 3, min: 2, max: 5,
          los: true, dmg: [12, 17], cd: 3, elem: 'water', apLoss: 1,
          hint: 'Cold hands. One action fewer this turn.' },
        { id: 'tidestep', name: 'Tidestep', at: 45, ap: 2, min: 1, max: 4,
          los: false, cd: 3, elem: 'water', tp: true,
          hint: 'Out of reach, which is where a healer belongs.' },
        { id: 'breaker', name: 'Breaker', at: 52, ap: 5, min: 1, max: 4,
          los: true, dmg: [22, 30], cd: 3, elem: 'water', aoe: 1,
          hint: 'Her one real blow, and it costs her a whole turn.' },
        { id: 'lifetide', name: 'Lifetide', at: 60, ap: 3, min: 0, max: 6,
          los: true, cd: 3, elem: 'water', heal: [24, 32],
          hint: 'Six tiles. She can mend someone she cannot reach.' },
        { id: 'maelstrom', name: 'Maelstrom', at: 70, ap: 5, min: 2, max: 5,
          los: true, dmg: [20, 27], cd: 4, elem: 'water', aoe: 2, pull: 2,
          hint: 'Drags everything within two tiles toward the middle.' },
        { id: 'aegis', name: 'Aegis', at: 80, ap: 3, min: 0, max: 0,
          los: false, cd: 4, elem: 'water', shield: [28, 36],
          hint: 'The tide, held. It does not break while she stands.' },
        { id: 'sanctuary', name: 'Sanctuary', at: 90, ap: 5, min: 0, max: 4,
          los: true, cd: 4, elem: 'water', heal: [34, 46], aoe: 2,
          hint: 'Thirteen tiles of mending. The reason to bring her.' },
        { id: 'fullmoon', name: 'Full Moon', at: 100, ap: 6, min: 1, max: 6,
          los: true, dmg: [30, 40], cd: 5, elem: 'water', aoe: 2, drain: 1,
          hint: 'The tide comes all the way in, and goes out heavier.' }
      ],
      look: {
        m: { sheet: 'tidebinder-m',
             hook: 'Big round water gourd humped high on his back, short three-tine trident, bald with a kelp brow-band — the dome.',
             palette: ['#2b5d8f', '#7fd4c1', '#e8837a', '#f2e6c8'] },
        f: { sheet: 'tidebinder-f',
             hook: 'Tall coral wand ending in an open ring at head height, waist-long wave-cut hair in one smooth mass, zigzag wave hem — the ring on a stick.',
             palette: ['#2b5d8f', '#7fd4c1', '#e8837a', '#f2e6c8'] }
      } },

    { id: 'shepherd', cloth: '#CBBE9E', name: 'Shepherd', element: 'earth', secondary: 'air',
      role: 'summoner',
      tagline: 'You are never fighting one of them.',
      desc: 'Fights through the flock: a summoned ram that flanks, blocks and eats hits. An elder of this class summoned YOU into the world.',
      base: { hp: 80, ap: 6, mp: 3 },
      growth: { hp: 5, statPoints: 5, suggest: ['str', 'vit'], apAt: [10, 100], mpAt: [20, 200] },
      stats: { vit: 10, wis: 6, str: 16, int: 0, cha: 0, agi: 8 },
      spells: [
        { id: 'crook', name: 'Crook Strike', ap: 3, min: 1, max: 2, los: true,
          dmg: [12, 17], cd: 0, elem: 'earth',
          hint: 'The crook reaches a tile further than a sword.' },
        { id: 'callram', name: 'Call Ram', ap: 4, min: 1, max: 2, los: false,
          cd: 4, summon: 'ram',
          hint: 'Calls a ram to an empty tile within 2 of you. One at a time.' },
        { id: 'whistle', name: 'Shrill Whistle', ap: 2, min: 1, max: 6, los: false,
          dmg: [6, 9], cd: 1, elem: 'air',
          hint: 'Sound carries — the only strike that ignores walls.' },
        { id: 'flockmate', name: 'Flockmate', ap: 2, min: 1, max: 4, los: true,
          cd: 3, swap: true,
          hint: 'Trade places with your ram or an ally.' },
        /* ── learned on the way up ─────────────────────────────────
           You are never fighting one of him, so his sixteen are about the
           BOARD: pulls and pushes that put things where the ram already
           is, a pen to hold them there, and a heal because a flock has to
           be kept. He gets one ram and never a second — the spec's rule,
           and what stops him being two characters. */
        { id: 'sling', name: 'Sling', at: 3, ap: 2, min: 2, max: 5,
          los: true, dmg: [8, 11], cd: 0, elem: 'earth',
          hint: 'A stone and a leather cord. It does the job.' },
        { id: 'goad', name: 'Goad', at: 6, ap: 2, min: 2, max: 6,
          los: true, dmg: [5, 8], cd: 2, elem: 'earth', pull: 3,
          hint: 'Brings them three tiles nearer the horns.' },
        { id: 'fleece', name: 'Fleece', at: 9, ap: 3, min: 0, max: 0,
          los: false, cd: 3, elem: 'earth', shield: [13, 17],
          hint: 'Wool and hide. Unglamorous and it works.' },
        { id: 'hookcrook', name: 'Hooked Crook', at: 13, ap: 3, min: 1, max: 2,
          los: false, dmg: [14, 19], cd: 2, elem: 'earth', apLoss: 1,
          hint: 'Catches the arm. They do one thing fewer.' },
        { id: 'stampede', name: 'Stampede', at: 17, ap: 4, min: 1, max: 4,
          los: true, dmg: [15, 20], cd: 3, elem: 'earth', aoe: 1, push: 2,
          hint: 'The flock goes through. Everything moves.' },
        { id: 'pen', name: 'Pen', at: 22, ap: 3, min: 1, max: 4,
          los: false, cd: 3, elem: 'earth', trap: { dmg: [22, 30], aoe: 1 },
          hint: 'Hurdles on an empty tile. Whoever enters regrets it.' },
        { id: 'droverstep', name: "Drover's Step", at: 27, ap: 2, min: 1, max: 4,
          los: false, cd: 3, elem: 'earth', tp: true,
          hint: 'To the far side of the flock, in one stride.' },
        { id: 'cudgel', name: 'Cudgel', at: 33, ap: 4, min: 1, max: 2,
          los: false, dmg: [22, 29], cd: 2, elem: 'earth',
          hint: 'The heavy end of the crook.' },
        { id: 'saltlick', name: 'Salt Lick', at: 39, ap: 4, min: 0, max: 4,
          los: true, cd: 3, elem: 'earth', heal: [22, 30],
          hint: 'He tends what he brought. The ram counts.' },
        { id: 'dogwhistle', name: 'Dog Whistle', at: 45, ap: 3, min: 1, max: 6,
          los: true, dmg: [13, 18], cd: 3, elem: 'earth', apLoss: 1,
          hint: 'A note under hearing. It stops them mid-thought.' },
        { id: 'furrow', name: 'Furrow', at: 52, ap: 4, min: 1, max: 4,
          los: true, cd: 4, elem: 'earth',
          field: { dmg: [10, 14], aoe: 1, turns: 3 },
          hint: 'Broken ground nobody crosses twice.' },
        { id: 'herd', name: 'Herd', at: 60, ap: 4, min: 1, max: 5,
          los: true, dmg: [16, 22], cd: 4, elem: 'earth', aoe: 2, push: 2,
          hint: 'Two tiles of them, moved where he wants them.' },
        { id: 'yoke', name: 'Yoke', at: 70, ap: 3, min: 2, max: 5,
          los: true, dmg: [12, 16], cd: 3, elem: 'earth', pull: 4,
          hint: 'Four tiles. Whatever they were doing, they are here now.' },
        { id: 'hardhide', name: 'Hardhide', at: 80, ap: 3, min: 0, max: 0,
          los: false, cd: 4, elem: 'earth', shield: [26, 34],
          hint: 'Years of weather, worn as armour.' },
        { id: 'trample', name: 'Trample', at: 90, ap: 5, min: 1, max: 3,
          los: true, dmg: [28, 37], cd: 3, elem: 'earth', aoe: 1,
          hint: 'What a flock does to whatever is in the way.' },
        { id: 'thefold', name: 'The Fold', at: 100, ap: 6, min: 1, max: 5,
          los: true, dmg: [30, 40], cd: 5, elem: 'earth', aoe: 2, apLoss: 1,
          hint: 'Everything comes in. Nothing gets to act about it.' }
      ],
      look: {
        m: { sheet: 'shepherd-m',
             hook: 'Long crook curling above head height like a question mark, floppy wide-brim hat, cloud-lumpy fleece mantle bulking the shoulders.',
             palette: ['#f2e6c8', '#7a4a2b', '#5a7d4a', '#e8622d'] },
        f: { sheet: 'shepherd-f',
             hook: 'No hat: ram-horn headdress curling at each temple, crook slung across the back, fleece-trim poncho with a diamond hem.',
             palette: ['#f2e6c8', '#7a4a2b', '#5a7d4a', '#e8622d'] }
      } },

    /* ── SCUBI — admin, and female only ───────────────────────────────
       Not one of the five. She exists for the owner to test with, is hidden
       from the picker unless `adminOnly` passes (see visible()), and has no
       male form — `look` carries only `f`, so anything reading look[gender]
       must go through this class's own guard rather than assume both exist.

       She is the only class that heals by hurting. Every point she takes off
       something else comes back to her, which makes her unkillable in a crowd
       and the frailest thing on the board the moment she misses. The five
       spells are five different verbs on purpose — drain, drag, bleed,
       summon, blink — because a kit of five damage spells is one spell with
       five names. */
    { id: 'scubi', cloth: '#7A2E3F', name: 'Scubi', element: 'water',
      secondary: null, adminOnly: true, femaleOnly: true,
      role: 'drain caster',
      tagline: 'She leaves lighter than she arrived.',
      desc: 'Heals by taking. Fragile alone, unkillable in a crowd — every point she deals comes back.',
      base: { hp: 88, ap: 6, mp: 3 },
      growth: { hp: 5, statPoints: 5, suggest: ['cha', 'int'], apAt: [10, 100], mpAt: [20, 200] },
      /* leans cha (her element, and prospecting) and int (heal power) */
      stats: { vit: 12, wis: 4, str: 0, int: 12, cha: 18, agi: 6 },
      spells: [
        { id: 'siphon', name: 'Siphon', ap: 3, min: 1, max: 5, los: true,
          dmg: [14, 20], cd: 0, elem: 'water', drain: 1,
          hint: 'Every point you take off them, you keep.' },
        { id: 'leash', name: 'Leash', ap: 2, min: 3, max: 6, los: true,
          dmg: [4, 6], cd: 1, elem: 'water', pull: 3, drain: 1, apLoss: 1,
          hint: 'Drags them three tiles in and takes an action off them.' },
        { id: 'hemorrhage', name: 'Hemorrhage', ap: 4, min: 1, max: 4, los: true,
          cd: 3, elem: 'water',
          field: { dmg: [10, 14], aoe: 1, turns: 3, drain: 1 },
          hint: 'Bleeding ground, five tiles wide. It pays you on each of your next three turns.' },
        { id: 'scion', name: 'Scion', ap: 4, min: 1, max: 2, los: false,
          cd: 4, elem: 'water', summon: 'scublet',
          hint: 'A scublet of your own blood. It bites, and it drains too.' },
        { id: 'bloodstep', name: 'Bloodstep', ap: 2, min: 1, max: 6, los: false,
          cd: 2, elem: 'water', tp: true,
          hint: 'Blink six tiles. Walls do not matter; that is the escape.' },
        /* ── learned on the way up ─────────────────────────────────
           She heals by hurting, so almost everything here drains. That is
           the point of her and the reason she is admin-only: a class that
           refills its own health off its damage does not obey the same
           arithmetic as the other five. */
        { id: 'nick', name: 'Nick', at: 3, ap: 2, min: 1, max: 3,
          los: true, dmg: [7, 10], cd: 0, elem: 'water', drain: 1,
          hint: 'A small cut, kept.' },
        { id: 'tether', name: 'Tether', at: 6, ap: 2, min: 2, max: 5,
          los: true, dmg: [5, 8], cd: 2, elem: 'water', pull: 2, drain: 1,
          hint: 'Two tiles closer, and a little lighter.' },
        { id: 'redveil', name: 'Red Veil', at: 9, ap: 3, min: 0, max: 0,
          los: false, cd: 3, elem: 'water', shield: [12, 16],
          hint: 'What she has taken, worn on the outside.' },
        { id: 'exsanguine', name: 'Exsanguine', at: 13, ap: 4, min: 1, max: 4,
          los: true, dmg: [16, 22], cd: 2, elem: 'water', drain: 1,
          hint: 'Opens them properly. All of it comes to her.' },
        { id: 'crimsontide', name: 'Crimson Tide', at: 17, ap: 4, min: 1, max: 4,
          los: true, dmg: [13, 18], cd: 3, elem: 'water', aoe: 1, drain: 1,
          hint: 'Five tiles at once, and she keeps every point of it.' },
        { id: 'thrall', name: 'Thrall', at: 22, ap: 3, min: 2, max: 6,
          los: true, dmg: [9, 13], cd: 3, elem: 'water', apLoss: 1, drain: 1,
          hint: 'Takes an action and a pint in the same motion.' },
        /* WIDER than Hemorrhage rather than stronger. The first version was
           the same field with one point less damage and one turn more
           cooldown — strictly worse than a spell she has at level 1. */
        { id: 'bloodmire', name: 'Bloodmire', at: 27, ap: 4, min: 1, max: 4,
          los: true, cd: 4, elem: 'water',
          field: { dmg: [11, 15], aoe: 2, turns: 3, drain: 1 },
          hint: 'Thirteen tiles of ground, all of it paying her.' },
        { id: 'vitaesnare', name: 'Vitae Snare', at: 33, ap: 3, min: 1, max: 4,
          los: false, cd: 4, elem: 'water', trap: { dmg: [24, 32], aoe: 1 },
          hint: 'It waits, and it is patient.' },
        { id: 'transfuse', name: 'Transfuse', at: 39, ap: 3, min: 0, max: 4,
          los: true, cd: 3, elem: 'water', heal: [24, 32],
          hint: 'She gives some back. It costs her nothing she earned.' },
        { id: 'gash', name: 'Gash', at: 45, ap: 4, min: 1, max: 2,
          los: false, dmg: [24, 32], cd: 2, elem: 'water', drain: 1,
          hint: 'Close work. The most she takes from one person.' },
        { id: 'hemoveil', name: 'Hemoveil', at: 52, ap: 3, min: 0, max: 0,
          los: false, cd: 4, elem: 'water', shield: [24, 32],
          hint: 'Red Veil, thickened.' },
        { id: 'crimsonbloom', name: 'Crimson Bloom', at: 60, ap: 5, min: 2, max: 5,
          los: true, dmg: [20, 27], cd: 4, elem: 'water', aoe: 2, drain: 1,
          hint: 'Thirteen tiles open at once and all of it runs to her.' },
        { id: 'thirst', name: 'Thirst', at: 70, ap: 4, min: 1, max: 6,
          los: true, dmg: [18, 25], cd: 3, elem: 'water', apLoss: 1, drain: 1,
          hint: 'They slow down because there is less of them.' },
        { id: 'heartpull', name: 'Heartpull', at: 85, ap: 4, min: 3, max: 7,
          los: true, dmg: [14, 19], cd: 3, elem: 'water', pull: 4, drain: 1,
          hint: 'She does not go to them.' },
        { id: 'lastdrop', name: 'Last Drop', at: 100, ap: 6, min: 1, max: 5,
          los: true, dmg: [32, 42], cd: 5, elem: 'water', aoe: 2, drain: 1,
          hint: 'Everything within two tiles, and she leaves full.' }
      ],
      look: {
        f: { sheet: 'base-f',
             hook: 'The shared female body for now — her own art comes later.',
             palette: ['#7A2E3F', '#FF6B9D', '#3a3f4a', '#f2e6c8'] }
      } }
  ];

  /* WHO MAY SEE A CLASS. The picker and anything else listing classes must
     ask, rather than reading LIST directly, or the admin class shows up for
     everyone. `admin` is passed in by the caller — the real answer lives on
     the relay (isAdmin), never in this file, because anything hardcoded here
     is readable by anyone who opens the bundle. */
  function visible(admin) {
    return LIST.filter(c => !c.adminOnly || !!admin);
  }

  /* Which genders a class can be. Scubi has no male form, and `look[gender]`
     would throw the moment someone tapped Male. */
  function genders(cls) {
    const c = (typeof cls === 'string') ? BY_ID[cls] : cls;
    if (!c || !c.look) return ['m', 'f'];
    return ['m', 'f'].filter(g => !!c.look[g]);
  }

  const BY_ID = {};
  for (const c of LIST) BY_ID[c.id] = c;

  /* ── THE CLASS YOU CAN SEE ─────────────────────────────────────────
     Every class shares one body per gender (art/base-<g>-*.png) and used
     to differ only by the colour of its tunic — so a Warden and a
     Tidebinder standing together were the same person in two shirts. The
     class you PICKED has to be the one you can point at.

     Each class owns a small overlay drawn on that shared body and
     composited over it exactly the way gear is: pauldrons, a quiver
     strap, a wide hat, a collar, a crook. Deliberately SLIGHT — the
     starting outfit has to leave room for every piece of armour that goes
     on top of it, which is the whole reason the base is plain. A class
     that arrives already fully armoured has nowhere left to show
     progression.

     Never an inventory item and never removable: it is what the class IS,
     so it draws UNDER equipped gear rather than competing for a slot. */
  /* ART THAT IS KNOWN TO BE WRONG, named out loud rather than shipped.
     `<class>-<gender>-<kind>`; anything listed here draws the plain body.

     EMPTY, and that is the point of it. Two sheets sat here:

     The male cindermancer's WALK art, whose hat covered his face from the
     front, floated off the cell from the side and smeared across the frame
     facing east. It was redrawn — not by asking a generator for a character,
     which is what kept producing bodies that had drifted, but by INPAINTING a
     hat onto our own frames (tools/pixellab.py) so everything outside the
     mask is still our art, pixel for pixel, and the hat is whatever changed
     inside it. tools/hatsheet.py turns those four crops into the 24 cells.

     The FEMALE walk sheet, which was never broken at all — it was added here
     by assuming she shared his fault. She did not. Copying a verdict from one
     sheet to another is how a working asset gets switched off for a fortnight.

     Keep the list, and put a sheet back in it the moment one is wrong: a
     class with no kit reads as unfinished, a class wearing a smear reads as
     broken, and the second is worse. */
  const GARB_BROKEN = {};

  /* TURNED OFF, BY DECISION, NOT BY FAULT. The owner's rule is that there is
     ONE male and ONE female and every class shares them — so a class is its
     spells and its stats, not a different silhouette. The per-class kits that
     used to draw here (pauldrons, a hat, a quiver) were built against the old
     hand-drawn body and would sit through the shoulders of the new one; more
     to the point, they are no longer wanted.

     The art is kept in art/gear/ rather than deleted, because it is drawn work
     and the decision could be revisited. Return a path here and it comes back. */
  function garb(id, gender, kind) {
    return null;
  }

  return {
    LIST, SUMMONS, STAT_OF_ELEM, visible, genders,
    byId: id => BY_ID[id] || null,
    garb,
    maxHp, initiative, dodgeChance, scaleDamage, scaleHeal, prospect,
    xpFor, xpTotal, MAX_LEVEL,
    SPELL, spellPointsAt, rankCost, maxRankAt, learned, atRank
  };
})();
