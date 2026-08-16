/* ═══════════════════════════════════════════════════════════════════
   KARTI — battleship-ui.js   ·   PARTY GAMES: GĦARRAQHOM! — the screen

   Everything the player sees and taps. The rules live in
   js/battleship.js (window.KARTI_BSHIP) and are not repeated here;
   this file draws the engine's state, feeds taps into apply(), and
   paces the engine's event list into theatre — the card flip that
   every phone shows together, the shells landing one by one, the
   boat going down.

   THE HOUSE PATTERNS THIS FILE FOLLOWS
     · mounts inside #scr-party via KARTI_PARTY.ui.screenEl(), the way
       chess/dama/tombla do. Own CSS, injected once, all scoped under
       #scr-party .bs-*. Reuses the party kit's .tbar/.pt-turn/.pt-over
       so a result card here looks like a result card everywhere.
     · offline games survive anything: the state is snapshotted to its
       own localStorage key after every move and on visibilitychange /
       pagehide, and offered back as "carry on" from the setup sheet.
     · online it registers KARTI_PARTY.online.gharraq (start / remote /
       note / stop / live / hooks) and publishes the lobby contract on
       window.KARTI_GHARRAQ.lobby — the same two halves tombla ships.
       js/mp.js does the sockets; this file never sees one.
     · sounds only through js/sfx.js ids that already exist. No new
       audio files are referenced anywhere in here.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const P = window.KARTI_PARTY;
const E = window.KARTI_BSHIP;
if (!P || !E) return;
const K = window.KARTI;
const U = P.ui, esc = U.esc, ico = U.ico;
const SFX = () => window.KARTI_SFX || null;
const sfx = (id, o) => { const S = SFX(); if (S && S.play) try { S.play(id, o); } catch(e){} };
const note = (n, o) => { const S = SFX(); if (S && S.note) try { S.note(n, o); } catch(e){} };

const GID = 'gharraq';
const TITLE = 'GĦARRAQHOM!';
const SAVE_KEY = 'karti_gharraq_v1';

const LEVELS = [
  { k:1, name:'It-Turist tal-Lido', note:'Shoots where the sun is nice.', icon:'diff-1' },
  { k:2, name:'Tal-Moll',           note:'Finds a boat and finishes it.', icon:'diff-2' },
  { k:3, name:'Il-Kaptan',          note:'Counts every square your boats could hide in.', icon:'diff-3' }
];

const QUIP_WIN = [
  'Their whole fleet on the seabed and yours still smelling of paint.',
  'Somebody phone the salvage tug. Not for you.',
  'That is how you clear a harbour.'
];
const QUIP_LOSE = [
  'Straight to the bottom, kollox. The fish are living well tonight.',
  'You parked the Vapur where everybody parks it. Everybody knows.',
  'Spara ’l baħar, they said. You heard them and did it anyway.'
];

/* ═══════════════════════════════════════════════════════════════════
   1 · STATE
   G is the whole UI: the match, whose phone this is, what is being
   aimed, and the event queue being animated.
   ═══════════════════════════════════════════════════════════════════ */
let G = null;
/* G = { st, mode:'ai'|'pnp'|'online', mySeat, seatOf():int (whose hand
   holds the phone right now), net, root, els, view:'them'|'mine',
   target:int, aim:{c,o,x,picked[]}, q:[], busy, dead, curtain } */

let moveSubs = [];          /* hooks.onMove listeners (js/mp.js) */

function localSeat(){
  /* whose hand is on the glass: online/ai it is fixed; pass-the-phone
     it is whichever local human the turn (or placement) points at */
  if (!G) return 0;
  if (G.mode !== 'pnp') return G.mySeat;
  if (G.stage === 'place') return G.placing;
  return G.st.turn;
}
function myTurn(){
  return !!(G && G.st.phase === 'play' && !G.busy && !G.dead &&
            G.st.seats[G.st.turn] && G.st.seats[G.st.turn].kind === 'human' &&
            (G.mode === 'pnp' ? true : G.st.turn === G.mySeat));
}

/* ── offline save ─────────────────────────────────────────────────── */
function saveGame(){
  if (!G || G.dead || G.mode === 'online') return;
  if (!G.st || G.st.phase === 'done'){ clearSave(); return; }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v:1, at: Date.now(), mode: G.mode, mySeat: G.mySeat,
      stage: G.stage, placing: G.placing, snap: E.snapshot(G.st)
    }));
  } catch(e){}
}
function loadSave(){
  try {
    const j = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!j || j.v !== 1 || !j.snap) return null;
    if (j.mode !== 'ai' && j.mode !== 'pnp') return null;
    return j;
  } catch(e){ return null; }
}
function clearSave(){ try { localStorage.removeItem(SAVE_KEY); } catch(e){} }
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
window.addEventListener('pagehide', () => saveGame());

/* ── one local PRNG for shuffle buttons (never the shared stream) ── */
let uiRng = { rng: (Date.now() ^ 0x5DEECE66) >>> 0 };

/* ═══════════════════════════════════════════════════════════════════
   2 · APPLY — the single local door, mirroring the engine's.
   Every tap-made move goes through here: engine first, then the wire
   (via hooks.onMove for js/mp.js), then the save, then the theatre.
   ═══════════════════════════════════════════════════════════════════ */
function localApply(seat, mv){
  if (!G) return { ok:false };
  const r = E.apply(G.st, seat, mv);
  if (!r.ok){
    if (r.desync && G.mode === 'online' && G.net){
      G.net.bail ? G.net.bail('drift') : 0;
      return r;
    }
    if (r.why && K && K.toast) K.toast('⚠ ' + r.why);
    return r;
  }
  if (r.stale) return r;
  /* the wire: js/mp.js forwards everything whose src is not net */
  for (const f of moveSubs.slice()) try { f(mv, { seat, src:'local' }); } catch(e){}
  saveGame();
  enqueue(r.ev);
  return r;
}
function netApply(seat, mv){
  if (!G) return { ok:false, why:'no battle on this phone' };
  const r = E.apply(G.st, seat, mv);
  if (!r.ok) return r;
  if (!r.stale) enqueue(r.ev);
  return { ok:true };
}

/* ═══════════════════════════════════════════════════════════════════
   3 · THE THEATRE — the event queue.
   The engine resolves instantly; this queue is what makes a machine
   turn read as a turn and a card flip read as an occasion. Everything
   lands through here, local and remote alike, so every phone paces
   the same story.
   ═══════════════════════════════════════════════════════════════════ */
function enqueue(ev){
  if (!G) return;
  for (const e of ev || []) G.q.push(e);
  pump();
}
function pump(){
  if (!G || G.busy || !G.q.length){ if (G && !G.busy) idle(); return; }
  const e = G.q.shift();
  G.busy = true;
  const done = ms => setTimeout(() => { if (!G) return; G.busy = false; pump(); }, ms || 0);
  try { act(e, done); } catch(err){ done(0); }
}
function idle(){
  /* queue drained: settle the screen for whoever should act now */
  if (!G || G.dead) return;
  if (G.st.phase === 'done') return;
  if (G.stage === 'place'){ paintPlace(); return; }
  if (G.st.phase === 'play' && G.mode === 'pnp' && G.st.seats[G.st.turn].kind === 'human' && G.needCurtain){
    G.needCurtain = false;
    curtain(G.st.seats[G.st.turn].name, () => paintBoard());
    return;
  }
  paintBoard();
}

function act(e, done){
  switch (e.e){
    case 'phase':
      if (e.phase === 'play'){ G.stage = 'board'; paintBoard(); }
      return done(250);
    case 'placed': {
      if (G.stage === 'place' && G.mode !== 'pnp') paintPlaceWait();
      return done(120);
    }
    case 'draw': return reveal(e, done);
    case 'turn': {
      if (G.mode === 'pnp' && G.st.seats[e.s] && G.st.seats[e.s].kind === 'human') G.needCurtain = true;
      if (G.st.phase === 'play' && myTurnSeat(e.s)) sfx('duel.turn', { gain:0.5 });
      G.target = pickTarget();
      G.aim = null;
      paintBoard();
      return done(220);
    }
    case 'peek': {
      paintBoard();
      sfx('ui.toggle');
      banner((e.s === seatMe() ? 'You peeked' : nameOf(e.s) + ' peeked') + ' at ' +
             E.cellName(e.c) + ' — ' + (e.hit ? 'SOMETHING IS THERE.' : 'splash.'),
             e.hit ? 'hot' : '');
      if (e.hit) note(4, { gain:0.6 });
      return done(1000);
    }
    case 'sonar': {
      paintBoard();
      sfx('ui.note');
      for (let i = 0; i < Math.min(e.n, 5); i++) setTimeout(() => note(i, { gain:0.5 }), 160 * i);
      banner('SONAR on ' + nameOf(e.g) + ' around ' + E.cellName(e.c) + ': ' +
             (e.n ? e.n + ' boat square' + (e.n === 1 ? '' : 's') + ' in the box.' : 'nothing but sea.'),
             e.n ? 'hot' : '');
      return done(1500);
    }
    case 'autoplay': {
      banner('The sea plays for ' + nameOf(e.s) + ' — nobody waits forever.', '');
      return done(700);
    }
    case 'shot': return volley(e, done);
    case 'out': {
      banner(nameOf(e.s) + ' left the battle.', '');
      paintBoard();
      return done(700);
    }
    case 'end': {
      finish(e);
      return done(200);
    }
  }
  return done(0);
}
function myTurnSeat(s){
  return G.mode === 'pnp' ? true : s === G.mySeat;
}
function seatMe(){ return G.mode === 'pnp' ? G.st.turn : G.mySeat; }
function nameOf(s){ return (G.st.seats[s] && G.st.seats[s].name) || ('Seat ' + (s + 1)); }

/* ── the card reveal — the gotcha moment, on every phone at once ── */
function reveal(e, done){
  const pat = E.PATTERNS[e.p];
  paintBoard();
  const host = G.root;
  const old = host.querySelector('.bs-reveal');
  if (old) old.remove();
  const who = e.s === seatMe() && G.mode !== 'pnp' ? 'YOU DREW' :
              G.mode === 'pnp' ? nameOf(e.s).toUpperCase() + ' DRAWS' :
              nameOf(e.s).toUpperCase() + ' DREW';
  const el = document.createElement('div');
  el.className = 'bs-reveal' + (pat.big === 2 ? ' big' : pat.big === 1 ? ' mid' : '');
  el.innerHTML =
    '<div class="bs-flip"><div class="bs-cardface bs-back">' +
      '<span class="bs-crest">' + ico('cards') + '</span></div>' +
    '<div class="bs-cardface bs-front">' +
      '<span class="bs-who">' + esc(who) + '</span>' +
      '<b class="bs-pname">' + esc(pat.name) + '</b>' +
      '<span class="bs-pmt">' + esc(pat.mt) + '</span>' +
      diagram(e.p) +
      '<span class="bs-phow">' + esc(pat.how) + '</span>' +
    '</div></div>';
  host.appendChild(el);
  if (pat.big === 2){ sfx('pack.charge'); setTimeout(() => sfx('duel.boss'), 620); }
  else if (pat.big === 1){ sfx('pack.flip'); setTimeout(() => note(3, { gain:0.55 }), 260); }
  else sfx('pack.flip');
  const hold = pat.big === 2 ? 2500 : pat.big === 1 ? 1900 : 1500;
  setTimeout(() => { if (el.isConnected) el.classList.add('bye'); }, hold - 260);
  setTimeout(() => { if (el.isConnected) el.remove(); paintBoard(); }, hold);
  done(hold);
}

/* a little pattern diagram on the card face */
function diagram(p){
  const cells = {};
  let n = 7, label = '';
  if (p === E.P.XITA){ label = '? ? ?'; }
  else if (p === E.P.BAHAR){ label = '?'; }
  else if (p === E.P.SONAR){ for (const c of E.box9(E.AT(3, 3))) cells[c] = 2; }
  else if (p === E.P.GRANATA){ for (const c of E.box9(E.AT(3, 3))) cells[c] = 2; }
  else if (p === E.P.LINJA){ n = 7; for (let i = 0; i < 7; i++) cells[E.AT(i, 3)] = 1; }
  else if (p === E.P.PAR){ cells[E.AT(1, 2)] = 1; cells[E.AT(5, 4)] = 1; }
  else if (p === E.P.SNAJPER){ cells[E.AT(3, 3)] = 3; }
  else {
    for (const c of E.geomCells(p, E.AT(3, 3), 0)) cells[c] = 1;
  }
  let out = '<span class="bs-diag' + (label ? ' lbl' : '') + '">';
  if (label) out += '<i>' + esc(label) + '</i>';
  else for (let y = 0; y < n; y++){
    for (let x = 0; x < n; x++){
      const v = cells[E.AT(x, y)] || 0;
      out += '<u class="' + (v === 1 ? 'on' : v === 2 ? 'half' : v === 3 ? 'eye' : '') + '"></u>';
    }
  }
  return out + '</span>';
}

/* ── a volley landing, shell by shell ─────────────────────────────── */
function volley(e, done){
  /* always watch the grid being shot at */
  G.target = e.g;
  G.view = (G.mode !== 'pnp' && e.g === G.mySeat) ? 'mine' : 'them';
  paintBoard();
  sfx('duel.attack');
  let t = 420;
  for (let i = 0; i < e.cells.length; i++){
    const c = e.cells[i];
    setTimeout(() => {
      if (!G) return;
      markCell(e.g, c);
      if (c.r === 'hit'){ sfx('duel.hit'); }
      else if (c.r === 'miss'){ sfx('dama.place', { rate:0.8, gain:0.5 }); }
      else { sfx('ui.tap', { gain:0.3 }); }
    }, t);
    t += e.cells.length > 4 ? 170 : 260;
  }
  if (e.sunk.length){
    for (let k = 0; k < e.sunk.length; k++){
      const id = e.sunk[k];
      setTimeout(() => {
        if (!G) return;
        sfx('duel.destroy');
        banner('GĦEREQ ' + E.FLEET[id].name.toUpperCase() + ' of ' + nameOf(e.g) + '!', 'hot');
        paintBoard();
      }, t + 420 + k * 800);
    }
    t += 420 + e.sunk.length * 800;
  }
  if (e.dead !== undefined){
    setTimeout(() => {
      if (!G) return;
      sfx('board.mate');
      banner(nameOf(e.dead).toUpperCase() + ' HAS NO FLEET LEFT. GĦARRAQHOM.', 'hot');
      paintBoard();
    }, t + 500);
    t += 1300;
  }
  done(t + 420);
}
function markCell(g, c){
  /* pin one shell onto the grid on screen without a full repaint */
  const showingTarget = (G.view === 'them' && G.target === g) ||
                        (G.view === 'mine' && seatViewable() === g);
  if (!showingTarget){ return; }
  const el = G.root.querySelector('.bs-grid [data-c="' + c.c + '"]');
  if (!el) return;
  el.classList.remove('aim');
  el.classList.add(c.r === 'hit' ? 'hit' : 'miss', 'fresh');
}
function seatViewable(){ return G.mode === 'pnp' ? G.st.turn : G.mySeat; }

function banner(text, tone){
  const host = G && G.root;
  if (!host) return;
  const old = host.querySelector('.bs-banner');
  if (old) old.remove();
  const b = document.createElement('div');
  b.className = 'bs-banner' + (tone ? ' ' + tone : '');
  b.textContent = text;
  host.appendChild(b);
  setTimeout(() => { if (b.isConnected) b.classList.add('bye'); }, 1500);
  setTimeout(() => { if (b.isConnected) b.remove(); }, 1900);
}

/* ═══════════════════════════════════════════════════════════════════
   4 · SCREENS
   ═══════════════════════════════════════════════════════════════════ */
function screenRoot(){
  injectCSS();
  U.css();                      /* the party kit's own stylesheet */
  const el = U.screenEl();
  return el;
}

/* ── 4a · the setup sheet ─────────────────────────────────────────── */
function menu(){
  P.show();
  const el = screenRoot();
  const pref = P.pref(GID);
  const sv = loadSave();
  let mode = pref.gmode === 'klassika' ? 'klassika' : 'karti';
  let who = (pref.mode === 'ai' || pref.mode === 'pnp' || pref.mode === 'online') ? pref.mode : 'online';
  const M = window.KARTI_MP;
  const canOnline = !!(M && M.openFor);
  const relayDown = !!(M && M.PR && M.PR.tried && M.PR.err);
  if (who === 'online' && (!canOnline || relayDown)) who = 'ai';
  let level = String(pref.level || 2);
  let foes = String(pref.foes || 1);
  const r = P.recOf(GID);

  el.innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="pt-back" aria-label="Back to party games">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + TITLE + '</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<p class="blurb">Five boats each, hidden on your own sea. Take turns shelling ' +
      'each other’s grid until one fleet is still floating. In <b>KARTI TAL-KANUN</b> ' +
      'every turn starts with a shot card drawn in front of the whole table — the card ' +
      'decides how you fire, and everybody sees what you drew. No lying at this table.</p>' +
      (sv ? '<div class="pt-opts" style="margin-bottom:2px">' +
              '<button class="pt-opt" id="bs-resume">' + ico('play') +
              '<b>Carry on with the saved battle</b><i>' +
              (sv.mode === 'ai' ? 'You vs the phone' : 'Pass the phone') + ' — left mid-fight.</i></button>' +
            '</div>' : '') +
      '<div class="tiny pt-lbl">The game</div>' +
      '<div class="pt-opts two" id="bs-gmode">' +
        '<button class="pt-opt" data-v="karti">' + ico('cards') +
          '<b>Karti tal-Kanun</b><i>Draw a shot card every turn. The fun one.</i></button>' +
        '<button class="pt-opt" data-v="klassika">' + ico('shield') +
          '<b>Klassika</b><i>One shell a turn, nerves of steel.</i></button>' +
      '</div>' +
      '<div class="tiny pt-lbl">Who is playing</div>' +
      '<div class="pt-opts" id="bs-who">' +
        (canOnline ? '<button class="pt-opt" data-v="online">' + ico('users') +
          '<b>The table, online</b><i>Two to six phones, everyone on their own sea.</i></button>' : '') +
        '<button class="pt-opt" data-v="ai">' + ico('coach') +
          '<b>You vs the phone</b><i>It has sunk better sailors than you.</i></button>' +
        '<button class="pt-opt sub" data-v="pnp">' + ico('users') +
          '<b>Pass the phone</b><i>Two of you, one screen, no peeking.</i></button>' +
      '</div>' +
      (relayDown ? '<p class="pt-warn">The KARTI server cannot be reached from this phone right now. ' +
        '<b>If Tailscale is on, turn it off.</b> The phone and pass-the-phone work with no internet.</p>' : '') +
      '<div id="bs-aibits">' +
        '<div class="tiny pt-lbl">How hard</div>' +
        '<div class="pt-opts" id="bs-lvl">' +
          LEVELS.map(l => '<button class="pt-opt" data-v="' + l.k + '">' + ico(l.icon) +
            '<b>' + esc(l.name) + '</b><i>' + esc(l.note) + '</i></button>').join('') +
        '</div>' +
        '<div class="tiny pt-lbl">How many machines against you</div>' +
        '<div class="pt-opts two" id="bs-foes">' +
          '<button class="pt-opt" data-v="1">' + ico('coach') + '<b>One</b><i>A duel.</i></button>' +
          '<button class="pt-opt" data-v="2">' + ico('users') + '<b>Two</b><i>A brawl.</i></button>' +
        '</div>' +
      '</div>' +
      (r.w + r.l + r.d ? '<p class="pt-ledger">Against the phone so far: <b>' + r.w + '</b> won, <b>' +
        r.l + '</b> lost.</p>' : '') +
      '<div style="height:8px"></div>' +
    '</div>' +
    '<div class="pt-startbar"><button class="btn primary" id="bs-start"></button></div>';

  const sync = () => {
    el.querySelectorAll('#bs-gmode .pt-opt').forEach(b => b.classList.toggle('on', b.dataset.v === mode));
    el.querySelectorAll('#bs-who .pt-opt').forEach(b => b.classList.toggle('on', b.dataset.v === who));
    el.querySelectorAll('#bs-lvl .pt-opt').forEach(b => b.classList.toggle('on', b.dataset.v === level));
    el.querySelectorAll('#bs-foes .pt-opt').forEach(b => b.classList.toggle('on', b.dataset.v === foes));
    el.querySelector('#bs-aibits').hidden = (who !== 'ai');
    const s = el.querySelector('#bs-start');
    s.innerHTML = window.ILB ? window.ILB(who === 'online' ? 'users' : 'play',
      who === 'online' ? 'Find a table' : 'Start') : 'Start';
  };
  el.querySelectorAll('#bs-gmode .pt-opt').forEach(b => b.onclick = () => { mode = b.dataset.v; sync(); });
  el.querySelectorAll('#bs-who .pt-opt').forEach(b => b.onclick = () => { who = b.dataset.v; sync(); });
  el.querySelectorAll('#bs-lvl .pt-opt').forEach(b => b.onclick = () => { level = b.dataset.v; sync(); });
  el.querySelectorAll('#bs-foes .pt-opt').forEach(b => b.onclick = () => { foes = b.dataset.v; sync(); });
  sync();
  el.querySelector('#pt-back').onclick = () => { P.hub(); };
  const rs = el.querySelector('#bs-resume');
  if (rs) rs.onclick = () => restoreSaved();
  el.querySelector('#bs-start').onclick = () => {
    P.pref(GID, { gmode: mode, mode: who, level: +level, foes: +foes });
    if (who === 'online'){ if (M && M.openFor) M.openFor(GID); return; }
    newLocal({ gmode: mode, who, level: +level, foes: +foes });
  };
}

function restoreSaved(){
  const sv = loadSave();
  if (!sv) return menu();
  const st = E.restore(sv.snap);
  if (!st){ clearSave(); return menu(); }
  G = { st, mode: sv.mode, mySeat: sv.mySeat | 0, net: null,
        stage: sv.stage === 'place' ? 'place' : (st.phase === 'place' ? 'place' : 'board'),
        placing: sv.placing | 0, view:'them', target: -1, aim: null,
        q: [], busy: false, dead: false, needCurtain: sv.mode === 'pnp' };
  G.target = pickTarget();
  mount();
  if (G.stage === 'place') paintPlace(); else paintBoard();
}

function newLocal(o){
  clearSave();
  const seats = [];
  if (o.who === 'pnp'){
    seats.push({ name:'Captain 1', kind:'human', own:'local' });
    seats.push({ name:'Captain 2', kind:'human', own:'local' });
  } else {
    seats.push({ name: myName(), kind:'human', own:'me' });
    const NAMES = ['Il-Baħri', 'Ta’ Ġilardu', 'Il-Pirata'];
    for (let i = 0; i < Math.max(1, Math.min(3, o.foes | 0)); i++)
      seats.push({ name: NAMES[i], kind:'cpu', level: o.level | 0 || 2, own:'ai' });
  }
  const seed = (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0;
  const st = E.newMatch({ mode: o.gmode, seats, seed });
  G = { st, mode: o.who, mySeat: 0, net: null, stage:'place', placing: 0,
        view:'them', target: -1, aim: null, q: [], busy: false, dead: false,
        needCurtain: false };
  G.target = pickTarget();
  mount();
  if (o.who === 'pnp') curtain(seats[0].name, () => paintPlace());
  else paintPlace();
}

function myName(){
  try {
    const n = K && K.displayName && K.displayName();
    if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
      return String(n).trim().slice(0, 14);
  } catch(e){}
  return 'You';
}

function pickTarget(){
  if (!G) return -1;
  const me = G.mode === 'pnp' ? G.st.turn : G.mySeat;
  for (let i = 0; i < G.st.seats.length; i++)
    if (i !== me && !G.st.seats[i].out) return i;
  return -1;
}

/* ── 4b · the shared shell every game screen draws into ───────────── */
function mount(){
  P.show();
  const el = screenRoot();
  /* register our leave() with js/party.js the only way it accepts one:
     through frame(). Its DOM is thrown away on the next line, but the
     hub / MutationObserver now knows how to stop this game, which is
     what kills the theatre timers when the app navigates away. */
  try { U.frame({ title: TITLE, leave: leave, buttons: [] }); } catch(e){}
  el.innerHTML =
    '<div class="bs-wrap">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="pt-back" aria-label="Back">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + TITLE + '</h2>' +
        '<span class="pt-badge" id="bs-badge"></span>' +
      '</div>' +
      '<div class="pt-net" id="bs-net" role="status" aria-live="polite" hidden></div>' +
      '<div class="pt-turn" id="bs-turn" role="status" aria-live="polite"></div>' +
      '<div class="bs-stage" id="bs-stage"></div>' +
    '</div>';
  G.root = el.querySelector('.bs-wrap');
  G.els = {
    badge: el.querySelector('#bs-badge'),
    net: el.querySelector('#bs-net'),
    turn: el.querySelector('#bs-turn'),
    stage: el.querySelector('#bs-stage')
  };
  el.querySelector('#pt-back').onclick = askLeave;
  G.els.badge.textContent =
    G.mode === 'online' ? 'Online' :
    G.mode === 'pnp' ? 'Pass the phone' :
    (LEVELS.find(l => l.k === (G.st.seats[1] && G.st.seats[1].level)) || LEVELS[1]).name;
  /* the leave contract with js/party.js: whatever screen replaces us
     calls this, and any pending theatre stops dead */
  P.show();
  window.requestAnimationFrame(() => fitGrids());
  if (!G.ro && typeof ResizeObserver === 'function'){
    G.ro = new ResizeObserver(() => fitGrids());
    G.ro.observe(G.els.stage);
  }
}

function setTurnStrip(o){
  if (!G || !G.els) return;
  G.els.turn.className = 'pt-turn' + (o.alert ? ' alert' : '');
  G.els.turn.innerHTML =
    '<span class="pt-dot" style="background:' + (o.col || '#888') + '"></span>' +
    '<span class="pt-who">' + esc(o.who || '') + '</span>' +
    (o.note ? '<span class="pt-note">' + esc(o.note) + '</span>' : '');
}

function askLeave(){
  if (!G){ P.hub(); return; }
  if (G.st.phase === 'done'){ leave(); P.hub(); return; }
  if (G.mode === 'online'){
    U.confirm({ root: G.root }, {
      head:'Leave the battle?',
      why:'The table carries on without you and your boats stay where they sank.',
      yes:'Yes, leave', no:'No, fight on',
      go: () => {
        try { localApply(G.mySeat, { t:'quit' }); } catch(e){}
        const n = G.net; leave();
        if (n && n.onLeave) n.onLeave(); else P.hub();
      }
    });
    return;
  }
  /* offline: the save keeps the battle; leaving is safe */
  saveGame();
  leave();
  P.hub();
}

function leave(){
  if (!G) return;
  saveGame();
  const net = G.mode === 'online' ? G.net : null;
  G.dead = true;
  if (G.ro){ try { G.ro.disconnect(); } catch(e){} }
  G = null;
  if (net && net.onGone) net.onGone();
}

/* ── the pass-the-phone curtain ───────────────────────────────────── */
function curtain(name, go){
  const host = G.root;
  const old = host.querySelector('.bs-curtain');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'bs-curtain';
  el.innerHTML =
    '<div class="bs-cbox">' +
      '<span class="bs-cico">' + ico('users') + '</span>' +
      '<h3>Pass the phone to ' + esc(name) + '</h3>' +
      '<p>Only ' + esc(name) + ' looks at the next screen. Everybody else, eyes on the drinks.</p>' +
      '<button class="btn primary" id="bs-cgo">I am ' + esc(name) + '</button>' +
    '</div>';
  host.appendChild(el);
  el.querySelector('#bs-cgo').onclick = () => { el.remove(); go(); };
}

/* ═══════════════════════════════════════════════════════════════════
   5 · PLACEMENT
   Random fleet offered first — most tables just tap LEST — with tap-
   to-move and rotate for the fussy admiral.
   ═══════════════════════════════════════════════════════════════════ */
function ensureDraft(){
  if (G.draft) return;
  G.draft = { p: E.placeRandom(uiRng), sel: 0 };
}
function draftCells(){
  const out = {};
  for (let i = 0; i < E.FLEET.length; i++){
    const cs = E.shipCells(G.draft.p[i * 2], G.draft.p[i * 2 + 1], E.FLEET[i].len) || [];
    for (const c of cs) out[c] = i;
  }
  return out;
}
function paintPlace(){
  if (!G || G.dead) return;
  G.stage = 'place';
  const seat = G.mode === 'online' ? G.mySeat : G.placing;
  const s = G.st.seats[seat];
  if (!s || s.placed){ paintPlaceWait(); return; }
  if (G.st.phase === 'mode'){ paintModePick(); return; }
  ensureDraft();
  setTurnStrip({ col:'#3DDC84', who: (G.mode === 'pnp' ? nameOf(seat) + ': place your fleet' : 'Place your fleet'),
                 note:'' + E.FLEET.length + ' boats' });
  const cells = draftCells();
  const selCs = E.shipCells(G.draft.p[G.draft.sel * 2], G.draft.p[G.draft.sel * 2 + 1],
                            E.FLEET[G.draft.sel].len) || [];
  let g = '<div class="bs-pane"><div class="bs-grid place" id="bs-pgrid" style="--bq:' + gridPx() + 'px">';
  for (let c = 0; c < E.CELLS; c++){
    const sh = cells[c];
    g += '<button type="button" data-c="' + c + '" class="bs-c' +
         (sh !== undefined ? ' ship' : '') +
         (selCs.indexOf(c) >= 0 ? ' sel' : '') + '">' + coords(c) + '</button>';
  }
  g += '</div></div>';
  const dock = '<div class="bs-dock">' + E.FLEET.map((f, i) =>
    '<button type="button" class="bs-boat' + (G.draft.sel === i ? ' on' : '') + '" data-i="' + i + '">' +
      '<b>' + esc(f.name) + '</b><i>' + '▮'.repeat(f.len) + '</i></button>').join('') + '</div>';
  const bar =
    '<div class="pt-bar bs-pbar">' +
      '<button class="btn sm ghost" id="bs-shuffle">' + (window.ILB ? window.ILB('refresh', 'Ħawwad') : 'Ħawwad') + '</button>' +
      '<button class="btn sm ghost" id="bs-rot">' + (window.ILB ? window.ILB('arrow', 'Dawwar') : 'Dawwar') + '</button>' +
      '<button class="btn sm primary" id="bs-lock">' + (window.ILB ? window.ILB('check', 'LEST!') : 'LEST!') + '</button>' +
    '</div>';
  G.els.stage.innerHTML =
    '<p class="bs-hint">Tap a boat, tap the sea to move it, <b>Dawwar</b> turns it. ' +
    'Nobody else can see this grid.</p>' + g + dock + bar;
  fitGrids();

  G.els.stage.querySelectorAll('.bs-boat').forEach(b =>
    b.onclick = () => { G.draft.sel = +b.dataset.i; sfx('piece.lift', { gain:0.4 }); paintPlace(); });
  G.els.stage.querySelectorAll('.bs-c').forEach(b =>
    b.onclick = () => {
      const c = +b.dataset.c;
      const at = draftCells()[c];
      if (at !== undefined && at !== G.draft.sel){ G.draft.sel = at; sfx('piece.lift', { gain:0.4 }); paintPlace(); return; }
      tryMove(G.draft.sel, c, G.draft.p[G.draft.sel * 2 + 1]);
    });
  G.els.stage.querySelector('#bs-shuffle').onclick = () => {
    G.draft.p = E.placeRandom(uiRng); sfx('duel.shuffle', { gain:0.5 }); paintPlace();
  };
  G.els.stage.querySelector('#bs-rot').onclick = () => {
    const i = G.draft.sel;
    tryMove(i, G.draft.p[i * 2], G.draft.p[i * 2 + 1] ? 0 : 1, true);
  };
  G.els.stage.querySelector('#bs-lock').onclick = lockFleet;
}
function tryMove(i, anchor, dir, isRot){
  const p = G.draft.p.slice();
  p[i * 2] = anchor; p[i * 2 + 1] = dir;
  if (E.badPlacement(p)){
    /* try the other orientation before refusing — the tap usually means
       "put it here somehow" */
    p[i * 2 + 1] = dir ? 0 : 1;
    if (E.badPlacement(p)){
      sfx('ui.error', { gain:0.5 });
      if (K && K.toast) K.toast('⚠ ' + (isRot ? 'No room to turn it there.' : 'It does not fit there.'));
      return;
    }
  }
  G.draft.p = p;
  sfx('piece.place', { gain:0.5 });
  paintPlace();
}
function lockFleet(){
  const seat = G.mode === 'online' ? G.mySeat : G.placing;
  const mv = { t:'place' };
  for (let i = 0; i < G.draft.p.length; i++) mv['p' + i] = G.draft.p[i];
  G.draft = null;
  const r = localApply(seat, mv);
  if (!r.ok) return;
  sfx('ui.toggle');
  if (G.mode === 'pnp'){
    /* next local human who still has to place */
    for (let i = 0; i < G.st.seats.length; i++)
      if (!G.st.seats[i].placed && G.st.seats[i].kind === 'human'){
        G.placing = i;
        curtain(nameOf(i), () => paintPlace());
        return;
      }
  }
  if (G.st.phase === 'place') paintPlaceWait();
}
function paintPlaceWait(){
  if (!G || G.dead || G.st.phase !== 'place') return;
  const waiting = [];
  for (let i = 0; i < G.st.seats.length; i++)
    if (!G.st.seats[i].out && !G.st.seats[i].placed) waiting.push(nameOf(i));
  setTurnStrip({ col:'#FFC542', who:'Fleets going in', note: waiting.length + ' to go' });
  G.els.stage.innerHTML =
    '<div class="bs-waitbox">' +
      '<p>Your boats are in. Waiting for:</p>' +
      '<p class="bs-waitnames">' + esc(waiting.join(', ') || '…') + '</p>' +
      (G.mode === 'online' ? '<p class="bs-hint">If somebody fell in the harbour, give them a minute — ' +
        'the table can play their boats for them once the shooting starts.</p>' : '') +
    '</div>';
}
function paintModePick(){
  const host = G.mode === 'online' ? (G.mySeat === 0) : true;
  setTurnStrip({ col:'#FFC542', who: host ? 'Pick the game' : nameOf(0) + ' is picking the game', note:'' });
  if (!host){
    G.els.stage.innerHTML = '<div class="bs-waitbox"><p>' + esc(nameOf(0)) +
      ' is choosing between KLASSIKA and KARTI TAL-KANUN…</p></div>';
    return;
  }
  const pref = P.pref(GID);
  G.els.stage.innerHTML =
    '<div class="bs-waitbox"><p class="bs-hint">Your table, your call.</p>' +
    '<div class="pt-opts">' +
      '<button class="pt-opt" id="bs-mk">' + ico('cards') +
        '<b>Karti tal-Kanun</b><i>Draw a shot card every turn. The party one.</i></button>' +
      '<button class="pt-opt" id="bs-ml">' + ico('shield') +
        '<b>Klassika</b><i>One shell a turn. The serious one.</i></button>' +
    '</div></div>';
  G.els.stage.querySelector('#bs-mk').onclick = () => localApply(0, { t:'mode', o:1 });
  G.els.stage.querySelector('#bs-ml').onclick = () => localApply(0, { t:'mode', o:0 });
}

/* ═══════════════════════════════════════════════════════════════════
   6 · THE BOARD
   ═══════════════════════════════════════════════════════════════════ */
function gridPx(){
  const stage = G && G.els && G.els.stage;
  if (!stage) return 32;
  const w = stage.clientWidth || 320;
  const h = stage.clientHeight || 480;
  const land = w > h * 1.15;
  const gw = land ? Math.min(h - 6, w * 0.55) : Math.min(w - 8, h * 0.62);
  return Math.max(22, Math.min(40, Math.floor(gw / 10)));
}
function fitGrids(){
  if (!G || !G.els) return;
  const px = gridPx();
  G.root.querySelectorAll('.bs-grid').forEach(g => {
    if (!g.classList.contains('mini')) g.style.setProperty('--bq', px + 'px');
  });
}
function coords(c){
  const x = E.CX(c), y = E.CY(c);
  return (x === 0 ? '<span class="bs-co r">' + 'ABCDEFGHIJ'[y] + '</span>' : '') +
         (y === 0 ? '<span class="bs-co f">' + (x + 1) + '</span>' : '');
}

function paintBoard(){
  if (!G || G.dead || G.stage !== 'board') return;
  const st = G.st;
  if (st.phase === 'place' || st.phase === 'mode'){ paintPlace(); return; }
  const me = seatViewable();
  if (G.target < 0 || G.target === me || (st.seats[G.target] && st.seats[G.target].out))
    G.target = pickTarget();

  /* the strip */
  const turnSeat = st.seats[st.turn];
  const mine = myTurn();
  const pat = st.mode === 'karti' ? E.PATTERNS[st.drawn] : null;
  setTurnStrip({
    col: mine ? '#3DDC84' : '#FF9F86',
    who: st.phase === 'done' ? 'Battle over'
       : mine ? 'Your turn — FAJJAR!'
       : nameOf(st.turn) + (turnSeat && turnSeat.kind === 'cpu' ? ' is aiming' : ' to fire'),
    note: pat && st.phase === 'play' ? pat.name : '',
    alert: mine
  });

  /* opponent tabs (only when there is a choice) */
  const foes = [];
  for (let i = 0; i < st.seats.length; i++) if (i !== me) foes.push(i);
  let tabs = '';
  if (foes.length > 1){
    tabs = '<div class="bs-tabs">' + foes.map(i =>
      '<button type="button" class="bs-tab' + (G.view === 'them' && G.target === i ? ' on' : '') +
      (st.seats[i].out ? ' dead' : '') + '" data-g="' + i + '">' +
      esc(st.seats[i].name.slice(0, 9)) +
      '<i>' + (st.seats[i].out ? 'GĦEREQ' : boatsLeft(st.seats[i]) + '⛵') + '</i></button>').join('') +
      '</div>';
  }

  /* which grid is on show */
  const showMine = G.view === 'mine';
  const subject = showMine ? st.seats[me] : st.seats[G.target];
  let grid = '<div class="bs-pane"><div class="bs-grid' + (showMine ? ' minev' : '') +
             '" id="bs-grid" style="--bq:' + gridPx() + 'px">';
  const aimCells = !showMine && mine ? aimSet() : {};
  for (let c = 0; c < E.CELLS; c++){
    const shot = subject.shot[c];
    const sh = showMine ? E.shipAt(subject, c) : (shot === 2 ? E.shipAt(subject, c) : null);
    const sunk = sh && sh.ship.sunk;
    grid += '<button type="button" data-c="' + c + '" class="bs-c' +
      (shot === 2 ? ' hit' : shot === 1 ? ' miss' : '') +
      (showMine && sh ? ' ship' : '') + (sunk ? ' sunk' : '') +
      (aimCells[c] ? ' aim' + (aimCells[c] === 2 ? ' aim2' : '') : '') +
      '">' + coords(c) + '</button>';
  }
  grid += '</div></div>';

  /* my little sea + fleet health */
  const my = st.seats[me];
  let mini = '<button type="button" class="bs-mini-wrap" id="bs-swap" aria-label="Swap view">' +
    '<span class="bs-grid mini">';
  for (let c = 0; c < E.CELLS; c++){
    const sh = E.shipAt(my, c);
    mini += '<span class="bs-c' + (my.shot[c] === 2 ? ' hit' : my.shot[c] === 1 ? ' miss' : '') +
            (sh ? ' ship' : '') + '"></span>';
  }
  mini += '</span><i>' + (showMine ? 'LURA GĦAT-TIR' : 'IL-BAĦAR TIEGĦEK') + '</i></button>';
  const fleet = '<div class="bs-fleet">' + E.FLEET.map(f => {
    const sh = subjectFleet(showMine ? my : subject, f.id);
    return '<div class="bs-fl' + (sh && sh.sunk ? ' sunk' : '') + '">' +
      '<b>' + esc(f.short) + '</b><i>' + pips(sh, f.len) + '</i></div>';
  }).join('') + '</div>';

  /* the action bar */
  const needRot = pat && [1, 2, 4, 12, 13].indexOf(st.drawn) >= 0;
  const noAim = pat && (st.drawn === E.P.XITA || st.drawn === E.P.BAHAR);
  let bar = '';
  if (st.phase === 'play'){
    bar = '<div class="pt-bar bs-bar">' +
      (mine && needRot ? '<button class="btn sm ghost" id="bs-rotf">' +
        (window.ILB ? window.ILB('arrow', 'Dawwar') : 'Dawwar') + '</button>' : '') +
      (mine ? '<button class="btn sm primary" id="bs-fire"' + (canFire() ? '' : ' disabled') + '>' +
        (window.ILB ? window.ILB('bolt', 'FAJJAR!') : 'FAJJAR!') + '</button>'
      : (G.mode === 'online' && turnSeat && turnSeat.kind === 'human'
          ? '<button class="btn sm ghost" id="bs-nudge">' +
            (window.ILB ? window.ILB('coach', 'Play for them') : 'Play for them') + '</button>' : '')) +
      '<button class="btn sm ghost" id="bs-flag">' +
        (window.ILB ? window.ILB('flag', G.mode === 'online' ? 'Leave' : 'Resign') :
         (G.mode === 'online' ? 'Leave' : 'Resign')) + '</button>' +
    '</div>';
  }

  const aimHint = mine && pat ? aimHintText() : '';
  G.els.stage.innerHTML =
    tabs + grid +
    (aimHint ? '<p class="bs-hint aim">' + aimHint + '</p>' : '') +
    '<div class="bs-lower">' + mini + fleet + '</div>' + bar;
  fitGrids();

  /* wiring */
  G.els.stage.querySelectorAll('.bs-tab').forEach(b =>
    b.onclick = () => { G.view = 'them'; G.target = +b.dataset.g; G.aim = null; sfx('ui.tap', { gain:0.3 }); paintBoard(); });
  const swap = G.els.stage.querySelector('#bs-swap');
  if (swap) swap.onclick = () => { G.view = showMine ? 'them' : 'mine'; paintBoard(); };
  if (!showMine){
    G.els.stage.querySelectorAll('#bs-grid .bs-c').forEach(b =>
      b.onclick = () => tapAim(+b.dataset.c));
  } else {
    G.els.stage.querySelectorAll('#bs-grid .bs-c').forEach(b =>
      b.onclick = () => { G.view = 'them'; paintBoard(); });
  }
  const rot = G.els.stage.querySelector('#bs-rotf');
  if (rot) rot.onclick = () => { if (G.aim){ G.aim.o = G.aim.o ? 0 : 1; sfx('ui.toggle', { gain:0.4 }); paintBoard(); } };
  const fire = G.els.stage.querySelector('#bs-fire');
  if (fire) fire.onclick = commitFire;
  const nudge = G.els.stage.querySelector('#bs-nudge');
  if (nudge) nudge.onclick = () => U.confirm({ root: G.root }, {
    head:'Play their turn for them?',
    why: nameOf(st.turn) + ' seems to have fallen in the harbour. The sea takes one fair shot ' +
         'for them and the table moves on. Only do this if they are really gone.',
    yes:'Do it', no:'Give them a minute',
    go: () => localApply(G.mySeat, { t:'auto', g: st.turn, u: st.tcount & 255, z: E.fingerprint(st) & 255 })
  });
  const flag = G.els.stage.querySelector('#bs-flag');
  if (flag) flag.onclick = askLeave;
}
function boatsLeft(seat){
  let n = 0;
  if (seat.ships) for (const sh of seat.ships) if (!sh.sunk) n++;
  return n;
}
function subjectFleet(seat, id){
  if (!seat.ships) return null;
  return seat.ships.find(s => s.id === id) || null;
}
function pips(sh, len){
  if (!sh) return '▯'.repeat(len);
  let out = '';
  for (let i = 0; i < len; i++) out += sh.hit[i] ? '▢' : '▮';
  return out;
}

/* ── aiming ───────────────────────────────────────────────────────── */
function aimSet(){
  const out = {};
  if (!G.aim || !myTurn()) return out;
  const p = G.st.drawn;
  if (p === E.P.PAR){
    if (G.aim.c !== undefined) out[G.aim.c] = 1;
    if (G.aim.x !== undefined) out[G.aim.x] = 1;
    return out;
  }
  if (p === E.P.SNAJPER){
    if (G.aim.x !== undefined) out[G.aim.x] = 2;
    if (G.aim.c !== undefined) out[G.aim.c] = 1;
    return out;
  }
  if (G.aim.c === undefined) return out;
  const cs = p === E.P.GRANATA || p === E.P.SONAR ? E.box9(G.aim.c)
           : p === E.P.LINJA ? E.lineCells(G.aim.c, G.aim.o)
           : E.geomCells(p, G.aim.c, G.aim.o);
  for (const c of cs) out[c] = (p === E.P.GRANATA || p === E.P.SONAR) ? 2 : 1;
  if (p === E.P.GRANATA || p === E.P.SONAR) out[G.aim.c] = 1;
  return out;
}
function aimHintText(){
  const p = G.st.drawn;
  if (p === E.P.XITA) return 'The sea picks three squares on ' + esc(nameOf(G.target)) + '. Just fire.';
  if (p === E.P.BAHAR) return 'The dud. The sea aims this one. Fire and pray.';
  if (p === E.P.PAR) return 'Tap TWO squares, anywhere on their sea.';
  if (p === E.P.SNAJPER){
    if (G.aim && G.aim.peek !== undefined)
      return 'The peek says ' + (G.aim.peek ? '<b>SOMETHING IS THERE</b>' : 'splash') +
             '. Now tap where the shell really goes.';
    return 'Tap a square to PEEK at it first.';
  }
  if (p === E.P.SONAR) return 'Tap the middle of the box to ping. No shell today.';
  if (p === E.P.LINJA) return 'Tap the line. Dawwar swaps row for column.';
  return null;
}
function tapAim(c){
  if (!myTurn()){ sfx('ui.error', { gain:0.3 }); return; }
  const p = G.st.drawn;
  const target = G.st.seats[G.target];
  if (!G.aim) G.aim = { o: 0 };
  if (p === E.P.XITA || p === E.P.BAHAR){ sfx('ui.tap', { gain:0.3 }); return; }
  if (p === E.P.PAR){
    if (G.aim.c === undefined) G.aim.c = c;
    else if (G.aim.c === c){ delete G.aim.c; }
    else if (G.aim.x === c){ delete G.aim.x; }
    else if (G.aim.x === undefined && c !== G.aim.c) G.aim.x = c;
    else { G.aim.c = c; delete G.aim.x; }
    sfx('piece.lift', { gain:0.4 });
    paintBoard(); return;
  }
  if (p === E.P.SNAJPER){
    if (G.aim.x === undefined){
      G.aim.x = c;
      G.aim.peek = !!E.shipAt(target, c);
      sfx('ui.toggle');
      if (G.aim.peek) note(4, { gain:0.6 });
      paintBoard(); return;
    }
    G.aim.c = c;
    sfx('piece.lift', { gain:0.4 });
    paintBoard(); return;
  }
  G.aim.c = c;
  sfx('piece.lift', { gain:0.4 });
  paintBoard();
}
function canFire(){
  if (!G.aim && !(G.st.drawn === E.P.XITA || G.st.drawn === E.P.BAHAR)) return false;
  const p = G.st.drawn;
  if (p === E.P.XITA || p === E.P.BAHAR) return true;
  if (p === E.P.PAR) return G.aim && G.aim.c !== undefined && G.aim.x !== undefined;
  if (p === E.P.SNAJPER) return G.aim && G.aim.c !== undefined && G.aim.x !== undefined;
  return G.aim && G.aim.c !== undefined;
}
function commitFire(){
  if (!myTurn() || !canFire()) return;
  const st = G.st;
  const seat = seatMe();
  const mv = { t:'fire', g: G.target, c: 0, o: 0, w: st.drawn,
               u: st.tcount & 255, z: E.fingerprint(st) & 255 };
  const p = st.drawn;
  if (p === E.P.XITA || p === E.P.BAHAR){ mv.c = 0; }
  else {
    mv.c = G.aim.c | 0;
    mv.o = G.aim.o ? 1 : 0;
    if (p === E.P.PAR || p === E.P.SNAJPER) mv.x = G.aim.x | 0;
  }
  G.aim = null;
  localApply(seat, mv);
}

/* ═══════════════════════════════════════════════════════════════════
   7 · THE FULL STOP
   ═══════════════════════════════════════════════════════════════════ */
function finish(e){
  if (!G) return;
  clearSave();
  const st = G.st;
  const me = G.mode === 'pnp' ? -1 : G.mySeat;
  const iWon = e.winner === me;
  const tone = G.mode === 'pnp' ? 'win' : iWon ? 'win' : 'lose';
  { const S = SFX(); if (S && S.boardEnd) S.boardEnd({ win: G.mode === 'pnp' ? true : iWon }); }

  if (G.mode === 'ai') P.record(GID, iWon ? 'w' : 'l');

  const winName = e.winner >= 0 ? nameOf(e.winner) : 'Nobody';
  const head = iWon ? 'GĦARRAQTHOM!' : G.mode === 'pnp' ? winName.toUpperCase() + ' REBAĦ!' : 'GĦARRQUK.';
  const why = e.winner >= 0
    ? winName + ' is the last fleet floating' +
      (st.mode === 'karti' ? ' after ' + st.tcount + ' turns of the cards.' : '.')
    : 'Everybody left. The sea keeps the lot.';
  const quip = iWon || G.mode === 'pnp'
    ? QUIP_WIN[(st.rng >>> 4) % QUIP_WIN.length]
    : QUIP_LOSE[(st.rng >>> 4) % QUIP_LOSE.length];

  if (G.mode === 'online'){
    U.result({ root: G.root }, {
      tone, head, why, quip,
      buttons: [{ label:'Back to the rooms', icon:'back', cls:'primary',
                  go: () => { const n = G && G.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
    });
    return;
  }
  U.result({ root: G.root }, {
    tone, head, why, quip,
    buttons: [
      { label:'Again', icon:'play', cls:'primary',
        go: () => { const pf = P.pref(GID); newLocal({ gmode: st.mode, who: G.mode, level: pf.level || 2, foes: pf.foes || 1 }); } },
      { label:'Change the table', icon:'users', go: () => { leave(); menu(); } },
      { label:'Back to party games', icon:'back', go: () => { leave(); P.hub(); } }
    ]
  });
}

/* ═══════════════════════════════════════════════════════════════════
   8 · ONLINE — the two halves js/mp.js reads.
   The transport knows no rules; we know no sockets.
   ═══════════════════════════════════════════════════════════════════ */
function onlineStart(cfg){
  cfg = cfg || {};
  clearSaveNothing();
  const defs = (cfg.seats || []).filter(Boolean).map(s => ({
    name: s.name, kind: s.kind === 'cpu' ? 'cpu' : 'human',
    level: s.level, own: s.own || (s.kind === 'cpu' ? 'ai' : 'net')
  }));
  const st = E.newMatch({ mode: null, seats: defs, seed: cfg.seed >>> 0 });
  G = { st, mode:'online', mySeat: cfg.you | 0, net: cfg.net || null,
        stage:'place', placing: cfg.you | 0, view:'them', target: -1, aim: null,
        q: [], busy: false, dead: false, needCurtain: false };
  G.target = pickTarget();
  mount();
  paintPlace();
  /* the host answers the mode question; everyone else watches for it */
  return true;
}
function clearSaveNothing(){ /* online never touches the offline slot */ }

function onlineRemote(seat, mv){
  if (!G || G.mode !== 'online') return { ok:false, why:'no battle on this phone' };
  const r = netApply(seat | 0, mv);
  if (!r.ok){
    if (r.desync) return { ok:false, why: r.why, desync:true };
    return { ok:false, why: r.why || 'That move does not fit the rules of GĦARRAQHOM.' };
  }
  return null;
}
function onlineNote(text, tone){
  if (!G || !G.els || G.mode !== 'online') return;
  const n = G.els.net;
  if (!text){ n.hidden = true; n.textContent = ''; return; }
  n.className = 'pt-net' + (tone ? ' ' + tone : '');
  n.hidden = false;
  n.textContent = text;
}
function onlineStop(why, tone){
  if (!G || G.mode !== 'online') return;
  if (G.st.phase !== 'done'){ G.st.phase = 'done'; }
  U.result({ root: G.root }, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? 'No deal' : 'Cut off',
    why: why || 'The battle stopped.',
    quip: 'Nothing was awarded. Nobody lost anything for a bad line.',
    buttons: [{ label:'Back to the rooms', icon:'back', cls:'primary',
                go: () => { const n = G && G.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
  });
}

const HOOKS = {
  onMove: f => { moveSubs.push(f); return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); }; },
  apply: (seat, mv) => netApply(seat, mv),
  phase: () => (G ? G.st.phase : null),
  live: () => !!(G && G.mode === 'online' && !G.dead)
};

P.online = P.online || {};
P.online[GID] = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  live: () => !!(G && G.mode === 'online' && !G.dead),
  hooks: HOOKS
};

/* ── the lobby contract (see docs/ONLINE.md §5b) ─────────────────── */
function rulesPanel(){
  return '<div class="bs-rules">' +
    '<p><b>GĦARRAQHOM!</b> — sea battle for the whole table. Five boats each, hidden on ' +
    'your own 10×10 sea. On your turn pick a victim and fire; last fleet floating wins.</p>' +
    '<p><b>KARTI TAL-KANUN</b> (the host picks at the start): every turn begins with a shot ' +
    'card drawn <b>in front of everybody</b> — a single shell, three in a row, a cross, an H, ' +
    'a whole row, a sniper’s peek, or the famous SPARA ’L BAĦAR where the sea aims for you. ' +
    'The card decides how you fire. No lying: every phone sees the same draw.</p>' +
    '<p>Hits stay red, misses stay white, a finished boat is announced by name. If somebody ' +
    'falls in the harbour mid-game the table can let the sea take one fair shot for them.</p>' +
  '</div>';
}
const LOBBY = {
  id: GID,
  name: TITLE,
  mt: 'Sea battle',
  minSeats: E.MIN_SEATS,
  maxSeats: E.MAX_SEATS,
  levels: LEVELS.map(l => ({ level: l.k, name: l.name, note: l.note })),
  defaultLevel: 2,
  isReady: seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    const n = (seatList || []).length;
    if (n < 2) return { ok:false, why:'Somebody has to be shot at.' };
    if (n > E.MAX_SEATS) return { ok:false, why:'Six fleets is as much sea as there is.' };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready) return { ok:false, why: unready + (unready > 1 ? ' people are' : ' person is') + ' not ready yet.' };
    return { ok:true, why:'' };
  },
  rulesHTML: rulesPanel,
  blurb: 'Five boats each, everybody on their own sea, and in the fun mode every turn ' +
         'starts with a shot card drawn in front of the whole table.',
  myName: myName,
  /* the offline twin — a seat list in, a battle out */
  start(seats, opts){
    const o = opts || {};
    const defs = (seats || []).map(s => ({
      name: s.name, kind: s.kind === 'cpu' ? 'cpu' : 'human',
      level: s.level || 2, own: s.own || (s.kind === 'cpu' ? 'ai' : 'local')
    }));
    const st = E.newMatch({ mode: o.mode === 'klassika' ? 'klassika' : 'karti', seats: defs,
                            seed: (o.seed >>> 0) || ((Date.now() ^ 0xB5) >>> 0) });
    G = { st, mode:'ai', mySeat:0, net:null, stage:'place', placing:0, view:'them',
          target:-1, aim:null, q:[], busy:false, dead:false, needCurtain:false };
    G.target = pickTarget();
    mount(); paintPlace();
    return st;
  },
  /* HOW A GĦARRAQHOM MOVE FOLDS ONTO THE RELAY'S FIVE FIELDS.
     Positional — reordering this list silently swaps fields on the
     wire between builds. js/battleship.js documents the same order. */
  wire: { fields: ['g', 'c', 'o', 'w', 'x', 'u', 'z',
                   'p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'] },
  takeback: false
};
window.KARTI_GHARRAQ = { lobby: LOBBY, open: menu, engine: E };

/* ═══════════════════════════════════════════════════════════════════
   9 · ON THE SHELF
   ═══════════════════════════════════════════════════════════════════ */
const SPRITE =
  '<symbol id="bs-boat" viewBox="0 0 24 24">' +
    /* a luzzu: hull, high prow, little mast — filled silhouette */
    '<path d="M2.2 14.6h19.6c-.6 2.2-2.1 4.1-4.2 5.2H7.2c-2.4-1-4.2-2.9-5-5.2z"/>' +
    '<path d="M12.6 3.1l1.9 1.6-1 .9c2.9 1.4 5 3.9 5.6 7.4h-7.5V3.4z"/>' +
    '<path d="M10.3 6.2v6.8H4.1c.9-3.2 3.2-5.7 6.2-6.8z"/></symbol>';
function injectSprite(){
  if (document.getElementById('bs-sprite')) return;
  const holder = document.createElement('div');
  holder.id = 'bs-sprite';
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  holder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><defs>' + SPRITE + '</defs></svg>';
  document.body.appendChild(holder);
}
if (document.body) injectSprite();
else document.addEventListener('DOMContentLoaded', injectSprite);

P.register({
  id: GID, order: 23, kind:'board', name: TITLE, mt:'Sea battle', sprite:'bs-boat',
  status:'live',
  get tag(){
    return 'Five boats hidden on your own sea, and in the fun mode every turn starts ' +
      'with a shot card drawn in front of the whole table. Sink the neighbours.' +
      (loadSave() ? ' There is one half-fought.' : '');
  },
  open: menu,
  seats: { min: E.MIN_SEATS, max: E.MAX_SEATS },
  levels: LOBBY.levels,
  rulesHTML: rulesPanel,
  start: (seatList, o) => LOBBY.start(seatList, o)
});

/* ═══════════════════════════════════════════════════════════════════
   10 · THE STYLESHEET — scoped to #scr-party .bs-*
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS(){
  if (document.getElementById('bs-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'bs-runtime-css';
  st.textContent =
    '#scr-party .bs-wrap{flex:1;min-height:0;display:flex;flex-direction:column;position:relative}' +
    '#scr-party .bs-stage{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;' +
      'overflow-y:auto;-webkit-overflow-scrolling:touch}' +
    '#scr-party .bs-hint{font-size:11.5px;line-height:1.5;color:var(--dim);margin:2px 2px 8px;' +
      'text-transform:none;letter-spacing:0;text-align:center}' +
    '#scr-party .bs-hint.aim{color:#FFD98A;margin:6px 2px 2px}' +
    '#scr-party .bs-hint b{color:var(--gold)}' +

    /* ── grids ── */
    '#scr-party .bs-pane{flex:0 0 auto;display:flex;justify-content:center;width:100%}' +
    '#scr-party .bs-grid{--bq:32px;display:grid;grid-template-columns:repeat(10,var(--bq));' +
      'grid-template-rows:repeat(10,var(--bq));border-radius:10px;overflow:hidden;' +
      'border:2px solid rgba(0,0,0,.5);box-shadow:0 8px 22px rgba(0,0,0,.5)}' +
    '#scr-party .bs-c{position:relative;display:block;width:var(--bq);height:var(--bq);padding:0;' +
      'border:0;background:linear-gradient(180deg,#173A63,#122E50);' +
      'box-shadow:inset 0 0 0 .5px rgba(255,255,255,.07);color:#7FA8D9}' +
    '#scr-party .bs-c .bs-co{position:absolute;font:700 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
      'opacity:.55;pointer-events:none}' +
    '#scr-party .bs-c .bs-co.r{left:2px;top:2px}' +
    '#scr-party .bs-c .bs-co.f{right:2px;top:2px}' +
    '#scr-party .bs-c.ship{background:linear-gradient(180deg,#4E5A6E,#39445A);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}' +
    '#scr-party .bs-c.miss::after{content:"";position:absolute;left:50%;top:50%;width:26%;height:26%;' +
      'margin:-13% 0 0 -13%;border-radius:50%;background:#B9D4F2;opacity:.65}' +
    '#scr-party .bs-c.hit{background:linear-gradient(180deg,#7A2415,#57170B)}' +
    '#scr-party .bs-c.hit::after{content:"";position:absolute;inset:22%;border-radius:50%;' +
      'background:radial-gradient(circle at 35% 30%,#FFB35C,#E8452C 60%,#8C1E0C);' +
      'box-shadow:0 0 8px rgba(232,69,44,.8)}' +
    '#scr-party .bs-c.sunk{filter:none;background:#3A0E05}' +
    '#scr-party .bs-c.sunk::after{opacity:.55}' +
    '#scr-party .bs-c.fresh::after{animation:bsPop .32s var(--ease) both}' +
    '@keyframes bsPop{from{transform:scale(2.2);opacity:0}to{transform:scale(1);opacity:1}}' +
    '#scr-party .bs-c.aim{box-shadow:inset 0 0 0 3px var(--gold)}' +
    '#scr-party .bs-c.aim2{box-shadow:inset 0 0 0 3px rgba(255,197,66,.45)}' +
    '#scr-party .bs-c.sel{box-shadow:inset 0 0 0 3px var(--sel,#3DDC84)}' +
    '#scr-party .bs-grid.place .bs-c.ship{background:linear-gradient(180deg,#5E6A80,#48546C)}' +

    /* ── tabs, lower deck ── */
    '#scr-party .bs-tabs{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:0 0 7px;' +
      'width:100%}' +
    '#scr-party .bs-tab{display:flex;flex-direction:column;align-items:center;gap:1px;padding:5px 11px;' +
      'border-radius:11px;color:var(--txt);font:900 10.5px/1.2 var(--disp);letter-spacing:.06em;' +
      'text-transform:uppercase;background:rgba(255,255,255,.05);border:1px solid var(--line)}' +
    '#scr-party .bs-tab i{font-style:normal;font:700 9px/1 ui-monospace,monospace;color:var(--dim)}' +
    '#scr-party .bs-tab.on{background:rgba(255,197,66,.14);border-color:rgba(255,197,66,.5)}' +
    '#scr-party .bs-tab.dead{opacity:.45;text-decoration:line-through}' +
    '#scr-party .bs-lower{display:flex;gap:10px;align-items:center;justify-content:center;' +
      'margin:8px 0 4px;width:100%}' +
    '#scr-party .bs-mini-wrap{display:flex;flex-direction:column;align-items:center;gap:3px;' +
      'background:none;border:0;padding:0;color:var(--dim)}' +
    '#scr-party .bs-mini-wrap i{font:700 8.5px/1 var(--disp);letter-spacing:.1em;font-style:normal;' +
      'text-transform:uppercase}' +
    '#scr-party .bs-grid.mini{--bq:9px;grid-template-columns:repeat(10,9px);' +
      'grid-template-rows:repeat(10,9px);border-radius:5px;border-width:1px;box-shadow:none}' +
    '#scr-party .bs-grid.mini .bs-c{width:9px;height:9px;pointer-events:none}' +
    '#scr-party .bs-grid.mini .bs-c.hit::after{inset:15%}' +
    '#scr-party .bs-fleet{display:flex;flex-direction:column;gap:2px}' +
    '#scr-party .bs-fl{display:flex;gap:7px;align-items:baseline}' +
    '#scr-party .bs-fl b{font:900 9px/1.4 var(--disp);letter-spacing:.08em;color:var(--dim);' +
      'min-width:56px;text-align:right}' +
    '#scr-party .bs-fl i{font-style:normal;font-size:11px;letter-spacing:2px;color:#8FB6E8}' +
    '#scr-party .bs-fl.sunk b{color:var(--danger,#FF5468);text-decoration:line-through}' +
    '#scr-party .bs-fl.sunk i{color:#7A2415}' +
    '#scr-party .bs-bar,#scr-party .bs-pbar{width:100%;margin-top:8px;grid-template-columns:' +
      'repeat(auto-fit,minmax(0,1fr))}' +

    /* ── placement dock ── */
    '#scr-party .bs-dock{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:9px 0 0;' +
      'width:100%}' +
    '#scr-party .bs-boat{display:flex;flex-direction:column;align-items:center;gap:1px;' +
      'padding:6px 10px;border-radius:11px;color:var(--txt);background:rgba(255,255,255,.05);' +
      'border:1px solid var(--line)}' +
    '#scr-party .bs-boat b{font:900 9.5px/1.2 var(--disp);letter-spacing:.05em;text-transform:uppercase}' +
    '#scr-party .bs-boat i{font-style:normal;font-size:10px;letter-spacing:1px;color:#8FB6E8}' +
    '#scr-party .bs-boat.on{background:rgba(61,220,132,.13);border-color:rgba(61,220,132,.5)}' +

    /* ── the reveal ── */
    '#scr-party .bs-reveal{position:absolute;inset:0;z-index:30;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(8,5,15,.78);animation:ptFade .18s var(--ease) both}' +
    '#scr-party .bs-reveal.bye{opacity:0;transition:opacity .24s}' +
    '#scr-party .bs-flip{position:relative;width:min(72vw,270px);aspect-ratio:5/7;' +
      'transform-style:preserve-3d;animation:bsFlip .55s var(--ease) both}' +
    '@keyframes bsFlip{from{transform:rotateY(180deg) scale(.7)}to{transform:rotateY(360deg) scale(1)}}' +
    '#scr-party .bs-reveal.big .bs-flip{animation:bsFlipBig .8s var(--ease) both}' +
    '@keyframes bsFlipBig{0%{transform:rotateY(180deg) scale(.55)}60%{transform:rotateY(360deg) scale(1.12)}' +
      '100%{transform:rotateY(360deg) scale(1)}}' +
    '#scr-party .bs-cardface{position:absolute;inset:0;border-radius:18px;backface-visibility:hidden;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;' +
      'padding:16px 12px;text-align:center}' +
    '#scr-party .bs-back{transform:rotateY(180deg);background:linear-gradient(160deg,#241A3E,#141026);' +
      'border:2px solid rgba(255,197,66,.4);color:var(--gold);font-size:44px}' +
    '#scr-party .bs-front{background:linear-gradient(180deg,#1E2C48,#101D33);' +
      'border:2px solid rgba(143,182,232,.5);box-shadow:0 18px 44px rgba(0,0,0,.6)}' +
    '#scr-party .bs-reveal.mid .bs-front{border-color:rgba(255,197,66,.6)}' +
    '#scr-party .bs-reveal.big .bs-front{border-color:var(--hot,#E8452C);' +
      'box-shadow:0 0 34px rgba(232,69,44,.45),0 18px 44px rgba(0,0,0,.6)}' +
    '#scr-party .bs-who{font:900 9.5px/1 var(--disp);letter-spacing:.16em;color:var(--dim)}' +
    '#scr-party .bs-pname{font:900 21px/1.1 var(--disp);letter-spacing:.05em;color:var(--gold)}' +
    '#scr-party .bs-reveal.big .bs-pname{color:#FF9F86;font-size:24px}' +
    '#scr-party .bs-pmt{font-size:11.5px;color:#8FB6E8;font-style:italic}' +
    '#scr-party .bs-phow{font-size:11.5px;line-height:1.5;color:var(--dim);text-transform:none}' +
    '#scr-party .bs-diag{display:grid;grid-template-columns:repeat(7,15px);gap:2px;margin:6px 0}' +
    '#scr-party .bs-diag.lbl{display:flex;align-items:center;justify-content:center;min-height:60px}' +
    '#scr-party .bs-diag i{font:900 26px/1 var(--disp);color:#8FB6E8;font-style:normal;letter-spacing:6px}' +
    '#scr-party .bs-diag u{width:15px;height:15px;border-radius:3px;background:rgba(143,182,232,.13);' +
      'display:block;text-decoration:none}' +
    '#scr-party .bs-diag u.on{background:var(--gold);box-shadow:0 0 6px rgba(255,197,66,.6)}' +
    '#scr-party .bs-diag u.half{background:rgba(255,197,66,.35)}' +
    '#scr-party .bs-diag u.eye{background:#3DDC84}' +

    /* ── banners, curtain, waits ── */
    '#scr-party .bs-banner{position:absolute;left:50%;top:34%;transform:translateX(-50%);z-index:28;' +
      'max-width:88%;padding:10px 16px;border-radius:13px;font:900 13px/1.35 var(--disp);' +
      'letter-spacing:.06em;text-transform:uppercase;text-align:center;color:var(--txt);' +
      'background:rgba(14,11,20,.94);border:1px solid var(--line2);box-shadow:0 12px 30px rgba(0,0,0,.5);' +
      'animation:ptFade .18s var(--ease) both}' +
    '#scr-party .bs-banner.hot{border-color:rgba(232,69,44,.6);color:#FFB39F}' +
    '#scr-party .bs-banner.bye{opacity:0;transition:opacity .35s}' +
    '#scr-party .bs-curtain{position:absolute;inset:0;z-index:32;display:flex;align-items:center;' +
      'justify-content:center;padding:20px;background:rgba(8,5,15,.97)}' +
    '#scr-party .bs-cbox{text-align:center;max-width:300px}' +
    '#scr-party .bs-cbox .bs-cico{font-size:38px;color:var(--gold)}' +
    '#scr-party .bs-cbox h3{font-size:17px;letter-spacing:.05em;text-transform:uppercase;margin:10px 0 6px}' +
    '#scr-party .bs-cbox p{font-size:12.5px;line-height:1.6;color:var(--dim);margin-bottom:16px;' +
      'text-transform:none}' +
    '#scr-party .bs-waitbox{display:flex;flex-direction:column;align-items:center;gap:6px;' +
      'padding:26px 16px;text-align:center;max-width:330px}' +
    '#scr-party .bs-waitbox p{font-size:12.5px;line-height:1.6;color:var(--dim);text-transform:none}' +
    '#scr-party .bs-waitnames{font:900 13px/1.5 var(--disp);letter-spacing:.05em;color:var(--gold)}' +
    '#scr-party .bs-waitbox .pt-opts{width:100%}' +
    '#scr-party .bs-rules{font-size:12px;line-height:1.6;text-transform:none;letter-spacing:0}' +
    '#scr-party .bs-rules p{margin:0 0 8px;color:var(--dim)}' +
    '#scr-party .bs-rules b{color:var(--txt)}' +

    /* ── landscape: grid left, everything else right ── */
    '@media (orientation:landscape){' +
      '#scr-party .bs-stage{flex-direction:row;flex-wrap:wrap;align-items:flex-start;' +
        'justify-content:center;gap:4px 14px;align-content:flex-start}' +
      '#scr-party .bs-pane{width:auto;order:1}' +
      '#scr-party .bs-tabs{width:auto;order:0;flex-basis:100%}' +
      '#scr-party .bs-lower{width:auto;order:2;flex-direction:column}' +
      '#scr-party .bs-bar,#scr-party .bs-pbar{width:auto;order:3;min-width:150px;' +
        'grid-template-columns:1fr}' +
      '#scr-party .bs-dock{width:auto;order:2;flex-direction:column;max-width:180px}' +
      '#scr-party .bs-hint{flex-basis:100%;order:4}' +
      '#scr-party .bs-hint.aim{order:4}}';
  document.head.appendChild(st);
}

/* ── test hooks — inert unless the page is opened with ?pttest ────── */
try {
  if (String(location.search).indexOf('pttest') >= 0){
    window.__BS_UI = {
      G: () => G, menu, newLocal, paintBoard, paintPlace, localApply,
      tap: c => tapAim(c), fire: () => commitFire(), lock: () => lockFleet(),
      state: () => (G ? G.st : null),
      drain: () => { if (G){ G.q = []; G.busy = false; } },
      reveal: p => { if (G) reveal({ e:'draw', s:0, p: p | 0 }, () => {}); },
      setDraft: p => { if (G){ ensureDraft(); G.draft.p = p; paintPlace(); } }
    };
  }
} catch(e){}

})();
