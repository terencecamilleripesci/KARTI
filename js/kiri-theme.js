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

const REG = { malta: MALTA };
let cur = 'malta';

function get(id){ return REG[id] || REG.malta; }
/* validated before it can ever reach a selector or a URL: this id can arrive
   off the wire from another client */
const OK = /^[a-z0-9-]{1,16}$/;
function use(id){ cur = (typeof id === 'string' && OK.test(id) && REG[id]) ? id : 'malta'; return cur; }

window.KIRI_THEMES = {
  register(t){ if (t && OK.test(t.id || '')) REG[t.id] = t; },
  get, use,
  current(){ return REG[cur] || MALTA; },
  currentId(){ return cur; },
  list(){ return Object.keys(REG).map(k => ({ id:k, name:REG[k].name, flag:REG[k].flag, blurb:REG[k].blurb })); },
  /* every accessor falls back to malta on a miss, so a PARTIAL theme is legal
     and can never throw mid-game */
  sq(i){ const t = REG[cur] || MALTA; return (t.squares && t.squares[i]) || MALTA.squares[i] || {}; },
  group(k){ const t = REG[cur] || MALTA; return (t.groups && t.groups[k]) || MALTA.groups[k] || {}; }
};

})();
