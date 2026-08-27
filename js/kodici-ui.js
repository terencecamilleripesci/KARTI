/* ═══════════════════════════════════════════════════════════════════
   KARTI — kodici-ui.js                 the screen for IL-KAĊĊA TAL-KODIĊI
   A 1v1 code-breaker (Mastermind). ONLINE / vs-AI / PASS-THE-PHONE.
   Engine is js/kodici.js (window.KARTI_KODICI.engine); this file is the
   ludu/kanun runner shape: a match is (opts, seed, log), state is a
   deal() plus a replay of the log, and everything renders from state.

   Identity is CSS/SVG only — NO image files (art is added later).
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_KODICI;
if (!K || !P || !R || !R.engine) return;

const E = R.engine;
const esc = (K && K.esc) || (s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;'));

/* the one language switch (js/lang.js) */
const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;

/* ── colour identity: hue + a distinct SHAPE + a letter, so a peg is
   never colour-alone (colour-blind safe). 10 colours max. ──────────── */
const PEGS = [
  { hex:'#E8443B', name:'Red',    mt:'Aħmar',   glyph:'A', shape:'circle'   },
  { hex:'#2E86FF', name:'Blue',   mt:'Blu',     glyph:'B', shape:'square'   },
  { hex:'#22B15E', name:'Green',  mt:'Aħdar',   glyph:'Ħ', shape:'triangle' },
  { hex:'#FFC542', name:'Gold',   mt:'Deheb',   glyph:'D', shape:'diamond'  },
  { hex:'#9B5DE5', name:'Purple', mt:'Vjola',   glyph:'V', shape:'hexagon'  },
  { hex:'#FF8A3D', name:'Orange', mt:'Oranġjo', glyph:'O', shape:'pentagon' },
  { hex:'#17C4C4', name:'Teal',   mt:'Teal',    glyph:'T', shape:'droplet'  },
  { hex:'#EC5FA0', name:'Pink',   mt:'Roża',    glyph:'R', shape:'heart'    },
  { hex:'#B5C21E', name:'Lime',   mt:'Lajm',    glyph:'L', shape:'star'     },
  { hex:'#8A93A6', name:'Slate',  mt:'Griż',    glyph:'G', shape:'star8'    }
];

/* ── autosave (the ludu/kanun store shape) ─────────────────────────── */
const STORE = 'karti_kodici_v1';
let ST = { v:1, pref:{}, rec:{ w:0, l:0, d:0 }, save:null };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object'){
    ST.pref = (j.pref && typeof j.pref === 'object') ? j.pref : {};
    ST.rec  = (j.rec  && typeof j.rec  === 'object') ? j.rec  : ST.rec;
    ST.save = j.save || null;
  }
} catch(e){}
let persistPending = 0;
function persist(){
  if (persistPending) return;
  persistPending = setTimeout(() => {
    persistPending = 0;
    try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){}
  }, 0);
}
function persistNow(){
  if (persistPending){ clearTimeout(persistPending); persistPending = 0; }
  try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){}
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persistNow(); });
window.addEventListener('pagehide', persistNow);
function pref(patch){ if (patch){ Object.assign(ST.pref, patch); persist(); } return ST.pref; }

/* ── sfx gate (existing ids only) ──────────────────────────────────── */
let cueAt = 0;
function cue(id, opts, big){
  const S = window.KARTI_SFX;
  if (!S) return;
  const now = Date.now();
  if (!big && now - cueAt < 50) return;
  cueAt = Math.max(cueAt, now);
  try { S.play(id, opts); } catch(e){}
}
function noMotion(){
  try {
    if (window.KARTI && KARTI.REDUCED) return true;
    if (document.body && document.body.classList.contains('reduced')) return true;
    return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch(e){ return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   THE RUNNER STATE
   M = {
     opts,             // {slots, colours, limit, lvl, deal, humans, mode}
     seed,
     log:[ {seat,g} ], // move log (guesses only)
     secrets:[c|null,c|null],  // the secrets THIS client legally holds
     st,               // engine state, rebuilt from opts+seed+secrets+log
     mode: 'ai'|'pass'|'online',
     you,              // which seat is "you" (local single-player view)
     ctx,              // P.ui.frame ctx (in-game) — null on menus
     phase:'setA'|'setB'|'play'|'over',
     draft:[],         // the guess/secret being composed
     veil,             // pass-phone handover: seat to hand to, or 0
     shown,            // last seat shown (pass-phone)
     net,              // online plumbing or null
     dead
   }
   ═══════════════════════════════════════════════════════════════════ */
let M = null;

/* ── board / level option tables ───────────────────────────────────── */
const BOARD_OPTS = [
  { id:'classic', slots:4, colours:6, name:()=>T('Classic','Klassiku'),  note:()=>T('4 slots · 6 colours','4 spazji · 6 kuluri') },
  { id:'hard',    slots:4, colours:8, name:()=>T('Hard','Iebes'),        note:()=>T('4 slots · 8 colours','4 spazji · 8 kuluri') },
  { id:'expert',  slots:5, colours:8, name:()=>T('Expert','Espert'),     note:()=>T('5 slots · 8 colours','5 spazji · 8 kuluri') }
];
const LEVELS = [
  { lvl:0, name:()=>T('Gentle','Ħelu'),   note:()=>T('Guesses loosely','Jaqta\' bl-addoċċ') },
  { lvl:1, name:()=>T('Sharp','Jaqta\''),  note:()=>T('Splits the field','Jifred il-qasam') },
  { lvl:2, name:()=>T('Ruthless','Bla ħniena'), note:()=>T('Knuth solver','Solver ta\' Knuth') }
];

/* ═══════════════════════════════════════════════════════════════════
   CSS — injected once, scoped to #scr-party, prefix .kd-*
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS(){
  if (document.getElementById('kodici-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'kodici-runtime-css';
  st.textContent = `
#scr-party .kd-menu .scroll{padding-bottom:calc(env(safe-area-inset-bottom,0px) + 20px)}
#scr-party .kd-hero{position:relative;height:132px;border-radius:16px;margin:6px 0 16px;
  overflow:hidden;background:radial-gradient(120% 140% at 50% -20%,#241a3a,#0E0B14);
  border:1px solid var(--line,rgba(255,255,255,.08));display:flex;align-items:center;justify-content:center}
#scr-party .kd-hero .kd-hrow{display:flex;gap:9px}
#scr-party .kd-hero .kd-hp{width:34px;height:34px;border-radius:50%;box-shadow:inset 0 -3px 6px rgba(0,0,0,.35),0 3px 8px rgba(0,0,0,.4);
  display:flex;align-items:center;justify-content:center;font:900 14px/1 var(--disp,inherit);color:#0E0B14}
#scr-party .kd-hero .kd-fb{position:absolute;right:14px;top:14px;display:grid;grid-template-columns:1fr 1fr;gap:5px}
#scr-party .kd-hero .kd-fbp{width:10px;height:10px;border-radius:50%}
@media (max-height:560px){#scr-party .kd-hero{height:92px}#scr-party .kd-hero .kd-hp{width:26px;height:26px}}

#scr-party .kd-modes{display:flex;flex-direction:column;gap:10px;margin-top:4px}
#scr-party .kd-mode{display:flex;align-items:center;gap:12px;width:100%;text-align:left;
  padding:14px 14px;border-radius:14px;border:1px solid var(--line,rgba(255,255,255,.09));
  background:rgba(255,255,255,.03);color:var(--txt,#EDE7F6);cursor:pointer;transition:transform .12s var(--ease,ease),background .12s}
#scr-party .kd-mode:hover{background:rgba(255,255,255,.06)}
#scr-party .kd-mode:active{transform:scale(.985)}
#scr-party .kd-mode.primary{border-color:rgba(255,197,66,.55);background:linear-gradient(180deg,rgba(255,197,66,.14),rgba(255,197,66,.04))}
#scr-party .kd-mode .mi{flex:0 0 34px;height:34px;display:flex;align-items:center;justify-content:center;color:var(--gold,#FFC542)}
#scr-party .kd-mode .mi svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#scr-party .kd-mode .mt{flex:1 1 auto;display:flex;flex-direction:column;gap:2px;min-width:0}
#scr-party .kd-mode .mt b{font:800 15px/1.1 var(--disp,inherit)}
#scr-party .kd-mode .mt i{font-style:normal;font-size:12px;color:var(--dim,#9d95b0)}
#scr-party .kd-mode .chev{flex:0 0 auto;color:var(--dim,#9d95b0)}
#scr-party .kd-mode .chev svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

/* sliding rules sheet */
#scr-party .kd-scrim{position:fixed;inset:0;background:rgba(6,4,12,.55);opacity:0;pointer-events:none;
  transition:opacity .22s var(--ease,ease);z-index:40}
#scr-party .kd-scrim.on{opacity:1;pointer-events:auto}
#scr-party .kd-sheet{position:fixed;left:0;right:0;bottom:0;z-index:41;max-height:82vh;overflow:auto;
  background:linear-gradient(180deg,#191129,#120c1e);border-top-left-radius:20px;border-top-right-radius:20px;
  border-top:1px solid var(--line,rgba(255,255,255,.1));box-shadow:0 -18px 50px rgba(0,0,0,.5);
  transform:translateY(101%);transition:transform .28s var(--ease,cubic-bezier(.22,.9,.28,1));
  padding:16px 18px calc(env(safe-area-inset-bottom,0px) + 22px)}
#scr-party .kd-sheet.open{transform:none}
#scr-party .kd-sheet h3{margin:2px 0 6px;font:900 16px/1.2 var(--disp,inherit);color:var(--gold,#FFC542);
  letter-spacing:.04em;text-transform:uppercase}
#scr-party .kd-sheet ul{margin:8px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:9px}
#scr-party .kd-sheet li{font-size:13px;line-height:1.55;color:var(--txt,#EDE7F6)}
#scr-party .kd-sheet .kd-x{position:absolute;top:12px;right:14px}
#scr-party .kd-sheet .kd-legend{display:flex;gap:14px;margin-top:14px;flex-wrap:wrap}
#scr-party .kd-sheet .kd-legend span{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--dim,#9d95b0)}
#scr-party .kd-sheet .kd-lg{width:14px;height:14px;border-radius:50%;border:1px solid rgba(255,255,255,.3)}

/* options step */
#scr-party .kd-opts{display:flex;flex-direction:column;gap:16px;margin-top:8px}
#scr-party .kd-lbl{font:800 11px/1 var(--disp,inherit);letter-spacing:.12em;text-transform:uppercase;color:var(--dim,#9d95b0);margin-bottom:8px}
#scr-party .kd-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
#scr-party .kd-opt{padding:11px 8px;border-radius:12px;border:1px solid var(--line,rgba(255,255,255,.09));
  background:rgba(255,255,255,.03);color:var(--txt,#EDE7F6);cursor:pointer;text-align:center;transition:.12s}
#scr-party .kd-opt.on{border-color:var(--gold,#FFC542);background:rgba(255,197,66,.12)}
#scr-party .kd-opt b{display:block;font:800 13px/1.1 var(--disp,inherit)}
#scr-party .kd-opt i{font-style:normal;font-size:10.5px;color:var(--dim,#9d95b0)}
#scr-party .kd-limrow{display:flex;align-items:center;justify-content:center;gap:14px}
#scr-party .kd-rnd{width:40px;height:40px;border-radius:50%;border:1px solid var(--line,rgba(255,255,255,.14));
  background:rgba(255,255,255,.05);color:var(--txt,#EDE7F6);font-size:22px;line-height:1;cursor:pointer}
#scr-party .kd-rnd:disabled{opacity:.35}
#scr-party .kd-limv{min-width:96px;text-align:center;font:900 22px/1 var(--disp,inherit)}
#scr-party .kd-limv i{display:block;font-style:normal;font-size:11px;color:var(--dim,#9d95b0);margin-top:3px}

/* ── the board — a column that fills the host; only the history scrolls,
      the compose dock stays pinned under the thumb ── */
#scr-party .kd-board{display:flex;flex-direction:column;gap:10px;padding:4px 2px 2px;
  height:100%;min-height:0;box-sizing:border-box}
#scr-party .kd-status{display:flex;align-items:center;justify-content:space-between;gap:10px;
  font-size:12px;color:var(--dim,#9d95b0);flex:0 0 auto;padding:0 2px}
#scr-party .kd-status .kd-who{font:800 13.5px/1.1 var(--disp,inherit);color:var(--txt,#EDE7F6)}
#scr-party .kd-status .kd-tag{padding:3px 10px;border-radius:999px;background:rgba(255,197,66,.14);
  color:var(--gold,#FFC542);font-weight:800;font-size:10.5px;letter-spacing:.08em}
#scr-party .kd-hint{flex:0 0 auto;font-size:11.5px;line-height:1.45;color:var(--dim,#9d95b0);
  margin:0;padding:0 2px}

#scr-party .kd-history{display:flex;flex-direction:column;gap:6px;flex:1 1 auto;min-height:48px;
  overflow-y:auto;overflow-x:hidden;padding:2px 2px 6px;-webkit-overflow-scrolling:touch;
  mask-image:linear-gradient(180deg,transparent 0,#000 10px);}
#scr-party .kd-rowline{display:flex;align-items:center;gap:10px;padding:7px 9px;border-radius:13px;
  background:rgba(255,255,255,.03);border:1px solid var(--line,rgba(255,255,255,.06));
  will-change:transform,opacity}
#scr-party .kd-rowline .kd-no{flex:0 0 18px;font:800 11px/1 var(--disp,inherit);color:var(--dim,#9d95b0);
  text-align:center;opacity:.75}
#scr-party .kd-pegs{display:flex;gap:6px;flex:1 1 auto;min-width:0}
#scr-party .kd-fbgrid{flex:0 0 auto;display:grid;grid-gap:3px;grid-template-columns:1fr 1fr;
  align-content:center;padding:3px;border-radius:8px;background:rgba(0,0,0,.18)}
#scr-party .kd-fbp{width:9px;height:9px;border-radius:50%;background:transparent;
  border:1px solid rgba(255,255,255,.16)}
/* GREEN for right-place, YELLOW for right-colour-wrong-place.
   These were the board-game colours, black and white — and black was
   #0d0d12 against an app background of #0A0712, which is a peg you
   cannot see. The whole game is reading these four dots, so they have
   to be the most legible thing on the row, and green-good / yellow-close
   is a language every player already speaks. */
#scr-party .kd-fbp.exact{background:radial-gradient(circle at 34% 30%,#8CF5BE,#3DDC84 62%,#1FA968);
  border-color:#7CEBB4;box-shadow:0 0 0 1px rgba(61,220,132,.35),0 0 6px rgba(61,220,132,.55),0 1px 2px rgba(0,0,0,.5)}
#scr-party .kd-fbp.near{background:radial-gradient(circle at 34% 30%,#FFE9B0,#FFC542 62%,#C98A00);
  border-color:#FFD979;box-shadow:0 0 0 1px rgba(255,197,66,.32),0 0 6px rgba(255,197,66,.45),0 1px 2px rgba(0,0,0,.5)}
/* the empty sockets have to read as empty, not as a third colour */
#scr-party .kd-fbp{background:rgba(255,255,255,.03)}

/* newest row slides+fades in */
#scr-party .kd-rowline.reveal{animation:kdReveal .40s var(--ease,cubic-bezier(.22,.9,.28,1)) both}
@keyframes kdReveal{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
/* the winning row glows and pulses before the winner screen */
#scr-party .kd-rowline.win{animation:kdWinPulse 1.1s var(--ease,ease) 1;
  border-color:rgba(255,197,66,.6);background:rgba(255,197,66,.08)}
@keyframes kdWinPulse{0%{box-shadow:0 0 0 0 rgba(255,197,66,0)}
  30%{box-shadow:0 0 0 3px rgba(255,197,66,.35),0 0 22px rgba(255,197,66,.5);transform:scale(1.02)}
  100%{box-shadow:0 0 0 0 rgba(255,197,66,0);transform:none}}
/* feedback pegs flip/pop in, staggered (exacts first) */
#scr-party .kd-fbp.pop{animation:kdFbPop .34s var(--ease,cubic-bezier(.34,1.56,.64,1)) both}
@keyframes kdFbPop{0%{transform:scale(0) rotate(-90deg);opacity:0}
  55%{transform:scale(1.4) rotate(8deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}
/* invalid submit shake, applied to the whole compose dock */
#scr-party .kd-compose.shake{animation:kdShake .42s cubic-bezier(.36,.07,.19,.97) both}
@keyframes kdShake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(3px)}
  30%,50%,70%{transform:translateX(-6px)}40%,60%{transform:translateX(6px)}}

/* a peg */
#scr-party .kd-peg{position:relative;width:34px;height:34px;border-radius:50%;flex:0 0 auto;
  display:flex;align-items:center;justify-content:center;font:900 13px/1 var(--disp,inherit);color:#0E0B14;
  box-shadow:inset 0 -3px 6px rgba(0,0,0,.32),0 2px 6px rgba(0,0,0,.4);user-select:none}
#scr-party .kd-peg.empty{background:rgba(255,255,255,.04)!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);color:transparent}
#scr-party .kd-peg .kd-shape{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.92}
#scr-party .kd-peg .kd-shape svg{width:16px;height:16px}
#scr-party .kd-peg .kd-lt{position:relative;z-index:2;text-shadow:0 1px 1px rgba(0,0,0,.25)}
#scr-party .kd-peg.sm{width:27px;height:27px;font-size:11px}
#scr-party .kd-peg.sm .kd-shape svg{width:12px;height:12px}
/* a peg dropping into a compose slot */
#scr-party .kd-peg.drop{animation:kdDrop .34s var(--ease,cubic-bezier(.34,1.56,.64,1)) both}
@keyframes kdDrop{0%{transform:translateY(-16px) scale(.5);opacity:0}
  60%{transform:translateY(2px) scale(1.14);opacity:1}100%{transform:translateY(0) scale(1);opacity:1}}

/* the compose row + palette — a pinned dock */
#scr-party .kd-compose{display:flex;flex-direction:column;gap:11px;padding:12px 4px calc(env(safe-area-inset-bottom,0px) + 4px);
  flex:0 0 auto;border-top:1px solid var(--line,rgba(255,255,255,.08));
  background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.015))}
#scr-party .kd-slotrow{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
#scr-party .kd-slot{width:46px;height:46px;border-radius:50%;border:2px dashed rgba(255,255,255,.16);
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  transition:border-color .16s var(--ease,ease),transform .12s var(--ease,ease),box-shadow .16s;
  background:rgba(255,255,255,.02)}
#scr-party .kd-slot:active{transform:scale(.94)}
#scr-party .kd-slot.on{border-style:solid;border-color:var(--gold,#FFC542);
  box-shadow:0 0 0 3px rgba(255,197,66,.14)}
/* the active (next-to-fill) slot breathes so it's obvious where a tap lands */
#scr-party .kd-slot.on.pulse{animation:kdSlotPulse 1.7s ease-in-out infinite}
@keyframes kdSlotPulse{0%,100%{box-shadow:0 0 0 3px rgba(255,197,66,.1)}
  50%{box-shadow:0 0 0 5px rgba(255,197,66,.28)}}
#scr-party .kd-slot .kd-peg{width:40px;height:40px}
#scr-party .kd-palette{display:flex;gap:9px;flex-wrap:wrap;justify-content:center;max-width:340px;margin:0 auto}
#scr-party .kd-swatch{width:42px;height:42px;border-radius:13px;cursor:pointer;position:relative;
  display:flex;align-items:center;justify-content:center;font:900 14px/1 var(--disp,inherit);color:#0E0B14;
  box-shadow:inset 0 -3px 6px rgba(0,0,0,.3),0 2px 6px rgba(0,0,0,.35);
  transition:transform .1s var(--ease,ease),box-shadow .1s;-webkit-tap-highlight-color:transparent}
#scr-party .kd-swatch:active{transform:scale(.86);box-shadow:inset 0 -1px 3px rgba(0,0,0,.4),0 1px 3px rgba(0,0,0,.4)}
#scr-party .kd-swatch.tap{animation:kdSwatchTap .22s var(--ease,ease)}
@keyframes kdSwatchTap{0%{transform:scale(.86)}55%{transform:scale(1.12)}100%{transform:scale(1)}}
#scr-party .kd-swatch .kd-shape{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.9}
#scr-party .kd-swatch .kd-shape svg{width:16px;height:16px}
#scr-party .kd-swatch .kd-lt{position:relative;z-index:2;text-shadow:0 1px 1px rgba(0,0,0,.25)}
#scr-party .kd-acts{display:flex;gap:10px;margin-top:1px}
#scr-party .kd-acts .btn{flex:1 1 auto}

/* handover veil (klabb pattern — FULLY OPAQUE) */
#scr-party .kd-veil{position:absolute;inset:0;z-index:24;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:16px;padding:26px;text-align:center;
  background:linear-gradient(180deg,#0A0712,#150D24)}
#scr-party .kd-veil .kd-eye{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:rgba(255,197,66,.12);color:var(--gold,#FFC542)}
#scr-party .kd-veil .kd-eye svg{width:34px;height:34px;fill:none;stroke:currentColor;stroke-width:2}
#scr-party .kd-veil h4{font:900 16px/1.3 var(--disp,inherit);letter-spacing:.05em;text-transform:uppercase;color:var(--gold,#FFC542);margin:0}
#scr-party .kd-veil p{font-size:12.5px;line-height:1.6;color:var(--dim,#9d95b0);margin:0;max-width:290px}
#scr-party .kd-veil .btn{min-width:220px}

@media (prefers-reduced-motion:reduce){
  #scr-party .kd-rowline.reveal,#scr-party .kd-rowline.win,#scr-party .kd-fbp.pop,
  #scr-party .kd-peg.drop,#scr-party .kd-slot.on.pulse,#scr-party .kd-swatch.tap,
  #scr-party .kd-compose.shake{animation:none!important}
  #scr-party .kd-history{mask-image:none}
  #scr-party .kd-sheet{transition:none}
}
body.reduced #scr-party .kd-rowline.reveal,body.reduced #scr-party .kd-rowline.win,
body.reduced #scr-party .kd-fbp.pop,body.reduced #scr-party .kd-peg.drop,
body.reduced #scr-party .kd-slot.on.pulse,body.reduced #scr-party .kd-swatch.tap,
body.reduced #scr-party .kd-compose.shake{animation:none!important}
body.reduced #scr-party .kd-history{mask-image:none}
body.reduced #scr-party .kd-sheet{transition:none}
`;
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   SVG bits
   ═══════════════════════════════════════════════════════════════════ */
const ICO = {
  globe:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  bot:'<svg viewBox="0 0 24 24"><rect x="5" y="8" width="14" height="10" rx="2"/><path d="M12 8V4M9 13h.01M15 13h.01M2 12v3M22 12v3"/></svg>',
  phone:'<svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 19h4"/></svg>',
  book:'<svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h12"/></svg>',
  chev:'<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  eye:'<svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>'
};
/* the little shape drawn behind a peg's letter (colour-blind aid) */
function shapeSVG(shape){
  const s = 'fill="rgba(0,0,0,.28)" stroke="rgba(0,0,0,.35)" stroke-width="1"';
  switch(shape){
    case 'square':   return `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" ${s}/></svg>`;
    case 'triangle': return `<svg viewBox="0 0 24 24"><path d="M12 3l9 17H3z" ${s}/></svg>`;
    case 'diamond':  return `<svg viewBox="0 0 24 24"><path d="M12 2l9 10-9 10-9-10z" ${s}/></svg>`;
    case 'hexagon':  return `<svg viewBox="0 0 24 24"><path d="M7 3h10l5 9-5 9H7L2 12z" ${s}/></svg>`;
    case 'pentagon': return `<svg viewBox="0 0 24 24"><path d="M12 2l9 7-3.5 11h-11L3 9z" ${s}/></svg>`;
    case 'droplet':  return `<svg viewBox="0 0 24 24"><path d="M12 2c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z" ${s}/></svg>`;
    case 'heart':    return `<svg viewBox="0 0 24 24"><path d="M12 21C5 15 3 11 3 8a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 3-2 7-9 13z" ${s}/></svg>`;
    case 'star':     return `<svg viewBox="0 0 24 24"><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" ${s}/></svg>`;
    case 'star8':    return `<svg viewBox="0 0 24 24"><path d="M12 2l2 6 6-2-2 6 6 2-6 2 2 6-6-2-2 6-2-6-6 2 2-6-6-2 6-2-2-6 6 2z" ${s}/></svg>`;
    default:         return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" ${s}/></svg>`;
  }
}
/* ── THE CIPHER VAULT (kodici.pegs.excl) — pegs of pure neon.
   The board only ever shows the VIEWER's own guesses (see paintBoard's
   header: the opponent never renders my pegs), so this is a wholly
   local surface — the equipped set paints here and nothing needs to
   travel. Each peg keeps its colour and shape (the colour-blind aid is
   the game), and gains a neon halo in its own hue. ─────────────────── */
function vaultOn(){
  try {
    const XP = window.KARTI_XP;
    return !!XP && XP.equipped('pegs', 'kodici') === 'kodici.pegs.excl';
  } catch(e){ return false; }
}
function pegGlow(hex){
  return vaultOn()
    ? `;box-shadow:0 0 9px ${hex},0 0 2px #fff inset,0 1px 3px rgba(0,0,0,.45);` +
      `outline:1px solid rgba(255,255,255,.55);outline-offset:-1px`
    : '';
}
/* a peg element html for colour index c (or -1 = empty) */
function pegHTML(c, cls){
  cls = cls || '';
  if (c == null || c < 0) return `<div class="kd-peg empty ${cls}"></div>`;
  const p = PEGS[c];
  return `<div class="kd-peg ${cls}" style="background:${p.hex}${pegGlow(p.hex)}" role="img" aria-label="${esc(T(p.name,p.mt))}">`
    + `<span class="kd-shape">${shapeSVG(p.shape)}</span>`
    + `<span class="kd-lt">${esc(p.glyph)}</span></div>`;
}
function swatchHTML(c, cls){
  const p = PEGS[c];
  return `<button class="kd-swatch ${cls||''}" data-c="${c}" style="background:${p.hex}${pegGlow(p.hex)}" aria-label="${esc(T(p.name,p.mt))}">`
    + `<span class="kd-shape">${shapeSVG(p.shape)}</span><span class="kd-lt">${esc(p.glyph)}</span></button>`;
}

/* ═══════════════════════════════════════════════════════════════════
   THE MENU (screen one — minimal)
   ═══════════════════════════════════════════════════════════════════ */
function menu(){
  injectCSS();
  P.show();
  M = null;
  const el = P.ui.screenEl();
  const hasSave = !!(ST.save && ST.save.log);
  el.innerHTML =
    '<div class="pt-wrap kd-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="kd-back" aria-label="'+esc(T('Back','Lura'))+'">'+ICO.back+'</button>' +
        '<h2>IL-KAĊĊA TAL-KODIĊI</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<div class="kd-hero" aria-hidden="true">'+heroHTML()+'</div>' +
        (hasSave ? '<button class="btn primary" id="kd-resume" style="width:100%;margin-bottom:12px">'+
          esc(T('Carry on the last hunt','Kompli l-aħħar kaċċa'))+'</button>' : '') +
        '<div class="kd-modes">' +
          modeBtn('online','primary', ICO.globe, T('Play online','Ilgħab onlajn'), T('Two phones, two secret codes.','Żewġ telefowns, żewġ kodiċi.')) +
          modeBtn('ai','', ICO.bot, T('Play with AI','Ilgħab mal-magna'), T('The code-hunter, three strengths.','Il-kaċċatur tal-kodiċi.')) +
          modeBtn('pass','', ICO.phone, T('Pass the phone','Għaddi t-telefown'), T('One phone, take turns.','Telefown wieħed, imiss.')) +
          modeBtn('rules','', ICO.book, T('How to play','Kif tilgħab'), T('Exact hits and near misses.','Eżatti u qrib.')) +
        '</div>' +
      '</div>' +
      rulesSheetHTML() +
    '</div>';

  el.querySelector('#kd-back').onclick = () => { cue('ui.back',{gain:.7}); P.hub(); };
  const r = el.querySelector('#kd-resume'); if (r) r.onclick = () => { cue('ui.tap',{gain:.6}); resumeGame(); };
  el.querySelector('#kd-m-online').onclick = () => { cue('ui.tap',{gain:.6}); goOnline(); };
  el.querySelector('#kd-m-ai').onclick     = () => { cue('ui.tap',{gain:.6}); setupStep('ai'); };
  el.querySelector('#kd-m-pass').onclick   = () => { cue('ui.tap',{gain:.6}); setupStep('pass'); };

  const sheet = el.querySelector('#kd-sheet'), scrim = el.querySelector('#kd-scrim');
  const openR  = () => { cue('ui.sheet',{gain:.55}); sheet.classList.add('open'); scrim.classList.add('on'); sheet.setAttribute('aria-hidden','false'); };
  const closeR = () => { cue('ui.back',{gain:.4}); sheet.classList.remove('open'); scrim.classList.remove('on'); sheet.setAttribute('aria-hidden','true'); };
  el.querySelector('#kd-m-rules').onclick = openR;
  el.querySelector('#kd-sheet-x').onclick = closeR;
  scrim.onclick = closeR;
}
function modeBtn(id, cls, ico, title, sub){
  return `<button class="kd-mode ${cls}" id="kd-m-${id}">`+
    `<span class="mi">${ico}</span>`+
    `<span class="mt"><b>${esc(title)}</b><i>${esc(sub)}</i></span>`+
    `<span class="chev">${ICO.chev}</span></button>`;
}
function heroHTML(){
  const cols = [0,3,2,1];
  const row = '<div class="kd-hrow">'+cols.map(c=>{
    const p = PEGS[c];
    return `<div class="kd-hp" style="background:${p.hex}"><span>${esc(p.glyph)}</span></div>`;
  }).join('')+'</div>';
  const fb = '<div class="kd-fb">'+
    ['#111','#111','#f4f1ff','transparent'].map(c=>`<div class="kd-fbp" style="background:${c};${c==='transparent'?'border:1px solid rgba(255,255,255,.2)':''}"></div>`).join('')+
    '</div>';
  return row + fb;
}
function rulesSheetHTML(){
  const li = [
    T('Each player sets a SECRET code — a row of coloured pegs.','Kull plejer jistabbilixxi kodiċi SIGRIET — ringiela pinnijiet ikkuluriti.'),
    T('Take turns guessing the OTHER player\'s code.','Imisskom taqtgħu l-kodiċi ta\' xulxin.'),
    T('After each guess you get feedback pegs:','Wara kull taħbita tirċievi pinnijiet ta\' feedback:'),
    T('● GREEN = right colour, RIGHT slot.','● AĦDAR = kulur tajjeb, spazju TAJJEB.'),
    T('● YELLOW = right colour, wrong slot.','● ISFAR = kulur tajjeb, spazju ħażin.'),
    /* the thing every Mastermind player has to be told once, and the
       thing the owner asked for in as many words: the pegs are a TALLY */
    T('The pegs do NOT say WHICH one — only how many.',
      'Il-pinnijiet ma jgħidux LIEMA — biss kemm.'),
    T('Feedback pegs are unordered — they never say which slot.','Il-pinnijiet mhumiex ordnati — qatt ma jgħidu liema spazju.'),
    T('First to crack the opponent\'s code wins.','L-ewwel li jaqta\' l-kodiċi jirbaħ.'),
    T('Colours repeat, so a code can use one colour twice.','Il-kuluri jistgħu jirrepetu.')
  ];
  const legend = '<div class="kd-legend">'+
    '<span><i class="kd-lg" style="background:#3DDC84"></i>'+esc(T('right place','post tajjeb'))+'</span>'+
    '<span><i class="kd-lg" style="background:#FFC542"></i>'+esc(T('wrong place','post ħażin'))+'</span>'+
    '</div>';
  return '<div class="kd-scrim" id="kd-scrim"></div>'+
    '<div class="kd-sheet" id="kd-sheet" role="dialog" aria-modal="true" aria-hidden="true" style="position:relative">'+
      '<button class="iconbtn kd-x" id="kd-sheet-x" aria-label="'+esc(T('Close','Agħlaq'))+'">✕</button>'+
      '<h3>'+esc(T('How to play','Kif tilgħab'))+'</h3>'+
      '<ul>'+li.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>'+legend+
    '</div>';
}

/* ═══════════════════════════════════════════════════════════════════
   OPTIONS STEP (second screen — N/K, difficulty, guess limit)
   ═══════════════════════════════════════════════════════════════════ */
function setupStep(mode){
  injectCSS();
  const el = P.ui.screenEl();
  const cfg = Object.assign({ board:'classic', lvl:2, limit:10 }, pref().cfg || {});
  const back = () => { cue('ui.back',{gain:.6}); menu(); };

  function render(){
    el.innerHTML =
      '<div class="pt-wrap kd-menu">' +
        '<div class="tbar">' +
          '<button class="iconbtn" id="kd-back">'+ICO.back+'</button>' +
          '<h2>'+esc(mode==='ai'?T('Play with AI','Mal-magna'):T('Pass the phone','Għaddi t-telefown'))+'</h2>' +
        '</div>' +
        '<div class="scroll"><div class="kd-opts">' +
          '<div><div class="kd-lbl">'+esc(T('Board','Bord'))+'</div><div class="kd-grid" id="kd-board">'+
            BOARD_OPTS.map(b=>`<button class="kd-opt ${b.id===cfg.board?'on':''}" data-b="${b.id}"><b>${esc(b.name())}</b><i>${esc(b.note())}</i></button>`).join('')+
          '</div></div>' +
          (mode==='ai' ? '<div><div class="kd-lbl">'+esc(T('AI strength','Saħħa'))+'</div><div class="kd-grid" id="kd-lvl">'+
            LEVELS.map(l=>`<button class="kd-opt ${l.lvl===cfg.lvl?'on':''}" data-l="${l.lvl}"><b>${esc(l.name())}</b><i>${esc(l.note())}</i></button>`).join('')+
          '</div></div>' : '') +
          '<div><div class="kd-lbl">'+esc(T('Guess limit','Limitu'))+'</div><div class="kd-limrow">'+
            '<button class="kd-rnd" id="kd-lim-dn">−</button>'+
            '<div class="kd-limv" id="kd-limv"></div>'+
            '<button class="kd-rnd" id="kd-lim-up">+</button>'+
          '</div></div>' +
          '<button class="btn primary" id="kd-start" style="width:100%;margin-top:6px">'+esc(T('Start','Ibda'))+'</button>' +
        '</div></div>' +
      '</div>';
    paintLimit();
    el.querySelector('#kd-back').onclick = back;
    el.querySelectorAll('#kd-board .kd-opt').forEach(b=>b.onclick=()=>{ cue('move.select',{gain:.5}); cfg.board=b.dataset.b; render(); });
    const lv = el.querySelector('#kd-lvl'); if (lv) lv.querySelectorAll('.kd-opt').forEach(b=>b.onclick=()=>{ cue('move.select',{gain:.5}); cfg.lvl=+b.dataset.l; render(); });
    el.querySelector('#kd-lim-dn').onclick = ()=>{ cfg.limit = clampLimit(cfg.limit-1); cue('ui.tap',{gain:.4}); paintLimit(); };
    el.querySelector('#kd-lim-up').onclick = ()=>{ cfg.limit = clampLimit(cfg.limit+1); cue('ui.tap',{gain:.4}); paintLimit(); };
    el.querySelector('#kd-start').onclick = ()=>{ cue('game.start',{gain:.8},true); pref({cfg}); startLocal(mode, cfg); };
  }
  function clampLimit(v){ if (v < 0) return 0; if (v > 20) return 20; return v; }
  function paintLimit(){
    const v = el.querySelector('#kd-limv'); if (!v) return;
    v.innerHTML = (cfg.limit===0)
      ? '∞<i>'+esc(T('unlimited','bla limitu'))+'</i>'
      : cfg.limit+'<i>'+esc(T('guesses each','taħbitiet'))+'</i>';
    const dn=el.querySelector('#kd-lim-dn'), up=el.querySelector('#kd-lim-up');
    if(dn)dn.disabled=(cfg.limit<=0); if(up)up.disabled=(cfg.limit>=20);
  }
  render();
}

/* ═══════════════════════════════════════════════════════════════════
   START A LOCAL MATCH (vs AI or pass-the-phone)
   ═══════════════════════════════════════════════════════════════════ */
function boardOpts(cfg){
  const b = BOARD_OPTS.find(x=>x.id===cfg.board) || BOARD_OPTS[0];
  return { slots:b.slots, colours:b.colours, limit:cfg.limit|0, lvl:cfg.lvl|0 };
}
function startLocal(mode, cfg){
  injectCSS();
  const o = boardOpts(cfg);
  const seed = E.newSeed();
  M = {
    opts: Object.assign({}, o, { deal:'seed', mode }),
    seed, log:[], secrets:[null,null],
    mode, you:0, ctx:null, phase:'setA', draft:[], veil:0, shown:-1, net:null, dead:false
  };
  /* build the engine state as a PRIVATE-deal shell — we fill secrets by
     hand from the humans (pass-phone) or human+AI so the seed never
     silently reveals the human's own code to nobody's benefit; but for a
     purely local device the seed deal is equally private, so we use it
     for the AI's secret and let the human set their own. */
  M.st = E.newMatch(Object.assign({}, o, { deal:'private' }), seed);

  if (mode === 'ai'){
    /* you are seat 0. The AI (seat 1) holds a random secret. You set yours. */
    const aiCode = E.aiSecret(M.st);
    M.secrets[1] = aiCode.slice();
    E.setSecret(M.st, 1, aiCode);
    M.phase = 'setA';                    /* you set your code first */
  } else {
    /* pass-the-phone: both humans set a code, behind the veil. seat 0 first. */
    M.phase = 'setA';
  }
  openBoard(() => (mode==='ai'?setupStep('ai'):setupStep('pass')));
  saveGame();
  render();
}

/* ═══════════════════════════════════════════════════════════════════
   THE BOARD FRAME
   ═══════════════════════════════════════════════════════════════════ */
function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: 'IL-KODIĊI',
    onBack: () => { cue('ui.back',{gain:.7}); leave(); onBack(); },
    leave: () => leave(),
    buttons: []
  });
}
function leave(){
  if (M){ M.dead = true; }
  persistNow();
}

/* who is the local viewer's active seat right now?
   - ai:    always seat 0 (you); AI is seat 1
   - pass:  the seat whose turn it is (both are "hot" humans)
   - online: M.you (fixed) */
function activeSeat(){
  if (!M) return 0;
  if (M.mode === 'online') return M.you;
  if (M.mode === 'ai') return 0;
  return E.turn(M.st);   /* pass */
}
function isHotHuman(seat){
  if (M.mode === 'ai') return seat === 0;
  if (M.mode === 'pass') return true;
  return seat === M.you;
}

/* ═══════════════════════════════════════════════════════════════════
   RENDER — the whole board from state. Handles the SET phase (compose
   your secret), the PLAY phase (guess + history + feedback), the veil,
   and drives the AI.
   ═══════════════════════════════════════════════════════════════════ */
function render(){
  if (!M || M.dead || !M.ctx) return;
  const host = M.ctx.host;
  host.innerHTML = '';

  /* ── PASS-THE-PHONE VEIL ── */
  if (M.mode === 'pass' && M.veil){
    host.insertAdjacentHTML('beforeend', veilHTML(M.veil));
    const b = host.querySelector('#kd-veil-go');
    if (b) b.onclick = () => { cue('duel.turn',{gain:.85},true); M.shown = M.veil; M.veil = 0; render(); };
    return;
  }

  const inSet = (M.phase === 'setA' || M.phase === 'setB');
  if (inSet){ renderSet(host); return; }
  renderPlay(host);
  maybeAI();
}

/* ── the SET phase: compose your secret code ── */
function renderSet(host){
  const seat = settingSeat();
  const o = M.opts;

  /* online: once I have locked my code I sit waiting for the opponent to lock
     theirs — do NOT show the compose grid again (that let a seat re-set, and
     showed the pass-the-phone "Player 2" prompt to a lone online player). */
  if (M.mode === 'online' && M.iSet){
    const wrap = document.createElement('div');
    wrap.className = 'kd-board';
    wrap.innerHTML =
      '<div class="kd-status"><span class="kd-who">'+esc(T('Code locked','Kodiċi stabbilit'))+'</span>'+
        '<span class="kd-tag">'+esc(T('SECRET','SIGRIET'))+'</span></div>'+
      '<div class="kd-history" style="flex:1 1 auto;display:flex;align-items:center;justify-content:center;color:var(--dim,#9d95b0);font-size:13px">'+
        esc(T('Waiting for the other player to set their code…','Nistennew lill-plejer l-ieħor jistabbilixxi l-kodiċi…'))+'</div>';
    host.appendChild(wrap);
    setBadge();
    return;
  }

  if (!M.draft.length) M.draft = new Array(o.slots).fill(-1);
  const done = M.draft.every(x => x >= 0);

  const who = (M.mode==='ai' || M.mode==='online')
            ? T('Set YOUR secret code','Stabbilixxi l-kodiċi tiegħek')
            : T('Player','Plejer')+' '+(seat+1)+' — '+T('set your code','stabbilixxi l-kodiċi');

  const wrap = document.createElement('div');
  wrap.className = 'kd-board';
  wrap.innerHTML =
    '<div class="kd-status"><span class="kd-who">'+esc(who)+'</span>'+
      '<span class="kd-tag">'+esc(T('SECRET','SIGRIET'))+'</span></div>'+
    '<p class="kd-hint">'+
      esc(T('Tap a colour — it drops into the glowing slot. This row stays hidden.','Agħżel kulur — jaqa\' fl-ispazju li jixgħel. Din ir-ringiela tibqa\' moħbija.'))+'</p>'+
    '<div class="kd-history" style="flex:1 1 auto"></div>'+
    composeHTML(M.draft, true, done);
  host.appendChild(wrap);
  wireCompose(host, /*isSecret*/true, done);
  setBadge();
}
function settingSeat(){
  /* online: each phone only ever sets its OWN code — the setting seat is us,
     never the pass-the-phone setA=0 / setB=1 alternation (that would have a
     seat-1 player set seat 0's secret). */
  if (M.mode === 'online') return M.you;
  /* setA = seat 0, setB = seat 1 */
  return M.phase === 'setB' ? 1 : 0;
}

/* the VIEWER seat: whose code-cracking board we're looking at right now.
   The board ALWAYS shows the viewer's OWN guesses at the opponent's code,
   so a player's progress never vanishes on the opponent's turn.
     ai     -> always you (seat 0)
     online -> always you (M.you)
     pass   -> whoever's turn it is (they only ever see their own board,
               and the veil hides everything between turns) */
function viewerSeat(){
  if (M.mode === 'pass') return E.turn(M.st);
  if (M.mode === 'online') return M.you;
  return 0;
}
/* ── the PLAY phase ── */
function renderPlay(host){
  const o = M.opts;
  const viewer = viewerSeat();
  const tgt = E.target(viewer);
  const myGuesses = M.st.guesses[tgt];         /* MY guesses at the opponent */
  const used = myGuesses.length;
  const limTxt = o.limit ? (used + ' / ' + o.limit) : (used + '');

  const turnSeat = E.turn(M.st);
  const mine = (turnSeat === viewer);

  const wrap = document.createElement('div');
  wrap.className = 'kd-board';
  wrap.innerHTML =
    '<div class="kd-status">'+
      '<span class="kd-who">'+esc(mine? T('Your turn','Imissek') : T('Their turn…','Imisshom…'))+'</span>'+
      '<span>'+esc(T('cracking','taqta\'')+' '+seatName(tgt)+' · '+limTxt)+'</span>'+
    '</div>'+
    '<div class="kd-history" id="kd-hist">'+historyHTML(viewer)+'</div>'+
    ((mine && !M.st.over) ? composeHTML(ensureDraft(), false, ensureDraft().every(x=>x>=0)) : waitHTML(mine));
  host.appendChild(wrap);

  /* scroll history to bottom */
  const h = host.querySelector('#kd-hist'); if (h) h.scrollTop = h.scrollHeight;

  if (mine && !M.st.over) wireCompose(host, false, ensureDraft().every(x=>x>=0));
  setBadge();

  if (M.st.over){
    /* let the winning row celebrate (pulse/glow) before the rebbieh screen.
       Only a FRESH crack — the last row all-exact with a pending reveal — is
       worth the wait; a replayed/resumed over-state jumps straight to it. */
    const list = M.st.guesses[E.target(viewer)];
    const last = list && list[list.length-1];
    const freshCrack = last && last.fb.exact === M.opts.slots
                       && M._reveal === (list.length-1) && !noMotion();
    if (freshCrack && !M._celebrating){
      M._celebrating = true;
      const mk = M;
      setTimeout(() => {
        if (M !== mk || M.dead) return;
        M._celebrating = false;
        finishScreen();
      }, 950);
    } else if (!M._celebrating){
      finishScreen();
    }
  }
}
function ensureDraft(){
  if (!M.draft || M.draft.length !== M.opts.slots) M.draft = new Array(M.opts.slots).fill(-1);
  return M.draft;
}
function waitHTML(mine){
  return '<div class="kd-compose" style="align-items:center;justify-content:center;min-height:70px;color:var(--dim,#9d95b0);font-size:13px">'+
    esc(mine?'':T('Waiting for the other player…','Nistennew lill-plejer l-ieħor…'))+'</div>';
}

/* the viewer's own guesses at the opponent's code, newest last, each with
   its feedback pegs. */
function historyHTML(viewer){
  const tgt = E.target(viewer);
  const list = M.st.guesses[tgt];
  if (!list.length){
    return '<div style="text-align:center;color:var(--dim,#9d95b0);font-size:12px;padding:14px 0">'+
      esc(T('No guesses yet. Break their code.','Għadha ebda taħbita.'))+'</div>';
  }
  const anim = !noMotion();
  return list.map((rec,i)=>{
    const isLast = i === list.length-1;
    const isReveal = anim && isLast && M._reveal===i;
    const cracked = rec.fb.exact === M.opts.slots;
    const isWin = anim && isLast && cracked;      /* winning row celebrates */
    const pegs = rec.g.map(c=>pegHTML(c,'sm')).join('');
    const fb = fbGridHTML(rec.fb, M.opts.slots, isReveal);
    const cls = 'kd-rowline' + (isReveal?' reveal':'') + (isWin?' win':'');
    return `<div class="${cls}">`+
      `<span class="kd-no">${i+1}</span>`+
      `<span class="kd-pegs">${pegs}</span>`+
      `${fb}</div>`;
  }).join('');
}
/* feedback pegs. When `pop`, they flip in staggered: green exacts first,
   then yellow nears, so the earned feedback reveals in a tasteful sequence.
   The reveal is a one-shot, so M._reveal is left for the row to consume. */
function fbGridHTML(fb, slots, pop){
  const dots = [];
  for (let i=0;i<fb.exact;i++) dots.push('exact');
  for (let i=0;i<fb.near;i++)  dots.push('near');
  while (dots.length < slots) dots.push('');
  /* stagger only the filled pegs, in exact→near order, ~90ms apart, after a
     small lead-in so the row settles before its verdict lands. */
  let step = 0;
  /* The pegs are a TALLY and never a map: they are built by COUNT, in a
     2x2 block that deliberately does not line up with the guess slots, so
     nothing here can say which position was right. The engine agrees —
     scoreGuess returns {exact, near} and no indices at all. */
  return '<div class="kd-fbgrid" aria-label="'+fb.exact+' in the right place, '+
    fb.near+' right colour in the wrong place">'+
    dots.map(d=>{
      const on = pop && d;
      const delay = on ? (120 + (step++)*90) : 0;
      return `<div class="kd-fbp ${d} ${on?'pop':''}"${on?(' style="animation-delay:'+delay+'ms"'):''}></div>`;
    }).join('')+
    '</div>';
}

/* the compose row: N slots + palette + submit. isSecret gates the label. */
function composeHTML(draft, isSecret, ready){
  const o = M.opts;
  const active = draft.indexOf(-1);            /* next slot to fill, or -1 = full */
  const anim = !noMotion();
  const slots = draft.map((c,i)=>{
    const on = active===i;
    const pulse = (on && anim) ? ' pulse' : '';
    const drop = (anim && M._dropSlot===i && c>=0) ? 'drop' : '';
    return `<div class="kd-slot ${on?'on':''}${pulse}" data-slot="${i}">${c>=0?pegHTML(c,drop):''}</div>`;
  }).join('');
  const pal = [];
  for (let c=0;c<o.colours;c++) pal.push(swatchHTML(c, anim && M._tapC===c ? 'tap' : ''));
  const submit = isSecret ? T('Lock in code','Aqfel il-kodiċi') : T('Guess','Aqta\'');
  M._dropSlot = -1; M._tapC = -1;              /* consume one-shot markers */
  return '<div class="kd-compose">'+
    '<div class="kd-slotrow">'+slots+'</div>'+
    '<div class="kd-palette">'+pal.join('')+'</div>'+
    '<div class="kd-acts">'+
      '<button class="btn ghost" id="kd-clear">'+esc(T('Clear','Ħassar'))+'</button>'+
      '<button class="btn primary" id="kd-submit" '+(ready?'':'disabled')+'>'+esc(submit)+'</button>'+
    '</div></div>';
}
function wireCompose(host, isSecret, ready){
  host.querySelectorAll('.kd-swatch').forEach(sw=>{
    sw.onclick = () => {
      const c = +sw.dataset.c;
      const i = M.draft.indexOf(-1);
      const at = (i < 0) ? M.draft.length-1 : i;   /* full → replace last */
      M.draft[at] = c;
      M._dropSlot = at;                             /* pop this peg in */
      M._tapC = c;                                  /* press-feedback this swatch */
      cue('piece.place',{gain:.5});
      render();
    };
  });
  host.querySelectorAll('.kd-slot').forEach(sl=>{
    sl.onclick = () => { M.draft[+sl.dataset.slot] = -1; cue('ui.tap',{gain:.35}); render(); };
  });
  const clr = host.querySelector('#kd-clear');
  if (clr) clr.onclick = () => { M.draft = new Array(M.opts.slots).fill(-1); cue('ui.back',{gain:.35}); render(); };
  const sub = host.querySelector('#kd-submit');
  if (sub) sub.onclick = () => {
    if (M.draft.some(x=>x<0)){ cue('move.illegal',{gain:.6}); shakeCompose(host); return; }
    if (isSecret) submitSecret(M.draft.slice());
    else submitGuess(M.draft.slice());
  };
}
/* a gentle shake on a rejected submit (reduced-motion: silent no-op) */
function shakeCompose(host){
  if (noMotion()) return;
  const c = host && host.querySelector('.kd-compose');
  if (!c) return;
  c.classList.remove('shake');
  /* reflow so the animation can retrigger */
  void c.offsetWidth;
  c.classList.add('shake');
  const done = () => { c.classList.remove('shake'); c.removeEventListener('animationend', done); };
  c.addEventListener('animationend', done);
}

/* ── SET: lock a secret in ── */
function submitSecret(code){
  const seat = settingSeat();
  cue('ui.reward',{gain:.6},true);
  E.setSecret(M.st, seat, code);
  M.secrets[seat] = code.slice();
  M.draft = [];

  if (M.mode === 'online'){
    /* online: I have locked MY OWN code (it never leaves this device). Tell the
       opponent I am ready with a code-less {t:'set'} signal; when BOTH sides
       are ready both leave the SET phase together. Until then, wait. */
    M.iSet = true;
    netEcho({ t:'set' });
    maybeStartOnline();
    saveGame(); render(); return;
  }

  if (M.mode === 'ai'){
    /* only seat 0 (you) sets; AI secret already placed → straight to play */
    M.phase = 'play';
    saveGame(); render(); return;
  }
  /* pass-the-phone: seat 0 done → hand to seat 1 to set; then play */
  if (M.phase === 'setA'){
    M.phase = 'setB';
    M.veil = 1;                 /* veil before player 2 sets */
    M.shown = -1;
    saveGame(); render(); return;
  }
  /* setB done → play, veil to seat 0 (whose turn it is) */
  M.phase = 'play';
  M.veil = E.turn(M.st);
  M.shown = -1;
  saveGame(); render();
}

/* online: both codemakers have said {t:'set'} → leave the SET phase together.
   The engine's own st.phase only flips to 'play' when it holds BOTH secrets,
   which online it never does (the opponent's stays private), so we advance the
   phase explicitly here on both phones. */
function maybeStartOnline(){
  if (!M || M.mode !== 'online') return;
  if (M.iSet && M.oppSet && M.phase !== 'play'){
    M.phase = 'play';
    M.st.phase = 'play';                 /* let legalGuess/guessAt run online */
    M.veil = 0; M.shown = -1;
    render();
  }
}

/* ── PLAY: submit a guess ── */
function submitGuess(g){
  const seat = E.turn(M.st);
  if (!E.legalGuess(M.st, seat, g)){ cue('move.illegal',{gain:.6}); return; }

  if (M.mode === 'online'){
    /* online: send to relay; the OWNER computes feedback and echoes it
       back. We do NOT hold the opponent's secret, so we cannot score it
       locally. The move is applied on confirmation via onlineRemote/echo.
       A pending guard stops a second guess before the verdict lands. */
    if (M.pending) return;
    M.pending = true;
    sendOnlineGuess(seat, g);
    M.draft = [];
    render();
    return;
  }

  const tgt = E.target(seat);
  const rec = E.guessAt(M.st, seat, g);      /* local: engine scores from the secret it holds */
  if (!rec){ cue('move.illegal',{gain:.6}); return; }
  M.log.push({ seat, g:g.slice() });
  M.draft = [];
  M._reveal = M.st.guesses[tgt].length - 1;  /* animate the newest row */
  cue(rec.fb.exact===M.opts.slots ? 'ui.reward' : 'ui.note', {gain:.7}, true);
  saveGame();

  if (M.st.over){ render(); return; }

  /* pass-the-phone: raise the veil for the next human */
  if (M.mode === 'pass'){
    M.veil = E.turn(M.st);
    M.shown = -1;
  }
  render();
}

/* ── the AI takes its turn (vs-AI mode, when it is seat 1's move) ── */
let aiTimer = 0;
function maybeAI(){
  if (!M || M.dead || M.mode !== 'ai' || M.st.over) return;
  if (M.phase !== 'play') return;
  if (E.turn(M.st) !== 1) return;
  clearTimeout(aiTimer);
  const delay = noMotion() ? 60 : 620;
  const mk = M;
  aiTimer = setTimeout(() => {
    if (M !== mk || M.dead || M.st.over || E.turn(M.st) !== 1) return;
    const g = E.aiGuess(M.st, 1, M.opts.lvl);
    const tgt = E.target(1);
    const rec = E.guessAt(M.st, 1, g);
    if (rec){
      M.log.push({ seat:1, g:g.slice() });
      M._reveal = M.st.guesses[tgt].length - 1;
      cue(rec.fb.exact===M.opts.slots ? 'game.lose' : 'ui.note', {gain:.6}, true);
      saveGame();
    }
    render();
  }, delay);
}

/* ═══════════════════════════════════════════════════════════════════
   VEIL (pass-the-phone handover)
   ═══════════════════════════════════════════════════════════════════ */
function veilHTML(seat){
  const nm = seatName(seat);
  const what = (M.phase==='setB' || M.phase==='setA')
    ? T('set your secret code','tistabbilixxi l-kodiċi tiegħek')
    : T('take your guess','taqta\' l-kodiċi');
  return '<div class="kd-veil" id="kd-veil">'+
    '<div class="kd-eye">'+ICO.eye+'</div>'+
    '<h4>'+esc(nm+' — '+T('your turn','imissek'))+'</h4>'+
    '<p>'+esc(T('Everyone else, look away. Pass the phone, then tap to '+ '', 'Kulħadd iħares \'l hemm. Għaddi t-telefown, imbagħad agħfas biex ')+what+'.')+'</p>'+
    '<button class="btn primary" id="kd-veil-go">'+esc(T('I am ','Jien ')+nm)+'</button>'+
    '</div>';
}
function seatName(seat){
  if (M.mode === 'ai') return seat===0 ? T('You','Int') : T('The machine','Il-magna');
  if (M.mode === 'online') return seat===M.you ? T('You','Int') : T('Opponent','Avversarju');
  return T('Player','Plejer')+' '+(seat+1);
}
function setBadge(){
  if (!M || !M.ctx || !M.ctx.badge) return;
  let txt;
  if (M.phase==='setA'||M.phase==='setB') txt = T('Set the code','Kodiċi');
  else if (M.st.over) txt = T('Over','Spiċċa');
  else txt = T('Turn','Imiss')+' · '+seatName(E.turn(M.st));
  try { M.ctx.badge.textContent = txt; } catch(e){}
}

/* ═══════════════════════════════════════════════════════════════════
   WINNER — rebbieh, with a P.ui.result fallback
   ═══════════════════════════════════════════════════════════════════ */
let finished = false;
function finishScreen(){
  if (finished) return; finished = true;
  const w = M.st.winner;
  const you = (M.mode==='ai') ? 0 : (M.mode==='online' ? M.you : E.turn(M.st));
  /* record vs-AI results only */
  if (M.mode === 'ai'){
    if (w === 0){ ST.rec.w++; } else if (w === 1){ ST.rec.l++; } else { ST.rec.d++; }
    persist();
  }
  const rows = standings(w);
  const REB = window.KARTI_REBBIEH;
  const draw = (w === 'draw');
  const youWon = (w === you);
  const doAgain = () => { finished=false; if (M && M.net) { leave(); menu(); } else { const m=M.mode, cfg=pref().cfg||{}; leave(); m==='ai'?setupStep('ai'):(m==='pass'?setupStep('pass'):menu()); } };
  const doLeave = () => { finished=false; leave(); menu(); };

  const title = draw ? T('Dead heat','Ndaqs')
    : (M.sole && youWon) ? T('They walked out — you win','Telaq — ir-rebħa tiegħek')
    : (M.mode==='pass' ? (seatName(w)+' '+T('cracks it','jirbaħ'))
      : youWon ? T('Code cracked!','Qtajt il-kodiċi!') : T('Out-hunted','Inqbadt'));

  if (REB && REB.show){
    /* ── THE PAYMENT (tombla-ui's funnel) — the podium path bypasses the
       wrapped P.ui.result that progress.js pays through, so pay here:
       awardPlay exactly once under a stable match id (progress.js dedups
       the id across re-renders and reloads), and the pot through mp.js's
       own idempotent stakeSettle door. `ranked` only when a real pot is
       on the table. The card fallback below still pays through the wrap,
       so nothing on that path changes and nothing pays twice. */
    const MPX = window.KARTI_MP;
    const staked = !!(M.net && MPX && MPX.MP && MPX.MP.stakeLive);
    const tone = draw ? 'draw' : youWon ? 'win' : 'lose';
    /* the match id, lifted out of the payment so the RECORD BOOK below
       can be told under exactly the same id */
    const mid = (M.net && MPX && MPX.MP && MPX.MP.code != null)
      ? 'kodici:' + MPX.MP.code + ':' + ((MPX.MP.seed || 0) >>> 0)
      : (M.payId || (M.payId = 'kodici:' + Date.now().toString(36) + '-' +
                                ((Math.random() * 1e6) | 0).toString(36)));
    let pay = null, potRes = null;
    if (window.KARTI_XP && KARTI_XP.awardPlay){
      try {
        const r = KARTI_XP.awardPlay({ game:'kodici', won: tone === 'win',
                                       draw: tone === 'draw', id: mid, ranked: staked });
        if (r && r.counted) pay = r;
      } catch(e){}
    }
    /* ── THE RECORD BOOK (js/stats.js) — the profile row and the
       leaderboard. Il-Kodiċi reported to nobody, so a win here moved no
       W/L anywhere. AFTER awardPlay and under the SAME id on purpose:
       record() forwards a counted result into progress.js, whose fresh()
       has already stamped 'kodici:<mid>', so the forward lands on
       'already' and the money still moves exactly once. */
    try {
      if (window.KARTI_STATS && KARTI_STATS.record)
        KARTI_STATS.record('kodici', { result: tone === 'draw' ? 'draw' : tone === 'win' ? 'win' : 'loss',
                                       id: mid });
    } catch(e){}
    if (staked && MPX.stakeSettle){
      try { potRes = MPX.stakeSettle(tone); } catch(e){}
    }
    /* a 1v1 walk-out settled the pot in mp.js before this ran (the
       sole-win hook stashed it); the settle above was a no-op then */
    if (!potRes && tone === 'win' && M.solePot){ potRes = M.solePot; M.solePot = null; }
    REB.show({
      lang: window.KARTI_LANG ? KARTI_LANG.lang() : 'en',
      reduced: noMotion(),
      title,
      subtitle: draw ? T('Both ran out of guesses','It-tnejn spiċċaw') : T('Final standings','Klassifika finali'),
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
      sound: id => cue(id,{gain:.8},true),
      playAgainLabel: T('Again',"Erġa'"),
      onPlayAgain: doAgain,
      onLeave: doLeave
    });
  } else {
    P.ui.result(M.ctx, {
      tone: draw?'draw':(youWon?'win':'lose'),
      head: title,
      why: '',
      buttons: [
        { label:T('Again',"Erġa'"), icon:'refresh', cls:'primary', go: doAgain },
        { label:T('Back','Lura'), icon:'back', cls:'ghost', go: doLeave }
      ]
    });
  }
  ST.save = null; persist();     /* a finished match is not resumed */
}
function standings(w){
  const s0 = M.st.guesses[1].length, s1 = M.st.guesses[0].length;   /* guesses each MADE */
  const you = (M.mode==='ai') ? 0 : (M.mode==='online'?M.you:0);
  function row(seat){
    const won = (w===seat);
    return {
      name: seatName(seat),
      score: (seat===0? s0 : s1) + ' ' + T('guesses','taħbitiet'),
      place: (w==='draw') ? 1 : (won?1:2),
      you: (M.mode!=='pass' && seat===you),
      bot: (M.mode==='ai' && seat===1),
      avatar: (seat===you && K.avatar) ? K.avatar() : null
    };
  }
  return [row(0), row(1)];
}

/* ═══════════════════════════════════════════════════════════════════
   AUTOSAVE / RESUME
   ═══════════════════════════════════════════════════════════════════ */
function saveGame(){
  if (!M || M.net || (M.st && M.st.over)) return;
  try {
    ST.save = {
      opts: M.opts, seed: M.seed, mode: M.mode,
      secrets: M.secrets, log: M.log.slice(),
      phase: M.phase
    };
    persist();
  } catch(e){}
}
function resumeGame(){
  const s = ST.save;
  if (!s || !s.log){ menu(); return; }
  injectCSS();
  M = {
    opts: s.opts, seed: s.seed, log: s.log.slice(),
    secrets: [ s.secrets && s.secrets[0], s.secrets && s.secrets[1] ],
    st: null, mode: s.mode || 'ai', you:0, ctx:null,
    phase: s.phase || 'play', draft:[], veil:0, shown:-1, net:null, dead:false
  };
  /* rebuild engine state deterministically from opts+seed+secrets+log */
  M.st = E.replay(Object.assign({}, s.opts, { deal:'private' }), s.seed, M.secrets, s.log);
  if (M.st.over) M.phase = 'over';
  finished = false;
  openBoard(() => menu());
  render();
}

/* ═══════════════════════════════════════════════════════════════════
   ONLINE — lobby + relay hooks (2 seats, turn-based, private secret)
   ═══════════════════════════════════════════════════════════════════ */
let NET = null;

function goOnline(){
  /* THE LOBBY IS js/mp.js's, AND ITS DOOR IS openFor(). This used to ask
     for P.openLobby / P.lobby.open — names KARTI_PARTY had never
     published — so both tests were false and every tap landed on the
     "open it from the party shelf" notice below. That read as "IL-KODIĊI
     has no online mode", when in fact the relay seats 2-2-2 for 'kodici',
     KARTI_MP.GAMES carries it, LOBBY_GLOBAL maps it to KARTI_KODICI and
     R.lobby.canStart() has no gate at all. Nothing was missing but this
     one call — the same one erbgha / minhu / aqleb / kaxxi already make.
     P.openLobby is kept as the second try because js/party.js now
     publishes it (returning false when mp.js is not on the phone), and
     the notice below stays as the last resort for a build without a
     lobby at all. */
  const MP = window.KARTI_MP;
  if (MP && MP.openFor) { MP.openFor('kodici'); return; }
  if (P.openLobby && P.openLobby('kodici') !== false) return;
  /* graceful fallback */
  const el = P.ui.screenEl();
  el.innerHTML = '<div class="pt-wrap kd-menu"><div class="tbar">'+
    '<button class="iconbtn" id="kd-back">'+ICO.back+'</button><h2>'+esc(T('Play online','Onlajn'))+'</h2></div>'+
    '<div class="scroll"><p class="blurb" style="padding:22px 6px">'+
    esc(T('Online is wired to the KARTI lobby. Open it from the party shelf to seat two phones.','L-onlajn imqabbad mal-lobby ta\' KARTI.'))+
    '</p></div></div>';
  el.querySelector('#kd-back').onclick = () => { cue('ui.back',{gain:.6}); menu(); };
}

let NET_SEND = null;    /* mp.js's raw move sink, captured in onMove */

/* send a move on the wire through mp.js's own onMove path (which applies its
   generic toWire codec, so this is the exact shape a normal move takes). Used
   for guesses, the {t:'set'} ready signal, and the owner's feedback echo. */
function netEcho(mv){
  if (!NET_SEND || !NET) return;
  const w = E.encWire(mv);
  if (!w) return;
  const room = (NET.toRoom && NET.toRoom[M.you] != null) ? NET.toRoom[M.you] : M.you;
  NET_SEND(w, { seat: room, src:'echo' });
}

/* KODIĊI keeps NO relay deal: each player composes their OWN code on their OWN
   phone and it never crosses the wire (pick-your-own — the strongest possible
   secrecy, same as MIN HU?). Only guesses and the owner-computed feedback
   travel. So there is no planDeal — mp.js sends a deal-less start, and the
   relay never has a secret to leak. (The old planDeal returned a pool of
   `colours` items with `each = slots`; the relay needs seats*slots ≤ items,
   which classic 4×6 fails — 2*4 > 6 — so the start was REFUSED outright.) */

/* the relay just seated us and is about to run the match. */
function onlineStart(cfg){
  injectCSS();
  /* PUT THE PARTY SCREEN ON — offline reaches openBoard() through menu(),
     which calls P.show(); online arrives straight from the room's roster
     screen, so without this the board mounted into a #scr-party that never
     got `.on` and both phones sat on "You are ready" forever. */
  P.show();
  cfg = cfg || {};
  const you = (cfg.you != null) ? cfg.you : 0;
  /* THE ONLINE CONFIG MUST BE SHARED — this used to read pref().cfg, this
     phone's LAST OFFLINE SETUP from localStorage. Two phones whose last
     local games differed then built DIFFERENT boards (4×6 vs 5×8, limit 10
     vs ∞): a 5-slot guess is illegal on a 4-slot board, so the receiving
     phone silently refused it, never echoed feedback, and the match hung /
     drifted apart. Online now reads ONLY what the relay broadcast to BOTH
     phones (cfg.opts — a variant word if one is ever whitelisted for
     kodici), else the same fixed classic board on every phone. A local
     preference never shapes an online match. */
  const shared = (cfg.opts && typeof cfg.opts === 'object') ? cfg.opts : {};
  const bid = BOARD_OPTS.some(b => b.id === shared.mode)  ? shared.mode
            : BOARD_OPTS.some(b => b.id === shared.board) ? shared.board
            : 'classic';
  const lim = (typeof shared.limit === 'number' && shared.limit >= 0)
            ? (shared.limit | 0) : 10;
  const o = boardOpts({ board: bid, limit: lim, lvl: 2 });
  /* the relay's shared seed, NEVER a per-client E.newSeed() fallback (that
     was konkwista's desync), and the SAME value into M.seed and M.st so the
     hooks report the seed the engine actually holds. */
  const seed = cfg.seed | 0;
  NET = {
    toGame: cfg.toGame || {0:0,1:1},
    toRoom: cfg.toRoom || {0:0,1:1},
    meG: (cfg.meG != null) ? cfg.meG : you,
    net: cfg.net || {}
  };
  M = {
    opts: Object.assign({}, o, { deal:'private', mode:'online' }),
    seed,
    log:[], secrets:[null,null],
    st: E.newMatch(Object.assign({}, o, { deal:'private' }), seed),
    mode:'online', you: NET.meG, ctx:null, phase:'set', draft:[], veil:0, shown:-1,
    net: cfg.net || {}, dead:false,
    iSet:false, oppSet:false,               /* the two codemaker-ready bits */
    pending:false                           /* a guess is out, awaiting the verdict */
  };
  finished = false;
  /* THE BACK DOOR LEAVES THE ROOM. This used to paint the local cut-off
     card and open the menu while the SOCKET STAYED SEATED — the relay
     never heard a 'leave', so the other phone was never told and the
     "X takes the win" the confirm sheet had just promised never happened.
     Route out through net.onLeave (mp.js backToRooms → mpLeave), the same
     door every other game's online back already uses. */
  openBoard(() => { const n = M && M.net; leave();
                    if (n && n.onLeave) n.onLeave(); else menu(); });
  /* online SET: you compose YOUR OWN secret on this device. It is never sent —
     you only announce {t:'set'} when it is locked, and play begins once both
     phones have announced. */
  M.phase = 'setA';
  render();
  return NET;
}
/* No relay deal is used online (pick-your-own), so this hook is a no-op kept
   only for compatibility with a relay that still pushes a per-seat deal — we
   deliberately IGNORE it so the player's own choice always wins. */
function onlinePrivate(/* d */){ /* intentionally ignored: codes are chosen locally */ }

/* a move arrived from the relay (mp.js already ran fromWire, so `wire` is the
   partial move object). Three kinds travel: {t:'set'} (opponent locked their
   code), a guess AT my code (I own the secret → I score it and echo the
   feedback back), and my OWN guess coming home carrying the owner's feedback. */
function onlineRemote(seat, wire){
  if (!M || M.dead) return null;
  const g = (NET && NET.toGame && NET.toGame[seat] != null) ? NET.toGame[seat] : seat;
  const mv = E.decWire(wire);
  if (!mv) return { ok:false, why:'unknown move' };
  if (mv.t === 'quit'){ onlineStop('left'); return null; }

  if (mv.t === 'set'){
    /* the opponent has locked their code. Play begins once we both have. */
    M.oppSet = true;
    maybeStartOnline();
    render();
    return null;
  }

  if (mv.t !== 'guess') return null;
  /* WHO does this guess belong to? The relay stamps the echo with the
     DEFENDER's seat, not the original guesser's, so we cannot tell by seat.
     The discriminator is the FEEDBACK: a guess that arrives WITH fb is the
     owner's verdict on MY OWN guess coming home; a guess WITHOUT fb is the
     opponent guessing at MY code (which I must score and echo). */
  if (mv.fb){
    /* my own guess, now judged by the owner. I hold no opponent secret, so I
       apply with the supplied fb. `M.you` is the guesser (me). */
    const me = M.you;
    const tgt = E.target(me);
    const rec = E.guessAt(M.st, me, mv.g, mv.fb);
    if (rec){
      M.log.push({ seat:me, g:mv.g.slice(), fb:rec.fb });
      M._reveal = M.st.guesses[tgt].length-1;
      cue(rec.fb.exact===M.opts.slots ? 'ui.reward' : 'ui.note', {gain:.7}, true);
    }
    M.pending = false;                     /* the verdict is in; free to guess again */
  } else {
    /* the opponent guessed at MY code — I own the secret, so I score it from my
       own secret and ECHO the guess back WITH the feedback so their phone can
       render it. My secret itself never leaves this device. The opponent's
       game seat is the OTHER seat from mine. */
    const opp = E.target(M.you);
    const tgt = E.target(opp);
    const rec = E.guessAt(M.st, opp, mv.g);     /* engine scores from my secret */
    if (rec){
      M.log.push({ seat:opp, g:mv.g.slice(), fb:rec.fb });
      M._reveal = M.st.guesses[tgt].length-1;
      cue('mp.turn',{gain:.5});
      netEcho({ t:'guess', g:mv.g.slice(), fb:rec.fb });
    }
  }
  render();
  return null;
}
function sendOnlineGuess(seat, g){
  /* send the guess UNSCORED (no fb) — the owner will score it and echo it back
     with the verdict, which onlineRemote() then applies here. We do NOT apply
     locally: applying with no fb would fail (guessAt needs a fb online), and a
     wrong optimistic fb would desync the two phones. */
  netEcho({ t:'guess', g:g.slice() });
}
function onlineNote(/* note */){ /* no side-channel: feedback rides on the guess echo */ }
function onlineStop(why, tone){
  if (!M || M.dead) return;
  M.dead = true;
  try { P.ui.result(M.ctx, {
    tone:'draw', head:T('Cut off','Maqtugħ'),
    why:T('The line dropped. Nothing counted.','Waqgħet il-linja.'),
    buttons:[{ label:T('Back','Lura'), icon:'back', cls:'ghost', go:()=>menu() }]
  }); } catch(e){ menu(); }
}

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY object + party registration (2 seats, turn-based)
   ═══════════════════════════════════════════════════════════════════ */
function levels(){ return LEVELS.map(l => ({ level:l.lvl, name:l.name(), note:l.note() })); }

R.lobby = {
  id:'kodici', name:'Il-Kodiċi', mt:'Il-Kodiċi',
  minSeats: 2, maxSeats: 2,
  levels: levels(), defaultLevel: 2,
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    const list = (seatList || []).filter(Boolean);
    const n = list.length;
    if (n < 2) return { ok:false, why: T('The hunt needs two.','Il-kaċċa trid tnejn.') };
    if (n > 2) return { ok:false, why: T('Two is the table.','Tnejn hija l-mejda.') };
    const un = list.filter(x => x && x.kind !== 'cpu' && !x.ready);
    if (un.length) return { ok:false, why: (un.map(s=>s.name||T('Somebody','Xi ħadd')).join(' & '))+' '+T('not ready yet.','għadhom mhux lesti.') };
    return { ok:true, why:'' };
  },
  start(seatsList, opts){
    return onlineStart({ seats:seatsList, seed: opts && opts.seed, you:0, host:0, net:(opts&&opts.net)||{} });
  },
  rulesHTML: () => {
    const li = [
      T('Each player hides a secret colour code.','Kull plejer jaħbi kodiċi.'),
      T('Take turns guessing the other\'s code.','Imisskom taqtgħu l-kodiċi.'),
      T('Black peg = right colour & slot; white = right colour, wrong slot.','Iswed = kulur u spazju tajjeb; abjad = kulur tajjeb, spazju ħażin.'),
      T('First to crack the code wins.','L-ewwel li jaqta\' jirbaħ.')
    ];
    return '<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:8px">'+
      li.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
  },
  blurb: T('Two secret codes, two phones. Crack theirs first.','Żewġ kodiċi sigrieti. Aqta\' tagħhom l-ewwel.'),
  myName(){ let n=''; try { n = (K.displayName && K.displayName()) || (K.avatar && K.name) || ''; } catch(e){} return String(n||T('You','Int')).slice(0,14); },
  wire: { fields: E.WIRE_FIELDS },
  takeback: false
};

/* NET hooks for mp.js */
const NET_HOOKS = {
  live:   () => !!(M && !M.dead && M.mode==='online' && !M.st.over),
  phase:  () => !M ? 'idle' : (M.st.over ? 'over' : 'play'),
  seed:   () => (M ? M.seed : null),
  gameId: () => (M ? 'kodici' : null),
  turn:   () => (M && NET) ? (NET.toRoom[E.turn(M.st)] != null ? NET.toRoom[E.turn(M.st)] : -1) : -1,
  over:   () => (M ? M.st.over : null),
  moveCount: () => (M ? M.log.length : 0),
  /* capture mp.js's raw move sink so netEcho() can send guesses, the {t:'set'}
     ready signal, and the owner's feedback echo through the SAME toWire path a
     normal move uses. We do not forward moves automatically (guesses go out via
     sendOnlineGuess / feedback via netEcho), so the subscriber callback `f` is
     a no-op — we only need the sink `fn`. */
  onMove: fn => { NET_SEND = fn; return () => { if (NET_SEND === fn) NET_SEND = null; }; },
  private: (d /*, mates */) => onlinePrivate(d),
  apply: (seat, wire) => onlineRemote(seat, wire),
  seatGone: () => { onlineStop('left'); },
  /* THE 1v1 WALK-OUT IS A WIN — and kodiċi is always 1v1, so this is the
     door every real departure now comes through (js/mp.js prefers it over
     seatGone above, which stays for older mp.js builds). The hunt ends
     with the stayer as winner on the ordinary podium; the pot was already
     settled in mp.js (idempotent; a friendly table moves nothing) and is
     stashed for finishScreen() to paint. The `finished` latch keeps the
     single id-guarded award to one firing. */
  soleWin: (seat, pot) => {
    if (!M || M.dead || M.mode !== 'online' || finished) return;
    if (M.st && M.st.over) return;
    if (M.st){ M.st.over = true; M.st.winner = M.you; }
    M.solePot = pot || null;
    M.sole = true;
    M.phase = 'over';
    try { setBadge(); } catch(e){}
    finishScreen();
  }
};

P.online = P.online || {};
P.online.kodici = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  /* no planDeal: KODIĊI is pick-your-own — no secret ever crosses the wire */
  live: () => NET_HOOKS.live(),
  hooks: NET_HOOKS
};

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF TILE + registration
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'kodici', order:31, kind:'board', name:'IL-KODIĊI', mt:'Il-Kodiċi',
  status:'live',
  get tag(){ return T('Crack the secret colour code.','Aqta\' l-kodiċi sigriet.'); },
  open: () => menu(),
  seats: { min:2, max:2 },
  levels: levels(),
  rulesHTML: () => R.lobby.rulesHTML()
};
R.shelfTile = TILE;
R.open = () => menu();
R.close = () => { leave(); P.hub(); };
R.ui = { open: menu, leave, injectCSS,
  /* read-only test hook: the current runner (never used by the game
     itself). Lets a headless harness prove secrecy and drive a crack. */
  _debug: () => M };
try { P.register(TILE); } catch(e){}

})();
