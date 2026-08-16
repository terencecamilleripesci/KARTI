/* ═══════════════════════════════════════════════════════════════════
   KARTI — rummy-ui.js
   RUMMY — the table. The rules live in js/rummy.js; this file is the
   screen, the runner and the wire, and it follows js/klabb.js's shape
   deliberately: a match is (opts, seed, log), every move goes through
   one doMove() gate, and rollback is cutting the log and replaying.

   THE GAME ON THIS SCREEN (the owner's own words are in the engine
   header): one game, seven cards or ten, hold everything, draw one,
   throw one, and the moment your whole hand is melds — 4+3, or
   4+3+3 — you tap RUMMY! and you have won. No points anywhere on
   this screen: no deadwood, no totals, no target. After a win every
   seat answers PLAY AGAIN or leaves, and the table keeps the human
   scoreboard — hands won and streaks — read straight off st.book.

   WHAT THIS FILE IS
     · the shelf tile and the setup sheet (hand size, seats, DECKS —
       enforced, see js/rummy.js — jokers, the machine), with the
       rules FOLDED shut so starting a game is short
     · the felt: opponents rail, stock + pile, your own arrangement
       (the melds you hold and the cards not working yet), the hand,
       and the two buttons a turn is made of — RUMMY! and Throw
     · the play-again vote and the table tally after every won hand
     · the runner: log, seed, autosave (karti_rummy_v1), undo offline
     · the online half js/mp.js drives: KARTI_RUMMY.lobby and
       KARTI_PARTY.online.rummy

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
const SAVE_V = 2;      /* v1 saves are the old scored, melds-on-the-table
                          game and cannot replay through these rules —
                          they are dropped here, quietly and honestly,
                          instead of desyncing a resumed hand */
let ST = { v:1, pref:{}, rec:{ w:0, l:0, d:0 }, save:null };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object'){
    ST.pref = (j.pref && typeof j.pref === 'object') ? j.pref : {};
    ST.rec  = (j.rec  && typeof j.rec  === 'object') ? j.rec  : ST.rec;
    ST.save = (j.save && j.save.v === SAVE_V) ? j.save : null;
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

/* ── UI-only preferences, in their OWN key (il-kiri's dock rule): a
   UI preference is not the game. Binning or finishing a game must
   never forget how you keep the rules folded, and clearing this must
   never touch a saved hand in karti_rummy_v1. Two flags live here:
   the in-game rules panel, and the setup sheet's rules fold. ─────── */
const UIKEY = 'karti_rummy_ui_v1';
let rulesOpen = false;
let setupOpen = false;               /* the setup sheet's rules — CLOSED by
                                        default, because starting a game
                                        should be short */
try { rulesOpen = localStorage.getItem(UIKEY + '.rules') === '1'; } catch(e){}
try { setupOpen = localStorage.getItem(UIKEY + '.setup') === '1'; } catch(e){}
function setSetupOpen(open){
  setupOpen = !!open;
  try { localStorage.setItem(UIKEY + '.setup', setupOpen ? '1' : '0'); } catch(e){}
}

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

    /* ── the draw felt — the skarta idea: not a strip of boxes but a
       table surface the stock and the pile SIT ON, each a slot with
       its small label underneath. The pile is drawn as a pile. */
    '#scr-party .rm-draws{flex:1 1 auto;min-height:106px;max-height:172px;position:relative;' +
      'display:flex;align-items:center;justify-content:center;gap:26px;padding:8px 8px 5px;' +
      'border-radius:14px;overflow:hidden;' +
      'background:radial-gradient(115% 95% at 50% 28%,#274475 0%,#172A4E 62%,#0E1B36 100%);' +
      'border:1px solid rgba(0,0,0,.45);' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.06),inset 0 -12px 26px rgba(0,0,0,.35)}' +
    /* the etched inner ring: an empty middle still reads as laid on
       purpose — which is every hand here, where nothing goes down */
    '#scr-party .rm-draws::before{content:"";position:absolute;inset:6px;border-radius:9px;' +
      'border:1px solid rgba(255,255,255,.07);pointer-events:none}' +
    '#scr-party .rm-slot{position:relative;z-index:1;display:flex;flex-direction:column;' +
      'align-items:center;gap:5px}' +
    '#scr-party .rm-slot .t{font:900 8.5px/1 var(--disp);letter-spacing:.12em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.5)}' +
    '#scr-party .rm-feltag{position:absolute;right:10px;bottom:6px;font:900 9.5px/1 var(--disp);' +
      'letter-spacing:.16em;color:rgba(255,255,255,.16);pointer-events:none}' +
    '#scr-party .rm-drawbtn{position:relative;padding:0;border:0;background:none;line-height:0;' +
      'border-radius:7px;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .rm-drawbtn.go .kb-card{box-shadow:0 0 0 2.5px rgba(61,220,132,.9),' +
      '0 6px 14px rgba(0,0,0,.4)}' +
    '#scr-party .rm-drawbtn[disabled]{opacity:.75}' +
    /* the stock looks like a deck: offset sheets behind the top back */
    '#scr-party .rm-stock .kb-card{box-shadow:0 4px 12px rgba(0,0,0,.5),' +
      '3px -3px 0 -1px #10203E,3px -3px 0 0 rgba(255,255,255,.13),' +
      '6px -6px 0 -1px #10203E,6px -6px 0 0 rgba(255,255,255,.09)}' +
    '#scr-party .rm-stock.go .kb-card{box-shadow:0 0 0 2.5px rgba(61,220,132,.9),' +
      '0 4px 12px rgba(0,0,0,.5),' +
      '3px -3px 0 -1px #10203E,3px -3px 0 0 rgba(255,255,255,.13),' +
      '6px -6px 0 -1px #10203E,6px -6px 0 0 rgba(255,255,255,.09)}' +
    /* the pile is a HEAP — every card in the same grid cell at its own
       fixed angle, the ones underneath dimmed (skarta's trick) */
    '#scr-party .rm-pile{position:relative;display:grid}' +
    '#scr-party .rm-pile .rm-pl{grid-area:1/1;' +
      'transform:translate(var(--dx,0px),var(--dy,0px)) rotate(var(--r))}' +
    '#scr-party .rm-pile .rm-pl:last-child{position:relative;z-index:2}' +
    '#scr-party .rm-pile .rm-pl:not(:last-child) .kb-card{filter:brightness(.72);' +
      'box-shadow:0 1px 4px rgba(0,0,0,.45)}' +
    '#scr-party .rm-empty{display:block;aspect-ratio:5/7;border-radius:7px;' +
      'border:1.5px dashed rgba(255,255,255,.26)}' +
    '#scr-party .rm-count{position:absolute;right:-7px;top:-7px;min-width:22px;height:22px;' +
      'border-radius:999px;display:grid;place-items:center;padding:0 5px;' +
      'font:900 10.5px/1 var(--disp);color:#241800;background:var(--rm-gold);' +
      'border:1px solid #FFE9B0;box-shadow:0 2px 5px rgba(0,0,0,.5)}' +

    /* ── the arrangement shelf: YOUR melds and the cards not working
       yet — hand organisation, never a score ── */
    '#scr-party .rm-melds{flex:1;min-height:52px;display:flex;flex-wrap:wrap;gap:7px 9px;' +
      'align-content:center;justify-content:center;overflow-y:auto;overflow-x:hidden;' +
      'padding:5px 3px;border-radius:12px;background:rgba(0,0,0,.16);' +
      '-webkit-overflow-scrolling:touch}' +
    '#scr-party .rm-meld{flex:0 0 auto;display:flex;align-items:center;padding:5px 6px 4px;' +
      'border:1px solid transparent;border-radius:10px;background:none;line-height:0}' +
    '#scr-party .rm-meld .kb-card{margin-left:-17px;box-shadow:0 1px 3px rgba(0,0,0,.5)}' +
    '#scr-party .rm-meld .kb-card:first-child{margin-left:0}' +
    /* the loose pile — the cards that are not working yet, set apart
       from the melds by a dashed rule rather than by colour */
    '#scr-party .rm-loose{border-style:dashed;border-color:rgba(255,255,255,.22);' +
      'border-radius:10px;opacity:.85}' +
    '#scr-party .rm-none{width:100%;font:700 10.5px/1.5 var(--disp);letter-spacing:.11em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.3);text-align:center;padding:14px 8px}' +
    /* the winning reveal lands as a victory, not a caption */
    '#scr-party .rm-none.rm-won{color:var(--rm-gold);font-size:13px;padding:4px 8px}' +

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

    /* ── the table tally (hands won · streaks) and the vote ── */
    '#scr-party .rm-book{width:100%;max-width:300px;margin:6px auto;border-collapse:collapse}' +
    '#scr-party .rm-book td{padding:4px 8px;font-size:11.5px;color:rgba(255,255,255,.8);' +
      'border-bottom:1px solid rgba(255,255,255,.1)}' +
    '#scr-party .rm-book td.n{text-align:right;font:700 11px/1.4 ui-monospace,SFMono-Regular,' +
      'Menlo,monospace;white-space:nowrap}' +
    '#scr-party .rm-book tr.win td{color:var(--rm-gold)}' +
    '#scr-party .rm-book tr.out td{color:rgba(255,255,255,.38)}' +
    '#scr-party .rm-book td i{font-style:normal;color:rgba(255,255,255,.45);font-size:10px}' +

    /* ── the rules: a panel that HIDES AND SLIDES, not a wall. It
       drops from the top of the table and stops well above the hand,
       because a rule is only useful next to the cards it applies to.
       No scrim — the table under it stays live. transform+opacity
       only, and reduced motion gets an instant show/hide. The table
       tally lives at the top of it, so the scoreboard is one tap away
       mid-hand without covering the cards. ── */
    '#scr-party .rm-rules{position:absolute;top:0;left:0;right:0;z-index:30;max-height:54%;' +
      'display:flex;flex-direction:column;border-radius:14px;overflow:hidden;' +
      'background:linear-gradient(180deg,#1D2F55,#101E3C);border:1px solid rgba(255,255,255,.16);' +
      'box-shadow:0 14px 30px rgba(0,0,0,.55);' +
      'transform:translateY(-108%);opacity:0;visibility:hidden;pointer-events:none;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease),visibility 0s .26s}' +
    '#scr-party .rm-rules.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease)}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .rm-rules{transition:none}}' +
    'body.reduced #scr-party .rm-rules{transition:none}' +
    '#scr-party .rm-rules-h{flex:0 0 auto;display:flex;align-items:center;' +
      'justify-content:space-between;padding:9px 4px 2px 14px}' +
    '#scr-party .rm-rules-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--rm-gold)}' +
    '#scr-party .rm-rules-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;' +
      'color:var(--txt);cursor:pointer;display:grid;place-items:center;' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .rm-rules-x svg{width:16px;height:16px;stroke:currentColor;fill:none;' +
      'stroke-width:2.2;stroke-linecap:round}' +
    '#scr-party .rm-rules-b{min-height:0;overflow-y:auto;padding:2px 14px 12px;' +
      '-webkit-overflow-scrolling:touch}' +
    '#scr-party .rm-rules-b ul{margin:0;padding:0}' +
    '#scr-party .rm-rules-b li{font-size:12px;line-height:1.6;color:var(--dim);' +
      'margin:0 0 6px 14px}' +
    '#scr-party .rm-rules-b .rm-tallyh{font:900 10px/1 var(--disp);letter-spacing:.11em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.5);margin:4px 0 2px}' +

    /* ── the setup sheet: the deck line, the steppers, and the rules
       FOLD — grid-rows 0fr→1fr for the height, transform+opacity on
       the list inside, so it slides instead of appearing ── */
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
    '#scr-party .rm-fold-h{display:flex;align-items:center;gap:10px;width:100%;text-align:left;' +
      'border:0;background:none;padding:2px 0;margin:0;color:var(--txt);cursor:pointer;' +
      'min-height:44px;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .rm-fold-h span{flex:1;min-width:0}' +
    '#scr-party .rm-fold-h b{display:block;font:900 10px/1.4 var(--disp);letter-spacing:.11em;' +
      'text-transform:uppercase;color:var(--gold,#FFC542)}' +
    '#scr-party .rm-fold-h i{display:block;font-style:normal;font-size:10.5px;line-height:1.4;' +
      'color:var(--dim);margin-top:3px}' +
    '#scr-party .rm-fold-h em{flex:0 0 auto;width:24px;height:24px;display:grid;' +
      'place-items:center;color:var(--dim)}' +
    '#scr-party .rm-fold-h em svg{width:15px;height:15px;stroke:currentColor;fill:none;' +
      'stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;transform:rotate(90deg);' +
      'transition:transform .22s var(--ease)}' +
    '#scr-party .rm-fold-h[aria-expanded="true"] em svg{transform:rotate(-90deg)}' +
    '#scr-party .rm-fold-b{display:grid;grid-template-rows:0fr;' +
      'transition:grid-template-rows .28s var(--ease)}' +
    '#scr-party .rm-fold-b.open{grid-template-rows:1fr}' +
    '#scr-party .rm-fold-i{overflow:hidden;min-height:0}' +
    '#scr-party .rm-fold-i ul{transform:translateY(-10px);opacity:0;' +
      'transition:transform .28s var(--ease),opacity .28s var(--ease)}' +
    '#scr-party .rm-fold-b.open .rm-fold-i ul{transform:none;opacity:1}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .rm-fold-b,#scr-party .rm-fold-i ul' +
      '{transition:none}}' +
    'body.reduced #scr-party .rm-fold-b,body.reduced #scr-party .rm-fold-i ul{transition:none}' +

    /* ── short screens (landscape phones) ──
       A landscape phone gets ~200px of felt and the portrait stack
       cannot fit it — so the felt becomes TWO COLUMNS: the table
       (stock, pile, arrangement) on the left, your hand and its
       buttons on the right, the player rail across the top. Nothing
       sits below the fold; the arrangement shelf alone scrolls. */
    '@media (max-height:520px){' +
      '#scr-party .rm-table{display:grid;column-gap:10px;row-gap:3px;padding:5px 6px 6px;' +
        'grid-template-columns:auto minmax(0,1fr);' +
        /* the felt row has a FLOOR: a 40px card is 56 tall and the felt
           clips (overflow:hidden), so a squeezed row would cut the
           stock and pile in half. If the floor overflows the table it
           scrolls, and render() keeps the hand above the fold. */
        'grid-template-rows:auto minmax(66px,1fr) auto auto;' +
        'grid-template-areas:"opps opps" "draws melds" "hand hand" "acts acts";' +
        'overflow-y:auto;-webkit-overflow-scrolling:touch}' +
      '#scr-party .rm-opps{grid-area:opps}' +
      '#scr-party .rm-draws{grid-area:draws;align-self:stretch;min-height:0;max-height:none;' +
        'padding:5px 9px 3px;gap:14px}' +
      '#scr-party .rm-slot{gap:0}' +
      '#scr-party .rm-slot .t{display:none}' +
      '#scr-party .rm-count{top:-2px;right:-6px}' +
      '#scr-party .rm-melds{grid-area:melds;min-height:30px;overflow-y:auto;' +
        'align-content:center}' +
      '#scr-party .rm-say{display:none}' +
      '#scr-party .rm-hand{grid-area:hand;align-self:end}' +
      '#scr-party .rm-row{padding-top:4px}' +
      '#scr-party .rm-acts{grid-area:acts;padding-top:2px;align-self:end}' +
      '#scr-party .rm-opp{min-width:46px;padding:2px 5px}' +
      '#scr-party .rm-opp .c{font-size:11px}' +
      '#scr-party .rm-opp .s{display:none}' +
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
  stopVote();
  M = {
    opts: clone(opts || {}),
    seed: (seed == null ? newSeed() : seed) >>> 0,
    log: log ? clone(log) : [],
    st: null, ctx: null,
    tmp: {},                       /* sel: cards picked up off the hand */
    timer: 0, voteTimer: 0, dead: false, finished: false,
    recorded: 0,                   /* book rows already sent to the record */
    net: null, meta: null
  };
  M.st = buildState(M.opts, M.seed, M.log);
  M.recorded = M.st.book.length;   /* a restored save does not re-count */
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
/* the AI/table beat timer ONLY. The vote clock is deliberately not
   cleared here: step() calls this at the tail of every render, and
   killing the vote interval there was the bug that made online silence
   last forever — the 20-second countdown died on the very render that
   started it, so a silent phone never sent its 'go' and the whole
   table waited on it without end. voteClock() manages its own life;
   stopVote() is for the moments the match itself is being put away. */
function stopThinking(){
  if (M && M.timer){ clearTimeout(M.timer); M.timer = 0; }
}
function stopVote(){
  if (M && M.voteTimer){ clearInterval(M.voteTimer); M.voteTimer = 0; }
  if (M && M.tmp) M.tmp.voteUntil = 0;
}
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
  stopVote();
  M.log = M.log.slice(0, n);
  M.st = buildState(M.opts, M.seed, M.log);
  applyMeta();
  M.tmp = {};
  M.recorded = Math.min(M.recorded, M.st.book.length);
  autosave();
  fire(stateSubs, { reason:'rollback', index:n });
  return n;
}
/* offline undo point: back to just before this player's last DRAW —
   a turn is draw…throw, and unpicking half a turn is a mess. It never
   crosses back over a won hand: undoing somebody's RUMMY call is not
   a thing this table does. */
function undoPoint(){
  if (!M) return -1;
  for (let i = M.log.length - 1; i >= 0; i--){
    const mv = M.log[i];
    if (mv.t === 'out' || mv.t === 'next' || mv.t === 'stay' || mv.t === 'go') return -1;
    if (isLocal(mv.seat) && mv.t === 'draw') return i;
  }
  return -1;
}

function snapshot(){
  if (!M) return null;
  return { v:SAVE_V, gid:'rummy', opts:clone(M.opts), seed:M.seed, log:clone(M.log) };
}
function autosave(){
  if (!M || M.net) return;
  if (E.over(M.st)){ saveSlot(null); return; }
  saveSlot(snapshot());
}

/* ═══════════════════════════════════════════════════════════════════
   THE SOUND OF A MOVE — one subscriber; rollback replays are silent
   by construction because they never pass through doMove. The record
   book (W/L, offline only) also hangs here: every WON HAND is a
   result, because a hand is the whole game now.
   ═══════════════════════════════════════════════════════════════════ */
moveSubs.push(ev => {
  if (!M || M.dead) return;
  const mv = ev.move, mine = ev.seat >= 0 && isLocal(ev.seat);
  switch (mv.t){
    case 'draw':
      cue(mv.p ? 'pack.flip' : 'card.deal', { gain: mine ? 0.85 : 0.55 }); return;
    case 'disc':
      cue('card.throw', { gain: mine ? 0.8 : 0.58 }); return;
    /* the RUMMY call — the hand slapped flat on the table. The
       once-a-hand sound, so it is allowed to be the loud one. */
    case 'out':
      cue('rummy.call', { gain: mine ? 1 : 0.85 }, true);
      if (!M.net && M.st.book.length > M.recorded){
        M.recorded = M.st.book.length;
        const won = isLocal(M.st.book[M.st.book.length - 1].winner);
        const o = won ? 'w' : 'l';
        ST.rec[o] = (ST.rec[o] | 0) + 1; persist();
        if (typeof P.record === 'function'){ try { P.record('rummy', o); } catch(e){} }
      }
      return;
    case 'stay':
      cue('ui.tap', { gain: mine ? 0.9 : 0.6 }, true); return;
    case 'go':
      cue('ui.back', { gain: mine ? 0.9 : 0.6 }, true); return;
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
      /* the rules panel lives OVER the table, never reflowing it, and
         render() never touches it — only paintRules() does */
      '<div class="rm-rules" id="rm-rulespanel" aria-hidden="true">' +
        '<div class="rm-rules-h"><h4 id="rm-rules-t"></h4>' +
          '<button class="rm-rules-x" id="rm-rules-x" aria-label="Put the rules away">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<div class="rm-rules-b" id="rm-rules-b"></div>' +
      '</div>' +
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
    rules: root.querySelector('#rm-rulespanel'),
    wide: () => Math.max(240, root.clientWidth - 24)
  };
  root.querySelector('#rm-rules-x').addEventListener('click', () => setRules(false));
  /* tap anywhere OUTSIDE the panel puts it away — the table under it
     stays live, so this must never eat the tap itself */
  ctx.root.addEventListener('pointerdown', e => {
    if (!rulesOpen || !UI || !UI.rules) return;
    const rb = ctx.btn && ctx.btn('rm-rules');
    if (!UI.rules.contains(e.target) && !(rb && rb.contains(e.target))) setRules(false);
  }, true);
  /* one delegated listener for the whole felt */
  root.addEventListener('click', e => {
    if (!M || M.dead) return;
    /* NOTE the hand-card selector is scoped: every card face carries
       data-cid, including the minis inside the arrangement and the top
       of the pile inside the draw button — an unscoped [data-cid]
       would catch those FIRST on the way up and swallow the tap. */
    const t = e.target && e.target.closest &&
              e.target.closest('[data-draw],[data-act],#rm-hand [data-cid]');
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
  if (t.hasAttribute('data-act')){
    const a = t.getAttribute('data-act');
    const s = sel();
    if (a === 'out' && mine && st.phase === 'act'){
      const c = findOut(st, me);
      if (c == null){
        /* refused, and it SAYS what is missing rather than just buzzing */
        cue('ui.error', { gain: 0.9 }, true);
        if (K.toast) K.toast('⚠ ' + whyNotOut(E.bestCover(st.seats[me].hand), st.mode)
                               .replace(/<[^>]*>/g, ''));
        return;
      }
      tryMove({ t:'out', c });
    }
    else if (a === 'disc' && mine && st.phase === 'act' && s.length === 1)
      tryMove({ t:'disc', c: s[0] });
    else if (a === 'sort'){
      M.tmp.sorted = !M.tmp.sorted;
      cue('ui.toggle', { gain: 0.8 }, true);
      render();
    }
    else if (a === 'stay' && st.phase === 'vote' && E.turn(st) === me)
      tryMove({ t:'stay' });
    else if (a === 'go' && st.phase === 'vote' && E.turn(st) === me){
      P.ui.confirm(M.ctx, {
        head:'Leave the table?',
        why:'The others play on without you. The tally stays theirs.',
        yes:'Leave', no:'No, stay in',
        go: () => { tryMove({ t:'go' }); }
      });
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
  /* MY 'go' is the one vote with a next screen of its own: the leaver
     is told the table carried on, instead of watching a game he has
     left himself out of. */
  if (mv.t === 'go'){ leftTable(); return; }
  render();
}

/* ── is there a winning RUMMY call in this hand, and which card does
   it throw? Preferring the card the player has actually picked up, so
   "select the one I want gone, tap RUMMY!" does what it looks like —
   and when nothing is picked up the call chooses its own throw,
   because the hand ends on the spot and the choice cannot matter to
   anybody. One tap, never a hunt. ── */
function findOut(st, seat){
  const me = st.seats[seat];
  if (!me || st.phase !== 'act') return null;
  const want = (M.tmp.sel || [])[0];
  const order = (want != null && me.hand.indexOf(want) >= 0)
    ? [want].concat(me.hand.filter(c => c !== want))
    : me.hand;
  for (const c of order)
    if (E.check(st, { t:'out', c }, seat)) return c;
  return null;
}

/* WHY NOT, IN WORDS. A refusal that just says "no" on a hand the
   player believes is finished is the single most infuriating thing a
   rules engine can do, so this says what the hand is missing — shape
   talk, never points, because this game has none. It reads
   bestCover(), the same search the AI steers by; outCheck() stays
   the only gate. */
function whyNotOut(cov, mode){
  const S = E.shapeName(mode);
  const made = cov.melds.length, loose = cov.loose.length;
  const shape = cov.melds.map(m => m.cards.length).sort((a, b) => b - a);
  if (!made) return 'You need <b>' + S + '</b>. Nothing is arranged yet.';
  if (loose === 0)
    return 'Every card is working, but the shape is ' + shape.join('+') +
           ' — it has to be <b>' + S + '</b>.';
  return made + (made === 1 ? ' meld' : ' melds') + ' made (' + shape.join('+') + '), <b>' +
         loose + (loose === 1 ? ' card' : ' cards') + ' not working yet</b>. ' +
         'Throw one and keep hunting.';
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

/* ── the table tally, as one small table. Hands won and streaks —
   the human scoreboard, derived from st.book, never stored twice. ── */
function tallyRows(st, voting){
  const t = E.tally(st);
  const rows = st.seats.map((p, i) => {
    if (p.gone && !t[i].won && !voting) return '';       /* long gone, never won */
    const status = !voting ? ''
      : p.gone ? '<i> · left the table</i>'
      : p.vote === 'stay' ? '<i> · in</i>'
      : p.vote === 'go' ? '<i> · leaving</i>'
      : '<i> · deciding…</i>';
    const streak = t[i].streak > 1 ? ' · ' + t[i].streak + ' straight' : '';
    const best = t[i].best > 1 ? ' <i>(best ' + t[i].best + ')</i>' : '';
    return '<tr class="' + (p.gone ? 'out' : (t[i].streak > 0 ? 'win' : '')) + '">' +
      '<td>' + esc(p.name) + status + '</td>' +
      '<td class="n">' + t[i].won + ' won' + streak + best + '</td></tr>';
  }).join('');
  return rows ? '<table class="rm-book">' + rows + '</table>' : '';
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
  const voting = st.phase === 'vote';

  /* somebody who left must be SAID to have left, not just vanish */
  const goneNow = st.seats.map(p => !!p.gone);
  if (M.tmp.goneSeen){
    st.seats.forEach((p, i) => {
      if (goneNow[i] && !M.tmp.goneSeen[i] && i !== me && K.toast)
        K.toast(esc(p.name) + ' left the table.');
    });
  }
  M.tmp.goneSeen = goneNow;

  /* — the rail of other players: cards in hand, hands won — */
  const tl = E.tally(st);
  UI.opps.innerHTML = st.seats.map((p, i) => {
    if (i === me || p.gone) return '';
    return '<div class="rm-opp' + (t === i ? ' on' : '') + '" data-seat="' + i + '">' +
      '<span class="n">' + esc(p.name) + '</span>' +
      '<span class="c">' + p.hand.length + '<i>KRT</i></span>' +
      (st.book.length ? '<span class="s">' + tl[i].won + ' won' +
        (tl[i].streak > 1 ? ' ·' + tl[i].streak : '') + '</span>' : '') +
      '</div>';
  }).join('');
  const on = UI.opps.querySelector('.rm-opp.on');
  if (on && on.scrollIntoView){
    try { on.scrollIntoView({ block:'nearest', inline:'center', behavior:'instant' }); } catch(e){
      try { on.scrollIntoView(false); } catch(e2){} }
  }

  /* — the felt: the stock and the pile, sitting on a table surface — */
  const short = (UI.root.clientHeight || 500) < 430;   /* a landscape phone */
  const drawW = short ? 40 : 58;
  const drawable = mine && st.phase === 'draw' && !done;
  const top = st.disc[st.disc.length - 1];
  /* the pile drawn as a PILE: the top card plus up to four peeking out
     beneath it. Each angle is fixed by the card's position in st.disc —
     never random — so the heap is identical on every repaint and on
     every phone at the table, and cards keep their lie as the pile
     grows or the top is taken. */
  const PILE_R = [-9, 7, -4, 12, -7, 5, -12, 9];
  const PILE_XY = [[-3, 1], [2, -2], [-1, 3], [3, 0], [-2, -2], [1, 2], [3, -1], [-3, 0]];
  const depth = Math.min(st.disc.length, 5);
  const pcs = st.disc.slice(-depth);
  const base = st.disc.length - depth;
  UI.draws.innerHTML =
    '<div class="rm-slot">' +
      '<button class="rm-drawbtn rm-stock' + (drawable ? ' go' : '') + '" data-draw="0" data-sfx="own"' +
        (drawable ? '' : ' disabled') + ' aria-label="Draw from the stock. ' +
        st.stock.length + ' cards left.">' +
        cardBtn(-1, { face:false, w:drawW }) +
        '<span class="rm-count">' + st.stock.length + '</span>' +
      '</button><span class="t">Stock</span></div>' +
    '<div class="rm-slot">' +
      (top === undefined
        ? '<span class="rm-empty" style="width:' + drawW + 'px" aria-hidden="true"></span>'
        : '<button class="rm-drawbtn' + (drawable ? ' go' : '') + '" data-draw="1" data-sfx="own"' +
          (drawable ? '' : ' disabled') + ' aria-label="Take the top of the pile.">' +
          '<span class="rm-pile">' +
          pcs.map((c, i) => {
            const top2 = i === pcs.length - 1;
            const j = (base + i) % PILE_R.length;
            const xy = top2 ? [0, 0] : PILE_XY[j];
            return '<span class="rm-pl" style="--r:' + (top2 ? 0 : PILE_R[j]) + 'deg;' +
              '--dx:' + xy[0] + 'px;--dy:' + xy[1] + 'px">' +
              cardBtn(c, { w:drawW }) + '</span>';
          }).join('') +
          '</span></button>') +
      '<span class="t">Pile</span></div>' +
    '<span class="rm-feltag" aria-hidden="true">' + E.shapeName(st.mode) + '</span>';

  /* — the arrangement shelf. Nothing is ever on the table in this
     game, so the shelf shows YOUR OWN hand arranged: the melds you
     hold and the cards not working yet — which is the one thing you
     actually want to see when winning means the whole hand at once.
     On a win it shows the winner's hand, as the victory it is; during
     the vote and the handover it carries the tally. — */
  const cov = E.bestCover(hand);
  const lastRow = st.book[st.book.length - 1];
  if (voting || st.phase === 'handover' || done){
    const won = st.show && st.show.melds;
    UI.melds.innerHTML =
      (won
        ? '<div class="rm-none rm-won">' +
            (st.show.seat === me ? 'RUMMY! You win the hand'
                                 : 'RUMMY! ' + esc(st.seats[st.show.seat].name) +
                                   ' wins the hand') + '</div>' +
          st.show.melds.map(m =>
            '<span class="rm-meld" aria-label="' + esc(meldLabel(m)) + '">' +
            m.cards.map(c => cardBtn(c, { w: short ? 26 : 32 })).join('') + '</span>').join('')
        : (lastRow && lastRow.kind === 'dead'
            ? '<div class="rm-none">The stock died a third time and nobody called RUMMY. ' +
              'Nobody won it — the cards go back in and the deal comes round again.</div>'
            : '')) +
      (st.book.length ? tallyRows(st, voting) : '');
  } else if (!cov.melds.length){
    UI.melds.innerHTML = '<div class="rm-none">Nothing arranged yet. You need ' +
      (E.isGhaxra(st) ? 'a four and two threes — ten cards, all of them working.'
                      : 'a four and a three — seven cards, all of them working.') + '</div>';
  } else {
    /* the melds you have, and then the cards doing nothing — dimmed
       and set apart. In a game where the whole hand has to work,
       "which of these is dead weight" is the only question you ever
       ask, and it is worth answering on the felt rather than making
       somebody re-sort eleven cards to find out. */
    UI.melds.innerHTML =
      '<div class="rm-none" style="padding:2px 6px;width:100%">Your arrangement — ' +
        cov.melds.length + ' of ' + E.outShape(st.mode).length +
        (cov.loose.length ? '' : ', every card working') + '</div>' +
      cov.melds.map(m =>
        '<span class="rm-meld" aria-label="' + esc(meldLabel(m)) + '">' +
        m.cards.map(c => cardBtn(c, { w: short ? 26 : 32 })).join('') + '</span>').join('') +
      (cov.loose.length
        ? '<span class="rm-meld rm-loose" aria-label="' + cov.loose.length +
          ' cards not in any meld">' +
          cov.loose.map(c => cardBtn(c, { w: short ? 24 : 28, dim:true })).join('') + '</span>'
        : '');
  }

  /* — the hint line — */
  const outNow = (mine && st.phase === 'act') ? findOut(st, me) : null;
  UI.say.innerHTML =
    done ? '' :
    voting ? voteSay(st, me, t) :
    st.phase === 'handover' ? (lastRow && lastRow.kind === 'dead' ? 'Dead hand. Dealing fresh…'
                                                                 : 'Dealing fresh…') :
    !mine ? (t === -1 ? '…' : esc(st.seats[t].name) + ' is thinking.') :
    st.phase === 'draw'
      ? '<b>Draw first</b> — the stock, or the top of the pile.' :
    outNow != null
      ? '<b>That is the whole hand.</b> Call <b>RUMMY!</b>'
      : (M.tmp.sel.length === 1
          ? 'Throw it to finish your turn.'
          : whyNotOut(cov, st.mode));

  /* — the hand — full width in both layouts; short screens simply cap
       how tall the fan may be so it stays a single row above the
       buttons rather than growing into them — */
  const shown = shownHand();
  const plan = DECK.fanPlan(shown.length, UI.wide(), short ? 78 : 200);
  let h = '';
  plan.rows.forEach(seg => {
    h += '<div class="rm-row">';
    for (let i = seg[0]; i < seg[1]; i++){
      const c = shown[i];
      /* NEVER dimmed during the draw: choosing stock-or-pile IS a
         comparison against this hand, and a hand at 45% grey is a
         hand you cannot think with. The glowing draw buttons and the
         hint line carry the "draw first" signal on their own. */
      h += cardBtn(c, {
        tap: true, w: plan.w,
        left: i === seg[0] ? 0 : Math.round(plan.step - plan.w),
        sel: M.tmp.sel.indexOf(c) >= 0
      });
    }
    h += '</div>';
  });
  UI.hand.innerHTML = h;

  /* — the buttons a turn is made of. RUMMY! is offered whenever a
     legal call exists at all — never enabled on a hand that would be
     refused, never hidden on one that would be allowed. The call
     handles its own throw (see findOut): one obvious tap, never two
     fiddly steps. — */
  const canDisc = mine && st.phase === 'act' && M.tmp.sel.length === 1 &&
                  E.check(st, { t:'disc', c: M.tmp.sel[0] }, me);
  if (voting){
    const myVote = st.seats[me].vote;
    const iAmGone = st.seats[me].gone;
    UI.acts.innerHTML = (myVote || iAmGone)
      ? '<button class="rm-act" disabled>Play again</button>' +
        '<button class="rm-act ghost" disabled>Waiting…</button>'
      : '<button class="rm-act" data-act="stay" data-sfx="own"' +
          (t === me ? '' : ' disabled') + '>Play again</button>' +
        '<button class="rm-act ghost" data-act="go" data-sfx="own"' +
          (t === me ? '' : ' disabled') + '>Leave the table</button>';
  } else if (done){
    UI.acts.innerHTML = '';
  } else {
    UI.acts.innerHTML =
      '<button class="rm-act" data-act="out" data-sfx="own"' +
        (outNow != null ? '' : ' disabled') + '>RUMMY!</button>' +
      '<button class="rm-act" data-act="disc" data-sfx="own"' + (canDisc ? '' : ' disabled') +
        '>Throw</button>' +
      '<button class="rm-act ghost" data-act="sort" data-sfx="own">' +
        (M.tmp.sorted === false ? 'Sort' : 'Sorted') + '</button>';
  }

  /* landscape scrolls the whole table — whenever it is HIS decision,
     the hand and its buttons must be above the fold. scrollTop
     arithmetic, and only when actually cut off, so a player peering
     at the top of the shelf is not yanked about. */
  if ((mine || voting) && !done){
    const rrr = UI.root.getBoundingClientRect();
    const ar = UI.acts.getBoundingClientRect();
    const cut = ar.bottom - rrr.bottom;
    if (cut > 1) UI.root.scrollTop += cut + 4;
  }

  voteClock(st, me);
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

/* ── the vote: who is in, who is deciding, and — online — the clock.

   OFFLINE the machines always stay and the table waits for YOU as
   long as you like: a countdown against nobody would only rush a man
   playing alone. ONLINE every phone enforces the 20-second answer on
   ITSELF — when the clock runs out on YOUR undecided vote, your own
   phone sends the 'go'. Silence counts as leaving, exactly like the
   undo-objection window, and because the timeout arrives as that
   seat's own move on the wire, every phone agrees on it without any
   second clock. (A phone that has died entirely answers nothing; the
   room's own disconnect handling stops that table honestly — the
   relay has no way to vote on a player's behalf, and inventing one
   host-side would be a desync machine.) ── */
const VOTE_S = 20;
function voteSay(st, me, t){
  if (t === me && !st.seats[me].vote && !st.seats[me].gone){
    const base = '<b>Play again?</b> Whoever does not is out.';
    if (M.net && M.tmp.voteUntil){
      const left = Math.max(0, Math.ceil((M.tmp.voteUntil - Date.now()) / 1000));
      return base + ' Silence counts as leaving — <b>' + left + 's</b>.';
    }
    return base;
  }
  if (t >= 0) return esc(st.seats[t].name) + ' is deciding whether to play again…';
  return 'Settling the table…';
}
function voteClock(st, me){
  const myGo = st.phase === 'vote' && E.turn(st) === me &&
               !st.seats[me].vote && !st.seats[me].gone;
  if (!myGo || !M.net){
    if (M.voteTimer){ clearInterval(M.voteTimer); M.voteTimer = 0; }
    M.tmp.voteUntil = 0;
    return;
  }
  if (M.voteTimer) return;                       /* already ticking */
  M.tmp.voteUntil = Date.now() + VOTE_S * 1000;
  const m = M;
  M.voteTimer = setInterval(() => {
    if (M !== m || !M || M.dead){ clearInterval(m.voteTimer); return; }
    const st2 = M.st;
    if (st2.phase !== 'vote' || E.turn(st2) !== mySeat()){
      clearInterval(M.voteTimer); M.voteTimer = 0; M.tmp.voteUntil = 0;
      return;
    }
    if (Date.now() >= M.tmp.voteUntil){
      clearInterval(M.voteTimer); M.voteTimer = 0;
      tryMove({ t:'go' });                       /* my own silence, my own move */
      return;
    }
    if (UI && UI.say) UI.say.innerHTML = voteSay(st2, mySeat(), E.turn(st2));
  }, 250);
}

/* the leaver's own next screen: told plainly the table carried on */
function leftTable(){
  const ctx = M && M.ctx;
  if (!ctx) return;
  stopThinking();
  stopVote();
  M.finished = true;
  const net = M.net;
  P.ui.result(ctx, {
    tone:'draw',
    head:'You left the table',
    why:'The table carries on without you. The tally stays with the ones still in it.',
    quip:'Somewhere behind you, somebody is calling RUMMY on your cards.',
    buttons: net
      ? [{ label:'Back to the rooms', icon:'back', cls:'primary',
           go: () => { const n = net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
      : [{ label:'New table', icon:'refresh', cls:'primary',
           go: () => { leave(); setupSheet(); } },
         { label:'Back to the shelf', icon:'back', cls:'ghost',
           go: () => { leave(); P.hub(); } }]
  });
  if (!net){ saveSlot(null); }
}

function paintTurn(t, done){
  const st = M.st;
  if (done){ P.ui.setTurn(M.ctx, { cls:'', who:done.head, note:'' }); return; }
  const who = st.phase === 'vote'
              ? (E.turn(st) === mySeat() && !st.seats[mySeat()].vote ? 'Play again?' : 'The vote…')
            : st.phase === 'handover' ? 'Next hand…'
            : t === -1 ? 'The table…'
            : isLocal(t) ? 'Your turn'
            : st.seats[t].name + ' is thinking…';
  P.ui.setTurn(M.ctx, { cls: (t >= 0 && isLocal(t)) ? 'w' : '', who, note: E.note(st) });
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
  }, FAST ? 1 : (st.phase === 'vote' ? 700 : 520 + ((Date.now() % 5) * 90)));
}

/* ═══════════════════════════════════════════════════════════════════
   THE END — which is only ever the table breaking up. A WON HAND is
   not an end: it is the vote, painted by render() on the live felt.
   ═══════════════════════════════════════════════════════════════════ */
function finish(done){
  if (M.finished) return;
  M.finished = true;
  stopThinking();
  stopVote();
  cueIn(260, () => cue(done.tone === 'win' ? 'game.win'
                     : done.tone === 'lose' ? 'game.lose' : 'ui.toast', { gain: 1 }, true));
  saveSlot(null);
  P.ui.result(M.ctx, {
    tone: done.tone || 'draw',
    head: done.head, why: done.why, quip: done.quip,
    buttons: M.net
      ? [{ label:'Back to the rooms', icon:'back', cls:'primary',
           go: () => { const n = M.net; leave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
      : [
          { label:'New table', icon:'refresh', cls:'primary',
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
  M.ctx.badge.textContent = E.shapeName(M.st.mode) +
    (E.isGhaxra(M.st) ? ' · Għaxra' : '');
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
  M.ctx.btn('rm-rules').onclick = () => setRules(!rulesOpen);
  paintRules();   /* remembered open stays open across deals and reloads */
  const nb = M.ctx.btn('rm-new');
  if (nb) nb.onclick = () => {
    P.ui.confirm(M.ctx, {
      head:'Throw this table in?',
      why:'The cards go back in the box, the tally goes with them, and you deal a fresh table.',
      yes:'Deal fresh', no:'No, carry on',
      go: () => newGame(M.opts)
    });
  };
}

function leave(){
  stopThinking();
  stopVote();
  if (M){
    autosave();
    persistNow();
    const net = M.net;
    M.dead = true;
    if (net && net.onGone){ try { net.onGone(); } catch(e){} }
  }
  M = null; UI = null;
}

/* ── the rules card — ONE game, told once, with only the hand size
   changing the words. In his language: match your hand, call RUMMY,
   you have won. No points anywhere. ─────────────────────────────── */
function rulesFor(mode){
  const ten = E.modeOf(mode) === 'ghaxra';
  const S = E.shapeName(mode);                     /* 4+3 or 4+3+3 */
  const melds = ten ? 'one meld of four and two of three'
                    : 'one meld of four and one of three';
  return [
    '<b>' + (ten ? 'Ten' : 'Seven') + ' cards each</b>' +
      (ten ? ' — GĦAXRA, the ten-card table.' : '.'),
    '<b>Draw one</b> — off the stock, or the top card of the pile — then <b>throw ' +
      'one</b>. Never the card you have just taken off the pile.',
    '<b>Nothing goes on the table.</b> You hold everything and nobody sees your hand.',
    'A meld is three or four: a <b>set</b> (same rank, suits all different) or a ' +
      '<b>run</b> (same suit, ranks in a row, ace low — A-2-3, never Q-K-A).',
    'The moment your whole hand is melds — <b>' + S + '</b>, ' + melds + ' — you call ' +
      '<b>RUMMY</b>, show the hand, and <b>you have won</b>.',
    '<b>No points.</b> Nothing is counted, nothing is doubled, nothing is settled. ' +
      'The call is the win. (Counting to a total is gin rummy — the other tile.)',
    'With more than one pack, two identical cards never sit in the same meld: a set ' +
      'wants different suits, a run wants different ranks.',
    'Jokers (if the table plays them, two per pack): wild inside a meld, always ' +
      'outnumbered by real cards.',
    'When the stock runs dry the pile is shuffled back — twice. The third time the ' +
      'hand is <b>dead</b>: nobody won it, and the same table is dealt fresh.',
    'After a win everybody says <b>play again</b> — whoever does not, leaves the ' +
      'table. The table keeps the tally: hands won, and streaks.',
    ten
      ? 'Packs by table: one to 3 players, two to 8, three to 12. <b>No jokers pays ' +
        'earlier</b>: two packs only to 6, three to 10, four beyond — a full 4+3+3 ' +
        'with no wilds eats the stock. Measured, not guessed.'
      : 'Packs by table: one to 5 players (4 without jokers), two to 10 (9), three ' +
        'to 12. The minimum is not optional — measured, not guessed.'
  ];
}
const modeName = mode => (E.modeOf(mode) === 'ghaxra' ? 'GĦAXRA · ten cards' : 'RUMMY · seven cards');

/* ── the rules panel: hide and slide, never a wall. State is a UI
   preference in its own key, so it survives games and reloads. The
   table tally rides at the top — the scoreboard, one tap away
   mid-hand, without a second overlay. ───────────────────────────── */
/* THE STANDING RULE: nothing may ever cover the player's hand. Portrait
   leaves the 54% CSS cap miles clear of it, but a landscape phone does
   not — measured, the open panel reached ~28px into the top card row.
   So the cap is taken off the hand's actual position instead of trusting
   a percentage: the panel may grow down to just above the hand and no
   further, and its body scrolls inside whatever that leaves. */
function clampRules(){
  if (!UI || !UI.rules || !UI.hand) return;
  try {
    const hr = UI.hand.getBoundingClientRect();
    const rr = UI.root.getBoundingClientRect();
    if (hr.height > 0 && rr.height > 0){
      const room = Math.floor(hr.top - rr.top - 6);
      UI.rules.style.maxHeight =
        Math.min(Math.max(80, room), Math.floor(rr.height * 0.54)) + 'px';
    }
  } catch(e){}
}
window.addEventListener('resize', () => { if (UI && rulesOpen) clampRules(); });

function paintRules(){
  if (!UI || !UI.rules) return;
  clampRules();
  const mode = M ? M.st.mode : 'classic';
  UI.rules.querySelector('#rm-rules-t').textContent =
    modeName(mode) + ' — the rules';
  UI.rules.querySelector('#rm-rules-b').innerHTML =
    (M && M.st.book.length
      ? '<div class="rm-tallyh">This table — hands won</div>' + tallyRows(M.st, false)
      : '') +
    '<ul>' + rulesFor(mode).map(r => '<li>' + r + '</li>').join('') + '</ul>';
  UI.rules.classList.toggle('open', rulesOpen);
  UI.rules.setAttribute('aria-hidden', rulesOpen ? 'false' : 'true');
  const rb = M && M.ctx && M.ctx.btn && M.ctx.btn('rm-rules');
  if (rb) rb.setAttribute('aria-expanded', rulesOpen ? 'true' : 'false');
}
function setRules(open){
  rulesOpen = !!open;
  try { localStorage.setItem(UIKEY + '.rules', rulesOpen ? '1' : '0'); } catch(e){}
  paintRules();
}

/* ═══════════════════════════════════════════════════════════════════
   THE SETUP SHEET — hand size, seats, the enforced pack rule, jokers,
   the machine. No pass-the-phone (rummy is a hidden hand and eleven
   people cannot look away), no match-length knob (there are no points
   to play up to — the table simply plays until it breaks up), and the
   rules FOLDED SHUT by default: creating a game is short, and the
   rules are one tap away.
   ═══════════════════════════════════════════════════════════════════ */
function setupSheet(){
  injectCSS();
  P.show();
  stopThinking(); stopVote(); M = null; UI = null;
  const el = P.ui.screenEl();
  const p = pref();
  let seats  = Math.max(2, Math.min(12, p.seats || 4));
  let decks  = p.decks || 0;
  let jokers = p.jokers !== false;
  let lvl    = p.lvl || 2;
  let mode   = E.modeOf(p.mode);

  function paint(){
    const rule = E.deckRule(seats, mode, jokers);
    if (decks < rule.min || decks > rule.max) decks = rule.min;
    /* the pack choices are whatever the rule leaves — usually the
       minimum and one more */
    const deckOpts = [];
    for (let d = rule.min; d <= rule.max; d++) deckOpts.push(d);
    const MPX = window.KARTI_MP;
    /* Can the shared lobby actually open a rummy room on this build?
       Feature-detected, not assumed. */
    let onlineReady = false;
    try { onlineReady = !!(MPX && MPX.gameLobby && MPX.gameLobby('rummy').id === 'rummy'); } catch(e){}

    el.innerHTML =
      '<div class="tbar">' +
        '<button class="iconbtn" id="rm-back" aria-label="Back">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>RUMMY</h2>' +
      '</div>' +
      '<div class="scroll">' +
        '<p class="blurb">Draw one, throw one, and the moment your whole hand is melds ' +
        'you call <b>RUMMY</b> and you have won. Nothing to count — the shout takes it.</p>' +

        '<div class="tiny pt-lbl">How many cards in the hand</div>' +
        '<div class="pt-opts two" id="rm-mode">' +
          '<button class="pt-opt' + (mode === 'classic' ? ' on' : '') + '" data-m="classic">' +
            ico('cards') + '<b>Seven — 4+3</b>' +
            '<i>A four and a three. The quick table.</i></button>' +
          '<button class="pt-opt' + (mode === 'ghaxra' ? ' on' : '') + '" data-m="ghaxra">' +
            ico('trophy') + '<b>Għaxra · ten — 4+3+3</b>' +
            '<i>A four and two threes. The long hunt.</i></button>' +
        '</div>' +

        '<div class="tiny pt-lbl">How many at the table</div>' +
        '<div class="rm-step">' +
          '<button class="rm-rnd" id="rm-s-dn"' + (seats <= 2 ? ' disabled' : '') + ' aria-label="Fewer players">&minus;</button>' +
          '<span class="v">' + seats + '<i>players</i></span>' +
          '<button class="rm-rnd" id="rm-s-up"' + (seats >= 12 ? ' disabled' : '') + ' aria-label="More players">+</button>' +
        '</div>' +

        '<div class="tiny pt-lbl">How many packs</div>' +
        '<div class="pt-opts' + (deckOpts.length > 1 ? ' two' : '') + '" id="rm-decks">' +
          deckOpts.map(d =>
            '<button class="pt-opt' + (d === decks ? ' on' : '') + '" data-d="' + d + '">' +
              ico('cards') + '<b>' + d + (d === 1 ? ' pack' : ' packs') + '</b>' +
              '<i>' + (d === rule.min
                ? (deckOpts.length > 1 ? 'The table’s minimum.'
                                       : 'The minimum, and as many as this table takes.')
                : 'Optional — a looser game.') + '</i>' +
            '</button>').join('') +
        '</div>' +
        '<p class="rm-why">' + esc(rule.why) + '</p>' +

        '<div class="tiny pt-lbl">Jokers</div>' +
        '<div class="pt-opts two" id="rm-jok">' +
          '<button class="pt-opt' + (jokers ? ' on' : '') + '" data-j="1">' + ico('cards') +
            '<b>Two per pack</b><i>Wild inside a meld, never a majority.</i></button>' +
          '<button class="pt-opt' + (!jokers ? ' on' : '') + '" data-j="0">' + ico('lock') +
            '<b>None</b><i>The purist’s table.' +
            (mode === 'ghaxra' && seats >= 7
              ? ' At this size it costs a pack — a full 4+3+3 is much harder without them.'
              : '') +
            '</i></button>' +
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
          (ST.save ? '<button class="btn ghost" id="rm-res">Carry on the saved table</button>' : '') +
          (window.KARTI_MP
            ? (onlineReady
                ? '<button class="btn ghost" id="rm-online">Open an online RUMMY room</button>'
                : '<p class="pt-warn" style="margin:0">Online rooms for RUMMY need the lobby and ' +
                  'the relay to learn its name first — the wiring on this build is ready and ' +
                  'waiting for those two lines.</p>')
            : '') +
        '</div>' +

        /* ── the rules, FOLDED. Game creation used to end in an eleven-
           line wall printed every single time; now it is a header that
           slides the list open on demand, remembers itself in the
           UI-only key, and swaps its text when the hand size above
           changes. Closed by default: the sheet's job is dealing. ── */
        '<div class="kb-rules" style="margin:16px 2px 20px;padding:2px 14px;border-radius:14px;' +
          'background:rgba(255,255,255,.04);border:1px solid var(--line)">' +
          '<button type="button" class="rm-fold-h" id="rm-srules-h" aria-controls="rm-srules-b"' +
            ' aria-expanded="' + (setupOpen ? 'true' : 'false') + '">' +
            '<span><b>The rules, as this table plays them</b>' +
            '<i id="rm-srules-i">' + esc(modeName(mode)) + ' — ' +
              (setupOpen ? 'tap to fold them away.' : 'tap to read them.') + '</i></span>' +
            '<em aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></em>' +
          '</button>' +
          '<div class="rm-fold-b' + (setupOpen ? ' open' : '') + '" id="rm-srules-b">' +
            '<div class="rm-fold-i"><ul style="margin:6px 0 12px;padding:0">' +
              rulesFor(mode).map(r => '<li style="font-size:12px;line-height:1.65;' +
                'color:var(--dim);margin:0 0 6px 16px">' + r + '</li>').join('') +
            '</ul></div></div>' +
        '</div>' +
      '</div>';

    el.querySelector('#rm-back').onclick = () => P.hub();
    /* changing the hand size or the jokers can change what the pack
       rule allows, so the chosen count is dropped back to "let the
       rule decide" rather than left pointing at a number that is no
       longer on offer */
    el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      mode = E.modeOf(b.dataset.m); decks = 0; paint(); });
    el.querySelector('#rm-s-dn').onclick = () => { if (seats > 2){ seats--; decks = 0; paint(); } };
    el.querySelector('#rm-s-up').onclick = () => { if (seats < 12){ seats++; decks = 0; paint(); } };
    el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { decks = +b.dataset.d; paint(); });
    el.querySelectorAll('[data-j]').forEach(b => b.onclick = () => {
      jokers = !!+b.dataset.j; decks = 0; paint(); });
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { lvl = +b.dataset.lvl; paint(); });
    el.querySelector('#rm-go').onclick = () => {
      pref({ seats, decks, jokers, lvl, mode });
      newGame({ seats, decks, jokers, humans: 1, lvl, mode });
    };
    const rs = el.querySelector('#rm-res');
    if (rs) rs.onclick = () => { if (ST.save) newGame(null, ST.save); };
    const on = el.querySelector('#rm-online');
    if (on) on.onclick = () => {
      pref({ seats, decks, jokers, lvl, mode });
      openOnline();
    };
    /* the fold toggles WITHOUT repainting, so the slide actually
       slides; a mode change above repaints and rulesFor(mode) brings
       the right text into whatever state the fold is in */
    const sh = el.querySelector('#rm-srules-h');
    if (sh) sh.onclick = () => {
      setSetupOpen(!setupOpen);
      sh.setAttribute('aria-expanded', setupOpen ? 'true' : 'false');
      const b = el.querySelector('#rm-srules-b');
      if (b) b.classList.toggle('open', setupOpen);
      const hint = el.querySelector('#rm-srules-i');
      if (hint) hint.textContent = modeName(mode) + ' — ' +
        (setupOpen ? 'tap to fold them away.' : 'tap to read them.');
      cue(setupOpen ? 'ui.sheet' : 'ui.back', { gain: 0.8 }, true);
    };
  }
  paint();
}

/* ═══════════════════════════════════════════════════════════════════
   ONLINE — the two halves js/mp.js reads: KARTI_RUMMY.lobby before a
   card exists, KARTI_PARTY.online.rummy to carry a move.

   ONE HOUSE SETUP ONLINE. Every phone must deal the identical game
   from the shared seed, and the roster carries no settings — so an
   online table is always: the mandatory pack count for its size and
   jokers in. The hand size arrives as the room's variant ('classic'
   = seven, 'ghaxra' = ten), which is how klabb picks briscola over
   bixkla — every phone is told the same word at the same moment.

   The play-again vote rides the same wire as every other move, one
   seat at a time in seat order, each phone sending only its OWN
   seat's answer — see voteClock() for how silence becomes a 'go'
   without a second source of truth.
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
  const mode = E.modeOf(cfg.opts && cfg.opts.mode);
  const opts = { seats: n, decks: 0, jokers: true, humans: n, lvl, mode };
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
                           : /over/.test(e) ? 'a move after the table had broken up'
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
  stopVote();
  M.finished = true;
  P.ui.setNet(ctx, '', '');
  P.ui.result(ctx, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? 'No deal' : 'Cut off',
    why: why || 'The table stopped.',
    quip: 'Nothing was counted, because nothing ever is. Nobody loses a hand over a dropped connection.',
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
  /* the agreement line for a bug report: hands, votes, book, hashed */
  check(){
    if (!M) return '';
    const st = M.st;
    const s = ['rummy', M.seed, M.log.length, E.turn(st), st.phase,
               st.seats.map(x => x.hand.length + (x.gone ? 'g' : '') +
                                 (x.vote ? x.vote[0] : '')).join('.'),
               st.book.map(r => r.kind[0] + r.winner).join(','),
               st.stock.length, st.disc.length].join('|');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  },
  /* NEVER the whole state over the wire. Other hands become counts,
     the stock becomes a count; the pile is face up and stays. */
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
    '<p>Draw one, throw one, hold everything. The moment your whole hand is melds — ' +
    'one four and one three at seven cards, one four and two threes at ten — you call ' +
    '<b>RUMMY</b> and you have won. No points; the call is the win.</p>' +
    '<p>2 to 12 players. The pack count follows the table, and an online room always ' +
    'plays the house setup: the mandatory packs, jokers in. After every won hand the ' +
    'table votes to play again — whoever does not, leaves — and the table keeps the ' +
    'tally of hands won and streaks.</p>' +
    '<p>The room’s variant picks the hand: <b>seven cards (4+3)</b> or <b>GĦAXRA — ' +
    'ten (4+3+3)</b>.</p>',
  blurb:'Draw one, throw one, and the first whole hand of melds calls RUMMY and wins. ' +
        'Up to twelve, seven or ten cards a head.',
  start(seatsList, opts){
    const list = (seatsList || []).filter(Boolean);
    const n = Math.max(2, Math.min(12, list.length || 4));
    const lvl = (list.map(s => s && s.level).find(v => v)) || 2;
    return newGame({ seats: n, decks: 0, jokers: true, humans: 1, lvl,
                     mode: (opts && opts.mode) || 'classic',
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
    return 'Match your whole hand — 4+3 at seven cards, 4+3+3 at ten — call RUMMY ' +
           'and win. No points, up to twelve players.' +
           (ST.save ? ' There is a table of this half-played.' : '');
  },
  open: () => setupSheet(),
  /* the fields js/mp.js's gameLobby() reads OFF THE TILE when the game
     has no LOBBY_GLOBAL entry yet — seats, levels, rules, start. */
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
    blurb:'Match the whole hand, call RUMMY, win. Twelve can play.' });
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
      start: opts => { newGame(opts || { seats:4, decks:0, jokers:true, humans:1, lvl:2 }); return true; },
      startSeed: (opts, seed) => { newGame(null, { v:SAVE_V, gid:'rummy', opts, seed, log:[] }); return true; },
      fast: on => { FAST = !!on; },
      doMove, rollbackTo, undoPoint, snapshot,
      render, setup: setupSheet,
      tally: () => (M ? E.tally(M.st) : null),
      sel: () => (M ? (M.tmp.sel || []) : []),
      store: () => ST
    };
  }
} catch(e){}

})();
