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

/* ── UI-only preference, in its OWN key (the dock rule rummy and gin
   follow): how you keep the setup sheet's rules folded is not the
   battle, so it never rides in the save slot and binning a battle
   never forgets it. CLOSED by default — the sheet's job is sailing. ── */
const UIKEY = 'karti_gharraq_ui_v1';
let setupOpen = false;
try { setupOpen = localStorage.getItem(UIKEY + '.setup') === '1'; } catch(e){}
function setSetupOpen(open){
  setupOpen = !!open;
  try { localStorage.setItem(UIKEY + '.setup', setupOpen ? '1' : '0'); } catch(e){}
}

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
/* G = { st, mode:'ai'|'online', mySeat, net, root, els,
   view:'them'|'mine', target:int, aim:{c,o,x}, q:[], busy, dead }

   TWO WAYS TO PLAY, AND PASS-THE-PHONE IS NOT ONE OF THEM.
   Chess and dama survive being handed round a table because there is
   nothing hidden on the board. This game IS the hidden grid: handing
   the phone over means the next player walks past the last player's
   fleet, and the curtain screen that used to paper over that was a
   thing you had to TRUST rather than a thing that was true. So the
   only seats are `me` (this phone) and everybody else — a machine
   here, or a person on their own phone through the relay. Every
   `whose hand is on the glass` question therefore has one answer,
   G.mySeat, which is why they are all gone. */

let moveSubs = [];          /* hooks.onMove listeners (js/mp.js) */

function myTurn(){
  return !!(G && G.st.phase === 'play' && !G.busy && !G.dead &&
            G.st.seats[G.st.turn] && G.st.seats[G.st.turn].kind === 'human' &&
            G.st.turn === G.mySeat);
}

/* ── offline save ─────────────────────────────────────────────────── */
function saveGame(){
  if (!G || G.dead || G.mode === 'online') return;
  if (!G.st || G.st.phase === 'done'){ clearSave(); return; }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v:1, at: Date.now(), mode: G.mode, mySeat: G.mySeat,
      stage: G.stage, snap: E.snapshot(G.st)
    }));
  } catch(e){}
}
function loadSave(){
  try {
    const j = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!j || j.v !== 1 || !j.snap) return null;
    /* A SAVE FROM THE PASS-THE-PHONE ERA CANNOT BE RESUMED, and must not
       strand anybody: that board has two human seats on one device and
       there is no longer a screen that can play the second one. It is
       dropped, once, with a sentence saying so, rather than loading into
       a mode nothing can drive. */
    if (j.mode === 'pnp'){
      clearSave();
      try { if (K && K.toast) K.toast('That saved battle was a pass-the-phone one. ' +
        'GĦARRAQHOM is online or against the phone now — deal a fresh sea.'); } catch(e){}
      return null;
    }
    if (j.mode !== 'ai') return null;
    return j;
  } catch(e){ return null; }
}
function clearSave(){ try { localStorage.removeItem(SAVE_KEY); } catch(e){} }
/* BINNING HAS TO KILL THE IN-MEMORY BOARD TOO. Clearing the slot alone
   was not enough and the test caught it: the game object was still
   alive behind the sheet, so the next visibilitychange or pagehide —
   a reload, switching apps — ran saveGame() and wrote the battle
   straight back. The player binned it, came back, and there it was. */
function binSave(){
  clearSave();
  if (G){
    G.dead = true;
    if (G.ro){ try { G.ro.disconnect(); } catch(e){} }
    G = null;
  }
  clearSave();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
window.addEventListener('pagehide', () => saveGame());

/* ── one local PRNG for shuffle buttons (never the shared stream) ── */
let uiRng = { rng: (Date.now() ^ 0x5DEECE66) >>> 0 };

/* ── reduced motion, the same two doors cardview.js honours ────────── */
function reducedMo(){
  try {
    if (document.body && document.body.classList.contains('reduced')) return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch(e){ return false; }
}

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
  /* a remote fleet arriving is also that player's skin arriving: the
     `e` byte rides the {t:'place'} move (so a rejoin's replay restores
     it), validated through SKIN_FROM_WIRE — absent or unknown is stock */
  if (mv && mv.t === 'place') setSeatSkin(seat | 0, SKIN_FROM_WIRE[mv.e | 0] || '');
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
  G.atk = null;                 /* the volley is over; the gun is mine again */
  if (G.st.phase === 'done') return;
  if (G.stage === 'place'){ paintPlace(); return; }
  paintBoard();
}

function act(e, done){
  switch (e.e){
    case 'phase':
      if (e.phase === 'play'){ G.stage = 'board'; paintBoard(); }
      return done(250);
    case 'placed': {
      if (G.stage === 'place') paintPlaceWait();
      return done(120);
    }
    case 'draw': return reveal(e, done);
    case 'turn': {
      if (G.st.phase === 'play' && myTurnSeat(e.s)) sfx('duel.turn', { gain:0.5 });
      G.target = pickTarget();
      G.aim = null;
      G.atk = null;             /* new turn: fx and rings are the aimer's again */
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
      sfx('sea.sonar');
      /* the returns still climb: one note per boat square the ping found,
         under the ping itself, so the count is audible before it is read */
      for (let i = 0; i < Math.min(e.n, 5); i++) setTimeout(() => note(i, { gain:0.5 }), 260 + 160 * i);
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
      /* a walk-out ranks like a sinking: note when the chair emptied so
         the final standings can place quitters under the survivors */
      (G.gone || (G.gone = [])).push(e.s);
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
function myTurnSeat(s){ return s === G.mySeat; }
function seatMe(){ return G.mySeat; }
function nameOf(s){ return (G.st.seats[s] && G.st.seats[s].name) || ('Seat ' + (s + 1)); }

/* ── the card reveal — the gotcha moment, on every phone at once ── */
function reveal(e, done){
  const pat = E.PATTERNS[e.p];
  paintBoard();
  const host = G.root;
  const old = host.querySelector('.bs-reveal');
  if (old) old.remove();
  const who = e.s === seatMe() ? 'YOU DREW' : nameOf(e.s).toUpperCase() + ' DREW';
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
  if (pat.big === 2){ sfx('pack.charge'); setTimeout(() => sfx('sea.horn'), 620); }
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

/* ── a volley landing, shell by shell ─────────────────────────────────
   THE SALVO, IN THREE BEATS. Anticipation: the launch glow on the
   shooter's rail, then the shells themselves in the air — each one a
   tracer arcing in from the shooter's side of the sea while its landing
   shadow grows on the square it is about to ruin. Impact: the burst and
   shockwave on a hull, the plume that stands up and falls back on open
   water. Aftermath: the scorch that stays, the last shell of a salvo
   landing a beat late and hardest, the stage kicked by the big cards,
   and a boat that goes down doing it in full view — revealed, listing,
   settling — under sea.sink.

   ALL OF IT IS PRESENTATION. The engine resolved this volley before the
   first frame; the timetable below only decides when the phone admits
   each part. Compositor-only: every moving thing animates transform /
   opacity (the sink wobble uses the individual rotate/translate
   properties so it composes with a vertical boat's 90° transform).
   Wall-clock: impacts keep the old 170/260ms rhythm; the only paid
   additions are +200ms of lead-in on the two big:2 cards and one +90ms
   breath before the final shell of a multi-shell salvo. */
function volley(e, done){
  /* always watch the grid being shot at */
  G.target = e.g;
  G.view = (e.g === G.mySeat) ? 'mine' : 'them';
  /* WHOSE ORDNANCE THIS IS. The headline of an exclusive set is the
     firing sequence, and the firing sequence belongs to the SHOOTER:
     when Roża fires at the Armada, a sparkle-charge and a glinting
     star land on spectral water — on every phone at the table. The
     paint below stamps bs-atk-<shooter's skin> on the gwrap; cleared
     on 'turn' / idle so the aim ring goes back to the local aimer. */
  G.atk = e.s;
  paintBoard();
  const pat = E.PATTERNS[e.p] || E.PATTERNS[0];
  const heavy = pat.big === 2;
  const rm = reducedMo();
  const fromTop = (e.g === G.mySeat);      /* shells arrive from the enemy */
  const px = cellPxNow();
  sfx('duel.attack');
  /* the wait is the drama, so the wait gets a sound. ONE whistle per salvo,
     not one per shell — six overlapping whistles is a kettle, not a bombardment
     — and skipped entirely when motion is reduced, because then there is no
     flight for it to be under. */
  if (!rm) sfx('sea.whistle', { gain: heavy ? 0.42 : 0.3 });
  fxMuzzle(fromTop, heavy);
  const step = e.cells.length > 4 ? 170 : 260;
  const flight = heavy ? 520 : 400;        /* time in the air, overlapped */
  let anyHit = false;
  for (let i = 0; i < e.cells.length; i++) if (e.cells[i].r === 'hit') anyHit = true;
  let t = heavy ? 620 : 420;
  for (let i = 0; i < e.cells.length; i++){
    const c = e.cells[i];
    const last = i === e.cells.length - 1;
    if (last && e.cells.length > 1) t += 90;      /* a breath before the closer */
    const at = t;
    if (!rm){
      const launch = Math.max(0, at - flight);
      setTimeout(() => { if (G) fxShell(e.g, c.c, fromTop, at - launch, px, heavy); }, launch);
    }
    setTimeout(() => {
      if (!G) return;
      markCell(e.g, c);
      if (c.r === 'hit'){
        sfx('duel.hit');
        fxHit(e.g, c.c, px, heavy && last);
        if (heavy && last) quake(true);
        else if (last && anyHit && e.cells.length > 1) quake(false);
      } else if (c.r === 'miss'){
        sfx('sea.splash');
        fxMiss(e.g, c.c, px);
      } else {
        sfx('ui.tap', { gain:0.3 });
        fxOld(e.g, c.c, px);
      }
    }, at);
    t += step;
  }
  if (e.sunk.length){
    for (let k = 0; k < e.sunk.length; k++){
      const id = e.sunk[k];
      setTimeout(() => {
        if (!G) return;
        /* ONE BOAT going under. A whole FLEET going under is the louder
           thing below, and the two must not sound the same — that is the
           difference between "they lost the luzzu" and "they are out".
           The picture is painted WITH the sound: G.fxSink tags this hull
           so the repaint draws it with the sinking animation — on an
           enemy sea that is also the moment the boat is first REVEALED,
           which is the whole reward of the shot. */
        sfx('sea.sink');
        G.fxSink = id;
        banner('GĦEREQ ' + E.FLEET[id].name.toUpperCase() + ' of ' + nameOf(e.g) + '!', 'hot');
        paintBoard();
        G.fxSink = -1;
        quake(false);
        /* the sea closes over it: foam rings walk the length of the
           hull while it lists, bow to stern */
        if (!rm){
          const seat2 = G.st.seats[e.g];
          const sh2 = seat2 && seat2.ships ? seat2.ships.find(s2 => s2.id === id) : null;
          if (sh2){
            const px2 = cellPxNow();
            for (let j = 0; j < sh2.cells.length; j++){
              const fc = sh2.cells[j];
              setTimeout(() => { if (G) fxFoam(e.g, fc, px2); }, 120 + j * 110);
            }
          }
        }
      }, t + 420 + k * 800);
    }
    t += 420 + e.sunk.length * 800;
  }
  if (e.dead !== undefined){
    /* WHO WENT DOWN, AND IN WHAT ORDER. The engine keeps no elimination
       clock — a seat is simply `out` — so the order the fleets went under
       is remembered here, at the only moment it is known, for the final
       standings: in a free-for-all "outlasted three navies" is the honest
       rank between the losers. Recorded synchronously (not inside the
       theatre timeout) so a finish that lands in the same volley still
       has it. */
    (G.gone || (G.gone = [])).push(e.dead);
    setTimeout(() => {
      if (!G) return;
      sfx('duel.destroy');
      setTimeout(() => sfx('board.mate'), 180);
      banner(nameOf(e.dead).toUpperCase() + ' HAS NO FLEET LEFT. GĦARRAQHOM.', 'hot');
      paintBoard();
      quake(true);
    }, t + 500);
    t += 1300;
  }
  done(t + 420);
}

/* ── the fx layer: everything transient lands in .bs-fx, a clipped,
   pointer-blind sheet over the sea. Positions are written ONCE at
   spawn (left/top/width/height are never animated); the motion is all
   keyframes on transform and opacity. ───────────────────────────── */
function fxHost(g){
  if (!G || !G.root) return null;
  const showingTarget = (G.view === 'them' && G.target === g) ||
                        (G.view === 'mine' && seatViewable() === g);
  if (!showingTarget) return null;
  return G.root.querySelector('.bs-gwrap .bs-fx');
}
function cellPxNow(){
  const el = G && G.root && G.root.querySelector('#bs-grid');
  if (!el) return gridPx();
  const w = el.getBoundingClientRect().width;
  return w ? w / E.W : gridPx();
}
function fxDrop(host, cls, c, px, css, html, life){
  const el = document.createElement('div');
  el.className = cls;
  el.style.cssText = 'left:' + (E.CX(c) * px) + 'px;top:' + (E.CY(c) * px) + 'px;' +
    'width:' + px + 'px;height:' + px + 'px;' + (css || '');
  el.innerHTML = html;
  host.appendChild(el);
  setTimeout(() => { if (el.isConnected) el.remove(); }, life);
}
/* the shell in the air: <u> is the landing shadow growing on the target
   square, <i> the tracer arcing in from the shooter's rail */
function fxShell(g, c, fromTop, dur, px, heavy){
  const host = fxHost(g); if (!host) return;
  const sy = fromTop ? -(E.CY(c) * px + px) : (E.H * px - E.CY(c) * px);
  const sx = ((E.W / 2 - 0.5) - E.CX(c)) * px * 0.5;
  fxDrop(host, 'bs-shell' + (heavy ? ' hv' : ''), c, px,
    '--sx:' + sx.toFixed(1) + 'px;--sy:' + sy.toFixed(1) + 'px;--fd:' + (dur | 0) + 'ms;',
    '<u></u><i></i>', dur + 80);
}
function fxHit(g, c, px, big){
  const host = fxHost(g); if (!host) return;
  /* the element outlives the stock animation by a few hundred ms so the
     EXCLUSIVE SKINS (kit shelf, end of file) can stage a longer show —
     smoke drifting, glitter falling — on the same spawn. Stock is
     visually identical: every stock keyframe fills `both` and ends at
     opacity 0, so the extra time is an invisible, pointer-blind div. */
  fxDrop(host, 'bs-boom' + (big ? ' big' : ''), c, px, '', '<i></i><u></u>', big ? 1300 : 1100);
}
function fxMiss(g, c, px){
  const host = fxHost(g); if (!host) return;
  fxDrop(host, 'bs-plume', c, px, '', '<u></u><i></i>', 1100);
}
function fxOld(g, c, px){
  const host = fxHost(g); if (!host) return;
  fxDrop(host, 'bs-fizz', c, px, '', '<u></u>', 500);
}
function fxFoam(g, c, px){
  const host = fxHost(g); if (!host) return;
  fxDrop(host, 'bs-foam', c, px, '', '<u></u>', 1000);
}
/* the launch: a glow along the rail the shells leave from */
function fxMuzzle(fromTop, heavy){
  if (reducedMo() || !G || !G.root) return;
  const lay = G.root.querySelector('.bs-gwrap .bs-fx');
  if (!lay) return;
  const el = document.createElement('div');
  el.className = 'bs-muzz' + (fromTop ? ' n' : '') + (heavy ? ' hv' : '');
  lay.appendChild(el);
  setTimeout(() => { if (el.isConnected) el.remove(); }, 700);
}
/* the kick. On the pane, never on #app — the same lesson the pack
   opener's shake paid for: shaking an ancestor of fixed chrome drags
   the chrome with it and promotes the whole app layer. */
function quake(big){
  if (reducedMo() || !G || !G.root) return;
  const p = G.root.querySelector('.bs-pane');
  if (!p) return;
  p.classList.remove('bs-quake', 'bs-quake2');
  void p.offsetWidth;                        /* restart the animation */
  p.classList.add(big ? 'bs-quake2' : 'bs-quake');
  setTimeout(() => { if (p.isConnected) p.classList.remove('bs-quake', 'bs-quake2'); }, big ? 560 : 420);
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
  /* a shell that landed on a boat has to scorch the BOAT, not just the
     square under it — the artwork is on top, so damage drawn only in the
     cell would be hidden by the very hull it went through */
  if (c.r === 'hit') refreshShipLayer();
}
/* re-draw the overlay for whatever sea is on screen, in place */
function refreshShipLayer(){
  if (!G || !G.root) return;
  const wrap = G.root.querySelector('.bs-gwrap');
  const old = wrap && wrap.querySelector('.bs-ships');
  if (!old || G.stage !== 'board') return;
  const showMine = G.view === 'mine';
  const me = seatViewable();
  const subject = showMine ? G.st.seats[me] : G.st.seats[G.target];
  if (!subject) return;
  old.outerHTML = shipLayer(subject, showMine, gridPx(), null);
}
function seatViewable(){ return G.mySeat; }

/* ═══════════════════════════════════════════════════════════════════
   3b · WHOSE SKIN IS ON WHICH BOARD — the seat ledger.
   The exclusive skins used to ride as ONE class on <body>, which made
   the skin a property of the PHONE: every grid this phone drew wore
   the local player's set, and nobody else's phone ever heard about it.
   Both owner complaints were that same bug — so the skin is now a
   property of a BOARD. G.skins maps seat → 'roza'|'armata'|'', filled
   from MY equipped set at mount and from each remote player's
   {t:'place'} move (its `e` field — see the lobby wire contract and
   the kit shelf at the end of this file). paintBoard/paintPlace stamp
   two classes on the .bs-gwrap of whatever sea is on show:

     bs-skin-<x>  the board OWNER's set — the water, the cells, the
                  hulls, the permanent scorch and splash marks
     bs-atk-<x>   the ATTACKER's set — the aim ring, the muzzle flare,
                  the shell, the burst and the miss plume. The shot is
                  the GUN's, and the gun belongs to whoever fired it.

   A wire value is never trusted into a selector: it goes through
   SKIN_FROM_WIRE, and anything unknown or absent is stock — a player
   on an older build simply looks normal, both ways.
   ═══════════════════════════════════════════════════════════════════ */
const SKIN_WIRE = { armata:1, roza:2 };        /* skin → the wire byte  */
const SKIN_FROM_WIRE = { 1:'armata', 2:'roza' };  /* and the only way back */
function skinKit(){
  const GH = window.KARTI_GHARRAQ;
  return (GH && GH.skinkit) || null;           /* published by the kit shelf */
}
function myEquippedSkin(){
  const k = skinKit();
  try { return (k && k.mine()) || ''; } catch(e){ return ''; }
}
function skinOf(seat){ return (G && G.skins && G.skins[seat]) || ''; }
function setSeatSkin(seat, name){
  if (!G) return;
  if (!G.skins) G.skins = {};
  G.skins[seat] = SKIN_WIRE[name] ? name : '';
  /* tell the kit which skins this battle needs CSS for — my own block
     alone is not enough once an opponent's set has to paint here */
  const k = skinKit();
  if (k && k.need){
    const list = [];
    for (const s in G.skins)
      if (G.skins[s] && list.indexOf(G.skins[s]) < 0) list.push(G.skins[s]);
    try { k.need(list); } catch(e){}
  }
}
function skinCls(seat, prefix){
  const s = skinOf(seat);
  return s ? prefix + s : '';
}

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

/* ── 4a · the entry screen — MINIMAL, the house shape ─────────────────
   Screen one is the hero, one line of blurb, and the few big doors
   every party game opens with: PLAY ONLINE (primary), PLAY WITH AI, and
   HOW TO PLAY (a sliding fold, not a wall). The settings — which game,
   how hard, how many machines — do NOT belong here; they wait one tap
   deeper on the AI setup (setupAI), reached only after a human has said
   they want the machine. A saved battle, if there is one, is offered
   back above the doors with its bin beside it, because a battle you
   cannot get rid of is a trap.
   ─────────────────────────────────────────────────────────────────────
   NO pass-the-phone (every grid here is hidden). NO variant picker on
   the online lobby (the online lobby's start() defaults the game). ── */
const BS_CHEV = '<span class="bs-mchev"><svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M9 6l6 6-6 6"/></svg></span>';

function menu(){
  P.show();
  const el = screenRoot();
  const sv = loadSave();
  const M = window.KARTI_MP;
  const canOnline = !!(M && M.openFor);
  const relayDown = !!(M && M.PR && M.PR.tried && M.PR.err);
  const r = P.recOf(GID);
  /* the fold header's one line says what is inside while it is shut */
  const foldHint = () => setupOpen
    ? 'Tap to fold them away.'
    : 'Both games, in a minute — tap to read them.';

  el.innerHTML =
    '<div class="pt-wrap bs-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="pt-back" aria-label="Back to party games">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + TITLE + '</h2>' +
    '</div>' +
    '<div class="scroll">' +
      /* THE IDENTITY PIECE: the fleet itself, riding at anchor on the
         gridded sea — the same five hulls the game draws, at chip size,
         with one gold aim ring already out on the water. All artwork
         this file already owns (SHIP_ART via shipChip); decoration
         only, aria-hidden, nothing tappable. */
      '<div class="bs-hero" aria-hidden="true">' +
        '<span class="bs-hb" style="left:5%;top:9%">' + shipChip(0, 12) + '</span>' +
        '<span class="bs-hb" style="right:6%;top:22%;transform:rotate(2deg)">' +
          shipChip(1, 12) + '</span>' +
        '<span class="bs-hb" style="left:13%;top:47%;transform:rotate(-2deg)">' +
          shipChip(3, 12) + '</span>' +
        '<span class="bs-hb" style="left:50%;top:56%;transform:rotate(-4deg)">' +
          shipChip(2, 13) + '</span>' +
        '<span class="bs-hb" style="right:15%;top:73%">' + shipChip(4, 11) + '</span>' +
        '<span class="bs-haim" style="left:38%;top:15%"></span>' +
        '<span class="bs-hcap">IL-FLOTTA</span>' +
      '</div>' +
      '<p class="blurb">Five boats each, hidden on your own sea. Take turns shelling ' +
      'each other’s grid until one fleet is still floating.</p>' +
      /* A STARTED BATTLE MUST BE BINNABLE. A saved game you cannot get
         rid of without clearing site data is a trap. The bin sits beside
         the door it belongs to, and it asks first. */
      (sv ? '<div class="bs-resume" style="margin:2px 0 12px">' +
              '<button class="pt-opt" id="bs-resume">' + ico('play') +
              '<b>Carry on with the saved battle</b><i>' +
              'You vs the phone — ' + savedLine(sv) + '</i></button>' +
              '<button class="bs-bin" id="bs-bin" aria-label="Throw the saved battle away">' +
                ico('close') + '<span>Bin it</span></button>' +
            '</div>' : '') +

      /* ── THE DOORS. Few, big, the first one lit. ── */
      '<div class="bs-modes">' +
        '<button type="button" class="bs-mode primary" id="bs-m-online"' +
          (canOnline ? '' : ' disabled') + '>' +
          '<span class="bs-mi">' + ico('users') + '</span>' +
          '<span class="bs-mt"><b>Play online</b>' +
            '<i>Two to six phones, everyone on their own sea.</i></span>' +
          BS_CHEV +
        '</button>' +
        '<button type="button" class="bs-mode" id="bs-m-ai">' +
          '<span class="bs-mi">' + ico('coach') + '</span>' +
          '<span class="bs-mt"><b>Play with AI</b>' +
            '<i>You against the phone. It has sunk better sailors than you.</i></span>' +
          BS_CHEV +
        '</button>' +
        '<button type="button" class="bs-mode" id="bs-m-rules">' +
          '<span class="bs-mi">' + ico('book') + '</span>' +
          '<span class="bs-mt"><b>How to play</b>' +
            '<i>The rules, in a minute.</i></span>' +
          BS_CHEV +
        '</button>' +
      '</div>' +
      (relayDown ? '<p class="pt-warn">The KARTI server cannot be reached from this phone right now. ' +
        '<b>If Tailscale is on, turn it off.</b> Play with AI works with no internet at all.</p>' : '') +
      (r.w + r.l + r.d ? '<p class="pt-ledger">Against the phone so far: <b>' + r.w + '</b> won, <b>' +
        r.l + '</b> lost.</p>' : '') +

      /* ── the rules, FOLDED — the same slide rummy and gin keep. Closed
         by default, remembered in the UI-only key, never a modal. ── */
      '<div class="bs-foldbox">' +
        '<button type="button" class="bs-fold-h" id="bs-srules-h" aria-controls="bs-srules-b"' +
          ' aria-expanded="' + (setupOpen ? 'true' : 'false') + '">' +
          '<span><b>The rules, as this sea plays them</b>' +
          '<i id="bs-srules-i">' + foldHint() + '</i></span>' +
          '<em aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></em>' +
        '</button>' +
        '<div class="bs-fold-b' + (setupOpen ? ' open' : '') + '" id="bs-srules-b">' +
          '<div class="bs-fold-i"><div class="bs-fold-p">' + rulesPanel() + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div style="height:12px"></div>' +
    '</div>' +
    '</div>';

  el.querySelector('#pt-back').onclick = () => { P.hub(); };

  el.querySelector('#bs-m-ai').onclick = () => { sfx('ui.tap', { gain:0.6 }); setupAI(); };
  const on = el.querySelector('#bs-m-online');
  if (on) on.onclick = () => {
    if (on.hasAttribute('disabled')) return;
    sfx('ui.tap', { gain:0.6 });
    /* the online lobby's own start() picks the game (defaults to karti),
       so nothing about the variant needs answering here. */
    P.pref(GID, { mode:'online' });
    if (M && M.openFor) M.openFor(GID);
  };

  const rs = el.querySelector('#bs-resume');
  if (rs) rs.onclick = () => restoreSaved();
  const bin = el.querySelector('#bs-bin');
  if (bin) bin.onclick = () => {
    /* the party kit's own ask, so it looks like every other destructive
       question in the box. It needs a ctx with a .root to hang on. */
    U.confirm({ root: el }, {
      head:'Throw the battle away?',
      why:'The saved sea, both fleets and everything already fired are gone for good. ' +
          'Nothing else about GĦARRAQHOM is touched — just this one battle.',
      yes:'Yes, bin it', no:'No, keep it',
      go: () => {
        binSave();                         /* ONLY the battle slot. */
        sfx('ui.back');
        if (K && K.toast) K.toast('The battle is gone. The sea is clear.');
        menu();                            /* …and back to a CLEAN sheet */
      }
    });
  };

  /* the fold toggles in place — no repaint, so the slide actually slides.
     "How to play" opens the same fold. */
  const toggleRules = force => {
    const wantOpen = (force == null) ? !setupOpen : !!force;
    setSetupOpen(wantOpen);
    const sh = el.querySelector('#bs-srules-h');
    if (sh) sh.setAttribute('aria-expanded', wantOpen ? 'true' : 'false');
    const b = el.querySelector('#bs-srules-b');
    if (b) b.classList.toggle('open', wantOpen);
    const hint = el.querySelector('#bs-srules-i');
    if (hint) hint.textContent = foldHint();
    sfx(wantOpen ? 'ui.sheet' : 'ui.back', { gain: 0.8 });
  };
  const sh = el.querySelector('#bs-srules-h');
  if (sh) sh.onclick = () => toggleRules();
  const mr = el.querySelector('#bs-m-rules');
  if (mr) mr.onclick = () => {
    toggleRules(true);
    const box = el.querySelector('#bs-srules-h');
    if (box && box.scrollIntoView) try { box.scrollIntoView({ behavior:'smooth', block:'nearest' }); } catch(e){}
  };
}

/* ── 4a-ii · the AI setup — one tap deeper, the settings that used to be
   the whole entry wall. Which game (karti/klassika), how hard, how many
   machines — every one defaulted so Start is always right there. The
   game mode is defaulted here BEFORE it reaches newLocal, because a
   battle started with no mode lands the engine in phase 'mode' with
   nothing to drive it; screen one never asks the question, so this step
   MUST answer it. ── */
function setupAI(){
  P.show();
  const el = screenRoot();
  const pref = P.pref(GID);
  let mode  = pref.gmode === 'klassika' ? 'klassika' : 'karti';   /* DEFAULT */
  let level = String(pref.level || 2);
  let foes  = String(pref.foes || 1);

  el.innerHTML =
    '<div class="pt-wrap bs-menu bs-setup">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="pt-back" aria-label="Back">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Play with AI</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="tiny pt-lbl">The game</div>' +
      '<div class="pt-opts two" id="bs-gmode">' +
        '<button class="pt-opt" data-v="karti">' + ico('cards') +
          '<b>Karti tal-Kanun</b><i>Draw a shot card every turn. The fun one.</i></button>' +
        '<button class="pt-opt" data-v="klassika">' + ico('shield') +
          '<b>Klassika</b><i>One shell a turn, nerves of steel.</i></button>' +
      '</div>' +
      '<div class="tiny pt-lbl">How hard</div>' +
      '<div class="pt-opts" id="bs-lvl">' +
        LEVELS.map(l => '<button class="pt-opt" data-v="' + l.k + '">' + ico(l.icon) +
          '<b>' + esc(l.name) + '</b><i>' + esc(l.note) + '</i></button>').join('') +
      '</div>' +
      '<div class="tiny pt-lbl">How many machines against you</div>' +
      '<div class="pt-opts two" id="bs-foes">' +
        '<button class="pt-opt" data-v="1">' + ico('coach') + '<b>One</b><i>A duel.</i></button>' +
        '<button class="pt-opt" data-v="2">' + ico('users') + '<b>Two</b><i>A brawl.</i></button>' +
        '<button class="pt-opt" data-v="3">' + ico('users') + '<b>Three</b><i>A whole harbour.</i></button>' +
        '<button class="pt-opt" data-v="5">' + ico('users') + '<b>Five</b><i>Everybody against you.</i></button>' +
      '</div>' +
      '<div style="height:8px"></div>' +
    '</div>' +
    '<div class="pt-startbar"><button class="btn primary" id="bs-start"></button></div>' +
    '</div>';

  const sync = () => {
    el.querySelectorAll('#bs-gmode .pt-opt').forEach(b => b.classList.toggle('on', b.dataset.v === mode));
    el.querySelectorAll('#bs-lvl .pt-opt').forEach(b => b.classList.toggle('on', b.dataset.v === level));
    el.querySelectorAll('#bs-foes .pt-opt').forEach(b => b.classList.toggle('on', b.dataset.v === foes));
    const s = el.querySelector('#bs-start');
    s.innerHTML = window.ILB ? window.ILB('play', 'Start') : 'Start';
  };
  el.querySelectorAll('#bs-gmode .pt-opt').forEach(b => b.onclick = () => { mode = b.dataset.v; sfx('ui.tap', { gain:0.5 }); sync(); });
  el.querySelectorAll('#bs-lvl .pt-opt').forEach(b => b.onclick = () => { level = b.dataset.v; sfx('ui.tap', { gain:0.5 }); sync(); });
  el.querySelectorAll('#bs-foes .pt-opt').forEach(b => b.onclick = () => { foes = b.dataset.v; sfx('ui.tap', { gain:0.5 }); sync(); });
  sync();

  el.querySelector('#pt-back').onclick = () => { sfx('ui.back'); menu(); };
  el.querySelector('#bs-start').onclick = () => {
    /* mode is ALWAYS one of 'karti'/'klassika' here — never absent — so
       newLocal → E.newMatch gets a real mode and the engine goes to
       phase 'place', not phase 'mode'. */
    P.pref(GID, { gmode: mode, mode:'ai', level: +level, foes: +foes });
    newLocal({ gmode: mode, who:'ai', level: +level, foes: +foes });
  };
}

/* what the saved slot actually holds, in words, so binning it is an
   informed decision rather than a leap */
function savedLine(sv){
  try {
    const st = E.restore(sv.snap);
    if (!st) return 'left mid-fight.';
    if (st.phase === 'place') return 'fleets still going in.';
    const alive = E.aliveSeats(st).length;
    return 'turn ' + st.tcount + ', ' + alive + ' fleets still up.';
  } catch(e){ return 'left mid-fight.'; }
}

function restoreSaved(){
  const sv = loadSave();
  if (!sv) return menu();
  const st = E.restore(sv.snap);
  if (!st){ clearSave(); return menu(); }
  G = { st, mode: sv.mode, mySeat: sv.mySeat | 0, net: null,
        stage: sv.stage === 'place' ? 'place' : (st.phase === 'place' ? 'place' : 'board'),
        view:'them', target: -1, aim: null,
        q: [], busy: false, dead: false };
  G.target = pickTarget();
  mount();
  if (G.stage === 'place') paintPlace(); else paintBoard();
}

function newLocal(o){
  clearSave();
  const seats = [{ name: myName(), kind:'human', own:'me' }];
  const NAMES = ['Il-Baħri', 'Ta’ Ġilardu', 'Il-Pirata', 'Iż-Żija', 'Is-Sajjied'];
  for (let i = 0; i < Math.max(1, Math.min(E.MAX_SEATS - 1, o.foes | 0)); i++)
    seats.push({ name: NAMES[i], kind:'cpu', level: o.level | 0 || 2, own:'ai' });
  const seed = (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0;
  const st = E.newMatch({ mode: o.gmode, seats, seed });
  G = { st, mode: o.who, mySeat: 0, net: null, stage:'place',
        view:'them', target: -1, aim: null, q: [], busy: false, dead: false };
  G.target = pickTarget();
  mount();
  paintPlace();
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
  const me = G.mySeat;
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
  /* every door into a battle (new, online, resumed) passes through here:
     seed the skin ledger with MY equipped set, once — frozen for the
     match so what the table saw me place with is what I keep wearing */
  if (!G.skins) G.skins = {};
  if (G.skins[G.mySeat] === undefined) setSeatSkin(G.mySeat, myEquippedSkin());
  G.els.badge.textContent = G.mode === 'online' ? 'Online'
    : (LEVELS.find(l => l.k === (G.st.seats[1] && G.st.seats[1].level)) || LEVELS[1]).name;
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
  /* ── TWO DIFFERENT THINGS, AND NEITHER MAY DO THE OTHER QUIETLY ──
     ONLINE, walking out is a move: {t:'quit'} goes through the same door
     every other move does, so the table is TOLD, the seat is marked out
     on every phone, and the battle carries on without you. It is not a
     save being deleted, and there is nothing local to delete.
     OFFLINE, walking out deletes nothing either — the battle is written
     to its slot and offered back on the front screen, where the bin is.
     Binning is only ever the explicit thing on that sheet. */
  if (G.mode === 'online'){
    const walk = () => {
      try { localApply(G.mySeat, { t:'quit' }); } catch(e){}
      const n = G.net; leave();
      if (n && n.onLeave) n.onLeave(); else P.hub();
    };
    /* the shared gate (P.guardLeave → KARTI_MP.askLeave) knows the whole
       truth this sheet never did: a TWO-SEAT battle hands the other
       captain the win, and a staked table forfeits the ante. Taken only
       when the mp.js sheet actually exists; otherwise the old sheet
       below stands, so this ships safely either side of that change. */
    if (P.guardLeave && window.KARTI_MP && typeof KARTI_MP.askLeave === 'function'){
      P.guardLeave(walk, 'back');
      return;
    }
    U.confirm({ root: G.root }, {
      head:'Leave the battle?',
      why:'The others are told and the table carries on without you. Your boats stay ' +
          'where they sank and you cannot come back to this one.',
      yes:'Yes, leave', no:'No, fight on',
      go: walk
    });
    return;
  }
  U.confirm({ root: G.root }, {
    head:'Leave this battle?',
    why:'It is kept exactly as it stands and waits for you on the GĦARRAQHOM screen. ' +
        'If you would rather be rid of it, there is a Bin it button beside it there.',
    yes:'Leave it for later', no:'No, carry on',
    go: () => { saveGame(); leave(); P.hub(); }
  });
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

/* ═══════════════════════════════════════════════════════════════════
   4c · THE FIVE BOATS, DRAWN
   ───────────────────────────────────────────────────────────────────
   "Make them as ships boss." A boat spanning N cells is ONE drawing
   across the whole run — not N copies of a hull, which is the thing
   that made it read as coloured blocks. So the art lives on its own
   layer ABOVE the grid: a tile must clip, a ship must not. The grid
   underneath keeps every tap.

   Drawn in artkit's language, because this app has one visual family
   and a boat that did not belong to it would look imported: filled
   silhouettes, the warm ink rim through `paint-order:stroke fill`,
   recessed parts at fill-opacity .45/.75, one key light from the
   upper left, no emoji and no image files. The sprite is local to
   this file — js/artkit.js is not ours to add to.

   Each boat is drawn in a band 10 units tall and 10 units per cell,
   BOW TO THE RIGHT, so the direction it points is unambiguous; a
   vertical boat is the same drawing ROTATED, never stretched.

   THEY ARE FIVE DIFFERENT BOATS, and the difference is carried by the
   OUTLINE rather than by detail, because detail is the first thing to
   die at 28px:
     · VAPUR    long slab, superstructure block, funnel — tall boxy mass
     · PATROL   long and low, needle bow, mast spike, gun forward
     · LUZZU    crescent, both ends swept high, and THE EYE on the bow
     · LAMPUKI  fat trapezoid, wheelhouse, derrick, net floats
     · DGĦAJSA  tiny, one end high, two crossed oars
   ═══════════════════════════════════════════════════════════════════ */
const SHIP_ART = {
  /* ── Il-Vapur t'Għawdex (5) — the Gozo ferry ──
     A slab. Blunt bow, square stern with the car ramp still down, a
     superstructure block amidships and the funnel. The widest, heaviest
     thing on the water and it should look it. */
  0: '<path d="M1.4 1.9H39c4.2 0 7.6 1.4 9.4 3.1-1.8 1.7-5.2 3.1-9.4 3.1H1.4c-.5-1.9-.5-4.3 0-6.2z"/>' +
     '<path d="M13.6 3.1h16.8v3.8H13.6z" class="dt"/>' +
     '<path d="M15.4 3.9h13.2v1.1H15.4z" class="lt"/>' +
     '<circle cx="33.4" cy="5" r="1.6" class="dt"/>' +
     '<path d="M1.8 3.7h4.6v2.6H1.8z" class="lt"/>',
  /* ── Il-Patrol tal-AFM (4) — grey, sleek, gun forward ──
     A needle. The bow is a long taper to a real point, which is the
     one silhouette nothing else here has. */
  1: '<path d="M1.4 2.9H25l13.4 2.1L25 7.1H1.4c-.5-1.4-.5-2.8 0-4.2z"/>' +
     '<path d="M11.6 3.6h8.2v2.8h-8.2z" class="dt"/>' +
     '<circle cx="24.2" cy="5" r="1.5" class="dt"/>' +
     '<path d="M25.4 4.6h5.2v.8h-5.2z" class="dt"/>' +
     '<circle cx="15.7" cy="5" r=".85" class="dt"/>',
  /* ── Il-Luzzu (3) — the one people will look for ──
     Double-ended: pointed at BOTH ends, which no other boat here is,
     and the two eyes of Osiris on the bows. From above you see both,
     which is exactly how a real luzzu is painted. */
  2: '<path d="M1.6 5c2.4-2.6 6.4-3.4 13.4-3.4S25.9 2.4 28.4 5c-2.5 2.6-6.4 3.4-13.4 3.4S4 7.6 1.6 5z"/>' +
     '<path d="M4.6 5c2-1.6 5.1-2.1 10.4-2.1S23.4 3.4 25.4 5c-2 1.6-5.1 2.1-10.4 2.1S6.6 6.6 4.6 5z" class="lt"/>' +
     '<circle cx="23.6" cy="3.7" r=".95" class="dt"/>' +
     '<circle cx="23.6" cy="6.3" r=".95" class="dt"/>',
  /* ── Tal-Lampuki (3) — the working boat ──
     Fat. Wide beam, transom stern, wheelhouse right at the back and
     the net floats stacked on the deck. Lower and broader than the
     luzzu on purpose — side by side they are never the same boat. */
  3: '<path d="M1.6 1.8h19.2c4.2.4 6.8 1.7 7.8 3.2-1 1.5-3.6 2.8-7.8 3.2H1.6c-.5-2.1-.5-4.3 0-6.4z"/>' +
     '<path d="M3.8 3h7.2v4H3.8z" class="dt"/>' +
     '<path d="M11.2 4.6h12.4v.9H11.2z" class="dt"/>' +
     '<circle cx="14.6" cy="3.2" r="1.2" class="lt"/>' +
     '<circle cx="14.6" cy="6.8" r="1.2" class="lt"/>',
  /* ── Id-Dgħajsa tal-Pass (2) — the little one ──
     Two cells of boat with the oars out. The oars break the outline
     top and bottom, which is what stops the smallest boat reading as
     a stray block at 22px. */
  4: '<path d="M2.2 5c1.8-2 4.2-2.6 7.8-2.6s6.2.8 7.8 2.6c-1.6 1.8-4.2 2.6-7.8 2.6S4 7 2.2 5z"/>' +
     '<path d="M4.8.6l7.6 3.7-.4.8L4.4 1.4z" class="dt"/>' +
     '<path d="M4.4 8.6l7.6-3.7.4.8-7.6 3.7z" class="dt"/>' +
     '<path d="M7.6 4.1h4.2v1.8H7.6z" class="lt"/>'
};

/* one boat, as an <svg> laid over the grid. `o` is the orientation the
   engine uses (0 across, 1 down) and a down boat is the SAME drawing
   turned a quarter turn about the middle of its first cell, which is
   exactly the cell the engine anchors it to. */
function shipSVG(id, anchor, o, px, cls, hits){
  const f = E.FLEET[id];
  const w = f.len * 10;
  const x = E.CX(anchor), y = E.CY(anchor);
  let dmg = '';
  for (let k = 0; k < (hits || []).length; k++){
    if (!hits[k]) continue;
    /* a burst ON the hull, so damage is never prettied away by the art
       sitting on top of it — see the note in the stylesheet */
    const cx = k * 10 + 5;
    dmg += '<path class="bs-burst" d="M' + cx + ' 1.6l1.15 2.05 2.3-.6-.85 2.2 2.05 1.15-2.05 1.15.85 2.2-2.3-.6L' +
           cx + ' 11.4l-1.15-2.05-2.3.6.85-2.2L' + (cx - 4.2) + ' 5l2.05-1.15-.85-2.2 2.3.6z"/>';
  }
  return '<svg class="bs-ship ' + (cls || '') + '" data-i="' + id + '" aria-hidden="true" ' +
    'viewBox="0 0 ' + w + ' 10" preserveAspectRatio="none" style="' +
    'left:' + (x * px) + 'px;top:' + (y * px) + 'px;' +
    'width:' + (f.len * px) + 'px;height:' + px + 'px;' +
    (o ? 'transform:rotate(90deg);transform-origin:' + (px / 2) + 'px ' + (px / 2) + 'px;' : '') +
    '"><g class="bs-hull">' + SHIP_ART[id] + '</g>' + dmg + '</svg>';
}

/* the whole layer. `reveal` decides WHICH boats may be drawn at all:
   on your own sea and on the placement grid you see your fleet, on an
   opponent's sea you see only what you have already sunk — drawing a
   half-hit boat there would hand the shape away for free. */
function shipLayer(seat, reveal, px, placement){
  let out = '<div class="bs-ships">';
  if (placement){
    for (let i = 0; i < E.FLEET.length; i++)
      out += shipSVG(i, placement[i * 2], placement[i * 2 + 1], px,
                     G.draft && G.draft.sel === i ? 'sel' : '', null);
  } else if (seat && seat.ships){
    for (const sh of seat.ships){
      if (!reveal && !sh.sunk) continue;
      const a = sh.cells[0];
      const o = (sh.cells.length > 1 && sh.cells[1] === a + E.W) ? 1 : 0;
      /* the hull tagged by the volley goes down ON CAMERA: `sinking`
         plays the list-and-settle, and on an enemy sea (where a live
         boat is never drawn) it fades in as it lists — the reveal IS
         the sinking. On your own sea (`own`) the hull was already
         visible, so it only lists, it does not blink. */
      let cls = sh.sunk ? 'sunk' : '';
      if (sh.sunk && G.fxSink === sh.id) cls += reveal ? ' sinking own' : ' sinking';
      out += shipSVG(sh.id, a, o, px, cls, sh.hit);
    }
  }
  return out + '</div>';
}

/* the same boat at dock size — the tile says what it IS, not "▮▮▮" */
function shipChip(id, px){
  const f = E.FLEET[id];
  return '<svg class="bs-chip" viewBox="0 0 ' + (f.len * 10) + ' 10" aria-hidden="true" ' +
    'style="width:' + (f.len * px) + 'px;height:' + px + 'px">' +
    '<g class="bs-hull">' + SHIP_ART[id] + '</g></svg>';
}

/* ═══════════════════════════════════════════════════════════════════
   5 · PLACEMENT
   Random fleet offered first — most tables just tap LEST — and the
   fussy admiral DRAGS. See wireDrag() for the gesture.
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
  const seat = G.mySeat;
  const s = G.st.seats[seat];
  if (!s || s.placed){ paintPlaceWait(); return; }
  if (G.st.phase === 'mode'){ paintModePick(); return; }
  ensureDraft();
  setTurnStrip({ col:'#3DDC84', who:'Place your fleet',
                 note:'' + E.FLEET.length + ' boats' });
  const cells = draftCells();
  const px = gridPx();
  /* the fleet going in is MY fleet on MY water — my skin, both layers */
  let g = '<div class="bs-pane"><div class="bs-gwrap place' +
          skinCls(seat, ' bs-skin-') + '" id="bs-pwrap">' +
          '<div class="bs-grid place" id="bs-pgrid" style="--bq:' + px + 'px">';
  for (let c = 0; c < E.CELLS; c++){
    const sh = cells[c];
    /* the coordinate letter steps out of the way of the artwork */
    /* the coordinate label is always in the DOM and is hidden by CSS when a
       boat is over it — so a drag never has to touch innerHTML to keep the
       letters out of the artwork's way */
    g += '<button type="button" data-c="' + c + '" class="bs-c' +
         (sh !== undefined ? ' ship' : '') + '">' + coords(c) + '</button>';
  }
  g += '</div>' + shipLayer(null, true, px, G.draft.p) + '</div></div>';
  const dock = '<div class="bs-dock' + skinCls(seat, ' bs-skin-') + '">' + E.FLEET.map((f, i) =>
    '<button type="button" class="bs-boat' + (G.draft.sel === i ? ' on' : '') + '" data-i="' + i + '">' +
      shipChip(i, 11) + '<b>' + esc(f.name) + '</b></button>').join('') + '</div>';
  const bar =
    '<div class="pt-bar bs-pbar">' +
      '<button class="btn sm ghost" id="bs-shuffle">' + (window.ILB ? window.ILB('refresh', 'Ħawwad') : 'Ħawwad') + '</button>' +
      '<button class="btn sm ghost" id="bs-rot">' + (window.ILB ? window.ILB('arrow', 'Dawwar') : 'Dawwar') + '</button>' +
      '<button class="btn sm primary" id="bs-lock">' + (window.ILB ? window.ILB('check', 'LEST!') : 'LEST!') + '</button>' +
    '</div>';
  G.els.stage.innerHTML =
    '<p class="bs-hint"><b>Drag</b> a boat where you want it. <b>Double-tap</b> turns it. ' +
    'Nobody else can see this grid.</p>' + g + dock + bar;
  fitGrids();
  wireDrag();
  G.els.stage.querySelector('#bs-shuffle').onclick = () => {
    G.draft.p = E.placeRandom(uiRng); sfx('duel.shuffle', { gain:0.5 }); paintPlace();
  };
  G.els.stage.querySelector('#bs-rot').onclick = () => rotate(G.draft.sel);
  G.els.stage.querySelector('#bs-lock').onclick = lockFleet;
}
/* ── the live layer, repainted on every pointermove ────────────────
   Cheap on purpose: the cells keep their markup and only swap one
   class, and the ship layer is one innerHTML of five <svg>. Nothing
   here rebuilds the grid, so a drag never re-runs paintPlace(). */
function renderPlaceLayer(p, dragI, bad){
  const stage = G.els.stage;
  const wrap = stage.querySelector('#bs-pwrap');
  if (!wrap) return;
  const cells = {};
  for (let i = 0; i < E.FLEET.length; i++){
    const cs = E.shipCells(p[i * 2], p[i * 2 + 1], E.FLEET[i].len) || [];
    for (const c of cs) cells[c] = i;
  }
  stage.querySelectorAll('#bs-pgrid .bs-c').forEach(b => {
    const i = cells[+b.dataset.c];
    b.classList.toggle('ship', i !== undefined);
    b.classList.toggle('under', dragI !== null && dragI !== undefined && i === dragI);
  });
  const px = gridPx();
  const old = wrap.querySelector('.bs-ships');
  let html = '<div class="bs-ships">';
  for (let i = 0; i < E.FLEET.length; i++){
    let cls = G.draft.sel === i ? 'sel' : '';
    if (i === dragI) cls += ' drag ' + (bad ? 'bad' : 'ok');
    html += shipSVG(i, p[i * 2], p[i * 2 + 1], px, cls, null);
  }
  html += '</div>';
  if (old) old.outerHTML = html;
}

/* ── DRAG A BOAT WHERE YOU WANT IT ─────────────────────────────────
   "easy to plase for the battle ships". Press a boat and slide it;
   it snaps to cells under your thumb, says green or red while it is
   moving, and drops where you let go.

   The three things this repo has already paid to learn, all of them
   load-bearing here:

     · touch-action:none is declared in the STYLESHEET, on the grid
       and the dock, before any gesture exists. Declaring it when the
       gesture starts is too late — the browser has already decided
       the touch belongs to the scroller.
     · setPointerCapture is taken ONLY once the gesture has become a
       drag (9px of slop, SKARTA's number). Capturing on pointerdown
       retargets the compatibility click and kills every tap on the
       board, which is how the tap path dies without anybody noticing.
     · a tap is still a tap. The fallback — tap a boat, tap the sea —
       is untouched, and double-tapping a boat rotates it, because
       rotating is the commonest single action and it should not need
       a trip to a button. The Dawwar button stays for the thumb that
       prefers it, and for the keyboard.
   ═══════════════════════════════════════════════════════════════════ */
const DRAG_SLOP = 9;          /* px before a press becomes a drag */
const DBL_TAP = 320;          /* ms between the two taps of a rotate */

function wireDrag(){
  const stage = G.els.stage;
  const wrap = stage.querySelector('#bs-pwrap');
  const grid = stage.querySelector('#bs-pgrid');
  if (!wrap || !grid) return;
  const S = G.tapS || (G.tapS = { lastI: -1, lastAt: 0, blockClick: 0 });
  let g = null;                 /* the gesture in flight */

  function cellAt(cx, cy){
    const r = grid.getBoundingClientRect();
    const px = r.width / E.W;
    if (!px) return null;
    let x = Math.floor((cx - r.left) / px), y = Math.floor((cy - r.top) / px);
    const inside = cx >= r.left && cx < r.right && cy >= r.top && cy < r.bottom;
    x = Math.max(0, Math.min(E.W - 1, x));
    y = Math.max(0, Math.min(E.H - 1, y));
    return { x, y, c: E.AT(x, y), inside };
  }

  /* where the boat would sit if the thumb is over cell (x,y) and it was
     grabbed `off` cells along from its bow */
  function anchorFor(i, x, y, o, off){
    const len = E.FLEET[i].len;
    let ax = o ? x : x - off, ay = o ? y - off : y;
    ax = Math.max(0, Math.min(E.W - (o ? 1 : len), ax));
    ay = Math.max(0, Math.min(E.H - (o ? len : 1), ay));
    return E.AT(ax, ay);
  }

  function begin(e, i, off){
    g = { i, off, id: e.pointerId, x0: e.clientX, y0: e.clientY,
          moved: false, p: G.draft.p.slice(), bad: false };
  }

  function toDrag(){
    g.moved = true;
    G.draft.sel = g.i;
    try { wrap.setPointerCapture(g.id); } catch(err){}   /* only NOW */
    wrap.classList.add('dragging');
    sfx('piece.lift', { gain:0.45 });
  }

  wrap.addEventListener('pointerdown', e => {
    if (!G || !G.draft || e.button > 0) return;
    const at = cellAt(e.clientX, e.clientY);
    if (!at) return;
    const cells = draftCells();
    const i = cells[at.c];
    if (i === undefined) return;                 /* empty sea: nothing to pick up */
    const o = G.draft.p[i * 2 + 1];
    const a = G.draft.p[i * 2];
    const off = o ? (at.y - E.CY(a)) : (at.x - E.CX(a));
    begin(e, i, Math.max(0, off));
  });

  /* the dock is the same gesture with the bow under the thumb */
  stage.querySelectorAll('.bs-boat').forEach(b => {
    b.addEventListener('pointerdown', e => {
      if (!G || !G.draft || e.button > 0) return;
      begin(e, +b.dataset.i, 0);
      g.fromDock = true;
    });
  });

  function move(e){
    if (!g || e.pointerId !== g.id) return;
    if (!g.moved){
      if (Math.abs(e.clientX - g.x0) < DRAG_SLOP && Math.abs(e.clientY - g.y0) < DRAG_SLOP) return;
      toDrag();
    }
    e.preventDefault();
    const at = cellAt(e.clientX, e.clientY);
    if (!at) return;
    const p = g.p.slice();
    p[g.i * 2] = anchorFor(g.i, at.x, at.y, p[g.i * 2 + 1], g.off);
    g.bad = !!E.badPlacement(p);
    g.live = p;
    renderPlaceLayer(p, g.i, g.bad);
  }

  function end(e){
    if (!g || (e && e.pointerId !== g.id)) return;
    const was = g;
    g = null;
    wrap.classList.remove('dragging');
    try { wrap.releasePointerCapture(was.id); } catch(err){}
    /* THE BLOCK IS SET HERE AND ONLY HERE. A pointer gesture is always
       followed by a compatibility click on the same spot, and that is the
       one to swallow. Setting it inside tap() instead — which is what the
       first cut did — meant a tap arriving BY click armed the block and
       then ate the very next tap, so "tap a boat, tap the sea" silently
       stopped working for 400ms after every selection. */
    S.blockClick = Date.now();
    if (!was.moved){ tap(was.i); return; }        /* it was a tap after all */
    if (was.live && !was.bad){
      G.draft.p = was.live;
      sfx('piece.place', { gain:0.55 });
      paintPlace();
    } else {
      sfx('ui.error', { gain:0.5 });
      if (K && K.toast) K.toast('⚠ It does not fit there.');
      paintPlace();                               /* snap back where it was */
    }
  }

  wrap.addEventListener('pointermove', move);
  wrap.addEventListener('pointerup', end);
  wrap.addEventListener('pointercancel', end);

  /* ── tap, and double-tap to rotate ── */
  function tap(i){
    const now = Date.now();
    if (i === S.lastI && now - S.lastAt < DBL_TAP){
      S.lastI = -1; S.lastAt = 0;
      rotate(i);
      return;
    }
    S.lastI = i; S.lastAt = now;
    if (G.draft.sel !== i){
      G.draft.sel = i;
      sfx('piece.lift', { gain:0.4 });
      paintPlace();
    }
  }

  /* the keyboard / assistive path: buttons still emit clicks, and a click
     that is only the tail of a gesture we have already handled is dropped.
     The window is deliberately SHORT. The compatibility click lands within
     a frame of pointerup — anything later is a real second interaction, and
     a wide window swallows it. The first cut used 400ms and ate the second
     tap of "tap a boat, tap the sea" whenever the thumb was quick. */
  const fresh = () => Date.now() - S.blockClick > 120;
  stage.querySelectorAll('#bs-pgrid .bs-c').forEach(b =>
    b.onclick = () => {
      if (!fresh()) return;
      const c = +b.dataset.c;
      const at = draftCells()[c];
      if (at !== undefined){ tap(at); return; }
      tryMove(G.draft.sel, c, G.draft.p[G.draft.sel * 2 + 1]);   /* tap the sea to move */
    });
  stage.querySelectorAll('.bs-boat').forEach(b =>
    b.onclick = () => { if (fresh()) tap(+b.dataset.i); });
}

/* TURNING IS NOT A MOVE, and it cannot borrow tryMove(): that function's
   kindness — "if it will not fit this way round, try the other" — is
   exactly wrong here, because the other way round is where the boat
   ALREADY IS. A refused rotate therefore flipped straight back and
   reported success, so the boat silently never turned. Rotate about the
   bow instead, and if the new run hangs off the board or lands on a
   neighbour, walk it back along its own axis until it fits. Only when
   nothing fits is it a no. */
function rotate(i){
  const p = G.draft.p.slice();
  const o = p[i * 2 + 1] ? 0 : 1;
  const len = E.FLEET[i].len;
  const a = p[i * 2];
  let ax = E.CX(a), ay = E.CY(a);
  if (o) ay = Math.min(ay, E.H - len); else ax = Math.min(ax, E.W - len);
  const tries = [E.AT(ax, ay)];
  for (let d = 1; d < len; d++){
    if (o){ if (ay - d >= 0) tries.push(E.AT(ax, ay - d)); }
    else  { if (ax - d >= 0) tries.push(E.AT(ax - d, ay)); }
  }
  for (const c of tries){
    const q = p.slice();
    q[i * 2] = c; q[i * 2 + 1] = o;
    if (!E.badPlacement(q)){
      G.draft.p = q;
      G.draft.sel = i;
      sfx('ui.toggle', { gain:0.45 });
      paintPlace();
      return;
    }
  }
  sfx('ui.error', { gain:0.5 });
  if (K && K.toast) K.toast('\u26a0 No room to turn it there.');
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
  const seat = G.mySeat;
  const mv = { t:'place' };
  for (let i = 0; i < G.draft.p.length; i++) mv['p' + i] = G.draft.p[i];
  /* my skin travels WITH my fleet — one byte, on the one move every
     player sends exactly once, so a rejoin's replay carries it too.
     Stock sends nothing: absent = stock on every build, old or new.
     `e` is declared in LOBBY.wire.fields; the engine ignores it. */
  const sc = SKIN_WIRE[skinOf(seat)];
  if (sc) mv.e = sc;
  G.draft = null;
  const r = localApply(seat, mv);
  if (!r.ok) return;
  sfx('ui.toggle');
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
  /* the picker is the lowest seat still in — the engine's rule, mirrored.
     If the host leaves during the pick the question moves to the next
     chair instead of the table waiting on somebody who has gone. */
  const alive = E.aliveSeats(G.st);
  const picker = alive.length ? alive[0] : 0;
  const host = G.mode === 'online' ? (G.mySeat === picker) : true;
  setTurnStrip({ col:'#FFC542', who: host ? 'Pick the game' : nameOf(picker) + ' is picking the game', note:'' });
  if (!host){
    G.els.stage.innerHTML = '<div class="bs-waitbox"><p>' + esc(nameOf(picker)) +
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
  G.els.stage.querySelector('#bs-mk').onclick = () => localApply(picker, { t:'mode', o:1 });
  G.els.stage.querySelector('#bs-ml').onclick = () => localApply(picker, { t:'mode', o:0 });
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

  /* YOUR TURN OPENS IN FIRE MODE.
     volley() deliberately swings the view to your own sea so you can watch
     the shells land on you — that part is right and stays. What was wrong
     is where it LEAVES you: control came back with your own base on screen
     and the only way out was a small toggle under the grid, so every turn
     began by hunting for it.

     Snapped ONCE per turn, keyed on the engine's own turn counter, which
     is the whole reason this is not simply `if (mine) view = 'them'`:
     that version would fight the player. Tapping through to your own sea
     DURING your turn has to keep working — this moves you at the start of
     a turn, it does not hold you there.

     THE STAMP IS TAKEN ON EVERY MY-TURN PAINT, NOT ONLY WHEN FLIPPING.
     The first cut stamped snapTurn inside the view==='mine' branch, and
     the test found the hole: a turn that OPENS on the enemy sea (your
     first turn, or the machine shot somebody else) never stamped — so
     the first peek at your own base that turn was bounced straight back
     to the enemy by the very next repaint. Stamp first, then flip only
     if the stamp was actually stale AND you were left on your own sea. */
  if (mine && G.snapTurn !== st.tcount){
    G.snapTurn = st.tcount;
    if (G.view === 'mine'){
      G.view = 'them';
      /* and it must be somebody real to shoot at: the last grid watched
         may have been our own, or a seat since knocked out */
      const t = st.seats[G.target];
      if (G.target === me || !t || t.out){
        for (let i = 0; i < st.seats.length; i++)
          if (i !== me && st.seats[i] && !st.seats[i].out){ G.target = i; break; }
      }
    }
  }
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
  const px = gridPx();
  /* THE BOARD WEARS ITS OWNER'S SKIN; THE FX WEAR THE ATTACKER'S.
     bs-skin-* follows the seat whose sea this is (mine on my sea, the
     target's on theirs), bs-atk-* the seat whose gun is live — during
     a volley that is the shooter (G.atk, set by volley()), otherwise
     me, so my aim ring is always my own. See §3b. */
  const atkSeat = (G.atk === undefined || G.atk === null) ? me : G.atk;
  let grid = '<div class="bs-pane"><div class="bs-gwrap' +
             skinCls(showMine ? me : G.target, ' bs-skin-') +
             skinCls(atkSeat, ' bs-atk-') +
             '"><div class="bs-grid' +
             (showMine ? ' minev' : '') + '" id="bs-grid" style="--bq:' + px + 'px">';
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
  /* YOUR sea shows your fleet; THEIRS shows only what you have already
     sunk. Drawing a half-hit boat on an opponent's grid would hand its
     shape — and therefore the rest of its cells — away for nothing.
     The .bs-fx sheet on top is where shells, plumes and bursts live;
     and when you peek at your own sea DURING your own turn, the cue
     pill says out loud what a tap on the water already did quietly:
     it puts you back on the enemy, aiming. */
  grid += '</div>' + shipLayer(subject, showMine, px, null) +
    '<div class="bs-fx"></div>' +
    (showMine && mine ? '<div class="bs-firecue"><b>SPARA!</b><i>Tap the sea to aim</i></div>' : '') +
    '</div></div>';

  /* my little sea + fleet health */
  const my = st.seats[me];
  let mini = '<button type="button" class="bs-mini-wrap' + skinCls(me, ' bs-skin-') +
    '" id="bs-swap" aria-label="Swap view">' +
    '<span class="bs-grid mini">';
  for (let c = 0; c < E.CELLS; c++){
    const sh = E.shipAt(my, c);
    mini += '<span class="bs-c' + (my.shot[c] === 2 ? ' hit' : my.shot[c] === 1 ? ' miss' : '') +
            (sh ? ' ship' : '') + '"></span>';
  }
  /* on your own turn the way back is not a direction, it is the thing you
     came here to do — so it says so */
  mini += '</span><i>' + (showMine ? (mine ? 'SPARA!' : 'LURA GĦAT-TIR')
                                   : 'IL-BAĦAR TIEGĦEK') + '</i></button>';
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
      /* it LEAVES — offline it keeps the battle, online it tells the table.
         It never said "resign" honestly, because nothing was being conceded. */
      '<button class="btn sm ghost" id="bs-flag">' +
        (window.ILB ? window.ILB('flag', 'Leave') : 'Leave') + '</button>' +
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
  if (G.finished) return;   /* one full stop per battle, however the event arrives */
  G.finished = true;
  clearSave();
  const st = G.st;
  const iWon = e.winner === G.mySeat;
  const tone = iWon ? 'win' : 'lose';
  { const S = SFX(); if (S && S.boardEnd) S.boardEnd({ win: iWon }); }

  /* ── WHICH SCREEN, AND WHO PAYS ────────────────────────────────────
     A battle somebody actually WON finishes into ir-rebbieħ, the shared
     winner screen. "Everybody left" (winner -1) keeps the plain card —
     an abandoned sea has nobody to crown.

     THE MONEY MUST MOVE EXACTLY ONCE. On the CARD path nothing changes:
     P.record (vs the machine) and the U.result call are both wrapped by
     js/progress.js, which pays the first and swallows the echo. On the
     REBBIEĦ path the U.result wrapper never fires, so awardPlay pays
     here instead — BEFORE P.record and WITHOUT a match id, on purpose:
     an id-less award is deduped by progress.js on (game|result) inside a
     ten-second window, so this payment seeds that window and P.record's
     own wrapped award (kept for the ledger, uneditable from here) lands
     on 'already' instead of paying twice; an id-carrying award would
     bypass that shared window and double-pay. The G.finished latch above
     is what keeps this to one firing per battle. `ranked` is true only
     when mp.js says a real pot is on this table. */
  const R2 = window.KARTI_REBBIEH;
  const useReb = !!(R2 && R2.show) && e.winner >= 0;
  const MPX = window.KARTI_MP;
  const staked = !!(MPX && MPX.MP && MPX.MP.stakeLive);
  let pay = null;
  if (useReb && window.KARTI_XP && KARTI_XP.awardPlay){
    try {
      const r = KARTI_XP.awardPlay({ game: GID, won: iWon, ranked: staked });
      if (r && r.counted) pay = r;
    } catch(err){}
  }
  if (G.mode === 'ai') P.record(GID, iWon ? 'w' : 'l');

  /* ── THE POT, when the room played for chips ───────────────────────
     Online staked play settles through mp.js's own idempotent door — the
     same stakeSettle() its wrapped U.result would have reached; calling
     it directly keeps the wallet arithmetic identical on both screens.
     It returns what landed ({kind, pot, ante, humans}) or null (friendly
     table, offline, already settled), and rebbieħ paints it. */
  let potRes = null;
  if (useReb && staked && MPX.stakeSettle){
    try { potRes = MPX.stakeSettle(tone); } catch(err){}
  }

  const winName = e.winner >= 0 ? nameOf(e.winner) : 'Nobody';
  const head = iWon ? 'GĦARRAQTHOM!' : 'GĦARRQUK.';
  const why = e.winner >= 0
    ? winName + ' is the last fleet floating' +
      (st.mode === 'karti' ? ' after ' + st.tcount + ' turns of the cards.' : '.')
    : 'Everybody left. The sea keeps the lot.';
  const quip = iWon ? QUIP_WIN[(st.rng >>> 4) % QUIP_WIN.length]
                    : QUIP_LOSE[(st.rng >>> 4) % QUIP_LOSE.length];

  if (useReb){ showRebbieh(e, pay, potRes); return; }

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
   IR-REBBIEĦ — the shared winner screen, for a battle somebody WON.
   ───────────────────────────────────────────────────────────────────
   The board's own voice stays as it is; the winner screen is the one
   surface every game shares, so its strings follow the app's bilingual
   rule through KARTI_LANG. Rebbieħ is a fixed full-screen overlay with
   its own backdrop, so the exclusive board skins (bs-skin-armata /
   bs-skin-roza, classes on OUR root) cannot reach into it — the skin
   keeps the sea, the ceremony keeps the ceremony. */
const RT = (en, mt) => (window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en);

function showRebbieh(e, pay, potRes){
  if (!G || !G.root) return;
  const R2 = window.KARTI_REBBIEH;
  if (!R2 || !R2.show) return;
  const st = G.st;
  const iWon = e.winner === G.mySeat;

  /* THE STANDINGS OF A SEA BATTLE. The winner is first; everyone else
     ranks by how long their navy lasted — G.gone holds the elimination
     order (see volley()/'out'), so the LAST fleet under ranks highest
     among the fallen, and a seat that somehow never registered a sinking
     falls back to un-hit cells left. The score column is the honest one:
     boats still afloat out of the fleet. Seat colours ride in as border
     ids; avatars stay null so rebbieħ draws its initials tile. */
  const BORDER = ['jade', 'ruby', 'ice', 'gold', 'neon', 'fire'];
  const gone = G.gone || [];
  const rows = st.seats.map((s, i) => ({
    seat: i,
    name: s.name,
    you: i === G.mySeat,
    bot: s.kind === 'cpu' || s.own === 'ai',
    afloat: s.ships ? s.ships.filter(sh => !sh.sunk).length : 0,
    fleet: s.ships ? s.ships.length : 5,
    left: s.left | 0,
    fell: gone.indexOf(i)
  }));
  rows.sort((a, b) => {
    if (a.seat === e.winner) return -1;
    if (b.seat === e.winner) return 1;
    if ((a.fell < 0) !== (b.fell < 0)) return a.fell < 0 ? -1 : 1;  /* never-sunk above the sunk */
    if (a.fell !== b.fell) return b.fell - a.fell;                  /* went under later = higher */
    return b.left - a.left;                                         /* else: more hull remaining */
  });
  rows.forEach((r, i) => { r.place = i + 1; });

  /* the shared screen's XP block from awardPlay's figures; bar fractions
     are progress.js's private business, so the house near-full trick. */
  const xp = pay ? { level: pay.level, gained: pay.xp, leveledUp: !!pay.levelled,
                     before: 0, after: pay.levelled ? 1 : 0.7 } : null;

  /* the pot, said OUT LOUD in the subtitle as well as handed to the
     reward block — the ceremony must survive an older rebbieħ build that
     does not draw `reward` yet */
  let sub = RT('Last fleet floating', 'L-aħħar flotta f’wiċċ il-baħar') +
            (st.mode === 'karti' ? ' · ' + st.tcount + ' ' + RT('turns', 'dawriet') : '');
  if (potRes){
    sub = potRes.kind === 'win'
      ? RT('The pot is yours: +' + potRes.pot + ' chips', 'Il-pot tiegħek: +' + potRes.pot + ' ċips')
      : RT('Your ante went to the winner: −' + potRes.ante + ' chips',
           'L-ante tiegħek mar għand ir-rebbieħ: −' + potRes.ante + ' ċips');
  }

  const backToRooms = () => { const n = G && G.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); };
  const online = G.mode === 'online';

  R2.show({
    lang: (window.KARTI_LANG ? KARTI_LANG.lang() : 'en'),
    reduced: reducedMo(),
    title: iWon ? 'GĦARRAQTHOM!' : RT('They sank you', 'GĦARRQUK'),
    subtitle: sub,
    rows: rows.map(r => ({
      name: r.name, place: r.place, you: r.you, bot: r.bot,
      score: r.afloat + '/' + r.fleet,
      border: BORDER[r.seat % BORDER.length]
    })),
    xp,
    /* the reward block: all plain POSITIVE numbers per rebbieħ's contract —
       `staked` is the ante that left this wallet (rebbieħ captions it),
       `pot` only lands on the winner (a loss is told in the subtitle; the
       block draws prizes, not punishments) */
    reward: (pay || potRes) ? {
      xp: pay ? pay.xp : 0,
      chips: pay ? (pay.chips | 0) + (pay.chipsLevel | 0) : 0,
      wonBonus: pay ? pay.wonBonus : 0,
      staked: potRes ? potRes.ante : 0,
      pot: (potRes && potRes.kind === 'win') ? potRes.pot : 0
    } : undefined,
    sound: id => sfx(id, { gain:0.6 }),
    /* ONLINE both doors lead back to the rooms, exactly as the card's one
       button did. LOCAL keeps the card's semantics: primary is the same-
       table rematch, Leave is the battle's own door (menu), where "change
       the table" and the way back to the party shelf both already live. */
    playAgainLabel: online ? RT('Back to the rooms', 'Lura għall-kmamar')
                           : RT('Again', 'Erġa’'),
    playAgainCaption: online ? null
      : RT('Leave goes to the harbour door — change the table there.',
           'Oħroġ imur għall-bieb tal-port — ibdel il-mejda hemm.'),
    onPlayAgain: online ? backToRooms
      : () => { const pf = P.pref(GID); newLocal({ gmode: st.mode, who: G.mode, level: pf.level || 2, foes: pf.foes || 1 }); },
    onLeave: online ? backToRooms : () => { leave(); menu(); }
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
  /* THE MODE COMES FROM THE LOBBY'S RULES PICKER. The shared lobby folds the
     room's chosen variant onto cfg.opts.mode (mp.js: opts.mode = m.variant);
     that variant is 'karti' or 'klassika', the two nets LOBBY.variants
     publishes. Passing it straight into newMatch lands the online battle in
     phase 'place' — the ship-placement step — instead of phase 'mode'. A
     MISSING mode (an older relay, or a room that never picked one) is still
     honoured: newMatch then opens in phase 'mode' and the in-game host
     mode-pick (paintModePick) answers it, exactly as before — nothing about
     that path is removed. */
  const netMode = (cfg.opts && (cfg.opts.mode === 'klassika' || cfg.opts.mode === 'karti'))
    ? cfg.opts.mode : null;
  const st = E.newMatch({ mode: netMode, seats: defs, seed: cfg.seed >>> 0 });
  G = { st, mode:'online', mySeat: cfg.you | 0, net: cfg.net || null,
        stage:'place', view:'them', target: -1, aim: null,
        q: [], busy: false, dead: false };
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
  /* THE HOST-CHANGEABLE MODE, as the shared lobby's Rules picker wants it
     (mp.js: lobbyVariants → currentVariant → applyVariant → {t:'setvariant'}).
     GĦARRAQHOM's flavour is the mode — the fun KARTI shot-card game or the
     plain Klassika one-shell-a-turn game — and now it is picked in the online
     lobby before the fleets go down, not with the in-game host tap. Each
     entry's `net` is the relay's word for the mode, which is exactly what
     newMatch takes, so applyVariant hands it back untouched. */
  variants: [
    { net:'karti',    label:{ en:'KARTI mode', mt:'Mod KARTI' } },
    { net:'klassika', label:{ en:'Klassika',   mt:'Klassika' } }
  ],
  /* the room is the authority: prefer the relay's word (MP.variant), and when
     no room has spoken yet default to karti — the same default the offline
     start and setupAI use, so the Rules button opens on the fun mode. */
  currentVariant(){
    try {
      const v = window.KARTI_MP && window.KARTI_MP.MP && window.KARTI_MP.MP.variant;
      if (v === 'klassika' || v === 'karti') return v;
    } catch(e){}
    return 'karti';
  },
  /* a picked mode → the wire word. mp.js re-broadcasts it as the room's
     variant, which onlineStart then reads back onto newMatch's `mode`. */
  applyVariant(net){
    return { variant: net === 'klassika' ? 'klassika' : 'karti' };
  },
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
    G = { st, mode:'ai', mySeat:0, net:null, stage:'place', view:'them',
          target:-1, aim:null, q:[], busy:false, dead:false };
    G.target = pickTarget();
    mount(); paintPlace();
    return st;
  },
  /* HOW A GĦARRAQHOM MOVE FOLDS ONTO THE RELAY'S FIVE FIELDS.
     Positional — reordering this list silently swaps fields on the
     wire between builds. js/battleship.js documents the same order.
     `e` is APPENDED, never inserted: it is the exclusive-skin byte
     riding the {t:'place'} move (1 armata, 2 roża, absent stock —
     see §3b). An older build's list is one shorter, so its decoder
     never reads bit 17 and simply leaves the trailing value unused:
     the fleet lands, the skin degrades to stock, nothing refuses. */
  wire: { fields: ['g', 'c', 'o', 'w', 'x', 'u', 'z',
                   'p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9',
                   'e'] },
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
    /* the resume door and its bin, side by side */
    '#scr-party .bs-resume{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:stretch}' +
    '#scr-party .bs-bin{display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'gap:3px;padding:8px 12px;border-radius:14px;color:#FFB3BC;' +
      'background:rgba(255,84,104,.10);border:1px solid rgba(255,84,104,.34);' +
      'font:900 9px/1 var(--disp);letter-spacing:.09em;text-transform:uppercase}' +
    '#scr-party .bs-bin:active{background:rgba(255,84,104,.2)}' +
    '#scr-party .bs-bin .ico{width:17px;height:17px}' +
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
    /* under the artwork the cell is only a berth: a faint darker water so
       the run still reads if the SVG never paints, and no coordinate letter
       competing with a hull */
    '#scr-party .bs-grid.place .bs-c.ship{background:linear-gradient(180deg,#1B4470,#153458)}' +
    '#scr-party .bs-c.ship .bs-co{opacity:0}' +

    /* ══ THE SHIPS ══
       Their own layer above the grid: a tile must clip and a ship must
       not. pointer-events:none throughout, so the grid underneath keeps
       every tap and the drag machinery reads raw coordinates anyway. */
    '#scr-party .bs-gwrap{position:relative;flex:0 0 auto}' +
    '#scr-party .bs-ships{position:absolute;inset:0;pointer-events:none;z-index:2;' +
      'overflow:hidden;border-radius:10px}' +
    '#scr-party .bs-ship{position:absolute;overflow:visible;display:block}' +
    /* THE INK RIM, the thing that makes these belong to the same family as
       every other mark in the app: stroke first, fill over it. */
    '#scr-party .bs-ship{filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.55))}' +
    '#scr-party .bs-ship .bs-hull{fill:#E4EBF6;stroke:#150C22;stroke-width:.55;' +
      'stroke-linejoin:round;paint-order:stroke fill}' +
    /* THE TWO SHADOW TONES. On artkit's dark medallions a recess is the
       same colour at .45/.75 and the panel shows through; on a PALE hull
       that is invisible, because the parent it sits on is opaque and the
       same colour. So the two tones are expressed the other way up here —
       dark ink over light hull — which is the same idea and the only one
       that reads. Deck houses and oars take the deep tone, decking and
       floats the shallow one. */
    '#scr-party .bs-ship .bs-hull .dt{fill:#31435E;stroke-width:.3}' +
    '#scr-party .bs-ship .bs-hull .lt{fill:#8CA3C2;stroke-width:.3}' +
    /* a boat being dragged floats over everything and says yes or no */
    '#scr-party .bs-ship.drag{z-index:3;filter:drop-shadow(0 5px 7px rgba(0,0,0,.6))}' +
    '#scr-party .bs-ship.drag.ok .bs-hull{fill:#8FF0BC}' +
    '#scr-party .bs-ship.drag.bad .bs-hull{fill:#FF9A8C;opacity:.9}' +
    '#scr-party .bs-ship.sel .bs-hull{stroke:#3DDC84;stroke-width:.75}' +
    /* SUNK: the hull goes to charred iron and lists over. It must never be
       mistakable for a live boat, and the red cells still burn underneath. */
    '#scr-party .bs-ship.sunk .bs-hull{fill:#4A3730;stroke:#0E0710;opacity:.92}' +
    '#scr-party .bs-ship.sunk .bs-hull .dt,#scr-party .bs-ship.sunk .bs-hull .lt{fill:#2A1C18}' +
    '#scr-party .bs-ship.sunk{opacity:.95}' +
    /* DAMAGE, drawn ON the hull — one burst per hit cell, above the art */
    '#scr-party .bs-ship .bs-burst{fill:#FFB35C;stroke:#7A2415;stroke-width:.5;' +
      'stroke-linejoin:round;paint-order:stroke fill}' +
    '#scr-party .bs-ship.sunk .bs-burst{fill:#8C1E0C;stroke:#0E0710}' +
    /* the dock chip: the same boat, small */
    '#scr-party .bs-chip{display:block;overflow:visible}' +
    '#scr-party .bs-chip .bs-hull{fill:#E4EBF6;stroke:#150C22;stroke-width:.7;' +
      'stroke-linejoin:round;paint-order:stroke fill}' +
    '#scr-party .bs-chip .bs-hull .dt{fill:#31435E;stroke-width:.35}' +
    '#scr-party .bs-chip .bs-hull .lt{fill:#8CA3C2;stroke-width:.35}' +
    '#scr-party .bs-boat.on .bs-chip .bs-hull{fill:#8FF0BC}' +

    /* ══ THE SALVO ══
       Everything transient lives on .bs-fx, one clipped sheet over the
       sea. Every animation below moves only transform and opacity —
       positions are inline, written once at spawn. The sink wobble uses
       the individual rotate/translate properties so it COMPOSES with the
       90° inline transform a vertical boat already carries. */
    '#scr-party .bs-fx{position:absolute;inset:0;pointer-events:none;z-index:4;' +
      'overflow:hidden;border-radius:10px}' +
    '#scr-party .bs-fx>div{position:absolute}' +
    /* the shell: tracer arcs in from the shooter\'s rail (big near the
       camera, small at the water), its landing shadow grows where it
       will strike — the wait before the impact is the impact */
    '#scr-party .bs-shell i{position:absolute;inset:0;' +
      'animation:bsFly var(--fd,400ms) cubic-bezier(.5,.05,.75,.4) both}' +
    '#scr-party .bs-shell i::before{content:"";position:absolute;left:50%;top:50%;' +
      'width:34%;height:34%;margin:-17% 0 0 -17%;border-radius:50%;' +
      'background:radial-gradient(circle at 35% 30%,#FFF6D8,#FFB35C 55%,#8C4A1C);' +
      'box-shadow:0 0 9px rgba(255,179,92,.85),0 0 20px rgba(255,179,92,.4)}' +
    '#scr-party .bs-shell.hv i::before{width:46%;height:46%;margin:-23% 0 0 -23%}' +
    '@keyframes bsFly{0%{transform:translate(var(--sx),var(--sy)) scale(1.7);opacity:0}' +
      '16%{opacity:1}' +
      '55%{transform:translate(calc(var(--sx)*.42),calc(var(--sy)*.45 - 15px)) scale(1.15)}' +
      '100%{transform:translate(0,0) scale(.55);opacity:1}}' +
    '#scr-party .bs-shell u{position:absolute;inset:30%;border-radius:50%;' +
      'background:rgba(5,9,17,.6);animation:bsMark var(--fd,400ms) linear both}' +
    '@keyframes bsMark{from{transform:scale(.25);opacity:0}to{transform:scale(1);opacity:.6}}' +
    /* impact on a hull: the burst, then the shockwave */
    '#scr-party .bs-boom i{position:absolute;inset:-32%;border-radius:50%;' +
      'background:radial-gradient(circle,#FFFDF0 0%,#FFD873 26%,#E8452C 58%,rgba(232,69,44,0) 72%);' +
      'animation:bsBoom .4s var(--ease) both}' +
    '@keyframes bsBoom{0%{transform:scale(.25);opacity:0}' +
      '22%{opacity:1;transform:scale(1)}100%{transform:scale(1.3);opacity:0}}' +
    '#scr-party .bs-boom u{position:absolute;inset:-4%;border-radius:50%;' +
      'border:2px solid rgba(255,211,140,.9);transform:scale(1.6);' +
      'animation:bsRing .55s cubic-bezier(.2,.7,.3,1) both}' +
    '@keyframes bsRing{0%{transform:scale(.3);opacity:.95}100%{transform:scale(2.3);opacity:0}}' +
    /* the last shell of a big card lands hardest */
    '#scr-party .bs-boom.big i{inset:-75%;animation-duration:.55s}' +
    '#scr-party .bs-boom.big u{animation-name:bsRingBig;animation-duration:.75s}' +
    '@keyframes bsRingBig{0%{transform:scale(.3);opacity:1}100%{transform:scale(3.4);opacity:0}}' +
    /* open water: the plume stands up, hangs, falls back; the ripple runs out */
    '#scr-party .bs-plume i{position:absolute;left:31%;right:31%;top:-52%;bottom:42%;' +
      'border-radius:46% 46% 30% 30%;transform-origin:50% 100%;' +
      'background:linear-gradient(180deg,rgba(246,251,255,.95),rgba(163,203,242,.8) 55%,rgba(163,203,242,0));' +
      'animation:bsPlume .64s cubic-bezier(.2,.6,.35,1) both}' +
    '@keyframes bsPlume{0%{transform:scaleY(0) scaleX(.55);opacity:0}' +
      '30%{opacity:1;transform:scaleY(1.08) scaleX(.9)}' +
      '55%{transform:scaleY(.96) scaleX(1)}' +
      '100%{transform:scaleY(.05) scaleX(1.3);opacity:0}}' +
    '#scr-party .bs-plume u,#scr-party .bs-fizz u{position:absolute;inset:6%;border-radius:50%;' +
      'border:2px solid rgba(185,212,242,.75);transform:scale(1.4);' +
      'animation:bsRipple .7s cubic-bezier(.2,.7,.3,1) both}' +
    '@keyframes bsRipple{0%{transform:scale(.35);opacity:.85}100%{transform:scale(1.9);opacity:0}}' +
    /* a shell wasted on an old crater barely raises the water */
    '#scr-party .bs-fizz u{border-color:rgba(150,170,195,.5);animation-duration:.45s}' +
    /* foam walking the length of a hull as the sea closes over it */
    '#scr-party .bs-foam u{position:absolute;inset:2%;border-radius:50%;' +
      'border:2.5px solid rgba(214,235,252,.8);transform:scale(1.5);' +
      'animation:bsFoam .9s cubic-bezier(.2,.6,.3,1) both}' +
    '@keyframes bsFoam{0%{transform:scale(.3);opacity:0}' +
      '25%{opacity:.9}100%{transform:scale(1.75);opacity:0}}' +
    /* the launch glow on the rail the shells leave from */
    '#scr-party .bs-muzz{left:0;right:0;bottom:0;height:15%;transform-origin:50% 100%;' +
      'background:linear-gradient(0deg,rgba(255,197,66,.5),rgba(255,197,66,0));' +
      'animation:bsMuzz .5s var(--ease) both}' +
    '#scr-party .bs-muzz.n{bottom:auto;top:0;transform-origin:50% 0;' +
      'background:linear-gradient(180deg,rgba(232,69,44,.45),rgba(232,69,44,0))}' +
    '#scr-party .bs-muzz.hv{height:22%;animation-duration:.65s}' +
    '@keyframes bsMuzz{0%{transform:scaleY(.2);opacity:0}30%{opacity:1;transform:scaleY(1)}' +
      '100%{transform:scaleY(.6);opacity:0}}' +
    /* the kick — on the pane, small, and only when it is earned */
    '#scr-party .bs-pane.bs-quake{animation:bsQuake .38s var(--ease) both}' +
    '@keyframes bsQuake{0%,100%{transform:translate3d(0,0,0)}' +
      '25%{transform:translate3d(-3px,2px,0)}55%{transform:translate3d(3px,-2px,0)}' +
      '80%{transform:translate3d(-2px,-1px,0)}}' +
    '#scr-party .bs-pane.bs-quake2{animation:bsQuake2 .52s var(--ease) both}' +
    '@keyframes bsQuake2{0%,100%{transform:translate3d(0,0,0)}' +
      '14%{transform:translate3d(-8px,5px,0)}32%{transform:translate3d(7px,-5px,0)}' +
      '52%{transform:translate3d(-6px,-3px,0)}72%{transform:translate3d(5px,4px,0)}' +
      '88%{transform:translate3d(-2px,-2px,0)}}' +
    /* THE MONEY SHOT: the tagged hull lists, settles, and stays down.
       On an enemy sea it fades in as it lists — being seen at all is the
       news — and `own` keeps your own boat solid while it goes. */
    '#scr-party .bs-ship.sinking{animation:bsSink 1.05s cubic-bezier(.35,0,.35,1) both}' +
    '@keyframes bsSink{0%{opacity:0;translate:0 -5px;rotate:0deg}18%{opacity:1}' +
      '38%{rotate:-5deg;translate:3px 1px}66%{rotate:3deg;translate:-2px 3px}' +
      '100%{rotate:0deg;translate:0 0;opacity:1}}' +
    '#scr-party .bs-ship.sinking.own{animation-name:bsSinkOwn}' +
    '@keyframes bsSinkOwn{0%{rotate:0deg;translate:0 0}30%{rotate:-5deg;translate:3px 1px}' +
      '64%{rotate:3deg;translate:-2px 3px}100%{rotate:0deg;translate:0 0}}' +
    /* the way back to the fight, said out loud */
    '#scr-party .bs-firecue{position:absolute;left:50%;top:50%;z-index:5;pointer-events:none;' +
      'transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px;' +
      'padding:10px 18px;border-radius:14px;background:rgba(10,8,16,.8);' +
      'border:1px solid rgba(255,197,66,.55);box-shadow:0 10px 26px rgba(0,0,0,.5);' +
      'animation:bsCue 1.5s ease-in-out infinite}' +
    '#scr-party .bs-firecue b{font:900 16px/1 var(--disp);letter-spacing:.08em;color:var(--gold)}' +
    '#scr-party .bs-firecue i{font-style:normal;font:700 9.5px/1 var(--disp);letter-spacing:.09em;' +
      'text-transform:uppercase;color:var(--dim)}' +
    '@keyframes bsCue{0%,100%{opacity:.82;transform:translate(-50%,-50%) scale(1)}' +
      '50%{opacity:1;transform:translate(-50%,-50%) scale(1.035)}}' +

    /* ══ THE GESTURE ══
       touch-action is declared HERE, before any gesture exists. Setting it
       on pointerdown is too late: the browser has already given the touch
       to the scroller and the boat stutters while the page slides. */
    '#scr-party .bs-gwrap.place,#scr-party .bs-gwrap.place .bs-grid,' +
    '#scr-party .bs-gwrap.place .bs-c,#scr-party .bs-boat{touch-action:none;' +
      '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}' +
    '#scr-party .bs-gwrap.dragging{cursor:grabbing}' +
    '#scr-party .bs-gwrap.dragging .bs-c{transition:none}' +

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
    '#scr-party .bs-boat{padding:5px 9px 6px;gap:3px}' +
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

    /* ── banners, waits ── */
    '#scr-party .bs-banner{position:absolute;left:50%;top:34%;transform:translateX(-50%);z-index:28;' +
      'max-width:88%;padding:10px 16px;border-radius:13px;font:900 13px/1.35 var(--disp);' +
      'letter-spacing:.06em;text-transform:uppercase;text-align:center;color:var(--txt);' +
      'background:rgba(14,11,20,.94);border:1px solid var(--line2);box-shadow:0 12px 30px rgba(0,0,0,.5);' +
      'animation:ptFade .18s var(--ease) both}' +
    '#scr-party .bs-banner.hot{border-color:rgba(232,69,44,.6);color:#FFB39F}' +
    '#scr-party .bs-banner.bye{opacity:0;transition:opacity .35s}' +
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
      '#scr-party .bs-hint.aim{order:4}}' +

    /* ── reduced motion: still, readable, never disabled ──────────────
       The same two doors the avatar borders honour: the OS setting and
       the app's own body.reduced. Nothing flies and nothing shakes; an
       impact is a quiet fade at its resting size (the base transforms
       above ARE the readable frame), a sunk boat simply appears settled.
       The volley timetable is untouched, so the pacing — and lockstep —
       is identical. */
    '@media (prefers-reduced-motion:reduce){' +
      '#scr-party .bs-shell,#scr-party .bs-muzz{display:none}' +
      '#scr-party .bs-boom i,#scr-party .bs-boom u,#scr-party .bs-plume i,' +
      '#scr-party .bs-plume u,#scr-party .bs-fizz u{animation:bsStillFx .5s linear both}' +
      '#scr-party .bs-plume i{transform:none}' +
      '#scr-party .bs-boom i{transform:scale(1)}' +
      '#scr-party .bs-c.fresh::after{animation:none}' +
      '#scr-party .bs-pane.bs-quake,#scr-party .bs-pane.bs-quake2{animation:none}' +
      '#scr-party .bs-ship.sinking,#scr-party .bs-ship.sinking.own{animation:bsStillIn .3s linear both}' +
      '#scr-party .bs-firecue{animation:none}' +
      '#scr-party .bs-flip{animation:none}}' +
    'body.reduced #scr-party .bs-shell,body.reduced #scr-party .bs-muzz{display:none}' +
    'body.reduced #scr-party .bs-boom i,body.reduced #scr-party .bs-boom u,' +
    'body.reduced #scr-party .bs-plume i,body.reduced #scr-party .bs-plume u,' +
    'body.reduced #scr-party .bs-fizz u{animation:bsStillFx .5s linear both}' +
    'body.reduced #scr-party .bs-plume i{transform:none}' +
    'body.reduced #scr-party .bs-boom i{transform:scale(1)}' +
    'body.reduced #scr-party .bs-c.fresh::after{animation:none}' +
    'body.reduced #scr-party .bs-pane.bs-quake,' +
    'body.reduced #scr-party .bs-pane.bs-quake2{animation:none}' +
    'body.reduced #scr-party .bs-ship.sinking,' +
    'body.reduced #scr-party .bs-ship.sinking.own{animation:bsStillIn .3s linear both}' +
    'body.reduced #scr-party .bs-firecue{animation:none}' +
    'body.reduced #scr-party .bs-flip{animation:none}' +
    '@keyframes bsStillFx{0%{opacity:0}30%{opacity:.8}70%{opacity:.8}100%{opacity:0}}' +
    '@keyframes bsStillIn{from{opacity:0}to{opacity:1}}' +

    /* ══ THE SETUP SHEET'S OWN FACE — scoped to .bs-menu ══
       The identity piece is THE FLEET AT ANCHOR: the same five hulls
       the game draws (shipChip → SHIP_ART), chip-sized, riding on the
       gridded sea the battle is fought on, one gold aim ring already
       out on the water. Sea-blue through and through — this sheet
       shares no felt with the card tables next door. */
    '#scr-party .bs-menu .pt-lbl{color:#8FC6F2}' +
    '#scr-party .bs-menu .bs-hero{position:relative;height:118px;margin:2px 0 12px;' +
      'border-radius:16px;overflow:hidden;border:1px solid rgba(0,0,0,.55);' +
      'background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),' +
      'linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px),' +
      'radial-gradient(130% 140% at 50% 0%,#1E4A7C 0%,#173A63 48%,#0D2342 100%);' +
      'background-size:24px 24px,24px 24px,100% 100%;' +
      'box-shadow:inset 0 2px 0 rgba(255,255,255,.06),inset 0 -16px 28px rgba(0,0,0,.45)}' +
    '#scr-party .bs-menu .bs-hb{position:absolute;line-height:0;' +
      'filter:drop-shadow(0 2px 2px rgba(0,0,0,.5))}' +
    /* the aim ring: somebody is already being lined up */
    '#scr-party .bs-menu .bs-haim{position:absolute;width:18px;height:18px;border-radius:50%;' +
      'border:2px solid rgba(255,197,66,.75);box-shadow:0 0 8px rgba(255,197,66,.35)}' +
    '#scr-party .bs-menu .bs-haim::after{content:"";position:absolute;left:50%;top:50%;' +
      'width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:var(--gold)}' +
    '#scr-party .bs-menu .bs-hcap{position:absolute;right:11px;bottom:7px;' +
      'font:900 9.5px/1 var(--disp);letter-spacing:.18em;color:rgba(255,255,255,.25)}' +
    '@media (max-height:520px){#scr-party .bs-menu .bs-hero{height:96px}}' +

    /* ── THE ENTRY MODE PICKER — screen one. Big, few, clean, the same
       shape the other party games open with (kanun/bomba): a stack of
       full-width buttons, the first one lit. The settings wall (game,
       difficulty, how many) lives one tap deeper on the AI setup. ── */
    '#scr-party .bs-menu .bs-modes{display:flex;flex-direction:column;gap:11px;margin:6px 0 8px}' +
    '#scr-party .bs-menu .bs-mode{-webkit-appearance:none;appearance:none;border:0;text-align:left;' +
      'display:flex;align-items:center;gap:13px;padding:16px 16px;border-radius:16px;' +
      'background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);' +
      'color:var(--txt);cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .bs-menu .bs-mode .bs-mi{flex:0 0 auto;width:40px;height:40px;display:flex;' +
      'align-items:center;justify-content:center;border-radius:12px;' +
      'background:rgba(143,198,242,.12);color:#8FC6F2}' +
    '#scr-party .bs-menu .bs-mode .bs-mi .ico{width:24px;height:24px}' +
    '#scr-party .bs-menu .bs-mode .bs-mt{display:flex;flex-direction:column;gap:2px;min-width:0}' +
    '#scr-party .bs-menu .bs-mode .bs-mt b{font:900 15px/1.1 var(--disp);letter-spacing:.03em}' +
    '#scr-party .bs-menu .bs-mode .bs-mt i{font:600 11.5px/1.35 var(--body);color:var(--dim);' +
      'font-style:normal}' +
    '#scr-party .bs-menu .bs-mode.primary{background:linear-gradient(180deg,rgba(255,197,66,.2),' +
      'rgba(255,197,66,.06));box-shadow:inset 0 0 0 1px rgba(255,197,66,.42),' +
      '0 8px 20px rgba(255,197,66,.14)}' +
    '#scr-party .bs-menu .bs-mode.primary .bs-mi{background:rgba(255,197,66,.2);color:var(--gold,#FFC542)}' +
    '#scr-party .bs-menu .bs-mode.primary .bs-mt b{color:var(--gold,#FFC542)}' +
    '#scr-party .bs-menu .bs-mode:active{transform:translateY(1px)}' +
    '#scr-party .bs-menu .bs-mode .bs-mchev{margin-left:auto;flex:0 0 auto;color:var(--dim);opacity:.6}' +
    '#scr-party .bs-menu .bs-mode .bs-mchev svg{width:18px;height:18px;stroke:currentColor;fill:none;' +
      'stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}' +
    '#scr-party .bs-menu .bs-mode[disabled]{opacity:.5}' +

    /* ── the rules FOLD on the setup sheet — rummy's slide, restated
       under this scope. grid-rows 0fr→1fr for the height, transform +
       opacity on the body, instant under reduced motion. ── */
    '#scr-party .bs-foldbox{margin:14px 2px 4px;padding:2px 14px;border-radius:14px;' +
      'background:rgba(255,255,255,.04);border:1px solid var(--line)}' +
    '#scr-party .bs-fold-h{display:flex;align-items:center;gap:10px;width:100%;text-align:left;' +
      'border:0;background:none;padding:2px 0;margin:0;color:var(--txt);cursor:pointer;' +
      'min-height:44px;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .bs-fold-h span{flex:1;min-width:0}' +
    '#scr-party .bs-fold-h b{display:block;font:900 10px/1.4 var(--disp);letter-spacing:.11em;' +
      'text-transform:uppercase;color:var(--gold,#FFC542)}' +
    '#scr-party .bs-fold-h i{display:block;font-style:normal;font-size:10.5px;line-height:1.4;' +
      'color:var(--dim);margin-top:3px;text-transform:none;letter-spacing:0}' +
    '#scr-party .bs-fold-h em{flex:0 0 auto;width:24px;height:24px;display:grid;' +
      'place-items:center;color:var(--dim)}' +
    '#scr-party .bs-fold-h em svg{width:15px;height:15px;stroke:currentColor;fill:none;' +
      'stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;transform:rotate(90deg);' +
      'transition:transform .22s var(--ease)}' +
    '#scr-party .bs-fold-h[aria-expanded="true"] em svg{transform:rotate(-90deg)}' +
    '#scr-party .bs-fold-b{display:grid;grid-template-rows:0fr;' +
      'transition:grid-template-rows .28s var(--ease)}' +
    '#scr-party .bs-fold-b.open{grid-template-rows:1fr}' +
    '#scr-party .bs-fold-i{overflow:hidden;min-height:0}' +
    '#scr-party .bs-fold-p{padding:4px 0 12px;transform:translateY(-10px);opacity:0;' +
      'transition:transform .28s var(--ease),opacity .28s var(--ease)}' +
    '#scr-party .bs-fold-b.open .bs-fold-p{transform:none;opacity:1}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .bs-fold-b,#scr-party .bs-fold-p,' +
      '#scr-party .bs-fold-h em svg{transition:none}}' +
    'body.reduced #scr-party .bs-fold-b,body.reduced #scr-party .bs-fold-p,' +
    'body.reduced #scr-party .bs-fold-h em svg{transition:none}';
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
      setDraft: p => { if (G){ ensureDraft(); G.draft.p = p; paintPlace(); } },
      act: e => { if (G) act(e, () => {}); },
      myTurn: () => myTurn(),
      reduced: () => reducedMo(),
      skins: () => (G ? G.skins : null),
      atk: () => (G ? G.atk : null)
    };
  }
} catch(e){}

})();

/* ═══════════════════════════════════════════════════════════════════
   GĦARRAQHOM — THE KIT SHELF (purely cosmetic, always)
   Seas, fleets, aim rings and hit bursts, declared through
   KARTI_XP.register() and applied one id deeper than the game's own
   sheet (#app #scr-party .bs-wrap). Because that prefix out-specifies
   every stock rule, the state classes the game paints with — .ship,
   .hit, .sunk, .drag — are EXCLUDED with :not() wherever a theme rule
   could otherwise sit on top of them. The style node is re-appended
   on every change so it always lands after the game's own sheet, and
   an unequipped slot writes nothing — stock look, untouched.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* sea: the open-water cell gradient, its coordinate ink, and the miss
   splash tinted to match. States keep their own paint via :not(). */
var SEAS = {
  'gharraq.sea.mediterran': { g:['#14497A','#0E355C'], t:'#7FB2E8', m:'#BFDCF6' },
  'gharraq.sea.sebh':       { g:['#1E6B63','#144A46'], t:'#8FD6C9', m:'#CFF2E8' },
  'gharraq.sea.maltemp':    { g:['#3A4656','#262E3B'], t:'#9AA9BC', m:'#C6D2E0' },
  'gharraq.sea.inbid':      { g:['#4E1D30','#2E0F1C'], t:'#D19AAE', m:'#EFC5D2' },
  /* MALTESE SUMMER — the only bright water on the shelf, so the
     coordinate ink flips to near-black and the splash to foam white
     rather than the pale blues the night seas use. */
  'gharraq.sea.nofsinhar':  { g:['#6FD0EE','#2FA3D2'], t:'#04202F', m:'#FFFFFF' }
};
/* fleet: hull + the two shadow tones. The warm ink outline #150C22
   stays stock always, and drag/sunk hulls keep their own colours. */
var FLEETS = {
  'gharraq.fleet.hadid': { h:'#9AA4AE', dt:'#3C4650', lt:'#C9D1D8' },
  'gharraq.fleet.luzzu': { h:'#F2E3C2', dt:'#7A5A24', lt:'#E8C572' }
};
/* ring: the two aim rings, full and half */
var RINGS = {
  'gharraq.ring.hgiega': { a:'#7FE8C4', b:'rgba(127,232,196,.45)' },
  'gharraq.ring.warda':  { a:'#FF9FBE', b:'rgba(255,159,190,.45)' },
  'gharraq.ring.abjad':  { a:'#FFFFFF', b:'rgba(255,255,255,.5)' }
};
/* burst: the scorched cell under it, the burst itself, the glow.
   Sunk cells keep their darker char (:not(.sunk)) and their dimmed
   ::after, which only ever touched opacity. */
var BURSTS = {
  'gharraq.burst.fjamma': { bg:['#7A2E12','#571507'], r:['#FFC46A','#F0562E','#8C1E0C'],
                            gl:'0 0 8px rgba(240,86,46,.8)' },
  'gharraq.burst.blu':    { bg:['#1E2A6E','#101745'], r:['#BDE6FF','#4C7DF0','#1B2C8C'],
                            gl:'0 0 8px rgba(92,140,255,.85)' },
  'gharraq.burst.deheb':  { bg:['#6E4A08','#3A2503'], r:['#FFFFFF','#FFDF8A','#B87A10'],
                            gl:'0 0 10px rgba(255,225,130,.95),0 0 20px rgba(255,197,66,.55)' },
  /* MALTESE SUMMER */
  'gharraq.burst.nar':    { bg:['#2B1350','#140724'], r:['#FFF7DC','#FF7A2E','#C41E5A'],
                            gl:'0 0 10px rgba(255,122,46,.9),0 0 20px rgba(196,30,90,.55)' }
};

/* ═══ THE EXCLUSIVE SKINS ═════════════════════════════════════════════
   Two full-board identities, one per earned exclusive set, and the
   HEADLINE of each is that the firing sequence itself changes:

     · bs-skin-armata — THE GHOST ARMADA (gharraq.*.excl). Spectral
       cold-fire ordnance: a heavier muzzle flare on the rail, a
       blue-white tracer with a light trail, and a four-stage impact —
       flash, shockwave ring, a fire tongue standing up, smoke drifting
       off. A miss raises a tall water column that falls back with a
       double ripple and thrown droplets.
     · bs-skin-roza — THE ROSE FLOTILLA (gharraqroza.*.excl). Glam
       ordnance: a sparkle-charge on the rail, a glinting star of a
       shell with a champagne twinkle, a heart-of-pearl burst with a
       gold halo, crossed glints and a scatter of petals and glitter.
       A miss is a soft pearlescent splash with a champagne shimmer.

   THE HOOK: skinName() reads the equipped slots through KARTI_XP the
   same way the basic kit does. Any worn Roża piece wins, then any worn
   Armada piece; nothing exclusive worn = no class, no CSS — today's
   look, byte for byte.

   PER BOARD, NOT PER PHONE. The class used to ride on <body>, which
   made the skin a property of the PAGE: every sea this phone drew wore
   the local set and no other phone ever saw it. Now the game screen
   stamps each .bs-gwrap with its owner's skin (bs-skin-*) and the live
   shooter's ordnance (bs-atk-*) — see §3b in the game half above — and
   every rule below is scoped under one of those two classes, so two
   players with different sets see two different boards, each correct
   from both sides of the table. The game tells this shelf which skins
   a battle needs CSS for through KARTI_GHARRAQ.skinkit.need(); a skin
   nobody at the table wears still costs zero bytes.

   ALL COSMETIC. The engine, the volley timetable and everything on the
   wire are untouched: these rules restyle the same .bs-* elements the
   stock theatre already spawns, animate only transform and opacity,
   and stage the extras on ::before/::after pseudos stock never uses.
   The art is layered over gradients (sea), behind box-shadow rings
   (reticle) — a missing PNG degrades to the tinted look, never to a
   blank board. Reduced motion (body.reduced or the media query) stops
   every skin animation and leaves one still, readable mark. */
var SKIN_CLASSES = ['bs-skin-armata', 'bs-skin-roza'];
var SKIN_NAMES = ['armata', 'roza'];
var NEED = [];                 /* skins the current battle asked CSS for */
function skinName(XP){
  var i, S = ['sea', 'fleet', 'ring'];
  for (i = 0; i < S.length; i++)
    if (XP.equipped(S[i], 'gharraqroza')) return 'roza';
  for (i = 0; i < S.length; i++)
    if (XP.equipped(S[i], 'gharraq') === 'gharraq.' + S[i] + '.excl') return 'armata';
  return '';
}

/* ── the bridge the game half reads (its §3b) ────────────────────────
   mine() is the skin THIS player has equipped — what lockFleet() puts
   on the wire. need(list) is the game saying which skins the battle on
   screen requires CSS for (mine plus every opponent's, learned off
   their place moves); it is validated against SKIN_NAMES here, so a
   wire byte can never smuggle a selector in. */
(function(){
  var GH = window.KARTI_GHARRAQ;
  if (!GH || GH.skinkit) return;
  GH.skinkit = {
    mine: function(){
      var XP = window.KARTI_XP;
      try { return XP ? skinName(XP) : ''; } catch(e){ return ''; }
    },
    need: function(list){
      var out = [], i;
      list = Array.isArray(list) ? list : [];
      for (i = 0; i < list.length; i++)
        if (SKIN_NAMES.indexOf(list[i]) >= 0 && out.indexOf(list[i]) < 0)
          out.push(list[i]);
      NEED = out;
      apply();
    }
  };
})();

function skinCSS(skin){
  /* the SAME two-id spine the basic kit rules use (#app #scr-party
     .bs-wrap), then ONE of the two per-board classes §3b stamps on a
     .bs-gwrap (or on the mini wrap / placement dock) — the skin block
     is both later in this sheet and strictly more specific, so it
     outranks the game's own sheet and any stray basic cosmetic left
     equipped, while never leaking past the board that owns it:

       S — the board SURFACE, the owner's: sea, cells, hulls, the
           permanent scorch and splash marks, the sinking foam.
       A — the ORDNANCE, the attacker's: aim ring, muzzle flare,
           shell, burst, miss plume, the fizz on an old crater. */
  var S = '#app #scr-party .bs-wrap .bs-skin-' + skin + ' ';
  var A = '#app #scr-party .bs-wrap .bs-atk-' + skin + ' ';
  var c = '';
  if (skin === 'armata'){
    var SEA = 'url("art/cosm/gharraq-exclusive-sea.png")';
    var RING = 'url("art/cosm/gharraq-exclusive-ring.png")';
    c +=
      /* ── the board: one continuous spectral sea under glass cells ── */
      S + '.bs-grid{background:' + SEA + ' center/cover no-repeat,' +
        'linear-gradient(180deg,#0B2C3E,#061B2A);' +
        'border-color:rgba(90,190,235,.55);' +
        'box-shadow:0 8px 22px rgba(0,0,0,.55),0 0 18px rgba(79,169,232,.28)}' +
      S + '.bs-c:not(.ship):not(.hit):not(.sunk){background:rgba(4,18,28,.22);' +
        'box-shadow:inset 0 0 0 .5px rgba(140,215,255,.13);color:#8FD4F2}' +
      S + '.bs-grid.place .bs-c.ship{background:rgba(10,40,58,.55)}' +
      S + '.bs-c.miss::after{background:#CBEDFF;opacity:.75}' +
      /* a hit burns COLD on this sea — spectral scorch, ecto ember */
      S + '.bs-c.hit{background:linear-gradient(180deg,#123A54,#0A2438)}' +
      S + '.bs-c.hit::after{background:radial-gradient(circle at 35% 30%,' +
        '#F2FBFF,#6FC6FF 55%,#1E5E8C);' +
        'box-shadow:0 0 9px rgba(111,198,255,.9),0 0 18px rgba(79,169,232,.5)}' +
      S + '.bs-c.sunk{background:#0A1B28}' +
      /* ── the fleet: pale ghost hulls with an ecto glow ── */
      S + '.bs-ship:not(.drag):not(.sunk) .bs-hull{fill:#DDF2FF;fill-opacity:.92;' +
        'stroke:#0E2A3C}' +
      S + '.bs-ship:not(.drag):not(.sunk) .bs-hull .dt{fill:#3E7FA6}' +
      S + '.bs-ship:not(.drag):not(.sunk) .bs-hull .lt{fill:#9FD9F2}' +
      S + '.bs-ship:not(.drag):not(.sunk){filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.55)) ' +
        'drop-shadow(0 0 6px rgba(120,210,255,.5))}' +
      S + '.bs-chip .bs-hull{fill:#DDF2FF}' +
      S + '.bs-chip .bs-hull .dt{fill:#3E7FA6}' +
      S + '.bs-chip .bs-hull .lt{fill:#9FD9F2}' +
      /* ── the reticle: the set's ring art, slowly turning, over a
         box-shadow ring that stands alone if the PNG never lands ── */
      A + '.bs-c.aim{box-shadow:inset 0 0 0 2px rgba(127,212,255,.85),' +
        '0 0 10px rgba(127,212,255,.55)}' +
      A + '.bs-c.aim2{box-shadow:inset 0 0 0 2px rgba(127,212,255,.35)}' +
      A + '.bs-c.aim::before,' + A + '.bs-c.aim2::before{content:"";position:absolute;' +
        /* the ring art sits on a black plate — screen-blended, the plate
           vanishes and only the glowing ring lands on the water */
        'inset:-14%;background:' + RING + ' center/contain no-repeat;' +
        'pointer-events:none;mix-blend-mode:screen;' +
        'animation:bsxASpin 6s linear infinite}' +
      A + '.bs-c.aim2::before{opacity:.5}' +
      '@keyframes bsxASpin{to{transform:rotate(360deg)}}' +
      /* ── FIRING, stage 1: the rail flare — taller, with a hot core ── */
      A + '.bs-muzz{background:linear-gradient(0deg,rgba(127,212,255,.6),' +
        'rgba(127,212,255,0));height:18%}' +
      A + '.bs-muzz.n{background:linear-gradient(180deg,rgba(127,212,255,.55),' +
        'rgba(127,212,255,0))}' +
      A + '.bs-muzz::after{content:"";position:absolute;left:8%;right:8%;bottom:0;' +
        'height:30%;border-radius:50% 50% 0 0/100% 100% 0 0;transform-origin:50% 100%;' +
        'background:radial-gradient(60% 100% at 50% 100%,#F2FBFF,' +
        'rgba(127,212,255,.7) 45%,rgba(127,212,255,0) 75%);' +
        'animation:bsxAMuzz .5s var(--ease) both}' +
      A + '.bs-muzz.n::after{bottom:auto;top:0;transform-origin:50% 0;' +
        'border-radius:0 0 50% 50%/0 0 100% 100%;' +
        'background:radial-gradient(60% 100% at 50% 0,#F2FBFF,' +
        'rgba(127,212,255,.7) 45%,rgba(127,212,255,0) 75%)}' +
      '@keyframes bsxAMuzz{0%{transform:scaleY(.1) scaleX(.7);opacity:0}' +
        '25%{opacity:1;transform:scaleY(1.15) scaleX(1)}60%{transform:scaleY(.8)}' +
        '100%{transform:scaleY(.3);opacity:0}}' +
      /* stage 2: the shell — cold white tracer with a light trail */
      A + '.bs-shell i::before{background:radial-gradient(circle at 35% 30%,' +
        '#FFFFFF,#9FD9F2 50%,#2E7FB4);' +
        'box-shadow:0 0 10px rgba(159,217,242,.95),0 0 24px rgba(79,169,232,.55)}' +
      A + '.bs-shell i::after{content:"";position:absolute;left:50%;top:50%;' +
        'width:12%;height:300%;margin:-150% 0 0 -6%;border-radius:50%;opacity:.8;' +
        'background:linear-gradient(180deg,rgba(159,217,242,0),' +
        'rgba(159,217,242,.55),rgba(159,217,242,0))}' +
      A + '.bs-shell u{background:rgba(2,10,18,.65)}' +
      /* stage 3, a HIT: flash → shockwave → fire tongue → smoke */
      A + '.bs-boom i{inset:-48%;background:radial-gradient(circle,#FFFFFF 0%,' +
        '#D6F2FF 22%,#5FB8F0 48%,rgba(46,127,180,0) 70%);' +
        'animation:bsxABoom .5s var(--ease) both}' +
      '@keyframes bsxABoom{0%{transform:scale(.15);opacity:0}' +
        '14%{opacity:1;transform:scale(.9)}55%{opacity:.9;transform:scale(1.1)}' +
        '100%{transform:scale(1.45);opacity:0}}' +
      A + '.bs-boom u{inset:-8%;border:2.5px solid rgba(190,235,255,.95);' +
        'box-shadow:0 0 8px rgba(127,212,255,.7),inset 0 0 6px rgba(127,212,255,.5);' +
        'animation:bsxARing .6s cubic-bezier(.2,.7,.3,1) both}' +
      '@keyframes bsxARing{0%{transform:scale(.25);opacity:1}' +
        '60%{opacity:.75}100%{transform:scale(2.9);opacity:0}}' +
      A + '.bs-boom::before{content:"";position:absolute;left:30%;right:30%;' +
        'top:-42%;bottom:40%;border-radius:48% 48% 30% 30%;transform-origin:50% 100%;' +
        'background:linear-gradient(180deg,rgba(240,251,255,.95),' +
        'rgba(127,205,255,.75) 45%,rgba(127,205,255,0));' +
        'animation:bsxAFlame .55s cubic-bezier(.2,.6,.35,1) .1s both}' +
      '@keyframes bsxAFlame{0%{transform:scaleY(0) scaleX(.6);opacity:0}' +
        '35%{opacity:1;transform:scaleY(1.1) scaleX(.9)}' +
        '70%{transform:scaleY(.9) scaleX(1.05)}' +
        '100%{transform:scaleY(.15) scaleX(1.2);opacity:0}}' +
      A + '.bs-boom::after{content:"";position:absolute;inset:-20%;border-radius:50%;' +
        'background:radial-gradient(circle at 50% 60%,rgba(30,60,84,.55),' +
        'rgba(30,60,84,0) 70%);animation:bsxASmoke .75s ease-out .28s both}' +
      '@keyframes bsxASmoke{0%{transform:translateY(8%) scale(.5);opacity:0}' +
        '35%{opacity:.55}100%{transform:translateY(-34%) scale(1.7);opacity:0}}' +
      A + '.bs-boom.big i{inset:-85%;animation-duration:.6s}' +
      A + '.bs-boom.big u{animation-duration:.8s;animation-name:bsxARingBig}' +
      '@keyframes bsxARingBig{0%{transform:scale(.25);opacity:1}' +
        '100%{transform:scale(3.8);opacity:0}}' +
      A + '.bs-boom.big::before{top:-70%;left:24%;right:24%}' +
      /* stage 3, a MISS: the column stands, hangs, falls back */
      A + '.bs-plume i{left:34%;right:34%;top:-88%;bottom:42%;' +
        'border-radius:44% 44% 26% 26%;transform-origin:50% 100%;' +
        'background:linear-gradient(180deg,rgba(244,252,255,.95),' +
        'rgba(150,214,248,.85) 50%,rgba(150,214,248,0));' +
        'animation:bsxAColumn .8s cubic-bezier(.2,.6,.35,1) both}' +
      '@keyframes bsxAColumn{0%{transform:scaleY(0) scaleX(.5);opacity:0}' +
        '30%{opacity:1;transform:scaleY(1.12) scaleX(.85)}' +
        '55%{transform:scaleY(1) scaleX(.95)}' +
        '100%{transform:scaleY(.04) scaleX(1.5);opacity:0}}' +
      A + '.bs-plume::before{content:"";position:absolute;left:50%;top:4%;' +
        'width:8%;height:8%;margin-left:-4%;border-radius:50%;background:#E8F7FF;' +
        'box-shadow:-8px -6px 0 rgba(232,247,255,.9),9px -4px 0 rgba(232,247,255,.85),' +
        '-14px 2px 0 rgba(180,228,255,.7),13px 6px 0 rgba(180,228,255,.75),' +
        '0 -12px 0 rgba(232,247,255,.8);animation:bsxADrops .7s ease-in .18s both}' +
      '@keyframes bsxADrops{0%{transform:translateY(0) scale(.4);opacity:0}' +
        '25%{opacity:1}100%{transform:translateY(90%) scale(1.15);opacity:0}}' +
      A + '.bs-plume u{border-color:rgba(190,235,255,.85);' +
        'animation:bsxARipple .8s cubic-bezier(.2,.7,.3,1) both}' +
      A + '.bs-plume::after{content:"";position:absolute;inset:6%;border-radius:50%;' +
        'border:1.5px solid rgba(150,214,248,.6);' +
        'animation:bsxARipple .7s cubic-bezier(.2,.7,.3,1) .22s both}' +
      '@keyframes bsxARipple{0%{transform:scale(.3);opacity:.9}' +
        '100%{transform:scale(2.1);opacity:0}}' +
      A + '.bs-fizz u{border-color:rgba(140,190,220,.5)}' +
      S + '.bs-foam u{border-color:rgba(214,240,255,.85)}';
  } else if (skin === 'roza'){
    var SEA2 = 'url("art/cosm/gharraqroza-exclusive-sea.png")';
    var RING2 = 'url("art/cosm/gharraqroza-exclusive-ring.png")';
    c +=
      /* ── the board: rosewater, pearl light, champagne frame ── */
      S + '.bs-grid{background:' + SEA2 + ' center/cover no-repeat,' +
        'linear-gradient(180deg,#F3CFDD,#E2A9C2);' +
        'border-color:rgba(233,201,143,.8);' +
        'box-shadow:0 8px 22px rgba(122,33,72,.35),0 0 16px rgba(255,159,190,.35)}' +
      S + '.bs-c:not(.ship):not(.hit):not(.sunk){background:rgba(255,240,247,.10);' +
        'box-shadow:inset 0 0 0 .5px rgba(122,33,72,.16);color:#8C2F55}' +
      S + '.bs-grid.place .bs-c.ship{background:rgba(255,214,232,.45)}' +
      S + '.bs-c.miss::after{background:#FFFFFF;opacity:.95;' +
        'box-shadow:0 0 0 1.5px rgba(176,27,94,.5),0 0 6px rgba(255,255,255,.9)}' +
      S + '.bs-c.hit{background:linear-gradient(180deg,#8C2450,#5C1233)}' +
      S + '.bs-c.hit::after{background:radial-gradient(circle at 35% 30%,' +
        '#FFF6FA,#FF6FA5 55%,#B01B5E);' +
        'box-shadow:0 0 8px rgba(255,111,165,.9),0 0 16px rgba(233,201,143,.5)}' +
      S + '.bs-c.sunk{background:#3E0C24}' +
      /* ── the fleet: pearl-rose hulls, champagne-lit ── */
      S + '.bs-ship:not(.drag):not(.sunk) .bs-hull{fill:#FBEAF1;stroke:#4A1030}' +
      S + '.bs-ship:not(.drag):not(.sunk) .bs-hull .dt{fill:#C25E8C}' +
      S + '.bs-ship:not(.drag):not(.sunk) .bs-hull .lt{fill:#F2C3D8}' +
      S + '.bs-ship:not(.drag):not(.sunk){filter:drop-shadow(0 1px 1.5px rgba(74,16,48,.5)) ' +
        'drop-shadow(0 0 5px rgba(255,175,205,.55))}' +
      S + '.bs-chip .bs-hull{fill:#FBEAF1}' +
      S + '.bs-chip .bs-hull .dt{fill:#C25E8C}' +
      S + '.bs-chip .bs-hull .lt{fill:#F2C3D8}' +
      /* ── the reticle: the glam ring art turning over champagne ── */
      A + '.bs-c.aim{box-shadow:inset 0 0 0 2px rgba(176,27,94,.75),' +
        '0 0 10px rgba(233,201,143,.7)}' +
      A + '.bs-c.aim2{box-shadow:inset 0 0 0 2px rgba(176,27,94,.35)}' +
      A + '.bs-c.aim::before,' + A + '.bs-c.aim2::before{content:"";position:absolute;' +
        'inset:-14%;background:' + RING2 + ' center/contain no-repeat;' +
        'pointer-events:none;filter:drop-shadow(0 0 4px rgba(176,27,94,.6));' +
        'animation:bsxRSpin 5s linear infinite}' +
      A + '.bs-c.aim2::before{opacity:.5}' +
      '@keyframes bsxRSpin{to{transform:rotate(-360deg)}}' +
      /* ── FIRING, stage 1: the sparkle-charge on the rail ── */
      A + '.bs-muzz{background:linear-gradient(0deg,rgba(255,159,190,.5),' +
        'rgba(255,159,190,0))}' +
      A + '.bs-muzz.n{background:linear-gradient(180deg,rgba(255,159,190,.45),' +
        'rgba(255,159,190,0))}' +
      A + '.bs-muzz::after{content:"";position:absolute;left:50%;bottom:14%;' +
        'width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:#FFF6FA;' +
        'box-shadow:-34px 4px 0 -1px #F3E2C2,28px -2px 0 -1px #FFD9E8,' +
        '-14px -6px 0 0 #FFFFFF,44px 6px 0 -2px #E9C98F,12px 2px 0 -1px #FF9FBE,' +
        '-46px -2px 0 -2px #FFD9E8;animation:bsxRCharge .55s ease-out both}' +
      '@keyframes bsxRCharge{0%{transform:translateY(10px) scale(.4);opacity:0}' +
        '35%{opacity:1}100%{transform:translateY(-14px) scale(1.1);opacity:0}}' +
      A + '.bs-muzz.n::after{bottom:auto;top:14%;animation-name:bsxRChargeN}' +
      '@keyframes bsxRChargeN{0%{transform:translateY(-10px) scale(.4);opacity:0}' +
        '35%{opacity:1}100%{transform:translateY(14px) scale(1.1);opacity:0}}' +
      /* stage 2: the shell — a glinting star with a champagne twinkle */
      A + '.bs-shell i::before{background:radial-gradient(circle at 40% 35%,' +
        '#FFFFFF,#FFD9E8 45%,#E9A0BE);' +
        'box-shadow:0 0 10px rgba(255,217,232,.95),0 0 22px rgba(233,201,143,.6)}' +
      A + '.bs-shell i::after{content:"";position:absolute;left:50%;top:50%;' +
        'width:120%;height:120%;' +
        'background:linear-gradient(0deg,transparent 46%,rgba(255,255,255,.9) 49%,' +
        'rgba(255,255,255,.9) 51%,transparent 54%),' +
        'linear-gradient(90deg,transparent 46%,rgba(255,255,255,.85) 49%,' +
        'rgba(255,255,255,.85) 51%,transparent 54%);' +
        'animation:bsxRTwinkle .4s linear infinite}' +
      '@keyframes bsxRTwinkle{0%,100%{transform:translate(-50%,-50%) rotate(0deg) scale(1)}' +
        '50%{transform:translate(-50%,-50%) rotate(45deg) scale(.7)}}' +
      A + '.bs-shell u{background:rgba(90,20,50,.4)}' +
      /* stage 3, a HIT: pearl burst → gold halo → crossed glints →
         petals and glitter thrown outward */
      A + '.bs-boom i{inset:-40%;background:radial-gradient(circle,#FFFFFF 0%,' +
        '#FFE9F2 25%,#FF6FA5 55%,rgba(255,111,165,0) 72%);' +
        'animation:bsxRBurst .45s var(--ease) both}' +
      '@keyframes bsxRBurst{0%{transform:scale(.2);opacity:0}' +
        '18%{opacity:1;transform:scale(1)}100%{transform:scale(1.35);opacity:0}}' +
      A + '.bs-boom u{inset:-6%;border:2px solid rgba(243,226,194,.95);' +
        'border-radius:38%;box-shadow:0 0 8px rgba(233,201,143,.75);' +
        'animation:bsxRHalo .6s cubic-bezier(.2,.7,.3,1) both}' +
      '@keyframes bsxRHalo{0%{transform:scale(.3) rotate(0deg);opacity:1}' +
        '100%{transform:scale(2.4) rotate(90deg);opacity:0}}' +
      A + '.bs-boom::before{content:"";position:absolute;inset:-30%;' +
        'background:linear-gradient(0deg,transparent 47%,rgba(255,255,255,.95) 49.5%,' +
        'rgba(255,255,255,.95) 50.5%,transparent 53%),' +
        'linear-gradient(90deg,transparent 47%,rgba(255,255,255,.95) 49.5%,' +
        'rgba(255,255,255,.95) 50.5%,transparent 53%);' +
        'animation:bsxRGlint .5s var(--ease) .05s both}' +
      '@keyframes bsxRGlint{0%{transform:scale(.2) rotate(-20deg);opacity:0}' +
        '30%{opacity:1}100%{transform:scale(1.5) rotate(25deg);opacity:0}}' +
      A + '.bs-boom::after{content:"";position:absolute;left:50%;top:50%;' +
        'width:9%;height:9%;margin:-4.5% 0 0 -4.5%;' +
        'border-radius:50% 0 50% 50%;background:#FFD9E8;' +
        'box-shadow:-11px -9px 0 0 #F3E2C2,12px -7px 0 -1px #FFFFFF,' +
        '-14px 6px 0 -1px #FF9FBE,13px 10px 0 0 #FFD9E8,2px -14px 0 -1px #E9C98F,' +
        '-4px 13px 0 0 #FFF0F6,8px 3px 0 -2px #FFFFFF,-8px -2px 0 -2px #F3E2C2;' +
        'animation:bsxRScatter .8s cubic-bezier(.15,.6,.3,1) .12s both}' +
      '@keyframes bsxRScatter{0%{transform:scale(.25) rotate(0deg);opacity:0}' +
        '20%{opacity:1}100%{transform:scale(2.6) rotate(60deg);opacity:0}}' +
      A + '.bs-boom.big i{inset:-80%;animation-duration:.55s}' +
      A + '.bs-boom.big u{animation-name:bsxRHaloBig;animation-duration:.8s}' +
      '@keyframes bsxRHaloBig{0%{transform:scale(.3) rotate(0deg);opacity:1}' +
        '100%{transform:scale(3.4) rotate(90deg);opacity:0}}' +
      /* stage 3, a MISS: a soft pearlescent splash, pearls popping.
         ROSE-EDGED on purpose — pure white vanishes on this pale water */
      A + '.bs-plume i{left:30%;right:30%;top:-46%;bottom:44%;' +
        'border-radius:50% 50% 34% 34%;transform-origin:50% 100%;' +
        'background:linear-gradient(180deg,#FFFFFF,#FFA9C9 55%,rgba(255,133,175,0));' +
        'box-shadow:0 0 10px rgba(233,71,142,.45);' +
        'animation:bsxRSplash .6s cubic-bezier(.2,.6,.35,1) both}' +
      '@keyframes bsxRSplash{0%{transform:scaleY(0) scaleX(.6);opacity:0}' +
        '35%{opacity:1;transform:scaleY(1.05) scaleX(.9)}' +
        '70%{opacity:.9}100%{transform:scaleY(.08) scaleX(1.25);opacity:0}}' +
      A + '.bs-plume u{border-color:rgba(233,71,142,.85);' +
        'box-shadow:0 0 8px rgba(233,71,142,.5);' +
        'animation:bsxRPearl .75s cubic-bezier(.2,.7,.3,1) both}' +
      A + '.bs-plume::after{content:"";position:absolute;inset:10%;border-radius:50%;' +
        'border:1.5px solid rgba(201,152,74,.9);' +
        'animation:bsxRPearl .65s cubic-bezier(.2,.7,.3,1) .18s both}' +
      '@keyframes bsxRPearl{0%{transform:scale(.3);opacity:.95}' +
        '60%{opacity:.7}100%{transform:scale(1.9);opacity:0}}' +
      A + '.bs-plume::before{content:"";position:absolute;left:50%;top:0;' +
        'width:6%;height:6%;margin-left:-3%;border-radius:50%;background:#FFFFFF;' +
        'box-shadow:0 0 4px rgba(233,71,142,.8),-10px 2px 0 -1px #FF9FBE,' +
        '9px -3px 0 -1px #E9C98F,-4px -8px 0 0 #FFFFFF;' +
        'animation:bsxRPop .6s ease-out .1s both}' +
      '@keyframes bsxRPop{0%{transform:translateY(6px) scale(.3);opacity:0}' +
        '30%{opacity:1}100%{transform:translateY(-10px) scale(1);opacity:0}}' +
      A + '.bs-fizz u{border-color:rgba(233,201,143,.5)}' +
      S + '.bs-foam u{border-color:rgba(255,240,247,.9)}';
  }
  if (!c) return '';
  /* REDUCED MOTION — both doors the game itself honours. The staged
     extras (pseudos) vanish, the core burst/splash freezes as one
     still, readable mark; the permanent cell paint tells the story. */
  var still =
    A + '.bs-boom i,' + A + '.bs-plume i{animation:none;opacity:.85;transform:none}' +
    A + '.bs-boom u,' + A + '.bs-plume u{animation:none;opacity:0}' +
    A + '.bs-boom::before,' + A + '.bs-boom::after,' +
    A + '.bs-plume::before,' + A + '.bs-plume::after,' +
    A + '.bs-shell i::after,' + A + '.bs-muzz::after{animation:none;opacity:0}' +
    A + '.bs-c.aim::before,' + A + '.bs-c.aim2::before{animation:none}';
  return c +
    '@media (prefers-reduced-motion:reduce){' + still + '}' +
    /* the second door: body.reduced in front of every A-scoped rule */
    still.split(A).join('body.reduced ' + A);
}

function sheet(){
  var st = document.getElementById('bsx-kit-css');
  if (!st){ st = document.createElement('style'); st.id = 'bsx-kit-css'; }
  /* appendChild MOVES an existing node to the end, so this sheet is
     always later than the game's own; the #app prefix out-specifies
     the game's #scr-party rules besides. */
  document.head.appendChild(st);
  return st;
}

function apply(){
  var XP = window.KARTI_XP;
  if (!XP) return;
  var P = '#app #scr-party .bs-wrap ', css = '';
  var s = SEAS[XP.equipped('sea', 'gharraq') || ''];
  if (s) css += P + '.bs-c:not(.ship):not(.hit):not(.sunk){background:linear-gradient(180deg,' +
      s.g[0] + ',' + s.g[1] + ');color:' + s.t + '}' +
    P + '.bs-c.miss::after{background:' + s.m + '}';
  var f = FLEETS[XP.equipped('fleet', 'gharraq') || ''];
  if (f) css += P + '.bs-ship:not(.drag):not(.sunk) .bs-hull{fill:' + f.h + '}' +
    P + '.bs-ship:not(.drag):not(.sunk) .bs-hull .dt{fill:' + f.dt + '}' +
    P + '.bs-ship:not(.drag):not(.sunk) .bs-hull .lt{fill:' + f.lt + '}';
  var r = RINGS[XP.equipped('ring', 'gharraq') || ''];
  if (r) css += P + '.bs-c.aim{box-shadow:inset 0 0 0 3px ' + r.a + '}' +
    P + '.bs-c.aim2{box-shadow:inset 0 0 0 3px ' + r.b + '}';
  var u = BURSTS[XP.equipped('burst', 'gharraq') || ''];
  if (u) css += P + '.bs-c.hit:not(.sunk){background:linear-gradient(180deg,' +
      u.bg[0] + ',' + u.bg[1] + ')}' +
    P + '.bs-c.hit::after{background:radial-gradient(circle at 35% 30%,' +
      u.r[0] + ',' + u.r[1] + ' 60%,' + u.r[2] + ');box-shadow:' + u.gl + '}';
  /* THE EXCLUSIVE SKINS — the per-board classes are the hook, this CSS
     the payload. One block per skin IN PLAY: mine (worn), plus every
     skin the current battle asked for through skinkit.need() — an
     opponent's set has to paint here even when I wear nothing. A skin
     nobody wears: no class on any board, no bytes in the sheet. */
  var skins = [], skin = skinName(XP), si;
  if (skin) skins.push(skin);
  for (si = 0; si < NEED.length; si++)
    if (skins.indexOf(NEED[si]) < 0) skins.push(NEED[si]);
  for (si = 0; si < skins.length; si++) css += skinCSS(skins[si]);
  /* the legacy whole-page class: nothing adds it any more; scrub it so
     a sheet swap mid-session can never leave a phone-wide skin behind */
  try {
    var body = document.body;
    if (body) for (si = 0; si < SKIN_CLASSES.length; si++)
      body.classList.remove(SKIN_CLASSES[si]);
  } catch (e){}
  sheet().textContent = css;
}

/* previews: the sea is a cell with a 2x2 grid and one splash; a fleet
   is one border-radius hull with the ink outline; a ring is the ring
   set into stock water; a burst is the exact burst on scorched red. */
function seaPv(t){
  return function(size){
    var s = size || 62, dr = Math.max(3, Math.round(s * .09)),
        el = document.createElement('span');
    el.setAttribute('style',
      'display:block;width:' + s + 'px;height:' + s + 'px;border-radius:10px;' +
      'box-sizing:border-box;border:2px solid rgba(0,0,0,.5);' +
      'background-image:' +
      'radial-gradient(circle ' + dr + 'px at 74% 26%,' + t.m + ',' + t.m + ' 70%,transparent 100%),' +
      'linear-gradient(0deg,transparent 49%,rgba(255,255,255,.14) 49%,' +
        'rgba(255,255,255,.14) 51%,transparent 51%),' +
      'linear-gradient(90deg,transparent 49%,rgba(255,255,255,.14) 49%,' +
        'rgba(255,255,255,.14) 51%,transparent 51%),' +
      'linear-gradient(180deg,' + t.g[0] + ',' + t.g[1] + ')');
    return el;
  };
}
function fleetPv(t){
  return function(size){
    var s = size || 62, el = document.createElement('span'),
        hull = document.createElement('span');
    el.setAttribute('style', 'display:flex;align-items:center;justify-content:center;' +
      'width:' + s + 'px;height:' + s + 'px');
    hull.setAttribute('style',
      'display:block;width:' + Math.round(s * .72) + 'px;height:' + Math.round(s * .32) + 'px;' +
      'border-radius:50% 50% 46% 46% / 88% 88% 46% 46%;' +
      'background:linear-gradient(180deg,' + t.lt + ' 0 26%,' + t.h + ' 26% 68%,' +
        t.dt + ' 68% 100%);' +
      'box-shadow:0 0 0 2px #150C22');
    el.appendChild(hull);
    return el;
  };
}
function ringPv(t){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style',
      'display:block;width:' + s + 'px;height:' + s + 'px;border-radius:10px;' +
      'box-sizing:border-box;background:linear-gradient(180deg,#173A63,#122E50);' +
      'box-shadow:inset 0 0 0 3px ' + t.a);
    return el;
  };
}
function burstPv(t){
  return function(size){
    var s = size || 62, el = document.createElement('span'),
        dot = document.createElement('span');
    el.setAttribute('style', 'display:flex;align-items:center;justify-content:center;' +
      'width:' + s + 'px;height:' + s + 'px;border-radius:10px;box-sizing:border-box;' +
      'background:linear-gradient(180deg,' + t.bg[0] + ',' + t.bg[1] + ')');
    dot.setAttribute('style',
      'display:block;width:' + Math.round(s * .5) + 'px;height:' + Math.round(s * .5) + 'px;' +
      'border-radius:50%;background:radial-gradient(circle at 35% 30%,' +
      t.r[0] + ',' + t.r[1] + ' 60%,' + t.r[2] + ');box-shadow:' + t.gl);
    el.appendChild(dot);
    return el;
  };
}

function boot(tries){
  var XP = window.KARTI_XP;
  if (!XP){ if (tries < 40) setTimeout(function(){ boot(tries + 1); }, 500); return; }
  var KIT = XP.forGame('gharraq');
  KIT.register([
    { slot:'sea', id:'gharraq.sea.mediterran', level:2,  name:'Baħar Mediterran',
      blurb:'The same sea, a shade prouder of itself.', preview:seaPv(SEAS['gharraq.sea.mediterran']) },
    { slot:'sea', id:'gharraq.sea.sebh',       level:10, name:'Baħar tas-Sebħ',
      blurb:'Dawn water. Perfectly calm until somebody opens fire.', preview:seaPv(SEAS['gharraq.sea.sebh']) },
    { slot:'sea', id:'gharraq.sea.maltemp',    level:21, name:'Maltemp Griż',
      blurb:'Storm slate. The forecast said stay in port. You did not.', preview:seaPv(SEAS['gharraq.sea.maltemp']) },
    { slot:'sea', id:'gharraq.sea.inbid',      level:39, name:'Baħar tal-Inbid',
      blurb:'Wine-dark, like the poet said. He also lost a fleet.', preview:seaPv(SEAS['gharraq.sea.inbid']) },
    { slot:'sea', id:'gharraq.sea.nofsinhar',  level:6,  name:'Baħar f’Nofsinhar', set:'summer',
      blurb:'Noon glare on flat water. Nobody out here is wearing enough sunscreen.', preview:seaPv(SEAS['gharraq.sea.nofsinhar']) },

    { slot:'fleet', id:'gharraq.fleet.hadid', level:13, name:'Ħadid tal-Baħar',
      blurb:'Grey iron and honest rivets. Sinks with dignity.', preview:fleetPv(FLEETS['gharraq.fleet.hadid']) },
    { slot:'fleet', id:'gharraq.fleet.luzzu', level:30, name:'Luzzu tal-Prim',
      blurb:'Cream and brass, eyes painted on. They saw you coming.', preview:fleetPv(FLEETS['gharraq.fleet.luzzu']) },

    { slot:'ring', id:'gharraq.ring.hgiega', level:5,  name:'Ħġieġa Ħadra',
      blurb:'Sea-glass sights. Gentle right up until the bang.', preview:ringPv(RINGS['gharraq.ring.hgiega']) },
    { slot:'ring', id:'gharraq.ring.warda',  level:16, name:'Warda tal-Mira',
      blurb:'A rose on the crosshair. Romantic. Still fatal.', preview:ringPv(RINGS['gharraq.ring.warda']) },
    { slot:'ring', id:'gharraq.ring.abjad',  level:34, name:'Abjad Jaħraq',
      blurb:'White-hot. The ring arrives before the shell does.', preview:ringPv(RINGS['gharraq.ring.abjad']) },

    { slot:'burst', id:'gharraq.burst.fjamma', level:8,  name:'Fjamma Ħamra',
      blurb:'Standard-issue fire. It gets the job done.', preview:burstPv(BURSTS['gharraq.burst.fjamma']) },
    { slot:'burst', id:'gharraq.burst.blu',    level:25, name:'Fjamma Blu',
      blurb:'Burns hotter and judges you quietly.', preview:burstPv(BURSTS['gharraq.burst.blu']) },
    { slot:'burst', id:'gharraq.burst.deheb',  level:50, name:'Deheb u Dawl',
      blurb:'Level fifty. The sea itself applauds, briefly.', preview:burstPv(BURSTS['gharraq.burst.deheb']) },
    { slot:'burst', id:'gharraq.burst.nar',    level:20, name:'Nar tal-Festa', set:'summer',
      blurb:'It goes up over the harbour and every dog in the village disagrees.', preview:burstPv(BURSTS['gharraq.burst.nar']) }
  ]);
  /* NOT KIT.onChange — that filter only passes 'gharraq' events, and the
     Rose Flotilla's pieces equip under their own 'gharraqroza' keys.
     Same door, wider filter. */
  XP.onEquip(function(ev){
    if (!ev || ev.game === 'gharraq' || ev.game === 'gharraqroza') apply();
  });
  apply();
}
boot(0);

})();
