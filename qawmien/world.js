/* ═══════════════════════════════════════════════════════════════════
   WORLD — window.WORLD, the exploration engine (WORLD_SPEC.md §5, §6).

   Renders the current map (ground / decor / markers / player) with the
   combat testbed's isometric projection, free-walks the player with A*,
   frames every map WHOLE with a static centred camera (Dofus screen
   model — scrolling only as a cannot-fit fallback), and transfers
   across map seams and exit markers. Combat itself lives in index.html/tactics.js — WORLD
   only steps aside via setMode('combat') and comes back.

   Geometry, walkability, seams and the atlas draw rule all come from
   window.WT (world-types.js). Nothing is redefined here.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const WORLD = (() => {

  const TW = WT.TW, TH = WT.TH;

  /* ── state ──────────────────────────────────────────────────────── */
  let map = null;                       /* current map object            */
  let mode = 'explore';                 /* 'explore' | 'combat'          */
  const camera = { x: 0, y: 0, scale: 1 };
  let camSnap = true;                   /* snap (not lerp) next update   */
  let onExitCb = null, onNpcCb = null;  /* single callbacks, last wins   */

  /* canvas bookkeeping — world.html owns the element and the RAF loop;
     WORLD sizes the backing store and owns pointerdown */
  let cv = null, cssW = 620, cssH = 460, dpr = 1;
  let bound = false;

  /* live markers for the current map, and per-session removals */
  let live = [];                        /* markers (player/npc/fight/exit) */
  let actors = [];                      /* { mk, s } for npc + fight       */
  const gone = {};                      /* '<mapId>:<markerId>' → true     */

  /* doorways (RUIN_ARCH decor) found on load: each gets a light spill on
     the floor in front of it; arches that lead OUTDOORS read as daylight */
  let doors = [];                       /* { c, r, dc, dr, out }           */
  let exitHint = null;                  /* the tapped way out: {c,r,dir}   */
  const REDUCED = typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── images ─────────────────────────────────────────────────────── */
  /* window.LOADER (world.html's summoning-circle loading screen) hears
     about every load so the ring can be honest; absent, no-ops */
  function ld(kind, src){
    const L = (typeof window !== 'undefined' && window.LOADER) || null;
    if (L){ try { L[kind](src); } catch (e) {} }
  }

  const ATLASES = {};                   /* src → {img, ready, failed, src, load} */
  function atlasFor(src, low){
    let a = ATLASES[src];
    if (!a){
      a = ATLASES[src] = { img: null, ready: false, failed: false, src };
      a.load = function (){
        a.failed = false;
        ld('want', src);
        const im = new Image();
        if (low){ try { im.fetchPriority = 'low'; } catch (e) {} }
        im.onload = () => { a.img = im; a.ready = true; ld('done', src); };
        im.onerror = () => { a.failed = true; ld('fail', src); };
        im.src = src;
      };
      a.load();
    }
    return a;
  }

  /* one shared sheet per creature; each marker gets its own playhead */
  const SHEETS = {};
  function sheetFor(name, low){
    const src = 'art/' + name + '-dir8.png';
    if (!SHEETS[src])
      SHEETS[src] = SPRITE.make(src, { cols: 6, rows: 4, clips: SPRITE.CLIPS_DIR,
                                       lowPriority: !!low });
    return SHEETS[src];
  }

  /* everything map m draws: its atlas + one walk sheet per creature
     standing on it. Requesting is idempotent — the caches above make
     "load" and "already have" the same call, so nothing ever re-fetches. */
  function mapAssets(m, low){
    const out = [ atlasFor(m.atlas || WT.ATLAS_SRC, low) ];
    if (m.bg) out.push(atlasFor(m.bg, low));   /* painted background, if any */
    for (const mk of m.markers || [])
      if ((mk.type === 'npc' || mk.type === 'fight') && mk.sprite)
        out.push(sheetFor(mk.sprite, low));
    return out;
  }

  /* ── the player actor ───────────────────────────────────────────── */
  const hero = {
    c: 0, r: 0,                         /* tile most recently ARRIVED at */
    bx: 0, by: 0,                       /* interpolated board position   */
    dir: 'S',
    dspr: null,                         /* hero-dir8.png  (walk)         */
    ispr: null,                         /* hero-idle.png  (drawn idle)   */
    step: null,                         /* {from,to,t,dur,fx,fy,tx,ty}   */
    path: [],                           /* tiles still to walk           */
    pending: null,                      /* path adopted after this step  */
    goal: null                          /* npc/fight marker to talk to   */
  };
  /* Which sheets the player walks in comes from window.HERO (player.js)
     when it exists — the class+gender the player chose at the
     reincarnation. Pre-choice (or without player.js) it is the default
     hero. Chosen classes have no directional idle sheet (`idle: null`);
     drawHero already holds the measured stand frame of the walk sheet
     for that case, same as NPCs. */
  let heroSheetKey = null;
  /* tick regeneration while the world is up. It reads the clock rather than
     counting frames, so a backgrounded tab or a sleeping phone still mends
     the right amount when you come back. */
  setInterval(() => { try { window.HERO && HERO.regen && HERO.regen(); } catch (e) {} }, 3000);

  /* ── worn overlay images ──────────────────────────────────────────
     SPRITE.make wants layers that are ALREADY loaded, on purpose: a sheet
     that waits on an image is a character who does not appear. So gear art
     is cached here, and only the layers that have actually arrived are
     handed over. When a late one finishes it clears the cache key, and the
     next frame rebuilds the sprite with it — the cap simply pops on a beat
     later instead of holding the whole character hostage.

     A piece whose art is missing loads nothing and is skipped forever,
     which is the right failure: gear that has not been drawn yet should
     look like gear that has not been drawn yet, not like a broken hero. */
  const wearCache = Object.create(null);
  function wearLayers(urls){
    const out = [];
    for (const u of urls){
      let e = wearCache[u];
      if (!e){
        e = wearCache[u] = { img: new Image(), ok: false, bad: false };
        e.img.onload  = () => { e.ok = true; heroSheetKey = ''; };
        e.img.onerror = () => { e.bad = true; };
        e.img.src = u;
      }
      if (e.ok) out.push(e.img);
    }
    return out;
  }

  function heroSprites(){
    const hs = (window.HERO && window.HERO.sheets) ? window.HERO.sheets()
      : { dir8: 'art/hero-dir8.png', idle: 'art/hero-idle.png' };
    /* the APPEARANCE is part of the cache key: change hair colour and the
       sheets must be rebuilt, or the player picks a colour and nothing
       happens, which reads as a broken picker rather than a cache */
    const tint = (window.HERO && HERO.appearance) ? HERO.appearance() : null;
    /* WHAT IS WORN IS PART OF THE KEY TOO, for exactly the reason the tint
       is: equip a cap, and if the cache does not notice, nothing happens on
       screen and the inventory reads as broken. The gear list is asked for
       per sheet kind because the walk sheet and the action sheet have
       separate overlays. */
    const P = window.PLAYER;
    const gender = (window.HERO && HERO.gender) || 'm';
    const wearD = (window.GEAR && P) ? GEAR.sheets(P.equip, gender, 'dir8') : [];
    const wearI = (window.GEAR && P) ? GEAR.sheets(P.equip, gender) : [];
    const key = hs.dir8 + '|' + (hs.idle || '') + '|' +
                (tint ? tint.hair + tint.skin + tint.eyes + tint.cloth : '') +
                '|' + wearD.join(',') + '|' + wearI.join(',');
    if (hero.dspr && key === heroSheetKey) return;
    heroSheetKey = key;
    hero.dspr = SPRITE.make(hs.dir8,
      { cols: 6, rows: 4, clips: SPRITE.CLIPS_DIR, tint, wear: wearLayers(wearD) });
    hero.ispr = hs.idle ? SPRITE.make(hs.idle,
      { cols: 6, rows: 4, clips: SPRITE.CLIPS_IDLE, tint, wear: wearLayers(wearI) }) : null;
    hero.dspr.clip = 'walk.0';
    if (hero.ispr) hero.ispr.clip = 'idle.0';
  }

  /* ── walkability: WT.canStep + dynamic marker blocking ──────────── */
  function dynBlocked(c, r){
    for (let i = 0; i < actors.length; i++)
      if (actors[i].mk.c === c && actors[i].mk.r === r) return true;
    return false;
  }
  function open(c, r){ return WT.isWalkable(map, c, r) && !dynBlocked(c, r); }
  /* WT.canStep is the static rule (incl. no corner cutting); npc/fight
     tiles are blocked dynamically on top, for the step AND both flanks */
  function stepOK(c, r, dc, dr){
    if (!WT.canStep(map, c, r, dc, dr)) return false;
    if (dynBlocked(c + dc, r + dr)) return false;
    if (dc && dr && (dynBlocked(c + dc, r) || dynBlocked(c, r + dr))) return false;
    return true;
  }

  /* a tile that TRANSFERS on arrival — an edge-strip tile with a live
     neighbour map, or a live exit marker with a live target (mirrors
     arriveAt exactly). arriveAt fires on EVERY arrival, including
     pass-through tiles mid-path, so A* must never route THROUGH one:
     it may only be entered as the goal itself (else clicking an
     interior tile can silently transfer the player, §4/§6). */
  function transfersOnArrival(c, r){
    const ed = WT.edgeDir(map, c, r);
    if (ed && window.MAPS && window.MAPS[map.neighbours[ed]]) return true;
    const mk = markerAtLive(c, r);
    return !!(mk && mk.type === 'exit' && window.MAPS && window.MAPS[mk.to]);
  }

  /* ── A*: 8-dir, 10/14, octile heuristic (§6) ────────────────────── */
  function octile(dc, dr){
    dc = Math.abs(dc); dr = Math.abs(dr);
    const m = Math.min(dc, dr);
    return 14 * m + 10 * (Math.max(dc, dr) - m);
  }
  /* multi-goal: returns [{c,r},...] EXCLUDING the start, [] if already
     on a goal, null if unreachable */
  function astar(sc, sr, goals){
    const W = map.w, N = W * map.h, start = sr * W + sc;
    const isGoal = {};
    for (const g of goals) isGoal[g.r * W + g.c] = true;
    if (isGoal[start]) return [];
    const h = (c, r) => {
      let best = Infinity;
      for (const g of goals) best = Math.min(best, octile(g.c - c, g.r - r));
      return best;
    };
    const gc = new Float64Array(N).fill(Infinity);
    const par = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const openL = [{ i: start, f: h(sc, sr) }];
    gc[start] = 0;
    while (openL.length){
      let b = 0;
      for (let k = 1; k < openL.length; k++) if (openL[k].f < openL[b].f) b = k;
      const i = openL.splice(b, 1)[0].i;
      if (closed[i]) continue;
      closed[i] = 1;
      const c = i % W, r = (i - c) / W;
      if (isGoal[i]){                                   /* reconstruct */
        const path = [];
        for (let j = i; j !== start; j = par[j])
          path.push({ c: j % W, r: (j - (j % W)) / W });
        path.reverse();
        return path;
      }
      for (const d of WT.DIRS8){
        if (!stepOK(c, r, d.dc, d.dr)) continue;
        const ni = (r + d.dr) * W + (c + d.dc);
        if (closed[ni]) continue;
        /* transfer tiles are terminal: goal only, never pass-through */
        if (!isGoal[ni] && transfersOnArrival(c + d.dc, r + d.dr)) continue;
        const ng = gc[i] + ((d.dc && d.dr) ? 14 : 10);
        if (ng < gc[ni]){
          gc[ni] = ng; par[ni] = i;
          openL.push({ i: ni, f: ng + h(c + d.dc, r + d.dr) });
        }
      }
    }
    return null;
  }

  /* route to any of `goals`; mk = marker to interact with on arrival.
     Issued mid-step it replaces the path AFTER the current step (§6). */
  function routeTo(goals, mk){
    if (!map) return false;
    goals = (goals || []).filter(g => open(g.c, g.r));
    if (!goals.length) return false;
    const from = hero.step ? hero.step.to : { c: hero.c, r: hero.r };
    const path = astar(from.c, from.r, goals);
    if (path === null) return false;
    hero.goal = mk || null;
    if (hero.step){ hero.pending = path; }
    else if (path.length){ hero.path = path; hero.pending = null; }
    else {                              /* already standing at the goal  */
      hero.path = []; hero.pending = null;
      if (mk) fireNpc(mk);
    }
    return true;
  }

  function fireNpc(mk){
    hero.goal = null;
    const d8 = SPRITE.dirOf(Math.sign(mk.c - hero.c), Math.sign(mk.r - hero.r));
    if (d8) hero.dir = d8;              /* face who you talk to          */
    if (onNpcCb) onNpcCb(mk);
  }

  /* ── loading + transfers ────────────────────────────────────────── */
  function load(mapId, at){
    const m = window.MAPS && window.MAPS[mapId];
    if (!m) return false;
    map = m;
    /* Rescale for the NEW map. fit() only recomputes when the canvas resizes,
       so without this a small ruin keeps the wide overworld's zoom (and vice
       versa) until the phone is rotated. */
    if (cssW) camera.scale = fitScale();
    atlasFor(m.atlas || WT.ATLAS_SRC);
    heroSprites();
    live = (m.markers || []).filter(mk => !(mk.id && gone[m.id + ':' + mk.id]));
    actors = [];
    for (const mk of live){
      if (mk.type !== 'npc' && mk.type !== 'fight') continue;
      /* a marker with NO sprite (Vell, Sula) must not ask for
         art/undefined-dir8.png — that 404 counted as a wanted file and
         wedged the loading gate on "one file failed". No sheet: the
         actor still stands (and blocks) as the fallback blob. */
      if (!mk.sprite){ actors.push({ mk, s: null }); continue; }
      const s = SPRITE.spawn(sheetFor(mk.sprite));
      const D = SPRITE.DIR[mk.dir] || SPRITE.DIR.S;
      s.clip = 'walk.' + D.row; s.frame = 0;   /* frozen; stand frame set on ready */
      actors.push({ mk, s });
    }
    /* `at` must be walkable, not merely in-bounds — an exit marker with a
       blocked target would otherwise embed the hero in a wall silently.
       A rejected `at` falls through to the normal spawn fallbacks below. */
    let p = at && WT.isWalkable(m, at.c, at.r) ? { c: at.c, r: at.r } : null;
    if (at && !p && WT.inMap(m, at.c, at.r))
      console.warn('WORLD.load: at (' + at.c + ',' + at.r + ') on ' + mapId +
                   ' is blocked; using fallback spawn');
    if (!p){
      const pm = live.find(mk => mk.type === 'player');
      if (pm) p = { c: pm.c, r: pm.r };
    }
    if (!p){
      /* fallback spawn: first OPEN tile that does NOT transfer on
         arrival. Edge-strip/exit tiles are sealed off from the map
         interior — A* never routes THROUGH a transfer tile (see the
         astar loop) — so spawning on one strands the hero on the seam
         (bare load('field-…') on maps without a player marker did
         exactly that). `map`, `live` and `actors` are already set
         above, so open()/transfersOnArrival() see the new map. */
      outer:
      for (let r = 0; r < m.h; r++)
        for (let c = 0; c < m.w; c++)
          if (open(c, r) && !transfersOnArrival(c, r)){ p = { c, r }; break outer; }
    }
    if (!p){
      /* degenerate map (interior fully blocked): any walkable tile */
      outer2:
      for (let r = 0; r < m.h; r++)
        for (let c = 0; c < m.w; c++)
          if (m.block[r][c] === 0){ p = { c, r }; break outer2; }
    }
    if (!p) p = { c: 0, r: 0 };
    doors = findDoors(m);
    exitHint = null;                    /* a new screen: nothing aimed at yet */
    hero.c = p.c; hero.r = p.r;
    hero.bx = WT.isoX(p.c, p.r); hero.by = WT.isoY(p.c, p.r);
    hero.step = null; hero.path = []; hero.pending = null; hero.goal = null;
    camSnap = true;                     /* no lerp across maps (§5)      */
    bind();
    maybeGate();
    /* Warm every way OUT of the map just arrived on. Deferred a beat so
       the first frame of the new screen paints first; when a gate IS up
       the ring's finish callback does it instead (below), so the player
       is always in control before a single prefetch byte is asked for. */
    if (!gateActive()) schedulePrefetch();
    return true;
  }

  /* ── the per-map loading gate ─────────────────────────────────────
     Everything the CURRENT screen needs but does not yet have. The boot
     cycle (world.html owns it) collects these through the load hooks;
     a border crossed before its prefetch finished gets a short
     transition cycle of its own — the same ring, briefly, instead of a
     half-drawn map. A warm border needs nothing and shows nothing, and
     since every way out warms in the background, warm is the norm: this
     gate is the safety net, not the usual path. */
  function pendingAssets(){
    if (!map) return [];
    const list = mapAssets(map);
    if (hero.dspr) list.push(hero.dspr);
    if (hero.ispr) list.push(hero.ispr);
    return list.filter(a => !a.ready);
  }
  function gateActive(){
    return !!(typeof window !== 'undefined' && window.LOADER &&
              window.LOADER.active());
  }
  function maybeGate(){
    const L = (typeof window !== 'undefined' && window.LOADER) || null;
    if (!L) return;                     /* no loader: old pop-in fallback */
    const pend = pendingAssets();
    if (!pend.length) return;
    if (L.active()) return;             /* boot cycle is already counting */
    if (!L.open(() => schedulePrefetch())) return;
    for (const a of pend) L.want(a.src);
    L.seal();
  }

  /* ── WARM EVERY WAY OUT (the owner's rule, and it is the right one) ─
     "If you can see how Dofus works, you can move up, right, down or
     left if it's available. If it's available, ALL directions must be
     loaded."

     An earlier version guessed from proximity and heading — warm only
     the edge you are near or walking at. That optimises BYTES at the
     cost of the thing that actually matters: the player can turn and
     leave by any open side at any moment, so a guess is wrong the
     instant they double back or cut a corner, and being wrong means
     arriving on a cold, half-drawn screen. That is the exact "rubbish"
     this whole change exists to kill.

     So: the moment the current map is playable, EVERY declared
     neighbour (up to four) plus every exit marker's target starts
     warming at low fetch priority. It runs after the player has
     control and never blocks becoming playable, so boot does not get
     slower. On arrival it repeats for the new map's neighbours.

     It costs far less than "four times a map" sounds: neighbours share
     the same atlas (one file for the whole field grid) and often the
     same creature sheets, and the caches above mean an asset already
     held is not requested again — walking the whole grid pays for each
     file exactly once. */
  /* Always DEFERRED, never fired in the same tick as the reveal: the
     frame that hands the player control should be spent drawing their
     map, not opening four more connections. It also keeps the promise
     that prefetching cannot delay becoming playable — measurably so,
     since bytes-to-playable is then finished before warming starts. */
  let prefT = 0;
  function schedulePrefetch(ms){
    if (typeof setTimeout !== 'function') return;
    clearTimeout(prefT);
    prefT = setTimeout(prefetchNeighbours, ms == null ? 250 : ms);
  }

  function prefetchNeighbours(){
    if (!map || gateActive()) return;
    if (typeof window === 'undefined' || !window.MAPS) return;
    const nb = map.neighbours || {};
    const seen = {};
    const warm = id => {
      if (!id || seen[id] || !window.MAPS[id]) return;
      seen[id] = true;
      mapAssets(window.MAPS[id], true);   /* idempotent; low priority */
    };
    for (const k of ['n', 'e', 's', 'w']) warm(nb[k]);
    for (const mk of live) if (mk.type === 'exit') warm(mk.to);
  }

  /* re-attempt every failed image — the loading screen's Retry button */
  function retryAssets(){
    for (const k in ATLASES){
      const a = ATLASES[k];
      if (a.failed && !a.ready) a.load();
    }
    if (SPRITE.retryFailed) SPRITE.retryFailed();
  }

  /* every arch in decor (RUIN_ARCH 11, or its +c-wall mirror 7) is a
     doorway: remember which walkable tile
     it opens onto (the floor its light spills across) and whether it
     leads OUTDOORS — via its own exit marker or its wall's edge seam —
     so the opening can read as daylight instead of torchlight */
  function findDoors(m){
    const found = [];
    const ARCH_R = (WT.TILES && WT.TILES.RUIN_ARCH) || 11; /* wall along +r */
    const ARCH_C = 7;                    /* mirror variant, wall along +c   */
    for (let r = 0; r < m.h; r++)
      for (let c = 0; c < m.w; c++){
        const t = m.decor[r][c];
        if (t !== ARCH_R && t !== ARCH_C) continue;
        let dc = 0, dr = 0;
        if (WT.isWalkable(m, c - 1, r)) dc = -1;
        else if (WT.isWalkable(m, c + 1, r)) dc = 1;
        else if (WT.isWalkable(m, c, r - 1)) dr = -1;
        else if (WT.isWalkable(m, c, r + 1)) dr = 1;
        const mk = (m.markers || []).find(k =>
          k.type === 'exit' && k.c === c && k.r === r);
        const ed = WT.edgeDir(m, c, r);
        const to = (mk && mk.to) || (ed && m.neighbours[ed]) || '';
        found.push({ c, r, dc, dr, sgn: t === ARCH_C ? -1 : 1,
                     out: /^field/.test(to) });
      }
    return found;
  }

  function transfer(toId, at){
    const fromId = map.id;
    load(toId, at);
    if (onExitCb) onExitCb(fromId, toId, { c: hero.c, r: hero.r });
    return true;
  }

  function markerAtLive(c, r){
    for (let i = 0; i < live.length; i++)
      if (live[i].c === c && live[i].r === r) return live[i];
    return null;
  }

  /* the player ARRIVED on (c,r) by walking — returns true if this tile
     transferred us elsewhere (edge strip or exit marker, §4) */
  function arriveAt(c, r){
    hero.c = c; hero.r = r;
    hero.bx = WT.isoX(c, r); hero.by = WT.isoY(c, r);
    if (hero.pending){ hero.path = hero.pending; hero.pending = null; }

    const ed = WT.edgeDir(map, c, r);   /* precedence n,e,s,w inside WT  */
    if (ed){
      const toId = map.neighbours[ed], nmap = window.MAPS[toId];
      if (nmap) return transfer(toId, WT.edgeTarget(ed, c, r, nmap));
    }
    const mk = markerAtLive(c, r);
    if (mk && mk.type === 'exit' && window.MAPS && window.MAPS[mk.to]) {
      /* THE LEVEL GATE on a dungeon mouth. The crypt is built for 10 and the
         necropolis for 25; walking into either at level 3 is not a challenge,
         it is a loading screen followed by a defeat. Turned away AT the door
         with the number said out loud, so it reads as "not yet" rather than
         as a broken exit — the player is standing on a glowing portal and
         something has to explain why nothing happened. */
      const need = mk.need | 0;
      if (need && window.HERO && (HERO.level | 0) < need) {
        if (window.PANELS && PANELS.toast)
          PANELS.toast((mk.name || 'This way') + ' is sealed until level ' +
                       need + '. You are ' + (HERO.level | 0) + '.');
        return;
      }
      /* THE KEY IS THE DOOR; THE LEVEL IS ONLY A FLOOR. A bare level gate
         made the whole island skippable — nothing between the ruin and the
         crypt had to be touched. The key is bought from the tavern with coins
         the monsters paid for, so the open world is the way in. It is
         CONSUMED here, which is what makes a run a decision rather than a
         habit and stops one purchase opening the crypt forever. */
      if (mk.dungeon && window.SHOP) {
        const k = SHOP.useKey(mk.dungeon);
        if (!k.ok) {
          if (window.PANELS && PANELS.toast)
            PANELS.toast('The way is locked. ' + (k.key ? k.key.name : 'A key') +
                         ' is sold at the tavern in Wayrest.');
          return;
        }
      }
      return transfer(mk.to, mk.at);
    }

    if (!hero.path.length && hero.goal){
      const g = hero.goal;
      if (Math.max(Math.abs(g.c - c), Math.abs(g.r - r)) <= 1) fireNpc(g);
      else hero.goal = null;
    }
    /* no per-tile prefetch any more: warming is per-MAP and every way
       out is already warming from the moment this screen became
       playable (see prefetchNeighbours), so where the hero stands
       inside the map no longer decides anything */
    return false;
  }

  function startStep(to){
    const dc = to.c - hero.c, dr = to.r - hero.r;
    if (!stepOK(hero.c, hero.r, dc, dr)){          /* world changed under us */
      hero.path = []; hero.pending = null; hero.goal = null;
      return;
    }
    const d8 = SPRITE.dirOf(dc, dr);
    if (d8) hero.dir = d8;
    const D = SPRITE.DIR[hero.dir] || SPRITE.DIR.S;
    /* restart=false keeps the cycle rolling tile to tile (tactics.js) */
    SPRITE.play(hero.dspr, 'walk.' + D.row, false);
    hero.step = {
      from: { c: hero.c, r: hero.r }, to, t: 0,
      dur: (dc && dr) ? WT.DIAG_MS : WT.WALK_MS,
      fx: hero.bx, fy: hero.by,
      tx: WT.isoX(to.c, to.r), ty: WT.isoY(to.c, to.r)
    };
  }

  /* ── update ─────────────────────────────────────────────────────── */
  function update(dt){
    if (mode !== 'explore' || !map) return;
    dt = Math.min(50, Math.max(0, dt || 0));

    /* movement: consume dt across step boundaries; `moved` is the time
       actually SPENT moving, and it — not the wall clock — drives the
       walk frames, so legs can never swing while the body stands still */
    let left = dt, moved = 0;
    while (left > 0){
      if (!hero.step){
        const nxt = hero.path.shift();
        if (!nxt) break;
        startStep(nxt);
        if (!hero.step) break;
      }
      const use = Math.min(left, hero.step.dur - hero.step.t);
      hero.step.t += use; left -= use; moved += use;
      const k = hero.step.t / hero.step.dur;
      hero.bx = hero.step.fx + (hero.step.tx - hero.step.fx) * k;
      hero.by = hero.step.fy + (hero.step.ty - hero.step.fy) * k;
      if (hero.step.t >= hero.step.dur - 1e-6){
        const to = hero.step.to;
        hero.step = null;
        if (arriveAt(to.c, to.r)) break;           /* transferred */
      }
    }
    if (moved > 0) SPRITE.step(hero.dspr, moved);
    else if (hero.ispr) {                          /* class sheets: no idle */
      const D = SPRITE.DIR[hero.dir] || SPRITE.DIR.S;
      if (hero.ispr.clip !== 'idle.' + D.row)
        SPRITE.play(hero.ispr, 'idle.' + D.row, false);
      SPRITE.step(hero.ispr, dt);                  /* it breathes */
    }

    /* camera: normally STATIC — the whole map is framed and centred, and
       walking never moves the view. Only the cannot-fit fallback follows
       the player (lerped, clamped to the map bounds). */
    const t = camTarget();
    if (camSnap || fitted){ camera.x = t.x; camera.y = t.y; camSnap = false; }
    else {
      const k = Math.min(1, dt / 300);
      camera.x += (t.x - camera.x) * k;
      camera.y += (t.y - camera.y) * k;
    }
  }

  function camTarget(){
    const R = GRID.RECT;
    const minX = R.x, maxX = R.x + R.w;
    const minY = R.y, maxY = R.y + R.h;
    if (fitted)                                    /* static, centred, whole */
      return { x: R.cx, y: R.cy };
    const hw = cssW / (2 * camera.scale), hh = cssH / (2 * camera.scale);
    return { x: clampAxis(hero.bx, minX, maxX, hw),
             y: clampAxis(hero.by, minY, maxY, hh) };
  }
  function clampAxis(v, mn, mx, half){
    if (mx - mn <= 2 * half) return (mn + mx) / 2;  /* map smaller than view */
    return Math.min(mx - half, Math.max(mn + half, v));
  }

  /* ── drawing ────────────────────────────────────────────────────── */
  function fit(cvEl){
    if (cv !== cvEl){ cv = cvEl; bind(); }
    const w = cvEl.clientWidth || cssW, h = cvEl.clientHeight || cssH;
    dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    if (w !== cssW || h !== cssH ||
        cvEl.width !== Math.round(w * dpr) || cvEl.height !== Math.round(h * dpr)){
      cssW = w; cssH = h;
      cvEl.width = Math.round(w * dpr);
      cvEl.height = Math.round(h * dpr);
      camera.scale = fitScale();
    }
  }

  /* THE DOFUS SCREEN MODEL — the rule the owner picked after testing on a
     phone: "the map always same size like dofus". Every map is the same
     screen rectangle, every map is framed WHOLE and centred, and the
     camera never scrolls — walking off an edge swaps to the neighbour
     screen, which is then framed whole in turn.

     WHAT IS FRAMED IS NOW THE RECTANGLE, not a diamond's bounding box.
     That is the whole of the "it is not full screen" fix at this end: the
     playfield's aspect used to be locked at 62:46 by the projection, so a
     phone held sideways could never be filled by it. GRID.RECT is 806x368
     — 2.19:1 — which IS a phone held sideways, so the same fit now covers
     the screen instead of leaving two thirds of it as scenery.

     NOTHING IS CROPPED. This briefly took up to 8% of overscan to eat a
     letterbox, on the argument that the cells it ate were the outermost
     ones. The owner's answer to that was immediate and correct: a cell
     you can see and cannot tap is worse than a strip of sky, and a cell
     you cannot see at all is worse still. So the whole rectangle is
     always inside the canvas, and the SURROUND fills whatever is left
     over with the map's own ground — the screen stays full of world, and
     everything you can walk on is on it.

     AND WHEN IT CANNOT FIT, IT FOLLOWS. A map is a Dofus map now — 1.5:1,
     560-odd cells, bigger than a phone — so framing it whole would mean a
     32x16 cell, half a thumb, and every tap a coin toss between two tiles.
     Below the floor the camera stops fitting and starts following, which
     is exactly what Dofus Touch does on a phone: it kept Dofus's map and
     changed the VIEW rather than reshaping the map to suit the glass. */
  const MIN_SCALE = 0.80;   /* a 51x26 cell — the floor is a FINGERTIP,
                               not legibility: below this the view scrolls
                               instead of shrinking. On a landscape phone
                               that shows the full width and ~62% of the
                               height, so it scrolls up and down and never
                               sideways; a tablet clears 1.0 and still
                               frames the whole map, as Dofus Touch does. */
  const MAX_SCALE = 2;
  let fitted = true;        /* current map fits whole at camera.scale      */

  function fitScale(){
    const R = GRID.RECT;
    const fit = Math.min(cssW / R.w, cssH / R.h);
    fitted = fit >= MIN_SCALE;
    return fitted ? Math.min(MAX_SCALE, fit) : MIN_SCALE;
  }

  /* ── ground variants — "texture the map like dofus" ────────────────
     The ground layer keeps its authored meaning; DRAWING picks among
     same-material atlas cells (and mirrored draws) per tile, so the
     floor reads as continuous ground instead of a countable grid of
     identical diamonds.  The pick is a pure hash of WORLD coordinates —
     outdoor screens hash their global 46x28 grid position (stride 9:
     one-tile overlap, so the shared seam strip renders identically on
     both screens), indoor maps fold the map id in.  Never Math.random:
     the ground must not shimmer across reloads.
       Ruin floors 1/2/6 share one crazy-paving layout (mkatlas) and are
     never mirrored (the paving is not symmetric); grass/dirt rims are
     x-symmetric by construction there, so their mirrored draws join as
     seamlessly as the originals. */
  const VPOOL = {
    1:  [[1, 0], [2, 0], [6, 0]],             /* ruin floor weatherings  */
    2:  [[2, 0], [6, 0], [1, 0]],
    16: [[16, 0], [16, 1], [17, 0], [17, 1]], /* grass: 2 cells x mirror */
    17: [[17, 0], [17, 1], [16, 0], [16, 1]],
    18: [[18, 0], [18, 1]],
    19: [[19, 0], [19, 1]]
  };
  function vhash(seed, x, y){
    let h = (Math.imul(x + 37, 0x9E3779B1) ^
             Math.imul(y + 91, 0x85EBCA6B) ^ seed) | 0;
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12;
    return h >>> 0;
  }
  const VBASIS = {};                    /* map id → hash basis, computed once */
  function vbasis(m){
    let b = VBASIS[m.id];
    if (b) return b;
    const f = WT.parseFieldId(m.id);
    let s = 0x5EED;
    if (!f)
      for (let i = 0; i < m.id.length; i++)
        s = (Math.imul(s, 31) + m.id.charCodeAt(i)) | 0;
    b = { s, ox: f ? f.gx * 9 : 0, oy: f ? f.gy * 9 : 0 };
    VBASIS[m.id] = b;
    return b;
  }
  function variantOf(m, c, r, base){
    const pool = VPOOL[base];
    if (!pool) return null;
    const b = vbasis(m);
    let k = vhash(b.s, b.ox + c, b.oy + r) % pool.length;
    /* nudge exact repeats apart: identical variants side by side are the
       strongest "it's a grid" cue left once the rims are unified */
    if (c > 0 && m.ground[r][c - 1] === base &&
        vhash(b.s, b.ox + c - 1, b.oy + r) % pool.length === k)
      k = (k + 1) % pool.length;
    else if (r > 0 && m.ground[r - 1][c] === base &&
        vhash(b.s, b.ox + c, b.oy + r - 1) % pool.length === k)
      k = (k + 1) % pool.length;
    return pool[k];
  }

  /* WHAT THE SURROUND IS MADE OF: this map's own commonest grounds, so the
     edge of the world looks like the world. Cached per map — counting tiles
     every frame for sixty frames a second would be absurd. */
  const SURROUND = {};
  function surroundTiles(m){
    if (SURROUND[m.id]) return SURROUND[m.id];
    const n = {};
    for (let r = 0; r < m.h; r++)
      for (let c = 0; c < m.w; c++){
        const i = m.ground[r][c];
        /* water and the cliff rim are the island's EDGE — repeating them
           outward would draw a sea of cliffs rather than more country */
        if (!i || i === WT.TILES.WATER || i === WT.TILES.CLIFF) continue;
        n[i] = (n[i] || 0) + 1;
      }
    const best = Object.keys(n).map(Number).sort((a, b) => n[b] - n[a]).slice(0, 3);
    return (SURROUND[m.id] = best.length ? best : [WT.TILES.GRASS]);
  }

  /* ── OCCLUSION on painted maps ────────────────────────────────────────
     A painted background is ONE picture, so the hero drawn after it always
     stood in front of every wall — walking "behind" the tavern drew him on
     its roof. Dofus composes exactly this split: a background JPEG per map,
     plus everything a character can pass behind as separate sprites drawn
     in base-Y order. So the tall things are CUT BACK OUT of the painting:
     one canvas piece per building (and per tree), clipped to the same prism
     silhouette the template extruded (tools/blockout.py, BLD_H there — the
     numbers below are that shared arithmetic), anchored at its base tile
     and depth-sorted into the same queue as actors and the hero. Hero
     behind the wall: the piece draws after him and hides him. Hero in
     front: his depth is greater and he draws over it. The picture never
     decides walkability; this never looks at block[][] for anything but
     WHERE the tall things stand. */
  function buildOcclusion(map, img, R){
    const D_ROCK = 26, D_TREE = 24, SPAN = 4;
    const BLD_H = TH * 2.0, LOW_H = TH * 0.8;
    const wall = (c, r) => c >= 0 && r >= 0 && c < map.w && r < map.h &&
                           !!map.block[r][c] && map.decor[r][c] === D_ROCK;
    const pieces = [], seen = {};
    const comps = [];
    for (let r = 0; r < map.h; r++)
      for (let c = 0; c < map.w; c++){
        if (!wall(c, r) || seen[c + ',' + r]) continue;
        const comp = [], st = [[c, r]];
        seen[c + ',' + r] = 1;
        while (st.length){
          const [cc, rr] = st.pop();
          comp.push([cc, rr]);
          for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]){
            const nc = cc + dc, nr = rr + dr;
            if (wall(nc, nr) && !seen[nc + ',' + nr]){
              seen[nc + ',' + nr] = 1; st.push([nc, nr]);
            }
          }
        }
        comps.push(comp);
      }
    for (const comp of comps){
      if (comp.length < 3) continue;               /* a boulder, painted flat */
      /* the footprint is the rectilinear closure — same rule as the
         template, so the cut-out clips exactly what was extruded */
      const foot = {};
      for (const [c, r] of comp) foot[c + ',' + r] = 1;
      const rows = {}, cols = {};
      for (const [c, r] of comp){
        (rows[r] = rows[r] || []).push(c);
        (cols[c] = cols[c] || []).push(r);
      }
      for (const r in rows){
        const cs = rows[r].sort((a, b) => a - b);
        for (let i = 1; i < cs.length; i++)
          if (cs[i] - cs[i-1] > 1 && cs[i] - cs[i-1] <= SPAN + 1)
            for (let c = cs[i-1] + 1; c < cs[i]; c++) foot[c + ',' + r] = 1;
      }
      for (const c in cols){
        const rs = cols[c].sort((a, b) => a - b);
        for (let i = 1; i < rs.length; i++)
          if (rs[i] - rs[i-1] > 1 && rs[i] - rs[i-1] <= SPAN + 1)
            for (let r = rs[i-1] + 1; r < rs[i]; r++) foot[c + ',' + r] = 1;
      }
      /* ONE PIECE PER TILE, not per building. A terrace of party-walled
         houses spans depths 5..16; cut as one piece at depth 16 it hid a
         hero standing in FRONT of its shallow west end (seen in the first
         headless run). Per tile, each column of the volume sorts at its
         own base depth like any decor tile, the pieces are cut from the
         same painting so together they re-compose it exactly, and the
         hero slots between them wherever he truly stands. */
      const tiles = Object.keys(foot).map(k => k.split(',').map(Number));
      const H = tiles.length === comp.length ? LOW_H : BLD_H;
      for (const t of tiles) pieces.push(makePiece([t], H, img, R));
    }
    /* trees: a canopy is the other thing a hero walks behind */
    for (let r = 0; r < map.h; r++)
      for (let c = 0; c < map.w; c++)
        if (map.block[r][c] && map.decor[r][c] === D_TREE)
          pieces.push(makeTreePiece(c, r, img, R));
    return pieces;
  }

  function pieceFromClip(tiles, img, R, bounds, clip){
    const [x0, y0, x1, y1] = bounds;
    const w = Math.ceil(x1 - x0), h = Math.ceil(y1 - y0);
    const cv = document.createElement('canvas');
    /* board units 1:1 — the same resolution the background is drawn at */
    cv.width = w; cv.height = h;
    const c2 = cv.getContext('2d');
    c2.translate(-x0, -y0);
    clip(c2);
    c2.clip();
    c2.imageSmoothingEnabled = true;
    c2.drawImage(img, R.x, R.y, R.w, R.h);
    let d = -1e9;
    for (const [c, r] of tiles) d = Math.max(d, c + r);
    return { cv, x: x0, y: y0, d };
  }

  function makePiece(tiles, H, img, R){
    const HEAD = TH * 0.9;               /* domes and parapets overpaint the box */
    const T = H + HEAD;                  /* clip the full raised top face */
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const hexes = [];
    for (const [c, r] of tiles){
      const bx = WT.isoX(c, r), by = WT.isoY(c, r);
      hexes.push([[bx, by - T - TH / 2], [bx + TW / 2, by - T],
                  [bx + TW / 2, by], [bx, by + TH / 2],
                  [bx - TW / 2, by], [bx - TW / 2, by - T]]);
      x0 = Math.min(x0, bx - TW / 2); x1 = Math.max(x1, bx + TW / 2);
      y0 = Math.min(y0, by - T - TH / 2); y1 = Math.max(y1, by + TH / 2);
    }
    return pieceFromClip(tiles, img, R, [x0, y0, x1, y1], (c2) => {
      c2.beginPath();
      for (const hx of hexes){
        c2.moveTo(hx[0][0], hx[0][1]);
        for (let i = 1; i < hx.length; i++) c2.lineTo(hx[i][0], hx[i][1]);
        c2.closePath();
      }
    });
  }

  function makeTreePiece(c, r, img, R){
    const bx = WT.isoX(c, r), by = WT.isoY(c, r);
    const cx = bx + TW * 0.04, cy = by - TH * 1.25;    /* template's canopy */
    const rx = TW * 0.60, ry = TH * 0.80;
    const bounds = [cx - rx, cy - ry, cx + rx, Math.max(cy + ry, by + 2)];
    return pieceFromClip([[c, r]], img, R, bounds, (c2) => {
      c2.beginPath();
      c2.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      c2.rect(bx - 5, by - TH * 1.25, 10, TH * 1.25 + 2);
    });
  }

  function draw(g){
    fit(g.canvas);
    g.setTransform(1, 0, 0, 1, 0, 0);
    /* THE VOID THE ISLAND FLOATS IN, not an empty frame.
       The map fills the screen now, so on a phone this is painted and then
       covered. It still matters on a shape the rectangle cannot fill — a
       tablet upright, a squat desktop window — where a band is left rather
       than cropping real ground away. Flat #0d0f14 read as "the map failed
       to fill the screen"; a sky reads as height, which is what a floating
       island is supposed to have.
       Painted straight to the canvas in device pixels, before the camera
       transform, so it costs one gradient regardless of zoom. */
    const H = g.canvas.height, Wd = g.canvas.width;
    let sky = g._sky;
    if (!sky || g._skyH !== H) {
      sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0.00, '#171a2e');       /* upper air, cold          */
      sky.addColorStop(0.55, '#101324');
      sky.addColorStop(1.00, '#080a14');       /* the drop below the island */
      g._sky = sky; g._skyH = H;
    }
    g.fillStyle = sky;
    g.fillRect(0, 0, Wd, H);
    /* a soft light behind the island so it sits IN the sky rather than on it */
    let glow = g._glow;
    if (!glow || g._glowH !== H) {
      glow = g.createRadialGradient(Wd / 2, H * 0.52, 0,
                                    Wd / 2, H * 0.52, Math.max(Wd, H) * 0.62);
      glow.addColorStop(0, 'rgba(120,140,210,0.16)');
      glow.addColorStop(1, 'rgba(120,140,210,0)');
      g._glow = glow; g._glowH = H;
    }
    g.fillStyle = glow;
    g.fillRect(0, 0, Wd, H);
    if (!map) return;
    const s = camera.scale;
    g.setTransform(dpr * s, 0, 0, dpr * s,
      g.canvas.width / 2 - camera.x * dpr * s,
      g.canvas.height / 2 - camera.y * dpr * s);
    const atlas = ATLASES[map.atlas || WT.ATLAS_SRC];

    /* (a-1) THE PAINTED MAP (ISLAND_DESIGN.md: Dofus maps are PAINTINGS).
       A map that declares `bg` is drawn as ONE illustration — generated
       from its own blockout template (tools/blockout.py --map <id>), so
       the picture and block[][] agree by construction. It replaces the
       surround, the ground loop and the decor layer entirely; markers,
       actors and the hero still draw on top, and walkability never looks
       at the picture. The rect is shared arithmetic with the template
       generator: board x spans twice the diamond's width, the image
       keeps its 1536:1024 aspect, and the diamond sits centred
       vertically. While the picture is still loading (or failed), the
       tile renderer below carries on as before — pop-in, not a void. */
    let bgUp = false;
    if (map.bg){
      const b = ATLASES[map.bg] || atlasFor(map.bg);
      if (b.ready){
        let R = map._bgRect;
        if (!R){
          /* THE PICTURE IS THE RECTANGLE. This used to be arithmetic that
             fitted an illustration around a diamond and hoped the ground
             landed under the walkable cells; now the playfield IS the
             screen rectangle, so a painting is simply that rectangle and
             registration is one assignment. Anything the painter draws
             outside its aspect is centre-cropped, never stretched. */
          const g0 = GRID.RECT, k = Math.max(g0.w / b.img.width,
                                             g0.h / b.img.height);
          const w = b.img.width * k, h = b.img.height * k;
          R = map._bgRect = { x: g0.cx - w / 2, y: g0.cy - h / 2, w, h };
        }
        g.imageSmoothingEnabled = true;
        g.drawImage(b.img, R.x, R.y, R.w, R.h);
        if (!map._occ) map._occ = buildOcclusion(map, b.img, R);
        bgUp = true;
      }
    }

    /* (a0) THE SURROUND — art out to the screen edge, not a void.
       The map now fills the screen, so this has almost nothing left to do:
       it only covers the sliver outside the rectangle on a device whose
       shape is not the rectangle's, and the half-cell notches the
       staggered rows leave along the left and right sides. Worth keeping
       precisely because it is what stops those reading as holes.

       The same iso lattice is continued past the map on every side, filled
       with the map's own ground. Nothing here is walkable and nothing is
       stored — it is drawn from the map's existing tiles, so every screen
       gets a surround that matches it without a single byte of new data.
       Drawn FIRST, so the real map and everything standing on it paints
       over the top.

       NOTE the test is GRID.has, not the array bounds: the cells of the
       bounding box that fall outside the rectangle are void, not map, and
       they are exactly where the notches are. */
    /* ONLY WHEN THERE IS SOMETHING TO SURROUND. A map is bigger than a
       phone now and the camera follows inside it, so the usual case is
       that the map covers the screen and every surround tile is
       off-camera — thousands of drawImage calls a frame for nothing. */
    const RS = GRID.RECT;
    const hW0 = (g.canvas.width  / (dpr * s)) / 2;
    const hH0 = (g.canvas.height / (dpr * s)) / 2;
    const covered = RS.x <= camera.x - hW0 && RS.x + RS.w >= camera.x + hW0 &&
                    RS.y <= camera.y - hH0 && RS.y + RS.h >= camera.y + hH0;
    if (!bgUp && !covered && atlas && atlas.ready) {
      const halfW = hW0, halfH = hH0;
      /* how far out, in tiles, the corners of the viewport reach */
      const pad = Math.ceil((halfW / (TW / 2) + halfH / (TH / 2)) / 2) + 2;
      const fill = surroundTiles(map);
      for (let r = -pad; r < map.h + pad; r++)
        for (let c = -pad; c < map.w + pad; c++){
          if (GRID.has(c, r)) continue;                              /* the map */
          const x = WT.isoX(c, r), y = WT.isoY(c, r);
          if (Math.abs(x - camera.x) > halfW + TW ||
              Math.abs(y - camera.y) > halfH + TH) continue;         /* off screen */
          const i = fill[(((c * 7 + r * 13) % fill.length) + fill.length) % fill.length];
          WT.drawTile(g, atlas.img, i, x, y);
        }
    }

    /* (a) ground, row-major, through the variant pools — baked into the
       picture when a painted background is up */
    if (!bgUp)
    for (let r = 0; r < map.h; r++)
      for (let c = 0; c < map.w; c++){
        const i = map.ground[r][c];
        if (!i) continue;
        const x = WT.isoX(c, r), y = WT.isoY(c, r);
        if (!(atlas && atlas.ready)){ fbGround(g, i, x, y); continue; }
        const v = variantOf(map, c, r, i);
        if (!v) WT.drawTile(g, atlas.img, i, x, y);
        else if (!v[1]) WT.drawTile(g, atlas.img, v[0], x, y);
        else {                          /* mirrored about the tile centre */
          g.save();
          g.translate(2 * x, 0); g.scale(-1, 1);
          WT.drawTile(g, atlas.img, v[0], x, y);
          g.restore();
        }
      }

    /* (a2) doorway light, over the floor but under decor and actors:
       a soft pool spilling from each archway so the way on reads at a
       glance. Torch-warm indoors; daylight where the arch leads out. */
    const breathe = REDUCED ? 0.5 :
      0.5 + 0.5 * Math.sin(((typeof performance !== 'undefined'
        ? performance.now() : Date.now())) / 640);
    for (const d of doors) drawDoorPool(g, d, breathe);

    /* (a3) THE WAY OUT, MARKED — but only the one you asked for. Dofus
       shows the arrow on the tile under the pointer, not on every tile
       that leaves the map; drawing all of them (33 on this screen) turned
       the border into wallpaper and said nothing about where you are
       going. So it appears on the tile you TAP, and stays there while you
       walk to it: the answer to "what happens if I go here".
       Drawn under decor and actors, so a tree or a monster standing on
       the edge still covers it. */
    if (exitHint) drawExitArrow(g, exitHint, breathe);

    /* (b) decor + actors, one list sorted by depth (c+r); the player
       uses its interpolated depth; ties draw decor first */
    const q = [];
    if (!bgUp)                          /* decor is baked into the painting */
    for (let r = 0; r < map.h; r++)
      for (let c = 0; c < map.w; c++){
        const i = map.decor[r][c];
        if (i) q.push({ d: c + r, k: 0, i, x: WT.isoX(c, r), y: WT.isoY(c, r) });
      }
    /* the tall parts of the painting, cut back out so they can occlude:
       depth-sorted by their base like any decor (see buildOcclusion) */
    if (bgUp && map._occ)
      for (const p of map._occ) q.push({ d: p.d, k: 0, occ: p });
    for (const a of actors)
      q.push({ d: a.mk.c + a.mk.r, k: 1, a,
               x: WT.isoX(a.mk.c, a.mk.r), y: WT.isoY(a.mk.c, a.mk.r) });
    q.push({ d: hero.by / (TH / 2), k: 1, hero: true });
    q.sort((A, B) => (A.d - B.d) || (A.k - B.k));    /* stable for the rest */
    for (const e of q){
      if (e.k === 0){
        if (e.occ) g.drawImage(e.occ.cv, e.occ.x, e.occ.y);
        else if (atlas && atlas.ready) WT.drawTile(g, atlas.img, e.i, e.x, e.y, true);
        else fbDecor(g, e.i, e.x, e.y);
      }
      else if (e.hero) drawHero(g);
      else drawActor(g, e.a);
    }

    /* (b2) daylight in outdoor doorways — painted into the arch opening
       right on top of its tile so the exit reads as a way OUT. Later
       queue entries never overlap the opening (it faces the viewer). */
    for (const d of doors)
      drawDoorLight(g, WT.isoX(d.c, d.r), WT.isoY(d.c, d.r), d.sgn, d.out, breathe);
  }

  /* ── THE EXIT ARROW ───────────────────────────────────────────────
     Does this tile hand the player to another screen, and which way?
     Asked through WT.edgeDir — the same rule that actually fires the
     transfer — rather than re-derived, because a corner cell sits on two
     sides and only ever transfers one way, and an arrow that promised the
     other would be a lie you could walk into. */
  function exitAt(m, c, r){
    if (!m || !WT.isWalkable(m, c, r)) return null;
    const d = WT.edgeDir(m, c, r);
    if (!d || !(window.MAPS && window.MAPS[(m.neighbours || {})[d]])) return null;
    return { c: c, r: r, d: d };
  }

  /* A CHEVRON LYING ON THE TILE, pointing the way out. Screen-space, not
     tile-space: 'east' means the east SCREEN edge, which is where the
     player is about to walk, so a flat arrow reads truer here than one
     drawn along the iso axes. */
  const ARROW_DIR = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  function drawExitArrow(g, a, breathe){
    const dir = ARROW_DIR[a.d];
    if (!dir) return;
    const x = WT.isoX(a.c, a.r), y = WT.isoY(a.c, a.r);
    const len = TH * 0.42, wide = TW * 0.20;
    /* rides a little way out of the tile, and breathes so it reads as an
       invitation rather than as a decal on the ground */
    const push = 3 + 3 * breathe;
    const cx = x + dir[0] * push, cy = y + dir[1] * push * 0.7;
    g.save();
    g.translate(cx, cy);
    g.scale(1, TH / TW);                 /* lie it down into the iso plane */
    g.rotate(Math.atan2(dir[1], dir[0]));
    g.beginPath();                        /* a chevron, not a solid head   */
    g.moveTo(-len * 0.55, -wide);
    g.lineTo(len * 0.55, 0);
    g.lineTo(-len * 0.55, wide);
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(0,0,0,.40)';
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.stroke();
    g.lineWidth = 2.6;
    g.strokeStyle = 'rgba(255,197,66,' + (0.55 + 0.35 * breathe).toFixed(3) + ')';
    g.stroke();
    g.restore();
  }

  /* the pool of light a doorway throws on the floor in front of it */
  function drawDoorPool(g, d, breathe){
    const cx = WT.isoX(d.c + d.dc * 0.65, d.r + d.dr * 0.65);
    const cy = WT.isoY(d.c + d.dc * 0.65, d.r + d.dr * 0.65);
    const warm = !d.out;
    const a = (warm ? 0.34 : 0.26) + 0.11 * breathe;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.translate(cx, cy);
    g.scale(1, TH / TW);                 /* iso ellipse */
    /* warm pools throw a little further: the ruin-01 arch sits one tile
       past the right edge of a 430px view at spawn, and this glow bleeding
       in from off-screen is what tells the player the way on is east */
    const R = TW * (warm ? 1.75 : 1.45);
    const gr = g.createRadialGradient(0, 0, 2, 0, 0, R);
    gr.addColorStop(0, warm ? 'rgba(255,176,84,' + a + ')'
                            : 'rgba(186,216,255,' + a + ')');
    gr.addColorStop(0.55, warm ? 'rgba(228,128,52,' + (a * 0.45) + ')'
                               : 'rgba(160,200,255,' + (a * 0.45) + ')');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  /* Light THROUGH the opening — the owner's "2 side hole".

     The gate prism is pierced clean through (tools/mkatlas.py img_arch):
     the near opening sits in the visible sloped face, the SAME opening
     exists on the far face one wall-depth into the scene at offset
     (RECX·sgn, RECY) — keep these equal to mkatlas's RDX,RDY — and the
     see-through gap is where the two overlap.  In board px from the tile
     centre: base(u) = (sgn·30u, 23-23u), u in [0.20,0.80], arched head
     AH(u) = 22 - 7t², t = (u-0.5)/0.30.  archPath is inset just inside
     the painted jambs and voussoirs; offset (ox,oy) moves it to the far
     face. */
  const RECX = -6, RECY = -4.5;         /* one wall-depth, board px        */
  function archPath(g, x, y, sgn, ox, oy){
    const s = sgn || 1, u0 = 0.195, u1 = 0.805;
    const dx = ox || 0, dy = oy || 0;
    const bx = u => x + dx + s * 30 * u, by = u => y + dy + 23 - 23 * u;
    g.beginPath();
    g.moveTo(bx(u0), by(u0));
    for (let k = 0; k <= 16; k++){
      const u = u0 + (u1 - u0) * k / 16, t = (u - 0.5) / 0.30;
      g.lineTo(bx(u), by(u) - (20.5 - 7 * t * t));
    }
    g.lineTo(bx(u1), by(u1));
    g.closePath();
  }

  /* What fills the gap is DISTANCE, not a lamp: daylight with a horizon
     where the arch leads outdoors, the far room's low firelight where it
     does not.  Everything stays clipped inside the near opening, so the
     painted soffit and jambs keep framing the hole — filling the whole
     arch (the old way) is exactly what made it read as a glowing niche. */
  function drawDoorLight(g, x, y, sgn, out, breathe){
    const s = sgn || 1;
    g.save();
    /* (1) bloom: a halo spilling out of the gap onto the stone, centred
       on the THROUGH-hole so the glow reads as coming from beyond */
    const bl = (out ? 0.26 : 0.18) + 0.06 * breathe;
    const hx = x + RECX * 0.55 * s, hy = y + RECY - 2;
    const R = TW * 0.72;
    const gb = g.createRadialGradient(hx, hy, 1, hx, hy, R);
    gb.addColorStop(0, out ? 'rgba(226,240,255,' + bl + ')'
                           : 'rgba(255,182,96,' + bl + ')');
    gb.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = gb;
    g.beginPath(); g.arc(hx, hy, R, 0, Math.PI * 2); g.fill();
    /* (2) clip to the near opening: nothing below may touch the stone */
    g.globalCompositeOperation = 'source-over';
    archPath(g, x, y, s);
    g.clip();
    /* (3) light from beyond lying on the passage floor */
    const fx = u => x + s * 30 * u, fy = u => y + 23 - 23 * u;
    g.globalCompositeOperation = 'lighter';
    g.beginPath();
    g.moveTo(fx(0.2), fy(0.2)); g.lineTo(fx(0.8), fy(0.8));
    g.lineTo(fx(0.8) + RECX * s, fy(0.8) + RECY);
    g.lineTo(fx(0.2) + RECX * s, fy(0.2) + RECY);
    g.closePath();
    g.fillStyle = (out ? 'rgba(200,224,255,' : 'rgba(255,176,90,') +
                  (0.10 + 0.08 * breathe) + ')';
    g.fill();
    /* (4) the far opening — the see-through gap itself */
    g.globalCompositeOperation = 'source-over';
    archPath(g, x, y, s, RECX * s, RECY);
    const gr = g.createLinearGradient(0, y + RECY - 21, 0, y + RECY + 18);
    if (out){                           /* sky, haze, horizon, lit ground */
      gr.addColorStop(0, 'rgba(178,216,255,0.97)');
      gr.addColorStop(0.50, 'rgba(236,244,250,0.96)');
      gr.addColorStop(0.58, 'rgba(228,232,196,0.96)');
      gr.addColorStop(1, 'rgba(158,172,126,0.95)');
    } else {                            /* the next room, firelit from low */
      gr.addColorStop(0, 'rgba(26,16,12,0.94)');
      gr.addColorStop(0.55, 'rgba(126,60,24,0.92)');
      gr.addColorStop(1, 'rgba(255,190,108,0.95)');
    }
    g.fillStyle = gr;
    g.fill();
    g.restore();
  }

  function drawActor(g, a){
    const D = SPRITE.DIR[a.mk.dir] || SPRITE.DIR.S;
    const s = a.s;
    if (!s){                            /* sprite-less marker: the blob */
      fbBlob(g, WT.isoX(a.mk.c, a.mk.r), WT.isoY(a.mk.c, a.mk.r),
             a.mk.type === 'fight' ? '#c25b5b' : '#c2a85b');
      return;
    }
    if (s.ready && !s._stood){          /* measured both-feet-down frame */
      s.clip = 'walk.' + D.row;
      s.frame = (s.stand && s.stand[D.row] != null) ? s.stand[D.row] : 0;
      s._stood = true;
    }
    const x = WT.isoX(a.mk.c, a.mk.r), y = WT.isoY(a.mk.c, a.mk.r);
    if (!SPRITE.draw(g, s, x, y + WT.FOOT_Y, WT.SPR_SCALE, D.flip))
      fbBlob(g, x, y, a.mk.type === 'fight' ? '#c25b5b' : '#c2a85b');
  }

  function drawHero(g){
    const D = SPRITE.DIR[hero.dir] || SPRITE.DIR.S;
    const x = hero.bx, y = hero.by + WT.FOOT_Y;
    let ok = false;
    if (hero.step && hero.dspr.ready){
      if (hero.dspr.clip !== 'walk.' + D.row)
        SPRITE.play(hero.dspr, 'walk.' + D.row, false);
      ok = SPRITE.draw(g, hero.dspr, x, y, WT.SPR_SCALE, D.flip);
    } else if (!hero.step && hero.ispr && hero.ispr.ready){
      if (hero.ispr.clip !== 'idle.' + D.row)
        SPRITE.play(hero.ispr, 'idle.' + D.row, false);
      ok = SPRITE.draw(g, hero.ispr, x, y, WT.SPR_SCALE, D.flip);
    } else if (hero.dspr.ready){        /* idle sheet missing: hold stand */
      hero.dspr.clip = 'walk.' + D.row;
      hero.dspr.frame = (hero.dspr.stand && hero.dspr.stand[D.row] != null)
        ? hero.dspr.stand[D.row] : 0;
      ok = SPRITE.draw(g, hero.dspr, x, y, WT.SPR_SCALE, D.flip);
    }
    if (!ok) fbBlob(g, hero.bx, hero.by, '#5b9fc2');
  }

  /* ── fallback art (atlas/sheets still loading or missing) ───────── */
  const FB_GROUND = {                   /* rough category colours        */
    1:'#6b5d50',2:'#635648',3:'#5c5044',4:'#7a4a3c',5:'#57504a',6:'#6b5d50',7:'#635648',
    16:'#4c7a3f',17:'#487239',18:'#548243',19:'#7a5a3a',20:'#8a8578',
    21:'#2f5d8a',22:'#6e6a63',23:'#8a6a45'
  };
  const FB_TALL = { 7:1,8:1,9:1,10:1,11:1,24:1,25:1,26:1,27:1,28:1,29:1,31:1 };
  function diamond(g, x, y){
    g.beginPath();
    g.moveTo(x, y - TH / 2); g.lineTo(x + TW / 2, y);
    g.lineTo(x, y + TH / 2); g.lineTo(x - TW / 2, y);
    g.closePath();
  }
  function fbGround(g, i, x, y){
    diamond(g, x, y);
    g.fillStyle = FB_GROUND[i] || '#4a5560';
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.stroke();
  }
  function fbDecor(g, i, x, y){
    if (FB_TALL[i]){
      g.fillStyle = i >= 24 ? '#3f6b35' : '#57504a';
      g.fillRect(x - 12, y - 44, 24, 44);
    } else {
      g.fillStyle = '#7d726a';
      g.fillRect(x - 10, y - 14, 20, 14);
    }
  }
  function fbBlob(g, x, y, col){
    g.save(); g.translate(x, y); g.scale(1, 0.5);
    g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fill(); g.restore();
    g.fillStyle = col;
    g.fillRect(x - 7, y - 30, 14, 28);
  }

  /* ── input (§5): WORLD owns pointerdown on #wcv ─────────────────── */
  function bind(){
    if (bound) return;
    const el = cv || (typeof document !== 'undefined' && document.getElementById('wcv'));
    if (!el) return;
    cv = el;
    el.addEventListener('pointerdown', pointer);
    bound = true;
  }

  function pointer(ev){
    if (mode !== 'explore' || !map) return;
    const rect = cv.getBoundingClientRect();
    const bx = (ev.clientX - rect.left - cssW / 2) / camera.scale + camera.x;
    const by = (ev.clientY - rect.top - cssH / 2) / camera.scale + camera.y;
    const t = WT.boardToTile(bx, by);
    if (!WT.inMap(map, t.c, t.r)) return;
    const mk = markerAtLive(t.c, t.r);
    if (mk && (mk.type === 'npc' || mk.type === 'fight')){
      exitHint = null; interact(mk); return;
    }
    /* the arrow answers the tap: aim at a tile that leaves the map and it
       appears there and rides along until you arrive (load() clears it on
       the new screen). Aim anywhere else and it goes. */
    const ok = walkTo(t.c, t.r);
    exitHint = ok ? exitAt(map, t.c, t.r) : exitHint;
  }

  /* clicking an npc/fight: path to the nearest adjacent walkable tile
     (8-neighbourhood); fire onNpc on arrival — or at once if already there */
  function interact(mk){
    const goals = [];
    for (const d of WT.DIRS8){
      const c = mk.c + d.dc, r = mk.r + d.dr;
      if (open(c, r)) goals.push({ c, r });
    }
    routeTo(goals, mk);
  }

  /* ── public API ─────────────────────────────────────────────────── */
  function walkTo(c, r){
    hero.goal = null;
    return routeTo([{ c, r }], null);
  }

  function removeMarker(id){            /* drop a marker for the session */
    if (!map || !id) return false;
    const i = live.findIndex(mk => mk.id === id);
    if (i < 0) return false;
    gone[map.id + ':' + id] = true;
    live.splice(i, 1);
    actors = actors.filter(a => a.mk.id !== id);
    return true;
  }

  return {
    load, draw, walkTo, update,
    playerAt(){ return { c: hero.c, r: hero.r }; },
    onExit(cb){ onExitCb = cb; },
    onNpc(cb){ onNpcCb = cb; },
    setMode(m){ if (m === 'explore' || m === 'combat') mode = m; },
    get mode(){ return mode; },
    camera,
    removeMarker,                       /* extension: glue drops a beaten fight */
    refreshHeroSprites(){ heroSprites(); maybeGate(); },
                                        /* HERO changed identity — load the
                                           new walk sheets NOW, behind a
                                           brief circle rather than a blob */
    retryAssets,                        /* loading screen's Retry button */
    schedulePrefetch,                   /* loader finish → warm every way out */
    prefetchNeighbours,                 /* the same, immediately (tests)      */
    get _map(){ return map; },          /* test hooks */
    _hero: hero,
    _assets(){ return { atlases: ATLASES, sheets: SHEETS }; }
  };
})();

if (typeof window !== 'undefined') window.WORLD = WORLD;
