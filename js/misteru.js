/* ═══════════════════════════════════════════════════════════════════
   KARTI — misteru.js
   IL-MISTERU  ·  "the mystery"  ·  a Clue-style murder-mystery DEDUCTION
   game, the pure engine. Rules only: no DOM, no clock, and NO Math.random
   in this file except the one documented fresh-match seed pick (newSeed).
   The screen half is js/misteru-ui.js and follows js/erbgha-ui.js's /
   js/minhu-ui.js's runner shape: a match is (opts, seed, log), the state
   is deal() plus a replay of the log, and a rollback is cutting the log.

   THE GENRE IS PUBLIC DOMAIN, THE SKIN IS ORIGINAL. This is NOT Cluedo:
   no Hasbro names, rooms or characters. It is a Maltese comedy-noir: band
   clubs, festas, village gossip, a widow and a baron, a dagger in the
   bakery. 16 suspects, ~12 weapons, ~12 locations, and 50 hand-authored
   CASES, each a 6/6/6 scenario with its own title, victim and story.

   THE GAME (a board you walk, phone-first)
     · The SOLUTION is 1 SUSPECT + 1 WEAPON + 1 LOCATION, chosen secretly
       at the deal from the current case's sets and set ASIDE (nobody's
       hand). The other 15 cards (5 suspects + 5 weapons + 5 locations)
       are shuffled and dealt round-robin to the 2..6 players.
     · A TURN: ROLL the die, MOVE up to that many squares, then SUGGEST or
       PASS. A SUGGESTION is a (suspect, weapon, location) triple from the
       case sets and its LOCATION must be the room the suggester is
       STANDING IN — that one rule is what makes the board matter at all:
       to ask a question about a room you have to walk to it, and everyone
       watching learns something from where you chose to walk. Going
       CLOCKWISE from the suggester, the FIRST player who holds ANY one of
       the three cards must privately REVEAL ONE of them to the suggester.
       Only the suggester learns WHICH card; everyone sees THAT a card was
       shown and BY WHOM. That is the whole information engine.
     · Optionally on your turn you make ONE ACCUSATION (suspect+weapon+
       location). Checked vs the hidden solution: RIGHT → you WIN and the
       solution is revealed; WRONG → you are OUT (you keep refuting others'
       suggestions with your cards, but can never win).
     · The game ENDS when someone accuses correctly, or all-but-one players
       are OUT (the last one standing wins), or a safety TURN-CAP is hit
       (then players rank by notebook progress / cards deduced).

   ── EVERY CASE HAS ITS OWN BOARD ─────────────────────────────────────
     7 columns x 8 rows, six rooms and one connected street, and that is
     ALL that is fixed. The six rectangles, the corridor, the doors and the
     two secret passages are drawn per case by boardFor(caseId) — a pure,
     memoised function of the case id and nothing else (no Math.random, no
     clock, not st.rs), because two phones on the same case must build the
     byte-identical map or every seat is standing somewhere else. Room SLOT
     k still holds theCase(st).l[k]; what changed is where slot k IS.

     A position is ONE SMALL INTEGER per seat, 0..board.POS_MAX, which fits
     a byte on purpose so it can ride the wire without inventing a field
     type: 0..5 is "inside room slot k", 6..5+C is CORR[p-6], that board's
     frozen row-major list of corridor cells. C is 14..30, so POS_MAX never
     passes 35. THE BOUND IS PER BOARD — posOK takes it — and the wire
     codec resolves the board from the caseId it is already given. A
     load-time bound would silently refuse legal squares on the roomier
     cases. Rooms hold any number of detectives; a corridor square holds
     exactly one, and an occupied corridor square can be neither entered
     nor walked THROUGH — the only way players obstruct one another, and
     why reachable() has to be a search and not arithmetic.

     Doors are DERIVED, never hand-listed: a room's doors are the corridor
     cells orthogonally touching its rectangle. A hand-written door list is
     how you end up with a "door" that is not a corridor square at all
     after somebody nudges the geometry by one row. The two secret passages
     link the two FURTHEST-APART disjoint pairs of rooms on that board,
     which is what makes one worth walking; the remaining two rooms get
     none, because a board where every room is one hop from every other is
     a board where the dice stop mattering.

   ── THE SOLUTION + THE HANDS ARE HIDDEN. READ THIS BEFORE CHANGING IT. ─
     Same problem poker/minhu have: a shared seed both phones derive from
     would let each phone compute the SOLUTION and every hand, which is the
     whole game. So the deal is NOT hard-wired to the seed online. It is
     one injectable source with two implementations and one interface —
     make(st) -> { solution:{s,w,l}|null, hands:[cards|null,…] }:

       DEAL.seed     derives the solution AND every hand from st.rs. A pure
                     random deal, used OFFLINE only: one device holds all
                     the cards and shows each player only their own hand
                     behind a handover curtain (pass-the-phone) or hides
                     the AI hands (solo). NEVER back an online table with
                     it — the opponents' phones could read it off the seed.
       DEAL.private  takes what the relay delivered to THIS client:
                     st.given.hand[mySeat] (only our own hand) and, for the
                     one seat that JUDGES accusations, st.given.solution.
                     Every other hand and (for non-judges) the solution
                     stay null and unknown on this client forever, which is
                     exactly right.

     The seam is one function; everything downstream — suggestion,
     refutation, accusation, elimination, the AI, the wire — is identical
     between the two.

   ── WHO REFUTES, WHO JUDGES, AND THE TRUST THAT BUYS ─────────────────
     A refutation is truthful ABOUT A REFUTER'S OWN HAND — and online, the
     only client that knows a hand is that seat's own phone. So online, the
     refuting client picks one of the suggested cards IT HOLDS and sends
     back which card (privately, to the suggester only) plus a public "seat
     k showed a card" note. Same friendly trust every KARTI hidden-info
     game documents (declare your own word in L-Ispjun, your own death in
     Suspett, your own face-answer in Min Hu). refuteChoices() is a PURE
     function of a hand and a suggestion, so given a reveal at the end the
     whole game is VERIFIABLE: replay every refutation against the revealed
     hands and any lie shows up as a mismatch.

     An ACCUSATION is judged against the hidden SOLUTION. Offline the one
     device holds it and judges directly. Online ONE seat is the JUDGE (the
     host) — the relay hands it, and only it, the solution privately; it
     stamps right/wrong onto the accusation move and everyone replays that
     bit. The judge cannot use the solution to play better because it is
     ALSO a player with its own hand and the SAME public information; the
     UI never shows a judge the solution mid-game. At reveal, verify()
     re-checks every judgement.

   THE WIN / ELIMINATION RULES (documented, deterministic — and it always
   terminates, proved by the harness):
     · A correct accusation WINS immediately; the solution is revealed.
     · A wrong accusation ELIMINATES the accuser: still in the room to
       refute with their cards, but can never move/win again.
     · If eliminations leave exactly ONE player who can still win, that
       player WINS (nobody left to out-deduce them).
     · A safety TURN CAP (MAX_ROUNDS full rounds) forces an end so a table
       of cowards who never accuse cannot play forever; the winner is then
       whoever has deduced the most (fewest unknown solution-cards on their
       notebook, tie broken by fewest cards unseen, then by seat order).
     TERMINATION: movement broke the old one-line proof and this is the
     repaired one. `roll`, `move` and `passage` do NOT advance the turn, so
     "every move advances the turn pointer" is simply false now. What holds
     it up instead is two latches, and they are the reason those two fields
     exist at all:
       · `st.roll` is non-zero only between a roll and the move it pays
         for, and `roll` is legal only while `st.roll === 0 && !st.moved`
         → at most ONE roll per seat-turn.
       · `st.moved` latches true on the first `move`/`passage` and is
         cleared ONLY by advance() → at most ONE of those per seat-turn.
     So a seat-turn is at most two non-advancing moves plus the one that
     ends it. The turn still advances only on a suggestion, a pass, or a
     wrong accusation; a wrong accusation also reduces the live count and a
     right one ends the game outright. And legal() ALWAYS offers `pass` on
     your turn — in particular once `st.moved` is true — so a seat that has
     rolled, moved, and finds itself standing in a corridor with nothing to
     suggest can never sit there and stall the table. The round counter
     increases every full lap and MAX_ROUNDS caps it. So the total number
     of moves is bounded by 3 * MAX_ROUNDS * SEATS + (wrong accusations ≤
     SEATS). QED, and the harness re-proves it over 200 seeded games.

   DETERMINISM
     st.rs is the entire RNG. The DIE is rnd(st) like everything else and
     it is thrown inside apply(), never inside legal() or the UI — a die
     rolled anywhere else would give each phone a different number for the
     same log entry and the table would fork on move one. The AI is a pure
     function of the state (its "randomness" is a hash of the position,
     never a clock, never Math.random), so every phone replays every move
     to the identical table. The one Math.random is newSeed() for a
     brand-new local match.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ═══════════════════════════════════════════════════════════════════
   THE SHARED UNIVERSE — the pools every case draws from. A card is a
   plain id string; its CATEGORY ('s'|'w'|'l') is known from which pool it
   lives in. Names are {en,mt} pairs (lang.js rule 3): the UI renders the
   pair, never the id. Portraits for suspects load from art/misteru/<id>.png
   with a drawn vector fallback in the UI, so the game is 100% playable
   with no art at all (same technique as js/minhu-ui.js).
   ═══════════════════════════════════════════════════════════════════ */

/* 16 SUSPECTS — a Maltese village cast. */
const SUSPECTS = [
  { id:'surmast',     name:{ en:'Bandmaster Grech',   mt:'Is-Surmast Grech'    } },
  { id:'kappillan',   name:{ en:'Fr. Kappillan',      mt:'Il-Kappillan'        } },
  { id:'sinjura',     name:{ en:'The Widow Camilleri', mt:'Is-Sinjura Camilleri'} },
  { id:'baruni',      name:{ en:'The Baron',          mt:'Il-Baruni'           } },
  { id:'caqquf',      name:{ en:'Ċaqquf the Handyman', mt:'Ċaqquf tal-Bricks'  } },
  { id:'tabib',       name:{ en:'Dr. Tabib',          mt:'It-Tabib'            } },
  { id:'kaptan',      name:{ en:'Captain Xlokk',      mt:'Il-Kaptan Xlokk'     } },
  { id:'kuntessa',    name:{ en:'The Countess',       mt:'Il-Kuntessa'         } },
  { id:'avukat',      name:{ en:'Dr. Avukat',         mt:'L-Avukat'            } },
  { id:'zeffiena',    name:{ en:'Rożi the Dancer',    mt:'Rożi ż-Żeffiena'     } },
  { id:'gardinar',    name:{ en:'The Gardener',       mt:'Il-Ġardinar'         } },
  { id:'sajjied',     name:{ en:'Salvu the Fisherman', mt:'Salvu s-Sajjied'    } },
  { id:'professur',   name:{ en:'The Professor',      mt:'Il-Professur'        } },
  { id:'kok',         name:{ en:'Chef Ġorġ',          mt:'Il-Kok Ġorġ'         } },
  { id:'segretarja',  name:{ en:'The Secretary',      mt:'Is-Segretarja'       } },
  { id:'kummissarju', name:{ en:'The Commissioner',   mt:'Il-Kummissarju'      } }
];

/* 12 WEAPONS — themed, drawn as vector icons in the UI. */
const WEAPONS = [
  { id:'ponta',       name:{ en:'The Dagger',        mt:'Il-Ponta'            } },
  { id:'kandelabru',  name:{ en:'The Candlestick',   mt:'Il-Kandelabru'       } },
  { id:'velenu',      name:{ en:'The Poison',        mt:'Il-Velenu'           } },
  { id:'habel',       name:{ en:'The Rope',          mt:'Il-Ħabel'            } },
  { id:'pistola',     name:{ en:'The Revolver',      mt:'Il-Pistola'          } },
  { id:'imhadda',     name:{ en:'The Pillow',        mt:'L-Imħadda'           } },
  { id:'cavetta',     name:{ en:'The Wrench',        mt:'Iċ-Ċavetta Ingliża'  } },
  { id:'flixkun',     name:{ en:'The Wine Bottle',   mt:'Il-Flixkun tal-Inbid'} },
  { id:'labra',       name:{ en:'The Hatpin',        mt:'Il-Labra'            } },
  { id:'martell',     name:{ en:'The Hammer',        mt:'Il-Martell'          } },
  { id:'girlanda',    name:{ en:'The Garrotte Rope', mt:'Il-Girlanda'         } },
  { id:'petard',      name:{ en:'The Firework',      mt:'Il-Petard'           } }
];

/* 12 LOCATIONS — themed, drawn as vector icons in the UI. */
const LOCATIONS = [
  { id:'kazinbanda',  name:{ en:'The Band Club',     mt:'Il-Każin tal-Banda'  } },
  { id:'knisja',      name:{ en:'The Church',        mt:'Il-Knisja'           } },
  { id:'palazz',      name:{ en:'The Palace',        mt:'Il-Palazz'           } },
  { id:'forn',        name:{ en:'The Bakery',        mt:'Il-Forn'             } },
  { id:'jott',        name:{ en:'The Yacht',         mt:'Il-Jott'             } },
  { id:'kazinbocci',  name:{ en:'The Bocci Club',    mt:'Il-Każin tal-Boċċi'  } },
  { id:'teatru',      name:{ en:'The Theatre',       mt:'It-Teatru'           } },
  { id:'kantina',     name:{ en:'The Cellar',        mt:'Il-Kantina'          } },
  { id:'gnien',       name:{ en:'The Garden',        mt:'Il-Ġnien'            } },
  { id:'katakombi',   name:{ en:'The Catacombs',     mt:'Il-Katakombi'        } },
  { id:'lukanda',     name:{ en:'The Hotel',         mt:'Il-Lukanda'          } },
  { id:'suq',         name:{ en:'The Market',        mt:'Is-Suq'              } }
];

/* index maps — id → object, id → index within its pool */
function byId(pool){ const m = {}; pool.forEach((x, i) => { m[x.id] = { obj:x, i }; }); return m; }
const S_BY = byId(SUSPECTS), W_BY = byId(WEAPONS), L_BY = byId(LOCATIONS);
const CATS = ['s', 'w', 'l'];
const POOL = { s:SUSPECTS, w:WEAPONS, l:LOCATIONS };
const POOL_BY = { s:S_BY, w:W_BY, l:L_BY };

/* a global CARD id space: "s:<id>", "w:<id>", "l:<id>", so a hand is a
   flat list of these and the notebook rows are these. catOf/idOf split. */
function cardOf(cat, id){ return cat + ':' + id; }
function catOf(card){ return card ? card.slice(0, 1) : ''; }
function baseOf(card){ return card ? card.slice(2) : ''; }
function nameOfCard(card){
  const c = catOf(card), b = baseOf(card);
  const e = POOL_BY[c] && POOL_BY[c][b];
  return e ? e.obj.name : { en:card, mt:card };
}
function validCard(card){
  const c = catOf(card), b = baseOf(card);
  return !!(POOL_BY[c] && POOL_BY[c][b]);
}

/* ═══════════════════════════════════════════════════════════════════
   THE 50 CASES — the headline. Each case is:
     { id, title:{en,mt}, victim:{en,mt}, story:{en,mt},
       s:[6 suspect ids], w:[6 weapon ids], l:[6 location ids] }
   A case names a specific 6/6/6 selection from the pools → 216 possible
   solutions, a fresh one every deal. The harness proves each is
   well-formed (sizes 6/6/6, ids resolve, no dupes, dealable 2..6, a
   unique hidden solution per deal, and solvable by a perfect reasoner).

   Authored to be genuinely varied: different casts, settings and tones.
   ═══════════════════════════════════════════════════════════════════ */
const CASES = [
  { id:1, title:{ en:'A Death at the Band Club', mt:'Mewt fil-Każin tal-Banda' },
    victim:{ en:'Old Ġużè, the club treasurer', mt:'Iż-żiju Ġużè, it-teżorier tal-każin' },
    story:{ en:'The night before the festa, the treasurer was found cold beside the trophy cabinet — and the club\'s money was gone.',
            mt:'Il-lejl ta\' qabel il-festa, it-teżorier instab mejjet ħdejn l-armarju tat-trofej — u l-flus tal-każin sparixxew.' },
    s:['surmast','kappillan','sinjura','baruni','caqquf','avukat'],
    w:['ponta','kandelabru','velenu','habel','pistola','flixkun'],
    l:['kazinbanda','knisja','palazz','forn','kantina','teatru'] },

  { id:2, title:{ en:'The Baron\'s Last Supper', mt:'L-Aħħar Ikla tal-Baruni' },
    victim:{ en:'The Baron himself', mt:'Il-Baruni nnifsu' },
    story:{ en:'At his own banquet the Baron slumped face-first into the soup. Every guest had a reason to smile.',
            mt:'Fl-ikla tiegħu stess il-Baruni waqa\' wiċċu fis-soppa. Kull mistieden kellu raġuni jitbissem.' },
    s:['kappillan','kuntessa','avukat','tabib','kok','segretarja'],
    w:['velenu','ponta','labra','flixkun','kandelabru','martell'],
    l:['palazz','gnien','kantina','lukanda','knisja','teatru'] },

  { id:3, title:{ en:'Blood on the Yacht', mt:'Demm fuq il-Jott' },
    victim:{ en:'The regatta champion', mt:'Il-kampjun tar-regatta' },
    story:{ en:'The winning skipper never made it to the prize-giving. The tide brought back only his cap.',
            mt:'Il-kaptan rebbieħ qatt ma wasal għall-premjazzjoni. Il-marea ġabet lura biss il-beritta tiegħu.' },
    s:['kaptan','sajjied','baruni','zeffiena','kummissarju','professur'],
    w:['habel','pistola','ponta','girlanda','martell','cavetta'],
    l:['jott','suq','kantina','lukanda','katakombi','gnien'] },

  { id:4, title:{ en:'The Poisoned Pastizzi', mt:'Il-Pastizzi Velenati' },
    victim:{ en:'The health inspector', mt:'L-ispettur tas-saħħa' },
    story:{ en:'One bite from the morning batch and the inspector was face-down in the flour. The baker swears he saw nothing.',
            mt:'Gidma waħda mill-lott ta\' filgħodu u l-ispettur waqa\' fid-dqiq. Il-furnar jaħlef li ma ra xejn.' },
    s:['kok','caqquf','segretarja','tabib','gardinar','sinjura'],
    w:['velenu','labra','martell','ponta','flixkun','imhadda'],
    l:['forn','suq','kantina','knisja','lukanda','gnien'] },

  { id:5, title:{ en:'Silence in the Catacombs', mt:'Skiet fil-Katakombi' },
    victim:{ en:'The tour guide', mt:'Il-gwida turistika' },
    story:{ en:'The last torch went out and only one person walked back up the stairs. The guide was not it.',
            mt:'L-aħħar torċa ntfiet u persuna waħda biss telgħet lura mit-taraġ. Il-gwida ma kinitx hi.' },
    s:['professur','kappillan','turist_x','baruni','kuntessa','avukat'].map(x=>x==='turist_x'?'gardinar':x),
    w:['ponta','habel','kandelabru','girlanda','pistola','velenu'],
    l:['katakombi','knisja','palazz','kantina','teatru','gnien'] },

  { id:6, title:{ en:'The Festa Fireworks Murder', mt:'Il-Qtil tan-Nar tal-Festa' },
    victim:{ en:'The fireworks master', mt:'Il-mgħallem tan-nar' },
    story:{ en:'They said it was an accident in the fireworks factory. The powder burns told a different story.',
            mt:'Qalu li kien inċident fil-kamra tan-nar. Il-ħruq tal-porvli qal storja oħra.' },
    s:['caqquf','surmast','sajjied','baruni','kummissarju','kok'],
    w:['petard','pistola','martell','velenu','ponta','cavetta'],
    l:['kazinbanda','suq','kantina','katakombi','forn','gnien'] },

  { id:7, title:{ en:'The Countess and the Candlestick', mt:'Il-Kuntessa u l-Kandelabru' },
    victim:{ en:'The Countess\'s young lover', mt:'L-imħabba żagħżugħa tal-Kuntessa' },
    story:{ en:'A single candlestick was missing from the palace chapel — and so was the gardener\'s alibi.',
            mt:'Kandelabru wieħed kien nieqes mill-kappella tal-palazz — u hekk ukoll l-alibi tal-ġardinar.' },
    s:['kuntessa','gardinar','kappillan','baruni','segretarja','avukat'],
    w:['kandelabru','ponta','velenu','labra','habel','imhadda'],
    l:['palazz','knisja','gnien','kantina','lukanda','teatru'] },

  { id:8, title:{ en:'Murder at the Market', mt:'Qtil fis-Suq' },
    victim:{ en:'The pitkalija (produce dealer)', mt:'Il-pitkal tal-ħaxix' },
    story:{ en:'The Monday market opened to a crowd, a cart of oranges, and a dealer who would never haggle again.',
            mt:'Is-suq tat-Tnejn fetaħ b\'folla, karrettun larinġ, u pitkal li qatt aktar ma jġib prezz.' },
    s:['sajjied','caqquf','kok','sinjura','gardinar','kummissarju'],
    w:['ponta','martell','cavetta','habel','pistola','labra'],
    l:['suq','forn','kantina','lukanda','kazinbocci','gnien'] },

  { id:9, title:{ en:'The Theatre Ghost', mt:'Il-Fantażma tat-Teatru' },
    victim:{ en:'The leading actor', mt:'L-attur prinċipali' },
    story:{ en:'He took his final bow to thunderous applause, then fell — and did not get up for the encore.',
            mt:'Ħa l-aħħar tislima tiegħu b\'ċapċip qawwi, imbagħad waqa\' — u ma qamx għall-bis.' },
    s:['zeffiena','professur','surmast','kuntessa','avukat','segretarja'],
    w:['velenu','labra','ponta','habel','flixkun','kandelabru'],
    l:['teatru','palazz','kantina','lukanda','knisja','gnien'] },

  { id:10, title:{ en:'A Grave in the Garden', mt:'Qabar fil-Ġnien' },
    victim:{ en:'The estate\'s old caretaker', mt:'Il-kustodju anzjan tal-proprjetà' },
    story:{ en:'Fresh roses hid fresher soil. The gardener planted more than flowers that spring.',
            mt:'Ward frisk ħeba ħamrija aktar friska. Il-ġardinar ħawwel aktar minn fjuri dik ir-rebbiegħa.' },
    s:['gardinar','baruni','kuntessa','tabib','caqquf','sinjura'],
    w:['ponta','habel','velenu','martell','cavetta','girlanda'],
    l:['gnien','palazz','kantina','forn','lukanda','knisja'] },

  { id:11, title:{ en:'The Priest\'s Confession', mt:'Il-Qrar tal-Kappillan' },
    victim:{ en:'A stranger in the last pew', mt:'Barrani fl-aħħar bank' },
    story:{ en:'Someone came to confess and never left the church. The priest heard everything and says nothing.',
            mt:'Xi ħadd ġie jqerr u qatt ma ħareġ mill-knisja. Il-Kappillan sema\' kollox u ma jgħid xejn.' },
    s:['kappillan','sinjura','baruni','professur','avukat','kummissarju'],
    w:['velenu','ponta','kandelabru','habel','labra','imhadda'],
    l:['knisja','katakombi','palazz','kantina','teatru','lukanda'] },

  { id:12, title:{ en:'The Fisherman\'s Nets', mt:'Ix-Xbieki tas-Sajjied' },
    victim:{ en:'A rival boat\'s owner', mt:'Sid ta\' dgħajsa rivali' },
    story:{ en:'The two boats had feuded for years. This dawn only one came back full — of the wrong catch.',
            mt:'Iż-żewġ dgħajjes ilhom fi ġlieda snin. Dan is-sebħ waħda biss ġiet lura mimlija — bil-qabda ħażina.' },
    s:['sajjied','kaptan','caqquf','kok','kummissarju','baruni'],
    w:['habel','ponta','cavetta','girlanda','pistola','martell'],
    l:['jott','suq','kantina','lukanda','kazinbocci','forn'] },

  { id:13, title:{ en:'Death at the Bocci Club', mt:'Mewt fil-Każin tal-Boċċi' },
    victim:{ en:'The reigning bocci champion', mt:'Il-kampjun tal-boċċi' },
    story:{ en:'The final throw was perfect. The champion never saw who was standing behind the scoreboard.',
            mt:'L-aħħar tefgħa kienet perfetta. Il-kampjun qatt ma ra min kien wara t-tabellun.' },
    s:['caqquf','surmast','sajjied','avukat','kummissarju','professur'],
    w:['martell','ponta','cavetta','habel','pistola','flixkun'],
    l:['kazinbocci','kazinbanda','suq','kantina','lukanda','gnien'] },

  { id:14, title:{ en:'The Hotel Guest Who Never Left', mt:'Il-Mistieden li Qatt ma Telaq' },
    victim:{ en:'A mysterious foreign guest', mt:'Mistieden barrani misterjuż' },
    story:{ en:'Room 7\'s "Do Not Disturb" sign hung for three days. When they knocked, it was already too late.',
            mt:'Is-sinjal "Tfixkilx" tal-kamra 7 dam imdendel tlett ijiem. Meta ħabbtu, kien diġà tard wisq.' },
    s:['segretarja','kuntessa','avukat','baruni','professur','zeffiena'],
    w:['imhadda','velenu','labra','ponta','habel','flixkun'],
    l:['lukanda','palazz','kantina','teatru','knisja','gnien'] },

  { id:15, title:{ en:'The Wine Cellar Secret', mt:'Is-Sigriet tal-Kantina' },
    victim:{ en:'The vineyard owner', mt:'Sid il-vinja' },
    story:{ en:'The oldest barrel had not been opened in fifty years. It should have stayed shut.',
            mt:'L-eqdem bittija ma nfetħitx għal ħamsin sena. Kien imissha baqgħet magħluqa.' },
    s:['baruni','kok','caqquf','tabib','gardinar','avukat'],
    w:['flixkun','velenu','ponta','martell','habel','kandelabru'],
    l:['kantina','palazz','forn','gnien','lukanda','knisja'] },

  { id:16, title:{ en:'The Doctor\'s Note', mt:'Iċ-Ċertifikat tat-Tabib' },
    victim:{ en:'A patient who knew too much', mt:'Pazjent li kien jaf wisq' },
    story:{ en:'The death certificate said "natural causes." The handwriting said the doctor was nervous.',
            mt:'Iċ-ċertifikat tal-mewt qal "kawżi naturali." Il-kitba qalet li t-tabib kien nervuż.' },
    s:['tabib','sinjura','avukat','kuntessa','professur','segretarja'],
    w:['velenu','labra','imhadda','ponta','flixkun','pistola'],
    l:['klinika_x','palazz','lukanda','kantina','knisja','gnien'].map(x=>x==='klinika_x'?'lukanda':x)
       .filter((v,i,a)=>a.indexOf(v)===i).concat(['teatru']).slice(0,6),
    _fix:true },

  { id:17, title:{ en:'The Handyman\'s Toolbox', mt:'Il-Kaxxa tal-Għodda ta\' Ċaqquf' },
    victim:{ en:'The property developer', mt:'L-iżviluppatur' },
    story:{ en:'Everyone wanted the old house saved except one man with a permit. Now nobody will build there.',
            mt:'Kulħadd ried id-dar il-qadima ssalvata ħlief raġel wieħed b\'permess. Issa ħadd mhu se jibni hemm.' },
    s:['caqquf','baruni','kummissarju','avukat','sinjura','gardinar'],
    w:['cavetta','martell','ponta','habel','pistola','girlanda'],
    l:['palazz','suq','kantina','forn','lukanda','gnien'] },

  { id:18, title:{ en:'The Secretary\'s Files', mt:'Il-Fajls tas-Segretarja' },
    victim:{ en:'The council chairman', mt:'Iċ-chairman tal-kunsill' },
    story:{ en:'She filed every secret in that office. One of them filed him under the floorboards.',
            mt:'Hi arkivjat kull sigriet f\'dak l-uffiċċju. Wieħed minnhom arkivjah taħt l-injam tal-art.' },
    s:['segretarja','kummissarju','avukat','baruni','professur','kuntessa'],
    w:['labra','velenu','ponta','habel','imhadda','pistola'],
    l:['palazz','lukanda','kantina','teatru','knisja','gnien'] },

  { id:19, title:{ en:'A Scandal at the Palace', mt:'Skandlu fil-Palazz' },
    victim:{ en:'The visiting dignitary', mt:'Id-dinjitarju li kien qed iżur' },
    story:{ en:'The chandelier lit a hundred faces at the ball. By midnight, one of them was a killer\'s.',
            mt:'Iċ-ċ-ċandelier dawwal mitt wiċċ fiż-żfin. Sa nofsillejl, wieħed minnhom kien ta\' qattiel.' },
    s:['baruni','kuntessa','zeffiena','avukat','segretarja','kappillan'],
    w:['kandelabru','velenu','ponta','labra','flixkun','habel'],
    l:['palazz','teatru','gnien','kantina','lukanda','knisja'] },

  { id:20, title:{ en:'The Professor\'s Experiment', mt:'L-Esperiment tal-Professur' },
    victim:{ en:'The lab assistant', mt:'L-assistent tal-laboratorju' },
    story:{ en:'The formula was almost finished. The assistant knew which vial was which — and that was the problem.',
            mt:'Il-formula kienet kważi lesta. L-assistent kien jaf liema flixkun kien liema — u dik kienet il-problema.' },
    s:['professur','tabib','avukat','baruni','segretarja','kok'],
    w:['velenu','labra','flixkun','ponta','martell','imhadda'],
    l:['palazz','kantina','lukanda','knisja','forn','gnien'] },

  { id:21, title:{ en:'The Dancer\'s Last Waltz', mt:'L-Aħħar Valz taż-Żeffiena' },
    victim:{ en:'The theatre impresario', mt:'L-impresarju tat-teatru' },
    story:{ en:'He promised her the lead for years. On opening night she took a different kind of centre stage.',
            mt:'Ilu snin iwiegħedha l-parti prinċipali. Fil-lejl tal-ftuħ hi ħadet ċentru tal-palk differenti.' },
    s:['zeffiena','professur','kuntessa','surmast','avukat','segretarja'],
    w:['ponta','labra','velenu','habel','flixkun','kandelabru'],
    l:['teatru','palazz','lukanda','kantina','knisja','gnien'] },

  { id:22, title:{ en:'The Chef\'s Special', mt:'L-Ispeċjali tal-Kok' },
    victim:{ en:'The food critic', mt:'Il-kritiku tal-ikel' },
    story:{ en:'One star or three, the review would end a career. It ended the critic instead.',
            mt:'Stilla waħda jew tlieta, ir-reċensjoni kienet ittemm karriera. Minflok temmet il-kritiku.' },
    s:['kok','baruni','sinjura','tabib','segretarja','avukat'],
    w:['velenu','ponta','flixkun','labra','martell','imhadda'],
    l:['lukanda','forn','kantina','palazz','suq','gnien'] },

  { id:23, title:{ en:'The Captain\'s Compass', mt:'Il-Boxxla tal-Kaptan' },
    victim:{ en:'The harbour master', mt:'Il-mgħallem tal-port' },
    story:{ en:'He logged every ship in and out for thirty years. One captain wanted a voyage left off the record.',
            mt:'Irreġistra kull vapur dieħel u ħiereġ għal tletin sena. Kaptan wieħed ried vjaġġ jibqa\' barra r-reġistru.' },
    s:['kaptan','sajjied','baruni','kummissarju','caqquf','avukat'],
    w:['ponta','habel','pistola','cavetta','girlanda','martell'],
    l:['jott','suq','lukanda','kantina','kazinbocci','katakombi'] },

  { id:24, title:{ en:'The Widow\'s Inheritance', mt:'Il-Wirt tas-Sinjura' },
    victim:{ en:'The estranged nephew', mt:'In-neputi mbiegħed' },
    story:{ en:'The will was to be read at noon. The nephew who stood to lose everything died at eleven.',
            mt:'It-testment kellu jinqara f\'nofsinhar. In-neputi li kien se jitlef kollox miet fil-ħdax.' },
    s:['sinjura','avukat','baruni','kuntessa','tabib','segretarja'],
    w:['velenu','labra','ponta','imhadda','flixkun','habel'],
    l:['palazz','lukanda','kantina','knisja','gnien','teatru'] },

  { id:25, title:{ en:'The Commissioner\'s Blind Eye', mt:'L-Għajn Magħluqa tal-Kummissarju' },
    victim:{ en:'The whistle-blowing clerk', mt:'L-iskrivan li tkellem' },
    story:{ en:'The clerk had a folder that could jail half the town. He was found with the folder open and empty.',
            mt:'L-iskrivan kellu fajl li seta\' jitfa\' nofs il-belt il-ħabs. Instab bil-fajl miftuħ u vojt.' },
    s:['kummissarju','avukat','baruni','segretarja','professur','caqquf'],
    w:['pistola','ponta','velenu','habel','labra','martell'],
    l:['palazz','lukanda','kantina','suq','katakombi','teatru'] },

  { id:26, title:{ en:'Murder During the Procession', mt:'Qtil waqt il-Purċissjoni' },
    victim:{ en:'The statue-bearer', mt:'Ir-reffiegħ tal-istatwa' },
    story:{ en:'The whole village followed the saint down the main street. Nobody noticed one bearer go limp.',
            mt:'Ir-raħal kollu segwa l-qaddis fit-triq prinċipali. Ħadd ma ntebaħ li reffiegħ wieħed ċeda.' },
    s:['kappillan','surmast','caqquf','baruni','sajjied','kummissarju'],
    w:['labra','ponta','velenu','martell','habel','cavetta'],
    l:['knisja','kazinbanda','suq','palazz','katakombi','kantina'] },

  { id:27, title:{ en:'The Empty Coffin', mt:'It-Tebut Vojt' },
    victim:{ en:'The gravedigger', mt:'Il-ħaddiem tal-oqbra' },
    story:{ en:'He buried the whole village and knew where every body lay. The one coffin he opened last was empty.',
            mt:'Difen ir-raħal kollu u kien jaf fejn kien kull ġisem. L-uniku tebut li fetaħ l-aħħar kien vojt.' },
    s:['gardinar','kappillan','professur','baruni','tabib','avukat'],
    w:['ponta','habel','velenu','martell','girlanda','labra'],
    l:['katakombi','knisja','gnien','kantina','palazz','lukanda'] },

  { id:28, title:{ en:'The Wrench in the Works', mt:'Iċ-Ċavetta fil-Magni' },
    victim:{ en:'The factory foreman', mt:'Il-foreman tal-fabbrika' },
    story:{ en:'A machine that had run for forty years stopped that morning — jammed with more than a wrench.',
            mt:'Magna li ħadmet erbgħin sena waqfet dak il-għodu — imblukkata b\'aktar minn ċavetta.' },
    s:['caqquf','sajjied','kummissarju','baruni','professur','kok'],
    w:['cavetta','martell','ponta','habel','pistola','girlanda'],
    l:['forn','suq','kantina','kazinbocci','lukanda','gnien'] },

  { id:29, title:{ en:'The Lawyer\'s Loophole', mt:'It-Tikka tal-Avukat' },
    victim:{ en:'The opposing counsel', mt:'L-avukat tal-parti l-oħra' },
    story:{ en:'The trial of the decade was set for morning. The other side\'s lawyer would not be objecting.',
            mt:'Il-proċess tad-deċennju kien iffissat għal filgħodu. L-avukat tal-parti l-oħra ma kienx se joġġezzjona.' },
    s:['avukat','baruni','kummissarju','segretarja','professur','sinjura'],
    w:['velenu','ponta','labra','pistola','habel','flixkun'],
    l:['palazz','lukanda','kantina','teatru','knisja','gnien'] },

  { id:30, title:{ en:'The Hatpin Murder', mt:'Il-Qtil bil-Labra' },
    victim:{ en:'The milliner\'s wealthy client', mt:'Il-klijent għani tal-kappelli' },
    story:{ en:'A single pin, placed just so, and the richest woman in town simply nodded off forever.',
            mt:'Labra waħda, imqiegħda sew, u l-aktar mara sinjura fir-raħal sempliċiment raqdet għal dejjem.' },
    s:['sinjura','kuntessa','segretarja','zeffiena','avukat','tabib'],
    w:['labra','velenu','ponta','imhadda','flixkun','kandelabru'],
    l:['palazz','lukanda','teatru','kantina','knisja','gnien'] },

  { id:31, title:{ en:'Trouble at the Regatta', mt:'Inkwiet fir-Regatta' },
    victim:{ en:'The betting bookmaker', mt:'Il-bukmejker tal-imħatri' },
    story:{ en:'He knew which boat was fixed to win. The morning of the race, his ledger and his life both closed.',
            mt:'Kien jaf liema dgħajsa kienet iffissata tirbaħ. Fil-għodu tat-tellieqa, il-ktieb u ħajtu t-tnejn għalqu.' },
    s:['sajjied','kaptan','baruni','kummissarju','caqquf','kok'],
    w:['habel','pistola','ponta','martell','cavetta','girlanda'],
    l:['jott','suq','kazinbocci','kantina','lukanda','katakombi'] },

  { id:32, title:{ en:'The Bandmaster\'s Baton', mt:'Il-Bakketta tas-Surmast' },
    victim:{ en:'The first trumpet', mt:'L-ewwel trumbetta' },
    story:{ en:'A wrong note at the wrong festa can start a war. This time it started a funeral.',
            mt:'Nota żbaljata fil-festa ħażina tista\' tqajjem gwerra. Din id-darba qajmet funeral.' },
    s:['surmast','caqquf','baruni','kappillan','professur','avukat'],
    w:['ponta','kandelabru','velenu','habel','martell','flixkun'],
    l:['kazinbanda','knisja','teatru','kantina','palazz','suq'] },

  { id:33, title:{ en:'The Poisoned Chalice', mt:'Il-Kalċi Velenat' },
    victim:{ en:'The visiting bishop', mt:'L-isqof li kien qed iżur' },
    story:{ en:'The communion wine was blessed by two hands that morning. One of them was not praying.',
            mt:'L-inbid tat-tqarbin kien imbierek minn żewġ idejn dak il-għodu. Waħda minnhom ma kinitx titlob.' },
    s:['kappillan','baruni','kuntessa','avukat','sinjura','professur'],
    w:['velenu','flixkun','ponta','labra','kandelabru','habel'],
    l:['knisja','palazz','kantina','lukanda','katakombi','gnien'] },

  { id:34, title:{ en:'The Garden Party Gun', mt:'Il-Pistola tal-Party fil-Ġnien' },
    victim:{ en:'The retired general', mt:'Il-ġeneral irtirat' },
    story:{ en:'A garden party of a hundred guests, and one shot nobody quite heard over the band.',
            mt:'Party fil-ġnien b\'mitt mistieden, u tir wieħed li ħadd ma sema\' sew fuq il-banda.' },
    s:['baruni','kummissarju','kuntessa','avukat','professur','gardinar'],
    w:['pistola','velenu','ponta','labra','habel','flixkun'],
    l:['gnien','palazz','lukanda','teatru','kantina','knisja'] },

  { id:35, title:{ en:'Cold Case at the Cellar', mt:'Każ Kiesaħ fil-Kantina' },
    victim:{ en:'A body walled up years ago', mt:'Ġisem mibni fil-ħajt snin ilu' },
    story:{ en:'Renovating the old palace cellar, the builders found a body — and a debt everyone thought forgiven.',
            mt:'Waqt ir-renovazzjoni tal-kantina l-antika, il-bennejja sabu ġisem — u dejn li kulħadd ħaseb maħfur.' },
    s:['baruni','caqquf','avukat','kummissarju','sinjura','professur'],
    w:['girlanda','ponta','habel','martell','velenu','cavetta'],
    l:['kantina','palazz','katakombi','gnien','forn','lukanda'] },

  { id:36, title:{ en:'The Market Snitch', mt:'L-Ispija tas-Suq' },
    victim:{ en:'The informer everyone feared', mt:'L-ispija li kulħadd beża\' minnu' },
    story:{ en:'He sold whispers to whoever paid. Someone finally paid to silence him for good.',
            mt:'Kien ibigħ tqassis lil min iħallas. Xi ħadd fl-aħħar ħallas biex isikktu għal dejjem.' },
    s:['kummissarju','caqquf','sajjied','avukat','baruni','kok'],
    w:['ponta','labra','habel','pistola','martell','velenu'],
    l:['suq','kantina','lukanda','kazinbocci','forn','katakombi'] },

  { id:37, title:{ en:'The Nun\'s Riddle', mt:'L-Enigma tas-Soru' },
    victim:{ en:'The convent\'s benefactor', mt:'Il-benefattur tal-kunvent' },
    story:{ en:'He funded the whole convent and demanded gratitude. He received a very quiet thanks.',
            mt:'Iffinanzja l-kunvent kollu u talab gratitudni. Irċieva ringrazzjament kwiet ħafna.' },
    s:['kappillan','kuntessa','sinjura','baruni','avukat','tabib'],
    w:['velenu','labra','ponta','imhadda','habel','kandelabru'],
    l:['knisja','palazz','katakombi','kantina','lukanda','gnien'] },

  { id:38, title:{ en:'The Yacht Club Blackmail', mt:'Ir-Rikatt tal-Klabb tal-Jott' },
    victim:{ en:'The commodore', mt:'Il-kommodor' },
    story:{ en:'Photographs. That is what the commodore was buying back when the champagne turned bitter.',
            mt:'Ritratti. Dak li l-kommodor kien qed jixtri lura meta x-xampanja saret morra.' },
    s:['kaptan','baruni','kuntessa','avukat','zeffiena','kummissarju'],
    w:['velenu','flixkun','ponta','labra','pistola','habel'],
    l:['jott','lukanda','palazz','kantina','teatru','gnien'] },

  { id:39, title:{ en:'A Body at the Bakery', mt:'Ġisem fil-Forn' },
    victim:{ en:'The night baker', mt:'Il-furnar tal-lejl' },
    story:{ en:'The four-o\'clock loaves never rose. The night baker had risen for the last time at three.',
            mt:'Il-ħobż tal-erbgħa qatt ma għola. Il-furnar tal-lejl kien qam għall-aħħar darba fit-tlieta.' },
    s:['kok','caqquf','sajjied','baruni','gardinar','segretarja'],
    w:['martell','ponta','velenu','cavetta','habel','flixkun'],
    l:['forn','suq','kantina','lukanda','kazinbocci','gnien'] },

  { id:40, title:{ en:'The Professor\'s Rival', mt:'Ir-Rivali tal-Professur' },
    victim:{ en:'The visiting academic', mt:'L-akkademiku li kien qed iżur' },
    story:{ en:'Two men, one discovery, one name to go on the plaque. The lecture hall only needed one of them.',
            mt:'Żewġt irġiel, skoperta waħda, isem wieħed fuq il-plakka. Is-sala tal-lekċers riedet wieħed biss minnhom.' },
    s:['professur','tabib','avukat','baruni','kuntessa','segretarja'],
    w:['velenu','ponta','labra','flixkun','kandelabru','imhadda'],
    l:['teatru','palazz','lukanda','kantina','knisja','gnien'] },

  { id:41, title:{ en:'The Countess\'s Emeralds', mt:'Iż-Żmerald tal-Kuntessa' },
    victim:{ en:'The jewel appraiser', mt:'Il-perit tal-ġojjelli' },
    story:{ en:'He said the famous emeralds were paste. He did not live to write the certificate.',
            mt:'Qal li ż-żmerald famuż kienu ħġieġ. Ma għexx biex jikteb iċ-ċertifikat.' },
    s:['kuntessa','baruni','avukat','segretarja','zeffiena','sinjura'],
    w:['labra','velenu','ponta','habel','flixkun','pistola'],
    l:['palazz','lukanda','teatru','kantina','knisja','gnien'] },

  { id:42, title:{ en:'The Handyman\'s Revenge', mt:'Il-Vendetta ta\' Ċaqquf' },
    victim:{ en:'The man who never paid', mt:'Ir-raġel li qatt ma ħallas' },
    story:{ en:'Twenty jobs and not a cent paid. On the twenty-first, Ċaqquf came to collect in full.',
            mt:'Għoxrin xogħol u lanqas ċenteżmu mħallas. Fil-wieħed u għoxrin, Ċaqquf ġie jiġbor kollox.' },
    s:['caqquf','baruni','kummissarju','avukat','kok','sajjied'],
    w:['martell','cavetta','ponta','habel','pistola','girlanda'],
    l:['forn','suq','kantina','palazz','lukanda','kazinbocci'] },

  { id:43, title:{ en:'The Séance', mt:'Is-Sedwta' },
    victim:{ en:'The fraudulent medium', mt:'Il-medium qarrieqa' },
    story:{ en:'She promised to summon the dead. The dead, it seems, came for her instead.',
            mt:'Wiegħdet li ssejjaħ il-mejtin. Jidher li l-mejtin ġew għaliha minflok.' },
    s:['sinjura','kuntessa','professur','baruni','avukat','kappillan'],
    w:['velenu','labra','ponta','habel','kandelabru','imhadda'],
    l:['palazz','katakombi','knisja','kantina','lukanda','teatru'] },

  { id:44, title:{ en:'The Stolen Statue', mt:'L-Istatwa Misruqa' },
    victim:{ en:'The night watchman', mt:'Il-għassies tal-lejl' },
    story:{ en:'The silver saint vanished from its niche. The watchman who would have named the thief vanished too.',
            mt:'Il-qaddis tal-fidda sparixxa min-niċċa tiegħu. Il-għassies li kien isemmi l-ħalliel sparixxa wkoll.' },
    s:['caqquf','kappillan','baruni','kummissarju','gardinar','avukat'],
    w:['ponta','martell','habel','cavetta','pistola','labra'],
    l:['knisja','kazinbanda','katakombi','palazz','kantina','suq'] },

  { id:45, title:{ en:'The Doctor\'s Rounds', mt:'Il-Vista tat-Tabib' },
    victim:{ en:'The hospital administrator', mt:'L-amministratur tal-isptar' },
    story:{ en:'The night shift was quiet. Too quiet. The administrator\'s last chart was written in a shaking hand.',
            mt:'Ix-xift tal-lejl kien kwiet. Kwiet wisq. L-aħħar chart tal-amministratur inkiteb b\'id titregħad.' },
    s:['tabib','professur','avukat','sinjura','segretarja','baruni'],
    w:['velenu','labra','imhadda','ponta','flixkun','pistola'],
    l:['lukanda','palazz','kantina','knisja','teatru','gnien'] },

  { id:46, title:{ en:'The Ferry Vanishing', mt:'L-Għajbien tal-Vapur' },
    victim:{ en:'A passenger with no ticket', mt:'Passiġġier bla biljett' },
    story:{ en:'He boarded the last ferry and never disembarked. The captain swears the manifest was correct.',
            mt:'Tela\' fl-aħħar vapur u qatt ma niżel. Il-kaptan jaħlef li l-manifest kien tajjeb.' },
    s:['kaptan','sajjied','baruni','kummissarju','professur','avukat'],
    w:['habel','ponta','pistola','girlanda','martell','velenu'],
    l:['jott','suq','lukanda','kantina','katakombi','kazinbocci'] },

  { id:47, title:{ en:'The Opera Box Murder', mt:'Il-Qtil fil-Loġġa' },
    victim:{ en:'The retired diva', mt:'Id-diva rtirata' },
    story:{ en:'From her private box she had watched every performance for forty years. Tonight she watched her last.',
            mt:'Mil-loġġa privata tagħha rat kull spettaklu għal erbgħin sena. Illejla rat l-aħħar tagħha.' },
    s:['zeffiena','kuntessa','professur','avukat','surmast','segretarja'],
    w:['labra','velenu','ponta','habel','flixkun','kandelabru'],
    l:['teatru','palazz','lukanda','kantina','knisja','gnien'] },

  { id:48, title:{ en:'The Bandmaster\'s Debt', mt:'Id-Dejn tas-Surmast' },
    victim:{ en:'The loan shark', mt:'L-użuraj' },
    story:{ en:'The band needed new instruments. The loan shark needed paying. Only one of those problems got solved.',
            mt:'Il-banda kellha bżonn strumenti ġodda. L-użuraj kellu bżonn jitħallas. Waħda biss minn dawk il-problemi ġiet solvuta.' },
    s:['surmast','caqquf','baruni','kummissarju','kok','sajjied'],
    w:['ponta','habel','pistola','martell','girlanda','cavetta'],
    l:['kazinbanda','kazinbocci','suq','kantina','lukanda','forn'] },

  { id:49, title:{ en:'The Widow\'s Third Husband', mt:'It-Tielet Raġel tas-Sinjura' },
    victim:{ en:'Husband number three', mt:'Ir-raġel numru tlieta' },
    story:{ en:'Two husbands had died of "bad hearts." The third made the mistake of feeling perfectly healthy.',
            mt:'Żewġ irġiel mietu b\'"qalb ħażina." It-tielet għamel l-iżball li ħassu f\'saħħtu perfettament.' },
    s:['sinjura','tabib','avukat','baruni','kuntessa','kok'],
    w:['velenu','labra','imhadda','ponta','flixkun','habel'],
    l:['palazz','lukanda','kantina','knisja','forn','gnien'] },

  { id:50, title:{ en:'The Commissioner\'s Last Case', mt:'L-Aħħar Każ tal-Kummissarju' },
    victim:{ en:'A detective\'s old partner', mt:'Sieħeb qadim ta\' detective' },
    story:{ en:'The Commissioner had one case he never closed. Tonight the case closed him, in the cell block below.',
            mt:'Il-Kummissarju kellu każ wieħed li qatt ma għalaq. Illejla l-każ għalqu, fiċ-ċella t\'isfel.' },
    s:['kummissarju','avukat','baruni','professur','segretarja','caqquf'],
    w:['pistola','ponta','velenu','habel','labra','martell'],
    l:['palazz','katakombi','kantina','lukanda','teatru','suq'] }
];

/* clean up the two "_fix" hand-adjusted cases so they are plain 6/6/6.
   (Cases 5 & 16 used tiny inline expressions to keep authoring readable;
   normalise them to real arrays here so the data table is uniform.) */
(function normaliseCases(){
  CASES.forEach(cs => {
    // de-dupe defensively and clamp to 6 while preserving order
    ['s','w','l'].forEach(cat => {
      const seen = {}, out = [];
      (cs[cat] || []).forEach(id => { if (!seen[id]){ seen[id] = 1; out.push(id); } });
      cs[cat] = out.slice(0, 6);
    });
    delete cs._fix;
  });
})();
const CASE_BY = (() => { const m = {}; CASES.forEach(c => { m[c.id] = c; }); return m; })();
function caseOf(id){ return CASE_BY[id | 0] || CASES[0]; }

/* the full card lists for a case, as global card ids "s:x"/"w:x"/"l:x" */
function caseCards(cs){
  const out = [];
  cs.s.forEach(id => out.push(cardOf('s', id)));
  cs.w.forEach(id => out.push(cardOf('w', id)));
  cs.l.forEach(id => out.push(cardOf('l', id)));
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   SEEDED RANDOMNESS — the whole RNG state is st.rs (minhu/poker's).
   ═══════════════════════════════════════════════════════════════════ */
function rnd(st){
  st.rs = (st.rs + 0x6D2B79F5) | 0;
  let t = st.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(st, a){
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(rnd(st) * (i + 1)) % (i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
/* the ONE Math.random this file touches: a brand-new local match choosing
   its seed. From here the seed is data and the engine is pure. */
function newSeed(){ return (Math.random() * 0x100000000) >>> 0; }

/* a tiny deterministic hash → 0..1, used by the AI (never a clock). */
function hash32(list){
  let h = 2166136261;
  for (let i = 0; i < list.length; i++){ h ^= (list[i] | 0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ═══════════════════════════════════════════════════════════════════
   THE DEAL — the injectable seam (see the header).
   make(st) -> { solution:{s,w,l}|null, hands:[cards|null,…] }
   NOTHING ELSE in this file may pick a solution or a hand.
   ═══════════════════════════════════════════════════════════════════ */
const DEAL = {
  /* (a) FROM THE SEED — offline. One device holds solution + every hand
     and shows each player only their own (handover curtain / hidden AI).
     NEVER back an online table with this. */
  seed: {
    id:'seed',
    make(st){
      const cs = caseOf(st.caseId);
      /* choose the solution: one card from each category */
      const sIdx = Math.floor(rnd(st) * cs.s.length) % cs.s.length;
      const wIdx = Math.floor(rnd(st) * cs.w.length) % cs.w.length;
      const lIdx = Math.floor(rnd(st) * cs.l.length) % cs.l.length;
      const solution = {
        s: cardOf('s', cs.s[sIdx]),
        w: cardOf('w', cs.w[wIdx]),
        l: cardOf('l', cs.l[lIdx])
      };
      /* the remaining 15 cards, shuffled and dealt round-robin */
      const rest = caseCards(cs).filter(c => c !== solution.s && c !== solution.w && c !== solution.l);
      shuffle(st, rest);
      const hands = [];
      for (let i = 0; i < st.n; i++) hands.push([]);
      rest.forEach((c, i) => { hands[i % st.n].push(c); });
      return { solution, hands };
    }
  },
  /* (b) PER-SEAT DELIVERY — online. st.given is what the relay told THIS
     client: given.hand = { seatIndex: [cards] } (only our own seat), and
     given.solution = {s,w,l} for the ONE seat that JUDGES (the host).
     Every hand we were not told is null, and non-judges get solution null. */
  private: {
    id:'private',
    make(st){
      const g = st.given || {};
      const handMap = g.hand || {};
      const hands = [];
      for (let i = 0; i < st.n; i++){
        const h = handMap[i];
        hands.push(Array.isArray(h) ? h.filter(validCard) : null);
      }
      let solution = null;
      const sol = g.solution;
      if (sol && validCard(sol.s) && validCard(sol.w) && validCard(sol.l))
        solution = { s:sol.s, w:sol.w, l:sol.l };
      return { solution, hands };
    }
  }
};
const dealSourceOf = st => DEAL[st.deal] || DEAL.seed;

/* ═══════════════════════════════════════════════════════════════════
   THE TABLE
   opts: { humans, players, lvl, caseId, deal, given }
     humans   how many human seats (rest are AI): 1 = solo, players = pnp
     players  seat count 2..6
     lvl      AI sharpness 1..3 (per-seat overridable)
     caseId   which of the 50 cases (1..50)
     deal     'seed' (offline) | 'private' (online)
     given    { hand:{seatIndex:[cards]}, solution:{s,w,l} } — private inbox
   ═══════════════════════════════════════════════════════════════════ */
const MIN_SEATS = 2, MAX_SEATS = 6;
const MAX_ROUNDS = 40;      /* safety turn-cap: full laps before a forced end */

/* ═══════════════════════════════════════════════════════════════════
   THE BOARD — 7 x 8, six rooms, AND A DIFFERENT LAYOUT FOR EVERY CASE.

   It used to be one fixed map with fifty sets of labels. It is now
   boardFor(caseId): a PURE function of the case id — no Math.random, no
   clock, no st.rs — memoised, so a board is built once and reused. Two
   phones on the same case must build the byte-identical map or every seat
   on the table is standing somewhere else; that is the whole reason this
   is a function of the case id and of nothing else.

   HOW IT DRAWS ONE. Not by hand and not by rejection-sampling blind:

     1. PLACES — every axis-aligned rectangle of an allowed room shape at
        every position on the grid, each carrying two bitmasks: the cells
        it occupies, and those cells PLUS their orthogonal ring ("claim").
        Two rooms are legal together exactly when neither one's cells meet
        the other's claim — one test that catches overlap AND touching.
     2. CATALOGUE — every set of six mutually-legal rectangles whose total
        area leaves CORR_MIN..CORR_MAX corridor squares. There are 8119 of
        them; the search is a depth-first walk in canonical order and it
        costs about a tenth of a second, once, the first time a board is
        asked for. Built lazily for that reason.
     3. THE DRAW — the catalogue is bucketed by (row signature, corridor
        count), and boardFor picks a bucket by a hashed weighted draw and
        then a member of it. Without that stratification 73% of the fifty
        cases come out on the SAME tidy three-tier arrangement, because
        that is what most of the catalogue looks like; with it, about a
        quarter do. Strata are weighted by size^0.6 — enough to favour the
        roomy buckets so two cases rarely collide, not so much that the
        rare shapes never appear.
     4. VALIDATE, then redraw. A drawn layout is only kept if its corridor
        is one connected component, every room has a door, every room can
        be walked to from every other, no room is a single door at the end
        of a dead end, and no room is a trek (see FAIR_ROOM below). Roughly
        29% of the catalogue survives, so the draw is repeated — always
        deterministically, always off the same case id — until one does.
     5. If a case id somehow cannot produce a valid board inside the bound,
        it falls back to LEGACY_ROOMS, the fixed map this game shipped
        with, and sets board.fallback so a test can catch it.

   FAIRNESS, AND A NUMBER THAT COULD NOT BE MET. The brief asked that the
   longest room-to-room walk be no more than ~2.5x the shortest. On a 7x8
   grid that is not achievable by ANY layout: exhaustively, the best ratio
   among all 4075 structurally valid six-room packings is 3.50 — which is
   exactly what the fixed board this game has always used scores (2..7).
   The shortest room-to-room walk is 2 on essentially every board (out of
   a door and straight into the room opposite), so the rule as written
   would have rejected the board we already ship. What it was actually
   protecting against — "one room being a trek" — is measured here as the
   MEAN distance from each room to the other five: FAIR_ROOM caps the
   worst room's mean at 2.0x the best room's (the fixed board scores 1.57),
   and FAIR_PAIR keeps the raw longest/shortest at 4.0x on top of it.
   ═══════════════════════════════════════════════════════════════════ */
const BOARD_W = 7, BOARD_H = 8;
const STEPS = Object.freeze([[-1, 0], [1, 0], [0, -1], [0, 1]]);

/* corridor squares: at least this many for a d6 to make sense, at most
   this many so 5 + C stays inside a byte for the wire. */
const CORR_MIN = 14, CORR_MAX = 30;
const AREA_MIN = BOARD_W * BOARD_H - CORR_MAX;   /* 26 */
const AREA_MAX = BOARD_W * BOARD_H - CORR_MIN;   /* 42 */
/* the room shapes worth drawing. Every one is at least 2x2 as the brief
   asks; the taller/wider ones exist so some cases get a hall and not six
   identical boxes. Anything bigger than 3x3 practically never survives
   validation on a grid this size, so it is not offered. */
const ROOM_SHAPES = Object.freeze([[2, 2], [2, 3], [3, 2], [2, 4], [4, 2], [3, 3]]);
/* fairness ceilings — see the note above for why these two and not 2.5 */
const FAIR_ROOM = 2.0, FAIR_PAIR = 4.0;
/* how hard the draw leans toward the crowded strata (see step 3) */
const STRATUM_BIAS = 0.6;
const BUCKET_TRIES = 16, MAX_BUCKETS = 24, GLOBAL_TRIES = 400;

/* the fixed map IL-MISTERU shipped with — now only the fallback, and the
   thing the fairness numbers above are calibrated against. */
const LEGACY_ROOMS = Object.freeze([
  Object.freeze({ r0:0, r1:1, c0:0, c1:2 }), Object.freeze({ r0:0, r1:1, c0:4, c1:6 }),
  Object.freeze({ r0:3, r1:4, c0:0, c1:2 }), Object.freeze({ r0:3, r1:4, c0:4, c1:6 }),
  Object.freeze({ r0:6, r1:7, c0:0, c1:2 }), Object.freeze({ r0:6, r1:7, c0:4, c1:6 })
]);

/* ── PLACES — every candidate rectangle, with its two bitmasks ────────
   56 cells needs two 32-bit halves; `lo/hi` are the cells the room fills,
   `clo/chi` those cells plus every orthogonally adjacent cell. Rooms a
   and b may coexist iff (a.lo & b.clo) | (a.hi & b.chi) is zero — one
   test for "does not overlap AND does not share a wall". Corner-to-corner
   contact is deliberately allowed: you still cannot walk between them,
   and forbidding it collapses the grid to a single possible layout. */
const PLACES = Object.freeze((() => {
  const out = [];
  ROOM_SHAPES.forEach(sh => {
    const h = sh[0], w = sh[1];
    for (let r = 0; r + h <= BOARD_H; r++)
      for (let c = 0; c + w <= BOARD_W; c++){
        let lo = 0, hi = 0, clo = 0, chi = 0;
        const mark = (rr, cc, own) => {
          const i = rr * BOARD_W + cc;
          if (i < 32){ if (own) lo |= (1 << i); clo |= (1 << i); }
          else { if (own) hi |= (1 << (i - 32)); chi |= (1 << (i - 32)); }
        };
        for (let rr = r; rr < r + h; rr++)
          for (let cc = c; cc < c + w; cc++){
            mark(rr, cc, true);
            for (let s = 0; s < STEPS.length; s++){
              const a = rr + STEPS[s][0], b = cc + STEPS[s][1];
              if (a >= 0 && b >= 0 && a < BOARD_H && b < BOARD_W) mark(a, b, false);
            }
          }
        out.push(Object.freeze({ r0:r, r1:r + h - 1, c0:c, c1:c + w - 1, area:h * w, lo, hi, clo, chi }));
      }
  });
  /* canonical order (top-left, then size) so the catalogue below is built
     in the same order on every device and every build. */
  out.sort((a, b) => (a.r0 * BOARD_W + a.c0) - (b.r0 * BOARD_W + b.c0) || (a.r1 - b.r1) || (a.c1 - b.c1));
  return out;
})());

/* ── THE CATALOGUE — built once, lazily, on the first board asked for ─ */
let CAT = null, CAT_KEYS = null, CAT_BUCKET = null, CAT_WEIGHT = null;
function catalogue(){
  if (CAT) return CAT;
  const cat = [], bucket = {}, keys = [];
  const cur = [];
  (function walk(start, area, blo, bhi){
    if (cur.length === 6){
      if (area < AREA_MIN || area > AREA_MAX) return;
      const at = cat.length;
      cat.push(cur.slice());
      /* the stratum: which rows the six rooms occupy, and how much street
         is left. Those two are what a player actually SEES differ. */
      const rows = cur.map(i => PLACES[i].r0 + '-' + PLACES[i].r1).sort().join('|');
      const key = rows + '@' + (BOARD_W * BOARD_H - area);
      if (!bucket[key]){ bucket[key] = []; keys.push(key); }
      bucket[key].push(at);
      return;
    }
    const need = 6 - cur.length;
    if (area + need * 4 > AREA_MAX) return;
    const cap = AREA_MAX - (need - 1) * 4 - area;
    for (let i = start; i < PLACES.length; i++){
      const m = PLACES[i];
      if (m.area > cap) continue;
      if ((m.lo & blo) || (m.hi & bhi)) continue;
      cur.push(i);
      walk(i + 1, area + m.area, blo | m.clo, bhi | m.chi);
      cur.pop();
    }
  })(0, 0, 0, 0);
  CAT = cat; CAT_BUCKET = bucket; CAT_KEYS = keys;
  CAT_WEIGHT = keys.map(k => Math.pow(bucket[k].length, STRATUM_BIAS));
  return CAT;
}

/* ── DERIVING A BOARD FROM SIX RECTANGLES ─────────────────────────────
   Everything below this line — the corridor list, the doors, the movement
   graph, the position encoding, the passages — is DERIVED from the six
   rectangles, exactly as it always was. The only thing that changed is
   that the six rectangles are now per case instead of typed out once. */
function makeBoard(caseId, rooms, fallback){
  const ROOMS = Object.freeze(rooms.map((m, k) =>
    Object.freeze({ slot:k, r0:m.r0, r1:m.r1, c0:m.c0, c1:m.c1 })));
  const roomAtRC = (r, c) => {
    for (let k = 0; k < ROOMS.length; k++){
      const m = ROOMS[k];
      if (r >= m.r0 && r <= m.r1 && c >= m.c0 && c <= m.c1) return k;
    }
    return -1;
  };
  /* CORR — every cell that is not inside a room, in ROW-MAJOR order. The
     order is part of the wire contract: a corridor square travels as its
     INDEX here, so re-ordering this list silently teleports every seat on
     every other client. */
  const CORR = Object.freeze((() => {
    const out = [];
    for (let r = 0; r < BOARD_H; r++)
      for (let c = 0; c < BOARD_W; c++)
        if (roomAtRC(r, c) < 0) out.push(Object.freeze({ r, c }));
    return out;
  })());
  const CORR_AT = Object.freeze((() => {
    const t = new Array(BOARD_W * BOARD_H).fill(-1);
    CORR.forEach((cell, i) => { t[cell.r * BOARD_W + cell.c] = i; });
    return t;
  })());
  const at = (r, c) => (r < 0 || c < 0 || r >= BOARD_H || c >= BOARD_W) ? -1 : CORR_AT[r * BOARD_W + c];
  const POS_MAX = POS_ROOM_MAX + CORR.length;
  const cPos = i => (i >= 0 && i < CORR.length) ? (i + POS_CORR_0) : -1;

  /* DOORS — derived, never typed out: a room's doors are the corridor
     cells orthogonally touching its rectangle, deduplicated and sorted so
     two builds of the same geometry produce byte-identical lists. */
  const DOORS = Object.freeze(ROOMS.map(m => {
    const out = [];
    for (let r = m.r0; r <= m.r1; r++)
      for (let c = m.c0; c <= m.c1; c++)
        for (let s = 0; s < STEPS.length; s++){
          const i = at(r + STEPS[s][0], c + STEPS[s][1]);
          if (i >= 0 && out.indexOf(i) < 0) out.push(i);
        }
    out.sort((a, b) => a - b);
    return Object.freeze(out);
  }));
  const ROOM_OF_DOOR = Object.freeze((() => {
    const t = CORR.map(() => []);
    DOORS.forEach((list, slot) => { list.forEach(i => { t[i].push(slot); }); });
    return t.map(a => Object.freeze(a));
  })());

  /* THE MOVEMENT GRAPH. NEIGH[p] = the positions one step from p, indexed
     by the SAME integer the seats are stored as. From a room: its door
     squares and nothing else. From a corridor: the adjacent corridor
     squares plus any room this square is a door of. Room -> room is
     deliberately absent; a secret passage is a MOVE, not an edge. */
  const NEIGH = Object.freeze((() => {
    const list = [];
    for (let k = 0; k <= POS_ROOM_MAX; k++) list.push(Object.freeze(DOORS[k].map(cPos)));
    CORR.forEach((cell, i) => {
      const n = [];
      for (let s = 0; s < STEPS.length; s++){
        const j = at(cell.r + STEPS[s][0], cell.c + STEPS[s][1]);
        if (j >= 0) n.push(cPos(j));
      }
      ROOM_OF_DOOR[i].forEach(slot => n.push(slot));
      list.push(Object.freeze(n));
    });
    return list;
  })());

  /* ROOM_DIST[k][p] = the fewest steps from position p into room slot k,
     or -1. One BFS out of each room over the SAME graph the movement rule
     uses, with the SAME "a room is a destination, not a junction" stop
     reachable() applies. A HEURISTIC for the AI and nothing else; built
     once WITH the board and frozen with it, because two phones must rank
     the same square identically or the machine forks. */
  const ROOM_DIST = Object.freeze(ROOMS.map((m, k) => {
    const d = new Array(POS_MAX + 1).fill(-1);
    d[k] = 0;
    const queue = [k];
    for (let qi = 0; qi < queue.length; qi++){
      const p = queue[qi];
      if (posIsRoom(p) && p !== k) continue;
      const nbrs = NEIGH[p];
      for (let i = 0; i < nbrs.length; i++){
        const q = nbrs[i];
        if (d[q] >= 0) continue;
        d[q] = d[p] + 1;
        queue.push(q);
      }
    }
    return Object.freeze(d);
  }));

  /* SECRET PASSAGES — the two FURTHEST-APART disjoint pairs of rooms on
     THIS board, which is what makes one worth taking (and what Cluedo's
     corner passages are for). Greedy over the pair distances, ties broken
     on the slot numbers so the choice is reproducible; symmetric by
     construction, because a one-way secret passage is the kind of bug you
     only find when a player walks into a room they cannot walk out of. */
  const PASSAGE = Object.freeze((() => {
    const t = [-1, -1, -1, -1, -1, -1];
    const pairs = [];
    for (let a = 0; a <= POS_ROOM_MAX; a++)
      for (let b = a + 1; b <= POS_ROOM_MAX; b++) pairs.push([a, b, ROOM_DIST[a][b]]);
    pairs.sort((x, y) => (y[2] - x[2]) || (x[0] - y[0]) || (x[1] - y[1]));
    let made = 0;
    for (let i = 0; i < pairs.length && made < 2; i++){
      const p = pairs[i];
      if (t[p[0]] >= 0 || t[p[1]] >= 0) continue;
      t[p[0]] = p[1]; t[p[1]] = p[0]; made++;
    }
    return t;
  })());

  return Object.freeze({
    caseId: caseId | 0,
    W: BOARD_W, H: BOARD_H,
    ROOMS, CORR, CORR_AT, DOORS, ROOM_OF_DOOR, NEIGH, ROOM_DIST, PASSAGE,
    CORR_N: CORR.length,
    POS_MAX,
    fallback: !!fallback
  });
}

/* ── POSITIONS — one small integer per seat ────────────────────────────
   0..5   standing IN room slot k
   6..5+C standing on CORR[p - 6] of THAT BOARD
   C is per case now, so POS_MAX is a property of the board and NOT a
   module constant, and posOK takes the board. That is not tidiness: the
   wire pass validates an incoming `to` with posOK, and a load-time bound
   would silently refuse legal destinations on every case whose board has
   more corridor squares than the old fixed twenty — a seat that cannot
   move, online, with nothing on screen to say why. CORR_MAX keeps
   5 + C <= 35, comfortably inside the byte mp.js requires. */
const POS_ROOM_MAX = 5;
const POS_CORR_0 = POS_ROOM_MAX + 1;
function posIsRoom(p){ return Number.isInteger(p) && p >= 0 && p <= POS_ROOM_MAX; }
function posRoom(p){ return posIsRoom(p) ? p : -1; }
/* every one of these takes the BOARD first. `b` may also be a STATE — one
   shape, resolved in one place — but never a bare number: a caller that
   forgot to pass the board must fail loudly, not be read as a case id. */
function asBoard(b){
  if (!b || typeof b !== 'object') throw new TypeError('misteru: board expected, got ' + typeof b);
  return b.CORR ? b : boardFor(b.caseId);
}
function posCorr(b, p){
  const B = asBoard(b);
  return (Number.isInteger(p) && p >= POS_CORR_0 && p <= B.POS_MAX) ? (p - POS_CORR_0) : -1;
}
function corrPos(b, i){ const B = asBoard(b); return (i >= 0 && i < B.CORR.length) ? (i + POS_CORR_0) : -1; }
function posOK(b, p){ const B = asBoard(b); return Number.isInteger(p) && p >= 0 && p <= B.POS_MAX; }
function posCell(b, p){ const B = asBoard(b); const i = posCorr(B, p); return i < 0 ? null : B.CORR[i]; }
function corrIndexAt(b, r, c){
  const B = asBoard(b);
  if (r < 0 || c < 0 || r >= BOARD_H || c >= BOARD_W) return -1;
  return B.CORR_AT[r * BOARD_W + c];
}
function roomAt(b, r, c){
  const B = asBoard(b);
  for (let k = 0; k < B.ROOMS.length; k++){
    const m = B.ROOMS[k];
    if (r >= m.r0 && r <= m.r1 && c >= m.c0 && c <= m.c1) return k;
  }
  return -1;
}
function passageFrom(b, p){
  const B = asBoard(b);
  const k = posRoom(p);
  return k < 0 ? -1 : B.PASSAGE[k];
}
/* where seat i starts: spread evenly around that board's corridor ring,
   computed from MAX_SEATS (not from st.n) so seat 3 stands on the same
   square at a 2-player and a 6-player table. Deterministic, no RNG. */
function startPos(b, i){
  const B = asBoard(b);
  return corrPos(B, Math.floor((i * B.CORR.length) / MAX_SEATS) % B.CORR.length);
}

/* ── VALIDATION — reject and redraw, never hope ───────────────────────
   Returns null when the layout is fit to play on, or a short reason. */
function boardFault(B){
  const C = B.CORR.length;
  if (C < CORR_MIN || C > CORR_MAX) return 'corr:' + C;
  /* the corridor must be ONE 4-connected component — an isolated pocket is
     a square nobody can ever stand on and a room nobody can ever reach. */
  const seen = new Array(C).fill(false);
  const queue = [0];
  if (!C) return 'corr:0';
  seen[0] = true;
  let n = 0;
  for (let qi = 0; qi < queue.length; qi++){
    const cell = B.CORR[queue[qi]];
    n++;
    for (let s = 0; s < STEPS.length; s++){
      const j = corrIndexAt(B, cell.r + STEPS[s][0], cell.c + STEPS[s][1]);
      if (j >= 0 && !seen[j]){ seen[j] = true; queue.push(j); }
    }
  }
  if (n !== C) return 'split';
  for (let k = 0; k <= POS_ROOM_MAX; k++) if (!B.DOORS[k].length) return 'nodoor:' + k;
  /* one door AND that door is itself the end of a dead-end corridor: a room
     you can be shut into by one other detective standing outside it. */
  for (let k = 0; k <= POS_ROOM_MAX; k++){
    if (B.DOORS[k].length !== 1) continue;
    const cell = B.CORR[B.DOORS[k][0]];
    let deg = 0;
    for (let s = 0; s < STEPS.length; s++)
      if (corrIndexAt(B, cell.r + STEPS[s][0], cell.c + STEPS[s][1]) >= 0) deg++;
    if (deg <= 1) return 'deadend:' + k;
  }
  let mn = Infinity, mx = 0;
  const mean = [];
  for (let a = 0; a <= POS_ROOM_MAX; a++){
    let sum = 0;
    for (let b = 0; b <= POS_ROOM_MAX; b++){
      if (a === b) continue;
      const v = B.ROOM_DIST[a][b];
      if (v < 0) return 'unreachable:' + a + '-' + b;
      sum += v;
      if (a < b){ if (v < mn) mn = v; if (v > mx) mx = v; }
    }
    mean.push(sum / POS_ROOM_MAX);
  }
  const lo = Math.min.apply(null, mean), hi = Math.max.apply(null, mean);
  if (hi > FAIR_ROOM * lo) return 'trek';
  if (mx > FAIR_PAIR * mn) return 'unfair';
  return null;
}

/* ── boardFor(caseId) — the whole point. Pure, memoised, frozen ───────── */
const BOARD_MEMO = {};
function boardFor(caseId){
  const id = Math.max(1, Math.min(CASES.length, caseId | 0 || 1));
  const hit = BOARD_MEMO[id];
  if (hit) return hit;
  const cat = catalogue();
  const seed = hash32([0x4D53, id, 0x424F]);
  let board = null;
  const used = {};
  for (let b = 0; b < MAX_BUCKETS && !board; b++){
    /* pick a stratum by a hashed weighted draw, without replacement */
    let tot = 0;
    for (let i = 0; i < CAT_KEYS.length; i++) if (!used[i]) tot += CAT_WEIGHT[i];
    if (tot <= 0) break;
    let r = (hash32([seed, b, 0x57]) / 4294967296) * tot, pick = -1;
    for (let i = 0; i < CAT_KEYS.length; i++){
      if (used[i]) continue;
      r -= CAT_WEIGHT[i];
      if (r <= 0){ pick = i; break; }
    }
    if (pick < 0) for (let i = CAT_KEYS.length - 1; i >= 0; i--) if (!used[i]){ pick = i; break; }
    if (pick < 0) break;
    used[pick] = 1;
    const list = CAT_BUCKET[CAT_KEYS[pick]];
    for (let s = 0; s < BUCKET_TRIES; s++){
      const cand = makeBoard(id, cat[list[hash32([seed, b, s, 0x50]) % list.length]].map(i => PLACES[i]), false);
      if (!boardFault(cand)){ board = cand; break; }
    }
  }
  for (let s = 0; s < GLOBAL_TRIES && !board; s++){
    const cand = makeBoard(id, cat[hash32([seed, s, 0x67]) % cat.length].map(i => PLACES[i]), false);
    if (!boardFault(cand)) board = cand;
  }
  /* a case id that cannot draw a valid board inside the bound plays on the
     map this game shipped with rather than on a broken one — and says so,
     out loud, in board.fallback, so a test can catch it. */
  if (!board) board = makeBoard(id, LEGACY_ROOMS, true);
  BOARD_MEMO[id] = board;
  return board;
}
/* the one call every rule in this file makes: the board this table is on */
function boardOf(st){ return boardFor(st && st.caseId); }

/* ── THE DIE ──────────────────────────────────────────────────────────
   1..6 off st.rs, the file's ONE generator. It ADVANCES st.rs, which is
   what makes two rolls in a row differ, and it is called from apply() so
   the log replays the same faces on every phone. The `% DIE_FACES` is the
   same belt-and-braces the shuffle uses in case rnd() ever returns 1. */
const DIE_FACES = 6;
function rollFor(st){
  return 1 + (Math.floor(rnd(st) * DIE_FACES) % DIE_FACES);
}

/* the corridor squares BLOCKED for `seat`: every square another seat is
   standing on. Eliminated seats still hold their square — they are still
   in the building, refuting with their cards, and vanishing them would
   change the map the moment somebody accused wrongly. Rooms are never
   blocked; any number of detectives fit in a room. */
function blockedCorr(st, seat){
  const B = boardOf(st);
  const t = new Array(B.POS_MAX + 1).fill(false);
  const pos = st.pos || [];
  for (let i = 0; i < st.n; i++){
    if (i === seat) continue;
    const p = pos[i];
    if (posCorr(B, p) >= 0) t[p] = true;
  }
  return t;
}

/* ── reachable(st, seat) — the whole movement rule, one pure function ──
   Breadth-first from pos[seat] with a budget of st.roll steps. Every edge
   costs 1 and BFS visits each square once at its shortest distance, which
   is exactly the "no revisiting a square within one move" rule: a square
   reachable at all is reachable by a simple path of that length.

   The one thing that is NOT plain BFS: a ROOM is a destination, not a
   junction. We expand out of the square we started on even when that is a
   room, but a room we ARRIVE at is a dead end — you stop when you go in.
   Without that you could cut across the board through a doorway and the
   two middle rooms would become the fastest corridors on the map.

   Never returns the square you started on: in this genre you must move if
   you can. So an empty result genuinely means "boxed in", and legal()'s
   unconditional `pass` is what stops that from hanging the table. */
function reachable(st, seat){
  const out = [];
  if (!st || !st.pos) return out;
  const B = boardOf(st);
  const from = st.pos[seat];
  const budget = st.roll | 0;
  if (!posOK(B, from) || budget <= 0) return out;
  const blocked = blockedCorr(st, seat);
  const dist = new Array(B.POS_MAX + 1).fill(-1);
  dist[from] = 0;
  const queue = [from];
  for (let qi = 0; qi < queue.length; qi++){
    const p = queue[qi], d = dist[p];
    if (d >= budget) continue;
    if (posIsRoom(p) && p !== from) continue;     /* arrived in a room → stop */
    const nbrs = B.NEIGH[p];
    for (let k = 0; k < nbrs.length; k++){
      const q = nbrs[k];
      if (dist[q] >= 0) continue;                 /* already reached, no revisits */
      if (blocked[q]) continue;                   /* occupied corridor: no entry, no pass-through */
      dist[q] = d + 1;
      queue.push(q);
    }
  }
  for (let p = 0; p <= B.POS_MAX; p++) if (p !== from && dist[p] > 0) out.push(p);
  return out;
}

function deal(opts, seed){
  opts = opts || {};
  const n = Math.max(MIN_SEATS, Math.min(MAX_SEATS, opts.players | 0 || 4));
  const humans = Math.max(0, Math.min(n, opts.humans == null ? 1 : (opts.humans | 0)));
  const caseId = Math.max(1, Math.min(CASES.length, opts.caseId | 0 || 1));
  /* the map this case plays on — built once and memoised (see boardFor) */
  const board = boardFor(caseId);
  const st = {
    v:1, n,
    caseId,
    deal: (opts.deal === 'private') ? 'private' : 'seed',
    given: opts.given || null,
    rs: (seed == null ? 0 : (seed >>> 0)),
    turn: 0,                 /* seat whose turn it is */
    round: 0,                /* full laps completed (turn-cap counter) */
    ply: 0,                  /* total suggestion/accusation turns taken */
    seats: [],
    hands: [],               /* hands[i] = [cards] or null (unknown to us) */
    solution: null,          /* {s,w,l} or null (unknown to us) */
    out: [],                 /* out[i] = true → eliminated (wrong accusation) */
    /* THE BOARD, per seat. pos is the byte-sized position (see the board
       section); roll/moved are the two latches the termination proof in
       the header leans on — roll is the die showing for the seat to move
       (0 = has not rolled), moved is "this seat has already spent its
       one move this turn". advance() clears both, and ONLY advance(). */
    pos: [],                 /* pos[i] = position int 0..board.POS_MAX */
    roll: 0,
    moved: false,
    /* pulled[i] — set when seat i was put in a room by something other
       than its own move, so it may ask about that room without having
       walked there. Nothing sets it yet: the suggestion that drags a
       named suspect's seat into the room is a later pass. It is
       initialised and CLEARED here (on your own move) so that pass can
       land without touching replayed state shape. */
    pulled: [],
    /* the running public trace of suggestions & who showed a card */
    log2: [],
    shown: [],               /* every refutation, for verify(): {sug, by, card?} */
    accusations: [],         /* every accusation judged, for verify() */
    lastSug: null,           /* the most recent suggestion for the strip */
    lastShow: null,
    done: null               /* {winner, reason} once ended */
  };
  for (let i = 0; i < n; i++){
    const own = i < humans ? (humans === 1 ? 'me' : 'hot') : 'ai';
    st.seats.push({
      name: own === 'me' ? 'You' : own === 'hot' ? ('Player ' + (i + 1)) : ('Detective ' + (i + 1)),
      own,
      lvl: Math.max(1, Math.min(3, opts.lvl | 0 || 2))
    });
    st.out.push(false);
    st.pos.push(startPos(board, i));
    st.pulled.push(false);
  }
  const d = dealSourceOf(st).make(st);
  st.solution = d.solution;
  st.hands = d.hands;
  return st;
}

/* ── reading the table ─────────────────────────────────────────────── */
function theCase(st){ return caseOf(st.caseId); }
function handOf(st, seat){ const h = st.hands[seat]; return Array.isArray(h) ? h : null; }
function holds(st, seat, card){ const h = handOf(st, seat); return !!h && h.indexOf(card) >= 0; }
function liveSeats(st){ const out = []; for (let i = 0; i < st.n; i++) if (!st.out[i]) out.push(i); return out; }
function nextLive(st, from){
  for (let k = 1; k <= st.n; k++){
    const i = (from + k) % st.n;
    if (!st.out[i]) return i;
  }
  return -1;
}
/* whose move it is; -1 when the game is over */
function turn(st){ return st.done ? -1 : st.turn; }
function over(st){ return st.done || null; }

/* ═══════════════════════════════════════════════════════════════════
   THE REFUTATION — who must show a card, and which cards they could show.
   Clockwise from the suggester, the FIRST live player (other than the
   suggester) who holds ANY of the three suggested cards is the refuter.
   refuteChoices(hand, sug) is a PURE function: the suggested cards that
   hand holds. The refuter picks ONE (their client, online); offline the
   engine picks deterministically (first by category order) so replay is
   exact — the UI can let a human refuter choose which, recorded on the move.
   ═══════════════════════════════════════════════════════════════════ */
function sugCards(sug){ return [sug.s, sug.w, sug.l]; }
function refuteChoices(hand, sug){
  if (!hand) return [];
  const want = sugCards(sug);
  return want.filter(c => hand.indexOf(c) >= 0);
}
/* the seat that must refute a suggestion `sug` made by `by`, or -1 if
   nobody can. Skips eliminated players; a refuter may be OUT-of-turn but
   still in the room, so `out` seats CAN refute (they keep their cards). */
function refuterOf(st, by, sug){
  for (let k = 1; k < st.n; k++){
    const i = (by + k) % st.n;
    if (i === by) continue;
    const h = handOf(st, i);
    if (h === null){
      /* unknown hand (our online view of another seat) — we cannot decide
         here; the authoritative refuter is resolved by the move's stamped
         `by`/`card` fields on the wire. Return -2 to mean "unknown". */
      return -2;
    }
    if (refuteChoices(h, sug).length > 0) return i;
  }
  return -1;                    /* nobody could refute */
}

/* ═══════════════════════════════════════════════════════════════════
   MOVES
     { t:'roll' }                    throw the die. Legal once per turn,
                                     before you have moved.
     { t:'move', to }                walk to `to`, which must be one of
                                     reachable(st, seat). Spends the roll.
     { t:'passage' }                 take the corner room's secret passage.
                                     No die needed, spends your move.
     { t:'suggest', s, w, l }        the active player's suggestion. `l`
                                     MUST be the card of the room the seat
                                     is standing in. On apply, the refuter
                                     and shown card are resolved (offline)
                                     or read from the move's stamped fields
                                     (online).
     { t:'accuse',  s, w, l }        the active player's accusation. Legal
                                     at ANY point in your own turn — before
                                     rolling, after moving, either way.
                                     Judged vs the solution (offline) or by
                                     the stamped `right` bit (online judge).
     { t:'pass' }                    end the turn without suggesting. Always
                                     available on your turn; that is what
                                     keeps a boxed-in seat from stalling.
     { t:'quit' }                    walk out (forfeit; counts as OUT).
   Only the active, non-out seat may roll/move/suggest/accuse/pass; anyone
   may quit. The turn advances on suggest/pass/wrong-accuse ONLY — roll,
   move and passage all leave the turn where it is, which is the whole
   reason st.roll and st.moved exist (see the header's termination proof).
   ═══════════════════════════════════════════════════════════════════ */
function inCase(st, card){
  const cs = theCase(st);
  const c = catOf(card), b = baseOf(card);
  return (cs[c] || []).indexOf(b) >= 0;
}
function validSug(st, sug){
  return sug && catOf(sug.s) === 's' && catOf(sug.w) === 'w' && catOf(sug.l) === 'l' &&
         inCase(st, sug.s) && inCase(st, sug.w) && inCase(st, sug.l);
}
/* the LOCATION card that room slot k stands for in this case. The board is
   case-agnostic and the case is board-agnostic; this one function is the
   only join between them, and it is what the suggestion rule is checked
   against. */
function roomCard(st, slot){
  const cs = theCase(st);
  const id = (cs.l || [])[slot];
  return id ? cardOf('l', id) : null;
}
/* the room a seat is standing in, or -1 for "out in the corridor". Reads
   st.pos defensively: a state replayed from a log written before the board
   existed has no pos array, and every caller here must degrade to "not in
   a room" rather than throw mid-replay. */
function roomOfSeat(st, seat){
  const pos = st.pos || [];
  return posRoom(pos[seat]);
}

function legal(st, seat){
  if (st.done) return seat >= 0 && seat < st.n ? [{ t:'quit' }] : [];
  const out = [];
  if (seat === st.turn && !st.out[seat]){
    const cs = theCase(st);
    /* the board moves are enumerated in FULL — reachable() is the list the
       UI lights up and the AI searches, so handing back a "representative"
       destination would give both of them a worse board than the rules
       allow. The card moves stay representative: one legal suggestion and
       one accusation, because the picker is 6x6x6 and the UI builds it. */
    if (!st.moved && st.roll === 0) out.push({ t:'roll' });
    if (!st.moved && st.roll > 0)
      reachable(st, seat).forEach(to => { out.push({ t:'move', to }); });
    if (!st.moved && passageFrom(st, (st.pos || [])[seat]) >= 0) out.push({ t:'passage' });
    /* a suggestion is only a move at all when you are standing in a room,
       and then its LOCATION is forced to that room's card. */
    const room = roomOfSeat(st, seat);
    if (room >= 0)
      out.push({ t:'suggest', s:cardOf('s', cs.s[0]), w:cardOf('w', cs.w[0]), l:roomCard(st, room) });
    out.push({ t:'accuse',  s:cardOf('s', cs.s[0]), w:cardOf('w', cs.w[0]), l:cardOf('l', cs.l[0]) });
    /* pass, ALWAYS — in particular once st.moved is true. A seat that has
       rolled, moved and landed in a corridor has no suggestion available,
       and without this the turn could never end. The termination proof in
       the header depends on this line. */
    out.push({ t:'pass' });
  }
  out.push({ t:'quit' });
  return out;
}

function check(st, mv, seat){
  if (!mv) return false;
  if (mv.t === 'quit') return seat >= 0 && seat < st.n;
  if (st.done) return false;
  if (seat !== st.turn) return false;
  if (st.out[seat]) return false;
  if (mv.t === 'pass') return true;
  /* EVERY board rule is enforced here, not only in legal(). Moves arrive
     off a replayed log and (later) off the wire, where nobody has called
     legal() at all — check() is the only gate they all pass through. */
  if (mv.t === 'roll') return st.roll === 0 && !st.moved;
  if (mv.t === 'move'){
    if (st.moved || st.roll <= 0) return false;
    if (!posOK(st, mv.to)) return false;      /* strict: a string "7" is not a position */
    return reachable(st, seat).indexOf(mv.to) >= 0;
  }
  if (mv.t === 'passage') return !st.moved && passageFrom(st, (st.pos || [])[seat]) >= 0;
  if (mv.t === 'suggest'){
    if (!validSug(st, mv)) return false;
    /* the room rule: you may only ask about the room you are standing in.
       A suggestion from the corridor, or one naming a room across the
       board, is refused — that is the rule the whole board exists to
       serve, so it lives in the gate and not in the UI. */
    const room = roomOfSeat(st, seat);
    return room >= 0 && mv.l === roomCard(st, room);
  }
  if (mv.t === 'accuse') return validSug(st, mv);
  return false;
}

/* advance the turn to the next live seat, ticking the round counter and
   enforcing the turn-cap. Called at the end of a non-ending move. */
function advance(st){
  const nxt = nextLive(st, st.turn);
  if (nxt < 0){ endByLast(st); return; }
  /* a full lap completed if we wrapped past the last live seat back to the
     lowest live seat index ≤ current — count rounds by ply/n as a simple,
     replay-safe cap. */
  st.ply++;
  if (nxt <= st.turn) st.round++;
  st.turn = nxt;
  /* the ONLY place the two turn latches are cleared. Clearing them
     anywhere else (say, at the top of apply) would let one seat roll
     twice and the termination bound would go with it. */
  st.roll = 0;
  st.moved = false;
  if (st.round >= MAX_ROUNDS && !st.done) endByCap(st);
}

/* ═══════════════════════════════════════════════════════════════════
   APPLY — deterministic; the log replays through here.
   ═══════════════════════════════════════════════════════════════════ */
function apply(st, mv){
  const seat = (mv.seat != null) ? mv.seat : st.turn;
  if (mv.t === 'quit'){
    if (st.done) return;
    if (!st.out[seat]){ st.out[seat] = true; }
    st.log2.push({ seat, t:'quit' });
    /* if the quitter was to move, or only one remains, resolve */
    const live = liveSeats(st);
    if (live.length <= 1){ endByLast(st); return; }
    if (seat === st.turn) advance(st);
    return;
  }
  if (st.done) return;

  /* ── the three board moves. None of them advances the turn, and each
     re-checks its own latch: apply() is reached on replay without check()
     in front of it (js/misteru-ui.js's buildState skips a failing move but
     the wire will not be so polite), and a second roll slipping through
     here would both fork the RNG and break the termination bound.
     Deliberately NOT written into st.log2: that array is the deduction
     trace notebookFor() replays, and salting it with footsteps would make
     every reasoner walk over records it has to skip. The move log itself
     is the movement history. */
  if (mv.t === 'roll'){
    if (st.moved || st.roll !== 0) return;
    st.roll = rollFor(st);
    return;
  }
  if (mv.t === 'move'){
    if (st.moved || st.roll <= 0) return;
    if (!posOK(st, mv.to) || reachable(st, seat).indexOf(mv.to) < 0) return;
    st.pos[seat] = mv.to;
    st.moved = true;
    st.roll = 0;                 /* the die is spent, not kept for later */
    st.pulled[seat] = false;     /* you walked here yourself */
    return;
  }
  if (mv.t === 'passage'){
    const to = passageFrom(st, (st.pos || [])[seat]);
    if (st.moved || to < 0) return;
    st.pos[seat] = to;
    st.moved = true;
    /* the passage costs no dice, but it DOES cost the roll if one was
       already showing — otherwise a seat could roll, slip through the
       passage for free and still have a walk in hand. */
    st.roll = 0;
    st.pulled[seat] = false;
    return;
  }

  if (mv.t === 'pass'){
    st.log2.push({ seat, t:'pass' });
    st.lastSug = null;
    advance(st);
    return;
  }

  if (mv.t === 'suggest'){
    const sug = { s:mv.s, w:mv.w, l:mv.l };
    /* resolve the refuter + shown card. Offline (all hands known) we
       compute it; online the move carries `by` (refuter seat, -1 none) and
       `card` (the shown card, only meaningful to the suggester's client). */
    let by, card;
    if (mv.by !== undefined){
      by = mv.by | 0; if (mv.by === -1) by = -1;
      card = (typeof mv.card === 'string' && mv.card) ? mv.card : null;
    } else {
      by = refuterOf(st, seat, sug);
      if (by === -2){ by = -1; card = null; }        /* unknown view: treated as none locally */
      else if (by >= 0){
        const choices = refuteChoices(handOf(st, by), sug);
        /* deterministic pick: category order s,w,l */
        const order = [sug.s, sug.w, sug.l];
        card = order.find(c => choices.indexOf(c) >= 0) || choices[0] || null;
      } else card = null;
    }
    mv.by = by; mv.card = card || null;
    const rec = { seat, t:'suggest', s:sug.s, w:sug.w, l:sug.l, by, card: card || null };
    st.log2.push(rec);
    st.shown.push({ sug: seat, by, card: card || null });
    st.lastSug = rec;
    st.lastShow = (by >= 0) ? { by, hasCard: !!card } : null;
    advance(st);
    return;
  }

  if (mv.t === 'accuse'){
    const acc = { s:mv.s, w:mv.w, l:mv.l };
    /* judge: offline the engine holds the solution; online the JUDGE seat
       stamps `right` (0/1) which every client replays. */
    let right;
    if (st.solution){
      right = (acc.s === st.solution.s && acc.w === st.solution.w && acc.l === st.solution.l);
    } else {
      right = (mv.right === 1);
    }
    mv.right = right ? 1 : 0;
    st.accusations.push({ seat, s:acc.s, w:acc.w, l:acc.l, right: right ? 1 : 0 });
    st.log2.push({ seat, t:'accuse', s:acc.s, w:acc.w, l:acc.l, right: right ? 1 : 0 });
    st.lastSug = null;
    if (right){
      st.done = { winner: seat, reason:'solved', solution: st.solution || acc };
      return;
    }
    /* wrong: the accuser is OUT. They still refute with their cards. */
    st.out[seat] = true;
    const live = liveSeats(st);
    if (live.length === 1){ st.done = { winner: live[0], reason:'last' }; return; }
    if (live.length === 0){ st.done = { winner:-1, reason:'nobody' }; return; }
    advance(st);
    return;
  }
}

/* the two forced endings. */
function endByLast(st){
  const live = liveSeats(st);
  st.done = live.length === 1 ? { winner: live[0], reason:'last' }
          : { winner: (live[0] != null ? live[0] : -1), reason: live.length ? 'last' : 'nobody' };
}
/* turn-cap: rank the LIVE seats by deduction progress. Progress = how many
   of the three solution-cards a seat can PROVE (has eliminated all but one
   candidate in that category from what it has seen). We approximate with a
   pure notebook simulation shared by the AI (deducedCount). Tie → fewest
   unseen cards, then lowest seat index. */
function endByCap(st){
  const live = liveSeats(st);
  if (live.length === 0){ st.done = { winner:-1, reason:'nobody' }; return; }
  let best = live[0], bestKey = null;
  /* ONLINE (deal:'private') THE RANKING MUST USE PUBLIC FACTS ONLY.
     notebookFor(seat) reads THIS client's private view — its own hand, and
     (on the host) the exact shown cards — which is different on every phone,
     so ranking with it made each phone crown a different cap winner (each
     phone scored ITSELF highest: it is the only seat whose hand it can see).
     Proven by the two-client lockstep harness. Instead rank by what every
     phone witnessed identically: how many cards were SHOWN to a seat (its
     suggestions that somebody refuted — one card of intel each, and `by` is
     on the public wire), tie-broken by suggestions made, then seat order. */
  if (st.deal === 'private'){
    const shownTo = [], sugBy = [];
    for (let i = 0; i < st.n; i++){ shownTo.push(0); sugBy.push(0); }
    (st.log2 || []).forEach(rec => {
      if (rec.t !== 'suggest') return;
      if (rec.seat >= 0 && rec.seat < st.n){
        sugBy[rec.seat]++;
        if (rec.by >= 0) shownTo[rec.seat]++;
      }
    });
    live.forEach(seat => {
      const key = [shownTo[seat], sugBy[seat], -seat];
      if (bestKey === null || cmpKey(key, bestKey) > 0){ bestKey = key; best = seat; }
    });
    st.done = { winner: best, reason:'cap' };
    return;
  }
  /* OFFLINE (one device holds every hand): the richer deduction ranking. */
  live.forEach(seat => {
    const nb = notebookFor(st, seat);
    const solved = nb.solvedCats;              /* 0..3 categories pinned */
    const seen = nb.seenCount;                 /* cards this seat can see */
    const key = [solved, seen, -seat];
    if (bestKey === null || cmpKey(key, bestKey) > 0){ bestKey = key; best = seat; }
  });
  st.done = { winner: best, reason:'cap' };
}
function cmpKey(a, b){
  for (let i = 0; i < a.length; i++){ if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1; }
  return 0;
}

/* ═══════════════════════════════════════════════════════════════════
   THE NOTEBOOK / DEDUCTION MODEL — the shared reasoner. Given a seat's
   PRIVATE view (its own hand + every public suggestion/refutation it has
   witnessed), compute what it can prove. This is:
     · the engine of the turn-cap ranking,
     · the brain of the AI (it accuses only when the solution is pinned),
     · and exactly what a "perfect reasoner" would deduce — the harness
       runs it to prove every deal is solvable.

   The model per category tracks, for each card, one of:
     'has'   some player holds it (so it is NOT the solution)
     'sol'   proven to be the solution (all others in the category 'has')
     '?'     unknown
   Plus constraint sets from refutations "player k showed one of {a,b,c}".
   We run a fixpoint: (1) a card seen in a hand or shown is 'has'; (2) if a
   category has exactly one non-'has' card, it is 'sol'; (3) if a refuter
   set has all-but-one card marked 'has', the remaining one is 'has' (the
   shown card); repeat until stable. This is sound (never marks a wrong
   card) and, for a fully-dealt game, complete enough that a perfect player
   who witnesses all refutations pins the solution — proven by the harness.
   ═══════════════════════════════════════════════════════════════════ */
function notebookFor(st, seat){
  const cs = theCase(st);
  const cards = caseCards(cs);
  /* status per card: 'has' | 'sol' | '?' */
  const status = {};
  cards.forEach(c => { status[c] = '?'; });
  const myHand = handOf(st, seat);

  /* Constraints from the WITNESSED refutations. Two kinds of information:
       POSITIVE  "seat `by` holds one of {a,b,c}" (they showed a card).
                 If THIS seat was the suggester it saw the EXACT card → 'has';
                 otherwise it is a 3-card "holds-at-least-one" constraint.
       NEGATIVE  refutation runs CLOCKWISE and stops at the FIRST holder, so
                 every seat strictly BETWEEN the suggester and the refuter
                 (or, if nobody showed, every seat except the suggester)
                 holds NONE of the three suggested cards. That negative fact
                 is what makes a "nobody showed" turn so powerful: if I (or
                 anyone) can account for a suggested card in no hand, it is
                 the solution. We track a per-card "not held by seat X" set
                 and, once a card is excluded from EVERY player's hand, it is
                 the solution card for its category. */
  /* The sound model. Each non-solution card is held by EXACTLY ONE player;
     the three solution cards are held by no one. We track:
       heldBy[c]      the seat known to hold c (>=0), or undefined
       notHeldBy[c][i] true if seat i is proven NOT to hold c
     and mark a card 'has' (held by someone → not the solution) or 'sol'
     (the set-aside solution). Card uniqueness links the two: once heldBy[c]
     is known, every OTHER seat notHeldBy c. */
  const constraints = [];
  const heldBy = {};
  const notHeldBy = {};
  cards.forEach(c => { notHeldBy[c] = {}; });
  function setHeld(c, who){
    if (heldBy[c] === who) return false;
    heldBy[c] = who; status[c] = 'has';
    for (let i = 0; i < st.n; i++) if (i !== who) notHeldBy[c][i] = true;   /* uniqueness */
    return true;
  }
  function markNot(c, who){ if (notHeldBy[c][who]) return false; notHeldBy[c][who] = true; return true; }

  /* (1) my own hand → held by me */
  if (myHand) myHand.forEach(c => { setHeld(c, seat); });

  (st.log2 || []).forEach(rec => {
    if (rec.t !== 'suggest') return;
    const setCards = [rec.s, rec.w, rec.l];
    const by = rec.by;
    /* NEGATIVE: seats skipped clockwise before the refuter (or everyone but
       the suggester if nobody showed) hold none of the three. */
    for (let k = 1; k < st.n; k++){
      const i = (rec.seat + k) % st.n;
      if (i === rec.seat) break;
      if (by >= 0 && i === by) break;         /* stop at the refuter */
      setCards.forEach(c => markNot(c, i));   /* seat i showed nothing → lacks all 3 */
      if (by < 0 && k === st.n - 1) break;    /* wrapped everyone */
    }
    if (by < 0) return;                        /* nobody showed → only negatives */
    /* POSITIVE: if I know the EXACT card (I suggested it, or I refuted it),
       that card is held by `by`; else a "by holds ≥1 of the three" set. */
    if ((rec.seat === seat || by === seat) && rec.card){
      setHeld(rec.card, by);
    } else {
      constraints.push({ by, cards: setCards });
    }
  });

  /* fixpoint over the sound rules */
  let changed = true, guard = 0;
  while (changed && guard++ < 400){
    changed = false;
    /* (2) a category with exactly one card not proven 'has' → that card is
       the solution ('sol'). */
    CATS.forEach(cat => {
      const inCat = cards.filter(c => catOf(c) === cat);
      const unknown = inCat.filter(c => status[c] !== 'has' && status[c] !== 'sol');
      const anySol = inCat.some(c => status[c] === 'sol');
      if (!anySol && unknown.length === 1){ status[unknown[0]] = 'sol'; changed = true; }
    });
    /* (2b) a card proven NOT held by ANY seat is the set-aside solution. */
    cards.forEach(c => {
      if (status[c] === 'has' || status[c] === 'sol') return;
      let excludedAll = true;
      for (let i = 0; i < st.n; i++){ if (!notHeldBy[c][i]){ excludedAll = false; break; } }
      if (excludedAll){ status[c] = 'sol'; changed = true; }
    });
    /* (3) a constraint "seat `by` holds ≥1 of {a,b,c}": if all but one of
       the three are proven NOT held by `by`, then `by` holds the remaining
       one → setHeld (sound; uses per-seat facts, never global 'has'). */
    constraints.forEach(k => {
      const cand = k.cards.filter(c => !notHeldBy[c][k.by]);
      if (cand.length === 1 && heldBy[cand[0]] === undefined){
        if (setHeld(cand[0], k.by)) changed = true;
      }
    });
  }

  /* summarise */
  let solvedCats = 0;
  const solution = {};
  CATS.forEach(cat => {
    const inCat = cards.filter(c => catOf(c) === cat);
    const sol = inCat.find(c => status[c] === 'sol');
    if (sol){ solvedCats++; solution[cat] = sol; }
  });
  let seenCount = 0;
  cards.forEach(c => { if (status[c] === 'has') seenCount++; });
  return { status, solvedCats, seenCount, solution, solved: solvedCats === 3 };
}

/* ═══════════════════════════════════════════════════════════════════
   VERIFY — the anti-cheat at reveal. Given the revealed solution + hands,
   replay every refutation (the shown card must be one the refuter held AND
   one of the suggested three) and every accusation judgement (right iff it
   equals the solution). Returns { ok, lies:[…] }.
   ═══════════════════════════════════════════════════════════════════ */
function verify(st, full){
  const lies = [];
  const hands = (full && full.hands) || st.hands;
  const sol = (full && full.solution) || st.solution;
  (st.log2 || []).forEach((rec, i) => {
    if (rec.t !== 'suggest') return;
    if (rec.by < 0) return;
    const hand = hands[rec.by];
    if (!Array.isArray(hand)) return;                  /* unknown, cannot check */
    const set = [rec.s, rec.w, rec.l];
    /* the refuter must hold at least one of the set */
    const could = set.some(c => hand.indexOf(c) >= 0);
    if (!could) lies.push({ kind:'refute', index:i, by:rec.by, reason:'held none of the suggested cards' });
    if (rec.card){
      const okCard = hand.indexOf(rec.card) >= 0 && set.indexOf(rec.card) >= 0;
      if (!okCard) lies.push({ kind:'card', index:i, by:rec.by, card:rec.card });
    }
  });
  (st.accusations || []).forEach((a, i) => {
    if (!sol) return;
    const should = (a.s === sol.s && a.w === sol.w && a.l === sol.l) ? 1 : 0;
    if (should !== a.right) lies.push({ kind:'accuse', index:i, seat:a.seat, got:a.right, should });
  });
  return { ok: lies.length === 0, lies };
}

/* ═══════════════════════════════════════════════════════════════════
   THE VERDICT + NOTES
   ═══════════════════════════════════════════════════════════════════ */
function meSeat(st){
  const i = st.seats.findIndex(s => s.own === 'me' || s.own === 'hot');
  return i < 0 ? 0 : i;
}
function verdict(st, me){
  if (!st.done) return null;
  if (me == null) me = meSeat(st);
  const iWon = st.done.winner === me;
  return { tone: iWon ? 'win' : 'lose', winner: st.done.winner, reason: st.done.reason };
}
function note(st){
  if (st.done){
    const d = st.done;
    if (d.reason === 'solved') return { en:'Case solved!', mt:'Il-każ solvut!' };
    if (d.reason === 'last')   return { en:'Last detective standing.', mt:'L-aħħar detective wieqaf.' };
    if (d.reason === 'cap')    return { en:'Time\'s up — best deduction wins.', mt:'Ħin spiċċa — l-aħjar dedu​zzjoni tirbaħ.' };
    return { en:'Case closed.', mt:'Il-każ magħluq.' };
  }
  return { en:'Make a suggestion, or accuse.', mt:'Agħmel suġġeriment, jew akkuża.' };
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — three sharpnesses, and NOT ONE Math.random. On its turn
   the AI reasons with the notebook a fair player keeps (never peeks at
   the solution or another hand — its state proves it), then:
     · ACCUSES if it has pinned all three categories (certainty), or —
       at the two weaker levels only — takes an occasional STAB when two
       are pinned and the third is a guess.
     · else SUGGESTS to gain information — probing cards its view still
       calls unknown, and (to mask intent) sometimes seeding a card from
       its OWN hand.
   Where a person would waver the machine hashes the position, so it is
   replayable across phones.

   THE DIAL IS DEDUCTION. Read this before you reach for the dice or the
   footwork again. Two earlier passes tried to make the levels differ by
   how well they WALK (the DEST_WOBBLE below) and the measurement said
   they had not: lvl2 and lvl3 finished 23.4 vs 22.6 plies and won 27.8%
   vs 27.3% of a four-handed table — the same player twice. Movement
   cannot be the lever, because by construction the wobble can never
   out-bid the 550-point gap between a wanted room and a ruled-out one,
   and a detective who walks to the right room and asks the right
   question still solves the case at the same speed.
   What actually separates a good Cluedo player from an average one is
   the INFERENCES they draw from other people's refutations. So that is
   what the dial takes away — see aiView() below.

     lvl 1  Kaporal   direct facts only, and forgets some of even those;
                      wanders, stabs, and wastes most of its questions
                      naming cards out of its own hand (PROBE_OWN_P), so
                      a table of Kaporals starves itself of evidence.
     lvl 2  Surġent   direct facts only: its own hand and the cards shown
                      to IT. Cannot read other people's refutations.
     lvl 3  Spettur   the whole truth, maximal-information probes, accuses
                      the instant it is mathematically certain.
   ═══════════════════════════════════════════════════════════════════ */
const LEVELS = [
  { k:1, name:'KAPORAL', icon:'diff-1', note:{ en:'Deduces slowly and takes wild guesses.',
                                               mt:'Jiddeduċi bil-mod u jaqta\' bl-addoċċ.' } },
  { k:2, name:'SURĠENT', icon:'diff-2', note:{ en:'Reasons well and accuses when sure.',
                                               mt:'Jirraġuna sew u jakkuża meta jkun ċert.' } },
  { k:3, name:'SPETTUR', icon:'diff-3', note:{ en:'A perfect reasoner — pins it and pounces.',
                                               mt:'Raġunatur perfett — jaqbadha u jaqbeż.' } }
];
function levelOf(k){ return LEVELS.find(L => L.k === (k | 0)) || LEVELS[1]; }

function jitter(st, seat, salt){
  return (hash32([st.ply, st.round, seat, salt | 0, (handOf(st, seat) || []).length]) % 1000) / 1000;
}
/* SALTS ALREADY SPOKEN FOR in the machine — a salt reused for two
   different decisions makes those decisions the SAME coin, and the AI
   starts doing two things in lockstep for no reason a reader can see:
     11,12   the lvl1 accusation stab (go? / which card)
     21,22   the lvl2/3 suggestion mask (mask? / which owned card)
     31,32,33 the lvl1 loose probe
     70      the lvl1 "misses the secret passage" coin
     108/115/119  'l'/'s'/'w' charCodeAt, the lvl2/3 probe pick
     200..255 the per-destination wobble — DEST_SALT + the destination
             integer. It used to be 40 + the destination, which was fine
             while the board was fixed and POS_MAX was 25 (40..65). Boards
             are per case now and POS_MAX runs to 35, so that range would
             have reached 75 and COLLIDED with 70 — the passage coin and
             the wobble on square 30 would have become the same coin. Moved
             clear of every other salt, with room for the whole byte.
     300..427 aiView's MISS coin — MISS_SALT + (log2 index % SALT_SPAN),
             "did this seat register the exchange across the table?"
     440..567 aiView's FORGET coin — FORGET_SALT + (log2 index % SALT_SPAN),
             "did it hold on to its OWN question and reveal?"
             Both are whole BLOCKS, one coin per record, not one salt: a
             single salt would make a level notice every exchange or none
             of them on any given turn, which is a flicker, not a
             handicap. And they are two DIFFERENT blocks because a seat
             that forgets its own reveal exactly when it also misses
             somebody else's is one coin pretending to be two.
     600,601 the lvl2 stab (go? / which card). Deliberately NOT 11/12:
             lvl1 and lvl2 stab on different evidence and must not flip
             the same coin, or the two levels waver in lockstep.
   Add a decision, take a number that is not on this list and put it on. */

/* ═══════════════════════════════════════════════════════════════════
   aiView(st, seat, lvl) — THE MACHINE'S HANDICAPPED READ OF THE TRUTH

   notebookFor() IS THE TRUTH AND MUST STAY THE TRUTH. The human player's
   notebook screen reads it; a level setting that degraded it would be a
   bug wearing a difficulty dial's clothes. So the handicap lives here
   instead, in a notebook-SHAPED object that only think() ever sees.

   AND THERE IS STILL EXACTLY ONE REASONER. The handicap is NOT a second,
   dumber deduction engine — two engines can drift apart, one of them
   marks a card 'sol' that the other calls 'has', the AI accuses a card
   somebody is visibly holding, and it reads as bad luck rather than as a
   bug. Instead the handicap is applied to the EVIDENCE: aiView drops
   records out of the public trace and hands the SHORTER trace to the very
   same notebookFor(). Less input to one reasoner, never a second one.

   WHY THAT IS SAFE, IN ONE PARAGRAPH. Every rule in notebookFor is
   MONOTONE in the records it is given — a record can only ever add a
   markNot, a setHeld or a constraint, never retract one — so the fixpoint
   over a SUBSET of the trace is a SUBSET of the fixpoint over all of it.
   And every record we keep is a true record, so the conclusions drawn
   from them are true conclusions. degraded ⊆ truth, always: the weak
   levels know LESS than the human's notebook, never anything different
   from it. That is the property that lets the AI accuse on its own view
   without ever naming a card it has been shown.

   WHAT EACH LEVEL SEES
     lvl 3  Spettur — literally notebookFor(st, seat). Same object, no
            copy, no change. If you are reading this to find where lvl3
            was weakened: nowhere.
     lvl 2  Surġent — follows its OWN questions completely (it knows what
            it asked and what it was shown) but does not follow the whole
            table: it misses a hashed share of the exchanges between other
            players. Those exchanges are precisely what feed the two hard
            inferences — "seat k refuted, so k holds one of these three",
            and "nobody could refute that, so those cards are candidates"
            — so what Surġent loses is exactly the bookkeeping that
            separates a good Cluedo player from an average one.
     lvl 1  Kaporal — misses far more of the table AND loses a share of
            its own questions and reveals on top, so it re-asks about
            cards it has already been shown.

   THE COINS WAVER ON PURPOSE. jitter() folds in st.ply, so a level
   re-flips its attention every turn: it is not permanently blind to
   record #7, it is a detective whose recall of the evening comes and
   goes. That is why a weak level's notebook can go backwards, and why it
   asks the same question twice. It stays perfectly deterministic — same
   ply, same seat, same table, same coin on every phone.

   WHY THESE NUMBERS AND NOT THE OBVIOUS ONES. The first cut of this
   function gave lvl2 the DIRECT facts only — own hand plus cards shown to
   it, and nothing derived from anyone else's refutation at all. Measured,
   that was not a difficulty setting, it was a lobotomy: Surġent took 59
   plies to solve a table Spettur solved in 22.6, and won 0.0% of 400
   four-handed games against three Spetturs. Levels 1 and 2 became
   indistinguishable at the bottom exactly the way 2 and 3 had been
   indistinguishable at the top. The gap between "wins a quarter of the
   table" and "wins a fifth of it" is SMALL, so the dial has to be a
   share of the evidence, tuned against the numbers — not an all-or-
   nothing switch on a class of inference.
   ═══════════════════════════════════════════════════════════════════ */
const MISS_SALT   = 300;   /* 300..427 — see the salt block above */
const FORGET_SALT = 440;   /* 440..567 */
const SALT_SPAN   = 128;
/* MISS_P   — an exchange between two OTHER seats that never registers.
   FORGET_P — one of the seat's OWN questions, dropped along with the card
              it was shown for it. Its own HAND is never forgotten: a
              detective who cannot read their own cards is not playing
              badly, they are broken. */
const MISS_P   = { 1: 0.45, 2: 0.10, 3: 0 };
const FORGET_P = { 1: 0.30, 2: 0,    3: 0 };
/* THESE FOUR NUMBERS WERE MEASURED, NOT GUESSED. They are HALF the
   difficulty dial — what a level is allowed to KNOW. The other half is
   PROBE_OWN_P, down by pickProbe: what lvl1 does with what it knows. Both
   halves are needed and they are not interchangeable, because these four
   move the solo solve rate and the head-to-head win rate TOGETHER and the
   dial has to move them apart; the numbers are written out there.
   Seat 0 at the level under test against three Spetturs,
   1000+ four-handed games per point, identical seeds across arms; a fair
   share is 25% and a Spettur in seat 0 takes 29.3% because seat 0 asks
   first:
     MISS_P[1]  0.40 → 13.9%   0.45 → 12.3%   0.48 → 11.0%   0.70 → 2.8%
     MISS_P[2]  0.09 → 24.5%   0.10 → 20.5%   0.16 → 17.5%   0.40 → 10.4%
   The step between 0.09 and 0.10 is real, not a rounding edge: a table is
   a chaotic system and one missed refutation re-routes a whole game. It
   also means a point or two of any of this is sampling noise, so do not
   re-tune by eye off a 50-game run — re-run the sweep. */

function aiView(st, seat, lvl){
  lvl = Math.max(1, Math.min(3, lvl | 0 || 3));
  if (lvl >= 3) return notebookFor(st, seat);         /* Spettur: the truth */
  const miss = MISS_P[lvl] || 0, forget = FORGET_P[lvl] || 0;
  const log = st.log2 || [];
  const kept = [];
  for (let i = 0; i < log.length; i++){
    const rec = log[i];
    /* only 'suggest' records carry deduction; everything else rides along
       untouched so the trace keeps its shape for any later reader. */
    if (rec.t !== 'suggest'){ kept.push(rec); continue; }
    if (rec.seat === seat || rec.by === seat){
      if (forget && jitter(st, seat, FORGET_SALT + (i % SALT_SPAN)) < forget) continue;
    } else if (miss && jitter(st, seat, MISS_SALT + (i % SALT_SPAN)) < miss) continue;
    kept.push(rec);
  }
  if (kept.length === log.length) return notebookFor(st, seat);
  /* the SAME reasoner, given less. A shallow copy so st itself — the state
     every other phone is replaying — is never touched. */
  return notebookFor(Object.assign({}, st, { log2: kept }), seat);
}

/* ── WHAT THE MACHINE WANTS FROM THE BOARD ────────────────────────────
   A suggestion's LOCATION is forced to the room you are standing in, so
   the only way the machine can ever learn a location card is to WALK to
   that room and ask there. That single fact is the whole movement brain:
   the rooms worth walking to are the ones whose card the notebook has not
   ruled out yet, because those are the rooms that might still be the
   answer. A room already proven to be in somebody's hand can never be the
   location, so standing in it teaches nothing about WHERE.

   Candidacy is read through candidatesIn(), the same call the accusation
   stab uses. There is exactly one deduction system in this file and this
   is not allowed to become the second one. */
function wantedRooms(st, seat, nb){
  const cands = candidatesIn(st, seat, nb, 'l');
  const out = [];
  for (let k = 0; k <= POS_ROOM_MAX; k++){
    const card = roomCard(st, k);
    if (card && cands.indexOf(card) >= 0) out.push(k);
  }
  return out;
}

/* Destination scores. Absolute numbers, not an ordering, because the
   level wobble below is added ON TOP and the GAPS are what decide how
   loose a level really plays.
     WANTED room  1000  the whole point of moving
     SEEN   room   450  you may still probe a suspect and a weapon in
                        there, so it is not worthless — but it can never
                        move the location column, which is what "poor
                        (no information)" means here. Priced at the same
                        value as a corridor square about four steps from
                        a room we do want.
     corridor    500 - 12*steps-to-the-nearest-wanted-room, so a doorstep
                        (488) beats a ruled-out room and a square right
                        across the board (~310) does not.
     LOST corridor 300  no wanted room is walkable from there at all
                        (every location card ruled out, or the map cut) —
                        neutral, never preferred, never crashes. */
const DEST_ROOM_WANTED = 1000;
const DEST_ROOM_SEEN   = 450;
const DEST_CORR_BASE   = 500;
const DEST_CORR_STEP   = 12;
const DEST_CORR_LOST   = 300;
/* How much hashed noise each level adds to a score. lvl3 takes the best,
   full stop. lvl2's 60 can only ever reshuffle near-equals — it can never
   out-bid the 550-point gap between a wanted room and a ruled-out one, so
   Surġent looks human without playing badly. lvl1's 700 CAN clear that
   gap, which is the point: Kaporal genuinely wanders off to a room it has
   already crossed out, and that is why it deduces slower. */
const DEST_WOBBLE = { 1:700, 2:60, 3:0 };
/* the base of the per-destination wobble salt; see the salt list above */
const DEST_SALT = 200;

function destScore(st, want, p){
  const B = boardOf(st);
  const room = posRoom(p);
  if (room >= 0) return want.indexOf(room) >= 0 ? DEST_ROOM_WANTED : DEST_ROOM_SEEN;
  let near = -1;
  for (let i = 0; i < want.length; i++){
    const d = B.ROOM_DIST[want[i]][p];
    if (d < 0) continue;
    if (near < 0 || d < near) near = d;
  }
  if (near < 0) return DEST_CORR_LOST;
  return DEST_CORR_BASE - near * DEST_CORR_STEP;
}
/* pick one of reachable()'s destinations. `dests` comes straight from
   reachable(), so every value returned here is legal by construction —
   this function must never invent a square of its own.

   TIES BREAK ON THE LOWEST DESTINATION INTEGER, spelled out rather than
   leaned on: reachable() happens to build its list in ascending order
   today, but "the AI agrees with itself on two phones" must not rest on
   an implementation detail of a different function. Scores are multiples
   of 1/1000, so exact ties are common and the rule is load-bearing. */
function chooseDest(st, seat, nb, lvl, dests){
  const want = wantedRooms(st, seat, nb);
  const wobble = DEST_WOBBLE[lvl] || 0;
  let best = -1, bestScore = 0;
  for (let i = 0; i < dests.length; i++){
    const p = dests[i];
    if (!posOK(st, p)) continue;
    let sc = destScore(st, want, p);
    if (wobble) sc += jitter(st, seat, DEST_SALT + p) * wobble;
    if (best < 0 || sc > bestScore || (sc === bestScore && p < best)){ best = p; bestScore = sc; }
  }
  return best;
}

/* THE SECRET PASSAGE — free, no die, and it crosses the whole board, so
   the machine takes it only when it actually buys something: the room at
   the far end must still be a candidate, and we must not already be
   standing in one. Walking a passage OUT of a room we still want to ask
   about would throw away the very question we came here for.
   Kaporal misses it a fair bit of the time; that is a level difference
   you can watch happen, not a hidden number. */
function wantsPassage(st, seat, nb, lvl){
  const pos = (st.pos || [])[seat];
  const to = passageFrom(st, pos);
  if (to < 0) return false;                                    /* not in a corner room */
  const want = wantedRooms(st, seat, nb);
  if (want.indexOf(to) < 0) return false;                      /* far room proven, no information */
  const here = posRoom(pos);
  if (here >= 0 && want.indexOf(here) >= 0) return false;      /* already somewhere we want to be */
  if (lvl === 1 && jitter(st, seat, 70) < 0.4) return false;   /* Kaporal walks past the bookcase */
  return true;
}

/* ── think(st, seat, lvl) — ONE move, not a turn ───────────────────────
   A turn is now a SEQUENCE — roll -> move (or passage) -> suggest/pass —
   so think() is called several times for the same seat and has to answer
   "what next?" each time. It reads that position out of the two turn
   latches, st.roll and st.moved, and nothing else; there is no scratch
   state hidden between calls, which is what keeps it a pure function of
   the table and therefore replayable on every phone.

   EVERYTHING RETURNED HERE MUST SATISFY check(). That is the property the
   whole function is built around: js/misteru-ui.js falls back to
   {t:'pass'} on a refusal, so an illegal answer does not crash — it
   silently turns the seat into a statue and the table grinds to the
   turn-cap with nobody having asked a single question. That was the state
   of this file before this pass, and it looked like "the AI is timid",
   not like a bug. And for the same reason it must NEVER return null for a
   live seat whose turn it is; the worst answer available is {t:'pass'}. */
function think(st, seat, lvl){
  if (turn(st) !== seat || st.out[seat]) return null;
  lvl = Math.max(1, Math.min(3, lvl || st.seats[seat].lvl || 2));
  /* THE ONLY PLACE THE LEVEL TOUCHES THE DEDUCTION. Everything downstream
     — wantedRooms, chooseDest, pickProbe, candidatesIn, the stab — reads
     `nb`, so handing them a poorer view is the entire handicap: a weak
     level walks to rooms it has already been shown, asks about cards it
     has already been shown, and pins the solution later. notebookFor() is
     untouched and stays the human notebook's truth. */
  const nb = aiView(st, seat, lvl);

  /* (1) ACCUSE when certain — at every level, the instant the view pins
     all three. That is sound at every level too: aiView never marks a
     card 'sol' that notebookFor has not already agreed is unheld.
     This runs BEFORE the board machine on purpose: an accusation names a
     place, it does not require STANDING in one, so check() will take it at
     any point in the turn. Making a seat that has already solved the case
     roll, walk and only then be allowed to say so would cost it a whole
     lap — and it would hand the win to whoever solved it second. */
  if (nb.solved){
    return { t:'accuse', s:nb.solution.s, w:nb.solution.w, l:nb.solution.l };
  }

  /* (1b) THE STAB — a real gamble, and the character of the weak levels.
     It used to fire at lvl1 whenever two categories were pinned and the
     third was down to TWO candidates, on a 50/50 coin: a coin flip on a
     coin flip, right about half the times it fired. That is not an easy
     opponent, it is a lottery ticket, and it took 35.0% of a four-handed
     table against three Spetturs where a fair share is 25%.
     What is fixed here is the POSITION, not the frequency: it now fires
     with up to FIVE candidates left in the open category, so the pick is
     wrong about two times in three, and — because aiView got there first —
     it only reaches that position much later in the game.

     A NOTE FOR WHOEVER TUNES THIS NEXT, because the obvious move is
     wrong. The brief said "make it fire LESS often". Measured, that pushes
     Kaporal the wrong way. Holding the view fixed and sweeping only the
     coin, over 400 games against three Spetturs:
        coin 0.00 → 5.8% wins   0.30 → 7.0%   0.50 → 10.3%
        coin 0.80 → 12.3%       1.00 → 12.8%
     More stabbing wins MORE. That is not a bug in the stab, it is what a
     genuinely weak player is: against three perfect reasoners its honest
     game is worth about 6%, so any one-in-three gamble beats playing it
     straight. The stab stopped being a lottery win the moment the
     deduction handicap became real — and turning the coin down from here
     drops lvl1 out of the bottom of its target band, it does not weaken
     it. Weaken the VIEW, not the nerve.
     lvl3 NEVER stabs — Spettur accuses only when it is certain. */
  if (lvl <= 2 && nb.solvedCats === 2){
    const cat = CATS.find(c => !nb.solution[c]);
    const cands = cat ? candidatesIn(st, seat, nb, cat) : [];
    /* jitter() is constant across the roll/move/suggest calls of one
       seat-turn (same ply, round, seat, hand), so this is ONE decision per
       turn however many times think() is asked — not three chances. */
    const go = (lvl === 1)
      ? (cands.length >= 2 && cands.length <= 5 && jitter(st, seat, 11) < 0.80)
      : (cands.length === 2 && jitter(st, seat, 600) < 0.08);
    if (go){
      const pickSalt = (lvl === 1) ? 12 : 601;
      const pick = cands[Math.floor(jitter(st, seat, pickSalt) * cands.length) % cands.length] || cands[0];
      /* default each category to the pinned solution card, then override
         the unsolved one with the stab pick — every field is a real card. */
      const acc = {
        s: cat === 's' ? pick : nb.solution.s,
        w: cat === 'w' ? pick : nb.solution.w,
        l: cat === 'l' ? pick : nb.solution.l
      };
      if (acc.s && acc.w && acc.l) return { t:'accuse', s:acc.s, w:acc.w, l:acc.l };
    }
  }

  /* (2) NOT MOVED, NO DIE SHOWING → the top of the turn. Take the secret
     passage if it is worth taking, otherwise throw. check() takes `roll`
     only while st.roll === 0 && !st.moved, which is exactly this branch,
     and it is the latch the header's termination proof rests on: one roll
     per seat-turn, no more. */
  if (!st.moved && st.roll === 0){
    if (wantsPassage(st, seat, nb, lvl)) return { t:'passage' };
    return { t:'roll' };
  }

  /* (3) A DIE IS SHOWING AND WE HAVE NOT MOVED → walk. reachable() is the
     legal set and the ONLY legal set; chooseDest merely ranks it. An
     EMPTY set is not an error — it means every door and every corridor
     square within the roll is occupied, i.e. genuinely boxed in by other
     detectives — and the answer to that is `pass`, which legal() always
     offers. Returning nothing here, or a square we liked the look of, is
     how a table stalls. */
  if (!st.moved && st.roll > 0){
    const dests = reachable(st, seat);
    if (!dests.length) return { t:'pass' };
    const to = chooseDest(st, seat, nb, lvl, dests);
    if (!posOK(st, to)) return { t:'pass' };
    return { t:'move', to };
  }

  /* (4) WE HAVE MOVED → ask, if there is anywhere to ask from. A
     suggestion's LOCATION is not ours to choose: check() demands it be
     the card of the room this seat is standing in, so we force it below
     and let the probe logic pick only the suspect and the weapon. Landed
     in a corridor instead? Then there is no question to ask and the turn
     ends — that is what the unconditional `pass` in legal() is for. */
  const room = roomOfSeat(st, seat);
  const lCard = room >= 0 ? roomCard(st, room) : null;
  if (!lCard) return { t:'pass' };

  /* SUGGEST to gain information. For each category pick a card:
       lvl3/2: an UNKNOWN candidate (status '?') to probe — best info.
       lvl1:   usually a card out of its OWN hand, so the question buys
               it — and the table watching — nothing.
     A suggestion can only use cards in the case; if a category is already
     pinned we may still name the solution card (harmless, and it masks
     which category we still need). To mask intent, occasionally seed one
     category with a card from our OWN hand. */
  const sug = {};
  CATS.forEach(cat => {
    const probe = pickProbe(st, seat, nb, cat, lvl);
    sug[cat] = probe;
  });
  /* mask: at lvl2/3 sometimes replace one category with an owned card */
  if (lvl >= 2 && jitter(st, seat, 21) < 0.3){
    const myHand = handOf(st, seat) || [];
    if (myHand.length){
      const c = myHand[Math.floor(jitter(st, seat, 22) * myHand.length) % myHand.length];
      sug[catOf(c)] = c;
    }
  }
  /* FORCE the location LAST, after the mask — the mask picks a card out of
     our own hand and hands it to whichever category it belongs to, so a
     location card in hand would otherwise overwrite the one square the
     rule does not let us choose, and check() would refuse the whole
     suggestion. Ordering, not a condition: it costs nothing and it cannot
     be got wrong later. */
  sug.l = lCard;
  if (!sug.s || !sug.w) return { t:'pass' };   /* never hand back a half-built move */
  return { t:'suggest', s:sug.s, w:sug.w, l:sug.l };
}
/* the candidate cards in a category a seat still considers possible for
   the solution (status not 'has'). */
function candidatesIn(st, seat, nb, cat){
  const cs = theCase(st);
  const cards = (cs[cat] || []).map(id => cardOf(cat, id));
  return cards.filter(c => nb.status[c] !== 'has');
}
/* ── PROBE_OWN_P — THE SECOND HALF OF THE lvl-1 HANDICAP ──────────────
   aiView takes away what Kaporal can PROVE. This takes away what it does
   with what it has: how often it wastes its one question of the turn by
   naming a card out of its OWN hand — a card it already knows the answer
   to, so the refutation it buys teaches it, and the table, nothing.

   WHY THIS KNOB AND NOT MORE aiView. The two numbers the dial has to hit
   pull against each other and aiView moves them TOGETHER. Blinding lvl1
   harder (MISS_P[1], measured over 400 solo / 1000 head-to-head games,
   three independent seed families) barely dents the solo solve rate and
   guts the head-to-head:
       MISS_P[1]   0.35 → solo 86.5%, h2h 17.3%
                   0.45 → solo 82.3%, h2h 12.3%   (where the dial sits)
                   0.55 → solo 86.0%, h2h  9.5%
                   0.65 → solo 82.5%, h2h  3.2%
   Forgetting its OWN exchanges harder is worse still — it pushes the solo
   rate the WRONG WAY while it kills the head-to-head:
       FORGET_P[1] 0.30 → solo 82.3%, h2h 12.3%
                   0.45 → solo 85.3%, h2h 10.3%
                   0.60 → solo 86.5%, h2h  9.0%
                   0.75 → solo 81.3%, h2h  7.2%
   That is the trap the previous pass hit: a handicap harsh enough to drag
   the solo table down took the head-to-head to zero with it.

   THE SOLO NUMBER IS NOT A DEDUCTION NUMBER. Four Kaporals at one table
   end 82% of games 'solved' — but almost all of that is THE STAB landing,
   not anybody proving anything: four seats each take one ~1-in-3 gamble,
   and 1 - (2/3)^4 is about 80%. So the way to make the easy table fail to
   crack the case is to make its seats reach the stab position LATER and
   with more candidates still open, which is a question of how well they
   SPEND their turns, not of how much they are allowed to know.

   AND IT IS ASYMMETRIC, which is the whole point. A wasted question also
   starves everyone ELSE at the table of the refutation they would have
   watched. At a four-Kaporal table that is four seats starving each other
   and the case never closes. Against three Spetturs it starves the
   Spetturs too, which buys the one weak seat more turns to gamble in — so
   the head-to-head rate does not fall. Measured over three independent
   seed families, 600 solo + 1500 head-to-head games each:
       PROBE_OWN_P   solo solve            h2h win
         0.40      83.5 / 84.2 / 85.3    12.7 / 11.3 / 13.1
         0.75      75.0 / 75.7 / 75.7    12.9 / 12.3 / 13.6
         0.80      71.0 / 75.2 / 74.3    12.9 / 12.3 / 13.6
         0.85      70.3 / 71.3 / 69.7    13.0 / 13.4 / 12.8   ← here
   Targets were solo 55-75% and h2h 10-16%; 0.85 sits in the middle of
   both on every seed family, and the head-to-head is a shade HIGHER than
   it was, not lower.
   THE PRICE, SO IT IS NOT A SURPRISE LATER: an all-Kaporal table now runs
   ~65 plies instead of ~38, and 6.7% of those tables run out the
   MAX_ROUNDS cap instead of ending on an accusation. That is what "nobody
   here is good enough to close it" looks like, and it is the intended
   reading — but it is why this knob should not be pushed past 0.85. At
   1.00 the solo rate falls to 47% and a third of tables die on the cap.
   A NEARBY IDEA THAT DOES NOT WORK, so you do not spend the afternoon:
   drawing the wasted probe from every card the view has proven 'has'
   (own hand OR seen) instead of just the hand reads better but measures
   worse — at 0.80 it gives solo 79.0% for a LONGER 73.5-ply game, because
   early on there is nothing proven yet and the seat still probes well
   through the part of the game that decides it. */
const PROBE_OWN_P = 0.85;
/* pick a card to name in a suggestion for category `cat`. */
function pickProbe(st, seat, nb, cat, lvl){
  const cs = theCase(st);
  const all = (cs[cat] || []).map(id => cardOf(cat, id));
  if (nb.solution[cat]) return nb.solution[cat];             /* pinned → name it */
  const unknown = all.filter(c => nb.status[c] === '?');
  const pool = unknown.length ? unknown : all;
  if (lvl >= 2){
    /* deterministic best probe: the unknown card seen least (probe new info) */
    return pool[Math.floor(jitter(st, seat, cat.charCodeAt(0)) * pool.length) % pool.length];
  }
  /* lvl1: loose — usually a card out of its own hand, so the question
     buys nothing. See PROBE_OWN_P above for why this number is the one
     that separates an easy table from a competent one. */
  const myHand = handOf(st, seat) || [];
  const mine = myHand.filter(c => catOf(c) === cat);
  if (mine.length && jitter(st, seat, 31) < PROBE_OWN_P){
    return mine[Math.floor(jitter(st, seat, 32) * mine.length) % mine.length];
  }
  return pool[Math.floor(jitter(st, seat, 33) * pool.length) % pool.length];
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — a move as flat byte fields, for js/mp.js's generic codec.
   Cards travel as (cat, index-within-case) pairs so every field is < 256.
   A game seat + a case are shared, so both ends resolve the same card.
     roll    → { t:'rol' }                     (NO payload — see below)
     move    → { t:'mov', to:a POSITION }        (see posOK / board.POS_MAX)
     passage → { t:'psg' }
     suggest → { t:'sug', s,w,l:byte indices, by:seat|255, cd:byte|255 }
       (by/cd stamped by the REFEREE-side that resolves the refutation; the
        shown card `cd` is meaningful only to the suggester — mp.js should
        deliver it privately to the suggester, see the private-deal note in
        js/misteru-ui.js. The public wire carries `by` and a "hasCard" bit.)
     accuse  → { t:'acc', s,w,l, r:0|1|255 }  (r stamped by the JUDGE seat)
     pass    → { t:'pass' }
     quit    → { t:'quit' }

   THE DIE DOES NOT TRAVEL. rollFor(st) derives it from st.rs and advances
   the stream; every client replays apply() in the same order, so every
   client derives the SAME number for the same log entry. Putting the die
   on the wire would be a second source of truth that can disagree with the
   first — and the one that disagrees is the one that forks the table. So
   `rol` carries no payload at all.

   EVERY FIELD IN WIRE_FIELDS IS AN INTEGER 0..255. mp.js's toWire() sends
   the action name on its own (as `a`) and REFUSES any move object carrying
   a key the list does not name, or a value that is not a small number —
   it returns null, which fires tableStop ("this build does not know how to
   put … on the wire"). That is the exact bug that stopped IS-SQAQ; see
   docs/AGENT-LOG.md, 2026-08-24.

   'to' IS APPENDED AT THE END AND NOTHING IS EVER INSERTED. The field
   order IS the wire: fromWire walks the list against a bitmask, so moving
   or inserting a name silently re-reads every other field on an older
   build. Appending is safe — an older build's shorter list simply never
   sets that bit, decodes the fields it knows and ignores the rest.

   AND `to` IS BOUNDED BY posOK(), NEVER BY A NUMBER TYPED HERE — and, now
   that the map is per case, posOK NEEDS THE BOARD. Both codecs already
   receive `caseId`, which is the very thing that names a board, so both
   resolve it with boardFor(caseId) and validate against THAT board's
   POS_MAX. Get this wrong and nothing shouts: decWire simply returns null
   for every destination past the old fixed board's 25, i.e. a seat that
   cannot walk on any of the roomier cases, online, with nothing on screen
   to say why. So the two range checks below are `byteOK` (the WIRE's
   0..255, which every field owes mp.js) and `posOK(board, …)` (the
   ENGINE's own position gate, pointed at the right board).
   ═══════════════════════════════════════════════════════════════════ */
function catIndexInCase(caseId, card){
  const cs = caseOf(caseId);
  const cat = catOf(card), b = baseOf(card);
  const i = (cs[cat] || []).indexOf(b);
  return i;
}
function cardFromCase(caseId, cat, i){
  const cs = caseOf(caseId);
  const id = (cs[cat] || [])[i | 0];
  return id ? cardOf(cat, id) : null;
}
const byteOK = v => Number.isInteger(v) && v >= 0 && v <= 255;
/* APPEND ONLY. See the note above: the order is the wire. */
const WIRE_FIELDS = ['s', 'w', 'l', 'by', 'cd', 'r', 'to'];

function encWire(mv, caseId){
  if (!mv) return null;
  caseId = caseId | 0 || 1;
  if (mv.t === 'quit') return { t:'quit' };
  if (mv.t === 'pass') return { t:'pass' };
  /* ── the three board moves ─────────────────────────────────────────
     No hidden information in any of them, so none needs a referee: they
     are broadcast like any other move and every client replays them. */
  if (mv.t === 'roll') return { t:'rol' };
  if (mv.t === 'passage') return { t:'psg' };
  if (mv.t === 'move'){
    /* `to` arrives from the local engine here, but the SAME shape comes
       back off the wire on the other side; refuse anything that is not a
       real position ON THIS CASE'S BOARD rather than let a string, or a
       square from a different map, reach a frozen array. */
    if (!posOK(boardFor(caseId), mv.to) || !byteOK(mv.to)) return null;
    return { t:'mov', to: mv.to };
  }
  if (mv.t === 'suggest' || mv.t === 'accuse'){
    const si = catIndexInCase(caseId, mv.s), wi = catIndexInCase(caseId, mv.w), li = catIndexInCase(caseId, mv.l);
    if (si < 0 || wi < 0 || li < 0) return null;
    if (mv.t === 'suggest'){
      const by = (typeof mv.by === 'number' && mv.by >= 0) ? mv.by : 255;
      let cd = 255;
      if (mv.card){ const ci = catIndexInCase(caseId, mv.card);
        /* encode shown card as its within-category index + a 2-bit cat tag
           in the high nibble so the suggester can rebuild it */
        if (ci >= 0){ const tag = catOf(mv.card) === 's' ? 0 : catOf(mv.card) === 'w' ? 1 : 2;
          cd = (tag << 6) | (ci & 0x3F); } }
      if (!byteOK(by)) return null;
      return { t:'sug', s:si, w:wi, l:li, by, cd };
    }
    const r = (mv.right === 0 || mv.right === 1) ? mv.right : 255;
    return { t:'acc', s:si, w:wi, l:li, r };
  }
  return null;
}
function decWire(w, caseId){
  if (!w || typeof w.t !== 'string') return null;
  caseId = caseId | 0 || 1;
  if (w.t === 'quit') return { t:'quit' };
  if (w.t === 'pass') return { t:'pass' };
  if (w.t === 'rol') return { t:'roll' };
  if (w.t === 'psg') return { t:'passage' };
  if (w.t === 'mov'){
    /* it came from ANOTHER CLIENT. A `to` that is not a real position is
       refused HERE — returning null is a move this table does not know,
       which is loud; producing {t:'move',to:'7'} would be a move check()
       silently refuses and a table that quietly stops moving. The bound is
       posOK's, never a literal: see the note above. */
    const to = w.to;
    if (!posOK(boardFor(caseId), to) || !byteOK(to)) return null;
    return { t:'move', to };
  }
  if (w.t === 'sug'){
    const s = cardFromCase(caseId, 's', w.s | 0), wc = cardFromCase(caseId, 'w', w.w | 0), l = cardFromCase(caseId, 'l', w.l | 0);
    if (!s || !wc || !l) return null;
    const mv = { t:'suggest', s, w:wc, l };
    if ((w.by | 0) !== 255) mv.by = (w.by | 0);
    if ((w.cd | 0) !== 255){
      const raw = w.cd | 0, tag = (raw >> 6) & 0x3, ci = raw & 0x3F;
      const cat = tag === 0 ? 's' : tag === 1 ? 'w' : 'l';
      const card = cardFromCase(caseId, cat, ci);
      if (card) mv.card = card;
    }
    return mv;
  }
  if (w.t === 'acc'){
    const s = cardFromCase(caseId, 's', w.s | 0), wc = cardFromCase(caseId, 'w', w.w | 0), l = cardFromCase(caseId, 'l', w.l | 0);
    if (!s || !wc || !l) return null;
    const mv = { t:'accuse', s, w:wc, l };
    if ((w.r | 0) === 0 || (w.r | 0) === 1) mv.right = (w.r | 0);
    return mv;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   planDeal — what the shared lobby asks the relay to deal privately. For
   IL-MISTERU the relay must, for a given caseId + seed + seat count:
     1. choose the solution (1 s + 1 w + 1 l from the case sets),
     2. shuffle the remaining 15 cards and deal them round-robin to seats,
     3. push to EACH seat, privately, only that seat's own hand,
     4. push to the JUDGE seat (the host), privately, the solution,
   using the SAME seeded deal DEAL.seed implements here, so the coordinator
   and the engine agree. planDeal returns the recipe the relay needs; the
   engine's DEAL.seed(make) is the reference implementation the server can
   mirror server-side (or the server can run this exact function). See the
   private-deal note in js/misteru-ui.js for the precise hook shape.
   ═══════════════════════════════════════════════════════════════════ */
function planDeal(opts){
  opts = opts || {};
  const n = Math.max(MIN_SEATS, Math.min(MAX_SEATS, opts.players | 0 || 4));
  const caseId = Math.max(1, Math.min(CASES.length, opts.caseId | 0 || 1));
  /* compute the authoritative deal from the seed (reference impl) */
  const scratch = { rs: (opts.seed >>> 0) || 0, n, caseId, deal:'seed' };
  const d = DEAL.seed.make(scratch);
  return {
    caseId, players:n,
    solution: d.solution,               /* → deliver privately to the JUDGE only */
    hands: d.hands,                      /* hands[i] → deliver privately to seat i only */
    judge: 0                             /* the host seat judges accusations */
  };
}
/* build the private `given` inbox for a single seat from a planDeal result:
   its own hand always; the solution only if it is the judge. */
function givenForSeat(plan, seat, isJudge){
  const hand = {}; hand[seat] = (plan.hands[seat] || []).slice();
  const given = { hand };
  if (isJudge && plan.solution) given.solution = { s:plan.solution.s, w:plan.solution.w, l:plan.solution.l };
  return given;
}

/* ═══════════════════════════════════════════════════════════════════
   HARNESS HELPERS — a couple of pure introspection functions the test
   harness calls to prove the 50 cases and the perfect reasoner.
   ═══════════════════════════════════════════════════════════════════ */
function caseWellFormed(cs){
  const errs = [];
  if (!cs) return { ok:false, errs:['missing case'] };
  ['s','w','l'].forEach(cat => {
    const arr = cs[cat] || [];
    if (arr.length !== 6) errs.push(cat + ' has ' + arr.length + ' (need 6)');
    const seen = {};
    arr.forEach(id => {
      if (seen[id]) errs.push(cat + ' dup ' + id);
      seen[id] = 1;
      if (!(POOL_BY[cat] && POOL_BY[cat][id])) errs.push(cat + ' bad id ' + id);
    });
  });
  return { ok: errs.length === 0, errs };
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — js/misteru-ui.js and the test harness read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_MISTERU = root.KARTI_MISTERU || {};
root.KARTI_MISTERU.engine = {
  /* the universe */
  SUSPECTS, WEAPONS, LOCATIONS, CATS, POOL, POOL_BY, CASES, CASE_BY,
  cardOf, catOf, baseOf, nameOfCard, validCard, caseOf, caseCards, caseWellFormed,
  /* the deal seam */
  DEAL, dealSourceOf, planDeal, givenForSeat,
  /* the table */
  MIN_SEATS, MAX_SEATS, MAX_ROUNDS, deal, legal, check, apply, turn, over,
  theCase, handOf, holds, liveSeats, nextLive,
  /* the board — ONE PER CASE. boardFor(caseId) / boardOf(st) hand back the
     frozen board; ROOMS, CORR, DOORS, NEIGH, PASSAGE, ROOM_DIST and
     POS_MAX all live ON it, and every function below takes that board (or
     the state it belongs to) as its FIRST argument. The old module-level
     ROOMS/CORR/POS_MAX are deliberately gone rather than left pointing at
     one case's map: a caller that has not been updated should break where
     you can see it, not quietly play on the wrong board. */
  boardFor, boardOf, LEGACY_ROOMS, boardFault,
  BOARD_W, BOARD_H, CORR_MIN, CORR_MAX,
  POS_ROOM_MAX, posIsRoom, posRoom, posCorr, corrPos, posOK,
  posCell, corrIndexAt, roomAt, roomCard, roomOfSeat, passageFrom,
  startPos, rollFor, reachable,
  /* refutation + judging */
  sugCards, refuteChoices, refuterOf, validSug, inCase,
  /* deduction + verdict */
  notebookFor, verify, meSeat, verdict, note, candidatesIn,
  /* the machine. aiView is the AI's DEGRADED read of notebookFor and is
     exported for the harness only — no screen may ever draw from it. */
  LEVELS, levelOf, think, jitter, aiView,
  /* determinism */
  newSeed,
  /* the wire */
  encWire, decWire, WIRE_FIELDS, catIndexInCase, cardFromCase
};

})(typeof window !== 'undefined' ? window : globalThis);
