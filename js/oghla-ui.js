/* ═══════════════════════════════════════════════════════════════════
   KARTI — oghla-ui.js
   OGĦLA JEW INQAS — the screen. One card, two buttons, a streak.

   THE CARD IS THE SCREEN. Everything else is small and out of the
   way, because the only question being asked is about that one card
   and the player should never have to look for it.

   CASH OUT IS THE GAME. Without it this is a coin toss with extra
   steps: you keep calling until you are wrong and the run always ends
   the same way. With it, every correct call becomes a question —
   take the fifteen you have, or reach for twenty-one and risk the
   lot. That button is the reason this is worth building.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const E = window.KARTI_OGHLA;
if (!K || !P || !E) return;

const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
const esc = K.esc;
const SEATCOL = ['#FFC542', '#4FB6FF', '#3DDC84', '#FF5468', '#C08BFF', '#FF9F45'];
const PIP = { S:'♠', H:'♥', D:'♦', C:'♣' };

let M = null;

let cssIn = false;
function injectCSS(){
  if (cssIn) return; cssIn = true;
  const st = document.createElement('style');
  st.id = 'oghla-css';
  st.textContent = (`
.og-wrap{display:flex;flex-direction:column;gap:10px;height:100%;padding:2px 0;align-items:center}
.og-card{width:148px;height:206px;border-radius:16px;background:linear-gradient(180deg,#FFF9EC,#E9DCC2);
  color:#241134;display:grid;place-items:center;position:relative;flex:0 0 auto;
  box-shadow:0 12px 30px rgba(0,0,0,.5);border:2px solid rgba(0,0,0,.35)}
.og-card.red{color:#C1213B}
.og-card .r{font-family:var(--disp);font-weight:900;font-size:62px;line-height:1}
.og-card .p{font-size:30px;line-height:1;margin-top:2px}
.og-card .c{position:absolute;top:8px;left:10px;font-size:15px;font-weight:900}
.og-card.flip{animation:ogflip .28s ease-out}
@keyframes ogflip{from{transform:rotateY(80deg) scale(.94);opacity:.3}to{transform:none;opacity:1}}
.og-odds{font-size:11px;color:var(--dim2);letter-spacing:.1em;text-transform:uppercase;font-weight:800}
.og-calls{display:flex;gap:10px;width:100%;max-width:380px;flex:0 0 auto}
.og-call{flex:1;min-height:64px;border-radius:15px;font:inherit;font-size:16px;font-weight:900;
  color:var(--ink);cursor:pointer;border:1px solid rgba(255,255,255,.16);
  background:rgba(255,255,255,.07);display:grid;place-items:center;gap:2px;
  transition:transform .1s,background .12s}
.og-call:active{transform:scale(.97)}
.og-call.up{background:rgba(61,220,132,.14);border-color:rgba(61,220,132,.5)}
.og-call.down{background:rgba(79,182,255,.13);border-color:rgba(79,182,255,.5)}
.og-call[disabled]{opacity:.45;cursor:default}
.og-bank{display:flex;gap:10px;align-items:center;justify-content:center;flex:0 0 auto}
.og-run{font-family:var(--disp);font-weight:900;font-size:15px;color:var(--gold)}
.og-cash{min-height:40px;padding:6px 16px;border-radius:12px;font:inherit;font-size:13px;
  font-weight:900;cursor:pointer;color:#0F0A1C;background:var(--gold);border:0}
.og-cash[disabled]{opacity:.35;cursor:default}
.og-said{min-height:1.4em;font-size:13px;font-weight:800;color:var(--dim);text-align:center}
.og-score{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;flex:0 0 auto}
.og-chip{display:flex;align-items:center;gap:6px;padding:4px 9px;border-radius:99px;
  background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.10);font-size:12px;font-weight:800}
.og-chip i{width:9px;height:9px;border-radius:50%;display:block}
.og-chip.turn{border-color:var(--gold);background:rgba(255,197,66,.14)}
.og-chip .pts{color:var(--dim);font-variant-numeric:tabular-nums}
`).replace(/^\.og/gm, '#scr-party .og');
  document.head.appendChild(st);
}

function prefs(){
  const p = P.pref('oghla') || {};
  return { level: p.level || 'medium' };
}

function setupSheet(){
  injectCSS();
  const p = prefs();
  P.ui.setup({
    id:'oghla',
    title:T('Ogħla jew Inqas','Ogħla jew Inqas'),
    sub:T('Higher or lower','Ogħla jew inqas'),
    blurb:T('Call the next card. Every right call is worth more than the last — but one wrong call takes the lot, so bank it while you can.',
            'Aqta\' l-karta li jmiss. Kull tbassira tajba tiswa aktar mill-oħra — imma waħda ħażina tieħu kollox, mela ġemma\' qabel.'),
    levels: E.BANDS.map(b => ({ k:b.k, name:b.name,
      note: b.k === 'easy' ? T('Takes the wrong side often','Ħafna drabi jieħu n-naħa ħażina')
          : b.k === 'hard' ? T('Almost always right on the odds','Kważi dejjem sewwa')
          : T('Usually right','Ġeneralment sewwa'), icon:'cards' })),
    onBack: () => P.hub(),
    onStart: (o) => {
      const level = (o && o.level) || p.level;
      P.pref('oghla', { level });
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
      cpu: s.kind === 'cpu', pts:0, done:false
    }));
  } else {
    seats.push({ name:T('You','Int'), cpu:false, pts:0, done:false });
    seats.push({ name:T('Machine','Magna'), cpu:true, pts:0, done:false });
  }
  M = { seats, level, turn:0, ctx:null, deck:null, card:null, run:0,
        busy:false, cpuT:null, mid:'oghla-' + Date.now() };
  openBoard();
  beginRun();
}

function openBoard(){
  M.ctx = P.ui.frame({
    title:T('Ogħla jew Inqas','Ogħla jew Inqas'),
    onBack: () => { leave(); P.hub(); },
    leave, buttons: []
  });
  const b = M.ctx.board;
  b.style.cssText = 'display:block;grid-template-columns:none;grid-template-rows:none;' +
    'width:100%;max-width:520px;border:0;box-shadow:none;overflow:visible;background:transparent';
  b.innerHTML =
    '<div class="og-wrap">' +
      '<div class="og-card" id="og-card"></div>' +
      '<div class="og-odds" id="og-odds"></div>' +
      '<div class="og-calls">' +
        '<button class="og-call up" id="og-up">' + T('HIGHER','OGĦLA') + '</button>' +
        '<button class="og-call down" id="og-down">' + T('LOWER','INQAS') + '</button>' +
      '</div>' +
      '<div class="og-bank">' +
        '<span class="og-run" id="og-run"></span>' +
        '<button class="og-cash" id="og-cash">' + T('Bank it','Ġemmagħha') + '</button>' +
      '</div>' +
      '<div class="og-said" id="og-said"></div>' +
      '<div class="og-score" id="og-score"></div>' +
    '</div>';
  b.querySelector('#og-up').onclick   = () => call('up');
  b.querySelector('#og-down').onclick = () => call('down');
  b.querySelector('#og-cash').onclick = () => cashOut();
}

function drawCard(flip){
  const c = M.card;
  const el = M.ctx.root.querySelector('#og-card');
  const red = c.s === 1 || c.s === 2;
  el.className = 'og-card' + (red ? ' red' : '') + (flip ? ' flip' : '');
  el.innerHTML = '<span class="c">' + PIP[E.suit(c)] + '</span>' +
    '<div><div class="r">' + E.label(c) + '</div>' +
    '<div class="p">' + PIP[E.suit(c)] + '</div></div>';
  if (flip) setTimeout(() => el.classList.remove('flip'), 300);
}

function paint(){
  const seat = M.seats[M.turn];
  const root = M.ctx.root;
  const p = Math.round(E.pHigher(M.card.v) * 100);
  root.querySelector('#og-odds').textContent =
    T('higher ','ogħla ') + p + '%  ·  ' + T('lower ','inqas ') + (100 - p) + '%';
  root.querySelector('#og-run').textContent =
    T('Run ','Serje ') + M.run + '  →  ' + E.runScore(M.run + 1) + T(' pts',' punti');
  root.querySelector('#og-cash').disabled = seat.cpu || M.run < 1 || M.busy;
  root.querySelector('#og-up').disabled   = seat.cpu || M.busy;
  root.querySelector('#og-down').disabled = seat.cpu || M.busy;
  root.querySelector('#og-score').innerHTML = M.seats.map((s, i) =>
    '<span class="og-chip' + (i === M.turn ? ' turn' : '') + '">' +
      '<i style="background:' + SEATCOL[i % SEATCOL.length] + '"></i>' + esc(s.name) +
      ' <span class="pts">' + s.pts + '</span></span>').join('');
}

function beginRun(){
  if (!M) return;
  if (M.seats.every(s => s.done)) return finish();
  let guard = 0;
  while (M.seats[M.turn].done && guard++ < M.seats.length)
    M.turn = (M.turn + 1) % M.seats.length;

  const seat = M.seats[M.turn];
  M.deck = E.deck();
  M.card = M.deck.pop();
  M.run = 0;
  M.busy = false;
  P.ui.setTurn(M.ctx, esc(seat.name));
  drawCard(true);
  M.ctx.root.querySelector('#og-said').textContent = seat.cpu
    ? T('The machine calls it.','Il-magna taqta\'.')
    : T('Higher or lower?','Ogħla jew inqas?');
  paint();
  if (seat.cpu) cpuTurn();
}

function cpuTurn(){
  M.cpuT = setTimeout(() => {
    M.cpuT = null;
    if (!M) return;
    /* IT BANKS LIKE A PLAYER. A machine that never cashes out is not
       playing this game, it is demonstrating that the deck ends. It
       takes the money once the run is worth more than the next card
       is likely to add. */
    if (M.run >= 3 && Math.random() < 0.45) return cashOut();
    call(E.cpuCall(M.card, M.level));
  }, 620 + Math.random() * 520);
}

function call(side){
  if (!M || M.busy) return;
  M.busy = true;
  const prev = M.card;
  const next = M.deck.pop();
  const out = E.judge(prev, next, side);
  M.card = next;
  drawCard(true);

  const said = M.ctx.root.querySelector('#og-said');
  if (out === 'wrong'){
    said.textContent = T('Wrong. The run is gone.','Ħażin. Is-serje marret.');
    try { if (K.sfx) K.sfx('bad'); } catch(e){}
    M.seats[M.turn].done = true;
    paint();
    setTimeout(() => { if (M){ M.turn = (M.turn + 1) % M.seats.length; beginRun(); } }, 1500);
    return;
  }
  M.run++;
  said.textContent = out === 'tie'
    ? T('A tie — that counts.','Indaqs — tgħodd.')
    : T('Right.','Sewwa.');
  try { if (K.sfx) K.sfx('good'); } catch(e){}
  M.busy = false;
  paint();

  if (M.run >= E.RUN_MAX){        /* nobody needs a run of twenty */
    said.textContent = T('That is the lot — banked.','Daqshekk — miġbura.');
    return cashOut();
  }
  if (M.seats[M.turn].cpu) cpuTurn();
}

function cashOut(){
  if (!M) return;
  const seat = M.seats[M.turn];
  const got = E.runScore(M.run + 1);
  seat.pts += got;
  seat.done = true;
  M.busy = true;
  M.ctx.root.querySelector('#og-said').textContent =
    esc(seat.name) + ' +' + got;
  paint();
  setTimeout(() => { if (M){ M.turn = (M.turn + 1) % M.seats.length; beginRun(); } }, 1400);
}

function finish(){
  const order = M.seats.map((s, i) => ({ s, i })).sort((a, b) => b.s.pts - a.s.pts);
  const top = order[0];
  const tie = order.length > 1 && order[1].s.pts === top.s.pts;
  const meIdx = M.seats.findIndex(s => !s.cpu);
  const iWon = !tie && meIdx >= 0 && top.i === meIdx;

  if (meIdx >= 0 && window.KARTI_XP && KARTI_XP.awardPlay){
    try { KARTI_XP.awardPlay({ game:'oghla', won:iWon, draw:tie, id:M.mid, ranked:false }); } catch(e){}
  }
  try { P.record('oghla', tie ? 'd' : iWon ? 'w' : 'l'); } catch(e){}

  P.ui.result(M.ctx, {
    tone: tie ? 'draw' : iWon ? 'win' : 'lose',
    head: tie ? T('Dead heat','Indaqs')
        : (top.i === meIdx ? T('You win','Rebaħt') : esc(top.s.name) + T(' takes it',' jirbaħ')),
    why: M.seats.map(s => esc(s.name) + ' ' + s.pts).join('  ·  '),
    quip: iWon ? T('You knew when to stop. Rare.','Kont taf meta tieqaf. Rari.')
        : tie ? T('Split it, then.','Aqsmuha, mela.')
        : T('One more card, you said.','Karta oħra, għedt.'),
    buttons:[
      { label:T('Play again',"Erġa' lgħab"), icon:'refresh', cls:'primary', go:() => { leave(); setupSheet(); } },
      { label:T('Leave','Oħroġ'), icon:'back', cls:'ghost', go:() => { leave(); P.hub(); } }
    ]
  });
}

function leave(){
  if (M && M.cpuT) clearTimeout(M.cpuT);
  M = null;
}

const LOBBY = {
  canStart(list){
    const n = (list || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why:T('Somebody has to play.','Xi ħadd irid jilgħab.') };
    if (n > E.MAX_SEATS) return { ok:false, why:T('Up to six can play.','Sa sitta jistgħu jilagħbu.') };
    return { ok:true, why:'' };
  },
  rulesHTML: () => '<p>' + [
    T('A card is turned. Call whether the next one is higher or lower.',
      'Tinqaleb karta. Aqta\' jekk li jmiss hijiex ogħla jew inqas.'),
    T('Equal counts as right — a tie should not end a good run.',
      'Indaqs tgħodd tajba — indaqs m\'għandhiex ittemm serje tajba.'),
    T('The run is the score and it grows: two cards is 1, three is 3, six is 15.',
      'Is-serje hi l-iskor u tikber: żewġ karti 1, tlieta 3, sitta 15.'),
    T('One wrong call takes all of it. Bank it while you are ahead — that button is the game.',
      'Waħda ħażina tieħu kollox. Ġemmagħha waqt li int quddiem — dak il-buttun hu l-logħba.')
  ].join('</p><p>') + '</p>',
  blurb: T('Call the next card. Bank it before you are wrong.','Aqta\' li jmiss. Ġemmagħha qabel tiżbalja.'),
  start(seats){ start(seats, prefs().level); return { v:1, gid:'oghla' }; },
  levels: E.BANDS.map(b => ({ k:b.k, name:b.name }))
};

const TILE = {
  id:'oghla', order:16, kind:'board', cat:'cards',
  name:'Ogħla jew Inqas', mt:'Ogħla jew Inqas', icon:'cards', status:'live',
  get tag(){ return T('Higher or lower on a turned card. Every right call is worth more than the last, and one wrong call takes the lot — so the real game is knowing when to bank it.',
    'Ogħla jew inqas fuq karta miftuħa. Kull waħda tajba tiswa aktar, u waħda ħażina tieħu kollox — mela l-logħba vera hi li tkun taf meta tieqaf.'); },
  open: () => setupSheet(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: LOBBY.levels,
  rulesHTML: () => LOBBY.rulesHTML(),
  start: (list) => LOBBY.start(list)
};

const R = (window.KARTI_OGHLA_UI = {});
R.shelfTile = TILE; R.lobby = LOBBY;
R.ui = { open:setupSheet, leave, injectCSS };
R.open = () => setupSheet();
R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

if (/[?&]oghlatest\b/.test(location.search || '')){
  window.__OGHLA_TEST = {
    setupSheet, start, call, cashOut, finish, leave,
    get M(){ return M; }, engine:E, TILE, LOBBY
  };
}

})();
