/* ═══════════════════════════════════════════════════════════════════
   KARTI — progress-ui.js
   THE PAYOFF SCREEN, THE CUSTOMISATION SCREEN, AND THE FACE PICKER.

   ── THE END OF A GAME IS THE HEADLINE ─────────────────────────────
   You see this after every single game, eleven games, forever. So it
   is designed for the two-hundredth viewing, not the first:

     · IT DOES NOT BLOCK AND IT DOES NOT ASK. A banner slides down over
       the top of whatever the game put on screen, counts the XP into
       the bar, states where you stand, and takes itself away. No
       button, no tap, 1.8 seconds end to end. The game's own result
       card is never covered — it is under the banner, uncovered again
       before you have reached for it.
     · TAP TO SKIP, AND SKIP LANDS ON THE FINISHED STATE. Every number
       jumps to its final value; nothing is cancelled and nothing is
       lost. An animation you cannot get past is the fastest way to
       make somebody hate a screen they see after every game.
     · A LEVEL IS RARE AND IS ALLOWED TO BE AN EVENT. Then, and only
       then, the banner opens out into a card that HOLDS: more light,
       the payout counted, and the thing you unlocked drawn — its
       actual preview, not its name — with one button.
     · LOSING PAYS AND LOSING MOVES THE BAR. Quieter, lower, fewer
       notes. But it moves, because a reward screen that punishes you
       for losing is a reward screen people stop playing towards.

   ── THE SOUND IS ONE CUE, NOT FOUR SOUNDS NEAR EACH OTHER ─────────
   Two layers while the bar runs, and one of them is the other's floor:

     xp.fill   ONE swell, started once at the top of the fill and left
               to run underneath everything. 1.14s trimmed, and the
               ANIMATION IS TIMED TO IT rather than the other way
               round: the bar takes 880ms from a 300ms start, so the
               swell's last quarter carries under the standings landing
               instead of leaving the dead air a trimmed tail would.
     xp.tick   six of them across that fill, rate climbing 1.00→1.21 so
               it is a rise and not a rattle. This is run()'s pattern
               driven from the animation frame instead of setTimeout,
               for one reason: SKIP MUST SILENCE THE REST. A scheduled
               run() would keep ticking over a banner that has already
               gone, which is precisely the thing that makes a reward
               screen feel cheap on the twentieth viewing.

   And on the rare frames where a level lands:

     xp.level  ONE sound, the loudest in the set because it is the
               rarest, fired on the frame the bar hits full.
     xp.unlock 900ms later, landing on xp.level's clean tail as the
               unlock's preview finishes expanding. Only when there IS
               something to show.

   Deliberately NOT played: a coin run under a level-up. The coins are
   drawn on the card and xp.level is already the payoff — a third
   sound there is four sounds near each other pretending to be a cue.
   The gains in js/sfx.js are a measured ladder (tick -32dB … level
   -22.6dB) and nothing here overrides them except to duck the whole
   thing on a loss, which is a musical decision and not a fix.
   Nothing was added to audio/ for this.

   ── THE CUSTOMISATION SCREEN IS ITS OWN SCREEN ────────────────────
   Not an extra tab on js/game.js's Inventory. That screen is the CARD
   inventory and the deck builder — two levels deep already, with its
   own back semantics and its own draft state — and it lives inside a
   200 KB file belonging to somebody else. Customisation is orthogonal
   to cards and spans all eleven games, so it is a sibling reached from
   the profile, built at runtime, exactly as js/party.js, js/kiri-ui.js
   and js/stats.js build theirs. Two things that are not the same thing
   do not go in one screen because they are both called "inventory".

   HOUSE RULES OBEYED HERE: no emoji; var(--disp) for the display face
   and never a font name; nothing that could parent .tabbar gets a
   transform, filter or backdrop-filter; the shell never scrolls, only
   an inner panel does; and every screen is finished with no art files
   present at all.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

if (!window.KARTI_XP || window.KARTI_XP._uiLoaded) return;

var XP = window.KARTI_XP;
var FACES = window.KARTI_FACES;

/* ═══════════════════════════════════════════════════════════════════
   0. SMALL CHANGE
   ═══════════════════════════════════════════════════════════════════ */
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}
function ico(n, label){ return window.ICO ? window.ICO(n, label) : ''; }
function $(sel, root){ return (root || document).querySelector(sel); }
function $$(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function sfx(fn){ try { if (window.KARTI_SFX) fn(window.KARTI_SFX); } catch (e){} }
function reduced(){
  try { if (window.KARTI && KARTI.REDUCED) return true; } catch (e){}
  return document.documentElement.classList.contains('reduced');
}

/* a game's colour and its two letters, taken from the record book's
   own shelf so a game is the same colour here as it is there */
function gameDef(id){
  var shelf = [];
  try { if (window.KARTI_STATS && KARTI_STATS.GAMES) shelf = KARTI_STATS.GAMES; } catch (e){}
  for (var i = 0; i < shelf.length; i++) if (shelf[i].id === id) return shelf[i];
  try { if (window.KARTI_STATS && KARTI_STATS._defOf) return KARTI_STATS._defOf(id); } catch (e){}
  var pretty = String(id).replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, function(c){ return c.toUpperCase(); });
  return { id:id, name:pretty, icon:'deck', mono:'??', accent:'#A093C4' };
}

/* ═══════════════════════════════════════════════════════════════════
   1. FACES, WHEREVER A PLAYER IS

   ONE WAY TO DRAW A PLAYER, BY CONSTRUCTION. This screen was wrong
   three times in one day, and all three faults had the same shape:
   somewhere had its own way of turning a player into markup — a bare
   initial here, a describe() call skipped there, a photograph mounted
   on one branch and not the other. So the branches are gone:

     · XP.describe(name, opts) is the ONLY statement of what a player
       looks like — face, ring, photograph URL. Nothing else decides.
     · avatarHTML() below is the ONLY renderer, and it is nothing but
       describe() handed to FACES.frame(). Every surface — the home
       pill, the profile sheet, this screen, the record book, the
       leaderboard — is a call to it, directly or via the span.
     · wirePics() is the ONLY thing that mounts a photograph, and it
       runs unconditionally after every paint plus on every DOM sweep,
       so there is no branch left that can forget it.

   The declarative form, for markup that is written before this file
   has painted it (or by files that must stay markup-only):

     <span data-kx-av="<name>" data-kx-size="34"
           data-kx-face="hint" data-kx-who="acct" data-kx-pv="3"
           data-kx-border="sea"></span>

   paintOne() reads those attributes, calls avatarHTML() and mounts
   the photo — it OWNS NO RENDERING LOGIC OF ITS OWN, so it cannot
   disagree with a direct call. The old second branch, which upgraded
   js/game.js's bare `<span class="avatar">T</span>` with hand-built
   mark+ring markup, is deleted; js/game.js now writes the span above
   itself (with the initial inside as the no-module fallback).

   The observer exists because screens repaint their own DOM whenever
   they like and the spans arrive empty. It is debounced to one
   animation frame and every span carries a stamp of what it was last
   painted as, so it converges in one pass and cannot chase its tail.
   ═══════════════════════════════════════════════════════════════════ */
/* THE LEVEL ON A FACE, decided in ONE place.

   The level rides with the medallion: for the player themselves we know
   it, and for anybody else it is whatever the relay published beside
   their name. Two callers need the answer — the painter, which draws
   it, and the stamp, which decides whether to redraw at all — and if
   those two ever disagree by a single digit the badge silently stops
   updating. So neither of them works it out; both ask this. */
function levelFor(o, d){
  if (o && o.lv != null) return o.lv | 0;
  if (d && d.mine) { try { return XP.level ? XP.level() : 0; } catch (e){ return 0; } }
  return 0;
}

function avatarHTML(name, opts){
  var o = opts || {};
  /* one descriptor for everybody — face, ring, photograph — so the
     leaderboard, the roster and a seat plate cannot disagree about
     what a player looks like */
  var d = XP.describe(name, { me:o.me, who:o.who, hint:o.hint,
                              border:o.border, lvb:o.lvb, pv:o.pv, face:o.face });
  var f = XP.face(d.face);
  return FACES.frame(d.face, {
    size: o.size || 38,
    lv: levelFor(o, d),
    lvb: o.noBorder ? '' : d.lvb,
    accent: o.accent || (f && f.ax) || '#FFC542',
    cls: o.cls,
    style: o.style,
    border: o.noBorder ? '' : d.border,
    pic: o.noPic ? '' : d.pic,
    label: o.label || (name ? String(name) + (f ? ' — ' + f.name : '') : (f ? f.name : 'Player'))
  });
}

/* ── PROBE, THEN MOUNT ────────────────────────────────────────────
   The rule js/artkit.js and js/stats.js already work by, and the only
   honest way to put a photograph that lives on a frequently
   unreachable Pi into a screen that must always be finished:

     · the drawn face is ALREADY in the markup and is never removed;
     · a photograph is fetched by a plain `new Image()` and is only
       put in the document once it has actually decoded;
     · one probe per URL for the whole app, remembered — including the
       failures, so twenty-five rows asking for one absent photo cost
       one request, not twenty-five;
     · and because the URL carries the version the relay published
       beside the player's name, a player with NO photo has no URL at
       all and therefore costs nothing whatsoever.

   There is no code path here that can show a broken image, and none
   that leaves somebody faceless because the server was off. */
var picState = {};                 /* url -> 'probing' | 'ok' | 'no' */

function mountPic(host, url){
  if (host.querySelector('img.kx-ph')) return;
  var im = document.createElement('img');
  im.className = 'kx-ph';
  im.alt = '';
  im.setAttribute('aria-hidden', 'true');
  im.decoding = 'async';
  im.src = url;
  /* after the drawn face so it covers it, before the ring so the ring
     stays on top — the border frames the photograph, not the reverse */
  var ring = host.querySelector('.kx-ring');
  if (ring) host.insertBefore(im, ring); else host.appendChild(im);
}

function sweepPic(url){
  $$('[data-kx-pic]').forEach(function(h){
    if (h.getAttribute('data-kx-pic') === url) mountPic(h, url);
  });
}

var picFail = '';
function wirePics(root){
  $$('[data-kx-pic]', root || document).forEach(function(host){
    var url = host.getAttribute('data-kx-pic');
    if (!url || host.querySelector('img.kx-ph')) return;
    var st = picState[url];
    if (st === 'no' || st === 'probing') return;
    if (st === 'ok'){ mountPic(host, url); return; }
    /* a data: URL is my own photo out of local storage — already
       decoded, already here, nothing to probe and nothing that can
       404. It is why my own face is right with no network at all. */
    if (url.slice(0, 5) === 'data:'){ picState[url] = 'ok'; mountPic(host, url); return; }
    picState[url] = 'probing';
    var im = new Image();
    im.onload = function(){
      picState[url] = im.naturalWidth > 0 ? 'ok' : 'no';
      if (picState[url] === 'ok') sweepPic(url);
    };
    im.onerror = function(){
      picState[url] = 'no';
      /* A silent fallback to the drawn face is exactly right for SOMEBODY
         ELSE's photo — most players have none and a board of twenty-five must
         not fill with broken images. It is exactly wrong for your OWN, because
         then the app quietly shows you a face you did not choose and gives you
         nothing to act on. Remember the failure so the customisation screen
         can say what happened. */
      picFail = url;
      try {
        var n = document.getElementById('kx-pnote');
        if (n && !n.textContent) n.textContent =
          'Your photo is on the Pi but this phone could not load it. ' +
          'If Tailscale is on, turn it off and open KARTI again.';
      } catch (e){}
    };
    im.src = url;
  });
}

/* Fill one declarative span. Everything it knows comes off the
   attributes; everything it draws comes out of avatarHTML(); the
   photograph goes through wirePics() every single time. There is no
   second branch for this function to disagree with itself in. */
function paintOne(el){
  var name = el.getAttribute('data-kx-av') || '';
  var o = { size: parseInt(el.getAttribute('data-kx-size'), 10) || 34,
            hint: el.getAttribute('data-kx-face') || '' };
  var lvAttr = el.getAttribute('data-kx-lv');
  if (lvAttr != null && lvAttr !== '') o.lv = parseInt(lvAttr, 10) || 0;
  /* the relay-published look of somebody who is not on this phone —
     a roster or a seat plate writes these beside the name. No pv, no
     photograph, no request: exactly describe()'s rule. */
  var who = el.getAttribute('data-kx-who');
  if (who) o.who = who;
  var bd = el.getAttribute('data-kx-border');
  if (bd) o.border = bd;
  var lb = el.getAttribute('data-kx-lvb');
  if (lb) o.lvb = lb;
  var pv = el.getAttribute('data-kx-pv');
  if (pv != null && pv !== '') o.pv = pv | 0;

  /* the stamp is describe()'s own answer, so the span repaints when —
     and only when — the truth about the player has changed.

     THE LEVEL IS PART OF THAT TRUTH and has to be in the stamp. It was
     not, at first, and the bug that produced is quiet and nasty: face,
     border and photo are all unchanged when you level up, so the stamp
     matched, the early return fired, and every avatar on the screen
     went on displaying the old number until something else about the
     player happened to change. The badge would have looked broken in
     exactly the situation it exists for. */
  var d = XP.describe(name, o);
  var stamp = o.size + '|' + d.face + '|' + (d.border || '') + '|' + (d.pic || '') +
              '|' + levelFor(o, d) + '|' + (d.lvb || '');
  if (el.getAttribute('data-kx-done') === stamp) return;
  el.innerHTML = avatarHTML(name, o);
  wirePics(el);
  el.setAttribute('data-kx-done', stamp);
}

function repaintAvatars(root){
  if (!FACES) return;
  FACES.ready();
  var r = root || document;
  try {
    $$('[data-kx-av]', r).forEach(paintOne);
    wirePics(r);
  } catch (e){}
}

var repaintQ = 0;
function queueRepaint(){
  if (repaintQ) return;
  repaintQ = requestAnimationFrame(function(){ repaintQ = 0; repaintAvatars(); });
}

/* THREE ROOTS, NOT ONE, AND NOT document.body. #sheet and #modal are
   SIBLINGS of #app in index.html, so an observer on #app alone never
   saw the profile sheet and the face in it stayed an empty box — which
   is exactly what happened the first time this was tried. Watching
   document.body instead would have fixed it and put a subtree
   observer over every board repaint in the app; these three cover
   every place a player can be named, and two of them are small
   dialogs that repaint once when they open. */
function watchAvatars(){
  if (typeof MutationObserver !== 'function') return;
  var obs = new MutationObserver(function(recs){
    for (var i = 0; i < recs.length; i++)
      if (recs[i].addedNodes && recs[i].addedNodes.length){ queueRepaint(); return; }
  });
  ['app', 'sheet', 'modal'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) obs.observe(el, { childList:true, subtree:true });
  });
  queueRepaint();
}

/* ═══════════════════════════════════════════════════════════════════
   2. THE STYLESHEET
   One sheet, injected once, everything prefixed kx-. Nothing in here
   can leak into another module's screen and nothing here is loaded
   from a file.
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS(){
  if (document.getElementById('kx-ui-css') || !document.head) return;
  var st = document.createElement('style');
  st.id = 'kx-ui-css';
  st.textContent =

  /* ─────────────── the reward banner ─────────────── */
  /* position:fixed, above everything, and it is NOT an ancestor of the
     tab bar — so the one transform in this file (the slide) is safe */
  '#kx-rw{position:fixed;left:0;right:0;top:0;z-index:400;display:flex;justify-content:center;' +
    /* the notch. A banner that slides down from the top has to clear
       whatever the phone put there or the first line of it is behind
       the clock — his is an installed icon with a real inset. */
    'padding:calc(8px + env(safe-area-inset-top,0px)) 10px 0;pointer-events:none}' +
  '#kx-rw.hold{top:0;bottom:0;align-items:center;background:rgba(8,5,14,.72);pointer-events:auto}' +
  '#kx-rw .kx-card{width:100%;max-width:420px;border-radius:16px;padding:11px 13px 12px;' +
    'background:linear-gradient(155deg,rgba(36,26,62,.98),rgba(20,14,36,.98));' +
    'border:1px solid var(--line2,rgba(255,255,255,.18));' +
    'box-shadow:0 10px 30px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.10);' +
    'transform:translateY(-124%);opacity:0;transition:transform .19s cubic-bezier(.2,.9,.3,1),opacity .19s linear;' +
    'pointer-events:auto}' +
  '#kx-rw.in .kx-card{transform:translateY(0);opacity:1}' +
  '#kx-rw.hold .kx-card{transform:translateY(0);opacity:1}' +
  '.reduced #kx-rw .kx-card{transition:none}' +

  '#kx-rw .kx-top{display:flex;align-items:center;gap:10px;min-width:0}' +
  '#kx-rw .kx-em{position:relative;width:34px;height:34px;border-radius:10px;flex:0 0 auto;' +
    'display:grid;place-items:center;color:var(--kx-ax);' +
    'background:linear-gradient(160deg,rgba(255,255,255,.10),rgba(0,0,0,.25));' +
    'border:1px solid rgba(255,255,255,.14)}' +
  '#kx-rw .kx-em .ico{width:20px;height:20px;font-size:20px}' +
  '#kx-rw .kx-ttl{flex:1;min-width:0}' +
  '#kx-rw .kx-ttl b{display:block;font-family:var(--disp);font-weight:900;font-size:12px;' +
    'letter-spacing:.09em;text-transform:uppercase;color:var(--txt,#F4EFFF);' +
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '#kx-rw .kx-ttl i{display:block;font-style:normal;margin-top:2px;font-size:11px;color:var(--dim,#A093C4);' +
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '#kx-rw .kx-ttl i.win{color:var(--ok,#3DDC84)}' +
  '#kx-rw .kx-ttl i.lose{color:var(--bad,#FF5468)}' +
  '#kx-rw .kx-gain{flex:0 0 auto;font-family:var(--disp);font-weight:900;font-size:17px;' +
    'line-height:1;color:var(--gold,#FFC542);font-variant-numeric:tabular-nums;' +
    'opacity:0;transform:translateY(-4px);transition:opacity .16s linear,transform .16s var(--ease,ease)}' +
  '#kx-rw.go .kx-gain{opacity:1;transform:translateY(0)}' +
  '#kx-rw .kx-gain small{font-size:9px;letter-spacing:.12em;margin-left:2px;opacity:.75}' +

  '#kx-rw .kx-barrow{display:flex;align-items:center;gap:8px;margin-top:9px}' +
  '#kx-rw .kx-lv{flex:0 0 auto;min-width:26px;height:22px;padding:0 6px;border-radius:7px;' +
    'display:grid;place-items:center;font-family:var(--disp);font-weight:900;font-size:11px;' +
    'font-variant-numeric:tabular-nums;background:var(--gold,#FFC542);color:#241800}' +
  '#kx-rw .kx-lv.nx{background:rgba(255,255,255,.08);color:var(--dim2,#7F73A0)}' +
  '#kx-rw .kx-bar{flex:1;min-width:0;height:11px;border-radius:99px;overflow:hidden;position:relative;' +
    'background:rgba(255,255,255,.07);box-shadow:inset 0 1px 2px rgba(0,0,0,.5)}' +
  '#kx-rw .kx-bar i{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:99px;' +
    'background:linear-gradient(90deg,#FFB020,#FFE9B0)}' +
  '#kx-rw .kx-bar u{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:99px;' +
    'background:rgba(255,255,255,.30)}' +
  '#kx-rw .kx-num{flex:0 0 auto;font-size:10px;font-weight:700;letter-spacing:.06em;' +
    'color:var(--dim2,#7F73A0);font-variant-numeric:tabular-nums;min-width:56px;text-align:right}' +

  '#kx-rw .kx-foot{margin-top:8px;font-size:11px;line-height:1.45;color:var(--dim,#A093C4);' +
    'opacity:0;transition:opacity .18s linear;display:flex;align-items:center;gap:7px}' +
  '#kx-rw.stand .kx-foot{opacity:1}' +
  '#kx-rw .kx-foot b{color:var(--txt,#F4EFFF);font-weight:800}' +
  '#kx-rw .kx-foot .kx-board{margin-left:auto;flex:0 0 auto;font-family:var(--disp);font-weight:900;' +
    'font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold,#FFC542);' +
    'background:rgba(255,197,66,.12);border:1px solid rgba(255,197,66,.30);border-radius:7px;' +
    'padding:4px 7px;white-space:nowrap}' +
  '#kx-rw .kx-tbl{display:grid;gap:3px;margin-top:7px;opacity:0;transition:opacity .18s linear}' +
  '#kx-rw.stand .kx-tbl{opacity:1}' +
  '#kx-rw .kx-tr{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--dim,#A093C4);' +
    'padding:3px 6px;border-radius:7px;background:rgba(255,255,255,.03)}' +
  '#kx-rw .kx-tr.me{background:rgba(255,197,66,.10);color:var(--txt,#F4EFFF)}' +
  '#kx-rw .kx-tr b{flex:1;min-width:0;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '#kx-rw .kx-tr span{flex:0 0 auto;font-variant-numeric:tabular-nums;font-weight:900;' +
    'font-family:var(--disp);font-size:11px}' +

  /* the level-up half — only ever built when a level actually lands */
  '#kx-rw .kx-up{max-height:0;overflow:hidden;transition:max-height .34s cubic-bezier(.2,.9,.3,1)}' +
  '#kx-rw.up .kx-up{max-height:420px}' +
  '.reduced #kx-rw .kx-up{transition:none}' +
  '#kx-rw .kx-upin{margin-top:11px;padding-top:11px;border-top:1px solid rgba(255,255,255,.10)}' +
  '#kx-rw .kx-uph{display:flex;align-items:center;gap:9px}' +
  '#kx-rw .kx-uph .kx-big{font-family:var(--disp);font-weight:900;font-size:26px;line-height:1;' +
    'color:var(--gold,#FFC542);text-shadow:0 0 22px rgba(255,197,66,.45)}' +
  '#kx-rw .kx-uph span{font-size:11px;line-height:1.4;color:var(--dim,#A093C4)}' +
  '#kx-rw .kx-uph span b{display:block;font-family:var(--disp);font-size:11.5px;letter-spacing:.1em;' +
    'text-transform:uppercase;color:var(--txt,#F4EFFF)}' +
  '#kx-rw .kx-pay{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}' +
  '#kx-rw .kx-pill{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:99px;' +
    'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);font-size:11px;' +
    'font-weight:800;color:var(--txt,#F4EFFF)}' +
  '#kx-rw .kx-pill .ico{font-size:1.15em;color:var(--gold,#FFC542)}' +
  '#kx-rw .kx-unl{display:flex;align-items:center;gap:10px;margin-top:9px;padding:8px;border-radius:12px;' +
    'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12)}' +
  '#kx-rw .kx-unl .kx-pv{flex:0 0 auto;width:62px;height:62px;border-radius:11px;overflow:hidden;' +
    'display:grid;place-items:center;background:rgba(0,0,0,.30)}' +
  '#kx-rw .kx-unl .kx-pt{min-width:0}' +
  '#kx-rw .kx-unl .kx-pt b{display:block;font-family:var(--disp);font-weight:900;font-size:11.5px;' +
    'letter-spacing:.07em;text-transform:uppercase;color:var(--txt,#F4EFFF)}' +
  '#kx-rw .kx-unl .kx-pt i{display:block;font-style:normal;margin-top:3px;font-size:11px;line-height:1.4;' +
    'color:var(--dim,#A093C4)}' +
  '#kx-rw .kx-acts{display:flex;gap:8px;margin-top:11px}' +
  '#kx-rw .kx-acts button{flex:1;min-height:44px;border-radius:11px;font-family:var(--disp);' +
    'font-weight:900;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;' +
    'background:var(--gold,#FFC542);color:#241800;border:0}' +
  '#kx-rw .kx-acts button.ghost{background:rgba(255,255,255,.07);color:var(--txt,#F4EFFF);' +
    'border:1px solid rgba(255,255,255,.16)}' +

  /* ─────────────── the customisation screen ─────────────── */
  /* height:100dvh, overflow:hidden, and only .kx-list scrolls. The page
     itself never does — that is the rule the whole shell is built on. */
  '#scr-kx .kx-head{display:flex;align-items:center;gap:12px;padding:11px;border-radius:16px;' +
    'background:linear-gradient(150deg,rgba(255,197,66,.16),rgba(27,20,48,.94) 62%);' +
    'border:1px solid var(--line2,rgba(255,255,255,.18));flex:0 0 auto;margin-bottom:9px}' +
  '#scr-kx .kx-idn{flex:1;min-width:0}' +
  '#scr-kx .kx-idn h3{font-size:15px;letter-spacing:.05em;text-transform:uppercase;' +
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '#scr-kx .kx-idn .kx-nx{margin-top:5px;font-size:10.5px;line-height:1.4;color:var(--dim,#A093C4)}' +
  '#scr-kx .kx-idn .kx-nx b{color:var(--gold,#FFC542);font-weight:900}' +
  '#scr-kx .kx-lvbig{flex:0 0 auto;width:44px;height:44px;border-radius:12px;display:grid;' +
    'place-items:center;background:var(--gold,#FFC542);color:#241800;font-family:var(--disp);' +
    'font-weight:900;font-size:19px;line-height:1;font-variant-numeric:tabular-nums}' +
  '#scr-kx .kx-lvbig small{display:block;font-size:7px;letter-spacing:.14em;margin-top:1px;opacity:.7}' +
  '#scr-kx .kx-hbar{display:flex;align-items:center;gap:8px;flex:0 0 auto;margin:0 2px 10px}' +
  '#scr-kx .kx-hbar .kx-t{flex:1;min-width:0;height:9px;border-radius:99px;overflow:hidden;' +
    'background:rgba(255,255,255,.07)}' +
  '#scr-kx .kx-hbar .kx-t i{display:block;height:100%;border-radius:99px;' +
    'background:linear-gradient(90deg,#FFB020,#FFE9B0)}' +
  '#scr-kx .kx-hbar span{flex:0 0 auto;font-size:10px;font-weight:700;letter-spacing:.08em;' +
    'color:var(--dim2,#7F73A0);font-variant-numeric:tabular-nums}' +

  /* the tab per game he asked for. A strip, because eleven games do not
     fit across 440px and a wrapped tab bar reflows every time you
     switch — the one thing a tab bar must never do. */
  '#scr-kx .kx-tabs{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;flex:0 0 auto;' +
    'margin:0 -12px 9px;padding:1px 12px 5px;scrollbar-width:none}' +
  '#scr-kx .kx-tabs::-webkit-scrollbar{display:none}' +
  '#scr-kx .kx-tabs button{flex:0 0 auto;min-height:36px;padding:0 12px;border-radius:99px;' +
    'display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:11px;font-weight:700;' +
    'letter-spacing:.05em;text-transform:uppercase;color:var(--dim,#A093C4);' +
    'background:var(--panel,#1B1430);border:1px solid var(--line,rgba(255,255,255,.10))}' +
  '#scr-kx .kx-tabs button .ico{font-size:1.2em}' +
  '#scr-kx .kx-tabs button[aria-pressed="true"]{background:var(--gold,#FFC542);color:#241800;' +
    'border-color:#FFE9B0}' +
  '#scr-kx .kx-tabs button .kx-bdg{min-width:16px;height:16px;border-radius:99px;padding:0 4px;' +
    'display:grid;place-items:center;font-size:9px;font-weight:900;background:rgba(255,255,255,.12)}' +
  '#scr-kx .kx-tabs button[aria-pressed="true"] .kx-bdg{background:rgba(0,0,0,.18)}' +

  '#scr-kx .kx-list{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;' +
    '-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:7px;' +
    'padding-bottom:8px;scrollbar-width:thin}' +
  '#scr-kx .kx-list::-webkit-scrollbar{width:5px}' +
  '#scr-kx .kx-list::-webkit-scrollbar-thumb{background:var(--line2,rgba(255,255,255,.18));border-radius:6px}' +
  '#scr-kx .kx-slot{flex:0 0 auto;margin:6px 4px 1px;font-size:9.5px;letter-spacing:.14em;' +
    'text-transform:uppercase;font-weight:700;color:var(--dim2,#7F73A0)}' +

  '#scr-kx .kx-it{display:grid;grid-template-columns:66px minmax(0,1fr) auto;align-items:center;' +
    'column-gap:11px;padding:9px;border-radius:14px;background:var(--panel,#1B1430);' +
    'border:1px solid var(--line,rgba(255,255,255,.10));flex:0 0 auto;text-align:left;width:100%}' +
  '#scr-kx .kx-it.on{border-color:var(--gold,#FFC542);background:rgba(255,197,66,.09)}' +
  '#scr-kx .kx-it.off{opacity:.62}' +
  '#scr-kx .kx-pv{width:66px;height:66px;border-radius:12px;overflow:hidden;display:grid;' +
    'place-items:center;background:rgba(0,0,0,.30);border:1px solid rgba(255,255,255,.08)}' +
  '#scr-kx .kx-pv>*{max-width:100%;max-height:100%}' +
  '#scr-kx .kx-nm{min-width:0}' +
  '#scr-kx .kx-nm b{display:block;font-family:var(--disp);font-weight:900;font-size:12px;' +
    'letter-spacing:.06em;text-transform:uppercase;color:var(--txt,#F4EFFF);' +
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '#scr-kx .kx-nm i{display:block;font-style:normal;margin-top:3px;font-size:11px;line-height:1.4;' +
    'color:var(--dim,#A093C4)}' +
  '#scr-kx .kx-st{flex:0 0 auto;font-family:var(--disp);font-weight:900;font-size:9px;' +
    'letter-spacing:.11em;text-transform:uppercase;padding:5px 8px;border-radius:8px;' +
    'background:rgba(255,255,255,.06);color:var(--dim2,#7F73A0);white-space:nowrap;' +
    'display:flex;align-items:center;gap:4px}' +
  '#scr-kx .kx-st.on{background:var(--gold,#FFC542);color:#241800}' +
  '#scr-kx .kx-st.lock{color:var(--dim2,#7F73A0)}' +
  '#scr-kx .kx-st .ico{font-size:1.25em}' +
  '#scr-kx .kx-st.earn{background:rgba(255,197,66,.14);color:var(--gold,#FFC542)}' +
  '#scr-kx .kx-how{display:block;margin-top:3px;color:var(--gold,#FFC542);font-weight:800;' +
    'font-size:10px;letter-spacing:.06em;text-transform:uppercase}' +

  /* ── THE SHELF: one row per slot ──────────────────────────────
     Deliberately built out of .kx-it's own grid, one size up, so a
     slot row and the items inside it are visibly the same kind of
     object — you tap a row that looks like this and land in a list of
     things that look like this. Three lines of text, not two: what
     the slot is, what you are wearing, and what the slot is for. */
  '#scr-kx .kx-shelf{display:flex;flex-direction:column;gap:9px;flex:0 0 auto}' +
  '#scr-kx .kx-slotrow{display:grid;grid-template-columns:60px minmax(0,1fr) auto;' +
    'align-items:center;column-gap:13px;padding:12px 11px;border-radius:16px;width:100%;' +
    'text-align:left;background:var(--panel,#1B1430);' +
    'border:1px solid var(--line,rgba(255,255,255,.10))}' +
  '#scr-kx .kx-slotrow:active{transform:scale(.985)}' +
  '#scr-kx .kx-slotrow .kx-pv{width:60px;height:60px;background:none;border:0}' +
  '#scr-kx .kx-slotrow .kx-nm i{color:var(--gold,#FFC542);font-weight:800;' +
    'font-size:11.5px;letter-spacing:.02em}' +
  '#scr-kx .kx-slotrow .kx-nm u{display:block;margin-top:3px;text-decoration:none;' +
    'font-size:10.5px;line-height:1.4;color:var(--dim2,#7F73A0)}' +
  '#scr-kx .kx-slotn{flex:0 0 auto;display:flex;align-items:center;gap:5px;' +
    'font-family:var(--disp);font-weight:900;font-size:13px;color:var(--txt,#F4EFFF)}' +
  '#scr-kx .kx-slotn small{font-size:10px;font-weight:800;color:var(--dim2,#7F73A0)}' +
  '#scr-kx .kx-slotn .ico{font-size:15px;color:var(--dim2,#7F73A0)}' +
  /* the way back up, at the top of the list where a thumb expects it */
  '#scr-kx .kx-slotback{flex:0 0 auto;align-self:flex-start;display:flex;align-items:center;' +
    'gap:6px;margin:0 0 4px;padding:7px 12px 7px 9px;border-radius:999px;' +
    'background:rgba(255,255,255,.06);border:1px solid var(--line,rgba(255,255,255,.10));' +
    'font-family:var(--disp);font-weight:900;font-size:10px;letter-spacing:.11em;' +
    'text-transform:uppercase;color:var(--dim,#A093C4);min-height:34px}' +
  '#scr-kx .kx-slotback .ico{font-size:14px}' +
  '#scr-kx .kx-foot3{flex:0 0 auto;margin:12px 2px 0;font-size:10.5px;line-height:1.55;' +
    'color:var(--dim2,#7F73A0)}' +

  /* ── the photograph row ── */
  '#scr-kx .kx-photo{cursor:pointer}' +
  '#scr-kx .kx-photo .kx-pv .ico{font-size:30px;color:var(--dim2,#7F73A0)}' +
  '#scr-kx .kx-prow{display:flex;gap:7px;flex:0 0 auto;margin:1px 0 2px}' +
  '#scr-kx .kx-pbtn{flex:1;min-height:42px;border-radius:11px;font-family:var(--disp);' +
    'font-weight:900;font-size:11px;letter-spacing:.08em;text-transform:uppercase;' +
    'background:var(--gold,#FFC542);color:#241800;border:0}' +
  '#scr-kx .kx-pbtn.gh{flex:0 0 auto;padding:0 14px;background:rgba(255,255,255,.07);' +
    'color:var(--txt,#F4EFFF);border:1px solid rgba(255,255,255,.16)}' +
  /* the input is real and reachable, never display:none — a hidden
     input is a hidden input to a screen reader too. It is clipped. */
  '#scr-kx .kx-file{position:absolute;width:1px;height:1px;padding:0;margin:-1px;' +
    'overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}' +
  '#scr-kx .kx-pnote{flex:0 0 auto;margin:2px 4px 0;font-size:11px;line-height:1.45;' +
    'color:var(--dim,#A093C4);min-height:0}' +
  '#scr-kx .kx-pnote.ok{color:var(--ok,#3DDC84)}' +
  '#scr-kx .kx-pnote.bad{color:var(--bad,#FF5468)}' +
  '#scr-kx .kx-pnote.busy{color:var(--gold,#FFC542)}' +

  '#scr-kx .kx-empty{margin:auto;padding:26px 18px;text-align:center;color:var(--dim,#A093C4);' +
    'font-size:12.5px;line-height:1.65}' +
  '#scr-kx .kx-empty .ico{display:block;margin:0 auto 11px;width:34px;height:34px;font-size:34px;' +
    'color:var(--dim2,#7F73A0)}' +
  '#scr-kx .kx-empty b{display:block;font-family:var(--disp);font-weight:900;font-size:13px;' +
    'letter-spacing:.07em;text-transform:uppercase;color:var(--txt,#F4EFFF);margin-bottom:7px}' +
  '#scr-kx .kx-foot2{flex:0 0 auto;margin:8px 2px 0;font-size:10.5px;line-height:1.55;' +
    'color:var(--dim2,#7F73A0);text-align:center}' +

  /* ─────────────── the face in the profile sheet ───────────────
     The avatar IS the customise button, so it has to look like one at
     a glance: a gold ring, a badge, a caption, and a real press
     state. A hidden hotspot would be worse than the row it replaced. */
  '.kx-pfav{display:block;margin:12px auto 0;padding:4px;border:0;background:none;position:relative;' +
    'border-radius:26px;line-height:0;transition:transform .12s var(--ease,ease)}' +
  '.kx-pfav:active{transform:scale(.95)}' +
  '.reduced .kx-pfav{transition:none}' +
  '.reduced .kx-pfav:active{transform:none}' +
  '.kx-pfav>[data-kx-av]{display:block;box-shadow:0 0 0 2px rgba(255,197,66,.55),0 6px 16px rgba(0,0,0,.45);' +
    'border-radius:21px}' +
  '.kx-pfpen{position:absolute;right:-2px;bottom:-2px;width:26px;height:26px;border-radius:50%;' +
    'display:grid;place-items:center;background:var(--gold,#FFC542);color:#241800;' +
    'box-shadow:0 2px 6px rgba(0,0,0,.5)}' +
  '.kx-pfpen .ico{font-size:15px}' +
  '.kx-pfcap{margin:8px 0 2px;text-align:center;font-size:10.5px;letter-spacing:.1em;' +
    'text-transform:uppercase;font-weight:700;color:var(--dim2,#7F73A0)}' +
  /* the name belongs over the face, not off to one side of it. :has()
     is the only way to reach a heading js/game.js wrote; an engine
     without it simply leaves the name where it already was, which was
     never broken. */
  '#sheet h3:has(+ .kx-pfav){text-align:center}' +

  /* ─────────────── the face picker ─────────────── */
  '#kx-pick{position:fixed;inset:0;z-index:420;display:none;background:rgba(8,5,14,.80)}' +
  '#kx-pick.on{display:flex;align-items:flex-end;justify-content:center}' +
  '#kx-pick .kx-sheet{width:100%;max-width:440px;max-height:88dvh;display:flex;flex-direction:column;' +
    'border-radius:20px 20px 0 0;padding:14px 13px calc(14px + env(safe-area-inset-bottom,0px));' +
    'background:linear-gradient(180deg,#241A3E,#160F2A);' +
    'border-top:1px solid var(--line2,rgba(255,255,255,.18));' +
    'box-shadow:0 -12px 34px rgba(0,0,0,.6)}' +
  '#kx-pick h3{font-family:var(--disp);font-weight:900;font-size:15px;letter-spacing:.06em;' +
    'text-transform:uppercase;text-align:center}' +
  '#kx-pick p.kx-lead{margin:7px 2px 12px;font-size:12px;line-height:1.55;color:var(--dim,#A093C4);' +
    'text-align:center}' +
  '#kx-pick .kx-grid{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;' +
    'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:2px;scrollbar-width:thin}' +
  '#kx-pick .kx-grid::-webkit-scrollbar{width:5px}' +
  '#kx-pick .kx-grid::-webkit-scrollbar-thumb{background:var(--line2,rgba(255,255,255,.18));border-radius:6px}' +
  '#kx-pick .kx-f{display:flex;flex-direction:column;align-items:center;gap:6px;padding:9px 5px 8px;' +
    'border-radius:14px;background:var(--panel,#1B1430);border:1px solid var(--line,rgba(255,255,255,.10))}' +
  '#kx-pick .kx-f[aria-pressed="true"]{border-color:var(--gold,#FFC542);background:rgba(255,197,66,.10)}' +
  '#kx-pick .kx-f.lk{opacity:.5}' +
  '#kx-pick .kx-f b{font-family:var(--disp);font-weight:900;font-size:9.5px;letter-spacing:.05em;' +
    'text-transform:uppercase;color:var(--txt,#F4EFFF);text-align:center;line-height:1.25}' +
  '#kx-pick .kx-f i{font-style:normal;font-size:8.5px;letter-spacing:.1em;font-weight:700;' +
    'text-transform:uppercase;color:var(--dim2,#7F73A0)}' +
  '.kx-pkph{margin:10px 0 0}' +
    '.kx-pkphb{width:100%}' +
    '#kx-pick .kx-blurb{flex:0 0 auto;margin:10px 2px 0;min-height:32px;font-size:11.5px;line-height:1.45;' +
    'color:var(--dim,#A093C4);text-align:center;font-style:italic}' +
  '#kx-pick .kx-acts2{display:flex;gap:8px;margin-top:10px;flex:0 0 auto}' +
  '#kx-pick .kx-acts2 button{flex:1;min-height:46px;border-radius:12px;font-family:var(--disp);' +
    'font-weight:900;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;' +
    'background:var(--gold,#FFC542);color:#241800;border:0}' +
  '#kx-pick .kx-acts2 button.ghost{background:rgba(255,255,255,.07);color:var(--txt,#F4EFFF);' +
    'border:1px solid rgba(255,255,255,.16)}' +
  '#kx-pick .kx-acts2 button[disabled]{opacity:.45}' +
  '';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   3. THE REWARD BANNER
   ═══════════════════════════════════════════════════════════════════ */
var RW = {
  el:null, raf:0, t0:0, run:null, queue:[], closeT:0
};

/* WHY THESE TIMES. Slide 190 ms — under 200 reads as instant, over 250
   reads as slow when you have seen it two hundred times. Fill 700 ms,
   which is long enough for five notes to be a musical phrase rather
   than a rattle and short enough that nobody waits for it. Standings
   at 1.05 s, gone at 1.8 s. A level-up adds 600 ms of light and then
   HOLDS, because a level is worth reading and happens once in eight to
   twenty-five games. Measured against the one rule that matters: at
   1.8 s you are already looking at the game's own result card. */
/* Every one of these is timed against the TRIMMED length of the sound
   under it, not against a number that felt right on paper:
   xp.fill is 1.14s, so the fill is 880ms from a 300ms start and the
   swell's last 260ms rides under the standings rather than trailing
   off over silence. Common path: banner gone at 1.95s, no tap needed.
   A level-up runs the fill 25% longer so the crossing has somewhere to
   sit, then HOLDS — it is rare and it is worth reading. */
var T_IN = 190, T_FILL_FROM = 300, T_FILL_MS = 880, T_STAND = 1230, T_GONE = 1950;
var T_UP_MS = 600, T_UNLOCK_AFTER = 900;

function bar(){ return $('.kx-bar i', RW.el); }

function build(){
  injectCSS();
  var el = document.getElementById('kx-rw');
  if (!el){
    el = document.createElement('div');
    el.id = 'kx-rw';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    (document.body || document.documentElement).appendChild(el);
  }
  RW.el = el;
  return el;
}

/* the standings. A game that knows its table hands one over; anything
   else gets the only standings that are true for a solo game — your
   own record in it, which is the thing js/stats.js has been keeping
   all along. "brong leader boad who win": the board is one tap away
   from here, every single game. */
function standingsHTML(res, opts){
  var t = opts && opts.table;
  if (Array.isArray(t) && t.length){
    var rows = t.slice(0, 4).map(function(r, i){
      return '<div class="kx-tr' + (r.you ? ' me' : '') + '">' +
               '<b>' + (i + 1) + '. ' + esc(r.name || '?') + '</b>' +
               '<span>' + esc(r.score == null ? '' : String(r.score)) + '</span></div>';
    }).join('');
    return { foot:'', table:rows };
  }
  var s = null;
  try { if (window.KARTI_STATS && KARTI_STATS.stats) s = KARTI_STATS.stats(res.game); } catch (e){}
  var line;
  if (s && s.played){
    line = '<b>' + s.won + '</b> won · <b>' + s.lost + '</b> lost' +
           (s.drawn ? ' · <b>' + s.drawn + '</b> drawn' : '') +
           (s.streak > 1 ? ' · on <b>' + s.streak + '</b> in a row' : '');
  } else {
    line = 'First one in the book.';
  }
  return { foot: line + '<button type="button" class="kx-board" data-karti-stats="board">Leaderboard</button>',
           table:'' };
}

function previewInto(host, def){
  if (!def || !def.preview) return false;
  try {
    var v = def.preview(58);
    if (!v) return false;
    if (typeof v === 'string') host.innerHTML = v;
    else host.appendChild(v);
    return true;
  } catch (e){ return false; }
}

function reward(res, opts){
  if (!res || !res.counted) return;
  RW.queue.push({ res:res, opts:opts || {} });
  if (!RW.run) nextInQueue();
}

function nextInQueue(){
  var item = RW.queue.shift();
  if (!item) return;
  try { start(item.res, item.opts); }
  catch (e){ RW.run = null; nextInQueue(); }
}

function start(res, opts){
  var el = build();
  clearTimeout(RW.closeT);
  cancelAnimationFrame(RW.raf);

  var g = gameDef(res.game);
  var word = res.result === 'w' ? 'Rebaħ — you won'
           : res.result === 'd' ? 'Draw — nobody blinked'
           : 'Telfa — you lost';
  var cls = res.result === 'w' ? 'win' : res.result === 'd' ? '' : 'lose';

  /* where the bar starts and ends. A level-up is drawn as two fills:
     run to full, flash, drop to empty, run on. Anything past one level
     in a single game (it happens on a first login) is collapsed into
     the second fill, which is honest — the bar you are looking at is
     the level you are now on. */
  var st = XP.ECON;
  var fromL = res.from, toL = res.level;
  var beforeXp = res.total - res.xp;
  var fromInto = beforeXp - st.cum(fromL), fromNeed = st.need(fromL);
  var toInto = res.total - st.cum(toL), toNeed = st.need(toL);
  var p0 = fromNeed && isFinite(fromNeed) ? Math.max(0, Math.min(1, fromInto / fromNeed)) : 1;
  var p1 = toNeed && isFinite(toNeed) ? Math.max(0, Math.min(1, toInto / toNeed)) : 1;

  var stand = standingsHTML(res, opts);

  el.className = '';
  el.style.setProperty('--kx-ax', g.accent || '#FFC542');
  el.innerHTML =
    '<div class="kx-card" style="--kx-ax:' + esc(g.accent || '#FFC542') + '">' +
      '<div class="kx-top">' +
        '<span class="kx-em">' + ico(g.icon || 'deck') + '</span>' +
        '<span class="kx-ttl"><b>' + esc(g.name) + '</b><i class="' + cls + '">' + esc(word) + '</i></span>' +
        '<span class="kx-gain">+' + res.xp + '<small>XP</small></span>' +
      '</div>' +
      '<div class="kx-barrow">' +
        '<span class="kx-lv" id="kx-lvnow">' + fromL + '</span>' +
        '<span class="kx-bar"><u></u><i></i></span>' +
        '<span class="kx-num" id="kx-num"></span>' +
      '</div>' +
      '<div class="kx-foot">' + stand.foot + '</div>' +
      (stand.table ? '<div class="kx-tbl">' + stand.table + '</div>' : '') +
      '<div class="kx-up"><div class="kx-upin" id="kx-upin"></div></div>' +
    '</div>';

  var fill = $('.kx-bar i', el);
  var ghost = $('.kx-bar u', el);
  var num = $('#kx-num', el);
  var lvNow = $('#kx-lvnow', el);
  fill.style.width = (p0 * 100).toFixed(2) + '%';
  ghost.style.width = (p0 * 100).toFixed(2) + '%';

  var R = {
    res:res, opts:opts, p0:p0, p1:p1, fromL:fromL, toL:toL,
    fromInto:fromInto, fromNeed:fromNeed, toInto:toInto, toNeed:toNeed,
    fill:fill, ghost:ghost, num:num, lvNow:lvNow,
    notes:0, upFired:false, done:false, skipped:false, at:0
  };
  RW.run = R;

  /* the only tap target while it is a banner is the banner itself, and
     it means "I have seen it" — not "cancel". Skip lands on the
     finished state; nothing is ever lost by being impatient. */
  el.addEventListener('pointerdown', onTap);
  document.addEventListener('keydown', onKey);

  /* one frame later, so the transition has a from-state to run from */
  requestAnimationFrame(function(){
    el.classList.add('in');
    requestAnimationFrame(function(){ el.classList.add('go'); });
  });

  if (reduced()){ finishNow(true); return; }

  RW.t0 = (window.performance && performance.now) ? performance.now() : Date.now();
  RW.raf = requestAnimationFrame(tick);
}

function onTap(){ if (RW.run && !RW.run.done) finishNow(false); }
function onKey(e){ if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') onTap(); }

function ease(t){ return 1 - Math.pow(1 - t, 3); }

function tick(now){
  var R = RW.run;
  if (!R) return;
  var t = now - RW.t0;
  R.at = t;

  var span = R.res.levelled ? T_FILL_MS * 1.25 : T_FILL_MS;
  var f = Math.max(0, Math.min(1, (t - T_FILL_FROM) / span));
  /* the swell goes under everything, once, on the frame the bar starts */
  if (t >= T_FILL_FROM && !R.swell){
    R.swell = 1;
    sfx(function(S){ S.play('xp.fill', { force:true, gain: R.res.result === 'w' ? 1 : 0.55 }); });
  }
  paint(R, f);

  if (t >= T_STAND && RW.el) RW.el.classList.add('stand');
  if (t >= T_STAND && !R.stopNote){
    R.stopNote = 1;
    /* the full stop, but only when nothing bigger happened — after a
       level-up xp.level is still ringing and this would be litter */
    if (!R.res.levelled) sfx(function(S){ S.note(0, { gain:0.26 }); });
  }

  if (f >= 1){
    finishNow(true);
    return;
  }
  RW.raf = requestAnimationFrame(tick);
}

/* The bar, the number and the rise, all from one place — so a skip
   silences the notes that have not played instead of leaving them to
   arrive over an empty screen, which is what a setTimeout schedule
   would have done. */
function paint(R, f){
  var e = ease(f);
  var pct, into, need, lvl;
  if (!R.res.levelled){
    pct = R.p0 + (R.p1 - R.p0) * e;
    into = Math.round(R.fromInto + (R.toInto - R.fromInto) * e);
    need = R.fromNeed;
    lvl = R.fromL;
  } else {
    /* First half runs the old level out, second half runs the new one
       in — and the halves are split on RAW time, not on eased
       progress. Splitting on the eased value put the crossing 527ms
       in, because a cubic ease-out is already 50% done at t=0.21: the
       level landed before anybody had finished reading which game they
       had just played. On time it lands at the midpoint, ~850ms, which
       is the beat it wants. Each half still eases out on its own. */
    if (f < 0.5){
      var a = ease(f / 0.5);
      pct = R.p0 + (1 - R.p0) * a;
      into = Math.round(R.fromInto + (R.fromNeed - R.fromInto) * a);
      need = R.fromNeed; lvl = R.fromL;
    } else {
      var b = ease((f - 0.5) / 0.5);
      pct = R.p1 * b;
      into = Math.round(R.toInto * b);
      need = R.toNeed; lvl = R.toL;
      if (!R.upFired){ R.upFired = true; levelUp(R); }
    }
  }
  R.fill.style.width = (pct * 100).toFixed(2) + '%';
  R.ghost.style.width = (pct * 100).toFixed(2) + '%';
  R.lvNow.textContent = lvl;
  R.num.textContent = isFinite(need) ? (into + ' / ' + need) : 'MAX';

  /* six ticks across the fill, rate climbing so the counter RISES
     rather than rattles. R.silent is set by a skip before this is
     called with f=1, so an impatient tap does not machine-gun the
     remaining five into one frame. */
  var want = Math.min(6, Math.floor(f * 6.4));
  if (R.silent) { R.notes = want; return; }
  while (R.notes < want){
    (function(step){
      sfx(function(S){
        S.play('xp.tick', { force:true, rate: 1 + step * 0.042,
                            gain: R.res.result === 'w' ? 1 : 0.7 });
      });
    })(R.notes);
    R.notes++;
  }
}

function levelUp(R){
  var el = RW.el;
  if (!el) return;
  el.classList.add('up', 'hold');

  /* THE ONE MOMENT THIS SCREEN IS ALLOWED TO BE LOUD, and it is ONE
     sound. xp.level is the loudest thing in the registry precisely
     because it is the rarest; putting a ladder or a coin run over it
     would be three sounds standing in for one cue. */
  sfx(function(S){ S.play('xp.level', { force:true }); });

  var pay = [];
  if (R.res.coins) pay.push('<span class="kx-pill">' + ico('coin') + '+' + R.res.coins + ' coins</span>');
  if (R.res.packs) pay.push('<span class="kx-pill">' + ico('pack') + '+' + R.res.packs +
    (R.res.packs === 1 ? ' pack' : ' packs') + '</span>');

  var unl = R.res.unlocked || [];
  var host = $('#kx-upin', el);
  host.innerHTML =
    '<div class="kx-uph"><span class="kx-big">' + R.toL + '</span>' +
      '<span><b>Level ' + R.toL + '</b>' +
      (XP.atMax() ? 'The top of the ladder. There is nothing above this.'
       : unl.length ? (unl.length === 1 ? 'Something new on the shelf.'
                                        : unl.length + ' new things on the shelf.')
       : 'Nothing was locked behind it. It just pays.') + '</span></div>' +
    (pay.length ? '<div class="kx-pay">' + pay.join('') + '</div>' : '') +
    unl.map(function(d){
      return '<div class="kx-unl"><span class="kx-pv" data-pv="' + esc(d.id) + '"></span>' +
             '<span class="kx-pt"><b>' + esc(d.name) + '</b><i>' + esc(d.blurb || '') +
             ' · ' + esc(gameDef(d.game).name) + '</i></span></div>';
    }).join('') +
    '<div class="kx-acts">' +
      (unl.length ? '<button type="button" class="ghost" id="kx-see">Try it on</button>' : '') +
      '<button type="button" id="kx-ok">Carry on</button>' +
    '</div>';

  $$('[data-pv]', host).forEach(function(box){
    var d = XP.def(box.getAttribute('data-pv'));
    if (!previewInto(box, d)){
      box.innerHTML = '<span style="font-family:var(--disp);font-weight:900;font-size:10px;' +
                      'letter-spacing:.1em;color:var(--dim2,#7F73A0)">' + esc(gameDef(d ? d.game : '').mono || '') + '</span>';
    }
  });

  var ok = $('#kx-ok', host);
  if (ok) ok.onclick = function(ev){ ev.stopPropagation(); close(); };
  var see = $('#kx-see', host);
  if (see) see.onclick = function(ev){
    ev.stopPropagation();
    var first = unl[0];
    close();
    XP.open(first ? first.game : '');
  };
  setTimeout(function(){ if (ok) try { ok.focus(); } catch (e){} }, T_UP_MS);
  /* the thing you earned, announced on xp.level's clean tail once its
     preview has finished expanding. Nothing to show, nothing to say. */
  if (unl.length) setTimeout(function(){
    sfx(function(S){ S.play('xp.unlock', { force:true }); });
  }, T_UNLOCK_AFTER);
}

/* Land on the finished state. `natural` says whether we got here by
   running out of animation or by somebody tapping — the difference is
   only whether we then take ourselves away on a timer. */
function finishNow(natural){
  var R = RW.run;
  if (!R || R.done) return;
  cancelAnimationFrame(RW.raf);
  R.done = true;
  if (!natural) R.silent = 1;      /* a tap lands on the state, not on five ticks */
  paint(R, 1);
  if (RW.el) RW.el.classList.add('stand', 'go');
  if (R.res.levelled && !R.upFired){ R.upFired = true; levelUp(R); }
  if (!R.stopNote && natural){ R.stopNote = 1; sfx(function(S){ S.note(0, { gain:0.26 }); }); }
  /* a level-up HOLDS: it has a button and it is worth reading. Anything
     else takes itself away, because it is the two-hundredth time. */
  if (!R.res.levelled){
    var wait = natural ? Math.max(220, T_GONE - R.at) : 420;
    RW.closeT = setTimeout(close, wait);
  }
}

function close(){
  /* a level pays into the SAME purse the card game spends from, so the
     wallet on Home is now out of date by exactly the amount that just
     landed. Repaint it, but only if Home is the screen underneath —
     renderHome() from anywhere else would be a side effect nobody
     asked for. */
  try {
    var h = document.getElementById('scr-home');
    if (h && h.classList.contains('on') && window.KARTI && KARTI.renderHome) KARTI.renderHome();
  } catch (e){}
  clearTimeout(RW.closeT);
  cancelAnimationFrame(RW.raf);
  var el = RW.el;
  RW.run = null;
  if (el){
    el.removeEventListener('pointerdown', onTap);
    el.classList.remove('in', 'go', 'up', 'hold', 'stand');
    setTimeout(function(){
      if (!RW.run && el.parentNode) el.innerHTML = '';
    }, 220);
  }
  document.removeEventListener('keydown', onKey);
  if (RW.queue.length) setTimeout(nextInQueue, 260);
}

/* ═══════════════════════════════════════════════════════════════════
   4. THE CUSTOMISATION SCREEN
   "intory meed to be every game tab nice and organize" — a tab per
   game, and inside it what that game can be customised with, grouped
   by the thing it replaces, saying plainly what is owned, what is on,
   and what the next one costs in levels.

   go() in js/game.js only knows the screens in its own SCREENS array
   and that array is not ours to edit, so — exactly as js/party.js and
   js/stats.js do — this builds its own section, shows it itself, and
   keeps a MutationObserver as the safety net: the moment anything else
   switches a screen on we stand down instead of floating over it.
   ═══════════════════════════════════════════════════════════════════ */
var SC = { el:null, live:false, watching:false, tab:'you', slot:'', from:'home', back:null };

/* EVERY game gets a tab, not only the ones that have put something on
   the shelf — "intory meed to be every game tab". A game with nothing
   yet says so plainly; a missing tab would read as "this game cannot
   be customised", which is a different and untrue statement. The order
   is the record book's, so the two screens read the same way round.
   tombla is added by hand because it is an unregistered id in
   js/stats.js's shelf too and would otherwise be the one game in the
   box with no tab at all. */
function allGames(){
  var out = [], seen = {}, shelf = [], i;
  try { if (window.KARTI_STATS && KARTI_STATS.GAMES) shelf = KARTI_STATS.GAMES; } catch (e){}
  for (i = 0; i < shelf.length; i++){ out.push(shelf[i].id); seen[shelf[i].id] = 1; }
  if (!seen.tombla){ out.push('tombla'); seen.tombla = 1; }
  var kit = XP.games();
  for (i = 0; i < kit.length; i++) if (!seen[kit[i]] && kit[i] !== 'karti'){ out.push(kit[i]); seen[kit[i]] = 1; }
  return out;
}

function screenEl(){
  if (SC.el && SC.el.isConnected) return SC.el;
  SC.el = document.getElementById('scr-kx');
  if (!SC.el){
    SC.el = document.createElement('section');
    SC.el.className = 'screen';
    SC.el.id = 'scr-kx';
    (document.getElementById('app') || document.body).appendChild(SC.el);
  }
  return SC.el;
}

function watchScreen(){
  if (SC.watching || typeof MutationObserver !== 'function') return;
  var app = document.getElementById('app');
  if (!app) return;
  SC.watching = true;
  new MutationObserver(function(recs){
    if (!SC.live) return;
    for (var i = 0; i < recs.length; i++){
      var t = recs[i].target;
      if (t === SC.el || !t.parentNode || t.parentNode !== app) continue;
      if (t.classList && t.classList.contains('screen') && t.classList.contains('on')){ standDown(); return; }
    }
  }).observe(app, { attributes:true, attributeFilter:['class'], subtree:true });
}

function standDown(){ SC.live = false; if (SC.el) SC.el.classList.remove('on'); }

function closeScreen(){
  standDown();
  /* if a caller asked to be returned to its own screen, honour that ONCE and
     clear it, so the next plain open() goes home as before. */
  var back = SC.back; SC.back = null;
  if (back){ try { back(); return; } catch (e){} }
  try { if (window.KARTI && KARTI.go) KARTI.go('home'); } catch (e){}
}

function openScreen(tab, opts){
  injectCSS();
  /* ADDITIVE RETURN HOOK. A caller (the online lobby) may pass {back:fn} so the
     Back button — and the Android hardware back — returns to ITS screen instead
     of home. Absent, closeScreen() goes home exactly as it always did. */
  SC.back = (opts && typeof opts.back === 'function') ? opts.back : null;
  if (opts && opts.from) SC.from = opts.from;
  var el = screenEl();
  var app = document.getElementById('app');
  if (app) for (var i = 0; i < app.children.length; i++){
    var s = app.children[i];
    if (s !== el && s.classList && s.classList.contains('screen')) s.classList.remove('on');
  }
  el.classList.add('on');
  SC.live = true;
  watchScreen();
  var games = allGames();
  if (tab && (tab === 'you' || games.indexOf(tab) >= 0)) SC.tab = tab;
  if (SC.tab !== 'you' && games.indexOf(SC.tab) < 0) SC.tab = 'you';
  renderScreen();
}

/* how many of a game's things are already yours — the number on the tab */
function ownedCount(game){
  var n = 0, i, list;
  if (game === 'you'){
    list = XP.faces();
    for (i = 0; i < list.length; i++) if (XP.ownsFace(list[i].id)) n++;
    var b = XP.borders();
    for (i = 0; i < b.length; i++) if (XP.owns(b[i].id)) n++;
    return { own:n, all:list.length + b.length };
  }
  list = XP.defsFor(game);
  for (i = 0; i < list.length; i++) if (XP.owns(list[i].id)) n++;
  return { own:n, all:list.length };
}

function renderScreen(){
  if (!SC.live || !SC.el) return;
  var el = screenEl();
  var lvl = XP.level(), into = XP.xpInto(), need = XP.xpNeeded();
  var av = XP.avatar(), avDef = XP.face(av);
  var nx = XP.nextUnlock(SC.tab === 'you' ? null : SC.tab);
  var nxFace = null, faces = XP.faces(), i;
  for (i = 0; i < faces.length; i++)
    if (faces[i].lvl > lvl && (!nxFace || faces[i].lvl < nxFace.lvl)) nxFace = faces[i];
  if (SC.tab === 'you') nx = nxFace ? { name:nxFace.name, level:nxFace.lvl } : null;

  var name = '';
  try { if (window.KARTI && KARTI.displayName) name = KARTI.displayName(); } catch (e){}

  var games = allGames();
  var tabs = [{ id:'you', name:'You', icon:'person' }].concat(games.map(function(g){
    var d = gameDef(g);
    return { id:g, name:d.name, icon:d.icon };
  }));

  el.innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="kx-back" aria-label="Back">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Customise</h2>' +
    '</div>' +
    '<div class="kx-head">' +
      '<button type="button" id="kx-face" style="border:0;background:none;padding:0;line-height:0" ' +
        'aria-label="Change your face">' +
        avatarHTML(name, { size:54, face:av }) + '</button>' +
      '<span class="kx-idn"><h3>' + esc(name || 'Player') + '</h3>' +
        '<span class="kx-nx">' + (avDef ? esc(avDef.name) + ' · ' : '') +
        (nx ? 'next: <b>' + esc(nx.name) + '</b> at level ' + nx.level
            : (XP.atMax() ? 'Everything is yours.' : 'Nothing else to unlock here yet.')) +
        '</span></span>' +
      '<span class="kx-lvbig">' + lvl + '<small>LVL</small></span>' +
    '</div>' +
    '<div class="kx-hbar">' +
      '<span class="kx-t"><i style="width:' + (need ? Math.round((into / need) * 100) : 100) + '%"></i></span>' +
      '<span>' + (need ? into + ' / ' + need + ' XP' : 'MAX') + '</span>' +
    '</div>' +
    '<div class="kx-tabs" id="kx-tabs">' +
      tabs.map(function(t){
        var c = ownedCount(t.id);
        return '<button type="button" data-t="' + esc(t.id) + '" aria-pressed="' + (SC.tab === t.id) + '">' +
               ico(t.icon) + esc(t.name) +
               '<span class="kx-bdg">' + c.own + '/' + c.all + '</span></button>';
      }).join('') +
    '</div>' +
    '<div class="kx-list" id="kx-body"></div>' +
    '<p class="kx-foot2">Levels never lock a game. Every game, every mode, ' +
      'every opponent is open from the first minute — this is only what it looks like.</p>';

  /* Back leaves the SLOT before it leaves the SCREEN. One button, two
     depths: closing the whole wardrobe when the player only meant to
     step out of the border list is the single most irritating thing a
     nested screen can do, and it is also what the Android hardware
     back button routes into. */
  $('#kx-back', el).onclick = function(){
    if (SC.tab === 'you' && SC.slot){
      SC.slot = '';
      sfx(function(S){ S.play('ui.back'); });
      paintBody();
      return;
    }
    closeScreen();
  };
  $('#kx-face', el).onclick = function(){ openPicker({}); };
  $$('#kx-tabs button', el).forEach(function(b){
    b.onclick = function(){
      var t = b.getAttribute('data-t');
      if (t === SC.tab) return;
      SC.tab = t;
      SC.slot = '';                /* a new tab always opens at its own top */
      sfx(function(S){ S.play('ui.tap'); });
      renderScreen();
    };
  });
  centreTab(el);
  paintBody();
  repaintAvatars(el);
}

/* the switched-on chip can easily be off the right-hand edge of a strip
   wider than the phone, which reads as "no tab is on" — the one thing a
   tab strip must never do. scrollLeft directly, never scrollIntoView():
   that is free to scroll an ancestor, and the ancestor here is the shell. */
function centreTab(el){
  var strip = $('#kx-tabs', el);
  if (!strip) return;
  var on = $('button[aria-pressed="true"]', strip);
  if (!on) return;
  strip.scrollLeft = Math.max(0, on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2);
}

var SLOT_WORD = {
  board:'The board', pieces:'The pieces', felt:'The table', back:'The card back',
  avatar:'Your face', table:'The table', tokens:'The tokens', deck:'The deck',
  cards:'The cards', dice:'The dice', frame:'The frame', trim:'The table edge',
  stones:'The stones', ticket:'The kartella', marker:'The counter',
  drum:'The caller\'s ball', sea:'The sea', fleet:'The fleet',
  ring:'The aim ring', burst:'The shell burst', sky:'The night sky',
  curtain:'The curtain', card:'The card', backdrop:'The backdrop',
  pattern:'The pattern', theme:'The colours', scene:'The home scene',
  tabstyle:'The tab bar', tabcolour:'The tab bar colour'
};
function slotWord(s){ return SLOT_WORD[s] || (s.charAt(0).toUpperCase() + s.slice(1)); }

/* ═══════════════════════════════════════════════════════════════════
   THE BACKDROP — AN APP-WIDE SLOT, NOT A GAME'S

   The shell palette is nine custom properties on :root. A backdrop is
   a COHERENT re-tint of that palette — bg, both panels, both hairlines,
   and (only where the stock lilac greys would fail on the new panels)
   the dim text pair. Registered through the SAME register() as the
   borders, slot 'backdrop', game 'karti', so it turns up on the YOU
   shelf with no special machinery; equipping persists in the registry
   like everything else, and this module only has to paint.

   Every palette below has been measured, not eyeballed: txt >= 7:1 on
   bg and panel, dim and dim2 >= 4.5:1 on panel, gold >= 3:1 on panel.
   'none' IS the stock shell — equipping it (or nothing) removes every
   override, so the app can never be stranded off its own colours.
   ═══════════════════════════════════════════════════════════════════ */
var BACKDROPS = [
  { id:'none',   name:'Il-Lejl', lvl:0,
    blurb:'The purple dark the app was born in.',
    c:{ bg:'#0E0B14', panel:'#1B1430', panel2:'#241A3E',
        line:'rgba(255,255,255,.10)', line2:'rgba(255,255,255,.18)' } },
  { id:'roza',   name:'Rose tal-Lejl', lvl:0,
    blurb:'Somebody asked for pink. This is pink with the lights off.',
    c:{ bg:'#1A0B14', panel:'#2E1524', panel2:'#3C1B2F',
        line:'rgba(255,255,255,.11)', line2:'rgba(255,255,255,.20)',
        dim:'#C2A2B8', dim2:'#AC8CA2' } },
  { id:'kazin',  name:'Aħdar tal-Każin', lvl:5,
    blurb:'The green of the każin after the last table folds.',
    c:{ bg:'#0A130E', panel:'#14261B', panel2:'#1B3324',
        line:'rgba(255,255,255,.10)', line2:'rgba(255,255,255,.18)',
        dim:'#9FBCA9', dim2:'#84A18F' } },
  /* MALTESE SUMMER, and the second pink on this ladder — which is
     the whole difficulty. 'roza' is a cool mauve (h324, s37) with
     the lights off; 'festa' is a blood red (h348, s45). Sunburn is
     neither: it is hotter and angrier than both, pushed round to
     h355 at s67 and two stops lighter, so the three read as three
     things and not as one colour printed three times. Measured, not
     eyeballed, like every palette above it. */
  { id:'harqa',  name:'Ħruq tax-Xemx', lvl:10, set:'summer',
    blurb:'Sunburn. You said you did not need the cream.',
    c:{ bg:'#2C070D', panel:'#4E1016', panel2:'#5F141C',
        line:'rgba(255,255,255,.12)', line2:'rgba(255,255,255,.20)',
        dim:'#E8ABA6', dim2:'#CE908C' } },
  { id:'bahar',  name:'Baħar bil-Lejl', lvl:12,
    blurb:'The sea at night, flat as a kartella.',
    c:{ bg:'#081019', panel:'#122233', panel2:'#182E44',
        line:'rgba(255,255,255,.10)', line2:'rgba(255,255,255,.18)',
        dim:'#9DB4CC', dim2:'#8099B4' } },
  { id:'franka', name:'Ġebla tal-Franka', lvl:20,
    blurb:'Limestone at dusk, before the streetlights win.',
    c:{ bg:'#171208', panel:'#2A2214', panel2:'#3A2F1D',
        line:'rgba(255,255,255,.10)', line2:'rgba(255,255,255,.18)',
        txt:'#F6EFDF', dim:'#C3B291', dim2:'#AC9B7B' } },
  { id:'festa',  name:'Lejl tal-Festa', lvl:28,
    blurb:'Festa red, after the last murtal has gone up.',
    c:{ bg:'#160709', panel:'#2A1015', panel2:'#38161D',
        line:'rgba(255,255,255,.10)', line2:'rgba(255,255,255,.18)',
        dim:'#C7A2A6', dim2:'#B0898E' } },
  { id:'iswed',  name:'Iswed Karbonju', lvl:37,
    blurb:'Black on black. The phone disappears in the dark.',
    c:{ bg:'#050507', panel:'#121216', panel2:'#1A1A20',
        line:'rgba(255,255,255,.14)', line2:'rgba(255,255,255,.22)',
        dim2:'#8A7EAB' } },
  { id:'deheb',  name:'Nofsillejl Deheb', lvl:45,
    blurb:'Midnight with gold dust worked into the corners.',
    c:{ bg:'#100C04', panel:'#201A0C', panel2:'#2C2412',
        line:'rgba(255,255,255,.10)', line2:'rgba(255,255,255,.18)',
        dim:'#BFAE86', dim2:'#A6956F' } }
];
var BACKDROP_BY = {};
(function(){ for (var i = 0; i < BACKDROPS.length; i++)
  BACKDROP_BY['backdrop.' + BACKDROPS[i].id] = BACKDROPS[i]; })();

function backdropDefs(){
  return XP.defsFor('karti').filter(function(d){ return d.slot === 'backdrop'; });
}

/* the preview is the palette doing its actual job: the bg with two
   panel bars sitting on it and one gold point — never a blank swatch */
function backdropPreviewHTML(t, size){
  var s = size || 58;
  return '<span style="display:block;position:relative;overflow:hidden;' +
    'width:' + s + 'px;height:' + s + 'px;border-radius:12px;' +
    'background:' + t.c.bg + ';border:1px solid ' + (t.c.line2 || 'rgba(255,255,255,.18)') + '">' +
    '<i style="position:absolute;left:14%;top:22%;width:72%;height:20%;' +
      'border-radius:4px;background:' + t.c.panel + '"></i>' +
    '<i style="position:absolute;left:14%;top:52%;width:52%;height:20%;' +
      'border-radius:4px;background:' + t.c.panel2 + '"></i>' +
    '<i style="position:absolute;right:14%;bottom:16%;width:6px;height:6px;' +
      'border-radius:50%;background:var(--gold,#FFC542)"></i>' +
    '</span>';
}

function registerBackdrops(){
  return XP.register(BACKDROPS.map(function(t){
    return {
      id: 'backdrop.' + t.id,
      game: 'karti',
      slot: 'backdrop',
      name: t.name,
      blurb: t.blurb,
      /* a palette may belong to a named collection that runs across
         games; the stock eight belong to none, so this is '' for them */
      set: t.set || '',
      level: t.lvl || 0,
      sort: t.id === 'none' ? -1 : (t.lvl || 0),
      preview: (function(theme){
        return function(size){ return backdropPreviewHTML(theme, size); };
      })(t)
    };
  }));
}

/* SETTING THE SHELL'S COLOURS. Inline properties on the root element
   beat the :root block in index.html by specificity, and removing them
   hands the stock values straight back — so 'none' (and nothing at
   all) is not a ninth palette, it is the absence of the other eight. */
var BACKDROP_VARS = { bg:'--bg', panel:'--panel', panel2:'--panel2',
                      line:'--line', line2:'--line2',
                      txt:'--txt', dim:'--dim', dim2:'--dim2' };
function applyBackdrop(){
  var id = '';
  try { id = XP.equipped('backdrop', 'karti') || ''; } catch (e){}
  var t = (id && id !== 'backdrop.none') ? BACKDROP_BY[id] : null;
  var st = document.documentElement.style;
  for (var k in BACKDROP_VARS){
    if (t && t.c[k]) st.setProperty(BACKDROP_VARS[k], t.c[k]);
    else st.removeProperty(BACKDROP_VARS[k]);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   THE COLOURS, THE HOME SCENE AND THE TAB BAR — THREE MORE APP-WIDE
   SLOTS, ALL THROUGH THE SAME register()

   Phase 1 made the entry gate, Home and the tab bar paint entirely off
   the --kx-* theme tokens, and left ONE documented door for cosmetics:
   window.KARTI_THEME.apply(). These three ladders walk through it.

     theme    — the ACCENT identity: gold+crimson by default, or rose
                gold, festa violet, deep sea… Rewrites the accent pair,
                the hot-action pair, the active tab, the glow and the
                ember. The DARK themes deliberately do NOT touch
                --kx-bg/surface/ink — the floor is the 'backdrop'
                ladder's job above, so the two slots compose instead of
                fighting. The ONE exception is a theme flagged light:1
                (Roża Ħelwa): "the whole app in baby pink" cannot be an
                accent job, so it carries the full field — bg, surface,
                ink, a light tab tint, a `c:{}` shell for the legacy
                panel vars, and the kx-light class that re-aims the
                dark-field scrims (see LIGHT THEME in index.html). When
                an explicit backdrop IS equipped, the backdrop keeps
                the legacy shell (the player's floor choice wins).
     scene    — the picture behind the home screen (--kx-home-bg) AND,
                since the app-wide backdrop, behind every menu screen
                (--kx-app-bg, composed with a readability veil in
                applyKx). The art entries reuse files the app ALREADY
                ships and precaches — zero new bytes — and the rest
                are authored CSS gradients, which weigh nothing.
     tabstyle — the tab bar's MATERIAL (--kx-tab-alpha): how opaquely
                the tint paints — glass, solid, veil.
     tabcolour— the tab bar's COLOUR (--kx-tab-tint), independent of
                the material. A light tint brings its own dark ink
                (--kx-tab-ink) and its own active colour, measured
                against its own field, and floors the material's alpha
                (a light tint at veil-42% over dark art blends to grey
                mush — measured 1.14:1 on the active tab, so light
                tints never drop below 92%).

   The three compose in ONE applyKx() call: each contributes its own
   keys and explicitly nulls the keys it owns when unequipped, so
   KARTI_THEME.apply() removes the override and the stylesheet default
   (the stock KARTI identity, exactly as phase 1 left it) takes over.
   A player with nothing equipped therefore sees a byte-identical app.

   Every palette keeps the phase-1 contrast discipline: accent ≥ 3:1
   on the plum-black floor, accentInk ≥ 4.5:1 ON the accent, and white
   on accent2 ≥ 3:1 at the big display weight the hot buttons use
   (the stock crimson's own ratio band). Pink arrives at LEVEL 1 —
   the low end of every ladder here is deliberately not all "neutral".
   ═══════════════════════════════════════════════════════════════════ */
var THEMES = [
  { id:'karti',      name:'KARTI Klassika', lvl:0,
    blurb:'Deheb u kulur il-festa. The colours the game was born in.',
    sw:['#FFC542','#E63950','#FFDE9B'] },
  /* THE BABY-PINK ONE. It used to be "rose gold" — pink accents on the same
     dark plum, and he could not tell it was on. What was asked for is "KARTI
     imma baby pink": the SAME design language with the whole field turned
     soft pink, cream glass where the dark theme uses near-black, dark rose
     ink where it uses lilac-white. Every pair below is measured, not
     eyeballed: ink on bg 12.6:1, ink on the cream glass 14.7:1, dim on bg
     7.5:1, accentInk on the baby-pink accent 7.7:1, white on the hot rose
     4.6:1, tab ink on the pink bar 11.1:1, active tab 5.0:1. Level 1 on
     purpose — pink is never gated high. */
  { id:'rozadeheb',  name:'Roża Ħelwa', lvl:1, light:1,
    blurb:'Baby pink, wall to wall. KARTI with the lights on and the sugar in.',
    sw:['#F79EC1','#D6336C','#FFD6E4'],
    kx:{ accent:'#F79EC1', accentInk:'#4A0E28',
         accent2:'#D6336C', accent2Deep:'#A61E4D',
         bg:'#FBE3ED', bg2:'#F2BCD4',
         surface:'rgba(255,255,255,.78)',
         ink:'#46102C', dim:'#7A2C52',
         tabTint:'#FFEDF4', tabInk:'#5C1B3C', tabOn:'#C2255C',
         glow:'rgba(246,151,190,.32)', ember:'#FF9FC6',
         homeBg:'radial-gradient(120% 60% at 50% -10%,#FFD1E3 0%,rgba(255,209,227,0) 55%),' +
                'radial-gradient(100% 44% at 50% 112%,#EE7BA8 0%,rgba(238,123,168,0) 60%),' +
                'linear-gradient(180deg,#FFE9F1 0%,#FBD5E4 52%,#F6B9D2 100%)',
         gateBg:'linear-gradient(180deg,#FFE9F1 0%,#F9C8DC 46%,#EE9EC1 100%)' },
    c:{ bg:'#FBE3ED', panel:'#FFF6FA', panel2:'#FFE9F2',
        line:'rgba(122,32,72,.16)', line2:'rgba(122,32,72,.28)', dim2:'#8F5473' } },
  { id:'vjola',      name:'Vjola tal-Festa', lvl:3,
    blurb:'The banners of the OTHER band club. Violet, and proud of it.',
    sw:['#C7A6FF','#8A5CFF','#E2D2FF'],
    kx:{ accent:'#C7A6FF', accentInk:'#1F1233',
         accent2:'#8A5CFF', accent2Deep:'#6A3FD8',
         bg2:'#2C1B53', tabOn:'#C7A6FF',
         glow:'rgba(150,110,255,.20)', ember:'#E2D2FF' } },
  { id:'bahar',      name:'Baħar Fond', lvl:7,
    blurb:'Past the reef, where the blue stops telling you the depth.',
    sw:['#59D2FF','#1E8FDB','#BFEAFF'],
    kx:{ accent:'#59D2FF', accentInk:'#04222E',
         accent2:'#1E8FDB', accent2Deep:'#0F5FA8',
         bg2:'#0F2A47', tabOn:'#59D2FF',
         glow:'rgba(70,180,255,.18)', ember:'#BFEAFF' } },
  { id:'gebla',      name:'Ġebla u Żebbuġ', lvl:12,
    blurb:'Limestone and olive leaves. Malta in daylight, worn at night.',
    sw:['#E8CE96','#6B833F','#F2E3BC'],
    kx:{ accent:'#E8CE96', accentInk:'#241C06',
         accent2:'#6B833F', accent2Deep:'#4C6128',
         bg2:'#33301C', tabOn:'#E8CE96',
         glow:'rgba(214,197,134,.16)', ember:'#F2E3BC' } },
  { id:'nofsillejl', name:'Aħdar ta’ Nofsillejl', lvl:18,
    blurb:'Midnight green. The harbour lights, seen from the water.',
    sw:['#4FE3C1','#0C8A67','#C8F5E6'],
    kx:{ accent:'#4FE3C1', accentInk:'#032921',
         accent2:'#0C8A67', accent2Deep:'#075C45',
         bg2:'#0E2E28', tabOn:'#4FE3C1',
         glow:'rgba(60,220,180,.16)', ember:'#C8F5E6' } },
  { id:'iswed',      name:'Fidda u Faħam', lvl:26,
    blurb:'Silver on charcoal. No colour at all, which is a colour.',
    sw:['#E8E8EC','#6E6E78','#FFFFFF'],
    kx:{ accent:'#E8E8EC', accentInk:'#17171A',
         accent2:'#6E6E78', accent2Deep:'#4A4A52',
         bg2:'#232328', tabOn:'#E8E8EC',
         glow:'rgba(220,220,235,.13)', ember:'#FFFFFF' } },
  { id:'nar',        name:'In-Nar tal-Murtali', earn:1,
    blurb:'Ground-fireworks orange, for the one still standing.',
    sw:['#FFB13D','#E24A16','#FFE2A8'],
    kx:{ accent:'#FFB13D', accentInk:'#2A1600',
         accent2:'#E24A16', accent2Deep:'#A83208',
         bg2:'#451708', tabOn:'#FFB13D',
         glow:'rgba(255,120,40,.26)', ember:'#FFE2A8' } }
];

/* the earned one repeats the border ladder's ten-in-a-row test — read
   live off the record book here because progress.js's helper is not on
   the facade, and this is three lines, not a system */
function kxStreakTen(){
  var best = 0;
  try {
    var all = window.KARTI_STATS && KARTI_STATS.all ? KARTI_STATS.all() : {};
    for (var k in all) if (all[k] && all[k].bestStreak > best) best = all[k].bestStreak;
  } catch (e){}
  return best >= 10;
}

var SCENES = [
  { id:'none',       name:'It-Triq', lvl:0,
    blurb:'The street the app opens on. The stock scene.' },
  { id:'festa',      name:'Taħt il-Murtali', lvl:1,
    blurb:'The loading screen’s festa night, kept on after it loads.',
    bg:'art/ui/loading-bg.png' },
  /* the baby-pink scene, level 1 like the theme — never gated high */
  { id:'rozahelwa',  name:'Sħaba Roża', lvl:1,
    blurb:'Baby pink from edge to edge. Soft as gelat tal-fraġola.',
    bg:'radial-gradient(120% 70% at 50% -12%,#FFD1E3 0%,rgba(255,209,227,0) 60%),' +
       'radial-gradient(90% 40% at 50% 108%,#E8558A 0%,rgba(232,85,138,0) 62%),' +
       'linear-gradient(180deg,#FFE9F1 0%,#FFC9DD 48%,#F49BC0 78%,#E77FAC 100%)' },
  { id:'roza',       name:'Sema Roża', lvl:2,
    blurb:'The ten minutes after sunset when the whole sky goes pink.',
    bg:'radial-gradient(90% 46% at 50% 82%,rgba(255,196,150,.55),transparent 62%),' +
       'linear-gradient(180deg,#2B1030 0%,#5A1E4E 34%,#B4487E 62%,#E77A8C 84%,#F4A97F 100%)' },
  { id:'mediterran', name:'Mediterran', lvl:6,
    blurb:'Open water, no land in the frame. Just the blues.',
    bg:'radial-gradient(120% 60% at 50% -10%,#1B4965 0%,rgba(27,73,101,0) 60%),' +
       'linear-gradient(180deg,#0A1B2E 0%,#123A5C 46%,#0E5E7E 78%,#083348 100%)' },
  { id:'knisja',     name:'Quddiem il-Knisja', lvl:10,
    blurb:'The parish church with the sky on fire behind it.',
    bg:'art/ui/victory.jpg' },
  { id:'pixli',      name:'Malta bil-Pixli', lvl:15,
    blurb:'The whole island, eight bits at a time.',
    bg:'art/ui/kiri-hero.jpg' },
  { id:'kwiekeb',    name:'Sema bil-Kwiekeb', lvl:22,
    blurb:'Dwejra after midnight, when the buses have given up.',
    bg:'radial-gradient(1.6px 1.6px at 11% 16%,#FFF 99%,rgba(255,255,255,0) 100%),' +
       'radial-gradient(1.2px 1.2px at 27% 34%,#DDE7FF 99%,rgba(255,255,255,0) 100%),' +
       'radial-gradient(2px 2px at 41% 9%,#FFF 99%,rgba(255,255,255,0) 100%),' +
       'radial-gradient(1.2px 1.2px at 55% 27%,#FFE9C9 99%,rgba(255,255,255,0) 100%),' +
       'radial-gradient(1.6px 1.6px at 68% 13%,#FFF 99%,rgba(255,255,255,0) 100%),' +
       'radial-gradient(1.2px 1.2px at 82% 31%,#DDE7FF 99%,rgba(255,255,255,0) 100%),' +
       'radial-gradient(2px 2px at 91% 8%,#FFF 99%,rgba(255,255,255,0) 100%),' +
       'radial-gradient(1.2px 1.2px at 18% 47%,#FFF 99%,rgba(255,255,255,0) 100%),' +
       'radial-gradient(1.6px 1.6px at 74% 44%,#FFE9C9 99%,rgba(255,255,255,0) 100%),' +
       'radial-gradient(1.2px 1.2px at 47% 52%,#DDE7FF 99%,rgba(255,255,255,0) 100%),' +
       'radial-gradient(140% 70% at 50% 118%,#1A1030 0%,rgba(26,16,48,0) 55%),' +
       'linear-gradient(180deg,#070B1E 0%,#101A3C 58%,#0B0E24 100%)' },
  { id:'faham',      name:'Faħam', lvl:30,
    blurb:'Lights out. The art steps back and the cards do the talking.',
    bg:'radial-gradient(120% 80% at 50% 0%,#26262E 0%,rgba(38,38,46,0) 55%),' +
       'linear-gradient(180deg,#111116 0%,#050507 70%)' }
];

/* THE MATERIAL ONLY. A tab style used to carry a whole rgba() fill, which
   welded the bar's colour to its material; now it owns nothing but the
   ALPHA (--kx-tab-alpha) and the tint comes from the tabcolour ladder
   below, so any material can be worn in any colour. `a` stays for the
   previews. Stock (tint #100A14 at 88%) computes to the exact
   rgba(16,10,20,.88) the bar has always been. */
var TABSTYLES = [
  { id:'hgiega',  name:'Ħġieġa', lvl:0,
    blurb:'Frosted glass over the festa. The stock bar.', a:.88 },
  { id:'solidu',  name:'Solidu', lvl:4,
    blurb:'A proper opaque bar. Nothing shines through it.',
    al:'100%', a:1 },
  { id:'velu',    name:'Velu', lvl:9,
    blurb:'Barely there — the art runs under your thumb.',
    al:'42%', a:.42 }
];

/* THE COLOUR, separate from the material. A tint that is LIGHT carries its
   own ink (labels/icons), its own active colour measured against its own
   field, and an alpha floor — through the veil material a light tint over
   dark art blends to grey mush (active tab measured 1.14:1), so light tints
   never paint below 92% (active 4.3:1 even over the darkest scene, inactive
   9.4:1). Dark tints keep the theme's own active colour. Baby pink at
   level 1, as always. */
var TABTINTS = [
  { id:'lejl',   name:'Lejl', lvl:0,
    blurb:'The stock near-black. The bar the app was born with.' },
  { id:'roza',   name:'Roża Ħelwa', lvl:1, light:1,
    blurb:'Baby pink under your thumb. Goes with everything, especially itself.',
    tint:'#FFEDF4', ink:'#5C1B3C', on:'#C2255C', floor:92 },
  { id:'deheb',  name:'Deheb Skur', lvl:3,
    blurb:'Warm gold worked into the dark, like the bandstand at night.',
    tint:'#2A1D08' },
  { id:'bahar',  name:'Baħar', lvl:6,
    blurb:'Harbour water. The bar goes deep navy.',
    tint:'#0F2038' },
  { id:'abjad',  name:'Ġebla Bajda', lvl:12, light:1,
    blurb:'Limestone in daylight. A pale bar with dark lettering.',
    tint:'#F7F1E6', ink:'#4A3A1E', on:'#8A6210', floor:92 }
];

var THEME_BY = {}, SCENE_BY = {}, TAB_BY = {}, TINT_BY = {};
(function(){
  var i;
  for (i = 0; i < THEMES.length; i++)    THEME_BY['theme.' + THEMES[i].id] = THEMES[i];
  for (i = 0; i < SCENES.length; i++)    SCENE_BY['scene.' + SCENES[i].id] = SCENES[i];
  for (i = 0; i < TABSTYLES.length; i++) TAB_BY['tabstyle.' + TABSTYLES[i].id] = TABSTYLES[i];
  for (i = 0; i < TABTINTS.length; i++)  TINT_BY['tabcolour.' + TABTINTS[i].id] = TABTINTS[i];
})();

function kartiSlotDefs(slot){
  return XP.defsFor('karti').filter(function(d){ return d.slot === slot; });
}

/* ── the previews — each one is the thing doing its actual job ─────
   A theme is a swatch MEDALLION: the accent and the hot colour split
   like the wordmark, an ember point, on the theme's own dark breath —
   the real colours, never a name to imagine. A scene is the actual
   background painted small under the home scrim. A tab style is a
   miniature tab bar sitting over festa-coloured light. */
function themePreviewHTML(t, size){
  var s = size || 58;
  /* the medallion breathes on the theme's OWN floor — the light theme shows
     its pink field, not a dark tail it will never paint */
  return '<span style="display:block;position:relative;width:' + s + 'px;height:' + s + 'px;' +
    'border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.16);' +
    'background:linear-gradient(180deg,' + ((t.kx && t.kx.bg2) || '#2A1B47') + ',' +
      ((t.kx && t.kx.bg) || '#120D0B') + ' 78%)">' +
    '<i style="position:absolute;left:18%;top:16%;width:64%;height:64%;border-radius:50%;' +
      'background:linear-gradient(118deg,' + t.sw[0] + ' 0 49%,' + t.sw[1] + ' 51% 100%);' +
      'box-shadow:0 0 12px ' + t.sw[1] + '66,inset 0 1px 0 rgba(255,255,255,.35)"></i>' +
    '<i style="position:absolute;right:14%;bottom:12%;width:6px;height:6px;border-radius:50%;' +
      'background:' + t.sw[2] + ';box-shadow:0 0 6px ' + t.sw[2] + '"></i>' +
    '</span>';
}
function scenePreviewHTML(sc, size){
  var s = size || 58;
  var bg = sc.bg
    ? (sc.bg.indexOf('gradient') >= 0 ? sc.bg : 'url("' + sc.bg + '") center top/cover no-repeat')
    : 'url("art/ui/home-bg.jpg") center top/cover no-repeat';
  return '<span style="display:block;position:relative;overflow:hidden;' +
    'width:' + s + 'px;height:' + s + 'px;border-radius:12px;' +
    'border:1px solid rgba(255,255,255,.16);background:' + bg.replace(/"/g, '&quot;') + ';' +
    'background-size:cover">' +
    '<i style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,5,16,.16),rgba(8,5,16,.42))"></i>' +
    '<i style="position:absolute;left:14%;right:14%;bottom:12%;height:5px;border-radius:3px;' +
      'background:rgba(16,10,20,.85);border-top:1px solid var(--kx-accent,#FFC542)"></i>' +
    '</span>';
}
/* the mini bar the two tab ladders share: a bar over festa-coloured light.
   The MATERIAL preview paints the worn tint at the material's own alpha; the
   COLOUR preview paints the candidate tint at the worn material's feel. */
function miniTabHTML(fill, on, dim){
  return '<i style="position:absolute;left:8%;right:8%;bottom:12%;height:34%;border-radius:6px;' +
    'background:' + fill + ';' +
    'border-top:1px solid color-mix(in srgb,' + on + ' 40%,transparent);' +
    'display:flex;align-items:center;justify-content:space-evenly">' +
    '<u style="width:5px;height:5px;border-radius:50%;background:' + on + '"></u>' +
    '<u style="width:5px;height:5px;border-radius:50%;background:' + dim + '"></u>' +
    '<u style="width:5px;height:5px;border-radius:50%;background:' + dim + '"></u>' +
  '</i>';
}
function tabPreviewShell(s, inner){
  return '<span style="display:block;position:relative;overflow:hidden;' +
    'width:' + s + 'px;height:' + s + 'px;border-radius:12px;' +
    'border:1px solid rgba(255,255,255,.16);' +
    'background:radial-gradient(90% 70% at 50% 20%,var(--kx-glow,rgba(255,170,60,.35)),transparent 70%),' +
      'linear-gradient(180deg,#2A1B47,#120D0B)">' + inner + '</span>';
}
function tabstylePreviewHTML(tb, size){
  var s = size || 58;
  var fill = 'color-mix(in srgb,var(--kx-tab-tint,#100A14) ' +
    (tb.al || '88%') + ',transparent)';
  return tabPreviewShell(s,
    miniTabHTML(fill, 'var(--kx-tab-on,#FFC542)',
      'var(--kx-tab-ink,rgba(255,255,255,.4))'));
}
function tabtintPreviewHTML(c, size){
  var s = size || 58;
  var tint = c.tint || '#100A14';
  var on = c.on || 'var(--kx-tab-on,#FFC542)';
  var dim = c.ink ? ('color-mix(in srgb,' + c.ink + ' 72%,transparent)')
                  : 'rgba(255,255,255,.4)';
  return tabPreviewShell(s,
    miniTabHTML('color-mix(in srgb,' + tint + ' 92%,transparent)', on, dim));
}

function registerKxSlots(){
  var defs = [];
  THEMES.forEach(function(t){
    defs.push({
      id: 'theme.' + t.id, game: 'karti', slot: 'theme',
      name: t.name, blurb: t.blurb,
      level: t.lvl || 0,
      sort: t.id === 'karti' ? -1 : (t.earn ? 90 : (t.lvl || 0)),
      earn: t.earn ? { how:'Win ten in a row in any one game', test:kxStreakTen } : null,
      preview: (function(th){ return function(size){ return themePreviewHTML(th, size); }; })(t)
    });
  });
  SCENES.forEach(function(sc){
    defs.push({
      id: 'scene.' + sc.id, game: 'karti', slot: 'scene',
      name: sc.name, blurb: sc.blurb,
      level: sc.lvl || 0,
      sort: sc.id === 'none' ? -1 : (sc.lvl || 0),
      preview: (function(s){ return function(size){ return scenePreviewHTML(s, size); }; })(sc)
    });
  });
  TABSTYLES.forEach(function(tb){
    defs.push({
      id: 'tabstyle.' + tb.id, game: 'karti', slot: 'tabstyle',
      name: tb.name, blurb: tb.blurb,
      level: tb.lvl || 0,
      sort: tb.id === 'hgiega' ? -1 : (tb.lvl || 0),
      preview: (function(s){ return function(size){ return tabstylePreviewHTML(s, size); }; })(tb)
    });
  });
  TABTINTS.forEach(function(c){
    defs.push({
      id: 'tabcolour.' + c.id, game: 'karti', slot: 'tabcolour',
      name: c.name, blurb: c.blurb,
      level: c.lvl || 0,
      sort: c.id === 'lejl' ? -1 : (c.lvl || 0),
      preview: (function(s){ return function(size){ return tabtintPreviewHTML(s, size); }; })(c)
    });
  });
  return XP.register(defs);
}

/* ONE composed call through the phase-1 door. Every key one of these
   slots can own is ALWAYS present — as a value when something is worn,
   as null when not — so KARTI_THEME.apply() clears the stale override
   itself and unequip is free. The full-field keys (bg/surface/ink/dim/
   gateBg) exist for the light theme; the dark themes never carry them,
   so for those nothing changes. Composition order: theme first, then
   the scene (image wins over the theme's own homeBg), then the tab
   material, then the tab colour (its ink/active pair is measured
   against its own tint, so it outranks the theme's tabOn). */
function applyKx(){
  var T = window.KARTI_THEME;
  if (!T || !T.apply) return;
  var o = { accent:null, accentInk:null, accent2:null, accent2Deep:null,
            bg:null, bg2:null, surface:null, ink:null, dim:null,
            tabOn:null, tabTint:null, tabAlpha:null, tabInk:null,
            glow:null, ember:null,
            homeBg:null, gateBg:null, appBg:null, tabBg:null };
  var t = null, s = null, b = null, c = null, bd = '';
  try {
    t = THEME_BY[XP.equipped('theme', 'karti') || ''];
    s = SCENE_BY[XP.equipped('scene', 'karti') || ''];
    b = TAB_BY[XP.equipped('tabstyle', 'karti') || ''];
    c = TINT_BY[XP.equipped('tabcolour', 'karti') || ''];
    bd = XP.equipped('backdrop', 'karti') || '';
  } catch (e){}
  var light = !!(t && t.light);
  if (t && t.kx) for (var k in t.kx) if (k in o) o[k] = t.kx[k];
  if (s && s.bg) o.homeBg = s.bg;
  /* the scene reaches EVERY menu screen: the same art, behind its own
     veil so the text on those screens keeps its contrast — a pale rose
     veil under a light theme (dark ink), a dark one otherwise */
  if (s && s.bg){
    var veil = light
      ? 'linear-gradient(180deg,rgba(255,240,246,.55),rgba(255,240,246,.34) 30%,rgba(255,236,244,.62))'
      : 'linear-gradient(180deg,rgba(9,6,14,.72),rgba(9,6,14,.5) 30%,rgba(9,6,14,.66))';
    /* ABSOLUTE url on purpose: the rule that consumes --kx-app-bg lives in
       css/extra.css, and a relative url() inside a custom property resolves
       against the SHEET it is substituted in — art/ui/x.jpg quietly became
       css/art/ui/x.jpg (a 404) until this was made absolute. new URL keeps
       it right under any base path (github.io/<repo>/ included). */
    var art = s.bg;
    if (art.indexOf('gradient') < 0){
      try { art = 'url("' + new URL(art, location.href).href + '")'; }
      catch (e){ art = 'url("' + art + '")'; }
    }
    o.appBg = veil + ',' + art;
  }
  /* material = alpha; colour = tint + its own measured ink/active pair.
     A LIGHT tint floors the alpha: through the 42% veil over dark art it
     blends to grey mush (active tab measured 1.14:1). */
  var matAl = b && b.al ? parseFloat(b.al) : 88;
  if (b && b.al) o.tabAlpha = b.al;
  if (c && c.tint){
    o.tabTint = c.tint;
    if (c.ink) o.tabInk = c.ink;
    if (c.on)  o.tabOn  = c.on;
    if (c.floor && matAl < c.floor) o.tabAlpha = c.floor + '%';
  }
  /* the light-theme switch: the scrims and hard-dark assumptions in
     index.html/extra.css hang off this one class */
  try { document.documentElement.classList.toggle('kx-light', light); } catch (e){}
  /* the legacy shell (--panel and friends) for a theme that carries one —
     but an explicitly equipped backdrop is the player's own floor choice,
     so it keeps those vars (applyBackdrop already ran and set them). */
  var SHELL = { bg:'--bg', panel:'--panel', panel2:'--panel2',
                line:'--line', line2:'--line2', dim2:'--dim2' };
  var bdOn = !!(bd && bd !== 'backdrop.none');
  var st = document.documentElement.style;
  for (var k2 in SHELL){
    if (!bdOn && t && t.c && t.c[k2]) st.setProperty(SHELL[k2], t.c[k2]);
    else if (!bdOn) st.removeProperty(SHELL[k2]);
  }
  T.apply(o);
}

/* ═══════════════════════════════════════════════════════════════════
   YOU — A SHELF OF SLOTS, NOT ONE LONG LIST

   It used to be a single scroll: the photo tile, then every drawn face,
   then every border, one after the other. That works while there are
   two kinds of thing and stops working the moment there is a third —
   the border ladder is already twelve items deep, so choosing a face
   meant scrolling past somebody else's category to reach it, and
   anything added later would land at the bottom where nobody goes.

   So YOU is now a shelf: one row per slot, each showing what you are
   wearing and how much of that slot you own, and opening into its own
   list. Adding a slot later is one entry in SLOTS and nothing else —
   which is the whole reason for doing it now, while there are two.
   ═══════════════════════════════════════════════════════════════════ */
var SLOTS = [
  { id:'face',   name:'Your face',
    hint:'The drawn faces, or a photograph of your own.' },
  { id:'border', name:'Your border',
    hint:'The ring around it. This is the one everyone else sees.' },
  { id:'badge',  name:'Your level box',
    hint:'The number in the bottom of the ring. Yours, not the room\'s.' },
  /* THE ONE DECK — a single back and a single felt for EVERY card
     game, because they all use the same playing cards. Registered by
     js/deck-kit.js under game 'karti', exactly like the theme/scene
     slots below, so these two rows read generically. */
  { id:'back',   name:'The playing cards',
    hint:'One card back for every card game — klabb, poker, rummy, gin, skarta, the lot.' },
  { id:'felt',   name:'The card table',
    hint:'One cloth on every card table in the box. IL-KIRI\'s felt follows it too.' },
  { id:'theme',  name:'Your colours',
    hint:'The app\'s accent — gold, rose, violet, sea. Every button follows.' },
  { id:'scene',  name:'The home scene',
    hint:'The picture behind the home screen. The festa night lives here.' },
  { id:'backdrop', name:'The backdrop',
    hint:'The colour behind everything. Games keep their own tables.' },
  { id:'tabstyle', name:'The tab bar',
    hint:'The material: glass over the art, solid, or barely there.' },
  { id:'tabcolour', name:'The tab bar colour',
    hint:'The colour of the bar itself — pick it apart from the material.' }
];

/* WHAT IS WORN IN A SLOT, including when nothing has ever been chosen.
   A fresh player has equipped nothing, so borderDef()/badgeDef() are ''
   and no tile in either list shows as On — the wardrobe reads as though
   the player is wearing something that is not in it. Every ladder has a
   zero item that IS the default, so an empty slot resolves to that one. */
var SLOT_DEFAULT = { border:'border.none', badge:'badge.gold', backdrop:'backdrop.none',
                     theme:'theme.karti', scene:'scene.none', tabstyle:'tabstyle.hgiega',
                     tabcolour:'tabcolour.lejl',
                     back:'back.klassiku', felt:'felt.klassiku' };
/* the three kx ladders read generically — any slot that is not one of
   the two avatar specials is simply "what is equipped on karti" */
function wornId(slot){
  var id = '';
  try {
    id = (slot === 'badge')  ? XP.badgeDef()
       : (slot === 'border') ? XP.borderDef()
       :                       XP.equipped(slot, 'karti');
  } catch (e){}
  return id || SLOT_DEFAULT[slot] || '';
}

function myName(){
  try { if (window.KARTI && KARTI.displayName) return KARTI.displayName() || ''; } catch (e){}
  return '';
}

function slotCount(id){
  var n = 0, i, list;
  if (id === 'face'){
    list = XP.faces();
    for (i = 0; i < list.length; i++) if (XP.ownsFace(list[i].id)) n++;
    /* a photograph is a face you own, so it counts as one when it exists */
    return { own:n + (XP.hasPhoto() ? 1 : 0), all:list.length + 1 };
  }
  list = (id === 'badge') ? XP.badges()
       : (id === 'backdrop') ? backdropDefs()
       : (id === 'border') ? XP.borders()
       : kartiSlotDefs(id);              /* theme / scene / tabstyle */
  for (i = 0; i < list.length; i++) if (XP.owns(list[i].id)) n++;
  return { own:n, all:list.length };
}

/* what is on right now, in words, under the slot's name */
function slotWorn(id){
  var d;
  if (id === 'face'){
    if (XP.usingPhoto() && XP.hasPhoto()) return 'Your photograph';
    d = XP.face(XP.avatar());
    return d ? d.name : 'A face';
  }
  if (id === 'badge'){
    d = XP.def(wornId('badge'));
    return d ? d.name : 'Klassika';
  }
  if (id === 'backdrop'){
    d = XP.def(wornId('backdrop'));
    return d ? d.name : 'Il-Lejl';
  }
  if (id === 'theme' || id === 'scene' || id === 'tabstyle' || id === 'tabcolour' ||
      id === 'back' || id === 'felt'){
    d = XP.def(wornId(id));
    return d ? d.name : { theme:'KARTI Klassika', scene:'It-Triq',
                          tabstyle:'Ħġieġa', tabcolour:'Lejl',
                          back:'Il-Klassiku', felt:'Tal-Logħba' }[id];
  }
  d = XP.def(wornId('border'));
  return d ? d.name : 'No border';
}

function paintYou(host){
  /* the shelf */
  if (!SC.slot){
    host.innerHTML =
      '<div class="kx-shelf">' +
      SLOTS.map(function(s){
        var c = slotCount(s.id);
        return '<button type="button" class="kx-slotrow" data-slot="' + esc(s.id) + '">' +
          '<span class="kx-pv">' +
            /* each row previews the thing it is about: the face row
               drops the ring, the other avatar rows keep it — and every
               one carries the level, because the box row IS the level.
               The backdrop is not worn on a face at all, so its row
               shows the worn palette itself doing its job. */
            (s.id === 'back' || s.id === 'felt'
              /* the deck rows preview the worn item itself: the shelf
                 registered a preview(), so hand the id to drawPreviews
                 exactly the way the item lists do */
              ? '<span data-pv="' + esc(wornId(s.id)) + '"></span>'
              : s.id === 'backdrop'
              ? backdropPreviewHTML(BACKDROP_BY[wornId('backdrop')] || BACKDROPS[0], 56)
              : s.id === 'theme'
              ? themePreviewHTML(THEME_BY[wornId('theme')] || THEMES[0], 56)
              : s.id === 'scene'
              ? scenePreviewHTML(SCENE_BY[wornId('scene')] || SCENES[0], 56)
              : s.id === 'tabstyle'
              ? tabstylePreviewHTML(TAB_BY[wornId('tabstyle')] || TABSTYLES[0], 56)
              : s.id === 'tabcolour'
              ? tabtintPreviewHTML(TINT_BY[wornId('tabcolour')] || TABTINTS[0], 56)
              : avatarHTML(myName(), {
                  size:56,
                  lv: (s.id === 'face') ? 0 : Math.max(1, XP.level()),
                  noBorder: s.id === 'face' })) +
          '</span>' +
          '<span class="kx-nm"><b>' + esc(s.name) + '</b>' +
            '<i>' + esc(slotWorn(s.id)) + '</i>' +
            '<u>' + esc(s.hint) + '</u></span>' +
          '<span class="kx-slotn">' + c.own + '<small>/' + c.all + '</small>' +
            ico('arrow-right') + '</span></button>';
      }).join('') +
      '</div>' +
      '<p class="kx-foot3">Everything here is paint. Nothing on this screen ' +
        'changes a single rule in a single game.</p>';

    $$('.kx-slotrow', host).forEach(function(b){
      b.onclick = function(){
        SC.slot = b.getAttribute('data-slot');
        sfx(function(S){ S.play('ui.tap'); });
        paintBody();
        repaintAvatars(SC.el);
      };
    });
    drawPreviews(host, 'karti');     /* fills the deck rows' data-pv */
    repaintAvatars(host);
    return;
  }

  /* inside a slot */
  var back = '<button type="button" class="kx-slotback" id="kx-slotback">' +
    ico('back') + 'All of you</button>';

  if (SC.slot === 'face'){
    host.innerHTML = back + photoHTML() +
      '<p class="kx-slot">The drawn faces</p>' +
      XP.faces().map(function(f){
        var got = XP.ownsFace(f.id), on = !XP.usingPhoto() && XP.avatar() === f.id;
        return '<button type="button" class="kx-it' + (on ? ' on' : got ? '' : ' off') +
               '" data-face="' + esc(f.id) + '"' + (got ? '' : ' aria-disabled="true"') + '>' +
               '<span class="kx-pv">' + FACES.frame(f.id, { size:62, accent:f.ax }) + '</span>' +
               '<span class="kx-nm"><b>' + esc(f.name) + '</b><i>' + esc(f.blurb) + '</i></span>' +
               '<span class="kx-st ' + (on ? 'on' : got ? '' : 'lock') + '">' +
                 (on ? 'Worn' : got ? 'Wear' : ico('lock') + 'Lv ' + f.lvl) + '</span></button>';
      }).join('');
    wirePhoto(host);
    $$('.kx-it[data-face]', host).forEach(function(b){
      b.onclick = function(){
        var r = XP.setAvatar(b.getAttribute('data-face'));
        if (!r.ok){
          if (window.KARTI && KARTI.toast) KARTI.toast('That face arrives at level ' + r.level + '.');
          sfx(function(S){ S.play('ui.error'); });
          return;
        }
        XP.usePhoto(false);          /* choosing a drawn face means wearing it */
        renderScreen();
      };
    });
  } else if (SC.slot === 'badge'){
    host.innerHTML = back +
      '<p class="kx-slot">The level box</p>' +
      XP.badges().map(function(d){
        return itemHTML(d, wornId('badge') === d.id); }).join('');
    wireItems(host);
    drawPreviews(host, 'karti');
  } else if (SC.slot === 'backdrop'){
    host.innerHTML = back +
      '<p class="kx-slot">The backdrop</p>' +
      backdropDefs().map(function(d){
        return itemHTML(d, wornId('backdrop') === d.id); }).join('');
    wireItems(host);
    drawPreviews(host, 'karti');
  } else if (SC.slot === 'theme' || SC.slot === 'scene' ||
             SC.slot === 'tabstyle' || SC.slot === 'tabcolour' ||
             SC.slot === 'back' || SC.slot === 'felt'){
    host.innerHTML = back +
      '<p class="kx-slot">' + esc(slotWord(SC.slot)) + '</p>' +
      kartiSlotDefs(SC.slot).map(function(d){
        return itemHTML(d, wornId(SC.slot) === d.id); }).join('');
    wireItems(host);
    drawPreviews(host, 'karti');
  } else {
    host.innerHTML = back +
      '<p class="kx-slot">The border</p>' +
      XP.borders().map(function(d){
        /* XP.border() is the BARE id ('gold') and d.id is namespaced
           ('border.gold'), so the old test here compared two things that
           can never be equal and NOTHING in the border list has ever shown
           as worn. borderDef() is the namespaced one. */
        return itemHTML(d, wornId('border') === d.id); }).join('');
    wireItems(host);
    drawPreviews(host, 'karti');
  }

  var bk = $('#kx-slotback', host);
  if (bk) bk.onclick = function(){
    SC.slot = '';
    sfx(function(S){ S.play('ui.back'); });
    paintBody();
  };
  repaintAvatars(host);
}

function paintBody(){
  var host = $('#kx-body', SC.el);
  if (!host) return;

  if (SC.tab === 'you'){ paintYou(host); return; }

  var list = XP.defsFor(SC.tab);
  if (!list.length){
    var d = gameDef(SC.tab);
    host.innerHTML = '<div class="kx-empty">' + ico('star') +
      '<b>Nothing to dress up yet</b>' + esc(d.name) +
      ' has not put anything on the shelf. It plays exactly the same either way — ' +
      'this screen is paint, never rules.</div>';
    return;
  }

  var bySlot = {}, order = [], i;
  for (i = 0; i < list.length; i++){
    if (!bySlot[list[i].slot]){ bySlot[list[i].slot] = []; order.push(list[i].slot); }
    bySlot[list[i].slot].push(list[i]);
  }

  host.innerHTML = order.map(function(slot){
    var eq = XP.equipped(slot, SC.tab);
    return '<p class="kx-slot">' + esc(slotWord(slot)) + '</p>' +
      bySlot[slot].map(function(d){ return itemHTML(d, eq === d.id); }).join('');
  }).join('');

  drawPreviews(host, SC.tab);
  wireItems(host);
}

/* One row, for a chess board and for a border alike — a border is a
   cosmetic registered through the same register() as everything else,
   so it gets the same row with no special case. An EARNED one says
   what to go and do instead of a level it will never reach. */
function itemHTML(d, on){
  var got = XP.owns(d.id);
  var state = on ? '<span class="kx-st on">On</span>'
            : got ? '<span class="kx-st">Use</span>'
            : d.earn ? '<span class="kx-st earn">' + ico('trophy') + 'Earn</span>'
                     : '<span class="kx-st lock">' + ico('lock') + 'Lv ' + d.level + '</span>';
  var sub = got || !d.earn ? esc(d.blurb || '')
          : esc(d.blurb || '') + ' <b class="kx-how">' + esc(d.earn.how) + '</b>';
  return '<button type="button" class="kx-it' + (on ? ' on' : got ? '' : ' off') +
         '" data-c="' + esc(d.id) + '">' +
         '<span class="kx-pv" data-pv="' + esc(d.id) + '"></span>' +
         '<span class="kx-nm"><b>' + esc(d.name) + '</b><i>' + sub + '</i></span>' +
         state + '</button>';
}

/* preview() is the whole point of the registry: this file draws a pink
   chess board, and a milled gold ring, without knowing what either
   is. A preview that throws, or that a game forgot to give, degrades
   to the game's two letters — never to a hole in the list. */
function drawPreviews(host, tab){
  $$('[data-pv]', host).forEach(function(box){
    var d = XP.def(box.getAttribute('data-pv'));
    if (!previewInto(box, d))
      box.innerHTML = '<span style="font-family:var(--disp);font-weight:900;font-size:11px;' +
        'letter-spacing:.1em;color:var(--dim2,#7F73A0)">' + esc(gameDef(tab).mono || '') + '</span>';
  });
  wirePics(host);
}

function wireItems(host){
  $$('.kx-it[data-c]', host).forEach(function(b){
    b.onclick = function(){
      var id = b.getAttribute('data-c'), d = XP.def(id);
      if (!d) return;
      if (!XP.owns(id)){
        if (window.KARTI && KARTI.toast)
          KARTI.toast(d.earn ? d.name + ' is earned, not levelled — ' + d.earn.how.toLowerCase() + '.'
                             : d.name + ' arrives at level ' + d.level + '.');
        sfx(function(S){ S.play('ui.error'); });
        return;
      }
      if (XP.equipped(d.slot, d.game) === id) XP.unequip(d.slot, d.game);
      else XP.equip(d.slot, id);
      /* the border is worn by the head of this very screen, so a
         border change has to repaint more than the list */
      if (d.slot === 'border') renderScreen(); else paintBody();
    };
  });
}

/* ═══════════════════════════════════════════════════════════════════
   4b. THE PHOTOGRAPH
   One picture per account, kept on the Pi. A guest is TOLD why they
   cannot have one rather than being shown a dead button — "make an
   account and your face follows you to the leaderboard" is a better
   argument for signing up than anything on the sign-up screen.
   ═══════════════════════════════════════════════════════════════════ */
function photoHTML(){
  var can = XP.canPhoto(), has = XP.hasPhoto(), on = XP.usingPhoto();
  var name = '';
  try { if (window.KARTI && KARTI.displayName) name = KARTI.displayName(); } catch (e){}
  return '<p class="kx-slot">Your own photo</p>' +
    '<div class="kx-it kx-photo' + (on ? ' on' : can ? '' : ' off') + '">' +
      '<span class="kx-pv">' +
        (has ? avatarHTML(name, { size:62, me:true }) : ico('person')) + '</span>' +
      '<span class="kx-nm"><b>' + (has ? 'Your photo' : 'Use a photo') + '</b><i>' +
        (!can
          ? 'A photo needs an account — it is kept for you on Terence’s Pi so it ' +
            'follows you to another phone and shows up on the leaderboard.'
          : has
            ? 'Shrunk to a square and kept on the Pi, so everybody else sees it too.'
            : 'One picture, cropped square and made small. Everyone else sees it ' +
              'on the board and in the lobby.') +
      '</i></span>' +
      '<span class="kx-st' + (on ? ' on' : '') + '">' + (on ? 'Worn' : has ? 'Wear' : '') + '</span>' +
    '</div>' +
    (can
      ? '<div class="kx-prow">' +
          '<button type="button" class="kx-pbtn" id="kx-pick-file">' +
            (has ? 'Change photo' : 'Choose a photo') + '</button>' +
          (has ? '<button type="button" class="kx-pbtn gh" id="kx-drop-file">Remove</button>' : '') +
        '</div>' +
        '<input type="file" accept="image/*" id="kx-file" class="kx-file" ' +
          'aria-label="Choose a photo">' +
        '<p class="kx-pnote" id="kx-pnote"></p>'
      : '<div class="kx-prow"><button type="button" class="kx-pbtn" id="kx-mkacct">' +
          'Make an account</button></div>');
}

function wirePhoto(host){
  var f = $('#kx-file', host), note = $('#kx-pnote', host);
  var pick = $('#kx-pick-file', host), drop = $('#kx-drop-file', host);
  var mk = $('#kx-mkacct', host);
  var row = $('.kx-photo', host);

  if (row && XP.hasPhoto()) row.onclick = function(){
    XP.usePhoto(!XP.usingPhoto()); renderScreen();
  };
  if (mk) mk.onclick = function(){
    closeScreen();
    try {
      if (window.KARTI && KARTI.upgradeSheet) KARTI.upgradeSheet();
      else if (window.KARTI_SYNC && KARTI_SYNC.openPanel) KARTI_SYNC.openPanel('signup', {});
    } catch (e){}
  };
  if (pick && f) pick.onclick = function(){ f.click(); };
  if (drop) drop.onclick = function(){ XP.removePhoto(); renderScreen(); };
  if (!f) return;
  f.onchange = function(){
    var file = f.files && f.files[0];
    f.value = '';
    if (!file) return;
    if (note){ note.className = 'kx-pnote busy'; note.textContent = 'Shrinking it…'; }
    XP.uploadPhoto(file).then(function(r){
      if (!note) { renderScreen(); return; }
      if (r.ok){
        note.className = 'kx-pnote ok';
        note.textContent = 'Done — ' + Math.round(r.bytes / 102.4) / 10 + ' KB on the Pi.';
        sfx(function(S){ S.play('ui.reward', { gain:0.6 }); });
        setTimeout(renderScreen, 700);
      } else {
        note.className = 'kx-pnote bad';
        note.textContent = r.why;
        sfx(function(S){ S.play('ui.error'); });
      }
    });
  };
}

/* ═══════════════════════════════════════════════════════════════════
   5. THE FACE PICKER
   Offered once, right after an account is made — the wording there was
   already good and is untouched, this is a step AFTER it rather than a
   rewrite of it — and reachable forever after from the profile and
   from the head of the customisation screen.
   ═══════════════════════════════════════════════════════════════════ */
var PK = { el:null, sel:'', first:false };

function openPicker(o){
  o = o || {};
  injectCSS();
  if (FACES) FACES.ready();
  var el = document.getElementById('kx-pick');
  if (!el){
    el = document.createElement('div');
    el.id = 'kx-pick';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Pick your face');
    (document.body || document.documentElement).appendChild(el);
  }
  PK.el = el;
  PK.first = !!o.first;
  PK.sel = (XP.usingPhoto() && XP.hasPhoto()) ? '__photo__' : XP.avatar();
  paintPicker();
  el.classList.add('on');
  sfx(function(S){ S.play('ui.sheet'); });
}

function closePicker(){
  if (PK.el) PK.el.classList.remove('on');
}

function photoPickHTML(){
  if (!XP.canPhoto()) return '';                 /* a guest cannot have one */
  var has = XP.hasPhoto(), on = XP.usingPhoto() && PK.sel === '__photo__';
  var name = '';
  try { if (window.KARTI && KARTI.displayName) name = KARTI.displayName(); } catch (e){}
  return '<div class="kx-pkph">' +
    '<button type="button" class="kx-f kx-pkphb' + (on ? ' on' : '') + '" data-photo="1">' +
      '<span class="kx-fw">' +
        (has ? avatarHTML(name, { size:54, me:true }) : ico('person')) + '</span>' +
      '<b>' + (has ? 'Your photo' : 'A photo of you') + '</b>' +
      '<i>' + (has ? 'Yours' : 'Choose one') + '</i>' +
    '</button></div>';
}

function paintPicker(){
  var el = PK.el;
  if (!el) return;
  var lvl = XP.level();
  var sel = XP.face(PK.sel);
  el.innerHTML =
    '<div class="kx-sheet">' +
      '<h3>' + (PK.first ? 'Pick your face' : 'Your face') + '</h3>' +
      '<p class="kx-lead">' + (PK.first
        ? 'This is you — on the board, on the leaderboard, and on the seat ' +
          'opposite whoever you are about to beat. Change it whenever you like.'
        : 'On the board, on the leaderboard, and on every seat plate. ' +
          'More of them turn up as you level.') + '</p>' +
      '<div class="kx-grid" id="kx-grid">' +
        XP.faces().map(function(f){
          var got = XP.ownsFace(f.id);
          return '<button type="button" class="kx-f' + (got ? '' : ' lk') + '" data-f="' + esc(f.id) + '" ' +
                 'aria-pressed="' + (PK.sel === f.id) + '">' +
                 FACES.frame(f.id, { size:62, accent:f.ax }) +
                 '<b>' + esc(f.name) + '</b>' +
                 '<i>' + (got ? (f.lvl <= 1 ? 'Free' : 'Yours') : 'Level ' + f.lvl) + '</i></button>';
        }).join('') +
      '</div>' +
      /* THE PHOTOGRAPH IS A CHOICE HERE, not only in the customisation
         screen. This picker is what you get by tapping your own face, so it
         is where a person looks to change it — and a photo that can only be
         chosen somewhere else is a photo nobody finds. Worse, picking any
         drawn face turns the photo OFF, so without this there was no way
         back to it from the screen that took it away. */
      photoPickHTML() +
      '<p class="kx-blurb">' + esc(PK.sel === '__photo__'
          ? 'Your own picture, kept on the Pi so everybody else sees it too.'
          : (sel ? sel.blurb : '')) + '</p>' +
      '<div class="kx-acts2">' +
        (PK.first ? '' : '<button type="button" class="ghost" id="kx-pk-x">Close</button>') +
        '<button type="button" id="kx-pk-ok">' + (PK.first ? 'This is me' : 'Use this face') + '</button>' +
      '</div>' +
    '</div>';

  $$('.kx-f', el).forEach(function(b){
    b.onclick = function(){
      var id = b.getAttribute('data-f'), f = XP.face(id);
      if (!XP.ownsFace(id)){
        if (window.KARTI && KARTI.toast) KARTI.toast(f.name + ' turns up at level ' + f.lvl + '.');
        sfx(function(S){ S.play('ui.error'); });
        return;
      }
      PK.sel = id;
      sfx(function(S){ S.note(3, { gain:0.3 }); });
      paintPicker();
    };
  });
  var ph = $('.kx-pkphb', el);
  if (ph) ph.onclick = function(){
    if (!XP.hasPhoto()){
      /* nothing to wear yet — send them where the picture is chosen */
      closePicker();
      XP.open('you');
      return;
    }
    PK.sel = '__photo__';
    sfx(function(S){ S.note(4, { gain:0.3 }); });
    paintPicker();
  };
  var ok = $('#kx-pk-ok', el);
  if (ok) ok.onclick = function(){
    /* the photo is a choice like any other: choosing it wears it, and
       choosing a drawn face takes it off. One decision, one place. */
    if (PK.sel === '__photo__'){ XP.usePhoto(true); }
    else { XP.usePhoto(false); XP.setAvatar(PK.sel); }
    closePicker();
    if (SC.live) renderScreen();
    queueRepaint();
  };
  var x = $('#kx-pk-x', el);
  if (x) x.onclick = closePicker;
  void lvl;
}



/* ═══════════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════════ */
injectCSS();
if (FACES) FACES.ready();

/* The backdrops go on the shelf the moment this module loads, and the
   equipped one is painted onto :root BEFORE any interaction — so a
   reload comes back in the chosen colours, not in stock-then-a-flash. */
registerBackdrops();
applyBackdrop();

/* The colour themes, home scenes and tab styles go up beside them, and
   the equipped combination is composed through KARTI_THEME.apply()
   before any interaction — so a reload comes back wearing the chosen
   identity, and a player wearing nothing gets one all-null apply(),
   which removes no defaults and changes not a pixel. */
registerKxSlots();
applyKx();

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', watchAvatars);
else watchAvatars();

/* Any change to what a player wears repaints every avatar span, HERE,
   in the module that owns them. js/game.js used to re-render the whole
   home screen from its own onEquip listener to get the pill repainted —
   a full-screen rebuild for a 32px face, and it also fired on every
   register() batch a late-loading game sent. The stamp in paintOne()
   makes this a no-op for events that change nothing. */
/* the same event also re-applies the shell palette — cheap enough to
   run on every equip rather than filter for 'karti.backdrop', and it
   makes unequip (fall back to stock) free */
try { XP.onEquip(function(){ queueRepaint(); applyBackdrop(); applyKx(); }); } catch (e){}

/* Android back: while the level-up card is holding, a back press should
   put it away, not walk out of the screen underneath it. */
try {
  if (window.KARTI_NAV && KARTI_NAV.layer){
    KARTI_NAV.layer({ id:'kx-reward', isOpen:function(){ return !!(RW.el && RW.el.classList.contains('hold')); },
                      close:close });
    KARTI_NAV.layer({ id:'kx-pick', isOpen:function(){ return !!(PK.el && PK.el.classList.contains('on')); },
                      close:closePicker });
  }
} catch (e){}

XP._ui({
  reward: reward,
  avatarHTML: avatarHTML,
  repaintAvatars: repaintAvatars,
  open: function(tab, opts){ return openScreen(tab, opts); },
  pickAvatar: function(o){ return openPicker(o); }
});
XP._uiLoaded = true;
XP._rw = function(){ return RW; };

})();
