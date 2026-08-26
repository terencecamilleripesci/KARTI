/* ═══════════════════════════════════════════════════════════════════
   KARTI — il-forka-ui.js
   IL-FORKA — the screens on top of js/il-forka.js. Follows js/sqaq-ui.js:
   the online controller and lobby contract are the shapes js/mp.js reads,
   and the round pays once through KARTI_XP.awardPlay under a match id.

   THE ROUND, ONLINE — the referee model (see the engine header):
     · phase 'setword' — the SETTER types a word on their own phone; the
       word never leaves it. They broadcast only its LENGTH.
     · phase 'guess'   — guessers take turns calling a letter; the setter's
       phone rules on each and broadcasts the reveal. A hit plays on, a
       miss builds the gallows and passes the turn.
     · round over      — the setter fills in any squares still hidden (a
       burst of reveals) so everyone sees the answer, then the setter
       rotates and the next round begins. Most points after the last
       round wins → IR-REBBIEĦ.

   HOUSE RULES — borrows #scr-party via KARTI_PARTY, injects CSS once,
   T(en,mt) at every call site, sounds only through existing KARTI_SFX
   ids, nothing random in play.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_ILFORKA;
if (!K || !P || !R || !R.engine) return;

const E = R.engine;
const esc = (K && K.esc) || (s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');
const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;

const SEATS = [
  { id:'gold', hex:'#FFC542' }, { id:'ice', hex:'#4FB6FF' },
  { id:'jade', hex:'#3DDC84' }, { id:'ruby', hex:'#FF5468' },
  { id:'plum', hex:'#B98BFF' }, { id:'tang', hex:'#FF9F45' },
  { id:'aqua', hex:'#35D6C2' }, { id:'rose', hex:'#FF7BB0' }
];
const seatColour = i => SEATS[i % SEATS.length];

const STORE = 'karti_ilforka_v1';
let ST = { pref:{ rounds:3, lvl:2 }, rec:{ w:0, l:0 } };
try { const s = JSON.parse(localStorage.getItem(STORE) || '0'); if (s && s.pref) ST = s; } catch(e){}
let pT = 0;
function persist(){ clearTimeout(pT); pT = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){} }, 300); }
function pref(patch){ if (patch){ Object.assign(ST.pref, patch); persist(); } return ST.pref; }

let cueAt = 0;
function cue(id, opts, big){
  const S = window.KARTI_SFX; if (!S) return;
  const now = Date.now();
  if (!big && now - cueAt < 40) return;
  cueAt = Math.max(cueAt, now);
  try { S.play(id, opts); } catch(e){}
}
function note(step, gain){ const S = window.KARTI_SFX; if (S && S.note){ try { S.note(step, { gain: gain || 0.5 }); } catch(e){} } }
function reduced(){ try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){ return false; } }
function myName(){ try { if (window.KARTI && KARTI.displayName) return KARTI.displayName() || T('You','Int'); } catch(e){} return T('You','Int'); }

const LEVELS = [
  { level:1, name:'Ġojja',  note:{ en:'Easy words.',   mt:'Kliem faċli.' } },
  { level:2, name:'Rita',   note:{ en:'A fair mix.',   mt:'Taħlita ġusta.' } },
  { level:3, name:'Il-Bużż',note:{ en:'The long ones.',mt:'Dawk twal.' } }
];
const levelName = l => (LEVELS.find(x => x.level === l) || LEVELS[1]).name;

/* ═════════════ the runner ═════════════ */
let M = null, UI = null;
const moveSubs = [];
function fire(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }

function startMatch(opts){
  stopBot();
  M = {
    seats: Math.max(2, Math.min(8, (opts && opts.seats) || 2)),
    rounds: Math.max(1, Math.min(9, (opts && opts.rounds) || (pref().rounds || 3))),
    round: 0,
    setter: 0,                          /* rotates each round             */
    scores: null,                       /* filled on first round          */
    st: null, ctx: null,
    role: 'guesser',                    /* this seat's role this round    */
    myWord: '',                         /* SETTER only, held locally       */
    net: null, meta: null, mode: (opts && opts.mode) || 'ai',
    lvl: (opts && opts.lvl) || pref().lvl || 2,
    finished: false, dead: false, botT: 0, pending: false
  };
  return M;
}
function stopBot(){ if (M && M.botT){ clearTimeout(M.botT); M.botT = 0; } }
function seatCount(){ return M ? M.seats : 2; }
function ownerOf(i){ return (M && M.meta && M.meta[i] && M.meta[i].own) || 'ai'; }
const isLocal = i => { const o = ownerOf(i); return o === 'me' || o === 'hot'; };
function seatName(i){
  const m = M && M.meta && M.meta[i];
  if (!m) return seatTitle(i);
  if (m.own === 'me') return m.name || T('You','Int');
  if (m.own === 'ai') return levelName(M.lvl);
  return m.name || seatTitle(i);
}
function seatTitle(i){ return T('Player','Plejer') + ' ' + (i + 1); }
function firstLocalSeat(){ for (let i = 0; i < seatCount(); i++) if (isLocal(i)) return i; return -1; }
const mySeat = () => M && M.net ? (M.net.you != null ? M.net.you : firstLocalSeat()) : firstLocalSeat();

/* ── say() — the ONE place a local wire event leaves this phone. mp.js is
   the only caller of hooks.onMove; offline M.net is null and this no-ops. */
function say(seat, mv){
  if (!M || !M.net) return;
  const w = E.encWire(mv);
  if (!w) return;
  fire(moveSubs, { seat, move: w, src: 'local' });
}

/* ═════════════ per-round setup ═════════════ */
function beginRound(){
  if (!M) return;
  M.round++;
  M.setter = (M.round - 1) % M.seats;
  const me = mySeat();
  M.role = (me === M.setter) ? 'setter' : 'guesser';
  M.myWord = '';
  M.pending = false;
  M.st = null;                          /* built when the word is set     */

  if (M.mode === 'ai'){
    /* the machine sets; the human (seat 0) guesses. Machine is always the
       setter offline so the human always guesses. */
    M.setter = 1;                       /* seat 1 = the machine setter    */
    M.role = 'guesser';
    const word = E.pickWord((hashName() ^ (M.round * 2654435761)) >>> 0, M.round);
    M.setter = 1;
    startRoundWord(word, 1);
    paint();
    return;
  }
  if (M.mode === 'pnp'){
    /* pass-the-phone: seat `setter` types a word on this device */
    M.role = 'setter';
    showSetWord();
    return;
  }
  /* online */
  if (M.role === 'setter') showSetWord();
  else { M.st = null; paint(); }        /* wait for the setter's length   */
}
function hashName(){ let h = 2166136261 >>> 0; const s = myName(); for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }

/* build the round's engine state once the word (or its length) is known */
function startRoundWord(word, setter){
  M.setter = setter;
  M.myWord = word || '';
  M.st = E.newRound({ seats: M.seats, setter, word, scores: M.scores });
  if (!M.scores) M.scores = M.st.scores.slice();
  M.st.scores = M.scores;               /* carry the running totals       */
}
function startRoundBlind(len, setter){
  M.setter = setter;
  M.st = E.newRound({ seats: M.seats, setter, len, scores: M.scores });
  if (!M.scores) M.scores = M.st.scores.slice();
  M.st.scores = M.scores;
}

/* ═════════════ a guess ═════════════ */
function tryGuess(code){
  if (!M || !M.st || M.st.done) return;
  const me = mySeat();
  if (!E.canGuess(M.st, code, me)) return;
  if (M.net){
    if (M.role === 'setter') return;    /* the setter never guesses       */
    M.pending = true;                   /* wait for the reveal            */
    say(me, { t:'guess', l: code });
    cue('ui.tap', { gain:0.5 });
    paint();
  } else {
    /* offline: this device is the referee */
    const ruling = E.referee(M.st, code, me);
    if (ruling) { afterRuling(me, ruling); }
  }
}
/* fold a ruling in locally + sound/animation, then react (bot, end) */
function afterRuling(seat, ruling){
  if (ruling.wrong){ cue('duel.hit', { gain:0.6 }, true); }
  else { note(Math.min(12, 3 + ruling.count), 0.6); cue('piece.place', { gain:0.5 }); }
  M.pending = false;
  paint();
  if (M.st.done){ endRound(); return; }
  maybeBot();
}

/* ═════════════ the machine plays (offline vs computer: machine is setter,
   so it never guesses; but a pass-phone or future AI-guesser could). Here
   the machine only referees implicitly (offline referee is local). ═════ */
function maybeBot(){
  if (!M || M.dead || !M.st || M.st.done || M.net) return;
  const seat = M.st.turn;
  if (ownerOf(seat) !== 'ai' || seat === M.st.setter) return;
  stopBot();
  M.botT = setTimeout(() => {
    if (!M || M.dead || !M.st || M.st.done || M.st.turn !== seat) return;
    const code = E.botLetter(M.st);
    const ruling = E.referee(M.st, code, seat);
    if (ruling) afterRuling(seat, ruling);
  }, reduced() ? 180 : 640);
}

/* ═════════════ round / match end ═════════════ */
function endRound(){
  if (!M || !M.st) return;
  cue(M.st.done && M.st.done.reason === 'solved' ? 'game.win' : 'duel.destroy', { gain:0.7 }, true);
  /* the setter reveals the answer to everyone (a burst of reveals) */
  if (!M.net || M.role === 'setter'){
    revealAnswer();
  }
  paint();
  const over = M.round >= M.rounds;
  setTimeout(() => { if (!M || M.dead) return; over ? finish() : nextRoundPrompt(); }, over ? 900 : 1500);
}
function revealAnswer(){
  if (!M.st) return;
  const word = M.myWord ? E.spell(M.myWord) : null;
  if (!word) return;
  /* fill remaining squares locally and, online, tell the guessers */
  const remaining = {};
  for (let i = 0; i < M.st.len; i++){
    if (M.st.slots[i] === -1 && word[i] >= 0) remaining[word[i]] = true;
  }
  E.fillAnswer(M.st, word);
  if (M.net){
    for (const c in remaining){
      const code = c | 0;
      const { mask } = E.positionsOf({ word, len: M.st.len }, code);
      say(M.setter, { t:'reveal', l: code, mask, wrong: 0 });
    }
  }
}
function nextRoundPrompt(){
  if (!M) return;
  /* keep the lobby together online; offline just roll on */
  beginRound();
  paint();
}

function finish(forced){
  if (!M || M.finished) return;
  M.finished = true;
  stopBot();
  cue('game.win', { gain:0.95 }, true);
  const me = firstLocalSeat();
  const scores = M.scores || (M.st ? M.st.scores : new Array(M.seats).fill(0));
  let top = 0; for (let i = 1; i < M.seats; i++) if (scores[i] > scores[top]) top = i;
  const iWon = me >= 0 && scores[me] === scores[top];
  if (!M.net && !M.recorded){ M.recorded = true; if (iWon) ST.rec.w++; else if (me >= 0) ST.rec.l++; persist(); }

  const order = [];
  for (let i = 0; i < M.seats; i++) order.push(i);
  order.sort((a, b) => scores[b] - scores[a]);
  const roster = (M.net && window.KARTI_MP && KARTI_MP.rosterSeats) ? (KARTI_MP.rosterSeats() || []) : [];
  let place = 0, lastSc = null;
  const rows = order.map((seat, i) => {
    if (lastSc === null || scores[seat] < lastSc){ place = i + 1; lastSc = scores[seat]; }
    const rs = roster.find(x => (x.seat | 0) === seat);
    return {
      name: isLocal(seat) ? T('You','Int') : seatName(seat),
      place, you: isLocal(seat), bot: ownerOf(seat) === 'ai',
      score: scores[seat] + ' ' + T('pts','pt'),
      border: (rs && rs.look && rs.look.b) || seatColour(seat).id,
      av: rs ? rs.av : undefined, pv: rs ? rs.pv : undefined
    };
  });
  const net = M.net;
  const title = iWon ? T('You spelt them under!', 'Spjegajthom!')
    : (me >= 0) ? T('Out-spelt', 'Mgħottija')
    : seatName(top) + ' ' + T('wins','jirbaħ');

  const show = window.KARTI_REBBIEH && window.KARTI_REBBIEH.show;
  if (!show){
    P.ui.result(M.ctx, { tone: iWon ? 'win' : 'lose', head: title,
      why: T('Most points across the rounds takes it.', 'L-aktar punti fir-rawnds jirbaħ.'),
      buttons: [{ label:T('Play again',"Erġa' lgħab"), icon:'refresh', cls:'primary',
          go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else setupSheet(); } },
        { label:T('Leave','Oħroġ'), icon:'back', cls:'ghost',
          go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }] });
    return;
  }
  const MPX = window.KARTI_MP;
  const staked = !!(net && MPX && MPX.MP && MPX.MP.stakeLive);
  const mid = 'ilforka:' + (net && MPX && MPX.MP && MPX.MP.code ? MPX.MP.code : 'local') + ':' + M.round;
  let pay = null;
  if (me >= 0 && window.KARTI_XP && KARTI_XP.awardPlay){
    try { const r = KARTI_XP.awardPlay({ game:'ilforka', won: iWon, draw:false, id: mid, ranked: staked }); if (r && r.counted) pay = r; } catch(e){}
  }
  try { if (me >= 0 && window.KARTI_STATS && KARTI_STATS.record) KARTI_STATS.record('ilforka', { result: iWon ? 'win' : 'loss', id: mid }); } catch(e){}
  let potRes = null;
  if (staked && me >= 0){ try { potRes = MPX.stakeSettle ? MPX.stakeSettle(iWon ? 'win' : 'lose') : null; } catch(e){} }

  show({
    title, subtitle: T('Final score','L-iskor finali'), rows, reduced: reduced(),
    lang: (window.KARTI_LANG ? KARTI_LANG.lang() : 'en'),
    xp: pay ? { level: pay.level, gained: pay.xp, leveledUp: !!pay.levelled, before:0, after: pay.levelled ? 1 : 0.7 } : null,
    reward: (pay || potRes) ? { xp: pay ? pay.xp : 0, chips: pay ? (pay.chips|0)+(pay.chipsLevel|0) : 0,
      wonBonus: pay ? pay.wonBonus : 0, staked: potRes ? potRes.ante : 0,
      pot: (potRes && potRes.kind === 'win') ? potRes.pot : 0 } : undefined,
    sound: id => cue(id, {}, true),
    playAgainLabel: net ? T('Back to the rooms','Lura fil-kmamar') : T('Play again',"Erġa' lgħab"),
    onPlayAgain: () => { leave(); if (net && net.onLeave) net.onLeave(); else setupSheet(); },
    onLeave: () => { leave(); if (net && net.onLeave) net.onLeave(); else P.hub(); }
  });
}

function leave(){ stopBot(); if (M){ M.dead = true; } M = null; UI = null; }

/* ═════════════ CSS ═════════════ */
let cssDone = false;
function injectCSS(){
  if (cssDone) return; cssDone = true;
  const s = document.createElement('style');
  s.textContent =
  '#scr-party .fk-wrap{display:flex;flex-direction:column;height:100%;min-height:0;gap:8px}' +
  '#scr-party .fk-top{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:2px 4px}' +
  '#scr-party .fk-seat{display:flex;align-items:center;gap:6px;padding:3px 9px 3px 4px;border-radius:999px;' +
    'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);font-size:12px;color:#cfc8e6}' +
  '#scr-party .fk-seat.on{border-color:var(--fc);box-shadow:0 0 0 1px var(--fc),0 0 12px -4px var(--fc);color:#fff}' +
  '#scr-party .fk-seat.set{opacity:.7}' +
  '#scr-party .fk-seat .fk-f{width:24px;height:24px;border-radius:50%;overflow:hidden;flex:0 0 auto}' +
  '#scr-party .fk-seat b{font-weight:700}#scr-party .fk-seat .fk-sc{font-weight:800;color:#FFE39A}' +
  '#scr-party .fk-gallows{flex:0 1 auto;display:grid;place-items:center;margin:2px 0}' +
  '#scr-party .fk-gallows svg{width:min(46vw,150px);height:auto}' +
  '#scr-party .fk-word{display:flex;flex-wrap:wrap;gap:5px 7px;justify-content:center;margin:6px 8px}' +
  '#scr-party .fk-slot{width:26px;height:34px;border-bottom:3px solid rgba(255,255,255,.35);' +
    'display:grid;place-items:center;font-family:var(--disp);font-weight:800;font-size:22px;color:#fff}' +
  '#scr-party .fk-slot.gap{border-bottom:0;width:12px}' +
  '#scr-party .fk-slot.fresh{animation:fkPop .3s ease both}' +
  '@keyframes fkPop{from{transform:scale(1.8) rotateX(80deg);opacity:0}to{transform:none;opacity:1}}' +
  '#scr-party .fk-hint{text-align:center;font-size:12.5px;color:#9a90b8;min-height:16px;margin:0 10px}' +
  '#scr-party .fk-keys{display:grid;grid-template-columns:repeat(8,1fr);gap:5px;margin:4px 6px 8px}' +
  '#scr-party .fk-key{min-height:38px;border-radius:9px;border:1px solid rgba(255,255,255,.12);' +
    'background:rgba(255,255,255,.06);color:#e8e0ff;font-family:var(--disp);font-weight:800;font-size:16px}' +
  '#scr-party .fk-key:disabled{opacity:.28}' +
  '#scr-party .fk-key.hit{background:rgba(61,220,132,.28);border-color:rgba(61,220,132,.6);color:#CFF7E0}' +
  '#scr-party .fk-key.miss{background:rgba(255,84,104,.22);border-color:rgba(255,84,104,.5);color:#FFB9C2;text-decoration:line-through}' +
  '#scr-party .fk-setword{display:flex;flex-direction:column;gap:12px;align-items:center;padding:18px 14px}' +
  '#scr-party .fk-setword input{width:100%;max-width:320px;text-align:center;font-family:var(--disp);' +
    'font-weight:800;font-size:22px;letter-spacing:3px;text-transform:uppercase;padding:12px;border-radius:12px;' +
    'background:#0f0b1e;border:1px solid rgba(255,255,255,.15);color:#fff}' +
  '#scr-party .fk-menu .blurb{color:#b9b0d4;font-size:14px;line-height:1.5;margin:10px 0 16px}';
  document.head.appendChild(s);
}

/* ═════════════ the gallows drawing (0..6) ═════════════ */
function gallowsSVG(n){
  const P0 = 'stroke="#C9A46A" stroke-width="5" stroke-linecap="round" fill="none"';
  const B  = 'stroke="#E8E0FF" stroke-width="4" stroke-linecap="round" fill="none"';
  let s = '<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg">';
  s += '<path ' + P0 + ' d="M15 140 H80"/>';                 /* base   */
  s += '<path ' + P0 + ' d="M30 140 V15 H82"/>';             /* post+beam */
  s += '<path ' + P0 + ' d="M82 15 V30"/>';                  /* rope   */
  const parts = [
    '<circle ' + B + ' cx="82" cy="42" r="12"/>',            /* head   */
    '<path ' + B + ' d="M82 54 V88"/>',                      /* torso  */
    '<path ' + B + ' d="M82 62 L66 78"/>',                   /* L arm  */
    '<path ' + B + ' d="M82 62 L98 78"/>',                   /* R arm  */
    '<path ' + B + ' d="M82 88 L68 112"/>',                  /* L leg  */
    '<path ' + B + ' d="M82 88 L96 112"/>'                   /* R leg  */
  ];
  for (let i = 0; i < Math.min(6, n); i++) s += parts[i];
  return s + '</svg>';
}

/* ═════════════ paint ═════════════ */
function paint(){
  if (!M || !UI) return;
  const st = M.st;
  /* seat chips with scores */
  let chips = '';
  const scores = M.scores || (st ? st.scores : new Array(M.seats).fill(0));
  for (let i = 0; i < M.seats; i++){
    const c = seatColour(i);
    const on = st && st.turn === i && !st.done;
    const setter = st && st.setter === i;
    chips += '<span class="fk-seat' + (on ? ' on' : '') + (setter ? ' set' : '') + '" style="--fc:' + c.hex + '">' +
      '<span class="fk-f">' + chipFace(i) + '</span>' +
      '<b>' + esc(seatName(i)) + '</b>' + (setter ? ' ✎' : '') +
      '<span class="fk-sc">' + (scores[i] | 0) + '</span></span>';
  }
  UI.top.innerHTML = chips;
  /* gallows */
  UI.gallows.innerHTML = gallowsSVG(st ? E.gallows(st) : 0);
  /* word slots */
  if (st){
    let w = '';
    for (let i = 0; i < st.len; i++){
      const v = st.slots[i];
      if (v === -2) w += '<span class="fk-slot gap"></span>';
      else w += '<span class="fk-slot' + (v >= 0 ? '' : '') + '">' + (v >= 0 ? esc(E.letOf(v)) : '') + '</span>';
    }
    UI.word.innerHTML = w;
  } else { UI.word.innerHTML = ''; }
  /* keyboard */
  const me = mySeat();
  const myTurn = st && !st.done && st.turn === me && me !== st.setter && !M.pending;
  let keys = '';
  for (let c = 0; c < E.NLET; c++){
    const done = st && st.guessed[c];
    let cls = '';
    if (done && st){
      /* was it a hit? a hit shows in the slots */
      const hit = st.slots.indexOf(c) >= 0;
      cls = hit ? ' hit' : ' miss';
    }
    keys += '<button class="fk-key' + cls + '" data-c="' + c + '"' +
      ((done || !myTurn) ? ' disabled' : '') + '>' + esc(E.letOf(c)) + '</button>';
  }
  UI.keys.innerHTML = keys;
  UI.keys.querySelectorAll('.fk-key').forEach(b => b.onclick = () => tryGuess(b.getAttribute('data-c') | 0));
  /* hint */
  UI.hint.textContent = hintText();
}
function hintText(){
  const st = M.st, me = mySeat();
  if (!st) return M.role === 'setter'
    ? T('Choose a word…','Agħżel kelma…')
    : T('Waiting for the word…','Nistennew il-kelma…');
  if (st.done) return st.done.reason === 'solved'
    ? seatName(st.done.winner) + ' ' + T('spelt it!','spjegaha!')
    : T('He hangs — ','Iddendel — ') + seatName(st.setter) + ' ' + T('wins the round','jieħu r-rawnd');
  if (me === st.setter) return T('They are guessing your word…','Qed jaqtgħu l-kelma tiegħek…');
  if (st.turn === me) return M.pending ? T('…','…') : T('Your turn — call a letter','Imissek — sejjaħ ittra');
  return seatName(st.turn) + ' — ' + T('their turn','imisshom');
}
function chipFace(i){
  try {
    const XP = window.KARTI_XP; if (!XP || !XP.avatarHTML) return '';
    if (isLocal(i)) return XP.avatarHTML(seatName(i), { size:24, me: ownerOf(i) === 'me' });
    if (M && M.net && window.KARTI_MP && KARTI_MP.rosterSeats){
      const rs = KARTI_MP.rosterSeats() || [];
      for (const s of rs) if ((s.seat|0) === i) return XP.avatarHTML(s.name || seatName(i),
        { size:24, who: s.av || undefined, pv: s.pv || 0, hint: s.look && s.look.f, border: s.look && s.look.b });
    }
    return XP.avatarHTML(seatName(i), { size:24 });
  } catch(e){ return ''; }
}

/* ═════════════ the frame + boards ═════════════ */
function openBoard(onBack){
  injectCSS(); P.show();                 /* the board must be the VISIBLE screen */
  M.ctx = P.ui.frame({
    title: T('Il-Forka','Il-Forka'), onBack, leave: () => leave(),
    buttons: [ { id:'fk-rules', label:T('Rules','Regoli'), icon:'book', cls:'ghost' } ]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();
  M.ctx.badge.textContent = M.net ? T('Online','Onlajn') : M.mode === 'pnp' ? T('Pass & play','Għaddi u lgħab') : levelName(M.lvl);
  const b = M.ctx.board;
  b.style.cssText = 'display:block;grid-template-columns:none;grid-template-rows:none;width:100%;max-width:520px;border:0;box-shadow:none;overflow:visible;background:transparent';
  b.innerHTML =
    '<div class="fk-wrap">' +
      '<div class="fk-top"></div>' +
      '<div class="fk-gallows"></div>' +
      '<div class="fk-word"></div>' +
      '<div class="fk-hint"></div>' +
      '<div class="fk-keys"></div>' +
    '</div>';
  UI = { top: b.querySelector('.fk-top'), gallows: b.querySelector('.fk-gallows'),
         word: b.querySelector('.fk-word'), hint: b.querySelector('.fk-hint'), keys: b.querySelector('.fk-keys') };
  const btn = M.ctx.btn ? M.ctx.btn('fk-rules') : null;
  if (btn) btn.onclick = () => openRules();
  paint();
}
function openRules(){
  const el = P.ui.screenEl ? null : null;
  P.ui.confirm ? P.ui.confirm({
    title: T('Il-Forka — the rules','Il-Forka — ir-regoli'),
    body: rulesFor().join('<br><br>'),
    yes: T('Got it','Fhimt'), no: ''
  }) : alert(rulesFor().join('\n\n'));
}
function rulesFor(){
  return [
    T('One player sets a secret word. Everyone else takes turns <b>calling a letter</b>.',
      'Plejer iqiegħed kelma moħbija. Il-bqija bir-rotazzjoni <b>isejħu ittra</b>.'),
    T('A letter that is <b>in the word</b> is revealed and scores you a point for every square it fills — and you go again.',
      'Ittra <b>fil-kelma</b> tinkixef u ġġiblek punt għal kull kaxxa li timla — u terġa\' int.'),
    T('A letter that is <b>not</b> in it adds a piece to the gallows and passes the turn. Six wrong and he hangs.',
      'Ittra li <b>mhix</b> fiha żżid biċċa mal-forka u tgħaddi t-turn. Sitta ħżiena u jiddendel.'),
    T('Spell the whole word to take the round; let him hang and the <b>setter</b> takes it. Most points wins.',
      'Spjega l-kelma kollha biex tieħu r-rawnd; ħallih jiddendel u <b>min qiegħed</b> jeħodha. L-aktar punti jirbaħ.')
  ];
}

/* ═════════════ the SET-WORD screen (setter types a word) ═════════════ */
function showSetWord(){
  injectCSS(); P.show();
  const el = P.ui.screenEl();
  el.innerHTML =
    '<div class="pt-wrap fk-menu"><div class="tbar">' +
      '<button class="iconbtn" id="fk-sb" aria-label="' + esc(T('Back','Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + esc(T('Set a word','Qiegħed kelma')) + '</h2></div>' +
    '<div class="scroll"><div class="fk-setword">' +
      '<p class="blurb" style="text-align:center">' +
        esc(T('Type a word for the others to guess. They will not see it.',
              'Ikteb kelma biex l-oħrajn jaqtgħu. Mhux se jarawha.')) + '</p>' +
      '<input id="fk-wi" maxlength="24" autocomplete="off" autocapitalize="characters" ' +
        'spellcheck="false" placeholder="' + esc(T('your word','il-kelma tiegħek')) + '">' +
      '<p class="fk-hint" id="fk-werr"></p>' +
      '<button class="btn primary" id="fk-wgo" style="width:100%;max-width:320px">' +
        esc(T('Set it','Qiegħdha')) + '</button>' +
    '</div></div></div>';
  el.querySelector('#fk-sb').onclick = () => { cue('ui.back'); if (M && M.net){ const n = M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } else setupSheet(); };
  const inp = el.querySelector('#fk-wi'), err = el.querySelector('#fk-werr'), go = el.querySelector('#fk-wgo');
  const submit = () => {
    const word = (inp.value || '').trim();
    const why = E.checkWord(word);
    if (why){ err.textContent = why === 'short' ? T('At least 3 letters.','Tal-anqas 3 ittri.') : T('Too long.','Twila wisq.'); cue('ui.error',{gain:0.5}); return; }
    startRoundWord(word.toUpperCase(), M.setter);
    if (M.net) say(M.setter, { t:'setword', l: M.st.len });
    openBoard(() => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else setupSheet(); });
    paint();
    maybeBot();
  };
  go.onclick = submit;
  inp.onkeydown = e => { if (e.key === 'Enter') submit(); };
  setTimeout(() => { try { inp.focus(); } catch(e){} }, 150);
}

/* ═════════════ menus ═════════════ */
function heroSVG(){ return gallowsSVG(3); }
function canGoOnline(){ try { return !!(window.KARTI_MP && KARTI_MP.openFor && P.online && P.online.ilforka); } catch(e){ return false; } }
function setupSheet(){
  injectCSS(); P.show(); stopBot(); M = null; UI = null;
  const el = P.ui.screenEl();
  const online = canGoOnline();
  el.innerHTML =
    '<div class="pt-wrap fk-menu"><div class="tbar">' +
      '<button class="iconbtn" id="fk-back" aria-label="' + esc(T('Back','Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + esc(T('Il-Forka','Il-Forka')) + '</h2></div>' +
    '<div class="scroll">' +
      '<div class="fk-gallows" aria-hidden="true" style="margin:8px 0">' + heroSVG() + '</div>' +
      '<p class="blurb">' + T('Set a word, or race to guess one. A point a letter — spell it before the man hangs.',
        'Qiegħed kelma, jew iġri biex taqtgħha. Punt kull ittra — spjegaha qabel jiddendel.') + '</p>' +
      '<div style="display:grid;gap:9px;margin-top:4px">' +
        (online ? '<button class="btn primary" id="fk-online">' + ico('users') + ' ' + esc(T('Play online','Ilgħab onlajn')) + '</button>' : '') +
        '<button class="btn' + (online ? ' ghost' : ' primary') + '" id="fk-ai">' + ico('coach') + ' ' + esc(T('Play with the machine','Ilgħab mal-magna')) + '</button>' +
        '<button class="btn ghost" id="fk-pnp">' + ico('users') + ' ' + esc(T('Pass the phone','Għaddi t-telefon')) + '</button>' +
        '<button class="btn ghost" id="fk-rulesbtn">' + ico('book') + ' ' + esc(T('How to play','Kif tilgħab')) + '</button>' +
      '</div>' +
      (ST.rec.w + ST.rec.l ? '<p class="pt-ledger" style="margin-top:14px">' +
        T('So far: <b>'+ST.rec.w+'</b> won, <b>'+ST.rec.l+'</b> lost.',
          'S’issa: <b>'+ST.rec.w+'</b> rebħin, <b>'+ST.rec.l+'</b> mitlufin.') + '</p>' : '') +
    '</div></div>';
  el.querySelector('#fk-back').onclick = () => { cue('ui.back'); P.hub(); };
  const on = el.querySelector('#fk-online');
  if (on) on.onclick = () => { if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('ilforka'); };
  el.querySelector('#fk-ai').onclick = () => offlineSetup('ai');
  el.querySelector('#fk-pnp').onclick = () => offlineSetup('pnp');
  el.querySelector('#fk-rulesbtn').onclick = () => openRules();
}
function offlineSetup(mode){
  if (mode === 'ai'){
    startMatch({ seats:2, rounds: pref().rounds || 3, mode:'ai', lvl: pref().lvl || 2 });
    M.meta = [ { own:'me', name:myName() }, { own:'ai' } ];
    beginRound();
    openBoard(() => { leave(); setupSheet(); });
    return;
  }
  /* pass-the-phone: choose player count, then the first setter types a word */
  injectCSS(); P.show();
  const el = P.ui.screenEl();
  let seats = Math.max(2, Math.min(6, pref().seats || 2));
  const paintMenu = () => {
    el.innerHTML =
      '<div class="pt-wrap fk-menu"><div class="tbar">' +
        '<button class="iconbtn" id="fk-b2"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(T('Pass the phone','Għaddi t-telefon')) + '</h2></div>' +
      '<div class="scroll"><p class="blurb">' + esc(T('How many players?','Kemm-il plejer?')) + '</p>' +
        '<div style="display:flex;gap:9px;margin:4px 0 16px">' +
          [2,3,4,5,6].map(n => '<button class="btn' + (n===seats?' primary':' ghost') + '" data-n="'+n+'" style="flex:1">'+n+'</button>').join('') +
        '</div>' +
        '<button class="btn primary" id="fk-go" style="width:100%">' + esc(T('Start','Ibda')) + '</button>' +
      '</div></div>';
    el.querySelector('#fk-b2').onclick = () => { cue('ui.back'); setupSheet(); };
    el.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { seats = b.getAttribute('data-n')|0; pref({ seats }); paintMenu(); });
    el.querySelector('#fk-go').onclick = () => {
      startMatch({ seats, rounds: pref().rounds || 3, mode:'pnp' });
      M.meta = []; for (let i = 0; i < seats; i++) M.meta.push({ own:'hot', name: seatTitle(i) });
      beginRound();
    };
  };
  paintMenu();
}

/* ═════════════ THE ONLINE CONTROLLER ═════════════ */
const hooks = {
  onMove(fn){
    const f = ev => { if (ev) fn(ev.move, { seat: ev.seat, src: ev.src }); };
    moveSubs.push(f);
    return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); };
  },
  phase(){ return M ? 'play' : 'idle'; },
  apply(seat, move){ if (!M) return { ok:false, why:'no forka' }; return onlineRemote(seat, move); },
  attachNet(net){ if (M) M.net = net || null; },
  setOwner(i, own){ if (M && M.meta && M.meta[i]) M.meta[i].own = own; },
  setName(i, name){ if (M && M.meta && M.meta[i] && name) M.meta[i].name = name; },
  live(){ return !!(M && !M.dead && M.st && !M.st.done); },
  seatBack(){ if (M && UI) paint(); },
  seatGone(seat){
    if (!M || M.dead) return;
    seat = seat | 0;
    /* the SETTER left mid-round: nobody can referee, so end the round with
       no winner and roll the setter on. */
    if (M.st && !M.st.done && seat === M.st.setter){
      M.st.done = { winner: -1, reason: 'gone' };
      paint();
      setTimeout(() => { if (M && !M.dead){ M.round >= M.rounds ? finish() : nextRoundPrompt(); } }, 900);
    }
    if (M.meta && M.meta[seat]) M.meta[seat].own = 'net';
    paint();
  },
  soleWin(seat, pot){
    if (!M || M.dead || M.finished || !M.net) return;
    const me = firstLocalSeat(); if (me < 0) return;
    M.solePot = pot || null; finish(true);
  }
};

function onlineStart(cfg){
  cfg = cfg || {};
  injectCSS(); P.show();
  const list = cfg.seats || [];
  const n = Math.max(2, Math.min(8, list.length || 2));
  startMatch({ seats:n, rounds: pref().rounds || 3, mode:'net' });
  M.meta = [];
  for (let i = 0; i < n; i++){ const s = list[i] || {}; M.meta.push({ own: (i === cfg.you) ? 'me' : 'net', name: s.name || seatTitle(i) }); }
  M.net = cfg.net || null;
  M.net && (M.net.you = cfg.you);
  M.finished = false;
  hooks.attachNet(cfg.net || null);
  /* seat 0 opens the board frame immediately; the first setter is seat 0,
     who gets the set-word screen. others open the board and wait. */
  M.round = 0;
  const me = mySeat();
  beginRound();
  if (M.role !== 'setter') openBoard(() => { const nn = M && M.net; leave(); if (nn && nn.onLeave) nn.onLeave(); else P.hub(); });
  return { v:1, gid:'ilforka' };
}
function onlineRemote(seat, wire){
  if (!M) return { ok:false, why:'no forka' };
  const mv = E.decWire(wire) || wire;
  if (mv.t === 'setword'){
    /* the setter announced the word length; guessers build a blind board */
    startRoundBlind(mv.l | 0, seat);
    if (!M.ctx || !UI) openBoard(() => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); });
    paint();
    return { ok:true };
  }
  if (mv.t === 'guess'){
    /* only the SETTER's phone rules on a guess */
    if (M.st && mySeat() === M.st.setter && !M.st.done){
      const ruling = E.referee(M.st, mv.l | 0, seat);
      if (ruling){ say(M.st.setter, { t:'reveal', l: ruling.l, mask: ruling.mask, wrong: ruling.wrong }); afterRuling(seat, ruling); }
    }
    return { ok:true };
  }
  if (mv.t === 'reveal'){
    /* everyone (including the setter, idempotently) folds the reveal in */
    if (M.st && !M.st.done){
      const guesser = M.st.turn;
      const applied = E.applyReveal(M.st, mv, guesser);
      if (applied){ afterRuling(guesser, { wrong: mv.w, count: 0 }); }
    }
    return { ok:true };
  }
  return { ok:false, why:'unknown' };
}
function onlineNote(text, tone){ if (M && M.ctx) P.ui.setNet(M.ctx, text || '', tone || ''); }
function onlineStop(why, tone){
  if (!M || !M.ctx) return;
  P.ui.setNet(M.ctx, '', '');
  P.ui.result(M.ctx, { tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? T('No result','Ebda riżultat') : T('Cut off','Inqata’'),
    why: why || T('The game stopped.','Il-logħba waqfet.'),
    quip: T('Nobody lost anything.','Ħadd ma tilef xejn.'),
    buttons: [{ label:T('Back to the rooms','Lura fil-kmamar'), icon:'back', cls:'primary',
      go: () => { const n = M && M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }] });
}

P.online = P.online || {};
P.online.ilforka = { start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  live: () => !!(M && !M.dead && M.st && !M.st.done), hooks };

/* ═════════════ lobby contract + shelf ═════════════ */
const LOBBY = {
  id:'ilforka', name:'Il-Forka', mt:'Il-Forka',
  minSeats: E.MIN_SEATS, maxSeats: E.MAX_SEATS,
  levels: LEVELS.map(L => ({ level:L.level, name:L.name, note:T(L.note.en, L.note.mt) })),
  defaultLevel: 2,
  isReady: seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(list){
    const n = (list || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why:T('Il-Forka needs at least two.','Il-Forka trid tal-anqas tnejn.') };
    if (n > E.MAX_SEATS) return { ok:false, why:T('Up to eight can play.','Sa tmienja jistgħu jilagħbu.') };
    const un = (list || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (un) return { ok:false, why: un + (un > 1 ? T(' people are not ready yet.',' persuni għadhom mhux lesti.') : T(' person is not ready yet.',' persuna għadha mhux lesta.')) };
    return { ok:true, why:'' };
  },
  rulesHTML: () => '<p>' + rulesFor().join('</p><p>') + '</p>',
  blurb: T('Set a word, guess a word. A point a letter.','Qiegħed kelma, aqta’ kelma. Punt kull ittra.'),
  start(seats){
    const n = Math.max(2, Math.min(6, (seats && seats.length) || 2));
    startMatch({ seats:n, rounds: pref().rounds || 3, mode:'pnp' });
    M.meta = []; for (let i = 0; i < n; i++) M.meta.push({ own:'hot', name: seatTitle(i) });
    beginRound();
    return { v:1, gid:'ilforka' };
  },
  myName, wire: { fields: E.WIRE_FIELDS }, takeback: false
};
R.lobby = LOBBY;

const TILE = {
  id:'ilforka', order:30, kind:'board', cat:'word', name:'Il-Forka', mt:'Il-Forka', icon:'book', status:'live',
  get tag(){ return T('Hangman, the Maltese way — set a word or race to guess one, a point for every letter you pull out before the man swings.',
    'Il-forka bil-Malti — qiegħed kelma jew iġri biex taqtgħha, punt għal kull ittra li toħroġ qabel jiddendel.'); },
  open: () => setupSheet(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS }, levels: LOBBY.levels,
  rulesHTML: () => LOBBY.rulesHTML(), start: (list) => LOBBY.start(list)
};
R.shelfTile = TILE;
R.ui = { open: setupSheet, leave, injectCSS };
R.open = () => setupSheet();
R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

/* test hooks — inert unless ?forkatest */
if (/[?&]forkatest\b/.test(location.search || '')){
  window.__FORKA_TEST = {
    setupSheet, offlineSetup, startMatch, beginRound, startRoundWord, startRoundBlind,
    tryGuess, paint, get M(){ return M; }, get UI(){ return UI; },
    engine: E, LOBBY, hooks, online: P.online.ilforka, leave, showSetWord, openBoard
  };
}

})();
