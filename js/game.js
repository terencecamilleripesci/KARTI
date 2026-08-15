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
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (REDUCED) document.body.classList.add('reduced');
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
  cleave:'Attacks two enemy monsters in one battle phase.',
  thorns:'Any monster that attacks it takes 400 damage.',
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

const getUsers = () => lsGet(USERS_KEY, {}) || {};
const setUsers = u => lsSet(USERS_KEY, u);
let ACTIVE = null;                    // lowercased key, or GUEST

function displayName(){
  if (ACTIVE === GUEST) return 'Guest';
  const u = getUsers()[ACTIVE];
  return u ? u.name : 'Guest';
}
function createAccount(name, pw){
  name = (name || '').trim();
  if (!name) return { err:'Pick a username.' };
  if (name.length > 16) return { err:'Max 16 characters.' };
  if (!/^[\w .'-]+$/.test(name)) return { err:'Letters, numbers, spaces only.' };
  if (!pw) return { err:'Pick a password.' };
  if (pw.length < 4) return { err:'Password needs 4+ characters.' };
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
function loginAccount(name, pw){
  const key = (name || '').trim().toLowerCase();
  if (!key) return { err:'Enter your username.' };
  const users = getUsers();
  const u = users[key];
  if (!u) return { err:'No profile with that name on this device.' };
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
  if (carried) lsSet(saveKeyFor(r.key), carried);
  try { localStorage.removeItem(saveKeyFor(GUEST)); } catch(e){}
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
function logout(){
  if (window.KARTI_SYNC) KARTI_SYNC.detach();
  ACTIVE = null;
  try { localStorage.removeItem(ACTIVE_KEY); } catch(e){}
  D = null;
  renderAuth(); go('auth');
}

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
       .in clips its overflow and the banner has to stand proud of the frame. */
    (opts.isNew ? '<span class="newbadge">New</span>' : '');
  if (opts.isNew) d.classList.add('is-new');
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
         with no profiles saved it explains itself instead of dead-ending on a
         form that could not possibly succeed. */
      '<div style="display:grid;gap:9px;margin-top:10px">' +
        '<button class="btn ghost" data-act="login">' + ilb('lock', 'Log in') + '</button>' +
        '<button class="btn ghost" data-act="signup">' + ilb('save', 'Create an account') + '</button>' +
      '</div>';
    $$('.userrow', b).forEach(el => el.onclick = () => { authMode = 'login'; renderAuth();
      const f = $('#au-name'); if (f){ f.value = users[el.dataset.u].name; $('#au-pw').focus(); } });
  } else if (authMode === 'nologin'){
    /* Log in tapped with nothing to log in to. Say why, plainly — a KARTI account
       is a row in this phone's localStorage, not an account on a server, so there
       is genuinely nothing to fetch. Then offer both real ways forward. */
    b.innerHTML =
      '<h3 style="text-align:center;font-size:15px;margin-bottom:10px">Log in</h3>' +
      '<p class="muted">There are no profiles saved on this phone yet, so there is nothing ' +
      'to log in to.</p>' +
      '<p class="muted">KARTI accounts live on the device, not on a server — an account you ' +
      'made on another phone will not show up here, and your cards do not travel between ' +
      'phones.</p>' +
      '<div style="display:grid;gap:9px;margin-top:12px">' +
        '<button class="btn primary" data-act="signup">' + ilb('save', 'Create an account') + '</button>' +
        '<button class="btn hot" data-act="guest">Play as guest' +
          '<span class="sub">you can make it an account later, nothing is lost</span></button>' +
        '<button class="btn ghost" data-act="back">Back</button>' +
      '</div>';
  } else {
    const isNew = authMode === 'signup';
    b.innerHTML =
      '<h3 style="text-align:center;font-size:15px;margin-bottom:10px">' +
        (isNew ? 'Create a profile' : 'Log in') + '</h3>' +
      '<label class="tiny" for="au-name">Username</label>' +
      '<input class="field" id="au-name" autocomplete="username" maxlength="16" placeholder="e.g. Terence">' +
      '<label class="tiny" for="au-pw" style="margin-top:8px;display:block">Password</label>' +
      '<input class="field" id="au-pw" type="password" autocomplete="' +
        (isNew ? 'new-password' : 'current-password') + '" placeholder="4+ characters">' +
      '<p class="err" id="au-err"></p>' +
      '<div style="display:grid;gap:9px;margin-top:6px">' +
        '<button class="btn primary" data-act="' + (isNew ? 'do-signup' : 'do-login') + '">' +
          (isNew ? 'Create & play' : 'Log in') + '</button>' +
        '<button class="btn ghost" data-act="back">Back</button>' +
      '</div>';
    const submit = () => b.querySelector('[data-act^="do-"]').click();
    $('#au-pw').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    $('#au-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('#au-pw').focus(); });
  }
  $$('[data-act]', b).forEach(el => el.onclick = () => authAction(el.dataset.act));
}
function authAction(act){
  if (act === 'signup'){ authMode = 'signup'; renderAuth(); return; }
  /* nothing saved on this device = nothing to log in to. Explain, do not show a
     username/password form that can only ever say "no such profile". */
  if (act === 'login'){
    authMode = Object.keys(getUsers()).length ? 'login' : 'nologin';
    renderAuth(); return;
  }
  if (act === 'back'){ authMode = 'menu'; renderAuth(); return; }
  if (act === 'guest'){ switchTo(GUEST); authMode = 'menu'; afterLogin(); return; }
  const name = $('#au-name').value, pw = $('#au-pw').value;
  const r = act === 'do-signup' ? createAccount(name, pw) : loginAccount(name, pw);
  if (r.err){ $('#au-err').textContent = r.err; return; }
  switchTo(r.key); authMode = 'menu'; afterLogin();
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
}
function profileSheet(){
  openSheet(
    '<h3>' + esc(displayName()) + '</h3>' +
    '<p class="muted">Local profiles only — stored on this device, not a real secure account.</p>' +
    '<div class="opts">' +
      (ACTIVE === GUEST
        ? '<button class="btn primary" id="pf-upgrade">' + ilb('save', 'Save my progress') +
          '<span class="sub">make an account · keeps everything</span></button>' : '') +
      /* Cloud sync — the whole account UI lives inside sync.js's own panel. */
      (window.KARTI_SYNC ? '<button class="btn ghost" id="pf-cloud">' +
        ilb('refresh', 'Play on another phone') + '</button>' : '') +
      '<button class="btn ghost" id="pf-switch">Switch player</button>' +
      '<button class="btn ghost" id="pf-out">Log out</button>' +
      '<button class="btn ghost" id="pf-wipe" style="opacity:.7">Wipe this profile\'s save</button>' +
      '<button class="btn ghost" id="pf-close">Close</button>' +
    '</div>' +
    /* the 18+ line — it lives here rather than under the bottom nav, where it was
       just filler taking up the last row of a phone screen */
    /* Build + art state, so a support question stops being guesswork: it says
       which service worker version the phone is really running (an installed
       PWA can sit on a stale one for days) and whether the artwork loaded. */
    '<p class="fineprint" id="pf-build" style="margin-top:10px;opacity:.55"></p>' +
    '<p class="fineprint" style="margin-top:12px">18+ · Contains mothers-in-law, ' +
    'Marsa traffic and one very accurate slipper.</p>');
  $('#pf-close').onclick = closeSheet;
  const up = $('#pf-upgrade');
  if (up) up.onclick = upgradeSheet;
  { const el = $('#pf-build');
    if (el){
      const art = ART.base ? 'art ok' : 'art fallback';
      el.textContent = 'build …';
      const show = v => { el.textContent = 'build ' + v + ' · ' + art; };
      if (navigator.serviceWorker && navigator.serviceWorker.controller){
        fetch('sw.js', { cache:'no-store' }).then(r => r.text())
          .then(t => show((t.match(/karti-v\d+/) || ['unknown'])[0]))
          .catch(() => show('offline'));
      } else show('no service worker');
    } }
  { const c = $('#pf-cloud'); if (c) c.onclick = () => { closeSheet(); KARTI_SYNC.openPanel(); }; }
  $('#pf-switch').onclick = () => { closeSheet(); logout(); };
  $('#pf-out').onclick = () => { closeSheet(); logout(); };
  $('#pf-wipe').onclick = () => {
    openSheet('<h3>Wipe this save?</h3><p class="muted">Cards, coins, decks — all of it, for ' +
      esc(displayName()) + ' only. Other profiles are untouched.</p>' +
      '<div class="opts"><button class="btn hot" id="w-yes">Wipe it</button>' +
      '<button class="btn ghost" id="w-no">Cancel</button></div>');
    $('#w-no').onclick = closeSheet;
    $('#w-yes').onclick = () => { S = DEFAULT_STATE(); save(); closeSheet(); renderHome(); toast('Clean slate.'); };
  };
}
function upgradeSheet(){
  openSheet(
    '<h3>Keep your progress</h3>' +
    '<p class="muted">Make an account and your deck, your cards, your coins and your story ' +
    'progress all come with you. Nothing is lost and nothing is sent anywhere — it stays on ' +
    'this device.</p>' +
    '<label class="tiny" for="up-name" style="display:block;margin-top:8px">Username</label>' +
    '<input class="field" id="up-name" maxlength="16" autocomplete="username" placeholder="e.g. Terence">' +
    '<label class="tiny" for="up-pw" style="display:block;margin-top:8px">Password</label>' +
    '<input class="field" id="up-pw" type="password" autocomplete="new-password" placeholder="4+ characters">' +
    '<p class="err" id="up-err"></p>' +
    '<div class="opts">' +
      '<button class="btn primary" id="up-go">Create it</button>' +
      '<button class="btn ghost" id="up-no">Not now</button></div>');
  $('#up-no').onclick = closeSheet;
  $('#up-go').onclick = () => {
    const r = upgradeGuest($('#up-name').value, $('#up-pw').value);
    if (r.err){ $('#up-err').textContent = r.err; return; }
    closeSheet(); renderHome();
    toast('Saved. Welcome, ' + displayName() + '.');
  };
  $('#up-pw').addEventListener('keydown', e => { if (e.key === 'Enter') $('#up-go').click(); });
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
  S.side = key; if (deck) S.activeDeck = deck.id;
  save(); renderHome();
}

/* ═══════════════════════════════════════════════════════════════════
   PACK OPENING
   ═══════════════════════════════════════════════════════════════════ */
const PACK_COST = 150;
let packBusy = false;
let tiltHooked = false;

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
  packBusy = false;
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
    '</div>' +
    '<div class="burst" id="burst"></div>' +
    '<div class="rays" id="rays"></div>';
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

function tryOpen(){
  if (packBusy) return;
  if (S.packs > 0){ S.packs--; }
  else if (S.coins >= PACK_COST){ S.coins -= PACK_COST; }
  else { toast('No packs and not enough coins. Win a duel.'); return; }
  save();
  packBusy = true;
  runPackOpen();
}

async function runPackOpen(){
  const cards = openPack(5, S.packSet);
  const results = cards.map(c => {
    const r = addCard(c.id);
    return { card:c, isNew:r.isNew, dusted:r.dusted };
  });
  save();

  const pk = $('#the-pack');
  $('#pack-bar').innerHTML = '<p class="hint">Tap each card to flip it</p>';
  $('#pack-coins').innerHTML = ico('coin', 'Coins') + '<span class="mono">' + S.coins + '</span>';

  if (pk){
    pk.classList.add('shake');
    await wait(430);
    pk.classList.add('tearing');
    $('#burst').classList.add('go');
    $('#rays').classList.add('go');
  }
  await wait(560);

  const stage = $('#pack-stage');
  stage.innerHTML = '<div class="fan" id="fan"></div>';
  const fan = $('#fan');

  results.forEach((res, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot ' + res.card.r;
    slot.dataset.i = String(i);
    const depth = results.length - 1 - i;
    slot.style.setProperty('--sx', (depth * 5) + 'px');
    slot.style.setProperty('--sy', (depth * -6) + 'px');
    slot.style.setProperty('--sr', (depth * 2.2 - 4) + 'deg');
    slot.style.setProperty('--ss', String(1 - depth * .035));
    slot.style.zIndex = String(10 + i * -1 + results.length);
    slot.innerHTML = '<div class="aura"></div>';
    const flip = document.createElement('div');
    flip.className = 'flipper';
    flip.appendChild(backEl());
    const front = document.createElement('div');
    front.className = 'fr';
    /* res.isNew came from addCard(), which reads ownership BEFORE it adds the
       copy — so this really does mean "did not own it a moment ago". */
    front.appendChild(cardEl(res.card, { size:'md', isNew: res.isNew }));
    flip.appendChild(front);
    slot.appendChild(flip);
    const tip = document.createElement('div');
    tip.className = 'tapme'; tip.textContent = i === 0 ? 'Tap to flip' : '';
    slot.appendChild(tip);
    fan.appendChild(slot);
  });

  /* entrance */
  fan.querySelectorAll('.slot').forEach((s, i) => {
    s.animate(
      [{ transform:'translate3d(0,140px,0) scale(.5)', opacity:0 }, { opacity:1, offset:.4 },
       { transform:getComputedStyle(s).transform === 'none' ? 'none' : getComputedStyle(s).transform }],
      { duration: REDUCED ? 1 : 520, delay: REDUCED ? 0 : i * 70, easing:'cubic-bezier(.22,.9,.28,1)' });
  });

  let idx = 0;
  const revealNext = async () => {
    const slot = fan.querySelector('.slot[data-i="' + idx + '"]');
    if (!slot || slot.classList.contains('flipped')) return;
    const res = results[idx];
    slot.classList.add('flipped');
    rarityFx(slot, res.card.r);
    const slow = res.card.r === 'leggendarju';
    await wait(slow ? 1500 : 780);
    slot.style.setProperty('--sx', '-140vw');
    slot.style.setProperty('--sr', '-22deg');
    slot.style.opacity = '0';
    idx++;
    const nxt = fan.querySelector('.slot[data-i="' + idx + '"]');
    if (nxt){
      nxt.style.setProperty('--sx', '0px'); nxt.style.setProperty('--sy', '0px');
      nxt.style.setProperty('--sr', '0deg'); nxt.style.setProperty('--ss', '1');
      const tip = nxt.querySelector('.tapme'); if (tip) tip.textContent = 'Tap to flip';
    } else {
      await wait(320);
      showSummary(results);
    }
  };
  fan.onclick = revealNext;
  fan.tabIndex = 0;
  fan.setAttribute('role', 'button');
  fan.setAttribute('aria-label', 'Tap to flip the next card');
  fan.onkeydown = e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); revealNext(); } };
}

/* labelEl lets another screen (the starter gacha) borrow this whole effect
   without fighting the pack screen over the #rlabel element. */
function rarityFx(slot, rarity, labelEl){
  const label = labelEl || $('#rlabel');
  const RC = RARITY[rarity] ? RARITY[rarity].c : '#fff';
  if (rarity === 'rari'){
    label.textContent = 'RARE'; label.style.color = RC;
    label.classList.remove('go'); void label.offsetWidth; label.classList.add('go');
  }
  if (rarity === 'epiku'){
    label.textContent = 'EPIC'; label.style.color = RC;
    label.classList.remove('go'); void label.offsetWidth; label.classList.add('go');
    particles(slot, 18, '#C46BFF', 150);
  }
  if (rarity === 'leggendarju'){
    label.innerHTML = ico('star') + ' LEGENDARY ' + ico('star'); label.style.color = RC;
    label.classList.remove('go'); void label.offsetWidth; label.classList.add('go');
    particles(slot, 42, '#FFD24A', 230);
    if (!REDUCED){
      document.body.classList.add('shake');
      setTimeout(() => document.body.classList.remove('shake'), 520);
    }
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

function showSummary(results){
  packBusy = false;
  const stage = $('#pack-stage');
  const news = results.filter(r => r.isNew).length;
  const dust = results.reduce((a, r) => a + r.dusted, 0);
  stage.innerHTML =
    '<div style="text-align:center;padding:8px 4px">' +
      '<h2 style="font-size:17px;margin-bottom:10px">You pulled</h2>' +
      '<div class="summary" id="sum"></div>' +
      '<p class="muted" style="margin-top:12px">' +
        (news ? '<b style="color:var(--ok)">' + news + ' new</b>' : 'Nothing new') +
        (dust ? ' · duplicates dusted for <b style="color:var(--gold)">' + ico('dust', 'dust') +
          dust + '</b>' : '') +
      '</p>' +
    '</div>';
  const sum = $('#sum');
  results.forEach(r => {
    const b = document.createElement('button');
    b.className = 'sumitem';
    b.style.borderColor = RARITY[r.card.r] ? RARITY[r.card.r].c : 'var(--line)';
    b.innerHTML = '<span style="font-size:15px">' + esc(r.card.e) + '</span>' + esc(r.card.n) +
      (r.isNew ? ' <b style="color:var(--ok)">NEW</b>'
                : (r.dusted ? ' <b style="color:var(--gold)">' + ico('dust', 'dust') + r.dusted + '</b>' : ''));
    b.onclick = () => cardViewModal(r.card);
    sum.appendChild(b);
  });
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
   DECK BUILDER
   ═══════════════════════════════════════════════════════════════════ */
const dbF = { cat:'all', attr:'all', rar:'all', q:'' };
let dbDeck = null;          // working copy {id,name,starter,list}
let dbPane = 'pool';

function renderDeckBuilder(){
  renderDeckPicker();          /* the picker lives on this screen now */
  if (!dbDeck){
    const a = activeDeck();
    dbDeck = a ? { id:a.id, name:a.name, starter:a.starter, list: Object.assign({}, a.list) }
               : { id:'d' + Date.now(), name:'NEW DECK', list:{} };
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
  $('#db-menu').onclick = deckMenu;
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
  save();
  toast('Saved. “' + dbDeck.name + '” is now your active deck.');
}
function deckMenu(){
  const opts = S.decks.map(d =>
    '<button class="btn ghost sm" data-load="' + esc(d.id) + '" style="justify-content:space-between">' +
      '<span>' + esc(d.name) + '</span><span style="opacity:.6">' + deckTotal(d.list) + '/' + DECK_SIZE +
      (S.activeDeck === d.id ? ' ' + ico('check', 'active deck') : '') + '</span></button>').join('');
  const starters = Object.keys(STARTER_DECKS).map(k =>
    '<button class="btn ghost sm" data-starter="' + k + '">' +
      ilb(ATTR_ICON[STARTER_DECKS[k].f || k] || 'deck',
          'Load ' + esc(STARTER_DECKS[k].name) + ' starter list') + '</button>').join('');
  openSheet(
    '<h3>Decks</h3><p class="muted">Saved on this profile. Pick one to edit and make active.</p>' +
    '<div class="opts">' + (opts || '<p class="muted">No saved decks yet.</p>') +
      '<div class="dhead"><span>START FROM A STARTER</span></div>' + starters +
      '<button class="btn ghost sm" data-new="1">' + ilb('plus', 'New empty deck') + '</button>' +
      '<button class="btn ghost" id="dm-close">Close</button></div>');
  $('#dm-close').onclick = closeSheet;
  $$('#sheet [data-load]').forEach(b => b.onclick = () => {
    const d = deckById(b.dataset.load);
    dbDeck = { id:d.id, name:d.name, starter:d.starter, list: Object.assign({}, d.list) };
    S.activeDeck = d.id; save(); closeSheet(); renderDeckBuilder();
  });
  $$('#sheet [data-starter]').forEach(b => b.onclick = () => {
    const k = b.dataset.starter, sd = STARTER_DECKS[k];
    const missing = Object.entries(sd.list).filter(([id, n]) => ownedCount(id) < n);
    if (missing.length){
      toast('You don\'t own all of ' + sd.name + ' yet — unlock it on the home screen.');
      return;
    }
    dbDeck = { id:'d' + Date.now(), name: sd.name + ' COPY', starter:k, list: Object.assign({}, sd.list) };
    closeSheet(); dbPane = 'deck'; renderDeckBuilder();
  });
  $$('#sheet [data-new]').forEach(b => b.onclick = () => {
    dbDeck = { id:'d' + Date.now(), name:'NEW DECK', list:{} };
    closeSheet(); dbPane = 'deck'; renderDeckBuilder();
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

const effAtk = m => Math.max(0, m.card.atk + (m.mod || 0) + (m.tempMod || 0));
const effDef = m => Math.max(0, m.card.def + (m.mod || 0));
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
  if (m.card.fx === 'boom'){
    dlog(m.card.n + ' goes off — 500 to both players.');
    damage(0, 500, m.card.n); damage(1, 500, m.card.n);
  }
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
  if (P.mz[zi]) zi = freeZone(pi, 'm');
  if (zi < 0) return { ok:false, why:'No free monster zone.' };
  P.hand.splice(handIdx, 1);
  const inst = {
    uid: ++uid, cid: card.id, card, owner: pi,   /* never changes, even when stolen */
    pos: pos || 'atk', fd: !!faceDown, mod:0, tempMod:0,
    atkCount:0, maxAtk: card.fx === 'double' || card.fx === 'cleave' ? 2 : 1,
    monsterOnly: card.fx === 'cleave', shieldUsed:false, sumTurn: D.turnCount
  };
  P.mz[zi] = inst;
  P.normalSummoned = true;
  dlog(P.name + (faceDown ? ' sets a monster face-down.' : ' summons ' + card.n +
    ' (' + card.atk + '/' + card.def + ').'));
  emit({ type:'summon', pi, zi, faceDown, name:card.n });
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
  if (P.sz[zi]) zi = freeZone(pi, 's');
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
function canActivateSpell(pi, card){
  if (card.t !== 'spell') return false;
  if (card.fx === 's_steal' && freeZone(pi, 'm') < 0) return false;
  if (spellNeedsTarget(card) && spellTargets(pi, card).length === 0) return false;
  if (card.fx === 's_search' && !D.p[pi].deck.some(id => cardById(id).t === 'monster')) return false;
  return true;
}
function activateSpell(pi, handIdx, target){
  const P = D.p[pi], oi = 1 - pi;
  const card = cardById(P.hand[handIdx]);
  if (!card || card.t !== 'spell') return { ok:false, why:'Not a spell.' };
  if (!canActivateSpell(pi, card)) return { ok:false, why:'Nothing to use it on.' };
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
        D.p[oi].mz[target.i] = null;
        m.fd = false; m.pos = 'atk'; m.atkCount = 0;
        P.mz[zi] = m;
        (D.stolen = D.stolen || []).push({ m, from: oi, fromZone: target.i, to: pi, toZone: zi });
        dlog(P.name + ' knows someone — ' + m.card.n + ' switches sides for the turn.');
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
    case 't_mirror':  out.negate = true;
                      dlog('The attack is thrown straight back.');
                      damage(atkPi, effAtk(attacker), card.n); break;
    case 't_weaken':  attacker.tempMod -= 800;
                      (D.tempOwners = D.tempOwners || []).push(attacker);
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
function legalAttackTargets(pi, zi){
  const m = D.p[pi].mz[zi];
  const enemy = fieldMonsters(1 - pi);
  if (!enemy.length) return m && m.monsterOnly ? [] : [-1];   // -1 = direct
  const t = tauntZone(1 - pi);
  return t >= 0 ? [t] : enemy.map(x => x.i);
}
function doAttack(pi, zi, targetZone){
  const oi = 1 - pi;
  const P = D.p[pi], O = D.p[oi];
  if (!canAttack(pi, zi)) return { ok:false, why:'That monster cannot attack.' };
  const legal = legalAttackTargets(pi, zi);
  if (legal.indexOf(targetZone) < 0) return { ok:false, why:'Not a legal target.' };
  if (pi === 0) netSend('attack', { zi, t:targetZone });
  const A = P.mz[zi];
  A.atkCount++;

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
  P.mz.forEach(m => { if (m) m.atkCount = 0; });
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
    /* highlight states */
    if (UI.mode === 'zone' && side === 0 && kind === UI.plan.kind && !arr[i]) z.classList.add('legal');
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
  if (D.over || D.turn !== 0 || UI.busy) return;
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
  if (D.over || UI.busy) return;
  const P = D.p[0];

  if (UI.mode === 'tribute'){
    if (side !== 0 || kind !== 'm' || !P.mz[i]) return;
    const at = UI.tributes.indexOf(i);
    if (at >= 0) UI.tributes.splice(at, 1);
    else if (UI.tributes.length < UI.need) UI.tributes.push(i);
    if (UI.tributes.length === UI.need){ UI.mode = 'zone'; toast('Now pick a zone.'); }
    renderDuel(); return;
  }
  if (UI.mode === 'zone'){
    if (side !== 0 || kind !== UI.plan.kind) return;
    const arr = kind === 'm' ? P.mz : P.sz;
    const willFree = kind === 'm' ? UI.tributes.indexOf(i) >= 0 : false;
    if (arr[i] && !willFree) return;
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
    if (!t) return;
    activateSpell(0, UI.plan.handIdx, { side:t.side, i:t.i });
    resetUI(); renderDuel(); return;
  }
  if (UI.mode === 'attack'){
    if (side === 1 && kind === 'm' && UI.targets.indexOf(i) >= 0) runAttack(UI.atkZone, i);
    else cancelUI();
    return;
  }

  /* idle taps on your own field */
  if (D.turn !== 0) return;
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
      if (!targets.length){ toast('No legal target.'); return; }
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
  endTurn();
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
    while (!D.over && D.turn === 1 && guard++ < 60){
      await wait(560);
      aiStep();
      renderDuel();
    }
  } catch (e) {
    toast('The opponent got confused. Your turn.');
    if (window.console) console.error('runAITurn', e);
    if (D && !D.over && D.turn === 1) { try { endTurn(); } catch (_) {} }
  } finally {
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
  $('#deck-back').onclick = () => { dbDeck = null; go('home'); };
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
  fieldMonsters, freeZone, tauntZone, counterBonus, spellTargets, canActivateSpell,
  spellNeedsTarget, trapPriority, deckTotal, deckById, activeDeck, displayName,
  cardEl, backEl, rarityFx, particles, cardViewModal, starterPrice, chooseSide, afterLogin,
  renderDuel, renderHome, startDuel, startCustomDuel, runAITurn, playerEndTurn, endDuel,
  showResult, DEFAULT_STATE, resetUI, onDuelEvent, dlog,
  toast, flash, openSheet, closeSheet, openModal, closeModal, esc, wait, $, $$, shuffle, pickOne
};
