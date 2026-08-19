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

   THE GAME (streamlined, boardless, phone-first)
     · The SOLUTION is 1 SUSPECT + 1 WEAPON + 1 LOCATION, chosen secretly
       at the deal from the current case's sets and set ASIDE (nobody's
       hand). The other 15 cards (5 suspects + 5 weapons + 5 locations)
       are shuffled and dealt round-robin to the 2..6 players.
     · A TURN: the active player makes a SUGGESTION — a (suspect, weapon,
       location) triple from the case sets. Going CLOCKWISE from the
       suggester, the FIRST player who holds ANY one of the three cards
       must privately REVEAL ONE of them to the suggester. Only the
       suggester learns WHICH card; everyone sees THAT a card was shown and
       BY WHOM. This is the whole information engine — no board movement.
     · Optionally on your turn you make ONE ACCUSATION (suspect+weapon+
       location). Checked vs the hidden solution: RIGHT → you WIN and the
       solution is revealed; WRONG → you are OUT (you keep refuting others'
       suggestions with your cards, but can never win).
     · The game ENDS when someone accuses correctly, or all-but-one players
       are OUT (the last one standing wins), or a safety TURN-CAP is hit
       (then players rank by notebook progress / cards deduced).

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
     TERMINATION: every turn either advances the turn pointer (a suggestion/
     pass) or reduces the count of live players (a wrong accusation) or ends
     the game (a right accusation). The round counter increases every full
     lap and MAX_ROUNDS caps it. So the number of turns is bounded by
     MAX_ROUNDS * SEATS + (wrong accusations ≤ SEATS). QED.

   DETERMINISM
     st.rs is the entire RNG. The AI is a pure function of the state (its
     "randomness" is a hash of the position, never a clock, never
     Math.random), so every phone replays every move to the identical
     table. The one Math.random is newSeed() for a brand-new local match.
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

function deal(opts, seed){
  opts = opts || {};
  const n = Math.max(MIN_SEATS, Math.min(MAX_SEATS, opts.players | 0 || 4));
  const humans = Math.max(0, Math.min(n, opts.humans == null ? 1 : (opts.humans | 0)));
  const caseId = Math.max(1, Math.min(CASES.length, opts.caseId | 0 || 1));
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
     { t:'suggest', s, w, l }        the active player's suggestion. On
                                     apply, the refuter and shown card are
                                     resolved (offline) or read from the
                                     move's stamped fields (online).
     { t:'accuse',  s, w, l }        the active player's accusation. Judged
                                     vs the solution (offline) or by the
                                     stamped `right` bit (online judge).
     { t:'pass' }                    end the turn without suggesting (rare;
                                     lets a stuck seat move the game on).
     { t:'quit' }                    walk out (forfeit; counts as OUT).
   Only the active, non-out seat may suggest/accuse/pass; anyone may quit.
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

function legal(st, seat){
  if (st.done) return seat >= 0 && seat < st.n ? [{ t:'quit' }] : [];
  const out = [];
  if (seat === st.turn && !st.out[seat]){
    const cs = theCase(st);
    /* one representative legal suggestion & accusation are enough for the
       harness; the UI builds the full picker itself. We expose a couple. */
    out.push({ t:'suggest', s:cardOf('s', cs.s[0]), w:cardOf('w', cs.w[0]), l:cardOf('l', cs.l[0]) });
    out.push({ t:'accuse',  s:cardOf('s', cs.s[0]), w:cardOf('w', cs.w[0]), l:cardOf('l', cs.l[0]) });
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
  if (mv.t === 'suggest' || mv.t === 'accuse') return validSug(st, mv);
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
   the AI reasons with the SAME notebook a fair player keeps (never peeks
   at the solution or another hand — its state proves it), then:
     · ACCUSES if it has pinned all three categories (perfect certainty).
       Weaker levels are slower and, at lvl1, may accuse with a small
       gamble when only one category is uncertain (a calculated stab), so
       there is a real skill gradient.
     · else SUGGESTS to maximise information — probing UNKNOWN cards, and
       (to mask intent) sometimes seeding a card from its OWN hand.
   Where a person would waver the machine hashes the position, so it is
   replayable across phones.

     lvl 1  Kaporal   loose suggestions, deduces slowly, sometimes stabs.
     lvl 2  Surġent   sharp suggestions, accuses when sure.
     lvl 3  Spettur   maximal-information probes, accuses the instant it is
                      mathematically certain.
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

/* the AI's move for its turn. Pure function of the state. */
function think(st, seat, lvl){
  if (turn(st) !== seat || st.out[seat]) return null;
  lvl = Math.max(1, Math.min(3, lvl || st.seats[seat].lvl || 2));
  const cs = theCase(st);
  const nb = notebookFor(st, seat);

  /* ACCUSE when certain. lvl3/2 only when all three pinned; lvl1 also
     when two are pinned and the third has few candidates (a stab). */
  if (nb.solved){
    return { t:'accuse', s:nb.solution.s, w:nb.solution.w, l:nb.solution.l };
  }
  if (lvl === 1 && nb.solvedCats === 2){
    /* the one unsolved category: stab if it is down to 2 candidates and a
       hashed coin says go (impatient). Build a COMPLETE accusation — the
       two pinned solution cards plus a chosen candidate for the third. */
    const cat = CATS.find(c => !nb.solution[c]);
    const cands = candidatesIn(st, seat, nb, cat);
    if (cands.length >= 1 && cands.length <= 2 && jitter(st, seat, 11) < 0.5){
      const pick = cands[Math.floor(jitter(st, seat, 12) * cands.length) % cands.length] || cands[0];
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

  /* otherwise SUGGEST to gain information. For each category pick a card:
       lvl3/2: an UNKNOWN candidate (status '?') to probe — best info.
       lvl1:   sometimes a known/own card (loose), so it learns slower.
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
  return { t:'suggest', s:sug.s, w:sug.w, l:sug.l };
}
/* the candidate cards in a category a seat still considers possible for
   the solution (status not 'has'). */
function candidatesIn(st, seat, nb, cat){
  const cs = theCase(st);
  const cards = (cs[cat] || []).map(id => cardOf(cat, id));
  return cards.filter(c => nb.status[c] !== 'has');
}
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
  /* lvl1: loose — sometimes an own/known card, learns slower */
  const myHand = handOf(st, seat) || [];
  const mine = myHand.filter(c => catOf(c) === cat);
  if (mine.length && jitter(st, seat, 31) < 0.4){
    return mine[Math.floor(jitter(st, seat, 32) * mine.length) % mine.length];
  }
  return pool[Math.floor(jitter(st, seat, 33) * pool.length) % pool.length];
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — a move as flat byte fields, for js/mp.js's generic codec.
   Cards travel as (cat, index-within-case) pairs so every field is < 256.
   A game seat + a case are shared, so both ends resolve the same card.
     suggest → { t:'sug', s,w,l:byte indices, by:seat|255, cd:byte|255 }
       (by/cd stamped by the REFEREE-side that resolves the refutation; the
        shown card `cd` is meaningful only to the suggester — mp.js should
        deliver it privately to the suggester, see the private-deal note in
        js/misteru-ui.js. The public wire carries `by` and a "hasCard" bit.)
     accuse  → { t:'acc', s,w,l, r:0|1|255 }  (r stamped by the JUDGE seat)
     pass    → { t:'pass' }
     quit    → { t:'quit' }
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
const byteOK = v => v >= 0 && v <= 255;
const WIRE_FIELDS = ['s', 'w', 'l', 'by', 'cd', 'r'];

function encWire(mv, caseId){
  if (!mv) return null;
  caseId = caseId | 0 || 1;
  if (mv.t === 'quit') return { t:'quit' };
  if (mv.t === 'pass') return { t:'pass' };
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
  /* refutation + judging */
  sugCards, refuteChoices, refuterOf, validSug, inCase,
  /* deduction + verdict */
  notebookFor, verify, meSeat, verdict, note, candidatesIn,
  /* the machine */
  LEVELS, levelOf, think, jitter,
  /* determinism */
  newSeed,
  /* the wire */
  encWire, decWire, WIRE_FIELDS, catIndexInCase, cardFromCase
};

})(typeof window !== 'undefined' ? window : globalThis);
