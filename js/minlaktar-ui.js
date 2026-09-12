/* ═══════════════════════════════════════════════════════════════════
   KARTI — minlaktar-ui.js
   MIN L-AKTAR? — the screen. A prompt, a list of names, and the
   reveal that makes the table shout.

   THE REVEAL IS THE PRODUCT. The voting is plumbing; what people are
   here for is the two seconds where the tally appears and somebody
   says "who put ME?". So the reveal is not a line of text — it is
   every name with its bar, longest first, and the winner named
   underneath.

   VOTES ARE SECRET UNTIL THEY ARE ALL IN. The phone is passed and
   each vote is taken on a screen that shows no running tally, because
   a visible tally turns the last voter into a kingmaker and everybody
   before them into a warm-up act.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const E = window.KARTI_MINLAKTAR;
if (!K || !P || !E) return;

const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
const esc = K.esc;
const lang = () => (window.KARTI_LANG && KARTI_LANG.cur && KARTI_LANG.cur() === 'mt') ? 'mt' : 'en';
const SEATCOL = ['#FFC542', '#4FB6FF', '#3DDC84', '#FF5468', '#C08BFF', '#FF9F45', '#7FE8D0', '#FFB3C7'];

let M = null;

let cssIn = false;
function injectCSS(){
  if (cssIn) return; cssIn = true;
  const st = document.createElement('style');
  st.id = 'minlaktar-css';
  st.textContent = (`
.ml-wrap{display:flex;flex-direction:column;gap:10px;height:100%;padding:2px 0}
.ml-round{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim2);
  font-weight:800;text-align:center}
.ml-q{font-family:var(--disp);font-weight:900;font-size:20px;line-height:1.3;text-align:center;
  padding:4px 8px;min-height:2.4em;display:grid;place-items:center}
.ml-q b{color:var(--gold);display:block;font-size:12px;letter-spacing:.16em;
  text-transform:uppercase;margin-bottom:5px}
.ml-names{display:flex;flex-direction:column;gap:7px;flex:1 1 auto;overflow-y:auto}
.ml-name{width:100%;min-height:46px;border-radius:12px;padding:8px 14px;text-align:left;
  font:inherit;font-size:15px;font-weight:800;color:var(--ink);cursor:pointer;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);
  display:flex;align-items:center;gap:9px}
.ml-name i{width:11px;height:11px;border-radius:50%;display:block;flex:0 0 auto}
.ml-name.out{opacity:.35;cursor:default}
.ml-bars{display:flex;flex-direction:column;gap:6px;flex:1 1 auto}
.ml-bar{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800}
.ml-bar .n{width:8.5ch;flex:0 0 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ml-bar .t{flex:1;height:16px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden}
.ml-bar .t i{display:block;height:100%;border-radius:99px;transition:width .5s cubic-bezier(.2,.8,.3,1)}
.ml-bar .v{width:2ch;text-align:right;color:var(--dim);font-variant-numeric:tabular-nums}
.ml-said{text-align:center;font-size:14px;font-weight:800;color:var(--gold);min-height:1.4em}
.ml-pass{text-align:center;padding:20px 12px;display:grid;place-items:center;gap:10px;flex:1 1 auto}
.ml-pass h3{font-family:var(--disp);font-size:22px;margin:0}
.ml-pass p{color:var(--dim);font-size:13px;margin:0;max-width:32ch;line-height:1.5}
.ml-big{min-height:52px;padding:10px 26px;border-radius:14px;font:inherit;font-size:15px;
  font-weight:900;cursor:pointer;color:#0F0A1C;background:var(--gold);border:0}
.ml-score{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;flex:0 0 auto}
.ml-chip{display:flex;align-items:center;gap:6px;padding:4px 9px;border-radius:99px;
  background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.10);font-size:12px;font-weight:800}
.ml-chip i{width:9px;height:9px;border-radius:50%;display:block}
.ml-chip.turn{border-color:var(--gold);background:rgba(255,197,66,.14)}
.ml-chip .pts{color:var(--dim);font-variant-numeric:tabular-nums}
`).replace(/^\.ml/gm, '#scr-party .ml');
  document.head.appendChild(st);
}

function setupSheet(){
  injectCSS();
  P.ui.setup({
    id:'minlaktar',
    title:T('Min l-Aktar?','Min l-Aktar?'),
    sub:T('Who is most likely to…','Min l-aktar li…'),
    blurb:T('There is no right answer — you score for voting with the room. Guess how your friends see each other.',
            'M\'hemmx risposta tajba — tieħu punti talli tivvota mal-grupp. Aqta\' kif jarawh lil xulxin.'),
    levels: [],
    onBack: () => P.hub(),
    onStart: (o) => start((o && o.seats) || null)
  });
}

function start(seatList){
  injectCSS();
  const seats = [];
  const list = (seatList && seatList.length >= E.MIN_SEATS) ? seatList : [{}, {}, {}];
  list.forEach((s, i) => seats.push({
    name: (s && s.name) || T('Player','Plejer') + ' ' + (i + 1), pts:0
  }));
  M = { seats, round:0, prompts:E.draw(E.ROUNDS), votes:[], voter:0,
        ctx:null, mid:'minlaktar-' + Date.now() };
  openBoard();
  beginRound();
}

function openBoard(){
  M.ctx = P.ui.frame({
    title:T('Min l-Aktar?','Min l-Aktar?'),
    onBack: () => { leave(); P.hub(); },
    leave, buttons: []
  });
  const b = M.ctx.board;
  b.style.cssText = 'display:block;grid-template-columns:none;grid-template-rows:none;' +
    'width:100%;max-width:520px;border:0;box-shadow:none;overflow:visible;background:transparent';
}

function scoreRow(active){
  return '<div class="ml-score">' + M.seats.map((s, i) =>
    '<span class="ml-chip' + (i === active ? ' turn' : '') + '">' +
      '<i style="background:' + SEATCOL[i % SEATCOL.length] + '"></i>' + esc(s.name) +
      ' <span class="pts">' + s.pts + '</span></span>').join('') + '</div>';
}

function passTo(head, sub, btn, go, active){
  M.ctx.board.innerHTML =
    '<div class="ml-wrap"><div class="ml-pass">' +
      '<h3>' + esc(head) + '</h3><p>' + esc(sub) + '</p>' +
      '<button class="ml-big" id="ml-go">' + esc(btn) + '</button>' +
    '</div>' + scoreRow(active) + '</div>';
  M.ctx.board.querySelector('#ml-go').onclick = go;
}

function beginRound(){
  if (M.round >= M.prompts.length) return finish();
  M.votes = M.seats.map(() => -1);
  M.voter = 0;
  passTo(T('Hand the phone to ','Għaddi t-telefon lil ') + M.seats[0].name,
         T('Everybody votes in turn. Keep it to yourself until they are all in.',
           'Kulħadd jivvota bin-nobba. Żommha għalik sakemm jivvotaw kollha.'),
         T('Vote','Ivvota'), voteTurn, 0);
}

function voteTurn(){
  const L = lang();
  const p = M.prompts[M.round];
  const seat = M.seats[M.voter];
  M.ctx.board.innerHTML =
    '<div class="ml-wrap">' +
      '<div class="ml-round">' + T('Round ','Rawnd ') + (M.round + 1) + ' / ' + M.prompts.length +
        '  ·  ' + esc(seat.name) + '</div>' +
      '<div class="ml-q"><b>' + T('Who is most likely to','Min l-aktar li') + '</b>' +
        esc(L === 'mt' ? p.mt : p.en) + '?</div>' +
      '<div class="ml-names" id="ml-names"></div>' +
      scoreRow(M.voter) +
    '</div>';
  const box = M.ctx.board.querySelector('#ml-names');
  /* YOU CAN VOTE FOR YOURSELF. Taking that away removes the funniest
     honest answer a table ever gives. */
  box.innerHTML = M.seats.map((s, i) =>
    '<button class="ml-name" data-i="' + i + '">' +
      '<i style="background:' + SEATCOL[i % SEATCOL.length] + '"></i>' + esc(s.name) +
      (i === M.voter ? T(' (you)',' (int)') : '') + '</button>').join('');
  box.querySelectorAll('.ml-name').forEach(b => b.onclick = () => {
    M.votes[M.voter] = +b.dataset.i;
    M.voter++;
    if (M.voter < M.seats.length){
      passTo(T('Hand it to ','Għaddih lil ') + M.seats[M.voter].name,
             T('Your turn.','Imissek.'), T('Vote','Ivvota'), voteTurn, M.voter);
    } else reveal();
  });
}

function reveal(){
  const L = lang();
  const p = M.prompts[M.round];
  const w = E.winnerOf(M.votes, M.seats.length);
  const gained = E.scoreRound(M.votes, M.seats.length);
  gained.forEach((g, i) => { M.seats[i].pts += g; });

  const max = Math.max(1, w.most);
  M.ctx.board.innerHTML =
    '<div class="ml-wrap">' +
      '<div class="ml-q"><b>' + T('Who is most likely to','Min l-aktar li') + '</b>' +
        esc(L === 'mt' ? p.mt : p.en) + '?</div>' +
      '<div class="ml-bars">' + M.seats.map((s, i) =>
        '<div class="ml-bar"><span class="n">' + esc(s.name) + '</span>' +
        '<span class="t"><i style="width:0%;background:' + SEATCOL[i % SEATCOL.length] + '"></i></span>' +
        '<span class="v">' + w.tally[i] + '</span></div>').join('') + '</div>' +
      '<div class="ml-said">' + (w.split
        ? T('The room could not agree.','Il-grupp ma qabilx.')
        : esc(M.seats[w.who].name) + T(' — the room has spoken.',' — il-grupp qal tiegħu.')) + '</div>' +
      scoreRow(-1) +
    '</div>';
  /* let the bars grow, because a bar that is already full is a number */
  requestAnimationFrame(() => {
    const bars = M.ctx.board.querySelectorAll('.ml-bar .t i');
    bars.forEach((el, i) => { el.style.width = Math.round(100 * w.tally[i] / max) + '%'; });
  });
  try { if (K.sfx) K.sfx('good'); } catch(e){}

  setTimeout(() => {
    if (!M) return;
    M.round++;
    if (M.round >= M.prompts.length) return finish();
    beginRound();
  }, 3400);
}

function finish(){
  const order = M.seats.map((s, i) => ({ s, i })).sort((a, b) => b.s.pts - a.s.pts);
  const top = order[0];
  const tie = order.length > 1 && order[1].s.pts === top.s.pts;
  if (window.KARTI_XP && KARTI_XP.awardPlay){
    try { KARTI_XP.awardPlay({ game:'minlaktar', won:true, draw:tie, id:M.mid, ranked:false }); } catch(e){}
  }
  try { P.record('minlaktar', tie ? 'd' : 'w'); } catch(e){}
  P.ui.result(M.ctx, {
    tone: tie ? 'draw' : 'win',
    head: tie ? T('Dead heat','Indaqs')
              : esc(top.s.name) + T(' reads the room',' jaqra l-grupp'),
    why: M.seats.map(s => esc(s.name) + ' ' + s.pts).join('  ·  '),
    quip: T('Nobody learned anything they did not already suspect.',
            'Ħadd ma tgħallem xejn li ma kienx diġà jissuspetta.'),
    buttons:[
      { label:T('Play again',"Erġa' lgħab"), icon:'refresh', cls:'primary', go:() => { leave(); setupSheet(); } },
      { label:T('Leave','Oħroġ'), icon:'back', cls:'ghost', go:() => { leave(); P.hub(); } }
    ]
  });
}

function leave(){ M = null; }

const LOBBY = {
  canStart(list){
    const n = (list || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why:T('Min l-Aktar? needs three — with two there is no room to read.','Min l-Aktar? irid tlieta — b\'tnejn m\'hemmx grupp x\'taqra.') };
    if (n > E.MAX_SEATS) return { ok:false, why:T('Up to eight can play.','Sa tmienja jistgħu jilagħbu.') };
    return { ok:true, why:'' };
  },
  rulesHTML: () => '<p>' + [
    T('A prompt appears: who is most likely to do this? Everybody votes in turn, and nobody sees the tally until they are all in.',
      'Titla\' mistoqsija: min l-aktar li jagħmel dan? Kulħadd jivvota bin-nobba, u ħadd ma jara r-riżultat qabel.'),
    T('There is no right answer. You score one point for EVERY other person who voted the same as you.',
      'M\'hemmx risposta tajba. Tieħu punt għal KULL persuna oħra li vvutat bħalek.'),
    T('So the game is not "who is it" — it is "who does everybody think it is".',
      'Mela l-logħba mhix "min hu" — hi "min jaħseb kulħadd li hu".'),
    T('You may vote for yourself. Six rounds.','Tista\' tivvota għalik innifsek. Sitt rawnds.')
  ].join('</p><p>') + '</p>',
  blurb: T('Vote with the room, not with your gut.','Ivvota mal-grupp, mhux ma\' qalbek.'),
  start(seats){ start(seats); return { v:1, gid:'minlaktar' }; },
  levels: []
};

const TILE = {
  id:'minlaktar', order:19, kind:'board', cat:'party',
  name:'Min l-Aktar?', mt:'Min l-Aktar?', icon:'people', status:'live',
  get tag(){ return T('Who is most likely to argue with a traffic warden and win? There is no right answer — you score for voting with the room, so the game is guessing how your friends see each other. Three to eight.',
    'Min l-aktar li jitlewwem ma\' wieħed tal-parkeġġ u jirbaħ? M\'hemmx risposta tajba — tieħu punti talli tivvota mal-grupp. Tlieta sa tmienja.'); },
  open: () => setupSheet(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: [],
  rulesHTML: () => LOBBY.rulesHTML(),
  start: (list) => LOBBY.start(list)
};

const R = (window.KARTI_MINLAKTAR_UI = {});
R.shelfTile = TILE; R.lobby = LOBBY;
R.ui = { open:setupSheet, leave, injectCSS };
R.open = () => setupSheet();
R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

if (/[?&]mltest\b/.test(location.search || '')){
  window.__ML_TEST = {
    setupSheet, start, voteTurn, reveal, finish, leave,
    get M(){ return M; }, engine:E, TILE, LOBBY
  };
}

})();
