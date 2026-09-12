/* ═══════════════════════════════════════════════════════════════════
   KARTI — katina-ui.js
   KATINA — the screen. The letter you need, an input, and a clock.

   THE REQUIRED LETTER IS THE BIGGEST THING ON SCREEN. Everything else
   is chrome: under twenty seconds nobody should have to work out what
   they need by reading the last word and finding its final letter.
   The game shows it.

   THE CHAIN IS KEPT VISIBLE because half the skill is remembering
   what has gone — a repeat costs a life, and a player who cannot see
   the list is being punished for the interface rather than the game.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const E = window.KARTI_KATINA;
if (!K || !P || !E) return;

const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
const esc = K.esc;
const SEATCOL = ['#FFC542', '#4FB6FF', '#3DDC84', '#FF5468', '#C08BFF', '#FF9F45'];

let M = null, D = null;

let cssIn = false;
function injectCSS(){
  if (cssIn) return; cssIn = true;
  const st = document.createElement('style');
  st.id = 'katina-css';
  st.textContent = (`
.kt-wrap{display:flex;flex-direction:column;gap:9px;height:100%;padding:2px 0}
.kt-clock{height:7px;border-radius:99px;background:rgba(255,255,255,.10);overflow:hidden;flex:0 0 auto}
.kt-clock i{display:block;height:100%;width:100%;border-radius:99px;
  background:linear-gradient(90deg,#3DDC84,#FFC542 60%,#FF5468);
  transform-origin:left center;transition:transform .1s linear}
.kt-need{text-align:center;flex:0 0 auto}
.kt-need .lab{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim2);font-weight:800}
.kt-need .L{font-family:var(--disp);font-weight:900;font-size:62px;line-height:1;color:var(--gold);
  text-transform:uppercase}
.kt-prev{font-size:12px;color:var(--dim);text-align:center;min-height:1.3em}
.kt-in{width:100%;min-height:52px;border-radius:13px;padding:10px 14px;font:inherit;font-size:18px;
  font-weight:800;color:var(--ink);background:rgba(255,255,255,.07);
  border:1px solid rgba(255,255,255,.16);text-align:center;text-transform:lowercase}
.kt-in:focus{outline:none;border-color:var(--gold)}
.kt-send{width:100%;min-height:48px;border-radius:13px;font:inherit;font-size:15px;font-weight:900;
  cursor:pointer;color:#0F0A1C;background:var(--gold);border:0}
.kt-said{text-align:center;font-size:13px;font-weight:800;min-height:1.4em;color:var(--dim)}
.kt-said.bad{color:#FF8DA0}
.kt-said.good{color:#7FE8A8}
.kt-chain{display:flex;gap:5px;flex-wrap:wrap;justify-content:center;flex:1 1 auto;
  align-content:flex-start;overflow-y:auto;min-height:34px}
.kt-link{padding:3px 9px;border-radius:99px;font-size:12px;font-weight:800;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:var(--dim)}
.kt-link.last{color:#0F0A1C;background:var(--gold);border-color:var(--gold)}
.kt-score{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;flex:0 0 auto}
.kt-chip{display:flex;align-items:center;gap:6px;padding:4px 9px;border-radius:99px;
  background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.10);font-size:12px;font-weight:800}
.kt-chip i{width:9px;height:9px;border-radius:50%;display:block}
.kt-chip.turn{border-color:var(--gold);background:rgba(255,197,66,.14)}
.kt-chip.out{opacity:.35}
.kt-chip .hp{letter-spacing:1px}
.kt-load{text-align:center;color:var(--dim);font-size:13px;padding:30px 10px}
`).replace(/^\.kt/gm, '#scr-party .kt');
  document.head.appendChild(st);
}

function prefs(){
  const p = P.pref('katina') || {};
  return { level: p.level || 'medium' };
}

function setupSheet(){
  injectCSS();
  E.dict();                                   /* start the download now */
  const p = prefs();
  P.ui.setup({
    id:'katina',
    title:T('Katina','Katina'),
    sub:T('The word chain','Il-katina tal-kliem'),
    blurb:T('Every word starts with the last letter of the one before. Twenty seconds a turn, three lives, no repeats.',
            'Kull kelma tibda bl-aħħar ittra ta\' ta\' qabel. Għoxrin sekonda kull dawra, tliet ħajjiet, bla ripetizzjoni.'),
    levels: E.BANDS.map(b => ({ k:b.k, name:b.name,
      note: b.k === 'easy' ? T('Draws a blank often','Ħafna drabi jibqa\' mingħajr')
          : b.k === 'hard' ? T('Will hand you an X','Jagħtik X')
          : T('Usually finds one','Ġeneralment isib'), icon:'book' })),
    onBack: () => P.hub(),
    onStart: (o) => {
      const level = (o && o.level) || p.level;
      P.pref('katina', { level });
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
      cpu: s.kind === 'cpu', lives: E.LIVES, words: 0
    }));
  } else {
    seats.push({ name:T('You','Int'), cpu:false, lives:E.LIVES, words:0 });
    seats.push({ name:T('Machine','Magna'), cpu:true, lives:E.LIVES, words:0 });
  }
  M = { seats, level, turn:0, chain:[], used:new Set(),
        ctx:null, t0:0, timer:null, cpuT:null, mid:'katina-' + Date.now() };
  openBoard();
  M.ctx.board.innerHTML = '<div class="kt-load">' +
    T('Fetching the dictionary…','Qed inġib id-dizzjunarju…') + '</div>';
  E.dict().then(d => {
    if (!M) return;
    D = d;
    if (!d || d.size < 100){
      M.ctx.board.innerHTML = '<div class="kt-load">' +
        T('The dictionary would not load, so there is nothing to check words against.',
          'Id-dizzjunarju ma nfetaħx, mela m\'hemm xejn biex jiġi ċċekkjat.') + '</div>';
      return;
    }
    const first = E.opener(D);
    M.chain.push(first); M.used.add(first);
    nextTurn();
  });
}

function openBoard(){
  M.ctx = P.ui.frame({
    title:T('Katina','Katina'),
    onBack: () => { leave(); P.hub(); },
    leave, buttons: []
  });
  const b = M.ctx.board;
  b.style.cssText = 'display:block;grid-template-columns:none;grid-template-rows:none;' +
    'width:100%;max-width:520px;border:0;box-shadow:none;overflow:visible;background:transparent';
}

function alive(){ return M.seats.filter(s => s.lives > 0).length; }

function chainHTML(){
  const tailN = M.chain.slice(-14);
  return tailN.map((w, i) =>
    '<span class="kt-link' + (i === tailN.length - 1 ? ' last' : '') + '">' + esc(w) + '</span>').join('');
}
function scoreHTML(){
  return M.seats.map((s, i) =>
    '<span class="kt-chip' + (i === M.turn ? ' turn' : '') + (s.lives <= 0 ? ' out' : '') + '">' +
      '<i style="background:' + SEATCOL[i % SEATCOL.length] + '"></i>' + esc(s.name) +
      ' <span class="hp">' + (s.lives > 0 ? '♥'.repeat(s.lives) : '—') + '</span></span>').join('');
}

function nextTurn(){
  if (!M) return;
  if (alive() <= 1 && M.seats.length > 1) return finish();
  let guard = 0;
  while (M.seats[M.turn].lives <= 0 && guard++ < M.seats.length)
    M.turn = (M.turn + 1) % M.seats.length;

  const seat = M.seats[M.turn];
  const prev = M.chain[M.chain.length - 1];
  M.ctx.board.innerHTML =
    '<div class="kt-wrap">' +
      '<div class="kt-clock"><i id="kt-bar"></i></div>' +
      '<div class="kt-need"><div class="lab">' + esc(seat.name) +
        T(' needs a word starting with',' irid kelma li tibda b\'') + '</div>' +
        '<div class="L">' + esc(E.tail(prev)) + '</div></div>' +
      '<div class="kt-prev">' + T('after ','wara ') + '<b>' + esc(prev) + '</b></div>' +
      (seat.cpu ? '' :
        '<input class="kt-in" id="kt-in" autocomplete="off" autocapitalize="none" ' +
          'autocorrect="off" spellcheck="false" inputmode="text">' +
        '<button class="kt-send" id="kt-send">' + T('Say it','Għidha') + '</button>') +
      '<div class="kt-said" id="kt-said"></div>' +
      '<div class="kt-chain">' + chainHTML() + '</div>' +
      '<div class="kt-score">' + scoreHTML() + '</div>' +
    '</div>';

  M.t0 = Date.now();
  runClock();
  P.ui.setTurn(M.ctx, esc(seat.name));

  if (seat.cpu){
    M.cpuT = setTimeout(() => {
      M.cpuT = null;
      if (!M) return;
      const w = E.cpuWord(prev, M.used, D, M.level);
      if (!w) return miss(T('The machine has nothing.','Il-magna m\'għandhiex.'));
      accept(w);
    }, Math.min(E.thinkMs(M.level), E.TURN_MS - 500));
    return;
  }
  const inp = M.ctx.board.querySelector('#kt-in');
  const send = () => submit(inp.value);
  M.ctx.board.querySelector('#kt-send').onclick = send;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
  setTimeout(() => { try { inp.focus(); } catch(e){} }, 40);
}

function runClock(){
  stopClock();
  const bar = M.ctx.board.querySelector('#kt-bar');
  const tick = () => {
    if (!M || !M.t0) return;
    const left = Math.max(0, E.TURN_MS - (Date.now() - M.t0));
    if (bar) bar.style.transform = 'scaleX(' + (left / E.TURN_MS) + ')';
    if (left <= 0) return miss(T('Out of time.','Spiċċa l-ħin.'));
    M.timer = requestAnimationFrame(tick);
  };
  M.timer = requestAnimationFrame(tick);
}
function stopClock(){ if (M && M.timer){ cancelAnimationFrame(M.timer); M.timer = null; } }

const WHY = {
  empty:   () => T('Say something.','Għid xi ħaġa.'),
  letters: () => T('Letters only.','Ittri biss.'),
  short:   () => T('Three letters at least.','Tal-anqas tliet ittri.'),
  letter:  () => T('Wrong starting letter.','L-ittra tal-bidu mhix tajba.'),
  used:    () => T('Already used.','Diġà ntużat.'),
  unknown: () => T('Not in the dictionary.','Mhix fid-dizzjunarju.')
};

function submit(raw){
  if (!M || !M.t0) return;
  const prev = M.chain[M.chain.length - 1];
  const why = E.reject(raw, prev, M.used, D);
  if (why){
    /* A BAD GUESS DOES NOT COST A LIFE. The clock is the punishment —
       otherwise a typo ends your game and nobody types again. */
    const el = M.ctx.board.querySelector('#kt-said');
    el.className = 'kt-said bad';
    el.textContent = WHY[why] ? WHY[why]() : T('No.','Le.');
    try { if (K.sfx) K.sfx('bad'); } catch(e){}
    return;
  }
  accept(String(raw).trim().toLowerCase());
}

function accept(word){
  stopClock();
  M.t0 = 0;
  M.chain.push(word);
  M.used.add(word);
  M.seats[M.turn].words++;
  try { if (K.sfx) K.sfx('good'); } catch(e){}
  M.turn = (M.turn + 1) % M.seats.length;
  setTimeout(() => { if (M) nextTurn(); }, 420);
}

function miss(msg){
  stopClock();
  M.t0 = 0;
  const seat = M.seats[M.turn];
  seat.lives--;
  const el = M.ctx.board.querySelector('#kt-said');
  if (el){ el.className = 'kt-said bad'; el.textContent = msg + ' −1 ♥'; }
  const sc = M.ctx.board.querySelector('.kt-score');
  if (sc) sc.innerHTML = scoreHTML();
  try { if (K.sfx) K.sfx('bad'); } catch(e){}
  setTimeout(() => {
    if (!M) return;
    M.turn = (M.turn + 1) % M.seats.length;
    nextTurn();
  }, 1300);
}

function finish(){
  stopClock();
  const live = M.seats.filter(s => s.lives > 0);
  const meIdx = M.seats.findIndex(s => !s.cpu);
  const won = live.length === 1 && live[0] === M.seats[meIdx];
  const winner = live[0] || M.seats.slice().sort((a, b) => b.words - a.words)[0];
  if (meIdx >= 0 && window.KARTI_XP && KARTI_XP.awardPlay){
    try { KARTI_XP.awardPlay({ game:'katina', won:!!won, draw:false, id:M.mid, ranked:false }); } catch(e){}
  }
  try { P.record('katina', won ? 'w' : 'l'); } catch(e){}
  P.ui.result(M.ctx, {
    tone: won ? 'win' : 'lose',
    head: won ? T('You win','Rebaħt') : esc(winner.name) + T(' is last standing',' baqa\' wieqaf'),
    why: T('Chain of ','Katina ta\' ') + M.chain.length + '  ·  ' +
         M.seats.map(s => esc(s.name) + ' ' + s.words).join('  ·  '),
    quip: T('It always ends on a Y.','Dejjem tispiċċa fuq Y.'),
    buttons:[
      { label:T('Play again',"Erġa' lgħab"), icon:'refresh', cls:'primary', go:() => { leave(); setupSheet(); } },
      { label:T('Leave','Oħroġ'), icon:'back', cls:'ghost', go:() => { leave(); P.hub(); } }
    ]
  });
}

function leave(){
  stopClock();
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
    T('A word is put down. The next word must START with the letter the last one ENDED with.',
      'Titqiegħed kelma. Li jmiss trid TIBDA bl-ittra li biha SPIĊĊAT ta\' qabel.'),
    T('Three letters minimum, in the dictionary, and never a word already used.',
      'Minimu tliet ittri, fid-dizzjunarju, u qatt kelma li diġà ntużat.'),
    T('Twenty seconds a turn. Run out of time and you lose a life — a wrong guess costs nothing but the clock.',
      'Għoxrin sekonda kull dawra. Jispiċċalek il-ħin u titlef ħajja — tbassira ħażina ma tiswa xejn ħlief ħin.'),
    T('Three lives each. Last one standing wins.','Tliet ħajjiet. L-aħħar wieħed wieqaf jirbaħ.')
  ].join('</p><p>') + '</p>',
  blurb: T('Each word starts where the last one ended.','Kull kelma tibda fejn spiċċat l-oħra.'),
  start(seats){ start(seats, prefs().level); return { v:1, gid:'katina' }; },
  levels: E.BANDS.map(b => ({ k:b.k, name:b.name }))
};

const TILE = {
  id:'katina', order:20, kind:'board', cat:'word',
  name:'Katina', mt:'Katina', icon:'book', status:'live',
  get tag(){ return T('Each word must start with the letter the last one ended with. Twenty seconds, three lives, no repeats — and the machine will hand you a word ending in X if you let it.',
    'Kull kelma trid tibda bl-ittra li biha spiċċat ta\' qabel. Għoxrin sekonda, tliet ħajjiet, bla ripetizzjoni — u l-magna tagħtik kelma li tispiċċa b\'X jekk tħalliha.'); },
  open: () => setupSheet(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: LOBBY.levels,
  rulesHTML: () => LOBBY.rulesHTML(),
  start: (list) => LOBBY.start(list)
};

const R = (window.KARTI_KATINA_UI = {});
R.shelfTile = TILE; R.lobby = LOBBY;
R.ui = { open:setupSheet, leave, injectCSS };
R.open = () => setupSheet();
R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

if (/[?&]katinatest\b/.test(location.search || '')){
  window.__KATINA_TEST = {
    setupSheet, start, submit, accept, miss, finish, leave,
    get M(){ return M; }, get D(){ return D; }, engine:E, TILE, LOBBY
  };
}

})();
