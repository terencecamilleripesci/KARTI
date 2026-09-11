/* ═══════════════════════════════════════════════════════════════════
   KARTI — tpingija-ui.js
   TPINĠIJA — draw it, they guess it. One phone, passed round.

   NO MACHINE OPPONENT, AND THAT IS NOT AN OVERSIGHT. Every other game
   on this shelf has one because one person alone should still have a
   game. A machine cannot draw, and a machine that "guesses" a drawing
   would have to cheat by reading the answer — which is a fake
   opponent wearing a real one's clothes. So this needs two people and
   says so on the tile rather than pretending.

   THE PASS SCREEN IS THE GAME'S HONESTY. On one phone the word has to
   be hidden from everybody but the drawer, so there is a deliberate
   "hand it over" step between every phase. It is a nuisance and it is
   the only thing making the game fair; skipping it would mean the
   guessers see the word.

   FOUR OPTIONS, NOT A KEYBOARD. Typing a guess on a passed phone is
   slow, and spelling arguments are not entertainment. Four words, one
   of them right, and the three wrong ones drawn from the same
   difficulty so the answer cannot be spotted by being the only
   drawable thing in the list.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const G = window.KARTI_PINGA;
if (!K || !P || !G) return;

const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
const esc = K.esc;
const lang = () => (window.KARTI_LANG && KARTI_LANG.cur && KARTI_LANG.cur() === 'mt') ? 'mt' : 'en';
const SEATCOL = ['#FFC542', '#4FB6FF', '#3DDC84', '#FF5468', '#C08BFF', '#FF9F45'];

const DRAW_MS = 45000;
const MIN_SEATS = 2, MAX_SEATS = 6;
const PT_GUESS = 2, PT_DRAW = 1;

let M = null;

let cssIn = false;
function injectCSS(){
  if (cssIn) return; cssIn = true;
  const st = document.createElement('style');
  st.id = 'tpingija-css';
  st.textContent = (`
.tp-wrap{display:flex;flex-direction:column;gap:8px;height:100%;padding:2px 0}
.tp-clock{height:7px;border-radius:99px;background:rgba(255,255,255,.10);overflow:hidden;flex:0 0 auto}
.tp-clock i{display:block;height:100%;width:100%;border-radius:99px;
  background:linear-gradient(90deg,#3DDC84,#FFC542 60%,#FF5468);
  transform-origin:left center;transition:transform .1s linear}
.tp-word{font-family:var(--disp);font-weight:900;font-size:22px;text-align:center;
  letter-spacing:.04em;color:var(--gold);min-height:1.2em}
.tp-hint{font-size:11px;color:var(--dim2);text-align:center;letter-spacing:.14em;
  text-transform:uppercase;font-weight:800;min-height:1.2em}
.tp-pad{position:relative;flex:1 1 auto;min-height:190px;border-radius:14px;
  background:#141024;border:1px solid rgba(255,255,255,.12);overflow:hidden}
.tp-pad canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.tp-tools{display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap;flex:0 0 auto}
.tp-ink{width:26px;height:26px;border-radius:50%;border:2px solid rgba(255,255,255,.2);
  cursor:pointer;padding:0}
.tp-ink.on{border-color:#fff;transform:scale(1.12)}
.tp-nib{width:30px;height:26px;border-radius:8px;border:1px solid rgba(255,255,255,.16);
  background:rgba(255,255,255,.06);cursor:pointer;display:grid;place-items:center;padding:0}
.tp-nib.on{border-color:var(--gold);background:rgba(255,197,66,.16)}
.tp-nib i{display:block;border-radius:50%;background:var(--ink)}
.tp-tool{min-height:30px;padding:4px 10px;border-radius:9px;font:inherit;font-size:12px;
  font-weight:800;cursor:pointer;color:var(--ink);background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.14)}
.tp-opts{display:flex;flex-direction:column;gap:7px;flex:0 0 auto}
.tp-opt{width:100%;min-height:48px;border-radius:13px;padding:8px 14px;text-align:left;
  font:inherit;font-size:15px;font-weight:800;color:var(--ink);cursor:pointer;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14)}
.tp-opt.right{background:rgba(61,220,132,.18);border-color:#3DDC84}
.tp-opt.wrong{background:rgba(255,84,104,.16);border-color:#FF5468}
.tp-pass{text-align:center;padding:22px 12px;display:grid;place-items:center;gap:10px;flex:1 1 auto}
.tp-pass h3{font-family:var(--disp);font-size:23px;margin:0}
.tp-pass p{color:var(--dim);font-size:13px;margin:0;max-width:30ch}
.tp-big{min-height:52px;padding:10px 26px;border-radius:14px;font:inherit;font-size:15px;
  font-weight:900;cursor:pointer;color:#0F0A1C;background:var(--gold);border:0}
.tp-score{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;flex:0 0 auto}
.tp-chip{display:flex;align-items:center;gap:6px;padding:4px 9px;border-radius:99px;
  background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.10);font-size:12px;font-weight:800}
.tp-chip i{width:9px;height:9px;border-radius:50%;display:block}
.tp-chip.turn{border-color:var(--gold);background:rgba(255,197,66,.14)}
.tp-chip .pts{color:var(--dim);font-variant-numeric:tabular-nums}
`).replace(/^\.tp/gm, '#scr-party .tp');
  document.head.appendChild(st);
}

function setupSheet(){
  injectCSS();
  P.ui.setup({
    id:'tpingija',
    title:T('Tpinġija','Tpinġija'),
    sub:T('Draw it, they guess it','Pinġiha, jaqtgħuha'),
    blurb:T('One person draws, the rest guess. Forty-five seconds and no letters, no numbers, no talking.',
            'Wieħed jipponġi, l-oħrajn jaqtgħu. Ħamsa u erbgħin sekonda, bla ittri, bla numri, bla kliem.'),
    levels: [],
    onBack: () => P.hub(),
    onStart: (o) => start((o && o.seats) || null)
  });
}

function start(seatList){
  injectCSS();
  const seats = [];
  (seatList && seatList.length ? seatList : [{}, {}]).forEach((s, i) => seats.push({
    name: (s && s.name) || T('Player','Plejer') + ' ' + (i + 1), pts:0
  }));
  M = { seats, round:0, drawer:0, ctx:null, pad:null, cv:null,
        word:null, opts:[], t0:0, timer:null, mid:'tpingija-' + Date.now() };
  openBoard();
  passTo(T('Hand the phone to ','Għaddi t-telefon lil ') + M.seats[0].name,
         T('Nobody else look.','Ħadd ma jħares.'),
         T('I have it',"Għandi jien"), showWord);
}

function openBoard(){
  M.ctx = P.ui.frame({
    title:T('Tpinġija','Tpinġija'),
    onBack: () => { leave(); P.hub(); },
    leave, buttons: []
  });
  const b = M.ctx.board;
  b.style.cssText = 'display:block;grid-template-columns:none;grid-template-rows:none;' +
    'width:100%;max-width:520px;border:0;box-shadow:none;overflow:visible;background:transparent';
}

function scoreRow(){
  return '<div class="tp-score">' + M.seats.map((s, i) =>
    '<span class="tp-chip' + (i === M.drawer ? ' turn' : '') + '">' +
      '<i style="background:' + SEATCOL[i % SEATCOL.length] + '"></i>' + esc(s.name) +
      ' <span class="pts">' + s.pts + '</span></span>').join('') + '</div>';
}

/* ── the hand-over, which is what keeps it honest ─────────────── */
function passTo(head, sub, btn, go){
  stopClock();
  M.ctx.board.innerHTML =
    '<div class="tp-wrap"><div class="tp-pass">' +
      '<h3>' + esc(head) + '</h3><p>' + esc(sub) + '</p>' +
      '<button class="tp-big" id="tp-go">' + esc(btn) + '</button>' +
    '</div>' + scoreRow() + '</div>';
  M.ctx.board.querySelector('#tp-go').onclick = go;
}

function showWord(){
  const pick = G.words(null, 4);
  M.word = pick[0];
  M.opts = pick.slice();
  for (let i = M.opts.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const t = M.opts[i]; M.opts[i] = M.opts[j]; M.opts[j] = t;
  }
  const L = lang();
  passTo(L === 'mt' ? M.word.mt : M.word.en,
         T('This is your word. Draw it — no letters, no numbers.',
           'Din hi l-kelma tiegħek. Pinġiha — bla ittri, bla numri.'),
         T('Start drawing','Ibda pinġi'), drawPhase);
}

function drawPhase(){
  const L = lang();
  M.ctx.board.innerHTML =
    '<div class="tp-wrap">' +
      '<div class="tp-clock"><i id="tp-bar"></i></div>' +
      '<div class="tp-word">' + esc(L === 'mt' ? M.word.mt : M.word.en) + '</div>' +
      '<div class="tp-pad"><canvas id="tp-cv"></canvas></div>' +
      '<div class="tp-tools" id="tp-tools"></div>' +
      scoreRow() +
    '</div>';
  const tools = M.ctx.board.querySelector('#tp-tools');
  tools.innerHTML =
    G.INKS.map((c, i) => '<button class="tp-ink' + (i === 0 ? ' on' : '') +
      '" data-ink="' + c + '" style="background:' + c + '"></button>').join('') +
    G.NIBS.map((w, i) => '<button class="tp-nib' + (i === 1 ? ' on' : '') +
      '" data-nib="' + w + '"><i style="width:' + w + 'px;height:' + w + 'px"></i></button>').join('') +
    '<button class="tp-tool" id="tp-undo">' + T('Undo','Lura') + '</button>' +
    '<button class="tp-tool" id="tp-done">' + T('Done','Lest') + '</button>';

  M.cv = M.ctx.board.querySelector('#tp-cv');
  M.pad = G.make(M.cv);
  tools.querySelectorAll('[data-ink]').forEach(b => b.onclick = () => {
    M.pad.ink(b.dataset.ink);
    tools.querySelectorAll('[data-ink]').forEach(x => x.classList.toggle('on', x === b));
  });
  tools.querySelectorAll('[data-nib]').forEach(b => b.onclick = () => {
    M.pad.nib(+b.dataset.nib);
    tools.querySelectorAll('[data-nib]').forEach(x => x.classList.toggle('on', x === b));
  });
  tools.querySelector('#tp-undo').onclick = () => M.pad.undo();
  tools.querySelector('#tp-done').onclick = () => endDraw();

  M.t0 = Date.now();
  runClock();
  P.ui.setTurn(M.ctx, esc(M.seats[M.drawer].name) + T(' is drawing',' qed jipponġi'));
}

function runClock(){
  stopClock();
  const bar = M.ctx.board.querySelector('#tp-bar');
  const tick = () => {
    if (!M || !M.t0) return;
    const left = Math.max(0, DRAW_MS - (Date.now() - M.t0));
    if (bar) bar.style.transform = 'scaleX(' + (left / DRAW_MS) + ')';
    if (left <= 0) return endDraw();
    M.timer = requestAnimationFrame(tick);
  };
  M.timer = requestAnimationFrame(tick);
}
function stopClock(){ if (M && M.timer){ cancelAnimationFrame(M.timer); M.timer = null; } }

function endDraw(){
  stopClock();
  M.t0 = 0;
  if (M.pad) M.pad.enable(false);
  const strokes = M.pad ? M.pad.strokes.slice() : [];
  const next = (M.drawer + 1) % M.seats.length;
  M.guesser = next;
  passTo(T('Hand it to ','Għaddih lil ') + M.seats[next].name,
         T('Look at the drawing and pick the word.','Ħares lejn it-tpinġija u agħżel il-kelma.'),
         T('Ready','Lest'), () => guessPhase(strokes));
}

function guessPhase(strokes){
  const L = lang();
  M.ctx.board.innerHTML =
    '<div class="tp-wrap">' +
      '<div class="tp-hint">' + esc(M.seats[M.guesser].name) + T(' — what is it?',' — x\'inhi?') + '</div>' +
      '<div class="tp-pad"><canvas id="tp-cv2"></canvas></div>' +
      '<div class="tp-opts" id="tp-opts"></div>' +
      scoreRow() +
    '</div>';
  const cv = M.ctx.board.querySelector('#tp-cv2');
  const view = G.make(cv);
  view.enable(false);
  view.strokes = strokes;
  M.view = view;

  const opts = M.ctx.board.querySelector('#tp-opts');
  opts.innerHTML = M.opts.map((w, i) =>
    '<button class="tp-opt" data-i="' + i + '">' + esc(L === 'mt' ? w.mt : w.en) + '</button>').join('');
  opts.querySelectorAll('.tp-opt').forEach(b => b.onclick = () => judge(+b.dataset.i));
}

function judge(pick){
  const right = M.opts[pick] === M.word;
  const opts = M.ctx.board.querySelectorAll('.tp-opt');
  opts.forEach((b, i) => {
    b.disabled = true;
    if (M.opts[i] === M.word) b.classList.add('right');
    else if (i === pick) b.classList.add('wrong');
  });
  if (right){
    M.seats[M.guesser].pts += PT_GUESS;
    M.seats[M.drawer].pts  += PT_DRAW;
  }
  try { if (K.sfx) K.sfx(right ? 'good' : 'bad'); } catch(e){}
  const row = M.ctx.board.querySelector('.tp-score');
  if (row) row.outerHTML = scoreRow();

  setTimeout(() => {
    if (!M) return;
    M.round++;
    if (M.round >= M.seats.length) return finish();
    M.drawer = (M.drawer + 1) % M.seats.length;
    passTo(T('Hand the phone to ','Għaddi t-telefon lil ') + M.seats[M.drawer].name,
           T('Nobody else look.','Ħadd ma jħares.'),
           T('I have it',"Għandi jien"), showWord);
  }, 1800);
}

function finish(){
  const order = M.seats.map((s, i) => ({ s, i })).sort((a, b) => b.s.pts - a.s.pts);
  const top = order[0];
  const tie = order.length > 1 && order[1].s.pts === top.s.pts;
  if (window.KARTI_XP && KARTI_XP.awardPlay){
    try { KARTI_XP.awardPlay({ game:'tpingija', won:true, draw:tie, id:M.mid, ranked:false }); } catch(e){}
  }
  try { P.record('tpingija', tie ? 'd' : 'w'); } catch(e){}
  P.ui.result(M.ctx, {
    tone: tie ? 'draw' : 'win',
    head: tie ? T('Dead heat','Indaqs') : esc(top.s.name) + T(' takes it',' jirbaħ'),
    why: M.seats.map(s => esc(s.name) + ' ' + s.pts).join('  ·  '),
    quip: T('Somebody should have drawn the ears.','Xi ħadd kellu jipponġi l-widnejn.'),
    buttons:[
      { label:T('Play again',"Erġa' lgħab"), icon:'refresh', cls:'primary', go:() => { leave(); setupSheet(); } },
      { label:T('Leave','Oħroġ'), icon:'back', cls:'ghost', go:() => { leave(); P.hub(); } }
    ]
  });
}

function leave(){
  stopClock();
  if (M){
    if (M.pad) try { M.pad.stop(); } catch(e){}
    if (M.view) try { M.view.stop(); } catch(e){}
  }
  M = null;
}

const LOBBY = {
  canStart(list){
    const n = (list || []).length;
    if (n < MIN_SEATS) return { ok:false, why:T('Tpinġija needs two people — a machine cannot draw.','Tpinġija trid tnejn — magna ma tafx tipponġi.') };
    if (n > MAX_SEATS) return { ok:false, why:T('Up to six can play.','Sa sitta jistgħu jilagħbu.') };
    return { ok:true, why:'' };
  },
  rulesHTML: () => '<p>' + [
    T('One person gets a word and forty-five seconds to draw it. No letters, no numbers, no talking.',
      'Wieħed jieħu kelma u ħamsa u erbgħin sekonda biex jipponġiha. Bla ittri, bla numri, bla kliem.'),
    T('Then the phone is passed and the next player picks from four words.',
      'Imbagħad jgħaddi t-telefon u li jmiss jagħżel minn erba\' kliem.'),
    T('A right guess is worth 2 to the guesser and 1 to whoever drew it — so drawing badly costs you too.',
      'Tbassira tajba tiswa 2 lil min qatagħha u 1 lil min pinġa — mela tipponġi ħażin jiswielek ukoll.'),
    T('Everybody draws once.','Kulħadd jipponġi darba.')
  ].join('</p><p>') + '</p>',
  blurb: T('Draw it, they guess it.','Pinġiha, jaqtgħuha.'),
  start(seats){ start(seats); return { v:1, gid:'tpingija' }; },
  levels: []
};

const TILE = {
  id:'tpingija', order:17, kind:'board', cat:'party',
  name:'Tpinġija', mt:'Tpinġija', icon:'pencil', status:'live',
  get tag(){ return T('One draws, the rest guess. Forty-five seconds, no letters and no talking. Two people minimum — a machine cannot draw and will not pretend to.',
    'Wieħed jipponġi, l-oħrajn jaqtgħu. Ħamsa u erbgħin sekonda, bla ittri u bla kliem. Minimu tnejn — magna ma tafx tipponġi.'); },
  open: () => setupSheet(),
  seats: { min:MIN_SEATS, max:MAX_SEATS },
  levels: [],
  rulesHTML: () => LOBBY.rulesHTML(),
  start: (list) => LOBBY.start(list)
};

const R = (window.KARTI_TPINGIJA_UI = {});
R.shelfTile = TILE; R.lobby = LOBBY;
R.ui = { open:setupSheet, leave, injectCSS };
R.open = () => setupSheet();
R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

if (/[?&]pingatest\b/.test(location.search || '')){
  window.__TPINGIJA_TEST = {
    setupSheet, start, showWord, drawPhase, endDraw, guessPhase, judge, finish, leave,
    get M(){ return M; }, pinga:G, TILE, LOBBY
  };
}

})();
