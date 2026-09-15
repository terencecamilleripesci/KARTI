/* ═══════════════════════════════════════════════════════════════════
   KARTI — muzika-ui.js
   MUŻIKA — the screen. Four answers, and one of them costs you.

   THE PENALTY HAS TO BE ON THE BUTTON. A rule the player only discovers
   by losing a point is a rule the game kept secret: every option carries
   a quiet −1 and the pass carries a 0, so the whole bet is visible
   before the finger lands. That is also why the score chips show the
   SIGN — +3 and −1 are different feelings and a bare "3" hides which
   one you are having.

   THE HOST ENDS IT, NOT A COUNTER. This game has no fixed length. It
   runs until somebody decides the round is over, which is how music
   quizzes actually end in a bar — when the host has had enough. The
   END IT button is on screen the whole time and it is the only thing
   that decides a winner.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const E = window.KARTI_MUZIKA;
if (!K || !P || !E) return;

const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
const mtNow = () => !!(window.KARTI_LANG && KARTI_LANG.lang() === 'mt');
const esc = K.esc;
const SEATCOL = ['#FFC542', '#4FB6FF', '#3DDC84', '#FF5468', '#C08BFF', '#FF9F45'];

let M = null;

let cssIn = false;
function injectCSS(){
  if (cssIn) return; cssIn = true;
  const st = document.createElement('style');
  st.id = 'muzika-css';
  st.textContent = (`
.mz-wrap{display:flex;flex-direction:column;gap:9px;height:100%;padding:2px 0}
.mz-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:0 0 auto}
.mz-cat{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim2);font-weight:800}
.mz-clock{height:7px;border-radius:99px;background:rgba(255,255,255,.10);overflow:hidden;flex:0 0 auto}
.mz-clock i{display:block;height:100%;width:100%;border-radius:99px;
  background:linear-gradient(90deg,#3DDC84,#FFC542 60%,#FF5468);
  transform-origin:left center;transition:transform .1s linear}
.mz-q{font-family:var(--disp);font-size:19px;line-height:1.28;font-weight:900;
  text-align:center;padding:8px 4px;flex:0 0 auto}
/* ── the clip round ───────────────────────────────────────────────── */
.mz-clip{display:flex;flex-direction:row;align-items:center;gap:12px;padding:2px 0;flex:0 0 auto}
.mz-sleeve{position:relative;width:88px;height:88px;flex:0 0 88px;border-radius:14px;overflow:hidden;
  display:flex;align-items:center;justify-content:center;
  background:linear-gradient(145deg,rgba(255,255,255,.10),rgba(255,255,255,.03));
  border:1px solid rgba(255,255,255,.14)}
.mz-sleeve #mz-note{font-size:38px;opacity:.30;animation:mzPulse 1.6s ease-in-out infinite}
@keyframes mzPulse{0%,100%{opacity:.22;transform:scale(1)}50%{opacity:.45;transform:scale(1.08)}}
.mz-sleeve img{width:100%;height:100%;object-fit:cover;display:block}
/* stretch, not flex-start: with flex-start the children size to
   max-content, so a long title blew #mz-ask out to 498px inside a 276px
   column and ran off the screen instead of truncating. The replay pill
   opts back out so it stays pill-sized. */
.mz-side{display:flex;flex-direction:column;align-items:stretch;gap:7px;min-width:0;flex:1 1 auto}
.mz-ask{font-family:var(--disp);font-size:17px;font-weight:900;line-height:1.2;min-width:0;max-width:100%}
.mz-side .mz-replay{align-self:flex-start}
.mz-side .mz-bars{align-self:flex-start}
/* align-self:stretch, not max-width:100% — in a flex column the b's
   max-width resolved against its own content box, so a long title ran
   off the row instead of truncating. */
.mz-meta b{display:block;font-size:14px;font-weight:900;line-height:1.2;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  align-self:stretch;width:100%;min-width:0}
.mz-meta span{display:block;font-size:11px;opacity:.75;margin-top:2px}
.mz-bars{display:flex;align-items:flex-end;gap:4px;height:18px}
.mz-bars i{width:4px;border-radius:2px;background:linear-gradient(180deg,#FFC542,#FF5468);
  animation:mzBar .9s ease-in-out infinite}
.mz-bars i:nth-child(1){animation-delay:0s}   .mz-bars i:nth-child(2){animation-delay:.12s}
.mz-bars i:nth-child(3){animation-delay:.24s} .mz-bars i:nth-child(4){animation-delay:.36s}
.mz-bars i:nth-child(5){animation-delay:.48s}
@keyframes mzBar{0%,100%{height:5px}50%{height:18px}}
.mz-replay{font:inherit;font-size:12px;font-weight:800;color:var(--dim2);cursor:pointer;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);
  border-radius:99px;padding:6px 14px}
.mz-replay.need{color:#0C0D12;background:#FFC542;border-color:#FFC542;animation:mzPulse 1.2s ease-in-out infinite}
.mz-opts{display:flex;flex-direction:column;gap:8px;flex:1 1 auto}
.mz-opt{position:relative;width:100%;min-height:52px;border-radius:13px;padding:10px 42px 10px 14px;
  font:inherit;font-size:15px;font-weight:800;text-align:left;color:var(--ink);
  background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);cursor:pointer;
  transition:transform .12s var(--ease),background .15s,border-color .15s}
.mz-opt:active{transform:scale(.985)}
.mz-opt .cost{position:absolute;right:12px;top:50%;transform:translateY(-50%);
  font-size:11px;font-weight:900;color:#FF8DA0;opacity:.5}
.mz-opt.right{background:linear-gradient(160deg,#3DDC84,#1E9457);border-color:#7FE8A8;color:#08210F}
.mz-opt.right .cost{color:#08210F;opacity:.75}
.mz-opt.wrong{background:linear-gradient(160deg,#FF5468,#9A1B2C);border-color:#FF8DA0}
.mz-opt[disabled]{cursor:default}
.mz-pass{width:100%;min-height:46px;border-radius:13px;font:inherit;font-size:14px;font-weight:800;
  cursor:pointer;color:var(--dim);background:rgba(255,255,255,.05);
  border:1px dashed rgba(255,255,255,.22);flex:0 0 auto}
.mz-said{text-align:center;font-size:13px;font-weight:800;min-height:1.4em;color:var(--dim);flex:0 0 auto}
.mz-said.good{color:#7FE8A8}
.mz-said.bad{color:#FF8DA0}
.mz-score{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;flex:0 0 auto}
.mz-chip{display:flex;align-items:center;gap:6px;padding:4px 9px;border-radius:99px;
  background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.10);font-size:12px;font-weight:800}
.mz-chip i{width:9px;height:9px;border-radius:50%;display:block;flex:0 0 auto}
.mz-chip .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:86px}
/* a full table: shrink the chips rather than let them take a third row */
.mz-score.many{gap:4px}
.mz-score.many .mz-chip{padding:3px 7px;font-size:11px;gap:4px}
.mz-score.many .mz-chip i{width:7px;height:7px}
.mz-score.many .mz-chip .nm{max-width:52px}
.mz-chip .pts{font-variant-numeric:tabular-nums;min-width:2.1em;text-align:right}
.mz-chip .pts.up{color:#7FE8A8}
.mz-chip .pts.dn{color:#FF8DA0}
.mz-chip.bump{animation:mz-bump .42s var(--ease)}
@keyframes mz-bump{0%{transform:scale(1)}40%{transform:scale(1.18)}100%{transform:scale(1)}}
.mz-end{width:100%;min-height:44px;border-radius:12px;font:inherit;font-size:13px;font-weight:900;
  cursor:pointer;color:#0F0A1C;background:var(--gold);border:0;flex:0 0 auto}
.mz-rounds{text-align:center;font-size:10px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--dim2);font-weight:800;flex:0 0 auto}
.mz-cats{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin:2px 0 4px}
.mz-cbtn{padding:7px 12px;border-radius:99px;font:inherit;font-size:12px;font-weight:800;
  cursor:pointer;color:var(--dim);background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.14)}
.mz-cbtn.on{color:#0F0A1C;background:var(--gold);border-color:var(--gold)}

/* ── OVERRIDES LAST ────────────────────────────────────────────────
   These @media blocks MUST stay at the bottom of this stylesheet. Once
   every rule is scoped to #scr-party they all carry the SAME
   specificity, so the winner is whichever is declared later. Sitting
   above the base rules, this whole block lost silently: the option
   heights and gaps it sets were simply overwritten, and END IT stayed
   off the bottom of a 360x640 screen that cannot scroll.
   One selector per line, too — see the prefix note below. */
@media (prefers-reduced-motion:reduce){
  .mz-sleeve #mz-note{animation:none}
  .mz-bars i{animation:none;height:14px}
  .mz-replay.need{animation:none}
}
/* Short phones (360x640 and friends): the four options and END IT matter
   more than the sleeve, so the decoration is what gives way. */
@media (max-height:700px){
  .mz-wrap{gap:5px}
  .mz-score{gap:3px}
  .mz-sleeve{width:62px;height:62px;flex:0 0 62px;border-radius:11px}
  .mz-sleeve #mz-note{font-size:26px}
  .mz-ask{font-size:15px}
  .mz-meta b{font-size:12px}
  .mz-bars{display:none}
  .mz-q{font-size:16px;padding:4px}
  .mz-clip{gap:10px;padding:0}
  .mz-opts{gap:6px}
  .mz-opt{min-height:44px;font-size:14px;padding:8px 38px 8px 12px}
  .mz-pass{min-height:40px}
  .mz-said{min-height:0;font-size:11px}
  .mz-end{margin-top:2px;min-height:40px}
  .mz-chip{padding:3px 7px;font-size:11px}
  .mz-chip .nm{max-width:60px}
  .mz-score.many .mz-chip{padding:2px 6px;font-size:10px}
  /* 48, not 40: at 40 a seven-letter name lost exactly one character to
     gain an ellipsis, which reads as a bug rather than a decision. 46
     still clipped "Machine" — the DEFAULT machine seat name, so the one
     most tables actually show — by a single pixel. The rows have
     horizontal slack, so the extra width costs no height. */
  .mz-score.many .mz-chip .nm{max-width:48px}
}
`)
  /* Scope every rule to the party screen. Two things this has to get
     right, both learned by watching rules quietly do nothing:
       \s*  — rules nested in a @media block are indented, and an anchor
              that only matched column 0 left them unscoped, so they
              lost to the scoped base rules on specificity.
       ,    — only the FIRST selector of a comma list was being
              prefixed, so `a,b,c` left b and c unscoped. */
  .replace(/(^|,)(\s*)\.mz/gm, '$1$2#scr-party .mz');
  document.head.appendChild(st);
}

function prefs(){
  const p = P.pref('muzika') || {};
  const cats = Array.isArray(p.cats) && p.cats.length ? p.cats : Object.keys(E.CATS);
  return { level: p.level || 'medium', cats };
}

function setupSheet(){
  injectCSS();
  const p = prefs();
  P.ui.setup({
    id:'muzika',
    title:T('Mużika','Mużika'),
    sub:T('Name it or leave it','Aqtagħha jew ħalliha'),
    blurb:T('Four answers. A right one is worth a point and a WRONG one costs you a point — so passing is worth nothing, and nothing is often the smart bet. The host ends the round whenever they like; whoever is ahead wins.',
            'Erba\' tweġibiet. Waħda tajba tiswa punt u waħda ĦAŻINA tnaqqaslek punt — mela li tgħaddi ma tiswa xejn, u xejn spiss hu l-aħjar. Min qed imexxi jtemm ir-rawnd meta jrid; jirbaħ min ikun quddiem.'),
    levels: E.BANDS.map(b => ({ k:b.k, name:b.name,
      note: b.k === 'easy' ? T('Guesses when it should pass','Jaqta\' meta kellu jgħaddi')
          : b.k === 'hard' ? T('Knows it, and passes when it does not','Jafha, u jgħaddi meta ma jafhiex')
          : T('Knows most of them','Jaf ħafna minnhom'), icon:'star' })),
    onBack: () => P.hub(),
    onStart: (o) => {
      /* Re-read the shelves HERE. `p` was captured when the sheet was
         built, but catsInto() writes each tap straight to the pref — so
         using the closure handed back the shelves as they were BEFORE
         the player touched them, and then saved that stale set over
         their choice. Picking a single shelf could not stick. */
      const cur = prefs();
      const level = (o && o.level) || cur.level;
      P.pref('muzika', { level, cats:cur.cats });
      start((o && o.seats) || null, level, cur.cats);
    }
  });
  /* the shelves of music ride on the setup sheet, under the difficulty */
  setTimeout(() => catsInto(), 0);
}

function catsInto(){
  const host = document.querySelector('#scr-party #pt-aibits');
  if (!host || host.querySelector('.mz-cats')) return;
  const p = prefs();
  const lab = document.createElement('div');
  lab.className = 'tiny pt-lbl';
  lab.textContent = T('Which music', 'Liema mużika');
  const box = document.createElement('div');
  box.className = 'mz-cats';
  box.innerHTML = Object.keys(E.CATS).map(k =>
    '<button type="button" class="mz-cbtn' + (p.cats.indexOf(k) >= 0 ? ' on' : '') +
    '" data-c="' + k + '">' + esc(mtNow() ? E.CATS[k].mt : E.CATS[k].en) + '</button>').join('');
  host.appendChild(lab);
  host.appendChild(box);
  box.querySelectorAll('.mz-cbtn').forEach(b => b.onclick = () => {
    const cur = prefs().cats.slice();
    const k = b.dataset.c;
    const i = cur.indexOf(k);
    if (i >= 0){ if (cur.length === 1) return; cur.splice(i, 1); }
    else cur.push(k);
    P.pref('muzika', { level: prefs().level, cats: cur });
    box.querySelectorAll('.mz-cbtn').forEach(x =>
      x.classList.toggle('on', cur.indexOf(x.dataset.c) >= 0));
  });
}

function start(seatList, level, cats){
  injectCSS();
  const seats = [];
  if (seatList && seatList.length){
    seatList.forEach((s, i) => seats.push({
      name: s.name || (s.kind === 'cpu' ? T('Machine','Magna') : T('Player','Plejer') + ' ' + (i+1)),
      cpu: s.kind === 'cpu', pts:0
    }));
  } else {
    seats.push({ name:T('You','Int'), cpu:false, pts:0 });
    seats.push({ name:T('Machine','Magna'), cpu:true, pts:0 });
  }
  M = { seats, level, cats: (cats && cats.length) ? cats : Object.keys(E.CATS),
        used:new Set(), round:0, ctx:null, done:false, locked:false,
        t0:0, raf:null, tCpu:null, tNext:null, mid:'muzika-' + Date.now(),
        audio:null, clipOk:false };
  openBoard();

  /* ONE audio element for the whole game, built here and never replaced.
     A phone unlocks audio against the element the user's tap reached, so
     making a fresh Audio() per question throws that permission away and
     round two plays silence. */
  try {
    M.audio = new Audio();
    M.audio.preload = 'auto';
    M.audio.crossOrigin = 'anonymous';
  } catch(e){ M.audio = null; }

  /* The bank decides which game this is: clips if it loads, the written
     questions if it does not. Either way the round starts. */
  say0(T('Loading the music…','Qed ittella\' l-mużika…'));
  E.loadTracks().then(() => {
    if (!M || M.done) return;
    M.clipOk = E.haveTracks() && !!M.audio;
    nextQ();
  });
}

/* a board message before the first question exists */
function say0(msg){
  if (M && M.ctx && M.ctx.board)
    M.ctx.board.innerHTML = '<div class="mz-wrap"><div class="mz-q">' + esc(msg) + '</div></div>';
}

function openBoard(){
  M.ctx = P.ui.frame({
    title:T('Mużika','Mużika'),
    onBack: () => { leave(); P.hub(); },
    leave, buttons: []
  });
  const b = M.ctx.board;
  b.style.cssText = 'display:block;grid-template-columns:none;grid-template-rows:none;' +
    'width:100%;max-width:520px;border:0;box-shadow:none;overflow:visible;background:transparent';
}

function nextQ(){
  if (!M || M.done) return;
  clearTimers();
  M.round++;
  if (M.round > E.MAX_ROUNDS) return finish(true);
  /* A clip if the bank can furnish one, otherwise the written question.
     drawClip returns null rather than throwing when it cannot, so a
     thin shelf or a dead connection quietly becomes a quiz. */
  /* The bank alone is not enough to promise a clip. The service worker
     runtime-caches same-origin files, so a phone that has played once
     still HAS the track list offline — and would then draw a clip whose
     preview can never load, because the SW is same-origin only and the
     audio is not. Ask the network too, not just the bank. */
  const canClip = M.clipOk &&
    !(typeof navigator !== 'undefined' && navigator.onLine === false);
  M.cur = (canClip && E.drawClip(M.cats, M.used)) || E.draw(M.cats, M.used);
  M.locked = false;
  M.t0 = now();
  M.span = M.cur.clip ? E.CLIP_MS : E.ASK_MS;
  paint();
  if (M.cur.clip) playClip(M.cur);
  tick();
  /* the machine answers on its own clock, not on yours */
  M.tCpu = setTimeout(cpuGo, E.thinkMs(M.level));
}

const now = () => (window.performance && performance.now) ? performance.now() : Date.now();

function paint(){
  const c = M.cur;
  const cat = E.CATS[c.k] || { en:c.k, mt:c.k };
  M.ctx.board.innerHTML =
    '<div class="mz-wrap">' +
      '<div class="mz-top">' +
        '<span class="mz-cat">' + esc(mtNow() ? cat.mt : cat.en) + '</span>' +
        '<span class="mz-rounds">' + T('Round','Rawnd') + ' ' + M.round + '</span>' +
      '</div>' +
      '<div class="mz-clock"><i id="mz-clock"></i></div>' +
      (c.clip ? clipHTML() : '<div class="mz-q">' + esc(c.q) + '</div>') +
      '<div class="mz-opts" id="mz-opts">' +
        c.opts.map((o, i) =>
          '<button class="mz-opt" data-i="' + i + '">' + esc(o) +
          '<span class="cost">' + E.WRONG + '</span></button>').join('') +
      '</div>' +
      '<button class="mz-pass" id="mz-pass">' +
        T('Pass — worth nothing','Għaddi — ma tiswa xejn') + '</button>' +
      '<div class="mz-said" id="mz-said"></div>' +
      '<div class="mz-score" id="mz-score"></div>' +
      '<button class="mz-end" id="mz-end">' + T('End it — decide the winner','Tmiem — iddeċiedi r-rebbieħ') + '</button>' +
    '</div>';
  score();
  M.ctx.board.querySelectorAll('.mz-opt').forEach(b =>
    b.onclick = () => answer(+b.dataset.i));
  M.ctx.board.querySelector('#mz-pass').onclick = () => answer(-1);
  M.ctx.board.querySelector('#mz-end').onclick = () => finish(false);
}

/* The sleeve stays BLANK while the clip plays — artwork is the answer.
   It is filled in on the reveal, which is also where the link to the
   track goes: we are playing the shop's own preview, so we send the
   player to the shop. */
/* A ROW, NOT A STACK. Stacked, the sleeve and its furniture added about
   207px to a wrap that was laid out for a one-line question, and that
   pushed END IT off the bottom of a 390x844 phone — off a screen that
   cannot scroll, because the board is overflow:visible inside a parent
   that clips. Since END IT is the only way to finish a round early, the
   game was effectively unquittable. Side by side it costs ~96px. */
function clipHTML(){
  return '<div class="mz-clip" id="mz-clip">' +
           '<div class="mz-sleeve" id="mz-sleeve"><span id="mz-note">♪</span></div>' +
           '<div class="mz-side">' +
             '<div class="mz-ask" id="mz-ask">' + T('Name the song','X\'inhi l-kanzunetta') + '</div>' +
             '<div class="mz-bars" id="mz-bars"><i></i><i></i><i></i><i></i><i></i></div>' +
             '<button class="mz-replay" id="mz-replay" type="button">' +
               T('Play again','Erġa\' daqq') + '</button>' +
           '</div>' +
         '</div>';
}

function playClip(c){
  if (!M || !M.audio) return;
  const a = M.audio;
  try {
    a.pause();
    a.src = c.preview;
    a.currentTime = 0;
    const p = a.play();
    /* Autoplay can still be refused. Say so instead of sitting silent —
       a music round where nobody knows the sound failed is just a
       four-way guess with a penalty attached. */
    if (p && p.catch) p.catch(() => {
      const b = M.ctx && M.ctx.board && M.ctx.board.querySelector('#mz-replay');
      if (b){ b.classList.add('need'); b.textContent = T('Tap to play','Agħfas biex iddoqq'); }
    });
  } catch(e){}
  const rp = M.ctx.board.querySelector('#mz-replay');
  if (rp) rp.onclick = () => {
    rp.classList.remove('need');
    rp.textContent = T('Play again','Erġa\' daqq');
    try { a.currentTime = 0; a.play(); } catch(e){}
  };
}

function stopClip(){
  if (M && M.audio){ try { M.audio.pause(); } catch(e){} }
}

/* the reveal: sleeve, who it actually was, and the way to go hear it */
function showSleeve(c){
  const box = M.ctx.board.querySelector('#mz-sleeve');
  if (!box || !c.track) return;
  const t = c.track;
  /* The artwork gets the whole sleeve and the words go BESIDE it. An
     overlay across a small sleeve ate half the picture and wrapped the
     title onto two lines. */
  box.innerHTML = t.art ? '<img alt="" src="' + esc(t.art) + '">' : '<span id="mz-note">♪</span>';
  const ask = M.ctx.board.querySelector('#mz-ask');
  if (ask){
    ask.className = 'mz-ask mz-meta';
    ask.innerHTML = '<b>' + esc(t.title) + '</b><span>' + esc(t.artist) +
                    (t.year ? ' · ' + t.year : '') + '</span>';
  }
  const bars = M.ctx.board.querySelector('#mz-bars');
  if (bars) bars.style.display = 'none';
  const rp = M.ctx.board.querySelector('#mz-replay');
  if (rp && t.url){
    rp.textContent = T('Hear the whole thing','Isma\'ha kollha');
    rp.onclick = () => { try { window.open(t.url, '_blank', 'noopener'); } catch(e){} };
  }
}

function score(bumpSeat){
  const el = M.ctx.board.querySelector('#mz-score');
  if (!el) return;
  /* Six seats wrapped the chips onto three rows, which ate 67px and put
     END IT back off the bottom of a short phone — the same unquittable
     screen, arrived at from a full table instead of a small one. */
  el.className = 'mz-score' + (M.seats.length > 4 ? ' many' : '');
  el.innerHTML = M.seats.map((s, i) =>
    '<span class="mz-chip' + (i === bumpSeat ? ' bump' : '') + '">' +
      '<i style="background:' + SEATCOL[i % SEATCOL.length] + '"></i>' +
      '<span class="nm">' + esc(s.name) + '</span>' +
      ' <span class="pts ' + (s.pts > 0 ? 'up' : s.pts < 0 ? 'dn' : '') + '">' +
      (s.pts > 0 ? '+' : '') + s.pts + '</span></span>').join('');
}

function tick(){
  if (!M || M.done) return;
  const el = M.ctx.board.querySelector('#mz-clock');
  if (!el) return;
  const left = Math.max(0, 1 - (now() - M.t0) / (M.span || E.ASK_MS));
  el.style.transform = 'scaleX(' + left + ')';
  if (left <= 0){ if (!M.locked) answer(-1, true); return; }
  M.raf = requestAnimationFrame(tick);
}

function say(msg, cls){
  const el = M.ctx.board.querySelector('#mz-said');
  if (el){ el.className = 'mz-said' + (cls ? ' ' + cls : ''); el.textContent = msg; }
}

function answer(i, timedOut){
  if (!M || M.locked || M.done) return;
  M.locked = true;
  if (M.raf) cancelAnimationFrame(M.raf);
  const c = M.cur;
  const me = M.seats.findIndex(s => !s.cpu);
  const kind = i < 0 ? 'pass' : (i === c.right ? 'right' : 'wrong');
  if (me >= 0) M.seats[me].pts += E.scoreFor(kind);
  if (c.clip){ stopClip(); showSleeve(c); }

  const btns = M.ctx.board.querySelectorAll('.mz-opt');
  btns.forEach(b => { b.disabled = true; });
  /* the right answer is always revealed — a quiz that will not tell you
     what it was is a quiz nobody learns anything from */
  if (btns[c.right]) btns[c.right].classList.add('right');
  if (kind === 'wrong' && btns[i]) btns[i].classList.add('wrong');
  const pass = M.ctx.board.querySelector('#mz-pass');
  if (pass) pass.disabled = true;

  say(kind === 'right' ? T('Yes. +1','Iva. +1')
    : kind === 'wrong' ? T('No — that is ','Le — dik hi ') + E.WRONG
    : timedOut ? T('Out of time. Nothing lost.','Spiċċa l-ħin. Ma tlift xejn.')
               : T('Passed. Nothing lost.','Għaddejt. Ma tlift xejn.'),
    kind === 'right' ? 'good' : kind === 'wrong' ? 'bad' : '');
  try { if (K.sfx) K.sfx(kind === 'right' ? 'good' : kind === 'wrong' ? 'bad' : 'tick'); } catch(e){}
  score(me);
  M.tNext = setTimeout(nextQ, 1900);
}

function cpuGo(){
  if (!M || M.done || M.locked) return;
  M.seats.forEach((s, i) => {
    if (!s.cpu) return;
    const kind = E.cpuAnswer(M.level);
    s.pts += E.scoreFor(kind);
    s.last = kind;
  });
  score();
}

function clearTimers(){
  if (!M) return;
  stopClip();            /* audio outlives timers unless you stop it */
  if (M.raf) cancelAnimationFrame(M.raf);
  [M.tCpu, M.tNext].forEach(t => t && clearTimeout(t));
  M.raf = M.tCpu = M.tNext = null;
}

function finish(ranOut){
  if (!M || M.done) return;
  M.done = true;
  clearTimers();
  const order = M.seats.map((s, i) => ({ s, i })).sort((a, b) => b.s.pts - a.s.pts);
  const top = order[0];
  const tie = order.length > 1 && order[1].s.pts === top.s.pts;
  const meIdx = M.seats.findIndex(s => !s.cpu);
  const iWon = !tie && meIdx >= 0 && top.i === meIdx;
  const mine = meIdx >= 0 ? M.seats[meIdx].pts : 0;
  if (meIdx >= 0 && window.KARTI_XP && KARTI_XP.awardPlay){
    try { KARTI_XP.awardPlay({ game:'muzika', won:iWon, draw:tie, id:M.mid, ranked:false }); } catch(e){}
  }
  if (meIdx >= 0) try { P.record('muzika', tie ? 'd' : iWon ? 'w' : 'l'); } catch(e){}
  P.ui.result(M.ctx, {
    tone: tie ? 'draw' : iWon ? 'win' : 'lose',
    head: tie ? T('Dead heat','Indaqs')
        : (top.i === meIdx ? T('You win','Rebaħt') : esc(top.s.name) + T(' takes it',' jirbaħ')),
    why: M.seats.map(s => esc(s.name) + ' ' + (s.pts > 0 ? '+' : '') + s.pts).join('  ·  ') +
         '  ·  ' + (M.round - (ranOut ? 1 : 0)) + ' ' + T('rounds','rawnds'),
    quip: mine < 0 ? T('Every guess cost you. That is the game.','Kull tisbita swietlek. Hekk hi l-logħba.')
        : iWon ? T('You knew when to say nothing.','Kont taf meta ma tgħid xejn.')
        : T('Passing is not losing.','Li tgħaddi mhux li titlef.'),
    buttons:[
      { label:T('Play again',"Erġa' lgħab"), icon:'refresh', cls:'primary', go:() => { leave(); setupSheet(); } },
      { label:T('Leave','Oħroġ'), icon:'back', cls:'ghost', go:() => { leave(); P.hub(); } }
    ]
  });
}

function leave(){
  if (M) clearTimers();
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
    T('Four answers to every question. Right is +1.',
      'Erba\' tweġibiet għal kull mistoqsija. Tajba +1.'),
    T('WRONG IS MINUS ONE. That is the whole game — guessing is not free, so knowing that you do not know is worth as much as knowing.',
      'ĦAŻINA HI NAQQAS WAĦDA. Din hi l-logħba kollha — li tisbot mhux b\'xejn, mela li tkun taf li ma tafx jiswa daqs li tkun taf.'),
    T('Pass is worth nothing, and nothing is often the right bet.',
      'Li tgħaddi ma jiswa xejn, u xejn spiss hu l-aħjar.'),
    T('There is no fixed length. The host taps END IT when the round has run its course, and whoever is ahead wins.',
      'M\'hemmx tul fiss. Min qed imexxi jagħfas TMIEM meta jkun biżżejjed, u jirbaħ min ikun quddiem.'),
    T('Pick which music you want: what is on the radio, the women, the old classics, rap — or all four.',
      'Agħżel liema mużika trid: dik tar-radju, in-nisa, il-klassiċi, ir-rap — jew l-erbgħa.')
  ].join('</p><p>') + '</p>',
  blurb: T('Sound on — hear it, name it. A wrong answer costs you.',
           'Awdjo mixgħul — isimgħha, aqtagħha. Tweġiba ħażina tiswielek.'),
  start(seats, o){
    const p = prefs();
    const want = o && o.level;
    const level = (want && E.BANDS.some(b => b.k === want)) ? want : p.level;
    start(seats, level, p.cats);
    return { v:1, gid:'muzika' };
  },
  levels: E.BANDS.map(b => ({ k:b.k, name:b.name }))
};

const TILE = {
  id:'muzika', order:24, kind:'board', cat:'word',
  name:'Mużika', mt:'Mużika', icon:'star', status:'live',
  get tag(){ return T('TURN THE SOUND ON. Thirty seconds of the record plays and you name it — four answers, and a wrong one COSTS you a point, so passing is a real move. Radio hits, the women, the old classics, rap and Maltese. The host ends it when they have had enough and whoever is ahead wins.',
    'IXGĦEL L-AWDJO. Jindaqqu tletin sekonda mid-diska u trid taqtagħha — erba\' tweġibiet, u waħda ħażina TNAQQSEK punt, mela li tgħaddi hi mossa vera. Suċċessi tar-radju, in-nisa, il-klassiċi, ir-rap u l-Maltin. Min imexxi jtemmha meta jkun xebax u jirbaħ min ikun quddiem.'); },
  open: () => setupSheet(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: LOBBY.levels,
  rulesHTML: () => LOBBY.rulesHTML(),
  start: (list, o) => LOBBY.start(list, o)
};

const R = (window.KARTI_MUZIKA_UI = {});
R.shelfTile = TILE; R.lobby = LOBBY;
R.ui = { open:setupSheet, leave, injectCSS };
R.open = () => setupSheet();
R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

if (/[?&]muzikatest\b/.test(location.search || '')){
  window.__MUZIKA_TEST = {
    setupSheet, start, answer, finish, leave, nextQ,
    get M(){ return M; }, engine:E, TILE, LOBBY
  };
}

})();
