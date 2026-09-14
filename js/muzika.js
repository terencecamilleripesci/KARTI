/* ═══════════════════════════════════════════════════════════════════
   KARTI — muzika.js
   MUŻIKA — the music round. Four options, and a wrong one COSTS you.

   WHY A PENALTY CHANGES THE WHOLE GAME. IL-KWIŻŻ already asks four-option
   questions and there was no point building it twice. The difference here
   is one rule: a wrong answer is MINUS a point. That single change turns
   every question into a decision rather than a reflex — because the
   moment being wrong costs something, "I do not know" becomes a real
   move, and knowing that you do not know becomes a skill.

   SO THERE IS A PASS BUTTON, and it is worth exactly zero. Without it the
   penalty is just punishment; with it, the player chooses their risk on
   every single question and a cautious player can genuinely beat a
   reckless one who knows more songs. That is the game.

   NO AUDIO, AND THAT IS A DESIGN POSITION NOT A SHORTCUT. Shipping real
   recordings is not ours to do, and a party game that needs a licence is
   a party game that never ships. So it asks what a music quiz in a bar
   actually asks: who sang it, what year, which album, and what the first
   line is. Nobody has ever needed a speaker to argue about that.

   FOUR SHELVES OF MUSIC, because "music" is not one taste: what is on
   the radio now, the women who defined pop, the old classics, and rap.
   A table picks the shelf it wants to be beaten on.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const MIN_SEATS = 1, MAX_SEATS = 6;
const ASK_MS    = 14000;   /* per question */
const RIGHT     = 1;
const WRONG     = -1;      /* the rule the whole game is built on */
const PASS      = 0;
const MAX_ROUNDS = 20;     /* a backstop; the host ends it, not a counter */

const CATS = {
  pop:      { en:'On the radio',  mt:'Fuq ir-radju' },
  nisa:     { en:'The women',     mt:'In-nisa' },
  klassiku: { en:'Old classics',  mt:'Klassiċi' },
  rap:      { en:'Rap',           mt:'Rap' }
};

/* c = the right answer, w = three wrong ones that must be PLAUSIBLE —
   same genre, same era, same kind of act. A wrong option nobody would
   ever pick is a free point, and a free point in a game with a penalty
   is worse than useless: it makes the risk fake. */
const BANK = [
  /* ── on the radio ──────────────────────────────────────────────── */
  { k:'pop', q:'Who sings “Shape of You”?', c:'Ed Sheeran',
    w:['Shawn Mendes','Justin Bieber','Sam Smith'] },
  { k:'pop', q:'Who sings “Blinding Lights”?', c:'The Weeknd',
    w:['Drake','Bruno Mars','Usher'] },
  { k:'pop', q:'Who sings “Bad Guy”?', c:'Billie Eilish',
    w:['Lorde','Halsey','Olivia Rodrigo'] },
  { k:'pop', q:'Who sings “Rolling in the Deep”?', c:'Adele',
    w:['Duffy','Amy Winehouse','Florence Welch'] },
  { k:'pop', q:'“Uptown Funk” is credited to Mark Ronson and who?', c:'Bruno Mars',
    w:['Pharrell Williams','Justin Timberlake','Usher'] },
  { k:'pop', q:'Who sings “Happy”, from the Despicable Me 2 soundtrack?', c:'Pharrell Williams',
    w:['Justin Timberlake','John Legend','Jason Mraz'] },
  { k:'pop', q:'Who sings “Shallow” with Bradley Cooper in A Star Is Born?', c:'Lady Gaga',
    w:['Katy Perry','Miley Cyrus','Kesha'] },
  { k:'pop', q:'Who had the worldwide hit “Despacito”?', c:'Luis Fonsi',
    w:['Enrique Iglesias','Ricky Martin','J Balvin'] },
  { k:'pop', q:'Who sings “Levitating”?', c:'Dua Lipa',
    w:['Rita Ora','Anne-Marie','Zara Larsson'] },
  { k:'pop', q:'Who sings “Anti-Hero”?', c:'Taylor Swift',
    w:['Lana Del Rey','Selena Gomez','Katy Perry'] },
  { k:'pop', q:'Who sings “As It Was”?', c:'Harry Styles',
    w:['Niall Horan','Zayn','Louis Tomlinson'] },
  { k:'pop', q:'Which band sings “Viva La Vida”?', c:'Coldplay',
    w:['Keane','Snow Patrol','The Killers'] },

  /* ── the women ─────────────────────────────────────────────────── */
  { k:'nisa', q:'Who sings “Like a Prayer”?', c:'Madonna',
    w:['Cyndi Lauper','Kylie Minogue','Debbie Harry'] },
  { k:'nisa', q:'Whose 1992 version of “I Will Always Love You” sold by the tonne?', c:'Whitney Houston',
    w:['Mariah Carey','Celine Dion','Tina Turner'] },
  { k:'nisa', q:'Who wrote “I Will Always Love You” in the first place?', c:'Dolly Parton',
    w:['Whitney Houston','Carole King','Patsy Cline'] },
  { k:'nisa', q:'Who sings “Respect”?', c:'Aretha Franklin',
    w:['Tina Turner','Diana Ross','Etta James'] },
  { k:'nisa', q:'Who sings “…Baby One More Time”?', c:'Britney Spears',
    w:['Christina Aguilera','Jessica Simpson','Mandy Moore'] },
  { k:'nisa', q:'Which group sings “Wannabe”?', c:'Spice Girls',
    w:['All Saints','TLC','Destiny’s Child'] },
  { k:'nisa', q:'Who sings “Believe”, the one with the famous wobbling vocal?', c:'Cher',
    w:['Madonna','Tina Turner','Donna Summer'] },
  { k:'nisa', q:'Who sings “Crazy in Love”?', c:'Beyoncé',
    w:['Rihanna','Alicia Keys','Ciara'] },
  { k:'nisa', q:'Who sings “Rehab”?', c:'Amy Winehouse',
    w:['Duffy','Adele','Lily Allen'] },
  { k:'nisa', q:'Who sings “Genie in a Bottle”?', c:'Christina Aguilera',
    w:['Britney Spears','Pink','Jessica Simpson'] },
  { k:'nisa', q:'Who sings “Torn”?', c:'Natalie Imbruglia',
    w:['Alanis Morissette','Sheryl Crow','Dido'] },
  { k:'nisa', q:'Who sings “Vogue”?', c:'Madonna',
    w:['Janet Jackson','Paula Abdul','Whitney Houston'] },

  /* ── old classics ──────────────────────────────────────────────── */
  { k:'klassiku', q:'Which band recorded “Bohemian Rhapsody”?', c:'Queen',
    w:['The Who','Led Zeppelin','Pink Floyd'] },
  { k:'klassiku', q:'Who wrote and sang “Imagine”?', c:'John Lennon',
    w:['Paul McCartney','George Harrison','Bob Dylan'] },
  { k:'klassiku', q:'Which band sings “Hey Jude”?', c:'The Beatles',
    w:['The Rolling Stones','The Kinks','The Beach Boys'] },
  { k:'klassiku', q:'Which band recorded “Stairway to Heaven”?', c:'Led Zeppelin',
    w:['Deep Purple','Black Sabbath','Pink Floyd'] },
  { k:'klassiku', q:'Which band sings “Hotel California”?', c:'Eagles',
    w:['Fleetwood Mac','Lynyrd Skynyrd','The Doobie Brothers'] },
  { k:'klassiku', q:'Who sings “Billie Jean”?', c:'Michael Jackson',
    w:['Prince','Lionel Richie','Stevie Wonder'] },
  { k:'klassiku', q:'Which group sings “Dancing Queen”?', c:'ABBA',
    w:['Boney M.','Bee Gees','The Carpenters'] },
  { k:'klassiku', q:'Which band recorded “Sweet Child o’ Mine”?', c:'Guns N’ Roses',
    w:['Bon Jovi','Aerosmith','Mötley Crüe'] },
  { k:'klassiku', q:'Which band sings “Wonderwall”?', c:'Oasis',
    w:['Blur','Pulp','The Verve'] },
  { k:'klassiku', q:'Which band recorded “Smells Like Teen Spirit”?', c:'Nirvana',
    w:['Pearl Jam','Soundgarden','Alice in Chains'] },
  { k:'klassiku', q:'Which album is “Thriller” the title track of?', c:'Thriller',
    w:['Bad','Off the Wall','Dangerous'] },
  { k:'klassiku', q:'Which band sings “Let It Be”?', c:'The Beatles',
    w:['The Hollies','The Byrds','The Animals'] },

  /* ── rap ───────────────────────────────────────────────────────── */
  { k:'rap', q:'Who raps “Lose Yourself”?', c:'Eminem',
    w:['50 Cent','Dr. Dre','Nas'] },
  { k:'rap', q:'Who raps “In Da Club”?', c:'50 Cent',
    w:['The Game','Ja Rule','DMX'] },
  { k:'rap', q:'Who raps “Gold Digger”?', c:'Kanye West',
    w:['Jay-Z','Common','Lupe Fiasco'] },
  { k:'rap', q:'Who raps “Juicy”?', c:'The Notorious B.I.G.',
    w:['2Pac','Nas','Big L'] },
  { k:'rap', q:'Who raps “California Love”?', c:'2Pac',
    w:['Snoop Dogg','Ice Cube','Warren G'] },
  { k:'rap', q:'Who raps “Empire State of Mind” with Alicia Keys?', c:'Jay-Z',
    w:['Nas','Kanye West','Diddy'] },
  { k:'rap', q:'Who raps “HUMBLE.”?', c:'Kendrick Lamar',
    w:['J. Cole','Travis Scott','Big Sean'] },
  { k:'rap', q:'Who raps “God’s Plan”?', c:'Drake',
    w:['Future','Post Malone','Travis Scott'] },
  { k:'rap', q:'Who had the record-breaking hit “Old Town Road”?', c:'Lil Nas X',
    w:['Lil Yachty','Lil Baby','Young Thug'] },
  { k:'rap', q:'Who raps “SICKO MODE”?', c:'Travis Scott',
    w:['Migos','Future','21 Savage'] },
  { k:'rap', q:'Which duo sings “Hey Ya!”?', c:'OutKast',
    w:['Black Eyed Peas','Gnarls Barkley','N.E.R.D'] },
  { k:'rap', q:'Who recorded “Rapper’s Delight”, the one that started it?', c:'The Sugarhill Gang',
    w:['Grandmaster Flash','Kurtis Blow','Run-D.M.C.'] }
];

/* ── the machine ───────────────────────────────────────────────────
   `know` is how often it actually knows the answer. `dare` is what it
   does when it does NOT: how often it guesses anyway rather than
   passing. That second number is the interesting one, because with a
   penalty on the board a machine that always guesses bleeds points —
   the easy band is beatable precisely because it cannot help itself. */
const BANDS = [
  { k:'easy',   name:'Tone deaf', know:0.45, dare:0.85, think:[1800, 3600] },
  { k:'medium', name:'Sings along', know:0.70, dare:0.55, think:[1400, 2800] },
  { k:'hard',   name:'Knows every word', know:0.92, dare:0.30, think:[900, 2000] }
];

/* → 'right' | 'wrong' | 'pass' */
function cpuAnswer(band, rnd){
  const B = BANDS.find(b => b.k === band) || BANDS[1];
  const r = rnd || Math.random;
  if (r() < B.know) return 'right';
  if (r() < B.dare) return 'wrong';
  return 'pass';
}

function thinkMs(band, rnd){
  const B = BANDS.find(b => b.k === band) || BANDS[1];
  const r = rnd || Math.random;
  return Math.round(B.think[0] + r() * (B.think[1] - B.think[0]));
}

function shuffle(a, rnd){
  const r = rnd || Math.random;
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--){
    const j = Math.floor(r() * (i + 1));
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

/* one question, options already shuffled, with the right index marked */
function draw(cats, used, rnd){
  const r = rnd || Math.random;
  const want = (cats && cats.length) ? cats : Object.keys(CATS);
  let pool = BANK.filter(q => want.indexOf(q.k) >= 0 && !used.has(q.q));
  if (!pool.length){                       /* seen them all: start again */
    used.clear();
    pool = BANK.filter(q => want.indexOf(q.k) >= 0);
  }
  const q = pool[Math.floor(r() * pool.length)];
  used.add(q.q);
  const opts = shuffle([q.c].concat(q.w), r);
  return { k:q.k, q:q.q, opts, right: opts.indexOf(q.c), answer:q.c };
}

function scoreFor(kind){
  return kind === 'right' ? RIGHT : kind === 'wrong' ? WRONG : PASS;
}

window.KARTI_MUZIKA = {
  MIN_SEATS, MAX_SEATS, ASK_MS, RIGHT, WRONG, PASS, MAX_ROUNDS,
  CATS, BANK, BANDS, draw, cpuAnswer, thinkMs, shuffle, scoreFor
};

})();
