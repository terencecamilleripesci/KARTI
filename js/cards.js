/* ═══════════════════════════════════════════════════════════════════
   KARTI — 18+ Maltese duel game (Yu-Gi-Oh style)
   ATK / DEF · levels · tributes · 40-card decks · max 3 copies
   English with Maltese flavour. Cheeky adult humour — rude, never explicit.
   ═══════════════════════════════════════════════════════════════════ */

const LP_START   = 8000;
const DECK_SIZE  = 40;
const MAX_COPIES = 3;

const ATTR = {
  festa:   { n:'FESTA',   e:'🎆', c:'#E8452C' },
  razzett: { n:'FARM',    e:'🐇', c:'#4CAF50' },
  belt:    { n:'CITY',    e:'🏰', c:'#9C27B0' },
  bahar:   { n:'SEA',     e:'🌊', c:'#2196F3' },
  hazen:   { n:'TROUBLE', e:'😈', c:'#37474F' },
};

/* `odds` here is DISPLAY ONLY — the share of cards of each rarity you actually
   end up with, measured over 1,000,000 cards out of the real opener. The rates
   that decide anything live in PACK_ODDS at the foot of this file, because the
   five slots in a pack do not roll the same table as each other. */
const RARITY = {
  komuni:      { n:'Common',    c:'#9e9e9e', odds:.589, dust:5   },
  rari:        { n:'Rare',      c:'#2196F3', odds:.330, dust:20  },
  epiku:       { n:'Epic',      c:'#9C27B0', odds:.069, dust:60  },
  leggendarju: { n:'Legendary', c:'#FFB300', odds:.0125, dust:200 },
};

/* lvl 1-4 free summon · 5-6 needs 1 tribute · 7-8 needs 2 tributes */
const CARDS = [
  /* ══════════ FESTA — loud, fast, explosive ══════════ */
  {id:'petard',   n:'3am Petard',            e:'🧨', f:'festa', r:'komuni', t:'monster', lvl:3, atk:1500, def:600,
   txt:'Wakes the whole village. Nobody knows who lit it.', eff:'When destroyed: 500 damage to BOTH players.', fx:'boom'},
  {id:'bandist',  n:'Drunk Bandsman',        e:'🎺', f:'festa', r:'komuni', t:'monster', lvl:3, atk:1400, def:1000,
   txt:'Playing the wrong notes with total confidence.', eff:'Gains +200 ATK each of your turns.', fx:'grow'},
  {id:'pupa',     n:'Carnival Float',        e:'🎭', f:'festa', r:'komuni', t:'monster', lvl:2, atk:800,  def:1200,
   txt:'Took nine months to build. Lasts one afternoon. Bit like some marriages.', eff:'No effect — solid cheap wall.', fx:''},
  {id:'kavallier',n:'Same Shirt Since 1998', e:'🎖️', f:'festa', r:'rari',   t:'monster', lvl:4, atk:1900, def:1200,
   txt:'Never washed, never replaced. Nobody dares mention the smell.', eff:'No effect — straight level-4 beater.', fx:''},
  {id:'nar',      n:'Firework Finale',       e:'🎇', f:'festa', r:'rari',   t:'monster', lvl:4, atk:2000, def:200,
   txt:'Spectacular for two seconds, then gone.', eff:'Destroyed after it attacks.', fx:'kamikaze'},
  {id:'statwa',   n:'The Heavy Statue',      e:'🗿', f:'festa', r:'epiku',  t:'monster', lvl:6, atk:2950, def:3000,
   txt:'Eight men underneath, all pretending their back is fine.', eff:'No effect — an enormous body on both sides.', fx:''},
  {id:'kunjata',  n:'THE KUNJATA',           e:'👵', f:'festa', r:'leggendarju', t:'monster', lvl:8, atk:3400, def:2900,
   txt:'Your mother-in-law. Criticises everything. She never stops.', eff:'Opponent discards 1 card each of your turns.', fx:'discard'},

  /* ══════════ FARM — steady, brutal, no nonsense ══════════ */
  {id:'fenek',    n:'Sunday Rabbit',         e:'🐇', f:'razzett', r:'komuni', t:'monster', lvl:2, atk:1000, def:800,
   txt:'Cooked in wine since Friday.', eff:'When summoned: heal 500 LP.', fx:'heal'},
  {id:'gbejna',   n:'Peppered Ġbejna',       e:'🧀', f:'razzett', r:'komuni', t:'monster', lvl:1, atk:400,  def:1500,
   txt:'Hard, salty, and somehow the whole meal. Eat one, drink three.', eff:'No effect — cheap defensive wall.', fx:''},
  {id:'bidwi',    n:'Furious Farmer',        e:'🚜', f:'razzett', r:'komuni', t:'monster', lvl:3, atk:1600, def:900,
   txt:'Someone parked in his field again. He has the tractor and the time.', eff:'No effect — efficient level-3 attacker.', fx:''},
  {id:'kaccatur', n:'The Hunter',            e:'🦆', f:'razzett', r:'rari',   t:'monster', lvl:5, atk:2400, def:1600,
   txt:'Shoots anything that flies. And a few things that do not.', eff:'When summoned: destroy the enemy monster with the lowest ATK.', fx:'snipe'},
  {id:'nannu',    n:'Grandpa With The Axe',  e:'🪓', f:'razzett', r:'rari',   t:'monster', lvl:4, atk:1700, def:1400,
   txt:'"In my day..." Sit through the whole story and he gets going.', eff:'Can attack twice each battle phase.', fx:'double'},
  {id:'kelb',     n:'The Farm Dog',          e:'🐕', f:'razzett', r:'epiku',  t:'monster', lvl:5, atk:2150, def:2450,
   txt:'Barks 24/7. Neighbours called the police twice. Still barking.', eff:'Enemies must attack this monster first (Taunt).', fx:'taunt'},
  {id:'harrub',   n:'The Old Carob Tree',    e:'🌳', f:'razzett', r:'komuni', t:'monster', lvl:4, atk:900,  def:2000,
   txt:'Older than your family. Will outlive you too.', eff:'No effect — pure wall.', fx:''},
  {id:'nanna',    n:'Nanna\'s Sunday Lunch', e:'🍝', f:'razzett', r:'rari',   t:'monster', lvl:5, atk:2300, def:2300,
   txt:'"Eat, you are too thin." You are not too thin. You will eat anyway.', eff:'When summoned: heal 800 LP.', fx:'heal8'},

  /* ══════════ CITY — slow, annoying, unkillable ══════════ */
  {id:'traffiku', n:'Marsa Traffic',         e:'🚗', f:'belt', r:'komuni', t:'monster', lvl:3, atk:800,  def:1900,
   txt:'Nothing moves. Ever. You will be late and everyone accepts it.', eff:'No effect — cheap stall wall.', fx:''},
  {id:'krejn',    n:'Another Crane',         e:'🏗️', f:'belt', r:'komuni', t:'monster', lvl:3, atk:1500, def:1100,
   txt:'A block of flats where a lovely old house used to be.', eff:'No effect — level-3 body.', fx:''},
  {id:'wejter',   n:'Patient Waiter',        e:'🍽️', f:'belt', r:'komuni', t:'monster', lvl:2, atk:1150, def:1150,
   txt:'Eight plates on one arm and a smile he does not mean.', eff:'No effect — balanced small body.', fx:''},
  {id:'burokrat', n:'Government Office',     e:'📋', f:'belt', r:'rari',   t:'monster', lvl:4, atk:1200, def:2100,
   txt:'"Come back with another form."', eff:'When summoned: enemy monsters cannot attack next turn.', fx:'stun'},
  {id:'kera',     n:'The Sliema Rent',       e:'💸', f:'belt', r:'epiku',  t:'monster', lvl:6, atk:2950, def:2100,
   txt:'Goes up every year for no reason at all.', eff:'Gains +300 ATK each of your turns.', fx:'grow2'},
  {id:'ministru', n:'THE MINISTER',          e:'🎩', f:'belt', r:'leggendarju', t:'monster', lvl:8, atk:3300, def:3100,
   txt:'Promises everything, delivers nothing, somehow still winning.', eff:'Heal 800 LP each of your turns.', fx:'healall'},
  {id:'kuntrattur',n:'The Contractor',       e:'👷', f:'belt', r:'rari',   t:'monster', lvl:5, atk:2800, def:2050,
   txt:'Started in March. It is now November. "Next week, sur."', eff:'No effect — solid tribute body.', fx:''},

  /* ══════════ SEA — sunburn and disappointment ══════════ */
  {id:'luzzu',    n:'Luzzu With The Eye',    e:'⛵', f:'bahar', r:'komuni', t:'monster', lvl:3, atk:1400, def:1400,
   txt:'The eye watches you. It has always watched you.', eff:'No effect — balanced level-3.', fx:''},
  {id:'sajjied',  n:'Lying Fisherman',       e:'🎣', f:'bahar', r:'komuni', t:'monster', lvl:2, atk:1250, def:800,
   txt:'"It was THIS big." It was the size of his thumb.', eff:'No effect — cheap attacker.', fx:''},
  {id:'lampuka',  n:'Lampuki Season',        e:'🐟', f:'bahar', r:'komuni', t:'monster', lvl:2, atk:1200, def:600,
   txt:'Short season, long price.', eff:'No effect — cheap attacker.', fx:''},
  {id:'turist',   n:'Sunburnt Tourist',      e:'🦞', f:'bahar', r:'komuni', t:'monster', lvl:3, atk:600,  def:1800,
   txt:'Factor 50 was right there in the shop. He walked past it.', eff:'No effect — cheap wall.', fx:''},
  {id:'qarnita',  n:'Summer Octopus',        e:'🐙', f:'bahar', r:'rari',   t:'monster', lvl:4, atk:1750, def:1500,
   txt:'Eight arms, eight problems.', eff:'Attacks two enemy monsters in one battle phase.', fx:'cleave'},
  {id:'bram',     n:'Jellyfish Invasion',    e:'🪼', f:'bahar', r:'epiku',  t:'monster', lvl:5, atk:2450, def:2700,
   txt:'Beach ruined for three weeks.', eff:'Any monster that attacks it takes 400 damage.', fx:'thorns'},

  /* ══════════ TROUBLE — the properly rude ones ══════════ */
  {id:'gar',      n:'The Nosy Neighbour',    e:'👁️', f:'hazen', r:'rari', t:'monster', lvl:3, atk:1400, def:1400,
   txt:'Knows what time you got in. And who dropped you off.', eff:'When summoned: look at the opponent’s hand.', fx:'peek'},
  {id:'exwife',   n:'The Ex With A Lawyer',  e:'💔', f:'hazen', r:'epiku', t:'monster', lvl:6, atk:2950, def:2250,
   txt:'Wants half of everything, including the dog.', eff:'When summoned: opponent loses 800 LP.', fx:'burn'},
  {id:'hangover', n:'Post-Festa Hangover',   e:'🤢', f:'hazen', r:'komuni', t:'monster', lvl:2, atk:900,  def:1300,
   txt:'"Never again," you say. Every single year.', eff:'No effect — cheap blocker.', fx:''},
  {id:'karozzin', n:'Runaway Karozzin',      e:'🐴', f:'hazen', r:'rari', t:'monster', lvl:4, atk:1900, def:1000,
   txt:'The horse has decided the tour is over.', eff:'No effect — high ATK for a free level-4.', fx:''},
  {id:'nannaslip',n:'Nanna\'s Slipper',      e:'🩴', f:'hazen', r:'leggendarju', t:'monster', lvl:6, atk:2900, def:2450,
   txt:'Accurate from ten metres. Never misses. You will apologise.', eff:'When summoned: destroy the enemy monster with the lowest ATK.', fx:'snipe'},
  {id:'boss',     n:'Boss On A Sunday',      e:'📞', f:'hazen', r:'epiku', t:'monster', lvl:5, atk:2800, def:2150,
   txt:'"Just a quick one." Two hours later you are still on the phone in your pants.', eff:'No effect — strong tribute body.', fx:''},
  {id:'group',    n:'The Family Group Chat', e:'📱', f:'hazen', r:'rari', t:'monster', lvl:4, atk:1800, def:1800,
   txt:'247 unread. Six of them are the same photo. Two are prayers.', eff:'No effect — balanced level-4.', fx:''},

  /* ══════════ SPELLS ══════════ */
  {id:'cisk',     n:'Double Cisk',           e:'🍺', f:null, r:'komuni', t:'spell', lvl:0, atk:0, def:0,
   txt:'Confidence up, judgement down.', eff:'Target 1 monster: +700 ATK until end of turn.', fx:'s_buff'},
  {id:'kafe',     n:'Strong Coffee',         e:'☕', f:null, r:'komuni', t:'spell', lvl:0, atk:0, def:0,
   txt:'Sleep is for other people.', eff:'Draw 2 cards.', fx:'s_draw'},
  {id:'ambulanza',n:'Ambulance, Eventually', e:'🚑', f:null, r:'rari', t:'spell', lvl:0, atk:0, def:0,
   txt:'Late, but it turned up.', eff:'Heal 1500 LP.', fx:'s_heal'},
  {id:'meta',     n:'"Mela Mhux Hekk!"',     e:'🤌', f:null, r:'komuni', t:'spell', lvl:0, atk:0, def:0,
   txt:'The argument continues regardless.', eff:'Draw 1 card.', fx:'s_draw1'},
  {id:'festalights',n:'Festa Lights',        e:'💡', f:null, r:'rari', t:'spell', lvl:0, atk:0, def:0,
   txt:'The whole street is lit up.', eff:'All your monsters gain +400 ATK this turn.', fx:'s_buffall'},
  {id:'blackout', n:'Power Cut',             e:'🔌', f:null, r:'epiku', t:'spell', lvl:0, atk:0, def:0,
   txt:'Nobody knows when it is coming back.', eff:'Destroy 1 enemy monster.', fx:'s_destroy'},
  {id:'kbarat',   n:'I Know Someone',        e:'🤝', f:null, r:'epiku', t:'spell', lvl:0, atk:0, def:0,
   txt:'It is not what you know.', eff:'Take control of 1 enemy monster until end of turn.', fx:'s_steal'},

  /* ══════════ TRAPS ══════════ */
  {id:'pulizija', n:'Police, On Time',       e:'🚓', f:null, r:'rari', t:'trap', lvl:0, atk:0, def:0,
   txt:'Miraculously they showed up.', eff:'Negate 1 attack.', fx:'t_negate'},
  {id:'bieb',     n:'Car Door',              e:'🚪', f:null, r:'komuni', t:'trap', lvl:0, atk:0, def:0,
   txt:'Nobody will admit they opened it.', eff:'Attacking monster loses 800 ATK this battle.', fx:'t_weaken'},
  {id:'kont',     n:'The Electricity Bill',  e:'🧾', f:null, r:'rari', t:'trap', lvl:0, atk:0, def:0,
   txt:'Pure shock damage.', eff:'Opponent loses 1000 LP.', fx:'t_burn'},
  {id:'mara',     n:'"Where Were You?"',     e:'🕐', f:null, r:'epiku', t:'trap', lvl:0, atk:0, def:0,
   txt:'No excuse has ever worked.', eff:'Destroy the attacking monster.', fx:'t_destroy'},
];

/* ═══════ THE RING — rock, paper, scissors, and nothing cleverer ═══════
   FESTA 🎆 → CITY 🏰 → FARM 🐇 → FESTA 🎆
   fireworks clear the bastions · paperwork beats livestock · a man with a tractor
   and a grudge beats a village committee
   +500 ATK when you attack the attribute you counter.

   This triangle is the whole ring for the three BEGINNER decks, and it is
   symmetric on purpose: each one beats exactly one and loses to exactly one,
   so no starting deck can be handed a structurally worse seat. Set 2 adds the
   two collection attributes (SEA and TROUBLE) as a mutual pair — see set2.js. */
const COUNTERS = { festa:'belt', belt:'razzett', razzett:'festa' };
const COUNTER_BONUS = 500;
function counterBonus(att, def){
  if (!att || !def || !att.f || !def.f) return 0;
  return COUNTERS[att.f] === def.f ? COUNTER_BONUS : 0;
}

/* ═══════════ THE THREE BEGINNER DECKS (40 cards each) ═══════════
   These three, and only these three, are ever handed to a player. They sit on
   the three ring attributes, one each, so the counter triangle is symmetric and
   nobody can be dealt a structurally losing seat. Everything after this comes
   out of packs and gets built by hand.

   House rules every one of them obeys, learned the hard way from IL-KAŻIN
   (which had SIXTEEN free monsters and not one of them did anything):
     · ~18 free (Level ≤ 4) monsters, of which at least half carry an effect
     · no more than 5 tribute monsters — they are payoffs, not a game plan
     · real answers in the back row, not just bodies                        */
const STARTER_DECKS = {
  festa: {
    name:'FESTA', e:'🎆', c:'#E8452C',
    tag:'Aggro — hit fast, hit loud, be gone before the smoke clears',
    beats:'CITY', loses:'FARM',
    list:{ petard:2, briju:2, marc:3, girandola:3, kavallier:3, bandist:2, tromba:2, nar:1,
           narmarina:2, katarina:1, salut:1, kunjata:1,
           cisk:2, festalights:2, kafe:2, meta:2, pastizz:1, ambulanza:1, tapit:1,
           bieb:2, kont:2, pulizija:1, mara:1 },
  },
  belt: {
    name:'CITY', e:'🏰', c:'#9C27B0',
    tag:'Control — stall, frustrate, and let them give up',
    beats:'FARM', loses:'FESTA',
    list:{ burokrat:3, traffiku:3, spettur:3, kunsill:2, bouncer:2, krejn:2, kaxxier:2,
           skavaturi:1,
           kuntrattur:1, bank:1, notar:1, permess:1, ministru:1,
           kafe:3, meta:2, ambulanza:2, blackout:2, kbarat:1, wirja:1,
           pulizija:2, mara:2, kont:1, warden:1 },
  },
  razzett: {
    name:'FARM', e:'🐇', c:'#4CAF50',
    tag:'Midrange — kill whatever stands up, keep walking',
    beats:'FESTA', loses:'CITY',
    list:{ bidwi:3, hmar:3, hanzir:2, ghannej:2, nannu:2, fenek:2, patata:2, ghasfur:1,
           klieb:1, harrub:1,
           kaccatur:1, nanna:1, serra:1, zija:1,
           kafe:2, meta:2, cisk:2, ambulanza:2, blackout:1, pjazza:1, imnarja:1,
           bieb:2, mara:2, kont:1, pulizija:1 },
  },
};
const cardById = id => CARDS.find(c => c.id === id);
function deckToCards(list){
  const out = [];
  for (const [id, n] of Object.entries(list)) for (let i = 0; i < n; i++) out.push(id);
  return out;
}
/* ═══════════════════════════════════════════════════════════════════
   THE FOUR SETS — 50 cards each, 200 in total, one pack per set.

   Every set carries the SAME rarity spread:
       27 Common · 14 Rare · 7 Epic · 2 Legendary
   That is deliberate and it is the whole point: there is no "good" pack.
   You pick the pack whose jokes and whose attributes you want, never the
   pack with the better odds, because the odds are identical everywhere.

   The 200 split 108/56/28/8, which is 27/14/7/2 x 4 exactly. Getting there
   needed two cards moved up a rarity — see the note on THE TWO PROMOTIONS
   in set3.js. Nothing else about any card changed.

   Attributes are spread on purpose too. Each set LEADS on one attribute
   (14 of its 28 cards) but every set still carries 4-5 of every other
   attribute and exactly 7 TROUBLE, so no faction lives in only one pack
   and nobody has to buy a set they find unfunny to finish a deck.

       FESTA   14 / 5 / 5 / 4        SEA     5 / 14 / 4 / 5
       CITY     4 / 5 / 14 / 5       FARM    5 / 4 / 5 / 14
       TROUBLE  7 / 7 / 7 / 7
   ═══════════════════════════════════════════════════════════════════ */
const CARD_SETS = [
  {
    id:'fst', code:'FST', no:1,
    name:'IL-FESTA MA TIEQAFX', sub:'The Festa Doesn\'t Stop',
    lead:'festa', c:'#E8452C', art:'pack-set1.png',
    blurb:'The band, the bangs, the bar, and getting home at four in the morning ' +
          'with one shoe and a full explanation nobody asked for.',
    ids:[
      /* L */ 'surmast','kunjata',
      /* E */ 'statwa','katarina','bombi','tromba','blackout','kbarat','mara',
      /* R */ 'marc','kazin','salut','briju','regatta','bouncer','ghannej','karozzin',
              'debtor','festalights','imnarja','kappella','dawl','pulizija',
      /* C */ 'petard','bomba','sparkler','banda2','luzzu','klamari','kurrent','lampuka',
              'vespa','wejter','valletta','fenek','frawli','karettun','tigiega','hangover',
              'karaoke','partit','kugin','ghajn','cisk','bajtra','pastizz','imqaret',
              'qaghaq','barriera','wegha',
    ],
  },
  {
    id:'xms', code:'XMS', no:2,
    name:'XEMX, MELĦ U DISPJAĊIR', sub:'Sun, Salt And Regret',
    lead:'bahar', c:'#2196F3', art:'pack-set2.png',
    blurb:'Three hours of queueing for twenty-five minutes of crossing, a towel on ' +
          'eight sunbeds since seven, and a shoulder that never fully recovers.',
    ids:[
      /* L */ 'sirena','nannaslip',
      /* E */ 'bram','blue','pixxispad','mewga','spiter','boss','ommok',
      /* R */ 'qarnita','bahri','dghajsa','maltemp','narmarina','nar','penthouse','serra',
              'bocci','siesta','ambulanza','screenshot','ncempel','lift',
      /* C */ 'turist','bagni','xugaman','ghadira','xemx','qniepen','partitarju','abbati',
              'bus','parkegg','hanut','traffiku','patata','bir','dielja','kuntu',
              'email','wattsapp','granita','ftira','baharkalm','weekend','kinnie','xita',
              'sptar','hass','skuza',
    ],
  },
  {
    id:'eeg', code:'EEG', no:3,
    name:'ERĠA\' EJJA GĦADA', sub:'Come Back Tomorrow',
    lead:'belt', c:'#9C27B0', art:'pack-set3.png',
    blurb:'They are serving number 31. You are number 84. One window is closed and ' +
          'the other one is on a personal call. Bring another form.',
    ids:[
      /* L */ 'ministru','vat',
      /* E */ 'kera','notar','permess','tribunal','kondominju','kredituri','bulldozer',
      /* R */ 'burokrat','bank','taxxa','spettur','president','mahzen','ghasfur','wirt',
              'skiet','gar','pjazza','inawgurazzjoni','kont','bolla',
      /* C */ 'kju','sinjal','krejn','skavaturi','rota','kummissjoni','purcissjoni',
              'bandalora','armar','gozoferry','nassa','qroll','sajjied','ghalqa','harrub',
              'bidwi','qarrejja','bonu','kafe','meta','kwarezimal','whisky','tea','qassata',
              'warden','hofra','qtar',
    ],
  },
  {
    id:'kul', code:'KUL', no:4,
    name:'KUL, INTI RQIQ WISQ', sub:'Eat, You\'re Too Thin',
    lead:'razzett', c:'#4CAF50', art:'pack-set4.png',
    blurb:'The farm, the table, and every relative you have. You are not leaving until ' +
          'the plate is empty, and then there is a second plate.',
    ids:[
      /* L */ 'zija','nannathares',
      /* E */ 'kelb','tigrija','bettieha','exwife','tapit','kuntatt','cavetta',
      /* R */ 'nannu','klieb','kaccatur','nanna','raddiena','kunsill','kuntrattur','klinika',
              'kavallier','group','ommgharusa','wirja','tiswija','garanzija',
      /* C */ 'gbejna','bebbux','naghga','hanzir','hmar','garaxx','kaxxier','pupa',
              'bandist','girandola','rizzi','kajakk','mask','xlokk','jetski','tieg',
              'festin','kunjatu','gossip','mistura','siggu','tombla','helwa','xalata',
              'bieb','qattus','zibel',
    ],
  },
];

/* id -> set id. Built once, and rebuilt if the pool ever grows under it. */
let _setOfMap = null, _setOfLen = -1;
function setIndex(){
  if (_setOfMap && _setOfLen === CARDS.length) return _setOfMap;
  const m = Object.create(null);
  CARD_SETS.forEach(s => s.ids.forEach(id => { m[id] = s.id; }));
  _setOfMap = m; _setOfLen = CARDS.length;
  return m;
}
const setOf   = id => setIndex()[id] || null;
const cardSet = id => CARD_SETS.find(s => s.id === id) || null;

/* pool of real card objects for one set (or the whole 200 when setId is null),
   memoised per rarity because openPack hits it five times a pack. */
let _pools = null, _poolsLen = -1;
function poolFor(setId, rarity){
  if (!_pools || _poolsLen !== CARDS.length){ _pools = Object.create(null); _poolsLen = CARDS.length; }
  const key = (setId || '*') + '|' + rarity;
  if (_pools[key]) return _pools[key];
  const idx = setIndex();
  const list = CARDS.filter(c => c.r === rarity && (!setId || idx[c.id] === setId));
  _pools[key] = list;
  return list;
}

/* ═══════════════════════════════════════════════════════════════════
   PACK ODDS AND THE PITY COUNTER

   Five cards. The first four are a straight roll. The fifth is the "hit"
   slot and is always Rare or better — that has always been true and the
   pack art says so on the front, so it stays.

   Legendary is meant to be a treat, not a Tuesday: roughly one every
   fifteen to twenty packs. Two guarantees stop a bad streak turning into
   a bad week:

     · EPIC PITY — ten packs in a row with nothing Epic or better and the
       tenth pack's hit slot is forced to Epic. It only has to step in
       about once in every 175 packs; the point is that it CANNOT not
       fire, so there is no such thing as an eleventh empty pack.
     · LEGENDARY PITY — from the 23rd dry pack the hit slot's Legendary
       chance climbs by 2 points a pack, and the 40th dry pack is a
       guaranteed Legendary. Measured over 200,000 packs that lands at
       one Legendary every 16.5 packs, median gap 15.

   BOTH counters live in the SAVE (S.pity), are written the instant the
   pack is generated, and are keyed to the signed-in account. Reloading
   the page, force-quitting, or reopening the app re-reads them from
   localStorage — there is no way to reroll a pack or wipe a counter by
   refreshing, which is the entire reason they are not module variables.
   ═══════════════════════════════════════════════════════════════════ */
const PACK_ODDS = {
  size: 5,
  base: { leggendarju:0.004, epiku:0.040, rari:0.220 },  /* slots 1-4, rest Common */
  hit:  { leggendarju:0.032, epiku:0.180 },              /* slot 5, rest Rare      */
  legSoftAfter: 22,      /* dry packs before the ramp starts   */
  legSoftStep:  0.020,   /* +2% Legendary on the hit slot each dry pack after that */
  legHard:      40,      /* guaranteed Legendary on this dry pack */
  epicHard:     10,      /* guaranteed Epic-or-better on this dry pack */
};
const FRESH_PITY = () => ({ leg:0, epic:0, packs:0 });

/* The live pity record, read out of the per-user save. Creates the field on
   first use so an old save that predates packs migrates itself instead of
   crashing — but game.js's DEFAULT_STATE should carry `pity` too, so a brand
   new account starts with it rather than growing it later. */
function packPity(){
  const K = typeof window !== 'undefined' && window.KARTI;
  const S = K && K.S;
  if (!S) return FRESH_PITY();                    /* no save yet (tests, boot) */
  const p = S.pity;
  if (!p || typeof p !== 'object'){ S.pity = FRESH_PITY(); return S.pity; }
  if (typeof p.leg   !== 'number' || p.leg   < 0) p.leg   = 0;
  if (typeof p.epic  !== 'number' || p.epic  < 0) p.epic  = 0;
  if (typeof p.packs !== 'number' || p.packs < 0) p.packs = 0;
  return p;
}
function savePity(){
  const K = typeof window !== 'undefined' && window.KARTI;
  if (K && typeof K.save === 'function') K.save();
}

const RANK_R = { komuni:0, rari:1, epiku:2, leggendarju:3 };

/* one roll of a normal (non-hit) slot */
function rollRarity(){
  const x = Math.random(), o = PACK_ODDS.base;
  if (x < o.leggendarju) return 'leggendarju';
  if (x < o.leggendarju + o.epiku) return 'epiku';
  if (x < o.leggendarju + o.epiku + o.rari) return 'rari';
  return 'komuni';
}
/* one roll of the hit slot — never Common, and it is the slot every
   guarantee is applied to. `legDry` = packs since the last Legendary. */
function rollHitRarity(legDry){
  const o = PACK_ODDS.hit;
  const ramp = Math.max(0, (legDry || 0) - (PACK_ODDS.legSoftAfter - 1)) * PACK_ODDS.legSoftStep;
  const leg = Math.min(1, o.leggendarju + ramp);
  const x = Math.random();
  if (x < leg) return 'leggendarju';
  if (x < leg + o.epiku) return 'epiku';
  return 'rari';
}
function randomCardOf(r, setId){
  const pool = poolFor(setId || null, r);
  if (!pool.length) return poolFor(null, r)[0] || CARDS[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

/* openPack(n, setId)
   Public shape unchanged: openPack() and openPack(5) still return an array of
   n card objects, weakest-to-strongest slot order, last one Rare or better.
   `setId` is new and optional — one of CARD_SETS[].id. Left out, it falls back
   to the set the player last chose (S.packSet) and then to the whole 200. */
function openPack(n = PACK_ODDS.size, setId){
  const st  = packPity();
  const K   = typeof window !== 'undefined' && window.KARTI;
  const S   = K && K.S;
  const sid = setId || (S && S.packSet) || null;
  const pool = (sid && cardSet(sid)) ? sid : null;

  const forceLeg  = st.leg  >= PACK_ODDS.legHard  - 1;
  const forceEpic = st.epic >= PACK_ODDS.epicHard - 1;

  const rar = [];
  for (let i = 0; i < n - 1; i++) rar.push(rollRarity());
  if (n > 0) rar.push(rollHitRarity(st.leg));

  const best = () => rar.reduce((a, r) => Math.max(a, RANK_R[r]), 0);
  const hit  = n - 1;
  if (forceLeg  && best() < 3 && hit >= 0) rar[hit] = 'leggendarju';
  if (forceEpic && best() < 2 && hit >= 0) rar[hit] = 'epiku';

  const out = rar.map(r => randomCardOf(r, pool));

  /* counters move BEFORE anything is animated, and are persisted immediately */
  const top = best();
  st.leg   = top >= 3 ? 0 : st.leg + 1;
  st.epic  = top >= 2 ? 0 : st.epic + 1;
  st.packs = (st.packs || 0) + 1;
  savePity();
  return out;
}
const tributesFor = lvl => lvl >= 7 ? 2 : lvl >= 5 ? 1 : 0;

/* cards.js is loaded before game.js builds window.KARTI, so the set/pack API
   is parked here and folded into window.KARTI by gacha.js (which loads last).
   CARDS and friends are `const`, i.e. not window properties, so this is the
   only way anything outside this script scope can see them. */
if (typeof window !== 'undefined'){
  window.KARTI_PACKS = { CARD_SETS, setOf, cardSet, poolFor, PACK_ODDS,
                         packPity, openPack, rollRarity, rollHitRarity, randomCardOf };
}
