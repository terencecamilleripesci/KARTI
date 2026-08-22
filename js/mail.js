/* ═══════════════════════════════════════════════════════════════════════════
   KARTI — IL-KAXXA TAL-ITTRI                              window.KARTI_MAIL
   ───────────────────────────────────────────────────────────────────────────
   The mailbox: the owner sends a player a gift, the player finds a letter
   waiting for them and opens it.

   WHY IT IS SERVER-HELD. A gift has to survive the recipient being offline,
   reinstalling, or playing on a different phone — so it cannot live in the
   sender's browser and it cannot ride a lobby message. The relay keeps it
   against the ACCOUNT and hands it over the next time that account signs in,
   wherever that is.

   WHY THE ADMIN CHECK IS NOT HERE. The relay decides who may send, from the
   account the request is authenticated as; this file only decides who is
   SHOWN the send console. js/progress.js holds the client-side predicate —
   isAdmin() — but does not export it by name. It does export a faithful
   proxy without meaning to: the Tempesta border (earn:'admin') carries a
   LIVE ownership test that calls the real isAdmin() on every read, so
   KARTI_XP.owns('border.tempesta') answers the same question through a
   public door. If progress.js ever exports isAdmin() directly, the check
   below prefers it automatically. Either way it is worth exactly nothing
   as a permission — anyone can edit their own JavaScript — and the server
   enforces its own list on the `gift` route.

   THE WIRE (all POST JSON, all under the same /karti/acct prefix that
   js/sync.js already talks to — same base URL, same token, same "never
   throw" discipline):

     gift   { tok, to, gift, note }  -> { ok, id, to }
              admin only, ENFORCED SERVER-SIDE. `to` is the recipient's
              account name, case/punctuation-insensitive.
              403 not allowed · 404 no such player · 400 empty gift ·
              409 their mailbox is full.
     mail   { tok }                  -> { ok, mail:[{id, from, note, gift, at}] }
              this account's UNCLAIMED letters, newest first.
     claim  { tok, id }              -> { ok, id, gift, already }
              IDEMPOTENT: `already:true` means it was opened before and
              must pay NOTHING. The server's word is the authority.

   THE GIFT PAYLOAD is opaque to the relay and interpreted here on arrival —
   the server never needs to understand the economy to carry a parcel:

     { coins:N, chips:N, packs:N, xp:N, excl:'<setKey>', cosm:'<cosmeticId>' }

   Every field optional. Unknown fields are IGNORED rather than rejected, so
   an older client can still open a letter written by a newer one.

   NEVER PAY TWICE. Three fences, in order of authority:
     1. the server's `already:true` — the truth, and the only one that works
        across devices;
     2. a single-flight guard per letter id, so a double tap cannot put two
        claims on the wire at once;
     3. a tiny local journal (localStorage, per account) written BEFORE the
        gift is applied, so even a response that somehow arrived twice could
        only be paid once. A reload in the middle of a claim therefore
        errs on the side of paying NOTHING extra — the letter is gone from
        the box (the server claimed it) and no second credit can happen.

   THE BADGE takes the #kl-inst lesson (see index.html): a fixed bar steals
   the bottom of the page and sits on top of the one button a new player
   needs. So the mail button is NOT fixed — it is an in-flow chip in the
   home header's left column, right under the profile chip beside the daily
   spin badge. It occupies real layout space, so by construction it can
   never cover another control; and it exists in the DOM only when there is
   mail, so an empty box costs the home screen nothing.

   POLLING is deliberately lazy: on sign-in (KARTI_SYNC.onChange), on the
   app coming back into view (visibilitychange), and once shortly after
   boot — never on a timer. The relay rate-limits the account API and will
   answer "Slow down" if hammered; a gap floor below makes sure even a
   pathological page cannot hammer it.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  if (global.KARTI_MAIL && global.KARTI_MAIL._impl) return;

  /* ── tunables ─────────────────────────────────────────────────────── */
  var MIN_GAP   = 25000;   /* quiet time between ordinary polls           */
  var FORCE_GAP = 2500;    /* even a forced poll will not burst faster    */
  var NET_MS    = 15000;   /* one wire call's patience                    */

  var ART = {
    sealed: 'art/ui/mail-sealed.png',
    open:   'art/ui/mail-open.png',
    gift:   'art/ui/mail-gift.png',
    seal:   'art/ui/mail-seal.png'
  };

  /* ── the language line — js/lang.js's adoption contract ──────────── */
  function T(en, mt){
    try { if (global.KARTI_LANG) return KARTI_LANG.t(en, mt); } catch (e){}
    return en;
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  /* every <img> this file emits removes itself when the file is missing,
     so a lost asset can never show a broken-image glyph — the styled box
     or glyph behind it simply shows through instead */
  function img(src, cls, alt){
    return '<img class="' + cls + '" src="' + src + '" alt="' + esc(alt || '') +
           '" draggable="false" onerror="this.remove()">';
  }

  /* ── the session — the SAME localStorage keys js/sync.js owns ───────
     Read-only here: this file never writes a session, it only presents
     the token sync.js established. If there is no token there is no
     mailbox, and every network path below stays shut. */
  function activeKey(){
    try { return JSON.parse(localStorage.getItem('karti_active') || 'null'); }
    catch (e){ return null; }
  }
  function session(){
    var k = activeKey();
    if (!k) return null;
    var s = null;
    try { s = JSON.parse(localStorage.getItem('karti_sync_' + k) || 'null'); }
    catch (e){ return null; }
    if (!s || typeof s !== 'object' || typeof s.tok !== 'string' || !s.tok) return null;
    return s;
  }
  function token(){ var s = session(); return s ? s.tok : ''; }
  function acctU(){ var s = session(); return s && s.u ? String(s.u) : ''; }

  /* where the account API lives — follow js/sync.js so ?relay=… and the
     Server settings box move every account feature together */
  function base(){
    try {
      if (global.KARTI_SYNC && typeof KARTI_SYNC.baseURL === 'function'){
        var u = KARTI_SYNC.baseURL();
        if (u) return u;
      }
    } catch (e){}
    return 'https://raspberrypi.silverside-tench.ts.net:8443/karti/acct';
  }

  /* ── the wire. Never throws; an unreachable Pi, a CORS refusal and a
     500 all come back as { err, status } and the game carries on. ───── */
  function call(route, body, ms){
    var url = base() + '/' + route;
    var ctrl = null, timer = null;
    try { ctrl = new AbortController(); } catch (e){}
    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      credentials: 'omit', cache: 'no-store', mode: 'cors'
    };
    if (ctrl){
      opts.signal = ctrl.signal;
      timer = setTimeout(function (){ try { ctrl.abort(); } catch (e){} }, ms || NET_MS);
    }
    return fetch(url, opts).then(function (r){
      return r.text().then(function (t){
        var js = null;
        try { js = JSON.parse(t); } catch (e){}
        return { status: r.status, js: js || {} };
      });
    }).then(function (r){
      if (timer) clearTimeout(timer);
      if (r.status >= 200 && r.status < 300) return { ok: true, status: r.status, d: r.js };
      return { err: r.js.why || 'The server said no.', status: r.status, d: r.js };
    }).catch(function (){
      if (timer) clearTimeout(timer);
      return { err: T('Cannot reach the server right now.',
                      'Bħalissa ma nistgħux nilħqu s-server.'),
               status: 0, offline: true, d: {} };
    });
  }

  function wireError(r){
    if (r.offline) return r.err;
    if (r.status === 401) return T('Your session has expired — log in again.',
                                   'Is-sessjoni skadiet — idħol mill-ġdid.');
    if (r.status === 429) return (r.d && r.d.why) ||
      T('Too many tries. Wait a minute and go again.',
        'Wisq provi. Stenna minuta u erġa’ pprova.');
    return r.err || T('Something went wrong.', 'Xi ħaġa marret ħażin.');
  }

  /* ── state ────────────────────────────────────────────────────────── */
  var ST = {
    mail: [],          /* the unclaimed letters, newest first             */
    fetchedAt: 0,      /* when the box was last read off the relay        */
    fetchedFor: '',    /* …and for which account                          */
    busy: false,       /* one mail poll in flight at a time               */
    claiming: {}       /* letter ids with a claim on the wire RIGHT NOW   */
  };

  /* ── the paid journal — fence 3 against double credit ────────────────
     One flat map per account: { '<letterId>': 1 }. Written BEFORE the
     gift is applied, so nothing can apply the same letter twice even if
     a response were duplicated. Bounded: old ids are pruned past 200. */
  function jKey(){ return 'karti_mail_paid_' + (acctU() || String(activeKey() || '')); }
  function jRead(){
    try { return JSON.parse(localStorage.getItem(jKey()) || '{}') || {}; }
    catch (e){ return {}; }
  }
  function jHas(id){ return !!jRead()[String(id)]; }
  function jMark(id){
    try {
      var j = jRead();
      j[String(id)] = 1;
      var ks = Object.keys(j);
      if (ks.length > 200){
        ks.sort(function (a, b){ return (+a) - (+b); });
        for (var i = 0; i < ks.length - 200; i++) delete j[ks[i]];
      }
      localStorage.setItem(jKey(), JSON.stringify(j));
    } catch (e){}
  }

  /* ═══════════════════ PAYING THE GIFT INTO THE ECONOMY ═══════════════
     Everything goes through the doors the app already owns:
       coins / chips  KARTI_XP.addCoins / addChips — commit + wallet event,
                      so the home pills count up on their own;
       packs          KARTI.S.packs — the same top-level save field the
                      store and award() use (wallet() normalises it);
       xp             the progression root's xp total; level is DERIVED
                      from it on every read, so no ceremony is faked;
       excl           every piece of the set: KARTI_XP.exclusiveDefs(key)
                      lists them, KARTI_XP.grant(id) hands each one over
                      (exclusive pieces carry no `earn`, so grant accepts
                      them — see registerExclusives in js/progress.js);
       cosm           one cosmetic id through the same grant() door.
     Unknown fields are skipped in silence — a letter from a newer client
     still opens, and pays what this client understands.
     Returns the honest receipt: one line per thing that actually landed. */
  function applyGift(gift){
    var lines = [];
    if (!gift || typeof gift !== 'object') return lines;
    var XP = global.KARTI_XP || null;

    function amt(v){
      var n = Math.floor(Number(v));
      return (isFinite(n) && n > 0) ? n : 0;
    }

    var n = amt(gift.coins);
    if (n && XP && typeof XP.addCoins === 'function'){
      var rc = XP.addCoins(n, 'mail');
      if (rc && rc.ok) lines.push('+' + rc.added + ' ' + T('coins', 'muniti'));
    }
    n = amt(gift.chips);
    if (n && XP && typeof XP.addChips === 'function'){
      var rh = XP.addChips(n, 'mail');
      if (rh && rh.ok) lines.push('+' + rh.added + ' ' + T('chips', 'ċips'));
    }
    n = amt(gift.packs);
    if (n){
      try {
        if (global.KARTI && KARTI.S){
          KARTI.S.packs = Math.max(0, (KARTI.S.packs | 0) + n);
          if (typeof KARTI.save === 'function') KARTI.save();
          lines.push('+' + n + ' ' + T(n === 1 ? 'card pack' : 'card packs',
                                       n === 1 ? 'pakkett tal-karti' : 'pakketti tal-karti'));
        }
      } catch (e){}
    }
    n = amt(gift.xp);
    if (n && XP && typeof XP._state === 'function'){
      /* no public "add raw XP" verb exists; the progression root is the
         same object award() writes, and the level is recomputed from the
         total on every read, so this is a plain deposit, not a ceremony */
      try {
        var p = XP._state();
        p.xp = Math.max(0, (p.xp | 0) + n);
        if (global.KARTI && typeof KARTI.save === 'function') KARTI.save();
        lines.push('+' + n + ' XP');
      } catch (e){}
    }
    if (gift.excl != null && String(gift.excl) && XP &&
        typeof XP.grant === 'function'){
      var key = String(gift.excl);
      var defs = [];
      try { if (typeof XP.exclusiveDefs === 'function') defs = XP.exclusiveDefs(key) || []; } catch (e){}
      /* a literal set id ('excl-deck') or any other registered set name
         still lands — the letter must not be fussier than the registry */
      try {
        if (!defs.length && typeof XP.defsInSet === 'function'){
          defs = XP.defsInSet(key) || [];
          if (!defs.length) defs = XP.defsInSet('excl-' + key) || [];
        }
      } catch (e){}
      var got = 0, i;
      for (i = 0; i < defs.length; i++){
        try { var g = XP.grant(defs[i].id); if (g && g.ok) got++; } catch (e){}
      }
      if (got){
        var setName = key;
        try {
          var meta = XP.exclusive ? XP.exclusive(key) : null;
          if (meta && meta.name) setName = meta.name;
        } catch (e){}
        lines.push(esc(setName) + ' — ' + T('the whole set (' + got + ' pieces)',
                                            'is-sett sħiħ (' + got + ' biċċiet)'));
      }
    }
    if (gift.cosm != null && String(gift.cosm) && XP &&
        typeof XP.grant === 'function'){
      try {
        var cg = XP.grant(String(gift.cosm));
        if (cg && cg.ok){
          var nm = (cg.def && cg.def.name) ? cg.def.name : String(gift.cosm);
          lines.push(esc(typeof nm === 'object' ? (nm.en || String(gift.cosm)) : nm));
        }
      } catch (e){}
    }
    return lines;
  }

  /* what a still-sealed letter says it is holding — the same reader as
     applyGift, minus the paying */
  function giftPreview(gift){
    var out = [];
    if (!gift || typeof gift !== 'object') return out;
    function amt(v){ var x = Math.floor(Number(v)); return (isFinite(x) && x > 0) ? x : 0; }
    if (amt(gift.coins)) out.push(amt(gift.coins) + ' ' + T('coins', 'muniti'));
    if (amt(gift.chips)) out.push(amt(gift.chips) + ' ' + T('chips', 'ċips'));
    if (amt(gift.packs)) out.push(amt(gift.packs) + ' ' + T('packs', 'pakketti'));
    if (amt(gift.xp))    out.push(amt(gift.xp) + ' XP');
    if (gift.excl != null && String(gift.excl)){
      var nm = String(gift.excl);
      try {
        var m = global.KARTI_XP && KARTI_XP.exclusive ? KARTI_XP.exclusive(nm) : null;
        if (m && m.name) nm = m.name;
      } catch (e){}
      out.push(nm);
    }
    if (gift.cosm != null && String(gift.cosm)){
      var cn = String(gift.cosm);
      try {
        var d = global.KARTI_XP && KARTI_XP.def ? KARTI_XP.def(cn) : null;
        if (d && d.name) cn = d.name;
      } catch (e){}
      out.push(cn);
    }
    return out;
  }

  function whenAgo(at){
    try {
      if (global.KARTI_SYNC && KARTI_SYNC.whenText) return KARTI_SYNC.whenText(at);
    } catch (e){}
    return '';
  }

  /* ── the admin predicate — DRAWING rights only, see the header ────── */
  function isAdmin(){
    try {
      var XP = global.KARTI_XP;
      if (!XP) return false;
      if (typeof XP.isAdmin === 'function') return !!XP.isAdmin();
      /* the Tempesta border is earn:'admin' with a LIVE test — asking who
         owns it runs the real isAdmin() in js/progress.js, session and all */
      if (typeof XP.owns === 'function') return !!XP.owns('border.tempesta');
    } catch (e){}
    return false;
  }

  /* ═══════════════════════ POLLING THE BOX ═══════════════════════════ */
  var lastPollAt = 0;

  function refresh(force){
    var tok = token();
    if (!tok){
      if (ST.mail.length){ ST.mail = []; paintBadge(); }
      return Promise.resolve({ err: 'not-linked' });
    }
    var now = Date.now();
    var gap = force ? FORCE_GAP : MIN_GAP;
    if (ST.busy || (now - lastPollAt < gap && ST.fetchedFor === acctU()))
      return Promise.resolve({ ok: true, cached: true, mail: ST.mail });
    ST.busy = true;
    lastPollAt = now;
    return call('mail', { tok: tok }).then(function (r){
      ST.busy = false;
      if (!r.ok){
        if (r.status === 401){ ST.mail = []; paintBadge(); }
        return { err: wireError(r), status: r.status };
      }
      var list = Array.isArray(r.d.mail) ? r.d.mail : [];
      ST.mail = [];
      for (var i = 0; i < list.length; i++){
        var m = list[i];
        if (m && typeof m === 'object' && m.id != null) ST.mail.push(m);
      }
      ST.fetchedAt = Date.now();
      ST.fetchedFor = acctU();
      paintBadge();
      if (boxEl && boxMode === 'list') paintBox();
      return { ok: true, mail: ST.mail };
    });
  }

  function dropLetter(id){
    for (var i = 0; i < ST.mail.length; i++){
      if (String(ST.mail[i].id) === String(id)){ ST.mail.splice(i, 1); break; }
    }
    paintBadge();
  }

  /* ═══════════════════════ THE BADGE ══════════════════════════════════
     In-flow, inside the home header's left column, only in the DOM when
     there is mail. It reuses the .spinbadge silhouette so home keeps one
     visual language for "a small good thing is waiting for you". */
  function ensureSlot(){
    var head = document.querySelector('#scr-home .headleft');
    if (!head) return null;
    var slot = document.getElementById('kx-mail-slot');
    if (!slot){
      slot = document.createElement('div');
      slot.id = 'kx-mail-slot';
      slot.className = 'kx-mail-slot';
      head.appendChild(slot);
    }
    return slot;
  }

  function paintBadge(){
    var slot = ensureSlot();
    if (!slot) return;
    injectCSS();   /* a poll can finish before renderHome() ever hooks in —
                      the badge must never stand in the DOM unstyled */
    var n = ST.mail.length;
    if (!n){ slot.innerHTML = ''; return; }
    var label = n === 1 ? T('A letter for you!', 'Ittra għalik!')
                        : T(n + ' letters for you!', n + ' ittri għalik!');
    /* the visible line is shorter than the spoken one, so it never has to
       be ellipsised on a 360px phone */
    var brief = n === 1 ? T('A letter!', 'Ittra!') : n + ' ' + T('letters!', 'ittri!');
    slot.innerHTML =
      '<button type="button" class="kx-mailbadge" id="kx-mailbadge" aria-label="' +
        esc(label) + '">' +
        '<span class="kx-mb-art" aria-hidden="true"><span class="kx-mb-glyph">✉</span>' +
          img(ART.sealed, 'kx-mb-img', '') + '</span>' +
        '<span class="kx-mb-label">' + esc(brief) + '</span>' +
        '<span class="kx-mb-n" aria-hidden="true">' + n + '</span>' +
      '</button>';
    var b = document.getElementById('kx-mailbadge');
    if (b) b.onclick = function (){ openBox(); };
  }

  /* the one hook game.js calls at the end of renderHome() */
  function onHome(){
    injectCSS();
    paintBadge();
    refresh(false);
  }

  /* ═══════════════════════ THE MAILBOX ════════════════════════════════
     Self-contained overlay, sync.js-panel style: its own scrim, its own
     injected CSS, no helper from js/game.js — so a restyle cannot break
     it and it works even when it is the only extra module that loaded. */
  var boxEl = null, boxMode = 'list', lastFocus = null;
  var opening = null;   /* { m, phase:'sealed'|'busy'|'done'|'already'|'err',
                            lines:[], err:'' } while one letter is up      */

  function openBox(){
    injectCSS();
    boxMode = 'list';
    opening = null;
    if (!boxEl){
      lastFocus = document.activeElement;
      boxEl = document.createElement('div');
      boxEl.className = 'kx-mail-wrap';
      boxEl.setAttribute('role', 'dialog');
      boxEl.setAttribute('aria-modal', 'true');
      boxEl.setAttribute('aria-label', T('Mailbox', 'Il-Kaxxa tal-Ittri'));
      boxEl.addEventListener('click', function (e){ if (e.target === boxEl) closeBox(); });
      document.addEventListener('keydown', onBoxKey, true);
      document.body.appendChild(boxEl);
    }
    paintBox();
    refresh(true).then(function (){ if (boxEl && boxMode === 'list') paintBox(); });
  }
  function closeBox(){
    if (!boxEl) return;
    document.removeEventListener('keydown', onBoxKey, true);
    try { boxEl.remove(); } catch (e){}
    boxEl = null; opening = null;
    if (lastFocus && lastFocus.focus){ try { lastFocus.focus(); } catch (e){} }
    lastFocus = null;
  }
  function onBoxKey(e){
    if (e.key === 'Escape'){
      e.stopPropagation();
      if (boxMode === 'letter' && opening && opening.phase === 'busy') return;
      if (boxMode === 'letter'){ boxMode = 'list'; opening = null; paintBox(); }
      else closeBox();
    }
  }

  function paintBox(){
    if (!boxEl) return;
    if (boxMode === 'letter' && opening){ paintLetter(); return; }
    var h = '<div class="kx-mail-box">' +
      '<div class="kx-mail-head">' +
        '<span class="kx-mh-art" aria-hidden="true"><span class="kx-mb-glyph">✉</span>' +
          img(ART.sealed, 'kx-mh-img', '') + '</span>' +
        '<div class="kx-mh-tx"><h2>' + esc(T('Mailbox', 'Il-Kaxxa tal-Ittri')) + '</h2>' +
        '<p>' + esc(ST.mail.length
            ? (ST.mail.length === 1
                ? T('One letter, still sealed.', 'Ittra waħda, għadha ssiġillata.')
                : T(ST.mail.length + ' letters, still sealed.',
                    ST.mail.length + ' ittri, għadhom issiġillati.'))
            : T('No letters right now.', 'M’hemmx ittri bħalissa.')) + '</p></div>' +
        '<button type="button" class="kx-mail-x" data-a="close" aria-label="' +
          esc(T('Close', 'Agħlaq')) + '">×</button>' +
      '</div>';
    if (!ST.mail.length){
      h += '<div class="kx-mail-empty">' +
        img(ART.open, 'kx-me-img', '') +
        '<p>' + esc(T('When somebody sends you a gift, the letter waits for you here.',
                      'Meta xi ħadd jibgħatlek rigal, l-ittra tistenniek hawn.')) + '</p></div>';
    } else {
      h += '<div class="kx-mail-list">';
      for (var i = 0; i < ST.mail.length; i++){
        var m = ST.mail[i];
        var inside = giftPreview(m.gift);
        h += '<button type="button" class="kx-letter" data-a="open" data-id="' +
             esc(m.id) + '">' +
          '<span class="kx-lt-art" aria-hidden="true"><span class="kx-mb-glyph">✉</span>' +
            img(ART.sealed, 'kx-lt-img', '') + '</span>' +
          '<span class="kx-lt-tx">' +
            '<b>' + esc(T('From ' + (m.from || '?'), 'Mingħand ' + (m.from || '?'))) +
              (m.at ? ' <i class="kx-lt-when">· ' + esc(whenAgo(m.at)) + '</i>' : '') + '</b>' +
            (m.note ? '<span class="kx-lt-note">“' + esc(m.note) + '”</span>' : '') +
            (inside.length
              ? '<span class="kx-lt-in">' + esc(T('Inside: ', 'Fiha: ')) +
                esc(inside.join(' · ')) + '</span>' : '') +
          '</span>' +
          '<span class="kx-lt-go">' + esc(T('Open it', 'Iftaħha')) + '</span>' +
        '</button>';
      }
      h += '</div>';
    }
    h += '</div>';
    boxEl.innerHTML = h;
    boxEl.querySelector('[data-a="close"]').onclick = closeBox;
    var opens = boxEl.querySelectorAll('[data-a="open"]');
    for (var j = 0; j < opens.length; j++){
      opens[j].onclick = function (){
        var id = this.getAttribute('data-id');
        for (var k = 0; k < ST.mail.length; k++){
          if (String(ST.mail[k].id) === String(id)){
            opening = { m: ST.mail[k], phase: 'sealed', lines: [], err: '' };
            boxMode = 'letter';
            paintLetter();
            return;
          }
        }
      };
    }
  }

  /* ── one letter, opened as a MOMENT ─────────────────────────────────
     sealed  the envelope with its wax seal, the note, one red button;
     busy    the claim is on the wire — the button is dead, the seal
             holds its breath;
     done    the seal has broken, the envelope stands open, the gift box
             bursts and the receipt lines land one by one — every line a
             thing that has ALREADY been paid into the save;
     already opened on another phone before: honest, and pays nothing;
     err     the letter stays sealed and says why. */
  function paintLetter(){
    if (!boxEl || !opening) return;
    var m = opening.m, ph = opening.phase;
    var busy = ph === 'busy';
    var h = '<div class="kx-mail-box kx-letterview' +
            (ph === 'done' ? ' kx-opened' : '') + '">';
    h += '<div class="kx-mail-head"><div class="kx-mh-tx"><h2>' +
      esc(T('A letter from ' + (m.from || '?'), 'Ittra mingħand ' + (m.from || '?'))) +
      '</h2></div>' +
      '<button type="button" class="kx-mail-x" data-a="back" aria-label="' +
        esc(T('Back', 'Lura')) + '"' + (busy ? ' disabled' : '') + '>×</button></div>';

    if (ph === 'sealed' || ph === 'busy' || ph === 'err'){
      h += '<div class="kx-env kx-env-sealed">' +
        '<span class="kx-env-glyph" aria-hidden="true">✉</span>' +
        img(ART.sealed, 'kx-env-img' + (busy ? ' kx-env-wait' : ''), '') +
        '</div>';
      if (m.note) h += '<p class="kx-note">“' + esc(m.note) + '”</p>';
      var inside = giftPreview(m.gift);
      if (inside.length)
        h += '<p class="kx-inside">' + esc(T('Inside: ', 'Fiha: ')) +
             esc(inside.join(' · ')) + '</p>';
      if (ph === 'err')
        h += '<p class="kx-err">' + esc(opening.err) + '</p>';
      h += '<button type="button" class="kx-open-btn" data-a="claim"' +
           (busy ? ' disabled' : '') + '>' +
           esc(busy ? T('Breaking the seal…', 'Qed jinkiser is-siġill…')
                    : T('Break the seal', 'Ikser is-siġill')) + '</button>';
    } else if (ph === 'done'){
      h += '<div class="kx-env kx-env-open">' +
        '<span class="kx-env-glow" aria-hidden="true"></span>' +
        '<span class="kx-env-glyph" aria-hidden="true">✉</span>' +
        img(ART.open, 'kx-env-img kx-anim-open', '') +
        img(ART.seal, 'kx-seal-img kx-anim-seal', '') +
        '</div>' +
        '<div class="kx-gift kx-anim-gift">' +
          img(ART.gift, 'kx-gift-img', '') +
          '<div class="kx-gift-lines">' +
            (opening.lines.length
              ? opening.lines.map(function (l, i){
                  return '<p class="kx-gl kx-anim-line" style="animation-delay:' +
                         (0.55 + i * 0.22) + 's">' + l + '</p>';
                }).join('')
              : '<p class="kx-gl">' +
                esc(T('The letter itself — nothing this version of KARTI recognises inside.',
                      'L-ittra nnifisha — xejn ġo fiha li din il-verżjoni ta’ KARTI tagħraf.')) +
                '</p>') +
          '</div>' +
        '</div>' +
        (m.note ? '<p class="kx-note">“' + esc(m.note) + '”</p>' : '') +
        '<p class="kx-yours">' + esc(T('It is yours — already in your game.',
                                       'Tiegħek — diġà fil-logħba tiegħek.')) + '</p>' +
        '<button type="button" class="kx-open-btn" data-a="back2">' +
          esc(T('Grazzi!', 'Grazzi!')) + '</button>';
    } else { /* already */
      h += '<div class="kx-env kx-env-open">' +
        '<span class="kx-env-glyph" aria-hidden="true">✉</span>' +
        img(ART.open, 'kx-env-img', '') +
        '</div>' +
        '<p class="kx-note">' +
        esc(T('This letter was already opened — on this account, somewhere. A letter pays out once, so there is nothing more inside.',
              'Din l-ittra kienet diġà miftuħa — fuq dan il-kont, xi mkien. Ittra tħallas darba biss, mela m’hemm xejn iżjed ġo fiha.')) +
        '</p>' +
        '<button type="button" class="kx-open-btn" data-a="back2">' +
          esc(T('All right', 'Orrajt')) + '</button>';
    }
    h += '</div>';
    boxEl.innerHTML = h;

    var back = boxEl.querySelector('[data-a="back"]');
    if (back) back.onclick = function (){
      if (opening && opening.phase === 'busy') return;
      boxMode = 'list'; opening = null; paintBox();
    };
    var back2 = boxEl.querySelector('[data-a="back2"]');
    if (back2) back2.onclick = function (){
      boxMode = 'list'; opening = null;
      if (ST.mail.length) paintBox(); else closeBox();
    };
    var cl = boxEl.querySelector('[data-a="claim"]');
    if (cl) cl.onclick = function (){ claimNow(); };
  }

  /* the claim itself — all three double-pay fences live here */
  function claimNow(){
    if (!opening || opening.phase === 'busy') return;
    var m = opening.m, id = m.id;
    if (ST.claiming[id]) return;                      /* fence 2: single flight */
    var tok = token();
    if (!tok){
      opening.phase = 'err';
      opening.err = T('You are signed out — log in again to open it.',
                      'Int barra — idħol mill-ġdid biex tiftaħha.');
      paintLetter();
      return;
    }
    /* if the economy is not up there is nowhere to PUT the gift; refuse
       to claim rather than mark the letter opened and pay nothing */
    if (!global.KARTI_XP){
      opening.phase = 'err';
      opening.err = T('The game has not finished loading — try again in a moment.',
                      'Il-logħba għadha qed titla’ — erġa’ pprova fi ftit.');
      paintLetter();
      return;
    }
    ST.claiming[id] = 1;
    opening.phase = 'busy';
    paintLetter();
    call('claim', { tok: tok, id: id }).then(function (r){
      delete ST.claiming[id];
      if (!boxEl || !opening || String(opening.m.id) !== String(id)){
        /* the view moved on; still honour a successful claim so the
           letter cannot be offered again */
        if (r.ok){
          dropLetter(id);
          if (!r.d.already && !jHas(id)){ jMark(id); applyGift(r.d.gift); }
        }
        return;
      }
      if (!r.ok){
        opening.phase = 'err';
        opening.err = wireError(r);
        if (r.status === 404){
          /* the letter is gone (claimed elsewhere, then pruned): say so
             and take it off the shelf */
          dropLetter(id);
          opening.err = T('That letter is not in your box any more.',
                          'Dik l-ittra m’għadhiex fil-kaxxa tiegħek.');
        }
        paintLetter();
        return;
      }
      dropLetter(id);
      if (r.d.already){                               /* fence 1: the server */
        opening.phase = 'already';
        paintLetter();
        return;
      }
      if (jHas(id)){                                  /* fence 3: the journal */
        opening.phase = 'already';
        paintLetter();
        return;
      }
      jMark(id);                 /* written BEFORE paying — see the header */
      opening.lines = applyGift(r.d.gift || {});
      opening.phase = 'done';
      paintLetter();
    });
  }

  /* ═══════════════════ THE OWNER'S SEND CONSOLE ═══════════════════════
     Drawn only for the admin account — and that is ALL the client check
     does. The permission is the server's: the gift route replies 403 to
     anybody else no matter what this file draws. */
  var sendEl = null, sendBusy = false, sendMsg = null; /* {cls:'ok'|'err', text} */

  function settingsRowHTML(){
    if (!isAdmin()) return '';
    return '<p class="setgrp">' + esc(T('Mailbox', 'Il-Kaxxa tal-Ittri')) + '</p>' +
      '<div class="setlist">' +
        '<button class="setrow" id="st-mail-send" type="button">' +
          '<span class="sl"><b>' + esc(T('Send a player a gift', 'Ibgħat rigal lil plejer')) +
          '</b><small>' +
          esc(T('A sealed letter lands in their mailbox — coins, chips, packs, XP or a set.',
                'Ittra ssiġillata tasal fil-kaxxa tagħhom — muniti, ċips, pakketti, XP jew sett.')) +
          '</small></span><span class="setval">✉</span>' +
        '</button>' +
      '</div>';
  }
  function bindSettings(){
    var b = document.getElementById('st-mail-send');
    if (b) b.onclick = function (){
      try { if (global.KARTI && KARTI.closeSheet) KARTI.closeSheet(); } catch (e){}
      openSend();
    };
  }

  function exclOptions(){
    var out = [], XP = global.KARTI_XP;
    try {
      if (XP && XP.exclusiveGames){
        var gs = XP.exclusiveGames();
        for (var i = 0; i < gs.length; i++){
          var m = XP.exclusive ? XP.exclusive(gs[i]) : null;
          out.push({ key: gs[i], name: (m && m.name) ? m.name : gs[i] });
        }
      }
    } catch (e){}
    return out;
  }

  function openSend(){
    injectCSS();
    sendMsg = null; sendBusy = false;
    if (!sendEl){
      sendEl = document.createElement('div');
      sendEl.className = 'kx-mail-wrap kx-send-wrap';
      sendEl.setAttribute('role', 'dialog');
      sendEl.setAttribute('aria-modal', 'true');
      sendEl.setAttribute('aria-label', T('Send a gift', 'Ibgħat rigal'));
      sendEl.addEventListener('click', function (e){ if (e.target === sendEl) closeSend(); });
      document.addEventListener('keydown', onSendKey, true);
      document.body.appendChild(sendEl);
    }
    paintSend();
  }
  function closeSend(){
    if (!sendEl) return;
    document.removeEventListener('keydown', onSendKey, true);
    try { sendEl.remove(); } catch (e){}
    sendEl = null;
  }
  function onSendKey(e){ if (e.key === 'Escape'){ e.stopPropagation(); closeSend(); } }

  function paintSend(){
    if (!sendEl) return;
    var opts = exclOptions();
    var h = '<div class="kx-mail-box kx-send-box">' +
      '<div class="kx-mail-head">' +
        '<span class="kx-mh-art" aria-hidden="true"><span class="kx-mb-glyph">🎁</span>' +
          img(ART.gift, 'kx-mh-img', '') + '</span>' +
        '<div class="kx-mh-tx"><h2>' + esc(T('Send a gift', 'Ibgħat rigal')) + '</h2>' +
        '<p>' + esc(T('It arrives as a sealed letter in their mailbox, whichever phone they open next.',
                      'Tasal bħala ittra ssiġillata fil-kaxxa tagħhom, fuq liema telefown jiftħu jmiss.')) +
        '</p></div>' +
        '<button type="button" class="kx-mail-x" data-a="close" aria-label="' +
          esc(T('Close', 'Agħlaq')) + '">×</button>' +
      '</div>' +
      '<label class="kx-lab" for="kx-g-to">' +
        esc(T('To (their account name)', 'Lil min (l-isem tal-kont)')) + '</label>' +
      '<input class="kx-inp" id="kx-g-to" maxlength="16" autocapitalize="off" ' +
        'autocorrect="off" spellcheck="false">' +
      '<label class="kx-lab" for="kx-g-note">' + esc(T('Note', 'Nota')) + '</label>' +
      '<textarea class="kx-inp kx-ta" id="kx-g-note" maxlength="240" rows="2" ' +
        'placeholder="' + esc(T('Grazzi ħi…', 'Grazzi ħi…')) + '"></textarea>' +
      '<div class="kx-grid">' +
        '<span><label class="kx-lab" for="kx-g-coins">' + esc(T('Coins', 'Muniti')) +
          '</label><input class="kx-inp" id="kx-g-coins" type="number" min="0" step="1" inputmode="numeric"></span>' +
        '<span><label class="kx-lab" for="kx-g-chips">' + esc(T('Chips', 'Ċips')) +
          '</label><input class="kx-inp" id="kx-g-chips" type="number" min="0" step="1" inputmode="numeric"></span>' +
        '<span><label class="kx-lab" for="kx-g-packs">' + esc(T('Packs', 'Pakketti')) +
          '</label><input class="kx-inp" id="kx-g-packs" type="number" min="0" step="1" inputmode="numeric"></span>' +
        '<span><label class="kx-lab" for="kx-g-xp">XP' +
          '</label><input class="kx-inp" id="kx-g-xp" type="number" min="0" step="1" inputmode="numeric"></span>' +
      '</div>' +
      '<label class="kx-lab" for="kx-g-excl">' +
        esc(T('Exclusive set (the whole set)', 'Sett esklussiv (is-sett sħiħ)')) + '</label>' +
      '<select class="kx-inp" id="kx-g-excl"><option value="">' +
        esc(T('— none —', '— xejn —')) + '</option>' +
        opts.map(function (o){
          return '<option value="' + esc(o.key) + '">' + esc(o.name) + '</option>';
        }).join('') +
      '</select>' +
      (sendMsg
        ? '<p class="' + (sendMsg.cls === 'ok' ? 'kx-ok' : 'kx-err') + '" role="alert">' +
          esc(sendMsg.text) + '</p>'
        : '') +
      '<button type="button" class="kx-open-btn" data-a="send"' +
        (sendBusy ? ' disabled' : '') + '>' +
        esc(sendBusy ? T('Sending…', 'Qed tintbagħat…') : T('Send it', 'Ibgħatha')) +
      '</button>' +
      '<p class="kx-fine">' +
      esc(T('The server has the final say on who may send — this button only asks.',
            'Is-server għandu l-aħħar kelma fuq min jista’ jibgħat — dan il-buttun jitlob biss.')) +
      '</p>' +
    '</div>';
    sendEl.innerHTML = h;
    sendEl.querySelector('[data-a="close"]').onclick = closeSend;
    sendEl.querySelector('[data-a="send"]').onclick = doSend;
  }

  function doSend(){
    if (sendBusy || !sendEl) return;
    function val(id){ var n = sendEl.querySelector('#' + id); return n ? n.value : ''; }
    function num(id){
      var x = Math.floor(Number(val(id)));
      return (isFinite(x) && x > 0) ? x : 0;
    }
    var to = String(val('kx-g-to') || '').trim();
    var note = String(val('kx-g-note') || '').slice(0, 240);
    var gift = {};
    if (num('kx-g-coins')) gift.coins = num('kx-g-coins');
    if (num('kx-g-chips')) gift.chips = num('kx-g-chips');
    if (num('kx-g-packs')) gift.packs = num('kx-g-packs');
    if (num('kx-g-xp'))    gift.xp    = num('kx-g-xp');
    var ex = val('kx-g-excl');
    if (ex) gift.excl = ex;

    if (!to){
      sendMsg = { cls: 'err', text: T('Who is it for? Type their account name.',
                                      'Għal min hi? Ikteb l-isem tal-kont.') };
      return paintSend();
    }
    if (!Object.keys(gift).length){
      sendMsg = { cls: 'err', text: T('The gift is empty — put something in it.',
                                      'Ir-rigal vojt — poġġi xi ħaġa ġo fih.') };
      return paintSend();
    }
    var tok = token();
    if (!tok){
      sendMsg = { cls: 'err', text: T('You are signed out — log in first.',
                                      'Int barra — idħol l-ewwel.') };
      return paintSend();
    }
    sendBusy = true; sendMsg = null;
    paintSend();
    call('gift', { tok: tok, to: to, gift: gift, note: note }).then(function (r){
      sendBusy = false;
      if (r.ok){
        sendMsg = { cls: 'ok',
          text: T('Delivered. The letter is waiting in ' + to + '’s mailbox (no. ' +
                    r.d.id + ').',
                  'Waslet. L-ittra qed tistenna fil-kaxxa ta’ ' + to + ' (nru. ' +
                    r.d.id + ').') };
        paintSend();
        /* the form keeps the recipient (he often sends twice); the gift
           fields are cleared so the same parcel cannot be re-sent by an
           accidental second tap */
        var keep = to;
        var ids = ['kx-g-coins', 'kx-g-chips', 'kx-g-packs', 'kx-g-xp', 'kx-g-note'];
        for (var i = 0; i < ids.length; i++){
          var n = sendEl.querySelector('#' + ids[i]);
          if (n) n.value = '';
        }
        var sel = sendEl.querySelector('#kx-g-excl');
        if (sel) sel.value = '';
        var toIn = sendEl.querySelector('#kx-g-to');
        if (toIn) toIn.value = keep;
        return;
      }
      /* the misspelled name is the mistake that actually happens, so it
         gets the loudest, plainest sentence of the lot */
      if (r.status === 404)
        sendMsg = { cls: 'err',
          text: T('NO PLAYER CALLED “' + to + '” ON THE SERVER — nothing was sent. ' +
                    'Check the spelling of their account name.',
                  'ĦADD JISMU “' + to + '” FUQ IS-SERVER — ma ntbagħat xejn. ' +
                    'Iċċekkja kif miktub l-isem tal-kont.') };
      else if (r.status === 403)
        sendMsg = { cls: 'err',
          text: T('The server says this account may not send gifts.',
                  'Is-server jgħid li dan il-kont ma jistax jibgħat rigali.') };
      else if (r.status === 409)
        sendMsg = { cls: 'err',
          text: T('Their mailbox is full — they have to open some letters first.',
                  'Il-kaxxa tagħhom mimlija — iridu jiftħu xi ittri l-ewwel.') };
      else if (r.status === 400)
        sendMsg = { cls: 'err', text: (r.d && r.d.why) ||
          T('The server refused that gift.', 'Is-server irrifjuta dak ir-rigal.') };
      else
        sendMsg = { cls: 'err', text: wireError(r) };
      paintSend();
      /* restore what they typed — a refused send must cost no retyping */
      var back = sendEl.querySelector('#kx-g-to');
      if (back && !back.value) back.value = to;
    });
  }

  /* ═══════════════════════ THE LOOK ═══════════════════════════════════
     Injected once. KARTI's festa language — deep plum surfaces, painted
     gold, crimson for the one hot action — and every animation is turned
     off under prefers-reduced-motion / body.reduced. */
  var cssDone = false;
  function injectCSS(){
    if (cssDone || !document.head) return;
    cssDone = true;
    var s = document.createElement('style');
    s.id = 'kx-mail-css';
    s.textContent =
    /* the badge, in-flow under the profile chip */
    '.kx-mail-slot{display:flex}.kx-mail-slot:empty{display:none}' +
    '.kx-mailbadge{position:relative;display:inline-flex;align-items:center;gap:7px;' +
      'padding:5px 12px 5px 5px;border-radius:99px;cursor:pointer;max-width:100%;' +
      'background:radial-gradient(120% 160% at 16% 50%,rgba(255,197,66,.30),transparent 62%),' +
        'linear-gradient(180deg,#241A3E,#160F28);' +
      'border:1px solid rgba(255,197,66,.55);' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 4px 14px -6px rgba(255,197,66,.7);' +
      'color:#FFE9B0;font-family:system-ui,-apple-system,sans-serif;' +
      'font-weight:900;font-size:12px;letter-spacing:.04em;white-space:nowrap;' +
      'transition:transform .12s ease}' +
    '.kx-mailbadge:active{transform:scale(.96)}' +
    '.kx-mailbadge{animation:kxMailGlow 2.4s ease-in-out infinite}' +
    '@keyframes kxMailGlow{0%,100%{box-shadow:inset 0 1px 0 rgba(255,255,255,.12),' +
      '0 3px 10px -6px rgba(255,197,66,.5)}50%{box-shadow:inset 0 1px 0 rgba(255,255,255,.14),' +
      '0 5px 16px -5px rgba(255,197,66,.95)}}' +
    '.kx-mb-art{position:relative;flex:0 0 auto;width:26px;height:26px;border-radius:50%;' +
      'display:inline-flex;align-items:center;justify-content:center;overflow:hidden;' +
      'background:radial-gradient(circle at 35% 30%,#3A2B5E,#1B1430)}' +
    '.kx-mb-glyph{font-size:13px;line-height:1;color:#FFC542}' +
    '.kx-mb-img{position:absolute;inset:1px;width:24px;height:24px;object-fit:contain}' +
    '.kx-mb-label{line-height:1;overflow:hidden;text-overflow:ellipsis}' +
    '.kx-mb-n{flex:0 0 auto;min-width:17px;height:17px;padding:0 4px;border-radius:99px;' +
      'background:#C8102E;color:#fff;font-size:11px;line-height:17px;text-align:center;' +
      'box-shadow:0 1px 4px rgba(0,0,0,.5)}' +

    /* the overlay shell (mailbox + send console) */
    '.kx-mail-wrap{position:fixed;inset:0;z-index:9950;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(8,5,16,.74);padding:16px;' +
      'padding-bottom:calc(16px + env(safe-area-inset-bottom,0px));' +
      '-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}' +
    '.kx-mail-box{width:100%;max-width:420px;max-height:88vh;overflow:auto;' +
      'overflow-x:hidden;box-sizing:border-box;' +
      'background:linear-gradient(180deg,#241A3E,#140D26 55%,#10091E);color:#F4EFFF;' +
      'border:1px solid rgba(255,197,66,.34);border-radius:18px;padding:16px;' +
      'box-shadow:0 24px 60px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.06);' +
      'font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
    '.kx-mail-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}' +
    '.kx-mh-art{position:relative;flex:0 0 auto;width:44px;height:44px;border-radius:12px;' +
      'display:flex;align-items:center;justify-content:center;overflow:hidden;' +
      'background:radial-gradient(circle at 35% 30%,#3A2B5E,#1B1430);' +
      'box-shadow:0 2px 8px rgba(0,0,0,.5)}' +
    '.kx-mh-art .kx-mb-glyph{font-size:20px}' +
    '.kx-mh-img{position:absolute;inset:2px;width:40px;height:40px;object-fit:contain}' +
    '.kx-mh-tx{flex:1 1 auto;min-width:0}' +
    '.kx-mh-tx h2{margin:0;font-size:18px;font-weight:900;letter-spacing:.02em}' +
    '.kx-mh-tx p{margin:2px 0 0;font-size:12.5px;color:#A093C4}' +
    '.kx-mail-x{flex:0 0 auto;width:32px;height:32px;border-radius:9px;border:0;' +
      'cursor:pointer;background:rgba(255,255,255,.07);color:#A093C4;font-size:19px;' +
      'line-height:1}' +
    '.kx-mail-x:disabled{opacity:.4}' +

    /* the list */
    '.kx-mail-list{display:flex;flex-direction:column;gap:8px}' +
    '.kx-letter{display:flex;align-items:center;gap:10px;width:100%;text-align:left;' +
      'box-sizing:border-box;padding:10px;border-radius:14px;cursor:pointer;' +
      'background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.02));' +
      'border:1px solid rgba(255,197,66,.22);color:#F4EFFF;' +
      'font:inherit}' +
    '.kx-letter:active{transform:scale(.985)}' +
    '.kx-lt-art{position:relative;flex:0 0 auto;width:46px;height:46px;display:flex;' +
      'align-items:center;justify-content:center}' +
    '.kx-lt-art .kx-mb-glyph{font-size:22px}' +
    '.kx-lt-img{position:absolute;inset:0;width:46px;height:46px;object-fit:contain;' +
      'filter:drop-shadow(0 3px 6px rgba(0,0,0,.5))}' +
    '.kx-lt-tx{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}' +
    '.kx-lt-tx b{font-size:13.5px;font-weight:800}' +
    '.kx-lt-when{font-style:normal;font-weight:400;font-size:11px;color:#A093C4}' +
    '.kx-lt-note{font-size:12px;color:#CBBFE8;white-space:nowrap;overflow:hidden;' +
      'text-overflow:ellipsis}' +
    '.kx-lt-in{font-size:11.5px;color:#FFC542;white-space:nowrap;overflow:hidden;' +
      'text-overflow:ellipsis}' +
    '.kx-lt-go{flex:0 0 auto;padding:7px 11px;border-radius:10px;font-size:12px;' +
      'font-weight:800;color:#2A1B00;background:linear-gradient(180deg,#FFE9B0,#FFC542);' +
      'box-shadow:0 3px 10px rgba(255,197,66,.3)}' +
    '.kx-mail-empty{text-align:center;padding:8px 6px 4px}' +
    '.kx-me-img{width:96px;height:96px;object-fit:contain;opacity:.5;' +
      'filter:grayscale(.4)}' +
    '.kx-mail-empty p{margin:6px 0 0;font-size:13px;color:#A093C4}' +

    /* one letter, opened */
    '.kx-letterview{text-align:center}' +
    '.kx-env{position:relative;width:170px;height:170px;margin:2px auto 6px;' +
      'display:flex;align-items:center;justify-content:center}' +
    '.kx-env-glyph{font-size:64px;color:#FFC542;opacity:.6}' +
    '.kx-env-img{position:absolute;inset:0;width:170px;height:170px;object-fit:contain;' +
      'filter:drop-shadow(0 8px 18px rgba(0,0,0,.55))}' +
    '.kx-env-wait{animation:kxEnvWait 1.1s ease-in-out infinite}' +
    '@keyframes kxEnvWait{0%,100%{transform:rotate(-1.6deg) scale(1)}' +
      '50%{transform:rotate(1.6deg) scale(1.03)}}' +
    '.kx-env-glow{position:absolute;inset:-18%;border-radius:50%;pointer-events:none;' +
      'background:radial-gradient(circle,rgba(255,220,120,.45),rgba(255,197,66,.12) 55%,transparent 72%);' +
      'animation:kxGlow .9s ease-out both}' +
    '@keyframes kxGlow{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}' +
    '.kx-anim-open{animation:kxOpenPop .55s cubic-bezier(.22,1.2,.36,1) both}' +
    '@keyframes kxOpenPop{from{opacity:0;transform:scale(.72) translateY(14px)}' +
      'to{opacity:1;transform:scale(1) translateY(0)}}' +
    '.kx-seal-img{position:absolute;left:50%;top:50%;width:64px;height:64px;' +
      'margin:-32px 0 0 -32px;object-fit:contain;pointer-events:none;' +
      'animation:kxSealBreak .8s ease-in .1s both}' +
    '@keyframes kxSealBreak{0%{opacity:1;transform:scale(1) rotate(0)}' +
      '35%{opacity:1;transform:scale(1.25) rotate(-14deg)}' +
      '100%{opacity:0;transform:scale(.4) rotate(38deg) translateY(70px)}}' +
    '.kx-gift{display:flex;align-items:center;gap:10px;margin:4px auto 2px;' +
      'max-width:340px;text-align:left;padding:10px;border-radius:14px;' +
      'background:linear-gradient(180deg,rgba(255,197,66,.12),rgba(255,197,66,.04));' +
      'border:1px solid rgba(255,197,66,.35)}' +
    '.kx-anim-gift{animation:kxGiftUp .5s ease-out .35s both}' +
    '@keyframes kxGiftUp{from{opacity:0;transform:translateY(16px)}' +
      'to{opacity:1;transform:translateY(0)}}' +
    '.kx-gift-img{flex:0 0 auto;width:64px;height:64px;object-fit:contain;' +
      'filter:drop-shadow(0 4px 10px rgba(0,0,0,.5))}' +
    '.kx-gift-lines{flex:1 1 auto;min-width:0}' +
    '.kx-gl{margin:2px 0;font-size:15px;font-weight:800;color:#FFE9B0}' +
    '.kx-anim-line{animation:kxLine .4s ease-out both}' +
    '@keyframes kxLine{from{opacity:0;transform:translateX(10px)}' +
      'to{opacity:1;transform:translateX(0)}}' +
    '.kx-note{margin:8px auto 0;max-width:320px;font-size:13.5px;color:#CBBFE8;' +
      'font-style:italic}' +
    '.kx-inside{margin:6px auto 0;font-size:12.5px;color:#FFC542}' +
    '.kx-yours{margin:8px 0 0;font-size:12.5px;color:#A093C4}' +
    '.kx-open-btn{display:block;width:100%;box-sizing:border-box;margin-top:12px;' +
      'padding:13px;border-radius:12px;border:0;cursor:pointer;' +
      'background:linear-gradient(180deg,#E63950,#C8102E);color:#fff;' +
      'font:800 15px/1 system-ui,-apple-system,sans-serif;letter-spacing:.02em;' +
      'box-shadow:0 4px 14px rgba(200,16,46,.4)}' +
    '.kx-open-btn:disabled{opacity:.55;cursor:default}' +
    '.kx-open-btn:not(:disabled):active{transform:translateY(1px)}' +

    /* the send console */
    '.kx-send-wrap{z-index:9960}' +
    '.kx-lab{display:block;margin:9px 2px 4px;font-size:12px;color:#A093C4;' +
      'text-align:left}' +
    '.kx-inp{width:100%;box-sizing:border-box;padding:10px 11px;border-radius:10px;' +
      'border:1px solid rgba(255,197,66,.28);background:#0F0A1E;color:#F4EFFF;' +
      'font:15px system-ui,-apple-system,sans-serif}' +
    '.kx-ta{resize:vertical}' +
    'select.kx-inp{appearance:auto;-webkit-appearance:auto}' +
    '.kx-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}' +
    '.kx-grid .kx-lab{margin-top:7px}' +
    '.kx-ok{margin:10px 0 0;padding:9px 11px;border-radius:10px;background:#12281d;' +
      'border:1px solid #245c3a;color:#b6f0cd;font-size:13px;text-align:left}' +
    '.kx-err{margin:10px 0 0;padding:9px 11px;border-radius:10px;background:#3a1620;' +
      'border:1px solid #7a2438;color:#ffc9d3;font-size:13px;font-weight:700;' +
      'text-align:left}' +
    '.kx-fine{margin:8px 0 0;font-size:11px;color:#7d6fa3;text-align:center}' +

    /* small phones: keep the ceremony inside 360px with room to breathe */
    '@media (max-width:380px){' +
      '.kx-env{width:136px;height:136px}.kx-env-img{width:136px;height:136px}' +
      '.kx-mb-label{max-width:118px}}' +

    /* stillness is a setting, and it is honoured everywhere */
    '@media (prefers-reduced-motion:reduce){' +
      '.kx-mailbadge,.kx-env-wait,.kx-env-glow,.kx-anim-open,.kx-seal-img,' +
      '.kx-anim-gift,.kx-anim-line{animation:none!important}' +
      '.kx-seal-img{opacity:0}}' +
    'body.reduced .kx-mailbadge,body.reduced .kx-env-wait,body.reduced .kx-env-glow,' +
    'body.reduced .kx-anim-open,body.reduced .kx-seal-img,body.reduced .kx-anim-gift,' +
    'body.reduced .kx-anim-line{animation:none!important}' +
    'body.reduced .kx-seal-img{opacity:0}';
    document.head.appendChild(s);
  }

  /* ═══════════════════════ WIRING ═════════════════════════════════════
     Sign-in and coming-back-to-the-app are the only spontaneous polls.
     No timers. */
  var wasLinked = null;
  function watchSync(){
    try {
      if (global.KARTI_SYNC && typeof KARTI_SYNC.onChange === 'function'){
        KARTI_SYNC.onChange(function (st){
          var linked = !!(st && st.linked);
          if (linked && wasLinked === false) refresh(true);       /* fresh sign-in */
          if (!linked && wasLinked){ ST.mail = []; paintBadge(); }/* signed out    */
          if (wasLinked === null && linked) refresh(true);        /* booted linked */
          wasLinked = linked;
        });
        return true;
      }
    } catch (e){}
    return false;
  }
  if (!watchSync()){
    /* sync.js was not up yet (load order is not this file's business);
       try again once the page settles */
    setTimeout(watchSync, 2000);
  }
  document.addEventListener('visibilitychange', function (){
    if (!document.hidden) refresh(false);
  });
  /* one look shortly after boot for a device that was already signed in
     before sync.js ever fired a change */
  setTimeout(function (){ if (token()) refresh(true); }, 2500);

  /* repaint on a language switch — only what is actually up */
  try {
    if (global.KARTI_LANG && KARTI_LANG.onChange){
      KARTI_LANG.onChange(function (){
        paintBadge();
        if (boxEl) paintBox();
        if (sendEl) paintSend();
      });
    }
  } catch (e){}

  /* ── export ───────────────────────────────────────────────────────── */
  var api = {
    _impl: 1,
    _contract: 'gift|mail|claim',

    /* game.js's two hooks — everything else is this file's own */
    onHome: onHome,                       /* end of renderHome()           */
    settingsRowHTML: settingsRowHTML,     /* '' unless the admin is drawn  */
    bindSettings: bindSettings,

    open: openBox,                        /* the mailbox                   */
    openSend: openSend,                   /* the owner's console           */
    refresh: refresh,                     /* poll (throttled; force=true)  */
    count: function (){ return ST.mail.length; },
    isAdmin: isAdmin,                     /* drawing rights, nothing more  */

    /* for the headless verification harness only */
    _call: call,
    _applyGift: applyGift,
    _giftPreview: giftPreview,
    _state: function (){ return ST; },
    _journal: { has: jHas, mark: jMark, key: jKey }
  };

  global.KARTI_MAIL = api;

})(typeof window !== 'undefined' ? window : this);
