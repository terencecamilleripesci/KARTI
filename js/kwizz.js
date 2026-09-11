/* ═══════════════════════════════════════════════════════════════════
   KARTI — kwizz.js
   IL-KWIŻŻ — the engine. Questions, rounds, scoring, and the machine's
   head. No DOM in this file: js/kwizz-ui.js owns every pixel.

   WHY A QUIZ, AND WHY NOW. The shelf had thirty-one games and not one
   of them was trivia — cards, boards, action, words, deduction, mime,
   all covered, and the single most-played party format in the world
   missing. This is that hole.

   THE SCORING IS THE DESIGN. A quiz where the right answer is worth a
   flat point is a test. Speed is what makes it a game, so the points
   fall from 1000 to 500 across the clock and everybody who is right
   still scores — being slow costs you half, never all of it. Nobody is
   ever out, which matters at a table: a player who cannot win by
   question three puts the phone down.

   THE STREAK IS THE OTHER HALF. Three in a row doubles the next one.
   It gives a trailing player one thing to chase and a leading player
   one thing to lose, which is the whole of comeback design.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;

/* ── the clock and the money ───────────────────────────────────────
   SIXTEEN SECONDS, measured against reading speed rather than chosen:
   a four-option question is about 30 words, a comfortable reader does
   4 words a second, so reading costs 7 and the remaining 9 are the
   actual decision. Under 12 and the slow reader is answering blind. */
const ASK_MS   = 16000;
const FULL     = 1000;         /* answered instantly                  */
const FLOOR    = 500;          /* answered on the buzzer              */
const STREAK_AT = 3;           /* right this many in a row...         */
const STREAK_X  = 2;           /* ...and the next one counts double   */
const MIN_SEATS = 2, MAX_SEATS = 6;

/* points for a correct answer, given how much clock was left */
function score(msLeft, streak){
  const frac = Math.max(0, Math.min(1, msLeft / ASK_MS));
  const base = Math.round(FLOOR + (FULL - FLOOR) * frac);
  return streak >= STREAK_AT ? base * STREAK_X : base;
}

/* ── THE MACHINE ───────────────────────────────────────────────────
   A quiz CPU is not an opponent that thinks, it is a probability and
   a delay, and both have to be honest.

   `know` is the chance it has the answer at all. A machine that knows
   everything is not hard, it is pointless — you stop answering and
   watch. Even the top band misses one in five, so there is always a
   question worth racing for.

   WHEN IT IS WRONG IT PICKS A PLAUSIBLE WRONG ANSWER, not a random
   one, because the answer it lands on is shown to the table and a
   machine that answers "1974" to "what colour" reads as broken rather
   than beaten.

   The delay is drawn per question rather than fixed: a machine that
   answers at exactly 4.0s every time is a metronome, and a table
   notices within three questions. */
const BANDS = [
  { k:'easy',   name:T('Sunday','Il-Ħadd'),   know:0.45, fast:[4200, 9000] },
  { k:'medium', name:T('Quiz night','Kwiżż'), know:0.68, fast:[2600, 6500] },
  { k:'hard',   name:T('The know-it-all','Jaf kollox'), know:0.82, fast:[1500, 4200] }
];

function cpuAnswer(q, band, rnd){
  const B = BANDS.find(b => b.k === band) || BANDS[1];
  const r = rnd || Math.random;
  const lo = B.fast[0], hi = B.fast[1];
  const at = Math.round(lo + r() * (hi - lo));
  if (r() < B.know) return { pick: q.a, at };
  /* wrong, but wrong in a way that belongs to this question */
  const wrong = q.opts.map((_, i) => i).filter(i => i !== q.a);
  return { pick: wrong[Math.floor(r() * wrong.length)], at };
}

/* ── THE BANK ──────────────────────────────────────────────────────
   Bilingual because the shelf is. `a` is the index of the right
   answer in `opts`, and it is deliberately NOT always 0 — a bank
   where the answer is first is a bank you can beat without reading.

   Questions are grouped so a round can be themed, and so a Maltese
   round can be picked for a Maltese character in Story Mode.

   EVERY ANSWER HERE IS CHECKABLE. A quiz that is wrong once is a quiz
   nobody trusts again, so there is nothing here that depends on a
   date somebody half-remembers. */
function q(cat, en, mt, opts, a){ return { cat, en, mt, opts, a }; }

const BANK = [
  /* ── Malta ─────────────────────────────────────────────────── */
  q('malta', 'What is the capital of Malta?', 'X\'inhi l-kapitali ta\' Malta?',
    [['Mdina','L-Imdina'], ['Valletta','Il-Belt Valletta'], ['Sliema','Tas-Sliema'], ['Mosta','Il-Mosta']], 1),
  q('malta', 'How many islands are inhabited in the Maltese archipelago?', 'Kemm-il gżira hija abitata f\'Malta?',
    [['One','Waħda'], ['Two','Tnejn'], ['Three','Tlieta'], ['Five','Ħamsa']], 2),
  q('malta', 'Which island lies between Malta and Gozo?', 'Liema gżira tinsab bejn Malta u Għawdex?',
    [['Comino','Kemmuna'], ['Filfla','Filfla'], ['Manoel','Manoel'], ['St Paul\'s','San Pawl']], 0),
  q('malta', 'What is a pastizz traditionally filled with?', 'Bi xiex jimtela l-pastizz tradizzjonalment?',
    [['Meat','Laħam'], ['Ricotta or peas','Irkotta jew piżelli'], ['Cheese and ham','Ġobon u perżut'], ['Potato','Patata']], 1),
  q('malta', 'The Maltese cross has how many points?', 'Kemm-il ponta għandha s-salib ta\' Malta?',
    [['Four','Erbgħa'], ['Six','Sitta'], ['Eight','Tmienja'], ['Twelve','Tnax']], 2),
  q('malta', 'Which language family does Maltese belong to?', 'Ta\' liema familja ta\' lingwi hu l-Malti?',
    [['Romance','Rumanza'], ['Semitic','Semitika'], ['Slavic','Slava'], ['Germanic','Ġermaniża']], 1),
  q('malta', 'What is the Ġgantija temple complex on Gozo famous for?', 'Għaliex huma magħrufa t-tempji tal-Ġgantija?',
    [['Being underwater','Li huma taħt l-ilma'], ['Being older than the pyramids','Li huma eqdem mill-piramidi'],
     ['Being built by the Knights','Li nbnew mill-Kavallieri'], ['Being made of marble','Li huma tal-irħam']], 1),
  q('malta', 'Which fish is the star of Malta\'s autumn season?', 'Liema ħuta hija l-aktar magħrufa fil-ħarifa?',
    [['Lampuka','Lampuka'], ['Tuna','Tonn'], ['Swordfish','Pixxispad'], ['Sardine','Sardin']], 0),
  q('malta', 'What does "Ċaw" mean?', 'Xi jfisser "Ċaw"?',
    [['Please','Jekk jogħġbok'], ['Sorry','Skużi'], ['Bye','Saħħa'], ['Thanks','Grazzi']], 2),
  q('malta', 'The Knights of St John ruled Malta for how long, roughly?', 'Għal kemm żmien ħakmu l-Kavallieri?',
    [['About 70 years','Madwar 70 sena'], ['About 130 years','Madwar 130 sena'],
     ['About 270 years','Madwar 270 sena'], ['About 400 years','Madwar 400 sena']], 2),
  q('malta', 'What is a "luzzu"?', 'X\'inhu "luzzu"?',
    [['A fishing boat','Dgħajsa tas-sajd'], ['A festa sweet','Ħelu tal-festa'],
     ['A village square','Pjazza'], ['A summer wind','Riħ tas-sajf']], 0),
  q('malta', 'Which city was Malta\'s capital before Valletta?', 'Liema belt kienet il-kapitali qabel il-Belt?',
    [['Rabat','Ir-Rabat'], ['Birgu','Il-Birgu'], ['Mdina','L-Imdina'], ['Żejtun','Iż-Żejtun']], 2),

  /* ── the world ─────────────────────────────────────────────── */
  q('world', 'Which planet is closest to the Sun?', 'Liema pjaneta hi l-eqreb tax-Xemx?',
    [['Venus','Venere'], ['Mercury','Merkurju'], ['Mars','Mars'], ['Earth','Id-Dinja']], 1),
  q('world', 'How many continents are there?', 'Kemm hemm kontinenti?',
    [['Five','Ħamsa'], ['Six','Sitta'], ['Seven','Sebgħa'], ['Eight','Tmienja']], 2),
  q('world', 'What is the largest ocean?', 'Liema hu l-akbar oċean?',
    [['Atlantic','Atlantiku'], ['Indian','Indjan'], ['Arctic','Artiku'], ['Pacific','Paċifiku']], 3),
  q('world', 'Which country has the most people?', 'Liema pajjiż għandu l-aktar nies?',
    [['India','L-Indja'], ['China','Iċ-Ċina'], ['USA','L-Istati Uniti'], ['Indonesia','L-Indoneżja']], 0),
  q('world', 'What is the longest river in the world?', 'Liema hu l-itwal xmara fid-dinja?',
    [['Amazon','L-Amazon'], ['Nile','In-Nil'], ['Yangtze','Yangtze'], ['Mississippi','Mississippi']], 1),
  q('world', 'How many strings does a standard guitar have?', 'Kemm-il korda għandha kitarra normali?',
    [['Four','Erbgħa'], ['Five','Ħamsa'], ['Six','Sitta'], ['Seven','Sebgħa']], 2),
  q('world', 'What is the chemical symbol for gold?', 'X\'inhu s-simbolu tad-deheb?',
    [['Go','Go'], ['Gd','Gd'], ['Au','Au'], ['Ag','Ag']], 2),
  q('world', 'How many minutes in a full day?', 'Kemm-il minuta f\'jum sħiħ?',
    [['1200','1200'], ['1440','1440'], ['2400','2400'], ['960','960']], 1),
  q('world', 'Which sea is Malta in?', 'F\'liema baħar tinsab Malta?',
    [['Adriatic','Adrijatiku'], ['Aegean','Eġew'], ['Mediterranean','Mediterran'], ['Black Sea','Baħar l-Iswed']], 2),
  q('world', 'What colour do you get mixing blue and yellow?', 'Liema kulur toħroġ minn ikħal u isfar?',
    [['Green','Aħdar'], ['Purple','Vjola'], ['Orange','Oranġjo'], ['Brown','Kannella']], 0),
  q('world', 'How many players are on a football pitch per side?', 'Kemm-il plejer fuq il-grawnd għal kull tim?',
    [['Nine','Disgħa'], ['Ten','Għaxra'], ['Eleven','Ħdax'], ['Twelve','Tnax']], 2),
  q('world', 'What does WWW stand for?', 'Xi tfisser WWW?',
    [['World Wide Web','World Wide Web'], ['Web Wide World','Web Wide World'],
     ['World Web Wide','World Web Wide'], ['Wide World Web','Wide World Web']], 0),

  /* ── food, telly, the pub round ────────────────────────────── */
  q('mix', 'Which fruit is traditionally in a Christmas pudding?', 'Liema frotta hemm fil-pudina tal-Milied?',
    [['Banana','Banana'], ['Raisins','Żbib'], ['Pineapple','Ananas'], ['Kiwi','Kiwi']], 1),
  q('mix', 'How many holes on a full golf course?', 'Kemm-il toqba f\'kors tal-golf?',
    [['Nine','Disgħa'], ['Twelve','Tnax'], ['Eighteen','Tmintax'], ['Twenty','Għoxrin']], 2),
  q('mix', 'What is the most sold drink in the world?', 'Xi tkun l-aktar xarba mibjugħa fid-dinja?',
    [['Coffee','Kafè'], ['Water','Ilma'], ['Tea','Te'], ['Beer','Birra']], 1),
  q('mix', 'How many sides does a stop sign have?', 'Kemm-il ġenb għandu s-sinjal tal-istop?',
    [['Six','Sitta'], ['Seven','Sebgħa'], ['Eight','Tmienja'], ['Ten','Għaxra']], 2),
  q('mix', 'In chess, which piece can jump over others?', 'Fiċ-ċess, liema biċċa taqbeż fuq l-oħrajn?',
    [['Bishop','Isqof'], ['Rook','Torri'], ['Knight','Kavallier'], ['Queen','Reġina']], 2),
  q('mix', 'How many cards in a standard deck, no jokers?', 'Kemm-il karta f\'pakkett normali, mingħajr jokers?',
    [['48','48'], ['50','50'], ['52','52'], ['54','54']], 2),
  q('mix', 'What is the hardest natural substance?', 'X\'inhi l-iktar sustanza naturali iebsa?',
    [['Steel','Azzar'], ['Diamond','Djamant'], ['Granite','Granit'], ['Quartz','Kwarz']], 1),
  q('mix', 'How many degrees in a circle?', 'Kemm-il grad f\'ċirku?',
    [['180','180'], ['270','270'], ['360','360'], ['400','400']], 2)
];

const CATS = [
  { k:'all',   name:T('Everything','Kollox') },
  { k:'malta', name:T('Malta','Malta') },
  { k:'world', name:T('The world','Id-dinja') },
  { k:'mix',   name:T('The pub round','Tal-każin') }
];

/* ── drawing a round ───────────────────────────────────────────────
   NO REPEATS INSIDE A MATCH. Being asked the same question twice in
   one sitting is the fastest way to make a bank feel small, and the
   bank is the one thing a quiz cannot fake. If a category runs dry
   it falls back to the whole bank rather than repeating. */
function draw(n, cat, rnd){
  const r = rnd || Math.random;
  let pool = BANK.filter(x => cat === 'all' || x.cat === cat);
  if (pool.length < n) pool = BANK.slice();
  pool = pool.slice();
  for (let i = pool.length - 1; i > 0; i--){
    const j = Math.floor(r() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  /* the OPTIONS are shuffled too, per question, so a bank learned by
     position is a bank learned for nothing */
  return pool.slice(0, n).map(x => {
    const idx = x.opts.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--){
      const j = Math.floor(r() * (i + 1));
      const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    return { cat:x.cat, en:x.en, mt:x.mt,
             opts: idx.map(i => x.opts[i]),
             a: idx.indexOf(x.a) };
  });
}

window.KARTI_KWIZZ = {
  ASK_MS, FULL, FLOOR, STREAK_AT, STREAK_X, MIN_SEATS, MAX_SEATS,
  BANDS, CATS, score, cpuAnswer, draw,
  bankSize: (cat) => BANK.filter(x => cat === 'all' || !cat || x.cat === cat).length,
  /* exposed for the checker, which asserts the bank is sane */
  _bank: BANK
};

})();
