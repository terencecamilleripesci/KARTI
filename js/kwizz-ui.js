/* ═══════════════════════════════════════════════════════════════════
   KARTI — kwizz-ui.js
   IL-KWIŻŻ — the screen. Setup sheet, board, result. The rules live in
   js/kwizz.js and nothing here reaches past them.

   ONE PHONE, PASSED ROUND. Everybody sees the question at once and the
   holder taps for themselves; the machine answers on its own clock.
   That is the honest shape for a quiz on one device — a buzzer race on
   a single screen is a race to the phone, not to the answer.

   WHAT THE SCREEN OWES THE PLAYER, in order:
     · the question, big enough to read across a table
     · the clock, as a bar rather than a number — you feel a bar
     · four answers, each a full-width target, because a thumb on a
       moving clock does not hit a small one
     · after the buzzer, who got it and what it was worth, before the
       next question arrives

   NOTHING IS EVER OUT. Wrong costs you the points, never the round. A
   player who cannot win by question three puts the phone down, and the
   table loses a player rather than a game.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const E = window.KARTI_KWIZZ;
if (!K || !P || !E) return;

const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
const esc = K.esc;
const lang = () => (window.KARTI_LANG && KARTI_LANG.cur && KARTI_LANG.cur() === 'mt') ? 'mt' : 'en';

const SEATCOL = ['#FFC542', '#4FB6FF', '#3DDC84', '#FF5468', '#C08BFF', '#FF9F45'];

let M = null;                    /* the live match, or null            */

/* ── styling ───────────────────────────────────────────────────────
   Injected once, the way every game on this shelf does it — index.html
   and css/ belong to other parts of the build. */
let cssIn = false;
function injectCSS(){
  if (cssIn) return; cssIn = true;
  /* OUR OWN <style>, scoped to #scr-party. P.ui.css takes NO arguments — it
     injects the shelf's own runtime stylesheet once — so calling it with a
     name and a body silently dropped every rule here on the floor and the
     board rendered as one word per line. Every other game on the shelf
     appends its own tag; so do we. */
  const st = document.createElement('style');
  st.id = 'kwizz-css';
  st.textContent = (`
.kz-wrap{display:flex;flex-direction:column;gap:10px;height:100%;padding:2px 0}
.kz-clock{height:8px;border-radius:99px;background:rgba(255,255,255,.10);overflow:hidden;flex:0 0 auto}
.kz-clock i{display:block;height:100%;width:100%;border-radius:99px;
  background:linear-gradient(90deg,#3DDC84,#FFC542 62%,#FF5468);
  transform-origin:left center;transition:transform .1s linear}
.kz-cat{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim2);
  font-weight:800;text-align:center}
.kz-q{font-family:var(--disp);font-weight:900;font-size:19px;line-height:1.3;text-align:center;
  padding:6px 8px;min-height:2.6em;display:grid;place-items:center}
.kz-opts{display:flex;flex-direction:column;gap:8px;flex:1 1 auto}
.kz-opt{width:100%;min-height:52px;border-radius:14px;padding:10px 14px;text-align:left;
  font:inherit;font-size:15px;font-weight:700;color:var(--ink);cursor:pointer;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);
  display:flex;align-items:center;gap:10px;transition:background .12s,border-color .12s,transform .12s}
.kz-opt:active{transform:scale(.985)}
.kz-opt .k{width:24px;height:24px;flex:0 0 auto;border-radius:7px;display:grid;place-items:center;
  font-size:12px;font-weight:900;background:rgba(0,0,0,.35);color:var(--dim)}
.kz-opt.right{background:rgba(61,220,132,.18);border-color:#3DDC84}
.kz-opt.wrong{background:rgba(255,84,104,.16);border-color:#FF5468}
.kz-opt[disabled]{cursor:default;opacity:.9}
.kz-who{font-size:12px;color:var(--dim);text-align:center;min-height:1.3em;font-weight:700}
.kz-score{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;flex:0 0 auto}
.kz-chip{display:flex;align-items:center;gap:6px;padding:4px 9px;border-radius:99px;
  background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.10);font-size:12px;font-weight:800}
.kz-chip i{width:9px;height:9px;border-radius:50%;display:block}
.kz-chip.turn{border-color:var(--gold);background:rgba(255,197,66,.14)}
.kz-chip .pts{color:var(--dim);font-variant-numeric:tabular-nums}
.kz-streak{color:#FFC542;font-weight:900}
.kz-pass{text-align:center;padding:18px 10px}
.kz-pass h3{font-family:var(--disp);font-size:20px;margin:0 0 6px}
.kz-pass p{color:var(--dim);font-size:13px;margin:0 0 14px}
`).replace(/^\.kz/gm, '#scr-party .kz');
  document.head.appendChild(st);
}

/* ── setup ─────────────────────────────────────────────────────────
   Category and length are the two choices that change the game, so
   they are the two on the sheet. Everything else has a sane default. */
function prefs(){
  const p = P.pref('kwizz') || {};
  return { cat: p.cat || 'all', n: p.n || 8, level: p.level || 'medium' };
}

function setupSheet(){
  injectCSS();
  const p = prefs();
  P.ui.setup({
    id:'kwizz',
    title:T('Il-Kwiżż','Il-Kwiżż'),
    sub:T('Trivia, on the buzzer','Mistoqsijiet, fuq il-ħin'),
    blurb:T('Answer fastest, score most. Three right in a row and the next one counts double.',
            'Wieġeb l-ewwel, iġbor l-aktar. Tliet risposti tajba wara xulxin u li jmiss tgħodd doppju.'),
    levels: E.BANDS.map(b => ({ k:b.k, name:b.name,
      note: b.k === 'easy' ? T('Misses a lot','Jiżbalja ħafna')
          : b.k === 'hard' ? T('Fast, and usually right','Mgħaġġel, u ġeneralment tajjeb')
          : T('Knows a fair bit','Jaf biżżejjed'), icon:'book' })),
    onBack: () => P.hub(),
    onStart: (o) => {
      const level = (o && o.level) || p.level;
      const seats = (o && o.seats) || [];
      P.pref('kwizz', { cat:p.cat, n:p.n, level });
      start(seats.length ? seats : null, level, p.cat, p.n);
    }
  });
}

/* ── the match ─────────────────────────────────────────────────── */
function start(seatList, level, cat, n){
  injectCSS();
  const seats = [];
  if (seatList && seatList.length){
    seatList.forEach((s, i) => seats.push({
      name: s.name || (s.kind === 'cpu' ? T('Machine','Magna') : T('Player','Plejer') + ' ' + (i+1)),
      cpu: s.kind === 'cpu', pts:0, streak:0, hot:0
    }));
  } else {
    seats.push({ name:T('You','Int'), cpu:false, pts:0, streak:0, hot:0 });
    seats.push({ name:T('Machine','Magna'), cpu:true, pts:0, streak:0, hot:0 });
  }
  M = {
    seats, level, cat, n,
    qs: E.draw(n, cat),
    i: 0, turn: 0, ctx: null, t0: 0, timer: null, cpuT: null,
    answered: false, mid: 'kwizz-' + Date.now()
  };
  openBoard();
  askNext();
}

function openBoard(){
  M.ctx = P.ui.frame({
    title:T('Il-Kwiżż','Il-Kwiżż'),
    onBack: () => { leave(); P.hub(); },
    leave,
    buttons: []
  });
  /* UNDO THE CHESSBOARD. .pt-board is an 8x8 CSS grid with 40px cells —
     right for Dama, and it put every child of this screen into a 40px
     column, which is why the question read one word per line. Every
     non-grid game on the shelf flattens it the same way. */
  const b = M.ctx.board;
  b.style.cssText = 'display:block;grid-template-columns:none;grid-template-rows:none;' +
    'width:100%;max-width:520px;border:0;box-shadow:none;overflow:visible;background:transparent';
  b.innerHTML =
    '<div class="kz-wrap">' +
      '<div class="kz-clock"><i id="kz-bar"></i></div>' +
      '<div class="kz-cat" id="kz-cat"></div>' +
      '<div class="kz-q" id="kz-q"></div>' +
      '<div class="kz-opts" id="kz-opts"></div>' +
      '<div class="kz-who" id="kz-who"></div>' +
      '<div class="kz-score" id="kz-score"></div>' +
    '</div>';
  paintScores();
}

function paintScores(){
  const el = M.ctx.root.querySelector('#kz-score');
  if (!el) return;
  el.innerHTML = M.seats.map((s, i) =>
    '<span class="kz-chip' + (i === M.turn ? ' turn' : '') + '">' +
      '<i style="background:' + SEATCOL[i % SEATCOL.length] + '"></i>' +
      esc(s.name) +
      (s.streak >= E.STREAK_AT ? ' <span class="kz-streak">x' + E.STREAK_X + '</span>' : '') +
      ' <span class="pts">' + s.pts + '</span></span>').join('');
}

/* ── one question ──────────────────────────────────────────────── */
function askNext(){
  if (!M) return;
  if (M.i >= M.qs.length) return finish();
  const q = M.qs[M.i];
  const seat = M.seats[M.turn];
  const L = lang();

  M.answered = false;
  M.t0 = Date.now();

  const root = M.ctx.root;
  root.querySelector('#kz-cat').textContent =
    T('Question','Mistoqsija') + ' ' + (M.i + 1) + ' / ' + M.qs.length;
  root.querySelector('#kz-q').textContent = L === 'mt' ? q.mt : q.en;
  root.querySelector('#kz-who').textContent = seat.cpu
    ? T('The machine is thinking…','Il-magna qed taħseb…')
    : esc(seat.name) + T(' — your call','  — tiegħek');

  const opts = root.querySelector('#kz-opts');
  opts.innerHTML = q.opts.map((o, i) =>
    '<button class="kz-opt" data-i="' + i + '"' + (seat.cpu ? ' disabled' : '') + '>' +
      '<span class="k">' + 'ABCD'[i] + '</span>' +
      '<span>' + esc(L === 'mt' ? o[1] : o[0]) + '</span></button>').join('');
  if (!seat.cpu){
    opts.querySelectorAll('.kz-opt').forEach(b => {
      b.onclick = () => answer(+b.dataset.i);
    });
  }
  P.ui.setTurn(M.ctx, seat.cpu ? T('Machine','Magna') : esc(seat.name));
  paintScores();
  runClock();

  if (seat.cpu){
    const a = E.cpuAnswer(q, M.level);
    M.cpuT = setTimeout(() => { M.cpuT = null; answer(a.pick); },
                        Math.min(a.at, E.ASK_MS - 400));
  }
}

/* THE BAR IS THE CLOCK. A number counting down is information you have
   to read; a bar draining is information you feel, and a quiz is
   played at a glance. */
function runClock(){
  stopClock();
  const bar = M.ctx.root.querySelector('#kz-bar');
  const tick = () => {
    if (!M || M.answered) return;
    const left = Math.max(0, E.ASK_MS - (Date.now() - M.t0));
    if (bar) bar.style.transform = 'scaleX(' + (left / E.ASK_MS) + ')';
    if (left <= 0) return answer(-1);          /* out of time */
    M.timer = requestAnimationFrame(tick);
  };
  M.timer = requestAnimationFrame(tick);
}
function stopClock(){
  if (M && M.timer){ cancelAnimationFrame(M.timer); M.timer = null; }
}

function answer(pick){
  if (!M || M.answered) return;
  M.answered = true;
  stopClock();
  if (M.cpuT){ clearTimeout(M.cpuT); M.cpuT = null; }

  const q = M.qs[M.i];
  const seat = M.seats[M.turn];
  const left = Math.max(0, E.ASK_MS - (Date.now() - M.t0));
  const right = pick === q.a;

  let gained = 0;
  if (right){
    gained = E.score(left, seat.streak);
    seat.pts += gained;
    seat.streak++;
  } else {
    seat.streak = 0;
  }

  /* show the truth: their pick in red if wrong, the answer in green */
  const opts = M.ctx.root.querySelectorAll('.kz-opt');
  opts.forEach((b, i) => {
    b.disabled = true;
    if (i === q.a) b.classList.add('right');
    else if (i === pick) b.classList.add('wrong');
  });

  const who = M.ctx.root.querySelector('#kz-who');
  who.textContent = pick < 0
    ? T('Out of time.','Spiċċa l-ħin.')
    : right
      ? esc(seat.name) + ' +' + gained + (seat.streak >= E.STREAK_AT ? T('  — on a streak!','  — bis-serje!') : '')
      : esc(seat.name) + T(' — no.',' — le.');
  try { if (K.sfx) K.sfx(right ? 'good' : 'bad'); } catch(e){}
  paintScores();

  setTimeout(() => {
    if (!M) return;
    M.i++;
    M.turn = (M.turn + 1) % M.seats.length;
    askNext();
  }, 1500);
}

/* ── the end ───────────────────────────────────────────────────── */
function finish(){
  stopClock();
  const sorted = M.seats.map((s, i) => ({ s, i })).sort((a, b) => b.s.pts - a.s.pts);
  const top = sorted[0];
  const tie = sorted.length > 1 && sorted[1].s.pts === top.s.pts;
  const meIdx = M.seats.findIndex(s => !s.cpu);
  const iWon = !tie && meIdx >= 0 && top.i === meIdx;

  /* PAID ONCE, under a stable id. progress.js pays as a side effect of
     the result call, so calling both this and record() would pay twice
     and neither would show an error. */
  if (meIdx >= 0 && window.KARTI_XP && KARTI_XP.awardPlay){
    try { KARTI_XP.awardPlay({ game:'kwizz', won:iWon, draw:tie, id:M.mid, ranked:false }); } catch(e){}
  }
  try { P.record('kwizz', tie ? 'd' : iWon ? 'w' : 'l'); } catch(e){}

  const line = M.seats.map(s => esc(s.name) + ' ' + s.pts).join('  ·  ');
  P.ui.result(M.ctx, {
    tone: tie ? 'draw' : iWon ? 'win' : 'lose',
    /* THE WINNER LINE HAS TO BE A SENTENCE. "You takes it" is what you get
       from gluing a verb onto a name, and the name that appears most often
       is the player's own. */
    head: tie ? T('Dead heat','Indaqs')
        : (top.i === meIdx ? T('You win','Rebaħt')
                           : esc(top.s.name) + T(' takes it',' jirbaħ')),
    why: line,
    quip: iWon ? T('You knew things. Suspicious.','Kont taf. Suspettuż.')
        : tie ? T('Nobody is buying the next round.','Ħadd mhu se jħallas.')
        : T('The machine reads more than you do.','Il-magna taqra aktar minnek.'),
    buttons:[
      { label:T('Play again',"Erġa' lgħab"), icon:'refresh', cls:'primary',
        go:() => { leave(); setupSheet(); } },
      { label:T('Leave','Oħroġ'), icon:'back', cls:'ghost',
        go:() => { leave(); P.hub(); } }
    ]
  });
}

function leave(){
  stopClock();
  if (M && M.cpuT){ clearTimeout(M.cpuT); M.cpuT = null; }
  M = null;
}

/* ── the shelf tile ────────────────────────────────────────────── */
const LOBBY = {
  canStart(list){
    const n = (list || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why:T('Il-Kwiżż needs at least two.','Il-Kwiżż trid tal-anqas tnejn.') };
    if (n > E.MAX_SEATS) return { ok:false, why:T('Up to six can play.','Sa sitta jistgħu jilagħbu.') };
    return { ok:true, why:'' };
  },
  rulesHTML: () => '<p>' + [
    T('Everybody sees the question. Whoever is holding the phone answers it.',
      'Kulħadd jara l-mistoqsija. Min għandu t-telefon iwieġeb.'),
    T('Right and fast is 1000. Right and slow is still 500 — being late costs you half, never all of it.',
      'Tajjeb u malajr huwa 1000. Tajjeb u bil-mod xorta 500 — tittardja titlef nofs, qatt kollox.'),
    T('Three right in a row and the next one counts double.',
      'Tlieta tajbin wara xulxin u li jmiss tgħodd doppju.'),
    T('Nobody is ever knocked out. Highest score at the end takes it.',
      'Ħadd ma joħroġ. L-ogħla skor fl-aħħar jirbaħ.')
  ].join('</p><p>') + '</p>',
  blurb: T('Answer fastest, score most.','Wieġeb l-ewwel, iġbor l-aktar.'),
  start(seats){ start(seats, prefs().level, prefs().cat, prefs().n); return { v:1, gid:'kwizz' }; },
  levels: E.BANDS.map(b => ({ k:b.k, name:b.name }))
};

const TILE = {
  id:'kwizz', order:14, kind:'board', cat:'word',
  name:'Il-Kwiżż', mt:'Il-Kwiżż', icon:'book', status:'live',
  get tag(){ return T('Trivia on the buzzer — Malta, the world and the pub round. Fast and right is worth double slow and right, and three in a row doubles the next.',
    'Mistoqsijiet fuq il-ħin — Malta, id-dinja u tal-każin. Malajr u tajjeb jiswa doppju, u tlieta wara xulxin jirduppjaw li jmiss.'); },
  open: () => setupSheet(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: LOBBY.levels,
  rulesHTML: () => LOBBY.rulesHTML(),
  start: (list) => LOBBY.start(list)
};

const R = (window.KARTI_KWIZZ_UI = {});
R.shelfTile = TILE;
R.lobby = LOBBY;
R.ui = { open:setupSheet, leave, injectCSS };
R.open = () => setupSheet();
R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

/* test hooks — inert unless ?kwizztest */
if (/[?&]kwizztest\b/.test(location.search || '')){
  window.__KWIZZ_TEST = {
    setupSheet, start, askNext, answer, finish, leave,
    get M(){ return M; }, engine:E, TILE, LOBBY
  };
}

})();
