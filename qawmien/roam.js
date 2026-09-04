/* ═══════════════════════════════════════════════════════════════════
   ROAM — the monsters walk around while you are looking at them.

   A creature that only ever moves once a fight has started is scenery.
   The goblin in the third hall stood on one tile from the day it was
   drawn: you could walk a circle around it and it would not so much as
   turn its head. So every mob that is allowed to wander now does the
   same three things, forever — WALK a few tiles, STAND for about
   fifteen seconds, walk again.

   THIS FILE DECIDES NOTHING ABOUT PIXELS. It answers two questions and
   nothing else:
     · when should this creature next move?      (due / idleMs)
     · where should it walk?                     (leg)
   world.js owns the stepping, the sprite and the drawing, exactly the
   way it owns the hero's. That split is what makes the schedule
   testable in node, with no canvas and no clock.

   ── THE TWO RULES THE OWNER ASKED FOR ────────────────────────────────
   1. NO TWO MOBS STEP OFF TOGETHER. Seeding every creature from the
      same clock made a map look choreographed: walk in, and four
      monsters started walking on the same frame. So each one is seeded
      from its OWN name, and its first move lands at a random point
      INSIDE the first cycle rather than at the end of it — the phase
      offset. Two goats on the same screen are never in step, and they
      are never in step tomorrow either, because the seed is the name
      and not the moment you arrived.
   2. WHERE IT IS DEPENDS ON THE CLOCK, NOT ON YOU. The schedule runs on
      absolute time, so a mob is not frozen while you are on another
      screen: come back after a minute and it has moved on with its
      route. world.js catches up the legs it owes (see roamCatchUp)
      instead of resuming as if no time had passed.

   ── WHAT KEEPS IT FROM RUINING THE MAP ───────────────────────────────
   A wandering monster is a moving wall — mob tiles block the player.
   So the CALLER supplies canStand/canStep, and world.js refuses any
   tile that is a way out, another marker, or a cut vertex of the map.
   tools/mkworld.py already refuses to PLACE a fight on a cut vertex
   (`whole_without`); this is the same rule applied to every tile it
   walks onto afterwards, which is the only way the guarantee survives
   the creature moving.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const ROAM = (() => {

  /* THE OWNER'S NUMBER: "walk then idle idle for 15sec then walk". */
  const IDLE_MS   = 15000;
  /* ...but not fifteen to the millisecond, or two mobs that ever happen
     to move on the same beat stay locked together for the rest of the
     session. A few seconds of slop each cycle keeps them drifting. */
  const IDLE_SLOP = 4000;               /* ± */

  /* ── HOW LONG THE WALK IS, AND HOW FAST ──────────────────────────────
     The first version walked ONE to THREE tiles at the hero's own pace.
     Measured, that is 1.8 seconds of movement in seventy — three per
     cent — and a "walk" of one tile is over in 160ms. The owner's
     report was simply "goblin not moving", and he was right: a twitch
     once every fifteen seconds is not a creature walking around, it is
     a creature teleporting a tile when you happen to blink.

     So a leg is now a WALK — several tiles, at a stroll rather than at
     the hero's purposeful clip. The hero moves because the player told
     him to and wants to get there; an animal wandering its patch does
     not, and the slower pace both looks right and keeps the walk on
     screen long enough to be seen. The fifteen seconds of standing is
     untouched: that is what was asked for. */
  const LEG_MIN   = 3, LEG_MAX = 6;     /* tiles walked in one go */
  const PACE      = 1.7;                /* × the hero's per-tile time  */

  /* the eight step deltas. Duplicated from WT rather than imported so
     this file runs in node with nothing else loaded. */
  const DIRS8 = [
    { dc: 1, dr: 0 }, { dc: -1, dr: 0 }, { dc: 0, dr: 1 }, { dc: 0, dr: -1 },
    { dc: 1, dr: 1 }, { dc: 1, dr: -1 }, { dc: -1, dr: 1 }, { dc: -1, dr: -1 }
  ];

  /* ── the seed is the NAME, never the clock ───────────────────────── */
  function hash(str){
    let h = 2166136261 >>> 0;                    /* FNV-1a */
    for (let i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  /* mulberry32, with its counter ON the state object so a creature's
     stream is inspectable, resumable and — the point — reproducible. */
  function rnd(st){
    st.s = (st.s + 0x6D2B79F5) >>> 0;
    let t = st.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /* HOW LONG THIS CREATURE STANDS THERE. Drawn fresh every cycle: a mob
     with a fixed 14.2s idle is still a metronome, just a slower one. */
  function idleMs(st){
    return Math.round(IDLE_MS + (rnd(st) * 2 - 1) * IDLE_SLOP);
  }

  /* A NEW WANDERER. `home` is where the map data put it — the leash is
     measured from there forever, so a mob cannot random-walk across the
     screen over ten minutes and end up somewhere the level designer
     never looked at. */
  function state(key, home, radius, now){
    const st = { s: hash(key), key, home: { c: home.c, r: home.r },
                 radius: Math.max(1, radius | 0), nextAt: 0, dc: 0, dr: 0 };
    /* THE PHASE OFFSET — rule 1. The first move is somewhere inside the
       first cycle, so arriving on a screen does not start four
       creatures at once. */
    st.nextAt = now + Math.round(rnd(st) * (IDLE_MS + IDLE_SLOP));
    return st;
  }

  function due(st, now){ return now >= st.nextAt; }

  /* HOW LONG A LEG TAKES, so the schedule can be advanced without
     simulating a single frame — which is what makes catching up a
     minute of absence cheap. Durations come from the caller (WT). */
  function legMs(path, from, walkMs, diagMs){
    let ms = 0, c = from.c, r = from.r;
    for (const p of path){
      ms += (p.c !== c && p.r !== r) ? diagMs : walkMs;
      c = p.c; r = p.r;
    }
    return ms;
  }

  const cheb = (dc, dr) => Math.max(Math.abs(dc), Math.abs(dr));

  /* WHERE IT WALKS NEXT — one to three tiles, ending somewhere it is
     allowed to stand.

     canStep(c, r, dc, dr)  the map's own step rule (corners included)
     canStand(c, r)         may this creature OCCUPY that tile
     Both are the caller's, because "occupied" means the hero, the other
     mobs and the exits, none of which this file can see. */
  function leg(st, canStand, canStep){
    const out = [];
    let c = st.c, r = st.r, pdc = st.dc, pdr = st.dr;
    const steps = LEG_MIN + Math.floor(rnd(st) * (LEG_MAX - LEG_MIN + 1));
    for (let i = 0; i < steps; i++){
      const opts = [];
      let total = 0;
      for (const d of DIRS8){
        const nc = c + d.dc, nr = r + d.dr;
        if (cheb(nc - st.home.c, nr - st.home.r) > st.radius) continue;  /* the leash */
        if (!canStep(c, r, d.dc, d.dr)) continue;
        if (!canStand(nc, nr)) continue;
        /* KEEP GOING THE WAY YOU WERE GOING. Picking uniformly from
           eight made the creature jitter on the spot like a fly; a
           straight line reads as an animal walking somewhere. */
        const w = (d.dc === pdc && d.dr === pdr) ? 4 : 1;
        total += w;
        opts.push({ d, w });
      }
      if (!opts.length) break;             /* boxed in: a shorter walk */
      let pick = rnd(st) * total, chosen = opts[opts.length - 1].d;
      for (const o of opts){ pick -= o.w; if (pick < 0){ chosen = o.d; break; } }
      c += chosen.dc; r += chosen.dr;
      pdc = chosen.dc; pdr = chosen.dr;
      out.push({ c, r });
    }
    return out;
  }

  /* WHICH MARKERS WANDER. Data decides, not a name list: a marker says
     `roam: <tiles>` and it wanders that far from where it was placed.
     Everything else — the training dummy, the elder, a dungeon boss
     guarding its own room — stands exactly where it was put. */
  function radiusOf(mk){
    return (mk && mk.roam > 0) ? (mk.roam | 0) : 0;
  }

  return { IDLE_MS, IDLE_SLOP, LEG_MIN, LEG_MAX, PACE,
           state, due, idleMs, legMs, leg, radiusOf, hash, rnd };
})();

if (typeof window !== 'undefined') window.ROAM = ROAM;
if (typeof module !== 'undefined' && module.exports) module.exports = ROAM;
