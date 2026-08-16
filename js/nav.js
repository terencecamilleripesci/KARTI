/* ═══════════════════════════════════════════════════════════════════
   KARTI — nav.js — THE ANDROID BACK BUTTON
   ═══════════════════════════════════════════════════════════════════

   Why this file exists
   --------------------
   The whole app was built and tested on iOS, where there is no system
   back button, so nothing in it ever touched history. On Android the
   back gesture is a first-class navigation control and, in a
   display:standalone PWA with no history entries of its own, EVERY back
   press closes the app — mid-duel, mid-hand, mid-pack.

   What it does NOT do
   -------------------
   It does not become a router. The app has eleven <section class="screen">
   panels in index.html, three more built at runtime (#scr-party, #scr-kiri,
   #scr-stats), and every one of them is switched by code in files this
   module is not allowed to touch. So nav.js never tries to *own* the
   navigation; it observes it and mirrors it.

   THE SENTINEL
   ------------
   Exactly one extra history entry is kept above the app's own, and only
   while the app is somewhere other than its root:

       [ base ]                     ← at home / auth: back CLOSES the app
       [ base ][ sentinel ]         ← anywhere else:  back pops the sentinel

   A back press therefore pops the sentinel, we take one step back inside
   the app, and (if the app is still not at root) we push a fresh sentinel.
   When a step lands on home the sentinel is not replaced, so the NEXT
   press closes the app normally. Nobody is trapped, and the count never
   drifts, because there is only ever 0 or 1 of them.

   The alternative — one history entry per screen — needs the depth of the
   history stack and the depth of the app to agree, and they cannot: the
   app walks backwards on its own every time somebody taps an in-app back
   arrow, and there is no way to REMOVE a history entry without a
   traversal, which fires another popstate, which races the next one.

   ONE STEP BACK = PRESS THE APP'S OWN BACK BUTTON
   -----------------------------------------------
   Every screen in this app already has a visible back control, and it is
   always an <button aria-label="Back…"> (index.html's #pack-back,
   #coll-back, #deck-back; mp.js's #mp-back and #pp-back; story.js's
   #st-back; tutor.js's #tut-back; party.js's #pt-home and #pt-back;
   stats.js's #sx-back; skarta's #sk-back; klabb's #kb-back) or kiri's
   #kr-menu, aria-label="Leave the game", which saves on the way out.

   So the gesture does not re-implement anything: it FINDS that control
   and clicks it. That is the only way to guarantee the button and the
   gesture agree — they are the same code path, whatever those files do
   next, and they stay in agreement when those files change.

   NOT DESTROYING A GAME
   ---------------------
   Two places would otherwise lose a game in play without a word, so both
   are guarded, and the guard is applied to the VISIBLE control as well as
   to the gesture (see wireGuardIntercept) so the two never disagree:

     · a live duel on #scr-duel, which has no back control at all — the
       only way out is Forfeit, inside the battle-log sheet. Back asks,
       and on yes drives that same sheet, so the forfeit is SENT to the
       opponent instead of the app simply vanishing.
     · a party board game with a frame on screen. Chess and dama already
       ask when they are online (their own askLeave); nav stays out of
       the way there and only covers the offline case.

   Anything else that can be in play — tombla, kiri, skarta, klabb, and
   the online paths of the same — lives in files this module may not
   edit. They can opt in with one line:

       KARTI_NAV.guard({ id:'tombla', when:() => inPlay,
                         why:'This tombla is still going.',
                         leave:() => { ... } });

   ONLINE ROOMS
   ------------
   #mp-back is wired to mpLeave() → hardClose() → `{t:'leave'}` on the
   socket, so the back route reaching that button is what tells the relay
   the seat is free. That is the whole reason back clicks the real button
   rather than calling K.go('home') behind its back — going home directly
   would leak the seat.

   As a belt-and-braces second line, pagehide fires mpLeave() too, for the
   press that really does close the app.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var K = function(){ return window.KARTI; };

/* ── the sentinel ──────────────────────────────────────────────────
   `armed`   is there a sentinel entry above us right now
   `want`    should there be one (i.e. the app is not at its root)
   `inflight` traversals WE started, whose popstate must be ignored     */
var armed = false, want = false, inflight = 0, stepping = false;

function pushSentinel(){
  try { history.pushState({ knav: 1 }, ''); armed = true; }
  catch (e) { armed = false; }
}
function popSentinel(){
  armed = false; inflight++;
  try { history.back(); }
  catch (e) { inflight--; }
}
function apply(){
  /* never touch history while one of our own traversals is in the air —
     a pushState landing between history.back() and its popstate is how
     this kind of code usually ends up with a phantom entry */
  if (inflight) return;
  if (want && !armed) pushSentinel();
  else if (!want && armed) popSentinel();
}
function sync(){
  if (stepping) return;                 /* mid-step; the caller syncs after */
  want = !atRoot();
  apply();
}

/* ── where are we ──────────────────────────────────────────────────── */

/* Every panel is a direct child of #app whose id starts scr-, whether it
   was written into index.html or built at runtime by party.js, kiri-ui.js
   or stats.js. Class names differ (kiri's carries none), the id prefix
   does not. Last one wins: during a cross-fade two can carry .on. */
function activeScreen(){
  var all = document.querySelectorAll('#app > [id^="scr-"].on');
  return all.length ? all[all.length - 1] : null;
}
function screenId(){ var s = activeScreen(); return s ? s.id : null; }

function visible(el){
  if (!el || el.disabled) return false;
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
  /* offsetParent is null for display:none and for anything inside it.
     position:fixed would also report null, but no back control in this
     app is fixed, and the rect check below covers it anyway. */
  var r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/* The app's own back control on whatever is on screen. Ordered: an
   explicit opt-in first, then the aria-label the whole app already uses,
   then kiri's wording. aria-label rather than id or class, because the
   ids are per-module and the labels are the thing every one of them
   genuinely shares — and the thing a screen reader is told, too, so if a
   control does not answer to "Back" it should not be the back route. */
var BACK_SEL = '[data-nav-back],' +
               '[aria-label^="Back"],[aria-label^="back"],' +
               '[aria-label^="Leave the game"],' +
               /* the sign-up / log-in form's Back is a worded button with no
                  aria-label — it does not need one, the word IS the label */
               '#scr-auth [data-act="back"]';
function backControl(scope){
  var els = (scope || document).querySelectorAll(BACK_SEL);
  for (var i = 0; i < els.length; i++) if (visible(els[i])) return els[i];
  return null;
}

/* ── layers: the things that close before a screen changes ──────────
   The four global ones are handled by name. Modules with sheets of
   their own (kiri's #kr-sheet, skarta's .sk-sheet, tombla's) can add
   themselves with KARTI_NAV.layer(); until they do, a back press inside
   one of their sheets is ABSORBED rather than passed to the screen's
   back control, because guessing which button in somebody else's dialog
   means "cancel" is how a back press ends up confirming something.
   Absorbing is safe: every one of those sheets has its own visible way
   out on screen, so nothing is trapped. */
var layers = [];

function globalLayers(){
  var out = [];
  var cv = window.KARTI_CARDVIEW;
  if (cv && cv.isOpen) out.push(function(){ cv.hide(); });
  var modal = document.getElementById('modal');
  if (modal && modal.classList.contains('on'))
    out.push(function(){ if (K() && K().closeModal) K().closeModal(); else modal.classList.remove('on'); });
  var sheet = document.getElementById('sheet');
  if (sheet && sheet.classList.contains('on'))
    out.push(function(){ if (K() && K().closeSheet) K().closeSheet();
                         else { sheet.classList.remove('on');
                                var sc = document.getElementById('scrim');
                                if (sc) sc.classList.remove('on'); } });
  /* party.js's yes/no over a board (Resign, and chess/dama's askLeave).
     Back means "no, carry on" — the same as its own No button. */
  var ask = document.querySelector('#app .pt-ask');
  if (ask && visible(ask)){
    var no = ask.querySelector('#pt-no');
    out.push(function(){ if (no) no.click(); else ask.remove(); });
  }
  return out;
}

/* a foreign dialog we can see but must not guess our way out of */
function foreignDialogOpen(){
  var s = activeScreen();
  if (!s) return false;
  var d = s.querySelectorAll('[aria-modal="true"],[role="dialog"]');
  for (var i = 0; i < d.length; i++){
    if (!visible(d[i])) continue;
    if (d[i].closest('.pt-ask')) continue;        /* handled above */
    if (d[i].closest('.pt-over')) continue;       /* a result: see stepBack */
    return true;
  }
  return false;
}

function anyLayer(){
  if (globalLayers().length) return true;
  for (var i = 0; i < layers.length; i++){
    try { if (layers[i].isOpen()) return true; } catch (e) {}
  }
  return foreignDialogOpen();
}

function closeTopLayer(){
  var g = globalLayers();
  if (g.length){ g[g.length - 1](); return true; }
  for (var i = layers.length - 1; i >= 0; i--){
    try { if (layers[i].isOpen()){ layers[i].close(); return true; } } catch (e) {}
  }
  if (foreignDialogOpen()) return true;           /* absorb, change nothing */
  return false;
}

/* ── guards: leaving this would throw a game away ──────────────────── */
var guards = [];

/* A live duel. #scr-duel has no back control — Forfeit lives inside the
   battle-log sheet — so `leave` drives that sheet rather than inventing a
   second way out: netSend('forfeit') tells an online opponent, endDuel()
   pays out and shows the result, exactly as tapping it by hand would. */
var duelGuard = {
  id: 'duel',
  when: function(){
    var d = K() && K().D;
    return screenId() === 'scr-duel' && !!d && !d.over;
  },
  head: 'Walk away from the duel?',
  why: 'The duel is still on. Leaving now counts as a forfeit and the loss goes on your record.',
  yes: 'Forfeit',
  leave: function(){
    var log = document.getElementById('log-btn');
    if (!log){ if (K()){ K().D = null; K().go('home'); } return; }
    log.click();                                   /* opens the battle log */
    var q = document.getElementById('lg-quit');
    if (q) q.click();                              /* the real forfeit path */
    else { if (K() && K().closeSheet) K().closeSheet();
           if (K()){ K().D = null; K().go('home'); } }
  }
};

/* A party board game with its frame on screen (party.js's ui.frame, used
   by chess and dama, plus anything else that adopts it). Skipped when the
   game is online — #pt-net is only ever shown by a networked game, and
   chess and dama already route their own back arrow through askLeave()
   in that case, so guarding here as well would ask twice. */
function partyFrame(){
  var s = activeScreen();
  if (!s || s.id !== 'scr-party') return null;
  var wrap = s.querySelector('.pt-wrap');
  if (!wrap || !visible(wrap)) return null;
  if (wrap.querySelector('.pt-over')) return null;       /* game already over */
  var net = wrap.querySelector('#pt-net');
  if (net && visible(net)) return null;                  /* online: its own ask */
  return wrap;
}
var partyGuard = {
  id: 'party-frame',
  when: function(){ return !!partyFrame(); },
  head: 'Leave the game?',
  why: 'This game is still going. Step out now and the board is gone.',
  yes: 'Leave it',
  /* backControl(), not '#pt-back'. Skarta builds its own bar inside the same
     .pt-wrap and calls its button #sk-back; klabb calls its #kb-back. Asking
     for the id would have found nothing there, so the visible button would
     have gone unguarded while the gesture was guarded — the exact
     disagreement this is here to avoid. The aria-label is what they share. */
  control: function(){ var w = partyFrame(); return w && backControl(w); },
  leave: function(){
    var w = partyFrame(); if (!w) return;
    var b = backControl(w);
    if (b) click(b);
    else if (window.KARTI_PARTY && KARTI_PARTY.hub) KARTI_PARTY.hub();
  }
};

function activeGuard(){
  for (var i = 0; i < guards.length; i++){
    try { if (guards[i].when()) return guards[i]; } catch (e) {}
  }
  return null;
}

/* ── the confirm ────────────────────────────────────────────────────
   nav's own, so it can ask on screens whose modules are not ours, and
   so the wording is the same wherever the question comes up. Styled in
   css/extra.css (.knav-ask). Built here rather than borrowing
   party.js's confirm(), which needs a board context. */
var askEl = null;
function askOpen(){ return !!(askEl && askEl.isConnected); }
function askClose(){ if (askEl && askEl.isConnected) askEl.remove(); askEl = null; }

function ask(o){
  askClose();
  var d = document.createElement('div');
  d.className = 'knav-ask';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-modal', 'true');
  d.setAttribute('aria-label', o.head);
  d.innerHTML =
    '<div class="knav-card">' +
      '<h3></h3><p></p>' +
      '<div class="knav-acts">' +
        '<button type="button" class="knav-yes"></button>' +
        '<button type="button" class="knav-no">No, carry on</button>' +
      '</div>' +
    '</div>';
  d.querySelector('h3').textContent = o.head || 'Leave?';
  d.querySelector('p').textContent  = o.why  || '';
  var yes = d.querySelector('.knav-yes');
  var no  = d.querySelector('.knav-no');
  yes.textContent = o.yes || 'Leave';
  yes.onclick = function(){ askClose(); try { o.go(); } catch (e) {} sync(); };
  no.onclick  = function(){ askClose(); if (o.onNo) o.onNo(); sync(); };
  d.addEventListener('click', function(e){ if (e.target === d) no.click(); });
  (document.getElementById('app') || document.body).appendChild(d);
  no.focus();
  askEl = d;
  return d;
}

/* ── one step back ─────────────────────────────────────────────────── */
var bypass = false;
function click(el){ bypass = true; try { el.click(); } finally { bypass = false; } }

function stepBack(){
  if (askOpen()){ askClose(); return true; }
  if (closeTopLayer()) return true;

  var s = activeScreen();

  /* a finished party game sitting under its result card: the result's own
     first button is the way out, and it is the one the player would tap */
  if (s){
    var over = s.querySelector('.pt-over:not(.pt-ask)');
    if (over && visible(over)){
      var btns = over.querySelectorAll('.pt-acts button'), i;
      for (i = 0; i < btns.length; i++){
        if (/back|party|home|menu|hub|done|finish/i.test(btns[i].textContent)){ click(btns[i]); return true; }
      }
    }
  }

  var g = activeGuard();
  if (g){ ask({ head:g.head, why:g.why, yes:g.yes, go:g.leave }); return true; }

  var b = s ? backControl(s) : null;
  if (b){ click(b); return true; }

  if (s && s.id !== 'scr-home' && K() && K().go){ K().go('home'); return true; }
  return false;                                   /* root: let the app close */
}

/* ── root ───────────────────────────────────────────────────────────
   Home is root. So is auth with nothing stacked on it — its own Back
   button only exists inside the signup/login form, and backControl()
   finds it when it is there. So is the IL-QASMA starter ceremony: it is
   the gate renderHome() itself bounces you back into until a starter
   deck is claimed, so there is nowhere behind it to go, and pretending
   otherwise would be the trap. The roll is saved, so closing and
   reopening resumes it. */
function atRoot(){
  if (askOpen()) return false;
  if (anyLayer()) return false;
  var s = activeScreen();
  if (!s) return true;
  if (s.id === 'scr-home') return true;
  if (s.id === 'scr-gacha') return true;
  if (s.id === 'scr-auth') return !backControl(s);
  return false;
}

/* ── the visible button must ask the same question ──────────────────
   A guard that only covered the gesture would give the app two ways out
   that disagree, which is worse than one. Capture phase, so it lands
   before party.js's own onclick, and only for the control that guard
   actually protects. */
function wireGuardIntercept(){
  document.addEventListener('click', function(e){
    if (bypass) return;
    var g = activeGuard();
    if (!g || !g.control) return;
    var c;
    try { c = g.control(); } catch (err) { return; }
    if (!c) return;
    var t = e.target && e.target.closest ? e.target.closest('button,[role="button"],a') : null;
    if (t !== c && c !== e.target) return;
    e.preventDefault(); e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    ask({ head:g.head, why:g.why, yes:g.yes, go:g.leave });
    sync();
  }, true);
}

/* ── history wiring ─────────────────────────────────────────────────── */
function onPop(e){
  if (inflight){ inflight--; apply(); return; }    /* our own popSentinel */

  /* Landing on an entry we tagged as the sentinel means the traversal went
     FORWARD into one — nothing to undo, just believe it. */
  if (e.state && e.state.knav === 1){ armed = true; want = true; return; }

  if (!armed) return;   /* at root already: the browser is leaving. Let it. */

  armed = false;        /* the sentinel has just been consumed by the press */
  stepping = true;
  try { stepBack(); } catch (err) { try { console.error('nav', err); } catch (e2) {} }
  stepping = false;
  /* re-arm on the next tick: a step that opens a sheet or a confirm has
     not finished painting yet, and atRoot() must see the finished state */
  setTimeout(sync, 0);
}

/* ── observation ────────────────────────────────────────────────────
   Nothing in the app tells us it navigated, so we watch for it: class
   flips on the screens, and nodes added or removed (a sheet, a dialog,
   #scr-party appearing for the first time). The 700 ms tick is a safety
   net for anything the observer cannot see (a getter flipping, a duel
   ending); atRoot() is a handful of DOM reads, so it is cheap even while
   a board is repainting. */
function observe(){
  if (typeof MutationObserver === 'function'){
    var t = 0;
    var mo = new MutationObserver(function(){
      if (t) return;
      /* one sync per turn of the loop however many nodes changed — a board
         repainting sixty-four squares must not cost sixty-four syncs */
      t = setTimeout(function(){ t = 0; sync(); }, 0);
    });
    /* BODY, not #app. #sheet, #scrim and #modal are SIBLINGS of #app, not
       children of it — they sit after its closing tag in index.html — so an
       observer rooted at #app never heard the .on class land on a sheet.
       The sentinel was then only armed by the 700 ms tick below, and a back
       press inside that window closed the app instead of closing the sheet.
       Caught by a test that opened the settings sheet and pressed back
       400 ms later: it passed on one run and failed on the next, which is
       exactly what a missed observer looks like.
       attributeFilter deliberately omits `style`: cardview writes an inline
       transform on every touchmove while the sheet is being dragged, and
       none of it changes where back should go. */
    mo.observe(document.body, { attributes:true, attributeFilter:['class','hidden'],
                                childList:true, subtree:true });
  }
  /* the safety net, for state no mutation reveals — a duel ending, a getter
     flipping. atRoot() is a handful of DOM reads, so this is cheap even mid-game. */
  setInterval(sync, 700);
}

/* ── the press that really does close the app ───────────────────────
   Back at the root leaves the page for good. pagehide is the last event
   an installed PWA reliably gets, so the relay is told the seat is free
   rather than waiting for a socket timeout. mpLeave() checks
   readyState === 1 itself, so calling it when there is no room is a
   no-op, and it is safe to call twice. */
function wireExit(){
  window.addEventListener('pagehide', function(){
    try { if (window.KARTI_MP && KARTI_MP.mpLeave) KARTI_MP.mpLeave(); } catch (e) {}
  });
}

function boot(){
  /* tag the entry we are standing on, so a popstate can tell base from
     sentinel even after a reload restored a mid-stack entry */
  try { history.replaceState({ knav: 0 }, ''); } catch (e) {}
  armed = false; want = false; inflight = 0;
  guards.push(duelGuard, partyGuard);
  window.addEventListener('popstate', onPop);
  wireGuardIntercept();
  wireExit();
  observe();
  sync();
}

window.KARTI_NAV = {
  /* one step back, exactly as the system back gesture does it */
  back: function(){
    if (atRoot()) return false;
    stepping = true;
    var r = false;
    try { r = stepBack(); } finally { stepping = false; }
    setTimeout(sync, 0);
    return r;
  },
  atRoot: atRoot,
  /* modules with a game in play: KARTI_NAV.guard({id, when, head, why,
     yes, leave, control}). `control` is optional and names the visible
     button the same question should be asked from. */
  guard: function(g){
    if (!g || !g.id || typeof g.when !== 'function' || typeof g.leave !== 'function') return;
    this.unguard(g.id);
    guards.unshift(g);
  },
  unguard: function(id){ guards = guards.filter(function(g){ return g.id !== id; }); },
  /* modules with a dismissible sheet: KARTI_NAV.layer({id, isOpen, close}) */
  layer: function(l){
    if (!l || !l.id || typeof l.isOpen !== 'function' || typeof l.close !== 'function') return;
    this.unlayer(l.id);
    layers.push(l);
  },
  unlayer: function(id){ layers = layers.filter(function(l){ return l.id !== id; }); },
  ask: ask,
  sync: sync,
  debug: function(){
    var s = activeScreen();
    var g = activeGuard();
    return { screen: s ? s.id : null, root: atRoot(), armed: armed, want: want,
             inflight: inflight, layer: anyLayer(), ask: askOpen(),
             guard: g ? g.id : null,
             back: s && backControl(s) ? (backControl(s).id || backControl(s).getAttribute('aria-label')) : null,
             histLen: history.length, state: history.state };
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
