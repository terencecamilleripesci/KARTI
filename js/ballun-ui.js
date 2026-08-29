/* ═══════════════════════════════════════════════════════════════════
   KARTI — ballun-ui.js
   IL-BALLUN — the screen.  A neon festa-square arena drawn on one canvas,
   smoothed to 60fps by interpolating the engine's fixed-point sub-
   positions between ticks, with a one-thumb DRAG control for your paddle.

   This is the sibling of js/bomba-ui.js and js/serp-ui.js and it copies
   their honest real-time story wholesale:
     · the ENGINE (js/ballun.js) owns the world; this file owns the DOM
       it creates and nothing else — it borrows #scr-party through
       KARTI_PARTY, injects its own scoped CSS once, and draws.
     · THE CLOCK is one requestAnimationFrame loop that paces the fixed
       tick off wall time and only COMMITS a tick when every seat's input
       for it is present (lockstep).  A backgrounded tab is caught up
       (bounded), never replayed into a goal it could not steer out of.
     · INPUT-DELAY LOCKSTEP: our paddle's target is sampled from the thumb
       and committed for tick N+D; the ball reads only committed inputs, so
       every phone simulates the identical arena and nobody disputes a goal.
       Our own paddle is drawn PREDICTIVELY (engine.ghost) so it feels
       attached to the thumb despite the D-tick input lag; the ghost writes
       nothing and the ball never reads it.

   ── THE CONTROL, AND WHY A DRAG ────────────────────────────────────────
     Your paddle slides ALONG your edge.  You control it by DRAGGING
     anywhere on your HALF of the arena (the half nearest your edge): the
     paddle's lane position tracks your thumb's coordinate along the edge
     axis.  A drag, not buttons, because:
       · a paddle is a 1-D absolute position and a thumb is a 1-D absolute
         position — mapping one to the other is the most direct control
         there is, with no acceleration to fight;
       · dragging on your HALF keeps your thumb at the bottom (your edge is
         BOTTOM in solo/local), so it never covers the ball or the centre
         where the action is;
       · it matches the engine's absolute-target lockstep exactly: the
         thumb IS the committed target, so there is nothing to translate.
     For solo and local play YOU are always the BOTTOM edge (edge 0) and
     the other three edges are the machine — a full four-corner brawl that
     you steer with one thumb along the bottom strip.

   ── THE LOOK ───────────────────────────────────────────────────────────
     A dark festa square with a faint gold grid and a soft vignette; four
     goal mouths cut into glowing seat-coloured walls; glowing balls with
     a short motion trail whose tint warms as the ball speeds up (so the
     escalation reads at a glance); paddles in their seat colours; particle
     bursts on a paddle hit and a bigger burst + a goal-mouth flash + a
     brief screen-shake on a goal (all honoured off under reduced-motion).
     Everything is canvas; NO image files (generated art is added later).

   IDENTITY IS ORIGINAL.  The name IL-BALLUN ("the ball"), the festa-square
   theme, the seat palette and every glyph here are ours.  The mechanic
   (edge paddles, bouncing balls, goals) is a generic party game; nothing
   copies any commercial game's name, characters or art.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_BALLUN;
if (!P || !R || !R.engine) return;

const E = R.engine;
const C = E.consts;
const esc = (K && K.esc) || (s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;

function noMotion(){
  try {
    if (window.KARTI && KARTI.REDUCED) return true;
    if (document.body && document.body.classList.contains('reduced')) return true;
    return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch(e){ return false; }
}
function nowMs(){ try { return performance.now(); } catch(e){ return Date.now(); } }

/* ── sound: existing ids only, one gate, rate-limited for the busy ones ── */
let cueAt = 0;
function cue(id, opts, big){
  const S = window.KARTI_SFX;
  if (!S || !S.play) return;
  const now = Date.now();
  if (!big && now - cueAt < 45) return;
  cueAt = Math.max(cueAt, now);
  try { S.play(id, opts); } catch(e){}
}

/* ── our corner of localStorage ─────────────────────────────────────── */
const STORE = 'karti_ballun_v1';
let ST = { v:1, pref:{}, rec:{ w:0, l:0, d:0 } };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object'){
    ST.pref = (j.pref && typeof j.pref === 'object') ? j.pref : {};
    ST.rec  = (j.rec  && typeof j.rec  === 'object') ? j.rec  : ST.rec;
  }
} catch(e){}
let persistPending = 0;
function persist(){
  if (persistPending) return;
  persistPending = setTimeout(() => {
    persistPending = 0;
    try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){}
  }, 250);
}
function pref(patch){
  if (patch){ ST.pref = Object.assign({}, ST.pref, patch); persist(); }
  return ST.pref;
}

/* ── the seat palette — ORIGINAL, edge-indexed (BOTTOM,TOP,LEFT,RIGHT) ── */
const SEAT = [
  { name:'gold',  a:'#FFC542', b:'#FF9A2E', glow:'rgba(255,197,66,.55)' },  /* BOTTOM = you */
  { name:'ice',   a:'#7FD4FF', b:'#3E9BE8', glow:'rgba(127,212,255,.55)' }, /* TOP        */
  { name:'jade',  a:'#57E39B', b:'#22B673', glow:'rgba(87,227,155,.55)' },  /* LEFT       */
  { name:'ruby',  a:'#FF6E8A', b:'#E03B63', glow:'rgba(255,110,138,.55)' }  /* RIGHT      */
];
const TICK_MS = C.TICK_MS;

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party .bl-*
   ═══════════════════════════════════════════════════════════════════ */
let cssDone = false;
function injectCSS(){
  if (cssDone) return; cssDone = true;
  const st = document.createElement('style');
  st.id = 'bl-style';
  st.textContent = [
    '#scr-party .bl-arena{position:absolute;inset:0;display:grid;place-items:center}',
    '#scr-party .bl-arena canvas{display:block;border-radius:16px;touch-action:none;',
    '  box-shadow:0 10px 34px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.06) inset}',
    '#scr-party .bl-hud{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;',
    '  padding:2px 4px 0;width:100%}',
    '#scr-party .bl-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;',
    '  border-radius:999px;background:var(--panel,#1B1430);border:1px solid var(--line,rgba(255,255,255,.10));',
    '  font:800 11px/1 var(--disp,"Exo 2",sans-serif);color:var(--dim,#A093C4)}',
    '#scr-party .bl-chip .d{width:9px;height:9px;border-radius:3px;flex:0 0 auto}',
    '#scr-party .bl-chip b{color:#fff;font-size:12px;font-variant-numeric:tabular-nums}',
    '#scr-party .bl-chip.me{background:rgba(255,197,66,.14);border-color:rgba(255,197,66,.4)}',
    '#scr-party .bl-chip.out{opacity:.4}#scr-party .bl-chip.out b{text-decoration:line-through}',
    '#scr-party .bl-hearts{letter-spacing:1px;font-size:11px}',
    /* the countdown / overlay text over the board */
    '#scr-party .bl-cd{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
    '  font:900 64px/1 var(--disp,"Exo 2",sans-serif);color:#fff;pointer-events:none;',
    '  text-shadow:0 3px 18px rgba(0,0,0,.6);opacity:0;transition:opacity .2s}',
    '#scr-party .bl-cd.on{opacity:1}#scr-party .bl-cd.go{font-size:38px;color:var(--gold,#FFC542)}',
    /* ── menu ── */
    '#scr-party .bl-hero{position:relative;height:150px;border-radius:16px;overflow:hidden;',
    '  margin:2px 0 12px;background:radial-gradient(120% 120% at 50% 0%,#241A3E,#0E0B14)}',
    '#scr-party .bl-hero canvas{position:absolute;inset:0;width:100%;height:100%}',
    '#scr-party .bl-hero-logo{position:absolute;inset:0;margin:auto;max-width:74%;max-height:78%;',
    '  object-fit:contain;z-index:1;pointer-events:none;filter:drop-shadow(0 4px 14px rgba(0,0,0,.55))}',
    '#scr-party .bl-hero-cap{position:absolute;left:12px;bottom:10px;z-index:2;',
    '  font:900 15px/1 var(--disp,"Exo 2",sans-serif);letter-spacing:.14em;color:#fff;',
    '  text-shadow:0 2px 8px rgba(0,0,0,.6)}',
    '#scr-party .bl-modes{display:flex;flex-direction:column;gap:10px}',
    '#scr-party .bl-mode{display:flex;align-items:center;gap:12px;padding:14px 14px;border-radius:16px;',
    '  background:var(--panel,#1B1430);border:1px solid var(--line,rgba(255,255,255,.10));',
    '  text-align:left;width:100%;color:var(--txt,#F4EFFF)}',
    '#scr-party .bl-mode.primary{background:linear-gradient(180deg,rgba(255,197,66,.16),var(--panel,#1B1430));',
    '  border-color:rgba(255,197,66,.4)}',
    '#scr-party .bl-mode:active{transform:translateY(1px)}',
    '#scr-party .bl-mi{width:40px;height:40px;flex:0 0 auto;display:grid;place-items:center;border-radius:12px;',
    '  background:rgba(255,255,255,.05)}',
    '#scr-party .bl-mi svg{width:24px;height:24px;stroke:var(--gold,#FFC542);fill:none;stroke-width:2;',
    '  stroke-linecap:round;stroke-linejoin:round}',
    '#scr-party .bl-mt{flex:1 1 auto;min-width:0}',
    '#scr-party .bl-mt b{display:block;font:900 15px/1.1 var(--disp,"Exo 2",sans-serif)}',
    '#scr-party .bl-mt i{display:block;font-style:normal;color:var(--dim,#A093C4);font-size:12px;margin-top:3px}',
    '#scr-party .bl-mchev svg{width:20px;height:20px;stroke:var(--dim,#A093C4);fill:none;stroke-width:2}',
    /* the sliding rules / online sheet */
    '#scr-party .bl-sheet{overflow:hidden;max-height:0;transition:max-height .3s var(--ease,cubic-bezier(.22,.9,.28,1));',
    '  border-radius:16px;background:var(--panel,#1B1430);border:1px solid var(--line,rgba(255,255,255,.10));',
    '  margin-top:10px}',
    '#scr-party .bl-sheet.open{max-height:60vh;overflow-y:auto}',
    '#scr-party .bl-sheet-in{padding:14px 15px}',
    '#scr-party .bl-sheet h4{margin:0 0 8px;font:900 14px/1 var(--disp,"Exo 2",sans-serif);color:var(--gold,#FFC542)}',
    '#scr-party .bl-sheet ul{margin:0;padding-left:18px;color:var(--txt,#F4EFFF);font-size:13px;line-height:1.55}',
    '#scr-party .bl-sheet li{margin:5px 0}',
    /* setup step */
    '#scr-party .bl-seg{display:flex;gap:6px;margin:6px 0 14px}',
    '#scr-party .bl-seg button{flex:1 1 0;padding:11px 4px;border-radius:12px;',
    '  background:var(--panel,#1B1430);border:1px solid var(--line,rgba(255,255,255,.10));',
    '  color:var(--dim,#A093C4);font:800 13px/1.15 var(--disp,"Exo 2",sans-serif)}',
    '#scr-party .bl-seg button.on{background:linear-gradient(180deg,rgba(255,197,66,.2),transparent);',
    '  border-color:rgba(255,197,66,.5);color:#fff}',
    '#scr-party .bl-lab{font:800 11px/1 var(--disp,"Exo 2",sans-serif);letter-spacing:.12em;',
    '  text-transform:uppercase;color:var(--dim2,#7F73A0);margin:10px 2px 2px}',
    '#scr-party .bl-start{margin-top:16px;width:100%;min-height:54px;border-radius:16px;',
    '  font:900 17px/1 var(--disp,"Exo 2",sans-serif);color:#241800;',
    '  background:linear-gradient(180deg,#FFD979,var(--gold,#FFC542));border:1px solid #FFE9B0;',
    '  box-shadow:0 6px 18px rgba(255,197,66,.28)}',
    '#scr-party .bl-start:active{transform:translateY(1px)}'
  ].join('');
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   THE MATCH — one live object.  M is null in the menus.
   ═══════════════════════════════════════════════════════════════════ */
let M = null;
let UI = null;

/* level words for the machine */
function levelWords(l){
  const p = E.text('ai.' + (l || 2));
  return { n: (window.KARTI_LANG && KARTI_LANG.lang() === 'mt') ? p.mt : p.en };
}

/* ═══════════════════════════════════════════════════════════════════
   THE MENU — PLAY WITH AI / PLAY ONLINE + a sliding How-to-play.
   ═══════════════════════════════════════════════════════════════════ */
let sheetKind = null;   /* 'rules' | 'online' | null */

function menu(){
  injectCSS();
  P.show();
  stopLoop(); M = null; UI = null;
  sheetKind = null;
  const el = P.ui.screenEl();
  el.innerHTML =
    '<div class="pt-wrap">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="bl-back" aria-label="' + esc(T('Back','Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>IL-BALLUN</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="bl-hero" id="bl-hero"><span class="bl-hero-cap">' +
        esc(T('BOUNCE IT IN','AQBEŻHA ĠO')) + '</span></div>' +
      '<p class="blurb">' + esc(T(
        'Guard your goal. Knock the ball into everyone else’s. Two to four players, one to an edge — nobody waits for a turn.',
        'Ħares il-lasti tiegħek. Aqbeż il-ballun f’dawk ta’ kulħadd. Minn tnejn sa erbgħa, wieħed ma’ kull tarf — ħadd ma jistenna dawra.')) + '</p>' +
      '<div class="bl-modes">' +
        modeBtn('bl-m-online','globe', T('Play online','Ilgħab onlajn'),
                T('Two to four people, one arena.','Minn tnejn sa erbgħa, arena waħda.'), true) +
        modeBtn('bl-m-ai','robot', T('Play with AI','Ilgħab kontra l-magna'),
                T('You against the machine. Straight in.','Int kontra l-magna. Dritt.'), false) +
        modeBtn('bl-m-rules','book', T('How to play','Kif tilgħab'),
                T('The rules, in a minute.','Ir-regoli, f’minuta.'), false) +
      '</div>' +
      '<div class="bl-sheet" id="bl-sheet" aria-hidden="true"><div class="bl-sheet-in" id="bl-sheet-in"></div></div>' +
      '<div style="height:18px"></div>' +
    '</div></div>';

  const hero = el.querySelector('#bl-hero');
  if (hero){
    const c = heroCanvas(); if (c) hero.insertBefore(c, hero.firstChild);
    /* if a generated logo exists it sits over the live arena canvas; it hides
       itself on load error so a missing file leaves the arena hero intact. */
    const logo = document.createElement('img');
    logo.src = 'art/ui/logo-ballun.png';
    logo.alt = 'IL-BALLUN';
    logo.className = 'bl-hero-logo';
    logo.onerror = () => { try { logo.remove(); } catch(e){} };
    logo.onload = () => { const cap = hero.querySelector('.bl-hero-cap'); if (cap) cap.style.display = 'none'; };
    hero.appendChild(logo);
  }

  el.querySelector('#bl-back').onclick = () => { cue('ui.back',{gain:.6}); P.hub(); };
  el.querySelector('#bl-m-ai').onclick = () => { cue('ui.tap',{gain:.6}); setupAI(); };
  el.querySelector('#bl-m-rules').onclick = () => toggleSheet('rules');
  el.querySelector('#bl-m-online').onclick = () => { cue('ui.tap',{gain:.6}); openOnline(); };
  el.addEventListener('pointerdown', e => {
    if (!sheetKind) return;
    const sh = el.querySelector('#bl-sheet');
    const btns = el.querySelector('.bl-modes');
    if (sh && btns && !sh.contains(e.target) && !btns.contains(e.target)) toggleSheet(null);
  }, true);
}
function modeBtn(id, icon, title, sub, primary){
  const ic = {
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    robot:'<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4M9 4h6"/><circle cx="9.5" cy="13" r="1"/><circle cx="14.5" cy="13" r="1"/>',
    book:'<path d="M4 5h9a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H4zM20 5h-9a3 3 0 0 0-3 3"/>'
  }[icon] || '';
  return '<button class="bl-mode' + (primary ? ' primary' : '') + '" id="' + id + '">' +
    '<span class="bl-mi"><svg viewBox="0 0 24 24" aria-hidden="true">' + ic + '</svg></span>' +
    '<span class="bl-mt"><b>' + esc(title) + '</b><i>' + esc(sub) + '</i></span>' +
    '<span class="bl-mchev"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></span>' +
  '</button>';
}
function toggleSheet(kind){
  const el = P.ui.screenEl();
  const sh = el.querySelector('#bl-sheet'), body = el.querySelector('#bl-sheet-in');
  if (!sh || !body) return;
  const want = (kind && kind !== sheetKind) ? kind : null;
  sheetKind = want;
  if (want === 'rules') body.innerHTML = rulesInner();
  else if (want === 'online') body.innerHTML = onlineInner(el);
  sh.classList.toggle('open', !!want);
  sh.setAttribute('aria-hidden', want ? 'false' : 'true');
  cue(want ? 'ui.sheet' : 'ui.close', { gain:.5 });
  if (want === 'online'){
    const b = el.querySelector('#bl-ol-ai');
    if (b) b.onclick = () => { toggleSheet(null); setupAI(); };
  }
}
function rulesInner(){
  return '<h4>' + esc(T('How to play','Kif tilgħab')) + '</h4><ul>' +
    '<li>' + esc(T('You are the BOTTOM edge. Drag along the bottom to slide your paddle and block the ball.',
      'Int it-tarf t’isfel. Iġbed max-xifer t’isfel biex iċċaqlaq ir-raketta u timblokka l-ballun.')) + '</li>' +
    '<li>' + esc(T('Where the ball hits your paddle changes its bounce — hit with the edge to cut it toward a rival’s goal.',
      'Fejn jolqot il-ballun fir-raketta jbiddel kif jaqbeż — olqtu bit-tarf biex tibagħtu lejn il-lasti ta’ ħaddieħor.')) + '</li>' +
    '<li>' + esc(T('You start on 15 points. A ball past your paddle into your goal costs one. Reach zero and your edge seals shut — the scorer serves the next ball.',
      'Tibda b’15-il punt. Ballun li jgħaddi r-raketta u jidħol fil-lasti jiswielek wieħed. Asal fix-xejn u t-tarf tiegħek jingħalaq — min jiskorja jservja l-ballun li jmiss.')) + '</li>' +
    '<li>' + esc(T('The ball speeds up and more balls join over time, so a round always ends. Last edge standing wins.',
      'Il-ballun jgħaġġel u jiżdiedu iktar blalen maż-żmien, mela r-round dejjem jispiċċa. Rebbieħ min jibqa’ l-aħħar.')) + '</li>' +
    '<li>' + esc(T('Grab a floating power-up: a wider paddle, a slow ball, an extra ball, or a one-goal shield.',
      'Aqbad power-up: raketta usa’, ballun bil-mod, ballun żejjed, jew tarka għal gol wieħed.')) + '</li>' +
    '<li>' + esc(T('Double-tap the arena to BASH — lunge and power-hit a ball in front of you so it flies off fast. It needs a moment to recharge.',
      'Agħti tektika doppja fuq l-arena biex tagħmel BASH — timbotta u tolqot bis-saħħa ballun quddiemek biex jitlaq b’veloċità. Irid ftit biex jerġa’ jimla.')) + '</li>' +
    '</ul>';
}
function onlineInner(){
  return '<h4>' + esc(T('Online','Onlajn')) + '</h4><ul><li>' + esc(ONLINE_WHY) + '</li></ul>' +
    '<button class="bl-start" id="bl-ol-ai" style="margin-top:8px">' +
      esc(T('Play the machine instead','Ilgħab kontra l-magna minflok')) + '</button>';
}
function openOnline(){
  /* the relay does not know "ballun" yet — the honest degrade, same as bomba */
  if (P.lobbyFor){ try { P.lobbyFor('ballun'); return; } catch(e){} }
  if (K && K.go && P.online && window.KARTI_MP && KARTI_MP.GAMES &&
      KARTI_MP.GAMES.some(g => g.k === 'ballun') && P.online.ballun){
    try { K.go('mp'); return; } catch(e){}
  }
  toggleSheet('online');
}

/* ═══════════════════════════════════════════════════════════════════
   THE SETUP STEP — players / mode / difficulty on a tidy second screen.
   ═══════════════════════════════════════════════════════════════════ */
function setupAI(){
  injectCSS();
  P.show();
  stopLoop(); M = null; UI = null;
  const el = P.ui.screenEl();
  const p = pref();
  let players = clampN(p.players || 4, 2, 4);
  let mode    = p.mode === 'timed' ? 'timed' : 'lives';
  let lvl     = clampN(p.lvl || 2, 1, 3);

  function paint(){
    el.innerHTML =
      '<div class="pt-wrap">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="bl-back" aria-label="' + esc(T('Back','Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(T('New game','Logħba ġdida')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<div class="bl-lab">' + esc(T('Players','Plejers')) + '</div>' +
        '<div class="bl-seg" id="bl-players">' +
          seg('2', players===2) + seg('3', players===3) + seg('4', players===4) +
        '</div>' +
        '<div class="bl-lab">' + esc(T('Mode','Mod')) + '</div>' +
        '<div class="bl-seg" id="bl-mode">' +
          segT('lives', T('Last standing','L-aħħar wieqaf'), mode==='lives') +
          segT('timed', T('Two minutes','Żewġ minuti'), mode==='timed') +
        '</div>' +
        '<div class="bl-lab">' + esc(T('Difficulty','Diffikultà')) + '</div>' +
        '<div class="bl-seg" id="bl-lvl">' +
          segT('1', levelWords(1).n, lvl===1) +
          segT('2', levelWords(2).n, lvl===2) +
          segT('3', levelWords(3).n, lvl===3) +
        '</div>' +
        '<button class="bl-start" id="bl-go">' + esc(T('Start','Ibda')) + '</button>' +
        '<div style="height:18px"></div>' +
      '</div></div>';

    el.querySelector('#bl-back').onclick = () => { cue('ui.back',{gain:.6}); menu(); };
    bindSeg(el.querySelector('#bl-players'), v => { players = +v; save(); paint(); });
    bindSeg(el.querySelector('#bl-mode'),    v => { mode = v; save(); paint(); });
    bindSeg(el.querySelector('#bl-lvl'),     v => { lvl = +v; save(); paint(); });
    el.querySelector('#bl-go').onclick = () => { cue('game.start',{gain:.8}, true); save(); startAI({ players, mode, lvl }); };
  }
  function save(){ pref({ players, mode, lvl }); }
  paint();
}
function seg(v, on){ return '<button data-v="' + v + '"' + (on?' class="on"':'') + '>' + esc(v) + '</button>'; }
function segT(v, label, on){ return '<button data-v="' + v + '"' + (on?' class="on"':'') + '>' + esc(label) + '</button>'; }
function bindSeg(root, fn){
  if (!root) return;
  root.querySelectorAll('button').forEach(b => b.onclick = () => { cue('ui.tap',{gain:.5}); fn(b.getAttribute('data-v')); });
}
function clampN(v, lo, hi){ v = v|0; return v<lo?lo:v>hi?hi:v; }

/* ═══════════════════════════════════════════════════════════════════
   START A LOCAL / AI MATCH — you are edge 0 (BOTTOM); the rest are the
   machine.  seed picked once here (the one Math.random, in the engine).
   ═══════════════════════════════════════════════════════════════════ */
function startAI(o){
  const players = clampN(o.players || 4, 2, 4);
  const lvl = clampN(o.lvl || 2, 1, 3);
  const mode = o.mode === 'timed' ? 'timed' : 'lives';
  const seed = ((Math.random() * 0x7FFFFFFF) | 0) || 1;
  /* seat 0 = human, the rest AI (up to players); the engine seats the first
     `players` edges and, since sealEmpty is false, fills the rest with AI so
     even a 2-player game is a four-corner brawl. We set players = the number
     of GOALS in play; solo default is 4 for the fullest arena. */
  const bots = [0,1,1,1];
  const aiLvl = [lvl,lvl,lvl,lvl];
  const st = E.start({ seed, players, mode, bots, aiLvl, me:0, sealEmpty:false });
  beginMatch(st, seed, { players, mode, lvl }, null, 0, [0]);
}

/* ═══════════════════════════════════════════════════════════════════
   BEGIN A MATCH — build the frame, the canvas, the controls, the loop.
   `mine` is the list of pids this phone owns (offline: [0] + AI seats it
   simulates locally; online: our seat, plus AI seats if we are host).
   ═══════════════════════════════════════════════════════════════════ */
function beginMatch(st, seed, opts, net, me, mine){
  injectCSS();
  P.show();
  leave();

  M = {
    st, seed, opts, net,
    me, mine: mine.slice(),
    D: 2, buf: {}, committed: -1,
    t0: 0, lead: 900, raf: 0,
    heldTarget: null,          /* the thumb's current lane target, or null   */
    bashPending: false,        /* a queued BASH not yet committed to a tick  */
    lastTapAt: 0, lastTapX: 0, lastTapY: 0,  /* double-tap BASH detection      */
    dead: false, finished: false,
    ledSaid: -1,
    /* ── THE THRIFTY WIRE (bomba/tankijiet's fix, ported) ──────────────
       Shipping the paddle target EVERY tick (40Hz) drained the relay's
       buckets (25 msg/s per connection, 40/s per room) the moment two or
       three chairs sat down: ~70% of targets were silently DROPPED, the
       old STALL_CAP then INVENTED targets the sender never made, and the
       phones forked — measured live: three phones, three different life
       counts. So a target ships only on a CHANGE (rate-floored by
       shipGap) plus a wall-clock keepalive, silence provably means
       "unchanged" (targetAt() already holds the last target), and
       advance() WAITS on a seat's watermark instead of guessing.
       ship — outbound: lastTpos/lastTick = last target actually SHIPPED
              and the tick it applies; hiTick = our highest committed
              tick; lastMs paces the keepalive.
       wm   — per REMOTE human seat, the highest forTick heard from it:
              hearing T proves every change ≤ T already arrived (the
              transport is ordered), so silence up to T = unchanged. */
    ship: { lastTpos: null, lastTick: -1, hiTick: -1, lastMs: 0 },
    wm: {}, stall: 0, shipGap: 4, shipHbMs: 200,
    fx: [], shake: 0, flash: [0,0,0,0],
    goalArrows: [],            /* {edge, dx, dy, life} — outward feedback     */
    cornerFlash: [],           /* {x, y, life} — ev.cornerHit bursts          */
    fps: { n:0, at:0, val:0 },
    ctx: null, seatMeta: null
  };
  M.seatMeta = st.pads.map((p, i) => ({
    name: i === me ? T('You','Int') : (p.inPlay ? (levelWords(opts.lvl||2).n) : T('Wall','Ħajt')),
    own: i === me ? 'me' : (p.bot ? 'ai' : 'net'),
    seated: p.inPlay
  }));

  openBoard(() => { const nx = M.net; leave(); if (nx && nx.onLeave) nx.onLeave(); else menu(); });
  M.D = measureD();
  seedInputs();                 /* THE SERVE FIX — prime the opening D ticks   */
  startLoop();
}

/* ═══════════════════════════════════════════════════════════════════
   THE WARMUP SEED — the fix for "the ball never starts".
   A committed input is filed for tick N+D, so at round start the human seat
   has input for tick D but NONE for ticks 0..D−1. ready() therefore stays
   false, step() early-returns every tick, and the world (and the served ball)
   never advances past tick 0 — the ball sits parked at centre forever. This is
   the exact reason the ball "never started".
   Fill every LIVE human seat's parked centre target for ticks 0..D+1 so the
   opening ticks are ready() and the served ball launches immediately. The
   parked target is deterministic (the paddle's centre), identical on every
   phone, so it is a desync-safe "hold still at the start" input — the same
   warmup briks/bomba use. Bots gate nothing (they think() internally), so we
   skip them. Idempotent: re-committing the same (pid,tick,value) is a no-op.
   ═══════════════════════════════════════════════════════════════════ */
function seedInputs(){
  if (!M || !M.st) return;
  /* ONLINE THE HORIZON IS FIXED, NOT M.D (the briks lesson, verbatim).
     M.D is measured from THIS phone's RTT, so two phones prefill different
     windows — and then a real input filed for a tick inside the LONGER
     window was refused on one phone (already prefilled with the parked
     centre, and commit() refuses a conflicting value) but accepted on the
     other: a desync in the first half-second. D_MAX is the same constant
     on every phone, so the refusal window is identical everywhere.
     Offline the local D is fine (there is nobody to disagree with). */
  const D = (M.net ? C.D_MAX : M.D) | 0;
  for (const p of M.st.pads){
    if (p.bot || !E.alive(p)) continue;
    const parked = p.pos;
    for (let t = 0; t <= D + 1; t++) E.commit(M.st, p.pid, t, parked);
  }
}

function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: 'IL-BALLUN',
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'bl-rules', label:T('Rules','Regoli'), icon:'book',    cls:'ghost' },
      { id:'bl-new',   label:T('New','Ġdida'),     icon:'refresh', cls:'ghost' }
    ]
  });
  const ctx = M.ctx;
  ctx.badge.textContent = (M.st.mode === 'timed' ? T('2:00','2:00') : T('Lives','Ħajjiet')) +
    ' · ' + M.st.pads.filter(p => p.inPlay).length;

  /* the arena canvas lives in the square board slot; fit() sizes #pt-board.
     There is NO bash button — a DOUBLE-TAP on the arena triggers the bash. */
  ctx.board.innerHTML = '<div class="bl-arena"><canvas id="bl-cv"></canvas>' +
    '<div class="bl-cd" id="bl-cd"></div>' +
    '</div>';
  const cv = ctx.board.querySelector('#bl-cv');
  UI = {
    host: ctx.board, cv, g: cv.getContext('2d', { alpha:false }),
    cd: ctx.board.querySelector('#bl-cd'),
    px: 0, pad: 0, dpr: 1
  };
  fitCanvas();
  if (typeof ResizeObserver === 'function'){
    UI.ro = new ResizeObserver(() => { if (UI) fitCanvas(); });
    UI.ro.observe(ctx.board);
  } else {
    UI.onR = () => { if (UI) fitCanvas(); };
    window.addEventListener('resize', UI.onR);
  }
  bindControl(cv);

  const nb = ctx.btn('bl-new');
  if (nb) nb.onclick = () => { cue('ui.tap',{gain:.5}); const o = M.opts; leave(); startAI(o); };
  const rb = ctx.btn('bl-rules');
  if (rb) rb.onclick = () => showRulesToast();

  P.ui.setTurn(ctx, { cls:'', who: T('Get ready','Ħejji ruħek'),
    note: T('Drag the bottom to move. Double-tap to shove the ball.',
            'Iġbed t’isfel biex tiċċaqlaq. Tektika doppja biex timbotta l-ballun.') });
  hud();
}

function showRulesToast(){
  try { K.toast(T('Drag the bottom edge to slide your paddle. Deflect the ball into a rival’s goal.',
    'Iġbed ix-xifer t’isfel biex iċċaqlaq ir-raketta. Aqbeż il-ballun fil-lasti ta’ rivali.')); } catch(e){}
}

/* ═══════════════════════════════════════════════════════════════════
   CANVAS SIZING — the ONLY layout read in the file, run on start and on
   resize, never in the frame loop.  The arena is square, so the canvas is
   the largest square that fits the board slot.
   ═══════════════════════════════════════════════════════════════════ */
function fitCanvas(){
  if (!UI || !UI.host || !UI.host.isConnected) return;
  const w = UI.host.clientWidth, h = UI.host.clientHeight;
  if (!w || !h) return;
  const side = Math.max(200, Math.floor(Math.min(w, h)));
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  UI.px = side; UI.dpr = dpr;
  UI.cv.style.width = side + 'px';
  UI.cv.style.height = side + 'px';
  /* pin the arena wrapper to the exact canvas box so the BASH button (anchored
     bottom-right of .bl-arena) lands on the arena corner, not off-screen. */
  const arena = UI.host.querySelector('.bl-arena');
  if (arena){ arena.style.width = side + 'px'; arena.style.height = side + 'px'; }
  UI.cv.width = Math.round(side * dpr);
  UI.cv.height = Math.round(side * dpr);
  UI.scale = (side * dpr) / C.W;               /* subunits -> device px      */
}
/* subunit -> device pixel */
function sx(x){ return Math.round(x * UI.scale); }

/* ═══════════════════════════════════════════════════════════════════
   TOUCH CONTROL — drag your paddle along your edge.  You are always the
   BOTTOM edge (edge 0), so a horizontal drag anywhere on the canvas maps
   your thumb's X to your paddle's lane target.  We commit the target for
   tick N+D inside the loop; here we only record the thumb position.
   ═══════════════════════════════════════════════════════════════════ */
/* THE CONTROL — a SINGLE drag moves the paddle; a DOUBLE-TAP bashes.
   · A drag is any pointer stream that MOVES the thumb: every move sets the lane
     target (the committed-input target lands the paddle under the thumb).
   · A tap is a pointerdown+up that barely moved and lasted a moment; two taps
     within DTAP_MS and DTAP_PX of each other = a BASH.  The bash is QUEUED
     (M.bashPending) and committed for tick N+D through the EXACT same lockstep
     pipeline the old button used (E.commitBash / the `bx` wire) — never applied
     locally.  A drag never registers as a tap (it moved too far), so moving the
     paddle can't mis-fire a bash.  Cross-platform via Pointer Events. */
const DTAP_MS = 300;           /* two taps within this window = a double-tap    */
const DTAP_PX = 28;            /* ...and within this many CSS px of each other   */
const TAP_MOVE_PX = 12;        /* a touch that moved less than this counts as a tap */
const TAP_MAX_MS = 260;        /* ...and was shorter than this                    */
function bindControl(cv){
  let on = false, downX = 0, downY = 0, downT = 0, moved = 0;
  const toLane = ev => {
    const r = cv.getBoundingClientRect();
    const p = M.st.pads[M.me];
    if (!p) return null;
    /* device-independent: map the pointer's position on the canvas to a
       subunit coordinate along OUR edge's slide axis. */
    const axis = C.EDGE_AXIS[p.edge];
    const rel = axis === 'x'
      ? (ev.clientX - r.left) / (r.width || 1)
      : (ev.clientY - r.top)  / (r.height || 1);
    let target = Math.round(rel * (axis === 'x' ? C.W : C.H));
    /* clamp to the lane inside the paddle half-width */
    const lo = p.lo + p.hw, hi = p.hi - p.hw;
    if (target < lo) target = lo; else if (target > hi) target = hi;
    return target;
  };
  const set = ev => { const t = toLane(ev); if (t != null) M.heldTarget = t; };
  cv.addEventListener('pointerdown', ev => {
    on = true; downX = ev.clientX; downY = ev.clientY; downT = nowMs(); moved = 0;
    try { cv.setPointerCapture(ev.pointerId); } catch(e){}
    set(ev); ev.preventDefault();
  });
  cv.addEventListener('pointermove', ev => {
    if (!on) return;
    moved = Math.max(moved, Math.abs(ev.clientX - downX) + Math.abs(ev.clientY - downY));
    set(ev);
  });
  cv.addEventListener('pointerup', ev => {
    on = false;
    /* was this a TAP (small move, short)? then test it against the previous tap */
    const dt = nowMs() - downT;
    if (moved <= TAP_MOVE_PX && dt <= TAP_MAX_MS && M){
      const gap = nowMs() - (M.lastTapAt || 0);
      const near = Math.abs(ev.clientX - (M.lastTapX || 0)) + Math.abs(ev.clientY - (M.lastTapY || 0));
      if (M.lastTapAt && gap <= DTAP_MS && near <= DTAP_PX){
        queueBash();                 /* DOUBLE-TAP → bash */
        M.lastTapAt = 0;             /* consume so a triple-tap isn't two bashes */
      } else {
        M.lastTapAt = nowMs(); M.lastTapX = ev.clientX; M.lastTapY = ev.clientY;
      }
    } else {
      M.lastTapAt = 0;               /* a drag clears any pending first-tap */
    }
  });
  cv.addEventListener('pointercancel',() => { on = false; if (M) M.lastTapAt = 0; });
}
/* QUEUE a bash from a double-tap — rides the SAME committed-input pipeline as
   the paddle target (filed for tick N+D in advance(), broadcast on the `bx`
   wire), so online + offline apply it identically and never locally.  Only
   filed when off cooldown so a spammed double-tap does not waste itself. */
function queueBash(){
  const p = M.st && M.st.pads[M.me];
  if (!p || !E.alive(p)) return;
  if (p.bashCd > 0){ return; }                 /* on cooldown — ignore */
  M.bashPending = true;
  cue('duel.hit', { gain:.6 });
}

/* ═══════════════════════════════════════════════════════════════════
   THE CLOCK — one rAF loop.  Same shape as bomba: pace the fixed tick off
   wall time; only commit a tick when its frame is complete; catch up a
   backgrounded tab (bounded); interpolate for the draw.
   ═══════════════════════════════════════════════════════════════════ */
const MAX_CATCHUP = 6;
function measureD(){
  if (!M) return C.D_MIN;
  if (!M.net) return E.delayTicks(0, 0);
  try {
    const MPX = window.KARTI_MP;
    if (MPX && MPX.pingStats){
      const s = MPX.pingStats();
      if (s && s.n >= 2 && s.med != null){
        const jit = (s.worst != null && s.best != null) ? (s.worst - s.best) : 30;
        return E.delayFor(s.med, jit);
      }
    }
  } catch(e){}
  return E.delayFor(120, 40);
}
function stopLoop(){ if (M && M.raf){ cancelAnimationFrame(M.raf); M.raf = 0; } }
function startLoop(){
  if (!M || M.raf) return;
  M.D = measureD();
  if (M.net){
    /* THE WIRE BUDGET scales with the table: worst case ≈ humans·40/gap
       change messages plus 1000/shipHbMs keepalives per phone. 26 Aug 2026:
       the relay's room bucket was RAISED 40 -> 160 msg/s — this is the 40Hz
       game, the heaviest of the lot, and at four humans it wanted ~72/s
       against the old 40/s ceiling, which is why a full table stuttered and
       stalled. Under 160 it fits with room to spare, so the gap tightens for
       feel: worst case 4 humans x (40/4 + 1000/150) ≈ 67/s. */
    let humans = 0;
    for (const p of M.st.pads) if (!p.bot && E.alive(p)) humans++;
    M.shipGap  = humans <= 2 ? 2 : humans <= 3 ? 3 : 4;
    M.shipHbMs = 150;
    /* prime the outbound ledger from the seeded parked target (seedInputs
       filled 0..D_MAX+1 with the paddle centre, identically on every
       phone) and every peer's watermark from that same shared horizon. */
    const me = M.st.pads[M.me];
    M.ship.lastTpos = me ? me.pos : 0;
    M.ship.lastTick = 0;
    M.ship.hiTick = C.D_MAX + 1;
    for (const p of M.st.pads){
      if (p.bot || !E.alive(p) || M.mine.indexOf(p.pid) >= 0) continue;
      M.wm[p.pid] = C.D_MAX + 1;
    }
  }
  M.t0 = nowMs() + M.lead;
  const step = t => { if (!M || M.dead) return; M.raf = requestAnimationFrame(step); frame(t); };
  M.raf = requestAnimationFrame(step);
}

/* THE KEEPALIVE — from frame(), on wall time. Re-states the unchanged
   target at the highest tick we have committed, so every peer's watermark
   for our seat keeps advancing even while the thumb is still (and even
   while our own advance() is stalled waiting on somebody else). */
function shipPulse(){
  const sh = M.ship;
  if (!M.net || sh.lastTpos === null) return;
  if (sh.hiTick <= sh.lastTick) return;        /* nothing new to confirm */
  if (nowMs() - sh.lastMs < M.shipHbMs) return;
  sh.lastTick = sh.hiTick; sh.lastMs = nowMs();
  sendMove(M.me, { t:'tx', forTick: sh.hiTick, tpos: sh.lastTpos });
}

function frame(t){
  const now = (t == null) ? nowMs() : t;
  if (now < M.t0){
    const left = M.t0 - now, beat = Math.ceil(left / 800);
    if (beat !== M.ledSaid){
      M.ledSaid = beat;
      const S = window.KARTI_SFX; if (S && S.note){ try { S.note(4 - beat); } catch(e){} }
      paintCD(String(beat), false);
    }
    draw(0); meter(now); return;
  }
  if (M.ledSaid !== 0){ M.ledSaid = 0; paintCD('', false); cue('game.start',{gain:.85}, true); }

  if (M.finished){ draw(1); meter(now); return; }

  /* the keepalive runs from the frame, not from advance(): while this
     phone WAITS on a slow peer, advance() returns false — but the peer may
     in turn be waiting on OUR watermark. */
  if (M.net) shipPulse();

  const want = Math.floor((now - M.t0) / TICK_MS) + 1;
  if (want - (M.committed + 1) > MAX_CATCHUP){
    M.t0 = now - ((M.committed + 1) * TICK_MS);
  } else {
    let guard = 0;
    while (M.committed + 1 <= want && guard++ < MAX_CATCHUP){ if (!advance()) break; }
  }
  const frac = M.finished ? 1
    : Math.max(0, Math.min(1, (now - M.t0) / TICK_MS - (M.committed + 1)));
  draw(noMotion() ? 1 : frac);
  meter(now);
}
function meter(now){
  const f = M.fps; f.n++;
  if (!f.at) f.at = now;
  else if (now - f.at >= 1000){ f.val = Math.round(f.n * 1000 / (now - f.at)); f.n = 0; f.at = now; }
}
function paintCD(txt, go){
  if (!UI || !UI.cd) return;
  UI.cd.textContent = txt;
  UI.cd.className = 'bl-cd' + (txt ? ' on' : '') + (go ? ' go' : '');
}

/* ═══════════════════════════════════════════════════════════════════
   ADVANCE ONE TICK — the lockstep heart.  Same rules as bomba/briks:
   commit our owned seats for N+D, assemble tick N (owned present, net
   waited-on then predicted), step the pure engine.  Returns true if it
   stepped, false if blocking on a peer.
   ═══════════════════════════════════════════════════════════════════ */
function advance(){
  const st = M.st, N = M.committed + 1;

  /* 1 — commit OUR human seat's target for N+D. Absolute target: holding
     the thumb still lands the authoritative paddle exactly under it.
     ONLINE the applied change rate is FLOORED at shipGap ticks (a change
     arriving before the gap has passed is HELD — the old target is
     committed instead), so every change that DOES apply ships the very
     tick it applies and the wire stays inside the relay's room bucket.
     Local commit and remote derivation stay bit-identical: silence
     between ships means "unchanged", which is exactly what was committed.
     A pending BASH always flushes (it must ride its own tick and is paced
     by the engine's bash cooldown, so it cannot flood). */
  if (M.mine.indexOf(M.me) >= 0){
    const p = st.pads[M.me];
    if (p && E.alive(p)){
      let tgt = (M.heldTarget != null) ? M.heldTarget : p.pos;
      const forTick = N + M.D;
      if (forTick > M.committed){
        const sh = M.ship;
        const bash = !!(M.bashPending && p.bashCd === 0);
        if (M.net && sh.lastTpos !== null && tgt !== sh.lastTpos && !bash &&
            forTick - sh.lastTick < M.shipGap)
          tgt = sh.lastTpos;               /* hold the change one more tick */
        E.commit(st, M.me, forTick, tgt);
        /* ship what the sim actually TOOK (a commit refused inside the
           warmup prefill keeps the parked target — briks's lesson) */
        const eff = st.inp[M.me][forTick];
        if (eff !== undefined){
          if (forTick > sh.hiTick) sh.hiTick = forTick;
          if (M.net && (sh.lastTpos === null || eff !== sh.lastTpos || bash)){
            sh.lastTpos = eff; sh.lastTick = forTick; sh.lastMs = nowMs();
            sendMove(M.me, { t:'tx', forTick, tpos: eff });
          }
        }
        /* THE BASH rides the SAME committed-input pipeline as the target: a
           queued bash is filed for the SAME future tick N+D and broadcast, so
           every phone applies it at N+D — never locally/immediately. We only
           file it when off cooldown so a spammed tap does not waste itself. */
        if (bash){
          E.commitBash(st, M.me, forTick);
          sendMove(M.me, { t:'bx', forTick });
        }
        M.bashPending = false;
      }
    }
  }
  /* AI seats we own commit themselves inside E.step via think(); they never
     gate ready() and produce no wire. Online host also owns AI seats but
     the engine computes them locally on every phone identically, so no wire
     is needed for them either (deterministic think()). */

  /* 2 — can we run tick N? Every LIVE remote human seat must have SPOKEN
     for N or beyond (watermark ≥ N): a message stamped T proves every
     change ≤ T already arrived on the ordered transport, so the engine's
     own targetAt() hold IS the sender's committed stream. No byte is ever
     guessed — the old STALL_CAP force-commit invented a target the sender
     never made after 8 blocked frames (any wifi jitter spike), and under
     the relay's flood-drops that meant three phones playing three
     different games (measured: lives 12/9/9 vs 8/8/9 vs 10/5/10). A freed
     chair (seatGone → M.gone) is exempt: it parks deterministically. */
  if (M.net){
    for (const p of st.pads){
      if (p.bot || !E.alive(p) || M.mine.indexOf(p.pid) >= 0) continue;
      if (M.gone && M.gone[p.pid]) continue;
      if ((M.wm[p.pid] !== undefined ? M.wm[p.pid] : -1) < N){
        M.stall = (M.stall || 0) + 1;
        return false;
      }
    }
  }
  if (!E.ready(st)){ M.stall = (M.stall || 0) + 1; return false; }
  M.stall = 0;

  /* 3 — step. */
  const before = st.pads.map(p => ({ lives:p.lives, goals:p.goals }));
  E.step(st);
  M.committed = N;
  afterStep(before);
  return true;
}

/* react to what a tick produced: particles, flashes, shake, sound, HUD. */
function afterStep(before){
  const st = M.st;
  for (const e of st.ev){
    if (e.id === 'ev.hit'){ burst(hitPoint(e.pid), SEAT[st.pads[e.pid].edge], 8); cue('duel.hit',{gain:.5}); }
    else if (e.id === 'ev.wall'){ /* quiet */ }
    else if (e.id === 'ev.goal'){ goalFx(e.edge); }
    else if (e.id === 'ev.catch'){ burst(padCentre(e.pid), SEAT[st.pads[e.pid].edge], 12); cue('ui.reward',{gain:.5}); }
    else if (e.id === 'ev.multi'){ cue('dice.roll',{gain:.4}); }
    else if (e.id === 'ev.shield'){ cue('sea.sonar',{gain:.4}); }
    else if (e.id === 'ev.serve'){ /* silent — the telegraph shows it */ }
    else if (e.id === 'ev.bash'){ burst(padCentre(e.pid), SEAT[st.pads[e.pid].edge], 14); cue('duel.destroy',{gain:.5}); }
    else if (e.id === 'ev.bashwhiff'){ cue('duel.hit',{gain:.35}); }
    else if (e.id === 'ev.cornerHit'){ cornerFlash(e.corner); }
  }
  /* did anyone just get knocked out? */
  for (let i = 0; i < st.pads.length; i++){
    if (before[i].lives > 0 && st.pads[i].lives === 0){
      cue('sea.sink',{gain:.6}, true);
      try { K.toast((M.seatMeta[i].name) + ' — ' + T('out.','barra.')); } catch(e){}
    }
  }
  hud();
  if (st.over && !M.finished) finish();
}
function goalFx(edge){
  const st = M.st;
  M.flash[edge] = 1;
  burst(mouthCentre(edge), SEAT[edge], 26);
  if (!noMotion()) M.shake = Math.min(1, M.shake + 0.8);
  cue('duel.destroy',{gain:.7}, true);
  /* an ARROW at the goal mouth pointing OUTWARD — the direction the ball left,
     i.e. that edge's outward normal — so it reads instantly WHO conceded and
     where the ball went out. Cosmetic; driven purely off the engine's goal
     event (the engine stays authoritative). */
  const axisX = C.EDGE_AXIS[edge] === 'x';
  const dx = axisX ? 0 : C.EDGE_OUT[edge];
  const dy = axisX ? C.EDGE_OUT[edge] : 0;
  M.goalArrows.push({ edge, dx, dy, life: 1 });
}
/* THE CORNER TELEGRAPH — for every PENDING SERVE in engine state, the CORNER it
   emerges from "lights up": a growing, pulsing glow that intensifies as the
   spawn nears, so players see WHICH corner the ball is about to come out of.
   NO direction arrow (by design — nothing points at/near the ball).  Reads
   st.serves (identical on every client) and draws nothing into the sim. */
function drawServeTelegraph(g, now){
  const st = M.st;
  if (!st.serves || !st.serves.length) return;
  const pulse = 0.5 + 0.5 * Math.sin(now / 140);        /* cosmetic pulse       */
  for (const s of st.serves){
    const ox = sx(s.originX), oy = sx(s.originY);
    /* colour: the server's seat if it has one, else neutral gold */
    const col = (s.last >= 0 && SEAT[st.pads[s.last] ? st.pads[s.last].edge : 0])
      ? SEAT[st.pads[s.last].edge].a : '#FFC542';
    /* how imminent is the spawn? tighter, brighter glow as ticksLeft -> 0 */
    const total = (s.ticksLeft > 24) ? s.ticksLeft : 24;
    const near = 1 - Math.max(0, Math.min(1, s.ticksLeft / total));
    g.save();
    /* a soft radial CORNER GLOW — the corner "lighting up" */
    const gr = (18 + near * 16 + pulse * 6) * UI.dpr;
    const rad = g.createRadialGradient(ox, oy, 0, ox, oy, gr);
    rad.addColorStop(0, col);
    rad.addColorStop(0.35, col);
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.22 + 0.30 * pulse + 0.20 * near;
    g.fillStyle = rad;
    circle(g, ox, oy, gr); g.fill();
    /* the pulsing spawn ring on top of the glow */
    const rr = (9 + pulse * 6 + near * 4) * UI.dpr;
    g.globalAlpha = 0.40 + 0.45 * pulse;
    g.strokeStyle = col; g.lineWidth = (2.5 + near * 1.5) * UI.dpr;
    g.shadowColor = col; g.shadowBlur = (12 + near * 12) * UI.dpr;
    circle(g, ox, oy, rr); g.stroke();
    /* the bright spawn seed */
    g.globalAlpha = 0.85; g.fillStyle = '#fff';
    circle(g, ox, oy, sx(C.R) * 0.7); g.fill();
    g.restore();
  }
}
/* the CORNER-HIT flashes — a brief bright burst at a corner the ball just
   struck (ev.cornerHit).  Cosmetic, seat-neutral gold, fades over its life. */
function drawCornerFlashes(g){
  if (!M.cornerFlash) return;
  for (const f of M.cornerFlash){
    const t = Math.max(0, Math.min(1, f.life));
    const ox = sx(f.x), oy = sx(f.y);
    const rr = (16 + (1 - t) * 22) * UI.dpr;
    g.save();
    g.globalAlpha = t * 0.8;
    const rad = g.createRadialGradient(ox, oy, 0, ox, oy, rr);
    rad.addColorStop(0, '#FFF3C8'); rad.addColorStop(0.4, '#FFC542');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    circle(g, ox, oy, rr); g.fill();
    g.restore();
  }
}
/* the outward goal arrows — a bold chevron at each conceded mouth, fading. */
function drawGoalArrows(g){
  for (const a of M.goalArrows){
    const c = mouthCentre(a.edge);
    const s = SEAT[a.edge];
    const t = Math.max(0, Math.min(1, a.life));
    /* the arrow origin sits just inside the mouth and points out through it */
    const len = 26 * UI.dpr, back = 10 * UI.dpr;
    const ox = sx(c.x), oy = sx(c.y);
    const tipX = ox + a.dx * len,  tipY = oy + a.dy * len;
    const baseX = ox - a.dx * back, baseY = oy - a.dy * back;
    g.save();
    g.globalAlpha = t;
    g.strokeStyle = s.a; g.lineWidth = 4 * UI.dpr;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = s.glow; g.shadowBlur = 12 * UI.dpr;
    /* shaft */
    g.beginPath(); g.moveTo(baseX, baseY); g.lineTo(tipX, tipY); g.stroke();
    /* head — two barbs perpendicular to the direction */
    const px = -a.dy, py = a.dx;              /* perpendicular unit-ish          */
    const hb = 9 * UI.dpr, hl = 11 * UI.dpr;
    g.beginPath();
    g.moveTo(tipX, tipY);
    g.lineTo(tipX - a.dx*hl + px*hb, tipY - a.dy*hl + py*hb);
    g.moveTo(tipX, tipY);
    g.lineTo(tipX - a.dx*hl - px*hb, tipY - a.dy*hl - py*hb);
    g.stroke();
    g.restore();
  }
}

/* ── geometry helpers for the FX, in subunits ── */
function padCentre(pid){
  const p = M.st.pads[pid];
  return C.EDGE_AXIS[p.edge] === 'x' ? { x:p.pos, y:C.PAD_COORD[p.edge] }
                                     : { x:C.PAD_COORD[p.edge], y:p.pos };
}
function hitPoint(pid){ return padCentre(pid); }
function mouthCentre(edge){
  const g = C.GOAL_COORD[edge];
  return C.EDGE_AXIS[edge] === 'x' ? { x:C.W>>1, y:g } : { x:g, y:C.H>>1 };
}
/* the four inset corner spawn points, in subunits — mirrors the engine's
   CORNERS (inset by MOUTH_M).  Indexed by corner 0=TL,1=TR,2=BR,3=BL. */
function cornerPoint(c){
  const m = C.MOUTH_M;
  switch (c & 3){
    case 0:  return { x: m,       y: m };        /* top-left     */
    case 1:  return { x: C.W - m, y: m };        /* top-right    */
    case 2:  return { x: C.W - m, y: C.H - m };  /* bottom-right */
    default: return { x: m,       y: C.H - m };  /* bottom-left  */
  }
}
/* a ball struck corner `c` — push a brief cosmetic flash there. Driven purely
   off the engine's ev.cornerHit; writes nothing into the sim. */
function cornerFlash(c){
  if (!M) return;
  const pt = cornerPoint(c);
  M.cornerFlash.push({ x: pt.x, y: pt.y, life: 1 });
  if (M.cornerFlash.length > 8) M.cornerFlash.shift();
  cue('dice.roll', { gain:.35 });
}

/* ═══════════════════════════════════════════════════════════════════
   THE HUD — one chip per seat: colour, name, hearts (lives).
   ═══════════════════════════════════════════════════════════════════ */
function hud(){
  if (!M || !M.ctx) return;
  const st = M.st;
  let html = '<div class="bl-hud">';
  for (let i = 0; i < st.pads.length; i++){
    const p = st.pads[i];
    if (!p.inPlay) continue;
    const s = SEAT[p.edge];
    const dead = !E.alive(p);
    /* compact score: a number, not a row of 12 hearts. Timed shows goals
       conceded; lives shows remaining points with a single heart glyph. */
    const score = st.mode === 'timed'
      ? (p.goals + '')
      : (dead ? T('OUT','BARRA') : (p.lives + '♥'));
    html += '<span class="bl-chip' + (i===M.me?' me':'') + (dead?' out':'') + '">' +
      '<span class="d" style="background:linear-gradient(135deg,' + s.a + ',' + s.b + ')"></span>' +
      '<span>' + esc(M.seatMeta[i].name) + '</span>' +
      '<b class="bl-hearts">' + esc(score) + '</b></span>';
  }
  html += '</div>';
  M.ctx.turn.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════════════
   PARTICLES — tiny, transform-cheap, capped.  Drawn on the same canvas.
   ═══════════════════════════════════════════════════════════════════ */
function burst(pt, seat, n){
  if (noMotion()){ return; }
  if (M.fx.length > 120) return;
  for (let i = 0; i < n; i++){
    const a = (i / n) * Math.PI * 2 + (M.st.tick % 7);
    const sp = 2 + (i % 4);
    M.fx.push({ x:pt.x, y:pt.y, vx:Math.cos(a)*sp*C.S, vy:Math.sin(a)*sp*C.S,
                life:1, col:seat.a });
  }
}
function stepFx(dt){
  for (let i = M.fx.length - 1; i >= 0; i--){
    const f = M.fx[i];
    f.x += f.vx * dt; f.y += f.vy * dt;
    f.vx *= 0.9; f.vy *= 0.9;
    f.life -= dt * 2.2;
    if (f.life <= 0) M.fx.splice(i, 1);
  }
  if (M.shake > 0) M.shake = Math.max(0, M.shake - dt * 3);
  for (let e = 0; e < 4; e++) if (M.flash[e] > 0) M.flash[e] = Math.max(0, M.flash[e] - dt * 2.5);
  for (let i = M.goalArrows.length - 1; i >= 0; i--){
    M.goalArrows[i].life -= dt * 1.3;
    if (M.goalArrows[i].life <= 0) M.goalArrows.splice(i, 1);
  }
  for (let i = M.cornerFlash.length - 1; i >= 0; i--){
    M.cornerFlash[i].life -= dt * 2.0;
    if (M.cornerFlash[i].life <= 0) M.cornerFlash.splice(i, 1);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   THE DRAW — interpolate ball/paddle sub-positions by `frac` between the
   last committed tick and the next.  Everything is canvas; no image files.
   ═══════════════════════════════════════════════════════════════════ */
let lastDraw = 0;
function draw(frac){
  if (!UI || !UI.g) return;
  const g = UI.g, st = M.st, side = UI.px * UI.dpr;
  const now = nowMs();
  const dt = lastDraw ? Math.min(0.05, (now - lastDraw) / 1000) : 0.016;
  lastDraw = now;
  if (!noMotion()) stepFx(dt);

  /* backdrop behind the arena (fills the shake margin so no dark gap shows) */
  const bg = g.createLinearGradient(0, 0, 0, side);
  bg.addColorStop(0, '#0B0814'); bg.addColorStop(1, '#070510');
  g.fillStyle = bg; g.fillRect(-40, -40, side + 80, side + 80);

  g.save();
  /* screen shake on a goal */
  if (M.shake > 0 && !noMotion()){
    const s = M.shake * 6 * UI.dpr;
    g.translate((rand01()*2-1)*s, (rand01()*2-1)*s);
  }

  drawArenaFloor(g, side);
  drawGrid(g, side);
  drawGoalMouths(g);          /* recessed coloured goal slots in each wall     */
  drawWalls(g);               /* the glowing jambs / sealed walls              */
  drawCentre(g, side);        /* the centre medallion                          */
  drawGoalFlash(g);
  drawGoalArrows(g);          /* outward arrows where a ball just left         */
  drawDrops(g);
  drawCornerFlashes(g);       /* bursts where a ball just struck a corner      */
  drawServeTelegraph(g, now); /* corner "lighting up" glow for an incoming serve */
  drawPaddles(g, frac);
  drawBalls(g, frac);
  drawParticles(g);

  g.restore();
  /* vignette on top, unshaken */
  const vg = g.createRadialGradient(side/2, side/2, side*0.28, side/2, side/2, side*0.74);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
  g.fillStyle = vg; g.fillRect(0, 0, side, side);
}
/* a cheap deterministic-ish jitter for the shake — cosmetic only, never sim */
let rseed = 12345;
function rand01(){ rseed = (Math.imul(rseed, 1103515245) + 12345) & 0x7fffffff; return rseed / 0x7fffffff; }

/* the arena FLOOR — an inset rounded playfield with a soft radial glow, so the
   play area reads as a distinct premium board rather than a flat rectangle.
   The inset matches the wall margin so the walls sit on the floor's rim. */
function drawArenaFloor(g, side){
  const m = sx(C.WALL_M) * 0.55;              /* inset toward the walls        */
  const r = 18 * UI.dpr;
  g.save();
  roundRect(g, m, m, side - 2*m, side - 2*m, r);
  const fl = g.createRadialGradient(side/2, side/2, side*0.06, side/2, side/2, side*0.72);
  fl.addColorStop(0, '#221A3C'); fl.addColorStop(0.6, '#14102A'); fl.addColorStop(1, '#0C0918');
  g.fillStyle = fl; g.fill();
  /* a faint inner ring rim-light */
  g.lineWidth = 1.5 * UI.dpr; g.strokeStyle = 'rgba(255,255,255,.05)'; g.stroke();
  g.restore();
  /* clip subsequent floor decoration to the playfield */
}
function drawGrid(g, side){
  const m = sx(C.WALL_M) * 0.55, r = 18 * UI.dpr;
  g.save();
  roundRect(g, m, m, side - 2*m, side - 2*m, r); g.clip();
  g.strokeStyle = 'rgba(255,197,66,.055)'; g.lineWidth = 1;
  const n = 12;
  g.beginPath();
  for (let i = 1; i < n; i++){
    const p = Math.round(side * i / n) + 0.5;
    g.moveTo(p, 0); g.lineTo(p, side); g.moveTo(0, p); g.lineTo(side, p);
  }
  g.stroke();
  g.restore();
}
/* the GOAL MOUTHS — the open span of each edge, drawn as a recessed slot that
   glows in the defending player's colour, so all four goals are clearly marked
   and colour-coded. A sealed (knocked-out) edge shows no mouth. */
function drawGoalMouths(g){
  const st = M.st;
  for (let e = 0; e < 4; e++){
    const p = st.pads[e];
    if (!E.alive(p)) continue;                /* sealed edge: no mouth         */
    const s = SEAT[e];
    const b = E.goalBox(e);
    const axisX = C.EDGE_AXIS[e] === 'x';
    /* widen the thin goal-line box into a visible recessed slot toward the rim */
    const depth = sx(C.PAD_GAP + C.PAD_T);
    let x0, y0, x1, y1;
    if (axisX){
      x0 = sx(b.x0); x1 = sx(b.x1);
      if (C.EDGE_OUT[e] > 0){ y0 = sx(b.y0); y1 = y0 + depth; } else { y1 = sx(b.y1); y0 = y1 - depth; }
    } else {
      y0 = sx(b.y0); y1 = sx(b.y1);
      if (C.EDGE_OUT[e] > 0){ x0 = sx(b.x0); x1 = x0 + depth; } else { x1 = sx(b.x1); x0 = x1 - depth; }
    }
    g.save();
    /* the recessed dark slot */
    g.fillStyle = 'rgba(0,0,0,.45)';
    roundRect(g, Math.min(x0,x1), Math.min(y0,y1), Math.abs(x1-x0), Math.abs(y1-y0), 4*UI.dpr);
    g.fill();
    /* a coloured energy line across the mouth (the goal plane) */
    g.strokeStyle = s.a; g.lineWidth = 2.5 * UI.dpr;
    g.shadowColor = s.glow; g.shadowBlur = 12 * UI.dpr;
    g.globalAlpha = 0.9;
    g.beginPath();
    if (axisX){ const gy = sx(C.GOAL_COORD[e]); g.moveTo(sx(b.x0), gy); g.lineTo(sx(b.x1), gy); }
    else       { const gx = sx(C.GOAL_COORD[e]); g.moveTo(gx, sx(b.y0)); g.lineTo(gx, sx(b.y1)); }
    g.stroke();
    g.restore();
  }
}
/* the CENTRE medallion — a subtle focal ring where balls are served, giving the
   arena a spawn-point read like a real arena game. */
function drawCentre(g, side){
  const cx = side/2, cy = side/2, r = side * 0.09;
  g.save();
  g.globalAlpha = 0.5;
  g.strokeStyle = 'rgba(255,197,66,.22)'; g.lineWidth = 1.5 * UI.dpr;
  circle(g, cx, cy, r); g.stroke();
  circle(g, cx, cy, r * 0.5); g.stroke();
  g.globalAlpha = 0.35; g.fillStyle = 'rgba(255,197,66,.10)';
  circle(g, cx, cy, r * 0.16); g.fill();
  g.restore();
}
function drawWalls(g){
  const st = M.st;
  for (let e = 0; e < 4; e++){
    const p = st.pads[e], s = SEAT[e], sealed = !E.alive(p);
    /* jambs (or the whole edge if sealed) glow in the seat colour */
    const jambs = sealed ? [wholeEdgeBox(e)] : E.jambBoxes(e);
    for (const b of jambs){
      const x = sx(b.x0), y = sx(b.y0), w = sx(b.x1)-sx(b.x0), h = sx(b.y1)-sx(b.y0);
      g.save();
      if (sealed){
        /* a plain grey slab with a subtle bevel — clearly "out of play" */
        const gr = g.createLinearGradient(x, y, x + (w||1), y + (h||1));
        gr.addColorStop(0, '#3A3352'); gr.addColorStop(1, '#241E38');
        g.fillStyle = gr;
        roundRect(g, x, y, w, h, 3*UI.dpr); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1; g.stroke();
      } else {
        const grad = g.createLinearGradient(x, y, x + (w||1), y + (h||1));
        grad.addColorStop(0, s.a); grad.addColorStop(1, s.b);
        g.fillStyle = grad;
        g.shadowColor = s.glow; g.shadowBlur = 10*UI.dpr;
        roundRect(g, x, y, w, h, 3*UI.dpr); g.fill();
        /* a bright top highlight for a moulded, premium edge */
        g.shadowBlur = 0; g.globalAlpha = 0.4; g.fillStyle = 'rgba(255,255,255,.5)';
        roundRect(g, x, y, w, Math.max(2, h*0.28) || 2, 2*UI.dpr); g.fill();
      }
      g.restore();
    }
  }
}
function wholeEdgeBox(e){
  const g = C.GOAL_COORD[e], jt = 6 * C.S;
  if (C.EDGE_AXIS[e] === 'x'){
    const y0 = C.EDGE_OUT[e] > 0 ? g - jt : g, y1 = C.EDGE_OUT[e] > 0 ? g : g + jt;
    return { x0:0, x1:C.W, y0, y1 };
  }
  const x0 = C.EDGE_OUT[e] > 0 ? g - jt : g, x1 = C.EDGE_OUT[e] > 0 ? g : g + jt;
  return { x0, x1, y0:0, y1:C.H };
}
function drawGoalFlash(g){
  for (let e = 0; e < 4; e++){
    if (M.flash[e] <= 0) continue;
    const s = SEAT[e], a = M.flash[e];
    const b = E.goalBox(e);
    g.save(); g.globalAlpha = a * 0.8; g.fillStyle = s.a;
    g.shadowColor = s.glow; g.shadowBlur = 22 * UI.dpr;
    const x = sx(b.x0), y = sx(b.y0), w = Math.max(4, sx(b.x1)-sx(b.x0)), h = Math.max(4, sx(b.y1)-sx(b.y0));
    g.fillRect(x - 2, y - 2, w + 4, h + 4);
    g.restore();
  }
}
function drawDrops(g){
  for (const d of M.st.drops){
    const col = PU_COL[d.kind] || '#fff';
    g.save();
    g.translate(sx(d.x), sx(d.y));
    g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 10 * UI.dpr;
    const r = 6 * UI.dpr;
    roundRect(g, -r, -r, r*2, r*2, 3*UI.dpr); g.fill();
    g.fillStyle = 'rgba(0,0,0,.55)'; g.font = (9*UI.dpr) + 'px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(PU_GLYPH[d.kind] || '?', 0, 0.5*UI.dpr);
    g.restore();
  }
}
const PU_COL = { 1:'#FFC542', 2:'#7FD4FF', 3:'#57E39B', 4:'#B79BFF' };
const PU_GLYPH = { 1:'W', 2:'S', 3:'+', 4:'○' };

function drawPaddles(g, frac){
  const st = M.st;
  for (const p of st.pads){
    if (!E.alive(p)) continue;
    const s = SEAT[p.edge];
    /* interpolate: for OUR seat use the predictive ghost (feels attached to
       the thumb); for others, interpolate committed pos toward tpos by frac. */
    let pos;
    if (p.pid === M.me && M.mine.indexOf(M.me) >= 0){
      const upto = st.tick + M.D;
      pos = E.ghost(st, M.me, upto);
    } else {
      pos = p.pos + Math.round((clampToLane(p, p.pos + p.vpos) - p.pos) * frac);
    }
    const box = boxForPos(p, pos);
    const bx = sx(box.x0), by = sx(box.y0), bw = sx(box.x1)-sx(box.x0), bh = sx(box.y1)-sx(box.y0);
    g.save();
    const grad = g.createLinearGradient(bx, by, bx, by + bh);
    grad.addColorStop(0, s.a); grad.addColorStop(1, s.b);
    g.fillStyle = grad;
    g.shadowColor = s.glow; g.shadowBlur = 14 * UI.dpr;
    roundRect(g, bx, by, bw, bh, 6*UI.dpr);
    g.fill();
    /* glossy top highlight along the paddle for a moulded saucer look */
    g.shadowBlur = 0; g.globalAlpha = 0.55; g.fillStyle = 'rgba(255,255,255,.65)';
    const isX = C.EDGE_AXIS[p.edge] === 'x';
    if (isX) roundRect(g, bx+2, by+2, bw-4, Math.max(2, bh*0.32), 3*UI.dpr);
    else     roundRect(g, bx+2, by+2, Math.max(2, bw*0.32), bh-4, 3*UI.dpr);
    g.fill();
    g.globalAlpha = 1;
    if (p.shield > 0){
      g.shadowBlur = 0; g.strokeStyle = 'rgba(183,155,255,.9)'; g.lineWidth = 2*UI.dpr;
      roundRect(g, sx(box.x0)-3, sx(box.y0)-3, sx(box.x1)-sx(box.x0)+6, sx(box.y1)-sx(box.y0)+6, 6*UI.dpr);
      g.stroke();
    }
    g.restore();
  }
}
function clampToLane(p, v){ const lo=p.lo+p.hw, hi=p.hi-p.hw; return v<lo?lo:v>hi?hi:v; }
function boxForPos(p, pos){
  const c = C.PAD_COORD[p.edge], t = C.PAD_T >> 1;
  if (C.EDGE_AXIS[p.edge] === 'x') return { x0:pos-p.hw, x1:pos+p.hw, y0:c-t, y1:c+t };
  return { x0:c-t, x1:c+t, y0:pos-p.hw, y1:pos+p.hw };
}

function drawBalls(g, frac){
  const st = M.st;
  for (const b of st.balls){
    /* interpolate along the ball's velocity for smoothness (visual only) */
    let [vx, vy] = E.velOf(b.di, b.sp);
    if (st.slowT > 0){ vx = Math.trunc(vx*6/10); vy = Math.trunc(vy*6/10); }
    const bx = b.x + Math.round(vx * frac), by = b.y + Math.round(vy * frac);
    const speedT = Math.max(0, Math.min(1, (b.sp - C.SP_START) / (C.SP_HARD - C.SP_START)));
    /* warm tint with speed: gold -> hot */
    const col = mix('#8AE9FF', '#FF7A3C', speedT);
    /* trail */
    g.save();
    for (let k = 3; k >= 1; k--){
      const tx = bx - Math.round(vx * frac) - Math.round(vx * k * 0.18);
      const ty = by - Math.round(vy * frac) - Math.round(vy * k * 0.18);
      g.globalAlpha = 0.10 * k;
      g.fillStyle = col;
      circle(g, sx(tx), sx(ty), sx(C.R) * (1 - k*0.14));
      g.fill();
    }
    g.restore();
    g.save();
    g.fillStyle = '#fff'; g.shadowColor = col; g.shadowBlur = 16 * UI.dpr;
    circle(g, sx(bx), sx(by), sx(C.R)); g.fill();
    g.fillStyle = col; g.globalAlpha = 0.9;
    circle(g, sx(bx), sx(by), sx(C.R) * 0.62); g.fill();
    g.restore();
  }
}
function drawParticles(g){
  for (const f of M.fx){
    g.globalAlpha = Math.max(0, f.life);
    g.fillStyle = f.col;
    circle(g, sx(f.x), sx(f.y), Math.max(1, 3 * UI.dpr * f.life)); g.fill();
  }
  g.globalAlpha = 1;
}

/* ── little canvas helpers ── */
function roundRect(g, x, y, w, h, r){
  r = Math.min(r, w/2, h/2); if (r < 0) r = 0;
  g.beginPath();
  g.moveTo(x+r, y); g.arcTo(x+w, y, x+w, y+h, r); g.arcTo(x+w, y+h, x, y+h, r);
  g.arcTo(x, y+h, x, y, r); g.arcTo(x, y, x+w, y, r); g.closePath();
}
function circle(g, x, y, r){ g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, Math.PI*2); g.closePath(); }
function mix(a, b, t){
  const pa = hx(a), pb = hx(b);
  const r = Math.round(pa[0]+(pb[0]-pa[0])*t), gg = Math.round(pa[1]+(pb[1]-pa[1])*t), bl = Math.round(pa[2]+(pb[2]-pa[2])*t);
  return 'rgb(' + r + ',' + gg + ',' + bl + ')';
}
function hx(c){ return [parseInt(c.slice(1,3),16), parseInt(c.slice(3,5),16), parseInt(c.slice(5,7),16)]; }

/* ═══════════════════════════════════════════════════════════════════
   THE END — the shared winner screen (js/rebbieh.js).
   ═══════════════════════════════════════════════════════════════════ */
function finish(){
  if (M.finished) return;
  M.finished = true;
  const st = M.st, over = st.over || { winner:-1, reason:'end.draw' };
  const won = over.winner === M.me;
  const draw = over.winner < 0;

  /* record */
  if (won) ST.rec.w++; else if (draw) ST.rec.d++; else ST.rec.l++;
  persist();

  /* ── THE PAY, exactly once, under the match id ────────────────────
     IL-BALLUN finished on the podium and paid NOTHING — the podium
     never calls P.ui.result, so the wrap progress.js hangs on it never
     fired, offline or on. Pay here through KARTI_XP.awardPlay
     (idempotent under the match id) and, online on a staked table,
     settle the pot through mp.js's own idempotent door: one winner
     takes it, a dead-level round sends every ante home. */
  const MPX = window.KARTI_MP;
  const staked = !!(M.net && MPX && MPX.MP && MPX.MP.stakeLive);
  const mid = 'ballun:' + (M.net && MPX && MPX.MP && MPX.MP.code ? MPX.MP.code : 'local') +
              ':' + (M.seed >>> 0);
  let pay = null, potRes = null;
  try {
    if (window.KARTI_XP && KARTI_XP.awardPlay){
      const r = KARTI_XP.awardPlay({ game:'ballun', won, draw, id: mid, ranked: staked });
      if (r && r.counted) pay = r;
    }
  } catch(e){}
  try {
    if (window.KARTI_STATS && KARTI_STATS.record)
      KARTI_STATS.record('ballun', { result: won ? 'win' : (draw ? 'draw' : 'loss'), id: mid });
  } catch(e){}
  if (staked && MPX.stakeSettle){
    try { potRes = MPX.stakeSettle(won ? 'win' : (draw ? 'draw' : 'lose')); } catch(e){}
  }

  cue(won ? 'game.win' : (draw ? 'board.draw' : 'game.lose'), { gain:.8 }, true);

  const RB = window.KARTI_REBBIEH;
  const seated = st.pads.filter(p => p.inPlay).map(p => p.pid);
  /* rank by lives desc, then goals asc (fewest conceded) */
  const ranked = seated.slice().sort((a, b) => {
    const pa = st.pads[a], pb = st.pads[b];
    if (pb.lives !== pa.lives) return pb.lives - pa.lives;
    return pa.goals - pb.goals;
  });
  const rows = ranked.map((pid, idx) => {
    const p = st.pads[pid];
    return {
      name: M.seatMeta[pid].name,
      score: st.mode === 'timed' ? (p.goals + ' ' + T('in','fi')) : (p.lives + ' ♥'),
      you: pid === M.me,
      bot: p.bot && pid !== M.me,
      border: SEAT[p.edge].name,
      place: idx + 1
    };
  });

  const backToMenu = () => { leave(); menu(); };
  const title = won ? T('You held on','Żammejt sod')
    : draw ? T('Dead level','Indaqs')
    : T('Knocked out','Waqajt');

  if (RB && RB.show){
    RB.show({
      lang: (window.KARTI_LANG && KARTI_LANG.lang) ? KARTI_LANG.lang() : undefined,
      reduced: noMotion(),
      title,
      subtitle: 'IL-BALLUN',
      rows,
      xp: pay ? { level: pay.level, gained: pay.xp, leveledUp: !!pay.levelled,
                  before: 0, after: pay.levelled ? 1 : 0.7 } : null,
      reward: (pay || potRes) ? {
        xp: pay ? pay.xp : 0,
        chips: pay ? (pay.chips | 0) + (pay.chipsLevel | 0) : 0,
        wonBonus: pay ? pay.wonBonus : 0,
        staked: potRes ? potRes.ante : 0,
        pot: (potRes && potRes.kind === 'win') ? potRes.pot : 0
      } : undefined,
      sound: id => cue(id, { gain:.6 }),
      playAgainLabel: T('Play again','Erġa\' lgħab'),
      onPlayAgain: () => { const o = M.opts, net = M.net; leave(); if (net) menu(); else startAI(o); },
      onLeave: backToMenu
    });
  } else {
    try { K.toast(title); } catch(e){}
    backToMenu();
  }
}

/* ═══════════════════════════════════════════════════════════════════
   LEAVE / TEARDOWN — we own exactly the canvas + our timers.
   ═══════════════════════════════════════════════════════════════════ */
function leave(){
  stopLoop();
  if (UI){
    try { if (UI.ro) UI.ro.disconnect(); } catch(e){}
    try { if (UI.onR) window.removeEventListener('resize', UI.onR); } catch(e){}
  }
  UI = null;
  if (M){ M.dead = true; }
  M = null;
  lastDraw = 0;
}

/* ═══════════════════════════════════════════════════════════════════
   ONLINE — the same input-delay lockstep model as bomba, wired to the
   relay when the server learns the word "ballun".  Until then canStart()
   REFUSES in words and the menu offers the machine.
   ═══════════════════════════════════════════════════════════════════ */
const ONLINE_WHY = T(
  'Online IL-BALLUN is written and ready on this phone — full input-delay lockstep, so no two ' +
  'phones ever disagree about a goal — but the KARTI server does not know the word "ballun" yet, ' +
  'so it will not open a room for it. Nothing here is missing; a few lines on the server are. Until ' +
  'then, IL-BALLUN is you against the machine.',
  'IL-BALLUN onlajn hu miktub u lest fuq dan it-telefon — lockstep sħiħ, mela l-ebda żewġ ' +
  'telefowns ma jaqblu ħażin dwar gol — imma s-server tal-KARTI għadu ma jafx il-kelma ' +
  '"ballun", mela mhux se jiftaħ kamra għaliha. Xejn hawn ma jonqos; ftit linji fuq is-server ' +
  'jonqsu. Sa dakinhar, IL-BALLUN hu int kontra l-magna.');

let moveSubs = [];
/* ── THE CODEC, done here and published to the lobby below ──────────
   The engine's encWire packed forTick into ONE byte ('k') and used two
   field names the shared codec had never been told about — and this
   lobby never published a `wire:{fields}` at all (bomba, serp and briks
   all do), so mp.js fell back to TOMBLA's field list, toWire() refused
   the very first 'tx', and the table was stopped with "a move would not
   fit on the wire" seconds after the serve — every online round, always.
   Both ends of the wire live in this file (sendMove / onlineRemote), so
   the honest fix lives here too: bomba's proven shape — the tick spread
   over three bytes l/h/g (24 bits ≈ days of play), the paddle position
   over two (p/q), the bot flag in `on`. */
const BL_WIRE_FIELDS = ['l', 'h', 'g', 'p', 'q', 'on'];
function encWireX(mv){
  if (!mv) return null;
  const tk = mv.forTick | 0;
  if (tk < 0 || tk > 0xFFFFFF) return null;
  const base = { l: tk & 255, h: (tk >> 8) & 255, g: (tk >> 16) & 255 };
  if (mv.t === 'bot') return Object.assign({ t:'bot', on: mv.on ? 1 : 0 }, base);
  if (mv.t === 'tx'){
    const x = Math.max(0, Math.min(0xFFFF, mv.tpos | 0));
    return Object.assign({ t:'tx', p: (x >> 8) & 255, q: x & 255 }, base);
  }
  if (mv.t === 'bx') return Object.assign({ t:'bx' }, base);
  return null;
}
function decWireX(w){
  if (!w || typeof w.t !== 'string') return null;
  const tk = (((w.g | 0) & 255) << 16) | (((w.h | 0) & 255) << 8) | ((w.l | 0) & 255);
  if (w.t === 'bot') return { t:'bot', forTick: tk, on: (w.on | 0) ? 1 : 0 };
  if (w.t === 'tx')  return { t:'tx',  forTick: tk, tpos: (((w.p | 0) & 255) << 8) | ((w.q | 0) & 255) };
  if (w.t === 'bx')  return { t:'bx',  forTick: tk };
  return null;
}
function sendMove(seat, mv){
  if (!M || !M.net) return;                    /* offline: nothing on the wire */
  const room = M.net.toRoom ? M.net.toRoom[seat] : seat;
  const wire = encWireX(mv);
  if (!wire) return;
  for (const f of moveSubs){ try { f({ seat: room, move: wire, src:'me' }); } catch(e){} }
}
function onlineRemote(seat, wire){
  if (!M || M.dead || !M.net) return;
  const g = M.net.toGame ? M.net.toGame[seat] : seat;
  const mv = decWireX(wire);
  if (!mv || g === undefined) return;
  /* every message advances this seat's WATERMARK: hearing forTick T proves
     every change ≤ T already arrived (ordered transport), so silence below
     T provably means "unchanged" and advance() may run through it. */
  if (M.wm && (M.wm[g] === undefined || mv.forTick > M.wm[g])) M.wm[g] = mv.forTick;
  if (mv.t === 'bot'){ E.setBot(M.st, g, mv.on, mv.forTick); return; }
  if (mv.t === 'tx'){ E.commit(M.st, g, mv.forTick, mv.tpos); return; }
  if (mv.t === 'bx'){ E.commitBash(M.st, g, mv.forTick); }
}
function onlineNote(text, tone){ if (M && M.ctx) P.ui.setNet(M.ctx, text || '', tone || ''); }
function onlineStop(why, tone){
  if (!M || M.dead || !M.ctx) return;
  const ctx = M.ctx;
  stopLoop(); M.finished = true;
  P.ui.setNet(ctx, '', '');
  P.ui.result(ctx, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? T('No game','L-ebda logħba') : T('Cut off','Maqtugħ'),
    why: why || T('The arena stopped.','L-arena waqfet.'),
    quip: T('Nothing was counted.','Xejn ma ngħadd.'),
    buttons: [{ label:T('Back to the rooms','Lura għall-kmamar'), icon:'back', cls:'primary',
      go: () => { const nx = M.net; leave(); if (nx && nx.onLeave) nx.onLeave(); else P.hub(); } }]
  });
}
function onlineStart(cfg){
  cfg = cfg || {};
  const chairs = (cfg.seats || []).filter(Boolean);
  const n = chairs.length;
  if (n < 2 || n > 4) throw new Error('IL-BALLUN: seats 2 to 4, not ' + n);

  const toGame = {}, toRoom = [];
  chairs.forEach((s, g) => {
    const room = (typeof s.seat === 'number') ? s.seat : g;
    toGame[room] = g; toRoom[g] = room;
  });
  const meG = (toGame[cfg.you] !== undefined) ? toGame[cfg.you] : 0;
  const iAmHost = (cfg.you === (cfg.host | 0));
  const lvl = (chairs.map(s => s && s.level).find(v => v)) || 2;
  /* the MODE must be the relay's word or a CONSTANT — never this phone's
     localStorage pref. pref() differs per phone, so falling back to it could
     start 'timed' here and 'lives' there: two different games from one seed. */
  const mode = (cfg.opts && cfg.opts.mode) === 'timed' ? 'timed' : 'lives';

  const bots = [0,0,0,0], aiLvl = [lvl,lvl,lvl,lvl];
  chairs.forEach((s, g) => { bots[g] = (s.kind === 'cpu') ? 1 : 0; });
  const st = E.start({ seed: cfg.seed >>> 0, players: n, mode, bots, aiLvl, me: meG, sealEmpty: true });

  const mine = [meG];
  chairs.forEach((s, g) => { if (s.kind === 'cpu' && iAmHost) mine.push(g); });

  const meta = chairs.map((s, g) => ({
    name: String(s.name || ('#' + (g+1))).slice(0,14),
    own: g === meG ? 'me' : (s.kind === 'cpu' ? 'ai' : 'net'), seated:true
  }));

  beginMatch(st, cfg.seed >>> 0, { players:n, mode, lvl }, Object.assign({}, cfg.net, { host:iAmHost, toGame, toRoom }), meG, mine);
  if (M) M.seatMeta = st.pads.map((p, g) => meta[g] || { name:T('Wall','Ħajt'), own:'ai', seated:false });
  return null;
}

const NET_HOOKS = {
  live:   () => !!(M && !M.dead && !(M.st && M.st.over)),
  phase:  () => !M ? 'idle' : ((M.st && M.st.over) ? 'over' : 'play'),
  seed:   () => (M ? M.seed : null),
  gameId: () => (M ? 'ballun' : null),
  turn:   () => -1,
  over:   () => (M ? M.st.over : null),
  moveCount: () => (M ? M.committed + 1 : 0),
  check:  () => '',
  onMove: fn => {
    const f = info => {
      if (!M || M.dead || !M.net || !info) return;
      const room = M.net.toRoom ? M.net.toRoom[info.seat] : info.seat;
      fn(info.move, { seat: (room == null ? info.seat : room), src: info.src });
    };
    moveSubs.push(f);
    return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); };
  },
  apply: (seat, wire) => onlineRemote(seat, wire),
  seatGone: seat => {
    if (!M || M.dead || !M.net) return;
    const g = M.net.toGame[seat];
    if (g === undefined || !M.st.pads[g]) return;
    /* WHO TAKES THE SEAT OVER, AND WHEN — the desync trap. Each phone hears
       the departure at its OWN local tick, and mp.js will not relay a 'bot'
       move for a seat that was not a cpu chair at start, so there is NO wire
       on which the remaining phones can agree a flip tick. Flipping at a
       local tick (the old code: M.committed + M.D + 1) made every remaining
       phone hand the seat to think() at a DIFFERENT tick — paddles diverge,
       the ball follows, the arena desyncs.
       The deterministic rule, computable identically on every phone from
       what it already knows:
       · while ANOTHER human phone is still in the room, DO NOT flip. The
         departed paddle simply parks — targetAt() holds its last committed
         target forever, which is the same value in every phone's input
         table. Parked is deterministic; think() at a disagreed tick is not.
       · once I am the LAST human in the room there is nobody left to
         disagree with, so the seat may go to the machine at my local tick
         (pure solo from here on). */
    M.gone = M.gone || {};
    M.gone[g] = 1;
    let humans = 0;
    for (let i = 0; i < M.st.pads.length; i++){
      const meta = M.seatMeta && M.seatMeta[i];
      if (!meta || !meta.seated || meta.own === 'ai') continue;
      if (M.gone[i]) continue;
      humans++;                      /* me, plus every net seat still here */
    }
    if (humans <= 1) E.setBot(M.st, g, 1, M.committed + M.D + 1);
    try { K.toast((M.seatMeta[g] && M.seatMeta[g].name || T('A player','Plejer')) + ' — ' + T('gone.','telaq.')); } catch(e){}
  }
};

P.online = P.online || {};
P.online.ballun = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  live: () => NET_HOOKS.live(), hooks: NET_HOOKS
};

/* ═══════════════════════════════════════════════════════════════════
   THE HERO — a little live arena in the menu, drawn with the real look.
   ═══════════════════════════════════════════════════════════════════ */
function heroCanvas(){
  const cv = document.createElement('canvas');
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = 320, h = 150;
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const grad = g.createLinearGradient(0,0,0,h); grad.addColorStop(0,'#241A3E'); grad.addColorStop(1,'#0E0B14');
  g.fillStyle = grad; g.fillRect(0,0,w,h);
  /* a square arena centred, four coloured edges, a ball */
  const s = 120, ox = (w-s)/2, oy = (h-s)/2;
  g.strokeStyle = 'rgba(255,197,66,.08)'; g.lineWidth = 1;
  for (let i=1;i<6;i++){ const p=Math.round(ox+s*i/6)+0.5; g.beginPath(); g.moveTo(p,oy); g.lineTo(p,oy+s); g.moveTo(ox,Math.round(oy+s*i/6)+0.5); g.lineTo(ox+s,Math.round(oy+s*i/6)+0.5); g.stroke(); }
  const cols = SEAT.map(x=>x.a);
  const bars = [ [ox+s*0.3, oy+s-6, s*0.4, 6, cols[0]],
                 [ox+s*0.3, oy, s*0.4, 6, cols[1]],
                 [ox, oy+s*0.3, 6, s*0.4, cols[2]],
                 [ox+s-6, oy+s*0.3, 6, s*0.4, cols[3]] ];
  for (const b of bars){ g.fillStyle = b[4]; g.shadowColor=b[4]; g.shadowBlur=8; g.fillRect(b[0],b[1],b[2],b[3]); }
  g.shadowBlur=0;
  g.fillStyle='#fff'; g.shadowColor='#FF7A3C'; g.shadowBlur=14; g.beginPath(); g.arc(ox+s*0.6, oy+s*0.44, 6, 0, Math.PI*2); g.fill();
  g.shadowBlur=0;
  return cv;
}

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — window.KARTI_BALLUN.lobby, read by js/mp.js's one
   shared lobby.  Modes are VARIANTS the host can switch.  canStart REFUSES
   until the relay learns "ballun" (same honest decision as bomba/serp).
   ═══════════════════════════════════════════════════════════════════ */
const LEVELS = [
  { level:1, name: levelWords(1).n, blurb: T('Reads where the ball is.','Jara fejn hu l-ballun.') },
  { level:2, name: levelWords(2).n, blurb: T('Reads a straight shot.','Jara tir dritt.') },
  { level:3, name: levelWords(3).n, blurb: T('Reads the bounce and aims.','Jara l-qabża u jimmira.') }
];
R.lobby = {
  id:'ballun', name:'Il-Ballun', mt:'Il-Ballun',
  minSeats: 2, maxSeats: 4,
  levels: LEVELS, defaultLevel: 2,
  /* the published field list mp.js's codec carries — see encWireX above.
     Without it the shared codec fell back to tombla's fields and refused
     every ballun move on sight. */
  wire: { fields: BL_WIRE_FIELDS },
  /* one variant per MODE. The relay only whitelists the word; the engine
     reads its meaning ('lives'|'timed') off the broadcast. Both modes seat
     the full 2..4 range. */
  variants: [
    { net:'lives', label:{ en:'Last standing', mt:'L-aħħar wieqaf' }, seats:[2,3,4] },
    { net:'timed', label:{ en:'Two minutes',   mt:'Żewġ minuti' },    seats:[2,3,4] }
  ],
  currentVariant(){
    try {
      const v = window.KARTI_MP && window.KARTI_MP.MP && window.KARTI_MP.MP.variant;
      if (v === 'lives' || v === 'timed') return v;
    } catch(e){}
    return (pref().mode === 'timed') ? 'timed' : 'lives';
  },
  applyVariant(net){ const mode = net === 'timed' ? 'timed' : 'lives'; pref({ mode }); return { variant: mode }; },
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    if (!(window.KARTI_PARTY && window.KARTI_PARTY.online && window.KARTI_PARTY.online.ballun))
      return { ok:false, why: ONLINE_WHY };
    const n = (seatList || []).length;
    if (n < 2) return { ok:false, why: T('Il-Ballun needs at least two.', 'Il-Ballun irid mill-inqas tnejn.') };
    if (n > 4) return { ok:false, why: T('Up to four can play.', 'Sa erbgħa jistgħu jilagħbu.') };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready) return { ok:false, why: unready + (unready > 1
        ? T(' people are not ready yet.', ' persuni għadhom mhux lesti.')
        : T(' person is not ready yet.', ' persuna għadha mhux lesta.')) };
    return { ok:true, why:'' };
  },
  rulesHTML: () =>
    '<p>' + T('Two to four players, one to each edge of a square arena. Slide your paddle along ' +
      'your edge, guard your goal, and knock the ball into everyone else’s.',
      'Minn tnejn sa erbgħa, wieħed ma’ kull tarf ta’ arena kwadra. Iġbed ir-raketta ma’ ' +
      'xifrek, ħares il-lasti tiegħek, u aqbeż il-ballun f’dawk ta’ kulħadd.') + '</p>' +
    '<p>' + T('A ball in your goal costs a life. Lose them all and your edge seals shut. The ball ' +
      'speeds up and multiplies, so a round always ends — last edge standing wins.',
      'Ballun fil-lasti jiswielek ħajja. Itilfhom kollha u t-tarf tiegħek jingħalaq. Il-ballun ' +
      'jgħaġġel u jimmultiplika, mela r-round dejjem jispiċċa — rebbieħ min jibqa’ l-aħħar.') + '</p>' +
    '<p>' + esc(ONLINE_WHY) + '</p>',
  blurb: T('Guard your goal. Bounce the ball into theirs.','Ħares il-lasti. Aqbeż il-ballun f’tagħhom.'),
  myName(){
    try {
      const n = K && K.displayName && K.displayName();
      if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest') return String(n).trim().slice(0,14);
    } catch(e){}
    return T('You','Int');
  },
  start: (seatList, o) => {
    const n = Math.max(2, Math.min(4, (seatList || []).length || 4));
    const lvl = ((seatList || []).map(s => s && s.level).find(v => v)) || 2;
    startAI({ players:n, mode: (o && o.mode) || pref().mode || 'lives', lvl });
  },
  takeback: false
};

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF TILE — one tile on the BOARD shelf.  register() replaces by
   id, so wiring the same descriptor twice costs nothing.
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'ballun', order:29, kind:'board', name:'IL-BALLUN', mt:'Il-Ballun',
  sprite:'bl-t-ballun', status:'live',
  get tag(){
    return T('Guard your goal, knock the ball into everyone else’s. Two to four at once — ' +
             'nobody waits for a turn.',
             'Ħares il-lasti, aqbeż il-ballun f’dawk ta’ kulħadd. Minn tnejn sa erbgħa f’daqqa ' +
             '— ħadd ma jistenna dawra.');
  },
  open: () => menu(),
  seats: { min:2, max:4 },
  levels: LEVELS,
  rulesHTML: () => R.lobby.rulesHTML()
};
R.shelfTile = TILE;
R.open = () => menu();
R.close = () => { leave(); P.hub(); };
if (P.register) P.register(TILE);

/* ── test hooks — inert unless the page is opened with ?pttest ──────── */
try {
  if (String(location.search).indexOf('pttest') >= 0){
    window.__BL_TEST = {
      engine: E,
      M: () => M,
      st: () => (M ? M.st : null),
      UI: () => UI,
      menu, setupAI, startAI, leave, toggleSheet,
      /* start a match this test drives by hand: no rAF, input delay 0 so a
         target set for a tick lands on THAT tick. */
      manual: (opts, seed) => {
        opts = opts || { players:4, mode:'lives', lvl:2 };
        seed = seed || 7;
        const st = E.start({ seed, players:opts.players, mode:opts.mode,
          bots:[0,1,1,1], aiLvl:[opts.lvl,opts.lvl,opts.lvl,opts.lvl], me:0, sealEmpty:false });
        beginMatch(st, seed, opts, null, 0, [0]);
        if (M){ M.D = 0; M.t0 = -1e9; M.lead = 0; }
        return M;
      },
      tick: n => { let g=0; for (let i=0;i<(n|0);i++){ if (!advance()){ if (g++>20) break; i--; } } return M ? M.committed : -1; },
      tickOnce: () => { advance(); return M ? M.committed : -1; },
      setTarget: t => { if (M) M.heldTarget = t | 0; },
      committed: () => (M ? M.committed : -1),
      draw, fitCanvas, hud, finish,
      fps: () => (M ? M.fps.val : 0),
      lobby: R.lobby, tile: TILE,
      remote: (seat, wire) => onlineRemote(seat, wire),
      hooks: NET_HOOKS,
      store: () => ST
    };
  }
} catch(e){}

})();
