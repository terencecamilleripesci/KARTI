/* ═══════════════════════════════════════════════════════════════════
   KARTI — falz-ui.js
   L-ARTIST FALZ — everybody adds one stroke to the same drawing, and
   one of them was never told what it is.

   THE FAKE'S PROBLEM IS THE GAME. Draw nothing and you are obvious.
   Draw something confident and you are probably drawing the wrong
   thing. The only way through is to wait, read what the others have
   put down, and add the least committal line that still looks like
   it belongs — which is a genuinely hard thing to do under a table's
   worth of eyes.

   THE REAL ARTISTS HAVE THE OPPOSITE PROBLEM, and it is the half
   people miss: draw it well and the fake simply copies you. So the
   good move is to draw something that proves you know WITHOUT
   teaching the fake anything. That tension is why this format has
   outlived every clone of it.

   ONE STROKE EACH, TWO ROUNDS. Enough marks that a picture appears,
   few enough that every single one is a decision. Unlimited drawing
   turns it into Tpinġija with extra steps.

   NO MACHINE, for the same reason Tpinġija has none: it cannot draw,
   and a fake artist who cannot draw is not a player, it is a prop.
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
const SEATCOL = ['#FFC542', '#4FB6FF', '#3DDC84', '#FF5468', '#C08BFF', '#FF9F45', '#7FE8D0', '#FFB3C7'];

const MIN_SEATS = 4, MAX_SEATS = 8;      /* under four, the vote is a coin toss */
const PASSES    = 2;                      /* strokes each                       */
const PT_CATCH  = 2;                      /* a voter who fingered the fake      */
const PT_HIDE   = 3;                      /* the fake, never caught             */
const PT_ESCAPE = 2;                      /* caught, but named the word         */

let M = null;

let cssIn = false;
function injectCSS(){
  if (cssIn) return; cssIn = true;
  const st = document.createElement('style');
  st.id = 'falz-css';
  st.textContent = (`
.fz-wrap{display:flex;flex-direction:column;gap:8px;height:100%;padding:2px 0}
.fz-pad{position:relative;flex:1 1 auto;min-height:200px;border-radius:14px;
  background:#141024;border:1px solid rgba(255,255,255,.12);overflow:hidden}
.fz-pad canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.fz-note{font-size:12px;color:var(--dim);text-align:center;min-height:1.3em;font-weight:700}
.fz-role{font-family:var(--disp);font-weight:900;font-size:24px;text-align:center;letter-spacing:.03em}
.fz-role.fake{color:#FF5468}
.fz-role.real{color:var(--gold)}
.fz-pass{text-align:center;padding:20px 12px;display:grid;place-items:center;gap:10px;flex:1 1 auto}
.fz-pass h3{font-family:var(--disp);font-size:22px;margin:0}
.fz-pass p{color:var(--dim);font-size:13px;margin:0;max-width:32ch;line-height:1.5}
.fz-big{min-height:52px;padding:10px 26px;border-radius:14px;font:inherit;font-size:15px;
  font-weight:900;cursor:pointer;color:#0F0A1C;background:var(--gold);border:0}
.fz-tools{display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap;flex:0 0 auto}
.fz-tool{min-height:32px;padding:5px 12px;border-radius:9px;font:inherit;font-size:12px;
  font-weight:800;cursor:pointer;color:var(--ink);background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.14)}
.fz-tool[disabled]{opacity:.4;cursor:default}
.fz-votes{display:flex;flex-direction:column;gap:7px;flex:0 0 auto}
.fz-vote{width:100%;min-height:46px;border-radius:12px;padding:8px 14px;text-align:left;
  font:inherit;font-size:15px;font-weight:800;color:var(--ink);cursor:pointer;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);
  display:flex;align-items:center;gap:9px}
.fz-vote i{width:11px;height:11px;border-radius:50%;display:block;flex:0 0 auto}
.fz-vote.out{opacity:.35;cursor:default}
.fz-score{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;flex:0 0 auto}
.fz-chip{display:flex;align-items:center;gap:6px;padding:4px 9px;border-radius:99px;
  background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.10);font-size:12px;font-weight:800}
.fz-chip i{width:9px;height:9px;border-radius:50%;display:block}
.fz-chip.turn{border-color:var(--gold);background:rgba(255,197,66,.14)}
.fz-chip .pts{color:var(--dim);font-variant-numeric:tabular-nums}
`).replace(/^\.fz/gm, '#scr-party .fz');
  document.head.appendChild(st);
}

function setupSheet(){
  injectCSS();
  P.ui.setup({
    id:'falz',
    title:T('L-Artist Falz','L-Artist Falz'),
    sub:T('One of you is faking it','Wieħed minnkom qed jivvinta'),
    blurb:T('Everybody draws one line of the same picture. One of you was never told what it is — find them.',
            'Kulħadd jipponġi linja waħda tal-istess stampa. Wieħed minnkom qatt ma qalulu x\'inhi — sibuh.'),
    levels: [],
    onBack: () => P.hub(),
    onStart: (o) => start((o && o.seats) || null)
  });
}

function start(seatList){
  injectCSS();
  const seats = [];
  const list = (seatList && seatList.length >= MIN_SEATS) ? seatList : [{}, {}, {}, {}];
  list.forEach((s, i) => seats.push({
    name: (s && s.name) || T('Player','Plejer') + ' ' + (i + 1), pts:0, vote:-1
  }));
  const word = G.words(null, 4);
  M = {
    seats, ctx:null, pad:null, cv:null,
    word: word[0], decoys: word,
    fake: Math.floor(Math.random() * seats.length),
    seen: 0, turn: 0, laid: 0, voter: 0,
    strokes: [], mid:'falz-' + Date.now()
  };
  openBoard();
  passTo(T('Hand the phone to ','Għaddi t-telefon lil ') + M.seats[0].name,
         T('Everybody gets a look, one at a time. Nobody else watches the screen.',
           'Kulħadd iħares, wieħed wieħed. Ħadd ma jħares fuq l-iskrin.'),
         T('I have it',"Għandi jien"), showRole);
}

function openBoard(){
  M.ctx = P.ui.frame({
    title:T('L-Artist Falz','L-Artist Falz'),
    onBack: () => { leave(); P.hub(); },
    leave, buttons: []
  });
  const b = M.ctx.board;
  b.style.cssText = 'display:block;grid-template-columns:none;grid-template-rows:none;' +
    'width:100%;max-width:520px;border:0;box-shadow:none;overflow:visible;background:transparent';
}

function scoreRow(active){
  return '<div class="fz-score">' + M.seats.map((s, i) =>
    '<span class="fz-chip' + (i === active ? ' turn' : '') + '">' +
      '<i style="background:' + SEATCOL[i % SEATCOL.length] + '"></i>' + esc(s.name) +
      ' <span class="pts">' + s.pts + '</span></span>').join('') + '</div>';
}

function passTo(head, sub, btn, go, active){
  M.ctx.board.innerHTML =
    '<div class="fz-wrap"><div class="fz-pass">' +
      '<h3>' + esc(head) + '</h3><p>' + esc(sub) + '</p>' +
      '<button class="fz-big" id="fz-go">' + esc(btn) + '</button>' +
    '</div>' + scoreRow(active) + '</div>';
  M.ctx.board.querySelector('#fz-go').onclick = go;
}

/* ── phase 1: everyone learns who they are ─────────────────────── */
function showRole(){
  const i = M.seen;
  const isFake = i === M.fake;
  const L = lang();
  M.ctx.board.innerHTML =
    '<div class="fz-wrap"><div class="fz-pass">' +
      '<div class="fz-role ' + (isFake ? 'fake' : 'real') + '">' +
        (isFake ? T('YOU ARE THE FAKE','INT IL-FALZ') : esc(L === 'mt' ? M.word.mt : M.word.en)) +
      '</div>' +
      '<p>' + esc(isFake
        ? T('You were not told the word. Draw a line that looks like it belongs, and work out what everyone else is drawing.',
            'Ma qalulekx il-kelma. Pinġi linja li tidher li tagħmel sens, u ipprova aqta\' x\'qed jipponġu l-oħrajn.')
        : T('This is the word. Draw one line that proves you know it — without teaching the fake what it is.',
            'Din hi l-kelma. Pinġi linja waħda li turi li taf — bla ma tgħallem lill-falz x\'inhi.')) + '</p>' +
      '<button class="fz-big" id="fz-go">' + T('Got it','Fhimt') + '</button>' +
    '</div>' + scoreRow(i) + '</div>';
  M.ctx.board.querySelector('#fz-go').onclick = () => {
    M.seen++;
    if (M.seen < M.seats.length){
      passTo(T('Hand the phone to ','Għaddi t-telefon lil ') + M.seats[M.seen].name,
             T('Nobody else look.','Ħadd ma jħares.'),
             T('I have it',"Għandi jien"), showRole, M.seen);
    } else {
      M.turn = 0;
      passTo(T('Hand it to ','Għaddih lil ') + M.seats[0].name,
             T('One line each. Everybody can watch this part.',
               'Linja waħda kull wieħed. Kulħadd jista\' jħares issa.'),
             T('Draw','Pinġi'), drawTurn, 0);
    }
  };
}

/* ── phase 2: one stroke each, twice round ─────────────────────── */
function drawTurn(){
  const seat = M.seats[M.turn];
  M.ctx.board.innerHTML =
    '<div class="fz-wrap">' +
      '<div class="fz-note">' + esc(seat.name) + T(' — one line',' — linja waħda') +
        '  ·  ' + T('pass ','dawra ') + (Math.floor(M.laid / M.seats.length) + 1) + '/' + PASSES + '</div>' +
      '<div class="fz-pad"><canvas id="fz-cv"></canvas></div>' +
      '<div class="fz-tools">' +
        '<button class="fz-tool" id="fz-undo">' + T('Undo my line','Neħħi tiegħi') + '</button>' +
        '<button class="fz-tool" id="fz-done" disabled>' + T('Done','Lest') + '</button>' +
      '</div>' +
      scoreRow(M.turn) +
    '</div>';
  M.cv = M.ctx.board.querySelector('#fz-cv');
  const before = M.strokes.length;
  const done = M.ctx.board.querySelector('#fz-done');
  const undo = M.ctx.board.querySelector('#fz-undo');
  M.pad = G.make(M.cv, {
    /* ONE LINE MEANS ONE LINE. The pad is switched off the moment a
       stroke lands, so a player cannot quietly add three. */
    onStroke: n => { if (n > before){ M.pad.enable(false); done.disabled = false; } }
  });
  M.pad.strokes = M.strokes.slice();
  M.pad.ink(SEATCOL[M.turn % SEATCOL.length]);
  undo.onclick = () => {
    if (M.pad.count() > before){ M.pad.undo(); M.pad.enable(true); done.disabled = true; }
  };
  done.onclick = () => {
    M.strokes = M.pad.strokes.slice();
    try { M.pad.stop(); } catch(e){}
    M.laid++;
    M.turn = (M.turn + 1) % M.seats.length;
    if (M.laid >= M.seats.length * PASSES) return startVote();
    passTo(T('Hand it to ','Għaddih lil ') + M.seats[M.turn].name,
           T('One line each.','Linja waħda kull wieħed.'),
           T('Draw','Pinġi'), drawTurn, M.turn);
  };
}

/* ── phase 3: the vote ─────────────────────────────────────────── */
function startVote(){
  M.voter = 0;
  passTo(T('Hand it to ','Għaddih lil ') + M.seats[0].name,
         T('Look at the picture. Who never knew the word?',
           'Ħares lejn l-istampa. Min qatt ma kien jaf il-kelma?'),
         T('Vote','Ivvota'), voteTurn, 0);
}

function voteTurn(){
  const seat = M.seats[M.voter];
  M.ctx.board.innerHTML =
    '<div class="fz-wrap">' +
      '<div class="fz-note">' + esc(seat.name) + T(' — who is faking?',' — min qed jivvinta?') + '</div>' +
      '<div class="fz-pad"><canvas id="fz-cv2"></canvas></div>' +
      '<div class="fz-votes" id="fz-votes"></div>' +
      scoreRow(M.voter) +
    '</div>';
  const view = G.make(M.ctx.board.querySelector('#fz-cv2'));
  view.enable(false);
  view.strokes = M.strokes.slice();
  M.view = view;
  const box = M.ctx.board.querySelector('#fz-votes');
  box.innerHTML = M.seats.map((s, i) =>
    '<button class="fz-vote' + (i === M.voter ? ' out' : '') + '" data-i="' + i + '"' +
      (i === M.voter ? ' disabled' : '') + '>' +
      '<i style="background:' + SEATCOL[i % SEATCOL.length] + '"></i>' + esc(s.name) +
      (i === M.voter ? T(' (you)',' (int)') : '') + '</button>').join('');
  box.querySelectorAll('.fz-vote').forEach(b => b.onclick = () => {
    seat.vote = +b.dataset.i;
    try { view.stop(); } catch(e){}
    M.voter++;
    if (M.voter < M.seats.length){
      passTo(T('Hand it to ','Għaddih lil ') + M.seats[M.voter].name,
             T('Your turn to vote.','Imissek tivvota.'),
             T('Vote','Ivvota'), voteTurn, M.voter);
    } else tally();
  });
}

/* ── phase 4: the reckoning ────────────────────────────────────── */
function tally(){
  const counts = M.seats.map(() => 0);
  M.seats.forEach(s => { if (s.vote >= 0) counts[s.vote]++; });
  const most = Math.max.apply(null, counts);
  const accused = counts.indexOf(most);
  const split = counts.filter(c => c === most).length > 1;
  const caught = !split && accused === M.fake;

  if (!caught){
    M.seats[M.fake].pts += PT_HIDE;
    return reveal(caught, split, null);
  }
  /* CAUGHT, BUT NOT NECESSARILY BEATEN. The fake gets one guess at the
     word, because a fake who worked it out from everybody else's lines
     has done the hard half of the job and deserves something for it. */
  M.seats.forEach((s, i) => { if (i !== M.fake && s.vote === M.fake) s.pts += PT_CATCH; });
  const L = lang();
  const opts = M.decoys.slice();
  for (let i = opts.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const t = opts[i]; opts[i] = opts[j]; opts[j] = t;
  }
  M.ctx.board.innerHTML =
    '<div class="fz-wrap"><div class="fz-pass">' +
      '<h3>' + esc(M.seats[M.fake].name) + T(' was the fake',' kien il-falz') + '</h3>' +
      '<p>' + T('Caught. One guess at the word — get it and you still score.',
                'Inqbadt. Tbassira waħda — jekk taqtagħha xorta tieħu punti.') + '</p>' +
      '<div class="fz-votes" id="fz-guess"></div>' +
    '</div>' + scoreRow(M.fake) + '</div>';
  const g = M.ctx.board.querySelector('#fz-guess');
  g.innerHTML = opts.map((w, i) =>
    '<button class="fz-vote" data-i="' + i + '">' + esc(L === 'mt' ? w.mt : w.en) + '</button>').join('');
  g.querySelectorAll('.fz-vote').forEach(b => b.onclick = () => {
    const ok = opts[+b.dataset.i] === M.word;
    if (ok) M.seats[M.fake].pts += PT_ESCAPE;
    reveal(true, false, ok);
  });
}

function reveal(caught, split, escaped){
  const L = lang();
  const word = L === 'mt' ? M.word.mt : M.word.en;
  const fake = M.seats[M.fake].name;
  const head = caught
    ? (escaped ? T('Caught — and got the word','Inqbad — u qatagħha')
               : T('The fake is caught','Il-falz inqabad'))
    : (split ? T('The vote split — the fake walks','Il-voti nqasmu — il-falz ħeles')
             : T('The fake got away','Il-falz ħarab'));

  if (window.KARTI_XP && KARTI_XP.awardPlay){
    try { KARTI_XP.awardPlay({ game:'falz', won:true, draw:false, id:M.mid, ranked:false }); } catch(e){}
  }
  try { P.record('falz', 'w'); } catch(e){}

  P.ui.result(M.ctx, {
    tone: caught && !escaped ? 'win' : 'lose',
    head: head,
    why: T('It was ','Kienet ') + word + '  ·  ' + T('the fake was ','il-falz kien ') + fake +
         '  ·  ' + M.seats.map(s => esc(s.name) + ' ' + s.pts).join('  ·  '),
    quip: caught
      ? T('The line that gave it away was the careful one.','Il-linja li kixfitu kienet dik bil-galbu.')
      : T('Somebody drew that with no idea what it was.','Xi ħadd pinġa dik bla ma jaf x\'inhi.'),
    buttons:[
      { label:T('Play again',"Erġa' lgħab"), icon:'refresh', cls:'primary', go:() => { leave(); setupSheet(); } },
      { label:T('Leave','Oħroġ'), icon:'back', cls:'ghost', go:() => { leave(); P.hub(); } }
    ]
  });
}

function leave(){
  if (M){
    if (M.pad) try { M.pad.stop(); } catch(e){}
    if (M.view) try { M.view.stop(); } catch(e){}
  }
  M = null;
}

const LOBBY = {
  canStart(list){
    const n = (list || []).length;
    if (n < MIN_SEATS) return { ok:false, why:T('L-Artist Falz needs four — with three the vote is a coin toss.','L-Artist Falz irid erbgħa — bi tlieta l-vot huwa ċifra u parti.') };
    if (n > MAX_SEATS) return { ok:false, why:T('Up to eight can play.','Sa tmienja jistgħu jilagħbu.') };
    return { ok:true, why:'' };
  },
  rulesHTML: () => '<p>' + [
    T('Everybody is shown the same word — except one of you, who is only told they are the fake.',
      'Kulħadd jara l-istess kelma — ħlief wieħed, li jingħad biss li hu l-falz.'),
    T('Passing the phone round, each player adds ONE line to the same picture. Twice round.',
      'Jgħaddi t-telefon, u kull wieħed iżid LINJA waħda mal-istess stampa. Darbtejn.'),
    T('Then everybody votes for who they think never knew the word.',
      'Imbagħad kulħadd jivvota għal min jaħseb li qatt ma kien jaf il-kelma.'),
    T('Catch the fake and the voters who named them score 2. Miss, or split the vote, and the fake takes 3.',
      'Aqbdu l-falz u min semmieh jieħu 2. Jekk taqbduhx, jew jinqasmu l-voti, il-falz jieħu 3.'),
    T('Caught, the fake still gets one guess at the word — work it out from everyone else and score anyway.',
      'Jekk jinqabad, il-falz xorta jieħu tbassira waħda — aqtagħha mill-oħrajn u xorta tieħu punti.')
  ].join('</p><p>') + '</p>',
  blurb: T('One of you never knew the word.','Wieħed minnkom qatt ma kien jaf il-kelma.'),
  start(seats){ start(seats); return { v:1, gid:'falz' }; },
  levels: []
};

const TILE = {
  id:'falz', order:18, kind:'board', cat:'party',
  name:'L-Artist Falz', mt:'L-Artist Falz', icon:'pencil', status:'live',
  get tag(){ return T('Everybody adds one line to the same drawing, but one of you was never told what it is. Draw well and the fake copies you; draw badly and you look like the fake. Four to eight.',
    'Kulħadd iżid linja mal-istess tpinġija, imma wieħed minnkom qatt ma qalulu x\'inhi. Tipponġi tajjeb u l-falz jikkupjak; tipponġi ħażin u tidher int il-falz. Erbgħa sa tmienja.'); },
  open: () => setupSheet(),
  seats: { min:MIN_SEATS, max:MAX_SEATS },
  levels: [],
  rulesHTML: () => LOBBY.rulesHTML(),
  start: (list) => LOBBY.start(list)
};

const R = (window.KARTI_FALZ_UI = {});
R.shelfTile = TILE; R.lobby = LOBBY;
R.ui = { open:setupSheet, leave, injectCSS };
R.open = () => setupSheet();
R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

if (/[?&]falztest\b/.test(location.search || '')){
  window.__FALZ_TEST = {
    setupSheet, start, showRole, drawTurn, startVote, voteTurn, tally, reveal, leave,
    get M(){ return M; }, pinga:G, TILE, LOBBY
  };
}

})();
