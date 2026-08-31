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
  function heroSprites(){
    const hs = (window.HERO && window.HERO.sheets) ? window.HERO.sheets()
      : { dir8: 'art/hero-dir8.png', idle: 'art/hero-idle.png' };
    const key = hs.dir8 + '|' + (hs.idle || '');
    if (hero.dspr && key === heroSheetKey) return;
    heroSheetKey = key;
    hero.dspr = SPRITE.make(hs.dir8,
      { cols: 6, rows: 4, clips: SPRITE.CLIPS_DIR });
    hero.ispr = hs.idle ? SPRITE.make(hs.idle,
      { cols: 6, rows: 4, clips: SPRITE.CLIPS_IDLE }) : null;
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

  /* every RUIN_ARCH in decor is a doorway: remember which walkable tile
     it opens onto (the floor its light spills across) and whether it
     leads OUTDOORS — via its own exit marker or its wall's edge seam —
     so the opening can read as daylight instead of torchlight */
  function findDoors(m){
    const found = [];
    const ARCH = (WT.TILES && WT.TILES.RUIN_ARCH) || 11;
    for (let r = 0; r < m.h; r++)
      for (let c = 0; c < m.w; c++){
        if (m.decor[r][c] !== ARCH) continue;
        let dc = 0, dr = 0;
        if (WT.isWalkable(m, c - 1, r)) dc = -1;
        else if (WT.isWalkable(m, c + 1, r)) dc = 1;
        else if (WT.isWalkable(m, c, r - 1)) dr = -1;
        else if (WT.isWalkable(m, c, r + 1)) dr = 1;
        const mk = (m.markers || []).find(k =>
          k.type === 'exit' && k.c === c && k.r === r);
        const ed = WT.edgeDir(m, c, r);
        const to = (mk && mk.to) || (ed && m.neighbours[ed]) || '';
        found.push({ c, r, dc, dr, out: /^field/.test(to) });
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
    if (mk && mk.type === 'exit' && window.MAPS && window.MAPS[mk.to])
      return transfer(mk.to, mk.at);

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
    const headroom = WT.TILE_PX * WT.SCALE;        /* room for tall decor */
    const minX = WT.isoX(0, map.h - 1) - TW / 2;
    const maxX = WT.isoX(map.w - 1, 0) + TW / 2;
    const minY = WT.isoY(0, 0) - TH / 2 - headroom;
    const maxY = WT.isoY(map.w - 1, map.h - 1) + TH / 2;
    if (fitted)                                    /* static, centred, whole */
      return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
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
     size (10x10), every map is framed WHOLE and centred, and the camera
     never scrolls — walking off an edge swaps to the neighbour screen,
     which is then framed whole in turn.

     fitScale therefore always returns the scale that fits the entire map
     (capped at MAX so a desktop window doesn't blow tiles up absurdly).
     `fitted` records whether that fit stayed above the readability floor;
     when it did (the normal case — 10x10 fits every phone), camTarget is
     the static map centre. Only if a map somehow cannot fit at a readable
     scale does the old follow-and-clamp scroll come back as a fallback. */
  const MIN_SCALE = 0.55;   /* below this a character stops being readable */
  const MAX_SCALE = 2;
  let fitted = true;        /* current map fits whole at camera.scale      */

  function footprint(m){    /* isometric extent of the map, board pixels  */
    return { mw: (m.w + m.h) * (WT.TW / 2),
             mh: (m.w + m.h) * (WT.TH / 2) + WT.TILE_PX * WT.SCALE };
  }
  function fitScale(){
    const m = map;
    if (!m || !m.w || !m.h){ fitted = true; return Math.min(MAX_SCALE, Math.max(1, cssW / 620)); }
    const f = footprint(m);
    const fit = Math.min(cssW / f.mw, cssH / f.mh);
    fitted = fit >= MIN_SCALE;
    return fitted ? Math.min(MAX_SCALE, fit) : MIN_SCALE;
  }

  function draw(g){
    fit(g.canvas);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0d0f14';
    g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    if (!map) return;
    const s = camera.scale;
    g.setTransform(dpr * s, 0, 0, dpr * s,
      g.canvas.width / 2 - camera.x * dpr * s,
      g.canvas.height / 2 - camera.y * dpr * s);
    const atlas = ATLASES[map.atlas || WT.ATLAS_SRC];

    /* (a) ground, row-major */
    for (let r = 0; r < map.h; r++)
      for (let c = 0; c < map.w; c++){
        const i = map.ground[r][c];
        if (!i) continue;
        const x = WT.isoX(c, r), y = WT.isoY(c, r);
        if (atlas && atlas.ready) WT.drawTile(g, atlas.img, i, x, y);
        else fbGround(g, i, x, y);
      }

    /* (a2) doorway light, over the floor but under decor and actors:
       a soft pool spilling from each archway so the way on reads at a
       glance. Torch-warm indoors; daylight where the arch leads out. */
    const breathe = REDUCED ? 0.5 :
      0.5 + 0.5 * Math.sin(((typeof performance !== 'undefined'
        ? performance.now() : Date.now())) / 640);
    for (const d of doors) drawDoorPool(g, d, breathe);

    /* (b) decor + actors, one list sorted by depth (c+r); the player
       uses its interpolated depth; ties draw decor first */
    const q = [];
    for (let r = 0; r < map.h; r++)
      for (let c = 0; c < map.w; c++){
        const i = map.decor[r][c];
        if (i) q.push({ d: c + r, k: 0, i, x: WT.isoX(c, r), y: WT.isoY(c, r) });
      }
    for (const a of actors)
      q.push({ d: a.mk.c + a.mk.r, k: 1, a,
               x: WT.isoX(a.mk.c, a.mk.r), y: WT.isoY(a.mk.c, a.mk.r) });
    q.push({ d: hero.by / (TH / 2), k: 1, hero: true });
    q.sort((A, B) => (A.d - B.d) || (A.k - B.k));    /* stable for the rest */
    for (const e of q){
      if (e.k === 0){
        if (atlas && atlas.ready) WT.drawTile(g, atlas.img, e.i, e.x, e.y);
        else fbDecor(g, e.i, e.x, e.y);
      }
      else if (e.hero) drawHero(g);
      else drawActor(g, e.a);
    }

    /* (b2) daylight in outdoor doorways — painted into the arch opening
       right on top of its tile so the exit reads as a way OUT. Later
       queue entries never overlap the opening (it faces the viewer). */
    for (const d of doors)
      if (d.out) drawDaylight(g, WT.isoX(d.c, d.r), WT.isoY(d.c, d.r));
  }

  /* the pool of light a doorway throws on the floor in front of it */
  function drawDoorPool(g, d, breathe){
    const cx = WT.isoX(d.c + d.dc * 0.65, d.r + d.dr * 0.65);
    const cy = WT.isoY(d.c + d.dc * 0.65, d.r + d.dr * 0.65);
    const warm = !d.out;
    const a = (warm ? 0.24 : 0.15) + 0.09 * breathe;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.translate(cx, cy);
    g.scale(1, TH / TW);                 /* iso ellipse */
    /* warm pools throw a little further: the ruin-01 arch sits one tile
       past the right edge of a 430px view at spawn, and this glow bleeding
       in from off-screen is what tells the player the way on is east */
    const R = TW * (warm ? 1.55 : 1.15);
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

  /* pale sky filling an outdoor arch opening (atlas cell x 42..88,
     y 26..118 → board offsets at SCALE 0.5 around the tile centre) */
  function drawDaylight(g, x, y){
    const l = x - 10.5, rgt = x + 11.5, top = y - 27, bot = y + 17.5;
    g.save();
    g.beginPath();
    g.moveTo(l, bot);
    g.lineTo(l, top + 9);
    g.quadraticCurveTo(l, top, x + 0.5, top);
    g.quadraticCurveTo(rgt, top, rgt, top + 9);
    g.lineTo(rgt, bot);
    g.closePath();
    const gr = g.createLinearGradient(0, top, 0, bot);
    gr.addColorStop(0, 'rgba(201,226,255,0.95)');
    gr.addColorStop(0.62, 'rgba(232,238,232,0.92)');
    gr.addColorStop(1, 'rgba(250,238,196,0.95)');
    g.fillStyle = gr;
    g.fill();
    g.restore();
  }

  function drawActor(g, a){
    const D = SPRITE.DIR[a.mk.dir] || SPRITE.DIR.S;
    const s = a.s;
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
  const FB_TALL = { 8:1,9:1,10:1,11:1,24:1,25:1,26:1,27:1,28:1,29:1,31:1 };
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
    if (mk && (mk.type === 'npc' || mk.type === 'fight')){ interact(mk); return; }
    walkTo(t.c, t.r);
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
