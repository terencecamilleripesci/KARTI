/* ═══════════════════════════════════════════════════════════════════
   KARTI — party.js
   PARTY GAMES — the second drawer of the box.

   One button on Home opens a shelf of board games that have nothing to
   do with the card duel: two people, one phone, no deck building, no
   collection, no internet. Sit down, play, shout at each other, go home.

   WHAT THIS FILE IS
     · the hub screen (the shelf of tiles)
     · the shared plumbing every board game here borrows: the screen it
       lives on, the frame (title bar / turn strip / board / button bar),
       the square-board sizer, the setup sheet (who is playing, how hard
       is the machine), the result screen, and a tiny results ledger.

   WHAT IT IS NOT
     · it owns no rules. js/chess.js and js/dama.js hold their own
       engines and register themselves here.

   HOUSE RULES THIS FILE OBEYS
     · index.html and css/ belong to other parts of the build, so this
       file builds its own <section class="screen" id="scr-party"> at
       runtime and injects its stylesheet once, the way js/mp.js does.
     · nothing here ever puts transform / filter / backdrop-filter /
       will-change on anything that could be an ancestor of .tabbar.
       The tab bar lives inside #scr-home; we are a sibling screen, and
       we keep it that way.
     · persistence goes in its own localStorage key (karti_party_v1).
       The card game's save is not ours to touch.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
if (!K) return;

const esc = K.esc;
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');

/* ── our own corner of localStorage ────────────────────────────────
   rec  : {chess:{w,l,d}, dama:{w,l,d}}   — results against the machine
   pref : {chess:{mode,level,side}, ...}  — last setup used
   Deliberately NOT inside karti_save_* : a party game is not part of
   anybody's card-game profile and must survive a profile switch. */
const STORE = 'karti_party_v1';
let ST = { rec:{}, pref:{} };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object'){
    ST.rec  = (j.rec  && typeof j.rec  === 'object') ? j.rec  : {};
    ST.pref = (j.pref && typeof j.pref === 'object') ? j.pref : {};
  }
} catch(e){}
function persist(){ try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){} }

function record(id, outcome){          /* outcome: 'w' | 'l' | 'd' */
  const r = ST.rec[id] || (ST.rec[id] = { w:0, l:0, d:0 });
  if (outcome === 'w' || outcome === 'l' || outcome === 'd') r[outcome]++;
  persist();
  return r;
}
function recOf(id){ return ST.rec[id] || { w:0, l:0, d:0 }; }
function pref(id, patch){
  const p = ST.pref[id] || (ST.pref[id] = {});
  if (patch){ Object.assign(p, patch); persist(); }
  return p;
}

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF
   Games register themselves; the hub only knows what a tile looks
   like. `status:'soon'` tiles are real entries with no open() — they
   are on the shelf so the section reads as a collection rather than
   two lonely buttons, and so the next two games have a home to move
   into when their (original, un-trademarked) names are settled.
   ═══════════════════════════════════════════════════════════════════ */
const GAMES = [];
function register(def){
  const at = GAMES.findIndex(g => g.id === def.id);
  if (at >= 0) GAMES[at] = def; else GAMES.push(def);
  GAMES.sort((a, b) => (a.order || 99) - (b.order || 99));
}

/* ── two shelves, not one ──────────────────────────────────────────
   A flat grid of four or five tiles is a list you have to read. Two
   labelled sections are a thing you can scan: BOARD GAMES (a board
   and pieces) and CARD GAMES (a deck in your hand). Every game says
   which it is with `kind`; anything that forgets is a board game,
   because that is what was here first. */
const SHELVES = [
  { kind:'board', title:'Board games', note:'A board, pieces, and nowhere to hide.' },
  { kind:'card',  title:'Card games',  note:'A deck, a hand, and a straight face.' }
];

/* the two that are coming, under names nobody's lawyer owns. They are
   registered here so the shelf reads as a collection rather than two lonely
   buttons; each one turns real the moment its own file registers over the
   top of this entry with an open(). */
register({
  id:'skarta', order:30, kind:'card', name:'SKARTA', icon:'discard', status:'soon',
  tag:'Get rid of your hand before the rest of the table gets rid of theirs. ' +
      'Matching colours, matching numbers, and one card that ruins somebody\'s evening.'
});
register({
  id:'klabb', order:35, kind:'card', name:'PLAYING CARDS', icon:'cards', status:'soon',
  tag:'The ordinary pack, and the games everybody already knows how to play with it.'
});
register({
  id:'kiri', order:40, kind:'board', name:'IL-KIRI', icon:'coin', status:'soon',
  tag:'Buy half of Malta, charge your friends rent for landing on it, and watch a ' +
      'friendship end over a garage in Marsa.'
});

/* ── the emblem on a tile ──────────────────────────────────────────
   art/ui/logo-<id>.png when it exists. It does not exist yet — the
   prompts are written and the art is coming — so the tile is built
   to look FINISHED without it: the piece sprite or the icon sits in
   the same frame, and the <img> is only swapped in once the browser
   has actually decoded one. A broken-image glyph never appears,
   because the <img> is never in the document until it has loaded.
   Names are always CSS text beside the emblem, never inside it. */
const LOGO_DIR = 'art/ui/';
/* ONE sentinel decides for the whole shelf, exactly the way detectArt() in
   js/game.js probes art/petard.jpg to decide whether there is an art pack at
   all. Five tiles asking five separate questions would be five 404s in the
   console every time the hub opens; this is one, once, and none at all once
   the files land. `null` means we have not looked yet. */
let logoPack = null, logoProbing = false;
function logoProbe(){
  if (logoProbing || logoPack !== null) return;
  /* not while the art pack itself is missing: on a build with no art/ there is
     nothing to find and no reason to ask */
  if (!(K.ART && K.ART.base)) { logoPack = false; return; }
  logoProbing = true;
  const img = new Image();
  img.onload  = () => { logoPack = true;  logoProbing = false; if (live) hub(); };
  img.onerror = () => { logoPack = false; logoProbing = false; };
  img.src = LOGO_DIR + 'logo-chess.png';
}
function logoInto(host, g){
  if (!host) return;
  if (logoPack !== true){ logoProbe(); return; }
  const img = new Image();
  img.onload = () => {
    if (!host.isConnected) return;
    host.innerHTML = '';
    img.className = 'pt-logo';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    host.appendChild(img);
  };
  img.onerror = () => {};              /* that one game has no emblem yet */
  img.src = LOGO_DIR + 'logo-' + g.id + '.png';
}

/* ═══════════════════════════════════════════════════════════════════
   THE SCREEN
   go() in js/game.js only knows the screens listed in its SCREENS
   array, and that array is not ours to edit — so we do our own
   showing and hiding. The MutationObserver is the safety net: if
   anything at all navigates the app while we are up (a restored
   session, a back gesture, another module calling go()), we notice
   another screen switching itself on and step aside instead of
   floating over it.
   ═══════════════════════════════════════════════════════════════════ */
let scr = null, live = false, watching = false;

function screenEl(){
  if (scr && scr.isConnected) return scr;
  scr = document.getElementById('scr-party');
  if (!scr){
    scr = document.createElement('section');
    scr.className = 'screen';
    scr.id = 'scr-party';
    (document.getElementById('app') || document.body).appendChild(scr);
  }
  return scr;
}

function watch(){
  if (watching || typeof MutationObserver !== 'function') return;
  const app = document.getElementById('app');
  if (!app) return;
  watching = true;
  /* subtree:true is REQUIRED — the class we care about changes on the
     screens INSIDE #app, and an observer without it only ever hears
     about #app's own attributes. It was silently doing nothing.
     The records are filtered back down to direct children of #app so
     the callback stays cheap even while our own board is repainting
     sixty-four squares. */
  new MutationObserver(recs => {
    if (!live) return;
    for (const r of recs){
      const t = r.target;
      if (t === scr || !t.parentNode || t.parentNode !== app) continue;
      if (t.classList && t.classList.contains('screen') &&
          t.classList.contains('on')){ standDown(); return; }
    }
  }).observe(app, { attributes:true, attributeFilter:['class'], subtree:true });
}

function show(){
  injectCSS();
  const el = screenEl();
  const app = document.getElementById('app');
  if (app) for (const s of app.children){
    if (s !== el && s.classList && s.classList.contains('screen')) s.classList.remove('on');
  }
  el.classList.add('on');
  live = true;
  watch();
}

/* another screen took over: let go of ours quietly, and stop any
   thinking the game on it was doing. */
function standDown(){
  live = false;
  if (scr) scr.classList.remove('on');
  if (currentGame && currentGame.leave) { try { currentGame.leave(); } catch(e){} }
  currentGame = null;
}

function close(){
  standDown();
  if (K.go) K.go('home');
}

/* ═══════════════════════════════════════════════════════════════════
   THE HUB
   ═══════════════════════════════════════════════════════════════════ */
let currentGame = null;      /* {leave()} of whatever is on screen */

function open(){
  show();
  hub();
}

function hub(){
  if (currentGame && currentGame.leave){ try { currentGame.leave(); } catch(e){} }
  currentGame = null;
  const el = screenEl();
  el.innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="pt-home" aria-label="Back to home">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Party Games</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<p class="blurb">Put the cards down. These are the games your nannu plays on the ' +
      'kazin table — <b>each of you on your own phone</b>, wherever you are. Against the ' +
      'machine when nobody is about, and across one screen when there is no signal.</p>' +
      SHELVES.map(s =>
        '<div class="pt-shelf" id="pt-shelf-' + s.kind + '">' +
          '<div class="pt-head"><h3>' + esc(s.title) + '</h3>' +
            '<span class="pt-rule"></span></div>' +
          '<p class="pt-subn">' + esc(s.note) + '</p>' +
          '<div class="pt-grid" id="pt-grid-' + s.kind + '"></div>' +
        '</div>').join('') +
      '<p class="pt-foot">More on the way, under names of our own. Nobody here has ' +
      'ever finished a game of IL-KIRI either, but that is rather the point of it.</p>' +
    '</div>';

  /* live games first inside each shelf, then the ones still being built */
  const sorted = GAMES.slice().sort((a, b) =>
    ((a.status === 'soon') - (b.status === 'soon')) || ((a.order || 99) - (b.order || 99)));
  SHELVES.forEach(s => {
    const grid = el.querySelector('#pt-grid-' + s.kind);
    let n = 0;
    sorted.forEach(g => {
      if ((g.kind || 'board') !== s.kind) return;
      n++;
      const soon = g.status === 'soon';
      const r = recOf(g.id);
      const played = r.w + r.l + r.d;
      const b = document.createElement(soon ? 'div' : 'button');
      b.className = 'pt-tile' + (soon ? ' soon' : '');
      if (!soon) b.type = 'button';
      b.innerHTML =
        '<span class="pt-tio" data-logo="' + esc(g.id) + '">' +
          (g.sprite ? pieceSVG(g.sprite) : ico(g.icon || 'deck')) + '</span>' +
        '<span class="pt-tin">' + esc(g.name) + '</span>' +
        (g.mt ? '<span class="pt-timt">' + esc(g.mt) + '</span>' : '') +
        '<span class="pt-tit">' + esc(g.tag || '') + '</span>' +
        '<span class="pt-tib">' +
          (soon ? '<span class="pt-pill soon">' + ico('lock') + ' Coming soon</span>'
                : '<span class="pt-pill live">' + ico('check') + ' Playable</span>' +
                  (played ? '<span class="pt-rec">' + r.w + 'W ' + r.l + 'L ' + r.d + 'D</span>' : '')) +
        '</span>';
      if (soon) b.setAttribute('aria-disabled', 'true');
      else b.onclick = () => { if (g.open) g.open(); };
      grid.appendChild(b);
      logoInto(b.querySelector('[data-logo]'), g);
    });
    /* an empty shelf is not a shelf */
    el.querySelector('#pt-shelf-' + s.kind).hidden = !n;
  });

  el.querySelector('#pt-home').onclick = close;
}

/* ═══════════════════════════════════════════════════════════════════
   SHARED PLUMBING FOR A BOARD GAME
   ═══════════════════════════════════════════════════════════════════ */

/* ── the setup sheet: who is playing, and how hard ─────────────────
   Identical questions for chess and for dama, so it is asked once,
   here, and each game just says what to do with the answers. */
function setup(cfg){
  /* cfg: {id, title, sub, levels:[{k,name,note,icon}], sides:[{k,name},{k,name}],
           blurb, onStart(opts), onBack, onOnline} */
  if (currentGame && currentGame.leave){ try { currentGame.leave(); } catch(e){} }
  currentGame = null;
  const el = screenEl();
  const p = pref(cfg.id);

  /* ── which opponent is the HEADLINE ──────────────────────────────
     Online first: the point of the thing is two people playing each
     other, not one phone being handed across a table. Pass-the-phone
     still works and is still here — it is simply last.

     "First" is not the same as "assumed": the owner's own devices
     cannot reach the relay at all while Tailscale is on, so if the
     last presence poll failed we say so in plain words and start the
     sheet on the phone instead of dead-ending somebody on a door that
     does not open. */
  const canOnline = typeof cfg.onOnline === 'function';
  const M = window.KARTI_MP;
  const relayDown = !!(canOnline && M && M.PR && M.PR.tried && M.PR.err);
  let mode = (p.mode === 'pnp' || p.mode === 'ai' || p.mode === 'online')
               ? p.mode : (canOnline ? 'online' : 'ai');
  if (mode === 'online' && (!canOnline || relayDown)) mode = 'ai';
  /* dataset values are ALWAYS strings and the level keys are numbers —
     compare as strings both ways or nothing ever looks selected, which
     is exactly how the first build shipped a difficulty picker with no
     difficulty picked. */
  let level = cfg.levels.some(l => String(l.k) === String(p.level))
                ? String(p.level) : String(cfg.levels[1].k);
  let side  = cfg.sides.some(s => s.k === p.side) ? p.side : cfg.sides[0].k;
  const r = recOf(cfg.id);

  el.innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="pt-back" aria-label="Back to party games">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + esc(cfg.title) + '</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<p class="blurb">' + cfg.blurb + '</p>' +
      '<div class="tiny pt-lbl">Who is playing</div>' +
      '<div class="pt-opts" id="pt-mode">' +
        /* Online is a DOOR, not a mode: tapping Start on it hands you to the
           room list with this game already picked. */
        (canOnline
          ? '<button class="pt-opt" data-v="online">' + ico('users') +
            '<b>Somebody online</b><i>Open a room, or take one that is waiting.</i></button>'
          : '') +
        '<button class="pt-opt" data-v="ai">' + ico('coach') +
          '<b>You vs the phone</b><i>It does not get tired.</i></button>' +
        '<button class="pt-opt sub" data-v="pnp">' + ico('users') +
          '<b>Pass the phone</b><i>Two of you, one screen, no internet.</i></button>' +
      '</div>' +
      (relayDown
        ? '<p class="pt-warn">The KARTI server cannot be reached from this phone right ' +
          'now, so an online game would not get past the room list. <b>If Tailscale is ' +
          'on, turn it off.</b> The phone and pass-the-phone both work with no internet ' +
          'at all.</p>'
        : '') +
      '<div id="pt-aibits">' +
        '<div class="tiny pt-lbl">How hard</div>' +
        '<div class="pt-opts" id="pt-lvl">' +
          cfg.levels.map(l => '<button class="pt-opt" data-v="' + esc(l.k) + '">' +
            ico(l.icon || 'diff-2') + '<b>' + esc(l.name) + '</b><i>' + esc(l.note) + '</i></button>').join('') +
        '</div>' +
        '<div class="tiny pt-lbl">You play</div>' +
        '<div class="pt-opts two" id="pt-side">' +
          cfg.sides.map(s => '<button class="pt-opt" data-v="' + esc(s.k) + '">' +
            '<span class="pt-swatch ' + esc(s.cls || '') + '"></span><b>' + esc(s.name) + '</b>' +
            '<i>' + esc(s.note || '') + '</i></button>').join('') +
        '</div>' +
      '</div>' +
      (r.w + r.l + r.d
        ? '<p class="pt-ledger">Against the phone so far: <b>' + r.w + '</b> won, <b>' + r.l +
          '</b> lost, <b>' + r.d + '</b> drawn.</p>'
        : '') +
      '<button class="btn primary" id="pt-start" style="margin:16px 0 24px">' +
        (window.ILB ? window.ILB('play', 'Start') : 'Start') + '</button>' +
    '</div>';

  const sync = () => {
    el.querySelectorAll('#pt-mode .pt-opt').forEach(b =>
      b.classList.toggle('on', b.dataset.v === mode));
    el.querySelectorAll('#pt-lvl .pt-opt').forEach(b =>
      b.classList.toggle('on', b.dataset.v === String(level)));
    el.querySelectorAll('#pt-side .pt-opt').forEach(b =>
      b.classList.toggle('on', b.dataset.v === side));
    el.querySelector('#pt-aibits').hidden = (mode !== 'ai');
  };
  el.querySelectorAll('#pt-mode .pt-opt').forEach(b =>
    b.onclick = () => { mode = b.dataset.v; sync(); });
  el.querySelectorAll('#pt-lvl .pt-opt').forEach(b =>
    b.onclick = () => { level = b.dataset.v; sync(); });
  el.querySelectorAll('#pt-side .pt-opt').forEach(b =>
    b.onclick = () => { side = b.dataset.v; sync(); });
  sync();

  el.querySelector('#pt-back').onclick = cfg.onBack || hub;
  el.querySelector('#pt-start').onclick = () => {
    pref(cfg.id, { mode, level, side });
    if (mode === 'online'){ cfg.onOnline(); return; }
    cfg.onStart({ mode, level, side });
  };
}

/* ── the game frame ────────────────────────────────────────────────
   Title bar, a whose-turn strip, two thin capture rails, the board,
   and a bar of buttons. Everything is flex; the board host takes the
   slack and the sizer below makes the board the biggest square that
   fits in it. Nothing scrolls. */
let lastCtx = null;
function frame(o){
  /* o: {title, onBack, leave, barCls, buttons:[{id,label,icon,cls}]} */
  const el = screenEl();
  /* the frame before this one is about to be thrown away — let go of its
     ResizeObserver rather than leaving it watching a detached node */
  if (lastCtx && lastCtx.stopFit){ try { lastCtx.stopFit(); } catch(e){} }
  /* remember how to stop whatever is being built, so that if the app
     navigates out from under us (see the MutationObserver above) the
     game's pending AI move is cancelled instead of waking up later and
     painting into a screen nobody is looking at */
  currentGame = o.leave ? { leave: o.leave } : null;
  el.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'pt-wrap';
  wrap.innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="pt-back" aria-label="Back">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + esc(o.title) + '</h2>' +
      '<span class="pt-badge" id="pt-badge"></span>' +
    '</div>' +
    /* the connection line: empty and hidden offline, and the only place an
       online game ever says anything about the network */
    '<div class="pt-net" id="pt-net" role="status" aria-live="polite" hidden></div>' +
    '<div class="pt-turn" id="pt-turn" role="status" aria-live="polite"></div>' +
    /* the capture rails sit INSIDE the host, hugging the board, so the
       three of them stay together as one object however much vertical
       slack the phone has left over */
    '<div class="pt-host" id="pt-host"><div class="pt-stack">' +
      '<div class="pt-rail" id="pt-rail-top"></div>' +
      '<div class="pt-board" id="pt-board"></div>' +
      '<div class="pt-rail" id="pt-rail-bot"></div>' +
    '</div></div>' +
    '<div class="pt-bar ' + esc(o.barCls || '') + '" id="pt-bar"></div>';
  el.appendChild(wrap);

  const ctx = {
    root: wrap,
    board: wrap.querySelector('#pt-board'),
    host:  wrap.querySelector('#pt-host'),
    turn:  wrap.querySelector('#pt-turn'),
    net:   wrap.querySelector('#pt-net'),
    badge: wrap.querySelector('#pt-badge'),
    railTop: wrap.querySelector('#pt-rail-top'),
    railBot: wrap.querySelector('#pt-rail-bot'),
    bar:   wrap.querySelector('#pt-bar')
  };
  wrap.querySelector('#pt-back').onclick = o.onBack || hub;

  (o.buttons || []).forEach(b => {
    const el2 = document.createElement('button');
    el2.className = 'btn sm ' + (b.cls || 'ghost');
    el2.id = b.id;
    el2.innerHTML = window.ILB ? window.ILB(b.icon, esc(b.label)) : esc(b.label);
    ctx.bar.appendChild(el2);
  });
  ctx.btn = id => wrap.querySelector('#' + id);

  fit(ctx);
  lastCtx = ctx;
  return ctx;
}

/* the board is always the biggest whole-pixel-per-square square that
   fits the slack. Rounded down to a multiple of 8 so squares are all
   the same width and no hairline seams appear between them. */
function fit(ctx){
  const doIt = () => {
    if (!ctx.host.isConnected) return;
    const w = ctx.host.clientWidth, h = ctx.host.clientHeight;
    if (!w || !h) return;
    /* the two rails share the host with the board, so take them off the
       height before dividing — otherwise the board pushes them off the
       bottom of a short phone */
    const rails = ctx.railTop.offsetHeight + ctx.railBot.offsetHeight;
    const s = Math.max(8 * 24, Math.floor(Math.min(w, h - rails) / 8) * 8);
    ctx.board.style.width = s + 'px';
    ctx.board.style.height = s + 'px';
    ctx.board.style.setProperty('--sq', (s / 8) + 'px');
  };
  doIt();
  requestAnimationFrame(doIt);
  if (typeof ResizeObserver === 'function'){
    const ro = new ResizeObserver(doIt);
    ro.observe(ctx.host);
    ctx.stopFit = () => ro.disconnect();
  } else {
    window.addEventListener('resize', doIt);
    ctx.stopFit = () => window.removeEventListener('resize', doIt);
  }
}

/* ── the turn strip ────────────────────────────────────────────────
   The single most important thing on the screen: whose move is it. */
function setTurn(ctx, o){
  /* o: {cls, who, note, alert} */
  ctx.turn.className = 'pt-turn' + (o.alert ? ' alert' : '');
  ctx.turn.innerHTML =
    '<span class="pt-dot ' + esc(o.cls || '') + '"></span>' +
    '<span class="pt-who">' + esc(o.who || '') + '</span>' +
    (o.note ? '<span class="pt-note">' + esc(o.note) + '</span>' : '');
}

/* ── the connection line ───────────────────────────────────────────
   Online only. js/mp.js owns the socket and knows what it is doing;
   this is the one strip of the board screen it is allowed to talk
   through, so a dropped opponent is visible without a toast that
   scrolls away or a modal over the board. */
function setNet(ctx, text, tone){
  if (!ctx || !ctx.net) return;
  if (!text){ ctx.net.hidden = true; ctx.net.textContent = ''; return; }
  ctx.net.className = 'pt-net' + (tone ? ' ' + tone : '');
  ctx.net.hidden = false;
  ctx.net.textContent = text;
}

/* ═══════════════════════════════════════════════════════════════════
   TAKEBACK — "undo", but online, where it has to be ASKED FOR
   ───────────────────────────────────────────────────────────────────
   Offline, undo is a button: your board, your business. Online it is
   a REQUEST, and it only happens when EVERY other player in the game
   has said yes. One decline ends it, quietly — nobody gets a banner
   announcing that they were refused.

   This factory is deliberately game-agnostic so chess, dama, SKARTA
   and IL-KIRI can all use the same one rather than each inventing a
   half-version of it. A game hands it four things and forgets about
   the protocol:

     cfg.peers      how many OTHER players must agree (1 for chess)
     cfg.send(k,o)  put a message on the wire: k is 'ask' | 'yes' |
                    'no', o is {n, id, ck}
     cfg.rollback(n)  take n plies off THIS client's own history
     cfg.mark(n)      the fingerprint of the position n plies back, or
                      null if this client cannot go back that far
     cfg.note(text, tone)   one line of feedback for the player
     cfg.ask(o, yes, no)    put the question on screen

   THE ONE RULE THAT MATTERS: nothing is rolled back anywhere until
   every answer is in, and a client whose board would not land on the
   SAME position declines instead. The ask carries the fingerprint of
   the position it wants to get back to; a client that cannot match it
   says no. Two boards never diverge — in the worst case the takeback
   simply does not happen.
   ═══════════════════════════════════════════════════════════════════ */
const TAKE_TTL  = 30000;    /* an unanswered request dies after this */
const TAKE_COOL = 15000;    /* and you may not ask again inside this */

function takeback(cfg){
  let mine = null;       /* my outstanding request  */
  let theirs = null;     /* a request I must answer */
  let lastAsk = 0;
  let mineTimer = null, theirsTimer = null;
  const peers = Math.max(1, cfg.peers || 1);

  function clearMine(){ clearTimeout(mineTimer); mineTimer = null; mine = null; }
  function clearTheirs(){ clearTimeout(theirsTimer); theirsTimer = null; theirs = null; }

  function request(n){
    if (mine) return { ok:false, why:'You have already asked. Give them a moment.' };
    if (theirs) return { ok:false, why:'Answer their request first.' };
    const wait = TAKE_COOL - (Date.now() - lastAsk);
    if (lastAsk && wait > 0)
      return { ok:false, why:'Not so fast — you can ask again in ' +
                             Math.ceil(wait / 1000) + 's.' };
    const ck = cfg.mark(n);
    if (!ck) return { ok:false, why:'There is nothing to take back.' };
    lastAsk = Date.now();
    mine = { id: (Date.now() ^ Math.floor(Math.random() * 0xFFFFFF)) >>> 0,
             n: n, yes: 0, need: peers, ck: ck };
    cfg.send('ask', { n: n, id: mine.id, ck: ck });
    say();
    mineTimer = setTimeout(() => {
      if (!mine) return;
      clearMine();
      cfg.note('Nobody answered the takeback. Carry on.', 'warn');
      if (cfg.after) cfg.after();
    }, TAKE_TTL);
    return { ok:true };
  }

  function say(){
    if (!mine) return;
    cfg.note('Takeback asked — waiting for ' + (mine.need - mine.yes) + ' of ' +
             mine.need + '. Nothing has moved yet.', 'warn');
  }

  /* a message from another player */
  function incoming(m){
    if (!m || typeof m !== 'object') return;
    if (m.kind === 'ask'){
      if (theirs) return;                       /* one question at a time */
      const n = Math.max(1, Math.min(8, m.n | 0));
      /* WOULD OUR BOARD LAND IN THE SAME PLACE? If not, decline. A takeback
         that only half-happens is worse than no takeback at all. */
      const ck = cfg.mark(n);
      if (!ck || (m.ck && ck !== m.ck)){ cfg.send('no', { id: m.id | 0 }); return; }
      theirs = { id: m.id | 0, n: n };
      cfg.ask({ n: n },
        () => {                                  /* allow */
          const t = theirs; clearTheirs();
          if (!t) return;
          cfg.send('yes', { id: t.id });
          cfg.rollback(t.n);
          cfg.note('Takeback allowed. Back ' + t.n + (t.n === 1 ? ' move.' : ' moves.'), '');
        },
        () => {                                  /* decline, quietly */
          const t = theirs; clearTheirs();
          if (t) cfg.send('no', { id: t.id });
        });
      theirsTimer = setTimeout(() => {
        const t = theirs;
        if (!t) return;
        clearTheirs();
        cfg.send('no', { id: t.id });            /* unanswered is a no */
        if (cfg.dismiss) cfg.dismiss();
      }, TAKE_TTL);
      return;
    }
    if (!mine || (m.id | 0) !== mine.id) return;   /* an answer to nothing */
    if (m.kind === 'no'){
      clearMine();
      cfg.note('They would rather carry on. Your move.', '');
      if (cfg.after) cfg.after();
      return;
    }
    if (m.kind === 'yes'){
      mine.yes++;
      if (mine.yes < mine.need){ say(); return; }
      const t = mine; clearMine();
      cfg.rollback(t.n);
      cfg.note('Takeback allowed. Back ' + t.n + (t.n === 1 ? ' move.' : ' moves.'), '');
      if (cfg.after) cfg.after();
    }
  }

  /* the game moved on, or ended: no request survives that */
  function cancel(quiet){
    const had = !!mine || !!theirs;
    if (theirs){ cfg.send('no', { id: theirs.id }); if (cfg.dismiss) cfg.dismiss(); }
    clearMine(); clearTheirs();
    if (had && !quiet) cfg.note('', '');
  }

  return { request, incoming, cancel, busy: () => !!mine, asked: () => !!theirs };
}

/* ── the result screen ─────────────────────────────────────────────
   An honest full-stop, not a toast that scrolls away: what happened,
   why, a line of mouth, and the two things you might want next. */
function result(ctx, o){
  /* o: {tone:'win'|'lose'|'draw', head, why, quip, buttons:[{label,icon,cls,go}]} */
  const old = ctx.root.querySelector('.pt-over');
  if (old) old.remove();
  const over = document.createElement('div');
  over.className = 'pt-over ' + (o.tone || 'draw');
  over.setAttribute('role', 'dialog');
  over.setAttribute('aria-modal', 'true');
  over.setAttribute('aria-label', o.head);
  over.innerHTML =
    '<div class="pt-card">' +
      '<div class="pt-crest">' + ico(o.tone === 'win' ? 'trophy' : o.tone === 'lose' ? 'flag' : 'shield') + '</div>' +
      '<h3>' + esc(o.head) + '</h3>' +
      '<p class="pt-why">' + esc(o.why || '') + '</p>' +
      (o.quip ? '<p class="pt-quip">' + esc(o.quip) + '</p>' : '') +
      '<div class="pt-acts"></div>' +
    '</div>';
  const acts = over.querySelector('.pt-acts');
  (o.buttons || []).forEach(b => {
    const el2 = document.createElement('button');
    el2.className = 'btn ' + (b.cls || 'ghost');
    el2.innerHTML = window.ILB ? window.ILB(b.icon || 'play', esc(b.label)) : esc(b.label);
    el2.onclick = b.go;
    acts.appendChild(el2);
  });
  ctx.root.appendChild(over);
  const first = acts.querySelector('button');
  if (first) first.focus();
}

/* a small yes/no over the board — used by Resign, which is the one
   button in here you do not want to hit by accident. */
function confirm(ctx, o){
  const old = ctx.root.querySelector('.pt-ask');
  if (old) old.remove();
  const ask = document.createElement('div');
  ask.className = 'pt-over pt-ask';
  ask.innerHTML =
    '<div class="pt-card">' +
      '<h3>' + esc(o.head) + '</h3>' +
      '<p class="pt-why">' + esc(o.why || '') + '</p>' +
      '<div class="pt-acts">' +
        '<button class="btn hot" id="pt-yes">' + esc(o.yes || 'Yes') + '</button>' +
        '<button class="btn ghost" id="pt-no">' + esc(o.no || 'No, carry on') + '</button>' +
      '</div>' +
    '</div>';
  ctx.root.appendChild(ask);
  ask.querySelector('#pt-yes').onclick = () => { ask.remove(); o.go(); };
  ask.querySelector('#pt-no').onclick  = () => { ask.remove(); if (o.onNo) o.onNo(); };
  ask.querySelector('#pt-no').focus();
}

/* ═══════════════════════════════════════════════════════════════════
   THE PIECE SPRITE
   The app's own sprite lives in index.html and is not ours to add to,
   so the chess figures get a second, private sprite appended to
   <body> at runtime — same idea, same 24x24 grid, same currentColor
   rule, so a piece takes the colour of its square's text and scales
   with the board. Drawn here rather than typed as ♔♕♖: the Unicode
   chess block is rendered as EMOJI by some phone fonts, and this app
   does not do emoji in its chrome.

   The paths carry no fill/stroke of their own — the CSS below sets
   fill, stroke, stroke-width and paint-order on the <svg>, and all
   four inherit into the <use> shadow tree. That is what gives the
   white pieces a dark rim on a light square and the dark pieces a
   pale rim on a dark one.
   ═══════════════════════════════════════════════════════════════════ */
const SPRITE =
/* The king is the piece that MUST be unmistakable at 50px — an early
   draft read as a second bishop on the phone. It gets a tall cross, a
   spread crown with two horns, and the widest base on the board. */
'<symbol id="pt-p-k" viewBox="0 0 24 24">' +
  '<path d="M10.9 .8h2.2v2.1h2.1v2.2h-2.1v2.6h-2.2V5.1H8.8V2.9h2.1z"/>' +
  '<path d="M12 7.4c-3.9 0-7 2.3-7 5.1 0 1.5.9 2.8 2.4 3.7l-.6 2.9h10.4l-.6-2.9c1.5-.9 2.4-2.2 2.4-3.7 0-2.8-3.1-5.1-7-5.1zm-5 3.9l1.5 1.9 1.6-2.6 1.9 2.9 1.9-2.9 1.6 2.6L17 11.3l-.4 2.6H7.4z"/>' +
  '<path d="M4.6 19.9h14.8v3.3H4.6z"/></symbol>' +
'<symbol id="pt-p-q" viewBox="0 0 24 24">' +
  '<path d="M3.1 7.6l1.9 6.6h14l1.9-6.6-4.4 3.3-2.4-5.1L12 11 9.9 5.8 7.5 10.9z"/>' +
  '<circle cx="3.1" cy="6.3" r="1.5"/><circle cx="7.6" cy="4.7" r="1.5"/>' +
  '<circle cx="12" cy="3.9" r="1.6"/><circle cx="16.4" cy="4.7" r="1.5"/>' +
  '<circle cx="20.9" cy="6.3" r="1.5"/>' +
  '<path d="M5.2 15.2h13.6l.6 3.3H4.6z"/>' +
  '<path d="M4.3 19.4h15.4v3.1H4.3z"/></symbol>' +
'<symbol id="pt-p-r" viewBox="0 0 24 24">' +
  '<path d="M5.1 2.6h3.1v2.2h2.3V2.6h3v2.2h2.3V2.6h3.1v5.6H5.1z"/>' +
  '<path d="M6.9 8.6h10.2l.9 9.3H6z"/>' +
  '<path d="M4.4 18.7h15.2v3.8H4.4z"/></symbol>' +
'<symbol id="pt-p-b" viewBox="0 0 24 24">' +
  '<circle cx="12" cy="3.3" r="1.7"/>' +
  /* the mitre, with the traditional slit cut out of it — that notch is
     what stops a bishop reading as a fat pawn at board size */
  '<path d="M12 4.9c-2.8 2-4.6 4.4-4.6 6.6 0 1.8 1 3.2 2.5 4h4.2c1.5-.8 2.5-2.2 2.5-4 ' +
    '0-2.2-1.8-4.6-4.6-6.6zm.6 2.2l2.6 3.2-1.3 1-2.6-3.2z"/>' +
  '<path d="M8.2 15.9h7.6l.8 2.8H7.4z"/>' +
  '<path d="M5.5 19.4h13v3.1h-13z"/></symbol>' +
'<symbol id="pt-p-n" viewBox="0 0 24 24">' +
  '<path d="M9 19.2h9.4c.3-5.2-.4-8.7-2.4-11-1.1-1.3-2.4-2-3-3l1.6-2.4-2-1.3-.9 1.4-1.7-2.3-1.7 1.2.8 2.5-2.9 3.7c-.9 1.1-.8 2.4.2 3.1.9.7 2.2.4 2.9-.5l1.2-1.4c.3.9 0 1.8-.9 2.6-1.8 1.8-3.7 3.1-3.9 5.4z"/>' +
  '<path d="M5.4 19.4h13.2v3.1H5.4z"/></symbol>' +
'<symbol id="pt-p-p" viewBox="0 0 24 24">' +
  '<circle cx="12" cy="5.6" r="2.9"/>' +
  '<path d="M9.4 8.6c-1 .9-1.6 2-1.6 3.2 0 1.7 1.1 3.1 2.6 3.9l-1 4.1h5.2l-1-4.1c1.5-.8 2.6-2.2 2.6-3.9 0-1.2-.6-2.3-1.6-3.2z"/>' +
  '<path d="M6.4 19.4h11.2v3.1H6.4z"/></symbol>' +
/* the dama crown — worn by a kinged stone */
'<symbol id="pt-crown" viewBox="0 0 24 24">' +
  '<path d="M3.4 6.6l3.9 3.1L12 3.4l4.7 6.3 3.9-3.1-1.7 10.1H5.1z"/>' +
  '<path d="M5.4 18.9h13.2v2.4H5.4z"/></symbol>';

function injectSprite(){
  if (document.getElementById('pt-sprite')) return;
  const holder = document.createElement('div');
  holder.id = 'pt-sprite';
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  holder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><defs>' + SPRITE + '</defs></svg>';
  document.body.appendChild(holder);
}

/* a piece glyph: <span class="pt-pc"> holding one <use> */
function pieceSVG(sym){
  return '<svg class="pt-pcs" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
         '<use href="#' + sym + '"></use></svg>';
}

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET
   Injected once. Everything is scoped to #scr-party so it cannot
   reach a single rule in css/ or in the shell.
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS(){
  injectSprite();
  if (document.getElementById('pt-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'pt-runtime-css';
  st.textContent =
    '#scr-party{--lite:#E7D6AC;--dark:#4B3369;--edge:rgba(0,0,0,.35);' +
      '--pcw:#FFF7E6;--pcb:#241134;--rimw:#3A2210;--rimb:#FFD98A;' +
      '--sel:#3DDC84;--hint:rgba(61,220,132,.62);--last:rgba(255,197,66,.42);' +
      '--danger:#FF5468}' +

    /* ── hub ── */
    '#scr-party .pt-shelf[hidden]{display:none}' +
    '#scr-party .pt-head{display:flex;align-items:center;gap:10px;margin:18px 0 2px}' +
    '#scr-party .pt-head h3{flex:0 0 auto;font-family:var(--disp);font-weight:900;' +
      'font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold)}' +
    '#scr-party .pt-rule{flex:1;height:1px;background:linear-gradient(90deg,' +
      'rgba(255,197,66,.45),rgba(255,255,255,.05))}' +
    '#scr-party .pt-subn{font-size:11.5px;line-height:1.5;color:var(--dim2);margin:0 2px 9px;' +
      'text-transform:none;letter-spacing:0}' +
    '#scr-party .pt-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;' +
      'margin:4px 0 14px}' +
    /* the emblem, once art/ui/logo-<id>.png exists. Until then the same frame
       holds the piece sprite or the icon and nothing looks unfinished. */
    '#scr-party .pt-logo{width:34px;height:34px;object-fit:contain;display:block;' +
      'margin-top:-2px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))}' +
    '#scr-party .pt-tile.soon .pt-logo{opacity:.5;filter:grayscale(.6)}' +
    '#scr-party .pt-tile{display:flex;flex-direction:column;align-items:flex-start;gap:6px;' +
      'text-align:left;min-height:172px;padding:13px 12px 11px;border-radius:16px;color:var(--txt);' +
      'background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line2);' +
      'box-shadow:0 6px 0 -2px rgba(0,0,0,.45),0 10px 22px rgba(0,0,0,.4);' +
      'transition:background .15s var(--ease)}' +
    '#scr-party button.pt-tile:active{background:var(--panel2)}' +
    '#scr-party .pt-tile.soon{opacity:.62;box-shadow:none;border-style:dashed;' +
      'background:rgba(255,255,255,.03)}' +
    '#scr-party .pt-tio{font-size:26px;line-height:0;color:var(--gold);display:block;height:34px;' +
      'display:flex;align-items:center}' +
    '#scr-party .pt-tio .pt-pcs{width:30px;height:30px;fill:var(--gold);stroke:none}' +
    '#scr-party .pt-tile.soon .pt-tio .pt-pcs{fill:var(--dim2)}' +
    '#scr-party .pt-tile.soon .pt-tio{color:var(--dim2)}' +
    '#scr-party .pt-tin{font-family:var(--disp);font-weight:900;font-size:15px;letter-spacing:.06em;' +
      'line-height:1.1}' +
    '#scr-party .pt-timt{font-size:10px;letter-spacing:.14em;font-weight:700;color:var(--gold);' +
      'text-transform:uppercase;margin-top:-3px}' +
    '#scr-party .pt-tile.soon .pt-timt{color:var(--dim2)}' +
    '#scr-party .pt-tit{font-size:11.5px;line-height:1.5;color:var(--dim);flex:1;' +
      'text-transform:none;letter-spacing:0;font-weight:400}' +
    '#scr-party .pt-tib{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:2px}' +
    '#scr-party .pt-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;' +
      'border-radius:999px;font-size:9.5px;font-weight:900;letter-spacing:.09em;' +
      'text-transform:uppercase}' +
    '#scr-party .pt-pill.live{background:rgba(61,220,132,.16);color:var(--ok);' +
      'border:1px solid rgba(61,220,132,.38)}' +
    '#scr-party .pt-pill.soon{background:rgba(255,255,255,.05);color:var(--dim2);' +
      'border:1px solid var(--line)}' +
    '#scr-party .pt-rec{font:700 9.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
      'letter-spacing:.06em;color:var(--dim2)}' +
    '#scr-party .pt-foot{font-size:11.5px;line-height:1.6;color:var(--dim2);margin:0 2px 24px}' +

    /* ── setup ── */
    '#scr-party .pt-lbl{margin:16px 0 8px}' +
    '#scr-party .pt-opts{display:grid;gap:8px}' +
    '#scr-party .pt-opt{display:grid;grid-template-columns:24px 1fr;column-gap:11px;row-gap:2px;' +
      'align-items:center;text-align:left;width:100%;min-height:56px;padding:9px 13px;' +
      'border-radius:14px;color:var(--txt);background:rgba(255,255,255,.04);' +
      'border:1px solid var(--line);transition:background .15s,border-color .15s}' +
    '#scr-party .pt-opt>.ico,#scr-party .pt-opt>.pt-swatch{grid-row:1/3;font-size:20px;color:var(--dim)}' +
    '#scr-party .pt-opt b{font-family:var(--disp);font-size:12.5px;letter-spacing:.06em;' +
      'text-transform:uppercase}' +
    '#scr-party .pt-opt i{font-style:normal;font-size:11.5px;line-height:1.4;color:var(--dim)}' +
    '#scr-party .pt-opt.on{background:rgba(255,197,66,.13);border-color:rgba(255,197,66,.5)}' +
    '#scr-party .pt-opt.on>.ico{color:var(--gold)}' +
    '#scr-party .pt-opt:active{background:rgba(255,255,255,.09)}' +
    '#scr-party .pt-swatch{width:22px;height:22px;border-radius:50%;display:block;' +
      'border:2px solid rgba(0,0,0,.4)}' +
    '#scr-party .pt-swatch.w{background:linear-gradient(180deg,#FFF9EC,#D8C6A4)}' +
    '#scr-party .pt-swatch.b{background:linear-gradient(180deg,#4A2C63,#1B0E29);' +
      'border-color:rgba(255,217,138,.6)}' +
    '#scr-party .pt-swatch.r{background:radial-gradient(circle at 34% 28%,#FF8A6B,#D93A20 60%,#8C1E0C)}' +
    /* pass-the-phone is still here, it is simply not the headline any more */
    '#scr-party .pt-opt.sub{opacity:.78}' +
    '#scr-party .pt-opt.sub.on{opacity:1}' +
    '#scr-party .pt-warn{font-size:11.5px;line-height:1.6;margin:10px 2px 0;padding:9px 11px;' +
      'border-radius:12px;text-transform:none;letter-spacing:0;color:#FFD98A;' +
      'background:rgba(255,197,66,.10);border:1px solid rgba(255,197,66,.32)}' +
    '#scr-party .pt-ledger{font-size:12px;line-height:1.6;color:var(--dim);margin:16px 2px 0;' +
      'text-transform:none;letter-spacing:0}' +

    /* ── the game frame ── */
    '#scr-party .pt-wrap{flex:1;min-height:0;display:flex;flex-direction:column}' +
    '#scr-party .pt-badge{flex:0 0 auto;font:900 10px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--dim2);padding:6px 9px;border-radius:999px;' +
      'background:rgba(255,255,255,.05);border:1px solid var(--line)}' +
    '#scr-party .pt-turn{flex:0 0 auto;display:flex;align-items:center;gap:9px;min-height:42px;' +
      'padding:7px 12px;border-radius:13px;margin-bottom:7px;' +
      'background:rgba(255,255,255,.05);border:1px solid var(--line)}' +
    '#scr-party .pt-turn.alert{background:rgba(255,84,104,.14);border-color:rgba(255,84,104,.45)}' +
    '#scr-party .pt-dot{flex:0 0 auto;width:16px;height:16px;border-radius:50%;' +
      'border:2px solid rgba(0,0,0,.45);background:#888}' +
    '#scr-party .pt-dot.w{background:linear-gradient(180deg,#FFF9EC,#D8C6A4)}' +
    '#scr-party .pt-dot.b{background:linear-gradient(180deg,#4A2C63,#1B0E29);' +
      'border-color:rgba(255,217,138,.7)}' +
    '#scr-party .pt-dot.r{background:radial-gradient(circle at 34% 28%,#FF8A6B,#D93A20 60%,#8C1E0C)}' +
    '#scr-party .pt-who{font-family:var(--disp);font-weight:900;font-size:12px;letter-spacing:.09em;' +
      'text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .pt-note{margin-left:auto;flex:0 0 auto;font-size:10.5px;font-weight:700;' +
      'letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}' +
    '#scr-party .pt-turn.alert .pt-note{color:var(--danger)}' +
    '#scr-party .pt-rail{flex:0 0 auto;min-height:24px;width:100%;display:flex;align-items:center;' +
      'gap:2px;padding:2px 3px;overflow:hidden;color:var(--dim2)}' +
    '#scr-party .pt-rail .pt-mini{width:17px;height:17px;flex:0 0 auto;opacity:.9}' +
    '#scr-party .pt-rail .pt-edge{margin-left:6px;font:700 10px/1 ui-monospace,SFMono-Regular,' +
      'Menlo,monospace;color:var(--gold)}' +
    '#scr-party .pt-host{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;' +
      'overflow:hidden}' +
    '#scr-party .pt-stack{display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center}' +
    '#scr-party .pt-bar{flex:0 0 auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));' +
      'gap:8px;margin-top:7px}' +
    /* online has no Undo (see js/mp.js), so its bar is two across, not three */
    '#scr-party .pt-bar.two{grid-template-columns:repeat(2,minmax(0,1fr))}' +
    '#scr-party .pt-net{flex:0 0 auto;display:flex;align-items:center;gap:8px;min-height:34px;' +
      'padding:6px 11px;border-radius:11px;margin-bottom:6px;font-size:11.5px;line-height:1.4;' +
      'color:var(--dim);background:rgba(255,255,255,.05);border:1px solid var(--line)}' +
    '#scr-party .pt-net.warn{background:rgba(255,197,66,.12);border-color:rgba(255,197,66,.4);' +
      'color:#FFD98A}' +
    '#scr-party .pt-net.bad{background:rgba(255,84,104,.12);border-color:rgba(255,84,104,.42);' +
      'color:#FFB3BC}' +
    '#scr-party .pt-net[hidden]{display:none}' +
    '#scr-party .pt-bar .btn{min-height:46px;font-size:11px;letter-spacing:.06em;padding:4px 6px}' +

    /* ── the board ── */
    '#scr-party .pt-board{--sq:40px;position:relative;display:grid;' +
      'grid-template-columns:repeat(8,var(--sq));grid-template-rows:repeat(8,var(--sq));' +
      'border-radius:8px;overflow:hidden;border:2px solid rgba(0,0,0,.5);' +
      'box-shadow:0 10px 28px rgba(0,0,0,.55)}' +
    '#scr-party .pt-sq{position:relative;display:block;padding:0;border:0;width:var(--sq);' +
      'height:var(--sq);background:var(--lite);color:#3A2A14}' +
    '#scr-party .pt-sq.d{background:var(--dark);color:#E8DAFF}' +
    '#scr-party .pt-sq .pt-co{position:absolute;font:700 8px/1 ui-monospace,SFMono-Regular,' +
      'Menlo,monospace;opacity:.5;pointer-events:none}' +
    '#scr-party .pt-sq .pt-co.f{right:2px;bottom:2px}' +
    '#scr-party .pt-sq .pt-co.r{left:2px;top:2px}' +
    '#scr-party .pt-sq.last::before{content:"";position:absolute;inset:0;background:var(--last)}' +
    '#scr-party .pt-sq.sel::after{content:"";position:absolute;inset:0;' +
      'box-shadow:inset 0 0 0 3px var(--sel)}' +
    '#scr-party .pt-sq.chk::after{content:"";position:absolute;inset:0;' +
      'box-shadow:inset 0 0 0 3px var(--danger);background:rgba(255,84,104,.28)}' +
    /* legal-move marks: a dot on an empty square, a ring on a capture */
    '#scr-party .pt-mark{position:absolute;left:50%;top:50%;width:30%;height:30%;' +
      'margin:-15% 0 0 -15%;border-radius:50%;background:var(--hint);pointer-events:none;' +
      'box-shadow:0 0 0 1px rgba(0,0,0,.3)}' +
    '#scr-party .pt-mark.cap{width:88%;height:88%;margin:-44% 0 0 -44%;background:none;' +
      'box-shadow:inset 0 0 0 4px var(--hint)}' +
    '#scr-party .pt-pc{position:absolute;inset:8%;display:block;pointer-events:none;' +
      'line-height:0}' +
    '#scr-party .pt-pcs{width:100%;height:100%;display:block;' +
      'paint-order:stroke fill;stroke-width:1.1;stroke-linejoin:round}' +
    '#scr-party .pt-w .pt-pcs,#scr-party .pt-mini.pt-w{fill:var(--pcw);stroke:var(--rimw)}' +
    '#scr-party .pt-b .pt-pcs,#scr-party .pt-mini.pt-b{fill:var(--pcb);stroke:var(--rimb)}' +
    '#scr-party .pt-mini{paint-order:stroke fill;stroke-width:1.4;stroke-linejoin:round}' +
    /* dama stones */
    '#scr-party .pt-stone{position:absolute;inset:12%;border-radius:50%;pointer-events:none;' +
      'display:grid;place-items:center}' +
    '#scr-party .pt-stone.w{background:radial-gradient(circle at 34% 28%,#FFFCF2,#E4D2AC 58%,#B79E70);' +
      'box-shadow:inset 0 -3px 5px rgba(0,0,0,.28),0 2px 4px rgba(0,0,0,.45),' +
      '0 0 0 2px rgba(58,34,16,.55)}' +
    '#scr-party .pt-stone.b{background:radial-gradient(circle at 34% 28%,#FF8A6B,#D93A20 55%,#8C1E0C);' +
      'box-shadow:inset 0 -3px 5px rgba(0,0,0,.42),0 2px 4px rgba(0,0,0,.5),' +
      '0 0 0 2px rgba(42,7,0,.5)}' +
    '#scr-party .pt-stone .ico,#scr-party .pt-stone .pt-pcs{width:52%;height:52%}' +
    '#scr-party .pt-stone.w .pt-pcs{fill:#8A6200;stroke:none}' +
    '#scr-party .pt-stone.b .pt-pcs{fill:#FFE9B0;stroke:none}' +

    /* ── result / confirm overlay ──
       position:absolute inside .pt-wrap. .pt-wrap is inside #scr-party,
       which is a sibling of #scr-home — the tab bar is NOT below any of
       this, so the opacity animation here cannot reach it. No transform
       anywhere in this block, on purpose. */
    '#scr-party .pt-over{position:absolute;inset:0;z-index:20;display:flex;align-items:center;' +
      'justify-content:center;padding:20px;background:rgba(8,5,15,.86);' +
      'animation:ptFade .2s var(--ease) both}' +
    '@keyframes ptFade{from{opacity:0}to{opacity:1}}' +
    '#scr-party .pt-card{width:100%;max-width:330px;padding:22px 18px 18px;border-radius:20px;' +
      'text-align:center;background:linear-gradient(180deg,var(--panel2),var(--panel));' +
      'border:1px solid var(--line2);box-shadow:0 18px 44px rgba(0,0,0,.6)}' +
    '#scr-party .pt-crest{font-size:36px;line-height:1;margin-bottom:10px;color:var(--gold)}' +
    '#scr-party .pt-over.lose .pt-crest{color:var(--bad)}' +
    '#scr-party .pt-over.draw .pt-crest{color:var(--dim)}' +
    '#scr-party .pt-card h3{font-size:19px;letter-spacing:.05em;text-transform:uppercase}' +
    '#scr-party .pt-why{font-size:12.5px;line-height:1.6;color:var(--dim);margin:9px 2px 0}' +
    '#scr-party .pt-quip{font-size:12.5px;line-height:1.65;color:var(--txt);margin:11px 2px 0;' +
      'font-style:italic;opacity:.92}' +
    '#scr-party .pt-acts{display:grid;gap:9px;margin-top:18px}' +
    '#scr-party .pt-acts .btn{min-height:50px;font-size:12.5px}' +

    /* ── promotion picker ── */
    '#scr-party .pt-promo{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:16px}' +
    '#scr-party .pt-promo button{aspect-ratio:1;border-radius:14px;background:var(--lite);' +
      'border:1px solid rgba(0,0,0,.35);display:grid;place-items:center;padding:8px}' +
    '#scr-party .pt-promo button:active{background:#F2E4C0}' +
    '#scr-party .pt-promo .pt-pcs{width:100%;height:100%}' +

    /* ── very short phones: give the board every pixel we can ── */
    '@media (max-height:700px){' +
      '#scr-party .pt-turn{min-height:36px;margin-bottom:5px}' +
      '#scr-party .pt-rail{min-height:18px}' +
      '#scr-party .pt-rail .pt-mini{width:14px;height:14px}' +
      '#scr-party .pt-bar .btn{min-height:44px}}';
  document.head.appendChild(st);
}

/* ── Escape = back, while we are the screen on top ─────────────────
   Registered once. It does nothing at all unless our screen is live,
   so it cannot interfere with the card game's own Escape handling. */
document.addEventListener('keydown', e => {
  if (!live || e.key !== 'Escape') return;
  const el = screenEl();
  const over = el.querySelector('.pt-over');
  if (over){ over.remove(); return; }
  const back = el.querySelector('#pt-back');
  if (back){ back.click(); return; }
  close();
});

/* ── the way in from Home ──────────────────────────────────────────
   ONE delegated listener rather than a binding on a particular
   element. Home's buttons are static markup in index.html but the
   screen around them is repainted by renderHome() whenever coins or
   decks change, and a listener attached to a node that gets replaced
   is a dead button nobody notices. This survives all of that, and it
   means the only edit index.html needs is the markup itself:

     <button class="btn primary pick" id="btn-party"> ... </button>

   Any element with a data-party attribute opens the hub too, so a
   second entry point can be added later without touching this file. */
document.addEventListener('click', e => {
  const t = e.target && e.target.closest && e.target.closest('#btn-party,[data-party]');
  if (!t) return;
  e.preventDefault();
  open();
});

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC FACE
   js/chess.js and js/dama.js load after this file and call register().
   index.html calls KARTI_PARTY.open() from the home screen button.
   ═══════════════════════════════════════════════════════════════════ */
window.KARTI_PARTY = {
  open, close, hub, register,
  /* show() puts our screen up WITHOUT painting the hub over it — js/mp.js
     needs that to drop an online board straight onto the screen. */
  show, standDown,
  isLive: () => live,
  /* the shared kit the two games are built out of */
  ui: { screenEl, frame, setTurn, setNet, result, confirm, setup, fit, pieceSVG,
        sprite: injectSprite, css: injectCSS, ico, esc, takeback },
  /* the shared takeback machinery — see the block above. Any game seating two
     or more players online should build one of these rather than roll its own. */
  takeback, TAKE_TTL, TAKE_COOL,
  /* filled in by js/chess.js and js/dama.js: the online controller for each
     game — {start, remote, note, stop, live}. js/mp.js is the only caller. */
  online: {},
  /* the ledger */
  record, recOf, pref
};

})();
