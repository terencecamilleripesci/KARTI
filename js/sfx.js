/* ═══════════════════════════════════════════════════════════════════════════
   KARTI — SOUND LAYER                                    window.KARTI_SFX
   ───────────────────────────────────────────────────────────────────────────
   The whole point of this file: KARTI must be PERFECT with zero audio files
   on disk, and quietly get better every time Terence drops another mp3 into
   ./audio/. So every path in here is a no-op on failure. A missing file is
   not an error, not a warning the player sees, and not a console red line —
   it is silence, once, and then the id is marked dead and never asked for
   again. Nothing in here can stop a duel, delay a tap or throw.

   WHY WEB AUDIO AND NOT <audio>
   iOS gives every HTMLAudioElement its own unlock problem and caps how many
   can exist; rapid taps then cut each other off or simply stop making noise
   after a while. One AudioContext unlocked once by one gesture, with a fresh
   BufferSourceNode per hit, has neither problem — and mixing, volume and the
   concurrency cap all come free. An <audio> pool is kept as a fallback for
   anything ancient that has no AudioContext at all.

   iOS UNLOCK — THE PART THAT DECIDES WHETHER HIS PHONE MAKES ANY SOUND
   Safari starts the context 'suspended' and will not resume it outside a user
   gesture. So: we attach passive listeners for the first real touch, resume
   the context AND push one silent one-sample buffer through it (resume alone
   is not reliably enough on older WebKit), then drop the listeners. Any play()
   before that first gesture is discarded on purpose — a sound nobody asked
   for, that iOS would refuse anyway. The context is re-resumed on every return
   to the app, because iOS suspends it when the app is backgrounded and a
   duel resumed from the app switcher would otherwise be mute for good.

   OWNERSHIP: this file owns ./audio/ and nothing else. It edits no DOM it did
   not create and injects its own CSS.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  if (global.KARTI_SFX) return;

  /* ── tunables ─────────────────────────────────────────────────────────── */
  var BASE       = 'audio/';   /* every filename in REG is relative to this   */
  var VOL_KEY    = 'karti_sfx_vol';   /* volume lives in its OWN key so a     */
  var PREFS_KEY  = 'karti_prefs';     /* prefs rewrite cannot clobber it      */
  var MAX_VOICES = 8;    /* hard cap. A burst past this is dropped, not queued
                            — late audio is worse than no audio.              */
  var DEDUPE_MS  = 40;   /* same id twice inside this window = one hit. Stops
                            a loop that plays a click per row machine-gunning. */
  var PREFS_TTL  = 400;  /* ms we trust our cached copy of karti_prefs        */

  /* ═══════════════════════ THE REGISTRY ═══════════════════════════════════
     id → { f: filename under audio/, g: gain trim 0..1, loop: true }
     ids are dotted and grouped; the filename is the id with dots as dashes,
     which keeps docs/SOUND_ELEVENLABS.md and this table impossible to
     disagree with.

     THE `g` COLUMN IS THE MOST IMPORTANT THING IN THIS FILE.
     The brief is "soft and addictive, never annoying", and the way a game sound
     set becomes annoying is not that any one sound is bad — it is that the
     sound you hear four hundred times an evening is as loud as the one you hear
     once. So `g` is banded by FREQUENCY, not by importance:

        heard constantly  (tap, draw, lift, turn)   0.34 – 0.46
        heard every turn  (summon, place, hit)      0.50 – 0.62
        heard now & then  (destroy, trap, capture)  0.62 – 0.72
        heard once a game (win, lose, legendary)    0.75 – 0.85
        ambience beds                               0.22

     Nothing reaches 1.0 on purpose: that leaves headroom so the mix never
     clips when three things land on the same frame, which is exactly when a
     set stops sounding soft. Re-level HERE before regenerating a file —
     it is instant, free and reversible.                                    */
  var REG = {
    /* ── shared UI: the quietest things in the game ── */
    'ui.tap':      { f: 'ui-tap.mp3',      g: 0.38 },
    'ui.back':     { f: 'ui-back.mp3',     g: 0.36 },
    'ui.sheet':    { f: 'ui-sheet.mp3',    g: 0.44 },
    'ui.toggle':   { f: 'ui-toggle.mp3',   g: 0.46 },
    'ui.toast':    { f: 'ui-toast.mp3',    g: 0.50 },
    'ui.error':    { f: 'ui-error.mp3',    g: 0.52 },
    'ui.reward':   { f: 'ui-reward.mp3',   g: 0.70 },
    'ui.coin':     { f: 'ui-coin.mp3',     g: 0.68 },

    /* ── the duel ── */
    'duel.start':  { f: 'duel-start.mp3',  g: 0.72 },
    'duel.draw':   { f: 'duel-draw.mp3',   g: 0.42 },
    'duel.shuffle':{ f: 'duel-shuffle.mp3',g: 0.55 },
    'duel.summon': { f: 'duel-summon.mp3', g: 0.58 },
    'duel.boss':   { f: 'duel-boss.mp3',   g: 0.76 },
    'duel.attack': { f: 'duel-attack.mp3', g: 0.56 },
    'duel.hit':    { f: 'duel-hit.mp3',    g: 0.62 },
    'duel.destroy':{ f: 'duel-destroy.mp3',g: 0.66 },
    'duel.spell':  { f: 'duel-spell.mp3',  g: 0.58 },
    'duel.trap':   { f: 'duel-trap.mp3',   g: 0.68 },
    'duel.turn':   { f: 'duel-turn.mp3',   g: 0.40 },
    'duel.win':    { f: 'duel-win.mp3',    g: 0.80 },
    'duel.lose':   { f: 'duel-lose.mp3',   g: 0.74 },

    /* ── pack opening (the showpiece). The four rar.* stings are one
         instrument rising through a scale — the escalation must come from
         the PITCH and the arrangement, so their gains climb only gently. ── */
    'pack.tear':   { f: 'pack-tear.mp3',   g: 0.70 },
    'pack.flip':   { f: 'pack-flip.mp3',   g: 0.48 },
    'pack.dupe':   { f: 'pack-dupe.mp3',   g: 0.50 },
    'pack.tally':  { f: 'pack-tally.mp3',  g: 0.34 },
    'rar.komuni':      { f: 'rar-komuni.mp3',      g: 0.42 },
    'rar.rari':        { f: 'rar-rari.mp3',        g: 0.56 },
    'rar.epiku':       { f: 'rar-epiku.mp3',       g: 0.68 },
    'rar.leggendarju': { f: 'rar-leggendarju.mp3', g: 0.82 },

    /* ── board + card party games ── */
    'piece.lift':    { f: 'piece-lift.mp3',    g: 0.34 },
    'piece.place':   { f: 'piece-place.mp3',   g: 0.52 },
    'piece.capture': { f: 'piece-capture.mp3', g: 0.62 },
    'piece.king':    { f: 'piece-king.mp3',    g: 0.70 },
    'board.check':   { f: 'board-check.mp3',   g: 0.64 },
    'card.throw':    { f: 'card-throw.mp3',    g: 0.54 },
    'card.sweep':    { f: 'card-sweep.mp3',    g: 0.56 },
    'money.pay':     { f: 'money-pay.mp3',     g: 0.54 },
    'dice.roll':     { f: 'dice-roll.mp3',     g: 0.58 },

    /* ── ambience: these LOOP. Long files, loaded on demand only, and mixed
         low enough that you notice them only when they stop.
         `lp:[head,tail]` = seconds to stay clear of at each end when looping.
         MP3 IS NOT A GAPLESS FORMAT: the encoder pads the start of the file
         and the tail of the last frame with silence, so a bed that loops
         perfectly in an editor develops an audible click or gulp every pass
         once it is an mp3 — which is exactly the "it always fades out at the
         end, the loop is NOT seamless" complaint people hit with generated
         ambience. Rather than make Terence fight it with container formats
         iOS may refuse to play, we simply never loop across the padding:
         loopStart/loopEnd keep the playhead inside the real audio. 60 ms
         covers worst-case LAME/FFmpeg padding with room to spare. ── */
    'amb.festa':   { f: 'amb-festa.mp3',   g: 0.22, loop: true, lp: [0.06, 0.06] },
    'amb.kazin':   { f: 'amb-kazin.mp3',   g: 0.22, loop: true, lp: [0.06, 0.06] }
  };

  /* ═══════════════════════ ALIASES ═══════════════════════════════════════
     One file, several jobs. Deliberate: every extra mp3 is bytes on a phone
     over Maltese 4G, and a shared sound the player already knows reads as
     "the game speaks one language", not as a shortcut. Call sites use the
     name that makes sense where they are; this table does the sharing.     */
  var ALIAS = {
    'ui.nav':          'ui.tap',
    'ui.close':        'ui.back',
    'ui.denied':       'ui.error',
    'ui.notify':       'ui.toast',
    'game.start':      'duel.start',
    'game.win':        'duel.win',
    'game.lose':       'duel.lose',
    'card.deal':       'duel.draw',
    'card.shuffle':    'duel.shuffle',
    'trick.win':       'card.sweep',
    'move.illegal':    'ui.error',
    'chess.promote':   'piece.king',
    'dama.king':       'piece.king',
    'takeback.ask':    'ui.toast',
    'takeback.ok':     'ui.toggle',
    'mp.joined':       'ui.toast',
    'mp.left':         'ui.error',
    'mp.turn':         'duel.turn',
    'story.reward':    'ui.reward',
    'tutor.step':      'ui.toast',
    'tutor.done':      'ui.reward'
  };

  /* rarity id (cards.js RARITY keys) → sting id, so call sites can hand us
     the raw rarity straight off the card object without a lookup table. */
  var RAR = { komuni: 'rar.komuni', rari: 'rar.rari',
              epiku: 'rar.epiku', leggendarju: 'rar.leggendarju' };

  /* ids fetched as soon as we are unlocked. Deliberately tiny: the four
     sounds a player hits within two seconds of the first tap. Everything
     else is pulled the first time it is actually asked for.                */
  var CORE = ['ui.tap', 'ui.back', 'ui.sheet', 'ui.error'];

  /* ═══════════════════════ state ═════════════════════════════════════════ */
  var ctx = null;            /* AudioContext, created lazily                 */
  var master = null;         /* master GainNode                             */
  var unlocked = false;      /* has a real user gesture happened yet         */
  var buffers = {};          /* id → AudioBuffer                             */
  var dead    = {};          /* id → true. Asked once, not there. Never again */
  var pending = {};          /* id → Promise, so ten plays = one fetch       */
  var voices  = [];          /* live one-shot sources, for the cap           */
  var loops   = {};          /* id → { src, gain } for the ambience beds     */
  var lastAt  = {};          /* id → ts, for DEDUPE_MS                       */
  var htmlPool = {};         /* id → [HTMLAudioElement] (fallback path only) */
  var fired = 0;             /* how many sounds have actually STARTED. The
                                first thing to check when a phone is quiet:
                                if this climbs as you tap, the wiring is fine
                                and the problem is the device volume or the
                                silent switch. If it does not, it is us.     */
  var prefsCache = null, prefsAt = 0;
  var volume = 0.8;
  var enabledOverride = null; /* set by setEnabled(), beats the stored pref  */
  var supported = false;
  var DEBUG = false;

  var AC = global.AudioContext || global.webkitAudioContext || null;
  try { supported = !!AC || typeof Audio === 'function'; } catch (e) { supported = false; }

  function warn(){ if (DEBUG && global.console) try { console.log.apply(console, ['[sfx]'].concat([].slice.call(arguments))); } catch(e){} }

  /* ═══════════════════════ settings ══════════════════════════════════════
     The Sounds switch lives in game.js's Settings sheet and stores through
     setPref(), i.e. into localStorage['karti_prefs'].sound. We are NOT
     allowed to edit game.js, and a same-document localStorage write fires no
     'storage' event, so we simply re-read the pref (cached for PREFS_TTL) on
     every play. That costs nothing measurable and means the toggle is
     honoured however it ends up being wired — through our setEnabled(), or
     through a bare setPref('sound', x) with no call to us at all.
     Default is ON: a game that ships silent by accident is a bug report.   */
  function prefs(){
    var now = Date.now();
    if (prefsCache && now - prefsAt < PREFS_TTL) return prefsCache;
    var p = {};
    try { p = JSON.parse(global.localStorage.getItem(PREFS_KEY) || '{}') || {}; }
    catch (e) { p = {}; }
    prefsCache = p; prefsAt = now;
    return p;
  }
  function isEnabled(){
    if (enabledOverride !== null) return enabledOverride;
    var p = prefs();
    return typeof p.sound === 'boolean' ? p.sound : true;
  }
  function loadVolume(){
    try {
      var v = parseFloat(global.localStorage.getItem(VOL_KEY));
      if (isFinite(v) && v >= 0 && v <= 1) volume = v;
    } catch (e) {}
  }
  function saveVolume(){
    try { global.localStorage.setItem(VOL_KEY, String(volume)); } catch (e) {}
  }
  loadVolume();

  /* ═══════════════════════ context + iOS unlock ══════════════════════════ */
  function ensureCtx(){
    if (ctx || !AC) return ctx;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; master = null; AC = null; }
    return ctx;
  }

  function unlock(){
    if (unlocked) return;
    unlocked = true;
    detach();
    var c = ensureCtx();
    if (c){
      try { if (c.state === 'suspended') c.resume(); } catch (e) {}
      /* The silent one-sample push. resume() alone has historically not been
         enough on iOS — the context reports 'running' and stays mute until
         something has actually been rendered through it inside the gesture. */
      try {
        var b = c.createBuffer(1, 1, c.sampleRate || 22050);
        var s = c.createBufferSource();
        s.buffer = b; s.connect(c.destination); s.start(0);
      } catch (e) {}
    }
    warn('unlocked');
    /* belt and braces — normally CORE is already decoded by now (see the
       pre-gesture preload at the foot of this file), and this is a no-op. */
    idle(function(){ preload(CORE); });
  }

  var GESTURES = ['pointerdown', 'touchend', 'mousedown', 'keydown', 'click'];
  function attach(){
    for (var i = 0; i < GESTURES.length; i++)
      try { global.addEventListener(GESTURES[i], unlock, { passive: true, capture: true }); }
      catch (e) { try { global.addEventListener(GESTURES[i], unlock, true); } catch (_) {} }
  }
  function detach(){
    for (var i = 0; i < GESTURES.length; i++)
      try { global.removeEventListener(GESTURES[i], unlock, { capture: true }); }
      catch (e) { try { global.removeEventListener(GESTURES[i], unlock, true); } catch (_) {} }
  }
  if (supported) attach();

  /* iOS suspends the context when the app goes to the background. Coming back
     from the app switcher must not leave the rest of the session mute. */
  function rewake(){
    if (!unlocked || !ctx) return;
    try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) {}
  }
  try {
    global.addEventListener('visibilitychange', function(){ if (!global.document.hidden) rewake(); });
    global.addEventListener('pageshow', rewake);
    global.addEventListener('focus', rewake);
  } catch (e) {}

  function idle(fn){
    try {
      if (global.requestIdleCallback) global.requestIdleCallback(fn, { timeout: 2500 });
      else setTimeout(fn, 300);
    } catch (e) { setTimeout(fn, 300); }
  }

  /* ═══════════════════════ loading ═══════════════════════════════════════
     One fetch per id, ever. 404, offline, corrupt file, no decoder — all land
     in the same place: dead[id] = true, and every later play() for that id
     returns instantly without touching the network again.                  */
  function resolve(id){
    if (typeof id !== 'string') return null;
    if (ALIAS[id]) id = ALIAS[id];
    return REG[id] ? id : null;
  }

  function load(id){
    if (buffers[id]) return Promise.resolve(buffers[id]);
    if (dead[id]) return Promise.resolve(null);
    if (pending[id]) return pending[id];
    var url = BASE + REG[id].f;
    var p = fetch(url, { credentials: 'same-origin' })
      .then(function (r){
        if (!r || !r.ok) throw new Error('http ' + (r && r.status));
        return r.arrayBuffer();
      })
      .then(function (ab){
        var c = ensureCtx();
        if (!c) throw new Error('no ctx');
        return new Promise(function (ok, no){
          /* the callback form as well as the promise form — old WebKit only
             has the callbacks, and returns undefined from decodeAudioData */
          var ret;
          try { ret = c.decodeAudioData(ab, ok, no); } catch (e) { return no(e); }
          if (ret && typeof ret.then === 'function') ret.then(ok, no);
        });
      })
      .then(function (buf){
        buffers[id] = buf; delete pending[id];
        warn('loaded', id, Math.round(buf.duration * 1000) + 'ms');
        return buf;
      })
      .catch(function (e){
        dead[id] = true; delete pending[id];
        warn('missing', id, e && e.message);
        return null;   /* resolved, never rejected: nothing upstream can throw */
      });
    pending[id] = p;
    return p;
  }

  /* ═══════════════════════ playback ══════════════════════════════════════ */
  function reap(){
    var now = ctx ? ctx.currentTime : 0;
    for (var i = voices.length - 1; i >= 0; i--)
      if (voices[i].until <= now) voices.splice(i, 1);
  }

  function fire(id, opts){
    var buf = buffers[id];
    if (!buf || !ctx || !master) return false;
    reap();
    if (voices.length >= MAX_VOICES) { warn('cap', id); return false; }
    try {
      var g = ctx.createGain();
      var trim = (REG[id].g == null ? 1 : REG[id].g);
      g.gain.value = trim * (opts && typeof opts.gain === 'number' ? opts.gain : 1);
      g.connect(master);
      var s = ctx.createBufferSource();
      s.buffer = buf;
      if (opts && opts.rate) { try { s.playbackRate.value = opts.rate; } catch (e) {} }
      s.connect(g);
      s.start(0);
      fired++;
      var rate = (opts && opts.rate) || 1;
      voices.push({ until: ctx.currentTime + (buf.duration / rate) + 0.05 });
      s.onended = function(){ try { s.disconnect(); g.disconnect(); } catch (e) {} };
      return true;
    } catch (e) { warn('fire failed', id, e && e.message); return false; }
  }

  /* Fallback for anything with no AudioContext at all. A small element pool
     per id so two quick taps do not cut each other off. */
  function fireHtml(id, opts){
    if (dead[id]) return false;
    try {
      var pool = htmlPool[id];
      if (!pool){
        pool = htmlPool[id] = [];
        for (var i = 0; i < 3; i++){
          var a = new Audio(BASE + REG[id].f);
          a.preload = 'auto';
          a.addEventListener('error', function(){ dead[id] = true; });
          pool.push(a);
        }
      }
      for (var j = 0; j < pool.length; j++){
        if (pool[j].paused || pool[j].ended){
          pool[j].volume = Math.max(0, Math.min(1, volume * (REG[id].g == null ? 1 : REG[id].g)));
          pool[j].currentTime = 0;
          var pr = pool[j].play();
          if (pr && pr.catch) pr.catch(function(){});
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  /* THE call site API. Returns nothing, throws nothing, waits for nothing.
     opts: { gain, rate, force }  — force ignores the dedupe window.        */
  function play(id, opts){
    try {
      if (!supported) return;
      var key = resolve(id);
      if (!key) return;                       /* unknown id → silence        */
      if (!isEnabled()) return;               /* muted                       */
      if (!unlocked) return;                  /* pre-gesture → iOS says no    */
      if (dead[key]) return;
      if (REG[key].loop) return loop(key, opts);
      var now = Date.now();
      if (!(opts && opts.force) && now - (lastAt[key] || 0) < DEDUPE_MS) return;
      lastAt[key] = now;

      if (!AC) { fireHtml(key, opts); return; }
      if (buffers[key]) { fire(key, opts); return; }
      /* not loaded yet: fetch it and play it when it lands, but only if it
         lands soon — a sound that arrives a second after the card hit the
         table is worse than no sound. */
      var asked = now;
      load(key).then(function (b){
        if (b && Date.now() - asked < 600) fire(key, opts);
      });
    } catch (e) { warn('play threw (swallowed)', e && e.message); }
  }

  /* Sugar for the pack opener: sfx.rarity(card.r) */
  function rarity(r, opts){ if (RAR[r]) play(RAR[r], opts); }

  /* Two hits of the same sound, offset. Castling is a piece.place twice; a
     multi-jump in dama is a piece.capture per hop. Saves two whole files. */
  function twice(id, gapMs, opts){
    play(id, opts);
    var t = setTimeout(function(){ clearTimeout(t); play(id, { force: true, gain: (opts && opts.gain) || 1, rate: 1.06 }); },
                       gapMs || 130);
  }

  /* A run of the same sound, e.g. the pack tally counting up. n capped so a
     bad caller cannot machine-gun the mixer. */
  function run(id, n, gapMs, opts){
    n = Math.max(1, Math.min(12, n | 0));
    for (var i = 0; i < n; i++){
      (function (k){
        setTimeout(function(){
          play(id, { force: true, rate: 1 + k * 0.03, gain: (opts && opts.gain) || 1 });
        }, k * (gapMs || 90));
      })(i);
    }
  }

  /* ═══════════════════════ the duel, in one line ═════════════════════════
     game.js already funnels EVERY interesting thing that happens in a duel
     through one function — emit() → D.on() → onDuelEvent(ev) — and every one
     of those events already carries what a sound needs. So the entire duel is
     wired by putting ONE call at the top of onDuelEvent:

         if (window.KARTI_SFX) KARTI_SFX.duelEvent(ev);

     Twelve sounds, one line, and it cannot drift out of step with the rules
     because it is reading the rules' own events rather than shadowing them.
     Anything not listed here is deliberately silent: 'log' fires on every
     ticker line and 'peek' opens a modal that makes its own noise.

     Two things this cannot know and which need their own one-liners:
     `duel.boss` (the event does not carry the card's level) and everything in
     the pack opener, which is timed to animation frames rather than events. */
  var DUEL = {
    start:    function(){ play('duel.start'); preloadFor('duel'); },
    draw:     function(){ play('duel.draw'); },
    summon:   function(ev){ play(ev.faceDown ? 'pack.flip' : 'duel.summon'); },
    set:      function(){ play('duel.summon', { gain: 0.6 }); },
    flip:     function(){ play('pack.flip'); },
    attack:   function(){ play('duel.attack'); },
    destroy:  function(){ play('duel.destroy'); },
    shield:   function(){ play('duel.trap', { gain: 0.7 }); },
    spell:    function(){ play('duel.spell'); },
    trap:     function(){ play('duel.trap'); },
    turn:     function(){ play('duel.turn'); },
    phase:    function(){ play('duel.turn', { gain: 0.6 }); },
    position: function(){ play('ui.tap'); },
    counter:  function(){ play('ui.reward', { gain: 0.6 }); },
    lp:       function(ev){ play(ev.delta < 0 ? 'duel.hit' : 'ui.reward', { gain: ev.delta < 0 ? 1 : 0.55 }); },
    /* pi 0 is always the phone's owner — in pass-and-play both seats are
       human, so seat 0 losing still plays the sad tuba. That is the right
       call: the phone is on the table between them and somebody just lost. */
    over:     function(ev){ play(ev.winner === 0 ? 'duel.win' : 'duel.lose'); }
  };
  function duelEvent(ev){
    try { if (ev && DUEL[ev.type]) DUEL[ev.type](ev); }
    catch (e) { warn('duelEvent threw (swallowed)', e && e.message); }
  }

  /* ═══════════════════════ ambience loops ════════════════════════════════ */
  function loop(id, opts){
    var key = resolve(id);
    if (!key || !REG[key].loop) return;
    if (!isEnabled() || !unlocked || dead[key] || !AC) return;
    if (loops[key]) return;
    loops[key] = true;                     /* claim the slot before awaiting */
    load(key).then(function (buf){
      if (!buf || !loops[key] || !ctx) { delete loops[key]; return; }
      try {
        var g = ctx.createGain();
        g.gain.value = 0;
        g.connect(master);
        var s = ctx.createBufferSource();
        s.buffer = buf; s.loop = true;
        /* stay off the encoder padding at both ends — see `lp` in REG */
        var pad = REG[key].lp || [0, 0];
        if (buf.duration > (pad[0] + pad[1]) * 4){
          s.loopStart = pad[0];
          s.loopEnd = buf.duration - pad[1];
        }
        s.connect(g); s.start(0, s.loopStart || 0);
        var target = (REG[key].g == null ? 1 : REG[key].g) * ((opts && opts.gain) || 1);
        try { g.gain.linearRampToValueAtTime(target, ctx.currentTime + 1.2); }
        catch (e) { g.gain.value = target; }
        loops[key] = { src: s, gain: g };
      } catch (e) { delete loops[key]; }
    });
  }
  function stopLoop(id, fadeMs){
    var key = resolve(id);
    var L = key && loops[key];
    if (!L) return;
    delete loops[key];
    if (L === true || !ctx) return;
    var t = (fadeMs == null ? 700 : fadeMs) / 1000;
    try { L.gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + t); } catch (e) {}
    setTimeout(function(){ try { L.src.stop(); L.src.disconnect(); L.gain.disconnect(); } catch (e) {} }, t * 1000 + 120);
  }
  function stopAll(){
    for (var k in loops) if (loops.hasOwnProperty(k)) stopLoop(k, 200);
    voices.length = 0;
  }

  /* ═══════════════════════ preloading ════════════════════════════════════
     Only ever called with a handful of ids that are about to be needed —
     opening the pack screen, entering a duel. Everything else rides in on
     first use. Runs at idle so it cannot compete with a render.            */
  function preload(ids){
    if (!supported || !AC) return;
    if (typeof ids === 'string') ids = [ids];
    if (!ids || !ids.length) return;
    idle(function(){
      for (var i = 0; i < ids.length; i++){
        var key = resolve(ids[i]);
        if (key && !buffers[key] && !dead[key] && !REG[key].loop) load(key);
      }
    });
  }
  /* The named bundles, so a call site says what it is about to do rather
     than repeating a list of ids that will drift. */
  var PACKS = {
    duel: ['duel.draw', 'duel.summon', 'duel.attack', 'duel.hit', 'duel.destroy',
           'duel.turn', 'duel.spell'],
    pack: ['pack.tear', 'pack.flip', 'rar.komuni', 'rar.rari', 'pack.tally'],
    board: ['piece.lift', 'piece.place', 'piece.capture'],
    cards: ['duel.draw', 'card.throw', 'card.sweep']
  };
  function preloadFor(name){ if (PACKS[name]) preload(PACKS[name]); }

  /* ═══════════════════════ volume / mute ═════════════════════════════════ */
  function setVolume(v){
    v = parseFloat(v);
    if (!isFinite(v)) return;
    volume = Math.max(0, Math.min(1, v));
    if (master) { try { master.gain.value = volume; } catch (e) {} }
    saveVolume();
  }
  function getVolume(){ return volume; }
  function setEnabled(on){
    enabledOverride = !!on;
    prefsCache = null;                       /* force a re-read next play    */
    if (!enabledOverride) stopAll();
  }
  /* Hand control back to karti_prefs.sound — call this if the Settings sheet
     is wired through setPref() rather than through setEnabled(). */
  function followPrefs(){ enabledOverride = null; prefsCache = null; }

  /* ═══════════════════════ optional Settings UI ══════════════════════════
     game.js's Settings sheet currently carries a dead "Sounds — Coming soon"
     row. This produces a live replacement (switch + volume slider) as a
     string, so wiring it is one line there and zero risk here. The switch
     and row classes are game.js's own; only the slider needs new CSS, and
     that is injected from this file, once.                                 */
  var cssDone = false;
  function injectCSS(){
    if (cssDone || !global.document) return;
    cssDone = true;
    var s = global.document.createElement('style');
    s.id = 'sfx-css';
    s.textContent =
      '.sfxvol{display:flex;align-items:center;gap:10px;padding:10px 14px 14px}' +
      '.sfxvol input[type=range]{flex:1;height:22px;accent-color:var(--gold,#FFB300);' +
        'background:transparent;-webkit-appearance:none;appearance:none}' +
      '.sfxvol input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;' +
        'background:rgba(255,255,255,.18)}' +
      '.sfxvol input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;' +
        'margin-top:-8px;border-radius:50%;background:var(--gold,#FFB300);border:0;' +
        'box-shadow:0 1px 4px rgba(0,0,0,.5)}' +
      '.sfxvol input[type=range]::-moz-range-track{height:4px;border-radius:2px;background:rgba(255,255,255,.18)}' +
      '.sfxvol input[type=range]::-moz-range-thumb{width:20px;height:20px;border:0;border-radius:50%;background:var(--gold,#FFB300)}' +
      '.sfxvol b{font-size:12px;opacity:.7;min-width:34px;text-align:right;font-variant-numeric:tabular-nums}' +
      '.sfxvol.off{opacity:.35;pointer-events:none}';
    (global.document.head || global.document.documentElement).appendChild(s);
  }

  function settingsHTML(){
    injectCSS();
    var on = isEnabled();
    return '<button class="setrow" id="sfx-sw" role="switch" aria-checked="' + (on ? 'true' : 'false') + '">' +
             '<span class="sl"><b>Sounds</b><small>Taps, packs and the duel. Nothing plays until you ' +
             'touch the screen — that is your phone, not us.</small></span>' +
             '<span class="sw' + (on ? ' on' : '') + '"><i></i></span>' +
           '</button>' +
           '<div class="sfxvol' + (on ? '' : ' off') + '" id="sfx-vol-wrap">' +
             '<span aria-hidden="true">🔈</span>' +
             '<input type="range" id="sfx-vol" min="0" max="100" step="5" ' +
               'value="' + Math.round(volume * 100) + '" aria-label="Sound volume">' +
             '<b id="sfx-vol-n">' + Math.round(volume * 100) + '%</b>' +
           '</div>';
  }
  /* onToggle is optional: pass game.js's setPref so the pref and the sheet
     stay in step, e.g. bindSettings(function(v){ setPref('sound', v); }). */
  function bindSettings(onToggle){
    var d = global.document;
    if (!d) return;
    var sw = d.getElementById('sfx-sw'),
        vol = d.getElementById('sfx-vol'),
        num = d.getElementById('sfx-vol-n'),
        wrap = d.getElementById('sfx-vol-wrap');
    if (sw) sw.onclick = function(){
      var next = !isEnabled();
      setEnabled(next);
      if (typeof onToggle === 'function') { try { onToggle(next); } catch (e) {} }
      sw.setAttribute('aria-checked', next ? 'true' : 'false');
      var k = sw.querySelector('.sw'); if (k) k.classList.toggle('on', next);
      if (wrap) wrap.classList.toggle('off', !next);
      if (next) play('ui.toggle', { force: true });
    };
    if (vol) {
      vol.oninput = function(){
        setVolume(vol.value / 100);
        if (num) num.textContent = Math.round(volume * 100) + '%';
      };
      /* preview on release only — previewing on every input event turns the
         slider into a machine gun */
      vol.onchange = function(){ play('ui.tap', { force: true }); };
    }
  }

  /* ═══════════════════════ SELF-WIRING ═══════════════════════════════════
     Makes KARTI audible with ZERO edits to any other file.

     WHY THIS EXISTS. The shared-UI sounds — tap, back, sheet, toggle, toast,
     error — are the ones a player hits within two seconds of opening the app,
     and they are also the ones whose call sites are spread across every screen
     in game.js, party.js and five game files other people are editing right
     now. Waiting for those edits means the phone test hears nothing at all,
     which reads as "the sounds are broken" rather than "the sounds are not
     wired yet". So this layer derives those six sounds from the DOM the app
     already produces, and it does it by watching, never by intervening.

     WHAT IT DOES NOT DO. Duel, pack, board and dice sounds are NOT in here.
     A click cannot tell you that the card being tapped is a level-8 tribute
     summon, or which rarity just flipped. Those need real call sites with
     real game context, and duelEvent() above is waiting for them.

     SAFETY, in the order it matters:
      · It listens on 'click' in the BUBBLE phase and never touches the event —
        no preventDefault, no stopPropagation, passive, and it returns early
        if the element is not chrome. A scroll or a drag never produces a
        click on a phone, so scrolling is silent for free.
      · Board squares in chess and dama are real <button class="pt-sq">
        elements, so a naive "any button" rule would put a UI tap on every
        chess move and then double up the moment the real piece sounds land.
        SKIP is checked first and wins.
      · Sheets, modals and toasts are watched with a MutationObserver on the
        one class each of them toggles, compared against the previous state —
        so closeSheet() on an already-closed sheet, which go() does on EVERY
        navigation, stays silent.
      · Double-firing against a future real call site is handled by the same
        DEDUPE_MS window every other caller goes through: both paths end in
        play(), the second one inside 40 ms is dropped, and exactly one sound
        comes out. Whichever fires first wins and the other is a no-op, so a
        direct call can be added without removing anything here.
      · When the real call sites land, turn a channel off rather than
        unpicking it:  KARTI_SFX.autoWire({ taps:false })  or, for the lot,
        KARTI_SFX.autoWire(false).                                          */

  var AUTO = { taps: true, sheets: true, toasts: true };
  var wired = false;

  /* game surfaces — these get their own sounds from their own call sites and
     must never also make a UI noise. Checked FIRST, and it wins. */
  var SKIP = '.pt-sq,.card,.slot,.zone,.gacha-cell,.gcell,.fan,.tapme,' +
             '.deckcard,.deckface,.flipper,.chip,.setchip,#ticker';
  /* the app's actual chrome vocabulary, read off index.html and game.js */
  var CHROME = 'button,.btn,.tab,.setrow,[role="switch"]';
  /* ids and labels that mean "this closes something" */
  var BACKISH = /(^|[-_])(close|back|cancel|no|x)([-_]|$)/i;

  function looksBack(el){
    try {
      if (el.id && BACKISH.test(el.id)) return true;
      var t = (el.textContent || '').trim().slice(0, 14);
      return /^(back|close|cancel|not now|never mind|let me look)/i.test(t);
    } catch (e) { return false; }
  }
  function looksSwitch(el){
    try {
      return el.getAttribute('role') === 'switch' ||
             !!(String(el.className || '').indexOf('setrow') >= 0 && el.querySelector('.sw'));
    } catch (e) { return false; }
  }

  function onClick(e){
    try {
      if (!AUTO.taps) return;
      var t = e && e.target;
      if (!t || !t.closest) return;
      if (t.closest(SKIP)) return;            /* a game surface — not ours   */
      var el = t.closest(CHROME);
      if (!el || el.disabled) return;
      play(looksSwitch(el) ? 'ui.toggle' : (looksBack(el) ? 'ui.back' : 'ui.tap'));
    } catch (err) { warn('autowire click', err && err.message); }
  }

  /* Watch ONE class on ONE element and report real transitions only. */
  function watchClass(el, cls, onOn, onOff){
    if (!el || typeof MutationObserver !== 'function') return;
    var was = el.classList.contains(cls);
    try {
      new MutationObserver(function(){
        var now = el.classList.contains(cls);
        if (now === was) return;              /* no transition, no sound     */
        was = now;
        try { (now ? onOn : onOff)(); } catch (e) {}
      }).observe(el, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {}
  }

  function autoWireInit(){
    if (wired || !global.document) return;
    var d = global.document;
    if (!d.body) { d.addEventListener('DOMContentLoaded', autoWireInit); return; }
    wired = true;

    /* Bubble phase on document. The iOS unlock listeners sit on WINDOW in the
       CAPTURE phase, so by the time this handler runs the context is already
       unlocked and resumed — which is what makes the very first tap audible
       instead of being the one tap that gets silently swallowed. */
    try { d.addEventListener('click', onClick, { passive: true }); }
    catch (e) { d.addEventListener('click', onClick, false); }

    var sheet = d.getElementById('sheet'),
        modal = d.getElementById('modal'),
        toastEl = d.getElementById('toast');

    watchClass(sheet, 'on',
      function(){ if (AUTO.sheets) play('ui.sheet'); },
      function(){ if (AUTO.sheets) play('ui.back'); });
    watchClass(modal, 'on',
      function(){ if (AUTO.sheets) play('ui.sheet'); },
      function(){ if (AUTO.sheets) play('ui.back'); });
    /* toast() carries both good news and bad; game.js marks the bad kind with
       a leading ⚠, so the warning gets the blunt "no" instead of the bell. */
    watchClass(toastEl, 'on', function(){
      if (!AUTO.toasts) return;
      var msg = '';
      try { msg = toastEl.textContent || ''; } catch (e) {}
      play(/^\s*⚠/.test(msg) ? 'ui.error' : 'ui.toast');
    }, function(){});
    /* #flash is deliberately NOT watched — it is duel juice (TRAP!, counters)
       and belongs to duelEvent(), which knows what actually happened. */
  }

  /* autoWire()             → read the current state
     autoWire(false)        → turn the whole delegated layer off
     autoWire({taps:false}) → turn one channel off as its call sites land */
  function autoWire(v){
    if (v === false) AUTO.taps = AUTO.sheets = AUTO.toasts = false;
    else if (v === true) AUTO.taps = AUTO.sheets = AUTO.toasts = true;
    else if (v && typeof v === 'object')
      for (var k in AUTO) if (v.hasOwnProperty(k)) AUTO[k] = !!v[k];
    return { taps: AUTO.taps, sheets: AUTO.sheets, toasts: AUTO.toasts, wired: wired };
  }

  if (supported) autoWireInit();

  /* ═══════════════════ THE FIRST TAP MUST BE AUDIBLE ═════════════════════
     The classic iOS failure here is that the very tap which unlocks the audio
     context is itself silent, because at that instant nothing is decoded yet
     and the fetch lands after the moment has passed. It is also the first
     thing anyone tries, so it is the one that decides whether they believe
     the sound works at all.

     Fetching and DECODING do not need a user gesture — only *playing* does.
     decodeAudioData is perfectly happy on a suspended context. So the four
     most-immediate sounds are pulled and decoded at idle as soon as this file
     loads, long before a finger touches the glass. By the time the unlock
     fires on pointerdown and the click reaches the delegated handler a few
     milliseconds later, ui.tap is a decoded AudioBuffer sitting in memory and
     plays on the spot.

     This costs four small requests on a screen that is otherwise waiting for
     the player, and it is the difference between "the sounds work" and "the
     sounds are broken". Everything else in the set still loads on demand.   */
  if (supported && AC) idle(function(){ preload(CORE); });

  /* ═══════════════════════ diagnostics ═══════════════════════════════════
     Read-only. Used by the test harness and by anyone asking "why is it
     quiet on my phone" — the four answers are all in here.                 */
  function diag(){
    reap();
    var loaded = [], missing = [];
    for (var k in buffers) if (buffers.hasOwnProperty(k)) loaded.push(k);
    for (var m in dead) if (dead.hasOwnProperty(m)) missing.push(m);
    return {
      supported: supported, webaudio: !!AC, unlocked: unlocked,
      state: ctx ? ctx.state : 'no-context',
      enabled: isEnabled(), volume: volume,
      voices: voices.length, maxVoices: MAX_VOICES, fired: fired,
      loaded: loaded.sort(), missing: missing.sort(),
      loops: Object.keys(loops),
      registered: Object.keys(REG).length, aliases: Object.keys(ALIAS).length,
      auto: { taps: AUTO.taps, sheets: AUTO.sheets, toasts: AUTO.toasts, wired: wired }
    };
  }

  global.KARTI_SFX = {
    play: play, rarity: rarity, twice: twice, run: run, duelEvent: duelEvent,
    loop: loop, stopLoop: stopLoop, stopAll: stopAll,
    preload: preload, preloadFor: preloadFor,
    setVolume: setVolume, getVolume: getVolume,
    setEnabled: setEnabled, isEnabled: isEnabled, followPrefs: followPrefs,
    settingsHTML: settingsHTML, bindSettings: bindSettings,
    autoWire: autoWire,
    ids: function(){ return Object.keys(REG); },
    aliases: function(){ return JSON.parse(JSON.stringify(ALIAS)); },
    files: function(){ var o = {}; for (var k in REG) o[k] = BASE + REG[k].f; return o; },
    diag: diag,
    get debug(){ return DEBUG; }, set debug(v){ DEBUG = !!v; },
    /* test hooks only — never call these from game code */
    _unlock: unlock, _reg: REG
  };
})(typeof window !== 'undefined' ? window : this);
