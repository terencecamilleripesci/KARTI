/* ═══════════════════════════════════════════════════════════════════
   KARTI — poker-ui.js
   TEXAS HOLD'EM — the table. The rules live in js/poker.js; this file
   is the screen, the runner and the wire, and it follows
   js/rummy-ui.js's shape deliberately: a match is (opts, seed, log),
   every move goes through one doMove() gate, and rollback is cutting
   the log and replaying it.

   WHAT THIS FILE IS
     · the shelf tile and the setup sheet (seats, stack, blinds, the
       machine), with the rules FOLDED shut so starting a game is short
     · the felt: the rail of other seats, the five in the middle, the
       pot, your own two cards, and the three buttons a turn is made
       of — FOLD, CHECK/CALL and a raise control a thumb can drive
     · the showdown, the side pots paid out one by one, and the table
       tally read off st.book
     · the runner: log, seed, autosave (karti_poker_v1), undo offline
     · the poker kit shelf — felts, card backs, table trim

   TWO MODES
     FREE (ĦIELES)   table chips and nothing else. They exist for the
                     life of the table and touch nobody's wallet. This
                     is the whole game and it ships on its own.
     COINS           the same rules over the player's real KARTI coins.
                     Written, tested, and HIDDEN behind
                     COINS_MODE_READY — read the comment on that
                     constant before you so much as think about
                     flipping it.

   HOUSE RULES OBEYED
     · borrows #scr-party through KARTI_PARTY, injects its own CSS
       once, never touches css/ or the tab bar's ancestors;
     · draws card faces through KARTI_KLABB.deck, so the pack on this
       felt is the pack on every other felt;
     · no unicode suits, no emoji; sounds only through KARTI_SFX ids
       that already exist;
     · every player-visible string is a T(en, mt) pair at its call
       site — js/lang.js's rule, and a missing side falls back to the
       other language, never to a bare key;
     · the back arrow goes BACK. It never asks "are you sure": the
       table is autosaved on every move and the setup sheet offers it
       again at the top.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const KLB = window.KARTI_KLABB;
const R = window.KARTI_POKER;
if (!K || !P || !KLB || !R || !R.engine) return;

const E = R.engine;
const DECK = KLB.deck;
const esc = K.esc || (s => String(s == null ? '' : s));
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');
const clone = o => JSON.parse(JSON.stringify(o));

/* ── the one language switch (js/lang.js) ────────────────────────── */
const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;

/* ═══════════════════════════════════════════════════════════════════
   COINS_MODE_READY — THE FLAG. READ THIS BEFORE CHANGING IT.

   false, and it must stay false until one specific piece of work is
   done, which is NOT in this file.

   WHY. The relay broadcasts ONE shared seed to every seat at a table.
   Every client derives the whole deal from that seed — that is how
   skarta and rummy agree on a shuffle without sending a card. In
   poker it means every phone at the table can compute EVERY
   opponent's hole cards. Offline against the machine that is
   harmless. With money on it, it is not a game, it is a robbery with
   a progress bar.

   WHAT UNBLOCKS IT. js/poker.js's deal is already injectable — see
   DEALERS there. DEALERS.private takes hole cards delivered PER SEAT,
   and nothing else in the engine changes. What is missing is on the
   relay side and belongs to another workstream:
     1. deal hole cards to each seat privately, not from a shared seed;
     2. deliver the five community cards street by street, so a client
        cannot read the river off its own state before it is turned;
     3. a SHOWDOWN REVEAL message, because a client cannot score a
        hand it was never sent (settle() scores such a seat as -1 on
        purpose, so this fails loudly rather than quietly).

   Until all three exist, flipping this constant ships a cheat. The
   coins path below is written and reachable ONLY through this flag so
   it does not rot in the meantime — it is not dead code, it is code
   with the door locked.
   ═══════════════════════════════════════════════════════════════════ */
const COINS_MODE_READY = false;

/* the wallet, touched from exactly two places and only when the flag
   above is on. KARTI.S.coins is the same balance the card shop spends. */
function coinBalance(){
  try { return (K.S && K.S.coins | 0) || 0; } catch(e){ return 0; }
}
function coinMove(n){
  if (!COINS_MODE_READY || !n) return false;
  try {
    K.S.coins = Math.max(0, (K.S.coins | 0) + n);
    if (K.save) K.save();
    return true;
  } catch(e){ return false; }
}

/* ── our corner of localStorage ──────────────────────────────────── */
const STORE = 'karti_poker_v1';
const SAVE_V = 1;
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

/* ── UI-only preferences in their OWN key (il-kiri's dock rule): a UI
   preference is not the game, so binning a table must never forget how
   you keep the rules folded. ─────────────────────────────────────── */
const UIKEY = 'karti_poker_ui_v1';
let rulesOpen = false;
let setupOpen = false;               /* the setup sheet's rules — CLOSED */
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
function levelWords(k){
  /* the club's English names, given a Maltese voice. The NAME is the
     machine's name in both languages; only the note is translated. */
  if (k === 1) return { n: T('Gentle', 'Kalm'),    i: T('Will miss things.', 'Jitlef affarijiet.') };
  if (k === 3) return { n: T('Ruthless', 'Bla ħniena'), i: T('Plays to win.', 'Jilgħab biex jirbaħ.') };
  return { n: T('Normal', 'Normali'), i: T('Plays properly.', 'Jilgħab sew.') };
}

/* ═══════════════════════════════════════════════════════════════════
   NAMING A HAND — the engine returns a packed integer and never a
   word, because engine state is shared and audited (js/lang.js rule
   5). The words live here, at the point of display, in both languages.
   FLOP, TURN and RIVER are NAMES and stay themselves in both.
   ═══════════════════════════════════════════════════════════════════ */
function handName(v){
  const c = E.catOf(v);
  const k = E.kicksOf(v);
  switch (c){
    case E.CAT.SFLUSH:
      return k[0] === 14 ? T('Royal flush', 'Sekwenza rjali')
                         : T('Straight flush', 'Sekwenza tal-istess kulur');
    case E.CAT.QUADS:    return T('Four of a kind', 'Erbgħa l-istess');
    case E.CAT.BOAT:     return T('Full house', 'Tlieta u par');
    case E.CAT.FLUSH:    return T('Flush', 'Kulur');
    case E.CAT.STRAIGHT: return T('Straight', 'Sekwenza');
    case E.CAT.TRIPS:    return T('Three of a kind', 'Tlieta l-istess');
    case E.CAT.TWOPAIR:  return T('Two pair', 'Żewġ pari');
    case E.CAT.PAIR:     return T('Pair', 'Par');
    default:             return T('High card', 'L-ogħla karta');
  }
}
const STREET_NAME = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];

/* ═══════════════════════════════════════════════════════════════════
   DRAWING — klabb's pack, our chips, and the shelf mark
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
/* the tile mark: two cards face down and a chip in front of them —
   the silhouette of a bet, which is what this game is. Geometry only,
   one weight, told apart by shape, exactly like the klabb marks. */
const TILE_MARK =
  '<g transform="rotate(-13 8 12)">' + cardFrame(2.6, 3.2, 8.4, 12.6, 1) + '</g>' +
  '<g transform="rotate(11 15 11)">' + cardFrame(11.4, 2.4, 8.4, 12.6, 1) + '</g>' +
  '<path fill-rule="evenodd" d="M12 15.1a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 1.6a2.9 2.9 0 1 1 0 5.8 2.9 2.9 0 0 1 0-5.8z"/>' +
  '<path d="M11.2 14.9h1.6v1.9h-1.6zM11.2 22.4h1.6v1.9h-1.6z' +
    'M7.1 18.6h1.9v1.6H7.1zM15 18.6h1.9v1.6H15z"/>';

let defsDone = false;
function injectDefs(){
  if (defsDone || document.getElementById('pk-defs')) { defsDone = true; return; }
  defsDone = true;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', 'pk-defs');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  svg.innerHTML = '<symbol id="pk-t-poker" viewBox="0 0 24 24">' + TILE_MARK + '</symbol>';
  document.body.appendChild(svg);
}

/* ONE CHIP, drawn — the dealer button, a blind marker and the little
   disc beside a seat's bet all come out of here. Geometry, one colour
   from CSS, told apart by the letter on it. */
function chip(txt, cls){
  return '<span class="pk-chip' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' +
         '<svg viewBox="0 0 24 24" focusable="false">' +
         '<circle class="pk-chip-o" cx="12" cy="12" r="11"/>' +
         '<circle class="pk-chip-i" cx="12" cy="12" r="7.4"/>' +
         '<path class="pk-chip-e" d="M12 .6v3.4M12 20v3.4M.6 12h3.4M20 12h3.4' +
           'M3.9 3.9l2.4 2.4M17.7 17.7l2.4 2.4M20.1 3.9l-2.4 2.4M6.3 17.7l-2.4 2.4"/>' +
         '</svg><i>' + esc(txt || '') + '</i></span>';
}

/* one card of OURS. Face drawing is klabb's; the button, the data and
   the highlight are ours. */
function cardBtn(c, o){
  o = o || {};
  const w = o.w || 52;
  const face = o.face !== false && c >= 0;
  const body = !face ? DECK.cardBack() : DECK.cardFace(c);
  const label = !face ? T('Face-down card', 'Karta bil-wiċċ għal isfel') : DECK.nameOf(c);
  return '<span class="kb-card pk-c' + (o.lit ? ' pk-lit' : '') + (o.dim ? ' pk-dim' : '') +
    (face ? '' : ' down') + (o.cls ? ' ' + o.cls : '') + '"' +
    ' data-cid="' + c + '"' +
    ' style="width:' + w + 'px;height:' + Math.round(w * 1.4) + 'px' +
      (o.left != null ? ';margin-left:' + o.left + 'px' : '') + '"' +
    ' aria-hidden="true">' + body + '</span>';
}
/* an empty community slot — the felt reads as laid on purpose even
   before a card lands on it */
function slot(w){
  return '<span class="pk-slot" style="width:' + w + 'px;height:' +
         Math.round(w * 1.4) + 'px" aria-hidden="true"></span>';
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

/* THE ONE PLACE ANYTHING IN POKER TOUCHES Math.random: a brand-new
   local match choosing its seed, which is skarta's pattern. From here
   on the seed is data, the engine is pure, and every phone replaying
   the same log lands on the same table. */
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
    tmp: {},                       /* raiseTo: the slider's value      */
    timer: 0, dead: false, finished: false,
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
function stopThinking(){
  if (M && M.timer){ clearTimeout(M.timer); M.timer = 0; }
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
  M.log = M.log.slice(0, n);
  M.st = buildState(M.opts, M.seed, M.log);
  applyMeta();
  M.tmp = {};
  M.recorded = Math.min(M.recorded, M.st.book.length);
  autosave();
  fire(stateSubs, { reason:'rollback', index:n });
  return n;
}
/* offline undo point: back to the start of THIS player's last decision.
   It never crosses back over a settled hand — undoing a pot that has
   already been paid out is not a thing this table does. */
function undoPoint(){
  if (!M) return -1;
  for (let i = M.log.length - 1; i >= 0; i--){
    const mv = M.log[i];
    if (mv.t === 'next' || mv.t === 'street') return -1;
    if (isLocal(mv.seat)) return i;
  }
  return -1;
}

function snapshot(){
  if (!M) return null;
  return { v:SAVE_V, gid:'poker', opts:clone(M.opts), seed:M.seed, log:clone(M.log) };
}
function autosave(){
  if (!M || M.net) return;
  if (E.over(M.st)){ saveSlot(null); return; }
  saveSlot(snapshot());
}

/* ═══════════════════════════════════════════════════════════════════
   THE SOUND OF A MOVE — one subscriber; rollback replays are silent by
   construction because they never pass through doMove. The record book
   (W/L, offline only) hangs here too: a TABLE is the result, not a
   hand, so it is written when the table breaks — see finish().
   ═══════════════════════════════════════════════════════════════════ */
moveSubs.push(ev => {
  if (!M || M.dead) return;
  const mv = ev.move, mine = ev.seat >= 0 && isLocal(ev.seat);
  const st = M.st;
  switch (mv.t){
    case 'fold':  cue('card.throw', { gain: mine ? 0.8 : 0.55 }); return;
    case 'check': cue('ui.tap',     { gain: mine ? 0.85 : 0.5 }); return;
    case 'call':  cue('coin.tick',  { gain: mine ? 0.9 : 0.6 }); return;
    case 'bet': {
      const s = st.seats[ev.seat];
      /* an all-in is the loud one, and it is allowed to be */
      if (s && s.allin) cue('pack.charge', { gain: mine ? 1 : 0.8 }, true);
      else { cue('chain.add', { gain: mine ? 0.9 : 0.65 }, true);
             cueIn(90, () => cue('coin.tick', { gain: 0.6 }, true)); }
      return;
    }
    case 'street':
      if (st.phase === 'handover'){
        /* the pot going across the felt, and the cards turning over */
        if (st.show && st.show.showdown) cue('card.open', { gain: 0.9 }, true);
        cueIn(320, () => cue('money.pay', { gain: 0.95 }, true));
      } else {
        cue('card.deal', { gain: 0.75 }, true);
        const S = window.KARTI_SFX;
        if (S && S.run && st.street === 1) cueIn(70, () => S.run('card.deal', 2, 110, { gain: 0.5 }));
      }
      return;
    case 'next':
      cue('card.shuffle', { gain: 0.8 }, true);
      cueIn(240, () => { const S = window.KARTI_SFX;
        if (S && S.run) S.run('card.deal', Math.min(M ? M.st.n * 2 : 6, 8), 85, { gain: 0.5 }); });
      return;
  }
});

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party. The kb-* face
   rules are repeated here from js/klabb.js's runtime sheet because
   that sheet only exists once a klabb game has been OPENED, and a
   poker felt must not depend on somebody having played Briscola
   first. Identical rules twice is harmless; a pack styled by luck is
   not.

   THE IDENTITY: kazin green, not rummy's navy and not skarta's black.
   A ring of light over the middle of the cloth, a gold rail round the
   edge, and chips — the three things that make a table read as poker
   at a glance on a phone.
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS(){
  injectDefs();
  if (document.getElementById('pk-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'pk-runtime-css';
  st.textContent =
    '#scr-party{--pk-felt:#155238;--pk-felt2:#08281B;--pk-gold:var(--gold,#FFC542)}' +

    /* ── the card faces (klabb's rules, restated — see header) ── */
    '#scr-party .kb-card{position:relative;flex:0 0 auto;padding:0;border:0;background:none;' +
      'border-radius:7px;line-height:0;display:block;' +
      'box-shadow:0 2px 4px rgba(0,0,0,.5),0 6px 14px rgba(0,0,0,.35);' +
      'transition:margin-top .13s var(--ease),box-shadow .13s var(--ease)}' +
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
    '#scr-party .pk-c.pk-lit{box-shadow:0 0 0 2.5px var(--pk-gold),0 6px 14px rgba(0,0,0,.5)}' +
    '#scr-party .pk-c.pk-dim{opacity:.42}' +
    '#scr-party .pk-c.pk-dim .kb-svg{filter:grayscale(.85)}' +
    '#scr-party .pk-slot{display:block;flex:0 0 auto;border-radius:7px;' +
      'border:1.5px dashed rgba(255,255,255,.17);background:rgba(0,0,0,.14)}' +

    /* ── one chip ── */
    '#scr-party .pk-chip{position:relative;display:inline-grid;place-items:center;' +
      'width:19px;height:19px;flex:0 0 auto;vertical-align:middle}' +
    '#scr-party .pk-chip svg{grid-area:1/1;width:100%;height:100%;display:block}' +
    '#scr-party .pk-chip i{grid-area:1/1;font:900 8px/1 var(--disp);font-style:normal;' +
      'color:#241800;letter-spacing:0}' +
    '#scr-party .pk-chip-o{fill:#EFE3C8;stroke:rgba(0,0,0,.45);stroke-width:1}' +
    '#scr-party .pk-chip-i{fill:#FFF8E6;stroke:rgba(0,0,0,.2);stroke-width:.8}' +
    '#scr-party .pk-chip-e{stroke:#B4212F;stroke-width:2.6;stroke-linecap:round;fill:none}' +
    '#scr-party .pk-chip.sb .pk-chip-e{stroke:#2C6FD1}' +
    '#scr-party .pk-chip.bb .pk-chip-e{stroke:#1F8A4C}' +

    /* ── the felt ── */
    '#scr-party .pt-host.pk-host{align-items:stretch;justify-content:stretch;overflow:visible}' +
    '#scr-party .pk-table{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;' +
      'gap:5px;padding:7px 7px 8px;border-radius:16px;position:relative;' +
      'background:radial-gradient(120% 85% at 50% 34%,#1E7A50 0%,var(--pk-felt) 46%,var(--pk-felt2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.07),' +
      'inset 0 -18px 34px rgba(0,0,0,.42)}' +

    /* ── the rail of other seats ── */
    '#scr-party .pk-opps{flex:0 0 auto;display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;' +
      'padding:2px 2px 4px;-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
    '#scr-party .pk-opps::-webkit-scrollbar{display:none}' +
    '#scr-party .pk-opp{flex:0 0 auto;position:relative;display:flex;flex-direction:column;' +
      'align-items:center;gap:2px;min-width:66px;padding:4px 7px 5px;border-radius:11px;' +
      'background:rgba(0,0,0,.30);border:1px solid rgba(255,255,255,.09)}' +
    '#scr-party .pk-opp.on{background:rgba(255,197,66,.17);border-color:rgba(255,197,66,.6)}' +
    '#scr-party .pk-opp.fold{opacity:.42}' +
    '#scr-party .pk-opp.out{opacity:.3}' +
    '#scr-party .pk-opp .n{font:900 8.5px/1.2 var(--disp);letter-spacing:.07em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.68);max-width:82px;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .pk-opp.on .n{color:var(--pk-gold)}' +
    '#scr-party .pk-opp .h{display:flex;gap:2px;line-height:0}' +
    '#scr-party .pk-opp .st{font:900 12px/1 var(--disp);color:#FFF}' +
    '#scr-party .pk-opp .bt{display:flex;align-items:center;gap:3px;' +
      'font:700 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#FFE9B0;' +
      'padding:1px 5px 1px 2px;border-radius:999px;background:rgba(0,0,0,.4);' +
      'border:1px solid rgba(255,197,66,.35)}' +
    '#scr-party .pk-opp .mk{position:absolute;top:-5px;right:-4px}' +
    /* the button/blind chip sits over the top-right corner, so a marked
       seat's NAME is given the room back — otherwise the chip lands on
       the last letter and "NORMAL 1" reads as "NORMAL" */
    '#scr-party .pk-opp.mkd .n{padding-right:13px}' +
    '#scr-party .pk-opp .tag{font:900 8px/1.3 var(--disp);letter-spacing:.09em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.5)}' +
    '#scr-party .pk-opp.win .tag{color:var(--pk-gold)}' +

    /* ── the middle: the pot, and the five ── */
    '#scr-party .pk-mid{flex:1 1 auto;min-height:104px;position:relative;display:flex;' +
      'flex-direction:column;align-items:center;justify-content:center;gap:8px;' +
      'padding:9px 8px 7px;border-radius:14px;overflow:hidden;' +
      'background:radial-gradient(105% 130% at 50% 40%,rgba(255,255,255,.09) 0%,' +
      'rgba(255,255,255,0) 62%),rgba(0,0,0,.15);' +
      'border:1px solid rgba(0,0,0,.35)}' +
    /* the etched ring: an empty middle still reads as laid on purpose */
    '#scr-party .pk-mid::before{content:"";position:absolute;inset:6px;border-radius:9px;' +
      'border:1px solid rgba(255,255,255,.07);pointer-events:none}' +
    '#scr-party .pk-pot{position:relative;z-index:1;display:flex;align-items:center;gap:6px;' +
      'padding:3px 12px 3px 5px;border-radius:999px;background:rgba(0,0,0,.42);' +
      'border:1px solid rgba(255,197,66,.4);box-shadow:0 2px 8px rgba(0,0,0,.4)}' +
    '#scr-party .pk-pot b{font:900 15px/1 var(--disp);color:var(--pk-gold)}' +
    '#scr-party .pk-pot i{font:900 8.5px/1 var(--disp);font-style:normal;letter-spacing:.13em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.55)}' +
    '#scr-party .pk-board{position:relative;z-index:1;display:flex;gap:4px;align-items:center}' +
    '#scr-party .pk-street{position:absolute;left:10px;bottom:6px;font:900 9.5px/1 var(--disp);' +
      'letter-spacing:.17em;color:rgba(255,255,255,.2);pointer-events:none}' +
    '#scr-party .pk-mode{position:absolute;right:10px;bottom:6px;font:900 9.5px/1 var(--disp);' +
      'letter-spacing:.17em;color:rgba(255,255,255,.2);pointer-events:none}' +

    /* ── the showdown board: every seat that showed, with its hand ── */
    /* it takes the SAME slack the middle had, so the felt never opens a
       hole under the result at the one moment everybody is reading it */
    '#scr-party .pk-show{flex:1 1 auto;min-height:0;width:100%;overflow-y:auto;' +
      'display:flex;flex-direction:column;justify-content:center;gap:3px;padding:4px 2px;' +
      '-webkit-overflow-scrolling:touch}' +
    '#scr-party .pk-sr{display:flex;align-items:center;gap:7px;padding:3px 8px;' +
      'border-radius:9px;background:rgba(0,0,0,.26)}' +
    '#scr-party .pk-sr.win{background:rgba(255,197,66,.16);' +
      'box-shadow:inset 0 0 0 1px rgba(255,197,66,.4)}' +
    '#scr-party .pk-sr .who{flex:1;min-width:0;font:900 9.5px/1.3 var(--disp);' +
      'letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.8);' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .pk-sr.win .who{color:var(--pk-gold)}' +
    '#scr-party .pk-sr .hn{font:700 10px/1.3 var(--body);color:rgba(255,255,255,.62);' +
      'white-space:nowrap}' +
    '#scr-party .pk-sr .pl{font:900 10px/1 var(--disp);color:#7CE8AE;white-space:nowrap}' +
    '#scr-party .pk-sr .h{display:flex;gap:2px;line-height:0}' +

    /* ── the hint line ── */
    '#scr-party .pk-say{flex:0 0 auto;font:700 11px/1.45 var(--body);' +
      'color:rgba(255,255,255,.82);text-align:center;padding:0 8px;min-height:16px}' +
    '#scr-party .pk-say b{color:var(--pk-gold);font-weight:900}' +

    /* ── your own seat ── */
    '#scr-party .pk-me{flex:0 0 auto;display:flex;align-items:center;justify-content:center;' +
      'gap:10px;padding:4px 8px 0}' +
    '#scr-party .pk-me .h{display:flex;gap:4px;line-height:0}' +
    '#scr-party .pk-me .info{display:flex;flex-direction:column;gap:3px;align-items:flex-start}' +
    '#scr-party .pk-me .st{font:900 18px/1 var(--disp);color:#FFF}' +
    '#scr-party .pk-me .st i{display:block;font:700 8.5px/1.4 var(--disp);font-style:normal;' +
      'letter-spacing:.13em;text-transform:uppercase;color:rgba(255,255,255,.45)}' +
    '#scr-party .pk-me .bt{display:flex;align-items:center;gap:4px;' +
      'font:700 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#FFE9B0;' +
      'padding:2px 7px 2px 3px;border-radius:999px;background:rgba(0,0,0,.4);' +
      'border:1px solid rgba(255,197,66,.35)}' +
    '#scr-party .pk-me .hn{font:700 10px/1.3 var(--body);color:#9FE8C0}' +

    /* ── the buttons a turn is made of ── */
    '#scr-party .pk-acts{flex:0 0 auto;display:flex;gap:7px;justify-content:center;' +
      'padding:5px 2px 0}' +
    '#scr-party .pk-act{flex:1 1 0;min-width:0;min-height:46px;padding:0 8px;border-radius:12px;' +
      'font:900 11px/1.15 var(--disp);letter-spacing:.06em;text-transform:uppercase;' +
      'color:#241800;background:linear-gradient(180deg,#FFD979,var(--pk-gold));' +
      'border:1px solid #FFE9B0;box-shadow:0 3px 0 -1px rgba(0,0,0,.4);' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .pk-act small{display:block;font-size:8.5px;letter-spacing:.06em;opacity:.75;' +
      'margin-top:2px;font-weight:800}' +
    '#scr-party .pk-act.ghost{color:var(--txt);background:rgba(255,255,255,.08);' +
      'border-color:rgba(255,255,255,.2);box-shadow:none}' +
    '#scr-party .pk-act.hot{color:#FFF;background:linear-gradient(180deg,#E8556A,#B4212F);' +
      'border-color:#F0899A}' +
    '#scr-party .pk-act[disabled]{opacity:.34}' +
    '#scr-party .pk-act:not([disabled]):active{transform:translateY(2px);box-shadow:none}' +

    /* ── THE RAISE CONTROL. A thumb, not a mouse: a full-width range
       with a 30px thumb, four preset chips above it that are real 44px
       targets, and the amount printed big enough to read without
       looking for it. It slides UP over the buttons rather than
       reflowing the felt, so tapping RAISE never moves the cards. ── */
    '#scr-party .pk-bet{position:absolute;left:6px;right:6px;bottom:6px;z-index:26;' +
      'display:flex;flex-direction:column;gap:7px;padding:10px 11px 11px;border-radius:14px;' +
      'background:linear-gradient(180deg,#1B6446,#0B2E20);' +
      'border:1px solid rgba(255,197,66,.4);box-shadow:0 -6px 26px rgba(0,0,0,.55);' +
      'transform:translateY(112%);opacity:0;visibility:hidden;pointer-events:none;' +
      'transition:transform .2s var(--ease),opacity .2s var(--ease),visibility 0s .2s}' +
    '#scr-party .pk-bet.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .2s var(--ease),opacity .2s var(--ease)}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .pk-bet{transition:none}}' +
    'body.reduced #scr-party .pk-bet{transition:none}' +
    '#scr-party .pk-bet-h{display:flex;align-items:baseline;justify-content:space-between;gap:8px}' +
    '#scr-party .pk-bet-h b{font:900 22px/1 var(--disp);color:var(--pk-gold)}' +
    '#scr-party .pk-bet-h i{font:700 9.5px/1.3 var(--disp);font-style:normal;' +
      'letter-spacing:.11em;text-transform:uppercase;color:rgba(255,255,255,.55);text-align:right}' +
    '#scr-party .pk-pre{display:flex;gap:6px}' +
    '#scr-party .pk-pre button{flex:1 1 0;min-height:44px;padding:0 4px;border-radius:10px;' +
      'font:900 9.5px/1.2 var(--disp);letter-spacing:.05em;text-transform:uppercase;' +
      'color:var(--txt);background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .pk-pre button[aria-pressed="true"]{color:var(--pk-gold);' +
      'border-color:rgba(255,197,66,.6);background:rgba(255,197,66,.14)}' +
    '#scr-party .pk-pre button[disabled]{opacity:.3}' +
    '#scr-party .pk-sl{display:flex;align-items:center;gap:9px}' +
    '#scr-party .pk-sl input[type=range]{flex:1;min-width:0;height:34px;margin:0;' +
      'background:none;-webkit-appearance:none;appearance:none}' +
    '#scr-party .pk-sl input[type=range]::-webkit-slider-runnable-track{height:8px;' +
      'border-radius:999px;background:rgba(255,255,255,.16)}' +
    '#scr-party .pk-sl input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;' +
      'width:30px;height:30px;margin-top:-11px;border-radius:50%;background:var(--pk-gold);' +
      'border:2px solid #FFF3D0;box-shadow:0 2px 6px rgba(0,0,0,.5)}' +
    '#scr-party .pk-sl input[type=range]::-moz-range-track{height:8px;border-radius:999px;' +
      'background:rgba(255,255,255,.16)}' +
    '#scr-party .pk-sl input[type=range]::-moz-range-thumb{width:30px;height:30px;' +
      'border-radius:50%;background:var(--pk-gold);border:2px solid #FFF3D0}' +
    '#scr-party .pk-nud{width:44px;height:44px;flex:0 0 auto;border-radius:12px;' +
      'font:900 20px/1 var(--disp);color:var(--txt);background:rgba(255,255,255,.09);' +
      'border:1px solid rgba(255,255,255,.2);-webkit-tap-highlight-color:transparent}' +
    '#scr-party .pk-nud[disabled]{opacity:.3}' +
    '#scr-party .pk-bet-go{display:flex;gap:7px}' +
    '#scr-party .pk-bet-go .pk-act{min-height:46px}' +

    /* ── the table tally ── */
    '#scr-party .pk-book{width:100%;max-width:320px;margin:6px auto;border-collapse:collapse}' +
    '#scr-party .pk-book td{padding:4px 8px;font-size:11.5px;color:rgba(255,255,255,.8);' +
      'border-bottom:1px solid rgba(255,255,255,.1)}' +
    '#scr-party .pk-book td.n{text-align:right;font:700 11px/1.4 ui-monospace,SFMono-Regular,' +
      'Menlo,monospace;white-space:nowrap}' +
    '#scr-party .pk-book tr.win td{color:var(--pk-gold)}' +
    '#scr-party .pk-book tr.out td{color:rgba(255,255,255,.36)}' +
    '#scr-party .pk-book td i{font-style:normal;color:rgba(255,255,255,.45);font-size:10px}' +

    /* ── the rules: a panel that HIDES AND SLIDES, not a wall. It drops
       from the top of the table and stops well above your cards,
       because a rule is only useful next to the thing it applies to.
       No scrim — the table under it stays live. ── */
    '#scr-party .pk-rules{position:absolute;top:0;left:0;right:0;z-index:30;max-height:54%;' +
      'display:flex;flex-direction:column;border-radius:14px;overflow:hidden;' +
      'background:linear-gradient(180deg,#175B3D,#092A1D);border:1px solid rgba(255,255,255,.16);' +
      'box-shadow:0 14px 30px rgba(0,0,0,.55);' +
      'transform:translateY(-108%);opacity:0;visibility:hidden;pointer-events:none;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease),visibility 0s .26s}' +
    '#scr-party .pk-rules.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease)}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .pk-rules{transition:none}}' +
    'body.reduced #scr-party .pk-rules{transition:none}' +
    '#scr-party .pk-rules-h{flex:0 0 auto;display:flex;align-items:center;' +
      'justify-content:space-between;padding:9px 4px 2px 14px}' +
    '#scr-party .pk-rules-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--pk-gold)}' +
    '#scr-party .pk-rules-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;' +
      'color:var(--txt);cursor:pointer;display:grid;place-items:center;' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .pk-rules-x svg{width:16px;height:16px;stroke:currentColor;fill:none;' +
      'stroke-width:2.2;stroke-linecap:round}' +
    '#scr-party .pk-rules-b{min-height:0;overflow-y:auto;padding:2px 14px 12px;' +
      '-webkit-overflow-scrolling:touch}' +
    '#scr-party .pk-rules-b ul{margin:0;padding:0}' +
    '#scr-party .pk-rules-b li{font-size:12px;line-height:1.6;color:var(--dim);' +
      'margin:0 0 6px 14px}' +
    '#scr-party .pk-rules-b .pk-tallyh{font:900 10px/1 var(--disp);letter-spacing:.11em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.5);margin:6px 0 2px}' +
    /* the hand ladder, best first — the one table a poker rules card
       cannot do without */
    '#scr-party .pk-ladder{width:100%;margin:2px 0 8px;border-collapse:collapse}' +
    '#scr-party .pk-ladder td{padding:2px 6px;font-size:11px;color:var(--dim);' +
      'border-bottom:1px solid rgba(255,255,255,.07)}' +
    '#scr-party .pk-ladder td.k{width:22px;text-align:right;font:900 10px/1 var(--disp);' +
      'color:rgba(255,255,255,.35)}' +
    '#scr-party .pk-ladder td b{color:rgba(255,255,255,.85)}' +

    /* ── short screens (landscape phones) ──
       A landscape phone gets ~200px of felt and the portrait stack
       cannot fit it — so the felt becomes TWO COLUMNS: the rail across
       the top, the middle on the left, your own seat and its buttons on
       the right. Nothing sits below the fold. ── */
    '@media (max-height:520px){' +
      '#scr-party .pk-table{display:grid;column-gap:9px;row-gap:3px;padding:5px 6px 6px;' +
        'grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);' +
        'grid-template-rows:auto minmax(62px,1fr) auto;' +
        'grid-template-areas:"opps opps" "mid me" "acts acts";' +
        'overflow-y:auto;-webkit-overflow-scrolling:touch}' +
      '#scr-party .pk-opps{grid-area:opps}' +
      '#scr-party .pk-opp{min-width:56px;padding:2px 5px 3px}' +
      '#scr-party .pk-opp .st{font-size:10px}' +
      '#scr-party .pk-opp .tag{display:none}' +
      '#scr-party .pk-mid{grid-area:mid;min-height:0;padding:5px 6px 4px;gap:5px}' +
      '#scr-party .pk-street,#scr-party .pk-mode{display:none}' +
      '#scr-party .pk-show{grid-area:mid;max-height:none}' +
      '#scr-party .pk-say{display:none}' +
      '#scr-party .pk-me{grid-area:me;flex-direction:column;align-items:center;gap:5px;' +
        'align-self:center;padding:0}' +
      '#scr-party .pk-me .info{align-items:center}' +
      '#scr-party .pk-acts{grid-area:acts;padding-top:2px}' +
      '#scr-party .pk-act{min-height:38px;font-size:10px}' +
      '#scr-party .pk-bet{bottom:4px;padding:7px 9px 8px;gap:5px}' +
      '#scr-party .pk-bet-h b{font-size:18px}' +
      '#scr-party .pk-pre button{min-height:38px}' +
      '#scr-party .pk-nud{width:38px;height:38px}}' +

    /* ── THE SETUP SHEET'S OWN FACE — the green cloth worn as a badge.
       The identity piece is the thing everybody pictures when you say
       poker: two cards face down with a stack of chips on them, and
       the five in the middle behind. Scoped to .pk-menu so not one rule
       of it can reach another game's sheet. ── */
    '#scr-party .pk-menu .pt-lbl{color:#8FD8B4}' +
    '#scr-party .pk-menu .pk-hero{position:relative;display:flex;align-items:center;' +
      'justify-content:center;margin:2px 0 12px;padding:20px 8px 19px;border-radius:16px;' +
      'overflow:hidden;' +
      'background:radial-gradient(120% 130% at 50% 20%,#1E7A50 0%,var(--pk-felt) 52%,var(--pk-felt2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.07),' +
      'inset 0 -14px 26px rgba(0,0,0,.4)}' +
    '#scr-party .pk-menu .pk-hero::before{content:"";position:absolute;inset:6px;' +
      'border-radius:11px;border:1px solid rgba(255,255,255,.07);pointer-events:none}' +
    '#scr-party .pk-menu .pk-hero-in{position:relative;display:flex;flex-direction:column;' +
      'align-items:center;gap:9px}' +
    '#scr-party .pk-menu .pk-hero-b{display:flex;gap:3px}' +
    '#scr-party .pk-menu .pk-hero-h{display:flex;position:relative}' +
    '#scr-party .pk-menu .pk-hero-h .kb-card:first-child{transform:rotate(-9deg)}' +
    '#scr-party .pk-menu .pk-hero-h .kb-card:last-child{transform:rotate(8deg);margin-left:-14px}' +
    '#scr-party .pk-menu .pk-hero-st{display:flex;flex-direction:column-reverse;' +
      'margin-left:10px;align-self:flex-end}' +
    '#scr-party .pk-menu .pk-hero-st .pk-chip{width:25px;height:25px;margin-top:-17px}' +
    '#scr-party .pk-menu .pk-hero-cap{position:absolute;right:11px;bottom:7px;' +
      'font:900 9.5px/1 var(--disp);letter-spacing:.18em;color:rgba(255,255,255,.3)}' +
    '#scr-party .pk-menu .pk-warn{font-size:11.5px;line-height:1.6;margin:8px 2px 0;' +
      'padding:9px 11px;border-radius:12px;text-transform:none;letter-spacing:0;' +
      'color:#FFE0B0;background:rgba(255,180,60,.10);border:1px solid rgba(255,180,60,.3)}' +
    '#scr-party .pk-menu .pk-why{font-size:11.5px;line-height:1.6;margin:8px 2px 0;' +
      'padding:9px 11px;border-radius:12px;text-transform:none;letter-spacing:0;' +
      'color:#CFF0DE;background:rgba(60,200,130,.09);border:1px solid rgba(60,200,130,.3)}' +
    '#scr-party .pk-step{display:flex;align-items:center;gap:10px;justify-content:center;' +
      'padding:4px 0}' +
    '#scr-party .pk-step .v{font:900 24px/1 var(--disp);color:var(--pk-gold);min-width:96px;' +
      'text-align:center}' +
    '#scr-party .pk-step .v i{display:block;font:700 9px/1.4 var(--disp);font-style:normal;' +
      'letter-spacing:.12em;color:var(--dim);text-transform:uppercase}' +
    '#scr-party .pk-rnd{width:46px;height:46px;border-radius:12px;font:900 22px/1 var(--disp);' +
      'color:var(--txt);background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.2)}' +
    '#scr-party .pk-rnd[disabled]{opacity:.35}' +
    '#scr-party .pk-fold-h{display:flex;align-items:center;gap:10px;width:100%;text-align:left;' +
      'border:0;background:none;padding:2px 0;margin:0;color:var(--txt);cursor:pointer;' +
      'min-height:44px;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .pk-fold-h span{flex:1;min-width:0}' +
    '#scr-party .pk-fold-h b{display:block;font:900 10px/1.4 var(--disp);letter-spacing:.11em;' +
      'text-transform:uppercase;color:var(--gold,#FFC542)}' +
    '#scr-party .pk-fold-h i{display:block;font-style:normal;font-size:10.5px;line-height:1.4;' +
      'color:var(--dim);margin-top:3px}' +
    '#scr-party .pk-fold-h em{flex:0 0 auto;width:24px;height:24px;display:grid;' +
      'place-items:center;color:var(--dim)}' +
    '#scr-party .pk-fold-h em svg{width:15px;height:15px;stroke:currentColor;fill:none;' +
      'stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;transform:rotate(90deg);' +
      'transition:transform .22s var(--ease)}' +
    '#scr-party .pk-fold-h[aria-expanded="true"] em svg{transform:rotate(-90deg)}' +
    '#scr-party .pk-fold-b{display:grid;grid-template-rows:0fr;' +
      'transition:grid-template-rows .28s var(--ease)}' +
    '#scr-party .pk-fold-b.open{grid-template-rows:1fr}' +
    '#scr-party .pk-fold-i{overflow:hidden;min-height:0}' +
    '#scr-party .pk-fold-i .pk-fold-c{transform:translateY(-10px);opacity:0;' +
      'transition:transform .28s var(--ease),opacity .28s var(--ease)}' +
    '#scr-party .pk-fold-b.open .pk-fold-i .pk-fold-c{transform:none;opacity:1}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .pk-fold-b,' +
      '#scr-party .pk-fold-i .pk-fold-c{transition:none}}' +
    'body.reduced #scr-party .pk-fold-b,body.reduced #scr-party .pk-fold-i .pk-fold-c' +
      '{transition:none}' +

    /* ── THE ENTRY MODE BUTTONS — big, few, one clear primary. The same
       clean shape as il-bomba/kanun's menu, felt-green primary. ── */
    /* NOTE: the class is .pk-way, NOT .pk-mode — the felt already owns
       .pk-mode (the absolute FREE/COINS badge, line ~561), so reusing it
       here pinned these buttons to the bottom-right. Distinct name. */
    '#scr-party .pk-modes{display:flex;flex-direction:column;gap:9px;margin:2px 0 6px}' +
    '#scr-party .pk-way{display:flex;align-items:center;gap:12px;width:100%;text-align:left;' +
      'padding:14px 12px;border-radius:14px;cursor:pointer;-webkit-tap-highlight-color:transparent;' +
      'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:var(--txt)}' +
    '#scr-party .pk-way.primary{background:linear-gradient(180deg,#1E9A62,var(--pk-felt,#12603E));' +
      'border-color:rgba(255,255,255,.22);box-shadow:0 3px 0 -1px rgba(0,0,0,.4),' +
      'inset 0 1px 0 rgba(255,255,255,.14)}' +
    '#scr-party .pk-way:not([disabled]):active{transform:translateY(1px)}' +
    '#scr-party .pk-wi{flex:0 0 auto;width:36px;height:36px;border-radius:10px;display:grid;' +
      'place-items:center;background:rgba(0,0,0,.22)}' +
    '#scr-party .pk-way.primary .pk-wi{background:rgba(0,0,0,.20)}' +
    '#scr-party .pk-wi svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;' +
      'stroke-linecap:round;stroke-linejoin:round}' +
    '#scr-party .pk-wt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}' +
    '#scr-party .pk-wt b{font:900 14px/1.15 var(--disp);letter-spacing:.02em}' +
    '#scr-party .pk-wt i{font-style:normal;font-size:11px;line-height:1.35;color:var(--dim)}' +
    '#scr-party .pk-way.primary .pk-wt i{color:rgba(255,255,255,.82)}' +
    '#scr-party .pk-wchev{flex:0 0 auto;width:22px;height:22px;display:grid;place-items:center;' +
      'color:var(--dim)}' +
    '#scr-party .pk-way.primary .pk-wchev{color:rgba(255,255,255,.8)}' +
    '#scr-party .pk-wchev svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.4;' +
      'stroke-linecap:round;stroke-linejoin:round}' +
    /* the menu rules sheet: the in-felt panel, floated fixed over the menu */
    '#scr-party .pk-menu-rules{position:fixed;left:10px;right:10px;top:56px}' +

    '@media (max-height:520px){#scr-party .pk-menu .pk-hero{padding:12px 8px 13px}}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   THE FELT
   ═══════════════════════════════════════════════════════════════════ */
function table(){
  const ctx = M.ctx;
  ctx.host.classList.add('pk-host');
  ctx.host.innerHTML =
    '<div class="pk-table" id="pk-table">' +
      '<div class="pk-opps" id="pk-opps"></div>' +
      '<div class="pk-mid" id="pk-mid"></div>' +
      '<div class="pk-say" id="pk-say"></div>' +
      '<div class="pk-me" id="pk-me"></div>' +
      '<div class="pk-acts" id="pk-acts"></div>' +
      /* the raise control lives OVER the buttons, never reflowing the
         felt — tapping RAISE must not move the cards */
      '<div class="pk-bet" id="pk-bet" aria-hidden="true"></div>' +
      /* the rules panel lives OVER the table; render() never touches
         it — only paintRules() does */
      '<div class="pk-rules" id="pk-rulespanel" aria-hidden="true">' +
        '<div class="pk-rules-h"><h4 id="pk-rules-t"></h4>' +
          '<button class="pk-rules-x" id="pk-rules-x" aria-label="' +
            esc(T('Put the rules away', 'Warrab ir-regoli')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<div class="pk-rules-b" id="pk-rules-b"></div>' +
      '</div>' +
    '</div>';
  const root = ctx.host.querySelector('#pk-table');
  UI = {
    ctx, root,
    opps: root.querySelector('#pk-opps'),
    mid:  root.querySelector('#pk-mid'),
    say:  root.querySelector('#pk-say'),
    me:   root.querySelector('#pk-me'),
    acts: root.querySelector('#pk-acts'),
    bet:  root.querySelector('#pk-bet'),
    rules: root.querySelector('#pk-rulespanel'),
    wide: () => Math.max(240, root.clientWidth - 24)
  };
  root.querySelector('#pk-rules-x').addEventListener('click', () => setRules(false));
  /* tap anywhere OUTSIDE the rules panel puts it away — the table under
     it stays live, so this must never eat the tap itself */
  ctx.root.addEventListener('pointerdown', e => {
    if (!rulesOpen || !UI || !UI.rules) return;
    const rb = ctx.btn && ctx.btn('pk-rules');
    if (!UI.rules.contains(e.target) && !(rb && rb.contains(e.target))) setRules(false);
  }, true);
  /* one delegated listener for the whole felt */
  root.addEventListener('click', e => {
    if (!M || M.dead) return;
    const t = e.target && e.target.closest && e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    e.preventDefault();
    onTap(t);
  });
  /* the slider is an input, not a button — its own listener */
  root.addEventListener('input', e => {
    if (!M || M.dead) return;
    const t = e.target;
    if (!t || t.id !== 'pk-slider') return;
    M.tmp.raiseTo = clampRaise(+t.value);
    paintBetPanel();
  });
  return UI;
}

const mySeat = () => (M ? E.meSeat(M.st) : 0);

/* ── the raise amount, kept inside what the rules will actually take.
   The slider steps in big blinds so a thumb lands on a legal number,
   and the two ends are always exactly the minimum and the whole
   stack — never a rounded-off value that would be refused. ── */
function clampRaise(v){
  const st = M.st, me = mySeat();
  const r = E.betRange(st, me);
  if (!r.can) return 0;
  v = Math.round(v);
  if (v <= r.min) return r.min;
  if (v >= r.max) return r.max;
  /* snap to a whole big blind, then keep it inside the ends */
  const bb = st.bb;
  const snapped = Math.round(v / bb) * bb;
  return Math.max(r.min, Math.min(r.max, snapped || v));
}

function onTap(t){
  const st = M.st, me = mySeat();
  const mine = E.turn(st) === me;
  const a = t.getAttribute('data-act');

  if (a === 'rules'){ setRules(!rulesOpen); return; }
  if (a === 'betclose'){ setBet(false); return; }
  if (a === 'betopen'){
    if (!mine) return;
    const r = E.betRange(st, me);
    if (!r.can) return;
    M.tmp.raiseTo = clampRaise(M.tmp.raiseTo || r.min);
    setBet(true);
    return;
  }
  if (a === 'preset'){
    const r = E.betRange(st, me);
    if (!r.can) return;
    M.tmp.raiseTo = clampRaise(+t.getAttribute('data-v'));
    cue('ui.tap', { gain: 0.8 }, true);
    paintBetPanel();
    return;
  }
  if (a === 'nudge'){
    const r = E.betRange(st, me);
    if (!r.can) return;
    const step = st.bb * (+t.getAttribute('data-v'));
    M.tmp.raiseTo = clampRaise((M.tmp.raiseTo || r.min) + step);
    cue('ui.tap', { gain: 0.7 }, true);
    paintBetPanel();
    return;
  }
  if (!mine) return;
  if (a === 'fold')  { setBet(false); tryMove({ t:'fold' }); return; }
  if (a === 'check') { setBet(false); tryMove({ t:'check' }); return; }
  if (a === 'call')  { setBet(false); tryMove({ t:'call' }); return; }
  if (a === 'raise'){
    const amt = clampRaise(M.tmp.raiseTo || 0);
    setBet(false);
    tryMove({ t:'bet', a: amt });
    return;
  }
}

function nag(err){
  if (/turn/.test(String(err))) return '⚠ ' + T('Not your go yet.', 'Għadu mhux imissek.');
  return '⚠ ' + T('The rules said no. Take it up with the rules.',
                  'Ir-regoli qalu le. Mur ilmenta magħhom.');
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
  M.tmp.raiseTo = 0;
  render();
}

function setBet(open){
  if (!UI || !UI.bet) return;
  const was = UI.bet.classList.contains('open');
  UI.bet.classList.toggle('open', !!open);
  UI.bet.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (open && !was) cue('ui.sheet', { gain: 0.75 }, true);
  if (open) paintBetPanel();
}

/* the raise panel's own paint — the amount, the presets and the slider.
   Kept apart from render() so dragging the slider does not repaint the
   whole felt sixty times a second. */
function paintBetPanel(){
  if (!UI || !UI.bet || !M) return;
  const st = M.st, me = mySeat();
  const r = E.betRange(st, me);
  if (!r.can){ UI.bet.innerHTML = ''; return; }
  const s = st.seats[me];
  const amt = clampRaise(M.tmp.raiseTo || r.min);
  M.tmp.raiseTo = amt;
  const pot = E.potOf(st);
  const toCall = Math.max(0, st.betToMatch - s.bet);
  /* the four sizes a person actually wants: the minimum, half the pot,
     the pot, and everything. Any that land on the same number as
     another are still drawn — a preset that quietly vanishes is worse
     than one that agrees with its neighbour. */
  const presets = [
    { v: r.min, label: st.betToMatch > 0 ? T('Min raise', 'L-inqas') : T('Min bet', 'L-inqas') },
    { v: clampRaise(st.betToMatch + Math.round((pot + toCall) * 0.5)), label: T('½ pot', 'Nofs il-pott') },
    { v: clampRaise(st.betToMatch + (pot + toCall)), label: T('Pot', 'Il-pott') },
    { v: r.max, label: T('All in', 'Kollox') }
  ];
  const verb = st.betToMatch > 0 ? T('Raise to', 'Għolli sa') : T('Bet', 'Imħatra');
  UI.bet.innerHTML =
    '<div class="pk-bet-h"><b>' + amt + '</b>' +
      '<i>' + esc(verb) + ' · ' +
      esc(T('you have', 'għandek') + ' ' + (s.stack + s.bet)) + '</i></div>' +
    '<div class="pk-pre">' + presets.map(p =>
      '<button type="button" data-act="preset" data-v="' + p.v + '"' +
        ' aria-pressed="' + (p.v === amt ? 'true' : 'false') + '"' +
        (p.v < r.min || p.v > r.max ? ' disabled' : '') + '>' + esc(p.label) +
        '<br>' + p.v + '</button>').join('') + '</div>' +
    '<div class="pk-sl">' +
      '<button class="pk-nud" type="button" data-act="nudge" data-v="-1" aria-label="' +
        esc(T('Less', 'Inqas')) + '"' + (amt <= r.min ? ' disabled' : '') + '>&minus;</button>' +
      '<input type="range" id="pk-slider" min="' + r.min + '" max="' + r.max + '"' +
        ' step="1" value="' + amt + '" aria-label="' + esc(T('How much to raise to',
        'Kemm tgħolli')) + '">' +
      '<button class="pk-nud" type="button" data-act="nudge" data-v="1" aria-label="' +
        esc(T('More', 'Aktar')) + '"' + (amt >= r.max ? ' disabled' : '') + '>+</button>' +
    '</div>' +
    '<div class="pk-bet-go">' +
      '<button class="pk-act ghost" type="button" data-act="betclose">' +
        esc(T('Back', 'Lura')) + '</button>' +
      '<button class="pk-act" type="button" data-act="raise">' +
        esc(amt >= r.max ? T('All in', 'Kollox') : verb) + ' <small>' + amt + '</small></button>' +
    '</div>';
}

/* ── the table tally, as one small table: chips, hands taken and the
   biggest pot. Derived from st.book and the stacks, never stored
   twice. ── */
function tallyRows(st){
  const t = E.tally(st);
  const rows = st.seats.map((p, i) => {
    const broke = p.stack <= 0;
    const streak = t[i].streak > 1 ? ' · ' + t[i].streak + T(' straight', ' wara xulxin') : '';
    const best = t[i].best > 0 ? ' <i>(' + T('best pot', 'l-akbar pott') + ' ' + t[i].best + ')</i>' : '';
    return '<tr class="' + (broke ? 'out' : (t[i].streak > 0 ? 'win' : '')) + '">' +
      '<td>' + esc(p.name) + (p.gone ? '<i> · ' + esc(T('left the table', 'telaq mill-mejda')) + '</i>'
                            : broke ? '<i> · ' + esc(T('broke', 'fallut')) + '</i>' : '') + '</td>' +
      '<td class="n">' + p.stack + ' · ' + t[i].won +
        (t[i].won === 1 ? T(' hand', ' id') : T(' hands', ' idejn')) + streak + best + '</td></tr>';
  }).join('');
  return rows ? '<table class="pk-book">' + rows + '</table>' : '';
}

/* how many of the community cards are up right now */
function boardW(short){ return short ? 26 : 34; }

function render(){
  if (!M || M.dead || !M.ctx || !UI) return;
  const st = M.st;
  const t = E.turn(st);
  const done = E.over(st);
  const me = mySeat();
  const mine = t === me;
  const short = (UI.root.clientHeight || 500) < 430;   /* a landscape phone */
  const showing = st.phase === 'handover' && st.show;
  const meS = st.seats[me];

  /* somebody who walked out must be SAID to have walked out */
  const goneNow = st.seats.map(p => !!p.gone);
  if (M.tmp.goneSeen){
    st.seats.forEach((p, i) => {
      if (goneNow[i] && !M.tmp.goneSeen[i] && i !== me && K.toast)
        K.toast(esc(p.name) + ' ' + T('left the table.', 'telaq mill-mejda.'));
    });
  }
  M.tmp.goneSeen = goneNow;

  /* — the rail of other seats: stack, what is in front of them, and
       whether they are still in the hand — */
  const b = E.blinds(st);
  const wonNow = showing ? (st.book[st.book.length - 1] || {}).won || {} : {};
  UI.opps.innerHTML = st.seats.map((p, i) => {
    if (i === me) return '';
    const mark = i === st.button ? chip('D')
               : i === b.sb ? chip('S', 'sb')
               : i === b.bb ? chip('B', 'bb') : '';
    const reveal = showing && st.show.reveal.indexOf(i) >= 0;
    const cards = p.out ? ''
      : '<span class="h">' +
        (reveal && p.hole.length === 2
          ? p.hole.map(c => cardBtn(c, { w: short ? 17 : 21 })).join('')
          : (p.folded ? '' : [0, 1].map(() => cardBtn(-1, { face:false, w: short ? 17 : 21 })).join(''))) +
        '</span>';
    const tag = p.out ? T('OUT', 'BARRA')
              : p.folded ? T('FOLD', 'WARRAB')
              : p.allin ? T('ALL IN', 'KOLLOX')
              : (wonNow[i] ? '+' + wonNow[i] : '');
    return '<div class="pk-opp' + (t === i ? ' on' : '') + (p.folded ? ' fold' : '') +
        (p.out ? ' out' : '') + (wonNow[i] ? ' win' : '') + (mark ? ' mkd' : '') +
        '" data-seat="' + i + '">' +
      (mark ? '<span class="mk">' + mark + '</span>' : '') +
      '<span class="n">' + esc(p.name) + '</span>' +
      cards +
      '<span class="st">' + p.stack + '</span>' +
      (p.bet > 0 ? '<span class="bt">' + chip('') + p.bet + '</span>'
                 : (tag ? '<span class="tag">' + esc(tag) + '</span>' : '')) +
      '</div>';
  }).join('');
  const on = UI.opps.querySelector('.pk-opp.on');
  if (on && on.scrollIntoView){
    try { on.scrollIntoView({ block:'nearest', inline:'center', behavior:'instant' }); } catch(e){
      try { on.scrollIntoView(false); } catch(e2){} }
  }

  /* — the middle: the pot and the five. During a showdown the middle
       becomes the showdown instead, because that is the one moment
       everybody is looking at the same thing. — */
  const bw = boardW(short);
  const pot = showing ? ((st.book[st.book.length - 1] || {}).pot | 0) : E.potOf(st);
  if (showing && st.show.showdown){
    UI.mid.className = 'pk-show';
    UI.mid.innerHTML = showdownHTML(st, me, short);
  } else {
    UI.mid.className = 'pk-mid';
    const up = st.board.length;
    UI.mid.innerHTML =
      '<div class="pk-pot">' + chip('') + '<i>' + esc(T('Pot', 'Il-pott')) + '</i><b>' +
        pot + '</b></div>' +
      '<div class="pk-board">' +
        st.board.map(c => cardBtn(c, { w: bw })).join('') +
        Array.from({ length: Math.max(0, 5 - up) }, () => slot(bw)).join('') +
      '</div>' +
      (showing
        ? '<div class="pk-say" style="padding-top:2px">' + wonLine(st, me) + '</div>'
        : '') +
      '<span class="pk-street" aria-hidden="true">' + STREET_NAME[st.street] + '</span>' +
      '<span class="pk-mode" aria-hidden="true">' +
        esc(st.mode === 'coins' ? T('COINS', 'MUNITI') : T('FREE', 'ĦIELES')) + '</span>';
  }

  /* — the hint line — */
  UI.say.innerHTML = done ? '' : sayLine(st, me, t, mine);

  /* — your own seat: two cards, your stack, what you have in front of
       you, and — the moment there is a board — what you actually have — */
  const myHand = (meS.hole.length === 2 && st.board.length >= 3 && !meS.folded)
    ? E.best5(meS.hole.concat(st.board)) : null;
  UI.me.innerHTML =
    '<span class="h">' +
      (meS.hole.length === 2
        ? meS.hole.map(c => cardBtn(c, {
            w: short ? 40 : 56,
            dim: meS.folded,
            lit: !!(showing && st.show.reveal.indexOf(me) >= 0 &&
                    myHand && myHand.cards.indexOf(c) >= 0)
          })).join('')
        : slot(short ? 40 : 56) + slot(short ? 40 : 56)) +
    '</span>' +
    '<span class="info">' +
      '<span class="st">' + meS.stack +
        '<i>' + esc(meS.folded ? T('folded', 'warrabt')
                  : meS.allin ? T('all in', 'kollox')
                  : T('your chips', 'iċ-ċipep tiegħek')) + '</i></span>' +
      (meS.bet > 0 ? '<span class="bt">' + chip('') + meS.bet + '</span>' : '') +
      (myHand && !meS.folded
        ? '<span class="hn">' + esc(handName(myHand.v)) + '</span>' : '') +
    '</span>';

  /* — the three buttons a turn is made of — */
  paintActs(st, me, t, mine, done, showing);

  /* landscape scrolls the whole table — whenever it is HIS decision,
     the buttons must be above the fold. scrollTop arithmetic, and only
     when actually cut off, so a player reading the middle is not
     yanked about. */
  if (mine && !done){
    const rr2 = UI.root.getBoundingClientRect();
    const ar = UI.acts.getBoundingClientRect();
    const cut = ar.bottom - rr2.bottom;
    if (cut > 1) UI.root.scrollTop += cut + 4;
  }

  if (rulesOpen) paintRules();
  paintTurn(t, done, showing);
  paintBar();
  if (done){ finish(done); return; }
  step();
}

/* the showdown, as a row per seat: the two cards, what it came to, and
   what it took. Winners are lit; the rest are told plainly. */
function showdownHTML(st, me, short){
  const sh = st.show;
  const won = {};
  sh.pots.forEach(p => p.winners.forEach(i => { won[i] = (won[i] | 0) + p.take[i]; }));
  const rows = sh.reveal.map(i => {
    const p = st.seats[i];
    const b5 = (p.hole.length === 2 && sh.board.length >= 5)
      ? E.best5(p.hole.concat(sh.board)) : null;
    return '<div class="pk-sr' + (won[i] ? ' win' : '') + '">' +
      '<span class="h">' + p.hole.map(c => cardBtn(c, { w: short ? 17 : 22 })).join('') + '</span>' +
      '<span class="who">' + esc(i === me ? T('You', 'Int') : p.name) + '</span>' +
      '<span class="hn">' + esc(b5 ? handName(b5.v) : '') + '</span>' +
      (won[i] ? '<span class="pl">+' + won[i] + '</span>' : '') +
      '</div>';
  }).join('');
  /* the five in the middle sit at the top of the list, so the reader
     can see what everybody was building on */
  return '<div class="pk-sr" style="background:none">' +
      '<span class="h">' + sh.board.map(c => cardBtn(c, { w: short ? 18 : 23 })).join('') + '</span>' +
      '<span class="who">' + esc(T('The board', 'Il-mejda')) + '</span></div>' +
    rows +
    (sh.pots.length > 1
      ? '<div class="pk-sr" style="background:none"><span class="hn">' +
        esc(T('Side pots paid separately: ', 'Il-potts tal-ġenb tħallsu għalihom: ') +
            sh.pots.map(p => p.amount).join(' · ')) + '</span></div>'
      : '');
}

function wonLine(st, me){
  const row = st.book[st.book.length - 1];
  if (!row) return '';
  const names = (row.winners || []).map(i => i === me ? T('You', 'Int') : st.seats[i].name);
  if (!names.length) return '';
  if (names.length > 1)
    return '<b>' + esc(names.join(' + ')) + '</b> ' +
           esc(T('split the pot.', 'qasmu l-pott.'));
  const mineWin = row.winners[0] === me;
  return '<b>' + esc(names[0]) + '</b> ' +
    esc(row.showdown ? T('takes it.', 'ħadu.') : T('takes it — nobody called.', 'ħadu — ħadd ma sejjaħ.')) +
    (mineWin ? '' : '');
}

function sayLine(st, me, t, mine){
  const s = st.seats[me];
  if (st.phase === 'handover')
    return esc(T('Next hand…', 'L-id li jmiss…'));
  if (t === -1) return '…';
  if (!mine)
    return esc(st.seats[t] ? st.seats[t].name + ' ' + T('is thinking.', 'qiegħed jaħseb.') : '…');
  const toCall = Math.max(0, st.betToMatch - s.bet);
  if (toCall === 0)
    return '<b>' + esc(T('Your go.', 'Imissek.')) + '</b> ' +
      esc(T('Check it, or put something in.', 'Għaddi, jew poġġi xi ħaġa fih.'));
  if (toCall >= s.stack)
    return '<b>' + esc(T('It is all your chips to call.', 'Iċ-ċipep kollha tiegħek biex issejjaħ.')) +
      '</b> ' + esc(T('Fold, or go with it.', 'Warrab, jew mur bih.'));
  return '<b>' + esc(toCall + ' ' + T('to call.', 'biex issejjaħ.')) + '</b> ' +
    esc(T('The pot is ', 'Il-pott hu ') + E.potOf(st) + '.');
}

function paintActs(st, me, t, mine, done, showing){
  if (done || showing || st.phase === 'handover'){ UI.acts.innerHTML = ''; setBet(false); return; }
  const s = st.seats[me];
  const toCall = Math.max(0, st.betToMatch - s.bet);
  const r = E.betRange(st, me);
  const can = mine && !s.folded && !s.allin;
  /* CALL says what it costs and RAISE says what it would take — a
     poker button with no number on it makes you do arithmetic with
     your thumb hovering, which is how people misclick a stack away. */
  UI.acts.innerHTML =
    '<button class="pk-act ghost" type="button" data-act="fold"' + (can ? '' : ' disabled') + '>' +
      esc(T('Fold', 'Warrab')) + '</button>' +
    (toCall === 0
      ? '<button class="pk-act" type="button" data-act="check"' + (can ? '' : ' disabled') + '>' +
        esc(T('Check', 'Għaddi')) + '</button>'
      : '<button class="pk-act" type="button" data-act="call"' + (can ? '' : ' disabled') + '>' +
        esc(toCall >= s.stack ? T('Call all in', 'Sejjaħ kollox') : T('Call', 'Sejjaħ')) +
        '<small>' + Math.min(toCall, s.stack) + '</small></button>') +
    '<button class="pk-act hot" type="button" data-act="betopen"' +
      (can && r.can ? '' : ' disabled') + '>' +
      esc(st.betToMatch > 0 ? T('Raise', 'Għolli') : T('Bet', 'Imħatra')) +
      (r.can ? '<small>' + (r.min >= r.max ? T('all in', 'kollox') : T('from', 'minn') + ' ' + r.min) +
               '</small>' : '') +
    '</button>';
  if (!can || !r.can) setBet(false);
}

function paintTurn(t, done, showing){
  const st = M.st;
  if (done){ P.ui.setTurn(M.ctx, { cls:'', who:done.head, note:'' }); return; }
  const who = showing ? T('Showdown', 'Il-wirja')
            : st.phase === 'handover' ? T('Next hand…', 'L-id li jmiss…')
            : t === -1 ? T('The table…', 'Il-mejda…')
            : isLocal(t) ? T('Your turn', 'Imissek')
            : st.seats[t].name + ' ' + T('is thinking…', 'qiegħed jaħseb…');
  const note = STREET_NAME[st.street] + ' · ' + T('pot', 'pott') + ' ' +
    (showing ? ((st.book[st.book.length - 1] || {}).pot | 0) : E.potOf(st)) +
    (st.book.length ? ' · ' + T('hand', 'id') + ' ' + st.handNo : '');
  P.ui.setTurn(M.ctx, { cls: (t >= 0 && isLocal(t)) ? 'w' : '', who, note });
}
function paintBar(){
  const b = M.ctx.btn('pk-undo');
  if (b) b.disabled = !(undoPoint() >= 0) || !!M.net;
}

/* the beat between moves — table beats and the machine, timered. The
   handover beat is the long one on purpose: a showdown that clears
   itself in half a second is a showdown nobody read. */
function step(){
  stopThinking();
  const st = M.st;
  const t = E.turn(st);
  if (t === -1){
    const ms = FAST ? 1
             : st.phase === 'handover' ? 3200
             : (st.street === 0 ? 700 : 900);
    M.timer = setTimeout(() => {
      M.timer = 0;
      if (!M || M.dead) return;
      const opts = E.legal(M.st, -1);
      if (!opts.length) return;
      doMove(-1, opts[0], 'auto');
      render();
    }, ms);
    return;
  }
  if (t < 0 || isLocal(t)) return;
  if (ownerOf(t) === 'net') return;
  M.timer = setTimeout(() => {
    M.timer = 0;
    if (!M || M.dead) return;
    if (E.turn(M.st) !== t) return;
    let mv = null;
    try { mv = E.think(M.st, t, M.st.seats[t].lvl || 2); } catch(e){ mv = null; }
    if (!mv || !E.check(M.st, mv, t)){
      if (window.__PK_TEST) window.__PK_TEST.badAI = (window.__PK_TEST.badAI || 0) + 1;
      mv = (E.legal(M.st, t) || [])[0];
    }
    if (!mv) return;
    mv.seat = t;
    doMove(t, mv, 'ai');
    render();
  }, FAST ? 1 : (520 + ((Date.now() % 5) * 90)));
}

/* ═══════════════════════════════════════════════════════════════════
   THE END — which is the TABLE breaking up, never a hand. A hand is a
   pot; the table ends when one seat has every chip, or when this
   player has none left to post a blind with.
   ═══════════════════════════════════════════════════════════════════ */
function finish(done){
  if (M.finished) return;
  M.finished = true;
  stopThinking();
  setBet(false);
  cueIn(260, () => cue(done.tone === 'win' ? 'game.win'
                     : done.tone === 'lose' ? 'game.lose' : 'ui.toast', { gain: 1 }, true));
  /* the record book, once per TABLE. Offline only — an online table's
     result is the room's business. */
  if (!M.net && !M.recordedTable){
    M.recordedTable = true;
    const o = done.tone === 'win' ? 'w' : done.tone === 'lose' ? 'l' : 'd';
    ST.rec[o] = (ST.rec[o] | 0) + 1; persist();
    if (typeof P.record === 'function'){ try { P.record('poker', o); } catch(e){} }
  }
  /* COINS MODE settles here and nowhere else: the buy-in came off the
     balance when the table opened, and whatever is left in front of the
     player goes back on now. Locked behind the flag at the top of this
     file — in FREE mode not one line of this runs, and the balance is
     never read, let alone written. */
  let purse = '';
  if (COINS_MODE_READY && M.st.mode === 'coins' && !M.cashed){
    M.cashed = true;
    const left = M.st.seats[mySeat()].stack | 0;
    if (left > 0) coinMove(left);
    const buyIn = M.opts.stack | 0;
    const net = left - buyIn;
    purse = ' ' + (net > 0 ? T('You are up ', 'Int rebaħt ') + net
                 : net < 0 ? T('You are down ', 'Int tlift ') + (-net)
                 : T('You broke even.', 'Ħriġt patta.'));
  }
  saveSlot(null);
  P.ui.result(M.ctx, {
    tone: done.tone || 'draw',
    head: done.head, why: done.why + purse, quip: done.quip,
    buttons: [
      { label: T('New table', 'Mejda ġdida'), icon:'refresh', cls:'primary',
        go: () => newGame(M.opts) },
      { label: T('Back to the shelf', 'Lura lejn l-ixkaffa'), icon:'back', cls:'ghost',
        go: () => P.hub() }
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
    name: i === 0 ? T('You', 'Int') : levelWords(s.lvl).n + ' ' + i,
    own: s.own, lvl: s.lvl
  }));
  applyMeta();
  M.finished = false;
  /* COINS MODE takes the buy-in at the door, not at the end: a player
     must not be able to sit down, lose, and close the app. Behind the
     flag, so FREE mode never touches the balance. */
  if (COINS_MODE_READY && !snap && M.st.mode === 'coins'){
    coinMove(-(M.opts.stack | 0));
  }
  openBoard(() => menu());
  render();
  cue('game.start', { gain: 0.9 }, true);
  cueIn(280, () => {
    cue('card.shuffle', { gain: 0.85 }, true);
    const S = window.KARTI_SFX;
    if (S && S.run) cueIn(220, () => S.run('card.deal', Math.min(M ? M.st.n * 2 : 6, 8), 85, { gain: 0.5 }));
  });
}

function openBoard(onBack){
  M.ctx = P.ui.frame({
    /* POKER is the game's NAME and stays itself in both languages */
    title: 'POKER',
    /* THE BACK ARROW GOES BACK. No "are you sure": the table is
       autosaved after every single move and the setup sheet offers it
       again at the top, so a confirm here would be a popup that
       protects nothing. */
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'pk-undo',  label:T('Undo', 'Erġa lura'), icon:'back',    cls:'ghost' },
      { id:'pk-rules', label:T('Rules', 'Regoli'),   icon:'book',    cls:'ghost' },
      { id:'pk-new',   label:T('New', 'Ġdida'),      icon:'refresh', cls:'ghost' }
    ]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();
  M.ctx.badge.textContent = (M.st.mode === 'coins' ? T('Coins', 'Muniti') : T('Free', 'Ħieles')) +
    ' · ' + M.st.sb + '/' + M.st.bb;
  table();
  const u = M.ctx.btn('pk-undo');
  if (u) u.onclick = () => {
    const n = undoPoint();
    if (n < 0) return;
    rollbackTo(n);
    M.finished = false;
    setBet(false);
    const o = M.ctx.root.querySelector('.pt-over'); if (o) o.remove();
    render();
  };
  M.ctx.btn('pk-rules').onclick = () => setRules(!rulesOpen);
  paintRules();   /* remembered open stays open across hands and reloads */
  const nb = M.ctx.btn('pk-new');
  if (nb) nb.onclick = () => {
    P.ui.confirm(M.ctx, {
      head: T('Throw this table in?', 'Twaqqa’ din il-mejda?'),
      why:  T('The chips go back in the rack and you sit down at a fresh table.',
              'Iċ-ċipep jerġgħu lura fil-kaxxa u toqgħod bilqiegħda f’mejda ġdida.'),
      yes:  T('Deal fresh', 'Qassam mill-ġdid'),
      no:   T('No, carry on', 'Le, kompli'),
      go: () => newGame(M.opts)
    });
  };
}

function leave(){
  stopThinking();
  if (M){
    autosave();
    persistNow();
    M.dead = true;
  }
  M = null; UI = null;
}

/* ── the rules card. One game, told once, in both languages, and the
   hand ladder underneath it because a poker rules card without one is
   half a rules card. ─────────────────────────────────────────────── */
function rulesFor(st){
  const sb = st ? st.sb : 10, bb = st ? st.bb : 20;
  const free = !st || st.mode !== 'coins';
  return [
    T('<b>Two cards each</b>, face down, and <b>five in the middle</b> everybody shares. ' +
      'Your hand is the best five out of those seven.',
      '<b>Żewġ karti kull wieħed</b>, bil-wiċċ għal isfel, u <b>ħamsa fin-nofs</b> li ' +
      'jaqsmu lkoll. Idejk hija l-aqwa ħamsa minn dawk is-seba’.'),
    T('The <b>button</b> moves one seat left every hand. The two seats after it post the ' +
      'small blind (' + sb + ') and the big blind (' + bb + ') before a card is dealt.',
      'Il-<b>buttuna</b> timxi siġġu wieħed lejn ix-xellug kull id. Iż-żewġ siġġijiet ta’ ' +
      'warajha jpoġġu l-blind iż-żgħir (' + sb + ') u l-blind il-kbir (' + bb + ') qabel ' +
      'ma titqassam karta.'),
    T('<b>Heads-up it is the other way round</b>: with two players the button posts the ' +
      'small blind and acts first before the flop, then last on every street after it.',
      '<b>Meta tkunu tnejn hija bil-maqlub</b>: il-buttuna tpoġġi l-blind iż-żgħir u tilgħab ' +
      'l-ewwel qabel il-flop, imbagħad l-aħħar f’kull street ta’ wara.'),
    T('Four rounds of betting: <b>PREFLOP</b>, then the <b>FLOP</b> (three cards), the ' +
      '<b>TURN</b> (a fourth) and the <b>RIVER</b> (a fifth).',
      'Erba’ rawnds ta’ mħatri: <b>PREFLOP</b>, imbagħad il-<b>FLOP</b> (tliet karti), ' +
      'it-<b>TURN</b> (ir-raba’) u r-<b>RIVER</b> (il-ħames).'),
    T('On your go: <b>fold</b> and you are out of the hand, <b>check</b> if nobody has bet, ' +
      '<b>call</b> to match, or <b>raise</b>. A raise must be at least as big as the last one.',
      'Meta jmissek: <b>warrab</b> u toħroġ mill-id, <b>għaddi</b> jekk ħadd ma poġġa xejn, ' +
      '<b>sejjaħ</b> biex tilħaq, jew <b>għolli</b>. Kull żieda trid tkun tal-anqas daqs ' +
      'tal-aħħar waħda.'),
    T('<b>All in</b> is legal whenever you like — but an all-in for LESS than a full raise ' +
      'does not reopen the betting to anybody who has already acted. They may call or fold.',
      '<b>Kollox</b> tista’ tagħmlu meta trid — imma kollox għal INQAS minn żieda sħiħa ma ' +
      'jerġax jiftaħ l-imħatri għal min diġà lagħab. Dawk jistgħu biss isejħu jew iwarrbu.'),
    T('If more than one of you is left after the river, you <b>show</b>. Best five wins; ' +
      'identical hands <b>split the pot</b>, and the odd chip goes to the first seat left ' +
      'of the button.',
      'Jekk tibqgħu aktar minn wieħed wara r-river, <b>turu l-karti</b>. L-aqwa ħamsa jirbaħ; ' +
      'idejn identiċi <b>jaqsmu l-pott</b>, u ċ-ċipp żejjed imur lill-ewwel siġġu fuq ix-xellug ' +
      'tal-buttuna.'),
    T('<b>Side pots</b>: if somebody is all in for less than the rest, they can only win the ' +
      'part of the pot they actually paid into. Everything above it is fought over by the ' +
      'others.',
      '<b>Potts tal-ġenb</b>: jekk xi ħadd imur kollox għal inqas mill-oħrajn, jista’ jirbaħ ' +
      'biss il-parti tal-pott li ħallas fiha. Kull ma hu fuqha jiġġieldu għalih l-oħrajn.'),
    T('The <b>ace is high</b> — and also low, but only in the smallest straight there is, ' +
      'A-2-3-4-5. It never wraps: Q-K-A-2-3 is nothing at all.',
      'L-<b>ass hu l-ogħla</b> — u anke l-inqas, imma biss fl-iżgħar sekwenza li hemm, ' +
      'A-2-3-4-5. Qatt ma jdur: Q-K-A-2-3 mhi xejn.'),
    free
      ? T('<b>These chips are the table’s, not yours.</b> They exist while this table does ' +
          'and nothing here touches your KARTI coins.',
          '<b>Dawn iċ-ċipep huma tal-mejda, mhux tiegħek.</b> Jeżistu sakemm teżisti din ' +
          'il-mejda u xejn hawn ma jmiss il-muniti KARTI tiegħek.')
      : T('<b>These are your KARTI coins.</b> The buy-in came off when you sat down; whatever ' +
          'is in front of you goes back on when the table breaks up.',
          '<b>Dawn huma l-muniti KARTI tiegħek.</b> Il-buy-in tneħħa meta poġġejt bilqiegħda; ' +
          'kull ma jkollok quddiemek jerġa’ lura meta tinħall il-mejda.'),
    T('The table ends when one seat has every chip — or when you have none left to post a ' +
      'blind with.',
      'Il-mejda tispiċċa meta siġġu wieħed ikollu ċ-ċipep kollha — jew meta ma jibqagħlekx ' +
      'biex tpoġġi blind.')
  ];
}
/* the ladder, best first. Table rather than a list because that is
   what it is: a ranking, and a reader wants to scan it. */
function ladderHTML(){
  const rows = [
    [T('Straight flush', 'Sekwenza tal-istess kulur'), T('five in a row, all one suit', 'ħamsa wara xulxin, kollha l-istess kulur')],
    [T('Four of a kind', 'Erbgħa l-istess'),           T('all four of one rank', 'l-erbgħa kollha tal-istess valur')],
    [T('Full house', 'Tlieta u par'),                  T('three of one, two of another', 'tlieta ta’ waħda, tnejn ta’ oħra')],
    [T('Flush', 'Kulur'),                              T('five of one suit', 'ħamsa tal-istess kulur')],
    [T('Straight', 'Sekwenza'),                        T('five in a row, any suits', 'ħamsa wara xulxin, kwalunkwe kulur')],
    [T('Three of a kind', 'Tlieta l-istess'),          T('three of one rank', 'tlieta tal-istess valur')],
    [T('Two pair', 'Żewġ pari'),                       T('two pairs', 'żewġ pari')],
    [T('Pair', 'Par'),                                 T('two of one rank', 'tnejn tal-istess valur')],
    [T('High card', 'L-ogħla karta'),                  T('none of the above', 'xejn minn ta’ fuq')]
  ];
  return '<table class="pk-ladder">' + rows.map((r, i) =>
    '<tr><td class="k">' + (i + 1) + '</td><td><b>' + esc(r[0]) + '</b> — ' + esc(r[1]) +
    '</td></tr>').join('') + '</table>';
}

/* ── the rules panel: hide and slide, never a wall. State lives in its
   own UI key so it survives games and reloads. ── */
/* THE STANDING RULE: nothing may ever cover the player's own two cards.
   Portrait leaves the 54% CSS cap miles clear of them; a landscape
   phone does not. So the cap is taken off the seat's actual position
   rather than trusting a percentage. */
function clampRules(){
  if (!UI || !UI.rules || !UI.me) return;
  try {
    const hr = UI.me.getBoundingClientRect();
    const rc = UI.root.getBoundingClientRect();
    if (hr.height > 0 && rc.height > 0){
      const room = Math.floor(hr.top - rc.top - 6);
      UI.rules.style.maxHeight =
        Math.min(Math.max(80, room), Math.floor(rc.height * 0.54)) + 'px';
    }
  } catch(e){}
}
window.addEventListener('resize', () => { if (UI && rulesOpen) clampRules(); });

function paintRules(){
  if (!UI || !UI.rules) return;
  clampRules();
  const st = M ? M.st : null;
  UI.rules.querySelector('#pk-rules-t').textContent =
    'POKER — ' + T('the rules', 'ir-regoli');
  UI.rules.querySelector('#pk-rules-b').innerHTML =
    (st && st.book.length
      ? '<div class="pk-tallyh">' + esc(T('This table', 'Din il-mejda')) + '</div>' + tallyRows(st)
      : '') +
    '<ul>' + rulesFor(st).map(r => '<li>' + r + '</li>').join('') + '</ul>' +
    '<div class="pk-tallyh">' + esc(T('What beats what', 'X’jirbaħ lil xiex')) + '</div>' +
    ladderHTML();
  UI.rules.classList.toggle('open', rulesOpen);
  UI.rules.setAttribute('aria-hidden', rulesOpen ? 'false' : 'true');
  const rb = M && M.ctx && M.ctx.btn && M.ctx.btn('pk-rules');
  if (rb) rb.setAttribute('aria-expanded', rulesOpen ? 'true' : 'false');
}
function setRules(open){
  rulesOpen = !!open;
  try { localStorage.setItem(UIKEY + '.rules', rulesOpen ? '1' : '0'); } catch(e){}
  paintRules();
}

/* ═══════════════════════════════════════════════════════════════════
   THE SETUP SHEET — the mode, the seats, the stack, the blinds and the
   machine, with the rules FOLDED SHUT by default: the sheet's job is
   dealing, and the rules are one tap away.

   No pass-the-phone (poker is a hidden hand and eight people cannot
   look away) and no online door — see the note by the Deal button.
   ═══════════════════════════════════════════════════════════════════ */
/* the three houses a table can play, small to deep. The stack is
   quoted in BIG BLINDS as well as chips, because "1000" means nothing
   and "50 big blinds" means everything. */
const HOUSES = [
  { id:'fast', sb:10,  bb:20,  bbs:25,
    en:['Quick', 'Twenty-five big blinds. Somebody is all in by the third hand.'],
    mt:['Ħafifa', 'Ħamsa u għoxrin blind kbir. Sat-tielet id xi ħadd ikun mar kollox.'] },
  { id:'club', sb:10,  bb:20,  bbs:50,
    en:['Club', 'Fifty big blinds. Room to play, and room to be wrong twice.'],
    mt:['Tal-Każin', 'Ħamsin blind kbir. Spazju biex tilgħab, u biex tiżbalja darbtejn.'] },
  { id:'deep', sb:25,  bb:50,  bbs:100,
    en:['Deep', 'A hundred big blinds. The long evening.'],
    mt:['Fonda', 'Mitt blind kbir. Il-lejla twila.'] }
];
const houseOf = id => HOUSES.find(h => h.id === id) || HOUSES[1];

/* ═══════════════════════════════════════════════════════════════════
   THE ENTRY SCREEN — MINIMAL BY DESIGN
   The first thing a player sees is not the settings wall: it is the
   hero, a short line, and the ONE choice this game can honestly offer —
   PLAY WITH AI — plus a How-to-play that slides the rules up. Seats,
   stakes and difficulty live one tap deeper, on the AI setup (below),
   with defaults already chosen so PLAY WITH AI is the fast path.

   NO PLAY-ONLINE BUTTON. Online poker is intentionally not enabled
   (every phone would share one seed and could read every hand), so
   rather than a dead button somebody re-adds next month, a short line
   says why and the game is honestly you-against-the-machine. NO
   pass-the-phone either: poker is a hidden hand.
   ═══════════════════════════════════════════════════════════════════ */
let menuRulesOpen = false;
const MENU_CHEV =
  '<span class="pk-wchev"><svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M9 6l6 6-6 6"/></svg></span>';

function menuRulesSheet(el){
  /* a sliding rules sheet for the menu — the same clean slide-up as the
     in-felt panel (reuses .pk-rules), floated fixed over the menu. */
  let sheet = el.querySelector('#pk-menu-rules');
  if (!sheet){
    sheet = document.createElement('div');
    sheet.className = 'pk-rules pk-menu-rules';
    sheet.id = 'pk-menu-rules';
    sheet.setAttribute('aria-hidden', 'true');
    sheet.innerHTML =
      '<div class="pk-rules-h"><h4>POKER — ' + esc(T('the rules', 'ir-regoli')) + '</h4>' +
        '<button class="pk-rules-x" id="pk-menu-rules-x" aria-label="' +
          esc(T('Put the rules away', 'Warrab ir-regoli')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button></div>' +
      '<div class="pk-rules-b">' +
        '<ul>' + rulesFor(null).map(r => '<li>' + r + '</li>').join('') + '</ul>' +
        '<div class="pk-tallyh">' + esc(T('What beats what', 'X’jirbaħ lil xiex')) + '</div>' +
        ladderHTML() +
      '</div>';
    el.appendChild(sheet);
    sheet.querySelector('#pk-menu-rules-x').addEventListener('click', () => toggleMenuRules(el, false));
  }
  return sheet;
}
function toggleMenuRules(el, open){
  const sheet = menuRulesSheet(el);
  menuRulesOpen = (open == null) ? !menuRulesOpen : !!open;
  sheet.classList.toggle('open', menuRulesOpen);
  sheet.setAttribute('aria-hidden', menuRulesOpen ? 'false' : 'true');
  try { sheet.style.maxHeight = Math.max(180, Math.floor(window.innerHeight * 0.66)) + 'px'; } catch(e){}
  cue(menuRulesOpen ? 'ui.sheet' : 'ui.back', { gain:0.6 }, true);
}

function menu(){
  injectCSS();
  P.show();
  stopThinking(); M = null; UI = null;
  menuRulesOpen = false;
  const el = P.ui.screenEl();

  /* THE IDENTITY PIECE: two cards face down with a stack of chips
     leaning on them, and the five in the middle behind. Decoration
     only — spans, aria-hidden, nothing tappable. The default house's
     blinds sit in the corner cap, same as the old sheet. */
  const H = houseOf(pref().house);
  const mkc = DECK.mk;
  const hero =
    '<div class="pk-hero" aria-hidden="true">' +
      '<span class="pk-hero-in">' +
        '<span class="pk-hero-b">' +
          [mkc(0, 1), mkc(1, 13), mkc(0, 12), mkc(2, 7), mkc(3, 2)].map(f =>
            '<span class="kb-card" style="width:26px;height:36px">' +
            DECK.cardFace(f) + '</span>').join('') +
        '</span>' +
        '<span style="display:flex;align-items:flex-end">' +
          '<span class="pk-hero-h">' +
            '<span class="kb-card" style="width:40px;height:56px">' + DECK.cardBack() + '</span>' +
            '<span class="kb-card" style="width:40px;height:56px">' + DECK.cardBack() + '</span>' +
          '</span>' +
          '<span class="pk-hero-st">' + chip('') + chip('') + chip('') + '</span>' +
        '</span>' +
      '</span>' +
      '<span class="pk-hero-cap">' + H.sb + '/' + H.bb + '</span>' +
    '</div>';

  el.innerHTML =
    '<div class="pt-wrap pk-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="pk-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>POKER</h2>' +
    '</div>' +
    '<div class="scroll">' +
      hero +
      '<p class="blurb">' +
        T('Two cards of your own, five in the middle, and four rounds of finding out who ' +
          'is telling the truth. Best five out of seven takes the pot.',
          'Żewġ karti tiegħek, ħamsa fin-nofs, u erba’ rawnds biex tara min qed jgħid ' +
          'il-verità. L-aqwa ħamsa minn seba’ jieħu l-pott.') +
      '</p>' +

      /* a half-played table comes FIRST, gold, the skarta way */
      (ST.save
        ? '<button class="btn primary" id="pk-res" style="margin:2px 0 10px">' +
          esc(T('Carry on the saved table', 'Kompli l-mejda mħażna')) + '</button>'
        : '') +

      '<div class="pk-modes">' +
        '<button class="pk-way primary" id="pk-m-ai">' +
          '<span class="pk-wi"><svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4M9 4h6"/>' +
            '<circle cx="9.5" cy="13" r="1"/><circle cx="14.5" cy="13" r="1"/></svg></span>' +
          '<span class="pk-wt"><b>' + esc(T('Play with AI', 'Ilgħab kontra l-magna')) + '</b>' +
            '<i>' + esc(T('You against the machine. Straight in.',
                          'Int kontra l-magna. Dritt.')) + '</i></span>' +
          MENU_CHEV +
        '</button>' +
        '<button class="pk-way" id="pk-m-rules">' +
          '<span class="pk-wi"><svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M4 5h9a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H4zM20 5h-9a3 3 0 0 0-3 3"/></svg></span>' +
          '<span class="pk-wt"><b>' + esc(T('How to play', 'Kif tilgħab')) + '</b>' +
            '<i>' + esc(T('The rules, in a minute.', 'Ir-regoli, f’minuta.')) + '</i></span>' +
          MENU_CHEV +
        '</button>' +
      '</div>' +

      /* ONLINE IS OPEN — the relay now deals each seat its own two hole cards
         privately, so no phone can read another's hand (see planDeal / the
         private hook below). Free chips only; coins stay behind
         COINS_MODE_READY. */
      '<div class="pk-modes">' +
        '<button class="pk-way" id="pk-m-online">' +
          '<span class="pk-wi"><svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg></span>' +
          '<span class="pk-wt"><b>' + esc(T('Play online', 'Ilgħab onlajn')) + '</b>' +
            '<i>' + esc(T('A real table, cards dealt in secret. Free chips.',
                          'Mejda vera, il-karti mqassma bil-moħbi. Ċipep b’xejn.')) + '</i></span>' +
          MENU_CHEV +
        '</button>' +
      '</div>' +
      '<div style="height:16px"></div>' +
    '</div></div>';

  el.querySelector('#pk-back').onclick = () => { cue('ui.back', { gain:0.7 }); P.hub(); };
  el.querySelector('#pk-m-ai').onclick = () => { cue('ui.tap', { gain:0.6 }); setupSheet(); };
  const on = el.querySelector('#pk-m-online');
  if (on) on.onclick = () => { cue('ui.tap', { gain:0.6 }); goOnline(); };
  el.querySelector('#pk-m-rules').onclick = () => toggleMenuRules(el, true);
  const rs = el.querySelector('#pk-res');
  if (rs) rs.onclick = () => { if (ST.save) newGame(null, ST.save); };

  /* a tap outside the rules sheet puts it away */
  el.addEventListener('pointerdown', e => {
    if (!menuRulesOpen) return;
    const sheet = el.querySelector('#pk-menu-rules');
    if (sheet && !sheet.contains(e.target)) toggleMenuRules(el, false);
  }, true);
  ensureRelang();
}

function setupSheet(){
  injectCSS();
  P.show();
  stopThinking(); M = null; UI = null;
  const el = P.ui.screenEl();
  const p = pref();
  let seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, p.seats || 4));
  let lvl   = p.lvl || 2;
  let house = houseOf(p.house).id;
  /* the mode is FREE and only FREE while COINS_MODE_READY is off. It is
     read out of the prefs anyway so that a build with the flag on picks
     up whatever the player last chose, instead of silently resetting. */
  let mode  = COINS_MODE_READY ? ((p.mode === 'coins') ? 'coins' : 'free') : 'free';

  function paint(){
    const H = houseOf(house);
    const stack = H.bb * H.bbs;
    const words = h => (window.KARTI_LANG && KARTI_LANG.mt() ? h.mt : h.en);

    /* THE IDENTITY PIECE: two cards face down with a stack of chips
       leaning on them, and the five in the middle behind. Decoration
       only — spans, aria-hidden, nothing tappable. */
    const mkc = DECK.mk;
    const hero =
      '<div class="pk-hero" aria-hidden="true">' +
        '<span class="pk-hero-in">' +
          '<span class="pk-hero-b">' +
            [mkc(0, 1), mkc(1, 13), mkc(0, 12), mkc(2, 7), mkc(3, 2)].map(f =>
              '<span class="kb-card" style="width:26px;height:36px">' +
              DECK.cardFace(f) + '</span>').join('') +
          '</span>' +
          '<span style="display:flex;align-items:flex-end">' +
            '<span class="pk-hero-h">' +
              '<span class="kb-card" style="width:40px;height:56px">' +
                DECK.cardBack() + '</span>' +
              '<span class="kb-card" style="width:40px;height:56px">' +
                DECK.cardBack() + '</span>' +
            '</span>' +
            '<span class="pk-hero-st">' + chip('') + chip('') + chip('') + '</span>' +
          '</span>' +
        '</span>' +
        '<span class="pk-hero-cap">' + H.sb + '/' + H.bb + '</span>' +
      '</div>';

    el.innerHTML =
      '<div class="pt-wrap pk-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="pk-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(T('Play with AI', 'Kontra l-magna')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +
        hero +

        '<div class="tiny pt-lbl">' + esc(T('What is on the table', 'X’hemm fuq il-mejda')) + '</div>' +
        '<div class="pt-opts' + (COINS_MODE_READY ? ' two' : '') + '" id="pk-mode">' +
          '<button class="pt-opt' + (mode === 'free' ? ' on' : '') + '" data-mode="free">' +
            ico('cards') + '<b>' + esc(T('Free — Ħieles', 'Ħieles')) + '</b><i>' +
            esc(T('Table chips. They exist while the table does and nothing here touches ' +
                  'your KARTI coins.',
                  'Ċipep tal-mejda. Jeżistu sakemm teżisti l-mejda u xejn hawn ma jmiss ' +
                  'il-muniti KARTI tiegħek.')) + '</i></button>' +
          (COINS_MODE_READY
            ? '<button class="pt-opt' + (mode === 'coins' ? ' on' : '') + '" data-mode="coins">' +
              ico('coin') + '<b>' + esc(T('KARTI coins', 'Muniti KARTI')) + '</b><i>' +
              esc(T('Your real balance. The buy-in comes off when you sit down.',
                    'Il-bilanċ veru tiegħek. Il-buy-in jitneħħa meta toqgħod bilqiegħda.')) +
              '</i></button>'
            : '') +
        '</div>' +
        (COINS_MODE_READY && mode === 'coins'
          ? '<p class="pk-why">' + esc(T('Your balance: ', 'Il-bilanċ tiegħek: ') +
              coinBalance()) + '</p>'
          : '') +

        '<div class="tiny pt-lbl">' + esc(T('How many at the table', 'Kemm madwar il-mejda')) + '</div>' +
        '<div class="pk-step">' +
          '<button class="pk-rnd" id="pk-s-dn"' + (seats <= E.MIN_SEATS ? ' disabled' : '') +
            ' aria-label="' + esc(T('Fewer players', 'Inqas plejers')) + '">&minus;</button>' +
          '<span class="v">' + seats + '<i>' +
            esc(seats === 2 ? T('heads-up', 'wiċċ imb wiċċ') : T('players', 'plejers')) +
            '</i></span>' +
          '<button class="pk-rnd" id="pk-s-up"' + (seats >= E.MAX_SEATS ? ' disabled' : '') +
            ' aria-label="' + esc(T('More players', 'Aktar plejers')) + '">+</button>' +
        '</div>' +
        (seats === 2
          ? '<p class="pk-why">' + esc(T('Heads-up runs the blinds the other way round: the ' +
              'button posts the small blind and acts first before the flop, then last after ' +
              'it. That is the real rule, not a shortcut.',
              'Wiċċ imb wiċċ il-blinds imorru bil-maqlub: il-buttuna tpoġġi l-blind iż-żgħir ' +
              'u tilgħab l-ewwel qabel il-flop, imbagħad l-aħħar wara. Dik hi r-regola vera, ' +
              'mhux xi qtugħ ta’ triq.')) + '</p>'
          : '') +

        '<div class="tiny pt-lbl">' + esc(T('The stakes', 'Il-kobor tal-logħba')) + '</div>' +
        '<div class="pt-opts" id="pk-house">' + HOUSES.map(h => {
          const w = words(h);
          return '<button class="pt-opt' + (h.id === house ? ' on' : '') + '" data-h="' + h.id + '">' +
            ico(h.id === 'deep' ? 'trophy' : 'coin') + '<b>' + esc(w[0]) + ' — ' +
            h.sb + '/' + h.bb + '</b><i>' + esc(w[1]) + ' ' +
            esc(T('Everyone starts on ', 'Kulħadd jibda b’ ') + (h.bb * h.bbs) + '.') +
            '</i></button>';
        }).join('') + '</div>' +

        '<div class="tiny pt-lbl">' + esc(T('How sharp is the machine', 'Kemm hi taħraq il-magna')) +
        '</div>' +
        '<div class="pt-opts" id="pk-lvl">' + levels().map(o => {
          const w = levelWords(o.level);
          return '<button class="pt-opt' + (o.level === lvl ? ' on' : '') +
            '" data-lvl="' + o.level + '">' +
            ico('diff-' + Math.min(3, o.level)) + '<b>' + esc(w.n) + '</b><i>' +
            esc(w.i) + '</i></button>';
        }).join('') + '</div>' +

        (ST.rec.w + ST.rec.l
          ? '<p class="pt-ledger">' +
            T('Tables so far: <b>' + ST.rec.w + '</b> broken, <b>' + ST.rec.l + '</b> lost.',
              'Mwejjed s’issa: <b>' + ST.rec.w + '</b> rebħin, <b>' + ST.rec.l + '</b> mitlufin.') +
            '</p>'
          : '') +

        '<div class="pt-acts" style="margin-top:18px;display:grid;gap:9px">' +
          '<button class="btn primary" id="pk-go">' +
            esc(T('Deal — you vs ' + (seats - 1) + ' machine' + (seats - 1 === 1 ? '' : 's'),
                  'Qassam — int kontra ' + (seats - 1) + ' magn' + (seats - 1 === 1 ? 'a' : 'i'))) +
          '</button>' +
        '</div>' +

        /* ── the rules, FOLDED. Closed by default: the sheet's job is
           dealing, and eleven lines printed every single time is a wall
           nobody reads twice. ── */
        '<div class="kb-rules" style="margin:16px 2px 20px;padding:2px 14px;border-radius:14px;' +
          'background:rgba(255,255,255,.04);border:1px solid var(--line)">' +
          '<button type="button" class="pk-fold-h" id="pk-srules-h" aria-controls="pk-srules-b"' +
            ' aria-expanded="' + (setupOpen ? 'true' : 'false') + '">' +
            '<span><b>' + esc(T('The rules, as this table plays them',
                                'Ir-regoli, kif tilgħabhom din il-mejda')) + '</b>' +
            '<i id="pk-srules-i">' + esc(setupOpen
                ? T('Tap to fold them away.', 'Agħfas biex twarrabhom.')
                : T('Tap to read them.', 'Agħfas biex taqrahom.')) + '</i></span>' +
            '<em aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></em>' +
          '</button>' +
          '<div class="pk-fold-b' + (setupOpen ? ' open' : '') + '" id="pk-srules-b">' +
            '<div class="pk-fold-i"><div class="pk-fold-c">' +
              '<ul style="margin:6px 0 10px;padding:0">' +
              rulesFor({ sb: H.sb, bb: H.bb, mode }).map(r =>
                '<li style="font-size:12px;line-height:1.65;color:var(--dim);' +
                'margin:0 0 6px 16px">' + r + '</li>').join('') +
              '</ul>' +
              '<div style="font:900 10px/1 var(--disp);letter-spacing:.11em;' +
                'text-transform:uppercase;color:var(--dim);margin:2px 0 4px">' +
                esc(T('What beats what', 'X’jirbaħ lil xiex')) + '</div>' +
              ladderHTML() +
            '</div></div></div>' +
        '</div>' +
      '</div></div>';

    el.querySelector('#pk-back').onclick = () => { cue('ui.back', { gain:0.7 }); menu(); };
    el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
      mode = b.dataset.mode === 'coins' ? 'coins' : 'free'; paint(); });
    el.querySelector('#pk-s-dn').onclick = () => {
      if (seats > E.MIN_SEATS){ seats--; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    el.querySelector('#pk-s-up').onclick = () => {
      if (seats < E.MAX_SEATS){ seats++; cue('ui.tap', { gain:0.8 }, true); paint(); } };
    el.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { house = b.dataset.h; paint(); });
    el.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { lvl = +b.dataset.lvl; paint(); });
    el.querySelector('#pk-go').onclick = () => {
      const HH = houseOf(house);
      pref({ seats, lvl, house, mode });
      /* the coins door refuses politely rather than dealing a table the
         player cannot pay for. Unreachable while the flag is off. */
      if (COINS_MODE_READY && mode === 'coins' && coinBalance() < HH.bb * HH.bbs){
        cue('ui.denied', { gain: 0.9 }, true);
        if (K.toast) K.toast('⚠ ' + T('Not enough coins for that buy-in.',
                                      'M’għandekx biżżejjed muniti għal dak il-buy-in.'));
        return;
      }
      newGame({ seats, humans:1, lvl, mode,
                stack: HH.bb * HH.bbs, sb: HH.sb, bb: HH.bb, deal:'seed' });
    };
    /* the fold toggles WITHOUT repainting, so the slide actually slides */
    const sh = el.querySelector('#pk-srules-h');
    if (sh) sh.onclick = () => {
      setSetupOpen(!setupOpen);
      sh.setAttribute('aria-expanded', setupOpen ? 'true' : 'false');
      const bb2 = el.querySelector('#pk-srules-b');
      if (bb2) bb2.classList.toggle('open', setupOpen);
      const hint = el.querySelector('#pk-srules-i');
      if (hint) hint.textContent = setupOpen
        ? T('Tap to fold them away.', 'Agħfas biex twarrabhom.')
        : T('Tap to read them.', 'Agħfas biex taqrahom.');
      cue(setupOpen ? 'ui.sheet' : 'ui.back', { gain: 0.8 }, true);
    };
  }
  paint();
  ensureRelang();
}

/* the screens repaint themselves when the language switch is thrown —
   only what we own, and only what is actually on screen. Registered once;
   it dispatches to whichever of our screens is showing (entry menu, the
   AI setup, or a live felt). */
function ensureRelang(){
  if (!window.KARTI_LANG || !KARTI_LANG.onChange || ensureRelang._sub) return;
  ensureRelang._sub = KARTI_LANG.onChange(() => {
    try {
      if (M && UI){ render(); paintRules(); return; }
      const el = P.ui.screenEl();
      if (!el || !el.isConnected) return;
      if (el.querySelector('#pk-go')) setupSheet();
      else if (el.querySelector('.pk-modes')) menu();
    } catch(e){}
  });
}

/* ═══════════════════════════════════════════════════════════════════
   ONLINE — REAL TABLES, WITH THE DEAL KEPT SECRET BY THE WIRE
   ───────────────────────────────────────────────────────────────────
   The relay deals each seat its own two hole cards PRIVATELY (js/mp.js's
   planDeal → the relay's {t:'mine'} push): the shared seed is never
   trusted with a hole card. This file's job is to (1) tell the lobby what
   pool to have dealt (planDeal) and (2) take this seat's own cards when
   they arrive and feed the engine's DEALERS.private (the `private` hook),
   so the felt shows only our two cards and every opponent's stays face
   down. Free chips only — coins are still behind COINS_MODE_READY, which
   also owns per-street board delivery and the showdown reveal.

   THE COMMUNITY CARDS are public by nature — they get turned face up for
   everyone — so they ride the shared seed, exactly as skarta's stock does.
   Only the hole cards are secret, and only they come down the private
   channel. Deriving the run from the seed keeps every phone's board
   identical without a card crossing the wire.

   The shape mirrors js/rummy-ui.js: local moves go out through the onMove
   feed, remote moves come in through apply(), the table's own beats
   (turning a card, paying a pot) are replayed locally off the same seed. */
let NET = null;

/* what the shared lobby asks the relay to deal: a POOL and how many go to
   each seat. The pool is the 52 card ids; the relay hands each seat TWO of
   them, privately. The seed is not needed here — the community (public)
   comes off the broadcast seed later; only the holes are dealt privately. */
function planDeal(opts){
  const seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, (opts && opts.seats | 0) || 2));
  void seats;                         /* the relay knows the seat count itself */
  const items = [];
  for (let i = 0; i < 52; i++) items.push(i);
  return { items, each: 2 };          /* two hole cards a seat */
}

/* the community cards for THIS hand, off the shared broadcast seed. They
   are public, so deriving them from the seed is honest: every phone lands
   on the same five without a card crossing the wire. */
function communityFromSeed(opts, seed){
  try {
    const st = E.deal(Object.assign({}, opts, { deal:'seed' }), seed >>> 0);
    return Array.isArray(st.run) ? st.run.slice(0, 5) : [];
  } catch(e){ return []; }
}

function onlineStart(cfg){
  cfg = cfg || {};
  const chairs = (cfg.seats || []).filter(Boolean);
  const n = chairs.length;
  if (n < E.MIN_SEATS || n > E.MAX_SEATS)
    throw new Error('POKER: seats ' + E.MIN_SEATS + ' to ' + E.MAX_SEATS + ', not ' + n);

  /* room seat → game seat (poker deals to 0..n-1 in order) */
  const toGame = {}, toRoom = [];
  chairs.forEach((s, g) => {
    const room = (typeof s.seat === 'number') ? s.seat : g;
    toGame[room] = g; toRoom[g] = room;
  });
  const meG = (toGame[cfg.you] !== undefined) ? toGame[cfg.you] : 0;
  const iAmHost = (cfg.you === (cfg.host | 0));
  const lvl = (chairs.map(s => s && s.level).find(v => v)) || 2;
  const H = houseOf(pref().house);

  stopThinking();
  if (M){ try { leave(); } catch(e){} }

  /* Build the match in PRIVATE mode from the off. No holes are known yet —
     they arrive on the private hook — so every seat starts face down,
     which is exactly right: this client knows nobody's cards until the
     relay tells it its own. The community is the seed's, and public. */
  const opts = { seats: n, humans: n, lvl, mode: 'free', deal: 'private',
                 stack: H.bb * H.bbs, sb: H.sb, bb: H.bb,
                 given: { holes: {}, run: communityFromSeed(
                          { seats: n, sb: H.sb, bb: H.bb, stack: H.bb * H.bbs },
                          cfg.seed >>> 0) } };
  const m = startMatch(opts, cfg.seed >>> 0);
  if (!m) throw new Error('POKER would not deal ' + n + ' seats');
  M.online = { toGame, toRoom, meG, seed: cfg.seed >>> 0, run: opts.given.run };
  M.meta = chairs.map((s, g) => ({
    name: String(s.name || ('Player ' + (g + 1))).slice(0, 14),
    own:  g === meG ? 'me' : (s.kind === 'cpu' ? 'ai' : 'net'),
    lvl:  s.level || lvl
  }));
  applyMeta();

  NET = Object.assign({}, cfg.net, { host: iAmHost, toGame, toRoom, me: meG });
  M.net = NET;
  M.finished = false;
  injectCSS();
  P.show();
  openBoard(() => { const nx = NET; leave(); if (nx && nx.onLeave) nx.onLeave(); else P.hub(); });
  render();
  cue('game.start', { gain: 0.9 }, true);
  return snapshot();
}

/* THE PRIVATE HAND. The relay pushed THIS seat, and only this seat, its
   own two hole cards (mp.js routes {t:'mine'} here). Re-deal the match with
   them injected under our game seat — opponents stay null (face down) — and
   repaint. This is the ONLY place this client learns a hole card, and it is
   its own. Never re-broadcast; the relay already kept the secret. */
function onlinePrivate(d){
  if (!M || M.dead || !M.online) return;
  if (!Array.isArray(d) || d.length < 2) return;
  const me = M.online.meG;
  const holes = {};
  holes[me] = [d[0] | 0, d[1] | 0];
  const opts = Object.assign({}, M.opts, {
    deal: 'private',
    given: { holes, run: (M.online.run || []).slice() }
  });
  M.opts = opts;
  M.log = [];                        /* a fresh hand from the private deal */
  M.st = buildState(M.opts, M.seed, M.log);
  applyMeta();
  M.recorded = M.st.book.length;
  render();
  cue('card.deal', { gain: 0.7 }, true);
}

function onlineRemote(seat, wire){
  if (!M || M.dead || !NET) return null;
  const g = NET.toGame[seat];
  if (g === undefined) return { ok:false, why:'a move from a chair not at this table' };
  const mv = E.decWire(wire);
  if (!mv) return { ok:false, why:'a move this table does not know how to make' };
  if (mv.t === 'quit'){ doQuit(g); render(); return null; }
  /* flush the table's own beats first — the wire outruns a timer */
  let guard = 0;
  while (E.turn(M.st) === -1 && guard++ < 12){
    const opts = E.legal(M.st, -1);
    if (!opts.length) break;
    if (!doMove(-1, opts[0], 'auto').ok) break;
  }
  mv.seat = g;
  const r = doMove(g, mv, 'net');
  if (!r.ok){
    const who = (M.st.seats[g] ? M.st.seats[g].name : 'that chair');
    return { ok:false, why: String(r.err || 'refused') + ' from ' + who };
  }
  render();
  return null;
}

/* a seat walking out: fold it and pass the turn. Reuses the engine's own
   fold, which is the honest way to remove a live hand mid-street. */
function doQuit(g){
  if (!M || M.dead || E.over(M.st)) return;
  const s = M.st.seats[g];
  if (!s || s.out || s.folded) return;
  if (E.turn(M.st) === g){
    const fold = (E.legal(M.st, g) || []).find(x => x.t === 'fold');
    if (fold){ fold.seat = g; doMove(g, fold, 'net'); }
  } else { s.gone = true; }
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
    head: tone === 'cheat' ? T('No deal', 'L-ebda qsim') : T('Cut off', 'Maqtugħ'),
    why: why || T('The table stopped.', 'Il-mejda waqfet.'),
    quip: T('Nothing was counted. Nobody loses a hand over a dropped line.',
            'Xejn ma ġie magħdud. Ħadd ma jitlef id fuq linja maqtugħa.'),
    buttons: [{ label: T('Back to the rooms', 'Lura lejn il-kmamar'), icon:'back', cls:'primary',
                go: () => { const nx = NET; leave(); if (nx && nx.onLeave) nx.onLeave(); else P.hub(); } }]
  });
}

const NET_HOOKS = {
  live:   () => !!(M && !M.dead && !E.over(M.st)),
  phase:  () => !M ? 'idle' : (E.over(M.st) ? 'over' : 'play'),
  seed:   () => (M ? M.seed : null),
  gameId: () => (M ? 'poker' : null),
  turn:   () => (M && NET) ? (NET.toRoom[E.turn(M.st)] != null ? NET.toRoom[E.turn(M.st)] : -1) : -1,
  over:   () => (M ? E.over(M.st) : null),
  moveCount: () => (M ? M.log.length : 0),
  /* local moves go out; remote and table beats never echo back onto the wire.
     A local move fires through moveSubs (see doMove); this forwards only the
     ones a person here made, encoded, stamped with the ROOM seat. */
  onMove: fn => {
    const f = info => {
      if (!M || M.dead || !NET || !info) return;
      if (info.src === 'net' || info.src === 'auto') return;   /* not ours to send */
      const w = E.encWire(info.move);
      if (!w) return;                                          /* table beats: null */
      const room = NET.toRoom[info.seat];
      fn(w, { seat: (room == null ? info.seat : room), src: info.src });
    };
    moveSubs.push(f);
    return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); };
  },
  /* the relay's per-seat private deal for this table */
  private: (d /*, mates */) => onlinePrivate(d),
  apply: (seat, wire) => onlineRemote(seat, wire),
  seatGone: seat => {
    if (!M || M.dead || !NET) return;
    const g = NET.toGame[seat];
    if (g === undefined) return;
    doQuit(g); render();
  }
};

P.online = P.online || {};
P.online.poker = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  planDeal,
  live: () => NET_HOOKS.live(),
  hooks: NET_HOOKS
};

/* the online door — through the shared lobby's openFor(), exactly as
   rummy/skarta/gin do: take the poker table waiting longest, or open a
   fresh one, and keep "a private room" one tap away. */
function goOnline(){
  const MPX = window.KARTI_MP;
  if (!MPX || !MPX.MP){
    if (K && K.toast) K.toast('⚠ ' + T('Online is not available.', 'Onlajn mhux disponibbli.'));
    return;
  }
  try { MPX.mpLeave && MPX.mpLeave(); } catch(e){}
  if (MPX.openFor){ MPX.openFor('poker'); return; }
  MPX.MP.wantGame = 'poker';
  try { K && K.go && K.go('mp'); } catch(e){}
  try { MPX.mpScreen && MPX.mpScreen(); } catch(e){}
  try { MPX.start && MPX.start('create', null, null, false, 'poker'); } catch(e){}
}

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — what js/mp.js reads before a card exists.

   Online is OPEN now: the relay deals each seat its own two cards
   privately, so canStart() lets a free-chip table go. Coins stay shut
   behind COINS_MODE_READY (per-street board delivery + showdown reveal).
   ═══════════════════════════════════════════════════════════════════ */

R.lobby = {
  id:'poker',
  name:'Poker',
  mt:'Il-Poker',
  minSeats: E.MIN_SEATS,
  maxSeats: E.MAX_SEATS,
  levels: levels(),
  defaultLevel: 2,
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu')
    ? Object.assign({}, seat, { ready:true }) : seat,
  /* ONLINE IS OPEN (free chips). The deal is private now, so a table can go
     as soon as everybody is ready. The unready are named, exactly as rummy
     does it, so the host knows who to shout at rather than reading the seat
     count as the blocker. Coins remain shut behind COINS_MODE_READY. */
  canStart(seatList){
    const list = (seatList || []).filter(Boolean);
    const n = list.length;
    /* NOT OPEN ONLINE YET. The relay deals privately ONCE, at start — so the
       first hand is genuinely secret (proven), but a poker table is many
       hands and hand 2 would come back face-down. It needs a fresh private
       deal PER HAND (the same relay work coins mode needs). The plumbing and
       the first-deal secrecy are in and proven; this is the completing step.
       Play against the machine until then. */
    return { ok:false, why: T(
      'Poker online is nearly there — each hand needs its own secret deal, coming next. ' +
      'Play against the machine for now.',
      'Il-poker onlajn kważi lest — kull id trid it-tqassim sigriet tagħha, ġej. ' +
      'Ilgħab kontra l-magna għalissa.') };
    if (n < E.MIN_SEATS)
      return { ok:false, why: T('Poker needs two at the table.',
                                'Il-poker irid tnejn fuq il-mejda.') };
    if (n > E.MAX_SEATS)
      return { ok:false, why: T('Eight is the table.', 'Tmienja hija l-mejda.') };
    const un = list.filter(x => x && x.kind !== 'cpu' && !x.ready);
    if (un.length)
      return { ok:false,
               why:(un.length <= 2
                     ? un.map(s => s.name || 'Somebody').join(' and ') + ' ' +
                       (un.length > 1 ? 'have' : 'has')
                     : un.length + ' people have') +
                   ' not tapped ready yet. The empty chairs never hold a deal up.' };
    return { ok:true, why:'' };
  },
  /* the shared lobby steers poker with no variant; there is only one game.
     start() delegates to the online runner so a caller that reaches the
     lobby's start (rather than net.start) still deals a private table. */
  start(seatsList, opts){ return onlineStart({
    seats: seatsList, seed: opts && opts.seed, you: 0, host: 0,
    net: (opts && opts.net) || {} }); },
  rulesHTML: () =>
    '<p>' + T('Two cards each, five in the middle, four rounds of betting — PREFLOP, FLOP, ' +
      'TURN, RIVER. Best five out of seven takes the pot; identical hands split it.',
      'Żewġ karti kull wieħed, ħamsa fin-nofs, erba’ rawnds ta’ mħatri — PREFLOP, FLOP, TURN, ' +
      'RIVER. L-aqwa ħamsa minn seba’ jieħu l-pott; idejn identiċi jaqsmuh.') + '</p>' +
    '<p>' + T('Two to eight players. Blinds, a button that moves every hand, and proper side ' +
      'pots when somebody is all in for less than the rest.',
      'Minn tnejn sa tmienja. Blinds, buttuna li timxi kull id, u potts tal-ġenb kif suppost ' +
      'meta xi ħadd imur kollox għal inqas mill-oħrajn.') + '</p>' +
    '<p>' + T('Online deals each seat its own two cards in secret — free chips only.',
              'Onlajn iqassam lil kull siġġu ż-żewġ karti tiegħu bil-moħbi — ċipep b’xejn biss.') +
    '</p>',
  blurb: T('Two cards, five in the middle, and whoever is left standing takes it.',
           'Żewġ karti, ħamsa fin-nofs, u min jibqa’ wieqaf jieħu kollox.'),
  myName(){
    try {
      const n = K.displayName && K.displayName();
      if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
        return String(n).trim().slice(0, 14);
    } catch(e){}
    return T('You', 'Int');
  },
  wire: { fields: E.WIRE_FIELDS },
  takeback: false
};

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF — one tile behind the PLAYING CARDS door, alongside
   bixkla, briscola, sette, cheat, rummy and gin. register() replaces
   by id, so party.js wiring the same descriptor again costs nothing.
   `kind:'deck'` is what puts it behind that door (js/party.js's
   shelfOf) without editing party.js's STANDARD_PACK list.
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'poker', order:37, kind:'deck', name:'POKER', mt:'Il-Poker',
  sprite:'pk-t-poker', icon:'cards', status:'live',
  get tag(){
    return T('Two cards of your own, five in the middle, and four rounds of finding out who ' +
             'is bluffing. Two to eight, table chips only.',
             'Żewġ karti tiegħek, ħamsa fin-nofs, u erba’ rawnds biex tara min qed jibblaffja. ' +
             'Minn tnejn sa tmienja, ċipep tal-mejda biss.') +
           (ST.save ? ' ' + T('There is a table of this half-played.',
                              'Hemm mejda minn din nofsha milgħuba.') : '');
  },
  open: () => menu(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: levels(),
  rulesHTML: () => R.lobby.rulesHTML()
};
R.shelfTile = TILE;
R.open = () => menu();
R.close = () => { leave(); P.hub(); };
P.register(TILE);

/* the shelf mark must exist before the shelf is painted */
if (document.body) injectDefs();
else document.addEventListener('DOMContentLoaded', injectDefs);

/* ── test hooks — inert unless the page is opened with ?pttest ──── */
try {
  if (String(location.search).indexOf('pttest') >= 0){
    window.__PK_TEST = {
      badAI: 0,
      M: () => M,
      st: () => (M ? M.st : null),
      engine: E,
      start: opts => { newGame(opts || { seats:4, humans:1, lvl:2, mode:'free',
                                         stack:1000, sb:10, bb:20 }); return true; },
      startSeed: (opts, seed) => {
        newGame(null, { v:SAVE_V, gid:'poker', opts, seed, log:[] }); return true; },
      fast: on => { FAST = !!on; },
      doMove, rollbackTo, undoPoint, snapshot,
      render, setup: setupSheet, menu, toggleMenuRules: o => {
        try { toggleMenuRules(P.ui.screenEl(), o); } catch(e){} },
      menuRulesOpen: () => menuRulesOpen,
      betPanel: () => (UI ? UI.bet : null),
      setBet, clampRaise,
      raiseTo: v => { if (M) M.tmp.raiseTo = clampRaise(v); paintBetPanel(); },
      rules: () => rulesOpen,
      setRules,
      tally: () => (M ? E.tally(M.st) : null),
      store: () => ST,
      coinsReady: COINS_MODE_READY,
      handName
    };
  }
} catch(e){}

})();

/* ═══════════════════════════════════════════════════════════════════
   POKER — THE KIT SHELF (purely cosmetic, always)
   Felts, card backs and a table-edge trim through KARTI_XP.register(),
   scoped under #app #scr-party .pk-table so the menu hero and every
   other game keep their own clothes. The face-down card is klabb's
   shared SVG back, whose lattice is a <pattern> — patterns cannot be
   recoloured from CSS, so a hidden defs-only svg (#pkx-pats) restates
   the exact stock geometry (10x10, rotate(45), 2.4-wide rails) once
   per mood, and one attribute-selector rule points the back's fill at
   it. The edge rect and the cross are presentation attributes, which
   plain CSS fill/stroke beats. klabb.js itself is never touched.
   Unequipped = empty sheet = stock. The style node is re-appended on
   every change so it lands after pk-runtime-css.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* a/b/c: the three stops of the stock radial, restated in a mood */
var FELTS = {
  'poker.felt.kazin':  { a:'#1E7A50', b:'#155238', c:'#08281B' },
  'poker.felt.borgo':  { a:'#8A3348', b:'#521C2A', c:'#2C0D16' },
  'poker.felt.tabakk': { a:'#8A6234', b:'#54381C', c:'#2B1B0D' },
  'poker.felt.lejl':   { a:'#38405C', b:'#1B2130', c:'#0A0D16' },
  /* ── MALTESE SUMMER ── the water off Għar Lapsi at four in the
     afternoon. Nobody believes the middle stop, and it is the real one. */
  'poker.felt.lapsi':  { a:'#6FE3D6', b:'#1B9FB4', c:'#0A5C7C' }
};
/* pat: the pattern id suffix; base/line: the lattice; edge: the inner
   rect's stroke; cross: the Maltese cross */
var BACKS = {
  'poker.back.kazin': { pat:'kazin', base:'#134A2E', line:'#1E6B41', edge:'#FFD98A', cross:'#FFD98A' },
  'poker.back.linka': { pat:'linka', base:'#15171E', line:'#2B303E', edge:'#C9D2E4', cross:'#C9D2E4' },
  'poker.back.demm':  { pat:'demm',  base:'#6B1421', line:'#9A2634', edge:'#F6C9CE', cross:'#F6C9CE' },
  'poker.back.ivorju':{ pat:'ivorju',base:'#E8DCC2', line:'#CFBF9C', edge:'#7A5A22', cross:'#7A5A22' },
  'poker.back.deheb': { pat:'deheb', base:'#7E5A11', line:'#B8891F', edge:'#FFF7E4', cross:'#FFF7E4' },
  /* ── MALTESE SUMMER ── the kiosk umbrella, faded exactly this much */
  'poker.back.umbrel':{ pat:'umbrel',base:'#F07A5A', line:'#FFEFD8', edge:'#8E2E1C', cross:'#8E2E1C' }
};
var TRIMS = {
  'poker.trim.deheb': { e:'rgba(255,197,66,.5)',  r:'rgba(255,197,66,.26)' },
  'poker.trim.injam': { e:'rgba(150,96,46,.75)',  r:'rgba(90,58,30,.5)' }
};

/* the hidden pattern shelf — every mood's lattice, defined once, in
   klabb's exact geometry so only the colours differ */
function pats(){
  if (document.getElementById('pkx-pats') || !document.body) return;
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'pkx-pats';
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('style',
    'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  var s = '', k;
  for (k in BACKS) if (Object.prototype.hasOwnProperty.call(BACKS, k)){
    var b = BACKS[k];
    s += '<pattern id="pkx-lat-' + b.pat + '" width="10" height="10" ' +
         'patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
         '<rect width="10" height="10" fill="' + b.base + '"/>' +
         '<path d="M0 0H10M0 5H10" stroke="' + b.line + '" stroke-width="2.4"/>' +
         '</pattern>';
  }
  svg.innerHTML = s;
  document.body.appendChild(svg);
}

function sheet(){
  var st = document.getElementById('pkx-kit-css');
  if (!st){ st = document.createElement('style'); st.id = 'pkx-kit-css'; }
  /* appendChild MOVES an existing node to the end — always after the
     game's own sheet, and #app out-specifies it besides */
  document.head.appendChild(st);
  return st;
}

function apply(){
  var XP = window.KARTI_XP;
  if (!XP) return;
  pats();
  var css = '';
  var f = FELTS[XP.equipped('felt', 'poker') || ''];
  if (f) css += '#app #scr-party .pk-table{background:radial-gradient(' +
    '120% 85% at 50% 34%,' + f.a + ' 0%,' + f.b + ' 46%,' + f.c + ' 100%)}';
  var b = BACKS[XP.equipped('back', 'poker') || ''];
  if (b) css +=
    '#app #scr-party .pk-table .kb-back rect[fill^="url"]{fill:url(#pkx-lat-' + b.pat + ')}' +
    '#app #scr-party .pk-table .kb-back rect[stroke="#FFD98A"]{stroke:' + b.edge + '}' +
    '#app #scr-party .pk-table .kb-back use{fill:' + b.cross + '}';
  var t = TRIMS[XP.equipped('trim', 'poker') || ''];
  /* the ring joins the felt's stock depth shadows instead of replacing
     them — losing the inner darkening would flatten the whole table */
  if (t) css += '#app #scr-party .pk-table{border-color:' + t.e +
    ';box-shadow:inset 0 0 0 1px ' + t.r +
    ',inset 0 2px 0 rgba(255,255,255,.07),inset 0 -18px 34px rgba(0,0,0,.42)}';
  sheet().textContent = css;
}

var STOCK_FELT = 'radial-gradient(120% 85% at 50% 34%,#1E7A50 0%,#155238 46%,#08281B 100%)';

function feltPv(t){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style', 'display:flex;align-items:center;justify-content:center;' +
      'width:' + s + 'px;height:' + s + 'px');
    el.innerHTML = '<span style="display:block;width:' + s + 'px;height:' +
      Math.round(s * .7) + 'px;border-radius:10px;border:1px solid rgba(0,0,0,.55);' +
      'box-sizing:border-box;background:radial-gradient(120% 85% at 50% 34%,' +
      t.a + ' 0%,' + t.b + ' 46%,' + t.c + ' 100%)"></span>';
    return el;
  };
}

/* the back as CSS: the lattice as a repeating 45-degree gradient, the
   cross as a rotated square outline — a stand-in, but never blank */
function backPv(t){
  return function(size){
    var s = size || 62, h = Math.round(s * .8), w = Math.round(h * .72);
    var c = Math.round(w * .34), m = -Math.round(c / 2);
    var el = document.createElement('span');
    el.setAttribute('style', 'display:flex;align-items:center;justify-content:center;' +
      'width:' + s + 'px;height:' + s + 'px');
    el.innerHTML = '<span style="position:relative;display:block;width:' + w + 'px;height:' +
      h + 'px;border-radius:5px;background:repeating-linear-gradient(45deg,' +
      t.base + ' 0 3.5px,' + t.line + ' 3.5px 5.5px);' +
      'box-shadow:inset 0 0 0 2px ' + t.edge + ',0 1px 3px rgba(0,0,0,.5)">' +
      '<span style="position:absolute;left:50%;top:50%;width:' + c + 'px;height:' + c + 'px;' +
      'margin:' + m + 'px 0 0 ' + m + 'px;border:2px solid ' + t.cross + ';' +
      'box-sizing:border-box;transform:rotate(45deg)"></span></span>';
    return el;
  };
}

function trimPv(t){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style', 'display:flex;align-items:center;justify-content:center;' +
      'width:' + s + 'px;height:' + s + 'px');
    el.innerHTML = '<span style="display:block;width:' + s + 'px;height:' +
      Math.round(s * .7) + 'px;border-radius:10px;box-sizing:border-box;' +
      'border:2px solid ' + t.e + ';box-shadow:inset 0 0 0 2px ' + t.r + ';' +
      'background:' + STOCK_FELT + '"></span>';
    return el;
  };
}

function boot(tries){
  var XP = window.KARTI_XP;
  if (!XP || !document.body){
    if (tries < 40) setTimeout(function(){ boot(tries + 1); }, 500);
    return;
  }
  var KIT = XP.forGame('poker');
  KIT.register([
    { slot:'felt', id:'poker.felt.kazin', level:0,  name:'Feltru tal-Każin',
      blurb:'Club green under a bare bulb. Where every bad decision on this island was taken.', preview:feltPv(FELTS['poker.felt.kazin']) },
    { slot:'felt', id:'poker.felt.borgo', level:8,  name:'Borgo Bordò',
      blurb:'Deep wine cloth. Losing on it feels almost ceremonial.', preview:feltPv(FELTS['poker.felt.borgo']) },
    { slot:'felt', id:'poker.felt.tabakk',level:18, name:'Tabakk u Kafè',
      blurb:'Tobacco brown, coffee rings included at no extra charge.', preview:feltPv(FELTS['poker.felt.tabakk']) },
    { slot:'felt', id:'poker.felt.lejl',  level:33, name:'Wara Nofsillejl',
      blurb:'The colour a room goes when nobody has mentioned the time in two hours.', preview:feltPv(FELTS['poker.felt.lejl']) },

    { slot:'back', id:'poker.back.kazin', level:0,  name:'Aħdar tal-Każin',
      blurb:'Club green, gold cross. The house pack, and the house never explains itself.', preview:backPv(BACKS['poker.back.kazin']) },
    { slot:'back', id:'poker.back.linka', level:6,  name:'Iswed u Fidda',
      blurb:'Black lattice, silver cross. Gives away exactly nothing, which is the idea.', preview:backPv(BACKS['poker.back.linka']) },
    { slot:'back', id:'poker.back.demm',  level:14, name:'Aħmar Skur',
      blurb:'Dark red. Traditional, and slightly threatening if you look at it too long.', preview:backPv(BACKS['poker.back.demm']) },
    { slot:'back', id:'poker.back.ivorju',level:27, name:'Ivorju Antik',
      blurb:'Old ivory and brown. The pack from the drawer nobody is allowed to open.', preview:backPv(BACKS['poker.back.ivorju']) },
    { slot:'back', id:'poker.back.deheb', level:44, name:'Deheb u Abjad',
      blurb:'Gold and white. The deck is dressed better than anyone holding it.', preview:backPv(BACKS['poker.back.deheb']) },

    { slot:'trim', id:'poker.trim.deheb', level:22, name:'Xifer Indurat',
      blurb:'A gilt rail round the table, purely to intimidate.', preview:trimPv(TRIMS['poker.trim.deheb']) },
    { slot:'trim', id:'poker.trim.injam', level:38, name:'Xifer tal-Injam',
      blurb:'Worn wood, polished by forearms. Nothing says regular like this edge.', preview:trimPv(TRIMS['poker.trim.injam']) },

    /* ── MALTESE SUMMER ── same shelves, one shared tag */
    { slot:'felt', id:'poker.felt.lapsi', level:5,  set:'summer', name:'Ilma ta’ Għar Lapsi',
      blurb:'Turquoise you would not believe from a photograph. Bluffing in swimming shorts.', preview:feltPv(FELTS['poker.felt.lapsi']) },
    { slot:'back', id:'poker.back.umbrel',level:11, set:'summer', name:'Umbrella tal-Kjosk',
      blurb:'Faded orange and cream, one rib bent. Holds off the sun, not much else.', preview:backPv(BACKS['poker.back.umbrel']) }
  ]);
  KIT.onChange(apply);
  apply();
}
boot(0);

})();
