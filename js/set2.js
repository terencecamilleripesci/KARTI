/* ═══════════════════════════════════════════════════════════════════
   KARTI — SET 2 · "IL-KAOS TAS-SAJF"  (The Summer Chaos)
   70 new cards · load AFTER cards.js
   Same schema: {id, n, e, f, r, t, lvl, atk, def, txt, fx}
   Adds the SEA 🌊 and TROUBLE 😈 decks and closes the counter ring.
   ═══════════════════════════════════════════════════════════════════ */

/* ── NEW fx introduced by Set 2 (6 total) ──────────────────────────
   shield : the first time this monster would be destroyed in battle, it survives instead.
   leech  : battle damage this monster deals to the opponent also heals you the same amount.
   revive : on summon, return one monster from your graveyard to your hand.
   weaken : on summon, every enemy monster loses 400 ATK (permanently).
   s_search : SPELL — add one monster from your deck to your hand.
   t_bounce : TRAP — return the attacking monster to its owner's hand.
   ─────────────────────────────────────────────────────────────────── */
const SET2_FX = {
  shield:   'First time this monster would be destroyed in battle, it survives instead (once).',
  leech:    'Battle damage this monster deals to the opponent also heals you that amount.',
  revive:   'On summon: return one monster from your graveyard to your hand.',
  weaken:   'On summon: every enemy monster loses 400 ATK.',
  s_search: 'SPELL: add one monster from your deck to your hand.',
  t_bounce: 'TRAP: return the attacking monster to its owner\'s hand.',
};

const SET2 = [
  /* ══════════ FESTA 🎆 — louder, later, still going ══════════ */
  {id:'abbati',    n:'Altar Boy On Red Bull',  e:'⛪', f:'festa', r:'komuni', t:'monster', lvl:1, atk:700,  def:500,
   txt:'Swinging the incense like a nunchuck. Two more cans and he takes off.', fx:''},
  {id:'bomba',     n:'Daytime Fireworks',      e:'💥', f:'festa', r:'komuni', t:'monster', lvl:2, atk:1100, def:400,
   txt:'You cannot even see them. That was never the point. When destroyed: 500 damage to everyone.', fx:'boom'},
  {id:'banda2',    n:'The Other Band Club',    e:'🎼', f:'festa', r:'komuni', t:'monster', lvl:3, atk:1500, def:800,
   txt:'Same village, opposite side of the square. Sixty years, not one word exchanged.', fx:''},
  {id:'partitarju',n:'Festa Fanatic',          e:'🙌', f:'festa', r:'komuni', t:'monster', lvl:3, atk:1400, def:1100,
   txt:'Cries at the statue, fights about the lights, banned from the committee, back again next year.', fx:''},
  {id:'purcissjoni',n:'The Slow Procession',   e:'🕯️', f:'festa', r:'komuni', t:'monster', lvl:4, atk:1000, def:1900,
   txt:'Three hours to move two hundred metres. Nobody is allowed to overtake. Not even the ambulance.', fx:''},
  {id:'briju',     n:'Beer Thrown In The Air', e:'🍺', f:'festa', r:'rari',   t:'monster', lvl:3, atk:1300, def:600,
   txt:'Half of it lands on you, half on the priest. Summon: opponent loses 800 LP.', fx:'burn'},
  {id:'marc',      n:'The Evening March',      e:'🥁', f:'festa', r:'rari',   t:'monster', lvl:4, atk:1800, def:1000,
   txt:'It started at seven. It is now one in the morning. It gets louder: +200 ATK every turn.', fx:'grow'},
  {id:'kazin',     n:'The Band Club Bar',      e:'🍻', f:'festa', r:'rari',   t:'monster', lvl:5, atk:2200, def:2100,
   txt:'Two euro a beer and forty years of unfinished arguments. Everyone ends up here — enemies must attack it first.', fx:'taunt'},
  {id:'katarina',  n:'The Petard Shed',        e:'🏭', f:'festa', r:'epiku',  t:'monster', lvl:6, atk:2500, def:1200,
   txt:'Licensed, probably. Insured, definitely not. When destroyed: 500 damage to everyone.', fx:'boom'},

  /* ══════════ FARM 🐇 — dirt, diesel and no small talk ══════════ */
  {id:'bebbux',    n:'Bucket Of Bebbux',       e:'🐌', f:'razzett', r:'komuni', t:'monster', lvl:1, atk:300,  def:1400,
   txt:'After the first rain the whole family is out in the fields. Dinner walks home by itself.', fx:''},
  {id:'tigiega',   n:'Free Range Chicken',     e:'🐓', f:'razzett', r:'komuni', t:'monster', lvl:2, atk:1200, def:500,
   txt:'Chases children, fears nothing, feared by all. Sunday came anyway.', fx:''},
  {id:'hanzir',    n:'The Neighbour\'s Pig',   e:'🐖', f:'razzett', r:'komuni', t:'monster', lvl:3, atk:1500, def:1000,
   txt:'You can smell it from the next village. Nobody has ever complained twice.', fx:''},
  {id:'ghalqa',    n:'The Rubble Wall',        e:'🧱', f:'razzett', r:'komuni', t:'monster', lvl:4, atk:700,  def:2000,
   txt:'Built without a drop of cement by a man who left school at eleven. Still standing.', fx:''},
  {id:'ghannej',   n:'Għana Singer',           e:'🎸', f:'razzett', r:'rari',   t:'monster', lvl:4, atk:1700, def:1300,
   txt:'Insults you in rhyme for forty minutes straight. You cannot look away — enemies must attack him first.', fx:'taunt'},
  {id:'ghasfur',   n:'The Bird Trapper',       e:'🪤', f:'razzett', r:'rari',   t:'monster', lvl:4, atk:1700, def:1200,
   txt:'In the hide since five, with binoculars and a licence he printed himself. Summon: all enemy monsters lose 400 ATK.', fx:'weaken'},
  {id:'raddiena',  n:'The Old Windmill',       e:'🌾', f:'razzett', r:'rari',   t:'monster', lvl:5, atk:2000, def:2400,
   txt:'Turning since the Knights and outliving every plan to restore it. Survives the first thing that hits it.', fx:'shield'},
  {id:'tigrija',   n:'Sunday Horse Races',     e:'🏇', f:'razzett', r:'epiku',  t:'monster', lvl:6, atk:2400, def:1700,
   txt:'Two hundred euro on a horse called Biċċa. Attacks twice. Your uncle still says it was fixed.', fx:'double'},
  {id:'zija',      n:'THE AUNT WHO FEEDS YOU', e:'🍲', f:'razzett', r:'leggendarju', t:'monster', lvl:7, atk:2800, def:2400,
   txt:'You are not leaving until the plate is empty. Then there is a second plate. Damage she deals also heals you.', fx:'leech'},

  /* ══════════ CITY 🏰 — permits, dust and no parking ══════════ */
  {id:'parkegg',   n:'The Saved Parking Space',e:'🅿️', f:'belt', r:'komuni', t:'monster', lvl:2, atk:600,  def:1600,
   txt:'Someone left a plastic chair in it. The chair has been there since 2011. The chair has rights now.', fx:''},
  {id:'valletta',  n:'Republic Street At 5pm', e:'🚶', f:'belt', r:'komuni', t:'monster', lvl:2, atk:900,  def:1300,
   txt:'Nine hundred people, all walking slower than you, all stopping dead without warning.', fx:''},
  {id:'bus',       n:'The Bus That Didn\'t Stop',e:'🚌', f:'belt', r:'komuni', t:'monster', lvl:3, atk:1200, def:1400,
   txt:'You waved. He looked straight at you. He kept going. The next one is in fifty minutes.', fx:''},
  {id:'skavaturi', n:'6am Saturday Drilling',  e:'🔨', f:'belt', r:'komuni', t:'monster', lvl:3, atk:1600, def:700,
   txt:'The permit is pinned to a wall you will never find. Your ceiling now has a hobby.', fx:''},
  {id:'bouncer',   n:'Paceville Bouncer',      e:'🕶️', f:'belt', r:'rari',   t:'monster', lvl:4, atk:1900, def:600,
   txt:'You are not on the list. You have never been on the list. Nobody gets past — enemies must attack him first.', fx:'taunt'},
  {id:'kunsill',   n:'The Local Council',      e:'🏛️', f:'belt', r:'rari',   t:'monster', lvl:4, atk:1400, def:2000,
   txt:'Complains about everything, fixes nothing, and somehow it is your fault. Anything attacking it takes 400 damage.', fx:'thorns'},
  {id:'penthouse', n:'The Penthouse Nobody Bought',e:'🏢', f:'belt', r:'rari', t:'monster', lvl:5, atk:2100, def:2100,
   txt:'Sea view of another block of flats. On the market since the day it was finished.', fx:''},
  {id:'notar',     n:'The Notary',             e:'📜', f:'belt', r:'epiku',  t:'monster', lvl:6, atk:2400, def:2200,
   txt:'Reads every clause out loud, twice, in two languages. Opponent discards a card every turn.', fx:'discard'},
  {id:'permess',   n:'The Planning Permit',    e:'🖊️', f:'belt', r:'epiku',  t:'monster', lvl:6, atk:2500, def:2000,
   txt:'Approved at 11pm on a Friday in August, when nobody was looking. Summon: all enemy monsters lose 400 ATK.', fx:'weaken'},

  /* ══════════ SEA 🌊 — salt, sunburn and mild regret ══════════ */
  {id:'rizzi',     n:'Sea Urchin',             e:'🦔', f:'bahar', r:'komuni', t:'monster', lvl:1, atk:400,  def:1200,
   txt:'You did not see it. Your foot found it. Anything attacking it takes 400 damage.', fx:'thorns'},
  {id:'ghadira',   n:'Golden Bay In August',   e:'🏖️', f:'bahar', r:'komuni', t:'monster', lvl:2, atk:900,  def:1200,
   txt:'Two hundred umbrellas, one square metre of free sand, and a man shouting about coffee.', fx:''},
  {id:'kajakk',    n:'Rented Kayak',           e:'🛶', f:'bahar', r:'komuni', t:'monster', lvl:2, atk:1000, def:600,
   txt:'Twenty euro an hour. Fifteen minutes of fun and a shoulder that never fully recovers.', fx:''},
  {id:'bagni',     n:'The Beach Lido',         e:'⛱️', f:'bahar', r:'komuni', t:'monster', lvl:3, atk:1100, def:1600,
   txt:'Fifteen euro for a sunbed on a beach that legally belongs to everybody.', fx:''},
  {id:'kurrent',   n:'The Current',            e:'🌀', f:'bahar', r:'komuni', t:'monster', lvl:3, atk:1400, def:900,
   txt:'You swam out ten metres to look brave. You are now waving at Sicily.', fx:''},
  {id:'klamari',   n:'Fried Calamari',         e:'🦑', f:'bahar', r:'komuni', t:'monster', lvl:3, atk:1500, def:1000,
   txt:'Rubber rings in batter, eighteen euro, and you will absolutely order it again. Heal 500 LP.', fx:'heal'},
  {id:'gozoferry', n:'The Gozo Ferry Queue',   e:'⛴️', f:'bahar', r:'komuni', t:'monster', lvl:4, atk:900,  def:2000,
   txt:'Three hours in the sun to make a twenty-five minute crossing. Nobody turns back. Nobody ever has.', fx:''},
  {id:'bahri',     n:'Retired Sea Captain',    e:'🧭', f:'bahar', r:'rari',   t:'monster', lvl:4, atk:1600, def:1600,
   txt:'Every story ends in a storm that the records say never happened. Summon: return a monster from your graveyard to your hand.', fx:'revive'},
  {id:'dghajsa',   n:'Sunday Boat Party',      e:'🛥️', f:'bahar', r:'rari',   t:'monster', lvl:4, atk:1800, def:1000,
   txt:'Everyone is half naked, the music is illegal, and nobody on board can actually swim. Attacks twice.', fx:'double'},
  {id:'blue',      n:'The Blue Grotto Boatman',e:'🚤', f:'bahar', r:'epiku',  t:'monster', lvl:5, atk:2200, def:1800,
   txt:'Ten euro, twenty minutes, one photo you will never look at again. Summon: return a monster from your graveyard to your hand.', fx:'revive'},
  {id:'mewga',     n:'The Gregale',            e:'🌬️', f:'bahar', r:'epiku',  t:'monster', lvl:6, atk:2400, def:1900,
   txt:'Wind from the north-east. Your umbrella is now three beaches away and legally somebody else\'s. Attacks two monsters at once.', fx:'cleave'},
  {id:'sirena',    n:'THE SIREN OF THE LAGOON',e:'🧜', f:'bahar', r:'leggendarju', t:'monster', lvl:8, atk:2900, def:2600,
   txt:'Lures the boats in, keeps the coolers, returns the sunglasses out of pity. Damage she deals also heals you.', fx:'leech'},

  /* ══════════ TROUBLE 😈 — family, money and other people ══════════ */
  {id:'wattsapp',  n:'6am Voice Note',         e:'🎙️', f:'hazen', r:'komuni', t:'monster', lvl:1, atk:500,  def:1000,
   txt:'Eleven minutes long. Sent at six. Contains no information of any kind.', fx:''},
  {id:'kuntu',     n:'The Group Bill',         e:'🧮', f:'hazen', r:'komuni', t:'monster', lvl:2, atk:1000, def:900,
   txt:'Twelve people, one bill, and the man who had lobster wants to split it equally.', fx:''},
  {id:'ghajn',     n:'The Evil Eye',           e:'🧿', f:'hazen', r:'komuni', t:'monster', lvl:2, atk:800,  def:1300,
   txt:'Somebody looked at you funny in the square and now your car will not start.', fx:''},
  {id:'tieg',      n:'The 400-Guest Wedding',  e:'💒', f:'hazen', r:'komuni', t:'monster', lvl:3, atk:1300, def:1200,
   txt:'You have met eleven of them. You are seated with none of them. Dinner is at eleven.', fx:''},
  {id:'kugin',     n:'The Cousin With A Van',  e:'🚐', f:'hazen', r:'komuni', t:'monster', lvl:3, atk:1500, def:800,
   txt:'Moves your sofa, destroys your table, refuses payment, mentions it at every Christmas for nine years.', fx:''},
  {id:'kunjatu',   n:'The Father-In-Law',      e:'🪑', f:'hazen', r:'komuni', t:'monster', lvl:4, atk:1700, def:1500,
   txt:'Says nothing for four hours, then one sentence that ruins the rest of your week.', fx:''},
  {id:'gossip',    n:'The Village Group Chat', e:'📢', f:'hazen', r:'komuni', t:'monster', lvl:4, atk:1600, def:1200,
   txt:'Knew you split up before you did. Look at your opponent\'s hand.', fx:'peek'},
  {id:'debtor',    n:'"I\'ll Pay You Back"',   e:'💶', f:'hazen', r:'rari',   t:'monster', lvl:3, atk:1200, def:1200,
   txt:'That was 2019. He still waves at you like nothing happened. Summon: opponent loses 800 LP.', fx:'burn'},
  {id:'skiet',     n:'The Silent Treatment',   e:'🤐', f:'hazen', r:'rari',   t:'monster', lvl:4, atk:1400, def:1900,
   txt:'You do not know what you did. You will not be told. Enemy monsters cannot attack next turn.', fx:'stun'},
  {id:'spiter',    n:'The Neighbour\'s Extension',e:'🧱', f:'hazen', r:'epiku', t:'monster', lvl:6, atk:2500, def:2100,
   txt:'Built one metre into your garden while you were in Sicily for a weekend. Survives the first thing that hits it.', fx:'shield'},
  {id:'vat',       n:'THE VAT INSPECTOR',      e:'🧾', f:'hazen', r:'leggendarju', t:'monster', lvl:8, atk:2800, def:2400,
   txt:'Six years of receipts. Every single one. He has all afternoon. Attacks twice.', fx:'double'},

  /* ══════════ SPELLS ══════════ */
  {id:'kinnie',    n:'Kinnie And Something',   e:'🥤', f:null, r:'komuni', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: Draw a card. Bitter, orange, deeply confusing to foreigners, and somehow it works.', fx:'s_draw1'},
  {id:'sptar',     n:'Mater Dei Waiting Room', e:'🏥', f:null, r:'komuni', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: Draw a card. Six hours in. Triage wrote "non-urgent" and you are starting to disagree.', fx:'s_draw1'},
  {id:'pastizz',   n:'Pastizzi At 3am',        e:'🥟', f:null, r:'komuni', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: +700 ATK to one monster this turn. Ricotta or peas? Both. Obviously both.', fx:'s_buff'},
  {id:'bajtra',    n:'Bajtra Liqueur',         e:'🍶', f:null, r:'komuni', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: +700 ATK to one monster this turn. Made by nuns. Strips paint. One glass and you can sing.', fx:'s_buff'},
  {id:'ftira',     n:'Ftira Tal-Ħut',          e:'🥪', f:null, r:'komuni', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: Draw 2 cards. Tuna, capers, onions, and half a kilo of bread. Lunch is now a nap.', fx:'s_draw'},
  {id:'xita',      n:'First Rain Of September',e:'🌧️', f:null, r:'komuni', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: Draw 2 cards. Every road is a river and everybody drives like it has never rained before.', fx:'s_draw'},
  {id:'bonu',      n:'The Government Cheque',  e:'💷', f:null, r:'komuni', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: Draw a card. Arrives suspiciously close to an election. Spent suspiciously fast.', fx:'s_draw1'},
  {id:'siesta',    n:'The "Five Minute" Nap',  e:'😴', f:null, r:'rari', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: Heal 1500 LP. Three hours later you wake up angry, sweating and unsure what year it is.', fx:'s_heal'},
  {id:'pjazza',    n:'Ask In The Square',      e:'🗣️', f:null, r:'rari', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: Add one monster from your deck to your hand. Somebody always knows somebody.', fx:'s_search'},
  {id:'imnarja',   n:'Imnarja Night',          e:'🌙', f:null, r:'rari', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: All your monsters gain +400 ATK. Rabbit, wine, and a man rhyming insults at midnight.', fx:'s_buffall'},
  {id:'tapit',     n:'Swept Under The Carpet', e:'🧹', f:null, r:'epiku', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: Destroy one enemy monster. It never happened. There is no file. There was never a file.', fx:'s_destroy'},
  {id:'kuntatt',   n:'My Uncle Knows A Guy',   e:'☎️', f:null, r:'epiku', t:'spell', lvl:0, atk:0, def:0,
   txt:'SPELL: Take control of an enemy monster this turn. One phone call. No questions. No receipt.', fx:'s_steal'},

  /* ══════════ TRAPS ══════════ */
  {id:'warden',    n:'The Warden Was Watching',e:'🎟️', f:null, r:'komuni', t:'trap', lvl:0, atk:0, def:0,
   txt:'TRAP: Attacking monster loses 800 ATK. He was behind the van the entire time.', fx:'t_weaken'},
  {id:'qattus',    n:'Cat On The Bonnet',      e:'🐈', f:null, r:'komuni', t:'trap', lvl:0, atk:0, def:0,
   txt:'TRAP: Attacking monster loses 800 ATK. Paw prints across your new car and zero remorse.', fx:'t_weaken'},
  {id:'skuza',     n:'"Traffic On The Bypass"',e:'🚙', f:null, r:'komuni', t:'trap', lvl:0, atk:0, def:0,
   txt:'TRAP: Attacking monster loses 800 ATK. Nobody believes it. Everybody accepts it.', fx:'t_weaken'},
  {id:'dawl',      n:'Blue Lights In The Mirror',e:'🚨', f:null, r:'rari', t:'trap', lvl:0, atk:0, def:0,
   txt:'TRAP: Cancel one attack. Everyone in the car goes very quiet and puts the seatbelt on.', fx:'t_negate'},
  {id:'bolla',     n:'The Stamp Duty',         e:'🖋️', f:null, r:'rari', t:'trap', lvl:0, atk:0, def:0,
   txt:'TRAP: Opponent loses 1000 LP. Nobody warned you and nobody budgeted for it.', fx:'t_burn'},
  {id:'ncempel',   n:'"I\'ll Call You Back"',  e:'📵', f:null, r:'rari', t:'trap', lvl:0, atk:0, def:0,
   txt:'TRAP: Return the attacking monster to its owner\'s hand. He will not call you back.', fx:'t_bounce'},
  {id:'lift',      n:'The Lift Is Broken',     e:'🛗', f:null, r:'rari', t:'trap', lvl:0, atk:0, def:0,
   txt:'TRAP: Return the attacking monster to its owner\'s hand. Sixth floor. Good luck, sur.', fx:'t_bounce'},
  {id:'ommok',     n:'"Did Your Mother Not Teach You?"',e:'🫵', f:null, r:'epiku', t:'trap', lvl:0, atk:0, def:0,
   txt:'TRAP: Destroy the attacking monster instantly. Forty years old and suddenly nine inches tall.', fx:'t_destroy'},
];

/* ══════════ merge into the live pool ══════════ */
CARDS.push(...SET2);

/* ═══════════════ THE RING — five attributes, one circle ═══════════════
   FESTA 🎆 → CITY    🏰  (fireworks go straight over the bastion walls)
   CITY  🏰 → FARM    🐇  (paperwork beats livestock, every time)
   FARM  🐇 → SEA     🌊  (dry land always wins the argument with the sea)
   SEA   🌊 → TROUBLE 😈  (one swim and the whole mess feels smaller)
   TROUBLE 😈 → FESTA 🎆  (the hangover always beats the festa)
   +500 ATK when you attack the attribute you counter.                    */
Object.assign(COUNTERS, { razzett:'bahar', bahar:'hazen', hazen:'festa' });
/* base decks were labelled for the old 3-way triangle — realign the text */
STARTER_DECKS.festa.beats   = 'CITY';    STARTER_DECKS.festa.loses   = 'TROUBLE';
STARTER_DECKS.belt.beats    = 'FARM';    STARTER_DECKS.belt.loses    = 'FESTA';
STARTER_DECKS.razzett.beats = 'SEA';     STARTER_DECKS.razzett.loses = 'CITY';

/* ═══════════ TWO NEW 40-CARD DECKS ═══════════ */
const SET2_DECKS = {
  bahar: {
    name:'SEA', e:'🌊', c:'#2196F3',
    tag:'Tempo — swarm, swing twice, heal it all back on the way home',
    beats:'TROUBLE', loses:'FARM',
    list:{ lampuka:3, luzzu:3, klamari:3, qarnita:3, kurrent:2, rizzi:2, gozoferry:2,
           dghajsa:2, bahri:2, mewga:1, blue:1, sirena:1,
           kafe:2, kinnie:2, pastizz:2, xita:2, siesta:1, imnarja:1,
           dawl:2, ncempel:2, bolla:1 },
  },
  hazen: {
    name:'TROUBLE', e:'😈', c:'#37474F',
    tag:'Burn — chip the life total, ruin the mood, never let them settle',
    beats:'FESTA', loses:'SEA',
    list:{ kugin:3, hangover:2, kuntu:2, gar:2, gossip:2, debtor:2, kunjatu:2,
           skiet:2, karozzin:2, tieg:1, ghajn:1, boss:1, spiter:1, vat:1, nannaslip:1,
           kafe:2, kinnie:2, bonu:2, tapit:2, kuntatt:1,
           ommok:2, warden:2, bolla:1, mara:1 },
  },
};
Object.assign(STARTER_DECKS, SET2_DECKS);
