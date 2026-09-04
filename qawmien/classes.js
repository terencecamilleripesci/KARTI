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
  function scaleHeal(roll, stats) {
    return Math.round(roll * (1 + ((stats.cha | 0)) / 100));
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
          hint: 'Brace. Absorbs damage until your next turn.' }
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
          hint: 'Vanish to an empty tile — walls don\'t matter.' }
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
          hint: 'Point-blank flash. Buys you one tile of air.' }
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
          hint: 'Heals the target and every friend beside it.' }
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
          hint: 'Trade places with your ram or an ally.' }
      ],
      look: {
        m: { sheet: 'shepherd-m',
             hook: 'Long crook curling above head height like a question mark, floppy wide-brim hat, cloud-lumpy fleece mantle bulking the shoulders.',
             palette: ['#f2e6c8', '#7a4a2b', '#5a7d4a', '#e8622d'] },
        f: { sheet: 'shepherd-f',
             hook: 'No hat: ram-horn headdress curling at each temple, crook slung across the back, fleece-trim poncho with a diamond hem.',
             palette: ['#f2e6c8', '#7a4a2b', '#5a7d4a', '#e8622d'] }
      } }
  ];

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

     cindermancer's WALK sheet is the one that failed outright: its hat
     covers the face facing south, floats off the top of the cell facing
     south-east, and the east row came back as a brown ellipse over the
     whole cell. A class with no hat reads as unfinished; a class wearing a
     smear reads as broken, and the second is worse. Its action sheet is
     fine, so the hat is still there in combat and on the creation screen.

     DELETE THE ENTRY, DO NOT WORK AROUND IT: the fix is to regenerate
     art/gear/cindermancer-m-dir8.png through tools/makegear.sh and let
     tools/checksheet.py --gear pass it. (The east row was corrupt in three
     of the five male overlays; warden's and stormfletch's were repairable
     from their south-east frames, this one was not.) */
  const GARB_BROKEN = { 'cindermancer-m-dir8': 1, 'cindermancer-f-dir8': 1 };

  function garb(id, gender, kind) {
    const c = BY_ID[id];
    if (!c || !c.look) return null;
    const g = (gender === 'f') ? 'f' : 'm';
    if (!c.look[g]) return null;
    const suffix = (kind === 'dir8') ? '-dir8' : '';
    if (GARB_BROKEN[c.id + '-' + g + suffix]) return null;
    return 'art/gear/' + c.id + '-' + g + suffix + '.png';
  }

  return {
    LIST, SUMMONS, STAT_OF_ELEM,
    byId: id => BY_ID[id] || null,
    garb,
    maxHp, initiative, dodgeChance, scaleDamage, scaleHeal,
    xpFor, xpTotal, MAX_LEVEL
  };
})();
