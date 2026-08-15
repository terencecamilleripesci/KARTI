/* ═══════════════════════════════════════════════════════════════════
   KARTI — gacha.js
   IL-QASMA — the blind pick.

   There are exactly THREE beginner decks, one on each attribute of the
   counter triangle (FESTA -> CITY -> FARM -> FESTA). You are shown all
   three, face up, with everything they do. Then they turn over, they get
   shuffled in front of you, and you take one without knowing which.

   Three-card monte, except the house is not cheating.

   Three rules that matter:
     · you SEE all three before anything is hidden — this is not a mystery
       box, you know exactly what the three possible outcomes are;
     · the assignment of decks to the three face-down positions is decided
       and WRITTEN TO THE SAVE before a single card turns over, so reloading
       the page cannot reroll it, and it is never written into the DOM —
       the shuffle animation is decoration, the answer is not in the markup;
     · what you get is the whole of your starting collection. There are no
       other ready-made decks for sale. Everything after this comes out of
       packs and gets built by hand in the deck builder.

   The flip, glow, burst, sparks and screen-shake are the PACK OPENING
   animation — the same rarityFx()/particles() functions and the same
   .slot/.flipper/.aura CSS, not a second copy of it.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
if (!K) return;
const $ = K.$, esc = K.esc;

/* The three beginner decks, and the only decks the game ever hands out.
   One per ring attribute, so the counter triangle is symmetric: every
   beginner beats exactly one of the others and loses to exactly one.
   Anything else in STARTER_DECKS (SEA, TROUBLE, IL-KAZIN, IL-FAMILJA) is
   a reference list for the deck builder and the story bosses, not a
   starter — see js/cards.js. */
const BEGINNER = ['festa', 'belt', 'razzett'];
const ROLL_SIZE = BEGINNER.length;
const SEEN_PRICE = 0, FULL_PRICE = 0;   /* nothing is for sale any more */

/* ───────────────────────── the shuffle ─────────────────────────
   Fisher-Yates off crypto.getRandomValues where the browser has it, so the
   order is not a Math.random() sequence anybody could line up with a seed. */
function rand(n){
  const c = window.crypto || window.msCrypto;
  if (c && c.getRandomValues){
    const lim = Math.floor(0x100000000 / n) * n;      /* reject the biased tail */
    const a = new Uint32Array(1);
    let v;
    do { c.getRandomValues(a); v = a[0]; } while (v >= lim);
    return v % n;
  }
  return Math.floor(Math.random() * n);
}
function shuffled(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){ const j = rand(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/* ───────────────────────── the roll ─────────────────────────
   opts  = the three decks, in the order they are SHOWN face up
   slots = which deck is actually sitting under each face-down position.
           This is the secret. It is decided here, saved here, and never
           put in the DOM. */
function roll(){
  const S = K.S;
  const cur = S.roll;
  const ok = cur && Array.isArray(cur.opts) && Array.isArray(cur.slots) &&
             cur.slots.length === ROLL_SIZE &&
             cur.slots.every(k => K.STARTER_DECKS[k]) &&
             cur.opts.every(k => K.STARTER_DECKS[k]);
  if (ok) return cur;

  S.roll = { opts: BEGINNER.slice(), slots: shuffled(BEGINNER), ts: Date.now(), picked: null };
  K.save();                              /* locked in before a single card is shown */
  return S.roll;
}
/* Kept because game.js still calls it while the buy-a-starter flow is being
   removed. Nothing is purchasable now, so it always answers "not for sale". */
function priceOf(){ return null; }

/* the three loudest cards in a deck, best rarity first — the showing-off bit */
const RANK = { leggendarju:3, epiku:2, rari:1, komuni:0 };
function highlights(key, n){
  const list = K.STARTER_DECKS[key].list;
  return Object.keys(list)
    .map(K.cardById).filter(Boolean)
    .sort((a, b) => (RANK[b.r] - RANK[a.r]) || ((b.atk || 0) - (a.atk || 0)))
    .slice(0, n || 3);
}
const topRarity = key => highlights(key, 1)[0] ? highlights(key, 1)[0].r : 'komuni';

/* ───────────────────────── screen ───────────────────────── */
let stage = 'look', busy = false, chosenSlot = -1;

function open(){
  roll();                                 /* saved before anything is drawn */
  stage = 'look'; busy = false; chosenSlot = -1;
  paintLook();
  K.go('gacha');
}

/* ── stage 1: all three, face up, nothing hidden ── */
function paintLook(){
  const r = K.S.roll;
  $('#scr-gacha').innerHTML =
    '<div class="scroll">' +
      '<div class="gacha-hdr">' +
        '<h1 class="logo" style="font-size:clamp(30px,10vw,46px)">IL-QASMA</h1>' +
        '<p class="tagline">The three beginner decks</p>' +
        '<p class="blurb" style="text-align:center;margin-top:10px">These are the three. ' +
        'Each one beats one of the others and loses to one of the others — no deck here is a ' +
        'worse start than another. <b>Have a good look.</b> Then they go face down, they get ' +
        'shuffled, and you take one without knowing which.</p>' +
      '</div>' +
      '<div class="gacha-row" id="g-row"></div>' +
      '<p class="hint" id="g-hint">Tap any card to read it properly</p>' +
      '<div class="savebar" style="position:static;margin-top:10px">' +
        '<button class="btn primary" id="g-shuffle" style="flex:1">Ħallathom — turn them over and shuffle</button>' +
      '</div>' +
      '<div style="height:26px"></div>' +
    '</div>';

  const row = $('#g-row');
  r.opts.forEach((key, i) => row.appendChild(cell(key, i, true)));
  $('#g-shuffle').onclick = doShuffle;
}

/* one deck cell. face-up when `show`, otherwise a plain back with no clue on it */
function cell(key, i, show){
  const wrap = document.createElement('div');
  wrap.className = 'gacha-cell';
  wrap.id = 'g-cell-' + i;
  wrap.style.transition = 'transform .42s var(--ease)';

  const slot = document.createElement('div');
  slot.className = 'slot gslot ' + (show ? topRarity(key) : 'komuni');
  /* deliberately NO data-key, no id, no class that names the deck: once these
     are face down the markup must not give the answer away */
  slot.innerHTML = '<div class="aura"></div>';

  const flip = document.createElement('div');
  flip.className = 'flipper';
  flip.appendChild(K.backEl());
  const front = document.createElement('div');
  front.className = 'fr';
  if (show) front.appendChild(deckFace(key));
  flip.appendChild(front);
  slot.appendChild(flip);
  if (show) slot.classList.add('flipped');
  wrap.appendChild(slot);

  const info = document.createElement('div');
  info.className = 'gacha-info' + (show ? ' on' : '');
  info.id = 'g-info-' + i;
  if (show){
    const sd = K.STARTER_DECKS[key];
    info.innerHTML = '<p class="gtag">' + esc(sd.tag) + '</p><div class="gcards" id="g-cards-' + i + '"></div>';
  }
  wrap.appendChild(info);
  if (show){
    const host = info.querySelector('.gcards');
    highlights(key, 3).forEach((c, n) => {
      const ce = K.cardEl(c, { size:'xs', tap:true });
      ce.style.animation = 'pop .34s var(--ease) both';
      ce.style.animationDelay = (n * .09) + 's';
      ce.onclick = () => K.cardViewModal(c);
      host.appendChild(ce);
    });
  }
  return wrap;
}

/* the face of a beginner deck, drawn to the same proportions as a card */
function deckFace(key){
  const sd = K.STARTER_DECKS[key];
  const attr = sd.f || key;
  const at = K.ATTR[attr] || { n:'?', e:'?' };
  const el = document.createElement('div');
  el.className = 'deckface';
  el.style.setProperty('--dc', sd.c);
  const pk = K.uiArt && K.uiArt('pack', 'pack-' + attr + '.png');
  el.innerHTML =
    (pk ? '<img class="packart" src="' + pk + '" alt="" onerror="this.remove()">' : '') +
    '<div class="e">' + K.ico(K.ATTR_ICON[attr] || 'deck') + '</div>' +
    '<div class="n">' + esc(sd.name) + '</div>' +
    '<div class="a">' + K.ico(K.ATTR_ICON[attr]) + ' ' + esc(at.n) + '</div>' +
    '<div class="vs">beats <b>' + esc(sd.beats) + '</b><br>loses to <i>' + esc(sd.loses) + '</i></div>';
  return el;
}

/* ── stage 2: turn them over and move them about ── */
async function doShuffle(){
  if (busy) return;
  busy = true;
  stage = 'shuffle';
  const btn = $('#g-shuffle');
  if (btn){ btn.disabled = true; btn.textContent = 'Ħallathom...'; }

  /* flip everything face down first */
  const slots = Array.from(document.querySelectorAll('#g-row .slot'));
  slots.forEach(s => s.classList.remove('flipped'));
  document.querySelectorAll('#g-row .gacha-info').forEach(el => { el.classList.remove('on'); el.innerHTML = ''; });
  await K.wait(420);

  /* the swap animation. Purely cosmetic — which deck is under which position
     was settled by roll() before any of this ran. */
  const cells = [0, 1, 2].map(i => $('#g-cell-' + i));
  const w = cells[0] ? cells[0].getBoundingClientRect().width + 12 : 120;
  for (let n = 0; n < 5; n++){
    const a = n % 3, b = (n + 1 + (n % 2)) % 3;
    if (a === b) continue;
    cells[a].style.transform = 'translateX(' + ((b - a) * w) + 'px)';
    cells[b].style.transform = 'translateX(' + ((a - b) * w) + 'px)';
    await K.wait(200);
    cells[a].style.transform = '';
    cells[b].style.transform = '';
    await K.wait(120);
  }

  paintPick();
  busy = false;
}

/* ── stage 3: pick one, blind ── */
function paintPick(){
  stage = 'pick';
  $('#scr-gacha').innerHTML =
    '<div class="scroll">' +
      '<div class="gacha-hdr">' +
        '<h1 class="logo" style="font-size:clamp(30px,10vw,46px)">IL-QASMA</h1>' +
        '<p class="tagline">Now take one</p>' +
        '<p class="blurb" style="text-align:center;margin-top:10px">FESTA, CITY and FARM are all ' +
        'still in there, one of each. Nobody knows which is which any more — <b>including the ' +
        'phone, until you tap.</b> Go on.</p>' +
      '</div>' +
      '<div class="rlabel" id="g-label"></div>' +
      '<div class="gacha-row" id="g-row"></div>' +
      '<p class="hint" id="g-hint">Tap one. That is your deck.</p>' +
      '<div style="height:26px"></div>' +
    '</div>';
  const row = $('#g-row');
  for (let i = 0; i < ROLL_SIZE; i++){
    const c = cell(null, i, false);
    const slot = c.querySelector('.slot');
    const tip = document.createElement('div');
    tip.className = 'tapme'; tip.textContent = 'Take this one';
    slot.appendChild(tip);
    slot.setAttribute('role', 'button');
    slot.tabIndex = 0;
    slot.setAttribute('aria-label', 'Face-down deck ' + (i + 1) + ' of ' + ROLL_SIZE + ' — tap to take it');
    slot.onclick = () => confirmKeep(i);
    slot.onkeydown = e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); confirmKeep(i); } };
    row.appendChild(c);
  }
}

function confirmKeep(i){
  if (busy || stage !== 'pick') return;
  K.openSheet(
    '<h3>Take the ' + ['first', 'middle', 'last'][i] + ' one?</h3>' +
    '<p class="muted">One of FESTA, CITY or FARM. You will find out which in about two seconds, ' +
      'and all 40 of its cards land in your collection.</p>' +
    '<p class="muted">There is no swapping afterwards and there are no other ready-made decks — ' +
      'everything else in this game gets collected out of packs and built by hand.</p>' +
    '<div class="opts">' +
      '<button class="btn primary" id="gk-yes">Mela. That one.</button>' +
      '<button class="btn ghost" id="gk-no">Let me look at them again</button></div>');
  $('#gk-no').onclick = K.closeSheet;
  $('#gk-yes').onclick = () => {
    busy = true;
    chosenSlot = i;
    const key = K.S.roll.slots[i];
    /* Which of these 40 are genuinely NEW has to be read BEFORE the grant —
       one line later every single one of them is owned and the answer is
       always "no". This is the easy bug and this is where it lives. */
    freshBefore(key);
    /* SAVE FIRST, ANIMATE SECOND. If the phone dies halfway through the
       unboxing the deck is already theirs — nobody ever ends up with an
       account and no cards because an animation did not finish. */
    K.S.roll.picked = key;
    K.grantStarter(key);                 /* grants the 40 cards, builds the deck, saves */
    K.save();
    K.closeSheet();
    revealThen(i, key);
  };
}

/* turn the chosen card over on the spot, then go into the unboxing */
async function revealThen(i, key){
  const wrap = $('#g-cell-' + i);
  if (wrap){
    const slot = wrap.querySelector('.slot');
    const tip = slot.querySelector('.tapme'); if (tip) tip.remove();
    slot.querySelector('.fr').appendChild(deckFace(key));
    slot.classList.add(topRarity(key));
    slot.classList.add('flipped');
    K.rarityFx(slot, topRarity(key), $('#g-label'));
    document.querySelectorAll('#g-row .gacha-cell').forEach((el, n) => {
      if (n !== i){ el.style.opacity = '.35'; el.style.transform = 'scale(.9)'; }
    });
    const hint = $('#g-hint');
    if (hint) hint.textContent = K.STARTER_DECKS[key].name + ' it is.';
    await K.wait(1100);
  }
  unbox(key);
}

/* ═══════════════════════════════════════════════════════════════════
   THE UNBOXING
   The deck is already in the collection by the time any of this runs.
   Commons cascade in as a group, then every rare / epic / legendary turns
   over on its own with the pack opener's rarity treatment — weakest first
   so the legendary is the last thing they see. Skippable at any point.
   ═══════════════════════════════════════════════════════════════════ */
const RVAL = { komuni:0, rari:1, epiku:2, leggendarju:3 };
let skipAll = false, hurry = false;

/* The ids the player did not own a moment before the deck was granted. Read
   once, up front (see the note at the grant), and used all the way through the
   unboxing so a brand-new card gets its NEW banner and a duplicate does not. */
let FRESH = Object.create(null);
function freshBefore(key){
  FRESH = Object.create(null);
  const list = (K.STARTER_DECKS[key] || {}).list || {};
  Object.keys(list).forEach(id => {
    if (!(K.S.owned && K.S.owned[id] > 0)) FRESH[id] = true;
  });
  return FRESH;
}
const isFresh = card => !!(card && FRESH[card.id]);

function tally(key){
  const list = K.STARTER_DECKS[key].list;
  return Object.keys(list).map(id => ({ c:K.cardById(id), n:list[id] })).filter(x => x.c);
}

async function unbox(key){
  const sd = K.STARTER_DECKS[key];
  const all = tally(key);
  const commons = all.filter(x => x.c.r === 'komuni');
  const stars = all.filter(x => x.c.r !== 'komuni')
    .sort((a, b) => (RVAL[a.c.r] - RVAL[b.c.r]) || ((a.c.atk || 0) - (b.c.atk || 0)));
  skipAll = false; hurry = false;

  $('#scr-gacha').innerHTML =
    '<div class="tbar" style="justify-content:center">' +
      '<h2 style="flex:0 1 auto;text-align:center">' +
        K.ico(K.ATTR_ICON[sd.f || key] || 'deck') + ' ' + esc(sd.name) + '</h2>' +
    '</div>' +
    '<div class="scroll" id="ub-scroll">' +
      '<p class="blurb" style="text-align:center">Forty cards. Yours. Let us have a look at them.</p>' +
      '<div class="rlabel" id="ub-label"></div>' +
      '<div class="ub-stage" id="ub-stage"></div>' +
      '<div class="ub-tray" id="ub-tray"></div>' +
    '</div>' +
    '<div class="savebar">' +
      '<button class="btn ghost sm" id="ub-skip" style="flex:1">⏩ Reveal everything</button>' +
    '</div>';
  $('#ub-skip').onclick = () => { skipAll = true; };
  $('#ub-stage').onclick = () => { hurry = true; };

  const tray = $('#ub-tray');
  /* 1 — the commons, all at once, as a quick cascade */
  const head = document.createElement('div');
  head.className = 'dhead';
  head.innerHTML = '<span>THE WORKING CARDS</span><span>' +
    commons.reduce((a, x) => a + x.n, 0) + '</span>';
  tray.appendChild(head);
  const grid = document.createElement('div');
  grid.className = 'ub-grid';
  tray.appendChild(grid);
  for (let i = 0; i < commons.length; i++){
    grid.appendChild(miniCard(commons[i]));
    if (!skipAll) await K.wait(38);
  }

  /* 2 — one at a time, worst to best */
  const shead = document.createElement('div');
  shead.className = 'dhead';
  shead.innerHTML = '<span>AND THE ONES THAT MATTER</span><span>' +
    stars.reduce((a, x) => a + x.n, 0) + '</span>';
  tray.appendChild(shead);
  const sgrid = document.createElement('div');
  sgrid.className = 'ub-grid';
  tray.appendChild(sgrid);

  for (const x of stars){
    if (skipAll){ sgrid.appendChild(miniCard(x)); continue; }
    await bigReveal(x);
    sgrid.appendChild(miniCard(x));
  }
  $('#ub-stage').innerHTML = '';
  summary(key, all);
}

function miniCard(x){
  const cell = document.createElement('div');
  cell.className = 'gcell';
  const el = K.cardEl(x.c, { size:'xs', tap:true, isNew: isFresh(x.c) });
  el.onclick = () => K.cardViewModal(x.c);
  el.style.animation = 'pop .3s var(--ease) both';
  cell.appendChild(el);
  if (x.n > 1){
    const b = document.createElement('span');
    b.className = 'cnt'; b.textContent = '×' + x.n;
    cell.appendChild(b);
  }
  return cell;
}

/* one card, flipped on the stage, with the pack opener's own rarity effects */
async function bigReveal(x){
  const stage = $('#ub-stage');
  if (!stage) return;
  stage.innerHTML = '';
  const slot = document.createElement('div');
  slot.className = 'slot ubslot ' + x.c.r;
  slot.innerHTML = '<div class="aura"></div>';
  const flip = document.createElement('div');
  flip.className = 'flipper';
  flip.appendChild(K.backEl());
  const front = document.createElement('div');
  front.className = 'fr';
  front.appendChild(K.cardEl(x.c, { size:'md', isNew: isFresh(x.c) }));
  if (x.n > 1){
    const b = document.createElement('span');
    b.className = 'cnt'; b.textContent = '×' + x.n;
    front.appendChild(b);
  }
  flip.appendChild(front);
  slot.appendChild(flip);
  stage.appendChild(slot);

  hurry = false;
  await K.wait(120);
  slot.classList.add('flipped');
  K.rarityFx(slot, x.c.r, $('#ub-label'));
  const hold = x.c.r === 'leggendarju' ? 1500 : x.c.r === 'epiku' ? 900 : 620;
  for (let t = 0; t < hold && !hurry && !skipAll; t += 60) await K.wait(60);
}

/* ───────────────────────── the summary ───────────────────────── */
function summary(key, all){
  const sd = K.STARTER_DECKS[key];
  const attr = sd.f || key;
  const at = K.ATTR[attr] || { n:'?', e:'?' };
  const count = r => all.filter(x => x.c.r === r).reduce((a, x) => a + x.n, 0);
  const kinds = t => all.filter(x => x.c.t === t).reduce((a, x) => a + x.n, 0);
  const best = all.slice().sort((a, b) => (RVAL[b.c.r] - RVAL[a.c.r]) || ((b.c.atk || 0) - (a.c.atk || 0)))
    .slice(0, 3);

  const stage = $('#ub-stage');
  stage.innerHTML =
    '<div class="ub-sum">' +
      '<div class="big-e">' + K.ico(K.ATTR_ICON[attr] || 'deck') + '</div>' +
      '<h2>' + esc(sd.name) + '</h2>' +
      '<p class="gtag">' + esc(sd.tag) + '</p>' +
      '<div class="stats" style="justify-content:center">' +
        '<span class="chip">' + K.ico(K.ATTR_ICON[attr]) + ' ' + esc(at.n) + '</span>' +
        '<span class="chip">beats <b style="color:var(--ok)">' + esc(sd.beats) + '</b></span>' +
        '<span class="chip">loses to <b style="color:var(--bad)">' + esc(sd.loses) + '</b></span>' +
      '</div>' +
      '<div class="stats" style="justify-content:center">' +
        '<span class="chip">' + K.ico('type-monster', 'Monsters') + kinds('monster') + '</span>' +
        '<span class="chip">' + K.ico('type-spell', 'Spells') + kinds('spell') + '</span>' +
        '<span class="chip">' + K.ico('type-trap', 'Traps') + kinds('trap') + '</span>' +
      '</div>' +
      '<div class="stats" style="justify-content:center">' +
        Object.keys(K.RARITY).map(r => count(r)
          ? '<span class="chip"><span style="color:' + K.RARITY[r].c + '">' +
            K.ico(K.RARITY_ICON[r]) + '</span>' + K.RARITY[r].n +
            ' <b>' + count(r) + '</b></span>' : '').join('') +
      '</div>' +
      '<p class="tiny" style="margin-top:10px">THE ONES THEY WILL REMEMBER</p>' +
      '<div class="gcards" id="ub-best"></div>' +
      '<div style="display:grid;gap:9px;width:100%;margin-top:14px">' +
        '<button class="btn primary" id="ub-go">Mela. Let me at them.</button>' +
        '<button class="btn ghost sm" id="ub-deck">' +
          K.ilb('deck', 'Open the deck builder') + '</button>' +
      '</div>' +
    '</div>';
  const bh = $('#ub-best');
  best.forEach(x => {
    const el = K.cardEl(x.c, { size:'xs', tap:true, isNew: isFresh(x.c) });
    el.onclick = () => K.cardViewModal(x.c);
    bh.appendChild(el);
  });
  const sk = $('#ub-skip');
  if (sk) sk.parentNode.style.display = 'none';
  $('#ub-go').onclick = () => { busy = false; K.toast(sd.name + ' is yours. Now go ruin somebody\'s afternoon.'); K.go('home'); };
  $('#ub-deck').onclick = () => { busy = false; K.go('deck'); };
  const sc = $('#ub-scroll');
  if (sc) sc.scrollTop = 0;
}

/* game.js boots (and may already have painted the home screen) BEFORE this file
   finishes loading, so on a cold reload we have to claim the screen back —
   otherwise a reload would drop a deckless player onto the free-pick deck list
   and the whole roll could be dodged. */
function claim(){
  if (!K.S || (K.S.starters && K.S.starters.length)) return;
  if (!document.querySelector('#scr-home.on')) return;
  open();
}
window.KARTI_GACHA = { open, roll, priceOf, highlights, topRarity, claim,
                       unbox, summary, tally, BEGINNER, ROLL_SIZE,
                       SEEN_PRICE, FULL_PRICE,
                       get skipping(){ return skipAll; } };

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', claim);
else claim();

})();
