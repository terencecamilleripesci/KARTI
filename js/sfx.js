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
     it is instant, free and reversible.

     ── FOURTH PASS: `g` IS ONLY HALF THE LEVEL ────────────────────────────
     A band is a target for what comes OUT of the mixer, and that is the file's
     own level TIMES `g`. The files are not all at one level — they range over
     14x — so banding `g` by frequency alone left the set 23 dB apart flat and
     29.5 dB apart through a phone speaker. Six values below were raised on
     measurement; duel.turn 0.40→0.80 was the worst of them, the quietest thing
     in the whole game and it fires every single turn.

     AND THE THING `g` CANNOT FIX. A phone speaker puts out almost nothing
     below ~500 Hz. Several files here are almost entirely underneath it:
     duel.boss and duel.hit lose THIRTY decibels on the target device,
     rar.komuni and rar.epiku about eighteen — which is why rar.epiku is
     currently quieter than rar.rari and the pack ceremony's escalation runs
     backwards. Turning those up only moves air the speaker cannot move. They
     need new files, not new numbers; the measurements and the rewritten
     prompts are in §11 of docs/SOUND_ELEVENLABS.md.

     So before touching a `g` below, work out WHICH fault you have:
     too quiet is a number, too low is a file.                              */
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

    /* THE XP LADDER — same measured compensation as the rarity stings, and for
       the same reason: an evenly rising set of gains produced a ladder where the
       LEVEL-UP, which happens rarely and is the payoff, was quieter through a
       phone speaker than the tick that fires dozens of times a screen. What the
       player hears is file level + gain, and that is what these make rise.
       xp.tick is the quietest thing here on purpose — it is heard after every
       game, dozens of times per screen, and it is the first sound the ear tires
       of. Re-measure before changing any of them:
         ffmpeg -i audio/xp-*.mp3 -af highpass=f=500,volumedetect -f null - */
    'xp.tick':     { f: 'xp-tick.mp3',     g: 0.21 },
    'xp.fill':     { f: 'xp-fill.mp3',     g: 0.29 },
    'xp.unlock':   { f: 'xp-unlock.mp3',   g: 1.00 },
    'xp.level':    { f: 'xp-level.mp3',    g: 1.00 },

    /* ── the duel ── */
    'duel.start':  { f: 'duel-start.mp3',  g: 0.72 },
    'duel.draw':   { f: 'duel-draw.mp3',   g: 0.55 },
    'duel.shuffle':{ f: 'duel-shuffle.mp3',g: 0.55 },
    'duel.summon': { f: 'duel-summon.mp3', g: 0.85 },
    /* ── THE SEA, AND TWO CARD-TABLE NOISES ──────────────────────
       GĦARRAQHOM! shipped borrowing sixteen effects from other games — a
       card-duel explosion for a boat going under, a dice-place for a
       shell hitting water. It was never silent; it just was not a sea.

       THESE GAINS ARE MEASURED, NOT SET BY EAR, and they are untidy on
       purpose. Each is derived from what survives a 500Hz highpass,
       which is roughly what a phone speaker reproduces: the splash and
       the sonar come out of the generator far hotter (mean -18 dB) than
       the sink, the horn and the two card sounds (-27 to -31 dB), so the
       loud two are held down and the quiet four pushed up. Do NOT tidy
       these into round numbers — that is precisely how the rarity ladder
       ended up running backwards once already. */
    'sea.splash':  { f: 'sea-splash.mp3',  g: 0.50 },
    'sea.sink':    { f: 'sea-sink.mp3',    g: 0.95 },
    'sea.horn':    { f: 'sea-horn.mp3',    g: 0.90 },
    'sea.sonar':   { f: 'sea-sonar.mp3',   g: 0.52 },
    /* the flight beat. Held right down: it plays UNDER duel.attack and
       the impacts rather than beside them, and it arrives hotter out of
       the generator than anything else in the set (mean -11 dB against
       -27 for the horn). It is the sound of waiting, not of an event. */
    'sea.whistle': { f: 'sea-whistle.mp3', g: 0.34 },
    'gin.knock':   { f: 'gin-knock.mp3',   g: 1.00 },
    'rummy.call':  { f: 'rummy-call.mp3',  g: 1.00 },

    'duel.boss':   { f: 'duel-boss.mp3',   g: 0.76 },
    'duel.attack': { f: 'duel-attack.mp3', g: 0.56 },
    'duel.hit':    { f: 'duel-hit.mp3',    g: 0.62 },
    'duel.destroy':{ f: 'duel-destroy.mp3',g: 0.66 },
    'duel.spell':  { f: 'duel-spell.mp3',  g: 0.58 },
    'duel.trap':   { f: 'duel-trap.mp3',   g: 0.68 },
    'duel.turn':   { f: 'duel-turn.mp3',   g: 0.80 },
    'duel.win':    { f: 'duel-win.mp3',    g: 0.80 },
    'duel.lose':   { f: 'duel-lose.mp3',   g: 0.74 },

    /* ── pack opening (the showpiece). The four rar.* stings are one
         instrument rising through a scale — the escalation must come from
         the PITCH and the arrangement, so their gains climb only gently. ── */
    'pack.tear':   { f: 'pack-tear.mp3',   g: 0.70 },
    'pack.flip':   { f: 'pack-flip.mp3',   g: 0.72 },
    'pack.dupe':   { f: 'pack-dupe.mp3',   g: 0.50 },
    'pack.tally':  { f: 'pack-tally.mp3',  g: 0.34 },
    /* THE RARITY LADDER. These four gains are NOT a tidy ascending sequence and
       must not be 'corrected' into one. They are measured compensation: the
       four files land 6 dB apart in the WRONG order once a phone speaker has
       rolled off everything under about 500 Hz, so an evenly rising set of
       gains produced a ladder where pulling a rare was quieter than pulling a
       common. What matters is the sound the player hears, which is
       file level + gain, and that is what these numbers make ascend in 3 dB
       rungs — about the smallest step a person reliably notices.
       Re-measure before changing any of them:
         ffmpeg -i audio/rar-*.mp3 -af highpass=f=500,volumedetect -f null - */
    'rar.komuni':      { f: 'rar-komuni.mp3',      g: 0.42 },
    'rar.rari':        { f: 'rar-rari.mp3',        g: 0.98 },
    'rar.epiku':       { f: 'rar-epiku.mp3',       g: 0.66 },
    'rar.leggendarju': { f: 'rar-leggendarju.mp3', g: 1.00 },

    /* ── board + card party games ── */
    'piece.lift':    { f: 'piece-lift.mp3',    g: 0.34 },
    'piece.place':   { f: 'piece-place.mp3',   g: 0.52 },
    'piece.capture': { f: 'piece-capture.mp3', g: 0.62 },
    'piece.king':    { f: 'piece-king.mp3',    g: 0.70 },
    'board.check':   { f: 'board-check.mp3',   g: 0.9 },
    'card.throw':    { f: 'card-throw.mp3',    g: 0.54 },
    'card.sweep':    { f: 'card-sweep.mp3',    g: 0.56 },
    'money.pay':     { f: 'money-pay.mp3',     g: 0.54 },
    'dice.roll':     { f: 'dice-roll.mp3',     g: 0.58 },

    /* ══ SECOND PASS ══════════════════════════════════════════════════════
       Nine files added after walking every screen. Read the note on ui.note
       before touching any of them: it is not one sound, it is the whole
       pitched layer, and eight of the second pass's "new sounds" are that one
       file at a different playback rate. Bytes on a phone are the constraint,
       not credits — so a rate is always preferred to a file.              */

    /* THE INSTRUMENT. One low kalimba note, played at a different rate for
       every tab, every filter chip, every step of a dama jump chain and every
       notch of the volume slider. `note(step)` walks it up a major pentatonic,
       which is the point: a pentatonic has no wrong note, so a player jabbing
       at the bottom nav is playing a tune rather than a rattle. Kept low so
       there is room to go up; g is low because it is heard constantly.    */
    'ui.note':     { f: 'ui-note.mp3',     g: 0.40 },
    /* A switch turning OFF is not a switch turning ON. ui.toggle is the flick
       up; this is the blunter, lower drop back down. Players notice.      */
    'ui.untoggle': { f: 'ui-untoggle.mp3', g: 0.44 },
    /* Lateral motion: a screen changing, a rail flicking, a SKARTA reverse.
       ui.sheet is vertical and longer; this is sideways and very short. The
       most-heard file in the second pass, so the most damped.             */
    'ui.swipe':    { f: 'ui-swipe.mp3',    g: 0.30 },
    /* Chess gets its travel back. Every non-capture move is slide → place,
       75 ms apart, which is what a real board sounds like.                */
    'piece.slide': { f: 'piece-slide.mp3', g: 0.36 },
    /* Checkmate. The king goes over. Once a game, never otherwise.        */
    'board.mate':  { f: 'board-mate.mp3',  g: 0.78 },
    /* Dama is TERRACOTTA on wood, chess is FELT-BOTTOMED WOOD on wood. They
       are two different games and they must not sound like one. These two
       are the only reason a player can tell, eyes shut, which board is on
       the table — which is exactly what he asked for.                     */
    'dama.place':  { f: 'dama-place.mp3',  g: 0.50 },
    'dama.jump':   { f: 'dama-jump.mp3',   g: 0.60 },
    /* A declaration: AĦĦAR WAĦDA in SKARTA, and any other "I am calling it"
       moment. Not speech — a counter bell. Speech never mixes with foley.  */
    'call.bell':   { f: 'call-bell.mp3',   g: 0.62 },

    /* TOMBLA. It borrowed dice.roll, piece.place, board.check and call.bell,
       and all four were wrong in the same direction: a token out of a cloth
       bag is not a die, a counter on card stock is drier than a piece on a
       felt board, and a rung going in a room of people is a crowd rather than
       a bell. tombla.mark is the quietest thing in the whole registry on
       purpose — it fires fifteen-plus times a game per player and it is the
       one the ear tires of first. */
    'tombla.call':  { f: 'tombla-call.mp3',  g: 0.58 },
    'tombla.mark':  { f: 'tombla-mark.mp3',  g: 0.34 },
    'tombla.near':  { f: 'tombla-near.mp3',  g: 0.55 },
    'tombla.shout': { f: 'tombla-shout.mp3', g: 0.60 },
    /* ANTICIPATION. The pack charges and shakes for 880 ms before the seam
       goes, and until now all of it was silent — the payoff arrived with no
       build. This is the single most addictive file in the set for the
       fewest bytes: the swell IS the dopamine, the tear is only the release. */
    'pack.charge': { f: 'pack-charge.mp3', g: 0.88 },

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
    'tutor.done':      'ui.reward',

    /* ── second pass. Every one of these is a real moment in the game that
         made no sound before, and every one of them is served by a file that
         is already on the phone. Thirty-one more audible moments, nought
         bytes. This table is where the second pass actually happened. ── */
    'screen.push':     'ui.swipe',     /* any screen becoming visible        */
    'rail.tick':       'pack.tally',   /* a horizontal rail passing an item  */
    'settings.on':     'ui.toggle',
    'settings.off':    'ui.untoggle',
    'card.open':       'pack.flip',    /* a card tapped in Collection        */
    'deck.add':        'duel.summon',  /* + in the deck builder              */
    'deck.remove':     'duel.draw',    /* − in the deck builder              */
    'deck.save':       'ui.reward',
    'deck.bad':        'ui.error',
    'deck.pick':       'ui.toggle',    /* a deck made active                 */
    'shop.buy':        'money.pay',
    'shop.broke':      'ui.error',
    'coin.tick':       'pack.tally',   /* the coin counter running up        */
    'move.select':     'piece.lift',
    'move.cancel':     'ui.back',
    'move.forced':     'ui.error',     /* "you must take" in dama            */
    'chess.castle':    'piece.place',  /* played twice — see twice()         */
    'chess.mate':      'board.mate',
    'chess.stale':     'ui.toast',
    'board.flip':      'card.sweep',
    'board.resign':    'duel.lose',
    'board.draw':      'ui.toast',
    'takeback.no':     'ui.error',
    'takeback.undo':   'ui.swipe',
    'chain.add':       'duel.summon',  /* a +2 or +7 lands on the stack      */
    'chain.eat':       'card.sweep',   /* somebody swallows the whole chain  */
    'chain.shut':      'duel.trap',    /* IL-LIMITU — the chain is closed    */
    'call.ahhar':      'call.bell',    /* AĦĦAR WAĦDA                        */
    'call.caught':     'duel.trap',    /* QABADTEK                           */
    'call.missed':     'ui.toast',     /* the call window expires unpunished */
    'skarta.skip':     'duel.turn',
    'skarta.reverse':  'ui.swipe',
    'party.open':      'ui.sheet'      /* a game tile on the party shelf     */
  };

  /* rarity id (cards.js RARITY keys) → sting id, so call sites can hand us
     the raw rarity straight off the card object without a lookup table. */
  var RAR = { komuni: 'rar.komuni', rari: 'rar.rari',
              epiku: 'rar.epiku', leggendarju: 'rar.leggendarju' };

  /* ids fetched as soon as we are unlocked. Deliberately tiny: the four
     sounds a player hits within two seconds of the first tap. Everything
     else is pulled the first time it is actually asked for.                */
  /* ui.note joined CORE in the second pass: the bottom nav is very often the
     FIRST thing touched, before any button, and a nav note that arrives after
     the screen has already changed reads as broken. */
  var CORE = ['ui.tap', 'ui.back', 'ui.sheet', 'ui.error', 'ui.note'];

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

  /* TEST ONLY. null in every real session, so the whole observer costs one
     `if` per play(). Set by _tap() and read by nothing else. It exists
     because the interesting question is never "did the call site call" —
     it is "did a NOISE come out, and did TWO come out where one was
     meant to", and only play() itself can answer that: the delegated
     auto-wire layer never goes through the exported API.               */
  var TAP = null;
  function tap(id, ev){
    if (!TAP) return;
    try { TAP(id, ev); } catch (e) {}
  }

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
     from the app switcher must not leave the rest of the session mute.
     THREE states come back from a long background, not one:
       'suspended'   — the ordinary parking. resume() is the cure.
       'interrupted' — WebKit's own word for a phone call, Siri, or a long
                       stay in the switcher. Not in the spec, real on the
                       phone, and it answers to resume() the same way. So
                       the test is "not running", not "=== suspended".
       'closed'      — iOS reclaimed the hardware outright. The old context
                       is a brick and resume() on it is a no-op forever —
                       the session used to stay mute for good here. Throw
                       it away, build a fresh one, and re-arm the
                       first-gesture unlock so the next tap pushes a
                       sample through it. Decoded AudioBuffers survive:
                       they are PCM, they do not belong to a context. */
  function rewake(){
    if (!unlocked || !ctx) return;
    var st = '';
    try { st = String(ctx.state || ''); } catch (e) {}
    if (st === 'closed'){
      ctx = null; master = null;
      unlocked = false;
      ensureCtx();
      attach();
      warn('context closed by the OS — rebuilt, waiting on a tap');
      return;
    }
    if (st !== 'running'){ try { ctx.resume(); } catch (e) {} }
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
      if (!key) { tap(String(id), 'unknown'); return; }  /* unknown id → silence */
      tap(key, 'call');
      if (!isEnabled()) return;               /* muted                       */
      if (!unlocked) return;                  /* pre-gesture → iOS says no    */
      if (dead[key]) { tap(key, 'missing'); return; }
      if (REG[key].loop) return loop(key, opts);
      var now = Date.now();
      if (!(opts && opts.force) && now - (lastAt[key] || 0) < DEDUPE_MS) {
        tap(key, 'dedupe'); return;
      }
      lastAt[key] = now;
      tap(key, 'sound');

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
  /* beginTurn() hands over the turn and draws a card in the same frame, so
     duel.turn and duel.draw were landing on the same millisecond, every turn,
     for the whole duel — measured, not guessed. They are two different events
     and at a real table they are two beats: "your go", and then the card comes
     off the deck. So a draw that arrives right behind a turn is pushed back far
     enough to read as its own thing. A draw from a SPELL, which is the other
     way a card is drawn, is nowhere near a turn change and is untouched.     */
  var turnAt = 0;
  var killAt = 0, killN = 0;
  var DUEL = {
    start:    function(){ play('duel.start'); preloadFor('duel'); },
    draw:     function(ev){
      var n = Math.max(1, (ev && ev.n) | 0);
      var late = (Date.now() - turnAt < 60) ? 190 : 0;
      /* "draw two" is two cards off the deck, and it should sound like two */
      var go = (n > 1) ? function(){ run('duel.draw', n, 95); }
                       : function(){ play('duel.draw', { force: !!late }); };
      if (late) after(late, go); else go();
    },
    summon:   function(ev){ play(ev.faceDown ? 'pack.flip' : 'duel.summon'); },
    set:      function(){ play('duel.summon', { gain: 0.6 }); },
    flip:     function(){ play('pack.flip'); },
    attack:   function(){ play('duel.attack'); },
    /* A board wipe emits one `destroy` PER MONSTER, all in the same frame, and
       the dedupe window turned three monsters dying into one noise — measured
       in a real duel, two suppressed. Three cards leaving the field is a bigger
       event than one and has to sound like it, so consecutive destroys are
       staggered instead of collapsed, each one a little higher than the last.
       Capped at four so a freak wipe cannot machine-gun. */
    destroy:  function(){
      var now = Date.now();
      if (now - killAt > 220) killN = 0;      /* a new wipe, not the same one */
      killAt = now;
      var k = killN++;
      if (k === 0){ play('duel.destroy'); return; }
      if (k > 3) return;
      /* 170 ms, not 110: the pot takes 0.41 s to finish breaking, so at 110 ms
         four of them were three-deep on top of each other and read as mud
         rather than as four things dying. Spaced against the real sound. */
      after(k * 170, function(){
        play('duel.destroy', { force: true, rate: 1 + k * 0.05, gain: 0.9 });
      });
    },
    shield:   function(){ play('duel.trap', { gain: 0.7 }); },
    spell:    function(){ play('duel.spell'); },
    trap:     function(){ play('duel.trap'); },
    turn:     function(){ turnAt = Date.now(); play('duel.turn'); },
    /* PHASE used to be duel.turn again at 0.6, and measuring a real duel showed
       what that costs: beginTurn() emits `turn` and then `phase:'main'` in the
       same frame, so of 36 turn-or-phase events in a thirteen-turn duel, TWELVE
       were dropped by the dedupe window and the rest were the same file twice a
       turn. The main phase beginning is not a second event — it IS the turn
       beginning, and it is already sounded. So main is silent, and going to
       BATTLE — the one phase change a player actually chooses — gets a note off
       the instrument instead: a different sound for a different thing, and no
       new file. */
    phase:    function(ev){ if (ev && ev.phase === 'battle') note(3, { gain: 0.45 }); },
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

  /* One timer, one guard, used by every sequenced cue below. Nothing here may
     throw into a game loop, so the callback is wrapped once and for all. */
  function after(ms, fn){
    var t = setTimeout(function(){ clearTimeout(t); try { fn(); } catch (e) {} }, ms);
    return t;
  }

  /* ═══════════════ THE INSTRUMENT — one file, a whole scale ═══════════════
     "Each tab could have its own subtly different note so the app feels like
     an instrument rather than one repeated click."

     That is right, and the cheap way to do it is NOT five files. `ui.note` is
     one low kalimba note and `note(step)` plays it at the playback rate for a
     step of a MAJOR PENTATONIC scale. Pentatonic on purpose: it has no wrong
     note and no semitone clash, so however fast a player jabs at the bottom
     nav — or however long a dama jump chain runs — the result is a tune and
     never a rattle. Five steps per octave, three octaves, one 5 KB file.

     Playback rate also shortens the sample as it raises it, which is exactly
     what you want: the higher a cue in this set sits, the more it needs to
     get out of the way.                                                    */
  var PENT = [1, 1.125, 1.25, 1.5, 1.6875];   /* 1 · 2 · 3 · 5 · 6 */

  function noteRate(step){
    step = Math.max(0, Math.min(14, step | 0));      /* three octaves, clamped */
    return PENT[step % PENT.length] * Math.pow(2, Math.floor(step / PENT.length));
  }
  /* force:true always — a ladder is the one place the dedupe window is wrong,
     because consecutive steps ARE the same id 80 ms apart and every one of
     them must sound. */
  function note(step, opts){
    play('ui.note', { force: true, rate: noteRate(step),
                      gain: (opts && opts.gain) || 1 });
  }
  /* A run of rising (dir 1) or falling (dir -1) notes. The escalation device
     for a dama jump chain and the deflation device for eating a SKARTA pile. */
  function ladder(from, n, dir, gapMs, opts){
    n = Math.max(1, Math.min(8, n | 0));
    for (var i = 0; i < n; i++)
      (function (k){
        after(k * (gapMs || 85), function(){
          note((from | 0) + k * (dir < 0 ? -1 : 1), opts);
        });
      })(i);
  }

  /* Screen → step. Fixed so a destination always sounds the same however you
     reach it — that consistency is what turns a note into a landmark rather
     than a noise. Unknown screens hash to a stable step so a screen added
     later still gets one, and still gets the SAME one every time. */
  var NAV_STEP = { home:0, coll:1, deck:2, pack:3, tutor:4,
                   party:2, story:1, mp:3, pnp:3, gacha:5, duel:0, auth:0 };
  function hashStep(s){
    var h = 0; s = String(s || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % PENT.length;
  }
  /* ONE TAP, ONE SOUND. This used to lay ui.swipe under the note "as texture",
     and the owner heard it immediately and exactly right: "and with tab there
     is back sound as well". It was not texture — it was a second sound, from a
     second file, on a tap that had already spoken. A note and a whoosh do not
     blend into one event at phone-speaker size; they read as two.

     The note alone is enough BECAUSE it is destination-keyed: Collection is
     always the same note, Packs is always a different one, so the bottom nav
     is an instrument and every tab already sounds unlike its neighbours. The
     swipe added nothing to that and muddied all of it.

     Removing it exposed the reason it was there. See claimNav() below: the
     swipe was doubling as the screen-change sound's silencer, by being the
     same id so DEDUPE_MS ate it. That was luck dressed up as design — it only
     ever worked because the two happened to share a file.                  */
  function navNote(key, opts){
    var step = NAV_STEP.hasOwnProperty(key) ? NAV_STEP[key] : hashStep(key);
    note(step, { gain: (opts && opts.gain) || 1 });
    claimNav();
  }

  /* ── who gets to make the navigation sound ────────────────────────────────
     Two listeners can both truthfully say "the player navigated": the click
     handler, which saw the tap, and the screen observer, which saw the screen.
     They must not both sound, and DEDUPE_MS cannot arbitrate because they
     reach for different files — which is precisely how the tab bug survived.

     So the tap CLAIMS the navigation. Whichever screen change follows within
     the window belongs to a tap that has already been acknowledged, and the
     observer stands down. It keeps its real job: every navigation NOBODY
     tapped — a back gesture, a restored session, a game calling go() when it
     finishes — still gets the transition sound.                            */
  var navAt = 0;
  function claimNav(){ navAt = Date.now(); }
  var NAV_CLAIM_MS = 500;
  function navClaimed(){ return Date.now() - navAt < NAV_CLAIM_MS; }

  /* A switch flipping ON and a switch flipping OFF are two different events.
     Two different files, and the note under them moves the opposite way.

     Its own dedupe window, because the Sounds row is wired BOTH by its own
     handler in bindSettings and by the delegated layer, and its note goes out
     with force:true — which is right for a ladder and wrong here, since the
     two calls land a millisecond apart and doubling a note is audible as a
     flam. One flip, one sound, whichever path got there first. */
  var swAt = 0;
  function switchTone(on){
    var now = Date.now();
    if (now - swAt < DEDUPE_MS) return;
    swAt = now;
    play(on ? 'ui.toggle' : 'ui.untoggle', { force: true });
    note(on ? 3 : 0, { gain: 0.5 });
  }

  /* ═══════════════════════ CHESS AND DAMA ════════════════════════════════
     "moving checkers and chess, all sound audit."

     These two games draw no artwork at all, so sound is the only physicality
     they have. The whole board is eight calls, and every one of them takes a
     plain object so chess.js and dama.js never have to be shaped a particular
     way — hand it what the move already knows and it does the rest.

     The material split matters more than anything else here. Chess is a
     felt-bottomed wooden piece travelling across wood: slide, then knock,
     75 ms apart, because that is what a real move sounds like and one knock
     on its own never has. Dama is a terracotta disc: no travel, one clack.
     Eyes shut, you know which board is on the table.                       */
  function boardPick(game){       /* a piece is picked up                    */
    play('piece.lift', { rate: game === 'dama' ? 0.94 : 1 });
  }
  function boardCancel(){          /* ...and put back down unmoved           */
    play('ui.back', { gain: 0.4 });
  }
  /* o: { game:'chess'|'dama', capture, castle, promo, hops, crowned }       */
  function boardMove(o){
    o = o || {};
    if (o.castle){ twice('piece.place', 150); return; }   /* king, then rook */
    if (o.game === 'dama'){
      if (o.capture) boardChain(o.hops || 1, o.hops || 1);
      else play('dama.place');
      if (o.crowned) after(200, boardCrown);
      return;
    }
    play('piece.slide', { gain: 0.8 });
    after(75, function(){
      play(o.capture ? 'piece.capture' : 'piece.place', { force: true });
    });
    if (o.promo) after(320, boardCrown);
  }
  /* ONE HOP of a dama multi-jump. Call it per hop and the chain escalates by
     itself: the clack rises 7% a hop and a pentatonic note climbs under it,
     so a four-jump sweep announces itself as a four-jump sweep before the
     player has finished counting. `total` is optional — pass it and a chain
     of three or more lands on the reward chime. This is the addictive one. */
  function boardChain(hop, total){
    hop = Math.max(1, Math.min(12, hop | 0));
    play('dama.jump', { force: true, rate: Math.min(1.5, 1 + (hop - 1) * 0.07) });
    note(hop - 1, { gain: 0.5 + Math.min(0.3, (hop - 1) * 0.08) });
    if (total && hop >= 3 && hop === (total | 0))
      after(210, function(){ play('ui.reward', { gain: 0.6 }); });
  }
  function boardCrown(){           /* dama crowning, chess promotion         */
    play('piece.king');
    ladder(2, 3, 1, 90, { gain: 0.55 });
  }
  function boardCheck(){ play('board.check'); }
  /* o: { win, mate, draw } — mate topples the king first, THEN the band. */
  function boardEnd(o){
    o = o || {};
    if (o.mate){
      play('board.mate');
      /* 560 ms was measured against the file's LENGTH. The file is 1.2 s but
         the king has finished rolling at 0.24 s — the rest was encoder tail —
         so the band was coming in after a third of a second of silence. Timed
         against the sound instead of the file, it lands as the roll settles. */
      after(280, function(){ play(o.win ? 'duel.win' : 'duel.lose'); });
      return;
    }
    if (o.draw){ play('ui.toast'); return; }
    play(o.win ? 'duel.win' : 'duel.lose');
  }
  /* o: { forced } — "you must take" is a rule reminder, not a telling-off, so
     it is the same blunt thud pitched down and pulled back. Never a buzzer. */
  function boardIllegal(o){
    play('ui.error', { rate: (o && o.forced) ? 0.92 : 1,
                       gain: (o && o.forced) ? 0.75 : 1 });
  }
  /* what: 'ask' | 'ok' | 'no' | 'undo'                                     */
  function takeback(what){
    if (what === 'ok'){ play('ui.toggle'); note(2, { gain: 0.5 }); return; }
    if (what === 'no'){ play('ui.error', { gain: 0.8 }); return; }
    if (what === 'undo'){
      play('ui.swipe');
      after(70, function(){ play('piece.place', { force: true, rate: 0.94 }); });
      return;
    }
    play('ui.toast');
  }

  /* ═══════════════════════ SKARTA ════════════════════════════════════════
     One dispatcher, same shape as duelEvent, because skarta.js is a pure
     rules engine that both the human and the AI go through — so one call in
     the engine covers every seat at the table.

     The chain is the game, so the chain is where the sound work went: each
     card added to the stack climbs a step, and eating the stack falls back
     down every step it climbed. The size of what you just swallowed is
     audible before the count has finished rendering.                       */
  var SKARTA = {
    play:    function(){ play('card.throw'); },
    /* i.n = the running chain total (2, 4, 6, 9, 11...) */
    chain:   function(i){
               play('duel.summon', { gain: 0.6 });
               note(Math.max(0, Math.round((((i && i.n) || 2) / 2)) - 1), { gain: 0.6 });
             },
    shut:    function(){ play('duel.trap'); },            /* IL-LIMITU */
    eat:     function(i){
               play('card.sweep');
               var n = Math.min(6, Math.max(1, Math.round((((i && i.n) || 2) / 2))));
               ladder(n - 1, n, -1, 80, { gain: 0.42 });
             },
    ahhar:   function(){ play('call.bell'); },            /* AĦĦAR WAĦDA */
    caught:  function(){                                  /* QABADTEK    */
               play('duel.trap');
               after(150, function(){ play('ui.error', { gain: 0.75 }); });
             },
    missed:  function(){ play('ui.toast', { gain: 0.6 }); },
    draw:    function(){ play('duel.draw'); },
    shuffle: function(){ play('duel.shuffle'); },
    skip:    function(){ play('duel.turn'); note(0, { gain: 0.4 }); },
    reverse: function(){ play('ui.swipe'); note(2, { gain: 0.5 }); },
    /* i.i = which suit was picked, 0..3 — four suits, four notes */
    suit:    function(i){ note(((i && i.i) | 0) % 4, { gain: 0.6 }); },
    turn:    function(){ play('duel.turn'); },
    illegal: function(){ play('ui.error'); },
    over:    function(i){ play(i && i.win ? 'duel.win' : 'duel.lose'); }
  };
  function skarta(type, info){
    try { if (SKARTA[type]) SKARTA[type](info); }
    catch (e) { warn('skarta threw (swallowed)', e && e.message); }
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
    pack: ['pack.charge', 'pack.tear', 'pack.flip', 'rar.komuni', 'rar.rari',
           'pack.tally'],
    board: ['piece.lift', 'piece.slide', 'piece.place', 'piece.capture'],
    dama:  ['piece.lift', 'dama.place', 'dama.jump', 'ui.note'],
    chess: ['piece.lift', 'piece.slide', 'piece.place', 'piece.capture'],
    cards: ['duel.draw', 'card.throw', 'card.sweep'],
    skarta: ['duel.draw', 'card.throw', 'card.sweep', 'duel.summon', 'ui.note']
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
      '.sfxi{flex:0 0 auto;width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:.7}' +
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
             '<svg class="sfxi" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>' +
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
      /* turning it OFF is correctly silent: setEnabled(false) has already
         muted us, so switchTone's ui.untoggle is swallowed by design. */
      if (next) switchTone(true);
    };
    if (vol) {
      /* SECOND PASS — the slider is an instrument too. It used to preview on
         release only, because previewing the same click on every input event
         turns the slider into a machine gun. A pentatonic note keyed to the
         VALUE does not have that problem: it changes as you drag, so it reads
         as a scale rather than a repeat, and it is the most direct way to hear
         what you are actually setting. Throttled to one note per 70 ms so a
         fast drag cannot flood the mixer. */
      var lastNote = 0;
      vol.oninput = function(){
        setVolume(vol.value / 100);
        if (num) num.textContent = Math.round(volume * 100) + '%';
        var now = Date.now();
        if (now - lastNote < 70) return;
        lastNote = now;
        note(Math.round((vol.value / 100) * 9), { gain: 0.7 });
      };
      /* and one felt tap when you let go, so the setting lands */
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

  var AUTO = { taps: true, sheets: true, toasts: true,
               /* second pass */
               nav: true, cards: true, pack: true, rails: false };
  var wired = false;

  /* game surfaces — these get their own sounds from their own call sites and
     must never also make a UI noise. Checked FIRST, and it wins.

     SECOND PASS: .chip, .setchip and .deckcard came OUT of this list. They
     were skipped as a precaution and the precaution was wrong — every one of
     them is a real <button> in the app's chrome (collection filters, the pack
     set picker, the starter-deck rail) and they were the largest block of
     silent taps in the app. They now get a pentatonic note keyed to their
     position in the row, so running along a filter row plays a scale.
     .card and .gcell STAY, because they are duel surfaces too — the cards
     channel below lets them through only inside Collection and Inventory.

     THIRD FAULT, and the one that actually bit. This list is CLASS NAMES, and
     every game that arrived after it was written invented its own: the playing
     cards are `.kb-card`, SKARTA's hand is `.sk-h`. Neither matches `.card`, so
     both got a generic ui.tap on top of the sound their own call site was
     already making — the exact double-fire this list exists to prevent, caused
     by the list itself going stale. It was found by tapping real cards in the
     real DOM; driving the engine directly hides it completely, because the
     delegated layer never sees a click at all.

     So there is now a name-independent way in: put `data-sfx="own"` on
     anything that makes its own noise and the layer will not touch it, whatever
     it is called. New games opt out without editing this file, which is the
     only version of this that stays true.                                   */
  var SKIP = '[data-sfx="own"],' +
             '.pt-sq,.card,.slot,.zone,.gacha-cell,.gcell,.fan,.tapme,' +
             '.deckface,.flipper,#ticker';
  /* the app's actual chrome vocabulary, read off index.html and game.js */
  var CHROME = 'button,.btn,.tab,.setrow,[role="switch"]';
  /* rows of choices that should sound like a scale rather than one click */
  var PICKS = '.chip,.setchip,.deckcard,[data-pane]';
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
  function matches(el, sel){
    try { return !!(el && el.matches && el.matches(sel)); } catch (e) { return false; }
  }
  function switchOn(el){
    try {
      var a = el.getAttribute('aria-checked');
      if (a === 'true')  return true;
      if (a === 'false') return false;
      var k = el.querySelector('.sw');
      return !!(k && k.classList.contains('on'));
    } catch (e) { return false; }
  }

  /* ── ON vs OFF, the honest way ────────────────────────────────────────────
     A settings row flips its own class inside its own click handler, so a
     BUBBLE-phase listener at document sees the state AFTER the flip. Except
     for Reduce motion, which re-renders the whole sheet: its element is
     detached by then and still carries the state from BEFORE. Reading the DOM
     after the fact therefore gives the right answer on one row and the wrong
     answer on another, silently.

     So we read it before anything has had a chance to change it. This capture
     listener runs at document ahead of every element handler, records what the
     switch was, and the bubble handler plays the opposite — because a switch
     click always flips it. Right on every row, and it stays right when a row
     is added later.

     THE SAME TRAP, a second time. A button that DISABLES ITSELF inside its own
     handler — dama's Undo is the one that caught us: roll back the last ply and
     there is nothing left to roll back, so the button greys out — was read as
     `disabled` by the bubble handler and dropped as a dead tap. It was not a
     dead tap; it was the most consequential tap on the screen. So the capture
     listener records `disabled` at the moment of the press too, and the bubble
     handler trusts that rather than the DOM it is now looking at.           */
  var swPre = null, disPre = null;
  function preClick(e){
    try {
      swPre = null; disPre = null;
      var t = e && e.target;
      if (!t || !t.closest) return;
      var el = t.closest(CHROME);
      if (!el) return;
      disPre = { el: el, dis: !!el.disabled };
      if (el.disabled || !looksSwitch(el)) return;
      swPre = { el: el, on: switchOn(el) };
    } catch (err) {}
  }
  /* was this element disabled when the finger went down? */
  function wasDisabled(el){
    return (disPre && disPre.el === el) ? disPre.dis : !!el.disabled;
  }

  /* A row of choices plays a scale: position in the row picks the note, so a
     filter row always sounds the same way round and the fourth chip is always
     the fourth note. */
  function pickNote(el){
    var i = 0;
    try {
      var p = el.parentNode;
      if (p && p.children) i = Array.prototype.indexOf.call(p.children, el);
    } catch (e) {}
    note(Math.max(0, i), { gain: 0.55 });
  }

  /* Collection and Inventory only. Cards elsewhere (the duel field, the pack
     fan) belong to duelEvent and the pack observer, and must not be caught
     here — which is why this checks the SCREEN, not just the element. */
  function cardCue(t){
    if (!t.closest('#scr-coll') && !t.closest('#scr-deck')) return null;
    /* the deck builder's ± steppers: two different events, and game.js already
       writes the aria-label that tells them apart. Read that rather than the
       glyph, which is a MINUS SIGN and not a hyphen. */
    var q = t.closest('.qty button');
    if (q) return /^remove/i.test(q.getAttribute('aria-label') || '')
      ? 'deck.remove' : 'deck.add';
    if (t.closest('.card,.gcell')) return 'card.open';
    return null;
  }

  function onClick(e){
    try {
      var t = e && e.target;
      if (!t || !t.closest) return;

      if (AUTO.cards){
        var cue = cardCue(t);
        if (cue){ play(cue); return; }
      }

      if (!AUTO.taps) { swPre = null; disPre = null; return; }
      if (t.closest(SKIP)) return;            /* a game surface — not ours   */
      var el = t.closest(CHROME);
      if (!el || wasDisabled(el)) return;

      /* the bottom nav is an instrument: one fixed note per destination */
      if (AUTO.nav && t.closest('#home-nav .tab')){
        navNote((t.closest('#home-nav .tab').dataset || {}).scr);
        return;
      }
      if (looksSwitch(el)){
        var next = (swPre && swPre.el === el) ? !swPre.on : switchOn(el);
        swPre = null;
        switchTone(next);
        return;
      }
      if (AUTO.nav && matches(el, PICKS)){ pickNote(el); claimNav(); return; }
      play(looksBack(el) ? 'ui.back' : 'ui.tap');
      /* whatever this tap turns out to have done, it has been acknowledged —
         so if a screen changes because of it, that is not a second event. */
      claimNav();
    } catch (err) { warn('autowire click', err && err.message); }
  }

  /* ── the pack ceremony, with no edits to game.js ──────────────────────────
     The pack opener is timed to animation frames, not to events, so it cannot
     be reached through duelEvent — but it announces every one of its beats by
     putting a class on an element. #the-pack gains `charge`, then `tearing`;
     each of the five .slot elements gains `flipped` and already carries its
     own rarity class. attributeOldValue turns that into exact transitions.

     That wires the whole set piece — the anticipation swell, the tear, five
     flips and four rarity stings — from one observer, and it stays correct
     because it is reading the animation's own state rather than shadowing its
     timings. If real call sites ever land in game.js, DEDUPE_MS drops
     whichever of the two arrives second and exactly one sound comes out. */
  var RAR_CLS = ['komuni', 'rari', 'epiku', 'leggendarju'];
  function hasCls(s, c){ return new RegExp('(^| )' + c + '( |$)').test(s); }
  function gained(was, now, c){ return hasCls(now, c) && !hasCls(was, c); }
  function rarityOf(s){
    for (var i = 0; i < RAR_CLS.length; i++) if (hasCls(s, RAR_CLS[i])) return RAR_CLS[i];
    return null;
  }
  function watchPack(host){
    if (!host || typeof MutationObserver !== 'function') return;
    try {
      new MutationObserver(function (list){
        if (!AUTO.pack) return;
        for (var i = 0; i < list.length; i++){
          var el = list[i].target, was = list[i].oldValue || '', now;
          try { now = el.className; } catch (e) { continue; }
          if (typeof now !== 'string' || now === was) continue;
          if (gained(was, now, 'charge'))       play('pack.charge');
          else if (gained(was, now, 'tearing')) play('pack.tear');
          else if (gained(was, now, 'flipped')){
            play('pack.flip');
            (function (r){
              if (r) after(90, function(){ play(RAR[r]); });
            })(rarityOf(now));
          }
        }
      }).observe(host, { attributes: true, subtree: true,
                         attributeFilter: ['class'], attributeOldValue: true });
    } catch (e) {}
  }

  /* ── rails ────────────────────────────────────────────────────────────────
     A detent tick as a horizontal rail passes each item. scroll does not
     bubble, so this listens in the CAPTURE phase at document, which is the
     one place a single listener sees every scroller in the app.

     OFF BY DEFAULT and deliberately so: a per-item tick is either the best
     thing in the set or the first thing muted, and that is a decision to make
     with the file in your ear on a phone, not blind.
         KARTI_SFX.autoWire({ rails:true })                                  */
  var railAt = {}, railN = 0;
  function onScroll(e){
    try {
      if (!AUTO.rails) return;
      var el = e && e.target;
      if (!el || !el.classList || !el.scrollWidth) return;
      if (el.scrollWidth - el.clientWidth < 40) return;     /* not a rail */
      var k = el.id || String(el.className || 'rail');
      var x = el.scrollLeft, was = railAt[k];
      if (was == null){ railAt[k] = x; return; }
      if (Math.abs(x - was) < 64) return;
      railAt[k] = x;
      play('rail.tick', { force: true, gain: 0.4, rate: 1 + ((railN++ % 5) * 0.04) });
    } catch (err) {}
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
    /* capture, so it runs before the switch flips itself — see preClick */
    try { d.addEventListener('click', preClick, { passive: true, capture: true }); }
    catch (e) { d.addEventListener('click', preClick, true); }
    /* capture, because scroll does not bubble */
    try { d.addEventListener('scroll', onScroll, { passive: true, capture: true }); }
    catch (e) { try { d.addEventListener('scroll', onScroll, true); } catch (_) {} }

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

    /* ── every screen change, however you got there ───────────────────────
       go() toggles .on on one <section class="screen">, and it is the only
       thing in the app that does. Watching them all means a back button, a
       menu tile, a resumed session and a tab tap ALL make the transition
       sound, without a single edit to game.js.

       Where the change DID come from a tap, that tap has already made its own
       sound and claimed the navigation — see claimNav(). This fires only for
       the navigations nobody tapped, which is what it was always for. */
    var screens = [];
    try { screens = d.querySelectorAll('section.screen[id^="scr-"]'); } catch (e) {}
    for (var si = 0; si < screens.length; si++)
      (function (el){
        watchClass(el, 'on',
          function(){ if (AUTO.nav && !navClaimed()) play('screen.push', { gain: 0.75 }); },
          function(){});
      })(screens[si]);

    watchPack(d.getElementById('scr-pack'));
  }

  /* autoWire()             → read the current state
     autoWire(false)        → turn the whole delegated layer off
     autoWire({taps:false}) → turn one channel off as its call sites land */
  function autoWire(v){
    var k;
    if (v === false || v === true)
      for (k in AUTO) if (AUTO.hasOwnProperty(k)) AUTO[k] = (v === true);
    else if (v && typeof v === 'object')
      for (k in AUTO) if (v.hasOwnProperty(k)) AUTO[k] = !!v[k];
    var out = { wired: wired };
    for (k in AUTO) if (AUTO.hasOwnProperty(k)) out[k] = AUTO[k];
    return out;
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
      auto: autoWire()
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     HAPTICS — the other half of "something just happened"
     ───────────────────────────────────────────────────────────────────────
     WHY THIS LIVES IN THE SOUND FILE. A buzz and a click are the same thing
     wearing different clothes: feedback fired at a moment, wanted by the same
     player, refused by the same player, and obliged to fail in exactly the
     same silent way. Giving haptics their own module would mean a second
     prefs read, a second settings row, a second loader entry and a second
     precache line — four places to forget. So this file's ownership widens
     from "./audio/ and nothing else" to "./audio/ and the vibration motor".

     EVERY PATH IS A NO-OP ON FAILURE, exactly like play(). A desktop with no
     motor, a browser that refuses without a gesture, an iPhone (which has
     never shipped navigator.vibrate) — all of them take the same road: do
     nothing, once, quietly. Nothing in here can throw, and nothing in here
     can delay the tap that caused it.

     WHY NOT GATE ON prefers-reduced-motion. That setting is about things
     MOVING on screen making people ill. A buzz in the hand is not motion and
     silently killing haptics for someone who dislikes animation would be a
     guess about them. Haptics get their own switch instead, defaulting on,
     and the player who wants quiet hands turns it off.

     PATTERNS, not durations, at the call site. A game asks for the MEANING
     ('thud' because a token landed) and this file decides what that feels
     like, so the whole app feels like one object and a retune is one edit.  */
  var VIB = {
    tick:   10,                    /* smallest confirmable nudge: a tap landed */
    tap:    18,                    /* a deliberate choice was taken            */
    thud:   32,                    /* something arrived somewhere: a token     */
    roll:   [14, 40, 22],          /* dice tumbling and settling               */
    double: [12, 55, 12],          /* two beats: a card was shown to you       */
    no:     [40, 45, 40],          /* refused — reads as a head-shake          */
    win:    [26, 70, 26, 70, 70]   /* the only long one, and it ends a game    */
  };
  var HAP_GAP = 40;    /* two buzzes closer than this merge into a smear, so
                          the second is dropped rather than queued            */
  var lastHap = 0;
  var hapticsOverride = null;

  function canHaptic(){
    try { return !!(global.navigator && typeof global.navigator.vibrate === 'function'); }
    catch (e) { return false; }
  }
  /* karti_prefs.haptics, same shape and same default-true as .sound */
  function hapticsOn(){
    if (hapticsOverride !== null) return hapticsOverride;
    var p = prefs();
    return typeof p.haptics === 'boolean' ? p.haptics : true;
  }
  function setHaptics(on){ hapticsOverride = !!on; prefsCache = null; }

  /**
   * haptic(kind) — buzz for a MOMENT, by name. Unknown kinds are ignored
   * rather than guessed at, so a typo is silent instead of surprising.
   * Returns true only if a pattern was actually handed to the motor.
   */
  function haptic(kind){
    try {
      if (!canHaptic() || !hapticsOn()) return false;
      var pat = VIB[kind];
      if (pat == null) return false;
      var now = Date.now();
      if (now - lastHap < HAP_GAP) return false;
      lastHap = now;
      return global.navigator.vibrate(pat) !== false;
    } catch (e) { return false; }
  }

  global.KARTI_SFX = {
    play: play, rarity: rarity, twice: twice, run: run, duelEvent: duelEvent,
    loop: loop, stopLoop: stopLoop, stopAll: stopAll,
    preload: preload, preloadFor: preloadFor,
    setVolume: setVolume, getVolume: getVolume,
    setEnabled: setEnabled, isEnabled: isEnabled, followPrefs: followPrefs,
    settingsHTML: settingsHTML, bindSettings: bindSettings,
    autoWire: autoWire,

    /* ── second pass: the instrument ── */
    note: note, ladder: ladder, navNote: navNote, switchTone: switchTone,
    /* ── second pass: chess and dama. One call per moment, plain objects. ── */
    boardPick: boardPick, boardCancel: boardCancel, boardMove: boardMove,
    boardChain: boardChain, boardCrown: boardCrown, boardCheck: boardCheck,
    boardEnd: boardEnd, boardIllegal: boardIllegal, takeback: takeback,
    /* ── second pass: SKARTA, one dispatcher for both seats ── */
    skarta: skarta,
    /* ── third pass: the phone in the hand ── */
    haptic: haptic, canHaptic: canHaptic,
    setHaptics: setHaptics, hapticsOn: hapticsOn,
    hapticPatterns: function(){ return JSON.parse(JSON.stringify(VIB)); },
    ids: function(){ return Object.keys(REG); },
    aliases: function(){ return JSON.parse(JSON.stringify(ALIAS)); },
    files: function(){ var o = {}; for (var k in REG) o[k] = BASE + REG[k].f; return o; },
    diag: diag,
    get debug(){ return DEBUG; }, set debug(v){ DEBUG = !!v; },
    /* test hooks only — never call these from game code */
    _unlock: unlock, _reg: REG,
    /* _tap(fn) → fn(id, 'call'|'sound'|'dedupe'|'missing'|'unknown') on every
       play(), whoever called it. _tap(null) removes it. */
    _tap: function (fn){ TAP = (typeof fn === 'function') ? fn : null; }
  };
})(typeof window !== 'undefined' ? window : this);
