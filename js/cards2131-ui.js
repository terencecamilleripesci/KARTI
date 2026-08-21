/* ═══════════════════════════════════════════════════════════════════
   KARTI — cards2131-ui.js
   THE CASINO CARDS TABLE — one tile, two modes: 21 (blackjack) and
   31 (Scat / Tletin-u-Wieħed). The rules live in js/blackjack.js
   (window.KARTI_BLACKJACK.engine) and js/tletin.js
   (window.KARTI_TLETIN.engine); this file is the SCREEN, the runner
   and the wire, and it follows js/poker-ui.js's shape deliberately:
   a match is (opts, seed, log), every move goes through one doMove()
   gate, and rollback is cutting the log and replaying it.

   ONE TILE, A MODE PICKER. The player taps a single tile and the setup
   sheet first asks 21 or 31 — a VARIANT, exactly as js/rummy-ui.js
   picks classic vs għaxra. Each mode then has its own options: 21 sets
   the shoe (decks), S17/H17 and the blackjack payout; 31 sets the
   lives. The two engines share NOTHING in their rules — a knock has no
   blackjack twin, a split has no 31 twin — but they carry a COMMON API
   SURFACE (deal/legal/check/apply/turn/over/note/tally) so one runner
   drives both.

   WHAT THIS FILE IS
     · the shelf tile and the setup sheet, mode picker first, with the
       rules FOLDED shut so starting a game is short
     · the 21 felt: your hand(s) and bet, the dealer with a face-down
       hole card until reveal, and the thumb-sized turn controls —
       HIT / STAND / DOUBLE / SPLIT / SURRENDER / INSURANCE
     · the 31 felt: your three cards, the draw pile and the discard,
       the single-suit total, KNOCK, and lives / elimination
     · the standings through KARTI_REBBIEH (avatars, XP, Play Again)
     · the runner: log, seed, autosave (karti_cards2131_v1)

   TWO STAKES
     FREE (ĦIELES)   table chips (21) / lives (31) and nothing else.
                     They exist for the life of the table and touch
                     nobody's wallet. This is the whole game and it
                     ships on its own.
     COINS           HIDDEN behind COINS_MODE_READY — read the comment
                     on that constant before you so much as think about
                     flipping it. Exactly as poker-ui does it.

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
const BJ = window.KARTI_BLACKJACK;
const TL = window.KARTI_TLETIN;
if (!P || !KLB || !BJ || !BJ.engine || !TL || !TL.engine) return;

const DECK = KLB.deck;
const esc = (K && K.esc) || (s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');
const clone = o => JSON.parse(JSON.stringify(o));

/* ── the one language switch (js/lang.js) ────────────────────────── */
const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;

/* the two mode NAMES, bilingual. A name is a name in both languages —
   "21" stays "21"; the Maltese is the spoken long form. */
const MODE_NAME = {
  '21': { en:'21', mt:'Wieħed u Għoxrin' },
  '31': { en:'31', mt:'Wieħed u Tletin' }
};
function modeName(id){
  const m = MODE_NAME[id] || MODE_NAME['21'];
  return T(m.en, m.mt);
}
/* engine id ('bj'|'tl') ↔ display mode id ('21'|'31') */
const engFor = mode => (mode === '31' ? TL.engine : BJ.engine);

/* ═══════════════════════════════════════════════════════════════════
   COINS_MODE_READY — THE FLAG. READ THIS BEFORE CHANGING IT.

   false, and it must stay false until one specific piece of work is
   done, which is NOT in this file. Same story as poker: the relay
   broadcasts ONE shared seed to every seat, so every phone can derive
   the whole shoe — the dealer's HOLE CARD in 21, every opponent's
   three cards in 31. Offline against the machine that is harmless.
   With money on it, it is a robbery with a progress bar.

   WHAT UNBLOCKS IT lives on the relay side (see DEALERS.private in both
   engines): deal each seat its own cards privately, and a SHOWDOWN /
   REVEAL message so a client can settle a hand it was never sent.
   Until then, flipping this ships a cheat. The coins path below is
   written and reachable ONLY through this flag so it does not rot.
   The engines mirror this constant for the harness; the UI owns it.
   ═══════════════════════════════════════════════════════════════════ */
const COINS_MODE_READY = false;

function coinBalance(){
  try { return (K && K.S && K.S.coins | 0) || 0; } catch(e){ return 0; }
}
/* THE LOBBY'S STAKE, read-only. When the shared lobby started this table
   FOR CHIPS (js/mp.js: the host's Stakes control), the real pot is named
   on the badge so nobody mistakes which money is on the table. The verbs
   all live in mp.js/progress.js: the ante went out at 'began', the pot
   pays on the result card — this function can only READ. */
function stakeBadge(){
  try {
    const si = window.KARTI_MP && KARTI_MP.stakeInfo && KARTI_MP.stakeInfo();
    if (si && si.staked && si.live) return T('POT ' + si.pot, 'POT ' + si.pot);
  } catch (e){}
  return null;
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
const STORE = 'karti_cards2131_v1';
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

/* ── UI-only preferences in their OWN key: folding the rules is not
   the game, so binning a table must never forget how you keep them. ── */
const UIKEY = 'karti_cards2131_ui_v1';
let rulesOpen = false;
let setupOpen = false;
try { rulesOpen = localStorage.getItem(UIKEY + '.rules') === '1'; } catch(e){}
try { setupOpen = localStorage.getItem(UIKEY + '.setup') === '1'; } catch(e){}
function setSetupOpen(open){
  setupOpen = !!open;
  try { localStorage.setItem(UIKEY + '.setup', setupOpen ? '1' : '0'); } catch(e){}
}

/* the machine, three sharpnesses. The NAME is the machine's name in
   both languages; only the note is translated. */
function levels(){
  return [{ level:1, name:'Gentle',  note:'Plays it soft.' },
          { level:2, name:'Normal',  note:'Plays it right.' },
          { level:3, name:'Ruthless', note:'Plays to win.' }];
}
function levelWords(k){
  if (k === 1) return { n: T('Gentle', 'Kalm'),        i: T('Plays it soft.', 'Jilgħabha bilmod.') };
  if (k === 3) return { n: T('Ruthless', 'Bla ħniena'), i: T('Plays to win.', 'Jilgħab biex jirbaħ.') };
  return { n: T('Normal', 'Normali'), i: T('Plays it right.', 'Jilgħabha sew.') };
}

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
/* the tile mark: a card with a "21" chip in front — the silhouette of
   a bet against the dealer, which is what this game is. Geometry only,
   one weight, told apart by shape, like the klabb marks. */
const TILE_MARK =
  '<g transform="rotate(-12 8 12)">' + cardFrame(2.4, 3.0, 8.6, 12.8, 1) + '</g>' +
  '<g transform="rotate(10 15 11)">' + cardFrame(11.2, 2.2, 8.6, 12.8, 1) + '</g>' +
  '<path fill-rule="evenodd" d="M12 14.7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 1.7a3.3 3.3 0 1 1 0 6.6 3.3 3.3 0 0 1 0-6.6z"/>' +
  '<path d="M11 14.4h2v2h-2zM11 22.6h2v2h-2zM6.6 18.7h2v1.7h-2zM15.3 18.7h2v1.7h-2z"/>';

let defsDone = false;
function injectDefs(){
  if (defsDone || document.getElementById('bt-defs')) { defsDone = true; return; }
  defsDone = true;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', 'bt-defs');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  svg.innerHTML = '<symbol id="bt-t-cards2131" viewBox="0 0 24 24">' + TILE_MARK + '</symbol>';
  document.body.appendChild(svg);
}

/* ONE CHIP, drawn — the bet marker and the little disc beside a stack.
   Geometry, one colour from CSS, told apart by the letter on it. */
function chip(txt, cls){
  return '<span class="bt-chip' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' +
         '<svg viewBox="0 0 24 24" focusable="false">' +
         '<circle class="bt-chip-o" cx="12" cy="12" r="11"/>' +
         '<circle class="bt-chip-i" cx="12" cy="12" r="7.4"/>' +
         '<path class="bt-chip-e" d="M12 .6v3.4M12 20v3.4M.6 12h3.4M20 12h3.4' +
           'M3.9 3.9l2.4 2.4M17.7 17.7l2.4 2.4M20.1 3.9l-2.4 2.4M6.3 17.7l-2.4 2.4"/>' +
         '</svg><i>' + esc(txt || '') + '</i></span>';
}
/* a life pip for 31 — a filled heart-less token, geometry only */
function lifePip(on){
  return '<span class="bt-life' + (on ? '' : ' off') + '" aria-hidden="true"></span>';
}

/* one card. Face drawing is klabb's; the button, the data and the
   highlight are ours. c<0 or face:false draws the card back. */
function cardBtn(c, o){
  o = o || {};
  const w = o.w || 52;
  const face = o.face !== false && c >= 0;
  const body = !face ? DECK.cardBack() : DECK.cardFace(c);
  return '<span class="kb-card bt-c' + (o.lit ? ' bt-lit' : '') + (o.dim ? ' bt-dim' : '') +
    (face ? '' : ' down') + (o.cls ? ' ' + o.cls : '') + '"' +
    ' data-cid="' + c + '"' +
    ' style="width:' + w + 'px;height:' + Math.round(w * 1.4) + 'px' +
      (o.left != null ? ';margin-left:' + o.left + 'px' : '') + '"' +
    ' aria-hidden="true">' + body + '</span>';
}
function slot(w){
  return '<span class="bt-slot" style="width:' + w + 'px;height:' +
         Math.round(w * 1.4) + 'px" aria-hidden="true"></span>';
}

/* ═══════════════════════════════════════════════════════════════════
   SOUND — existing ids only, through one gate so a FAST test run does
   not machine-gun the mixer.
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
   THE RUNNER — (mode, opts, seed, log) and one door for every move.
   The mode picks which engine E is; everything else is engine-agnostic
   because both engines carry the common API surface.
   ═══════════════════════════════════════════════════════════════════ */
let M = null;
let UI = null;
let FAST = false;

/* the outbound move feed — how a local move reaches the wire online. Empty
   and untouched offline (nothing subscribes), so offline is byte-identical. */
const moveSubs = [];
function fire(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }

function newSeed(){ return (Math.random() * 0xFFFFFFFF) >>> 0; }

function E(){ return M ? engFor(M.mode) : BJ.engine; }

function buildState(mode, opts, seed, log){
  const e = engFor(mode);
  const st = e.deal(opts, seed >>> 0);
  for (let i = 0; i < log.length; i++) e.apply(st, log[i]);
  return st;
}

function startMatch(mode, opts, seed, log){
  stopThinking();
  M = {
    mode: mode === '31' ? '31' : '21',
    opts: clone(opts || {}),
    seed: (seed == null ? newSeed() : seed) >>> 0,
    log: log ? clone(log) : [],
    st: null, ctx: null,
    tmp: {},
    timer: 0, dead: false, finished: false,
    net: null, meta: null
  };
  M.st = buildState(M.mode, M.opts, M.seed, M.log);
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
  const e = E();
  if (e.over(M.st)) return { ok:false, err:'game over' };
  const t = e.turn(M.st);
  if (t !== seat) return { ok:false, err:'not seat ' + seat + "'s turn (it is " + t + ')' };
  if (!e.check(M.st, move, seat)) return { ok:false, err:'illegal move' };
  const rec = clone(move);
  rec.seat = seat;
  const idx = M.log.length;
  M.log.push(rec);
  e.apply(M.st, rec);
  moveSound(seat, move);
  autosave();
  /* the WIRE copy is the APPLIED record: apply() may stamp flow flags
     on it (21 lanes: mv.e / mv.f) that the other phones need. */
  fire(moveSubs, { seat, move: clone(rec), index: idx, src: src || 'local' });
  return { ok:true, index:idx };
}

function rollbackTo(n){
  if (!M) return null;
  n = Math.max(0, Math.min(M.log.length, n | 0));
  stopThinking();
  M.log = M.log.slice(0, n);
  M.st = buildState(M.mode, M.opts, M.seed, M.log);
  applyMeta();
  M.tmp = {};
  autosave();
  return n;
}

function snapshot(){
  if (!M) return null;
  return { v:SAVE_V, gid:'cards2131', mode:M.mode, opts:clone(M.opts), seed:M.seed, log:clone(M.log) };
}
function autosave(){
  if (!M || M.net) return;
  if (E().over(M.st)){ saveSlot(null); return; }
  saveSlot(snapshot());
}

/* ═══════════════════════════════════════════════════════════════════
   THE SOUND OF A MOVE — one gate; rollback replays never pass through
   doMove so they are silent by construction.
   ═══════════════════════════════════════════════════════════════════ */
function moveSound(seat, mv){
  if (!M || M.dead) return;
  const mine = seat >= 0 && isLocal(seat);
  switch (mv.t){
    case 'hit':       cue('card.deal',  { gain: mine ? 0.85 : 0.6 }, true); return;
    case 'stand':     cue('ui.tap',     { gain: mine ? 0.85 : 0.5 }); return;
    case 'double':    cue('coin.tick',  { gain: mine ? 0.95 : 0.65 }, true);
                      cueIn(90, () => cue('card.deal', { gain: 0.6 }, true)); return;
    case 'split':     cue('card.sweep', { gain: mine ? 0.9 : 0.6 }, true); return;
    case 'surrender': cue('card.throw', { gain: mine ? 0.85 : 0.55 }); return;
    case 'ins':       cue('coin.tick',  { gain: 0.7 }); return;
    case 'draw':      cue('card.deal',  { gain: mine ? 0.85 : 0.6 }, true); return;
    case 'discard':   cue('card.throw', { gain: mine ? 0.8 : 0.55 }); return;
    case 'knock':     cue('gin.knock',  { gain: mine ? 1 : 0.7 }, true); return;
    case 'next':      cue('card.shuffle', { gain: 0.8 }, true); return;
    case 'up':        cue('card.deal',  { gain: 0.7 }, true); return;
    case 'peek':      cue('ui.tap',     { gain: 0.6 }); return;
    case 'reveal':    cue('card.sweep', { gain: 0.85 }, true); return;
    case 'show':      cue('card.deal',  { gain: mine ? 0.7 : 0.5 }, true); return;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party. The kb-* face
   rules are restated from js/klabb.js's runtime sheet because that
   sheet only exists once a klabb game has been OPENED, and this felt
   must not depend on somebody having played Briscola first.

   THE IDENTITY: casino baize green with a ring of light over the felt,
   a gold rail, and chips — read as a blackjack table at a glance.
   ═══════════════════════════════════════════════════════════════════ */
/* ── THE EQUIPPED LOOK — deck-kit's shared felt + card back, read from
   the same tables deck-kit paints every other card table from. Our
   .bt-table is not on deck-kit's host list (deck-kit is not ours to
   edit), so the equipped colours are restated here, scoped to us, and
   refreshed every time the table opens. Falls back to the casino baize
   when nothing is equipped. ── */
function themeCSS(){
  let css = '';
  try {
    const XP = window.KARTI_XP, DKX = window.KARTI_DECK;
    const f = (XP && DKX && DKX._felts) ? DKX._felts[XP.equipped('felt', 'karti') || ''] : null;
    if (f && f.a){
      css +=
        '#app #scr-party .bt-table{background:' +
          'radial-gradient(120% 85% at 50% 30%,' + f.a + ' 0%,' + f.b + ' 46%,' + f.c + ' 100%)}' +
        '#app #scr-party .bt-table{--bt-ring:' + (f.ring || '#FFD98A') + '}';
    }
    const b = (XP && DKX && DKX._backs) ? DKX._backs[XP.equipped('back', 'karti') || ''] : null;
    if (b && !b.stock && b.pat){
      const sc = '#app #scr-party .bt-table .kb-back ';
      css += sc + 'rect[fill^="url"]{fill:url(#kdx-pat-' + b.pat + ')}' +
             sc + 'rect[stroke="#FFD98A"]{stroke:' + b.edge + '}' +
             sc + 'use{fill:' + b.cross + '}';
    }
  } catch(e){}
  let st = document.getElementById('bt-theme-css');
  if (!st){
    st = document.createElement('style');
    st.id = 'bt-theme-css';
    document.head.appendChild(st);
  }
  st.textContent = css;
}

function injectCSS(){
  injectDefs();
  themeCSS();
  if (document.getElementById('bt-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'bt-runtime-css';
  st.textContent =
    '#scr-party{--bt-felt:#0F5C3A;--bt-felt2:#062A1B;' +
      '--bt-gold:var(--kx-gold,var(--gold,#FFC542))}' +

    /* ── card faces (klabb's rules, restated — see header) ── */
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
    '#scr-party .bt-c.bt-lit{box-shadow:0 0 0 2.5px var(--bt-gold),0 6px 14px rgba(0,0,0,.5)}' +
    '#scr-party .bt-c.bt-dim{opacity:.42}' +
    '#scr-party .bt-c.bt-dim .kb-svg{filter:grayscale(.85)}' +
    '#scr-party .bt-slot{display:block;flex:0 0 auto;border-radius:7px;' +
      'border:1.5px dashed rgba(255,255,255,.17);background:rgba(0,0,0,.14)}' +

    /* ── one chip ── */
    '#scr-party .bt-chip{position:relative;display:inline-grid;place-items:center;' +
      'width:19px;height:19px;flex:0 0 auto;vertical-align:middle}' +
    '#scr-party .bt-chip svg{grid-area:1/1;width:100%;height:100%;display:block}' +
    '#scr-party .bt-chip i{grid-area:1/1;font:900 8px/1 var(--disp);font-style:normal;' +
      'color:#241800;letter-spacing:0}' +
    '#scr-party .bt-chip-o{fill:#EFE3C8;stroke:rgba(0,0,0,.45);stroke-width:1}' +
    '#scr-party .bt-chip-i{fill:#FFF8E6;stroke:rgba(0,0,0,.2);stroke-width:.8}' +
    '#scr-party .bt-chip-e{stroke:#B4212F;stroke-width:2.6;stroke-linecap:round;fill:none}' +

    /* ── a life pip (31) ── */
    '#scr-party .bt-life{display:inline-block;width:11px;height:11px;flex:0 0 auto;' +
      'border-radius:50%;background:linear-gradient(180deg,#FFD979,var(--bt-gold));' +
      'box-shadow:0 1px 2px rgba(0,0,0,.5)}' +
    '#scr-party .bt-life.off{background:rgba(255,255,255,.14);box-shadow:none}' +

    /* ── the felt ── */
    '#scr-party .pt-host.bt-host{align-items:stretch;justify-content:stretch;overflow:visible}' +
    '#scr-party .bt-table{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;' +
      'gap:5px;padding:7px 7px 8px;border-radius:16px;position:relative;' +
      'background:radial-gradient(120% 85% at 50% 32%,#178A54 0%,var(--bt-felt) 46%,var(--bt-felt2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.07),' +
      'inset 0 -18px 34px rgba(0,0,0,.42)}' +

    /* ── the dealer / rail row across the top ── */
    '#scr-party .bt-top{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;' +
      'gap:4px;padding:4px 2px 2px}' +
    '#scr-party .bt-lbl{font:900 8.5px/1 var(--disp);letter-spacing:.16em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.55)}' +
    '#scr-party .bt-dealer{display:flex;align-items:center;gap:8px}' +
    '#scr-party .bt-hand{display:flex;gap:3px;line-height:0}' +
    '#scr-party .bt-tot{min-width:30px;text-align:center;font:900 15px/1 var(--disp);' +
      'color:#FFF;padding:3px 8px;border-radius:999px;background:rgba(0,0,0,.4);' +
      'border:1px solid rgba(255,255,255,.14)}' +
    '#scr-party .bt-tot.soft{color:#9FE8C0}' +
    '#scr-party .bt-tot.bust{color:#F0899A;border-color:rgba(240,120,140,.5)}' +
    '#scr-party .bt-tot.bj{color:var(--bt-gold);border-color:rgba(255,197,66,.6)}' +

    /* ── the 31 opponents rail ── */
    '#scr-party .bt-opps{flex:0 0 auto;display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;' +
      'padding:2px 2px 4px;-webkit-overflow-scrolling:touch;scrollbar-width:none;justify-content:center}' +
    '#scr-party .bt-opps::-webkit-scrollbar{display:none}' +
    '#scr-party .bt-opp{flex:0 0 auto;position:relative;display:flex;flex-direction:column;' +
      'align-items:center;gap:2px;min-width:60px;padding:4px 7px 5px;border-radius:11px;' +
      'background:rgba(0,0,0,.30);border:1px solid rgba(255,255,255,.09)}' +
    '#scr-party .bt-opp.on{background:rgba(255,197,66,.17);border-color:rgba(255,197,66,.6)}' +
    '#scr-party .bt-opp.out{opacity:.34}' +
    '#scr-party .bt-opp .n{font:900 8.5px/1.2 var(--disp);letter-spacing:.06em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.68);max-width:76px;white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .bt-opp.on .n{color:var(--bt-gold)}' +
    '#scr-party .bt-opp .h{display:flex;gap:2px;line-height:0}' +
    '#scr-party .bt-opp .lives{display:flex;gap:2px;margin-top:1px}' +
    '#scr-party .bt-opp .tag{font:900 8px/1.3 var(--disp);letter-spacing:.09em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.5)}' +
    '#scr-party .bt-opp.knock .tag{color:var(--bt-gold)}' +

    /* ── the middle: message / discard+draw ── */
    '#scr-party .bt-mid{flex:1 1 auto;min-height:96px;position:relative;display:flex;' +
      'flex-direction:column;align-items:center;justify-content:center;gap:8px;' +
      'padding:9px 8px 7px;border-radius:14px;overflow:hidden;' +
      'background:radial-gradient(105% 130% at 50% 40%,rgba(255,255,255,.09) 0%,' +
      'rgba(255,255,255,0) 62%),rgba(0,0,0,.15);border:1px solid rgba(0,0,0,.35)}' +
    '#scr-party .bt-mid::before{content:"";position:absolute;inset:6px;border-radius:9px;' +
      'border:1px solid rgba(255,255,255,.07);pointer-events:none}' +
    '#scr-party .bt-piles{position:relative;z-index:1;display:flex;gap:18px;align-items:flex-start}' +
    '#scr-party .bt-pile{display:flex;flex-direction:column;align-items:center;gap:4px}' +
    '#scr-party .bt-pile .cap{font:900 8px/1 var(--disp);letter-spacing:.13em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.5)}' +
    '#scr-party .bt-pile.pick .kb-card,#scr-party .bt-pile.pick .bt-slot{box-shadow:0 0 0 2.5px var(--bt-gold),0 4px 10px rgba(0,0,0,.5);border-radius:7px;cursor:pointer}' +
    '#scr-party .bt-mode{position:absolute;right:10px;bottom:6px;font:900 9.5px/1 var(--disp);' +
      'letter-spacing:.17em;color:rgba(255,255,255,.2);pointer-events:none}' +
    '#scr-party .bt-note{position:absolute;left:10px;bottom:6px;font:900 9.5px/1 var(--disp);' +
      'letter-spacing:.13em;color:rgba(255,255,255,.2);pointer-events:none}' +

    /* ── THE PRINTED FELT (21) — the classic arc, silk-screened under
       everything: the gold rail, "BLACKJACK PAYS …", the dealer's rule,
       "INSURANCE PAYS 2 TO 1". Pure SVG print: aria-hidden, no hits. ── */
    '#scr-party .bt-arc{flex:1 1 auto;min-height:50px;max-height:118px;position:relative;' +
      'z-index:0;pointer-events:none;display:flex;align-items:center;justify-content:center}' +
    '#scr-party .bt-arc svg{width:103%;height:100%;display:block}' +
    '#scr-party .bt-arc .rail{fill:none;stroke:var(--bt-ring,#FFD98A);stroke-width:2.4;opacity:.30}' +
    '#scr-party .bt-arc .rail2{fill:none;stroke:var(--bt-ring,#FFD98A);stroke-width:1;opacity:.16}' +
    '#scr-party .bt-arc .t1{font:900 16.5px var(--disp);letter-spacing:.22em;' +
      'fill:var(--bt-ring,#FFD98A);opacity:.60}' +
    '#scr-party .bt-arc .t2{font:800 8.4px var(--disp);letter-spacing:.24em;fill:#FFF;opacity:.42}' +
    '#scr-party .bt-arc .t3{font:800 8.4px var(--disp);letter-spacing:.30em;' +
      'fill:var(--bt-ring,#FFD98A);opacity:.40}' +
    '#scr-party .bt-arc .pip{fill:var(--bt-ring,#FFD98A);opacity:.34}' +

    /* ── the seats along the arc (21): every other chair at the table ── */
    '#scr-party .bt-pods{flex:0 0 auto;position:relative;z-index:1;display:flex;' +
      'justify-content:center;gap:6px;padding:2px 4px 14px;min-height:0}' +
    '#scr-party .bt-pod{flex:0 1 88px;min-width:56px;display:flex;flex-direction:column;' +
      'align-items:center;gap:2px;padding:5px 4px 6px;border-radius:12px;' +
      'background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.10)}' +
    '#scr-party .bt-pod.on{background:rgba(255,197,66,.15);border-color:var(--bt-gold);' +
      'box-shadow:0 0 12px rgba(255,197,66,.22)}' +
    '#scr-party .bt-pod.out{opacity:.35}' +
    '#scr-party .bt-pod .n{font:900 8.5px/1.2 var(--disp);letter-spacing:.06em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.72);max-width:82px;white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis}' +
    '#scr-party .bt-pod.on .n{color:var(--bt-gold)}' +
    '#scr-party .bt-pod .h{display:flex;gap:2px;line-height:0}' +
    '#scr-party .bt-pod .h + .h{margin-top:2px}' +
    '#scr-party .bt-pod .row{display:flex;align-items:center;gap:4px}' +
    '#scr-party .bt-pod .bt-tot{font-size:10px;padding:2px 6px;min-width:20px}' +
    '#scr-party .bt-pod .tag{font:900 8px/1.3 var(--disp);letter-spacing:.09em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.55)}' +
    '#scr-party .bt-pod .tag.bad{color:#F0899A}' +
    '#scr-party .bt-pod .tag.good{color:#7CE8AE}' +
    '#scr-party .bt-pod .tag.bj{color:var(--bt-gold)}' +
    '#scr-party .bt-pod .stk{display:flex;align-items:center;gap:3px;' +
      'font:700 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#FFE9B0}' +
    '#scr-party .bt-pod .stk .bt-chip{width:13px;height:13px}' +

    /* ── the BET SPOT: the printed ring your chips sit in ── */
    '#scr-party .bt-spot{position:relative;display:flex;align-items:center;gap:4px;' +
      'padding:4px 9px;border-radius:999px;border:1.5px solid rgba(255,217,138,.4);' +
      'box-shadow:inset 0 0 0 3px rgba(0,0,0,.18),inset 0 0 0 4px rgba(255,217,138,.14);' +
      'font:800 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#FFE9B0}' +
    '#scr-party .bt-spot .bt-chip{width:17px;height:17px}' +
    '#scr-party .bt-spot.up{border-color:rgba(124,232,174,.55);color:#B9F3D4}' +
    '#scr-party .bt-spot.down{border-color:rgba(240,137,154,.5);color:#F5B7C1}' +

    /* ── THE WINNER SCREEN — the round settles on a card that slides up
       over the felt: who won, what every hand made, the chips that
       moved, and the one button that deals the next round. ── */
    '#scr-party .bt-win{position:absolute;left:6px;right:6px;bottom:6px;z-index:24;' +
      'display:flex;flex-direction:column;border-radius:16px;overflow:hidden;' +
      'background:linear-gradient(180deg,rgba(9,38,25,.97),rgba(4,20,13,.98));' +
      'border:1px solid rgba(255,217,138,.28);box-shadow:0 -12px 34px rgba(0,0,0,.6),' +
      'inset 0 1px 0 rgba(255,255,255,.08);transform:translateY(112%);opacity:0;' +
      'visibility:hidden;pointer-events:none;max-height:76%;' +
      'transition:transform .3s var(--ease),opacity .3s var(--ease),visibility 0s .3s}' +
    '#scr-party .bt-win.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .3s var(--ease),opacity .3s var(--ease)}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .bt-win{transition:none}}' +
    'body.reduced #scr-party .bt-win{transition:none}' +
    '#scr-party .bt-win-h{flex:0 0 auto;text-align:center;padding:13px 12px 4px}' +
    '#scr-party .bt-win-h b{display:block;font:900 19px/1.1 var(--disp);letter-spacing:.06em;' +
      'text-transform:uppercase}' +
    '#scr-party .bt-win-h b.win{color:var(--bt-gold)}' +
    '#scr-party .bt-win-h b.lose{color:#F0899A}' +
    '#scr-party .bt-win-h b.push{color:#D6D8E4}' +
    '#scr-party .bt-win-h i{display:block;font-style:normal;font:700 10px/1.5 var(--disp);' +
      'letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-top:3px}' +
    '#scr-party .bt-win-b{min-height:0;overflow-y:auto;padding:6px 12px 4px;' +
      '-webkit-overflow-scrolling:touch}' +
    '#scr-party .bt-win-r{display:flex;align-items:center;gap:8px;padding:6px 4px;' +
      'border-top:1px solid rgba(255,255,255,.07)}' +
    '#scr-party .bt-win-r:first-child{border-top:0}' +
    '#scr-party .bt-win-r .who{flex:1;min-width:0;font:900 11px/1.3 var(--disp);' +
      'letter-spacing:.04em;color:var(--txt);white-space:nowrap;overflow:hidden;' +
      'text-overflow:ellipsis;text-transform:uppercase}' +
    '#scr-party .bt-win-r .who i{display:block;font-style:normal;font:700 9px/1.4 var(--body);' +
      'color:var(--dim);letter-spacing:0;text-transform:none}' +
    '#scr-party .bt-win-r .made{flex:0 0 auto;display:flex;gap:4px}' +
    '#scr-party .bt-win-r .made em{font:900 9px/1 var(--disp);font-style:normal;' +
      'letter-spacing:.06em;padding:4px 7px;border-radius:999px;background:rgba(0,0,0,.4);' +
      'border:1px solid rgba(255,255,255,.13);color:#EAEAF2;text-transform:uppercase}' +
    '#scr-party .bt-win-r .made em.bj{color:var(--bt-gold);border-color:rgba(255,197,66,.5)}' +
    '#scr-party .bt-win-r .made em.bust{color:#F0899A;border-color:rgba(240,120,140,.42)}' +
    '#scr-party .bt-win-r .made em.win{color:#7CE8AE;border-color:rgba(110,230,170,.42)}' +
    '#scr-party .bt-win-r .net{flex:0 0 auto;min-width:44px;text-align:right;' +
      'font:800 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace}' +
    '#scr-party .bt-win-r .net.up{color:#7CE8AE}#scr-party .bt-win-r .net.dn{color:#F0899A}' +
    '#scr-party .bt-win-r .net.zz{color:rgba(255,255,255,.55)}' +
    '#scr-party .bt-win-d{display:flex;align-items:center;justify-content:center;gap:6px;' +
      'padding:2px 12px 6px}' +
    '#scr-party .bt-win-d .kb-card{box-shadow:0 1px 3px rgba(0,0,0,.5)}' +
    '#scr-party .bt-win-f{flex:0 0 auto;display:flex;gap:8px;align-items:center;' +
      'padding:8px 12px calc(10px + env(safe-area-inset-bottom,0px));' +
      'border-top:1px solid rgba(255,255,255,.09)}' +
    '#scr-party .bt-win-f .bank{flex:1;font:900 9px/1.4 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:rgba(255,255,255,.55)}' +
    '#scr-party .bt-win-f .bank b{display:block;font-size:15px;color:#FFF;letter-spacing:0}' +
    '#scr-party .bt-win-f .bt-act{flex:0 0 auto;min-width:150px}' +
    '#scr-party .bt-win-f .wait{flex:0 0 auto;font:700 10px/1.5 var(--body);color:var(--dim);' +
      'text-align:right;max-width:55%}' +

    /* ── the table-rules rows on the setup sheet ── */
    '#scr-party .bt-opt{display:flex;align-items:center;gap:10px;min-height:48px;padding:4px 2px}' +
    '#scr-party .bt-opt .lbl{flex:1;min-width:0}' +
    '#scr-party .bt-opt .lbl b{display:block;font:900 10px/1.4 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--txt)}' +
    '#scr-party .bt-opt .lbl i{display:block;font-style:normal;font-size:10px;line-height:1.4;' +
      'color:var(--dim);margin-top:1px}' +
    '#scr-party .bt-seg{display:flex;gap:5px}' +
    '#scr-party .bt-seg button{min-width:46px;min-height:40px;padding:0 10px;border-radius:10px;' +
      'font:900 11px/1 var(--disp);letter-spacing:.04em;color:var(--txt);cursor:pointer;' +
      'background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.16);' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .bt-seg button.on{color:#241800;border-color:#FFE9B0;' +
      'background:linear-gradient(180deg,#FFD979,var(--bt-gold))}' +

    /* ── the hint line ── */
    '#scr-party .bt-say{flex:0 0 auto;font:700 11px/1.45 var(--body);color:rgba(255,255,255,.82);' +
      'text-align:center;padding:0 8px;min-height:16px}' +
    '#scr-party .bt-say b{color:var(--bt-gold);font-weight:900}' +

    /* ── your own seat: 21 may have several hands (splits) side by side ── */
    '#scr-party .bt-me{flex:0 0 auto;display:flex;align-items:flex-end;justify-content:center;' +
      'gap:10px;padding:2px 8px 0;flex-wrap:wrap}' +
    '#scr-party .bt-myhand{display:flex;flex-direction:column;align-items:center;gap:3px;' +
      'padding:4px 6px;border-radius:10px}' +
    '#scr-party .bt-myhand.on{background:rgba(255,197,66,.12);box-shadow:inset 0 0 0 1px rgba(255,197,66,.4)}' +
    '#scr-party .bt-myhand .h{display:flex;gap:3px;line-height:0}' +
    '#scr-party .bt-myhand .meta{display:flex;align-items:center;gap:6px}' +
    '#scr-party .bt-myhand .bt-tot{font-size:13px;padding:2px 7px;min-width:26px}' +
    '#scr-party .bt-myhand .bet{display:flex;align-items:center;gap:3px;' +
      'font:700 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#FFE9B0}' +
    '#scr-party .bt-myhand .out{font:900 9px/1 var(--disp);letter-spacing:.08em;text-transform:uppercase}' +
    '#scr-party .bt-myhand .out.win{color:#7CE8AE}#scr-party .bt-myhand .out.lose{color:#F0899A}' +
    '#scr-party .bt-myhand .out.push{color:#D6D8E4}#scr-party .bt-myhand .out.bj{color:var(--bt-gold)}' +
    '#scr-party .bt-purse{flex:0 0 auto;text-align:center;font:900 8.5px/1.3 var(--disp);' +
      'letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.55)}' +
    '#scr-party .bt-purse b{display:block;font-size:17px;color:#FFF;letter-spacing:0}' +

    /* ── the buttons a turn is made of ── */
    '#scr-party .bt-acts{flex:0 0 auto;display:flex;gap:7px;justify-content:center;flex-wrap:wrap;' +
      'padding:5px 2px 0}' +
    '#scr-party .bt-act{flex:1 1 0;min-width:66px;min-height:48px;padding:0 8px;border-radius:12px;' +
      'font:900 11px/1.15 var(--disp);letter-spacing:.05em;text-transform:uppercase;color:#241800;' +
      'background:linear-gradient(180deg,#FFD979,var(--bt-gold));border:1px solid #FFE9B0;' +
      'box-shadow:0 3px 0 -1px rgba(0,0,0,.4);-webkit-tap-highlight-color:transparent}' +
    '#scr-party .bt-act small{display:block;font-size:8.5px;letter-spacing:.05em;opacity:.75;' +
      'margin-top:2px;font-weight:800}' +
    '#scr-party .bt-act.ghost{color:var(--txt);background:rgba(255,255,255,.08);' +
      'border-color:rgba(255,255,255,.2);box-shadow:none}' +
    '#scr-party .bt-act.hot{color:#FFF;background:linear-gradient(180deg,#E8556A,#B4212F);border-color:#F0899A}' +
    '#scr-party .bt-act[disabled]{opacity:.34}' +
    '#scr-party .bt-act:not([disabled]):active{transform:translateY(2px);box-shadow:none}' +

    /* ── the rules: a panel that HIDES AND SLIDES, not a wall. Drops from
       the top and stops above your cards. No scrim. ── */
    '#scr-party .bt-rules{position:absolute;top:0;left:0;right:0;z-index:30;max-height:54%;' +
      'display:flex;flex-direction:column;border-radius:14px;overflow:hidden;' +
      'background:linear-gradient(180deg,#12583A,#08281B);border:1px solid rgba(255,255,255,.16);' +
      'box-shadow:0 14px 30px rgba(0,0,0,.55);transform:translateY(-108%);opacity:0;visibility:hidden;' +
      'pointer-events:none;transition:transform .26s var(--ease),opacity .26s var(--ease),visibility 0s .26s}' +
    '#scr-party .bt-rules.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .26s var(--ease),opacity .26s var(--ease)}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .bt-rules{transition:none}}' +
    'body.reduced #scr-party .bt-rules{transition:none}' +
    '#scr-party .bt-rules-h{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;' +
      'padding:9px 4px 2px 14px}' +
    '#scr-party .bt-rules-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--bt-gold)}' +
    '#scr-party .bt-rules-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;color:var(--txt);' +
      'cursor:pointer;display:grid;place-items:center;-webkit-tap-highlight-color:transparent}' +
    '#scr-party .bt-rules-x svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round}' +
    '#scr-party .bt-rules-b{min-height:0;overflow-y:auto;padding:2px 14px 12px;-webkit-overflow-scrolling:touch}' +
    '#scr-party .bt-rules-b ul{margin:0;padding:0}' +
    '#scr-party .bt-rules-b li{font-size:12px;line-height:1.6;color:var(--dim);margin:0 0 6px 14px}' +

    /* ── short screens (landscape phones) ── */
    '@media (max-height:520px){' +
      '#scr-party .bt-table{overflow-y:auto;-webkit-overflow-scrolling:touch;gap:3px;padding:5px 6px 6px}' +
      '#scr-party .bt-mid{min-height:64px}' +
      '#scr-party .bt-act{min-height:40px;font-size:10px}' +
      '#scr-party .bt-purse b{font-size:15px}}' +

    /* ── THE SETUP SHEET'S OWN FACE ── */
    '#scr-party .bt-menu .pt-lbl{color:#8FD8B4}' +
    '#scr-party .bt-menu .bt-hero{position:relative;display:flex;align-items:center;justify-content:center;' +
      'margin:2px 0 12px;padding:20px 8px 19px;border-radius:16px;overflow:hidden;' +
      'background:radial-gradient(120% 130% at 50% 20%,#178A54 0%,var(--bt-felt) 52%,var(--bt-felt2) 100%);' +
      'border:1px solid rgba(0,0,0,.5);box-shadow:inset 0 2px 0 rgba(255,255,255,.07),inset 0 -14px 26px rgba(0,0,0,.4)}' +
    '#scr-party .bt-menu .bt-hero::before{content:"";position:absolute;inset:6px;border-radius:11px;' +
      'border:1px solid rgba(255,255,255,.07);pointer-events:none}' +
    '#scr-party .bt-menu .bt-hero-in{position:relative;display:flex;align-items:flex-end;gap:3px}' +
    '#scr-party .bt-menu .bt-hero-h .kb-card:nth-child(2){margin-left:-16px;transform:rotate(9deg)}' +
    '#scr-party .bt-menu .bt-hero-st{display:flex;flex-direction:column-reverse;margin-left:8px;align-self:flex-end}' +
    '#scr-party .bt-menu .bt-hero-st .bt-chip{width:24px;height:24px;margin-top:-16px}' +
    '#scr-party .bt-menu .bt-hero-cap{position:absolute;right:11px;bottom:7px;font:900 10px/1 var(--disp);' +
      'letter-spacing:.18em;color:rgba(255,255,255,.32)}' +
    '#scr-party .bt-menu .bt-warn{font-size:11.5px;line-height:1.6;margin:8px 2px 0;padding:9px 11px;' +
      'border-radius:12px;text-transform:none;letter-spacing:0;color:#FFE0B0;' +
      'background:rgba(255,180,60,.10);border:1px solid rgba(255,180,60,.3)}' +
    '#scr-party .bt-menu .bt-why{font-size:11.5px;line-height:1.6;margin:8px 2px 0;padding:9px 11px;' +
      'border-radius:12px;text-transform:none;letter-spacing:0;color:#CFF0DE;' +
      'background:rgba(60,200,130,.09);border:1px solid rgba(60,200,130,.3)}' +
    '#scr-party .bt-step{display:flex;align-items:center;gap:10px;justify-content:center;padding:4px 0}' +
    '#scr-party .bt-step .v{font:900 24px/1 var(--disp);color:var(--bt-gold);min-width:96px;text-align:center}' +
    '#scr-party .bt-step .v i{display:block;font:700 9px/1.4 var(--disp);font-style:normal;' +
      'letter-spacing:.12em;color:var(--dim);text-transform:uppercase}' +
    '#scr-party .bt-rnd{width:46px;height:46px;border-radius:12px;font:900 22px/1 var(--disp);color:var(--txt);' +
      'background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.2)}' +
    '#scr-party .bt-rnd[disabled]{opacity:.35}' +
    '#scr-party .bt-fold-h{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:0;' +
      'background:none;padding:2px 0;margin:0;color:var(--txt);cursor:pointer;min-height:44px;' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .bt-fold-h span{flex:1;min-width:0}' +
    '#scr-party .bt-fold-h b{display:block;font:900 10px/1.4 var(--disp);letter-spacing:.11em;' +
      'text-transform:uppercase;color:var(--gold,#FFC542)}' +
    '#scr-party .bt-fold-h i{display:block;font-style:normal;font-size:10.5px;line-height:1.4;color:var(--dim);margin-top:3px}' +
    '#scr-party .bt-fold-h em{flex:0 0 auto;width:24px;height:24px;display:grid;place-items:center;color:var(--dim)}' +
    '#scr-party .bt-fold-h em svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2.2;' +
      'stroke-linecap:round;stroke-linejoin:round;transition:transform .22s var(--ease)}' +
    '#scr-party .bt-fold-h[aria-expanded="true"] em svg{transform:rotate(90deg)}' +
    '#scr-party .bt-fold-b{display:grid;grid-template-rows:0fr;transition:grid-template-rows .28s var(--ease)}' +
    '#scr-party .bt-fold-b.open{grid-template-rows:1fr}' +
    '#scr-party .bt-fold-i{overflow:hidden;min-height:0}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .bt-fold-b{transition:none}}' +
    'body.reduced #scr-party .bt-fold-b{transition:none}' +

    /* ── THE ENTRY SCREEN — the clean mode pick + big actions ── */
    '#scr-party .bt-menu .bt-pick{display:flex;gap:8px;margin:2px 2px 0}' +
    '#scr-party .bt-menu .bt-pick-b{flex:1 1 0;min-height:60px;border-radius:14px;padding:8px 6px;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;' +
      'background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.14);color:var(--txt);' +
      '-webkit-tap-highlight-color:transparent;cursor:pointer}' +
    '#scr-party .bt-menu .bt-pick-b b{font:900 20px/1 var(--disp)}' +
    '#scr-party .bt-menu .bt-pick-b i{font-style:normal;font:700 9.5px/1.2 var(--disp);' +
      'letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}' +
    '#scr-party .bt-menu .bt-pick-b.on{border-color:var(--bt-gold);' +
      'background:linear-gradient(180deg,rgba(255,197,66,.20),rgba(255,197,66,.06))}' +
    '#scr-party .bt-menu .bt-pick-b.on b{color:var(--bt-gold)}' +

    '#scr-party .bt-menu .bt-modes{display:flex;flex-direction:column;gap:9px;margin:2px 2px 0}' +
    '#scr-party .bt-menu .bt-mode-b{display:flex;align-items:center;gap:12px;width:100%;text-align:left;' +
      'min-height:60px;padding:10px 14px;border-radius:14px;cursor:pointer;' +
      'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:var(--txt);' +
      '-webkit-tap-highlight-color:transparent}' +
    '#scr-party .bt-menu .bt-mode-b.primary{background:linear-gradient(180deg,#FFD979,var(--bt-gold));' +
      'color:#241800;border-color:#FFE9B0;box-shadow:0 4px 14px rgba(255,197,66,.28)}' +
    '#scr-party .bt-menu .bt-mode-b:active{transform:translateY(1px)}' +
    '#scr-party .bt-menu .bt-mode-b .ic{flex:0 0 auto;width:26px;height:26px;display:grid;place-items:center}' +
    '#scr-party .bt-menu .bt-mode-b .ic svg{width:22px;height:22px}' +
    '#scr-party .bt-menu .bt-mode-b .tx{flex:1;min-width:0}' +
    '#scr-party .bt-menu .bt-mode-b b{display:block;font:900 15px/1.15 var(--disp);letter-spacing:.02em}' +
    '#scr-party .bt-menu .bt-mode-b i{display:block;font-style:normal;font:600 11px/1.35 var(--body);' +
      'opacity:.82;margin-top:2px}' +
    '#scr-party .bt-menu .bt-mode-b.primary i{opacity:.72}' +
    '#scr-party .bt-menu .bt-big{width:100%;min-height:50px;font-weight:900}' +

    /* the entry-screen rules slide — same clean slide-up as the felt's */
    '#scr-party .bt-menu-rules{position:fixed;left:0;right:0;bottom:0;z-index:40;max-height:70vh;' +
      'display:flex;flex-direction:column;border-radius:18px 18px 0 0;overflow:hidden;' +
      'background:linear-gradient(180deg,#12583A,#08281B);border:1px solid rgba(255,255,255,.16);' +
      'box-shadow:0 -14px 34px rgba(0,0,0,.6);transform:translateY(108%);opacity:0;visibility:hidden;' +
      'pointer-events:none;transition:transform .28s var(--ease),opacity .28s var(--ease),visibility 0s .28s}' +
    '#scr-party .bt-menu-rules.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .28s var(--ease),opacity .28s var(--ease)}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .bt-menu-rules{transition:none}}' +
    'body.reduced #scr-party .bt-menu-rules{transition:none}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   THE FELT
   ═══════════════════════════════════════════════════════════════════ */
function table(){
  const ctx = M.ctx;
  ctx.host.classList.add('bt-host');
  ctx.host.innerHTML =
    '<div class="bt-table" id="bt-table">' +
      '<div class="bt-top" id="bt-top"></div>' +
      '<div class="bt-arc" id="bt-arc" aria-hidden="true"></div>' +
      '<div class="bt-pods" id="bt-pods"></div>' +
      '<div class="bt-opps" id="bt-opps"></div>' +
      '<div class="bt-mid" id="bt-mid"></div>' +
      '<div class="bt-say" id="bt-say"></div>' +
      '<div class="bt-me" id="bt-me"></div>' +
      '<div class="bt-acts" id="bt-acts"></div>' +
      '<div class="bt-win" id="bt-win" aria-hidden="true"></div>' +
      '<div class="bt-rules" id="bt-rulespanel" aria-hidden="true">' +
        '<div class="bt-rules-h"><h4 id="bt-rules-t"></h4>' +
          '<button class="bt-rules-x" id="bt-rules-x" aria-label="' +
            esc(T('Put the rules away', 'Warrab ir-regoli')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<div class="bt-rules-b" id="bt-rules-b"></div>' +
      '</div>' +
    '</div>';
  const root = ctx.host.querySelector('#bt-table');
  UI = {
    ctx, root,
    arc:  root.querySelector('#bt-arc'),
    top:  root.querySelector('#bt-top'),
    pods: root.querySelector('#bt-pods'),
    opps: root.querySelector('#bt-opps'),
    mid:  root.querySelector('#bt-mid'),
    say:  root.querySelector('#bt-say'),
    me:   root.querySelector('#bt-me'),
    acts: root.querySelector('#bt-acts'),
    win:  root.querySelector('#bt-win'),
    rules: root.querySelector('#bt-rulespanel')
  };
  root.querySelector('#bt-rules-x').addEventListener('click', () => setRules(false));
  ctx.root.addEventListener('pointerdown', e => {
    if (!rulesOpen || !UI || !UI.rules) return;
    const rb = ctx.btn && ctx.btn('bt-rules');
    if (!UI.rules.contains(e.target) && !(rb && rb.contains(e.target))) setRules(false);
  }, true);
  root.addEventListener('click', e => {
    if (!M || M.dead) return;
    const t = e.target && e.target.closest && e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    e.preventDefault();
    onTap(t);
  });
  return UI;
}

const mySeat = () => (M ? E().meSeat(M.st) : 0);

/* ═══════════════════════════════════════════════════════════════════
   THE TAP GATE
   ═══════════════════════════════════════════════════════════════════ */
function onTap(t){
  const a = t.getAttribute('data-act');
  if (a === 'rules'){ setRules(!rulesOpen); return; }
  const e = E(), st = M.st, me = mySeat();
  /* NEXT ROUND is the table's move, not a seat's: the winner screen's
     button. Offline anybody may deal; online only the bank (the host)
     — it must push the fresh private lanes first (net.redeal). */
  if (a === 'next' && M.mode === '21'){
    if (st.phase !== 'settle') return;
    if (M.net){
      if (!M.net.host) return;
      if (!hostDealsNext()) return;      /* redeal refused: stay put   */
    }
    const r = doMove(-1, { t:'next' }, 'table');
    if (r.ok) render();
    return;
  }
  const mine = e.turn(st) === me;
  if (!mine) return;

  if (M.mode === '21'){
    if (a === 'hit')       return tryMove({ t:'hit' });
    if (a === 'stand')     return tryMove({ t:'stand' });
    if (a === 'double')    return tryMove({ t:'double' });
    if (a === 'split')     return tryMove({ t:'split' });
    if (a === 'surrender') return tryMove({ t:'surrender' });
    if (a === 'ins-yes')   return tryMove({ t:'ins', take:true });
    if (a === 'ins-no')    return tryMove({ t:'ins', take:false });
    return;
  }
  /* 31 */
  if (a === 'knock')          return tryMove({ t:'knock' });
  if (a === 'draw-stock')     return tryMove({ t:'draw', from:'stock' });
  if (a === 'draw-discard')   return tryMove({ t:'draw', from:'discard' });
  if (a === 'discard'){
    const c = +t.getAttribute('data-c');
    return tryMove({ t:'discard', c });
  }
}

function nag(err){
  if (/turn/.test(String(err))) return '⚠ ' + T('Not your go yet.', 'Għadu mhux imissek.');
  return '⚠ ' + T('The rules said no.', 'Ir-regoli qalu le.');
}
function tryMove(mv){
  const me = mySeat();
  mv.seat = me;
  const r = doMove(me, mv, 'tap');
  if (!r.ok){
    cue('ui.error', { gain: 0.9 }, true);
    if (K && K.toast) K.toast(nag(r.err));
    return;
  }
  render();
}

/* ═══════════════════════════════════════════════════════════════════
   TOTALS + WORDS — the engines write no player text (js/lang.js rule 5),
   so the words for an outcome live HERE at the point of display.
   ═══════════════════════════════════════════════════════════════════ */
function bjTotalHTML(cards, hidden){
  /* hidden: draw a '?' rather than a value (dealer hole card down) */
  if (hidden) return '<span class="bt-tot">?</span>';
  const e = BJ.engine;
  const hv = e.handValue(cards);
  const cls = hv.bust ? 'bust' : hv.blackjack ? 'bj' : hv.soft ? 'soft' : '';
  const txt = hv.blackjack ? T('BJ', 'BJ') : String(hv.total);
  return '<span class="bt-tot ' + cls + '">' + esc(txt) + '</span>';
}
const OUT = BJ.engine.OUT;
function bjOutWords(o){
  switch (o){
    case OUT.BJ:   return { cls:'bj',   txt:T('Blackjack', 'Blackjack') };
    case OUT.WIN:  return { cls:'win',  txt:T('Win', 'Rebħa') };
    case OUT.PUSH: return { cls:'push', txt:T('Push', 'Patta') };
    case OUT.SURR: return { cls:'lose', txt:T('Surrendered', 'Ċedejt') };
    default:       return { cls:'lose', txt:T('Lose', 'Tellift') };
  }
}
/* 31 single-suit total, with the three-of-a-kind and 31 marked */
function tlTotalHTML(cards){
  const e = TL.engine;
  const sc = e.scoreHand(cards);
  const cls = sc.thirtyOne ? 'bj' : '';
  const txt = sc.threeKind ? T('30½', '30½') : String(sc.total);
  return '<span class="bt-tot ' + cls + '">' + esc(txt) + '</span>';
}

/* ═══════════════════════════════════════════════════════════════════
   RENDER — one repaint of the felt for whichever engine is live.
   ═══════════════════════════════════════════════════════════════════ */
function render(){
  if (!M || M.dead || !M.ctx || !UI) return;
  if (M.mode === '21') render21(); else render31();
  const done = E().over(M.st);
  if (rulesOpen) paintRules();
  paintTurn(done);
  if (done){ finish(done); return; }
  step();
}

/* ── 21: THE CASINO TABLE ─────────────────────────────────────────
   Dealer at the crown, the printed arc silk-screened on the felt, the
   other chairs in a shallow arc beneath it, your own hand(s) on their
   bet spots at the base, the thumb controls under that. The winner
   screen slides over the base when the round settles. ── */

/* the felt print, built once per rules signature (payout + S17/H17) */
function paintArc21(st){
  const pay = st.rule.bjPay[0] + ':' + st.rule.bjPay[1];
  const drawLine = st.rule.h17
    ? T('DEALER HITS SOFT 17', 'IL-BANK JIĠBED FUQ SOFT 17')
    : T('DEALER MUST DRAW TO 16 AND STAND ON ALL 17',
        'IL-BANK JIĠBED SA 16 U JIEQAF FUQ KULL 17');
  const key = pay + '|' + drawLine + '|' + (window.KARTI_LANG ? KARTI_LANG.lang : '');
  if (UI.arcKey === key) return;
  UI.arcKey = key;
  UI.arc.innerHTML =
    '<svg viewBox="0 0 360 128" preserveAspectRatio="xMidYMid meet" ' +
        'aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<path id="bt-a1" d="M20 66 Q 180 6 340 66"/>' +
        '<path id="bt-a2" d="M34 92 Q 180 38 326 92"/>' +
        '<path id="bt-a3" d="M52 116 Q 180 70 308 116"/>' +
      '</defs>' +
      '<path class="rail" d="M6 62 Q 180 -6 354 62"/>' +
      '<path class="rail2" d="M10 66 Q 180 -1 350 66"/>' +
      '<text class="t1"><textPath href="#bt-a1" startOffset="50%" text-anchor="middle">' +
        esc(T('BLACKJACK PAYS ', 'BLACKJACK IĦALLAS ') + pay) + '</textPath></text>' +
      '<text class="t2"><textPath href="#bt-a2" startOffset="50%" text-anchor="middle">' +
        esc(drawLine) + '</textPath></text>' +
      '<text class="t3"><textPath href="#bt-a3" startOffset="50%" text-anchor="middle">' +
        esc(T('INSURANCE PAYS 2 TO 1', 'L-ASSIGURAZZJONI TĦALLAS 2 MA\' 1')) + '</textPath></text>' +
      '<path class="pip" d="M30 104l4 5-4 5-4-5z"/><path class="pip" d="M330 104l4 5-4 5-4-5z"/>' +
    '</svg>';
}

/* one word for a hand's public state (the pods and the winner rows) */
function handTag21(st, h, settled){
  const hv = BJ.engine.handValue(h.cards);
  if (settled && h.out){
    const o = bjOutWords(h.out);
    return { txt: o.txt, cls: o.cls === 'bj' ? 'bj' : o.cls === 'win' ? 'good' : o.cls === 'push' ? '' : 'bad' };
  }
  if (h.surrendered) return { txt: T('Surr.', 'Ċeda'), cls: 'bad' };
  if (h.bust)        return { txt: T('Bust', 'Ħaraq'), cls: 'bad' };
  if (!hv.unknown && hv.blackjack) return { txt: 'BJ', cls: 'bj' };
  if (h.done)        return { txt: T('Stand', 'Wieqaf'), cls: '' };
  return null;
}

function render21(){
  const e = BJ.engine, st = M.st, me = mySeat();
  const t = e.turn(st);
  const settling = st.phase === 'settle' && st.show;
  const holeDown = st.dealer && st.dealer.hole;
  const short = (UI.root.clientHeight || 500) < 430;
  const cw = short ? 38 : 50;

  UI.opps.style.display = 'none';
  UI.mid.style.display = 'none';
  UI.arc.style.display = '';
  paintArc21(st);

  /* — the dealer, at the crown of the table — */
  const d = st.dealer || { cards: [] };
  let dcards = d.cards.map((c, i) =>
    (holeDown && i === 1) ? cardBtn(-1, { face:false, w: cw }) : cardBtn(c, { w: cw })
  ).join('');
  /* online the hole card exists at the pit before it exists in the
     state — show its back the moment the up-card is on the felt */
  if (holeDown && d.cards.length === 1) dcards += cardBtn(-1, { face:false, w: cw });
  if (!d.cards.length){ dcards = slot(cw) + slot(cw); }
  const dTot = !d.cards.length ? ''
    : holeDown ? bjTotalHTML(d.cards.slice(0, 1), false)
    : bjTotalHTML(d.cards, false);
  UI.top.innerHTML =
    '<span class="bt-lbl">' + esc(T('Dealer', 'Il-bank')) + '</span>' +
    '<div class="bt-dealer"><span class="bt-hand">' + dcards + '</span>' + dTot + '</div>';

  /* — the other chairs, along the arc — */
  const others = [];
  for (let i = 0; i < st.n; i++) if (i !== me) others.push(i);
  UI.pods.style.display = others.length ? '' : 'none';
  if (others.length){
    const m = others.length;
    UI.pods.innerHTML = others.map((i, k) => {
      const s = st.seats[i];
      const podW = short ? 13 : 16;
      const tt = (k + 0.5) / m;                       /* the arc dip     */
      const dip = m > 1 ? Math.round(14 * (1 - Math.pow(2 * tt - 1, 2))) : 10;
      const acting = (t === i && (st.phase === 'play' || st.phase === 'insurance'));
      const handRows = s.hands.map(h => {
        const cs = h.cards.map(c => (c == null)
          ? cardBtn(-1, { face:false, w: podW })
          : cardBtn(c, { w: podW, dim: h.bust || h.surrendered })).join('');
        return '<span class="h">' + cs + '</span>';
      }).join('');
      const h0 = s.hands[0];
      const hv0 = h0 ? BJ.engine.handValue(h0.cards) : null;
      const tag = h0 ? handTag21(st, h0, settling) : (s.gone
        ? { txt: T('Left', 'Telaq'), cls: 'bad' } : { txt: T('Sits out', 'Barra'), cls: '' });
      const tot = (h0 && !hv0.unknown && !s.gone)
        ? '<span class="bt-tot">' + esc(hv0.blackjack ? 'BJ' : String(hv0.total)) + '</span>'
        : (h0 ? '<span class="bt-tot">?</span>' : '');
      return '<div class="bt-pod' + (acting ? ' on' : '') + (s.gone ? ' out' : '') + '"' +
          ' style="transform:translateY(' + dip + 'px)">' +
        '<span class="n">' + esc(s.name) + '</span>' +
        handRows +
        '<span class="row">' + tot +
          (tag ? '<span class="tag ' + tag.cls + '">' + esc(tag.txt) + '</span>' : '') + '</span>' +
        '<span class="stk">' + chip('') + s.stack + '</span>' +
      '</div>';
    }).join('');
  }

  /* — the hint — */
  const insurance = st.phase === 'insurance' && t === me;
  UI.say.innerHTML = say21(st, me, t, insurance);

  /* — your seat: one or more hands, each on its own bet spot — */
  const s = st.seats[me];
  UI.me.innerHTML = (s.hands.length ? s.hands.map((h, hi) => {
    const acting = t === me && s.active === hi && st.phase === 'play';
    const cards = h.cards.map(c => (c == null)
      ? cardBtn(-1, { face:false, w: cw })
      : cardBtn(c, { w: cw, dim: h.done && (h.bust || h.surrendered) })).join('');
    const out = (settling && h.out) ? bjOutWords(h.out) : null;
    const spotCls = out ? (out.cls === 'lose' ? ' down' : out.cls === 'push' ? '' : ' up') : '';
    return '<div class="bt-myhand' + (acting ? ' on' : '') + '">' +
      '<span class="h">' + cards + '</span>' +
      '<span class="meta">' + bjTotalHTML(h.cards, false) +
        '<span class="bt-spot' + spotCls + '">' + chip('') + h.bet + '</span></span>' +
      (out ? '<span class="out ' + out.cls + '">' + esc(out.txt) + '</span>' : '') +
    '</div>';
  }).join('') : '<div class="bt-myhand"><span class="tag">' +
      esc(T('You sit this round out.', 'Toqgħod barra dan ir-round.')) + '</span></div>') +
    '<div class="bt-purse">' + esc(T('Your chips', 'Iċ-ċipep')) + '<b>' + s.stack + '</b></div>';

  /* — the controls — */
  paintActs21(st, me, t, insurance);

  /* — the winner screen — */
  paintWin21(st, me, settling);
}

/* the round-result card: who won, what every hand made, the chips that
   moved — and the one clear way to the next round. */
function paintWin21(st, me, settling){
  if (!UI || !UI.win) return;
  if (!settling){
    UI.win.classList.remove('open');
    UI.win.setAttribute('aria-hidden', 'true');
    return;
  }
  const e = BJ.engine;
  const show = st.show;
  /* my own net this round decides the headline */
  let myNet = 0, anyNet = false;
  show.rows.forEach(r => { if (r.seat === me){ myNet += (r.ret - r.bet); anyNet = true; } });
  const toneCls = !anyNet ? 'push' : myNet > 0 ? 'win' : myNet < 0 ? 'lose' : 'push';
  const head = !anyNet ? T('Round over', 'Spiċċa r-round')
    : myNet > 0 ? T('You win!', 'Rbaħt!')
    : myNet < 0 ? T('The bank takes it', 'Il-bank jieħu')
    : T('Push', 'Patta');
  const dLine = show.dealerBust ? T('Dealer busts', 'Il-bank jinħaraq')
    : show.dealerBJ ? T('Dealer blackjack', 'Blackjack tal-bank')
    : T('Dealer', 'Il-bank') + ' ' + show.dealerTotal;
  const dCards = show.dealer.map(c => cardBtn(c, { w: 26 })).join('');

  /* one row per seat: every hand's word + the seat's net chips */
  const perSeat = {};
  show.rows.forEach(r => {
    if (!perSeat[r.seat]) perSeat[r.seat] = { net: 0, made: [] };
    perSeat[r.seat].net += (r.ret - r.bet);
    const w = bjOutWords(r.out);
    const word = r.out === 'bj' ? 'BJ'
      : r.bust ? T('Bust', 'Ħaraq')
      : r.out === 'surr' ? T('Surr.', 'Ċeda')
      : r.out === 'push' ? String(r.total)
      : (r.total ? String(r.total) : w.txt);
    perSeat[r.seat].made.push({
      word, cls: r.out === 'bj' ? 'bj' : r.bust ? 'bust' : r.out === 'win' ? 'win' : ''
    });
  });
  const order = Object.keys(perSeat).map(Number).sort((a, b) => {
    if (perSeat[b].net !== perSeat[a].net) return perSeat[b].net - perSeat[a].net;
    return (a === me ? -1 : b === me ? 1 : a - b);
  });
  const rows = order.map(si => {
    const p = perSeat[si];
    const net = p.net > 0 ? '+' + p.net : String(p.net);
    const cls = p.net > 0 ? 'up' : p.net < 0 ? 'dn' : 'zz';
    return '<div class="bt-win-r">' +
      '<span class="who">' + esc(si === me ? T('You', 'Int') : st.seats[si].name) + '</span>' +
      '<span class="made">' + p.made.map(mm =>
        '<em class="' + mm.cls + '">' + esc(mm.word) + '</em>').join('') + '</span>' +
      '<span class="net ' + cls + '">' + esc(net) + '</span>' +
    '</div>';
  }).join('');

  const online = !!(M.net && M.online);
  const iAmHost = !online || !!(M.net && M.net.host);
  const foot = iAmHost
    ? '<button class="bt-act" data-act="next">' + esc(T('Deal the next round', 'Qassam ir-round li jmiss')) + '</button>'
    : '<span class="wait">' + esc(T('The bank deals the next round…', 'Il-bank iqassam ir-round li jmiss…')) + '</span>';
  UI.win.innerHTML =
    '<div class="bt-win-h"><b class="' + toneCls + '">' + esc(head) + '</b>' +
      '<i>' + esc(T('Round', 'Round') + ' ' + st.round + ' · ' + dLine) + '</i></div>' +
    '<div class="bt-win-d">' + dCards +
      bjTotalHTML(show.dealer, false) + '</div>' +
    '<div class="bt-win-b">' + rows + '</div>' +
    '<div class="bt-win-f">' +
      '<span class="bank">' + esc(T('Your chips', 'Iċ-ċipep')) + '<b>' +
        st.seats[me].stack + '</b></span>' + foot +
    '</div>';
  UI.win.classList.add('open');
  UI.win.setAttribute('aria-hidden', 'false');
}

function say21(st, me, t, insurance){
  const done = BJ.engine.over(st);
  if (done) return '';
  if (st.phase === 'settle') return esc(T('Round over.', 'Spiċċa r-round.'));
  if (insurance)
    return '<b>' + esc(T('Insurance?', 'Assigurazzjoni?')) + '</b> ' +
      esc(T('The dealer shows an ace. Half your bet, pays 2:1 if the dealer has blackjack.',
            'Il-bank juri ass. Nofs l-imħatra, tħallas 2:1 jekk il-bank ikollu blackjack.'));
  if (st.phase === 'insurance')
    return esc(T('Insurance is being offered…', 'Qed tiġi offruta l-assigurazzjoni…'));
  if (st.phase === 'up') return esc(T('The dealer deals…', 'Il-bank iqassam…'));
  if (st.phase === 'peek')
    return esc(T('The dealer peeks at the hole card…', 'Il-bank jittawwal lejn il-karta mgħottija…'));
  if (st.phase === 'show')
    return esc(t === me ? T('Showdown — your cards turn over.', 'Showdown — il-karti tiegħek jinqalbu.')
                        : T('Showdown — hands turn over…', 'Showdown — l-idejn jinqalbu…'));
  if (t === me && st.phase === 'play')
    return '<b>' + esc(T('Your go.', 'Imissek.')) + '</b> ' +
      esc(T('Hit for a card, or stand.', 'Ħu karta, jew ieqaf.'));
  if (t === BJ.engine.DEALER) return esc(T('The dealer plays…', 'Il-bank jilgħab…'));
  if (t >= 0 && st.seats[t])
    return esc(st.seats[t].name + ' ' + T('is thinking…', 'qed jaħseb…'));
  return esc(T('Dealing…', 'Qed inqassam…'));
}

function paintActs21(st, me, t, insurance){
  const e = BJ.engine;
  if (e.over(st) || st.phase === 'settle' || st.phase === 'dealer' ||
      st.phase === 'up' || st.phase === 'peek' || st.phase === 'show'){
    UI.acts.innerHTML = ''; return;
  }
  if (insurance){
    UI.acts.innerHTML =
      '<button class="bt-act ghost" data-act="ins-no">' + esc(T('No insurance', 'Le')) + '</button>' +
      '<button class="bt-act" data-act="ins-yes">' + esc(T('Insure', 'Assigura')) +
        '<small>' + Math.floor(st.bet / 2) + '</small></button>';
    return;
  }
  const mine = t === me && st.phase === 'play';
  if (!mine){ UI.acts.innerHTML = ''; return; }
  const legal = e.legal(st, me).map(m => m.t);
  const has = k => legal.indexOf(k) >= 0;
  UI.acts.innerHTML =
    '<button class="bt-act" data-act="hit"' + (has('hit') ? '' : ' disabled') + '>' +
      esc(T('Hit', 'Iġbed')) + '</button>' +
    '<button class="bt-act ghost" data-act="stand"' + (has('stand') ? '' : ' disabled') + '>' +
      esc(T('Stand', 'Ieqaf')) + '</button>' +
    (has('double') ? '<button class="bt-act ghost" data-act="double">' +
      esc(T('Double', 'Irdoppja')) + '</button>' : '') +
    (has('split') ? '<button class="bt-act ghost" data-act="split">' +
      esc(T('Split', 'Aqsam')) + '</button>' : '') +
    (has('surrender') ? '<button class="bt-act ghost" data-act="surrender">' +
      esc(T('Surrender', 'Ċedi')) + '</button>' : '');
}

/* ── 31 ─────────────────────────────────────────────────────────── */
function render31(){
  const e = TL.engine, st = M.st, me = mySeat();
  const t = e.turn(st);
  const showing = st.show && st.roundOver;
  const short = (UI.root.clientHeight || 500) < 430;
  const cw = short ? 40 : 54;

  UI.top.innerHTML = '';
  UI.opps.style.display = '';
  UI.mid.style.display = '';
  if (UI.arc){ UI.arc.style.display = 'none'; }
  if (UI.pods){ UI.pods.style.display = 'none'; }
  if (UI.win){ UI.win.classList.remove('open'); UI.win.setAttribute('aria-hidden', 'true'); }

  /* — the other seats: face-down hands, lives, and a knock flag. Their
       cards only ever turn over at the showdown. — */
  UI.opps.innerHTML = st.seats.map((p, i) => {
    if (i === me) return '';
    const reveal = showing;
    const cards = p.out ? '' :
      '<span class="h">' +
        (reveal && p.hand.length
          ? p.hand.map(c => cardBtn(c, { w: short ? 15 : 18 })).join('')
          : p.hand.map(() => cardBtn(-1, { face:false, w: short ? 15 : 18 })).join('')) +
      '</span>';
    const lives = '<span class="lives">' +
      Array.from({ length: M.opts.lives || 3 }, (_, k) => lifePip(k < p.lives)).join('') + '</span>';
    const tag = p.out ? T('OUT', 'BARRA')
              : st.knocked === i ? T('KNOCK', 'ĦABBAT')
              : (reveal && showing.losers && showing.losers.indexOf(i) >= 0 ? T('−1', '−1') : '');
    return '<div class="bt-opp' + (t === i ? ' on' : '') + (p.out ? ' out' : '') +
        (st.knocked === i ? ' knock' : '') + '">' +
      '<span class="n">' + esc(p.name) + '</span>' + cards + lives +
      (tag ? '<span class="tag">' + esc(tag) + '</span>' : '') +
    '</div>';
  }).join('');

  /* — the middle: draw pile + discard — */
  const top = st.discard.length ? st.discard[st.discard.length - 1] : -1;
  const meS = st.seats[me];
  const canDrawStock = t === me && !meS.drew && st.phase === 'play';
  const canDrawDisc = canDrawStock && st.discard.length;
  UI.mid.className = 'bt-mid';
  UI.mid.innerHTML =
    '<div class="bt-piles">' +
      '<div class="bt-pile' + (canDrawStock ? ' pick' : '') + '"' +
        (canDrawStock ? ' data-act="draw-stock"' : '') + '>' +
        (st.stock.length ? cardBtn(-1, { face:false, w: short ? 34 : 42 }) : slot(short ? 34 : 42)) +
        '<span class="cap">' + esc(T('Draw', 'Iġbed')) + '</span></div>' +
      '<div class="bt-pile' + (canDrawDisc ? ' pick' : '') + '"' +
        (canDrawDisc ? ' data-act="draw-discard"' : '') + '>' +
        (top >= 0 ? cardBtn(top, { w: short ? 34 : 42 }) : slot(short ? 34 : 42)) +
        '<span class="cap">' + esc(T('Discard', 'Skart')) + '</span></div>' +
    '</div>' +
    '<span class="bt-note" aria-hidden="true">' +
      esc(T('Round', 'Round') + ' ' + st.round) + '</span>' +
    '<span class="bt-mode" aria-hidden="true">' + esc(modeName('31') + ' · ' +
      (st.mode === 'coins' ? T('COINS', 'MUNITI') : T('FREE', 'ĦIELES'))) + '</span>';

  /* — the hint — */
  UI.say.innerHTML = say31(st, me, t);

  /* — your seat: your three (or four mid-turn) cards, single-suit total,
       your lives. Tap a card to discard when you owe one. — */
  const owe = t === me && meS.drew && st.phase === 'play';
  const cardsHTML = meS.hand.map(c =>
    cardBtn(c, { w: cw, cls: owe ? 'bt-lit' : '' })
  ).join('');
  UI.me.innerHTML =
    '<div class="bt-myhand on">' +
      '<span class="h" id="bt-myhand">' + cardsHTML + '</span>' +
      '<span class="meta">' + tlTotalHTML(meS.hand) +
        '<span class="lives">' +
          Array.from({ length: M.opts.lives || 3 }, (_, k) => lifePip(k < meS.lives)).join('') +
        '</span></span>' +
    '</div>';
  if (owe){
    /* each of your cards becomes a discard target */
    UI.me.querySelectorAll('#bt-myhand .kb-card').forEach((el, k) => {
      const c = meS.hand[k];
      el.setAttribute('data-act', 'discard');
      el.setAttribute('data-c', String(c));
      el.style.cursor = 'pointer';
    });
  }

  paintActs31(st, me, t);
}

function say31(st, me, t){
  const e = TL.engine;
  if (e.over(st)) return '';
  if (st.phase === 'settle')
    return esc(T('Round over. Deal the next.', 'Spiċċa r-round. Qassam ieħor.'));
  const meS = st.seats[me];
  if (t === me && st.phase === 'play'){
    if (!meS.drew)
      return '<b>' + esc(T('Your go.', 'Imissek.')) + '</b> ' +
        esc(st.knocked >= 0
          ? T('Somebody knocked — draw and discard, no knocking.', 'Xi ħadd ħabbat — iġbed u skarta, ma tistax tħabbat.')
          : T('Draw a card, or knock.', 'Iġbed karta, jew ħabbat.'));
    return '<b>' + esc(T('Now throw one.', 'Issa itfa\' waħda.')) + '</b> ' +
      esc(T('Tap a card to discard it.', 'Ikklikkja karta biex tarmiha.'));
  }
  if (t >= 0 && st.seats[t]) return esc(st.seats[t].name + ' ' + T('is thinking…', 'qed jaħseb…'));
  return esc(T('Dealing…', 'Qed inqassam…'));
}

function paintActs31(st, me, t){
  const e = TL.engine;
  if (e.over(st) || st.phase === 'settle'){ UI.acts.innerHTML = ''; return; }
  const meS = st.seats[me];
  const mine = t === me && st.phase === 'play';
  if (!mine || meS.drew){ UI.acts.innerHTML = ''; return; }
  const legal = e.legal(st, me).map(m => m.t + (m.from ? ':' + m.from : ''));
  const canKnock = legal.indexOf('knock') >= 0;
  UI.acts.innerHTML =
    '<button class="bt-act" data-act="draw-stock">' + esc(T('Draw', 'Iġbed')) + '</button>' +
    (st.discard.length
      ? '<button class="bt-act ghost" data-act="draw-discard">' + esc(T('Take discard', 'Ħu l-iskart')) + '</button>'
      : '') +
    (canKnock
      ? '<button class="bt-act hot" data-act="knock">' + esc(T('Knock', 'Ħabbat')) + '</button>'
      : '');
}

/* ── the turn strip ─────────────────────────────────────────────── */
function paintTurn(done){
  const e = E(), st = M.st;
  const t = e.turn(st);
  if (done){ P.ui.setTurn(M.ctx, { cls:'', who:done.head, note:'' }); return; }
  const who = st.phase === 'settle' ? T('Round over', 'Spiċċa r-round')
            : (M.mode === '21' && st.phase === 'dealer') ? T('The dealer…', 'Il-bank…')
            : t < 0 ? T('The table…', 'Il-mejda…')
            : isLocal(t) ? T('Your turn', 'Imissek')
            : (st.seats[t] ? st.seats[t].name + ' ' + T('is thinking…', 'qed jaħseb…') : '…');
  const note = M.mode === '21'
    ? (T('Round', 'Round') + ' ' + st.round)
    : (T('Round', 'Round') + ' ' + st.round);
  P.ui.setTurn(M.ctx, { cls: (t >= 0 && isLocal(t)) ? 'w' : '', who, note });
}

/* ═══════════════════════════════════════════════════════════════════
   THE BEAT — table beats and the machine, timered. Both engines expose
   turn()===TABLE/DEALER (-1) for a beat only the table takes; the AI
   move is think() in both.
   ═══════════════════════════════════════════════════════════════════ */
function step(){
  stopThinking();
  const e = E(), st = M.st;
  const t = e.turn(st);
  const TABLE = -1;

  /* ── 21's own beats ── */
  if (M.mode === '21'){
    /* the round SETTLES ON THE WINNER SCREEN — no auto-deal. The next
       round waits for the button (the host's, online). */
    if (st.phase === 'settle') return;
    /* ONLINE (lanes): the bank's beats belong to the HOST — it alone
       holds the bank shoe, and its 'up'/'peek'/'reveal' moves reach
       everybody over the wire as ordinary logged moves. */
    if (M.net && M.online && M.online.mode === '21'){
      if (st.phase === 'show'){
        /* the showdown: each seat turns over its OWN hand, automatically,
           the moment the table looks at it. */
        if (t === M.online.meG){
          M.timer = setTimeout(() => {
            M.timer = 0;
            if (!M || M.dead) return;
            const stx = M.st;
            if (stx.phase !== 'show' || E().turn(stx) !== M.online.meG) return;
            const mine = stx.seats[M.online.meG].hands;
            /* NEVER show a hand we cannot see ourselves (our lane has
               not arrived yet — a rejoin race). The lane's arrival
               rebuilds and re-renders, and this beat fires again. */
            if (mine.some(h => h.cards.some(c => c == null))) return;
            const hands = mine.map(h => h.cards.map(c => c | 0));
            doMove(M.online.meG, { t:'show', hands }, 'show');
            render();
          }, FAST ? 1 : 420);
        }
        return;
      }
      if (t === TABLE && M.net.host){
        const beat = bankBeat(st);       /* null when not the bank's turn */
        if (!beat) return;
        M.timer = setTimeout(() => {
          M.timer = 0;
          if (!M || M.dead) return;
          const b2 = bankBeat(M.st);
          if (!b2) return;
          doMove(TABLE, b2.mv, 'table');
          render();
        }, FAST ? 1 : beat.ms);
        return;
      }
      if (t === TABLE) return;           /* not ours: the wire brings it */
    }
  }

  if (t === TABLE){
    /* a settle/table beat: auto-advance to the next round after a pause
       long enough to read the result. */
    const opts = e.legal(st, TABLE);
    if (!opts.length) return;
    const ms = FAST ? 1 : (st.phase === 'settle' ? 2600 : 700);
    M.timer = setTimeout(() => {
      M.timer = 0;
      if (!M || M.dead) return;
      doMove(TABLE, opts[0], 'auto');
      render();
    }, ms);
    return;
  }
  if (t < 0 || isLocal(t)) return;
  if (ownerOf(t) === 'net') return;
  /* ONLINE: only the HOST drives the machine seats (konkwista-ui's rule,
     js/konkwista-ui.js's step). Without this every client would think()
     the same bot move, apply it locally AND broadcast it, and the relay
     would serialize both copies — each phone lands the duplicate at a
     different log index and the lockstep breaks. The host's bot move
     reaches everyone else as an ordinary 'net' move via onlineRemote. */
  if (M.net && !M.net.host) return;
  M.timer = setTimeout(() => {
    M.timer = 0;
    if (!M || M.dead) return;
    if (E().turn(M.st) !== t) return;
    let mv = null;
    try { mv = E().think(M.st, t, M.st.seats[t].lvl || 2); } catch(e2){ mv = null; }
    if (!mv || !E().check(M.st, mv, t)) mv = (E().legal(M.st, t) || [])[0];
    if (!mv) return;
    mv.seat = t;
    doMove(t, mv, 'ai');
    render();
  }, FAST ? 1 : (520 + ((Date.now() % 5) * 90)));
}

/* ═══════════════════════════════════════════════════════════════════
   THE END — the TABLE breaking up (21: you are out of chips; 31: one
   player left with lives). Standings go through KARTI_REBBIEH.
   ═══════════════════════════════════════════════════════════════════ */
function finish(done){
  if (M.finished) return;
  M.finished = true;
  stopThinking();
  cueIn(260, () => cue(done.tone === 'win' ? 'game.win'
                     : done.tone === 'lose' ? 'game.lose' : 'ui.toast', { gain: 1 }, true));

  if (!M.net && !M.recordedTable){
    M.recordedTable = true;
    const o = done.tone === 'win' ? 'w' : done.tone === 'lose' ? 'l' : 'd';
    ST.rec[o] = (ST.rec[o] | 0) + 1; persist();
    if (typeof P.record === 'function'){ try { P.record('cards2131', o); } catch(e){} }
  }
  /* COINS settles here and nowhere else. Locked behind the flag. */
  if (COINS_MODE_READY && M.mode === '21' && M.st.mode === 'coins' && !M.cashed){
    M.cashed = true;
    const left = M.st.seats[mySeat()].stack | 0;
    if (left > 0) coinMove(left);
  }
  saveSlot(null);

  const rows = standingsRows(done);
  const reduced = !!(document.body && document.body.classList.contains('reduced'));
  const R = window.KARTI_REBBIEH;
  const backToShelf = () => { leave(); P.hub(); };
  if (R && R.show){
    R.show({
      title: done.tone === 'win' ? T('Winner!', 'Rebbieħ!')
           : done.tone === 'lose' ? T('Table over', 'Spiċċat il-mejda')
           : T('Table over', 'Spiċċat il-mejda'),
      subtitle: modeName(M.mode) + ' · ' + T('Final standings', 'Klassifika finali'),
      rows,
      reduced,
      sound: id => cue(id, { gain: 0.9 }, true),
      playAgainLabel: T('Play again', 'Erġa\' lgħab'),
      onPlayAgain: () => setupSheet(),
      onLeave: backToShelf
    });
  } else {
    /* rebbieh not present (should not happen) — fall back to the frame's
       own result card so the table still ends cleanly */
    P.ui.result(M.ctx, {
      tone: done.tone || 'draw', head: done.head, why: done.why, quip: done.quip,
      buttons: [
        { label: T('Play again', 'Erġa\' lgħab'), icon:'refresh', cls:'primary', go: () => setupSheet() },
        { label: T('Back to the shelf', 'Lura lejn l-ixkaffa'), icon:'back', cls:'ghost', go: backToShelf }
      ]
    });
  }
}

/* the standings rows rebbieh draws — one per seat, in finish order, with
   the local player flagged and the machine tagged a bot. */
function standingsRows(done){
  const e = E(), st = M.st, me = mySeat();
  const av = seatAvatars();
  if (M.mode === '21'){
    const t = e.tally(st);
    /* one seat table: rank by net chips won, you first among ties */
    const order = st.seats.map((s, i) => i).sort((a, b) => {
      const na = t[a].net, nb = t[b].net;
      if (nb !== na) return nb - na;
      return (a === me ? -1 : b === me ? 1 : a - b);
    });
    return order.map((i, k) => ({
      place: k + 1,
      name: i === me ? T('You', 'Int') : st.seats[i].name,
      avatar: i === me ? av.me : null,
      you: i === me, bot: !isLocal(i),
      score: (t[i].net >= 0 ? '+' : '') + t[i].net
    }));
  }
  /* 31: rank by lives left (winner has them all), you flagged */
  const t = e.tally(st);
  const order = st.seats.map((s, i) => i).sort((a, b) => {
    if (t[b].lives !== t[a].lives) return t[b].lives - t[a].lives;
    if (t[b].roundsWon !== t[a].roundsWon) return t[b].roundsWon - t[a].roundsWon;
    return (a === me ? -1 : b === me ? 1 : a - b);
  });
  return order.map((i, k) => ({
    place: k + 1,
    name: i === me ? T('You', 'Int') : st.seats[i].name,
    avatar: i === me ? av.me : null,
    you: i === me, bot: !isLocal(i),
    score: t[i].lives > 0
      ? t[i].lives + (t[i].lives === 1 ? T(' life', ' ħajja') : T(' lives', ' ħajjiet'))
      : T('out', 'barra')
  }));
}
/* the local player's avatar, if the app has one; nulls fall back to the
   initials tile rebbieh draws. */
function seatAvatars(){
  let me = null;
  try { if (K && K.avatar) me = K.avatar(); } catch(e){}
  try { if (!me && K && K.S && K.S.avatar) me = K.S.avatar; } catch(e){}
  return { me };
}

/* ═══════════════════════════════════════════════════════════════════
   OPENING A GAME
   ═══════════════════════════════════════════════════════════════════ */
function newGame(mode, opts, snap){
  injectCSS();
  P.show();
  const m = snap
    ? (snap.opts ? startMatch(snap.mode || '21', snap.opts, snap.seed, snap.log) : null)
    : startMatch(mode, opts);
  if (!m) return;
  M.meta = M.st.seats.map((s, i) => ({
    name: isLocal(i) ? T('You', 'Int') : levelWords(s.lvl).n + ' ' + Math.max(1, i),
    own: s.own, lvl: s.lvl
  }));
  applyMeta();
  M.finished = false;
  if (COINS_MODE_READY && !snap && M.mode === '21' && M.st.mode === 'coins'){
    coinMove(-(M.opts.stack | 0));
  }
  openBoard(() => setupSheet());
  render();
  cue('game.start', { gain: 0.9 }, true);
  cueIn(280, () => {
    cue('card.shuffle', { gain: 0.85 }, true);
    const S = window.KARTI_SFX;
    if (S && S.run) cueIn(220, () => S.run('card.deal', 4, 95, { gain: 0.5 }));
  });
}

function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: 'KAŻINÒ',
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'bt-rules', label:T('Rules', 'Regoli'), icon:'book',    cls:'ghost' },
      { id:'bt-new',   label:T('New', 'Ġdida'),    icon:'refresh', cls:'ghost' }
    ]
  });
  if (M.ctx.stopFit) M.ctx.stopFit();
  /* WHAT THIS TABLE IS PLAYING FOR, on the frame badge. A staked online
     room (host picked "for chips" in the lobby) names its REAL pot; every
     other sitting is table chips and says Free. Read-only off js/mp.js —
     the game's own chips stay the sim's play money either way, and
     nothing here can move a wallet chip (mp.js owns every verb). */
  M.ctx.badge.textContent = modeName(M.mode) + ' · ' +
    (stakeBadge() || (M.st.mode === 'coins' ? T('Coins', 'Muniti') : T('Free', 'Ħieles')));
  table();
  M.ctx.btn('bt-rules').onclick = () => setRules(!rulesOpen);
  paintRules();
  const nb = M.ctx.btn('bt-new');
  if (nb) nb.onclick = () => setupSheet();
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

/* ═══════════════════════════════════════════════════════════════════
   THE RULES CARD — one per mode, told once, in both languages.
   ═══════════════════════════════════════════════════════════════════ */
function rules21(st){
  const decks = st ? st.decks : 6;
  const h17 = st ? st.rule.h17 : false;
  const bjPay = st ? st.rule.bjPay : [3, 2];
  const free = !st || st.mode !== 'coins';
  return [
    T('<b>Get closer to 21 than the dealer</b> without going over. Face cards are ten, an ace is ' +
      'one or eleven, whichever helps.',
      '<b>Ersaq lejn il-21 aktar mill-bank</b> mingħajr ma taqbeż. Il-karti tal-wiċċ jgħoddu ' +
      'għaxra, l-ass wieħed jew ħdax, skont x’jaqbillek.'),
    T('You are dealt two cards up; the dealer takes one up and one <b>face down</b> — the hole ' +
      'card — which is only turned over after you have finished.',
      'Tingħata żewġ karti bil-wiċċ ’il fuq; il-bank jieħu waħda ’l fuq u waħda <b>mgħottija</b> ' +
      '— li tinqaleb biss wara li tispiċċa int.'),
    T('<b>Hit</b> for another card, <b>Stand</b> to hold. Go over 21 and you <b>bust</b> — you ' +
      'lose at once, even if the dealer busts after you.',
      '<b>Iġbed</b> karta oħra, <b>Ieqaf</b> biex iżżomm. Aqbeż il-21 u <b>tinħaraq</b> — titlef ' +
      'mill-ewwel, anke jekk il-bank jinħaraq warajk.'),
    T('<b>Double</b> doubles your bet for exactly one more card. <b>Split</b> a pair into two ' +
      'hands, each with its own bet. <b>Surrender</b> gives up half the bet and folds the hand.',
      '<b>Irdoppja</b> jirdoppja l-imħatra għal karta waħda biss. <b>Aqsam</b> par f’żewġ idejn, ' +
      'kull waħda bl-imħatra tagħha. <b>Ċedi</b> jħalli nofs l-imħatra u jagħlaq l-id.'),
    T('A <b>blackjack</b> — an ace and a ten on the first two cards — pays <b>' + bjPay[0] + ':' +
      bjPay[1] + '</b>' + (bjPay[0] === 3 && bjPay[1] === 2 ? '' : T(' (worse for you than 3:2)',
      ' (agħar għalik minn 3:2)')) + '. A 21 made of three cards is not a blackjack.',
      '<b>Blackjack</b> — ass u għaxra fl-ewwel żewġ karti — iħallas <b>' + bjPay[0] + ':' +
      bjPay[1] + '</b>' + (bjPay[0] === 3 && bjPay[1] === 2 ? '' : T(' (agħar għalik minn 3:2)',
      ' (agħar għalik minn 3:2)')) + '. 21 magħmul minn tliet karti mhux blackjack.'),
    T('The dealer plays a <b>fixed rule</b>: hit under 17, ' + (h17
      ? 'and hit a soft 17 too (H17)' : 'and stand on all 17s (S17)') + '. No choices.',
      'Il-bank jilgħab b’<b>regola fissa</b>: jiġbed taħt is-17, ' + (h17
      ? 'u jiġbed anke fuq soft 17 (H17)' : 'u jieqaf fuq kull 17 (S17)') + '. Bla għażliet.'),
    free
      ? T('<b>These chips are the table’s.</b> They exist while this table does and nothing here ' +
          'touches your KARTI coins.',
          '<b>Dawn iċ-ċipep huma tal-mejda.</b> Jeżistu sakemm teżisti din il-mejda u xejn hawn ' +
          'ma jmiss il-muniti KARTI tiegħek.')
      : T('<b>These are your KARTI coins.</b> The buy-in came off when you sat down.',
          '<b>Dawn huma l-muniti KARTI tiegħek.</b> Il-buy-in tneħħa meta poġġejt bilqiegħda.'),
    T('The table ends when you run out of chips.',
      'Il-mejda tispiċċa meta jispiċċawlek iċ-ċipep.'),
    T('This shoe is <b>' + decks + ' decks</b>.', 'Dan il-mazz huwa ta’ <b>' + decks + ' pakketti</b>.')
  ];
}
function rules31(st){
  const lives = st ? st.lives : 3;
  return [
    T('<b>Get as close to 31 as you can in ONE suit.</b> Only cards of the same suit add up: ' +
      'A♠K♠ is 21; a third card of another suit counts nothing.',
      '<b>Ersaq kemm tista’ lejn il-31 f’KULUR wieħed.</b> Biss karti tal-istess kulur jingħaddu: ' +
      'A♠K♠ huwa 21; it-tielet karta ta’ kulur ieħor ma tgħodd xejn.'),
    T('Faces and tens count ten, an ace eleven, the rest their number. <b>Three of a kind</b> ' +
      '(any suits) is worth 30½ — above 30, below 31.',
      'Il-wiċċ u l-għaxriet jgħoddu għaxra, l-ass ħdax, il-bqija n-numru tagħhom. <b>Tlieta ' +
      'l-istess</b> (kwalunkwe kulur) tiswa 30½ — fuq 30, taħt 31.'),
    T('On your go, <b>Draw</b> a card — off the shoe (unknown) or the top of the discard (you ' +
      'can see it) — then <b>throw one back</b> so you hold three again.',
      'Meta jmissek, <b>Iġbed</b> karta — mill-mazz (mhux magħruf) jew minn fuq l-iskart (tarah) ' +
      '— imbagħad <b>itfa’ waħda lura</b> biex terġa’ żżomm tlieta.'),
    T('Content? <b>Knock</b> instead of drawing. Everyone else gets one last turn, then hands are ' +
      'compared and the <b>lowest loses a life</b>.',
      'Kuntent? <b>Ħabbat</b> minflok tiġbed. Kulħadd jieħu turn wieħed ieħor, imbagħad l-idejn ' +
      'jitqabblu u <b>l-inqas jitlef ħajja</b>.'),
    T('A <b>31</b> (an ace and two tens in one suit) wins the round <b>the instant it is made</b> ' +
      '— everyone else loses a life at once.',
      '<b>31</b> (ass u żewġ għaxriet fl-istess kulur) jirbaħ ir-round <b>malli jsir</b> — kulħadd ' +
      'ieħor jitlef ħajja mill-ewwel.'),
    T('You start with <b>' + lives + ' lives</b>. Lose them all and you are out. Last player with ' +
      'a life left wins the table.',
      'Tibda b’<b>' + lives + ' ħajjiet</b>. Itlifhom kollha u toħroġ. L-aħħar plejer b’ħajja ' +
      'jirbaħ il-mejda.'),
    T('<b>No coins here.</b> Only lives are at stake — nothing touches your KARTI balance.',
      '<b>Ebda muniti hawn.</b> Biss il-ħajjiet huma fin-nofs — xejn ma jmiss il-bilanċ KARTI tiegħek.')
  ];
}
function rulesFor(){
  const st = M ? M.st : null;
  return M && M.mode === '31' ? rules31(st) : rules21(st);
}

function clampRules(){
  if (!UI || !UI.rules || !UI.me) return;
  try {
    const hr = UI.me.getBoundingClientRect();
    const rc = UI.root.getBoundingClientRect();
    if (hr.height > 0 && rc.height > 0){
      const room = Math.floor(hr.top - rc.top - 6);
      UI.rules.style.maxHeight = Math.min(Math.max(80, room), Math.floor(rc.height * 0.54)) + 'px';
    }
  } catch(e){}
}
window.addEventListener('resize', () => { if (UI && rulesOpen) clampRules(); });

function paintRules(){
  if (!UI || !UI.rules) return;
  clampRules();
  UI.rules.querySelector('#bt-rules-t').textContent =
    modeName(M ? M.mode : '21') + ' — ' + T('the rules', 'ir-regoli');
  UI.rules.querySelector('#bt-rules-b').innerHTML =
    '<ul>' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul>';
  UI.rules.classList.toggle('open', rulesOpen);
  UI.rules.setAttribute('aria-hidden', rulesOpen ? 'false' : 'true');
  const rb = M && M.ctx && M.ctx.btn && M.ctx.btn('bt-rules');
  if (rb) rb.setAttribute('aria-expanded', rulesOpen ? 'true' : 'false');
}
function setRules(open){
  rulesOpen = !!open;
  try { localStorage.setItem(UIKEY + '.rules', rulesOpen ? '1' : '0'); } catch(e){}
  paintRules();
}

/* ═══════════════════════════════════════════════════════════════════
   THE ENTRY SCREEN — MINIMAL. Pick HOW to play, optionally read the
   rules, go. Not a wall of settings.

   Layout, top to bottom:
     · a clean TWO-WAY pick, 21 or 31 — the one choice that picks the
       game itself, so it earns its place here;
     · the big actions, in order: PLAY ONLINE (primary, on top),
       PLAY WITH AI, and — for 31 — PASS THE PHONE;
     · a RULES button that slides the same rules panel up, never a dump.

   Everything else (decks, S17/H17, lives) is a sensible DEFAULT and is
   deferred: online options live in the lobby (host's Rules/Game
   buttons), offline just deals. The mode's last-used options are still
   remembered in prefs so a returning player keeps their table, but they
   are set on the deal, not asked on this screen.
   ═══════════════════════════════════════════════════════════════════ */
function optsFor(mode){
  const p = pref();
  if (mode === '31'){
    return { seats: Math.max(TL.engine.MIN_SEATS, Math.min(TL.engine.MAX_SEATS, p.seats31 || 4)),
             humans: 1, lvl: p.lvl || 2, mode: 'free',
             lives: Math.max(1, Math.min(9, p.lives || 3)) };
  }
  return { seats: Math.max(1, Math.min(4, p.seats21 || 1)),
           humans: 1, lvl: p.lvl || 2, mode: 'free',
           decks: Math.max(1, Math.min(8, p.decks || 6)),
           h17: p.h17 === true, bjPay: (p.bj65 === true) ? [6, 5] : [3, 2] };
}

/* one folded line that says what the 21 table is set to */
function optsWords(o){
  return o.decks + ' ' + T('decks', 'mazzi') + ' · ' +
         (o.h17 ? 'H17' : 'S17') + ' · ' +
         (o.bjPay && o.bjPay[0] === 6 ? '6:5' : '3:2') + ' · ' +
         o.seats + ' ' + (o.seats === 1 ? T('chair', 'siġġu') : T('chairs', 'siġġijiet'));
}

function setupSheet(){
  injectCSS();
  P.show();
  stopThinking(); M = null; UI = null;
  const el = P.ui.screenEl();
  const p = pref();
  let mode = (p.mode === '31') ? '31' : '21';
  let menuRules = false;   /* the entry-screen rules slide state */

  function paint(){
    const DK = DECK;
    const heroCards = mode === '21'
      ? [DK.mk(0, 1), DK.mk(3, 13)]        /* A♣ + K♠ — a blackjack */
      : [DK.mk(0, 1), DK.mk(0, 13)];       /* A♣ + K♣ — a 31 in one suit */
    const hero =
      '<div class="bt-hero" aria-hidden="true">' +
        '<span class="bt-hero-in">' +
          '<span class="bt-hero-h" style="display:flex">' +
            heroCards.map(f => '<span class="kb-card" style="width:44px;height:62px">' +
              DK.cardFace(f) + '</span>').join('') +
          '</span>' +
          '<span class="bt-hero-st">' + chip('') + chip('') + chip('') + '</span>' +
        '</span>' +
        '<span class="bt-hero-cap">' + esc(mode === '21' ? '3:2' : '31') + '</span>' +
      '</div>';

    /* the AI line names the opponent so the offline default reads clean */
    const aiSub = mode === '21'
      ? T('You against the dealer.', 'Int kontra l-bank.')
      : T('You against the machine.', 'Int kontra l-magna.');

    el.innerHTML =
      '<div class="pt-wrap bt-menu">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="bt-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>KAŻINÒ</h2>' +
      '</div>' +
      '<div class="scroll" style="position:relative">' +
        hero +

        /* ── THE MODE PICK — clean two-way, the game itself ── */
        '<div class="bt-pick" id="bt-mode">' +
          '<button class="bt-pick-b' + (mode === '21' ? ' on' : '') + '" data-mode="21">' +
            '<b>' + esc(modeName('21')) + '</b>' +
            '<i>' + esc(T('Blackjack', 'Blackjack')) + '</i></button>' +
          '<button class="bt-pick-b' + (mode === '31' ? ' on' : '') + '" data-mode="31">' +
            '<b>' + esc(modeName('31')) + '</b>' +
            '<i>' + esc(T('Scat', 'L-Iskatt')) + '</i></button>' +
        '</div>' +

        '<p class="blurb" style="text-align:center;margin:10px 2px 16px">' +
          (mode === '21'
            ? T('Beat the dealer to 21 without busting. A natural pays three to two.',
                'Għaddi lill-bank sal-21 mingħajr ma tinħaraq. Blackjack iħallas tlieta ma’ tnejn.')
            : T('The best hand in one suit. Knock when you are safe, and do not be the lowest.',
                'L-aqwa id f’kulur wieħed. Ħabbat meta tkun fis-sod, u tkunx l-inqas.')) +
        '</p>' +

        (ST.save
          ? '<button class="btn primary bt-big" id="bt-res">' +
            esc(T('Carry on the saved table', 'Kompli l-mejda mħażna')) + ' · ' +
            esc(modeName(ST.save.mode || '21')) + '</button>'
          : '') +

        /* ── THE BIG ACTIONS — online first, then AI, then pass-phone ── */
        '<div class="bt-modes">' +
          '<button class="bt-mode-b primary" id="bt-online">' +
            '<span class="ic">' + ico('mp') + '</span>' +
            '<span class="tx"><b>' + esc(T('Play online', 'Ilgħab onlajn')) + '</b>' +
            '<i>' + esc(T('A room of real people.', 'Kamra ta’ nies veri.')) + '</i></span>' +
          '</button>' +
          '<button class="bt-mode-b" id="bt-ai">' +
            '<span class="ic">' + ico('cards') + '</span>' +
            '<span class="tx"><b>' + esc(T('Play with AI', 'Ilgħab mal-magna')) + '</b>' +
            '<i>' + esc(aiSub) + '</i></span>' +
          '</button>' +
          (mode === '31'
            ? '<button class="bt-mode-b" id="bt-pnp">' +
                '<span class="ic">' + ico('users') + '</span>' +
                '<span class="tx"><b>' + esc(T('Pass the phone', 'Għaddi t-telefon')) + '</b>' +
                '<i>' + esc(T('Two on one phone, the rest machines.', 'Tnejn fuq telefon wieħed, il-bqija magni.')) + '</i></span>' +
              '</button>'
            : '') +
        '</div>' +

        /* ── THE TABLE RULES (21): the honest options the engine really
           plays — the shoe, S17/H17, the payout, the chairs. Folded so
           starting a game stays short; every choice is remembered. ── */
        (mode === '21'
          ? '<div style="margin-top:14px">' +
            '<button class="bt-fold-h" id="bt-optfold" aria-expanded="' + (setupOpen ? 'true' : 'false') + '">' +
              '<span><b>' + esc(T('Table rules', 'Regoli tal-mejda')) + '</b>' +
              '<i>' + esc(optsWords(optsFor('21'))) + '</i></span>' +
              '<em><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></em>' +
            '</button>' +
            '<div class="bt-fold-b' + (setupOpen ? ' open' : '') + '" id="bt-optbody"><div class="bt-fold-i">' +
              '<div class="bt-opt"><span class="lbl"><b>' + esc(T('Chairs', 'Siġġijiet')) + '</b>' +
                '<i>' + esc(T('You and the machine players.', 'Int u l-plejers tal-magna.')) + '</i></span>' +
                '<span class="bt-seg" data-opt="seats21">' + [1, 2, 3, 4].map(v =>
                  '<button data-v="' + v + '"' + (optsFor('21').seats === v ? ' class="on"' : '') + '>' +
                  v + '</button>').join('') + '</span></div>' +
              '<div class="bt-opt"><span class="lbl"><b>' + esc(T('Decks in the shoe', 'Mazzi fil-mazz')) + '</b>' +
                '<i>' + esc(T('A real pit deals six.', 'Każinò veru jqassam sitta.')) + '</i></span>' +
                '<span class="bt-seg" data-opt="decks">' + [1, 2, 4, 6, 8].map(v =>
                  '<button data-v="' + v + '"' + (optsFor('21').decks === v ? ' class="on"' : '') + '>' +
                  v + '</button>').join('') + '</span></div>' +
              '<div class="bt-opt"><span class="lbl"><b>' + esc(T('Dealer on soft 17', 'Il-bank fuq soft 17')) + '</b>' +
                '<i>' + esc(T('H17 hits it — worth about 0.2% to the house.',
                              'H17 jiġbed — madwar 0.2% favur id-dar.')) + '</i></span>' +
                '<span class="bt-seg" data-opt="h17">' +
                  '<button data-v="0"' + (!optsFor('21').h17 ? ' class="on"' : '') + '>S17</button>' +
                  '<button data-v="1"' + (optsFor('21').h17 ? ' class="on"' : '') + '>H17</button>' +
                '</span></div>' +
              '<div class="bt-opt"><span class="lbl"><b>' + esc(T('Blackjack pays', 'Blackjack iħallas')) + '</b>' +
                '<i>' + esc(T('6:5 is the casino’s thumb on the scale.',
                              '6:5 huwa s-saba’ tal-każinò fuq il-miżien.')) + '</i></span>' +
                '<span class="bt-seg" data-opt="bj65">' +
                  '<button data-v="0"' + (!pref().bj65 ? ' class="on"' : '') + '>3:2</button>' +
                  '<button data-v="1"' + (pref().bj65 ? ' class="on"' : '') + '>6:5</button>' +
                '</span></div>' +
              '<p class="blurb" style="margin:6px 2px 8px;font-size:10.5px;color:var(--dim)">' +
                esc(T('These set the offline table. Online plays the house standard: six decks, S17, 3:2.',
                      'Dawn għall-mejda offline. Onlajn jilgħab l-istandard tad-dar: sitt mazzi, S17, 3:2.')) +
              '</p>' +
            '</div></div></div>'
          : '') +

        '<button class="btn ghost bt-big" id="bt-rules-open" aria-expanded="false" ' +
          'aria-controls="bt-menu-rules" style="margin-top:12px">' +
          ico('book') + ' ' + esc(T('How to play', 'Kif tilgħab')) + '</button>' +

        (ST.rec.w + ST.rec.l
          ? '<p class="pt-ledger" style="text-align:center;margin-top:14px">' +
            T('Tables so far: <b>' + ST.rec.w + '</b> won, <b>' + ST.rec.l + '</b> lost.',
              'Mwejjed s’issa: <b>' + ST.rec.w + '</b> rebħin, <b>' + ST.rec.l + '</b> mitlufin.') +
            '</p>'
          : '') +

        /* ── the rules panel — slides up over this screen, same clean
             slide as the felt's. Never a wall printed inline. ── */
        '<div class="bt-menu-rules" id="bt-menu-rules" aria-hidden="true">' +
          '<div class="bt-rules-h"><h4>' + esc(modeName(mode) + ' — ' + T('the rules', 'ir-regoli')) + '</h4>' +
            '<button class="bt-rules-x" id="bt-menu-rules-x" aria-label="' +
              esc(T('Put the rules away', 'Warrab ir-regoli')) + '">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
          '<div class="bt-rules-b"><ul>' +
            rulesForPreview(mode, optsFor(mode)).map(r => '<li>' + r + '</li>').join('') +
          '</ul></div>' +
        '</div>' +
      '</div></div>';

    el.querySelector('#bt-back').onclick = () => P.hub();
    el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
      mode = b.dataset.mode === '31' ? '31' : '21';
      cue('ui.tap', { gain:0.8 }, true); paint();
    });

    /* PLAY WITH AI — sensible defaults, deal straight away */
    el.querySelector('#bt-ai').onclick = () => {
      pref({ mode });
      cue('ui.tap', { gain:0.9 }, true);
      newGame(mode, optsFor(mode));
    };

    /* PLAY ONLINE — into the shared lobby, carrying the mode as the
       room's variant. The lobby's own Rules/Game buttons own the
       options from there; canStart() still refuses until the relay can
       deal privately, so the room is honest. */
    el.querySelector('#bt-online').onclick = () => {
      pref({ mode });
      cue('ui.tap', { gain:0.9 }, true);
      goOnline(mode);
    };

    /* PASS THE PHONE (31 only) — two humans on one device, the rest
       machines. 21 is a single hidden hand against the dealer, so it has
       no pass-and-play. */
    const pnp = el.querySelector('#bt-pnp');
    if (pnp) pnp.onclick = () => {
      pref({ mode });
      cue('ui.tap', { gain:0.9 }, true);
      const o = optsFor('31');
      o.humans = 2;
      o.seats = Math.max(o.seats, 3);
      newGame('31', o);
    };

    const rs = el.querySelector('#bt-res');
    if (rs) rs.onclick = () => { if (ST.save) newGame(null, null, ST.save); };

    /* the table-rules fold (21): each segment writes a pref and repaints */
    const of = el.querySelector('#bt-optfold');
    if (of) of.onclick = () => {
      setSetupOpen(!setupOpen);
      cue('ui.tap', { gain:0.7 }, true);
      const bd = el.querySelector('#bt-optbody');
      if (bd) bd.classList.toggle('open', setupOpen);
      of.setAttribute('aria-expanded', setupOpen ? 'true' : 'false');
    };
    el.querySelectorAll('.bt-seg[data-opt]').forEach(seg => {
      const key = seg.getAttribute('data-opt');
      seg.querySelectorAll('button').forEach(b => b.onclick = () => {
        const v = +b.getAttribute('data-v');
        cue('ui.tap', { gain:0.8 }, true);
        if (key === 'seats21') pref({ seats21: v });
        else if (key === 'decks') pref({ decks: v });
        else if (key === 'h17') pref({ h17: v === 1 });
        else if (key === 'bj65') pref({ bj65: v === 1 });
        paint();
      });
    });

    /* the rules slide — open/close without repaint so it actually slides */
    const rulesEl = el.querySelector('#bt-menu-rules');
    const openBtn = el.querySelector('#bt-rules-open');
    const setMenuRules = open => {
      menuRules = !!open;
      rulesEl.classList.toggle('open', menuRules);
      rulesEl.setAttribute('aria-hidden', menuRules ? 'false' : 'true');
      openBtn.setAttribute('aria-expanded', menuRules ? 'true' : 'false');
      cue(menuRules ? 'ui.sheet' : 'ui.back', { gain: 0.8 }, true);
    };
    if (openBtn) openBtn.onclick = () => setMenuRules(!menuRules);
    const x = el.querySelector('#bt-menu-rules-x');
    if (x) x.onclick = () => setMenuRules(false);
  }
  paint();

  if (window.KARTI_LANG && KARTI_LANG.onChange && !setupSheet._sub){
    setupSheet._sub = KARTI_LANG.onChange(() => {
      try {
        if (!M && el.isConnected && el.querySelector('#bt-mode')) paint();
        else if (M && UI){ render(); paintRules(); }
      } catch(e){}
    });
  }
}

/* PLAY ONLINE — hand the mode to the shared lobby as the room's variant,
   then open the room list for this game. Mirrors js/rummy-ui.js's
   openOnline(): set MP.variant first so a room opened from here plays the
   chosen game, and use openFor() when mp.js is new enough. */
function goOnline(mode){
  const MPX = window.KARTI_MP;
  if (!MPX || !MPX.MP){
    if (K && K.toast) K.toast('⚠ ' + T('Online is not available.', 'Onlajn mhux disponibbli.'));
    return;
  }
  try { MPX.mpLeave && MPX.mpLeave(); } catch(e){}
  MPX.MP.variant = (mode === '31') ? '31' : '21';
  if (MPX.openFor){ MPX.openFor('cards2131'); return; }
  /* an older mp.js without openFor: the previous door, kept honest */
  MPX.MP.wantGame = 'cards2131';
  try { K && K.go && K.go('mp'); } catch(e){}
  try { MPX.mpScreen && MPX.mpScreen(); } catch(e){}
  try { MPX.start && MPX.start('create', null, null, false, 'cards2131'); } catch(e){}
}

/* the rules preview reads the pending choice, not a live state */
function rulesForPreview(mode, o){
  if (mode === '31') return rules31({ lives: o.lives });
  return rules21({ decks: o.decks, rule: { h17: o.h17, bjPay: o.bjPay || [3, 2] }, mode: 'free' });
}

/* ═══════════════════════════════════════════════════════════════════
   ONLINE — with the deal kept secret by the wire
   ───────────────────────────────────────────────────────────────────
   21 (blackjack) IS OPEN, on the relay's per-round private deal:

   · EVERY ROUND the relay shuffles one 52-card pool with its OWN entropy
     and deals each seat a private 8-card LANE ({t:'mine'} → redeal for
     round two on). A seat's opening two cards and every hit come off its
     own lane — so no client, INCLUDING THE HOST, ever holds another
     player's cards. Hands turn face-up only at the showdown ('show').
   · THE BANK (the dealer) has no lane. The host keeps a bank shoe and
     the dealer's cards enter the match as logged moves: 'up' (shared),
     'peek' (blackjack yes/no — the hole shows only if yes), 'reveal'
     (the hole + the fixed policy's draws). The bank's brain running on
     the host's phone is the SAME documented trust as machine chairs:
     the host could read its own bank shoe in devtools. No other player
     can, and no player's hand ever reaches the host.
   · Each lane item carries the ROUND stamped in its high bits
     ((round & 3) << 6 | card), so a lane that arrives early, late, or on
     a mid-hand REJOIN (the relay replays only the LATEST deal) lands on
     the right round without guessing.
   · ONLINE HOUSE RULES are fixed so every phone settles identically:
     S17, 3:2, double-after-split, late surrender, one split (two hands),
     flat bet 10. The bank shoe is six decks, freshly shuffled per round.

   31 (Tletin / Scat) stays closed online: its first-round private deal
   works, but its round loop is not wired to the per-round re-deal yet
   (see canStart's honest reason). Free chips/lives only; coins stay
   behind COINS_MODE_READY. */
let NET = null;

/* the ROUND TAG a 21 lane item carries (2 bits are plenty: only
   adjacent rounds ever need telling apart) */
const laneItem = (round, card) => ((round & 3) << 6) | (card & 63);
function lanePool(round){
  const items = [];
  for (let c = 0; c < 52; c++) items.push(laneItem(round, c));
  return { items, each: 8 };
}

/* the pool the lobby asks the relay to deal at START (round 1).
   21 → an 8-card lane a seat off a 52-card pool, round-tagged;
   31 → three cards a seat (its round loop stays offline for now). */
function planDeal(opts){
  const variant = (opts && (opts.variant === '31' || opts.mode === '31')) ? '31' : '21';
  if (variant === '21') return lanePool(1);
  const items = [];
  for (let i = 0; i < 52; i++) items.push(i);
  return { items, each: 3 };
}

/* ── THE BANK SHOE (host only) — six decks, shuffled fresh per round
   with local entropy (never the broadcast seed). Only the host holds
   it; its cards reach the table exclusively as 'up'/'peek'/'reveal'
   moves. ── */
function bankShoe(){
  const cards = [];
  for (let d = 0; d < 6; d++)
    for (let c = 0; c < 52; c++) cards.push(c);
  for (let i = cards.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const t = cards[i]; cards[i] = cards[j]; cards[j] = t;
  }
  return { cards, i: 2, up: cards[0], hole: cards[1] };
}
/* what the bank owes the table right now (host only): the move + a
   human pace for it. Null when the beat is not the bank's. */
function bankBeat(st){
  const o = M && M.online;
  if (!o || o.mode !== '21' || !M.net || !M.net.host) return null;
  if (!o.bank || o.bankRound !== st.round){
    o.bank = bankShoe();
    o.bankRound = st.round;
  }
  const bank = o.bank;
  if (st.phase === 'up')
    return { mv: { t:'up', c: bank.up }, ms: 650 };
  if (st.phase === 'peek'){
    const bj = BJ.engine.handValue([bank.up, bank.hole]).blackjack;
    return { mv: bj ? { t:'peek', bj:true, c: bank.hole } : { t:'peek', bj:false }, ms: 800 };
  }
  if (st.phase === 'dealer'){
    /* the fixed policy, played out of the bank shoe (pure: the same
       call always composes the same reveal). S17 online. The 14-card
       clamp is the wire's — a real dealer hand never gets near it. */
    const cards = [bank.up, bank.hole];
    let i = 2;
    const anyLive = st.seats.some(s => s.hands.some(h => !h.bust && !h.surrendered));
    if (anyLive){
      for (;;){
        const hv = BJ.engine.handValue(cards);
        if (hv.total < 17 && cards.length < 14 && i < bank.cards.length){
          cards.push(bank.cards[i++]);
          continue;
        }
        break;
      }
    }
    return { mv: { t:'reveal', cards: cards.slice(1) }, ms: 900 };
  }
  return null;
}
/* the host's NEXT ROUND: push the fresh lanes (redeal) FIRST, then the
   'next' move rides behind them in the same ordered stream. */
function hostDealsNext(){
  if (!M || !M.net || !M.net.host || !M.online || M.online.mode !== '21') return false;
  const r = (M.st.round + 1);
  if (typeof M.net.redeal !== 'function') return false;
  const sent = M.net.redeal(lanePool(r));
  if (!sent && K && K.toast)
    K.toast('⚠ ' + T('The deal would not go out. Try again.', 'It-tqassim ma ħariġx. Erġa\' pprova.'));
  return !!sent;
}

/* the PUBLIC part of a 31 deal — the up-card and the stock — off the shared
   broadcast seed, so every phone lands on the same draw pile without a card
   crossing the wire. */
function tableFromSeed(opts, seed){
  try {
    const st = TL.engine.deal(Object.assign({}, opts, { deal:'seed' }), seed >>> 0);
    const up = (st.discard && st.discard.length) ? st.discard[0] : null;
    return { up, stock: Array.isArray(st.stock) ? st.stock.slice() : [] };
  } catch(e){ return { up:null, stock:[] }; }
}

function onlineStart(cfg){
  cfg = cfg || {};
  const chairs = (cfg.seats || []).filter(Boolean);
  const n = chairs.length;
  const mode = (cfg.opts && (cfg.opts.mode === '31' || cfg.opts.variant === '31')) ? '31' : '21';

  const toGame = {}, toRoom = [];
  chairs.forEach((s, g) => {
    const room = (typeof s.seat === 'number') ? s.seat : g;
    toGame[room] = g; toRoom[g] = room;
  });
  const meG = (toGame[cfg.you] !== undefined) ? toGame[cfg.you] : 0;
  const iAmHost = (cfg.you === (cfg.host | 0));
  const lvl = (chairs.map(s => s && s.level).find(v => v)) || 2;

  stopThinking();
  if (M){ try { leave(); } catch(e){} }

  let opts, m;
  if (mode === '31'){
    const seats = Math.max(TL.engine.MIN_SEATS, Math.min(TL.engine.MAX_SEATS, n || 4));
    const tbl = tableFromSeed({ seats, humans: seats, lvl, mode:'free', lives:3 },
                              cfg.seed >>> 0);
    opts = { seats, humans: seats, lvl, mode:'free', lives:3, deal:'private',
             given: { hands: {}, up: tbl.up, stock: tbl.stock } };
    m = startMatch('31', opts, cfg.seed >>> 0);
    M.online = { mode:'31', toGame, toRoom, meG, seed: cfg.seed >>> 0,
                 table: tbl };
  } else {
    /* 21 — THE LANES TABLE (see the block comment above): every seat's
       cards ride its own relay-dealt lane; the bank's cards arrive as
       the host's logged moves. Fixed online house rules so every phone
       settles identically. */
    const seats = Math.max(1, Math.min(6, n || 1));
    opts = { seats, humans: seats, lvl: 2, mode:'free', decks:6, deal:'lanes',
             resplit: 2, h17: false, bjPay: [3, 2], bet: 10,
             given: { me: meG, rounds: {} } };
    m = startMatch('21', opts, cfg.seed >>> 0);
    M.online = { mode:'21', toGame, toRoom, meG, seed: cfg.seed >>> 0,
                 hostRoom: cfg.host | 0, bank: null, bankRound: 0 };
  }
  if (!m) throw new Error('CARDS2131 would not deal ' + n + ' seats (' + mode + ')');
  M.meta = M.st.seats.map((s, g) => {
    const c = chairs[g];
    return {
      name: c ? String(c.name || ('Player ' + (g + 1))).slice(0, 14) : s.name,
      own:  g === meG ? 'me' : (c && c.kind === 'cpu' ? 'ai' : (c ? 'net' : s.own)),
      lvl:  (c && c.level) || lvl
    };
  });
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

/* the private hand — THIS seat's own cards, pushed by the relay and
   NEVER put back on the shared wire.
   21: an 8-card round LANE, round-tagged in the item's high bits. Store
   it under its round and REBUILD the state off the log — a lane that
   arrives after its round already started (the normal case for round 1,
   and every rejoin) snaps our own cards into place; everybody else's
   stay null exactly as before.
   31: the three cards of its (single) private deal, as before. */
function onlinePrivate(d){
  if (!M || M.dead || !M.online) return;
  if (M.online.mode === '21'){
    if (!Array.isArray(d) || !d.length) return;
    const tag = ((d[0] | 0) >> 6) & 3;
    const cards = d.map(v => (v | 0) & 63).filter(c => c >= 0 && c < 52);
    if (!cards.length) return;
    /* the smallest round >= the round we are in that carries this tag */
    let r = Math.max(1, M.st.round);
    for (let k = 0; k < 4 && (r & 3) !== tag; k++) r++;
    if ((r & 3) !== tag) return;                 /* not a tag we can place */
    M.opts.given.rounds[r] = cards;
    M.st = buildState('21', M.opts, M.seed, M.log);
    applyMeta();
    render();
    cue('card.deal', { gain: 0.7 }, true);
    return;
  }
  if (M.online.mode !== '31') return;
  if (!Array.isArray(d) || d.length < 3) return;
  const me = M.online.meG;
  const hands = {};
  hands[me] = [d[0] | 0, d[1] | 0, d[2] | 0];
  const tbl = M.online.table || { up:null, stock:[] };
  const opts = Object.assign({}, M.opts, {
    deal:'private',
    given: { hands, up: tbl.up, stock: (tbl.stock || []).slice() }
  });
  M.opts = opts;
  M.log = [];
  M.st = buildState('31', M.opts, M.seed, M.log);
  applyMeta();
  render();
  cue('card.deal', { gain: 0.7 }, true);
}

/* the table moves only the BANK may make on a 21 lanes table */
const BANK_MOVES = { up: 1, peek: 1, reveal: 1, next: 1 };

function onlineRemote(seat, wire){
  if (!M || M.dead || !NET) return null;
  const e = E();
  const g = NET.toGame[seat];
  if (g === undefined) return { ok:false, why:'a move from a chair not at this table' };
  const mv = e.decWire(wire);
  if (!mv) return { ok:false, why:'a move this table does not know how to make' };

  /* ── 21 (lanes): no local fast-forward — every table beat is a real
     logged move from the host, and only from the host. ── */
  if (M.online && M.online.mode === '21'){
    if (mv.t === 'quit'){ doQuit(g); render(); return null; }
    if (BANK_MOVES[mv.t]){
      if (seat !== (M.online.hostRoom | 0))
        return { ok:false, why:'a bank move from a chair that is not the bank' };
      const r = doMove(-1, mv, 'net');
      if (!r.ok) return { ok:false, why: String(r.err || 'refused') + ' from the bank' };
      render();
      return null;
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

  if (mv.t === 'quit'){ doQuit(g); render(); return null; }
  let guard = 0;
  while (e.turn(M.st) === -1 && guard++ < 12){
    const opts = e.legal(M.st, -1);
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

function doQuit(g){
  if (!M || M.dead) return;
  if (M.online && M.online.mode === '21'){
    /* 21 keeps the walk-out IN THE LOG (a 'quit' move the engine already
       has), because the lanes table REBUILDS state from the log whenever
       a lane arrives — a flag poked straight into the state would be
       lost on the very next rebuild. Every client hears the drop at the
       same point of the ordered stream, so every log agrees. */
    const s = M.st.seats[g];
    if (!s || s.gone) return;
    const rec = { t: 'quit', seat: g };
    M.log.push(rec);
    E().apply(M.st, rec);
    return;
  }
  const s = M.st.seats[g];
  if (!s || s.out || s.gone) return;
  s.gone = true;                     /* the round-end tally reads gone */
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
    quip: T('Nothing was counted. Nobody loses a life over a dropped line.',
            'Xejn ma ġie magħdud. Ħadd ma jitlef ħajja fuq linja maqtugħa.'),
    buttons: [{ label: T('Back to the rooms', 'Lura lejn il-kmamar'), icon:'back', cls:'primary',
                go: () => { const nx = NET; leave(); if (nx && nx.onLeave) nx.onLeave(); else P.hub(); } }]
  });
}

const NET_HOOKS = {
  live:   () => !!(M && !M.dead && !E().over(M.st)),
  phase:  () => !M ? 'idle' : (E().over(M.st) ? 'over' : 'play'),
  seed:   () => (M ? M.seed : null),
  gameId: () => (M ? 'cards2131' : null),
  turn:   () => (M && NET) ? (NET.toRoom[E().turn(M.st)] != null ? NET.toRoom[E().turn(M.st)] : -1) : -1,
  over:   () => (M ? E().over(M.st) : null),
  moveCount: () => (M ? M.log.length : 0),
  onMove: fn => {
    const f = info => {
      if (!M || M.dead || !NET || !info) return;
      if (info.src === 'net' || info.src === 'auto') return;
      const w = E().encWire(info.move);
      if (!w) return;
      /* a TABLE move (seat -1: the bank's 'up'/'peek'/'reveal'/'next')
         rides the wire as OUR OWN chair — only the host composes them,
         and the receivers accept them only from the host's chair. */
      const room = info.seat < 0 ? NET.toRoom[NET.me] : NET.toRoom[info.seat];
      fn(w, { seat: (room == null ? info.seat : room), src: info.src });
    };
    moveSubs.push(f);
    return () => { const i = moveSubs.indexOf(f); if (i >= 0) moveSubs.splice(i, 1); };
  },
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
P.online.cards2131 = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  planDeal,
  live: () => NET_HOOKS.live(),
  hooks: NET_HOOKS
};

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — what js/mp.js reads before a card exists.

   Online is OPEN now. It carries the MODE as a VARIANT, exactly like
   rummy carries the hand size — '21' and '31'. 31 is dealt privately
   (each seat its own three cards); 21 is one hand against the dealer and
   runs off the shared seed. canStart() lets a free table go; coins stay
   behind COINS_MODE_READY.
   ═══════════════════════════════════════════════════════════════════ */
/* 21 IS OPEN ONLINE (per-round private lanes — see the ONLINE block).
   31 keeps its honest refusal below until its round loop rides the
   per-round re-deal too. */

const LOBBY = {
  id:'cards2131',
  name:'21 & 31',
  mt:'21 u 31',
  minSeats: 1,
  maxSeats: TL.engine.MAX_SEATS,
  levels: levels(),
  defaultLevel: 2,

  /* THE TWO MODES, as the shared lobby's Rules picker wants them: the
     relay's word for each, a bilingual label, and the seat range each
     mode plays. 21 seats one player against the dealer; 31 seats 3..9. */
  variants: [
    { net:'21', label: MODE_NAME['21'],
      seats:[1, 2, 3, 4, 5, 6] },
    { net:'31', label: MODE_NAME['31'],
      seats:[3, 4, 5, 6, 7, 8, 9] }
  ],
  currentVariant(){
    try {
      const v = window.KARTI_MP && window.KARTI_MP.MP && window.KARTI_MP.MP.variant;
      return v === '31' ? '31' : '21';
    } catch(e){ return '21'; }
  },
  applyVariant(net){
    return { variant: (net === '31' ? '31' : '21'), rules: null };
  },
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu')
    ? Object.assign({}, seat, { ready:true }) : seat,
  /* ONLINE IS OPEN (free lives / chips). 31 is dealt privately; 21 is one
     hand against the dealer. The seat range depends on which mode the room
     is in — 21 seats 1..6, 31 seats 3..9. The unready are named. */
  canStart(seatList){
    const list = (seatList || []).filter(Boolean);
    const n = list.length;
    const variant = LOBBY.currentVariant();
    /* 21 IS OPEN: the relay deals every seat a fresh private lane every
       round (net.redeal) and the bank's cards arrive as the host's
       logged moves — no phone can read another player's hand or the
       hole card. One honest refusal remains: MACHINE CHAIRS. A bot's
       private lane is delivered to the host, but mp.js's private inbox
       does not say WHOSE blob a frame is, so the host cannot yet tell
       its own lane from a bot's. Until that is wired, 21 online seats
       people only.
       31 stays closed: its FIRST round is dealt privately and secretly
       (proven), but its round loop is not wired to the per-round
       re-deal yet — round two would have no secret deal. */
    if (variant === '21' && list.some(s => s && s.kind === 'cpu'))
      return { ok:false, why: T(
        'No machine chairs at the online 21 table yet — a machine cannot ' +
        'be dealt a secret hand here. Fill the table with people, or play ' +
        'the machine offline.',
        'L-ebda siġġijiet tal-magna fil-mejda tal-21 onlajn għalissa — ' +
        'magna ma tistax tingħata id sigrieta hawn. Imla l-mejda bin-nies, ' +
        'jew ilgħab kontra l-magna offline.') };
    if (variant === '31')
      return { ok:false, why: T(
        '31 online is nearly there — each round needs its own secret deal, coming next. ' +
        'Play on one phone or against the machine for now.',
        'It-31 onlajn kważi lest — kull rawnd irid it-tqassim sigriet tiegħu, ġej. ' +
        'Ilgħab fuq telefon wieħed jew kontra l-magna għalissa.') };
    const lo = variant === '31' ? TL.engine.MIN_SEATS : 1;
    const hi = variant === '31' ? TL.engine.MAX_SEATS : 6;
    if (n < lo)
      return { ok:false, why: variant === '31'
        ? T('31 needs three at the table.', 'It-31 irid tlieta fuq il-mejda.')
        : T('Somebody has to sit down first.', 'Xi ħadd irid jinżel bilqiegħda l-ewwel.') };
    if (n > hi)
      return { ok:false, why: T('That is more than this game seats.',
                                'Dak aktar minn kemm iddaħħal din il-logħba.') };
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
  /* the move codec's field order, published so mp.js's generic wire
     carries 21's moves (cards ride c0..c12 ONLY in the public 'reveal'
     and showdown 'show' moves — a hit/double/split never names a card) */
  wire: { fields: BJ.engine.WIRE_FIELDS },
  rulesHTML: () =>
    '<p>' + T('One tile, two games. <b>21</b> is blackjack: beat the dealer without busting, and ' +
      'a natural pays 3:2. <b>31</b> is Scat: the best hand in one suit, knock when you are safe, ' +
      'do not be the lowest — three lives.',
      'Tessera waħda, żewġ logħob. <b>21</b> huwa blackjack: għaddi lill-bank mingħajr ma tinħaraq, ' +
      'u blackjack iħallas 3:2. <b>31</b> huwa l-Iskatt: l-aqwa id f’kulur wieħed, ħabbat meta ' +
      'tkun fis-sod, tkunx l-inqas — tliet ħajjiet.') + '</p>' +
    '<p>' + T('Online, 21 deals every seat its own cards in secret, fresh every round — nobody, ' +
      'not even the host, sees your hand before the showdown. House rules online: six-deck bank, ' +
      'dealer stands on 17, blackjack pays 3:2. Table chips only.',
      'Onlajn, il-21 iqassam lil kull siġġu l-karti tiegħu bil-moħbi, friski kull round — ħadd, ' +
      'lanqas il-host, ma jara idek qabel il-showdown. Regoli tad-dar onlajn: bank ta’ sitt ' +
      'mazzi, il-bank jieqaf fuq 17, blackjack iħallas 3:2. Ċipep tal-mejda biss.') + '</p>',
  blurb: T('21 and 31 — blackjack against the dealer, or Scat for your lives. One tile, two games.',
           '21 u 31 — blackjack kontra l-bank, jew l-Iskatt għall-ħajjiet tiegħek. Tessera, żewġ logħob.'),
  /* the shared lobby starts the game through P.online.cards2131.start
     (net.start). This delegates there so a caller reaching the lobby's own
     start still deals a private table rather than an offline one. */
  start(seatsList, opts){
    return onlineStart({ seats: seatsList,
                         opts: { mode: (opts && (opts.mode || opts.variant)) },
                         seed: opts && opts.seed, you: 0, host: 0,
                         net: (opts && opts.net) || {} });
  },
  myName(){
    try {
      const n = K && K.displayName && K.displayName();
      if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
        return String(n).trim().slice(0, 14);
    } catch(e){}
    return T('You', 'Int');
  },
  takeback: false
};
/* publish on BOTH engine globals so integration can reach it either way */
BJ.lobby = LOBBY;
if (TL) TL.lobby = LOBBY;

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF — one tile behind the PLAYING CARDS door. register()
   replaces by id, so party.js wiring the same descriptor again costs
   nothing. `kind:'deck'` puts it behind that door.
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'cards2131', order:38, kind:'deck', name:'21 & 31', mt:'21 u 31',
  sprite:'bt-t-cards2131', icon:'cards', status:'live',
  get tag(){
    return T('Two casino card games in one tile: 21 (blackjack) against the dealer, and 31 (Scat) ' +
             'for your lives. Table chips only.',
             'Żewġ logħob tal-karti tal-każinò f’tessera waħda: 21 (blackjack) kontra l-bank, u ' +
             '31 (l-Iskatt) għall-ħajjiet tiegħek. Ċipep tal-mejda biss.') +
           (ST.save ? ' ' + T('There is a table of this half-played.', 'Hemm mejda minn din nofsha milgħuba.') : '');
  },
  open: () => setupSheet(),
  seats: { min:1, max:TL.engine.MAX_SEATS },
  levels: levels(),
  rulesHTML: () => LOBBY.rulesHTML(),
  start: (seatsList, opts) => LOBBY.start(seatsList, opts)
};
BJ.shelfTile = TILE;
BJ.open = () => setupSheet();
BJ.close = () => { leave(); P.hub(); };
P.register(TILE);

/* teach the shared lobby the word, the way rummy/gin do: mp.js exports
   its registry LIVE so a game can introduce itself without editing
   mp.js. Harmless if mp.js already knows the id. */
(function teachLobby(){
  const MPX = window.KARTI_MP;
  if (!MPX || !Array.isArray(MPX.GAMES) || !Array.isArray(MPX.GAME_KEYS)) return;
  if (MPX.GAME_KEYS.indexOf('cards2131') >= 0) return;
  MPX.GAMES.push({ k:'cards2131', name:'21 & 31', short:'21·31', icon:'cards',
    blurb:'Blackjack against the dealer, or Scat for your lives.' });
  MPX.GAME_KEYS.push('cards2131');
  if (MPX.SEATS_FALLBACK) MPX.SEATS_FALLBACK.cards2131 = [1, 9, 4];
})();

/* the shelf mark must exist before the shelf is painted */
if (document.body) injectDefs();
else document.addEventListener('DOMContentLoaded', injectDefs);

/* ── test hooks — inert unless the page is opened with ?bttest ──── */
try {
  if (String(location.search).indexOf('bttest') >= 0){
    window.__BT_TEST = {
      M: () => M,
      st: () => (M ? M.st : null),
      mode: () => (M ? M.mode : null),
      engine: () => E(),
      engines: { bj: BJ.engine, tl: TL.engine },
      start: (mode, opts) => { newGame(mode || '21', opts || (mode === '31'
        ? { seats:4, humans:1, lvl:2, mode:'free', lives:3 }
        : { seats:1, humans:1, lvl:2, mode:'free', decks:6 })); return true; },
      startSeed: (mode, opts, seed) => {
        newGame(null, null, { v:SAVE_V, gid:'cards2131', mode, opts, seed, log:[] }); return true; },
      fast: on => { FAST = !!on; },
      doMove, rollbackTo, snapshot,
      render, setup: setupSheet,
      tap: sel => { const t = document.querySelector(sel); if (t) onTap(t); },
      rules: () => rulesOpen, setRules,
      tally: () => (M ? E().tally(M.st) : null),
      lobby: LOBBY, tile: TILE, store: () => ST,
      coinsReady: COINS_MODE_READY
    };
  }
} catch(e){}

})();
