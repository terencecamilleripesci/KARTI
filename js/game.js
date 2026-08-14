/* ═══════════════════════════════════════════════════════════════════
   KARTI — game.js
   Vanilla JS. Depends on js/cards.js (globals).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* ───────────────────────── helpers ───────────────────────── */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (REDUCED) document.body.classList.add('reduced');
const wait = ms => new Promise(r => setTimeout(r, REDUCED ? Math.min(ms, 40) : ms));

function shuffle(a){
  for (let i = a.length - 1; i > 0; i--){ const j = rnd(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
const TYPEC = { spell:'#00A88A', trap:'#C2185B' };
const frameColor = c => c.f ? ATTR[c.f].c : (TYPEC[c.t] || '#666');
const typeName   = c => c.t === 'monster' ? (c.f ? ATTR[c.f].n : 'MONSTER') : c.t.toUpperCase();

/* toast / flash / modal / sheet */
let toastT;
function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.remove('on');
  void t.offsetWidth; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2500);
}
function flash(msg, color){
  const f = $('#flash'); f.textContent = msg; f.style.color = color || 'var(--gold)';
  f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
}
function openModal(html){
  $('#mbox').innerHTML = html; $('#modal').classList.add('on');
}
function closeModal(){ $('#modal').classList.remove('on'); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

function openSheet(html){
  $('#sheet').innerHTML = html;
  $('#sheet').classList.add('on'); $('#scrim').classList.add('on');
}
function closeSheet(){ $('#sheet').classList.remove('on'); $('#scrim').classList.remove('on'); }
$('#scrim').addEventListener('click', () => { closeSheet(); if (UI && UI.mode !== 'idle') cancelUI(); });

/* ───────────────────────── save state ───────────────────────── */
const SAVE_KEY = 'karti.save.v1';
const DEFAULT_STATE = () => ({
  owned:{}, dust:0, coins:300, packs:1,
  decks:[], activeDeck:null, starters:[], side:'festa',
  rec:{ w:0, l:0 }, seen:{}
});
let S = DEFAULT_STATE();

function load(){
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw){ const o = JSON.parse(raw); S = Object.assign(DEFAULT_STATE(), o);
      S.rec = Object.assign({ w:0, l:0 }, o.rec || {}); }
  } catch(e){ S = DEFAULT_STATE(); }
}
function save(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch(e){} }

const ownedCount = id => S.owned[id] || 0;
const uniqueOwned = () => CARDS.filter(c => ownedCount(c.id) > 0).length;

function addCard(id, n){
  n = n || 1;
  const was = ownedCount(id);
  const cap = MAX_COPIES;
  let isNew = was === 0, dusted = 0;
  for (let i = 0; i < n; i++){
    if (ownedCount(id) >= cap){ dusted += RARITY[cardById(id).r].dust; S.dust += RARITY[cardById(id).r].dust; }
    else S.owned[id] = ownedCount(id) + 1;
  }
  return { isNew, dusted };
}
function grantStarter(key){
  const d = STARTER_DECKS[key];
  for (const [id, n] of Object.entries(d.list)) S.owned[id] = Math.max(ownedCount(id), n);
  if (S.starters.indexOf(key) < 0) S.starters.push(key);
  let deck = S.decks.find(x => x.starter === key);
  if (!deck){
    deck = { id: 'sd_' + key, name: d.name + ' STARTER', starter: key, list: Object.assign({}, d.list) };
    S.decks.push(deck);
  }
  S.activeDeck = deck.id; S.side = key; save();
  return deck;
}
const deckById = id => S.decks.find(d => d.id === id);
function activeDeck(){
  let d = deckById(S.activeDeck);
  if (!d) d = S.decks[0];
  return d || null;
}
const deckTotal = list => Object.values(list).reduce((a, b) => a + b, 0);

/* ───────────────────────── card rendering ───────────────────────── */
function stars(lvl){
  if (!lvl) return '';
  return lvl > 6 ? '★'.repeat(6) + '+' + (lvl - 6) : '★'.repeat(lvl);
}
function cardEl(card, opts){
  opts = opts || {};
  const d = document.createElement('div');
  d.className = 'card ' + (opts.size || 'md') + (opts.tap ? ' tap' : '');
  if (card.r === 'epiku') d.classList.add('holo');
  if (card.r === 'leggendarju') d.classList.add('holo', 'holo-leg');
  if (opts.dim) d.classList.add('dim');
  d.style.setProperty('--fc', frameColor(card));
  d.style.setProperty('--rc', RARITY[card.r].c);
  d.dataset.cid = card.id;
  const isMon = card.t === 'monster';
  d.innerHTML =
    '<div class="in">' +
      '<div class="hd"><span class="nm">' + esc(card.n) + '</span>' +
        '<span class="at">' + (card.f ? ATTR[card.f].e : (card.t === 'spell' ? '✨' : '🕳️')) + '</span></div>' +
      '<div class="lv">' + (isMon ? stars(card.lvl) : '') + '</div>' +
      '<div class="art"><span>' + card.e + '</span></div>' +
      '<div class="tx">' + esc(card.txt) + '</div>' +
      (isMon
        ? '<div class="st"><b><span class="lbl">ATK</span> ' + card.atk + '</b>' +
          '<i><span class="lbl">DEF</span> ' + card.def + '</i></div>'
        : '<div class="st" style="justify-content:center"><b style="color:var(--gold)">' +
          card.t.toUpperCase() + '</b></div>') +
      '<span class="gem"></span>' +
      '<span class="typ">' + typeName(card) + '</span>' +
    '</div>';
  return d;
}
function backEl(size){
  const d = document.createElement('div');
  d.className = 'card back ' + (size || 'md');
  d.innerHTML = '<div class="in"></div>';
  return d;
}
function esc(s){
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}
function cardViewModal(card){
  const owned = ownedCount(card.id);
  const wrap = document.createElement('div');
  wrap.className = 'cardview';
  const c = cardEl(card, { size:'lg' });
  wrap.appendChild(c);
  const meta = document.createElement('div');
  meta.style.textAlign = 'center';
  meta.innerHTML =
    '<p class="tiny" style="margin:0 0 6px">' + RARITY[card.r].n + ' · ' + typeName(card) +
      (card.t === 'monster' ? ' · Level ' + card.lvl + ' · ' + (tributesFor(card.lvl) || 'no') + ' tribute' +
        (tributesFor(card.lvl) === 1 ? '' : 's') : '') + '</p>' +
    '<p class="joke">“' + esc(card.txt) + '”</p>' +
    '<p class="tiny" style="margin-top:10px">' + (owned ? 'You own ' + owned + ' / ' + MAX_COPIES
      : 'Not in your collection · dust value ' + RARITY[card.r].dust) + '</p>';
  wrap.appendChild(meta);
  const btn = document.createElement('button');
  btn.className = 'btn ghost sm'; btn.style.width = '100%'; btn.textContent = 'Close';
  btn.onclick = closeModal;
  wrap.appendChild(btn);
  $('#mbox').innerHTML = ''; $('#mbox').appendChild(wrap);
  $('#modal').classList.add('on');
}

/* ───────────────────────── router ───────────────────────── */
const SCREENS = ['home','pack','coll','deck','duel'];
let current = 'home';
function go(name){
  if (name !== 'duel' && D && !D.over) { /* leaving a live duel is allowed; state kept */ }
  SCREENS.forEach(s => { const el = $('#scr-' + s); if (el) el.classList.toggle('on', s === name); });
  current = name;
  closeSheet(); closeModal();
  if (name === 'home') renderHome();
  if (name === 'pack') renderPackScreen();
  if (name === 'coll') renderCollection();
  if (name === 'deck') renderDeckBuilder();
}

/* ───────────────────────── HOME ───────────────────────── */
function renderHome(){
  const w = $('#wallet');
  const d = activeDeck();
  w.innerHTML =
    '<span class="pill">🪙 <span class="mono">' + S.coins + '</span> <small>coins</small></span>' +
    '<span class="pill">✨ <span class="mono">' + S.dust + '</span> <small>dust</small></span>' +
    '<span class="pill">🗂️ <span class="mono">' + uniqueOwned() + '/' + CARDS.length + '</span> <small>cards</small></span>' +
    '<span class="pill">🏆 <span class="mono">' + S.rec.w + '–' + S.rec.l + '</span> <small>record</small></span>' +
    (S.packs ? '<span class="pill">🎁 <span class="mono">' + S.packs + '</span> <small>packs</small></span>' : '');

  const sel = $('#decksel'); sel.innerHTML = '';
  Object.keys(STARTER_DECKS).forEach(key => {
    const sd = STARTER_DECKS[key];
    const unlocked = S.starters.indexOf(key) >= 0;
    const b = document.createElement('button');
    b.className = 'deckcard' + (S.side === key ? ' on' : '');
    b.style.setProperty('--dc', sd.c);
    b.setAttribute('aria-pressed', String(S.side === key));
    b.innerHTML =
      '<div class="e">' + sd.e + '</div>' +
      '<div class="n">' + sd.n + '</div>' +
      '<div class="vs">beats <b>' + sd.beats + '</b><br>loses to <i>' + sd.loses + '</i></div>' +
      (unlocked ? '' : '<div class="tiny" style="margin-top:4px;color:var(--gold)">🔒 400</div>');
    b.onclick = () => chooseSide(key);
    sel.appendChild(b);
  });
  $('#decktag').textContent = STARTER_DECKS[S.side] ? STARTER_DECKS[S.side].tag : '';
  const dn = d ? d.name + ' · ' + deckTotal(d.list) + ' cards' : 'no deck yet';
  $('#btn-duel').innerHTML = '⚔️ Duel <span style="font-size:10px;letter-spacing:.08em;opacity:.75">' +
    esc(dn) + '</span>';
}
function chooseSide(key){
  const sd = STARTER_DECKS[key];
  if (S.starters.indexOf(key) < 0){
    if (S.starters.length === 0){ grantStarter(key); toast(sd.n + ' deck is yours. Go ruin somebody.'); renderHome(); return; }
    if (S.coins < 400){ toast('Not enough coins. ' + (400 - S.coins) + ' short — go win a duel.'); return; }
    openSheet(
      '<h3>Unlock ' + sd.n + ' ' + sd.e + '</h3><p class="muted">' + esc(sd.tag) + '</p>' +
      '<p class="muted">40 cards for <b>400 coins</b>. You have ' + S.coins + '.</p>' +
      '<div class="opts"><button class="btn primary" id="sh-yes">Unlock</button>' +
      '<button class="btn ghost" id="sh-no">Not today</button></div>');
    $('#sh-no').onclick = closeSheet;
    $('#sh-yes').onclick = () => {
      S.coins -= 400; grantStarter(key); closeSheet(); renderHome();
      toast(sd.n + ' unlocked.');
    };
    return;
  }
  const deck = S.decks.find(x => x.starter === key);
  S.side = key; if (deck) S.activeDeck = deck.id;
  save(); renderHome();
}

/* wired at init */
function wireHome(){
  $('#btn-duel').onclick  = () => startDuel();
  $('#btn-packs').onclick = () => go('pack');
  $('#btn-coll').onclick  = () => go('coll');
  $('#btn-deck').onclick  = () => go('deck');
  $('#btn-reset').onclick = () => {
    openSheet('<h3>Wipe everything?</h3><p class="muted">Cards, coins, decks, the lot. No going back — like that tattoo.</p>' +
      '<div class="opts"><button class="btn hot" id="w-yes">Wipe it</button>' +
      '<button class="btn ghost" id="w-no">Cancel</button></div>');
    $('#w-no').onclick = closeSheet;
    $('#w-yes').onclick = () => { localStorage.removeItem(SAVE_KEY); S = DEFAULT_STATE(); save(); closeSheet(); renderHome(); toast('Clean slate.'); };
  };
  $('#pack-back').onclick = () => go('home');
  $('#coll-back').onclick = () => go('home');
  $('#deck-back').onclick = () => go('home');
}
