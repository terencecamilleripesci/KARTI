/* ═══════════════════════════════════════════════════════════════════
   GEAR — the equipment catalogue, its drop tables, and the rules for
   who may wear what. Pure data + pure functions: this file never
   touches the DOM, the fight, or the player. Callers ask it questions.

   THE OWNER'S DESIGN, which is the Dofus model:
     · the tutorial ends with an old man outside the ruin handing over a
       FULL novice set — the player's first gear, all four slots at once
     · mobs in the world drop gear RARELY and RANDOMLY, one tier above
       the novice set: noticeably better, not a leap
     · a dungeon BOSS drops exactly ONE random piece of its set per kill,
       much stronger, so a set is assembled over several runs
     · every piece has a LEVEL REQUIREMENT, so a lucky drop is something
       to grow into rather than something that trivialises the next zone
     · two dungeons: level 10 and level 25

   WHY DROPS ARE ONE PIECE AT A TIME. A boss that hands over a whole set
   is beaten once and then finished with. One random piece gives a reason
   to go back, and it is the reason dungeons in this genre have any
   replay value at all. It also paces power: four runs of the level-10
   dungeon lands the player near level 15, which is where the set stops
   being an upgrade anyway.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

window.GEAR = (function () {

  /* ── slots ────────────────────────────────────────────────────────
     These MUST match panels.js SLOTS or an item drops into a slot the
     character sheet cannot show. Weapon and the jewellery slots exist
     in the UI but carry no art yet: the owner's rule is that tools and
     weapons appear on the sprite only once their animations exist, so
     they are catalogued without an `art` field and simply do not draw. */
  const SLOTS = ['head', 'cape', 'amulet', 'weapon', 'ring', 'belt', 'boots'];

  /* the four slots the novice set fills, and the art name for each */
  const ART_SLOT = { head: 'cap', cape: 'cloak', belt: 'belt', boots: 'boots' };

  /* ── tiers ────────────────────────────────────────────────────────
     Each tier states where it comes from and roughly when it is worn.
     `power` is the per-item stat budget — see roll() for how it is spent.
     The budget climbs faster than the level requirement so that later
     gear genuinely changes how a fight feels, which is what makes a
     dungeon worth running twice. */
  const TIERS = {
    novice: { name: 'Novice',   level: 1,  power: 4,
              from: 'The Caretaker, when you leave the ruin' },
    wild:   { name: 'Wayfarer', level: 6,  power: 10,
              from: 'Rarely, from anything you beat in the open world' },
    crypt:  { name: 'Cryptward', level: 12, power: 22,
              from: 'The Sunken Crypt boss, one piece at a time' },
    necro:  { name: 'Revenant', level: 26, power: 44,
              from: 'The Necropolis boss, one piece at a time' }
  };

  /* ── the level requirement ────────────────────────────────────────
     The owner asked for varied requirements rather than one number per
     tier. They are DERIVED FROM THE ITEM ID, not rolled at drop time:
     a requirement that changed between one look at an item and the next
     would read as a bug, and two players comparing the same boots must
     see the same number. Same input, same answer, forever. */
  /* FNV-1a. Math.imul is NOT decoration here: `h * 16777619` overflows the
     53-bit float mantissa, and JavaScript quietly drops the LOW bits — which
     are exactly the bits a `% 4` reads. Written the obvious way, all four
     Cryptward pieces hashed to the same value and the whole set required
     level 12, silently defeating the varied requirements this function
     exists to produce. Math.imul does a true 32-bit multiply. */
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function levelFor(id, tier) {
    const t = TIERS[tier];
    if (!t) return 1;
    if (t.level <= 1) return 1;              /* the starter set gates nobody */
    /* +0..3 above the tier floor, stable per item */
    return t.level + (hash(id) % 4);
  }

  /* ── the catalogue ────────────────────────────────────────────────
     `stats` are flat additions to the player's str/int/cha/agi/vit/wis.
     vit is hit points one-for-one (player.js: hpMax = base + vit + growth),
     so it is the safest stat to lean on early — more health is legible to
     a new player in a way that +3 chance is not.

     Every piece names the art it wears. The art is per gender and is
     resolved by sheet(): art/gear/<art>-<m|f>-<slot>.png. Pieces with no
     art field are catalogued but invisible — see the note on weapons. */
  const ITEMS = [
    /* ---- novice: the tutorial reward, a full set in one go ---------- */
    { id: 'novice-cap',   name: 'Novice Cap',    slot: 'head',  tier: 'novice',
      art: 'novice', stats: { vit: 4 },
      note: 'Boiled leather, sun-bleached. It has kept a lot of heads dry.' },
    { id: 'novice-cloak', name: 'Novice Cloak',  slot: 'cape',  tier: 'novice',
      art: 'novice', stats: { vit: 6 },
      note: 'Undyed wool. Warm, unremarkable, and yours.' },
    { id: 'novice-belt',  name: 'Novice Belt',   slot: 'belt',  tier: 'novice',
      art: 'novice', stats: { vit: 3, wis: 1 },
      note: 'Rope and a brass buckle worn smooth by someone else.' },
    { id: 'novice-boots', name: 'Novice Boots',  slot: 'boots', tier: 'novice',
      art: 'novice', stats: { vit: 3, agi: 1 },
      note: 'Resoled twice. Good for a long walk east.' },

    /* ---- wayfarer: the rare open-world drop ------------------------- */
    { id: 'wild-hood',    name: 'Wayfarer Hood',  slot: 'head',  tier: 'wild',
      art: 'novice', stats: { vit: 8, wis: 2 },
      note: 'Taken from something that no longer needs it.' },
    { id: 'wild-cloak',   name: 'Wayfarer Cloak', slot: 'cape',  tier: 'wild',
      art: 'novice', stats: { vit: 10, cha: 2 },
      note: 'Road dust in every fold.' },
    { id: 'wild-belt',    name: 'Wayfarer Belt',  slot: 'belt',  tier: 'wild',
      art: 'novice', stats: { vit: 6, str: 3 },
      note: 'Three notches let out. Someone ate well out here.' },
    { id: 'wild-boots',   name: 'Wayfarer Boots', slot: 'boots', tier: 'wild',
      art: 'novice', stats: { vit: 5, agi: 4 },
      note: 'Still faintly damp. Best not to ask.' },

    /* ---- cryptward: the level-10 dungeon set ------------------------ */
    { id: 'crypt-helm',   name: 'Cryptward Helm',  slot: 'head',  tier: 'crypt',
      art: 'novice', stats: { vit: 18, wis: 4 },
      note: 'Cold to the touch, hours after you take it off.' },
    { id: 'crypt-mantle', name: 'Cryptward Mantle', slot: 'cape', tier: 'crypt',
      art: 'novice', stats: { vit: 22, int: 5 },
      note: 'The salt stains map a coastline that is no longer there.' },
    { id: 'crypt-girdle', name: 'Cryptward Girdle', slot: 'belt', tier: 'crypt',
      art: 'novice', stats: { vit: 14, str: 7 },
      note: 'Grave-iron. Heavier than it looks, and it looks heavy.' },
    { id: 'crypt-tread',  name: 'Cryptward Treads', slot: 'boots', tier: 'crypt',
      art: 'novice', stats: { vit: 12, agi: 8 },
      note: 'They leave no prints on wet stone. Nobody knows why.' },

    /* ---- revenant: the level-25 dungeon set ------------------------- */
    { id: 'necro-crown',  name: 'Revenant Crown',  slot: 'head',  tier: 'necro',
      art: 'novice', stats: { vit: 34, wis: 9, int: 6 },
      note: 'It was a circlet once, before the fire and whatever came after.' },
    { id: 'necro-shroud', name: 'Revenant Shroud', slot: 'cape',  tier: 'necro',
      art: 'novice', stats: { vit: 42, int: 11 },
      note: 'Woven for a burial that was interrupted.' },
    { id: 'necro-chain',  name: 'Revenant Chain',  slot: 'belt',  tier: 'necro',
      art: 'novice', stats: { vit: 28, str: 14 },
      note: 'Each link is stamped with a name. None of them are legible.' },
    { id: 'necro-step',   name: 'Revenant Steps',  slot: 'boots', tier: 'necro',
      art: 'novice', stats: { vit: 24, agi: 15 },
      note: 'You hear them a half-beat after you take each step.' }
  ];

  const BY_ID = {};
  for (const it of ITEMS) {
    it.level = levelFor(it.id, it.tier);
    it.rarity = ({ novice: 'common', wild: 'uncommon',
                   crypt: 'rare', necro: 'epic' })[it.tier] || 'common';
    BY_ID[it.id] = it;
  }

  function byId(id) { return BY_ID[id] || null; }
  function tier(name) { return TIERS[name] || null; }
  function ofTier(t) { return ITEMS.filter(i => i.tier === t); }

  /* ── the sets ─────────────────────────────────────────────────────
     A whole set, in slot order, for the one place a set is handed over
     complete: the Caretaker's gift when the tutorial ends. */
  function set(t) {
    const want = ['head', 'cape', 'belt', 'boots'];
    return want.map(s => ofTier(t).find(i => i.slot === s)).filter(Boolean);
  }

  /* ── drop tables ──────────────────────────────────────────────────
     ONE PLACE decides what falls out of a corpse, so tuning the game's
     generosity is one edit rather than a hunt through the mob roster.

     MOB_CHANCE is per FALLEN ENEMY, not per fight. A four-mob group is
     four rolls, which is why the number looks small: at 5% a player
     clearing ~20 mobs an hour sees roughly one piece an hour, and the
     piece is a tier above what they are wearing. Rarer than that and the
     open world stops paying at all; more and the dungeon sets stop
     mattering before they are reached. */
  const MOB_CHANCE = 0.05;

  /* Bosses do not roll for WHETHER — they roll for WHICH. Every boss kill
     pays exactly one piece. A boss that can pay nothing turns a long fight
     into a shrug, and the owner asked for one piece at a time. */
  const BOSSES = {
    'sunken-crypt': { name: 'The Drowned Warden', level: 10, tier: 'crypt' },
    'necropolis':   { name: 'The Unquiet Choir',  level: 25, tier: 'necro' }
  };

  function rnd(rng) { return (typeof rng === 'function' ? rng() : Math.random()); }

  /* what a single fallen open-world enemy drops: usually nothing */
  function mobDrop(level, rng) {
    if (rnd(rng) >= MOB_CHANCE) return null;
    /* only offer gear the player could plausibly be near — a level 3 goat
       handing out level 26 boots would be the whole progression curve
       undone by one lucky roll */
    const pool = ITEMS.filter(i => i.tier === 'wild' ||
                                   (i.tier === 'crypt' && (level | 0) >= 14));
    if (!pool.length) return null;
    return pool[Math.floor(rnd(rng) * pool.length)] || null;
  }

  /* what a boss drops: exactly one piece of its own set */
  function bossDrop(bossId, rng) {
    const b = BOSSES[bossId];
    if (!b) return null;
    const pool = ofTier(b.tier);
    if (!pool.length) return null;
    return pool[Math.floor(rnd(rng) * pool.length)] || null;
  }

  /* ── wearing it ───────────────────────────────────────────────────
     canEquip is the ONLY authority on whether a piece may be worn. It
     returns a reason rather than a bare false, because "you cannot equip
     this" with no explanation is the single most annoying message an
     inventory can show. */
  function canEquip(item, level) {
    const it = (typeof item === 'string') ? byId(item) : item;
    if (!it) return { ok: false, why: 'No such item.' };
    if (!it.slot) return { ok: false, why: 'This is not equipment.' };
    const need = it.level | 0;
    if ((level | 0) < need)
      return { ok: false, why: 'Requires level ' + need + '.', need: need };
    return { ok: true, need: need };
  }

  /* ── what it is worth ─────────────────────────────────────────────
     The sum of everything worn. player.js applies this AFTER deriving
     class stats from the level, so gear adds to a character rather than
     replacing what the class gave them. */
  const STAT_KEYS = ['str', 'int', 'cha', 'agi', 'vit', 'wis'];
  function bonus(equip) {
    const out = { str: 0, int: 0, cha: 0, agi: 0, vit: 0, wis: 0 };
    if (!equip) return out;
    for (const slot in equip) {
      const w = equip[slot];
      if (!w) continue;
      const it = byId(w.id);
      if (!it || !it.stats) continue;
      for (const k of STAT_KEYS) if (it.stats[k]) out[k] += it.stats[k];
    }
    return out;
  }

  /* ── the art ──────────────────────────────────────────────────────
     Which overlay sheet a worn piece draws, for a given gender and sheet
     kind. Returns null for anything with no art — a weapon, a ring —
     and the sprite layer simply skips it. Silence is correct here: a
     missing overlay must look like gear that has not been drawn yet, not
     like a broken character. */
  function sheet(item, gender, kind) {
    const it = (typeof item === 'string') ? byId(item) : item;
    if (!it || !it.art) return null;
    const part = ART_SLOT[it.slot];
    if (!part) return null;
    const g = (gender === 'f') ? 'f' : 'm';
    const suffix = (kind === 'dir8') ? '-dir8' : '';
    return 'art/gear/' + it.art + '-' + g + '-' + part + suffix + '.png';
  }

  /* every overlay a set of equipped items draws, in BACK-TO-FRONT order.
     Order matters: the cloak hangs behind the belt, the cap sits over
     everything. Drawing them in slot-object order would be whatever the
     JS engine felt like, which is a rendering bug that only shows up on
     someone else's browser. */
  const DRAW_ORDER = ['cape', 'boots', 'belt', 'head'];
  function sheets(equip, gender, kind) {
    const out = [];
    if (!equip) return out;
    for (const slot of DRAW_ORDER) {
      const w = equip[slot];
      if (!w) continue;
      const s = sheet(w.id, gender, kind);
      if (s) out.push(s);
    }
    return out;
  }

  /* a plain item record, the shape panels.js and quest.js pass around */
  function record(item) {
    const it = (typeof item === 'string') ? byId(item) : item;
    if (!it) return null;
    return { id: it.id, name: it.name, qty: 1, note: it.note,
             slot: it.slot, rarity: it.rarity, level: it.level };
  }

  return { SLOTS, TIERS, ITEMS, BOSSES, MOB_CHANCE, DRAW_ORDER,
           byId, tier, ofTier, set, levelFor,
           mobDrop, bossDrop, canEquip, bonus, sheet, sheets, record };
})();
