/* ═══════════════════════════════════════════════════════════════════
   KARTI — kiri.js
   IL-KIRI  ·  "the rent"
   THE BOARD, THE DECKS AND THE RULES ENGINE. No DOM in this file.

   WHAT THIS IS
     A property-trading board game set in Malta. You go round buying
     things nobody can afford, charging your friends rent for landing
     on them, and building floors on top of floors until somebody's
     mother stops speaking to somebody else's mother.

   WHAT THIS IS NOT
     It is NOT that game. It is not named after it, it does not use its
     board, its property names, its cards, its tokens or its artwork.
     Thirty-two squares, six colour groups, floors and a penthouse
     instead of houses and hotels, a queue at a government counter
     instead of a jail, and every joke written here from scratch. The
     mechanics of buy-rent-build are as old as 1904 and belong to
     nobody; the identity is what is owned, so ours is our own.

   HOUSE RULES THIS FILE OBEYS
     · no DOM, no CSS, no localStorage writes except through save()/load()
     · its own storage key, karti_kiri_v1 — the card game's saves and the
       party hub's ledger are not ours to touch
     · every mutation goes through a function here, so js/kiri-ui.js can
       never put the table into a state the rules do not allow
     · the RNG state lives INSIDE the game object, so a saved game
       resumes with the same dice it was always going to roll

   FILES
     js/kiri.js      board + decks + engine   (this file)
     js/kiri-ai.js   the machine player and the autopilot
     js/kiri-ui.js   the screen, the CSS, and the wiring into the hub
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

/* loaded twice — a stale service worker, a duplicated <script> — is a
   real way to end up with two sets of listeners on one board. */
if (window.KIRI) return;


const SAVE_KEY = 'karti_kiri_v1';
const VERSION  = 1;

/* ═══════════════════════════════════════════════════════════════════
   1. DICE — deterministic, and the state lives in the save
   A saved game must resume with the same dice it was always going to
   roll, otherwise reloading is a re-roll and reloading becomes a
   strategy. mulberry32, with its 32-bit state carried on the game
   object itself.
   ═══════════════════════════════════════════════════════════════════ */
function rnd(G){
  let a = G.rng | 0;
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  G.rng = a;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const die = G => 1 + Math.floor(rnd(G) * 6);

function shuffle(G, arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(rnd(G) * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* ═══════════════════════════════════════════════════════════════════
   2. THE COLOUR GROUPS
   Six of them, cheapest to worst-value-for-money, which in Malta is
   not the same axis. `build` is what one floor costs on any property
   in the group.
   ═══════════════════════════════════════════════════════════════════ */
const GROUPS = {
  marsa:  { n:'Marsa',          c:'#9a6b3e', build:50,  props:[1,3] },
  hamrun: { n:'Il-Ħamrun',      c:'#7d9c3a', build:50,  props:[6,7,9] },
  birgu:  { n:'Il-Birgu',       c:'#c8452f', build:100, props:[11,12,14] },
  swieqi: { n:'Is-Swieqi',      c:'#e8952f', build:100, props:[17,19,20] },
  sliema: { n:'Tas-Sliema',     c:'#2fa8c8', build:150, props:[22,25,26] },
  belt:   { n:'Il-Belt',        c:'#8A5CFF', build:200, props:[28,31] },
};

/* the build ladder — nobody here has ever heard of a "hotel" */
const LADDER = [
  { n:'Empty',      mt:'Vojt',        short:'—' },
  { n:'One floor',  mt:'Sular',       short:'1' },
  { n:'Two floors', mt:'Żewġ sulari', short:'2' },
  { n:'Three floors', mt:'Tliet sulari', short:'3' },
  { n:'Four floors',  mt:'Erba\' sulari', short:'4' },
  { n:'Penthouse',  mt:'Il-Penthouse', short:'P' },
];

/* the bank's supply. Money it has an infinite amount of — it is the
   bank, and a bank that runs out of money is a bank that ends the
   game by accident. What it does run out of is CONCRETE, which is
   both the real constraint on the island and the one that makes
   buying up every floor early an actual strategy. */
const SUPPLY = { floors: 24, penthouses: 8 };

/* ═══════════════════════════════════════════════════════════════════
   3. THE BOARD — 32 squares
     0  corner  IL-BIDU        pass and collect
     8  corner  IL-KJU         the queue (and just-passing-through)
     16 corner  IL-PJAZZA      sit down, nothing happens
     24 corner  MARSA JUNCTION straight to the queue
   Between them: 16 properties in 6 groups, 4 transport, 2 services,
   4 card squares, 2 taxes.

   rent[] is [base, 1 floor, 2, 3, 4, penthouse]. Landing on an
   unbuilt property whose whole group is owned by one person and none
   of it mortgaged pays DOUBLE the base — that is the whole reason
   anybody ever trades.
   ═══════════════════════════════════════════════════════════════════ */
const BOARD = [
  { i:0, t:'go', code:'BID', id:'bidu', e:'🏁', n:'Il-Bidu', mt:'The Start',
    joke:'Everybody starts here with fifteen hundred euro and the firm belief that this time they will not overspend in the first ten minutes.' },

  { i:1, t:'prop', code:'GRX', id:'garaxx', e:'🔧', g:'marsa', n:'The Marsa Garage', mt:'Il-Garaxx ta\' Marsa',
    price:60, rent:[2,12,36,110,180,260],
    joke:'Advertised as a workshop. Contains a fridge, a sofa, a drum kit and eleven years of somebody\'s marriage.' },

  { i:2, t:'card', code:'?', deck:'ghajdut', e:'👀', n:'Għajdut', mt:'Gossip',
    joke:'Somebody has heard something about you and they are telling it to somebody else right now.' },

  { i:3, t:'prop', code:'MŻN', id:'mahzen', e:'🛞', g:'marsa', n:'The Scrap Yard Shed', mt:'Il-Maħżen tal-Ħadid',
    price:70, rent:[4,20,60,180,260,340],
    joke:'Six tonnes of metal, one dog with opinions, and a man who can tell you the price of copper to the cent.' },

  { i:4, t:'tax', code:'€', id:'taxxa', e:'🧾', n:'The Tax', mt:'It-Taxxa', amount:200,
    joke:'Your accountant says it is complicated. It is not complicated. It is two hundred euro.' },

  { i:5, t:'rail', code:'VAP', id:'vapur', e:'⛴️', n:'The Gozo Ferry', mt:'Il-Vapur ta\' Għawdex', price:200,
    joke:'Forty-five minutes each way and a queue at Ċirkewwa that has its own weather system.' },

  { i:6, t:'prop', code:'ĦNT', id:'hanut', e:'🏪', g:'hamrun', n:'The Shop That Is Always Closing Down', mt:'Il-Ħanut Li Ilu Jagħlaq',
    price:110, rent:[7,35,100,300,420,560],
    joke:'CLOSING DOWN SALE since 2016. Still has stock. Still closing. The owner has aged; the sign has not.' },

  { i:7, t:'prop', code:'FRN', id:'furnar', e:'🥖', g:'hamrun', n:'The Flat Above The Bakery', mt:'Il-Flat Fuq Il-Furnar',
    price:120, rent:[8,40,110,330,450,600],
    joke:'Warm all year round and smells incredible until four in the morning, at which point it smells incredible and you are awake.' },

  { i:8, t:'jail', code:'KJU', id:'kju', e:'🎫', n:'Il-Kju', mt:'The Queue',
    joke:'Counter four. Ticket B-207. They are currently serving B-181. You have been here since a previous version of yourself.' },

  { i:9, t:'prop', code:'UMD', id:'umdita', e:'💦', g:'hamrun', n:'The House With The Damp', mt:'Id-Dar Bl-Umdità',
    price:130, rent:[9,45,120,360,490,640],
    joke:'The surveyor called it "rising". The owner calls it "character". The wardrobe calls it home.' },

  { i:10, t:'util', code:'BWS', id:'bowser', e:'🚚', n:'The Water Bowser', mt:'Il-Bowser tal-Ilma', price:150,
    joke:'He comes when he comes. He does not do appointments, and he certainly does not do Tuesdays.' },

  { i:11, t:'prop', code:'BIR', id:'bir', e:'🪣', g:'birgu', n:'The Well In The Kitchen', mt:'Il-Bir Fil-Kċina',
    price:150, rent:[11,55,160,450,625,780],
    joke:'Four hundred years old, twelve metres deep, and directly under where you would quite like the dishwasher.' },

  { i:12, t:'prop', code:'KRT', id:'karattru', e:'🚪', g:'birgu', n:'The House Of Character', mt:'Id-Dar Tal-Karattru',
    price:160, rent:[12,60,180,500,700,850],
    joke:'Every beam original, every door crooked, every ceiling exactly four centimetres lower than your head.' },

  { i:13, t:'rail', code:'TRM', id:'terminus', e:'🚌', n:'The Valletta Terminus', mt:'It-Terminus tal-Belt', price:200,
    joke:'Every bus on the island leaves from here, and the one you need left ninety seconds before you arrived.' },

  { i:14, t:'prop', code:'STL', id:'stalla', e:'🐎', g:'birgu', n:'The Converted Stable', mt:'L-Istalla Kkonvertita',
    price:170, rent:[13,65,190,530,730,900],
    joke:'A beautiful conversion. The horse would still find it about right, and so will your guests.' },

  { i:15, t:'card', code:'!', deck:'gvern', e:'🏛️', n:'Tal-Gvern', mt:'The Government',
    joke:'A brown envelope with a window in it, and whatever is inside is now your problem.' },

  { i:16, t:'rest', code:'PJZ', id:'pjazza', e:'☕', n:'Il-Pjazza', mt:'The Square',
    joke:'Nothing happens here and nothing is charged. Sit down, have a coffee, and listen to four men solve the country.' },

  { i:17, t:'prop', code:'BLK', id:'blokk', e:'🏗️', g:'swieqi', n:'The Block With No Permit', mt:'Il-Blokk Bla Permess',
    price:200, rent:[16,80,220,600,800,1000],
    joke:'Six floors up and the paperwork says "boundary wall". Everyone has noticed. Nobody has written it down.' },

  { i:18, t:'card', code:'?', deck:'ghajdut', e:'👀', n:'Għajdut', mt:'Gossip',
    joke:'She did not say it to be nasty. She said it because it was TRUE, and because you were not there.' },

  { i:19, t:'prop', code:'MSN', id:'maisonette', e:'🏠', g:'swieqi', n:'Your Mate\'s Maisonette', mt:'Il-Maisonette Tal-Ħabib',
    price:210, rent:[17,85,240,640,850,1050],
    joke:'He will do you a price. The price is the market price. He will still want to be thanked for it.' },

  { i:20, t:'prop', code:'PNT', id:'penthouse', e:'🌅', g:'swieqi', n:'Penthouse, Sea Views', mt:'Penthouse Bit-Tikka Baħar',
    price:230, rent:[19,95,260,700,900,1100],
    joke:'The sea view is real. It is nine centimetres wide, it is between two other blocks, and it is going in April.' },

  { i:21, t:'rail', code:'KRZ', id:'karozzin', e:'🐴', n:'The Karozzin', mt:'Il-Karozzin', price:200,
    joke:'Forty euro to be pulled slowly past things you could have walked to, by a man who has done this since before you were born.' },

  { i:22, t:'prop', code:'FRT', id:'front', e:'🌊', g:'sliema', n:'The Seafront Flat', mt:'Il-Flat Tal-Front',
    price:280, rent:[24,120,350,850,1050,1250],
    joke:'Nobody who lives on this island can afford it, and every single one of them can tell you exactly what it went for.' },

  { i:23, t:'util', code:'ĠEN', id:'generatur', e:'🔌', n:'The Generator', mt:'Il-Ġeneratur', price:150,
    joke:'Comes on eleven seconds after the power cuts, which is exactly ten seconds after everyone has started shouting.' },

  { i:24, t:'togo', code:'MRS', id:'junction', e:'🚦', n:'Marsa Junction', mt:'Il-Marsa', to:8,
    joke:'You have been in this lane for twenty minutes. It is the wrong lane. It has always been the wrong lane.' },

  { i:25, t:'prop', code:'TOR', id:'torri', e:'🏢', g:'sliema', n:'The Tower By The Water', mt:'It-Torri Ħdejn Il-Baħar',
    price:300, rent:[26,130,390,900,1100,1300],
    joke:'Twenty-two floors of glass where a cinema used to be. Eleven people live in it. Four of them exist.' },

  { i:26, t:'prop', code:'VST', id:'vista', e:'🪟', g:'sliema', n:'Two Rooms With A View', mt:'Żewġ Kmamar Bil-Vista',
    price:320, rent:[28,140,420,950,1150,1400],
    joke:'The view is magnificent and the rooms are two. You will be showing people the view for the rest of your life.' },

  { i:27, t:'card', code:'!', deck:'gvern', e:'🏛️', n:'Tal-Gvern', mt:'The Government',
    joke:'Reference number, department, sub-department, and a form that exists only on the third floor.' },

  { i:28, t:'prop', code:'PLZ', id:'palazz', e:'🏛️', g:'belt', n:'The Valletta Palazzo', mt:'Il-Palazz Tal-Belt',
    price:380, rent:[40,190,550,1200,1450,1700],
    joke:'Grade one scheduled, which means you may look at it, love it, pay for it, and change absolutely nothing about it.' },

  { i:29, t:'rail', code:'TXI', id:'taxi', e:'🚕', n:'The Airport Taxi', mt:'It-Taxi Tal-Ajruport', price:200,
    joke:'The fare is fixed. It has been fixed at a different number every single time you have used it.' },

  { i:30, t:'tax', code:'ĊNS', id:'cens', e:'📜', n:'Iċ-Ċens', mt:'The Ground Rent', amount:75, perBuilding:25,
    joke:'Set in 1912 by a man who is extremely dead, and it will outlive you, your children, and the building itself.' },

  { i:31, t:'prop', code:'MDN', id:'imdina', e:'🕯️', g:'belt', n:'The Mdina House', mt:'Id-Dar Tal-Imdina',
    price:420, rent:[55,220,620,1400,1700,2100],
    joke:'Nine bedrooms behind the silent city walls, and nobody has slept in it since 1987. It is being kept. For what, nobody says.' },
];

const RAILS = BOARD.filter(s => s.t === 'rail').map(s => s.i);
const UTILS = BOARD.filter(s => s.t === 'util').map(s => s.i);
const SALARY = 200;
const START_CASH = 1500;
const JAIL = 8;
const BAIL = 50;
const RAIL_RENT = [0, 25, 50, 100, 200];   /* by how many of the four you hold */

/* ═══════════════════════════════════════════════════════════════════
   4. THE DECKS
   Two of them, because Malta has exactly two sources of unexpected
   news: what the neighbours are saying, and what the government has
   decided.

   Every card is one object with an `a` (action) the engine executes:
     pay n            · lose n to the bank
     get n            · take n from the bank
     payEach n        · give n to every other player still in
     getEach n        · take n from every other player still in
     move to          · go to square `to`, collecting salary if passed
     back to          · go to square `to`, NEVER collecting
     step n           · move n squares forward (or back if negative)
     jail             · straight to the queue, no salary
     skip             · keep a Skip The Queue card
     repairs h,p      · pay per floor and per penthouse you own
     nearest rail|util· advance to the next one, pay double if owned
   ═══════════════════════════════════════════════════════════════════ */
const DECKS = {
  ghajdut: {
    n:'Għajdut', mt:'Gossip', e:'👀', c:'#E8452C',
    cards: [
      { id:'gh01', n:'The Whole Street Knows',
        txt:'You told one person, in confidence, in a whisper. It reached Gozo before you got home.',
        a:{ k:'payEach', n:50 } },
      { id:'gh02', n:'Nanna Saw You',
        txt:'She has not left that balcony since 1988. She saw where you parked and she has told your mother.',
        a:{ k:'back', to:8 } },
      { id:'gh03', n:'The Neighbour\'s Extension',
        txt:'It is over your boundary by forty centimetres. He knows. He has offered you money to stop knowing.',
        a:{ k:'get', n:200 } },
      { id:'gh04', n:'Your Mother-In-Law Is Coming',
        txt:'For a week. She has brought her own pillow, her own kettle and her own opinion about your kitchen.',
        a:{ k:'pay', n:150 } },
      { id:'gh05', n:'Somebody Left The Group Chat',
        txt:'Nobody knows why. Everybody knows why. Three separate group chats have now been created about it.',
        a:{ k:'getEach', n:50 } },
      { id:'gh06', n:'The Wedding Invitation',
        txt:'Four hundred guests, one of whom is you, and the envelope on the table is not going to fill itself.',
        a:{ k:'pay', n:200 } },
      { id:'gh07', n:'A Word With The Right Person',
        txt:'Not a bribe. Never a bribe. A coffee, a nephew, and a file that moves to the top of a pile.',
        a:{ k:'skip' } },
      { id:'gh08', n:'The Festa Collection',
        txt:'Two men at the door with a book, a pen, and the full weight of the parish behind them.',
        a:{ k:'pay', n:100 } },
      { id:'gh09', n:'Sunday Lunch At Your Aunt\'s',
        txt:'Five courses, four hours, and a sixty-euro note pushed into your pocket at the door "for the petrol".',
        a:{ k:'get', n:60 } },
      { id:'gh10', n:'The Tal-Linja Card',
        txt:'You found it in a coat. It has been topped up since 2019 and you have been paying cash all this time.',
        a:{ k:'get', n:40 } },
      { id:'gh11', n:'Wrong Lane At Marsa',
        txt:'You committed. You are still committing. You will be committing for some time.',
        a:{ k:'jail' } },
      { id:'gh12', n:'The Village Feast Is On',
        txt:'The road is shut, the band is out, and the only way home is the long way round the whole island.',
        a:{ k:'move', to:0 } },
      { id:'gh13', n:'He Sold It To His Cousin',
        txt:'You had shaken on it. His cousin shook on it harder, and earlier, and with more cash.',
        a:{ k:'pay', n:120 } },
      { id:'gh14', n:'Everyone Is Building',
        txt:'Two on your left, one behind, and a crane arriving Thursday. Somebody has to pay for the dust.',
        a:{ k:'repairs', h:25, p:100 } },
      { id:'gh15', n:'The Pastizzi Run',
        txt:'You were asked to bring six. You brought twenty-four. You are, briefly, the most important person alive.',
        a:{ k:'get', n:80 } },
      { id:'gh16', n:'The Boat Party Nobody Invited You To',
        txt:'It is on everybody\'s story. It is anchored where you can see it. Go and have a look, for your own good.',
        a:{ k:'nearest', what:'rail' } },
      { id:'gh17', n:'They Are Talking About Your Windows',
        txt:'Aluminium. In an area of urban conservation. There is a photograph, and there is a WhatsApp group.',
        a:{ k:'pay', n:90 } },
      { id:'gh18', n:'A Tip About The Seafront',
        txt:'A man who knows a man says a thing is going up. It never does, but the walk down there is free.',
        a:{ k:'move', to:22 } },
    ]
  },

  gvern: {
    n:'Tal-Gvern', mt:'The Government', e:'🏛️', c:'#3DDC84',
    cards: [
      { id:'gv01', n:'The Permit Came Through',
        txt:'Applied for in March. Approved in a March. Not necessarily the same March, but it is here.',
        a:{ k:'get', n:250 } },
      { id:'gv02', n:'Enforcement Notice',
        txt:'Somebody reported the thing that everybody has, and the letter arrived only at your address.',
        a:{ k:'pay', n:180 } },
      { id:'gv03', n:'The Refund Nobody Expected',
        txt:'A department you have never heard of has been holding money of yours since a year you cannot verify.',
        a:{ k:'get', n:120 } },
      { id:'gv04', n:'Counter Four Is Closed',
        txt:'It is eleven fifteen. Counter four is at coffee. Counter four will be at coffee for the foreseeable.',
        a:{ k:'back', to:8 } },
      { id:'gv05', n:'Skip The Queue',
        txt:'Your cousin works there. Not in that department. In the building. It turns out that is enough.',
        a:{ k:'skip' } },
      { id:'gv06', n:'VAT Inspection',
        txt:'Two of them, no appointment, and a very calm interest in a receipt book from four summers ago.',
        a:{ k:'pay', n:220 } },
      { id:'gv07', n:'The Road Is Being Resurfaced',
        txt:'The same road. The fourth time. Somebody is having a wonderful decade and it is not you.',
        a:{ k:'repairs', h:40, p:120 } },
      { id:'gv08', n:'Scheme For First-Time Buyers',
        txt:'You are not a first-time buyer. Your paperwork, which you have not read, disagrees, and it wins.',
        a:{ k:'get', n:200 } },
      { id:'gv09', n:'Straight To The Queue',
        txt:'A form was wrong in 2014. It has taken this long to catch up with you and it is very much still valid.',
        a:{ k:'jail' } },
      { id:'gv10', n:'The Water Bill Is Estimated',
        txt:'Estimated by whom, on what basis, and using what number, nobody at the counter is able to say.',
        a:{ k:'pay', n:110 } },
      { id:'gv11', n:'Election Sweetener',
        txt:'A cheque, unasked for, in the spring, from a government that has suddenly become very warm towards you.',
        a:{ k:'get', n:150 } },
      { id:'gv12', n:'Pass The Start And Collect',
        txt:'The financial year has turned. Go round, sign nothing, and take what you are owed on the way past.',
        a:{ k:'move', to:0 } },
      { id:'gv13', n:'The Ferry Is Free Today',
        txt:'Somebody has cut a ribbon somewhere. Go and use it before whoever authorised it changes their mind.',
        a:{ k:'nearest', what:'rail' } },
      { id:'gv14', n:'Meter Reading',
        txt:'A man is at the door in a high-visibility jacket and he needs to see under the stairs. Now.',
        a:{ k:'nearest', what:'util' } },
      { id:'gv15', n:'School Transport Grant',
        txt:'Sixty euro per child, paid annually, into an account you closed. It has finally found you.',
        a:{ k:'get', n:60 } },
      { id:'gv16', n:'Planning Objection Upheld',
        txt:'Twenty-two objectors, one retired architect, and a drawing of a shadow. The shadow won.',
        a:{ k:'pay', n:140 } },
      { id:'gv17', n:'The Rent Register',
        txt:'Everybody has to be on it now. Everybody. There is a fee for being on it, obviously.',
        a:{ k:'payEach', n:40 } },
      { id:'gv18', n:'Compensation For The Works',
        txt:'Eighteen months of drilling and a cheque that would just about cover the earplugs.',
        a:{ k:'getEach', n:40 } },
    ]
  }
};

/* ═══════════════════════════════════════════════════════════════════
   5. PLAYER COLOURS AND TOKENS
   ═══════════════════════════════════════════════════════════════════ */
const SEATS = [
  { c:'#FFC542', e:'🔑', n:'Il-Muftieħ',  en:'The Key',        code:'MU' },
  { c:'#3DDC84', e:'🛵', n:'Il-Mutur',    en:'The Scooter',    code:'MT' },
  { c:'#FF5468', e:'🧱', n:'Il-Ġebla',    en:'The Brick',      code:'ĠB' },
  { c:'#4FC3F7', e:'🐐', n:'Il-Mogħża',   en:'The Goat',       code:'MG' },
  { c:'#FF9F45', e:'🛥️', n:'Il-Luzzu',    en:'The Luzzu',      code:'LZ' },
  { c:'#C77DFF', e:'🥟', n:'Il-Pastizz',  en:'The Pastizz',    code:'PS' },
  { c:'#F4EFFF', e:'🚩', n:'Il-Bandiera', en:'The Banner',     code:'BN' },
  { c:'#7BE0D6', e:'🌵', n:'Il-Bajtra',   en:'The Prickly Pear', code:'BJ' },
];

/* THE BIGGEST TABLE THIS GAME CAN ACTUALLY DEAL.
   Eight, and it is the TOKENS that decide it, not the rules. A player
   is identified on a 44-point board square by a 9-point coloured dot,
   and eight is as many colours as stay honestly distinguishable at
   that size — a ninth would be a shade of one of the first eight and
   somebody would move the wrong piece.

   Everything else scales further than that. The bank's concrete (24
   floors, 8 penthouses) is shared, not per player. The money supply is
   the bank's and the bank does not run out. What DOES change with a
   big table is that sixteen properties spread thinner — two each at
   eight seats — so nobody completes a colour group by landing on it
   and every set has to be TRADED for. That is the game getting more
   interesting, not less, and it is measured rather than assumed:
   see the seat-count run reported with this build. */
const MAX_SEATS = SEATS.length;
const MIN_SEATS = 2;

/* ═══════════════════════════════════════════════════════════════════
   6. NEW GAME
   ═══════════════════════════════════════════════════════════════════ */
function newGame(opts){
  opts = opts || {};
  const seats = opts.players || [
    { name:'You',   kind:'human' },
    { name:'Doris', kind:'cpu', level:2 },
  ];
  const G = {
    v: VERSION,
    rng: (opts.seed != null ? (opts.seed | 0) : (Math.random() * 2147483647) | 0),
    started: Date.now(),
    round: 1,
    roundLimit: (opts.roundLimit == null ? 30 : opts.roundLimit),   /* 0 = last one standing */
    turn: 0,
    phase: 'awaitRoll',
    dice: null,
    doubles: 0,
    moved: false,          /* has the current seat already moved this turn */
    players: seats.slice(0, MAX_SEATS).map((p, i) => ({
      i,
      name: String(p.name || SEATS[i].en).slice(0, 14),
      kind: p.kind === 'cpu' ? 'cpu' : 'human',
      level: p.level == null ? 2 : p.level,
      link: p.link || 'local',        /* 'local' | 'remote' — who owns the seat */
      present: true,                  /* is the person actually here */
      auto: false,                    /* is the phone playing this seat right now */
      autoWhy: '',
      cash: START_CASH,
      pos: 0,
      jail: 0,                        /* turns spent in the queue, 0 = not in it */
      skips: 0,                       /* Skip The Queue cards held */
      out: false,
      colour: SEATS[i].c,
      token: SEATS[i].e,
      tokenName: SEATS[i].n,
    })),
    own:  BOARD.map(() => -1),
    lvl:  BOARD.map(() => 0),
    mort: BOARD.map(() => false),
    supply: { floors: SUPPLY.floors, penthouses: SUPPLY.penthouses },
    deck: {},
    debt: null,          /* {who, amt, to} — to: -1 bank, n player, or {split:[{p,amt}]} */
    auction: null,
    card: null,          /* the card currently face up */
    offer: null,         /* a trade on the table */
    /* ONE OFFER PER SEAT PER TURN, AND NO MEANS NO.
       Without both of these a machine seat that wants your Sliema flat
       re-proposes the identical deal the instant you decline it, and
       the table locks up in a yes/no loop nobody can leave. tradeTries
       caps it inside a turn; `refused` remembers a rejected deal for
       the rest of the game, because a person who said no once said no. */
    tradeTries: 0,
    refused: [],
    log: [],
    over: null,          /* {winner, why} */
    stat: { rolls:0, rents:0, trades:0, builds:0, bankrupt:0 },
  };
  for (const k of Object.keys(DECKS)){
    G.deck[k] = { order: shuffle(G, DECKS[k].cards.map(c => c.id)), at: 0 };
  }
  say(G, 'Fifteen hundred each. Nobody has fallen out yet.');
  return G;
}

/* ═══════════════════════════════════════════════════════════════════
   7. LOOKUPS
   ═══════════════════════════════════════════════════════════════════ */
const sq   = i => BOARD[((i % 32) + 32) % 32];
const cur  = G => G.players[G.turn];
const alive = G => G.players.filter(p => !p.out);
const isProp = i => BOARD[i] && (BOARD[i].t === 'prop' || BOARD[i].t === 'rail' || BOARD[i].t === 'util');

function groupOf(i){ const s = BOARD[i]; return s && s.g ? GROUPS[s.g] : null; }

/* every square in the same "set" — colour group, all four transports,
   or both services */
function setOf(i){
  const s = BOARD[i];
  if (!s) return [];
  if (s.t === 'prop') return GROUPS[s.g].props;
  if (s.t === 'rail') return RAILS;
  if (s.t === 'util') return UTILS;
  return [];
}

function ownsSet(G, p, i){
  const set = setOf(i);
  return set.length > 0 && set.every(x => G.own[x] === p);
}

/* a full colour group, none of it mortgaged — the licence to build */
function canDevelop(G, p, i){
  const s = BOARD[i];
  if (!s || s.t !== 'prop') return false;
  return ownsSet(G, p, i) && GROUPS[s.g].props.every(x => !G.mort[x]);
}

function countIn(G, p, list){ return list.filter(x => G.own[x] === p).length; }

/* ── THE RENT TABLE ───────────────────────────────────────────────
   The single most important function in the game.
     · mortgaged           → nothing
     · property with floors→ rent[level]
     · property, no floors → base, DOUBLED if one person holds the set
     · transport           → 25 / 50 / 100 / 200 by how many held
     · service             → 4× the dice, or 10× if both are held      */
function rentOf(G, i, diceTotal){
  const s = BOARD[i];
  const o = G.own[i];
  if (o < 0 || G.mort[i]) return 0;
  if (s.t === 'prop'){
    const lvl = G.lvl[i];
    if (lvl > 0) return s.rent[lvl];
    /* the full-set double. A deed you have mortgaged is not a deed you
       are holding, so one mortgage anywhere in the group and the double
       is gone — same test as the licence to build, which keeps the two
       rules explainable as one sentence at the table. */
    return canDevelop(G, o, i) ? s.rent[0] * 2 : s.rent[0];
  }
  if (s.t === 'rail'){
    const held = RAILS.filter(x => G.own[x] === o && !G.mort[x]).length;
    return RAIL_RENT[held] || 0;
  }
  if (s.t === 'util'){
    const held = UTILS.filter(x => G.own[x] === o && !G.mort[x]).length;
    const mult = held >= 2 ? 10 : 4;
    return mult * (diceTotal || (G.dice ? G.dice[0] + G.dice[1] : 7));
  }
  return 0;
}

const mortgageValue = i => Math.floor(BOARD[i].price / 2);
/* 10% to the bank for the privilege of getting it back, rounded up */
const unmortgageCost = i => Math.ceil(mortgageValue(i) * 1.1);

function buildingsOf(G, p){
  let floors = 0, pent = 0;
  for (let i = 0; i < 32; i++){
    if (G.own[i] !== p) continue;
    if (G.lvl[i] === 5) pent++;
    else floors += G.lvl[i];
  }
  return { floors, pent };
}

function netWorth(G, p){
  let n = G.players[p].cash;
  for (let i = 0; i < 32; i++){
    if (G.own[i] !== p) continue;
    n += G.mort[i] ? mortgageValue(i) : BOARD[i].price;
    if (BOARD[i].t === 'prop' && G.lvl[i] > 0){
      const b = GROUPS[BOARD[i].g].build;
      n += (G.lvl[i] === 5 ? 5 : G.lvl[i]) * b;
    }
  }
  return n;
}

function holdings(G, p){
  const out = [];
  for (let i = 0; i < 32; i++) if (G.own[i] === p) out.push(i);
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   8. THE LOG — short, in the voice, and capped
   ═══════════════════════════════════════════════════════════════════ */
function say(G, text, tone){
  G.log.push({ t: text, k: tone || '', r: G.round });
  if (G.log.length > 220) G.log.splice(0, G.log.length - 220);
}

/* ═══════════════════════════════════════════════════════════════════
   9. MONEY
   pay() is the only way money ever leaves a player. If they cannot
   cover it, the game stops dead in phase 'debt' until they have sold,
   mortgaged or given up — exactly like the real thing, where the table
   waits while somebody counts their money twice.
   ═══════════════════════════════════════════════════════════════════ */
function credit(G, p, n){ if (n > 0) G.players[p].cash += n; }

function pay(G, from, amt, to){
  amt = Math.max(0, Math.round(amt));
  if (amt === 0) return true;
  const P = G.players[from];
  if (P.cash >= amt){
    P.cash -= amt;
    if (to >= 0) credit(G, to, amt);
    return true;
  }
  G.debt = { who: from, amt, to: (to == null ? -1 : to) };
  G.phase = 'debt';
  return false;
}

/* pay several people at once — the "everyone at the table" cards */
function payMany(G, from, list){
  const total = list.reduce((n, x) => n + x.amt, 0);
  if (total <= 0) return true;
  const P = G.players[from];
  if (P.cash >= total){
    P.cash -= total;
    list.forEach(x => credit(G, x.p, x.amt));
    return true;
  }
  G.debt = { who: from, amt: total, to: -1, split: list };
  G.phase = 'debt';
  return false;
}

/* the debt is settled the moment the money is there */
function settle(G){
  const d = G.debt;
  if (!d) return true;
  const P = G.players[d.who];
  if (P.cash < d.amt) return false;
  P.cash -= d.amt;
  if (d.split) d.split.forEach(x => credit(G, x.p, x.amt));
  else if (d.to >= 0) credit(G, d.to, d.amt);
  G.debt = null;
  G.phase = G.moved ? 'awaitEnd' : 'awaitRoll';
  return true;
}

/* ═══════════════════════════════════════════════════════════════════
   10. THE TURN
   ═══════════════════════════════════════════════════════════════════ */
function canRoll(G){
  return !G.over && G.phase === 'awaitRoll' && !cur(G).out;
}

function roll(G, forced){
  if (!canRoll(G)) return null;
  const P = cur(G);
  const d = forced || [die(G), die(G)];
  G.dice = d;
  G.stat.rolls++;
  const dbl = d[0] === d[1];

  /* in the queue: doubles get you out, three failures and you pay */
  if (P.jail > 0){
    if (dbl){
      P.jail = 0;
      say(G, P.name + ' rolled a double and is finally past counter four.', 'good');
      G.doubles = 0;                       /* out of the queue is not a free extra go */
      advance(G, d[0] + d[1]);
      return d;
    }
    P.jail++;
    if (P.jail > 3){
      say(G, P.name + ' gave up and paid the fifty for the express service.', '');
      if (!pay(G, P.i, BAIL, -1)){ G.pendJail = d[0] + d[1]; return d; }
      P.jail = 0;
      advance(G, d[0] + d[1]);
      return d;
    }
    say(G, P.name + ' is still at the counter. Ticket has not moved.', 'bad');
    G.phase = 'awaitEnd';
    G.moved = true;
    return d;
  }

  if (dbl){
    G.doubles++;
    if (G.doubles >= 3){
      say(G, P.name + ' rolled three doubles in a row. Nobody is that lucky honestly — straight to the queue.', 'bad');
      G.doubles = 0;
      toJail(G, P.i);
      return d;
    }
  } else {
    G.doubles = 0;
  }
  advance(G, d[0] + d[1]);
  return d;
}

/* move forward n squares, taking the salary on the way past the start */
function advance(G, n){
  const P = cur(G);
  const from = P.pos;
  P.pos = (from + n) % 32;
  if (P.pos < from || n >= 32){
    credit(G, P.i, SALARY);
    say(G, P.name + ' passed Il-Bidu. Two hundred, and not a word about where it comes from.', 'good');
  }
  G.moved = true;
  land(G);
}

/* jump to a square. `salary` false = the ones that drag you backwards */
function goTo(G, p, to, salary){
  const P = G.players[p];
  const from = P.pos;
  P.pos = to;
  if (salary !== false && to < from) credit(G, p, SALARY);
  G.moved = true;
}

function toJail(G, p){
  const P = G.players[p];
  P.pos = JAIL;
  P.jail = 1;
  G.doubles = 0;
  G.moved = true;
  G.phase = 'awaitEnd';
  say(G, P.name + ' is in the queue. Ticket B-207.', 'bad');
}

/* ── LANDING ──────────────────────────────────────────────────────── */
function land(G){
  const P = cur(G);
  const s = sq(P.pos);
  const total = G.dice ? G.dice[0] + G.dice[1] : 7;

  if (s.t === 'go' || s.t === 'rest' || s.t === 'jail'){
    if (s.t === 'jail') say(G, P.name + ' is at the queue, but only to ask a question. Free to leave.');
    else say(G, P.name + ' landed on ' + s.n + '. ' + (s.t === 'rest' ? 'Nothing to pay, nothing to do.' : ''));
    G.phase = 'awaitEnd';
    return;
  }
  if (s.t === 'togo'){ toJail(G, P.i); return; }

  if (s.t === 'tax'){
    const b = buildingsOf(G, P.i);
    const extra = s.perBuilding ? (b.floors + b.pent * 5) * s.perBuilding : 0;
    const amt = s.amount + extra;
    say(G, P.name + ' owes ' + money(amt) + ' — ' + s.n + '.' + (extra ? ' The floors are not free.' : ''), 'bad');
    if (pay(G, P.i, amt, -1)) G.phase = 'awaitEnd';
    return;
  }

  if (s.t === 'card'){ drawCard(G, s.deck); return; }

  /* property, transport or service */
  const o = G.own[P.pos];
  if (o < 0){
    G.phase = 'awaitBuy';
    return;
  }
  if (o === P.i){
    say(G, P.name + ' is standing on their own doorstep. Nothing changes hands.');
    G.phase = 'awaitEnd';
    return;
  }
  if (G.mort[P.pos]){
    say(G, s.n + ' is mortgaged. ' + G.players[o].name + ' cannot charge a cent on it.', 'good');
    G.phase = 'awaitEnd';
    return;
  }
  const r = rentOf(G, P.pos, total);
  G.stat.rents += r;
  say(G, P.name + ' pays ' + G.players[o].name + ' ' + money(r) + ' for ' + s.n + '.', 'bad');
  if (pay(G, P.i, r, o)) G.phase = 'awaitEnd';
}

/* ── the cards ────────────────────────────────────────────────────── */
function drawCard(G, deckKey){
  const D = G.deck[deckKey];
  if (D.at >= D.order.length){ D.order = shuffle(G, D.order); D.at = 0; }
  const id = D.order[D.at++];
  const card = DECKS[deckKey].cards.find(c => c.id === id);
  G.card = { deck: deckKey, id, n: card.n, txt: card.txt };
  G.phase = 'card';
  return card;
}

/* the UI shows the card, then calls this to make it happen */
function applyCard(G){
  if (!G.card) return;
  const deckKey = G.card.deck;
  const card = DECKS[deckKey].cards.find(c => c.id === G.card.id);
  G.card = null;
  const P = cur(G);
  const a = card.a;
  say(G, '“' + card.n + '” — ' + P.name + '.', 'card');

  const done = () => { if (G.phase === 'card' || G.phase === 'awaitRoll') G.phase = 'awaitEnd'; };

  switch (a.k){
    case 'get':   credit(G, P.i, a.n); say(G, P.name + ' takes ' + money(a.n) + '.', 'good'); done(); break;
    case 'pay':   if (pay(G, P.i, a.n, -1)) done(); break;
    case 'skip':  P.skips++; say(G, P.name + ' pockets a Skip The Queue.', 'good'); done(); break;
    case 'jail':  toJail(G, P.i); break;
    case 'move':  goTo(G, P.i, a.to, true);  land(G); break;
    case 'back':  goTo(G, P.i, a.to, false); if (a.to === JAIL){ P.jail = 1; say(G, P.name + ' is back in the queue.', 'bad'); G.phase = 'awaitEnd'; } else land(G); break;
    case 'step':  advance(G, a.n); break;
    case 'getEach': {
      let got = 0;
      alive(G).forEach(q => {
        if (q.i === P.i) return;
        const take = Math.min(q.cash, a.n);
        q.cash -= take; got += take;
      });
      credit(G, P.i, got);
      say(G, P.name + ' collects ' + money(got) + ' from the table.', 'good');
      done(); break;
    }
    case 'payEach': {
      const list = alive(G).filter(q => q.i !== P.i).map(q => ({ p: q.i, amt: a.n }));
      if (payMany(G, P.i, list)){ say(G, P.name + ' pays everyone ' + money(a.n) + '.', 'bad'); done(); }
      break;
    }
    case 'repairs': {
      const b = buildingsOf(G, P.i);
      const amt = b.floors * a.h + b.pent * a.p;
      if (amt === 0){ say(G, P.name + ' owns nothing to repair. Lucky, in a bleak sort of way.'); done(); break; }
      say(G, P.name + ' owes ' + money(amt) + ' on ' + b.floors + ' floor(s) and ' + b.pent + ' penthouse(s).', 'bad');
      if (pay(G, P.i, amt, -1)) done();
      break;
    }
    case 'nearest': {
      const list = a.what === 'rail' ? RAILS : UTILS;
      let to = list.find(x => x > P.pos);
      if (to == null) to = list[0];
      goTo(G, P.i, to, true);
      const o = G.own[to];
      if (o >= 0 && o !== P.i && !G.mort[to]){
        const base = rentOf(G, to, (G.dice ? G.dice[0] + G.dice[1] : 7));
        const r = base * 2;
        say(G, 'Arriving on somebody else\'s ' + BOARD[to].n + ' this way costs double: ' + money(r) + '.', 'bad');
        if (pay(G, P.i, r, o)) done();
      } else land(G);
      break;
    }
    default: done();
  }
  if (G.phase === 'card') G.phase = 'awaitEnd';
}

/* ── buying ───────────────────────────────────────────────────────── */
function canBuy(G){
  return G.phase === 'awaitBuy' && G.own[cur(G).pos] < 0 && cur(G).cash >= BOARD[cur(G).pos].price;
}

function buy(G){
  if (G.phase !== 'awaitBuy') return false;
  const P = cur(G), i = P.pos, s = BOARD[i];
  if (G.own[i] >= 0 || P.cash < s.price) return false;
  P.cash -= s.price;
  G.own[i] = P.i;
  say(G, P.name + ' bought ' + s.n + ' for ' + money(s.price) + '.', 'good');
  G.phase = 'awaitEnd';
  return true;
}

/* ── the auction ──────────────────────────────────────────────────────
   Declining to buy must cost you something, or declining is always
   free and the board never fills up. So it goes under the hammer at
   whatever anybody will pay, starting at ten euro. */
function declineBuy(G, auctionOn){
  if (G.phase !== 'awaitBuy') return false;
  const i = cur(G).pos;
  if (auctionOn === false){
    say(G, 'Nobody wanted ' + BOARD[i].n + '. It stays empty.');
    G.phase = 'awaitEnd';
    return true;
  }
  return startAuction(G, i);
}

function startAuction(G, i){
  const inIt = alive(G).map(p => p.i);
  if (inIt.length < 2){
    say(G, 'Nobody left to bid against. ' + BOARD[i].n + ' stays empty.');
    G.phase = 'awaitEnd';
    return true;
  }
  G.auction = { pos:i, bid:0, high:-1, seat:0, order: inIt, out: [] };
  G.phase = 'auction';
  say(G, BOARD[i].n + ' goes under the hammer.', 'card');
  return true;
}

function auctionBidder(G){
  const A = G.auction;
  if (!A) return -1;
  return A.order[A.seat];
}

function auctionStep(G){
  const A = G.auction;
  const live = A.order.filter(p => A.out.indexOf(p) < 0);
  if (live.length <= 1){
    finishAuction(G);
    return;
  }
  let guard = 0;
  do {
    A.seat = (A.seat + 1) % A.order.length;
    guard++;
  } while (A.out.indexOf(A.order[A.seat]) >= 0 && guard < 20);
}

function auctionBid(G, amount){
  const A = G.auction;
  if (!A) return false;
  const p = auctionBidder(G);
  amount = Math.round(amount);
  if (amount <= A.bid || amount > G.players[p].cash) return false;
  A.bid = amount; A.high = p;
  say(G, G.players[p].name + ' bids ' + money(amount) + '.');
  auctionStep(G);
  return true;
}

function auctionPass(G){
  const A = G.auction;
  if (!A) return false;
  const p = auctionBidder(G);
  if (A.out.indexOf(p) < 0) A.out.push(p);
  say(G, G.players[p].name + ' is out.');
  auctionStep(G);
  return true;
}

function finishAuction(G){
  const A = G.auction;
  if (!A) return;
  const i = A.pos;
  if (A.high >= 0 && A.bid > 0){
    G.players[A.high].cash -= A.bid;
    G.own[i] = A.high;
    say(G, G.players[A.high].name + ' takes ' + BOARD[i].n + ' for ' + money(A.bid) + '.', 'good');
  } else {
    say(G, 'Not one bid. ' + BOARD[i].n + ' stays on the market.');
  }
  G.auction = null;
  G.phase = G.debt ? 'debt' : 'awaitEnd';
}

/* ═══════════════════════════════════════════════════════════════════
   11. BUILDING
   You need the whole colour group, none of it mortgaged, and you must
   build EVENLY — no floor may go up on a property that is already a
   floor ahead of its neighbours. Four floors, then a penthouse, and
   the island only has so much concrete.
   ═══════════════════════════════════════════════════════════════════ */
function buildCost(i){ const s = BOARD[i]; return s.g ? GROUPS[s.g].build : 0; }

function canBuild(G, p, i){
  const s = BOARD[i];
  if (!s || s.t !== 'prop') return false;
  if (G.own[i] !== p || G.mort[i]) return false;
  if (!canDevelop(G, p, i)) return false;
  if (G.lvl[i] >= 5) return false;
  /* even building: nothing may get ahead of the lowest in the group by
     more than one */
  const set = GROUPS[s.g].props;
  const min = Math.min.apply(null, set.map(x => G.lvl[x]));
  if (G.lvl[i] > min) return false;
  /* the concrete */
  if (G.lvl[i] === 4){ if (G.supply.penthouses < 1) return false; }
  else if (G.supply.floors < 1) return false;
  if (G.players[p].cash < buildCost(i)) return false;
  return true;
}

function build(G, i){
  const p = G.turn;
  if (!canBuild(G, p, i)) return false;
  const cost = buildCost(i);
  G.players[p].cash -= cost;
  if (G.lvl[i] === 4){ G.supply.penthouses--; G.supply.floors += 4; G.lvl[i] = 5; }
  else { G.supply.floors--; G.lvl[i]++; }
  G.stat.builds++;
  say(G, G.players[p].name + ' put up ' + LADDER[G.lvl[i]].mt.toLowerCase() + ' on ' + BOARD[i].n + '. ' + money(cost) + '.', 'good');
  return true;
}

function canSell(G, p, i){
  const s = BOARD[i];
  if (!s || s.t !== 'prop' || G.own[i] !== p || G.lvl[i] === 0) return false;
  const set = GROUPS[s.g].props;
  const max = Math.max.apply(null, set.map(x => G.lvl[x]));
  if (G.lvl[i] < max) return false;            /* sell evenly, from the top */
  if (G.lvl[i] === 5 && G.supply.floors < 4) return false;   /* need 4 floors back on the board */
  return true;
}

/* half of what it cost — everybody loses money on a sale, that is the point */
function sellValue(i){ return Math.floor(buildCost(i) / 2); }

function sellBuilding(G, i, p){
  p = (p == null ? G.turn : p);
  if (!canSell(G, p, i)) return false;
  const back = sellValue(i) * (G.lvl[i] === 5 ? 5 : 1);
  if (G.lvl[i] === 5){ G.lvl[i] = 4; G.supply.penthouses++; G.supply.floors -= 4; }
  else { G.lvl[i]--; G.supply.floors++; }
  G.players[p].cash += back;
  say(G, G.players[p].name + ' sold a floor off ' + BOARD[i].n + ' for ' + money(back) + '.', 'bad');
  if (G.debt && G.debt.who === p) settle(G);
  return true;
}

/* ═══════════════════════════════════════════════════════════════════
   12. MORTGAGES
   Half the price now, and eleven-tenths of that to get it back. You
   can never mortgage anything with a floor on it, or anything whose
   group still has a floor standing anywhere.
   ═══════════════════════════════════════════════════════════════════ */
function canMortgage(G, p, i){
  if (!isProp(i) || G.own[i] !== p || G.mort[i]) return false;
  const s = BOARD[i];
  if (s.t === 'prop'){
    if (GROUPS[s.g].props.some(x => G.lvl[x] > 0)) return false;
  }
  return true;
}

function mortgage(G, i, p){
  p = (p == null ? G.turn : p);
  if (!canMortgage(G, p, i)) return false;
  G.mort[i] = true;
  G.players[p].cash += mortgageValue(i);
  say(G, G.players[p].name + ' mortgaged ' + BOARD[i].n + ' for ' + money(mortgageValue(i)) + '.', 'bad');
  if (G.debt && G.debt.who === p) settle(G);
  return true;
}

function canUnmortgage(G, p, i){
  return isProp(i) && G.own[i] === p && G.mort[i] &&
         G.players[p].cash >= unmortgageCost(i);
}

function unmortgage(G, i, p){
  p = (p == null ? G.turn : p);
  if (!canUnmortgage(G, p, i)) return false;
  G.players[p].cash -= unmortgageCost(i);
  G.mort[i] = false;
  say(G, G.players[p].name + ' cleared the mortgage on ' + BOARD[i].n + ' — ' + money(unmortgageCost(i)) + ' with the interest.', 'good');
  return true;
}

/* ═══════════════════════════════════════════════════════════════════
   13. TRADING
   Nothing moves until BOTH sides are legal and then everything moves
   at once. A half-applied trade — cash gone, deed not transferred —
   is the single worst bug this genre has, so the whole thing is
   checked first and applied second, with no early return in between.
   ═══════════════════════════════════════════════════════════════════ */
/* a stable fingerprint of an offer — who, to whom, and which deeds.
   Cash is deliberately NOT in it: sweetening a refused deal by ten euro
   is the same deal, and re-offering it is the same loop. */
function offerSig(o){
  const a = (o.propsFrom || []).slice().sort((x, y) => x - y).join('.');
  const b = (o.propsTo   || []).slice().sort((x, y) => x - y).join('.');
  return o.from + '>' + o.to + ':' + a + '/' + b;
}

function refuse(G, o){
  if (!o) return;
  const sig = offerSig(o);
  if (G.refused.indexOf(sig) < 0) G.refused.push(sig);
  if (G.refused.length > 60) G.refused.splice(0, G.refused.length - 60);
  G.offer = null;
}

const wasRefused = (G, o) => G.refused.indexOf(offerSig(o)) >= 0;

function tradeLegal(G, o){
  if (!o) return 'no offer';
  const a = G.players[o.from], b = G.players[o.to];
  if (!a || !b || a.out || b.out) return 'that seat is out';
  if (a.i === b.i) return 'not with yourself';
  const ca = Math.max(0, Math.round(o.cashFrom || 0));
  const cb = Math.max(0, Math.round(o.cashTo || 0));
  if (ca > a.cash) return a.name + ' has not got that much';
  if (cb > b.cash) return b.name + ' has not got that much';
  const pa = o.propsFrom || [], pb = o.propsTo || [];
  if (!pa.length && !pb.length && !ca && !cb) return 'an empty offer';
  for (const i of pa){
    if (G.own[i] !== a.i) return 'not ' + a.name + '\'s to give';
    if (BOARD[i].t === 'prop' && GROUPS[BOARD[i].g].props.some(x => G.lvl[x] > 0))
      return 'sell the floors on ' + GROUPS[BOARD[i].g].n + ' first';
  }
  for (const i of pb){
    if (G.own[i] !== b.i) return 'not ' + b.name + '\'s to give';
    if (BOARD[i].t === 'prop' && GROUPS[BOARD[i].g].props.some(x => G.lvl[x] > 0))
      return 'sell the floors on ' + GROUPS[BOARD[i].g].n + ' first';
  }
  const skA = Math.max(0, o.skipsFrom || 0), skB = Math.max(0, o.skipsTo || 0);
  if (skA > a.skips || skB > b.skips) return 'no such card to give';
  return null;
}

function doTrade(G, o){
  const bad = tradeLegal(G, o);
  if (bad) return bad;
  const a = G.players[o.from], b = G.players[o.to];
  const ca = Math.max(0, Math.round(o.cashFrom || 0));
  const cb = Math.max(0, Math.round(o.cashTo || 0));
  const skA = Math.max(0, o.skipsFrom || 0), skB = Math.max(0, o.skipsTo || 0);
  /* everything below this line is arithmetic that cannot fail */
  a.cash += cb - ca;
  b.cash += ca - cb;
  a.skips += skB - skA;
  b.skips += skA - skB;
  (o.propsFrom || []).forEach(i => { G.own[i] = b.i; });
  (o.propsTo   || []).forEach(i => { G.own[i] = a.i; });
  G.stat.trades++;
  const bits = [];
  if ((o.propsFrom || []).length) bits.push(a.name + ' gives ' + o.propsFrom.map(i => BOARD[i].n).join(', '));
  if (ca) bits.push(a.name + ' gives ' + money(ca));
  if ((o.propsTo || []).length) bits.push(b.name + ' gives ' + o.propsTo.map(i => BOARD[i].n).join(', '));
  if (cb) bits.push(b.name + ' gives ' + money(cb));
  say(G, 'Deal done — ' + bits.join('; ') + '.', 'card');
  G.offer = null;
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   14. RAISING MONEY, AND GIVING UP
   ═══════════════════════════════════════════════════════════════════ */
/* everything a player could still turn into cash, and what it is worth.
   Ordered the way a sensible person liquidates: floors off the
   cheapest group first, then deeds that are not part of a set, then
   the rest, cheapest first. The AI follows this list top to bottom and
   the RAISE MONEY sheet shows it in the same order, so the human is
   being offered the same advice the machine takes. */
function liquidationList(G, p){
  const out = [];
  for (let i = 0; i < 32; i++){
    if (G.own[i] !== p) continue;
    if (canSell(G, p, i)){
      const s = BOARD[i];
      out.push({ kind:'sell', i, gain: sellValue(i) * (G.lvl[i] === 5 ? 5 : 1),
                 rank: 0, tie: GROUPS[s.g].build * 10 + G.lvl[i] });
    }
  }
  for (let i = 0; i < 32; i++){
    if (G.own[i] !== p || !canMortgage(G, p, i)) continue;
    const partOfSet = ownsSet(G, p, i);
    out.push({ kind:'mortgage', i, gain: mortgageValue(i),
               rank: partOfSet ? 2 : 1, tie: BOARD[i].price });
  }
  out.sort((a, b) => (a.rank - b.rank) || (a.tie - b.tie) || (a.i - b.i));
  return out;
}

function raisable(G, p){
  return liquidationList(G, p).reduce((n, x) => n + x.gain, 0);
}

/* can this player possibly pay what they owe? */
function canSurvive(G, p, amt){
  return G.players[p].cash + raisable(G, p) >= amt;
}

function bankrupt(G, p){
  const P = G.players[p];
  const d = G.debt;
  const to = d && !d.split && d.to >= 0 ? d.to : -1;
  P.out = true;
  G.stat.bankrupt++;

  if (to >= 0){
    /* the creditor gets the lot, mortgages and all */
    const C = G.players[to];
    C.cash += P.cash;
    C.skips += P.skips;
    let n = 0;
    for (let i = 0; i < 32; i++){
      if (G.own[i] !== p) continue;
      /* the buildings come down — a bankrupt's floors are sold to the
         bank at half, and the money goes to the creditor with the rest */
      while (G.lvl[i] > 0){
        C.cash += sellValue(i) * (G.lvl[i] === 5 ? 5 : 1);
        if (G.lvl[i] === 5){ G.lvl[i] = 4; G.supply.penthouses++; G.supply.floors -= 4; }
        else { G.lvl[i]--; G.supply.floors++; }
      }
      G.own[i] = to; n++;
    }
    say(G, P.name + ' is finished. ' + C.name + ' takes ' + money(P.cash) + ' and ' + n + ' deed(s).', 'bad');
  } else {
    /* owed to the bank, or to several people at once: the cash is split
       among whoever was owed and the deeds go back on the market */
    if (d && d.split){
      const total = d.split.reduce((n, x) => n + x.amt, 0) || 1;
      d.split.forEach(x => credit(G, x.p, Math.floor(P.cash * x.amt / total)));
    }
    for (let i = 0; i < 32; i++){
      if (G.own[i] !== p) continue;
      while (G.lvl[i] > 0){
        if (G.lvl[i] === 5){ G.lvl[i] = 4; G.supply.penthouses++; G.supply.floors -= 4; }
        else { G.lvl[i]--; G.supply.floors++; }
      }
      G.own[i] = -1; G.mort[i] = false;
    }
    say(G, P.name + ' is finished, and it was the bank. Everything goes back on the market.', 'bad');
  }
  P.cash = 0; P.skips = 0; P.pos = 0; P.jail = 0;
  G.debt = null;
  checkOver(G);
  if (!G.over){
    G.phase = 'awaitEnd';
    /* the seat that just died is the one whose turn it is, unless the
       bankruptcy happened on somebody else's card. endTurn sorts it. */
    endTurn(G, true);
  }
  return true;
}

/* ═══════════════════════════════════════════════════════════════════
   15. END OF TURN, AND END OF GAME
   A property game that cannot end is a property game nobody finishes.
   Two honest endings:
     · everyone else is bankrupt — the old way, and it still happens
     · the round limit runs out — richest by net worth takes it
   The round counter is on screen from the first turn so nobody is
   surprised by it.
   ═══════════════════════════════════════════════════════════════════ */
/* THE BACKSTOP.
   "To the end" means last one standing, and two stubborn players with
   half the board each can trade rent back and forth for a very long
   time — a headless run of that mode went 251 rounds before somebody
   finally went under. It DID end, but a game that can run for hours is
   a game nobody finishes, so even the unlimited mode has a ceiling: at
   round 150 the bank calls it a day and the richest takes it. The
   setup screen says so; nobody is ambushed by it. */
const HARD_ROUNDS = 150;

function checkOver(G){
  const live = alive(G);
  if (live.length <= 1){
    G.over = { winner: live.length ? live[0].i : -1, why:'last' };
    G.phase = 'over';
    if (live.length) say(G, live[0].name + ' owns the island. Everybody else owns a chair.', 'good');
    return true;
  }
  return false;
}

function finishOnTime(G){
  const live = alive(G);
  let best = live[0], bn = netWorth(G, live[0].i);
  for (const p of live){
    const n = netWorth(G, p.i);
    if (n > bn){ best = p; bn = n; }
  }
  G.over = { winner: best.i, why:'rounds', worth: bn };
  G.phase = 'over';
  say(G, 'Time. ' + best.name + ' is worth ' + money(bn) + ' and that is that.', 'good');
}

function endTurn(G, afterBankruptcy){
  if (G.over) return false;
  if (!afterBankruptcy){
    if (G.phase === 'debt' || G.phase === 'awaitBuy' || G.phase === 'auction' || G.phase === 'card') return false;
    /* doubles buy another go — unless you are in the queue */
    if (G.dice && G.dice[0] === G.dice[1] && G.doubles > 0 && !cur(G).jail){
      G.phase = 'awaitRoll';
      G.moved = false;
      say(G, cur(G).name + ' rolled a double and goes again.');
      return true;
    }
  }
  G.doubles = 0;
  G.dice = null;
  G.moved = false;
  G.tradeTries = 0;
  /* next seat still in the game */
  let guard = 0, wrapped = false;
  do {
    G.turn = (G.turn + 1) % G.players.length;
    if (G.turn === 0) wrapped = true;
    guard++;
  } while (G.players[G.turn].out && guard < 12);

  if (wrapped){
    G.round++;
    const cap = G.roundLimit > 0 ? G.roundLimit : HARD_ROUNDS;
    if (G.round > cap){ finishOnTime(G); return true; }
  }
  G.phase = 'awaitRoll';
  return true;
}

/* the queue, paid or skipped */
function payBail(G){
  const P = cur(G);
  if (P.jail <= 0 || P.cash < BAIL) return false;
  P.cash -= BAIL;
  P.jail = 0;
  say(G, P.name + ' paid the fifty and walked out of counter four a free adult.', 'good');
  return true;
}

function useSkip(G){
  const P = cur(G);
  if (P.jail <= 0 || P.skips < 1) return false;
  P.skips--;
  P.jail = 0;
  say(G, P.name + ' knew somebody. Straight out.', 'good');
  return true;
}

/* ═══════════════════════════════════════════════════════════════════
   16. SEATS, ABSENCE AND THE AUTOPILOT
   A property game runs long. People put the phone down, walk into a
   lift, lose signal on the Gozo ferry. If one missing person freezes
   the table nobody will ever finish a game — so an empty seat is
   played by the phone, visibly, and handed straight back.

   The engine only holds the FLAGS and the reasons. Who decides the
   moves is js/kiri-ai.js; who notices the absence is js/kiri-ui.js
   (a turn clock, page visibility) or, later, the online transport.
   ═══════════════════════════════════════════════════════════════════ */
function setPresent(G, p, present, why){
  const P = G.players[p];
  if (!P || P.kind === 'cpu') return false;
  const was = P.auto;
  P.present = !!present;
  if (!present){
    P.auto = true;
    P.autoWhy = why || 'away';
    if (!was) say(G, P.name + ' has gone quiet. The phone is playing that seat until they are back.', 'card');
  } else if (was){
    P.auto = false;
    P.autoWhy = '';
    say(G, P.name + ' is back and takes the seat over again.', 'good');
  }
  return P.auto !== was;
}

/* a seat can also be handed to the phone deliberately — "play it for
   me, I am driving" */
function setAuto(G, p, on, why){
  const P = G.players[p];
  if (!P || P.kind === 'cpu') return false;
  const was = P.auto;
  P.auto = !!on;
  P.autoWhy = on ? (why || 'asked') : '';
  if (on) P.present = false; else P.present = true;
  if (P.auto !== was){
    say(G, on ? (P.name + '\'s seat is on autopilot.') : (P.name + ' has the seat back.'), on ? 'card' : 'good');
  }
  return P.auto !== was;
}

/* is this seat being played by the machine right now, for any reason */
function machineSeat(G, p){
  const P = G.players[p];
  return !!P && (P.kind === 'cpu' || P.auto);
}

/* IS THERE ANYBODY LEFT TO PLAY FOR?
   The pause exists for one reason only: the machine must not play out
   SOMEBODY'S SEAT while they are not there to see it. So the table is
   "empty" when every human seat still in the game is on autopilot.

   The subtlety that bit us: if the last human has gone BANKRUPT there
   is no seat being played on anybody's behalf — the remaining machine
   players are opponents, not stand-ins — and the game must run on to a
   winner so the person who just went under gets to watch who took it.
   The first version of this counted an eliminated human as an absent
   one and froze a two-machine endgame solid, forever. */
function tableEmpty(G){
  const humans = G.players.filter(p => !p.out && p.kind !== 'cpu');
  if (!humans.length) return false;
  return humans.every(p => p.auto);
}

/* ═══════════════════════════════════════════════════════════════════
   17. SAVE / RESTORE
   Persisted after every single mutation the UI makes, because losing
   an hour-long game to a closed tab is not acceptable.
   ═══════════════════════════════════════════════════════════════════ */
function save(G){
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: VERSION, at: Date.now(), g: G }));
    return true;
  } catch(e){ return false; }
}

function load(){
  try {
    const j = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!j || j.v !== VERSION || !j.g || !Array.isArray(j.g.players)) return null;
    const G = j.g;
    /* a save from a build with a different board is not resumable */
    if (!Array.isArray(G.own) || G.own.length !== BOARD.length) return null;
    if (G.over) return null;
    /* anybody who was on autopilot when the tab closed is, by
       definition, still away until they say otherwise */
    G.savedAt = j.at;
    return G;
  } catch(e){ return null; }
}

function clearSave(){ try { localStorage.removeItem(SAVE_KEY); } catch(e){} }
function hasSave(){ return !!load(); }

/* ═══════════════════════════════════════════════════════════════════
   18. FORMATTING — one place, so €1,250 looks the same everywhere
   ═══════════════════════════════════════════════════════════════════ */
function money(n){
  n = Math.round(n || 0);
  const neg = n < 0;
  const s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '−€' : '€') + s;
}

/* ═══════════════════════════════════════════════════════════════════
   19. PUBLIC FACE
   ═══════════════════════════════════════════════════════════════════ */
window.KIRI = {
  VERSION, SAVE_KEY, BOARD, GROUPS, DECKS, LADDER, SEATS, SUPPLY, MAX_SEATS, MIN_SEATS,
  RAILS, UTILS, SALARY, START_CASH, JAIL, BAIL, RAIL_RENT,
  HARD_ROUNDS,
  newGame, roll, canRoll, advance, goTo, land, toJail,
  drawCard, applyCard,
  canBuy, buy, declineBuy, startAuction, auctionBidder, auctionBid, auctionPass, finishAuction,
  canBuild, build, canSell, sellBuilding, sellValue, buildCost,
  canMortgage, mortgage, canUnmortgage, unmortgage, mortgageValue, unmortgageCost,
  tradeLegal, doTrade, offerSig, refuse, wasRefused,
  pay, payMany, credit, settle, liquidationList, raisable, canSurvive, bankrupt,
  endTurn, payBail, useSkip, checkOver, finishOnTime,
  rentOf, netWorth, holdings, ownsSet, canDevelop, setOf, groupOf, buildingsOf, countIn,
  sq, cur, alive, isProp, say, money, rnd, die, shuffle,
  setPresent, setAuto, machineSeat, tableEmpty,
  save, load, clearSave, hasSave,
};

})();
