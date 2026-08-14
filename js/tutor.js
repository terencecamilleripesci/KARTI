/* ═══════════════════════════════════════════════════════════════════
   KARTI — tutor.js
   IT-TAĦRIĠ — the tutorial. Ziju Ċensu drags you through the rules on a
   REAL duel board: real engine, real cards, real damage. Nobody reads a
   manual, so there isn't one — you do every rule with your own thumb.

   Loads AFTER game.js. Owns nothing but window.KARTI_TUTOR and its own
   `.tut-` CSS, injected from here. Talks to the engine only through
   window.KARTI, parks the AI with window.KHOOK, and saves completion into
   the existing per-user save (S.tutorDone).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
if (!K) return;
const $ = K.$, $$ = K.$$, esc = K.esc;

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pause = ms => new Promise(r => setTimeout(r, REDUCED ? Math.min(ms, 30) : ms));
const slow  = ms => REDUCED ? Math.min(ms, 40) : ms;

const COACH = { i:'coach', n:'ZIJU ĊENSU' };
const ico = (n, label, cls) => (window.ICO ? window.ICO(n, label, cls) : '');
const ilb = (n, html, cls) => (window.ILB ? window.ILB(n, html, cls) : html);
const FOE_NAME = 'IL-PUPAZZ';

/* ── runtime state ── */
let live = false;          /* the tutorial is driving the board */
let si = 0;                /* current step index */
let timer = null;
let opts = {};
let ctx = {};              /* per-step scratch (baselines, zone indexes) */
let tuid = 90000;          /* instance uids kept well clear of the engine's */
let counterSeen = false;
let nudgeAt = 0, nudgeMsg = '';
let foeBusy = false;

/* ═══════════════════════════════════════════════════════════════════
   BOARD HELPERS — we write straight into KARTI.D, using the same
   instance shape the engine's summon() builds (game.js ~line 1292).
   ═══════════════════════════════════════════════════════════════════ */
function mkInst(cid, pos, fd, sumTurn){
  const card = K.cardById(cid);
  if (!card) return null;
  return {
    uid: ++tuid, cid, card,
    pos: pos || 'atk', fd: !!fd, mod:0, tempMod:0,
    atkCount:0, maxAtk: (card.fx === 'double' || card.fx === 'cleave') ? 2 : 1,
    monsterOnly: card.fx === 'cleave', shieldUsed:false,
    sumTurn: sumTurn === undefined ? -1 : sumTurn
  };
}
function setField(pi, list){
  const P = K.D.p[pi];
  P.mz = new Array(K.ZONES).fill(null);
  (list || []).forEach((s, i) => { if (s) P.mz[i] = mkInst(s.cid, s.pos, s.fd, s.sumTurn); });
}
const mine = () => K.D.p[0];
const them = () => K.D.p[1];
const monsters = pi => K.D.p[pi].mz.filter(Boolean);

/* deck filler — the hand is scripted for every lesson, the deck only has to
   exist so a draw never decks anybody out halfway through. */
function filler(n, ids){
  const out = [];
  for (let i = 0; i < n; i++) out.push(ids[i % ids.length]);
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   THE RING — read live out of COUNTERS so set2/set3 can extend it
   without this file quietly lying to anybody.
   ═══════════════════════════════════════════════════════════════════ */
function ringChain(){
  const C = K.COUNTERS || {};
  const start = C.festa ? 'festa' : Object.keys(C)[0];
  const out = [];
  let cur = start;
  for (let i = 0; i < 12 && cur; i++){
    out.push(cur);
    const nx = C[cur];
    if (!nx || nx === start) break;
    cur = nx;
  }
  return out;
}
function ringHTML(hi){
  const chain = ringChain();
  const head = K.ATTR[chain[0]] || { n:'?' };
  return '<div class="tut-ring">' + chain.map((f, i) => {
    const a = K.ATTR[f] || { n:f, e:'?', c:'#888' };
    const on = hi && hi.indexOf(f) >= 0;
    return '<span class="tut-node' + (on ? ' on' : '') + '" style="--nc:' + a.c + '">' +
             ico(K.ATTR_ICON[f]) + ' ' + esc(a.n) + '</span>' +
           (i < chain.length - 1 ? '<span class="tut-arw">›</span>' : '');
  }).join('') + '<span class="tut-arw">' + ico('refresh', 'and back to the start') + '</span></div>' +
  '<p class="tut-note">Each one beats the next, and the last loops back to ' + esc(head.n) +
  '. Attack the side you <b>beat</b> and that monster swings at <b>+' + K.COUNTER_BONUS +
  ' ATK</b>, for free.</p>';
}

/* the tribute table, derived from the engine's own tributesFor — never guessed */
function tributeRows(){
  const rows = [];
  let cur = K.tributesFor(1), from = 1;
  for (let lvl = 2; lvl <= 13; lvl++){
    const t = K.tributesFor(lvl);
    if (t !== cur){ rows.push({ from, to: lvl - 1, t: cur }); from = lvl; cur = t; }
  }
  rows.push({ from, to: 12, t: cur, open:true });        /* the top band has no ceiling */
  return rows;
}
function tributeHTML(){
  return '<div class="tut-trrow">' + tributeRows().map(r =>
    '<span class="tut-tr"><b>LVL ' + r.from +
      (r.open ? '+' : r.to > r.from ? '–' + r.to : '') + '</b> ' +
    (r.t === 0 ? 'free' : r.t + ' tribute' + (r.t > 1 ? 's' : '')) + '</span>').join('') + '</div>';
}

/* ═══════════════════════════════════════════════════════════════════
   THE LESSONS
   Every step: t = title · say = the coach · info:true gives it a Next
   button instead of a job · setup() rebuilds the board · check() is
   polled and returns true (done) / a string (a nudge) / false.
   ═══════════════════════════════════════════════════════════════════ */
const STEPS = [

/* 1 ─────────────────────────────────────────────────────── the goal */
{
  t:'L-għan — knock them to zero',
  info:true,
  say:'Ejja, oqgħod bilqiegħda. You both start on <b>' + K.LP_START + ' life points</b> — the big number ' +
      'at the bottom is yours, the one up top belongs to the pupazz. Take theirs to <b>zero</b> and you ' +
      'win. Let yours hit zero and I am telling the whole każin.',
  setup(){ mine().hand = []; },
  hl:() => ['#me-lp', '#ai-lp']
},

/* 2 ─────────────────────────────────────────────────────── the table */
{
  t:'Il-mejda — the table',
  info:true,
  say:'Five <b>monster zones</b> and five <b>spell/trap zones</b> each side. The two rows at the bottom ' +
      'are yours, the two at the top are theirs. Your hand sits under the lot, where you can see it and — ' +
      'normally — nobody else can.',
  hl:() => ['#me-mz', '#me-st', '#ai-mz', '#ai-st']
},

/* 3 ──────────────────────────────────────────────── normal summon */
{
  t:'Is-sejħa — summon a monster',
  say:'Tap the card in your hand, pick <b>Summon face-up (ATK)</b>, then tap an empty monster zone. ' +
      'And listen to me: <b>one normal summon per turn</b>. One. Not two, not "just one more, ħi".',
  ok:'Ara. Level 4 and under walks on for nothing.',
  setup(){
    const P = mine();
    P.normalSummoned = false;
    P.mz = new Array(K.ZONES).fill(null);
    P.sz = new Array(K.ZONES).fill(null);
    P.hand = ['kavallier'];
    K.D.phase = 'main';
  },
  check(){
    const m = monsters(0)[0];
    if (!m) return false;
    if (m.fd || m.pos !== 'atk'){                 /* forgiving — they set it instead */
      m.fd = false; m.pos = 'atk';
      K.renderDuel();
      K.toast('Face-UP, in attack. We do the hiding later.');
    }
    return true;
  },
  hl:() => ['#me-hand .h']
},

/* 4 ─────────────────────────────────────────────────────── tributes */
{
  t:'It-tributi — the big ones cost you',
  say:'Nothing good is free. The heavy ones you pay for in <b>tributes</b> — your own monsters, straight ' +
      'to the graveyard. <b>THE KUNJATA is level 8</b>, so she costs <b>two</b>. She always has. Tap her, ' +
      'summon face-up, feed her <b>two</b> of yours, then pick a zone.',
  extra: tributeHTML,
  ok:'Two gone, one enormous mother-in-law standing. Worth every one of them.',
  delay:1200,
  setup(){
    const P = mine();
    P.normalSummoned = false;      /* the coach is letting you go twice. Say nothing. */
    P.hand = ['kunjata'];
    setField(0, [{ cid:'kavallier' }, { cid:'pupa' }]);
    K.D.phase = 'main';
    K.toast('I am letting you summon twice this turn. Do not tell the committee.');
  },
  check(){
    if (monsters(0).some(m => m.cid === 'kunjata')) return true;
    if (monsters(0).length < K.tributesFor(8))
      return 'You need ' + K.tributesFor(8) + ' bodies on the table before she comes anywhere.';
    return false;
  },
  hl:() => ['#me-hand .h']
},

/* 5 ────────────────────────────────────── defence / face-down set */
{
  t:'Id-difiża — set one face-down',
  say:'Not everything has to stand there with its chest out. Tap the Carnival Float and pick ' +
      '<b>Set face-down (DEF)</b>. Face-down means they cannot see what it is, and it defends with ' +
      'its <b>DEF</b> number instead of its ATK. You may flip it or turn it round on a <b>later</b> ' +
      'turn — never the turn it lands.',
  ok:'Sitting there quietly, like your uncle at a wedding.',
  setup(){
    const P = mine();
    P.normalSummoned = false;
    P.hand = ['pupa'];
    K.D.phase = 'main';
    if (K.freeZone(0, 'm') < 0) P.mz[K.ZONES - 1] = null;
  },
  check(){
    if (monsters(0).some(m => m.fd)) return true;
    const z = mine().mz.findIndex(m => m && m.cid === 'pupa' && !m.fd);
    if (z >= 0){                                  /* summoned face-up — give it back */
      mine().mz[z] = null;
      mine().hand.push('pupa');
      mine().normalSummoned = false;
      K.renderDuel();
      return 'Face-DOWN this time — the second option in the sheet.';
    }
    return false;
  },
  hl:() => ['#me-hand .h']
},

/* 6 ─────────────────────────────────────────────────────────── traps */
{
  t:'In-nasba — set a trap',
  say:'Traps do <b>not</b> go off from your hand. You <b>set</b> them face-down and they sit there ' +
      'sulking — they only arm from the <b>opponent\'s next turn</b> onwards. Set one and walk into it the ' +
      'same turn and nothing happens, exactly like your father in 1994. Tap the Car Door and set it.',
  ok:'Set. It wakes up on their turn, not a second before.',
  setup(){
    const P = mine();
    P.hand = ['bieb'];
    P.sz = new Array(K.ZONES).fill(null);
    K.D.phase = 'main';
  },
  check(){ return mine().sz.some(s => s && s.card.t === 'trap'); },
  hl:() => ['#me-hand .h']
},

/* 7 ─────────────────────────────────────────────────────────── spells */
{
  t:'Is-seħer — cast a spell',
  say:'Spells are the opposite animal: they fire <b>straight out of your hand, on your turn</b>, do the ' +
      'job and go to the graveyard. No waiting, no sulking. Tap Strong Coffee and hit <b>Activate</b>. ' +
      'Two cards. Sleep is for other people.',
  ok:'Two cards richer and it is not even six in the morning.',
  setup(){
    const P = mine();
    P.hand = ['kafe'];
    K.D.phase = 'main';
  },
  check(){
    if (mine().grave.indexOf('kafe') >= 0) return true;
    const z = mine().sz.findIndex(s => s && s.cid === 'kafe');
    if (z >= 0){                                  /* they set it — hand it back */
      mine().sz[z] = null;
      mine().hand.push('kafe');
      K.renderDuel();
      return 'Not set — ACTIVATE it. A spell goes off there and then.';
    }
    return false;
  },
  hl:() => ['#me-hand .h']
},

/* 8 ──────────────────────────────────────────────────── end the turn */
{
  t:'Tmiem id-dawra — end your turn',
  say:'One more rule before you get excited: <b>whoever goes first does not attack on their opening ' +
      'turn</b>. House rule — take it up with the committee, they meet Tuesdays and they will ignore you. ' +
      'Press <b>End turn</b> and let the pupazz have a go.',
  ok:'Their turn, their problem.',
  delay:600,
  setup(){
    ctx.t0 = K.D.turnCount;
    mine().hand = ['meta'];
    K.D.phase = 'main';
  },
  check(){ return !foeBusy && K.D.turn === 0 && K.D.turnCount > ctx.t0; },
  hl:() => K.D.turn === 0 ? ['#actbar .btn.ghost'] : []
},

/* 9 ────────────────────────────────────────────── flip / switch pos */
{
  t:'Iddur — flip it, or turn it round',
  say:'New turn, so that face-down card can finally move. Tap it and pick <b>Flip face-up (ATK)</b>. ' +
      'The same tap swaps a monster between <b>ATTACK</b> and <b>DEFENCE</b> — any turn except the one it ' +
      'arrived on, and never after it has swung.',
  ok:'Up it comes. Chest out.',
  setup(){
    const P = mine();
    let z = P.mz.findIndex(m => m && m.fd);
    if (z < 0){
      z = K.freeZone(0, 'm');
      if (z < 0) z = 0;
      P.mz[z] = mkInst('pupa', 'def', true, K.D.turnCount - 1);
    } else P.mz[z].sumTurn = K.D.turnCount - 1;
    P.mz[z].atkCount = 0;
    ctx.flipZone = z;
    P.hand = ['meta'];
    K.D.turn = 0;
    K.D.phase = 'main';
  },
  check(){
    const m = mine().mz[ctx.flipZone];
    return !!m && !m.fd;
  },
  hl:() => ['.zone[data-side="0"][data-kind="m"][data-i="' + ctx.flipZone + '"]']
},

/* 10 ─────────────────────────────────────────── battle: you're bigger */
{
  t:'Il-battalja — bigger ATK wins',
  say:'Press <b>To battle</b>, tap your monster, then tap theirs. Your <b>1900</b> against their ' +
      '<b>1600</b>: their monster dies and the <b>difference — 300 —</b> comes straight off their life ' +
      'points. That is the whole game, over and over, until somebody cries.',
  ok:'Dead, and 300 off the top. Bravu.',
  delay:1400,
  setup(){ battleSetup([{ cid:'kavallier' }], [{ cid:'group' }], 'main'); },
  check(){ return them().lp < ctx.foeLp; },
  hl:() => battleHl(0)
},

/* 11 ──────────────────────────────────────── battle: you're smaller */
{
  t:'Meta titlef — attacking up hurts YOU',
  say:'Now the other way round, once, so it stings and you never forget it. Your <b>1400</b> into their ' +
      '<b>1600</b>. <b>Your</b> monster dies and the difference comes off <b>your</b> life points. ' +
      'Attack upwards and you are paying for the privilege yourself. Go on. Do it.',
  ok:'That is what that feels like. Count the numbers first, next time.',
  delay:1400,
  setup(){ battleSetup([{ cid:'bandist' }], [{ cid:'group' }], 'battle'); },
  check(){ return mine().lp < ctx.myLp; },
  hl:() => battleHl(0)
},

/* 12 ────────────────────────────────────────────── battle: defence */
{
  t:'Kontra d-difiża — nobody loses LP',
  say:'Theirs is lying down in <b>DEFENCE</b>, so your ATK is measured against its <b>DEF</b>. Beat the ' +
      'DEF and it dies — but <b>nobody loses life points</b>. Only a monster with <b>pierce</b> gets ' +
      'through, and yours has not got it. Hit it anyway.',
  ok:'Dead, and not one life point moved. Boring. That is the rule.',
  delay:1400,
  setup(){ battleSetup([{ cid:'kavallier' }], [{ cid:'hangover', pos:'def' }], 'battle'); },
  check(){ return monsters(1).length === 0; },
  hl:() => battleHl(0)
},

/* 13 ──────────────────────────────────────────── direct attack */
{
  t:'Daqqa diretta — straight at them',
  say:'Nothing on their side. Nothing in the way. When they have <b>no monsters</b> your monster walks ' +
      'straight past and hits them in the life points for its <b>full ATK</b>. Tap your monster, then ' +
      '<b>Attack directly</b>.',
  ok:'1900 off the top, no argument, no monster to blame.',
  delay:1400,
  setup(){ battleSetup([{ cid:'kavallier' }], [], 'battle'); },
  check(){ return them().lp < ctx.foeLp; },
  hl:() => battleHl(0)
},

/* 14 ──────────────────────────────────────── the ring & the +500 */
{
  t:'Iċ-ċirku — the five-way ring',
  say:'The important one, then I am going for a coffee. Every side beats one and loses to one. Attack ' +
      'the side you <b>beat</b> and that monster gets <b>+' + K.COUNTER_BONUS + ' ATK</b>. Your <b>1400 ' +
      'FESTA</b> into their <b>1500 CITY</b> — on paper you lose. Attack anyway. Watch.',
  extra:() => ringHTML(['festa', 'belt']),
  ok:'+' + K.COUNTER_BONUS + ' out of nowhere — 1900 against 1500, and they pay the difference.',
  delay:1600,
  setup(){ battleSetup([{ cid:'bandist' }], [{ cid:'krejn' }], 'battle'); },
  check(){
    if (them().lp < ctx.foeLp) return true;
    if (mine().lp < ctx.myLp || monsters(0).length === 0){   /* lost it somehow — rack them up again */
      battleSetup([{ cid:'bandist' }], [{ cid:'krejn' }], 'battle');
      K.renderDuel();
      return 'Again — FESTA into CITY. The +' + K.COUNTER_BONUS + ' does the work for you.';
    }
    return false;
  },
  hl:() => battleHl(0)
},

/* 15 ────────────────────────────────────────────────── finish them */
{
  t:'Aqtagħhielhom — finish the job',
  say:'They are down to <b>700</b> and there is nothing left standing. You know exactly what to do now. ' +
      'Tap your monster, <b>Attack directly</b>, and let us both go home.',
  delay:500,
  setup(){
    battleSetup([{ cid:'kavallier' }], [], 'battle');
    them().lp = 700;
    ctx.foeLp = 700;
  },
  check(){ return !!K.D.over; },
  hl:() => battleHl(0)
}
];

/* ── shared battle-step plumbing ── */
function battleSetup(my, foe, phase){
  const P = mine(), O = them();
  setField(0, my);
  setField(1, foe);
  P.hand = [];
  P.sz = new Array(K.ZONES).fill(null);
  O.sz = new Array(K.ZONES).fill(null);
  P.normalSummoned = true;
  P.noAttackTurn = -1;
  K.D.turn = 0;
  K.D.phase = phase || 'battle';
  K.D.over = false;
  ctx.foeLp = O.lp;
  ctx.myLp = P.lp;
  K.resetUI();
}
/* what to point at during a battle step, as the state moves along */
function battleHl(zi){
  if (!K.D) return [];
  if (K.D.phase === 'main') return ['#actbar .btn.hot'];
  const U = K.UI;
  if (U && U.mode === 'attack'){
    const t = U.targets || [];
    if (t.indexOf(-1) >= 0) return ['#actbar .btn.hot'];
    return t.map(i => '.zone[data-side="1"][data-kind="m"][data-i="' + i + '"]');
  }
  return ['.zone[data-side="0"][data-kind="m"][data-i="' + zi + '"]'];
}

/* ═══════════════════════════════════════════════════════════════════
   THE COACH PANEL
   Pinned to the top so it never fights the hand, the action bar or the
   card sheet that slides up from the bottom.
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS(){
  if ($('#tut-css')) return;
  const st = document.createElement('style');
  st.id = 'tut-css';
  st.textContent = [
'body.tut-on #scr-duel{padding-top:calc(var(--sat) + var(--tut-h,150px) + 2px);padding-bottom:calc(var(--sab) + 2px)}',
/* the coach needs a strip of the screen, so the board gives a little back */
'body.tut-on .duel{--fw:min(62px,calc((100vw - 44px)/5));gap:2px}',
'body.tut-on .duel .mid{min-height:32px;padding:1px 2px}',
'body.tut-on .duel .hand{min-height:0;padding:5px 2px 6px}',
'body.tut-on .duel .hand .card{--cw:64px}',
'body.tut-on .duel .actbar .btn{min-height:44px}',
'body.tut-on .duel .pinfo{padding:1px 4px}',
'.tut-wrap{position:fixed;left:0;right:0;top:0;z-index:210;pointer-events:none;',
'  padding:calc(var(--sat) + 6px) calc(var(--sar) + 8px) 0 calc(var(--sal) + 8px)}',
'.tut-panel{pointer-events:auto;max-width:460px;margin:0 auto;border-radius:15px;',
'  background:linear-gradient(180deg,#2C2050,#160F28);border:1px solid var(--line2);',
'  border-left:4px solid var(--gold);box-shadow:0 16px 38px rgba(0,0,0,.65);',
'  display:flex;flex-direction:column;overflow:hidden;max-height:240px}',
'.tut-head{flex:0 0 auto;padding:9px 11px 0}',
'.tut-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 11px}',
'.tut-foot{flex:0 0 auto;padding:0 11px 9px;position:relative}',
'.tut-foot::before{content:"";position:absolute;left:0;right:0;top:-15px;height:15px;',
'  pointer-events:none;background:linear-gradient(180deg,rgba(23,16,44,0),#1A1130)}',
'.tut-top{display:flex;align-items:center;gap:7px}',
'.tut-face{font-size:19px;line-height:1;flex:0 0 auto}',
'.tut-who{font-family:var(--disp);font-weight:900;font-size:9.5px;letter-spacing:.1em;color:var(--gold);',
'  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.tut-count{margin-left:auto;font-family:var(--disp);font-weight:900;font-size:9px;letter-spacing:.06em;',
'  color:var(--dim);background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:99px;',
'  padding:3px 8px;white-space:nowrap}',
'.tut-skip{flex:0 0 auto;background:none;border:1px solid var(--line2);color:var(--dim);border-radius:99px;',
'  font-size:10px;font-weight:700;padding:0 10px;min-height:30px;font-family:var(--body);cursor:pointer}',
'.tut-skip:active{background:rgba(255,255,255,.08)}',
'.tut-prog{height:4px;border-radius:99px;background:#2A1F42;overflow:hidden;margin:7px 0;',
'  border:1px solid var(--line)}',
'.tut-prog>i{display:block;height:100%;transform-origin:left;transition:transform .32s var(--ease);',
'  background:linear-gradient(90deg,var(--gold),var(--hot))}',
'.tut-title{font-family:var(--disp);font-weight:900;font-size:10.5px;letter-spacing:.07em;color:#FFF3CF;',
'  margin:0 0 4px;text-transform:uppercase}',
'.tut-say{font-size:12.5px;line-height:1.45;color:#E9E1FF;margin:0}',
'.tut-say b{color:var(--gold);font-weight:800}',
'.tut-say.good{color:#7EE0A0}',
'.tut-say.good b{color:#B6F2CB}',
'.tut-nudge{font-size:11.5px;line-height:1.4;color:var(--gold);margin:6px 0 0}',
'.tut-acts{display:flex;gap:7px;margin-top:8px}',
'.tut-acts .btn{flex:1;min-height:40px;font-size:11.5px}',
'.tut-wait{font-size:9.5px;letter-spacing:.09em;font-family:var(--disp);font-weight:900;color:var(--dim2);',
'  margin:8px 0 0;display:flex;align-items:center;gap:6px}',
'.tut-body::-webkit-scrollbar{width:4px}',
'.tut-body::-webkit-scrollbar-thumb{background:var(--line2);border-radius:4px}',
'.tut-wait i{width:7px;height:7px;border-radius:99px;background:var(--gold);display:block;flex:0 0 auto;',
'  animation:tutBlink 1.1s ease-in-out infinite}',
'@keyframes tutBlink{0%,100%{opacity:.25}50%{opacity:1}}',
'.tut-ring{display:flex;flex-wrap:wrap;align-items:center;gap:3px;margin-top:8px}',
'.tut-node{font-family:var(--disp);font-weight:900;font-size:8.5px;letter-spacing:.03em;padding:3px 6px;',
'  border-radius:99px;border:1px solid var(--nc);color:var(--nc);background:rgba(255,255,255,.04);',
'  white-space:nowrap}',
'.tut-node.on{background:var(--nc);color:#0B0812;box-shadow:0 0 12px var(--nc)}',
'.tut-arw{color:var(--dim2);font-size:12px;font-weight:900;line-height:1}',
'.tut-note{font-size:10.5px;line-height:1.45;color:var(--dim);margin:6px 0 0}',
'.tut-note b{color:var(--gold)}',
'.tut-trrow{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}',
'.tut-tr{font-size:10px;color:var(--dim);background:rgba(255,255,255,.05);border:1px solid var(--line);',
'  border-radius:8px;padding:3px 7px;white-space:nowrap}',
'.tut-tr b{color:#FFF3CF;font-family:var(--disp);font-size:9px;letter-spacing:.04em}',
'.tut-hl{position:relative;z-index:9;outline:3px solid var(--gold);outline-offset:2px;border-radius:9px;',
'  animation:tutPulse 1.15s ease-in-out infinite}',
'@keyframes tutPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,197,66,.6)}50%{box-shadow:0 0 0 9px rgba(255,197,66,0)}}',
'@media (prefers-reduced-motion:reduce){',
'  .tut-hl{animation:none;box-shadow:0 0 0 4px rgba(255,197,66,.4)}',
'  .tut-wait i{animation:none}}',
'.tut-hero{text-align:center;padding:6px 0 10px}',
'.tut-hero .f{font-size:46px;line-height:1}',
'.tut-hero h3{font-size:17px;margin:6px 0 2px}',
'.tut-hero .s{font-family:var(--disp);font-weight:900;font-size:10px;letter-spacing:.14em;color:var(--gold)}',
'.tut-list{display:grid;gap:6px;margin:10px 0 14px;padding:0}',
'.tut-list li{list-style:none;font-size:12.5px;color:var(--dim);line-height:1.4;background:var(--panel);',
'  border:1px solid var(--line);border-radius:11px;padding:8px 10px}',
'.tut-list li b{color:var(--txt)}',
/* the coach and the ring are icons now, not emoji — give them a little air */
'.tut-node .ico{font-size:1.45em;vertical-align:-.26em;margin-right:1px}',
'.tut-arw .ico{font-size:12px;vertical-align:-.18em}',
'.tut-skip .ico{font-size:1.15em;vertical-align:-.18em;margin-left:2px}',
'.tut-nudge .ico,.tut-say .ico{font-size:1.15em;vertical-align:-.18em}',
'.tut-hero .f .ico,.tut-face .ico{color:var(--gold)}'
  ].join('\n');
  document.head.appendChild(st);
}

function mountPanel(){
  let w = $('#tut-wrap');
  if (!w){
    w = document.createElement('div');
    w.id = 'tut-wrap';
    w.className = 'tut-wrap';
    w.setAttribute('role', 'region');
    w.setAttribute('aria-label', 'Tutorial coach');
    document.body.appendChild(w);
  }
  w.style.display = '';
  return w;
}
function unmountPanel(){
  const w = $('#tut-wrap');
  if (w) w.remove();
  document.body.style.removeProperty('--tut-h');
}
function renderPanel(){
  const w = mountPanel();
  const s = STEPS[si];
  /* head and foot stay put; only the coach's mouth scrolls */
  w.innerHTML =
    '<div class="tut-panel">' +
      '<div class="tut-head">' +
        '<div class="tut-top">' +
          '<span class="tut-face" aria-hidden="true">' + ico(COACH.i) + '</span>' +
          '<span class="tut-who">' + esc(COACH.n) + '</span>' +
          '<span class="tut-count" id="tut-count">STEP ' + (si + 1) + ' / ' + STEPS.length + '</span>' +
          '<button class="tut-skip" id="tut-skip" type="button">Skip ' + ico('close') + '</button>' +
        '</div>' +
        '<div class="tut-prog"><i style="transform:scaleX(' +
          ((si + 1) / STEPS.length).toFixed(3) + ')"></i></div>' +
        '<p class="tut-title">' + esc(s.t) + '</p>' +
      '</div>' +
      '<div class="tut-body">' +
        '<p class="tut-say" id="tut-say" role="status">' + s.say + '</p>' +
        '<div id="tut-extra">' + (s.extra ? s.extra() : '') + '</div>' +
        '<p class="tut-nudge" id="tut-nudge" hidden></p>' +
      '</div>' +
      '<div class="tut-foot">' +
        (s.info
          ? '<div class="tut-acts"><button class="btn primary" id="tut-next" type="button">Ejja ›</button></div>'
          : '<p class="tut-wait"><i></i>YOUR MOVE — DO IT ON THE BOARD</p>') +
      '</div>' +
    '</div>';
  const sk = $('#tut-skip');
  if (sk) sk.onclick = skip;
  const nx = $('#tut-next');
  if (nx) nx.onclick = () => advance(true);
  measure();
}
/* The board, the hand and the action bar get their space first — whatever is
   left over is what the coach is allowed, and he scrolls inside it. Anything
   fixed here clipped the hand off the bottom of a 390x844 phone. */
function measure(){
  const set = () => {
    const el = $('#tut-wrap .tut-panel');
    if (!el) return;
    const duel = $('#duel-root');
    let cap = 240;
    if (duel && duel.children.length){
      /* .mid is the one flexible row — it soaks up whatever is left, so asking
         for its current height would just feed our own padding back to us. */
      let need = 0;
      Array.from(duel.children).forEach(c => {
        need += c.classList.contains('mid') ? 34 : c.offsetHeight;
      });
      need += 3 * (duel.children.length - 1);            /* .duel gap */
      cap = Math.max(96, Math.min(240, window.innerHeight - need - 18));
    }
    el.style.maxHeight = cap + 'px';
    document.body.style.setProperty('--tut-h', (el.offsetHeight + 8) + 'px');
  };
  set();
  requestAnimationFrame(set);
}
function coachSay(msg, good){
  const el = $('#tut-say');
  if (!el) return;
  el.innerHTML = (good ? ico('check', 'Done') + ' ' : '') + msg;
  el.classList.toggle('good', !!good);
  const ex = $('#tut-extra'); if (ex && good) ex.innerHTML = '';
  const nd = $('#tut-nudge'); if (nd){ nd.hidden = true; nd.textContent = ''; }
  measure();
}
function nudge(msg){
  if (!msg) return;
  const now = Date.now();
  if (msg === nudgeMsg && now - nudgeAt < 7000) return;
  nudgeMsg = msg; nudgeAt = now;
  const nd = $('#tut-nudge');
  if (nd){ nd.innerHTML = ico('arrow-right') + ' ' + esc(msg); nd.hidden = false; measure(); }
  K.toast(msg);
}

/* ── highlights: the duel UI repaints constantly, so re-apply every tick ── */
function wanted(){
  const s = STEPS[si];
  if (!s || !s.hl) return [];
  let sel = [];
  try { sel = s.hl() || []; } catch(e){ sel = []; }
  const out = [];
  sel.forEach(x => {
    if (!x) return;
    if (typeof x === 'string') $$(x).forEach(e => out.push(e));
    else out.push(x);
  });
  return out;
}
function applyHl(){
  const want = wanted();
  $$('.tut-hl').forEach(e => { if (want.indexOf(e) < 0) e.classList.remove('tut-hl'); });
  want.forEach(e => e.classList.add('tut-hl'));
}
function clearHl(){ $$('.tut-hl').forEach(e => e.classList.remove('tut-hl')); }

/* ═══════════════════════════════════════════════════════════════════
   RUNNER
   ═══════════════════════════════════════════════════════════════════ */
function startPoll(){ stopPoll(); timer = setInterval(tick, 150); }
function stopPoll(){ if (timer){ clearInterval(timer); timer = null; } }

function tick(){
  if (!live || !K.D) return;
  applyHl();
  const s = STEPS[si];
  if (!s || s.info) return;
  let r = false;
  try { r = s.check(); } catch(e){ r = false; }
  if (r === true) advance();
  else if (typeof r === 'string') nudge(r);
}

function advance(fromButton){
  if (!live) return;
  const s = STEPS[si];
  stopPoll();
  clearHl();
  if (s.ok && !fromButton) coachSay(s.ok, true);
  const w = fromButton ? 0 : slow(s.delay || 950);
  const at = si;
  setTimeout(() => { if (live && si === at) goStep(at + 1); }, w);
}

function goStep(i){
  if (!live) return;
  if (i >= STEPS.length){ finishScreen(); return; }
  si = i;
  counterSeen = false;
  nudgeMsg = ''; nudgeAt = 0;
  const s = STEPS[si];
  clearHl();
  try { if (s.setup) s.setup(); } catch(e){ console.warn('[tutor] setup', e); }
  if (K.D) K.renderDuel();
  renderPanel();
  applyHl();
  startPoll();
}

/* ── the pupazz takes its (entirely scripted) turn ── */
async function foeTurn(){
  if (!live || !K.D) return;
  foeBusy = true;
  K.renderDuel();
  await pause(650);
  if (!live || !K.D || K.D.over){ foeBusy = false; return; }
  const O = K.D.p[1];
  if (!O.mz.some(Boolean)){
    O.hand = ['group'];
    K.summon(1, 0, 0, 'atk', false, []);
    K.renderDuel();
    await pause(750);
  }
  if (!live || !K.D || K.D.over){ foeBusy = false; return; }
  K.dlog(FOE_NAME + ' has nothing else to give. It is a dummy.');
  K.endTurn();
  if (K.UI) K.UI.busy = false;
  K.resetUI();
  K.renderDuel();
  foeBusy = false;
}

/* ── duel event stream, so we can see a counter bonus actually land ── */
function tutEvent(ev){
  if (!live) return;
  if (ev.type === 'counter') counterSeen = true;
}

/* ═══════════════════════════════════════════════════════════════════
   FINISH · SKIP · CLEAN UP
   ═══════════════════════════════════════════════════════════════════ */
function teardown(){
  live = false;
  foeBusy = false;
  stopPoll();
  clearHl();
  unmountPanel();
  document.body.classList.remove('tut-on');
  window.KHOOK = null;
  K.D = null;
  ctx = {};
}
function done(){
  const fn = opts && opts.onDone;
  opts = {};
  if (typeof fn === 'function') fn();
  else K.go('home');
}

function finishScreen(){
  stopPoll(); clearHl();
  const w = $('#tut-wrap'); if (w) w.style.display = 'none';
  if (K.S){ K.S.tutorDone = true; K.S.tutorSkipped = false; K.save(); }
  K.openModal(
    '<div class="result">' +
      '<div class="big win">MELA</div>' +
      '<p class="tiny">Tutorial finished</p>' +
    '</div>' +
    '<div style="display:flex;gap:9px;align-items:flex-start;margin-top:12px">' +
      '<span style="font-size:30px;line-height:1" aria-hidden="true">' + ico(COACH.i) + '</span>' +
      '<p class="blurb" style="margin:0">“That is the lot. Summon, tribute, defend, set a trap, cast a ' +
      'spell, count the numbers <b>before</b> you swing, and keep an eye on the ring. You are still going ' +
      'to lose — but from now on you will know exactly why, and so will everybody else.”</p>' +
    '</div>' +
    '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px">' +
      '<span class="pill">' + ico('check') + STEPS.length + '/' + STEPS.length + ' steps</span>' +
      '<span class="pill">' + ico(COACH.i) + esc(COACH.n) + ' approves</span>' +
    '</div>' +
    '<div style="display:grid;gap:9px;margin-top:14px">' +
      '<button class="btn hot" id="tut-fin" type="button">Ejja, let me play</button>' +
      '<button class="btn ghost" id="tut-redo" type="button">' +
        ilb('refresh', 'Run it again') + '</button>' +
    '</div>');
  const f = $('#tut-fin');
  if (f) f.onclick = () => { K.closeModal(); teardown(); done(); };
  const r = $('#tut-redo');
  if (r) r.onclick = () => { const o = opts; K.closeModal(); teardown(); start(o); };
}

function skip(){
  if (!live) return;
  if (K.S){ K.S.tutorSkipped = true; K.save(); }
  K.toast('Fine. Learn it the hard way, like everybody else.');
  teardown();
  done();
}

/* something ended the duel that was not the last lesson — a forfeit, most likely */
function bail(why){
  if (!live) return;
  if (K.S){ K.S.tutorSkipped = true; K.save(); }
  K.toast(why || 'Tutorial closed.');
  teardown();
  done();
}

/* ═══════════════════════════════════════════════════════════════════
   ENTRY POINTS
   ═══════════════════════════════════════════════════════════════════ */
function start(o){
  injectCSS();
  if (live) teardown();
  opts = o || {};
  K.closeSheet(); K.closeModal();

  live = true;
  si = 0; ctx = {}; counterSeen = false; foeBusy = false;
  nudgeMsg = ''; nudgeAt = 0;
  document.body.classList.add('tut-on');

  /* the local AI must never get a look-in — every one of its moves is scripted */
  window.KHOOK = {
    afterEndTurn(){ foeTurn(); return true; },
    result(){
      if (!live) return false;
      if (si < STEPS.length - 1) setTimeout(() => bail('That is one way to end a lesson.'), 30);
      return true;                              /* a tutorial pays nothing out */
    }
  };

  K.startCustomDuel({
    myList: K.STARTER_DECKS.festa.list,
    myName: (K.displayName() || 'YOU').toUpperCase(),
    myKey: 'festa',
    foe: { name:FOE_NAME, list:K.STARTER_DECKS.belt.list, deckKey:'belt', isAI:true },
    mode:'tutor', diff:'tourist',
    first:'Training. ' + COACH.n + ' is watching, and he has opinions.'
  });
  K.D.on = ev => { K.onDuelEvent(ev); tutEvent(ev); };

  /* wipe the random opening — every lesson needs a board we already know */
  const D = K.D;
  D.p[0].hand = [];  D.p[0].grave = [];
  D.p[1].hand = [];  D.p[1].grave = [];
  D.p[0].mz = new Array(K.ZONES).fill(null); D.p[0].sz = new Array(K.ZONES).fill(null);
  D.p[1].mz = new Array(K.ZONES).fill(null); D.p[1].sz = new Array(K.ZONES).fill(null);
  D.p[0].deck = filler(30, ['meta', 'pupa', 'kafe', 'kavallier', 'cisk']);
  D.p[1].deck = filler(30, ['traffiku', 'wejter', 'krejn', 'kafe']);
  D.p[0].normalSummoned = false;
  D.p[0].noAttackTurn = -1; D.p[1].noAttackTurn = -1;
  D.turn = 0; D.phase = 'main';

  mountPanel();
  goStep(0);
  return D;
}

/* ── the landing screen (#scr-tutor) ── */
function open(){
  injectCSS();
  window.KHOOK = null;
  const host = $('#scr-tutor');
  if (!host) return;
  host.innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="tut-back" aria-label="Back to home">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>How To Play</h2>' +
      (isDone() ? '<span class="pill">' + ico('check') + 'done</span>'
                : '<span class="pill">' + STEPS.length + ' steps</span>') +
    '</div>' +
    '<div class="scroll">' +
      '<div class="tut-hero">' +
        '<div class="f" aria-hidden="true">' + ico(COACH.i) + '</div>' +
        '<div class="s">' + esc(COACH.n) + ' WILL SHOW YOU</div>' +
        '<h3>Nobody reads the rules</h3>' +
      '</div>' +
      '<p class="blurb">So you are not going to either. You get a <b>real board</b>, a <b>real opponent</b> ' +
      '(he is a dummy — do not feel clever) and <b>' + STEPS.length + ' jobs</b> to do with your own thumb. ' +
      'Five minutes. Walk out whenever you like and Ziju Ċensu will judge you quietly.</p>' +
      '<ul class="tut-list">' +
        '<li><b>Summoning</b> — one a turn, and what the heavy ones cost you in tributes</li>' +
        '<li><b>Attack, defence, face-down</b> — and when you are allowed to turn them round</li>' +
        '<li><b>The maths</b> — who dies, who pays, and why a defence costs them nothing</li>' +
        '<li><b>Spells vs traps</b> — one fires now, the other sulks until their turn</li>' +
        '<li><b>The ring</b> — the free <b>+' + K.COUNTER_BONUS + ' ATK</b> most people never notice</li>' +
      '</ul>' +
      ringHTML(null) +
      '<div style="display:grid;gap:9px;margin:16px 0 24px">' +
        '<button class="btn hot" id="tut-go" type="button">' +
          (isDone() ? ilb('refresh', 'Run it again') : ilb('play', 'Start the tutorial')) + '</button>' +
        '<button class="btn ghost" id="tut-home" type="button">Not now</button>' +
      '</div>' +
    '</div>';
  const b = $('#tut-back'), h = $('#tut-home'), g = $('#tut-go');
  if (b) b.onclick = () => K.go('home');
  if (h) h.onclick = () => K.go('home');
  if (g) g.onclick = () => start({});
  K.go('tutor');
}

const isDone = () => !!(K.S && K.S.tutorDone);
function reset(){
  if (K.S){ K.S.tutorDone = false; K.S.tutorSkipped = false; K.save(); }
  return true;
}

/* ── home-screen entry ──
   index.html already ships a #btn-tutor and game.js wires it to open(); this
   only fills the gap if that button is ever dropped, and never re-wires one
   that already has a handler. */
function wire(){
  injectCSS();
  const have = $('#btn-tutor');
  if (have){ if (!have.onclick) have.onclick = open; return; }
  const host = document.querySelector('#scr-home .navrow') || document.querySelector('#scr-home .menu');
  if (!host) return;
  const b = document.createElement('button');
  b.className = 'btn ghost sm';
  b.id = 'btn-tutor';
  b.type = 'button';
  b.innerHTML = ilb('book', 'How to play');
  b.onclick = open;
  host.appendChild(b);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
else wire();

window.KARTI_TUTOR = {
  start, open, isDone, reset,
  steps: STEPS.length,
  /* surface for the headless verification harness */
  _dbg: {
    get live(){ return live; },
    get step(){ return si; },
    get ctx(){ return ctx; },
    get counterSeen(){ return counterSeen; },
    STEPS, ringChain, tributeRows, goStep, skip, finishScreen
  }
};

})();
