/* ═══════════════════════════════════════════════════════════════════
   KARTI — minhu.js
   MIN HU?  ("who is it?")  ·  the classic 1v1 guess-who deduction game,
   the pure engine. Rules only: no DOM, no clock, and NO Math.random in
   this file except the one documented fresh-match seed pick (newSeed).
   The screen half is js/minhu-ui.js and follows js/ludu-ui.js's runner
   shape: a match is (opts, seed, log), the state is deal() plus a replay
   of the log, and rollback is cutting the log.

   THE GAME
     Two players. Each is dealt ONE secret character out of a cast of 24.
     A board of the same 24 faces sits in front of both. On your turn you
     ASK a yes/no question about a visible attribute of the OPPONENT's
     secret character ("does it have a beard?", "is the hair red?"). The
     answer is truthful, and it eliminates every face that disagrees —
     you flip those down. When you are sure, you GUESS a character by
     name. A correct guess WINS. A wrong guess LOSES (classic Guess Who).

   ── THE SECRET IS INJECTED. READ THIS BEFORE CHANGING ANYTHING. ──────
     Same problem poker has, in its purest form: a shared seed that both
     phones derive from would let each phone compute the OTHER's secret,
     which is the whole game. So the secret is NOT hard-wired. It is one
     injectable source with two implementations and one interface —
     make(st) -> secrets[] where secrets[i] is seat i's character index
     (0..N-1) or null ("this client was not told that seat's character"):

       SECRETS.seed     derives both secrets from st.rs. A pure random
                        deal, used only for the "surprise me" fallback on
                        the pick screen (and legacy saves). Honest offline
                        because one device holds both secrets and shows
                        each only to the player looking. NEVER back an
                        online table with it: the opponent's phone could
                        read it off the seed.
       SECRETS.private  takes the character index delivered PER SEAT
                        (st.given.secret[seatIndex]) and leaves any seat it
                        was not told about null. This is the seam BOTH the
                        player-pick and the online table run through:

                          · PICK-YOUR-OWN (offline / pass-the-phone): the
                            two players choose their faces on the handover
                            pick screen; this device holds BOTH picks in
                            given.secret={0:x,1:y} and shows each only to
                            the player looking. Player-chosen, not dealt.
                          · ONLINE: each seat picks LOCALLY and the relay
                            pushes only that seat's own index to its own
                            phone (given.secret={mySeat:x}); the opponent's
                            pick is never in any message this client sees,
                            so given.secret has just our seat and the
                            opponent stays null forever. The pick replaces
                            the deal, but the secrecy is identical: one seat
                            wide, poker's DEALERS.private.

     Everything downstream — the question mechanic, elimination, the win
     check, the AI, the wire — is identical between the two. The seam is
     one function.

   ── WHO ANSWERS A QUESTION, AND THE TRUST THAT BUYS ──────────────────
     A question is truthful ABOUT THE OPPONENT'S SECRET — and online, the
     ONLY client that knows the opponent's secret is the opponent's own
     phone. So online, the opponent's client computes the answer from its
     own secret and sends back one bit. That is the same friendly trust
     every other KARTI hidden-role game documents: in L-Ispjun you declare
     your own word, in Suspett you declare your own death, here you answer
     truthfully about your own face. answer(secret, q) is a PURE function
     of a secret and a question, so given a reveal at the end the whole
     game is VERIFIABLE: replay every answered question against the
     revealed secret and any lie shows up as a mismatch. verify() does
     exactly that and the UI can call it at reveal to flag a cheat.

     OFFLINE there is no trust to spend: one device holds both secrets,
     so answer() reads the true secret directly and cannot lie.

   THE WIN / LOSS RULE (documented, deterministic)
     · A correct guess wins immediately.
     · A wrong guess LOSES immediately — the standard Guess Who penalty.
       (The alternative, a turn penalty, makes a wrong guess free late in
       the game and removes all tension; we take the classic rule.)
     · If a player has exactly one face still in the running it is not an
       automatic win — they must still spend a turn to GUESS it. That
       keeps the move sequence honest and replayable.

   DETERMINISM
     st.rs is the entire RNG. The AI is a pure function of the state (its
     "randomness" is a hash of the position, never a clock, never
     Math.random), so every phone replays every move to the identical
     board. The one Math.random is newSeed() for a brand-new local match,
     exactly poker's and ludu's pattern.

   THE ROSTER
     24 characters, each an id, a name ({en,mt}) and an attribute vector
     over a fixed SCHEMA (hair colour, hair length, facial hair, glasses,
     hat, eye colour, earrings, skin tone, and one distinguishing
     feature). The roster and schema are exported so the UI can render
     the faces and the picker, and so the face IMAGES can be generated to
     match. The attributes are chosen so a good question roughly halves
     the field — the deduction actually works.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(root){

/* ═══════════════════════════════════════════════════════════════════
   THE ATTRIBUTE SCHEMA
   Each attribute is a key, a set of values, and {en,mt} labels for the
   attribute and every value. A "question" is one (key, value) pair —
   "is <attribute> == <value>?" — which is exactly a yes/no split of the
   board. Every value below is used by at least two characters and at
   most a handful, so no single question is dead (splits nobody) and none
   is a giveaway (splits one). The UI groups questions by attribute.
   ═══════════════════════════════════════════════════════════════════ */
const SCHEMA = [
  { key:'hair', label:{ en:'Hair colour', mt:'Kulur tax-xagħar' },
    values:[
      { v:'black', en:'black',  mt:'iswed'  },
      { v:'brown', en:'brown',  mt:'kannella'},
      { v:'blond', en:'blond',  mt:'blond'  },
      { v:'red',   en:'red',    mt:'aħmar'  },
      { v:'white', en:'white',  mt:'abjad'  },
      { v:'bald',  en:'bald',   mt:'fela'   }
    ] },
  { key:'length', label:{ en:'Hair length', mt:'Tul tax-xagħar' },
    values:[
      { v:'short', en:'short', mt:'qasir' },
      { v:'long',  en:'long',  mt:'twil'  },
      { v:'none',  en:'no hair', mt:'bla xagħar' }
    ] },
  { key:'facial', label:{ en:'Facial hair', mt:'Xagħar tal-wiċċ' },
    values:[
      { v:'none',      en:'clean-shaven', mt:'imqaxxar'   },
      { v:'moustache', en:'a moustache',  mt:'mustaċċi'   },
      { v:'beard',     en:'a beard',      mt:'daqna'      }
    ] },
  { key:'glasses', label:{ en:'Glasses', mt:'Nuċċali' },
    values:[
      { v:'yes', en:'glasses',    mt:'nuċċali'     },
      { v:'no',  en:'no glasses', mt:'bla nuċċali' }
    ] },
  { key:'hat', label:{ en:'Hat', mt:'Kappell' },
    values:[
      { v:'yes', en:'a hat',   mt:'kappell'     },
      { v:'no',  en:'no hat',  mt:'bla kappell' }
    ] },
  { key:'eyes', label:{ en:'Eye colour', mt:'Kulur tal-għajnejn' },
    values:[
      { v:'brown', en:'brown eyes', mt:'għajnejn kannella' },
      { v:'blue',  en:'blue eyes',  mt:'għajnejn blu'      },
      { v:'green', en:'green eyes', mt:'għajnejn ħodor'    }
    ] },
  { key:'earring', label:{ en:'Earrings', mt:'Imsielet' },
    values:[
      { v:'yes', en:'earrings',    mt:'imsielet'     },
      { v:'no',  en:'no earrings', mt:'bla msielet'  }
    ] },
  { key:'skin', label:{ en:'Skin tone', mt:'Kulur tal-ġilda' },
    values:[
      { v:'light', en:'light skin', mt:'ġilda ċara'  },
      { v:'olive', en:'olive skin', mt:'ġilda żejtnija' },
      { v:'dark',  en:'dark skin',  mt:'ġilda skura' }
    ] },
  { key:'feature', label:{ en:'Special feature', mt:'Sinjal partikolari' },
    values:[
      { v:'none',    en:'nothing special', mt:'xejn partikolari' },
      { v:'freckles',en:'freckles',        mt:'tbajja’ tax-xemx' },
      { v:'mole',    en:'a beauty spot',   mt:'nemus'            },
      { v:'rosy',    en:'rosy cheeks',     mt:'ħaddejn ħomor'    }
    ] }
];
const SCHEMA_BY = (() => { const m = {}; SCHEMA.forEach(a => { m[a.key] = a; }); return m; })();

/* the {en,mt} label for a (key,value) pair — the UI renders it, never an
   id. Returns a pair so lang.js's T() can pick the side. */
function valLabel(key, v){
  const a = SCHEMA_BY[key];
  if (!a) return { en:String(v), mt:String(v) };
  const o = a.values.find(x => x.v === v);
  return o ? { en:o.en, mt:o.mt } : { en:String(v), mt:String(v) };
}
function attrLabel(key){
  const a = SCHEMA_BY[key];
  return a ? a.label : { en:key, mt:key };
}

/* ═══════════════════════════════════════════════════════════════════
   THE ROSTER — 24 characters. A Maltese-flavoured cast; the NAME is the
   character's name in both languages (lang.js rule 3), so most are the
   same word either side. The attribute vectors are hand-balanced: run
   fieldSplit() over every question and each cuts the 24 into two parts
   that are both non-empty (verified by the test harness).

   The face IMAGE for character <id> loads from art/minhu/<id>.png; until
   it exists the UI draws an SVG face from these very attributes, so the
   game is playable before a single image is generated.
   ═══════════════════════════════════════════════════════════════════ */
const ROSTER = [
  { id:'ġanni', name:{en:'Ġanni',mt:'Ġanni'}, a:{ hair:'brown', length:'short', facial:'none', glasses:'yes', hat:'no', eyes:'green', earring:'yes', skin:'dark', feature:'none' } },
  { id:'marija', name:{en:'Marija',mt:'Marija'}, a:{ hair:'brown', length:'long', facial:'none', glasses:'no', hat:'no', eyes:'blue', earring:'no', skin:'olive', feature:'mole' } },
  { id:'ċetta', name:{en:'Ċetta',mt:'Ċetta'}, a:{ hair:'white', length:'long', facial:'none', glasses:'yes', hat:'yes', eyes:'brown', earring:'no', skin:'light', feature:'rosy' } },
  { id:'wiġi', name:{en:'Wiġi',mt:'Wiġi'}, a:{ hair:'red', length:'short', facial:'beard', glasses:'no', hat:'yes', eyes:'blue', earring:'no', skin:'light', feature:'mole' } },
  { id:'pawlu', name:{en:'Pawlu',mt:'Pawlu'}, a:{ hair:'bald', length:'none', facial:'beard', glasses:'no', hat:'yes', eyes:'brown', earring:'yes', skin:'olive', feature:'freckles' } },
  { id:'rita', name:{en:'Rita',mt:'Rita'}, a:{ hair:'red', length:'long', facial:'none', glasses:'no', hat:'no', eyes:'blue', earring:'yes', skin:'olive', feature:'rosy' } },
  { id:'kelinu', name:{en:'Kelinu',mt:'Kelinu'}, a:{ hair:'black', length:'short', facial:'none', glasses:'yes', hat:'no', eyes:'green', earring:'yes', skin:'dark', feature:'none' } },
  { id:'lorna', name:{en:'Lorna',mt:'Lorna'}, a:{ hair:'blond', length:'short', facial:'none', glasses:'yes', hat:'yes', eyes:'blue', earring:'yes', skin:'dark', feature:'none' } },
  { id:'ġorġ', name:{en:'Ġorġ',mt:'Ġorġ'}, a:{ hair:'black', length:'long', facial:'none', glasses:'no', hat:'no', eyes:'blue', earring:'yes', skin:'dark', feature:'mole' } },
  { id:'doris', name:{en:'Doris',mt:'Doris'}, a:{ hair:'black', length:'short', facial:'none', glasses:'yes', hat:'yes', eyes:'blue', earring:'no', skin:'light', feature:'mole' } },
  { id:'salvu', name:{en:'Salvu',mt:'Salvu'}, a:{ hair:'black', length:'short', facial:'none', glasses:'no', hat:'yes', eyes:'brown', earring:'no', skin:'dark', feature:'none' } },
  { id:'josette', name:{en:'Josette',mt:'Josette'}, a:{ hair:'red', length:'long', facial:'none', glasses:'yes', hat:'no', eyes:'brown', earring:'yes', skin:'dark', feature:'mole' } },
  { id:'tumas', name:{en:'Tumas',mt:'Tumas'}, a:{ hair:'bald', length:'none', facial:'moustache', glasses:'no', hat:'yes', eyes:'brown', earring:'no', skin:'dark', feature:'freckles' } },
  { id:'grezz', name:{en:'Grezz',mt:'Grezz'}, a:{ hair:'brown', length:'short', facial:'none', glasses:'yes', hat:'no', eyes:'blue', earring:'no', skin:'light', feature:'freckles' } },
  { id:'nardu', name:{en:'Nardu',mt:'Nardu'}, a:{ hair:'blond', length:'long', facial:'beard', glasses:'yes', hat:'no', eyes:'blue', earring:'no', skin:'dark', feature:'mole' } },
  { id:'karm', name:{en:'Karm',mt:'Karm'}, a:{ hair:'bald', length:'none', facial:'beard', glasses:'yes', hat:'yes', eyes:'green', earring:'yes', skin:'olive', feature:'freckles' } },
  { id:'anġla', name:{en:'Anġla',mt:'Anġla'}, a:{ hair:'brown', length:'short', facial:'none', glasses:'yes', hat:'yes', eyes:'green', earring:'no', skin:'dark', feature:'freckles' } },
  { id:'sam', name:{en:'Sam',mt:'Sam'}, a:{ hair:'black', length:'long', facial:'moustache', glasses:'no', hat:'yes', eyes:'green', earring:'no', skin:'light', feature:'mole' } },
  { id:'rożi', name:{en:'Rożi',mt:'Rożi'}, a:{ hair:'white', length:'short', facial:'none', glasses:'no', hat:'no', eyes:'brown', earring:'yes', skin:'olive', feature:'freckles' } },
  { id:'toni', name:{en:'Toni',mt:'Toni'}, a:{ hair:'brown', length:'short', facial:'none', glasses:'yes', hat:'yes', eyes:'green', earring:'no', skin:'light', feature:'mole' } },
  { id:'nina', name:{en:'Nina',mt:'Nina'}, a:{ hair:'white', length:'short', facial:'none', glasses:'no', hat:'no', eyes:'brown', earring:'yes', skin:'light', feature:'none' } },
  { id:'żeppi', name:{en:'Żeppi',mt:'Żeppi'}, a:{ hair:'black', length:'long', facial:'moustache', glasses:'no', hat:'no', eyes:'brown', earring:'yes', skin:'dark', feature:'none' } },
  { id:'liza', name:{en:'Liza',mt:'Liza'}, a:{ hair:'white', length:'long', facial:'none', glasses:'no', hat:'yes', eyes:'brown', earring:'no', skin:'light', feature:'freckles' } },
  { id:'benny', name:{en:'Benny',mt:'Benny'}, a:{ hair:'bald', length:'none', facial:'beard', glasses:'no', hat:'no', eyes:'brown', earring:'yes', skin:'dark', feature:'rosy' } },
  { id:'lolli', name:{en:'Lolli',mt:'Lolli'}, a:{ hair:'bald', length:'none', facial:'moustache', glasses:'yes', hat:'no', eyes:'brown', earring:'no', skin:'olive', feature:'rosy' } },
  { id:'ċensu', name:{en:'Ċensu',mt:'Ċensu'}, a:{ hair:'red', length:'long', facial:'beard', glasses:'yes', hat:'yes', eyes:'brown', earring:'yes', skin:'light', feature:'freckles' } },
  { id:'natali', name:{en:'Natali',mt:'Natali'}, a:{ hair:'red', length:'short', facial:'none', glasses:'no', hat:'no', eyes:'blue', earring:'yes', skin:'dark', feature:'rosy' } },
  { id:'katrin', name:{en:'Katrin',mt:'Katrin'}, a:{ hair:'blond', length:'long', facial:'none', glasses:'yes', hat:'yes', eyes:'green', earring:'yes', skin:'olive', feature:'mole' } },
  { id:'ġużeppi', name:{en:'Ġużeppi',mt:'Ġużeppi'}, a:{ hair:'bald', length:'none', facial:'moustache', glasses:'yes', hat:'no', eyes:'green', earring:'no', skin:'olive', feature:'rosy' } },
  { id:'rożanna', name:{en:'Rożanna',mt:'Rożanna'}, a:{ hair:'red', length:'long', facial:'none', glasses:'no', hat:'no', eyes:'blue', earring:'no', skin:'olive', feature:'freckles' } },
  { id:'indri', name:{en:'Indri',mt:'Indri'}, a:{ hair:'white', length:'long', facial:'none', glasses:'yes', hat:'yes', eyes:'blue', earring:'yes', skin:'light', feature:'none' } },
  { id:'melita', name:{en:'Melita',mt:'Melita'}, a:{ hair:'brown', length:'long', facial:'none', glasses:'no', hat:'yes', eyes:'green', earring:'yes', skin:'olive', feature:'none' } },
  { id:'karmnu', name:{en:'Karmnu',mt:'Karmnu'}, a:{ hair:'blond', length:'short', facial:'beard', glasses:'yes', hat:'yes', eyes:'green', earring:'yes', skin:'light', feature:'none' } },
  { id:'żaren', name:{en:'Żaren',mt:'Żaren'}, a:{ hair:'blond', length:'short', facial:'moustache', glasses:'no', hat:'yes', eyes:'green', earring:'no', skin:'light', feature:'rosy' } },
  { id:'polina', name:{en:'Polina',mt:'Polina'}, a:{ hair:'white', length:'long', facial:'none', glasses:'yes', hat:'no', eyes:'blue', earring:'no', skin:'olive', feature:'rosy' } },
  { id:'silvju', name:{en:'Silvju',mt:'Silvju'}, a:{ hair:'blond', length:'short', facial:'moustache', glasses:'no', hat:'no', eyes:'green', earring:'no', skin:'olive', feature:'rosy' } }
];
const N = ROSTER.length;                          /* 36 */
const idOf   = i => (ROSTER[i] ? ROSTER[i].id : null);
const indexOfId = id => ROSTER.findIndex(c => c.id === id);
const attrOf = i => (ROSTER[i] ? ROSTER[i].a : null);

/* ═══════════════════════════════════════════════════════════════════
   THE QUESTIONS — every legal (key,value) pair, each a live split of the
   full 24. fieldSplit(q) is how many characters answer YES. The UI reads
   QUESTIONS to build the picker; the AI reads it to choose. A question
   whose yes-count is 0 or N would be useless, so QUESTIONS omits any such
   pair (there are none, by construction — the test harness asserts it).
   ═══════════════════════════════════════════════════════════════════ */
function buildQuestions(){
  const out = [];
  SCHEMA.forEach(a => {
    a.values.forEach(val => {
      let yes = 0;
      for (let i = 0; i < N; i++) if (attrOf(i)[a.key] === val.v) yes++;
      if (yes > 0 && yes < N) out.push({ key:a.key, val:val.v, yes });
    });
  });
  return out;
}
const QUESTIONS = buildQuestions();
/* does character `i` answer YES to question q? — the truthful predicate */
function matches(i, q){ const a = attrOf(i); return !!a && a[q.key] === q.val; }
/* the truthful answer about a known secret: the bit the opponent's phone
   (or the offline device) returns. PURE — see the header on verifiability */
function answer(secret, q){
  return matches(secret, q) ? 1 : 0;
}

/* ═══════════════════════════════════════════════════════════════════
   THE SECRET — the injectable seam. See the header.
   make(st) -> [secret0, secret1]  (each 0..N-1 or null: not-told)
   NOTHING ELSE in this file may pick a secret.
   ═══════════════════════════════════════════════════════════════════ */
const SECRETS = {
  /* (a) FROM THE SEED — the "surprise me" random fallback on the pick
     screen (and legacy saves). One device holds both, so it is honest to
     derive both from st.rs; each is shown only to the player looking.
     NEVER back an online table with this. */
  seed: {
    id:'seed',
    make(st){
      const bag = [];
      for (let i = 0; i < N; i++) bag.push(i);
      shuffle(st, bag);
      return [bag[0], bag[1]];
    }
  },
  /* (b) PER-SEAT DELIVERY — online. st.given.secret is a map
     {seatIndex:charIndex} of whatever the relay told THIS client, which
     is only ever this seat's own. A seat we were not told is null and
     stays unknown on this client forever, which is exactly right. */
  private: {
    id:'private',
    make(st){
      const g = (st.given && st.given.secret) || {};
      return [ pick(g, 0), pick(g, 1) ];
      function pick(map, seat){
        const v = map[seat];
        return (typeof v === 'number' && v >= 0 && v < N) ? v : null;
      }
    }
  }
};
const sourceOf = st => SECRETS[st.deal] || SECRETS.seed;

/* ── seeded randomness — the whole RNG state is st.rs (poker's) ─────── */
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
function newSeed(){ return (Math.random() * 0x100000000) | 0 >>> 0; }

/* ═══════════════════════════════════════════════════════════════════
   THE TABLE
   opts: { humans, lvl, deal, given }
     humans  1 → you vs the machine (seat 1 is 'ai')
             2 → pass-the-phone (both seats human on this device)
     deal    'seed'    both secrets from st.rs (offline)
             'private' secrets injected per seat (online)
     given   { secret:{seatIndex:charIndex} }  the private inbox
   ═══════════════════════════════════════════════════════════════════ */
const SEATS = 2;
const MIN_SEATS = 2, MAX_SEATS = 2;

function deal(opts, seed){
  opts = opts || {};
  const humans = Math.max(1, Math.min(2, opts.humans | 0 || 1));
  const st = {
    v:1, n:SEATS,
    deal: (opts.deal === 'private') ? 'private' : 'seed',
    given: opts.given || null,
    rs: seed | 0,
    turn: 0,                                  /* seat 0 asks first */
    seats: [],
    secret: [],                               /* secret[i] = char index or null */
    /* board[i][c] — is character c still standing for seat i? Each seat
       keeps its OWN board (its eliminations), so a flip is per player. */
    board: [],
    log2: [],                                 /* human-readable trace: {seat,t,...} */
    asked: [],                                /* every answered question, for verify() */
    done: null                                /* {winner, reason, wrong?} */
  };
  for (let i = 0; i < SEATS; i++){
    st.seats.push({
      name: i === 0 ? 'You' : (humans === 2 ? 'Player 2' : 'MAKNA'),
      own:  i === 0 ? 'me' : (humans === 2 ? 'hot' : 'ai'),
      lvl:  opts.lvl | 0 || 2
    });
    const row = new Array(N).fill(true);
    st.board.push(row);
  }
  const sec = sourceOf(st).make(st);
  st.secret = [ sec[0], sec[1] ];
  return st;
}

/* the seat whose move it is; -1 nobody (game over) */
function turn(st){ return st.done ? -1 : st.turn; }
function opp(seat){ return seat ^ 1; }
function over(st){ return st.done || null; }

/* how many faces seat i still has standing */
function standing(st, seat){
  const row = st.board[seat]; let n = 0;
  for (let c = 0; c < N; c++) if (row[c]) n++;
  return n;
}
/* the standing character indices for a seat */
function standingList(st, seat){
  const row = st.board[seat], out = [];
  for (let c = 0; c < N; c++) if (row[c]) out.push(c);
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   MOVES
     { t:'ask',   key, val }        ask a STRUCTURED yes/no question this
                                    turn — a (key,value) attribute pair.
                                    The opponent's phone answers truthfully
                                    and the bit is recorded + VERIFIABLE.
     { t:'talk',  a }               the IN-THE-ROOM turn. The asker said a
                                    question OUT LOUD (no attribute), the
                                    opponent just taps YES/NO and that bit
                                    `a` is the move. It passes the turn like
                                    an ask, but carries no (key,val), so it
                                    is NOT in st.asked and NOT verifiable —
                                    there is nothing structured to check it
                                    against. The asker flips faces by hand
                                    (the free `flip` move). Trust model: the
                                    answerer answers honestly, same friendly
                                    trust as every other move; a spoken
                                    question simply cannot be audited, so
                                    talk mode is for tables who can see each
                                    other. Remote play should use `ask`.
     { t:'flip',  c, down }         flip face c down(true)/up(false) on
                                    YOUR OWN board — bookkeeping, does not
                                    end the turn, not turn-gated by whose
                                    "ask" it is (you tidy your own board)
     { t:'guess', c }               name character c as the opponent's
     { t:'quit' }                   walk out (forfeit)

   A turn is: ask OR talk (→ opponent answers, turn passes) OR guess (→
   resolves the game). flip is free bookkeeping either player may do to
   their own board at any time; it is logged so a replay reproduces the
   exact board.
   ═══════════════════════════════════════════════════════════════════ */
function legal(st, seat){
  if (st.done) return [];
  const out = [];
  if (seat === st.turn){
    QUESTIONS.forEach(q => out.push({ t:'ask', key:q.key, val:q.val }));
    out.push({ t:'talk', a:1 }); out.push({ t:'talk', a:0 });   /* IRL yes/no */
    for (let c = 0; c < N; c++) out.push({ t:'guess', c });
  }
  /* flips are always legal on your own standing/flipped faces */
  for (let c = 0; c < N; c++){
    out.push({ t:'flip', c, down: st.board[seat][c] });   /* toggle */
  }
  out.push({ t:'quit' });
  return out;
}

function check(st, mv, seat){
  if (!mv || st.done) return mv && mv.t === 'quit' ? true : false;
  if (mv.t === 'quit') return seat >= 0 && seat < SEATS;
  if (mv.t === 'flip'){
    const c = mv.c | 0;
    return c >= 0 && c < N;                    /* toggle either way, any time */
  }
  if (seat !== st.turn) return false;
  if (mv.t === 'ask'){
    return QUESTIONS.some(q => q.key === mv.key && q.val === mv.val);
  }
  if (mv.t === 'talk'){
    return mv.a === 0 || mv.a === 1;              /* a free-form yes/no bit */
  }
  if (mv.t === 'guess'){
    const c = mv.c | 0;
    return c >= 0 && c < N;
  }
  return false;
}

/* the truthful answer to an ask about the OPPONENT's secret. Offline the
   engine holds both secrets and reads it directly; online this is what
   the opponent's client computes and returns (see header). Either way it
   is answer(oppSecret, q), a pure function of the secret and question. */
function answerFor(st, seat, q){
  const s = st.secret[opp(seat)];
  if (typeof s !== 'number') return null;      /* we do not know it (online, our view) */
  return answer(s, q);
}

/* ═══════════════════════════════════════════════════════════════════
   APPLY — deterministic; the log replays through here. An 'ask' stamps
   the truthful answer onto the move as mv.a (0/1) when this client can
   compute it; online, mv.a arrives from the opponent's phone on the wire.
   ═══════════════════════════════════════════════════════════════════ */
function apply(st, mv){
  const seat = mv.seat;
  if (mv.t === 'quit'){
    if (st.done) return;
    st.done = { winner: opp(seat), reason:'quit' };
    return;
  }
  if (mv.t === 'flip'){
    const c = mv.c | 0;
    st.board[seat][c] = !mv.down ? true : false;   /* down=true → not standing */
    st.log2.push({ seat, t:'flip', c, down: !!mv.down });
    return;
  }
  if (mv.t === 'ask'){
    const q = { key:mv.key, val:mv.val };
    /* the answer: prefer the one carried on the move (wire / opponent's
       phone); else compute it locally (offline, we hold both secrets) */
    let a = (mv.a === 0 || mv.a === 1) ? mv.a : answerFor(st, seat, q);
    if (a == null) a = 0;                          /* unknown → treat as no, never crash */
    mv.a = a;                                       /* stamp it back so the log/wire carries the answer */
    st.asked.push({ seat, key:mv.key, val:mv.val, a });
    st.log2.push({ seat, t:'ask', key:mv.key, val:mv.val, a });
    st.lastAsk = { seat, key:mv.key, val:mv.val, a };
    st.turn = opp(seat);
    return;
  }
  if (mv.t === 'talk'){
    /* the IRL turn: the answer bit `a` is the OPPONENT's honest yes/no to a
       spoken question. No (key,val), so it is NOT recorded in st.asked and
       cannot be verified — see the move header. Still logged for replay so
       the turn sequence is reproduced exactly. */
    const a = (mv.a === 1) ? 1 : 0;
    mv.a = a;
    st.log2.push({ seat, t:'talk', a });
    st.lastTalk = { seat, a };
    st.lastAsk = null;
    st.turn = opp(seat);
    return;
  }
  if (mv.t === 'guess'){
    const c = mv.c | 0;
    const truth = st.secret[opp(seat)];
    /* online this client may not hold the opponent's secret; the result
       is carried on the move as mv.right (the opponent's phone judges) */
    let right;
    if (typeof truth === 'number') right = (c === truth);
    else right = (mv.right === 1);
    mv.right = right ? 1 : 0;                        /* stamp back for the log/wire */
    st.log2.push({ seat, t:'guess', c, right: right ? 1 : 0 });
    st.lastGuess = { seat, c, right: right ? 1 : 0 };
    st.done = right
      ? { winner: seat, reason:'guessed', c }
      : { winner: opp(seat), reason:'wrong', wrong:true, c };
    return;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   VERIFY — the anti-cheat at reveal. Given both revealed secrets, replay
   every answered question and every guess judgement against them; any
   mismatch is a lie by the answering phone. Returns { ok, lies:[...] }.
   The UI can call this once the game ends and both secrets are on the
   table (online reveal) to flag a cheat honestly.
   ═══════════════════════════════════════════════════════════════════ */
function verify(st, secrets){
  const lies = [];
  const sec = secrets || st.secret;
  (st.asked || []).forEach((r, i) => {
    const truth = sec[opp(r.seat)];
    if (typeof truth !== 'number') return;
    const should = answer(truth, { key:r.key, val:r.val });
    if (should !== r.a) lies.push({ kind:'answer', index:i, seat:r.seat, key:r.key, val:r.val, got:r.a, should });
  });
  if (st.lastGuess){
    const g = st.lastGuess, truth = sec[opp(g.seat)];
    if (typeof truth === 'number'){
      const should = (g.c === truth) ? 1 : 0;
      if (should !== g.right) lies.push({ kind:'guess', seat:g.seat, c:g.c, got:g.right, should });
    }
  }
  return { ok: lies.length === 0, lies };
}

/* ═══════════════════════════════════════════════════════════════════
   THE VERDICT — read relative to a local seat. meSeat() finds the human.
   ═══════════════════════════════════════════════════════════════════ */
function meSeat(st){
  const i = st.seats.findIndex(s => s.own === 'me' || s.own === 'hot');
  return i < 0 ? 0 : i;
}
/* over() detail for the UI, tone relative to `me` */
function verdict(st, me){
  if (!st.done) return null;
  if (me == null) me = meSeat(st);
  const iWon = st.done.winner === me;
  const d = st.done;
  return {
    tone: iWon ? 'win' : 'lose',
    winner: d.winner,
    reason: d.reason,
    wrong: !!d.wrong,
    c: d.c
  };
}

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE — one brain, three sharpnesses, and NOT ONE Math.random.
   It keeps its own board (the engine already does, per seat), and each
   turn it either ASKS the question that best splits its still-standing
   candidates, or GUESSES when it is confident enough. Where a person
   would waver the machine hashes the position, so it is replayable.

     lvl 1  Bonswa    a lazy questioner: picks a decent split, not the
                      best, and only guesses when one face is left —
                      sometimes a face too early.
     lvl 2  Sahha     picks near-optimal splits; guesses at one or two
                      faces left.
     lvl 3  Qattus    always the maximal-information question; guesses
                      the instant it is mathematically sure (one face),
                      and takes a calculated stab at two.

   "candidates" = the faces on the machine's OWN board still standing.
   That board is exactly what a fair player sees, so the AI never peeks
   at the opponent's secret — its state proves it (secrecy note in the
   test harness).
   ═══════════════════════════════════════════════════════════════════ */
const LEVELS = [
  { k:1, name:'BONSWA', icon:'diff-1', note:{ en:'Asks loose questions and guesses late.',
                                              mt:'Jistaqsi bl-addoċċ u jaqta’ tard.' } },
  { k:2, name:'SAĦĦA',  icon:'diff-2', note:{ en:'Asks sharp questions, guesses when close.',
                                              mt:'Jistaqsi sew, jaqta’ meta jkun qrib.' } },
  { k:3, name:'QATTUS',  icon:'diff-3', note:{ en:'Always the best split, and a killer instinct.',
                                              mt:'Dejjem l-aħjar qasma, u istint tal-qattus.' } }
];
function levelOf(k){ return LEVELS.find(L => L.k === k) || LEVELS[1]; }

function hash32(list){
  let h = 2166136261;
  for (let i = 0; i < list.length; i++){ h ^= (list[i] | 0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/* a pure "coin" in 0..1 from the position */
function jitter(st, seat, salt){
  return (hash32([st.log2.length, seat, salt | 0, standing(st, seat)]) % 1000) / 1000;
}

/* how good a question is for a seat: the closer it splits the candidates
   in half, the more it tells you. Score = min(yes,no) among candidates
   (bigger is better; a perfect 50/50 maxes it). */
function splitScore(cands, q){
  let yes = 0;
  for (let k = 0; k < cands.length; k++) if (matches(cands[k], q)) yes++;
  const no = cands.length - yes;
  if (yes === 0 || no === 0) return -1;            /* tells you nothing */
  return Math.min(yes, no);
}

/* the machine's move for its turn. Pure function of the state. */
function think(st, seat, lvl){
  if (turn(st) !== seat) return null;
  lvl = Math.max(1, Math.min(3, lvl || 2));
  const cands = standingList(st, seat);
  const nC = cands.length;

  /* GUESS when confident. lvl3 guesses at 1 (sure) and stabs at 2; lvl2
     at 1 and 2; lvl1 only at 1 (and can misfire — see below). */
  const guessAt = lvl === 3 ? 2 : lvl === 2 ? 2 : 1;
  if (nC <= 1){
    return { t:'guess', c: nC === 1 ? cands[0] : (st.board[seat].findIndex(Boolean) < 0 ? 0 : cands[0] || 0) };
  }
  if (nC <= guessAt){
    /* pick one of the remaining candidates deterministically */
    const j = Math.floor(jitter(st, seat, 7) * nC) % nC;
    /* lvl1 is impatient and may guess at 2 by mistake only rarely; lvl2/3
       intentionally stab at 2 */
    if (nC === 2){
      const stab = lvl === 3 ? true : (lvl === 2 ? (jitter(st, seat, 3) < 0.5) : false);
      if (stab) return { t:'guess', c: cands[j] };
    } else {
      return { t:'guess', c: cands[j] };
    }
  }

  /* otherwise ASK. Rank the questions by split quality over candidates. */
  let best = null, bestScore = -1;
  const ranked = [];
  QUESTIONS.forEach(q => {
    const s = splitScore(cands, { key:q.key, val:q.val });
    if (s < 0) return;
    ranked.push({ q, s });
    if (s > bestScore){ bestScore = s; best = q; }
  });
  if (!ranked.length){
    /* no informative question (shouldn't happen with >2 candidates) —
       guess the deterministic pick */
    const j = Math.floor(jitter(st, seat, 9) * nC) % nC;
    return { t:'guess', c: cands[j] };
  }
  ranked.sort((a, b) => b.s - a.s);
  /* lvl3 always the best; lvl2 near-best (top few); lvl1 loose (top half) */
  let poolN;
  if (lvl === 3) poolN = 1;
  else if (lvl === 2) poolN = Math.min(ranked.length, 3);
  else poolN = Math.max(1, Math.ceil(ranked.length / 2));
  const pick = Math.floor(jitter(st, seat, 5) * poolN) % poolN;
  const chosen = ranked[pick].q;
  return { t:'ask', key: chosen.key, val: chosen.val };
}

/* after the machine ASKS, the answer needs applying and the machine
   should also update its own board (flip the faces that don't match).
   The UI drives flips as explicit moves for replay fidelity, but the AI
   needs to KNOW which to flip — botFlips() returns the faces a rational
   player eliminates after learning answer `a` to question q. */
function botFlips(st, seat, key, val, a){
  const q = { key, val };
  const out = [];
  const row = st.board[seat];
  for (let c = 0; c < N; c++){
    if (!row[c]) continue;
    const m = matches(c, q) ? 1 : 0;
    if (m !== a) out.push(c);                        /* disagrees with the truth → flip down */
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   NOTES for the strip — {en,mt} pairs the UI renders (lang.js rule 5:
   engine-authored text is translated at DISPLAY time, but here we keep
   it as pairs so the UI needs no lookup table).
   ═══════════════════════════════════════════════════════════════════ */
function note(st){
  if (st.done){
    const d = st.done;
    if (d.reason === 'guessed') return { en:'Guessed it!', mt:'Qatagħha!' };
    if (d.reason === 'wrong')   return { en:'Wrong guess.', mt:'Qatgħa ħażina.' };
    if (d.reason === 'quit')    return { en:'A player left.', mt:'Plejer telaq.' };
    return { en:'Game over', mt:'Spiċċat' };
  }
  return { en:'Ask a question, or guess.', mt:'Staqsi mistoqsija, jew aqta’.' };
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — a move as flat byte fields, for js/mp.js's generic codec.
   Every field is 0..255. The moves that travel:
     ask   → { t:'ask',   k:keyIndex, q:valIndex, a:0|1 }   the answer is
             stamped by the ANSWERING phone before it echoes; the asker's
             own send carries a: 255 ("not answered yet") which decWire
             maps to undefined so apply() computes/awaits it.
     talk  → { t:'talk',  a:0|1 }   the IRL turn: no attribute, just the
             opponent's honest yes/no bit (a:255 = not answered yet). The
             asker flips faces by hand. Not verifiable (nothing structured).
     guess → { t:'guess', c:charIndex, r:0|1|255 }  r stamped by the
             opponent's phone (it judges against its own secret).
     flip  → { t:'flip',  c, d:0|1 }
     quit  → { t:'quit' }
   keyIndex/valIndex index into SCHEMA and its value list, both < 256.
   ═══════════════════════════════════════════════════════════════════ */
const KEYS = SCHEMA.map(a => a.key);
function keyIndex(k){ return KEYS.indexOf(k); }
function valIndex(k, v){ const a = SCHEMA_BY[k]; return a ? a.values.findIndex(x => x.v === v) : -1; }
function keyAt(i){ return KEYS[i] || null; }
function valAt(k, i){ const a = SCHEMA_BY[k]; return (a && a.values[i]) ? a.values[i].v : null; }
const byteOK = v => v >= 0 && v <= 255;
/* NB: NOT 'v'. js/mp.js's generic wire codec reserves the field name `v` for a
   BOOLEAN flag (tombla's ready bit) and coerces it with `!!` on the way back —
   which silently turned our value-INDEX (a small integer) into 0/1 and mangled
   every question on the wire. The attribute-value index rides on `q` instead. */
const WIRE_FIELDS = ['k', 'q', 'a', 'c', 'r', 'd'];

function encWire(mv){
  if (!mv) return null;
  if (mv.t === 'quit') return { t:'quit' };
  if (mv.t === 'flip'){
    const c = mv.c | 0;
    if (!byteOK(c)) return null;
    return { t:'flip', c, d: mv.down ? 1 : 0 };
  }
  if (mv.t === 'ask'){
    const k = keyIndex(mv.key), q = valIndex(mv.key, mv.val);
    if (k < 0 || q < 0) return null;
    const a = (mv.a === 0 || mv.a === 1) ? mv.a : 255;
    if (!byteOK(k) || !byteOK(q)) return null;
    return { t:'ask', k, q, a };
  }
  if (mv.t === 'talk'){
    /* the IRL turn — a free-form yes/no with no attribute. Only the answer
       bit travels; the ANSWERER (the opponent) taps it, the asker's phone
       receives it and passes the turn. a:255 = not answered yet. */
    const a = (mv.a === 0 || mv.a === 1) ? mv.a : 255;
    return { t:'talk', a };
  }
  if (mv.t === 'guess'){
    const c = mv.c | 0;
    if (!byteOK(c)) return null;
    const r = (mv.right === 0 || mv.right === 1) ? mv.right : 255;
    return { t:'guess', c, r };
  }
  return null;
}
function decWire(w){
  if (!w || typeof w.t !== 'string') return null;
  if (w.t === 'quit') return { t:'quit' };
  if (w.t === 'flip') return { t:'flip', c:(w.c | 0), down: (w.d | 0) === 1 };
  if (w.t === 'ask'){
    const key = keyAt(w.k | 0), val = valAt(key, w.q | 0);
    if (!key || val == null) return null;
    const mv = { t:'ask', key, val };
    if ((w.a | 0) === 0 || (w.a | 0) === 1) mv.a = (w.a | 0);
    return mv;
  }
  if (w.t === 'talk'){
    const mv = { t:'talk' };
    if ((w.a | 0) === 0 || (w.a | 0) === 1) mv.a = (w.a | 0);
    return mv;
  }
  if (w.t === 'guess'){
    const mv = { t:'guess', c:(w.c | 0) };
    if ((w.r | 0) === 0 || (w.r | 0) === 1) mv.right = (w.r | 0);
    return mv;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   planDeal — what the shared lobby asks the relay to deal privately. The
   pool is the 24 character indices; the relay hands each seat ONE of them
   privately (its secret character). Same shape poker's planDeal returns.
   ═══════════════════════════════════════════════════════════════════ */
function planDeal(opts){
  void opts;
  const items = [];
  for (let i = 0; i < N; i++) items.push(i);
  return { items, each: 1 };            /* one secret character a seat */
}

/* ═══════════════════════════════════════════════════════════════════
   PICK-YOUR-OWN helpers. The pick screen collects a character index per
   seat and hands the engine a `given.secret` map through SECRETS.private
   — the exact same seam online uses. pickedOpts() builds the offline opts
   (both picks on this device, private mode); pickedOnlineGiven() builds
   the single-seat map a client holds online (only its own pick). Neither
   the engine nor any message ever needs SECRETS.seed for a chosen game.
   ═══════════════════════════════════════════════════════════════════ */
function validChar(i){ return typeof i === 'number' && i >= 0 && i < N; }
/* offline: both seats picked on THIS device → private opts holding both.
   picks is {0:charIndex, 1:charIndex}. */
function pickedOpts(base, picks){
  const secret = {};
  if (validChar(picks && picks[0])) secret[0] = picks[0];
  if (validChar(picks && picks[1])) secret[1] = picks[1];
  return Object.assign({}, base, { deal:'private', given:{ secret } });
}
/* online: a single seat's own pick → the one-wide map this client holds. */
function pickedOnlineGiven(seat, charIndex){
  const secret = {};
  if (validChar(charIndex)) secret[seat | 0] = charIndex;
  return { secret };
}
/* a deterministic-from-seed random character, for the "surprise me" button
   when a player would rather not choose. Pure over a scratch state. */
function randomChar(seed){
  const st = { rs: (seed | 0) || newSeed() };
  return Math.floor(rnd(st) * N) % N;
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE — js/minhu-ui.js and the test harness read this.
   ═══════════════════════════════════════════════════════════════════ */
root.KARTI_MINHU = root.KARTI_MINHU || {};
root.KARTI_MINHU.engine = {
  /* roster + schema (the UI renders faces, the picker, and the images
     are generated to match) */
  ROSTER, N, SCHEMA, SCHEMA_BY, QUESTIONS,
  idOf, indexOfId, attrOf, valLabel, attrLabel,
  matches, answer, fieldSplit: q => { let y = 0; for (let i = 0; i < N; i++) if (matches(i, q)) y++; return y; },
  /* the secret seam + the pick-your-own helpers */
  SECRETS, sourceOf, planDeal, pickedOpts, pickedOnlineGiven, randomChar, validChar,
  /* the table */
  SEATS, MIN_SEATS, MAX_SEATS, deal, legal, check, apply, turn, over, opp,
  standing, standingList, answerFor, verify, botFlips,
  /* verdict / notes */
  meSeat, verdict, note,
  /* the machine */
  LEVELS, levelOf, think, splitScore,
  /* determinism helpers */
  newSeed,
  /* the wire */
  encWire, decWire, WIRE_FIELDS, keyIndex, valIndex, keyAt, valAt
};

})(typeof window !== 'undefined' ? window : globalThis);
