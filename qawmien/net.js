/* ═══════════════════════════════════════════════════════════════════
   NET — window.NET, the character-follows-you layer.

   The RPG keeps saving to ITS OWN localStorage exactly as before
   (player.js 'tactics.hero.v1', quest.js QUEST.LSK — versioned, ask it);
   that stays the local truth and the game is fully playable with no
   network at all. This file only MIRRORS that truth to the QAWMIEN
   relay (karti-malta/server/qawmien_relay.py, port 8102 — its own
   process and database, deliberately separate from the party games'
   relay on 8101) so a character can follow the player to another phone.

   ── HOW THE TOKEN ARRIVES: postMessage, from the parent ───────────
   The RPG runs in an iframe under KARTI (js/qawmien.js). On boot this
   frame posts {type:'qawmien:hello'} to its parent; the parent answers
   {type:'qawmien:auth', tok, name, url} — the live KARTI session token
   and the relay base URL. Chosen over reading KARTI's localStorage from
   the frame (same-origin, so it WOULD work) because:
     · sync.js keeps its session under per-profile internal keys
       (sessKey(local)) whose layout is private and may drift any
       build — the frame reading them couples two repos silently;
     · the parent decides what to share, in one auditable place, and
       can send tok:'' when signed out;
     · the token stays MEMORY-ONLY in here — never written to this
       frame's localStorage, forgotten when the frame closes;
     · it keeps working if qawmien/ ever moves to another origin.
   Both sides verify event.origin === location.origin and the
   source/target window; the token is never posted to '*'.
   Standalone (no parent, or a parent that never answers): sync simply
   stays off and the game is untouched.

   ── WHAT IS SYNCED ────────────────────────────────────────────────
   One small opaque JSON object:  { v:1, hero:{…}, quest:{…} }
   hero  = the 'tactics.hero.v1' payload — classId + gender + level/xp/
           hp/items/equip/at. The CLASS ID, never the class data: stats,
           spells and sheets are re-derived from classes.js on any
           device. ~1 KB, nesting depth ≤ 5 (relay caps at 32).
   quest = the tutorial progress, so the step follows the character.

   ── WHEN (the checkpoints — not on every footstep) ────────────────
     · on entry: one pull (adopt the cloud character when this device
       has none or hasn't moved since it last agreed with the server)
     · after the class is chosen        (HERO.onChange)
     · on quest step change             (QUEST.onChange)
     · on leaving a map                 (world.html's WORLD.onExit
       handler calls NET.checkpoint('map') — that single-callback slot
       belongs to world.html, so the call lives there, not here)
     · a slow timer (60 s) that only pushes when something changed,
       and a best-effort keepalive push on pagehide.
   HERO/QUEST.onChange are single-callback slots too; nothing else in
   this repo registers either (checked), and this file loads last.

   ── CONFLICTS: NEVER SILENTLY LOSE A CHARACTER ────────────────────
   Push carries `base` (the last server version this device agreed
   with). If the server has moved past it, the relay answers 409 with
   ITS blob and writes nothing. If the two sides differ only by
   timestamp/position bookkeeping we converge silently (sync.js's
   "identical yet a popup appeared" lesson). Otherwise BOTH sides are
   shown to the player — class, level, when, which device — and the
   player chooses; nothing is overwritten until they do. Unlike KARTI's
   card saves there is NO auto-merge here: a character is one classId,
   one level, one position — a choice, not a union-able collection, and
   "max of both" would fabricate a hero neither device had. sync.js
   itself files choice-shaped fields as keep-one-whole; here the whole
   save is choice-shaped, so we ask. "Use the cloud" backs the local
   character up first ('tactics.sync.backup.v1'); "keep mine" force-
   pushes, and the relay keeps the replaced blob (pull {prev:true}).

   A dead relay, aeroplane mode, 401s, 503s: every path degrades to
   "sync pending" — nothing here ever blocks entering, playing or
   saving, and no error is thrown at the game.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

window.NET = (function () {

  const HKEY = 'tactics.hero.v1';
  /* LAZY, because quest.js may not have loaded when this module body runs,
     and hard-coding it is exactly how the two drifted apart. The v1 fallback
     is only for a boot order where QUEST is genuinely absent. */
  const qkey = () => (window.QUEST && window.QUEST.LSK) ||
                     'tactics.quest.tutorial.v2';
  const SKEY = 'tactics.sync.v1';        /* {ver, blob, at} last agreement */
  const BKEY = 'tactics.sync.backup.v1'; /* local copy kept before adopt   */
  const ADOPTK = 'tactics.sync.adopt';   /* sessionStorage relay to next boot */

  const NET_MS    = 8000;      /* one wire call may take this long, then dies */
  const TIMER_MS  = 60 * 1000; /* slow safety-net push (no-op when clean)     */
  const SETTLE_MS = 2500;      /* checkpoint debounce — burst of events, one push */

  /* auth — MEMORY ONLY, never persisted in this frame */
  const A = { tok: '', name: '', url: '', dead: false };

  /* the last agreement with the server: version + the exact blob agreed */
  let SY = { ver: 0, blob: null };
  try {
    const d = JSON.parse(localStorage.getItem(SKEY));
    if (d && typeof d.ver === 'number')
      SY = { ver: Math.max(0, d.ver | 0),
             blob: typeof d.blob === 'string' ? d.blob : null };
  } catch (e) {}

  let phase = 'idle';   /* idle | pending | conflict | relogin | error */
  let online = null;    /* null unknown, true/false last wire answer   */
  let busy = false;     /* one wire call at a time                     */
  let paused = false;   /* an unresolved conflict pauses auto-push     */
  let CF = null;        /* {srvVer, srvBlob, srvAt, srvDevice}         */
  let settleT = 0;
  let adopting = false; /* adopt() reload in flight: the DYING page must
                           not push — its pagehide flush would upload the
                           very character the player just declined */

  function saveSY(ver, blob) {
    SY.ver = ver; SY.blob = blob;
    try {
      localStorage.setItem(SKEY, JSON.stringify(
        { ver: ver, blob: blob, at: Math.floor(Date.now() / 1000) }));
    } catch (e) {}
  }

  /* ── the blob ───────────────────────────────────────────────────── */

  /* HERO.save() first, so the stored payload is CURRENT (player.js
     autosaves on a 1.5 s diff — a checkpoint must not race that). */
  function currentBlob() {
    try { if (window.HERO && HERO.save) HERO.save(); } catch (e) {}
    let h = null, q = null;
    try { h = JSON.parse(localStorage.getItem(HKEY)); } catch (e) {}
    if (!h || typeof h !== 'object' || typeof h.classId !== 'string')
      return null;                      /* no character yet → nothing to sync */
    try { q = JSON.parse(localStorage.getItem(qkey())); } catch (e) {}
    const o = { v: 1, hero: h };
    if (q && typeof q === 'object') o.quest = q;
    return JSON.stringify(o);
  }

  /* Two blobs that differ ONLY in write-time bookkeeping (hero.savedAt)
     are the same character; asking the player to choose between them is
     the exact popup-on-nothing bug sync.js documents. Position and all
     real progress still count as differences. */
  function same(a, b) {
    if (a === b) return true;
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    function norm(s) {
      try {
        const o = JSON.parse(s);
        if (o && o.hero && typeof o.hero === 'object') delete o.hero.savedAt;
        return JSON.stringify(o);
      } catch (e) { return s; }
    }
    return norm(a) === norm(b);
  }

  /* ── the wire — NEVER throws at the game ───────────────────────── */
  function call(route, body, keepalive) {
    let ctrl = null, timer = null;
    try { ctrl = new AbortController(); } catch (e) {}
    const opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      credentials: 'omit', cache: 'no-store', mode: 'cors'
    };
    if (keepalive) opts.keepalive = true;
    if (ctrl) {
      opts.signal = ctrl.signal;
      timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, NET_MS);
    }
    return fetch(A.url + '/rpg/' + route, opts).then(function (r) {
      return r.text().then(function (t) {
        let js = null;
        try { js = JSON.parse(t); } catch (e) {}
        return { status: r.status, js: js || {} };
      });
    }).then(function (r) {
      if (timer) clearTimeout(timer);
      online = true;
      if (r.status >= 200 && r.status < 300)
        return { ok: true, status: r.status, d: r.js };
      return { err: r.js.why || 'server said no', status: r.status, d: r.js };
    }).catch(function () {
      if (timer) clearTimeout(timer);
      online = false;
      return { err: 'unreachable', status: 0, offline: true, d: {} };
    });
  }

  function deviceLabel() {
    const ua = navigator.userAgent || '';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac OS/i.test(ua)) return 'Mac';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'device';
  }

  /* ── adopting the cloud character ───────────────────────────────
     Local copy is backed up first, then the frame reloads and HERO/
     QUEST/WORLD re-boot from localStorage exactly as on any other load,
     so there is exactly one restore path.

     THE KEYS ARE NOT REWRITTEN HERE. player.js autosaves on pagehide,
     which fires AFTER this function during the reload — writing the
     keys now gets them clobbered by the dying page's own hero (found
     the hard way: adopt looked complete, then the old level came back).
     Instead the adopted blob rides sessionStorage (ADOPTK) and a tiny
     inline script in world.html applies it BEFORE player.js reads
     localStorage on the next page life. No reload loop: SY is saved
     before reloading, so the next entry pull sees agreement. */
  function adopt(srvBlob, ver) {
    let o = null;
    try { o = JSON.parse(srvBlob); } catch (e) {}
    if (!o || typeof o !== 'object' || !o.hero || typeof o.hero !== 'object')
      return false;                     /* unreadable → leave local alone */
    try {
      const lh = localStorage.getItem(HKEY), lq = localStorage.getItem(qkey());
      if (lh != null)
        localStorage.setItem(BKEY, JSON.stringify(
          { at: Math.floor(Date.now() / 1000), hero: lh, quest: lq }));
    } catch (e) {}
    try {
      sessionStorage.setItem(ADOPTK, JSON.stringify(
        { hero: o.hero,
          quest: (o.quest && typeof o.quest === 'object') ? o.quest : null }));
    } catch (e) { return false; }
    saveSY(ver, srvBlob);
    CF = null;
    adopting = true;    /* NOT `paused=false`: paused only exists in this
                           dying page, and un-pausing it re-arms the
                           pagehide flush (seen in the harness: the flush
                           pushed the declined hero and the next entry
                           pull adopted it straight back) */
    try { location.reload(); } catch (e) {}
    return true;
  }

  /* ── push ───────────────────────────────────────────────────────── */
  function doPush(opts) {
    opts = opts || {};
    if (!A.tok || !A.url || A.dead || adopting) return Promise.resolve({ err: 'off' });
    if (paused && !opts.resolve) return Promise.resolve({ err: 'paused' });
    if (busy) return Promise.resolve({ err: 'busy' });
    const blob = currentBlob();
    if (blob == null) return Promise.resolve({ err: 'nothing' });
    if (!opts.force && SY.blob !== null && same(blob, SY.blob))
      return Promise.resolve({ ok: true, clean: true });
    busy = true;
    return call('push', { tok: A.tok, base: SY.ver, save: blob,
                          force: !!opts.force, device: deviceLabel() })
      .then(function (r) {
        busy = false;
        if (r.ok) {
          saveSY(r.d.ver || SY.ver + 1, blob);
          CF = null; paused = false; phase = 'idle'; hideConflict();
          return { ok: true, ver: SY.ver };
        }
        if (r.status === 401) { A.dead = true; phase = 'relogin'; return { err: 'relogin' }; }
        if (r.status === 409) {
          const srv = typeof r.d.save === 'string' ? r.d.save : null;
          /* pure version race — same character, only counters moved */
          if (srv !== null && same(srv, blob)) {
            saveSY(r.d.ver || SY.ver, blob);
            phase = 'idle';
            return { ok: true, converged: true };
          }
          raiseConflict(r.d.ver || 0, srv, r.d.at || 0, r.d.device || '');
          return { err: 'conflict' };
        }
        phase = r.offline ? 'pending' : 'error';
        return { err: r.err || 'push', status: r.status };
      });
  }

  /* ── entry pull: adopt / push / ask ─────────────────────────────── */
  const WIPEK = 'tactics.wiped';     /* sessionStorage flag set by the wipe */

  function entrySync() {
    if (!A.tok || !A.url || A.dead || busy) return Promise.resolve({ err: 'off' });

    /* JUST WIPED? Then do NOT pull. The wipe cleared this device, but the
       character is still on the relay, so the very next entry pull adopted
       it straight back and the player watched their save reappear — the
       wipe looked like it had done nothing.
       Instead: force-push the fresh character over the server's copy, so
       the deletion is what propagates. The flag lives in sessionStorage
       because it must survive exactly one reload and no more. */
    let wiped = false;
    try { wiped = sessionStorage.getItem(WIPEK) === '1'; } catch (e) {}
    if (wiped) {
      try { sessionStorage.removeItem(WIPEK); } catch (e) {}
      busy = true;
      return call('push', { tok: A.tok, base: 0, force: true,
                            save: currentBlob(), device: deviceLabel ? deviceLabel() : '' })
        .then(function (r) {
          busy = false;
          if (r && r.ok) { SY.ver = r.d && r.d.ver || 0; SY.blob = currentBlob(); phase = 'ok'; }
          return { wiped: true };
        }, function () { busy = false; return { wiped: true, err: 'offline' }; });
    }

    busy = true;
    return call('pull', { tok: A.tok }).then(function (r) {
      busy = false;
      if (!r.ok) {
        if (r.status === 401) { A.dead = true; phase = 'relogin'; }
        else phase = r.offline ? 'pending' : 'error';
        return { err: r.err };          /* the 60 s timer retries the push side */
      }
      const srv = typeof r.d.save === 'string' ? r.d.save : null;
      const sver = r.d.ver || 0, sat = r.d.at || 0, sdev = r.d.device || '';
      const L = currentBlob();
      if (srv === null) {               /* server empty */
        SY.ver = sver;
        if (L != null) return doPush();
        phase = 'idle';
        return { ok: true, empty: true };
      }
      if (L === null) {                 /* no local character → take the cloud's */
        adopt(srv, sver);
        return { ok: true, adopted: true };
      }
      if (same(L, srv)) {               /* already agree */
        saveSY(sver, L); phase = 'idle';
        return { ok: true };
      }
      if (SY.blob !== null && same(L, SY.blob)) {
        /* local hasn't moved since it last agreed with the server, but
           the server has → the newer character simply wins, no question
           (this is "carry on on the second phone"). Local is backed up. */
        adopt(srv, sver);
        return { ok: true, adopted: true };
      }
      if (sver === SY.ver) {            /* server hasn't moved; local has */
        return doPush();
      }
      /* BOTH sides moved since they last spoke (or this device never
         agreed with the account at all): ask, never guess. */
      raiseConflict(sver, srv, sat, sdev);
      return { err: 'conflict' };
    });
  }

  /* ── the conflict sheet ─────────────────────────────────────────── */
  function whenText(seconds) {
    if (!seconds) return 'never';
    const d = new Date(seconds * 1000);
    if (isNaN(d.getTime())) return 'unknown';
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.round(diff / 60) + ' min ago';
    if (diff < 86400) return Math.round(diff / 3600) + ' h ago';
    return d.toLocaleDateString();
  }

  function describe(blob, at, device) {
    let o = {};
    try { o = JSON.parse(blob) || {}; } catch (e) {}
    const h = (o && o.hero && typeof o.hero === 'object') ? o.hero : {};
    let cls = typeof h.classId === 'string' ? h.classId : 'no class yet';
    try {
      const c = window.CLASSES && CLASSES.byId && CLASSES.byId(h.classId);
      if (c) cls = c.name;
    } catch (e) {}
    const lv = typeof h.level === 'number' ? Math.max(1, h.level | 0) : 1;
    return cls + ' · level ' + lv +
           (device ? ' · ' + device : '') + ' · saved ' + whenText(at);
  }

  let ovl = null;
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;',
               '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function raiseConflict(srvVer, srvBlob, srvAt, srvDevice) {
    CF = { srvVer: srvVer, srvBlob: srvBlob, srvAt: srvAt, srvDevice: srvDevice };
    paused = true; phase = 'conflict';
    showConflict();
  }

  function hideConflict() {
    if (ovl && ovl.parentNode) ovl.parentNode.removeChild(ovl);
    ovl = null;
  }

  function showConflict() {
    hideConflict();
    if (!CF || !document.body) return;
    const mine = describe(currentBlob(), Math.floor(Date.now() / 1000), 'this device');
    const theirs = describe(CF.srvBlob, CF.srvAt, CF.srvDevice);
    ovl = document.createElement('div');
    ovl.id = 'net-conflict';
    ovl.style.cssText =
      'position:fixed;inset:0;z-index:5000;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(8,6,16,.72);padding:16px';
    ovl.innerHTML =
      '<div role="alertdialog" aria-label="Two versions of your hero" style="' +
        'max-width:440px;width:100%;background:#171226;color:#EDEAF6;' +
        'border:1px solid rgba(255,255,255,.14);border-radius:14px;' +
        'padding:18px;font:15px/1.45 system-ui,sans-serif">' +
      '<div style="font-weight:800;font-size:17px;margin-bottom:8px">' +
        'Two versions of your hero</div>' +
      '<div style="opacity:.85;margin-bottom:12px">This device and the cloud ' +
        'have both moved on since they last spoke. Nothing has been ' +
        'overwritten — pick the one to keep. The other is kept as a backup.</div>' +
      '<div style="margin:6px 0"><b>This device:</b> ' + esc(mine) + '</div>' +
      '<div style="margin:6px 0 14px"><b>Cloud:</b> ' + esc(theirs) + '</div>' +
      '<button id="net-keep-mine" type="button" style="' + BTN + '">' +
        'Keep THIS device&#39;s hero</button>' +
      '<button id="net-keep-cloud" type="button" style="' + BTN + '">' +
        'Use the hero from the cloud</button>' +
      '<button id="net-later" type="button" style="' + BTN +
        ';background:transparent">Decide later</button>' +
      '</div>';
    document.body.appendChild(ovl);
    document.getElementById('net-keep-mine').onclick = function () {
      hideConflict();
      doPush({ force: true, resolve: true });
    };
    document.getElementById('net-keep-cloud').onclick = function () {
      const cf = CF;
      hideConflict();
      if (cf) adopt(cf.srvBlob, cf.srvVer);
    };
    document.getElementById('net-later').onclick = function () {
      hideConflict();                   /* stays paused: no auto-push can
                                           clobber either side; next entry
                                           pull asks again */
    };
  }
  const BTN =
    'display:block;width:100%;margin:8px 0 0;padding:12px;border-radius:10px;' +
    'border:1px solid rgba(255,255,255,.2);background:#241C3B;color:#EDEAF6;' +
    'font:inherit;font-weight:700;cursor:pointer';

  /* ── checkpoints ────────────────────────────────────────────────── */
  function checkpoint(reason) {
    if (!A.tok || A.dead || paused) return;
    if (settleT) clearTimeout(settleT);
    settleT = setTimeout(function () { settleT = 0; doPush(); }, SETTLE_MS);
  }

  function flush() {
    /* page is going away: best effort, fire and forget. SY is NOT
       updated (the answer is never read) — if it lands, the next entry
       pull sees the same character one version on and converges. */
    if (!A.tok || !A.url || A.dead || paused || adopting) return;
    const blob = currentBlob();
    if (blob == null || (SY.blob !== null && same(blob, SY.blob))) return;
    try {
      call('push', { tok: A.tok, base: SY.ver, save: blob,
                     force: false, device: deviceLabel() }, true);
    } catch (e) {}
  }

  if (typeof setInterval !== 'undefined')
    setInterval(function () {
      if (A.tok && !A.dead && !paused && !busy) doPush();
    }, TIMER_MS);
  if (typeof addEventListener !== 'undefined') {
    addEventListener('pagehide', flush);
    addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  /* HERO/QUEST changes — single-callback slots, nothing else registers
     them in this repo (world.html only uses WORLD.onExit/onNpc). */
  try {
    if (window.HERO && HERO.onChange)
      HERO.onChange(function () { checkpoint('class'); });
  } catch (e) {}
  try {
    if (window.QUEST && QUEST.onChange)
      QUEST.onChange(function () { checkpoint('quest'); });
  } catch (e) {}

  /* ── the handshake with the parent (KARTI's js/qawmien.js) ──────── */
  function onMsg(ev) {
    if (ev.origin !== location.origin) return;   /* same-origin parent only */
    if (ev.source !== window.parent) return;
    const d = ev.data;
    if (!d || d.type !== 'qawmien:auth') return;
    A.url = typeof d.url === 'string' ? d.url.replace(/\/+$/, '') : '';
    A.tok = typeof d.tok === 'string' ? d.tok : '';
    A.name = typeof d.name === 'string' ? d.name : '';
    A.dead = false;
    if (A.tok && A.url) entrySync();
  }

  (function hello() {
    if (window.parent === window) return;        /* standalone: sync off */
    addEventListener('message', onMsg);
    let tries = 0;
    const t = setInterval(function () {
      if (A.url || ++tries > 5) { clearInterval(t); return; }
      try {
        window.parent.postMessage({ type: 'qawmien:hello', v: 1 }, location.origin);
      } catch (e) {}
    }, 700);
    try {
      window.parent.postMessage({ type: 'qawmien:hello', v: 1 }, location.origin);
    } catch (e) {}
  })();

  /* ── api ────────────────────────────────────────────────────────── */
  /* one call shape for all five spar verbs */
  function spar(verb, body){
    if (!A.tok || !A.url) return Promise.reject(new Error('not linked'));
    return fetch(A.url + '/rpg/spar/' + verb, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ tok: A.tok }, body || {}))
    }).then(r => r.json().catch(() => ({ ok: false })));
  }


  return {
    checkpoint: checkpoint,             /* world.html calls this on map exit */
    syncNow: entrySync,
    /* the KARTI account name, for anything that must name the player back to
       them — the wipe confirmation types this exactly */
    accountName() { return A.name || ''; },

    /* called by the wipe, just before it reloads: the next boot must push the
       empty character UP rather than pull the old one down */
    markWiped() { try { sessionStorage.setItem(WIPEK, '1'); } catch (e) {} },

    /* ── SPARRING ────────────────────────────────────────────────────
       Thin wrappers over the relay's five room routes. They carry the
       same session token as the save routes, because a spar route must be
       exactly as hard to reach as a save route or it becomes the soft way
       in. The ACTION BLOB is opaque to the relay: it stores bytes and
       hands them to the other seat in order, which is what lets combat
       change without the server changing. */
    sparOpen()            { return spar('open'); },
    sparJoin(code)        { return spar('join',  { code }); },
    sparAct(code, act)    { return spar('act',   { code, act }); },
    sparPoll(code, after) { return spar('poll',  { code, after: after | 0 }); },
    sparLeave(code)       { return spar('leave', { code }); },
    status() {
      return { linked: !!A.tok, url: A.url, phase: phase, online: online,
               ver: SY.ver, paused: paused, relogin: A.dead, conflict: !!CF };
    },
    /* test hooks — the headless harness drives these */
    _auth(tok, url) { A.tok = tok; A.url = url; A.dead = false; },
    _push: doPush, _same: same, _blob: currentBlob
  };
})();
