/* ═══════════════════════════════════════════════════════════════════════════
   KARTI — cloud save (js/sync.js)
   ───────────────────────────────────────────────────────────────────────────
   ONE JOB
     Let a player log in on a DIFFERENT phone and find their cards, their decks
     and their story progress waiting for them.

   WHERE IT LIVES
     On Terence's Raspberry Pi — the same little machine that already relays
     online duels — published over HTTPS by Tailscale Funnel. Not GitHub, not a
     cloud provider. That is a deliberate choice and the UI says so in plain
     words: writing to GitHub from a public page would mean shipping a GitHub
     token inside the page, and anyone could read it out and write to every one
     of his repositories.

   THE RULE THIS FILE WILL NOT BREAK
     KARTI is offline-first and stays offline-first. Nothing in here is ever on
     the critical path of playing. Every network call is wrapped, every failure
     is swallowed into a status string, and a player with no account, no signal
     or a switched-off Pi gets exactly the game they have today. Sync is an
     addition. It is never a dependency.

   THE OTHER RULE
     Never lose a collection. Two phones both play offline and both come home
     with progress the other has not seen. This file NEVER guesses which one
     wins. It detects the divergence, shows the player both — cards, coins,
     decks, story, when — and makes them choose. Before it ever overwrites the
     local save it takes a local backup that can be restored from the panel.

   HOW IT TALKS TO THE GAME
     Only through localStorage keys that js/game.js already owns
     ('karti_active', 'karti_save_<profile>') and through window.KARTI.load().
     Both are behind KARTI_SYNC.adapter so they can be repointed without
     touching this file. It reads and writes the save as an opaque STRING, so
     it never has to know what a card is.

   PUBLIC API — window.KARTI_SYNC
     attach(localKey)      bind to a local profile (call after login/boot)
     detach()              unbind (call on logout)
     rekey(old, new)       carry a session across upgradeGuest()
     status()              plain object, safe to render
     onChange(fn)          called whenever status() changes
     available()           is a server address configured at all
     reachable()           Promise<bool> — is the Pi answering right now
     register(user, pass)  Promise<{ok}|{err}>
     login(user, pass)     Promise<{ok}|{err}>
     requestReset(user)    Promise — "tell Terence I am locked out". Carries no
                           secret either way and answers the same for a real
                           account and an invented one, on purpose.
     resetPassword(user, code, pass)
                           Promise<{ok}|{err}> — spend a code Terence sent by
                           hand. NO ROUTE ON THE SERVER CAN ISSUE ONE; a code
                           is minted by a command on the Pi and delivered out
                           of band, which is the whole reason this is safe on
                           a public address. One message for every refusal.
     signOut()            Promise — ends the session, touches no local save
     syncNow(opts)         Promise — pull, compare, push or ask
     push(opts) / pull(opts)
     notifySaved()         debounced auto-push; call at the end of game save()
     openPanel()           the whole account UI, self-contained, no CSS needed
     restoreBackup()       put back the local save that a "use the cloud copy"
                           replaced
     TEXT                  every user-facing string, in one object
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
'use strict';

/* ═══════════════════════════════════════════════════════════════════
   THE ONE THING YOU CHANGE IF THE SERVER MOVES
   Keep it in step with RELAY_URL at the top of js/mp.js.
   ═══════════════════════════════════════════════════════════════════ */
var ACCT_URL = 'https://raspberrypi.silverside-tench.ts.net:8443/karti/acct';
var DEV_PORT = 8101;            /* page served over plain http -> same machine */
/* ═══════════════════════════════════════════════════════════════════ */

var PW_MIN      = 6;            /* real characters the player must type */
var NAME_RE     = /^[A-Za-z0-9_ .\-]{1,16}$/;   /* must match the server's rule */
var NET_MS      = 20000;        /* a login runs a slow KDF on a Pi; be patient */
var PUSH_DEBOUNCE = 6000;       /* quiet time after a save before uploading */
var PUSH_MIN_GAP  = 20000;      /* never upload more often than this */

/* ─────────────────────────── SHA-256 ───────────────────────────
   Self-contained on purpose: this file must not depend on load order, and the
   pre-hash below has to produce the SAME string on every device forever.
   Used for two things, neither of which is "security by itself":
     1. the password never leaves the phone in the clear, so the Pi never holds
        a password a player may have reused elsewhere. The SERVER hashes what
        it receives again, slowly and salted — see server/karti_server.py;
     2. a cheap, collision-free "has this save changed?" fingerprint.          */
var SHA256 = (function () {
  var K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  function rr(x, n){ return (x >>> n) | (x << (32 - n)); }
  return function (str) {
    var utf = unescape(encodeURIComponent(String(str)));
    var len = utf.length;
    var withPad = (((len + 8) >> 6) + 1) << 4;
    var w = new Uint32Array(withPad), i, j;
    for (i = 0; i < len; i++) w[i >> 2] |= utf.charCodeAt(i) << ((3 - (i & 3)) * 8);
    w[len >> 2] |= 0x80 << ((3 - (len & 3)) * 8);
    w[withPad - 1] = len * 8;
    var H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
                             0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    var m = new Uint32Array(64);
    for (i = 0; i < withPad; i += 16) {
      for (j = 0; j < 16; j++) m[j] = w[i + j];
      for (j = 16; j < 64; j++) {
        var s0 = rr(m[j-15],7) ^ rr(m[j-15],18) ^ (m[j-15] >>> 3);
        var s1 = rr(m[j-2],17) ^ rr(m[j-2],19) ^ (m[j-2] >>> 10);
        m[j] = (m[j-16] + s0 + m[j-7] + s1) >>> 0;
      }
      var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
      for (j = 0; j < 64; j++) {
        var S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[j] + m[j]) >>> 0;
        var S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22);
        var mj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + mj) >>> 0;
        h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
      }
      H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
      H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
    }
    var out = '';
    for (i = 0; i < 8; i++) out += ('00000000' + H[i].toString(16)).slice(-8);
    return out;
  };
})();

/* The credential that actually travels. Salted with the account name so the
   same password on two accounts does not produce the same string, and tagged
   with a version so it can be changed later without breaking old accounts.
   NEVER change this without a migration — every existing password depends on
   it byte for byte. */
function credential(userKey, password) {
  return SHA256('karti-acct-v1|' + userKey + '|' + password);
}

/* The bilingual helper the rest of the app uses (js/lang.js). Resolved at
   DISPLAY time, never at load time, so switching language repaints correctly.
   Falls back to English if lang.js has not loaded — this file depends on
   nothing. */
function T(en, mt) {
  try { if (window.KARTI_LANG && KARTI_LANG.t) return KARTI_LANG.t(en, mt); }
  catch (e) {}
  return en;
}

/* ─────────────────────────── user-facing copy ───────────────────────────
   All of it here, in one place, and all of it honest. */
var TEXT = {
  what:      'Cloud save keeps your cards, decks, coins and story on Terence’s ' +
             'Raspberry Pi, so you can log in on another phone and carry on where ' +
             'you left off.',
  whereFrom: 'It is his own little machine at home — not Google, not GitHub. ' +
             'If it is switched off, logging in and syncing will not work. ' +
             'The game itself keeps working perfectly with no internet at all.',
  offlineOk: 'No account? Nothing changes. KARTI plays offline exactly as it does now.',
  linked:    'Signed in — this device is backed up.',
  notLinked: 'Not signed in — this device only.',
  unreachable: 'Cannot reach the server right now. Your game is safe on this device; ' +
             'it will sync itself when the server is back.',
  syncing:   'Syncing…',
  synced:    'Everything is up to date.',
  pushed:    'Saved to the cloud.',
  pulled:    'Loaded from the cloud.',
  /* Shown after a normal both-sides-moved sync: the two games were joined, so
     nothing was lost and there is nothing to decide. Resolved bilingually at
     display time by mergedText() below (EN / Malti). */
  mergedEn:  'This device and the cloud were joined — nothing was lost. ' +
             'Everything is up to date.',
  mergedMt:  'Dan l-apparat u l-cloud ingħaqdu — ma ntilef xejn. ' +
             'Kollox aġġornat.',
  conflict:  'This device and the cloud have both moved on since they last spoke. ' +
             'Nothing has been overwritten. Pick the one you want to keep — ' +
             'the other one is kept and can be put back.',
  conflictKeepLocal: 'Keep THIS device’s game',
  conflictKeepCloud: 'Use the game from the cloud',
  conflictLater:     'Decide later',
  backupNote: 'A copy of this device’s game was saved before the cloud copy was ' +
             'loaded. You can put it back from this panel.',
  badName:   'Usernames are 1–16 characters: letters, numbers, space, dot, dash, underscore.',
  badPass:   'Pick a password of at least ' + PW_MIN + ' characters.',
  mismatch:  'The two passwords do not match.',
  taken:     'That name is already taken on the server. Try another.',
  creds:     'Wrong username or password.',
  serverOff: 'This server is not offering cloud saves.',
  tooBig:    'This save is too big for the server. Tell Terence.',
  slow:      'Too many tries. Wait a minute and go again.',
  reLogin:   'Your session has expired. Log in again to keep syncing.',
  guest:     'You are playing as a guest. Signing in will put THIS guest game in ' +
             'the cloud under your new name.'
};

/* ───────────────── forgotten password, in plain words ─────────────────
   THERE IS NO EMAIL, AND THE COPY MUST NOT PRETEND THERE IS. A player asks,
   Terence is told, and he messages them a code the way he already talks to
   them. Saying "check your inbox" would leave somebody staring at an inbox
   for ever. Bilingual through T() at display time; nothing here is resolved
   at load, so a language switch repaints correctly.

   FAILURE IS ONE SENTENCE. The server refuses a wrong code, an expired code,
   a spent code and a name that has no account with the identical answer on
   purpose, and this file must not invent a difference the server refused to
   make — "no such account" here would hand back exactly the thing the server
   is being careful not to say. */
function resetText() {
  return {
    forgotLink:  T('Forgotten your password?', 'Insejt il-password?'),

    askTitle:    T('Forgotten your password?', 'Insejt il-password?'),
    askWhat:     T('There is no email on KARTI, so this is done by hand. Type your ' +
                   'username and Terence is told you are locked out. He sends you a ' +
                   'reset code the way he normally messages you — then come back here ' +
                   'and use it.',
                   'KARTI m’għandux email, mela dan isir bl-idejn. Ikteb l-isem tiegħek ' +
                   'u Terence jiġi mgħarraf li ma tistax tidħol. Jibgħatlek kodiċi ' +
                   'permezz tal-mod li normalment jibgħatlek messaġġi — imbagħad erġa’ ' +
                   'ejja hawn u użah.'),
    askGo:       T('Tell Terence I am locked out', 'Għid lil Terence li ma nistax nidħol'),
    askDone:     T('If that account exists, Terence has been told. He will send you a ' +
                   'code. It is good for 24 hours and works once.',
                   'Jekk dak il-kont jeżisti, Terence ġie mgħarraf. Hu jibgħatlek ' +
                   'kodiċi. Jgħodd għal 24 siegħa u jaħdem darba biss.'),
    askHaveCode: T('I already have a code', 'Diġà għandi kodiċi'),

    useTitle:    T('Use a reset code', 'Uża kodiċi tal-password'),
    useWhat:     T('Type the code Terence sent you and pick a new password. The code ' +
                   'works once. Every device that is signed in to this account is ' +
                   'signed out, including whoever locked you out.',
                   'Ikteb il-kodiċi li bagħatlek Terence u agħżel password ġdida. ' +
                   'Il-kodiċi jaħdem darba biss. Kull apparat li huwa mdaħħal f’dan ' +
                   'il-kont jinħareġ ’il barra, inkluż min qafflek barra.'),
    codeLabel:   T('Reset code', 'Kodiċi'),
    newPass:     T('New password', 'Password ġdida'),
    newPass2:    T('New password again', 'Erġa’ ikteb il-password'),
    useGo:       T('Set my new password', 'Issettja l-password ġdida'),
    badCode:     T('That code is not right, or it has expired. Ask Terence for a new one.',
                   'Dak il-kodiċi mhux tajjeb, jew skada. Itlob lil Terence ieħor.'),
    done:        T('Password changed. Log in with your new password.',
                   'Il-password inbidlet. Idħol bil-password il-ġdida.'),
    needCode:    T('Type the code Terence sent you.',
                   'Ikteb il-kodiċi li bagħatlek Terence.'),
    back:        T('Back', 'Lura')
  };
}

/* ─────────────────────────── storage adapter ───────────────────────────
   The only place this file knows anything about js/game.js. */
var adapter = {
  activeKey: function () {
    try { return JSON.parse(localStorage.getItem('karti_active') || 'null'); }
    catch (e) { return null; }
  },
  /* the save exactly as game.js wrote it: a JSON string, byte for byte */
  readRaw: function (localKey) {
    try { return localStorage.getItem('karti_save_' + localKey); }
    catch (e) { return null; }
  },
  writeRaw: function (localKey, blob) {
    try { localStorage.setItem('karti_save_' + localKey, blob); return true; }
    catch (e) { return false; }
  },
  /* make the running game pick up a save we just wrote underneath it */
  reload: function () {
    try {
      if (window.KARTI && typeof KARTI.load === 'function') KARTI.load();
      if (window.KARTI && typeof KARTI.renderHome === 'function') KARTI.renderHome();
    } catch (e) {}
  },
  displayName: function () {
    try { return (window.KARTI && KARTI.displayName && KARTI.displayName()) || ''; }
    catch (e) { return ''; }
  }
};

function sessKey(localKey) { return 'karti_sync_' + localKey; }
function backupKey(localKey) { return 'karti_sync_backup_' + localKey; }

function lsRead(k) {
  try { var v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); }
  catch (e) { return null; }
}
function lsWrite(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch (e) { return false; }
}
function lsDrop(k) { try { localStorage.removeItem(k); } catch (e) {} }

/* ─────────────────────────── where is the server? ─────────────────────────── */
function baseURL() {
  /* Follow whatever relay js/mp.js is pointed at, so ?relay=… and the Server
     settings box move BOTH features together and a tester never ends up with
     duels on one box and saves on another. */
  var u = '';
  try {
    if (window.KARTI_MP && typeof KARTI_MP.defaultURL === 'function')
      u = (KARTI_MP.defaultURL() || '').trim();
  } catch (e) {}
  if (/^wss?:\/\//i.test(u))
    return u.replace(/^ws/i, 'http').replace(/\/ws(\/)?$/i, '') + '/acct';
  if (location.protocol === 'http:' && location.hostname)
    return 'http://' + location.hostname + ':' + DEV_PORT + '/karti/acct';
  return ACCT_URL;
}

/* ─────────────────────────── state ─────────────────────────── */
var ST = {
  local: null,        /* which local profile we are bound to */
  sess: null,         /* { u, name, tok, exp, ver, at, mark } or null */
  busy: false,
  phase: 'idle',      /* idle | syncing | conflict | error */
  msg: '',
  online: null,       /* null = unknown, true/false = last answer */
  conflict: null      /* { serverVer, serverSave, serverAt, localSave } */
};
var listeners = [];

function fire() {
  var s = status();
  for (var i = 0; i < listeners.length; i++) {
    try { listeners[i](s); } catch (e) {}
  }
  repaintPanel();
}

function status() {
  return {
    supported: canStore(),
    available: !!baseURL(),
    local: ST.local,
    linked: !!(ST.sess && ST.sess.tok),
    user: ST.sess ? ST.sess.name : '',
    ver: ST.sess ? (ST.sess.ver || 0) : 0,
    lastAt: ST.sess ? (ST.sess.at || 0) : 0,
    busy: ST.busy,
    phase: ST.phase,
    msg: ST.msg,
    online: ST.online,
    conflict: !!ST.conflict,
    hasBackup: !!(ST.local && lsRead(backupKey(ST.local)))
  };
}

function canStore() {
  try { localStorage.setItem('karti_sync_t', '1'); localStorage.removeItem('karti_sync_t');
        return true; } catch (e) { return false; }
}

function setPhase(phase, msg) { ST.phase = phase; ST.msg = msg || ''; fire(); }

function saveSess() {
  if (!ST.local) return;
  if (ST.sess) lsWrite(sessKey(ST.local), ST.sess);
  else lsDrop(sessKey(ST.local));
}

/* ─────────────────────────── the wire ───────────────────────────
   Every call goes through here. It NEVER throws: an unreachable Pi, a captive
   portal, an aeroplane, a CORS refusal and a 500 all come back as
   { err:'…', code:… } and the game carries on. */
function call(route, body, ms) {
  var url = baseURL() + '/' + route;
  var ctrl = null, timer = null;
  try { ctrl = new AbortController(); } catch (e) {}
  var opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    credentials: 'omit',
    cache: 'no-store',
    mode: 'cors'
  };
  if (ctrl) {
    opts.signal = ctrl.signal;
    timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms || NET_MS);
  }
  return fetch(url, opts).then(function (r) {
    return r.text().then(function (t) {
      var js = null;
      try { js = JSON.parse(t); } catch (e) {}
      return { status: r.status, js: js || {} };
    });
  }).then(function (r) {
    if (timer) clearTimeout(timer);
    ST.online = true;
    if (r.status >= 200 && r.status < 300) return { ok: true, status: r.status, d: r.js };
    return { err: r.js.why || 'The server said no.', status: r.status, d: r.js };
  }).catch(function () {
    if (timer) clearTimeout(timer);
    ST.online = false;
    return { err: TEXT.unreachable, status: 0, offline: true, d: {} };
  });
}

/* Is the Pi answering at all? Used only to colour the panel — never to gate
   anything the player is doing. */
function reachable() {
  var url = baseURL().replace(/\/acct$/, '/health');
  var ctrl = null, timer = null;
  try { ctrl = new AbortController(); } catch (e) {}
  var opts = { cache: 'no-store', mode: 'cors' };
  if (ctrl) { opts.signal = ctrl.signal;
              timer = setTimeout(function(){ try { ctrl.abort(); } catch(e){} }, 6000); }
  return fetch(url, opts).then(function (r) { return r.json(); }).then(function (j) {
    if (timer) clearTimeout(timer);
    ST.online = true;
    fire();
    return { ok: true, accounts: j && j.accounts !== false, maxSave: (j && j.maxSave) || 0 };
  }).catch(function () {
    if (timer) clearTimeout(timer);
    ST.online = false;
    fire();
    return { ok: false };
  });
}

/* ─────────────────────────── reading a save ─────────────────────────── */
function localRaw() {
  if (!ST.local) return null;
  var raw = adapter.readRaw(ST.local);
  if (raw == null) return null;
  /* must be a JSON object; the server refuses anything else and we would
     rather find out here than round-trip a broken upload */
  var t = String(raw).trim();
  if (t.charAt(0) !== '{' || t.charAt(t.length - 1) !== '}') return null;
  return raw;
}
function mark(blob) { return blob == null ? '' : SHA256(blob); }

/* A human sentence about a save, built defensively — the blob may be from an
   older version of the game, or from a device that has been fiddled with. */
function summarise(blob) {
  var o = {};
  try { o = JSON.parse(blob) || {}; } catch (e) { o = {}; }
  if (typeof o !== 'object' || !o) o = {};
  var owned = (o.owned && typeof o.owned === 'object') ? o.owned : {};
  var unique = 0, total = 0, k;
  for (k in owned) {
    if (!Object.prototype.hasOwnProperty.call(owned, k)) continue;
    var n = +owned[k]; if (n > 0) { unique++; total += n; }
  }
  var decks = Array.isArray(o.decks) ? o.decks.length : 0;
  var rec = (o.rec && typeof o.rec === 'object') ? o.rec : {};
  var cleared = 0;
  try { cleared = Object.keys((o.story && o.story.cleared) || {}).length; } catch (e) {}
  return {
    unique: unique, total: total, decks: decks,
    coins: Math.max(0, +o.coins || 0),
    wins: Math.max(0, +rec.w || 0), losses: Math.max(0, +rec.l || 0),
    stages: cleared, bytes: (blob || '').length
  };
}
function summaryLine(s) {
  return s.unique + ' different cards (' + s.total + ' in all) · ' +
         s.decks + ' deck' + (s.decks === 1 ? '' : 's') + ' · ' +
         s.coins + ' coins · ' + s.stages + ' story stage' +
         (s.stages === 1 ? '' : 's') + ' cleared · ' +
         s.wins + 'W/' + s.losses + 'L';
}
function whenText(seconds) {
  if (!seconds) return 'never';
  var d = new Date(seconds * 1000);
  if (isNaN(d.getTime())) return 'unknown';
  var diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.round(diff / 60) + ' min ago';
  if (diff < 86400) return Math.round(diff / 3600) + ' h ago';
  return d.toLocaleDateString();
}

function deviceLabel() {
  var ua = navigator.userAgent || '';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'device';
}

/* ─────────────────────────── binding ─────────────────────────── */
function attach(localKey) {
  if (!localKey) return detach();
  ST.local = localKey;
  ST.sess = lsRead(sessKey(localKey));
  ST.conflict = null;
  ST.phase = 'idle';
  ST.msg = '';
  fire();
  if (ST.sess && ST.sess.tok) syncNow({ quiet: true });
}
function detach() {
  ST.local = null; ST.sess = null; ST.conflict = null;
  ST.phase = 'idle'; ST.msg = '';
  clearTimeout(pushTimer); pushTimer = 0;
  fire();
}
/* upgradeGuest() renames the local profile underneath us; carry the session. */
function rekey(oldKey, newKey) {
  if (!oldKey || !newKey || oldKey === newKey) return;
  var s = lsRead(sessKey(oldKey));
  if (s) { lsWrite(sessKey(newKey), s); lsDrop(sessKey(oldKey)); }
  var b = lsRead(backupKey(oldKey));
  if (b) { lsWrite(backupKey(newKey), b); lsDrop(backupKey(oldKey)); }
  if (ST.local === oldKey) attach(newKey);
}

/* ─────────────────────────── sign up / in / out ─────────────────────────── */
function validate(user, pass) {
  var name = String(user == null ? '' : user).trim();
  if (!NAME_RE.test(name)) return { err: TEXT.badName };
  if (String(pass || '').length < PW_MIN) return { err: TEXT.badPass };
  return { ok: true, name: name, key: name.toLowerCase() };
}

function wireError(r) {
  if (r.offline) return TEXT.unreachable;
  if (r.status === 409) return TEXT.taken;
  if (r.status === 401) return TEXT.creds;
  if (r.status === 413) return TEXT.tooBig;
  if (r.status === 429) return r.d && r.d.why ? r.d.why : TEXT.slow;
  if (r.status === 503) return TEXT.serverOff;
  return r.err || 'Something went wrong.';
}

function register(user, pass) {
  var v = validate(user, pass);
  if (v.err) return Promise.resolve(v);
  if (!ST.local) return Promise.resolve({ err: 'No profile is loaded yet.' });
  ST.busy = true; setPhase('syncing', TEXT.syncing);
  return call('register', { u: v.name, pw: credential(v.key, String(pass)) })
    .then(function (r) {
      ST.busy = false;
      if (!r.ok) { setPhase('error', wireError(r));
                   return { err: wireError(r), status: r.status, offline: !!r.offline }; }
      ST.sess = { u: r.d.u, name: r.d.name, tok: r.d.tok, exp: r.d.exp,
                  ver: 0, at: 0, mark: '' };
      saveSess();
      /* A brand new account starts empty, so this device's game goes straight
         up. base 0 is exactly right and can never clobber anything. */
      return push({ silent: true }).then(function () {
        setPhase('idle', TEXT.pushed);
        return { ok: true, name: r.d.name };
      });
    });
}

/* opts.freshDevice — ONLY for a profile slot this device created seconds ago
   and has never played: it says "there is nothing here worth protecting", so
   the first sync copies the cloud game down instead of asking a player who has
   no second game to choose between. It is refused outright if this slot has
   ever held a session, which is the case that could actually lose a game. */
function login(user, pass, opts) {
  opts = opts || {};
  var v = validate(user, pass);
  if (v.err) return Promise.resolve(v);
  if (!ST.local) return Promise.resolve({ err: 'No profile is loaded yet.' });
  var prior = lsRead(sessKey(ST.local));
  ST.busy = true; setPhase('syncing', TEXT.syncing);
  return call('login', { u: v.name, pw: credential(v.key, String(pass)) })
    .then(function (r) {
      ST.busy = false;
      if (!r.ok) { setPhase('error', wireError(r));
                   return { err: wireError(r), status: r.status, offline: !!r.offline }; }
      /* ver/mark start at 0/'' — a device that has never agreed with this
         account treats ANY difference as a real conflict and ASKS, rather than
         quietly picking one. The two exceptions below are both cases where
         "we have never agreed" is simply untrue. */
      var ver = 0, at = 0, seen = '';
      if (prior && prior.u === r.d.u) {
        /* Signed out and back in on the SAME device and the SAME account. The
           bookkeeping kept by signOut() still describes what this device and
           the server last agreed on, so honour it: otherwise every sign-out
           cycle raised a "two games, one account" question about a divergence
           that never happened. */
        ver = prior.ver || 0; at = prior.at || 0; seen = prior.mark || '';
      } else if (opts.freshDevice && !prior) {
        seen = mark(localRaw());
      }
      ST.sess = { u: r.d.u, name: r.d.name, tok: r.d.tok, exp: r.d.exp,
                  ver: ver, at: at, mark: seen,
                  /* THE SERVER'S ANSWER to "may this account use the gift
                     console". js/progress.js used to work it out from the
                     username, which is the same forgeable guess the relay just
                     stopped making. Absent means no. */
                  admin: !!r.d.admin };
      saveSess();
      return syncNow({ fromLogin: true }).then(function () {
        return { ok: true, name: r.d.name };
      });
    });
}

/* ─────────────────────── forgotten password ───────────────────────
   Two calls, and NEITHER of them ever receives a secret. requestReset() leaves
   a note for Terence and is answered the same way whatever name it is given;
   resetPassword() spends a code the player already has in their hand, because
   Terence sent it to them himself. Nothing on this wire can hand a code out —
   only a command run on the Pi mints one — and that is the reason any of this
   is safe to have on a public address. */

/* Step one. ALWAYS resolves ok: the server deliberately answers the same 200
   for a real account and an invented one, and this must not undo that by
   deciding for itself which names are real. */
function requestReset(user) {
  var name = String(user == null ? '' : user).trim();
  if (!NAME_RE.test(name)) return Promise.resolve({ err: TEXT.badName });
  return call('reset-ask', { u: name }).then(function (r) {
    if (!r.ok && r.offline) return { err: TEXT.unreachable, offline: true };
    if (!r.ok && r.status === 429)
      return { err: (r.d && r.d.why) || TEXT.slow, status: 429 };
    /* Anything else, including a server that answered oddly, is reported as
       done. There is nothing useful to tell them and nothing to retry. */
    return { ok: true };
  });
}

/* Step two. THE CREDENTIAL MUST BE THE SAME SHAPE LOGIN SENDS — credential()
   above, byte for byte. Send anything else and the server stores a hash that
   looks perfectly valid and can never match a login, silently, with no error
   anywhere. That is the single most dangerous line in this file. */
function resetPassword(user, code, pass) {
  var v = validate(user, pass);
  if (v.err) return Promise.resolve(v);
  var tidy = String(code == null ? '' : code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!tidy) return Promise.resolve({ err: resetText().needCode });
  return call('reset', { u: v.name, code: tidy, pw: credential(v.key, String(pass)) })
    .then(function (r) {
      if (r.ok) {
        /* A hook, not a call into game.js: this file knows nothing about local
           profiles. game.js sets it so the profile ON THIS PHONE gets the new
           password too — without that, the one device the player is actually
           holding still refuses them, because its own local check never heard
           about the reset. */
        try {
          if (typeof KARTI_SYNC.onReset === 'function')
            KARTI_SYNC.onReset({ u: v.key, name: v.name, pass: String(pass) });
        } catch (e) {}
        return { ok: true, u: v.key, name: v.name };
      }
      if (r.offline) return { err: TEXT.unreachable, offline: true };
      if (r.status === 429) return { err: (r.d && r.d.why) || TEXT.slow, status: 429 };
      if (r.status === 503) return { err: TEXT.serverOff, status: 503 };
      /* One message for every way a code can be refused. Never "no such
         account" — the server took care not to say it and neither do we. */
      return { err: resetText().badCode, status: r.status };
    });
}

/* Drop the token, keep the bookkeeping. ver/mark are not secrets and not the
   session — they are this device's record of what it and the server last
   agreed on, and throwing them away is how a harmless sign-out turned into a
   conflict question later. status().linked reads the TOKEN, so the app still
   sees a signed-out device, and every network path stays shut. */
function keepResidue() {
  if (!ST.local) return;
  if (!ST.sess) { saveSess(); return; }
  var res = { u: ST.sess.u, name: ST.sess.name, tok: null, exp: 0,
              ver: ST.sess.ver || 0, at: ST.sess.at || 0, mark: ST.sess.mark || '' };
  ST.sess = null;
  lsWrite(sessKey(ST.local), res);
}

function signOut() {
  var tok = ST.sess && ST.sess.tok;
  keepResidue();
  ST.sess = null; ST.conflict = null;
  setPhase('idle', TEXT.notLinked);
  if (!tok) return Promise.resolve({ ok: true });
  /* fire and forget: the local game is untouched either way */
  return call('logout', { tok: tok }, 6000).then(function () { return { ok: true }; });
}

function expired() {
  keepResidue();
  ST.sess = null;
  setPhase('error', TEXT.reLogin);
}

/* ─────────────────────────── pull / push ─────────────────────────── */
function pull(opts) {
  opts = opts || {};
  if (!ST.sess || !ST.sess.tok) return Promise.resolve({ err: 'not-linked' });
  return call('pull', { tok: ST.sess.tok, prev: !!opts.prev }).then(function (r) {
    if (!r.ok) {
      if (r.status === 401) expired();
      else if (!opts.silent) setPhase('error', wireError(r));
      return { err: wireError(r), status: r.status };
    }
    /* A grant made while this phone was signed in lands on the next sync,
       rather than needing a sign out and back in. */
    if (ST.sess && !!ST.sess.admin !== !!r.d.admin) {
      ST.sess.admin = !!r.d.admin;
      saveSess();
    }
    return { ok: true, ver: r.d.ver || 0, at: r.d.at || 0,
             save: (typeof r.d.save === 'string' ? r.d.save : null),
             hasPrev: !!r.d.hasPrev, device: r.d.device || '' };
  });
}

function push(opts) {
  opts = opts || {};
  if (!ST.sess || !ST.sess.tok) return Promise.resolve({ err: 'not-linked' });
  var blob = localRaw();
  if (blob == null) return Promise.resolve({ err: 'nothing-to-push' });
  var base = (typeof opts.base === 'number') ? opts.base : (ST.sess.ver || 0);
  return call('push', { tok: ST.sess.tok, base: base, save: blob,
                        force: !!opts.force, device: deviceLabel() })
    .then(function (r) {
      if (r.ok) {
        ST.sess.ver = r.d.ver || (base + 1);
        ST.sess.at = r.d.at || Math.floor(Date.now() / 1000);
        ST.sess.mark = mark(blob);
        saveSess();
        ST.conflict = null;
        lastPush = Date.now();
        if (!opts.silent) setPhase('idle', TEXT.pushed); else fire();
        return { ok: true, ver: ST.sess.ver };
      }
      if (r.status === 401) { expired(); return { err: TEXT.reLogin }; }
      if (r.status === 409) {
        /* Someone else got there first — the server rejected our version. NOTHING
           has been written on the server and nothing is touched here.

           A pure VERSION RACE (the two saves are the SAME content, only the
           version numbers moved) must NOT ask the player anything: there is
           nothing to choose and nothing to lose. Converge on the server's
           version silently. This is the exact "identical device/cloud yet a
           popup appeared" bug. */
        var srv = (typeof r.d.save === 'string') ? r.d.save : null;
        if (srv !== null && mark(blob) === mark(srv)) {
          ST.sess.ver = r.d.ver || (ST.sess.ver || 0);
          ST.sess.at = r.d.at || Math.floor(Date.now() / 1000);
          ST.sess.mark = mark(blob);
          ST.conflict = null;
          saveSess();
          if (!opts.silent) setPhase('idle', TEXT.synced); else fire();
          return { ok: true, ver: ST.sess.ver, action: 'converge' };
        }
        /* An ORDINARY divergence: route it through the SAFE AUTO-MERGE, never
           the popup. The union keeps everything from both sides and is pushed
           back so the cloud converges too — matching this file's stated design
           ("no popup on an ordinary divergence").

           The one exception is a push that autoMerge itself triggered (its own
           union-push raced and 409'd again): re-merging would loop. In that case
           leave it pushPending — the next sync converges — rather than recurse or
           prompt. Only a genuinely unparseable save reaches raiseConflict, from
           inside autoMerge's !m.ok fallback. */
        if (srv !== null && !opts.fromMerge) {
          return autoMerge(r.d.ver || 0, srv, r.d.at || 0, blob, { silent: opts.silent });
        }
        if (opts.fromMerge) {
          /* merge-push raced again: don't recurse, don't prompt. The local union
             is already saved and backed up; the next sync will converge. */
          if (!opts.silent) fire();
          return { ok: true, action: 'merge', pushPending: true };
        }
        /* no server save came back at all (should not happen for a 409): last
           resort, keep the old safety net. */
        return raiseConflict(r.d.ver || 0, r.d.save, r.d.at || 0, blob);
      }
      if (!opts.silent) setPhase('error', wireError(r));
      return { err: wireError(r), status: r.status };
    });
}

/* ═══════════════════════════ SAFE AUTOMATIC MERGE ═══════════════════════════
   The rule this file will not break is "never lose a collection". The old code
   kept it by ASKING the player whenever both sides had moved — and a player who
   answered lost the other side's progress (a backup was kept, but they read the
   popup as loss and were confused by it). This does better: it MERGES, so
   NOTHING is dropped, and no popup is shown on an ordinary divergence.

   The invariant is simple and total: after mergeSaves(device, cloud) the result
   has, for every field, AT LEAST what either side had. A bigger number is a
   more-advanced game, so numbers take the MAX. A map of owned things (cards,
   cosmetics, cleared bosses, pity counters, per-game play counts) UNIONs its
   keys and recurses, so a card on only one phone survives and a card on both
   keeps the higher count. A list that is a SET of owned things (deck names the
   player owns, cosmetics seen) unions its members. A list that is an ORDERED
   CHOICE (a deck's contents, the list of decks) is a preference, not progress,
   so the device's is kept if it has one, else the cloud's — and it is never
   shortened. Strings and booleans are preferences; the device's is kept. When a
   field's kind is genuinely unknown, it is treated as PROGRESS and merged — the
   only mistake this function is allowed to make is keeping too much.

   Read js/game.js DEFAULT_STATE and js/progress.js blank() for the shape:
     TOP LEVEL   owned{id:count}·dust·coins·packs  → count/number = MAX/UNION
                 pity{leg,epic,packs}·rec{w,l}·spin{n,t,…}·story{cleared{}}
                 starters[]                         → set of owned keys = UNION
                 decks[]·activeDeck·side·packSet·diff → CHOICE / preference
                 prog{…}                            → nested progress, recurse
     prog        xp·pv·seenAv (numbers = MAX) · own{id:1}·n{game:count}·
                 fw{game:1}·last{game:ms} (maps = UNION+recurse) · seen[] (set) ·
                 eq{slot:id}·av·usePic·day (equip/avatar/daily = preference)
   The generic rules below cover every one of those without naming them, so a
   field js/game.js adds next week is merged safely with no change here. */

/* The merge success line, in the phone's chosen language, resolved fresh each
   time so a language switch after load is honoured. */
function mergedText() {
  try {
    if (window.KARTI_LANG && KARTI_LANG.mt && KARTI_LANG.mt()) return TEXT.mergedMt;
  } catch (e) {}
  return TEXT.mergedEn;
}

function isPlainObj(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/* Is this array a SET of owned things (union its members) rather than an
   ordered CHOICE the player made (keep one whole)? A set is short-ish and made
   only of primitives — starters ['knights','pirates'], prog.seen ['tag1',…].
   A deck list or the decks[] array holds objects or is an ordered hand the
   player arranged; those are kept whole (and never shortened). */
function looksLikeSet(arr) {
  if (!arr.length) return true;
  for (var i = 0; i < arr.length; i++) {
    var t = typeof arr[i];
    if (t === 'object' && arr[i] !== null) return false;   /* objects => choice */
  }
  return true;
}

function unionArray(a, b) {
  var out = [], seen = {}, i, k;
  for (i = 0; i < a.length; i++) { k = typeof a[i] + ':' + a[i];
    if (!seen[k]) { seen[k] = 1; out.push(a[i]); } }
  for (i = 0; i < b.length; i++) { k = typeof b[i] + ':' + b[i];
    if (!seen[k]) { seen[k] = 1; out.push(b[i]); } }
  return out;
}

/* Deep-merge one value from the device (`d`) with the same value from the cloud
   (`c`). NEVER returns something "smaller" than either input on a progress
   field. Symmetric on every progress field: numbers→max, maps→union, sets→
   union — so mergeSaves(a,b) and mergeSaves(b,a) agree on all progress. */
function mergeValue(d, c) {
  /* one side missing → take the side that has anything */
  if (d === undefined || d === null) return c === undefined ? d : c;
  if (c === undefined || c === null) return d;

  /* numbers → the bigger number is the more-advanced game */
  if (typeof d === 'number' && typeof c === 'number') {
    return (isFinite(d) ? d : 0) >= (isFinite(c) ? c : 0)
      ? (isFinite(d) ? d : (isFinite(c) ? c : 0))
      : c;
  }

  /* maps → union the keys, recurse where both have one. device's cards AND the
     cloud's cards both survive; a key in both takes the higher count. */
  if (isPlainObj(d) && isPlainObj(c)) {
    var out = {}, k;
    for (k in d) if (Object.prototype.hasOwnProperty.call(d, k)) out[k] = d[k];
    for (k in c) if (Object.prototype.hasOwnProperty.call(c, k)) {
      out[k] = Object.prototype.hasOwnProperty.call(out, k)
        ? mergeValue(out[k], c[k]) : c[k];
    }
    return out;
  }

  /* arrays: a set of owned things → union (drop nothing); an ordered choice →
     keep the device's, but never the shorter one, so no member is lost. */
  if (Array.isArray(d) && Array.isArray(c)) {
    if (looksLikeSet(d) && looksLikeSet(c)) return unionArray(d, c);
    if (!d.length) return c;
    if (!c.length) return d;
    return d.length >= c.length ? d : c;
  }

  /* mismatched kinds (number vs object, string vs array, …): this is not a
     clean numeric/map merge, so do not risk dropping progress — if one side is
     a container (object/array) prefer it, else keep the device's value. */
  if (isPlainObj(d) || Array.isArray(d)) return d;
  if (isPlainObj(c) || Array.isArray(c)) return c;

  /* strings / booleans → preferences. Keep the device's. Losing a preference is
     harmless; a progress field never reaches here (numbers/maps caught above). */
  return d;
}

/* Merge two whole saves (parsed objects). Deep-union of the two, biased so that
   NO owned key and NO counter can go backwards. Pure and side-effect free. */
function mergeObjects(dev, cloud) {
  dev = isPlainObj(dev) ? dev : {};
  cloud = isPlainObj(cloud) ? cloud : {};
  var out = {}, k;
  for (k in dev) if (Object.prototype.hasOwnProperty.call(dev, k)) out[k] = dev[k];
  for (k in cloud) if (Object.prototype.hasOwnProperty.call(cloud, k)) {
    out[k] = Object.prototype.hasOwnProperty.call(out, k)
      ? mergeValue(out[k], cloud[k]) : cloud[k];
  }
  return out;
}

/* The blob-in, blob-out form the sync path uses. Parses both, merges, and
   returns { ok, blob } — or { ok:false } if EITHER side will not parse to an
   object, which is the one genuinely-unmergeable case that still falls back to
   raiseConflict(). It never throws. */
function mergeSaves(deviceBlob, cloudBlob) {
  var d, c;
  try { d = JSON.parse(deviceBlob); } catch (e) { return { ok: false, reason: 'device-parse' }; }
  try { c = JSON.parse(cloudBlob); } catch (e) { return { ok: false, reason: 'cloud-parse' }; }
  if (!isPlainObj(d) || !isPlainObj(c)) return { ok: false, reason: 'not-object' };
  var merged = mergeObjects(d, c);
  try { return { ok: true, blob: JSON.stringify(merged), obj: merged }; }
  catch (e) { return { ok: false, reason: 'stringify' }; }
}

/* Case 4 of syncNow: both the device and the cloud have progressed since they
   last agreed. Merge them so nothing is lost, back BOTH pre-merge copies up so
   the merge is always recoverable, write the union locally, and push it so the
   cloud converges on the same union. No popup — a normal divergence is silent.
   Only a save that will not parse falls through to the old ask-the-player path. */
function autoMerge(serverVer, serverSave, serverAt, deviceBlob, opts) {
  opts = opts || {};

  /* Nothing to merge if the two saves are the SAME content — only the version
     numbers moved (a pure version race). Converge on the server's version
     silently: no merge, no push cycle, and certainly no popup. */
  if (typeof serverSave === 'string' && deviceBlob != null &&
      mark(deviceBlob) === mark(serverSave)) {
    ST.sess.ver = serverVer || (ST.sess.ver || 0);
    ST.sess.at = serverAt || Math.floor(Date.now() / 1000);
    ST.sess.mark = mark(deviceBlob);
    ST.conflict = null;
    saveSess();
    if (!opts.silent) setPhase('idle', TEXT.synced); else fire();
    return Promise.resolve({ ok: true, action: 'converge' });
  }

  var m = mergeSaves(deviceBlob, serverSave);
  if (!m.ok) {
    /* genuinely unmergeable (a corrupt/unparseable save): keep the old safety
       net rather than guess. This is the ONLY case that still shows the popup. */
    return raiseConflict(serverVer, serverSave, serverAt, deviceBlob, opts);
  }

  /* Back up BOTH pre-merge copies before anything is overwritten, so a bad
     merge is always recoverable from the panel (device copy) and the cloud's
     own pre-merge blob is kept too. */
  var nowSec = Math.floor(Date.now() / 1000);
  if (deviceBlob != null) {
    lsWrite(backupKey(ST.local), { save: deviceBlob, at: nowSec,
      why: 'this device’s game before an automatic merge' });
  }
  if (typeof serverSave === 'string') {
    lsWrite(backupKey(ST.local) + '_cloud', { save: serverSave, at: serverAt || nowSec,
      why: 'the cloud copy before an automatic merge' });
  }

  /* Write the union locally so this device gains what the cloud had. */
  var wrote = adapter.writeRaw(ST.local, m.blob);
  if (!wrote) {
    /* cannot persist the merge here — never mind, nothing was lost; leave both
       copies where they are and report it rather than dropping progress. */
    setPhase('error', 'This browser will not let the game save, so the merged ' +
                      'game was not stored. Nothing was lost — your cards are safe.');
    return Promise.resolve({ err: 'no-storage' });
  }
  ST.sess.mark = mark(m.blob);
  ST.conflict = null;
  saveSess();
  adapter.reload();

  /* Push the union to the cloud so both sides converge. Version-checked against
     what the server just showed us, exactly like the normal push. fromMerge:true
     bounds the loop: if someone raced us and this push 409s, push() will NOT
     re-enter autoMerge (that would loop forever) — it leaves it pushPending and
     the next ordinary sync converges. Still no loss: the local union is saved
     and both pre-merge copies are backed up. */
  return push({ base: serverVer || 0, silent: true, fromMerge: true }).then(function (p) {
    /* Whatever the push did, the local union is saved and both pre-merge copies
       are backed up — nothing can be lost. A clean push means the cloud now
       holds the union too; a raced push (fromMerge 409) comes back pushPending
       and the next ordinary sync converges. Neither is an error, neither pops a
       dialog. Carry pushPending through so callers/tests can see the cloud has
       not caught up yet. */
    setPhase("idle", mergedText());
    if (p && p.ok && !p.pushPending) return { ok: true, action: 'merge' };
    return { ok: true, action: 'merge', pushPending: true };
  });
}

/* ─────────────────────────── the decision ───────────────────────────
   syncNow is the only thing that ever decides anything, and it has exactly
   three outcomes: nothing to do, a safe one-way copy, or a SAFE AUTO-MERGE. */
function syncNow(opts) {
  opts = opts || {};
  if (!ST.local) return Promise.resolve({ err: 'not-attached' });
  if (!ST.sess || !ST.sess.tok) return Promise.resolve({ err: 'not-linked' });
  if (ST.busy) return Promise.resolve({ err: 'busy' });
  ST.busy = true;
  if (!opts.quiet) setPhase('syncing', TEXT.syncing);
  return pull({ silent: !!opts.quiet }).then(function (r) {
    ST.busy = false;
    if (r.err) { fire(); return r; }

    var here = localRaw();
    var hereMark = mark(here);
    var seenVer = ST.sess.ver || 0;
    var seenMark = ST.sess.mark || '';
    var serverMoved = (r.ver || 0) !== seenVer;
    var localMoved = hereMark !== seenMark;

    /* 0. RE-EVALUATE any conflict left pending from before (the app was showing
          "…waiting for you to choose which game to keep"). The old code raised a
          popup and, if the player closed it or chose "decide later", ST.conflict
          stayed set and the status line kept nagging — even when the two sides
          were actually identical or cleanly mergeable. Resolve it here with the
          fresh server copy, silently, so the nag clears on its own:
            • content-identical  -> converge on the server's version;
            • both parseable      -> auto-merge (union, nothing lost);
          Only a genuinely unparseable save is left as a conflict (safety net,
          via autoMerge's !m.ok fallback). */
    if ((ST.conflict || ST.phase === 'conflict') && typeof r.save === 'string' &&
        here != null) {
      if (mark(here) === mark(r.save)) {
        ST.sess.ver = r.ver || (ST.sess.ver || 0);
        ST.sess.at = r.at || Math.floor(Date.now() / 1000);
        ST.sess.mark = mark(here);
        ST.conflict = null;
        saveSess();
        setPhase('idle', TEXT.synced);
        return { ok: true, action: 'converge' };
      }
      return autoMerge(r.ver || 0, r.save, r.at || 0, here, opts);
    }
    /* A stale conflict flag with nothing fresh to compare against (server gave
       no save): stop nagging — drop the flag and fall through to the normal
       decision, which is safe on its own. */
    if (ST.conflict && typeof r.save !== 'string') {
      ST.conflict = null;
    }

    /* 1. nobody moved */
    if (!serverMoved && !localMoved) {
      ST.sess.at = r.at || ST.sess.at;
      saveSess();
      setPhase('idle', TEXT.synced);
      return { ok: true, action: 'none' };
    }

    /* 2. only this device moved -> upload. The push is version-checked on the
          server, so a race still ends in a 409 and a question, never a loss. */
    if (!serverMoved && localMoved) {
      return push({ base: r.ver || 0, silent: !!opts.quiet })
        .then(function (p) { return p.ok ? { ok: true, action: 'push' } : p; });
    }

    /* 3. only the cloud moved -> this device is simply behind. Copy down.
          Still take a backup first: "behind" is our belief, not a fact. */
    if (serverMoved && !localMoved && typeof r.save === 'string') {
      return applyServer(r, { quiet: !!opts.quiet })
        .then(function () { return { ok: true, action: 'pull' }; });
    }

    /* 4. both moved, or the cloud has something and we have never agreed with
          this account before. The old code ASKED here and the answer lost the
          other side's progress. Now: MERGE. The union keeps every card, every
          cosmetic, every coin/XP/counter from BOTH sides, backs both pre-merge
          copies up, and pushes the union so the cloud converges too. No popup.
          Only a save that will not parse falls back to raiseConflict inside. */
    if (typeof r.save === 'string') {
      return autoMerge(r.ver || 0, r.save, r.at || 0, here, opts);
    }

    /* the cloud has nothing at all yet */
    return push({ base: r.ver || 0, silent: !!opts.quiet })
      .then(function (p) { return p.ok ? { ok: true, action: 'push' } : p; });
  }).catch(function (e) {
    ST.busy = false;
    setPhase('error', TEXT.unreachable);
    return { err: TEXT.unreachable };
  });
}

/* Write the server's copy into the local slot — but never without first
   putting this device's copy somewhere it can be got back from. */
function applyServer(r, opts) {
  opts = opts || {};
  var here = localRaw();
  if (here != null) {
    lsWrite(backupKey(ST.local), { save: here, at: Math.floor(Date.now() / 1000),
                                   why: 'replaced by the cloud copy' });
  }
  var wrote = adapter.writeRaw(ST.local, r.save);
  if (!wrote) {
    setPhase('error', 'This browser will not let the game save, so the cloud ' +
                      'copy was not loaded. Nothing was lost.');
    return Promise.resolve({ err: 'no-storage' });
  }
  ST.sess.ver = r.ver || 0;
  ST.sess.at = r.at || 0;
  ST.sess.mark = mark(r.save);
  ST.conflict = null;
  saveSess();
  adapter.reload();
  setPhase('idle', TEXT.pulled);
  return Promise.resolve({ ok: true });
}

function raiseConflict(serverVer, serverSave, serverAt, localSave, opts) {
  ST.conflict = { ver: serverVer, save: serverSave, at: serverAt,
                  local: localSave, localAt: Math.floor(Date.now() / 1000) };
  setPhase('conflict', TEXT.conflict);
  var ask = (typeof KARTI_SYNC.onConflict === 'function')
    ? KARTI_SYNC.onConflict : defaultConflictUI;
  var info = {
    server: summarise(serverSave), serverVer: serverVer, serverAt: serverAt,
    local: summarise(localSave || '{}'), localAt: ST.conflict.localAt
  };
  return Promise.resolve(ask(info)).then(function (choice) {
    return resolveConflict(choice);
  }, function () { return { err: 'conflict', pending: true }; });
}

/* 'local' | 'cloud' | anything else = leave it alone */
function resolveConflict(choice) {
  var c = ST.conflict;
  if (!c) return Promise.resolve({ err: 'no-conflict' });
  if (choice === 'local') {
    /* base = the version the server is actually holding, so this is an
       ordinary in-order write, not a smash. The server keeps the blob it
       replaced either way. */
    return push({ base: c.ver, silent: true }).then(function (p) {
      if (p.ok) setPhase('idle', TEXT.pushed);
      return p;
    });
  }
  if (choice === 'cloud') {
    return applyServer({ ver: c.ver, save: c.save, at: c.at })
      .then(function (p) {
        if (p.ok) setPhase('idle', TEXT.pulled + ' ' + TEXT.backupNote);
        return p;
      });
  }
  setPhase('conflict', TEXT.conflict);
  return Promise.resolve({ ok: false, deferred: true });
}

function restoreBackup() {
  if (!ST.local) return { err: 'not-attached' };
  var b = lsRead(backupKey(ST.local));
  if (!b || typeof b.save !== 'string') return { err: 'no-backup' };
  var now = localRaw();
  if (now != null) lsWrite(backupKey(ST.local) + '_swap', { save: now, at: Math.floor(Date.now()/1000) });
  if (!adapter.writeRaw(ST.local, b.save)) return { err: 'no-storage' };
  if (ST.sess) { ST.sess.mark = ''; saveSess(); }   /* force the next sync to ask */
  adapter.reload();
  setPhase('idle', 'The backup has been put back. Sync again when you are ready.');
  return { ok: true };
}

/* ─────────────────────────── auto-push ───────────────────────────
   Called from the game's save(). Debounced, rate limited, silent, and a
   complete no-op unless there is a live session and something has changed. */
var pushTimer = 0, lastPush = 0;
function notifySaved() {
  if (!ST.sess || !ST.sess.tok || !ST.local) return;
  if (ST.conflict) return;                 /* never auto-resolve a conflict */
  clearTimeout(pushTimer);
  var wait = Math.max(PUSH_DEBOUNCE, PUSH_MIN_GAP - (Date.now() - lastPush));
  pushTimer = setTimeout(function () {
    pushTimer = 0;
    if (!ST.sess || !ST.sess.tok || ST.conflict || ST.busy) return;
    if (mark(localRaw()) === (ST.sess.mark || '')) return;   /* nothing new */
    push({ silent: true });
  }, wait);
}

/* Best effort on the way out. Not relied on by anything. */
function flush() {
  if (!ST.sess || !ST.sess.tok || ST.conflict) return;
  var blob = localRaw();
  if (blob == null || mark(blob) === (ST.sess.mark || '')) return;
  try {
    fetch(baseURL() + '/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tok: ST.sess.tok, base: ST.sess.ver || 0,
                             save: blob, device: deviceLabel() }),
      keepalive: true, mode: 'cors', cache: 'no-store', credentials: 'omit'
    });
  } catch (e) {}
}

/* ═══════════════════════════ the panel ═══════════════════════════
   Deliberately self-contained: its own overlay, its own inline styles, no
   class from css/extra.css and no helper from js/game.js. It therefore cannot
   be broken by a restyle, and it works even if it is the only thing that
   loaded. game.js needs one button that calls KARTI_SYNC.openPanel(). */
var panel = null, panelMode = 'menu', panelErr = '', lastFocus = null, panelPrefill = '';
var panelNote = '';             /* a quiet confirmation, not an error */

function el(tag, css, html) {
  var n = document.createElement(tag);
  if (css) n.setAttribute('style', css);
  if (html != null) n.innerHTML = html;
  return n;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

var CSS = {
  wrap: 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;' +
        'justify-content:center;background:rgba(6,8,14,.72);padding:16px;' +
        '-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);',
  box:  'width:100%;max-width:430px;max-height:88vh;overflow:auto;' +
        'background:#121722;color:#eef2f8;border:1px solid #2b3446;border-radius:16px;' +
        'padding:18px 18px 16px;box-shadow:0 24px 60px rgba(0,0,0,.55);' +
        'font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;',
  h:    'margin:0 0 6px;font-size:19px;font-weight:700;letter-spacing:.2px;',
  p:    'margin:0 0 10px;color:#a9b4c6;font-size:13.5px;',
  note: 'margin:10px 0 0;padding:9px 11px;border-radius:10px;background:#1a2130;' +
        'border:1px solid #2b3446;color:#9fb0c8;font-size:12.5px;',
  err:  'margin:10px 0 0;padding:9px 11px;border-radius:10px;background:#3a1620;' +
        'border:1px solid #7a2438;color:#ffc9d3;font-size:13px;',
  ok:   'margin:10px 0 0;padding:9px 11px;border-radius:10px;background:#12281d;' +
        'border:1px solid #245c3a;color:#b6f0cd;font-size:13px;',
  lab:  'display:block;margin:10px 0 4px;font-size:12.5px;color:#a9b4c6;',
  inp:  'width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;' +
        'border:1px solid #2b3446;background:#0d1119;color:#eef2f8;font-size:16px;',
  btn:  'display:block;width:100%;box-sizing:border-box;margin-top:10px;padding:12px;' +
        'border-radius:11px;border:1px solid #2b3446;background:#1b2333;color:#eef2f8;' +
        'font-size:15px;font-weight:600;cursor:pointer;text-align:center;',
  hot:  'display:block;width:100%;box-sizing:border-box;margin-top:10px;padding:12px;' +
        'border-radius:11px;border:0;background:#c8102e;color:#fff;font-size:15px;' +
        'font-weight:700;cursor:pointer;text-align:center;',
  ghost:'display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:10px;' +
        'border-radius:11px;border:0;background:transparent;color:#8fa0b8;' +
        'font-size:13.5px;cursor:pointer;text-align:center;',
  card: 'margin-top:10px;padding:11px 12px;border-radius:12px;background:#0f1622;' +
        'border:1px solid #2b3446;',
  sm:   'font-size:12.5px;color:#9fb0c8;margin:3px 0 0;'
};

function openPanel(mode, opts) {
  panelMode = mode || (status().linked ? 'account' : 'menu');
  panelErr = '';
  /* game.js opens the sign-up straight from the profile sheet and already
     knows the player's name — carrying it in saves them typing it twice and
     keeps the local profile and the cloud account on the same name. */
  panelPrefill = (opts && opts.user) ? String(opts.user) : '';
  if (!panel) {
    lastFocus = document.activeElement;
    panel = el('div', CSS.wrap);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Cloud save');
    panel.addEventListener('click', function (e) { if (e.target === panel) closePanel(); });
    document.addEventListener('keydown', onPanelKey, true);
    document.body.appendChild(panel);
  }
  repaintPanel();
  reachable();
  /* the first EMPTY field: with the name carried in from the profile sheet the
     cursor belongs in the password box, not back on the name */
  var fields = panel.querySelectorAll('input'), f = null, i;
  for (i = 0; i < fields.length && !f; i++) if (!fields[i].value) f = fields[i];
  if (f) { try { f.focus(); } catch (e) {} }
}
function closePanel() {
  if (!panel) return;
  /* Closing the panel mid-conflict is "decide later", not a hung promise. The
     conflict itself stays on record; auto-push stays paused until it is
     answered, so neither copy can be quietly overwritten in the meantime. */
  if (pendingConflict) { var f = pendingConflict; pendingConflict = null; f('later'); }
  document.removeEventListener('keydown', onPanelKey, true);
  try { panel.remove(); } catch (e) {}
  panel = null;
  if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  lastFocus = null;
}
function onPanelKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } }

function repaintPanel() {
  if (!panel) return;
  var s = status();
  var RT = resetText();          /* resolved fresh, so a language switch lands */
  var box = el('div', CSS.box);
  var body = '';

  if (panelMode === 'menu' || panelMode === 'account') {
    body += '<h2 style="' + CSS.h + '">Cloud save</h2>';
    if (s.linked) {
      body += '<p style="' + CSS.p + '">Signed in as <b>' + esc(s.user) + '</b> on this ' +
              'server. Your game uploads itself a few seconds after you play.</p>';
      body += '<div style="' + CSS.card + '"><b>This device</b><p style="' + CSS.sm + '">' +
              esc(summaryLine(summarise(localRaw() || '{}'))) + '</p>' +
              '<p style="' + CSS.sm + '">Cloud copy: version ' + s.ver +
              ', ' + esc(whenText(s.lastAt)) + '</p></div>';
      body += '<button data-a="sync" style="' + CSS.hot + '">Sync now</button>';
      body += '<button data-a="signout" style="' + CSS.btn + '">Sign out of cloud save</button>';
      if (s.hasBackup)
        body += '<button data-a="restore" style="' + CSS.btn + '">Put back this device’s ' +
                'previous game</button>';
    } else {
      body += '<p style="' + CSS.p + '">' + esc(TEXT.what) + '</p>';
      body += '<button data-a="go-signup" style="' + CSS.hot + '">Put this game in the cloud</button>';
      body += '<button data-a="go-login" style="' + CSS.btn + '">I already have an account</button>';
    }
    body += '<p style="' + CSS.note + '">' + esc(TEXT.whereFrom) + '</p>';
    if (!s.linked) body += '<p style="' + CSS.note + '">' + esc(TEXT.offlineOk) + '</p>';
    if (s.online === false)
      body += '<p style="' + CSS.err + '">' + esc(TEXT.unreachable) + '</p>';
  } else if (panelMode === 'signup' || panelMode === 'signin') {
    var isNew = panelMode === 'signup';
    body += '<h2 style="' + CSS.h + '">' + (isNew ? 'Create a cloud account' : 'Log in to cloud save') + '</h2>';
    body += '<p style="' + CSS.p + '">' + esc(isNew
        ? 'This puts THIS game — these cards, this deck, these coins — in the cloud ' +
          'under the name you pick, so you can log in on another phone and find it ' +
          'there. The password never leaves this phone in readable form.'
        : 'Log in and this device will be brought in line with your cloud game. ' +
          'If the two have both changed, they are joined together automatically — ' +
          'every card, coin and bit of progress from both is kept, so you never ' +
          'lose a thing.') + '</p>';
    if (ST.local === '__guest__')
      body += '<p style="' + CSS.note + '">' + esc(TEXT.guest) + '</p>';
    body += '<label style="' + CSS.lab + '" for="ks-u">Username</label>' +
            '<input id="ks-u" style="' + CSS.inp + '" autocomplete="username" ' +
            'autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="16"' +
            (panelPrefill ? ' value="' + esc(panelPrefill) + '"' : '') + '>';
    body += '<label style="' + CSS.lab + '" for="ks-p">Password</label>' +
            '<input id="ks-p" type="password" style="' + CSS.inp + '" autocomplete="' +
            (isNew ? 'new-password' : 'current-password') + '">';
    if (isNew)
      body += '<label style="' + CSS.lab + '" for="ks-p2">Password again</label>' +
              '<input id="ks-p2" type="password" style="' + CSS.inp + '" autocomplete="new-password">';
    body += '<button data-a="' + (isNew ? 'do-signup' : 'do-login') + '" style="' + CSS.hot +
            '"' + (s.busy ? ' disabled' : '') + '>' +
            (s.busy ? 'Working…' : (isNew ? 'Create account' : 'Log in')) + '</button>';
    /* Only on the LOG IN page. Somebody creating an account has no password to
       have forgotten, and the offer would only be confusing there. */
    if (!isNew)
      body += '<button data-a="go-forgot" style="' + CSS.ghost + '">' +
              esc(RT.forgotLink) + '</button>';
    body += '<button data-a="back" style="' + CSS.ghost + '">Back</button>';
    body += '<p style="' + CSS.note + '">' + esc(TEXT.whereFrom) + '</p>';
  } else if (panelMode === 'forgot' || panelMode === 'usecode') {
    var asking = panelMode === 'forgot';
    body += '<h2 style="' + CSS.h + '">' + esc(asking ? RT.askTitle : RT.useTitle) + '</h2>';
    body += '<p style="' + CSS.p + '">' + esc(asking ? RT.askWhat : RT.useWhat) + '</p>';
    body += '<label style="' + CSS.lab + '" for="ks-ru">Username</label>' +
            '<input id="ks-ru" style="' + CSS.inp + '" autocomplete="username" ' +
            'autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="16"' +
            (panelPrefill ? ' value="' + esc(panelPrefill) + '"' : '') + '>';
    if (asking) {
      body += '<button data-a="do-ask" style="' + CSS.hot + '"' +
              (s.busy ? ' disabled' : '') + '>' +
              esc(s.busy ? 'Working…' : RT.askGo) + '</button>';
      body += '<button data-a="go-usecode" style="' + CSS.btn + '">' +
              esc(RT.askHaveCode) + '</button>';
    } else {
      /* Upper case and generously spaced: this is copied off a message and
         typed with a thumb, and the alphabet it comes from has no O, no I,
         no 0 and no 1 for the same reason. */
      body += '<label style="' + CSS.lab + '" for="ks-rc">' + esc(RT.codeLabel) + '</label>' +
              '<input id="ks-rc" style="' + CSS.inp + 'text-transform:uppercase;' +
              'letter-spacing:2px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace" ' +
              'autocomplete="one-time-code" autocapitalize="characters" autocorrect="off" ' +
              'spellcheck="false" inputmode="text" maxlength="24">';
      body += '<label style="' + CSS.lab + '" for="ks-rp">' + esc(RT.newPass) + '</label>' +
              '<input id="ks-rp" type="password" style="' + CSS.inp +
              '" autocomplete="new-password">';
      body += '<label style="' + CSS.lab + '" for="ks-rp2">' + esc(RT.newPass2) + '</label>' +
              '<input id="ks-rp2" type="password" style="' + CSS.inp +
              '" autocomplete="new-password">';
      body += '<button data-a="do-reset" style="' + CSS.hot + '"' +
              (s.busy ? ' disabled' : '') + '>' +
              esc(s.busy ? 'Working…' : RT.useGo) + '</button>';
    }
    body += '<button data-a="go-login" style="' + CSS.ghost + '">' + esc(RT.back) + '</button>';
    if (panelNote) body += '<p style="' + CSS.ok + '">' + esc(panelNote) + '</p>';
  } else if (panelMode === 'conflict' && ST.conflict) {
    var a = summarise(ST.conflict.local || '{}');
    var b = summarise(ST.conflict.save || '{}');
    body += '<h2 style="' + CSS.h + '">Two games, one account</h2>';
    body += '<p style="' + CSS.p + '">' + esc(TEXT.conflict) + '</p>';
    body += '<div style="' + CSS.card + '"><b>This device</b><p style="' + CSS.sm + '">' +
            esc(summaryLine(a)) + '</p></div>';
    body += '<div style="' + CSS.card + '"><b>The cloud</b><p style="' + CSS.sm + '">' +
            esc(summaryLine(b)) + '</p><p style="' + CSS.sm + '">saved ' +
            esc(whenText(ST.conflict.at)) + '</p></div>';
    body += '<button data-a="keep-local" style="' + CSS.hot + '">' +
            esc(TEXT.conflictKeepLocal) + '</button>';
    body += '<button data-a="keep-cloud" style="' + CSS.btn + '">' +
            esc(TEXT.conflictKeepCloud) + '</button>';
    body += '<button data-a="later" style="' + CSS.ghost + '">' +
            esc(TEXT.conflictLater) + '</button>';
    body += '<p style="' + CSS.note + '">Whichever you pick, the other one is kept: the ' +
            'server holds the copy it replaced, and this device keeps a backup you can ' +
            'put back from this panel.</p>';
  }

  if (panelErr) body += '<p style="' + CSS.err + '">' + esc(panelErr) + '</p>';
  else if (s.msg && s.phase !== 'conflict')
    body += '<p style="' + (s.phase === 'error' ? CSS.err : CSS.ok) + '">' + esc(s.msg) + '</p>';
  body += '<button data-a="close" style="' + CSS.ghost + '">Close</button>';

  box.innerHTML = body;
  panel.innerHTML = '';
  panel.appendChild(box);
  box.addEventListener('click', onPanelClick);
  box.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      var go = box.querySelector('[data-a="do-signup"],[data-a="do-login"],' +
                                 '[data-a="do-ask"],[data-a="do-reset"]');
      if (go) go.click();
    }
  });
}

function onPanelClick(e) {
  var t = e.target;
  while (t && t !== panel && !t.getAttribute) t = t.parentNode;
  var a = t && t.getAttribute ? t.getAttribute('data-a') : null;
  if (!a) return;
  e.preventDefault();
  panelErr = '';
  var box = panel.querySelector('div');
  var val = function (id) { var n = box.querySelector('#' + id); return n ? n.value : ''; };

  if (a === 'close') return closePanel();
  if (a === 'back') { panelMode = 'menu'; return repaintPanel(); }
  if (a === 'go-signup') { panelMode = 'signup'; ST.msg = ''; panelNote = ''; return repaintPanel(); }
  if (a === 'go-login') { panelMode = 'signin'; ST.msg = ''; panelNote = ''; return repaintPanel(); }
  if (a === 'go-forgot' || a === 'go-usecode') {
    /* carry whatever they had already typed, so nobody types a name twice */
    var typed = val('ks-u') || val('ks-ru');
    if (typed) panelPrefill = typed;
    panelMode = a === 'go-forgot' ? 'forgot' : 'usecode';
    ST.msg = ''; panelNote = '';
    return repaintPanel();
  }
  if (a === 'do-ask') {
    panelPrefill = val('ks-ru');
    ST.busy = true; repaintPanel();
    return requestReset(panelPrefill).then(function (res) {
      ST.busy = false;
      /* The confirmation is the SAME whether or not that account exists —
         the server was careful not to say, and neither is this. */
      if (res && res.err) panelErr = res.err;
      else { panelNote = resetText().askDone; panelMode = 'usecode'; }
      repaintPanel();
    });
  }
  if (a === 'do-reset') {
    var ru = val('ks-ru'), rc = val('ks-rc'), rp = val('ks-rp');
    if (rp !== val('ks-rp2')) { panelErr = TEXT.mismatch; return repaintPanel(); }
    panelPrefill = ru;
    ST.busy = true; repaintPanel();
    return resetPassword(ru, rc, rp).then(function (res) {
      ST.busy = false;
      if (res && res.err) { panelErr = res.err; panelMode = 'usecode'; }
      else {
        /* Straight to the log-in page with the name filled in. The reset does
           NOT sign them in: a session is only ever born at /login, and making
           them use the new password once is how they find out it took. */
        panelNote = ''; ST.msg = resetText().done; panelMode = 'signin';
      }
      repaintPanel();
    });
  }
  if (a === 'sync') { return syncNow({}); }
  if (a === 'signout') { return signOut().then(function () { panelMode = 'menu'; repaintPanel(); }); }
  if (a === 'restore') {
    var r = restoreBackup();
    if (r.err) { panelErr = 'There is no backup to put back.'; repaintPanel(); }
    return;
  }
  if (a === 'do-signup' || a === 'do-login') {
    var u = val('ks-u'), p = val('ks-p');
    if (a === 'do-signup' && p !== val('ks-p2')) {
      panelErr = TEXT.mismatch; return repaintPanel();
    }
    var fn = a === 'do-signup' ? register : login;
    ST.busy = true; repaintPanel();
    return fn(u, p).then(function (res) {
      ST.busy = false;
      if (res && res.err) { panelErr = res.err; panelMode = a === 'do-signup' ? 'signup' : 'signin'; }
      else { panelMode = ST.conflict ? 'conflict' : 'account'; }
      repaintPanel();
    });
  }
  if (a === 'keep-local' || a === 'keep-cloud' || a === 'later') {
    var choice = a === 'keep-local' ? 'local' : (a === 'keep-cloud' ? 'cloud' : 'later');
    if (pendingConflict) { var f = pendingConflict; pendingConflict = null; f(choice); }
    else resolveConflict(choice);
    panelMode = choice === 'later' ? 'account' : 'account';
    return repaintPanel();
  }
}

/* The default answer to "which save do you want?" — the panel, opened on the
   conflict page, resolving when a button is pressed. Overridable:
   KARTI_SYNC.onConflict = function(info){ return Promise.resolve('local'); } */
var pendingConflict = null;
function defaultConflictUI(info) {
  return new Promise(function (resolve) {
    pendingConflict = resolve;
    panelMode = 'conflict';
    openPanel('conflict');
  });
}

/* ─────────────────────────── wiring ─────────────────────────── */
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', function () {
  if (document.hidden) flush();
  else if (ST.sess && ST.sess.tok && !ST.conflict) syncNow({ quiet: true });
});
/* Another tab of the same game signed in or out. */
window.addEventListener('storage', function (e) {
  if (!e || !e.key || !ST.local) return;
  if (e.key === sessKey(ST.local)) { ST.sess = lsRead(sessKey(ST.local)); fire(); }
});

/* Belt and braces: if nobody ever calls attach(), follow karti_active by
   itself so the feature still works. One localStorage read every few seconds,
   only while the tab is visible. */
var seenActive = null;
setInterval(function () {
  if (document.hidden) return;
  var k = adapter.activeKey();
  if (k && k !== seenActive) { seenActive = k; if (k !== ST.local) attach(k); }
  if (!k && ST.local) { seenActive = null; detach(); }
}, 3000);

/* ─────────────────────────── export ─────────────────────────── */
var KARTI_SYNC = {
  VERSION: 1,
  TEXT: TEXT,
  adapter: adapter,
  onConflict: null,
  /* Set by js/game.js. Called ONLY after the server has accepted a reset code,
     with { u, name, pass }, so the local profile on this phone can be given
     the new password too. This file never touches a local profile itself. */
  onReset: null,

  attach: attach,
  detach: detach,
  rekey: rekey,
  status: status,
  onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
  available: function () { return !!baseURL(); },
  reachable: reachable,
  baseURL: baseURL,

  /* The live session token, for SAME-ORIGIN frames KARTI itself opens.
     js/qawmien.js hands it to the RPG iframe over postMessage so the RPG
     can talk to its own relay (server/qawmien_relay.py) with the ONE
     KARTI login — no second account, and the frame never has to know how
     this file stores its session. Empty string when signed out. */
  sessionToken: function () { return (ST.sess && ST.sess.tok) || ''; },

  register: register,
  login: login,
  signOut: signOut,
  requestReset: requestReset,
  resetPassword: resetPassword,

  pull: pull,
  push: push,
  syncNow: syncNow,
  resolveConflict: resolveConflict,
  restoreBackup: restoreBackup,
  notifySaved: notifySaved,
  flush: flush,

  openPanel: openPanel,
  closePanel: closePanel,

  /* small, safe renderers game.js reuses so the same fact is never worded two
     different ways in two different sheets */
  whenText: whenText,
  summaryLine: function (blob) { return summaryLine(summarise(blob || '{}')); },
  localSummary: function () { return summaryLine(summarise(localRaw() || '{}')); },

  /* used by the headless verification harness */
  _summarise: summarise,
  _credential: credential,
  _mark: mark,
  _mergeSaves: mergeSaves,       /* blob-in, blob-out: { ok, blob, obj } */
  _mergeObjects: mergeObjects    /* parsed-object form, pure */
};
window.KARTI_SYNC = KARTI_SYNC;

/* Bind to whatever profile is already loaded, if any. Harmless when there is
   none, and it means a page that forgot the attach() hook still syncs. */
try {
  var k0 = adapter.activeKey();
  if (k0) { seenActive = k0; attach(k0); }
} catch (e) {}

})();
