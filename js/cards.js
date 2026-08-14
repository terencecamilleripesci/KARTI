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
   txt:'Wakes the whole village. Nobody knows who lit it. When destroyed: 500 damage to everyone.', fx:'boom'},
  {id:'bandist',  n:'Drunk Bandsman',        e:'🎺', f:'festa', r:'komuni', t:'monster', lvl:3, atk:1400, def:1000,
   txt:'Playing the wrong notes with total confidence. +200 ATK every turn he keeps drinking.', fx:'grow'},
  {id:'pupa',     n:'Carnival Float',        e:'🎭', f:'festa', r:'komuni', t:'monster', lvl:2, atk:800,  def:1200,
   txt:'Took nine months to build. Lasts one afternoon. Bit like some marriages.', fx:''},
  {id:'kavallier',n:'Same Shirt Since 1998', e:'🎖️', f:'festa', r:'rari',   t:'monster', lvl:4, atk:1900, def:1200,
   txt:'Never washed, never replaced. Nobody dares mention the smell.', fx:''},
  {id:'nar',      n:'Firework Finale',       e:'🎇', f:'festa', r:'rari',   t:'monster', lvl:4, atk:2000, def:200,
   txt:'Spectacular for two seconds, then gone. Destroyed after it attacks.', fx:'kamikaze'},
  {id:'statwa',   n:'The Heavy Statue',      e:'🗿', f:'festa', r:'epiku',  t:'monster', lvl:6, atk:2400, def:2800,
   txt:'Eight men underneath, all pretending their back is fine.', fx:''},
  {id:'kunjata',  n:'THE KUNJATA',           e:'👵', f:'festa', r:'leggendarju', t:'monster', lvl:8, atk:3000, def:2500,
   txt:'Your mother-in-law. Criticises everything. Opponent discards a card every turn. She never stops.', fx:'discard'},

  /* ══════════ FARM — steady, brutal, no nonsense ══════════ */
  {id:'fenek',    n:'Sunday Rabbit',         e:'🐇', f:'razzett', r:'komuni', t:'monster', lvl:2, atk:1000, def:800,
   txt:'Cooked in wine since Friday. When summoned: heal 500 LP.', fx:'heal'},
  {id:'gbejna',   n:'Peppered Ġbejna',       e:'🧀', f:'razzett', r:'komuni', t:'monster', lvl:1, atk:400,  def:1500,
   txt:'Hard, salty, and somehow the whole meal. Eat one, drink three.', fx:''},
  {id:'bidwi',    n:'Furious Farmer',        e:'🚜', f:'razzett', r:'komuni', t:'monster', lvl:3, atk:1600, def:900,
   txt:'Someone parked in his field again. He has the tractor and the time.', fx:''},
  {id:'kaccatur', n:'The Hunter',            e:'🦆', f:'razzett', r:'rari',   t:'monster', lvl:4, atk:1800, def:1000,
   txt:'Shoots anything that flies. And a few things that don\'t. Destroys the weakest enemy monster.', fx:'snipe'},
  {id:'nannu',    n:'Grandpa With The Axe',  e:'🪓', f:'razzett', r:'rari',   t:'monster', lvl:4, atk:1700, def:1400,
   txt:'"In my day…" Sit through the whole story and he attacks twice.', fx:'double'},
  {id:'kelb',     n:'The Farm Dog',          e:'🐕', f:'razzett', r:'epiku',  t:'monster', lvl:5, atk:2100, def:2400,
   txt:'Barks 24/7. Neighbours called the police twice. Still barking. Enemies must attack him first.', fx:'taunt'},
  {id:'harrub',   n:'The Old Carob Tree',    e:'🌳', f:'razzett', r:'komuni', t:'monster', lvl:4, atk:900,  def:2000,
   txt:'Older than your family. Will outlive you too.', fx:''},
  {id:'nanna',    n:'Nanna\'s Sunday Lunch', e:'🍝', f:'razzett', r:'rari',   t:'monster', lvl:5, atk:2000, def:2000,
   txt:'"Eat, you\'re too thin." You are not too thin. You will eat anyway. Heal 800 LP.', fx:'heal8'},

  /* ══════════ CITY — slow, annoying, unkillable ══════════ */
  {id:'traffiku', n:'Marsa Traffic',         e:'🚗', f:'belt', r:'komuni', t:'monster', lvl:3, atk:800,  def:1900,
   txt:'Nothing moves. Ever. You will be late and everyone accepts it.', fx:''},
  {id:'krejn',    n:'Another Crane',         e:'🏗️', f:'belt', r:'komuni', t:'monster', lvl:3, atk:1500, def:1100,
   txt:'A block of flats where a lovely old house used to be.', fx:''},
  {id:'wejter',   n:'Patient Waiter',        e:'🍽️', f:'belt', r:'komuni', t:'monster', lvl:2, atk:1000, def:1000,
   txt:'Eight plates on one arm and a smile he does not mean.', fx:''},
  {id:'burokrat', n:'Government Office',     e:'📋', f:'belt', r:'rari',   t:'monster', lvl:4, atk:1200, def:2100,
   txt:'"Come back with another form." Enemy monsters cannot attack next turn.', fx:'stun'},
  {id:'kera',     n:'The Sliema Rent',       e:'💸', f:'belt', r:'epiku',  t:'monster', lvl:6, atk:2500, def:1800,
   txt:'Goes up every year for no reason at all. +300 ATK every turn.', fx:'grow2'},
  {id:'ministru', n:'THE MINISTER',          e:'🎩', f:'belt', r:'leggendarju', t:'monster', lvl:8, atk:2900, def:2900,
   txt:'Promises everything, delivers nothing, somehow still winning. Heal 800 LP every turn.', fx:'healall'},
  {id:'kuntrattur',n:'The Contractor',       e:'👷', f:'belt', r:'rari',   t:'monster', lvl:5, atk:2200, def:1600,
   txt:'Started in March. It is now November. "Next week, sur."', fx:''},

  /* ══════════ SEA — sunburn and disappointment ══════════ */
  {id:'luzzu',    n:'Luzzu With The Eye',    e:'⛵', f:'bahar', r:'komuni', t:'monster', lvl:3, atk:1300, def:1300,
   txt:'The eye watches you. It has always watched you.', fx:''},
  {id:'sajjied',  n:'Lying Fisherman',       e:'🎣', f:'bahar', r:'komuni', t:'monster', lvl:2, atk:1100, def:700,
   txt:'"It was THIS big." It was the size of his thumb.', fx:''},
  {id:'lampuka',  n:'Lampuki Season',        e:'🐟', f:'bahar', r:'komuni', t:'monster', lvl:2, atk:1200, def:600,
   txt:'Short season, long price.', fx:''},
  {id:'turist',   n:'Sunburnt Tourist',      e:'🦞', f:'bahar', r:'komuni', t:'monster', lvl:3, atk:600,  def:1800,
   txt:'Factor 50 was right there in the shop. He walked past it.', fx:''},
  {id:'qarnita',  n:'Summer Octopus',        e:'🐙', f:'bahar', r:'rari',   t:'monster', lvl:4, atk:1750, def:1500,
   txt:'Eight arms, eight problems. Attacks two monsters at once.', fx:'cleave'},
  {id:'bram',     n:'Jellyfish Invasion',    e:'🪼', f:'bahar', r:'epiku',  t:'monster', lvl:5, atk:2000, def:2200,
   txt:'Beach ruined for three weeks. Anything attacking it takes 400 damage.', fx:'thorns'},

  /* ══════════ TROUBLE — the properly rude ones ══════════ */
  {id:'gar',      n:'The Nosy Neighbour',    e:'👁️', f:'hazen', r:'rari', t:'monster', lvl:3, atk:1400, def:1400,
   txt:'Knows what time you got in. And who dropped you off. And what you were wearing.', fx:'peek'},
  {id:'exwife',   n:'The Ex With A Lawyer',  e:'💔', f:'hazen', r:'epiku', t:'monster', lvl:6, atk:2600, def:2000,
   txt:'Wants half of everything, including the dog. Summon: opponent loses 800 LP.', fx:'burn'},
  {id:'hangover', n:'Post-Festa Hangover',   e:'🤢', f:'hazen', r:'komuni', t:'monster', lvl:2, atk:900,  def:1300,
   txt:'"Never again," you say. Every single year.', fx:''},
  {id:'karozzin', n:'Runaway Karozzin',      e:'🐴', f:'hazen', r:'rari', t:'monster', lvl:4, atk:1900, def:800,
   txt:'The horse has decided the tour is over.', fx:''},
  {id:'nannaslip',n:'Nanna\'s Slipper',      e:'🩴', f:'hazen', r:'leggendarju', t:'monster', lvl:7, atk:2800, def:2600,
   txt:'Accurate from ten metres. Never misses. You will apologise.', fx:'snipe'},
  {id:'boss',     n:'Boss On A Sunday',      e:'📞', f:'hazen', r:'epiku', t:'monster', lvl:5, atk:2300, def:1500,
   txt:'"Just a quick one." Two hours later you are still on the phone in your pants.', fx:''},
  {id:'group',    n:'The Family Group Chat', e:'📱', f:'hazen', r:'rari', t:'monster', lvl:4, atk:1600, def:1600,
   txt:'247 unread. Six of them are the same photo. Two are prayers.', fx:''},

  /* ══════════ SPELLS ══════════ */
  {id:'cisk',     n:'Double Cisk',           e:'🍺', f:null, r:'komuni', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: +700 ATK to one monster this turn. Confidence up, judgement down.', fx:'s_buff'},
  {id:'kafe',     n:'Strong Coffee',         e:'☕', f:null, r:'komuni', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: Draw 2 cards. Sleep is for other people.', fx:'s_draw'},
  {id:'ambulanza',n:'Ambulance, Eventually', e:'🚑', f:null, r:'rari', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: Heal 1500 LP. Late, but it turned up.', fx:'s_heal'},
  {id:'meta',     n:'"Mela Mhux Hekk!"',     e:'🤌', f:null, r:'komuni', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: Draw a card. The argument continues regardless.', fx:'s_draw1'},
  {id:'festalights',n:'Festa Lights',        e:'💡', f:null, r:'rari', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: All your monsters gain +400 ATK. The whole street is lit up.', fx:'s_buffall'},
  {id:'blackout', n:'Power Cut',             e:'🔌', f:null, r:'epiku', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: Destroy one enemy monster. Nobody knows when it is coming back.', fx:'s_destroy'},
  {id:'kbarat',   n:'I Know Someone',        e:'🤝', f:null, r:'epiku', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: Take control of an enemy monster this turn. It is not what you know.', fx:'s_steal'},

  /* ══════════ TRAPS ══════════ */
  {id:'pulizija', n:'Police, On Time',       e:'🚓', f:null, r:'rari', t:'trap', lvl:0, atk:0, def:0,
   txt:'TRAP: Cancel one attack. Miraculously they showed up.', fx:'t_negate'},
  {id:'bieb',     n:'Car Door',              e:'🚪', f:null, r:'komuni', t:'trap', lvl:0, atk:0, def:0,
   txt:'TRAP: Attacking monster loses 800 ATK. Nobody will admit they opened it.', fx:'t_weaken'},
  {id:'kont',     n:'The Electricity Bill',  e:'🧾', f:null, r:'rari', t:'trap', lvl:0, atk:0, def:0,
   txt:'TRAP: Opponent loses 1000 LP. Pure shock damage.', fx:'t_burn'},
  {id:'mara',     n:'"Where Were You?"',     e:'🕐', f:null, r:'epiku', t:'trap', lvl:0, atk:0, def:0,
   txt:'TRAP: Destroy the attacking monster instantly. No excuse has ever worked.', fx:'t_destroy'},
];

/* ═══════ THE TRIANGLE — every deck beats one and loses to another ═══════
   FESTA 🎆 → burns down CITY   (fireworks go straight over the walls)
   CITY  🏰 → grinds down FARM  (paperwork beats livestock)
   FARM  🐇 → shoots down FESTA (the hunter drops it before it lights)
   +500 ATK when you attack the attribute you counter.                   */
const COUNTERS = { festa:'belt', belt:'razzett', razzett:'festa' };
const COUNTER_BONUS = 500;
function counterBonus(att, def){
  if (!att || !def || !att.f || !def.f) return 0;
  return COUNTERS[att.f] === def.f ? COUNTER_BONUS : 0;
}

/* ═══════════ THE THREE STARTER DECKS (40 cards each) ═══════════ */
const STARTER_DECKS = {
  festa: {
    name:'FESTA', e:'🎆', c:'#E8452C',
    tag:'Aggro — hit fast, hit loud, be gone before the smoke clears',
    beats:'CITY', loses:'FARM',
    list:{ petard:3, bandist:3, pupa:2, kavallier:3, nar:3, statwa:2, kunjata:1,
           hangover:3, karozzin:2, gar:2, boss:1,
           cisk:3, kafe:2, meta:3, festalights:2, ambulanza:1,
           bieb:2, kont:1, pulizija:1 },
  },
  belt: {
    name:'CITY', e:'🏰', c:'#9C27B0',
    tag:'Control — stall, frustrate, and let them give up',
    beats:'FARM', loses:'FESTA',
    list:{ traffiku:3, krejn:3, wejter:2, burokrat:3, kera:2, ministru:1, kuntrattur:2,
           turist:3, luzzu:2, boss:2, group:2,
           kafe:3, ambulanza:2, blackout:2, kbarat:1, meta:2,
           pulizija:2, mara:2, kont:1 },
  },
  razzett: {
    name:'FARM', e:'🐇', c:'#4CAF50',
    tag:'Midrange — kill whatever stands up, keep walking',
    beats:'FESTA', loses:'CITY',
    list:{ fenek:3, gbejna:2, bidwi:3, kaccatur:3, nannu:3, kelb:2, harrub:2, nanna:2,
           sajjied:2, lampuka:2, nannaslip:1, exwife:1,
           cisk:2, kafe:2, meta:2, ambulanza:2, blackout:1,
           bieb:2, mara:2, kont:1 },
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
