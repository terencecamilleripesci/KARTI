/* ═══════════════════════════════════════════════════════════════════
   KARTI — gacha.js
   IL-QASMA — the starter roll.

   A new player does not get to browse all seven decks and pick the best
   one. The game rolls THREE of them, face down, and you tap to flip each
   one open. Then you keep exactly one.

   Two rules that matter:
     · the roll is written to the save the moment it is rolled, BEFORE you
       choose — reloading the page gives you the same three, every time.
     · the three are always distinct.

   The other four decks are not dead content: any locked starter can still
   be bought for 400 coins on the home screen, and the two you rolled but
   did not keep are discounted to 250 — you have already seen them, and
   coins come from story wins and duels.

   The flip, glow, burst, sparks and screen-shake are the PACK OPENING
   animation — the same rarityFx()/particles() functions and the same
   .slot/.flipper/.aura CSS, not a second copy of it.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
if (!K) return;
const $ = K.$, esc = K.esc;

const ROLL_SIZE = 3;
const SEEN_PRICE = 250;                 /* rolled but not kept */
const FULL_PRICE = 400;

/* ───────────────────────── the roll ───────────────────────── */
function keys(){ return Object.keys(K.STARTER_DECKS); }

/* Read the saved roll, or make one and save it immediately. The save has to
   happen before the player sees anything, or they could reload to reroll. */
function roll(){
  const S = K.S;
  const all = keys();
  const cur = S.roll && Array.isArray(S.roll.opts)
    ? S.roll.opts.filter(k => K.STARTER_DECKS[k]) : null;
  if (cur && cur.length === ROLL_SIZE) return S.roll;

  const bag = all.slice();
  const opts = [];
  for (let i = 0; i < ROLL_SIZE && bag.length; i++){
    opts.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);  /* distinct by construction */
  }
  S.roll = { opts, ts: Date.now(), picked: null };
  K.save();                              /* ← locked in before a single card is shown */
  return S.roll;
}
function priceOf(key){
  const S = K.S;
  const r = S.roll;
  if (r && r.opts && r.opts.indexOf(key) >= 0 && r.picked !== key) return SEEN_PRICE;
  return FULL_PRICE;
}

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
let flipped = {}, busy = false;

function open(){
  const r = roll();
  flipped = {}; busy = false;
  paint(r);
  K.go('gacha');
}

function paint(r){
  $('#scr-gacha').innerHTML =
    '<div class="scroll">' +
      '<div class="gacha-hdr">' +
        '<h1 class="logo" style="font-size:clamp(30px,10vw,46px)">IL-QASMA</h1>' +
        '<p class="tagline">Your starter roll</p>' +
        '<p class="blurb" style="text-align:center;margin-top:10px">Three decks, face down, drawn for ' +
        'you. <b>Tap each one to turn it over</b> — then keep one. The other two stay cheap on the ' +
        'home screen if you change your mind later.</p>' +
      '</div>' +
      '<div class="rlabel" id="g-label"></div>' +
      '<div class="gacha-row" id="g-row"></div>' +
      '<p class="hint" id="g-hint">Tap the cards to reveal them</p>' +
      '<div style="height:26px"></div>' +
    '</div>';

  const row = $('#g-row');
  r.opts.forEach((key, i) => {
    const sd = K.STARTER_DECKS[key];
    const cell = document.createElement('div');
    cell.className = 'gacha-cell';

    /* same markup shape as a pack slot, so the same CSS animations apply */
    const slot = document.createElement('div');
    slot.className = 'slot gslot ' + topRarity(key);
    slot.dataset.key = key;
    slot.innerHTML = '<div class="aura"></div>';

    const flip = document.createElement('div');
    flip.className = 'flipper';
    flip.appendChild(K.backEl());
    const front = document.createElement('div');
    front.className = 'fr';
    front.appendChild(deckFace(key));
    flip.appendChild(front);
    slot.appendChild(flip);

    const tip = document.createElement('div');
    tip.className = 'tapme'; tip.textContent = 'Tap to flip';
    slot.appendChild(tip);

    cell.appendChild(slot);
    const info = document.createElement('div');
    info.className = 'gacha-info';
    info.id = 'g-info-' + i;
    cell.appendChild(info);

    slot.setAttribute('role', 'button');
    slot.tabIndex = 0;
    slot.setAttribute('aria-label', 'Face-down starter deck ' + (i + 1) + ' — tap to reveal');
    slot.onclick = () => reveal(key, i, slot);
    slot.onkeydown = e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); reveal(key, i, slot); } };
    row.appendChild(cell);
  });
}

/* the face of a rolled deck, drawn to the same proportions as a card */
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
    '<div class="e">' + sd.e + '</div>' +
    '<div class="n">' + esc(sd.name) + '</div>' +
    '<div class="a">' + at.e + ' ' + esc(at.n) + '</div>' +
    '<div class="vs">beats <b>' + esc(sd.beats) + '</b><br>loses to <i>' + esc(sd.loses) + '</i></div>';
  return el;
}

function reveal(key, i, slot){
  if (flipped[key] || busy) return;
  flipped[key] = true;
  slot.classList.add('flipped');
  const tip = slot.querySelector('.tapme'); if (tip) tip.remove();
  /* the pack opener's own rarity treatment: label, sparks, and the shake
     when something legendary turns up */
  K.rarityFx(slot, topRarity(key), $('#g-label'));

  const sd = K.STARTER_DECKS[key];
  const info = $('#g-info-' + i);
  info.innerHTML =
    '<p class="gtag">' + esc(sd.tag) + '</p>' +
    '<div class="gcards" id="g-cards-' + i + '"></div>' +
    '<button class="btn primary sm gkeep" data-key="' + esc(key) + '">Keep ' + esc(sd.name) + '</button>';
  const host = $('#g-cards-' + i);
  highlights(key, 3).forEach((c, n) => {
    const ce = K.cardEl(c, { size:'xs', tap:true });
    ce.style.animation = 'pop .34s var(--ease) both';
    ce.style.animationDelay = (n * .09) + 's';
    ce.onclick = () => K.cardViewModal(c);
    host.appendChild(ce);
  });
  info.classList.add('on');
  info.querySelector('.gkeep').onclick = () => confirmKeep(key);

  const hint = $('#g-hint');
  if (hint) hint.textContent = Object.keys(flipped).length >= ROLL_SIZE
    ? 'Now pick the one you want to keep'
    : 'Tap the others too — you can see all three before choosing';
}

function confirmKeep(key){
  const sd = K.STARTER_DECKS[key];
  const others = K.S.roll.opts.filter(k => k !== key);
  K.openSheet(
    '<h3>Keep ' + esc(sd.name) + ' ' + sd.e + '?</h3>' +
    '<p class="muted">' + esc(sd.tag) + '</p>' +
    '<p class="muted">All 40 cards land in your collection and it becomes your active deck. ' +
      'The other two — ' + others.map(k => esc(K.STARTER_DECKS[k].name)).join(' and ') +
      ' — go on the home screen at <b>' + SEEN_PRICE + ' coins</b> instead of ' + FULL_PRICE + '.</p>' +
    '<div class="opts">' +
      '<button class="btn primary" id="gk-yes">Mela. Mine.</button>' +
      '<button class="btn ghost" id="gk-no">Let me look again</button></div>');
  $('#gk-no').onclick = K.closeSheet;
  $('#gk-yes').onclick = () => {
    busy = true;
    /* SAVE FIRST, ANIMATE SECOND. If the phone dies halfway through the
       unboxing the deck is already theirs — nobody ever ends up with an
       account and no cards because an animation did not finish. */
    K.S.roll.picked = key;
    K.grantStarter(key);                 /* grants the 40 cards, builds the deck, saves */
    K.save();
    K.closeSheet();
    unbox(key);
  };
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
      '<h2 style="flex:0 1 auto;text-align:center">' + sd.e + ' ' + esc(sd.name) + '</h2>' +
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
  const el = K.cardEl(x.c, { size:'xs', tap:true });
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
  front.appendChild(K.cardEl(x.c, { size:'md' }));
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
      '<div class="big-e">' + sd.e + '</div>' +
      '<h2>' + esc(sd.name) + '</h2>' +
      '<p class="gtag">' + esc(sd.tag) + '</p>' +
      '<div class="stats" style="justify-content:center">' +
        '<span class="chip">' + at.e + ' ' + esc(at.n) + '</span>' +
        '<span class="chip">beats <b style="color:var(--ok)">' + esc(sd.beats) + '</b></span>' +
        '<span class="chip">loses to <b style="color:var(--bad)">' + esc(sd.loses) + '</b></span>' +
      '</div>' +
      '<div class="stats" style="justify-content:center">' +
        '<span class="chip">⚔️ ' + kinds('monster') + '</span>' +
        '<span class="chip">🟩 ' + kinds('spell') + '</span>' +
        '<span class="chip">🟥 ' + kinds('trap') + '</span>' +
      '</div>' +
      '<div class="stats" style="justify-content:center">' +
        Object.keys(K.RARITY).map(r => count(r)
          ? '<span class="chip"><i style="width:8px;height:8px;border-radius:50%;background:' +
            K.RARITY[r].c + ';display:inline-block;margin-right:5px"></i>' + K.RARITY[r].n +
            ' <b>' + count(r) + '</b></span>' : '').join('') +
      '</div>' +
      '<p class="tiny" style="margin-top:10px">THE ONES THEY WILL REMEMBER</p>' +
      '<div class="gcards" id="ub-best"></div>' +
      '<div style="display:grid;gap:9px;width:100%;margin-top:14px">' +
        '<button class="btn primary" id="ub-go">Mela. Let me at them.</button>' +
        '<button class="btn ghost sm" id="ub-deck">🛠️ Open the deck builder</button>' +
      '</div>' +
    '</div>';
  const bh = $('#ub-best');
  best.forEach(x => {
    const el = K.cardEl(x.c, { size:'xs', tap:true });
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
                       unbox, summary, tally, ROLL_SIZE, SEEN_PRICE, FULL_PRICE,
                       get skipping(){ return skipAll; } };

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', claim);
else claim();

})();
