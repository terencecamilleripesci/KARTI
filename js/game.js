/* ═══════════════════════════════════════════════════════════════════
   KARTI — game.js
   Vanilla JS, no build step. Depends on js/cards.js (+ optional set2/set3).
   Everything reads CARDS / STARTER_DECKS / COUNTERS at runtime, so new
   card sets drop in without touching this file.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* ───────────────────────── helpers ───────────────────────── */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
/* RNG indirection: online duels (js/mp.js) swap in a seeded generator so both
   devices consume the exact same random numbers in the same order (lockstep).
   Offline this is plain Math.random. */
let RNG = null;
function setRNG(fn){ RNG = fn || null; }
const rnd = n => Math.floor((RNG ? RNG() : Math.random()) * n);
const pickOne = a => a[rnd(a.length)];
/* ── motion ───────────────────────────────────────────────────────────
   REDUCED is read at the moment an animation is about to run, not baked in at
   load, so the Settings switch takes effect on the very next thing that moves
   instead of on the next reload. The phone's own accessibility setting is the
   default; PREFS.motion (Settings) overrides it when the player has actually
   said something. body.reduced is the same class index.html and cardview.js
   already key off, so one flag drives every animation in the app. */
const MOTION_MQ = window.matchMedia('(prefers-reduced-motion: reduce)');
let REDUCED = MOTION_MQ.matches;
const wait = ms => new Promise(r => setTimeout(r, REDUCED ? Math.min(ms, 30) : ms));
function shuffle(a){
  for (let i = a.length - 1; i > 0; i--){ const j = rnd(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

/* ── icons ──────────────────────────────────────────────────────────
   window.ICO / window.ILB come from the inline sprite in index.html.
   Everything the UI used to say with an emoji is drawn from icons/sprite.svg
   instead, so nothing depends on the device having an emoji font.
   The per-card `e` field is NOT an icon — it is the art fallback and stays. */
const ico = (n, label, cls) => (window.ICO ? window.ICO(n, label, cls) : '');
const ilb = (n, html, cls) => (window.ILB ? window.ILB(n, html, cls) : html);
const ATTR_ICON = { festa:'attr-festa', razzett:'attr-razzett', belt:'attr-belt',
                    bahar:'attr-bahar', hazen:'attr-hazen' };
const CAT_ICON  = { monster:'type-monster', spell:'type-spell', trap:'type-trap' };
const RARITY_ICON = { komuni:'rar-komuni', rari:'rar-rari', epiku:'rar-epiku',
                      leggendarju:'rar-leggendarju' };
/* a monster is marked with its attribute; a spell/trap with its own type */
const markIcon  = c => ATTR_ICON[c.f] || CAT_ICON[c.t] || 'type-monster';
const markLabel = c => (c.f && ATTR[c.f] ? ATTR[c.f].n : String(c.t).toUpperCase());

/* ── category (Yu-Gi-Oh style) ── */
const CATS = [
  { k:'monster', n:'Monsters', i:'type-monster', c:'#FFC542' },
  { k:'spell',   n:'Spells',   i:'type-spell',   c:'#2E9E62' },
  { k:'trap',    n:'Traps',    i:'type-trap',    c:'#C2185B' },
];
const CAT_COLOR = { monster:'#FFC542', spell:'#2E7D32', trap:'#AD1457' };
const catOf = c => c.t;
const frameColor = c => c.t === 'monster' ? (c.f && ATTR[c.f] ? ATTR[c.f].c : '#6B5E8C') : CAT_COLOR[c.t];
const typeName = c => c.t === 'monster' ? (c.f && ATTR[c.f] ? ATTR[c.f].n : 'MONSTER') : c.t.toUpperCase();

/* Plain-English effect text. Cards may carry their own `eff`; otherwise
   fall back to this table so every card explains itself. */
const FX_TEXT = {
  boom:'When destroyed: 500 damage to BOTH players.',
  grow:'Gains +200 ATK each of your turns.',
  grow2:'Gains +300 ATK each of your turns.',
  kamikaze:'Destroyed after it attacks.',
  discard:'Opponent discards 1 card each of your turns.',
  heal:'When summoned: heal 500 LP.',
  heal8:'When summoned: heal 800 LP.',
  healall:'Heal 800 LP each of your turns.',
  snipe:'When summoned: destroy the enemy monster with the lowest ATK.',
  double:'Can attack twice each battle phase.',
  taunt:'Enemies must attack this monster first (Taunt).',
  stun:'When summoned: enemy monsters cannot attack next turn.',
  cleave:'Attacks two DIFFERENT enemy monsters in one battle phase.',
  thorns:'Whoever attacks it takes 400 damage.',
  peek:'When summoned: look at the opponent’s hand.',
  burn:'When summoned: opponent loses 800 LP.',
  weaken:'When summoned: every enemy monster loses 400 ATK.',
  shield:'First time this monster would be destroyed in battle, it survives instead (once).',
  leech:'Battle damage this monster deals also heals you that amount.',
  revive:'When summoned: return a monster from your graveyard to your hand.',
  s_buff:'SPELL: Target 1 monster — +700 ATK until end of turn.',
  s_draw:'SPELL: Draw 2 cards.',
  s_draw1:'SPELL: Draw 1 card.',
  s_heal:'SPELL: Heal 1500 LP.',
  s_buffall:'SPELL: All your monsters gain +400 ATK this turn.',
  s_destroy:'SPELL: Destroy 1 enemy monster.',
  s_steal:'SPELL: Take control of 1 enemy monster until end of turn.',
  s_search:'SPELL: Add 1 monster from your deck to your hand.',
  t_negate:'TRAP: Negate 1 attack.',
  t_weaken:'TRAP: Attacking monster loses 800 ATK this battle.',
  t_burn:'TRAP: Opponent loses 1000 LP.',
  t_destroy:'TRAP: Destroy the attacking monster.',
  t_bounce:'TRAP: Return the attacking monster to its owner’s hand.',
  pierce:'Excess battle damage to a defending monster hits the opponent’s LP.',
  drain:'On summon: steal 400 ATK from the strongest enemy monster.',
  s_discard:'SPELL: Opponent discards 1 card at random.',
  t_mirror:'TRAP: Negate the attack and deal the attacker’s ATK to its controller.',
};
const effText = c => c.eff || FX_TEXT[c.fx] || '';

/* ───────────────────────── toast / flash / modal / sheet ───────────────────────── */
let toastT;
function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.remove('on');
  void t.offsetWidth; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
}
function flash(msg, color){
  const f = $('#flash'); f.textContent = msg; f.style.color = color || 'var(--gold)';
  f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
}
function openModal(html){ $('#mbox').innerHTML = html; $('#modal').classList.add('on'); }
function closeModal(){ $('#modal').classList.remove('on'); }
function openSheet(html){
  $('#sheet').innerHTML = html; $('#sheet').classList.add('on'); $('#scrim').classList.add('on');
}
function closeSheet(){ $('#sheet').classList.remove('on'); $('#scrim').classList.remove('on'); }

/* ───────────────────────── SHA-256 (pure JS, portable) ─────────────────────────
   Used to hash local profile passwords with a per-user random salt.
   A profile starts local and becomes a real account the moment one is made:
   the relay holds it, it syncs, and it follows him to another phone. The
   screen used to carry a line calling these "local profiles only, not a real
   secure account" — true when it was written, stale once the relay landed,
   and it was the first thing a new player read. */
const SHA256 = (function(){
  const K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  return function sha256(str){
    const utf = unescape(encodeURIComponent(str));
    const len = utf.length;
    const withPad = (((len + 8) >> 6) + 1) << 4;
    const w = new Uint32Array(withPad);
    for (let i = 0; i < len; i++) w[i >> 2] |= utf.charCodeAt(i) << ((3 - (i & 3)) * 8);
    w[len >> 2] |= 0x80 << ((3 - (len & 3)) * 8);
    w[withPad - 1] = len * 8;
    const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
                               0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    const m = new Uint32Array(64);
    for (let i = 0; i < withPad; i += 16){
      for (let j = 0; j < 16; j++) m[j] = w[i + j];
      for (let j = 16; j < 64; j++){
        const s0 = rr(m[j-15],7) ^ rr(m[j-15],18) ^ (m[j-15] >>> 3);
        const s1 = rr(m[j-2],17) ^ rr(m[j-2],19) ^ (m[j-2] >>> 10);
        m[j] = (m[j-16] + s0 + m[j-7] + s1) >>> 0;
      }
      let [a,b,c,d,e,f,g,h] = H;
      for (let j = 0; j < 64; j++){
        const S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[j] + m[j]) >>> 0;
        const S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22);
        const mj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + mj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
      H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
    }
    let out = '';
    for (let i = 0; i < 8; i++) out += ('00000000' + H[i].toString(16)).slice(-8);
    return out;
  };
})();
function randSalt(){
  const a = new Uint8Array(16);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < 16; i++) a[i] = rnd(256);
  return Array.from(a, b => ('0' + b.toString(16)).slice(-2)).join('');
}
const hashPw = (salt, pw) => SHA256(salt + '‖' + pw);

/* ───────────────────────── accounts ───────────────────────── */
const USERS_KEY = 'karti_users';
const ACTIVE_KEY = 'karti_active';
const GUEST = '__guest__';
const saveKeyFor = u => 'karti_save_' + u;

function lsGet(k, fallback){
  try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); }
  catch(e){ return fallback; }
}
/* Returns false when the write did not happen — storage full, or disabled entirely
   in private browsing. Swallowing this silently meant sign-up could report success
   while nothing was stored, and a player could lose a whole collection without ever
   being told. Callers that own player data must check the result. */
let storageWarned = false;
function lsSet(k, v){
  try { localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch(e){
    if (!storageWarned){
      storageWarned = true;
      try {
        toast('⚠ This browser is not letting the game save. Progress will be lost when you close the tab.');
      } catch(_){}
    }
    return false;
  }
}

/* ── device preferences ───────────────────────────────────────────────
   Deliberately NOT part of the save. "Do I want animations on this phone" is a
   fact about the phone, not about the collection, so it does not travel to the
   cloud, it cannot make two devices disagree, and a wiped save keeps it. It is
   also why nothing in here can ever cost a player a card. */
const PREFS_KEY = 'karti_prefs';
let PREFS = lsGet(PREFS_KEY, null) || {};
function applyPrefs(){
  /* explicit choice wins; otherwise follow the phone */
  REDUCED = (typeof PREFS.motion === 'boolean') ? PREFS.motion : MOTION_MQ.matches;
  if (document.body) document.body.classList.toggle('reduced', REDUCED);
}
/* Invites default to ON: this is a game you play with friends, and a
   feature nobody knows exists is a feature that does not exist. */
function notifyOn(){ return PREFS.notify !== false; }

function setPref(k, v){
  PREFS[k] = v;
  lsSet(PREFS_KEY, PREFS);
  applyPrefs();
}
applyPrefs();
/* the phone's own setting can change while the app is open (iOS Control
   Centre, Android quick settings); follow it unless the player has overridden */
try {
  if (MOTION_MQ.addEventListener) MOTION_MQ.addEventListener('change', applyPrefs);
  else if (MOTION_MQ.addListener) MOTION_MQ.addListener(applyPrefs);
} catch(e){}

const getUsers = () => lsGet(USERS_KEY, {}) || {};
const setUsers = u => lsSet(USERS_KEY, u);
let ACTIVE = null;                    // lowercased key, or GUEST

function displayName(){
  if (ACTIVE === GUEST) return 'Guest';
  const u = getUsers()[ACTIVE];
  return u ? u.name : 'Guest';
}
/* An account is a CLOUD account. It is made on this device first — instantly,
   with no network anywhere near the critical path — and then registered with
   the server in the background by cloudLink(). If the server is off, the
   account still exists, the game still plays, and the cloud half is picked up
   the next time the player logs in with the same password.
   The rules below are the SERVER's rules (see NAME_RE / PW_MIN in js/sync.js).
   They are enforced here so a name that works on this phone can never be a
   name the cloud refuses — that mismatch was how a profile ended up stranded
   on one device with no way to say why. */
function createAccount(name, pw){
  name = (name || '').trim();
  if (!name) return { err:'Pick a username.' };
  if (name.length > 16) return { err:'Max 16 characters.' };
  if (!/^[A-Za-z0-9_ .\-]+$/.test(name))
    return { err:'Letters, numbers, spaces, dot, dash and underscore only.' };
  if (!pw) return { err:'Pick a password.' };
  if (pw.length < 6) return { err:'Password needs 6+ characters.' };
  const users = getUsers();
  const key = name.toLowerCase();
  if (users[key]) return { err:'That name is taken. Try another.' };
  const salt = randSalt();
  users[key] = { name, salt, hash: hashPw(salt, pw), created: Date.now() };
  /* Do not report success if the account was never written — the player would set a
     password, close the tab, and find the account simply does not exist. */
  if (!setUsers(users)) return { err:'This browser will not let the game save. Turn off private browsing, or free up space, and try again.' };
  /* brand new, empty save — never touches anyone else's */
  lsSet(saveKeyFor(key), DEFAULT_STATE());
  return { ok:true, key };
}
/* A CLOUD RESET HAS TO REACH THE PROFILE ON THIS PHONE TOO.
   loginAccount() below checks a LOCAL salted hash first and only asks the
   server when there is no profile here at all. So after a reset, the one
   device the player is actually holding would still answer "wrong password"
   with the new password and never get as far as the cloud — the reset would
   look like it had not worked. This re-keys the local profile to match.

   It is only ever called from the KARTI_SYNC.onReset hook, which fires after
   the SERVER accepted a code that only Terence could have sent them, so the
   proof of ownership has already happened somewhere that cannot be faked by
   editing this file. Missing profile: nothing to do — signInFromCloud() makes
   one on the way in. */
function relocalPassword(key, name, pw){
  if (!key || !pw) return false;
  const users = getUsers();
  const u = users[key];
  if (!u) return false;
  const salt = randSalt();
  users[key] = { name: u.name || name || key, salt, hash: hashPw(salt, pw),
                 created: u.created || Date.now() };
  return !!setUsers(users);
}

/* The one error the caller must be able to recognise WITHOUT string-sniffing:
   "not on this phone" is the signal to go and ask the cloud. */
const NO_LOCAL_PROFILE = 'No profile with that name on this device.';
function loginAccount(name, pw){
  const key = (name || '').trim().toLowerCase();
  if (!key) return { err:'Enter your username.' };
  const users = getUsers();
  const u = users[key];
  if (!u) return { err:NO_LOCAL_PROFILE, noProfile:true };
  if (hashPw(u.salt, pw || '') !== u.hash) return { err:'Wrong password. Try again.' };
  return { ok:true, key };
}
/* Turn the guest into a real account WITHOUT losing anything: the guest save
   (deck, collection, coins, story progress) is carried across wholesale. */
function upgradeGuest(name, pw){
  if (ACTIVE !== GUEST) return { err:'You are already signed in.' };
  const carried = lsGet(saveKeyFor(GUEST), null);
  const r = createAccount(name, pw);
  if (r.err) return r;
  /* THE ORDER HERE IS THE WHOLE POINT.
     createAccount() has just written an EMPTY save into the new slot. If the
     copy of the guest game into that slot fails — a full disk, private
     browsing, anything — and we delete the guest save anyway, the player has
     just traded a full collection for a brand new one. So: copy, read it back
     and check it really landed, and only then let go of the guest copy. If it
     did not land, the guest save stays exactly where it is and the player is
     told, still holding everything they had. */
  if (carried){
    const wrote = lsSet(saveKeyFor(r.key), carried);
    const back = lsGet(saveKeyFor(r.key), null);
    if (!wrote || !back){
      /* undo the half-made account rather than leave a stranded empty one */
      const users = getUsers();
      delete users[r.key];
      setUsers(users);
      try { localStorage.removeItem(saveKeyFor(r.key)); } catch(e){}
      return { err:'This browser will not let the game save, so nothing was moved. ' +
                    'Your guest game is untouched.' };
    }
    try { localStorage.removeItem(saveKeyFor(GUEST)); } catch(e){}
  }
  switchTo(r.key);
  /* carry any cloud session across from the guest profile */
  if (window.KARTI_SYNC) KARTI_SYNC.rekey(GUEST, r.key);
  return { ok:true, key:r.key };
}
function switchTo(key){
  ACTIVE = key;
  lsSet(ACTIVE_KEY, key);
  load();
  if (window.KARTI_SYNC) KARTI_SYNC.attach(key);
}
/* The one door out of a profile, and the mode is the cloud session:
     'out'    — sign this phone out of the cloud too (best-effort upload first).
                THE ONLY MODE ANY CALLER USES — the profile sheet's Log out.
     'switch' — (or any other value) step off this profile but keep the phone
                signed in to the cloud account, so stepping back on is instant
                and silent. Nothing calls this any more: the profile sheet used
                to carry a "Switch player" button beside Log out, and the two
                were one thing wearing two names — both land you on the auth
                screen, which is where you pick a player. The mode is kept
                because it is three lines and it is the seam to reopen if a
                "hand the phone over without signing out" case ever comes back.
   NEITHER touches a single byte of any save. Both land on the same screen. */
function logout(mode){
  if (window.KARTI_SYNC){
    if (mode === 'out'){
      /* the push subscription is THIS ACCOUNT's — it must not keep ringing
         for a phone that signed out. pushUnsubscribe() reads the session
         token synchronously before the sign-out below drops it, then works
         in the background; it can never block or fail the sign-out. */
      try { pushUnsubscribe(); } catch(e){}
      /* push anything unsaved before the token goes, then drop the token.
         signOut() keeps this device's sync bookkeeping, so logging back in
         does not look like a divergence and does not ask a pointless
         question. */
      try { KARTI_SYNC.flush(); } catch(e){}
      try { KARTI_SYNC.signOut(); } catch(e){}
    }
    KARTI_SYNC.detach();
  }
  cloudPending = null; cloudBusy = false;
  ACTIVE = null;
  try { localStorage.removeItem(ACTIVE_KEY); } catch(e){}
  D = null;
  authMode = 'menu';
  renderAuth(); go('auth');
}

/* ───────────────────── the cloud half of an account ─────────────────────
   Called AFTER the local account exists and AFTER switchTo() has bound sync to
   it. Everything in here is best-effort and off the critical path: it returns a
   promise nobody has to wait for, it cannot throw into a caller, and every
   failure ends with a playable game on this device.

   The password is used here and then forgotten. It is held in memory for this
   session only, so an offline sign-up can retry when the network comes back,
   and it is NEVER written to storage — a cloud credential at rest on the phone
   would be a password-equivalent sitting next to the save. */
let cloudPending = null;         // { key, name, pw } — memory only, never stored
let cloudBusy = false;           // one attempt at a time, see below
function cloudReady(){
  return !!(window.KARTI_SYNC && KARTI_SYNC.available && KARTI_SYNC.available());
}
function cloudStatus(){
  if (!cloudReady()) return { linked:false, available:false };
  const s = KARTI_SYNC.status();
  s.available = true;
  return s;
}
function cloudLink(key, name, pw, opts){
  opts = opts || {};
  if (!cloudReady()) return Promise.resolve({ err:'no-server' });
  const st = KARTI_SYNC.status();
  if (st.linked) return Promise.resolve({ ok:true, already:true });
  /* ONE attempt at a time. Without this, a retry that fires while the first
     registration is still in the air registers the same name twice: the second
     call gets "taken" — by itself — falls through to a login, and hands a
     brand new player a "two games, one account" question about a game they
     have never had. Found by watching it happen. */
  if (cloudBusy) return Promise.resolve({ err:'busy' });
  cloudBusy = true;
  cloudPending = { key, name, pw };
  const settle = r => {
    cloudBusy = false;
    if (cloudPending && cloudPending.key === key) cloudPending = null;
    return r;
  };
  const stop = r => { cloudBusy = false; return r; };   /* keep it pending */
  /* The name is already on the server. That is either the same player on a new
     phone — in which case their password opens it and sync.js decides what to
     do with the two saves, ASKING if they have both moved — or a stranger with
     the same name, in which case the password does not open it and we link
     nothing at all. Never a silent merge either way. */
  const asLogin = () => KARTI_SYNC.login(name, pw, { freshDevice: !!opts.freshDevice })
    .then(r => (r && r.ok) ? settle({ ok:true, joined:true })
                           : (r && r.offline ? stop(r) : settle(Object.assign({ taken:true }, r))),
          () => stop({ err:'no-server' }));
  return KARTI_SYNC.register(name, pw).then(r => {
    if (r && r.ok) return settle({ ok:true, made:true });
    if (r && r.status === 409) return asLogin();
    /* offline / server down: keep it pending and try again when the network
       comes back. The account is already real on this phone. */
    return stop(r || { err:'no-server' });
  }, () => stop({ err:'no-server' }));
}
/* One retry path, shared: the network came back, or the app came back to the
   foreground. Silent — it either quietly works or quietly does not. */
let cloudRetryT = 0;
function cloudRetry(){
  if (!cloudPending || cloudBusy || !ACTIVE) return;
  if (cloudPending.key !== ACTIVE) { cloudPending = null; return; }
  clearTimeout(cloudRetryT);
  cloudRetryT = setTimeout(() => {
    if (!cloudPending) return;
    const p = cloudPending;
    cloudLink(p.key, p.name, p.pw).then(r => {
      if (r && r.ok && current === 'home') renderHome();
    });
  }, 800);
}
window.addEventListener('online', cloudRetry);
document.addEventListener('visibilitychange', () => { if (!document.hidden) cloudRetry(); });

/* ───────────────────────── save state ───────────────────────── */
const DEFAULT_STATE = () => ({
  /* TWO CURRENCIES (the economy lives in js/progress.js §7b):
       chips — the PLAY currency: earned by playing anything, paid by
               the daily spin, staked in lobbies, spent on loot boxes.
               A new player starts with 250: enough to ante a few small
               staked games or open one small box on night one.
       coins — the SPEND currency: buys cosmetics and packs; comes OUT
               of loot boxes, never directly from play.
     dust is RETIRED. The field stays (an old save carries it, and the
     sync merge would resurrect it anyway); dustX records how much has
     been converted to coins by the one-time migration in progress.js.
     Both are plain numbers so mergeSaves() MAX-merges them safely. */
  owned:{}, dust:0, dustX:0, chips:250, coins:300, packs:1,
  decks:[], activeDeck:null, starters:[], side:null,
  rec:{ w:0, l:0 },
  /* which of the four sets packs come from, and the pity counters that stop a
     player sitting on a long dry run. load() Object.assigns over these defaults,
     so an old save picks them up without a migration. */
  packSet:null, pity:{ leg:0, epic:0, packs:0 },
  /* the daily free spin: the local date it was last taken, the epoch ms it was
     taken at (the clock-tamper guard), how many ever taken, and what the last
     one paid (shown on the come-back-tomorrow screen). */
  spin:{ day:'', t:0, n:0, last:'' }
});
let S = DEFAULT_STATE();

function load(){
  const o = lsGet(saveKeyFor(ACTIVE), null);
  S = Object.assign(DEFAULT_STATE(), o || {});
  S.rec = Object.assign({ w:0, l:0 }, S.rec || {});
  S.owned = S.owned || {}; S.decks = S.decks || []; S.starters = S.starters || [];
  S.spin = Object.assign({ day:'', t:0, n:0, last:'' }, S.spin || {});
  /* An old save (or a half-finished sync) can carry an activeDeck id whose deck
     is gone. Repair it on the way in, not on the way to a duel. */
  fixDeckState();
}
/* Sync is strictly optional: it is notified AFTER the local write, and every
   call inside it is wrapped, so the game saves exactly as before whether the
   Pi is reachable, unreachable, or the module was never loaded at all. */
function save(){
  if (ACTIVE) lsSet(saveKeyFor(ACTIVE), S);
  if (window.KARTI_SYNC) KARTI_SYNC.notifySaved();
}

const ownedCount = id => S.owned[id] || 0;
const uniqueOwned = () => CARDS.filter(c => ownedCount(c.id) > 0).length;

/* A duplicate past the copy cap converts to COINS now, not dust — dust
   is retired (see DEFAULT_STATE). The rarity's old dust value IS the
   coin value: dupes come out of packs, packs are loot, and coins are
   the loot-output currency, so nothing about the numbers had to move.
   The field is still called `dusted` on the way out because a dozen
   reveal call-sites read it; it means "coins paid for the dupe". */
function addCard(id){
  const card = cardById(id);
  if (!card) return { isNew:false, dusted:0 };
  const was = ownedCount(id);
  if (was >= MAX_COPIES){
    const d = RARITY[card.r].dust; S.coins += d;
    return { isNew:false, dusted:d };
  }
  S.owned[id] = was + 1;
  return { isNew: was === 0, dusted:0 };
}
function grantStarter(key){
  const d = STARTER_DECKS[key];
  if (!d) return null;
  for (const [id, n] of Object.entries(d.list)) S.owned[id] = Math.max(ownedCount(id), n);
  if (S.starters.indexOf(key) < 0) S.starters.push(key);
  let deck = S.decks.find(x => x.starter === key);
  if (!deck){
    deck = { id:'sd_' + key, name: d.name + ' STARTER', starter:key, list: Object.assign({}, d.list) };
    S.decks.push(deck);
  }
  S.activeDeck = deck.id; S.side = key; save();
  return deck;
}
const deckById = id => S.decks.find(d => d.id === id);
function activeDeck(){ return deckById(S.activeDeck) || S.decks[0] || null; }
const deckTotal = list => Object.values(list).reduce((a, b) => a + b, 0);
function deckIsLegal(list){
  if (deckTotal(list) !== DECK_SIZE) return false;
  for (const [id, n] of Object.entries(list)){
    if (n > MAX_COPIES || n < 1) return false;
    if (!cardById(id)) return false;
    if (ownedCount(id) < n) return false;
  }
  return true;
}

/* ───────────────────────── card rendering ───────────────────────── */
/* Real card art lands later as art/cards/<id>.jpg. Until ART.base is set we
   emit no <img> at all, so nothing 404s in the meantime; switching the art on
   is a one-liner (KARTI.ART.base = 'art/cards/') and every card everywhere
   picks it up. The emoji stays as the permanent fallback — if an image is
   missing or fails to decode it is removed and the emoji shows through. */
/* TWO sizes of every picture:
     art/<id>.jpg         ~135 KB  the real thing, for the card inspector and
                                   the pack / gacha reveal, where it fills the
                                   screen and is actually looked at;
     art/thumb/<id>.jpg    ~19 KB  256px, for grids, rails, board zones and
                                   deck rows — anywhere the card is smaller
                                   than the thumbnail anyway.
   The Collection is 200 cards. Asking for 200 full-size files at once is ~27 MB
   in one go: on a phone most of them simply never arrived and the player sat
   looking at the emoji fallback thinking the art was broken. Thumbnails plus
   loading="lazy" turns that into a few hundred KB for the cards on screen.
   Both paths hang off ART.base, so a deploy with no art pack still degrades to
   the emoji, and a deploy with art but no thumbs falls back to the full file. */
const ART = { base:null, ext:'.jpg', thumb:'thumb/', ui:{} };
const artURL = (card, big) => ART.base + (big ? '' : ART.thumb) + card.id + ART.ext;
function artImg(card, big){
  if (!ART.base) return '';
  const src = esc(artURL(card, big));
  const full = esc(artURL(card, true));
  return '<img class="artimg" alt="" decoding="async"' +
    (big ? '' : ' loading="lazy"') +
    ' src="' + src + '"' +
    (src === full ? '' : ' data-full="' + full + '"') +
    /* one retry at full size (art pack without thumbnails), then the emoji */
    ' onerror="if(this.dataset.full){this.src=this.dataset.full;' +
      'this.removeAttribute(\'data-full\')}else{this.remove()}"' +
    ' onload="this.parentNode.classList.add(\'hasart\')">';
}
/* Level pips stay as the text star U+2605 on purpose: it is a plain typographic
   dingbat (no emoji presentation, present in every default font), and a card can
   show six of them — 200 cards x 6 <use> nodes is a lot of DOM for no gain. */
function stars(lvl){
  if (!lvl) return '';
  return lvl > 6 ? '★'.repeat(6) + '+' + (lvl - 6) : '★'.repeat(lvl);
}
function cardEl(card, opts){
  opts = opts || {};
  const size = opts.size || 'md';
  /* only the two sizes a player actually studies get the full-size picture:
     lg = the card inspector, md = the pack / gacha reveal */
  const bigArt = size === 'lg' || size === 'md';
  const d = document.createElement('div');
  d.className = 'card ' + size + (opts.tap ? ' tap' : '') + ' cat-' + card.t;
  if (card.r === 'epiku') d.classList.add('holo');
  if (card.r === 'leggendarju') d.classList.add('holo', 'holo-leg');
  if (opts.dim) d.classList.add('dim');
  d.style.setProperty('--fc', frameColor(card));
  d.style.setProperty('--rc', RARITY[card.r] ? RARITY[card.r].c : '#888');
  d.dataset.cid = card.id;
  const isMon = card.t === 'monster';
  d.innerHTML =
    '<div class="in">' +
      '<div class="hd"><span class="nm">' + esc(card.n) + '</span>' +
        '<span class="at" role="img" aria-label="' + esc(markLabel(card)) + '">' +
          ico(markIcon(card)) + '</span></div>' +
      '<div class="lv"><span class="ty">' + ico(CAT_ICON[card.t]) +
        '<span>' + esc(typeName(card)) + '</span></span>' +
        '<span class="sr">' + (isMon ? stars(card.lvl) : '') + '</span></div>' +
      '<div class="art">' + artImg(card, bigArt) + '<span>' + esc(card.e) + '</span></div>' +
      '<div class="tx">' + esc(card.txt) + '</div>' +
      '<div class="ef">' + esc(effText(card)) + '</div>' +
      (isMon
        ? '<div class="st"><b><span class="lbl">ATK</span> ' + card.atk + '</b>' +
          '<i><span class="lbl">DEF</span> ' + card.def + '</i></div>'
        : '<div class="st" style="justify-content:center"><b style="color:var(--fc)">' +
          esc(card.t.toUpperCase()) + '</b></div>') +
      '<span class="gem" role="img" aria-label="' +
        esc(RARITY[card.r] ? RARITY[card.r].n : 'Unknown rarity') + '">' +
        ico(RARITY_ICON[card.r] || 'rar-komuni') + '</span>' +
    '</div>' +
    /* Only ever passed at the moment a card is RECEIVED — never in the
       Collection, where a card you own is not news. Outside .in on purpose:
       .in clips its overflow and the banner has to stand proud of the frame.
       isNew and isDupe are two states of one verdict and are mutually
       exclusive: whoever grants the card decides which, reading ownership
       BEFORE the grant (see addCard) or every card in the game reads as a
       duplicate. dupeDust, when non-zero, is what the copy turned into. */
    (opts.isNew ? '<span class="newbadge">New</span>' :
     opts.isDupe ? '<span class="dupebadge">Duplicate' +
       (opts.dupeDust ? '<i>' + coinIco() + '+' + opts.dupeDust + '</i>' : '') +
       '</span>' : '');
  if (opts.isNew) d.classList.add('is-new');
  else if (opts.isDupe) d.classList.add('is-dupe');
  return d;
}
function backEl(size){
  const d = document.createElement('div');
  d.className = 'card back ' + (size || 'md');
  d.innerHTML = '<div class="in"></div>';
  return d;
}
function cardViewModal(card){
  /* js/cardview.js replaces this with a proper animated bottom sheet when
     present; this stays as the no-frills fallback. */
  if (window.KARTI_CARDVIEW && KARTI_CARDVIEW.show) return KARTI_CARDVIEW.show(card);
  const owned = ownedCount(card.id);
  const trib = card.t === 'monster' ? tributesFor(card.lvl) : 0;
  const box = $('#mbox');
  box.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'cardview';
  wrap.appendChild(cardEl(card, { size:'lg' }));
  const meta = document.createElement('div');
  meta.style.width = '100%';
  meta.innerHTML =
    '<p class="tiny" style="text-align:center;margin:0 0 8px">' +
      (RARITY[card.r] ? RARITY[card.r].n : '?') + ' · ' + esc(typeName(card)) +
      (card.t === 'monster'
        ? ' · Level ' + card.lvl + ' · ' + (trib ? trib + ' tribute' + (trib > 1 ? 's' : '') : 'no tribute')
        : '') + '</p>' +
    '<p class="joke">“' + esc(card.txt) + '”</p>' +
    (effText(card) ? '<p class="effect">' + ico('bolt') + ' ' + esc(effText(card)) + '</p>' : '') +
    '<p class="tiny" style="text-align:center;margin-top:10px">' +
      (owned ? 'You own ' + owned + ' / ' + MAX_COPIES
             : 'Not in your collection · a spare copy pays ' + (RARITY[card.r] ? RARITY[card.r].dust : 0) + ' coins') + '</p>';
  wrap.appendChild(meta);
  const btn = document.createElement('button');
  btn.className = 'btn ghost sm'; btn.style.width = '100%'; btn.textContent = 'Close';
  btn.onclick = closeModal;
  wrap.appendChild(btn);
  box.appendChild(wrap);
  $('#modal').classList.add('on');
}

/* ───────────────────────── router ───────────────────────── */
const SCREENS = ['auth','home','pack','coll','deck','duel','story','pnp','mp','gacha','tutor','friends'];
let current = 'auth';
/* Home's bottom nav marks whichever of its four destinations you are on.
   Nothing is marked while you are on Home itself — Home is not one of the four.
   Driven off the router rather than off the click handlers, so it stays honest
   however a screen was reached (a back button, Escape, a restored session), and
   so the bar could be shown on another screen later with no further wiring. */
function navSync(name){
  $$('#home-nav .tab').forEach(t => {
    if (t.dataset.scr === name) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
}

function go(name){
  /* Leaving the Inventory screen commits whatever the deck builder was holding
     and drops you back on the deck LIST, so arriving at Inventory from anywhere
     always shows your decks rather than mid-edit card soup. */
  if (current === 'deck' && name !== 'deck'){
    if (typeof commitDraft === 'function') commitDraft();
    dbDeck = null; deckView = 'list';
  }
  SCREENS.forEach(s => { const el = $('#scr-' + s); if (el) el.classList.toggle('on', s === name); });
  current = name;
  navSync(name);
  /* the gold dot on the Store tab while the daily spin is waiting */
  try { updateSpinBadge(); } catch (e){}
  /* a forced navigation (an mp event, a restored session) must never leave
     the daily-spin prize popup stranded over the wrong screen. The prize is
     already saved; only the curtain is dismissed. */
  try { spinPopKill(); } catch (e){}
  closeSheet(); closeModal();
  /* mp.js keeps the who's-online panel alive only while Home is on screen —
     nothing polls or holds a socket once you have navigated away. */
  if (window.KARTI_MP && KARTI_MP.onScreen) KARTI_MP.onScreen(name);
  if (name === 'auth') renderAuth();
  if (name === 'home') renderHome();
  if (name === 'pack') renderPackScreen();
  if (name === 'coll') renderCollection();
  if (name === 'deck') renderDeckBuilder();
  /* The multiplayer screens paint themselves before navigating, so reaching them
     any other way — a back gesture, a restored session, anything that calls go()
     directly — left the player staring at a blank screen. Paint on arrival too;
     both renders are idempotent. */
  if (name === 'mp'  && window.KARTI_MP && KARTI_MP.mpScreen)  KARTI_MP.mpScreen();
  if (name === 'pnp' && window.KARTI_MP && KARTI_MP.pnpScreen) KARTI_MP.pnpScreen();
}

/* ───────────────────────── AUTH screen ───────────────────────── */
/* The app's bilingual helper, resolved at PAINT time so a language switch
   repaints correctly. Same shape the game UIs use (js/lang.js). */
const AT = (en, mt) => (window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en);
let authMode = 'menu';   // menu | signup | login
function renderAuth(){
  const users = getUsers();
  const names = Object.keys(users);
  const b = $('#auth-body');
  if (authMode === 'menu'){
    b.innerHTML =
      /* No login wall: the first and biggest button plays the game. An account
         is optional and can be made later without losing anything. */
      '<div style="display:grid;gap:9px">' +
        '<button class="btn hot" data-act="guest">▶ Play now</button>' +
      '</div>' +
      (names.length
        ? '<p class="tiny" style="text-align:center;margin:14px 0 8px">or pick up where you left off</p>' +
          '<div class="userlist">' + names.map(k =>
            '<button class="userrow" data-u="' + esc(k) + '">' +
              /* the same declarative avatar span as everywhere else; the
                 initial inside is only the no-modules fallback */
              '<span class="avatar" data-kx-av="' + esc(users[k].name) + '" data-kx-size="38">' +
                esc(users[k].name.charAt(0).toUpperCase()) + '</span>' +
              '<span class="n">' + esc(users[k].name) + '</span>' +
              '<span class="tiny">Log in ›</span></button>').join('') + '</div>'
        : '') +
      /* Log in is NOT conditional any more. It used to appear only once a profile
         existed on the device, so on a fresh phone the screen offered no way to
         log in at all and looked like the feature was missing. It is always here;
         with no profiles saved it now still WORKS — an account made on another
         phone is fetched from the cloud. */
      '<div style="display:grid;gap:9px;margin-top:10px">' +
        '<button class="btn ghost" data-act="login">' + ilb('lock', 'Log in') + '</button>' +
        '<button class="btn ghost" data-act="signup">' + ilb('save', 'Create an account') + '</button>' +
      '</div>';
    $$('.userrow', b).forEach(el => el.onclick = () => { authMode = 'login'; renderAuth();
      const f = $('#au-name'); if (f){ f.value = users[el.dataset.u].name; $('#au-pw').focus(); } });
  } else {
    const isNew = authMode === 'signup';
    b.innerHTML =
      '<h3 style="text-align:center;font-size:15px;margin-bottom:10px">' +
        (isNew ? 'Create an account' : 'Log in') + '</h3>' +
      '<p class="muted">' + (isNew
        ? 'One account, and it follows you: your cards, decks, coins and story go to ' +
          'Terence’s server so you can log in on another phone and carry on. It is made ' +
          'on this phone first — if the server is off you still play, and it goes up later.'
        : (names.length
            ? 'Your profiles on this phone are below. Made your account on another phone? ' +
              'Type it here and your game is fetched from the cloud.'
            : 'Made your account on another phone? Type it here and your game is fetched ' +
              'from the cloud.')) + '</p>' +
      '<label class="tiny" for="au-name" style="display:block;margin-top:8px">Username</label>' +
      '<input class="field" id="au-name" autocomplete="username" maxlength="16" placeholder="e.g. Terence">' +
      '<label class="tiny" for="au-pw" style="margin-top:8px;display:block">Password</label>' +
      '<input class="field" id="au-pw" type="password" autocomplete="' +
        (isNew ? 'new-password' : 'current-password') + '" placeholder="6+ characters">' +
      '<p class="err" id="au-err"></p>' +
      '<div style="display:grid;gap:9px;margin-top:6px">' +
        '<button class="btn primary" id="au-go" data-act="' + (isNew ? 'do-signup' : 'do-login') + '">' +
          (isNew ? 'Create & play' : 'Log in') + '</button>' +
        /* Only on the LOG IN page, and only when there is a server to reset
           against: a password lives in the cloud account, so with no cloud
           configured there is nothing here that could be reset. */
        ((!isNew && cloudReady())
          ? '<button class="btn ghost" data-act="forgot">' +
              esc(AT('Forgotten your password?', 'Insejt il-password?')) + '</button>'
          : '') +
        '<button class="btn ghost" data-act="back">Back</button>' +
      '</div>';
    const submit = () => b.querySelector('[data-act^="do-"]').click();
    $('#au-pw').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    $('#au-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('#au-pw').focus(); });
  }
  $$('[data-act]', b).forEach(el => el.onclick = () => authAction(el.dataset.act));
}
function authBusy(on, label){
  const go = $('#au-go');
  if (!go) return;
  go.disabled = !!on;
  go.textContent = on ? (label || 'Working…')
    : (authMode === 'signup' ? 'Create & play' : 'Log in');
}
function authErr(msg){
  const e = $('#au-err');
  if (e) e.textContent = msg || '';
}
function authAction(act){
  if (act === 'signup'){ authMode = 'signup'; renderAuth(); return; }
  if (act === 'login'){ authMode = 'login'; renderAuth(); return; }
  if (act === 'back'){ authMode = 'menu'; renderAuth(); return; }
  if (act === 'guest'){ switchTo(GUEST); authMode = 'menu'; afterLogin(); return; }
  /* The reset flow lives WHOLE in sync.js — one panel, one copy of the code
     handling, one place that knows the credential shape. Carry whatever name
     they already typed so nobody types it twice. */
  if (act === 'forgot'){
    if (!cloudReady()){ authErr(NO_LOCAL_PROFILE); return; }
    const typed = ($('#au-name') || {}).value || '';
    KARTI_SYNC.openPanel('forgot', { user: typed.trim() });
    return;
  }
  const name = $('#au-name').value, pw = $('#au-pw').value;

  if (act === 'do-signup'){
    /* Local first, always. The account exists the instant this returns, with a
       save slot of its own, whether or not there is any network. */
    const r = createAccount(name, pw);
    if (r.err){ authErr(r.err); return; }
    switchTo(r.key); authMode = 'menu'; afterLogin();
    /* A face, once, right after the account exists. Deliberately AFTER
       — the wording above was already right and is untouched — and it
       is skippable, changeable, and never in the way of playing. */
    if (window.KARTI_XP && KARTI_XP.pickAvatar)
      setTimeout(() => { try { KARTI_XP.pickAvatar({ first:true }); } catch(e){} }, 420);
    cloudLink(r.key, name.trim(), pw, {}).then(res => {
      if (res && res.ok && res.made) toast('Account made. Your game is in the cloud now.');
      else if (res && res.ok && res.joined) toast('Logged in to your cloud account.');
      else if (res && res.taken)
        toast('That name is taken in the cloud. Your game is safe here — pick a cloud name in Settings.');
      else toast('Account made on this phone. It will go to the cloud when the server is back.');
      if (current === 'home') renderHome();
    });
    return;
  }

  /* ── log in ──────────────────────────────────────────────────────────
     A profile on THIS phone is the fast, offline path and is tried first.
     Only if there is no such profile here do we ask the server — that is the
     new-phone case, and it is the only one that has to wait for a network. */
  const local = loginAccount(name, pw);
  if (local.ok){
    switchTo(local.key); authMode = 'menu'; afterLogin();
    /* quietly finish the cloud half if it was never done (made offline, or
       made before this device had a server) */
    cloudLink(local.key, getUsers()[local.key].name, pw, {}).then(res => {
      if (res && res.ok && current === 'home') renderHome();
    });
    return;
  }
  /* A LOCAL PROFILE THAT DISAGREES IS NOT AUTHORITY, IT IS A CACHE.
     The local salted hash exists so this phone can log in with no server. It
     was never meant to be the last word — but it was: a wrong local hash
     returned "Wrong password" and the cloud was never asked. That is what
     stranded the owner after a password reset (build 283). The server had the
     new password, this phone had the old one, and the phone won.
     So when the local check fails and we CAN reach the Pi, ask it. If the
     server says yes, signInFromCloud re-keys this profile on the way in and
     the divergence heals itself. If the Pi is off, the local answer stands —
     offline play is exactly why the local hash is there. */
  if (!local.noProfile){
    if (cloudReady()){ signInFromCloud(name, pw); return; }
    authErr(local.err);
    return;
  }
  signInFromCloud(name, pw);
}

/* ─────────────── first time on this phone: fetch the account ───────────────
   Nothing is written to this device until the server has said yes. If the
   password is wrong, or the Pi is off, this phone is left exactly as it was.  */
function signInFromCloud(name, pw){
  const key = (name || '').trim().toLowerCase();
  if (!cloudReady()){ authErr(NO_LOCAL_PROFILE); return; }
  authErr(''); authBusy(true, 'Checking…');
  /* Bind sync to the slot this account WOULD occupy. attach() only reads; it
     writes nothing, so a failed login leaves no trace. karti_active is pointed
     at it too, because sync.js follows that key and would otherwise unbind us
     mid-login; boot() ignores an active key with no profile behind it, so a
     crash in this window lands harmlessly back on this screen. */
  /* ACTIVE moves with it: when the pull lands, sync.js calls back into load(),
     and load() reads whichever slot ACTIVE names. Leaving ACTIVE null here made
     that callback read a slot called "null", find nothing, and open the starter
     roll over the top of a player who already owns a collection. */
  ACTIVE = key;
  lsSet(ACTIVE_KEY, key);
  KARTI_SYNC.attach(key);
  KARTI_SYNC.login(name.trim(), pw, { freshDevice:true }).then(r => {
    authBusy(false);
    if (!r || !r.ok){
      ACTIVE = null;
      try { localStorage.removeItem(ACTIVE_KEY); } catch(e){}
      KARTI_SYNC.detach();
      authErr((r && r.err) ? r.err
        : 'No profile with that name on this phone, and the server did not answer.');
      return;
    }
    /* The server accepted the password, so this name and password are theirs:
       give them the local profile to match, using the SAME salted-hash scheme
       as any other profile on this device.

       RE-KEY EVEN WHEN A PROFILE ALREADY EXISTS. This used to be guarded by
       `if (!users[key])`, which quietly made a stale local password permanent:
       the server accepts the new one, the player gets in, and the OLD hash
       stays on the phone — so the next offline login fails again and the fix
       never sticks. The server has just proved this password is correct for
       this account, so it is the truth and the local copy should match it.
       `created` is preserved so the profile keeps its age. */
    const users = getUsers();
    const had = users[key];
    const salt = randSalt();
    users[key] = { name: (had && had.name) || name.trim(), salt, hash: hashPw(salt, pw),
                   created: (had && had.created) || Date.now() };
    setUsers(users);
    switchTo(key); authMode = 'menu';
    toast('Welcome back, ' + displayName() + '.');
    afterLogin();
  }, () => {
    authBusy(false);
    ACTIVE = null;
    try { localStorage.removeItem(ACTIVE_KEY); } catch(e){}
    KARTI_SYNC.detach();
    authErr('The server did not answer. Your game on this phone is unaffected.');
  });
}
function afterLogin(){
  if (!S.starters.length) toast('Welcome. Take a beginner deck, then get stuck in.');
  go('home');
}

/* ───────────────────────── HOME ───────────────────────── */
/* What a locked starter deck costs. js/gacha.js discounts the two decks you
   rolled but did not keep — you have already seen them, so they are cheaper. */
function starterPrice(key){
  if (window.KARTI_GACHA && KARTI_GACHA.priceOf) return KARTI_GACHA.priceOf(key);
  return 400;
}
/* ───────────────────── THE LIVE WALLET ─────────────────────────────
   Chips and coins on the front door, and they MOVE: when currency
   lands (a game paid out, a box opened, the daily spun) the counter
   counts up with an ease-out rather than snapping, the pill pops, and
   a little "+N" floats off it. All of it is transform/opacity + a
   number being rewritten — no layout thrash — and all of it collapses
   to an instant, still update under reduced motion.
   The events come from KARTI_XP.onWallet (js/progress.js §7b), the
   single door every currency movement already fires through. */
/* ── ONE PLACE THAT DECIDES WHAT MONEY LOOKS LIKE ─────────────────────
   Every mention of chips or coins anywhere in the app — the wallet, the
   store, the spin, a result line, a price tag — comes through these two.
   They now serve the PAINTED art (the KARTI chip, the Maltese-cross coin);
   if it is missing they fall back to the old line glyph, so nothing can end
   up blank. Changing money's look is a one-line change here, not a hunt
   through twenty call sites. */
function glyphCoin(label, cls){ return ico('coin', label, cls); }
function curInline(kind, label, cls){
  const chips = (kind === 'chips');
  const fb = (chips
      ? (function(){ try { if (window.KARTI_XP && KARTI_XP.chipICO) return KARTI_XP.chipICO(label, cls); } catch (e){} return glyphCoin(label, cls); })()
      : glyphCoin(label, cls)).replace(/"/g, '&quot;');
  return '<img class="curpill' + (cls ? ' ' + cls : '') + '" ' +
    'src="art/ui/cur-' + (chips ? 'chip' : 'coin') + '-1.png" ' +
    (label ? 'alt="' + esc(label) + '"' : 'alt="" aria-hidden="true"') + ' ' +
    'onerror="this.outerHTML=&quot;' + fb + '&quot;">';
}
function chipIco(label, cls){ return curInline('chips', label, cls); }
function coinIco(label, cls){ return curInline('coins', label, cls); }
/* ── THE PILE GROWS WITH THE PRIZE ─────────────────────────────────────
   One lonely coin under "700 coins" reads as loose change. The reward art
   comes in four painted tiers and the AMOUNT picks which: a single hero coin
   for pocket money, an overflowing jackpot mound for a big roll. If the art
   has not landed the <img> removes itself, so this can never show a broken
   picture — the number and label still carry the message. */
const CUR_TIERS = { coins:[0, 50, 200, 600], chips:[0, 40, 150, 400] };
function curTier(kind, n){
  const t = CUR_TIERS[kind === 'chips' ? 'chips' : 'coins'];
  n = Math.max(0, n | 0);
  let i = 1;
  for (let k = 0; k < t.length; k++) if (n >= t[k]) i = k + 1;
  return Math.min(4, Math.max(1, i));
}
function curArt(kind, n, cls){
  const k = (kind === 'chips') ? 'chip' : 'coin';
  return '<img class="curart' + (cls ? ' ' + cls : '') + '" alt="" aria-hidden="true" ' +
    'src="art/ui/cur-' + k + '-' + curTier(kind, n) + '.png" ' +
    'onerror="this.remove()">';
}
/* the small one, for a wallet pill or an inline mention. Always the single
   hero object — a pile does not read at this size. If the art is missing the
   old glyph takes its place rather than leaving a hole. */
function curPill(kind, label){ return curInline(kind === 'chips' ? 'chips' : 'coins', label); }
function curPillUNUSED(kind, label){
  const chips = (kind === 'chips');
  const fb = (chips ? chipIco(label || '') : coinIco(label || ''))
    .replace(/"/g, '&quot;');
  return '<img class="curpill" src="art/ui/cur-' + (chips ? 'chip' : 'coin') + '-1.png" ' +
    'alt="' + esc(label || (chips ? 'Chips' : 'Coins')) + '" ' +
    'onerror="this.outerHTML=&quot;' + fb + '&quot;">';
}
/* count el's .mono up/down to `to`. Interruptible: a second call takes
   over from wherever the number visibly is. */
function animateCount(el, to){
  if (!el) return;
  const m = el.querySelector('.mono') || el;
  const from = parseInt(String(m.textContent).replace(/[^\d-]/g, ''), 10) || 0;
  to = to | 0;
  if (REDUCED || from === to || Math.abs(to - from) > 100000){ m.textContent = to; return; }
  if (m._cnt) cancelAnimationFrame(m._cnt);
  const t0 = performance.now(), ms = Math.min(900, 320 + Math.abs(to - from) * 2);
  const step = now => {
    const f = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - f, 3);              /* ease-out cubic     */
    m.textContent = Math.round(from + (to - from) * e);
    if (f < 1) m._cnt = requestAnimationFrame(step);
    else m._cnt = 0;
  };
  m._cnt = requestAnimationFrame(step);
}
function walletBump(el, delta){
  if (!el) return;
  walletFxCSS();
  el.classList.remove('wbump'); void el.offsetWidth;
  el.classList.add('wbump');
  if (REDUCED || !delta) return;
  const f = document.createElement('i');
  f.className = 'wfloat' + (delta < 0 ? ' neg' : '');
  f.textContent = (delta > 0 ? '+' : '') + delta;
  el.appendChild(f);
  setTimeout(() => { try { f.remove(); } catch (e){} }, 950);
}
let walletWired = false;
function wireWallet(){
  if (walletWired || !window.KARTI_XP || !KARTI_XP.onWallet) return;
  walletWired = true;
  KARTI_XP.onWallet(ev => {
    try {
      const ch = $('#w-chips'), co = $('#w-coins');
      if (ch){ animateCount(ch, ev.chips); if (ev.dChips) walletBump(ch, ev.dChips); }
      if (co){ animateCount(co, ev.coins); if (ev.dCoins) walletBump(co, ev.dCoins); }
      /* the store's header pill follows the same movement */
      if (current === 'pack') updateCoinsPill(true);
    } catch (e){}
  });
  /* remember the most recent play award so the duel's result card can
     say what the game ACTUALLY paid (the payment itself happens in
     progress.js the moment the 'over' event lands — 700ms before the
     card goes up — this is only the receipt) */
  if (KARTI_XP.onAward) KARTI_XP.onAward(r => { lastAward = Object.assign({ at: Date.now() }, r); });
}
let lastAward = null;
let walletFxDone = false;
function walletFxCSS(){
  if (walletFxDone || $('#kwallet-css')) { walletFxDone = true; return; }
  walletFxDone = true;
  const st = document.createElement('style');
  st.id = 'kwallet-css';
  st.textContent =
    /* the chip pill's icon is festa crimson — the coin stays gold — so
       the two currencies can never be mistaken at a glance */
    '#scr-home .wallet .pill.chips .ico{color:color-mix(in srgb,var(--kx-accent-2,#E63950) 78%,#fff)}' +
    '@supports not (color:color-mix(in srgb,red 50%,blue)){' +
      '#scr-home .wallet .pill.chips .ico{color:#FF7585}}' +
    '.pill.wbump{animation:kwBump .45s cubic-bezier(.2,1.6,.4,1)}' +
    '@keyframes kwBump{0%{transform:scale(1)}35%{transform:scale(1.14)}100%{transform:scale(1)}}' +
    '.pill{position:relative}' +
    '.wfloat{position:absolute;left:50%;top:-2px;transform:translate(-50%,0);' +
      'font:800 11px/1 var(--disp,inherit);color:var(--gold,#FFC542);pointer-events:none;' +
      'text-shadow:0 1px 3px rgba(0,0,0,.7);animation:kwFloat .9s ease-out forwards}' +
    '.wfloat.neg{color:#FF7585}' +
    '@keyframes kwFloat{0%{opacity:0;transform:translate(-50%,2px)}18%{opacity:1}' +
      '100%{opacity:0;transform:translate(-50%,-16px)}}' +
    '@media (prefers-reduced-motion:reduce){.pill.wbump{animation:none}.wfloat{display:none}}' +
    '.reduced .pill.wbump{animation:none}.reduced .wfloat{display:none}';
  document.head.appendChild(st);
}

function renderHome(){
  /* No deck yet? You do not get a free pick of all seven — you get a roll of
     three (js/gacha.js). Routed from here so a reload cannot dodge it. */
  if (!S.starters.length && window.KARTI_GACHA && KARTI_GACHA.open){ KARTI_GACHA.open(); return; }
  const chip = $('#profile-chip');
  /* The pill is a data-kx-av span like every other face in the app — the
     SAME declarative box the profile sheet uses, filled by the same
     paintOne() in js/progress-ui.js, which is the only avatar renderer
     there is. This chip has been wrong three separate ways precisely
     because it used to be special (a bare initial, then a direct call
     with its own options); now there is nothing here to get wrong but a
     name and a size. The initial inside is the fallback for a boot where
     the XP modules never arrive. paint() fills it synchronously when
     they are already here; the observer in progress-ui fills it the
     moment they load, and repaints it on every face/border/photo change. */
  /* THE LEVEL RIDES ON THE BORDER HERE TOO, and that is why the
     medallion is 44 rather than the 32 it was. The badge is suppressed
     below 40 on purpose — at 32 the digits are six pixels tall, which
     is grit on the ring rather than a number — so home either grows the
     medallion or it does not get the level. A separate chip beside the
     name was tried and it was the wrong answer: the level then existed
     in two different shapes in one app, and the home screen is exactly
     where the player learns what the shape means. */
  const nm = displayName();
  chip.innerHTML =
    '<span class="avatar" data-kx-av="' + esc(nm) + '" data-kx-size="44">' +
      esc(nm.charAt(0).toUpperCase()) + '</span>' +
    '<span class="pc-nm">' + esc(nm) + '</span>';
  chip.onclick = profileSheet;
  try { window.KARTI_XP && KARTI_XP.paint && KARTI_XP.paint(chip); } catch (e){}

  const d = activeDeck();
  /* THE WALLET, top-right, opposite the profile. CHIPS and COINS — the
     two currencies of the economy (js/progress.js §7b), each with its
     own unmistakable icon: the poker chip (rim, inset, edge ticks, in
     festa crimson) for the PLAY currency, the gold coin for the SPEND
     currency. Dust is retired and its pill is gone. Compact icon+value
     chips, no word labels (the icons carry it — and each pill carries
     a title for the long-press curious). The values are live: the
     onWallet hook below counts them up with easing and pops the pill
     whenever currency lands, so earning is felt on the front door. */
  wireWallet();
  /* THE PILLS WEAR THE REAL ART. The painted single chip (KARTI struck on its
     face) and the Maltese-cross coin, not the old line glyphs — the front door
     is where the currency is seen most, so it gets the good picture. Tier 1 on
     purpose: a pile is mush at 22px; the hero object reads instantly. Each
     <img> falls back to the glyph if the art is missing, so a pill is never
     blank and never broken. */
  $('#wallet').innerHTML =
    '<span class="pill chips" id="w-chips" title="Chips — earned by playing; stake them, or spend them on loot boxes">' +
      curPill('chips', 'Chips') + '<span class="mono">' + (S.chips | 0) + '</span></span>' +
    '<span class="pill coins" id="w-coins" title="Coins — out of loot boxes; buy cosmetics and packs">' +
      curPill('coins', 'Coins') + '<span class="mono">' + (S.coins | 0) + '</span></span>';

  /* THE CARDS CHIP — the "N/total cards" indicator, now the way into the
     Collection (the destination the old Collection tab opened). */
  const cc = $('#cards-count');
  if (cc) cc.textContent = uniqueOwned() + '/' + CARDS.length;
  const ccChip = $('#cards-chip');
  if (ccChip) ccChip.onclick = () => go('coll');

  /* THE DAILY SPIN — home entry to the app's existing daily reward. Ready vs
     claimed comes straight off spinState(); tapping opens the Store's Daily
     Spin tab either way (claimed shows the countdown there). */
  renderDailySpinBtn();

  renderDeckPicker();
  const legal = d && deckIsLegal(d.list);
  /* Inventory tab. There is no "Quick duel" entry any more — you start a duel
     through Story Mode or Multiplayer — so the deck-legality warning lives on the
     tab that can actually fix it. A tab bar must never reflow, so it is a badge
     rather than an appended icon, and the detail stays in the tooltip. */
  const warn = $('#deck-warn');
  if (warn) warn.hidden = !(d && !legal);
  const dtab = $('#btn-deck');
  if (dtab) dtab.title = d ? d.name + ' · ' + deckTotal(d.list) + '/' + DECK_SIZE +
    (legal ? '' : ' — not legal') : 'pick a deck first';
  /* Everything that changes a deck from outside the Inventory screen —
     chooseSide() on the beginner picker, a cloud pull in js/sync.js — ends with
     renderHome(). If the player is looking at the deck list right now, repaint
     it too, so it can never show a deck that has just been replaced. */
  if (current === 'deck' && deckView === 'list' && $('#inv-root')) renderInventory();
  /* THE MAILBOX BADGE — js/mail.js owns it entirely; this is the one hook.
     It renders an IN-FLOW chip inside .headleft (never a fixed bar — see
     the #kl-inst lesson in index.html) and only when there is mail. */
  try { window.KARTI_MAIL && KARTI_MAIL.onHome && KARTI_MAIL.onHome(); } catch (e){}
}
/* ───────────────────── the profile chip's sheet ─────────────────────
   Your face, and the things you can DO — open the record book, settings,
   log out, close. Nothing else. The one extra button is the way to
   make an account, and it is shown only when there is not one yet: offering
   "play on another phone" to somebody who is already signed in on this phone
   is an instruction with nothing behind it.
   The status line under the face is now shown ONLY when it has something to
   say (see cloudLine): the routine "signed in, saved N ago" was developer
   noise on a menu you open to change your face. */
function cloudLine(){
  const s = cloudStatus();
  if (ACTIVE === GUEST && !s.linked)
    return { cls:'off', text:AT('Playing as a guest — this game is on this phone only.',
                                'Qed tilgħab bħala mistieden — din il-logħba qiegħda fuq dan it-telefon biss.') };
  /* THERE IS NO SUCH THING AS A "CLOUD ACCOUNT" HERE. An account IS kept for
     you and IS saved — that is what making one means, and the owner has said
     so twice. Naming the cloud separately invented a second idea a player then
     had to reason about, and made a signed-in player wonder whether they were
     missing a step. So the line says who you are and when it last saved. */
  if (s.linked){
    const when = (KARTI_SYNC.whenText ? KARTI_SYNC.whenText(s.lastAt) : '');
    if (s.phase === 'conflict')
      return { cls:'warn', text:s.user + AT(' — waiting for you to choose which game to keep.',
                                            ' — qed jistenna li tagħżel liema logħba żżomm.') };
    if (s.online === false)
      return { cls:'warn', text:s.user + AT(' — the server is not answering. Your game is ' +
                                            'safe on this phone and will save when it does.',
                                            ' — is-server mhux iwieġeb. Il-logħba tiegħek hija ' +
                                            'żgura fuq dan it-telefon u tissejvja meta jwieġeb.') };
    /* THE ONE ROUTINE CASE — nothing is wrong, nothing needs doing, and
       "saved 3 h ago" reads to a player like a warning that it did NOT save.
       It is flagged `routine` rather than deleted: SETTINGS is where you go to
       look at the account, so the line still belongs there, while the profile
       sheet (which you open to change your face, or to get off this profile)
       leaves it out. Every OTHER branch of this function is telling the player
       something they may have to act on — guest, conflict, server down, not
       backed up —
       and none of them carry the flag, so none of them can be dropped by the
       same test. */
    return { cls:'on', routine:true, text:s.user + ' · ' +
             (s.lastAt ? AT('saved ', 'issejvja ') + when : AT('saving…', 'qed jissejvja…')) };
  }
  if (cloudPending)
    return { cls:'warn', text:AT('Made on this phone. It goes to the cloud as soon as the ' +
                                 'server answers.',
                                 'Magħmul fuq dan it-telefon. Jitla\' fis-sħaba hekk kif ' +
                                 'is-server iwieġeb.') };
  return { cls:'off', text:AT('On this phone only — not backed up.',
                              'Fuq dan it-telefon biss — mhux ibbekkjat.') };
}
function profileSheet(){
  injectAccountCSS();
  const s = cloudStatus();
  const line = cloudLine();
  /* A guest is always offered an account — the local half of it works with no
     server at all. An existing profile is only offered the cloud half when
     there is a server module to do it with, so the button can never be a dead
     end. Either way it disappears the moment the player IS in the cloud. */
  const needsAccount = !s.linked && (ACTIVE === GUEST || cloudReady());
  openSheet(
    '<h3>' + esc(displayName()) + '</h3>' +
    /* NAME, THEN FACE, AND THE FACE IS THE DOOR. There is no
       "Customise" row any more: the thing you want to change is
       already on screen, and tapping the thing you want to change is
       the obvious gesture. js/progress-ui.js draws the face into the
       data-kx-av span and styles .kx-pfav; the caption under it is
       there so this can never be a hidden hotspot. */
    (window.KARTI_XP
      ? '<button class="kx-pfav" id="pf-av" aria-label="' +
          esc(AT('Change how you look', 'Ibdel kif tidher')) + '">' +
          '<span data-kx-av="' + esc(displayName()) + '" data-kx-size="76"></span>' +
          '<span class="kx-pfpen" aria-hidden="true">' + ico('star') + '</span>' +
        '</button>' +
        '<p class="kx-pfcap">' + AT('Tap your face to change it',
                                    'Agħfas wiċċek biex tibdlu') + '</p>'
      : '') +
    /* Only when the line has something to SAY. cloudLine() flags its one
       routine state (signed in, saved, nothing to do) as `routine`; that one
       is left out here. A guest with no account, a sync conflict, a server
       that is not answering and "on this phone only, not backed up" all still
       show — they are the cases a player has to know about. */
    (line.routine ? ''
      : '<p class="cloudline ' + line.cls + '"><i></i><span>' + esc(line.text) + '</span></p>') +
    (needsAccount
      ? '<div class="opts" style="margin-top:10px">' +
          '<button class="btn primary" id="pf-make">' +
            ilb('save', AT('Create an account', 'Agħmel kont')) +
            '<span class="sub">' + AT('saves by itself · play on any phone',
                                      'jissejvja waħdu · ilgħab fuq kwalunkwe telefon') +
            '</span></button>' +
        '</div>'
      : '') +
    /* ONE DOOR TO THE RECORD BOOK. There used to be two — "Record book" and
       "Leaderboard" — and the second one asked for icon `crown`, which exists
       in no sprite and is injected by no file, so it drew a blank gap where
       every other button had a mark. The leaderboard is now the BOARD tab
       inside the record book (js/stats.js), so this is a single button and the
       sub-label says the board is still in there.
       EVERY BUTTON BELOW CARRIES AN ICON, Close included, and every icon named
       here is one that actually exists: cards/users/back/close ship in the
       sprite in index.html, gear is appended by injectAccountIcons() above —
       which injectAccountCSS() on the first line of this function guarantees
       has run. js/stats.js binds the data attribute itself, so this stays
       markup only. */
    '<div class="opts">' +
      '<button class="btn ghost" data-karti-stats>' +
        ilb('cards', AT('Record book', 'Ktieb tar-rekords')) +
        '<span class="sub">' + AT('your record · recent games · the board',
                                  'ir-rekord tiegħek · logħbiet reċenti · il-klassifika') +
        '</span></button>' +
    '</div>' +
    /* NO "SWITCH PLAYER" ROW. It and Log out were two buttons for one thing:
       both land on the auth screen, which is where you pick a player, so
       "log out" already IS "switch player". Log out is the name a player
       looks for when they want off this profile, so that is the one that
       stayed — and it takes the fuller road (logout('out'): flush, sign out,
       drop the push subscription), which is what handing the phone over
       actually needs. The 'switch' mode is still in logout() if a reason to
       step off without signing out of the cloud ever comes back. */
    '<div class="opts">' +
      '<button class="btn ghost" id="pf-set">' +
        ilb('gear', AT('Settings', 'Settings')) + '</button>' +
      '<button class="btn ghost" id="pf-out">' +
        ilb('back', AT('Log out', 'Oħroġ')) + '</button>' +
    '</div>' +
    '<div class="opts">' +
      '<button class="btn ghost" id="pf-close">' +
        ilb('close', AT('Close', 'Agħlaq')) + '</button>' +
    '</div>');
  $('#pf-close').onclick = closeSheet;
  { const av = $('#pf-av');
    if (av) av.onclick = () => {
      closeSheet();
      try { if (window.KARTI_XP) KARTI_XP.open('you'); } catch(e){}
    }; }
  { const m = $('#pf-make');
    if (m) m.onclick = () => {
      if (ACTIVE === GUEST) return upgradeSheet();
      /* the profile already exists on this phone; the only missing half is the
         cloud one, and sync.js owns that form */
      closeSheet();
      KARTI_SYNC.openPanel('signup', { user: displayName() });
    }; }
  $('#pf-set').onclick = settingsSheet;
  $('#pf-out').onclick = () => { closeSheet(); logout('out'); };
}

/* ───────────────────────── WEB PUSH ─────────────────────────
   The real thing: "your turn" and "somebody invited you" reaching a LOCKED
   phone, via the relay's /karti/push routes (see server/karti_server.py,
   WEB PUSH block) and the push/notificationclick handlers in sw.js.

   THE RULES THIS BLOCK LIVES BY:
   · iOS only does Web Push for an app INSTALLED to the Home Screen (16.4+).
     In a Safari tab there is no PushManager at all — the row says how to fix
     that instead of pretending to be broken.
   · Permission is only ever requested from HIS TAP on the toggle, and only
     while it is 'default'. A 'denied' can never be re-prompted — the row
     says where in iOS Settings to undo it, because the app cannot.
   · A subscription is an ACCOUNT's. Toggling off DELETES it from the relay
     (this device's endpoint), it does not just stop asking; signing out does
     the same. No account, no toggle.
   · The pref is PREFS.push, default OFF — a notification nobody asked for
     is spam. PREFS.notify (the row above it) stays what it always was: the
     in-app invite popups. */
function pushSupported(){
  return !!(('serviceWorker' in navigator) && ('PushManager' in window) &&
            ('Notification' in window));
}
function pushInstalled(){
  try {
    if (navigator.standalone === true) return true;
    return !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  } catch (e){ return false; }
}
function pushIsIOS(){
  return /iP(hone|ad|od)/.test(navigator.userAgent || '') ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
/* Same derivation as picBase() in js/progress.js: one relay address for the
   whole app, following ?relay= / the Server box via sync.js. */
function pushBase(){
  let u = '';
  try {
    if (window.KARTI_SYNC && typeof KARTI_SYNC.baseURL === 'function')
      u = KARTI_SYNC.baseURL() || '';
  } catch (e){}
  if (u) return u.replace(/\/acct$/i, '') + '/push';
  if (location.protocol === 'http:' && location.hostname)
    return 'http://' + location.hostname + ':8101/karti/push';
  return 'https://raspberrypi.silverside-tench.ts.net:8443/karti/push';
}
/* The session sync.js already owns, read the way progress.js reads it —
   there is no second token and no second server address in this feature. */
function pushSession(){
  if (!ACTIVE) return null;
  const s = lsGet('karti_sync_' + ACTIVE, null);
  return (s && typeof s.tok === 'string' && s.tok) ? s : null;
}
/* The four truths the row can tell, exactly one at a time. */
function pushState(){
  if (!pushSupported()){
    return (pushIsIOS() && !pushInstalled())
      ? { mode: 'install',
          sub: 'iPhone only allows these from the installed app. Share → Add to ' +
               'Home Screen, then flip this switch there.' }
      : { mode: 'unsupported', sub: 'This browser cannot do notifications.' };
  }
  if (Notification.permission === 'denied')
    return { mode: 'denied',
             sub: 'Blocked on this phone — KARTI cannot undo that. Settings → ' +
                  'Notifications → KARTI → Allow, then come back.' };
  if (!pushSession())
    return { mode: 'nosession', sub: 'Sign in first — alerts follow your account.' };
  if (PREFS.push === true && Notification.permission === 'granted')
    return { mode: 'on',
             sub: 'Your turn & invites reach this phone even when KARTI is closed.' };
  return { mode: 'off',
           sub: 'Get told when it is your turn, and when somebody invites you — ' +
                'even with KARTI closed.' };
}
function pushRowHTML(){
  const st = pushState();
  const on = st.mode === 'on';
  const tag = { install: 'Install first', unsupported: 'Unavailable',
                denied: 'Blocked', nosession: 'Sign in' }[st.mode];
  return '<button class="setrow" id="st-push" role="switch" aria-checked="' +
           (on ? 'true' : 'false') + '">' +
           '<span class="sl"><b>Notifications</b><small>' + esc(st.sub) + '</small></span>' +
           (tag ? '<span class="soontag">' + esc(tag) + '</span>'
                : '<span class="sw' + (on ? ' on' : '') + '"><i></i></span>') +
         '</button>';
}
function pushB64ToU8(s){
  const pad = '===='.slice(0, (4 - s.length % 4) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
/* Subscribe this device and file it under the signed-in account. Throws a
   short reason string in Error.message; the caller turns it into a sentence. */
async function pushSubscribe(){
  const sess = pushSession();
  if (!sess) throw new Error('nosession');
  const reg = await navigator.serviceWorker.ready;
  const kr = await fetch(pushBase() + '/key', { cache: 'no-store' });
  const kj = await kr.json().catch(() => null);
  if (!kr.ok || !kj || !kj.key) throw new Error('nokey');
  const opts = { userVisibleOnly: true, applicationServerKey: pushB64ToU8(kj.key) };
  let sub;
  try { sub = await reg.pushManager.subscribe(opts); }
  catch (e){
    /* a subscription made under a rotated VAPID key refuses quietly —
       drop it and take a fresh one */
    const old = await reg.pushManager.getSubscription().catch(() => null);
    if (!old) throw e;
    try { await old.unsubscribe(); } catch (e2){}
    sub = await reg.pushManager.subscribe(opts);
  }
  const res = await fetch(pushBase(), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tok: sess.tok, sub: sub.toJSON() })
  });
  if (res.status === 401) throw new Error('relogin');
  if (!res.ok) throw new Error('relay');
  return true;
}
/* Take this device off the relay AND off the browser. The DELETE names only
   this device's endpoint, so his other phone keeps its alerts. Never throws —
   it is called from sign-out, which must not be blockable. */
async function pushUnsubscribe(){
  const sess = pushSession();          /* read NOW, before a sign-out drops it */
  try {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    if (sess){
      try {
        await fetch(pushBase(), {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tok: sess.tok, endpoint: sub.endpoint })
        });
      } catch (e){}
    }
    try { await sub.unsubscribe(); } catch (e){}
  } catch (e){}
}
/* THE TAP. The one place permission may be requested, because this is the
   one user gesture that means "yes, ask me". */
function pushToggleTap(){
  const st = pushState();
  if (st.mode !== 'on' && st.mode !== 'off'){ toast(st.sub); return; }
  if (st.mode === 'on'){
    setPref('push', false);
    pushUnsubscribe().then(() => toast('Notifications off — this phone was taken off the list.'));
    try { settingsSheet(); } catch (e){}
    return;
  }
  const goOn = () => {
    pushSubscribe().then(() => {
      setPref('push', true);
      toast('On. Your phone will say when it is your turn, and who wants a game.');
      try { settingsSheet(); } catch (e){}
    }).catch(err => {
      const why = (err && err.message) || '';
      toast(why === 'relogin'
        ? 'Your session expired — sign in again, then flip this.'
        : 'Could not register this phone with the relay. Try again when you are online.');
      try { settingsSheet(); } catch (e){}
    });
  };
  if (Notification.permission === 'granted'){ goOn(); return; }
  /* 'default' — the only state that may ask. Whichever form this WebKit
     speaks (promise or the ancient callback), the first answer wins. */
  const asked = new Promise(resolve => {
    let r;
    try { r = Notification.requestPermission(resolve); }
    catch (e){ resolve('default'); return; }
    if (r && typeof r.then === 'function') r.then(resolve, () => resolve('default'));
  });
  asked.then(p => {
    if (p === 'granted'){ goOn(); return; }
    toast(p === 'denied'
      ? 'You said no, so nothing will ever be sent. Changed your mind? Settings → Notifications → KARTI.'
      : 'Not turned on.');
    try { settingsSheet(); } catch (e){}
  }).catch(() => toast('Could not ask for permission.'));
}
/* Silence is a feature: the moment he is LOOKING at the app, anything still
   on the lock screen is stale — close it. */
function pushClearShown(){
  try {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg && reg.getNotifications)
        reg.getNotifications().then(ns => { ns.forEach(n => { try { n.close(); } catch (e){} }); })
                              .catch(() => {});
    }).catch(() => {});
  } catch (e){}
}
/* A notification tap must land in the game. Two ways in:
   · the window already existed → sw.js focuses it and posts KARTI_OPEN;
   · a cold start → sw.js opens ./#mp and boot's wiring below reads the hash.
   Either way: go to the Online screen, where mp.js resumes its socket. If he
   is ALREADY on it (backgrounded mid-game), do nothing — repainting the
   lobby over a live board would be worse than the notification. */
function pushOpenFrom(url){
  try {
    /* a FRIEND's game-invite push carries '#friends' — land on the Friends
       tab, where the pending invite is waiting to be tapped. On iOS this
       notification tap is the ONLY way to open the installed PWA. */
    if (/#friends\b/.test(url || '')){
      if (window.KARTI_FRIENDS && KARTI_FRIENDS.open) KARTI_FRIENDS.open();
      else if (ACTIVE) go('friends');
      return;
    }
    if (!/#mp\b/.test(url || '')) return;
    if (ACTIVE && current !== 'mp') go('mp');
  } catch (e){}
}
function pushBootWire(){
  pushClearShown();
  if (location.hash === '#friends'){
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e){}
    setTimeout(() => { try {
      if (window.KARTI_FRIENDS && KARTI_FRIENDS.open) KARTI_FRIENDS.open();
      else if (ACTIVE) go('friends');
    } catch (e){} }, 250);
  }
  if (location.hash === '#mp'){
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e){}
    setTimeout(() => { try { if (ACTIVE && current !== 'mp') go('mp'); } catch (e){} }, 250);
  }
  /* keep the relay's copy of this device fresh: quietly re-post (or remake)
     the subscription when the toggle is on and permission still stands */
  setTimeout(() => {
    try {
      if (PREFS.push === true && pushSupported() &&
          Notification.permission === 'granted' && pushSession())
        pushSubscribe().catch(() => {});
    } catch (e){}
  }, 4000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) pushClearShown(); });
window.addEventListener('pageshow', pushClearShown);
if ('serviceWorker' in navigator){
  try {
    navigator.serviceWorker.addEventListener('message', ev => {
      if (ev.data && ev.data.type === 'KARTI_OPEN') pushOpenFrom(ev.data.url || '');
    });
  } catch (e){}
}
if (document.readyState === 'complete') pushBootWire();
else window.addEventListener('load', pushBootWire);

/* ───────────────────────── SETTINGS ─────────────────────────
   Only things that are real. Sounds without their module still say so and
   cannot be pressed — a switch that flips and changes nothing is worse than
   no switch at all. Notifications ARE real now (the WEB PUSH block above);
   the row tells whichever of its four truths applies. */
function settingsSheet(){
  injectAccountCSS();
  const s = cloudStatus();
  const line = cloudLine();
  const on = REDUCED;
  openSheet(
    '<h3>Settings</h3>' +

    '<p class="setgrp">Account</p>' +
    '<p class="cloudline ' + line.cls + '"><i></i><span>' + esc(line.text) + '</span></p>' +
    ((s.linked || ACTIVE === GUEST || cloudReady())
      ? '<div class="opts">' +
          (s.linked
            /* NOT "Cloud save". Saving is automatic and always has been; naming
               it here implied there was a save you had to go and perform, which
               is exactly the doubt he raised. What is actually behind this row
               is the ACCOUNT — signing this phone out, and the backups. */
            ? '<button class="btn ghost" id="st-cloud">' + ilb('cloud', 'Your account') +
              '<span class="sub">saves by itself · sign this phone out · backups</span></button>'
            : '<button class="btn ghost" id="st-cloud">' +
              ilb('save', 'Create an account') +
              '</button>')
        + '</div>'
      : '') +

    /* SHARING IS THE ONLY WAY ANYBODY ELSE FINDS THIS.
       There is no store listing and no marketing; the app spreads by one
       person sending a link to a group chat. So the button is high up,
       not buried under the toggles. */
    '<p class="setgrp">Tell somebody</p>' +
    '<div class="opts">' +
      '<button class="btn ghost" id="st-share">' + ilb('users', 'Share KARTI') +
        '<span class="sub">send the link to a friend</span></button>' +
    '</div>' +

    /* THE LANGUAGE. One choice, two buttons, labelled in itself so it
       can be found from either side of it. Default English — the
       app's chrome is English today and that is the least surprising
       first meeting; SUSPETT and whatever else has adopted js/lang.js
       repaint on the spot, no reload. The Tombla line is honesty: the
       97 spoken calls are ENGLISH recordings and a Maltese setting
       must not pretend otherwise. */
    '<p class="setgrp">Language · Lingwa</p>' +
    '<div class="opts">' +
      '<div style="display:flex;gap:8px" role="radiogroup" aria-label="Language">' +
        '<button class="btn' + (PREFS.lang === 'mt' ? ' ghost' : '') + '" id="st-lang-en" ' +
          'style="flex:1" role="radio" aria-checked="' + (PREFS.lang !== 'mt') + '">English</button>' +
        '<button class="btn' + (PREFS.lang === 'mt' ? '' : ' ghost') + '" id="st-lang-mt" ' +
          'style="flex:1" role="radio" aria-checked="' + (PREFS.lang === 'mt') + '">Malti</button>' +
      '</div>' +
      '<p class="fineprint" style="margin:6px 2px 0">' + (PREFS.lang === 'mt'
        ? 'SUSPETT diġà jitkellem bit-tnejn; il-bqija tal-menus ġejjin bil-mod. ' +
          'Il-vuċi tat-Tombla tibqa’ bl-Ingliż — hekk kienet irrekordjata.'
        : 'SUSPETT speaks both already; the rest of the menus are being converted. ' +
          'The Tombla caller’s voice stays English — that is how it was recorded.') + '</p>' +
    '</div>' +

    /* HOW FAR AWAY THE SERVER IS. Not decoration and not a brag: it is
       the one number that decides whether a real-time game is possible
       on this connection, and it can only be answered from a real phone
       on a real network — never from the Pi, which measures itself.
       Measured over the live socket, so it includes everything a move
       goes through. The relay's own share of it is under a millisecond. */
    '<p class="setgrp">' + (PREFS.lang === 'mt' ? 'Konnessjoni' : 'Connection') + '</p>' +
    '<div class="setlist">' +
      '<button class="setrow" id="st-ping">' +
        '<span class="sl"><b>' + (PREFS.lang === 'mt' ? 'Ħeffa lejn is-server'
                                                      : 'Speed to the server') + '</b>' +
        '<small id="st-ping-note">' + (PREFS.lang === 'mt'
          ? 'Agħfas biex tkejjel. Trid tkun onlajn.'
          : 'Tap to measure. You need to be online.') + '</small></span>' +
        '<span class="setval" id="st-ping-val">—</span>' +
      '</button>' +
    '</div>' +

    '<p class="setgrp">Game</p>' +
    '<div class="setlist">' +
      '<button class="setrow" id="st-motion" role="switch" aria-checked="' + (on ? 'true' : 'false') + '">' +
        '<span class="sl"><b>Reduce motion</b><small>Skip the pack, reveal and duel ' +
          'animations. Follows your phone’s own setting until you change it here.</small></span>' +
        '<span class="sw' + (on ? ' on' : '') + '"><i></i></span>' +
      '</button>' +
      /* Two different rows on purpose. INVITES is the in-app popups over the
         live socket, exactly as it always was. NOTIFICATIONS is Web Push —
         the locked phone — and its row is honest about all four states it
         can be in (see pushState() above). */
      '<button class="setrow" id="st-notify" role="switch" aria-checked="' +
          (notifyOn() ? 'true' : 'false') + '">' +
        '<span class="sl"><b>Invites</b><small>Let other players invite you to a ' +
          'game while KARTI is open.</small></span>' +
        '<span class="sw' + (notifyOn() ? ' on' : '') + '"><i></i></span>' +
      '</button>' +
      pushRowHTML() +
      (window.KARTI_SFX
        ? KARTI_SFX.settingsHTML()
        : '<div class="setrow soon" aria-disabled="true">' +
            '<span class="sl"><b>Sounds</b><small>The sound module did not load.</small></span>' +
            '<span class="soontag">Unavailable</span>' +
          '</div>') +
    '</div>' +

    /* THE OWNER'S SEND CONSOLE — js/mail.js decides whether this row exists
       at all (drawn for the admin account only; the PERMISSION is the
       server's own list on the gift route, not this). '' for everyone else. */
    (window.KARTI_MAIL && KARTI_MAIL.settingsRowHTML ? KARTI_MAIL.settingsRowHTML() : '') +

    '<p class="setgrp">This profile</p>' +
    '<div class="opts">' +
      '<button class="btn ghost" id="st-wipe" style="opacity:.75">Wipe ' +
        esc(displayName()) + '’s save</button>' +
    '</div>' +

    '<p class="fineprint" style="margin-top:8px">18+ · Contains mothers-in-law, ' +
    'Marsa traffic and one very accurate slipper.</p>' +
    '<div class="opts">' +
      '<button class="btn ghost" id="st-back">Back</button>' +
    '</div>');

  $('#st-back').onclick = profileSheet;
  { const n = $('#st-notify');
    if (n) n.onclick = () => {
      const v = !notifyOn();
      setPref('notify', v);
      n.setAttribute('aria-checked', v ? 'true' : 'false');
      n.querySelector('.sw').classList.toggle('on', v);
      try { window.KARTI_MP && KARTI_MP.refreshInbox && KARTI_MP.refreshInbox(); } catch (e){}
    }; }
  { const pickLang = v => () => {
      if ((PREFS.lang === 'mt' ? 'mt' : 'en') === v) return;
      setPref('lang', v);
      /* lang.js re-reads the pref and repaints every subscriber —
         written through setPref above so PREFS cannot go stale */
      try { if (window.KARTI_LANG) KARTI_LANG.refresh(); } catch (e){}
      settingsSheet();
      toast(v === 'mt' ? 'Il-logħba bil-Malti.' : 'The game speaks English.');
    };
    const le = $('#st-lang-en'), lm = $('#st-lang-mt');
    if (le) le.onclick = pickLang('en');
    if (lm) lm.onclick = pickLang('mt'); }
  { const p = $('#st-push');
    if (p) p.onclick = pushToggleTap; }
  if (window.KARTI_SFX) { try { KARTI_SFX.bindSettings(); } catch (e){} }
  if (window.KARTI_MAIL) { try { KARTI_MAIL.bindSettings(); } catch (e){} }
  { const c = $('#st-cloud');
    if (c) c.onclick = () => {
      closeSheet();
      if (s.linked) KARTI_SYNC.openPanel('account');
      else if (ACTIVE === GUEST) upgradeSheet();
      else KARTI_SYNC.openPanel('signup', { user: displayName() });
    }; }
  /* THE SHARE SHEET, WITH A REAL FALLBACK.
     navigator.share is the good path — on his iPhone it opens the system
     sheet with WhatsApp first, which is where this actually spreads. It
     needs a user gesture (this is one) and it REJECTS when the player
     dismisses the sheet, which is not an error and must not be reported as
     one. Everywhere it does not exist, copy the link instead and say so,
     because a button that silently does nothing is worse than no button. */
  const shareBtn = $('#st-share');
  if (shareBtn) shareBtn.onclick = async () => {
    const url  = 'https://terencecamilleripesci.github.io/KARTI/';
    const text = "KARTI — Malta's rudest card duel. 200 cards, 12 party games. " +
                 'Free, on your phone. 18+';
    try {
      if (navigator.share){
        await navigator.share({ title: 'KARTI', text, url });
        return;                       /* shared, or quietly dismissed */
      }
    } catch (e){
      /* AbortError is the player closing the sheet — say nothing at all */
      if (e && e.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied — paste it to your friends.');
    } catch (e){
      toast(url);                     /* last resort: show it so it can be read */
    }
  };

  /* THE MEASUREMENT. Deliberately a burst rather than one shot: a single
     sample on a busy wifi is a coin toss, and the median of eight is a
     number worth acting on. The verdict is the point — a millisecond
     figure means nothing to most people, but "fast enough for a
     real-time game" is a decision. Thresholds are about what a player
     can feel: under ~60ms a tap feels instant, under ~120ms it feels
     connected, past that a twitch game needs prediction to stay honest. */
  $('#st-ping').onclick = () => {
    const mt = PREFS.lang === 'mt';
    const val = $('#st-ping-val'), note = $('#st-ping-note');
    if (!val || !window.KARTI_MP || !KARTI_MP.measure) return;
    if (!navigator.onLine){
      val.textContent = '—';
      note.textContent = mt ? 'Dan it-telefon m’huwiex onlajn.'
                            : 'This phone is offline.';
      return;
    }
    val.textContent = '…';
    note.textContent = mt ? 'Qed inkejjel…' : 'Measuring…';
    KARTI_MP.measure(8, (r) => {
      if (!r || !r.n){
        val.textContent = '—';
        note.textContent = mt ? 'Ma wasal xejn lura mis-server.'
                              : 'Nothing came back from the server.';
        return;
      }
      val.textContent = r.med + ' ms';
      const verdict = r.med < 60
        ? (mt ? 'Mgħaġġel — biżżejjed għal logħob ħaj (real-time).'
              : 'Fast — quick enough for real-time games.')
        : r.med < 120
          ? (mt ? 'Tajjeb għal logħob bid-dawra. Real-time ikun tqil.'
                : 'Fine for turn-based games. Real-time would be a stretch.')
          : (mt ? 'Bil-mod — id-dawriet tajbin, real-time le.'
                : 'Slow — turn-based is fine, real-time is not.');
      note.textContent = verdict + ' (' + (mt ? 'l-aħjar ' : 'best ') + r.best +
        ', ' + (mt ? 'l-agħar ' : 'worst ') + r.worst + ', ' + r.n +
        (mt ? ' kejliet)' : ' samples)');
    });
  };
  $('#st-motion').onclick = () => {
    setPref('motion', !REDUCED);
    settingsSheet();
    toast(REDUCED ? 'Animations off.' : 'Animations on.');
  };
  $('#st-wipe').onclick = () => {
    openSheet('<h3>Wipe this save?</h3><p class="muted">Cards, coins, decks, story — all of it, ' +
      'for ' + esc(displayName()) + ' only. Other profiles on this phone are untouched.</p>' +
      (cloudStatus().linked
        ? '<p class="muted">This profile is in the cloud, so the empty game will replace the ' +
          'cloud copy too. The server keeps the copy it replaced.</p>' : '') +
      '<div class="opts"><button class="btn hot" id="w-yes">Wipe it</button>' +
      '<button class="btn ghost" id="w-no">Cancel</button></div>');
    $('#w-no').onclick = settingsSheet;
    $('#w-yes').onclick = () => { S = DEFAULT_STATE(); save(); closeSheet(); renderHome(); toast('Clean slate.'); };
  };
}
/* Build + art state, so a support question stops being guesswork: it says which
   service worker version the phone is really running (an installed PWA can sit
   on a stale one for days) and whether the artwork loaded. The page build comes
   straight out of THIS device's index.html — the shell CSS is inline there, so
   it is the truth about the layout on screen. */
/* The guest's route to an account. One form, one account: it becomes a real
   profile on this phone AND a cloud account, in that order, and the cloud half
   never holds anything up. */
function upgradeSheet(){
  openSheet(
    '<h3>Create your account</h3>' +
    '<p class="muted">Your deck, your cards, your coins and your story progress all come with ' +
    'you — nothing is lost. The account is made on this phone first, then saved to Terence’s ' +
    'server so you can log in on another phone and find it there.</p>' +
    '<label class="tiny" for="up-name" style="display:block;margin-top:8px">Username</label>' +
    '<input class="field" id="up-name" maxlength="16" autocomplete="username" placeholder="e.g. Terence">' +
    '<label class="tiny" for="up-pw" style="display:block;margin-top:8px">Password</label>' +
    '<input class="field" id="up-pw" type="password" autocomplete="new-password" placeholder="6+ characters">' +
    '<p class="err" id="up-err"></p>' +
    '<div class="opts">' +
      '<button class="btn primary" id="up-go">Create it</button>' +
      '<button class="btn ghost" id="up-no">Not now</button></div>');
  $('#up-no').onclick = closeSheet;
  $('#up-go').onclick = () => {
    const name = $('#up-name').value, pw = $('#up-pw').value;
    const r = upgradeGuest(name, pw);
    if (r.err){ $('#up-err').textContent = r.err; return; }
    closeSheet(); renderHome();
    toast('Saved. Welcome, ' + displayName() + '.');
    cloudLink(r.key, name.trim(), pw, {}).then(res => {
      if (res && res.ok && res.made) toast('Your game is in the cloud now.');
      else if (res && res.ok && res.joined) toast('Logged in to your cloud account.');
      else if (res && res.taken)
        toast('That name is taken in the cloud. Your game is safe here — pick a cloud name in Settings.');
      else toast('Saved on this phone. It goes to the cloud when the server answers.');
      if (current === 'home') renderHome();
    });
  };
  $('#up-pw').addEventListener('keydown', e => { if (e.key === 'Enter') $('#up-go').click(); });
}

/* game.js owns no stylesheet (css/ and index.html belong to another part of the
   build), so the handful of classes the account sheets need are injected once,
   at runtime — the same pattern js/mp.js uses. Nothing here touches .tabbar or
   any of its ancestors. */
function injectAccountCSS(){
  if (document.getElementById('karti-acct-css')) return;
  const st = document.createElement('style');
  st.id = 'karti-acct-css';
  st.textContent =
    '.sheet .cloudline{display:flex;align-items:flex-start;gap:8px;margin:6px 0 0;' +
      'padding:9px 11px;border-radius:12px;font-size:12.5px;line-height:1.45;' +
      'color:var(--dim);background:rgba(255,255,255,.045);' +
      'border:1px solid rgba(255,255,255,.09)}' +
    '.sheet .cloudline i{flex:0 0 auto;width:8px;height:8px;margin-top:5px;border-radius:50%;' +
      'background:#7A8194;box-shadow:0 0 0 3px rgba(122,129,148,.18)}' +
    '.sheet .cloudline.on i{background:#3DDC84;box-shadow:0 0 0 3px rgba(61,220,132,.20)}' +
    '.sheet .cloudline.warn i{background:#FFC542;box-shadow:0 0 0 3px rgba(255,197,66,.20)}' +
    '.sheet .setgrp{margin:16px 0 6px;font-size:10.5px;letter-spacing:.14em;' +
      'text-transform:uppercase;font-weight:800;color:var(--dim2,#8A83A8)}' +
    '.sheet .setlist{display:grid;gap:8px}' +
    '.sheet .setrow{display:flex;align-items:center;gap:12px;width:100%;text-align:left;' +
      'padding:11px 12px;border-radius:12px;background:rgba(255,255,255,.04);' +
      'border:1px solid var(--line,rgba(255,255,255,.12));color:inherit;font:inherit;' +
      'cursor:pointer}' +
    '.sheet .setrow .sl{flex:1 1 auto;min-width:0}' +
    /* the measured number, right-aligned against the switches above it so
       the column reads straight down however the row is labelled */
    '.sheet .setrow .setval{flex:0 0 auto;font-size:13px;font-weight:900;' +
      'letter-spacing:.4px;color:var(--gold,#F5C542);font-variant-numeric:tabular-nums}' +
    '.sheet .setrow b{display:block;font-size:13.5px;font-weight:700}' +
    '.sheet .setrow small{display:block;margin-top:2px;font-size:11.5px;line-height:1.4;' +
      'color:var(--dim)}' +
    '.sheet .setrow.soon{cursor:default;opacity:.62}' +
    '.sheet .soontag{flex:0 0 auto;font-size:9.5px;font-weight:800;letter-spacing:.1em;' +
      'text-transform:uppercase;padding:4px 8px;border-radius:999px;' +
      'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);' +
      'color:var(--dim)}' +
    '.sheet .sw{flex:0 0 auto;width:44px;height:26px;border-radius:999px;' +
      'background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.16);' +
      'position:relative;transition:background .18s}' +
    '.sheet .sw i{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;' +
      'background:#EDE7FF;transition:left .18s}' +
    '.sheet .sw.on{background:var(--gold,#FFC542);border-color:var(--gold,#FFC542)}' +
    '.sheet .sw.on i{left:20px;background:#241800}' +
    '@media (prefers-reduced-motion:reduce){.sheet .sw,.sheet .sw i{transition:none}}';
  document.head.appendChild(st);
  injectAccountIcons();
}
/* Two symbols the sprite in index.html does not carry. Appended to the existing
   sprite so ICO('gear') works exactly like every other icon, and drawn to the
   same 24x24 / 2px round-stroke rules as the rest of the set. */
function injectAccountIcons(){
  const sprite = document.getElementById('karti-sprite');
  if (!sprite || document.getElementById('i-gear')) return;
  const ns = 'http://www.w3.org/2000/svg';
  const add = (id, d) => {
    const sym = document.createElementNS(ns, 'symbol');
    sym.setAttribute('id', id);
    sym.setAttribute('viewBox', '0 0 24 24');
    sym.setAttribute('fill', 'none');
    sym.setAttribute('stroke', 'currentColor');
    sym.setAttribute('stroke-width', '2');
    sym.setAttribute('stroke-linecap', 'round');
    sym.setAttribute('stroke-linejoin', 'round');
    sym.innerHTML = d;
    sprite.appendChild(sym);
  };
  /* sliders, not a cog: a cog needs teeth to read as a cog, and teeth at this
     stroke weight turn into a sunburst at 14px — which is exactly what the
     first attempt looked like on the phone. */
  add('i-gear',
    '<path d="M4 7h9M17.5 7H20M4 12h5M13.5 12H20M4 17h9M17.5 17H20"></path>' +
    '<circle cx="15.2" cy="7" r="2.2"></circle>' +
    '<circle cx="11.2" cy="12" r="2.2"></circle>' +
    '<circle cx="15.2" cy="17" r="2.2"></circle>');
  add('i-cloud',
    '<path d="M7 18.5a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6-1.1A3.8 3.8 0 0 1 17.5 18.5H7Z"></path>');
}
/* The seven-deck picker. It used to sit on Home under "Choose your side"; Home is
   now Story and Multiplayer only, so this lives on the Decks screen. Null-guarded
   because Home no longer carries these elements. */
function renderDeckPicker(){
  const sel = $('#decksel');
  if (!sel) return;
  sel.innerHTML = '';
  /* Only decks the player actually owns. There are no preset decks to buy any more:
     you take one beginner deck from the blind roll, and everything after that you
     collect card by card and build yourself. Listing the other six behind a padlock
     just advertised something that no longer exists — and starterPrice() now returns
     null, so it literally rendered "Locked null". */
  const owned = Object.keys(STARTER_DECKS).filter(k => S.starters.indexOf(k) >= 0);
  owned.forEach(key => {
    const sd = STARTER_DECKS[key];
    const b = document.createElement('button');
    b.className = 'deckcard' + (S.side === key ? ' on' : '');
    b.style.setProperty('--dc', sd.c);
    b.setAttribute('aria-pressed', String(S.side === key));
    b.innerHTML =
      '<div class="e">' + ico(ATTR_ICON[sd.f || key] || 'deck') + '</div>' +
      '<div class="n">' + esc(sd.name) + '</div>' +
      '<div class="vs">beats <b>' + esc(sd.beats) + '</b><br>loses to <i>' + esc(sd.loses) + '</i></div>';
    b.onclick = () => chooseSide(key);
    sel.appendChild(b);
  });
  const tag = $('#decktag');
  if (tag) tag.textContent = !owned.length
    ? 'No deck yet — take your beginner deck first.'
    : (S.side && STARTER_DECKS[S.side] ? STARTER_DECKS[S.side].tag
       : 'Tap a deck to make it your active one.');
}

function chooseSide(key){
  const sd = STARTER_DECKS[key];
  /* No deck yet means you have not done your starter roll — you do not get to
     free-pick any of the seven off this list. (The branch below is the fallback
     for when js/gacha.js is missing, so the game still works without it.) */
  if (!S.starters.length && window.KARTI_GACHA){ KARTI_GACHA.open(); return; }
  if (S.starters.indexOf(key) < 0){
    /* Fallback only for when js/gacha.js is missing. Ready-made decks are no longer
       sold for coins — packs and the deck builder are the whole progression. */
    if (S.starters.length === 0){
      grantStarter(key); renderHome();
      toast(sd.name + ' deck is yours. Now go ruin somebody\'s afternoon.');
      return;
    }
    toast('You build your own decks from here — open packs and put one together.');
    return;
  }
  const deck = S.decks.find(x => x.starter === key);
  S.side = key;
  /* The picker may only hand you a deck you could actually duel with — the
     Inventory options sheet applies the same rule, so "active" means the same
     thing however you got there. */
  if (deck && deckIsLegal(deck.list)) S.activeDeck = deck.id;
  else if (deck) toast('“' + deck.name + '” is not legal yet — fix it in Inventory.');
  fixDeckState();
  save(); renderHome();
}

/* ═══════════════════════════════════════════════════════════════════
   PACK OPENING
   ═══════════════════════════════════════════════════════════════════ */
const PACK_COST = 150;
let packBusy = false;
let tiltHooked = false;

/* ── the reveal grammar ────────────────────────────────────────────────────
   One table decides everything about how a card arrives, so the four tiers are
   different in KIND and not just in colour, and so the whole pacing can be
   retuned in one place.
     wind    the held breath BEFORE the turn. Zero for a common — it flips and
             gets out of the way. Nearly a second for a legendary.
     flip    how long the card takes to come over. A legendary turns slowly.
     hold    how long it sits there afterwards before it is flicked away.
     shine   how many light stripes rake across the face (the "stripes").
     parts   particle count. Kept low on purpose: the big effects are CSS on a
             handful of composited layers, not a cloud of DOM nodes.
   Worst case — five commons — is about 6s; a pack with a legendary in it is
   about 9s. Both are skippable from the first frame. */
const RTIER = { komuni:0, rari:1, epiku:2, leggendarju:3 };
const REVEAL = {
  komuni:      { wind:0,   flip:380, hold:420,  shine:1, shd:620,  parts:0,
                 ring:false, beam:false, wash:false, streak:false, flash:false, label:'' },
  rari:        { wind:200, flip:520, hold:700,  shine:1, shd:760,  parts:0,
                 ring:true,  beam:false, wash:false, streak:false, flash:false, label:'RARE' },
  epiku:       { wind:480, flip:680, hold:1000, shine:2, shd:820,  parts:10,
                 ring:true,  beam:true,  wash:true,  streak:true,  flash:false, label:'EPIC' },
  leggendarju: { wind:850, flip:920, hold:1550, shine:3, shd:1000, parts:16,
                 ring:true,  beam:true,  wash:true,  streak:true,  flash:true,  label:'LEGENDARY' },
};
const revConf = r => REVEAL[r] || REVEAL.komuni;

/* The FX layer. Injected into whichever stage is running a reveal — the pack
   stage here, and the starter unboxing's stage from gacha.js — so both screens
   get the identical treatment from the identical CSS. Inert until a class is
   added; a screen that is display:none runs none of it. */
const FX_HTML =
  '<div class="fxback" aria-hidden="true">' +
    '<div class="fxwash"></div><div class="fxbeam"></div>' +
    '<div class="fxstreaks"></div><div class="fxring"></div></div>' +
  '<div class="fxtop" aria-hidden="true"><div class="fxflash"></div></div>';

/* One property, read by the wash, the beam, the stripes, the ring, the flash,
   the tear burst and the light sweeps on the card face. Set it once and the
   whole stage changes colour together. */
function setFxColor(host, c){ if (host) host.style.setProperty('--fxc', c); }
function fxHost(el){ return el && el.closest ? el.closest('.stage,.ub-stage') : null; }
/* restart a CSS animation from the top: drop the class, force the style to be
   recomputed, put it back. One forced layout per effect, a handful per card. */
function fxGo(host, cls, dur){
  if (!host || REDUCED) return;
  const el = host.querySelector('.' + cls);
  if (!el) return;
  el.classList.remove('on');
  void el.offsetWidth;
  if (dur) el.style.setProperty('--fxdur', Math.round(dur) + 'ms');
  el.classList.add('on');
}
/* the light sweep across the card face, scaled by rarity: one quick rake for a
   common, three staggered and colour-tinted for a legendary */
function shineEl(rarity){
  const conf = revConf(rarity);
  const w = document.createElement('div');
  w.className = 'shinewrap';
  for (let i = 0; i < conf.shine; i++){
    const s = document.createElement('i');
    if (i > 0) s.className = 'tint';
    s.style.setProperty('--shd', conf.shd + 'ms');
    s.style.setProperty('--shdel', (i * 0.16).toFixed(2) + 's');
    w.appendChild(s);
  }
  return w;
}
function shineGo(slot){
  if (REDUCED || !slot) return;
  slot.querySelectorAll('.shinewrap i').forEach(s => {
    s.classList.remove('go'); void s.offsetWidth; s.classList.add('go');
  });
}

/* Which of the four sets the next pack comes from. Each set is 50 cards with an
   identical rarity spread, so this is a choice of jokes, never a choice of value. */
function activeSet(){
  const sets = window.CARD_SETS || KARTI.CARD_SETS || [];
  if (!sets.length) return null;
  return sets.find(s => s.id === S.packSet) || sets[0];
}
function renderSetPicker(){
  const sets = window.CARD_SETS || KARTI.CARD_SETS || [];
  const host = $('#pack-sets');
  if (!host || !sets.length) return;
  const cur = activeSet();
  host.innerHTML = '';
  sets.forEach(s => {
    const b = document.createElement('button');
    b.className = 'setchip' + (cur && s.id === cur.id ? ' on' : '');
    b.style.setProperty('--dc', s.c || 'var(--gold)');
    b.setAttribute('aria-pressed', String(!!cur && s.id === cur.id));
    b.innerHTML = '<span class="sc">' + esc(s.code) + '</span>' +
                  '<span class="sn">' + esc(s.name) + '</span>';
    b.onclick = () => { if (packBusy) return; S.packSet = s.id; save(); renderPackScreen(); };
    host.appendChild(b);
  });
}
function renderPackTab(){
  /* anything still running against the old stage is now orphaned — the token
     is what tells it to stop touching the DOM */
  packSeq++;
  packSkip = false;
  packBusy = false;
  packSkipFn = null;
  /* the reveal dims the set picker; #pack-sets is refilled but never replaced,
     so leaving mid-reveal used to strand it at 13% opacity for good */
  const sp = $('#pack-sets'); if (sp) sp.classList.remove('hushed');
  const tb0 = $('#store-tabs'); if (tb0) tb0.classList.remove('hushed');
  updateCoinsPill();
  const set = activeSet();
  const face = set && uiArt('pack', set.art);
  const stage = $('#pack-stage');
  stage.innerHTML =
    '<div class="pack" id="the-pack" role="button" tabindex="0" aria-label="Sealed card pack — tap to tear open">' +
      '<div class="fc back2"></div>' +
      '<div class="side sL"></div><div class="side sR"></div>' +
      '<div class="fc front"' + (face ? ' style="background-image:url(' + face + ');background-size:cover;background-position:center"' : '') + '>' +
        '<div class="pemo">' + ico('cross-malta') + '</div>' +
        '<div class="plogo">' + (set ? esc(set.code) : 'KARTI') + '</div>' +
        '<div class="psub">' + (set ? esc(set.name) + '<br>' : '') +
          'Sealed foil · 5 cards · 1 rare or better</div>' +
        '<div class="pcount">18+</div>' +
        '<div class="foil"></div>' +
      '</div>' +
      '<div class="lid">TEAR HERE</div>' +
      '<div class="seam"></div>' +
    '</div>' +
    '<div class="burst" id="burst"></div>' +
    '<div class="rays" id="rays"></div>' +
    FX_HTML;
  stage.style.removeProperty('--fxc');
  renderSetPicker();
  hookTilt();
  const pk = $('#the-pack');
  pk.onclick = tryOpen;
  pk.onkeydown = e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); tryOpen(); } };
  let sx = 0, sy = 0;
  pk.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive:true });
  pk.addEventListener('touchend', e => {
    const t = e.changedTouches[0];
    if (Math.abs(t.clientX - sx) > 40 || Math.abs(t.clientY - sy) > 40) tryOpen();
  }, { passive:true });

  const bar = $('#pack-bar');
  const canFree = S.packs > 0;
  bar.innerHTML =
    '<p class="hint" id="pack-hint">' + (canFree || S.coins >= PACK_COST
      ? 'Tap or swipe the pack to tear it open' : 'Win a duel to earn a pack') + '</p>' +
    '<button class="btn ' + (canFree ? 'primary' : '') + '" id="pack-open"' +
      (canFree || S.coins >= PACK_COST ? '' : ' disabled') + '>' +
      (canFree ? ilb('pack', 'Open free pack (' + S.packs + ')')
               : ilb('coin', 'Buy pack — ' + PACK_COST)) + '</button>' +
    '<button class="btn ghost sm" id="pack-home">Back to menu</button>';
  $('#pack-open').onclick = tryOpen;
  $('#pack-home').onclick = () => go('home');
}

function hookTilt(){
  if (tiltHooked) return;
  tiltHooked = true;
  const setTilt = (rx, ry) => {
    const pk = $('#the-pack');
    if (!pk || pk.classList.contains('tearing')) return;
    pk.style.setProperty('--rx', clamp(rx, -26, 26).toFixed(1) + 'deg');
    pk.style.setProperty('--ry', clamp(ry, -30, 30).toFixed(1) + 'deg');
  };
  const stage = $('#pack-stage');
  const fromPointer = e => {
    const p = e.touches ? e.touches[0] : e;
    const r = stage.getBoundingClientRect();
    const nx = (p.clientX - r.left) / Math.max(r.width, 1) - .5;
    const ny = (p.clientY - r.top) / Math.max(r.height, 1) - .5;
    setTilt(-ny * 34, nx * 46);
  };
  stage.addEventListener('pointermove', fromPointer);
  stage.addEventListener('touchmove', fromPointer, { passive:true });
  stage.addEventListener('pointerleave', () => setTilt(0, 0));
  if (window.DeviceOrientationEvent && !REDUCED){
    window.addEventListener('deviceorientation', e => {
      if (current !== 'pack' || e.beta == null || e.gamma == null) return;
      setTilt(clamp((e.beta - 45) * .5, -22, 22), clamp(e.gamma * .6, -28, 28));
    });
  }
  /* idle drift so it never looks dead */
  let t = 0;
  setInterval(() => {
    if (current !== 'pack' || REDUCED) return;
    const pk = $('#the-pack');
    if (!pk || pk.dataset.touched === '1' || pk.classList.contains('tearing')) return;
    t += .045;
    pk.style.setProperty('--rx', (Math.sin(t * .7) * 6).toFixed(1) + 'deg');
    pk.style.setProperty('--ry', (Math.sin(t) * 13).toFixed(1) + 'deg');
  }, 40);
  stage.addEventListener('pointerdown', () => { const pk = $('#the-pack'); if (pk) pk.dataset.touched = '1'; });
}

/* Everything that runs after the pull is guarded by this token. A re-render, a
   navigation away, or a second pack started from the summary bumps it, and any
   sequence still in flight against the old stage quietly stops instead of
   writing into DOM that no longer exists. */
let packSeq = 0;
let packSkip = false;    /* Skip pressed — cut straight to the summary        */
let packHurry = false;   /* tapped during a hold — shorten this one card      */

function tryOpen(){
  if (packBusy) return;
  if (S.packs > 0){ S.packs--; }
  else if (S.coins >= PACK_COST){
    S.coins -= PACK_COST;
    /* a free pack and a bought one are not the same event, and the difference
       is money. Only the bought one costs anything, so only it makes the
       sound — the ceremony that follows is identical either way. */
    if (window.KARTI_SFX) { try { KARTI_SFX.play('shop.buy'); } catch(e){} }
  }
  /* ⚠ turns the toast's chime into the blunt "no" — see js/sfx.js, which reads
     the marker off the toast text. "You cannot afford this" is a refusal. */
  else { toast('⚠ No packs and not enough coins. Win a duel.'); return; }
  save();
  packBusy = true;
  runPackOpen();
}

/* A hold that can be cut short. Polls in 50ms slices so a tap on the stage
   (packHurry) or the Skip button (packSkip) is felt within a frame or two
   rather than at the end of a one-and-a-half second legendary pose. */
async function holdFor(ms, alive){
  const step = 50;
  for (let t = 0; t < ms; t += step){
    if (packSkip || packHurry || !alive()) return;
    await wait(step);
  }
}

async function runPackOpen(){
  const seq = ++packSeq;
  packSkip = false; packHurry = false;
  const alive = () => seq === packSeq && current === 'pack';

  /* ── 1. THE PULL, AND THE SAVE ──────────────────────────────────────────
     Rolled and committed to disk before a single pixel moves. Whatever the
     animation does from here — a phone that locks, an app that gets swiped
     away, a tab closed mid-flip — the cards are already in the collection.
     No card is ever owed to an animation finishing.
     ownedCount() is read BEFORE addCard() adds the copy, which is the whole
     reason isNew can be trusted; get that the wrong way round and every card
     in the game reports as a duplicate. */
  const cards = openPack(5, S.packSet);
  const results = cards.map(c => {
    const before = ownedCount(c.id);
    const r = addCard(c.id);
    return { card:c, isNew:r.isNew, dusted:r.dusted, before:before, after:ownedCount(c.id) };
  });
  save();

  /* Reduced motion: no tear, no flips, no light. Straight to the list of what
     was pulled, which is the part that actually carries the information. */
  if (REDUCED){ showSummary(results); return; }

  const stage = $('#pack-stage');
  if (!stage) return;

  /* Skip is armed HERE — before the first frame of the tear, not after the fan
     is built. Wired up any later and the button that is already on screen
     during the tear does nothing when you press it, which is exactly the
     twelve seconds nobody wants. It never skips the grant (that is done and
     saved); it only ends the theatre. */
  const skipNow = () => {
    if (packSkip || seq !== packSeq) return;
    packSkip = true;
    showSummary(results);
  };
  packSkipFn = skipNow;

  /* ── 2. THE BUILD-UP ────────────────────────────────────────────────────
     The light coming out of the pack is the colour of the BEST card inside it.
     Gold spilling out of the seam means a legendary is in there, and the
     player knows it a second and a half before they see it. That anticipation
     is the whole trick; the tear is just the delivery. */
  const bestKey = results.reduce((a, r) => RTIER[r.card.r] > RTIER[a] ? r.card.r : a, 'komuni');
  const best = RTIER[bestKey];
  setFxColor(stage, RARITY[bestKey] ? RARITY[bestKey].c : '#FFD24A');

  packBar('open', 0, results.length);
  updateCoinsPill();
  const sets = $('#pack-sets'); if (sets) sets.classList.add('hushed');
  const tbs = $('#store-tabs'); if (tbs) tbs.classList.add('hushed');

  /* Build the five cards NOW, detached, while the pack is still charging.
     Five full-size cards with their artwork is the single most expensive frame
     in the whole sequence; done at the moment the stage is swapped it lands as
     a visible hitch right where the cards are supposed to be flying out. Built
     here, the images are already fetched and decoded by the time anything is
     attached, and the cost is spent behind the tear. */
  const fan = document.createElement('div');
  fan.className = 'fan'; fan.id = 'fan';
  const entrances = results.map((res, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot ' + res.card.r;
    slot.dataset.i = String(i);
    const depth = results.length - 1 - i;
    const rest = { x:depth * 5, y:depth * -6, r:depth * 2.2 - 4, s:1 - depth * .035 };
    slot.style.setProperty('--sx', rest.x + 'px');
    slot.style.setProperty('--sy', rest.y + 'px');
    slot.style.setProperty('--sr', rest.r.toFixed(1) + 'deg');
    slot.style.setProperty('--ss', rest.s.toFixed(3));
    slot.style.setProperty('--flipd', revConf(res.card.r).flip + 'ms');
    slot.style.zIndex = String(10 + results.length - i);
    slot.innerHTML = '<div class="aura"></div>';

    const lift = document.createElement('div');
    lift.className = 'lift';
    const flip = document.createElement('div');
    flip.className = 'flipper';
    flip.appendChild(backEl());
    const front = document.createElement('div');
    front.className = 'fr';
    /* res.isNew came from addCard(), which reads ownership BEFORE it adds the
       copy — so this really does mean "did not own it a moment ago", and its
       opposite really does mean duplicate. */
    front.appendChild(cardEl(res.card, {
      size:'md', isNew: res.isNew, isDupe: !res.isNew, dupeDust: res.dusted }));
    front.appendChild(shineEl(res.card.r));
    flip.appendChild(front);
    lift.appendChild(flip);
    slot.appendChild(lift);

    const tip = document.createElement('div');
    tip.className = 'tapme'; tip.textContent = i === 0 ? 'Tap to flip' : '';
    slot.appendChild(tip);
    fan.appendChild(slot);
    return { slot:slot, rest:rest, i:i };
  });

  const pk = $('#the-pack');
  if (pk){
    pk.classList.add('charge');                       /* pull in on itself   */
    await wait(500); if (packSkip || !alive()) return;
    pk.classList.remove('charge');
    pk.classList.add('shake');
    await wait(380); if (packSkip || !alive()) return;
    pk.classList.add('tearing');                      /* the seam splits     */
    /* A beat for the seam alone. The burst used to fire on the same frame and
       simply ate it — you never saw the pack come apart, only the flash. */
    await wait(170); if (packSkip || !alive()) return;
    const b = $('#burst'), r = $('#rays');
    if (b) b.classList.add('go');
    if (r) r.classList.add('go');
    if (best >= 2) fxGo(stage, 'fxstreaks', 900);
    if (best >= 3) fxGo(stage, 'fxflash');
  }
  await wait(430); if (packSkip || !alive()) return;

  /* ── 3. THE DEAL ─────────────────────────────────────────
     Five cards arc out of the burst and stack into a fan with a little
     overshoot, weakest on top. */
  stage.innerHTML = FX_HTML;
  stage.appendChild(fan);
  setFxColor(stage, RARITY[bestKey] ? RARITY[bestKey].c : '#FFD24A');

  /* The arc in, started only once the cards are in the document. Explicit
     keyframes rather than reading each element's computed transform back off
     the page — five forced layouts for nothing was the old way, and it reads
     better anyway: up out of the burst, a touch past the resting place, then
     settle. */
  const at = (x, y, r, s) =>
    'translate3d(' + x + 'px,' + y + 'px,0) rotate(' + r + 'deg) scale(' + s + ')';
  entrances.forEach(e => {
    const rest = e.rest;
    e.slot.animate([
      { transform: at(0, 150, rest.r - 16, .46), opacity:0, offset:0 },
      { opacity:1, offset:.34 },
      { transform: at(rest.x, rest.y - 9, rest.r + 2.5, rest.s * 1.045), offset:.72 },
      { transform: at(rest.x, rest.y, rest.r, rest.s), opacity:1, offset:1 },
    ], { duration:560, delay:e.i * 65, easing:'cubic-bezier(.22,.9,.28,1)', fill:'backwards' });
  });

  /* ── 4. THE REVEALS ─────────────────────────────────────────────────────
     One tap turns the next card. A second tap while it is posing cuts the
     pose short, so the fortieth pack of the evening is as fast as you can
     tap and the first one is still a ceremony. */
  let idx = 0, busy = false;
  packBar('reveal', 0, results.length);

  const advance = async () => {
    if (packSkip || !alive()) return;
    if (busy){ packHurry = true; return; }
    const slot = fan.querySelector('.slot[data-i="' + idx + '"]');
    if (!slot) return;
    busy = true; packHurry = false;
    const tip0 = slot.querySelector('.tapme'); if (tip0) tip0.remove();
    const res = results[idx];
    const conf = revConf(res.card.r);
    const RC = RARITY[res.card.r] ? RARITY[res.card.r].c : '#fff';
    setFxColor(stage, RC);

    /* the wind-up: the card lifts and the stripes converge on it. Commons get
       none of this — they flip on the frame you tap. */
    if (conf.wind){
      slot.style.setProperty('--wd', conf.wind + 'ms');
      slot.classList.add('windup');
      if (conf.streak) fxGo(stage, 'fxstreaks', conf.wind + 150);
      await wait(conf.wind);
      if (packSkip || !alive()) return;
    }

    slot.classList.add('flipped');
    /* the light sweep is timed to arrive as the face comes square on */
    setTimeout(() => shineGo(slot), Math.round(conf.flip * .55));
    rarityFx(slot, res.card.r);
    packBar('reveal', idx + 1, results.length);

    await holdFor(conf.flip + conf.hold, alive);
    if (packSkip || !alive()) return;

    /* out, faster than it came in */
    slot.classList.add('gone');
    slot.style.setProperty('--sx', '-135vw');
    slot.style.setProperty('--sr', '-26deg');
    slot.style.setProperty('--ss', '.82');
    slot.style.opacity = '0';
    idx++;
    const nxt = fan.querySelector('.slot[data-i="' + idx + '"]');
    if (nxt){
      nxt.style.setProperty('--sx', '0px'); nxt.style.setProperty('--sy', '0px');
      nxt.style.setProperty('--sr', '0deg'); nxt.style.setProperty('--ss', '1');
      const t2 = nxt.querySelector('.tapme'); if (t2) t2.textContent = 'Tap to flip';
      busy = false;
    } else {
      await wait(280);
      if (!alive()) return;
      showSummary(results);
    }
  };

  fan.onclick = advance;
  fan.tabIndex = 0;
  fan.setAttribute('role', 'button');
  fan.setAttribute('aria-label', 'Tap to turn the next card over');
  fan.onkeydown = e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); advance(); } };

}

/* The bar under the stage. Three states, one function, so the reveal always
   has a visible way out and a visible end. */
let packSkipFn = null;
function packBar(mode, done, total){
  const bar = $('#pack-bar');
  if (!bar) return;
  if (mode === 'open'){
    bar.innerHTML =
      '<div class="revrow"><p class="hint">Tearing…</p>' +
      '<button class="btn ghost sm" id="pack-skip">Skip</button></div>';
  } else {
    bar.innerHTML =
      '<div class="revrow"><p class="hint">Tap the card</p>' +
      '<span class="pcounter">' + done + ' / ' + total + '</span>' +
      '<button class="btn ghost sm" id="pack-skip">Skip</button></div>';
  }
  const b = $('#pack-skip');
  if (b) b.onclick = () => { if (packSkipFn) packSkipFn(); };
}

/* labelEl lets another screen (the starter gacha) borrow this whole effect
   without fighting the pack screen over the #rlabel element. Everything is
   driven off the one REVEAL table, so the two screens cannot drift apart. */
function rarityFx(slot, rarity, labelEl){
  const conf = revConf(rarity);
  const label = labelEl || $('#rlabel');
  const RC = RARITY[rarity] ? RARITY[rarity].c : '#fff';
  const host = fxHost(slot);
  setFxColor(host, RC);

  if (conf.label && label){
    label.innerHTML = rarity === 'leggendarju'
      ? ico('star') + ' ' + conf.label + ' ' + ico('star') : conf.label;
    label.style.color = RC;
    label.classList.remove('go'); void label.offsetWidth; label.classList.add('go');
  }
  if (host){
    /* the screen-level treatment: a colour wash that also darkens everything
       around the card, and a shaft of light standing behind it. Epic and
       legendary only — a rare gets the ring and nothing more, a common gets
       nothing at all, and that is what makes the tiers legible without a
       single word being read. */
    if (conf.wash) fxGo(host, 'fxwash', conf.flip + conf.hold);
    if (conf.beam) fxGo(host, 'fxbeam', conf.flip + conf.hold);
    if (conf.ring) fxGo(host, 'fxring');
    if (conf.flash) fxGo(host, 'fxflash');
  }
  if (conf.parts) particles(slot, conf.parts, RC, rarity === 'leggendarju' ? 215 : 155);
  if (rarity === 'leggendarju' && !REDUCED){
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 520);
  }
}
function particles(host, n, color, spread){
  if (REDUCED) return;
  for (let i = 0; i < n; i++){
    const p = document.createElement('i');
    p.className = 'pt';
    const a = Math.random() * Math.PI * 2;
    const d = spread * (.35 + Math.random() * .75);
    p.style.setProperty('--tx', (Math.cos(a) * d).toFixed(0) + 'px');
    p.style.setProperty('--ty', (Math.sin(a) * d).toFixed(0) + 'px');
    p.style.setProperty('--pc', color);
    p.style.setProperty('--pd', (.7 + Math.random() * .7).toFixed(2) + 's');
    p.style.animationDelay = (Math.random() * .22).toFixed(2) + 's';
    host.appendChild(p);
    setTimeout(() => p.remove(), 1800);
  }
}

/* ── WHAT YOU ACTUALLY GOT ────────────────────────────────────────────────
   He asked for this in as many words: after the reveal, say what came out.
   Every card by name, with its rarity spelled out and colour-coded, and its
   verdict — NEW, or DUPLICATE and what the duplicate turned into. Each row is
   a 54px tap target that opens the card. Nothing here depends on having
   watched the animation, so it is also the whole of the reduced-motion path
   and the whole of what Skip lands you on. */
function summaryRow(res, i){
  const rar = RARITY[res.card.r] || { n:'?', c:'#888' };
  const b = document.createElement('button');
  b.className = 'sumrow';
  b.style.setProperty('--rc', rar.c);
  b.style.setProperty('--sd', (i * .045).toFixed(3) + 's');
  const meta = '<span class="r">' + esc(rar.n) + '</span> · ' + esc(typeName(res.card)) +
    (res.card.t === 'monster' ? ' · ' + res.card.atk + ' ATK' : '');
  const tag = res.isNew
    ? '<span class="stag new">' + ico('check') + 'New</span>'
    : '<span class="stag dupe">' +
        (res.dusted ? coinIco() + '<span class="dust">+' + res.dusted + '</span>'
                    : 'Dupe') + '</span>';
  b.innerHTML =
    '<span class="rgem">' + ico(RARITY_ICON[res.card.r] || 'rar-komuni') + '</span>' +
    '<span class="scol"><span class="snm">' + esc(res.card.n) + '</span>' +
      '<span class="smeta">' + meta + '</span></span>' + tag;
  b.setAttribute('aria-label', res.card.n + ', ' + rar.n + ', ' +
    (res.isNew ? 'new card' :
     res.dusted ? 'duplicate, turned into ' + res.dusted + ' coins' :
     'duplicate, copy ' + res.after + ' of ' + MAX_COPIES) + '. Tap to inspect.');
  b.onclick = () => cardViewModal(res.card);
  return b;
}

function showSummary(results){
  packSeq++;                 /* nothing from the reveal may touch the DOM now */
  packBusy = false;
  packSkipFn = null;
  document.body.classList.remove('shake');
  const sets = $('#pack-sets'); if (sets) sets.classList.remove('hushed');
  const tbs2 = $('#store-tabs'); if (tbs2) tbs2.classList.remove('hushed');
  const stage = $('#pack-stage');
  if (!stage) return;
  const news = results.filter(r => r.isNew).length;
  const dupes = results.length - news;
  const dust = results.reduce((a, r) => a + r.dusted, 0);

  stage.innerHTML =
    '<div class="sumwrap">' +
      '<div class="sumhead"><h2>You pulled ' + results.length + ' cards</h2>' +
        '<p class="sumsub">' +
          (news ? '<b style="color:var(--ok)">' + news + ' new</b>' : '<b>nothing new</b>') +
          (dupes ? '<b style="color:#B7A9DE">' + dupes + ' duplicate' +
            (dupes > 1 ? 's' : '') + '</b>' : '') +
          (dust ? '<b style="color:var(--gold)">' + coinIco('coins') + '+' + dust + '</b>' : '') +
        '</p></div>' +
      '<div class="sumlist" id="sum"></div>' +
    '</div>';
  const sum = $('#sum');
  results.forEach((r, i) => sum.appendChild(summaryRow(r, i)));

  const canMore = S.packs > 0 || S.coins >= PACK_COST;
  $('#pack-bar').innerHTML =
    '<button class="btn primary" id="p-again"' + (canMore ? '' : ' disabled') + '>' +
      (S.packs > 0 ? ilb('pack', 'Open another (' + S.packs + ')')
                   : ilb('coin', 'Another — ' + PACK_COST)) + '</button>' +
    '<div class="row"><button class="btn ghost sm" id="p-coll">Collection</button>' +
    '<button class="btn ghost sm" id="p-home">Menu</button></div>';
  $('#p-again').onclick = () => renderPackScreen();
  $('#p-coll').onclick = () => go('coll');
  $('#p-home').onclick = () => go('home');
  updateCoinsPill();
}

/* ═══════════════════════════════════════════════════════════════════
   THE STORE
   One screen, three shelves, because packs and paint are different
   purchases made for different reasons:
     · Packs     — the card packs, exactly as they were.
     · Daily Spin — one free spin a day. The odds are printed on the
       screen FROM THE SAME TABLE the roll reads, so what it says and
       what it does cannot drift apart. Every spin pays something;
       nothing about it ever costs a coin.
     · Customise — the cosmetics the games register through KARTI_XP,
       the low and middle shelves buyable with coins. The ladder keeps
       its best things: anything above level 12, every border, badge
       and face, and everything EARNED stays exactly as it was.
   ═══════════════════════════════════════════════════════════════════ */
let storeTab = 'cards';          /* sticky for the session, not saved  */
let cosmGame = '';               /* which game's shelf is open         */
let exclGame = '';               /* same, on the Exclusives tab        */
/* a game's real name for a shelf heading — the record book first, the party
   shelf second, the bare id as the last resort so a game registered by a
   file we have never heard of still gets a readable tab. */
/* A GAME'S OWN COLOUR AND MARK, for the picker tiles.
   Icons were the obvious answer and they do not work: most games publish
   none at all, and the ones that do share them — five games are 'cards',
   three are 'map'. A row of those would be HARDER to tell apart than words.
   So each game gets a two-letter monogram on its own colour instead: the
   exclusive set's accent when the game has one (so the tile matches the
   trophy it leads to), otherwise a hue hashed off the id, which is stable
   forever and unique enough across sixteen shelves. */
function cosmGameAccent(id){
  try {
    const m = exclMeta(id);
    if (m && m.accent) return m.accent;
  } catch (e){}
  let h = 0;
  const t = String(id || '');
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return 'hsl(' + (Math.abs(h) % 360) + ' 72% 62%)';
}
function cosmMonogram(id){
  const n = cosmGameName(id).replace(/^(IL|IS|IT|L)-/i, '').replace(/[^A-Za-zĠĦŻĊġħżċ]/g, '');
  return (n.slice(0, 2) || String(id).slice(0, 2)).toUpperCase();
}
function cosmGameName(id){
  if (id === 'karti') return 'KARTI';
  try {
    const g = ((window.KARTI_STATS && KARTI_STATS.GAMES) || []).find(x => x.id === id);
    if (g && g.name) return g.name;
  } catch (e){}
  try {
    const t = (window.KARTI_PARTY && KARTI_PARTY.games) ? KARTI_PARTY.games().find(x => x.id === id) : null;
    if (t && t.name) return t.name;
  } catch (e){}
  return String(id).toUpperCase();
}
let spinBusy = false;
let boxBusy = false;             /* a loot box mid-reveal              */
let spinTickT = 0;               /* the countdown repaint timer        */

/* ── the daily gate ────────────────────────────────────────────────
   Two rules, both must pass:
     1. the LOCAL calendar date must differ from the date of the last
        spin — "daily" means what a person means by it: a new day on
        the clock on the wall, same as the ladder's first-win bonus;
     2. at least SPIN_GAP_MS (10h) of REAL time (epoch, timezone-blind)
        must have passed since the last spin.
   Rule 2 is what makes rule 1 hard to game: changing the phone's
   timezone changes the date but not the epoch, so a timezone tourist
   gains nothing. Moving the CLOCK forward a day does move the epoch —
   that spin cannot be stopped on a device with no server — but the
   spin stamps the faked time, so putting the clock back leaves the
   last-spin moment in the future and the gate stays shut until real
   time has caught up past it. Cheated spins are borrowed, not free.
   A genuine traveller is never wronged by either rule: flying either
   way shifts the date by at most a day and the epoch not at all, so
   the worst case is waiting for the next local midnight, and the 10h
   floor only ever bites someone who spun late the night before. */
const SPIN_GAP_MS = 10 * 3600 * 1000;

function spinDayKey(now){
  const d = new Date(now == null ? Date.now() : now);
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
/* When the next spin unlocks: the next local midnight, or the 10h
   floor, whichever is later. */
function spinNextAt(now){
  now = now == null ? Date.now() : now;
  const sp = S.spin || {};
  const d = new Date(now); d.setHours(24, 0, 0, 0);
  return Math.max(d.getTime(), (sp.t || 0) + SPIN_GAP_MS);
}
function spinState(now){
  now = now == null ? Date.now() : now;
  const sp = S.spin || (S.spin = { day:'', t:0, n:0, last:'' });
  if (sp.day && sp.day === spinDayKey(now))
    return { ok:false, why:'today', next: spinNextAt(now) };
  if (sp.t && now < sp.t)
    return { ok:false, why:'clock', next: spinNextAt(now) };
  if (sp.t && now < sp.t + SPIN_GAP_MS)
    return { ok:false, why:'soon', next: spinNextAt(now) };
  return { ok:true };
}

/* ── the prize table ───────────────────────────────────────────────
   THIS TABLE IS THE WHOLE TRUTH. The roll walks it, the odds screen
   prints it, the reel is stocked from it. pct MUST sum to 100 — the
   boot check below refuses to be quietly wrong about a printed number.

   THE DAILY PAYS CHIPS NOW — the play currency (js/progress.js §7b) —
   because the daily's job in the economy is to be the TOP-UP: the
   thing that un-breaks a broke player so staked play is never more
   than a day away (friendly play is free and unlimited regardless).
   Every line therefore carries at least 60 chips — even the cosmetic
   and the pack ride on top of a chip payment, so no roll can leave a
   broke player still broke. Average ≈ 87 chips: about three friendly
   wins, or most of a small loot box — a real daily nudge that still
   does not out-earn an evening of actually playing. The 1% pack is
   his number, as asked. The old dust line is gone with dust. */
const SPIN_TABLE = [
  { id:'ch60',  kind:'chips', n:60,  pct:41, label:'60 chips',   ic:'chips' },
  { id:'ch90',  kind:'chips', n:90,  pct:24, label:'90 chips',   ic:'chips' },
  { id:'xp18',  kind:'xp',    n:18,  chips:30, pct:15, label:'+18 XP & 60 chips', ic:'star' },
  { id:'ch150', kind:'chips', n:150, pct:10, label:'150 chips',  ic:'chips' },
  { id:'ch250', kind:'chips', n:250, pct:6,  label:'250 chips',  ic:'chips' },
  { id:'cosm',  kind:'cosmetic', chips:60, pct:3, label:'Shop item + 60 chips', ic:'rar-epiku' },
  { id:'pack',  kind:'pack',  n:1,  chips:60, pct:1, label:'Card pack + 60 chips', ic:'pack' },
];
if (SPIN_TABLE.reduce((a, p) => a + p.pct, 0) !== 100)
  console.error('KARTI store: SPIN_TABLE odds do not sum to 100 — the printed odds are wrong.');

/* a prize icon that might be the chip — 'chips' is not in the sprite
   (the chip is drawn by progress.js so every surface shares one chip);
   everything else goes through ico() exactly as before */
const icoPrize = n => n === 'chips' ? chipIco() : ico(n);

/* The spin's randomness is its own: it must NEVER draw from rnd(),
   because that stream is seeded lockstep during an online duel and a
   spin taken mid-lobby would desync both phones. */
function spinRand(){
  try {
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    return u[0] / 4294967296;
  } catch (e){ return Math.random(); }
}
function spinRoll(){
  let r = spinRand() * 100;
  for (let i = 0; i < SPIN_TABLE.length; i++){
    r -= SPIN_TABLE[i].pct;
    if (r < 0) return SPIN_TABLE[i];
  }
  return SPIN_TABLE[0];
}

/* ── granting ──────────────────────────────────────────────────────
   Rolled, granted and SAVED before a single pixel of reel moves —
   the same law the pack reveal lives by. Nothing is owed to an
   animation finishing. */
/* every chip payment goes through the one wallet door in progress.js,
   so the home wallet counts up and the balance can never go weird; if
   that module somehow failed to load, pay the save directly — a daily
   must never pay nothing because a script 404'd */
function grantChips(n, reason){
  if (!(n > 0)) return;
  try {
    if (window.KARTI_XP && KARTI_XP.addChips){ KARTI_XP.addChips(n, reason); return; }
  } catch (e){}
  S.chips = Math.max(0, (S.chips | 0) + n);
}
function spinGrant(prize, day){
  const out = { prize:prize, label:prize.label, cosmetic:null, levelled:false };
  /* the guaranteed top-up riding under a cosmetic/pack/xp line */
  if (prize.chips) grantChips(prize.chips, 'spin');
  if (prize.kind === 'chips'){ grantChips(prize.n, 'spin'); }
  else if (prize.kind === 'pack'){ S.packs += 1; }
  else if (prize.kind === 'xp'){
    /* Paid through the ladder's own till so a level-up pays its chips
       and packs and fires its listeners exactly as a played game does.
       Deterministic: weight 6 (default) x win 2 x first-of-day 1.5 x
       taper 1 (nothing else is filed under 'dailyspin' today) = 18 XP
       — and the award's own chips leg pays 6x5 = 30 chips, which with
       the 30 riding on the line above makes the promised 60. The id
       makes the award idempotent per calendar day even if the gate
       were somehow talked around. */
    let ok = false;
    try {
      if (window.KARTI_XP){
        const r = KARTI_XP.award('dailyspin', 'w', { id:'spin-' + day, ms:9e9, quiet:true });
        ok = !!(r && r.counted);
        out.levelled = !!(r && r.levelled);
      }
    } catch (e){}
    if (!ok){ grantChips(60, 'spin'); out.label = '90 chips'; out.fellBack = true; }
  }
  else if (prize.kind === 'cosmetic'){
    const pool = storeBuyables().filter(d => !cosmOwned(d.id));
    if (pool.length){
      const d = pool[Math.floor(spinRand() * pool.length)];
      grantCosmetic(d.id);
      out.cosmetic = d;
      out.label = d.name;
    } else { grantChips(150, 'spin'); out.label = '210 chips'; out.fellBack = true; }
  }
  return out;
}
/* doSpin(now) — `now` exists for the test harness only. */
function doSpin(now){
  const st = spinState(now);
  if (!st.ok) return null;
  now = now == null ? Date.now() : now;
  const day = spinDayKey(now);
  const prize = spinRoll();
  const res = spinGrant(prize, day);
  S.spin = { day:day, t:now, n:((S.spin && S.spin.n) | 0) + 1, last:res.label };
  save();
  updateSpinBadge();
  return res;
}

/* ── the cosmetics shelf ───────────────────────────────────────────
   Which registered cosmetics are for sale. The rule, not a list, so
   whatever the games register lands on the right shelf on its own:
     FOR SALE   game cosmetics (boards, backs, felts, tokens...) that
                unlock between levels 2 and 12 and are not `earn`ed.
     NOT FOR SALE
       · level 0/1 things       — already everybody's;
       · anything above 12      — the ladder keeps its best things,
                                  or levelling stops meaning anything;
       · anything with `earn`   — a streak border you can buy is a lie;
       · everything of 'karti'  — borders, badges, faces are identity
                                  and prestige, not merchandise.
   Price rises with the level it would otherwise unlock at:
   level 2 → 180 coins (about 1.5 duel wins) up to level 12 → 780. */
const COSM_LEVEL_MAX = 12;
function cosmPrice(d){ return 120 + 60 * Math.max(1, (d.level | 0) - 1); }
/* the ONE shared deck (js/deck-kit.js) lives under 'karti' like the
   identity items do, but a card back is merchandise, not identity —
   the per-game backs it replaced were always for sale, so it stays on
   the shelf while borders/badges/faces/themes stay off it */
const deckSlot = d => d.game === 'karti' && (d.slot === 'back' || d.slot === 'felt');
/* An exclusive piece is never ordinary shelf stock, whichever way it is
   obtained. The WON ones already fall out of both lists on `!d.earn`;
   the BOUGHT ones (build 220 — kiri, ludu, tombla, spy, suspett, erbgha,
   minhu and the one House Deck) carry no earn test, so without this they
   would leak into the store — the cheap way as a buyable, or, being
   pitched above COSM_LEVEL_MAX, as a greyed "coming at level 40" tease
   that is a flat lie: no amount of levelling ever hands them over. The
   Exclusives tab is their only door. */
const exclPiece = d => typeof d.set === 'string' && d.set.indexOf('excl-') === 0;
function storeBuyables(){
  try {
    if (!window.KARTI_XP || !KARTI_XP.defs) return [];
    return KARTI_XP.defs().filter(d =>
      (d.game !== 'karti' || deckSlot(d)) && !d.earn && !exclPiece(d) &&
      d.level >= 2 && d.level <= COSM_LEVEL_MAX);
  } catch (e){ return []; }
}
function cosmOwned(id){
  try { return !!(window.KARTI_XP && KARTI_XP.owns(id)); } catch (e){ return false; }
}
/* The game cosmetics that are NOT for sale because they unlock higher up
   the ladder (above the store's level ceiling). Shown greyed beside the
   buyables so the store reads as "keep playing and there is more" rather
   than as a fixed shelf — the whole point of the ask. Earned exclusives
   and the karti identity items stay out; those are their own screens. */
function storeLadder(){
  try {
    if (!window.KARTI_XP || !KARTI_XP.defs) return [];
    return KARTI_XP.defs().filter(d =>
      (d.game !== 'karti' || deckSlot(d)) && !d.earn && !exclPiece(d) &&
      d.level > COSM_LEVEL_MAX);
  } catch (e){ return []; }
}
/* the next customisation THIS player will unlock by levelling, per game —
   the one-line carrot at the top of each game's shelf */
function cosmNext(game){
  try { return window.KARTI_XP && KARTI_XP.nextUnlock ? KARTI_XP.nextUnlock(game) : null; }
  catch (e){ return null; }
}
/* ── the exclusive grind set, per game ──────────────────────────────
   Read straight off KARTI_XP: the set's meta (name/slots/accent/how),
   its pieces (for the animated showcase), whether it is earned, and the
   live grind progress {won, need, pct} that drives the "Win 40 · 23/40"
   bar. Never throws — a build with no XP module simply shows nothing. */
function exclMeta(game){
  try { return window.KARTI_XP && KARTI_XP.exclusive ? KARTI_XP.exclusive(game) : null; }
  catch (e){ return null; }
}
function exclDefs(game){
  try { return window.KARTI_XP && KARTI_XP.exclusiveDefs ? KARTI_XP.exclusiveDefs(game) : []; }
  catch (e){ return []; }
}
function exclProg(game){
  try { return window.KARTI_XP && KARTI_XP.exclusiveProgress ? KARTI_XP.exclusiveProgress(game) : null; }
  catch (e){ return null; }
}
function exclEarned(game){
  try { return !!(window.KARTI_XP && KARTI_XP.exclusiveEarned && KARTI_XP.exclusiveEarned(game)); }
  catch (e){ return false; }
}
/* EVERY registered set, one row each, with everything the Exclusives tab
   and the Customise hero need. Driven off KARTI_XP.exclusiveGames() —
   never a hardcoded list — so an encore set keyed by its own id
   (gharraqroza, invisible to the old one-per-game showcase) and anything
   registered later appear on their own. `stat` is the record book that
   actually pays for the set (exclusiveStat), so the card can say which
   GAME an encore set belongs to. Sorted the way a player reads it:
   earned first, then the set nearest its milestone — the next goal. */
function exclAllRows(){
  let games = [];
  try {
    if (window.KARTI_XP && KARTI_XP.exclusiveGames) games = KARTI_XP.exclusiveGames() || [];
  } catch (e){ games = []; }
  const rows = [];
  games.forEach(g => {
    const meta = exclMeta(g);
    if (!meta) return;
    let stat = g;
    try { stat = (KARTI_XP.exclusiveStat && KARTI_XP.exclusiveStat(g)) || g; } catch (e){}
    /* `wear` is the game whose table actually shows the set, which is
       the honest heading for the one card exclusive: it is filed under
       'deck' and worn by every card game, so `stat` (a record book that
       does not exist for it) would read as a bare id. */
    rows.push({ g:g, meta:meta, stat:meta.wear && meta.wear !== g ? meta.wear : stat,
                defs:exclDefs(g), got:exclEarned(g), buy:!!meta.buy,
                pg:exclProg(g) || { won:0, need:0, pct:0, buy:false } });
  });
  rows.sort((a, b) =>
    (b.got ? 1 : 0) - (a.got ? 1 : 0) ||
    b.pg.pct - a.pg.pct ||
    a.pg.need - b.pg.need ||
    String(a.meta.name).localeCompare(String(b.meta.name)));
  return rows;
}

/* The grant goes through KARTI_XP.grant(), which owns the rules: it
   refuses ids it does not know, and refuses anything carrying an earn
   test — so Tempesta and the other earned items can never be bought at
   any price. It commits and syncs itself; save() here keeps the coin
   balance, which lives in S, in the same write. */
function grantCosmetic(id){
  try {
    if (!window.KARTI_XP || !KARTI_XP.grant) return false;
    const r = KARTI_XP.grant(id);
    if (!r || !r.ok) return false;
    save();
    return true;
  } catch (e){ return false; }
}
function buyCosmetic(id){
  if (!window.KARTI_XP) return { ok:false, why:'no-xp' };
  const d = KARTI_XP.def ? KARTI_XP.def(id) : null;
  if (!d) return { ok:false, why:'unknown' };
  if (!storeBuyables().some(b => b.id === id)) return { ok:false, why:'not-for-sale' };
  if (cosmOwned(id)) return { ok:false, why:'owned' };
  const price = cosmPrice(d);
  if (S.coins < price) return { ok:false, why:'coins', price:price };
  S.coins -= price;
  if (!grantCosmetic(id)){ S.coins += price; save(); return { ok:false, why:'grant' }; }
  save();
  if (window.KARTI_SFX){ try { KARTI_SFX.play('shop.buy'); } catch (e){} }
  return { ok:true, price:price, def:d };
}
function gameLabel(id){
  try {
    const shelf = (window.KARTI_STATS && KARTI_STATS.GAMES) || [];
    for (let i = 0; i < shelf.length; i++) if (shelf[i].id === id) return shelf[i].name;
  } catch (e){}
  const NICE = { 'cards-solo':'The Card Duel', 'cards-story':'Story Mode',
                 'cards-mp':'Multiplayer Duel', 'kiri':'IL-KIRI', 'tombla':'Tombla',
                 /* the ONE shared deck — every card game wears it */
                 'karti':'The Deck — every card game',
                 /* the games whose cosmetics were added later and are not on the
                    record-book shelf gameLabel reads first — a nice name here
                    keeps the store's per-game headings from reading as bare ids */
                 'gharraq':'Għarraqhom!', 'serp':'Is-Serp', 'ludu':'Ludu',
                 'erbgha':'Four in a Row', 'tankijiet':'It-Tankijiet',
                 'bomba':'Il-Bomba', 'briks':'Il-Ħajt', 'kodici':'Il-Kodiċi',
                 'minhu':'Min Hu?', 'cards2131':'21 & 31',
                 'gin':'Gin Rummy', 'poker':'Poker', 'rummy':'Rummy',
                 'spy':'Is-Spija', 'suspett':'Is-Suspett', 'kanun':'Il-Kanun',
                 'bixkla':'Bixkla', 'briscola':'Briscola', 'sette':'Sette e Mezzo',
                 'cheat':'Il-Gidba' };
  return NICE[id] || (id.charAt(0).toUpperCase() + id.slice(1));
}

/* ── the screen ──────────────────────────────────────────────────── */
function renderPackScreen(){
  storeCSS();
  renderStoreTabs();
  clearTimeout(spinTickT);
  const stage = $('#pack-stage');
  const rl = $('#rlabel'); if (rl) rl.innerHTML = '';
  const sp = $('#pack-sets');
  if (storeTab === 'spin' || storeTab === 'cosm' || storeTab === 'chips' || storeTab === 'excl'){
    /* orphan any pack reveal still in flight — same tokens the pack
       screen itself uses */
    packSeq++; packSkip = false; packBusy = false; packSkipFn = null;
    if (sp){ sp.style.display = 'none'; sp.classList.remove('hushed'); }
    if (stage) stage.classList.add('smode');
    updateCoinsPill();
    if (storeTab === 'spin') renderSpinTab();
    else if (storeTab === 'chips') renderChipsTab();
    else if (storeTab === 'excl') renderExclTab();
    else renderCosmTab();
    return;
  }
  if (sp) sp.style.display = '';
  if (stage) stage.classList.remove('smode');
  renderPackTab();
}
function setStoreTab(t){
  if (spinBusy || packBusy || boxBusy) return;
  if (storeTab === t){ renderPackScreen(); return; }
  storeTab = t;
  if (window.KARTI_SFX){ try { KARTI_SFX.play('ui.tap'); } catch (e){} }
  renderPackScreen();
}
function renderStoreTabs(){
  let tabs = $('#store-tabs');
  if (!tabs){
    const wrap = $('#scr-pack .packwrap');
    if (!wrap) return;
    tabs = document.createElement('div');
    tabs.id = 'store-tabs';
    tabs.className = 'storetabs';
    tabs.setAttribute('role', 'tablist');
    wrap.insertBefore(tabs, $('#pack-sets'));
  }
  const free = spinState().ok;
  const one = (id, icon, label, dot) =>
    '<button class="stab' + (storeTab === id ? ' on' : '') + '" data-st="' + id +
    '" role="tab" aria-selected="' + (storeTab === id) + '">' +
    (icon === 'chips' ? chipIco() : ico(icon)) + '<span>' + label + '</span>' +
    (dot ? '<i class="sdot" aria-label="free spin waiting"></i>' : '') + '</button>';
  /* five tabs since Exclusives moved out of the shelf — .s5 stacks the
     icon over the label so all five still fit a 360px phone */
  tabs.classList.add('s5');
  tabs.innerHTML =
    one('cards', 'pack', 'Packs', false) +
    one('chips', 'chips', 'Boxes', false) +
    one('spin', 'star', 'Daily', free) +
    one('cosm', 'rar-epiku', 'Customise', false) +
    one('excl', 'trophy', PREFS.lang === 'mt' ? 'Esklussivi' : 'Exclusives', false);
  $$('.stab', tabs).forEach(b => { b.onclick = () => setStoreTab(b.dataset.st); });
}
/* the store's header pill carries BOTH currencies now — chips first on
   the chips shelf (they are what that shelf spends), coins first
   elsewhere. `live` keeps a count-up already running from the wallet
   hook rather than snapping over it. */
function updateCoinsPill(live){
  const el = $('#pack-coins');
  if (!el) return;
  const coins = '<span class="wcoins">' + coinIco('Coins') +
                '<span class="mono">' + (S.coins | 0) + '</span></span>';
  const chips = '<span class="wchips">' + chipIco('Chips') +
                '<span class="mono">' + (S.chips | 0) + '</span></span>';
  const html = storeTab === 'chips' ? chips + coins : coins + chips;
  if (live && el._econ === storeTab){
    /* same layout already up — just move the numbers, with easing */
    animateCount(el.querySelector('.wchips'), S.chips | 0);
    animateCount(el.querySelector('.wcoins'), S.coins | 0);
    return;
  }
  el._econ = storeTab;
  el.innerHTML = html;
}
/* ── HOME DAILY-SPIN BADGE ───────────────────────────────────────────────
   A COMPACT badge under the avatar (#spin-slot, top-left), and ONLY when a
   free spin is waiting. When today's spin is already claimed the badge is not
   rendered at all — the slot is emptied — which keeps the corner clean and the
   home column short. Tap opens the app's EXISTING daily spin (the Store's
   "spin" tab). Everything comes off spinState(); no second source of truth.
   The wheel art (art/ui/spin-wheel.png) is swapped onto the medallion by
   detectArt() once it has decoded; absent, the drawn star stays — graceful
   fallback. */
function renderDailySpinBtn(){
  const slot = $('#spin-slot');
  if (!slot) return;
  const st = spinState();
  if (!st.ok){ slot.innerHTML = ''; return; }   /* claimed / not ready → hidden */
  slot.innerHTML =
    '<button class="spinbadge" id="btn-dailyspin" type="button" ' +
      'aria-label="Daily reward is ready — spin the wheel">' +
      '<span class="ds-art" aria-hidden="true">' +
        '<svg class="ds-star" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<use href="#i-star"></use></svg></span>' +
      '<span class="ds-label">Free spin!</span>' +
    '</button>';
  const btn = $('#btn-dailyspin', slot);
  if (btn) btn.onclick = openDailySpin;
  /* if the wheel art already loaded this session, put it on straight away */
  try { applySpinWheelArt(); } catch (e){}
}
/* Open the app's existing Daily Spin. It lives as a tab on the Store screen,
   so select that tab first, then route — ready OR claimed, the same door
   (claimed shows the countdown and the odds there). */
function openDailySpin(){
  storeTab = 'spin';
  go('pack');
}

/* The gold dot on Home's Store tab (and the tab strip) while the free
   spin is waiting. Pure decoration on markup game.js does not own, so
   it adds and removes only its own element. */
function updateSpinBadge(){
  const btn = $('#btn-packs');
  if (btn){
    let dot = $('.sdot', btn);
    const want = !!spinState().ok;
    if (want && !dot){
      dot = document.createElement('i');
      dot.className = 'sdot';
      dot.setAttribute('aria-hidden', 'true');
      btn.appendChild(dot);
    } else if (!want && dot) dot.remove();
  }
  if (current === 'pack'){
    const tabs = $('#store-tabs');
    if (tabs){
      const st = $('.stab[data-st="spin"] .sdot', tabs);
      const want2 = !!spinState().ok;
      if (want2 && !st){
        const b = $('.stab[data-st="spin"]', tabs);
        if (b){ const i = document.createElement('i'); i.className = 'sdot'; b.appendChild(i); }
      } else if (!want2 && st) st.remove();
    }
  }
}

/* ── DAILY SPIN, the shelf ─────────────────────────────────────────
   The rules, said plainly, above the fold:
     · one a day, free, forever — no coins taken, no second spin sold;
     · the odds printed from the live table;
     · every spin pays something;
     · where the spin lives (your save), said out loud. */
function spinCountdownText(next){
  const ms = Math.max(0, next - Date.now());
  let h = Math.floor(ms / 3600000);
  let m = Math.ceil((ms % 3600000) / 60000);
  if (m === 60){ h++; m = 0; }
  return h > 0 ? h + 'h ' + m + 'm' : Math.max(1, m) + 'm';
}
function spinOddsHTML(){
  return '<div class="oddsbox"><p class="oddshead">The odds, exactly:</p>' +
    SPIN_TABLE.map(p =>
      '<div class="oddsrow"><b class="mono">' + p.pct + '%</b>' +
      '<span class="oi">' + icoPrize(p.ic) + '</span><span>' +
      (p.kind === 'cosmetic'
        ? 'A customisation item you do not own <small>(all owned? 150 extra chips instead)</small>'
        : esc(p.label)) + '</span></div>').join('') +
    '<p class="oddsfoot">Every spin wins something. These numbers are the ones the ' +
    'spin actually rolls — nothing hidden.</p></div>';
}
/* ── THE WHEEL ─────────────────────────────────────────────────────
   Built from SPIN_TABLE, so it can never show a prize the roll cannot
   pay. SEVEN EQUAL WEDGES, not wedges sized by their odds: a 1% wedge
   drawn honestly is 3.6° wide — invisible, unlandable, and unreadable.
   The honesty is kept where it can actually be read instead: EVERY
   WEDGE PRINTS ITS OWN PERCENTAGE, and the full table sits underneath.
   So the wheel is the ceremony and nothing about it oversells.

   NOT art/ui/spin-wheel.png. That file is a 4-segment illustration with
   a pointer baked into it — lovely as a badge, wrong as a wheel (seven
   prizes, and its pointer would rotate with the disc). It earns its keep
   here as the HUB CAP, centre-cropped onto the knob. */
const SPIN_SEG = 360 / SPIN_TABLE.length;
/* Neighbouring wedges must differ, and the three rare lines carry the
   art's own teal / magenta / gold so scarcity reads before the text
   does. Keyed by id with a fallback, so a new SPIN_TABLE line gets a
   colour rather than a hole. */
const SPIN_WEDGE = {
  ch60:'#1C2743', ch90:'#26355C', xp18:'#14413C', ch150:'#26355C',
  ch250:'#3B2A63', cosm:'#5A1440', pack:'#6B4A0C'
};
/* The wheel says what it pays in two or three words. The full line —
   and the odds — live in the table under it. */
const SPIN_SHORT = {
  ch60:'60', ch90:'90', xp18:'+18 XP', ch150:'150',
  ch250:'250', cosm:'Shop item', pack:'Card pack'
};
/* Where the disc is resting, in absolute degrees. Module-level ON
   PURPOSE: a second spin carries on from where the first one stopped
   instead of snapping back to twelve o'clock, and re-rendering the tab
   redraws the wheel exactly where the player left it. */
let spinAngle = 0;

function spinWheelHTML(){
  const stops = [];
  let labs = '';
  SPIN_TABLE.forEach((p, i) => {
    const c = SPIN_WEDGE[p.id] || (i % 2 ? '#26355C' : '#1C2743');
    stops.push(c + ' ' + (i * SPIN_SEG).toFixed(3) + 'deg ' +
                         ((i + 1) * SPIN_SEG).toFixed(3) + 'deg');
    labs += '<div class="swseg" style="transform:rotate(' +
        (i * SPIN_SEG + SPIN_SEG / 2).toFixed(3) + 'deg)">' +
      '<div class="swlab" data-i="' + i + '">' +
        '<span class="swi">' + icoPrize(p.ic) + '</span>' +
        '<span class="swn">' + esc(SPIN_SHORT[p.id] || p.label) + '</span>' +
        '<span class="swp mono">' + p.pct + '%</span>' +
      '</div></div>';
  });
  return '<div class="swwrap" id="swwrap">' +
      '<div class="swrim">' +
        '<div class="swdisc" id="swdisc" style="background:conic-gradient(from 0deg,' +
            stops.join(',') + ');transform:rotate(' + spinAngle.toFixed(3) + 'deg)">' +
          '<div class="swspokes" aria-hidden="true"></div>' + labs +
        '</div>' +
        '<div class="swglow" aria-hidden="true"></div>' +
        '<div class="swhub" id="swhub" aria-hidden="true"></div>' +
        '<div class="swptr" id="swptr" aria-hidden="true"></div>' +
      '</div>' +
    '</div>';
}
/* The hub cap, mounted only if the art actually decoded.

   MEASURED OFF THE FILE, not guessed — two earlier guesses (641%, 760%)
   both left a ring of the illustration's magenta and teal around the
   knob. In art/ui/spin-wheel.png the gold knob is 62px across a 512px
   image and its centre sits at (256, 261), five pixels BELOW the image
   centre. 512/62 = 826%, and 51.1% vertical is the background-position
   that brings y=261 to the middle of the hub. Percentages, not pixels,
   so the crop survives the 52px hub on short screens.
   The corners of that square crop still catch a little teal and
   magenta; border-radius:50% cuts them off. */
function spinMountHub(){
  const hub = $('#swhub');
  if (!hub || !ART.spinWheel) return;
  hub.style.backgroundImage = 'url("' + ART.spinWheel + '")';
  hub.style.backgroundSize = '826%';
  hub.style.backgroundPosition = '50% 51.1%';
  hub.classList.add('art');
}

function renderSpinTab(){
  clearTimeout(spinTickT);
  spinBusy = false;
  const stage = $('#pack-stage');
  const bar = $('#pack-bar');
  if (!stage || !bar) return;
  const st = spinState();
  const sp = S.spin || {};
  /* THE FIRST SPIN IS PURE CEREMONY. The odds table appears from the
     SECOND spin on and then never leaves — a first-timer meets a wheel,
     not a legal notice, and everyone after that has the numbers under
     it for good. */
  const seen = ((sp.n | 0) > 0);
  stage.innerHTML =
    '<div class="spinwrap swz">' +
      '<div class="spinhead">' +
        '<h3>' + ico('star') + ' One free spin a day</h3>' +
        '<p class="tiny">Free means free — it never costs a coin and there is no second spin.</p>' +
      '</div>' +
      spinWheelHTML() +
      (seen ? spinOddsHTML()
            : '<p class="spinlast">Every spin wins something — the odds are printed on the wheel.</p>') +
      (!st.ok && sp.last
        ? '<p class="spinlast">Today you won: <b>' + esc(sp.last) + '</b></p>' : '') +
      '<p class="spinnote">Your spin lives in your save — with an account it follows you ' +
        'to any phone; as a guest it stays on this device.</p>' +
    '</div>';
  spinMountHub();
  const wrap = $('#swwrap');
  if (wrap && st.ok) wrap.classList.add('ready');
  if (st.ok){
    bar.innerHTML =
      '<button class="btn primary" id="spin-go">' + ilb('star', 'Spin — free today') + '</button>' +
      '<button class="btn ghost sm" id="spin-home">Back to menu</button>';
    $('#spin-go').onclick = runSpin;
  } else {
    const why = st.why === 'clock'
      ? 'This phone’s clock has jumped backwards. The spin unlocks when real time catches up.'
      : 'Come back tomorrow — next free spin in ' + spinCountdownText(st.next) + '.';
    bar.innerHTML =
      '<p class="hint" id="spin-wait">' + why + '</p>' +
      '<button class="btn ghost sm" id="spin-home">Back to menu</button>';
    /* tick the countdown while the screen is up; flip to the button
       the moment the day turns */
    spinTickT = setTimeout(() => {
      if (current === 'pack' && storeTab === 'spin' && !spinBusy) renderSpinTab();
    }, 30000);
  }
  $('#spin-home').onclick = () => go('home');
}

/* ── the ceremony ──────────────────────────────────────────────────
   The wheel turns IN PLACE — the same disc the player was just looking
   at, never a swapped-in screen — so the thing that pays is visibly the
   thing that was sitting there. Wind-up, flight, a long crawling tail,
   then the prize popup: rays, the medallion, and a Collect button.

   NOTHING HERE DECIDES ANYTHING. doSpin() has already rolled, granted
   and SAVED before a degree of this moves; the wheel is told where to
   stop. Tap to skip. Reduced motion sets the disc to the answer and
   goes straight to the popup. */
const SPIN_EASE = [0.16, 0.62, 0.28, 1];   /* flick, then a long friction tail */
const SPIN_MS   = 2800;
const SPIN_TURNS = 4;

/* y at x on a cubic-bezier(x1,y1,x2,y2), Newton on x. The wheel's angle
   has to be known at any instant so the ticks can fire when a wedge
   boundary ACTUALLY passes the pointer rather than on a guessed
   schedule — that sync is the whole sound of a wheel. */
function spinEaseY(x, c){
  let t = x;
  for (let i = 0; i < 8; i++){
    const mt = 1 - t, mt2 = mt * mt, t2 = t * t;
    const bx = 3 * mt2 * t * c[0] + 3 * mt * t2 * c[2] + t2 * t;
    const d  = 3 * mt2 * c[0] + 6 * mt * t * (c[2] - c[0]) + 3 * t2 * (1 - c[2]);
    if (Math.abs(d) < 1e-6) break;
    let nt = t - (bx - x) / d;
    t = nt < 0 ? 0 : nt > 1 ? 1 : nt;
  }
  const mt = 1 - t, mt2 = mt * mt, t2 = t * t;
  return 3 * mt2 * t * c[1] + 3 * mt * t2 * c[3] + t2 * t;
}

/* Where the disc must come to rest for wedge `idx` to be under the
   pointer. The pointer sits at twelve o'clock and the conic gradient
   starts there too, so a wedge at own-frame angle `a` shows at a+angle:
   we need a ≡ -angle.

   THE NEAR MISS. The disc turns clockwise, so wedges arrive at the
   pointer in DESCENDING own-frame angle — wedge idx+1 passes just
   before idx does. Resting near the target's HIGH edge therefore reads
   as "it only just got out of the last one"; near its LOW edge reads as
   "one more click and it was gone". Both are true landings, neither is
   a cheat — the wedge that wins is the wedge that was already rolled.
   A third of the time it just stops in the middle, because a wheel that
   near-misses every single day stops being a near miss. Never closer
   than 14% of a wedge to a boundary, so which one won is never in
   doubt. */
function spinRestAngle(idx, from){
  const edge = SPIN_SEG * 0.36;
  const r = spinRand();
  const off = r < 0.42 ?  edge          /* only just made it in        */
            : r < 0.68 ? -edge          /* nearly went one further     */
            : (spinRand() - 0.5) * SPIN_SEG * 0.44;
  const want = -(idx * SPIN_SEG + SPIN_SEG / 2 + off);
  /* the smallest angle ≥ from + a full SPIN_TURNS that is congruent to
     `want` — always forward, never a backwards jump */
  const min = from + SPIN_TURNS * 360;
  return min + ((want - min) % 360 + 360) % 360;
}

function runSpin(){
  if (spinBusy) return;
  const st = spinState();
  if (!st.ok){ renderSpinTab(); return; }
  spinBusy = true;
  const res = doSpin();
  if (!res){ spinBusy = false; renderSpinTab(); return; }
  updateCoinsPill();
  const idx = Math.max(0, SPIN_TABLE.indexOf(res.prize));
  const stage = $('#pack-stage');
  const bar = $('#pack-bar');
  const disc = $('#swdisc'), wrap = $('#swwrap'), ptr = $('#swptr');
  /* Reduced motion still gets the ANSWER on the wheel — the disc is set
     to the winning wedge with no travel, so the popup is explained. */
  if (REDUCED || !disc || !stage){
    spinAngle = -(idx * SPIN_SEG + SPIN_SEG / 2);
    if (disc) disc.style.transform = 'rotate(' + spinAngle.toFixed(3) + 'deg)';
    spinPop(res);
    return;
  }
  const sfx = window.KARTI_SFX;
  const beep = (id, o) => { if (sfx) try { sfx.play(id, o); } catch (e){} };
  const buzz = k => { if (sfx && sfx.haptic) try { sfx.haptic(k); } catch (e){} };

  const from = spinAngle;
  const to = spinRestAngle(idx, from);
  const wind = from - 9;               /* the pull-back before the flick */
  if (wrap){ wrap.classList.remove('ready'); wrap.classList.add('spinning'); }
  if (bar) bar.innerHTML = '<p class="hint" id="spin-skip">Tap the wheel to skip</p>';
  beep('ui.swipe');
  buzz('tap');

  let done = false, ticks = 0, lastTick = 0, mainAnim = null, raf = 0;
  const total = to - wind;
  /* how many boundaries the whole flight crosses — used only to know
     which ticks are the LAST few, the ones that get the falling notes */
  const crossTotal = Math.floor(total / SPIN_SEG);

  const land = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    spinAngle = ((to % 360) + 360) % 360;
    disc.style.transform = 'rotate(' + spinAngle.toFixed(3) + 'deg)';
    if (wrap) wrap.classList.remove('spinning');
    /* the peg lets go: a hair of recoil, the way a real wheel settles */
    try {
      disc.animate([{ transform:'rotate(' + spinAngle + 'deg)' },
                    { transform:'rotate(' + (spinAngle - 1.4) + 'deg)' },
                    { transform:'rotate(' + spinAngle + 'deg)' }],
                   { duration:300, easing:'ease-out' });
    } catch (e){}
    const won = $('.swlab[data-i="' + idx + '"]');
    if (won) won.classList.add('won');
    beep('piece.place');
    buzz('thud');
    setTimeout(() => { if (stage) stage.onclick = null; spinPop(res); }, 360);
  };

  /* THE TICKER. Driven off the animation's own clock, not a timetable:
     each frame we work out where the disc is, and every wedge boundary
     it has passed since the last frame fires a click and flicks the
     pointer. So the ticks bunch up and thin out because the WHEEL is
     slowing, not because a loop said so.
     One tick per frame at most, and never inside 45 ms — a wheel doing
     30 crossings a second is a machine-gun, not a wheel, and the voice
     cap would eat it anyway. That floor only bites while it is fast; by
     the time it matters every boundary gets its own click. */
  const t0 = performance.now();
  let crossed = Math.floor(0);
  const frame = () => {
    if (done) return;
    const el = performance.now() - t0;
    const u = Math.min(1, el / SPIN_MS);
    const passed = Math.floor(total * spinEaseY(u, SPIN_EASE) / SPIN_SEG);
    if (passed > crossed){
      crossed = passed;
      const now = performance.now();
      if (now - lastTick >= 45){
        lastTick = now;
        ticks++;
        beep('rail.tick', { force:true });
        buzz('tick');
        /* The last four boundaries get a RISING pentatonic under the
           click — the wheel is running out of road and the figure climbs
           into the payoff rather than sighing out of it. It says the
           wheel is stopping; it says nothing about WHERE, so the near
           miss still lands. */
        const left = crossTotal - crossed;
        if (left >= 0 && left < 4 && sfx && sfx.note)
          try { sfx.note(3 - left, { gain:0.5 }); } catch (e){}
        if (ptr) try {
          ptr.animate([{ transform:'rotate(0deg)' }, { transform:'rotate(15deg)' },
                       { transform:'rotate(0deg)' }],
                      { duration:140, easing:'ease-out' });
        } catch (e){}
      }
    }
    if (u < 1) raf = requestAnimationFrame(frame);
  };

  disc.style.transform = 'rotate(' + wind + 'deg)';
  const windAnim = disc.animate(
    [{ transform:'rotate(' + from + 'deg)' }, { transform:'rotate(' + wind + 'deg)' }],
    { duration:190, easing:'cubic-bezier(.4,0,1,1)', fill:'forwards' });
  windAnim.onfinish = () => {
    if (done) return;
    mainAnim = disc.animate(
      [{ transform:'rotate(' + wind + 'deg)' }, { transform:'rotate(' + to + 'deg)' }],
      { duration:SPIN_MS, easing:'cubic-bezier(' + SPIN_EASE.join(',') + ')', fill:'forwards' });
    mainAnim.onfinish = land;
    raf = requestAnimationFrame(frame);
  };
  /* belt and braces: the prize is already saved, so if the animation is
     ever throttled into never finishing (background tab, odd engine),
     the result still lands on real time */
  setTimeout(land, 190 + SPIN_MS + 700);
  stage.onclick = () => {
    try { windAnim.finish(); } catch (e){}
    try { if (mainAnim) mainAnim.finish(); } catch (e){}
    land();
  };
}

/* ── THE PRIZE POPUP ───────────────────────────────────────────────
   The reveal proper: a popup OVER the store, a sunburst of rays
   slow-turning behind the prize, and a Collect button — the tap that
   makes it a reward rather than a notification. The prize is granted
   and saved long before this runs; everything here is theatre over a
   decision already made, and dismissing it any way at all (Collect,
   the scrim, a forced navigation) loses nothing.
   Compositor only: the rays are two already-rasterised conic layers
   rotating on `transform`; everything else moves on transform/opacity.
   No per-frame JS — the turn is a single infinite CSS animation. */
let spinPopEl = null;
function spinPopKill(){
  if (spinPopEl){
    try { spinPopEl.remove(); } catch (e){}
    spinPopEl = null;
    spinBusy = false;
  }
}
/* Intensity is read off the TABLE, not off the prize id: the rarer
   the line, the bigger the light. pct ≥20 modest · ≥6 warm · ≥2 epic
   · below that (the 1% pack) legendary. A new prize line added to
   SPIN_TABLE gets the right ceremony on its own. */
function spinTier(prize){
  const p = (prize && prize.pct) | 0;
  return p >= 20 ? 0 : p >= 6 ? 1 : p >= 2 ? 2 : 3;
}
function spinPop(res){
  if (current !== 'pack'){ spinBusy = false; return; }  /* prize already saved */
  spinPopKill();
  spinBusy = true;
  const tier = spinTier(res.prize);
  /* the same colour language as the pack reveal: gold for the everyday,
     epic purple for the 2-3% lines, legendary gold-white for the 1% */
  const col = tier === 3 ? (RARITY.leggendarju ? RARITY.leggendarju.c : '#FFB300')
            : tier === 2 ? (RARITY.epiku ? RARITY.epiku.c : '#9C27B0')
            : '#FFC542';
  const isCosm = !!res.cosmetic;
  const el = document.createElement('div');
  el.className = 'spop t' + tier + (REDUCED ? ' rm' : '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Daily spin prize: ' + res.label);
  el.style.setProperty('--fxc', col);
  el.innerHTML =
    '<div class="spop-scrim"></div>' +
    '<div class="spop-core">' +
      '<div class="spop-fx" aria-hidden="true">' +
        '<div class="spop-halo"></div>' +
        '<div class="spop-rays r1"></div>' +
        '<div class="spop-rays r2"></div>' +
        (tier === 3 ? '<div class="spop-flash"></div>' : '') +
      '</div>' +
      '<div class="spop-med" id="spop-med">' +
        '<p class="srlead">Your daily spin pays</p>' +
        (isCosm && res.cosmetic.preview
          ? '<div class="sprev" id="spop-prev"></div>'
          : '<div class="spop-ic">' + icoPrize(res.prize.ic) + '</div>') +
        '<div class="spop-what">' + esc(res.label) + '</div>' +
        (isCosm ? '<p class="tiny">' + esc(res.cosmetic.blurb || '') + '</p>' : '') +
        (res.levelled ? '<p class="srlvl">' + ico('trophy') + ' LEVEL UP!</p>' : '') +
        (res.fellBack && res.prize.kind === 'cosmetic'
          ? '<p class="tiny">You own every shop item — coins instead.</p>' : '') +
      '</div>' +
      '<button class="btn primary spop-take" id="spop-take">' +
        ilb('check', 'Collect') + '</button>' +
    '</div>';
  document.body.appendChild(el);
  spinPopEl = el;
  if (isCosm && res.cosmetic.preview){
    try {
      const pv = res.cosmetic.preview(96);
      const host = $('#spop-prev', el);
      if (host && pv) (typeof pv === 'string') ? host.innerHTML = pv : host.appendChild(pv);
    } catch (e){}
  }
  /* the entrance: .in a frame late so the scrim/ray transitions run.
     Reduced motion lands everything instantly — the CSS under .rm
     stops the rays turning and the medallion popping. */
  if (REDUCED) el.classList.add('in');
  else requestAnimationFrame(() => requestAnimationFrame(() => {
    if (spinPopEl === el) el.classList.add('in');
  }));
  if (window.KARTI_SFX){
    try {
      KARTI_SFX.play('ui.reward');
      if (tier >= 2) setTimeout(() => { try { KARTI_SFX.play('xp.unlock'); } catch (e){} }, 220);
    } catch (e){}
  }
  /* the burst of sparks, timed to land with the medallion's overshoot;
     particles() is already a no-op under reduced motion */
  const med = $('#spop-med', el);
  if (med) setTimeout(() => {
    if (spinPopEl === el) particles(med, [8, 12, 18, 26][tier], col, tier >= 2 ? 205 : 145);
  }, 200);
  let taken = false;
  const take = () => {
    if (taken || spinPopEl !== el) return;
    taken = true;
    if (window.KARTI_SFX){
      try {
        KARTI_SFX.play(res.prize.kind === 'chips' || res.fellBack ? 'ui.coin' : 'ui.note');
      } catch (e){}
    }
    const fin = () => { spinPopKill(); if (current === 'pack' && storeTab === 'spin') spinResult(res, true); };
    if (REDUCED){ fin(); return; }
    el.classList.add('out');
    setTimeout(fin, 230);
  };
  const btn = $('#spop-take', el);
  if (btn){ btn.onclick = take; try { btn.focus({ preventScroll:true }); } catch (e){} }
  /* the scrim collects too — there is nothing here to cancel; the prize
     is already yours, so any way out of the popup is Collect */
  el.addEventListener('click', e => {
    if (e.target === el || e.target.classList.contains('spop-scrim')) take();
  });
}
/* The screen under the popup once the prize is collected. `quiet`
   means the popup already did the celebrating (sound, sparks) — this
   is just the receipt, so a double fanfare never plays. Called bare
   (no popup path left alive) it still celebrates as it used to. */
function spinResult(res, quiet){
  spinBusy = false;
  const stage = $('#pack-stage');
  const bar = $('#pack-bar');
  if (!stage) return;
  stage.onclick = null;
  const st = spinState();
  const isCosm = !!res.cosmetic;
  const isPack = res.prize.kind === 'pack' && !res.fellBack;
  let prevHTML = '';
  if (isCosm && res.cosmetic.preview){
    prevHTML = '<div class="sprev" id="sprev"></div>';
  }
  stage.innerHTML =
    '<div class="spinwrap sres">' +
      '<div class="spinres" id="spinres">' +
        '<p class="srlead">' + (quiet ? 'Collected' : 'Your daily spin pays') + '</p>' +
        (prevHTML || '<div class="srico">' + icoPrize(res.prize.ic) + '</div>') +
        '<div class="srwhat">' + esc(res.label) + '</div>' +
        (isCosm ? '<p class="tiny">' + esc(res.cosmetic.blurb || '') + '</p>' : '') +
        (res.levelled ? '<p class="srlvl">' + ico('trophy') + ' LEVEL UP!</p>' : '') +
        (res.fellBack && res.prize.kind === 'cosmetic'
          ? '<p class="tiny">You own every shop item — coins instead.</p>' : '') +
      '</div>' +
      '<p class="spinnote">Next free spin ' +
        (st.next ? 'in ' + spinCountdownText(st.next) : 'tomorrow') + '.</p>' +
    '</div>';
  if (isCosm && res.cosmetic.preview){
    try {
      const pv = res.cosmetic.preview(96);
      const host = $('#sprev');
      if (host && pv) (typeof pv === 'string') ? host.innerHTML = pv : host.appendChild(pv);
    } catch (e){}
  }
  if (!quiet){
    const box = $('#spinres');
    if (box && !REDUCED) particles(box, isCosm || isPack ? 16 : 8, 'var(--gold)', 150);
    if (window.KARTI_SFX){
      try {
        KARTI_SFX.play('ui.reward');
        if (res.prize.kind === 'chips' || res.fellBack)
          setTimeout(() => { try { KARTI_SFX.play('ui.coin'); } catch (e){} }, 260);
      } catch (e){}
    }
  }
  updateCoinsPill();
  if (bar){
    bar.innerHTML =
      (isPack ? '<button class="btn primary" id="sr-pack">' +
                ilb('pack', 'Open it now') + '</button>' : '') +
      (isCosm ? '<button class="btn primary" id="sr-wear">' +
                ilb('check', 'Wear it now') + '</button>' : '') +
      '<button class="btn ghost sm" id="sr-home">Back to menu</button>';
    const bp = $('#sr-pack');
    if (bp) bp.onclick = () => { storeTab = 'cards'; renderPackScreen(); };
    const bw = $('#sr-wear');
    if (bw) bw.onclick = () => {
      try {
        const r = KARTI_XP.equip('', res.cosmetic.id);
        toast(r && r.ok ? '“' + res.cosmetic.name + '” equipped.' : '⚠ Could not equip it.');
      } catch (e){ toast('⚠ Could not equip it.'); }
      bw.disabled = true;
    };
    $('#sr-home').onclick = () => go('home');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   THE CHIPS STORE — loot boxes, the chips→coins bridge
   ───────────────────────────────────────────────────────────────────
   The shelf where the PLAY currency becomes the SPEND currency. The
   boxes, their prices and their odds all live in js/progress.js §7e
   (KARTI_XP.boxes() / openBox()); this screen only draws that truth
   and throws the ceremony. The odds are printed under every box FROM
   THE SAME TABLE THE ROLL WALKS, the same honesty rule the daily spin
   lives by. Buying is two taps (price → "Sure?"), the same guard the
   cosmetics shelf uses for real currency.

   THE REVEAL is the heart of the loop and is staged like a ritual:
     1. CHARGE — the box lands centre-stage, starts to tremble, light
        leaking from the seam, ticks rising. Tap to skip. (~1.1s)
     2. BURST — the lid blows, a flash on the big tiers, sparks, the
        sunburst comes up (the spop ray rig, reused — one rasterised
        conic layer rotating, costs a phone nothing).
     3. THE PRIZE — the medallion pops with the amount COUNTING UP,
        rarity-scaled light behind it (t0 warm … t3 the room lighting
        up, colours straight off the pack rarity language).
     4. SETTLE — Collect. The wallet counts up as it lands.
   Reduced motion (OS setting or body.reduced) skips straight to the
   settled prize: still, readable, nothing turning.
   ═══════════════════════════════════════════════════════════════════ */
let boxConfirm = '';             /* two taps to spend chips            */
let boxConfirmT = 0;
let boxPopEl = null;

function econBoxes(){
  try {
    if (window.KARTI_XP && KARTI_XP.boxes) return KARTI_XP.boxes();
  } catch (e){}
  return [];
}
/* the drawn crate — pure CSS layers tinted by the tier accent, so the
   shelf works with no art on disk. Lid, body, hasp, and a glow seam
   that the charge phase breathes through. */
function boxArtHTML(accent, big, id){
  /* PAINTED CRATE FIRST, drawn crate second. art/ui/box-<id>.png is a real
     illustration (woven qoffa, banded senduq, the Knights' gilded tezor); the
     CSS lid/body/hasp stays underneath as the fallback so a deploy without the
     art pack still shows a box rather than a hole. */
  const src = id && uiArt ? uiArt('box', 'box-' + id + '.png') : '';
  return '<span class="bxart' + (big ? ' big' : '') + (src ? ' painted' : '') +
      '" style="--bxa:' + esc(accent) + '" aria-hidden="true">' +
    '<b class="bx-glow"></b><b class="bx-body"></b><b class="bx-lid"></b><b class="bx-hasp"></b>' +
    (src ? '<img class="bx-img" src="' + src + '" alt="" onerror="this.remove()">' : '') +
  '</span>';
}
function boxTierColor(tier){
  return tier >= 3 ? (RARITY.leggendarju ? RARITY.leggendarju.c : '#FFB300')
       : tier === 2 ? (RARITY.epiku ? RARITY.epiku.c : '#9C27B0')
       : '#FFC542';
}
function boxOddsHTML(b){
  return '<details class="bxodds"><summary>The odds, exactly</summary>' +
    '<div class="oddsbox">' +
      b.odds.map(p =>
        '<div class="oddsrow"><b class="mono">' + p.pct + '%</b>' +
        '<span class="oi">' + (p.kind === 'chips' ? chipIco() : ico(p.kind === 'pack' ? 'pack' : 'coin')) +
        '</span><span>' + esc(p.label) + '</span></div>').join('') +
      '<p class="oddsfoot">Every box pays something. These are the numbers the roll actually uses.</p>' +
    '</div></details>';
}
/* The odds, moved off the shelf and behind one tap. Every box, every line,
   the same numbers the roll actually walks — the honesty is unchanged, it just
   no longer costs three screens of scrolling to see the third crate. */
function boxOddsSheet(boxes){
  openSheet('<h3>' + ico('info') + ' What each box pays</h3>' +
    boxes.map(b =>
      '<div class="bxo-grp" style="--bxa:' + esc(b.accent) + '">' +
        '<b class="bxo-h">' + esc(b.name) + ' <span class="mono">' + b.price + '</span>' + chipIco() + '</b>' +
        '<p class="tiny">' + esc(b.blurb) + '</p>' +
        '<div class="oddsbox">' +
          b.odds.map(o =>
            '<div class="oddsrow"><b class="mono">' + o.pct + '%</b>' +
            '<span class="oi">' + (o.kind === 'chips' ? chipIco() : ico(o.kind === 'pack' ? 'pack' : 'coin')) +
            '</span><span>' + esc(o.label) + '</span></div>').join('') +
        '</div>' +
      '</div>').join('') +
    '<p class="oddsfoot">Every box pays something. These are the numbers the roll uses — ' +
      'nothing hidden. Chips come from playing, never from a card.</p>');
}

function renderChipsTab(){
  chipsCSS();
  boxBusy = false;
  updateCoinsPill();               /* header and hero must never disagree */
  const stage = $('#pack-stage');
  const bar = $('#pack-bar');
  if (!stage || !bar) return;
  const boxes = econBoxes();
  if (!boxes.length){
    stage.innerHTML = '<div class="spinwrap"><div class="cosmempty">' +
      '<h3>The boxes did not load</h3>' +
      '<p class="tiny">Reopen the app and this shelf stocks itself.</p></div></div>';
    bar.innerHTML = '<button class="btn ghost sm" id="bx-home">Back to menu</button>';
    const bh = $('#bx-home'); if (bh) bh.onclick = () => go('home');
    return;
  }
  const bal = S.chips | 0;
  /* ── ONE SCREEN, NO SCROLL ──────────────────────────────────────────
     This shelf used to be a column: a balance card, a paragraph, then three
     tall rows each carrying a blurb and an odds dropdown, then a closing
     note. Three boxes and you could not see three boxes — you scrolled past
     the first to reach the last, which is the one thing a shop must never
     make you do. Now: one balance strip, three crates side by side, and the
     odds behind a tap. Nothing about the maths is hidden, it is just not
     shouted over the goods. */
  stage.innerHTML =
    '<div class="bxwrap2">' +
      '<div class="bxbal2" aria-label="Your chips: ' + bal + '">' +
        '<span class="bxbal-ic">' + chipIco() + '</span>' +
        '<b class="mono" id="bx-bal">' + bal + '</b><i>CHIPS</i>' +
        '<span class="bxbal-sub tiny">Chips come from playing. The daily spin tops you up free.</span>' +
      '</div>' +
      '<div class="bxrow">' +
        boxes.map(b => {
          const can = bal >= b.price;
          const arm = boxConfirm === b.id;
          return '<button class="bxtile' + (can ? '' : ' poor') + (arm ? ' arm' : '') +
              '" style="--bxa:' + esc(b.accent) + '" data-box="' + esc(b.id) + '"' +
              (can ? '' : ' disabled') +
              ' aria-label="' + esc(b.name) + ', ' + b.price + ' chips' +
              (can ? '' : ', you need ' + (b.price - bal) + ' more') + '">' +
            boxArtHTML(b.accent, false, b.id) +
            '<b class="bxname">' + esc(b.name) + '</b>' +
            '<span class="bxprice' + (can ? '' : ' no') + '">' + chipIco() +
              '<span>' + (arm ? 'SURE?' : b.price) + '</span></span>' +
            (can ? '' : '<small class="bxneed">' + (b.price - bal) + ' more</small>') +
          '</button>';
        }).join('') +
      '</div>' +
      '<button class="bxoddsbtn" id="bx-odds">' + ico('info') +
        ' What each box pays — the exact odds</button>' +
    '</div>';
  bar.innerHTML = '<button class="btn ghost sm" id="bx-home">Back to menu</button>';
  const bh = $('#bx-home'); if (bh) bh.onclick = () => go('home');
  const ob = $('#bx-odds');
  if (ob) ob.onclick = () => boxOddsSheet(boxes);
  $$('.bxtile', stage).forEach(btn => {
    btn.onclick = () => buyBoxTap(btn.dataset.box);
  });
}
/* two taps for real currency — the same discipline as the cosmetics
   shelf, with the same 2.6s window to think better of it */
function buyBoxTap(id){
  if (boxBusy) return;
  if (boxConfirm !== id){
    boxConfirm = id;
    clearTimeout(boxConfirmT);
    boxConfirmT = setTimeout(() => { boxConfirm = ''; if (current === 'pack' && storeTab === 'chips') renderChipsTab(); }, 2600);
    if (window.KARTI_SFX){ try { KARTI_SFX.play('ui.tap'); } catch (e){} }
    renderChipsTab();
    return;
  }
  boxConfirm = '';
  clearTimeout(boxConfirmT);
  let res = null;
  try { res = KARTI_XP.openBox(id); } catch (e){ res = null; }
  if (!res || !res.ok){
    toast(res && res.why === 'chips'
      ? '⚠ Not enough chips — you need ' + (res.short || '') + ' more. Play a few games, or spin tomorrow.'
      : '⚠ That box would not open. Try again.');
    renderChipsTab();
    return;
  }
  /* rolled, granted, SAVED — the reveal owes the player nothing */
  boxPop(res);
}

/* ── the reveal ──────────────────────────────────────────────────── */
/* the crate emptying itself: coins (or chips) tumbling down past the prize.
   Deliberately NOT particles() — that is a radial burst and belongs to the
   spin. Falling, tumbling and landing behind the card is what makes a box
   feel like a box. */
function boxSpill(host, n, col, kind){
  if (REDUCED || !host) return;
  const wrap = document.createElement('div');
  wrap.className = 'bx-spill';
  wrap.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < n; i++){
    const c = document.createElement('i');
    c.className = 'bxc' + (kind === 'chips' ? ' chip' : '');
    c.style.setProperty('--x', (Math.random() * 100).toFixed(1) + '%');
    c.style.setProperty('--sz', (11 + Math.random() * 13).toFixed(0) + 'px');
    c.style.setProperty('--dur', (0.85 + Math.random() * 0.75).toFixed(2) + 's');
    c.style.setProperty('--spin', (Math.random() * 720 - 360).toFixed(0) + 'deg');
    c.style.setProperty('--pc', col);
    c.style.animationDelay = (Math.random() * 0.42).toFixed(2) + 's';
    wrap.appendChild(c);
  }
  host.appendChild(wrap);
  setTimeout(() => { try { wrap.remove(); } catch (e){} }, 2600);
}

function boxPopKill(){
  if (boxPopEl){
    try { boxPopEl.remove(); } catch (e){}
    boxPopEl = null;
    boxBusy = false;
  }
}
function boxPop(res){
  chipsCSS();
  boxPopKill();
  boxBusy = true;
  const tier = res.prize.tier | 0;
  const col = boxTierColor(tier);
  const el = document.createElement('div');
  el.className = 'spop bpop t' + tier + (REDUCED ? ' rm in open' : ' chg');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', res.box.name + ' opened: ' + res.prize.label);
  el.style.setProperty('--fxc', col);
  const isPack = res.prize.kind === 'pack';
  const big = res.prize.kind === 'coins' || res.prize.kind === 'chips' ? res.prize.n : 0;
  el.innerHTML =
    '<div class="spop-scrim"></div>' +
    '<div class="spop-core">' +
      '<div class="spop-fx" aria-hidden="true">' +
        '<div class="spop-halo"></div>' +
        '<div class="spop-rays r1"></div>' +
        '<div class="spop-rays r2"></div>' +
        /* the shaft of light out of the open crate — the box's own tell, so
           its payoff cannot be mistaken for the daily spin's */
        '<div class="bx-beam"></div>' +
        /* the impact frame: a ring thrown off the lid, and a flash on every
           tier rather than only the jackpot — the moment the crate gives is
           the moment that has to land, whatever is inside it */
        '<div class="bx-shock"></div>' +
        '<div class="bx-shock s2"></div>' +
        '<div class="spop-flash bx-flash"></div>' +
      '</div>' +
      '<div class="bx-hero" id="bx-hero">' +
        /* pass the id or the hero falls back to the drawn crate while the
           shelf right behind it shows the painted one */
        boxArtHTML(res.box.accent, true, res.box.id) +
        '<b class="bx-heroname">' + esc(res.box.name) + '</b>' +
        '<p class="tiny">Tap to open</p>' +
      '</div>' +
      '<div class="spop-med" id="bx-med">' +
        '<p class="srlead">' + esc(res.box.name) + ' pays</p>' +
        (isPack
          ? '<div class="spop-ic">' + ico('pack') + '</div>'
          /* the painted pile, sized by what was actually won */
          : '<div class="spop-ic spop-pile">' + curArt(res.prize.kind, big) + '</div>') +
        '<div class="spop-what">' +
          (big ? '<span class="mono" id="bx-count">' + (REDUCED ? big : 0) + '</span> ' +
                 (res.prize.kind === 'chips' ? 'chips' : 'coins')
               : esc(res.prize.label)) + '</div>' +
        (isPack && res.prize.coins
          ? '<p class="tiny">' + coinIco() + ' +' + res.prize.coins + ' coins beside it</p>' : '') +
        (res.prize.kind === 'chips'
          ? '<p class="tiny">Chips back — the box refunds most of itself. Roll again?</p>' : '') +
        (tier >= 3 ? '<p class="srlvl">' + ico('trophy') + ' JACKPOT!</p>' : '') +
        '<p class="bx-balline tiny">Balance: ' + res.balance.chips + ' chips · ' +
          res.balance.coins + ' coins</p>' +
      '</div>' +
      '<button class="btn primary spop-take" id="bx-take">' + ilb('check', 'Collect') + '</button>' +
    '</div>';
  document.body.appendChild(el);
  boxPopEl = el;

  let opened = REDUCED;
  const open = () => {
    if (opened || boxPopEl !== el) return;
    opened = true;
    el.classList.remove('chg', 'sh1', 'sh2', 'sh3', 'hold');
    el.classList.add('in', 'open');
    /* the kick. A lid coming off should move the whole stage for a few
       frames — it is the difference between a thing appearing and a thing
       ARRIVING. Removed as soon as it has played so it cannot fight the
       card's own rise. */
    if (!REDUCED){
      el.classList.add('kick');
      setTimeout(() => { if (boxPopEl === el) el.classList.remove('kick'); }, 420);
    }
    if (window.KARTI_SFX){
      try {
        KARTI_SFX.play('ui.reward');
        /* the lid going is a THUD in the hand, and a jackpot is the one long
           buzz the app keeps for the end of a game */
        KARTI_SFX.haptic(tier >= 3 ? 'win' : tier >= 2 ? 'double' : 'thud');
        if (tier >= 2) setTimeout(() => { try { KARTI_SFX.play('xp.unlock'); } catch (e){} }, 200);
      } catch (e){}
    }
    /* the number counts up as the medallion lands */
    if (big && !REDUCED){
      const c = $('#bx-count', el);
      if (c) setTimeout(() => animateCount(c, big), 180);
    }
    /* THE RAYS BELONG BEHIND THE PRIZE. .spop-fx is pinned at a fixed
       top:100px, which is right for the spin — there the medallion is the
       top thing on the screen. In a box the CRATE is above the card, so the
       rays stayed up where the crate had been and fired into empty space
       above the prize. Once the lid has gone, drop the hero out of the
       layout and measure where the card actually landed. */
    setTimeout(() => {
      if (boxPopEl !== el) return;
      el.classList.add('blown');
      const core = $('.spop-core', el), m = $('#bx-med', el), fx = $('.spop-fx', el);
      if (core && m && fx){
        const cb = core.getBoundingClientRect(), mb = m.getBoundingClientRect();
        fx.style.top = Math.round(mb.top - cb.top + mb.height / 2) + 'px';
      }
    }, 340);

    /* WHAT CAME OUT OF THE BOX. particles() throws a radial burst, which is
       the spin's language; a crate should empty itself, so this rains its
       contents down the screen instead — more of it the better the prize. */
    const core = $('.spop-core', el);
    if (core) boxSpill(core, [12, 18, 26, 40][tier], col, res.prize.kind);
    const med = $('#bx-med', el);
    if (med) setTimeout(() => {
      if (boxPopEl === el) particles(med, [10, 14, 20, 30][tier], col, tier >= 2 ? 215 : 150);
    }, 200);
  };

  if (!REDUCED){
    /* ── THE SUSPENSE ──────────────────────────────────────────────────
       Three rising stages of tremble, then a HELD BEAT of dead stillness,
       then it blows. The stillness is the whole trick: a crate that rattles
       harder and harder and then stops for a fifth of a second reads as
       something about to happen, and the burst lands into a silence instead
       of on top of a rattle. It used to be a flat 1150ms of the same shake
       for every box.

       Bigger crates hold you longer, so It-Teżor already feels heavier than
       Il-Qoffa BEFORE you know what is in either — anticipation you can feel
       without being told. Tap still cuts straight through: an animation is
       never allowed to hold the player's chips hostage. */
    el.classList.add('in');           /* scrim + hero up */
    const HOLD = [820, 1000, 1250, 1600][tier] || 1000;
    [0, 0.34, 0.62].forEach((f, i) => setTimeout(() => {
      if (opened || boxPopEl !== el) return;
      el.classList.remove('sh1', 'sh2', 'sh3');
      el.classList.add('sh' + (i + 1));
    }, HOLD * f));
    /* the thumps bunch up as it fights the lid — same trick as the wheel's
       ratchet, run the other way round */
    const SX = window.KARTI_SFX;
    if (SX){
      let t = 0, gap = 200;
      for (let i = 0; i < 10 && t < HOLD - 110; i++){
        const at = t;
        setTimeout(() => {
          if (opened || boxPopEl !== el) return;
          try { SX.play('rail.tick', { force:true }); SX.haptic('tick'); } catch (e){}
        }, at);
        gap = Math.max(50, gap * 0.74);
        t += gap;
      }
    }
    /* everything stops */
    setTimeout(() => {
      if (opened || boxPopEl !== el) return;
      el.classList.remove('sh1', 'sh2', 'sh3');
      el.classList.add('hold');
    }, HOLD);
    setTimeout(open, HOLD + 220);
  }

  let taken = false;
  const take = () => {
    if (!opened){ open(); return; }
    if (taken || boxPopEl !== el) return;
    taken = true;
    if (window.KARTI_SFX){ try { KARTI_SFX.play('ui.coin'); } catch (e){} }
    const fin = () => {
      boxPopKill();
      if (current === 'pack' && storeTab === 'chips') renderChipsTab();
      updateCoinsPill();
    };
    if (REDUCED){ fin(); return; }
    el.classList.add('out');
    setTimeout(fin, 230);
  };
  const btn = $('#bx-take', el);
  if (btn){ btn.onclick = take; try { btn.focus({ preventScroll:true }); } catch (e){} }
  el.addEventListener('click', e => {
    if (!opened){ open(); return; }
    if (e.target === el || e.target.classList.contains('spop-scrim')) take();
  });
}

/* the chips shelf's own CSS — injected once, transform/opacity only,
   still and readable under reduced motion */
function chipsCSS(){
  if ($('#kchips-css')) return;
  const st = document.createElement('style');
  st.id = 'kchips-css';
  st.textContent =
    /* the balance hero */
    '.bxwrap{gap:12px}' +
    '.bxbal{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:12px;' +
      'border:1px solid color-mix(in srgb,var(--kx-accent-2,#E63950) 40%,var(--line));border-radius:16px;' +
      'padding:13px 15px;background:linear-gradient(135deg,rgba(230,57,80,.14),rgba(20,10,26,.5))}' +
    '@supports not (border-color:color-mix(in srgb,red 50%,blue)){.bxbal{border-color:rgba(230,57,80,.4)}}' +
    '.bxbal-ic .ico{width:34px;height:34px;color:#FF7585}' +
    '.bxbal-n{display:grid;line-height:1}' +
    '.bxbal-n b{font-size:26px;color:var(--txt)}' +
    '.bxbal-n i{font-style:normal;font-family:var(--disp);font-weight:900;font-size:9px;' +
      'letter-spacing:.22em;color:#FF7585}' +
    '.bxbal-how{text-align:right;color:var(--dim);line-height:1.45}' +
    '.bxintro{margin:0;color:var(--dim);line-height:1.5}' +
    '.bxintro b{color:var(--txt)}' +
    /* one box card */
    '.bxcard{display:grid;grid-template-columns:72px 1fr;grid-template-rows:auto auto;gap:6px 13px;' +
      'align-items:center;border:1px solid var(--line);border-radius:16px;padding:13px 14px;' +
      'background:var(--panel)}' +
    '.bxcard .bxart{grid-row:1/3}' +
    '.bxcard.poor .bxart{filter:saturate(.5) brightness(.75)}' +
    '.bxinfo{display:grid;gap:4px;min-width:0}' +
    '.bxname{font-family:var(--disp);font-weight:900;font-size:15.5px;color:var(--txt)}' +
    '.bxblurb{color:var(--dim);line-height:1.4}' +
    '.bxbuy{grid-column:2;justify-self:start;min-height:44px;display:inline-flex;flex-direction:column;' +
      'align-items:center;gap:1px;padding:7px 18px}' +
    '.bxbuy .bl .ico{width:14px;height:14px}' +
    '.bxbuy.can{border-color:var(--bxa,#FFC542);color:var(--txt);' +
      'background:color-mix(in srgb,var(--bxa,#FFC542) 16%,transparent)}' +
    '@supports not (background:color-mix(in srgb,red 50%,blue)){.bxbuy.can{background:rgba(255,197,66,.14)}}' +
    '.bxbuy.can:active{transform:scale(.96)}' +
    '.bxbuy[disabled]{opacity:.55;cursor:default}' +
    '.bxbuy small{font-size:9.5px;color:var(--dim);letter-spacing:.04em}' +
    /* the odds fold */
    '.bxodds summary{list-style:none;cursor:pointer;font-size:11px;color:var(--dim);' +
      'text-transform:uppercase;letter-spacing:.1em;font-weight:800;min-height:24px;display:flex;align-items:center}' +
    '.bxodds summary::-webkit-details-marker{display:none}' +
    '.bxodds summary::after{content:"▾";margin-left:6px;transition:transform .2s}' +
    '.bxodds[open] summary::after{transform:rotate(180deg)}' +
    '.bxodds .oddsbox{margin-top:6px}' +
    /* the drawn crate */
    '.bxart{position:relative;display:inline-block;width:72px;height:72px}' +
    /* ── the painted crate, and the ONE-SCREEN shelf ──────────────────── */
    '.bxart.painted .bx-body,.bxart.painted .bx-lid,.bxart.painted .bx-hasp{opacity:0}' +
    /* The crate art shipped on a PURE BLACK field, which showed as a visible
       square anywhere the surface behind it was not exactly that black — a
       lighter panel around the chest on the opening scrim. mix-blend-mode:
       screen fixed the black and replaced it with a PURPLE square, because it
       screened the art's own rim glow too. So the background was flood-filled
       to real transparency in the PNGs instead (from the edges inward, which
       leaves the dark detail inside the chest alone) and the CSS can just
       draw it. */
    '.bxart .bx-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;' +
      'filter:drop-shadow(0 6px 14px rgba(0,0,0,.6))}' +
    '.bxwrap2{width:100%;max-width:460px;margin:0 auto;display:grid;gap:12px;align-content:start}' +
    '.bxbal2{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 12px;' +
      'border:1px solid var(--line);border-radius:14px;background:var(--panel)}' +
    '.bxbal2 .bxbal-ic{display:inline-flex;width:20px}' +
    '.bxbal2 b{font-size:21px;color:var(--gold);font-weight:900}' +
    '.bxbal2 i{font-style:normal;font-size:9.5px;letter-spacing:.14em;color:var(--dim2);font-weight:800}' +
    '.bxbal2 .bxbal-sub{flex:1 0 100%;margin:0;color:var(--dim2);font-size:10.5px}' +
    /* three crates ACROSS, so all three are on the screen at once */
    '.bxrow{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}' +
    '.bxtile{position:relative;display:grid;justify-items:center;gap:5px;padding:11px 5px 9px;' +
      'border-radius:16px;border:1.5px solid color-mix(in srgb,var(--bxa) 45%,transparent);' +
      'background:linear-gradient(180deg,color-mix(in srgb,var(--bxa) 13%,#150F26),#120C1E 78%);' +
      'cursor:pointer;transition:transform .15s var(--ease),border-color .15s}' +
    '.bxtile:active{transform:scale(.96)}' +
    '.bxtile .bxart{width:100%;height:auto;aspect-ratio:1}' +
    '.bxtile .bxname{font-family:var(--disp);font-weight:900;font-size:11px;letter-spacing:.03em;' +
      'text-align:center;line-height:1.15;color:#F2ECFF}' +
    '.bxtile .bxprice{display:inline-flex;align-items:center;gap:4px;font-weight:900;font-size:12.5px;' +
      'color:var(--gold)}' +
    '.bxtile .bxprice .ico,.bxtile .bxprice svg{width:13px;height:13px}' +
    '.bxtile.arm{border-color:var(--gold);box-shadow:0 0 0 2px rgba(255,197,66,.35)}' +
    '.bxtile.arm .bxprice{color:#fff}' +
    '.bxtile.poor{opacity:.55}' +
    '.bxtile .bxneed{font-size:9px;color:var(--dim2)}' +
    '.bxoddsbtn{width:100%;min-height:44px;border-radius:13px;border:1px solid var(--line);' +
      'background:rgba(255,255,255,.04);color:var(--dim);font-size:12px;font-weight:700;' +
      'display:inline-flex;align-items:center;justify-content:center;gap:7px}' +
    '.bxoddsbtn .ico{width:15px;height:15px}' +
    '.bxo-grp{margin:0 0 14px;padding-left:10px;border-left:3px solid var(--bxa)}' +
    '.bxo-h{display:flex;align-items:center;gap:6px;font-family:var(--disp);font-size:13px;color:#F2ECFF}' +
    '.bxo-h .mono{color:var(--gold)}' +
    '.bxo-h svg,.bxo-h .ico{width:14px;height:14px}' +
    /* ── THE SUSPENSE: rattle, hold, burst ────────────────────────────── */
    /* The crate is the only thing that should exist while it is opening. The
       shared scrim is tuned for a small prize card; behind a full ceremony it
       left the whole shop legible and competing behind the box. */
    '.bpop .spop-scrim{background:rgba(3,1,8,.93);backdrop-filter:blur(7px);' +
      '-webkit-backdrop-filter:blur(7px)}' +
    '.bpop .bx-hero{position:relative;z-index:2}' +
    '.bpop .bxart.big{width:min(240px,62vw);height:auto;aspect-ratio:1}' +
    /* ── THE BOX'S OWN PAYOFF ──────────────────────────────────────────
       The shared prize card pops in place, which is the daily spin's move.
       A box should hand you what was inside it, so here the card RISES out
       of where the crate stood, up a shaft of light, through its own falling
       treasure. Same card, completely different event. */
    /* the crate is gone from the flow, so the card can centre and the rays
       can find it */
    /* ── THE IMPACT FRAME ──────────────────────────────────────────────
       A ring thrown off the lid, a flash, and a kick to the whole stage.
       Without these the crate simply stopped existing and a card faded up;
       with them something BREAKS OPEN. Tier scales the violence: the
       jackpot's ring is wider and its flash brighter. */
    '.bpop .bx-shock{position:absolute;left:50%;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;' +
      'border-radius:50%;opacity:0;border:3px solid var(--fxc,#FFC542);pointer-events:none}' +
    '.bpop.open .bx-shock{animation:bxShock .62s cubic-bezier(.15,.75,.3,1) both}' +
    '.bpop.open .bx-shock.s2{animation-delay:.11s;border-width:2px;opacity:0}' +
    '@keyframes bxShock{0%{opacity:.95;transform:scale(.4)}' +
      '70%{opacity:.35}100%{opacity:0;transform:scale(var(--shk,14))}}' +
    '.bpop.t2 .bx-shock{--shk:17}.bpop.t3 .bx-shock{--shk:21;border-width:4px}' +
    '.bpop .bx-flash{opacity:0}' +
    '.bpop.open .bx-flash{animation:bxFlash .4s ease-out both}' +
    '@keyframes bxFlash{0%{opacity:0}9%{opacity:.55}100%{opacity:0}}' +
    '.bpop.t2.open .bx-flash{animation-name:bxFlash2}' +
    '@keyframes bxFlash2{0%{opacity:0}8%{opacity:.75}100%{opacity:0}}' +
    '.bpop.t3.open .bx-flash{animation-name:bxFlash3}' +
    '@keyframes bxFlash3{0%{opacity:0}6%{opacity:.95}55%{opacity:.25}100%{opacity:0}}' +
    /* the kick */
    '.bpop.kick .spop-core{animation:bxKick .4s cubic-bezier(.36,.07,.19,.97) both}' +
    '@keyframes bxKick{0%{transform:translate3d(0,0,0)}' +
      '12%{transform:translate3d(-7px,4px,0)}26%{transform:translate3d(6px,-5px,0)}' +
      '42%{transform:translate3d(-5px,3px,0)}60%{transform:translate3d(3px,-2px,0)}' +
      '80%{transform:translate3d(-2px,1px,0)}100%{transform:translate3d(0,0,0)}}' +
    /* the card stops being a grey box: lit rim in the crate's own colour,
       an inner glow, and a sheen that crosses it once as it lands */
    '.bpop .spop-med{overflow:hidden;border-width:1.5px;' +
      'background:radial-gradient(120% 90% at 50% 0%,' +
        'color-mix(in srgb,var(--fxc) 20%,rgba(14,9,26,.96)),rgba(11,7,20,.97) 68%);' +
      'box-shadow:0 0 34px color-mix(in srgb,var(--fxc) 32%,transparent),' +
        '0 18px 44px rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.08)}' +
    '.bpop .spop-med:after{content:"";position:absolute;inset:0;pointer-events:none;' +
      'background:linear-gradient(105deg,transparent 34%,rgba(255,255,255,.16) 48%,transparent 62%);' +
      'transform:translateX(-120%)}' +
    '.bpop.open .spop-med:after{animation:bxSheen .85s ease-out .34s both}' +
    '@keyframes bxSheen{to{transform:translateX(120%)}}' +
    '.bpop .srlead{letter-spacing:.16em;font-size:10px;color:color-mix(in srgb,var(--fxc) 70%,#fff)}' +
    /* the jackpot says so properly */
    '.bpop.t3 .srlvl{display:inline-flex;align-items:center;gap:6px;padding:4px 14px;border-radius:99px;' +
      'background:linear-gradient(180deg,#FFE9A8,#E0A800);color:#2A1B00;font-weight:900;' +
      'letter-spacing:.14em;font-size:11px;box-shadow:0 4px 16px rgba(232,168,28,.5)}' +
    '.bpop.t3 .srlvl .ico{width:14px;height:14px;color:#2A1B00}' +
    'body.reduced .bpop .bx-shock,body.reduced .bpop .bx-flash{display:none}' +
    'body.reduced .bpop.kick .spop-core{animation:none}' +
    'body.reduced .bpop .spop-med:after{display:none}' +
    '.bpop.blown .bx-hero{display:none}' +
    '.bpop .spop-med,.bpop .spop-take{position:relative;z-index:2}' +
    '.bpop .spop-fx{transition:top .18s ease-out}' +
    /* the shaft hangs ABOVE the prize and lands on it — bottom:0 pins it to
       the fx point, which is now the middle of the card */
    '.bpop .bx-beam{position:absolute;left:50%;bottom:0;width:min(210px,55vw);height:56vh;' +
      'margin-left:min(-105px,-27.5vw);transform-origin:50% 100%;opacity:0;' +
      'background:linear-gradient(180deg,color-mix(in srgb,var(--fxc) 55%,transparent),transparent 72%);' +
      'filter:blur(9px);clip-path:polygon(38% 0,62% 0,100% 100%,0 100%)}' +
    '.bpop.open .bx-beam{animation:bxBeam 1.1s cubic-bezier(.2,.9,.3,1) both}' +
    '@keyframes bxBeam{0%{opacity:0;transform:scaleY(.15)}' +
      '35%{opacity:.8}100%{opacity:.4;transform:scaleY(1)}}' +
    /* the card comes UP, not out of nowhere */
    '.bpop.open .spop-med{animation:bxRise .52s cubic-bezier(.18,1.3,.32,1) .1s both}' +
    '@keyframes bxRise{0%{opacity:0;transform:translateY(46px) scale(.82)}' +
      '55%{opacity:1}100%{opacity:1;transform:translateY(0) scale(1)}}' +
    /* what fell out */
    '.bx-spill{position:absolute;inset:-10% 0 0;pointer-events:none;overflow:hidden;z-index:1}' +
    '.bx-spill .bxc{position:absolute;top:-8%;left:var(--x);width:var(--sz);height:var(--sz);' +
      'border-radius:50%;background:radial-gradient(circle at 34% 30%,#FFF3CF,#E8A81C 58%,#9A6B00);' +
      'box-shadow:0 0 9px color-mix(in srgb,var(--pc) 60%,transparent);' +
      'animation:bxFall var(--dur) cubic-bezier(.35,.05,.6,1) forwards}' +
    '.bx-spill .bxc.chip{background:radial-gradient(circle at 34% 30%,#FFD9E3,#E8446B 58%,#8A1030)}' +
    '@keyframes bxFall{0%{opacity:0;transform:translateY(0) rotate(0deg)}' +
      '12%{opacity:1}100%{opacity:0;transform:translateY(86vh) rotate(var(--spin))}}' +
    'body.reduced .bx-spill,body.reduced .bpop .bx-beam{display:none}' +
    '.bpop .bxart{will-change:transform}' +
    '.bpop.sh1 .bxart{animation:bxSh 250ms linear infinite}' +
    '.bpop.sh2 .bxart{animation:bxSh 140ms linear infinite}' +
    '.bpop.sh3 .bxart{animation:bxSh 74ms linear infinite}' +
    '@keyframes bxSh{0%,100%{transform:translate(0,0) rotate(0deg)}' +
      '25%{transform:translate(-2.5px,1px) rotate(-1.8deg)}' +
      '50%{transform:translate(2.5px,-1.5px) rotate(1.8deg)}' +
      '75%{transform:translate(-1.5px,-2px) rotate(-1.1deg)}}' +
    /* the seam light grows as it fights the lid */
    '.bpop.sh2 .bx-glow{opacity:.85}' +
    '.bpop.sh3 .bx-glow{opacity:1;filter:brightness(2)}' +
    '.bpop.sh3 .bx-img{filter:drop-shadow(0 0 16px var(--bxa)) drop-shadow(0 6px 14px rgba(0,0,0,.6))}' +
    /* THE HELD BEAT — everything stops and swells a hair. This is the moment */
    '.bpop.hold .bxart{animation:none;transform:scale(1.07);' +
      'transition:transform .19s cubic-bezier(.34,1.56,.64,1)}' +
    '.bpop.hold .bx-img{filter:drop-shadow(0 0 26px var(--bxa)) brightness(1.25)}' +
    /* and it goes */
    '.bpop.open .bxart{animation:bxBurst .44s cubic-bezier(.2,.9,.3,1) forwards}' +
    '@keyframes bxBurst{0%{transform:scale(1.07);opacity:1}' +
      '45%{transform:scale(1.34);opacity:.85}' +
      '100%{transform:scale(2.05);opacity:0}}' +
    'body.reduced .bpop .bxart{animation:none!important;transform:none!important}' +
    '.bxart.big{width:150px;height:150px}' +
    '.bxart b{position:absolute;display:block;border-radius:9px}' +
    '.bx-glow{left:8%;top:8%;width:84%;height:84%;border-radius:50%!important;' +
      'background:radial-gradient(circle,var(--bxa,#FFC542) 0%,transparent 65%);opacity:.35}' +
    '.bx-body{left:8%;top:34%;width:84%;height:56%;' +
      'background:linear-gradient(180deg,color-mix(in srgb,var(--bxa,#FFC542) 42%,#241626),#170E1E);' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.18),inset 0 -8px 14px -8px rgba(0,0,0,.7),' +
        'inset 0 0 0 1px color-mix(in srgb,var(--bxa,#FFC542) 45%,transparent)}' +
    '.bx-lid{left:4%;top:20%;width:92%;height:20%;' +
      'background:linear-gradient(180deg,color-mix(in srgb,var(--bxa,#FFC542) 62%,#2A1B2E),' +
        'color-mix(in srgb,var(--bxa,#FFC542) 30%,#1B1122));' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 2px 5px rgba(0,0,0,.5),' +
        'inset 0 0 0 1px color-mix(in srgb,var(--bxa,#FFC542) 55%,transparent)}' +
    '.bx-hasp{left:44%;top:30%;width:12%;height:16%;border-radius:3px;' +
      'background:linear-gradient(180deg,#FFE9B0,color-mix(in srgb,var(--bxa,#FFC542) 80%,#7A5A10));' +
      'box-shadow:0 1px 3px rgba(0,0,0,.6)}' +
    '@supports not (background:color-mix(in srgb,red 50%,blue)){' +
      '.bx-body{background:linear-gradient(180deg,#5A4230,#170E1E)}' +
      '.bx-lid{background:linear-gradient(180deg,#8A6A3A,#3A2A20)}}' +
    /* ── the reveal stages ── */
    '.bpop .bx-hero{position:relative;display:grid;justify-items:center;gap:10px;text-align:center}' +
    '.bx-heroname{font-family:var(--disp);font-weight:900;font-size:19px;color:var(--fxc,#FFC542)}' +
    '.bpop.chg .spop-med,.bpop.chg .spop-take{display:none}' +
    '.bpop.chg .spop-rays,.bpop.chg .spop-halo{opacity:0!important}' +
    /* display, not opacity: the flash is a one-shot keyframe that must
       not burn itself out invisibly during the charge */
    '.bpop.chg .spop-flash{display:none}' +
    /* the tremble: escalating, transform-only, and the seam glow breathes */
    '.bpop.chg .bxart.big{animation:bxShake 1.15s cubic-bezier(.36,.07,.19,.97) both}' +
    '.bpop.chg .bxart.big .bx-glow{animation:bxSeethe 1.15s ease-in both}' +
    '@keyframes bxShake{0%,8%{transform:none}10%{transform:translate3d(-1px,0,0) rotate(-1deg)}' +
      '20%{transform:translate3d(2px,0,0) rotate(1deg)}30%{transform:translate3d(-2px,1px,0) rotate(-2deg)}' +
      '40%{transform:translate3d(2px,-1px,0) rotate(2deg)}50%{transform:translate3d(-3px,1px,0) rotate(-2deg)}' +
      '60%{transform:translate3d(3px,-2px,0) rotate(3deg)}70%{transform:translate3d(-4px,2px,0) rotate(-3deg)}' +
      '80%{transform:translate3d(4px,-2px,0) rotate(3deg)}90%{transform:translate3d(-4px,2px,0) rotate(-4deg)}' +
      '100%{transform:translate3d(3px,-2px,0) rotate(4deg) scale(1.04)}}' +
    '@keyframes bxSeethe{0%{opacity:.35;transform:scale(1)}100%{opacity:.9;transform:scale(1.25)}}' +
    /* the burst: hero blows upward and out, prize rig takes the stage */
    '.bpop.open .bx-hero{animation:bxBlow .3s ease-in both;pointer-events:none}' +
    '@keyframes bxBlow{to{opacity:0;transform:translate3d(0,-26px,0) scale(1.18)}}' +
    '.bpop.open .bx-hero .bx-lid{animation:bxLid .3s ease-in both}' +
    '@keyframes bxLid{to{transform:translate3d(0,-40px,0) rotate(-16deg);opacity:0}}' +
    '.bpop .spop-ic .ico.big{width:54px;height:54px}' +
    /* THE PAINTED PILE. Bigger tiers get a bigger stage — a jackpot mound needs
       the room to read, a single coin does not. It lands with a small settle so
       it feels dropped in front of you rather than pasted on. */
    '.spop-pile{display:flex;align-items:center;justify-content:center;min-height:96px}' +
    '.spop-pile .curart{width:104px;height:104px;object-fit:contain;' +
      'filter:drop-shadow(0 8px 14px rgba(0,0,0,.55));animation:curDrop .5s cubic-bezier(.2,1.2,.35,1) both}' +
    '.spop-pile .curart[src*="-3"]{width:126px;height:126px}' +
    '.spop-pile .curart[src*="-4"]{width:150px;height:150px;' +
      'filter:drop-shadow(0 10px 18px rgba(0,0,0,.6)) drop-shadow(0 0 22px rgba(255,197,66,.45))}' +
    '@keyframes curDrop{from{opacity:0;transform:translate3d(0,-16px,0) scale(.72)}' +
      'to{opacity:1;transform:none}}' +
    '@media (prefers-reduced-motion:reduce){.spop-pile .curart{animation:none}}' +
    '.reduced .spop-pile .curart{animation:none}' +
    '.bx-balline{color:var(--dim);margin:2px 0 0}' +
    /* reduced motion: crate already open, prize already there, nothing moves */
    '.bpop.rm .bx-hero,body.reduced .bpop .bx-hero{display:none}' +
    '@media (prefers-reduced-motion:reduce){' +
      '.bpop .bx-hero{display:none}.bpop .spop-med,.bpop .spop-take{display:grid;opacity:1;transform:none}}';
  document.head.appendChild(st);
}

/* ── CUSTOMISE, the shelf ────────────────────────────────────────── */
let cosmConfirm = '';            /* two taps to spend real coins       */
let cosmConfirmT = 0;
function renderCosmTab(){
  const stage = $('#pack-stage');
  const bar = $('#pack-bar');
  if (!stage || !bar) return;
  const items = storeBuyables();
  const ladder = storeLadder();
  if (!items.length && !ladder.length){
    stage.innerHTML =
      '<div class="spinwrap"><div class="cosmempty">' +
        '<div class="srico">' + ico('rar-epiku') + '</div>' +
        '<h3>The shelves are being stocked</h3>' +
        '<p class="tiny">Boards, card backs, felts, ship colours, snake skins and more ' +
        'from every game land here to buy with coins. Your level rewards already live ' +
        'in the wardrobe.</p>' +
      '</div></div>';
  } else {
    /* one shelf per game, in the record book's own order, holding BOTH the
       buyables and the higher-level ones — so a shelf reads top to bottom
       as "what you can have now, and what playing on unlocks next". */
    const games = [];
    const byGame = {};
    const push = d => {
      if (!byGame[d.game]){ byGame[d.game] = { buy:[], lock:[] }; games.push(d.game); }
    };
    items.forEach(d => { push(d); byGame[d.game].buy.push(d); });
    ladder.forEach(d => { push(d); byGame[d.game].lock.push(d); });
    /* stable, pleasant order: record-book games first, the rest after */
    let shelf = [];
    try { shelf = ((window.KARTI_STATS && KARTI_STATS.GAMES) || []).map(g => g.id); } catch (e){}
    games.sort((a, b) => {
      const ia = shelf.indexOf(a), ib = shelf.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
    const lv = (() => { try { return window.KARTI_XP ? KARTI_XP.level() : 1; } catch (e){ return 1; } })();
    let allPrev = items.concat(ladder);
    /* ── THE HERO — the shop window into the Exclusives tab. It teases
       the animated pieces of the sets this player has NOT earned yet
       (the two nearest their milestone), carries the live earned tally,
       and one tap switches to the tab. All motion is transform/opacity
       and dies under reduced motion. */
    const mtL = PREFS.lang === 'mt';
    const xr = exclAllRows();
    const xGot = xr.filter(r => r.got).length;
    const tease = xr.filter(r => !r.got).slice(0, 2);
    const xPct = xr.length ? Math.round((xGot / xr.length) * 100) : 0;
    const hero = xr.length
      ? '<button class="xhero" id="xhero" type="button" ' +
          'aria-label="' + (mtL ? 'Iftaħ l-Esklussivi' : 'Open the Exclusives tab') +
          ' — ' + xGot + ' of ' + xr.length + ' sets unlocked">' +
          '<span class="xh-sheen" aria-hidden="true"></span>' +
          '<span class="xh-prev" aria-hidden="true">' +
            tease.map(r => '<span class="xh-slot" data-xid="' +
              esc((r.defs[0] || {}).id || '') + '" style="--xa:' + esc(r.meta.accent) + '"></span>').join('') +
          '</span>' +
          '<span class="xh-body">' +
            '<span class="xh-tag">' + ico('trophy') + (mtL ? 'ESKLUSSIVI' : 'EXCLUSIVES') + '</span>' +
            '<b class="xh-name">' + (mtL ? 'Il-kabinett tat-trofej' : 'The trophy cabinet') + '</b>' +
            '<span class="xh-sub">' + (tease.length
              ? (mtL ? 'Settijiet animati li l-ħanut qatt ma jżomm — bħal ' : 'Animated sets the shop never stocks — like ') +
                '<b>' + esc(tease[0].meta.name) + '</b>. ' +
                (mtL ? 'Irbaħha u faddal għaliha.' : 'Win it, then pay for it.')
              : (mtL ? 'Ġibthom kollha. Ilbeshom.' : 'You unlocked every set. Wear them.')) + '</span>' +
            '<span class="xh-prog"><span class="xh-bar"><i style="width:' + xPct + '%"></i></span>' +
              '<span class="xh-n">' + xGot + ' / ' + xr.length +
              (mtL ? ' miksuba' : ' unlocked') + '</span></span>' +
          '</span>' +
          '<span class="xh-go" aria-hidden="true">' + ico('arrow-right') + '</span>' +
        '</button>'
      : '';
    /* ── ONE GAME AT A TIME ────────────────────────────────────────────
       This shelf used to print all sixteen games' worth of cosmetics end to
       end: 22,562px of content in a 576px stage — a THIRTY-NINE screen
       scroll to reach the last game. The sections were labelled, which is
       not the same as being findable. Now the games are a row of tabs and
       you read one shelf, with your own owned/total on every tab so you can
       see where you have spent without opening anything. */
    if (games.indexOf(cosmGame) < 0) cosmGame = games[0] || '';
    const pick = '<div class="cosmpick" role="tablist" aria-label="Choose a game">' +
      games.map(g => {
        const grp = byGame[g];
        const tot = grp.buy.length + grp.lock.length;
        const own = grp.buy.filter(d => cosmOwned(d.id)).length;
        return '<button class="cpk' + (g === cosmGame ? ' on' : '') + '" role="tab"' +
          ' aria-selected="' + (g === cosmGame ? 'true' : 'false') + '"' +
          ' style="--cga:' + esc(cosmGameAccent(g)) + '"' +
          ' aria-label="' + esc(cosmGameName(g)) + ', ' + own + ' of ' + tot + ' owned"' +
          ' data-cg="' + esc(g) + '">' +
          '<span class="cpk-ic" aria-hidden="true">' + esc(cosmMonogram(g)) + '</span>' +
          '<b>' + esc(cosmGameName(g)) + '</b>' +
          '<i>' + own + '/' + tot + '</i></button>';
      }).join('') + '</div>';
    let html = '<div class="spinwrap cosmwrap">' + hero + pick;
    [cosmGame].filter(Boolean).forEach(g => {
      const grp = byGame[g];
      const nx = cosmNext(g);
      html += '<p class="cosmgame">' + esc(gameLabel(g)) +
        (nx ? '<span class="cosmnext">next: ' + esc(nx.name) + ' · lvl ' + nx.level + '</span>' : '') +
        '</p>';
      /* the exclusive showcases used to sit here, one per game — they all
         live on the Exclusives tab now (renderExclTab), behind the hero
         above, so this shelf holds only the ordinary, buyable things. */
      html += '<div class="cosmgrid">';
      grp.buy.forEach(d => {
        const owned = cosmOwned(d.id);
        const price = cosmPrice(d);
        html +=
          '<div class="citem" data-cid="' + esc(d.id) + '">' +
            '<div class="cprev"></div>' +
            '<div class="cname">' + esc(d.name) + '</div>' +
            (d.blurb ? '<div class="cblurb">' + esc(d.blurb) + '</div>' : '') +
            '<div class="cmeta tiny">or free at level ' + d.level + '</div>' +
            (owned
              ? '<div class="crow"><span class="ctag">' + ico('check') + ' Yours</span>' +
                '<button class="btn ghost sm cwear" data-id="' + esc(d.id) + '">Wear</button></div>'
              : '<button class="btn sm cbuy' + (S.coins >= price ? ' can' : '') +
                '" data-id="' + esc(d.id) + '" data-price="' + price + '">' +
                ilb('coin', (cosmConfirm === d.id ? 'Sure? ' : '') + price) + '</button>') +
          '</div>';
      });
      /* the higher-level ones: previewed, but locked behind the ladder —
         the "keep playing" carrot, and owned already if the player is
         high enough (levelled past it), in which case it offers Wear. */
      grp.lock.forEach(d => {
        const owned = cosmOwned(d.id);
        html +=
          '<div class="citem clock' + (owned ? '' : ' islk') + '" data-cid="' + esc(d.id) + '">' +
            '<div class="cprev"></div>' +
            '<div class="cname">' + esc(d.name) + '</div>' +
            (d.blurb ? '<div class="cblurb">' + esc(d.blurb) + '</div>' : '') +
            (owned
              ? '<div class="crow"><span class="ctag">' + ico('check') + ' Yours</span>' +
                '<button class="btn ghost sm cwear" data-id="' + esc(d.id) + '">Wear</button></div>'
              : '<div class="clocktag tiny">' + ico('star') + ' Level ' + d.level +
                (lv < d.level ? ' · ' + (d.level - lv) + ' to go' : '') + '</div>') +
          '</div>';
      });
      html += '</div>';
    });
    html += '<p class="spinnote">Higher-level basics unlock by levelling. The animated ' +
      'exclusive sets live on their own tab and are never for sale. Every border, ' +
      'badge and weekly-champion ring lives in the wardrobe, never the till.</p></div>';
    stage.innerHTML = html;
    /* the game tabs. Switching keeps you on the shelf and scrolls the strip
       so the one you picked is in view — nothing else on the screen moves. */
    $$('.cpk', stage).forEach(btn => {
      btn.onclick = () => {
        cosmGame = btn.dataset.cg;
        try { if (window.KARTI_SFX) KARTI_SFX.play('ui.tap'); } catch (e){}
        renderCosmTab();
        const on = $('.cpk.on', $('#pack-stage'));
        if (on && on.scrollIntoView) try { on.scrollIntoView({ inline:'center', block:'nearest' }); } catch (e){}
      };
    });
    /* previews after the HTML lands — def.preview returns an element */
    $$('.citem', stage).forEach(el => {
      const d = allPrev.find(x => x.id === el.dataset.cid);
      if (!d || !d.preview) return;
      try {
        const pv = d.preview(72);
        const host = $('.cprev', el);
        if (host && pv) (typeof pv === 'string') ? host.innerHTML = pv : host.appendChild(pv);
      } catch (e){}
    });
    /* the hero: mount the animated tease pieces, and one tap goes
       through the very same door the tab strip uses */
    $$('.xh-slot', stage).forEach(el => {
      let d = null;
      try { d = window.KARTI_XP && KARTI_XP.def ? KARTI_XP.def(el.dataset.xid) : null; } catch (e){}
      if (!d || !d.preview) return;
      try {
        const pv = d.preview(54);
        if (pv) (typeof pv === 'string') ? el.innerHTML = pv : el.appendChild(pv);
      } catch (e){}
    });
    { const hb = $('#xhero', stage); if (hb) hb.onclick = () => setStoreTab('excl'); }
    $$('.cbuy', stage).forEach(b => { b.onclick = () => cosmBuyTap(b.dataset.id); });
    $$('.cwear', stage).forEach(b => {
      b.onclick = () => {
        try {
          const r = KARTI_XP.equip('', b.dataset.id);
          toast(r && r.ok ? 'Equipped.' : '⚠ Could not equip it.');
        } catch (e){ toast('⚠ Could not equip it.'); }
      };
    });
  }
  bar.innerHTML =
    '<button class="btn ghost" id="cosm-ward" data-karti-xp>' +
      ilb('star', 'Open the wardrobe') + '</button>' +
    '<p class="spinnote">Equipping, level rewards and everything you own live there.</p>' +
    '<button class="btn ghost sm" id="cosm-home">Back to menu</button>';
  $('#cosm-home').onclick = () => go('home');
}
function cosmBuyTap(id){
  if (cosmConfirm !== id){
    /* first tap arms it; three seconds to mean it. Only the one button is
       touched — a full re-render here would throw away the scroll position
       of a long shelf under the player's thumb. */
    cosmConfirm = id;
    clearTimeout(cosmConfirmT);
    const btn = $('.cbuy[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (btn) btn.innerHTML = ilb('coin', 'Sure? ' + btn.dataset.price);
    cosmConfirmT = setTimeout(() => {
      cosmConfirm = '';
      const b2 = $('.cbuy[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
      if (b2) b2.innerHTML = ilb('coin', b2.dataset.price);
    }, 3000);
    return;
  }
  cosmConfirm = '';
  clearTimeout(cosmConfirmT);
  const r = buyCosmetic(id);
  if (r.ok){
    toast('“' + r.def.name + '” is yours — ' + r.price + ' coins.');
    updateCoinsPill();
  } else if (r.why === 'coins'){
    if (window.KARTI_SFX){ try { KARTI_SFX.play('shop.broke'); } catch (e){} }
    toast('⚠ Not enough coins — it costs ' + r.price + '.');
  } else if (r.why === 'owned'){ toast('You already own that.'); }
  else toast('⚠ That cannot be bought.');
  renderCosmTab();
}

/* ── EXCLUSIVES, the grind wall ───────────────────────────────────
   Every exclusive set, one gallery card each: the game it belongs to,
   the set's name and blurb, the animated piece previews, what it costs
   with its LIVE progress bar, and — once it is yours — "Wear the set".
   Driven entirely off exclAllRows() (KARTI_XP's own registry), so every
   registered set appears, including a second set for the same game.

   TWO KINDS OF GRIND, one wall. Most sets are WON at a wins milestone
   and can never be bought. The rest are BOUGHT with coins, and saving
   the coins is their grind — a real one, at 1 200–2 800 a set against a
   shop where nothing else costs more than 780. Neither kind is ever
   stocked in the store; this tab is the only door to both. */
let exclConfirm = '';            /* two taps to spend a fortnight of coins */
let exclConfirmT = 0;
function renderExclTab(){
  const stage = $('#pack-stage');
  const bar = $('#pack-bar');
  if (!stage || !bar) return;
  const mtL = PREFS.lang === 'mt';
  const rows = exclAllRows();
  const got = rows.filter(r => r.got).length;
  if (!rows.length){
    stage.innerHTML =
      '<div class="spinwrap"><div class="cosmempty">' +
        '<div class="srico">' + ico('trophy') + '</div>' +
        '<h3>' + (mtL ? 'L-Esklussivi ġejjin' : 'The exclusives are coming') + '</h3>' +
        '<p class="tiny">Animated sets earned by winning, never bought. ' +
        'They land here game by game.</p>' +
      '</div></div>';
  } else {
    let html = '<div class="spinwrap xgal">' +
      '<div class="spinhead"><h3>' + ico('trophy') +
        (mtL ? 'Esklussivi' : 'Exclusives') + '</h3>' +
        '<p class="tiny">' + (mtL
          ? 'Settijiet animati li ma jidhrux fil-ħanut. Trid tirbaħhom U tfaddal għalihom — it-tnejn. '
          : 'Animated sets the shop never stocks. You have to win them AND save up for them — both. ') +
        '<b>' + got + ' / ' + rows.length + (mtL ? ' miksuba' : ' unlocked') + '</b></p></div>';
    /* SAME TREATMENT AS CUSTOMISE. Every set stacked was 5,549px in a 576px
       stage — ten screens of scrolling past other games' trophies to find
       your own. Grouped by the game that actually PAYS for the set (r.stat,
       not r.g, so an encore set keyed by its own id still files under its
       game), with a tab per game and a tick on the ones you have finished. */
    const xg = [];
    rows.forEach(r => { if (xg.indexOf(r.stat) < 0) xg.push(r.stat); });
    if (xg.indexOf(exclGame) < 0) exclGame = xg[0] || '';
    if (xg.length > 1)
      html += '<div class="cosmpick" role="tablist" aria-label="Choose a game">' +
        xg.map(g => {
          const mine = rows.filter(r => r.stat === g);
          const done = mine.filter(r => r.got).length;
          return '<button class="cpk' + (g === exclGame ? ' on' : '') + '" role="tab"' +
            ' aria-selected="' + (g === exclGame ? 'true' : 'false') + '"' +
            ' style="--cga:' + esc(cosmGameAccent(g)) + '"' +
            ' aria-label="' + esc(gameLabel(g)) + ', ' + done + ' of ' + mine.length + ' unlocked"' +
            ' data-xg="' + esc(g) + '">' +
            '<span class="cpk-ic" aria-hidden="true">' + esc(cosmMonogram(g)) + '</span>' +
            '<b>' + esc(gameLabel(g)) + '</b>' +
            '<i>' + done + '/' + mine.length + '</i></button>';
        }).join('') + '</div>';
    rows.filter(r => !exclGame || r.stat === exclGame).forEach(r => {
      const pctW = Math.round(r.pg.pct * 100);
      html += '<div class="xset' + (r.got ? ' xgot' : '') + '" data-xgame="' + esc(r.g) + '" ' +
          'style="--xa:' + esc(r.meta.accent) + '">' +
        '<div class="xshow">' +
          r.defs.map(d => '<span class="xprev" data-xid="' + esc(d.id) + '"></span>').join('') +
        '</div>' +
        '<div class="xbody">' +
          '<div class="xtop"><span class="xtag">' +
            ico(r.got ? 'check' : (r.buy ? 'coin' : 'trophy')) +
            (r.got ? (mtL ? 'Miksub' : 'Unlocked')
                   : (mtL ? 'Esklussiv' : 'Exclusive')) + '</span>' +
            '<span class="xgame">' + esc(gameLabel(r.stat)) + '</span></div>' +
          '<b class="xname">' + esc(r.meta.name) + '</b>' +
          (r.meta.blurb ? '<div class="xblurb">' + esc(r.meta.blurb) + '</div>' : '') +
          '<div class="xslots tiny">' + esc(r.meta.slots.join(' · ')) + '</div>' +
          (r.got
            ? '<div class="xrow"><span class="xdone">' + ico('check') +
                (mtL ? ' Is-sett kollu tiegħek' : ' The whole set is yours') + '</span>' +
              '<button class="btn ghost sm xwear" data-xgame="' + esc(r.g) + '">' +
                (mtL ? 'Ilbes is-sett' : 'Wear the set') + '</button></div>'
            /* BOTH GATES, DRAWN AS TWO BARS. A set asks for the wins AND
               the coins, so the card has to say which half is still short
               — one merged bar would leave a player who has ground forty
               wins staring at a button that will not press and no reason
               why. The button only lives when both are met, and asks once
               first: a mis-tap must not spend a fortnight of saving. */
            : '<div class="xgrind">' +
                '<div class="xhow">' + ico('trophy') + '<span>' +
                  (mtL ? 'Irbaħ ' : 'Win ') + r.pg.need +
                  (mtL ? ' logħbiet' : ' games') + '</span>' +
                  (r.pg.winsMet ? '<i class="xok">' + ico('check') + '</i>' : '') + '</div>' +
                '<div class="xbar' + (r.pg.winsMet ? ' xdoneb' : '') + '">' +
                  '<span class="xfill" style="width:' + Math.round(r.pg.pct * 100) + '%"></span></div>' +
                '<div class="xnum tiny">' + Math.min(r.pg.won, r.pg.need) + ' / ' + r.pg.need +
                  (mtL ? ' rebħiet' : ' wins') + '</div>' +

                '<div class="xhow xhow2">' + coinIco() + '<span>' +
                  (mtL ? 'Faddal ' : 'Save ') + r.pg.coins +
                  (mtL ? ' muniti' : ' coins') + '</span>' +
                  (r.pg.coinsMet ? '<i class="xok">' + ico('check') + '</i>' : '') + '</div>' +
                '<div class="xbar' + (r.pg.coinsMet ? ' xdoneb' : '') + '">' +
                  '<span class="xfill" style="width:' + Math.round(r.pg.coinPct * 100) + '%"></span></div>' +

                '<div class="xrow">' +
                  '<span class="xnum tiny">' + Math.min(r.pg.have, r.pg.coins) +
                    ' / ' + r.pg.coins + (mtL ? ' muniti' : ' coins') + '</span>' +
                  '<button class="btn sm xbuy' + (r.pg.canBuy ? ' can' : '') +
                    '" data-xgame="' + esc(r.g) + '" data-price="' + r.pg.coins + '"' +
                    (r.pg.canBuy ? '' : ' disabled') +
                    ' aria-label="' + esc(r.meta.name) + ', ' + r.pg.coins + ' coins' +
                    (r.pg.winsMet ? '' : ', ' + (r.pg.need - r.pg.won) + ' more wins needed') +
                    (r.pg.coinsMet ? '' : ', ' + (r.pg.coins - r.pg.have) + ' more coins needed') + '">' +
                    '<span class="bl">' +
                      (r.pg.canBuy
                        ? coinIco() + '<span>' +
                            (exclConfirm === r.g ? (mtL ? 'Żgur? ' : 'Sure? ') : '') + r.pg.coins +
                          '</span>'
                        /* name the gate that is actually blocking, not both */
                        : !r.pg.winsMet
                          ? ico('trophy') + '<span>' + (r.pg.need - r.pg.won) +
                              (mtL ? ' rebħiet nieqsa' : ' wins to go') + '</span>'
                          : coinIco() + '<span>' + (r.pg.coins - r.pg.have) +
                              (mtL ? ' nieqsa' : ' to go') + '</span>') +
                    '</span>' +
                  '</button>' +
                '</div>' +
              '</div>') +
        '</div>' +
      '</div>';
    });
    html += '<p class="spinnote">' + (mtL
      ? 'Ir-rebħiet juru li lgħabt din il-logħba. Il-muniti jiswew. Trid it-tnejn.'
      : 'The wins prove you played this game. The coins cost you. You need both.') + '</p></div>';
    stage.innerHTML = html;
    $$('.cpk', stage).forEach(btn => {
      btn.onclick = () => {
        exclGame = btn.dataset.xg;
        try { if (window.KARTI_SFX) KARTI_SFX.play('ui.tap'); } catch (e){}
        renderExclTab();
        const on = $('.cpk.on', $('#pack-stage'));
        if (on && on.scrollIntoView) try { on.scrollIntoView({ inline:'center', block:'nearest' }); } catch (e){}
      };
    });
    /* mount each piece's animated preview, and wire "Wear the set" to
       equip every piece of an earned set — the same wiring the old
       cosmetics showcase carried */
    $$('.xprev', stage).forEach(el => {
      let d = null;
      try { d = window.KARTI_XP && KARTI_XP.def ? KARTI_XP.def(el.dataset.xid) : null; } catch (e){}
      if (!d || !d.preview) return;
      try {
        const pv = d.preview(64);
        if (pv) (typeof pv === 'string') ? el.innerHTML = pv : el.appendChild(pv);
      } catch (e){}
    });
    $$('.xwear', stage).forEach(b => {
      b.onclick = () => {
        const g = b.dataset.xgame;
        let n = 0;
        try {
          exclDefs(g).forEach(d => { const r = KARTI_XP.equip('', d.id); if (r && r.ok) n++; });
        } catch (e){}
        toast(n ? 'The set is on.' : '⚠ Could not equip the set.');
      };
    });
    /* ── buying a set. Two taps: the first arms it (and disarms any
       other armed card), the second spends. KARTI_XP.exclusiveBuySet
       owns the money and the all-or-nothing grant; this only draws. */
    $$('.xbuy', stage).forEach(b => {
      b.onclick = () => {
        const g = b.dataset.xgame;
        if (exclConfirm !== g){
          exclConfirm = g;
          renderExclTab();
          /* the arm lapses on its own so a card is never left saying
             "Sure?" from a tap the player has forgotten about */
          clearTimeout(exclConfirmT);
          exclConfirmT = setTimeout(() => {
            if (exclConfirm){ exclConfirm = ''; if ($('.xgal')) renderExclTab(); }
          }, 4000);
          return;
        }
        exclConfirm = '';
        clearTimeout(exclConfirmT);
        let r = null;
        try {
          r = (window.KARTI_XP && KARTI_XP.exclusiveBuySet)
                ? KARTI_XP.exclusiveBuySet(g) : null;
        } catch (e){ r = null; }
        if (r && r.ok){
          /* the coins live in the XP wallet; save() keeps the rest of the
             profile in the same write and refreshes the header pill */
          try { save(); } catch (e){}
          try { if (window.KARTI_SFX) KARTI_SFX.play('shop.buy'); } catch (e){}
          const nm = (exclMeta(g) || {}).name || 'The set';
          toast('“' + nm + '” is yours — ' + r.price + ' coins.');
        } else if (r && r.why === 'wins'){
          /* money is only half of it — say which half is missing, or the
             refusal reads as the shop being broken */
          toast('⚠ Win ' + ((r.need | 0) - (r.won | 0)) + ' more first — the coins are ready.');
        } else if (r && r.why === 'coins'){
          toast('⚠ Not enough coins — it costs ' + (r.price || 0) + '.');
        } else if (r && r.why === 'owned'){
          toast('You already own that set.');
        } else {
          toast('⚠ Could not buy that set.');
        }
        renderExclTab();
        try { updateCoinsPill(); } catch (e){}
      };
    });
  }
  bar.innerHTML =
    '<button class="btn ghost" id="excl-ward" data-karti-xp>' +
      ilb('star', 'Open the wardrobe') + '</button>' +
    '<p class="spinnote">Everything you have earned equips from there too.</p>' +
    '<button class="btn ghost sm" id="excl-home">Back to menu</button>';
  $('#excl-home').onclick = () => go('home');
}

/* ── the store's CSS, injected once ──────────────────────────────── */
function storeCSS(){
  if ($('#kstore-css')) return;
  const st = document.createElement('style');
  st.id = 'kstore-css';
  st.textContent =
    '.storetabs{display:flex;gap:7px;width:100%;max-width:460px;padding:0 0 8px;transition:opacity .3s}' +
    '.storetabs.hushed{opacity:.13;pointer-events:none}' +
    '.stab{position:relative;flex:1;min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:6px;' +
      'border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.04);color:var(--dim);' +
      'font-family:var(--disp);font-weight:800;font-size:11.5px;letter-spacing:.06em;cursor:pointer}' +
    '.stab .ico{width:15px;height:15px}' +
    '.stab.on{color:var(--txt);border-color:var(--gold);background:rgba(255,197,66,.10)}' +
    '.stab:active{transform:scale(.97)}' +
    '.sdot{position:absolute;top:5px;right:8px;width:8px;height:8px;border-radius:50%;' +
      'background:var(--gold);box-shadow:0 0 7px var(--gold)}' +
    '#btn-packs{position:relative}' +
    '#btn-packs .sdot{top:6px;right:22%}' +
    '.stage.smode{display:block;place-items:unset;perspective:none;overflow-y:auto;' +
      'scrollbar-width:none;padding:2px 2px 10px}' +
    '.stage.smode::-webkit-scrollbar{display:none}' +
    '.spinwrap{width:100%;max-width:460px;margin:0 auto;display:grid;gap:11px}' +
    '.spinhead h3{margin:0;display:flex;align-items:center;gap:7px;font-family:var(--disp);font-size:17px}' +
    '.spinhead .ico{width:18px;height:18px;color:var(--gold)}' +
    '.spinhead .tiny{margin:3px 0 0}' +
    /* the game tabs on Customise / Exclusives: a scrolling strip, current
       one lit, each carrying how many of that game's looks you already own */
    '.cosmpick{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;padding:2px 0 6px;' +
      'scrollbar-width:none;-webkit-overflow-scrolling:touch;scroll-snap-type:x proximity}' +
    '.cosmpick::-webkit-scrollbar{display:none}' +
    /* A BOX PER GAME, not a word. 78x72 is a comfortable thumb target — the
       text chips this replaced were 38px tall, which is under the 44px
       minimum and asked you to hit a word. */
    '.cpk{flex:0 0 auto;scroll-snap-align:center;width:78px;min-height:72px;padding:8px 5px 6px;' +
      'border-radius:14px;border:1.5px solid var(--line);background:rgba(255,255,255,.04);' +
      'display:grid;justify-items:center;align-content:center;gap:4px;cursor:pointer;' +
      'transition:background .15s,border-color .15s,transform .13s var(--ease)}' +
    '.cpk .cpk-ic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;' +
      'font-family:var(--disp);font-weight:900;font-size:12.5px;letter-spacing:.02em;' +
      'color:#150F26;background:linear-gradient(180deg,var(--cga),' +
        'color-mix(in srgb,var(--cga) 62%,#000));' +
      'box-shadow:0 2px 8px color-mix(in srgb,var(--cga) 40%,transparent)}' +
    '.cpk b{font-family:var(--disp);font-weight:800;font-size:9px;letter-spacing:.04em;' +
      'color:var(--dim);max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
      'text-align:center}' +
    '.cpk i{font-style:normal;font-size:9px;font-weight:700;color:var(--dim2);' +
      'font-variant-numeric:tabular-nums}' +
    '.cpk.on{background:color-mix(in srgb,var(--cga) 16%,transparent);' +
      'border-color:color-mix(in srgb,var(--cga) 75%,transparent)}' +
    '.cpk.on b{color:#F2ECFF}' +
    '.cpk.on i{color:var(--cga)}' +
    '.cpk:active{transform:scale(.94)}' +
    '.oddsbox{border:1px solid var(--line);border-radius:14px;background:var(--panel);padding:11px 13px;display:grid;gap:6px}' +
    '.oddshead{margin:0;font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.1em;font-weight:800}' +
    '.oddsrow{display:flex;align-items:center;gap:9px;font-size:13.5px;min-height:22px}' +
    '.oddsrow b{flex:0 0 42px;text-align:right;color:var(--gold)}' +
    '.oddsrow .oi{display:inline-flex;width:16px}.oddsrow .oi .ico{width:15px;height:15px}' +
    '.oddsrow small{color:var(--dim2)}' +
    '.oddsfoot{margin:3px 0 0;font-size:11px;color:var(--dim)}' +
    '.spinnote{margin:0;font-size:11px;color:var(--dim2);text-align:center}' +
    '.spinlast{margin:0;text-align:center;font-size:13px;color:var(--dim)}' +
    '.spinlast b{color:var(--gold)}' +
    /* ── THE WHEEL ───────────────────────────────────────────────────
       The stage does not scroll (#scr-pack is overflow:hidden), so the
       spin tab carries its own scroller: a 300px wheel plus a seven-row
       odds table does not fit a 640px-tall phone and must never be
       silently clipped. */
    '.spinwrap.swz{align-self:stretch;max-height:100%;overflow:auto;' +
      'overscroll-behavior:contain;align-content:start;padding:2px 0 6px}' +
    '.swwrap{position:relative;width:min(300px,78vw);aspect-ratio:1;margin:2px auto 4px;' +
      'flex:0 0 auto}' +
    '.swrim{position:absolute;inset:0;border-radius:50%;' +
      'background:conic-gradient(from 210deg,#8A6508,#F5D06A 14%,#FFF0BE 22%,#B8860B 40%,' +
        '#7A5606 55%,#F5D06A 74%,#FFE9A8 82%,#9A7208)' +
      ';box-shadow:0 12px 34px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,255,255,.28)}' +
    '.swdisc{position:absolute;inset:10px;border-radius:50%;will-change:transform;' +
      'box-shadow:inset 0 0 34px rgba(0,0,0,.6);overflow:hidden}' +
    /* the hairlines between wedges ride INSIDE the disc so they turn with it */
    '.swspokes{position:absolute;inset:0;border-radius:50%;pointer-events:none;' +
      'background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.26) 0 .55deg,' +
        'transparent .55deg ' + SPIN_SEG.toFixed(4) + 'deg)}' +
    /* a wedge label is a FULL-SIZE box rotated about the disc centre, with
       its text parked near the outer edge — so the winner, which always
       ends under the pointer, always ends upright and readable */
    '.swseg{position:absolute;inset:0;pointer-events:none}' +
    /* 32%, not more: at the radius the text sits on, a seventh of the disc
       is only about 32% of its width across. A wider box overflows into the
       neighbouring wedge — at 360px "Shop item" was landing on top of
       "Card pack". Two words wrap to two lines rather than collide. */
    '.swlab{position:absolute;left:50%;top:8%;width:32%;transform:translateX(-50%);' +
      'text-align:center;display:grid;gap:1px;justify-items:center;line-height:1.15;' +
      'overflow-wrap:break-word;hyphens:none}' +
    '.swlab .swi{display:block;height:18px}' +
    '.swlab .swi .ico{width:18px;height:18px;color:#FFE9A8;' +
      'filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))}' +
    '.swlab .swn{font-size:11.5px;font-weight:800;color:#fff;letter-spacing:.01em;' +
      'text-shadow:0 1px 3px rgba(0,0,0,.75)}' +
    '.swlab .swp{font-size:9px;font-weight:700;color:rgba(255,255,255,.66);' +
      'text-shadow:0 1px 2px rgba(0,0,0,.7)}' +
    /* the winning wedge lights up the instant the wheel stops, before the
       popup covers it — so the answer is on the WHEEL first */
    '.swlab.won{animation:swWon .5s ease-out}' +
    '.swlab.won .swn,.swlab.won .swp{color:#FFF3CF}' +
    '@keyframes swWon{0%{transform:translateX(-50%) scale(1);filter:none}' +
      '45%{transform:translateX(-50%) scale(1.22);filter:drop-shadow(0 0 12px var(--gold))}' +
      '100%{transform:translateX(-50%) scale(1.08);filter:drop-shadow(0 0 7px var(--gold))}}' +
    '.swhub{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;' +
      'border-radius:50%;z-index:3;background-repeat:no-repeat;' +
      'background-image:radial-gradient(circle at 38% 32%,#FFE9A8,#C9960C 58%,#7A5A06);' +
      'box-shadow:0 0 0 3px rgba(0,0,0,.42),0 5px 14px rgba(0,0,0,.55),' +
        'inset 0 0 0 1px rgba(255,255,255,.3)}' +
    '.swhub.art{background-color:#1a1206}' +
    /* The pointer is OUTSIDE the disc and never turns with it; it pivots at
       its own tip so each tick reads as a flapper being knocked aside.
       TWO triangles: a near-black backing and a gold face inset 3px on top.
       A plain gold triangle vanished against the gold rim — the dark collar
       is what makes it a pointer instead of a notch. */
    '.swptr{position:absolute;top:-10px;left:50%;width:32px;height:46px;margin-left:-16px;z-index:6;' +
      'transform-origin:50% 6px;background:#120C02;' +
      'clip-path:polygon(50% 100%,0 0,100% 0);' +
      'filter:drop-shadow(0 4px 7px rgba(0,0,0,.75))}' +
    '.swptr:before{content:"";position:absolute;left:3px;right:3px;top:3px;bottom:5px;' +
      'background:linear-gradient(180deg,#FFF7DF,#FFD24A 46%,#C98A00);' +
      'clip-path:polygon(50% 100%,0 0,100% 0)}' +
    '.swglow{position:absolute;inset:-10px;border-radius:50%;pointer-events:none;z-index:0;' +
      'box-shadow:0 0 0 0 rgba(255,197,66,0);transition:box-shadow .35s ease}' +
    '.swwrap.spinning .swglow{box-shadow:0 0 40px 8px rgba(255,197,66,.34)}' +
    /* at rest with a spin waiting, the rim breathes — the one thing on the
       screen that says "this is for you, today" */
    '.swwrap.ready .swglow{animation:swReady 2.6s ease-in-out infinite}' +
    '@keyframes swReady{0%,100%{box-shadow:0 0 16px 2px rgba(255,197,66,.16)}' +
      '50%{box-shadow:0 0 30px 6px rgba(255,197,66,.34)}}' +
    'body.reduced .swwrap.ready .swglow{animation:none;' +
      'box-shadow:0 0 20px 3px rgba(255,197,66,.22)}' +
    'body.reduced .swlab.won{animation:none}' +
    /* small phones: 360x640 has no room for a 300px wheel above a table */
    '@media (max-height:700px){.swwrap{width:min(232px,62vw)}' +
      '.swhub{width:52px;height:52px;margin:-26px 0 0 -26px}' +
      /* 24% is narrow enough to FORCE the two-word prizes onto two lines.
         On a 232px wheel a wedge is only ~54px across where the text sits,
         and "Card pack" on one line is wider than that — it was printing
         over "Shop item" next door. Wrapped, both sit ~30px wide. */
      '.swlab{width:24%}' +
      '.swlab .swn{font-size:10.5px}.swlab .swi,.swlab .swi .ico{height:16px;width:16px}}' +
    '.sres{padding-top:8vh}' +
    '.spinres{position:relative;border:1px solid var(--gold);border-radius:16px;background:var(--panel);' +
      'padding:22px 16px;display:grid;gap:8px;justify-items:center;text-align:center;' +
      'box-shadow:0 0 34px rgba(255,197,66,.14)}' +
    '.srlead{margin:0;font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.14em;font-weight:800}' +
    '.srico .ico{width:44px;height:44px;color:var(--gold)}' +
    '.srwhat{font-family:var(--disp);font-weight:900;font-size:24px;color:var(--gold)}' +
    '.srlvl{margin:0;font-family:var(--disp);font-weight:900;color:var(--ok);display:flex;gap:6px;align-items:center}' +
    '.srlvl .ico{width:16px;height:16px}' +
    '.sprev{min-height:64px;display:grid;place-items:center}' +
    '.cosmempty{border:1px dashed var(--line2);border-radius:16px;padding:26px 18px;text-align:center;display:grid;gap:8px;justify-items:center;margin-top:6vh}' +
    '.cosmempty h3{margin:0;font-family:var(--disp)}' +
    '.cosmwrap{gap:8px}' +
    '.cosmgame{margin:8px 0 2px;font-size:11px;font-weight:800;color:var(--dim);text-transform:uppercase;letter-spacing:.12em}' +
    '.cosmgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:9px}' +
    '.citem{border:1px solid var(--line);border-radius:14px;background:var(--panel);padding:10px;display:grid;gap:6px;align-content:start}' +
    '.cprev{min-height:64px;display:grid;place-items:center}' +
    '.cname{font-family:var(--disp);font-weight:800;font-size:12.5px}' +
    '.cblurb{font-size:11px;color:var(--dim);min-height:1em}' +
    '.cmeta{color:var(--dim2)}' +
    '.crow{display:flex;align-items:center;justify-content:space-between;gap:6px}' +
    '.ctag{display:inline-flex;align-items:center;gap:4px;color:var(--ok);font-weight:800;font-size:12px}' +
    '.ctag .ico{width:14px;height:14px}' +
    '.cbuy{border-color:var(--line2);opacity:.6}' +
    '.cbuy.can{opacity:1;border-color:var(--gold);color:var(--gold)}' +
    /* the lead-in line and the per-game "next unlock" carrot */
    '.cosmintro{margin:2px 0 6px;color:var(--dim)}' +
    '.cosmgame{display:flex;align-items:baseline;justify-content:space-between;gap:8px}' +
    '.cosmnext{font-size:10px;font-weight:700;color:var(--gold);text-transform:none;letter-spacing:.02em;opacity:.9}' +
    /* the higher-level ones: previewed but locked, so the shelf reads as
       "there is more if you keep playing" — dimmed, with a level tag */
    '.citem.clock.islk{opacity:.62}' +
    '.citem.clock.islk .cprev{filter:saturate(.7) brightness(.82)}' +
    '.clocktag{display:inline-flex;align-items:center;gap:4px;color:var(--gold);font-weight:800}' +
    '.clocktag .ico{width:13px;height:13px}' +

    /* ── the EXCLUSIVE showcase — one animated, earn-only set per game.
       A framed, glowing panel above each shelf: the animated pieces on
       the left, the prestige name + grind bar on the right. The glow and
       the accent are the set's own colour (--xa). Everything animated is
       inside the piece previews themselves (injected by progress.js), so
       this only frames them. */
    '.xset{position:relative;display:flex;gap:12px;align-items:center;margin:2px 0 10px;' +
      'padding:12px;border:1px solid color-mix(in srgb,var(--xa,#FFC542) 45%,var(--line));' +
      'border-radius:16px;background:' +
        'radial-gradient(140% 120% at 12% 0%,color-mix(in srgb,var(--xa,#FFC542) 14%,transparent),transparent 60%),' +
        'var(--panel);' +
      'box-shadow:0 0 22px color-mix(in srgb,var(--xa,#FFC542) 16%,transparent),inset 0 1px 0 rgba(255,255,255,.06)}' +
    '@supports not (background:color-mix(in srgb,red 50%,blue)){' +
      '.xset{border-color:rgba(255,197,66,.45);background:var(--panel);box-shadow:0 0 22px rgba(255,197,66,.16)}}' +
    '.xshow{display:flex;gap:6px;flex:0 0 auto;flex-wrap:wrap;max-width:150px}' +
    '.xprev{display:inline-grid;place-items:center;width:64px;height:64px}' +
    '.xprev>*{border-radius:22%}' +
    '.xbody{flex:1;min-width:0;display:grid;gap:5px}' +
    '.xtop{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
    '.xtag{display:inline-flex;align-items:center;gap:4px;font-family:var(--disp);font-weight:900;' +
      'font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;padding:3px 7px;border-radius:999px;' +
      'color:var(--xa,#FFC542);border:1px solid color-mix(in srgb,var(--xa,#FFC542) 55%,transparent);' +
      'background:color-mix(in srgb,var(--xa,#FFC542) 12%,transparent)}' +
    '@supports not (background:color-mix(in srgb,red 50%,blue)){' +
      '.xtag{color:var(--gold);border-color:rgba(255,197,66,.55);background:rgba(255,197,66,.12)}}' +
    '.xtag .ico{width:11px;height:11px}' +
    '.xname{font-family:var(--disp);font-weight:900;font-size:15px;color:var(--txt)}' +
    '.xblurb{font-size:11.5px;color:var(--dim);line-height:1.35}' +
    '.xslots{color:var(--dim2);text-transform:capitalize;letter-spacing:.04em}' +
    /* the grind bar */
    '.xgrind{display:grid;gap:5px;margin-top:2px}' +
    '.xhow{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;color:var(--gold)}' +
    /* the second gate sits under the first, so it needs air above it or
       the two bars read as one control with a stray caption */
    '.xhow2{margin-top:9px}' +
    /* a met gate says so with a tick and a filled-through bar — a player
       with the wins but not the coins must be able to see at a glance
       which half they already did */
    '.xok{display:inline-flex;color:#3DDC84;font-style:normal;margin-left:2px}' +
    '.xbar.xdoneb{box-shadow:inset 0 0 0 1px rgba(61,220,132,.45)}' +
    '.xbar.xdoneb .xfill{background:linear-gradient(90deg,#8CF5BE,#3DDC84)}' +
    '.xhow .ico{width:13px;height:13px}' +
    '.xbar{position:relative;height:8px;border-radius:999px;overflow:hidden;' +
      'background:rgba(255,255,255,.07);border:1px solid var(--line)}' +
    '.xfill{position:absolute;inset:0;right:auto;border-radius:999px;' +
      'background:linear-gradient(90deg,color-mix(in srgb,var(--xa,#FFC542) 60%,#fff),var(--xa,#FFC542));' +
      'box-shadow:0 0 10px color-mix(in srgb,var(--xa,#FFC542) 60%,transparent);transition:width .5s var(--ease)}' +
    '@supports not (background:color-mix(in srgb,red 50%,blue)){' +
      '.xfill{background:linear-gradient(90deg,#FFE9B0,var(--gold));box-shadow:0 0 10px rgba(255,197,66,.6)}}' +
    '.xnum{color:var(--dim);text-align:right}' +
    '.xrow{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px}' +
    '.xdone{display:inline-flex;align-items:center;gap:5px;color:var(--ok);font-weight:800;font-size:12px}' +
    '.xdone .ico{width:14px;height:14px}' +
    '.xset.xgot{border-color:color-mix(in srgb,var(--ok,#3DDC84) 50%,var(--line))}' +

    /* ── FIVE tabs now: icon stacked over the label so Packs → Exclusives
       all fit a 360px phone without the labels colliding */
    '.storetabs.s5{gap:5px}' +
    '.storetabs.s5 .stab{flex-direction:column;gap:3px;padding:6px 1px 5px;min-height:50px;' +
      'font-size:8.5px;letter-spacing:.04em}' +
    '.storetabs.s5 .stab .ico{width:16px;height:16px}' +
    '.storetabs.s5 .stab span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +

    /* ── the EXCLUSIVES gallery (its own tab) */
    '.xgal{gap:10px}' +
    '.xgal .xset{margin:0}' +
    '.xgame{display:inline-flex;align-items:center;font-size:9.5px;font-weight:800;color:var(--dim);' +
      'letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:999px;' +
      'border:1px solid var(--line);background:color-mix(in srgb,var(--txt) 6%,transparent)}' +
    '@supports not (background:color-mix(in srgb,red 50%,blue)){.xgame{background:rgba(255,255,255,.06)}}' +

    /* ── the HERO — the Customise tab\'s door into the Exclusives tab.
       A jewel-lit banner: the tease pieces animate themselves (kx-excl
       sheen), a slow shine sweeps the panel, everything transform/opacity
       and stone-still under reduced motion. */
    '.xhero{position:relative;overflow:hidden;display:flex;align-items:center;gap:12px;width:100%;' +
      'margin:2px 0 2px;padding:13px 12px;border-radius:18px;cursor:pointer;text-align:left;' +
      'color:var(--txt);border:1px solid color-mix(in srgb,var(--gold) 55%,var(--line));' +
      'background:radial-gradient(130% 150% at 100% 0%,color-mix(in srgb,var(--hot) 14%,transparent),transparent 55%),' +
        'radial-gradient(150% 130% at 0% 100%,color-mix(in srgb,var(--gold) 16%,transparent),transparent 60%),' +
        'var(--panel);' +
      'box-shadow:0 0 26px color-mix(in srgb,var(--gold) 18%,transparent),inset 0 1px 0 rgba(255,255,255,.08)}' +
    '@supports not (background:color-mix(in srgb,red 50%,blue)){' +
      '.xhero{border-color:rgba(255,197,66,.55);background:var(--panel);box-shadow:0 0 26px rgba(255,197,66,.18)}}' +
    '.xhero:active{transform:scale(.985)}' +
    '.xh-sheen{position:absolute;top:-70%;bottom:-70%;left:-45%;width:34%;pointer-events:none;' +
      'transform:rotate(16deg);mix-blend-mode:screen;' +
      'background:linear-gradient(90deg,transparent,rgba(255,255,255,.06) 30%,' +
        'rgba(255,255,255,.32) 50%,rgba(255,255,255,.06) 70%,transparent);' +
      'animation:xhSheen 4.6s ease-in-out infinite}' +
    '@keyframes xhSheen{0%{left:-45%;opacity:0}12%{opacity:1}55%{left:108%;opacity:1}' +
      '62%,100%{left:108%;opacity:0}}' +
    '.xh-prev{display:flex;flex:0 0 auto;align-items:center;' +
      'animation:xhBob 3.8s ease-in-out infinite}' +
    '@keyframes xhBob{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-3px,0)}}' +
    '.xh-slot{display:inline-grid}' +
    '.xh-slot .kx-excl{display:block}' +
    '.xh-slot:first-child{transform:rotate(-7deg)}' +
    '.xh-slot+.xh-slot{margin-left:-16px;transform:rotate(8deg) translateY(4px)}' +
    '.xh-body{display:grid;gap:3px;flex:1;min-width:0}' +
    '.xh-tag{display:inline-flex;align-items:center;gap:5px;font-family:var(--disp);font-weight:900;' +
      'font-size:9px;letter-spacing:.18em;color:color-mix(in srgb,var(--gold) 82%,#fff)}' +
    '@supports not (color:color-mix(in srgb,red 50%,blue)){.xh-tag{color:var(--gold)}}' +
    '.xh-tag .ico{width:11px;height:11px}' +
    '.xh-name{font-family:var(--disp);font-weight:900;font-size:17px;line-height:1.15}' +
    '.xh-sub{font-size:11px;color:var(--dim);line-height:1.4}' +
    '.xh-sub b{color:var(--txt)}' +
    '.xh-prog{display:flex;align-items:center;gap:8px;margin-top:3px}' +
    '.xh-bar{flex:1;height:6px;border-radius:999px;overflow:hidden;' +
      'background:color-mix(in srgb,var(--txt) 10%,transparent);border:1px solid var(--line)}' +
    '@supports not (background:color-mix(in srgb,red 50%,blue)){.xh-bar{background:rgba(255,255,255,.08)}}' +
    '.xh-bar i{display:block;height:100%;border-radius:999px;' +
      'background:linear-gradient(90deg,color-mix(in srgb,var(--gold) 55%,#fff),var(--gold))}' +
    '@supports not (background:color-mix(in srgb,red 50%,blue)){.xh-bar i{background:var(--gold)}}' +
    '.xh-n{font-size:10px;font-weight:800;color:var(--dim);white-space:nowrap}' +
    '.xh-go{flex:0 0 auto;display:grid;place-items:center;width:30px;height:30px;border-radius:50%;' +
      'color:color-mix(in srgb,var(--gold) 82%,#fff);' +
      'border:1px solid color-mix(in srgb,var(--gold) 60%,transparent);' +
      'background:color-mix(in srgb,var(--gold) 12%,transparent)}' +
    '@supports not (color:color-mix(in srgb,red 50%,blue)){' +
      '.xh-go{color:var(--gold);border-color:rgba(255,197,66,.6);background:rgba(255,197,66,.12)}}' +
    '.xh-go .ico{width:15px;height:15px}' +
    '@media (prefers-reduced-motion:reduce){' +
      '.xh-sheen{animation:none;opacity:0}.xh-prev{animation:none}}' +
    '.reduced .xh-sheen{animation:none;opacity:0}' +
    '.reduced .xh-prev{animation:none}' +

    /* ── LIGHT THEME (kx-light, e.g. Roża Ħelwa): accents that read as
       glow on the dark floor read as pastel-on-cream here, so every
       accent-coloured TEXT is re-mixed towards the theme\'s dark ink.
       Bars and borders stay accent — they are not text. */
    'html.kx-light .xtag{color:color-mix(in srgb,var(--xa,#C2255C) 42%,var(--txt));' +
      'border-color:color-mix(in srgb,var(--xa,#C2255C) 45%,var(--txt) 15%)}' +
    'html.kx-light .xhow{color:color-mix(in srgb,var(--xa,#C2255C) 38%,var(--txt))}' +
    'html.kx-light .xdone{color:color-mix(in srgb,var(--ok,#3DDC84) 40%,var(--txt))}' +
    'html.kx-light .xh-tag{color:color-mix(in srgb,var(--gold) 38%,var(--txt))}' +
    'html.kx-light .xh-go{color:color-mix(in srgb,var(--gold) 40%,var(--txt))}' +
    'html.kx-light .xhero{box-shadow:0 4px 20px color-mix(in srgb,var(--gold) 30%,transparent)}' +
    'html.kx-light .xh-sheen{mix-blend-mode:normal;opacity:.5}' +
    'html.kx-light .xh-bar{background:color-mix(in srgb,var(--txt) 14%,transparent)}' +
    'html.kx-light .xgame{color:var(--dim)}' +

    /* ── the daily-spin prize popup ─────────────────────────────────
       Every animated property below is transform or opacity — the ray
       layers are rasterised once and then only rotated, which is what
       makes a full-screen sunburst cost nothing on an iPhone. Tier
       (t0..t3, from SPIN_TABLE scarcity) drives size, speed and
       brightness through two custom properties and the .in opacities. */
    '.spop{position:fixed;inset:0;z-index:260;display:flex;align-items:center;justify-content:center;padding:20px}' +
    '.spop-scrim{position:absolute;inset:0;background:rgba(4,2,10,.85);opacity:0;transition:opacity .3s}' +
    '.spop.in .spop-scrim{opacity:1}' +
    '.spop.out .spop-scrim{opacity:0;transition:opacity .2s}' +
    '.spop-core{position:relative;display:grid;justify-items:center;gap:18px;width:100%;max-width:340px}' +
    '.spop.out .spop-core{animation:spopOut .2s var(--ease) both}' +
    '@keyframes spopOut{to{opacity:0;transform:scale(.86)}}' +
    /* the sunburst, anchored behind the medallion's heart */
    '.spop.t0{--fxs:.82;--rspd:16s}.spop.t1{--fxs:.95;--rspd:13s}' +
    '.spop.t2{--fxs:1.08;--rspd:10s}.spop.t3{--fxs:1.22;--rspd:8s}' +
    '.spop-fx{position:absolute;left:50%;top:100px;width:0;height:0;pointer-events:none;' +
      'transform:scale(var(--fxs,1))}' +
    '.spop-rays{position:absolute;left:-175px;top:-175px;width:350px;height:350px;border-radius:50%;' +
      'opacity:0;transition:opacity .55s;will-change:transform;' +
      'background:repeating-conic-gradient(from 0deg,var(--fxc,#FFC542) 0 7deg,transparent 7deg 30deg);' +
      '-webkit-mask:radial-gradient(circle,#000 0 26%,transparent 66%);' +
      'mask:radial-gradient(circle,#000 0 26%,transparent 66%);' +
      'animation:spopSpin var(--rspd,14s) linear infinite}' +
    '.spop-rays.r2{background:repeating-conic-gradient(from 10deg,var(--fxc,#FFC542) 0 3deg,transparent 3deg 21deg);' +
      'animation-direction:reverse;animation-duration:calc(var(--rspd,14s)*1.6)}' +
    '@keyframes spopSpin{to{transform:rotate(360deg)}}' +
    '.spop-halo{position:absolute;left:-150px;top:-150px;width:300px;height:300px;border-radius:50%;' +
      'opacity:0;transition:opacity .5s;' +
      'background:radial-gradient(circle,var(--fxc,#FFC542) 0%,transparent 62%);' +
      'animation:spopBreathe 2.6s ease-in-out infinite}' +
    '@keyframes spopBreathe{0%,100%{transform:scale(.94)}50%{transform:scale(1.06)}}' +
    /* how bright each tier burns: 30 coins a warm glow, the 1% pack
       the room lighting up */
    '.spop.in .spop-halo{opacity:.2}' +
    '.spop.in .r1{opacity:.32}' +
    '.spop.t1.in .r1{opacity:.44}.spop.t1.in .r2{opacity:.24}' +
    '.spop.t2.in .r1{opacity:.56}.spop.t2.in .r2{opacity:.32}.spop.t2.in .spop-halo{opacity:.3}' +
    '.spop.t3.in .r1{opacity:.7}.spop.t3.in .r2{opacity:.44}.spop.t3.in .spop-halo{opacity:.4}' +
    '.spop-flash{position:absolute;left:-50vw;top:-50vh;width:100vw;height:100vh;opacity:0;' +
      'background:radial-gradient(circle at 50% 50%,#fff 0%,var(--fxc,#FFC542) 30%,transparent 70%)}' +
    '.spop.in .spop-flash{animation:spopFlash .6s ease-out .05s both}' +
    '@keyframes spopFlash{0%{opacity:0}12%{opacity:.85}100%{opacity:0}}' +
    /* the medallion and the confirm */
    '.spop-med{position:relative;display:grid;gap:8px;justify-items:center;text-align:center;' +
      'border:1px solid var(--fxc,#FFC542);border-radius:18px;background:rgba(14,9,26,.93);' +
      'padding:24px 26px;min-width:230px;max-width:100%;box-shadow:0 0 44px rgba(0,0,0,.55);' +
      'opacity:0;transform:scale(.6)}' +
    '.spop.in .spop-med{animation:spopPop .46s cubic-bezier(.2,1.45,.35,1) .05s both}' +
    '@keyframes spopPop{0%{opacity:0;transform:scale(.55)}60%{opacity:1}100%{opacity:1;transform:scale(1)}}' +
    '.spop-ic .ico{width:54px;height:54px;color:var(--fxc,#FFC542)}' +
    '.spop-what{font-family:var(--disp);font-weight:900;font-size:26px;color:var(--fxc,#FFC542)}' +
    '.spop-take{min-width:200px;opacity:0;transform:translate3d(0,14px,0)}' +
    '.spop.in .spop-take{animation:spopRise .4s var(--ease) .32s both}' +
    '@keyframes spopRise{to{opacity:1;transform:none}}' +
    /* reduced motion — the app's .rm flag and the OS class both land
       here: prize and Collect at once, nothing turning, still lit */
    '.spop.rm *,body.reduced .spop *{animation:none!important;transition:none!important}' +
    '.spop.rm .spop-med,body.reduced .spop .spop-med,' +
    '.spop.rm .spop-take,body.reduced .spop .spop-take{opacity:1;transform:none}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   COLLECTION  — primary filter = category, then attribute, then rarity
   ═══════════════════════════════════════════════════════════════════ */
const collF = { cat:'all', attr:'all', rar:'all', q:'' };

function matches(c, f){
  if (f.cat !== 'all' && c.t !== f.cat) return false;
  if (f.attr !== 'all'){ if (c.t !== 'monster' || c.f !== f.attr) return false; }
  if (f.rar !== 'all' && c.r !== f.rar) return false;
  if (f.q){
    const q = f.q.toLowerCase();
    if ((c.n + ' ' + c.txt + ' ' + effText(c)).toLowerCase().indexOf(q) < 0) return false;
  }
  return true;
}
function chipRow(host, groups, onPick){
  host.innerHTML = '';
  groups.forEach(g => {
    const b = document.createElement('button');
    b.className = 'chip' + (g.on ? ' on' : '');
    b.setAttribute('aria-pressed', String(!!g.on));
    b.innerHTML = g.label;
    b.onclick = () => onPick(g);
    host.appendChild(b);
  });
}
function renderCollection(){
  const total = CARDS.length;
  $('#coll-count').innerHTML = '<span class="mono">' + uniqueOwned() + '/' + total + '</span>';
  const counts = { monster:0, spell:0, trap:0 };
  CARDS.forEach(c => { if (counts[c.t] != null) counts[c.t]++; });

  const rows = document.createElement('div');
  const catRow = document.createElement('div'); catRow.className = 'chiprow';
  const subRow = document.createElement('div'); subRow.className = 'chiprow';
  rows.appendChild(catRow); rows.appendChild(subRow);
  $('#coll-filters').replaceWith(rows);
  rows.id = 'coll-filters';

  chipRow(catRow, [{ k:'all', label:'All <b>' + total + '</b>', on: collF.cat === 'all' }].concat(
    CATS.map(c => ({ k:c.k, label: ico(c.i) + ' ' + c.n + ' <b>' + (counts[c.k] || 0) + '</b>',
                     on: collF.cat === c.k }))),
    g => { collF.cat = g.k; if (g.k !== 'monster') collF.attr = 'all'; renderCollection(); });

  const subs = [];
  if (collF.cat === 'monster' || collF.cat === 'all'){
    subs.push({ kind:'attr', k:'all', label:'Any attribute', on: collF.attr === 'all' });
    Object.keys(ATTR).forEach(a => subs.push(
      { kind:'attr', k:a, label: ico(ATTR_ICON[a]) + ' ' + ATTR[a].n, on: collF.attr === a }));
  }
  subs.push({ kind:'rar', k:'all', label:'Any rarity', on: collF.rar === 'all' });
  Object.keys(RARITY).forEach(r => subs.push(
    { kind:'rar', k:r, label:'<span style="color:' + RARITY[r].c + '">' + ico(RARITY_ICON[r]) +
      '</span>' + RARITY[r].n, on: collF.rar === r }));
  chipRow(subRow, subs, g => { collF[g.kind] = g.k; renderCollection(); });

  const search = $('#coll-search');
  if (search.value !== collF.q) search.value = collF.q;
  search.oninput = () => { collF.q = search.value.trim(); paintCollGrid(); };
  paintCollGrid();
}
function paintCollGrid(){
  const g = $('#coll-grid');
  g.innerHTML = '';
  const list = CARDS.filter(c => matches(c, collF));
  if (!list.length){
    g.innerHTML = '<p class="muted" style="grid-column:1/-1;text-align:center;padding:30px 0">' +
      'Nothing matches. Even the Nosy Neighbour found nothing.</p>';
    return;
  }
  list.forEach(c => {
    const n = ownedCount(c.id);
    const cell = document.createElement('div');
    cell.className = 'gcell';
    const el = cardEl(c, { size:'sm', tap:true, dim: n === 0 });
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', c.n + (n ? ', owned ' + n : ', not owned'));
    el.onclick = () => cardViewModal(c);
    cell.appendChild(el);
    if (n){
      const b = document.createElement('span');
      b.className = 'cnt'; b.textContent = '×' + n;
      cell.appendChild(b);
    }
    g.appendChild(cell);
  });
}

/* ═══════════════════════════════════════════════════════════════════
   INVENTORY  +  DECK BUILDER

   The Inventory tab used to drop you straight into the card-by-card builder,
   which is the LAST screen you want when all you asked for is "my stuff".
   #scr-deck now carries two views:

     deckView = 'list'   the Inventory landing — what you own, every deck you
                         have, and the things you can DO with each of them.
     deckView = 'build'  the original pool/deck builder, reached by choosing
                         EDIT on a deck. Backing out of it returns here.

   The landing is built at RUNTIME into #scr-deck, and its CSS is injected once
   from this file (see invCSS), because index.html and css/ belong to another
   part of the build. Nothing here adds transform/filter/backdrop-filter to an
   ancestor of .tabbar — the landing lives inside #scr-deck, which is not one.
   ═══════════════════════════════════════════════════════════════════ */
const dbF = { cat:'all', attr:'all', rar:'all', q:'' };
let dbDeck = null;          // working copy {id,name,starter,list}
let dbPane = 'pool';
let deckView = 'list';      // 'list' (inventory landing) | 'build' (deck builder)

/* ── invariants ───────────────────────────────────────────────────────────
   Two things must never be true after any deck operation: the player has no
   decks at all, or S.activeDeck points at a deck that has been deleted. Every
   mutation below funnels through here rather than each remembering to. */
function fixDeckState(){
  if (!Array.isArray(S.decks)) S.decks = [];
  if (S.activeDeck && !deckById(S.activeDeck)) S.activeDeck = null;
  if (!S.activeDeck && S.decks.length) S.activeDeck = S.decks[0].id;
  if (!S.decks.length) S.activeDeck = null;
}

/* The draft in the builder is written back to the save BEFORE any navigation,
   so backing out can never lose work. A never-saved, still-empty draft is the
   one thing that is discarded — otherwise "New deck" then "back" would litter
   the list with blanks. Legality is NOT required to store a deck; an illegal
   deck is stored and flagged, and startDuel() still refuses it. */
function commitDraft(){
  if (!dbDeck) return;
  const existing = deckById(dbDeck.id);
  if (!existing && deckTotal(dbDeck.list) === 0){ dbDeck = null; return; }
  if (!String(dbDeck.name || '').trim()) dbDeck.name = 'MY DECK';
  if (existing){
    existing.name = dbDeck.name;
    existing.list = Object.assign({}, dbDeck.list);
  } else {
    S.decks.push({ id:dbDeck.id, name:dbDeck.name, starter:dbDeck.starter,
                   list: Object.assign({}, dbDeck.list) });
  }
  fixDeckState();
  save();
}

const deckId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clipName = s => String(s || '').trim().slice(0, 22) || 'MY DECK';

/* A deck's glyph: its starter's attribute if it came from one, otherwise the
   attribute its monsters actually lean on. Keeps a home-built deck from being
   the only anonymous row in the list. */
function deckGlyph(d){
  if (d.starter && STARTER_DECKS[d.starter])
    return ATTR_ICON[STARTER_DECKS[d.starter].f || d.starter] || 'deck';
  const tally = {};
  Object.entries(d.list || {}).forEach(([id, n]) => {
    const c = cardById(id);
    if (c && c.t === 'monster' && c.f) tally[c.f] = (tally[c.f] || 0) + n;
  });
  const top = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
  return (top && ATTR_ICON[top]) || 'deck';
}
function deckMix(d){
  const m = { monster:0, spell:0, trap:0 };
  Object.entries(d.list || {}).forEach(([id, n]) => {
    const c = cardById(id);
    if (c && m[c.t] != null) m[c.t] += n;
  });
  return m;
}

/* ── runtime stylesheet ───────────────────────────────────────────────── */
function invCSS(){
  if (document.getElementById('inv-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'inv-runtime-css';
  st.textContent =
    '#scr-deck .invroot{display:none;flex:1;min-height:0;flex-direction:column}' +
    '#scr-deck .invroot.on{display:flex}' +
    /* summary strip — same chip language as the collection filters, but it
       WRAPS rather than scrolls: these are facts, not filters, and a fact you
       have to swipe sideways to find is a fact you never read */
    '#scr-deck .invsum{display:flex;flex-wrap:wrap;gap:5px;padding:1px 0 8px;flex:0 0 auto}' +
    '#scr-deck .invsum .chip{cursor:default;min-height:34px;padding:0 9px;font-size:11px;' +
      'letter-spacing:.03em}' +
    '#scr-deck .invsum .chip b{opacity:.95;font-variant-numeric:tabular-nums}' +
    '#scr-deck .ivlist{display:flex;flex-direction:column;gap:9px}' +
    /* one deck = one 68px row = one tap target that opens its options */
    '#scr-deck .ivdeck{display:flex;align-items:center;gap:11px;width:100%;text-align:left;' +
      'min-height:68px;padding:11px 12px;border-radius:16px;color:var(--txt);cursor:pointer;' +
      'border:1px solid var(--line2);background:linear-gradient(180deg,var(--panel2),var(--panel));' +
      'transition:transform .13s var(--ease),border-color .16s,background .16s}' +
    '#scr-deck .ivdeck:active{transform:scale(.985)}' +
    '#scr-deck .ivdeck.on{border-color:rgba(255,197,66,.62);' +
      'background:linear-gradient(180deg,rgba(255,197,66,.17),rgba(255,197,66,.045));' +
      'box-shadow:0 0 22px -8px rgba(255,197,66,.9)}' +
    '#scr-deck .ivglyph{flex:0 0 auto;width:44px;height:44px;border-radius:14px;display:grid;' +
      'place-items:center;color:var(--gold);background:rgba(255,197,66,.12);' +
      'border:1px solid rgba(255,197,66,.28)}' +
    '#scr-deck .ivglyph .ico{font-size:23px}' +
    '#scr-deck .ivdeck.bad .ivglyph{color:var(--bad);background:rgba(255,84,104,.12);' +
      'border-color:rgba(255,84,104,.30)}' +
    '#scr-deck .ivtxt{flex:1;min-width:0}' +
    '#scr-deck .ivname{display:block;font-family:var(--disp);font-weight:900;font-size:13.5px;' +
      'letter-spacing:.03em;text-transform:uppercase;line-height:1.25;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-deck .ivmeta{display:flex;align-items:center;gap:5px;margin-top:6px;flex-wrap:wrap}' +
    /* status is never colour-only: every tag carries an icon and words */
    '#scr-deck .ivtag{display:inline-flex;align-items:center;gap:4px;padding:2.5px 7px;' +
      'border-radius:999px;font-family:var(--body);font-weight:800;font-size:10px;line-height:1.5;' +
      'letter-spacing:.07em;text-transform:uppercase;white-space:nowrap;' +
      'background:rgba(255,255,255,.06);border:1px solid var(--line);color:var(--dim)}' +
    '#scr-deck .ivtag .ico{font-size:12px}' +
    '#scr-deck .ivtag.ok{color:var(--ok);border-color:rgba(61,220,132,.42);' +
      'background:rgba(61,220,132,.13)}' +
    '#scr-deck .ivtag.bad{color:var(--bad);border-color:rgba(255,84,104,.45);' +
      'background:rgba(255,84,104,.13)}' +
    '#scr-deck .ivtag.act{color:#241800;border-color:#FFE9B0;' +
      'background:linear-gradient(180deg,#FFDE8B,var(--gold))}' +
    /* monster/spell/trap counts ride in ONE chip, so every row keeps to a
       single line of tags and the list does not go ragged */
    '#scr-deck .ivtag.mix{gap:3px;letter-spacing:.02em}' +
    '#scr-deck .ivtag.mix i{font-style:normal;margin-right:5px}' +
    '#scr-deck .ivtag.mix i:last-child{margin-right:0}' +
    '#scr-deck .ivmore{flex:0 0 auto;width:38px;height:38px;border-radius:12px;display:grid;' +
      'place-items:center;color:var(--dim);background:rgba(255,255,255,.05);' +
      'border:1px solid var(--line)}' +
    '#scr-deck .ivmore .ico{font-size:19px}' +
    '#scr-deck .ivdeck.on .ivmore{color:var(--gold);border-color:rgba(255,197,66,.35)}' +
    /* nothing owned yet, or every deck deleted down to none */
    '#scr-deck .ivempty{padding:24px 18px;border-radius:16px;text-align:center;' +
      'border:1px dashed var(--line2);background:rgba(255,255,255,.03)}' +
    '#scr-deck .ivempty .ico{font-size:30px;color:var(--dim2)}' +
    '#scr-deck .ivempty b{display:block;font-family:var(--disp);font-size:13px;letter-spacing:.06em;' +
      'margin:9px 0 6px}' +
    '#scr-deck .ivempty p{font-size:12.5px;line-height:1.6;color:var(--dim);margin:0}' +
    '.ivnote{font-size:11.5px;line-height:1.55;color:var(--dim2);margin:8px 2px 0}' +
    '#scr-deck .ivpad{height:14px}' +
    /* sheet bits, shared by the per-deck menu and the create/rename flows */
    '.ivsheet-h{display:flex;align-items:center;gap:10px;margin-bottom:2px}' +
    '.ivsheet-h .ivglyph{flex:0 0 auto;width:40px;height:40px;border-radius:13px;display:grid;' +
      'place-items:center;color:var(--gold);background:rgba(255,197,66,.12);' +
      'border:1px solid rgba(255,197,66,.28)}' +
    '.ivsheet-h .ivglyph .ico{font-size:21px}' +
    '.ivsheet-h h3{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    /* a menu of choices reads better ranged left than centred like a CTA */
    '.btn.ivopt{align-items:stretch;text-align:left}' +
    '.btn.ivopt .bl{width:100%;justify-content:flex-start}' +
    '.btn.ivopt .bl>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.btn.ivdanger{color:var(--bad);border-color:rgba(255,84,104,.45);' +
      'background:rgba(255,84,104,.09)}';
  document.head.appendChild(st);
}

/* ── the landing's DOM, built once inside the existing #scr-deck ────────── */
function invRoot(){
  let root = $('#inv-root');
  if (root) return root;
  const scr = $('#scr-deck');
  if (!scr) return null;
  invCSS();
  root = document.createElement('div');
  root.className = 'invroot';
  root.id = 'inv-root';
  root.innerHTML =
    '<div class="invsum" id="inv-sum"></div>' +
    '<div class="dhead"><span>' + ico('deck') + ' YOUR DECKS</span>' +
      '<span id="inv-dcount"></span></div>' +
    '<div class="scroll" id="inv-scroll">' +
      '<div class="ivlist" id="inv-list"></div>' +
      '<div id="inv-starters"></div>' +
      '<div class="ivpad"></div>' +
    '</div>' +
    '<div class="savebar">' +
      '<button class="btn primary sm" id="inv-new" style="flex:1">' +
        ilb('plus', 'New deck') + '</button>' +
    '</div>';
  /* the builder's savebar is the anchor: the landing sits directly before it */
  const bar = $('#db-save') ? $('#db-save').parentElement : null;
  if (bar && bar.parentElement === scr) scr.insertBefore(root, bar);
  else scr.appendChild(root);

  /* The seven-deck starter picker used to sit above the builder. Move the two
     live nodes (renderDeckPicker still finds them by id) into the landing and
     retire the now-empty wrapper index.html left behind. */
  const sel = $('#decksel'), tag = $('#decktag');
  const host = root.querySelector('#inv-starters');
  if (sel && host){
    const wrap = sel.parentElement;
    const head = document.createElement('div');
    head.className = 'dhead';
    head.innerHTML = '<span>' + ico('cards') + ' BEGINNER DECKS</span>';
    host.appendChild(head);
    host.appendChild(sel);
    if (tag) host.appendChild(tag);
    if (wrap && wrap !== host && wrap.parentElement === scr) wrap.style.display = 'none';
  }
  $('#inv-new').onclick = newDeckSheet;
  return root;
}

/* ── view switching ───────────────────────────────────────────────────── */
function deckChrome(build){
  const scr = $('#scr-deck');
  if (!scr) return;
  const seg = $('#db-seg'), bar = $('#db-save') ? $('#db-save').parentElement : null;
  if (seg) seg.style.display = build ? '' : 'none';
  if (bar) bar.style.display = build ? '' : 'none';
  if (!build){
    const pp = $('#pane-pool'), pd = $('#pane-deck');
    if (pp) pp.classList.remove('on');
    if (pd) pd.classList.remove('on');
  }
  const root = invRoot();
  if (root) root.classList.toggle('on', !build);
  const back = $('#deck-back');
  if (back) back.setAttribute('aria-label', build ? 'Back to your decks' : 'Back to home');
  const h = scr.querySelector('.tbar h2');
  if (h) h.textContent = build && dbDeck ? clipName(dbDeck.name) : 'Inventory';
}

/* go() routes here for the Inventory tab. Which of the two views you land on is
   decided by deckView, and arriving from anywhere else always means the list. */
function renderDeckBuilder(){
  invCSS();
  renderDeckPicker();
  if (deckView !== 'build' || !dbDeck){ deckView = 'list'; renderInventory(); return; }
  deckChrome(true);
  renderBuilderPane();
}

function showInventory(){
  commitDraft();
  dbDeck = null;
  deckView = 'list';
  renderDeckBuilder();
}

/* EDIT is the only door into the builder. */
function openBuilder(d){
  dbDeck = { id:d.id, name:d.name, starter:d.starter, list: Object.assign({}, d.list) };
  dbPane = deckTotal(dbDeck.list) ? 'deck' : 'pool';
  deckView = 'build';
  renderDeckBuilder();
}

/* the tbar arrow: out of the builder goes to the list, out of the list goes home */
function deckBack(){
  if (deckView === 'build'){ showInventory(); return; }
  commitDraft(); dbDeck = null;
  go('home');
}

/* ── the landing ──────────────────────────────────────────────────────── */
function renderInventory(){
  const root = invRoot();
  if (!root) return;
  fixDeckState();
  deckChrome(false);

  const copies = Object.values(S.owned || {}).reduce((a, b) => a + b, 0);
  const legalCount = S.decks.filter(d => deckIsLegal(d.list)).length;
  /* Three facts, because four does not fit on one line at 390px and a summary
     that wraps to a lonely second row reads worse than a shorter summary.
     Chips and coins are already on Home's wallet and in the Store. */
  $('#inv-sum').innerHTML =
    '<span class="chip">' + ico('cards') + ' Cards <b>' + uniqueOwned() + '/' + CARDS.length + '</b></span>' +
    '<span class="chip">' + ico('pile') + ' Copies <b>' + copies + '</b></span>' +
    '<span class="chip">' + ico('deck') + ' Decks <b>' + S.decks.length + '</b></span>';
  $('#deck-count').innerHTML = '<span class="mono">' + S.decks.length + '</span>' +
    (S.decks.length === 1 ? ' deck' : ' decks');
  $('#inv-dcount').textContent = S.decks.length
    ? legalCount + '/' + S.decks.length + ' READY' : '';

  const host = $('#inv-list');
  host.innerHTML = '';
  if (!S.decks.length){
    host.innerHTML =
      '<div class="ivempty">' + ico('deck') +
        '<b>No decks yet</b>' +
        '<p>Take a beginner deck below, or build one from scratch with ' +
          'New deck. A deck needs exactly ' + DECK_SIZE + ' cards you own.</p></div>';
    return;
  }
  S.decks.forEach(d => host.appendChild(deckRow(d)));
  const note = document.createElement('p');
  note.className = 'ivnote';
  note.textContent = 'Tap a deck for its options — use it, edit the cards, rename, ' +
    'duplicate or delete. Max ' + MAX_COPIES + ' copies of any card.';
  host.appendChild(note);
}

function deckRow(d){
  const tot = deckTotal(d.list);
  const legal = deckIsLegal(d.list);
  const act = S.activeDeck === d.id;
  const mix = deckMix(d);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ivdeck' + (act ? ' on' : '') + (legal ? '' : ' bad');
  b.setAttribute('aria-label', d.name + ', ' + tot + ' of ' + DECK_SIZE + ' cards, ' +
    (legal ? 'ready' : 'not legal') + (act ? ', active deck' : '') + '. Options.');
  b.innerHTML =
    '<span class="ivglyph">' + ico(deckGlyph(d)) + '</span>' +
    '<span class="ivtxt">' +
      '<span class="ivname">' + esc(d.name) + '</span>' +
      '<span class="ivmeta">' +
        (act ? '<span class="ivtag act">' + ico('check') + ' Active</span>' : '') +
        /* the count carries a tick when the deck is legal and spells the
           problem out when it is not — the exception is what needs words */
        '<span class="ivtag ' + (legal ? 'ok' : 'bad') + '">' +
          ico(legal ? 'check' : 'warn') + ' ' + tot + '/' + DECK_SIZE +
          (legal ? '' : ' Not legal') + '</span>' +
        '<span class="ivtag mix">' +
          '<i>' + ico('type-monster') + ' ' + mix.monster + '</i>' +
          '<i>' + ico('type-spell') + ' ' + mix.spell + '</i>' +
          '<i>' + ico('type-trap') + ' ' + mix.trap + '</i></span>' +
      '</span>' +
    '</span>' +
    '<span class="ivmore">' + ico('menu') + '</span>';
  b.onclick = () => deckOptions(d.id);
  return b;
}

/* ── the options sheet: THE point of the rework ────────────────────────── */
function deckOptions(id){
  const d = deckById(id);
  if (!d){ renderInventory(); return; }
  const tot = deckTotal(d.list);
  const legal = deckIsLegal(d.list);
  const act = S.activeDeck === d.id;
  const last = S.decks.length <= 1;
  openSheet(
    '<div class="ivsheet-h"><span class="ivglyph">' + ico(deckGlyph(d)) + '</span>' +
      '<h3>' + esc(d.name) + '</h3></div>' +
    '<p class="muted">' + tot + '/' + DECK_SIZE + ' cards · ' +
      (legal ? 'legal and ready to duel' : 'not legal yet — cannot be used in a duel') +
      (act ? ' · your active deck' : '') + '</p>' +
    '<div class="opts">' +
      (act
        ? '<button class="btn ghost sm ivopt" disabled>' + ilb('check', 'Already your active deck') + '</button>'
        : '<button class="btn primary sm ivopt" id="do-use"' + (legal ? '' : ' disabled') + '>' +
            ilb('check', legal ? 'Use this deck' : 'Use this deck — needs ' + DECK_SIZE + ' cards') +
          '</button>') +
      '<button class="btn ghost sm ivopt" id="do-edit">' + ilb('cards', 'Edit cards — deck builder') + '</button>' +
      '<button class="btn ghost sm ivopt" id="do-ren">' + ilb('save', 'Rename') + '</button>' +
      '<button class="btn ghost sm ivopt" id="do-dup">' + ilb('plus', 'Duplicate') + '</button>' +
      '<button class="btn ghost sm ivopt ivdanger" id="do-del"' + (last ? ' disabled' : '') + '>' +
        ilb('close', 'Delete deck') + '</button>' +
      (last ? '<p class="ivnote">This is your only deck, so it cannot be deleted — ' +
              'make another one first.</p>' : '') +
      '<button class="btn ghost" id="do-close">Close</button>' +
    '</div>');
  const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
  on('#do-close', closeSheet);
  on('#do-use', () => {
    S.activeDeck = d.id;
    if (d.starter && STARTER_DECKS[d.starter]) S.side = d.starter;
    save(); closeSheet(); renderInventory();
    toast('“' + d.name + '” is now your active deck.');
  });
  on('#do-edit', () => { closeSheet(); openBuilder(d); });
  on('#do-ren', () => renameSheet(d.id));
  on('#do-dup', () => {
    const copy = { id: deckId(), name: clipName(d.name.replace(/\s+COPY$/i, '') + ' COPY'),
                   starter: d.starter, list: Object.assign({}, d.list) };
    S.decks.push(copy); fixDeckState(); save();
    closeSheet(); renderInventory();
    toast('Copied to “' + copy.name + '”.');
  });
  on('#do-del', () => deleteSheet(d.id));
}

function renameSheet(id){
  const d = deckById(id);
  if (!d) return;
  openSheet(
    '<h3>Rename deck</h3><p class="muted">Up to 22 characters.</p>' +
    '<div class="opts">' +
      '<label class="tiny" for="dr-name">Deck name</label>' +
      '<input class="field" id="dr-name" maxlength="22" autocomplete="off">' +
      '<button class="btn primary sm" id="dr-go">Save name</button>' +
      '<button class="btn ghost" id="dr-no">Cancel</button>' +
    '</div>');
  const inp = $('#dr-name');
  inp.value = d.name;
  inp.focus(); inp.select();
  const commit = () => {
    const t = deckById(id);
    if (!t) { closeSheet(); renderInventory(); return; }
    t.name = clipName(inp.value);
    if (dbDeck && dbDeck.id === t.id) dbDeck.name = t.name;
    save(); closeSheet(); renderInventory();
    toast('Renamed to “' + t.name + '”.');
  };
  $('#dr-go').onclick = commit;
  $('#dr-no').onclick = () => { closeSheet(); deckOptions(id); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
}

/* Destructive, so it is confirmed, and it is refused outright when it would
   leave the player with nothing to duel with. */
function deleteSheet(id){
  const d = deckById(id);
  if (!d) return;
  if (S.decks.length <= 1){ toast('That is your only deck — build another one first.'); return; }
  openSheet(
    '<h3>Delete “' + esc(d.name) + '”?</h3>' +
    '<p class="muted">The deck list goes; the cards stay in your collection. ' +
      'This cannot be undone.</p>' +
    '<div class="opts">' +
      '<button class="btn ghost sm ivdanger" id="dd-yes">' + ilb('close', 'Delete deck') + '</button>' +
      '<button class="btn ghost" id="dd-no">Keep it</button>' +
    '</div>');
  $('#dd-no').onclick = () => { closeSheet(); deckOptions(id); };
  $('#dd-yes').onclick = () => {
    const i = S.decks.findIndex(x => x.id === id);
    if (i < 0){ closeSheet(); renderInventory(); return; }
    const name = S.decks[i].name;
    S.decks.splice(i, 1);
    if (dbDeck && dbDeck.id === id) dbDeck = null;
    fixDeckState();
    /* S.side backs the beginner-deck picker; drop it if its deck just went */
    if (S.side && !S.decks.some(x => x.starter === S.side)) S.side = null;
    save(); closeSheet(); renderInventory();
    toast('Deleted “' + name + '”.');
  };
}

/* ── creating a deck ──────────────────────────────────────────────────── */
function newDeckSheet(){
  const copyable = S.decks.filter(d => deckTotal(d.list) > 0);
  const starters = Object.keys(STARTER_DECKS).filter(k => S.starters.indexOf(k) >= 0);
  openSheet(
    '<h3>New deck</h3><p class="muted">Start from nothing, or from something you ' +
      'already have. ' + DECK_SIZE + ' cards, max ' + MAX_COPIES + ' copies each.</p>' +
    '<div class="opts">' +
      '<button class="btn primary sm ivopt" id="nd-empty">' + ilb('plus', 'Empty deck') + '</button>' +
      (copyable.length
        ? '<div class="dhead"><span>COPY ONE OF YOURS</span></div>' +
          copyable.map(d => '<button class="btn ghost sm ivopt" data-from="' + esc(d.id) + '">' +
            ilb(deckGlyph(d), esc(d.name) + ' <b style="opacity:.55">' +
              deckTotal(d.list) + '/' + DECK_SIZE + '</b>') + '</button>').join('')
        : '') +
      (starters.length
        ? '<div class="dhead"><span>FROM A BEGINNER LIST</span></div>' +
          starters.map(k => '<button class="btn ghost sm ivopt" data-starter="' + esc(k) + '">' +
            ilb(ATTR_ICON[STARTER_DECKS[k].f || k] || 'deck',
                esc(STARTER_DECKS[k].name) + ' list') + '</button>').join('')
        : '') +
      '<button class="btn ghost" id="nd-close">Close</button>' +
    '</div>');
  $('#nd-close').onclick = closeSheet;
  $('#nd-empty').onclick = () => {
    closeSheet();
    openBuilder({ id: deckId(), name:'NEW DECK', starter:null, list:{} });
    toast('Empty deck — add ' + DECK_SIZE + ' cards from the Pool.');
  };
  $$('#sheet [data-from]').forEach(b => b.onclick = () => {
    const src = deckById(b.dataset.from);
    if (!src) return;
    closeSheet();
    openBuilder({ id: deckId(), name: clipName(src.name.replace(/\s+COPY$/i, '') + ' COPY'),
                  starter: src.starter, list: Object.assign({}, src.list) });
  });
  $$('#sheet [data-starter]').forEach(b => b.onclick = () => {
    const k = b.dataset.starter, sd = STARTER_DECKS[k];
    const missing = Object.entries(sd.list).filter(([id, n]) => ownedCount(id) < n);
    if (missing.length){
      toast('You are ' + missing.length + ' card' + (missing.length === 1 ? '' : 's') +
            ' short of the full ' + sd.name + ' list.');
      return;
    }
    closeSheet();
    openBuilder({ id: deckId(), name: clipName(sd.name + ' COPY'), starter:k,
                  list: Object.assign({}, sd.list) });
  });
}

/* ═══ the builder itself — reached only through EDIT ═══════════════════ */
function renderBuilderPane(){
  if (!dbDeck){
    const a = activeDeck();
    dbDeck = a ? { id:a.id, name:a.name, starter:a.starter, list: Object.assign({}, a.list) }
               : { id: deckId(), name:'NEW DECK', list:{} };
  }
  $$('#db-seg button').forEach(b => {
    b.classList.toggle('on', b.dataset.pane === dbPane);
    b.onclick = () => { dbPane = b.dataset.pane; renderDeckBuilder(); };
  });
  $('#pane-pool').classList.toggle('on', dbPane === 'pool');
  $('#pane-deck').classList.toggle('on', dbPane === 'deck');

  const tot = deckTotal(dbDeck.list);
  $('#deck-count').innerHTML = '<span class="mono" style="color:' +
    (tot === DECK_SIZE ? 'var(--ok)' : 'var(--gold)') + '">' + tot + '/' + DECK_SIZE + '</span>';

  /* pool filters — same category tabs as collection */
  const counts = { monster:0, spell:0, trap:0 };
  CARDS.forEach(c => { if (ownedCount(c.id) && counts[c.t] != null) counts[c.t]++; });
  const f = $('#db-filters');
  f.innerHTML = '';
  const catRow = document.createElement('div'); catRow.className = 'chiprow'; catRow.style.padding = '0';
  const subRow = document.createElement('div'); subRow.className = 'chiprow'; subRow.style.padding = '4px 0 0';
  f.appendChild(catRow); f.appendChild(subRow);
  f.style.display = 'block'; f.style.overflow = 'visible';
  chipRow(catRow, [{ k:'all', label:'All', on: dbF.cat === 'all' }].concat(
    CATS.map(c => ({ k:c.k, label: ico(c.i) + ' ' + c.n + ' <b>' + counts[c.k] + '</b>',
                     on: dbF.cat === c.k }))),
    g => { dbF.cat = g.k; if (g.k !== 'monster') dbF.attr = 'all'; renderDeckBuilder(); });
  const subs = [{ kind:'attr', k:'all', label:'Any attribute', on: dbF.attr === 'all' }];
  Object.keys(ATTR).forEach(a => subs.push(
    { kind:'attr', k:a, label: ico(ATTR_ICON[a]) + ' ' + ATTR[a].n, on: dbF.attr === a }));
  chipRow(subRow, subs, g => { dbF[g.kind] = g.k; renderDeckBuilder(); });

  const s = $('#db-search');
  s.oninput = () => { dbF.q = s.value.trim(); paintPool(); };
  paintPool();
  paintDeckList();

  $('#db-save').onclick = saveDeck;
  /* the ⋯ button is the builder's escape hatch back to the deck list */
  $('#db-menu').onclick = deckMenu;
  $('#db-menu').setAttribute('aria-label', 'Deck menu — back to your decks');
}

function poolRow(c){
  const have = ownedCount(c.id);
  const inDeck = dbDeck.list[c.id] || 0;
  const row = document.createElement('div');
  row.className = 'dbrow';
  const mini = cardEl(c, { size:'xs', tap:true });
  mini.style.setProperty('--cw', '46px');
  mini.onclick = () => cardViewModal(c);
  row.appendChild(mini);
  const info = document.createElement('div');
  info.className = 'info';
  info.innerHTML =
    '<div class="n">' + esc(c.n) + '</div>' +
    '<div class="m">' + ico(markIcon(c)) + ' ' + esc(markLabel(c)) +
      (c.t === 'monster' ? ' · L' + c.lvl + ' · ' + c.atk + '/' + c.def : '') +
      ' · owned ' + have + '</div>' +
    (effText(c) ? '<div class="e2">' + ico('bolt') + ' ' + esc(effText(c)) + '</div>' : '');
  row.appendChild(info);
  const q = document.createElement('div');
  q.className = 'qty';
  const minus = document.createElement('button');
  minus.textContent = '−'; minus.setAttribute('aria-label', 'Remove one ' + c.n);
  minus.disabled = inDeck === 0;
  minus.onclick = () => { changeQty(c.id, -1); };
  const v = document.createElement('span'); v.className = 'v'; v.textContent = String(inDeck);
  const plus = document.createElement('button');
  plus.textContent = '+'; plus.setAttribute('aria-label', 'Add one ' + c.n);
  plus.disabled = inDeck >= Math.min(MAX_COPIES, have) || deckTotal(dbDeck.list) >= DECK_SIZE;
  plus.onclick = () => { changeQty(c.id, 1); };
  q.appendChild(minus); q.appendChild(v); q.appendChild(plus);
  row.appendChild(q);
  return row;
}
function changeQty(id, delta){
  const have = ownedCount(id);
  const cur = dbDeck.list[id] || 0;
  const next = cur + delta;
  if (next < 0) return;
  if (delta > 0){
    if (next > MAX_COPIES){ toast('Max ' + MAX_COPIES + ' copies. Rules are rules.'); return; }
    if (next > have){ toast('You only own ' + have + '.'); return; }
    if (deckTotal(dbDeck.list) >= DECK_SIZE){ toast('Deck is full at ' + DECK_SIZE + '.'); return; }
  }
  if (next === 0) delete dbDeck.list[id]; else dbDeck.list[id] = next;
  renderDeckBuilder();
}
function paintPool(){
  const host = $('#db-pool');
  host.innerHTML = '';
  const list = CARDS.filter(c => ownedCount(c.id) > 0 && matches(c, dbF));
  if (!list.length){
    host.innerHTML = '<p class="muted" style="text-align:center;padding:26px 0">' +
      'No cards here yet. Open a pack.</p>';
    return;
  }
  CATS.forEach(cat => {
    const sub = list.filter(c => c.t === cat.k);
    if (!sub.length) return;
    const h = document.createElement('div');
    h.className = 'dhead';
    h.innerHTML = '<span>' + ico(cat.i) + ' ' + cat.n.toUpperCase() + '</span><span>' + sub.length + '</span>';
    host.appendChild(h);
    sub.sort((a, b) => (a.lvl - b.lvl) || a.n.localeCompare(b.n));
    sub.forEach(c => host.appendChild(poolRow(c)));
  });
}
function paintDeckList(){
  const host = $('#db-list');
  host.innerHTML = '';
  const tot = deckTotal(dbDeck.list);
  $('#db-bar').style.transform = 'scaleX(' + clamp(tot / DECK_SIZE, 0, 1) + ')';

  const entries = Object.entries(dbDeck.list)
    .map(([id, n]) => ({ c: cardById(id), n }))
    .filter(x => x.c);
  const byCat = { monster:[], spell:[], trap:[] };
  entries.forEach(x => { if (byCat[x.c.t]) byCat[x.c.t].push(x); });
  const cnt = k => byCat[k].reduce((a, x) => a + x.n, 0);
  const mons = byCat.monster;
  const avgLvl = cnt('monster')
    ? (mons.reduce((a, x) => a + x.c.lvl * x.n, 0) / cnt('monster')).toFixed(1) : '—';

  $('#db-stats').innerHTML =
    '<span class="chip">' + ico('type-monster') + ' Monsters <b>' + cnt('monster') + '</b></span>' +
    '<span class="chip">' + ico('type-spell') + ' Spells <b>' + cnt('spell') + '</b></span>' +
    '<span class="chip">' + ico('type-trap') + ' Traps <b>' + cnt('trap') + '</b></span>' +
    '<span class="chip">Avg lvl <b>' + avgLvl + '</b></span>' +
    '<span class="chip" style="color:' + (tot === DECK_SIZE ? 'var(--ok)' : 'var(--bad)') + '">' +
      tot + '/' + DECK_SIZE + '</span>';

  const nameRow = document.createElement('div');
  nameRow.style.marginBottom = '8px';
  nameRow.innerHTML = '<label class="tiny" for="db-name">Deck name</label>';
  const inp = document.createElement('input');
  inp.className = 'field'; inp.id = 'db-name'; inp.maxLength = 22; inp.value = dbDeck.name;
  inp.oninput = () => { dbDeck.name = inp.value; };
  nameRow.appendChild(inp);
  host.appendChild(nameRow);

  if (!entries.length){
    const p = document.createElement('p');
    p.className = 'muted';
    p.style.cssText = 'text-align:center;padding:22px 0';
    p.innerHTML = 'Empty. Head to the Pool tab, or load a starter from the ' +
      ico('menu', 'deck') + ' menu.';
    host.appendChild(p);
    return;
  }

  /* curve */
  if (mons.length){
    const curve = document.createElement('div');
    const buckets = [0,0,0,0,0,0,0,0];
    mons.forEach(x => { buckets[clamp(x.c.lvl, 1, 8) - 1] += x.n; });
    const max = Math.max.apply(null, buckets) || 1;
    curve.innerHTML = '<div class="dhead"><span>LEVEL CURVE</span><span>tributes ▸ 5-6 = 1 · 7-8 = 2</span></div>' +
      '<div style="display:flex;gap:4px;align-items:flex-end;height:56px">' +
      buckets.map((v, i) =>
        '<div style="flex:1;text-align:center">' +
          '<div style="height:' + (6 + (v / max) * 36) + 'px;border-radius:4px 4px 0 0;background:linear-gradient(180deg,var(--gold),var(--hot));opacity:' +
            (v ? 1 : .18) + '"></div>' +
          '<div class="tiny" style="font-size:9px;margin-top:2px">' + (i + 1) + '</div>' +
          '<div class="tiny" style="font-size:9px;color:var(--dim)">' + (v || '') + '</div>' +
        '</div>').join('') + '</div>';
    host.appendChild(curve);
  }

  CATS.forEach(cat => {
    const sub = byCat[cat.k];
    if (!sub.length) return;
    sub.sort((a, b) => (a.c.lvl - b.c.lvl) || a.c.n.localeCompare(b.c.n));
    const h = document.createElement('div');
    h.className = 'dhead';
    h.innerHTML = '<span style="color:' + cat.c + '">' + ico(cat.i) + ' ' + cat.n.toUpperCase() + '</span>' +
      '<span>' + cnt(cat.k) + '</span>';
    host.appendChild(h);
    sub.forEach(x => host.appendChild(poolRow(x.c)));
  });
  const pad = document.createElement('div'); pad.style.height = '20px'; host.appendChild(pad);
}
function saveDeck(){
  const tot = deckTotal(dbDeck.list);
  if (tot !== DECK_SIZE){
    toast('Needs exactly ' + DECK_SIZE + '. You have ' + tot + '.');
    dbPane = 'deck'; renderDeckBuilder(); return;
  }
  for (const [id, n] of Object.entries(dbDeck.list)){
    if (n > MAX_COPIES){ toast('Max ' + MAX_COPIES + ' copies of ' + cardById(id).n + '.'); return; }
    if (ownedCount(id) < n){ toast('You do not own ' + n + '× ' + cardById(id).n + '.'); return; }
  }
  if (!dbDeck.name.trim()) dbDeck.name = 'MY DECK';
  const existing = deckById(dbDeck.id);
  if (existing){ existing.name = dbDeck.name; existing.list = Object.assign({}, dbDeck.list); }
  else S.decks.push({ id:dbDeck.id, name:dbDeck.name, starter:dbDeck.starter, list: Object.assign({}, dbDeck.list) });
  S.activeDeck = dbDeck.id;
  fixDeckState();
  save();
  const n = dbDeck.name;
  /* Saving is the end of the job, so it hands you back to the deck list rather
     than leaving you staring at the pool wondering whether it took. */
  dbDeck = null; deckView = 'list'; renderDeckBuilder();
  toast('Saved. “' + n + '” is now your active deck.');
}
/* The builder's ⋯ menu. Everything that creates or manages a deck now lives on
   the Inventory landing, so this is deliberately thin: get back to the list, or
   switch which deck you are editing. Both commit the current draft first. */
function deckMenu(){
  const others = S.decks.filter(d => !dbDeck || d.id !== dbDeck.id);
  openSheet(
    '<h3>Deck builder</h3><p class="muted">Changes are kept as you go — you cannot ' +
      'lose a deck by backing out.</p>' +
    '<div class="opts">' +
      '<button class="btn primary sm ivopt" id="dm-back">' + ilb('back', 'All my decks') + '</button>' +
      (others.length
        ? '<div class="dhead"><span>EDIT ANOTHER DECK</span></div>' +
          others.map(d => '<button class="btn ghost sm ivopt" data-load="' + esc(d.id) + '">' +
            ilb(deckGlyph(d), esc(d.name) + ' <b style="opacity:.55">' +
              deckTotal(d.list) + '/' + DECK_SIZE + '</b>') + '</button>').join('')
        : '') +
      '<button class="btn ghost" id="dm-close">Close</button></div>');
  $('#dm-close').onclick = closeSheet;
  $('#dm-back').onclick = () => { closeSheet(); showInventory(); };
  $$('#sheet [data-load]').forEach(b => b.onclick = () => {
    commitDraft();
    const d = deckById(b.dataset.load);
    closeSheet();
    if (d) openBuilder(d); else showInventory();
  });
}

/* ═══════════════════════════════════════════════════════════════════
   DUEL ENGINE  (headless — the UI in part 5 only reads/renders it)
   Yu-Gi-Oh rules, simplified but faithful.
   ═══════════════════════════════════════════════════════════════════ */
const ZONES = 5;                     /* 5 monster + 5 spell/trap zones per side */
const HAND_LIMIT = 8;
let D = null;
let uid = 0;

/* Action bus — an online duel (js/mp.js) mirrors the local player's moves to the
   other device. NET.send is null for every offline mode, so this costs nothing. */
const NET = { send:null, applying:false };
function netSend(kind, a){ if (NET.send && !NET.applying) NET.send(kind, a); }

const emptyZones = () => new Array(ZONES).fill(null);

function mkPlayer(name, deckKey, list, isAI, fixedDeck){
  return {
    name, deckKey, isAI: !!isAI,
    lp: LP_START,
    /* fixedDeck = an already-shuffled id array (online lockstep: both devices
       must hold byte-identical decks, so the host deals them). */
    deck: fixedDeck ? fixedDeck.slice() : shuffle(deckToCards(list).slice()),
    hand: [], mz: emptyZones(), sz: emptyZones(), grave:[],
    normalSummoned:false, noAttackTurn:-1
  };
}
function emit(ev){ if (D && typeof D.on === 'function') D.on(ev); }
function dlog(msg){
  if (!D) return;
  D.log.push({ t: D.turnCount, who: D.turn, msg });
  emit({ type:'log', msg });
}

function newDuel(myList, aiKey, opts){
  opts = opts || {};
  uid = 0;
  /* opts.foe = {name, list, deckKey, isAI} lets story mode / pass-and-play /
     online supply their own opponent instead of a random starter deck. */
  const foe = opts.foe || null;
  const aiDeck = foe || STARTER_DECKS[aiKey];
  const decks = opts.decks || null;
  D = {
    p: [ mkPlayer(opts.myName || 'YOU', opts.myKey || null, myList, false, decks && decks[0]),
         mkPlayer(aiDeck.name, foe ? (foe.deckKey || null) : aiKey, aiDeck.list,
                  foe ? foe.isAI !== false : true, decks && decks[1]) ],
    turn: 0, turnCount: 1, phase:'main',
    over:false, winner:null, log:[], ai:{ stage:'main' },
    mode: opts.mode || 'solo',
    diff: opts.diff || (S && S.diff) || 'normal',
    on: opts.on || null
  };
  /* the decks have just been shuffled — say so, before the gong. This is the
     one place in a duel a shuffle happens, so it is the one place it sounds. */
  if (window.KARTI_SFX) { try { KARTI_SFX.play('duel.shuffle'); } catch(e){} }
  for (let i = 0; i < 5; i++){ rawDraw(0); rawDraw(1); }
  dlog('Duel start — ' + D.p[0].name + ' vs ' + D.p[1].name + '. 8000 LP each.');
  emit({ type:'start' });
  return D;
}
function rawDraw(pi){
  const P = D.p[pi];
  if (!P.deck.length) return null;
  const id = P.deck.pop();
  P.hand.push(id);
  return id;
}
function drawCard(pi, n){
  n = n || 1;
  const P = D.p[pi];
  for (let i = 0; i < n; i++){
    if (!P.deck.length){ endDuel(1 - pi, P.name + ' has no cards left to draw. Deck-out.'); return false; }
    rawDraw(pi);
  }
  emit({ type:'draw', pi, n });
  return true;
}
function endDuel(winner, why){
  if (D.over) return;
  D.over = true; D.winner = winner;
  dlog(why);
  emit({ type:'over', winner, why });
}
function damage(pi, amt, why){
  if (D.over || amt <= 0) return;
  const P = D.p[pi];
  P.lp = Math.max(0, P.lp - amt);
  emit({ type:'lp', pi, delta:-amt, lp:P.lp });
  dlog(P.name + ' takes ' + amt + (why ? ' — ' + why : '') + '. (' + P.lp + ' LP)');
  if (P.lp <= 0) endDuel(1 - pi, P.name + ' is out of Life Points.');
}
function healLP(pi, amt, why){
  if (D.over || amt <= 0) return;
  const P = D.p[pi];
  P.lp += amt;
  emit({ type:'lp', pi, delta:amt, lp:P.lp });
  dlog(P.name + ' heals ' + amt + (why ? ' — ' + why : '') + '. (' + P.lp + ' LP)');
}

/* `mod` is an ATTACK modifier and nothing else. Every card that moves a number
   — grow, grow2, weaken, drain — says ATK on its face, so DEF is left alone.
   It used to be shared, which quietly gave Drunk Bandsman +200 DEF a turn and
   let The Bird Trapper knock 400 off a wall it never claimed to touch.
   defMod exists so a future card CAN say DEF out loud; nothing sets it today. */
const effAtk = m => Math.max(0, m.card.atk + (m.mod || 0) + (m.tempMod || 0));
const effDef = m => Math.max(0, m.card.def + (m.defMod || 0));
const fieldMonsters = pi => D.p[pi].mz.map((m, i) => m ? { m, i } : null).filter(Boolean);
const freeZone = (pi, kind) => (kind === 's' ? D.p[pi].sz : D.p[pi].mz).indexOf(null);

/* A card always goes back to whoever it belongs to, not to whoever happens to be
   holding it. Without this a monster taken with s_steal ends up in the thief's
   grave (or hand) for good. `owner` is set at summon; fall back to the controller
   for anything created before it existed. */
function ownerOf(inst, controller){
  return (inst && Number.isInteger(inst.owner)) ? inst.owner : controller;
}
function toGrave(pi, inst){
  D.p[ownerOf(inst, pi)].grave.push(inst.cid);
}
function destroyMonster(pi, zi, reason){
  const P = D.p[pi];
  const m = P.mz[zi];
  if (!m) return;
  if (m.card.fx === 'shield' && !m.shieldUsed && reason === 'battle'){
    m.shieldUsed = true;
    dlog(m.card.n + ' shrugs it off — it survives (shield used).');
    emit({ type:'shield', pi, zi });
    return;
  }
  P.mz[zi] = null;
  toGrave(pi, m);
  dlog(m.card.n + ' is destroyed.');
  emit({ type:'destroy', pi, zi, name:m.card.n });
  if (m.card.fx === 'boom') boomBoth(m.card.n, pi);
}
/* "500 damage to BOTH players" — and it has to be BOTH, at the same moment.
   Two sequential damage() calls meant the first one could end the duel and the
   second was then skipped, so on a mutual-lethal seat 0 always died alone and
   seat 1 walked away untouched. Now the life points come off together and the
   duel is decided afterwards; if it takes both of them out, the one who was
   holding the thing goes down with it and the other is last man standing. */
function boomBoth(name, ctrl){
  if (D.over) return;
  dlog(name + ' goes off — 500 to both players.');
  const before = [D.p[0].lp, D.p[1].lp];
  [0, 1].forEach(i => {
    const P = D.p[i];
    P.lp = Math.max(0, P.lp - 500);
    emit({ type:'lp', pi:i, delta: P.lp - before[i], lp:P.lp });
    dlog(P.name + ' takes ' + (before[i] - P.lp) + ' — ' + name + '. (' + P.lp + ' LP)');
  });
  const out0 = D.p[0].lp <= 0, out1 = D.p[1].lp <= 0;
  if (out0 && out1) endDuel(1 - ctrl, 'Both of them go up with ' + name + ' — whoever lit it goes first.');
  else if (out0) endDuel(1, D.p[0].name + ' is out of Life Points.');
  else if (out1) endDuel(0, D.p[1].name + ' is out of Life Points.');
}
function destroyST(pi, zi){
  const P = D.p[pi];
  const s = P.sz[zi];
  if (!s) return;
  P.sz[zi] = null;
  toGrave(pi, s);
}

/* ── summoning ── */
function summonInfo(pi, handIdx){
  const P = D.p[pi];
  const card = cardById(P.hand[handIdx]);
  if (!card || card.t !== 'monster') return { ok:false, why:'Not a monster.' };
  if (P.normalSummoned) return { ok:false, why:'One normal summon per turn.' };
  const need = tributesFor(card.lvl);
  const have = fieldMonsters(pi).length;
  if (need > have) return { ok:false, why:'Needs ' + need + ' tribute' + (need > 1 ? 's' : '') + '.' };
  if (need === 0 && freeZone(pi, 'm') < 0) return { ok:false, why:'No free monster zone.' };
  return { ok:true, need, card };
}
function summon(pi, handIdx, zi, pos, faceDown, tributeIdx){
  const P = D.p[pi];
  const info = summonInfo(pi, handIdx);
  if (!info.ok) return { ok:false, why:info.why };
  const card = info.card;
  tributeIdx = tributeIdx || [];
  if (tributeIdx.length !== info.need) return { ok:false, why:'Wrong number of tributes.' };
  /* Counting the indices is not enough. Naming empty zones — or the same zone twice —
     used to pay for nothing, so you could keep your whole board AND summon a Level 8
     for free. Every index must be a distinct zone with a monster actually in it. */
  const paid = Object.create(null);
  for (const raw of tributeIdx){
    const i = Number(raw);
    if (!Number.isInteger(i) || i < 0 || i >= ZONES) return { ok:false, why:'Invalid tribute.' };
    if (paid[i]) return { ok:false, why:'Cannot tribute the same monster twice.' };
    if (!P.mz[i]) return { ok:false, why:'That tribute zone is empty.' };
    paid[i] = true;
  }
  if (pi === 0) netSend('summon', { hi:handIdx, zi, pos, fd:!!faceDown, tributes:tributeIdx.slice() });
  tributeIdx.forEach(raw => {
    const i = Number(raw), m = P.mz[i];
    if (m){ dlog(m.card.n + ' is tributed.'); P.mz[i] = null; toGrave(pi, m); }
  });
  /* zi has to be a real zone. It arrives from the UI, from the AI, and over the
     wire from the other phone in an online duel — an index of 7 used to grow
     the five-zone array to eight and put a monster in a zone nothing renders. */
  if (!Number.isInteger(zi) || zi < 0 || zi >= ZONES || P.mz[zi]) zi = freeZone(pi, 'm');
  if (zi < 0) return { ok:false, why:'No free monster zone.' };
  P.hand.splice(handIdx, 1);
  const inst = {
    uid: ++uid, cid: card.id, card, owner: pi,   /* never changes, even when stolen */
    pos: pos || 'atk', fd: !!faceDown, mod:0, tempMod:0, defMod:0,
    atkCount:0, maxAtk: card.fx === 'double' || card.fx === 'cleave' ? 2 : 1,
    /* monsterOnly = cleave. `hit` is who it has already been at THIS turn, so
       "two enemy monsters" is two DIFFERENT enemy monsters. */
    monsterOnly: card.fx === 'cleave', hit:[], shieldUsed:false, sumTurn: D.turnCount
  };
  P.mz[zi] = inst;
  P.normalSummoned = true;
  dlog(P.name + (faceDown ? ' sets a monster face-down.' : ' summons ' + card.n +
    ' (' + card.atk + '/' + card.def + ').'));
  /* `tributes` rides along purely so the sound layer can tell a boss from a
     beater — see onDuelEvent. It costs nothing and no rule reads it. */
  emit({ type:'summon', pi, zi, faceDown, name:card.n, lvl:card.lvl, tributes:info.need });
  if (!faceDown) onSummonFx(pi, zi);
  return { ok:true, zi };
}
function onSummonFx(pi, zi){
  const P = D.p[pi], O = D.p[1 - pi], oi = 1 - pi;
  const m = P.mz[zi];
  if (!m) return;
  switch (m.card.fx){
    case 'heal':  healLP(pi, 500, m.card.n); break;
    case 'heal8': healLP(pi, 800, m.card.n); break;
    case 'burn':  damage(oi, 800, m.card.n); break;
    case 'snipe': {
      const list = fieldMonsters(oi);
      if (!list.length){ dlog(m.card.n + ' finds nothing to shoot at.'); break; }
      list.sort((a, b) => effAtk(a.m) - effAtk(b.m));
      dlog(m.card.n + ' picks off ' + list[0].m.card.n + '.');
      destroyMonster(oi, list[0].i, 'effect');
      break;
    }
    case 'weaken': {
      const list = fieldMonsters(oi);
      list.forEach(x => { x.m.mod -= 400; });
      dlog(list.length ? m.card.n + ' drops every enemy monster by 400 ATK.'
                       : m.card.n + ' has nobody to bring down.');
      break;
    }
    case 'stun':
      /* Aim at the opponent's NEXT turn. turnCount+1 is only their turn when this
         fires on our own turn; a flip effect triggers during THEIR turn, where
         turnCount+1 is ours — so it used to stun the wrong player and do nothing. */
      O.noAttackTurn = D.turnCount + (D.turn === oi ? 2 : 1);
      dlog(m.card.n + ': ' + O.name + ' cannot attack next turn.');
      break;
    case 'drain': {
      const list = fieldMonsters(oi).filter(x => !x.m.fd).sort((a, b) => effAtk(b.m) - effAtk(a.m));
      if (!list.length){ dlog(m.card.n + ' has nobody to take it off.'); break; }
      const victim = list[0].m;
      const taken = Math.min(400, effAtk(victim));
      victim.mod -= taken; m.mod += taken;
      dlog(m.card.n + ' takes ' + taken + ' ATK straight off ' + victim.card.n + '.');
      break;
    }
    case 'peek':
      /* the hand goes to the player who peeked (see onDuelEvent), NOT into the
         shared battle log — on one phone that log is read by both seats */
      dlog(m.card.n + ' has a good look at ' + O.name + '\'s hand (' + O.hand.length + ' cards).');
      emit({ type:'peek', pi, hand: O.hand.slice() });
      break;
    case 'revive': {
      const mons = P.grave.map((id, i) => ({ id, i })).filter(x => cardById(x.id).t === 'monster');
      if (!mons.length){ dlog('Nothing worth reviving in the graveyard.'); break; }
      const best = mons.sort((a, b) => cardById(b.id).atk - cardById(a.id).atk)[0];
      P.grave.splice(best.i, 1);
      P.hand.push(best.id);
      dlog(m.card.n + ' brings ' + cardById(best.id).n + ' back to hand.');
      break;
    }
  }
}
function setST(pi, handIdx, zi){
  const P = D.p[pi];
  const card = cardById(P.hand[handIdx]);
  if (!card || card.t === 'monster') return { ok:false, why:'Not a spell or trap.' };
  if (pi === 0) netSend('set', { hi:handIdx, zi });
  if (!Number.isInteger(zi) || zi < 0 || zi >= ZONES || P.sz[zi]) zi = freeZone(pi, 's');
  if (zi < 0) return { ok:false, why:'No free spell/trap zone.' };
  P.hand.splice(handIdx, 1);
  P.sz[zi] = { uid: ++uid, cid: card.id, card, setTurn: D.turnCount, fd:true };
  dlog(P.name + ' sets a card face-down.');
  emit({ type:'set', pi, zi });
  return { ok:true, zi };
}

/* ── spells ── */
function spellNeedsTarget(card){
  return card.fx === 's_buff' || card.fx === 's_destroy' || card.fx === 's_steal';
}
function spellTargets(pi, card){
  if (card.fx === 's_buff') return fieldMonsters(pi).map(x => ({ side:pi, i:x.i, m:x.m }));
  if (card.fx === 's_destroy' || card.fx === 's_steal')
    return fieldMonsters(1 - pi).map(x => ({ side:1 - pi, i:x.i, m:x.m }));
  return [];
}
/* "Nothing to use it on" is a REFUSAL, not a shrug: a card that would resolve
   into thin air is never offered, so it cannot be spent for nothing by a
   mis-tap. Every branch here is a card whose text promises something it could
   not deliver on the current board. */
function canActivateSpell(pi, card){
  if (card.t !== 'spell') return false;
  if (card.fx === 's_steal' && freeZone(pi, 'm') < 0) return false;
  if (spellNeedsTarget(card) && spellTargets(pi, card).length === 0) return false;
  if (card.fx === 's_search' && !D.p[pi].deck.some(id => cardById(id).t === 'monster')) return false;
  if (card.fx === 's_buffall' && fieldMonsters(pi).length === 0) return false;
  if (card.fx === 's_discard' && D.p[1 - pi].hand.length === 0) return false;
  return true;
}
function activateSpell(pi, handIdx, target){
  const P = D.p[pi], oi = 1 - pi;
  const card = cardById(P.hand[handIdx]);
  if (!card || card.t !== 'spell') return { ok:false, why:'Not a spell.' };
  if (!canActivateSpell(pi, card)) return { ok:false, why:'Nothing to use it on.' };
  /* A targeted spell must actually name something that is there. The UI only
     ever offers legal targets, but the AI and the other phone in an online duel
     both call straight in here, and a bad index used to spend the card for
     nothing (or throw halfway through resolving it). */
  if (spellNeedsTarget(card)){
    const legal = spellTargets(pi, card);
    if (!target || !legal.some(t => t.side === target.side && t.i === target.i))
      return { ok:false, why:'Pick a target first.' };
  }
  if (pi === 0) netSend('spell', { hi:handIdx, target: target ? { side:target.side, i:target.i } : null });
  P.hand.splice(handIdx, 1);
  P.grave.push(card.id);
  dlog(P.name + ' plays ' + card.n + '.');
  emit({ type:'spell', pi, name:card.n });
  switch (card.fx){
    case 's_draw':  drawCard(pi, 2); break;
    case 's_draw1': drawCard(pi, 1); break;
    case 's_heal':  healLP(pi, 1500, card.n); break;
    case 's_buff': {
      const m = D.p[target.side].mz[target.i];
      if (m){ m.tempMod += 700; D.tempOwners = D.tempOwners || []; D.tempOwners.push(m);
        dlog(m.card.n + ' gets +700 ATK this turn.'); }
      break;
    }
    case 's_buffall': {
      const list = fieldMonsters(pi);
      list.forEach(x => { x.m.tempMod += 400; (D.tempOwners = D.tempOwners || []).push(x.m); });
      dlog('The whole street lights up: +400 ATK to ' + list.length + ' monster(s) this turn.');
      break;
    }
    case 's_destroy': {
      const m = D.p[oi].mz[target.i];
      if (m){ dlog(card.n + ' takes out ' + m.card.n + '.'); destroyMonster(oi, target.i, 'effect'); }
      break;
    }
    case 's_steal': {
      const zi = freeZone(pi, 'm');
      const m = D.p[oi].mz[target.i];
      if (m && zi >= 0){
        const wasHidden = m.fd;
        D.p[oi].mz[target.i] = null;
        m.fd = false; m.pos = 'atk'; m.atkCount = 0; m.hit = [];
        P.mz[zi] = m;
        (D.stolen = D.stolen || []).push({ m, from: oi, fromZone: target.i, to: pi, toZone: zi });
        dlog(P.name + ' knows someone — ' + m.card.n + ' switches sides for the turn.');
        /* it has just been turned face-up, and everywhere else in the engine a
           monster turning face-up fires its effect. It fires for whoever is
           holding it now, which for one turn is the thief. */
        if (wasHidden) onSummonFx(pi, zi);
      }
      break;
    }
    case 's_discard': {
      const O = D.p[oi];
      if (!O.hand.length){ dlog('Nothing to screenshot — their hand is empty.'); break; }
      const id = O.hand.splice(rnd(O.hand.length), 1)[0];
      O.grave.push(id);
      dlog(O.name + ' has to bin ' + cardById(id).n + '.');
      break;
    }
    case 's_search': {
      const idx = P.deck.map((id, i) => ({ id, i })).filter(x => cardById(x.id).t === 'monster')
        .sort((a, b) => cardById(b.id).atk - cardById(a.id).atk)[0];
      if (idx){ P.deck.splice(idx.i, 1); P.hand.push(idx.id);
        dlog(P.name + ' digs out ' + cardById(idx.id).n + '.'); }
      break;
    }
  }
  return { ok:true };
}

/* ── traps ── */
function trapPriority(fx){
  return { t_mirror:5, t_destroy:4, t_bounce:3, t_negate:2, t_weaken:1, t_burn:0 }[fx];
}
function triggerTraps(defPi, atkPi, attacker, defZone){
  const DEF = D.p[defPi];
  const ready = DEF.sz.map((s, i) => s ? { s, i } : null)
    .filter(x => x && x.s.card.t === 'trap' && x.s.setTurn < D.turnCount && trapPriority(x.s.card.fx) != null);
  if (!ready.length) return {};

  const target = defZone >= 0 ? DEF.mz[defZone] : null;
  const a = effAtk(attacker) + (target ? counterBonus(attacker.card, target.card) : 0);
  const threat = defZone < 0
    ? a >= 800
    : (target && ((target.pos === 'atk' && a > effAtk(target)) || (target.pos === 'def' && a > effDef(target))
        || (target.pos === 'atk' && a - effAtk(target) >= 800)));

  ready.sort((x, y) => trapPriority(y.s.card.fx) - trapPriority(x.s.card.fx));
  /* js/ai.js takes this decision over when present, so the AI can hold a good
     trap back for a real threat instead of burning it on the first attack. */
  let chosen = (window.KARTI_AI && KARTI_AI.pickTrap)
    ? KARTI_AI.pickTrap(ready, { defPi, atkPi, attacker, defZone, target, atk:a, threat })
    : (threat ? ready[0] : ready.find(x => x.s.card.fx === 't_burn'));
  if (!chosen) return {};

  const card = chosen.s.card;
  chosen.s.fd = false;
  dlog(DEF.name + ' flips ' + card.n + '!');
  emit({ type:'trap', pi:defPi, zi:chosen.i, name:card.n });
  const out = {};
  switch (card.fx){
    case 't_negate':  out.negate = true; dlog('The attack is stopped dead.'); break;
    /* "the attacker's ATK" is the ATK it is swinging with — `a` already carries
       the ring bonus, which the ring itself calls ATK, and it is the number the
       log just printed. Reflecting the smaller card value instead made the
       balcony punish a countered attack LESS than an uncountered one. */
    case 't_mirror':  out.negate = true;
                      dlog('The attack is thrown straight back.');
                      damage(atkPi, a, card.n); break;
    /* "this battle", not this turn: a double attacker used to carry the -800
       into its second swing as well. doAttack hands it back when the battle is
       over (see `weakened` below). */
    case 't_weaken':  attacker.tempMod -= 800;
                      attacker.weakBattle = (attacker.weakBattle || 0) + 800;
                      dlog(attacker.card.n + ' loses 800 ATK for this battle.'); break;
    case 't_burn':    damage(atkPi, 1000, card.n); break;
    case 't_destroy': {
      const zi = D.p[atkPi].mz.indexOf(attacker);
      if (zi >= 0) destroyMonster(atkPi, zi, 'effect');
      out.negate = true; break;
    }
    case 't_bounce': {
      const zi = D.p[atkPi].mz.indexOf(attacker);
      if (zi >= 0){
        D.p[atkPi].mz[zi] = null;
        /* "its owner's hand" — the card's owner, not the current controller. Bouncing
           a monster that had been taken with s_steal used to hand it to the thief
           permanently, because the end-of-turn return only looks on the field. */
        const own = ownerOf(attacker, atkPi);
        D.p[own].hand.push(attacker.cid);
        D.stolen = (D.stolen || []).filter(st => st.m !== attacker);
        dlog(attacker.card.n + ' is sent back to ' + D.p[own].name + '’s hand.');
      }
      out.negate = true; break;
    }
  }
  destroyST(defPi, chosen.i);
  return out;
}

/* ── battle ── */
function tauntZone(pi){
  const t = fieldMonsters(pi).find(x => !x.m.fd && x.m.card.fx === 'taunt');
  return t ? t.i : -1;
}
/* Standard opening-turn rule: whoever goes first gets NO battle phase on turn 1.
   Enforced in the engine, not the UI, so the AI and a remote player cannot
   sidestep it either — without it, going first is a huge unearned advantage. */
const noBattleYet = () => D.turnCount === 1;
function canAttack(pi, zi){
  if (D.over || D.phase !== 'battle' || D.turn !== pi) return false;
  if (noBattleYet()) return false;
  const P = D.p[pi], m = P.mz[zi];
  if (!m || m.fd || m.pos !== 'atk') return false;
  if (P.noAttackTurn === D.turnCount) return false;
  return m.atkCount < m.maxAtk;
}
/* -1 = a direct attack at the life points.
   A cleave monster ("attacks two enemy monsters") gets its two swings at two
   DIFFERENT monsters — it can no longer hit the same wall twice — and the extra
   swing is the part that needs a monster: with their side empty it still makes
   the one ordinary attack every monster is entitled to, instead of standing
   there with no legal move at all. */
function legalAttackTargets(pi, zi){
  const m = D.p[pi].mz[zi];
  if (!m) return [];
  const enemy = fieldMonsters(1 - pi);
  if (!enemy.length) return (m.monsterOnly && m.atkCount > 0) ? [] : [-1];
  const t = tauntZone(1 - pi);
  let list = t >= 0 ? [t] : enemy.map(x => x.i);
  if (m.monsterOnly && m.hit && m.hit.length){
    const O = D.p[1 - pi];
    list = list.filter(i => O.mz[i] && m.hit.indexOf(O.mz[i].uid) < 0);
  }
  return list;
}
/* The declaration and the bookkeeping. Everything a battle can do to a card —
   traps, flip effects, boom, thorns — happens inside resolveAttack, and the
   `finally` is what guarantees a one-battle debuff lasts exactly one battle
   however the battle ended. */
function doAttack(pi, zi, targetZone){
  const P = D.p[pi], O = D.p[1 - pi];
  if (!canAttack(pi, zi)) return { ok:false, why:'That monster cannot attack.' };
  const legal = legalAttackTargets(pi, zi);
  if (legal.indexOf(targetZone) < 0) return { ok:false, why:'Not a legal target.' };
  if (pi === 0) netSend('attack', { zi, t:targetZone });
  const A = P.mz[zi];
  A.atkCount++;
  /* remember WHO it went for, so "two enemy monsters" cannot be one monster
     twice. Recorded now, because the target may not survive the battle. */
  if (targetZone >= 0 && O.mz[targetZone]) (A.hit = A.hit || []).push(O.mz[targetZone].uid);
  try {
    return resolveAttack(pi, zi, targetZone, A);
  } finally {
    if (A.weakBattle){ A.tempMod += A.weakBattle; A.weakBattle = 0; }
  }
}
function resolveAttack(pi, zi, targetZone, A){
  const oi = 1 - pi;
  const P = D.p[pi], O = D.p[oi];

  const tr = triggerTraps(oi, pi, A, targetZone);
  if (tr.negate){ emit({ type:'attack', pi, zi, targetZone, negated:true }); return { ok:true, negated:true }; }
  if (D.over || !P.mz[zi]) return { ok:true };

  if (targetZone < 0){
    const dmg = effAtk(A);
    dlog(A.card.n + ' attacks directly!');
    emit({ type:'attack', pi, zi, targetZone:-1 });
    damage(oi, dmg, 'direct hit from ' + A.card.n);
    if (A.card.fx === 'leech' && dmg > 0) healLP(pi, dmg, A.card.n + ' drinks it in');
    afterAttack(pi, zi);
    return { ok:true, direct:true, dmg };
  }

  const Dm = O.mz[targetZone];
  if (!Dm) return { ok:false, why:'Nothing there.' };
  if (Dm.fd){
    Dm.fd = false;
    dlog(Dm.card.n + ' is flipped face-up (' + Dm.card.atk + '/' + Dm.card.def + ').');
    emit({ type:'flip', pi:oi, zi:targetZone, name:Dm.card.n });
    onSummonFx(oi, targetZone);           /* flip effects fire like a summon */
    if (D.over || !O.mz[targetZone] || !P.mz[zi]) return { ok:true };
  }

  const bonus = counterBonus(A.card, Dm.card);
  const a = effAtk(A) + bonus;
  emit({ type:'attack', pi, zi, targetZone, bonus });
  if (bonus){
    const an = A.card.f && ATTR[A.card.f] ? ATTR[A.card.f].n : '?';
    const dn = Dm.card.f && ATTR[Dm.card.f] ? ATTR[Dm.card.f].n : '?';
    dlog(an + ' beats ' + dn + ' — ' + A.card.n + ' gains +' + bonus + ' ATK.');
    emit({ type:'counter', text: an + ' BEATS ' + dn + ' +' + bonus + '!' });
  }
  dlog(A.card.n + ' (' + a + ') attacks ' + Dm.card.n +
    ' (' + (Dm.pos === 'atk' ? effAtk(Dm) + ' ATK' : effDef(Dm) + ' DEF') + ').');

  let dealt = 0;
  if (Dm.pos === 'atk'){
    const d = effAtk(Dm);
    if (a > d){ dealt = a - d; destroyMonster(oi, targetZone, 'battle'); damage(oi, dealt, 'battle damage'); }
    else if (a < d){ const back = d - a; destroyMonster(pi, zi, 'battle'); damage(pi, back, 'battle damage'); }
    else { dlog('Dead even — both go down.'); destroyMonster(oi, targetZone, 'battle'); destroyMonster(pi, zi, 'battle'); }
  } else {
    const d = effDef(Dm);
    if (a > d){
      destroyMonster(oi, targetZone, 'battle');
      if (A.card.fx === 'pierce'){
        dealt = a - d;
        dlog(A.card.n + ' goes straight through the defence.');
        damage(oi, dealt, 'piercing damage');
      } else dlog('Defence broken — no damage.');
    }
    else if (a < d){ const back = d - a; damage(pi, back, 'bounced off the defence'); }
    else dlog('Bounces straight off. Nothing happens.');
  }
  if (dealt && A.card.fx === 'leech' && P.mz[zi]) healLP(pi, dealt, A.card.n + ' drinks it in');
  /* thorns — whatever attacked it takes 400 */
  if (Dm.card.fx === 'thorns' && !D.over) damage(pi, 400, Dm.card.n + ' stings back');
  afterAttack(pi, zi);
  return { ok:true, dmg: dealt };
}
function afterAttack(pi, zi){
  const m = D.p[pi].mz[zi];
  if (!m || D.over) return;
  if (m.card.fx === 'kamikaze'){
    dlog(m.card.n + ' burns itself out.');
    destroyMonster(pi, zi, 'effect');
  }
}
function changePosition(pi, zi){
  const m = D.p[pi].mz[zi];
  if (!m || D.turn !== pi || D.phase !== 'main') return false;
  if (m.sumTurn === D.turnCount) return false;
  if (m.atkCount > 0) return false;
  if (pi === 0) netSend('pos', { zi });
  if (m.fd){ m.fd = false; m.pos = 'atk'; dlog(m.card.n + ' flips up into attack position.'); onSummonFx(pi, zi); }
  else { m.pos = m.pos === 'atk' ? 'def' : 'atk'; dlog(m.card.n + ' switches to ' + m.pos.toUpperCase() + '.'); }
  emit({ type:'position', pi, zi });
  return true;
}

/* ── turn structure ── */
function standbyFx(pi){
  const P = D.p[pi], oi = 1 - pi;
  fieldMonsters(pi).forEach(x => {
    const m = x.m;
    if (m.fd) return;
    if (m.card.fx === 'grow'){ m.mod += 200; dlog(m.card.n + ' gets louder: +200 ATK (now ' + effAtk(m) + ').'); }
    if (m.card.fx === 'grow2'){ m.mod += 300; dlog(m.card.n + ' goes up again: +300 ATK (now ' + effAtk(m) + ').'); }
    if (m.card.fx === 'healall') healLP(pi, 800, m.card.n);
    if (m.card.fx === 'discard'){
      const O = D.p[oi];
      if (O.hand.length){
        const i = rnd(O.hand.length);
        const id = O.hand.splice(i, 1)[0];
        O.grave.push(id);
        dlog(m.card.n + ' nags ' + O.name + ' into discarding ' + cardById(id).n + '.');
      }
    }
  });
}
function beginTurn(){
  if (D.over) return;
  const pi = D.turn;
  const P = D.p[pi];
  P.normalSummoned = false;
  P.mz.forEach(m => { if (m){ m.atkCount = 0; m.hit = []; } });
  D.phase = 'draw';
  dlog('── Turn ' + D.turnCount + ' · ' + P.name + ' ──');
  emit({ type:'turn', pi });
  standbyFx(pi);
  if (D.over) return;
  drawCard(pi, 1);
  if (D.over) return;
  D.phase = 'main';
  D.ai.stage = 'main';
  emit({ type:'phase', phase:'main' });
}
function toBattle(){
  if (D.over || D.phase !== 'main') return false;
  if (noBattleYet()) return false;             /* no battle phase on the opening turn */
  if (D.turn === 0) netSend('battle', null);
  D.phase = 'battle';
  emit({ type:'phase', phase:'battle' });
  return true;
}
function endTurn(){
  if (D.over) return;
  const pi = D.turn;
  if (pi === 0) netSend('end', null);
  const P = D.p[pi];
  /* return stolen monsters */
  (D.stolen || []).forEach(st => {
    const zi = D.p[st.to].mz.indexOf(st.m);
    if (zi >= 0){
      const back = freeZone(st.from, 'm');
      D.p[st.to].mz[zi] = null;
      if (back >= 0){ D.p[st.from].mz[back] = st.m; dlog(st.m.card.n + ' goes back where it belongs.'); }
      else { D.p[st.from].grave.push(st.m.cid); dlog(st.m.card.n + ' has nowhere to go and is destroyed.'); }
    }
  });
  D.stolen = [];
  /* clear this-turn buffs */
  (D.tempOwners || []).forEach(m => { m.tempMod = 0; });
  D.tempOwners = [];
  /* hand limit */
  while (P.hand.length > HAND_LIMIT){
    const id = P.hand.splice(rnd(P.hand.length), 1)[0];
    P.grave.push(id);
    dlog(P.name + ' has too many cards and pitches ' + cardById(id).n + '.');
  }
  D.phase = 'end';
  D.turn = 1 - D.turn;
  D.turnCount++;
  beginTurn();
}

/* ═══════════════════════════════════════════════════════════════════
   AI — same rules, same deck size, no peeking at your hand.
   One decision per call so the UI can animate between steps.
   ═══════════════════════════════════════════════════════════════════ */
function aiBestSummon(){
  const pi = 1, P = D.p[pi];
  let best = null;
  P.hand.forEach((id, hi) => {
    const c = cardById(id);
    if (c.t !== 'monster') return;
    const info = summonInfo(pi, hi);
    if (!info.ok) return;
    const need = info.need;
    let tributes = [];
    if (need){
      const mine = fieldMonsters(pi).slice().sort((a, b) => effAtk(a.m) - effAtk(b.m));
      tributes = mine.slice(0, need).map(x => x.i);
      const cost = mine.slice(0, need).reduce((a, x) => a + effAtk(x.m), 0);
      if (c.atk <= cost + 300) return;            /* not worth the bodies */
    }
    const score = c.atk + (c.fx ? 250 : 0) - need * 150;
    if (!best || score > best.score) best = { hi, c, need, tributes, score };
  });
  return best;
}
/* The smarter, difficulty-aware AI lives in js/ai.js and takes over when loaded.
   Everything below is the original fallback so the game still runs without it. */
function aiStep(){
  if (D.over) return false;
  if (window.KARTI_AI && KARTI_AI.step) return KARTI_AI.step(1);
  const pi = 1, P = D.p[pi], O = D.p[0], oi = 0;
  if (D.turn !== pi) return false;

  if (D.ai.stage === 'main'){
    /* 1. emergency heal */
    const healIdx = P.hand.findIndex(id => cardById(id).fx === 's_heal');
    if (P.lp <= 3000 && healIdx >= 0){ activateSpell(pi, healIdx); return true; }
    /* 2. removal on the biggest threat */
    const destIdx = P.hand.findIndex(id => cardById(id).fx === 's_destroy');
    if (destIdx >= 0){
      const threats = fieldMonsters(oi).filter(x => !x.m.fd).sort((a, b) => effAtk(b.m) - effAtk(a.m));
      if (threats.length && effAtk(threats[0].m) >= 1800){
        activateSpell(pi, destIdx, { side:oi, i:threats[0].i }); return true;
      }
    }
    /* 3. draw / search when the hand is thin */
    const drawIdx = P.hand.findIndex(id => cardById(id).fx === 's_draw' || cardById(id).fx === 's_draw1'
      || cardById(id).fx === 's_search');
    if (P.hand.length <= 4 && drawIdx >= 0 && canActivateSpell(pi, cardById(P.hand[drawIdx]))){
      activateSpell(pi, drawIdx); return true;
    }
    /* 4. summon */
    if (!P.normalSummoned){
      const best = aiBestSummon();
      if (best){
        const enemyBest = fieldMonsters(oi).reduce((a, x) => Math.max(a, x.m.fd ? 1400 : effAtk(x.m)), 0);
        const zi = best.need ? 0 : freeZone(pi, 'm');
        const defensive = best.c.atk < enemyBest && best.c.def > best.c.atk;
        summon(pi, best.hi, zi < 0 ? 0 : zi, defensive ? 'def' : 'atk', defensive, best.tributes);
        return true;
      }
    }
    /* 5. buff a monster that is about to swing */
    const buffIdx = P.hand.findIndex(id => cardById(id).fx === 's_buff');
    if (buffIdx >= 0){
      const mine = fieldMonsters(pi).filter(x => !x.m.fd && x.m.pos === 'atk')
        .sort((a, b) => effAtk(b.m) - effAtk(a.m));
      const enemy = fieldMonsters(oi).filter(x => !x.m.fd).sort((a, b) => effAtk(b.m) - effAtk(a.m));
      if (mine.length && enemy.length && effAtk(mine[0].m) <= effAtk(enemy[0].m)
          && effAtk(mine[0].m) + 700 > effAtk(enemy[0].m)){
        activateSpell(pi, buffIdx, { side:pi, i:mine[0].i }); return true;
      }
    }
    /* 5b. free value: make them discard */
    const discIdx = P.hand.findIndex(id => cardById(id).fx === 's_discard');
    if (discIdx >= 0 && O.hand.length){ activateSpell(pi, discIdx); return true; }
    /* 6. set a trap */
    const trapIdx = P.hand.findIndex(id => cardById(id).t === 'trap');
    if (trapIdx >= 0 && freeZone(pi, 's') >= 0){ setST(pi, trapIdx, freeZone(pi, 's')); return true; }
    /* 7. flip up a face-down that is now the biggest thing on the board */
    const fdz = fieldMonsters(pi).find(x => x.m.fd && x.m.sumTurn < D.turnCount &&
      effAtk(x.m) > fieldMonsters(oi).reduce((a, y) => Math.max(a, effAtk(y.m)), 0));
    if (fdz && changePosition(pi, fdz.i)) return true;

    D.ai.stage = 'battle';
    toBattle();
    return true;
  }

  if (D.ai.stage === 'battle'){
    const attackers = fieldMonsters(pi).filter(x => canAttack(pi, x.i))
      .sort((a, b) => effAtk(b.m) - effAtk(a.m));
    for (const x of attackers){
      const targets = legalAttackTargets(pi, x.i);
      if (!targets.length) continue;
      if (targets.length === 1 && targets[0] === -1){
        doAttack(pi, x.i, -1); return true;
      }
      let best = null;
      targets.forEach(t => {
        const dm = O.mz[t];
        if (!dm) return;
        const a = effAtk(x.m) + counterBonus(x.m.card, dm.card);
        const facing = dm.fd ? Math.max(dm.card.atk, dm.card.def) : (dm.pos === 'atk' ? effAtk(dm) : effDef(dm));
        const kills = a > facing;
        const dies = dm.pos === 'atk' && !dm.fd && a < effAtk(dm);
        if (dies) return;
        const gain = (kills ? 900 : 0) + (dm.pos === 'atk' && !dm.fd && kills ? a - effAtk(dm) : 0)
          - (dm.card.fx === 'thorns' ? 400 : 0);
        if (kills && (!best || gain > best.gain)) best = { t, gain };
      });
      if (best){ doAttack(pi, x.i, best.t); return true; }
    }
    D.ai.stage = 'done';
    return true;
  }

  endTurn();
  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   DUEL UI
   ═══════════════════════════════════════════════════════════════════ */
let UI = { mode:'idle', hand:-1, plan:null, need:0, tributes:[], atkZone:-1, busy:false };

function resetUI(){ UI = { mode:'idle', hand:-1, plan:null, need:0, tributes:[], atkZone:-1, busy:UI.busy }; }
function cancelUI(){ resetUI(); renderDuel(); }

function startDuel(){
  const d = activeDeck();
  if (!d){ toast('Pick a side first.'); return; }
  if (!deckIsLegal(d.list)){
    toast('That deck is not legal — needs exactly ' + DECK_SIZE + ' cards you own.');
    go('deck'); return;
  }
  /* ARM THE RECEIPT before the duel can possibly pay. wireWallet() is where
     the KARTI_XP.onAward hook that fills lastAward lives, and normally the
     home screen has long since called it — but a fresh account's first
     renderHome() detours into the starter gacha and returns before reaching
     it, so a duel entered without a full home paint would pay correctly and
     then show a result screen with no idea what was paid. Idempotent, so
     this costs nothing on every duel after the first. */
  wireWallet();
  const keys = Object.keys(STARTER_DECKS).filter(k => k !== S.side);
  const aiKey = pickOne(keys.length ? keys : Object.keys(STARTER_DECKS));
  resetUI();
  UI.busy = false;
  newDuel(d.list, aiKey, { myName:displayName().toUpperCase(), myKey:S.side, on:onDuelEvent });
  go('duel');
  D.phase = 'main';
  dlog('You go first. Main phase.');
  renderDuel();
  toast('You go first. ' + STARTER_DECKS[aiKey].name + ' is across the table.');
}

/* Shared entry point for story mode, pass-and-play and online (js/story.js, js/mp.js).
   Same engine, same duel UI as startDuel — only the opponent and the options differ.
   cfg = {myList, myName, myKey, foe:{name,list,deckKey,isAI}, decks, mode, diff, first} */
function startCustomDuel(cfg){
  resetUI();
  UI.busy = false;
  wireWallet();   /* arm the lastAward receipt — see startDuel for why */
  newDuel(cfg.myList, null, {
    myName: cfg.myName || displayName().toUpperCase(), myKey: cfg.myKey || null,
    foe: cfg.foe, decks: cfg.decks, mode: cfg.mode, diff: cfg.diff, on: onDuelEvent
  });
  go('duel');
  D.phase = 'main';
  D.ai.stage = 'main';
  dlog(cfg.first || 'Main phase.');
  renderDuel();
  return D;
}

/* ── events → juice ── */
function onDuelEvent(ev){
  /* THE LADDER, for the whole duel, in one line. The card game is the
     only thing in the box that does not report to js/party.js, and D.mode
     already says which of the four duels this was — solo, story,
     pass-and-play or online — so js/progress.js can tell them apart
     without a second hook per mode. It pays once per duel: the award is
     deduped there the same way record() is deduped in js/stats.js. */
  if (ev.type === 'over' && window.KARTI_XP && KARTI_XP.duelOver) KARTI_XP.duelOver(ev);
  /* SOUND, for the whole duel, in one line. Every interesting thing that
     happens in a duel already comes through here — summon, set, flip, attack,
     damage, destroy, draw, spell, trap, turn, phase, win, lose — so the sound
     layer reads the rules' own event stream rather than shadowing it, and
     cannot drift out of step with them. It is a no-op with sfx.js absent or
     the player's sound off, and story mode, pass-and-play and an online duel
     all arrive here too: js/story.js wraps this function rather than replacing
     it, and js/mp.js applies remote moves through the same engine.
     Deliberately NOT sounded by duelEvent: 'log', which fires on every ticker
     line, and 'peek', which opens a modal that makes its own noise. */
  if (window.KARTI_SFX){
    try {
      KARTI_SFX.duelEvent(ev);
      /* The one thing the event stream cannot tell it: a BOSS has landed.
         duelEvent only knows a monster was summoned, not that two tributes
         were paid for it — and a Level 7 arriving has to sound different from
         a Level 3 or the biggest play in the game is the same noise as the
         smallest. The thump lands first, the motif comes in under it. */
      if (ev.type === 'summon' && !ev.faceDown && ev.tributes >= 2)
        setTimeout(() => { try { KARTI_SFX.play('duel.boss'); } catch(e){} }, 150);
    } catch (e) {}
  }
  if (ev.type === 'lp'){
    const el = ev.pi === 0 ? $('#me-lp') : $('#ai-lp');
    if (el){
      el.classList.remove('hit', 'up'); void el.offsetWidth;
      el.classList.add(ev.delta < 0 ? 'hit' : 'up');
      floatDmg(el, (ev.delta < 0 ? '' : '+') + ev.delta, ev.delta < 0 ? '#FF5468' : '#3DDC84');
    }
  }
  if (ev.type === 'counter') flash(ev.text, '#FFC542');
  if (ev.type === 'attack' && ev.targetZone >= 0){
    const z = $('.zone[data-side="' + (1 - ev.pi) + '"][data-kind="m"][data-i="' + ev.targetZone + '"]');
    if (z && !REDUCED){
      const s = document.createElement('div'); s.className = 'slash';
      z.appendChild(s); setTimeout(() => s.remove(), 500);
    }
  }
  if (ev.type === 'trap') flash('TRAP! ' + ev.name, '#FF5468');
  if (ev.type === 'peek' && ev.pi === 0) showPeek(ev.hand);
  if (ev.type === 'over') setTimeout(() => showResult(ev.winner, ev.why), 700);
  if (ev.type === 'log') $('#ticker').textContent = ev.msg;
}
/* A peek effect shows YOU their hand — it never goes in the log, so the other
   seat in pass-and-play cannot scroll back and read it. */
function showPeek(hand){
  const cards = (hand || []).map(cardById).filter(Boolean);
  const box = $('#mbox');
  box.innerHTML = '<h3 style="font-size:15px;text-align:center">Their hand</h3>' +
    '<p class="tiny" style="text-align:center;margin:4px 0 10px">Only you are seeing this</p>' +
    '<div id="peek-cards" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center"></div>' +
    '<div style="margin-top:12px"><button class="btn ghost" id="peek-x" style="width:100%">Seen enough</button></div>';
  const host = $('#peek-cards');
  if (!cards.length) host.innerHTML = '<p class="muted">Empty hand. Nothing to see.</p>';
  else cards.forEach(c => host.appendChild(cardEl(c, { size:'xs' })));
  $('#peek-x').onclick = closeModal;
  $('#modal').classList.add('on');
}
function floatDmg(anchor, text, color){
  if (REDUCED) return;
  const r = anchor.getBoundingClientRect();
  const d = document.createElement('div');
  d.className = 'dmg'; d.textContent = text; d.style.color = color;
  d.style.left = (r.left + r.width / 2) + 'px';
  d.style.top = (r.top - 6) + 'px';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1050);
}

/* ── render ── */
function renderDuel(){
  if (!D) return;
  const me = D.p[0], ai = D.p[1];
  const myTurn = D.turn === 0 && !D.over;

  $('#ai-info').innerHTML =
    '<span class="who">' + esc(ai.name) + '</span>' +
    '<span class="lp mono" id="ai-lp">' + ai.lp + '</span>' +
    '<span class="lpbar"><i style="transform:scaleX(' + clamp(ai.lp / LP_START, 0, 1) + ')"></i></span>' +
    '<span class="badge">' + ico('cards', 'Cards in hand') + ai.hand.length + '</span>' +
    '<span class="badge">' + ico('pile', 'Cards left in deck') + ai.deck.length + '</span>';
  $('#me-info').innerHTML =
    '<span class="who">' + esc(me.name) + '</span>' +
    '<span class="lp mono" id="me-lp">' + me.lp + '</span>' +
    '<span class="lpbar"><i style="transform:scaleX(' + clamp(me.lp / LP_START, 0, 1) + ')"></i></span>' +
    '<span class="badge">' + ico('pile', 'Cards left in deck') + me.deck.length + '</span>' +
    '<span class="badge">' + ico('grave', 'Cards in the graveyard') + me.grave.length + '</span>';

  paintZoneRow($('#ai-st'), 1, 's');
  paintZoneRow($('#ai-mz'), 1, 'm');
  paintZoneRow($('#me-mz'), 0, 'm');
  paintZoneRow($('#me-st'), 0, 's');

  const lbl = $('#phase-lbl');
  lbl.className = 'phase ' + (D.over ? '' : myTurn ? 'you' : 'ai');
  lbl.textContent = D.over ? 'DUEL OVER'
    : (myTurn ? 'YOU · ' : ai.name + ' · ') + (D.phase === 'battle' ? 'BATTLE' : 'MAIN') + ' · T' + D.turnCount;

  paintHand();
  paintActionBar();
  $('#log-btn').onclick = logSheet;
}
function paintZoneRow(host, side, kind){
  host.innerHTML = '';
  const P = D.p[side];
  const arr = kind === 'm' ? P.mz : P.sz;
  for (let i = 0; i < ZONES; i++){
    const z = document.createElement('div');
    z.className = 'zone';
    z.dataset.side = String(side); z.dataset.kind = kind; z.dataset.i = String(i);
    const inst = arr[i];
    if (inst){
      let el;
      if (inst.fd){ el = backEl(); el.classList.add('def'); }
      else {
        /* 'xs' hides the joke/effect lines — at 5 zones a wall of 4px text is
           unreadable mush. The zone still shows art, name, ATK badge and fx icon. */
        el = cardEl(inst.card, { size:'xs' });
        if (kind === 'm' && inst.pos === 'def') el.classList.add('def');
        if (kind === 'm' && side === 0 && D.phase === 'battle' && inst.atkCount >= inst.maxAtk)
          el.classList.add('tired');
      }
      z.appendChild(el);
      if (kind === 'm' && !inst.fd){
        const v = document.createElement('span');
        v.className = 'atkv';
        v.innerHTML = inst.pos === 'atk'
          ? ico('type-monster', 'Attack') + ' ' + effAtk(inst)
          : ico('shield', 'Defence') + ' ' + effDef(inst);
        z.appendChild(v);
        if (inst.card.fx){
          const b = document.createElement('span');
          b.className = 'fxb';
          b.innerHTML = ico({ taunt:'shield', double:'type-monster', cleave:'slash',
            thorns:'spikes', shield:'dust', grow:'trend-up', grow2:'trend-up', healall:'heart',
            discard:'discard', kamikaze:'impact', leech:'drop', boom:'bomb', pierce:'arrow',
            drain:'trend-down' }[inst.card.fx] || 'bolt', effText(inst.card));
          b.title = effText(inst.card);
          z.appendChild(b);
        }
      }
    } else if (kind === 's' && !inst){
      z.innerHTML = '<span style="font-size:9px;color:var(--dim2);letter-spacing:.1em">S/T</span>';
    }
    /* highlight states.
       A zone you have just paid as a tribute is about to be empty, so it is a
       legal place to put the thing you paid for — with a full board it is the
       ONLY legal place, and it used to be the one zone not lit up. */
    if (UI.mode === 'zone' && side === 0 && kind === UI.plan.kind &&
        (!arr[i] || (kind === 'm' && UI.tributes.indexOf(i) >= 0))) z.classList.add('legal');
    if (UI.mode === 'tribute' && side === 0 && kind === 'm' && arr[i]){
      z.classList.add(UI.tributes.indexOf(i) >= 0 ? 'sel' : 'legal');
    }
    if (UI.mode === 'target' && UI.plan.targets.some(t => t.side === side && t.i === i)) z.classList.add('target');
    if (UI.mode === 'attack'){
      if (side === 0 && kind === 'm' && i === UI.atkZone) z.classList.add('sel');
      if (side === 1 && kind === 'm' && UI.targets.indexOf(i) >= 0) z.classList.add('target');
    }
    z.onclick = () => zoneClick(side, kind, i);
    host.appendChild(z);
  }
}
function paintHand(){
  const h = $('#me-hand');
  h.innerHTML = '';
  const myTurn = D.turn === 0 && !D.over;
  D.p[0].hand.forEach((id, i) => {
    const c = cardById(id);
    const w = document.createElement('div');
    w.className = 'h' + (UI.hand === i ? ' sel' : '');
    const playable = myTurn && D.phase === 'main' && handPlayable(i);
    if (!playable) w.classList.add('no');
    const el = cardEl(c, { size:'xs', tap:true });
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', c.n + ' — ' + effText(c));
    w.appendChild(el);
    w.onclick = () => handClick(i);
    h.appendChild(w);
  });
  if (!D.p[0].hand.length)
    h.innerHTML = '<p class="muted" style="padding:20px 8px">Empty hand. Bold strategy.</p>';
}
function handPlayable(i){
  const c = cardById(D.p[0].hand[i]);
  if (!c) return false;
  if (c.t === 'monster') return summonInfo(0, i).ok;
  if (c.t === 'trap') return freeZone(0, 's') >= 0;
  return canActivateSpell(0, c);
}
function paintActionBar(){
  const bar = $('#actbar');
  bar.innerHTML = '';
  const mk = (label, cls, fn, dis) => {
    const b = document.createElement('button');
    b.className = 'btn ' + (cls || '');
    b.innerHTML = label;
    if (dis) b.disabled = true; else b.onclick = fn;
    bar.appendChild(b);
    return b;
  };
  if (D.over){ mk('Back to menu', 'primary', () => { D = null; go('home'); }); return; }
  if (UI.mode === 'tribute'){
    mk('Tribute ' + UI.tributes.length + '/' + UI.need, 'ghost', null, true);
    mk('Cancel', '', cancelUI); return;
  }
  if (UI.mode === 'zone'){ mk('Pick a zone', 'ghost', null, true); mk('Cancel', '', cancelUI); return; }
  if (UI.mode === 'target'){ mk('Pick a target', 'ghost', null, true); mk('Cancel', '', cancelUI); return; }
  if (UI.mode === 'attack'){
    const direct = UI.targets.indexOf(-1) >= 0;
    if (direct) mk(ilb('impact', 'Attack directly'), 'hot', () => runAttack(UI.atkZone, -1));
    else mk('Pick a target', 'ghost', null, true);
    mk('Cancel', '', cancelUI); return;
  }
  if (D.turn !== 0 || UI.busy){ mk('Opponent is thinking…', 'ghost', null, true); return; }
  if (D.phase === 'main'){
    if (noBattleYet())
      mk(ilb('type-monster', 'No battle') + '<span class="sub">nobody attacks on turn 1</span>',
        'ghost', null, true);
    else mk(ilb('type-monster', 'To battle'), 'hot', () => { toBattle(); resetUI(); renderDuel(); });
    mk('End turn', 'ghost', () => playerEndTurn());
  } else {
    mk('End turn', 'ghost', () => playerEndTurn());
  }
}

/* ── player interaction ── */
function handClick(i){
  /* Never a dead tap: every refusal says what it is waiting for. */
  if (D.over){ toast('The duel is over.'); return; }
  if (D.turn !== 0){ toast('Hold on — it is their turn.'); return; }
  if (UI.busy){ toast('One second — that is still resolving.'); return; }
  if (UI.mode !== 'idle'){ cancelUI(); return; }
  if (D.phase !== 'main'){ toast('You can only play cards in the Main phase.'); return; }
  const c = cardById(D.p[0].hand[i]);
  UI.hand = i;
  renderDuel();
  const opts = [];
  if (c.t === 'monster'){
    const info = summonInfo(0, i);
    const need = tributesFor(c.lvl);
    if (info.ok){
      opts.push({ label: ilb('type-monster', 'Summon face-up (ATK)'),
                  act:() => beginSummon(i, 'atk', false, need) });
      opts.push({ label: ilb('shield', 'Set face-down (DEF)'),
                  act:() => beginSummon(i, 'def', true, need) });
    } else opts.push({ label:info.why, dis:true });
  } else if (c.t === 'spell'){
    if (canActivateSpell(0, c))
      opts.push({ label: ilb('type-spell', 'Activate'), act:() => beginSpell(i, c) });
    else opts.push({ label:'Nothing to use it on right now.', dis:true });
    if (freeZone(0, 's') >= 0)
      opts.push({ label: ilb('type-trap', 'Set face-down'), act:() => beginSet(i) });
  } else {
    if (freeZone(0, 's') >= 0)
      opts.push({ label: ilb('type-trap', 'Set face-down'), act:() => beginSet(i) });
    else opts.push({ label:'No free spell/trap zone.', dis:true });
  }
  openSheet(
    '<h3>' + ico(markIcon(c), markLabel(c)) + ' ' + esc(c.n) + '</h3>' +
    '<p class="muted" style="font-style:italic">“' + esc(c.txt) + '”</p>' +
    (effText(c) ? '<p style="color:#7EE0A0;font-size:12.5px;margin-top:6px">' + ico('bolt') + ' ' +
      esc(effText(c)) + '</p>' : '') +
    (c.t === 'monster' ? '<p class="tiny" style="margin-top:6px">Level ' + c.lvl + ' · ' + c.atk + '/' + c.def +
      ' · ' + (tributesFor(c.lvl) ? tributesFor(c.lvl) + ' tribute(s)' : 'no tribute') + '</p>' : '') +
    '<div class="opts" id="hs-opts"></div>');
  const host = $('#hs-opts');
  opts.forEach(o => {
    const b = document.createElement('button');
    b.className = 'btn ' + (o.dis ? 'ghost' : '');
    b.innerHTML = o.label;
    if (o.dis) b.disabled = true; else b.onclick = () => { closeSheet(); o.act(); };
    host.appendChild(b);
  });
  const cx = document.createElement('button');
  cx.className = 'btn ghost'; cx.textContent = 'Cancel';
  cx.onclick = () => { closeSheet(); cancelUI(); };
  host.appendChild(cx);
}
function beginSummon(handIdx, pos, fd, need){
  UI.plan = { kind:'m', handIdx, pos, fd, need };
  UI.hand = handIdx;
  if (need > 0){
    UI.mode = 'tribute'; UI.need = need; UI.tributes = [];
    toast('Tap ' + need + ' of your monsters to tribute.');
  } else {
    UI.mode = 'zone';
  }
  renderDuel();
}
function beginSet(handIdx){
  UI.plan = { kind:'s', handIdx };
  UI.hand = handIdx; UI.mode = 'zone';
  renderDuel();
}
function beginSpell(handIdx, card){
  if (!spellNeedsTarget(card)){
    activateSpell(0, handIdx);
    resetUI(); renderDuel(); return;
  }
  UI.plan = { kind:'spell', handIdx, targets: spellTargets(0, card) };
  UI.mode = 'target';
  toast('Pick a target.');
  renderDuel();
}
function zoneClick(side, kind, i){
  if (D.over){ toast('The duel is over.'); return; }
  if (UI.busy){ toast('Hold on — something is still resolving.'); return; }
  const P = D.p[0];

  if (UI.mode === 'tribute'){
    if (side !== 0 || kind !== 'm'){ toast('Tap ' + UI.need + ' of YOUR OWN monsters to tribute.'); return; }
    if (!P.mz[i]){ toast('That zone is empty — a tribute has to be a monster you own.'); return; }
    const at = UI.tributes.indexOf(i);
    if (at >= 0) UI.tributes.splice(at, 1);
    else if (UI.tributes.length < UI.need) UI.tributes.push(i);
    else { toast('That is already ' + UI.need + ' — tap one again to take it back.'); return; }
    if (UI.tributes.length === UI.need){ UI.mode = 'zone'; toast('Now pick a zone for it.'); }
    renderDuel(); return;
  }
  if (UI.mode === 'zone'){
    if (side !== 0 || kind !== UI.plan.kind){
      toast(UI.plan.kind === 'm' ? 'Pick one of YOUR monster zones.' : 'Pick one of YOUR spell/trap zones.');
      return;
    }
    const arr = kind === 'm' ? P.mz : P.sz;
    const willFree = kind === 'm' ? UI.tributes.indexOf(i) >= 0 : false;
    if (arr[i] && !willFree){ toast('That zone is taken. Pick an empty one.'); return; }
    if (kind === 'm'){
      const r = summon(0, UI.plan.handIdx, i, UI.plan.pos, UI.plan.fd, UI.tributes);
      if (!r.ok) toast(r.why);
    } else {
      const c = cardById(P.hand[UI.plan.handIdx]);
      const r = setST(0, UI.plan.handIdx, i);
      if (!r.ok) toast(r.why); else if (c.t === 'trap') toast('Trap set. It arms on their turn.');
    }
    resetUI(); renderDuel(); return;
  }
  if (UI.mode === 'target'){
    const t = UI.plan.targets.find(x => x.side === side && x.i === i);
    if (!t){ toast('Not a legal target for that card. The lit zones are the ones you can pick.'); return; }
    const r = activateSpell(0, UI.plan.handIdx, { side:t.side, i:t.i });
    if (!r.ok) toast(r.why);
    resetUI(); renderDuel(); return;
  }
  if (UI.mode === 'attack'){
    if (side === 1 && kind === 'm' && UI.targets.indexOf(i) >= 0){ runAttack(UI.atkZone, i); return; }
    /* a tap on an enemy monster that is not a legal target is a question, not a
       cancel — say why it is not, and keep the attack you had lined up */
    if (side === 1 && kind === 'm' && D.p[1].mz[i]){
      const taunt = tauntZone(1);
      const A = D.p[0].mz[UI.atkZone];
      toast(taunt >= 0 ? 'Taunt — you have to go through that one first.'
        : (A && A.monsterOnly) ? A.card.n + ' has already been at that one. It needs a different monster.'
        : 'Not a legal target.');
      return;
    }
    cancelUI();
    return;
  }

  /* idle taps on your own field */
  if (D.turn !== 0){ toast('Their turn. Sit on your hands.'); return; }
  if (side === 0 && kind === 'm' && P.mz[i]){
    const m = P.mz[i];
    if (D.phase === 'battle'){
      if (!canAttack(0, i)){
        toast(m.fd ? 'Face-down monsters cannot attack.'
          : m.pos !== 'atk' ? 'It is in defence position.'
          : P.noAttackTurn === D.turnCount ? 'Your monsters are stunned this turn.'
          : 'It has already attacked.');
        return;
      }
      const targets = legalAttackTargets(0, i);
      if (!targets.length){
        toast(!m.monsterOnly ? 'Nothing it can legally attack.'
          : fieldMonsters(1).length ? m.card.n + ' has already been at every monster over there.'
          : m.card.n + ' gets one swing at an empty table — the second one is for monsters.');
        return;
      }
      UI.mode = 'attack'; UI.atkZone = i; UI.targets = targets;
      if (tauntZone(1) >= 0) toast('Taunt — you must hit that one first.');
      renderDuel();
      return;
    }
    /* main phase — position change */
    openSheet(
      '<h3>' + esc(m.card.n) + '</h3>' +
      (effText(m.card) ? '<p style="color:#7EE0A0;font-size:12.5px">' + ico('bolt') + ' ' +
        esc(effText(m.card)) + '</p>' : '') +
      '<p class="tiny" style="margin-top:6px">' + (m.fd ? 'Face-down' : m.pos.toUpperCase() + ' position') +
        ' · ' + m.card.atk + '/' + m.card.def + (m.mod ? ' (' + (m.mod > 0 ? '+' : '') + m.mod + ')' : '') + '</p>' +
      '<div class="opts">' +
        '<button class="btn" id="zs-pos"' +
          (m.sumTurn === D.turnCount || m.atkCount > 0 ? ' disabled' : '') + '>' +
          ilb('refresh', m.fd ? 'Flip face-up (ATK)'
                              : 'Switch to ' + (m.pos === 'atk' ? 'DEFENCE' : 'ATTACK')) + '</button>' +
        '<button class="btn ghost" id="zs-close">Close</button></div>');
    $('#zs-close').onclick = closeSheet;
    const pb = $('#zs-pos');
    if (pb && !pb.disabled) pb.onclick = () => { closeSheet(); changePosition(0, i); renderDuel(); };
  }
}
async function runAttack(zi, target){
  UI.busy = true;
  resetUI(); UI.busy = true;
  renderDuel();
  /* If anything in here throws, UI.busy must still come back down. Left stuck
     true the action bar renders only the disabled "Opponent is thinking…" — no
     End turn, no Cancel — and the only way out of the duel is to forfeit it. */
  try {
    const r = doAttack(0, zi, target);
    if (!r.ok) toast(r.why);
    await wait(520);
  } catch (e) {
    toast('Something went wrong with that attack.');
    if (window.console) console.error('runAttack', e);
  } finally {
    UI.busy = false;
    renderDuel();
  }
}
async function playerEndTurn(){
  if (UI.busy) return;
  UI.busy = true;
  resetUI(); UI.busy = true;
  renderDuel();
  /* endTurn() resolves the standby effects, the discards, the stolen monsters
     and the whole of the next player's draw step. If any of that throws while
     UI.busy is up, the action bar has nothing on it but a disabled "Opponent is
     thinking…" and the only way out of the duel is to forfeit it. */
  try { endTurn(); }
  catch (e){
    if (window.console) console.error('endTurn', e);
    toast('Something went wrong ending the turn.');
    UI.busy = false; resetUI(); renderDuel();
    return;
  }
  renderDuel();
  /* Pass-and-play and online take the turn over here instead of the local AI.
     Deliberately NO re-render afterwards: the hook owns the screen from this
     point (the pass-the-phone curtain wipes the hand, and re-painting it would
     put the previous player's cards back on the display behind the curtain). */
  if (window.KHOOK && KHOOK.afterEndTurn && KHOOK.afterEndTurn()){
    UI.busy = false; resetUI(); return;
  }
  await runAITurn();
}
async function runAITurn(){
  let guard = 0;
  /* Same reasoning as runAttack: a throw inside the opponent's turn used to
     leave UI.busy true forever, and the only escape was forfeiting. */
  try {
    while (!D.over && D.turn === 1 && guard++ < 120){
      await wait(560);
      aiStep();
      renderDuel();
    }
  } catch (e) {
    toast('The opponent got confused. Your turn.');
    if (window.console) console.error('runAITurn', e);
  } finally {
    /* However the loop ended — a throw, or the guard running out because the AI
       got itself into a decision it kept re-making — the turn has to come back
       to the player. Leaving it on seat 1 renders the disabled "Opponent is
       thinking…" for good, with forfeit as the only way out. */
    if (D && !D.over && D.turn === 1){
      try { endTurn(); }
      catch (_) { try { endDuel(0, D.p[1].name + ' cannot finish the turn.'); } catch (__) {} }
    }
    UI.busy = false;
    resetUI();
    renderDuel();
  }
}
function logSheet(){
  const lines = D.log.slice(-40).reverse()
    .map(l => '<div class="logline">' + esc(l.msg) + '</div>').join('');
  openSheet(
    '<h3>Battle log</h3>' +
    '<div style="max-height:44vh;overflow-y:auto;margin-top:8px">' + lines + '</div>' +
    '<div class="opts">' +
      (D.over ? '' : '<button class="btn ghost" id="lg-quit">' +
        ilb('flag', 'Forfeit the duel') + '</button>') +
      '<button class="btn ghost" id="lg-close">Close</button></div>');
  $('#lg-close').onclick = closeSheet;
  const q = $('#lg-quit');
  if (q) q.onclick = () => {
    closeSheet(); netSend('forfeit', null);
    endDuel(1, D.p[0].name + ' walks away from the table.'); renderDuel();
  };
}

/* ── result & rewards ── */
function showResult(winner, why){
  /* Story mode / pass-and-play / online own their own end-of-duel screen and
     rewards — if the hook handles it, the normal solo payout must not fire. */
  if (window.KHOOK && KHOOK.result && KHOOK.result(winner, why)) return;
  const won = winner === 0;
  /* THE ECONOMY CHANGED HERE: the duel no longer mints coins (coins
     come out of loot boxes only — js/progress.js §7b). The CHIPS for
     this duel were already paid by the award that fired on the 'over'
     event, exactly like every other game in the box; what stays local
     is the pack a solo win has always paid, and the record. */
  if (won){ S.rec.w++; S.packs += 1; }
  else { S.rec.l++; }
  save();
  /* the receipt: what that award actually paid, if it landed (it fires
     700ms before this card goes up; 10s is generous) */
  const pay = (lastAward && Date.now() - lastAward.at < 10000 &&
               String(lastAward.game || '').indexOf('cards') === 0) ? lastAward : null;
  const payChips = pay ? (pay.chips | 0) + (pay.chipsLevel | 0) : 0;
  /* THE PAYOUT SOUND. duel.win / duel.lose has already gone off on the
     `over` event; this is the chips landing after it, which is a separate
     pleasure and the reason anybody plays another one. Sequenced behind
     the result screen so the two do not stack. A loss still pays a little
     and still counts them — quieter, and with no chime on the end. It fires
     on BOTH result surfaces below: the shared podium's own reward cues
     ('reward.drop') have no sample in js/sfx.js, so without this the chips
     would land silently there. */
  if (window.KARTI_SFX){
    const S2 = window.KARTI_SFX;
    setTimeout(() => {
      try {
        S2.run('coin.tick', won ? 6 : 3, 65, { gain: won ? 0.7 : 0.45 });
        if (won) setTimeout(() => { try { S2.play('ui.coin'); } catch(e){} }, 430);
      } catch(e){}
    }, 420);
  }
  /* THE SHARED WINNER SCREEN. Every other game in the box finishes on
     IR-REBBIEĦ; the solo duel was the last holdout because its win screen
     carries something the podium's two-button contract has no slot for —
     the "Open your pack" button, which IS the prize of a solo win. The
     resolution: the podium's caller-settable primary button becomes the
     pack button on a win (so the pack ride's the module's PUBLIC contract
     and cannot be lost to an internal restyle), and "Duel again" is added
     as a secondary button after the fact — see resultRebbieh for why that
     is safe. If the module is missing, or anything about it throws, the
     duel's own classic result card below still works exactly as it always
     has, so the worst possible failure is the old screen, never no screen. */
  if (resultRebbieh(won, why, pay, payChips)) return;
  const box = $('#mbox');
  box.innerHTML =
    '<div class="result">' +
      '<div class="big ' + (won ? 'win' : 'lose') + '">' + (won ? 'REBAH!' : 'TELFA') + '</div>' +
      '<p class="tiny">' + (won ? 'You won' : 'You lost') + '</p>' +
      '<p class="muted">' + esc(why) + '</p>' +
      '<p class="muted" style="font-style:italic">' + esc(won
        ? pickOne(['Buy them a Cisk. Then do it again.',
                   'They will tell everyone the deck was rigged.',
                   'Champion of absolutely nothing. Well done.'])
        : pickOne(['Even the Kunjata is disappointed.',
                   'Blame the traffic. Everyone else does.',
                   'Shuffle better. Or blame the cards.'])) + '</p>' +
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
        (payChips ? '<span class="pill">' + chipIco('Chips') + '+' + payChips + '</span>' : '') +
        (pay && pay.xp ? '<span class="pill">' + ico('star', 'XP') + '+' + pay.xp + ' XP</span>' : '') +
        (won ? '<span class="pill">' + ico('pack', 'Packs') + '+1 pack</span>' : '') +
        '<span class="pill">' + ico('trophy', 'Record') + S.rec.w + '–' + S.rec.l + '</span>' +
      '</div>' +
      '<div style="display:grid;gap:9px;width:100%;margin-top:4px">' +
        (won ? '<button class="btn primary" id="r-pack">' + ilb('pack', 'Open your pack') +
          '</button>' : '') +
        '<button class="btn hot" id="r-again">' + ilb('type-monster', 'Duel again') + '</button>' +
        '<button class="btn ghost" id="r-home">Back to menu</button>' +
      '</div>' +
    '</div>';
  $('#modal').classList.add('on');
  const rp = $('#r-pack');
  if (rp) rp.onclick = () => { closeModal(); D = null; go('pack'); };
  $('#r-again').onclick = () => { closeModal(); startDuel(); };
  $('#r-home').onclick = () => { closeModal(); D = null; go('home'); };
}

/* ═══ the solo duel on IR-REBBIEĦ — the shared AAA winner screen ═══
   Returns true when the podium went up, false when the caller should fall
   back to the classic result card. Never throws past itself: an end-of-duel
   screen must never be able to take the duel down.

   WHO PAYS, AND HOW OFTEN. Nothing here pays anything. The chips and XP
   were paid by js/progress.js's duelOver() the instant the 'over' event
   fired (700ms before this runs), and the pack + record were written by
   showResult just above. This function only DRAWS the receipt (`pay` is
   the award that landed, captured through KARTI_XP.onAward), so putting
   the podium up — or tearing it down, or it failing — can never move money.

   THE PACK BUTTON PROBLEM, and why it is solved this way. The podium's
   public contract has exactly two actions: a primary (onPlayAgain, with a
   caller-settable label + caption) and a ghost (onLeave). A solo duel win
   needs three: Open your pack / Duel again / Back to menu — and rebbieh.js
   is frozen, so the contract cannot grow a third slot. The split:
     · the PACK takes the primary. It is the whole point of winning a solo
       duel, it was the primary on the old screen too, and riding the public
       contract means no restyle of rebbieh's internals can ever lose it.
     · DUEL AGAIN is injected as a ghost button just above Leave, copying
       the podium's own button classes. That is deliberately the one piece
       that leans on rebbieh's internals, because it is the one piece whose
       loss is survivable: if the class names or the actions container ever
       change, the injection quietly does nothing and the screen is still
       complete — pack, podium, rewards, Leave — rather than broken.
   On a LOSS there is no pack, the contract fits exactly, and the primary
   is Duel again like every other game's "Play again". */
function resultRebbieh(won, why, pay, payChips){
  const R2 = window.KARTI_REBBIEH;
  if (!R2 || !R2.show || !D) return false;
  /* the duel's own words stay English like the rest of this file; the winner
     screen is the one surface every game shares, so its strings follow the
     app's bilingual rule through KARTI_LANG — the same split dama.js makes. */
  const RT = (en, mt) => (window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en);
  try {
    /* THE ROWS — winner first, which is what the podium sorts by anyway.
       The score column is the Life Points still standing, clamped at zero
       (the engine can drive a loser negative), so a wipe-out reads 8000–0
       and a squeaker reads 900–0. Borders are fixed like dama's sets:
       you in gold, the opposition in ruby. Avatars stay null on purpose —
       rebbieh draws its coloured initials tile, the house norm for a
       solo table (dama, serp, klabb all do the same). */
    const seats = [
      { name: D.p[0].name, you: true,
        score: Math.max(0, D.p[0].lp) + ' LP', border: 'gold' },
      { name: D.p[1].name, bot: !!D.p[1].isAI,
        score: Math.max(0, D.p[1].lp) + ' LP', border: 'ruby' }
    ];
    const rows = (won ? seats : [seats[1], seats[0]])
      .map((r, i) => Object.assign(r, { place: i + 1 }));

    /* THE XP BAR, with REAL fractions. Most callers hand rebbieh the house
       "near-full" guess because level maths is progress.js's business — but
       progress.js publishes its economy read-only through KARTI_XP.ECON, so
       the duel can show the bar exactly where it truly is. A level-up starts
       the bar at zero (honest: this is the new level's bar). If ECON is not
       there the near-full guess stands in, same as everyone else. */
    let xp = null;
    if (pay){
      let pct = pay.levelled ? 1 : 0.7;
      let pctBefore = 0;
      try {
        const eco = window.KARTI_XP && KARTI_XP.ECON;
        const needN = eco ? eco.need(pay.level) : 0;
        if (eco && isFinite(needN) && needN > 0){
          const into = (pay.total | 0) - eco.cum(pay.level);
          pct = Math.max(0, Math.min(1, into / needN));
          pctBefore = pay.levelled ? 0
            : Math.max(0, Math.min(1, (into - (pay.xp | 0)) / needN));
        }
      } catch (e){}
      xp = { level: pay.level, gained: pay.xp | 0, leveledUp: !!pay.levelled,
             pct, pctBefore };
    }

    R2.show({
      lang: window.KARTI_LANG ? KARTI_LANG.lang() : 'en',
      reduced: REDUCED,
      /* the duel's own words for its own verdict — same pair the classic
         card has always shouted */
      title: won ? 'REBAĦ!' : 'TELFA',
      /* the engine's reason plus the lifetime record, which the old card
         carried as a pill and the podium has no other slot for */
      subtitle: why + ' · ' + S.rec.w + '–' + S.rec.l,
      rows,
      xp,
      /* the reward block draws ONLY what was genuinely paid — the same
         receipt the old pills read, chips + level-up chips folded together
         exactly as before, and the winner's XP slice on its own ribbon.
         The pack is NOT in here: rebbieh's reward vocabulary is xp/chips/
         coins/pot, and the pack's home is the primary button below. */
      reward: pay ? { xp: pay.xp | 0, chips: payChips,
                      wonBonus: pay.wonBonus | 0 } : null,
      /* 'game.win' is filtered out: the 'over' event already sounded
         duel.win/duel.lose through KARTI_SFX.duelEvent, and the podium
         raising must not gong the same win twice. Everything else (taps,
         the XP fill, a level-up) passes through. */
      sound: id => {
        if (id === 'game.win') return;
        try { if (window.KARTI_SFX) KARTI_SFX.play(id, { gain: 0.6 }); } catch (e){}
      },
      playAgainLabel: won ? RT('Open your pack', 'Iftaħ il-pakkett tiegħek')
                          : RT('Duel again', 'Erġa\' lgħab'),
      /* the caption keeps the pack HONEST on the screen itself — the reward
         cards cannot show it, so the words under the gold button do */
      playAgainCaption: won
        ? RT('Your win pays one card pack — it is waiting.',
             'Ir-rebħa tiegħek tħallas pakkett tal-karti — qed jistenniek.')
        : pickOne(['Even the Kunjata is disappointed.',
                   'Blame the traffic. Everyone else does.',
                   'Shuffle better. Or blame the cards.']),
      onPlayAgain: won ? () => { D = null; go('pack'); }
                       : () => { startDuel(); },
      onLeave: () => { D = null; go('home'); }
    });

    /* THE THIRD BUTTON — Duel again, on a win. show() builds #kr-root
       synchronously, so the actions column exists right now. Injected with
       the podium's own classes so it inherits whatever the podium looks
       like today; guarded so that if rebbieh's internals ever rename, the
       whole block is a silent no-op and the screen above stands complete.
       The button hides the podium through the PUBLIC hide() (which also
       cancels rebbieh's timers) before dealing the next duel. */
    if (won){
      try {
        const acts = document.querySelector('#kr-root .kr-acts');
        const leave = acts && acts.querySelector('#kr-leave');
        if (acts && leave){
          const b = document.createElement('button');
          b.id = 'kr-duel-again';
          b.className = 'kr-btn kr-ghost';
          b.textContent = RT('Duel again', 'Erġa\' lgħab');
          let hit = false;      /* a double-tap must not deal two duels */
          b.onclick = () => {
            if (hit) return; hit = true;
            try { R2.hide(); } catch (e){}
            startDuel();
          };
          acts.insertBefore(b, leave);
        }
      } catch (e){}
    }
    return true;
  } catch (e){
    /* half a podium is worse than the old card — take down whatever went
       up and let the classic result modal handle the whole job */
    try { R2.hide(); } catch (_){}
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════════ */
function wireStatic(){
  $('#scrim').addEventListener('click', () => { closeSheet(); if (UI.mode !== 'idle') cancelUI(); });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  /* No #btn-duel any more — Story Mode and Multiplayer are the only ways into a
     duel. startDuel() itself stays: story.js, mp.js and the debug surface call it. */
  $('#btn-packs').onclick = () => go('pack');
  /* Collection is no longer a tab — the cards chip on Home opens it (wired in
     renderHome). The #coll screen still exists and #coll-back returns home. */
  $('#btn-deck').onclick  = () => { dbDeck = null; go('deck'); };
  /* The Guide tab became the FRIENDS tab. The tutorial still exists and is
     opened from Home; friends.js owns #btn-friends / #scr-friends. This wiring
     is a safe fallback in case friends.js has not booted yet. */
  const fb = $('#btn-friends');
  if (fb && !fb.onclick) fb.onclick = () => {
    if (window.KARTI_FRIENDS && KARTI_FRIENDS.open) KARTI_FRIENDS.open();
    else go('friends');
  };
  $('#pack-back').onclick = () => go('home');
  $('#coll-back').onclick = () => go('home');
  $('#deck-back').onclick = deckBack;
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape'){ closeSheet(); closeModal(); if (UI.mode !== 'idle') cancelUI(); }
  });
}
/* The 245 generated images land later at art/<card-id>.jpg and art/ui/<name>.
   Rather than hard-coding a switch (and firing 200 404s if they are not there
   yet) we probe one file: if it loads, the art is present and every card and
   board element lights up. Emoji and CSS remain the fallback either way. */
function detectArt(){
  /* Re-runnable. Each probe used to be a single fire-and-forget Image() with no
     onerror: on the installed PWA the probes fire at cold launch, which is
     exactly when the radio may still be waking up (or the SW cache was just
     wiped by a version bump), and ONE silent failure killed all the artwork
     for the whole session — flat dark home screen, everything else fine.
     Now a failed probe retries with backoff, an exhausted probe is re-armed by
     the online/pageshow/visibility listeners below, and a probe that already
     succeeded is never re-fetched. */
  const st = detectArt._st || (detectArt._st = {});
  const probe = (key, url, hit) => {
    if (st[key]) return;                       /* 'done' or a chain in flight */
    st[key] = 'trying';
    let tries = 0;
    const attempt = () => {
      if (st[key] === 'done') return;
      const i = new Image();
      i.onload = () => { st[key] = 'done'; hit(); };
      i.onerror = () => {
        tries++;
        if (tries <= 6) setTimeout(attempt, Math.min(20000, 900 * Math.pow(2, tries)));
        else st[key] = 0;                      /* give up until the next re-arm */
      };
      i.src = url;
    };
    attempt();
  };
  probe('base', 'art/petard.jpg', () => {
    ART.base = 'art/';
    if (current === 'coll') renderCollection();
    if (D) renderDuel();
  });
  const ui = { '--art-playmat':'art/ui/board.jpg', '--art-zone-m':'art/ui/zone-monster.png',
               '--art-zone-s':'art/ui/zone-spell.png', '--art-pile-deck':'art/ui/pile-deck.png',
               '--art-pile-grave':'art/ui/pile-grave.png', '--art-pile-banish':'art/ui/pile-banish.png',
               '--art-cardback':'art/ui/cardback.jpg', '--art-home':'art/ui/home-bg.jpg' };
  Object.keys(ui).forEach(v => probe(v, ui[v], () => {
    /* MUST be absolute: a relative url() inside a custom property is resolved
       against the stylesheet that *uses* it (css/extra.css), not the document,
       which silently turns art/ui/x.jpg into css/art/ui/x.jpg. */
    const abs = new URL(ui[v], location.href).href;
    document.documentElement.style.setProperty(v, 'url("' + abs + '")');
    ART.ui[v.replace('--art-', '')] = ui[v];
    document.documentElement.classList.add('art' + v.replace('--art', ''));
  }));
  /* HOME HERO — the front-door backdrop. Optional art dropped by the
     coordinator; if it never loads, html.has-hero is never added and the home
     keeps its existing --art-home (home-bg.jpg → designed gradient). */
  probe('home-hero', 'art/ui/home-hero.png', () => {
    const abs = new URL('art/ui/home-hero.png', location.href).href;
    document.documentElement.style.setProperty('--home-hero', 'url("' + abs + '")');
    document.documentElement.classList.add('has-hero');
  });
  /* SPIN WHEEL — the medallion art on the home daily-spin badge. Swapped in
     only once it has decoded, over the drawn star, so a missing file is a
     clean fallback rather than a broken image. The resolved URL is remembered
     (ART.spinWheel) so renderDailySpinBtn() can re-attach it every time it
     re-creates the badge, without depending on the one-shot probe firing again. */
  probe('spin-wheel', 'art/ui/spin-wheel.png', () => {
    ART.spinWheel = new URL('art/ui/spin-wheel.png', location.href).href;
    applySpinWheelArt();
  });
}
/* Put the wheel art onto the badge's medallion if it has loaded and the badge
   is on screen and does not already have it. Called by the probe on first load
   and by renderDailySpinBtn() every time the badge is re-created. */
function applySpinWheelArt(){
  if (!ART.spinWheel) return;
  const holder = document.querySelector('#btn-dailyspin .ds-art');
  if (holder && !holder.querySelector('img')){
    const im = new Image();
    im.src = ART.spinWheel; im.alt = '';
    holder.appendChild(im);
  }
}
/* A probe that ran out of retries comes back the moment the network does, or
   when the app returns to the foreground — iOS standalone freezes timers in the
   background, so a mid-backoff chain may simply never have fired. All three
   re-arms are cheap no-ops once every probe has succeeded. */
window.addEventListener('online', () => detectArt());
window.addEventListener('pageshow', () => detectArt());
document.addEventListener('visibilitychange', () => { if (!document.hidden) detectArt(); });
/* url for a named UI image (boss portraits, pack faces...), null when absent.
   Callers must always keep their emoji/CSS fallback for when art is missing. */
function uiArt(name, file){
  if (!ART.base) return null;                 /* art pack not on this deploy */
  return 'art/ui/' + file;
}
function boot(){
  wireStatic();
  detectArt();
  /* sync.js owns the reset panel and knows nothing about local profiles; this
     is the one line that joins the two. See relocalPassword().

     WHY THIS RETRIES INSTEAD OF ASKING ONCE. index.html's loader appends
     js/game.js at position 8 and js/sync.js at position 17, so at boot()
     window.KARTI_SYNC DOES NOT EXIST YET. The original `if (window.KARTI_SYNC)`
     therefore silently attached nothing, and the symptom was ugly and remote
     from the cause: a player reset their password, the SERVER took it — new
     hash, fresh salt, sessions cleared — and then their own phone still said
     "wrong password", because loginAccount() checks the LOCAL profile first
     and it had never been re-keyed. It worked from any other device, which is
     exactly the sort of clue that sends you hunting in the wrong place.
     Caught for real on the owner's own account, build 283. */
  (function wireReset(tries){
    try {
      if (window.KARTI_SYNC){
        KARTI_SYNC.onReset = r => { try { relocalPassword(r && r.u, r && r.name, r && r.pass); }
                                    catch(e){} };
        return;
      }
    } catch(e){}
    /* sync.js is later in the loader; give it a moment rather than giving up.
       ~5s of tries, then stop — a build without sync.js is a valid build and
       must not spin for ever. */
    if (tries > 0) setTimeout(() => wireReset(tries - 1), 100);
  })(50);
  const act = lsGet(ACTIVE_KEY, null);
  const users = getUsers();
  if (act && (act === GUEST || users[act])){ ACTIVE = act; load(); go('home'); }
  else { ACTIVE = null; authMode = 'menu'; go('auth'); }
}
/* test / debug surface — used by the headless verification harness.
   cards.js declares its data with `const`, which is NOT a window property,
   so re-export the references here for anything outside this script scope.
   PUBLISHED BEFORE boot() RUNS (the call is below this object, not above):
   boot()'s first renderHome() has js/progress-ui.js paint the profile pill,
   and that paint asks window.KARTI for the save and the display name — with
   the old order it found neither on the very first frame and drew the
   name-hash face instead of the chosen one, which then visibly swapped when
   anything repainted. One more of the "refreshes three times" flickers. */
window.KARTI = {
  get S(){ return S; }, get D(){ return D; }, set D(v){ D = v; },
  get UI(){ return UI; },
  CARDS, STARTER_DECKS, ATTR, RARITY, COUNTERS, COUNTER_BONUS, LP_START, DECK_SIZE, MAX_COPIES,
  ZONES, HAND_LIMIT, NET, setRNG, ART, artImg, artURL, uiArt, detectArt,
  /* coinIco/chipIco are the painted-currency helpers from build 216. That
     sweep added `K.coinIco(...)` call sites to story.js but never put the
     helper on this object, so IR-RAKKONT threw on its first boss row and the
     Story screen has not opened since — one of the two big doors on Home,
     dead, silently. Exported now; chipIco rides along so the pair cannot
     drift apart the same way twice. */
  ico, ilb, coinIco, chipIco, ATTR_ICON, CAT_ICON, RARITY_ICON, markIcon, markLabel,
  cardById, tributesFor, openPack, deckToCards, effText, FX_TEXT,
  newDuel, aiStep, doAttack, summon, summonInfo, setST, activateSpell, endTurn, toBattle,
  beginTurn, drawCard, damage, healLP, destroyMonster, effAtk, effDef, legalAttackTargets,
  canAttack, changePosition, deckIsLegal, grantStarter, addCard, save, load, go,
  switchTo, createAccount, loginAccount, upgradeGuest, GUEST, SHA256, noBattleYet,
  /* accounts + settings */
  logout, profileSheet, settingsSheet, upgradeSheet, cloudLink, cloudStatus, cloudLine,
  signInFromCloud, authAction, setPref, applyPrefs, get PREFS(){ return PREFS; },
  /* web push — exported for the headless verification harness */
  pushState, pushRowHTML, pushToggleTap, pushSubscribe, pushUnsubscribe,
  pushBase, pushSupported, pushSession, pushB64ToU8, pushOpenFrom,
  get REDUCED(){ return REDUCED; }, get ACTIVE(){ return ACTIVE; },
  fieldMonsters, freeZone, tauntZone, counterBonus, spellTargets, canActivateSpell,
  spellNeedsTarget, trapPriority, deckTotal, deckById, activeDeck, displayName,
  cardEl, backEl, rarityFx, particles, cardViewModal, starterPrice, chooseSide, afterLogin,
  /* the reveal kit, so the starter unboxing runs the identical choreography
     off the identical table instead of a second copy that drifts */
  FX_HTML, REVEAL, RTIER, revConf, setFxColor, fxGo, fxHost, shineEl, shineGo, holdFor,
  /* Inventory landing + the builder behind it */
  renderInventory, renderDeckBuilder, renderDeckPicker, showInventory, openBuilder,
  deckOptions, newDeckSheet, deckMenu, saveDeck, commitDraft, fixDeckState, deckGlyph,
  renderDuel, renderHome, startDuel, startCustomDuel, runAITurn, playerEndTurn, endDuel,
  showResult, DEFAULT_STATE, resetUI, onDuelEvent, dlog,
  toast, flash, openSheet, closeSheet, openModal, closeModal, esc, wait, $, $$, shuffle, pickOne,
  /* the Store — exported for the headless verification harness */
  _store: {
    SPIN_TABLE, SPIN_GAP_MS, COSM_LEVEL_MAX, SPIN_SEG,
    spinState, spinRoll, doSpin, spinDayKey, spinNextAt, spinRestAngle,
    storeBuyables, storeLadder, buyCosmetic, cosmPrice, cosmOwned, grantCosmetic,
    renderSpinTab, renderCosmTab, renderExclTab, exclAllRows, updateSpinBadge, spinResult,
    /* the chips economy's screens — for the headless harness */
    renderChipsTab, buyBoxTap, boxPop, spinGrant, grantChips,
    get tab(){ return storeTab; }, set tab(v){ storeTab = v; }
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
