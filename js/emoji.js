/* ═══════════════════════════════════════════════════════════════════
   KARTI — emoji.js
   EMOJI — guess the film, the song, the proverb, the Maltese thing,
   from emoji and nothing else. Engine only.

   THE SCORE IS HOW FEW CLUES YOU NEEDED. That one decision is what
   stops this being IL-KWIŻŻ with pictures. Emoji arrive one at a time
   and every arrival costs a point, so the whole game is the argument
   in your own head: shout now on a hunch, or wait for the one that
   makes it obvious and take less for it. A right answer is never in
   doubt; WHEN you gave it is the entire skill.

   SO THE CLUES ARE ORDERED, VAGUEST FIRST. The last emoji in every
   list is the giveaway and the first could be half a dozen things.
   A puzzle whose first emoji names the answer has no game in it.

   TYPED, NOT MULTIPLE CHOICE. Four options would hand the answer to
   anyone who waited, which is exactly the behaviour the scoring is
   trying to punish. Typing means the matcher has to be generous —
   see norm() and accept(): articles, accents, punctuation and one or
   two fat-fingered letters are all forgiven, because "TITANIK" is a
   right answer given by somebody on a phone in a noisy room.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const MIN_SEATS = 1, MAX_SEATS = 6;
const ROUNDS    = 8;
const REVEAL_MS = 4200;      /* a clue every four seconds if you sit on it */
const GRACE_MS  = 6000;      /* how long you get after the last clue lands */
const PTS       = [5, 4, 3, 2, 1];   /* by how many clues were showing */

/* ── the bank ──────────────────────────────────────────────────────
   e: the clues, IN ORDER, vaguest first.
   en/mt: the answer in each language — either is accepted, always,
   whichever language the phone is set to. Somebody who knows the film
   as "Is-Sultan Iljun" should not be marked wrong for saying so.
   alt: other spellings and the short forms people actually type. */
const BANK = [
  /* ── FILMS ─────────────────────────────────────────────────────── */
  { k:'film', e:['🌊','🚢','🧊','💔'],       en:'Titanic', mt:'Titanic' },
  { k:'film', e:['🌍','🦁','👑'],            en:'The Lion King', mt:'Is-Sultan Iljun', alt:['lion king'] },
  { k:'film', e:['🏖️','🏊','🦈'],            en:'Jaws', mt:'Jaws' },
  { k:'film', e:['🌊','🐠','🔍'],            en:'Finding Nemo', mt:'Finding Nemo', alt:['nemo'] },
  { k:'film', e:['👸','⛄','❄️'],            en:'Frozen', mt:'Frozen' },
  { k:'film', e:['🌌','🤖','⚔️','⭐'],        en:'Star Wars', mt:'Star Wars' },
  { k:'film', e:['🏰','👓','⚡','🧙'],        en:'Harry Potter', mt:'Harry Potter', alt:['harry'] },
  { k:'film', e:['🏝️','🚙','🦕'],            en:'Jurassic Park', mt:'Jurassic Park', alt:['jurassic'] },
  { k:'film', e:['🧸','🚀','🤠'],            en:'Toy Story', mt:'Toy Story' },
  { k:'film', e:['🍝','🐴','🔫'],            en:'The Godfather', mt:'Il-Padrinu', alt:['godfather','padrinu'] },
  { k:'film', e:['🏠','🎈','👴'],            en:'Up', mt:'Up' },
  { k:'film', e:['🍲','👨‍🍳','🐀'],            en:'Ratatouille', mt:'Ratatouille' },
  { k:'film', e:['🎄','🏠','😱','🧒'],        en:'Home Alone', mt:'Home Alone' },
  { k:'film', e:['🪜','🇺🇸','🥊'],            en:'Rocky', mt:'Rocky' },
  { k:'film', e:['🌕','🚲','👽'],            en:'E.T.', mt:'E.T.', alt:['et','e t'] },
  { k:'film', e:['⚓','🦜','🏴‍☠️'],            en:'Pirates of the Caribbean', mt:'Pirates of the Caribbean',
    alt:['pirates','pirates of the carribean'] },
  /* 🫏 and 🧌 were the obvious clues here and BOTH are Unicode 14/15 —
     two blank squares on plenty of phones. The onion is older, safer
     and a better clue anyway: ogres have layers. */
  { k:'film', e:['🏰','🐴','🧅'],            en:'Shrek', mt:'Shrek' },
  { k:'film', e:['🕸️','🏙️','🕷️'],            en:'Spider-Man', mt:'Spider-Man', alt:['spiderman','spider man'] },

  /* ── SONGS ─────────────────────────────────────────────────────── */
  { k:'song', e:['🎭','👑','🎸','🎶'],        en:'Bohemian Rhapsody', mt:'Bohemian Rhapsody', alt:['bohemian'] },
  { k:'song', e:['💔','🌊','🎤'],            en:'Rolling in the Deep', mt:'Rolling in the Deep', alt:['rolling in the deep'] },
  { k:'song', e:['❄️','👸','🙌'],            en:'Let It Go', mt:'Let It Go' },
  { k:'song', e:['👶','🦈','🎵'],            en:'Baby Shark', mt:'Baby Shark' },
  { k:'song', e:['🕺','🎺','🏙️'],            en:'Uptown Funk', mt:'Uptown Funk' },
  { k:'song', e:['🌧️','☂️','🎤'],            en:'Singin\' in the Rain', mt:'Singin\' in the Rain',
    alt:['singing in the rain','singin in the rain'] },
  { k:'song', e:['✋','💛','🌞'],            en:'Here Comes the Sun', mt:'Here Comes the Sun' },
  { k:'song', e:['🇮🇹','🚗','🌅'],            en:'Volare', mt:'Volare' },

  /* ── QAWL — the proverbs. The best category on the shelf, because
       everybody's nanna says these and nobody has ever seen one drawn. */
  { k:'qawl', e:['🌧️','⏳','🛑'],            en:'Every rain stops', mt:'Kull xita tieqaf',
    alt:['kull xita tieqaf','every rain stops'] },
  { k:'qawl', e:['🏠','🐱','🚪','🐭'],        en:'When the cat is away the mice will play',
    mt:'Meta l-qattus ma jkunx hemm, il-ġrieden jiżfnu',
    alt:['meta l qattus ma jkunx hemm il grieden jizfnu','when the cats away the mice will play',
         'il grieden jizfnu'] },
  { k:'qawl', e:['⛈️','➡️','🌤️'],            en:'After the storm comes the calm', mt:'Wara l-maltemp jiġi l-bnazzi',
    alt:['wara l maltemp jigi l bnazzi','after the storm comes calm'] },
  { k:'qawl', e:['😂','⏱️','🏆'],            en:'He who laughs last laughs best', mt:'Min jidħak l-aħħar jidħak l-aħjar',
    alt:['min jidhak l ahhar jidhak l ahjar','he who laughs last'] },
  { k:'qawl', e:['🕐','🐢','✅'],            en:'Better late than never', mt:'Aħjar tard milli qatt',
    alt:['ahjar tard milli qatt'] },
  { k:'qawl', e:['💶','🌳','🚫'],            en:'Money does not grow on trees', mt:'Il-flus ma jikbrux fis-siġar',
    alt:['il flus ma jikbrux fis sigar','money doesnt grow on trees'] },
  { k:'qawl', e:['🐦','✋','💯'],            en:'A bird in the hand is worth a hundred in the sky',
    mt:'Għasfur f\'idejk aħjar minn mija fl-ajru',
    alt:['ghasfur f idejk ahjar minn mija fl ajru','a bird in the hand'] },
  { k:'qawl', e:['👶','🎓','🚫'],            en:'Nobody is born a master', mt:'Ħadd ma jitwieled mgħallem',
    alt:['hadd ma jitwieled mghallem','nobody is born a master'] },

  /* ── MALTI — things off this island, which no imported party game
       has and which is half the reason the shelf exists. */
  { k:'malti', e:['🥟','☕','🌅'],            en:'Pastizzi', mt:'Pastizzi', alt:['pastizz'] },
  { k:'malti', e:['🍊','🌿','🥤'],            en:'Kinnie', mt:'Kinnie' },
  { k:'malti', e:['🎺','⛪','🎆'],            en:'Festa', mt:'Festa' },
  { k:'malti', e:['🌊','👁️','🛶'],            en:'Luzzu', mt:'Luzzu' },
  { k:'malti', e:['🥖','🍅','🐟'],            en:'Ftira', mt:'Ftira' },
  { k:'malti', e:['⛪','💣','🙏'],            en:'The Mosta Dome', mt:'Il-Koppla tal-Mosta',
    alt:['mosta','mosta dome','il koppla tal mosta','rotunda'] },
  { k:'malti', e:['⛵','🐟','🎣'],            en:'Marsaxlokk', mt:'Marsaxlokk' },
  { k:'malti', e:['🏛️','🇲🇹','🏙️'],            en:'Valletta', mt:'Il-Belt', alt:['il belt','belt','valetta'] },
  { k:'malti', e:['🏝️','💙','🩱'],            en:'The Blue Lagoon', mt:'Il-Blue Lagoon',
    alt:['blue lagoon','comino','kemmuna'] },
  { k:'malti', e:['🐐','🧀','🇲🇹'],            en:'Ġbejna', mt:'Ġbejna', alt:['gbejna','gbejniet'] },
  { k:'malti', e:['🍯','🥧','🌰'],            en:'Imqaret', mt:'Imqaret', alt:['imqaret','mqaret'] },
  { k:'malti', e:['🐇','🍷','🍽️'],            en:'Fenkata', mt:'Fenkata', alt:['fenek','fenkata'] }
];

const CATS = {
  film:  { en:'Film',    mt:'Film' },
  song:  { en:'Song',    mt:'Kanzunetta' },
  qawl:  { en:'Proverb', mt:'Qawl' },
  malti: { en:'Maltese', mt:'Malti' }
};

/* ── the matcher ───────────────────────────────────────────────────
   Generous on purpose. A party game that says "no" to a right answer
   because of an apostrophe is a party game people stop playing. */
const FOLD = { 'ġ':'g','ħ':'h','ż':'z','ċ':'c','à':'a','è':'e','ì':'i','ò':'o','ù':'u','ó':'o','á':'a','í':'i','é':'e' };
const ARTICLES = ['the','a','an','il','l','is','ix','ir','id','in','it','iz','ic','ta','tal','ta\''];

function norm(s){
  let t = String(s || '').toLowerCase();
  t = t.replace(/[ġħżċàèìòùóáíé]/g, c => FOLD[c] || c);
  t = t.replace(/[^a-z0-9]+/g, ' ').trim();
  /* strip leading articles, in either language, however many deep:
     "the il-Belt" is not a thing anybody types, but "il belt" is */
  let w = t.split(' ').filter(Boolean);
  while (w.length > 1 && ARTICLES.indexOf(w[0]) >= 0) w = w.slice(1);
  return w.join(' ');
}

/* How many wrong letters to forgive. Measured against a list of guesses
   that must pass and a list that must not: forgiving one letter from
   five upward accepted RICKY for Rocky, FIESTA for Festa and LUZZ for
   Luzzu — a short word is little typing and the near-misses are other
   real words. From seven up, one letter buys TITANIK and MARSAXLOK and
   costs nothing. Nothing short is forgiven at all. */
function slack(n){ return n <= 6 ? 0 : n <= 10 ? 1 : 2; }

function within(a, b, max){
  if (Math.abs(a.length - b.length) > max) return false;
  /* ordinary edit distance, banded — the strings here are short */
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++){
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++){
      cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1,
                        prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return false;        /* no way back under the cap */
    prev = cur;
  }
  return prev[b.length] <= max;
}

function answers(p){
  return [p.en, p.mt].concat(p.alt || []).map(norm).filter(Boolean);
}

function accept(guess, p){
  const g = norm(guess);
  if (!g) return false;
  for (const a of answers(p)){
    if (g === a) return true;
    if (within(g, a, slack(a.length))) return true;
  }
  return false;
}

/* points for solving with `shown` clues on the board */
function points(shown){
  return PTS[Math.min(Math.max(shown, 1), PTS.length) - 1];
}

/* ── the machine ───────────────────────────────────────────────────
   It does not "know" the answer and race you to type it — that is a
   reaction test, and L-EWWEL already is one. It decides, per puzzle,
   how many clues IT would have needed, and buzzes when that many are
   showing. Which is what a person at the table looks like from the
   outside, and it means beating it is a question of nerve. */
const BANDS = [
  { k:'easy',   name:'Slow',   solve:0.55, at:[3, 5] },
  { k:'medium', name:'Sharp',  solve:0.80, at:[2, 4] },
  { k:'hard',   name:'Quick',  solve:0.95, at:[1, 3] }
];

/* → the clue count it buzzes on, or 0 if it never gets this one */
function cpuAt(band, clues, rnd){
  const B = BANDS.find(b => b.k === band) || BANDS[1];
  const r = rnd || Math.random;
  if (r() > B.solve) return 0;
  const lo = B.at[0], hi = Math.min(B.at[1], clues);
  if (hi < lo) return hi;
  return lo + Math.floor(r() * (hi - lo + 1));
}

function draw(n, rnd){
  const r = rnd || Math.random;
  const pool = BANK.slice();
  for (let i = pool.length - 1; i > 0; i--){
    const j = Math.floor(r() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  return pool.slice(0, Math.min(n, pool.length));
}

window.KARTI_EMOJI = {
  MIN_SEATS, MAX_SEATS, ROUNDS, REVEAL_MS, GRACE_MS, PTS, BANK, CATS, BANDS,
  norm, accept, points, cpuAt, draw, answers
};

})();
