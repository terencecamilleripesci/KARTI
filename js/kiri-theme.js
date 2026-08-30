/* ═══════════════════════════════════════════════════════════════════
   IL-KIRI THEMES — the content, split from the rules.

   THE LINE IS: A THEME MAY NEVER CHANGE A NUMBER. js/kiri.js keeps every
   index, type, group membership, price, rent ladder and build cost, and
   every rule. A theme supplies only what you LOOK at: names, group names,
   band colours, icons and the joke. That is what stops a new theme from
   quietly rebalancing the game -- it cannot, because it owns no numbers.

   WIRE SAFETY: the HOST's theme id travels with the room and everybody
   renders it, on mp.js's existing `variant` channel -- no new wire field,
   so none of the four ways an online game dies applies. A phone that does
   not have the host's theme falls back to malta and still plays.

   This file was GENERATED from the board that shipped, so every Maltese
   name and every joke is the original, character for character.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const MALTA = {
  id:'malta', v:1, name:'Malta', mt:'Malta', flag:'\u{1F1F2}\u{1F1F9}',
  blurb:'Buy half the island and charge your friends rent on it.',
  /* the paragraph under the menu's hero, and the chip printed on it */
  intro:'Buy half of Malta, charge your friends rent for landing on it, and watch a ' +
        'friendship end over a garage in Marsa. Forty squares, eight colour groups, floors ' +
        'instead of houses, and a queue at counter four instead of a prison cell.',
  chip:'MALTA · 40 SQUARES',
  /* art/ui/kiri-loc-*.jpg are PHOTOGRAPHS OF MALTA. Only a theme that owns
     that art may ask for it; a theme without this flag draws the CSS tile it
     was always going to draw, which is the design, not a fallback. */
  art:true,
  /* headings the board writes over things a theme renamed. The engine still
     calls the types 'rail' and 'util' -- these are only the words on screen. */
  labels:{ rail:'TRANSPORT', util:'SERVICES', board:'THE BOARD',
           both:'TRANSPORT &amp; SERVICES' },
  /* the two bands that belong to no colour group. They are a TYPE, not a
     group -- js/kiri.js decides which squares are transports and which are
     services and a theme cannot move one -- so the colour lives here rather
     than in `groups`, where it would have needed a ninth key that owned
     properties it does not own. */
  colours:{ rail:'#B79E70', util:'#4FC3F7' },
  /* the two decks, as they are LOOKED at: the name on the card, the colour it
     is drawn in, and the one character the board prints on the deck square.
     The deck KEYS are the engine's and never change -- js/kiri.js deals from
     them, and a theme that renamed a key would deal from nothing. */
  decks:{
    ghajdut:{ n:'Għajdut', mt:'Gossip', e:'\u{1F440}', c:'#E8452C', mark:'?' },
    gvern:{ n:'Tal-Gvern', mt:'The Government', e:'\u{1F3DB}️', c:'#3DDC84', mark:'!' },
  },
  groups:{
    marsa:{ n:"Marsa", c:"#9a6b3e" },
    hamrun:{ n:"Il-Ħamrun", c:"#a9d9ef" },
    birgu:{ n:"Il-Birgu", c:"#d33d8a" },
    gzira:{ n:"Il-Gżira", c:"#e8912a" },
    mosta:{ n:"Il-Mosta", c:"#d02f2f" },
    swieqi:{ n:"Is-Swieqi", c:"#f2d43c" },
    sliema:{ n:"Tas-Sliema", c:"#2f9e4f" },
    belt:{ n:"Il-Belt", c:"#2a5fd0" },
  },
  squares:{
    0:{ code:"BID", e:"🏁", n:"Il-Bidu", mt:"The Start", joke:"Everybody starts here with fifteen hundred euro and the firm belief that this time they will not overspend in the first ten minutes." },
    1:{ code:"GRX", e:"🔧", n:"The Marsa Garage", mt:"Il-Garaxx ta' Marsa", joke:"Advertised as a workshop. Contains a fridge, a sofa, a drum kit and eleven years of somebody's marriage." },
    2:{ code:"!", e:"🏛️", n:"Tal-Gvern", mt:"The Government", joke:"A brown envelope with a window in it, and whatever is inside is now your problem." },
    3:{ code:"MŻN", e:"🛞", n:"The Scrap Yard Shed", mt:"Il-Maħżen tal-Ħadid", joke:"Six tonnes of metal, one dog with opinions, and a man who can tell you the price of copper to the cent." },
    4:{ code:"€", e:"🧾", n:"The Tax", mt:"It-Taxxa", joke:"Your accountant says it is complicated. It is not complicated. It is two hundred euro." },
    5:{ code:"VAP", e:"⛴️", n:"The Gozo Ferry", mt:"Il-Vapur ta' Għawdex", joke:"Forty-five minutes each way and a queue at Ċirkewwa that has its own weather system." },
    6:{ code:"ĦNT", e:"🏪", n:"The Shop That Is Always Closing Down", mt:"Il-Ħanut Li Ilu Jagħlaq", joke:"CLOSING DOWN SALE since 2016. Still has stock. Still closing. The owner has aged; the sign has not." },
    7:{ code:"?", e:"👀", n:"Għajdut", mt:"Gossip", joke:"Somebody has heard something about you and they are telling it to somebody else right now." },
    8:{ code:"FRN", e:"🥖", n:"The Flat Above The Bakery", mt:"Il-Flat Fuq Il-Furnar", joke:"Warm all year round and smells incredible until four in the morning, at which point it smells incredible and you are awake." },
    9:{ code:"UMD", e:"💦", n:"The House With The Damp", mt:"Id-Dar Bl-Umdità", joke:"The surveyor called it \"rising\". The owner calls it \"character\". The wardrobe calls it home." },
    10:{ code:"KJU", e:"🎫", n:"Il-Kju", mt:"The Queue", joke:"Counter four. Ticket B-207. They are currently serving B-181. You have been here since a previous version of yourself." },
    11:{ code:"BIR", e:"🪣", n:"The Well In The Kitchen", mt:"Il-Bir Fil-Kċina", joke:"Four hundred years old, twelve metres deep, and directly under where you would quite like the dishwasher." },
    12:{ code:"BWS", e:"🚚", n:"The Water Bowser", mt:"Il-Bowser tal-Ilma", joke:"He comes when he comes. He does not do appointments, and he certainly does not do Tuesdays." },
    13:{ code:"KRT", e:"🚪", n:"The House Of Character", mt:"Id-Dar Tal-Karattru", joke:"Every beam original, every door crooked, every ceiling exactly four centimetres lower than your head." },
    14:{ code:"STL", e:"🐎", n:"The Converted Stable", mt:"L-Istalla Kkonvertita", joke:"A beautiful conversion. The horse would still find it about right, and so will your guests." },
    15:{ code:"TRM", e:"🚌", n:"The Valletta Terminus", mt:"It-Terminus tal-Belt", joke:"Every bus on the island leaves from here, and the one you need left ninety seconds before you arrived." },
    16:{ code:"FĊT", e:"🚢", n:"The Flat Facing The Ferry", mt:"Il-Flat Faċċata tal-Vapur", joke:"Sea views, they said. It is a ferry terminal, and it starts at four in the morning." },
    17:{ code:"!", e:"🏛️", n:"Tal-Gvern", mt:"The Government", joke:"A brown envelope with a window in it, and whatever is inside is now your problem." },
    18:{ code:"GLR", e:"🚗", n:"The Balcony Over The Traffic", mt:"Il-Gallarija Fuq it-Traffiku", joke:"A beautiful enclosed balcony from which to watch the same queue every single evening." },
    19:{ code:"PRK", e:"🅿️", n:"The One With The Parking Space", mt:"Dik Bil-Parkeġġ", joke:"Nobody remembers the flat. Everybody remembers that it came with a parking space." },
    20:{ code:"PJZ", e:"☕", n:"Il-Pjazza", mt:"The Square", joke:"Nothing happens here and nothing is charged. Sit down, have a coffee, and listen to four men solve the country." },
    21:{ code:"KPL", e:"⛪", n:"The House Behind The Dome", mt:"Id-Dar Wara l-Koppla", joke:"Bells at six, bells at noon, bells whenever anybody important dies. You stop hearing them by year two." },
    22:{ code:"?", e:"👀", n:"Għajdut", mt:"Gossip", joke:"Somebody has heard something about you and they are telling it to somebody else right now." },
    23:{ code:"GĦL", e:"🌾", n:"The Field They Call A Garden", mt:"L-Għalqa Li Jsejħulha Ġnien", joke:"Half a tumolo of rubble, two carob trees and a permit application that has been pending since 2009." },
    24:{ code:"KNT", e:"🏪", n:"The Corner Shop With Flats Above", mt:"Il-Ħanut tal-Kantuniera", joke:"Ground floor sells everything. The two flats above hear absolutely all of it." },
    25:{ code:"KRZ", e:"🐴", n:"The Karozzin", mt:"Il-Karozzin", joke:"Forty euro to be pulled slowly past things you could have walked to, by a man who has done this since before you were born." },
    26:{ code:"BLK", e:"🏗️", n:"The Block With No Permit", mt:"Il-Blokk Bla Permess", joke:"Six floors up and the paperwork says \"boundary wall\". Everyone has noticed. Nobody has written it down." },
    27:{ code:"MSN", e:"🏠", n:"Your Mate's Maisonette", mt:"Il-Maisonette Tal-Ħabib", joke:"He will do you a price. The price is the market price. He will still want to be thanked for it." },
    28:{ code:"ĠEN", e:"🔌", n:"The Generator", mt:"Il-Ġeneratur", joke:"Comes on eleven seconds after the power cuts, which is exactly ten seconds after everyone has started shouting." },
    29:{ code:"PNT", e:"🌅", n:"Penthouse, Sea Views", mt:"Penthouse Bit-Tikka Baħar", joke:"The sea view is real. It is nine centimetres wide, it is between two other blocks, and it is going in April." },
    30:{ code:"MRS", e:"🚦", n:"Marsa Junction", mt:"Il-Marsa", joke:"You have been in this lane for twenty minutes. It is the wrong lane. It has always been the wrong lane." },
    31:{ code:"FRT", e:"🌊", n:"The Seafront Flat", mt:"Il-Flat Tal-Front", joke:"Nobody who lives on this island can afford it, and every single one of them can tell you exactly what it went for." },
    32:{ code:"TOR", e:"🏢", n:"The Tower By The Water", mt:"It-Torri Ħdejn Il-Baħar", joke:"Twenty-two floors of glass where a cinema used to be. Eleven people live in it. Four of them exist." },
    33:{ code:"!", e:"🏛️", n:"Tal-Gvern", mt:"The Government", joke:"A brown envelope with a window in it, and whatever is inside is now your problem." },
    34:{ code:"VST", e:"🪟", n:"Two Rooms With A View", mt:"Żewġ Kmamar Bil-Vista", joke:"The view is magnificent and the rooms are two. You will be showing people the view for the rest of your life." },
    35:{ code:"TXI", e:"🚕", n:"The Airport Taxi", mt:"It-Taxi Tal-Ajruport", joke:"The fare is fixed. It has been fixed at a different number every single time you have used it." },
    36:{ code:"?", e:"👀", n:"Għajdut", mt:"Gossip", joke:"Somebody has heard something about you and they are telling it to somebody else right now." },
    37:{ code:"PLZ", e:"🏛️", n:"The Valletta Palazzo", mt:"Il-Palazz Tal-Belt", joke:"Grade one scheduled, which means you may look at it, love it, pay for it, and change absolutely nothing about it." },
    38:{ code:"ĊNS", e:"📜", n:"Iċ-Ċens", mt:"The Ground Rent", joke:"Set in 1912 by a man who is extremely dead, and it will outlive you, your children, and the building itself." },
    39:{ code:"MDN", e:"🕯️", n:"The Mdina House", mt:"Id-Dar Tal-Imdina", joke:"Nine bedrooms behind the silent city walls, and nobody has slept in it since 1987. It is being kept. For what, nobody says." },
  }
};

/* ═══════════════════════════════════════════════════════════════════
   THE SECOND THEME — the one that proves the first was not the only one.

   Same forty indices, same eight group KEYS, same deck keys, same types.
   Not one number: no price, no rent, no build cost, no group membership.
   Read it beside MALTA above and every difference is a word, a colour,
   an emoji or a glyph — which is the whole contract, written out twice.

   `draw` names a glyph in js/kiri-ui.js's OWN sprite (the same three
   dozen marks Malta uses); a theme may pick from that set and may not
   invent one, so no theme can put an unknown id into a <use href>.
   ═══════════════════════════════════════════════════════════════════ */
const FANTASY = {
  id:'fantasy', v:1, name:'The Realm', mt:'Fantasija', flag:'\u{1F409}',
  blurb:'Buy half the kingdom and charge your friends rent on it.',
  intro:'Buy half the realm, charge your friends rent for landing on it, and watch a ' +
        'friendship end over a goblin forge. Forty squares, eight colour groups, floors ' +
        'instead of towers, and a cell at the gaol instead of a prison.',
  chip:'THE REALM · 40 SQUARES',
  /* no `art` flag: art/ui/kiri-loc-* are photographs of Malta and would be a
     lie behind a dragon. The CSS tile is what this theme is drawn with. */
  labels:{ rail:'PASSAGE', util:'ARCANA', board:'THE BOARD',
           both:'PASSAGE &amp; ARCANA' },
  colours:{ rail:'#9d7bd1', util:'#42e0a0' },
  decks:{
    ghajdut:{ n:'Whispers', mt:'Rumours', e:'\u{1F442}', c:'#8E3AD6', mark:'?' },
    gvern:{ n:'The Crown', mt:'Decrees', e:'\u{1F451}', c:'#C9A227', mark:'!' },
  },
  groups:{
    marsa:{ n:"Ratwarren", c:"#6b7a3a" },
    hamrun:{ n:"Fogfoot", c:"#7fd6c4" },
    birgu:{ n:"The Coven Quarter", c:"#8e3ad6" },
    gzira:{ n:"Emberside", c:"#ff6a2b" },
    mosta:{ n:"The Sunken Ward", c:"#1f7fa8" },
    swieqi:{ n:"Gilded Row", c:"#c9a227" },
    sliema:{ n:"Dragonspine", c:"#c02040" },
    belt:{ n:"The High Citadel", c:"#dfd3ff" },
  },
  squares:{
    0:{ code:"DWN", e:"🏁", n:"The Dawn Gate", mt:"Dawnarch", draw:"bidu",
        joke:"Everybody starts here with fifteen hundred crowns and the firm belief that this time they will not spend it all on a haunted shed." },
    1:{ code:"FRG", e:"⚒️", n:"The Goblin Forge", mt:"Grubhammer", draw:"garaxx",
        joke:"Advertised as a smithy. Contains one anvil, four cousins, a goat, and a feud older than the kingdom." },
    2:{ code:"!", e:"👑", n:"The Crown", mt:"A Decree", draw:"gvern",
        joke:"A sealed scroll with the royal wax on it, and whatever is inside is now your problem." },
    3:{ code:"BNE", e:"🦴", n:"The Bone Yard", mt:"Marrowfield", draw:"mahzen",
        joke:"Six tonnes of dead adventurer, one wyrm with opinions, and a man who can price a femur to the copper." },
    4:{ code:"TTH", e:"🧾", n:"The Tithe", mt:"Kingsdue", draw:"taxxa",
        joke:"Your steward says it is complicated. It is not complicated. It is two hundred crowns." },
    5:{ code:"FRY", e:"⛵", n:"The Ferry Of Souls", mt:"Grimwater Crossing", draw:"@ferry",
        joke:"Forty-five minutes each way, and the queue on the far bank has been standing there since the Second Age." },
    6:{ code:"POT", e:"🧪", n:"The Potion Shop That Is Always Closing", mt:"Last Draught", draw:"hanut",
        joke:"CLOSING DOWN since the Battle of Thornhill. Still has stock. Still closing. The alchemist has aged; the sign has not." },
    7:{ code:"?", e:"👂", n:"Whispers", mt:"Rumours", draw:"ghajdut",
        joke:"Somebody has heard something about you and a bard is already setting it to music." },
    8:{ code:"PIE", e:"🥧", n:"The Room Above The Pie Shop", mt:"Crustloft", draw:"furnar",
        joke:"Warm all year round and it smells magnificent until four in the morning, at which point it smells magnificent and you are awake." },
    9:{ code:"MLD", e:"🍄", n:"The House With The Mould", mt:"Sporefall", draw:"umdita",
        joke:"The surveyor called it \"rising\". The owner calls it \"character\". The wardrobe calls it a kingdom." },
    10:{ code:"CEL", e:"🔒", n:"The Cells", mt:"The Long Wait", draw:"kju",
        joke:"Cell four. Token B-207. The gaoler is releasing B-181. You have been here since a previous incarnation." },
    11:{ code:"WSH", e:"🪣", n:"The Wishing Well In The Kitchen", mt:"Coinmouth", draw:"bir",
        joke:"Four hundred years old, twelve metres deep, one wish a century, and directly under where you wanted the pantry." },
    12:{ code:"RAI", e:"🌧️", n:"The Rainmaker", mt:"Cloudwright", draw:"bowser",
        joke:"He comes when he comes. He does not do appointments, and he certainly does not do harvest week." },
    13:{ code:"HNT", e:"🚪", n:"The Haunted Cottage", mt:"Thraelholt", draw:"karattru",
        joke:"Every beam original, every door crooked, every ceiling four centimetres lower than your head, and one of them screams." },
    14:{ code:"UNI", e:"🦄", n:"The Converted Unicorn Stable", mt:"Hornstall", draw:"stalla",
        joke:"A beautiful conversion. The unicorn would still find it about right, and so will your guests." },
    15:{ code:"GRY", e:"🦅", n:"The Gryphon Post", mt:"Skyhitch", draw:"@bus",
        joke:"Every gryphon in the realm leaves from here, and the one you needed left ninety seconds before you arrived." },
    16:{ code:"QUY", e:"🌊", n:"The Room Facing The Quay", mt:"Tidewatch", draw:"faccata",
        joke:"Sea views, they said. It is a soul-ferry berth, and the wailing starts at four in the morning." },
    17:{ code:"!", e:"👑", n:"The Crown", mt:"A Decree", draw:"gvern",
        joke:"A sealed scroll with the royal wax on it, and whatever is inside is now your problem." },
    18:{ code:"BLC", e:"🐉", n:"The Balcony Over The Dragon Run", mt:"Scaleview", draw:"gallarija",
        joke:"A beautiful enclosed balcony from which to watch the same queue of wyrms every single evening." },
    19:{ code:"BRM", e:"🧹", n:"The One With The Broom Landing", mt:"Bristleport", draw:"parkegg",
        joke:"Nobody remembers the rooms. Everybody remembers that it came with somewhere to leave a broom." },
    20:{ code:"RST", e:"🍺", n:"The Wayfarer's Rest", mt:"Longtable", draw:"pjazza",
        joke:"Nothing happens here and nothing is charged. Sit down, take an ale, and listen to four men solve the kingdom." },
    21:{ code:"TMP", e:"⛪", n:"The House Behind The Temple", mt:"Bellshadow", draw:"koppla",
        joke:"Bells at six, bells at noon, bells whenever anybody important ascends. You stop hearing them by year two." },
    22:{ code:"?", e:"👂", n:"Whispers", mt:"Rumours", draw:"ghajdut",
        joke:"Somebody has heard something about you and a bard is already setting it to music." },
    23:{ code:"FLD", e:"🌾", n:"The Field They Call An Orchard", mt:"Thistlemead", draw:"ghalqa",
        joke:"Half an acre of rubble, two blighted apple trees and a charter that has been pending since the old king." },
    24:{ code:"COR", e:"🏪", n:"The Corner Stall With Rooms Above", mt:"Sixpenny Corner", draw:"kantuniera",
        joke:"Ground floor sells everything, some of it legal. The two rooms above hear absolutely all of it." },
    25:{ code:"CRT", e:"🐴", n:"The Ghost Cart", mt:"The Slow Wheel", draw:"karozzin",
        joke:"Forty crowns to be pulled slowly past things you could have walked to, by a driver who has been dead since before you were born." },
    26:{ code:"UNW", e:"🏗️", n:"The Tower With No Charter", mt:"Unwrit", draw:"blokk",
        joke:"Six floors up and the parchment says \"garden wall\". Everyone has noticed. Nobody has written it down." },
    27:{ code:"LDG", e:"🏠", n:"Your Mate's Lodge", mt:"Thane's Favour", draw:"maisonette",
        joke:"He will do you a price. The price is the market price. He will still want to be thanked for it." },
    28:{ code:"LEY", e:"🔮", n:"The Ley Tap", mt:"Wickstone", draw:"generatur",
        joke:"It hums back on eleven seconds after the wards fail, which is exactly ten seconds after everyone has started shouting." },
    29:{ code:"SKY", e:"🌅", n:"Skyloft, Cloud Views", mt:"Highperch", draw:"penthouse",
        joke:"The cloud view is real. It is nine centimetres wide, it is between two other towers, and a guild is building over it in spring." },
    30:{ code:"HEX", e:"🌀", n:"The Hexed Crossing", mt:"Wrongturn", draw:"junction",
        joke:"You have been in this lane for twenty minutes. It is the wrong lane. It has always been the wrong lane. That is the hex." },
    31:{ code:"SIR", e:"🧜", n:"The Siren Frontage", mt:"Lorelight", draw:"front",
        joke:"Nobody who lives in this realm can afford it, and every single one of them can tell you exactly what it went for." },
    32:{ code:"SPR", e:"🗼", n:"The Spire By The Water", mt:"Glasscrown", draw:"torri",
        joke:"Twenty-two floors of enchanted glass where a theatre used to be. Eleven people live in it. Four of them are real." },
    33:{ code:"!", e:"👑", n:"The Crown", mt:"A Decree", draw:"gvern",
        joke:"A sealed scroll with the royal wax on it, and whatever is inside is now your problem." },
    34:{ code:"VST", e:"🪟", n:"Two Rooms With A View Of The Wyrm", mt:"Twinsight", draw:"vista",
        joke:"The view is magnificent and the rooms are two. You will be showing people that view for the rest of your life." },
    35:{ code:"PRT", e:"🌟", n:"The Portal Stone", mt:"Stepfar", draw:"taxi",
        joke:"The toll is fixed. It has been fixed at a different number every single time you have used it." },
    36:{ code:"?", e:"👂", n:"Whispers", mt:"Rumours", draw:"ghajdut",
        joke:"Somebody has heard something about you and a bard is already setting it to music." },
    37:{ code:"PAL", e:"🏛️", n:"The Marble Palace", mt:"Kingsrest", draw:"palazz",
        joke:"Charter-listed, which means you may look at it, love it, pay for it, and change absolutely nothing about it." },
    38:{ code:"OBL", e:"📜", n:"The Old Obligation", mt:"Bloodwrit", draw:"cens",
        joke:"Set down in a year nobody can read, by a man who is extremely dead, and it will outlive you, your heirs and the building itself." },
    39:{ code:"KEE", e:"🕯️", n:"The Silent Keep", mt:"Nevermourn", draw:"imdina",
        joke:"Nine bedchambers behind the silent walls, and nobody has slept in it since the plague year. It is being kept. For what, nobody says." },
  }
};

const REG = { malta: MALTA, fantasy: FANTASY };
let cur = 'malta';

/* OWN PROPERTIES ONLY. This lookup is reachable from a theme id that came
   off the wire, and a bare `REG[id]` answers Object.prototype for '__proto__'
   -- an object with no squares in it, which every accessor below would then
   spend the game falling back out of. */
function get(id){
  return (typeof id === 'string' && Object.prototype.hasOwnProperty.call(REG, id))
    ? REG[id] : REG.malta;
}
/* validated before it can ever reach a selector or a URL: this id can arrive
   off the wire from another client */
const OK = /^[a-z0-9-]{1,16}$/;
function use(id){
  cur = (typeof id === 'string' && OK.test(id) &&
         Object.prototype.hasOwnProperty.call(REG, id)) ? id : 'malta';
  return cur;
}

/* the id is a URL/selector-safe word, but a THEME'S OWN STRINGS are not:
   every one of them is written into the DOM through esc() by js/kiri-ui.js,
   never with innerHTML raw. The two exceptions are `c` (a colour, which goes
   into a style attribute) and `draw` (a sprite id, which goes into a <use
   href>), so those two are checked HERE rather than trusted there. */
const COL = /^#[0-9a-fA-F]{3,8}$/;
const MARK = /^[a-z0-9@_-]{1,24}$/;

window.KIRI_THEMES = {
  register(t){ if (t && OK.test(t.id || '')) REG[t.id] = t; },
  get, use,
  current(){ return REG[cur] || MALTA; },
  currentId(){ return cur; },
  list(){ return Object.keys(REG).map(k => ({ id:k, name:REG[k].name, mt:REG[k].mt,
                                             flag:REG[k].flag, blurb:REG[k].blurb })); },
  /* every accessor falls back to malta on a miss, so a PARTIAL theme is legal
     and can never throw mid-game */
  sq(i){ const t = REG[cur] || MALTA; return (t.squares && t.squares[i]) || MALTA.squares[i] || {}; },
  group(k){ const t = REG[cur] || MALTA; return (t.groups && t.groups[k]) || MALTA.groups[k] || {}; },
  deck(k){ const t = REG[cur] || MALTA; return (t.decks && t.decks[k]) || MALTA.decks[k] || {}; },
  label(k){ const t = REG[cur] || MALTA;
            return (t.labels && t.labels[k]) || MALTA.labels[k] || ''; },
  /* a band that belongs to a TYPE rather than a group -- 'rail', 'util' */
  typeColour(k){ const t = REG[cur] || MALTA;
                 const c = (t.colours && t.colours[k]) || MALTA.colours[k] || '';
                 return COL.test(c) ? c : ''; },
  /* may this theme ask for art/ui/kiri-* ? Only the theme that owns it. */
  art(){ return !!(REG[cur] || MALTA).art; },
  /* a colour a theme supplied, or '' -- never a half-checked string in a
     style attribute */
  colour(c){ return (typeof c === 'string' && COL.test(c)) ? c : ''; },
  /* a sprite id a theme supplied, or '' */
  mark(m){ return (typeof m === 'string' && MARK.test(m)) ? m : ''; },
};

})();
