/* ═══════════════════════════════════════════════════════════════════
   KARTI — emoji-ui.js
   EMOJI — the screen. Clues land one at a time and the points fall
   with them.

   THE POINTS ON OFFER ARE ON SCREEN, BIG, AND THEY DROP WHILE YOU
   WATCH. That number is the game. If it were only in the rules panel
   the whole design — shout now or wait — would be invisible, and the
   game would read as "guess the picture" with a mystery score.

   A WRONG GUESS COSTS THE CLOCK, NOT A LIFE. Being wrong here is
   supposed to be cheap and frequent: you throw out a hunch, it is not
   that, you throw out another. What it costs is the seconds that
   bring the next clue, and the next clue costs a point.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const E = window.KARTI_EMOJI;
if (!K || !P || !E) return;

const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
/* KARTI_LANG.lang is a FUNCTION (js/lang.js:48). Reading it as a
   property is always truthy and never 'mt', which silently pins the
   whole game to English — js/cards2131-ui.js has that bug today. */
const mtNow = () => !!(window.KARTI_LANG && KARTI_LANG.lang() === 'mt');
const esc = K.esc;
const SEATCOL = ['#FFC542', '#4FB6FF', '#3DDC84', '#FF5468', '#C08BFF', '#FF9F45'];

let M = null;

let cssIn = false;
function injectCSS(){
  if (cssIn) return; cssIn = true;
  const st = document.createElement('style');
  st.id = 'emoji-css';
  st.textContent = (`
.em-wrap{display:flex;flex-direction:column;gap:10px;height:100%;padding:2px 0}
.em-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:0 0 auto}
.em-cat{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim2);font-weight:800}
.em-worth{display:flex;align-items:baseline;gap:5px;font-weight:900}
.em-worth b{font-family:var(--disp);font-size:26px;line-height:1;color:var(--gold)}
.em-worth i{font-style:normal;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim2)}
.em-worth.drop b{animation:em-drop .4s var(--ease)}
@keyframes em-drop{0%{transform:scale(1.35);color:#FF8DA0}100%{transform:scale(1);color:var(--gold)}}
.em-clues{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center;
  flex:1 1 auto;min-height:96px;padding:14px 8px;border-radius:16px;
  background:rgba(0,0,0,.26);border:1px solid rgba(255,255,255,.09)}
.em-clue{font-size:min(13vw,52px);line-height:1;animation:em-in .34s var(--ease)}
.em-clue.ghost{opacity:.13;font-size:min(9vw,34px)}
@keyframes em-in{0%{opacity:0;transform:scale(.5) rotate(-12deg)}100%{opacity:1;transform:none}}
.em-in{width:100%;min-height:52px;border-radius:13px;padding:10px 14px;font:inherit;font-size:18px;
  font-weight:800;color:var(--ink);background:rgba(255,255,255,.07);
  border:1px solid rgba(255,255,255,.16);text-align:center}
.em-in:focus{outline:none;border-color:var(--gold)}
.em-row{display:flex;gap:8px;flex:0 0 auto}
.em-send{flex:1 1 auto;min-height:48px;border-radius:13px;font:inherit;font-size:15px;font-weight:900;
  cursor:pointer;color:#0F0A1C;background:var(--gold);border:0}
.em-skip{flex:0 0 auto;min-width:96px;min-height:48px;border-radius:13px;font:inherit;font-size:13px;
  font-weight:800;cursor:pointer;color:var(--dim);background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.14)}
.em-said{text-align:center;font-size:13px;font-weight:800;min-height:1.4em;color:var(--dim)}
.em-said.bad{color:#FF8DA0}
.em-said.good{color:#7FE8A8}
.em-score{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;flex:0 0 auto}
.em-chip{display:flex;align-items:center;gap:6px;padding:4px 9px;border-radius:99px;
  background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.10);font-size:12px;font-weight:800}
.em-chip i{width:9px;height:9px;border-radius:50%;display:block}
.em-chip.turn{border-color:var(--gold);background:rgba(255,197,66,.14)}
.em-chip .pts{color:var(--dim);font-variant-numeric:tabular-nums}
.em-pass{text-align:center;padding:26px 14px}
.em-pass h3{font-family:var(--disp);font-size:24px;margin:0 0 8px}
.em-pass p{color:var(--dim);font-size:14px;margin:0 0 18px}
.em-answer{text-align:center;font-size:15px;font-weight:900;color:var(--gold);min-height:1.3em}
`).replace(/^\.em/gm, '#scr-party .em');
  document.head.appendChild(st);
}

function prefs(){
  const p = P.pref('emoji') || {};
  return { level: p.level || 'medium' };
}

function setupSheet(){
  injectCSS();
  const p = prefs();
  P.ui.setup({
    id:'emoji',
    title:T('Emoji','Emoji'),
    sub:T('Guess it from the pictures','Aqta\' mill-istampi'),
    blurb:T('Films, songs, proverbs and things off this island — in emoji and nothing else. A clue lands every few seconds and every clue costs you a point, so the game is whether you dare answer early.',
            'Films, kanzunetti, qwiel u affarijiet ta\' din il-gżira — bl-emoji u xejn iżjed. Kull ftit sekondi tiġi ħjiel ġdida u kull waħda tiswielek punt, mela l-logħba hi jekk għandekx il-kuraġġ twieġeb kmieni.'),
    levels: E.BANDS.map(b => ({ k:b.k, name:b.name,
      note: b.k === 'easy' ? T('Needs four or five clues','Irid erba\' jew ħames ħjiel')
          : b.k === 'hard' ? T('Often has it on the first','Ħafna drabi jaqtagħha mal-ewwel')
          : T('Needs two or three','Irid tnejn jew tlieta'), icon:'eye' })),
    onBack: () => P.hub(),
    onStart: (o) => {
      const level = (o && o.level) || p.level;
      P.pref('emoji', { level });
      start((o && o.seats) || null, level);
    }
  });
}

function start(seatList, level){
  injectCSS();
  const seats = [];
  if (seatList && seatList.length){
    seatList.forEach((s, i) => seats.push({
      name: s.name || (s.kind === 'cpu' ? T('Machine','Magna') : T('Player','Plejer') + ' ' + (i+1)),
      cpu: s.kind === 'cpu', pts:0
    }));
  } else {
    seats.push({ name:T('You','Int'), cpu:false, pts:0 });
    seats.push({ name:T('Machine','Magna'), cpu:true, pts:0 });
  }
  /* ONE PUZZLE PER ROUND, SHARED. Everybody at the table is looking at
     the same clues at the same time, which is the only version of this
     that a room can shout at. Separate puzzles per seat would be
     several people playing solitaire next to each other. */
  const solo = seats.filter(s => !s.cpu).length <= 1;
  M = { seats, level, solo, list:E.draw(E.ROUNDS), r:-1,
        shown:0, done:false, ctx:null, tRev:null, tCpu:null, tEnd:null,
        mid:'emoji-' + Date.now() };
  openBoard();
  nextRound();
}

function openBoard(){
  M.ctx = P.ui.frame({
    title:T('Emoji','Emoji'),
    onBack: () => { leave(); P.hub(); },
    leave, buttons: []
  });
  const b = M.ctx.board;
  b.style.cssText = 'display:block;grid-template-columns:none;grid-template-rows:none;' +
    'width:100%;max-width:520px;border:0;box-shadow:none;overflow:visible;background:transparent';
}

function clear(){
  if (!M) return;
  [M.tRev, M.tCpu, M.tEnd].forEach(t => t && clearTimeout(t));
  M.tRev = M.tCpu = M.tEnd = null;
}

function nextRound(){
  if (!M) return;
  clear();
  M.r++;
  if (M.r >= M.list.length) return finish();
  M.shown = 0;
  M.done = false;
  M.p = M.list[M.r];
  M.cpuAt = M.seats.some(s => s.cpu) ? E.cpuAt(M.level, M.p.e.length) : 0;
  paint();
  reveal();
}

function paint(){
  const p = M.p;
  const cat = E.CATS[p.k] || { en:p.k, mt:p.k };
  const worth = E.points(Math.max(M.shown, 1));
  M.ctx.board.innerHTML =
    '<div class="em-wrap">' +
      '<div class="em-top">' +
        '<span class="em-cat">' + esc(mtNow() ? cat.mt : cat.en) + ' · ' +
          T('Round','Rawnd') + ' ' + (M.r + 1) + '/' + M.list.length + '</span>' +
        '<span class="em-worth" id="em-worth"><b>' + worth + '</b><i>' +
          T('points','punti') + '</i></span>' +
      '</div>' +
      '<div class="em-clues" id="em-clues"></div>' +
      '<div class="em-answer" id="em-answer"></div>' +
      '<input class="em-in" id="em-in" autocomplete="off" autocorrect="off" ' +
        'autocapitalize="off" spellcheck="false" ' +
        'placeholder="' + T('Type your answer','Ikteb it-tweġiba') + '">' +
      '<div class="em-row">' +
        '<button class="em-send" id="em-send">' + T('Say it','Għidha') + '</button>' +
        '<button class="em-skip" id="em-skip">' + T('Give up','Irrinunzja') + '</button>' +
      '</div>' +
      '<div class="em-said" id="em-said"></div>' +
      '<div class="em-score" id="em-score"></div>' +
    '</div>';
  clues();
  score();
  const inp = M.ctx.board.querySelector('#em-in');
  const go = () => guess(inp.value);
  M.ctx.board.querySelector('#em-send').onclick = go;
  M.ctx.board.querySelector('#em-skip').onclick = () => lose(T('You gave it up.','Irrinunzjajt.'));
  inp.onkeydown = ev => { if (ev.key === 'Enter'){ ev.preventDefault(); go(); } };
  try { inp.focus({ preventScroll:true }); } catch(e){}
}

function clues(){
  const box = M.ctx.board.querySelector('#em-clues');
  if (!box) return;
  const p = M.p;
  box.innerHTML = p.e.map((c, i) => i < M.shown
    ? '<span class="em-clue">' + c + '</span>'
    /* the unspent clues are SHOWN AS BLANKS, not hidden — knowing that
       two more are coming is part of deciding whether to wait */
    : '<span class="em-clue ghost">?</span>').join('');
}

function score(){
  const el = M.ctx.board.querySelector('#em-score');
  if (!el) return;
  el.innerHTML = M.seats.map((s, i) =>
    '<span class="em-chip">' +
      '<i style="background:' + SEATCOL[i % SEATCOL.length] + '"></i>' + esc(s.name) +
      ' <span class="pts">' + s.pts + '</span></span>').join('');
}

function worth(){
  const el = M.ctx.board.querySelector('#em-worth');
  if (!el) return;
  el.querySelector('b').textContent = E.points(Math.max(M.shown, 1));
  el.classList.remove('drop');
  void el.offsetWidth;
  el.classList.add('drop');
}

function reveal(){
  if (!M || M.done) return;
  M.shown++;
  clues();
  if (M.shown > 1) worth();
  /* the machine buzzes on ITS clue count, not on a stopwatch */
  if (M.cpuAt && M.shown >= M.cpuAt && !M.done){
    M.tCpu = setTimeout(() => { if (M && !M.done) cpuTakes(); }, 900);
  }
  if (M.shown < M.p.e.length){
    M.tRev = setTimeout(reveal, E.REVEAL_MS);
  } else {
    /* out of clues: a last few seconds, then it is gone */
    M.tEnd = setTimeout(() => { if (M && !M.done) lose(T('Time.','Ħin.')); }, E.GRACE_MS);
  }
}

function say(msg, cls){
  const el = M.ctx.board.querySelector('#em-said');
  if (el){ el.className = 'em-said' + (cls ? ' ' + cls : ''); el.textContent = msg || ''; }
}

function guess(text){
  if (!M || M.done) return;
  const inp = M.ctx.board.querySelector('#em-in');
  const t = String(text || '').trim();
  if (!t) return;
  if (E.accept(t, M.p)) return win();
  if (inp) { inp.value = ''; try { inp.focus({ preventScroll:true }); } catch(e){} }
  say(T('Not that one.','Mhux dik.'), 'bad');
  try { if (K.sfx) K.sfx('bad'); } catch(e){}
}

function answerLine(){
  const p = M.p;
  const a = mtNow() ? p.mt : p.en;
  const other = mtNow() ? p.en : p.mt;
  return esc(a) + (E.norm(a) === E.norm(other) ? '' : ' · ' + esc(other));
}

function win(){
  if (!M || M.done) return;
  M.done = true;
  clear();
  const me = M.seats.findIndex(s => !s.cpu);
  const got = E.points(Math.max(M.shown, 1));
  if (me >= 0) M.seats[me].pts += got;
  say('+' + got + '  ' + T('Yes!','Iva!'), 'good');
  const el = M.ctx.board.querySelector('#em-answer');
  if (el) el.innerHTML = answerLine();
  score();
  try { if (K.sfx) K.sfx('good'); } catch(e){}
  M.tEnd = setTimeout(nextRound, 1700);
}

function cpuTakes(){
  if (!M || M.done) return;
  M.done = true;
  clear();
  const ci = M.seats.findIndex(s => s.cpu);
  const got = E.points(Math.max(M.shown, 1));
  if (ci >= 0) M.seats[ci].pts += got;
  say(esc(M.seats[ci >= 0 ? ci : 0].name) + ' ' + T('had it.','qatgħetha.') + '  +' + got, 'bad');
  const el = M.ctx.board.querySelector('#em-answer');
  if (el) el.innerHTML = answerLine();
  score();
  M.tEnd = setTimeout(nextRound, 1900);
}

function lose(why){
  if (!M || M.done) return;
  M.done = true;
  clear();
  say(why, 'bad');
  const el = M.ctx.board.querySelector('#em-answer');
  if (el) el.innerHTML = answerLine();
  M.tEnd = setTimeout(nextRound, 1900);
}

function finish(){
  if (!M) return;
  clear();
  const order = M.seats.map((s, i) => ({ s, i })).sort((a, b) => b.s.pts - a.s.pts);
  const top = order[0];
  const tie = order.length > 1 && order[1].s.pts === top.s.pts;
  const meIdx = M.seats.findIndex(s => !s.cpu);
  const iWon = !tie && meIdx >= 0 && top.i === meIdx;
  const mine = meIdx >= 0 ? M.seats[meIdx].pts : 0;
  const best = M.list.length * E.PTS[0];
  if (meIdx >= 0 && window.KARTI_XP && KARTI_XP.awardPlay){
    try { KARTI_XP.awardPlay({ game:'emoji', won:iWon, draw:tie, id:M.mid, ranked:false }); } catch(e){}
  }
  if (meIdx >= 0) try { P.record('emoji', tie ? 'd' : iWon ? 'w' : 'l'); } catch(e){}
  P.ui.result(M.ctx, {
    tone: tie ? 'draw' : iWon ? 'win' : 'lose',
    head: tie ? T('Dead heat','Indaqs')
        : (top.i === meIdx ? T('You win','Rebaħt') : esc(top.s.name) + T(' takes it',' jirbaħ')),
    why: M.seats.map(s => esc(s.name) + ' ' + s.pts).join('  ·  ') +
         '  ·  ' + mine + '/' + best,
    quip: mine >= best * 0.7 ? T('You were answering on one emoji. Showing off.','Kont twieġeb fuq emoji waħda. Qed titkabbar.')
        : iWon ? T('Held your nerve.','Żammejt il-kalma.')
        : T('Waiting for the last clue is how you lose points.','Li tistenna l-aħħar ħjiel hu kif titlef il-punti.'),
    buttons:[
      { label:T('Play again',"Erġa' lgħab"), icon:'refresh', cls:'primary', go:() => { leave(); setupSheet(); } },
      { label:T('Leave','Oħroġ'), icon:'back', cls:'ghost', go:() => { leave(); P.hub(); } }
    ]
  });
}

function leave(){
  if (M) clear();
  M = null;
}

/* THE CALLER MAY NAME THE DIFFICULTY, and IR-RAKKONT does: a boss has a
   band and the level it picks must beat this phone's own preference.
   Validated against what this game actually publishes, so a caller
   asking for a level that does not exist gets the player's setting
   rather than an undefined band. */
function lvl(o){
  const want = o && o.level;
  if (want && E.BANDS && E.BANDS.some(b => b.k === want)) return want;
  return prefs().level;
}

const LOBBY = {
  canStart(list){
    const n = (list || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why:T('Somebody has to play.','Xi ħadd irid jilgħab.') };
    if (n > E.MAX_SEATS) return { ok:false, why:T('Up to six can play.','Sa sitta jistgħu jilagħbu.') };
    return { ok:true, why:'' };
  },
  rulesHTML: () => '<p>' + [
    T('A film, a song, a proverb or something off this island — in emoji only.',
      'Film, kanzunetta, qawl jew xi ħaġa ta\' din il-gżira — bl-emoji biss.'),
    T('The clues come one at a time. Five points if you get it on the first, then four, three, two, one.',
      'Il-ħjiel jiġi wieħed wieħed. Ħames punti jekk taqtagħha mal-ewwel, imbagħad erbgħa, tlieta, tnejn, wieħed.'),
    T('Wrong guesses cost nothing but the seconds — and the seconds bring the next clue.',
      'Tweġiba ħażina ma tiswa xejn ħlief is-sekondi — u s-sekondi jġibu l-ħjiel li jmiss.'),
    T('Spelling is forgiven. Either language is accepted.',
      'L-ortografija maħfura. Iż-żewġ lingwi jgħaddu.')
  ].join('</p><p>') + '</p>',
  blurb: T('Guess it from the emoji. Answer early, score more.','Aqta\' mill-emoji. Wieġeb kmieni, tieħu iżjed.'),
  start(seats, o){ start(seats, lvl(o)); return { v:1, gid:'emoji' }; },
  levels: E.BANDS.map(b => ({ k:b.k, name:b.name }))
};

const TILE = {
  id:'emoji', order:22, kind:'board', cat:'word',
  name:'Emoji', mt:'Emoji', icon:'eye', status:'live',
  get tag(){ return T('A film, a song, a qawl or something Maltese, told in emoji and nothing else. The clues arrive one at a time and each one costs you a point, so the whole game is whether you dare answer on the first.',
    'Film, kanzunetta, qawl jew xi ħaġa Maltija, imfissra bl-emoji u xejn iżjed. Il-ħjiel jiġi wieħed wieħed u kull wieħed jiswielek punt, mela l-logħba kollha hi jekk għandekx il-kuraġġ twieġeb mal-ewwel.'); },
  open: () => setupSheet(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: LOBBY.levels,
  rulesHTML: () => LOBBY.rulesHTML(),
  /* forward the OPTIONS too — IR-RAKKONT names the difficulty here */
  start: (list, o) => LOBBY.start(list, o)
};

const R = (window.KARTI_EMOJI_UI = {});
R.shelfTile = TILE; R.lobby = LOBBY;
R.ui = { open:setupSheet, leave, injectCSS };
R.open = () => setupSheet();
R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

if (/[?&]emojitest\b/.test(location.search || '')){
  window.__EMOJI_TEST = {
    setupSheet, start, guess, nextRound, finish, leave,
    get M(){ return M; }, engine:E, TILE, LOBBY
  };
}

})();
