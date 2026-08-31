/* ═══════════════════════════════════════════════════════════════════
   IL-QAWMIEN — THE AWAKENING                        window.KARTI_QAWMIEN

   The RPG, as a door on Home. Isometric, turn-based, five classes — a
   different animal from the card and party games, so it gets its own
   door rather than hiding inside one.

   IT IS NOT CALLED "STORY MODE". KARTI already has one: js/story.js,
   IR-RAKKONT, the eight-boss village road, and it keeps that name and
   that button. Two doors labelled Story Mode would be a trap for the
   players who already know the old one.

   OWNER ONLY, FOR NOW. The row is drawn only for the admin account, the
   same way js/mail.js draws the send console — and for the same reason:
   this is a beta, and a half-finished world behind a public button costs
   more goodwill than it earns. isAdmin() below is mail.js's test, kept
   deliberately identical so there is one answer to "am I the owner",
   not two that can drift apart.

   THE GAME IS A FOLDER, NOT A REWRITE. qawmien/ is built by
   tools/bundle.py in the tactics-testbed repo: it copies `git archive
   HEAD` (never the working tree — agents are usually mid-edit) and
   palette-quantises the sprite sheets, 23.6 MB down to 5.8 MB with zero
   silhouette pixels changed. It runs in an iframe so its canvas, its
   input handling and its rAF loop cannot fight KARTI's.

   CLOUD SAVES GO THROUGH THE RPG'S OWN RELAY, NOT KARTI'S. The owner's
   instruction was "different relay so it don't disturb the party
   games": server/qawmien_relay.py (port 8102, own db) holds RPG
   characters, and the frame's net.js talks to it directly. What this
   file contributes is the HANDSHAKE: the frame posts
   {type:'qawmien:hello'} and we answer {type:'qawmien:auth', tok, name,
   url} — the live KARTI session token (KARTI_SYNC.sessionToken()) and
   the relay base URL. postMessage rather than letting the frame read
   KARTI's localStorage, because sync.js's session keys are private
   layout, because the parent should decide in ONE place what a frame is
   given, and because the token then never rests in the frame at all.
   Same-origin checked on both sides; never posted to '*'. The RPG's
   localStorage remains the local truth — a dead relay costs nothing but
   "sync pending".
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ENTRY = 'qawmien/world.html';
  var frame = null, wrap = null, wasHash = '';

  function T(en, mt) {
    try {
      if (global.KARTI_I18N && KARTI_I18N.lang && KARTI_I18N.lang() === 'mt') return mt;
    } catch (e) {}
    return en;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* THE SAME TEST js/mail.js USES, on purpose. The relay decides who is an
     admin; asking KARTI_XP runs that live check, session and all. A second,
     subtly different notion of "owner" is how a beta leaks. */
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
     exist at all for anyone but the owner — and an element that is
     merely hidden is an element somebody can unhide. */
  function onHome() {
    try {
      var menu = document.querySelector('.menu');
      if (!menu) return;
      var old = document.getElementById('btn-qawmien');
      if (!isAdmin()) { if (old) old.remove(); return; }
      if (old) return;

      var b = document.createElement('button');
      b.className = 'btn pick';
      b.id = 'btn-qawmien';
      b.type = 'button';
      b.innerHTML =
        '<span class="pk-ic" aria-hidden="true"><svg class="ico" viewBox="0 0 24 24" ' +
          'focusable="false"><use href="#i-bolt"></use></svg></span>' +
        '<span class="pk-tx"><span class="pk-t">' + esc(T('Il-Qawmien', 'Il-Qawmien')) +
          ' <small style="opacity:.7;font-weight:700">BETA</small></span>' +
        '<span class="sub">' +
          esc(T('The Awakening — an isometric RPG',
                'Il-Qawmien — RPG iżometriku')) + '</span></span>' +
        '<svg class="pk-go" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M9 18l6-6-6-6"/></svg>';
      b.addEventListener('click', open);
      menu.appendChild(b);
    } catch (e) {}
  }

  /* ── the RPG relay's base URL ──────────────────────────────────────
     Mirrors sync.js baseURL(): follow whatever relay js/mp.js is pointed
     at so ?relay=… moves everything together, else the same Pi the
     production funnel serves — but the /qawmien mount (port 8102), never
     KARTI's own /karti mount (8101). Plain-http dev pages hit 8102 on
     the same machine directly. */
  function relayURL() {
    var u = '';
    try {
      if (global.KARTI_MP && typeof KARTI_MP.defaultURL === 'function')
        u = (KARTI_MP.defaultURL() || '').trim();
    } catch (e) {}
    if (/^wss?:\/\//i.test(u))
      return u.replace(/^ws/i, 'http')
              .replace(/\/karti\/ws\/?$/i, '')
              .replace(/\/ws\/?$/i, '') + '/qawmien';
    if (location.protocol === 'http:' && location.hostname)
      return 'http://' + location.hostname + ':8102';
    return 'https://raspberrypi.silverside-tench.ts.net:8443/qawmien';
  }

  /* the frame asks, we answer — and only OUR frame, on OUR origin */
  function onMsg(ev) {
    try {
      if (!frame || ev.source !== frame.contentWindow) return;
      if (ev.origin !== location.origin) return;
      var d = ev.data;
      if (!d || d.type !== 'qawmien:hello') return;
      var tok = '', name = '';
      try {
        var SY = global.KARTI_SYNC;
        if (SY && typeof SY.sessionToken === 'function') tok = SY.sessionToken() || '';
        if (SY && typeof SY.status === 'function') name = (SY.status().user) || '';
      } catch (e) {}
      ev.source.postMessage(
        { type: 'qawmien:auth', v: 1, tok: tok, name: name, url: relayURL() },
        location.origin);
    } catch (e) {}
  }

  /* ── the world, full screen ───────────────────────────────────────── */
  function open() {
    if (wrap) return;
    try {
      wrap = document.createElement('div');
      wrap.id = 'qawmien-wrap';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-label', 'Il-Qawmien');
      wrap.style.cssText =
        'position:fixed;inset:0;z-index:9000;background:#0E0B1A;' +
        'display:flex;flex-direction:column';

      frame = document.createElement('iframe');
      frame.src = ENTRY;
      frame.title = 'Il-Qawmien';
      /* the RPG owns its own canvas, input and animation loop; an iframe is
         what keeps those from fighting KARTI's */
      frame.style.cssText = 'flex:1 1 auto;width:100%;border:0;display:block';

      /* A WAY OUT THAT IS ALWAYS THERE. The RPG is full-screen and has no
         idea KARTI exists, so if this button is ever covered the player is
         trapped in it. It sits above the frame, inside the safe area. */
      var x = document.createElement('button');
      x.type = 'button';
      x.setAttribute('aria-label', T('Leave Il-Qawmien', 'Oħroġ minn Il-Qawmien'));
      x.textContent = '✕';
      x.style.cssText =
        'position:absolute;top:calc(env(safe-area-inset-top,0px) + 8px);' +
        'left:calc(env(safe-area-inset-left,0px) + 8px);z-index:2;' +
        'min-width:44px;min-height:44px;border-radius:12px;cursor:pointer;' +
        'border:1px solid rgba(255,255,255,.18);background:rgba(10,8,20,.78);' +
        'color:#EDEAF6;font-size:18px;font-weight:800;line-height:1';
      x.addEventListener('click', close);

      wrap.appendChild(frame);
      wrap.appendChild(x);
      document.body.appendChild(wrap);
      document.documentElement.style.overflow = 'hidden';
      /* listen for the frame's hello BEFORE it can possibly boot */
      global.addEventListener('message', onMsg);

      /* Android back / browser back should leave the game, not leave KARTI */
      wasHash = location.hash;
      try { history.pushState({ qawmien: 1 }, '', location.href); } catch (e) {}
      global.addEventListener('popstate', onPop);
    } catch (e) { close(); }
  }

  function onPop() { if (wrap) close(true); }

  function close(fromPop) {
    try { global.removeEventListener('popstate', onPop); } catch (e) {}
    try { global.removeEventListener('message', onMsg); } catch (e) {}
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    wrap = null; frame = null;
    try { document.documentElement.style.overflow = ''; } catch (e) {}
    if (!fromPop) { try { history.back(); } catch (e) {} }
  }

  global.KARTI_QAWMIEN = {
    _impl: 1,
    onHome: onHome,        /* called at the end of renderHome() */
    open: open,
    close: close,
    isAdmin: isAdmin
  };
})(window);
