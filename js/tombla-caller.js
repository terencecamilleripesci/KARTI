/* ═══════════════════════════════════════════════════════════════════
   KARTI — tombla-caller.js
   L-ANUNZJATUR — the voice that reads the numbers out.

   TOMBLA has had a silent automatic caller since the day it shipped.
   The ninety-seven spoken files have been sitting in audio/call/ the
   whole time — call-01.mp3 … call-90.mp3 and seven prize shouts — and
   nothing ever played one. This file is the player. It is the module
   docs/TOMBLA_CALLER.md §9 specifies, built to that contract, and the
   reasoning below is that document's, kept here so the next person to
   open this file does not have to go and find it.

   WHY THE CALLS ARE IN ENGLISH
   ElevenLabs cannot speak Maltese. Not on any model, at any price, and
   the phonetic-respelling workaround is not available on the model
   these were made with — the evidence is written out at length in
   docs/TOMBLA_CALLER.md §0. Maltese numerals are the worst possible
   case for an English voice ("tnejn u sittin" comes out as noise), so
   English it is, honestly, until a real voice actor records the ninety.
   Everything the SCREEN says stays Maltese; it is only the voice that
   is not, and the screen is the thing you look at.

   WHY THIS IS NOT js/sfx.js  (docs §9.1)
     · sfx.js gives up on a file after 600ms. Right for a card flip;
       wrong for a voice, which has the whole ball animation to arrive
       in.
     · ninety-seven decoded AudioBuffers is roughly 13 MB of float32 on
       a phone, to play ONE file at a time.
     · a fast draw has to cut the previous number off mid-word. That is
       one line on an HTMLAudioElement and awkward in a voice pool.
   So: ONE HTMLAudioElement, reused, streaming, cached by the HTTP
   layer and the service worker, no decode step, no memory held. It
   FOLLOWS js/sfx.js for mute and volume rather than duplicating the
   setting — there is one sound switch in KARTI and it is that one.

   THE THREE RULES, IN PRIORITY ORDER  (docs §9.0)
     1. A MISSING FILE IS SILENCE, NEVER AN ERROR. Delete audio/call/
        entirely and TOMBLA plays exactly as it does today. Nothing
        logs, nothing warns, nothing is a dependency.
     2. NEVER BLOCK THE DRAW. say() returns immediately, always, and
        returns nothing. The number is on the glass before this file is
        asked for an opinion.
     3. MANUAL MODE IS SILENT. A person is holding the ball and reading
        the number out to the room. A phone talking over them is not
        atmosphere, it is a second caller. js/tombla-ui.js gates on
        T.callerSpeaks() AND calls setEnabled() — belt and braces,
        because this is the rule that would be most embarrassing to get
        wrong in a room full of people.

   HOUSE RULES THIS FILE OBEYS
     · it touches nothing in audio/ — it only reads.
     · no state of its own that a game could ever depend on.
     · window.KARTI_CALLER, and nothing else on the global.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

/* loaded twice is not a crash, but it is two of everything and a `dead`
   list that forgets what it learned. Whoever got here first keeps it. */
if (window.KARTI_CALLER) return;

const BASE = 'audio/call/';

/* the seven prize shouts. `vers` and `fatta` are the tal-każin names
   for the same two rungs the klassika calls ċinkwina and tombla —
   js/tombla.js's shoutOf() makes the same swap on screen, so the same
   swap is made here rather than the caller and the caption disagreeing
   about what was just won. */
const SHOUTS = ['ambo','terna','kwaterna','cinkwina','tombla','vers','fatta'];

/* ── WHAT A FILE IS CALLED ───────────────────────────────────────────
   ZERO-PADDED TO TWO DIGITS. call-01.mp3, not call-1.mp3. Nine of the
   ninety numbers are single digits and every one of them would 404 —
   silently, by rule 1, so the bug would present as "the caller skips
   some numbers and I cannot work out which" rather than as an error.
   It is one line and it is the single most likely thing in this file
   to be got wrong, so it is its own function with its own name. */
function idOf(n){
  n = n | 0;
  if (n < 1 || n > 90) return '';
  return 'call-' + (n < 10 ? '0' + n : String(n));
}
function urlOf(id){ return BASE + id + '.mp3'; }

let enabled = false;          /* auto caller only — see rule 3        */
let el = null;                /* the ONE element, made on first use   */
let playing = '';             /* the id currently talking, or ''      */
const dead = {};              /* ids that 404'd. Never retried.       */
const warmed = {};            /* ids already pulled into the cache    */

/* Does the game want any sound at all? One switch for the whole app:
   if the player turned Sounds off in Settings, the anunzjatur is off
   too. Asked fresh every time rather than cached, because the setting
   is a toggle in a panel that can be opened mid-game. */
function soundOn(){
  try {
    const S = window.KARTI_SFX;
    if (!S) return true;                 /* no mixer yet — do not veto */
    return typeof S.isEnabled === 'function' ? !!S.isEnabled() : true;
  } catch(e){ return true; }
}
function volume(){
  try {
    const S = window.KARTI_SFX;
    const v = (S && typeof S.getVolume === 'function') ? S.getVolume() : 1;
    /* 0.85 because the voice is by design the loudest thing in the set
       and still has to sit under the player's own master. Tuned here,
       in code, and never by regenerating a file. */
    return Math.max(0, Math.min(1, (typeof v === 'number' ? v : 1) * 0.85));
  } catch(e){ return 0.85; }
}

function element(){
  if (el) return el;
  try {
    el = new Audio();
    el.preload = 'auto';
    /* the number that matters is the one on the ball NOW, so a new
       call cuts the old one off rather than queueing behind it */
    el.addEventListener('ended', () => { playing = ''; });
    el.addEventListener('error', () => {
      /* rule 1, precisely (docs §9.5): one flag, set once, checked
         before every play, never cleared and never retried. Delete
         call-61.mp3 and 61 goes quiet while the other eighty-nine
         still speak. */
      if (playing) dead[playing] = true;
      playing = '';
    });
  } catch(e){ el = null; }
  return el;
}

function stop(){
  if (!el) return;
  try { el.pause(); el.currentTime = 0; } catch(e){}
  playing = '';
}

/* ── SAY A NUMBER ────────────────────────────────────────────────────
   Fire and forget. Returns nothing, throws nothing, and is a no-op in
   every circumstance it is not certain about.

   THE 900ms RULE (docs §9.2). If the audio has not arrived within 900
   milliseconds of the draw we drop it silently, because a call that
   arrives after the player has already read the number off the screen
   and marked it is worse than no call at all — it reads as the app
   lagging, and it makes them look back at a ball they have finished
   with. The one number that is allowed to be late is none of them. */
function speak(id){
  if (!id || !enabled || dead[id] || !soundOn()) return;
  const a = element();
  if (!a) return;
  stop();
  playing = id;
  const t0 = (window.performance && performance.now) ? performance.now() : Date.now();
  try {
    a.src = urlOf(id);
    a.volume = volume();
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.then === 'function'){
      p.then(() => {
        const now = (window.performance && performance.now) ? performance.now() : Date.now();
        /* too late to be a call. Cut it rather than talk over the next
           number, and do not mark it dead — the file is fine, the
           network was not. */
        if (now - t0 > 900 && playing === id) stop();
      }).catch(() => {
        /* autoplay refused, or the file is not there. Either way this
           is silence, not an error, and not a thing to try again in
           the same breath. */
        if (playing === id) playing = '';
      });
    }
  } catch(e){ playing = ''; }
}

/* ── PREFETCH FROM THE PAST, NOT THE FUTURE ─────────────────────────
   The obvious design is to warm the next ball. DO NOT. js/tombla.js
   deliberately hides the future — view(seat) empties st.bag with the
   comment "the only secret in tombla is what has not come out of the
   bag yet" — and a prefetch of call-38.mp3 puts the next number in the
   network panel, in the service-worker cache and in the browser's
   resource timing, all of which are readable from JavaScript by any
   player in an online game. That would be a cheat vector built on top
   of the one thing the engine was careful to hide.

   So warm two numbers per draw chosen at random from what is STILL IN
   THE BAG — public information, on every player's board already, and a
   uniform sample of it leaks exactly nothing an observer could not
   already compute. Two consumed against one per draw means the set
   runs ahead of the game and is warm by roughly the twentieth call, at
   about 12 KB a draw of genuinely idle bandwidth. */
const idle = (typeof window.requestIdleCallback === 'function')
  ? (fn => window.requestIdleCallback(fn, { timeout: 2500 }))
  : (fn => setTimeout(fn, 400));

function pull(id){
  if (!id || warmed[id] || dead[id]) return;
  warmed[id] = 1;
  try {
    /* the body is thrown away on purpose. The point is only to land it
       in the HTTP and service-worker caches so the later new Audio() is
       instant, and a failure here is not worth knowing about. */
    fetch(urlOf(id), { credentials:'same-origin' }).catch(() => {});
  } catch(e){}
}

function warm(called){
  if (!enabled) return;
  try {
    const out = {};
    for (const n of (called || [])) out[n] = 1;
    const left = [];
    for (let n = 1; n <= 90; n++){
      if (out[n]) continue;
      const id = idOf(n);
      if (!warmed[id] && !dead[id]) left.push(id);
    }
    if (!left.length) return;
    const pick = [];
    for (let k = 0; k < 2 && left.length; k++)
      pick.push(left.splice(Math.floor(Math.random() * left.length), 1)[0]);
    idle(() => { for (const id of pick) pull(id); });
  } catch(e){}
}

/* the seven shouts, once, at the moment the caller is switched on. 31 KB
   in total, and the shout is the one cue that absolutely cannot be late
   — it lands on the biggest moment of the game. */
function warmShouts(){
  idle(() => { for (const k of SHOUTS) pull('shout-' + k); });
}

window.KARTI_CALLER = {
  say(n){ speak(idOf(n)); },
  shout(key){
    key = String(key || '');
    if (SHOUTS.indexOf(key) < 0) return;
    speak('shout-' + key);
  },
  warm,
  setEnabled(on){
    on = !!on;
    if (on === enabled) return;
    enabled = on;
    /* switching INTO manual mid-game must cut a call already in flight,
       or the phone finishes saying "sixty-two" over the host's first
       number. docs §9.3, and it is the one transition somebody in a
       room would actually notice. */
    if (!enabled) stop();
    else warmShouts();
  },
  isEnabled(){ return enabled; },
  stop,
  /* everything a QA pass needs and nothing a game may depend on */
  diag(){
    return {
      enabled, playing,
      sound: soundOn(), volume: volume(),
      cached: Object.keys(warmed),
      dead: Object.keys(dead),
      urlOf, idOf
    };
  }
};

})();
