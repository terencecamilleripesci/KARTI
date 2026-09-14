/* ═══════════════════════════════════════════════════════════════════
   KARTI — ritmu-ui.js
   RITMU — the screen. A ring that pulses and a pad you hit.

   THE BEAT IS SHOWN, NOT PLAYED. The click is optional decoration and
   the game says so; what the player follows is the ring. That is the
   whole point of the engine's note on latency — audio comes out of a
   phone whenever the phone feels like it, and a player following a
   sound they hear late is not doing anything wrong. A visual beat and
   a variance-based score between them make the hardware irrelevant.

   NOTHING IS SCORED IN THE LEAD-IN. Four free beats, counted down on
   screen, before anything is recorded. A rhythm game that starts
   judging you on the first beat is judging your reaction time to a
   screen appearing, which is a different game and it is L-EWWEL.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const E = window.KARTI_RITMU;
if (!K || !P || !E) return;

const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
const esc = K.esc;
const SEATCOL = ['#FFC542', '#4FB6FF', '#3DDC84', '#FF5468', '#C08BFF', '#FF9F45'];
const BARS = 4;

let M = null;

let cssIn = false;
function injectCSS(){
  if (cssIn) return; cssIn = true;
  const st = document.createElement('style');
  st.id = 'ritmu-css';
  st.textContent = (`
.rt-wrap{display:flex;flex-direction:column;gap:10px;height:100%;padding:2px 0;align-items:center}
.rt-head{display:flex;justify-content:space-between;align-items:baseline;width:100%;flex:0 0 auto}
.rt-lab{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim2);font-weight:800}
.rt-bpm{font-family:var(--disp);font-size:20px;font-weight:900;color:var(--gold)}
.rt-pips{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;flex:0 0 auto}
.rt-pip{width:13px;height:13px;border-radius:50%;background:rgba(255,255,255,.13);
  border:1px solid rgba(255,255,255,.16);transition:transform .1s,background .1s}
.rt-pip.rest{background:transparent;border-style:dashed}
.rt-pip.on{background:var(--gold);border-color:var(--gold);transform:scale(1.45)}
.rt-pip.on.rest{background:rgba(255,255,255,.22);transform:scale(1.2)}
.rt-ringwrap{flex:1 1 auto;display:grid;place-items:center;width:100%;min-height:180px}
.rt-ring{width:min(62vw,240px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;
  border:3px solid rgba(255,255,255,.16);background:radial-gradient(circle at 50% 42%,
  rgba(255,197,66,.10),rgba(0,0,0,.30));transition:transform .07s linear,border-color .12s,box-shadow .12s;
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;cursor:pointer}
.rt-ring.beat{transform:scale(1.09);border-color:var(--gold);box-shadow:0 0 34px rgba(255,197,66,.30)}
.rt-ring.rest{transform:scale(1.03);border-color:rgba(255,255,255,.30);box-shadow:none}
.rt-ring.hit{background:radial-gradient(circle at 50% 42%,rgba(61,220,132,.30),rgba(0,0,0,.30))}
.rt-ring.stray{background:radial-gradient(circle at 50% 42%,rgba(255,84,104,.30),rgba(0,0,0,.30))}
.rt-ring b{font-family:var(--disp);font-size:min(15vw,58px);line-height:1;color:var(--ink)}
.rt-ring i{font-style:normal;font-size:12px;color:var(--dim);letter-spacing:.12em;text-transform:uppercase}
.rt-said{text-align:center;font-size:13px;font-weight:800;min-height:1.4em;color:var(--dim);flex:0 0 auto}
.rt-said.good{color:#7FE8A8}
.rt-said.bad{color:#FF8DA0}
.rt-meter{width:100%;max-width:320px;height:7px;border-radius:99px;background:rgba(255,255,255,.10);
  overflow:hidden;flex:0 0 auto}
.rt-meter i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#3DDC84,#FFC542);
  width:0;transition:width .2s var(--ease)}
.rt-score{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;flex:0 0 auto}
.rt-chip{display:flex;align-items:center;gap:6px;padding:4px 9px;border-radius:99px;
  background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.10);font-size:12px;font-weight:800}
.rt-chip i{width:9px;height:9px;border-radius:50%;display:block}
.rt-chip.out{opacity:.34}
.rt-note{text-align:center;font-size:11px;color:var(--dim2);max-width:320px;flex:0 0 auto}
`).replace(/^\.rt/gm, '#scr-party .rt');
  document.head.appendChild(st);
}

function prefs(){
  const p = P.pref('ritmu') || {};
  return { level: p.level || 'medium', click: p.click !== false };
}

function setupSheet(){
  injectCSS();
  const p = prefs();
  P.ui.setup({
    id:'ritmu',
    title:T('Ritmu','Ritmu'),
    sub:T('Keep the beat','Żomm ir-ritmu'),
    blurb:T('Follow the ring and tap with it. It gets faster every round and the rests are where people fall over. You are marked on being STEADY, not on being early or late — so a slow phone costs you nothing.',
            'Segwi ċ-ċirku u ħabbat miegħu. Kull rawnd jissokta aktar mgħaġġel u l-mistrieħ hu fejn jaqgħu n-nies. Tiġi ġġudikat fuq kemm int STABBLI, mhux jekk intix kmieni jew tard — mela mowbajl bil-mod ma jiswielek xejn.'),
    levels: E.BANDS.map(b => ({ k:b.k, name:b.name,
      note: T(b.bpm + ' to ' + b.cap + ' bpm', b.bpm + ' sa ' + b.cap + ' bpm'), icon:'bolt' })),
    onBack: () => P.hub(),
    onStart: (o) => {
      const level = (o && o.level) || p.level;
      P.pref('ritmu', { level, click:p.click });
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
      cpu: s.kind === 'cpu', out:false, rounds:0, best:Infinity
    }));
  } else {
    seats.push({ name:T('You','Int'), cpu:false, out:false, rounds:0, best:Infinity });
    seats.push({ name:T('Machine','Magna'), cpu:true, out:false, rounds:0, best:Infinity });
  }
  /* turn STARTS AT -1, not 0. nextTurn() advances before it plays, so a
     0 here handed the first go to seat 1 — the machine opened every
     single game and the player watched. */
  M = { seats, level, r:0, turn:-1, ctx:null, live:false,
        beats:[], offs:[], strays:0, tick:null, raf:null, i:-1,
        mid:'ritmu-' + Date.now() };
  openBoard();
  nextTurn();
}

function openBoard(){
  M.ctx = P.ui.frame({
    title:T('Ritmu','Ritmu'),
    onBack: () => { leave(); P.hub(); },
    leave, buttons: []
  });
  const b = M.ctx.board;
  b.style.cssText = 'display:block;grid-template-columns:none;grid-template-rows:none;' +
    'width:100%;max-width:520px;border:0;box-shadow:none;overflow:visible;background:transparent';
}

/* whose go is it — skipping anybody already out */
function nextTurn(){
  if (!M) return;
  stopLoop();
  const alive = M.seats.filter(s => !s.out);
  if (alive.length <= 1 && M.seats.length > 1) return finish();
  if (!alive.length) return finish();
  const n = M.seats.length;
  /* the tempo goes up on a full pass of the table — counted on the WRAP,
     including any wrap skipped past because that seat is already out */
  const step = () => { M.turn = (M.turn + 1) % n; if (M.turn === 0) M.r++; };
  if (M.turn < 0) M.turn = 0; else step();
  let guard = 0;
  while (M.seats[M.turn].out && guard++ < n * 2) step();
  if (M.seats[M.turn].cpu) return cpuTurn();
  humanTurn();
}

function paint(){
  const s = M.seats[M.turn];
  const bpm = E.tempoAt(M.level, M.r);
  M.ctx.board.innerHTML =
    '<div class="rt-wrap">' +
      '<div class="rt-head">' +
        '<span class="rt-lab">' + esc(s.name) + ' · ' + T('Round','Rawnd') + ' ' + (M.r + 1) +
          ' · ' + esc(M.pat.n) + '</span>' +
        '<span class="rt-bpm">' + bpm + '<span class="rt-lab"> bpm</span></span>' +
      '</div>' +
      '<div class="rt-pips" id="rt-pips"></div>' +
      '<div class="rt-ringwrap">' +
        '<div class="rt-ring" id="rt-ring"><b id="rt-big">' + E.LEAD_IN + '</b></div>' +
      '</div>' +
      '<div class="rt-meter"><i id="rt-meter"></i></div>' +
      '<div class="rt-said" id="rt-said">' + T('Tap with the ring','Ħabbat maċ-ċirku') + '</div>' +
      '<p class="rt-note">' + T('You are scored on how steady you are, not on how early or late. The rests are silent — do not tap them.',
        'Tiġi ġġudikat fuq kemm int stabbli, mhux fuq kemm int kmieni jew tard. Il-mistrieħ hu skiet — tħabbatx fih.') + '</p>' +
      '<div class="rt-score" id="rt-score"></div>' +
    '</div>';
  pips();
  score();
  const ring = M.ctx.board.querySelector('#rt-ring');
  const hit = ev => { ev.preventDefault(); tap(); };
  ring.addEventListener('pointerdown', hit);
  /* the whole board is the pad too — on a phone the ring is a small
     target for a thumb that is busy keeping time */
  M.ctx.board.addEventListener('pointerdown', ev => {
    if (ev.target.closest && ev.target.closest('#rt-ring')) return;
    hit(ev);
  });
}

function pips(){
  const box = M.ctx.board.querySelector('#rt-pips');
  if (!box || !M.pat) return;
  box.innerHTML = M.pat.p.map((v, i) =>
    '<span class="rt-pip' + (v ? '' : ' rest') + '" data-i="' + i + '"></span>').join('');
}

function score(){
  const el = M.ctx.board.querySelector('#rt-score');
  if (!el) return;
  el.innerHTML = M.seats.map((s, i) =>
    '<span class="rt-chip' + (s.out ? ' out' : '') + '">' +
      '<i style="background:' + SEATCOL[i % SEATCOL.length] + '"></i>' + esc(s.name) +
      ' ' + s.rounds + (s.out ? ' ✕' : '') + '</span>').join('');
}

function say(msg, cls){
  const el = M.ctx.board.querySelector('#rt-said');
  if (el){ el.className = 'rt-said' + (cls ? ' ' + cls : ''); el.textContent = msg; }
}

/* ── the beat grid ─────────────────────────────────────────────────
   Built ONCE as a list of absolute times. The visual timer may fire
   late — timers on a busy phone always do — but the times a tap is
   judged against are these, and they are exact. */
function humanTurn(){
  M.pat = E.patternFor(M.r);
  paint();
  const spb = E.msPerBeat(E.tempoAt(M.level, M.r));
  const total = E.LEAD_IN + M.pat.p.length * BARS;
  const t0 = now() + 900;
  M.beats = [];
  for (let i = 0; i < total; i++){
    const inLead = i < E.LEAD_IN;
    const pi = inLead ? -1 : (i - E.LEAD_IN) % M.pat.p.length;
    M.beats.push({ t: t0 + i * spb, lead: inLead, want: !inLead && M.pat.p[pi] === 1, pi });
  }
  M.offs = [];
  M.strays = 0;
  M.used = new Set();
  M.spb = spb;
  M.i = -1;
  M.live = true;
  loop();
}

const now = () => (window.performance && performance.now) ? performance.now() : Date.now();

function loop(){
  if (!M || !M.live) return;
  const t = now();
  /* advance through every beat whose time has passed — a dropped frame
     must not drop a beat */
  while (M.i + 1 < M.beats.length && t >= M.beats[M.i + 1].t){
    M.i++;
    show(M.beats[M.i]);
  }
  if (M.i >= M.beats.length - 1 && t > M.beats[M.beats.length - 1].t + M.spb * 0.75)
    return endTurn();
  M.raf = requestAnimationFrame(loop);
}

function show(b){
  const ring = M.ctx.board.querySelector('#rt-ring');
  const big = M.ctx.board.querySelector('#rt-big');
  const meter = M.ctx.board.querySelector('#rt-meter');
  if (!ring) return;
  ring.classList.remove('beat', 'rest', 'hit', 'stray');
  void ring.offsetWidth;
  ring.classList.add(b.want || b.lead ? 'beat' : 'rest');
  if (big){
    if (b.lead) big.textContent = String(E.LEAD_IN - M.beats.indexOf(b));
    else big.textContent = b.want ? '●' : '·';
  }
  if (b.lead && M.beats.indexOf(b) === E.LEAD_IN - 1) say(T('Go','Mur'), 'good');
  M.ctx.board.querySelectorAll('.rt-pip').forEach(p =>
    p.classList.toggle('on', !b.lead && +p.dataset.i === b.pi));
  if (meter){
    const done = M.beats.filter(x => !x.lead).length;
    const at = M.beats.slice(0, M.i + 1).filter(x => !x.lead).length;
    meter.style.width = Math.round(100 * at / Math.max(1, done)) + '%';
  }
  try { if (K.sfx && prefs().click && (b.want || b.lead)) K.sfx('tick'); } catch(e){}
}

function tap(){
  if (!M || !M.live) return;
  const t = now();
  /* find the nearest beat that WANTS a tap and has not been used */
  let best = -1, bestD = Infinity;
  for (let i = 0; i < M.beats.length; i++){
    const b = M.beats[i];
    if (!b.want || M.used.has(i)) continue;
    const d = Math.abs(t - b.t);
    if (d < bestD){ bestD = d; best = i; }
  }
  const ring = M.ctx.board.querySelector('#rt-ring');
  /* more than three fifths of a beat from any wanted beat is not a
     late tap, it is a tap on a rest */
  if (best < 0 || bestD > M.spb * 0.6){
    M.strays++;
    if (ring){ ring.classList.add('stray'); setTimeout(() => ring.classList.remove('stray'), 130); }
    say(T('Not there.','Mhux hemm.'), 'bad');
    return;
  }
  M.used.add(best);
  M.offs.push(t - M.beats[best].t);
  if (ring){ ring.classList.add('hit'); setTimeout(() => ring.classList.remove('hit'), 110); }
}

function stopLoop(){
  if (!M) return;
  M.live = false;
  if (M.raf) cancelAnimationFrame(M.raf);
  if (M.tick) clearTimeout(M.tick);
  M.raf = M.tick = null;
}

function endTurn(){
  if (!M) return;
  stopLoop();
  const s = M.seats[M.turn];
  const want = M.beats.filter(b => b.want).length;
  const j = E.judge(M.offs);
  const ok = E.survived(M.offs, want, M.level, M.strays);
  if (ok){
    s.rounds++;
    if (j.spread < s.best) s.best = j.spread;
    say('★'.repeat(E.stars(j.spread, M.level)).padEnd(3, '☆') + '  ' +
        T('Steady to','Stabbli sa') + ' ' + Math.round(j.spread) + 'ms', 'good');
  } else {
    s.out = true;
    say(M.strays > 2 ? T('You played over the rests.','Ħabbatt fil-mistrieħ.')
        : j.n < Math.ceil(want * 0.7) ? T('You dropped out of it.','Waqajt minnha.')
        : T('You drifted — ','Ħriġt mir-ritmu — ') + Math.round(j.spread) + 'ms', 'bad');
  }
  score();
  M.tick = setTimeout(nextTurn, 1500);
}

/* ── the machine's go ──────────────────────────────────────────────
   Shown, not simulated tap by tap: the ring beats through its turn so
   the table can see it happen, and its spread is drawn at the end. */
function cpuTurn(){
  M.pat = E.patternFor(M.r);
  paint();
  const s = M.seats[M.turn];
  say(esc(s.name) + '…');
  const spread = E.cpuSpread(M.level);
  const ok = E.cpuSurvives(M.level) && spread <= E.allowOf(M.level);
  M.tick = setTimeout(() => {
    if (!M) return;
    if (ok){
      s.rounds++;
      if (spread < s.best) s.best = spread;
      say(esc(s.name) + ' — ' + Math.round(spread) + 'ms', 'good');
    } else {
      s.out = true;
      say(esc(s.name) + ' ' + T('lost it.','tilfitha.'), 'bad');
    }
    score();
    M.tick = setTimeout(nextTurn, 1200);
  }, 1400);
}

function finish(){
  if (!M) return;
  stopLoop();
  const order = M.seats.map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.rounds - a.s.rounds || a.s.best - b.s.best);
  const top = order[0];
  const tie = order.length > 1 && order[1].s.rounds === top.s.rounds &&
              order[1].s.best === top.s.best;
  const meIdx = M.seats.findIndex(s => !s.cpu);
  const iWon = !tie && meIdx >= 0 && top.i === meIdx;
  const me = meIdx >= 0 ? M.seats[meIdx] : null;
  if (meIdx >= 0 && window.KARTI_XP && KARTI_XP.awardPlay){
    try { KARTI_XP.awardPlay({ game:'ritmu', won:iWon, draw:tie, id:M.mid, ranked:false }); } catch(e){}
  }
  if (meIdx >= 0) try { P.record('ritmu', tie ? 'd' : iWon ? 'w' : 'l'); } catch(e){}
  P.ui.result(M.ctx, {
    tone: tie ? 'draw' : iWon ? 'win' : 'lose',
    head: tie ? T('Dead heat','Indaqs')
        : (top.i === meIdx ? T('You win','Rebaħt') : esc(top.s.name) + T(' keeps it',' żammha')),
    why: M.seats.map(s => esc(s.name) + ' ' + s.rounds +
      (isFinite(s.best) ? ' (' + Math.round(s.best) + 'ms)' : '')).join('  ·  '),
    quip: me && isFinite(me.best) && me.best < 25
        ? T('Steadier than most metronomes.','Aktar stabbli minn ħafna metronomi.')
        : iWon ? T('You held it.','Żammejtha.')
        : T('It is the rests that get you.','Il-mistrieħ hu li jaqbdek.'),
    buttons:[
      { label:T('Play again',"Erġa' lgħab"), icon:'refresh', cls:'primary', go:() => { leave(); setupSheet(); } },
      { label:T('Leave','Oħroġ'), icon:'back', cls:'ghost', go:() => { leave(); P.hub(); } }
    ]
  });
}

function leave(){
  if (M) stopLoop();
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
    T('Four free beats to find it, then tap along with the ring.',
      'Erba\' ħabtiet b\'xejn biex issibha, imbagħad ħabbat maċ-ċirku.'),
    T('The pattern has rests in it. Tapping through a rest is a mistake — more than two and you are out.',
      'Fil-mudell hemm mistrieħ. Li tħabbat fil-mistrieħ hu żball — aktar minn tnejn u toħroġ.'),
    T('You are marked on how STEADY you are, not on being early or late. A phone that lags costs you nothing, because the delay is the same on every beat and it cancels out.',
      'Tiġi ġġudikat fuq kemm int STABBLI, mhux jekk intix kmieni jew tard. Mowbajl bil-mod ma jiswielek xejn, għax id-dewmien hu l-istess f\'kull ħabta u jitħassar.'),
    T('It speeds up every time the table has been round once. Last one still in it wins.',
      'Jiżdied il-pass kull darba li l-mejda ddur kollha. Jirbaħ min jibqa\' l-aħħar.')
  ].join('</p><p>') + '</p>',
  blurb: T('Tap the beat. It gets faster.','Ħabbat ir-ritmu. Jissokta aktar mgħaġġel.'),
  start(seats, o){ start(seats, lvl(o)); return { v:1, gid:'ritmu' }; },
  levels: E.BANDS.map(b => ({ k:b.k, name:b.name }))
};

const TILE = {
  id:'ritmu', order:23, kind:'other', cat:'party',
  name:'Ritmu', mt:'Ritmu', icon:'bolt', status:'live',
  get tag(){ return T('Follow the ring and tap with it — four free beats, then the rests start catching people out, and it speeds up every time the table goes round. You are marked on being steady, not on being on time, so a slow phone costs you nothing.',
    'Segwi ċ-ċirku u ħabbat miegħu — erba\' ħabtiet b\'xejn, imbagħad il-mistrieħ jibda jaqbad lin-nies, u jiżdied il-pass kull darba li ddur il-mejda. Tiġi ġġudikat fuq kemm int stabbli, mhux fuq il-ħin, mela mowbajl bil-mod ma jiswielek xejn.'); },
  open: () => setupSheet(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: LOBBY.levels,
  rulesHTML: () => LOBBY.rulesHTML(),
  /* forward the OPTIONS too — IR-RAKKONT names the difficulty here */
  start: (list, o) => LOBBY.start(list, o)
};

const R = (window.KARTI_RITMU_UI = {});
R.shelfTile = TILE; R.lobby = LOBBY;
R.ui = { open:setupSheet, leave, injectCSS };
R.open = () => setupSheet();
R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

if (/[?&]ritmutest\b/.test(location.search || '')){
  /* Real-time rhythm cannot be driven from a test runner across a CDP
     round trip — the jitter of the harness IS the measurement. So the
     hooks let a test play a turn from the INSIDE: `perform` taps every
     wanted beat at a given offset with a given wobble, using the same
     grid the game judges against. */
  window.__RITMU_TEST = {
    setupSheet, start, tap, leave, engine:E, TILE, LOBBY,
    get M(){ return M; },
    perform(offset, wobble){
      if (!M || !M.live) return 'not live';
      let n = 0;
      M.beats.forEach((b, i) => {
        if (!b.want) return;
        n++;
        const w = (Math.random() - 0.5) * 2 * (wobble || 0);
        M.used.add(i);
        M.offs.push((offset || 0) + w);
      });
      return n;
    },
    strayTap(k){ if (M) M.strays += k; },
    endNow(){ if (M && M.live) endTurn(); }
  };
}

})();
