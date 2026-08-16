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

function faceAccent(id){
  var f = XP.face(id);
  return (f && f.ax) || '#FFC542';
}

/* ═══════════════════════════════════════════════════════════════════
   1. FACES, WHEREVER A PLAYER IS
   Two ways in. `data-kx-av="<name>"` is the explicit one and is what
   js/mp.js's lobby roster and a game's seat plate should use. The
   second is js/game.js's existing `<span class="avatar">T</span>` —
   the profile chip and the log-in list — which is upgraded in place
   rather than by editing two innerHTML strings in a file that belongs
   to somebody else.

   The observer exists because js/game.js repaints the chip on every
   renderHome() and would wipe the face off it otherwise. It is
   debounced to one animation frame, only ever looks at elements it has
   not already done, and marks what it touches — so it converges after
   one pass and cannot chase its own tail.
   ═══════════════════════════════════════════════════════════════════ */
function avatarHTML(name, opts){
  var o = opts || {};
  var id = o.face || XP.avatarFor(name, o.hint);
  var f = XP.face(id);
  return FACES.frame(id, {
    size: o.size || 38,
    accent: o.accent || (f && f.ax) || '#FFC542',
    cls: o.cls,
    style: o.style,
    label: o.label || (name ? String(name) + (f ? ' — ' + f.name : '') : (f ? f.name : 'Player'))
  });
}

function nameNear(el){
  /* the log-in list: <button class="userrow"><span class="avatar">T</span><span class="n">Terence</span> */
  var row = el.closest ? el.closest('.userrow') : null;
  if (row){ var n = $('.n', row); if (n) return n.textContent.trim(); }
  /* the profile chip is always the player who is signed in */
  if (el.parentNode && el.parentNode.id === 'profile-chip'){
    try { if (window.KARTI && KARTI.displayName) return KARTI.displayName(); } catch (e){}
  }
  var t = (el.parentNode && el.parentNode.textContent || '').trim();
  return t || el.textContent.trim();
}

function paintOne(el){
  var explicit = el.getAttribute('data-kx-av');
  var name = explicit != null && explicit !== '' ? explicit : nameNear(el);
  var id = XP.avatarFor(name, el.getAttribute('data-kx-face') || '');
  if (el.getAttribute('data-kx-done') === id) return;
  if (explicit != null){
    var sz = parseInt(el.getAttribute('data-kx-size'), 10) || 34;
    el.innerHTML = avatarHTML(name, { size:sz });
  } else {
    /* somebody else's box — put the mark in it and leave the box alone */
    el.innerHTML = FACES.mark(id, 'kx-in');
    el.style.color = faceAccent(id);
  }
  el.setAttribute('data-kx-done', id);
}

function repaintAvatars(root){
  if (!FACES) return;
  FACES.ready();
  var r = root || document;
  try {
    $$('[data-kx-av]', r).forEach(paintOne);
    $$('.avatar', r).forEach(paintOne);
  } catch (e){}
}

var repaintQ = 0;
function queueRepaint(){
  if (repaintQ) return;
  repaintQ = requestAnimationFrame(function(){ repaintQ = 0; repaintAvatars(); });
}

function watchAvatars(){
  if (typeof MutationObserver !== 'function') return;
  var app = document.getElementById('app') || document.body;
  if (!app) return;
  new MutationObserver(function(recs){
    for (var i = 0; i < recs.length; i++) if (recs[i].addedNodes && recs[i].addedNodes.length){ queueRepaint(); return; }
  }).observe(app, { childList:true, subtree:true });
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
  '#scr-kx .kx-empty{margin:auto;padding:26px 18px;text-align:center;color:var(--dim,#A093C4);' +
    'font-size:12.5px;line-height:1.65}' +
  '#scr-kx .kx-empty .ico{display:block;margin:0 auto 11px;width:34px;height:34px;font-size:34px;' +
    'color:var(--dim2,#7F73A0)}' +
  '#scr-kx .kx-empty b{display:block;font-family:var(--disp);font-weight:900;font-size:13px;' +
    'letter-spacing:.07em;text-transform:uppercase;color:var(--txt,#F4EFFF);margin-bottom:7px}' +
  '#scr-kx .kx-foot2{flex:0 0 auto;margin:8px 2px 0;font-size:10.5px;line-height:1.55;' +
    'color:var(--dim2,#7F73A0);text-align:center}' +

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
var SC = { el:null, live:false, watching:false, tab:'you', from:'home' };

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
  try { if (window.KARTI && KARTI.go) KARTI.go('home'); } catch (e){}
}

function openScreen(tab){
  injectCSS();
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
  var list = game === 'you' ? XP.faces().map(function(f){ return { id:'face.' + f.id, level:f.lvl }; })
                            : XP.defsFor(game);
  var n = 0, i;
  for (i = 0; i < list.length; i++){
    if (game === 'you'){ if (XP.ownsFace(list[i].id.slice(5))) n++; }
    else if (XP.owns(list[i].id)) n++;
  }
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

  $('#kx-back', el).onclick = closeScreen;
  $('#kx-face', el).onclick = function(){ openPicker({}); };
  $$('#kx-tabs button', el).forEach(function(b){
    b.onclick = function(){
      var t = b.getAttribute('data-t');
      if (t === SC.tab) return;
      SC.tab = t;
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
  cards:'The cards', dice:'The dice', frame:'The frame', trim:'The trim'
};
function slotWord(s){ return SLOT_WORD[s] || (s.charAt(0).toUpperCase() + s.slice(1)); }

function paintBody(){
  var host = $('#kx-body', SC.el);
  if (!host) return;

  if (SC.tab === 'you'){
    host.innerHTML = XP.faces().map(function(f){
      var got = XP.ownsFace(f.id), on = XP.avatar() === f.id;
      return '<button type="button" class="kx-it' + (on ? ' on' : got ? '' : ' off') +
             '" data-face="' + esc(f.id) + '"' + (got ? '' : ' aria-disabled="true"') + '>' +
             '<span class="kx-pv">' + FACES.frame(f.id, { size:62, accent:f.ax }) + '</span>' +
             '<span class="kx-nm"><b>' + esc(f.name) + '</b><i>' + esc(f.blurb) + '</i></span>' +
             '<span class="kx-st ' + (on ? 'on' : got ? '' : 'lock') + '">' +
               (on ? 'Worn' : got ? 'Wear' : ico('lock') + 'Lv ' + f.lvl) + '</span></button>';
    }).join('');
    $$('.kx-it[data-face]', host).forEach(function(b){
      b.onclick = function(){
        var r = XP.setAvatar(b.getAttribute('data-face'));
        if (!r.ok){
          if (window.KARTI && KARTI.toast) KARTI.toast('That face arrives at level ' + r.level + '.');
          sfx(function(S){ S.play('ui.error'); });
          return;
        }
        renderScreen();
      };
    });
    return;
  }

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
      bySlot[slot].map(function(d){
        var got = XP.owns(d.id), on = eq === d.id;
        return '<button type="button" class="kx-it' + (on ? ' on' : got ? '' : ' off') +
               '" data-c="' + esc(d.id) + '">' +
               '<span class="kx-pv" data-pv="' + esc(d.id) + '"></span>' +
               '<span class="kx-nm"><b>' + esc(d.name) + '</b><i>' + esc(d.blurb || '') + '</i></span>' +
               '<span class="kx-st ' + (on ? 'on' : got ? '' : 'lock') + '">' +
                 (on ? 'On' : got ? 'Use' : ico('lock') + 'Lv ' + d.level) + '</span></button>';
      }).join('');
  }).join('');

  /* preview() is the whole point of the registry: this file draws a
     pink chess board without knowing what a chess board is. A preview
     that throws, or that a game forgot to give, degrades to the game's
     two letters — never to a hole in the list. */
  $$('[data-pv]', host).forEach(function(box){
    var d = XP.def(box.getAttribute('data-pv'));
    if (!previewInto(box, d))
      box.innerHTML = '<span style="font-family:var(--disp);font-weight:900;font-size:11px;' +
        'letter-spacing:.1em;color:var(--dim2,#7F73A0)">' + esc(gameDef(SC.tab).mono || '') + '</span>';
  });

  $$('.kx-it[data-c]', host).forEach(function(b){
    b.onclick = function(){
      var id = b.getAttribute('data-c'), d = XP.def(id);
      if (!d) return;
      if (!XP.owns(id)){
        if (window.KARTI && KARTI.toast) KARTI.toast(d.name + ' arrives at level ' + d.level + '.');
        sfx(function(S){ S.play('ui.error'); });
        return;
      }
      if (XP.equipped(d.slot, d.game) === id) XP.unequip(d.slot, d.game);
      else XP.equip(d.slot, id);
      paintBody();
    };
  });
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
  PK.sel = XP.avatar();
  paintPicker();
  el.classList.add('on');
  sfx(function(S){ S.play('ui.sheet'); });
}

function closePicker(){
  if (PK.el) PK.el.classList.remove('on');
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
      '<p class="kx-blurb">' + esc(sel ? sel.blurb : '') + '</p>' +
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
  var ok = $('#kx-pk-ok', el);
  if (ok) ok.onclick = function(){
    XP.setAvatar(PK.sel);
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

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', watchAvatars);
else watchAvatars();

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
  open: function(tab){ return openScreen(tab); },
  pickAvatar: function(o){ return openPicker(o); }
});
XP._uiLoaded = true;
XP._rw = function(){ return RW; };

})();
