/* ═══════════════════════════════════════════════════════════════════
   KARTI — pari-ui.js
   PARI — the screen. A grid that flips.

   MATCH AND GO AGAIN is the whole tension. Turn-taking pairs where a
   match ends your turn is a game of luck; letting a run continue is
   what makes the table lean in, because everybody can see the run
   building and nobody can do anything about it.

   THE WRONG PAIR STAYS UP LONG ENOUGH TO BE READ. 900ms — under that
   and a fast player has an advantage that is about eyesight rather
   than memory, which is not the game being played.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const E = window.KARTI_PARI;
if (!K || !P || !E) return;

const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
const esc = K.esc;
const SEATCOL = ['#FFC542', '#4FB6FF', '#3DDC84', '#FF5468'];
const SHOW_MS = 900;

let M = null;

let cssIn = false;
function injectCSS(){
  if (cssIn) return; cssIn = true;
  const st = document.createElement('style');
  st.id = 'pari-css';
  st.textContent = (`
.pr-wrap{display:flex;flex-direction:column;gap:10px;height:100%;padding:2px 0;align-items:center}
.pr-grid{display:grid;gap:7px;width:100%;max-width:420px;flex:0 0 auto}
.pr-cell{aspect-ratio:1;border-radius:12px;border:1px solid rgba(255,255,255,.13);
  background:linear-gradient(160deg,#2A2044,#1B1430);cursor:pointer;position:relative;
  display:grid;place-items:center;font-size:min(9vw,34px);padding:0;
  transition:transform .16s var(--ease),background .16s,opacity .3s}
.pr-cell:active{transform:scale(.95)}
.pr-cell .f{opacity:0;transition:opacity .12s}
.pr-cell.up{background:linear-gradient(160deg,#F6EAD2,#DFCBA6)}
.pr-cell.up .f{opacity:1}
.pr-cell.gone{opacity:.18;cursor:default;background:rgba(255,255,255,.04)}
.pr-cell.hit{background:linear-gradient(160deg,#3DDC84,#1E9457)}
.pr-cell[disabled]{cursor:default}
.pr-said{text-align:center;font-size:13px;font-weight:800;min-height:1.4em;color:var(--dim)}
.pr-said.good{color:#7FE8A8}
.pr-score{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;flex:0 0 auto}
.pr-chip{display:flex;align-items:center;gap:6px;padding:4px 9px;border-radius:99px;
  background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.10);font-size:12px;font-weight:800}
.pr-chip i{width:9px;height:9px;border-radius:50%;display:block}
.pr-chip.turn{border-color:var(--gold);background:rgba(255,197,66,.14)}
.pr-chip .pts{color:var(--dim);font-variant-numeric:tabular-nums}
.pr-run{color:var(--gold);font-weight:900}
`).replace(/^\.pr/gm, '#scr-party .pr');
  document.head.appendChild(st);
}

function prefs(){
  const p = P.pref('pari') || {};
  return { level: p.level || 'medium', size: p.size || 'normal' };
}

function setupSheet(){
  injectCSS();
  const p = prefs();
  P.ui.setup({
    id:'pari',
    title:T('Pari','Pari'),
    sub:T('Find the pairs','Sib il-pari'),
    blurb:T('Turn two. If they match you keep them and go again — a good run can take half the board.',
            'Aqleb tnejn. Jekk jaqblu żżommhom u terġa\' tmiss — serje tajba tieħu nofs il-bord.'),
    levels: E.BANDS.map(b => ({ k:b.k, name:b.name,
      note: b.k === 'easy' ? T('Holds four cards, and misremembers','Iżomm erba\' karti, u jitħawwad')
          : b.k === 'hard' ? T('Holds twelve and hardly ever slips','Iżomm tnax u kważi qatt ma jiżbalja')
          : T('Holds six','Iżomm sitta'), icon:'eye' })),
    onBack: () => P.hub(),
    onStart: (o) => {
      const level = (o && o.level) || p.level;
      P.pref('pari', { level, size:p.size });
      start((o && o.seats) || null, level, p.size);
    }
  });
}

function start(seatList, level, size){
  injectCSS();
  const S = E.SIZES.find(s => s.k === size) || E.SIZES[1];
  const seats = [];
  if (seatList && seatList.length){
    seatList.forEach((s, i) => seats.push({
      name: s.name || (s.kind === 'cpu' ? T('Machine','Magna') : T('Player','Plejer') + ' ' + (i+1)),
      cpu: s.kind === 'cpu', pts:0, mem:[]
    }));
  } else {
    seats.push({ name:T('You','Int'), cpu:false, pts:0, mem:[] });
    seats.push({ name:T('Machine','Magna'), cpu:true, pts:0, mem:[] });
  }
  M = { seats, level, S, cards:E.deal(S.pairs), turn:0, open:[], busy:false,
        run:0, ctx:null, cpuT:null, mid:'pari-' + Date.now() };
  openBoard();
  paint();
  maybeCpu();
}

function openBoard(){
  M.ctx = P.ui.frame({
    title:T('Pari','Pari'),
    onBack: () => { leave(); P.hub(); },
    leave, buttons: []
  });
  const b = M.ctx.board;
  b.style.cssText = 'display:block;grid-template-columns:none;grid-template-rows:none;' +
    'width:100%;max-width:520px;border:0;box-shadow:none;overflow:visible;background:transparent';
  b.innerHTML =
    '<div class="pr-wrap">' +
      '<div class="pr-grid" id="pr-grid" style="grid-template-columns:repeat(' + M.S.cols + ',1fr)"></div>' +
      '<div class="pr-said" id="pr-said"></div>' +
      '<div class="pr-score" id="pr-score"></div>' +
    '</div>';
}

function paint(){
  const g = M.ctx.board.querySelector('#pr-grid');
  g.innerHTML = M.cards.map(c =>
    '<button class="pr-cell' + (c.gone ? ' gone' : c.up ? ' up' : '') + '" data-at="' + c.at + '"' +
      (c.gone || c.up || M.busy ? ' disabled' : '') + '>' +
      /* THE FACE IS NOT IN THE DOM UNTIL THE CARD IS UP. Painting all
         sixteen and hiding them with opacity leaves the whole answer
         readable in the inspector, and readable to a screen reader —
         which in a memory game is not a small thing. */
      '<span class="f">' + (c.up || c.gone ? c.f : '') + '</span></button>').join('');
  g.querySelectorAll('.pr-cell').forEach(b => b.onclick = () => flip(+b.dataset.at));
  const sc = M.ctx.board.querySelector('#pr-score');
  sc.innerHTML = M.seats.map((s, i) =>
    '<span class="pr-chip' + (i === M.turn ? ' turn' : '') + '">' +
      '<i style="background:' + SEATCOL[i % SEATCOL.length] + '"></i>' + esc(s.name) +
      ' <span class="pts">' + s.pts + '</span>' +
      (i === M.turn && M.run > 1 ? ' <span class="pr-run">×' + M.run + '</span>' : '') +
      '</span>').join('');
  P.ui.setTurn(M.ctx, esc(M.seats[M.turn].name));
}

function say(msg, good){
  const el = M.ctx.board.querySelector('#pr-said');
  if (el){ el.className = 'pr-said' + (good ? ' good' : ''); el.textContent = msg || ''; }
}

function flip(at){
  if (!M || M.busy) return;
  const c = M.cards.find(x => x.at === at);
  if (!c || c.up || c.gone) return;
  c.up = true;
  M.open.push(c);
  /* EVERY SEAT SEES EVERY CARD, machine included — that is what makes
     the memory model honest rather than the machine peeking. */
  M.seats.forEach(s => { if (s.cpu) E.remember(s.mem, c.at, c.f, bandKeep()); });
  paint();
  if (M.open.length < 2) return;
  M.busy = true;
  const [a, b] = M.open;
  if (a.f === b.f) setTimeout(() => hit(a, b), 380);
  else setTimeout(() => missPair(a, b), SHOW_MS);
}

function bandKeep(){
  const B = E.BANDS.find(b => b.k === M.level) || E.BANDS[1];
  return B.keep;
}

function hit(a, b){
  if (!M) return;
  a.gone = b.gone = true;
  a.up = b.up = false;
  M.open = [];
  M.seats[M.turn].pts++;
  M.run++;
  /* a matched pair is off the board, so forget it — a machine holding
     dead cards is a machine wasting the memory it has */
  M.seats.forEach(s => { s.mem = s.mem.filter(m => m.at !== a.at && m.at !== b.at); });
  M.busy = false;
  say(T('Pair!','Par!') + (M.run > 1 ? '  ×' + M.run : ''), true);
  try { if (K.sfx) K.sfx('good'); } catch(e){}
  paint();
  if (M.cards.every(c => c.gone)) return setTimeout(finish, 700);
  maybeCpu();                                  /* same seat goes again */
}

function missPair(a, b){
  if (!M) return;
  a.up = b.up = false;
  M.open = [];
  M.run = 0;
  M.busy = false;
  M.turn = (M.turn + 1) % M.seats.length;
  say(T('No.','Le.'));
  paint();
  maybeCpu();
}

function maybeCpu(){
  if (!M || !M.seats[M.turn].cpu) return;
  const seat = M.seats[M.turn];
  M.cpuT = setTimeout(() => {
    M.cpuT = null;
    if (!M) return;
    const [x, y] = E.cpuPick(M.cards, seat.mem, M.level);
    flip(x);
    M.cpuT = setTimeout(() => { M.cpuT = null; if (M) flip(y); }, E.thinkMs(M.level));
  }, E.thinkMs(M.level));
}

function finish(){
  if (!M) return;
  const order = M.seats.map((s, i) => ({ s, i })).sort((a, b) => b.s.pts - a.s.pts);
  const top = order[0];
  const tie = order.length > 1 && order[1].s.pts === top.s.pts;
  const meIdx = M.seats.findIndex(s => !s.cpu);
  const iWon = !tie && meIdx >= 0 && top.i === meIdx;
  if (meIdx >= 0 && window.KARTI_XP && KARTI_XP.awardPlay){
    try { KARTI_XP.awardPlay({ game:'pari', won:iWon, draw:tie, id:M.mid, ranked:false }); } catch(e){}
  }
  /* only if a person was at the table — a machines-only board is a demo,
     and a demo has no business writing a loss into somebody's record */
  if (meIdx >= 0) try { P.record('pari', tie ? 'd' : iWon ? 'w' : 'l'); } catch(e){}
  P.ui.result(M.ctx, {
    tone: tie ? 'draw' : iWon ? 'win' : 'lose',
    head: tie ? T('Dead heat','Indaqs')
        : (top.i === meIdx ? T('You win','Rebaħt') : esc(top.s.name) + T(' takes it',' jirbaħ')),
    why: M.seats.map(s => esc(s.name) + ' ' + s.pts).join('  ·  '),
    quip: iWon ? T('You were watching. Well done.','Kont qed tara. Prosit.')
        : T('It remembered the one you forgot.','Ftakret dik li nsejt int.'),
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
    if (n > E.MAX_SEATS) return { ok:false, why:T('Up to four can play.','Sa erbgħa jistgħu jilagħbu.') };
    return { ok:true, why:'' };
  },
  rulesHTML: () => '<p>' + [
    T('Turn two cards. If they match you keep the pair and go again.',
      'Aqleb żewġ karti. Jekk jaqblu żżomm il-par u terġa\' tmiss.'),
    T('If they do not, they turn back and it is the next player.',
      'Jekk le, jerġgħu jinqalbu u jmiss lil ta\' warajk.'),
    T('A run keeps going, so half the board can go in one turn — everybody watches and nobody can stop it.',
      'Serje tibqa\' sejra, mela nofs il-bord jista\' jitlaq f\'dawra waħda — kulħadd jara u ħadd ma jista\' jwaqqfek.'),
    T('The machine forgets the oldest card first, like a person. On the easy setting it also misremembers.',
      'Il-magna tinsa l-eqdem karta l-ewwel, bħal bniedem. Fil-livell faċli titħawwad ukoll.')
  ].join('</p><p>') + '</p>',
  blurb: T('Turn two. Match and go again.','Aqleb tnejn. Jaqblu u terġa\' tmiss.'),
  start(seats, o){ const p = prefs(); start(seats, lvl(o), p.size); return { v:1, gid:'pari' }; },
  levels: E.BANDS.map(b => ({ k:b.k, name:b.name }))
};

const TILE = {
  id:'pari', order:21, kind:'board', cat:'party',
  name:'Pari', mt:'Pari', icon:'cards', status:'live',
  get tag(){ return T('Turn two, match and go again — a good run takes half the board while everybody watches. The machine forgets its oldest card first, the way a person does, so it is beatable.',
    'Aqleb tnejn, jaqblu u terġa\' tmiss — serje tajba tieħu nofs il-bord waqt li kulħadd jara. Il-magna tinsa l-eqdem karta, bħal bniedem, mela tista\' tegħlibha.'); },
  open: () => setupSheet(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: LOBBY.levels,
  rulesHTML: () => LOBBY.rulesHTML(),
  /* forward the OPTIONS too — IR-RAKKONT names the difficulty here */
  start: (list, o) => LOBBY.start(list, o)
};

const R = (window.KARTI_PARI_UI = {});
R.shelfTile = TILE; R.lobby = LOBBY;
R.ui = { open:setupSheet, leave, injectCSS };
R.open = () => setupSheet();
R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

if (/[?&]paritest\b/.test(location.search || '')){
  window.__PARI_TEST = {
    setupSheet, start, flip, finish, leave,
    get M(){ return M; }, engine:E, TILE, LOBBY
  };
}

})();
