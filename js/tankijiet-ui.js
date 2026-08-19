/* ═══════════════════════════════════════════════════════════════════════
   KARTI — IT-TANKIJIET · THE SCREEN                 (js/tankijiet.js is engine)
   ─────────────────────────────────────────────────────────────────────────
   This half draws the arena, samples the two thumbs, and drives the fixed
   simulation tick over input-delay lockstep — the same clock/pipeline as
   js/bomba-ui.js, because the engine is the same shape. It owns the menu,
   the mode/players/map setup step, the canvas game, and the hand-off to the
   shared winner screen (js/rebbieh.js). It authors every player-visible
   string (the engine authors none — lang.js rule).

   ── CONTROL SCHEME: TWIN-STICK (justified) ────────────────────────────────
   Left thumb = DRIVE stick (bottom-left): push it and the hull turns toward
   the push and rolls; distance from centre is throttle, so a gentle nudge
   creeps and a full push charges. Right thumb = AIM+FIRE stick (bottom-
   right): push it to swing the turret that way, and it FIRES while held (the
   cooldown paces the shots). Both sticks live in the bottom corners, OUTSIDE
   the arena, so a thumb never covers the action on a 390-wide phone — the
   single most important touch rule for a shooter. A tap on a stick with no
   drag still registers (aim-stick tap = a single shot; drive-stick tap =
   nothing). Keyboard is wired too (WASD/arrows drive, J/K or ,/. rotate the
   turret, Space fires) for the desk and the test harness.

   Why twin-stick over auto-aim: tanks are about BANKING a shell off a wall
   to reach cover — that is a deliberate aim, not "shoot the nearest", so a
   manual turret is the whole game. Twin-stick keeps both hands busy without
   ever occluding the arena, which move-drag+tap-to-fire cannot promise (the
   tap lands ON the field).

   ── THE LOCKSTEP CLOCK ────────────────────────────────────────────────────
   One rAF loop paces the fixed tick off wall-time and COMMITS a tick only
   when its frame is complete; D (input delay) comes from the engine's
   delayTicks() fed by KARTI_MP.pingStats(); a missing NET input stalls
   (bounded) then predicts (repeat last) — identical on every phone. Between
   ticks the renderer INTERPOLATES sub-positions for 60fps. See bomba-ui for
   the sibling of every function here.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_TANKIJIET;
if (!P || !R || !R.engine) return;

const E = R.engine;
const esc = (K && K.esc) || (s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');
const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;

function noMotion(){
  try {
    if (window.KARTI && KARTI.REDUCED) return true;
    if (document.body && document.body.classList.contains('reduced')) return true;
    return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch(e){ return false; }
}
const nowMs = () => (window.performance && performance.now) ? performance.now() : Date.now();

/* ── sound: EXISTING ids only, through one rate-limited gate ────────── */
let cueAt = 0;
function cue(id, opts, big){
  const S = window.KARTI_SFX;
  if (!S || !S.play) return;
  const now = Date.now();
  if (!big && now - cueAt < 45) return;
  cueAt = Math.max(cueAt, now);
  try { S.play(id, opts); } catch(e){}
}

/* ── seat colours (CSS/canvas only — NO image files) ─────────────────
   a body colour, a lighter turret, a track colour, and a rebbieh border
   id. Eight distinct hues that read on the dark arena. */
const COLS = [
  { a:'#32E0C4', b:'#12B8A0', t:'#0A9', bd:'jade'   },  /* teal   */
  { a:'#FF5A6E', b:'#D93A50', t:'#B22', bd:'ruby'   },  /* red    */
  { a:'#5AA9FF', b:'#3A7FE0', t:'#25C', bd:'ice'    },  /* blue   */
  { a:'#FFC542', b:'#E0A020', t:'#B80', bd:'gold'   },  /* gold   */
  { a:'#B98CFF', b:'#8F5EE0', t:'#63C', bd:'neon'   },  /* violet */
  { a:'#FF9B4A', b:'#E0742A', t:'#B52', bd:'fire'   },  /* orange */
  { a:'#7CE060', b:'#54B838', t:'#390', bd:'jade'   },  /* green  */
  { a:'#E0E6EE', b:'#AEB6C2', t:'#889', bd:'silver' }   /* pale   */
];
const TEAMCOL = [ COLS[0], COLS[1] ];   /* teams paint by team, not seat */

/* power-up glyph colours */
const PUCOL = { 1:'#FF5A6E', 2:'#FFC542', 3:'#5AA9FF', 4:'#7CE060', 5:'#B98CFF' };

/* ═══════════════════════════════════════════════════════════════════
   PERSISTED SETUP — the last picks, on the device (autosave).
   ═══════════════════════════════════════════════════════════════════ */
const PREF_KEY = 'karti_tankijiet';
function pref(patch){
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch(e){}
  if (patch){ Object.assign(p, patch); try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch(e){} }
  return p;
}

const LEVELS = [
  { level:1 }, { level:2 }, { level:3 }
];
function levelWords(l){
  return l === 1 ? { n:T('Rookie','Novell'),  i:T('easy','faċli') }
       : l === 3 ? { n:T('Ace','Ass'),         i:T('hard','iebes') }
                 : { n:T('Regular','Regolari'),i:T('fair','ġust') };
}
function modeWords(m){
  return m === 'teams' ? { n:T('Teams','Timijiet'),        i:T('2 teams, most kills','2 timijiet, l-aktar qtil') }
       : m === 'last'  ? { n:T('Last tank','L-aħħar tank'),i:T('no respawn','bla respawn') }
                       : { n:T('Free-for-all','Kulħadd għal rasu'), i:T('most kills','l-aktar qtil') };
}
function mapWords(id){
  return id === 'kruc'   ? { n:T('The Cross','Is-Salib') }
       : id === 'mithna' ? { n:T('The Mill','Il-Mitħna') }
       : id === 'dwell'  ? { n:T('The Duel','Id-Dwell') }
                         : { n:T('Classic','Klassiku') };
}

/* ═══════════════════════════════════════════════════════════════════
   MODULE STATE — M (the live match runner), UI (the DOM/canvas handles).
   Mirrors bomba-ui's M/UI split exactly.
   ═══════════════════════════════════════════════════════════════════ */
let M = null, UI = null;
let rulesOpen = false;
const TICK_MS = E.TICK_MS;
const LEAD_MS = 900;                 /* countdown before tick 1 */
const moveSubs = [];
function fire(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }

/* ═══════════════════════════════════════════════════════════════════
   CSS — injected once. Identity is all CSS/SVG/canvas, no image files.
   ═══════════════════════════════════════════════════════════════════ */
let cssDone = false;
function injectCSS(){
  if (cssDone) return; cssDone = true;
  const css = `
  .tk-menu .sp-hero,.tk-hero{position:relative;display:flex;align-items:center;justify-content:center;
    height:118px;border-radius:16px;overflow:hidden;background:radial-gradient(120% 120% at 50% 30%,#17202E,#0A0E15);
    border:1px solid rgba(255,255,255,.06);margin:4px 0 10px}
  .tk-hero canvas{display:block}
  .tk-host{display:flex;flex-direction:column;height:100%;min-height:0;touch-action:none;user-select:none;-webkit-user-select:none}
  .tk-hud{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;
    padding:4px 6px;font:600 12px/1.2 system-ui,sans-serif;color:#cfd6e0;min-height:22px}
  .tk-hud .tk-score{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;
    background:rgba(255,255,255,.05)}
  .tk-hud .tk-dot{width:9px;height:9px;border-radius:50%;display:inline-block}
  .tk-hud .tk-time{margin-left:2px;opacity:.85;font-variant-numeric:tabular-nums}
  .tk-arena{position:relative;align-self:center;border-radius:12px;overflow:hidden;
    box-shadow:0 8px 30px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.05);background:#0B0E14}
  .tk-arena canvas{display:block}
  .tk-over{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
  .tk-cd{font:800 62px/1 system-ui,sans-serif;color:#fff;text-shadow:0 4px 18px rgba(0,0,0,.6);opacity:.94}
  .tk-ctrl{position:relative;flex:0 0 auto;display:flex;justify-content:space-between;align-items:flex-end;
    padding:6px 10px 12px;gap:8px;min-height:150px}
  .tk-stick{position:relative;width:130px;height:130px;border-radius:50%;flex:0 0 auto;
    background:radial-gradient(120% 120% at 50% 40%,rgba(255,255,255,.06),rgba(255,255,255,.02));
    border:1px solid rgba(255,255,255,.09);touch-action:none}
  .tk-stick .tk-nub{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;
    background:radial-gradient(120% 120% at 50% 35%,#e9eef6,#aab3c2);box-shadow:0 3px 10px rgba(0,0,0,.5);
    transition:transform .04s linear}
  .tk-stick.aim .tk-nub{background:radial-gradient(120% 120% at 50% 35%,#ffd0d6,#ff7a88)}
  .tk-stick .tk-lbl{position:absolute;left:0;right:0;bottom:8px;text-align:center;font:700 10px/1 system-ui,sans-serif;
    color:rgba(255,255,255,.5);letter-spacing:.08em}
  .tk-stick.reduced .tk-nub{transition:none}
  .tk-rules{position:absolute;left:0;right:0;bottom:0;transform:translateY(102%);transition:transform .28s cubic-bezier(.22,1,.36,1);
    background:#131923;border-top:1px solid rgba(255,255,255,.08);border-radius:16px 16px 0 0;padding:14px 16px 20px;
    z-index:40;max-height:74%;overflow:auto;box-shadow:0 -10px 30px rgba(0,0,0,.4)}
  .tk-rules.open{transform:translateY(0)}
  body.reduced .tk-rules{transition:none}
  .tk-rules-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
  .tk-rules-h h4{margin:0;font:800 16px/1.2 system-ui,sans-serif;color:#fff}
  .tk-rules-x{background:none;border:0;color:#9aa4b2;cursor:pointer;padding:4px}
  .tk-rules-x svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round}
  .tk-rules-b ul{margin:0;padding-left:18px;color:#c6cdd8;font:500 13px/1.6 system-ui,sans-serif}
  .tk-step{display:flex;align-items:center;justify-content:center;gap:14px;margin:2px 0 4px}
  .tk-step .tk-rnd{width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.14);
    background:rgba(255,255,255,.05);color:#fff;font:700 22px/1 system-ui;cursor:pointer}
  .tk-step .tk-rnd:disabled{opacity:.35}
  .tk-step .v{min-width:96px;text-align:center;font:800 26px/1 system-ui;color:#fff}
  .tk-step .v i{display:block;font:600 11px/1.4 system-ui;color:#9aa4b2;font-style:normal;margin-top:3px}
  .tk-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px;margin:2px 0 4px}
  .tk-opt{padding:10px 8px;border-radius:12px;border:1px solid rgba(255,255,255,.1);
    background:rgba(255,255,255,.04);color:#dfe4ea;cursor:pointer;text-align:center}
  .tk-opt.on{border-color:#32E0C4;background:rgba(50,224,196,.12);color:#fff}
  .tk-opt b{display:block;font:700 14px/1.2 system-ui}
  .tk-opt i{display:block;font:500 11px/1.3 system-ui;font-style:normal;color:#9aa4b2;margin-top:3px}
  .tk-lbl{font:700 11px/1.2 system-ui;letter-spacing:.06em;text-transform:uppercase;color:#8b95a3;margin:12px 2px 4px}
  @media (max-width:360px){ .tk-stick{width:112px;height:112px} .tk-stick .tk-nub{width:48px;height:48px;margin:-24px 0 0 -24px} }
  @media (orientation:landscape) and (max-height:520px){ .tk-ctrl{min-height:120px} .tk-stick{width:108px;height:108px} }
  `;
  const el = document.createElement('style'); el.id = 'tk-style'; el.textContent = css;
  document.head.appendChild(el);
}

/* ═══════════════════════════════════════════════════════════════════
   HERO — a tiny live arena drawn once for the menu. Decorative.
   ═══════════════════════════════════════════════════════════════════ */
function heroCanvas(){
  const cv = document.createElement('canvas');
  const w = 240, h = 108, dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr);
  cv.style.width = w+'px'; cv.style.height = h+'px';
  const g = cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0);
  const grd = g.createRadialGradient(w/2,h*0.32,0,w/2,h*0.5,w*0.7);
  grd.addColorStop(0,'#17202E'); grd.addColorStop(1,'#0A0E15');
  g.fillStyle = grd; g.fillRect(0,0,w,h);
  const cell = 16;
  /* a couple of walls */
  g.fillStyle = '#2A3446';
  for (const [c,r] of [[3,1],[3,2],[10,3],[11,3]]) g.fillRect(20+c*cell, 8+r*cell, cell-2, cell-2);
  /* three tanks aiming inward, a shell mid-flight */
  drawHeroTank(g, 44, 40, 0.6, COLS[0]);
  drawHeroTank(g, 196, 40, 3.6, COLS[1]);
  drawHeroTank(g, 120, 86, 4.9, COLS[3]);
  /* a shell + trail */
  g.strokeStyle = 'rgba(255,197,66,.5)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(70,46); g.lineTo(110,52); g.stroke();
  g.fillStyle = '#FFC542'; g.beginPath(); g.arc(112,52,3,0,6.2832); g.fill();
  return cv;
}
function drawHeroTank(g, x, y, ang, col){
  g.save(); g.translate(x,y); g.rotate(ang);
  g.fillStyle = col.b; roundRect(g,-13,-11,26,22,5); g.fill();
  g.fillStyle = col.a; roundRect(g,-11,-9,22,18,4); g.fill();
  g.fillStyle = col.t; g.fillRect(0,-3,18,6);
  g.beginPath(); g.arc(0,0,7,0,6.2832); g.fillStyle = col.a; g.fill();
  g.restore();
}
function roundRect(g,x,y,w,h,r){
  r = Math.min(r, w/2, h/2);
  g.beginPath();
  g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r);
  g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath();
}

/* ═══════════════════════════════════════════════════════════════════
   THE RULES (bilingual, engine authors none)
   ═══════════════════════════════════════════════════════════════════ */
function rulesFor(){
  return [
    T('Drive with the left thumb, aim and fire with the right. Both sticks sit off the arena so your thumbs never cover the fight.',
      'Suq bis-saba’ l-kbir tax-xellug, immira u spara bil-lemin. Iż-żewġ stikek jinsabu barra l-arena biex is-swaba’ qatt ma jgħattu l-ġlieda.'),
    T('Shells travel and BANK off walls up to twice — line up a bounce to hit a tank behind cover.',
      'Il-balal jivvjaġġaw u jaqbżu mal-ħitan sa darbtejn — allinja bounce biex tolqot tank wara kenn.'),
    T('One clean hit kills. Grab power-ups by driving over them: multi-shot, rapid fire, a shield, a speed boost, and a bouncing/piercing shell.',
      'Daqqa waħda nadifa toqtol. Aqbad il-power-ups billi tgħaddi fuqhom: multi-shot, spar mgħaġġel, tarka, spinta ta’ ħeffa, u balla li taqbeż/tinfed.'),
    T('Free-for-all: most kills wins. Teams: two sides, most kills wins. Last tank: no respawn, be the one left.',
      'Kulħadd għal rasu: l-aktar qtil jirbaħ. Timijiet: żewġ naħat, l-aktar qtil jirbaħ. L-aħħar tank: bla respawn, kun dak li jibqa’.')
  ];
}

/* ═══════════════════════════════════════════════════════════════════
   THE ENTRY MENU — minimal: PLAY ONLINE / PLAY WITH AI / How to play.
   ═══════════════════════════════════════════════════════════════════ */
function menu(){
  injectCSS(); P.show();
  stopLoop(); M = null; UI = null;
  const el = P.ui.screenEl();
  el.innerHTML =
    '<div class="pt-wrap tk-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="tk-back" aria-label="'+esc(T('Back','Lura'))+'">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>' +
      '<h2>TANKIJIET</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="tk-hero" id="tk-hero" aria-hidden="true"></div>' +
      '<p class="blurb">' +
        T('Four to eight tanks in one walled arena, all at once. Drive, aim, and bank a shell off the wall to catch a tank behind cover. Nobody waits for a turn.',
          'Minn erbgħa sa tmien tankijiet f’arena waħda bil-ħitan, kollha f’daqqa. Suq, immira, u aqbeż balla mal-ħajt biex taqbad tank wara kenn. Ħadd ma jistenna dawra.') +
      '</p>' +
      '<div class="tk-modes" style="display:grid;gap:9px;margin-top:6px">' +
        '<button class="btn primary" id="tk-online">'+ico('globe')+' '+esc(T('Play online','Ilgħab onlajn'))+'</button>' +
        '<button class="btn ghost" id="tk-ai">'+ico('dice')+' '+esc(T('Play with the machine','Ilgħab mal-magna'))+'</button>' +
        '<button class="btn ghost" id="tk-rulesbtn">'+ico('book')+' '+esc(T('How to play','Kif tilgħab'))+'</button>' +
      '</div>' +
    '</div>' +
    '<div class="tk-rules" id="tk-menurules" aria-hidden="true">' +
      '<div class="tk-rules-h"><h4>TANKIJIET — '+esc(T('the rules','ir-regoli'))+'</h4>' +
        '<button class="tk-rules-x" id="tk-menurules-x" aria-label="'+esc(T('Close','Agħlaq'))+'">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="tk-rules-b"><ul>'+rulesFor().map(r=>'<li>'+r+'</li>').join('')+'</ul></div>' +
    '</div>' +
    '</div>';
  const hero = el.querySelector('#tk-hero');
  if (hero) hero.appendChild(heroCanvas());
  el.querySelector('#tk-back').onclick = () => { cue('ui.back',{gain:.7}); P.hub(); };
  el.querySelector('#tk-online').onclick = () => { cue('ui.tap',{gain:.7}); goOnline(); };
  el.querySelector('#tk-ai').onclick = () => { cue('ui.tap',{gain:.7}); setup(); };
  const rules = el.querySelector('#tk-menurules');
  const openRules = o => {
    rules.classList.toggle('open', o);
    rules.setAttribute('aria-hidden', o ? 'false' : 'true');
    cue(o ? 'ui.sheet' : 'ui.back', { gain:.8 });
  };
  el.querySelector('#tk-rulesbtn').onclick = () => openRules(!rules.classList.contains('open'));
  el.querySelector('#tk-menurules-x').onclick = () => openRules(false);
}

/* the online door — honest until the relay learns the word (see contract) */
function goOnline(){
  if (P.online && P.online.tankijiet && P.openLobby){
    try { P.openLobby('tankijiet'); return; } catch(e){}
  }
  try { if (K && K.toast) K.toast(ONLINE_WHY); else alert(ONLINE_WHY); } catch(e){}
  setup();   /* fall through to vs-machine, the honest offer */
}

/* ═══════════════════════════════════════════════════════════════════
   SETUP STEP — mode, players, map. One tap deeper than the menu.
   ═══════════════════════════════════════════════════════════════════ */
function setup(){
  injectCSS(); P.show();
  const el = P.ui.screenEl();
  const p = pref();
  let mode = E.MODES.indexOf(p.mode) >= 0 ? p.mode : 'ffa';
  let seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, p.seats || 4));
  let lvl = p.lvl || 2;
  let map = E.MAPS[p.map] ? p.map : 'klassiku';

  function maxForMap(id){ return Math.min(E.MAX_SEATS, E.parseMap(E.MAPS[id]).spawns.length); }

  function paint(){
    const capMax = maxForMap(map);
    if (seats > capMax) seats = capMax;
    if (mode === 'teams' && (seats & 1)) seats = Math.max(E.MIN_SEATS, seats - 1);   /* even for teams */
    el.innerHTML =
      '<div class="pt-wrap tk-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="tk-back" aria-label="'+esc(T('Back','Lura'))+'">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>' +
        '<h2>'+esc(T('Set up the battle','Ħejji l-battalja'))+'</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<div class="tk-hero" id="tk-hero" aria-hidden="true"></div>' +
        '<div class="tk-lbl">'+esc(T('Mode','Mod'))+'</div>' +
        '<div class="tk-opts" id="tk-mode">' +
          E.MODES.map(m => { const w = modeWords(m);
            return '<button class="tk-opt'+(mode===m?' on':'')+'" data-m="'+m+'"><b>'+esc(w.n)+'</b><i>'+esc(w.i)+'</i></button>'; }).join('') +
        '</div>' +
        '<div class="tk-lbl">'+esc(T('Tanks','Tankijiet'))+'</div>' +
        '<div class="tk-step">' +
          '<button class="tk-rnd" id="tk-s-dn"'+(seats<=E.MIN_SEATS?' disabled':'')+' aria-label="'+esc(T('Fewer','Inqas'))+'">&minus;</button>' +
          '<span class="v">'+seats+'<i>'+esc(T('tanks','tankijiet'))+'</i></span>' +
          '<button class="tk-rnd" id="tk-s-up"'+(seats>=capMax?' disabled':'')+' aria-label="'+esc(T('More','Aktar'))+'">+</button>' +
        '</div>' +
        '<p class="blurb" style="margin:2px 2px 6px">'+esc(T('You, and the rest are the machine.','Int, u l-bqija huma l-magna.'))+'</p>' +
        '<div class="tk-lbl">'+esc(T('Arena','Arena'))+'</div>' +
        '<div class="tk-opts" id="tk-map">' +
          E.MAP_ORDER.map(id => { const w = mapWords(id), cap = maxForMap(id);
            return '<button class="tk-opt'+(map===id?' on':'')+'" data-map="'+id+'"><b>'+esc(w.n)+'</b><i>'+esc(T('up to ','sa ')+cap)+'</i></button>'; }).join('') +
        '</div>' +
        '<div class="tk-lbl">'+esc(T('How hard the machine is','Kemm hi iebsa l-magna'))+'</div>' +
        '<div class="tk-opts" id="tk-lvl">' +
          LEVELS.map(L => { const w = levelWords(L.level);
            return '<button class="tk-opt'+(lvl===L.level?' on':'')+'" data-lvl="'+L.level+'"><b>'+esc(w.n)+'</b><i>'+esc(w.i)+'</i></button>'; }).join('') +
        '</div>' +
        '<div class="pt-acts" style="margin-top:18px;display:grid;gap:9px">' +
          '<button class="btn primary" id="tk-go">'+esc(T('Start — you vs '+(seats-1)+' machine'+(seats-1===1?'':'s'),'Ibda — int kontra '+(seats-1)+' magn'+(seats-1===1?'a':'i')))+'</button>' +
        '</div><div style="height:12px"></div>' +
      '</div></div>';
    const hero = el.querySelector('#tk-hero'); if (hero) hero.appendChild(heroCanvas());
    el.querySelector('#tk-back').onclick = () => { cue('ui.back',{gain:.7}); menu(); };
    el.querySelector('#tk-mode').addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-m]'); if(!b) return; mode = b.getAttribute('data-m'); cue('ui.tap',{gain:.6}); paint(); });
    el.querySelector('#tk-map').addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-map]'); if(!b) return; map = b.getAttribute('data-map'); cue('ui.tap',{gain:.6}); paint(); });
    el.querySelector('#tk-lvl').addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-lvl]'); if(!b) return; lvl = +b.getAttribute('data-lvl'); cue('ui.tap',{gain:.6}); paint(); });
    const dn = el.querySelector('#tk-s-dn'), up = el.querySelector('#tk-s-up');
    const stepSeat = d => { let n = seats + d; if (mode==='teams') n = seats + d*2; if (n>=E.MIN_SEATS && n<=capMax){ seats=n; paint(); } };
    if (dn) dn.onclick = () => stepSeat(-1);
    if (up) up.onclick = () => stepSeat(1);
    el.querySelector('#tk-go').onclick = () => { pref({ mode, seats, lvl, map }); newGame({ mode, seats, lvl, map }); };
  }
  paint();
}

/* ═══════════════════════════════════════════════════════════════════
   THE MATCH RUNNER — startMatch builds M (mirrors bomba-ui).
   ═══════════════════════════════════════════════════════════════════ */
function startMatch(o, seed, net){
  o = o || {};
  const md = E.MAPS[o.map] || E.MAPS.klassiku;
  const seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, o.seats || 4));
  M = {
    opts: o,
    seed: (seed == null ? E.freshSeed() : seed) | 0,
    st: null,
    D: 2,
    buf: {},                 /* tick -> {bytes:[], have:{}, n} */
    committed: -1,
    lastSent: {},
    me: 0, mine: [], meta: [],
    net: net || null,
    drive: { on:false, dx:0, dy:0 },     /* left stick vector (screen px)     */
    aim:   { on:false, dx:0, dy:0, fire:false },  /* right stick             */
    key:   { turn:0, throttle:0, aimTurn:0, fire:false },
    heldTurn:0, heldThrottle:0, heldAim:0, wantFire:false,
    prev: null,              /* last tick's snapshot for interpolation        */
    dead:false, raf:0, t0:0, ledSaid:-1, finished:false,
    stall:0, lead:LEAD_MS,
    fps:{ n:0, at:0, val:0 },
    /* ── CAMERA (pure render) ──────────────────────────────────────────
       Eased world→screen scroll that keeps the LOCAL player framed. Lives
       only in the renderer; it never feeds a tick, so the lockstep hash is
       untouched. camX/camY = world-pixel offset of the view's top-left;
       camReady flags the first snap so the opening frame is not eased from
       the origin. camLast keeps the last good target so a dead/spectating
       local tank holds the view on the action instead of jumping home. */
    camX:0, camY:0, camReady:false, camLastX:0, camLastY:0, camT:0
  };
  M.st = E.newMatch({ map:md, mode:o.mode, seats, humans: net ? undefined : 1, lvl:o.lvl }, M.seed);
  M.prev = snapshot(M.st);
  return M;
}

/* a light snapshot of positions/headings for interpolation between ticks */
function snapshot(st){
  return {
    tanks: st.tanks.map(t => ({ x:t.x, y:t.y, hdg:t.hdg, turret:t.turret, alive:t.alive })),
    shells: st.shells.map(s => ({ id:s.id, x:s.x, y:s.y, h:s.h }))
  };
}

/* ═══════════════════════════════════════════════════════════════════
   INPUT DELAY, MEASURED — D from delayTicks() fed by mp.js pingStats.
   ═══════════════════════════════════════════════════════════════════ */
function measureD(){
  if (!M) return 2;
  if (!M.net) return E.delayTicks(0, 0);
  try {
    const MPX = window.KARTI_MP;
    if (MPX && MPX.pingStats){
      const s = MPX.pingStats();
      if (s && s.n >= 2 && s.med != null){
        const jit = (s.worst != null && s.best != null) ? (s.worst - s.best) : 30;
        return E.delayTicks(s.med, jit);
      }
    }
  } catch(e){}
  return E.delayTicks(120, 40);
}

/* buffer slot for a tick */
function slot(tick){
  let s = M.buf[tick];
  if (!s) s = M.buf[tick] = { bytes: new Array(M.st.tanks.length).fill(null), have:{}, n:0 };
  return s;
}
function putInput(tick, seat, byte){
  if (tick <= M.committed) return;
  const s = slot(tick);
  if (s.have[seat]) return;
  s.bytes[seat] = byte | 0; s.have[seat] = 1; s.n++;
}

/* ═══════════════════════════════════════════════════════════════════
   THE CLOCK — one rAF loop; commit a tick only when its frame is whole.
   ═══════════════════════════════════════════════════════════════════ */
const MAX_CATCHUP = 6;
const STALL_CAP = 8;
function stopLoop(){ if (M && M.raf){ cancelAnimationFrame(M.raf); M.raf = 0; } }
function startLoop(){
  if (!M || M.raf) return;
  M.D = measureD();
  M.t0 = nowMs() + M.lead;
  const stepFn = t => { if (!M || M.dead) return; M.raf = requestAnimationFrame(stepFn); frame(t); };
  M.raf = requestAnimationFrame(stepFn);
}

function frame(t){
  const now = (t == null) ? nowMs() : t;
  if (now < M.t0){
    const left = M.t0 - now, beat = Math.ceil(left / 800);
    if (beat !== M.ledSaid){ M.ledSaid = beat; const S = window.KARTI_SFX; if (S && S.note){ try { S.note(4 - beat); } catch(e){} } paintCountdown(beat); }
    draw(0); meter(now); return;
  }
  if (M.ledSaid !== 0){ M.ledSaid = 0; paintCountdown(0); cue('game.start', { gain:.85 }, true); }
  if (M.finished){ draw(1); meter(now); return; }

  const want = Math.floor((now - M.t0) / TICK_MS) + 1;
  if (want - (M.committed + 1) > MAX_CATCHUP){
    M.t0 = now - ((M.committed + 1) * TICK_MS);
  } else {
    let guard = 0;
    while (M.committed + 1 <= want && guard++ < MAX_CATCHUP){ if (!advance()) break; }
  }
  const frac = M.finished ? 1 : Math.max(0, Math.min(1, (now - M.t0) / TICK_MS - (M.committed + 1)));
  draw(noMotion() ? 1 : frac);
  meter(now);
}
function meter(now){ const f = M.fps; f.n++; if (!f.at) f.at = now; else if (now - f.at >= 1000){ f.val = Math.round(f.n*1000/(now-f.at)); f.n = 0; f.at = now; } }

/* ═══════════════════════════════════════════════════════════════════
   ADVANCE ONE TICK — the lockstep heart (sibling of bomba-ui.advance).
   ═══════════════════════════════════════════════════════════════════ */
function advance(){
  const st = M.st;
  const N = M.committed + 1;

  commitLocal(N + M.D);

  const s = slot(N);
  const need = [];
  for (let i = 0; i < st.tanks.length; i++){
    if (s.have[i]) continue;
    const tk = st.tanks[i];
    if (M.mine.indexOf(i) >= 0){
      if (tk.own === 'ai') putInput(N, i, E.aiInput(st, i));
      else putInput(N, i, 0);
    } else need.push(i);
  }
  if (need.length){
    M.stall++;
    if (M.stall < STALL_CAP) return false;
    for (const i of need) putInput(N, i, E.predictInput(st.tanks[i]));
  }
  M.stall = 0;

  const bytes = M.buf[N].bytes.slice();
  const before = { alive: st.tanks.map(t => t.alive), cover: st.cover.slice(), fx: st.fx.length };
  M.prev = snapshot(st);
  E.step(st, bytes);
  M.committed = N;
  delete M.buf[N];
  afterStep(before);
  return true;
}

/* sample OUR seat and commit its byte for a future tick, then ship it */
function commitLocal(tick){
  if (tick <= M.committed) return;
  const me = M.me;
  if (M.mine.indexOf(me) < 0) return;
  const tk = M.st.tanks[me];
  let byte = 0;
  if (tk && tk.alive){
    const inp = sampleLocal(tk);
    byte = E.encodeInput(inp);
  }
  commitByte(tick, me, byte);
}
function commitByte(tick, seat, byte){
  putInput(tick, seat, byte);
  M.lastSent[seat] = byte;
  say(seat, tick, byte);
}

/* turn the two thumbs (or keys) into an engine input for this tank.
   Drive stick: its angle picks a target hull heading; we emit a turn
   toward it and throttle by whether the stick is pushed. Aim stick:
   its angle picks a target turret heading; turn toward it and fire while
   pushed. This keeps the WIRE as the engine's tiny per-tick byte. */
function sampleLocal(tk){
  let turn = 0, throttle = 0, aim = 0, fire = false;
  /* DRIVE */
  if (M.drive.on && (M.drive.dx || M.drive.dy)){
    const mag = Math.abs(M.drive.dx) + Math.abs(M.drive.dy);
    if (mag > 8){
      const want = E.dirIndexFromDelta(M.drive.dx, M.drive.dy);   /* screen +y = down = engine +y */
      turn = shortTurnScreen(tk.hdg, want);
      throttle = 1;
    }
  } else if (M.key.throttle){ throttle = M.key.throttle; turn = M.key.turn; }
  else if (M.key.turn){ turn = M.key.turn; }
  /* AIM + FIRE */
  if (M.aim.on && (M.aim.dx || M.aim.dy)){
    const mag = Math.abs(M.aim.dx) + Math.abs(M.aim.dy);
    if (mag > 6){
      const want = E.dirIndexFromDelta(M.aim.dx, M.aim.dy);
      aim = shortTurnScreen(tk.turret, want);
      fire = true;
    } else if (M.aim.fire){ fire = true; }
  } else {
    if (M.key.aimTurn) aim = M.key.aimTurn;
    if (M.key.fire) fire = true;
  }
  if (M.wantFire){ fire = true; }      /* a discrete tap-fire */
  return { turn, throttle, aim, fire };
}
/* short turn on the engine circle where screen +y is engine +y (both down) */
function shortTurnScreen(cur, want){
  let d = (want - cur) & E.HDG_MASK;
  if (d === 0) return 0;
  return d < 128 ? 1 : -1;
}

/* react to what a tick changed — sounds + HUD, on CHANGE only */
function afterStep(before){
  const st = M.st;
  let iDied = false, someDied = false, shellSpawn = false, coverBroke = false, pick = false;
  for (let i = 0; i < st.tanks.length; i++){
    if (before.alive[i] && !st.tanks[i].alive){ someDied = true; if (i === M.me) iDied = true; }
  }
  for (let i = 0; i < st.cover.length; i++){ if (before.cover[i] && !st.cover[i]){ coverBroke = true; break; } }
  /* a fresh muzzle or boom this tick? read the fx list tail */
  for (const f of st.fx){ if (f.born === st.tick - 1){ if (f.kind === 'muzzle') shellSpawn = true; if (f.kind === 'pick') pick = true; } }
  if (shellSpawn) cue('duel.attack', { gain:.4 });
  if (coverBroke) cue('duel.hit', { gain:.35 });
  if (pick) cue('ui.reward', { gain:.6 });
  if (someDied){
    cue(iDied ? 'duel.destroy' : 'piece.capture', { gain: iDied ? .85 : .4 }, iDied);
    hud();
  }
  M.wantFire = false;    /* a tap-fire is spent once it reaches a tick */
  if (!M.finished && E.over(st)) finish();
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — say() ships one byte; onlineRemote drops a peer's byte in.
   The relay carries {t:'in', k:tick, b:byte} — three small ints.
   ═══════════════════════════════════════════════════════════════════ */
function say(seat, tick, byte){
  if (!M || !M.net) return;
  fire(moveSubs, { seat, move: { t:'in', k:tick, b:byte | 0 }, src:'local' });
}
function onlineRemote(seat, wire){
  if (!M || M.dead || !M.net) return null;
  const g = M.net.toGame ? M.net.toGame[seat] : seat;
  if (g === undefined || !M.st.tanks[g]) return null;
  if (M.mine.indexOf(g) >= 0) return null;
  const mv = wire;
  if (!mv || mv.t !== 'in') return null;
  putInput(mv.k | 0, g, mv.b | 0);
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   THE CANVAS — fit on mount/resize only (the one layout read).
   ═══════════════════════════════════════════════════════════════════ */
/* Choose a cell size so a tank reads clearly, then let the VIEW (canvas)
   be the available area and the WORLD (full arena) be cell×cols/rows. When
   the world is larger than the view the camera scrolls to keep the local
   tank framed; when it is smaller the view just shows all of it, centred.
   This is what turns "the whole arena is shrunk to fit" (no follow) into a
   real follow — a pure render/layout choice, nothing the sim sees. */
const CAM_MIN_CELL = 30;   /* px per cell we aim for so tanks stay legible   */
const CAM_MAX_CELL = 46;   /* don't zoom in so far a small arena over-scrolls */
function fitCanvas(){
  if (!UI || !UI.cv || !UI.arena) return;
  const mp = M.st.map, host = UI.host;
  const ctrlH = UI.ctrl ? UI.ctrl.offsetHeight : 150;
  const hudH = UI.hud ? UI.hud.offsetHeight : 22;
  const availW = Math.max(160, host.clientWidth - 8);
  const availH = Math.max(160, host.clientHeight - ctrlH - hudH - 18);
  /* the cell that would fit the whole arena in the view (the old behaviour) */
  const fitCell = Math.min(availW / mp.cols, availH / mp.rows);
  /* aim for a legible cell, but never below what fits (so we never leave a
     gap around a big arena), and cap so a tiny arena isn't over-zoomed */
  let cell = Math.max(fitCell, CAM_MIN_CELL);
  cell = Math.min(cell, CAM_MAX_CELL);
  cell = Math.max(8, Math.floor(cell));
  const worldW = cell * mp.cols, worldH = cell * mp.rows;
  /* the visible view = the available box, but never bigger than the world */
  const w = Math.min(worldW, Math.floor(availW));
  const h = Math.min(worldH, Math.floor(availH));
  UI.cell = cell; UI.w = w; UI.h = h; UI.worldW = worldW; UI.worldH = worldH;
  UI.arena.style.width = w + 'px'; UI.arena.style.height = h + 'px';
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const pxW = Math.round(w*dpr), pxH = Math.round(h*dpr);
  if (UI.cv.width !== pxW || UI.cv.height !== pxH){ UI.cv.width = pxW; UI.cv.height = pxH; }
  UI.dpr = dpr; UI.g2.setTransform(dpr,0,0,dpr,0,0);
  UI.dirtyBg = true;
  M.camReady = false;   /* re-frame after any resize/zoom change */
}

/* the static background (walls + floor) — painted to an offscreen buffer
   only when size changes, then blitted each frame (compositor-friendly). */
function paintBg(){
  const mp = M.st.map, cell = UI.cell;
  if (!UI.bg){ UI.bg = document.createElement('canvas'); }
  const dpr = UI.dpr;
  /* the background is the WHOLE arena (world-sized); the camera blits the
     slice under the view each frame, so it is painted once per resize. */
  const W = UI.worldW || UI.w, H = UI.worldH || UI.h;
  UI.bg.width = Math.round(W*dpr); UI.bg.height = Math.round(H*dpr);
  const g = UI.bg.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0);
  const grd = g.createRadialGradient(W/2, H*0.36, 0, W/2, H/2, W*0.75);
  grd.addColorStop(0,'#141B27'); grd.addColorStop(1,'#0A0E15');
  g.fillStyle = grd; g.fillRect(0,0,W,H);
  /* subtle floor grid */
  g.strokeStyle = 'rgba(255,255,255,.03)'; g.lineWidth = 1;
  for (let c=1;c<mp.cols;c++){ g.beginPath(); g.moveTo(c*cell+.5,0); g.lineTo(c*cell+.5,H); g.stroke(); }
  for (let r=1;r<mp.rows;r++){ g.beginPath(); g.moveTo(0,r*cell+.5); g.lineTo(W,r*cell+.5); g.stroke(); }
  /* solid walls: a raised steel block */
  for (let r=0;r<mp.rows;r++) for (let c=0;c<mp.cols;c++){
    if (!mp.wall[r*mp.cols+c]) continue;
    const x=c*cell, y=r*cell;
    g.fillStyle = '#39435A'; roundRect(g,x+.5,y+.5,cell-1,cell-1,Math.max(2,cell*0.14)); g.fill();
    g.fillStyle = '#4A5670'; roundRect(g,x+1.5,y+1.5,cell-3,cell*0.42,Math.max(1,cell*0.1)); g.fill();
  }
  UI.dirtyBg = false;
}

/* ═══════════════════════════════════════════════════════════════════
   DRAW — interpolate sub-positions by frac in [0,1] for smooth 60fps.
   ═══════════════════════════════════════════════════════════════════ */
/* ── THE CAMERA (render-only) ──────────────────────────────────────────
   Resolve the LOCAL player's tank (M.me — the human seat in vs-AI, the
   turn's instance in pass-the-phone/hot seat, this client's own seat
   online) and ease the view so that tank stays framed. If our tank is
   dead/spectating we hold on its last live position (or spawn), never the
   origin. Returns the view's top-left in world px; clamped to arena. This
   is called from draw() only and mutates M.cam* only — the sim never reads
   it, so the lockstep hash is unaffected. */
function localTank(st){
  const me = (M && typeof M.me === 'number') ? M.me : 0;
  return st.tanks[me] || st.tanks[0] || null;
}
function updateCamera(frac, dtMs){
  const st = M.st, cell = UI.cell, SUB = E.SUB;
  const worldW = UI.worldW || UI.w, worldH = UI.worldH || UI.h;
  const maxX = Math.max(0, worldW - UI.w), maxY = Math.max(0, worldH - UI.h);
  const tk = localTank(st);
  /* target the local tank's interpolated centre; fall back to its last
     known spot, then its spawn cell, then arena centre. */
  let tx, ty;
  if (tk && tk.alive){
    const p = M.prev && M.prev.tanks[tk.seat];
    const ix = p ? p.x + (tk.x - p.x)*frac : tk.x;
    const iy = p ? p.y + (tk.y - p.y)*frac : tk.y;
    tx = (ix / SUB) * cell; ty = (iy / SUB) * cell;
    /* a gentle look-ahead in the DRIVE direction reads nicely when scrolling */
    const la = cell * 1.1;
    tx += (E.dirX(tk.hdg) / E.DIR_U) * la;
    ty += (E.dirY(tk.hdg) / E.DIR_U) * la;
    M.camLastX = tx; M.camLastY = ty;
  } else if (tk && (tk.x != null)){
    tx = (tk.x / SUB) * cell; ty = (tk.y / SUB) * cell;
  } else if (M.camLastX || M.camLastY){
    tx = M.camLastX; ty = M.camLastY;
  } else if (tk){
    tx = (tk.spawnCol + 0.5) * cell; ty = (tk.spawnRow + 0.5) * cell;
  } else {
    tx = worldW / 2; ty = worldH / 2;
  }
  /* desired top-left so the target sits in the centre of the view */
  let goalX = tx - UI.w / 2, goalY = ty - UI.h / 2;
  goalX = Math.max(0, Math.min(maxX, goalX));
  goalY = Math.max(0, Math.min(maxY, goalY));
  if (!M.camReady || noMotion()){
    M.camX = goalX; M.camY = goalY; M.camReady = true;
  } else {
    /* frame-rate-independent ease: k per 16.7ms frame, scaled by real dt */
    const per = 0.16;                     /* fraction closed per 60fps frame */
    const dt = Math.max(0, Math.min(100, dtMs || 16.7));
    const a = 1 - Math.pow(1 - per, dt / 16.7);
    M.camX += (goalX - M.camX) * a;
    M.camY += (goalY - M.camY) * a;
  }
  /* snap sub-pixel to avoid shimmer on the static background */
  return { x: Math.round(M.camX), y: Math.round(M.camY) };
}

function draw(frac){
  if (!UI || !UI.g2 || !M) return;
  if (UI.dirtyBg) paintBg();
  const g = UI.g2, st = M.st, cell = UI.cell, SUB = E.SUB;
  const pv = M.prev || snapshot(st);
  const now = nowMs();
  const dtMs = M.camT ? (now - M.camT) : 16.7; M.camT = now;
  const cam = updateCamera(frac, dtMs);
  g.clearRect(0,0,UI.w,UI.h);
  g.save();
  g.translate(-cam.x, -cam.y);   /* world→view scroll; all draws are world px */
  g.drawImage(UI.bg, 0, 0, UI.worldW || UI.w, UI.worldH || UI.h);

  const px = v => (v / SUB) * cell;

  /* destructible cover (live grid) — crates of sandbags */
  for (let r=0;r<st.map.rows;r++) for (let c=0;c<st.map.cols;c++){
    if (!st.cover[r*st.map.cols+c]) continue;
    const x=c*cell, y=r*cell;
    g.fillStyle = '#7A5A3A'; roundRect(g,x+1.5,y+1.5,cell-3,cell-3,Math.max(2,cell*0.16)); g.fill();
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x+2, y+cell*0.5, cell-4, 1.5);
  }

  /* power-up crates — a glinting diamond in its colour */
  const t = nowMs();
  for (const cr of st.crates){
    if (cr.gone) continue;
    const x = (cr.col+0.5)*cell, y = (cr.row+0.5)*cell;
    const col = PUCOL[cr.kind] || '#fff';
    const glint = noMotion() ? 0.9 : (0.7 + 0.3*Math.sin(t/300 + cr.col));
    g.save(); g.translate(x,y); g.rotate(Math.PI/4);
    g.globalAlpha = glint;
    g.fillStyle = col; roundRect(g,-cell*0.26,-cell*0.26,cell*0.52,cell*0.52,3); g.fill();
    g.globalAlpha = 1; g.restore();
    g.fillStyle = '#0A0E15'; g.font = '700 '+Math.round(cell*0.42)+'px system-ui'; g.textAlign='center'; g.textBaseline='middle';
    g.fillText(puGlyph(cr.kind), x, y+0.5);
  }

  /* shells + trails (interpolated) */
  for (const s of st.shells){
    const p = pv.shells.find(o => o.id === s.id);
    const ix = p ? p.x + (s.x - p.x)*frac : s.x;
    const iy = p ? p.y + (s.y - p.y)*frac : s.y;
    const sx = px(ix), sy = px(iy);
    /* trail */
    g.strokeStyle = 'rgba(255,197,66,.45)'; g.lineWidth = Math.max(1.5, cell*0.09);
    g.beginPath(); g.moveTo(sx, sy);
    g.lineTo(sx - E.dirX(s.h)*(cell*0.9)/E.DIR_U, sy - E.dirY(s.h)*(cell*0.9)/E.DIR_U); g.stroke();
    g.fillStyle = '#FFE08A'; g.beginPath(); g.arc(sx, sy, Math.max(2, cell*0.12), 0, 6.2832); g.fill();
  }

  /* tanks (interpolated position + heading) */
  const teams = st.mode === 'teams';
  for (const tk of st.tanks){
    if (!tk.alive){ continue; }
    const p = pv.tanks[tk.seat];
    const ix = p ? p.x + (tk.x - p.x)*frac : tk.x;
    const iy = p ? p.y + (tk.y - p.y)*frac : tk.y;
    const hdg = p ? lerpAngle(p.hdg, tk.hdg, frac) : tk.hdg;
    const tur = p ? lerpAngle(p.turret, tk.turret, frac) : tk.turret;
    drawTank(g, px(ix), px(iy), hdg, tur, teams ? TEAMCOL[tk.team] : COLS[tk.seat % COLS.length], cell,
             tk.seat === M.me, tk.pu, tk.guard > 0);
  }

  /* explosions / sparks from the fx list */
  for (const f of st.fx){
    const age = (st.tick - f.born) + frac;
    const x = px(f.x), y = px(f.y);
    if (f.kind === 'boom'){
      const rr = (age/14) * cell * 1.6;
      g.globalAlpha = Math.max(0, 1 - age/14);
      g.fillStyle = '#FF9B4A'; g.beginPath(); g.arc(x,y,rr,0,6.2832); g.fill();
      g.fillStyle = '#FFE08A'; g.beginPath(); g.arc(x,y,rr*0.55,0,6.2832); g.fill();
      g.globalAlpha = 1;
    } else if (f.kind === 'spark' || f.kind === 'crack'){
      g.globalAlpha = Math.max(0, 1 - age/8);
      g.fillStyle = f.kind==='crack' ? '#C8A06A' : '#FFF3C4';
      g.beginPath(); g.arc(x,y, cell*0.18*(1-age/10), 0, 6.2832); g.fill();
      g.globalAlpha = 1;
    } else if (f.kind === 'shield'){
      g.globalAlpha = Math.max(0, 1 - age/8);
      g.strokeStyle = '#5AA9FF'; g.lineWidth = 2; g.beginPath(); g.arc(x,y, cell*0.6, 0, 6.2832); g.stroke();
      g.globalAlpha = 1;
    }
  }

  g.restore();                 /* end world→view scroll transform */
  /* minimap only helps when the arena is bigger than the view (it scrolls) */
  if ((UI.worldW || UI.w) > UI.w + 1 || (UI.worldH || UI.h) > UI.h + 1) drawMinimap(g, frac, cam);
}

/* a small corner minimap so a scrolling player keeps the whole fight in
   sight. Drawn in VIEW space (after restore), so it never scrolls. Purely
   cosmetic — reads live sim state, feeds nothing back. */
function drawMinimap(g, frac, cam){
  const st = M.st, mp = st.map;
  const pad = 6;
  const maxW = 78, maxH = 66;
  const s = Math.min(maxW / mp.cols, maxH / mp.rows);
  const mw = mp.cols * s, mh = mp.rows * s;
  const ox = UI.w - mw - pad, oy = pad;
  g.save();
  g.globalAlpha = 0.82;
  g.fillStyle = '#0A0E15'; roundRect(g, ox-2, oy-2, mw+4, mh+4, 4); g.fill();
  g.globalAlpha = 0.9;
  g.fillStyle = 'rgba(70,84,112,.55)';
  for (let r=0;r<mp.rows;r++) for (let c=0;c<mp.cols;c++){
    if (mp.wall[r*mp.cols+c]) g.fillRect(ox + c*s, oy + r*s, Math.ceil(s), Math.ceil(s));
  }
  /* the current view rectangle */
  const cell = UI.cell, SUB = E.SUB;
  const vx = ox + (cam.x / cell) * s, vy = oy + (cam.y / cell) * s;
  const vw = (UI.w / cell) * s, vh = (UI.h / cell) * s;
  g.globalAlpha = 0.9; g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1;
  g.strokeRect(vx + .5, vy + .5, Math.max(1, vw - 1), Math.max(1, vh - 1));
  /* tanks as dots; the local one white-ringed */
  const teams = st.mode === 'teams';
  for (const tk of st.tanks){
    if (!tk.alive) continue;
    const dx = ox + (tk.x / SUB) * s, dy = oy + (tk.y / SUB) * s;
    const col = teams ? TEAMCOL[tk.team] : COLS[tk.seat % COLS.length];
    g.fillStyle = col.a; g.beginPath(); g.arc(dx, dy, tk.seat === M.me ? 2.4 : 1.8, 0, 6.2832); g.fill();
    if (tk.seat === M.me){ g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.arc(dx, dy, 3.4, 0, 6.2832); g.stroke(); }
  }
  g.globalAlpha = 1; g.restore();
}
function puGlyph(k){ return k===1?'⁙':k===2?'»':k===3?'◈':k===4?'▸':'⟳'; }
function lerpAngle(a, b, f){
  let d = ((b - a + 384) & E.HDG_MASK) - 128;   /* shortest signed diff */
  return a + d*f;
}
function drawTank(g, x, y, hdg, turret, col, cell, isMe, pu, guarded){
  const a = (hdg / E.HDG) * Math.PI * 2;
  const ta = (turret / E.HDG) * Math.PI * 2;
  const R = cell * 0.42;
  g.save(); g.translate(x, y);
  /* shadow */
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(0, R*0.5, R*1.05, R*0.7, 0, 0, 6.2832); g.fill();
  /* hull */
  g.save(); g.rotate(a);
  g.fillStyle = col.t; g.fillRect(-R, -R*1.02, R*2, R*0.34);   /* track */
  g.fillRect(-R, R*0.68, R*2, R*0.34);
  g.fillStyle = col.b; roundRect(g, -R*0.86, -R*0.8, R*1.72, R*1.6, R*0.28); g.fill();
  g.fillStyle = col.a; roundRect(g, -R*0.7, -R*0.64, R*1.4, R*1.28, R*0.22); g.fill();
  g.restore();
  /* turret + barrel */
  g.save(); g.rotate(ta);
  g.fillStyle = col.t; g.fillRect(0, -R*0.16, R*1.5, R*0.32);   /* barrel */
  g.fillStyle = col.b; g.beginPath(); g.arc(0,0,R*0.5,0,6.2832); g.fill();
  g.fillStyle = col.a; g.beginPath(); g.arc(0,0,R*0.36,0,6.2832); g.fill();
  g.restore();
  /* rings: me marker, shield, spawn guard */
  if (guarded){ g.globalAlpha = 0.5; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(0,0,R*1.15,0,6.2832); g.stroke(); g.globalAlpha = 1; }
  if (pu && pu.shield > 0){ g.strokeStyle = '#5AA9FF'; g.lineWidth = 2; g.beginPath(); g.arc(0,0,R*1.25,0,6.2832); g.stroke(); }
  if (isMe){ g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(0,-R*1.55,R*0.16,0,6.2832); g.fillStyle='#fff'; g.fill(); }
  g.restore();
}

function paintCountdown(beat){
  if (!UI || !UI.cd) return;
  UI.cd.textContent = beat > 0 ? String(beat) : (T('GO','MUR'));
  if (beat === 0 && UI.cd){ setTimeout(() => { if (UI && UI.cd) UI.cd.textContent = ''; }, 500); }
}

/* ═══════════════════════════════════════════════════════════════════
   THE HUD — scores / timer, repainted on change only.
   ═══════════════════════════════════════════════════════════════════ */
function hud(){
  if (!UI || !UI.hud) return;
  const st = M.st;
  let html = '';
  if (st.mode === 'teams'){
    const t0 = st.tanks.filter(t=>t.team===0).reduce((a,t)=>a+Math.max(0,t.kills),0);
    const t1 = st.tanks.filter(t=>t.team===1).reduce((a,t)=>a+Math.max(0,t.kills),0);
    html += '<span class="tk-score"><span class="tk-dot" style="background:'+TEAMCOL[0].a+'"></span>'+t0+'</span>';
    html += '<span class="tk-score"><span class="tk-dot" style="background:'+TEAMCOL[1].a+'"></span>'+t1+'</span>';
    if (st.killTarget) html += '<span class="tk-time">'+esc(T('to ','sa ')+st.killTarget)+'</span>';
  } else {
    const rows = st.tanks.slice().sort((a,b)=>b.kills-a.kills).slice(0,4);
    for (const tk of rows){
      const col = COLS[tk.seat % COLS.length];
      html += '<span class="tk-score"><span class="tk-dot" style="background:'+col.a+'"></span>'+Math.max(0,tk.kills)+(tk.seat===M.me?' •':'')+'</span>';
    }
    if (st.killTarget) html += '<span class="tk-time">'+esc(T('to ','sa ')+st.killTarget)+'</span>';
  }
  if (st.timeLimit){
    const left = Math.max(0, st.timeLimit - st.tick);
    const secs = Math.ceil(left / E.SIM_HZ);
    html += '<span class="tk-time">'+Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0')+'</span>';
  }
  UI.hud.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════════════
   THE BOARD — HUD, arena canvas, twin sticks, rules sheet.
   ═══════════════════════════════════════════════════════════════════ */
function board(){
  const ctx = M.ctx;
  ctx.host.classList.add('tk-host');
  ctx.host.innerHTML =
    '<div class="tk-hud" id="tk-hud"></div>' +
    '<div class="tk-arena" id="tk-arena"><canvas id="tk-cv"></canvas>' +
      '<div class="tk-over"><span class="tk-cd" id="tk-cd"></span></div></div>' +
    '<div class="tk-ctrl" id="tk-ctrl">' +
      '<div class="tk-stick drive'+(noMotion()?' reduced':'')+'" id="tk-drive" role="group" aria-label="'+esc(T('Drive','Suq'))+'">' +
        '<span class="tk-nub"></span><span class="tk-lbl">'+esc(T('DRIVE','SUQ'))+'</span></div>' +
      '<div class="tk-stick aim'+(noMotion()?' reduced':'')+'" id="tk-aim" role="group" aria-label="'+esc(T('Aim and fire','Immira u spara'))+'">' +
        '<span class="tk-nub"></span><span class="tk-lbl">'+esc(T('AIM','IMMIRA'))+'</span></div>' +
    '</div>' +
    '<div class="tk-rules" id="tk-rulespanel" aria-hidden="true">' +
      '<div class="tk-rules-h"><h4>TANKIJIET — '+esc(T('the rules','ir-regoli'))+'</h4>' +
        '<button class="tk-rules-x" id="tk-rules-x" aria-label="'+esc(T('Close','Agħlaq'))+'">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="tk-rules-b"><ul>'+rulesFor().map(r=>'<li>'+r+'</li>').join('')+'</ul></div>' +
    '</div>';
  const arena = ctx.host.querySelector('#tk-arena');
  const cv = ctx.host.querySelector('#tk-cv');
  UI = {
    ctx, arena, cv, g2: cv.getContext('2d', { alpha:false }),
    host: ctx.host, hud: ctx.host.querySelector('#tk-hud'),
    ctrl: ctx.host.querySelector('#tk-ctrl'),
    drive: ctx.host.querySelector('#tk-drive'), aim: ctx.host.querySelector('#tk-aim'),
    cd: ctx.host.querySelector('#tk-cd'), rules: ctx.host.querySelector('#tk-rulespanel'),
    cell:16, w:240, h:180, dpr:1, bg:null, dirtyBg:true
  };
  wireControls();
  UI.rules.querySelector('#tk-rules-x').addEventListener('click', () => setRules(false));
  fitCanvas();
  hud();
  if (typeof ResizeObserver === 'function'){
    const ro = new ResizeObserver(() => { if (UI && UI.host.isConnected) fitCanvas(); });
    ro.observe(ctx.host); UI.stopFit = () => ro.disconnect();
  } else {
    const onR = () => { if (UI) fitCanvas(); };
    window.addEventListener('resize', onR); UI.stopFit = () => window.removeEventListener('resize', onR);
  }
  requestAnimationFrame(() => { if (UI) fitCanvas(); });
}

/* ── twin-stick touch + keyboard. Each stick tracks a pointer id so two
   thumbs work independently; the nub follows the finger (clamped). ── */
function wireControls(){
  const R0 = 52;   /* nub travel radius in px */
  function bindStick(elm, obj, isAim){
    let pid = null, cx = 0, cy = 0;
    const nub = elm.querySelector('.tk-nub');
    const setNub = (dx, dy) => { if (!noMotion()) nub.style.transform = 'translate('+dx+'px,'+dy+'px)'; };
    elm.addEventListener('pointerdown', e => {
      if (pid !== null) return;
      pid = e.pointerId; try { elm.setPointerCapture(pid); } catch(_){}
      const r = elm.getBoundingClientRect(); cx = r.left + r.width/2; cy = r.top + r.height/2;
      obj.on = true; move(e);
      if (isAim){ obj.fire = true; }   /* a tap on the aim stick = fire */
      e.preventDefault();
    });
    elm.addEventListener('pointermove', e => { if (e.pointerId !== pid) return; move(e); e.preventDefault(); });
    const end = e => {
      if (e.pointerId !== pid) return;
      pid = null; obj.on = false; obj.dx = 0; obj.dy = 0; obj.fire = false;
      setNub(0,0);
    };
    elm.addEventListener('pointerup', end);
    elm.addEventListener('pointercancel', end);
    function move(e){
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const mag = Math.hypot(dx, dy) || 1;
      if (mag > R0){ dx = dx/mag*R0; dy = dy/mag*R0; }
      obj.dx = dx; obj.dy = dy;
      setNub(dx, dy);
    }
  }
  bindStick(UI.drive, M.drive, false);
  bindStick(UI.aim, M.aim, true);

  /* keyboard for the desk + tests */
  UI.keys = e => {
    if (!M || M.dead) return;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a'){ M.key.turn = -1; }
    else if (k === 'ArrowRight' || k === 'd'){ M.key.turn = 1; }
    else if (k === 'ArrowUp' || k === 'w'){ M.key.throttle = 1; }
    else if (k === 'ArrowDown' || k === 's'){ M.key.throttle = -1; }
    else if (k === 'j' || k === ','){ M.key.aimTurn = -1; }
    else if (k === 'l' || k === '.'){ M.key.aimTurn = 1; }
    else if (k === ' ' || k === 'k'){ M.key.fire = true; M.wantFire = true; }
    else return;
    e.preventDefault();
  };
  UI.keysUp = e => {
    if (!M) return;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'ArrowRight' || k === 'd') M.key.turn = 0;
    else if (k === 'ArrowUp' || k === 'w' || k === 'ArrowDown' || k === 's') M.key.throttle = 0;
    else if (k === 'j' || k === ',' || k === 'l' || k === '.') M.key.aimTurn = 0;
    else if (k === ' ' || k === 'k') M.key.fire = false;
  };
  window.addEventListener('keydown', UI.keys);
  window.addEventListener('keyup', UI.keysUp);
}

function setRules(o){
  rulesOpen = o;
  if (!UI || !UI.rules) return;
  UI.rules.classList.toggle('open', o);
  UI.rules.setAttribute('aria-hidden', o ? 'false' : 'true');
  cue(o ? 'ui.sheet' : 'ui.back', { gain:.8 });
}

/* ═══════════════════════════════════════════════════════════════════
   OPEN / CLOSE
   ═══════════════════════════════════════════════════════════════════ */
function newGame(opts){
  injectCSS(); P.show();
  const o = Object.assign({}, opts || {});
  startMatch(o, null, null);
  M.me = E.meSeat(M.st);
  M.mine = []; M.meta = [];
  for (let s = 0; s < M.st.tanks.length; s++){
    const tk = M.st.tanks[s];
    tk.own = s === M.me ? 'me' : 'ai';
    tk.lvl = o.lvl || 2;
    M.mine.push(s);
    M.meta.push({ name: s === M.me ? T('You','Int') : levelWords(o.lvl||2).n + ' ' + (s+1), own: tk.own });
  }
  openBoard(() => menu());
  startLoop();
}

function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: 'TANKIJIET',
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'tk-rules', label:T('Rules','Regoli'), icon:'book', cls:'ghost' },
      { id:'tk-new', label:T('New','Ġdida'), icon:'refresh', cls:'ghost' }
    ]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();
  const mw = mapWords(M.opts.map).n;
  if (M.ctx.badge) M.ctx.badge.textContent = mw + ' · ' + modeWords(M.opts.mode).n + ' · ' + M.st.tanks.length;
  board();
  const rb = M.ctx.btn && M.ctx.btn('tk-rules'); if (rb) rb.onclick = () => setRules(!rulesOpen);
  const nb = M.ctx.btn && M.ctx.btn('tk-new');
  if (nb) nb.onclick = () => { const nx = M.net; leave(); if (nx && nx.onLeave) nx.onLeave(); else newGame(M.opts); };
}

function leave(){
  stopLoop();
  if (UI){
    if (UI.stopFit){ try { UI.stopFit(); } catch(e){} }
    if (UI.keys){ try { window.removeEventListener('keydown', UI.keys); } catch(e){} }
    if (UI.keysUp){ try { window.removeEventListener('keyup', UI.keysUp); } catch(e){} }
  }
  if (M) M.dead = true;
  M = null; UI = null;
}

/* ═══════════════════════════════════════════════════════════════════
   FINISH — hand the result to rebbieh (the shared winner screen).
   ═══════════════════════════════════════════════════════════════════ */
function finish(){
  if (!M || M.finished) return;
  M.finished = true;
  const res = E.over(M.st);
  cue(res.tone === 'win' ? 'game.win' : 'game.lose', { gain:.8 }, true);
  showResult(res);
}
function standings(st){
  const teams = st.mode === 'teams';
  const rows = st.tanks.map(t => ({
    seat: t.seat, team: t.team, kills: Math.max(0, t.kills), deaths: t.deaths,
    name: (M.meta[t.seat] && M.meta[t.seat].name) || ('#'+(t.seat+1)),
    you: t.seat === M.me, bot: (M.meta[t.seat] && M.meta[t.seat].own === 'ai')
  }));
  if (st.mode === 'last'){
    /* alive first, then by kills */
    rows.sort((a,b)=> (st.tanks[b.seat].alive?1:0)-(st.tanks[a.seat].alive?1:0) || b.kills-a.kills);
  } else if (teams){
    rows.sort((a,b)=> a.team-b.team || b.kills-a.kills);
  } else {
    rows.sort((a,b)=> b.kills-a.kills || a.deaths-b.deaths);
  }
  rows.forEach((r,i)=> r.place = i+1);
  return rows;
}
function showResult(res){
  if (!M || !M.ctx) return;
  const st = M.st;
  const rows = standings(st);
  const R2 = window.KARTI_REBBIEH;
  const backToLobby = () => { const nx = M.net; leave(); if (nx && nx.onLeave) nx.onLeave(); else menu(); };
  const again = () => { if (M.net){ const nx = M.net; leave(); if (nx && nx.onLeave) nx.onLeave(); else menu(); } else newGame(M.opts); };
  if (R2 && R2.show){
    R2.show({
      lang: (window.KARTI_LANG ? KARTI_LANG.lang() : 'en'),
      reduced: noMotion(),
      title: res.tone === 'win' ? T('You win','Rebaħt') : (res.tone === 'draw' ? T('Draw','Draw') : T('Out','Barra')),
      subtitle: st.mode === 'last' ? T('Last tank standing','L-aħħar tank wieqaf')
              : st.mode === 'teams' ? T('Team battle','Battalja tat-timijiet')
              : T('Most kills takes it','L-aktar qtil jieħdu'),
      rows: rows.map(r => ({ name:r.name, place:r.place, score:r.kills, you:r.you, bot:r.bot,
        border: (st.mode==='teams'?TEAMCOL[r.team]:COLS[r.seat % COLS.length]).bd })),
      sound: id => cue(id, { gain:.6 }),
      playAgainLabel: M.net ? T('Back to the room','Lura għall-kamra') : T('Play again','Erġa’ lgħab'),
      onPlayAgain: again,
      onLeave: backToLobby
    });
    return;
  }
  /* fallback if rebbieh is absent */
  if (P.ui && P.ui.result){
    P.ui.result(M.ctx, {
      tone: res.tone, head: res.tone==='win'?T('You win','Rebaħt'):T('Out','Barra'),
      why: rows.map(r => r.place+'. '+esc(r.name)).join('  '),
      buttons: [ { label:T('Again','Erġa'), icon:'refresh', cls:'primary', go:again },
                 { label:T('Back','Lura'), icon:'back', cls:'ghost', go:backToLobby } ]
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════
   ONLINE — start a lockstep room, apply peer bytes. Wired like bomba.
   ═══════════════════════════════════════════════════════════════════ */
function onlineStart(cfg){
  cfg = cfg || {};
  const chairs = (cfg.seats || []).filter(Boolean);
  const n = chairs.length;
  if (n < E.MIN_SEATS || n > E.MAX_SEATS) throw new Error('TANKIJIET: seats 4 to 8, not ' + n);
  const toGame = {}, toRoom = [];
  chairs.forEach((s, g) => { const room = (typeof s.seat === 'number') ? s.seat : g; toGame[room] = g; toRoom[g] = room; });
  const meG = (toGame[cfg.you] !== undefined) ? toGame[cfg.you] : 0;
  const iAmHost = (cfg.you === (cfg.host | 0));
  const lvl = (chairs.map(s => s && s.level).find(v => v)) || 2;
  const mode = (cfg.opts && cfg.opts.mode) || pref().mode || 'ffa';
  const map = (cfg.opts && cfg.opts.map) || (cfg.variant && E.MAPS[cfg.variant] ? cfg.variant : null) || pref().map || 'klassiku';

  leave(); injectCSS();
  startMatch({ seats:n, lvl, mode, map }, cfg.seed >>> 0, {});
  M.net = Object.assign({}, cfg.net, { host:iAmHost, toGame, toRoom });
  M.me = meG; M.mine = [meG];
  M.meta = chairs.map((s, g) => ({ name: String(s.name || ('#'+(g+1))).slice(0,14),
    own: g === meG ? 'me' : (s.kind === 'cpu' ? 'ai' : 'net') }));
  chairs.forEach((s, g) => {
    const tk = M.st.tanks[g];
    tk.own = g === meG ? 'me' : (s.kind === 'cpu' ? 'ai' : 'net');
    tk.lvl = s.level || lvl;
    if (tk.own === 'ai' && iAmHost) M.mine.push(g);
  });
  P.show();
  openBoard(() => { const nx = M.net; leave(); if (nx && nx.onLeave) nx.onLeave(); else P.hub(); });
  startLoop();
  return null;
}
function onlineStop(){ leave(); }
function onlineNote(){ /* no engine-authored note travels; nothing to do */ }

const NET_HOOKS = {
  live:      () => !!(M && !M.dead && !E.over(M.st)),
  phase:     () => !M ? 'idle' : (E.over(M.st) ? 'over' : 'play'),
  seed:      () => (M ? M.seed : null),
  gameId:    () => (M ? 'tankijiet' : null),
  turn:      () => -1,
  over:      () => (M ? E.over(M.st) : null),
  moveCount: () => (M ? M.committed + 1 : 0),
  check:     () => '',
  onMove: fn => {
    const f = info => {
      if (!M || M.dead || !M.net || !info) return;
      const room = M.net.toRoom ? M.net.toRoom[info.seat] : info.seat;
      fn(info.move, { seat:(room == null ? info.seat : room), src:info.src });
    };
    moveSubs.push(f);
    return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); };
  },
  apply: (seat, wire) => onlineRemote(seat, wire),
  seatGone: seat => {
    if (!M || M.dead || !M.net) return;
    const g = M.net.toGame[seat];
    if (g === undefined || !M.st.tanks[g]) return;
    const m = M.meta[g];
    try { K.toast((m && m.name ? m.name : T('A player','Plejer')) + ' — ' + T('gone.','telaq.')); } catch(e){}
  }
};
P.online = P.online || {};
P.online.tankijiet = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  live: () => NET_HOOKS.live(), hooks: NET_HOOKS
};

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — what js/mp.js reads before a match exists.

   ── READ THIS BEFORE TRYING TO OPEN AN ONLINE ROOM ─────────────────
   The online half above is written, wired and tested against the engine's
   input-delay lockstep. It is NOT reachable for the same one reason
   bomba's and serp's are not: the relay's table list

       server/karti_server.py  TABLES = (...)

   does not contain "tankijiet", and neither does js/mp.js's GAMES array —
   so a room labelled tankijiet is rejected at the door, and the honest
   thing is to say so here rather than open a door onto a wall.

   THE ONLY THINGS MISSING (integration checklist, all outside these two
   files, which is why this file cannot add them itself):

     · server/karti_server.py  TABLES  — add "tankijiet"
         (min 4, max 8 seats).
     · js/mp.js  GAMES  — add "tankijiet" so the lobby offers a room.
     · js/mp.js  GAME_SEATS['tankijiet'] = { min:4, max:8 }.
     · js/mp.js  GAME_VARIANTS['tankijiet'] — the MODE carried as the
         variant word (see lobby.variants below): 'ffa' | 'teams' | 'last'.
         The map rides in lobby.applyVariant/currentVariant via prefs, OR,
         if you prefer to carry the map as the variant instead, swap the
         two — but pick ONE deterministic word so every phone builds the
         same world (a forked variant forks the lockstep).
     · js/mp.js  LOBBY_GLOBAL (or the registry it reads) — point
         'tankijiet' at window.KARTI_TANKIJIET.lobby (below) and at
         KARTI_PARTY.online.tankijiet (above).

   Everything else the relay already does correctly: it forwards (does not
   referee — what lockstep needs); its generic codec carries {tick, seat,
   byte}; and a byte is sent only on a CHANGE (a held stick is implied by
   silence + predictInput), so eight tanks at 20Hz are well inside budget.

   So this contract is published and canStart() REFUSES, in words, until
   the server learns the word — bomba/serp/poker's identical decision.
   ═══════════════════════════════════════════════════════════════════ */
const ONLINE_WHY = T(
  'Online TANKIJIET is written and ready on this phone — full input-delay lockstep, so no two ' +
  'players ever disagree about a hit or a death — but the KARTI server does not know the word ' +
  '"tankijiet" yet, so it will not open a room for it. Nothing here is missing; a few lines on ' +
  'the server and mp.js are. Until then, TANKIJIET is you against the machine.',
  'TANKIJIET onlajn hu miktub u lest fuq dan it-telefon — lockstep sħiħ, mela ħadd qatt ma ' +
  'jaqbel ħażin dwar daqqa jew mewt — imma s-server tal-KARTI għadu ma jafx il-kelma "tankijiet" ' +
  'yet, mela mhux se jiftaħ kamra. Xejn hawn ma jonqos; ftit linji fuq is-server u mp.js jonqsu. ' +
  'Sa dakinhar, TANKIJIET hu int kontra l-magna.');

function mapSpawnCount(id){ try { return E.parseMap(E.MAPS[id]).spawns.length; } catch(e){ return 8; } }

R.lobby = {
  id:'tankijiet', name:'It-Tankijiet', mt:'It-Tankijiet',
  minSeats: E.MIN_SEATS, maxSeats: E.MAX_SEATS,
  levels: LEVELS, defaultLevel: 2,
  /* GAME_VARIANTS = the MODES. The `net` word is the engine's mode id, so
     the relay's deterministic variant broadcast names the same mode on
     every phone (cannot fork the lockstep). Teams needs an even seat count,
     so its `seats` list is even numbers only. */
  get variants(){
    return E.MODES.map(m => {
      const w = modeWords(m);
      const seats = [];
      for (let n = E.MIN_SEATS; n <= E.MAX_SEATS; n++){
        if (m === 'teams' && (n & 1)) continue;
        seats.push(n);
      }
      return { net:m, label:{ en:w.n, mt:w.n }, seats };
    });
  },
  currentVariant(){
    try { const v = window.KARTI_MP && window.KARTI_MP.MP && window.KARTI_MP.MP.variant; if (v && E.MODES.indexOf(v) >= 0) return v; } catch(e){}
    const p = pref().mode; return (p && E.MODES.indexOf(p) >= 0) ? p : 'ffa';
  },
  applyVariant(net){ const mode = (E.MODES.indexOf(net) >= 0) ? net : 'ffa'; pref({ mode }); return { variant: mode }; },
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(){ return { ok:false, why: ONLINE_WHY }; },
  rulesHTML: () =>
    '<p>'+T('Four to eight tanks in one walled arena, all at once. Drive, aim a turret, and fire; shells bank off walls to reach a tank behind cover.',
            'Minn erbgħa sa tmien tankijiet f’arena waħda bil-ħitan, kollha f’daqqa. Suq, immira turret, u spara; il-balal jaqbżu mal-ħitan biex jilħqu tank wara kenn.')+'</p>' +
    '<p>'+T('One clean hit kills. Grab power-ups by driving over them. Free-for-all, teams, or last tank standing.',
            'Daqqa nadifa toqtol. Aqbad power-ups billi tgħaddi fuqhom. Kulħadd għal rasu, timijiet, jew l-aħħar tank wieqaf.')+'</p>' +
    '<p>'+esc(ONLINE_WHY)+'</p>',
  blurb: T('Drive, aim, bank a shell off the wall, be the last tank rolling.',
           'Suq, immira, aqbeż balla mal-ħajt, kun l-aħħar tank sejjer.'),
  myName(){
    try { const n = K.displayName && K.displayName(); if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest') return String(n).trim().slice(0,14); } catch(e){}
    return T('You','Int');
  },
  start: (seatList, o) => newGame({
    mode: (o && o.mode) || pref().mode || 'ffa',
    map: pref().map || 'klassiku',
    seats: Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, (seatList || []).length || 4)),
    lvl: ((seatList || []).map(s => s && s.level).find(v => v)) || 2
  }),
  takeback: false
};

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF TILE — one tile on the BOARD shelf.
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'tankijiet', order:29, kind:'board', name:'IT-TANKIJIET', mt:'It-Tankijiet',
  sprite:'tk-t-tankijiet', status:'live',
  get tag(){
    return T('Four to eight tanks, one walled arena. Drive, aim, and bank a shell off the wall to catch a tank behind cover. Nobody waits for a turn.',
             'Minn erbgħa sa tmien tankijiet, arena waħda bil-ħitan. Suq, immira, u aqbeż balla mal-ħajt biex taqbad tank wara kenn. Ħadd ma jistenna dawra.');
  },
  open: () => menu(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: LEVELS,
  rulesHTML: () => R.lobby.rulesHTML()
};
R.shelfTile = TILE;
R.open = () => menu();
R.close = () => { leave(); P.hub(); };
if (P.register) P.register(TILE);

/* ── test hooks — inert unless the page is opened with ?pttest ──── */
try {
  if (String(location.search).indexOf('pttest') >= 0){
    window.__TK_TEST = {
      engine: E, M: () => M, st: () => (M ? M.st : null), UI: () => UI,
      menu, setup, newGame, leave,
      manual: (opts, seed) => {
        injectCSS(); P.show();
        startMatch(opts || { map:'klassiku', mode:'ffa', seats:4, lvl:2 }, seed, null);
        M.me = E.meSeat(M.st); M.mine = []; M.meta = [];
        for (let s = 0; s < M.st.tanks.length; s++){
          M.st.tanks[s].own = s === M.me ? 'me' : 'ai';
          M.st.tanks[s].lvl = (opts && opts.lvl) || 2;
          M.mine.push(s); M.meta.push({ name:'#'+(s+1), own:M.st.tanks[s].own });
        }
        M.D = 0;
        openBoard(() => menu());
        return M;
      },
      tick: n => { let g = 0; for (let i = 0; i < (n|0); i++){ if (!advance()){ if (g++ > 20) break; i--; } } return M.committed; },
      tickOnce: () => { advance(); return M.committed; },
      setDrive: (dx,dy) => { M.drive.on = !!(dx||dy); M.drive.dx = dx; M.drive.dy = dy; },
      setAim: (dx,dy,fire) => { M.aim.on = !!(dx||dy); M.aim.dx = dx; M.aim.dy = dy; M.aim.fire = !!fire; },
      key: k => { M.key = Object.assign(M.key, k); },
      fire: () => { M.wantFire = true; M.key.fire = true; },
      remote: (seat, wire) => onlineRemote(seat, wire),
      hooks: NET_HOOKS, lobby: R.lobby, tile: TILE,
      draw, fitCanvas, hud, board, openBoard, finish,
      fps: () => (M ? M.fps.val : 0), committed: () => (M ? M.committed : -1),
      measureD: () => measureD(), putInput,
      rules: () => rulesOpen, setRules
    };
  }
} catch(e){}

})();
