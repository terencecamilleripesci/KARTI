/* ═══════════════════════════════════════════════════════════════════
   KARTI — story.js
   IL-KAMPJONAT — the story ladder. Eight bosses, each with a deck built
   from the existing 200 cards, a mouth on them, and a pack for whoever
   shuts them up. Difficulty climbs, and every boss sits somewhere on the
   five-way counter ring so you have to think about which side you bring.

   Loads AFTER game.js and ai.js. Talks to the engine only through
   window.KARTI, and saves progress into the existing per-user save.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
if (!K) return;
const $ = K.$, esc = K.esc;

/* ═══════════════════════════════════════════════════════════════════
   THE LADDER
   attr = the attribute the deck leans on, so the counter ring bites:
   FESTA -> CITY -> FARM -> SEA -> TROUBLE -> FESTA
   Every list below is exactly 40 cards, max 3 of anything (checked by
   the test harness — if you edit one, re-run it).
   ═══════════════════════════════════════════════════════════════════ */
/* `e` is the boss's PORTRAIT fallback, not UI chrome: the real portraits live at
   art/ui/boss-<attr>.png and faceHTML() hides the emoji the moment one loads.
   Same rule as the per-card `e` in cards.js — leave it alone. */
const BOSSES = [
  {
    id:'cikku', n:'ĊIKKU TAL-KAŻIN', e:'🍻', attr:'festa', diff:'tourist',
    rank:'Round 1 · The Band Club',
    intro:'Eh ħi, sit down, sit down! Four beers in and I have never lost a game of cards in my life. ' +
          'I have never won one either, but that is the barman\'s fault.',
    taunts:['Ara! Did you see that? Neither did I.',
            'My wife said be home by ten. She has been saying that since 1998.',
            'Two more beers and I start playing properly. That is a promise and a threat.'],
    win:'I TOLD you! Now who is buying? Not me. I am the champion.',
    lose:'You got lucky. I was drinking, the lights were in my eyes, and it is not even my deck.',
    reward:{ coins:150, packs:1 },
    list:{ sparkler:3, abbati:3, qniepen:3, bomba:2, banda2:3, partitarju:3, armar:2,
           bandist:2, girandola:2, kavallier:2,
           kinnie:3, granita:2, helwa:2, tea:2,
           hofra:3, qtar:2, zibel:1 }
  },
  {
    id:'doris', n:'DORIS TAL-KUNSILL', e:'📋', attr:'belt', diff:'tourist',
    rank:'Round 2 · The Local Council',
    intro:'You need a permit to duel here. You do not have one. Fill in this form, come back Thursday, ' +
          'and I will tell you the form has changed.',
    taunts:['That is not the right form.',
            'Come back Thursday.',
            'I go on break in four minutes and after that I am not moving.'],
    win:'Denied. You may appeal in writing, within fifteen days, in triplicate.',
    lose:'Fine. Approved. But I am noting in the file that you were rude to me.',
    reward:{ coins:180, packs:1 },
    /* Round 2 used to be EASIER than round 1 — 94% against a beginner, because
       twenty-seven bodies with an average of nine hundred ATK cannot take a life
       point off anybody. She keeps the queue and the forms; the drill, the crane
       and the speed camera are what give her something to actually hit with. */
    list:{ kju:1, hanut:3, rota:2, kaxxier:3, sinjal:2, bus:3, burokrat:3,
           skavaturi:2, krejn:1, spettur:2, kunsill:2, penthouse:2, kera:1,
           qassata:3, mistura:2, bulldozer:2,
           wegha:3, barriera:2, garanzija:1 }
  },
  {
    id:'guzi', n:'ĠUŻI L-BIDWI', e:'🚜', attr:'razzett', diff:'regular',
    rank:'Round 3 · Burmarrad',
    intro:'You parked in my field. I have the tractor, I have the dogs, and I have absolutely nothing ' +
          'else on today.',
    taunts:['In my day we played this with real cards and real consequences.',
            'Those dogs have not been fed since the argument started.',
            'You town people. Look at those hands. Soft.'],
    win:'Now move the car, before the dogs finish their lunch.',
    lose:'Take the rabbit. Take it. At least your mother will cook it properly.',
    reward:{ coins:220, packs:1 },
    list:{ bebbux:2, patata:2, tigiega:3, hanzir:3, frawli:2, bidwi:3, hmar:3, bettieha:2,
           ghasfur:2, kaccatur:2, klieb:2, kelb:2, raddiena:2, tigrija:1,
           ftira:2, imnarja:2,
           qattus:3, hass:2 }
  },
  {
    id:'salvu', n:'IL-KAPTAN SALVU', e:'⛵', attr:'bahar', diff:'regular',
    rank:'Round 4 · The Slipway',
    intro:'Fifty years on that boat. I have seen storms the records say never happened. I also saw you ' +
          'park on the slipway, and we will be discussing that afterwards.',
    taunts:['It was THIS big. The fish. Not your deck.',
            'The eye on the luzzu is watching you. It has always watched you.',
            'Factor 50 was right there in the shop and you walked straight past it.'],
    win:'Back to the beach, sur. The water is mine.',
    lose:'Alright. But you are carrying the cooler up the steps.',
    reward:{ coins:260, packs:1 },
    /* the jet ski and the third fish trap replaced two 400-ATK souvenirs: round
       4 was measured EASIER than round 3, and a boat full of sunbathers who
       cannot reach a life total is not a fight. */
    list:{ rizzi:1, kajakk:2, lampuka:3, klamari:3, kurrent:2, nassa:3, mask:2, jetski:2,
           qarnita:3, dghajsa:2, bahri:2, regatta:2, pixxispad:2, mewga:1, sirena:1,
           baharkalm:2, xita:2,
           ncempel:2, dawl:2, bolla:1 }
  },
  {
    id:'kunjata', n:'IL-KUNJATA', e:'👵', attr:'hazen', diff:'regular',
    rank:'Round 5 · Sunday Lunch',
    intro:'So. You are the one. I have heard absolutely everything about you, and not one word of it ' +
          'from you.',
    taunts:['My daughter could have married a notary.',
            'This is how you hold your cards? Bħal tifel.',
            'I am not saying anything. I am only looking.'],
    win:'Lunch is at twelve on Sunday. Do not be late, and do not wear that shirt.',
    lose:'Well. You are still not what I would have chosen. But you can carve, I will give you that.',
    reward:{ coins:300, packs:2 },
    /* same reason as round 4: the voice note and the evil eye were 500 and 800
       ATK of pure atmosphere. The runaway karozzin and the family group chat
       are the same joke with something behind it. */
    list:{ ghajn:1, qarrejja:2, kuntu:2, gar:3, gossip:3, debtor:2, skiet:3,
           kunjatu:2, bocci:2, karozzin:2, group:1, wirt:2, ommgharusa:2, spiter:2, vat:1,
           screenshot:3, mistura:2,
           ommok:2, garanzija:2, tiswija:1 }
  },
  {
    id:'kuntrattur', n:'IS-SUR KUNTRATTUR', e:'👷', attr:'belt', diff:'nanna',
    rank:'Round 6 · Site Meeting',
    intro:'The job starts Monday. It started three Mondays ago, but this Monday is the real one. ' +
          'Deposit first, sur.',
    taunts:['Next week, sur.',
            'That is extra. That was always extra.',
            'The permit says minor internal works.'],
    win:'I will send the final invoice. And then a second final invoice.',
    lose:'Alright, alright. I will come Tuesday with the man who actually does the work.',
    reward:{ coins:340, packs:2 },
    list:{ vespa:2, skavaturi:3, krejn:3, bouncer:2, spettur:2, kunsill:2, sinjal:2,
           penthouse:2, kuntrattur:3, taxxa:2, bank:2, notar:2, kera:2, tribunal:1, ministru:1,
           bulldozer:2, tapit:1, kappella:1,
           qtar:2, ommok:2, hofra:1 }
  },
  {
    id:'vat', n:'L-ISPETTUR TAL-VAT', e:'🧾', attr:'hazen', diff:'nanna',
    rank:'Round 7 · The Back Office',
    intro:'Six years of receipts. Every single one. I have the whole afternoon, and I brought a sandwich.',
    taunts:['And this one — in cash, was it?',
            'Interesting. Very interesting. I am noting that down.',
            'Your books say Tuesday. The entire village says Saturday.'],
    win:'Payment plan. Thirty-six months. Sign at the bottom, and again at the top.',
    lose:'Nothing to declare. This time.',
    reward:{ coins:400, packs:2 },
    list:{ email:2, qarrejja:2, partit:3, festin:2, karaoke:3, kugin:2, kunjatu:2, karozzin:2,
           group:2, boss:2, wirt:2, kondominju:2, kredituri:2, vat:2, nannaslip:1,
           screenshot:2, cavetta:1, tapit:1,
           nannathares:1, ommok:2, garanzija:2 }
  },
  {
    id:'nanna', n:'NANNA', e:'🍝', attr:'razzett', diff:'nanna', final:true,
    rank:'Final · Her Kitchen',
    intro:'Sit. Eat, you are too thin. Then I am going to take everything you own, and you are going ' +
          'to thank me for it.',
    taunts:['Eat.',
            'I saw what you did in 1988. I saw all of it.',
            'Your cousin came second in his exams. And he still visits every Sunday.'],
    win:'Come back next week. Bring the plate back. And bring an appetite.',
    lose:'Good boy. Now finish the plate before you start celebrating.',
    reward:{ coins:600, packs:3 },
    /* REBUILT, because the final boss was measured as the EASIEST of the last
       three: a beginner beat her 81% of the time while the two bosses before
       her held them to 49% and 44%. The reason was the mistake cards.js already
       warns about in capital letters — she had NINETEEN tribute monsters behind
       nine free bodies, so most of her hand could not be played and she stood
       there being a lovely old lady with nothing on the table.
       Same kitchen, same jokes, same FARM: eighteen free bodies (twelve of them
       doing something the turn they land), five payoffs, and a back row that
       actually answers. She is now the hardest fight on the ladder. */
    list:{ fenek:3, patata:3, gbejna:2, bettieha:2, hmar:2, ghasfur:2, nannu:2, klieb:2,
           zija:2, kaccatur:1, mahzen:1, nannaslip:1,
           kafe:2, wirja:2, tapit:2, kappella:1, imnarja:1, mistura:1,
           nannathares:2, ommok:2, qattus:2, hass:1, garanzija:1 }
  }
];

const byId = id => BOSSES.find(b => b.id === id);

/* Portrait art if the art pack is on this deploy, emoji if not.
   Prefer the boss's OWN portrait (boss-<id>.png). The attribute-keyed art only
   covers 5 factions but there are 8 bosses, so doris/kuntrattur, kunjata/vat
   and guzi/nanna were each wearing another character's face. The onerror
   fallback walks down to the attribute portrait and then to the emoji, so a
   deploy without the per-boss art still looks exactly as it did before. */
function faceHTML(b, cls){
  const own  = K.uiArt && K.uiArt('boss', 'boss-' + b.id + '.png');
  const attr = K.uiArt && K.uiArt('boss', b.final ? 'boss-final.png' : 'boss-' + b.attr + '.png');
  const src  = own || attr;
  const alt  = own && attr && own !== attr ? attr : '';
  return '<span class="' + (cls || 'face') + '">' +
    (src ? '<img src="' + src + '" alt=""' +
      (alt ? ' data-alt="' + alt + '" onerror="if(this.dataset.alt){this.src=this.dataset.alt;this.removeAttribute(\'data-alt\');}else{this.remove();}"'
           : ' onerror="this.remove()"') + '>' : '') +
    '<span class="em">' + b.e + '</span></span>';
}

/* ───────────────────────── progress (per user save) ───────────────────────── */
function story(){
  const S = K.S;
  if (!S.story || typeof S.story !== 'object') S.story = { cleared:{} };
  if (!S.story.cleared) S.story.cleared = {};
  return S.story;
}
const isCleared = id => !!story().cleared[id];
function unlockedUpTo(){
  let i = 0;
  while (i < BOSSES.length && isCleared(BOSSES[i].id)) i++;
  return i;                                   /* index of the next one to fight */
}
const isUnlocked = i => i <= unlockedUpTo();
const clearedCount = () => BOSSES.filter(b => isCleared(b.id)).length;

/* ───────────────────────── the ladder screen ───────────────────────── */
function render(){
  const host = $('#scr-story');
  const done = clearedCount();
  host.innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="st-back" aria-label="Back to home">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Story Mode</h2>' +
      '<span class="pill mono">' + done + '/' + BOSSES.length + '</span>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="storyhdr">' +
        '<p class="prog">' + (done === BOSSES.length
          ? K.ico('star') + ' THE WHOLE VILLAGE IS BEATEN ' + K.ico('star')
          : 'BEAT THEM IN ORDER · ' + done + ' DOWN, ' + (BOSSES.length - done) + ' TO GO') + '</p>' +
        '<p class="blurb" style="margin-top:6px">Each one brings their own 40 cards and their own attitude. ' +
        'Watch the ring — bring a side that <b>beats</b> theirs and every attack lands +' +
        K.COUNTER_BONUS + ' ATK.</p>' +
      '</div>' +
      '<div class="tiny" style="margin:2px 0 6px">Quick Duel difficulty</div>' +
      '<div class="seg2" id="st-diff"></div>' +
      '<div class="ladder" id="st-ladder"></div>' +
    '</div>';
  $('#st-back').onclick = () => K.go('home');

  /* difficulty picker — story bosses bring their own, this is for Quick Duel */
  const AI = window.KARTI_AI;
  const dseg = $('#st-diff');
  Object.keys(AI ? AI.LEVELS : {}).forEach(k => {
    const L = AI.LEVELS[k];
    const b = document.createElement('button');
    b.className = (K.S.diff || 'regular') === k ? 'on' : '';
    b.innerHTML = K.ico(L.i || 'diff-2') + ' ' + L.name;
    b.title = L.blurb;
    b.onclick = () => { K.S.diff = k; K.save(); render(); K.toast(L.name + ': ' + L.blurb); };
    dseg.appendChild(b);
  });

  const lad = $('#st-ladder');
  BOSSES.forEach((b, i) => {
    const open = isUnlocked(i), won = isCleared(b.id);
    const at = K.ATTR[b.attr] || { n:'?', e:'?', c:'#888' };
    const beatsKey = Object.keys(K.COUNTERS).find(f => K.COUNTERS[f] === b.attr);
    const el = document.createElement('button');
    el.className = 'boss' + (open ? '' : ' locked') + (won ? ' cleared' : '');
    el.style.setProperty('--bc', at.c);
    el.disabled = !open;
    el.innerHTML =
      faceHTML(b) +
      '<span class="body">' +
        '<span class="rank">' + esc(b.rank) + '</span>' +
        '<span class="nm">' + esc(b.n) + '</span>' +
        '<span class="li">' + (open ? '“' + esc(b.intro.slice(0, 96)) + '…”'
                                    : 'Beat ' + esc(BOSSES[i - 1] ? BOSSES[i - 1].n : '') + ' first.') + '</span>' +
        '<span class="meta">' +
          '<span class="tag">' + K.ico(K.ATTR_ICON[b.attr]) + ' ' + at.n + '</span>' +
          '<span class="tag diff">' + diffName(b.diff) + '</span>' +
          '<span class="tag">' + K.coinIco('Coins') + ' ' + b.reward.coins + ' · ' +
            K.ico('pack', 'Packs') + ' ' + b.reward.packs + '</span>' +
          (beatsKey ? '<span class="tag">weak to ' + esc(K.ATTR[beatsKey].n) + '</span>' : '') +
          (won ? '<span class="tag won">' + K.ico('check') + ' beaten</span>' : '') +
        '</span>' +
      '</span>' +
      (open ? '' : '<span class="lockicon">' + K.ico('lock', 'Locked') + '</span>');
    if (open) el.onclick = () => preview(b, i);
    lad.appendChild(el);
  });
}
function diffName(d){
  const AI = window.KARTI_AI;
  const L = AI && AI.LEVELS[AI.ALIAS[d] || d];
  return L ? K.ico(L.i || 'diff-2') + ' ' + L.name : d;
}

/* ───────────────────────── boss preview sheet ───────────────────────── */
function preview(b, i){
  const at = K.ATTR[b.attr] || { n:'?', e:'?' };
  const beatsKey = Object.keys(K.COUNTERS).find(f => K.COUNTERS[f] === b.attr);
  const beaten = isCleared(b.id);
  K.openSheet(
    '<div class="bossline">' + faceHTML(b) +
      '<span class="said"><b>' + esc(b.n) + '</b>“' + esc(b.intro) + '”</span>' +
    '</div>' +
    '<p class="blurb" style="margin-top:10px">' +
      'Plays <b>' + K.ico(K.ATTR_ICON[b.attr]) + ' ' + at.n + '</b> · brain: <b>' +
        diffName(b.diff) + '</b>' +
      (beatsKey ? ' · a <b>' + esc(K.ATTR[beatsKey].n) + '</b> deck gets +' + K.COUNTER_BONUS +
        ' ATK against it' : '') + '.</p>' +
    (beaten ? '<p class="blurb">Already beaten — a rematch pays ' +
        Math.floor(b.reward.coins / 3) + ' coins and no pack.</p>'
            : '<p class="blurb">First win: <b>' + K.coinIco('Coins') + ' ' + b.reward.coins +
              '</b> and <b>' + K.ico('pack', 'Packs') + ' ' + b.reward.packs +
              ' pack' + (b.reward.packs > 1 ? 's' : '') + '</b>.</p>') +
    '<div class="opts">' +
      '<button class="btn hot" id="bs-go">' + K.ilb('type-monster', 'Take them on') + '</button>' +
      '<button class="btn ghost" id="bs-deck">' + K.ilb('deck', 'Change my deck first') + '</button>' +
      '<button class="btn ghost" id="bs-close">Not yet</button>' +
    '</div>');
  $('#bs-close').onclick = K.closeSheet;
  $('#bs-deck').onclick = () => { K.closeSheet(); K.go('deck'); };
  $('#bs-go').onclick = () => { K.closeSheet(); fight(b); };
}

/* ───────────────────────── the duel ───────────────────────── */
let CUR = null;                       /* boss currently being fought */
let taunted = {};

let tutorOffered = false;
function fight(b){
  /* Nobody's first ever duel should be a boss fight with no idea what a tribute
     is — run the tutorial first, once, then drop them straight into the fight.
     The session flag stops it looping if they skip without it marking itself done. */
  if (!tutorOffered && window.KARTI_TUTOR && KARTI_TUTOR.isDone && !KARTI_TUTOR.isDone()){
    tutorOffered = true;
    KARTI_TUTOR.start({ onDone: () => fight(b) });
    return;
  }
  const d = K.activeDeck();
  if (!d){ K.toast('Pick a side on the home screen first.'); return; }
  if (!K.deckIsLegal(d.list)){
    K.toast('That deck is not legal — it needs exactly ' + K.DECK_SIZE + ' cards you own.');
    K.go('deck'); return;
  }
  CUR = b; taunted = {};
  window.KHOOK = { result: onResult };          /* story owns the end screen */

  K.startCustomDuel({
    myList: d.list, myKey: K.S.side, diff: b.diff, mode:'story',
    foe: { name:b.n, list:b.list, deckKey:b.attr, isAI:true },
    first: 'You go first against ' + b.n + '.'
  });
  /* wrap the duel event stream so the boss can talk over it */
  K.D.on = ev => { K.onDuelEvent(ev); bossReacts(ev); };
  introModal(b);
}

/* ── sound ────────────────────────────────────────────────────────────────
   The duel itself is already wired: K.onDuelEvent above feeds js/sfx.js the
   whole event stream, so summons, attacks, traps, damage and the result all
   sound here exactly as they do in a Quick Duel. What is NOT in that stream
   is the story: a boss arriving, a boss opening their mouth, and the coins
   landing afterwards. Those three are this file's, and they are all optional —
   no sfx.js, or sound off, and every one of them is a no-op. */
const SFX = () => window.KARTI_SFX || null;

function introModal(b){
  /* THE BOSS IS HERE. This is the one moment duelEvent cannot see: the modal
     goes up before a single card is dealt. It comes in behind the modal's own
     sheet noise so the two do not land together. */
  { const S = SFX(); if (S) setTimeout(() => { try { S.play('duel.boss'); } catch(e){} }, 180); }
  K.openModal(
    '<div class="bossline">' + faceHTML(b) +
      '<span class="said"><b>' + esc(b.n) + '</b>“' + esc(b.intro) + '”</span>' +
    '</div>' +
    '<div style="display:grid;gap:9px;margin-top:14px">' +
      '<button class="btn hot" id="bi-go">Mela. Deal.</button></div>');
  $('#bi-go').onclick = K.closeModal;
}

/* a line at the moments that deserve one, each one only once per duel */
function bossReacts(ev){
  if (!CUR || !K.D) return;
  const b = CUR;
  let key = null;
  if (ev.type === 'destroy' && ev.pi === 0) key = 0;                       /* they killed yours */
  else if (ev.type === 'lp' && ev.pi === 1 && ev.delta <= -1500) key = 1;  /* you hurt them */
  else if (ev.type === 'trap' && ev.pi === 1) key = 2;                     /* their trap landed */
  if (key == null || taunted[key]) return;
  taunted[key] = true;
  say(b, b.taunts[key % b.taunts.length]);
}
function say(b, line){
  /* A taunt is the boss cutting in over the duel, and #taunt is not #toast so
     the delegated layer never sees it. Three times a duel at most — see the
     `taunted` guard above — and pitched low and pulled back, because it lands
     on top of whatever just happened to provoke it. */
  { const S = SFX(); if (S) S.play('ui.toast', { gain: 0.5, rate: 0.88 }); }
  let el = $('#taunt');
  if (!el){
    el = document.createElement('div');
    el.id = 'taunt'; el.className = 'taunt'; el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.innerHTML = '<span class="who">' + K.ico(K.ATTR_ICON[b.attr]) + ' ' + esc(b.n) +
    '</span>' + esc(line);
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}

/* ───────────────────────── result + rewards ───────────────────────── */
function onResult(winner, why){
  const b = CUR;
  if (!b) return false;
  const won = winner === 0;
  const S = K.S;
  const st = story();
  const first = won && !st.cleared[b.id];
  let coins = 0, packs = 0;

  if (won){
    coins = first ? b.reward.coins : Math.floor(b.reward.coins / 3);
    packs = first ? b.reward.packs : 0;
    st.cleared[b.id] = true;
    S.rec.w++;
  } else {
    coins = 40; S.rec.l++;
  }
  S.coins += coins; S.packs += packs;
  K.save();

  const nextB = BOSSES[BOSSES.indexOf(b) + 1];
  const allDone = clearedCount() === BOSSES.length;

  /* THE PAYOUT. duel.win has already gone off in the duel; this is the money
     landing on the table after it, which is a separate pleasure and the reason
     anybody grinds a ladder. It is sequenced behind the modal so the three do
     not stack: modal, then the coins counting, then the chime for a first
     clear. Losing gets none of it — duel.lose already said everything. */
  { const S = SFX();
    if (S && won) setTimeout(() => {
      try {
        /* the counter runs longer for a bigger purse, but run() caps at 12 so
           a 600-coin final boss cannot turn into a machine gun */
        S.run('coin.tick', Math.max(3, Math.min(10, Math.round(coins / 60))), 65, { gain: 0.7 });
        setTimeout(() => { try { S.play('ui.coin'); } catch(e){} }, 480);
        /* a boss beaten for the FIRST time is the rung going in */
        if (first) setTimeout(() => { try { S.ladder(1, 4, 1, 95, { gain: 0.6 }); } catch(e){} }, 700);
      } catch(e){}
    }, 420);
  }

  K.openModal(
    '<div class="result">' +
      '<div class="big ' + (won ? 'win' : 'lose') + '">' + (won ? 'REBAH!' : 'TELFA') + '</div>' +
      '<p class="tiny">' + (won ? 'You beat ' + esc(b.n) : esc(b.n) + ' saw you off') + '</p>' +
    '</div>' +
    '<div class="bossline" style="margin-top:12px">' + faceHTML(b) +
      '<span class="said"><b>' + esc(b.n) + '</b>“' + esc(won ? b.lose : b.win) + '”</span>' +
    '</div>' +
    '<p class="muted" style="text-align:center;margin:10px 0 0;font-size:12px">' + esc(why) + '</p>' +
    '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:10px">' +
      '<span class="pill">' + K.coinIco('Coins') + '+' + coins + '</span>' +
      (packs ? '<span class="pill">' + K.ico('pack', 'Packs') + '+' + packs + '</span>' : '') +
      (first ? '<span class="pill">' + K.ico('trophy') + 'first win</span>' : '') +
    '</div>' +
    (won && allDone
      ? '<p class="okbox" style="margin-top:12px">Every single one of them, beaten. The village has ' +
        'nothing left to say about you. They will find something.</p>'
      : won && nextB
        ? '<p class="okbox" style="margin-top:12px">Next up: <b>' +
          K.ico(K.ATTR_ICON[nextB.attr]) + ' ' + esc(nextB.n) +
          '</b> — ' + esc(nextB.rank) + '.</p>'
        : '') +
    '<div style="display:grid;gap:9px;margin-top:12px">' +
      (packs ? '<button class="btn primary" id="sr-pack">' +
        K.ilb('pack', 'Open your pack') + '</button>' : '') +
      '<button class="btn hot" id="sr-again">' +
        K.ilb('refresh', won ? 'Fight them again' : 'Try again') + '</button>' +
      '<button class="btn ghost" id="sr-lad">Back to the ladder</button>' +
    '</div>');

  const pk = $('#sr-pack');
  if (pk) pk.onclick = () => { K.closeModal(); endStoryDuel(); K.go('pack'); };
  $('#sr-again').onclick = () => { K.closeModal(); fight(b); };
  $('#sr-lad').onclick = () => { K.closeModal(); endStoryDuel(); open(); };
  return true;                                   /* we handled it — no solo payout */
}
function endStoryDuel(){
  CUR = null; window.KHOOK = null; K.D = null;
}

/* ───────────────────────── entry ───────────────────────── */
function open(){
  window.KHOOK = null;
  render();                                      /* go() has no renderer for this screen */
  K.go('story');
}

function wire(){
  const b = $('#btn-story');
  if (b) b.onclick = open;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
else wire();

window.KARTI_STORY = { BOSSES, byId, open, fight, render, isCleared, isUnlocked, clearedCount,
                       unlockedUpTo, story, onResult };

})();
