/* ═══════════════════════════════════════════════════════════════════
   KARTI — minlaktar.js
   MIN L-AKTAR? — "who is most likely to…". The bank and the scoring.

   THE SKILL IS READING THE ROOM, NOT BEING RIGHT. There is no correct
   answer to "who would argue with a traffic warden" — so the points
   go to whoever VOTED WITH THE GROUP. You score one for every other
   person who picked the same name as you. Guess how your friends see
   each other and you win; guess how you see them and you do not.

   That single rule fixes the thing that kills these games: without
   it, everyone votes for the funniest answer, nobody is playing
   anything, and it is over in four prompts.

   THE PROMPTS ARE WARM, NOT CRUEL, and that is a design constraint
   rather than squeamishness. A prompt that makes one person the butt
   of the table stops the game — they go quiet, and a quiet player is
   a player who has left. Everything here is something a person would
   happily be accused of at a kitchen table.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const MIN_SEATS = 3, MAX_SEATS = 8;
const ROUNDS = 6;

/* en, mt */
const PROMPTS = [
  ['be late to their own wedding', 'jasal tard għat-tieġ tiegħu stess'],
  ['argue with a traffic warden and win', 'jitlewwem ma\' wieħed tal-parkeġġ u jirbaħ'],
  ['eat pastizzi three days running', 'jiekol pastizzi tlett ijiem wara xulxin'],
  ['forget where they parked', 'jinsa fejn ipparkja'],
  ['start a WhatsApp group nobody wanted', 'jiftaħ grupp tal-WhatsApp li ħadd ma ried'],
  ['talk to a cat like it understands', 'jitkellem ma\' qattus bħallikieku jifhmu'],
  ['still be dancing at four in the morning', 'ikun għadu jiżfen fl-erbgħa ta\' filgħodu'],
  ['bring too much food to a picnic', 'iġib wisq ikel għal piknik'],
  ['fall asleep during the fireworks', 'jorqod waqt in-nar'],
  ['know somebody who knows somebody', 'ikun jaf lil xi ħadd li jaf lil xi ħadd'],
  ['reverse into their own gate', 'jidħol lura fil-bieb tiegħu stess'],
  ['send a voice note six minutes long', 'jibgħat voice note ta\' sitt minuti'],
  ['claim the fish was bigger than it was', 'jgħid li l-ħuta kienet akbar milli kienet'],
  ['sing louder than everyone at the festa', 'jkanta iktar b\'saħħtu minn kulħadd fil-festa'],
  ['cry at an advert', 'jibki b\'reklam'],
  ['take the last pastizz without asking', 'jieħu l-aħħar pastizz bla ma jistaqsi'],
  ['get lost in Valletta', 'jintilef il-Belt'],
  ['argue about the correct way to make tea', 'jitlewwem dwar kif isir it-te'],
  ['adopt a stray on the way home', 'jieħu qattus tat-triq id-dar'],
  ['have an opinion about the bus timetable', 'ikollu opinjoni dwar l-iskeda tal-linja'],
  ['say "five minutes" and mean an hour', 'jgħid "ħames minuti" u jfisser siegħa'],
  ['win an argument they started by accident', 'jirbaħ argument li beda bl-iżball'],
  ['keep a receipt from 2009', 'iżomm irċevuta mill-2009'],
  ['be first in the sea in April', 'jkun l-ewwel wieħed fil-baħar f\'April'],
  ['tell the same story twice in one night', 'jgħid l-istess storja darbtejn f\'lejl'],
  ['do the washing up before the guests leave', 'jaħsel il-platti qabel jitilqu l-mistednin'],
  ['name their car', 'jagħti isem lill-karozza'],
  ['refuse to use a map', 'jirrifjuta li juża mappa'],
  ['bring a jacket in August', 'iġib ġakketta f\'Awwissu'],
  ['answer the phone to an unknown number', 'iwieġeb telefon minn numru li ma jafx'],
  ['know every shortcut and use none of them', 'ikun jaf kull shortcut u ma jużax wieħed'],
  ['start a project and finish it in three years', 'jibda proġett u jlestih fi tliet snin'],
  ['make friends with the waiter', 'jagħmel ħbieb mal-wejter'],
  ['be the last to leave a party', 'ikun l-aħħar wieħed li jitlaq minn party'],
  ['have a strong opinion about ftira', 'ikollu opinjoni soda dwar il-ftira'],
  ['lose at cards and demand a rematch', 'jitlef fil-karti u jitlob rivinċita']
];

function draw(n, rnd){
  const r = rnd || Math.random;
  const pool = PROMPTS.slice();
  for (let i = pool.length - 1; i > 0; i--){
    const j = Math.floor(r() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  return pool.slice(0, n).map(p => ({ en:p[0], mt:p[1] }));
}

/* votes is an array: votes[voter] = seat index they picked.
   Everyone scores one point per OTHER voter who agreed with them. */
function scoreRound(votes, seatCount){
  const tally = new Array(seatCount).fill(0);
  votes.forEach(v => { if (v >= 0) tally[v]++; });
  return votes.map(v => (v >= 0 ? Math.max(0, tally[v] - 1) : 0));
}

/* who the room picked, and whether it was clean */
function winnerOf(votes, seatCount){
  const tally = new Array(seatCount).fill(0);
  votes.forEach(v => { if (v >= 0) tally[v]++; });
  const most = Math.max.apply(null, tally);
  const who = tally.indexOf(most);
  return { who, most, split: tally.filter(c => c === most).length > 1, tally };
}

window.KARTI_MINLAKTAR = {
  MIN_SEATS, MAX_SEATS, ROUNDS, PROMPTS, draw, scoreRound, winnerOf,
  bankSize: () => PROMPTS.length
};

})();
