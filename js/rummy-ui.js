/* ═══════════════════════════════════════════════════════════════════
   KARTI — rummy-ui.js
   RUMMY — the table. The rules live in js/rummy.js; this file is the
   screen, the runner and the wire, and it follows js/klabb.js's shape
   deliberately: a match is (opts, seed, log), every move goes through
   one doMove() gate, and rollback is cutting the log and replaying.

   WHAT THIS FILE IS
     · the shelf tile and the setup sheet (seats, DECKS — enforced,
       see js/rummy.js's header — jokers, match length, the machine)
     · the felt: opponents strip, stock + pile, the meld shelf, the
       hand, and the two buttons a turn is made of
     · the runner: log, seed, autosave (karti_rummy_v1), undo offline
     · the online half js/mp.js drives: KARTI_RUMMY.lobby and
       KARTI_PARTY.online.rummy

   THE PHONE PROBLEM, SOLVED WHERE IT IS WORST
     Twelve people means eleven other hands, a growing shelf of melds
     and your own thirteen cards on a 390-point screen. The answer:
     · other players are a RAIL of plates (name · cards · score) that
       scrolls sideways and keeps whoever is on turn in view — the
       skarta answer, which ten seats already proved out;
     · the melds are a SHELF of compact stacks that wraps and scrolls
       vertically — each meld is one tap target for laying off;
     · your hand uses klabb's fan arithmetic, which wraps to a second
       row before a card gets too narrow to read.

   HOUSE RULES OBEYED
     · borrows #scr-party via KARTI_PARTY, injects its own CSS once,
       never touches css/ or the tab bar's ancestors;
     · draws card faces through KARTI_KLABB.deck so the pack on this
       felt is the pack on every other felt (the joker, which klabb's
       pack has no face for, is drawn here in the same geometry);
     · no unicode suits, no emoji; sounds only through KARTI_SFX ids
       that already exist.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const KLB = window.KARTI_KLABB;
const R = window.KARTI_RUMMY;
if (!K || !P || !KLB || !R || !R.engine) return;

const E = R.engine;
const DECK = KLB.deck;
const esc = K.esc || (s => String(s == null ? '' : s));
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');
const clone = o => JSON.parse(JSON.stringify(o));

/* ── our corner of localStorage ──────────────────────────────────── */
const STORE = 'karti_rummy_v1';
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
/* iOS kills a backgrounded tab without ceremony — flush inline */
function persistNow(){
  if (!persistPending) return;
  clearTimeout(persistPending);
  persistPending = 0;
  try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){}
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persistNow(); });
window.addEventListener('pagehide', persistNow);

function pref(patch){
  if (patch){ Object.assign(ST.pref, patch); persist(); }
  return ST.pref;
}
function saveSlot(snap){ ST.save = snap || null; persist(); }

/* the machine, by the club's own names — read off klabb's published
   lobby so a difficulty is called the same thing at every table */
function levels(){
  try {
    const L = KLB.lobby && KLB.lobby.levels;
    if (Array.isArray(L) && L.length) return L;
  } catch(e){}
  return [{ level:1, name:'Gentle', note:'Will miss things.' },
          { level:2, name:'Normal', note:'Plays properly.' },
          { level:3, name:'Ruthless', note:'Plays to win.' }];
}
function levelName(k){
  const L = levels().find(x => x.level === k);
  return (L && L.name) || 'MAKNA';
}

/* ═══════════════════════════════════════════════════════════════════
   DRAWING — klabb's pack plus our joker, and the shelf mark
   ═══════════════════════════════════════════════════════════════════ */
function rr(x, y, w, h, r){
  const n = v => Math.round(v * 100) / 100;
  return 'M' + n(x+r) + ' ' + n(y) + 'H' + n(x+w-r) + 'A' + r + ' ' + r + ' 0 0 1 ' + n(x+w) + ' ' + n(y+r) +
         'V' + n(y+h-r) + 'A' + r + ' ' + r + ' 0 0 1 ' + n(x+w-r) + ' ' + n(y+h) +
         'H' + n(x+r) + 'A' + r + ' ' + r + ' 0 0 1 ' + n(x) + ' ' + n(y+h-r) +
         'V' + n(y+r) + 'A' + r + ' ' + r + ' 0 0 1 ' + n(x+r) + ' ' + n(y) + 'Z';
}
function cardFrame(x, y, w, h, t){
  return '<path fill-rule="evenodd" d="' + rr(x, y, w, h, 1.5) +
         rr(x + t, y + t, w - 2*t, h - 2*t, 0.8) + '"/>';
}
/* the tile mark: three cards climbing left to right — a run, which is
   the thing this game is about. Same silhouette-first rules as the
   klabb marks: geometry only, one weight, told apart by shape. */
const TILE_MARK =
  '<g transform="rotate(-14 8 14)">' + cardFrame(3.4, 7.2, 8.2, 12.8, 1) + '</g>' +
  '<g transform="rotate(0 12 12)">'  + cardFrame(8.0, 5.6, 8.2, 12.8, 1) + '</g>' +
  '<g transform="rotate(14 17 10)">' + cardFrame(12.6, 4.0, 8.6, 13.4, 1.05) +
    '<circle cx="16.9" cy="8" r="1.6"/>' +
    '<circle cx="15.4" cy="11" r="1.6"/>' +
    '<circle cx="18.4" cy="11" r="1.6"/></g>';

let defsDone = false;
function injectDefs(){
  if (defsDone || document.getElementById('rm-defs')) { defsDone = true; return; }
  defsDone = true;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', 'rm-defs');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  svg.innerHTML = '<symbol id="rm-t-rummy" viewBox="0 0 24 24">' + TILE_MARK + '</symbol>';
  document.body.appendChild(svg);
}

/* THE JOKER. klabb's pack has no face for it, so it is drawn here in
   the same 100×140 geometry: the Maltese cross off klabb's own symbol
   sheet, a jester's three-ball collar, and JOLLY down the corner where
   the rank would sit. f=52 is the red joker, f=53 the black. */
function jokerFace(red){
  const cls = red ? 'kb-r' : 'kb-b';
  const collar =
    '<circle class="kb-ink" cx="35" cy="56" r="6.5"/>' +
    '<circle class="kb-ink" cx="50" cy="50" r="6.5"/>' +
    '<circle class="kb-ink" cx="65" cy="56" r="6.5"/>';
  return '<svg class="kb-svg ' + cls + '" viewBox="0 0 100 140" aria-hidden="true" focusable="false">' +
    '<rect class="kb-stock" x="1.25" y="1.25" width="97.5" height="137.5" rx="8.5"/>' +
    '<g class="kb-idx"><text x="11.5" y="24" text-anchor="middle">J</text>' +
      '<text x="11.5" y="36" text-anchor="middle" style="font-size:11px">OLLY</text></g>' +
    '<g class="kb-idx" transform="rotate(180 50 70)">' +
      '<text x="11.5" y="24" text-anchor="middle">J</text>' +
      '<text x="11.5" y="36" text-anchor="middle" style="font-size:11px">OLLY</text></g>' +
    collar +
    '<use href="#kb-cross" xlink:href="#kb-cross" x="26" y="62" width="48" height="48" fill="currentColor"/>' +
    '</svg>';
}

/* one card of OURS (c is copy*54+f). Face drawing is klabb's; the
   button, the data and the selected state are ours. */
function cardBtn(c, o){
  o = o || {};
  const w = o.w || 52;
  const f = E.faceOf(c);
  const face = o.face !== false;
  const body = !face ? DECK.cardBack() : (f >= 52 ? jokerFace(f === 52) : DECK.cardFace(f));
  const label = !face ? 'Face-down card'
              : f >= 52 ? (f === 52 ? 'Red joker' : 'Black joker')
              : DECK.nameOf(f);
  const tag = o.tap ? 'button' : 'span';
  return '<' + tag + (o.tap ? ' type="button"' : '') +
    ' class="kb-card rm-c' + (o.sel ? ' rm-sel' : '') + (o.dim ? ' rm-dim' : '') +
      (face ? '' : ' down') + (o.cls ? ' ' + o.cls : '') + '"' +
    ' data-sfx="own" data-cid="' + c + '"' +
    ' style="width:' + w + 'px;height:' + Math.round(w * 1.4) + 'px' +
      (o.left != null ? ';margin-left:' + o.left + 'px' : '') + '"' +
    (o.tap ? ' aria-label="' + esc(label + (o.sel ? '. Picked up' : '')) + '"' +
             (o.sel ? ' aria-pressed="true"' : ' aria-pressed="false"')
           : ' aria-hidden="true"') +
    '>' + body + '</' + tag + '>';
}

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party. The kb-* face
   rules are repeated here from js/klabb.js's runtime sheet because
   that sheet only exists once a klabb game has been OPENED, and a
   rummy felt must not depend on somebody having played Briscola
   first. Identical rules twice is harmless; a pack styled by luck is
   not.
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS(){
  injectDefs();
  if (document.getElementById('rm-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'rm-runtime-css';
  st.textContent =
    '#scr-party{--rm-felt:#1C2E52;--rm-felt2:#12203B;--rm-gold:var(--gold,#FFC542)}' +

    /* ── the card faces (klabb's rules, restated — see header) ── */
    '#scr-party .kb-card{position:relative;flex:0 0 auto;padding:0;border:0;background:none;' +
      'border-radius:7px;line-height:0;display:block;' +
      'box-shadow:0 2px 4px rgba(0,0,0,.5),0 6px 14px rgba(0,0,0,.35);' +
      'transition:margin-top .13s var(--ease),box-shadow .13s var(--ease)}' +
    '#scr-party button.kb-card{cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .kb-svg{width:100%;height:100%;display:block;border-radius:7px;' +
      'overflow:hidden;font-family:var(--body),-apple-system,"Segoe UI",Roboto,Arial,sans-serif}' +
    '#scr-party .kb-stock{fill:#FCF7EA;stroke:rgba(0,0,0,.34);stroke-width:1.1}' +
    '#scr-party .kb-svg.kb-r{fill:#C7192B;color:#C7192B}' +
    '#scr-party .kb-svg.kb-b{fill:#17131B;color:#17131B}' +
    '#scr-party .kb-idx text{font-weight:800;font-size:25px;letter-spacing:-.02em;' +
      'fill:currentColor;stroke:none}' +
    '#scr-party .kb-panel{fill:#F4E7C6;stroke:currentColor;stroke-width:1.5}' +
    '#scr-party .kb-ink{fill:currentColor;stroke:none}' +
    '#scr-party .kb-face{fill:#FCF7EA;stroke:currentColor;stroke-width:1.5}' +
    '#scr-party .kb-hair{stroke:currentColor;stroke-width:1.1;opacity:.55;fill:none}' +

    /* ── ours ── */
    '#scr-party .rm-c.rm-sel{margin-top:-13px;' +
      'box-shadow:0 0 0 3px var(--rm-gold),0 8px 18px rgba(0,0,0,.5)}' +
    '#scr-party .rm-c.rm-dim{opacity:.45}' +
    '#scr-party .rm-c.rm-dim .kb-svg{filter:grayscale(.8)}' +
    '#scr-party button.rm-c:active{margin-top:-8px}' +

    /* the felt — navy, so nobody mistakes this table for the każin's */
    '#scr-party .pt-host.rm-host{align-items:stretch;justify-content:stretch;overflow:visible}' +
    '#scr-party .rm-table{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;' +
      'gap:5px;padding:7px 7px 8px;border-radius:16px;position:relative;' +
      'background:radial-gradient(120% 85% at 50% 8%,#28437A 0%,var(--rm-felt) 45%,var(--rm-felt2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.07),' +
      'inset 0 -18px 34px rgba(0,0,0,.42)}' +

    /* ── the rail of other players ── */
    '#scr-party .rm-opps{flex:0 0 auto;display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;' +
      'padding:2px 2px 4px;-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
    '#scr-party .rm-opps::-webkit-scrollbar{display:none}' +
    '#scr-party .rm-opp{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;' +
      'gap:1px;min-width:56px;padding:4px 7px;border-radius:11px;' +
      'background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.09)}' +
    '#scr-party .rm-opp.on{background:rgba(255,197,66,.16);border-color:rgba(255,197,66,.55)}' +
    '#scr-party .rm-opp .n{font:900 8.5px/1.2 var(--disp);letter-spacing:.07em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.66);max-width:74px;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .rm-opp.on .n{color:var(--rm-gold)}' +
    '#scr-party .rm-opp .c{font:900 15px/1 var(--disp);color:#FFF}' +
    '#scr-party .rm-opp .c i{font:700 8px/1 var(--disp);font-style:normal;letter-spacing:.08em;' +
      'color:rgba(255,255,255,.45);margin-left:2px}' +
    '#scr-party .rm-opp .s{font:700 8.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
      'color:rgba(255,255,255,.5)}' +

    /* ── stock and pile ── */
    '#scr-party .rm-draws{flex:0 0 auto;display:flex;align-items:flex-end;justify-content:center;' +
      'gap:18px;padding:2px 0}' +
    '#scr-party .rm-pilebox{display:flex;flex-direction:column;align-items:center;gap:3px}' +
    '#scr-party .rm-pilebox .t{font:900 8.5px/1 var(--disp);letter-spacing:.11em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.5)}' +
    '#scr-party .rm-drawbtn{position:relative;padding:0;border:0;background:none;line-height:0;' +
      'border-radius:7px;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .rm-drawbtn.go .kb-card{box-shadow:0 0 0 2.5px rgba(61,220,132,.9),' +
      '0 6px 14px rgba(0,0,0,.4)}' +
    '#scr-party .rm-drawbtn[disabled]{opacity:.75}' +
    '#scr-party .rm-count{position:absolute;right:-7px;top:-7px;min-width:22px;height:22px;' +
      'border-radius:999px;display:grid;place-items:center;padding:0 5px;' +
      'font:900 10.5px/1 var(--disp);color:#241800;background:var(--rm-gold);' +
      'border:1px solid #FFE9B0;box-shadow:0 2px 5px rgba(0,0,0,.5)}' +

    /* ── the meld shelf ── */
    '#scr-party .rm-melds{flex:1;min-height:52px;display:flex;flex-wrap:wrap;gap:7px 9px;' +
      'align-content:flex-start;justify-content:center;overflow-y:auto;overflow-x:hidden;' +
      'padding:5px 3px;border-radius:12px;background:rgba(0,0,0,.16);' +
      '-webkit-overflow-scrolling:touch}' +
    '#scr-party .rm-meld{flex:0 0 auto;display:flex;align-items:center;padding:5px 6px 4px;' +
      'border:1px solid transparent;border-radius:10px;background:none;line-height:0;' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .rm-meld .kb-card{margin-left:-17px;box-shadow:0 1px 3px rgba(0,0,0,.5)}' +
    '#scr-party .rm-meld .kb-card:first-child{margin-left:0}' +
    '#scr-party .rm-meld.can{background:rgba(61,220,132,.14);' +
      'border-color:rgba(61,220,132,.6)}' +
    '#scr-party .rm-meld.can:active{background:rgba(61,220,132,.3)}' +
    '#scr-party .rm-none{width:100%;font:700 10.5px/1.5 var(--disp);letter-spacing:.11em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.3);text-align:center;padding:14px 8px}' +

    /* ── the hint and the hand ── */
    '#scr-party .rm-say{flex:0 0 auto;font:700 11px/1.45 var(--body);color:rgba(255,255,255,.8);' +
      'text-align:center;padding:0 8px;min-height:16px}' +
    '#scr-party .rm-say b{color:var(--rm-gold);font-weight:900}' +
    '#scr-party .rm-hand{flex:0 0 auto;display:flex;flex-direction:column;align-items:center}' +
    '#scr-party .rm-row{display:flex;align-items:flex-end;justify-content:center;width:100%;' +
      'padding:14px 5px 0}' +
    '#scr-party .rm-row+.rm-row{margin-top:2px}' +
    '#scr-party .rm-acts{flex:0 0 auto;display:flex;gap:7px;justify-content:center;padding:4px 0 0}' +
    '#scr-party .rm-act{min-height:44px;padding:0 16px;border-radius:12px;' +
      'font:900 11px/1 var(--disp);letter-spacing:.08em;text-transform:uppercase;' +
      'color:#241800;background:linear-gradient(180deg,#FFD979,var(--rm-gold));' +
      'border:1px solid #FFE9B0;box-shadow:0 3px 0 -1px rgba(0,0,0,.4);' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .rm-act.ghost{color:var(--txt);background:rgba(255,255,255,.08);' +
      'border-color:rgba(255,255,255,.2);box-shadow:none}' +
    '#scr-party .rm-act[disabled]{opacity:.38}' +
    '#scr-party .rm-act:not([disabled]):active{transform:translateY(2px);box-shadow:none}' +

    /* ── the interlude between hands (multi-hand matches) ── */
    '#scr-party .rm-book{width:100%;max-width:300px;margin:6px auto;border-collapse:collapse}' +
    '#scr-party .rm-book td{padding:4px 8px;font-size:11.5px;color:rgba(255,255,255,.8);' +
      'border-bottom:1px solid rgba(255,255,255,.1)}' +
    '#scr-party .rm-book td.n{text-align:right;font:700 12px/1 ui-monospace,SFMono-Regular,' +
      'Menlo,monospace}' +
    '#scr-party .rm-book tr.win td{color:var(--rm-gold)}' +

    /* ── the setup sheet's deck line ── */
    '#scr-party .rm-why{font-size:11.5px;line-height:1.6;margin:8px 2px 0;padding:9px 11px;' +
      'border-radius:12px;text-transform:none;letter-spacing:0;color:#CFE0FF;' +
      'background:rgba(80,130,255,.10);border:1px solid rgba(80,130,255,.32)}' +
    '#scr-party .rm-step{display:flex;align-items:center;gap:10px;justify-content:center;' +
      'padding:4px 0}' +
    '#scr-party .rm-step .v{font:900 24px/1 var(--disp);color:var(--rm-gold);min-width:74px;' +
      'text-align:center}' +
    '#scr-party .rm-step .v i{display:block;font:700 9px/1.4 var(--disp);font-style:normal;' +
      'letter-spacing:.12em;color:var(--dim);text-transform:uppercase}' +
    '#scr-party .rm-rnd{width:46px;height:46px;border-radius:12px;font:900 22px/1 var(--disp);' +
      'color:var(--txt);background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.2)}' +
    '#scr-party .rm-rnd[disabled]{opacity:.35}' +

    /* ── short screens (landscape phones) ──
       A landscape phone gets ~200px of felt and the portrait stack
       cannot fit it — so the felt becomes TWO COLUMNS: the table
       (stock, pile, melds) on the left, your hand and its buttons on
       the right, the player rail across the top. Nothing sits below
       the fold; the meld shelf alone scrolls. */
    '@media (max-height:520px){' +
      '#scr-party .rm-table{display:grid;column-gap:8px;row-gap:3px;padding:5px 6px 6px;' +
        'grid-template-columns:5fr 4fr;grid-template-rows:auto auto minmax(0,1fr) auto;' +
        'grid-template-areas:"opps opps" "draws hand" "melds hand" "melds acts";' +
        'overflow-y:auto;-webkit-overflow-scrolling:touch}' +
      '#scr-party .rm-opps{grid-area:opps}' +
      '#scr-party .rm-draws{grid-area:draws;padding:0}' +
      '#scr-party .rm-melds{grid-area:melds;min-height:30px;overflow-y:auto}' +
      /* the hint line goes: the glowing buttons and the aria labels
         carry it, and 200px of felt has no row to spare */
      '#scr-party .rm-say{display:none}' +
      '#scr-party .rm-hand{grid-area:hand;align-self:start}' +
      '#scr-party .rm-acts{grid-area:acts;padding-top:2px;align-self:end}' +
      '#scr-party .rm-opp{min-width:46px;padding:2px 5px}' +
      '#scr-party .rm-opp .c{font-size:11px}' +
      '#scr-party .rm-opp .s{display:none}' +
      '#scr-party .rm-pilebox .t{font-size:7.5px}' +
      '#scr-party .rm-count{min-width:18px;height:18px;font-size:9px}' +
      '#scr-party .rm-row{padding-top:9px}' +
      '#scr-party .rm-acts .rm-act{min-height:34px;padding:0 12px;font-size:10px}}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   SOUND — existing ids only, through one gate so a FAST test run does
   not machine-gun the mixer. (klabb's spacer idea, one level.)
   ═══════════════════════════════════════════════════════════════════ */
let cueAt = 0;
function cue(id, opts, big){
  const S = window.KARTI_SFX;
  if (!S) return;
  const now = Date.now();
  if (!big && now - cueAt < 45) return;
  cueAt = Math.max(cueAt, now);
  try { S.play(id, opts); } catch(e){}
}
function cueIn(ms, fn){
  const m = M;
  setTimeout(() => { if (M === m && M && !M.dead){ try { fn(); } catch(e){} } }, ms);
}

/* ═══════════════════════════════════════════════════════════════════
   THE RUNNER — (opts, seed, log) and one door for every move.
   ═══════════════════════════════════════════════════════════════════ */
let M = null;
let UI = null;
let FAST = false;
const moveSubs = [];
const stateSubs = [];
function fire(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }

function newSeed(){ return (Math.random() * 0xFFFFFFFF) >>> 0; }

function buildState(opts, seed, log){
  const st = E.deal(opts, seed >>> 0);
  for (let i = 0; i < log.length; i++) E.apply(st, log[i]);
  return st;
}

function startMatch(opts, seed, log){
  stopThinking();
  M = {
    opts: clone(opts || {}),
    seed: (seed == null ? newSeed() : seed) >>> 0,
    log: log ? clone(log) : [],
    st: null, ctx: null,
    tmp: {},                       /* sel: cards picked up off the hand */
    timer: 0, dead: false, finished: false,
    net: null, meta: null
  };
  M.st = buildState(M.opts, M.seed, M.log);
  applyMeta();
  return M;
}
function applyMeta(){
  if (!M || !M.meta || !M.st) return;
  M.meta.forEach((m, i) => {
    const s = M.st.seats[i];
    if (!s || !m) return;
    if (m.name) s.name = m.name;
    if (m.own)  s.own  = m.own;
    if (m.lvl)  s.lvl  = m.lvl;
  });
}
function iDrive(){ return !M || !M.net || M.net.host; }
function stopThinking(){ if (M && M.timer){ clearTimeout(M.timer); M.timer = 0; } }
function ownerOf(i){
  if (!M) return 'ai';
  const s = M.st.seats[i];
  return s && s.own ? s.own : 'ai';
}
const isLocal = i => { const o = ownerOf(i); return o === 'me' || o === 'hot'; };

function doMove(seat, move, src){
  if (!M || M.dead) return { ok:false, err:'no game' };
  if (E.over(M.st)) return { ok:false, err:'game over' };
  const t = E.turn(M.st);
  if (t !== seat) return { ok:false, err:'not seat ' + seat + "'s turn (it is " + t + ')' };
  if (!E.check(M.st, move, seat)) return { ok:false, err:'illegal move' };
  const rec = clone(move);
  rec.seat = seat;
  const idx = M.log.length;
  M.log.push(rec);
  E.apply(M.st, rec);
  autosave();
  fire(moveSubs, { seat, move:clone(move), index:idx, src:src || 'local' });
  fire(stateSubs, { reason:'move', index:idx });
  return { ok:true, index:idx };
}

function rollbackTo(n){
  if (!M) return null;
  n = Math.max(0, Math.min(M.log.length, n | 0));
  stopThinking();
  M.log = M.log.slice(0, n);
  M.st = buildState(M.opts, M.seed, M.log);
  applyMeta();
  M.tmp = {};
  autosave();
  fire(stateSubs, { reason:'rollback', index:n });
  return n;
}
/* offline undo point: back to just before this player's last DRAW —
   a turn is draw…discard, and unpicking half a turn is a mess */
function undoPoint(){
  if (!M) return -1;
  for (let i = M.log.length - 1; i >= 0; i--)
    if (isLocal(M.log[i].seat) && M.log[i].t === 'draw') return i;
  return -1;
}
function lastMoveOf(seat){
  if (!M) return -1;
  for (let i = M.log.length - 1; i >= 0; i--) if (M.log[i].seat === seat) return i;
  return -1;
}

function snapshot(){
  if (!M) return null;
  return { v:1, gid:'rummy', opts:clone(M.opts), seed:M.seed, log:clone(M.log) };
}
function autosave(){
  if (!M || M.net) return;
  if (E.over(M.st)){ saveSlot(null); return; }
  saveSlot(snapshot());
}

/* ═══════════════════════════════════════════════════════════════════
   THE SOUND OF A MOVE — one subscriber; rollback replays are silent
   by construction because they never pass through doMove.
   ═══════════════════════════════════════════════════════════════════ */
moveSubs.push(ev => {
  if (!M || M.dead) return;
  const mv = ev.move, mine = ev.seat >= 0 && isLocal(ev.seat);
  switch (mv.t){
    case 'draw':
      cue(mv.p ? 'pack.flip' : 'card.deal', { gain: mine ? 0.85 : 0.55 }); return;
    case 'meld':
      cue('card.sweep', { gain: mine ? 0.85 : 0.62, rate: mine ? 1.05 : 0.95 }, true); return;
    case 'lay':
      cue('card.throw', { gain: mine ? 0.7 : 0.5, rate: 1.08 }); return;
    case 'disc':
      cue('card.throw', { gain: mine ? 0.8 : 0.58 }); return;
    case 'next':
      cue('card.shuffle', { gain: 0.8 }, true);
      cueIn(240, () => { const S = window.KARTI_SFX; if (S && S.run) S.run('card.deal', 6, 90, { gain: 0.5 }); });
      return;
    case 'block':
      cue('ui.toast', { gain: 0.9 }, true); return;
  }
});

/* ═══════════════════════════════════════════════════════════════════
   THE FELT
   ═══════════════════════════════════════════════════════════════════ */
function table(){
  const ctx = M.ctx;
  ctx.host.classList.add('rm-host');
  ctx.host.innerHTML =
    '<div class="rm-table tapme" id="rm-table">' +
      '<div class="rm-opps" id="rm-opps"></div>' +
      '<div class="rm-draws" id="rm-draws"></div>' +
      '<div class="rm-melds" id="rm-melds"></div>' +
      '<div class="rm-say" id="rm-say"></div>' +
      '<div class="rm-hand" id="rm-hand"></div>' +
      '<div class="rm-acts" id="rm-acts"></div>' +
    '</div>';
  const root = ctx.host.querySelector('#rm-table');
  UI = {
    ctx, root,
    opps: root.querySelector('#rm-opps'),
    draws: root.querySelector('#rm-draws'),
    melds: root.querySelector('#rm-melds'),
    say:   root.querySelector('#rm-say'),
    hand:  root.querySelector('#rm-hand'),
    acts:  root.querySelector('#rm-acts'),
    wide: () => Math.max(240, root.clientWidth - 24)
  };
  /* one delegated listener for the whole felt */
  root.addEventListener('click', e => {
    if (!M || M.dead) return;
    /* NOTE the hand-card selector is scoped: every card face carries
       data-cid, including the minis inside a meld button and the top
       of the pile inside the draw button — an unscoped [data-cid]
       would catch those FIRST on the way up and swallow the tap. */
    const t = e.target && e.target.closest &&
              e.target.closest('[data-draw],[data-meld],[data-act],#rm-hand [data-cid]');
    if (!t || t.disabled) return;
    e.preventDefault();
    onTap(t);
  });
  return UI;
}

function mySeat(){
  if (!M) return 0;
  let i = M.st.seats.findIndex(s => s.own === 'me' || s.own === 'hot');
  return i < 0 ? 0 : i;
}
function sel(){ return M.tmp.sel || (M.tmp.sel = []); }

function onTap(t){
  const st = M.st, me = mySeat();
  const mine = E.turn(st) === me;
  if (t.hasAttribute('data-cid') && t.closest('#rm-hand')){
    /* picking a card up is not a move — it is a selection */
    const c = +t.getAttribute('data-cid');
    const s = sel();
    const at = s.indexOf(c);
    if (at >= 0) s.splice(at, 1); else s.push(c);
    cue('ui.tap', { gain: 0.85 }, true);
    render();
    return;
  }
  if (t.hasAttribute('data-draw')){
    if (!mine || st.phase !== 'draw') return;
    tryMove({ t:'draw', p: +t.getAttribute('data-draw') });
    return;
  }
  if (t.hasAttribute('data-meld')){
    /* one card picked up + a glowing meld = lay it off */
    const s = sel();
    if (!mine || st.phase !== 'act' || s.length !== 1) return;
    tryMove({ t:'lay', c: s[0], m: +t.getAttribute('data-meld') });
    return;
  }
  if (t.hasAttribute('data-act')){
    const a = t.getAttribute('data-act');
    const s = sel();
    if (a === 'meld' && mine && st.phase === 'act' && s.length >= 3)
      tryMove({ t:'meld', cards: s.slice() });
    else if (a === 'disc' && mine && st.phase === 'act' && s.length === 1)
      tryMove({ t:'disc', c: s[0] });
    else if (a === 'sort'){
      M.tmp.sorted = !M.tmp.sorted;
      cue('ui.toggle', { gain: 0.8 }, true);
      render();
    }
  }
}

function nag(err){
  if (/turn/.test(String(err))) return '⚠ Not your go yet.';
  return '⚠ The rules said no. Take it up with the rules.';
}
function tryMove(mv){
  const me = mySeat();
  mv.seat = me;
  const r = doMove(me, mv, 'tap');
  if (!r.ok){
    cue('ui.error', { gain: 0.9 }, true);
    if (K.toast) K.toast(nag(r.err));
    return;
  }
  if (M.net && M.net.onMove){ try { M.net.onMove(clone(mv), r.index); } catch(e){} }
  M.tmp.sel = [];
  render();
}

/* what the hand looks like on screen: sorted for reading if asked */
function shownHand(){
  const h = M.st.seats[mySeat()].hand.slice();
  if (M.tmp.sorted === false) return h;
  /* default ON: suits together, runs visible, jokers at the end */
  return h.sort((a, b) => {
    const ja = E.isJoker(a), jb = E.isJoker(b);
    if (ja !== jb) return ja ? 1 : -1;
    if (E.suitOf(a) !== E.suitOf(b)) return E.suitOf(a) - E.suitOf(b);
    return E.rankOf(a) - E.rankOf(b);
  });
}

function render(){
  if (!M || M.dead || !M.ctx || !UI) return;
  const st = M.st;
  const t = E.turn(st);
  const done = E.over(st);
  const me = mySeat();
  const mine = t === me;
  const s = sel();
  /* a selection can go stale after a remote move or an undo */
  const hand = st.seats[me].hand;
  M.tmp.sel = s.filter(c => hand.indexOf(c) >= 0);

  /* — the rail of other players — */
  UI.opps.innerHTML = st.seats.map((p, i) => {
    if (i === me) return '';
    return '<div class="rm-opp' + (t === i ? ' on' : '') + '" data-seat="' + i + '">' +
      '<span class="n">' + esc(p.name) + '</span>' +
      '<span class="c">' + p.hand.length + '<i>KRT</i></span>' +
      (st.target || st.book.length ? '<span class="s">' + p.score + ' pt</span>' : '') +
      '</div>';
  }).join('');
  const on = UI.opps.querySelector('.rm-opp.on');
  if (on && on.scrollIntoView){
    try { on.scrollIntoView({ block:'nearest', inline:'center', behavior:'instant' }); } catch(e){
      try { on.scrollIntoView(false); } catch(e2){} }
  }

  /* — stock and pile — */
  const short = (UI.root.clientHeight || 500) < 430;   /* a landscape phone */
  const drawW = short ? 40 : 58;
  const drawable = mine && st.phase === 'draw' && !done;
  const top = st.disc[st.disc.length - 1];
  UI.draws.innerHTML =
    '<div class="rm-pilebox"><span class="t">Stock</span>' +
      '<button class="rm-drawbtn' + (drawable ? ' go' : '') + '" data-draw="0" data-sfx="own"' +
        (drawable ? '' : ' disabled') + ' aria-label="Draw from the stock. ' +
        st.stock.length + ' cards left.">' +
        cardBtn(-1, { face:false, w:drawW }) +
        '<span class="rm-count">' + st.stock.length + '</span>' +
      '</button></div>' +
    '<div class="rm-pilebox"><span class="t">Pile</span>' +
      (top === undefined
        ? '<span class="rm-none" style="padding:20px 6px">empty</span>'
        : '<button class="rm-drawbtn' + (drawable ? ' go' : '') + '" data-draw="1" data-sfx="own"' +
          (drawable ? '' : ' disabled') + ' aria-label="Take the top of the pile.">' +
          cardBtn(top, { w:drawW }) + '</button>') +
    '</div>';

  /* — the meld shelf — */
  const canLayNow = mine && st.phase === 'act' && M.tmp.sel.length === 1;
  const layC = canLayNow ? M.tmp.sel[0] : -1;
  if (st.phase === 'handover' && !done){
    UI.melds.innerHTML = interlude(st);
  } else if (!st.melds.length){
    UI.melds.innerHTML = '<div class="rm-none">Nothing on the table yet. Three of a kind, ' +
      'or three in a row, one suit.</div>';
  } else {
    UI.melds.innerHTML = st.melds.map((m, mi) => {
      const can = layC >= 0 && E.canLay(m, layC);
      return '<button class="rm-meld' + (can ? ' can' : '') + '" data-meld="' + mi + '"' +
        ' data-sfx="own"' + (canLayNow ? '' : ' tabindex="-1"') +
        ' aria-label="' + esc(meldLabel(m) + (can ? '. Your card fits here.' : '')) + '">' +
        m.cards.map(c => cardBtn(c, { w: short ? 28 : 34 })).join('') +
        '</button>';
    }).join('');
  }

  /* — the hint line — */
  UI.say.innerHTML =
    done ? '' :
    st.phase === 'handover' ? 'Counting the hand…' :
    !mine ? (t === -1 ? '…' : esc(st.seats[t].name) + ' is thinking.') :
    st.phase === 'draw'
      ? '<b>Draw first</b> — the stock, or the top of the pile.' :
    M.tmp.sel.length >= 3 ? (E.readMeld(M.tmp.sel) ? '<b>That melds.</b> Put it down.'
                                                   : 'Those three don’t go together.') :
    M.tmp.sel.length === 1
      ? (st.melds.some(m => E.canLay(m, M.tmp.sel[0]))
          ? 'Lay it on a glowing meld, or <b>throw it</b> to finish.'
          : 'Throw it to finish your turn, or pick up more for a meld.') :
    M.tmp.sel.length === 2 ? 'One more for a meld.' :
    'Pick up cards to meld, or one card to lay off or throw.';

  /* — the hand — */
  const wide = short ? Math.max(180, Math.floor(UI.wide() * 4 / 9) - 8) : UI.wide();
  const shown = shownHand();
  const plan = DECK.fanPlan(shown.length, wide, short ? 72 : 200);
  let h = '';
  plan.rows.forEach(seg => {
    h += '<div class="rm-row">';
    for (let i = seg[0]; i < seg[1]; i++){
      const c = shown[i];
      h += cardBtn(c, {
        tap: true, w: plan.w,
        left: i === seg[0] ? 0 : Math.round(plan.step - plan.w),
        sel: M.tmp.sel.indexOf(c) >= 0,
        dim: mine && st.phase === 'draw'
      });
    }
    h += '</div>';
  });
  UI.hand.innerHTML = h;

  /* — the two buttons a turn is made of — */
  const canMeld = mine && st.phase === 'act' && M.tmp.sel.length >= 3 && !!E.readMeld(M.tmp.sel);
  const canDisc = mine && st.phase === 'act' && M.tmp.sel.length === 1 &&
                  E.check(st, { t:'disc', c: M.tmp.sel[0] }, me);
  UI.acts.innerHTML =
    '<button class="rm-act" data-act="meld" data-sfx="own"' + (canMeld ? '' : ' disabled') +
      '>Meld ' + (canMeld ? M.tmp.sel.length : '') + '</button>' +
    '<button class="rm-act" data-act="disc" data-sfx="own"' + (canDisc ? '' : ' disabled') +
      '>Throw</button>' +
    '<button class="rm-act ghost" data-act="sort" data-sfx="own">' +
      (M.tmp.sorted === false ? 'Sort' : 'Sorted') + '</button>';

  paintTurn(t, done);
  paintBar();
  if (done){ finish(done); return; }
  step();
}

function meldLabel(m){
  if (m.k === 's') return 'A set of ' + DECK.RANK_LONG[m.r] + 's, ' + m.cards.length + ' cards';
  return 'A run of ' + DECK.SUITS[m.s].n + ', ' +
         DECK.RANK_SHORT[m.lo] + ' to ' + DECK.RANK_SHORT[m.lo + m.cards.length - 1];
}

function interlude(st){
  const row = st.book[st.book.length - 1];
  if (!row) return '';
  return '<table class="rm-book">' + st.seats.map((p, i) =>
    '<tr' + (i === row.winner ? ' class="win"' : '') + '><td>' + esc(p.name) +
    (i === row.winner ? (row.kind === 'rummy' ? ' — RUMMY!' : ' — out') : '') +
    '</td><td class="n">' + p.score + '</td></tr>').join('') + '</table>';
}

function paintTurn(t, done){
  const st = M.st;
  if (done){ P.ui.setTurn(M.ctx, { cls:'', who:done.head, note:'' }); return; }
  const who = st.phase === 'handover' ? 'Next hand…'
            : t === -1 ? 'The table…'
            : isLocal(t) ? 'Your turn'
            : st.seats[t].name + ' is thinking…';
  P.ui.setTurn(M.ctx, { cls: t >= 0 && isLocal(t) ? 'w' : '', who, note: E.note(st) });
}
function paintBar(){
  const b = M.ctx.btn('rm-undo');
  if (b) b.disabled = !(undoPoint() >= 0) || !!M.net;
}

/* the beat between moves — table beats and the machine, timered */
function step(){
  stopThinking();
  const st = M.st;
  const t = E.turn(st);
  if (t === -1){
    const ms = FAST ? 1 : (st.phase === 'handover' ? 2400 : 900);
    M.timer = setTimeout(() => {
      M.timer = 0;
      if (!M || M.dead) return;
      const opts = E.legal(M.st, -1);
      if (!opts.length) return;
      doMove(-1, opts[0], 'auto');
      M.tmp.sel = [];
      render();
    }, ms);
    return;
  }
  if (t < 0 || isLocal(t)) return;
  if (ownerOf(t) === 'net') return;
  if (!iDrive()) return;
  M.timer = setTimeout(() => {
    M.timer = 0;
    if (!M || M.dead) return;
    if (E.turn(M.st) !== t) return;
    let mv = null;
    try { mv = E.think(M.st, t, M.st.seats[t].lvl || 2); } catch(e){ mv = null; }
    if (!mv || !E.check(M.st, mv, t)){
      if (window.__RM_TEST) window.__RM_TEST.badAI = (window.__RM_TEST.badAI || 0) + 1;
      mv = (E.legal(M.st, t) || [])[0];
    }
    if (!mv) return;
    mv.seat = t;
    const r = doMove(t, mv, 'ai');
    if (r.ok && M.net && M.net.onMove){ try { M.net.onMove(clone(mv), r.index, t); } catch(e){} }
    render();
  }, FAST ? 1 : 520 + ((Date.now() % 5) * 90));
}

/* ═══════════════════════════════════════════════════════════════════
   THE END
   ═══════════════════════════════════════════════════════════════════ */
function finish(done){
  if (M.finished) return;
  M.finished = true;
  stopThinking();
  cueIn(260, () => cue(done.tone === 'win' ? 'game.win'
                     : done.tone === 'lose' ? 'game.lose' : 'ui.toast', { gain: 1 }, true));
  if (done.tone === 'win' && M.st.done && M.st.done.row.kind === 'rummy')
    cueIn(700, () => cue('call.bell', { gain: 0.8 }, true));
  saveSlot(null);
  if (!M.net && done.tone){
    const o = done.tone === 'win' ? 'w' : done.tone === 'lose' ? 'l' : 'd';
    const r = ST.rec; r[o] = (r[o] | 0) + 1; persist();
    if (typeof P.record === 'function'){ try { P.record('rummy', o); } catch(e){} }
  }
  P.ui.result(M.ctx, {
    tone: done.tone || 'draw',
    head: done.head, why: done.why, quip: done.quip,
    buttons: M.net
      ? [{ label:'Back to the rooms', icon:'back', cls:'primary',
           go: () => { const n = M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
      : [
          { label:'Deal again', icon:'refresh', cls:'primary',
            go: () => newGame(M.opts) },
          { label:'Back to the shelf', icon:'back', cls:'ghost', go: () => P.hub() }
        ]
  });
}

/* ═══════════════════════════════════════════════════════════════════
   OPENING A GAME
   ═══════════════════════════════════════════════════════════════════ */
function newGame(opts, snap){
  injectCSS();
  P.show();
  const m = snap ? (snap.opts ? startMatch(snap.opts, snap.seed, snap.log) : null)
                 : startMatch(opts);
  if (!m) return;
  /* the chairs: you, and the machine by its club name */
  M.meta = M.st.seats.map((s, i) => ({
    name: i === 0 ? 'You' : levelName(s.lvl) + ' ' + i,
    own: s.own, lvl: s.lvl
  }));
  applyMeta();
  M.finished = false;
  openBoard(() => setupSheet());
  render();
  cue('game.start', { gain: 0.9 }, true);
  cueIn(280, () => {
    cue('card.shuffle', { gain: 0.85 }, true);
    const S = window.KARTI_SFX;
    if (S && S.run) cueIn(220, () => S.run('card.deal', Math.min(M ? M.st.n * 2 : 6, 8), 90, { gain: 0.5 }));
  });
}

function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: 'RUMMY',
    onBack,
    leave: () => leave(),
    buttons: M && M.net
      ? [{ id:'rm-undo',  label:'Undo',  icon:'back', cls:'ghost' },
         { id:'rm-rules', label:'Rules', icon:'book', cls:'ghost' }]
      : [{ id:'rm-undo',  label:'Undo',  icon:'back',    cls:'ghost' },
         { id:'rm-rules', label:'Rules', icon:'book',    cls:'ghost' },
         { id:'rm-new',   label:'New',   icon:'refresh', cls:'ghost' }]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();
  M.ctx.badge.textContent = 'Ir-Rummy';
  table();
  const u = M.ctx.btn('rm-undo');
  if (M.net){
    if (u){ u.disabled = true; u.title = 'A card laid is a card played.'; }
  } else if (u) u.onclick = () => {
    const n = undoPoint();
    if (n < 0) return;
    rollbackTo(n);
    M.finished = false;
    const o = M.ctx.root.querySelector('.pt-over'); if (o) o.remove();
    render();
  };
  M.ctx.btn('rm-rules').onclick = () => rulesSheet();
  const nb = M.ctx.btn('rm-new');
  if (nb) nb.onclick = () => {
    P.ui.confirm(M.ctx, {
      head:'Throw this hand in?',
      why:'The cards go back in the box and you deal fresh. Nothing is scored.',
      yes:'Deal again', no:'No, carry on',
      go: () => newGame(M.opts)
    });
  };
}

function leave(){
  stopThinking();
  if (M){
    autosave();
    persistNow();
    const net = M.net;
    M.dead = true;
    if (net && net.onGone){ try { net.onGone(); } catch(e){} }
  }
  M = null; UI = null;
}

/* ── the rules card, over the felt ────────────────────────────────── */
const RULES = [
  '<b>Draw one</b> — off the stock, or the top card of the pile.',
  '<b>Meld</b> three or more: a set (same rank, suits all different) or a run ' +
    '(same suit, ranks in a row, ace low — A-2-3, never Q-K-A).',
  '<b>Lay off</b> single cards onto any meld on the table, whoever laid it.',
  '<b>Throw one</b> to end your turn. Not the card you just took off the pile — ' +
    'unless it is your last.',
  'Out of cards <b>wins the hand</b> and scores everything left in every other ' +
    'hand: court cards 10, ace 1, joker 15. The whole hand in one go, never having ' +
    'melded before — <b>RUMMY</b> — pays double.',
  'With more than one pack, two identical cards never sit in the same meld: ' +
    'a set wants different suits, a run wants different ranks. Two different melds, fine.',
  'Jokers (if the table plays them, two per pack): wild inside a new meld, always ' +
    'outnumbered by real cards, never laid off. Caught holding one: 15 against you.',
  'When the stock runs dry the pile is shuffled back — twice. The third time, the ' +
    'hand is <b>blocked</b>: lowest hand takes it.',
  'Packs by table: 1–4 players one, 5–8 two, 9–12 three. The extra pack is optional; ' +
    'the minimum is not.'
];
function rulesSheet(){
  const ctx = M ? M.ctx : null;
  if (!ctx) return;
  const old = ctx.root.querySelector('.pt-ask'); if (old) old.remove();
  const ask = document.createElement('div');
  ask.className = 'pt-over pt-ask';
  ask.innerHTML =
    '<div class="pt-card" style="max-width:340px;text-align:left">' +
      '<h3 style="text-align:center">RUMMY</h3>' +
      '<div class="kb-rules" style="margin:12px 0 0;padding:12px 14px;border-radius:14px;' +
        'background:rgba(255,255,255,.04);border:1px solid var(--line)"><ul style="margin:0;padding:0">' +
        RULES.map(r => '<li style="font-size:12px;line-height:1.65;color:var(--dim);' +
          'margin:0 0 6px 16px">' + r + '</li>').join('') +
      '</ul></div>' +
      '<div class="pt-acts"><button class="btn ghost" id="rm-rx">Right, got it</button></div>' +
    '</div>';
  ctx.root.appendChild(ask);
  ask.querySelector('#rm-rx').onclick = () => ask.remove();
  ask.querySelector('#rm-rx').focus();
}

/* ═══════════════════════════════════════════════════════════════════
   THE SETUP SHEET — where the deck rule is a visible, enforced thing.
   No pass-the-phone here, on purpose: rummy is a hidden hand and
   eleven people cannot look away. Your phone, the machine's chairs,
   or a room where everybody holds their own.
   ═══════════════════════════════════════════════════════════════════ */
function setupSheet(){
  injectCSS();
  P.show();
  stopThinking(); M = null; UI = null;
  const el = P.ui.screenEl();
  const p = pref();
  let seats  = Math.max(2, Math.min(12, p.seats || 4));
  let decks  = p.decks || 0;
  let jokers = p.jokers !== false;
  let target = [0, 200, 500].indexOf(p.target | 0) >= 0 ? (p.target | 0) : 0;
  let lvl    = p.lvl || 2;

  function paint(){
    const rule = E.deckRule(seats);
    if (decks < rule.min || decks > rule.max) decks = rule.min;
    const MPX = window.KARTI_MP;
    /* Can the shared lobby actually open a rummy room on this build?
       Feature-detected, not assumed: gameLobby() folds an unknown id
       back to 'cards', so the answer is one honest comparison. */
    let onlineReady = false;
    try { onlineReady = !!(MPX && MPX.gameLobby && MPX.gameLobby('rummy').id === 'rummy'); } catch(e){}

    el.innerHTML =
      '<div class="tbar">' +
        '<button class="iconbtn" id="rm-back" aria-label="Back">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>RUMMY</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<p class="blurb">Draw one, meld your sets and runs, throw one. First hand empty ' +
        'takes the lot — and the pack count grows with the table, because that is how ' +
        'twelve people play one game.</p>' +

        '<div class="tiny pt-lbl">How many at the table</div>' +
        '<div class="rm-step">' +
          '<button class="rm-rnd" id="rm-s-dn"' + (seats <= 2 ? ' disabled' : '') + ' aria-label="Fewer players">&minus;</button>' +
          '<span class="v">' + seats + '<i>players</i></span>' +
          '<button class="rm-rnd" id="rm-s-up"' + (seats >= 12 ? ' disabled' : '') + ' aria-label="More players">+</button>' +
        '</div>' +

        '<div class="tiny pt-lbl">How many packs</div>' +
        '<div class="pt-opts two" id="rm-decks">' +
          [rule.min, rule.min + 1].map(d =>
            '<button class="pt-opt' + (d === decks ? ' on' : '') + '" data-d="' + d + '">' +
              ico('cards') + '<b>' + d + (d === 1 ? ' pack' : ' packs') + '</b>' +
              '<i>' + (d === rule.min ? 'The table’s minimum.' : 'Optional — a looser game.') + '</i>' +
            '</button>').join('') +
        '</div>' +
        '<p class="rm-why">' + esc(rule.why) + '</p>' +

        '<div class="tiny pt-lbl">Jokers</div>' +
        '<div class="pt-opts two" id="rm-jok">' +
          '<button class="pt-opt' + (jokers ? ' on' : '') + '" data-j="1">' + ico('cards') +
            '<b>Two per pack</b><i>Wild in a new meld. 15 against you if caught.</i></button>' +
          '<button class="pt-opt' + (!jokers ? ' on' : '') + '" data-j="0">' + ico('lock') +
            '<b>None</b><i>The purist’s table.</i></button>' +
        '</div>' +

        '<div class="tiny pt-lbl">How long a match</div>' +
        '<div class="pt-opts" id="rm-target">' +
          [[0, 'One hand', 'Decisive. The party option.'],
           [200, 'First to 200', 'A few hands.'],
           [500, 'First to 500', 'An evening.']].map(o =>
            '<button class="pt-opt' + (o[0] === target ? ' on' : '') + '" data-t="' + o[0] + '">' +
              ico('trophy') + '<b>' + o[1] + '</b><i>' + o[2] + '</i></button>').join('') +
        '</div>' +

        '<div class="tiny pt-lbl">How sharp is the machine</div>' +
        '<div class="pt-opts" id="rm-lvl">' + levels().map(o =>
          '<button class="pt-opt' + (o.level === lvl ? ' on' : '') + '" data-lvl="' + o.level + '">' +
            ico('diff-' + Math.min(3, o.level)) + '<b>' + esc(o.name) + '</b><i>' + esc(o.note || '') + '</i>' +
          '</button>').join('') +
        '</div>' +

        '<div class="pt-acts" style="margin-top:18px;display:grid;gap:9px">' +
          '<button class="btn primary" id="rm-go">Deal — you vs ' + (seats - 1) +
            ' machine' + (seats - 1 === 1 ? '' : 's') + '</button>' +
          (ST.save ? '<button class="btn ghost" id="rm-res">Carry on the saved hand</button>' : '') +
          (window.KARTI_MP
            ? (onlineReady
                ? '<button class="btn ghost" id="rm-online">Open an online RUMMY room</button>'
                : '<p class="pt-warn" style="margin:0">Online rooms for RUMMY need the lobby and ' +
                  'the relay to learn its name first — the wiring on this build is ready and ' +
                  'waiting for those two lines.</p>')
            : '') +
        '</div>' +
        '<div class="kb-rules" style="margin:16px 2px 20px;padding:12px 14px;border-radius:14px;' +
          'background:rgba(255,255,255,.04);border:1px solid var(--line)">' +
          '<h5 style="font:900 10px/1 var(--disp);letter-spacing:.11em;text-transform:uppercase;' +
            'color:var(--gold);margin:0 0 9px">The rules, as this table plays them</h5><ul style="margin:0;padding:0">' +
          RULES.map(r => '<li style="font-size:12px;line-height:1.65;color:var(--dim);' +
            'margin:0 0 6px 16px">' + r + '</li>').join('') + '</ul></div>' +
      '</div>';

    el.querySelector('#rm-back').onclick = () => P.hub();
    el.querySelector('#rm-s-dn').onclick = () => { if (seats > 2){ seats--; decks = 0; paint(); } };
    el.querySelector('#rm-s-up').onclick = () => { if (seats < 12){ seats++; decks = 0; paint(); } };
    el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { decks = +b.dataset.d; paint(); });
    el.querySelectorAll('[data-j]').forEach(b => b.onclick = () => { jokers = !!+b.dataset.j; paint(); });
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { target = +b.dataset.t; paint(); });
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { lvl = +b.dataset.lvl; paint(); });
    el.querySelector('#rm-go').onclick = () => {
      pref({ seats, decks, jokers, target, lvl });
      newGame({ seats, decks, jokers, target, humans: 1, lvl });
    };
    const rs = el.querySelector('#rm-res');
    if (rs) rs.onclick = () => { if (ST.save) newGame(null, ST.save); };
    const on = el.querySelector('#rm-online');
    if (on) on.onclick = () => {
      pref({ seats, decks, jokers, target, lvl });
      openOnline();
    };
  }
  paint();
}

/* ═══════════════════════════════════════════════════════════════════
   ONLINE — the two halves js/mp.js reads: KARTI_RUMMY.lobby before a
   card exists, KARTI_PARTY.online.rummy to carry a move. Everything
   below is live the moment mp.js's GAMES list and the relay's TABLES
   learn the id 'rummy'; until then the setup sheet says so honestly.

   ONE HOUSE SETUP ONLINE. Every phone must deal the identical game
   from the shared seed, and the roster carries no settings — so an
   online table is always: the mandatory pack count for its size,
   jokers in, one decisive hand. The knobs are an offline luxury.
   ═══════════════════════════════════════════════════════════════════ */
let NET = null;

function onlineStart(cfg){
  cfg = cfg || {};
  const chairs = (cfg.seats || []).filter(Boolean);
  const n = chairs.length;
  if (n < 2 || n > 12)
    throw new Error('RUMMY: seats 2 to 12, not ' + n);

  const toGame = {}, toRoom = [];
  chairs.forEach((s, g) => {
    const room = (typeof s.seat === 'number') ? s.seat : g;
    toGame[room] = g;
    toRoom[g] = room;
  });
  const meSeatG = (toGame[cfg.you] !== undefined) ? toGame[cfg.you] : 0;
  const iAmHost = (cfg.you === (cfg.host | 0));
  const lvl = (chairs.map(s => s && s.level).find(v => v)) || 2;

  const meta = chairs.map((s, g) => ({
    name: String(s.name || ('Player ' + (g + 1))).slice(0, 14),
    own:  g === meSeatG ? 'me' : (s.kind === 'cpu' ? 'ai' : 'net'),
    lvl:  s.level || lvl
  }));

  leave();
  const opts = { seats: n, decks: 0, jokers: true, target: 0, humans: n, lvl };
  const m = startMatch(opts, cfg.seed >>> 0);
  if (!m) throw new Error('RUMMY would not deal ' + n + ' hands');
  M.meta = meta;
  applyMeta();

  NET = Object.assign({}, cfg.net, { host: iAmHost, toGame, toRoom });
  M.net = NET;
  injectCSS();
  P.show();
  M.finished = false;
  openBoard(() => { const nx = NET; leave(); if (nx && nx.onLeave) nx.onLeave(); else P.hub(); });
  render();
  cue('game.start', { gain: 0.9 }, true);
  return snapshot();                     /* for a caller that wants it; never sent */
}

function onlineRemote(seat, wire){
  if (!M || M.dead || !NET) return { ok:false, why:'no hand on this table' };
  const g = NET.toGame[seat];
  if (g === undefined) return { ok:false, why:'a move from a chair that is not at this table' };
  const mv = E.decWire(wire);
  if (!mv) return { ok:false, why:'a move this table does not know how to make' };
  /* flush the table's own beats first — the wire outruns a timer */
  let guard = 0;
  while (E.turn(M.st) === -1 && guard++ < 8){
    const opts = E.legal(M.st, -1);
    if (!opts.length) break;
    if (!doMove(-1, opts[0], 'auto').ok) break;
  }
  mv.seat = g;
  const r = doMove(g, mv, 'net');
  if (!r.ok){
    const who = (M.st.seats[g] ? M.st.seats[g].name : 'that chair');
    const e = String(r.err || 'refused');
    return { ok:false, why: (/turn/.test(e) ? 'a move out of turn'
                           : /illegal/.test(e) ? 'a card the rules will not have'
                           : /over/.test(e) ? 'a move after the hand had finished'
                           : 'a refused move (' + e + ')') + ' from ' + who };
  }
  M.tmp.sel = [];
  render();
  return null;
}

function onlineNote(text, tone){ if (M && M.ctx) P.ui.setNet(M.ctx, text || '', tone || ''); }
function onlineStop(why, tone){
  if (!M || M.dead || !M.ctx) return;
  const ctx = M.ctx;
  stopThinking();
  M.finished = true;
  P.ui.setNet(ctx, '', '');
  P.ui.result(ctx, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? 'No deal' : 'Cut off',
    why: why || 'The table stopped.',
    quip: 'Nothing was scored. Nobody loses a hand over a dropped connection.',
    buttons: [{ label:'Back to the rooms', icon:'back', cls:'primary',
                go: () => { const nx = NET; leave();
                            if (nx && nx.onLeave) nx.onLeave(); else P.hub(); } }]
  });
}

const NET_HOOKS = {
  live:      () => !!(M && !M.dead && !E.over(M.st)),
  phase:     () => !M ? 'idle' : (E.over(M.st) ? 'over' : 'play'),
  seed:      () => (M ? M.seed : null),
  gameId:    () => (M ? 'rummy' : null),
  turn:      () => (M && NET) ? (NET.toRoom[E.turn(M.st)] != null
                                 ? NET.toRoom[E.turn(M.st)] : -1) : -1,
  over:      () => (M ? E.over(M.st) : null),
  moveCount: () => (M ? M.log.length : 0),
  /* the agreement line for a bug report: hands, melds, stock, log, hashed */
  check(){
    if (!M) return '';
    const st = M.st;
    const s = ['rummy', M.seed, M.log.length, E.turn(st),
               st.seats.map(x => x.hand.length + '/' + x.score).join('.'),
               st.melds.map(m => m.cards.join('-')).join(','),
               st.stock.length, st.disc.length].join('|');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  },
  /* NEVER the whole state over the wire. Other hands become counts,
     the stock becomes a count; the pile and the melds are face up on
     the table and stay. */
  view: seat => {
    if (!M || !NET || NET.toGame[seat] === undefined) return null;
    const g = NET.toGame[seat];
    const st = clone(M.st);
    st.you = g;
    st.seats.forEach((s, i) => {
      if (i !== g && s.hand){ s.hidden = s.hand.length; s.hand = []; }
    });
    st.stockLeft = st.stock.length; st.stock = [];
    return st;
  },
  onMove: fn => {
    const f = info => {
      if (!M || M.dead || !NET || !info) return;
      const w = E.encWire(info.move);
      if (!w) return;
      const room = NET.toRoom[info.seat];
      fn(w, { seat: (room == null ? info.seat : room), src: info.src });
    };
    moveSubs.push(f);
    return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); };
  },
  apply: (seat, wire) => onlineRemote(seat, wire)
};

P.online = P.online || {};
P.online.rummy = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  live: () => NET_HOOKS.live(),
  hooks: NET_HOOKS
};

function openOnline(){
  const MPX = window.KARTI_MP;
  if (!MPX || !MPX.MP) return;
  try { MPX.mpLeave(); } catch(e){}
  MPX.MP.wantGame = 'rummy';
  try { K.go('mp'); } catch(e){}
  try { MPX.mpScreen(); } catch(e){}
  MPX.start('create', null, null, false, 'rummy');
}

/* ── the lobby contract — what js/mp.js reads before a card exists ── */
R.lobby = {
  id:'rummy',
  name:'Rummy',
  mt:'Ir-Rummy',
  minSeats: 2,
  maxSeats: 12,
  levels: levels(),
  defaultLevel: 2,
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu')
    ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    const n = (seatList || []).length;
    if (n < 2) return { ok:false, why:'Nobody deals to one.' };
    if (n > 12) return { ok:false, why:'Twelve is the table. Thirteen is a queue.' };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready)
      return { ok:false, why:unready + (unready > 1 ? ' people are' : ' person is') +
                             ' not ready yet.' };
    return { ok:true, why:'' };
  },
  rulesHTML: () =>
    '<p>Draw one, meld sets and runs, lay off, throw one. First hand empty scores ' +
    'everything left in every other hand.</p>' +
    '<p>2 to 12 players. The pack count follows the table — one pack to 4, two to 8, ' +
    'three to 12 — and an online table always plays the house setup: the mandatory ' +
    'packs, jokers in, one decisive hand.</p>',
  blurb:'Draw one, meld, throw one. First hand empty takes the lot. Up to twelve, ' +
        'and the pack count grows with the table.',
  start(seatsList, opts){
    const list = (seatsList || []).filter(Boolean);
    const n = Math.max(2, Math.min(12, list.length || 4));
    const lvl = (list.map(s => s && s.level).find(v => v)) || 2;
    return newGame({ seats: n, decks: 0, jokers: true,
                     target: 0, humans: 1, lvl,
                     seed: opts && opts.seed });
  },
  myName(){
    try {
      const n = K.displayName && K.displayName();
      if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
        return String(n).trim().slice(0, 14);
    } catch(e){}
    return 'You';
  },
  wire: { fields: E.WIRE_FIELDS },
  takeback: false      /* eleven people voting on your undo is not a game */
};

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF — one tile under Card games; register() replaces by id,
   so party.js wiring the same descriptor again costs nothing.
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'rummy', order:35, kind:'card', name:'RUMMY', mt:'Ir-Rummy',
  sprite:'rm-t-rummy', icon:'cards', status:'live',
  get tag(){
    return 'Draw one, meld your sets and runs, throw one. Up to twelve players, ' +
           'and the pack count grows with the table.' +
           (ST.save ? ' There is a hand of this half-played.' : '');
  },
  open: () => setupSheet(),
  /* the fields js/mp.js's gameLobby() reads OFF THE TILE when the game
     has no LOBBY_GLOBAL entry yet — seats, levels, rules, start. The
     one thing a tile cannot carry is `wire`, which is why the report
     asks for the single LOBBY_GLOBAL line. */
  seats: { min:2, max:12 },
  levels: levels(),
  rulesHTML: () => R.lobby.rulesHTML(),
  start: (seatsList, opts) => R.lobby.start(seatsList, opts)
};
R.shelfTile = TILE;
R.open = () => setupSheet();
R.close = () => { leave(); P.hub(); };
P.register(TILE);

/* teach the shared lobby the word, the way js/gin-ui.js does: mp.js
   exports its registry LIVE so a game can introduce itself without
   anybody editing mp.js. Harmless if mp.js has since learned the id
   itself, and honest if mp.js is older than this file. */
(function teachLobby(){
  const MPX = window.KARTI_MP;
  if (!MPX || !Array.isArray(MPX.GAMES) || !Array.isArray(MPX.GAME_KEYS)) return;
  if (MPX.GAME_KEYS.indexOf('rummy') >= 0) return;
  MPX.GAMES.push({ k:'rummy', name:'Rummy', short:'RUMMY', icon:'cards',
    blurb:'Meld, lay off, throw one. Twelve can play.' });
  MPX.GAME_KEYS.push('rummy');
  if (MPX.SEATS_FALLBACK) MPX.SEATS_FALLBACK.rummy = [2, 12, 4];
})();

/* the shelf mark must exist before the shelf is painted */
if (document.body) injectDefs();
else document.addEventListener('DOMContentLoaded', injectDefs);

/* ── test hooks — inert unless the page is opened with ?pttest ──── */
try {
  if (String(location.search).indexOf('pttest') >= 0){
    window.__RM_TEST = {
      badAI: 0,
      M: () => M,
      st: () => (M ? M.st : null),
      engine: E,
      start: opts => { newGame(opts || { seats:4, decks:0, jokers:true, target:0, humans:1, lvl:2 }); return true; },
      startSeed: (opts, seed) => { newGame(null, { v:1, gid:'rummy', opts, seed, log:[] }); return true; },
      fast: on => { FAST = !!on; },
      doMove, rollbackTo, undoPoint, snapshot,
      render, setup: setupSheet,
      sel: () => (M ? (M.tmp.sel || []) : []),
      store: () => ST
    };
  }
} catch(e){}

})();
