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

const RARITY = {
  komuni:      { n:'Common',    c:'#9e9e9e', odds:.60, dust:5   },
  rari:        { n:'Rare',      c:'#2196F3', odds:.27, dust:20  },
  epiku:       { n:'Epic',      c:'#9C27B0', odds:.10, dust:60  },
  leggendarju: { n:'Legendary', c:'#FFB300', odds:.03, dust:200 },
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
/* ── pack odds ── */
function rollRarity(){
  let x = Math.random();
  if (x < RARITY.leggendarju.odds) return 'leggendarju';
  x -= RARITY.leggendarju.odds;
  if (x < RARITY.epiku.odds) return 'epiku';
  x -= RARITY.epiku.odds;
  if (x < RARITY.rari.odds) return 'rari';
  return 'komuni';
}
function randomCardOf(r){
  const pool = CARDS.filter(c => c.r === r);
  return pool[Math.floor(Math.random() * pool.length)];
}
function openPack(n = 5){
  const out = [];
  for (let i = 0; i < n; i++){
    let r = rollRarity();
    if (i === n - 1 && r === 'komuni') r = 'rari';   // last card always rare+
    out.push(randomCardOf(r));
  }
  return out;
}
const tributesFor = lvl => lvl >= 7 ? 2 : lvl >= 5 ? 1 : 0;
