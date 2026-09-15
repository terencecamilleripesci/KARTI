/* ═══════════════════════════════════════════════════════════════════
   SALTWAKE — THE QUIET BEACON                        window.KARTI_SALTWAKE

   The monster-catching game, as a door on Home. Original creatures on a
   fictional Maltese island; nothing in it derives from another game's
   creatures, names or artwork.

   OWNER ONLY, FOR NOW. The row is drawn only for the admin account, the
   same way js/mail.js draws the send console and js/qawmien.js drew the
   RPG door — and for the same reason: this is a Phase 0 prototype whose
   whole job is to answer one question with a handful of testers, and a
   half-finished world behind a public button costs more goodwill than it
   earns. `isAdmin()` below is mail.js's test, kept deliberately
   identical so there is one answer to "am I the owner", not two that can
   drift apart.

   WHAT REPLACED WHAT. Il-Qawmien (the isometric Dofus-like) is PAUSED —
   js/qawmien.js still loads but its ENABLED flag is false, so its row
   does not draw. This is its successor, not a second door beside it.
   If Il-Qawmien ever comes back, both can be listed; today only one is.

   THE GAME IS A FOLDER. `saltwake/` holds the runtime copied out of the
   monstercatch repo: index.html, four js files, the Tiled maps and the
   art. 184 KB, against 5.8 MB for the RPG, because the whole thing is
   sprites and 16px tiles rather than painted 1536x1024 plates. It runs
   in an iframe so its canvas, its input handling and its animation loop
   cannot fight KARTI's.

   NO RELAY HANDSHAKE YET, and that is deliberate rather than missing.
   Phase 0 saves to the frame's own localStorage and asks KARTI for
   nothing — no token, no account, no wallet. There is therefore no
   postMessage contract to get wrong and nothing of KARTI's exposed to
   the frame. Account-backed saves are a Phase 3 job; when they arrive
   they should follow js/qawmien.js's pattern (the parent decides in ONE
   place what a frame is given, same-origin checked on both sides, never
   posted to '*').
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function (global) {

  var ENABLED = true;

  var ENTRY = 'saltwake/index.html';
  var wrap = null, frame = null, wasHash = '';

  function T(en, mt) {
    try {
      var lang = (global.KARTI_I18N && KARTI_I18N.lang) ||
                 (global.localStorage && localStorage.getItem('karti_lang')) || 'en';
      return lang === 'mt' && mt ? mt : en;
    } catch (e) { return en; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* THE SAME TEST js/mail.js USES, on purpose. The relay decides who is
     an admin; asking KARTI_XP runs that live check, session and all. A
     second, subtly different notion of "owner" is how a beta leaks. */
  function isAdmin() {
    try {
      var XP = global.KARTI_XP;
      if (!XP) return false;
      if (typeof XP.isAdmin === 'function') return !!XP.isAdmin();
      if (typeof XP.owns === 'function') return !!XP.owns('border.tempesta');
    } catch (e) {}
    return false;
  }

  /* ── the door on Home ──────────────────────────────────────────────
     Injected rather than written into index.html, because it must not
     exist at all for anyone but the owner — an element that is merely
     hidden is an element somebody can unhide. */
  function onHome() {
    try {
      var menu = document.querySelector('.menu');
      if (!menu) return;
      var old = document.getElementById('btn-saltwake');
      if (!ENABLED || !isAdmin()) { if (old) old.remove(); return; }
      if (old) return;

      var b = document.createElement('button');
      b.className = 'btn pick';
      b.id = 'btn-saltwake';
      b.type = 'button';
      /* No logo art yet, so the bolt glyph stands in. A missing image
         file would cost the row its picture, never the row itself — but
         referencing one that does not exist is a 404 for nothing. */
      b.innerHTML =
        '<span class="pk-ic" aria-hidden="true">' +
          '<svg class="ico" viewBox="0 0 24 24"><use href="#i-bolt"></use></svg>' +
        '</span>' +
        '<span class="pk-tx"><span class="pk-t">' +
          esc(T('Saltwake', 'Saltwake')) +
          ' <small style="opacity:.7;font-weight:700">PROTOTYPE</small></span>' +
        '<span class="sub">' +
          esc(T('The Quiet Beacon — catch and train creatures',
                'Saltwake — aqbad u ħarreġ kreaturi')) + '</span></span>' +
        '<svg class="pk-go" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M9 18l6-6-6-6"/></svg>';
      b.addEventListener('click', open);
      menu.appendChild(b);
    } catch (e) {}
  }

  /* ── the game, full screen ────────────────────────────────────────*/
  function open() {
    if (!ENABLED || wrap) return;
    try {
      wrap = document.createElement('div');
      wrap.id = 'saltwake-wrap';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-label', 'Saltwake');
      wrap.style.cssText =
        'position:fixed;inset:0;z-index:9000;background:#12161f;' +
        'display:flex;flex-direction:column';

      frame = document.createElement('iframe');
      frame.src = ENTRY;
      frame.title = 'Saltwake';
      frame.style.cssText = 'flex:1 1 auto;width:100%;border:0;display:block';

      /* ONE WAY OUT, AND IT IS DRAWN. The RPG deliberately had no exit
         pill because its own settings menu carried "Back to KARTI";
         this prototype has no such menu yet, so without a visible
         control the only way back would be Android's back gesture —
         which is not discoverable and does not exist in a desktop
         browser. A small pill at the top is the honest answer until the
         game grows its own menu. */
      var out = document.createElement('button');
      out.type = 'button';
      out.textContent = '✕ KARTI';
      out.style.cssText =
        'position:absolute;top:calc(env(safe-area-inset-top) + 8px);right:10px;' +
        'z-index:2;background:rgba(18,22,31,.82);color:#e8ecf5;' +
        'border:1px solid #2b3446;border-radius:99px;padding:7px 13px;' +
        'font:600 13px system-ui,sans-serif;min-height:auto;width:auto';
      out.addEventListener('click', function () { close(); });

      wrap.appendChild(frame);
      wrap.appendChild(out);
      document.body.appendChild(wrap);
      document.documentElement.style.overflow = 'hidden';

      /* Android back / browser back leaves the game, not KARTI */
      wasHash = location.hash;
      try { history.pushState({ saltwake: 1 }, '', location.href); } catch (e) {}
      global.addEventListener('popstate', onPop);
    } catch (e) { close(); }
  }

  function onPop() { if (wrap) close(true); }

  function close(fromPop) {
    try { global.removeEventListener('popstate', onPop); } catch (e) {}
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    wrap = null; frame = null;
    try { document.documentElement.style.overflow = ''; } catch (e) {}
    if (!fromPop) { try { history.back(); } catch (e) {} }
  }

  global.KARTI_SALTWAKE = {
    _impl: 1,
    onHome: onHome,        /* called at the end of renderHome() */
    open: open,
    close: close,
    isAdmin: isAdmin
  };

  /* THIS FILE IS DEFERRED, so Home has usually already painted by the
     time it defines itself. Draw the row once now; every later render
     goes through renderHome()'s own call. */
  try { if (document.readyState !== 'loading') onHome(); } catch (e) {}

})(window);
