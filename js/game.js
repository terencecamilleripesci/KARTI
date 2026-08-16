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
   These are LOCAL profiles on one device — never a real secure account. */
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
/* Two doors out of a profile, and the difference is the cloud session:
     'switch' — step off this profile, keep the phone signed in to the cloud
                account, so stepping back on is instant and silent;
     'out'    — sign this phone out of the cloud too (best-effort upload first).
   NEITHER touches a single byte of any save. Both land on the same screen. */
function logout(mode){
  if (window.KARTI_SYNC){
    if (mode === 'out'){
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
  owned:{}, dust:0, coins:300, packs:1,
  decks:[], activeDeck:null, starters:[], side:null,
  rec:{ w:0, l:0 },
  /* which of the four sets packs come from, and the pity counters that stop a
     player sitting on a long dry run. load() Object.assigns over these defaults,
     so an old save picks them up without a migration. */
  packSet:null, pity:{ leg:0, epic:0, packs:0 }
});
let S = DEFAULT_STATE();

function load(){
  const o = lsGet(saveKeyFor(ACTIVE), null);
  S = Object.assign(DEFAULT_STATE(), o || {});
  S.rec = Object.assign({ w:0, l:0 }, S.rec || {});
  S.owned = S.owned || {}; S.decks = S.decks || []; S.starters = S.starters || [];
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

function addCard(id){
  const card = cardById(id);
  if (!card) return { isNew:false, dusted:0 };
  const was = ownedCount(id);
  if (was >= MAX_COPIES){
    const d = RARITY[card.r].dust; S.dust += d;
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
       (opts.dupeDust ? '<i>' + ico('dust') + '+' + opts.dupeDust + '</i>' : '') +
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
             : 'Not in your collection · dust value ' + (RARITY[card.r] ? RARITY[card.r].dust : 0)) + '</p>';
  wrap.appendChild(meta);
  const btn = document.createElement('button');
  btn.className = 'btn ghost sm'; btn.style.width = '100%'; btn.textContent = 'Close';
  btn.onclick = closeModal;
  wrap.appendChild(btn);
  box.appendChild(wrap);
  $('#modal').classList.add('on');
}

/* ───────────────────────── router ───────────────────────── */
const SCREENS = ['auth','home','pack','coll','deck','duel','story','pnp','mp','gacha','tutor'];
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
        '<button class="btn hot" data-act="guest">▶ Play now<span class="sub">no account needed</span></button>' +
      '</div>' +
      (names.length
        ? '<p class="tiny" style="text-align:center;margin:14px 0 8px">or pick up where you left off</p>' +
          '<div class="userlist">' + names.map(k =>
            '<button class="userrow" data-u="' + esc(k) + '">' +
              '<span class="avatar">' + esc(users[k].name.charAt(0).toUpperCase()) + '</span>' +
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
  if (!local.noProfile){ authErr(local.err); return; }
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
       as any other profile on this device. */
    const users = getUsers();
    if (!users[key]){
      const salt = randSalt();
      users[key] = { name: name.trim(), salt, hash: hashPw(salt, pw), created: Date.now() };
      setUsers(users);
    }
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
function renderHome(){
  /* No deck yet? You do not get a free pick of all seven — you get a roll of
     three (js/gacha.js). Routed from here so a reload cannot dodge it. */
  if (!S.starters.length && window.KARTI_GACHA && KARTI_GACHA.open){ KARTI_GACHA.open(); return; }
  const chip = $('#profile-chip');
  chip.innerHTML = '<span class="avatar">' + esc(displayName().charAt(0).toUpperCase()) + '</span>' +
    esc(displayName());
  chip.onclick = profileSheet;

  const d = activeDeck();
  $('#wallet').innerHTML =
    '<span class="pill">' + ico('coin') + '<span class="mono">' + S.coins + '</span> <small>coins</small></span>' +
    '<span class="pill">' + ico('dust') + '<span class="mono">' + S.dust + '</span> <small>dust</small></span>' +
    '<span class="pill">' + ico('cards') + '<span class="mono">' + uniqueOwned() + '/' + CARDS.length + '</span> <small>cards</small></span>' +
    '<span class="pill">' + ico('trophy') + '<span class="mono">' + S.rec.w + '–' + S.rec.l + '</span> <small>W–L</small></span>' +
    (S.packs ? '<span class="pill">' + ico('pack') + '<span class="mono">' + S.packs + '</span> <small>packs</small></span>' : '');

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
}
/* ───────────────────── the profile chip's sheet ─────────────────────
   Three things you can DO — switch player, settings, log out — and one quiet
   line telling you where your game lives. Nothing else. The one extra button
   is the way to make an account, and it is shown only when there is not one
   yet: offering "play on another phone" to somebody who is already signed in
   on this phone is an instruction with nothing behind it. */
function cloudLine(){
  const s = cloudStatus();
  if (ACTIVE === GUEST && !s.linked)
    return { cls:'off', text:'Playing as a guest — this game is on this phone only.' };
  if (s.linked){
    const when = (KARTI_SYNC.whenText ? KARTI_SYNC.whenText(s.lastAt) : '');
    if (s.phase === 'conflict')
      return { cls:'warn', text:'Cloud account ' + s.user + ' — waiting for you to choose ' +
                                'which game to keep.' };
    if (s.online === false)
      return { cls:'warn', text:'Cloud account ' + s.user + ' — the server is not answering. ' +
                                'Your game is safe on this phone.' };
    return { cls:'on', text:'Cloud account ' + s.user + ' · ' +
             (s.lastAt ? 'synced ' + when : 'not uploaded yet') };
  }
  if (cloudPending)
    return { cls:'warn', text:'Made on this phone. It goes to the cloud as soon as the ' +
                              'server answers.' };
  return { cls:'off', text:'On this phone only — not backed up.' };
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
      ? '<button class="kx-pfav" id="pf-av" aria-label="Change how you look">' +
          '<span data-kx-av="' + esc(displayName()) + '" data-kx-size="76"></span>' +
          '<span class="kx-pfpen" aria-hidden="true">' + ico('star') + '</span>' +
        '</button>' +
        '<p class="kx-pfcap">Tap your face to change it</p>'
      : '') +
    '<p class="cloudline ' + line.cls + '"><i></i><span>' + esc(line.text) + '</span></p>' +
    (needsAccount
      ? '<div class="opts" style="margin-top:10px">' +
          '<button class="btn primary" id="pf-make">' +
            ilb('save', ACTIVE === GUEST ? 'Create an account' : 'Put this game in the cloud') +
            '<span class="sub">keeps everything · play on any phone</span></button>' +
        '</div>'
      : '') +
    /* The record book and the board are their own module (js/stats.js); it
       binds these by data attribute, so this stays markup only. */
    '<div class="opts">' +
      '<button class="btn ghost" data-karti-stats>' + ilb('cards', 'Record book') + '</button>' +
      '<button class="btn ghost" data-karti-stats="board">' + ilb('crown', 'Leaderboard') + '</button>' +
    '</div>' +
    '<div class="opts">' +
      '<button class="btn ghost" id="pf-switch">' + ilb('users', 'Switch player') + '</button>' +
      '<button class="btn ghost" id="pf-set">' + ilb('gear', 'Settings') + '</button>' +
      '<button class="btn ghost" id="pf-out">' + ilb('back', 'Log out') + '</button>' +
    '</div>' +
    '<button class="btn ghost" id="pf-close" style="margin-top:8px;width:100%">Close</button>');
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
  $('#pf-switch').onclick = () => { closeSheet(); logout('switch'); };
  $('#pf-set').onclick = settingsSheet;
  $('#pf-out').onclick = () => { closeSheet(); logout('out'); };
}

/* ───────────────────────── SETTINGS ─────────────────────────
   Only things that are real. Notifications and sounds are not built yet, so
   they say so and cannot be pressed — a switch that flips and changes nothing
   is worse than no switch at all. */
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
            ? '<button class="btn ghost" id="st-cloud">' + ilb('cloud', 'Cloud save') +
              '<span class="sub">sync now · sign this phone out · backups</span></button>'
            : '<button class="btn ghost" id="st-cloud">' +
              ilb('save', ACTIVE === GUEST ? 'Create an account' : 'Put this game in the cloud') +
              '</button>')
        + '</div>'
      : '') +

    '<p class="setgrp">Game</p>' +
    '<div class="setlist">' +
      '<button class="setrow" id="st-motion" role="switch" aria-checked="' + (on ? 'true' : 'false') + '">' +
        '<span class="sl"><b>Reduce motion</b><small>Skip the pack, reveal and duel ' +
          'animations. Follows your phone’s own setting until you change it here.</small></span>' +
        '<span class="sw' + (on ? ' on' : '') + '"><i></i></span>' +
      '</button>' +
      /* Invites arrive over the live socket while the app is OPEN. Waking a
         locked phone is a different thing entirely — it needs Web Push, VAPID
         keys and, on iOS, the app installed to the home screen. So this row
         controls the part that exists and says plainly what it does not. */
      '<button class="setrow" id="st-notify" role="switch" aria-checked="' +
          (notifyOn() ? 'true' : 'false') + '">' +
        '<span class="sl"><b>Invites</b><small>Let other players invite you to a ' +
          'game. They arrive while KARTI is open — a locked phone stays quiet.</small></span>' +
        '<span class="sw' + (notifyOn() ? ' on' : '') + '"><i></i></span>' +
      '</button>' +
      (window.KARTI_SFX
        ? KARTI_SFX.settingsHTML()
        : '<div class="setrow soon" aria-disabled="true">' +
            '<span class="sl"><b>Sounds</b><small>The sound module did not load.</small></span>' +
            '<span class="soontag">Unavailable</span>' +
          '</div>') +
    '</div>' +

    '<p class="setgrp">This profile</p>' +
    '<div class="opts">' +
      '<button class="btn ghost" id="st-wipe" style="opacity:.75">Wipe ' +
        esc(displayName()) + '’s save</button>' +
    '</div>' +

    '<p class="fineprint" id="pf-build" style="margin-top:12px;opacity:.55"></p>' +
    '<p class="fineprint" style="margin-top:8px">18+ · Contains mothers-in-law, ' +
    'Marsa traffic and one very accurate slipper.</p>' +
    '<div class="opts">' +
      '<button class="btn ghost" id="st-back">Back</button>' +
    '</div>');

  buildLine($('#pf-build'));
  $('#st-back').onclick = profileSheet;
  { const n = $('#st-notify');
    if (n) n.onclick = () => {
      const v = !notifyOn();
      setPref('notify', v);
      n.setAttribute('aria-checked', v ? 'true' : 'false');
      n.querySelector('.sw').classList.toggle('on', v);
      try { window.KARTI_MP && KARTI_MP.refreshInbox && KARTI_MP.refreshInbox(); } catch (e){}
    }; }
  if (window.KARTI_SFX) { try { KARTI_SFX.bindSettings(); } catch (e){} }
  { const c = $('#st-cloud');
    if (c) c.onclick = () => {
      closeSheet();
      if (s.linked) KARTI_SYNC.openPanel('account');
      else if (ACTIVE === GUEST) upgradeSheet();
      else KARTI_SYNC.openPanel('signup', { user: displayName() });
    }; }
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
function buildLine(el){
  if (!el) return;
  const art = ART.base ? 'art ok' : 'art fallback';
  const page = 'page v' + (window.KARTI_BUILD || '?');
  el.textContent = page + ' · ' + art;
  if (window.swVersion) window.swVersion().then(v => {
    el.textContent = page + ' · ' +
      (v ? 'sw ' + String(v).replace('karti-v', 'v') : 'no service worker') + ' · ' + art;
  });
}
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
function renderPackScreen(){
  /* anything still running against the old stage is now orphaned — the token
     is what tells it to stop touching the DOM */
  packSeq++;
  packSkip = false;
  packBusy = false;
  packSkipFn = null;
  /* the reveal dims the set picker; #pack-sets is refilled but never replaced,
     so leaving mid-reveal used to strand it at 13% opacity for good */
  const sp = $('#pack-sets'); if (sp) sp.classList.remove('hushed');
  $('#pack-coins').innerHTML = ico('coin', 'Coins') + '<span class="mono">' + S.coins + '</span>';
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
  $('#pack-coins').innerHTML = ico('coin', 'Coins') + '<span class="mono">' + S.coins + '</span>';
  const sets = $('#pack-sets'); if (sets) sets.classList.add('hushed');

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
        (res.dusted ? ico('dust') + '<span class="dust">+' + res.dusted + '</span>'
                    : 'Dupe') + '</span>';
  b.innerHTML =
    '<span class="rgem">' + ico(RARITY_ICON[res.card.r] || 'rar-komuni') + '</span>' +
    '<span class="scol"><span class="snm">' + esc(res.card.n) + '</span>' +
      '<span class="smeta">' + meta + '</span></span>' + tag;
  b.setAttribute('aria-label', res.card.n + ', ' + rar.n + ', ' +
    (res.isNew ? 'new card' :
     res.dusted ? 'duplicate, turned into ' + res.dusted + ' dust' :
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
          (dust ? '<b style="color:var(--gold)">' + ico('dust', 'dust') + '+' + dust + '</b>' : '') +
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
  $('#pack-coins').innerHTML = ico('coin', 'Coins') + '<span class="mono">' + S.coins + '</span>';
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
     Coins and dust are already on Home's wallet and in the Store. */
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
  if (won){ S.rec.w++; S.coins += 120; S.packs += 1; }
  else { S.rec.l++; S.coins += 40; S.dust += 25; }
  save();
  /* THE PAYOUT. duel.win / duel.lose has already gone off on the `over` event;
     this is the coins landing after it, which is a separate pleasure and the
     reason anybody plays another one. Sequenced behind the result modal so the
     two do not stack. A loss still pays 40 and still counts them — quieter,
     and with no chime on the end. */
  if (window.KARTI_SFX){
    const S2 = window.KARTI_SFX;
    setTimeout(() => {
      try {
        S2.run('coin.tick', won ? 6 : 3, 65, { gain: won ? 0.7 : 0.45 });
        if (won) setTimeout(() => { try { S2.play('ui.coin'); } catch(e){} }, 430);
      } catch(e){}
    }, 420);
  }
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
        '<span class="pill">' + ico('coin', 'Coins') + '+' + (won ? 120 : 40) + '</span>' +
        (won ? '<span class="pill">' + ico('pack', 'Packs') + '+1 pack</span>'
             : '<span class="pill">' + ico('dust', 'Dust') + '+25 dust</span>') +
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

/* ═══════════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════════ */
function wireStatic(){
  $('#scrim').addEventListener('click', () => { closeSheet(); if (UI.mode !== 'idle') cancelUI(); });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  /* No #btn-duel any more — Story Mode and Multiplayer are the only ways into a
     duel. startDuel() itself stays: story.js, mp.js and the debug surface call it. */
  $('#btn-packs').onclick = () => go('pack');
  $('#btn-coll').onclick  = () => go('coll');
  $('#btn-deck').onclick  = () => { dbDeck = null; go('deck'); };
  const tb = $('#btn-tutor');
  if (tb) tb.onclick = () => {
    if (window.KARTI_TUTOR && KARTI_TUTOR.open) KARTI_TUTOR.open();
    else toast('The tutorial did not load. Try reopening the app.');
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
  const act = lsGet(ACTIVE_KEY, null);
  const users = getUsers();
  if (act && (act === GUEST || users[act])){ ACTIVE = act; load(); go('home'); }
  else { ACTIVE = null; authMode = 'menu'; go('auth'); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

/* test / debug surface — used by the headless verification harness.
   cards.js declares its data with `const`, which is NOT a window property,
   so re-export the references here for anything outside this script scope. */
window.KARTI = {
  get S(){ return S; }, get D(){ return D; }, set D(v){ D = v; },
  get UI(){ return UI; },
  CARDS, STARTER_DECKS, ATTR, RARITY, COUNTERS, COUNTER_BONUS, LP_START, DECK_SIZE, MAX_COPIES,
  ZONES, HAND_LIMIT, NET, setRNG, ART, artImg, artURL, uiArt, detectArt,
  ico, ilb, ATTR_ICON, CAT_ICON, RARITY_ICON, markIcon, markLabel,
  cardById, tributesFor, openPack, deckToCards, effText, FX_TEXT,
  newDuel, aiStep, doAttack, summon, summonInfo, setST, activateSpell, endTurn, toBattle,
  beginTurn, drawCard, damage, healLP, destroyMonster, effAtk, effDef, legalAttackTargets,
  canAttack, changePosition, deckIsLegal, grantStarter, addCard, save, load, go,
  switchTo, createAccount, loginAccount, upgradeGuest, GUEST, SHA256, noBattleYet,
  /* accounts + settings */
  logout, profileSheet, settingsSheet, upgradeSheet, cloudLink, cloudStatus, cloudLine,
  signInFromCloud, authAction, setPref, applyPrefs, get PREFS(){ return PREFS; },
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
  toast, flash, openSheet, closeSheet, openModal, closeModal, esc, wait, $, $$, shuffle, pickOne
};
