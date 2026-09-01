/* ═══════════════════════════════════════════════════════════════════
   PLAYER — window.HERO, the one place that owns who you are.

   The world (world.js), the quest (quest.js) and the panels (panels.js)
   all read the same player. Before this file existed there were three
   half-players: WT.makePlayer() in the world, select.js's localStorage
   payload that nothing read, and tactics.js's hard-coded hero. HERO
   joins the first two; combat integration is a later, separate step.

   ── WHAT HERO OWNS ────────────────────────────────────────────────
   · the CHOICE: classId + gender (set at the reincarnation moment)
   · progression: level, xp
   · vitals: hp (current)
   · possessions: items[], equip{}
   Everything else — hpMax, ap, mp, stats, spells, name — is DERIVED
   from window.CLASSES for the chosen class. Never duplicated here.

   ── window.PLAYER IS A VIEW OF HERO ───────────────────────────────
   HERO creates window.PLAYER once (same object reference forever) and
   keeps its derived fields correct. quest.js / panels.js keep mutating
   PLAYER directly (P.xp += …, P.hp = …, P.items.push(…)) exactly as
   before — HERO watches for those mutations and persists them.

   ── THE localStorage CONTRACT (extends select.js's, same key) ─────
   Key: 'tactics.hero.v1'
   Value: JSON —
     { v:1, classId, gender:'m'|'f', sheet, name, savedAt,   // original
       level, xp, hp, items:[{id,name,qty,note?}],           // HERO adds
       equip:{ <slot>:{id,name,note?} },                     // HERO adds
       at:{ map, c, r } }   // HERO adds: where the hero last stood, read
                            // live from WORLD at save time. world.html
                            // boot resumes there via HERO.where(); absent
                            // or invalid = start map default spawn.
   · The original select.js fields keep their exact meaning; readers
     still trust classId+gender and re-derive the rest from CLASSES.
   · The added fields are OPTIONAL — a payload written by select.html
     (which only writes the original six) loads fine; missing fields
     take defaults (level 1, xp 0, hp = full, empty bag).
   · Key absent/unparsable, or classId unknown = no choice made yet.
   · The key is only ever written once a class is chosen. Pre-choice
     progress is not persisted (there is nothing meaningful to keep).

   *** NO CURRENCY FIELD. Deliberate; see WORLD_SPEC.md. KARTI owns
   the only wallet. Rewards here are XP and items, full stop. ***
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

window.HERO = (function () {

  const KEY = 'tactics.hero.v1';
  const DEF = { dir8: 'art/hero-dir8.png', idle: 'art/hero-idle.png',
                action: 'art/hero-sheet.png' };

  /* the choice — null classId means "not reincarnated yet" */
  /* IDENTITY — what the player chose. Appearance sits here rather than on
     P because it is a choice, not a derived stat: it survives levelling,
     never changes on its own, and is part of who this character IS. */
  const S = { classId: null, gender: 'm',
              look: { hair: null, skin: null, eyes: null } };

  /* the hero's last known location {map,c,r} — restored from the save,
     refreshed from the live WORLD every time we look at it */
  let AT = null;

  /* the view — created ONCE; every module shares this reference */
  const P = { name: 'Hero', level: 1, xp: 0, points: 0,
              hp: 100, hpMax: 100, ap: 6, mp: 3,
              items: [], equip: {},
              stats: { earth: 0, fire: 0, water: 0, air: 0 },
              classId: null, gender: 'm' };

  let changeCb = null;
  let lastRegen = 0;            /* wall-clock anchor for regen() */                      /* single callback, last wins */

  function cls() {
    return (S.classId && window.CLASSES) ? window.CLASSES.byId(S.classId) : null;
  }

  /* ── derive class facts onto P, in place ──────────────────────── */
  function refresh() {
    const c = cls();
    if (c) {
      const st = c.stats;
      P.name = c.name;
      P.hpMax = window.CLASSES.maxHp(c, st, P.level);
      /* growth.apAt / growth.mpAt were declared in classes.js and never
         read: every class sat on its level-1 AP and MP forever. A class
         that never gains AP is a class that plays identically at 30 and
         at 1, which is most of what levelling is FOR. */
      const g = c.growth || {};
      /* apAt/mpAt are LISTS of the levels where a point is gained, so
         adding another threshold later is data rather than logic. A number
         is still accepted, because a scalar is the obvious thing to write
         and silently ignoring it would be a trap. */
      const at = v => (v == null ? [] : (Array.isArray(v) ? v : [v]));
      const past = v => at(v).filter(L => P.level >= L).length;
      P.ap = c.base.ap + past(g.apAt);
      P.mp = c.base.mp + past(g.mpAt);
      /* panels.js reads elemental stats; the mapping is CLASSES.STAT_OF_ELEM */
      P.stats.earth = st.str | 0;
      P.stats.fire  = st.int | 0;
      P.stats.water = st.cha | 0;
      P.stats.air   = st.agi | 0;
    } else {
      P.name = 'Hero';
      P.hpMax = 100; P.ap = 6; P.mp = 3;
      P.stats.earth = P.stats.fire = P.stats.water = P.stats.air = 0;
    }
    if (typeof P.hp !== 'number' || isNaN(P.hp) || P.hp > P.hpMax) P.hp = P.hpMax;
    if (P.hp < 0) P.hp = 0;
    P.classId = S.classId;
    P.gender = S.gender;
  }

  /* ── persistence ──────────────────────────────────────────────── */
  function cleanItems(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const it of list) {
      if (!it || typeof it.id !== 'string') continue;
      const o = { id: it.id, name: String(it.name || it.id),
                  qty: Math.max(1, it.qty | 0) };
      if (it.note) o.note = String(it.note);
      out.push(o);
    }
    return out;
  }
  function cleanEquip(eq) {
    const out = {};
    if (!eq || typeof eq !== 'object') return out;
    for (const slot in eq) {
      const w = eq[slot];
      if (!w || typeof w.id !== 'string') continue;
      const o = { id: w.id, name: String(w.name || w.id) };
      if (w.note) o.note = String(w.note);
      out[slot] = o;
    }
    return out;
  }

  function cleanAt(a) {
    if (!a || typeof a !== 'object' || typeof a.map !== 'string') return null;
    if (typeof a.c !== 'number' || typeof a.r !== 'number') return null;
    const c = a.c | 0, r = a.r | 0;
    if (c < 0 || r < 0) return null;
    return { map: a.map, c, r };
  }

  /* where the hero stands RIGHT NOW, board-space, from the live WORLD —
     null before world.js has loaded a map (e.g. on select.html) */
  function whereNow() {
    const w = (typeof window !== 'undefined') ? window.WORLD : null;
    if (!w || !w._map || typeof w.playerAt !== 'function') return null;
    const p = w.playerAt();
    return { map: w._map.id, c: p.c, r: p.r };
  }

  function payload() {
    const c = cls();
    const here = whereNow();
    if (here) AT = here;
    return {
      v: 1,
      classId: S.classId,
      gender: S.gender,
      look: { hair: S.look.hair, skin: S.look.skin, eyes: S.look.eyes },
      sheet: c ? c.look[S.gender].sheet : null,
      name: c ? c.name : null,
      savedAt: new Date().toISOString(),
      level: P.level, xp: P.xp, points: P.points | 0, hp: P.hp,
      items: cleanItems(P.items),
      equip: cleanEquip(P.equip),
      at: AT
    };
  }

  function save() {
    if (!S.classId) return false;         /* absent key = no choice yet */
    try {
      localStorage.setItem(KEY, JSON.stringify(payload()));
      snap = snapshot();
      return true;
    } catch (e) { return false; }
  }

  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!d || typeof d !== 'object') { refresh(); return; }
    if (window.CLASSES && window.CLASSES.byId(d.classId)) {
      S.classId = d.classId;
      S.gender = d.gender === 'f' ? 'f' : 'm';
    }
    if (typeof d.level === 'number') P.level = Math.max(1, d.level | 0);
    if (typeof d.xp === 'number')    P.xp = Math.max(0, d.xp | 0);
    if (typeof d.points === 'number') P.points = Math.max(0, d.points | 0);
    if (d.look && typeof d.look === 'object'){
      for (const k of ['hair', 'skin', 'eyes'])
        if (typeof d.look[k] === 'string' && /^#[0-9a-f]{6}$/i.test(d.look[k]))
          S.look[k] = d.look[k];
    }
    P.items = cleanItems(d.items);
    P.equip = cleanEquip(d.equip);
    AT = cleanAt(d.at);
    if (typeof d.hp === 'number') P.hp = d.hp;
    else P.hp = Infinity;                 /* select.html payload: full hp */
    refresh();                            /* clamps hp to derived hpMax  */
  }

  /* ── autosave: watch PLAYER for direct mutations ──────────────────
     quest/panels write P.xp, P.hp, P.items, P.equip without telling
     anybody (that is their contract). A cheap snapshot-diff on a slow
     interval + pagehide catches everything; the object is tiny. */
  function snapshot() {
    /* whereNow() is in the snapshot so WALKING marks the save dirty —
       otherwise a mid-tutorial reload forgets the map/tile (the ruin-01
       respawn bug) whenever nothing else changed since the last save */
    return JSON.stringify([P.level, P.xp, P.points, P.hp, P.items, P.equip, whereNow()]);
  }
  let snap = '';
  function maybeSave() {
    if (!S.classId) return;
    if (snapshot() !== snap) save();
  }
  if (typeof setInterval !== 'undefined') setInterval(maybeSave, 1500);
  if (typeof addEventListener !== 'undefined') {
    addEventListener('pagehide', maybeSave);
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') maybeSave();
    });
  }

  /* ── LEVELLING ───────────────────────────────────────────────────
     Nothing levelled anyone up before this: XP accumulated and the number
     on the character sheet meant nothing. gainXp is the ONLY way level
     changes, so there is one place where growth is applied and one place
     to audit when the server becomes authoritative.

     It returns what happened rather than announcing it, so the caller
     decides how to celebrate — the end-of-battle screen wants a bar and a
     flourish, a quest reward wants a quiet toast. */
  function gainXp(n) {
    n = Math.max(0, n | 0);
    const before = P.level, C = window.CLASSES;
    if (!n || !C) return { xp: 0, from: before, to: before, levels: 0 };
    /* progression lives on P — S holds identity only, and serialise()
       reads P. Writing it to S would work all session and vanish on
       reload, which is the worst shape a save bug can take. */
    P.xp = (P.xp | 0) + n;
    let gained = 0;
    /* a big reward can cross more than one level at once */
    while (P.level < C.MAX_LEVEL && P.xp >= C.xpTotal(P.level + 1)) {
      P.level += 1; gained += 1;
    }
    if (gained) {
      const c = cls();
      refresh();                     /* hpMax, AP and MP follow the level */
      /* unspent stat points accrue; spending them is a later feature, but
         they must accumulate NOW or the record is wrong when it ships */
      if (c && c.growth) P.points = (P.points | 0) + c.growth.statPoints * gained;
      P.hp = P.hpMax;                /* levelling heals — the classic, and
                                        it makes the moment feel like one */
    }
    save();
    return { xp: n, from: before, to: P.level, levels: gained,
             points: P.points | 0 };
  }

  /* progress within the CURRENT level, for the bar on the character sheet */
  function xpBar() {
    const C = window.CLASSES;
    if (!C || P.level >= C.MAX_LEVEL) return { into: 0, need: 0, max: true };
    const base = C.xpTotal(P.level), next = C.xpTotal(P.level + 1);
    return { into: Math.max(0, (P.xp | 0) - base), need: next - base, max: false };
  }

  /* ── the public api ───────────────────────────────────────────── */
  const api = {
    gainXp, xpBar,

    /* HP OUT OF COMBAT. Set by tactics.js when a fight ends, and ticked up
       slowly by regen() while the player walks around. Never above hpMax,
       never below 1 — a character does not die on the world map. */
    setHp(v) {
      P.hp = Math.max(1, Math.min(P.hpMax | 0 || 1, v | 0));
      save(); if (changeCb) changeCb(P);
      return P.hp;
    },

    /* SLOW REGENERATION. The owner's rule: you keep the wounds you finished
       the fight with and mend gradually, unless you drink something. Called
       on a timer by the world; it works out how long has passed rather than
       counting ticks, so it is correct after a reload, a backgrounded tab or
       a phone that slept — none of which fire timers.

       RATE is deliberately slow: about 1% of max hp every 6 seconds, so a
       character on half health takes roughly five minutes to be whole. Long
       enough that a potion is worth carrying, short enough that nobody sits
       and waits. */
    regen(now) {
      const t = now || Date.now();
      if (!P.hpMax) return P.hp;
      if (!lastRegen) { lastRegen = t; return P.hp; }
      if (P.hp >= P.hpMax) { lastRegen = t; return P.hp; }
      const per = 6000;                       /* ms per point-tick */
      const steps = Math.floor((t - lastRegen) / per);
      if (steps <= 0) return P.hp;
      lastRegen += steps * per;
      const gain = Math.max(1, Math.round(P.hpMax * 0.01)) * steps;
      const was = P.hp;
      P.hp = Math.min(P.hpMax, P.hp + gain);
      if (P.hp !== was) { save(); if (changeCb) changeCb(P); }
      return P.hp;
    },

    /* APPEARANCE. Falls back to TINT's defaults rather than null, so every
       caller can just use the value without checking whether the player has
       been through the picker yet. */
    appearance() {
      const d = (window.TINT && TINT.DEFAULTS) || {};
      return { hair: S.look.hair || d.hair, skin: S.look.skin || d.skin,
               eyes: S.look.eyes || d.eyes };
    },
    setAppearance(look) {
      if (!look) return;
      let hit = false;
      for (const k of ['hair', 'skin', 'eyes'])
        if (typeof look[k] === 'string' && /^#[0-9a-f]{6}$/i.test(look[k])){
          S.look[k] = look[k]; hit = true;
        }
      if (hit){ save(); if (changeCb) changeCb(P); }
      return hit;
    },
    get points() { return P.points | 0; },

    /* has the player been reincarnated (chosen a class)? */
    chosen() { return !!S.classId; },

    get classId() { return S.classId; },
    get gender()  { return S.gender; },
    get level()   { return P.level; },

    /* the full class object from classes.js, or null pre-choice */
    cls,

    /* spells for the chosen class ([] pre-choice) */
    spells() { const c = cls(); return c ? c.spells : []; },

    /* sprite sheets for the current identity. Pre-choice: the default
       hero (walk + drawn idle). Post-choice: the class+gender sheets —
       art/<sheet>-dir8.png (8-facing walk) and art/<sheet>-sheet.png
       (idle/walk/attack/hit action rows). Classes have no directional
       idle sheet, so `idle` is null and the world holds the measured
       stand frame of the walk sheet instead. */
    sheets() {
      const c = cls();
      if (!c) return { dir8: DEF.dir8, idle: DEF.idle, action: DEF.action };
      const s = c.look[S.gender].sheet;
      return { dir8: 'art/' + s + '-dir8.png', idle: null,
               action: 'art/' + s + '-sheet.png' };
    },

    /* THE reincarnation: sets the identity, derives stats, heals to the
       new full (a fresh body), persists, and swaps the world sprite
       immediately so the player SEES the change. */
    choose(classId, gender, look) {
      if (!window.CLASSES || !window.CLASSES.byId(classId)) return false;
      S.classId = classId;
      S.gender = gender === 'f' ? 'f' : 'm';
      /* appearance arrives WITH the choice — it is one decision made on one
         screen, and applying it before refreshHeroSprites() means the sprite
         is tinted the first time it is drawn rather than flickering from the
         default */
      if (look) for (const k of ['hair', 'skin', 'eyes'])
        if (typeof look[k] === 'string' && /^#[0-9a-f]{6}$/i.test(look[k]))
          S.look[k] = look[k];
      refresh();
      P.hp = P.hpMax;                     /* new body, full of life */
      save();
      if (window.WORLD && window.WORLD.refreshHeroSprites)
        window.WORLD.refreshHeroSprites();
      if (changeCb) changeCb(api);
      return true;
    },

    save,
    /* the hero's last known location {map,c,r} — live position when a
       map is loaded, else the restored save's; null pre-save. Boot glue
       uses this to resume where a reload left off. Returns a copy. */
    where() {
      const here = whereNow();
      if (here) AT = here;
      return AT ? { map: AT.map, c: AT.c, r: AT.r } : null;
    },

    reset() {
      try { localStorage.removeItem(KEY); } catch (e) {}
      S.classId = null; S.gender = 'm'; AT = null;
      P.level = 1; P.xp = 0; P.points = 0; P.items = []; P.equip = {}; P.hp = Infinity;
      refresh();
      if (window.WORLD && window.WORLD.refreshHeroSprites)
        window.WORLD.refreshHeroSprites();
      if (changeCb) changeCb(api);
    },

    onChange(cb) { changeCb = cb; }
  };

  /* boot: restore, then expose the view */
  load();
  window.PLAYER = P;

  return api;
})();
