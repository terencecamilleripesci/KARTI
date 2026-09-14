/* ═══════════════════════════════════════════════════════════════════════════
   IR-RAKKONT — STORY MODE                                   window.KARTI_STORY
   ───────────────────────────────────────────────────────────────────────────
   A ROAD, NOT A LADDER. Fourteen characters strung along a winding path you
   physically walk up. Tap the one you are standing on and you fight them.

   CHAPTERS AND BOSSES — the shape of the road, and why it changed
   It used to be fourteen identical best-of-threes. Fourteen climaxes in a row
   is no climax at all: the road never moved, and beating NANNA felt exactly
   like beating the man who sells pastizzi. So it is now three chapters, each
   one five ordinary stops and then a BOSS:

     Ch.1 IL-RAĦAL  stops 1-5 ordinary → stop 6  BOSS
     Ch.2 IL-GŻIRA  stops 7-11 ordinary → stop 12 BOSS
     Ch.3 ID-DAR    stop 13 ordinary   → stop 14 FINAL BOSS (NANNA)

   · ORDINARY STOP = ONE GAME. Win it and the road opens. One game is a
     ten-minute stop, so five of them is an evening and the road MOVES.
   · BOSS STOP = BEST OF THREE, first to two. This is the only place the
     `games:[first, second, decider]` triple is spent, and it is the only
     place the scoreboard comes up — which is exactly what makes it read as
     a boss rather than as stop number six.

   THE SCOREBOARD is the owner's own ask: "1 point to u and pount to enmy if
   he wins etc best of 3". See boardHTML()/strikePip() — both sides' crests
   with two pips each, on the face-off card, over the live game, and on every
   card in between, and the pip STRIKES ON when a point lands.

   THE THREE CONTRACTS THIS FILE LEANS ON, ALL MEASURED RATHER THAN ASSUMED
   (a headless browser launched all 25 AI-capable games and read the results):

   1. LAUNCHING is `KARTI_PARTY.online[id].start({...})` — NOT the shelf tile's
      `start()`. The tile's version is missing on 8 of the 25, and on five more
      (erbgha, aqleb, kaxxi, ilforka, kelma) it deals a HOT-SEAT table of
      humans with no machine at the table at all. `online[id]` exists for all
      25 and is what js/mp.js itself drives. `you:0, host:0` is load-bearing:
      only the host runs the machine chairs.

   2. THE RESULT does NOT come back through `KARTI_PARTY.ui.result`. That was
      the obvious guess and it is wrong — a real Four-in-a-Row loss goes to
      KARTI_REBBIEĦ and never touches it, and gharraq, kiri and suspett never
      call it at all. The ONE universal channel is `KARTI_XP.onAward` — every
      funnel in progress.js ends in the same award(), it carries the game id,
      and the fresh() guard means it fires exactly once per match.

   3. LEAVING is `KARTI_PARTY.hub()`. NEVER `online[id].stop()`: that raises
      the "cut off" card, which progress.js PAYS FOR — quitting skarta mints
      9 XP. See the note by quitLevel().

   The RPG turn-based mode goes in later. LEVELS is the seam it will hang off:
   a level says who you fight and what you fight them at, and nothing in the
   map or the runner cares that the answer is currently "a party game".
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const K = window.KARTI;
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => K.esc(s);
const SFX = () => window.KARTI_SFX;

/* ═══════════════════════ THE ROAD ═══════════════════════
   Fourteen stops. The eight originals keep their portraits, their writing and
   — because progress is keyed on `id` — every clear anybody has already
   earned. The six new ones are slotted BETWEEN them so the ramp is gradual
   rather than bolted on the end, and NANNA stays where she belongs.

   `games` is a THREE-GAME POOL, and the stop's kind decides how it is spent:
     · a BOSS stop plays all three — [first, second, decider], and the decider
       is only ever reached at 1-1;
     · an ORDINARY stop plays exactly ONE, drawn from the pool when the fight
       starts. Drawing rather than always taking games[0] is what keeps the
       property in the next paragraph true: eleven ordinary stops taking only
       their first entry would have thrown 22 of the road's 33 games away, and
       it also means a rematch is a different evening.

   They are hand-picked to fit the character: GĦARRAQHOM! (sink them) for
   the Captain, Konkwista and BRIKS for the man building on your land, TOMBLA
   for the priest, IL-KIRI for the taxman, MIN HU? for the mother-in-law
   deciding who you are, KELMA and IL-KANUN for the għannej who deals in
   words, and DAMA and CHESS for Nanna, who has beaten everybody at both.

   THE ROAD MUST NOT COLLAPSE BACK TO A HANDFUL OF GAMES. It had, and this
   paragraph is here because the words above stayed true while the DATA
   below quietly stopped matching them: measured on 13 Sep 2026, the
   fourteen stops drew on NINE distinct games between them — skarta and
   kaxxi six times each — while 24 other games that Story Mode can launch
   perfectly well were never once played. The Captain did not have
   GĦARRAQHOM. The priest did not have TOMBLA. Now the road uses 28
   distinct games and none more than twice, so a full run is fourteen
   different evenings rather than Skarta with a new face on it.

   If you edit these lists, keep both rules: **thematic** (the game says
   something about the character) and **no game more than twice**.

   ONLY GAMES THAT PLAY AT TWO SEATS BELONG HERE, because nSeats defaults to
   2 and no stop currently overrides it. Measured: mimika (min 3), spy
   (min 3), tankijiet (min 4) and suspett (min 5) cannot be used without a
   `seats` override, so they are deliberately absent.

   `band` picks the machine's difficulty, 0..2, clamped to whatever that game
   actually publishes. Rounds 1-4 easy, 5-9 middling, 10-14 hard.

   `seats` overrides the table size where a game needs more than two chairs;
   nothing needs it today, and see the paragraph above before adding one. */
const LEVELS = [
  {
    id:'cikku', n:'ĊIKKU TAL-KAŻIN', e:'🍻', attr:'festa', band:0,
    rank:'Round 1 · The Band Club',
    games:['skarta', 'cards2131', 'lewwel'],
    intro:'Eh ħi, sit down, sit down! Four beers in and I have never lost a game in my life. ' +
          'I have never won one either, but that is the barman\'s fault.',
    taunts:['Ara! Did you see that? Neither did I.',
            'My wife said be home by ten. She has been saying that since 1998.',
            'Two more beers and I start playing properly. That is a promise and a threat.'],
    win:'I TOLD you! Now who is buying? Not me. I am the champion.',
    lose:'You got lucky. I was drinking, the lights were in my eyes, and it is not even my deck.',
    reward:{ coins:150, packs:1 }
  },
  {
    id:'pastizzi', n:'TAL-PASTIZZI', e:'🥟', attr:'razzett', band:0,
    rank:'Round 2 · The Pastizzerija',
    games:['erbgha', 'aqleb', 'kaxxi'],
    intro:'Ċena? Dis is not ċena, dis is breakfast. And you are having four, because two is ' +
          'an insult to my mother.',
    taunts:['Ħa nagħtik waħda oħra.',
            'Ricotta or piżelli. There is no third option and there never was.',
            'Eat it standing up, like a normal person.'],
    win:'Four euro. And you are still hungry, I can see it in your face.',
    lose:'Take them. Take the bag. Tell your mother I asked after her.',
    reward:{ coins:170, packs:1 }
  },
  {
    id:'doris', n:'DORIS TAL-KUNSILL', e:'📋', attr:'belt', band:0,
    rank:'Round 3 · The Local Council',
    games:['ilforka', 'kwizz', 'kaxxi'],
    intro:'You need a permit to play here. You do not have one. Fill in this form, come back ' +
          'Thursday, and I will tell you the form has changed.',
    taunts:['That is not the right form.',
            'Come back Thursday.',
            'I go on break in four minutes and after that I am not moving.'],
    win:'Denied. You may appeal in writing, within fifteen days, in triplicate.',
    lose:'Fine. Approved. But I am noting in the file that you were rude to me.',
    reward:{ coins:190, packs:1 }
  },
  {
    id:'dunorg', n:'DUN ĠORĠ', e:'⛪', attr:'festa', band:0,
    rank:'Round 4 · The Parish Hall',
    games:['tombla', 'katina', 'sqaq'],
    intro:'We will play, and we will play fairly, because He is watching. And because I am also ' +
          'watching, and I am closer.',
    taunts:['I have heard worse in confession. Not much worse.',
            'The collection box is by the door on your way out.',
            'Patience, ibni. Eternity is long.'],
    win:'Come Sunday. Sit at the front, where I can see you.',
    lose:'Well played. I shall mention you. Briefly.',
    reward:{ coins:210, packs:1 }
  },
  {
    id:'guzi', n:'ĠUŻI L-BIDWI', e:'🚜', attr:'razzett', band:1,
    rank:'Round 5 · Burmarrad',
    games:['serp', 'konkwista', 'ludu'],
    intro:'You parked in my field. I have the tractor, I have the dogs, and I have absolutely ' +
          'nothing else on today.',
    taunts:['In my day we played this with real consequences.',
            'Those dogs have not been fed since the argument started.',
            'You town people. Look at those hands. Soft.'],
    win:'Now move the car, before the dogs finish their lunch.',
    lose:'Take the rabbit. Take it. At least your mother will cook it properly.',
    reward:{ coins:230, packs:1 }
  },
  {
    id:'taxi', n:'IS-SEWWIEQ TAT-TAXI', e:'🚕', attr:'belt', band:1,
    rank:'Round 6 · The Airport Rank',
    games:['sqaq', 'briks', 'oghla'],
    intro:'Twenty-five euro. Fixed price, meter is broken, the road is closed, and I know a ' +
          'shortcut that adds forty minutes.',
    taunts:['Traffic. Terrible traffic. We have not moved because I have not started.',
            'Air conditioning is extra.',
            'My cousin has a boat, if you prefer.'],
    win:'Thirty euro. It went up while we were arguing.',
    lose:'Fine. Get in. But you are not touching the radio.',
    reward:{ coins:250, packs:1 }
  },
  {
    id:'salvu', n:'IL-KAPTAN SALVU', e:'⛵', attr:'bahar', band:1,
    rank:'Round 7 · The Slipway',
    games:['gharraq', 'ballun', 'bomba'],
    intro:'Fifty years on that boat. I have seen storms the records say never happened. I also ' +
          'saw you park on the slipway, and we will be discussing that afterwards.',
    taunts:['It was THIS big. The fish. Not your chances.',
            'The eye on the luzzu is watching you. It has always watched you.',
            'Factor 50 was right there in the shop and you walked straight past it.'],
    win:'Back to the beach, sur. The water is mine.',
    lose:'Alright. But you are carrying the cooler up the steps.',
    reward:{ coins:270, packs:1 }
  },
  {
    id:'hanut', n:'IS-SINJURA TAL-ĦANUT', e:'🏪', attr:'hazen', band:1,
    rank:'Round 8 · The Corner Shop',
    games:['gin', 'pari', 'poker'],
    intro:'I know what you buy. I know what time you buy it. And I know exactly who you were ' +
          'with on Tuesday.',
    taunts:['I am not one to talk. But.',
            'Your mother still owes me for the bread.',
            'Everybody knows. They have known for months.'],
    win:'Ħallih. I will put it on your account, with everything else.',
    lose:'Good for you. I shall tell everybody. Immediately.',
    reward:{ coins:290, packs:1 }
  },
  {
    id:'kunjata', n:'IL-KUNJATA', e:'👵', attr:'hazen', band:1,
    rank:'Round 9 · Sunday Lunch',
    games:['minhu', 'rummy', 'skarta'],
    intro:'So. You are the one. I have heard absolutely everything about you, and not one word ' +
          'of it from you.',
    taunts:['My daughter could have married a notary.',
            'This is how you sit? Bħal tifel.',
            'I am not saying anything. I am only looking.'],
    win:'Lunch is at twelve on Sunday. Do not be late, and do not wear that shirt.',
    lose:'Well. You are still not what I would have chosen. But you can carve, I will give you that.',
    reward:{ coins:320, packs:2 }
  },
  {
    id:'ghannej', n:'L-GĦANNEJ', e:'🎸', attr:'festa', band:2,
    rank:'Round 10 · Under the Tree',
    games:['ritmu', 'kanun', 'kelma'],
    intro:'I have been answering men in verse since before you were born, and not one of them ' +
          'got the last word.',
    taunts:['That does not even rhyme.',
            'Sing it back to me. Go on.',
            'My grandfather beat your grandfather at this. Under this tree.'],
    win:'And that, ħi, is the last verse. There is no reply to it.',
    lose:'Good. Good! Now I have somebody worth answering.',
    reward:{ coins:350, packs:2 }
  },
  {
    id:'kuntrattur', n:'IS-SUR KUNTRATTUR', e:'👷', attr:'belt', band:2,
    rank:'Round 11 · Site Meeting',
    games:['konkwista', 'briks', 'hajja'],
    intro:'The job starts Monday. It started three Mondays ago, but this Monday is the real one. ' +
          'Deposit first, sur.',
    taunts:['Next week, sur.',
            'That is extra. That was always extra.',
            'The permit says minor internal works.'],
    win:'I will send the final invoice. And then a second final invoice.',
    lose:'Alright, alright. I will come Tuesday with the man who actually does the work.',
    reward:{ coins:380, packs:2 }
  },
  {
    id:'vat', n:'L-ISPETTUR TAL-VAT', e:'🧾', attr:'hazen', band:2,
    rank:'Round 12 · The Back Office',
    games:['kiri', 'poker', 'misteru'],
    intro:'Six years of receipts. Every single one. I have the whole afternoon, and I brought ' +
          'a sandwich.',
    taunts:['And this one — in cash, was it?',
            'Interesting. Very interesting. I am noting that down.',
            'Your books say Tuesday. The entire village says Saturday.'],
    win:'Payment plan. Thirty-six months. Sign at the bottom, and again at the top.',
    lose:'Nothing to declare. This time.',
    reward:{ coins:420, packs:2 }
  },
  {
    id:'tifel', n:'IT-TIFEL TAL-MOBILE', e:'📱', attr:'belt', band:2,
    rank:'Round 13 · The Back Room',
    games:['bomba', 'emoji', 'serp'],
    intro:'My mum said I have to let you win. I told her I would think about it.',
    taunts:['You are so slow.',
            'I already did this twice while you were thinking.',
            'Can I go now? I have training.'],
    win:'Easy. Can I have your phone, mine is at one per cent.',
    lose:'That was luck. Best of three. BEST OF THREE.',
    reward:{ coins:480, packs:2 }
  },
  {
    id:'nanna', n:'NANNA', e:'🍝', attr:'razzett', band:2, final:true,
    rank:'Final · Her Kitchen',
    games:['dama', 'chess', 'tombla'],
    intro:'Sit. Eat, you are too thin. Then I am going to take everything you own, and you are ' +
          'going to thank me for it.',
    taunts:['Eat.',
            'I saw what you did in 1988. I saw all of it.',
            'Your cousin came second in his exams. And he still visits every Sunday.'],
    win:'Come back next week. Bring the plate back. And bring an appetite.',
    lose:'Good boy. Now finish the plate before you start celebrating.',
    reward:{ coins:700, packs:3 }
  }
];
const byId = id => LEVELS.find(b => b.id === id);

/* ═══════════════════════ CHAPTERS ═══════════════════════
   ONE SOURCE OF TRUTH for the whole rhythm: a chapter is a span of stops and
   its LAST stop is its boss. Nothing else in this file decides what a boss is
   — the map, the card, the runner and the scoreboard all ask isBossI().

   WHY THESE THREE STOPS. The rhythm (five ordinary, then a boss) was given,
   and 5+1, 5+1, 1+1 is the only way it lands on fourteen without renumbering
   anything — and renumbering is forbidden, because progress is keyed on `id`.
   The writing then agreed with the arithmetic, which is why the stops are not
   reordered: stop 6 is the fixed-price taxi at the airport rank, the man who
   takes you OUT of your village, so he closes the village chapter; stop 12 is
   the VAT inspector with six years of receipts and a whole afternoon, which is
   already written as a reckoning; stop 14 is NANNA, who was always the end.

   `from`/`to` are INDEXES into LEVELS, not stop numbers. */
const CHAPTERS = [
  { n:'IL-RAĦAL', en:'The Village', from:0,  to:5  },
  { n:'IL-GŻIRA', en:'The Island',  from:6,  to:11 },
  { n:'ID-DAR',   en:'Home',        from:12, to:13 }
];
const chapterOf  = i => CHAPTERS.find(c => i >= c.from && i <= c.to) || CHAPTERS[0];
const chapterNo  = i => CHAPTERS.indexOf(chapterOf(i)) + 1;
const isBossI    = i => CHAPTERS.some(c => c.to === i);
const indexOfB   = b => LEVELS.indexOf(b);
const isBoss     = b => isBossI(indexOfB(b));
const WINS_TO_TAKE = b => (isBoss(b) ? 2 : 1);   /* first to this many */

/* the shelf tile for a game id, so a level can print the game's real name
   rather than its id — and so a level whose game somehow is not on the shelf
   fails loudly here instead of silently launching nothing */
function tileOf(id){
  try { return (window.KARTI_PARTY.games() || []).find(g => g.id === id) || null; }
  catch (e){ return null; }
}
const gameName = id => { const t = tileOf(id); return t ? (t.name || id) : id; };

/* Portrait art if the art pack is on this deploy, emoji if not. Prefer the
   character's OWN portrait (boss-<id>.png); the attribute-keyed art covers
   only five factions, so the onerror walks down to that and then to the emoji.
   All fourteen have their own face as of build 290. */
function faceHTML(b, cls){
  /* THUMBNAILS, NOT THE PAINTINGS. The originals are 620x900 and these are
     drawn at 74px on the road and 54px on a card — about thirty-five times
     more pixels than any screen uses. Opening Story Mode on a throttled
     phone took 1356ms and only 24 of those were building the DOM; the rest
     was six megabytes of portrait. tools/bossthumbs.py bakes in the same
     crop the CSS does, so nothing moves.

     The full PNG is kept as the onerror fallback, so a deploy without the
     thumb folder still shows faces rather than emoji. */
  const thumb = K.uiArt && K.uiArt('boss', 'thumb/boss-' + b.id + '.webp');
  const own  = K.uiArt && K.uiArt('boss', 'boss-' + b.id + '.png');
  const attr = K.uiArt && K.uiArt('boss', b.final ? 'boss-final.png' : 'boss-' + b.attr + '.png');
  const src  = thumb || own || attr;
  const alt  = [own, attr].filter(u => u && u !== src)[0] || '';
  return '<span class="' + (cls || 'face') + '">' +
    (src ? '<img src="' + src + '" alt="" loading="lazy" decoding="async"' +
      (alt ? ' data-alt="' + alt + '" onerror="if(this.dataset.alt){this.src=this.dataset.alt;this.removeAttribute(\'data-alt\');}else{this.remove();}"'
           : ' onerror="this.remove()"') + '>' : '') +
    '<span class="em">' + b.e + '</span></span>';
}

/* ═══════════════════════ THE BOSS SCOREBOARD ═══════════════════════
   The owner's ask, verbatim: "boss fight uave 1-3 games to win in a row when u
   win u go next and add grapics like 1 point to u and pount to enmy if he wins
   etc best of 3". So a boss fight carries a board with BOTH sides on it, and
   the board MOVES the moment a point lands.

   ONE renderer, two sizes, so the face-off card, the interlude, the result
   screen and the strip that sits over the live game can never disagree about
   the score:

     boardHTML(b, w, l, mode)   mode 'big'  — inside a modal
                                mode 'mini' — the fixed strip, over the game
     strikePip(root, side)      lights the pip just won: a pip punching on,
                                the crest shaking, the board flashing
     bar.up(b) / bar.down()     the strip's whole life

   TWO pips a side, because first to two takes a best of three — the shape of
   the board states the rule without a word of explanation.

   WHY IT IS CSS/SVG AND NOT PAINTED ART: it is a HUD. It has to be legible at
   390x844, it has to restyle for the light theme, every state from 0-0 to 2-1
   has to exist, and it has to animate. That is twelve PNGs that still would
   not move. The only raster in it is the portrait art the road already has. */
const CROWN =
  '<svg class="bsb-crown" viewBox="0 0 26 18" aria-hidden="true" focusable="false">' +
    '<path d="M2.4 16 L4.6 3.2 L9.4 9 L13 1.6 L16.6 9 L21.4 3.2 L23.6 16 Z"/></svg>';

function myName(){
  try { return String((K.displayName && K.displayName()) || 'YOU').slice(0, 12); }
  catch (e){ return 'YOU'; }
}
/* the player's own crest. KARTI_XP.avatarHTML is the ONE avatar renderer in
   the app (see js/progress-ui.js) — using it means the face on the scoreboard
   is the same face as on the leaderboard, photograph and all. If progress.js
   is not on this deploy it falls back to an initial, never to nothing. */
function meCrest(size){
  try {
    const XP = window.KARTI_XP;
    if (XP && typeof XP.avatarHTML === 'function')
      return XP.avatarHTML(myName(), { size:size, me:true, noBorder:size < 30 });
  } catch (e){}
  return '<span class="face"><span class="em">🙂</span></span>';
}
function pipsHTML(n){
  let s = '';
  for (let i = 0; i < 2; i++) s += '<i' + (i < n ? ' class="on"' : '') + '></i>';
  return '<span class="bsb-pips">' + s + '</span>';
}
function boardHTML(b, w, l, mode){
  const mini = mode === 'mini';
  const sz = mini ? 24 : 54;
  const side = (cls, crest, nm, pips, won) =>
    '<div class="bsb-side ' + cls + (won ? ' won' : '') + '">' +
      '<span class="bsb-crest">' + crest + (won ? CROWN : '') + '</span>' +
      (mini ? '' : '<span class="bsb-nm">' + nm + '</span>') +
      pips +
    '</div>';
  return '<div class="bsb' + (mini ? ' mini' : '') + '" role="img" aria-label="' +
      esc(myName() + ' ' + w + ', ' + b.n + ' ' + l + ', first to two') + '">' +
    side('me',   meCrest(sz),            esc(myName()), pipsHTML(w), w >= 2) +
    '<div class="bsb-mid"><span class="bsb-vs">VS</span>' +
      (mini ? '' : '<span class="bsb-bo">FIRST TO 2</span>') + '</div>' +
    side('them', faceHTML(b, 'face'),    esc(b.n),      pipsHTML(l), l >= 2) +
  '</div>';
}

/* A POINT LANDS. Called on a board that is still showing the OLD score, so
   what the player sees is the pip arriving — which is the whole request. */
function strikePip(root, mine){
  if (!root) return false;
  const wrap = root.querySelector('.bsb-side.' + (mine ? 'me' : 'them'));
  if (!wrap) return false;
  const pip = wrap.querySelector('.bsb-pips i:not(.on)');
  if (!pip) return false;
  pip.classList.add('on', 'hit');
  wrap.classList.add('scored');
  /* the point that takes the fight also takes the crown */
  if (!wrap.querySelector('.bsb-pips i:not(.on)')){
    wrap.classList.add('won');
    const crest = wrap.querySelector('.bsb-crest');
    if (crest && !crest.querySelector('.bsb-crown')) crest.insertAdjacentHTML('beforeend', CROWN);
  }
  root.classList.add('bsb-lit', mine ? 'lit-me' : 'lit-them');
  setTimeout(() => {
    pip.classList.remove('hit');
    wrap.classList.remove('scored');
    root.classList.remove('bsb-lit', 'lit-me', 'lit-them');
  }, K.REDUCED ? 120 : 900);
  try {
    const S = SFX();
    if (S){ S.play('duel.hit', { force:true, gain: mine ? 0.8 : 0.66 });
            S.haptic(mine ? 'thud' : 'no'); }
  } catch (e){}
  return true;
}

/* ── THE STRIP THAT STAYS UP ────────────────────────────────────────
   "both sides' score must be ON SCREEN" — so during a boss fight the mini
   board is pinned to the top of the window, over whatever the game is
   painting. Three things make that safe on 33 different boards:
     · pointer-events:none — it can never eat a tap meant for the game;
     · z-index 11500, which is UNDER #kr-root (12000), so a game's own
       winner screen still covers it completely and gets its moment;
     · it is only ever up during a BOSS stop, and it comes down the instant
       the level ends, the player walks out, or a modal opens.
   It lives on <body>, not inside a screen, because every game owns its own
   screen element and half of them rebuild it (IL-KIRI builds #scr-kiri from
   scratch) — anything parked inside would be wiped.

   AND IT RETRACTS. Measured on IS-SQAQ: the full strip is 280px wide and it
   sat straight across that game's own title bar, clipping "IS-SQAQ" to
   "IS-S". Thirty-three games have thirty-three different top bars and I can
   only look at a handful, so after five seconds — long enough to read the
   score on your way into the game — it shrinks to just the four pips, about
   110px, in the one part of a top bar that is reliably empty. The score
   never leaves the screen; it stops sitting on anybody's furniture. */
const bar = {
  el:null, t:0,
  up(b, w, l){
    if (!b) return;
    let el = document.getElementById('st-bossbar');
    if (!el){
      el = document.createElement('div');
      el.id = 'st-bossbar';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    el.innerHTML = boardHTML(b, w, l, 'mini');
    el.classList.add('on');
    el.classList.remove('slim');
    clearTimeout(this.t);
    this.t = setTimeout(() => { const e = document.getElementById('st-bossbar');
                                if (e) e.classList.add('slim'); }, 5000);
    this.el = el;
    /* the avatar observer in progress-ui.js watches #app, #sheet and #modal.
       This strip is a child of <body>, so nothing would ever mount the
       player's photograph on it — ask for it by hand. */
    try { if (window.KARTI_XP && KARTI_XP.paint) KARTI_XP.paint(el); } catch (e){}
  },
  down(){
    clearTimeout(this.t);
    const el = document.getElementById('st-bossbar');
    if (el){ el.classList.remove('on', 'slim'); el.innerHTML = ''; }
    this.el = null;
  }
};

/* ───────────────────────── progress (per user save) ─────────────────────────
   UNCHANGED SHAPE ON PURPOSE. `cleared` is keyed on the character id, and the
   eight original ids are all still here, so anybody who beat the old card-duel
   ladder keeps every clear they earned and simply finds six new faces between
   them. No migration step, and nothing to get wrong. */
function story(){
  const S = K.S;
  if (!S.story || typeof S.story !== 'object') S.story = { cleared:{} };
  if (!S.story.cleared) S.story.cleared = {};
  return S.story;
}
const isCleared = id => !!story().cleared[id];
function unlockedUpTo(){
  let i = 0;
  while (i < LEVELS.length && isCleared(LEVELS[i].id)) i++;
  return i;                                   /* index of the next one to face */
}
const isUnlocked = i => i <= unlockedUpTo();
const clearedCount = () => LEVELS.filter(b => isCleared(b.id)).length;

/* ═══════════════════════ THE MAP ═══════════════════════
   A winding road drawn from ONE source of truth: nodePos(i) gives the centre
   of stop i, and both the SVG road and the portraits are placed from it. They
   cannot drift apart, which is the usual way a map like this goes wrong.

   x winds with a sine so the road bends instead of zig-zagging; y is a fixed
   step, so the whole thing is exactly as tall as it needs to be and scrolls. */
const STEP = 118;        /* px between stops              */
const TOP  = 74;         /* px above the first stop       */
const SWING = 26;        /* how far the road wanders, %   */
function nodePos(i){
  /* YOU CLIMB. Stop one is at the BOTTOM of the map and the last is at the
     top, so the road goes up the way a ladder does and the screen opens on
     where you actually are. It ran downward before, which reads as falling
     down a list rather than getting somewhere.

     1.4 rad per stop is deliberate: at 0.9 the first four stops all sat
     right of centre and the road looked lopsided. This period does not
     repeat itself over the length of the map. */
  var last = LEVELS.length - 1;
  return { x: 50 + Math.sin(i * 1.4) * SWING, y: TOP + (last - i) * STEP };
}
/* the tail has to clear the CHAPTER 1 band, which hangs half a step below
   stop one — 64px did not, and the banner was clipped by the scroller */
const mapHeight = () => TOP + (LEVELS.length - 1) * STEP + 104;

function roadPath(w){
  /* the road as one smooth-ish polyline through every stop; w is the map's
     pixel width, since x is a percentage and SVG wants pixels */
  return LEVELS.map((b, i) => {
    const p = nodePos(i);
    return (i ? 'L' : 'M') + (p.x * w / 100).toFixed(1) + ' ' + p.y.toFixed(1);
  }).join(' ');
}

function mapHTML(){
  const at = unlockedUpTo();
  let nodes = '';
  LEVELS.forEach((b, i) => {
    const p = nodePos(i);
    const done = isCleared(b.id);
    const here = i === at;
    const lock = i > at;
    const bs = isBossI(i);
    nodes +=
      '<button class="snode' + (done ? ' done' : '') + (here ? ' here' : '') + (lock ? ' lock' : '') +
          (bs ? ' sboss' : '') + (b.final ? ' final' : '') + '"' +
        ' data-i="' + i + '"' + (lock ? ' disabled aria-disabled="true"' : '') +
        ' style="left:' + p.x.toFixed(2) + '%;top:' + p.y + 'px"' +
        ' aria-label="' + esc((bs ? (b.final ? 'Final boss — ' : 'Chapter ' + chapterNo(i) + ' boss — ') : '') +
            b.rank + ' — ' + b.n +
            (done ? ' (beaten)' : lock ? ' (locked)' : ' (next)')) + '">' +
        '<span class="sn-ring"></span>' +
        faceHTML(b, 'sn-face') +
        '<span class="sn-no mono">' + (i + 1) + '</span>' +
        (bs ? '<span class="sn-crown">' + CROWN + '</span>' : '') +
        (done ? '<span class="sn-tick">' + K.ico('check') + '</span>' : '') +
        (lock ? '<span class="sn-lock">' + K.ico('lock') + '</span>' : '') +
      '</button>';
  });
  /* CHAPTER GATES. One band per chapter, drawn across the road just BELOW
     that chapter's first stop — you climb, so that is its entrance. Since a
     chapter's last stop is its boss, the band always lands immediately above
     the previous chapter's boss: beating a boss is visibly walking through a
     gate, and the road stops reading as one list of fourteen strangers.
     Placed BEFORE the nodes and at z-index 1, so no portrait is ever
     covered by one. */
  let bands = '';
  CHAPTERS.forEach((c, ci) => {
    const y = nodePos(c.from).y + STEP * 0.44;    /* the chapter's entrance */
    const shut = c.from > at;                     /* whole chapter still locked */
    bands +=
      '<div class="sband' + (shut ? ' lock' : '') + '" style="top:' + y.toFixed(1) + 'px">' +
        '<span class="sb-lab"><b>CHAPTER ' + (ci + 1) + '</b>' + esc(c.n) +
          '<small>' + esc(c.en) + '</small></span>' +
      '</div>';
  });
  return '<div class="smap" id="smap" style="height:' + mapHeight() + 'px">' +
      '<svg class="sroad" id="sroad" aria-hidden="true" preserveAspectRatio="none"></svg>' +
      bands +
      nodes +
      '<div class="swalker" id="swalker" aria-hidden="true"><span class="sw-dot"></span></div>' +
    '</div>';
}

/* the road and the walker both need the map's real pixel width, which only
   exists once it is on the screen */
function paintRoad(){
  const map = $('#smap'), svg = $('#sroad');
  if (!map || !svg) return;
  const w = map.getBoundingClientRect().width || 360;
  const h = mapHeight();
  svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  const d = roadPath(w);
  svg.innerHTML =
    '<path d="' + d + '" class="rd-base"/>' +
    '<path d="' + d + '" class="rd-dash"/>';
}
function placeWalker(i, animate){
  const map = $('#smap'), el = $('#swalker');
  if (!map || !el) return;
  const w = map.getBoundingClientRect().width || 360;
  const to = nodePos(Math.min(i, LEVELS.length - 1));
  const put = p => {
    el.style.left = (p.x * w / 100).toFixed(1) + 'px';
    el.style.top  = p.y + 'px';
  };
  if (!animate || i <= 0 || K.REDUCED){ put(to); return; }
  /* THE WALK. From the stop just beaten to the one now standing open, with a
     bob in the middle so it reads as somebody walking rather than a dot being
     teleported. This is the whole point of the screen being a road. */
  const from = nodePos(i - 1);
  put(from);
  const fx = from.x * w / 100, tx = to.x * w / 100;
  try {
    el.animate([
      { transform:'translate(-50%,-50%) scale(1)' },
      { transform:'translate(-50%,-64%) scale(1.12)', offset:0.5 },
      { transform:'translate(-50%,-50%) scale(1)' }
    ], { duration:1100, easing:'ease-in-out' });
    const walk = el.animate(
      [{ left: fx + 'px', top: from.y + 'px' }, { left: tx + 'px', top: to.y + 'px' }],
      { duration:1100, easing:'cubic-bezier(.45,.05,.55,.95)', fill:'forwards' });
    walk.onfinish = () => put(to);
  } catch (e){ put(to); }
  const S = SFX();
  if (S) for (let k = 0; k < 4; k++)
    setTimeout(() => { try { S.play('ui.tap', { force:true, gain:0.4 }); S.haptic('tick'); } catch (e){} }, 120 + k * 250);
}

/* ───────────────────────── the map screen ───────────────────────── */
function render(walkTo){
  const host = $('#scr-story');
  if (!host) return;
  const done = clearedCount();
  /* the chapter you are standing in, clamped so a finished road still names one */
  const atNow = Math.min(unlockedUpTo(), LEVELS.length - 1);
  host.innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="st-back" aria-label="Back to home">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Story Mode</h2>' +
      '<span class="pill mono">' + done + '/' + LEVELS.length + '</span>' +
    '</div>' +
    '<div class="scroll" id="st-scroll">' +
      '<div class="storyhdr">' +
        '<p class="prog">' + (done === LEVELS.length
          ? K.ico('star') + ' THE WHOLE VILLAGE IS BEATEN ' + K.ico('star')
          : 'CHAPTER ' + chapterNo(atNow) + ' · ' + esc(chapterOf(atNow).n) +
            ' <span class="sep">·</span> ' + done + '/' + LEVELS.length) + '</p>' +
        '<p class="blurb" style="margin-top:6px">Five stops, then a <b>boss</b>. An ordinary stop is ' +
        '<b>one game</b> — win it and the road opens. A boss is a <b>best of three</b>.</p>' +
      '</div>' +
      mapHTML() +
    '</div>';
  $('#st-back').onclick = () => K.go('home');
  host.querySelectorAll('.snode').forEach(n => {
    n.onclick = () => { const i = +n.dataset.i; if (isUnlocked(i)) levelCard(LEVELS[i]); };
  });
  paintRoad();
  const at = unlockedUpTo();
  placeWalker(walkTo == null ? at : walkTo, walkTo != null);
  /* park the view on the stop you are standing at, not the top of the island */
  requestAnimationFrame(() => {
    const sc = $('#st-scroll');
    if (!sc) return;
    const p = nodePos(Math.min(at, LEVELS.length - 1));
    sc.scrollTop = Math.max(0, p.y - sc.clientHeight * 0.55);
  });
}

/* ───────────────────────── the level card ─────────────────────────
   TWO CARDS, because a stop and a boss are not the same event. The ordinary
   card names the ONE game and gets out of the way. The boss card is a
   face-off: the chapter kicker, the crown, the scoreboard at 0-0 and all
   three games laid out, so the shape of the fight is on screen before it
   starts.

   The ordinary card DRAWS its game here rather than at launch, so the name
   on the card is the game you actually get — the draw travels into
   startLevel() as the plan. */
function bossKicker(b){
  const i = indexOfB(b);
  return b.final ? 'FINAL BOSS' : 'CHAPTER ' + chapterNo(i) + ' BOSS';
}
function shuf(a){
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const t = r[i]; r[i] = r[j]; r[j] = t;
  }
  return r;
}
/* the games this attempt will actually play, and the ones held in reserve for
   a game that refuses to start (see nextGame) */
function planFor(b){
  if (isBoss(b)) return { plan:b.games.slice(0, 3), spare:[] };
  const pool = shuf(b.games.slice(0, 3));
  return { plan:[pool[0]], spare:pool.slice(1) };
}

function levelCard(b){
  const done = isCleared(b.id);
  const boss = isBoss(b);
  const pick = planFor(b);
  const foot =
    (done ? '<p class="tiny" style="margin-top:10px">Already beaten. A rematch pays nothing, ' +
            'but the games still count for your record.</p>' : '') +
    '<div style="display:grid;gap:9px;margin-top:14px">' +
      '<button class="btn hot" id="lv-go">' +
        K.ilb('play', done ? 'Rematch' : boss ? 'FIGHT' : 'Take them on') + '</button>' +
      '<button class="btn ghost" id="lv-no">Not yet</button>' +
    '</div>';

  if (boss){
    K.openModal(
      '<div class="bosstop' + (b.final ? ' final' : '') + '">' +
        '<span class="bt-kick">' + CROWN + esc(bossKicker(b)) + '</span>' +
        '<span class="bt-rank">' + esc(b.rank) + '</span>' +
      '</div>' +
      boardHTML(b, 0, 0, 'big') +
      '<p class="blurb" style="margin-top:12px">“' + esc(b.intro) + '”</p>' +
      '<div class="tiny" style="margin:12px 0 5px">BEST OF THREE · FIRST TO 2 WINS</div>' +
      '<div class="gvs">' +
        b.games.slice(0, 2).map((g, i) => '<div class="gvs-row"><b class="mono">' + (i + 1) + '</b>' +
          '<span>' + esc(gameName(g)) + '</span></div>').join('') +
        '<div class="gvs-row dec"><b class="mono">?</b><span>' +
          esc(gameName(b.games[2])) + ' <small>— only at 1–1</small></span></div>' +
      '</div>' + foot);
    try { const S = SFX(); if (S) S.play('duel.boss', { force:true }); } catch (e){}
  } else {
    K.openModal(
      '<div class="bossline">' + faceHTML(b) +
        '<span class="said"><b>' + esc(b.n) + '</b>' + esc(b.rank) + '</span>' +
      '</div>' +
      '<p class="blurb" style="margin-top:10px">“' + esc(b.intro) + '”</p>' +
      '<div class="tiny" style="margin:12px 0 5px">ONE GAME · WIN IT AND THE ROAD OPENS</div>' +
      '<div class="gvs">' +
        '<div class="gvs-row one"><b class="mono">' + K.ico('play') + '</b>' +
          '<span>' + esc(gameName(pick.plan[0])) + '</span></div>' +
      '</div>' + foot);
  }
  $('#lv-go').onclick = () => { K.closeModal(); startLevel(b, pick); };
  $('#lv-no').onclick = () => K.closeModal();
}

/* ═══════════════════════ THE RUNNER ═══════════════════════
   One level = up to three games. RUN holds the whole state of an attempt; it
   is null whenever no story match is live, and EVERY exit path clears it —
   an orphaned RUN would make an ordinary party game later count towards a
   level nobody is playing. */
let RUN = null;

/* Difficulty. The band is an INDEX into what the game publishes, but the value
   that goes on the seat is the level entry's OWN `level` number — mirroring
   js/mp.js:415-418, which is the only implementation that was ever right.

   THIS IS NOT A DETAIL. Games number their difficulties from ONE, and they
   defend themselves against nonsense by falling back to their HARDEST setting:
   js/skarta-ui.js:890 is `[1,2,3].indexOf(p.level|0) >= 0 ? ... : 3`. So
   sending the array index 0 — the obvious thing, and what this did at first —
   put ĊIKKU TAL-KAŻIN, round one, on NASTY. Every single level would have been
   maximum difficulty, and it looked fine until the badge was read on screen.

   IL-KANUN publishes {id,en,mt} with no number at all and tankijiet publishes
   three nulls, so the index+1 fallback has to stay. */
function levelFor(gameId, band){
  const t = tileOf(gameId);
  const ls = (t && Array.isArray(t.levels)) ? t.levels : null;
  if (!ls || !ls.length) return (band | 0) + 1;
  const i = Math.max(0, Math.min(ls.length - 1, band | 0));
  const L = ls[i];
  const v = Number(L && (L.level != null ? L.level : L.k));
  return v > 0 ? v : i + 1;
}

/* THE LAUNCH. See the header: this is `online[id].start`, the same door
   js/mp.js drives, with a net stub because there is no relay involved. */
function launch(gameId, nSeats, level, bossName){
  const P = window.KARTI_PARTY;
  const on = P && P.online ? P.online[gameId] : null;
  if (!on || typeof on.start !== 'function') return false;
  const seats = [{ seat:0, name:'YOU', kind:'human', level:level, own:'me', link:'local', ready:true }];
  for (let i = 1; i < nSeats; i++)
    seats.push({ seat:i, name: i === 1 ? String(bossName || 'MACHINE').slice(0, 14) : 'MACHINE ' + i,
                 kind:'cpu', level:level, own:'ai', link:'cpu', ready:true });
  /* every method a no-op: the game may call any of these and none of them has
     anywhere to go offline. onLeave is the exception — it is the door back. */
  const net = { send(){}, move(){}, bail(){}, whisper(){}, redeal: () => false,
                note(){}, onLeave: () => quitLevel(), seat:0, seats:nSeats, host:0 };
  const seed = (Math.random() * 0xffffffff) >>> 0;
  /* THE OTHER WAY OUT. net.onLeave above is the door a game knows about, but
     several of them get back to the shelf by calling KARTI_PARTY.hub()
     themselves, and hub() meant "back to the shelf" here — which walked out
     of the level with RUN still ARMED, so the next ordinary party game the
     player finished settled a level nobody was playing. The offline door has
     always wrapped hub() for exactly this reason (see wrapHubAsQuit); the
     online door needs the same guard, and nothing else in the file changes
     because quitLevel() restores the wrapper before it calls hub() itself. */
  const unwrap = wrapHubAsQuit();
  try {
    on.start({ opts:{ seats:nSeats }, seed:seed, seats:seats,
               you:0, host:0, net:net, roundLimit:30, clock:90 });
    /* the game's own lobby phase, replayed exactly as mp.js does after start */
    const h = on.hooks;
    if (h && typeof h.phase === 'function' && typeof h.apply === 'function' && h.phase() === 'lobby'){
      for (let i = 0; i < nSeats; i++) h.apply(i, { t:'ready', s:i, v:true });
      h.apply(0, { t:'start' });
      if (typeof h.attachNet === 'function') h.attachNet(net);
    }
  } catch (e){ unwrap(); return false; }
  HUB_OUT = unwrap;
  return true;
}

/* ── THE SECOND DOOR: games that were never online ─────────────────
   The ten party games added in builds 414-423 are offline-only. They
   publish no `online[id]` controller at all, so launch() above cannot
   see them and the whole shelf of new games was shut out of the road.

   They do publish the ordinary tile contract — `tile.start(seats, o)`
   with a seat list — and, more importantly, they end through
   `KARTI_XP.awardPlay`, which is the SAME channel arm() already
   listens on. Contract 2 in the header therefore needs nothing: a
   PARI loss reaches settle() exactly like a Skarta loss.

   TWO THINGS DIFFER AND BOTH BITE.

   The LEVEL is a string here. levelFor() returns a number, because
   the old games publish numeric levels; these publish {k:'easy'} and
   Number('easy') is NaN, so levelFor() quietly falls back to 1/2/3 and
   the boss's difficulty band would be thrown away — the difficulty
   index trap, again. So this door reads `levels[band].k` itself and
   hands over the key the game actually understands.

   The WAY OUT is not net.onLeave, because there is no net. An offline
   game's back arrow calls KARTI_PARTY.hub() directly, which would walk
   out of the level leaving RUN armed and a later match settling it. So
   hub() is wrapped for exactly as long as the game is up, and the
   wrapper is the same door net.onLeave is: quitLevel(). */
function launchOffline(gameId, nSeats, band, bossName){
  const P = window.KARTI_PARTY;
  const t = tileOf(gameId);
  if (!t || typeof t.start !== 'function') return false;
  /* it must be able to seat a machine, or one player sits alone forever */
  const min = (t.seats && t.seats.min) || 1;
  const max = (t.seats && t.seats.max) || 2;
  const n = Math.max(min, Math.min(max, nSeats));
  if (max < 2) return false;

  const ls = Array.isArray(t.levels) ? t.levels : [];
  const key = ls.length
    ? ls[Math.max(0, Math.min(ls.length - 1, band | 0))].k
    : undefined;

  const seats = [{ seat:0, kind:'human', name:'YOU' }];
  for (let i = 1; i < n; i++)
    seats.push({ seat:i, kind:'cpu',
                 name: i === 1 ? String(bossName || 'MACHINE').slice(0, 14) : 'MACHINE ' + i });

  const unwrap = wrapHubAsQuit();
  try {
    t.start(seats, key ? { level:key } : undefined);
    /* AND SHOW IT. None of the ten offline games calls KARTI_PARTY.show()
       itself, and from the shelf they never need to — the party screen is
       already lit, because you got there by tapping a tile on it. Story
       Mode launches from #scr-story, so without this the game builds its
       board perfectly and nobody ever sees it: measured, RITMU was live
       with `scr-story` still the only thing on screen. That is the third
       of the four ways an online game dies, arriving by a new road. */
    if (typeof P.show === 'function') P.show();
  } catch (e){ unwrap(); return false; }
  HUB_OUT = unwrap;
  return true;
}

/* hub() IS A WAY OUT OF A STORY GAME, on both doors. While a story game is
   on the screen it must mean "I am giving up this level", not "back to the
   shelf" — otherwise the run is abandoned still ARMED and the next ordinary
   party game the player finishes settles a level nobody is playing.
   Restored the moment the game is settled or the level ends. */
let HUB_OUT = null;
function wrapHubAsQuit(){
  const P = window.KARTI_PARTY;
  if (!P || typeof P.hub !== 'function') return () => {};
  const orig = P.hub;
  let done = false;
  const restore = () => { if (done) return; done = true; P.hub = orig; };
  P.hub = function(){
    restore();
    if (RUN) return quitLevel();          /* quitLevel calls hub itself */
    return orig.apply(this, arguments);
  };
  return restore;
}
function releaseHub(){
  if (HUB_OUT){ try { HUB_OUT(); } catch (e){} HUB_OUT = null; }
}

/* `pick` is what the level card drew (see planFor). startLevel is exported and
   also called by the result card's "Again", so a missing pick draws a fresh
   one — a rematch of an ordinary stop is then a different game, on purpose. */
function startLevel(b, pick){
  const p = pick && pick.plan && pick.plan.length ? pick : planFor(b);
  RUN = { boss:b, boss_fight:isBoss(b), need:WINS_TO_TAKE(b),
          plan:p.plan.slice(), spare:(p.spare || []).slice(),
          step:0, wins:0, losses:0, log:[], off:null, armed:false };
  nextGame();
}
/* the level is decided when either side reaches `need`, or the plan runs out.
   ORDINARY: need 1, plan of 1 — one game and it is over either way.
   BOSS:     need 2, plan of 3 — the decider is only ever reached at 1-1. */
function runOver(){
  return !RUN || RUN.wins >= RUN.need || RUN.losses >= RUN.need || RUN.step >= RUN.plan.length;
}

function nextGame(){
  if (!RUN) return;
  const b = RUN.boss;
  if (runOver()){ finishLevel(); return; }
  const gameId = RUN.plan[RUN.step];
  const nSeats = (b.seats && b.seats[gameId]) || 2;
  const lvl = levelFor(gameId, b.band);
  clearGameScreens();          /* never build a game on top of a live one */
  releaseHub();            /* the previous game's hub wrapper, if any */
  arm(gameId);
  /* the online door first, exactly as before; the offline door only for
     games that have no online controller at all */
  if (launch(gameId, nSeats, lvl, b.n) || launchOffline(gameId, nSeats, b.band, b.n)){
    /* THE SCORE STAYS ON SCREEN. Only for a boss — a one-game stop has no
       score to keep. Raised AFTER the game is up, because launchOffline()
       calls KARTI_PARTY.show() and a screen change must not outrank it. */
    if (RUN.boss_fight) bar.up(b, RUN.wins, RUN.losses);
    return;
  }
  /* a game that will not start must not eat the level silently */
  disarm();
  K.toast('⚠ ' + gameName(gameId) + ' would not start — skipping it.');
  RUN.log.push({ game:gameId, result:'skip' });
  if (RUN.spare.length){
    /* AN ORDINARY STOP IS ONE GAME, so a skip there is not a spare round to
       burn — it would hand the player a loss they never played. Substitute
       from the pool instead of consuming the step. */
    RUN.plan[RUN.step] = RUN.spare.shift();
  } else {
    RUN.step++;
  }
  setTimeout(nextGame, 400);
}

/* ── listening for the outcome ──────────────────────────────────────
   KARTI_XP.onAward is the one channel every game reaches (see the header).
   It carries the game id and fires once per counted match, so the filter is
   just "is this the game I launched". KARTI_STATS.record is wrapped as a
   second net for the rare match that pays nothing at all. */
function arm(gameId){
  disarm();
  if (!RUN) return;
  RUN.armed = gameId;
  const offs = [];
  try {
    if (window.KARTI_XP && KARTI_XP.onAward){
      const off = KARTI_XP.onAward(a => {
        if (!RUN || RUN.armed !== gameId) return;
        if (!a || a.game !== gameId || !a.counted) return;
        settle(a.result);
      });
      if (typeof off === 'function') offs.push(off);
    }
  } catch (e){}
  try {
    const ST = window.KARTI_STATS;
    if (ST && typeof ST.record === 'function' && !ST.__storyWrapped){
      const orig = ST.record;
      ST.record = function (id, o){
        const r = orig.apply(ST, arguments);
        try {
          if (RUN && RUN.armed === id && !RUN.settling) settle(o && o.result);
        } catch (e){}
        return r;
      };
      ST.__storyWrapped = true;
    }
  } catch (e){}
  RUN.off = () => { offs.forEach(f => { try { f(); } catch (e){} }); };
}
function disarm(){
  if (RUN && RUN.off){ try { RUN.off(); } catch (e){} RUN.off = null; }
  if (RUN) RUN.armed = false;
}

/* ── GETTING THE GAME'S OWN ENDING OFF THE SCREEN ──────────────────
   Nearly every game on the shelf finishes into IR-REBBIEĦ, and #kr-root is
   z-index 12000 while an ordinary modal is 300. So the story's "that is one,
   here comes the next" card was opening ELEVEN THOUSAND SEVEN HUNDRED layers
   underneath the winner screen: the player never saw it, saw "Play again /
   Leave" instead, and whichever they pressed walked them out of the level.
   That is the whole of "you beat them and it does not go to the next game".

   So the celebration gets its beat, and then we take the screen back.
   standDown() also runs the finished game's own leave() teardown, so the next
   game is not built on top of a board that is still alive. */
function clearGameScreens(){
  try { if (window.KARTI_REBBIEH && KARTI_REBBIEH.hide) KARTI_REBBIEH.hide(); } catch (e){}
  try { if (window.KARTI_PARTY && KARTI_PARTY.standDown) KARTI_PARTY.standDown(); } catch (e){}
}

/* one game decided. A draw counts for the house — it terminates, and a level
   that could be drawn forever is not a level. */
function settle(result){
  if (!RUN || RUN.settling) return;
  RUN.settling = true;
  releaseHub();            /* the game is over: hub() means hub() again */
  const won = result === 'w';
  const gameId = RUN.armed;
  disarm();
  if (won) RUN.wins++; else RUN.losses++;
  RUN.log.push({ game:gameId, result: won ? 'w' : 'l' });
  RUN.step++;
  /* let the game finish its own celebration, THEN take the screen back */
  setTimeout(() => {
    if (!RUN) return;
    RUN.settling = false;
    bar.down();                /* the strip's job passes to the card's board */
    clearGameScreens();
    interlude(won);
  }, 2200);
}

/* ── the pip landing, on whichever card is open ─────────────────────
   The card is drawn showing the score BEFORE this game, and then the point
   arrives. That ordering is the entire feature: the player watches the pip
   strike on rather than reading a number that was already there. */
function paintStrike(mine){
  const go = () => strikePip($('#mbox .bsb'), mine);
  if (K.REDUCED){ go(); return; }
  setTimeout(go, 430);
}

/* the beat between games. BOSS FIGHTS ONLY — an ordinary stop is one game, so
   runOver() is already true by the time settle() gets here and this falls
   straight through to finishLevel(). */
function interlude(won){
  if (!RUN) return;
  const b = RUN.boss;
  if (runOver()){ finishLevel(); return; }
  const w = RUN.wins, l = RUN.losses;
  const decider = (w === 1 && l === 1);
  const taunt = b.taunts[Math.min(b.taunts.length - 1, RUN.step - 1)] || b.taunts[0];
  K.openModal(
    '<div class="bosstop' + (b.final ? ' final' : '') + (decider ? ' dec' : '') + '">' +
      '<span class="bt-kick">' + CROWN + esc(bossKicker(b)) + '</span>' +
      '<span class="bt-rank">' + (decider ? 'THE DECIDER' : 'ROUND ' + (RUN.step + 1) + ' OF 3') + '</span>' +
    '</div>' +
    /* the board is drawn at the OLD score; paintStrike() below lands the point */
    boardHTML(b, w - (won ? 1 : 0), l - (won ? 0 : 1), 'big') +
    /* NOT .result .big — that is clamp(36px,12vw,56px) and "POINT TO THEM"
       wraps to three lines of it on a 390px phone, shoving the board and the
       taunt off the card. The board is the hero here; this is its caption. */
    '<div class="bsb-call ' + (won ? 'win' : 'lose') + '">' +
      (won ? 'POINT TO YOU' : 'POINT TO THEM') + '</div>' +
    '<div class="bossline" style="margin-top:10px">' + faceHTML(b) +
      '<span class="said"><b>' + esc(b.n) + '</b>“' + esc(taunt) + '”</span></div>' +
    '<p class="tiny" style="text-align:center;margin:12px 0 0">' +
      (decider ? 'Everything on this one: <b>' : 'Next: <b>') +
      esc(gameName(RUN.plan[RUN.step])) + '</b></p>' +
    '<div style="display:grid;gap:9px;margin-top:12px">' +
      '<button class="btn hot" id="il-go">' + K.ilb('play', decider ? 'THE DECIDER' : 'Play it') + '</button>' +
      '<button class="btn ghost" id="il-quit">Walk away</button>' +
    '</div>');
  paintStrike(won);
  $('#il-go').onclick = () => { K.closeModal(); nextGame(); };
  $('#il-quit').onclick = () => { K.closeModal(); quitLevel(); };
}

/* ── the level is decided ──────────────────────────────────────────
   The payout only ever lands on a FIRST clear. A rematch is for the record
   books and the fun of it, exactly as the old ladder worked. */
function finishLevel(){
  if (!RUN) return;
  releaseHub();
  bar.down();
  const b = RUN.boss;
  const bossFight = RUN.boss_fight;
  const fw = RUN.wins, fl = RUN.losses;
  /* the point that ENDED it, so the board can land it on screen rather than
     opening with the final score already lit. Null if the level ended on a
     game that would not start rather than on a result. */
  const lastPlayed = RUN.log.filter(e => e.result === 'w' || e.result === 'l').pop();
  const lastWon = lastPlayed ? lastPlayed.result === 'w' : null;
  const won = RUN.wins > RUN.losses;
  const first = won && !isCleared(b.id);
  const coins = first ? (b.reward.coins | 0) : 0;
  const packs = first ? (b.reward.packs | 0) : 0;
  if (first){
    story().cleared[b.id] = true;
    try {
      if (coins) K.S.coins = (K.S.coins | 0) + coins;
      if (packs) K.S.packs = (K.S.packs | 0) + packs;
      K.save();
    } catch (e){}
  }
  const at = unlockedUpTo();
  const nextB = LEVELS[at] || null;
  const allDone = clearedCount() === LEVELS.length;
  const tally = RUN.wins + ' – ' + RUN.losses;
  RUN = null;
  clearGameScreens();

  { const S = SFX();
    if (S && won) setTimeout(() => {
      try {
        if (coins){
          S.run('coin.tick', Math.max(3, Math.min(10, Math.round(coins / 60))), 65, { gain:0.7 });
          setTimeout(() => { try { S.play('ui.coin'); } catch (e){} }, 480);
        }
        if (first) setTimeout(() => { try { S.ladder(1, 4, 1, 95, { gain:0.6 }); } catch (e){} }, 700);
      } catch (e){}
    }, 420);
  }

  K.openModal(
    (bossFight
      ? '<div class="bosstop' + (b.final ? ' final' : '') + '">' +
          '<span class="bt-kick">' + CROWN + esc(bossKicker(b)) + '</span>' +
          '<span class="bt-rank">' + (won ? 'BEATEN' : 'THEY HELD THE ROAD') + '</span>' +
        '</div>' +
        /* the final board, opened one point short so the winning pip lands */
        boardHTML(b, lastWon === true ? fw - 1 : fw, lastWon === false ? fl - 1 : fl, 'big')
      : '') +
    '<div class="result"' + (bossFight ? ' style="margin-top:10px"' : '') + '>' +
      '<div class="big ' + (won ? 'win' : 'lose') + '">' + (won ? 'REBAĦ!' : 'TELFA') + '</div>' +
      '<p class="tiny">' + (bossFight ? tally + ' against ' : 'against ') + esc(b.n) + '</p>' +
    '</div>' +
    '<div class="bossline" style="margin-top:12px">' + faceHTML(b) +
      '<span class="said"><b>' + esc(b.n) + '</b>“' + esc(won ? b.lose : b.win) + '”</span>' +
    '</div>' +
    (first
      ? '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px">' +
          '<span class="pill">' + K.coinIco('Coins') + '+' + coins + '</span>' +
          (packs ? '<span class="pill">' + K.ico('pack', 'Packs') + '+' + packs + '</span>' : '') +
          '<span class="pill">' + K.ico('trophy') + 'first clear</span>' +
        '</div>'
      : won ? '<p class="tiny" style="text-align:center;margin:12px 0 0">Beaten before — no purse ' +
              'this time, but the road remembers.</p>' : '') +
    (won && allDone
      ? '<p class="okbox" style="margin-top:12px">Every single one of them, beaten. The village has ' +
        'nothing left to say about you. They will find something.</p>'
      : won && nextB
        ? '<p class="okbox" style="margin-top:12px">Further up the road: <b>' + esc(nextB.n) +
          '</b> — ' + esc(nextB.rank) + '.</p>'
        : '') +
    '<div style="display:grid;gap:9px;margin-top:12px">' +
      (packs ? '<button class="btn primary" id="sr-pack">' + K.ilb('pack', 'Open your pack') + '</button>' : '') +
      '<button class="btn hot" id="sr-again">' + K.ilb('refresh', won ? 'Again' : 'Try again') + '</button>' +
      '<button class="btn ghost" id="sr-map">Back to the road</button>' +
    '</div>');
  if (bossFight && lastWon !== null) paintStrike(lastWon);

  const backToMap = walk => {
    K.closeModal();
    clearGameScreens();
    render(walk ? unlockedUpTo() : null);
    K.go('story');
  };
  const pk = $('#sr-pack');
  if (pk) pk.onclick = () => { K.closeModal(); K.go('pack'); };
  $('#sr-again').onclick = () => { K.closeModal(); startLevel(b); };
  /* a FIRST clear walks the road — that is the reward the screen exists for */
  $('#sr-map').onclick = () => backToMap(first);
}

/* ── leaving mid-level ─────────────────────────────────────────────
   KARTI_PARTY.hub() runs the game's own leave() teardown and pays NOTHING.
   Do NOT be tempted by online[id].stop(): it raises the "cut off" card, and
   progress.js pays for that card — quitting SKARTA that way mints 9 XP. */
function quitLevel(){
  disarm();
  releaseHub();
  bar.down();
  RUN = null;
  try { window.KARTI_PARTY.hub && window.KARTI_PARTY.hub(); } catch (e){}
  clearGameScreens();
  render();
  K.go('story');
}

/* ───────────────────────── entry ───────────────────────── */
function open(){
  window.KHOOK = null;            /* story no longer drives the card duel */
  RUN = null;
  bar.down();                     /* nothing is being fought from here */
  render();                       /* go() has no renderer for this screen */
  K.go('story');
}

function wire(){
  const b = $('#btn-story');
  if (b) b.onclick = open;
  window.addEventListener('resize', () => { if (K.UI && K.UI.current === 'story') paintRoad(); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
else wire();

/* BOSSES is STILL EVERY STOP, and that is deliberate.
   js/progress.js:2027 gates an achievement on
     `S.clearedCount() >= S.BOSSES.length && S.BOSSES.length > 0`
   so BOSSES.length is the length of the ROAD to that gate, not a count of
   boss fights. Rebinding it to the three chapter bosses would have turned
   "beat all fourteen" into "beat any three", which is the achievement paying
   out for a fifth of the work. The three chapter bosses are exported
   separately, under a name nothing else is reading. */
window.KARTI_STORY = { LEVELS, BOSSES: LEVELS, CHAPTERS,
                       BOSS_STOPS: LEVELS.filter((b, i) => isBossI(i)),
                       byId, open, render, isCleared, isUnlocked,
                       clearedCount, unlockedUpTo, story, startLevel, quitLevel,
                       isBoss, chapterOf, chapterNo,
                       /* for the headless harness */
                       _run: () => RUN, nodePos, levelFor, launch, planFor };

})();
