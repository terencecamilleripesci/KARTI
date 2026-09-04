/* ═══════════════════════════════════════════════════════════════════
   HUD — window.HUD. One file, loaded by BOTH documents.

   world.html boots it in 'explore' mode: bottom bar [Bag][AP][HP][MP]
   [Hero], settings gear + menu top-right (Sound, Back to KARTI).
   index.html boots it in 'combat' mode: the same bar grown to two rows
   (skill icons above, [Map]…[End turn] at the edges), plus the turn
   strip top-left. Geometry comes from HUDT (hud-types.js) so the two
   bars are pixel-identical where they overlap — that is the continuity.

   State rules (HUD_SPEC.md §8):
   · explore reads window.PLAYER on a 300ms poll — never across frames;
   · combat is painted only via HUD.combatPaint(snapshot) from tactics;
   · HUD itself diffs hp between reads and fires the crystal-ball
     damage / heal reactions — callers never trigger a reaction.

   API (§1): init({mode,onAction}) · setMode(mode) · refresh() ·
   combatPaint(snap) · soundOn() · sfx(name).
   onAction: explore 'bag'|'hero'; combat 'spell'(id)|'end'|'map'.
   Settings actions are handled internally.

   The crystal ball is a canvas: fluid level = hp/hpMax, colour from
   HUDT.ORB.hpColor (red throughout, darkening as it drains; the fill
   LEVEL carries the meaning so nothing rides on colour alone),
   sine-wave surface, specular glass, the number outlined in bg so it
   stays ≥4.5:1 on any fluid. Its rAF pauses on document.hidden and is
   never attached to the page's game loop. Under reduced motion the
   fluid is static and level changes snap (flash/shimmer stay — they
   are pure opacity).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

window.HUD = (function () {

  const T = window.HUDT;
  if (!T) {
    /* hud-types.js must load first; fail soft so lab pages survive */
    return { init() {}, setMode() {}, refresh() {}, combatPaint() {},
             soundOn() { return true; }, sfx() {} };
  }

  const RM    = matchMedia('(prefers-reduced-motion: reduce)');
  const SMALL = matchMedia('(max-width: ' + T.BP.SMALL + 'px)');
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

  /* ── colour helpers (canvas needs computed rgba strings) ───────── */
  function hexRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16),
            parseInt(h.slice(5, 7), 16)];
  }
  function hexA(h, a) {
    const c = hexRgb(h);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  function mix(h, h2, k) {          /* h→h2 by k, returns rgb() string */
    const a = hexRgb(h), b = hexRgb(h2);
    const m = i => Math.round(a[i] + (b[i] - a[i]) * k);
    return 'rgb(' + m(0) + ',' + m(1) + ',' + m(2) + ')';
  }

  /* ═════════════════════════ sound ═══════════════════════════════
     A small WebAudio kit. The Sound toggle is REAL: soundOn() reads
     localStorage at play time, so muting in one document silences the
     other instantly. Master gain .15; SFX envelopes stay short. The
     AudioContext is created lazily on the first user gesture.

     Two kinds of audio, one system (deliberate split):
     · SFX are PROCEDURAL — 22 spells as files would be 22 requests for
       200ms sounds; synthesised they weigh nothing, start with zero
       decode latency, and share an element "family voice";
     · MUSIC is ONE lazily-fetched file (audio/theme.mp3, ~657 KB) —
       a real rendered loop is more musical than anything procedural.
       Owned by the EXPLORE document only: combat runs in an iframe
       OVER world.html, so the bed keeps playing through fights and
       across map changes without ever restarting. If the file is
       missing or the decode fails, nothing else is affected. */
  let actx = null, master = null, noiseBuf = null;

  function soundOn() {
    try { return localStorage.getItem(T.KEYS.SOUND) !== '0'; }
    catch (e) { return true; }
  }
  function ac() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        actx = new AC();
        master = actx.createGain();
        master.gain.value = 0.15;
        master.connect(actx.destination);
      } catch (e) { actx = null; return null; }
    }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }
  function tone(f0, f1, dur, type, delay, vol) {
    const a = ac();
    if (!a) return;
    const t = a.currentTime + (delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 1, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* filtered noise — the other half of every spell voice. One shared 1s
     buffer, played from a varying offset so repeats don't sound stamped. */
  function nz(f0, f1, dur, type, q, vol, delay, atk) {
    const a = ac();
    if (!a) return;
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = a.currentTime + (delay || 0);
    const s = a.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    const f = a.createBiquadFilter();
    f.type = type || 'bandpass';
    f.Q.value = q || 0.9;
    f.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.5, t + (atk || 0.012));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.7); s.stop(t + dur + 0.02);
  }

  /* the element family voices — every spell is composed from these,
     so an earth spell always thuds and an air spell always breathes */
  function thud(f, vol, dur, delay) {          /* earth: weight          */
    tone(f, f * 0.45, dur || 0.15, 'sine', delay, vol || 1);
    nz(f * 4, f * 1.5, (dur || 0.15) * 0.9, 'lowpass', 0.7,
       (vol || 1) * 0.5, delay);
  }
  function whoosh(f0, f1, dur, vol, delay, atk) { /* air: moving breath  */
    nz(f0, f1, dur, 'bandpass', 0.9, vol, delay, atk);
  }
  function crackle(n, vol, delay) {            /* fire: sparks           */
    for (let i = 0; i < n; i++)
      nz(2400 + i * 600, 3600, 0.03, 'highpass', 0.8, vol,
         (delay || 0) + i * 0.05 + Math.random() * 0.02);
  }

  /* one voice per spell id — classes.js kits, the ram, and the stock
     testbed/enemy kit. Family = element; variation = what the spell DOES
     (a pull drags down, a push sweeps away, a heal rises, a trap hisses).
     tools/checkaudio.js proves this table covers every id and carries
     no orphans. */
  const CAST_SFX = {
    /* ── earth: low, heavy, certain ── */
    maul:      () => { thud(100, 1, 0.16); },
    rootgrasp: () => { tone(75, 52, 0.30, 'sine', 0, 0.9);       /* drag */
                       nz(500, 140, 0.30, 'lowpass', 0.7, 0.5, 0.02, 0.08); },
    quake:     () => { tone(60, 38, 0.38, 'sine', 0, 1.1);       /* wide */
                       nz(300, 90, 0.40, 'lowpass', 0.7, 0.7, 0, 0.05);
                       thud(90, 0.6, 0.14, 0.12); },
    crush:     () => { nz(700, 200, 0.12, 'lowpass', 0.7, 0.4, 0, 0.06);
                       thud(85, 1.3, 0.24, 0.10); },             /* lift…slam */
    bulwark:   () => { thud(120, 0.7, 0.12);                     /* set + hum */
                       tone(98, 0, 0.28, 'triangle', 0.05, 0.5);
                       tone(147, 0, 0.28, 'triangle', 0.07, 0.35); },
    crook:     () => { thud(140, 0.8, 0.12); },                  /* woody tap */
    callram:   () => { thud(110, 0.6, 0.12);                     /* warm call */
                       tone(196, 294, 0.22, 'triangle', 0.08, 0.5);
                       tone(294, 392, 0.18, 'triangle', 0.24, 0.4); },
    ramhorn:   () => { thud(120, 0.9, 0.12); },                  /* head-butt */
    /* ── air: breath and speed ── */
    dart:      () => { whoosh(900, 2600, 0.12, 0.6); },
    pierce:    () => { whoosh(600, 3200, 0.20, 0.65);            /* keener */
                       tone(1250, 1600, 0.12, 'sine', 0.06, 0.12); },
    gust:      () => { whoosh(2000, 500, 0.24, 0.7, 0, 0.05); }, /* sweeps away */
    windstep:  () => { whoosh(700, 2400, 0.18, 0.5, 0, 0.05);    /* shimmer */
                       tone(880, 1320, 0.16, 'sine', 0.05, 0.2); },
    whistle:   () => { tone(1180, 1500, 0.12, 'sine', 0, 0.35);
                       tone(1500, 1230, 0.14, 'sine', 0.12, 0.3);
                       nz(1800, 2600, 0.20, 'bandpass', 2, 0.15); },
    flockmate: () => { whoosh(600, 2000, 0.16, 0.45);            /* two cross */
                       whoosh(2000, 600, 0.16, 0.45, 0.10); },
    /* ── fire: crackle and bloom ── */
    cinder:    () => { whoosh(900, 2200, 0.15, 0.55); crackle(2, 0.3, 0.03); },
    pyre:      () => { tone(95, 50, 0.30, 'sine', 0, 0.8);       /* whoomp */
                       nz(500, 2500, 0.32, 'bandpass', 0.8, 0.6, 0, 0.07);
                       crackle(4, 0.35, 0.08); },
    snare:     () => { nz(1400, 900, 0.22, 'bandpass', 1.4, 0.3, 0, 0.05);
                       tone(160, 120, 0.14, 'sine', 0.02, 0.4);  /* sly hiss */
                       crackle(2, 0.2, 0.10); },
    flashburn: () => { nz(1600, 2600, 0.10, 'bandpass', 0.9, 0.6);
                       thud(150, 0.6, 0.10); },                  /* hot puff */
    /* ── water: liquid, rounded ── */
    lash:      () => { tone(420, 260, 0.16, 'sine', 0, 0.5);     /* wet whip */
                       nz(900, 280, 0.16, 'lowpass', 0.8, 0.5); },
    mend:      () => { tone(392, 523, 0.28, 'sine', 0, 0.45);    /* rises */
                       nz(600, 220, 0.30, 'lowpass', 0.7, 0.35, 0, 0.10); },
    wavebreak: () => { nz(220, 700, 0.14, 'lowpass', 0.8, 0.55, 0, 0.06);
                       nz(700, 200, 0.18, 'lowpass', 0.8, 0.5, 0.12);
                       tone(120, 80, 0.20, 'sine', 0.05, 0.5); },/* breaker */
    blessing:  () => { tone(392, 0, 0.25, 'sine', 0, 0.35);      /* 3 soft */
                       tone(494, 0, 0.25, 'sine', 0.12, 0.32);
                       tone(587, 0, 0.30, 'sine', 0.24, 0.3);
                       nz(500, 200, 0.45, 'lowpass', 0.7, 0.3, 0, 0.15); },
    /* ── the stock testbed / enemy kit (tactics.js SPELLS + AI) ── */
    strike:    () => { thud(110, 0.9, 0.14); },
    bolt:      () => { whoosh(800, 2400, 0.14, 0.55); },
    blast:     () => { tone(95, 52, 0.26, 'sine', 0, 0.7);
                       nz(500, 2200, 0.26, 'bandpass', 0.8, 0.5, 0, 0.05); },
    shove:     () => { whoosh(1600, 450, 0.18, 0.55, 0, 0.04); },
    thwack:    () => { nz(600, 250, 0.10, 'lowpass', 0.8, 0.5);  /* padded */
                       tone(140, 90, 0.10, 'sine', 0, 0.5); },
    /* ── the bestiary ──
       `butt` had no entry and has been silent since the goat was written: an
       unknown id falls through to the generic soft cast, so a 74hp wall of a
       creature slamming into you made the noise of a thrown pebble.
       Horn on bone — a hard woody knock, then the weight behind it. */
    butt:      () => { thud(150, 0.9, 0.09);
                       thud(80, 1.2, 0.20, 0.06); },
    taillash:  () => { whoosh(1500, 500, 0.12, 0.5);             /* dry, quick */
                       tone(300, 180, 0.10, 'sine', 0.02, 0.35); },
    /* ── the two dungeon bosses ──
       Lower and longer than anything on the island. The first time a player
       meets these, the SOUND is the warning. */
    undertow:  () => { nz(300, 90, 0.42, 'lowpass', 0.7, 0.6, 0, 0.14);
                       tone(70, 46, 0.40, 'sine', 0, 0.9);       /* the drag */
                       tone(105, 69, 0.34, 'sine', 0.06, 0.4); },
    deadweight:() => { nz(600, 180, 0.14, 'lowpass', 0.7, 0.45);
                       thud(72, 1.5, 0.30, 0.10); },             /* lift, drop */
    dirge:     () => { tone(146, 0, 0.50, 'sine', 0, 0.5);       /* held chord */
                       tone(174, 0, 0.50, 'sine', 0.03, 0.42);
                       tone(220, 0, 0.46, 'sine', 0.06, 0.34);
                       nz(400, 180, 0.55, 'lowpass', 0.7, 0.26, 0.10, 0.18); },
    antiphon:  () => { tone(392, 196, 0.26, 'sawtooth', 0, 0.28); /* sung down */
                       tone(294, 147, 0.30, 'sawtooth', 0.05, 0.24);
                       thud(96, 1.1, 0.18, 0.08); }
  };

  function sfx(name) {
    if (!soundOn()) return;
    if (name.slice(0, 5) === 'cast:') {
      const f = CAST_SFX[name.slice(5)];
      if (f) f();
      else whoosh(700, 1600, 0.12, 0.4);       /* unknown id: soft cast */
      return;
    }
    if (name === 'tap')         tone(880, 0, 0.05, 'square', 0, 0.5);
    else if (name === 'select') { tone(660, 0, 0.06, 'sine', 0, 0.8);
                                  tone(990, 0, 0.08, 'sine', 0.07, 0.8); }
    else if (name === 'damage') tone(110, 55, 0.12, 'sine', 0, 1);
    else if (name === 'heal')   tone(660, 880, 0.12, 'sine', 0, 0.6);
    else if (name === 'error')  tone(220, 175, 0.10, 'square', 0, 0.5);
    /* the quieter moments around the spells */
    else if (name === 'die')    { tone(160, 42, 0.40, 'sine', 0, 0.5);
                                  nz(400, 120, 0.35, 'lowpass', 0.7, 0.3, 0, 0.08); }
    else if (name === 'turn')   { tone(523, 0, 0.07, 'sine', 0, 0.25);
                                  tone(659, 0, 0.09, 'sine', 0.08, 0.25); }
    else if (name === 'reward') { tone(523, 0, 0.12, 'sine', 0, 0.3);
                                  tone(659, 0, 0.12, 'sine', 0.10, 0.3);
                                  tone(784, 0, 0.16, 'sine', 0.20, 0.3); }
    else if (name === 'trap')   { tone(100, 50, 0.24, 'sine', 0, 0.7);
                                  nz(600, 2400, 0.24, 'bandpass', 0.8, 0.5, 0, 0.04);
                                  crackle(3, 0.3, 0.06); }
  }

  /* ── music — one 112s ambient loop, fetched lazily ───────────────
     Only after the first gesture, only if sound is on, only in the
     explore document. The loop points are sample-exact: the file is
     built perfectly periodic (tools/mkmusic.py), so loopEnd − loopStart
     = MUSIC_LOOP seconds lands on the identical waveform whether or not
     the browser trims the mp3 encoder padding (the threshold scan skips
     it when it doesn't). Every failure path is swallowed: no music can
     never mean no game. */
  const MUSIC_URL = 'audio/theme.mp3';
  const MUSIC_LOOP = 112.0;                 /* = tools/mkmusic.py LOOP_SECONDS */
  const MUSIC_VOL = 0.5;                    /* × master .15 → well under SFX  */
  const music = { buf: null, src: null, gain: null,
                  loading: false, failed: false };

  function musicPlay() {
    const a = ac();
    if (!a || !music.buf || music.src) return;
    try {
      const d = music.buf.getChannelData(0);
      let s = 0;
      while (s < d.length && Math.abs(d[s]) < 0.004) s++;
      const start = s < d.length ? s / music.buf.sampleRate : 0;
      const src = a.createBufferSource();
      src.buffer = music.buf; src.loop = true;
      src.loopStart = start;
      src.loopEnd = Math.min(start + MUSIC_LOOP, music.buf.duration);
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(MUSIC_VOL, a.currentTime + 2.5);
      src.connect(g); g.connect(master);
      src.start(a.currentTime, start);
      music.src = src; music.gain = g;
    } catch (e) {}
  }
  function musicStop() {
    if (!music.src) return;
    try { music.src.stop(); } catch (e) {}
    try { music.src.disconnect(); } catch (e) {}
    try { music.gain.disconnect(); } catch (e) {}
    music.src = null; music.gain = null;
  }
  function musicStart() {
    if (mode !== 'explore' || !soundOn() || music.failed || music.src) return;
    if (music.buf) return musicPlay();
    if (music.loading || !ac()) return;
    music.loading = true;
    fetch(MUSIC_URL)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(b => new Promise((res, rej) => {  /* Safari: callback form */
        try { actx.decodeAudioData(b, res, rej); } catch (e) { rej(e); }
      }))
      .then(buf => { music.buf = buf; music.loading = false;
                     if (soundOn()) musicPlay(); })
      .catch(() => { music.loading = false; music.failed = true; });
  }

  /* warm the context up inside the first real gesture; the music fetch
     rides the same gesture, a beat later so it never competes with the
     tap that started the game */
  document.addEventListener('pointerdown', function boot() {
    if (soundOn()) { ac(); setTimeout(musicStart, 800); }
  }, { once: true, capture: true, passive: true });

  /* screen off / tab hidden → the bed stops; back → it resumes.
     Guarded on actx so this can never CREATE a context without a
     gesture. Restarting from the loop top is fine for ambient. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) musicStop();
    else if (actx && soundOn()) musicStart();
  });

  /* ═════════════════════════ state ═══════════════════════════════ */
  let mode = null;                  /* 'explore' | 'combat'            */
  let onAction = null;
  let inited = false;
  let grown = false;                /* combat bar has grown            */
  let lastSnap = null;              /* last combat snapshot            */
  let pollTimer = 0, firstRead = true;

  /* DOM refs */
  let bar, wrap, rowEl, skillsEl, orbsEl, leftBtn, rightBtn;
  let apOrb, mpOrb, tipEl, gearEl, menuEl, menubEl, turnEl;
  let skillBtns = {};               /* id → button                     */
  let skillSig = '';

  /* ═══════════════════ the crystal ball ══════════════════════════ */
  const ball = {
    wrap: null, inner: null, cv: null, ctx: null,
    fxFlash: null, fxHeal: null,
    d: 68, dpr: 1,
    hp: null, hpMax: 1,             /* authoritative numbers           */
    disp: 0,                        /* displayed fluid fraction        */
    from: 0, target: 0, t0: 0,      /* level ease                      */
    glow: '', crit: false, raf: 0, ariaTxt: ''
  };

  function buildBall() {
    const w = document.createElement('div');
    w.className = 'hud-ball';
    w.setAttribute('role', 'img');
    w.setAttribute('aria-label', 'Health');
    const inner = document.createElement('div');
    inner.className = 'hud-ball-in';
    const cv = document.createElement('canvas');
    const fxF = document.createElement('div');
    fxF.className = 'hud-fx hud-fx-flash';
    const fxH = document.createElement('div');
    fxH.className = 'hud-fx hud-fx-heal';
    inner.appendChild(cv); inner.appendChild(fxF); inner.appendChild(fxH);
    w.appendChild(inner);
    ball.wrap = w; ball.inner = inner; ball.cv = cv;
    ball.ctx = cv.getContext('2d');
    ball.fxFlash = fxF; ball.fxHeal = fxH;
    sizeBall();
    return w;
  }
  function sizeBall() {
    ball.d = SMALL.matches ? T.ORB.HP_SMALL : T.ORB.HP;
    ball.dpr = Math.min(window.devicePixelRatio || 1, 2);
    ball.cv.width = ball.d * ball.dpr;
    ball.cv.height = ball.d * ball.dpr;
    drawBall(performance.now());
  }

  function easeOutCubic(k) { const p = 1 - k; return 1 - p * p * p; }

  function wavePath(ctx, d, sy, ph, amp, lineOnly) {
    ctx.beginPath();
    ctx.moveTo(-1, sy + Math.sin(ph) * amp);
    for (let x = 3; x <= d + 1; x += 3)
      ctx.lineTo(x, sy + Math.sin(ph + (x / d) * Math.PI * 3) * amp);
    if (!lineOnly) { ctx.lineTo(d + 1, d + 1); ctx.lineTo(-1, d + 1); ctx.closePath(); }
  }

  function drawBall(now) {
    const ctx = ball.ctx, d = ball.d, R = d / 2;
    if (!ctx) return;
    ctx.setTransform(ball.dpr, 0, 0, ball.dpr, 0, 0);
    ctx.clearRect(0, 0, d, d);

    /* displayed level: eased (or snapped under reduced motion) */
    if (ball.t0 && !RM.matches) {
      const k = clamp((now - ball.t0) / T.ORB.FLUID_MS, 0, 1);
      ball.disp = ball.from + (ball.target - ball.from) * easeOutCubic(k);
      if (k >= 1) ball.t0 = 0;
    } else {
      ball.disp = ball.target;
      ball.t0 = 0;
    }
    const f = clamp(ball.disp, 0, 1);
    const col = T.ORB.hpColor(ball.hp == null ? 1 : f);

    /* outer glow (CSS box-shadow) tracks the fluid colour */
    if (col !== ball.glow) {
      ball.glow = col;
      ball.wrap.style.setProperty('--glow', hexA(col, 0.18));
    }

    /* glass ball base, clipped */
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1.5, 0, 6.2832);
    ctx.fillStyle = '#0B0916';
    ctx.fill();
    ctx.clip();

    /* interior haze — the empty part of the sphere reads as glass with
       something swirling in it, never as a void */
    const hz = ctx.createRadialGradient(R, R * 1.15, R * 0.15, R, R, R);
    hz.addColorStop(0, hexA(col, 0.14));
    hz.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, 0, d, d);

    /* the fluid: echo wave (60% alpha) behind the main wave */
    if (ball.hp != null && f > 0.002) {
      const top = 3, bot = d - 3;
      const sy = bot - (bot - top) * f;
      const ph = RM.matches ? 0 : ((now % T.ORB.WAVE_MS) / T.ORB.WAVE_MS) * 6.2832;
      const amp = RM.matches ? 0 : 2;
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = mix(col, '#FFFFFF', 0.28);
      wavePath(ctx, d, sy - 1.6, ph + 2.2, amp * 0.9);
      ctx.fill();
      ctx.globalAlpha = 1;
      /* fluid body: lit at the surface, deep at the bottom */
      const fg = ctx.createLinearGradient(0, sy, 0, bot);
      fg.addColorStop(0, mix(col, '#FFFFFF', 0.14));
      fg.addColorStop(1, mix(col, '#000000', 0.22));
      ctx.fillStyle = fg;
      wavePath(ctx, d, sy, ph, amp);
      ctx.fill();
      /* under-surface glow — light caught just beneath the meniscus */
      const ug = ctx.createLinearGradient(0, sy, 0, sy + 9);
      ug.addColorStop(0, 'rgba(255,255,255,.16)');
      ug.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = ug;
      wavePath(ctx, d, sy, ph, amp);
      ctx.fill();
      /* meniscus highlight along the surface */
      ctx.strokeStyle = mix(col, '#FFFFFF', 0.55);
      ctx.lineWidth = 1;
      wavePath(ctx, d, sy, ph, amp, true);
      ctx.stroke();
    }

    /* inner rim shadow — keeps the sphere reading as glass */
    const g = ctx.createRadialGradient(R, R, R * 0.55, R, R, R);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.38)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, d, d);

    /* specular highlight, top-left, plus a small companion sparkle */
    ctx.save();
    ctx.translate(R * 0.66, R * 0.5);
    ctx.rotate(-0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.34, R * 0.15, 0, 0, 6.2832);
    ctx.fillStyle = 'rgba(255,255,255,.26)';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(R * 0.44, R * 0.78, R * 0.06, R * 0.1, -0.5, 0, 6.2832);
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.fill();
    ctx.restore();                               /* un-clip             */

    /* glass rim: bright outer stroke + a faint colour-tinted inner one */
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, 6.2832);
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(R, R, R - 2.8, 0, 6.2832);
    ctx.strokeStyle = hexA(col, 0.3);
    ctx.lineWidth = 1.2;
    ctx.stroke();

    /* the number — outlined so it is ≥4.5:1 on any fluid at any level */
    if (ball.hp != null) {
      const n = String(Math.max(0, Math.round(ball.hp)));
      ctx.font = '700 20px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0E0B1A';
      ctx.strokeText(n, R, R + 1);
      ctx.fillStyle = '#EDEAF6';
      ctx.fillText(n, R, R + 1);
    }
  }

  /* the ball's own rAF — visible tab only, never the game loop */
  function tick() {
    ball.raf = 0;
    if (document.hidden) return;
    drawBall(performance.now());
    if (!RM.matches || ball.t0) ball.raf = requestAnimationFrame(tick);
  }
  function ensureLoop() {
    if (!ball.raf && !document.hidden) ball.raf = requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (ball.raf) { cancelAnimationFrame(ball.raf); ball.raf = 0; }
    } else if (inited) ensureLoop();
  });

  /* fx layers: pure-opacity overlays (kept under reduced motion) */
  function fxPlay(el, ms) {
    el.style.transition = 'none';
    el.style.opacity = '1';
    void el.offsetWidth;
    el.style.transition = 'opacity ' + ms + 'ms linear';
    el.style.opacity = '0';
  }

  /* HUD diffs hp itself: damage = drop + flash + shake, heal = swell.
     react=false on the very first read (booting is not an event). */
  function setVitals(hp, hpMax, react) {
    hpMax = (typeof hpMax === 'number' && hpMax > 0) ? hpMax : 1;
    hp = (typeof hp === 'number' && !isNaN(hp)) ? clamp(hp, 0, hpMax) : 0;
    const frac = clamp(hp / hpMax, 0, 1);
    const prev = ball.hp;

    if (react && prev != null && Math.round(hp) !== Math.round(prev)) {
      if (hp < prev) {
        fxPlay(ball.fxFlash, T.ORB.DMG_FLASH_MS);
        if (!RM.matches) {
          ball.inner.classList.remove('hud-shake');
          void ball.inner.offsetWidth;
          ball.inner.classList.add('hud-shake');
          setTimeout(() => ball.inner.classList.remove('hud-shake'),
                     T.ORB.DMG_SHAKE_MS + 30);
        }
        sfx('damage');
      } else {
        fxPlay(ball.fxHeal, T.ORB.FLUID_MS);
        sfx('heal');
      }
      ball.from = ball.disp;
      ball.target = frac;
      ball.t0 = RM.matches ? 0 : performance.now();
    } else {
      ball.target = frac;
      if (prev == null || !react) { ball.disp = frac; ball.t0 = 0; }
    }
    ball.hp = hp;
    ball.hpMax = hpMax;

    const crit = frac < 0.3 && hp > 0;
    if (crit !== ball.crit) {
      ball.crit = crit;
      ball.wrap.classList.toggle('hud-crit', crit);
    }
    const aria = 'Health ' + Math.round(hp) + ' of ' + Math.round(hpMax);
    if (aria !== ball.ariaTxt) {
      ball.ariaTxt = aria;
      ball.wrap.setAttribute('aria-label', aria);
    }
    ensureLoop();
    /* paint this state NOW — the rAF loop only smooths it. Guarantees a
       correct ball on first paint even where rAF is throttled (hidden
       tabs coming back, headless captures). */
    drawBall(performance.now());
  }

  /* ═══════════════════ AP / MP orbs ══════════════════════════════ */
  function buildOrb(kind, label) {
    const el = document.createElement('div');
    el.className = 'hud-orb hud-' + kind;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', label);
    el.innerHTML = '<div class="hud-ring"></div>' +
      '<div class="hud-core"><span class="hud-num">–</span>' +
      '<span class="hud-lab">' + kind.toUpperCase() + '</span></div>';
    el._num = el.querySelector('.hud-num');
    el._ring = el.querySelector('.hud-ring');
    el._label = label;
    el._cur = null; el._max = null;
    return el;
  }
  function setOrb(el, cur, max) {
    cur = (typeof cur === 'number' && !isNaN(cur)) ? Math.max(0, Math.round(cur)) : 0;
    max = (typeof max === 'number' && max > 0) ? Math.round(max) : Math.max(cur, 1);
    if (cur === el._cur && max === el._max) return;
    el._cur = cur; el._max = max;
    el._num.textContent = cur;
    el._ring.style.setProperty('--f', clamp(cur / max, 0, 1));
    el.setAttribute('aria-label', el._label + ' ' + cur + ' of ' + max);
  }

  /* ═══════════════════ shared glyphs ═════════════════════════════ */
  function svg(inner, size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24"' +
      ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"' +
      ' stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }
  const GEAR_G =
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>' +
    '<circle cx="12" cy="12" r="3"/>';
  const GRID_G =
    '<rect x="3" y="3" width="7" height="7" rx="1"/>' +
    '<rect x="14" y="3" width="7" height="7" rx="1"/>' +
    '<rect x="3" y="14" width="7" height="7" rx="1"/>' +
    '<rect x="14" y="14" width="7" height="7" rx="1"/>';

  /* ═══════════════════ the bottom bar ════════════════════════════ */
  function buildBar() {
    bar = document.createElement('div');
    bar.id = 'hud-bar';
    if (mode === 'combat') bar.classList.add('hud-combat');

    wrap = document.createElement('div');
    wrap.id = 'hud-wrap';

    skillsEl = document.createElement('div');
    skillsEl.id = 'hud-skills';

    rowEl = document.createElement('div');
    rowEl.id = 'hud-row';

    orbsEl = document.createElement('div');
    orbsEl.id = 'hud-orbs';
    apOrb = buildOrb('ap', 'Action points');
    mpOrb = buildOrb('mp', 'Movement points');
    orbsEl.appendChild(apOrb);
    orbsEl.appendChild(buildBall());
    orbsEl.appendChild(mpOrb);

    buildEdges();
    rowEl.appendChild(leftBtn);
    rowEl.appendChild(orbsEl);
    rowEl.appendChild(rightBtn);

    wrap.appendChild(skillsEl);
    wrap.appendChild(rowEl);
    bar.appendChild(wrap);
    document.body.appendChild(bar);

    wireSkillEvents();
  }

  function buildEdges() {
    if (mode === 'combat') {
      leftBtn = document.createElement('button');
      leftBtn.type = 'button';
      leftBtn.id = 'hud-map';
      leftBtn.className = 'hud-iconbtn';
      leftBtn.setAttribute('aria-label', 'Toggle painted map');
      leftBtn.setAttribute('aria-pressed', 'true');
      leftBtn.innerHTML = svg(GRID_G, 24);
      leftBtn.addEventListener('click', () => { sfx('tap'); fire('map'); });

      rightBtn = document.createElement('button');
      rightBtn.type = 'button';
      rightBtn.id = 'hud-end';
      rightBtn.className = 'hud-btn hud-go';
      rightBtn.textContent = 'End turn';
      rightBtn.disabled = true;
      rightBtn.addEventListener('click', () => { sfx('tap'); fire('end'); });
    } else {
      leftBtn = document.createElement('button');
      leftBtn.type = 'button';
      leftBtn.id = 'hud-bag';
      leftBtn.className = 'hud-btn';
      /* ICONS, NOT WORDS. The bar is five things wide on a 350px phone; two
         text labels ate the room the orbs needed and read as buttons in a
         form rather than a game HUD. The aria-label carries the meaning for
         anyone who cannot see the glyph, so nothing is lost by dropping it
         from the face. */
      leftBtn.innerHTML = ICON.bag;
      leftBtn.setAttribute('aria-label', 'Open inventory');
      leftBtn.addEventListener('click', () => { sfx('tap'); fire('bag'); });

      rightBtn = document.createElement('button');
      rightBtn.type = 'button';
      rightBtn.id = 'hud-hero';
      rightBtn.className = 'hud-btn';
      rightBtn.innerHTML = ICON.hero;
      rightBtn.setAttribute('aria-label', 'Open character sheet');
      rightBtn.addEventListener('click', () => { sfx('tap'); fire('hero'); });
    }
  }

  /* The two explore-bar glyphs. Stroke icons at the same weight as the
     settings gear, so the three chrome buttons read as one family. */
  const ICON = {
    bag: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" ' +
      'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8Z"/>' +
      '<path d="M9 8V6.2A3 3 0 0 1 12 3a3 3 0 0 1 3 3.2V8"/></svg>',
    hero: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" ' +
      'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="7.6" r="3.6"/>' +
      '<path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></svg>'
  };

  /* ── WIPE: TYPE YOUR NAME ─────────────────────────────────────────
     A confirm() box is dismissed by muscle memory. Deleting a character is
     irreversible, so this asks the player to TYPE THEIR ACCOUNT NAME — the
     same pattern GitHub uses before it destroys a repository. The point is
     not security; it is making the hand stop. Someone who types their own
     name has understood what they are about to lose.

     The button stays disabled until the name matches exactly (trimmed,
     case-insensitive — this is a speed bump, not a password prompt). */
  function accountName(){
    try { if (window.NET && NET.accountName && NET.accountName()) return NET.accountName(); } catch (e) {}
    try { if (window.PLAYER && PLAYER.name) return PLAYER.name; } catch (e) {}
    return '';
  }

  function askWipe(){
    const who = accountName();
    const back = document.createElement('div');
    back.className = 'hud-wipeback';
    const box = document.createElement('div');
    box.className = 'hud-wipe';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Wipe save');
    box.innerHTML =
      '<h3>Wipe save</h3>' +
      '<p>This deletes your character — level, gear, quest progress and the ' +
      'map you have explored. <b>It cannot be undone.</b></p>' +
      (who ? '<p class="hud-wipe-ask">Type <b>' + esc(who) + '</b> to confirm.</p>'
           : '<p class="hud-wipe-ask">Type <b>WIPE</b> to confirm.</p>') +
      '<input class="hud-wipe-in" type="text" autocomplete="off" ' +
        'autocapitalize="none" autocorrect="off" spellcheck="false" ' +
        'aria-label="Type your name to confirm">' +
      '<div class="hud-wipe-row">' +
        '<button type="button" class="hud-wipe-no">Keep my character</button>' +
        '<button type="button" class="hud-wipe-yes" disabled>Wipe</button>' +
      '</div>';
    back.appendChild(box);
    document.body.appendChild(back);

    const inp = box.querySelector('.hud-wipe-in');
    const yes = box.querySelector('.hud-wipe-yes');
    const want = (who || 'WIPE').trim().toLowerCase();
    const shut = () => { try { back.remove(); } catch (e) {} };

    inp.addEventListener('input', () => {
      yes.disabled = inp.value.trim().toLowerCase() !== want;
    });
    box.querySelector('.hud-wipe-no').addEventListener('click', () => { sfx('tap'); shut(); });
    back.addEventListener('click', e => { if (e.target === back) shut(); });
    document.addEventListener('keydown', function esc2(e){
      if (e.key === 'Escape'){ document.removeEventListener('keydown', esc2); shut(); }
    });
    yes.addEventListener('click', () => {
      if (yes.disabled) return;
      try {
        /* every key the game writes EXCEPT the sound preference — wiping a
           preference is not part of deleting a character */
        /* THE TUTORIAL KEY IS VERSIONED and this list used to name one
           version by hand, so the moment quest.js bumped it a wipe stopped
           clearing the tutorial and the player was returned to a fresh
           character still holding an old, finished quest. Ask QUEST what it
           uses, and sweep the retired key too — a device that never ran the
           new build still has it. */
        ['tactics.hero.v1',
         (window.QUEST && window.QUEST.LSK) || 'tactics.quest.tutorial.v2',
         'tactics.quest.tutorial.v1',
         'tactics.sync.v1',
         'tactics.sync.backup.v1', T.KEYS.VISITED]
          .forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
      } catch (e) {}
      /* tell the sync layer this was a deletion, not a fresh device. Without
         it the next boot PULLS the character back off the relay and the wipe
         appears to have done nothing at all. */
      try { if (window.NET && NET.markWiped) NET.markWiped(); } catch (e) {}
      /* and stop anything writing the character back in the moment between
         clearing storage and the page actually going away */
      try { if (window.HERO && HERO.seal) HERO.seal(); } catch (e) {}
      location.reload();
    });
    setTimeout(() => { try { inp.focus(); } catch (e) {} }, 30);
  }

  function fire(action, arg) { if (onAction) onAction(action, arg); }

  /* ═══════════════════ combat skill row ══════════════════════════ */

  /* the snapshot omits elem (by contract); recover the element tint
     from the combat doc's own spell table when it is there */
  function tintOf(sp) {
    let elem = sp.elem;
    if (!elem && window.T && typeof window.T.spellOf === 'function') {
      const full = window.T.spellOf(sp.id);
      if (full && full.elem) elem = full.elem;
    }
    return T.ELEM[T.elemOf({ elem: elem })];
  }

  function buildSkills(spells) {
    skillsEl.innerHTML = '';
    skillBtns = {};
    spells.forEach((sp, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hud-skill';
      b.dataset.id = sp.id;
      b.setAttribute('aria-label', sp.name + ', ' + sp.ap + ' AP');
      if (!grown) b.style.transitionDelay = (i * T.SKILL.STAGGER_MS) + 'ms';
      b.innerHTML =
        '<span class="hud-glyph">' +
          T.spellIcon(sp.id, T.SKILL.GLYPH, tintOf(sp)) + '</span>' +
        '<span class="hud-badge" aria-hidden="true">' + sp.ap + '</span>' +
        '<span class="hud-cool" aria-hidden="true"></span>';
      skillsEl.appendChild(b);
      skillBtns[sp.id] = b;
    });
  }

  function updateSkills(snap) {
    const sig = snap.spells.map(s => s.id).join(',');
    if (sig !== skillSig) { skillSig = sig; buildSkills(snap.spells); }
    for (const sp of snap.spells) {
      const b = skillBtns[sp.id];
      if (!b) continue;
      b.classList.toggle('hud-sel', snap.sel === sp.id);
      /* aria-disabled (not `disabled`): reading by long-press / focus
         stays possible on unaffordable + cooling icons — §7.6 */
      b.classList.toggle('hud-off', !!sp.off);
      b.setAttribute('aria-disabled', sp.off ? 'true' : 'false');
      const cooling = (sp.cd | 0) > 0;
      b.classList.toggle('hud-cooling', cooling);
      b.querySelector('.hud-cool').textContent = cooling ? sp.cd : '';
    }
  }

  /* ── long-press / focus / hover → the tooltip ─────────────────── */
  const lp = { id: null, x: 0, y: 0, timer: 0, held: false,
               suppress: false, hoverTimer: 0 };

  function buildTip() {
    tipEl = document.createElement('div');
    tipEl.id = 'hud-tip';
    tipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tipEl);
  }

  function factLine(sp) {
    const f = [];
    if (sp.min === sp.max) f.push(sp.min === 0 ? 'Self' : 'Range ' + sp.max);
    else if (sp.min === 0)  f.push('Self–' + sp.max);
    else                    f.push('Range ' + sp.min + '–' + sp.max);
    f.push(sp.los === false ? 'ignores walls' : 'needs sight');
    if ((sp.cd | 0) > 0) f.push('Ready in ' + sp.cd);
    return f.join(' · ');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function showTip(btn) {
    const id = btn.dataset.id;
    const sp = lastSnap && lastSnap.spells.find(s => s.id === id);
    if (!sp) return;
    tipEl.innerHTML =
      '<div class="hud-tt-head"><span class="hud-tt-name">' + esc(sp.name) +
      '</span><span class="hud-tt-chip">' + sp.ap + ' AP</span></div>' +
      '<div class="hud-tt-facts">' + esc(factLine(sp)) + '</div>' +
      (sp.hint ? '<div class="hud-tt-hint">' + esc(sp.hint) + '</div>' : '');
    tipEl.classList.add('hud-on');
    /* anchor above the icon, clamped ≥8px from the viewport edges */
    const r = btn.getBoundingClientRect();
    tipEl.style.left = '0px';
    tipEl.style.top = '0px';
    const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    const x = clamp(r.left + r.width / 2 - tw / 2, 8,
                    window.innerWidth - tw - 8);
    const y = Math.max(8, r.top - th - 8);
    tipEl.style.left = Math.round(x) + 'px';
    tipEl.style.top = Math.round(y) + 'px';
  }
  function hideTip() { tipEl.classList.remove('hud-on'); }

  function tapSkill(id) {
    const sp = lastSnap && lastSnap.spells.find(s => s.id === id);
    if (!sp) return;
    if (sp.off) {
      sfx('error');
      let why = 'Not now';
      if ((sp.cd | 0) > 0) why = 'Ready in ' + sp.cd;
      else if (lastSnap && !lastSnap.mine) why = 'Not your turn';
      else if (lastSnap && lastSnap.hero.ap < sp.ap) why = 'Not enough AP';
      toast(why);
      return;
    }
    sfx(lastSnap && lastSnap.sel === id ? 'tap' : 'select');
    fire('spell', id);
  }

  function toast(msg) {
    const t = document.getElementById('toast');    /* the game's own   */
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('on'), 1100);
  }

  function wireSkillEvents() {
    skillsEl.addEventListener('contextmenu', e => e.preventDefault());

    skillsEl.addEventListener('pointerdown', e => {
      const b = e.target.closest('.hud-skill');
      if (!b || (e.pointerType === 'mouse' && e.button !== 0)) return;
      lp.id = b.dataset.id; lp.x = e.clientX; lp.y = e.clientY;
      lp.held = false;
      clearTimeout(lp.timer);
      lp.timer = setTimeout(() => {
        lp.held = true;
        showTip(b);
        if (navigator.vibrate) navigator.vibrate(10);
      }, T.SKILL.LONGPRESS_MS);
    });
    skillsEl.addEventListener('pointermove', e => {
      if (lp.id == null || lp.held) return;
      if (Math.hypot(e.clientX - lp.x, e.clientY - lp.y) >
          T.SKILL.LONGPRESS_SLOP) {
        clearTimeout(lp.timer);
        lp.id = null;
      }
    });
    skillsEl.addEventListener('pointerup', e => {
      const b = e.target.closest('.hud-skill');
      clearTimeout(lp.timer);
      if (lp.id == null) return;
      const id = lp.id;
      lp.id = null;
      lp.suppress = true;                    /* the click that follows */
      clearTimeout(lp._st);
      lp._st = setTimeout(() => { lp.suppress = false; }, 400);
      if (lp.held) { lp.held = false; hideTip(); return; }  /* read ≠ select */
      if (b && b.dataset.id === id) tapSkill(id);
    });
    skillsEl.addEventListener('pointercancel', () => {
      clearTimeout(lp.timer);
      lp.id = null;
      if (lp.held) { lp.held = false; hideTip(); }
    });
    /* keyboard activation arrives as click (detail 0) */
    skillsEl.addEventListener('click', e => {
      if (lp.suppress) { lp.suppress = false; return; }
      const b = e.target.closest('.hud-skill');
      if (b) tapSkill(b.dataset.id);
    });
    /* keyboard focus = instant tooltip (§7.6) */
    skillsEl.addEventListener('focusin', e => {
      const b = e.target.closest('.hud-skill');
      if (!b) return;
      b.setAttribute('aria-describedby', 'hud-tip');
      showTip(b);
    });
    skillsEl.addEventListener('focusout', e => {
      const b = e.target.closest('.hud-skill');
      if (b) b.removeAttribute('aria-describedby');
      hideTip();
    });
    /* mouse hover after 450ms — an enhancement, never the only path
       (pointerover/out bubble; enter/leave do not) */
    skillsEl.addEventListener('pointerover', e => {
      if (e.pointerType !== 'mouse') return;
      const b = e.target.closest('.hud-skill');
      if (!b || (e.relatedTarget && b.contains(e.relatedTarget))) return;
      clearTimeout(lp.hoverTimer);
      lp.hoverTimer = setTimeout(() => showTip(b), T.SKILL.HOVER_TIP_MS);
    });
    skillsEl.addEventListener('pointerout', e => {
      if (e.pointerType !== 'mouse') return;
      const b = e.target.closest('.hud-skill');
      if (!b || (e.relatedTarget && b.contains(e.relatedTarget))) return;
      clearTimeout(lp.hoverTimer);
      if (!lp.held && document.activeElement !== b) hideTip();
    });

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || mode !== 'combat') return;
      hideTip();
      if (lastSnap && lastSnap.sel) fire('spell', lastSnap.sel);
    });
  }

  /* ═══════════════════ combat turn strip ═════════════════════════ */
  let turnName = '', turnHint = '';
  function buildTurn() {
    turnEl = document.createElement('div');
    turnEl.id = 'hud-turn';
    turnEl.innerHTML =
      '<div class="hud-tname" aria-live="polite"></div>' +
      '<div class="hud-thint"></div>';
    document.body.appendChild(turnEl);
  }
  function setTurn(t) {
    const name = (t && t.name) || '', hint = (t && t.hint) || '';
    if (name !== turnName) {
      turnName = name;
      turnEl.querySelector('.hud-tname').textContent = name;
    }
    if (hint !== turnHint) {
      turnHint = hint;
      turnEl.querySelector('.hud-thint').textContent = hint;
    }
  }

  /* ═══════════════════ settings (explore) ════════════════════════ */
  function buildSettings() {
    gearEl = document.createElement('button');
    gearEl.type = 'button';
    gearEl.id = 'hud-gear';
    gearEl.className = 'hud-iconbtn';
    gearEl.setAttribute('aria-label', 'Settings');
    gearEl.setAttribute('aria-haspopup', 'menu');
    gearEl.setAttribute('aria-expanded', 'false');
    gearEl.innerHTML = svg(GEAR_G, 24);
    document.body.appendChild(gearEl);

    menubEl = document.createElement('button');
    menubEl.type = 'button';
    menubEl.id = 'hud-menub';
    menubEl.setAttribute('aria-label', 'Close menu');
    menubEl.tabIndex = -1;
    document.body.appendChild(menubEl);

    menuEl = document.createElement('div');
    menuEl.id = 'hud-menu';
    menuEl.setAttribute('role', 'menu');
    menuEl.setAttribute('aria-label', 'Settings');

    /* Sound — a real switch backed by a real WebAudio kit */
    const snd = document.createElement('button');
    snd.type = 'button';
    snd.className = 'hud-mi';
    snd.id = 'hud-mi-sound';
    snd.setAttribute('role', 'menuitemcheckbox');
    snd.setAttribute('aria-checked', soundOn() ? 'true' : 'false');
    snd.innerHTML = '<span>Sound</span><span class="hud-sw" aria-hidden="true"></span>';
    snd.addEventListener('click', () => {
      const on = !soundOn();
      try { localStorage.setItem(T.KEYS.SOUND, on ? '1' : '0'); } catch (e) {}
      snd.setAttribute('aria-checked', on ? 'true' : 'false');
      /* the setting takes effect NOW: the bed stops mid-note on off,
         and the click itself is the gesture that may start it on on */
      if (on) musicStart(); else musicStop();
      sfx('tap');                       /* audible only if now on      */
    });
    menuEl.appendChild(snd);

    /* Back to KARTI — only when actually embedded; never a dead row */
    if (window.parent !== window) {
      const div = document.createElement('div');
      div.className = 'hud-div';
      menuEl.appendChild(div);
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'hud-mi';
      back.setAttribute('role', 'menuitem');
      back.innerHTML = '<span>Back to KARTI</span>';
      back.addEventListener('click', () => {
        sfx('tap');
        try {
          window.parent.postMessage({ type: T.MSG.CLOSE, v: 1 },
                                    location.origin);
        } catch (e) {}
        closeMenu(false);
      });
      menuEl.appendChild(back);
    }
    /* ── START OVER ──────────────────────────────────────────────
       KARTI_BUNDLE.md specified this and nothing built it, so the only
       way to choose a different class was to clear the site's storage —
       which would take KARTI's own save down with it. It is deliberately
       LAST in the menu, separated, danger-coloured, and it asks twice,
       because it destroys a character and that cannot be undone.

       It keeps the SOUND setting: wiping a preference is not part of
       starting a new character, and having the music come back on
       unbidden would just read as a bug. */
    {
      const div2 = document.createElement('div');
      div2.className = 'hud-div';
      menuEl.appendChild(div2);
      const wipe = document.createElement('button');
      wipe.type = 'button';
      wipe.className = 'hud-mi hud-mi-danger';
      wipe.setAttribute('role', 'menuitem');
      wipe.innerHTML = '<span>Wipe save</span>';
      wipe.addEventListener('click', () => { sfx('tap'); askWipe(); });
      menuEl.appendChild(wipe);
    }

    document.body.appendChild(menuEl);

    gearEl.addEventListener('click', () => {
      sfx('tap');
      if (menuEl.classList.contains('hud-on')) closeMenu(true);
      else openMenu();
    });
    menubEl.addEventListener('click', () => closeMenu(false));
    menuEl.addEventListener('keydown', menuKeys);
  }

  function menuItems() {
    return Array.prototype.slice.call(menuEl.querySelectorAll('.hud-mi'));
  }
  function openMenu() {
    menubEl.classList.add('hud-on');
    menuEl.classList.add('hud-on');
    gearEl.setAttribute('aria-expanded', 'true');
    const items = menuItems();
    if (items[0]) items[0].focus();
  }
  function closeMenu(refocus) {
    menubEl.classList.remove('hud-on');
    menuEl.classList.remove('hud-on');
    gearEl.setAttribute('aria-expanded', 'false');
    if (refocus) gearEl.focus();
  }
  function menuKeys(e) {
    const items = menuItems();
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
    else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      items[(i + 1) % items.length].focus();
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length].focus();
    }
  }

  /* ═══════════════════ CSS vars: --hud-bar-h / --hud-top-h ═══════
     Set once per mode (the board must never reflow mid-fight) and on
     resize. Bar var = target content height + the measured safe-area
     bottom padding, so pages can clear the chrome before any grow
     animation has finished. */
  function setVars() {
    const root = document.documentElement;
    let padB = T.BAR.PAD_BOTTOM_MIN;
    if (bar) {
      const p = parseFloat(getComputedStyle(bar).paddingBottom);
      if (!isNaN(p)) padB = p;
    }
    /* one row sideways, two upright — the same test hud.css uses, kept
       here because the VARIABLE is what every page reserves space with */
    const wide = window.innerWidth > window.innerHeight &&
                 window.innerHeight <= 520;
    const contentH = mode === 'combat'
      ? (wide ? T.BAR.COMBAT_H_LANDSCAPE : T.BAR.COMBAT_H)
      : T.BAR.H;
    root.style.setProperty(T.CSSVARS.BAR_H, (contentH + padB) + 'px');

    let topH = 0;
    if (gearEl) topH = Math.max(topH, gearEl.getBoundingClientRect().bottom + 8);
    if (turnEl) topH = Math.max(topH, turnEl.getBoundingClientRect().bottom + 8);
    root.style.setProperty(T.CSSVARS.TOP_H, Math.round(topH) + 'px');
  }

  /* ═══════════════════ explore: the PLAYER poll ══════════════════ */
  function pollNow() {
    const P = window.PLAYER;
    if (!P) return;
    setVitals(P.hp, P.hpMax, !firstRead);
    /* explore shows the derived base pools, ring full (§2.4) */
    setOrb(apOrb, P.ap, P.ap);
    setOrb(mpOrb, P.mp, P.mp);
    firstRead = false;
  }

  /* ═══════════════════ combat paint ══════════════════════════════ */
  function combatPaint(snap) {
    if (!inited || mode !== 'combat' || !snap) return;

    if (!grown) {
      grown = true;
      bar.classList.add('hud-entering');
      void bar.offsetWidth;                       /* commit start state */
      requestAnimationFrame(() => bar.classList.add('hud-grown'));
      setTimeout(() => {
        bar.classList.remove('hud-entering');
        for (const id in skillBtns) skillBtns[id].style.transitionDelay = '';
      }, T.BAR.MODE_MS + 5 * T.SKILL.STAGGER_MS + 120);
    }

    const h = snap.hero || {};
    setVitals(h.hp, h.hpMax, lastSnap != null);   /* HUD diffs, reacts */
    setOrb(apOrb, h.ap, h.apMax);
    setOrb(mpOrb, h.mp, h.mpMax);
    /* not your turn → the pools dim to 40%; the ball never dims (§8) */
    orbsEl.classList.toggle('hud-dim', !snap.mine);

    rightBtn.disabled = !snap.mine || !!snap.over;
    leftBtn.setAttribute('aria-pressed', snap.mapMode ? 'true' : 'false');

    setTurn(snap.turn);
    updateSkills(snap);
    lastSnap = snap;
  }

  /* ═══════════════════ init / mode ═══════════════════════════════ */
  function build() {
    buildBar();
    buildTip();
    if (mode === 'explore') {
      buildSettings();
      pollNow();
      pollTimer = setInterval(() => { if (!document.hidden) pollNow(); },
                              T.POLL_MS);
    } else {
      buildTurn();
    }
    setVars();
    requestAnimationFrame(setVars);      /* re-measure after first layout */
    ensureLoop();

    window.addEventListener('resize', () => { setVars(); });
    const onSmall = () => { sizeBall(); setVars(); };
    if (SMALL.addEventListener) SMALL.addEventListener('change', onSmall);
    else if (SMALL.addListener) SMALL.addListener(onSmall);
  }

  function init(opts) {
    if (inited) return;
    opts = opts || {};
    mode = opts.mode === 'combat' ? 'combat' : 'explore';
    onAction = opts.onAction || null;
    inited = true;
    if (document.body) build();
    else document.addEventListener('DOMContentLoaded', build);
  }

  function setMode(m) {
    m = m === 'combat' ? 'combat' : 'explore';
    if (!inited || m === mode) return;
    mode = m;
    bar.classList.toggle('hud-combat', mode === 'combat');
    if (mode === 'explore') { grown = false; bar.classList.remove('hud-grown'); }
    const oldL = leftBtn, oldR = rightBtn;
    buildEdges();
    oldL.replaceWith(leftBtn);
    oldR.replaceWith(rightBtn);
    setVars();
  }

  function refresh() {
    if (!inited) return;
    if (mode === 'explore') pollNow();
    else if (lastSnap) { const s = lastSnap; lastSnap = null; combatPaint(s); }
  }

  return { init, setMode, refresh, combatPaint, soundOn, sfx };
})();
