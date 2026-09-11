/* ═══════════════════════════════════════════════════════════════════
   KARTI — lewwel-ui.js
   L-EWWEL — the screen. One enormous pad, a colour, and a number.

   THE PAD IS THE WHOLE INTERFACE. A reaction game measured on a small
   button measures aim, not reflex — so the target is the entire board
   and there is nothing else on it to hit. Three states and no fourth:

     WAIT   deep red, "hold…"        tapping now burns the go
     GO     green, "NOW"             the clock is running
     DONE   the number, and a word   what it was worth

   THE COLOUR CARRIES IT, NOT THE TEXT. Red to green is the fastest
   signal the eye has; anybody reading a word has already lost 200ms
   to reading it. The words are there for the second glance.

   WHY EACH SEAT GOES ALONE. On one phone a simultaneous race measures
   who is holding it, not who is quicker. Everybody takes their five
   goes, best one counts, and the table watches the number.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const E = window.KARTI_LEWWEL;
if (!K || !P || !E) return;

const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
const esc = K.esc;

const SEATCOL = ['#FFC542', '#4FB6FF', '#3DDC84', '#FF5468', '#C08BFF', '#FF9F45'];

let M = null;

let cssIn = false;
function injectCSS(){
  if (cssIn) return; cssIn = true;
  const st = document.createElement('style');
  st.id = 'lewwel-css';
  st.textContent = (`
.lw-wrap{display:flex;flex-direction:column;gap:10px;height:100%;padding:2px 0}
.lw-pad{flex:1 1 auto;min-height:210px;border-radius:18px;display:grid;place-items:center;
  text-align:center;cursor:pointer;user-select:none;-webkit-user-select:none;
  border:2px solid rgba(0,0,0,.45);transition:background .06s linear;padding:16px}
.lw-pad.wait{background:linear-gradient(180deg,#5A1220,#3A0C16)}
.lw-pad.go{background:linear-gradient(180deg,#1E8A4A,#116234)}
.lw-pad.done{background:linear-gradient(180deg,#2A2140,#1A1430)}
.lw-pad.idle{background:linear-gradient(180deg,#241C3A,#171128)}
.lw-big{font-family:var(--disp);font-weight:900;font-size:40px;line-height:1.05;letter-spacing:.02em}
.lw-sub{font-size:13px;color:rgba(255,255,255,.72);margin-top:8px;font-weight:700}
.lw-ms{font-variant-numeric:tabular-nums}
.lw-goes{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;flex:0 0 auto;min-height:22px}
.lw-go{min-width:44px;padding:3px 7px;border-radius:8px;font-size:11px;font-weight:800;
  background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);
  color:var(--dim);font-variant-numeric:tabular-nums}
.lw-go.good{color:#EDEAF6;border-color:rgba(61,220,132,.55)}
.lw-go.best{color:#0F0A1C;background:#3DDC84;border-color:#3DDC84}
.lw-go.bad{color:#FF9BAA;border-color:rgba(255,84,104,.5)}
.lw-score{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;flex:0 0 auto}
.lw-chip{display:flex;align-items:center;gap:6px;padding:4px 9px;border-radius:99px;
  background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.10);font-size:12px;font-weight:800}
.lw-chip i{width:9px;height:9px;border-radius:50%;display:block}
.lw-chip.turn{border-color:var(--gold);background:rgba(255,197,66,.14)}
.lw-chip .pts{color:var(--dim);font-variant-numeric:tabular-nums}
`).replace(/^\.lw/gm, '#scr-party .lw');
  document.head.appendChild(st);
}

function prefs(){
  const p = P.pref('lewwel') || {};
  return { level: p.level || 'medium' };
}

function setupSheet(){
  injectCSS();
  const p = prefs();
  P.ui.setup({
    id:'lewwel',
    title:T('L-Ewwel','L-Ewwel'),
    sub:T('Whoever is quicker','Min hu l-aktar ħafif'),
    blurb:T('Hold. When it turns green, tap. Tap early and the go is gone. Five each, best one counts.',
            'Żomm. Meta jsir aħdar, mess. Tmiss kmieni u titlef il-go. Ħamsa kull wieħed, l-aħjar tgħodd.'),
    levels: E.BANDS.map(b => ({ k:b.k, name:b.name,
      note: b.k === 'easy' ? T('About 430ms','Madwar 430ms')
          : b.k === 'hard' ? T('About 196ms — good luck','Madwar 196ms — sena tajba')
          : T('About 285ms','Madwar 285ms'), icon:'bolt' })),
    onBack: () => P.hub(),
    onStart: (o) => {
      const level = (o && o.level) || p.level;
      P.pref('lewwel', { level });
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
      cpu: s.kind === 'cpu', goes: []
    }));
  } else {
    seats.push({ name:T('You','Int'), cpu:false, goes: [] });
    seats.push({ name:T('Machine','Magna'), cpu:true, goes: [] });
  }
  M = { seats, level, turn:0, phase:'idle', ctx:null,
        armT:null, goAt:0, cpuT:null, mid:'lewwel-' + Date.now() };
  openBoard();
  nextGo();
}

function openBoard(){
  M.ctx = P.ui.frame({
    title:T('L-Ewwel','L-Ewwel'),
    onBack: () => { leave(); P.hub(); },
    leave, buttons: []
  });
  /* the shelf's board is an 8x8 chess grid; flatten it, as every
     non-grid game here does */
  const b = M.ctx.board;
  b.style.cssText = 'display:block;grid-template-columns:none;grid-template-rows:none;' +
    'width:100%;max-width:520px;border:0;box-shadow:none;overflow:visible;background:transparent';
  b.innerHTML =
    '<div class="lw-wrap">' +
      '<div class="lw-pad idle" id="lw-pad">' +
        '<div><div class="lw-big" id="lw-big"></div>' +
        '<div class="lw-sub" id="lw-sub"></div></div>' +
      '</div>' +
      '<div class="lw-goes" id="lw-goes"></div>' +
      '<div class="lw-score" id="lw-score"></div>' +
    '</div>';
  const pad = b.querySelector('#lw-pad');
  pad.addEventListener('pointerdown', onTap);
  paint();
}

function paint(){
  const seat = M.seats[M.turn];
  const goes = M.ctx.root.querySelector('#lw-goes');
  const bestOf = E.best(seat.goes);
  goes.innerHTML = seat.goes.map(g =>
    '<span class="lw-go ' + (g === E.FALSE ? 'bad' : g === bestOf ? 'best' : 'good') + '">' +
      (g === E.FALSE ? '—' : g + 'ms') + '</span>').join('') ||
    '<span class="lw-go">' + T('go 1 of ','go 1 minn ') + E.GOES + '</span>';

  const sc = M.ctx.root.querySelector('#lw-score');
  sc.innerHTML = M.seats.map((s, i) => {
    const bb = E.best(s.goes);
    return '<span class="lw-chip' + (i === M.turn ? ' turn' : '') + '">' +
      '<i style="background:' + SEATCOL[i % SEATCOL.length] + '"></i>' + esc(s.name) +
      ' <span class="pts">' + (bb === null ? '—' : bb + 'ms') + '</span></span>';
  }).join('');
}

function say(big, sub, cls){
  const pad = M.ctx.root.querySelector('#lw-pad');
  pad.className = 'lw-pad ' + cls;
  M.ctx.root.querySelector('#lw-big').textContent = big;
  M.ctx.root.querySelector('#lw-sub').textContent = sub || '';
}

/* ── one go ────────────────────────────────────────────────────── */
function nextGo(){
  if (!M) return;
  /* everybody had their five? */
  if (M.seats.every(s => s.goes.length >= E.GOES)) return finish();
  /* whose turn — skip anyone already finished */
  let guard = 0;
  while (M.seats[M.turn].goes.length >= E.GOES && guard++ < M.seats.length)
    M.turn = (M.turn + 1) % M.seats.length;

  const seat = M.seats[M.turn];
  P.ui.setTurn(M.ctx, esc(seat.name));
  paint();

  if (seat.cpu){
    say(T('Machine','Magna'), T('its go','il-go tagħha'), 'idle');
    M.cpuT = setTimeout(() => {
      M.cpuT = null;
      const ms = E.cpuGo(M.level);
      seat.goes.push(ms);
      say(ms === E.FALSE ? T('Too soon','Kmieni wisq') : ms + 'ms', E.verdict(ms), 'done');
      paint();
      setTimeout(() => { if (M){ M.turn = (M.turn + 1) % M.seats.length; nextGo(); } }, 1100);
    }, 700 + Math.random() * 600);
    return;
  }

  M.phase = 'armed';
  say(T('Hold','Żomm'), T('tap when it turns green','mess meta jsir aħdar'), 'wait');
  M.armT = setTimeout(() => {
    if (!M || M.phase !== 'armed') return;
    M.phase = 'go';
    M.goAt = Date.now();
    say(T('NOW','ISSA'), '', 'go');
    try { if (K.sfx) K.sfx('good'); } catch(e){}
    /* too slow is still a spent go, or a player can simply not tap */
    M.armT = setTimeout(() => { if (M && M.phase === 'go') land(E.TIMEOUT); }, E.TIMEOUT);
  }, E.holdMs());
}

function onTap(){
  if (!M) return;
  if (M.phase === 'armed'){            /* jumped the gun */
    clearTimeout(M.armT); M.armT = null;
    return land(E.FALSE);
  }
  if (M.phase === 'go'){
    clearTimeout(M.armT); M.armT = null;
    return land(Date.now() - M.goAt);
  }
}

function land(ms){
  M.phase = 'done';
  const seat = M.seats[M.turn];
  seat.goes.push(ms);
  say(ms === E.FALSE ? T('Too soon','Kmieni wisq') : ms + 'ms', E.verdict(ms), 'done');
  try { if (K.sfx) K.sfx(ms === E.FALSE ? 'bad' : 'good'); } catch(e){}
  paint();
  setTimeout(() => { if (M){ M.turn = (M.turn + 1) % M.seats.length; nextGo(); } }, 1200);
}

/* ── the end ───────────────────────────────────────────────────── */
function finish(){
  const order = E.rank(M.seats);
  const top = order[0];
  const tie = order.length > 1 && order[1].b !== null && order[1].b === top.b;
  const meIdx = M.seats.findIndex(s => !s.cpu);
  const iWon = !tie && meIdx >= 0 && top.i === meIdx;

  if (meIdx >= 0 && window.KARTI_XP && KARTI_XP.awardPlay){
    try { KARTI_XP.awardPlay({ game:'lewwel', won:iWon, draw:tie, id:M.mid, ranked:false }); } catch(e){}
  }
  try { P.record('lewwel', tie ? 'd' : iWon ? 'w' : 'l'); } catch(e){}

  const line = order.map(o => esc(o.s.name) + ' ' + (o.b === null ? '—' : o.b + 'ms')).join('  ·  ');
  P.ui.result(M.ctx, {
    tone: tie ? 'draw' : iWon ? 'win' : 'lose',
    head: tie ? T('Dead heat','Indaqs')
        : (top.i === meIdx ? T('You win','Rebaħt') : esc(top.s.name) + T(' is quicker',' aktar ħafif')),
    why: line,
    quip: iWon ? T('Nothing else in the box is this honest.','Xejn f\'din il-kaxxa mhu daqshekk onest.')
        : tie ? T('Again, then.','Mela erġgħu.')
        : T('Blame the phone. Everyone does.','Waħħal fit-telefon. Kulħadd jagħmel hekk.'),
    buttons:[
      { label:T('Play again',"Erġa' lgħab"), icon:'refresh', cls:'primary', go:() => { leave(); setupSheet(); } },
      { label:T('Leave','Oħroġ'), icon:'back', cls:'ghost', go:() => { leave(); P.hub(); } }
    ]
  });
}

function leave(){
  if (M){
    if (M.armT) clearTimeout(M.armT);
    if (M.cpuT) clearTimeout(M.cpuT);
  }
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
    T('Hold the pad. When the whole screen turns green, tap it.',
      'Żomm il-pad. Meta l-iskrin kollu jsir aħdar, messu.'),
    T('Tap before it turns and that go is gone — no time, no score.',
      'Tmiss qabel ma jaqleb u dak il-go jintilef — bla ħin, bla punt.'),
    T('Five goes each. Your BEST one is your score, so one fumble costs you nothing.',
      'Ħames goes kull wieħed. L-AĦJAR wieħed hu l-iskor, mela żball wieħed ma jiswielek xejn.'),
    T('Lowest time wins.','L-inqas ħin jirbaħ.')
  ].join('</p><p>') + '</p>',
  blurb: T('Hold, then tap the moment it turns.','Żomm, imbagħad mess malli jaqleb.'),
  start(seats){ start(seats, prefs().level); return { v:1, gid:'lewwel' }; },
  levels: E.BANDS.map(b => ({ k:b.k, name:b.name }))
};

const TILE = {
  id:'lewwel', order:15, kind:'board', cat:'party',
  name:'L-Ewwel', mt:'L-Ewwel', icon:'bolt', status:'live',
  get tag(){ return T('Hold, and tap the instant the screen turns green. Jump early and the go is gone. Five each, best one counts — the shortest game in the box and the loudest.',
    'Żomm, u mess malli l-iskrin isir aħdar. Taqbeż kmieni u titlef il-go. Ħamsa kull wieħed, l-aħjar tgħodd.'); },
  open: () => setupSheet(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: LOBBY.levels,
  rulesHTML: () => LOBBY.rulesHTML(),
  start: (list) => LOBBY.start(list)
};

const R = (window.KARTI_LEWWEL_UI = {});
R.shelfTile = TILE;
R.lobby = LOBBY;
R.ui = { open:setupSheet, leave, injectCSS };
R.open = () => setupSheet();
R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

if (/[?&]lewweltest\b/.test(location.search || '')){
  window.__LEWWEL_TEST = {
    setupSheet, start, nextGo, onTap, land, finish, leave,
    get M(){ return M; }, engine:E, TILE, LOBBY
  };
}

})();
