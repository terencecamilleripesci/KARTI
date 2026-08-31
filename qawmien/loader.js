/* ═══════════════════════════════════════════════════════════════════
   LOADER — window.LOADER, the summoning-circle loading screen.

   The fiction hands us the art direction: the player is SUMMONED into
   the world on a glowing engraving, so the loading screen IS the
   summoning circle — a rune ring that draws itself in as assets arrive.
   The ring completing is the progress indicator; there is no separate
   bar, and the ring is HONEST: it advances only when a tracked asset
   actually lands, and stalls when loading stalls.

   CYCLES. The world is discrete 10x10 screens, so loading is per-map:
     · BOOT cycle — world.html opens it before any asset is requested;
       every sheet/atlas the first map needs registers via the hooks in
       sprite.js / world.js, world.html seals it, and when the last
       asset lands the circle flares and resolves into the game.
     · TRANSITION cycles — a SAFETY NET, and it should almost never be
       seen: every way out of the current map is warmed in the
       background from the moment that map is playable, so borders are
       normally already warm and open no cycle at all. If the player
       still beats the prefetch (a very fast crossing, or a prefetch
       that failed), world.js opens a short cycle for just the missing
       files: same component, same honest progress, instead of the
       half-drawn map that would otherwise arrive.

   THE CONTRACT with sprite.js / world.js image loading:
     want(url)  the url is needed; joins the current unsealed cycle
     done(url)  it arrived (fires whether or not a cycle is open)
     fail(url)  it 404'd / network died → the error strip + Retry shows;
                Retry re-arms the failed urls and calls the onRetry
                callback (world.html wires it to WORLD.retryAssets)
   Progress is COUNTED PER CYCLE but remembered globally — an asset that
   ever arrived is never counted as pending again (never re-fetched
   either; the caches in world.js/sprite.js hold the pixels).

   The DOM (#lscr and children) ships inline in world.html so the dark
   screen, wordmark and logo paint before ANY script or sheet arrives —
   a loading screen that waits on its own artwork is self-defeating.
   The logo is an inlined data-URI <img>; if it is somehow missing the
   canvas draws a rune glyph in its place (the .noart class).

   REUSE: drawEmblem(g, cx, cy, R, k, opts) renders the ring at
   progress k with no other state — lift it (plus the .lmark/.lsub2
   wordmark styles in world.html) to badge Il-Qawmien on KARTI's menu.

   prefers-reduced-motion: no rotation, no easing, no flare — the ring
   redraws only when real progress changes, then a short fade.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

window.LOADER = (function () {

  const REDUCED = typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  const GOLD = '#FFC542', VIOLET = '#8A5CFF';

  /* url → 'loading' | 'ok' | 'fail' — global, survives across cycles */
  const STATUS = {};
  let cyc = null;            /* { set, sealed, finished, onFinish }    */
  let retryCb = null;

  /* ── dom (markup lives in world.html; resolved lazily) ──────────── */
  let root = null, cv, g, sub, err, errmsg;
  function dom(){
    if (root) return true;
    root = document.getElementById('lscr');
    if (!root) return false;
    cv = document.getElementById('lcv');
    g = cv.getContext('2d');
    sub = document.getElementById('lsub');
    err = document.getElementById('lerr');
    errmsg = document.getElementById('lerrmsg');
    const rb = document.getElementById('lretry');
    if (rb) rb.addEventListener('click', retry);
    addEventListener('resize', fit);
    fit();
    return true;
  }

  let dpr = 1, cw = 0, chh = 0;
  function fit(){
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    cw = Math.max(1, Math.round(r.width)); chh = Math.max(1, Math.round(r.height));
    cv.width = Math.round(cw * dpr); cv.height = Math.round(chh * dpr);
    if (REDUCED) draw();               /* no rAF loop to catch the resize */
  }

  /* ── the registry ───────────────────────────────────────────────── */
  function counts(){
    let ok = 0, fail = 0, tot = 0;
    if (cyc) for (const u of cyc.set){
      tot++;
      if (STATUS[u] === 'ok') ok++;
      else if (STATUS[u] === 'fail') fail++;
    }
    return { ok, fail, tot };
  }
  function progress(){
    const c = counts();
    return c.tot ? c.ok / c.tot : 0;
  }

  function want(url){
    if (!STATUS[url]) STATUS[url] = 'loading';
    if (cyc && !cyc.sealed && !cyc.finished){ cyc.set.add(url); update(); }
  }
  function done(url){ STATUS[url] = 'ok'; update(); }
  function fail(url){ if (STATUS[url] !== 'ok') STATUS[url] = 'fail'; update(); }

  /* ── cycles ─────────────────────────────────────────────────────── */
  function open(onFinish){
    if (!dom()) return false;
    if (cyc){ if (onFinish) cyc.onFinish = onFinish; return true; }
    cyc = { set: new Set(), sealed: false, finished: false,
            onFinish: onFinish || null };
    root.hidden = false;
    root.classList.remove('done');
    hideErr();
    fit();
    startAnim();
    update();
    return true;
  }
  function seal(onFinish){
    if (!cyc || cyc.finished) return;
    if (onFinish) cyc.onFinish = onFinish;
    cyc.sealed = true;
    update();
  }

  function update(){
    if (!cyc || cyc.finished) return;
    const c = counts();
    if (sub) sub.textContent = c.tot
      ? Math.round(100 * c.ok / c.tot) + '% · ' + c.ok + ' / ' + c.tot
      : '…';
    if (c.fail > 0 && err && err.hidden){
      errmsg.textContent = c.fail === 1
        ? 'One file failed to load — the summoning faltered.'
        : c.fail + ' files failed to load — the summoning faltered.';
      err.hidden = false;
    }
    if (cyc.sealed && c.ok === c.tot) finishCycle();
    else if (REDUCED) draw();          /* redraw only on real change     */
  }

  function finishCycle(){
    cyc.finished = true;
    const cb = cyc.onFinish;
    if (REDUCED){ draw(); hide(); }
    else {
      root.classList.add('done');      /* CSS: flare + fade, then hide  */
      setTimeout(hide, 640);
    }
    if (cb){ try { cb(); } catch (e) {} }
  }

  function hide(){
    stopAnim();
    if (root){ root.hidden = true; root.classList.remove('done'); }
    cyc = null;
  }

  /* ── failure + retry ────────────────────────────────────────────── */
  function hideErr(){ if (err){ err.hidden = true; } }
  function retry(){
    if (!cyc) return;
    hideErr();
    for (const u of cyc.set)
      if (STATUS[u] === 'fail') STATUS[u] = 'loading';
    if (retryCb){ try { retryCb(); } catch (e) {} }
    update();
  }

  /* ── the ring ───────────────────────────────────────────────────── */
  let raf = 0, lastT = 0, spin = 0, shown = 0;
  function startAnim(){
    shown = REDUCED ? progress() : 0;
    if (REDUCED){ draw(); return; }
    if (raf) return;
    lastT = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function stopAnim(){
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function tick(t){
    if (!cyc){ raf = 0; return; }      /* stop the moment it is done    */
    const dt = Math.min(100, Math.max(0, t - lastT)); lastT = t;
    spin += dt * 0.00028;
    const target = cyc.finished ? 1 : progress();
    /* eased DISPLAY of honest progress: only ever moves toward what has
       really loaded, so a stall is a stall */
    shown += (target - shown) * Math.min(1, dt / 220);
    if (Math.abs(target - shown) < 0.002) shown = target;
    draw();
    raf = requestAnimationFrame(tick);
  }

  function draw(){
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, chh);
    drawEmblem(g, cw / 2, chh / 2, Math.min(cw, chh) / 2 - 12,
      REDUCED ? progress() : shown,
      { spin: REDUCED ? 0 : spin,
        reduced: REDUCED,
        glyph: root && root.classList.contains('noart') });
  }

  /* The whole emblem in one pure call — exported so KARTI can badge the
     game with it later. k = progress 0..1; opts.spin rotates the outer
     dashes; opts.glyph draws the rune glyph centre (logo fallback). */
  function drawEmblem(g, cx, cy, R, k, opts){
    opts = opts || {};
    k = Math.max(0, Math.min(1, k || 0));
    const TAU = Math.PI * 2, top = -Math.PI / 2;

    /* outer drifting rune-dashes */
    g.save();
    g.translate(cx, cy);
    g.rotate(opts.spin || 0);
    g.strokeStyle = 'rgba(138,92,255,0.20)';
    g.lineWidth = 1.5;
    g.setLineDash([2, 10]);
    g.beginPath(); g.arc(0, 0, R + 9, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.restore();

    /* track */
    g.strokeStyle = 'rgba(138,92,255,0.30)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();

    /* 36 rune ticks — lit as the circle completes */
    const lit = Math.round(k * 36);
    for (let i = 0; i < 36; i++){
      const a = top + (i / 36) * TAU;
      const on = i < lit;
      g.strokeStyle = on ? 'rgba(255,197,66,0.85)' : 'rgba(138,92,255,0.28)';
      g.lineWidth = on ? 2 : 1.5;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (R - 7), cy + Math.sin(a) * (R - 7));
      g.lineTo(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2));
      g.stroke();
    }

    /* the completing arc — glow builds as it nears the seal */
    if (k > 0){
      g.save();
      if (!opts.reduced){
        g.shadowColor = 'rgba(255,197,66,0.9)';
        g.shadowBlur = 4 + 12 * k;
      }
      g.strokeStyle = GOLD;
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath(); g.arc(cx, cy, R, top, top + k * TAU); g.stroke();
      if (k < 1){                       /* the scribing point */
        const a = top + k * TAU;
        g.fillStyle = '#FFE9AE';
        g.beginPath();
        g.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 3, 0, TAU);
        g.fill();
      }
      g.restore();
    }

    /* logo missing → a rune glyph so the centre is never empty */
    if (opts.glyph){
      g.save();
      g.strokeStyle = 'rgba(138,92,255,0.85)';
      g.lineWidth = 2;
      const d = R * 0.42;
      g.beginPath();                    /* the game's iso diamond */
      g.moveTo(cx, cy - d * 0.62);
      g.lineTo(cx + d, cy);
      g.lineTo(cx, cy + d * 0.62);
      g.lineTo(cx - d, cy);
      g.closePath();
      g.stroke();
      g.strokeStyle = 'rgba(255,197,66,0.8)';
      g.beginPath(); g.arc(cx, cy, d * 0.34, 0, TAU); g.stroke();
      g.fillStyle = GOLD;
      g.beginPath(); g.arc(cx, cy, 2.5, 0, TAU); g.fill();
      g.restore();
    }
  }

  /* ── public api ─────────────────────────────────────────────────── */
  return {
    open, seal, want, done, fail,
    onRetry(cb){ retryCb = cb; },
    active(){ return !!cyc && !cyc.finished; },
    settled(){ return !cyc; },
    /* has this url already arrived (this page-life)? world.js asks to
       decide whether a border needs a transition cycle at all */
    has(url){ return STATUS[url] === 'ok'; },
    drawEmblem,
    _status: STATUS                    /* test hook */
  };
})();
