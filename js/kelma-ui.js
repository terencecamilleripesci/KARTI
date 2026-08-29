/* ═══════════════════════════════════════════════════════════════════
   KARTI — kelma-ui.js
   KELMA — the screens on top of js/kelma.js. Board, rack, tap-to-place,
   scoring, the dictionary loader, and the shelf/lobby contracts. Online
   (private racks over the relay deal) is wired in a later pass; this file
   ships the offline core: PASS THE PHONE and VS THE MACHINE, both fully
   playable, plus every mp.js contract stubbed so registration is clean.

   INTERACTION — tap, don't drag (reliable on a phone): tap a rack tile to
   pick it up, tap an empty board square to drop it. Tap a tile you placed
   THIS turn to take it back. PLAY submits; the engine validates every word
   against the loaded dictionary and scores it.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_KELMA;
if (!K || !P || !R || !R.engine) return;

const E = R.engine;
const N = E.N;
const esc = (K && K.esc) || (s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
const ico = (n, l) => (window.ICO ? window.ICO(n, l) : '');
const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;

const SEATS = [
  { id:'gold', hex:'#FFC542' }, { id:'ice', hex:'#4FB6FF' },
  { id:'jade', hex:'#3DDC84' }, { id:'ruby', hex:'#FF5468' }
];
const seatColour = i => SEATS[i % SEATS.length];

const STORE = 'karti_kelma_v1';
let ST = { pref:{ lvl:2, lang:'both' }, rec:{ w:0, l:0 } };
try { const s = JSON.parse(localStorage.getItem(STORE) || '0'); if (s && s.pref) ST = s; } catch(e){}
let pT = 0;
function persist(){ clearTimeout(pT); pT = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){} }, 300); }
function pref(patch){ if (patch){ Object.assign(ST.pref, patch); persist(); } return ST.pref; }

let cueAt = 0;
function cue(id, opts, big){ const S = window.KARTI_SFX; if (!S) return; const now = Date.now();
  if (!big && now - cueAt < 40) return; cueAt = Math.max(cueAt, now); try { S.play(id, opts); } catch(e){} }
function note(step, gain){ const S = window.KARTI_SFX; if (S && S.note){ try { S.note(step, { gain: gain || 0.5 }); } catch(e){} } }
/* HAPTICS — a buzz sits beside the cue() that already marks the same moment.
   js/sfx.js owns the pattern, the player's switch and every no-op path, so
   there is nothing to guard here beyond the module being absent. Called ONLY
   for something the local player did: never for the bot's play, never for a
   move arriving over the wire (afterRemote and theatre() stay silent), and
   never from paint(). */
function buzz(kind){ try { const S = window.KARTI_SFX; if (S && S.haptic) S.haptic(kind); } catch(e){} }
function reduced(){ try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){ return false; } }
function myName(){ try { if (window.KARTI && KARTI.displayName) return KARTI.displayName() || T('You','Int'); } catch(e){} return T('You','Int'); }
function toast(msg, bad){ try { if (K && K.toast) return K.toast(msg); } catch(e){} }

/* ═════════════ THE DICTIONARY — two sets, so a word can be checked
   against English, Maltese, or both, per the language chosen at start. */
let DICT_EN = null, DICT_MT = null, dictState = 'idle';   /* idle|loading|ready|error */
const dictWaiters = [];
function loadDict(){
  if (dictState === 'ready' || dictState === 'loading') return;
  dictState = 'loading';
  const en = new Set(), mt = new Set();
  const grab = (f, set) => fetch('data/kelma/' + f).then(r => r.ok ? r.text() : '').then(txt => {
    for (const w of txt.split('\n')){ const s = w.trim(); if (s) set.add(s); }
  }).catch(() => {});
  Promise.all([ grab('words-en.txt', en), grab('words-mt.txt', mt) ]).then(() => {
    DICT_EN = en; DICT_MT = mt; dictState = (en.size + mt.size > 100) ? 'ready' : 'error';
    while (dictWaiters.length){ try { dictWaiters.pop()(); } catch(e){} }
  });
}
function langNow(){ return (M && M.lang) || pref().lang || 'both'; }
function langLabel(l){ return l === 'en' ? 'English' : l === 'mt' ? 'Malti' : T('Both','It-tnejn'); }
function isWord(s){
  s = String(s || '').toLowerCase();
  const l = langNow();
  if (l === 'en') return !!(DICT_EN && DICT_EN.has(s));
  if (l === 'mt') return !!(DICT_MT && DICT_MT.has(s));
  return !!((DICT_EN && DICT_EN.has(s)) || (DICT_MT && DICT_MT.has(s)));
}
function onDict(fn){ if (dictState === 'ready') fn(); else { dictWaiters.push(fn); loadDict(); } }

/* ═════════════ the runner ═════════════ */
let M = null, UI = null;
const moveSubs = [];
function fire(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }

const LEVELS = [
  { level:1, name:'Ġojja' }, { level:2, name:'Rita' }, { level:3, name:'Il-Prof' }
];
const levelName = l => (LEVELS.find(x => x.level === l) || LEVELS[1]).name;

function startMatch(opts, seed){
  M = {
    seats: Math.max(2, Math.min(4, (opts && opts.seats) || 2)),
    st: E.newGame({ seats: Math.max(2, Math.min(4, (opts && opts.seats) || 2)) }, (seed == null ? newSeed() : seed) >>> 0),
    ctx: null, net: null, meta: null, mode: (opts && opts.mode) || 'pnp',
    lvl: (opts && opts.lvl) || pref().lvl || 2,
    lang: (opts && opts.lang) || pref().lang || 'both',   /* which words count */
    sel: -1,                            /* selected rack index            */
    pending: [],                        /* [{r,c,ch,blank,rackIdx}] this turn */
    dead: false, finished: false, botT: 0
  };
  return M;
}
function newSeed(){ return ((Date.now ? 1 : 1) ^ 0x9e3779b9 ^ ((Math.random ? 0 : 0))) >>> 0 || 1; }
function seatCount(){ return M ? M.seats : 2; }
function ownerOf(i){ return (M && M.meta && M.meta[i] && M.meta[i].own) || 'ai'; }
const isLocal = i => { const o = ownerOf(i); return o === 'me' || o === 'hot'; };
function seatName(i){ const m = M && M.meta && M.meta[i]; if (!m) return seatTitle(i);
  if (m.own === 'me') return m.name || T('You','Int'); if (m.own === 'ai') return levelName(M.lvl); return m.name || seatTitle(i); }
function seatTitle(i){ return T('Player','Plejer') + ' ' + (i + 1); }
/* your own seat: online it is the chair the relay gave you; offline it is
   the first local seat. Used everywhere the phone shows YOUR rack. */
const mySeat = () => (M && M.net) ? (M.net.you != null ? M.net.you : firstLocalSeat()) : firstLocalSeat();
function stopBot(){ if (M && M.botT){ clearTimeout(M.botT); M.botT = 0; } }

/* the rack the local hotseat player is holding right now (pass-the-phone:
   the current turn's seat). Pending tiles are hidden from the rack view. */
/* whose rack the phone is holding: offline it's the seat to move (pass the
   phone), online it is ALWAYS your own seat — never an opponent's. */
function activeSeat(){ return M && M.net ? mySeat() : M.st.turn; }
function rackView(){
  /* pass-the-phone, during the play-theatre hold: the turn has already
     advanced, so the NEXT player's tiles must NOT show before the handover
     sheet does — the tray sits empty until the hold expires. */
  if (!M.net && M.mode === 'pnp' && held()) return [];
  const rack = (M.st.racks[activeSeat()] || []).slice();
  /* remove the tiles currently placed as pending, by char */
  for (const p of M.pending){ const want = p.blank ? '_' : p.ch; const i = rack.indexOf(want); if (i >= 0) rack.splice(i, 1); }
  return rack;
}

/* ═════════════ CSS ═════════════ */
let cssDone = false;
function injectCSS(){
  if (cssDone) return; cssDone = true;
  const s = document.createElement('style');
  s.textContent =
  /* gap:4 not 6 — four gaps at 6px is 24px, and on a 360x640 phone the column
     (chips + 15x15 board + hint + rack + buttons) was 4px longer than .pt-host
     and lost the top of the seat chips to its overflow:hidden. */
  '#scr-party .km-wrap{display:flex;flex-direction:column;height:100%;min-height:0;gap:4px}' +
  '#scr-party .km-top{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin:2px 4px}' +
  '#scr-party .km-seat{display:flex;align-items:center;gap:6px;padding:3px 9px 3px 4px;border-radius:999px;' +
    'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);font-size:12px;color:#cfc8e6}' +
  '#scr-party .km-seat.on{border-color:var(--kc);box-shadow:0 0 0 1px var(--kc),0 0 12px -4px var(--kc);color:#fff}' +
  '#scr-party .km-seat b{font-weight:700}#scr-party .km-seat .km-sc{font-weight:800;color:#FFE39A}' +
  /* the screen has 12px side padding and the board 22px of chrome — size the
     square off the space that actually exists, so 15 columns NEVER overflow */
  '#scr-party .km-board{--sq:min(calc((100vw - 46px)/15),25px);display:grid;grid-template-columns:repeat(15,var(--sq));' +
    'grid-template-rows:repeat(15,var(--sq));gap:1px;justify-content:center;margin:2px auto;' +
    'background:#0e0a18;padding:4px;border-radius:8px;' +
    'box-shadow:0 12px 26px -16px rgba(0,0,0,.85),inset 0 0 0 1px rgba(255,255,255,.045)}' +
  '#scr-party .km-c{width:var(--sq);height:var(--sq);border-radius:2px;background:#231b3a;position:relative;' +
    'display:grid;place-items:center;font-family:var(--disp);font-weight:800;font-size:calc(var(--sq)*.5);color:#fff}' +
  '#scr-party .km-c.d{background:#274a6e}#scr-party .km-c.t{background:#1f6b52}' +
  '#scr-party .km-c.D{background:#7a3a66}#scr-party .km-c.T{background:#8a2f3a}' +
  '#scr-party .km-c.star{background:#7a3a66}' +
  /* a soft top-light sheen so the premium squares read as glass, not flat paint */
  '#scr-party .km-c.d,#scr-party .km-c.t,#scr-party .km-c.D,#scr-party .km-c.T,#scr-party .km-c.star{' +
    'background-image:linear-gradient(135deg,rgba(255,255,255,.17),rgba(255,255,255,0) 55%)}' +
  '#scr-party .km-c.star{box-shadow:inset 0 0 0 1px rgba(255,197,66,.4),inset 0 0 9px rgba(255,197,66,.4)}' +
  '#scr-party .km-c .km-pl{position:static;font-size:calc(var(--sq)*.3);opacity:.7;font-weight:800;letter-spacing:.4px}' +
  '#scr-party .km-c.star .km-pl{font-size:calc(var(--sq)*.52);opacity:.95;color:#FFC542}' +
  '#scr-party .km-c.tile{background:linear-gradient(180deg,#F6E7C6,#E7C98C);color:#3a2a10;' +
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 -2px 0 rgba(0,0,0,.18),0 1px 2px rgba(0,0,0,.35)}' +
  '#scr-party .km-c.tile .km-v{position:absolute;right:1px;bottom:0;font-size:calc(var(--sq)*.28);opacity:.8}' +
  '#scr-party .km-c.new{background:linear-gradient(180deg,#FFE9A8,#FFC94F)}' +
  '#scr-party .km-c.aim{outline:1px solid rgba(255,197,66,.3);outline-offset:-1px}' +
  '@keyframes kmDrop{0%{transform:translateY(-52%) scale(1.32);opacity:0}' +
    '55%{transform:translateY(5%) scale(.95);opacity:1}78%{transform:translateY(-2%) scale(1.04)}100%{transform:none;opacity:1}}' +
  '@keyframes kmSettle{0%{transform:translateY(-16%) scale(1.14)}55%{transform:translateY(4%) scale(.96)}100%{transform:none}}' +
  '@keyframes kmFlash{0%{opacity:0}22%{opacity:.9}100%{opacity:0}}' +
  '@keyframes kmPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}' +
  '#scr-party .km-flash{position:absolute;inset:0;border-radius:2px;pointer-events:none;opacity:0;' +
    'animation:kmFlash .8s ease-out both}' +
  '#scr-party .km-flash.km-f-d{background:#69bfff}#scr-party .km-flash.km-f-t{background:#3ddc84}' +
  '#scr-party .km-flash.km-f-D{background:#ff7ad1}#scr-party .km-flash.km-f-T{background:#ff5468}' +
  '#scr-party .km-flash.km-f-s{background:#FFC542}' +
  '.km-fly{position:fixed;z-index:45;transform:translate(-50%,-50%);font-family:var(--disp),sans-serif;' +
    'font-weight:900;font-size:24px;color:#FFE39A;pointer-events:none;will-change:transform,opacity;' +
    'text-shadow:0 0 14px rgba(255,197,66,.6),0 2px 6px rgba(0,0,0,.75)}' +
  '.km-fly.big{font-size:31px;color:#FFF4CE}' +
  '#scr-party .km-rack{display:flex;gap:6px;justify-content:center;margin:6px auto 2px;min-height:46px;' +
    'padding:6px 10px;width:max-content;min-width:150px;max-width:calc(100% - 12px);border-radius:12px;' +
    'background:linear-gradient(180deg,#4a3524,#2c1f12);' +
    'box-shadow:inset 0 2px 6px rgba(0,0,0,.55),inset 0 -1px 0 rgba(255,255,255,.07),0 2px 6px -3px rgba(0,0,0,.6)}' +
  '#scr-party .km-tile{width:38px;height:44px;border-radius:7px;' +
    'background:linear-gradient(178deg,#FAEDD0 0%,#F0DCAE 55%,#E2C388 100%);' +
    'color:#3a2a10;font-family:var(--disp);font-weight:800;font-size:22px;display:grid;place-items:center;position:relative;' +
    'box-shadow:0 2px 0 rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.55),inset 0 -2px 3px rgba(0,0,0,.12);cursor:pointer}' +
  '#scr-party .km-tile.sel{outline:3px solid #FFC542;transform:translateY(-6px) scale(1.06);' +
    'box-shadow:0 8px 12px -4px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.55)}' +
  /* every animated thing lives behind the motion preference — reduced gets the plain state */
  '@media (prefers-reduced-motion:no-preference){' +
    '#scr-party .km-c.new{animation:kmDrop .3s cubic-bezier(.25,.9,.3,1) both}' +
    '#scr-party .km-tile{transition:transform .16s cubic-bezier(.34,1.56,.64,1),box-shadow .16s var(--ease,ease)}' +
    '#scr-party .km-tile:active{transform:translateY(1px) scale(.96)}' +
    '#scr-party .km-seat.on{animation:kmPulse 1.8s ease-in-out infinite}' +
  '}' +
  '#scr-party .km-tile .km-v{position:absolute;right:3px;bottom:1px;font-size:10px;opacity:.75}' +
  '#scr-party .km-tile.blank{color:#8a7a55}' +
  '#scr-party .km-acts{display:flex;gap:6px;justify-content:center;margin:4px 6px 8px;flex-wrap:wrap}' +
  '#scr-party .km-act{min-height:40px;padding:0 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);' +
    'background:rgba(255,255,255,.06);color:#e8e0ff;font-family:inherit;font-weight:700;font-size:13px}' +
  '#scr-party .km-act.go{background:rgba(61,220,132,.2);border-color:rgba(61,220,132,.55);color:#CFF7E0}' +
  '#scr-party .km-act:disabled{opacity:.35}' +
  '#scr-party .km-hint{text-align:center;font-size:12.5px;color:#9a90b8;min-height:16px;margin:0 10px}' +
  '#scr-party .km-menu .blurb{color:#b9b0d4;font-size:14px;line-height:1.5;margin:10px 0 16px}' +
  '#scr-party .km-load{display:grid;place-items:center;padding:40px;color:#b9b0d4}';
  document.head.appendChild(s);
}

/* ═════════════ paint ═════════════ */
function paint(){
  if (!M || !UI) return;
  const st = M.st;
  /* seats */
  let chips = '';
  for (let i = 0; i < M.seats; i++){
    const c = seatColour(i);
    chips += '<span class="km-seat' + (st.turn === i && !st.done ? ' on' : '') + '" style="--kc:' + c.hex + '">' +
      '<span class="km-f">' + chipFace(i) + '</span><b>' + esc(seatName(i)) + '</b>' +
      '<span class="km-sc">' + (st.scores[i] | 0) + '</span></span>';
  }
  UI.top.innerHTML = chips;
  /* board */
  let cells = '';
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++){
    const prem = E.premAt(r, c);
    const tile = E.cellAt(st, r, c);
    const pend = M.pending.find(p => p.r === r && p.c === c);
    let cls = 'km-c', body = '';
    if (tile){ cls += ' tile'; body = esc(tile.ch.toUpperCase()) + (tile.blank ? '' : '<span class="km-v">' + E.valueOf(tile.ch) + '</span>'); }
    else if (pend){ cls += ' tile new'; body = esc(pend.ch.toUpperCase()) + (pend.blank ? '' : '<span class="km-v">' + E.valueOf(pend.ch) + '</span>'); }
    else {
      if (prem === 'd') cls += ' d'; else if (prem === 't') cls += ' t';
      else if (prem === 'D') cls += ' D'; else if (prem === 'T') cls += ' T';
      else if (prem === '*') cls += ' star';
      const lbl = prem === 'd' ? '2L' : prem === 't' ? '3L' : prem === 'D' ? '2W' : prem === 'T' ? '3W' : prem === '*' ? '★' : '';
      if (lbl) body = '<span class="km-pl">' + lbl + '</span>';
      if (M.sel >= 0) cls += ' aim';
    }
    cells += '<div class="' + cls + '" data-r="' + r + '" data-c="' + c + '">' + body + '</div>';
  }
  UI.board.innerHTML = cells;
  UI.board.querySelectorAll('.km-c').forEach(el => el.onclick = () => tapCell(el.getAttribute('data-r') | 0, el.getAttribute('data-c') | 0));
  /* rack */
  const rack = rackView();
  let tiles = '';
  for (let i = 0; i < rack.length; i++){
    const ch = rack[i]; const blank = ch === '_';
    tiles += '<div class="km-tile' + (M.sel === i ? ' sel' : '') + (blank ? ' blank' : '') + '" data-i="' + i + '">' +
      (blank ? '?' : esc(ch.toUpperCase())) + (blank ? '' : '<span class="km-v">' + E.valueOf(ch) + '</span>') + '</div>';
  }
  UI.rack.innerHTML = tiles;
  UI.rack.querySelectorAll('.km-tile').forEach(el => el.onclick = () => tapRack(el.getAttribute('data-i') | 0));
  /* actions */
  const canPlay = M.pending.length > 0 && !st.done && isLocal(st.turn);
  UI.acts.innerHTML =
    '<button class="km-act go" id="km-play"' + (canPlay ? '' : ' disabled') + '>' + esc(T('Play','Lgħab')) + '</button>' +
    '<button class="km-act" id="km-recall"' + (M.pending.length ? '' : ' disabled') + '>' + esc(T('Recall','Ġib lura')) + '</button>' +
    '<button class="km-act" id="km-shuffle">' + esc(T('Shuffle','Ħawwad')) + '</button>' +
    '<button class="km-act" id="km-pass">' + esc(T('Pass','Aqbeż')) + '</button>';
  UI.acts.querySelector('#km-play').onclick = playMove;
  UI.acts.querySelector('#km-recall').onclick = recallAll;
  UI.acts.querySelector('#km-shuffle').onclick = shuffleRack;
  UI.acts.querySelector('#km-pass').onclick = passTurn;
  /* hint */
  UI.hint.textContent = hintText();
}
function hintText(){
  const st = M.st;
  if (held()) return '';                  /* the theatre is speaking */
  if (st.done) return seatName(st.done.winner) + ' ' + T('wins!','jirbaħ!');
  if (!isLocal(st.turn)) return seatName(st.turn) + ' — ' + T('thinking…','qed jaħseb…');
  if (M.pending.length){ const prov = provisional(); return T('Score: ','Punti: ') + (prov == null ? '—' : prov); }
  if (M.sel >= 0) return T('Tap a square to place it.','Għafas kaxxa biex tqiegħdha.');
  return T('Tap a tile, then a square.','Għafas biċċa, imbagħad kaxxa.');
}
function provisional(){
  if (!M.pending.length) return null;
  const res = E.tryMove(M.st, M.st.turn, M.pending.map(p => ({ r:p.r, c:p.c, ch:p.ch, blank:p.blank })), () => true);
  return res.ok ? res.score : null;
}
function chipFace(i){
  try { const XP = window.KARTI_XP; if (!XP || !XP.avatarHTML) return '';
    if (isLocal(i)) return XP.avatarHTML(seatName(i), { size:22, me: ownerOf(i) === 'me' });
    return XP.avatarHTML(seatName(i), { size:22 });
  } catch(e){ return ''; }
}

/* ═════════════ interaction ═════════════ */
/* a short input hold while the play-theatre lands (time-based, never a flag:
   if a timer dies the hold simply expires and input resumes on its own). */
function held(){ return !!(M && M.holdUntil && Date.now() < M.holdUntil); }
/* the wooden click, with a little pitch variance so ten drops don't sound
   like one sample on a loop. Clock-derived, no Math.random needed. */
function clickRate(){ return 0.96 + ((Date.now() % 5) * 0.025); }
function tapRack(i){
  if (held() || !isLocal(M.st.turn) || M.st.done) return;
  const was = M.sel === i;
  M.sel = was ? -1 : i;
  cue(was ? 'ui.tap' : 'move.select', { gain:0.45 }); buzz('tick'); paint();
}
function tapCell(r, c){
  if (held() || !isLocal(M.st.turn) || M.st.done) return;
  const pend = M.pending.find(p => p.r === r && p.c === c);
  if (pend){ /* recall this pending tile */
    M.pending = M.pending.filter(p => p !== pend); M.sel = -1; cue('ui.back', { gain:0.4 }); paint(); return;
  }
  if (E.cellAt(M.st, r, c)) return;      /* occupied by a committed tile   */
  if (M.sel < 0) return;
  const rack = rackView(); const ch = rack[M.sel];
  if (ch == null) { M.sel = -1; return; }
  if (ch === '_'){ pickBlank(r, c); return; }
  M.pending.push({ r, c, ch, blank:false });
  M.sel = -1; note(6, 0.35); cue('piece.place', { gain:0.5, rate:clickRate() }); buzz('tick'); paint();
}
function pickBlank(r, c){
  /* a small letter picker for the blank */
  const el = P.ui.screenEl ? M.ctx.root : null;
  const host = M.ctx && M.ctx.root ? M.ctx.root : document.body;
  const sheet = document.createElement('div');
  sheet.style.cssText = 'position:fixed;inset:0;z-index:60;background:rgba(6,6,14,.72);display:grid;place-items:center';
  let grid = '<div style="background:#171226;border-radius:16px;padding:16px;max-width:340px">' +
    '<p style="color:#fff;text-align:center;margin:0 0 10px;font-weight:700">' + esc(T('Blank — pick a letter','Vojta — agħżel ittra')) + '</p>' +
    '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">';
  for (let i = 0; i < E.NLET; i++){
    grid += '<button data-l="' + i + '" style="min-height:38px;border-radius:8px;border:0;background:#2a2145;color:#fff;font-weight:800;font-size:16px">' + esc(E.letOf(i).toUpperCase()) + '</button>';
  }
  grid += '</div></div>';
  sheet.innerHTML = grid;
  sheet.onclick = ev => { if (ev.target === sheet){ sheet.remove(); } };
  sheet.querySelectorAll('[data-l]').forEach(b => b.onclick = () => {
    const ch = E.letOf(b.getAttribute('data-l') | 0);
    M.pending.push({ r, c, ch, blank:true }); M.sel = -1;
    sheet.remove(); note(6, 0.35); cue('piece.place', { gain:0.5, rate:clickRate() }); buzz('tick'); paint();
  });
  (host || document.body).appendChild(sheet);
}
function recallAll(){ if (held()) return; M.pending = []; M.sel = -1; cue('ui.back', { gain:0.4 }); paint(); }
function shuffleRack(){ /* cosmetic: reorder the underlying rack */
  if (held()) return;
  const rack = M.st.racks[M.st.turn];
  E.shuffle(rack, (Date.now() & 0xffff) | 1); M.sel = -1; cue('card.shuffle', { gain:0.5 }); paint();
}
function passTurn(){
  if (held() || !isLocal(M.st.turn) || M.st.done) return;
  if (M.net) return passOnline();
  M.pending = []; M.sel = -1;
  E.passOrSwap(M.st, M.st.turn, null);
  cue('ui.back', { gain:0.5 }); afterTurn(null);
}
function playMove(){
  if (held()) return;
  if (!M.pending.length || M.st.done) return;
  if (M.net) return playOnline();
  const seat = M.st.turn;
  const placed = M.pending.map(p => ({ r:p.r, c:p.c, ch:p.ch, blank:p.blank }));
  const res = E.apply(M.st, seat, placed, isWord);
  if (!res.ok){ badMoveToast(res); cue('ui.error', { gain:0.5 }); buzz('no'); return; }
  M.pending = []; M.sel = -1;
  cue('piece.place', { gain:0.6, rate:clickRate() }, true);     /* the word locks with a thunk */
  /* HIS word, committed — but not when it also ends the match: `win` lands
     inside the same frame and sfx.js merges two buzzes under 40 ms apart,
     so the long one would be the one dropped. */
  if (!M.st.done) buzz('tap');
  afterTurn({ placed, score:res.score, seat });
}
/* fx = {placed, score, seat} for a committed play, null otherwise. Render
   FIRST (state is truth), then decorate; the follow-on (handover / finish /
   the bot) waits just long enough for the theatre to land. */
function afterTurn(fx){
  const wait = (fx && fx.score > 0 && !reduced()) ? 1150 : 0;
  const toHandover = !M.st.done && M.mode === 'pnp' && isLocal(M.st.turn);
  /* the hold is set BEFORE the paint so rackView hides the next player's
     tiles from the very first frame of the theatre */
  if (wait && (toHandover || M.st.done)) M.holdUntil = Date.now() + wait;
  paint();
  if (fx) theatre(fx.placed, fx.score, fx.seat);
  if (M.st.done){
    if (wait) setTimeout(() => { if (M && !M.dead) finish(); }, wait + 150);
    else finish();
    return;
  }
  if (toHandover){
    if (wait) setTimeout(() => { if (M && !M.dead && !M.st.done && UI) handover(); }, wait);
    else handover();
    return;
  }
  maybeBot();
}

/* ═════════════ the theatre — how a committed play LANDS ═════════════
   Called AFTER paint(): the board already shows the final state, so any
   interrupt (another paint) simply snaps forward — nothing here gates
   state. Decorates ONLY the changed cells (≤7), one flying score clone
   and one seat chip — never the 225. Under reduced motion: no clones,
   no animation, sound feedback only. Plays identically for YOUR move,
   the BOT's move, and a REMOTE player's move. */
let flies = 0;
function theatre(placed, score, seat){
  if (!M || !UI || !placed || !placed.length) return;
  const bingo = placed.length === E.RACK;
  if (reduced()){
    note(Math.min(12, 5 + Math.floor((score | 0) / 6)), 0.55);
    if (bingo) cue('game.win', { gain:0.7 }, true);
    else if (score >= 30) cue('ui.reward', { gain:0.55 }, true);
    return;
  }
  const cells = [];
  for (const p of placed){
    const el = UI.board.querySelector('.km-c[data-r="' + p.r + '"][data-c="' + p.c + '"]');
    if (el) cells.push({ el, p });
  }
  if (!cells.length) return;
  cells.sort((a, b) => (a.p.r - b.p.r) || (a.p.c - b.p.c));
  cells.forEach((x, k) => {
    x.el.style.animation = 'kmSettle .32s cubic-bezier(.34,1.56,.64,1) ' + (k * 60) + 'ms both';
    const prem = E.premAt(x.p.r, x.p.c);
    if (prem && prem !== '.'){            /* flash the premium colour it covers */
      const f = document.createElement('span');
      f.className = 'km-flash km-f-' + (prem === '*' ? 's' : prem);
      f.style.animationDelay = (k * 60 + 110) + 'ms';
      x.el.appendChild(f);
      setTimeout(() => { try { f.remove(); } catch(e){} }, k * 60 + 1000);
    }
    setTimeout(() => { if (M && !M.dead) note(4 + k, 0.5); }, k * 60);   /* a climbing note per tile */
  });
  if (bingo){
    cue('game.win', { gain:0.7 }, true);
    try { UI.board.animate([{ transform:'scale(1)' }, { transform:'scale(1.015)' }, { transform:'scale(1)' }],
      { duration:420, easing:'ease-out' }); } catch(e){}
  }
  else if (score >= 30) setTimeout(() => { if (M && !M.dead) cue('ui.reward', { gain:0.55 }, true); }, 260);
  flyScore(cells, score | 0, seat, bingo);
}
function flyScore(cells, score, seat, big){
  if (!(score > 0) || flies > 2) return;
  let x = 0, y = 0;
  for (const c of cells){ const r = c.el.getBoundingClientRect(); x += r.left + r.width / 2; y += r.top + r.height / 2; }
  x /= cells.length; y /= cells.length;
  const chipEl = () => { try { const chip = UI && UI.top.children[seat]; return chip ? (chip.querySelector('.km-sc') || chip) : null; } catch(e){ return null; } };
  const t0 = chipEl(); if (!t0) return;
  const tr = t0.getBoundingClientRect();
  const dx = (tr.left + tr.width / 2) - x, dy = (tr.top + tr.height / 2) - y;
  const fly = document.createElement('div');
  fly.className = 'km-fly' + (big || score >= 30 ? ' big' : '');
  fly.textContent = '+' + score;
  fly.style.left = x + 'px'; fly.style.top = y + 'px';
  document.body.appendChild(fly); flies++;
  const done = () => {
    if (!fly.parentNode) return;
    flies--; try { fly.remove(); } catch(e){}
    const c2 = chipEl();                  /* re-query: paints may have rebuilt the chips */
    if (c2){ try { c2.animate([{ transform:'scale(1)' }, { transform:'scale(1.5)' }, { transform:'scale(1)' }],
      { duration:300, easing:'cubic-bezier(.34,1.56,.64,1)' }); } catch(e){} }
    cue('ui.coin', { gain:0.45 });
  };
  try {
    const an = fly.animate([
      { transform:'translate(-50%,-50%) translate(0,6px) scale(.5)', opacity:0 },
      { transform:'translate(-50%,-50%) translate(0,-16px) scale(1.18)', opacity:1, offset:0.28 },
      { transform:'translate(-50%,-50%) translate(0,-22px) scale(1)', opacity:1, offset:0.5 },
      { transform:'translate(-50%,-50%) translate(' + dx + 'px,' + dy + 'px) scale(.35)', opacity:0.9, offset:0.96 },
      { transform:'translate(-50%,-50%) translate(' + dx + 'px,' + dy + 'px) scale(.3)', opacity:0 }
    ], { duration:950, easing:'cubic-bezier(.45,0,.25,1)' });
    an.onfinish = done;
  } catch(e){}
  setTimeout(done, 1300);                 /* belt and braces — never leak a clone */
}

/* pass-the-phone handover screen so the next player doesn't see the last rack */
function handover(){
  const host = M.ctx && M.ctx.root ? M.ctx.root : document.body;
  const sheet = document.createElement('div');
  sheet.style.cssText = 'position:fixed;inset:0;z-index:60;background:#100b20;display:grid;place-items:center;text-align:center;padding:24px';
  sheet.innerHTML = '<div><p style="color:#9a90b8;margin:0 0 6px">' + esc(T('Pass the phone to','Għaddi t-telefon lil')) + '</p>' +
    '<h2 style="color:#fff;margin:0 0 18px">' + esc(seatName(M.st.turn)) + '</h2>' +
    '<button class="btn primary" id="km-ho" style="min-width:180px">' + esc(T("I'm ready",'Lest')) + '</button></div>';
  sheet.querySelector('#km-ho').onclick = () => { sheet.remove(); paint(); };
  (host || document.body).appendChild(sheet);
}

/* ═════════════ a simple bot: find the best short play it can ═════════════ */
function maybeBot(){
  /* was `|| M.net`, i.e. an online table drove no machines at all — right for
     a table of people, wrong the moment somebody seats a bot: nobody moved
     it. The HOST drives them, exactly once. */
  if (!M || M.dead || M.st.done || (M.net && !M.isHost)) return;
  const seat = M.st.turn;
  if (ownerOf(seat) !== 'ai') return;
  stopBot();
  M.botT = setTimeout(() => {
    if (!M || M.dead || M.st.done || M.st.turn !== seat) return;
    const play = findBotPlay(seat);
    let fx = null;
    if (play){
      const res = E.apply(M.st, seat, play, isWord);
      if (res && res.ok){ cue('piece.place', { gain:0.5, rate:clickRate() }); fx = { placed:play, score:res.score, seat }; }
      else E.passOrSwap(M.st, seat, null);   /* should not happen — never leave the turn stuck */
    }
    else E.passOrSwap(M.st, seat, null);
    afterTurn(fx);
  }, reduced() ? 250 : 1100);
}
/* bounded search: try every rack permutation up to length 5 laid across an
   anchor in both directions; keep the highest-scoring legal play. Capped so
   a phone never stalls. Weak but honest — a v1 opponent. */
function findBotPlay(seat){
  const st = M.st, rack = st.racks[seat].filter(c => c !== '_');   /* bot ignores blanks for simplicity */
  const anchors = [];
  if (E.empty(st)) anchors.push({ r:7, c:7 });
  else for (let r = 0; r < N; r++) for (let c = 0; c < N; c++){
    if (E.cellAt(st, r, c)) continue;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) if (E.inB(r+dr,c+dc) && E.cellAt(st, r+dr, c+dc)){ anchors.push({ r, c }); break; }
  }
  let best = null, bestSc = 0, tries = 0;
  const words = candidateWords(rack);
  for (const a of anchors){
    for (const w of words){
      for (const [dr, dc] of [[0,1],[1,0]]){
        if (++tries > 6000) return best;   /* hard cap */
        const placed = layWord(st, a.r, a.c, dr, dc, w);
        if (!placed) continue;
        const res = E.tryMove(st, seat, placed, isWord);
        if (res.ok && res.score > bestSc){ bestSc = res.score; best = placed; }
      }
    }
  }
  return best;
}
/* small set of candidate words the bot can spell from its rack (subsets of
   2..5 letters that ARE in the dictionary). Cheap: check membership, not
   permute everything. */
function candidateWords(rack){
  const out = [], seen = new Set();
  const perm = (pool, cur) => {
    if (cur.length >= 2 && cur.length <= 5){ const s = cur.join(''); if (!seen.has(s) && isWord(s)){ seen.add(s); out.push(cur.slice()); } }
    if (cur.length >= 5) return;
    for (let i = 0; i < pool.length; i++){ const np = pool.slice(); const ch = np.splice(i,1)[0]; cur.push(ch); perm(np, cur); cur.pop(); }
  };
  perm(rack, []);
  return out.slice(0, 40);               /* cap the breadth */
}
/* lay word `w` (array of chars) starting at (r,c) in (dr,dc); returns the
   list of tiles that would be NEWLY placed on empty cells, or null if it
   collides badly / runs off board / places zero new tiles. */
function layWord(st, r, c, dr, dc, w){
  const placed = [];
  let rr = r, cc = c;
  for (let k = 0; k < w.length; k++){
    if (!E.inB(rr, cc)) return null;
    const ex = E.cellAt(st, rr, cc);
    if (ex){ if (ex.ch !== w[k]) return null; }   /* must match an existing tile */
    else placed.push({ r:rr, c:cc, ch:w[k], blank:false });
    rr += dr; cc += dc;
  }
  return placed.length ? placed : null;
}

/* ═════════════ end ═════════════ */
function finish(forced){
  if (!M || M.finished) return;
  M.finished = true; stopBot();
  cue('game.win', { gain:0.95 }, true);
  const me = firstLocalSeat();
  const scores = M.st.scores;
  let top = 0; for (let i = 1; i < M.seats; i++) if (scores[i] > scores[top]) top = i;
  const iWon = me >= 0 && scores[me] === scores[top];
  if (iWon) buzz('win');            /* the one long buzz, once, and only his */
  if (!M.net && !M.recorded){ M.recorded = true; if (iWon) ST.rec.w++; else if (me >= 0) ST.rec.l++; persist(); }
  const order = []; for (let i = 0; i < M.seats; i++) order.push(i);
  order.sort((a, b) => scores[b] - scores[a]);
  let place = 0, lastSc = null;
  const rows = order.map((seat, i) => {
    if (lastSc === null || scores[seat] < lastSc){ place = i + 1; lastSc = scores[seat]; }
    return { name: isLocal(seat) ? T('You','Int') : seatName(seat), place, you: isLocal(seat),
      bot: ownerOf(seat) === 'ai', score: scores[seat] + ' ' + T('pts','pt'), border: seatColour(seat).id };
  });
  const title = iWon ? T('Best words win!','L-aħjar kliem jirbaħ!') : (me >= 0) ? T('Out-worded','Mgħottija') : seatName(top) + ' ' + T('wins','jirbaħ');
  const show = window.KARTI_REBBIEH && window.KARTI_REBBIEH.show;
  const mid = 'kelma:' + (M.net ? 'net' : 'local') + ':' + M.st.moves;
  let pay = null;
  if (me >= 0 && window.KARTI_XP && KARTI_XP.awardPlay){
    try { const r = KARTI_XP.awardPlay({ game:'kelma', won: iWon, draw:false, id: mid, ranked:false }); if (r && r.counted) pay = r; } catch(e){}
  }
  try { if (me >= 0 && window.KARTI_STATS && KARTI_STATS.record) KARTI_STATS.record('kelma', { result: iWon ? 'win':'loss', id: mid }); } catch(e){}
  if (!show){ P.ui.result(M.ctx, { tone: iWon ? 'win':'lose', head:title,
    why:T('Highest score takes it.','L-ogħla skor jirbaħ.'),
    buttons:[{ label:T('Play again',"Erġa' lgħab"), icon:'refresh', cls:'primary', go:()=>{ leave(); setupSheet(); } },
      { label:T('Leave','Oħroġ'), icon:'back', cls:'ghost', go:()=>{ leave(); P.hub(); } }] }); return; }
  show({ title, subtitle:T('Final score','L-iskor finali'), rows, reduced:reduced(),
    lang:(window.KARTI_LANG?KARTI_LANG.lang():'en'),
    xp: pay ? { level:pay.level, gained:pay.xp, leveledUp:!!pay.levelled, before:0, after: pay.levelled?1:0.7 } : null,
    reward: pay ? { xp:pay.xp, chips:(pay.chips|0)+(pay.chipsLevel|0), wonBonus:pay.wonBonus } : undefined,
    sound: id => cue(id, {}, true),
    playAgainLabel:T('Play again',"Erġa' lgħab"),
    onPlayAgain:()=>{ leave(); setupSheet(); }, onLeave:()=>{ leave(); P.hub(); } });
}
function firstLocalSeat(){ for (let i = 0; i < seatCount(); i++) if (isLocal(i)) return i; return -1; }
function leave(){ stopBot(); if (M) M.dead = true; M = null; UI = null; }

/* ═════════════ the frame ═════════════ */
function openBoard(onBack){
  injectCSS(); P.show();
  M.ctx = P.ui.frame({ title:T('Kelma','Kelma'), onBack, leave:()=>leave(),
    buttons:[ { id:'km-rules', label:T('Rules','Regoli'), icon:'book', cls:'ghost' } ] });
  if (M.ctx.stopFit) M.ctx.stopFit();
  /* who you are playing beats how the bytes arrive: a machine at the table is
     named by its difficulty even when a wire is involved, which is what a
     Story level is. It used to read "Online" there — true of the plumbing,
     meaningless to the player. */
  M.ctx.badge.textContent = (M.meta || []).some(m => m && m.own === 'ai') ? levelName(M.lvl)
    : M.net ? T('Online','Onlajn')
    : M.mode === 'pnp' ? T('Pass & play','Għaddi u lgħab') : levelName(M.lvl);
  const b = M.ctx.board;
  /* Kelma never puts anything in the frame's two capture rails, and 36px of
     empty rail is 36px the board + rack + buttons do not get. Measured at
     360x640: without this the column ran 22px past .pt-host, whose
     overflow:hidden then ate the bottom of the action row. */
  if (M.ctx.railTop) M.ctx.railTop.style.display = 'none';
  if (M.ctx.railBot) M.ctx.railBot.style.display = 'none';
  b.style.cssText = 'display:block;grid-template-columns:none;grid-template-rows:none;width:100%;max-width:560px;border:0;box-shadow:none;overflow:visible;background:transparent';
  b.innerHTML = '<div class="km-wrap"><div class="km-top"></div><div class="km-board"></div>' +
    '<div class="km-hint"></div><div class="km-rack"></div><div class="km-acts"></div></div>';
  UI = { top:b.querySelector('.km-top'), board:b.querySelector('.km-board'),
         rack:b.querySelector('.km-rack'), acts:b.querySelector('.km-acts'), hint:b.querySelector('.km-hint') };
  const btn = M.ctx.btn ? M.ctx.btn('km-rules') : null;
  if (btn) btn.onclick = () => { P.ui.confirm ? P.ui.confirm({ title:T('Kelma — the rules','Kelma — ir-regoli'), body:rulesFor().join('<br><br>'), yes:T('Got it','Fhimt'), no:'' }) : 0; };
  paint();
  if (!isLocal(M.st.turn)) maybeBot();
}
function rulesFor(){
  return [
    T('Make words from your seven tiles on the board — across or down. The first word crosses the centre star.',
      'Agħmel kliem mis-seba’ biċċiet tiegħek fuq it-tabellun — bil-wisa’ jew ’l isfel. L-ewwel kelma taqsam l-istilla taċ-ċentru.'),
    T('Every new word must be real (Maltese or English). Coloured squares multiply a letter (2L/3L) or the whole word (2W/3W).',
      'Kull kelma ġdida trid tkun vera (bil-Malti jew bl-Ingliż). Kaxxi kkuluriti jimmultiplikaw ittra (2L/3L) jew il-kelma kollha (2W/3W).'),
    T('Use all seven in one go for a <b>+50</b> bonus. Most points when the tiles run out wins.',
      'Uża s-seba’ f’daqqa għal <b>+50</b> bonus. L-aktar punti meta jispiċċaw il-biċċiet jirbaħ.')
  ];
}

/* ═════════════ menus ═════════════ */
function canGoOnline(){ try { return !!(window.KARTI_MP && KARTI_MP.openFor && P.online && P.online.kelma && P.online.kelma.start); } catch(e){ return false; } }
function setupSheet(){
  injectCSS(); P.show(); stopBot(); M = null; UI = null;
  loadDict();                            /* warm the dictionary early      */
  const el = P.ui.screenEl();
  const online = canGoOnline();
  el.innerHTML =
    '<div class="pt-wrap km-menu"><div class="tbar">' +
      '<button class="iconbtn" id="km-back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + esc(T('Kelma','Kelma')) + '</h2></div>' +
    '<div class="scroll">' +
      '<p class="blurb">' + T('Build words from your tiles for points — Maltese or English. Land the coloured squares, use all seven for a bonus.',
        'Ibni kliem mill-biċċiet tiegħek għall-punti — bil-Malti jew bl-Ingliż. Aħbat il-kaxxi kkuluriti, uża s-seba’ għal bonus.') + '</p>' +
      '<p class="pt-ledger" style="margin:0 0 6px">' + esc(T('Words that count:','Kliem li jgħoddu:')) + '</p>' +
      '<div style="display:flex;gap:6px;margin:0 0 14px">' +
        ['both','en','mt'].map(l => '<button class="btn' + (pref().lang === l ? ' primary' : ' ghost') + '" data-lang="' + l + '" style="flex:1;min-height:38px">' + esc(langLabel(l)) + '</button>').join('') +
      '</div>' +
      '<div style="display:grid;gap:9px;margin-top:4px">' +
        (online ? '<button class="btn primary" id="km-online">' + ico('users') + ' ' + esc(T('Play online','Ilgħab onlajn')) + '</button>' : '') +
        '<button class="btn' + (online ? ' ghost' : ' primary') + '" id="km-ai">' + ico('coach') + ' ' + esc(T('Play with the machine','Ilgħab mal-magna')) + '</button>' +
        '<button class="btn ghost" id="km-pnp">' + ico('users') + ' ' + esc(T('Pass the phone','Għaddi t-telefon')) + '</button>' +
        '<button class="btn ghost" id="km-rulesbtn">' + ico('book') + ' ' + esc(T('How to play','Kif tilgħab')) + '</button>' +
      '</div>' +
      (ST.rec.w + ST.rec.l ? '<p class="pt-ledger" style="margin-top:14px">' +
        T('So far: <b>'+ST.rec.w+'</b> won, <b>'+ST.rec.l+'</b> lost.','S’issa: <b>'+ST.rec.w+'</b> rebħin, <b>'+ST.rec.l+'</b> mitlufin.') + '</p>' : '') +
    '</div></div>';
  el.querySelector('#km-back').onclick = () => { cue('ui.back'); P.hub(); };
  el.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { pref({ lang: b.getAttribute('data-lang') }); cue('ui.tap', { gain:0.5 }); setupSheet(); });
  const on = el.querySelector('#km-online'); if (on) on.onclick = () => { if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('kelma'); };
  el.querySelector('#km-ai').onclick = () => startOffline('ai', 2);
  el.querySelector('#km-pnp').onclick = () => seatPick();
  el.querySelector('#km-rulesbtn').onclick = () => { P.ui.confirm ? P.ui.confirm({ title:T('Kelma — the rules','Kelma — ir-regoli'), body:rulesFor().join('<br><br>'), yes:T('Got it','Fhimt'), no:'' }) : 0; };
}
function seatPick(){
  const el = P.ui.screenEl(); let seats = 2;
  const paintP = () => {
    el.innerHTML = '<div class="pt-wrap km-menu"><div class="tbar">' +
      '<button class="iconbtn" id="km-b2"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + esc(T('Pass the phone','Għaddi t-telefon')) + '</h2></div><div class="scroll">' +
      '<p class="blurb">' + esc(T('How many players?','Kemm-il plejer?')) + '</p>' +
      '<div style="display:flex;gap:9px;margin:4px 0 16px">' + [2,3,4].map(n=>'<button class="btn'+(n===seats?' primary':' ghost')+'" data-n="'+n+'" style="flex:1">'+n+'</button>').join('') + '</div>' +
      '<button class="btn primary" id="km-go" style="width:100%">' + esc(T('Start','Ibda')) + '</button></div></div>';
    el.querySelector('#km-b2').onclick = () => setupSheet();
    el.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>{ seats=b.getAttribute('data-n')|0; paintP(); });
    el.querySelector('#km-go').onclick = () => startOffline('pnp', seats);
  };
  paintP();
}
function startOffline(mode, seats){
  onDict(() => {
    startMatch({ seats, mode }, newSeedNow());
    M.meta = [];
    for (let i = 0; i < seats; i++){
      if (mode === 'ai') M.meta.push({ own: i === 0 ? 'me' : 'ai', name: i === 0 ? myName() : levelName(pref().lvl || 2) });
      else M.meta.push({ own:'hot', name: seatTitle(i) });
    }
    openBoard(() => { leave(); setupSheet(); });
  });
  if (dictState !== 'ready') showLoading();
}
function newSeedNow(){ let s = 0; try { s = (Date.now() & 0x7fffffff); } catch(e){} return (s ^ 0x9e3779b9) >>> 0 || 1; }
function showLoading(){
  injectCSS(); P.show();
  const el = P.ui.screenEl();
  el.innerHTML = '<div class="pt-wrap"><div class="km-load">' + esc(T('Loading the dictionary…','Qed jinżel id-dizzjunarju…')) + '</div></div>';
}

/* ═════════════ ONLINE — private racks over the relay deal ═════════════
   The bag is dealt PRIVATELY: planDeal hands the relay the whole bag as a
   pool, the relay shuffles it with its own entropy and slices each seat a
   private pile nobody else sees (hooks.private). A seat's rack is the top
   seven of its pile; it draws the rest as it plays. The board and scores
   are lockstep — a play broadcasts its tiles (a flat int list that fits
   mp.js's move codec: r,c,l,b per tile, ≤7 tiles = 28 ≤ 32) plus the
   mover's remaining count, and every phone RE-SCORES from its identical
   board (placeRemote) — no rack needed, the mover already validated it.
   Moves arrive in turn order, so the mover is always M.st.turn. ═══════ */
function flatTiles(placed){ const k = []; for (const p of placed){ k.push(p.r, p.c, E.codeOf(p.ch), p.blank ? 1 : 0); } return k; }
function unflatTiles(k){ const out = []; for (let i = 0; i + 3 < k.length; i += 4){ const ch = E.letOf(k[i+2] | 0); if (ch && E.inB(k[i]|0, k[i+1]|0)) out.push({ r:k[i]|0, c:k[i+1]|0, ch, blank: !!k[i+3] }); } return out; }

function planDeal(opts){
  const seats = Math.max(2, Math.min(4, (opts && opts.seats) || 2));
  const items = E.buildBag().map(ch => E.codeOf(ch));   /* the bag as int codes */
  return { items, each: Math.floor(items.length / seats) };
}
function onlinePrivate(d){
  if (!M || !M.st) return;
  const codes = Array.isArray(d) ? d : (d && Array.isArray(d.d) ? d.d : []);
  const pile = codes.map(c => E.letOf(c | 0)).filter(Boolean);
  M.pile = pile.slice(E.RACK);
  M.st.racks[mySeat()] = pile.slice(0, E.RACK);
  M.remain[mySeat()] = M.st.racks[mySeat()].length + M.pile.length;
  M.dealt = true;
  paint();
}
function onlineStart(cfg){
  cfg = cfg || {};
  injectCSS(); P.show();
  const list = cfg.seats || [];
  const n = Math.max(2, Math.min(4, list.length || 2));
  startMatch({ seats:n, mode:'net' }, 1);
  M.st.racks = []; for (let i = 0; i < n; i++) M.st.racks.push([]);   /* only ours is filled, by the private deal */
  M.st.bag = [];
  M.pile = []; M.remain = new Array(n).fill(E.RACK); M.dealt = false;
  M.meta = [];
  /* A MACHINE CHAIR IS NOT A PERSON ON A WIRE. This read
       own: (i === cfg.you) ? 'me' : 'net'
     which meant a bot was filed as 'net' and nothing ever moved it —
     think() only drives a seat it believes is 'ai'. The same one-line
     mistake was in sqaq and il-forka. */
  for (let i = 0; i < n; i++){
    const s = list[i] || {};
    const own = (i === cfg.you) ? 'me'
              : (s.kind === 'cpu' || s.own === 'ai') ? 'ai'
              : 'net';
    M.meta.push({ own, name: s.name || seatTitle(i) });
    if (own === 'ai' && Number(s.level) > 0) M.lvl = Number(s.level);
  }
  M.net = cfg.net || null; M.net && (M.net.you = cfg.you);
  /* only the host runs the machines, or every client would run them */
  M.isHost = (cfg.you | 0) === (cfg.host | 0);
  onDict(() => { openBoard(() => { const nn = M && M.net; leave(); if (nn && nn.onLeave) nn.onLeave(); else P.hub(); }); });
  if (dictState !== 'ready') showLoading();
  return { v:1, gid:'kelma' };
}
/* a move from another chair (one param → raw payload; the mover is the
   seat whose turn it is, since moves arrive in order). */
function onlineRemote(d){
  if (!M || !M.st || M.st.done) return { ok:true };
  const m = (d && d.m) || d || {};
  const seat = M.st.turn;
  if (m.a === 'pass'){ E.passRemote(M.st, seat); M.remain[seat] = (m.n | 0); afterRemote(seat, 0, null); return { ok:true }; }
  const tiles = unflatTiles(Array.isArray(m.k) ? m.k : []);
  if (!tiles.length){ E.passRemote(M.st, seat); afterRemote(seat, 0, null); return { ok:true }; }
  const res = E.placeRemote(M.st, seat, tiles);
  if (!res.ok) return { ok:false, why:'A word did not fit here.' };
  M.remain[seat] = (m.n | 0);
  afterRemote(seat, res.score, tiles);
  return { ok:true };
}
/* an OPPONENT's move gets the same theatre as ours — settle, flash, fly. */
function afterRemote(seat, score, tiles){
  if (tiles && tiles.length) cue('piece.place', { gain:0.5, rate:clickRate() });
  paint();
  if (tiles && tiles.length) theatre(tiles, score | 0, seat);
  onlineEndCheck();
}
/* the local player's play, online: validate, lay, refill from OUR pile,
   score, advance, then broadcast the tiles + our remaining count. */
function playOnline(){
  const me = mySeat();
  if (M.st.turn !== me) return;
  const placed = M.pending.map(p => ({ r:p.r, c:p.c, ch:p.ch, blank:p.blank }));
  const res = E.tryMove(M.st, me, placed, isWord);
  if (!res.ok){ badMoveToast(res); cue('ui.error', { gain:0.5 }); buzz('no'); return; }
  for (const p of placed) M.st.board[p.r * N + p.c] = { ch:p.ch, blank:p.blank };
  M.st.racks[me] = E.useFromRack(M.st.racks[me], placed);
  while (M.st.racks[me].length < E.RACK && M.pile.length) M.st.racks[me].push(M.pile.shift());
  M.st.scores[me] += res.score;
  M.st.passes = 0; M.st.moves++;
  M.st.turn = E.nextLive(M.st, me);
  M.remain[me] = M.st.racks[me].length + M.pile.length;
  M.pending = []; M.sel = -1;
  cue('piece.place', { gain:0.6, rate:clickRate() }, true);
  buzz('tap');       /* HIS word, committed. Online the end is checked a
                        beat later (onlineEndCheck → 700 ms), so there is
                        no chance of this smearing over the `win`. */
  if (M.net) M.net.move('move', { a:'play', k: flatTiles(placed), n: M.remain[me] });
  paint();
  theatre(placed, res.score, me);
  onlineEndCheck();
}
function passOnline(){
  const me = mySeat();
  if (M.st.turn !== me) return;
  M.pending = []; M.sel = -1;
  M.st.passes++; M.st.moves++; M.st.turn = E.nextLive(M.st, me);
  if (M.net) M.net.move('move', { a:'pass', n: M.remain[me] });
  cue('ui.back', { gain:0.5 }); paint(); onlineEndCheck();
}
/* end: a seat empties (remaining 0), or everyone passes twice around */
function onlineEndCheck(){
  if (!M || M.st.done) return;
  const out = M.remain.some((v, i) => v <= 0 && M.st.moves > 0);
  const stalled = M.st.passes >= M.seats * 2;
  if (out || stalled){
    let win = 0; for (let i = 1; i < M.seats; i++) if (M.st.scores[i] > M.st.scores[win]) win = i;
    M.st.done = { winner: win, reason: out ? 'out' : 'stalled' };
    paint(); setTimeout(() => { if (M && !M.dead) finish(); }, 700);
  }
}
function badMoveToast(res){
  if (res.why === 'badword') toast('“' + (res.word || '').toUpperCase() + '” — ' + T('not a word','mhux kelma'));
  else if (res.why === 'centre') toast(T('First word crosses the centre.','L-ewwel kelma taqsam iċ-ċentru.'));
  else if (res.why === 'disconnected') toast(T('Must touch a tile already down.','Trid tmiss biċċa diġà mqiegħda.'));
  else if (res.why === 'gap') toast(T('No gaps in the word.','Ebda vojt fil-kelma.'));
  else if (res.why === 'notaline') toast(T('All in one line.','Kollha f’linja waħda.'));
  else toast(T('That move is not allowed.','Din il-mossa mhix permessa.'));
}

const hooks = {
  onMove(){ return () => {}; },          /* KELMA sends via net.move directly */
  phase(){ return M ? 'play' : 'idle'; },
  private(d){ onlinePrivate(d); },
  seatBack(){ if (M && UI) paint(); },
  seatGone(seat){ if (M && M.st){ E.dropSeat(M.st, seat | 0); if (M.remain) M.remain[seat|0] = 0; paint(); onlineEndCheck(); } },
  soleWin(){ if (M && !M.finished && M.net) finish(true); },
  live(){ return !!(M && !M.dead && M.st && !M.st.done); }
};
P.online = P.online || {};
P.online.kelma = {
  start: onlineStart,
  remote: onlineRemote,                  /* ONE param → raw payload */
  note(text, tone){ if (M && M.ctx) P.ui.setNet(M.ctx, text || '', tone || ''); },
  stop(why, tone){ if (M && M.ctx){ P.ui.setNet(M.ctx, '', ''); P.ui.result(M.ctx, { tone:'draw', head:T('Cut off','Inqata’'), why: why || T('The game stopped.','Il-logħba waqfet.'), buttons:[{ label:T('Back to the rooms','Lura fil-kmamar'), icon:'back', cls:'primary', go:()=>{ const n=M&&M.net; leave(); if(n&&n.onLeave)n.onLeave(); else P.hub(); } }] }); } },
  live: () => !!(M && !M.dead && M.st && !M.st.done),
  planDeal, hooks
};

/* ═════════════ lobby + shelf ═════════════ */
const LOBBY = {
  id:'kelma', name:'Kelma', mt:'Kelma', minSeats:E.MIN_SEATS, maxSeats:E.MAX_SEATS,
  levels: LEVELS.map(L => ({ level:L.level, name:L.name })), defaultLevel:2,
  isReady: seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu') ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(list){
    const n = (list || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why:T('Kelma needs at least two.','Kelma trid tal-anqas tnejn.') };
    if (n > E.MAX_SEATS) return { ok:false, why:T('Up to four can play.','Sa erbgħa jistgħu jilagħbu.') };
    const un = (list || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (un) return { ok:false, why: un + (un > 1 ? T(' people are not ready yet.',' persuni għadhom mhux lesti.') : T(' person is not ready yet.',' persuna għadha mhux lesta.')) };
    return { ok:true, why:'' };
  },
  rulesHTML: () => '<p>' + rulesFor().join('</p><p>') + '</p>',
  blurb: T('Words for points, Maltese or English.','Kliem għall-punti, bil-Malti jew bl-Ingliż.'),
  start(seats){ const n = Math.max(2, Math.min(4, (seats && seats.length) || 2)); onDict(() => { startMatch({ seats:n, mode:'pnp' }, newSeedNow()); M.meta = []; for (let i = 0; i < n; i++) M.meta.push({ own:'hot', name: seatTitle(i) }); openBoard(() => { leave(); setupSheet(); }); }); return { v:1, gid:'kelma' }; },
  myName, wire:{ fields:E.WIRE_FIELDS }, takeback:false
};
R.lobby = LOBBY;
const TILE = {
  id:'kelma', order:31, kind:'board', cat:'word', name:'Kelma', mt:'Kelma', icon:'book', status:'live',
  get tag(){ return T('Build words for points on an original board — Maltese or English, land the colours, use all seven for a bonus.',
    'Ibni kliem għall-punti fuq tabellun oriġinali — bil-Malti jew bl-Ingliż, aħbat il-kuluri, uża s-seba’ għal bonus.'); },
  open: () => setupSheet(), seats:{ min:E.MIN_SEATS, max:E.MAX_SEATS }, levels:LOBBY.levels,
  rulesHTML: () => LOBBY.rulesHTML(), start:(list)=>LOBBY.start(list)
};
R.shelfTile = TILE;
R.ui = { open:setupSheet, leave, injectCSS };
R.open = () => setupSheet(); R.close = () => { leave(); P.hub(); };
try { P.register(TILE); } catch(e){}

if (/[?&]kelmatest\b/.test(location.search || '')){
  window.__KELMA_TEST = {
    setupSheet, startOffline, startMatch, openBoard, paint, tapRack, tapCell, playMove,
    loadDict, get dictState(){ return dictState; }, isWord, theatre, reduced,
    get M(){ return M; }, get UI(){ return UI; }, engine:E, leave
  };
}

})();
