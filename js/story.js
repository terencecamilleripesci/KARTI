/* ═══════════════════════════════════════════════════════════════════════════
   IR-RAKKONT — STORY MODE                                   window.KARTI_STORY
   ───────────────────────────────────────────────────────────────────────────
   A ROAD, NOT A LADDER. Fourteen characters strung along a winding path you
   physically walk up. Tap the one you are standing on, and they challenge you
   at TWO OF THE PARTY GAMES — best of three, decider only if you split.

   WHAT CHANGED, AND WHY IT MATTERS
   This screen used to be eight card duels. The duel is not gone from KARTI —
   it is the game the app is named after and the whole collection, deck builder
   and pack economy feed it — it is gone from HERE, because a story mode that
   is one game repeated eight times is a difficulty slider wearing costumes.
   Fourteen levels of two different games each is thirty games of variety out
   of a shelf we already own.

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

   `games` is [first, second, decider]. The decider is only ever reached at
   1-1. They are hand-picked to fit the character: GĦARRAQHOM! (sink them) for
   the Captain, IL-ĦAJT and Konkwista for the man building on your land, TOMBLA
   for the priest, IL-KIRI for the taxman, MIN HU? for the mother-in-law
   deciding who you are, KELMA for the għannej who deals in words.

   `band` picks the machine's difficulty, 0..2, clamped to whatever that game
   actually publishes. Rounds 1-4 easy, 5-9 middling, 10-14 hard.

   `seats` overrides the table size where a game needs more than two chairs
   (tankijiet wants four); everything else is a straight one-on-one. */
const LEVELS = [
  {
    id:'cikku', n:'ĊIKKU TAL-KAŻIN', e:'🍻', attr:'festa', band:0,
    rank:'Round 1 · The Band Club',
    games:['skarta', 'erbgha', 'aqleb'],
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
    games:['kaxxi', 'minhu', 'erbgha'],
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
    games:['kelma', 'kodici', 'minhu'],
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
    games:['tombla', 'kelma', 'kodici'],
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
    games:['serp', 'ludu', 'aqleb'],
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
    games:['sqaq', 'ludu', 'erbgha'],
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
    games:['gharraq', 'ballun', 'briks'],
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
    games:['misteru', 'kodici', 'minhu'],
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
    games:['kelma', 'skarta', 'kaxxi'],
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
    games:['briks', 'konkwista', 'kaxxi'],
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
    games:['kiri', 'poker', 'cards2131'],
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
    games:['bomba', 'tankijiet', 'briks'],
    seats:{ tankijiet:4 },
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
    games:['skarta', 'konkwista', 'kiri'],
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
const mapHeight = () => TOP + (LEVELS.length - 1) * STEP + 64;

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
    nodes +=
      '<button class="snode' + (done ? ' done' : '') + (here ? ' here' : '') + (lock ? ' lock' : '') + '"' +
        ' data-i="' + i + '"' + (lock ? ' disabled aria-disabled="true"' : '') +
        ' style="left:' + p.x.toFixed(2) + '%;top:' + p.y + 'px"' +
        ' aria-label="' + esc(b.rank + ' — ' + b.n +
            (done ? ' (beaten)' : lock ? ' (locked)' : ' (next)')) + '">' +
        '<span class="sn-ring"></span>' +
        faceHTML(b, 'sn-face') +
        '<span class="sn-no mono">' + (i + 1) + '</span>' +
        (done ? '<span class="sn-tick">' + K.ico('check') + '</span>' : '') +
        (lock ? '<span class="sn-lock">' + K.ico('lock') + '</span>' : '') +
      '</button>';
  });
  return '<div class="smap" id="smap" style="height:' + mapHeight() + 'px">' +
      '<svg class="sroad" id="sroad" aria-hidden="true" preserveAspectRatio="none"></svg>' +
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
          : 'WALK THE ROAD · ' + done + ' DOWN, ' + (LEVELS.length - done) + ' TO GO') + '</p>' +
        '<p class="blurb" style="margin-top:6px">Every stop is somebody who wants to beat you at ' +
        '<b>two of the party games</b>. Best of three — win two and the road opens.</p>' +
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

/* ───────────────────────── the level card ───────────────────────── */
function levelCard(b){
  const done = isCleared(b.id);
  const gs = b.games.slice(0, 2);
  K.openModal(
    '<div class="bossline">' + faceHTML(b) +
      '<span class="said"><b>' + esc(b.n) + '</b>' + esc(b.rank) + '</span>' +
    '</div>' +
    '<p class="blurb" style="margin-top:10px">“' + esc(b.intro) + '”</p>' +
    '<div class="tiny" style="margin:12px 0 5px">BEST OF THREE</div>' +
    '<div class="gvs">' +
      gs.map((g, i) => '<div class="gvs-row"><b class="mono">' + (i + 1) + '</b>' +
        '<span>' + esc(gameName(g)) + '</span></div>').join('') +
      '<div class="gvs-row dec"><b class="mono">?</b><span>' +
        esc(gameName(b.games[2])) + ' <small>— only if you split</small></span></div>' +
    '</div>' +
    (done ? '<p class="tiny" style="margin-top:10px">Already beaten. A rematch pays nothing, ' +
            'but the games still count for your record.</p>' : '') +
    '<div style="display:grid;gap:9px;margin-top:14px">' +
      '<button class="btn hot" id="lv-go">' + K.ilb('play', done ? 'Rematch' : 'Take them on') + '</button>' +
      '<button class="btn ghost" id="lv-no">Not yet</button>' +
    '</div>');
  $('#lv-go').onclick = () => { K.closeModal(); startLevel(b); };
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
  } catch (e){ return false; }
  return true;
}

function startLevel(b){
  RUN = { boss:b, step:0, wins:0, losses:0, log:[], off:null, armed:false };
  nextGame();
}

/* the three-game sequence: game 0, game 1, and the decider only at 1-1 */
function nextGame(){
  if (!RUN) return;
  const b = RUN.boss;
  if (RUN.wins >= 2 || RUN.losses >= 2 || RUN.step >= 3){ finishLevel(); return; }
  const gameId = b.games[RUN.step];
  const nSeats = (b.seats && b.seats[gameId]) || 2;
  const lvl = levelFor(gameId, b.band);
  clearGameScreens();          /* never build a game on top of a live one */
  arm(gameId);
  if (!launch(gameId, nSeats, lvl, b.n)){
    /* a game that will not start must not eat the level silently */
    disarm();
    K.toast('⚠ ' + gameName(gameId) + ' would not start — skipping it.');
    RUN.step++;
    RUN.log.push({ game:gameId, result:'skip' });
    setTimeout(nextGame, 400);
  }
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
    clearGameScreens();
    interlude(won);
  }, 2200);
}

/* the beat between games: where you stand, what they said, and one button */
function interlude(won){
  if (!RUN) return;
  const b = RUN.boss;
  const over = RUN.wins >= 2 || RUN.losses >= 2 || RUN.step >= 3;
  if (over){ finishLevel(); return; }
  const taunt = b.taunts[Math.min(b.taunts.length - 1, RUN.step - 1)] || b.taunts[0];
  K.openModal(
    '<div class="result"><div class="big ' + (won ? 'win' : 'lose') + '">' +
      (won ? 'THAT IS ONE' : 'THEY TOOK THAT ONE') + '</div>' +
      '<p class="tiny">' + RUN.wins + ' – ' + RUN.losses + ' against ' + esc(b.n) + '</p></div>' +
    '<div class="bossline" style="margin-top:12px">' + faceHTML(b) +
      '<span class="said"><b>' + esc(b.n) + '</b>“' + esc(taunt) + '”</span></div>' +
    '<p class="tiny" style="text-align:center;margin:12px 0 0">Next: <b>' +
      esc(gameName(b.games[RUN.step])) + '</b></p>' +
    '<div style="display:grid;gap:9px;margin-top:12px">' +
      '<button class="btn hot" id="il-go">' + K.ilb('play', 'Play it') + '</button>' +
      '<button class="btn ghost" id="il-quit">Walk away</button>' +
    '</div>');
  $('#il-go').onclick = () => { K.closeModal(); nextGame(); };
  $('#il-quit').onclick = () => { K.closeModal(); quitLevel(); };
}

/* ── the level is decided ──────────────────────────────────────────
   The payout only ever lands on a FIRST clear. A rematch is for the record
   books and the fun of it, exactly as the old ladder worked. */
function finishLevel(){
  if (!RUN) return;
  const b = RUN.boss;
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
    '<div class="result">' +
      '<div class="big ' + (won ? 'win' : 'lose') + '">' + (won ? 'REBAĦ!' : 'TELFA') + '</div>' +
      '<p class="tiny">' + tally + ' against ' + esc(b.n) + '</p>' +
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

/* BOSSES is exported under its old name because js/progress.js gates an
   achievement on KARTI_STORY.BOSSES.length — and that gate now means all
   fourteen, not eight. LEVELS is the name to use from here on. */
window.KARTI_STORY = { LEVELS, BOSSES: LEVELS, byId, open, render, isCleared, isUnlocked,
                       clearedCount, unlockedUpTo, story, startLevel, quitLevel,
                       /* for the headless harness */
                       _run: () => RUN, nodePos, levelFor, launch };

})();
