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
  const S = { classId: null, gender: 'm' };

  /* the hero's last known location {map,c,r} — restored from the save,
     refreshed from the live WORLD every time we look at it */
  let AT = null;

  /* the view — created ONCE; every module shares this reference */
  const P = { name: 'Hero', level: 1, xp: 0,
              hp: 100, hpMax: 100, ap: 6, mp: 3,
              items: [], equip: {},
              stats: { earth: 0, fire: 0, water: 0, air: 0 },
              classId: null, gender: 'm' };

  let changeCb = null;                      /* single callback, last wins */

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
      P.ap = c.base.ap;
      P.mp = c.base.mp;
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
      sheet: c ? c.look[S.gender].sheet : null,
      name: c ? c.name : null,
      savedAt: new Date().toISOString(),
      level: P.level, xp: P.xp, hp: P.hp,
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
    return JSON.stringify([P.level, P.xp, P.hp, P.items, P.equip, whereNow()]);
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

  /* ── the public api ───────────────────────────────────────────── */
  const api = {

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
    choose(classId, gender) {
      if (!window.CLASSES || !window.CLASSES.byId(classId)) return false;
      S.classId = classId;
      S.gender = gender === 'f' ? 'f' : 'm';
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
      P.level = 1; P.xp = 0; P.items = []; P.equip = {}; P.hp = Infinity;
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
