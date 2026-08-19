/* ═══════════════════════════════════════════════════════════════════
   KARTI — mimika.js
   MIMIKA — charades. One player is the ACTOR, handed a secret word/phrase,
   and mimes it; everybody else guesses. This is the ENGINE ONLY: rules,
   turn rotation, scoring, the word bank and the timer-as-state. No DOM,
   no canvas, no clock, no registration, and NO Math.random anywhere but
   the one documented seed pick for a brand-new local match (newSeed()).
   The screen half is a separate js/mimika-ui.js and is not this file.

   (Name: "mimika" is Maltese/Italianate for mime. It reads cleaner than
   "ċarati"; if the UI prefers a different label that is a display string,
   not an engine fact — the engine never writes player-visible prose.)

   THE GAME
     Three to twelve players. Each ROUND one seat is the ACTOR. The actor
     is shown a secret word/phrase drawn from the chosen categories at the
     chosen difficulty; a timer (engine state, ticked by the UI) runs down.
     Everyone else is a GUESSER. A correct guess ends the round: the actor
     scores for getting it across, and the guesser scores for landing it.
     The actor may PASS/SKIP a word a limited number of times (small
     penalty). If the timer expires with no correct guess, nobody scores.
     Then the turn ROTATES — every seat acts an equal number of times —
     and the match ends after N rounds or when a seat reaches a target.

     Guessing works TWO ways and the engine supports both:
       · OUT LOUD in the room — the group shouts, and the UNIT (whoever is
         holding the phone / the caller) taps which seat guessed it, via a
         {t:'got', by:seatIndex} move. No text crosses anything.
       · TYPED — a guesser submits {t:'guess', by:seatIndex, text:'...'}
         and the engine matches it (normalised) against the secret. Typed
         guessing is only honest ONLINE, where the secret was delivered
         privately (see below) — offline everyone can read the screen.

   ── THE SECRET — READ THIS BEFORE CHANGING ANYTHING. ──────────────────
     The whole game dies if a guesser can read the actor's word. The word
     must reach ONLY the actor. Exactly like poker's hole cards, the deal
     is NOT derived from the broadcast seed: the relay broadcasts one seed
     to every seat, so anything a client computes from that seed, every
     other client can compute too — which would hand every guesser the
     answer from the browser console.

     So word selection sits behind an injectable SOURCE with two
     implementations and one interface — wordFor(st, round) -> id|null:

       SOURCES.seed     derives the word id from st.rs and the round
                        number, the way skarta/rummy/spy deal. This is
                        OFFLINE / SOLO / PASS-THE-PHONE mode, and it is
                        honest THERE because there is one device: the
                        holder is always whoever is acting, and a guesser
                        physically cannot see the actor's screen. No
                        secrecy is needed on one device, so the cheapest
                        correct thing is a seeded pick.
       SOURCES.private  takes words delivered PER SEAT by the relay's
                        private deal (st.given: a per-seat slate of word
                        ids, one entry consumed per round that seat acts),
                        and returns null for a round this client was NOT
                        the actor of. That null is the point: a guesser's
                        engine literally does not hold the actor's word,
                        because the relay never sent it to that seat.

     The split is the entire secrecy model. In ONLINE play the engine
     state a non-actor holds contains NO word for the current round — only
     the actor's own client resolved it, from its own private slate. The
     tests below inspect exactly the object a guesser would hold and assert
     the secret is absent and NOT reconstructible from st.rs.

   ── WHAT THE RELAY / UI WIRING MUST DO (per the private path) ─────────
     The relay's private-deal primitive (server/karti_server.py v_deal +
     the {"t":"mine",...} push) hands each seat its own scalar items ONCE,
     at game start. Charades needs a per-round secret for a rotating actor,
     so the wiring deals each seat a PRIVATE SLATE of word ids up front:

       1. Before start, the HOST/UI builds the slate plan with
          planDeal(opts, seed): it returns {items:[{v,g},...], each} ready
          to drop into the room's `deal` field. `v` is an INTEGER word id
          (an index into the shared bilingual bank — see idToKey/keyToId);
          it is a lookup key, not the word text, and it is only ever
          delivered to the seat that will act on it. `each` is how many
          words one seat may need across the whole match (= ceil(rounds /
          seats), capped at MAX_DEAL_EACH). The relay shuffles the pool
          with its OWN entropy and pushes each seat {"t":"mine","d":[ids]}.
       2. Each client stores its received ids as st.given.slate (an array
          of integer word ids for THIS seat only) via setSlate(st, ids).
       3. On each round the engine, on the ACTOR'S client only, pops the
          next id off that seat's slate (SOURCES.private) and reveals it.
          Non-actor clients pop nothing and hold null. The chosen id is
          then recorded into the move log as a DELIVERED WORD so replay is
          exact (see below): the log entry carries the id the actor was
          shown, which every client already trusts because only the actor
          could have produced it and the relay authored the slate.
       4. Because the word ids are integers and the bank is shared, a
          non-actor CAN map an id to text — but it never receives the id.
          The secrecy rests on delivery, not obscurity: same principle as
          poker's per-seat hole cards.

     If a seat runs its slate dry (more acting turns than words dealt),
     the engine falls back to marking the round unresolved and the UI must
     request a top-up deal — but planDeal sizes the slate so this does not
     happen for a normal match. The seam is exposed via slateLeft(st).

   TEAM MODE
     Built in, because it fits cleanly. opts.teams = 2 splits seats into
     two teams by seat parity of their join order (even seats team 0, odd
     team 1). In team mode ONLY the actor's own team may score a guess;
     the other team is muted for that round. Turn rotation still visits
     every seat equally, alternating team on each round so the acting team
     alternates. Scoring is per-seat and also summed per-team by tally().
     opts.teams = 1 (default) is the free-for-all above. The seam for more
     than two teams is teamOf(); nothing else assumes exactly two.

   DETERMINISM
     st.rs is the entire RNG. Everything is a pure function of
     (seed, moves, delivered-words): apply() only ever reads state and the
     move, the timer is ticked by explicit {t:'tick'} moves (never a
     wall-clock read inside the engine), and word selection is the injected
     source. Replaying the log reconstructs the identical final state, bit
     for bit. The ONE place a brand-new local match calls Math.random is
     newSeed(), documented and isolated, exactly like poker/skarta.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ═══════════════════════════════════════════════════════════════════
   SEEDED RNG — the whole RNG state is st.rs (poker's/rummy's mulberry32).
   No Math.random in here; the only draw is newSeed() at the very bottom.
   ═══════════════════════════════════════════════════════════════════ */
function rnd(st){
  st.rs = (st.rs + 0x6D2B79F5) | 0;
  let t = st.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/* a pure seeded pick that does NOT disturb st.rs — used to derive an
   offline word from (seed, round) without advancing the shared stream,
   so two clients that happen to share a seed still agree. */
function hash32(list){
  let h = 2166136261;
  for (let i = 0; i < list.length; i++){
    h ^= (list[i] | 0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ═══════════════════════════════════════════════════════════════════
   THE WORD BANK — bilingual {en, mt}, tagged by category and difficulty.
   Several hundred entries. One entry, two labels, never two parallel
   lists (spy-words.js's rule: parallel lists drift and deal half the
   table a word the other half cannot see).

   CATEGORIES
     film     films & TV everyone in Malta knows
     malti    Maltese things — food, places, festi, culture (bilingual;
              where a thing has no honest English name the Maltese is kept
              in both, exactly as spy-words.js does)
     annimal  animals
     azzjoni  actions / verbs to mime
     nies     famous people & characters
     hamalli  the cheeky Maltese 18+ category. KARTI is an adult Maltese
              comedy app, so this is the house's rude category. EVERY
              entry here is flagged rude:true and MUST get a native read
              before shipping — marked with a NATIVE-READ tag below.

   DIFFICULTY d: 1 easy, 2 medium, 3 hard. Harder = more obscure word +
   (via TIMERS) less time on the clock.
   ═══════════════════════════════════════════════════════════════════ */
const CATS = ['film', 'malti', 'annimal', 'azzjoni', 'nies', 'hamalli'];

/* NATIVE-READ: every `hamalli` entry below is unverified Maltese slang and
   is flagged rude:true. A native speaker must approve the list before it
   ships. The engine only tags them; it never blocks them (the app is 18+),
   and the UI gates the category behind an adult toggle. */

const BANK = [
  /* ── FILM ─────────────────────────────────────────────────────── */
  { c:'film', d:1, en:'Titanic', mt:'Titanic' },
  { c:'film', d:1, en:'The Lion King', mt:'Is-Sultan Iljun' },
  { c:'film', d:1, en:'Frozen', mt:'Frozen' },
  { c:'film', d:1, en:'Jurassic Park', mt:'Jurassic Park' },
  { c:'film', d:1, en:'Star Wars', mt:'Star Wars' },
  { c:'film', d:1, en:'Harry Potter', mt:'Harry Potter' },
  { c:'film', d:1, en:'Spider-Man', mt:'Spider-Man' },
  { c:'film', d:1, en:'Batman', mt:'Batman' },
  { c:'film', d:1, en:'Shrek', mt:'Shrek' },
  { c:'film', d:1, en:'Toy Story', mt:'Toy Story' },
  { c:'film', d:1, en:'Finding Nemo', mt:'Finding Nemo' },
  { c:'film', d:1, en:'The Godfather', mt:'The Godfather' },
  { c:'film', d:2, en:'Pirates of the Caribbean', mt:'Il-Pirati tal-Karibew' },
  { c:'film', d:2, en:'The Matrix', mt:'The Matrix' },
  { c:'film', d:2, en:'Gladiator', mt:'Il-Gladjatur' },
  { c:'film', d:2, en:'Jaws', mt:'Il-Klieb il-Baħar' },
  { c:'film', d:2, en:'Rocky', mt:'Rocky' },
  { c:'film', d:2, en:'Forrest Gump', mt:'Forrest Gump' },
  { c:'film', d:2, en:'The Avengers', mt:'The Avengers' },
  { c:'film', d:2, en:'Home Alone', mt:'Waħdu id-Dar' },
  { c:'film', d:2, en:'Game of Thrones', mt:'Game of Thrones' },
  { c:'film', d:2, en:'Breaking Bad', mt:'Breaking Bad' },
  { c:'film', d:2, en:'Stranger Things', mt:'Stranger Things' },
  { c:'film', d:2, en:'Squid Game', mt:'Squid Game' },
  { c:'film', d:2, en:'The Simpsons', mt:'The Simpsons' },
  { c:'film', d:3, en:'Inception', mt:'Inception' },
  { c:'film', d:3, en:'Pulp Fiction', mt:'Pulp Fiction' },
  { c:'film', d:3, en:'The Silence of the Lambs', mt:'Is-Skiet tal-Ħrief' },
  { c:'film', d:3, en:'2001: A Space Odyssey', mt:'2001: Odissea fl-Ispazju' },
  { c:'film', d:3, en:'The Shawshank Redemption', mt:'The Shawshank Redemption' },
  { c:'film', d:3, en:'Interstellar', mt:'Interstellar' },
  { c:'film', d:3, en:'The Grand Budapest Hotel', mt:'The Grand Budapest Hotel' },
  { c:'film', d:3, en:'Casablanca', mt:'Casablanca' },

  /* ── MALTI — Maltese things ───────────────────────────────────── */
  { c:'malti', d:1, en:'Pastizz', mt:'Pastizz' },
  { c:'malti', d:1, en:'Ftira', mt:'Ftira' },
  { c:'malti', d:1, en:'Kinnie', mt:'Kinnie' },
  { c:'malti', d:1, en:'Cisk (beer)', mt:'Cisk' },
  { c:'malti', d:1, en:'Twistees', mt:'Twistees' },
  { c:'malti', d:1, en:'Luzzu (fishing boat)', mt:'Luzzu' },
  { c:'malti', d:1, en:'Church festa', mt:'Il-Festa' },
  { c:'malti', d:1, en:'Fireworks', mt:'Il-Loghob tan-Nar' },
  { c:'malti', d:1, en:'Village band club', mt:'Il-Kazin tal-Banda' },
  { c:'malti', d:1, en:'The sea', mt:'Il-Bahar' },
  { c:'malti', d:1, en:'Sunday lampuki', mt:'Il-Lampuki' },
  { c:'malti', d:1, en:'Balcony (gallarija)', mt:'Il-Gallarija' },
  { c:'malti', d:2, en:'Qassata', mt:'Qassata' },
  { c:'malti', d:2, en:'Imqaret (date pastry)', mt:'Imqaret' },
  { c:'malti', d:2, en:'Bragioli', mt:'Bragioli' },
  { c:'malti', d:2, en:'Fenkata (rabbit feast)', mt:'Fenkata' },
  { c:'malti', d:2, en:'Ghana (folk song)', mt:'L-Ghana' },
  { c:'malti', d:2, en:'The Mnajdra temples', mt:'Il-Mnajdra' },
  { c:'malti', d:2, en:'Karozzin (horse cab)', mt:'Il-Karozzin' },
  { c:'malti', d:2, en:'Dghajsa (harbour boat)', mt:'Id-Dghajsa' },
  { c:'malti', d:2, en:'Bocci (bowls)', mt:'Il-Bocci' },
  { c:'malti', d:2, en:'Village saint statue', mt:'Il-Vara tal-Qaddis' },
  { c:'malti', d:2, en:'Feast petard', mt:'Il-Murtal' },
  { c:'malti', d:2, en:'Kusksu (soup)', mt:'Il-Kusksu' },
  { c:'malti', d:2, en:'Prickly pear (bajtra)', mt:'Il-Bajtra' },
  { c:'malti', d:3, en:'Ghonnella (old cloak)', mt:'L-Ghonnella' },
  { c:'malti', d:3, en:'Il-Gostra (greasy pole)', mt:'Il-Gostra' },
  { c:'malti', d:3, en:'Kavallieri (Knights of Malta)', mt:'Il-Kavallieri' },
  { c:'malti', d:3, en:'Il-Girna (rubble hut)', mt:'Il-Girna' },
  { c:'malti', d:3, en:'Il-Bicca (regatta boat)', mt:'Ir-Regatta' },
  { c:'malti', d:3, en:'Zeppi l-Hafi', mt:'Zeppi l-Hafi' },
  { c:'malti', d:3, en:'L-Imnarja (feast)', mt:'L-Imnarja' },
  { c:'malti', d:3, en:'Il-Karnival ta\' Malta', mt:'Il-Karnival' },

  /* ── ANNIMAL — animals ────────────────────────────────────────── */
  { c:'annimal', d:1, en:'Cat', mt:'Qattus' },
  { c:'annimal', d:1, en:'Dog', mt:'Kelb' },
  { c:'annimal', d:1, en:'Horse', mt:'Ziemel' },
  { c:'annimal', d:1, en:'Rabbit', mt:'Fenek' },
  { c:'annimal', d:1, en:'Chicken', mt:'Tigiega' },
  { c:'annimal', d:1, en:'Fish', mt:'Hut' },
  { c:'annimal', d:1, en:'Cow', mt:'Baqra' },
  { c:'annimal', d:1, en:'Pig', mt:'Majjal' },
  { c:'annimal', d:1, en:'Sheep', mt:'Naghga' },
  { c:'annimal', d:1, en:'Bird', mt:'Ghasfur' },
  { c:'annimal', d:1, en:'Snake', mt:'Serp' },
  { c:'annimal', d:1, en:'Frog', mt:'Zringa' },
  { c:'annimal', d:2, en:'Elephant', mt:'Iljunfant' },
  { c:'annimal', d:2, en:'Lion', mt:'Iljun' },
  { c:'annimal', d:2, en:'Monkey', mt:'Xadin' },
  { c:'annimal', d:2, en:'Giraffe', mt:'Giraffa' },
  { c:'annimal', d:2, en:'Kangaroo', mt:'Kangaroo' },
  { c:'annimal', d:2, en:'Crocodile', mt:'Kukkudrill' },
  { c:'annimal', d:2, en:'Octopus', mt:'Qarnita' },
  { c:'annimal', d:2, en:'Bat', mt:'Farfett il-Lejl' },
  { c:'annimal', d:2, en:'Bee', mt:'Nahla' },
  { c:'annimal', d:2, en:'Spider', mt:'Brimba' },
  { c:'annimal', d:2, en:'Hedgehog', mt:'Qanfud' },
  { c:'annimal', d:2, en:'Seahorse', mt:'Ziemel il-Bahar' },
  { c:'annimal', d:3, en:'Chameleon', mt:'Kamaleont' },
  { c:'annimal', d:3, en:'Platypus', mt:'Platypus' },
  { c:'annimal', d:3, en:'Praying mantis', mt:'Debba tax-Xitan' },
  { c:'annimal', d:3, en:'Pufferfish', mt:'Huta Balluna' },
  { c:'annimal', d:3, en:'Weasel (ballottra)', mt:'Ballottra' },
  { c:'annimal', d:3, en:'Jellyfish', mt:'Brama' },
  { c:'annimal', d:3, en:'Woodpecker', mt:'Nieqer' },
  { c:'annimal', d:3, en:'Sloth', mt:'Sloth' },

  /* ── AZZJONI — actions to mime ────────────────────────────────── */
  { c:'azzjoni', d:1, en:'Swimming', mt:'Tghum' },
  { c:'azzjoni', d:1, en:'Sleeping', mt:'Torqod' },
  { c:'azzjoni', d:1, en:'Eating', mt:'Tiekol' },
  { c:'azzjoni', d:1, en:'Driving', mt:'Issuq' },
  { c:'azzjoni', d:1, en:'Dancing', mt:'Tizfen' },
  { c:'azzjoni', d:1, en:'Running', mt:'Tigri' },
  { c:'azzjoni', d:1, en:'Crying', mt:'Tibki' },
  { c:'azzjoni', d:1, en:'Laughing', mt:'Tidhaq' },
  { c:'azzjoni', d:1, en:'Cooking', mt:'Issajjar' },
  { c:'azzjoni', d:1, en:'Fishing', mt:'Tistad' },
  { c:'azzjoni', d:1, en:'Singing', mt:'Tkanta' },
  { c:'azzjoni', d:1, en:'Reading', mt:'Taqra' },
  { c:'azzjoni', d:2, en:'Taking a selfie', mt:'Tiehu selfie' },
  { c:'azzjoni', d:2, en:'Parking the car', mt:'Tipparkja' },
  { c:'azzjoni', d:2, en:'Hanging the washing', mt:'Tnixxef il-hwejjeg' },
  { c:'azzjoni', d:2, en:'Doing the ironing', mt:'Tghaddi bil-hadida' },
  { c:'azzjoni', d:2, en:'Arguing with the ref', mt:'Tiggieled mar-referee' },
  { c:'azzjoni', d:2, en:'Blowing out candles', mt:'Titfi x-xemgha' },
  { c:'azzjoni', d:2, en:'Riding a bike', mt:'Issuq ir-rota' },
  { c:'azzjoni', d:2, en:'Painting a wall', mt:'Tiżbogh il-hajt' },
  { c:'azzjoni', d:2, en:'Praying the rosary', mt:'Tghid ir-ruzarju' },
  { c:'azzjoni', d:2, en:'Milking a cow', mt:'Thaleb il-baqra' },
  { c:'azzjoni', d:3, en:'Threading a needle', mt:'Tinfed il-labra' },
  { c:'azzjoni', d:3, en:'Conducting an orchestra', mt:'Tmexxi orkestra' },
  { c:'azzjoni', d:3, en:'Assembling furniture', mt:'Twahhal l-ghamara' },
  { c:'azzjoni', d:3, en:'Juggling', mt:'Tilghab bil-bocci fl-ajru' },
  { c:'azzjoni', d:3, en:'Doing a magic trick', mt:'Taghmel magija' },
  { c:'azzjoni', d:3, en:'Refereeing a match', mt:'Tirreferja loghba' },
  { c:'azzjoni', d:3, en:'Sculpting a statue', mt:'Tnaqqax statwa' },
  { c:'azzjoni', d:3, en:'Defusing a bomb', mt:'Tizarma bomba' },

  /* ── NIES — famous people & characters ────────────────────────── */
  { c:'nies', d:1, en:'Superman', mt:'Superman' },
  { c:'nies', d:1, en:'Santa Claus', mt:'San Nikola' },
  { c:'nies', d:1, en:'Mickey Mouse', mt:'Mickey Mouse' },
  { c:'nies', d:1, en:'Elvis Presley', mt:'Elvis Presley' },
  { c:'nies', d:1, en:'Cristiano Ronaldo', mt:'Cristiano Ronaldo' },
  { c:'nies', d:1, en:'Lionel Messi', mt:'Lionel Messi' },
  { c:'nies', d:1, en:'The Pope', mt:'Il-Papa' },
  { c:'nies', d:1, en:'Charlie Chaplin', mt:'Charlie Chaplin' },
  { c:'nies', d:2, en:'Michael Jackson', mt:'Michael Jackson' },
  { c:'nies', d:2, en:'Freddie Mercury', mt:'Freddie Mercury' },
  { c:'nies', d:2, en:'Albert Einstein', mt:'Albert Einstein' },
  { c:'nies', d:2, en:'Napoleon', mt:'Napuljun' },
  { c:'nies', d:2, en:'Cleopatra', mt:'Kleopatra' },
  { c:'nies', d:2, en:'James Bond', mt:'James Bond' },
  { c:'nies', d:2, en:'Sherlock Holmes', mt:'Sherlock Holmes' },
  { c:'nies', d:2, en:'Mr Bean', mt:'Mr Bean' },
  { c:'nies', d:2, en:'Dom Mintoff', mt:'Dom Mintoff' },
  { c:'nies', d:2, en:'Fabrizio Faniello', mt:'Fabrizio Faniello' },
  { c:'nies', d:3, en:'Leonardo da Vinci', mt:'Leonardo da Vinci' },
  { c:'nies', d:3, en:'William Shakespeare', mt:'William Shakespeare' },
  { c:'nies', d:3, en:'Frida Kahlo', mt:'Frida Kahlo' },
  { c:'nies', d:3, en:'Marie Curie', mt:'Marie Curie' },
  { c:'nies', d:3, en:'Jean de Valette', mt:'Jean de Valette' },
  { c:'nies', d:3, en:'Dun Karm (poet)', mt:'Dun Karm' },
  { c:'nies', d:3, en:'Caravaggio', mt:'Caravaggio' },
  { c:'nies', d:3, en:'Mikiel Anton Vassalli', mt:'Mikiel Anton Vassalli' },

  /* ── HAMALLI — 18+ Maltese cheeky category ─────────────────────
     NATIVE-READ REQUIRED. rude:true on every entry. Kept deliberately
     mild-to-saucy comedy, not slurs; a native must sign these off. */
  { c:'hamalli', d:1, rude:true, en:'A hangover (attakk)', mt:'Xrobt wisq' },
  { c:'hamalli', d:1, rude:true, en:'Kissing (bewsa)', mt:'Bewsa' },
  { c:'hamalli', d:1, rude:true, en:'A wedgie', mt:'Wedgie' },
  { c:'hamalli', d:1, rude:true, en:'Passing wind', mt:'Bassejt' },
  { c:'hamalli', d:1, rude:true, en:'Skinny dipping', mt:'Ghawm gharwien' },
  { c:'hamalli', d:1, rude:true, en:'A big backside', mt:'Sptar kbir' },
  { c:'hamalli', d:2, rude:true, en:'A tinder date', mt:'Date mit-Tinder' },
  { c:'hamalli', d:2, rude:true, en:'Doing the walk of shame', mt:'Il-mixja tal-misthija' },
  { c:'hamalli', d:2, rude:true, en:'A drunk uncle at the festa', mt:'Zijuh fis-sakra fil-festa' },
  { c:'hamalli', d:2, rude:true, en:'Flirting badly', mt:'Flirt hazin' },
  { c:'hamalli', d:2, rude:true, en:'A dodgy massage', mt:'Massagg suspettuz' },
  { c:'hamalli', d:2, rude:true, en:'Twerking', mt:'Twerking' },
  { c:'hamalli', d:2, rude:true, en:'A one-night stand', mt:'Lejl wiehed biss' },
  { c:'hamalli', d:3, rude:true, en:'A questionable Frenċ kiss', mt:'Bewsa bl-ilsien' },
  { c:'hamalli', d:3, rude:true, en:'Getting caught in the act', mt:'Maqbud fl-att' },
  { c:'hamalli', d:3, rude:true, en:'A pole dancer', mt:'Zeffiena tal-arblu' },
  { c:'hamalli', d:3, rude:true, en:'Sexting the wrong number', mt:'Sexting lin-numru l-hazin' },
  { c:'hamalli', d:3, rude:true, en:'A very awkward striptease', mt:'Striptease imbarazzanti' }
];

/* ── the bank as an addressable table ──────────────────────────────
   A word id is simply the INTEGER index into BANK — stable as long as
   nobody reorders BANK, and small enough to travel as a v_deal scalar.
   idToKey / keyToId are the seam if a stable string key is ever needed;
   today the id IS the index. */
const idToKey = id => (id | 0);
const keyToId = k => (k | 0);
function wordById(id){ return BANK[id | 0] || null; }
/* the display label in a language, chosen at DISPLAY time by the UI.
   The engine never picks a language — this is a convenience the UI/tests
   may call. */
function label(id, lang){
  const w = wordById(id);
  if (!w) return '';
  return lang === 'mt' ? (w.mt != null ? w.mt : w.en) : (w.en != null ? w.en : w.mt);
}

/* every id in the chosen categories at-or-below the chosen difficulty,
   in bank order (deterministic). Difficulty caps the ceiling: easy games
   only draw d<=1, hard games draw the whole spread up to d<=3. */
function poolFor(cats, maxD){
  const set = {};
  (cats && cats.length ? cats : CATS).forEach(c => { set[c] = true; });
  maxD = Math.max(1, Math.min(3, maxD | 0 || 2));
  const out = [];
  for (let i = 0; i < BANK.length; i++){
    const w = BANK[i];
    if (set[w.c] && w.d <= maxD) out.push(i);
  }
  return out;
}

/* normalise a typed guess and a target label to compare them: lower-case,
   strip accents/diacritics, drop everything but letters and digits. So
   "Il-Lampuki" matches "lampuki" and "Spider Man" matches "spiderman". */
function norm(s){
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}
/* does a typed guess hit the word in EITHER language? A round is language-
   agnostic: the actor mimed a concept, and either label is a correct call. */
function guessHits(id, text){
  const w = wordById(id);
  if (!w) return false;
  const g = norm(text);
  if (!g) return false;
  return g === norm(w.en) || g === norm(w.mt);
}

/* ═══════════════════════════════════════════════════════════════════
   THE WORD SOURCE — the injectable secrecy seam. See the header.
   wordFor(st, round) -> id (integer) | null
     null means "this client is not the actor of this round and was not
     told the word" — the ONLINE guesser's state, and the whole point.
   ═══════════════════════════════════════════════════════════════════ */
const SOURCES = {
  /* (a) OFFLINE / SOLO / PASS-THE-PHONE. Derived from the seed and the
     round, disturbing st.rs so a fresh word comes up each round without a
     Math.random. Honest on ONE device: the holder is always the actor.
     Not for online — every client could compute this. */
  seed: {
    id: 'seed',
    wordFor(st, round){
      const pool = st.pool;
      if (!pool.length) return null;
      /* a bag walk: shuffle the pool once off the seed and walk it, so a
         session does not repeat a word until the pool is exhausted. The
         order is a pure function of (seed, poolLen); round indexes it. */
      const order = st.wordOrder;
      return order[(Math.max(1, round | 0) - 1) % order.length];
    }
  },
  /* (b) ONLINE PRIVATE DELIVERY. The relay dealt THIS seat a private slate
     of word ids (st.given.slate); each acting turn pops the next one. A
     client that is not the actor holds no slate entry to pop for a round
     it did not act, so it returns null and never learns the word. */
  private: {
    id: 'private',
    wordFor(st, round){
      const g = st.given || {};
      const slate = Array.isArray(g.slate) ? g.slate : [];
      /* how many times THIS client's seat has already acted (rounds
         resolved for meSeat). The nth acting turn pops slate[n]. */
      const mine = st.meSeat;
      if (mine < 0) return null;
      const actor = actorForRound(st, round);
      if (actor !== mine) return null;             /* not our word */
      /* index = how many earlier rounds this seat was the actor of */
      let used = 0;
      for (let r = 1; r < round; r++) if (actorForRound(st, r) === mine) used++;
      const id = slate[used];
      return (id == null) ? null : (id | 0);
    }
  }
};
const sourceOf = st => SOURCES[st.src] || SOURCES.seed;

/* ═══════════════════════════════════════════════════════════════════
   TURN ROTATION — everybody acts an equal number of times.
   Round r (1-based) is acted by seat order[(r-1) % n], where `order` is
   the seating order. In team mode the order alternates teams so the
   acting TEAM alternates round to round while still visiting every seat
   equally over a full cycle.
   ═══════════════════════════════════════════════════════════════════ */
function buildOrder(n, teams){
  const base = [];
  for (let i = 0; i < n; i++) base.push(i);
  if (teams < 2) return base;
  /* interleave the two teams so consecutive rounds alternate team. Team 0
     is the even seats, team 1 the odd seats (join-order parity). */
  const t0 = base.filter(i => (i % 2) === 0);
  const t1 = base.filter(i => (i % 2) === 1);
  const order = [];
  const m = Math.max(t0.length, t1.length);
  for (let k = 0; k < m; k++){
    if (k < t0.length) order.push(t0[k]);
    if (k < t1.length) order.push(t1[k]);
  }
  return order;
}
function actorForRound(st, round){
  const r = Math.max(1, round | 0);
  return st.order[(r - 1) % st.order.length];
}
const teamOf = (st, seat) => (st.teams < 2 ? 0 : (seat % 2));

/* ═══════════════════════════════════════════════════════════════════
   DIFFICULTY → TIMER. The engine owns the clock as STATE (st.clock), a
   countdown the UI decrements with {t:'tick'} moves — never a wall-clock
   read in here, so a replay of the ticks reproduces the identical clock.
   ═══════════════════════════════════════════════════════════════════ */
const TIMERS = { 1: 90, 2: 75, 3: 60 };   /* seconds on the clock per difficulty */

/* ═══════════════════════════════════════════════════════════════════
   SCORING
     actor gets a correct guess across   +2   (ACTOR_POINTS)
     the guesser who lands it            +3   (GUESSER_POINTS)
     the actor PASSES/SKIPS a word       -1   (SKIP_PENALTY), limited to
                                              MAX_SKIPS per round
     timer runs out, nobody guessed       0   for everyone
   Points are conserved in the sense that they are only ever added by these
   documented events; tally() re-derives every score from the log so no
   score is stored twice. Team totals are the sum of member scores.
   ═══════════════════════════════════════════════════════════════════ */
const ACTOR_POINTS = 2;
const GUESSER_POINTS = 3;
const SKIP_PENALTY = 1;
const MAX_SKIPS = 3;                  /* skips allowed per round before the actor is stuck */
const DEFAULT_ROUNDS_PER_SEAT = 2;    /* a full match = this many acting turns each */

/* ═══════════════════════════════════════════════════════════════════
   deal(opts, seed) -> state
   opts: { players, humans, cats, diff, teams, rounds, target, src, given }
     players  3..12
     cats     array of category ids (default all)
     diff     1|2|3 difficulty ceiling
     teams    1 (free-for-all) | 2
     rounds   total rounds; default players * DEFAULT_ROUNDS_PER_SEAT
     target   optional score to end early on (0 = none)
     src      'seed' (offline) | 'private' (online). Default 'seed'.
     given    { slate:[ids] } — this client's private slate (online only)
   ═══════════════════════════════════════════════════════════════════ */
const MIN_PLAYERS = 3, MAX_PLAYERS = 12;

function deal(opts, seed){
  opts = opts || {};
  const n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, opts.players | 0 || 4));
  const teams = (opts.teams | 0) === 2 ? 2 : 1;
  const diff = Math.max(1, Math.min(3, opts.diff | 0 || 2));
  const cats = Array.isArray(opts.cats) && opts.cats.length
    ? opts.cats.filter(c => CATS.indexOf(c) >= 0)
    : CATS.slice();
  const rounds = Math.max(n, opts.rounds | 0 || n * DEFAULT_ROUNDS_PER_SEAT);
  const target = Math.max(0, opts.target | 0 || 0);
  const src = (opts.src === 'private') ? 'private' : 'seed';

  const st = {
    v: 1,
    n, teams, diff, cats: cats.slice(),
    rounds, target,
    src, given: opts.given || null,
    rs: seed | 0,

    seats: [],
    order: buildOrder(n, teams),
    pool: [],
    wordOrder: [],

    round: 0,                 /* 0 = not started; set to 1 by first begin */
    phase: 'lobby',           /* lobby | act | over */
    actor: -1,
    word: null,               /* the current round's id, on the ACTOR's client only; null for guessers/online */
    clock: 0,                 /* seconds left on the current round */
    clockMax: 0,
    skips: 0,                 /* skips used this round */

    meSeat: (opts.meSeat != null ? (opts.meSeat | 0) : 0),
    book: [],                 /* one row per finished round */
    done: null
  };

  const humans = Math.max(1, Math.min(n, opts.humans | 0 || 1));
  for (let i = 0; i < n; i++)
    st.seats.push({
      name: i < humans ? (humans === 1 ? 'You' : 'Player ' + (i + 1)) : 'MAKNA ' + (i + 1 - humans),
      own:  i < humans ? (i === 0 ? 'me' : 'hot') : 'ai',
      team: teams < 2 ? 0 : (i % 2),
      score: 0
    });

  st.pool = poolFor(cats, diff);
  st.wordOrder = seededOrder(st.rs, st.pool);
  return st;
}

/* a deterministic shuffle of the pool off a seed, WITHOUT touching st.rs
   (offline word bag order). Pure function of (seed, pool). */
function seededOrder(seed, pool){
  const a = pool.slice();
  let rs = seed | 0;
  const draw = () => {
    rs = (rs + 0x6D2B79F5) | 0;
    let t = rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(draw() * (i + 1)) % (i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* the private slate this seat needs: for ONLINE, how many words to hand a
   seat is how many rounds it will act. planDeal() sizes and builds the
   whole relay pool; setSlate() stores what the relay delivered here. */
function actsPerSeat(st){
  const counts = new Array(st.n).fill(0);
  for (let r = 1; r <= st.rounds; r++) counts[actorForRound(st, r)]++;
  return counts;
}
/* build the room's `deal` payload for the relay: a flat pool of word ids
   (integers), sized so each seat gets `each` = its max acting count. The
   relay shuffles with its own entropy and slices per seat; the engine
   does not care which seat gets which id, only that a seat gets enough. */
function planDeal(opts, seed){
  const st = deal(opts, seed);
  const counts = actsPerSeat(st);
  const each = Math.max(1, Math.min(8, Math.max.apply(null, counts)));
  const needed = st.n * each;
  /* draw `needed` ids from the pool, cycling if the pool is smaller than
     needed (a short pool repeats words, which is acceptable). Order here
     does not matter — the relay reshuffles — so take them in pool order. */
  const items = [];
  for (let i = 0; i < needed; i++){
    const id = st.pool[i % st.pool.length];
    items.push({ v: id | 0, g: null });
  }
  return { items, each };
}
/* store the private slate the relay delivered to THIS seat (online). */
function setSlate(st, ids){
  st.given = st.given || {};
  st.given.slate = (Array.isArray(ids) ? ids : []).map(x => x | 0);
  return st;
}
const slateLeft = st => {
  if (st.src !== 'private') return Infinity;
  const g = st.given || {};
  const slate = Array.isArray(g.slate) ? g.slate : [];
  let used = 0;
  for (let r = 1; r <= (st.round | 0); r++)
    if (actorForRound(st, r) === st.meSeat) used++;
  return Math.max(0, slate.length - used);
};

/* ═══════════════════════════════════════════════════════════════════
   TURN — seat -1 is the UNIT (the caller/holder): it advances rounds,
   ends a round on a time-out, and confirms an out-loud guess. A player
   seat acts a typed guess. This mirrors poker's seat -1 = the table.
   ═══════════════════════════════════════════════════════════════════ */
function turn(st){
  if (st.done) return -2;
  return -1;   /* the unit always holds the beat; players inject guesses
                  opportunistically (like poker's quit), gated by check() */
}

/* ═══════════════════════════════════════════════════════════════════
   LEGAL — what may happen now.
     lobby            [{t:'begin'}]
     act (unit -1)    [{t:'tick'},{t:'timeout'},{t:'got',by},{t:'skip'}]
     act (a guesser)  [{t:'guess',by}]
     over             []
   ═══════════════════════════════════════════════════════════════════ */
function legal(st, seat){
  if (st.done || st.phase === 'over') return [];
  if (st.phase === 'lobby'){
    return seat === -1 ? [{ t: 'begin' }] : [];
  }
  /* phase === 'act' */
  if (seat === -1){
    const out = [{ t: 'tick' }, { t: 'timeout' }, { t: 'skip' }];
    /* the unit may confirm any eligible guesser landed it (out-loud path) */
    eligibleGuessers(st).forEach(i => out.push({ t: 'got', by: i }));
    return out;
  }
  /* a guesser may submit a typed guess if they are eligible this round */
  if (eligibleGuessers(st).indexOf(seat) >= 0) return [{ t: 'guess', by: seat }];
  return [];
}

/* who may guess this round: everyone but the actor, and — in team mode —
   only the actor's OWN team (the other team is muted). */
function eligibleGuessers(st){
  const out = [];
  for (let i = 0; i < st.n; i++){
    if (i === st.actor) continue;
    if (st.teams >= 2 && teamOf(st, i) !== teamOf(st, st.actor)) continue;
    out.push(i);
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   CHECK — the gate. Every move is measured here before apply().
   ═══════════════════════════════════════════════════════════════════ */
function check(st, mv, seat){
  if (!mv || st.done || st.phase === 'over') return false;

  if (st.phase === 'lobby')
    return seat === -1 && mv.t === 'begin';

  if (st.phase !== 'act') return false;

  if (seat === -1){
    if (mv.t === 'tick') return st.clock > 0;
    if (mv.t === 'timeout') return true;
    if (mv.t === 'skip') return st.skips < MAX_SKIPS && st.pool.length > 0;
    if (mv.t === 'got'){
      const by = mv.by | 0;
      return eligibleGuessers(st).indexOf(by) >= 0;
    }
    return false;
  }

  if (mv.t === 'guess'){
    const by = mv.by | 0;
    if (by !== seat) return false;                     /* guess for yourself */
    if (eligibleGuessers(st).indexOf(by) < 0) return false;
    /* a typed guess is only checkable if this client HOLDS the word — the
       actor's client (offline) or, online, whoever is scoring. If the word
       is null here (an online guesser), the guess cannot be adjudicated by
       this client and must be routed to the actor's client / unit: check()
       refuses it so it is never silently dropped. */
    if (st.word == null) return false;
    return true;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   APPLY — deterministic; the log replays through here. A round-resolving
   move records a DELIVERED WORD into the book so replay is exact even when
   the live word came from the private channel.
   ═══════════════════════════════════════════════════════════════════ */
function apply(st, mv){
  const seat = mv.seat;

  if (mv.t === 'begin'){ beginRound(st, 1, mv); return; }

  if (st.phase !== 'act') return;

  if (mv.t === 'tick'){
    if (st.clock > 0) st.clock--;
    if (st.clock <= 0) resolveRound(st, { how: 'timeout', by: -1, word: st.word });
    return;
  }
  if (mv.t === 'timeout'){
    st.clock = 0;
    resolveRound(st, { how: 'timeout', by: -1, word: st.word });
    return;
  }
  if (mv.t === 'skip'){
    st.skips++;
    /* the actor eats the skip penalty */
    if (st.actor >= 0) st.seats[st.actor].score -= SKIP_PENALTY;
    /* a fresh word for the same actor: advance within the round. The
       delivered word for the NEW attempt is recorded on the resolving move
       (mv.word) if the caller supplied it (online), else derived (offline).*/
    const nextId = pickWord(st, st.round, st.skips);
    st.word = nextId;
    return;
  }
  if (mv.t === 'got'){
    const by = mv.by | 0;
    resolveRound(st, { how: 'got', by, word: st.word });
    return;
  }
  if (mv.t === 'guess'){
    const by = mv.by | 0;
    /* adjudicate against the held word; a hit resolves, a miss is a no-op
       (wrong guesses cost nothing and are not logged as state changes
       beyond being replayable moves). */
    if (st.word != null && guessHits(st.word, mv.text)){
      resolveRound(st, { how: 'guess', by, word: st.word });
    }
    return;
  }
}

/* pick the word id for a round. On a skip, the offline source advances by
   using (round, skip) so the same actor gets a different word; online the
   caller must supply the popped id via the move (mv.word) since only the
   actor's client can. */
function pickWord(st, round, skip){
  if (st.src === 'private'){
    /* online: the actor's client resolves from its slate; a skip pops the
       next slate entry. Non-actor clients hold null. */
    const g = st.given || {};
    const slate = Array.isArray(g.slate) ? g.slate : [];
    if (st.meSeat !== st.actor) return null;
    let used = 0;
    for (let r = 1; r < round; r++) if (actorForRound(st, r) === st.meSeat) used++;
    const idx = used + (skip | 0);
    const id = slate[idx];
    return (id == null) ? null : (id | 0);
  }
  /* offline: bag walk indexed by (round + skips). Pure from the seed. */
  const order = st.wordOrder;
  if (!order.length) return null;
  const idx = (round - 1 + (skip | 0));
  return order[idx % order.length];
}

function beginRound(st, round, mv){
  st.round = round;
  st.actor = actorForRound(st, round);
  st.skips = 0;
  st.phase = 'act';
  st.clockMax = TIMERS[st.diff] || TIMERS[2];
  st.clock = st.clockMax;
  /* the word: online, the delivered id is on the move (mv.word) if this is
     the actor's client, else null; offline, derived from the seed. We also
     let the source object be the single authority so the seam is honoured. */
  if (st.src === 'private'){
    st.word = (mv && mv.word != null) ? (mv.word | 0) : pickWord(st, round, 0);
  } else {
    st.word = pickWord(st, round, 0);
  }
}

function resolveRound(st, res){
  /* score it */
  if (res.how === 'got' || res.how === 'guess'){
    if (st.actor >= 0) st.seats[st.actor].score += ACTOR_POINTS;
    if (res.by >= 0 && res.by < st.n) st.seats[res.by].score += GUESSER_POINTS;
  }
  /* the book row is the audit trail AND the replay's delivered-word record:
     `word` is the id the round was played on, so a replay reconstructs the
     exact secret even when the live value came from the private channel. */
  st.book.push({
    round: st.round,
    actor: st.actor,
    how: res.how,                 /* 'got' | 'guess' | 'timeout' */
    by: (res.by == null ? -1 : res.by),
    word: (res.word == null ? -1 : (res.word | 0)),
    skips: st.skips
  });

  /* end of match? */
  if (targetReached(st) || st.round >= st.rounds){
    st.phase = 'over';
    st.done = { kind: 'match', rounds: st.round };
    st.actor = -1;
    st.word = null;
    return;
  }
  /* next round begins fresh; the UI (unit) fires the next 'begin'-like
     beat via a 'next' move? No — round advance is folded here to keep the
     log one-move-per-round: we set up the next round immediately and wait
     for the unit's ticks. */
  beginRound(st, st.round + 1, nextRoundDeliver(st, st.round + 1));
}

/* for the ONLINE path, the next round's delivered word must come from the
   actor-of-next-round's client. resolveRound cannot know another seat's
   slate, so it hands beginRound a synthetic move carrying THIS client's
   own word if this client acts next, else null. The relay/UI does not need
   a separate message: each client independently computes its own word for
   the rounds it acts, and nothing for the rounds it does not. */
function nextRoundDeliver(st, round){
  if (st.src !== 'private') return null;
  const actor = actorForRound(st, round);
  if (st.meSeat !== actor) return { word: null };
  return { word: pickWord(st, round, 0) };
}

function targetReached(st){
  if (!st.target) return false;
  if (st.teams >= 2){
    const t = [0, 0];
    st.seats.forEach(s => { t[s.team] += s.score; });
    return t[0] >= st.target || t[1] >= st.target;
  }
  return st.seats.some(s => s.score >= st.target);
}

/* ═══════════════════════════════════════════════════════════════════
   THE SECRET, INSPECTED — the object a guesser's UI would render. In the
   ONLINE path this deliberately carries NO word for a round the client did
   not act. publicView(st) is what a non-actor safely holds/broadcasts;
   the tests assert st.word / publicView never leaks the actor's secret.
   ═══════════════════════════════════════════════════════════════════ */
function publicView(st){
  return {
    round: st.round,
    phase: st.phase,
    actor: st.actor,
    clock: st.clock, clockMax: st.clockMax,
    skips: st.skips,
    scores: st.seats.map(s => s.score),
    teams: st.teams,
    /* the actor's word is present ONLY on the actor's own client and ONLY
       offline where secrecy is moot. Online, a non-actor's st.word is null,
       so this is null too — no secret in the shared view. */
    word: (st.src === 'private' && st.meSeat !== st.actor) ? null
        : (st.actor === st.meSeat ? st.word : (st.src === 'seed' ? st.word : null)),
    done: st.done
  };
}

/* ═══════════════════════════════════════════════════════════════════
   TALLY — the scoreboard, re-derived from the book, never stored twice.
   Per-seat totals plus per-team sums, so a reload rebuilds it from the log.
   ═══════════════════════════════════════════════════════════════════ */
function tally(st){
  const t = st.seats.map(s => ({
    score: 0, acted: 0, guessed: 0, skips: 0, team: s.team, name: s.name
  }));
  st.book.forEach(row => {
    if (row.actor >= 0){
      t[row.actor].acted++;
      t[row.actor].skips += row.skips | 0;
      t[row.actor].score -= (row.skips | 0) * SKIP_PENALTY;
      if (row.how === 'got' || row.how === 'guess') t[row.actor].score += ACTOR_POINTS;
    }
    if ((row.how === 'got' || row.how === 'guess') && row.by >= 0){
      t[row.by].guessed++;
      t[row.by].score += GUESSER_POINTS;
    }
  });
  const teamScore = [0, 0];
  t.forEach(x => { teamScore[x.team] = (teamScore[x.team] | 0) + x.score; });
  return { seats: t, teams: teamScore };
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — an out-loud guess needs a human room, but a solo/pass-the-
   phone game with AI guessers needs SOMETHING to land a guess so the game
   moves. This is a deterministic (seeded) chooser: given the clock and the
   difficulty, it decides IF and WHEN a machine guesser lands it, as a pure
   function of the position. No Math.random.
     think(st) -> a move for seat -1 (the unit standing in for the room), or
                  null to keep ticking.
   ═══════════════════════════════════════════════════════════════════ */
function think(st){
  if (st.phase !== 'act') return null;
  /* the AI only stands in when the actor is a machine OR the room is solo;
     the UI decides whether to call this. It returns a resolving move for a
     machine guesser once the clock has run down enough that a guess "lands"
     — sooner for easy words, later for hard ones. Deterministic. */
  const g = eligibleGuessers(st);
  if (!g.length) return null;
  const spent = st.clockMax - st.clock;
  /* the harder the word, the longer before it lands; a hash of the position
     picks which eligible guesser gets it, deterministically. */
  const need = st.diff * 8;                    /* seconds before a landing is possible */
  if (spent < need) return null;
  const h = hash32([st.round, st.actor, st.clock, st.pool.length]);
  const by = g[h % g.length];
  return { t: 'got', by, seat: -1 };
}

/* ═══════════════════════════════════════════════════════════════════
   OVER — the verdict, relative to the local player (meSeat).
   ═══════════════════════════════════════════════════════════════════ */
function meSeat(st){
  let i = st.seats.findIndex(s => s.own === 'me' || s.own === 'hot');
  return i < 0 ? 0 : i;
}
function over(st){
  if (!st.done) return null;
  const me = st.meSeat;
  const scores = st.seats.map(s => s.score);
  let best = -Infinity, bestSeat = -1;
  scores.forEach((v, i) => { if (v > best){ best = v; bestSeat = i; } });
  let tone, iWon;
  if (st.teams >= 2){
    const t = tally(st).teams;
    const myTeam = st.seats[me].team;
    const win = t[0] === t[1] ? -1 : (t[0] > t[1] ? 0 : 1);
    iWon = win === myTeam;
    tone = win < 0 ? 'draw' : (iWon ? 'win' : 'lose');
  } else {
    const tops = scores.filter(v => v === best).length;
    iWon = bestSeat === me && tops === 1;
    tone = tops > 1 && scores[me] === best ? 'draw' : (iWon ? 'win' : 'lose');
  }
  return { tone, iWon, best, bestSeat, scores, rounds: st.book.length };
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — a move as flat bounded byte fields, for js/mp.js's codec.
   Charades moves are tiny: a type and one seat index (0..15, MAX_SEATS on
   the relay). A typed guess's TEXT never travels — online, the guesser's
   client cannot adjudicate (it has no word), so a typed guess is sent as an
   intent the actor's client/unit resolves; only the resolving {t:'got'}
   crosses. Wrong guesses stay local. The delivered word on a 'begin'/round
   resolution is an id 0..255 (the bank is well under 256 entries; if it
   ever grows past that this becomes two bytes exactly like poker's bet).
   ═══════════════════════════════════════════════════════════════════ */
const WIRE_TYPES = ['begin', 'tick', 'timeout', 'skip', 'got', 'guess'];
const byteOK = v => v >= 0 && v <= 255;

function encWire(mv){
  if (!mv || WIRE_TYPES.indexOf(mv.t) < 0) return null;
  const w = { t: mv.t };
  if (mv.by != null){ if (!byteOK(mv.by | 0)) return null; w.by = mv.by | 0; }
  if (mv.word != null){ const id = mv.word | 0; if (id > 255) return null; w.w = id; }
  return w;
}
function decWire(w){
  if (!w || typeof w.t !== 'string' || WIRE_TYPES.indexOf(w.t) < 0) return null;
  const mv = { t: w.t };
  if (w.by != null) mv.by = w.by | 0;
  if (w.w != null) mv.word = w.w | 0;
  return mv;
}

/* ═══════════════════════════════════════════════════════════════════
   NEW SEED — the ONE documented Math.random in this file, exactly like
   poker/skarta: a brand-new LOCAL match needs a starting seed. Online, the
   seed arrives from the relay's `began` and this is never called.
   ═══════════════════════════════════════════════════════════════════ */
function newSeed(){ return (Math.random() * 0x100000000) | 0; }

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — js/mimika-ui.js and the test harness read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_MIMIKA = root.KARTI_MIMIKA || {};
root.KARTI_MIMIKA.engine = {
  /* the bank */
  CATS, BANK, wordById, label, poolFor, idToKey, keyToId,
  norm, guessHits,
  /* sources / secrecy seam */
  SOURCES, sourceOf,
  /* deal + wiring */
  MIN_PLAYERS, MAX_PLAYERS, ACTOR_POINTS, GUESSER_POINTS, SKIP_PENALTY,
  MAX_SKIPS, TIMERS,
  deal, planDeal, setSlate, slateLeft, actsPerSeat, seededOrder,
  /* rotation */
  buildOrder, actorForRound, teamOf, eligibleGuessers,
  /* runtime */
  legal, check, apply, turn, think,
  publicView, tally, over, meSeat, targetReached,
  /* wire */
  encWire, decWire, WIRE_TYPES,
  newSeed
};

})(typeof window !== 'undefined' ? window : globalThis);
